# StageOps / tema-eventhub

## Overview

**StageOps (tema-eventhub)** is an enterprise event ticketing and asset reservation platform written in TypeScript and Next.js, featuring a production-grade PostgreSQL persistence layer designed for transaction atomicity, zero overselling, heterogeneous asset pricing accuracy, reservation hold protection, state machine transition safety, and idempotent business operations under high-concurrency external channel integrations (e.g. Biletix, Passo, Box Office Desk).

## Architecture

The system is structured around Domain-Driven Design (DDD), Clean Architecture, and Event-Driven Architecture (EDA) principles:

- **Application & Domain Layer**: Defines core aggregates (`Sale`, `Reservation`, `VenueAsset`, `SalesChannel`, `AccountingEntry`), domain events (`SaleRecordedDomainEvent`), and use cases.
- **ProcessExternalSaleConfirmationUseCase**: Coordinates external sale confirmations and reservation conversions within PostgreSQL database transactions (`PoolClient`) using canonical sorted asset locking.
- **ReservationService**: Manages reservation creation (`Available` $\rightarrow$ `Reserved`), cancellations, background expiration workers (`FOR UPDATE SKIP LOCKED`), and conversion holds.
- **UnitOfWork**: Manages PostgreSQL transaction boundaries (`BEGIN`, `COMMIT`, `ROLLBACK`), including guarded rollback logic to preserve original business exceptions during network disruptions.
- **PgOutboxStore & OutboxPublisherWorker**: Implements the Transactional Outbox Pattern backed by PostgreSQL `outbox_messages` table using atomic `FOR UPDATE SKIP LOCKED` lease claiming and `lease_version` fencing tokens.
- **PgConsumerIdempotencyStore**: Guarantees atomic consumer deduplication by executing `INSERT INTO processed_events ON CONFLICT DO NOTHING` within the same database transaction block as downstream business mutations.
- **Venue Projections & Admission Rights**: Maintains authoritative seat status projections (`venue_asset_projections`) and purchaser entry permissions (`admission_rights`).

## PostgreSQL Persistence Model & State Machine

1. **Database-Authoritative Asset, Channel & Reservation State**:
   When `cmd.pgClient` is provided, PostgreSQL is the authoritative source for asset validation (`venue_asset_projections`), reservation hold validation (`reservations`), channel configuration (`sales_channels`), sale persistence (`sales`, `sale_lines`), and outbox messaging (`outbox_messages`).
2. **Database DDL Check Constraints**:
   The `reservations` table enforces DB-level status integrity:
   `CHECK (status IN ('Confirmed', 'Cancelled', 'Expired', 'ConvertedToSale'))`.
3. **Canonical Global Lock Acquisition Order**:
   All database operations execute locks in a strict global sequence to eliminate deadlock hazards:
   1. **Canonical Asset Locks**: `venue_asset_projections` locked first in sorted asset order (`Array.from(new Set(assetIds)).sort()`) via `FOR UPDATE`.
   2. **Reservation Lock**: `reservations` locked second (`FOR UPDATE`).
   3. **Sale Ownership Reservation**: `sales` `INSERT ON CONFLICT DO NOTHING`.
   4. **Mutations**: `sale_lines`, `venue_asset_projections`, and `reservations` status updates with `version = version + 1`.
   5. **Transactional Outbox**: `outbox_messages` `addMessage`.
4. **Reservation State Machine & Hold Protection**:
   - Status transitions: `Available` $\rightarrow$ `Reserved` $\rightarrow$ `ConvertedToSale` (or `Cancelled` / `Expired`).
   - Unsold assets in `'Reserved'` status are protected by active `reservation_id` holds. A sale attempt without a matching `reservationId` is rejected with `SEAT_ALREADY_RESERVED`.
   - Reservation conversion verifies customer email/phone ownership (`RESERVATION_NOT_OWNED`), reservation status (`RESERVATION_EXPIRED`, `RESERVATION_CANCELLED`), and transitions status to `'ConvertedToSale'` in the same database transaction block.
   - Failed conversion transactions trigger a guarded `ROLLBACK`, preserving the active `'Reserved'` state without reverting to `'Available'` or corrupting state.
5. **Command-Supplied Tenant Identity**:
   Tenant identity (`organizationId`) is explicitly supplied by the command payload (`cmd.organizationId`) and persisted transactionally in PostgreSQL (`sales.organization_id`, `reservations.organization_id`, outbox message `tenantId`).
