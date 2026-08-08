import { OutboxStore, OutboxMessage } from './OutboxStore';
import { PgOutboxStore, PgOutboxMessage } from './pg/PgOutboxStore';
import { InMemoryEventBus } from '@/application/EventBus';
import { StructuredJsonLogger } from './Logger';
import { IdGenerator } from './IdGenerator';

export interface MinimalOutboxItem {
  id: string;
  payload: any;
  eventType?: string;
  aggregateId?: string;
  retryCount?: number;
  leaseVersion?: number;
  lockedBy?: string;
}

export interface OutboxStoreAdapter {
  claimPendingMessages(workerId: string, batchSize?: number): Promise<MinimalOutboxItem[]>;
  markPublished(messageId: string, workerId?: string, leaseVersion?: number): Promise<boolean | void>;
  markFailed(messageId: string, workerId?: string, leaseVersion?: number, error?: any): Promise<boolean | void>;
}

export class InMemoryOutboxAdapter implements OutboxStoreAdapter {
  async claimPendingMessages(workerId: string, batchSize = 10): Promise<MinimalOutboxItem[]> {
    return OutboxStore.claimPendingMessages(workerId, batchSize);
  }
  async markPublished(messageId: string): Promise<void> {
    OutboxStore.markPublished(messageId);
  }
  async markFailed(messageId: string, _workerId?: string, _leaseVersion?: number, error?: any): Promise<void> {
    OutboxStore.markFailed(messageId, error);
  }
}

export class PgOutboxAdapter implements OutboxStoreAdapter {
  async claimPendingMessages(workerId: string, batchSize = 10): Promise<MinimalOutboxItem[]> {
    const pgMsgs: PgOutboxMessage[] = await PgOutboxStore.claimPendingMessages(workerId, batchSize);
    return pgMsgs.map((m) => ({
      id: m.id,
      payload: m.payload,
      eventType: m.eventType,
      aggregateId: m.aggregateId,
      retryCount: m.retryCount,
      leaseVersion: m.leaseVersion,
      lockedBy: m.lockedBy,
    }));
  }
  async markPublished(messageId: string, workerId?: string, leaseVersion?: number): Promise<boolean> {
    return PgOutboxStore.markPublished(messageId, workerId || '', leaseVersion || 0);
  }
  async markFailed(messageId: string, workerId?: string, leaseVersion?: number, error?: any): Promise<boolean> {
    return PgOutboxStore.markFailed(messageId, workerId || '', leaseVersion || 0, error);
  }
}

/**
 * Transactional Outbox Background Publisher Worker.
 * 
 * Supports both In-Memory reference adapter (default) and production PgOutboxAdapter.
 * Uses atomic claimPendingMessages(workerId) with lease_version fencing.
 */
export class OutboxPublisherWorker {
  private logger = StructuredJsonLogger.getInstance();
  private workerId: string;
  private adapter: OutboxStoreAdapter;

  constructor(adapter: OutboxStoreAdapter = new InMemoryOutboxAdapter(), workerId?: string) {
    this.adapter = adapter;
    this.workerId = workerId || `worker_${typeof globalThis !== 'undefined' && typeof globalThis.crypto !== 'undefined' ? IdGenerator.generateUUIDv7().slice(0, 8) : Math.floor(Math.random() * 10000)}`;
  }

  public async processPendingMessages(batchSize = 10): Promise<number> {
    const claimedMessages = await this.adapter.claimPendingMessages(this.workerId, batchSize);
    if (claimedMessages.length === 0) return 0;

    const eventBus = InMemoryEventBus.getInstance();
    let publishedCount = 0;

    for (const msg of claimedMessages) {
      try {
        await eventBus.publish(msg.payload);
        await this.adapter.markPublished(msg.id, this.workerId, msg.leaseVersion);
        publishedCount++;
      } catch (err) {
        await this.adapter.markFailed(msg.id, this.workerId, msg.leaseVersion, err);
        this.logger.error(`Failed to dispatch Outbox message ${msg.id}`, err, {
          eventType: msg.eventType,
          aggregateId: msg.aggregateId,
          retryCount: msg.retryCount,
          workerId: this.workerId,
        });
      }
    }

    return publishedCount;
  }

  /**
   * Static convenience helper for backward compatibility.
   */
  public static async processPendingMessages(batchSize = 10, adapter: OutboxStoreAdapter = new InMemoryOutboxAdapter()): Promise<number> {
    const worker = new OutboxPublisherWorker(adapter);
    return worker.processPendingMessages(batchSize);
  }
}
