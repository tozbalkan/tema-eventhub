export type SalesChannelType = 'ExternalChannel' | 'Desk' | 'Partner';

export interface SalesChannelVO {
  type: SalesChannelType;
  name: string;
  reference?: string;
}

export interface PurchaserSnapshotVO {
  fullName: string;
  phone: string;
  email: string;
}
