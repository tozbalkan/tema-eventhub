import { CurrencyCode, Money } from '@/types/money';
import { MockDataStore } from '@/repositories/mock/MockRepositories';

export interface CommissionCalculationResult {
  grossPrice: number;
  commissionRate: number; // e.g. 0.06 for 6%
  commissionPercentage: number; // e.g. 6.0
  commissionAmount: number; // Rounded minor unit equivalent
  netRevenue: number; // Gross - Commission
  currency: CurrencyCode;
  salesChannelId: string;
  salesChannelName: string;
  revenueSplit: {
    organizerAmount: Money;
    platformCommission: Money;
    gatewayFee: Money;
    taxAmount: Money;
  };
}

export class CommissionEngineService {
  /**
   * Returns default commission rate percentage for supported ticket platforms:
   * - Biletix: 6.0%
   * - Passo: 5.0%
   * - Bugece: 3.5%
   * - Desk (Organizasyon Masası): 0.0%
   * - Corporate (Kurumsal Acente): 2.0%
   */
  public static getCommissionRatePercentage(salesChannelId: string): number {
    const channel = MockDataStore.salesChannels.find(
      (c) => c.id.toLowerCase() === salesChannelId.toLowerCase()
    );
    if (channel) {
      return channel.commissionPercentage;
    }

    switch (salesChannelId.toLowerCase()) {
      case 'biletix':
        return 6.0;
      case 'passo':
        return 5.0;
      case 'bugece':
        return 3.5;
      case 'desk':
        return 0.0;
      case 'corporate':
        return 2.0;
      default:
        return 0.0;
    }
  }

  /**
   * Calculates deterministic commission & net organizer revenue using minor units
   * to eliminate floating-point precision loss.
   */
  public static calculate(
    grossPrice: number,
    salesChannelId: string,
    currency: CurrencyCode = 'TRY'
  ): CommissionCalculationResult {
    if (grossPrice < 0) {
      throw new Error('Gross price cannot be negative.');
    }

    const ratePct = CommissionEngineService.getCommissionRatePercentage(salesChannelId);
    const commissionRate = ratePct / 100.0;

    // Convert to minor units (kuruş/cents) for exact integer arithmetic
    const grossMinorUnits = BigInt(Math.round(grossPrice * 100));
    const rateBps = BigInt(Math.round(ratePct * 100)); // Basis points (6.0% -> 600)

    // Commission minor units = Math.round(grossMinor * rateBps / 10000)
    const commissionMinorUnits = (grossMinorUnits * rateBps + 5000n) / 10000n;
    const netMinorUnits = grossMinorUnits - commissionMinorUnits;

    const commissionAmount = Number(commissionMinorUnits) / 100.0;
    const netRevenue = Number(netMinorUnits) / 100.0;

    // Standard VAT tax estimate (20% included in gross)
    const taxMinorUnits = (grossMinorUnits * 2000n + 5000n) / 10000n;

    const salesChannelName =
      MockDataStore.salesChannels.find((c) => c.id.toLowerCase() === salesChannelId.toLowerCase())
        ?.name || salesChannelId;

    return {
      grossPrice,
      commissionRate,
      commissionPercentage: ratePct,
      commissionAmount,
      netRevenue,
      currency,
      salesChannelId,
      salesChannelName,
      revenueSplit: {
        organizerAmount: { minorUnits: netMinorUnits, currency, scale: 100 },
        platformCommission: { minorUnits: commissionMinorUnits, currency, scale: 100 },
        gatewayFee: { minorUnits: 0n, currency, scale: 100 },
        taxAmount: { minorUnits: taxMinorUnits, currency, scale: 100 },
      },
    };
  }
}
