import { MockDataStore } from '@/repositories/mock/MockRepositories';
import { Sale } from '@/types/sale';
import { AccountingEntry } from '@/types/accounting-entry';

export class SaleService {
  public static getSales(): Sale[] {
    return MockDataStore.sales.filter((s) => !s.isArchived);
  }

  public static getAccountingEntries(): AccountingEntry[] {
    return MockDataStore.accountingEntries;
  }
}
