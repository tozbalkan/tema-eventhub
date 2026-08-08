import { VenueService } from '@/services/VenueService';
import { MockDataStore } from '@/repositories/mock/MockRepositories';
import { Sale, SaleLine } from '@/types/sale';
import { DomainEventNames, SaleRecordedDomainEvent } from '@/domain/events/DomainEvents';
import { InMemoryEventBus } from '@/application/EventBus';
import { IdGenerator } from '@/platform/IdGenerator';
import { ReservationService } from '@/services/ReservationService';
import type { PoolClient } from 'pg';

export interface ProcessExternalSaleConfirmationDTO {
  eventId: string;
  assetId?: string;
  assetIds?: string[];
  reservationId?: string;
  salesChannelId: string;
  externalSaleReference: string;
  purchaserName?: string;
  purchaserPhone?: string;
  purchaserEmail?: string;
  organizationId?: string;
  pgClient?: PoolClient;
}

export interface ProcessExternalSaleConfirmationResult {
  sale: Sale;
  event?: SaleRecordedDomainEvent;
  isDuplicateRecord: boolean;
}

export class ProcessExternalSaleConfirmationUseCase {
  public static async execute(
    dto: ProcessExternalSaleConfirmationDTO
  ): Promise<ProcessExternalSaleConfirmationResult> {
    const rawAssetIds = dto.assetIds && dto.assetIds.length > 0
      ? dto.assetIds
      : dto.assetId
        ? [dto.assetId]
        : [];

    if (rawAssetIds.length === 0) {
      throw new Error('At least one asset ID must be provided.');
    }

    const requestedAssetIds = Array.from(new Set(rawAssetIds));

    if (dto.pgClient) {
      return ProcessExternalSaleConfirmationUseCase.executePg(dto, requestedAssetIds, dto.pgClient);
    }

    return ProcessExternalSaleConfirmationUseCase.executeInMemory(dto, requestedAssetIds);
  }

