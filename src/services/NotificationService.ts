import { Sale } from '@/types/sale';
import { Reservation } from '@/types/reservation';
import { MockDataStore } from '@/repositories/mock/MockRepositories';
import { renderSaleConfirmationEmail } from '@/notifications/templates/saleConfirmationEmail';
import { renderReservationEmail } from '@/notifications/templates/reservationEmail';

export interface NotificationEventContext {
  eventName?: string;
  venueName?: string;
}

export interface EmailNotificationPayload {
  id: string;
  recipientEmail: string;
  recipientPhone: string;
  recipientName: string;
  type: 'SaleConfirmation' | 'OptionReservation' | 'ExpirationWarning';
  subject: string;
  htmlContent: string;
  salesChannel: string;
  grossAmount: string;
  netAmount: string;
  commissionAmount: string;
  sentAt: string;
  status: 'Queued' | 'Delivered' | 'Failed';
}

export class NotificationService {
  public static sentNotificationsLog: EmailNotificationPayload[] = [];

  /**
   * Orchestrates and queues a Resend transactional email notification for completed sales.
   * Presentation logic is delegated to renderSaleConfirmationEmail.
   */
  public static sendSaleConfirmationNotification(
    sale: Sale,
    assetName: string,
    context?: NotificationEventContext
  ): EmailNotificationPayload {
    const purchaser = sale.purchaserSnapshot;
    const eventName = context?.eventName || MockDataStore.event.name;
    const venueName = context?.venueName || MockDataStore.venue.name;

    const grossStr = `₺${sale.grossPrice.toLocaleString('tr-TR')}`;
    const netStr = `₺${sale.netRevenue.toLocaleString('tr-TR')}`;
    const commStr = `₺${sale.commissionPaid.toLocaleString('tr-TR')} (%${(sale.commissionRate * 100).toFixed(1)})`;
    const salesChannelName = sale.channel?.name || sale.salesChannelId;

    const subject = `[StageOps EventHub] Satış Bildirimi Onayı - ${assetName} (${sale.externalReference})`;
    
    // Delegate HTML template rendering to the dedicated notification template layer
    const htmlContent = renderSaleConfirmationEmail({
      eventName,
      venueName,
      purchaserName: purchaser.fullName,
      purchaserPhone: purchaser.phone,
      purchaserEmail: purchaser.email,
      assetName,
      salesChannelName,
      externalReference: sale.externalReference,
      grossAmountStr: grossStr,
      commissionAmountStr: commStr,
      netAmountStr: netStr,
    });

    const payload: EmailNotificationPayload = {
      id: `notif_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      recipientEmail: purchaser.email || 'ops@eventhub.com',
      recipientPhone: purchaser.phone,
      recipientName: purchaser.fullName,
      type: 'SaleConfirmation',
      subject,
      htmlContent,
      salesChannel: salesChannelName,
      grossAmount: grossStr,
      netAmount: netStr,
      commissionAmount: commStr,
      sentAt: new Date().toISOString(),
      status: 'Queued',
    };

    NotificationService.sentNotificationsLog.unshift(payload);
    console.log(`[NotificationService] Resend email notification queued for ${payload.recipientEmail}: "${subject}"`);
    return payload;
  }

  /**
   * Orchestrates and queues a Resend transactional email notification for 24-hour option reservations.
   * Presentation logic is delegated to renderReservationEmail.
   */
  public static sendReservationNotification(
    reservation: Reservation,
    assetName: string,
    context?: NotificationEventContext
  ): EmailNotificationPayload {
    const eventName = context?.eventName || MockDataStore.event.name;
    const venueName = context?.venueName || MockDataStore.venue.name;
    const expDateStr = new Date(reservation.expirationDate).toLocaleString('tr-TR');

    const subject = `[StageOps EventHub] 24 Saatlik VIP Opsiyonu - ${assetName}`;
    
    // Delegate HTML template rendering to the dedicated notification template layer
    const htmlContent = renderReservationEmail({
      eventName,
      venueName,
      customerName: reservation.customerName,
      customerPhone: reservation.customerPhone,
      assetName,
      paxCapacity: reservation.guestCountPax,
      expirationDateStr: expDateStr,
    });

    const payload: EmailNotificationPayload = {
      id: `notif_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      recipientEmail: reservation.customerEmail || 'ops@eventhub.com',
      recipientPhone: reservation.customerPhone,
      recipientName: reservation.customerName,
      type: 'OptionReservation',
      subject,
      htmlContent,
      salesChannel: 'Organizasyon Masası',
      grossAmount: '₺0',
      netAmount: '₺0',
      commissionAmount: '₺0',
      sentAt: new Date().toISOString(),
      status: 'Queued',
    };

    NotificationService.sentNotificationsLog.unshift(payload);
    console.log(`[NotificationService] Resend email reservation notification queued for ${payload.recipientEmail}: "${subject}"`);
    return payload;
  }
}
