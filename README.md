# StageOps / tema-eventhub

## Overview

**StageOps (tema-eventhub)** is an enterprise event ticketing and asset reservation platform written in TypeScript and Next.js, featuring a production-grade PostgreSQL persistence layer designed for transaction atomicity, zero overselling, heterogeneous asset pricing accuracy, reservation hold protection, state machine transition safety, admission rights gate scanning invariants, and idempotent business operations under high-concurrency external channel integrations (e.g. Biletix, Passo, Box Office Desk).

## Architecture

The system is structured around Domain-Driven Design (DDD), Clean Architecture, and Event-Driven Architecture (EDA) principles:

- **Application & Domain Layer**: Defines core aggregates (`Sale`, `Reservation`, `VenueAsset`, `SalesChannel`, `AccountingEntry`), domain events (`SaleRecordedDomainEvent`), and use cases.
- **ProcessExternalSaleConfirmationUseCase**: Coordinates external sale confirmations and reservation conversions within PostgreSQL database transactions (`PoolClient`) using canonical sorted asset locking.
- **ReservationService**: Manages reservation creation (`Available` $\rightarrow$ `Reserved`), cancellations, background expiration workers (`FOR UPDATE SKIP LOCKED`), and conversion holds.
- **AdmissionService**: Manages gate scanning projections (`admission_rights`) and atomic gate scans (`processGateScanPg`) with SQL capacity boundary guards and scan reference deduplication (`admission_scans`).
- **UnitOfWork**: Manages PostgreSQL transaction boundaries (`BEGIN`, `COMMIT`, `ROLLBACK`), including guarded rollback logic to preserve original business exceptions during network disruptions.
- **PgOutboxStore & OutboxPublisherWorker**: Implements the Transactional Outbox Pattern backed by PostgreSQL `outbox_messages` table using atomic `FOR UPDATE SKIP LOCKED` lease claiming and `lease_version` fencing tokens.
- **PgConsumerIdempotencyStore**: Guarantees atomic consumer deduplication by executing `INSERT INTO processed_events ON CONFLICT DO NOTHING` within the same database transaction block as downstream business mutations.
- **Venue Projections & Admission Rights**: Maintains authoritative seat status projections (`venue_asset_projections`) and purchaser entry permissions (`admission_rights`).

## PostgreSQL Persistence Model & State Machine

1. **Database-Authoritative Asset, Channel & Admission State**:
   When `cmd.pgClient` is provided, PostgreSQL is the authoritative source for asset validation (`venue_asset_projections`), reservation hold validation (`reservations`), channel configuration (`sales_channels`), sale persistence (`sales`, `sale_lines`), gate entry scanning (`admission_rights`, `admission_scans`), and outbox messaging (`outbox_messages`).
2. **Database DDL Check Constraints**:
   - `reservations(status)`: `CHECK (status IN ('Confirmed', 'Cancelled', 'Expired', 'ConvertedToSale'))`.
   - `admission_rights(already_admitted_count)`: `CHECK (already_admitted_count >= 0)`.
   - `admission_rights(max_capacity_pax)`: `CHECK (max_capacity_pax > 0)`.
   - `admission_rights(chk_capacity_boundary)`: `CHECK (already_admitted_count <= max_capacity_pax)`.
3. **Atomic Gate Scanning Primitive**:
   Gate scans execute an atomic SQL update with boundary guards:
   ```sql
   UPDATE admission_rights
   SET already_admitted_count = already_admitted_count + 1,
       version = version + 1,
       updated_at = NOW()
   WHERE asset_id = $1
     AND is_allowed = TRUE
     AND already_admitted_count < max_capacity_pax
   RETURNING *;
   ```
4. **Duplicate Gate Scan Reference Deduplication**:
   When `scanReference` is supplied, `INSERT INTO admission_scans (id, asset_id, scan_reference) ON CONFLICT (scan_reference) DO NOTHING` deduplicates identical scan submissions. Duplicate scans return `isDuplicateScan: true` with cached state without incrementing `already_admitted_count`.
