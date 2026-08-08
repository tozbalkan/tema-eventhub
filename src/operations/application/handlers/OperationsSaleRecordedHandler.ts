import { PoolClient } from 'pg';
import { SaleRecordedDomainEvent } from '@/domain/events/DomainEvents';
import { VenueAssetProjection } from '../../projections/VenueAssetProjection';
import { AdmissionRightsProjection } from '../../projections/AdmissionRightsProjection';
import { VenueService } from '@/services/VenueService';
import { MockDataStore } from '@/repositories/mock/MockRepositories';
import { ConsumerIdempotencyStore } from '@/platform/ConsumerIdempotencyStore';
import { PgConsumerIdempotencyStore } from '@/platform/pg/PgConsumerIdempotencyStore';
import { AdmissionService } from '@/services/AdmissionService';

const CONSUMER_NAME = 'OperationsSaleRecordedHandler';

export class OperationsSaleRecordedHandler {
  public static async handle(event: SaleRecordedDomainEvent, client?: PoolClient): Promise<void> {
    if (client) {
      // PostgreSQL Transactional Mode: Atomic idempotency check + business mutation in SAME PoolClient transaction
      await PgConsumerIdempotencyStore.processIdempotently(
        client,
        event.header.eventId,
        CONSUMER_NAME,
        async (tx) => {
          // Read sale from PostgreSQL
          const saleRes = await tx.query('SELECT * FROM sales WHERE id = $1', [event.saleId]);
          if (saleRes.rows.length === 0) {
            throw new Error(`[${CONSUMER_NAME}] Sale ${event.saleId} not found in PostgreSQL. Event will be retried via Outbox backoff.`);
          }
          const sale = saleRes.rows[0];

          // Read ALL sale lines from PostgreSQL
          const linesRes = await tx.query('SELECT * FROM sale_lines WHERE sale_id = $1', [event.saleId]);
          if (linesRes.rows.length === 0) {
            throw new Error(`[${CONSUMER_NAME}] Sale ${event.saleId} has no sale lines in PostgreSQL.`);
          }

          // Process ALL sale lines natively
          for (const line of linesRes.rows) {
            const assetId = line.venue_asset_id;
            if (!assetId) continue;

            const unitPrice = parseFloat(line.unit_price || sale.gross_price);

            // Read asset projection to obtain pax_capacity
            const assetProjRes = await tx.query('SELECT pax_capacity FROM venue_asset_projections WHERE asset_id = $1', [assetId]);
            const paxCapacity = assetProjRes.rows.length > 0 && assetProjRes.rows[0].pax_capacity > 0 ? assetProjRes.rows[0].pax_capacity : 6;

            // 1. Update venue_asset_projections table
            const assetQuery = `
              INSERT INTO venue_asset_projections (
                asset_id, name, category, status, display_color, occupancy_state, sale_id, reservation_id, pax_capacity, base_price, version, last_updated
              ) VALUES ($1, 'VIP Masa', 'VIP', 'Sold', 'hsl(350 80% 55%)', 'Occupied', $2, $3, $4, $5, 2, NOW())
              ON CONFLICT (asset_id) DO UPDATE SET
                status = 'Sold',
                occupancy_state = 'Occupied',
                sale_id = EXCLUDED.sale_id,
                reservation_id = EXCLUDED.reservation_id,
                version = venue_asset_projections.version + 1,
                last_updated = NOW();
            `;
            await tx.query(assetQuery, [assetId, sale.id, sale.reservation_id, paxCapacity, unitPrice]);

            // 2. Initialize admission_rights table
            await AdmissionService.initializeAdmissionRightPg(tx, {
              assetId,
              saleId: sale.id,
              reservationId: sale.reservation_id || undefined,
              purchaserName: sale.purchaser_name || 'VIP Misafir',
              maxCapacityPax: paxCapacity,
            });
          }
        }
      );
      return;
    }

    // In-Memory Reference Mode (for Next.js dev server & local mock)
    if (ConsumerIdempotencyStore.isAlreadyProcessed(event.header.eventId, CONSUMER_NAME)) {
      return;
    }

    const sale = MockDataStore.sales.find((s) => s.id === event.saleId);
    if (!sale) {
      throw new Error(`[${CONSUMER_NAME}] Sale ${event.saleId} not found. Event will be retried via Outbox backoff.`);
    }

    sale.lines.forEach((line) => {
      if (!line.venueAssetId) return;
      const assetId = line.venueAssetId;

      VenueAssetProjection.updateAssetStatus(assetId, 'Sold', sale.id, sale.reservationId);
      VenueService.updateAsset(assetId, { status: 'Sold' });

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

    ConsumerIdempotencyStore.markProcessed(event.header.eventId, CONSUMER_NAME);
  }
}
