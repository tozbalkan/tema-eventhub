# StageOps / tema-eventhub

## Overview

**StageOps (tema-eventhub)** is an enterprise event ticketing and asset reservation platform written in TypeScript and Next.js, featuring a production-grade PostgreSQL persistence layer designed for transaction atomicity, zero overselling, heterogeneous asset pricing accuracy, reservation hold protection, and idempotent business operations under high-concurrency external channel integrations (e.g. Biletix, Passo, Box Office Desk).

## Architecture

The system is structured around Domain-Driven Design (DDD), Clean Architecture, and Event-Driven Architecture (EDA) principles:

- **Application & Domain Layer**: Defines core aggregates (`Sale`, `Reservation`, `VenueAsset`, `SalesChannel`, `AccountingEntry`), domain events (`SaleRecordedDomainEvent`), and use cases.
- **ProcessExternalSaleConfirmationUseCase**: Coordinates external sale confirmations and reservation conversions within PostgreSQL database transactions (`PoolClient`).
- **ReservationService**: Manages reservation creation (`Available` $\rightarrow$ `Reserved`), cancellations, expiration workers, and conversion holds.
- **UnitOfWork**: Manages PostgreSQL transaction boundaries (`BEGIN`, `COMMIT`, `ROLLBACK`), including guarded rollback logic to preserve original business exceptions during network disruptions.
- **PgOutboxStore & OutboxPublisherWorker**: Implements the Transactional Outbox Pattern backed by PostgreSQL `outbox_messages` table using atomic `FOR UPDATE SKIP LOCKED` lease claiming and `lease_version` fencing tokens.
- **PgConsumerIdempotencyStore**: Guarantees atomic consumer deduplication by executing `INSERT INTO processed_events ON CONFLICT DO NOTHING` within the same database transaction block as downstream business mutations.
- **Venue Projections & Admission Rights**: Maintains authoritative seat status projections (`venue_asset_projections`) and purchaser entry permissions (`admission_rights`).

## PostgreSQL Persistence Model

1. **Database-Authoritative Asset, Channel & Reservation State**:
   When `cmd.pgClient` is provided, PostgreSQL is the authoritative source for asset validation (`venue_asset_projections`), reservation hold validation (`reservations`), channel configuration (`sales_channels`), sale persistence (`sales`, `sale_lines`), and outbox messaging (`outbox_messages`).
2. **Reservation State Machine & Hold Protection**:
   - `Available` $\rightarrow$ `Reserved` $\rightarrow$ `Sold` or `Available` (on cancel/expiration).
   - Unsold assets in `'Reserved'` status are protected by active `reservation_id` holds. A sale attempt without a matching `reservationId` is rejected with `SEAT_ALREADY_RESERVED`.
   - Reservation conversion verifies customer email/phone ownership (`RESERVATION_NOT_OWNED`), reservation status (`RESERVATION_EXPIRED`, `RESERVATION_CANCELLED`), and transitions status to `'ConvertedToSale'` in the same database transaction block.
   - Failed conversion transactions trigger a guarded `ROLLBACK`, preserving the active `'Reserved'` state without reverting to `'Available'` or corrupting state.
3. **Command-Supplied Tenant Identity**:
   Tenant identity (`organizationId`) is explicitly supplied by the command payload (`cmd.organizationId`) and persisted transactionally in PostgreSQL (`sales.organization_id`, `reservations.organization_id`, outbox message `tenantId`).
4. **Database Sales Channels Schema**:
   Sales channel metadata (including channel name and percentage commission rate) is persisted in the PostgreSQL `sales_channels` table and queried dynamically per transaction.
5. **Transaction Boundaries**:
   All database operations for a sale or reservation conversion execute inside a single PostgreSQL `PoolClient` transaction block managed by `UnitOfWork`.
6. **Non-Aborting Ownership Reservation**:
   Sale ownership is reserved first using `INSERT INTO sales (...) ON CONFLICT (sales_channel_id, external_reference) DO NOTHING RETURNING id`. If duplicate ownership is discovered, the query returns 0 rows without aborting the PostgreSQL transaction block (`23505` safe).
7. **Heterogeneous Asset Pricing & Tax Domain Arithmetic**:
   - `grossPrice` = `sum(lines.totalPrice)` (Sum of `base_price` across all requested asset projections).
   - `taxAmount` per line = `unitPrice * 0.20` (VAT-exclusive baseline rate: 20% KDV).
   - `commissionPaid` = `grossPrice * commissionRate` (where `commissionRate` is fetched from PostgreSQL `sales_channels`).
   - `netRevenue` = `grossPrice - commissionPaid`.
   - `accountingAmount` = `grossPrice`.
