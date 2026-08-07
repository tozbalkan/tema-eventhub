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
import { IdGenerator } from '@/platform/IdGenerator';
import fs from 'fs';
import path from 'path';

describe('PostgreSQL Correctness Baseline (T1 - T38 Integration Tests)', () => {
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

  it('T8: 5 Failed Delivery Attempts -> DeadLetter Status', async () => {
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
      await pool.query('UPDATE outbox_messages SET next_retry_at = NOW() WHERE id = $1', [msg.id]);
    }

    const finalMsg = await PgOutboxStore.getMessageById(eventId);
    expect(finalMsg?.status).toBe('DeadLetter');
    expect(finalMsg?.retryCount).toBe(5);
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
    const command = {
      eventId: 'event_gala_2026',
      assetId: 'asset_vip_a1', // asset_vip_a1 has status 'Sold' in MockRepositories
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
    const targetAssetId = 'asset_bistro_b4';

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

    await pool.query(
      `INSERT INTO venue_asset_projections (asset_id, name, category, status, occupancy_state, pax_capacity, base_price, version, last_updated)
       VALUES ($1, 'VIP Asset A4', 'VIP', 'Available', 'Vacant', 6, 25000, 1, NOW());`,
      [targetAssetId]
    );

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

    await pool.query(
      `INSERT INTO venue_asset_projections (asset_id, name, category, status, occupancy_state, pax_capacity, base_price, version, last_updated)
       VALUES ($1, 'Bistro B1', 'Bistro', 'Available', 'Vacant', 4, 12000, 1, NOW());`,
      [targetAssetId]
    );

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

  it('T32: Basic Database Accessibility & System Catalog Index Definition Sanity Check', async () => {
    const requiredTables = ['sales', 'sale_lines', 'outbox_messages', 'venue_asset_projections', 'accounting_entries', 'processed_events'];
    const tablesRes = await pool.query(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = ANY($1)`,
      [requiredTables]
    );

    const foundTables = tablesRes.rows.map((r) => r.table_name);
    expect(foundTables.length).toBe(requiredTables.length);

    const indexRes = await pool.query(`SELECT indexdef FROM pg_indexes WHERE indexname = 'ux_accounting_source_entry'`);
    expect(indexRes.rows.length).toBe(1);
    expect(indexRes.rows[0].indexdef.toLowerCase()).toContain('accounting_entries');
    expect(indexRes.rows[0].indexdef.toLowerCase()).toContain('source_type');
    expect(indexRes.rows[0].indexdef.toLowerCase()).toContain('source_id');
  });

  it('T33: Same External Reference + Different Assets Phantom Protection', async () => {
    const ref = 'BTX-PHANTOM-REF-001';
    const winningAssetId = 'asset_vip_a4';
    const losingAssetId = 'asset_vip_a2';

    await pool.query(
      `INSERT INTO venue_asset_projections (asset_id, name, category, status, occupancy_state, pax_capacity, base_price, version, last_updated)
       VALUES 
        ($1, 'VIP Asset A4', 'VIP', 'Available', 'Vacant', 6, 25000, 1, NOW()),
        ($2, 'VIP Asset A2', 'VIP', 'Available', 'Vacant', 6, 25000, 1, NOW());`,
      [winningAssetId, losingAssetId]
    );

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

    await pool.query(
      `INSERT INTO venue_asset_projections (asset_id, name, category, status, occupancy_state, pax_capacity, base_price, version, last_updated)
       VALUES 
        ($1, 'VIP A2', 'VIP', 'Available', 'Vacant', 6, 25000, 1, NOW()),
        ($2, 'VIP A3', 'VIP', 'Available', 'Vacant', 6, 25000, 1, NOW());`,
      [assetA, assetB]
    );

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
    const assetSold = 'asset_vip_a1'; // asset_vip_a1 is pre-populated/marked Sold
    const assetAvailable2 = 'asset_vip_a3';

    await pool.query(
      `INSERT INTO venue_asset_projections (asset_id, name, category, status, occupancy_state, pax_capacity, base_price, version, last_updated)
       VALUES 
        ($1, 'VIP A2', 'VIP', 'Available', 'Vacant', 6, 25000, 1, NOW()),
        ($2, 'VIP A1', 'VIP', 'Sold', 'Occupied', 6, 25000, 1, NOW()),
        ($3, 'VIP A3', 'VIP', 'Available', 'Vacant', 6, 25000, 1, NOW());`,
      [assetAvailable1, assetSold, assetAvailable2]
    );

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

    await pool.query(
      `INSERT INTO venue_asset_projections (asset_id, name, category, status, occupancy_state, pax_capacity, base_price, version, last_updated)
       VALUES 
        ($1, 'VIP A2', 'VIP', 'Available', 'Vacant', 6, 25000, 1, NOW()),
        ($2, 'VIP A3', 'VIP', 'Available', 'Vacant', 6, 25000, 1, NOW()),
        ($3, 'VIP A4', 'VIP', 'Available', 'Vacant', 6, 25000, 1, NOW());`,
      [assetA, assetB, assetC]
    );

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

  it('T38: Lease Expiration End-to-End Fencing — Stale worker markPublished is blocked after lease version increments', async () => {
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
});
