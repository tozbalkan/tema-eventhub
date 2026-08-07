# ADR-002: Event-First Communication & Bounded Context Decoupling

**Status**: ACCEPTED & FROZEN  
**Date**: 2026-08-07  
**Context**: StageOps Architecture Baseline v1.0 Decoupling Rules

---

## 1. Context & Architectural Problem

In traditional monolithic web applications, Bounded Contexts frequently leak into each other by calling Application Services or Repositories of other contexts directly. For example, a `SaleService` might directly invoke an `AccountingService` or `NotificationService` synchronously.

This tight coupling leads to fragile code, cascading runtime failures, difficult testing, and impossibility of extracting microservices or background workers in the future.

---

## 2. Core Communication Rule (Event-First Mandate) & Official Delivery Model

> **No Bounded Context is permitted to invoke state-mutating Application Services or mutate the Aggregates of another Bounded Context directly.**

Inter-Bounded Context state-mutating communication MUST occur exclusively through **Asynchronous Domain Events over the `EventBus`**.

### Official Distributed Delivery Model:
```
              DELIVERY MODEL

        Transactional Outbox
                │
                ▼
         At-Least-Once
            Delivery
                │
                ▼
       Idempotent Consumers
                │
                ▼
       Eventual Consistency
```

*Architectural Principle*: StageOps **DOES NOT** claim "Exactly-Once Delivery". Exactly-once is impossible in distributed systems. StageOps guarantees **At-Least-Once Delivery + Idempotent Consumers = Eventual Consistency**.

---

## 3. Standard Execution Pipeline

```
  [Application Use Case]
            │  (Command with commandId, correlationId)
            ▼
     [Aggregate Root]
            │
            ▼
    [Persist: Aggregate + OutboxMessage]  (same transaction boundary)
            │
            ▼
     [HTTP Response returned to caller]
            │
            ▼
  [OutboxPublisherWorker]  (background process)
            │
            ▼
       [EventBus.publish()]
            │
            ▼
  [Idempotent Consumer Handlers]  (Operations, Accounting)
            │
            ▼
[Read Model / Projection]  (VenueAssetProjection, GeneralLedger)
```

> **IMPORTANT**: The Use Case MUST NOT call `EventBus.publish()` directly. The Use Case persists the Aggregate and writes the OutboxMessage. The `OutboxPublisherWorker` is responsible for reading pending outbox messages and dispatching them through the `EventBus`.

---

## 4. Distributed Tracing & End-to-End Correlation Context

Every Domain Event carries full distributed tracing metadata in `EventHeader`:
- `eventId`: UUID v7 unique event identifier.
- `eventVersion`: Event schema version (`1`).
- `occurredAt`: ISO timestamp.
- `correlationId`: End-to-end transaction chain identifier across webhooks, commands, events, and outbox messages.
- `causationId`: The `commandId` or parent `eventId` that directly caused this event.
- `tenantId`: Multi-organization isolation identifier (`organizationId`).
- `traceId`, `spanId`: Placeholders for OpenTelemetry context propagation (production adapter pending).

---

## 5. Transactional Outbox Rules

1. **Transactional Outbox Atomicity**:
   - In production, `Sale` aggregate and `OutboxMessage` MUST be persisted within a **single database transaction** (`BEGIN → INSERT Sale → INSERT OutboxMessage → COMMIT`). The current in-memory implementation is a reference implementation; real atomicity requires a persistence-backed Unit of Work.
2. **Multi-Worker Leasing Contract**:
   - `OutboxPublisherWorker` uses lease-based claiming (`claimPendingMessages`) to prevent duplicate dispatching. In production, this requires `SELECT ... FOR UPDATE SKIP LOCKED` (PostgreSQL) or `SET NX PX` (Redis). Current implementation: in-process reference.
3. **Published Semantics**:
   - **In-process mode**: `Published` = all registered local handlers completed successfully.
   - **Distributed mode**: `Published` = event accepted by message broker (RabbitMQ ACK / Kafka leader commit). Consumer success/failure is a separate lifecycle.
