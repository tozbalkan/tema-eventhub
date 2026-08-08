import { PoolClient } from 'pg';
import { MockDataStore } from '@/repositories/mock/MockRepositories';
import { Sale, SaleLine } from '@/types/sale';
import { CurrencyCode } from '@/types/money';
import { SalesChannel } from '@/types/sales-channel';
import { VenueService } from './VenueService';
import { IdGenerator } from '@/platform/IdGenerator';
import { SaleRecordedDomainEvent, DomainEventNames } from '@/domain/events/DomainEvents';
import { IdempotencyStore } from '@/platform/IdempotencyStore';
import { OutboxStore } from '@/platform/OutboxStore';
import { PgOutboxStore } from '@/platform/pg/PgOutboxStore';
import { OutboxPublisherWorker } from '@/platform/OutboxPublisherWorker';
import { bootstrapStageOpsApplication } from '@/application/Bootstrap';
import { VenueAssetProjection } from '@/operations/projections/VenueAssetProjection';

export interface ProcessExternalSaleConfirmationCommand {
  commandId?: string;
  organizationId?: string; // Tenant identity explicitly supplied by command payload
  reservationId?: string;
  eventId: string;
  assetId?: string;
  assetIds?: string[]; // Supports single or multi-asset reservations
  salesChannelId: string; // e.g. "biletix", "passo", "desk", "corporate"
  externalSaleReference: string; // e.g. "BTX-20260807-18291"
  purchaserName?: string;
  purchaserPhone?: string;
  purchaserEmail?: string;
  idempotencyKey?: string;
  correlationId?: string;
  traceId?: string;
  spanId?: string;
  pgClient?: PoolClient; // Optional PostgreSQL transaction client for UnitOfWork
}

export interface ProcessExternalSaleConfirmationResult {
  sale: Sale;
  event?: SaleRecordedDomainEvent;
  isDuplicateRecord: boolean;
}

/**
 * StageOps Application Use Case: Process External Sale Confirmation.
 * 
 * PostgreSQL Transaction Flow (Multi-Asset Deterministic Deadlock-Free Pattern):
 * 1. Command Idempotency Check (SELECT existing sale for channel + reference)
 * 2. Database-Authoritative Asset & Channel Validation (Query venue_asset_projections & sales_channels directly in PostgreSQL)
 * 3. Command-Supplied Tenant Identity (organizationId passed via command payload, persisted transactionally)
 * 4. Heterogeneous Asset Pricing & VAT-Exclusive Tax Calculation (Sum of base_price across all requested asset projections; 20% KDV on net base_price)
 * 5. Non-Aborting Sale Ownership Reservation FIRST (INSERT INTO sales ON CONFLICT DO NOTHING RETURNING id)
 *    - If duplicate detected: Return existing sale payload WITHOUT mutating asset projections (Zero Phantom Side-Effects!)
 *    - If conflict occurs but row is uncommitted/unavailable: Throw SALE_OWNERSHIP_CONFLICT to prevent un-owned sale fallthrough
 * 6. Deterministic Asset Lock Ordering (sortedAssetIds = Array.from(new Set(assetIds)).sort()) & Acquisition ONLY IF sale ownership was won!
 *    - Input array deduplicated to prevent duplicate line self-lock conflicts.
 *    - If any asset is already sold: Throw SEAT_ALREADY_RESERVED (triggers UnitOfWork ROLLBACK of step 5 sale insert)
 * 7. Persist Sale Lines & OutboxMessage in SAME PostgreSQL Transaction
 * 8. UnitOfWork commits cleanly without 23505 transaction abortion or deadlock hazards
 */
