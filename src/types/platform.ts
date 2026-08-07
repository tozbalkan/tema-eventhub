export interface TicketPlatform {
  id: string; // e.g. "biletix", "passo", "bugece", "direct"
  name: string;
  commissionPercentage: number; // e.g. 6.0 for 6%
  isArchived: boolean;
  archivedAt?: string | null;
}
