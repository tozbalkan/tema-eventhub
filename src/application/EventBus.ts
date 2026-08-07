import { StructuredJsonLogger } from '@/platform/Logger';
import { deepFreeze } from '@/platform/utils';

export interface EventHeader {
  readonly eventId: string; // UUID v7
  readonly eventVersion: number; // e.g. 1
  readonly occurredAt: string; // ISO string
  readonly correlationId?: string;
  readonly causationId?: string;
  readonly tenantId?: string;
  readonly traceId?: string;
  readonly spanId?: string;
}

export interface DomainEvent {
  readonly eventName: string;
  readonly header: EventHeader;
}

export type EventHandler<T extends DomainEvent = DomainEvent> = (event: Readonly<T>) => void | Promise<void>;

/**
 * EventBus interface.
 * 
 * publish() semantics: Dispatches event to all registered local handlers.
 * "Published" in Outbox context means "event successfully dispatched to local handlers"
 * (in-process mode) or "event accepted by message broker" (distributed mode).
 * 
 * Consumer success/failure is a separate lifecycle — consumers are responsible
 * for their own idempotency via ConsumerIdempotencyStore.
 */
export interface EventBus {
  publish(event: DomainEvent): Promise<void>;
  publish(events: readonly DomainEvent[]): Promise<void>;
  subscribe<T extends DomainEvent>(eventName: string, handler: EventHandler<T>): void;
  unsubscribe<T extends DomainEvent>(eventName: string, handler: EventHandler<T>): void;
}

export class InMemoryEventBus implements EventBus {
  private static instance: InMemoryEventBus;
  private handlers: Map<string, Set<EventHandler<any>>> = new Map();
  private logger = StructuredJsonLogger.getInstance();

  public static getInstance(): InMemoryEventBus {
    if (!InMemoryEventBus.instance) {
      InMemoryEventBus.instance = new InMemoryEventBus();
    }
    return InMemoryEventBus.instance;
  }

  public async publish(eventOrEvents: DomainEvent | readonly DomainEvent[]): Promise<void> {
    const events = Array.isArray(eventOrEvents) ? eventOrEvents : [eventOrEvents];
    
    for (const event of events) {
      const eventHandlers = this.handlers.get(event.eventName);
      if (eventHandlers) {
        // Apply deepFreeze: JSON-serializable payloads only (no Date/Map/Set/Buffer)
        const immutableEvent = deepFreeze(event);
        const handlerEntries = Array.from(eventHandlers);
        const results = await Promise.allSettled(
          handlerEntries.map((handler) => Promise.resolve(handler(immutableEvent)))
        );

        const failures: { index: number; reason: any }[] = [];
        results.forEach((result, index) => {
          if (result.status === 'rejected') {
            failures.push({ index, reason: result.reason });
          }
        });

        if (failures.length > 0) {
          this.logger.error(
            `Event ${event.eventName} dispatch completed with ${failures.length}/${handlerEntries.length} handler failures`,
            failures[0]?.reason,
            {
              eventId: event.header.eventId,
              correlationId: event.header.correlationId,
              causationId: event.header.causationId,
              tenantId: event.header.tenantId,
              failedHandlerCount: failures.length,
              totalHandlerCount: handlerEntries.length,
            }
          );
          // Re-throw so OutboxPublisherWorker marks message as Failed for retry/backoff
          const firstErr = failures[0]?.reason;
          throw firstErr instanceof Error ? firstErr : new Error(String(firstErr));
        }
      }
    }
  }

  public subscribe<T extends DomainEvent>(eventName: string, handler: EventHandler<T>): void {
    if (!this.handlers.has(eventName)) {
      this.handlers.set(eventName, new Set());
    }
    this.handlers.get(eventName)!.add(handler);
  }

  public unsubscribe<T extends DomainEvent>(eventName: string, handler: EventHandler<T>): void {
    const eventHandlers = this.handlers.get(eventName);
    if (eventHandlers) {
      eventHandlers.delete(handler);
    }
  }

  public clearAllSubscriptions(): void {
    this.handlers.clear();
  }
}
