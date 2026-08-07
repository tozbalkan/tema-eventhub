import { MockDataStore } from '@/repositories/mock/MockRepositories';
import { Sale } from '@/types/sale';
import { SalesChannel } from '@/types/sales-channel';
import { VenueService } from './VenueService';
import { IdGenerator } from '@/platform/IdGenerator';
import { InMemoryEventBus } from '@/application/EventBus';
import { SaleRecordedDomainEvent, DomainEventNames } from '@/domain/events/DomainEvents';
import '@/application/Bootstrap'; // Ensures Composition Root is bootstrapped

export interface ProcessExternalSaleConfirmationCommand {
  reservationId?: string;
  eventId: string;
  assetId: string;
  salesChannelId: string; // e.g. "biletix", "passo", "desk", "corporate"
  externalSaleReference: string; // e.g. "BTX-20260807-18291"
  purchaserName?: string;
  purchaserPhone?: string;
  purchaserEmail?: string;
  idempotencyKey?: string;
}

export interface ProcessExternalSaleConfirmationResult {
  sale: Sale;
  event?: SaleRecordedDomainEvent;
  isDuplicateRecord: boolean;
}

/**
 * StageOps Application Use Case: Process External Sale Confirmation.
 * 
 * Executing sequence:
 * 1. Idempotency Check (Duplicate webhook protection via idempotencyKey or externalSaleReference)
 * 2. Validate Venue Asset Availability
 * 3. Create Sale Aggregate (with embedded ExternalConfirmation VO and PurchaserSnapshot VO)
 * 4. Save Sale Aggregate to Repository
 * 5. Publish Minimal SaleRecorded Domain Event (v1) via Application EventBus
 * 6. Operations & Accounting BC Event Handlers execute asynchronously via EventBus
 */
export class ProcessExternalSaleConfirmationUseCase {
  public static execute(cmd: ProcessExternalSaleConfirmationCommand): ProcessExternalSaleConfirmationResult {
    // 1. Idempotency Check: Protect against duplicate external webhook retries
    const existingSale = MockDataStore.sales.find(
      (s) =>
        s.externalReference === cmd.externalSaleReference ||
        (cmd.idempotencyKey && s.externalConfirmation?.externalReference === cmd.idempotencyKey)
    );

    if (existingSale) {
      console.log(`[Idempotency] Duplicate sale registration prevented for ref: ${cmd.externalSaleReference}`);
      return {
        sale: existingSale,
        isDuplicateRecord: true,
      };
    }

    // 2. Validate Venue Asset Availability
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
    const nowISO = new Date().toISOString();
    const grossPrice = asset.pricing.basePrice;
    const commissionRate = channel.commissionPercentage / 100;
    const commissionPaid = grossPrice * commissionRate;
    const netRevenue = grossPrice - commissionPaid;

    // 3. Create Sale Aggregate Root
    const saleId = IdGenerator.generateUUIDv7();

    const sale: Sale = {
      id: saleId,
      organizationId: MockDataStore.organizationId,
      eventId: cmd.eventId,
      reservationId: cmd.reservationId,
      salesChannelId: cmd.salesChannelId,
      externalReference: cmd.externalSaleReference,
      externalConfirmation: {
        salesChannelId: cmd.salesChannelId,
        externalReference: cmd.idempotencyKey || cmd.externalSaleReference,
        confirmedAt: nowISO,
      },
      channel: {
        type: 'ExternalChannel',
        name: channel.name,
        reference: cmd.externalSaleReference,
      },
      purchaserSnapshot: {
        fullName: cmd.purchaserName || 'Emre Kaya',
        phone: cmd.purchaserPhone || '+905351234567',
        email: cmd.purchaserEmail || 'emre@vip.com',
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

    // 4. Convert Reservation status if linked
    if (cmd.reservationId) {
      const res = MockDataStore.reservations.find((r) => r.id === cmd.reservationId);
      if (res) {
        res.status = 'ConvertedToSale';
        res.updatedAt = nowISO;
      }
    }

    // 5. Publish Minimal SaleRecorded Domain Event (v1) via Application EventBus
    const event: SaleRecordedDomainEvent = {
      eventName: DomainEventNames.SaleRecorded,
      header: {
        eventId: IdGenerator.generateUUIDv7(),
        eventVersion: 1,
        occurredAt: nowISO,
      },
      saleId: sale.id,
      eventId: sale.eventId,
    };

    InMemoryEventBus.getInstance().publish(event);

    return {
      sale,
      event,
      isDuplicateRecord: false,
    };
  }
}
