import { CurrencyCode } from './money';

export type AssetCategory =
  | 'VIP'
  | 'Food'
  | 'WC'
  | 'Parking'
  | 'Stage'
  | 'Sponsor'
  | 'Lounge';

export type AssetShape =
  | 'Rectangle'
  | 'Circle'
  | 'Polygon'
  | 'Text'
  | 'Image';

export type AssetStatus = 'Available' | 'Reserved' | 'Sold' | 'Blocked';

export interface MultiTierPricing {
  basePrice: number;
  campaignPrice?: number;
  minimumPrice?: number;
  suggestedPrice?: number;
  currency: CurrencyCode;
  pricingReason?: 'BASE' | 'CAMPAIGN' | 'VIP_DISCOUNT' | 'CORPORATE' | 'MANUAL_OVERRIDE';
}

export interface VenueAsset {
  id: string; // UUID v7
  svgNodeId: string; // Short immutable ID e.g. "vip_a12"
  floorPlanId: string;
  name: string; // Display name e.g. "A12"
  groupName?: string;
  category: AssetCategory;
  shape: AssetShape;
  status: AssetStatus;
  isVisible: boolean;
  paxCapacity: number;
  pricing: MultiTierPricing;
  
  // Vector SVG Properties
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number;
  layerId?: string;
  
  // Flexible metadata JSON
  metadata?: {
    view?: string;
    zone?: string;
    smoking?: boolean;
    vipEntrance?: boolean;
    includedServices?: string[];
    includedDrinks?: string[];
    notes?: string;
  };
  
  version: number;
  isArchived: boolean;
  archivedAt?: string | null;
  archivedBy?: string | null;
}
