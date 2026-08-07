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
  readonly eventName: typeof DomainEventNames.SaleRecorded;
  readonly header: EventHeader;
  readonly saleId: string;
  readonly eventId: string;
}

export interface ReservationPlacedDomainEvent extends DomainEvent {
  readonly eventName: typeof DomainEventNames.ReservationPlaced;
  readonly header: EventHeader;
  readonly reservationId: string;
  readonly eventId: string;
  readonly assetId: string;
}

export interface ReservationConfirmedDomainEvent extends DomainEvent {
  readonly eventName: typeof DomainEventNames.ReservationConfirmed;
  readonly header: EventHeader;
  readonly reservationId: string;
  readonly eventId: string;
  readonly assetId: string;
}

export interface ReservationExpiredDomainEvent extends DomainEvent {
  readonly eventName: typeof DomainEventNames.ReservationExpired;
  readonly header: EventHeader;
  readonly reservationId: string;
  readonly assetId: string;
}

export interface ReservationReleasedDomainEvent extends DomainEvent {
  readonly eventName: typeof DomainEventNames.ReservationReleased;
  readonly header: EventHeader;
  readonly reservationId: string;
  readonly assetId: string;
}

export interface ReservationCancelledDomainEvent extends DomainEvent {
  readonly eventName: typeof DomainEventNames.ReservationCancelled;
  readonly header: EventHeader;
  readonly reservationId: string;
  readonly assetId: string;
}

export interface ReservationConvertedToSaleDomainEvent extends DomainEvent {
  readonly eventName: typeof DomainEventNames.ReservationConvertedToSale;
  readonly header: EventHeader;
  readonly reservationId: string;
  readonly saleId: string;
  readonly assetId: string;
}

export interface AdmissionRecordedDomainEvent extends DomainEvent {
  readonly eventName: typeof DomainEventNames.AdmissionRecorded;
  readonly header: EventHeader;
  readonly admissionId: string;
  readonly saleId?: string;
  readonly assetId: string;
  readonly gateId: string;
  readonly result: 'Granted' | 'Denied' | 'AlreadyAdmitted' | 'ReservationExpired' | 'WrongVenue' | 'Blocked';
}
