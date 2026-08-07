import { CurrencyCode, Money } from './money';
import { SalesChannelVO, PurchaserSnapshotVO } from './sales-channel-vo';

export type SaleStatus =
  | 'PendingPayment'
  | 'Completed'
  | 'Refunded'
  | 'PartiallyRefunded'
  | 'Chargeback'
  | 'Cancelled';

export interface AppliedPromotionVO {
  code: string;
  campaignVersion: number;
  discountAmount: number;
  calculationFormula: string;
  freeDrink?: boolean;
  freeParking?: boolean;
  vipUpgrade?: boolean;
}

export interface SaleLine {
  id: string;
  saleId: string;
  itemType: 'VenueAsset' | 'Package' | 'Parking' | 'Merchandise' | 'FoodBeverage' | 'LoungePass';
  venueAssetId?: string;
  quantity: number;
  unitPrice: number;
  discountAmount: number;
  taxAmount: number;
  totalPrice: number;
  currency: CurrencyCode;
  exchangeRate: number;
  appliedPromotion?: AppliedPromotionVO;
}

export interface RevenueSplitVO {
  organizerAmount: Money;
  platformCommission: Money;
  gatewayFee: Money;
  taxAmount: Money;
}

export interface ExternalConfirmationVO {
  salesChannelId: string;
  externalReference: string;
  confirmedAt: string;
}

export interface RefundItem {
  id: string;
  refundId: string;
  venueAssetId?: string;
  amount: number;
  status: 'Revoked' | 'Pending';
}

export interface Refund {
  id: string; // UUID v7
  organizationId: string;
  saleId: string;
  amount: number;
  currency: CurrencyCode;
  refundType: 'Partial' | 'Full' | 'Chargeback';
  reason: string;
  items: RefundItem[];
  status: 'Requested' | 'UnderReview' | 'Approved' | 'Rejected' | 'Processing' | 'Completed';
  createdAt: string;
  processedAt?: string;
}

export interface Sale {
  id: string; // UUID v7
  organizationId: string;
  eventId: string;
  reservationId?: string;
  salesChannelId: string; // e.g. "biletix", "passo", "desk"
  externalReference: string; // e.g. "BTX-20260807-18291"
  externalConfirmation?: ExternalConfirmationVO;
  channel: SalesChannelVO;
  purchaserSnapshot: PurchaserSnapshotVO;
  saleDate: string;
  
  grossPrice: number;
  commissionRate: number;
  commissionPaid: number;
  netRevenue: number;
  currency: CurrencyCode;
  exchangeRate: number;
  exchangeRateSource: 'TCMB' | 'ECB' | 'OpenExchangeRates' | 'Manual';
  accountingAmount: number;
  
  lines: SaleLine[];
  revenueSplit?: RevenueSplitVO;
  status: SaleStatus;
  notes?: string;
  
  version: number;
  isArchived: boolean;
  archivedAt?: string | null;
  archivedBy?: string | null;
  createdAt: string;
  updatedAt: string;
}
