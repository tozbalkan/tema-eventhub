import { SaleRecordedDomainEvent } from '@/domain/events/DomainEvents';
import { VenueAssetProjection } from '../../projections/VenueAssetProjection';
import { AdmissionRightsProjection } from '../../projections/AdmissionRightsProjection';
import { VenueService } from '@/services/VenueService';
import { MockDataStore } from '@/repositories/mock/MockRepositories';

export class OperationsSaleRecordedHandler {
  public static handle(event: SaleRecordedDomainEvent): void {
    // 1. Update VenueAssetProjection Read Model to Sold
    VenueAssetProjection.updateAssetStatus(event.assetId, 'Sold', event.saleId, event.reservationId);
    VenueService.updateAsset(event.assetId, { status: 'Sold' });

    // 2. Set AdmissionRightsProjection
    const asset = VenueService.getAssetById(event.assetId);
    const sale = MockDataStore.sales.find((s) => s.id === event.saleId);

    AdmissionRightsProjection.setRight({
      assetId: event.assetId,
      purchaserName: sale?.purchaserSnapshot?.fullName || 'VIP Misafir',
      isAllowed: true,
      saleId: event.saleId,
      reservationId: event.reservationId,
      alreadyAdmittedCount: 0,
      maxCapacityPax: asset?.paxCapacity || 6,
    });
  }
}
