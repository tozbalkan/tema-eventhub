export type TicketStatus =
  | 'Issued'
  | 'Active'
  | 'CheckedIn'
  | 'Expired'
  | 'Revoked'
  | 'Transferred'
  | 'Superseded';

export interface ReservationTicket {
  id: string; // UUID v7
  organizationId: string;
  reservationId: string;
  saleId?: string;
  venueAssetId: string;
  token: string; // Crypto token hash for QR rendering
  status: TicketStatus;
  version: number;
  supersededBy?: string;
  supersedes?: string;
  expiresAt: string;
  revokedAt?: string;
  createdAt: string;
}

export interface CheckIn {
  id: string; // UUID v7
  organizationId: string;
  eventId: string;
  reservationId: string;
  ticketId: string;
  gateId: string;
  deviceId?: string;
  checkedInAt: string;
  checkedInBy: string;
  status: 'Completed' | 'Revoked';
}
