import { SaleRecordedDomainEvent } from '@/domain/events/DomainEvents';
import { AccountingEntry } from '@/types/accounting-entry';
import { MockDataStore } from '@/repositories/mock/MockRepositories';
import { IdGenerator } from '@/platform/IdGenerator';
import { ConsumerIdempotencyStore } from '@/platform/ConsumerIdempotencyStore';

const CONSUMER_NAME = 'AccountingSaleRecordedHandler';

export class AccountingSaleRecordedHandler {
  public static handle(event: SaleRecordedDomainEvent): void {
    // Consumer Idempotency: skip if this event was already processed by this handler
    if (ConsumerIdempotencyStore.isAlreadyProcessed(event.header.eventId, CONSUMER_NAME)) {
      return;
    }

    const sale = MockDataStore.sales.find((s) => s.id === event.saleId);
    if (!sale) {
      // Throw to trigger Outbox retry — silent return would mark event as Published and lose it
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

    // Mark as processed — future retries will be safely skipped
    ConsumerIdempotencyStore.markProcessed(event.header.eventId, CONSUMER_NAME);
  }
}