4. **Stream Ordering Guarantee**:
   - Event ordering guarantees exist **strictly within the same aggregate stream** (`saleId` or `reservationId`). Cross-aggregate event ordering is non-deterministic by design.
5. **Retry & Dead-Letter Queue**:
   - Failed outbox messages retry with exponential backoff + jitter. After `maxRetries` (default: 5), messages move to `DeadLetter` status.

---

## 6. Consumer Idempotency (At-Least-Once Safety Net)

> **Every event consumer MUST be idempotent.**

Because StageOps uses At-Least-Once delivery, the same event may be delivered multiple times (due to Outbox retries, worker lease expiry, or broker redelivery).

Each consumer checks `ConsumerIdempotencyStore.isAlreadyProcessed(eventId, consumerName)` before executing business logic. After successful processing, it calls `markProcessed(eventId, consumerName)`.

```
  SaleRecorded (eventId: "abc-123")
       │
       ├── AccountingSaleRecordedHandler
       │      ↓
       │   isAlreadyProcessed("abc-123", "Accounting")? → NO → execute → markProcessed
       │
       ├── OperationsSaleRecordedHandler
       │      ↓
       │   isAlreadyProcessed("abc-123", "Operations")? → NO → execute → markProcessed
       │
       │  (Outbox retry delivers same event again)
       │
       ├── AccountingSaleRecordedHandler
       │      ↓
       │   isAlreadyProcessed("abc-123", "Accounting")? → YES → skip
       │
       └── OperationsSaleRecordedHandler
              ↓
           isAlreadyProcessed("abc-123", "Operations")? → YES → skip
```

In production: `UNIQUE(event_id, consumer_name)` constraint in PostgreSQL.

---

## 7. CQRS Read-Only Query Exception

> **State-mutating operations MUST strictly follow Event-First communication. Read-only (query-only) operations may use synchronous, defined Query APIs or Read Model queries.**

Examples of allowed Read-Only Queries:
- `Reservation Bounded Context` querying `VenueAvailabilityQuery` to verify asset layout limits.
- `Operations Bounded Context` querying `CurrencyRateQuery` for display conversion.

---

## 8. Event Payload Contract

Domain event payloads MUST be **JSON-serializable only**. No `Date`, `Map`, `Set`, `Buffer`, or `Uint8Array` values in event payloads. This ensures:
- Correct `deepFreeze` immutability behavior.
- Broker serialization/deserialization compatibility (RabbitMQ / Kafka / Azure Service Bus).
- Event Store persistence compatibility.

---

## 9. Implementation Maturity Levels

| Component | Current Level | Production Target |
|---|---|---|
| EventBus interface | ✅ Async `Promise<void>` | Broker adapter (RabbitMQ/Kafka) |
| Outbox persistence | ⚠️ In-memory array | PostgreSQL table |
| Outbox transaction | ⚠️ Logical (two array pushes) | Single DB transaction |
| Worker leasing | ⚠️ In-process reference | `SELECT ... FOR UPDATE SKIP LOCKED` |
| Consumer idempotency | ⚠️ In-memory Map | `UNIQUE(event_id, consumer_name)` |
| Idempotency store | ⚠️ In-memory Map | Redis `SET NX PX` / PostgreSQL |
| Retry + backoff + jitter | ✅ Implemented | — |
| Dead Letter Queue | ✅ Implemented | DLQ persistence + replay |
| Deep immutability | ✅ `deepFreeze` | — |
| Correlation/causation | ✅ Implemented | OpenTelemetry propagation |

---

## 10. Consequences & Benefits

- **Zero Cascading Failures**: A failure in Accounting or Reporting handlers will never break the primary Sale registration transaction.
- **Microservices Ready**: Moving a Bounded Context out into an independent microservice requires zero changes to the `Sale` domain logic — only swapping the `InMemoryEventBus` for a message broker adapter.
- **Parallel Team Velocity**: Autonomous teams can build new listeners (e.g. VIP SMS Notification Handler, Analytics Handler) without touching core codebase.
- **Duplicate Safety**: Consumer idempotency guarantees correct results even under At-Least-Once delivery.
