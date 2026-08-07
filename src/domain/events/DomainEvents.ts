import { DomainEvent, EventHeader } from '@/application/EventBus';

export interface SaleRecordedDomainEvent extends DomainEvent {
  eventName: 'SaleRecorded';
  header: EventHeader;
  saleId: string;
  eventId: string;
}

export interface ReservationPlacedDomainEvent extends DomainEvent {
  eventName: 'ReservationPlaced';
  header: EventHeader;
  reservationId: string;
  eventId: string;
  assetId: string;
}

export interface ReservationConfirmedDomainEvent extends DomainEvent {
  eventName: 'ReservationConfirmed';
  header: EventHeader;
  reservationId: string;
  eventId: string;
  assetId: string;
}

export interface ReservationExpiredDomainEvent extends DomainEvent {
  eventName: 'ReservationExpired';
  header: EventHeader;
  reservationId: string;
  assetId: string;
}

export interface ReservationReleasedDomainEvent extends DomainEvent {
  eventName: 'ReservationReleased';
  header: EventHeader;
  reservationId: string;
  assetId: string;
}

export interface ReservationCancelledDomainEvent extends DomainEvent {
  eventName: 'ReservationCancelled';
  header: EventHeader;
  reservationId: string;
  assetId: string;
}

export interface ReservationConvertedToSaleDomainEvent extends DomainEvent {
  eventName: 'ReservationConvertedToSale';
  header: EventHeader;
  reservationId: string;
  saleId: string;
  assetId: string;
}

export interface AdmissionRecordedDomainEvent extends DomainEvent {
  eventName: 'AdmissionRecorded';
  header: EventHeader;
  admissionId: string;
  saleId?: string;
  assetId: string;
  gateId: string;
  result: 'Granted' | 'Denied' | 'AlreadyAdmitted' | 'ReservationExpired' | 'WrongVenue' | 'Blocked';
}
