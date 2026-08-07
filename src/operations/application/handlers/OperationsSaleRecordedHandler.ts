import { SaleRecordedDomainEvent } from '@/domain/events/DomainEvents';
import { VenueAssetProjection } from '../../projections/VenueAssetProjection';
import { AdmissionRightsProjection } from '../../projections/AdmissionRightsProjection';
import { VenueService } from '@/services/VenueService';
import { MockDataStore } from '@/repositories/mock/MockRepositories';
import { ConsumerIdempotencyStore } from '@/platform/ConsumerIdempotencyStore';

const CONSUMER_NAME = 'OperationsSaleRecordedHandler';

export class OperationsSaleRecordedHandler {
  public static handle(event: SaleRecordedDomainEvent): void {
    // Consumer Idempotency: skip if this event was already processed by this handler
    if (ConsumerIdempotencyStore.isAlreadyProcessed(event.header.eventId, CONSUMER_NAME)) {
      return;
    }

    const sale = MockDataStore.sales.find((s) => s.id === event.saleId);
    if (!sale) {
      // Throw to trigger Outbox retry — silent return would mark event as Published and lose it
      throw new Error(`[${CONSUMER_NAME}] Sale ${event.saleId} not found. Event will be retried via Outbox backoff.`);
    }

    // Support multi-asset sales natively by reading lines from Sale aggregate
    sale.lines.forEach((line) => {
      if (!line.venueAssetId) return;
      const assetId = line.venueAssetId;

      // 1. Update VenueAssetProjection Read Model to Sold
      VenueAssetProjection.updateAssetStatus(assetId, 'Sold', sale.id, sale.reservationId);
      VenueService.updateAsset(assetId, { status: 'Sold' });

      // 2. Set AdmissionRightsProjection
      const asset = VenueService.getAssetById(assetId);

      AdmissionRightsProjection.setRight({
        assetId,
        purchaserName: sale.purchaserSnapshot?.fullName || 'VIP Misafir',
        isAllowed: true,
        saleId: sale.id,
        reservationId: sale.reservationId,
        alreadyAdmittedCount: 0,
        maxCapacityPax: asset?.paxCapacity || 6,
      });
    });

    // Mark as processed — future retries will be safely skipped
    ConsumerIdempotencyStore.markProcessed(event.header.eventId, CONSUMER_NAME);
  }
}
