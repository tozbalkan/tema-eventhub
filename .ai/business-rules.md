# StageOps - Business Rules, Domain Invariants & Contracts (v21.0 Architecture Freeze)

This document specifies the core business rules, aggregate invariants, command/event catalogs, read model ownerships, error codes, and integration contracts for **StageOps**. All developers and AI agents MUST strictly comply with these rules.

---

## 1. Simplified Authentication & Identity (Magic Link / OTP)

- **Passwordless Resend Magic Link / OTP**: Authentication operates strictly passwordless (`Email` $\rightarrow$ `Resend Magic Link / OTP` $\rightarrow$ `Supabase Auth Session`). Zero passwords, zero password history, zero security questions.
- **Fixed Role Permission Matrix (`rolePermissions.ts`)**: Permissions are defined statically in code. No dynamic permission builder UI or database permission tables.
- **Granular Scopes**: User memberships evaluate permissions against explicit scopes: `Organization`, `Venue`, `Event`, `Gate`.
- **System Roles**:
  - `SuperAdmin`: Full system access (`*`)
  - `VenueManager`: `venues.*`, `events.*`, `floorplan.*`
  - `EventManager`: `events.*`, `reservations.*`, `sales.*`
  - `FinanceOperator`: `accounting.*`, `refunds.*`, `settlements.*`
  - `CheckInOperator`: `admissions.*`
  - `Viewer`: `read.*`

---

## 2. Aggregate Invariants (Değişmez Kurallar)

- **Sale Invariant**: A `Completed` or `Refunded` Sale CAN NEVER transition back to `PendingPayment` or `Authorized`.
- **Reservation Invariant**: An `Expired` or `Cancelled` Reservation CAN NEVER transition directly to `Confirmed` or `ConvertedToSale` (must create a new reservation from `Available`).
- **Event Invariant**: A `Published` or `Live` Event CANNOT mutate its underlying `FloorPlan` structure directly (requires creating an `EventRevision` and executing a `SeatMigrationBatch`).
- **Ticket Invariant**: A `CheckedIn`, `Revoked`, `Expired`, or `Superseded` ticket CAN NEVER be checked in or activated again.
- **Archived Invariant**: An `is_archived: true` entity CANNOT be modified. A `Restore` operation is required before any mutations can be saved.
- **Money Invariant**: Floating-point numbers (`number` float) MUST NEVER be used for monetary values (`Money = { minorUnits: bigint; currency: CurrencyCode; scale: number }`).

---

## 3. CQRS Command Catalog

- **Venue & Event Commands**: `CreateVenue`, `ArchiveVenue`, `PublishEvent`, `PostponeEvent`, `CancelEvent`, `CreateRevision`, `RollbackRevision`.
- **Floor Plan Commands**: `CreateFloorPlan`, `SaveFloorPlanSnapshot`, `RestoreFloorPlanSnapshot`, `BulkGenerateAssets`.
- **Reservation & Asset Commands**: `HoldSeats`, `ReleaseHold`, `ReserveSeats`, `ConfirmReservation`, `CancelReservation`, `ExpireReservation`.
- **Sales & Financial Commands**: `AuthorizePayment`, `CapturePayment`, `CompleteSale`, `VoidSale`, `RequestRefund`, `ApproveRefund`, `ProcessRefund`, `ProcessChargeback`.
- **Admissions Commands**: `IssueTicket`, `RevokeTicket`, `TransferTicket`, `CheckInCustomer`, `CheckOutCustomer`.
- **Notifications & Sync Commands**: `SendCampaign`, `QueueNotification`, `SyncPlatform`, `RetryPlatformSync`.

---

## 4. CQRS Read Model Ownership Mapping

| Read Model | Subscribed Domain Events | Primary Use Case |
| :--- | :--- | :--- |
| **`DashboardView`** | `SaleCompleted`, `SaleRefunded`, `ReservationExpired`, `EventPublished` | Executive KPIs & revenue widgets |
| **`VenueOccupancyView`** | `ReservationCreated`, `ReservationCancelled`, `SeatMigrated`, `CheckInCompleted` | Real-time seat map & PAX counts |
| **`EventSalesSummary`** | `SaleCreated`, `SaleCompleted`, `SaleRefunded`, `SaleCancelled` | Ticket sales breakdown by channel |
| **`CustomerTimeline`** | `ReservationCreated`, `SaleCompleted`, `CustomerCheckedIn`, `NoteAdded` | CRM 360 customer history drawer |
| **`FinanceSummary`** | `AccountingEntryCreated`, `PaymentCaptured`, `RefundProcessed`, `SettlementPaid` | Ledger & accounting summary |
| **`GateCheckInView`** | `CustomerCheckedIn`, `CustomerCheckedOut`, `DuplicateCheckInAttempt` | Show-day gate operator desk UI |
| **`SettlementReport`** | `SettlementPeriodLocked`, `AccountingEntryCreated` | Organizer payout statements |
| **`NotificationDashboard`**| `NotificationCampaignStarted`, `NotificationDeliveryUpdated` | Broadcast campaign delivery funnel |
| **`PlatformSyncDashboard`**| `PlatformSyncJobStarted`, `PlatformSyncItemFailed` | Third-party ticketing sync status |

---

## 5. Domain Error Catalog

- `EVENT_ALREADY_PUBLISHED`: Event is published; direct structure edit forbidden.
- `VENUE_CAPACITY_EXCEEDED`: Total asset PAX exceeds venue safety/fire capacity.
- `SEAT_ALREADY_RESERVED`: Target venue asset is locked or reserved by another transaction.
- `PAYMENT_ALREADY_CAPTURED`: Attempting to authorize or capture an already processed payment.
- `TICKET_ALREADY_CHECKED_IN`: Ticket token has already been scanned at gate.
- `TICKET_REVOKED_OR_EXPIRED`: Ticket has been revoked or expired.
- `REVISION_CONFLICT`: Stale revision version during execution.
- `PLATFORM_SYNC_CONFLICT`: Data mismatch during third-party platform synchronization.
- `ACCOUNTING_PERIOD_LOCKED`: Attempting to modify records in a closed accounting period.
- `IDEMPOTENCY_KEY_REUSED`: Duplicate request detected with an active idempotency key.

---

## 6. Integration Contracts (Passo, Biletix, Stripe, Resend)

- **Inbound Webhooks (Inbox Pattern)**: All incoming webhooks pass through `WebhookInbox`. Idempotency key and provider `event_id` prevent duplicate processing. Responses must return HTTP 200/202 within 2,000ms.
- **Outbound API Requests**: Outbound requests inherit circuit breakers, max 3 exponential retries, and explicit rate limiting per provider.
- **Idempotency Header**: Outbound requests include `Idempotency-Key` headers generated via `IdGenerator` (UUID v7).

---

## 7. Global Archivable & Soft-Delete Contract

- **Universal Archivable Interface**: All aggregate roots MUST implement `is_archived: boolean`, `archived_at: Date | null`, `archived_by: string | null`, and expose `archive()` and `restore()`.
- **Zero Physical Deletes**: Physical deletion of records is strictly FORBIDDEN across the entire platform.