export class ProcessExternalSaleConfirmationUseCase {
  public static async execute(cmd: ProcessExternalSaleConfirmationCommand): Promise<ProcessExternalSaleConfirmationResult> {
    bootstrapStageOpsApplication();

    const idempotencyKey = cmd.idempotencyKey || cmd.externalSaleReference;
    const requestedAssetIds = cmd.assetIds && cmd.assetIds.length > 0 ? cmd.assetIds : [cmd.assetId || ''];

    // Deduplicate requested asset IDs for canonical lock ordering and line item processing
    const uniqueAssetIds = Array.from(new Set(requestedAssetIds));

    // PostgreSQL Transactional Execution Path (Database-Authoritative Asset & Channel State Mode)
    if (cmd.pgClient) {
      const client = cmd.pgClient;

      // 1. Command Idempotency Check (Check if sale already exists for channel + external reference)
      const existingSaleRes = await client.query(
        'SELECT * FROM sales WHERE sales_channel_id = $1 AND external_reference = $2',
        [cmd.salesChannelId, cmd.externalSaleReference]
      );

      if (existingSaleRes.rows.length > 0) {
        return this.reconstructDuplicateSaleResponse(client, existingSaleRes.rows[0], cmd);
      }

      // 2. Database-Authoritative Asset Validation: Query venue_asset_projections directly in PostgreSQL
      const assetProjections: Array<{ asset_id: string; name: string; category: string; status: string; base_price: number; currency: CurrencyCode }> = [];

      for (const currentAssetId of uniqueAssetIds) {
        const dbAssetRes = await client.query(
          'SELECT * FROM venue_asset_projections WHERE asset_id = $1',
          [currentAssetId]
        );

        if (dbAssetRes.rows.length === 0) {
          throw new Error(`Asset not found: ${currentAssetId}`);
        }

        const row = dbAssetRes.rows[0];
        const assetObj = {
          asset_id: row.asset_id,
          name: row.name,
          category: row.category || 'VIP',
          status: row.status,
          base_price: parseFloat(row.base_price || '0'),
          currency: 'TRY' as CurrencyCode,
        };

        if (assetObj.status === 'Sold') {
          const doubleCheckCommitted = await client.query(
            'SELECT * FROM sales WHERE sales_channel_id = $1 AND external_reference = $2',
            [cmd.salesChannelId, cmd.externalSaleReference]
          );
          if (doubleCheckCommitted.rows.length > 0) {
            return this.reconstructDuplicateSaleResponse(client, doubleCheckCommitted.rows[0], cmd);
          }
          throw new Error('SEAT_ALREADY_RESERVED: Asset is already sold.');
        }

        assetProjections.push(assetObj);
      }

      // 3. Database-Authoritative SalesChannel Metadata Lookup
      const channelRes = await client.query('SELECT * FROM sales_channels WHERE id = $1', [cmd.salesChannelId]);
      let channelName = cmd.salesChannelId;
      let commissionRate = 0.0;

      if (channelRes.rows.length > 0) {
        channelName = channelRes.rows[0].name;
        commissionRate = parseFloat(channelRes.rows[0].commission_percentage || '0') / 100;
      }

      const primaryAsset = assetProjections[0]!;
      const currency: CurrencyCode = primaryAsset.currency || 'TRY';

      // 4. Pricing & Tax Arithmetic (VAT-Exclusive Baseline: base_price + 20% KDV)
      const grossPrice = assetProjections.reduce((sum, p) => sum + p.base_price, 0);
      const totalTaxAmount = assetProjections.reduce((sum, p) => sum + p.base_price * 0.2, 0);
      const commissionPaid = grossPrice * commissionRate;
      const netRevenue = grossPrice - commissionPaid;

      // Command-Supplied Tenant Identity (explicitly supplied by command or application default)
      const organizationId = cmd.organizationId || 'org_stageops_01';

      const nowISO = new Date().toISOString();
      const commandId = cmd.commandId || IdGenerator.generateUUIDv7();
      const correlationId = cmd.correlationId || IdGenerator.generateUUIDv7();
      const saleId = IdGenerator.generateUUIDv7();

      const lines: SaleLine[] = uniqueAssetIds.map((aId) => {
        const aProj = assetProjections.find((p) => p.asset_id === aId) || primaryAsset;
        const linePrice = aProj.base_price;
        const lineCurrency: CurrencyCode = aProj.currency || currency;
        return {
          id: IdGenerator.generateUUIDv7(),
          saleId,
          itemType: 'VenueAsset' as const,
          venueAssetId: aId,
          quantity: 1,
          unitPrice: linePrice,
          discountAmount: 0,
          taxAmount: linePrice * 0.2,
          totalPrice: linePrice,
          currency: lineCurrency,
          exchangeRate: 1.0,
        };
      });

      const sale: Sale = {
        id: saleId,
        organizationId,
        eventId: cmd.eventId,
        reservationId: cmd.reservationId,
        salesChannelId: cmd.salesChannelId,
        externalReference: cmd.externalSaleReference,
        channel: { type: 'ExternalChannel', name: channelName, reference: cmd.externalSaleReference },
        purchaserSnapshot: {
          fullName: cmd.purchaserName || 'Unspecified Purchaser',
          phone: cmd.purchaserPhone || '',
          email: cmd.purchaserEmail || '',
        },
        saleDate: nowISO,
        grossPrice,
        commissionRate,
        commissionPaid,
        netRevenue,
        currency,
        exchangeRate: 1.0,
        exchangeRateSource: 'TCMB',
        accountingAmount: grossPrice,
        lines,
        revenueSplit: {
          organizerAmount: { minorUnits: BigInt(Math.round(netRevenue * 100)), currency, scale: 100 },
          platformCommission: { minorUnits: BigInt(Math.round(commissionPaid * 100)), currency, scale: 100 },
          gatewayFee: { minorUnits: BigInt(0), currency, scale: 100 },
          taxAmount: { minorUnits: BigInt(Math.round(totalTaxAmount * 100)), currency, scale: 100 },
        },
        status: 'Completed',
        notes: 'PostgreSQL sale record',
        version: 1,
        isArchived: false,
        createdAt: nowISO,
        updatedAt: nowISO,
      };

      // 5. Non-Aborting SQL Sale Ownership Reservation: ON CONFLICT DO NOTHING RETURNING id
      const saleQuery = `
        INSERT INTO sales (
          id, organization_id, event_id, reservation_id, sales_channel_id,
          external_reference, purchaser_name, purchaser_phone, purchaser_email,
          gross_price, commission_paid, net_revenue, currency, status, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
        ON CONFLICT (sales_channel_id, external_reference) DO NOTHING
        RETURNING id;
      `;
      const insertSaleRes = await client.query(saleQuery, [
        sale.id,
        sale.organizationId,
        sale.eventId,
        sale.reservationId,
        sale.salesChannelId,
        sale.externalReference,
        sale.purchaserSnapshot?.fullName,
        sale.purchaserSnapshot?.phone,
        sale.purchaserSnapshot?.email,
        sale.grossPrice,
        sale.commissionPaid,
        sale.netRevenue,
        sale.currency,
        sale.status,
        nowISO,
      ]);

      if (insertSaleRes.rows.length === 0) {
        const fetchExisting = await client.query(
          'SELECT * FROM sales WHERE sales_channel_id = $1 AND external_reference = $2',
          [cmd.salesChannelId, cmd.externalSaleReference]
        );
        if (fetchExisting.rows.length > 0) {
          return this.reconstructDuplicateSaleResponse(client, fetchExisting.rows[0], cmd);
        }
        throw new Error('SALE_OWNERSHIP_CONFLICT: Sale conflict detected but existing sale is unavailable.');
      }

      // 6. REAL Multi-Asset Deterministic Lock Ordering: Sort unique asset IDs deterministically BEFORE acquiring locks!
      const sortedAssetIds = [...uniqueAssetIds].sort();
      for (const assetIdToLock of sortedAssetIds) {
        const assetProj = assetProjections.find((p) => p.asset_id === assetIdToLock);
        const lockAssetQuery = `
          INSERT INTO venue_asset_projections (
            asset_id, name, category, status, occupancy_state, sale_id, reservation_id, pax_capacity, base_price, version, last_updated
          ) VALUES ($1, $2, $3, 'Sold', 'Occupied', $4, $5, 6, $6, 1, NOW())
          ON CONFLICT (asset_id) DO UPDATE SET
            status = 'Sold',
            occupancy_state = 'Occupied',
            sale_id = EXCLUDED.sale_id,
            version = venue_asset_projections.version + 1,
            last_updated = NOW()
          WHERE venue_asset_projections.status <> 'Sold';
        `;
        const lockRes = await client.query(lockAssetQuery, [
          assetIdToLock,
          assetProj?.name || 'Venue Asset',
          assetProj?.category || 'VIP',
          sale.id,
          sale.reservationId,
          assetProj?.base_price || 0,
        ]);
        if (lockRes.rowCount === 0) {
          throw new Error('SEAT_ALREADY_RESERVED: Asset is already sold.');
        }
      }

      // 7. INSERT Sale lines into PostgreSQL in SAME transaction
      for (const line of sale.lines) {
        const lineQuery = `
          INSERT INTO sale_lines (id, sale_id, venue_asset_id, quantity, unit_price, total_price)
          VALUES ($1, $2, $3, 1, $4, $4);
        `;
        await client.query(lineQuery, [line.id, sale.id, line.venueAssetId, line.unitPrice]);
      }

      // 8. INSERT OutboxMessage into PostgreSQL in SAME transaction
      const event: SaleRecordedDomainEvent = {
        eventName: DomainEventNames.SaleRecorded,
        header: {
          eventId: IdGenerator.generateUUIDv7(),
          eventVersion: 1,
          occurredAt: nowISO,
          correlationId,
          causationId: commandId,
          tenantId: sale.organizationId,
          traceId: cmd.traceId,
          spanId: cmd.spanId,
        },
        saleId: sale.id,
        eventId: sale.eventId,
      };

      await PgOutboxStore.addMessage(client, 'Sale', sale.id, event);

      return {
        sale,
        event,
        isDuplicateRecord: false,
      };
    }

    // In-Memory Execution Path (Equivalent multi-asset reservation behavior)
    const existingRecord = IdempotencyStore.getRecord(idempotencyKey);
    if (existingRecord && existingRecord.status === 'Completed' && existingRecord.responsePayload) {
      return existingRecord.responsePayload;
    }

    const lockAcquired = IdempotencyStore.tryAcquireLock(idempotencyKey);
    if (!lockAcquired) {
      const existingSale = MockDataStore.sales.find((s) => s.externalReference === cmd.externalSaleReference);
      if (existingSale) {
        return {
          sale: existingSale,
          isDuplicateRecord: true,
        };
      }
      throw new Error(`IDEMPOTENCY_LOCK_CONFLICT: Operation already in progress for key ${idempotencyKey}`);
    }

    try {
      const assets = uniqueAssetIds.map((aId) => {
        const a = VenueService.getAssetById(aId);
        if (!a) {
          IdempotencyStore.markFailed(idempotencyKey);
          throw new Error(`Asset not found: ${aId}`);
        }
        if (a.status === 'Sold') {
          IdempotencyStore.markFailed(idempotencyKey);
          throw new Error('SEAT_ALREADY_RESERVED: Asset is already sold.');
        }
        return a;
      });

      const defaultChannel: SalesChannel = {
        id: 'desk',
        name: 'Organizasyon Masası',
        commissionPercentage: 0.0,
        isArchived: false,
      };
      const channel = MockDataStore.salesChannels.find((c) => c.id === cmd.salesChannelId) ?? defaultChannel;
      const nowISO = new Date().toISOString();
      const grossPrice = assets.reduce((sum, a) => sum + a.pricing.basePrice, 0);
      const totalTax = assets.reduce((sum, a) => sum + a.pricing.basePrice * 0.2, 0);
      const commissionRate = channel.commissionPercentage / 100;
      const commissionPaid = grossPrice * commissionRate;
      const netRevenue = grossPrice - commissionPaid;
      const organizationId = cmd.organizationId || MockDataStore.organizationId;
      const primaryAsset = assets[0]!;

      const commandId = cmd.commandId || IdGenerator.generateUUIDv7();
      const correlationId = cmd.correlationId || IdGenerator.generateUUIDv7();
      const saleId = IdGenerator.generateUUIDv7();

      const lines: SaleLine[] = assets.map((a) => ({
        id: IdGenerator.generateUUIDv7(),
        saleId,
        itemType: 'VenueAsset' as const,
        venueAssetId: a.id,
        quantity: 1,
        unitPrice: a.pricing.basePrice,
        discountAmount: 0,
        taxAmount: a.pricing.basePrice * 0.2,
        totalPrice: a.pricing.basePrice,
        currency: a.pricing.currency as CurrencyCode,
        exchangeRate: 1.0,
      }));

      const sale: Sale = {
        id: saleId,
        organizationId,
        eventId: cmd.eventId,
        reservationId: cmd.reservationId,
        salesChannelId: cmd.salesChannelId,
        externalReference: cmd.externalSaleReference,
        externalConfirmation: {
          salesChannelId: cmd.salesChannelId,
          externalReference: idempotencyKey,
          confirmedAt: nowISO,
        },
        channel: {
          type: 'ExternalChannel',
          name: channel.name,
          reference: cmd.externalSaleReference,
        },
        purchaserSnapshot: {
          fullName: cmd.purchaserName || 'Unspecified Purchaser',
          phone: cmd.purchaserPhone || '',
          email: cmd.purchaserEmail || '',
        },
        saleDate: nowISO,
        grossPrice,
        commissionRate,
        commissionPaid,
        netRevenue,
        currency: primaryAsset.pricing.currency as CurrencyCode,
        exchangeRate: 1.0,
        exchangeRateSource: 'TCMB',
        accountingAmount: grossPrice,
        lines,
        revenueSplit: {
          organizerAmount: { minorUnits: BigInt(Math.round(netRevenue * 100)), currency: primaryAsset.pricing.currency as CurrencyCode, scale: 100 },
          platformCommission: { minorUnits: BigInt(Math.round(commissionPaid * 100)), currency: primaryAsset.pricing.currency as CurrencyCode, scale: 100 },
          gatewayFee: { minorUnits: BigInt(0), currency: primaryAsset.pricing.currency as CurrencyCode, scale: 100 },
          taxAmount: { minorUnits: BigInt(Math.round(totalTax * 100)), currency: primaryAsset.pricing.currency as CurrencyCode, scale: 100 },
        },
        status: 'Completed',
        notes: `${channel.name} dış satış bildirimi işlendi (${cmd.externalSaleReference}).`,
        version: 1,
        isArchived: false,
        createdAt: nowISO,
        updatedAt: nowISO,
      };

      MockDataStore.sales.push(sale);

      assets.forEach((a) => {
        VenueAssetProjection.updateAssetStatus(a.id, 'Sold', saleId, cmd.reservationId);
        VenueService.updateAsset(a.id, { status: 'Sold' });
      });

      const event: SaleRecordedDomainEvent = {
        eventName: DomainEventNames.SaleRecorded,
        header: {
          eventId: IdGenerator.generateUUIDv7(),
          eventVersion: 1,
          occurredAt: nowISO,
          correlationId,
          causationId: commandId,
          tenantId: organizationId,
          traceId: cmd.traceId,
          spanId: cmd.spanId,
        },
        saleId: sale.id,
        eventId: sale.eventId,
      };

      OutboxStore.addMessage('Sale', sale.id, event);

      if (cmd.reservationId) {
        const res = MockDataStore.reservations.find((r) => r.id === cmd.reservationId);
        if (res) {
          res.status = 'ConvertedToSale';
          res.updatedAt = nowISO;
        }
      }

      await OutboxPublisherWorker.processPendingMessages();

      const result: ProcessExternalSaleConfirmationResult = {
        sale,
        event,
        isDuplicateRecord: false,
      };

      IdempotencyStore.markCompleted(idempotencyKey, result);
      return result;
    } catch (err) {
      IdempotencyStore.markFailed(idempotencyKey);
      throw err;
    }
  }

