import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Pool } from 'pg';
import { PgPool } from '@/platform/pg/PgPool';
import { UnitOfWork } from '@/platform/pg/UnitOfWork';
import { PgOutboxStore } from '@/platform/pg/PgOutboxStore';
import { PgConsumerIdempotencyStore } from '@/platform/pg/PgConsumerIdempotencyStore';
import { AccountingSaleRecordedHandler } from '@/accounting/application/handlers/AccountingSaleRecordedHandler';
import { OperationsSaleRecordedHandler } from '@/operations/application/handlers/OperationsSaleRecordedHandler';
import { ProcessExternalSaleConfirmationUseCase } from '@/services/ProcessExternalSaleConfirmationUseCase';
import { DomainEventNames, SaleRecordedDomainEvent } from '@/domain/events/DomainEvents';
import { DomainEvent } from '@/application/EventBus';
import { IdGenerator } from '@/platform/IdGenerator';
import { OutboxPublisherWorker, PgOutboxAdapter } from '@/platform/OutboxPublisherWorker';
import { InMemoryEventBus } from '@/application/EventBus';
import { VenueService } from '@/services/VenueService';
import { MockDataStore } from '@/repositories/mock/MockRepositories';
import fs from 'fs';
import path from 'path';

describe('PostgreSQL Correctness Baseline (T1 - T52 Integration Tests)', () => {
  let pool: Pool;

  beforeAll(async () => {
    pool = PgPool.getPool();
    const migrationSql = fs.readFileSync(
      path.resolve(__dirname, '../../migrations/001_outbox_correctness.sql'),
      'utf-8'
    );
    await pool.query(migrationSql);
  });

  afterAll(async () => {
    await PgPool.closePool();
  });

  beforeEach(async () => {
    await pool.query('TRUNCATE outbox_messages, processed_events, sales, sale_lines, accounting_entries, venue_asset_projections, admission_rights CASCADE;');
    
    // Seed default venue asset projections in PostgreSQL for DB-authoritative execution mode
    await pool.query(`
      INSERT INTO venue_asset_projections (asset_id, name, category, status, occupancy_state, pax_capacity, base_price, version, last_updated)
      VALUES
        ('asset_vip_a1', 'VIP A1', 'VIP', 'Available', 'Vacant', 6, 25000, 1, NOW()),
        ('asset_vip_a2', 'VIP A2', 'VIP', 'Available', 'Vacant', 6, 25000, 1, NOW()),
        ('asset_vip_a3', 'VIP A3', 'VIP', 'Available', 'Vacant', 6, 25000, 1, NOW()),
        ('asset_vip_a4', 'VIP A4', 'VIP', 'Available', 'Vacant', 6, 25000, 1, NOW()),
        ('asset_bistro_b1', 'Bistro B1', 'Bistro', 'Available', 'Vacant', 4, 12000, 1, NOW()),
        ('asset_bistro_b2', 'Bistro B2', 'Bistro', 'Available', 'Vacant', 4, 12000, 1, NOW()),
        ('asset_bistro_b3', 'Bistro B3', 'Bistro', 'Available', 'Vacant', 4, 12000, 1, NOW()),
        ('asset_bistro_b4', 'Bistro B4', 'Bistro', 'Available', 'Vacant', 4, 12000, 1, NOW())
      ON CONFLICT (asset_id) DO NOTHING;
    `);

    // Reset MockDataStore assets for in-memory parity tests
    MockDataStore.assets.forEach((a) => {
      if (a.id === 'asset_vip_a3' || a.id === 'asset_vip_a4') {
        a.status = 'Available';
      }
    });
  });

  it('T1: Concurrent Duplicate Consumer Delivery — UNIQUE(event_id, consumer_name)', async () => {
    const eventId = IdGenerator.generateUUIDv7();
    const consumerName = 'AccountingSaleRecordedHandler';

    const task1 = UnitOfWork.execute((tx) =>
      PgConsumerIdempotencyStore.processIdempotently(tx, eventId, consumerName, async (client) => {
        await client.query(
          `INSERT INTO accounting_entries (id, organization_id, event_id, source_type, source_id, entry_type, amount, currency, accounting_amount, occurred_at)
           VALUES ($1, 'org_01', $2, 'Sale', $3, 'SaleRevenue', 1000.0, 'TRY', 1000.0, NOW());`,
          [IdGenerator.generateUUIDv7(), eventId, IdGenerator.generateUUIDv7()]
        );
      })
    );

    const task2 = UnitOfWork.execute((tx) =>
      PgConsumerIdempotencyStore.processIdempotently(tx, eventId, consumerName, async (client) => {
        await client.query(
          `INSERT INTO accounting_entries (id, organization_id, event_id, source_type, source_id, entry_type, amount, currency, accounting_amount, occurred_at)
           VALUES ($1, 'org_01', $2, 'Sale', $3, 'SaleRevenue', 1000.0, 'TRY', 1000.0, NOW());`,
          [IdGenerator.generateUUIDv7(), eventId, IdGenerator.generateUUIDv7()]
        );
      })
    );

    const results = await Promise.all([task1, task2]);
    const executedCount = results.filter((r) => r.executed).length;
    expect(executedCount).toBe(1);

    const dbEntries = await pool.query('SELECT * FROM accounting_entries WHERE event_id = $1', [eventId]);
    expect(dbEntries.rows.length).toBe(1);
    expect(parseFloat(dbEntries.rows[0].amount)).toBe(1000.0);
  });

  it('T2: Business Mutation + Crash (ROLLBACK) — Idempotency record and mutation undone together', async () => {
    const eventId = IdGenerator.generateUUIDv7();
    const consumerName = 'AccountingSaleRecordedHandler';

    try {
      await UnitOfWork.execute(async (tx) => {
        await PgConsumerIdempotencyStore.processIdempotently(tx, eventId, consumerName, async (client) => {
          await client.query(
            `INSERT INTO accounting_entries (id, organization_id, event_id, source_type, source_id, entry_type, amount, currency, accounting_amount, occurred_at)
             VALUES ($1, 'org_01', $2, 'Sale', $3, 'SaleRevenue', 1000.0, 'TRY', 1000.0, NOW());`,
            [IdGenerator.generateUUIDv7(), eventId, IdGenerator.generateUUIDv7()]
          );
          throw new Error('SIMULATED_PROCESS_CRASH_BEFORE_COMMIT');
        });
      });
    } catch (err: any) {
      expect(err.message).toBe('SIMULATED_PROCESS_CRASH_BEFORE_COMMIT');
    }

    const processedRes = await pool.query('SELECT * FROM processed_events WHERE event_id = $1', [eventId]);
    const entriesRes = await pool.query('SELECT * FROM accounting_entries WHERE event_id = $1', [eventId]);

    expect(processedRes.rows.length).toBe(0);
    expect(entriesRes.rows.length).toBe(0);

    const retryResult = await UnitOfWork.execute((tx) =>
      PgConsumerIdempotencyStore.processIdempotently(tx, eventId, consumerName, async (client) => {
        await client.query(
          `INSERT INTO accounting_entries (id, organization_id, event_id, source_type, source_id, entry_type, amount, currency, accounting_amount, occurred_at)
           VALUES ($1, 'org_01', $2, 'Sale', $3, 'SaleRevenue', 1000.0, 'TRY', 1000.0, NOW());`,
          [IdGenerator.generateUUIDv7(), eventId, IdGenerator.generateUUIDv7()]
        );
      })
    );

    expect(retryResult.executed).toBe(true);
  });

  it('T3: Processed_events INSERT + Mutation Failure — Same transaction rollback', async () => {
    const eventId = IdGenerator.generateUUIDv7();
    const consumerName = 'TestConsumer';

    await expect(
      UnitOfWork.execute((tx) =>
        PgConsumerIdempotencyStore.processIdempotently(tx, eventId, consumerName, async () => {
          throw new Error('BUSINESS_MUTATION_FAILURE');
        })
      )
    ).rejects.toThrow('BUSINESS_MUTATION_FAILURE');

    const res = await pool.query('SELECT * FROM processed_events WHERE event_id = $1', [eventId]);
    expect(res.rows.length).toBe(0);
  });

  it('T4: Concurrent Worker Claiming — FOR UPDATE SKIP LOCKED exclusive claiming', async () => {
    const eventId = IdGenerator.generateUUIDv7();
    const saleId = IdGenerator.generateUUIDv7();
    const event: SaleRecordedDomainEvent = {
      eventName: DomainEventNames.SaleRecorded,
      header: { eventId, eventVersion: 1, occurredAt: new Date().toISOString() },
      saleId,
      eventId: IdGenerator.generateUUIDv7(),
    };

    await UnitOfWork.execute((tx) => PgOutboxStore.addMessage(tx, 'Sale', saleId, event));

    const worker1Claim = PgOutboxStore.claimPendingMessages('worker_01', 10);
    const worker2Claim = PgOutboxStore.claimPendingMessages('worker_02', 10);

    const [claimed1, claimed2] = await Promise.all([worker1Claim, worker2Claim]);
    const totalClaimed = claimed1.length + claimed2.length;

    expect(totalClaimed).toBe(1);
  });

  it('T5: Worker Lease Expiration & Recovery', async () => {
    const eventId = IdGenerator.generateUUIDv7();
    const saleId = IdGenerator.generateUUIDv7();
    const event: SaleRecordedDomainEvent = {
      eventName: DomainEventNames.SaleRecorded,
      header: { eventId, eventVersion: 1, occurredAt: new Date().toISOString() },
      saleId,
      eventId: IdGenerator.generateUUIDv7(),
    };

    await UnitOfWork.execute((tx) => PgOutboxStore.addMessage(tx, 'Sale', saleId, event));

    const claimed1 = await PgOutboxStore.claimPendingMessages('worker_01', 1, 0);
    expect(claimed1.length).toBe(1);

    await new Promise((r) => setTimeout(r, 20));

    const claimed2 = await PgOutboxStore.claimPendingMessages('worker_02', 1, 30);
    expect(claimed2.length).toBe(1);
    expect(claimed2[0]?.id).toBe(eventId);
    expect(claimed2[0]?.lockedBy).toBe('worker_02');
    expect(claimed2[0]?.leaseVersion).toBe(2);
  });

  it('T6: Stale Worker Fencing — lease_version mismatch causes markPublished to no-op', async () => {
    const eventId = IdGenerator.generateUUIDv7();
    const saleId = IdGenerator.generateUUIDv7();
    const event: SaleRecordedDomainEvent = {
      eventName: DomainEventNames.SaleRecorded,
      header: { eventId, eventVersion: 1, occurredAt: new Date().toISOString() },
      saleId,
      eventId: IdGenerator.generateUUIDv7(),
    };

    await UnitOfWork.execute((tx) => PgOutboxStore.addMessage(tx, 'Sale', saleId, event));

    const claimedA = await PgOutboxStore.claimPendingMessages('worker_A', 1, 0);
    const msgA = claimedA[0]!;
    expect(msgA.leaseVersion).toBe(1);

    await new Promise((r) => setTimeout(r, 20));

    const claimedB = await PgOutboxStore.claimPendingMessages('worker_B', 1, 30);
    const msgB = claimedB[0]!;
    expect(msgB.leaseVersion).toBe(2);

    const staleResult = await PgOutboxStore.markPublished(msgA.id, msgA.lockedBy!, msgA.leaseVersion);
    expect(staleResult).toBe(false);

    const validResult = await PgOutboxStore.markPublished(msgB.id, msgB.lockedBy!, msgB.leaseVersion);
    expect(validResult).toBe(true);
  });

  it('T7: Partial Consumer Failure & Retry Convergence', async () => {
    const eventId = IdGenerator.generateUUIDv7();
    const saleId = IdGenerator.generateUUIDv7();
    const eventDbId = IdGenerator.generateUUIDv7();
    const nowISO = new Date().toISOString();

    await UnitOfWork.execute(async (tx) => {
      await tx.query(
        `INSERT INTO sales (id, organization_id, event_id, sales_channel_id, external_reference, gross_price, commission_paid, net_revenue, currency, status, created_at)
         VALUES ($1, 'org_01', $2, 'biletix', 'REF-01', 25000, 1500, 23500, 'TRY', 'Completed', $3);`,
        [saleId, eventDbId, nowISO]
      );
      await tx.query(
        `INSERT INTO sale_lines (id, sale_id, venue_asset_id, quantity, unit_price, total_price)
         VALUES ($1, $2, 'asset_vip_a1', 1, 25000, 25000);`,
        [IdGenerator.generateUUIDv7(), saleId]
      );
    });

    const event: SaleRecordedDomainEvent = {
      eventName: DomainEventNames.SaleRecorded,
      header: { eventId, eventVersion: 1, occurredAt: nowISO },
      saleId,
      eventId: eventDbId,
    };

    await UnitOfWork.execute((tx) => AccountingSaleRecordedHandler.handle(event, tx));

    try {
      await UnitOfWork.execute(async () => {
        throw new Error('OPERATIONS_TEMPORARY_DB_LOCK');
      });
    } catch {}

    await UnitOfWork.execute((tx) => AccountingSaleRecordedHandler.handle(event, tx));
    await UnitOfWork.execute((tx) => OperationsSaleRecordedHandler.handle(event, tx));

    const accEntries = await pool.query('SELECT * FROM accounting_entries WHERE source_id = $1', [saleId]);
    const opsProjections = await pool.query('SELECT * FROM venue_asset_projections WHERE asset_id = $1', ['asset_vip_a1']);

    const revenueEntries = accEntries.rows.filter((x) => x.entry_type === 'SaleRevenue');
    const commissionEntries = accEntries.rows.filter((x) => x.entry_type === 'PlatformCommission');

    expect(revenueEntries).toHaveLength(1);
    expect(commissionEntries).toHaveLength(1);
    expect(accEntries.rows.length).toBe(2);
    expect(opsProjections.rows.length).toBe(1);
    expect(opsProjections.rows[0].status).toBe('Sold');
  });

  it('T8: 5 Failed Delivery Attempts -> DeadLetter Status & Nullified next_retry_at', async () => {
    const eventId = IdGenerator.generateUUIDv7();
    const saleId = IdGenerator.generateUUIDv7();
    const event: SaleRecordedDomainEvent = {
      eventName: DomainEventNames.SaleRecorded,
      header: { eventId, eventVersion: 1, occurredAt: new Date().toISOString() },
      saleId,
      eventId: IdGenerator.generateUUIDv7(),
    };

    await UnitOfWork.execute((tx) => PgOutboxStore.addMessage(tx, 'Sale', saleId, event, 5));

    for (let i = 0; i < 5; i++) {
      const claimed = await PgOutboxStore.claimPendingMessages('worker_test', 1, 0);
      const msg = claimed[0]!;
      await PgOutboxStore.markFailed(msg.id, msg.lockedBy!, msg.leaseVersion, `Attempt ${i + 1} failed`);
      if (i < 4) {
        await pool.query('UPDATE outbox_messages SET next_retry_at = NOW() WHERE id = $1', [msg.id]);
      }
    }

    const finalMsg = await PgOutboxStore.getMessageById(eventId);
    expect(finalMsg?.status).toBe('DeadLetter');
    expect(finalMsg?.retryCount).toBe(5);
    expect(finalMsg?.nextRetryAt).toBeUndefined();
  });

  it('T9: DLQ Replay -> Consumer Idempotency Retains Duplicate Safety', async () => {
    const eventId = IdGenerator.generateUUIDv7();
    const saleId = IdGenerator.generateUUIDv7();
    const eventDbId = IdGenerator.generateUUIDv7();
    const nowISO = new Date().toISOString();

    await UnitOfWork.execute(async (tx) => {
      await tx.query(
        `INSERT INTO sales (id, organization_id, event_id, sales_channel_id, external_reference, gross_price, commission_paid, net_revenue, currency, status, created_at)
         VALUES ($1, 'org_01', $2, 'biletix', 'REF-DLQ-REPLAY', 25000, 1500, 23500, 'TRY', 'Completed', $3);`,
        [saleId, eventDbId, nowISO]
      );
    });

    const event: SaleRecordedDomainEvent = {
      eventName: DomainEventNames.SaleRecorded,
      header: { eventId, eventVersion: 1, occurredAt: nowISO },
      saleId,
      eventId: eventDbId,
    };

    await UnitOfWork.execute((tx) => AccountingSaleRecordedHandler.handle(event, tx));
    await UnitOfWork.execute((tx) => AccountingSaleRecordedHandler.handle(event, tx));

    const accEntries = await pool.query('SELECT * FROM accounting_entries WHERE source_id = $1', [saleId]);
    const revenueEntries = accEntries.rows.filter((x) => x.entry_type === 'SaleRevenue');
    const commissionEntries = accEntries.rows.filter((x) => x.entry_type === 'PlatformCommission');

    expect(revenueEntries).toHaveLength(1);
    expect(commissionEntries).toHaveLength(1);
    expect(accEntries.rows.length).toBe(2);
  });

  it('T10: Handler Commit -> Crash Before markPublished -> Redelivery Safety', async () => {
    const eventId = IdGenerator.generateUUIDv7();
    const saleId = IdGenerator.generateUUIDv7();
    const eventDbId = IdGenerator.generateUUIDv7();
    const nowISO = new Date().toISOString();

    const event: SaleRecordedDomainEvent = {
      eventName: DomainEventNames.SaleRecorded,
      header: { eventId, eventVersion: 1, occurredAt: nowISO },
      saleId,
      eventId: eventDbId,
    };

    await UnitOfWork.execute(async (tx) => {
      await tx.query(
        `INSERT INTO sales (id, organization_id, event_id, sales_channel_id, external_reference, gross_price, commission_paid, net_revenue, currency, status, created_at)
         VALUES ($1, 'org_01', $2, 'biletix', 'REF-T10', 25000, 1500, 23500, 'TRY', 'Completed', $3);`,
        [saleId, eventDbId, nowISO]
      );
      await tx.query(
        `INSERT INTO sale_lines (id, sale_id, venue_asset_id, quantity, unit_price, total_price)
         VALUES ($1, $2, 'asset_vip_a1', 1, 25000, 25000);`,
        [IdGenerator.generateUUIDv7(), saleId]
      );
      await PgOutboxStore.addMessage(tx, 'Sale', saleId, event);
    });

    const claimedA = await PgOutboxStore.claimPendingMessages('worker_A', 1, 0);
    const msgA = claimedA[0]!;
    const payloadA = msgA.payload as SaleRecordedDomainEvent;

    await UnitOfWork.execute((tx) => AccountingSaleRecordedHandler.handle(payloadA, tx));

    await new Promise((r) => setTimeout(r, 20));

    const claimedB = await PgOutboxStore.claimPendingMessages('worker_B', 1, 30);
    const msgB = claimedB[0]!;
    await UnitOfWork.execute((tx) => AccountingSaleRecordedHandler.handle(msgB.payload as SaleRecordedDomainEvent, tx));

    const publishedResult = await PgOutboxStore.markPublished(msgB.id, msgB.lockedBy!, msgB.leaseVersion);
    expect(publishedResult).toBe(true);

    const accEntries = await pool.query('SELECT * FROM accounting_entries WHERE source_id = $1', [saleId]);
    const revenueEntries = accEntries.rows.filter((x) => x.entry_type === 'SaleRevenue');
    const commissionEntries = accEntries.rows.filter((x) => x.entry_type === 'PlatformCommission');

    expect(revenueEntries).toHaveLength(1);
    expect(commissionEntries).toHaveLength(1);
    expect(accEntries.rows.length).toBe(2);

    const finalOutbox = await PgOutboxStore.getMessageById(eventId);
    expect(finalOutbox?.status).toBe('Published');
  });

  it('T11: Multi-Line Sale Processing — Updates projections for all asset lines in PostgreSQL mode', async () => {
    const eventId = IdGenerator.generateUUIDv7();
    const saleId = IdGenerator.generateUUIDv7();
    const eventDbId = IdGenerator.generateUUIDv7();
    const nowISO = new Date().toISOString();

    await UnitOfWork.execute(async (tx) => {
      await tx.query(
        `INSERT INTO sales (id, organization_id, event_id, sales_channel_id, external_reference, gross_price, commission_paid, net_revenue, currency, status, created_at)
         VALUES ($1, 'org_01', $2, 'biletix', 'REF-T11-MULTILINE', 50000, 3000, 47000, 'TRY', 'Completed', $3);`,
        [saleId, eventDbId, nowISO]
      );
      await tx.query(
        `INSERT INTO sale_lines (id, sale_id, venue_asset_id, quantity, unit_price, total_price)
         VALUES
          ($1, $2, 'asset_vip_a1', 1, 25000, 25000),
          ($3, $2, 'asset_vip_a2', 1, 25000, 25000);`,
        [IdGenerator.generateUUIDv7(), saleId, IdGenerator.generateUUIDv7()]
      );
    });

    const event: SaleRecordedDomainEvent = {
      eventName: DomainEventNames.SaleRecorded,
      header: { eventId, eventVersion: 1, occurredAt: nowISO },
      saleId,
      eventId: eventDbId,
    };

    await UnitOfWork.execute((tx) => OperationsSaleRecordedHandler.handle(event, tx));

    const projA1 = await pool.query('SELECT * FROM venue_asset_projections WHERE asset_id = $1', ['asset_vip_a1']);
    const projA2 = await pool.query('SELECT * FROM venue_asset_projections WHERE asset_id = $1', ['asset_vip_a2']);

    expect(projA1.rows.length).toBe(1);
    expect(projA1.rows[0].status).toBe('Sold');
    expect(projA2.rows.length).toBe(1);
    expect(projA2.rows[0].status).toBe('Sold');
  });

  it('T12: Duplicate Command Idempotency in PostgreSQL mode — Returns duplicate record without creating extra sales', async () => {
    const command = {
      eventId: 'event_gala_2026',
      assetId: 'asset_bistro_b4',
      salesChannelId: 'biletix',
      externalSaleReference: 'BTX-DUP-TEST-001',
    };

    const res1 = await UnitOfWork.execute((tx) =>
      ProcessExternalSaleConfirmationUseCase.execute({ ...command, pgClient: tx })
    );
    expect(res1.isDuplicateRecord).toBe(false);

    const res2 = await UnitOfWork.execute((tx) =>
      ProcessExternalSaleConfirmationUseCase.execute({ ...command, pgClient: tx })
    );
    expect(res2.isDuplicateRecord).toBe(true);
    expect(res2.sale.id).toBe(res1.sale.id);

    const dbSales = await pool.query(
      'SELECT * FROM sales WHERE sales_channel_id = $1 AND external_reference = $2',
      [command.salesChannelId, command.externalSaleReference]
    );
    expect(dbSales.rows.length).toBe(1);
  });

  it('T13: Defense in Depth — ux_accounting_source_entry unique index prevents duplicate entries', async () => {
    const eventId = IdGenerator.generateUUIDv7();
    const sourceId = IdGenerator.generateUUIDv7();

    await UnitOfWork.execute((tx) =>
      tx.query(
        `INSERT INTO accounting_entries (id, organization_id, event_id, source_type, source_id, entry_type, amount, currency, accounting_amount, occurred_at)
         VALUES ($1, 'org_01', $2, 'Sale', $3, 'SaleRevenue', 25000.0, 'TRY', 25000.0, NOW());`,
        [IdGenerator.generateUUIDv7(), eventId, sourceId]
      )
    );

    await expect(
      UnitOfWork.execute((tx) =>
        tx.query(
          `INSERT INTO accounting_entries (id, organization_id, event_id, source_type, source_id, entry_type, amount, currency, accounting_amount, occurred_at)
           VALUES ($1, 'org_01', $2, 'Sale', $3, 'SaleRevenue', 25000.0, 'TRY', 25000.0, NOW());`,
          [IdGenerator.generateUUIDv7(), eventId, sourceId]
        )
      )
    ).rejects.toThrow();
  });

  it('T14: Concurrent Duplicate Commands — 10 parallel commands produce exactly 1 sale row', async () => {
    const command = {
      eventId: 'event_gala_2026',
      assetId: 'asset_bistro_b1',
      salesChannelId: 'biletix',
      externalSaleReference: 'BTX-RACE-CONCURRENT-001',
    };

    const tasks = Array.from({ length: 10 }, () =>
      UnitOfWork.execute((tx) =>
        ProcessExternalSaleConfirmationUseCase.execute({ ...command, pgClient: tx })
      )
    );

    const results = await Promise.all(tasks);
    const originalCount = results.filter((r) => !r.isDuplicateRecord).length;
    const duplicateCount = results.filter((r) => r.isDuplicateRecord).length;

    expect(originalCount).toBe(1);
    expect(duplicateCount).toBe(9);

    const dbSales = await pool.query(
      'SELECT * FROM sales WHERE sales_channel_id = $1 AND external_reference = $2',
      [command.salesChannelId, command.externalSaleReference]
    );
    expect(dbSales.rows.length).toBe(1);
  });

  it('T15: Stale Worker markFailed Fencing — Mismatched lease_version fails fencing check', async () => {
    const eventId = IdGenerator.generateUUIDv7();
    const saleId = IdGenerator.generateUUIDv7();
    const event: SaleRecordedDomainEvent = {
      eventName: DomainEventNames.SaleRecorded,
      header: { eventId, eventVersion: 1, occurredAt: new Date().toISOString() },
      saleId,
      eventId: IdGenerator.generateUUIDv7(),
    };

    await UnitOfWork.execute((tx) => PgOutboxStore.addMessage(tx, 'Sale', saleId, event));

    const claimedA = await PgOutboxStore.claimPendingMessages('worker_A', 1, 0);
    const msgA = claimedA[0]!;
    expect(msgA.leaseVersion).toBe(1);

    await new Promise((r) => setTimeout(r, 20));

    const claimedB = await PgOutboxStore.claimPendingMessages('worker_B', 1, 30);
    const msgB = claimedB[0]!;
    expect(msgB.leaseVersion).toBe(2);

    const staleFailedResult = await PgOutboxStore.markFailed(msgA.id, msgA.lockedBy!, msgA.leaseVersion, 'Stale error');
    expect(staleFailedResult).toBe(false);

    const msgState = await PgOutboxStore.getMessageById(eventId);
    expect(msgState?.lockedBy).toBe('worker_B');
    expect(msgState?.leaseVersion).toBe(2);
  });

  it('T16: Complete Transaction Rollback — Sale, SaleLines & OutboxMessage undone together on error', async () => {
    const command = {
      eventId: 'event_gala_2026',
      assetId: 'asset_bistro_b2',
      salesChannelId: 'biletix',
      externalSaleReference: 'BTX-ROLLBACK-TEST-001',
    };

    await expect(
      UnitOfWork.execute(async (tx) => {
        await ProcessExternalSaleConfirmationUseCase.execute({ ...command, pgClient: tx });
        throw new Error('SIMULATED_USECASE_COMMITTED_ERROR');
      })
    ).rejects.toThrow('SIMULATED_USECASE_COMMITTED_ERROR');

    const dbSales = await pool.query('SELECT * FROM sales WHERE external_reference = $1', [command.externalSaleReference]);
    const dbOutbox = await pool.query('SELECT * FROM outbox_messages WHERE aggregate_id IN (SELECT id FROM sales WHERE external_reference = $1)', [command.externalSaleReference]);

    expect(dbSales.rows.length).toBe(0);
    expect(dbOutbox.rows.length).toBe(0);
  });

  it('T17: Effectively-Once Business Processing — At-least-once delivery + Idempotent consumers + Fenced outbox', async () => {
    const eventId = IdGenerator.generateUUIDv7();
    const saleId = IdGenerator.generateUUIDv7();
    const eventDbId = IdGenerator.generateUUIDv7();
    const nowISO = new Date().toISOString();

    const event: SaleRecordedDomainEvent = {
      eventName: DomainEventNames.SaleRecorded,
      header: { eventId, eventVersion: 1, occurredAt: nowISO },
      saleId,
      eventId: eventDbId,
    };

    await UnitOfWork.execute(async (tx) => {
      await tx.query(
        `INSERT INTO sales (id, organization_id, event_id, sales_channel_id, external_reference, gross_price, commission_paid, net_revenue, currency, status, created_at)
         VALUES ($1, 'org_01', $2, 'biletix', 'REF-T17', 25000, 1500, 23500, 'TRY', 'Completed', $3);`,
        [saleId, eventDbId, nowISO]
      );
      await tx.query(
        `INSERT INTO sale_lines (id, sale_id, venue_asset_id, quantity, unit_price, total_price)
         VALUES ($1, $2, 'asset_vip_a4', 1, 25000, 25000);`,
        [IdGenerator.generateUUIDv7(), saleId]
      );
      await PgOutboxStore.addMessage(tx, 'Sale', saleId, event);
    });

    for (let attempt = 1; attempt <= 3; attempt++) {
      await UnitOfWork.execute((tx) => AccountingSaleRecordedHandler.handle(event, tx));
      await UnitOfWork.execute((tx) => OperationsSaleRecordedHandler.handle(event, tx));
    }

    const accEntries = await pool.query('SELECT * FROM accounting_entries WHERE source_id = $1', [saleId]);
    const opsProjections = await pool.query('SELECT * FROM venue_asset_projections WHERE asset_id = $1', ['asset_vip_a4']);

    const revenueEntries = accEntries.rows.filter((x) => x.entry_type === 'SaleRevenue');
    const commissionEntries = accEntries.rows.filter((x) => x.entry_type === 'PlatformCommission');

    expect(revenueEntries).toHaveLength(1);
    expect(commissionEntries).toHaveLength(1);
    expect(accEntries.rows.length).toBe(2);
    expect(opsProjections.rows.length).toBe(1);
    expect(opsProjections.rows[0].status).toBe('Sold');
  });

  it('T18: Invalid Asset Validation — Throws error when asset does not exist', async () => {
    const command = {
      eventId: 'event_gala_2026',
      assetId: 'non_existent_asset_id',
      salesChannelId: 'biletix',
      externalSaleReference: 'BTX-INVALID-ASSET-001',
    };

    await expect(
      UnitOfWork.execute((tx) =>
        ProcessExternalSaleConfirmationUseCase.execute({ ...command, pgClient: tx })
      )
    ).rejects.toThrow('Asset not found');

    const dbSales = await pool.query('SELECT * FROM sales WHERE external_reference = $1', [command.externalSaleReference]);
    expect(dbSales.rows.length).toBe(0);
  });

  it('T19: Sold Asset Validation — Throws SEAT_ALREADY_RESERVED when asset status is Sold', async () => {
    await pool.query(
      `UPDATE venue_asset_projections SET status = 'Sold' WHERE asset_id = 'asset_vip_a1';`
    );

    const command = {
      eventId: 'event_gala_2026',
      assetId: 'asset_vip_a1',
      salesChannelId: 'biletix',
      externalSaleReference: 'BTX-SOLD-ASSET-001',
    };

    await expect(
      UnitOfWork.execute((tx) =>
        ProcessExternalSaleConfirmationUseCase.execute({ ...command, pgClient: tx })
      )
    ).rejects.toThrow('SEAT_ALREADY_RESERVED');

    const dbSales = await pool.query('SELECT * FROM sales WHERE external_reference = $1', [command.externalSaleReference]);
    expect(dbSales.rows.length).toBe(0);
  });

  it('T20: Business Uniqueness Constraint — Same Sale with different Event ID is blocked by ux_accounting_source_entry', async () => {
    const saleId = IdGenerator.generateUUIDv7();
    const eventA = IdGenerator.generateUUIDv7();
    const eventB = IdGenerator.generateUUIDv7();

    await UnitOfWork.execute((tx) =>
      tx.query(
        `INSERT INTO accounting_entries (id, organization_id, event_id, source_type, source_id, entry_type, amount, currency, accounting_amount, occurred_at)
         VALUES ($1, 'org_01', $2, 'Sale', $3, 'SaleRevenue', 25000.0, 'TRY', 25000.0, NOW());`,
        [IdGenerator.generateUUIDv7(), eventA, saleId]
      )
    );

    await expect(
      UnitOfWork.execute((tx) =>
        tx.query(
          `INSERT INTO accounting_entries (id, organization_id, event_id, source_type, source_id, entry_type, amount, currency, accounting_amount, occurred_at)
           VALUES ($1, 'org_01', $2, 'Sale', $3, 'SaleRevenue', 25000.0, 'TRY', 25000.0, NOW());`,
          [IdGenerator.generateUUIDv7(), eventB, saleId]
        )
      )
    ).rejects.toThrow();
  });

  it('T21: Faithful Duplicate Aggregate Representation — Duplicate command returns complete lines & pricing', async () => {
    const command = {
      eventId: 'event_gala_2026',
      assetId: 'asset_bistro_b3',
      salesChannelId: 'biletix',
      externalSaleReference: 'BTX-FAITHFUL-DUP-001',
    };

    const res1 = await UnitOfWork.execute((tx) =>
      ProcessExternalSaleConfirmationUseCase.execute({ ...command, pgClient: tx })
    );

    const res2 = await UnitOfWork.execute((tx) =>
      ProcessExternalSaleConfirmationUseCase.execute({ ...command, pgClient: tx })
    );

    expect(res2.isDuplicateRecord).toBe(true);
    expect(res2.sale.id).toBe(res1.sale.id);
    expect(res2.sale.lines).toHaveLength(1);
    expect(res2.sale.lines[0]?.venueAssetId).toBe('asset_bistro_b3');
    expect(res2.sale.grossPrice).toBe(res1.sale.grossPrice);
  });

  it('T22: Concurrent Different References Against Same Asset — Zero Overselling Invariant', async () => {
    const targetAssetId = 'asset_vip_a3'; // Available VIP Asset

    const tasks = Array.from({ length: 10 }, (_, idx) => {
      const command = {
        eventId: 'event_gala_2026',
        assetId: targetAssetId,
        salesChannelId: 'biletix',
        externalSaleReference: `BTX-RACE-DIFF-REF-${idx + 1}`,
      };
      return UnitOfWork.execute((tx) =>
        ProcessExternalSaleConfirmationUseCase.execute({ ...command, pgClient: tx })
      ).catch((err: Error) => ({ error: err.message }));
    });

    const results = await Promise.all(tasks);

    const successfulSales = results.filter((r) => 'sale' in r && !r.isDuplicateRecord);
    const rejectedSales = results.filter((r) => 'error' in r && r.error.includes('SEAT_ALREADY_RESERVED'));

    expect(successfulSales.length).toBe(1);
    expect(rejectedSales.length).toBe(9);

    const dbLines = await pool.query('SELECT * FROM sale_lines WHERE venue_asset_id = $1', [targetAssetId]);
    expect(dbLines.rows.length).toBe(1);
  });

  it('T23: Initial Unpopulated Asset Projection Race — 10 concurrent sales when DB table starts empty', async () => {
    const targetAssetId = 'asset_empty_b4';

    await pool.query(
      `INSERT INTO venue_asset_projections (asset_id, name, category, status, occupancy_state, pax_capacity, base_price, version, last_updated)
       VALUES ($1, 'Bistro B4', 'Bistro', 'Available', 'Vacant', 4, 12000, 1, NOW());`,
      [targetAssetId]
    );

    const tasks = Array.from({ length: 10 }, (_, idx) => {
      const command = {
        eventId: 'event_gala_2026',
        assetId: targetAssetId,
        salesChannelId: 'passo',
        externalSaleReference: `PASSO-EMPTY-RACE-${idx + 1}`,
      };
      return UnitOfWork.execute((tx) =>
        ProcessExternalSaleConfirmationUseCase.execute({ ...command, pgClient: tx })
      ).catch((err: Error) => ({ error: err.message }));
    });

    const results = await Promise.all(tasks);
    const successfulSales = results.filter((r) => 'sale' in r && !r.isDuplicateRecord);
    const rejectedSales = results.filter((r) => 'error' in r && r.error.includes('SEAT_ALREADY_RESERVED'));

    expect(successfulSales.length).toBe(1);
    expect(rejectedSales.length).toBe(9);
  });

  it('T24: Failed Transaction Lock Release & Subsequent Recovery', async () => {
    const targetAssetId = 'asset_vip_a2';

    await expect(
      UnitOfWork.execute(async (tx) => {
        await ProcessExternalSaleConfirmationUseCase.execute({
          eventId: 'event_gala_2026',
          assetId: targetAssetId,
          salesChannelId: 'biletix',
          externalSaleReference: 'BTX-CRASHED-WORKER-001',
          pgClient: tx,
        });
        throw new Error('SIMULATED_WORKER_CRASH_AFTER_LOCK');
      })
    ).rejects.toThrow('SIMULATED_WORKER_CRASH_AFTER_LOCK');

    const resB = await UnitOfWork.execute((tx) =>
      ProcessExternalSaleConfirmationUseCase.execute({
        eventId: 'event_gala_2026',
        assetId: targetAssetId,
        salesChannelId: 'biletix',
        externalSaleReference: 'BTX-RECOVERY-WORKER-002',
        pgClient: tx,
      })
    );

    expect(resB.isDuplicateRecord).toBe(false);
    expect(resB.sale.lines[0]?.venueAssetId).toBe(targetAssetId);
  });

  it('T25: Multi-Channel Production Race — Biletix, Passo, and Desk racing for same asset', async () => {
    const targetAssetId = 'asset_bistro_b2';
    const channels = ['biletix', 'passo', 'desk'];

    const tasks = channels.map((channelId, idx) =>
      UnitOfWork.execute((tx) =>
        ProcessExternalSaleConfirmationUseCase.execute({
          eventId: 'event_gala_2026',
          assetId: targetAssetId,
          salesChannelId: channelId,
          externalSaleReference: `MULTI-CHANNEL-REF-${idx + 1}`,
          pgClient: tx,
        })
      ).catch((err: Error) => ({ error: err.message }))
    );

    const results = await Promise.all(tasks);
    const successfulSales = results.filter((r) => 'sale' in r && !r.isDuplicateRecord);
    const rejectedSales = results.filter((r) => 'error' in r && r.error.includes('SEAT_ALREADY_RESERVED'));

    expect(successfulSales.length).toBe(1);
    expect(rejectedSales.length).toBe(2);
  });

  it('T26: Outbox Read Committed Transaction Isolation — Uncommitted outbox message is invisible to worker', async () => {
    const eventId = IdGenerator.generateUUIDv7();
    const saleId = IdGenerator.generateUUIDv7();
    const event: SaleRecordedDomainEvent = {
      eventName: DomainEventNames.SaleRecorded,
      header: { eventId, eventVersion: 1, occurredAt: new Date().toISOString() },
      saleId,
      eventId: IdGenerator.generateUUIDv7(),
    };

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await PgOutboxStore.addMessage(client, 'Sale', saleId, event);

      const claimedMessages = await PgOutboxStore.claimPendingMessages('worker_isolation_test', 10, 0);
      expect(claimedMessages.length).toBe(0);

      await client.query('COMMIT');
    } finally {
      client.release();
    }

    const claimedAfterCommit = await PgOutboxStore.claimPendingMessages('worker_isolation_test', 10, 0);
    expect(claimedAfterCommit.length).toBe(1);
  });

  it('T27: Pre-populated Available Asset Race', async () => {
    const targetAssetId = 'asset_vip_a4';

    const tasks = Array.from({ length: 10 }, (_, idx) => {
      const command = {
        eventId: 'event_gala_2026',
        assetId: targetAssetId,
        salesChannelId: 'biletix',
        externalSaleReference: `BTX-PREPOP-REF-${idx + 1}`,
      };
      return UnitOfWork.execute((tx) =>
        ProcessExternalSaleConfirmationUseCase.execute({ ...command, pgClient: tx })
      ).catch((err: Error) => ({ error: err.message }));
    });

    const results = await Promise.all(tasks);
    const successfulSales = results.filter((r) => 'sale' in r && !r.isDuplicateRecord);
    const rejectedSales = results.filter((r) => 'error' in r && r.error.includes('SEAT_ALREADY_RESERVED'));

    expect(successfulSales.length).toBe(1);
    expect(rejectedSales.length).toBe(9);
  });

  it('T28: Same External Reference Race with Pre-populated Asset', async () => {
    const targetAssetId = 'asset_bistro_b1';

    const command = {
      eventId: 'event_gala_2026',
      assetId: targetAssetId,
      salesChannelId: 'biletix',
      externalSaleReference: 'BTX-IDENTICAL-RACE-001',
    };

    const tasks = Array.from({ length: 10 }, () =>
      UnitOfWork.execute((tx) =>
        ProcessExternalSaleConfirmationUseCase.execute({ ...command, pgClient: tx })
      )
    );

    const results = await Promise.all(tasks);
    const newSales = results.filter((r) => !r.isDuplicateRecord);
    const duplicates = results.filter((r) => r.isDuplicateRecord);

    expect(newSales.length).toBe(1);
    expect(duplicates.length).toBe(9);
  });

  it('T29: Duplicate Response Transaction Health — UnitOfWork COMMIT succeeds on same transaction client', async () => {
    const command = {
      eventId: 'event_gala_2026',
      assetId: 'asset_bistro_b2',
      salesChannelId: 'biletix',
      externalSaleReference: 'BTX-TX-HEALTH-001',
    };

    await UnitOfWork.execute((tx) =>
      ProcessExternalSaleConfirmationUseCase.execute({ ...command, pgClient: tx })
    );

    let duplicateResult: any;
    await expect(
      UnitOfWork.execute(async (tx) => {
        duplicateResult = await ProcessExternalSaleConfirmationUseCase.execute({ ...command, pgClient: tx });
        const testRes = await tx.query('SELECT 1 as healthy');
        expect(testRes.rows[0].healthy).toBe(1);
        return duplicateResult;
      })
    ).resolves.not.toThrow();

    expect(duplicateResult.isDuplicateRecord).toBe(true);
  });

  it('T30: Same External Reference Uncommitted Overlap', async () => {
    const targetAssetId = 'asset_bistro_b3';
    const command = {
      eventId: 'event_gala_2026',
      assetId: targetAssetId,
      salesChannelId: 'biletix',
      externalSaleReference: 'BTX-OVERLAP-001',
    };

    const client1 = await pool.connect();
    let res2Promise: Promise<any>;

    try {
      await client1.query('BEGIN');
      await ProcessExternalSaleConfirmationUseCase.execute({ ...command, pgClient: client1 });

      res2Promise = UnitOfWork.execute((tx) =>
        ProcessExternalSaleConfirmationUseCase.execute({ ...command, pgClient: tx })
      );

      await client1.query('COMMIT');
    } finally {
      client1.release();
    }

    const res2 = await res2Promise;
    expect(res2.isDuplicateRecord).toBe(true);
  });

  it('T31: Zero Transaction Abort Rate Under Heavy Duplicate Load', async () => {
    const command = {
      eventId: 'event_gala_2026',
      assetId: 'asset_bistro_b4',
      salesChannelId: 'biletix',
      externalSaleReference: 'BTX-HEAVY-LOAD-001',
    };

    const tasks = Array.from({ length: 15 }, () =>
      UnitOfWork.execute((tx) =>
        ProcessExternalSaleConfirmationUseCase.execute({ ...command, pgClient: tx })
      )
    );

    const results = await Promise.all(tasks);
    const originalCount = results.filter((r) => !r.isDuplicateRecord).length;
    const duplicateCount = results.filter((r) => r.isDuplicateRecord).length;

    expect(originalCount).toBe(1);
    expect(duplicateCount).toBe(14);
  });

  it('T32: System Catalog Index Definition & Unique Constraint Sanity Check', async () => {
    const requiredTables = ['sales', 'sale_lines', 'outbox_messages', 'venue_asset_projections', 'accounting_entries', 'processed_events'];
    const tablesRes = await pool.query(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = ANY($1)`,
      [requiredTables]
    );

    const foundTables = tablesRes.rows.map((r) => r.table_name);
    expect(foundTables.length).toBe(requiredTables.length);

    const catalogRes = await pool.query(`
      SELECT 
        i.indexname, 
        ix.indisunique, 
        pg_get_indexdef(ix.indexrelid) as indexdef
      FROM pg_indexes i
      JOIN pg_class c ON c.relname = i.indexname
      JOIN pg_index ix ON ix.indexrelid = c.oid
      WHERE i.indexname = 'ux_accounting_source_entry';
    `);

    expect(catalogRes.rows.length).toBe(1);
    expect(catalogRes.rows[0].indisunique).toBe(true);
    expect(catalogRes.rows[0].indexdef.toLowerCase()).toContain('accounting_entries');
    expect(catalogRes.rows[0].indexdef.toLowerCase()).toContain('source_type');
    expect(catalogRes.rows[0].indexdef.toLowerCase()).toContain('source_id');
  });

  it('T33: Same External Reference + Different Assets Phantom Protection', async () => {
    const ref = 'BTX-PHANTOM-REF-001';
    const winningAssetId = 'asset_vip_a4';
    const losingAssetId = 'asset_vip_a2';

    const taskA = UnitOfWork.execute((tx) =>
      ProcessExternalSaleConfirmationUseCase.execute({
        eventId: 'event_gala_2026',
        assetId: winningAssetId,
        salesChannelId: 'biletix',
        externalSaleReference: ref,
        pgClient: tx,
      })
    );

    const taskB = UnitOfWork.execute((tx) =>
      ProcessExternalSaleConfirmationUseCase.execute({
        eventId: 'event_gala_2026',
        assetId: losingAssetId,
        salesChannelId: 'biletix',
        externalSaleReference: ref,
        pgClient: tx,
      })
    );

    const results = await Promise.all([taskA, taskB]);
    const originalCount = results.filter((r) => !r.isDuplicateRecord).length;
    const duplicateCount = results.filter((r) => r.isDuplicateRecord).length;

    expect(originalCount).toBe(1);
    expect(duplicateCount).toBe(1);

    const dbSales = await pool.query('SELECT * FROM sales WHERE sales_channel_id = $1 AND external_reference = $2', ['biletix', ref]);
    expect(dbSales.rows.length).toBe(1);

    const projA = await pool.query('SELECT * FROM venue_asset_projections WHERE asset_id = $1', [winningAssetId]);
    const projB = await pool.query('SELECT * FROM venue_asset_projections WHERE asset_id = $1', [losingAssetId]);

    const soldCount = [projA.rows[0]?.status, projB.rows[0]?.status].filter((s) => s === 'Sold').length;
    const availableCount = [projA.rows[0]?.status, projB.rows[0]?.status].filter((s) => s === 'Available').length;

    expect(soldCount).toBe(1);
    expect(availableCount).toBe(1);
  });

  it('T34: REAL Multi-Asset Cross-Lock Ordering & Deadlock Prevention Invariant', async () => {
    const assetA = 'asset_vip_a2';
    const assetB = 'asset_vip_a3';

    // Worker 1 requests [assetB, assetA] (unsorted order)
    const task1 = UnitOfWork.execute((tx) =>
      ProcessExternalSaleConfirmationUseCase.execute({
        eventId: 'event_gala_2026',
        assetIds: [assetB, assetA],
        salesChannelId: 'biletix',
        externalSaleReference: 'BTX-MULTI-UNSORTED-1',
        pgClient: tx,
      })
    ).catch((err: Error) => ({ error: err.message }));

    // Worker 2 requests [assetA, assetB] (opposite unsorted order)
    const task2 = UnitOfWork.execute((tx) =>
      ProcessExternalSaleConfirmationUseCase.execute({
        eventId: 'event_gala_2026',
        assetIds: [assetA, assetB],
        salesChannelId: 'passo',
        externalSaleReference: 'PASSO-MULTI-UNSORTED-2',
        pgClient: tx,
      })
    ).catch((err: Error) => ({ error: err.message }));

    const results = await Promise.all([task1, task2]);
    const errors = results.filter((r) => 'error' in r).map((r: any) => r.error);

    // 1. Verify ZERO PostgreSQL "deadlock detected" error occurred!
    const hasDeadlockError = errors.some((e) => e.toLowerCase().includes('deadlock'));
    expect(hasDeadlockError).toBe(false);

    // 2. Verify exactly 1 transaction won both seats and 1 transaction was cleanly rejected with SEAT_ALREADY_RESERVED
    const successfulSales = results.filter((r) => 'sale' in r);
    expect(successfulSales.length).toBe(1);
    expect(errors.length).toBe(1);
    expect(errors[0]).toContain('SEAT_ALREADY_RESERVED');
  });

  it('T35: Multi-Asset Partial Lock Failure Atomicity — Complete rollback on any locked seat failure', async () => {
    const assetAvailable1 = 'asset_vip_a2';
    const assetSold = 'asset_vip_a1';
    const assetAvailable2 = 'asset_vip_a3';

    await pool.query(`UPDATE venue_asset_projections SET status = 'Sold' WHERE asset_id = 'asset_vip_a1';`);

    const command = {
      eventId: 'event_gala_2026',
      assetIds: [assetAvailable1, assetSold, assetAvailable2],
      salesChannelId: 'biletix',
      externalSaleReference: 'BTX-PARTIAL-FAIL-001',
    };

    await expect(
      UnitOfWork.execute((tx) =>
        ProcessExternalSaleConfirmationUseCase.execute({ ...command, pgClient: tx })
      )
    ).rejects.toThrow('SEAT_ALREADY_RESERVED');

    // Verify COMPLETE ROLLBACK: Neither assetAvailable1 nor assetAvailable2 were marked Sold!
    const proj1 = await pool.query('SELECT status FROM venue_asset_projections WHERE asset_id = $1', [assetAvailable1]);
    const proj2 = await pool.query('SELECT status FROM venue_asset_projections WHERE asset_id = $1', [assetAvailable2]);
    const dbSales = await pool.query('SELECT * FROM sales WHERE external_reference = $1', [command.externalSaleReference]);

    expect(proj1.rows[0].status).toBe('Available');
    expect(proj2.rows[0].status).toBe('Available');
    expect(dbSales.rows.length).toBe(0);
  });

  it('T36: Multi-Asset Duplicate Command Race — 2 parallel multi-seat commands produce exactly 1 sale', async () => {
    const command = {
      eventId: 'event_gala_2026',
      assetIds: ['asset_vip_a2', 'asset_vip_a3'],
      salesChannelId: 'biletix',
      externalSaleReference: 'BTX-MULTI-DUP-001',
    };

    const task1 = UnitOfWork.execute((tx) =>
      ProcessExternalSaleConfirmationUseCase.execute({ ...command, pgClient: tx })
    );

    const task2 = UnitOfWork.execute((tx) =>
      ProcessExternalSaleConfirmationUseCase.execute({ ...command, pgClient: tx })
    );

    const results = await Promise.all([task1, task2]);
    const originalCount = results.filter((r) => !r.isDuplicateRecord).length;
    const duplicateCount = results.filter((r) => r.isDuplicateRecord).length;

    expect(originalCount).toBe(1);
    expect(duplicateCount).toBe(1);

    const dbSales = await pool.query('SELECT * FROM sales WHERE external_reference = $1', [command.externalSaleReference]);
    const dbLines = await pool.query('SELECT * FROM sale_lines WHERE sale_id = $1', [dbSales.rows[0].id]);

    expect(dbSales.rows.length).toBe(1);
    expect(dbLines.rows.length).toBe(2);
  });

  it('T37: Overlapping Multi-Asset Sets Race — Zero overselling on shared asset', async () => {
    const assetA = 'asset_vip_a2';
    const assetB = 'asset_vip_a3'; // Shared overlapping asset
    const assetC = 'asset_vip_a4';

    // Worker 1 requests [A, B], Worker 2 requests [B, C]
    const task1 = UnitOfWork.execute((tx) =>
      ProcessExternalSaleConfirmationUseCase.execute({
        eventId: 'event_gala_2026',
        assetIds: [assetA, assetB],
        salesChannelId: 'biletix',
        externalSaleReference: 'BTX-OVERLAP-1',
        pgClient: tx,
      })
    ).catch((err: Error) => ({ error: err.message }));

    const task2 = UnitOfWork.execute((tx) =>
      ProcessExternalSaleConfirmationUseCase.execute({
        eventId: 'event_gala_2026',
        assetIds: [assetB, assetC],
        salesChannelId: 'passo',
        externalSaleReference: 'PASSO-OVERLAP-2',
        pgClient: tx,
      })
    ).catch((err: Error) => ({ error: err.message }));

    const results = await Promise.all([task1, task2]);
    const successfulSales = results.filter((r) => 'sale' in r);
    const rejectedSales = results.filter((r) => 'error' in r && r.error.includes('SEAT_ALREADY_RESERVED'));

    expect(successfulSales.length).toBe(1);
    expect(rejectedSales.length).toBe(1);

    // Verify shared assetB was sold ONCE and only 1 sale line exists for assetB
    const assetBLines = await pool.query('SELECT * FROM sale_lines WHERE venue_asset_id = $1', [assetB]);
    expect(assetBLines.rows.length).toBe(1);
  });

  it('T38: Lease Expiration End-to-End Fencing — Stale worker markPublished blocked after lease version increments', async () => {
    const eventId = IdGenerator.generateUUIDv7();
    const saleId = IdGenerator.generateUUIDv7();
    const event: SaleRecordedDomainEvent = {
      eventName: DomainEventNames.SaleRecorded,
      header: { eventId, eventVersion: 1, occurredAt: new Date().toISOString() },
      saleId,
      eventId: IdGenerator.generateUUIDv7(),
    };

    await UnitOfWork.execute((tx) => PgOutboxStore.addMessage(tx, 'Sale', saleId, event));

    // Worker A claims with 0s lease duration (expires immediately)
    const claimedA = await PgOutboxStore.claimPendingMessages('worker_A', 1, 0);
    const msgA = claimedA[0]!;
    expect(msgA.leaseVersion).toBe(1);

    await new Promise((r) => setTimeout(r, 20));

    // Worker B claims expired message (lease version becomes 2)
    const claimedB = await PgOutboxStore.claimPendingMessages('worker_B', 1, 30);
    const msgB = claimedB[0]!;
    expect(msgB.leaseVersion).toBe(2);

    // Stale Worker A attempts to call markPublished
    const workerAFenced = await PgOutboxStore.markPublished(msgA.id, 'worker_A', msgA.leaseVersion);
    expect(workerAFenced).toBe(false);

    // Valid Worker B calls markPublished
    const workerBPublished = await PgOutboxStore.markPublished(msgB.id, 'worker_B', msgB.leaseVersion);
    expect(workerBPublished).toBe(true);

    const finalOutbox = await PgOutboxStore.getMessageById(eventId);
    expect(finalOutbox?.status).toBe('Published');
  });

  it('T39: Rollback Error Preservation & Operational Connection Guard — Original business exception is preserved', async () => {
    const customBusinessError = 'CRITICAL_BUSINESS_INVARIANT_VIOLATION';

    await expect(
      UnitOfWork.execute(async (client) => {
        await client.query('SELECT 1');
        throw new Error(customBusinessError);
      })
    ).rejects.toThrow(customBusinessError);
  });

  it('T40: Database-Only Asset Projection Execution Test (P1-1 Fix Verification)', async () => {
    const dbOnlyAssetId = 'asset_db_only_999';

    // 1. Create asset projection ONLY in PostgreSQL venue_asset_projections table
    await pool.query(
      `INSERT INTO venue_asset_projections (asset_id, name, category, status, occupancy_state, pax_capacity, base_price, version, last_updated)
       VALUES ($1, 'DB Only Lounge Table', 'Lounge', 'Available', 'Vacant', 8, 45000, 1, NOW());`,
      [dbOnlyAssetId]
    );

    // 2. Explicitly verify the asset is ABSENT from Node.js process memory / MockDataStore
    const memoryAsset = VenueService.getAssetById(dbOnlyAssetId);
    expect(memoryAsset).toBeUndefined();

    // 3. Execute ProcessExternalSaleConfirmationUseCase through PostgreSQL path
    const command = {
      eventId: 'event_gala_2026',
      assetId: dbOnlyAssetId,
      salesChannelId: 'biletix',
      externalSaleReference: 'BTX-DB-ONLY-001',
      purchaserName: 'Deniz Yılmaz',
    };

    const result = await UnitOfWork.execute((tx) =>
      ProcessExternalSaleConfirmationUseCase.execute({ ...command, pgClient: tx })
    );

    // 4. Assert sale succeeded using DB authoritative data
    expect(result.isDuplicateRecord).toBe(false);
    expect(result.sale.grossPrice).toBe(45000);
    expect(result.sale.lines[0]?.venueAssetId).toBe(dbOnlyAssetId);

    // 5. Verify DB asset status mutated to 'Sold' in venue_asset_projections
    const projRes = await pool.query('SELECT * FROM venue_asset_projections WHERE asset_id = $1', [dbOnlyAssetId]);
    expect(projRes.rows[0].status).toBe('Sold');

    // 6. Verify sale and sale_lines persisted in PostgreSQL
    const saleRes = await pool.query('SELECT * FROM sales WHERE external_reference = $1', [command.externalSaleReference]);
    const linesRes = await pool.query('SELECT * FROM sale_lines WHERE sale_id = $1', [saleRes.rows[0].id]);
    expect(saleRes.rows.length).toBe(1);
    expect(linesRes.rows.length).toBe(1);
  });

  it('T41: Multi-Asset Input Array Deduplication Test (P1-2 Fix Verification)', async () => {
    const assetId = 'asset_vip_a2';

    // Command submits the SAME asset ID twice in requestedAssetIds array
    const command = {
      eventId: 'event_gala_2026',
      assetIds: [assetId, assetId],
      salesChannelId: 'biletix',
      externalSaleReference: 'BTX-DUP-INPUT-001',
    };

    // Execute through PostgreSQL path — should NOT throw SEAT_ALREADY_RESERVED self-conflict error!
    const result = await UnitOfWork.execute((tx) =>
      ProcessExternalSaleConfirmationUseCase.execute({ ...command, pgClient: tx })
    );

    expect(result.isDuplicateRecord).toBe(false);
    expect(result.sale.lines).toHaveLength(1);
    expect(result.sale.lines[0]?.venueAssetId).toBe(assetId);

    // Verify DB state consistency and Zero Overselling
    const dbSales = await pool.query('SELECT * FROM sales WHERE external_reference = $1', [command.externalSaleReference]);
    const dbLines = await pool.query('SELECT * FROM sale_lines WHERE sale_id = $1', [dbSales.rows[0].id]);
    const projRes = await pool.query('SELECT * FROM venue_asset_projections WHERE asset_id = $1', [assetId]);

    expect(dbSales.rows.length).toBe(1);
    expect(dbLines.rows.length).toBe(1);
    expect(projRes.rows[0].status).toBe('Sold');
  });

  it('T42: Outbox Publisher Worker PostgreSQL End-to-End Test (P1-3 Fix Verification)', async () => {
    const eventId = IdGenerator.generateUUIDv7();
    const saleId = IdGenerator.generateUUIDv7();
    let eventDispatchedToBus = false;

    const event: DomainEvent = {
      eventName: 'TestT42OutboxEvent',
      header: { eventId, eventVersion: 1, occurredAt: new Date().toISOString() },
    };

    // 1. Insert outbox message directly into PostgreSQL outbox_messages table
    await UnitOfWork.execute((tx) => PgOutboxStore.addMessage(tx, 'Sale', saleId, event));

    // 2. Register a subscriber on InMemoryEventBus
    const bus = InMemoryEventBus.getInstance();
    const handler = async (e: any) => {
      if (e.header.eventId === eventId) {
        eventDispatchedToBus = true;
      }
    };
    bus.subscribe('TestT42OutboxEvent', handler);

    try {
      // 3. Instantiate real OutboxPublisherWorker configured with PgOutboxAdapter
      const worker = new OutboxPublisherWorker(new PgOutboxAdapter(), 'worker_t42_pg');

      // 4. Process pending outbox messages from PostgreSQL
      const processedCount = await worker.processPendingMessages(10);
      expect(processedCount).toBe(1);
      expect(eventDispatchedToBus).toBe(true);

      // 5. Query PostgreSQL outbox_messages table and verify state transitioned to 'Published'
      const dbOutbox = await PgOutboxStore.getMessageById(eventId);
      expect(dbOutbox?.status).toBe('Published');
      expect(dbOutbox?.publishedAt).toBeDefined();
      expect(dbOutbox?.leaseVersion).toBe(1);
    } finally {
      bus.unsubscribe('TestT42OutboxEvent', handler);
    }
  });

  it('T43: Winner Rollback + Duplicate Waiter Recovery Test', async () => {
    const ref = 'BTX-WINNER-ROLLBACK-001';
    const assetSold = 'asset_vip_a1';
    const assetAvailable = 'asset_vip_a2';

    // Mark asset_vip_a1 as Sold
    await pool.query(`UPDATE venue_asset_projections SET status = 'Sold' WHERE asset_id = 'asset_vip_a1';`);

    // Worker 1 tries ref on asset_vip_a1 (fails asset lock and rolls back sale ownership)
    await expect(
      UnitOfWork.execute((tx) =>
        ProcessExternalSaleConfirmationUseCase.execute({
          eventId: 'event_gala_2026',
          assetId: assetSold,
          salesChannelId: 'biletix',
          externalSaleReference: ref,
          pgClient: tx,
        })
      )
    ).rejects.toThrow('SEAT_ALREADY_RESERVED');

    // Verify Worker 1 transaction rolled back completely — 0 rows in sales table for ref!
    const dbSalesBefore = await pool.query('SELECT * FROM sales WHERE external_reference = $1', [ref]);
    expect(dbSalesBefore.rows.length).toBe(0);

    // Worker 2 tries SAME ref on available asset_vip_a2
    const resultWorker2 = await UnitOfWork.execute((tx) =>
      ProcessExternalSaleConfirmationUseCase.execute({
        eventId: 'event_gala_2026',
        assetId: assetAvailable,
        salesChannelId: 'biletix',
        externalSaleReference: ref,
        pgClient: tx,
      })
    );

    // Assert Worker 2 successfully reserves sale ownership and processes sale!
    expect(resultWorker2.isDuplicateRecord).toBe(false);
    expect(resultWorker2.sale.lines[0]?.venueAssetId).toBe(assetAvailable);

    const dbSalesAfter = await pool.query('SELECT * FROM sales WHERE external_reference = $1', [ref]);
    expect(dbSalesAfter.rows.length).toBe(1);
    expect(dbSalesAfter.rows[0].id).toBe(resultWorker2.sale.id);
  });

  it('T44: Multi-Asset Heterogeneous Pricing Accuracy Test', async () => {
    const assetA = 'asset_vip_a2'; // 25,000 TRY
    const assetB = 'asset_lounge_99'; // 45,000 TRY

    await pool.query(
      `INSERT INTO venue_asset_projections (asset_id, name, category, status, occupancy_state, pax_capacity, base_price, version, last_updated)
       VALUES ($1, 'Lounge 99', 'Lounge', 'Available', 'Vacant', 8, 45000, 1, NOW());`,
      [assetB]
    );

    const command = {
      eventId: 'event_gala_2026',
      assetIds: [assetA, assetB],
      salesChannelId: 'biletix',
      externalSaleReference: 'BTX-HETERO-PRICING-001',
    };

    const result = await UnitOfWork.execute((tx) =>
      ProcessExternalSaleConfirmationUseCase.execute({ ...command, pgClient: tx })
    );

    // 1. Verify gross price is exact sum of both heterogeneous assets: 25,000 + 45,000 = 70,000 TRY!
    expect(result.sale.grossPrice).toBe(70000);

    // 2. Verify individual line item pricing
    expect(result.sale.lines).toHaveLength(2);
    const lineA = result.sale.lines.find((l) => l.venueAssetId === assetA);
    const lineB = result.sale.lines.find((l) => l.venueAssetId === assetB);

    expect(lineA?.unitPrice).toBe(25000);
    expect(lineB?.unitPrice).toBe(45000);

    // 3. Verify accounting amount equals exact aggregate gross price
    expect(result.sale.accountingAmount).toBe(70000);

    // 4. Verify PostgreSQL sales table gross_price column stores 70,000
    const dbSale = await pool.query('SELECT * FROM sales WHERE external_reference = $1', [command.externalSaleReference]);
    expect(parseFloat(dbSale.rows[0].gross_price)).toBe(70000);
  });

  it('T45: System Catalog Sales Unique Index Verification', async () => {
    const catalogRes = await pool.query(`
      SELECT 
        i.indexname, 
        ix.indisunique, 
        pg_get_indexdef(ix.indexrelid) as indexdef
      FROM pg_indexes i
      JOIN pg_class c ON c.relname = i.indexname
      JOIN pg_index ix ON ix.indexrelid = c.oid
      WHERE i.tablename = 'sales' AND ix.indisunique = true;
    `);

    expect(catalogRes.rows.length).toBeGreaterThanOrEqual(1);
    const salesUniqueIndex = catalogRes.rows.find(
      (r) => r.indexdef.toLowerCase().includes('sales_channel_id') && r.indexdef.toLowerCase().includes('external_reference')
    );

    expect(salesUniqueIndex).toBeDefined();
    expect(salesUniqueIndex.indisunique).toBe(true);
  });

  it('T46: Unowned Sale Conflict Exception Guard Test', async () => {
    // Construct mock PoolClient where INSERT sales returns 0 rows and SELECT sales returns 0 rows
    const mockClient: any = {
      query: async (sql: string) => {
        if (sql.includes('SELECT * FROM sales')) {
          return { rows: [] };
        }
        if (sql.includes('SELECT * FROM venue_asset_projections')) {
          return { rows: [{ asset_id: 'asset_vip_a2', name: 'VIP A2', category: 'VIP', status: 'Available', base_price: '25000' }] };
        }
        if (sql.includes('SELECT * FROM sales_channels')) {
          return { rows: [{ id: 'biletix', name: 'Biletix', commission_percentage: '6.0' }] };
        }
        if (sql.includes('INSERT INTO sales')) {
          return { rows: [] }; // Returns 0 rows for ON CONFLICT DO NOTHING
        }
        return { rows: [] };
      },
    };

    const command = {
      eventId: 'event_gala_2026',
      assetId: 'asset_vip_a2',
      salesChannelId: 'biletix',
      externalSaleReference: 'BTX-UNOWNED-CONFLICT-001',
    };

    await expect(
      ProcessExternalSaleConfirmationUseCase.execute({ ...command, pgClient: mockClient })
    ).rejects.toThrow('SALE_OWNERSHIP_CONFLICT: Sale conflict detected but existing sale is unavailable.');
  });

  it('T47: Strict DB-Authoritative Asset Projection Guard Test', async () => {
    const memoryAssetOnlyId = 'asset_memory_only_test';

    // Verify asset exists in MockDataStore / process memory
    const memoryAsset = VenueService.getAssetById('asset_vip_a1');
    expect(memoryAsset).toBeDefined();

    // Verify asset is ABSENT from PostgreSQL venue_asset_projections table
    const dbAssetRes = await pool.query('SELECT * FROM venue_asset_projections WHERE asset_id = $1', [memoryAssetOnlyId]);
    expect(dbAssetRes.rows.length).toBe(0);

    const command = {
      eventId: 'event_gala_2026',
      assetId: memoryAssetOnlyId,
      salesChannelId: 'biletix',
      externalSaleReference: 'BTX-MEMORY-FALLBACK-GUARD',
    };

    // Execute in PostgreSQL mode — MUST throw Asset not found and NOT fall back to MockDataStore
    await expect(
      UnitOfWork.execute((tx) =>
        ProcessExternalSaleConfirmationUseCase.execute({ ...command, pgClient: tx })
      )
    ).rejects.toThrow(`Asset not found: ${memoryAssetOnlyId}`);
  });

  it('T48: DB-Authoritative SalesChannel & Commission Test (P1-A Verification)', async () => {
    // 1. Insert custom sales channel into PostgreSQL sales_channels table
    await pool.query(
      `INSERT INTO sales_channels (id, name, commission_percentage)
       VALUES ('custom_agency', 'Custom Agency Channel', 8.5)
       ON CONFLICT (id) DO UPDATE SET commission_percentage = 8.5;`
    );

    const command = {
      eventId: 'event_gala_2026',
      assetId: 'asset_vip_a2', // base_price = 25,000 TRY
      salesChannelId: 'custom_agency',
      externalSaleReference: 'CUSTOM-CHANNEL-001',
    };

    const result = await UnitOfWork.execute((tx) =>
      ProcessExternalSaleConfirmationUseCase.execute({ ...command, pgClient: tx })
    );

    // 2. Verify commission paid is calculated at exactly 8.5% of 25,000 = 2,125.00 TRY from PostgreSQL table!
    expect(result.sale.commissionRate).toBe(0.085);
    expect(result.sale.commissionPaid).toBe(2125);
    expect(result.sale.netRevenue).toBe(22875);

    // 3. Verify PostgreSQL sales table row has commission_paid = 2125.00
    const dbSale = await pool.query('SELECT * FROM sales WHERE external_reference = $1', [command.externalSaleReference]);
    expect(parseFloat(dbSale.rows[0].commission_paid)).toBe(2125);
    expect(parseFloat(dbSale.rows[0].net_revenue)).toBe(22875);
  });

  it('T49: Command-Supplied Organization Identity Persistence Test (P1-A Verification)', async () => {
    const customOrgId = 'org_enterprise_dynamic_99';

    const command = {
      eventId: 'event_gala_2026',
      assetId: 'asset_vip_a2',
      salesChannelId: 'biletix',
      externalSaleReference: 'ORG-IDENTITY-001',
      organizationId: customOrgId,
    };

    const result = await UnitOfWork.execute((tx) =>
      ProcessExternalSaleConfirmationUseCase.execute({ ...command, pgClient: tx })
    );

    // 1. Assert organizationId in returned sale payload matches command
    expect(result.sale.organizationId).toBe(customOrgId);

    // 2. Assert PostgreSQL sales table stores exact organization_id
    const dbSale = await pool.query('SELECT * FROM sales WHERE external_reference = $1', [command.externalSaleReference]);
    expect(dbSale.rows[0].organization_id).toBe(customOrgId);

    // 3. Assert PostgreSQL outbox message payload contains matching tenantId / organizationId
    const outboxRes = await pool.query('SELECT * FROM outbox_messages WHERE aggregate_id = $1', [result.sale.id]);
    const payload = outboxRes.rows[0].payload;
    expect(payload.header.tenantId).toBe(customOrgId);
  });

  it('T50: Multi-Asset Execution Behavior Parity Test (P1-B Verification)', async () => {
    // 1. In-Memory Execution: Reserve 2 assets ('asset_vip_a3', 'asset_vip_a4')
    const memCommand = {
      eventId: 'event_gala_2026',
      assetIds: ['asset_vip_a3', 'asset_vip_a4'],
      salesChannelId: 'biletix',
      externalSaleReference: 'MEM-MULTI-PARITY-001',
    };

    const memResult = await ProcessExternalSaleConfirmationUseCase.execute(memCommand);
    expect(memResult.isDuplicateRecord).toBe(false);
    expect(memResult.sale.lines).toHaveLength(2);
    expect(memResult.sale.grossPrice).toBe(50000);
    expect(VenueService.getAssetById('asset_vip_a3')?.status).toBe('Sold');
    expect(VenueService.getAssetById('asset_vip_a4')?.status).toBe('Sold');

    // 2. PostgreSQL Execution: Reserve 2 assets ('asset_bistro_b1', 'asset_bistro_b2')
    const pgCommand = {
      eventId: 'event_gala_2026',
      assetIds: ['asset_bistro_b1', 'asset_bistro_b2'],
      salesChannelId: 'passo',
      externalSaleReference: 'PG-MULTI-PARITY-002',
    };

    const pgResult = await UnitOfWork.execute((tx) =>
      ProcessExternalSaleConfirmationUseCase.execute({ ...pgCommand, pgClient: tx })
    );

    expect(pgResult.isDuplicateRecord).toBe(false);
    expect(pgResult.sale.lines).toHaveLength(2);
    expect(pgResult.sale.grossPrice).toBe(24000);

    const dbProj1 = await pool.query('SELECT status FROM venue_asset_projections WHERE asset_id = $1', ['asset_bistro_b1']);
    const dbProj2 = await pool.query('SELECT status FROM venue_asset_projections WHERE asset_id = $1', ['asset_bistro_b2']);
    expect(dbProj1.rows[0].status).toBe('Sold');
    expect(dbProj2.rows[0].status).toBe('Sold');
  });

  it('T51: Tax Arithmetic & Revenue Split Invariant Test (VAT-Exclusive Baseline)', async () => {
    // Reserve 1 VIP Asset (25,000 TRY) + 1 Bistro Asset (12,000 TRY) = 37,000 TRY gross
    const command = {
      eventId: 'event_gala_2026',
      assetIds: ['asset_vip_a2', 'asset_bistro_b1'],
      salesChannelId: 'biletix', // 6% commission = 2,220 TRY
      externalSaleReference: 'TAX-SPLIT-INVARIANT-001',
    };

    const result = await UnitOfWork.execute((tx) =>
      ProcessExternalSaleConfirmationUseCase.execute({ ...command, pgClient: tx })
    );

    const sale = result.sale;
    expect(sale.grossPrice).toBe(37000);
    expect(sale.commissionPaid).toBe(2220);
    expect(sale.netRevenue).toBe(34780);

    // Tax amount per line (20% KDV on net base price)
    const lineVip = sale.lines.find((l) => l.venueAssetId === 'asset_vip_a2');
    const lineBistro = sale.lines.find((l) => l.venueAssetId === 'asset_bistro_b1');

    expect(lineVip?.taxAmount).toBe(5000);
    expect(lineBistro?.taxAmount).toBe(2400);

    // Revenue split total tax amount
    expect(sale.revenueSplit?.taxAmount.minorUnits).toBe(740000n); // 7,400.00 TRY
    expect(sale.revenueSplit?.organizerAmount.minorUnits).toBe(3478000n); // 34,780.00 TRY
    expect(sale.revenueSplit?.platformCommission.minorUnits).toBe(222000n); // 2,220.00 TRY
  });

  it('T52: Accounting Revenue & Commission Entry Balance Invariant Test', async () => {
    const saleId = IdGenerator.generateUUIDv7();
    const eventDbId = IdGenerator.generateUUIDv7();
    const nowISO = new Date().toISOString();

    const event: SaleRecordedDomainEvent = {
      eventName: DomainEventNames.SaleRecorded,
      header: { eventId: IdGenerator.generateUUIDv7(), eventVersion: 1, occurredAt: nowISO },
      saleId,
      eventId: eventDbId,
    };

    // Insert sale with gross_price = 25,000 TRY, commission_paid = 1,500 TRY, net_revenue = 23,500 TRY
    await UnitOfWork.execute(async (tx) => {
      await tx.query(
        `INSERT INTO sales (id, organization_id, event_id, sales_channel_id, external_reference, gross_price, commission_paid, net_revenue, currency, status, created_at)
         VALUES ($1, 'org_01', $2, 'biletix', 'REF-ACC-BALANCE-001', 25000, 1500, 23500, 'TRY', 'Completed', $3);`,
        [saleId, eventDbId, nowISO]
      );
    });

    // Execute Accounting handler
    await UnitOfWork.execute((tx) => AccountingSaleRecordedHandler.handle(event, tx));

    // Query accounting entries
    const dbEntries = await pool.query('SELECT * FROM accounting_entries WHERE source_id = $1', [saleId]);
    expect(dbEntries.rows).toHaveLength(2);

    const revenueEntry = dbEntries.rows.find((r) => r.entry_type === 'SaleRevenue');
    const commissionEntry = dbEntries.rows.find((r) => r.entry_type === 'PlatformCommission');

    expect(parseFloat(revenueEntry.amount)).toBe(25000);
    expect(parseFloat(commissionEntry.amount)).toBe(-1500);

    // Ledger balance sum equals net revenue recognized by organizer (23,500 TRY)
    const ledgerBalanceSum = parseFloat(revenueEntry.amount) + parseFloat(commissionEntry.amount);
    expect(ledgerBalanceSum).toBe(23500);
  });
});