  private static async executePg(
    dto: ProcessExternalSaleConfirmationDTO,
    requestedAssetIds: string[],
    client: PoolClient
  ): Promise<ProcessExternalSaleConfirmationResult> {
    const { PgOutboxStore } = await import('@/platform/pg/PgOutboxStore');

    // 0. Check duplicate command idempotency FIRST before locking assets
    const existingSaleRes = await client.query(
      `SELECT * FROM sales WHERE sales_channel_id = $1 AND external_reference = $2;`,
      [dto.salesChannelId, dto.externalSaleReference]
    );

    if (existingSaleRes.rows.length > 0) {
      const saleRow = existingSaleRes.rows[0];

      const linesRes = await client.query(
        `SELECT id, venue_asset_id, quantity, unit_price, total_price FROM sale_lines WHERE sale_id = $1`,
        [saleRow.id]
      );

      const existingLines: SaleLine[] = linesRes.rows.map((l) => ({
        id: l.id,
        saleId: saleRow.id,
        itemType: 'VenueAsset',
        venueAssetId: l.venue_asset_id,
        quantity: l.quantity,
        unitPrice: parseFloat(l.unit_price),
        discountAmount: 0,
        taxAmount: Math.round(parseFloat(l.unit_price) * 0.20 * 100) / 100,
        totalPrice: parseFloat(l.total_price),
        currency: 'TRY',
        exchangeRate: 1,
      }));

      const grossPrice = parseFloat(saleRow.gross_price);
      const commissionPaid = parseFloat(saleRow.commission_paid);
      const netRevenue = parseFloat(saleRow.net_revenue);

      const existingSale: Sale = {
        id: saleRow.id,
        organizationId: saleRow.organization_id,
        eventId: saleRow.event_id,
        reservationId: saleRow.reservation_id || undefined,
        salesChannelId: saleRow.sales_channel_id,
        externalReference: saleRow.external_reference,
        channel: {
          type: 'ExternalChannel',
          name: saleRow.sales_channel_id,
          reference: saleRow.external_reference,
        },
        purchaserSnapshot: {
          fullName: saleRow.purchaser_name || 'Anonymous',
          phone: saleRow.purchaser_phone || '',
          email: saleRow.purchaser_email || '',
        },
        saleDate: new Date(saleRow.created_at).toISOString(),
        grossPrice,
        commissionPaid,
        commissionRate: grossPrice > 0 ? commissionPaid / grossPrice : 0,
        netRevenue,
        currency: saleRow.currency,
        exchangeRate: 1,
        exchangeRateSource: 'TCMB',
        status: saleRow.status,
        version: 1,
        isArchived: false,
        createdAt: new Date(saleRow.created_at).toISOString(),
        updatedAt: new Date(saleRow.created_at).toISOString(),
        accountingAmount: grossPrice,
        revenueSplit: {
          organizerAmount: { minorUnits: BigInt(Math.round(netRevenue * 100)), currency: 'TRY' },
          platformCommission: { minorUnits: BigInt(Math.round(commissionPaid * 100)), currency: 'TRY' },
          gatewayFee: { minorUnits: 0n, currency: 'TRY' },
          taxAmount: { minorUnits: BigInt(Math.round(grossPrice * 0.20 * 100)), currency: 'TRY' },
        },
        lines: existingLines,
      };

      return {
        sale: existingSale,
        isDuplicateRecord: true,
      };
    }

    // 1. Authoritative SalesChannel metadata from PostgreSQL
    const channelRes = await client.query(
      `SELECT * FROM sales_channels WHERE id = $1`,
      [dto.salesChannelId]
    );

    let commissionRate = 0.06;
    if (channelRes.rows.length > 0) {
      const channelRow = channelRes.rows[0];
      if (channelRow.is_archived) {
        throw new Error(`Sales channel ${dto.salesChannelId} is archived and cannot process sales.`);
      }
      commissionRate = parseFloat(channelRow.commission_percentage) / 100.0;
    } else {
      if (dto.salesChannelId !== 'biletix' && dto.salesChannelId !== 'passo' && dto.salesChannelId !== 'desk') {
        throw new Error(`Sales channel not found in database: ${dto.salesChannelId}`);
      }
    }

    const organizationId = dto.organizationId || 'org_stageops_01';

    // 2. Canonical Lock Acquisition Order: Sort requested asset IDs alphabetically to eliminate deadlock hazards
    const sortedAssetIds = [...requestedAssetIds].sort();

    // 3. Lock & Validate Asset Projections strictly from PostgreSQL
    const assetProjections: Array<{ asset_id: string; status: string; base_price: number; reservation_id?: string }> = [];
    for (const assetId of sortedAssetIds) {
      const projRes = await client.query(
        `SELECT * FROM venue_asset_projections WHERE asset_id = $1 FOR UPDATE`,
        [assetId]
      );

      if (projRes.rows.length === 0) {
        throw new Error(`Asset not found: ${assetId}`);
      }

      const proj = projRes.rows[0];
      const basePrice = parseFloat(proj.base_price);
      assetProjections.push({
        asset_id: proj.asset_id,
        status: proj.status,
        base_price: basePrice,
        reservation_id: proj.reservation_id || undefined,
      });
    }

    // 4. Validate Reservation Holds & Seat Availability
    for (const proj of assetProjections) {
      if (proj.status === 'Sold') {
        // Double check if a concurrent transaction registered the sale for the same channel + reference
        const dupCheck = await client.query(
          `SELECT * FROM sales WHERE sales_channel_id = $1 AND external_reference = $2;`,
          [dto.salesChannelId, dto.externalSaleReference]
        );
        if (dupCheck.rows.length > 0) {
          const saleRow = dupCheck.rows[0];
          const linesRes = await client.query(`SELECT * FROM sale_lines WHERE sale_id = $1`, [saleRow.id]);
          const existingLines: SaleLine[] = linesRes.rows.map((l) => ({
            id: l.id,
            saleId: saleRow.id,
            itemType: 'VenueAsset',
            venueAssetId: l.venue_asset_id,
            quantity: l.quantity,
            unitPrice: parseFloat(l.unit_price),
            discountAmount: 0,
            taxAmount: Math.round(parseFloat(l.unit_price) * 0.20 * 100) / 100,
            totalPrice: parseFloat(l.total_price),
            currency: 'TRY',
            exchangeRate: 1,
          }));
          const gp = parseFloat(saleRow.gross_price);
          const cp = parseFloat(saleRow.commission_paid);
          const nr = parseFloat(saleRow.net_revenue);

          return {
            sale: {
              id: saleRow.id,
              organizationId: saleRow.organization_id,
              eventId: saleRow.event_id,
              reservationId: saleRow.reservation_id || undefined,
              salesChannelId: saleRow.sales_channel_id,
              externalReference: saleRow.external_reference,
              channel: {
                type: 'ExternalChannel',
                name: saleRow.sales_channel_id,
                reference: saleRow.external_reference,
              },
              purchaserSnapshot: {
                fullName: saleRow.purchaser_name || 'Anonymous',
                phone: saleRow.purchaser_phone || '',
                email: saleRow.purchaser_email || '',
              },
              saleDate: new Date(saleRow.created_at).toISOString(),
              grossPrice: gp,
              commissionPaid: cp,
              commissionRate,
              netRevenue: nr,
              currency: saleRow.currency,
              exchangeRate: 1,
              exchangeRateSource: 'TCMB',
              status: saleRow.status,
              version: 1,
              isArchived: false,
              createdAt: new Date(saleRow.created_at).toISOString(),
              updatedAt: new Date(saleRow.created_at).toISOString(),
              accountingAmount: gp,
              revenueSplit: {
                organizerAmount: { minorUnits: BigInt(Math.round(nr * 100)), currency: 'TRY' },
                platformCommission: { minorUnits: BigInt(Math.round(cp * 100)), currency: 'TRY' },
                gatewayFee: { minorUnits: 0n, currency: 'TRY' },
                taxAmount: { minorUnits: BigInt(Math.round(gp * 0.20 * 100)), currency: 'TRY' },
              },
              lines: existingLines,
            },
            isDuplicateRecord: true,
          };
        }

        throw new Error(`SEAT_ALREADY_RESERVED: Asset ${proj.asset_id} is already sold.`);
      }

      if (proj.status === 'Blocked') {
        throw new Error(`SEAT_BLOCKED: Asset ${proj.asset_id} is blocked.`);
      }

      if (proj.status === 'Reserved') {
        if (!dto.reservationId) {
          throw new Error(`SEAT_ALREADY_RESERVED: Asset is currently reserved by another reservation hold.`);
        }
        if (proj.reservation_id !== dto.reservationId) {
          throw new Error(`SEAT_ALREADY_RESERVED: Asset is currently reserved by another reservation hold.`);
        }
      }
    }

    // 5. Reservation Conversion Lock & Validation
    if (dto.reservationId) {
      const resDb = await client.query(
        `SELECT * FROM reservations WHERE id = $1 FOR UPDATE`,
        [dto.reservationId]
      );

      if (resDb.rows.length === 0) {
        throw new Error(`RESERVATION_NOT_FOUND: Reservation ${dto.reservationId} not found.`);
      }

      const resRow = resDb.rows[0];

      if (resRow.status === 'Cancelled') {
        throw new Error(`RESERVATION_CANCELLED: Reservation ${dto.reservationId} was cancelled.`);
      }
      if (resRow.status === 'Expired' || new Date(resRow.expiration_date).getTime() < Date.now()) {
        throw new Error(`RESERVATION_EXPIRED: Reservation ${dto.reservationId} has expired.`);
      }

      if (dto.purchaserEmail && resRow.customer_email && dto.purchaserEmail.toLowerCase() !== resRow.customer_email.toLowerCase()) {
        throw new Error(`RESERVATION_NOT_OWNED: Purchaser email does not match reservation owner.`);
      }
    }

    // 6. Heterogeneous Multi-Asset Pricing Arithmetic
    const grossPrice = assetProjections.reduce((sum, p) => sum + p.base_price, 0);
    const commissionPaid = Math.round(grossPrice * commissionRate * 100) / 100;
    const netRevenue = Math.round((grossPrice - commissionPaid) * 100) / 100;

    // 7. Atomic Sale Ownership Reservation
    const newSaleId = IdGenerator.generateUUIDv7();
    const nowISO = new Date().toISOString();

    const insertSaleRes = await client.query(
      `INSERT INTO sales (
        id, organization_id, event_id, reservation_id, sales_channel_id, external_reference,
        purchaser_name, purchaser_phone, purchaser_email, gross_price, commission_paid,
        net_revenue, currency, status, created_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'TRY', 'Completed', $13)
      ON CONFLICT (sales_channel_id, external_reference) DO NOTHING
      RETURNING *;`,
      [
        newSaleId,
        organizationId,
        dto.eventId,
        dto.reservationId || null,
        dto.salesChannelId,
        dto.externalSaleReference,
        dto.purchaserName || null,
        dto.purchaserPhone || null,
        dto.purchaserEmail || null,
        grossPrice,
        commissionPaid,
        netRevenue,
        nowISO,
      ]
    );

    // Duplicate Command Handling on Conflict
    if (insertSaleRes.rows.length === 0) {
      const existingSaleRes = await client.query(
        `SELECT * FROM sales WHERE sales_channel_id = $1 AND external_reference = $2;`,
        [dto.salesChannelId, dto.externalSaleReference]
      );

      if (existingSaleRes.rows.length === 0) {
        throw new Error(`SALE_OWNERSHIP_CONFLICT: Sale conflict detected but existing sale is unavailable.`);
      }

      const saleRow = existingSaleRes.rows[0];

      const linesRes = await client.query(
        `SELECT * FROM sale_lines WHERE sale_id = $1`,
        [saleRow.id]
      );

      const existingLines: SaleLine[] = linesRes.rows.map((l) => ({
        id: l.id,
        saleId: saleRow.id,
        itemType: 'VenueAsset',
        venueAssetId: l.venue_asset_id,
        quantity: l.quantity,
        unitPrice: parseFloat(l.unit_price),
        discountAmount: 0,
        taxAmount: Math.round(parseFloat(l.unit_price) * 0.20 * 100) / 100,
        totalPrice: parseFloat(l.total_price),
        currency: 'TRY',
        exchangeRate: 1,
      }));

      const existingSale: Sale = {
        id: saleRow.id,
        organizationId: saleRow.organization_id,
        eventId: saleRow.event_id,
        reservationId: saleRow.reservation_id || undefined,
        salesChannelId: saleRow.sales_channel_id,
        externalReference: saleRow.external_reference,
        channel: {
          type: 'ExternalChannel',
          name: saleRow.sales_channel_id,
          reference: saleRow.external_reference,
        },
        purchaserSnapshot: {
          fullName: saleRow.purchaser_name || 'Anonymous',
          phone: saleRow.purchaser_phone || '',
          email: saleRow.purchaser_email || '',
        },
        saleDate: new Date(saleRow.created_at).toISOString(),
        grossPrice: parseFloat(saleRow.gross_price),
        commissionPaid: parseFloat(saleRow.commission_paid),
        commissionRate,
        netRevenue: parseFloat(saleRow.net_revenue),
        currency: saleRow.currency,
        exchangeRate: 1,
        exchangeRateSource: 'TCMB',
        status: saleRow.status,
        version: 1,
        isArchived: false,
        createdAt: new Date(saleRow.created_at).toISOString(),
        updatedAt: new Date(saleRow.created_at).toISOString(),
        accountingAmount: parseFloat(saleRow.gross_price),
        revenueSplit: {
          organizerAmount: { minorUnits: BigInt(Math.round(parseFloat(saleRow.net_revenue) * 100)), currency: 'TRY' },
          platformCommission: { minorUnits: BigInt(Math.round(parseFloat(saleRow.commission_paid) * 100)), currency: 'TRY' },
          gatewayFee: { minorUnits: 0n, currency: 'TRY' },
          taxAmount: { minorUnits: BigInt(Math.round(parseFloat(saleRow.gross_price) * 0.20 * 100)), currency: 'TRY' },
        },
        lines: existingLines,
      };

      return {
        sale: existingSale,
        isDuplicateRecord: true,
      };
    }

    const saleRow = insertSaleRes.rows[0];
    const saleId = saleRow.id;

    // 8. Insert Sale Line Items
    const lines: SaleLine[] = [];
    for (const proj of assetProjections) {
      const lineId = IdGenerator.generateUUIDv7();
      await client.query(
        `INSERT INTO sale_lines (id, sale_id, venue_asset_id, quantity, unit_price, total_price)
         VALUES ($1, $2, $3, 1, $4, $4);`,
        [lineId, saleId, proj.asset_id, proj.base_price]
      );

      lines.push({
        id: lineId,
        saleId,
        itemType: 'VenueAsset',
        venueAssetId: proj.asset_id,
        quantity: 1,
        unitPrice: proj.base_price,
        discountAmount: 0,
        taxAmount: Math.round(proj.base_price * 0.20 * 100) / 100,
        totalPrice: proj.base_price,
        currency: 'TRY',
        exchangeRate: 1,
      });
    }

    // 9. Mutate Asset Projections to 'Sold' & Convert Reservation
    for (const proj of assetProjections) {
      await client.query(
        `UPDATE venue_asset_projections
         SET status = 'Sold', occupancy_state = 'Sold', sale_id = $1, version = version + 1, last_updated = NOW()
         WHERE asset_id = $2;`,
        [saleId, proj.asset_id]
      );
    }

    if (dto.reservationId) {
      await client.query(
        `UPDATE reservations
         SET status = 'ConvertedToSale', version = version + 1, updated_at = NOW()
         WHERE id = $1;`,
        [dto.reservationId]
      );
    }

    // 10. Construct Domain Event & Persist to Transactional Outbox
    const domainEvent: SaleRecordedDomainEvent = {
      eventName: DomainEventNames.SaleRecorded,
      header: {
        eventId: IdGenerator.generateUUIDv7(),
        eventVersion: 1,
        occurredAt: nowISO,
        tenantId: organizationId,
      },
      saleId,
      eventId: dto.eventId,
      reservationId: dto.reservationId,
      salesChannelId: dto.salesChannelId,
      externalSaleReference: dto.externalSaleReference,
      purchaserName: dto.purchaserName,
      purchaserPhone: dto.purchaserPhone,
      purchaserEmail: dto.purchaserEmail,
      lines: lines.map((l) => ({ venueAssetId: l.venueAssetId || '', quantity: l.quantity, unitPrice: l.unitPrice })),
    };

    await PgOutboxStore.addMessage(client, 'Sale', saleId, domainEvent);

    const createdSale: Sale = {
      id: saleId,
      organizationId,
      eventId: dto.eventId,
      reservationId: dto.reservationId,
      salesChannelId: dto.salesChannelId,
      externalReference: dto.externalSaleReference,
      channel: {
        type: 'ExternalChannel',
        name: dto.salesChannelId,
        reference: dto.externalSaleReference,
      },
      purchaserSnapshot: {
        fullName: dto.purchaserName || 'Anonymous',
        phone: dto.purchaserPhone || '',
        email: dto.purchaserEmail || '',
      },
      saleDate: nowISO,
      grossPrice,
      commissionPaid,
      commissionRate,
      netRevenue,
      currency: 'TRY',
      exchangeRate: 1,
      exchangeRateSource: 'TCMB',
      status: 'Completed',
      version: 1,
      isArchived: false,
      createdAt: nowISO,
      updatedAt: nowISO,
      accountingAmount: grossPrice,
      revenueSplit: {
        organizerAmount: { minorUnits: BigInt(Math.round(netRevenue * 100)), currency: 'TRY' },
        platformCommission: { minorUnits: BigInt(Math.round(commissionPaid * 100)), currency: 'TRY' },
        gatewayFee: { minorUnits: 0n, currency: 'TRY' },
        taxAmount: { minorUnits: BigInt(Math.round(grossPrice * 0.20 * 100)), currency: 'TRY' },
      },
      lines,
    };

    return {
      sale: createdSale,
      event: domainEvent,
      isDuplicateRecord: false,
    };
  }

