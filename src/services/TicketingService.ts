import { MockDataStore } from '@/repositories/mock/MockRepositories';
import { ReservationTicket } from '@/types/ticket';
import { IdGenerator } from '@/platform/IdGenerator';
import { ClockProvider } from '@/platform/ClockProvider';

export interface IssueTicketDTO {
  reservationId: string;
  saleId: string;
  venueAssetId: string;
  assetName: string;
}

export class TicketingService {
  public static issueTicket(dto: IssueTicketDTO): ReservationTicket {
    const nowISO = ClockProvider.nowISO();
    const ticket: ReservationTicket = {
      id: IdGenerator.generateUUIDv7(),
      organizationId: MockDataStore.organizationId,
      reservationId: dto.reservationId,
      saleId: dto.saleId,
      venueAssetId: dto.venueAssetId,
      token: IdGenerator.generateTicketToken(dto.assetName),
      status: 'Active',
      version: 1,
      expiresAt: '2026-08-16T05:00:00Z',
      createdAt: nowISO,
    };
    MockDataStore.tickets.push(ticket);
    return ticket;
  }
}
