import { DomainEvent } from '@/application/EventBus';
import { IdGenerator } from './IdGenerator';

export type OutboxStatus = 'Pending' | 'Claimed' | 'Published' | 'Failed' | 'DeadLetter';

export interface OutboxMessage {
  id: string; // UUID v7
  aggregateType: string;
  aggregateId: string;
  eventType: string;
  payload: any;
  status: OutboxStatus;
  retryCount: number;
  maxRetries: number;
  nextRetryAt?: string;
  lastError?: string;
  lockedBy?: string;
  lockedUntil?: string;
  occurredAt: string;
  publishedAt?: string;
}

/**
 * Transactional Outbox Store — In-Memory Reference Implementation.
 * 
 * IMPORTANT ARCHITECTURAL NOTE:
 * This is an in-memory reference implementation of the Transactional Outbox pattern.
 * In production, Sale INSERT and OutboxMessage INSERT MUST occur within a single
 * database transaction (BEGIN → INSERT Sale → INSERT OutboxMessage → COMMIT).
 * The current in-memory arrays do NOT provide real transactional atomicity.
 * 
 * Distributed leasing contract defined; persistence-backed implementation
 * (PostgreSQL SELECT ... FOR UPDATE SKIP LOCKED) pending.
 * 
 * Published semantics: "Event successfully dispatched to local in-process handlers"
 * (current mode). In distributed mode: "Event accepted by message broker (RabbitMQ ACK / Kafka leader commit)".
 */
export class OutboxStore {
  private static messages: OutboxMessage[] = [];

  public static addMessage(
    aggregateType: string,
    aggregateId: string,
    event: DomainEvent,
    maxRetries = 5
  ): OutboxMessage {
    const message: OutboxMessage = {
      id: event.header.eventId,
      aggregateType,
      aggregateId,
      eventType: event.eventName,
      payload: event,
      status: 'Pending',
      retryCount: 0,
      maxRetries,
      occurredAt: event.header.occurredAt,
    };
    OutboxStore.messages.push(message);
    return message;
  }

  /**
   * In-process lease claiming. In production: SELECT ... FOR UPDATE SKIP LOCKED.
   * Multi-worker leasing contract implemented; distributed persistence adapter pending.
   */
  public static claimPendingMessages(workerId: string, batchSize = 10, leaseDurationMs = 30000): OutboxMessage[] {
    const now = new Date();
    const nowTime = now.getTime();
    const lockedUntil = new Date(nowTime + leaseDurationMs).toISOString();

    const claimed: OutboxMessage[] = [];

    for (const msg of OutboxStore.messages) {
      if (claimed.length >= batchSize) break;

      const isExpiredLock = msg.lockedUntil && new Date(msg.lockedUntil).getTime() < nowTime;
      const isReadyToRetry = !msg.nextRetryAt || new Date(msg.nextRetryAt).getTime() <= nowTime;

      if ((msg.status === 'Pending' || (msg.status === 'Claimed' && isExpiredLock) || (msg.status === 'Failed' && isReadyToRetry)) && msg.retryCount < msg.maxRetries) {
        msg.status = 'Claimed';
        msg.lockedBy = workerId;
        msg.lockedUntil = lockedUntil;
        claimed.push(msg);
      }
    }

    return claimed;
  }

  public static markPublished(messageId: string): void {
    const msg = OutboxStore.messages.find((m) => m.id === messageId);
    if (msg) {
      msg.status = 'Published';
      msg.lockedBy = undefined;
      msg.lockedUntil = undefined;
      msg.publishedAt = new Date().toISOString();
    }
  }

  public static markFailed(messageId: string, error: any): void {
    const msg = OutboxStore.messages.find((m) => m.id === messageId);
    if (!msg) return;

    msg.retryCount += 1;
    msg.lastError = error instanceof Error ? error.message : String(error);
    msg.lockedBy = undefined;
    msg.lockedUntil = undefined;

    if (msg.retryCount >= msg.maxRetries) {
      msg.status = 'DeadLetter';
      console.error(`[Outbox DLQ] Message ${messageId} moved to Dead Letter Queue after ${msg.retryCount} retries.`);
    } else {
      msg.status = 'Failed';
      // Exponential Backoff + Jitter to prevent thundering herd across workers
      const base = Math.pow(2, msg.retryCount) * 1000;
      const jitter = Math.floor(Math.random() * base * 0.25);
      msg.nextRetryAt = new Date(Date.now() + base + jitter).toISOString();
    }
  }

  public static getMessages(): OutboxMessage[] {
    return [...OutboxStore.messages];
  }
}
