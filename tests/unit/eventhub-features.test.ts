import { describe, it, expect, beforeEach } from 'vitest';
import { CommissionEngineService } from '@/services/CommissionEngineService';
import { CustomerCrmService } from '@/services/CustomerCrmService';
import { NotificationService } from '@/services/NotificationService';
import { MockDataStore } from '@/repositories/mock/MockRepositories';

describe('EventHub Operational Platform Services (Unit Tests)', () => {
  beforeEach(() => {
    // Reset test notification logs
    NotificationService.sentNotificationsLog = [];
  });

  describe('Ticket Platform Commission Engine', () => {
    it('calculates Biletix 6% commission deterministically', () => {
      const result = CommissionEngineService.calculate(100000, 'biletix');
      expect(result.commissionPercentage).toBe(6.0);
      expect(result.commissionRate).toBe(0.06);
      expect(result.commissionAmount).toBe(6000);
      expect(result.netRevenue).toBe(94000);
      expect(result.revenueSplit.platformCommission.minorUnits).toBe(BigInt(600000));
      expect(result.revenueSplit.organizerAmount.minorUnits).toBe(BigInt(9400000));
    });

    it('calculates Passo 5% commission deterministically', () => {
      const result = CommissionEngineService.calculate(25000, 'passo');
      expect(result.commissionPercentage).toBe(5.0);
      expect(result.commissionAmount).toBe(1250);
      expect(result.netRevenue).toBe(23750);
    });

    it('calculates Bugece 3.5% commission deterministically without floating-point precision error', () => {
      const result = CommissionEngineService.calculate(12000, 'bugece');
      expect(result.commissionPercentage).toBe(3.5);
      expect(result.commissionAmount).toBe(420);
      expect(result.netRevenue).toBe(11580);
    });

    it('calculates Desk (Organizasyon Masası) 0% commission', () => {
      const result = CommissionEngineService.calculate(50000, 'desk');
      expect(result.commissionPercentage).toBe(0.0);
      expect(result.commissionAmount).toBe(0);
      expect(result.netRevenue).toBe(50000);
    });
  });

  describe('Operational CRM Service', () => {
    it('prioritizes Phone lookup over Email', () => {
      const found = CustomerCrmService.lookupCustomer('+905321002030', 'selin@example.com');
      expect(found).not.toBeNull();
      expect(found?.fullName).toBe('Tarık Özbalkan');
    });

    it('falls back to Email lookup when Phone does not match', () => {
      const found = CustomerCrmService.lookupCustomer('+905999999999', 'selin@example.com');
      expect(found).not.toBeNull();
      expect(found?.fullName).toBe('Selin Yılmaz');
    });

    it('aggregates cross-event sales, lifetime spend, and notes timeline for a customer', () => {
      const profile = CustomerCrmService.getCustomerProfileWithHistory('cust_tarik_01');
      expect(profile).not.toBeNull();
      expect(profile?.customer.fullName).toBe('Tarık Özbalkan');
      expect(profile?.lifetimeSpend).toBeGreaterThanOrEqual(25000);
      expect(profile?.salesHistory.length).toBeGreaterThanOrEqual(1);
    });

    it('upserts a new customer when no match exists', () => {
      const newCust = CustomerCrmService.upsertCustomer({
        fullName: 'Ayşe Kaya',
        phone: '+905441112233',
        email: 'ayse@example.com',
        source: 'Instagram',
        tags: ['VIP'],
      });

      expect(newCust.id).toBeDefined();
      expect(newCust.fullName).toBe('Ayşe Kaya');

      const refetched = CustomerCrmService.lookupCustomer('+905441112233');
      expect(refetched?.id).toBe(newCust.id);
    });

    it('appends an operational note to customer timeline', () => {
      const updated = CustomerCrmService.addNoteToCustomer('cust_tarik_01', 'Özel karşılama ve şampanya ikram edildi.');
      expect(updated.notesTimeline.length).toBeGreaterThan(0);
      expect(updated.notesTimeline[0]?.content).toBe('Özel karşılama ve şampanya ikram edildi.');
    });
  });

  describe('Transactional Notification Engine', () => {
    it('queues a Resend transactional email payload for completed sale', () => {
      const sale = MockDataStore.sales[0]!;
      const payload = NotificationService.sendSaleConfirmationNotification(sale, 'VIP Masa A1');

      expect(payload.recipientName).toBe('Tarık Özbalkan');
      expect(payload.type).toBe('SaleConfirmation');
      expect(payload.subject).toContain('Satış Bildirimi Onayı');
      expect(payload.htmlContent).toContain('Net Organizatör Hakedişi');
      expect(NotificationService.sentNotificationsLog.length).toBe(1);
    });

    it('queues a Resend transactional email payload for option reservation', () => {
      const reservation = MockDataStore.reservations[0]!;
      const payload = NotificationService.sendReservationNotification(reservation, 'VIP Masa A2');

      expect(payload.recipientName).toBe('Selin Yılmaz');
      expect(payload.type).toBe('OptionReservation');
      expect(payload.subject).toContain('24 Saatlik VIP Opsiyonu');
      expect(NotificationService.sentNotificationsLog.length).toBe(1);
    });
  });
});
