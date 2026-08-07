# ADR-001: StageOps Product Boundary & Bounded Context Freeze

**Status**: ACCEPTED & FROZEN  
**Date**: 2026-08-07  
**Context**: StageOps Architecture Baseline v1.0 Freeze

---

## 1. Context & Business Domain

StageOps was originally subjected to scope creep where payment gateways (Stripe/iyzico), ticket generation (QR tokens/ticket issuance), POS terminal logic, CRM customer management, and ERP financial ledger engines were being directly built into the core system.

This Architecture Decision Record (ADR) establishes the **uncompromised product boundaries and domain responsibilities** of StageOps.

---

## 2. Core Product Axioms (What StageOps IS and IS NOT)

### What StageOps IS NOT:
1. **StageOps IS NOT a Ticketing Platform**: It does not issue tickets, manage ticket inventory, or generate QR tokens.
2. **StageOps IS NOT a Payment Gateway**: It does not collect credit card payments, handle Stripe/iyzico transactions, or execute payment captures.
3. **StageOps IS NOT a POS Terminal System**: It does not operate credit card readers or cash registers.
4. **StageOps IS NOT a CRM System**: It does not manage customer profiles, marketing campaigns, or loyalty points.
5. **StageOps IS NOT an ERP System**: It does not handle corporate general ledger accounting, tax filings, or payroll.

### What StageOps IS:
> **StageOps is a Venue Operations Platform (Mekan Operasyon Platformu).**

Its sole purpose is receiving external business events (e.g. sales confirmations from Biletix, Passo, or Organizer Desks) and managing operational states:
- Venue layout geometry & asset capacity
- Operational occupancy projections & seat maps
- Gate admission rights & real-time entry authorization
- Double-entry internal revenue splits & event operational logs

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
