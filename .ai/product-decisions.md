# StageOps / EventHub - Product Architecture Decisions

This document records the architectural and design decisions behind **StageOps / EventHub**. It provides context for developers and AI assistants on *why* specific technical choices were made, preventing unnecessary refactoring or conflicting suggestions.

---

## 1. Why Passwordless Resend Magic Link / OTP Authentication?

**Decision**: Use Resend Magic Links & OTP via Supabase Auth as the sole authentication mechanism, rejecting passwords, MFA, and dynamic permission UI builders.

**Rationale**:
- Internal operations teams do not need password reset flows, password policies, or dynamic permission editors.
- Passwordless magic links provide maximum security, zero password management overhead, and superior UX on mobile and desktop.

---

## 2. Why Architecture Freeze at v21.0 & Vertical Slice Focus?

**Decision**: Freeze system architecture at v21.0. Stop adding new aggregate roots and focus execution on building the **First Vertical Slice**:
`Venue` ➔ `Event` ➔ `FloorPlan` ➔ `VenueAsset` ➔ `Reservation` ➔ `Sale` ➔ `PaymentTransaction` ➔ `AccountingEntry` ➔ `ReservationTicket` ➔ `CheckIn`.

**Rationale**:
- Building end-to-end real data flows validates CQRS read models, outbox delivery, and SVG editor interaction far more effectively than adding endless speculative domain models.

---

## 3. Why Static Code Role Permissions (`rolePermissions.ts`)?

**Decision**: Store permission matrices statically in code (`rolePermissions.ts`) while keeping dynamic scope evaluations (`Organization`, `Venue`, `Event`, `Gate`).

**Rationale**:
- StageOps is an internal operations platform, not a multi-tenant SaaS with user-editable permission roles. Static code roles reduce database queries and eliminate permission table complexity.
