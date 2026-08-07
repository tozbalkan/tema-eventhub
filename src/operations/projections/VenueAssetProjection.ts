import { VenueAsset } from '@/types/venue-asset';
import { MockDataStore } from '@/repositories/mock/MockRepositories';

export interface VenueAssetReadModel {
  assetId: string;
  name: string;
  category: string;
  status: 'Available' | 'Reserved' | 'Sold' | 'Blocked' | 'Cleaning' | 'Maintenance' | 'Sponsor';
  paxCapacity: number;
  basePrice: number;
  occupancyState: string;
  displayColor: string;
  saleId?: string;
  reservationId?: string;
  lastUpdated: string;
}

export class VenueAssetProjection {
  private static store: Map<string, VenueAssetReadModel> = new Map();

  public static initialize(assets: VenueAsset[]): void {
    VenueAssetProjection.store.clear();
    assets.forEach((asset) => {
      let displayColor = 'hsl(142 70% 45%)'; // Available Green
      if (asset.status === 'Reserved') displayColor = 'hsl(45 90% 50%)'; // Gold
      else if (asset.status === 'Sold') displayColor = 'hsl(350 80% 55%)'; // Red
      else if (asset.status === 'Blocked') displayColor = 'hsl(220 15% 45%)'; // Gray

      VenueAssetProjection.store.set(asset.id, {
        assetId: asset.id,
        name: asset.name,
        category: asset.category,
        status: asset.status as any,
        paxCapacity: asset.paxCapacity,
        basePrice: asset.pricing.basePrice,
        occupancyState: asset.status === 'Sold' ? 'Satıldı' : asset.status === 'Reserved' ? 'Opsiyonda' : 'Müsait',
        displayColor,
        lastUpdated: new Date().toISOString(),
      });
    });
  }

  public static getAll(): VenueAssetReadModel[] {
    if (VenueAssetProjection.store.size === 0) {
      VenueAssetProjection.initialize(MockDataStore.assets);
    }
    return Array.from(VenueAssetProjection.store.values());
  }

  public static getById(assetId: string): VenueAssetReadModel | undefined {
    if (VenueAssetProjection.store.size === 0) {
      VenueAssetProjection.initialize(MockDataStore.assets);
    }
    return VenueAssetProjection.store.get(assetId);
  }

  public static updateAssetStatus(assetId: string, status: 'Available' | 'Reserved' | 'Sold' | 'Blocked', saleId?: string, reservationId?: string): void {
    const current = VenueAssetProjection.getById(assetId);
    if (!current) return;

    let displayColor = 'hsl(142 70% 45%)';
    if (status === 'Reserved') displayColor = 'hsl(45 90% 50%)';
    else if (status === 'Sold') displayColor = 'hsl(350 80% 55%)';
    else if (status === 'Blocked') displayColor = 'hsl(220 15% 45%)';

    const updated: VenueAssetReadModel = {
      ...current,
      status,
      occupancyState: status === 'Sold' ? 'Satıldı' : status === 'Reserved' ? 'Opsiyonda' : 'Müsait',
      displayColor,
      saleId: saleId ?? current.saleId,
      reservationId: reservationId ?? current.reservationId,
      lastUpdated: new Date().toISOString(),
    };

    VenueAssetProjection.store.set(assetId, updated);
  }
}
