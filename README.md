# StageOps / tema-eventhub

## Overview

**StageOps (tema-eventhub)** is an enterprise event ticketing and asset reservation platform written in TypeScript and Next.js, featuring a production-grade PostgreSQL persistence layer designed for transaction atomicity, zero overselling, heterogeneous asset pricing accuracy, and idempotent business operations under high-concurrency external channel integrations (e.g. Biletix, Passo, Box Office Desk).

## Architecture

The system is structured around Domain-Driven Design (DDD), Clean Architecture, and Event-Driven Architecture (EDA) principles:

- **Application & Domain Layer**: Defines core aggregates (`Sale`, `VenueAsset`, `SalesChannel`, `AccountingEntry`), domain events (`SaleRecordedDomainEvent`), and use cases.
- **ProcessExternalSaleConfirmationUseCase**: Coordinates external sale confirmations within PostgreSQL database transactions (`PoolClient`).
- **UnitOfWork**: Manages PostgreSQL transaction boundaries (`BEGIN`, `COMMIT`, `ROLLBACK`), including guarded rollback logic to preserve original business exceptions during network disruptions.
- **PgOutboxStore & OutboxPublisherWorker**: Implements the Transactional Outbox Pattern backed by PostgreSQL `outbox_messages` table using atomic `FOR UPDATE SKIP LOCKED` lease claiming and `lease_version` fencing tokens. Supports `PgOutboxAdapter` for production database operations and `InMemoryOutboxAdapter` for local development.
- **PgConsumerIdempotencyStore**: Guarantees atomic consumer deduplication by executing `INSERT INTO processed_events ON CONFLICT DO NOTHING` within the same database transaction block as downstream business mutations.
- **Venue Projections & Admission Rights**: Maintains authoritative seat status projections (`venue_asset_projections`) and purchaser entry permissions (`admission_rights`).

## PostgreSQL Persistence Model

1. **Strict Database-Authoritative Execution Path**:
   When `cmd.pgClient` is provided, PostgreSQL is the sole authoritative source for asset validation (`venue_asset_projections`), channel configuration (`sales_channels`), organization identity (`organization_id`), sale persistence (`sales`, `sale_lines`), and outbox messaging (`outbox_messages`). Unrecognized assets in PostgreSQL throw an immediate `Asset not found` error without touching in-memory stores.
2. **Database Sales Channels Schema**:
   Sales channel metadata (including channel name and percentage commission rate) is persisted in the PostgreSQL `sales_channels` table and queried dynamically per transaction.
3. **Transaction Boundaries**:
   All database operations for a sale (`sales`, `sale_lines`, `outbox_messages`) execute inside a single PostgreSQL `PoolClient` transaction block managed by `UnitOfWork`.
4. **Non-Aborting Ownership Reservation**:
   Sale ownership is reserved first using `INSERT INTO sales (...) ON CONFLICT (sales_channel_id, external_reference) DO NOTHING RETURNING id`. If duplicate ownership is discovered, the query returns 0 rows without aborting the PostgreSQL transaction block (`23505` safe), allowing the application to return the existing sale payload without side-effects.
5. **Unowned Sale Conflict Exception Guard**:
   If sale insertion returns 0 rows and a subsequent `SELECT` query finds no committed sale row (uncommitted transaction race), the use case throws `SALE_OWNERSHIP_CONFLICT` to prevent un-owned sale fallthrough into asset locking.
6. **Heterogeneous Asset Pricing & Tax Domain Invariants**:
   - `grossPrice` = `sum(lines.totalPrice)` (Sum of `base_price` across all requested asset projections).
   - `taxAmount` per line = `unitPrice * 0.20` (20% KDV tax).
   - `commissionPaid` = `grossPrice * commissionRate` (where `commissionRate` is fetched from PostgreSQL `sales_channels`).
   - `netRevenue` = `grossPrice - commissionPaid`.
   - `accountingAmount` = `grossPrice`.
7. **Deterministic Asset Lock Ordering**:
   Multi-seat reservation asset IDs are deduplicated and canonically sorted (`Array.from(new Set(assetIds)).sort()`) prior to acquiring `FOR UPDATE` row locks on `venue_asset_projections`.
8. **Database Constraints**:
   - `PRIMARY KEY (id)` on all core tables.
   - `UNIQUE INDEX ux_sales_external_reference ON sales (sales_channel_id, external_reference)`.
   - `UNIQUE INDEX ux_accounting_source_entry ON accounting_entries (organization_id, source_type, source_id, entry_type)`.
   - `PRIMARY KEY (event_id, consumer_name) ON processed_events`.

## Concurrency Guarantees

- **Duplicate Command Race Handling**: Concurrent duplicate calls with identical `(sales_channel_id, external_reference)` produce exactly 1 sale row and 0 transaction aborts.
- **Winner Transaction Rollback & Waiter Recovery**: If a winning transaction inserts sale ownership but fails during asset locking and rolls back, subsequent or waiting duplicate requests can acquire sale ownership and complete successfully.
- **Zero Overselling Invariant**: Parallel commands competing for the same asset or overlapping asset sets result in exactly 1 winning reservation; losing commands are cleanly rejected with `SEAT_ALREADY_RESERVED`.
- **Targeted Multi-Asset Deadlock Prevention**: This multi-asset reservation path uses deterministic asset lock ordering (`[...uniqueAssetIds].sort()`) to prevent deadlocks caused by conflicting asset acquisition order.
- **Phantom Asset Mutation Protection**: Duplicate sale commands discover ownership loss BEFORE acquiring asset locks, ensuring losing assets remain in `Available` status.
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

