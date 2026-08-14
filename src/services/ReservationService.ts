import type { PoolClient } from 'pg';
import { MockDataStore } from '@/repositories/mock/MockRepositories';
import { Reservation, CancellationReason } from '@/types/reservation';
import { VenueService } from './VenueService';
import { IdGenerator } from '@/platform/IdGenerator';
import { ClockProvider } from '@/platform/ClockProvider';
import { CustomerCrmService } from './CustomerCrmService';
import { NotificationService } from './NotificationService';

export interface CreateReservationDTO {
  eventId: string;
  assetId: string;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  guestCountPax: number;
  notes?: string;
  expirationHours?: number;
  organizationId?: string;
  customerId?: string;
}

export class ReservationService {
  public static getReservations(): Reservation[] {
    return MockDataStore.reservations.filter((r) => !r.isArchived);
  }

  public static createReservation(dto: CreateReservationDTO): Reservation {
    const asset = VenueService.getAssetById(dto.assetId);
    if (!asset) throw new Error('Asset not found');

    if (asset.status === 'Sold') {
      throw new Error('SEAT_ALREADY_RESERVED: Asset is already sold.');
    }
    if (asset.status === 'Blocked') {
      throw new Error('SEAT_BLOCKED: Asset is blocked.');
    }
    if (asset.status === 'Reserved') {
      throw new Error('SEAT_ALREADY_RESERVED: Asset is currently reserved.');
    }

    const now = ClockProvider.now();
    const expHours = dto.expirationHours || 24;
    const expirationDate = new Date(now.getTime() + expHours * 3600000).toISOString();

    const reservation: Reservation = {
      id: IdGenerator.generateUUIDv7(),
      organizationId: dto.organizationId || MockDataStore.organizationId,
      eventId: dto.eventId,
      eventRevisionNumber: 1,
      assetId: dto.assetId,
      customerId: dto.customerId || IdGenerator.generateUUIDv7(),
      customerName: dto.customerName,
      customerPhone: dto.customerPhone,
      customerEmail: dto.customerEmail,
      guestCountPax: dto.guestCountPax,
      status: 'Confirmed',
      expirationDate,
      version: 1,
      isArchived: false,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    };

    MockDataStore.reservations.push(reservation);
    asset.status = 'Reserved';

    // Operational CRM & Transactional Notification integration
    CustomerCrmService.upsertCustomer({
      fullName: dto.customerName,
      phone: dto.customerPhone,
      email: dto.customerEmail,
      source: 'Phone',
      tags: ['VIP'],
    });
    NotificationService.sendReservationNotification(reservation, asset.name || 'VIP Masa');

    return reservation;
  }

  public static getReservationById(id: string): Reservation | undefined {
    return MockDataStore.reservations.find((r) => r.id === id && !r.isArchived);
  }

  public static cancelReservation(id: string, reason: CancellationReason = 'CUSTOMER'): Reservation {
    const reservation = ReservationService.getReservationById(id);
    if (!reservation) throw new Error('Reservation not found');

    if (reservation.status === 'Cancelled' || reservation.status === 'Expired') {
      throw new Error('RESERVATION_ALREADY_CLOSED: Reservation is already closed.');
    }
    if (reservation.status === 'ConvertedToSale') {
      throw new Error('RESERVATION_ALREADY_CONVERTED: Reservation has already been converted to sale.');
    }

    reservation.status = 'Cancelled';
    reservation.cancellationReason = reason;
    reservation.updatedAt = ClockProvider.now().toISOString();

    const asset = VenueService.getAssetById(reservation.assetId);
    if (asset) {
      asset.status = 'Available';
    }
    return reservation;
  }

  public static convertReservationToSale(id: string): Reservation {
    const reservation = ReservationService.getReservationById(id);
    if (!reservation) throw new Error('Reservation not found');

    if (reservation.status === 'Cancelled') {
      throw new Error('RESERVATION_CANCELLED: Cannot convert cancelled reservation.');
    }
    if (reservation.status === 'Expired' || new Date(reservation.expirationDate).getTime() < ClockProvider.now().getTime()) {
      throw new Error('RESERVATION_EXPIRED: Cannot convert expired reservation.');
    }

    reservation.status = 'ConvertedToSale';
    reservation.updatedAt = ClockProvider.now().toISOString();
    return reservation;
  }

