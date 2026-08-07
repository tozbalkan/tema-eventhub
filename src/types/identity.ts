export type SystemRole =
  | 'SuperAdmin'
  | 'VenueManager'
  | 'EventManager'
  | 'FinanceOperator'
  | 'CheckInOperator'
  | 'Viewer';

export type ScopeType = 'Organization' | 'Venue' | 'Event' | 'Gate';

export interface Scope {
  type: ScopeType;
  id: string; // Target Scope UUID
}

export interface User {
  id: string; // UUID v7
  email: string;
  fullName: string;
  createdAt: string;
}

export interface Membership {
  id: string;
  userId: string;
  organizationId: string;
  role: SystemRole;
  scopes: Scope[];
}
