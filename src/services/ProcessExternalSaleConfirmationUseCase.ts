import { MockDataStore } from '@/repositories/mock/MockRepositories';
import { Sale } from '@/types/sale';
import { AccountingEntry } from '@/types/accounting-entry';
import { SalesChannel } from '@/types/sales-channel';
import { VenueService } from './VenueService';
import { IdGenerator } from '@/platform/IdGenerator';
import { ClockProvider } from '@/platform/ClockProvider';

export interface ProcessExternalSaleConfirmationCommand {
  reservationId?: string;
  eventId: string;
  assetId: string;
  salesChannelId: string; // e.g. "biletix", "passo", "desk", "corporate"
  externalSaleReference: string; // e.g. "BTX-20260807-18291"
  idempotencyKey?: string;
}

export interface SaleRegisteredEvent {
  eventName: 'SaleRegistered';
  saleId: string;
  eventId: string;
  assetId: string;
  reservationId?: string;
  salesChannelId: string;
  externalReference: string;
  occurredAt: string;
}

export interface ProcessExternalSaleConfirmationResult {
  sale: Sale;
  accountingEntries: AccountingEntry[];
  event: SaleRegisteredEvent;
}

/**
 * StageOps Application Use Case: Process External Sale Confirmation.
 * 
 * Executing sequence:
 * 1. Validate Venue Asset Availability
 * 2. Create Sale Aggregate (with embedded ExternalConfirmation VO)
 * 3. Convert Reservation status if linked
 * 4. Update Venue Asset status to Sold
 * 5. Generate Double-Entry Accounting Entries
 * 6. Publish SaleRegistered Domain Event (Consumed asynchronously by external CRM/Ticketing/Wallet systems)
 */
export class ProcessExternalSaleConfirmationUseCase {
  public static execute(cmd: ProcessExternalSaleConfirmationCommand): ProcessExternalSaleConfirmationResult {
    // 1. Validate Asset Availability
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

    // 2. Create Sale Aggregate Root
    const saleId = IdGenerator.generateUUIDv7();

    const sale: Sale = {
      id: saleId,
      organizationId: MockDataStore.organizationId,
      eventId: cmd.eventId,
      customerId: 'cust_tarik_01',
      salesChannelId: cmd.salesChannelId,
      externalReference: cmd.externalSaleReference,
      externalConfirmation: {
        salesChannelId: cmd.salesChannelId,
        externalReference: cmd.externalSaleReference,
        confirmedAt: nowISO,
      },
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
          itemType: 'VenueAsset',
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
      notes: `${channel.name} dış satış bildirimi işlendi (${cmd.externalSaleReference}).`,
      version: 1,
      isArchived: false,
      createdAt: nowISO,
      updatedAt: nowISO,
    };
    MockDataStore.sales.push(sale);

    // 3. Convert Reservation status if linked
    if (cmd.reservationId) {
      const res = MockDataStore.reservations.find((r) => r.id === cmd.reservationId);
      if (res) {
        res.status = 'ConvertedToSale';
        res.updatedAt = nowISO;
      }
    }

    // 4. Update Venue Asset status to Sold
    VenueService.updateAsset(cmd.assetId, { status: 'Sold' });

    // 5. Generate Double-Entry Accounting Entries
    const accRevenue: AccountingEntry = {
      id: IdGenerator.generateUUIDv7(),
      organizationId: sale.organizationId,
      eventId: sale.eventId,
      sourceType: 'Sale',
      sourceId: sale.id,
      entryType: 'SaleRevenue',
      amount: sale.grossPrice,
      currency: sale.currency,
      accountingAmount: sale.grossPrice,
      occurredAt: nowISO,
      createdAt: nowISO,
    };
    const accCommission: AccountingEntry = {
      id: IdGenerator.generateUUIDv7(),
      organizationId: sale.organizationId,
      eventId: sale.eventId,
      sourceType: 'Sale',
      sourceId: sale.id,
      entryType: 'PlatformCommission',
      amount: -sale.commissionPaid,
      currency: sale.currency,
      accountingAmount: -sale.commissionPaid,
      occurredAt: nowISO,
      createdAt: nowISO,
    };
    MockDataStore.accountingEntries.push(accRevenue, accCommission);

    // 6. Publish Domain Event: SaleRegistered
    const event: SaleRegisteredEvent = {
      eventName: 'SaleRegistered',
      saleId: sale.id,
      eventId: sale.eventId,
      assetId: cmd.assetId,
      reservationId: cmd.reservationId,
      salesChannelId: cmd.salesChannelId,
      externalReference: cmd.externalSaleReference,
      occurredAt: nowISO,
    };

    return {
      sale,
      accountingEntries: [accRevenue, accCommission],
      event,
    };
  }
}
