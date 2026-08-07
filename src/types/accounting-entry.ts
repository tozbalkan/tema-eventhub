import { CurrencyCode } from './money';

export type AccountingEntryType =
  | 'SaleRevenue'
  | 'PlatformCommission'
  | 'GatewayFee'
  | 'Tax'
  | 'RefundAdjustment'
  | 'ChargebackAdjustment'
  | 'ManualAdjustment'
  | 'CurrencyExchange'
  | 'ExchangeRateAdjustment'
  | 'FeeCorrection'
  | 'SettlementAdjustment';

export interface AccountingEntry {
  id: string; // UUID v7 (Append-Only)
  organizationId: string;
  eventId: string;
  sourceType: 'Sale' | 'Refund' | 'Chargeback' | 'Settlement' | 'ManualAdjustment';
  sourceId: string;
  entryType: AccountingEntryType;
  amount: number;
  currency: CurrencyCode;
  accountingAmount: number; // Base currency
  occurredAt: string;
  createdAt: string;
}

export interface SettlementPeriod {
  id: string;
  organizationId: string;
  periodName: string; // e.g. "2026-W32"
  startsAt: string;
  endsAt: string;
  status: 'Open' | 'Calculating' | 'Locked' | 'Exported' | 'Scheduled' | 'Paid' | 'Failed' | 'Reopened';
}
