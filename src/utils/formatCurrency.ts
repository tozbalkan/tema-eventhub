import { CurrencyCode, CURRENCY_MAP } from '@/types/money';

/**
 * Formats a monetary amount into standard commercial string with symbol and dot thousands separator.
 * Examples:
 *   formatCurrency(25000, 'TRY') -> "₺25.000"
 *   formatCurrency(25000, 'EUR') -> "€25.000"
 *   formatCurrency(25000, 'USD') -> "$25.000"
 */
export function formatCurrency(amount: number, currency: CurrencyCode = 'TRY'): string {
  const meta = CURRENCY_MAP[currency] || CURRENCY_MAP.TRY;
  const formattedNumber = Math.round(amount).toLocaleString('tr-TR');
  return `${meta.symbol}${formattedNumber}`;
}

/**
 * Formats a number with thousands separator without symbol (for input fields).
 * Example: 25000 -> "25.000"
 */
export function formatPriceNumber(amount: number): string {
  if (isNaN(amount) || amount === 0) return '0';
  return Math.round(amount).toLocaleString('tr-TR');
}

/**
 * Formats a multi-currency breakdown map.
 * Example:
 *   { TRY: 100000, EUR: 10000 } -> "₺100.000 + €10.000"
 */
export function formatMultiCurrencyTotals(totals: Partial<Record<CurrencyCode, number>>): string {
  const entries = Object.entries(totals) as [CurrencyCode, number][];
  const activeEntries = entries.filter(([_, val]) => val !== undefined && val > 0);

  if (activeEntries.length === 0) {
    return formatCurrency(0, 'TRY');
  }

  return activeEntries
    .map(([curr, val]) => formatCurrency(val, curr))
    .join(' + ');
}
