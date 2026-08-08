import { PoolClient } from 'pg';
import { MockDataStore } from '@/repositories/mock/MockRepositories';
import { Reservation, CancellationReason } from '@/types/reservation';
import { VenueService } from './VenueService';
import { IdGenerator } from '@/platform/IdGenerator';
import { ClockProvider } from '@/platform/ClockProvider';

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
    if (asset.status === 'Reserved') {
      throw new Error('SEAT_ALREADY_RESERVED: Asset is currently reserved.');
    }
    if (asset.status === 'Blocked') {
      throw new Error('SEAT_BLOCKED: Asset is blocked.');
    }

    // Update Asset Status to Reserved
    VenueService.updateAsset(dto.assetId, { status: 'Reserved' });

    // Customer lookup or creation
    let customer = MockDataStore.customers.find(
      (c) => c.phone === dto.customerPhone || c.email === dto.customerEmail
    );
    if (!customer) {
      customer = {
        id: IdGenerator.generateUUIDv7(),
        organizationId: dto.organizationId || MockDataStore.organizationId,
        fullName: dto.customerName,
        phone: dto.customerPhone,
        email: dto.customerEmail,
        tags: ['VIP'],
        source: 'Phone',
        notesTimeline: [],
        version: 1,
        isArchived: false,
        createdAt: ClockProvider.nowISO(),
        updatedAt: ClockProvider.nowISO(),
      };
      MockDataStore.customers.push(customer);
    }

    const expHours = dto.expirationHours || 24;
    const expDate = new Date(ClockProvider.now().getTime() + expHours * 60 * 60 * 1000).toISOString();

    const reservation: Reservation = {
      id: IdGenerator.generateUUIDv7(),
      organizationId: dto.organizationId || MockDataStore.organizationId,
      eventId: dto.eventId,
      eventRevisionNumber: 1,
      assetId: dto.assetId,
      customerId: customer.id,
      customerName: dto.customerName,
      customerPhone: dto.customerPhone,
      customerEmail: dto.customerEmail,
      guestCountPax: dto.guestCountPax,
      notes: dto.notes,
      expirationDate: expDate,
      status: 'Confirmed',
      version: 1,
      isArchived: false,
      createdAt: ClockProvider.nowISO(),
      updatedAt: ClockProvider.nowISO(),
    };

    MockDataStore.reservations.push(reservation);
    return reservation;
  }

  /**
   * Creates a reservation in PostgreSQL transaction mode (Authoritative Mode).
   * 
   * Transaction Contract: Must be invoked inside an active UnitOfWork transaction block (`PoolClient`).
   * Canonical Global Lock Order:
   * 1. Lock asset projection (venue_asset_projections) FIRST (FOR UPDATE).
   * 2. Insert reservation record into reservations table SECOND.
   * 3. Update venue_asset_projections status to 'Reserved' and set reservation_id.
   */
  public static async createReservationPg(client: PoolClient, dto: CreateReservationDTO): Promise<Reservation> {
    // 1. Canonical Lock Order Step 1: Lock venue asset projection FIRST
    const assetRes = await client.query('SELECT * FROM venue_asset_projections WHERE asset_id = $1 FOR UPDATE', [dto.assetId]);
    if (assetRes.rows.length === 0) {
      throw new Error(`Asset not found: ${dto.assetId}`);
    }

    const assetRow = assetRes.rows[0];
    if (assetRow.status === 'Sold') {
      throw new Error('SEAT_ALREADY_RESERVED: Asset is already sold.');
    }
    if (assetRow.status === 'Reserved') {
      throw new Error('SEAT_ALREADY_RESERVED: Asset is currently reserved.');
    }
    if (assetRow.status === 'Blocked') {
      throw new Error('SEAT_BLOCKED: Asset is blocked.');
    }

    const reservationId = IdGenerator.generateUUIDv7();
    const customerId = IdGenerator.generateUUIDv7();
    const orgId = dto.organizationId || 'org_stageops_01';
    const expHours = dto.expirationHours || 24;
    const expDate = new Date(Date.now() + expHours * 60 * 60 * 1000).toISOString();
    const nowISO = new Date().toISOString();

    // 2. Canonical Lock Order Step 2: Insert into PostgreSQL reservations table SECOND
    await client.query(
      `INSERT INTO reservations (
        id, organization_id, event_id, asset_id, customer_id, customer_name, customer_phone, customer_email, guest_count_pax, status, expiration_date, version, created_at, updated_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'Confirmed', $10, 1, $11, $11);`,
      [reservationId, orgId, dto.eventId, dto.assetId, customerId, dto.customerName, dto.customerPhone, dto.customerEmail, dto.guestCountPax, expDate, nowISO]
    );

    // 3. Update venue_asset_projections to Reserved with version increment
    await client.query(
      `UPDATE venue_asset_projections
       SET status = 'Reserved', occupancy_state = 'Reserved', reservation_id = $1, version = version + 1, last_updated = NOW()
       WHERE asset_id = $2;`,
      [reservationId, dto.assetId]
    );

    return {
      id: reservationId,
      organizationId: orgId,
      eventId: dto.eventId,
      eventRevisionNumber: 1,
      assetId: dto.assetId,
      customerId,
      customerName: dto.customerName,
      customerPhone: dto.customerPhone,
      customerEmail: dto.customerEmail,
      guestCountPax: dto.guestCountPax,
      notes: dto.notes,
      expirationDate: expDate,
      status: 'Confirmed',
      version: 1,
      isArchived: false,
      createdAt: nowISO,
      updatedAt: nowISO,
    };
  }

  public static cancelReservation(id: string, reason: 'CUSTOMER' | 'ORGANIZER' | 'PAYMENT_TIMEOUT'): Reservation {
    const reservation = MockDataStore.reservations.find((r) => r.id === id);
    if (!reservation) throw new Error('Reservation not found');

    if (reservation.status === 'Cancelled' || reservation.status === 'Expired') {
      throw new Error('RESERVATION_ALREADY_CLOSED');
    }

    reservation.status = 'Cancelled';
    reservation.cancellationReason = reason;
    reservation.updatedAt = ClockProvider.nowISO();

    // Release Asset back to Available
    VenueService.updateAsset(reservation.assetId, { status: 'Available' });

    return reservation;
  }

  /**
   * Cancels a reservation in PostgreSQL transaction mode.
   * 
   * Transaction Contract: Must be invoked inside an active UnitOfWork transaction block (`PoolClient`).
   * Canonical Global Lock Order:
   * 1. Lock reservation row FIRST (FOR UPDATE) or lock associated asset projection.
   * 2. Lock venue asset projection SECOND (FOR UPDATE).
   * 3. Perform state mutations with aggregate version increment.
   */
  public static async cancelReservationPg(client: PoolClient, id: string, reason: CancellationReason): Promise<Reservation> {
    // 1. Lock reservation row FIRST
    const resResult = await client.query('SELECT * FROM reservations WHERE id = $1 FOR UPDATE', [id]);
    if (resResult.rows.length === 0) {
      throw new Error('Reservation not found');
    }

    const row = resResult.rows[0];
    if (row.status === 'Cancelled' || row.status === 'Expired') {
      throw new Error('RESERVATION_ALREADY_CLOSED');
    }
    if (row.status === 'ConvertedToSale') {
      throw new Error('RESERVATION_ALREADY_CONVERTED: Cannot cancel a reservation already converted to a sale.');
    }

    // 2. Lock asset projection SECOND (Canonical Lock Order)
    const assetRes = await client.query('SELECT * FROM venue_asset_projections WHERE asset_id = $1 FOR UPDATE', [row.asset_id]);

    const nowISO = new Date().toISOString();
    const newVersion = row.version + 1;

    // 3. Mutate reservation status with version increment
    await client.query(
      `UPDATE reservations
       SET status = 'Cancelled', cancellation_reason = $1, version = $2, updated_at = $3
       WHERE id = $4 AND status = 'Confirmed'`,
      [reason, newVersion, nowISO, id]
    );

    // 4. Release asset projection back to Available if currently linked to this reservation
    if (assetRes.rows.length > 0 && assetRes.rows[0].reservation_id === id) {
      await client.query(
        `UPDATE venue_asset_projections
         SET status = 'Available', occupancy_state = 'Vacant', reservation_id = NULL, version = version + 1, last_updated = NOW()
         WHERE asset_id = $1 AND reservation_id = $2`,
        [row.asset_id, id]
      );
    }

    return {
      id: row.id,
      organizationId: row.organization_id,
      eventId: row.event_id,
      eventRevisionNumber: 1,
      assetId: row.asset_id,
      customerId: row.customer_id,
      customerName: row.customer_name,
      customerPhone: row.customer_phone,
      customerEmail: row.customer_email,
      guestCountPax: row.guest_count_pax,
      expirationDate: row.expiration_date,
      status: 'Cancelled',
      cancellationReason: reason,
      version: newVersion,
      isArchived: false,
      createdAt: row.created_at,
      updatedAt: nowISO,
    };
  }

  /**
   * Background expiration worker for PostgreSQL reservations.
   * 
   * Transaction Contract: Must be invoked inside an active UnitOfWork transaction block (`PoolClient`).
   * Uses FOR UPDATE SKIP LOCKED to allow concurrent workers without lock contention.
   */
  public static async expireReservationsPg(client: PoolClient): Promise<number> {
    // 1. Lock expired confirmed reservations (SKIP LOCKED)
    const expiredRes = await client.query(
      `SELECT * FROM reservations WHERE status = 'Confirmed' AND expiration_date < NOW() FOR UPDATE SKIP LOCKED`
    );

    let count = 0;
    const nowISO = new Date().toISOString();

    for (const row of expiredRes.rows) {
      // 2. Lock associated asset projection SECOND
      const assetRes = await client.query('SELECT * FROM venue_asset_projections WHERE asset_id = $1 FOR UPDATE', [row.asset_id]);

      // 3. Update reservation status to Expired with version increment
      const updateRes = await client.query(
        `UPDATE reservations SET status = 'Expired', version = version + 1, updated_at = $1 WHERE id = $2 AND status = 'Confirmed'`,
        [nowISO, row.id]
      );

      if (updateRes.rowCount! > 0) {
        // 4. Release asset projection back to Available if still reserved by this reservation
        if (assetRes.rows.length > 0 && assetRes.rows[0].reservation_id === row.id && assetRes.rows[0].status === 'Reserved') {
          await client.query(
            `UPDATE venue_asset_projections
             SET status = 'Available', occupancy_state = 'Vacant', reservation_id = NULL, version = version + 1, last_updated = NOW()
             WHERE asset_id = $1 AND reservation_id = $2 AND status = 'Reserved'`,
            [row.asset_id, row.id]
          );
        }
        count++;
      }
    }

    return count;
  }
}
