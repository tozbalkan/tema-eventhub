import { OutboxStore } from './OutboxStore';
import { InMemoryEventBus } from '@/application/EventBus';
import { StructuredJsonLogger } from './Logger';

/**
 * Transactional Outbox Background Publisher Worker.
 * 
 * In production systems (PostgreSQL + RabbitMQ/Kafka), this runs as an independent
 * background polling process or Debezium CDC (Change Data Capture) log tailer.
 * It reads Pending messages from OutboxStore and dispatches them asynchronously over EventBus.
 */
export class OutboxPublisherWorker {
  private static logger = StructuredJsonLogger.getInstance();

  public static async processPendingMessages(): Promise<number> {
    const pending = OutboxStore.getPendingMessages();
    if (pending.length === 0) return 0;

    const eventBus = InMemoryEventBus.getInstance();
    let publishedCount = 0;

    for (const msg of pending) {
      try {
        await eventBus.publish(msg.payload);
        OutboxStore.markPublished(msg.id);
        publishedCount++;
      } catch (err) {
        OutboxPublisherWorker.logger.error(`Failed to publish Outbox message ${msg.id}`, err, {
          eventType: msg.eventType,
          aggregateId: msg.aggregateId,
        });
      }
    }

    return publishedCount;
  }
}
