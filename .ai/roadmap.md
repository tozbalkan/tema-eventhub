# StageOps / EventHub - Product Development Roadmap

This document outlines the multi-phase product roadmap for **StageOps / EventHub**. It guides scope management and feature prioritization across iterations.

---

## Phase 1: MVP Core Operations, Admissions & First Vertical Slice (Execution Focus)

### First Vertical Slice (End-to-End Core Workflow)
```
[ Venue ] ➔ [ Event ] ➔ [ FloorPlan ] ➔ [ VenueAsset ] ➔ [ Reservation ] ➔ [ Sale ]
                                                                               │
[ CheckIn ] ◄─ [ ReservationTicket ] ◄─ [ AccountingEntry ] ◄─ [ PaymentTransaction ] ◄┘
```

- **Simplified Passwordless Auth**: Supabase Auth + Resend Magic Link / OTP, static `rolePermissions.ts`, scopes (`Organization`, `Venue`, `Event`, `Gate`).
- **Home Console**: `Today's Events`, `Upcoming Events`, `Recent Sales`, `Recent Reservations`, `Upcoming Expirations`, `Quick Actions`.
- **Venues, Gates & Template Library**: Venues management, Gate definitions (`VIP Gate`, `North Gate`), Safety capacity validation (`fire_capacity`), and Venue Template Floor Plan cloning.
- **Events & Revisions Management**: Event creation with status lifecycle (`Draft`, `Published`, `Live`, `Completed`, `Postponed`, `Cancelled`), `SalesAvailability` (`OnSale`, `Paused`, `SoldOut`, `Closed`), `EventCapacitySnapshot` embedded collection, `EventRevision` aggregate root, `RevisionSaga` (Process Manager), `RevisionExecutionState` (Process State), `SeatMigrationBatch` aggregate root, and default sales currency.
- **SVG Floor Plan Editor**: Interactive SVG editor with `ITool` plugins (`Selection`, `Pan`, `Rectangle`, `Circle`, `Polygon`, `Text`), Figma-style Layers, `FloorPlanSnapshot` management, and 2D Grid Bulk Generator.
- **VenueAssets**: Asset classification (`Category` + `Shape`), flexible JSON `metadata`, multi-tier pricing with asset currency overrides, 4 statuses (`Available`, `Reserved`, `Sold`, `Blocked`), and soft-delete Archive/Restore.
- **Reservations, Sales, Holds, Accounting & Payment Engine**: State Machines for `VenueAsset` and `Reservation`, `ReservationHold` aggregate, `ReservationReviewPolicy` orchestration, `Money` value object (`minorUnits`, `scale`), `AccountingEntry` aggregate root, `PaymentTransaction` aggregate root (`occurred_at` vs `received_at`), `Refund` aggregate (`RefundItem` child rows for partial refunds), `RefundSaga` (Process Manager), `RefundPolicy` (`recover_inventory_on`), `TicketRevoked` chain, `SaleLine` price snapshots, payment references & platform commissions, Exchange Rate Snapshots & `rateSource`, Pricing Audit (`pricing_reason`), Outbox Domain Events (`correlation_id`, `causation_id`, `idempotency_key`), and Resend Notification Queue.
- **Show-Day Check-In Admissions Desk**: Gate check-in desk interface, `CheckIn` aggregate (`CustomerCheckedIn`, `CustomerCheckedOut`, `DuplicateCheckInAttempt`), Branching `ReservationTicket` state machine, and device tracking.
- **CRM Module**: Contact profiles (mandatory Phone & Email), Customer `Source` tracking, tags (`VIP`, `Blacklist`, `Corporate`, etc.), and Notes Timeline.
- **CQRS Read Models & Analytics Dashboard**: `DashboardView`, `EventSalesSummary`, `VenueOccupancyView`, `CustomerTimeline`, `FinanceSummary`, `GateCheckInView`, `SettlementReport` in Organization Accounting Currency (`TRY`).
- **Audit Log & Live Event Timeline**: System Audit Log (`changed_fields`, `before_snapshot`, `after_snapshot`) and real-time operational show-day timeline feed.

---

## Phase 2: Deferred Aggregates & Operations Scale

- **Deferred Advanced Aggregates**: `SettlementPeriod`, `BulkRefundExecution`, `TicketTransfer`, `SeatUpgrade`.
- **Command Palette Search (`⌘+K`)**: Event-driven instant search overlay across all entities.
- **CRM Customer Merging**: Deduplication interface for matching contact info.
- **Data Transfer**: CSV Import/Export & JSON system backup/restore.

---

## Phase 3: Mobile Operations & Guest Engagement

- Mobile responsive desk app for door gate managers.
- Public read-only interactive floor plan share links for VIP promoters.
- WhatsApp & SMS notification queue driver integration.
- QR Code ticket scanner app at venue entrance.

---

## Phase 4: API, Integrations & Intelligence

- REST & Webhook APIs for external ticketing platforms (Biletix, Passo).
- Business Intelligence (BI) export integrations.
- AI Insights & Revenue Forecasting.
