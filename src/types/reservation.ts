export type ReservationStatus =
  | 'Pending'
  | 'Confirmed'
  | 'Cancelled'
  | 'Expired'
  | 'ConvertedToSale';

export type CancellationReason =
  | 'CUSTOMER'
  | 'ORGANIZER'
  | 'EVENT_CANCELLED'
  | 'PAYMENT_TIMEOUT'
  | 'DUPLICATE';

export interface ReservationHold {
  id: string; // UUID v7
  assetId: string;
  expiresAt: string;
  owner: string; // User/Session ID
  source: string; // e.g. "Desk", "Passo", "OnlineDraft"
  correlationId: string;
  status: 'Active' | 'Expired' | 'Released';
}

export interface Reservation {
  id: string; // UUID v7
  organizationId: string;
  eventId: string;
  eventRevisionNumber: number;
  assetId: string;
  customerId: string;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  guestCountPax: number;
  alcoholPreferences?: string[];
  notes?: string;
  expirationDate: string;
  status: ReservationStatus;
  cancellationReason?: CancellationReason;
  
  version: number;
  isArchived: boolean;
  archivedAt?: string | null;
  archivedBy?: string | null;
  createdAt: string;
  updatedAt: string;
}
