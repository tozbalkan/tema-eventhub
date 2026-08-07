import { SystemRole } from '../types/identity';

export type PermissionAction =
  | 'venues.create'
  | 'venues.update'
  | 'venues.archive'
  | 'events.create'
  | 'events.publish'
  | 'events.update'
  | 'events.archive'
  | 'floorplan.edit'
  | 'reservations.create'
  | 'reservations.cancel'
  | 'sales.create'
  | 'sales.refund'
  | 'admissions.checkin'
  | 'accounting.view'
  | 'accounting.adjust';

export const ROLE_PERMISSIONS: Record<SystemRole, PermissionAction[] | '*'> = {
  SuperAdmin: '*',
  VenueManager: [
    'venues.create',
    'venues.update',
    'venues.archive',
    'events.create',
    'events.publish',
    'events.update',
    'events.archive',
    'floorplan.edit',
  ],
  EventManager: [
    'events.create',
    'events.publish',
    'events.update',
    'floorplan.edit',
    'reservations.create',
    'reservations.cancel',
    'sales.create',
  ],
  FinanceOperator: [
    'accounting.view',
    'accounting.adjust',
    'sales.refund',
  ],
  CheckInOperator: [
    'admissions.checkin',
  ],
  Viewer: [],
};
