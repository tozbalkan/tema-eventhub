import { MockDataStore } from '@/repositories/mock/MockRepositories';
import { Sale, ExternalSaleConfirmation } from '@/types/sale';
import { AccountingEntry } from '@/types/accounting-entry';

export class SaleService {
  public static getSales(): Sale[] {
    return MockDataStore.sales.filter((s) => !s.isArchived);
  }

  public static getExternalSaleConfirmations(): ExternalSaleConfirmation[] {
    return MockDataStore.externalSaleConfirmations;
  }

  public static getAccountingEntries(): AccountingEntry[] {
    return MockDataStore.accountingEntries;
  }
}
