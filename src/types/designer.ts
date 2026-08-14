import { CurrencyCode } from '@/types/money';

export type DesignerAssetType = 'table' | 'bistro' | 'stage' | 'bar' | 'custom' | 'area' | 'block' | 'row' | 'seat';

export type DesignerAssetStatus = 'Available' | 'Reserved' | 'Sold' | 'Blocked';

export interface DesignerPricing {
  basePrice: number;
  currency?: CurrencyCode;
  weekendPrice?: number;
  earlyBirdPrice?: number;
}

export interface DesignerAppearance {
  fill?: string;
  border?: string;
  opacity?: number;
}

export interface DesignerAsset {
  id: string;
  name: string;
  type: DesignerAssetType;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  paxCapacity: number;
  status: DesignerAssetStatus;
  parentId?: string;
  groupId?: string;
  groupName?: string;
  pricing: DesignerPricing;
  appearance?: DesignerAppearance;
  locked?: boolean;
  visible?: boolean;
  zIndex?: number;
}

export interface DesignerGroup {
  id: string;
  name: string;
  assetIds: string[];
}

export type SnapGridOption = 0 | 10 | 20 | 50;

export interface DesignerHistorySnapshot {
  assets: DesignerAsset[];
  groups: DesignerGroup[];
}

export interface DesignerDraft {
  version: number;
  timestamp: string;
  assets: DesignerAsset[];
  groups: DesignerGroup[];
  viewport?: { x: number; y: number; w: number; h: number };
  gridSnap?: SnapGridOption;
}
