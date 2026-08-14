import { Customer, CustomerTag, CustomerSource, CustomerNote } from '@/types/customer';
import { Sale } from '@/types/sale';
import { Reservation } from '@/types/reservation';
import { CheckIn } from '@/types/check-in';
import { MockDataStore } from '@/repositories/mock/MockRepositories';
import { IdGenerator } from '@/platform/IdGenerator';

export interface CustomerHistorySummary {
  customer: Customer;
  salesHistory: (Sale & { assetName?: string; eventName?: string })[];
  reservationHistory: (Reservation & { assetName?: string; eventName?: string })[];
  checkInHistory: CheckIn[];
  lifetimeSpend: number;
  totalEventsAttended: number;
  activeReservationsCount: number;
  completedSalesCount: number;
}

export class CustomerCrmService {
  /**
   * Primary Customer Lookup Algorithm: Phone → Email
   * Normalized comparison (strips spaces, matches phone digits or case-insensitive email).
   */
  public static lookupCustomer(phone?: string, email?: string): Customer | null {
    const cleanPhone = phone ? phone.replace(/\s+/g, '').replace(/[^0-9+]/g, '') : '';
    const cleanEmail = email ? email.trim().toLowerCase() : '';

    if (!cleanPhone && !cleanEmail) return null;

    const customers = MockDataStore.customers.filter((c) => !c.isArchived);

    // 1. Phone match priority
    if (cleanPhone) {
      const matchByPhone = customers.find((c) => {
        const cPhone = c.phone.replace(/\s+/g, '').replace(/[^0-9+]/g, '');
        return cPhone && (cPhone === cleanPhone || cPhone.endsWith(cleanPhone.slice(-10)));
      });
      if (matchByPhone) return matchByPhone;
    }

    // 2. Email match priority
    if (cleanEmail) {
      const matchByEmail = customers.find(
        (c) => c.email && c.email.trim().toLowerCase() === cleanEmail
      );
      if (matchByEmail) return matchByEmail;
    }

    return null;
  }

  /**
   * Fetches full cross-event CRM profile and activity summary for a customer.
   */
  public static getCustomerProfileWithHistory(
    identifier: string
  ): CustomerHistorySummary | null {
    const term = identifier.trim();
    const customer =
      MockDataStore.customers.find((c) => c.id === term) ||
      CustomerCrmService.lookupCustomer(term, term);

    if (!customer) return null;

    const normPhone = customer.phone.replace(/\s+/g, '').replace(/[^0-9+]/g, '');
    const normEmail = customer.email.trim().toLowerCase();

    // 1. Find all cross-event sales matching phone, email, or customerId
    const salesHistory = MockDataStore.sales
      .filter((s) => {
        if (s.isArchived) return false;
        const pPhone = s.purchaserSnapshot?.phone?.replace(/\s+/g, '').replace(/[^0-9+]/g, '');
        const pEmail = s.purchaserSnapshot?.email?.trim().toLowerCase();
        return (
          (normPhone && pPhone && pPhone.endsWith(normPhone.slice(-10))) ||
          (normEmail && pEmail && pEmail === normEmail)
        );
      })
      .map((s) => {
        const assetId = s.lines[0]?.venueAssetId;
        const asset = MockDataStore.assets.find((a) => a.id === assetId);
        return {
          ...s,
          assetName: asset?.name || 'VIP Masa',
          eventName: MockDataStore.event.name,
        };
      });

    // 2. Find all cross-event reservations matching phone, email, or customerId
    const reservationHistory = MockDataStore.reservations
      .filter((r) => {
        if (r.isArchived) return false;
        const rPhone = r.customerPhone?.replace(/\s+/g, '').replace(/[^0-9+]/g, '');
        const rEmail = r.customerEmail?.trim().toLowerCase();
        return (
          r.customerId === customer.id ||
          (normPhone && rPhone && rPhone.endsWith(normPhone.slice(-10))) ||
          (normEmail && rEmail && rEmail === normEmail)
        );
      })
      .map((r) => {
        const asset = MockDataStore.assets.find((a) => a.id === r.assetId);
        return {
          ...r,
          assetName: asset?.name || 'VIP Masa',
          eventName: MockDataStore.event.name,
        };
      });

    // 3. Find check-in scans
    const checkInHistory = MockDataStore.checkIns.filter(
      (c) => c.guestName && c.guestName.toLowerCase() === customer.fullName.toLowerCase()
    );

    // 4. Calculate total lifetime spend & stats
    const lifetimeSpend = salesHistory.reduce((sum, s) => sum + s.grossPrice, 0);
    const activeReservationsCount = reservationHistory.filter(
      (r) => r.status === 'Confirmed'
    ).length;
    const completedSalesCount = salesHistory.filter((s) => s.status === 'Completed').length;
    const totalEventsAttended = new Set(salesHistory.map((s) => s.eventId)).size || (completedSalesCount > 0 ? 1 : 0);

    return {
      customer,
      salesHistory,
      reservationHistory,
      checkInHistory,
      lifetimeSpend,
      totalEventsAttended,
      activeReservationsCount,
      completedSalesCount,
    };
  }

  /**
   * Creates or updates a customer profile safely when a reservation or sale occurs.
   */
  public static upsertCustomer(data: {
    fullName: string;
    phone: string;
    email: string;
    source?: CustomerSource;
    tags?: CustomerTag[];
  }): Customer {
    const existing = CustomerCrmService.lookupCustomer(data.phone, data.email);
    const now = new Date().toISOString();

    if (existing) {
      existing.fullName = data.fullName || existing.fullName;
      if (data.phone) existing.phone = data.phone;
      if (data.email) existing.email = data.email;
      if (data.source && !existing.source) existing.source = data.source;
      if (data.tags && data.tags.length > 0) {
        existing.tags = Array.from(new Set([...existing.tags, ...data.tags]));
      }
      existing.updatedAt = now;
      return existing;
    }

    const newCust: Customer = {
      id: IdGenerator.generateUUIDv7(),
      organizationId: MockDataStore.organizationId,
      fullName: data.fullName,
      phone: data.phone,
      email: data.email,
      tags: data.tags || ['VIP'],
      source: data.source || 'Phone',
      notesTimeline: [],
      version: 1,
      isArchived: false,
      createdAt: now,
      updatedAt: now,
    };

    MockDataStore.customers.push(newCust);
    return newCust;
  }

  /**
   * Appends an operational CRM note to a customer profile.
   */
  public static addNoteToCustomer(
    customerId: string,
    content: string,
    author: string = 'Operasyon Yöneticisi'
  ): Customer {
    const customer = MockDataStore.customers.find((c) => c.id === customerId);
    if (!customer) throw new Error(`Customer with ID ${customerId} not found.`);

    const note: CustomerNote = {
      id: `note_${Date.now()}`,
      date: new Date().toLocaleDateString('tr-TR'),
      author,
      content,
    };

    customer.notesTimeline.unshift(note);
    customer.updatedAt = new Date().toISOString();
    return customer;
  }
}
