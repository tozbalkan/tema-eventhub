import { DomainEvent, EventHeader } from '@/application/EventBus';

export const DomainEventNames = {
  SaleRecorded: 'SaleRecorded',
  ReservationPlaced: 'ReservationPlaced',
  ReservationConfirmed: 'ReservationConfirmed',
  ReservationExpired: 'ReservationExpired',
  ReservationReleased: 'ReservationReleased',
  ReservationCancelled: 'ReservationCancelled',
  ReservationConvertedToSale: 'ReservationConvertedToSale',
  AdmissionRecorded: 'AdmissionRecorded',
} as const;

export interface SaleRecordedDomainEvent extends DomainEvent {
  eventName: typeof DomainEventNames.SaleRecorded;
  header: EventHeader;
  saleId: string;
  eventId: string;
}

export interface ReservationPlacedDomainEvent extends DomainEvent {
  eventName: typeof DomainEventNames.ReservationPlaced;
  header: EventHeader;
  reservationId: string;
  eventId: string;
  assetId: string;
}

export interface ReservationConfirmedDomainEvent extends DomainEvent {
  eventName: typeof DomainEventNames.ReservationConfirmed;
  header: EventHeader;
  reservationId: string;
  eventId: string;
  assetId: string;
}

export interface ReservationExpiredDomainEvent extends DomainEvent {
  eventName: typeof DomainEventNames.ReservationExpired;
  header: EventHeader;
  reservationId: string;
  assetId: string;
}

export interface ReservationReleasedDomainEvent extends DomainEvent {
  eventName: typeof DomainEventNames.ReservationReleased;
  header: EventHeader;
  reservationId: string;
  assetId: string;
}

export interface ReservationCancelledDomainEvent extends DomainEvent {
  eventName: typeof DomainEventNames.ReservationCancelled;
  header: EventHeader;
  reservationId: string;
  assetId: string;
}

export interface ReservationConvertedToSaleDomainEvent extends DomainEvent {
  eventName: typeof DomainEventNames.ReservationConvertedToSale;
  header: EventHeader;
  reservationId: string;
  saleId: string;
  assetId: string;
}

export interface AdmissionRecordedDomainEvent extends DomainEvent {
  eventName: typeof DomainEventNames.AdmissionRecorded;
  header: EventHeader;
  admissionId: string;
  saleId?: string;
  assetId: string;
  gateId: string;
  result: 'Granted' | 'Denied' | 'AlreadyAdmitted' | 'ReservationExpired' | 'WrongVenue' | 'Blocked';
}
