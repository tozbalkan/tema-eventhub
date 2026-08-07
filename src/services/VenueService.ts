import { MockDataStore } from '@/repositories/mock/MockRepositories';
import { Venue, Gate } from '@/types/venue';
import { VenueAsset } from '@/types/venue-asset';
import { IdGenerator } from '@/platform/IdGenerator';
import { ClockProvider } from '@/platform/ClockProvider';

export class VenueService {
  public static getVenue(): Venue {
    return MockDataStore.venue;
  }

  public static getGates(): Gate[] {
    return MockDataStore.gates.filter((g) => !g.isArchived);
  }

  public static getAssets(): VenueAsset[] {
    return MockDataStore.assets.filter((a) => !a.isArchived);
  }

  public static getAssetById(id: string): VenueAsset | undefined {
    return MockDataStore.assets.find((a) => a.id === id);
  }

  public static addAsset(assetData: Omit<VenueAsset, 'id' | 'version' | 'isArchived'>): VenueAsset {
    const newAsset: VenueAsset = {
      ...assetData,
      id: IdGenerator.generateUUIDv7(),
      version: 1,
      isArchived: false,
    };
    MockDataStore.assets.push(newAsset);
    return newAsset;
  }

  public static updateAsset(id: string, updates: Partial<VenueAsset>): VenueAsset {
    const existing = MockDataStore.assets.find((a) => a.id === id);
    if (!existing) throw new Error('Asset not found');

    if (existing.isArchived) {
      throw new Error('ARCHIVED_ENTITY_CANNOT_BE_MUTATED: Restore entity before editing.');
    }

    const updated: VenueAsset = {
      ...existing,
      ...updates,
      version: existing.version + 1,
    };

    const index = MockDataStore.assets.findIndex((a) => a.id === id);
    if (index !== -1) {
      MockDataStore.assets[index] = updated;
    }
    return updated;
  }

  public static archiveAsset(id: string, userId: string): VenueAsset {
    const asset = this.getAssetById(id);
    if (!asset) throw new Error('Asset not found');

    asset.isArchived = true;
    asset.archivedAt = ClockProvider.nowISO();
    asset.archivedBy = userId;
    return asset;
  }

  public static restoreAsset(id: string): VenueAsset {
    const asset = MockDataStore.assets.find((a) => a.id === id);
    if (!asset) throw new Error('Asset not found');

    asset.isArchived = false;
    asset.archivedAt = null;
    asset.archivedBy = null;
    return asset;
  }
}
