/**
 * Consumer Idempotency Store.
 * 
 * Guarantees At-Least-Once Delivery + Idempotent Consumers = Eventual Consistency.
 * 
 * Each event handler (consumer) records which events it has already processed.
 * When the same event is delivered multiple times (due to Outbox retries, worker lease
 * expiry, or broker redelivery), consumers safely skip duplicate processing.
 * 
 * In-memory reference implementation.
 * Production adapter: PostgreSQL table with UNIQUE(event_id, consumer_name) constraint.
 */

export interface ProcessedEvent {
  eventId: string;
  consumerName: string;
  processedAt: string;
}

export class ConsumerIdempotencyStore {
  // Key format: `${eventId}::${consumerName}`
  private static processed: Map<string, ProcessedEvent> = new Map();

  private static key(eventId: string, consumerName: string): string {
    return `${eventId}::${consumerName}`;
  }

  /**
   * Returns true if this consumer has already processed this event.
   */
  public static isAlreadyProcessed(eventId: string, consumerName: string): boolean {
    return ConsumerIdempotencyStore.processed.has(ConsumerIdempotencyStore.key(eventId, consumerName));
  }

  /**
   * Marks this event as processed by this consumer.
   * In production: INSERT INTO processed_events (event_id, consumer_name, processed_at) ON CONFLICT DO NOTHING.
   */
  public static markProcessed(eventId: string, consumerName: string): void {
    const k = ConsumerIdempotencyStore.key(eventId, consumerName);
    if (!ConsumerIdempotencyStore.processed.has(k)) {
      ConsumerIdempotencyStore.processed.set(k, {
        eventId,
        consumerName,
        processedAt: new Date().toISOString(),
      });
    }
  }

  public static getProcessedCount(): number {
    return ConsumerIdempotencyStore.processed.size;
  }
}
