import { emailColors } from './emailTokens';

export interface ReservationEmailData {
  eventName: string;
  venueName: string;
  customerName: string;
  customerPhone: string;
  assetName: string;
  paxCapacity: number;
  expirationDateStr: string;
}

export function renderReservationEmail(data: ReservationEmailData): string {
  return `
      <div style="font-family: sans-serif; background-color: ${emailColors.background}; color: ${emailColors.text}; padding: 24px; border-radius: 8px;">
        <h2 style="color: ${emailColors.warning}; margin-bottom: 8px;">24 Saatlik Opsiyon Rezervasyonu</h2>
        <p style="color: ${emailColors.textMuted}; font-size: 14px;">EventHub Operasyon Defteri</p>
        <hr style="border: 1px solid ${emailColors.border}; margin: 16px 0;" />
        <p><strong>Etkinlik:</strong> ${data.eventName} (${data.venueName})</p>
        <p><strong>Müşteri:</strong> ${data.customerName} (${data.customerPhone})</p>
        <p><strong>Alan / Masa:</strong> ${data.assetName} (${data.paxCapacity} PAX)</p>
        <p><strong>Opsiyon Son Kullanma Tarihi:</strong> <strong style="color: ${emailColors.danger};">${data.expirationDateStr}</strong></p>
      </div>
    `;
}
