import { CurrencyCode } from './money';

export type EventStatus =
  | 'Draft'
  | 'Published'
  | 'Live'
  | 'Completed'
  | 'Postponed'
  | 'Cancelled';

export type SalesAvailability =
  | 'OnSale'
  | 'Paused'
  | 'SoldOut'
  | 'Closed';

export type ChangeReason =
  | 'ORGANIZER_REQUEST'
  | 'VENUE_UNAVAILABLE'
  | 'ARTIST_REQUEST'
  | 'FORCE_MAJEURE'
  | 'WEATHER'
  | 'TECHNICAL_ISSUE'
  | 'OTHER';

export interface EventCapacitySnapshot {
  id: string;
  eventId: string;
  maxCapacity: number;
  fireCapacity: number;
  standingCapacity: number;
  seatedCapacity: number;
  takenAt: string;
}

export interface EventRevision {
  id: string; // UUID v7
  eventId: string;
  revisionNumber: number;
  effectiveAt: string;
  venueId: string;
  startsAt: string;
  endsAt: string;
  title: string;
  changeReason: ChangeReason;
  createdBy: string;
  notes?: string;
}

export interface Event {
  id: string; // UUID v7
  organizationId: string;
  venueId: string;
  floorPlanId: string;
  templateVersion: number;
  name: string;
  date: string;
  startTime: string;
  endTime: string;
  defaultCurrency: CurrencyCode;
  description?: string;
  assignedPlatforms: string[]; // Platform IDs e.g. ["biletix", "passo"]
  
  status: EventStatus;
  salesAvailability: SalesAvailability;
  currentRevisionNumber: number;
  
  capacitySnapshots?: EventCapacitySnapshot[];
  
  version: number;
  isArchived: boolean;
  archivedAt?: string | null;
  archivedBy?: string | null;
  createdAt: string;
  updatedAt: string;
}
