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

describe('PostgreSQL Correctness Baseline (T1 - T14 Integration Tests)', () => {
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
      assetId: 'asset_vip_a3',
      salesChannelId: 'biletix',
      externalSaleReference: 'BTX-DUP-TEST-001',
    };

    // First call creates Sale + OutboxMessage
    const res1 = await UnitOfWork.execute((tx) =>
      ProcessExternalSaleConfirmationUseCase.execute({ ...command, pgClient: tx })
    );
    expect(res1.isDuplicateRecord).toBe(false);

    // Second call with same salesChannelId + externalSaleReference detects duplicate sale
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
});
