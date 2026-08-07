export type TemplateType =
  | 'VIP_CONCERT'
  | 'THEATER'
  | 'ARENA'
  | 'FESTIVAL'
  | 'CLUB'
  | 'RESTAURANT';

export interface Gate {
  id: string; // UUID v7
  organizationId: string;
  venueId: string;
  name: string; // e.g. "VIP Gate", "North Gate"
  floor?: string;
  zone?: string;
  isArchived: boolean;
  archivedAt?: string | null;
  archivedBy?: string | null;
}

export interface Device {
  id: string;
  name: string;
  gateId: string;
  lastSeenAt: string;
}

export interface Venue {
  id: string; // UUID v7
  organizationId: string;
  name: string;
  address?: string;
  city?: string;
  maxCapacity: number;
  fireCapacity: number;
  standingCapacity: number;
  seatedCapacity: number;
  version: number;
  isArchived: boolean;
  archivedAt?: string | null;
  archivedBy?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface FloorPlanTemplate {
  id: string;
  venueId: string;
  templateType: TemplateType;
  displayName: string; // e.g. "Harbiye VIP 2026"
  version: number;
  svgData: string;
  createdAt: string;
}
