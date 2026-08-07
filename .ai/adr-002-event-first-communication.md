# ADR-002: Event-First Communication & Bounded Context Decoupling

**Status**: ACCEPTED & FROZEN  
**Date**: 2026-08-07  
**Context**: StageOps Architecture Baseline v1.0 Decoupling Rules

---

## 1. Context & Architectural Problem

In traditional monolithic web applications, Bounded Contexts frequently leak into each other by calling Application Services or Repositories of other contexts directly. For example, a `SaleService` might directly invoke an `AccountingService` or `NotificationService` synchronously.

This tight coupling leads to fragile code, cascading runtime failures, difficult testing, and impossibility of extracting microservices or background workers in the future.

---

## 2. Core Communication Rule (Event-First Mandate)

> **No Bounded Context is permitted to invoke the Application Services or mutate the Aggregates of another Bounded Context directly.**

Inter-Bounded Context communication MUST occur exclusively through **Asynchronous Domain Events over the `EventBus`**.

### Standard Execution Pipeline:
```
  [Application Use Case]
            │
            ▼
     [Aggregate Root]
            │
            ▼
    [Repository.save()]
            │
            ▼
     [Domain Event]  (Minimal Past-Tense Fact)
            │
            ▼
       [EventBus]    (Application Layer Abstraction)
            │
            ▼
 [BC Event Handler]  (Operations, Accounting, Notification)
            │
            ▼
[Read Model / Projection]  (VenueAssetProjection, GeneralLedger)
```

---

## 3. Strict Architectural Rules for Developers

1. **Forbidden Direct Service Invocations**:
   - `Sale Bounded Context` MUST NEVER call `AccountingService` or `VenueService` methods directly inside a Use Case.
   - It MUST create and persist the `Sale` aggregate, then call `eventBus.publish(new SaleRecordedDomainEvent(...))`.
2. **Domain Event Autonomy**:
   - `Accounting Bounded Context` subscribes to `SaleRecorded` via `AccountingSaleRecordedHandler` and independently writes to `GeneralLedger`.
   - `Operations Bounded Context` subscribes to `SaleRecorded` via `OperationsSaleRecordedHandler` and independently updates `VenueAssetProjection`.
3. **Read Model (Projection) Rendering**:
   - The UI and API read endpoints MUST ONLY query Read Model Projections (`VenueAssetProjection`). Aggregates are reserved for write transactions only.

---

## 4. Consequences & Benefits

- **Zero Cascading Failures**: A failure in Accounting or Reporting handlers will never break the primary Sale registration transaction.
- **Microservices Ready**: Moving a Bounded Context (e.g. Accounting or Operations) out into an independent microservice requires zero changes to the `Sale` domain logic—only swapping the `InMemoryEventBus` for a message broker (`RabbitMQ` / `Kafka`).
- **Parallel Team Velocity**: Autonomous teams can build new listeners (e.g. VIP SMS Notification Handler, Analytics Handler) without touching core StageOps codebase.