  public static expireReservations(): number {
    const now = ClockProvider.now().getTime();
    let expiredCount = 0;

    MockDataStore.reservations.forEach((r) => {
      if (r.status === 'Confirmed' && new Date(r.expirationDate).getTime() < now) {
        r.status = 'Expired';
        r.updatedAt = ClockProvider.now().toISOString();
        const asset = VenueService.getAssetById(r.assetId);
        if (asset) {
          asset.status = 'Available';
        }
        expiredCount++;
      }
    });

    return expiredCount;
  }

  /**
   * Creates a new reservation hold in PostgreSQL.
   * Executed within an active PoolClient transaction block.
   * Lock order: venue_asset_projections FIRST, reservations SECOND.
   */
  public static async createReservationPg(
    client: PoolClient,
    dto: CreateReservationDTO
  ): Promise<Reservation> {
    // 1. Canonical Lock Order: Lock asset projection FIRST
    const projRes = await client.query(
      `SELECT asset_id, status FROM venue_asset_projections WHERE asset_id = $1 FOR UPDATE`,
      [dto.assetId]
    );

    if (projRes.rows.length === 0) {
      throw new Error(`Asset not found: ${dto.assetId}`);
    }

    const proj = projRes.rows[0];
    if (proj.status === 'Sold') {
      throw new Error(`SEAT_ALREADY_RESERVED: Asset ${dto.assetId} is already sold.`);
    }
    if (proj.status === 'Blocked') {
      throw new Error(`SEAT_BLOCKED: Asset ${dto.assetId} is blocked.`);
    }
    if (proj.status === 'Reserved') {
      throw new Error(`SEAT_ALREADY_RESERVED: Asset ${dto.assetId} is currently reserved.`);
    }

    const resId = IdGenerator.generateUUIDv7();
    const expHours = dto.expirationHours || 24;
    const nowISO = new Date().toISOString();
    const expirationDate = new Date(Date.now() + expHours * 3600000).toISOString();
    const orgId = dto.organizationId || 'org_stageops_01';
    const customerId = dto.customerId || IdGenerator.generateUUIDv7();

    // 2. Insert reservation row
    await client.query(
      `INSERT INTO reservations (
        id, organization_id, event_id, asset_id, customer_id, customer_name,
        customer_phone, customer_email, guest_count_pax, status, expiration_date, version, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'Confirmed', $10, 1, $11, $11);`,
      [
        resId,
        orgId,
        dto.eventId,
        dto.assetId,
        customerId,
        dto.customerName,
        dto.customerPhone,
        dto.customerEmail,
        dto.guestCountPax,
        expirationDate,
        nowISO,
      ]
    );

    // 3. Update asset projection status to 'Reserved' and link reservation_id
    await client.query(
      `UPDATE venue_asset_projections
       SET status = 'Reserved', occupancy_state = 'Reserved', reservation_id = $1, version = version + 1, last_updated = NOW()
       WHERE asset_id = $2;`,
      [resId, dto.assetId]
    );

    return {
      id: resId,
      organizationId: orgId,
      eventId: dto.eventId,
      eventRevisionNumber: 1,
      assetId: dto.assetId,
      customerId,
      customerName: dto.customerName,
      customerPhone: dto.customerPhone,
      customerEmail: dto.customerEmail,
      guestCountPax: dto.guestCountPax,
      status: 'Confirmed',
      expirationDate,
      version: 1,
      isArchived: false,
      createdAt: nowISO,
      updatedAt: nowISO,
    };
  }

