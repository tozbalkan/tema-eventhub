import { OutboxStore } from './OutboxStore';
import { InMemoryEventBus } from '@/application/EventBus';
import { StructuredJsonLogger } from './Logger';
import { IdGenerator } from './IdGenerator';

/**
 * Transactional Outbox Background Publisher Worker — In-Memory Reference Implementation.
 * 
 * In production: Runs as an independent background polling process or
 * Debezium CDC log tailer. Uses atomic claimPendingMessages(workerId)
 * for in-process lease claiming.
 * 
 * Distributed leasing contract implemented; persistence-backed adapter
 * (PostgreSQL SELECT ... FOR UPDATE SKIP LOCKED) pending.
 */
export class OutboxPublisherWorker {
  private static logger = StructuredJsonLogger.getInstance();
  // In production: derive from POD_NAME env var or hostname + UUID
  private static workerId = `worker_${typeof globalThis !== 'undefined' && typeof globalThis.crypto !== 'undefined' ? IdGenerator.generateUUIDv7().slice(0, 8) : Math.floor(Math.random() * 10000)}`;

  public static async processPendingMessages(batchSize = 10): Promise<number> {
    const claimedMessages = OutboxStore.claimPendingMessages(OutboxPublisherWorker.workerId, batchSize);
    if (claimedMessages.length === 0) return 0;

    const eventBus = InMemoryEventBus.getInstance();
    let publishedCount = 0;

    for (const msg of claimedMessages) {
      try {
        await eventBus.publish(msg.payload);
        OutboxStore.markPublished(msg.id);
        publishedCount++;
      } catch (err) {
        OutboxStore.markFailed(msg.id, err);
        OutboxPublisherWorker.logger.error(`Failed to dispatch Outbox message ${msg.id}`, err, {
          eventType: msg.eventType,
          aggregateId: msg.aggregateId,
          retryCount: msg.retryCount,
          workerId: OutboxPublisherWorker.workerId,
        });
      }
    }

    return publishedCount;
  }
}
