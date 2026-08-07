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
        // Apply deepFreeze to guarantee 100% deep immutability across all nested event properties
        const immutableEvent = deepFreeze(event);
        const results = await Promise.allSettled(
          Array.from(eventHandlers).map((handler) => Promise.resolve(handler(immutableEvent)))
        );

        const rejected = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
        if (rejected.length > 0) {
          const firstError = rejected[0]?.reason;
          this.logger.error(`Failed to publish event ${event.eventName} due to ${rejected.length} handler errors`, firstError, {
            eventId: event.header.eventId,
            correlationId: event.header.correlationId,
            causationId: event.header.causationId,
            tenantId: event.header.tenantId,
          });
          // Re-throw so OutboxPublisherWorker marks message as Failed for exponential backoff
          throw firstError instanceof Error ? firstError : new Error(String(firstError));
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
