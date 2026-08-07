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
        const promises = Array.from(eventHandlers).map((handler) =>
          Promise.resolve(handler(immutableEvent)).catch((err) => {
            this.logger.error(`Error executing event handler for ${event.eventName}`, err, {
              eventId: event.header.eventId,
              correlationId: event.header.correlationId,
              causationId: event.header.causationId,
              tenantId: event.header.tenantId,
              traceId: event.header.traceId,
            });
          })
        );
        await Promise.all(promises);
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