  private static async executeInMemory(
    dto: ProcessExternalSaleConfirmationDTO,
    requestedAssetIds: string[]
  ): Promise<ProcessExternalSaleConfirmationResult> {
    const channel = MockDataStore.salesChannels.find((c) => c.id === dto.salesChannelId);
    if (!channel) {
      throw new Error(`Sales channel not found: ${dto.salesChannelId}`);
    }

    const existingSales = MockDataStore.sales || [];
    const duplicate = existingSales.find(
      (s) => s.salesChannelId === dto.salesChannelId && s.externalReference === dto.externalSaleReference
    );

    if (duplicate) {
      return {
        sale: duplicate,
        isDuplicateRecord: true,
      };
    }

    const assets = requestedAssetIds.map((id) => {
      const asset = VenueService.getAssetById(id);
      if (!asset) {
        throw new Error(`Asset not found: ${id}`);
      }
      if (asset.status === 'Sold') {
        throw new Error(`SEAT_ALREADY_RESERVED: Asset ${id} is already sold.`);
      }
      if (asset.status === 'Blocked') {
        throw new Error(`SEAT_BLOCKED: Asset ${id} is blocked.`);
      }
      return asset;
    });

    if (dto.reservationId) {
      const reservation = ReservationService.getReservationById(dto.reservationId);
      if (!reservation) {
        throw new Error(`RESERVATION_NOT_FOUND: Reservation ${dto.reservationId} not found.`);
      }
      if (reservation.status === 'Cancelled') {
        throw new Error(`RESERVATION_CANCELLED: Reservation ${dto.reservationId} was cancelled.`);
      }
      if (reservation.status === 'Expired' || new Date(reservation.expirationDate).getTime() < Date.now()) {
        throw new Error(`RESERVATION_EXPIRED: Reservation ${dto.reservationId} has expired.`);
      }
      if (dto.purchaserEmail && reservation.customerEmail && dto.purchaserEmail.toLowerCase() !== reservation.customerEmail.toLowerCase()) {
        throw new Error(`RESERVATION_NOT_OWNED: Purchaser email does not match reservation owner.`);
      }
      ReservationService.convertReservationToSale(dto.reservationId);
    }

    const commissionRate = channel.commissionPercentage / 100.0;
    const grossPrice = assets.reduce((sum, a) => {
      const price = (a as any).basePrice || (a as any).pricing?.basePrice || 0;
      return sum + price;
    }, 0);
    const commissionPaid = Math.round(grossPrice * commissionRate * 100) / 100;
    const netRevenue = Math.round((grossPrice - commissionPaid) * 100) / 100;

    const saleId = IdGenerator.generateUUIDv7();
    const nowISO = new Date().toISOString();

    const lines: SaleLine[] = assets.map((a) => {
      const price = (a as any).basePrice || (a as any).pricing?.basePrice || 0;
      return {
        id: IdGenerator.generateUUIDv7(),
        saleId,
        itemType: 'VenueAsset',
        venueAssetId: a.id,
        quantity: 1,
        unitPrice: price,
        discountAmount: 0,
        taxAmount: Math.round(price * 0.20 * 100) / 100,
        totalPrice: price,
        currency: 'TRY',
        exchangeRate: 1,
      };
    });

    const safeTax = isNaN(grossPrice) ? 0 : Math.round(grossPrice * 0.20 * 100);
    const safeOrg = isNaN(netRevenue) ? 0 : Math.round(netRevenue * 100);
    const safeComm = isNaN(commissionPaid) ? 0 : Math.round(commissionPaid * 100);

    const sale: Sale = {
      id: saleId,
      organizationId: dto.organizationId || 'org_stageops_01',
      eventId: dto.eventId,
      reservationId: dto.reservationId,
      salesChannelId: dto.salesChannelId,
      externalReference: dto.externalSaleReference,
      channel: {
        type: 'ExternalChannel',
        name: channel.name,
        reference: dto.externalSaleReference,
      },
      purchaserSnapshot: {
        fullName: dto.purchaserName || 'Anonymous',
        phone: dto.purchaserPhone || '',
        email: dto.purchaserEmail || '',
      },
      saleDate: nowISO,
      grossPrice,
      commissionPaid,
      commissionRate,
      netRevenue,
      currency: 'TRY',
      exchangeRate: 1,
      exchangeRateSource: 'TCMB',
      status: 'Completed',
      version: 1,
      isArchived: false,
      createdAt: nowISO,
      updatedAt: nowISO,
      accountingAmount: grossPrice,
      revenueSplit: {
        organizerAmount: { minorUnits: BigInt(safeOrg), currency: 'TRY' },
        platformCommission: { minorUnits: BigInt(safeComm), currency: 'TRY' },
        gatewayFee: { minorUnits: 0n, currency: 'TRY' },
        taxAmount: { minorUnits: BigInt(safeTax), currency: 'TRY' },
      },
      lines,
    };

    if (!MockDataStore.sales) {
      MockDataStore.sales = [];
    }
    MockDataStore.sales.push(sale);
    assets.forEach((a) => {
      a.status = 'Sold';
    });

    const event: SaleRecordedDomainEvent = {
      eventName: DomainEventNames.SaleRecorded,
      header: {
        eventId: IdGenerator.generateUUIDv7(),
        eventVersion: 1,
        occurredAt: nowISO,
        tenantId: dto.organizationId || 'org_stageops_01',
      },
      saleId,
      eventId: dto.eventId,
      reservationId: dto.reservationId,
      salesChannelId: dto.salesChannelId,
      externalSaleReference: dto.externalSaleReference,
      purchaserName: dto.purchaserName,
      purchaserPhone: dto.purchaserPhone,
      purchaserEmail: dto.purchaserEmail,
      lines: lines.map((l) => ({ venueAssetId: l.venueAssetId || '', quantity: l.quantity, unitPrice: l.unitPrice })),
    };

    const bus = InMemoryEventBus.getInstance();
    await bus.publish(event);

    return {
      sale,
      event,
      isDuplicateRecord: false,
    };
  }
}
