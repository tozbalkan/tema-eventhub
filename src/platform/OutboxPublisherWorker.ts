import { OutboxStore } from './OutboxStore';
import { InMemoryEventBus } from '@/application/EventBus';
import { StructuredJsonLogger } from './Logger';

/**
 * Transactional Outbox Background Publisher Worker with Worker Leasing & DLQ Support.
 * 
 * Multi-container safe (Kubernetes pods): Uses atomic claimPendingMessages(workerId)
 * to prevent duplicate event dispatching across scaled-out background workers.
 */
export class OutboxPublisherWorker {
  private static logger = StructuredJsonLogger.getInstance();
  private static workerId = `worker_${Math.floor(Math.random() * 10000)}`;

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
        OutboxPublisherWorker.logger.error(`Failed to publish Outbox message ${msg.id}`, err, {
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