  private static async reconstructDuplicateSaleResponse(
    client: PoolClient,
    row: any,
    cmd: ProcessExternalSaleConfirmationCommand
  ): Promise<ProcessExternalSaleConfirmationResult> {
    const linesRes = await client.query('SELECT * FROM sale_lines WHERE sale_id = $1', [row.id]);
    const lines: SaleLine[] = linesRes.rows.map((l) => ({
      id: l.id,
      saleId: row.id,
      itemType: 'VenueAsset' as const,
      venueAssetId: l.venue_asset_id,
      quantity: l.quantity,
      unitPrice: parseFloat(l.unit_price),
      discountAmount: 0,
      taxAmount: parseFloat(l.unit_price) * 0.2,
      totalPrice: parseFloat(l.total_price),
      currency: row.currency as CurrencyCode,
      exchangeRate: 1.0,
    }));

    const existingSale: Sale = {
      id: row.id,
      organizationId: row.organization_id,
      eventId: row.event_id,
      reservationId: row.reservation_id,
      salesChannelId: row.sales_channel_id,
      externalReference: row.external_reference,
      channel: { type: 'ExternalChannel', name: row.sales_channel_id, reference: row.external_reference },
      purchaserSnapshot: {
        fullName: row.purchaser_name || 'Unspecified Purchaser',
        phone: row.purchaser_phone || cmd.purchaserPhone || '',
        email: row.purchaser_email || cmd.purchaserEmail || '',
      },
      saleDate: row.created_at,
      grossPrice: parseFloat(row.gross_price),
      commissionRate: parseFloat(row.gross_price) > 0 ? parseFloat(row.commission_paid) / parseFloat(row.gross_price) : 0,
      commissionPaid: parseFloat(row.commission_paid),
      netRevenue: parseFloat(row.net_revenue),
      currency: row.currency as CurrencyCode,
      exchangeRate: 1.0,
      exchangeRateSource: 'TCMB',
      accountingAmount: parseFloat(row.gross_price),
      lines,
      revenueSplit: {
        organizerAmount: { minorUnits: BigInt(Math.round(parseFloat(row.net_revenue) * 100)), currency: row.currency as CurrencyCode, scale: 100 },
        platformCommission: { minorUnits: BigInt(Math.round(parseFloat(row.commission_paid) * 100)), currency: row.currency as CurrencyCode, scale: 100 },
        gatewayFee: { minorUnits: BigInt(0), currency: row.currency as CurrencyCode, scale: 100 },
        taxAmount: { minorUnits: BigInt(Math.round(parseFloat(row.gross_price) * 0.2 * 100)), currency: row.currency as CurrencyCode, scale: 100 },
      },
      status: row.status,
      notes: 'Cached PostgreSQL sale record',
      version: 1,
      isArchived: false,
      createdAt: row.created_at,
      updatedAt: row.created_at,
    };

    return {
      sale: existingSale,
      isDuplicateRecord: true,
    };
  }
}
