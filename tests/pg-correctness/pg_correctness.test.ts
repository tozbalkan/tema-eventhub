import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Pool } from 'pg';
import { PgPool } from '@/platform/pg/PgPool';
import { UnitOfWork } from '@/platform/pg/UnitOfWork';
import { PgOutboxStore } from '@/platform/pg/PgOutboxStore';
import { PgConsumerIdempotencyStore } from '@/platform/pg/PgConsumerIdempotencyStore';
import { AccountingSaleRecordedHandler } from '@/accounting/application/handlers/AccountingSaleRecordedHandler';
import { OperationsSaleRecordedHandler } from '@/operations/application/handlers/OperationsSaleRecordedHandler';
import { DomainEventNames, SaleRecordedDomainEvent } from '@/domain/events/DomainEvents';
import { IdGenerator } from '@/platform/IdGenerator';
import fs from 'fs';
import path from 'path';

describe('PostgreSQL Correctness Baseline (T1 - T10 Integration Tests)', () => {
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
    await pool.query('TRUNCATE outbox_messages, processed_events, sales, accounting_entries, venue_asset_projections, admission_rights CASCADE;');
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

    // Verify both processed_events AND accounting_entries were rolled back
    const processedRes = await pool.query('SELECT * FROM processed_events WHERE event_id = $1', [eventId]);
    const entriesRes = await pool.query('SELECT * FROM accounting_entries WHERE event_id = $1', [eventId]);

    expect(processedRes.rows.length).toBe(0);
    expect(entriesRes.rows.length).toBe(0);

    // Subsequent retry succeeds cleanly
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

    // Worker 1 claims message with 0-second expired lease
    const claimed1 = await PgOutboxStore.claimPendingMessages('worker_01', 1, 0);
    expect(claimed1.length).toBe(1);

    // Sleep 20ms to ensure locked_until < NOW()
    await new Promise((r) => setTimeout(r, 20));

    // Worker 2 claims expired message safely
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

    // Worker A claims -> leaseVersion 1
    const claimedA = await PgOutboxStore.claimPendingMessages('worker_A', 1, 0);
    const msgA = claimedA[0]!;
    expect(msgA.leaseVersion).toBe(1);

    await new Promise((r) => setTimeout(r, 20));

    // Worker B claims expired message -> leaseVersion 2
    const claimedB = await PgOutboxStore.claimPendingMessages('worker_B', 1, 30);
    const msgB = claimedB[0]!;
    expect(msgB.leaseVersion).toBe(2);

    // Worker A wakes up and attempts markPublished with stale leaseVersion 1
    const staleResult = await PgOutboxStore.markPublished(msgA.id, msgA.lockedBy!, msgA.leaseVersion);
    expect(staleResult).toBe(false); // Fenced out!

    // Worker B marks published with valid leaseVersion 2
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
    });

    const event: SaleRecordedDomainEvent = {
      eventName: DomainEventNames.SaleRecorded,
      header: { eventId, eventVersion: 1, occurredAt: nowISO },
      saleId,
      eventId: eventDbId,
    };

    // Attempt 1: Accounting succeeds, Operations fails
    await UnitOfWork.execute((tx) => AccountingSaleRecordedHandler.handle(event, tx));

    try {
      await UnitOfWork.execute(async () => {
        throw new Error('OPERATIONS_TEMPORARY_DB_LOCK');
      });
    } catch {}

    // Retry Attempt 2: Accounting skips via Consumer Idempotency, Operations succeeds
    await UnitOfWork.execute((tx) => AccountingSaleRecordedHandler.handle(event, tx));
    await UnitOfWork.execute((tx) => OperationsSaleRecordedHandler.handle(event, tx));

    const accEntries = await pool.query('SELECT * FROM accounting_entries WHERE source_id = $1', [saleId]);
    const opsProjections = await pool.query('SELECT * FROM venue_asset_projections WHERE asset_id = $1', ['asset_vip_a1']);

    expect(accEntries.rows.length).toBe(2); // exactly 1 revenue + 1 commission
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
      // Reset next_retry_at to NOW() so loop iteration i+1 can claim immediately for test
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

    // First successful processing
    await UnitOfWork.execute((tx) => AccountingSaleRecordedHandler.handle(event, tx));

    // DLQ Replay execution
    await UnitOfWork.execute((tx) => AccountingSaleRecordedHandler.handle(event, tx));

    const accEntries = await pool.query('SELECT * FROM accounting_entries WHERE source_id = $1', [saleId]);
    expect(accEntries.rows.length).toBe(2); // no duplicate accounting entries
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

    // 1. Transactional Outbox write (Sale + OutboxMessage)
    await UnitOfWork.execute(async (tx) => {
      await tx.query(
        `INSERT INTO sales (id, organization_id, event_id, sales_channel_id, external_reference, gross_price, commission_paid, net_revenue, currency, status, created_at)
         VALUES ($1, 'org_01', $2, 'biletix', 'REF-T10', 25000, 1500, 23500, 'TRY', 'Completed', $3);`,
        [saleId, eventDbId, nowISO]
      );
      await PgOutboxStore.addMessage(tx, 'Sale', saleId, event);
    });

    // 2. Worker A claims & executes handlers successfully
    const claimedA = await PgOutboxStore.claimPendingMessages('worker_A', 1, 0);
    const msgA = claimedA[0]!;
    const payloadA = msgA.payload as SaleRecordedDomainEvent;

    await UnitOfWork.execute((tx) => AccountingSaleRecordedHandler.handle(payloadA, tx));

    // Worker A CRASHES before calling markPublished! Sleep to allow lease expiry
    await new Promise((r) => setTimeout(r, 20));

    // 3. Worker B claims expired message and redelivers
    const claimedB = await PgOutboxStore.claimPendingMessages('worker_B', 1, 30);
    const msgB = claimedB[0]!;
    await UnitOfWork.execute((tx) => AccountingSaleRecordedHandler.handle(msgB.payload as SaleRecordedDomainEvent, tx));

    // Worker B calls markPublished
    const publishedResult = await PgOutboxStore.markPublished(msgB.id, msgB.lockedBy!, msgB.leaseVersion);
    expect(publishedResult).toBe(true);

    // Verify Accounting entries were NOT duplicated
    const accEntries = await pool.query('SELECT * FROM accounting_entries WHERE source_id = $1', [saleId]);
    expect(accEntries.rows.length).toBe(2);

    const finalOutbox = await PgOutboxStore.getMessageById(eventId);
    expect(finalOutbox?.status).toBe('Published');
  });
});
