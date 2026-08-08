import type { PoolClient } from 'pg';
import { SaleRecordedDomainEvent } from '@/domain/events/DomainEvents';
import { AccountingEntry } from '@/types/accounting-entry';
import { MockDataStore } from '@/repositories/mock/MockRepositories';
import { IdGenerator } from '@/platform/IdGenerator';
import { ConsumerIdempotencyStore } from '@/platform/ConsumerIdempotencyStore';

const CONSUMER_NAME = 'AccountingSaleRecordedHandler';

export class AccountingSaleRecordedHandler {
  public static async handle(event: SaleRecordedDomainEvent, client?: PoolClient): Promise<void> {
    if (client) {
      const { PgConsumerIdempotencyStore } = await import('@/platform/pg/PgConsumerIdempotencyStore');
      // PostgreSQL Transactional Mode: Atomic idempotency check + business mutation in SAME PoolClient transaction
      await PgConsumerIdempotencyStore.processIdempotently(
        client,
        event.header.eventId,
        CONSUMER_NAME,
        async (tx) => {
          // Read sale from PostgreSQL
          const saleRes = await tx.query('SELECT * FROM sales WHERE id = $1', [event.saleId]);
          if (saleRes.rows.length === 0) {
            throw new Error(`[${CONSUMER_NAME}] Sale ${event.saleId} not found in PostgreSQL. Event will be retried via Outbox backoff.`);
          }
          const sale = saleRes.rows[0];
          const grossPrice = parseFloat(sale.gross_price);
          const commissionPaid = parseFloat(sale.commission_paid);

          const accRevenueId = IdGenerator.generateUUIDv7();
          const accCommissionId = IdGenerator.generateUUIDv7();
          
          // Ensure valid UUID for PostgreSQL event_id column
          const validEventId = (sale.event_id && sale.event_id.includes('-')) ? sale.event_id : IdGenerator.generateUUIDv7();

          const insertQuery = `
            INSERT INTO accounting_entries (
              id, organization_id, event_id, source_type, source_id,
              entry_type, amount, currency, accounting_amount, occurred_at
            ) VALUES
              ($1, $2, $3, 'Sale', $4, 'SaleRevenue', $5, $6, $5, $7),
              ($8, $2, $3, 'Sale', $4, 'PlatformCommission', $9, $6, $9, $7);
          `;

          await tx.query(insertQuery, [
            accRevenueId,
            sale.organization_id,
            validEventId,
            sale.id,
            grossPrice,
            sale.currency,
            event.header.occurredAt,
            accCommissionId,
            -commissionPaid,
          ]);
        }
      );
      return;
    }

    // In-Memory Reference Mode (for Next.js dev server & local mock)
    if (ConsumerIdempotencyStore.isAlreadyProcessed(event.header.eventId, CONSUMER_NAME)) {
      return;
    }

    const sale = MockDataStore.sales.find((s) => s.id === event.saleId);
    if (!sale) {
      throw new Error(`[${CONSUMER_NAME}] Sale ${event.saleId} not found. Event will be retried via Outbox backoff.`);
    }

    const accRevenue: AccountingEntry = {
      id: IdGenerator.generateUUIDv7(),
      organizationId: sale.organizationId,
      eventId: sale.eventId,
      sourceType: 'Sale',
      sourceId: sale.id,
      entryType: 'SaleRevenue',
      amount: sale.grossPrice,
      currency: sale.currency,
      accountingAmount: sale.grossPrice,
      occurredAt: event.header.occurredAt,
      createdAt: event.header.occurredAt,
    };

    const accCommission: AccountingEntry = {
      id: IdGenerator.generateUUIDv7(),
      organizationId: sale.organizationId,
      eventId: sale.eventId,
      sourceType: 'Sale',
      sourceId: sale.id,
      entryType: 'PlatformCommission',
      amount: -sale.commissionPaid,
      currency: sale.currency,
      accountingAmount: -sale.commissionPaid,
      occurredAt: event.header.occurredAt,
      createdAt: event.header.occurredAt,
    };

    MockDataStore.accountingEntries.push(accRevenue, accCommission);
    ConsumerIdempotencyStore.markProcessed(event.header.eventId, CONSUMER_NAME);
  }
}
