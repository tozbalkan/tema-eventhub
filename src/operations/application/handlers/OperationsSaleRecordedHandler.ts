import { SaleRecordedDomainEvent } from '@/domain/events/DomainEvents';
import { MockDataStore } from '@/repositories/mock/MockRepositories';
import type { PoolClient } from 'pg';

export class OperationsSaleRecordedHandler {
  public static async handle(event: SaleRecordedDomainEvent, client?: PoolClient): Promise<void> {
    const eventId = event.header.eventId;
    const consumerName = 'OperationsSaleRecordedHandler';

    if (client) {
      // PostgreSQL Transactional & Idempotent Path
      const { PgConsumerIdempotencyStore } = await import('@/platform/pg/PgConsumerIdempotencyStore');
      const { AdmissionService } = await import('@/services/AdmissionService');

      await PgConsumerIdempotencyStore.processIdempotently(client, eventId, consumerName, async (tx) => {
        // 1. Fetch sale lines from PostgreSQL
        const linesRes = await tx.query(
          `SELECT venue_asset_id, quantity FROM sale_lines WHERE sale_id = $1`,
          [event.saleId]
        );

        // 2. Fetch sale purchaser details from PostgreSQL
        const saleRes = await tx.query(
          `SELECT purchaser_name, reservation_id FROM sales WHERE id = $1`,
          [event.saleId]
        );

        const purchaserName = saleRes.rows.length > 0 ? saleRes.rows[0].purchaser_name : undefined;
        const reservationId = saleRes.rows.length > 0 ? saleRes.rows[0].reservation_id : undefined;

        // 3. Mutate venue_asset_projections status to 'Sold' and initialize admission_rights
        for (const line of linesRes.rows) {
          const assetId = line.venue_asset_id;

          // Asset line quantity invariant validation
          if (line.quantity !== 1) {
            throw new Error(`INVALID_LINE_QUANTITY: Venue asset line quantity must equal 1 for asset ${assetId}.`);
          }

          // Lock and query asset projection for pax_capacity — NO MAGIC FALLBACK!
          const assetProjRes = await tx.query(
            `SELECT pax_capacity FROM venue_asset_projections WHERE asset_id = $1 FOR UPDATE`,
            [assetId]
          );

          if (assetProjRes.rows.length === 0) {
            throw new Error(`ASSET_PROJECTION_NOT_FOUND: Asset projection for ${assetId} not found in PostgreSQL. Database is authoritative.`);
          }

          const paxCapacity = assetProjRes.rows[0].pax_capacity;
          if (!paxCapacity || paxCapacity <= 0) {
            throw new Error(`INVALID_PAX_CAPACITY: Asset ${assetId} has invalid or zero pax_capacity in PostgreSQL.`);
          }

          // Update venue_asset_projections status to 'Sold'
          await tx.query(
            `UPDATE venue_asset_projections 
             SET status = 'Sold', occupancy_state = 'Sold', sale_id = $1, version = version + 1, last_updated = NOW() 
             WHERE asset_id = $2`,
            [event.saleId, assetId]
          );

          // Initialize admission_rights for gate scanning
          await AdmissionService.initializeAdmissionRightPg(tx, {
            assetId,
            saleId: event.saleId,
            reservationId: reservationId || undefined,
            purchaserName: purchaserName || undefined,
            maxCapacityPax: paxCapacity,
          });
        }
      });
      return;
    }

    // Legacy In-Memory Fallback Path
    const asset = MockDataStore.assets.find((a) => a.id === 'asset_vip_a1');
    if (asset) {
      asset.status = 'Sold';
    }
  }
}
