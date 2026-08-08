import { PoolClient } from 'pg';
import { DomainEvent } from '@/application/EventBus';
import { PgPool } from './PgPool';

export interface PgOutboxMessage {
  id: string;
  aggregateType: string;
  aggregateId: string;
  eventType: string;
  payload: any;
  status: 'Pending' | 'Claimed' | 'Published' | 'Failed' | 'DeadLetter';
  retryCount: number;
  maxRetries: number;
  nextRetryAt?: string;
  lastError?: string;
  lockedBy?: string;
  lockedUntil?: string;
  leaseVersion: number;
  occurredAt: string;
  publishedAt?: string;
  createdAt: string;
}

export class PgOutboxStore {
  /**
   * Adds an outbox message within an existing database transaction (PoolClient).
   */
  public static async addMessage(
    client: PoolClient,
    aggregateType: string,
    aggregateId: string,
    event: DomainEvent,
    maxRetries = 5
  ): Promise<PgOutboxMessage> {
    const query = `
      INSERT INTO outbox_messages (
        id, aggregate_type, aggregate_id, event_type, payload,
        status, retry_count, max_retries, lease_version, occurred_at
      ) VALUES ($1, $2, $3, $4, $5, 'Pending', 0, $6, 0, $7)
      RETURNING *;
    `;
    const values = [
      event.header.eventId,
      aggregateType,
      aggregateId,
      event.eventName,
      JSON.stringify(event),
      maxRetries,
      event.header.occurredAt,
    ];

    const res = await client.query(query, values);
    return PgOutboxStore.mapRow(res.rows[0]);
  }

  /**
   * Atomic Lease Claiming using CTE and FOR UPDATE SKIP LOCKED.
   * Deterministic ordering by occurred_at, id.
   * Increments lease_version (fencing token) on every claim.
   */
  public static async claimPendingMessages(
    workerId: string,
    batchSize = 10,
    leaseDurationSeconds = 30
  ): Promise<PgOutboxMessage[]> {
    const pool = PgPool.getPool();
    const query = `
      WITH candidates AS (
        SELECT id
        FROM outbox_messages
        WHERE (
          status = 'Pending'
          OR (status = 'Claimed' AND locked_until <= NOW())
          OR (
            status = 'Failed'
            AND (next_retry_at IS NULL OR next_retry_at <= NOW())
          )
        )
        AND retry_count < max_retries
        ORDER BY occurred_at, id
        FOR UPDATE SKIP LOCKED
        LIMIT $2
      )
      UPDATE outbox_messages AS o
      SET
        status = 'Claimed',
        locked_by = $1,
        locked_until = NOW() + ($3 || ' seconds')::INTERVAL,
        lease_version = o.lease_version + 1
      FROM candidates
      WHERE o.id = candidates.id
      RETURNING o.*;
    `;

    const res = await pool.query(query, [workerId, batchSize, leaseDurationSeconds]);
    return res.rows.map(PgOutboxStore.mapRow);
  }

  /**
   * Fenced markPublished: Only updates if locked_by AND lease_version match.
   * Returns true if successfully updated, false if stale worker (fencing blocked update).
   */
  public static async markPublished(
    messageId: string,
    workerId: string,
    expectedLeaseVersion: number
  ): Promise<boolean> {
    const pool = PgPool.getPool();
    const query = `
      UPDATE outbox_messages
      SET
        status = 'Published',
        published_at = NOW(),
        locked_by = NULL,
        locked_until = NULL
      WHERE id = $1 AND locked_by = $2 AND lease_version = $3;
    `;
    const res = await pool.query(query, [messageId, workerId, expectedLeaseVersion]);
    return (res.rowCount ?? 0) > 0;
  }

  /**
   * Fenced markFailed: Exponential backoff + random jitter + DLQ threshold + 300s max cap.
   * Nullifies next_retry_at when status becomes DeadLetter.
   */
  public static async markFailed(
    messageId: string,
    workerId: string,
    expectedLeaseVersion: number,
    error: any
  ): Promise<boolean> {
    const pool = PgPool.getPool();
    const errorMsg = error instanceof Error ? error.message : String(error);

    const query = `
      UPDATE outbox_messages
      SET
        status = CASE WHEN retry_count + 1 >= max_retries THEN 'DeadLetter' ELSE 'Failed' END,
        retry_count = retry_count + 1,
        last_error = $4,
        next_retry_at = CASE 
          WHEN retry_count + 1 >= max_retries THEN NULL 
          ELSE NOW() + (LEAST(POWER(2, retry_count + 1) + (RANDOM() * POWER(2, retry_count + 1) * 0.25), 300) * INTERVAL '1 second')
        END,
        locked_by = NULL,
        locked_until = NULL
      WHERE id = $1 AND locked_by = $2 AND lease_version = $3;
    `;
    const res = await pool.query(query, [messageId, workerId, expectedLeaseVersion, errorMsg]);
    return (res.rowCount ?? 0) > 0;
  }

  public static async getMessageById(messageId: string): Promise<PgOutboxMessage | null> {
    const pool = PgPool.getPool();
    const res = await pool.query('SELECT * FROM outbox_messages WHERE id = $1', [messageId]);
    return res.rows.length > 0 ? PgOutboxStore.mapRow(res.rows[0]) : null;
  }

  private static mapRow(row: any): PgOutboxMessage {
    return {
      id: row.id,
      aggregateType: row.aggregate_type,
      aggregateId: row.aggregate_id,
      eventType: row.event_type,
      payload: typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload,
      status: row.status,
      retryCount: row.retry_count,
      maxRetries: row.max_retries,
      nextRetryAt: row.next_retry_at ? new Date(row.next_retry_at).toISOString() : undefined,
      lastError: row.last_error || undefined,
      lockedBy: row.locked_by || undefined,
      lockedUntil: row.locked_until ? new Date(row.locked_until).toISOString() : undefined,
      leaseVersion: parseInt(row.lease_version, 10),
      occurredAt: new Date(row.occurred_at).toISOString(),
      publishedAt: row.published_at ? new Date(row.published_at).toISOString() : undefined,
      createdAt: new Date(row.created_at).toISOString(),
    };
  }
}
