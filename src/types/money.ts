export type CurrencyCode = 'TRY' | 'USD' | 'EUR' | 'GBP';

export interface CurrencyMetadata {
  code: CurrencyCode;
  symbol: string;
  minorUnits: number;
  scale: number;
  locale: string;
}

export interface Money {
  minorUnits: bigint | string | number; // bigint representation for precision
  currency: CurrencyCode;
  scale?: number;
}

export const CURRENCY_MAP: Record<CurrencyCode, CurrencyMetadata> = {
  TRY: { code: 'TRY', symbol: '₺', minorUnits: 2, scale: 100, locale: 'tr-TR' },
  USD: { code: 'USD', symbol: '$', minorUnits: 2, scale: 100, locale: 'en-US' },
  EUR: { code: 'EUR', symbol: '€', minorUnits: 2, scale: 100, locale: 'de-DE' },
  GBP: { code: 'GBP', symbol: '£', minorUnits: 2, scale: 100, locale: 'en-GB' },
};