6. **Heterogeneous Asset Pricing & Tax Domain Arithmetic**:
   - `grossPrice` = `sum(lines.totalPrice)` (Sum of `base_price` across all requested asset projections).
   - `taxAmount` per line = `unitPrice * 0.20` (VAT-exclusive baseline rate: 20% KDV).
   - `commissionPaid` = `grossPrice * commissionRate` (where `commissionRate` is fetched from PostgreSQL `sales_channels`).
   - `netRevenue` = `grossPrice - commissionPaid`.
   - `accountingAmount` = `grossPrice`.

## Concurrency & Hardening Guarantees

- **Cancel vs Conversion Race (T58)**: 100 parallel workers competing to cancel or convert a reservation produce a deterministic, mutually exclusive terminal state (`Cancelled + Available` OR `ConvertedToSale + Sold`), with zero invalid cross-states (`Cancelled + Sold`).
- **Cancel vs Expiration Race (T59)**: Concurrent cancellation and background expiration workers transition asset to `Available` and reservation to `Cancelled` or `Expired`, preserving seat availability.
- **Expiration vs Conversion Stress Race (T60)**: 100 parallel workers competing between expiration and conversion resolve to a single valid terminal state without double mutation.
- **Deadlock Prevention Stress (T61)**: Mixed concurrent operations across overlapping asset sets execute with `deadlock detected = 0` errors.
- **Exhaustive State Matrix (T62)**: Enforces allowed vs forbidden transition rules across the full 12-state reservation matrix.

## Outbox Pattern & Lifecycle

Outbox messages transition through the following state machine:

```
( Pending ) ──► ( Claimed ) ──► ( Published )
    ▲                 │
    │                 ├──► ( Failed ) ──► ( DeadLetter )
    └─────────────────┘
```

- **Leasing**: Background workers claim pending messages using `SELECT ... FOR UPDATE SKIP LOCKED` and increment `lease_version`.
- **Fencing**: `markPublished` and `markFailed` enforce `WHERE id = $1 AND locked_by = $2 AND lease_version = $3`.

## Testing & Validation Suite

The PostgreSQL correctness integration test suite consists of **62 passed integration scenarios** executing against a real PostgreSQL database instance:

- **T1 - T39 (Core Correctness Baseline)**: Covers consumer idempotency, transaction rollback, worker claiming, lease expiration, stale worker fencing, DLQ replay, multi-line processing, duplicate command idempotency, defense-in-depth unique constraints, zero overselling, initial empty table races, outbox transaction isolation, uncommitted overlap, catalog sanity, phantom asset protection, multi-asset lock ordering, partial failure atomicity, overlapping set races, lease expiration end-to-end fencing, and rollback error preservation.
- **T40 - T52 (PostgreSQL Persistence & Domain Invariants)**: Database-only asset projections, multi-asset input deduplication, PG outbox E2E worker dispatch, winner rollback recovery, heterogeneous pricing, catalog unique index check, unowned sale guard, strict DB asset guard, DB sales channels, command-supplied organization identity, multi-asset execution behavior parity, VAT-exclusive tax baseline arithmetic, and accounting revenue/commission balance invariants.
- **T53 - T57 (Reservation Hold Protection & Conversion Semantics)**: Reservation hold protection, conversion atomicity, customer ownership guard, expired reservation race, and duplicate conversion idempotency.
- **T58 - T62 (Reservation State Machine & Race Hardening)**: Cancel vs conversion race (100 parallel workers), cancel vs expiration race, expiration vs conversion stress race (100 parallel workers), uniform lock ordering deadlock prevention stress, and exhaustive state transition matrix test.

## Verification Commands

To run static type checking:
```bash
npx tsc --noEmit
```

To run the complete PostgreSQL integration test suite:
```bash
DATABASE_URL=postgresql://postgres:stageops@localhost:5433/stageops npx vitest run tests/pg-correctness/
```

## Correctness Scope & Validated Baseline Statement

> **StageOps PostgreSQL persistence path has a validated transactional and concurrency correctness baseline across 62 integration scenarios. The validated scope covers atomicity, duplicate-command idempotency, overselling prevention, deterministic multi-asset lock ordering, consumer idempotency, outbox leasing and fencing, database-authoritative asset, sales-channel, and reservation hold state, pricing/revenue invariants, state-machine transition mutual exclusion, and zero-deadlock stress guarantees. External exactly-once effects, commit ambiguity, global event ordering, accounting double-entry semantics, and high-load behavior remain outside the validated scope.**

## Development & Environment Setup

- **Node.js**: v18+
- **PostgreSQL Database**: v14+ (`postgresql://postgres:stageops@localhost:5433/stageops`)
- **DDL Migration**: Executed automatically by test harness via `migrations/001_outbox_correctness.sql`.