The PostgreSQL correctness integration test suite consists of **52 passed integration scenarios** executing against a real PostgreSQL database instance:

- **T1 - T39 (Core Correctness Baseline)**: Covers consumer idempotency, transaction rollback, worker claiming, lease expiration, stale worker fencing, DLQ replay, multi-line processing, duplicate command idempotency, defense-in-depth unique constraints, zero overselling, initial empty table races, outbox transaction isolation, uncommitted overlap, catalog sanity, phantom asset protection, multi-asset lock ordering, partial failure atomicity, overlapping set races, lease expiration end-to-end fencing, and rollback error preservation.
- **T40 (Database-Only Asset Projection Execution Test)**: Proves sales succeed for assets existing exclusively in PostgreSQL `venue_asset_projections` without relying on process memory.
- **T41 (Multi-Asset Input Array Deduplication Test)**: Proves duplicate asset IDs within a single command payload do not cause self-lock collision or false `SEAT_ALREADY_RESERVED` errors.
- **T42 (Outbox Publisher Worker PostgreSQL End-to-End Test)**: Proves `OutboxPublisherWorker` using `PgOutboxAdapter` claims pending outbox messages from PostgreSQL, dispatches events to subscribers, and updates row status to `Published`.
- **T43 (Winner Rollback + Duplicate Waiter Recovery Test)**: Proves that if a transaction winning sale ownership fails asset locking and rolls back, subsequent duplicate attempts can acquire ownership and process successfully.
- **T44 (Multi-Asset Heterogeneous Pricing Accuracy Test)**: Proves multi-seat sales with different pricing tiers (e.g. 25,000 TRY + 45,000 TRY) accurately compute aggregate `grossPrice` (70,000 TRY), line items, taxes, and accounting amounts.
- **T45 (System Catalog Sales Unique Index Check)**: Verifies `sales(sales_channel_id, external_reference)` unique index definition in PostgreSQL catalog.
- **T46 (Unowned Sale Conflict Exception Guard Test)**: Proves `SALE_OWNERSHIP_CONFLICT` exception is thrown when sale ownership reservation returns 0 rows and existing sale is unavailable.
- **T47 (Strict DB-Authoritative Asset Projection Guard Test)**: Proves that in PostgreSQL transaction mode, an asset missing in PostgreSQL throws `Asset not found` and is never populated from in-memory fallbacks.
- **T48 (DB-Authoritative SalesChannel & Commission Test)**: Proves sales channel commission percentage is fetched dynamically from PostgreSQL `sales_channels` table.
- **T49 (DB-Authoritative Organization Identity Test)**: Proves organization identity is dynamically persisted in PostgreSQL `sales` table and outbox payloads.
- **T50 (Multi-Asset In-Memory & PostgreSQL Execution Parity Test)**: Validates complete behavioral multi-asset reservation parity across both execution modes.
- **T51 (Tax & Revenue Split Invariant Test)**: Proves 20% KDV tax calculations per line item and aggregate revenue splits match domain contract invariants.
- **T52 (Accounting Revenue & Commission Entry Balance Invariant Test)**: Proves accounting ledger balance (`SaleRevenue` + `PlatformCommission` = `netRevenue`) maintains double-entry accounting integrity.

## Verification Commands

To run static type checking:
```bash
npx tsc --noEmit
```

To run the complete PostgreSQL integration test suite:
```bash
DATABASE_URL=postgresql://postgres:stageops@localhost:5433/stageops npx vitest run tests/pg-correctness/
```

## Correctness Scope

> **StageOps PostgreSQL persistence path has a validated concurrency correctness baseline covering transactional atomicity, duplicate command races, asset overselling prevention, multi-asset lock ordering, consumer idempotency, outbox leasing, retry/DLQ behavior, sales channel database persistence, pricing/tax domain invariants, and fencing across 52 integration scenarios. The baseline establishes effectively-once business effects for the tested transactional consumers under at-least-once delivery, but does not claim exactly-once external side effects, strict global event ordering, crash-consistent COMMIT ambiguity handling, or high-load performance correctness.**

## Production Considerations & Limitations

- **At-Least-Once Delivery**: Downstream consumers must remain idempotent.
- **Commit Ambiguity**: If a network connection drops after PostgreSQL commits but before the client receives `COMMIT` acknowledgment, the client should retry using the SAME `(sales_channel_id, external_reference)`.
- **External Side-Effects**: Non-database side-effects (e.g. external HTTP payment webhooks, emails) must be protected by external idempotency keys.
- **Outbox Worker Heartbeats**: High-latency event dispatches (> 30s) should configure higher lease duration or implement periodic lease renewal.

## Development & Environment Setup

- **Node.js**: v18+
- **PostgreSQL Database**: v14+ (Local container setup: `postgresql://postgres:stageops@localhost:5433/stageops`)
- **DDL Migration**: Executed automatically by test harness via `migrations/001_outbox_correctness.sql`.
