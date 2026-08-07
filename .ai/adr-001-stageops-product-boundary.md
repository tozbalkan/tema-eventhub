# ADR-001: StageOps Product Boundary & Bounded Context Freeze

**Status**: ACCEPTED & FROZEN  
**Date**: 2026-08-07  
**Context**: StageOps Architecture Baseline v1.0 Freeze

---

## 1. Context & Business Domain

StageOps was originally subjected to scope creep where payment gateways (Stripe/iyzico), ticket generation (QR tokens/ticket issuance), POS terminal logic, CRM customer management, and ERP financial ledger engines were being directly built into the core system.

This Architecture Decision Record (ADR) establishes the **uncompromised product boundaries and domain responsibilities** of StageOps.

---

## 2. Core Product Axioms & Domain Ownership

### StageOps Never Owns (Sistem Dışı Sorumluluklar):
- **Payment Processing**: No credit card collection, Stripe/iyzico SDKs, or capture workflows.
- **Ticket Issuing & Inventory**: No ticket token generation, PDF voucher creation, or wallet passes.
- **QR Code Generation**: No QR code rendering or ticket verification tokens.
- **Wallet Systems**: No Apple Wallet / Google Wallet pass signing or distribution.
- **CRM Systems**: No customer profiles, marketing campaigns, or loyalty point tracking.
- **ERP Systems**: No corporate general ledger accounting, tax filings, or payroll.
- **Marketing Automation**: No SMS/email campaign execution or push notifications.

### StageOps Owns (Sistem İçi Sorumluluklar):
- **Venue Layout & Geometry**: Venue physical layout, seating maps, and zone capacities.
- **Event Management**: Event scheduling, capacity snapshots, and fire limits.
- **Venue Assets**: VIP Tables, Bistros, Lounges, Stage, and Bar geometry & status.
- **Reservation Lifecycle**: Reservation placement, confirmation, expiration, and release.
- **External Sale Registration**: Receiving confirmed external sale notifications and recording sale ledgers.
- **Admission Rights & Gate Control**: Real-time venue asset access authorization at VIP gates.
- **Operations & Occupancy**: Operational seat maps, task queues, and occupancy projections.
- **Workforce & Staff Assignments**: Gate operator and reception manager assignments.
- **Operational Timeline Stream**: Chronological event logs for live operations.
- **Operational Reporting**: Event occupancy, revenue split projections, and gate throughput analytics.

---

## 3. Decision Rules for Future Developers

1. **Never add Ticket/QR Generation to StageOps**:
   - If a new feature requests issuing tickets, Apple Wallet passes, or PDF vouchers, it MUST be built as an external service listening to the `SaleRecorded` domain event.
2. **Never add Payment Gateway SDKs to StageOps**:
   - If a new feature requests processing payments, it MUST be executed on external POS/e-commerce systems which then notify StageOps via external sale registration webhooks.
3. **Keep Domain Events Minimal & Fact-Based**:
   - Internal Domain Events (e.g., `SaleRecorded`) MUST contain minimal identity headers and facts (`saleId`, `eventId`). Handlers pull aggregate state from repositories asynchronously.
4. **Read Models (Projections) Drive the UI**:
   - The UI MUST render 100% of its state from passive projections (e.g., `VenueAssetProjection`). It MUST NEVER read directly from mutable domain aggregates.

---

## 4. Consequences & Benefits

- **System Longevity**: StageOps can evolve for decades without refactoring core venue asset management whenever ticketing partners or payment gateways change.
- **Strict Bounded Context Boundaries**: StageOps communicates with external ticketing, payment, CRM, and ERP systems exclusively via asynchronous Domain & Integration Events.
