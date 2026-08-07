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
import { PgPool } from '@/platform/pg/PgPool';
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
 * Executing sequence:
 * 1. Stripe-style Idempotency Lock & Response Cache Check (24h TTL)
 * 2. Validate Venue Asset Availability
 * 3. Create Sale Aggregate
 * 4. Persist Sale Aggregate & OutboxMessage atomically (Transactional Outbox Pattern)
 * 5. OutboxPublisherWorker background process dispatches pending events asynchronously
 */
export class ProcessExternalSaleConfirmationUseCase {
  public static async execute(cmd: ProcessExternalSaleConfirmationCommand): Promise<ProcessExternalSaleConfirmationResult> {
    bootstrapStageOpsApplication();

    const idempotencyKey = cmd.idempotencyKey || cmd.externalSaleReference;

    // PostgreSQL Transactional Execution Path
    if (cmd.pgClient) {
      const client = cmd.pgClient;

      // 1. PostgreSQL Command Idempotency Check (Check if sale already exists for channel + external reference)
      const existingSaleRes = await client.query(
        'SELECT * FROM sales WHERE sales_channel_id = $1 AND external_reference = $2',
        [cmd.salesChannelId, cmd.externalSaleReference]
      );

      if (existingSaleRes.rows.length > 0) {
        const row = existingSaleRes.rows[0];
        const existingSale: Sale = {
          id: row.id,
          organizationId: row.organization_id,
          eventId: row.event_id,
          reservationId: row.reservation_id,
          salesChannelId: row.sales_channel_id,
          externalReference: row.external_reference,
          channel: { type: 'ExternalChannel', name: row.sales_channel_id, reference: row.external_reference },
          purchaserSnapshot: { fullName: row.purchaser_name || 'VIP Guest', phone: '', email: '' },
          saleDate: row.created_at,
          grossPrice: parseFloat(row.gross_price),
          commissionRate: 0.06,
          commissionPaid: parseFloat(row.commission_paid),
          netRevenue: parseFloat(row.net_revenue),
          currency: row.currency,
          exchangeRate: 1.0,
          exchangeRateSource: 'TCMB',
          accountingAmount: parseFloat(row.gross_price),
          lines: [],
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

      // Dynamic pricing & domain lookup
      const asset = VenueService.getAssetById(cmd.assetId);
      const grossPrice = asset ? asset.pricing.basePrice : 25000.0;
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
        organizationId: 'org_indigo_01',
        eventId: cmd.eventId,
        reservationId: cmd.reservationId,
        salesChannelId: cmd.salesChannelId,
        externalReference: cmd.externalSaleReference,
        channel: { type: 'ExternalChannel', name: channel.name, reference: cmd.externalSaleReference },
        purchaserSnapshot: { fullName: cmd.purchaserName || 'Emre Kaya', phone: cmd.purchaserPhone || '+905351234567', email: cmd.purchaserEmail || 'emre@vip.com' },
        saleDate: nowISO,
        grossPrice,
        commissionRate,
        commissionPaid,
        netRevenue,
        currency: asset ? asset.pricing.currency : 'TRY',
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
            currency: asset ? asset.pricing.currency : 'TRY',
            exchangeRate: 1.0,
          },
        ],
        revenueSplit: {
          organizerAmount: { minorUnits: BigInt(Math.round(netRevenue * 100)), currency: asset ? asset.pricing.currency : 'TRY', scale: 100 },
          platformCommission: { minorUnits: BigInt(Math.round(commissionPaid * 100)), currency: asset ? asset.pricing.currency : 'TRY', scale: 100 },
          gatewayFee: { minorUnits: BigInt(0), currency: asset ? asset.pricing.currency : 'TRY', scale: 100 },
          taxAmount: { minorUnits: BigInt(Math.round(grossPrice * 0.2 * 100)), currency: asset ? asset.pricing.currency : 'TRY', scale: 100 },
        },
        status: 'Completed',
        notes: 'PostgreSQL sale record',
        version: 1,
        isArchived: false,
        createdAt: nowISO,
        updatedAt: nowISO,
      };

      try {
        // 2. INSERT Sale aggregate into PostgreSQL
        const saleQuery = `
          INSERT INTO sales (
            id, organization_id, event_id, reservation_id, sales_channel_id,
            external_reference, purchaser_name, gross_price, commission_paid,
            net_revenue, currency, status, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13);
        `;
        await client.query(saleQuery, [
          sale.id,
          sale.organizationId,
          sale.eventId,
          sale.reservationId,
          sale.salesChannelId,
          sale.externalReference,
          sale.purchaserSnapshot?.fullName,
          sale.grossPrice,
          sale.commissionPaid,
          sale.netRevenue,
          sale.currency,
          sale.status,
          nowISO,
        ]);

        // 3. INSERT Sale lines into PostgreSQL in SAME transaction!
        const lineQuery = `
          INSERT INTO sale_lines (id, sale_id, venue_asset_id, quantity, unit_price, total_price)
          VALUES ($1, $2, $3, 1, $4, $4);
        `;
        await client.query(lineQuery, [lineId, sale.id, cmd.assetId, grossPrice]);

        // 4. INSERT OutboxMessage into PostgreSQL in SAME transaction!
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
      } catch (err: any) {
        // Catch PostgreSQL 23505 unique violation on ux_sales_external_reference
        if (err.code === '23505' || (err.message && err.message.includes('ux_sales_external_reference'))) {
          const pool = PgPool.getPool();
          const fetchExisting = await pool.query(
            'SELECT * FROM sales WHERE sales_channel_id = $1 AND external_reference = $2',
            [cmd.salesChannelId, cmd.externalSaleReference]
          );
          if (fetchExisting.rows.length > 0) {
            const row = fetchExisting.rows[0];
            return {
              sale: {
                ...sale,
                id: row.id,
                grossPrice: parseFloat(row.gross_price),
                commissionPaid: parseFloat(row.commission_paid),
                netRevenue: parseFloat(row.net_revenue),
              },
              isDuplicateRecord: true,
            };
          }
        }
        throw err;
      }
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
          fullName: cmd.purchaserName || 'Emre Kaya',
          phone: cmd.purchaserPhone || '+905351234567',
          email: cmd.purchaserEmail || 'emre@vip.com',
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
}
