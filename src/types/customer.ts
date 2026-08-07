export type CustomerTag =
  | 'VIP'
  | 'Blacklist'
  | 'Corporate'
  | 'Influencer'
  | 'Agency';

export type CustomerSource =
  | 'Biletix'
  | 'Passo'
  | 'Instagram'
  | 'Phone'
  | 'Walk-in'
  | 'Referral'
  | 'Corporate';

export interface CustomerNote {
  id: string;
  date: string;
  author: string;
  content: string;
}

export interface Customer {
  id: string; // UUID v7
  organizationId: string;
  fullName: string;
  phone: string; // Mandatory
  email: string; // Mandatory
  company?: string;
  birthday?: string;
  tags: CustomerTag[];
  source: CustomerSource;
  notesTimeline: CustomerNote[];
  mergedIntoCustomerId?: string; // If merged into another customer
  
  version: number;
  isArchived: boolean;
  archivedAt?: string | null;
  archivedBy?: string | null;
  createdAt: string;
  updatedAt: string;
}
