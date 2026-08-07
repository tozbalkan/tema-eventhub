export interface SalesChannel {
  id: string; // e.g. "biletix", "passo", "desk", "corporate", "partner"
  name: string; // e.g. "Biletix", "Passo", "Organizer Desk", "Corporate Agency"
  commissionPercentage: number; // e.g. 6.0 for 6%
  isArchived: boolean;
  archivedAt?: string | null;
}
