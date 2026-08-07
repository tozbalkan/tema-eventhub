export type CheckInStatus = 'Completed' | 'Denied' | 'Flagged';

export interface CheckIn {
  id: string; // UUID v7
  organizationId: string;
  eventId: string;
  venueAssetId: string;
  reservationId?: string;
  saleId?: string;
  gateId: string;
  guestName?: string;
  checkedInAt: string;
  checkedInBy: string;
  status: CheckInStatus;
  denialReason?: string;
}
