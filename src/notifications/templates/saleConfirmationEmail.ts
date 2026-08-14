import { emailColors } from './emailTokens';

export interface SaleEmailData {
  eventName: string;
  venueName: string;
  purchaserName: string;
  purchaserPhone: string;
  purchaserEmail: string;
  assetName: string;
  salesChannelName: string;
  externalReference: string;
  grossAmountStr: string;
  commissionAmountStr: string;
  netAmountStr: string;
}

export function renderSaleConfirmationEmail(data: SaleEmailData): string {
  return `
      <div style="font-family: sans-serif; background-color: ${emailColors.background}; color: ${emailColors.text}; padding: 24px; border-radius: 8px;">
        <h2 style="color: ${emailColors.primary}; margin-bottom: 8px;">VIP Satış Kaydı Onaylandı</h2>
        <p style="color: ${emailColors.textMuted}; font-size: 14px;">EventHub Operasyon Defteri & Resend Bildirimi</p>
        <hr style="border: 1px solid ${emailColors.border}; margin: 16px 0;" />
        <p><strong>Etkinlik:</strong> ${data.eventName} (${data.venueName})</p>
        <p><strong>Satın Alan:</strong> ${data.purchaserName} (${data.purchaserPhone} / ${data.purchaserEmail})</p>
        <p><strong>Alan / Masa:</strong> ${data.assetName}</p>
        <p><strong>Satış Kanalı:</strong> ${data.salesChannelName} (Ref: ${data.externalReference})</p>
        <div style="background-color: ${emailColors.surface}; padding: 12px; border-radius: 6px; margin-top: 12px;">
          <p style="margin: 4px 0;">Brüt Tutar: <strong>${data.grossAmountStr}</strong></p>
          <p style="margin: 4px 0; color: ${emailColors.warning};">Bilet Platform Komisyonu: <strong>${data.commissionAmountStr}</strong></p>
          <p style="margin: 4px 0; color: ${emailColors.success};">Net Organizatör Hakedişi: <strong>${data.netAmountStr}</strong></p>
        </div>
      </div>
    `;
}
