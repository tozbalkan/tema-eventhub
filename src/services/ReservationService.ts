import { MockDataStore } from '@/repositories/mock/MockRepositories';
import { Reservation } from '@/types/reservation';
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
        organizationId: MockDataStore.organizationId,
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
      organizationId: MockDataStore.organizationId,
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
}
