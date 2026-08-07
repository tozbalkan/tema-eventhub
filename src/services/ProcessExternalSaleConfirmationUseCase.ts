import { MockDataStore } from '@/repositories/mock/MockRepositories';
import { Sale } from '@/types/sale';
import { AccountingEntry } from '@/types/accounting-entry';
import { ReservationTicket } from '@/types/ticket';
import { SalesChannel } from '@/types/sales-channel';
import { VenueService } from './VenueService';
import { TicketingService } from './TicketingService';
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

export interface SaleCompletedDomainEvent {
  eventName: 'SaleCompleted';
  sale: Sale;
  assetId: string;
  reservationId?: string;
  occurredAt: string;
}

export interface ProcessExternalSaleConfirmationResult {
  sale: Sale;
  accountingEntries: AccountingEntry[];
  ticket: ReservationTicket;
}

/**
 * Event-Driven Application Use Case Service processing external sale confirmations.
 * Emits SaleCompleted domain event to loosely couple Accounting and Ticketing bounded contexts.
 */
export class ProcessExternalSaleConfirmationUseCase {
  public static execute(cmd: ProcessExternalSaleConfirmationCommand): ProcessExternalSaleConfirmationResult {
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

    // 1. Create Sale Aggregate Root with Embedded ExternalConfirmation Value Object
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

    // 2. Publish Domain Event: SaleCompleted
    const saleCompletedEvent: SaleCompletedDomainEvent = {
      eventName: 'SaleCompleted',
      sale,
      assetId: cmd.assetId,
      reservationId: cmd.reservationId,
      occurredAt: nowISO,
    };

    // 3. Accounting Bounded Context Handler (Subscribes to SaleCompleted)
    const accEntries = ProcessExternalSaleConfirmationUseCase.onSaleCompletedAccountingHandler(saleCompletedEvent);

    // 4. Ticketing Bounded Context Handler (Subscribes to SaleCompleted)
    const ticket = ProcessExternalSaleConfirmationUseCase.onSaleCompletedTicketingHandler(saleCompletedEvent, asset.name);

    // 5. Update Reservation status if converting
    if (cmd.reservationId) {
      const res = MockDataStore.reservations.find((r) => r.id === cmd.reservationId);
      if (res) {
        res.status = 'ConvertedToSale';
        res.updatedAt = nowISO;
      }
    }

    return {
      sale,
      accountingEntries: accEntries,
      ticket,
    };
  }

  /**
   * Decoupled Event Handler for Accounting Bounded Context
   */
  private static onSaleCompletedAccountingHandler(event: SaleCompletedDomainEvent): AccountingEntry[] {
    const { sale } = event;
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
      occurredAt: event.occurredAt,
      createdAt: event.occurredAt,
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
      occurredAt: event.occurredAt,
      createdAt: event.occurredAt,
    };
    MockDataStore.accountingEntries.push(accRevenue, accCommission);
    return [accRevenue, accCommission];
  }

  /**
   * Decoupled Event Handler for Ticketing Bounded Context
   */
  private static onSaleCompletedTicketingHandler(event: SaleCompletedDomainEvent, assetName: string): ReservationTicket {
    const { sale, assetId, reservationId } = event;
    const ticket = TicketingService.issueTicket({
      reservationId: reservationId || `res_${Date.now()}`,
      saleId: sale.id,
      venueAssetId: assetId,
      assetName,
    });

    // Update Asset to Sold on TicketIssued
    VenueService.updateAsset(assetId, { status: 'Sold' });
    return ticket;
  }
}