8. **Targeted Multi-Asset Lock Ordering**:
   Multi-seat reservation asset IDs are deduplicated and canonically sorted (`Array.from(new Set(assetIds)).sort()`) prior to acquiring `FOR UPDATE` row locks on `venue_asset_projections`.

## Concurrency Guarantees

- **Duplicate Command Race Handling**: Concurrent duplicate calls with identical `(sales_channel_id, external_reference)` produce exactly 1 sale row and 0 transaction aborts.
- **Winner Transaction Rollback & Waiter Recovery**: If a winning transaction inserts sale ownership but fails during asset locking and rolls back, subsequent or waiting duplicate requests can acquire sale ownership and complete successfully.
- **Expired Reservation Race**: Background expiration workers (`SELECT ... FOR UPDATE SKIP LOCKED`) and conversion attempts race deterministically; exactly one transaction wins the state transition without double mutation.
- **Zero Overselling Invariant**: Parallel commands competing for the same asset or overlapping asset sets result in exactly 1 winning reservation; losing commands are cleanly rejected with `SEAT_ALREADY_RESERVED`.
- **Worker Lease Fencing**: Monotonically increasing `lease_version` fencing tokens prevent stale outbox workers from publishing or updating outbox messages after lease expiration.

## Outbox Pattern & Lifecycle

Outbox messages transition through the following state machine:

```
( Pending ) ──► ( Claimed ) ──► ( Published )
    ▲                 │
    │                 ├──► ( Failed ) ──► ( DeadLetter )
    └─────────────────┘
```

- **Leasing**: Background workers claim pending messages using `SELECT ... FOR UPDATE SKIP LOCKED` and increment `lease_version`.
- **Exponential Backoff**: Failed dispatches apply exponential backoff with random jitter, capped at a maximum of 300 seconds.
- **DeadLetter Queue (DLQ)**: Upon reaching `max_retries` (default 5), messages transition to `DeadLetter` and `next_retry_at` is set to `NULL` pending manual operator replay.
- **Fencing**: `markPublished` and `markFailed` enforce `WHERE id = $1 AND locked_by = $2 AND lease_version = $3`.

## Testing & Validation Suite

The PostgreSQL correctness integration test suite consists of **57 passed integration scenarios** executing against a real PostgreSQL database instance:

- **T1 - T39 (Core Correctness Baseline)**: Covers consumer idempotency, transaction rollback, worker claiming, lease expiration, stale worker fencing, DLQ replay, multi-line processing, duplicate command idempotency, defense-in-depth unique constraints, zero overselling, initial empty table races, outbox transaction isolation, uncommitted overlap, catalog sanity, phantom asset protection, multi-asset lock ordering, partial failure atomicity, overlapping set races, lease expiration end-to-end fencing, and rollback error preservation.
- **T40 - T52 (PostgreSQL Persistence & Domain Invariants)**: Database-only asset projections, multi-asset input deduplication, PG outbox E2E worker dispatch, winner rollback recovery, heterogeneous pricing, catalog unique index check, unowned sale guard, strict DB asset guard, DB sales channels, command-supplied organization identity, multi-asset execution behavior parity, VAT-exclusive tax baseline arithmetic, and accounting revenue/commission balance invariants.
- **T53 (Reservation Hold Protection & State Machine Invariant Test)**: Proves unsold assets in `'Reserved'` status block unauthorized sales without matching `reservationId` and successfully convert when authorized.
- **T54 (Reservation -> Sale Atomicity & Rollback Safety Test)**: Proves failed conversion transactions roll back completely, preserving `'Reserved'` hold status without reverting to `'Available'` or corrupting state.
- **T55 (Reservation Ownership Guard Test)**: Proves customer email mismatch blocks reservation conversion with `RESERVATION_NOT_OWNED` and zero database side-effects.
- **T56 (Expired Reservation Race Test)**: Proves background expiration workers and conversion attempts race deterministically without double-mutation.
- **T57 (Duplicate Conversion Idempotency Test)**: Proves duplicate reservation conversion requests return the cached sale payload without creating duplicate sale rows or outbox events.

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

> **StageOps PostgreSQL persistence path has a validated transactional and concurrency correctness baseline across 57 integration scenarios. The validated scope covers atomicity, duplicate-command idempotency, overselling prevention, deterministic multi-asset locking, consumer idempotency, outbox leasing and fencing, database-authoritative asset, sales-channel, and reservation hold state, and pricing/revenue invariants. External exactly-once effects, commit ambiguity, global event ordering, accounting double-entry semantics, and high-load behavior remain outside the validated scope.**

## Development & Environment Setup

- **Node.js**: v18+
- **PostgreSQL Database**: v14+ (`postgresql://postgres:stageops@localhost:5433/stageops`)
- **DDL Migration**: Executed automatically by test harness via `migrations/001_outbox_correctness.sql`.