5. **Canonical Global Lock Acquisition Order**:
   All database operations execute locks in a strict global sequence to eliminate deadlock hazards:
   1. **Canonical Asset Locks**: `venue_asset_projections` locked first in sorted asset order (`Array.from(new Set(assetIds)).sort()`) via `FOR UPDATE`.
   2. **Reservation Lock**: `reservations` locked second (`FOR UPDATE`).
   3. **Sale Ownership Reservation**: `sales` `INSERT ON CONFLICT DO NOTHING`.
   4. **Mutations**: `sale_lines`, `venue_asset_projections`, `reservations`, and `admission_rights` status updates with `version = version + 1`.
   5. **Transactional Outbox**: `outbox_messages` `addMessage`.

## Concurrency & Hardening Guarantees

- **Gate Scan Atomic Increment Stress (T65)**: 100 concurrent gate scans on a 10-PAX asset result in `already_admitted_count` strictly capped at `10`, with exactly 10 successful scans and 90 rejected scans (`CAPACITY_EXCEEDED`).
- **Capacity Boundary Violation (T66)**: Direct SQL attempts to exceed `max_capacity_pax` (e.g. set count = 11) are blocked by PostgreSQL `chk_capacity_boundary` `CHECK` constraint.
- **`is_allowed` Disable Race (T67)**: Toggling `is_allowed = false` concurrently with gate scans guarantees all subsequent scans are rejected with `ADMISSION_DENIED`.
- **Duplicate Scan Reference Idempotency (T68)**: Duplicate gate scan submissions bearing identical `scanReference` return `isDuplicateScan: true` without incrementing `already_admitted_count`.

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

The PostgreSQL correctness integration test suite consists of **69 passed integration scenarios** executing against a real PostgreSQL database instance:

- **T1 - T39 (Core Correctness Baseline)**: Covers consumer idempotency, transaction rollback, worker claiming, lease expiration, stale worker fencing, DLQ replay, multi-line processing, duplicate command idempotency, defense-in-depth unique constraints, zero overselling, initial empty table races, outbox transaction isolation, uncommitted overlap, catalog sanity, phantom asset protection, multi-asset lock ordering, partial failure atomicity, overlapping set races, lease expiration end-to-end fencing, and rollback error preservation.
- **T40 - T52 (PostgreSQL Persistence & Domain Invariants)**: Database-only asset projections, multi-asset input deduplication, PG outbox E2E worker dispatch, winner rollback recovery, heterogeneous pricing, catalog unique index check, unowned sale guard, strict DB asset guard, DB sales channels, command-supplied organization identity, multi-asset execution behavior parity, VAT-exclusive tax baseline arithmetic, and accounting revenue/commission balance invariants.
- **T53 - T57 (Reservation Hold Protection & Conversion Semantics)**: Reservation hold protection, conversion atomicity, customer ownership guard, expired reservation race, and duplicate conversion idempotency.
- **T58 - T62 (Reservation State Machine & Race Hardening)**: Cancel vs conversion race (100 parallel workers), cancel vs expiration race, expiration vs conversion stress race (100 parallel workers), uniform lock ordering deadlock prevention stress, and exhaustive state transition matrix test.
- **T63 - T69 (Admission Rights & Gate Scanning Projections)**: Atomic projection initialization, idempotent event consumption (100 duplicate events), gate scan atomic increment stress (100 concurrent scans), capacity boundary & DB CHECK constraint enforcement, `is_allowed` disable race, duplicate scan reference idempotency, and full admission concurrency harness.

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

> **StageOps PostgreSQL persistence path has a validated transactional and concurrency correctness baseline across 69 integration scenarios. The validated scope covers atomicity, duplicate-command idempotency, overselling prevention, deterministic multi-asset lock ordering, consumer idempotency, outbox leasing and fencing, database-authoritative asset, sales-channel, reservation hold, and admission rights state, gate scan capacity boundaries, pricing/revenue invariants, state-machine transition mutual exclusion, and zero-deadlock stress guarantees. External exactly-once effects, commit ambiguity, global event ordering, accounting double-entry semantics, and high-load behavior remain outside the validated scope.**

## Development & Environment Setup

- **Node.js**: v18+
- **PostgreSQL Database**: v14+ (`postgresql://postgres:stageops@localhost:5433/stageops`)
- **DDL Migration**: Executed automatically by test harness via `migrations/001_outbox_correctness.sql`.
