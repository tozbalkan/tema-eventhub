import { MockDataStore } from '@/repositories/mock/MockRepositories';
import { Sale, ExternalSaleConfirmation } from '@/types/sale';
import { AccountingEntry } from '@/types/accounting-entry';
import { ReservationTicket } from '@/types/ticket';
import { SalesChannel } from '@/types/sales-channel';
import { VenueService } from './VenueService';
import { TicketingService } from './TicketingService';
import { IdGenerator } from '@/platform/IdGenerator';
import { ClockProvider } from '@/platform/ClockProvider';

export interface RegisterExternalSaleCommand {
  reservationId?: string;
  eventId: string;
  assetId: string;
  salesChannelId: string; // e.g. "biletix", "passo", "desk", "corporate"
  externalSaleReference: string; // e.g. "BTX-20260807-18291"
  idempotencyKey?: string;
}

export interface RegisterExternalSaleResult {
  sale: Sale;
  confirmation: ExternalSaleConfirmation;
  accountingEntries: AccountingEntry[];
  ticket: ReservationTicket;
}

/**
 * Application Layer Use Case Service registering incoming confirmed sales from external sales channels
 * (Biletix, Passo, Organizer Desk, Corporate Agency) into StageOps operation ledgers.
 */
export class RegisterExternalSaleUseCase {
  public static execute(cmd: RegisterExternalSaleCommand): RegisterExternalSaleResult {
    const asset = VenueService.getAssetById(cmd.assetId);
    if (!asset) throw new Error('Asset not found');

    if (asset.status === 'Sold') {
      throw new Error('SEAT_ALREADY_RESERVED: Asset is already sold.');
    }

    const defaultChannel: SalesChannel = {
      id: 'desk',
      name: 'Organizasyon Masası',
      commissionPercentage: 0.0,
      isArchived: false,
    };
    const channel = MockDataStore.salesChannels.find((c) => c.id === cmd.salesChannelId) ?? defaultChannel;
    const nowISO = ClockProvider.nowISO();
    const grossPrice = asset.pricing.basePrice;
    const commissionRate = channel.commissionPercentage / 100;
    const commissionPaid = grossPrice * commissionRate;
    const netRevenue = grossPrice - commissionPaid;

    // 1. Create StageOps Sale Aggregate
    const saleId = IdGenerator.generateUUIDv7();

    const sale: Sale = {
      id: saleId,
      organizationId: MockDataStore.organizationId,
      eventId: cmd.eventId,
      customerId: 'cust_tarik_01',
      salesChannelId: cmd.salesChannelId,
      externalReference: cmd.externalSaleReference,
      saleDate: nowISO,
      grossPrice,
      commissionRate,
      commissionPaid,
      netRevenue,
      currency: asset.pricing.currency,
      exchangeRate: 1.0,
      exchangeRateSource: 'TCMB',
      accountingAmount: grossPrice,
      lines: [
        {
          id: IdGenerator.generateUUIDv7(),
          saleId,
          itemType: 'Ticket',
          venueAssetId: cmd.assetId,
          quantity: 1,
          unitPrice: grossPrice,
          discountAmount: 0,
          taxAmount: grossPrice * 0.2,
          totalPrice: grossPrice,
          currency: asset.pricing.currency,
          exchangeRate: 1.0,
        },
      ],
      revenueSplit: {
        organizerAmount: { minorUnits: BigInt(Math.round(netRevenue * 100)), currency: asset.pricing.currency, scale: 100 },
        platformCommission: { minorUnits: BigInt(Math.round(commissionPaid * 100)), currency: asset.pricing.currency, scale: 100 },
        gatewayFee: { minorUnits: BigInt(0), currency: asset.pricing.currency, scale: 100 },
        taxAmount: { minorUnits: BigInt(Math.round(grossPrice * 0.2 * 100)), currency: asset.pricing.currency, scale: 100 },
      },
      status: 'Completed',
      notes: `${channel.name} dış satış onayı işlendi (${cmd.externalSaleReference}).`,
      version: 1,
      isArchived: false,
      createdAt: nowISO,
      updatedAt: nowISO,
    };
    MockDataStore.sales.push(sale);

    // 2. Create ExternalSaleConfirmation Audit Record
    const confirmation: ExternalSaleConfirmation = {
      id: IdGenerator.generateUUIDv7(),
      saleId,
      salesChannelId: cmd.salesChannelId,
      externalReference: cmd.externalSaleReference,
      confirmedAt: nowISO,
    };
    MockDataStore.externalSaleConfirmations.push(confirmation);

    // 3. Double-Entry Accounting Entries
    const accRevenue: AccountingEntry = {
      id: IdGenerator.generateUUIDv7(),
      organizationId: MockDataStore.organizationId,
      eventId: cmd.eventId,
      sourceType: 'Sale',
      sourceId: saleId,
      entryType: 'SaleRevenue',
      amount: grossPrice,
      currency: asset.pricing.currency,
      accountingAmount: grossPrice,
      occurredAt: nowISO,
      createdAt: nowISO,
    };
    const accCommission: AccountingEntry = {
      id: IdGenerator.generateUUIDv7(),
      organizationId: MockDataStore.organizationId,
      eventId: cmd.eventId,
      sourceType: 'Sale',
      sourceId: saleId,
      entryType: 'PlatformCommission',
      amount: -commissionPaid,
      currency: asset.pricing.currency,
      accountingAmount: -commissionPaid,
      occurredAt: nowISO,
      createdAt: nowISO,
    };
    MockDataStore.accountingEntries.push(accRevenue, accCommission);

    // 4. Update Asset Status to Sold
    VenueService.updateAsset(cmd.assetId, { status: 'Sold' });

    // 5. Update Reservation status if converting
    if (cmd.reservationId) {
      const res = MockDataStore.reservations.find((r) => r.id === cmd.reservationId);
      if (res) {
        res.status = 'ConvertedToSale';
        res.updatedAt = nowISO;
      }
    }

    // 6. Issue Ticket via TicketingService
    const ticket = TicketingService.issueTicket({
      reservationId: cmd.reservationId || `res_${Date.now()}`,
      saleId,
      venueAssetId: cmd.assetId,
      assetName: asset.name,
    });

    return {
      sale,
      confirmation,
      accountingEntries: [accRevenue, accCommission],
      ticket,
    };
  }
}
