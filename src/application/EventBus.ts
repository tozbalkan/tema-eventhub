export interface EventHeader {
  eventId: string; // UUID v7
  eventVersion: number; // e.g. 1
  occurredAt: string; // ISO string
}

export interface DomainEvent {
  eventName: string;
  header: EventHeader;
}

export type EventHandler<T extends DomainEvent = DomainEvent> = (event: T) => void | Promise<void>;

export interface EventBus {
  publish(event: DomainEvent): void;
  publish(events: readonly DomainEvent[]): void;
  subscribe<T extends DomainEvent>(eventName: string, handler: EventHandler<T>): void;
  unsubscribe<T extends DomainEvent>(eventName: string, handler: EventHandler<T>): void;
}

export class InMemoryEventBus implements EventBus {
  private static instance: InMemoryEventBus;
  private handlers: Map<string, Set<EventHandler<any>>> = new Map();

  public static getInstance(): InMemoryEventBus {
    if (!InMemoryEventBus.instance) {
      InMemoryEventBus.instance = new InMemoryEventBus();
    }
    return InMemoryEventBus.instance;
  }

  public publish(eventOrEvents: DomainEvent | readonly DomainEvent[]): void {
    const events = Array.isArray(eventOrEvents) ? eventOrEvents : [eventOrEvents];
    events.forEach((event) => {
      const eventHandlers = this.handlers.get(event.eventName);
      if (eventHandlers) {
        eventHandlers.forEach((handler) => {
          // Promise.resolve ensures async handlers rejecting promises are caught safely
          Promise.resolve(handler(event)).catch((err) => {
            console.error(`Error executing event handler for ${event.eventName}:`, err);
          });
        });
      }
    });
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
