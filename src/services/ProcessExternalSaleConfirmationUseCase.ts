import { PoolClient } from 'pg';
import { MockDataStore } from '@/repositories/mock/MockRepositories';
import { Sale } from '@/types/sale';
import { SalesChannel } from '@/types/sales-channel';
import { VenueService } from './VenueService';
import { IdGenerator } from '@/platform/IdGenerator';
import { SaleRecordedDomainEvent, DomainEventNames } from '@/domain/events/DomainEvents';
import { IdempotencyStore } from '@/platform/IdempotencyStore';
import { OutboxStore } from '@/platform/OutboxStore';
import { PgOutboxStore } from '@/platform/pg/PgOutboxStore';
import { OutboxPublisherWorker } from '@/platform/OutboxPublisherWorker';
import { bootstrapStageOpsApplication } from '@/application/Bootstrap';

export interface ProcessExternalSaleConfirmationCommand {
  commandId?: string;
  reservationId?: string;
  eventId: string;
  assetId: string;
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
 * Production Transaction Flow (Phantom-Free Non-Aborting SQL Pattern):
 * 1. Command Idempotency Check (SELECT existing sale for channel + reference)
 * 2. Asset existence & status pre-validation
 * 3. Reserve Sale Ownership FIRST (INSERT INTO sales ON CONFLICT DO NOTHING RETURNING id)
 *    - If duplicate detected: Return existing sale payload WITHOUT mutating asset projections (Zero Phantom Side-Effects!)
 * 4. Lock & Mutate Asset Projection ONLY IF sale ownership was won!
 *    - If asset is already sold: Throw SEAT_ALREADY_RESERVED (triggers UnitOfWork ROLLBACK of step 3 sale insert)
 * 5. Persist Sale Lines & OutboxMessage in SAME PostgreSQL Transaction
 * 6. UnitOfWork commits cleanly without 23505 transaction abortion
 */
export class ProcessExternalSaleConfirmationUseCase {
  public static async execute(cmd: ProcessExternalSaleConfirmationCommand): Promise<ProcessExternalSaleConfirmationResult> {
    bootstrapStageOpsApplication();

    const idempotencyKey = cmd.idempotencyKey || cmd.externalSaleReference;

    // PostgreSQL Transactional Execution Path
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

      // 2. Asset existence and status validation
      const asset = VenueService.getAssetById(cmd.assetId);
      if (!asset) {
        throw new Error('Asset not found');
      }
      if (asset.status === 'Sold') {
        // Fallback check: If same external reference created this sold asset in a parallel committed transaction
        const doubleCheckCommitted = await client.query(
          'SELECT * FROM sales WHERE sales_channel_id = $1 AND external_reference = $2',
          [cmd.salesChannelId, cmd.externalSaleReference]
        );
        if (doubleCheckCommitted.rows.length > 0) {
          return this.reconstructDuplicateSaleResponse(client, doubleCheckCommitted.rows[0], cmd);
        }
        throw new Error('SEAT_ALREADY_RESERVED: Asset is already sold.');
      }

      const grossPrice = asset.pricing.basePrice;
      const defaultChannel: SalesChannel = { id: 'desk', name: 'Organizasyon Masası', commissionPercentage: 0.0, isArchived: false };
      const channel = MockDataStore.salesChannels.find((c) => c.id === cmd.salesChannelId) ?? defaultChannel;
      const commissionRate = channel.commissionPercentage / 100;
      const commissionPaid = grossPrice * commissionRate;
      const netRevenue = grossPrice - commissionPaid;

      const nowISO = new Date().toISOString();
      const commandId = cmd.commandId || IdGenerator.generateUUIDv7();
      const correlationId = cmd.correlationId || IdGenerator.generateUUIDv7();
      const saleId = IdGenerator.generateUUIDv7();
      const lineId = IdGenerator.generateUUIDv7();

      const sale: Sale = {
        id: saleId,
        organizationId: MockDataStore.organizationId,
        eventId: cmd.eventId,
        reservationId: cmd.reservationId,
        salesChannelId: cmd.salesChannelId,
        externalReference: cmd.externalSaleReference,
        channel: { type: 'ExternalChannel', name: channel.name, reference: cmd.externalSaleReference },
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
        currency: asset.pricing.currency,
        exchangeRate: 1.0,
        exchangeRateSource: 'TCMB',
        accountingAmount: grossPrice,
        lines: [
          {
            id: lineId,
            saleId,
            itemType: 'VenueAsset',
            venueAssetId: cmd.assetId,
            quantity: 1,
            unitPrice: grossPrice,
            discountAmount: 0,
            taxAmount: grossPrice * 0.2,
            totalPrice: grossPrice,
            currency: asset.pricing.currency,
            exchangeRate: 1.0,
          },
        ],
        revenueSplit: {
          organizerAmount: { minorUnits: BigInt(Math.round(netRevenue * 100)), currency: asset.pricing.currency, scale: 100 },
          platformCommission: { minorUnits: BigInt(Math.round(commissionPaid * 100)), currency: asset.pricing.currency, scale: 100 },
          gatewayFee: { minorUnits: BigInt(0), currency: asset.pricing.currency, scale: 100 },
          taxAmount: { minorUnits: BigInt(Math.round(grossPrice * 0.2 * 100)), currency: asset.pricing.currency, scale: 100 },
        },
        status: 'Completed',
        notes: 'PostgreSQL sale record',
        version: 1,
        isArchived: false,
        createdAt: nowISO,
        updatedAt: nowISO,
      };

      // 3. Non-Aborting SQL Sale Ownership Reservation: ON CONFLICT DO NOTHING RETURNING id
      // Prevents PostgreSQL transaction from entering aborted state AND determines sale ownership BEFORE asset mutation!
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

      // If another transaction inserted this external reference concurrently, fetch existing sale WITHOUT MUTATING ASSETS!
      if (insertSaleRes.rows.length === 0) {
        const fetchExisting = await client.query(
          'SELECT * FROM sales WHERE sales_channel_id = $1 AND external_reference = $2',
          [cmd.salesChannelId, cmd.externalSaleReference]
        );
        if (fetchExisting.rows.length > 0) {
          return this.reconstructDuplicateSaleResponse(client, fetchExisting.rows[0], cmd);
        }
      }

      // 4. Atomic Asset Acquisition & Locking ONLY AFTER Sale Ownership is Won!
      const lockAssetQuery = `
        INSERT INTO venue_asset_projections (
          asset_id, name, category, status, occupancy_state, sale_id, reservation_id, pax_capacity, base_price, version, last_updated
        ) VALUES ($1, $2, 'VIP', 'Sold', 'Occupied', $3, $4, 6, $5, 1, NOW())
        ON CONFLICT (asset_id) DO UPDATE SET
          status = 'Sold',
          occupancy_state = 'Occupied',
          sale_id = EXCLUDED.sale_id,
          version = venue_asset_projections.version + 1,
          last_updated = NOW()
        WHERE venue_asset_projections.status <> 'Sold';
      `;
      const lockRes = await client.query(lockAssetQuery, [cmd.assetId, asset.name, sale.id, sale.reservationId, grossPrice]);
      if (lockRes.rowCount === 0) {
        // If asset locking failed because asset was already sold to another sale, throw error to trigger ROLLBACK of Step 3 sale insert!
        throw new Error('SEAT_ALREADY_RESERVED: Asset is already sold.');
      }

      // 5. INSERT Sale lines into PostgreSQL in SAME transaction
      const lineQuery = `
        INSERT INTO sale_lines (id, sale_id, venue_asset_id, quantity, unit_price, total_price)
        VALUES ($1, $2, $3, 1, $4, $4);
      `;
      await client.query(lineQuery, [lineId, sale.id, cmd.assetId, grossPrice]);

      // 6. INSERT OutboxMessage into PostgreSQL in SAME transaction
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

    // In-Memory Reference Execution Path
    const existingRecord = IdempotencyStore.getRecord(idempotencyKey);
    if (existingRecord && existingRecord.status === 'Completed' && existingRecord.responsePayload) {
      console.log(`[Idempotency] Returning cached response payload for ref: ${cmd.externalSaleReference}`);
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
      const asset = VenueService.getAssetById(cmd.assetId);
      if (!asset) {
        IdempotencyStore.markFailed(idempotencyKey);
        throw new Error('Asset not found');
      }

      if (asset.status === 'Sold') {
        IdempotencyStore.markFailed(idempotencyKey);
        throw new Error('SEAT_ALREADY_RESERVED: Asset is already sold.');
      }

      const defaultChannel: SalesChannel = {
        id: 'desk',
        name: 'Organizasyon Masası',
        commissionPercentage: 0.0,
        isArchived: false,
      };
      const channel = MockDataStore.salesChannels.find((c) => c.id === cmd.salesChannelId) ?? defaultChannel;
      const nowISO = new Date().toISOString();
      const grossPrice = asset.pricing.basePrice;
      const commissionRate = channel.commissionPercentage / 100;
      const commissionPaid = grossPrice * commissionRate;
      const netRevenue = grossPrice - commissionPaid;

      const commandId = cmd.commandId || IdGenerator.generateUUIDv7();
      const correlationId = cmd.correlationId || IdGenerator.generateUUIDv7();
      const saleId = IdGenerator.generateUUIDv7();

      const sale: Sale = {
        id: saleId,
        organizationId: MockDataStore.organizationId,
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
        currency: asset.pricing.currency,
        exchangeRate: 1.0,
        exchangeRateSource: 'TCMB',
        accountingAmount: grossPrice,
        lines: [
          {
            id: IdGenerator.generateUUIDv7(),
            saleId,
            itemType: 'VenueAsset',
            venueAssetId: cmd.assetId,
            quantity: 1,
            unitPrice: grossPrice,
            discountAmount: 0,
            taxAmount: grossPrice * 0.2,
            totalPrice: grossPrice,
            currency: asset.pricing.currency,
            exchangeRate: 1.0,
          },
        ],
        revenueSplit: {
          organizerAmount: { minorUnits: BigInt(Math.round(netRevenue * 100)), currency: asset.pricing.currency, scale: 100 },
          platformCommission: { minorUnits: BigInt(Math.round(commissionPaid * 100)), currency: asset.pricing.currency, scale: 100 },
          gatewayFee: { minorUnits: BigInt(0), currency: asset.pricing.currency, scale: 100 },
          taxAmount: { minorUnits: BigInt(Math.round(grossPrice * 0.2 * 100)), currency: asset.pricing.currency, scale: 100 },
        },
        status: 'Completed',
        notes: `${channel.name} dış satış bildirimi işlendi (${cmd.externalSaleReference}).`,
        version: 1,
        isArchived: false,
        createdAt: nowISO,
        updatedAt: nowISO,
      };

      MockDataStore.sales.push(sale);

      const event: SaleRecordedDomainEvent = {
        eventName: DomainEventNames.SaleRecorded,
        header: {
          eventId: IdGenerator.generateUUIDv7(),
          eventVersion: 1,
          occurredAt: nowISO,
          correlationId,
          causationId: commandId,
          tenantId: MockDataStore.organizationId,
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
    const lines = linesRes.rows.map((l) => ({
      id: l.id,
      saleId: row.id,
      itemType: 'VenueAsset' as const,
      venueAssetId: l.venue_asset_id,
      quantity: l.quantity,
      unitPrice: parseFloat(l.unit_price),
      discountAmount: 0,
      taxAmount: parseFloat(l.unit_price) * 0.2,
      totalPrice: parseFloat(l.total_price),
      currency: row.currency,
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
      currency: row.currency,
      exchangeRate: 1.0,
      exchangeRateSource: 'TCMB',
      accountingAmount: parseFloat(row.gross_price),
      lines,
      revenueSplit: {
        organizerAmount: { minorUnits: BigInt(Math.round(parseFloat(row.net_revenue) * 100)), currency: row.currency, scale: 100 },
        platformCommission: { minorUnits: BigInt(Math.round(parseFloat(row.commission_paid) * 100)), currency: row.currency, scale: 100 },
        gatewayFee: { minorUnits: BigInt(0), currency: row.currency, scale: 100 },
        taxAmount: { minorUnits: BigInt(Math.round(parseFloat(row.gross_price) * 0.2 * 100)), currency: row.currency, scale: 100 },
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