  /**
   * Cancels a PostgreSQL reservation hold.
   * Executed within an active PoolClient transaction block.
   *
   * Canonical Lock Acquisition Order:
   * 1. Finds target asset_id.
   * 2. Locks associated `venue_asset_projections` row FIRST (`FOR UPDATE`).
   * 3. Locks `reservations` row SECOND (`FOR UPDATE`).
   * Guarantees zero deadlock hazards when racing against sales or expiration workers.
   */
  public static async cancelReservationPg(
    client: PoolClient,
    id: string,
    reason: CancellationReason = 'CUSTOMER'
  ): Promise<Reservation> {
    // 0. Peek reservation to find target asset_id
    const targetRes = await client.query(`SELECT id, asset_id, status FROM reservations WHERE id = $1`, [id]);
    if (targetRes.rows.length === 0) throw new Error('Reservation not found');

    const assetId = targetRes.rows[0].asset_id;

    // 1. Lock associated asset projection FIRST (Canonical Lock Order)
    const projRes = await client.query(`SELECT * FROM venue_asset_projections WHERE asset_id = $1 FOR UPDATE`, [assetId]);

    // 2. Lock reservation row SECOND
    const resDb = await client.query(`SELECT * FROM reservations WHERE id = $1 FOR UPDATE`, [id]);
    if (resDb.rows.length === 0) throw new Error('Reservation not found');

    const res = resDb.rows[0];
    if (res.status === 'Cancelled' || res.status === 'Expired') {
      throw new Error('RESERVATION_ALREADY_CLOSED: Reservation is already closed.');
    }
    if (res.status === 'ConvertedToSale') {
      throw new Error('RESERVATION_ALREADY_CONVERTED: Reservation has already been converted to sale.');
    }

    const nowISO = new Date().toISOString();

    // 3. Update reservation status to Cancelled
    await client.query(
      `UPDATE reservations SET status = 'Cancelled', cancellation_reason = $1, version = version + 1, updated_at = $2 WHERE id = $3`,
      [reason, nowISO, id]
    );

    // 4. Release asset projection back to Available if still reserved by this reservation
    if (projRes.rows.length > 0 && projRes.rows[0].reservation_id === id) {
      await client.query(
        `UPDATE venue_asset_projections
         SET status = 'Available', occupancy_state = 'Vacant', reservation_id = NULL, version = version + 1, last_updated = NOW()
         WHERE asset_id = $1 AND reservation_id = $2`,
        [assetId, id]
      );
    }

    return {
      id: res.id,
      organizationId: res.organization_id,
      eventId: res.event_id,
      eventRevisionNumber: 1,
      assetId: res.asset_id,
      customerId: res.customer_id || IdGenerator.generateUUIDv7(),
      customerName: res.customer_name,
      customerPhone: res.customer_phone,
      customerEmail: res.customer_email,
      guestCountPax: res.guest_count_pax,
      status: 'Cancelled',
      cancellationReason: reason,
      expirationDate: new Date(res.expiration_date).toISOString(),
      version: res.version + 1,
      isArchived: false,
      createdAt: new Date(res.created_at).toISOString(),
      updatedAt: nowISO,
    };
  }

  /**
   * Background expiration worker for PostgreSQL reservations.
   *
   * Canonical Lock Acquisition Order:
   * 1. Queries expired confirmed reservation candidates.
   * 2. Locks associated `venue_asset_projections` row FIRST (`FOR UPDATE`).
   * 3. Locks `reservations` row SECOND (`FOR UPDATE`).
   * 4. Transitions reservation status to `Expired` and releases asset to `Available`.
   * Eliminates cross-table deadlock hazards under high worker concurrency.
   */
  public static async expireReservationsPg(client: PoolClient): Promise<number> {
    const expiredCandidates = await client.query(
      `SELECT id, asset_id FROM reservations WHERE status = 'Confirmed' AND expiration_date < NOW()`
    );

    let count = 0;
    const nowISO = new Date().toISOString();

    for (const candidate of expiredCandidates.rows) {
      // 1. Lock asset projection FIRST (Canonical Lock Order)
      const assetRes = await client.query(
        `SELECT asset_id, status, reservation_id FROM venue_asset_projections WHERE asset_id = $1 FOR UPDATE`,
        [candidate.asset_id]
      );

      // 2. Lock reservation row SECOND
      const resLock = await client.query(
        `SELECT id, status FROM reservations WHERE id = $1 AND status = 'Confirmed' FOR UPDATE`,
        [candidate.id]
      );

      if (resLock.rows.length > 0) {
        // 3. Update reservation status to Expired
        await client.query(
          `UPDATE reservations SET status = 'Expired', version = version + 1, updated_at = $1 WHERE id = $2`,
          [nowISO, candidate.id]
        );

        // 4. Release asset projection back to Available if currently reserved by this reservation
        if (assetRes.rows.length > 0 && assetRes.rows[0].reservation_id === candidate.id && assetRes.rows[0].status === 'Reserved') {
          await client.query(
            `UPDATE venue_asset_projections
             SET status = 'Available', occupancy_state = 'Vacant', reservation_id = NULL, version = version + 1, last_updated = NOW()
             WHERE asset_id = $1 AND reservation_id = $2 AND status = 'Reserved'`,
            [candidate.asset_id, candidate.id]
          );
        }
        count++;
      }
    }

    return count;
  }
}
