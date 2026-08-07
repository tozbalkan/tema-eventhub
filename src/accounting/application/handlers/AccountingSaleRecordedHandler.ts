import { SaleRecordedDomainEvent } from '@/domain/events/DomainEvents';
import { AccountingEntry } from '@/types/accounting-entry';
import { MockDataStore } from '@/repositories/mock/MockRepositories';
import { IdGenerator } from '@/platform/IdGenerator';

export class AccountingSaleRecordedHandler {
  public static handle(event: SaleRecordedDomainEvent): void {
    const sale = MockDataStore.sales.find((s) => s.id === event.saleId);
    if (!sale) return;

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
  }
}
