# Marketplace Solidario Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the Super Carnes Solidario Marketplace described in the design spec as a runnable, secure, mobile-first platform with public discovery, manual producer publishing, human moderation and Trust & Safety that works with AI disabled.

**Architecture:** A React + TypeScript web client uses a Laravel 13 JSON API and Sanctum first-party SPA sessions. Docker Compose runs the web client, PHP API, MySQL 8.4 and Redis; domain authorization and state transitions remain server-owned. External verification and object storage are adapters so local development works without paid providers.

**Tech Stack:** Laravel 13, PHP >=8.3, Sanctum, MySQL 8.4, Redis, Docker Compose, React, TypeScript, Vite, accessible CSS tokens/components.

**Spec:** `docs/superpowers/specs/2026-10-18-marketplace-solidario-design.md`

## Global Constraints

- Buyers browse and contact without an account.
- No checkout, cart, payment, fee, invoice, delivery management or internal chat.
- Initial product publication requires a human moderator decision with a reason.
- AI must be absent from essential workflows and can be switched off without breaking them.
- MySQL is the database requested for this implementation; it replaces PostgreSQL in the reference architecture.
- Laravel 13 requires PHP 8.3 or newer.
- Public APIs expose no exact addresses, identity documents, harm evidence or report evidence.
- Contact events count intent only and never assert a completed sale.
- Producer authorization is owner-scoped and enforced server-side.
- Product status transitions are explicit and audited.
- UI locale is Spanish (Panama); accessibility target is WCAG 2.2 AA.
- Launch to production remains gated by the roadmap’s legal, provider, operational and go/no-go decisions.

## Review Focus

- Unauthorized producer ID substitution must not read or mutate another producer's resource; cover with policy/API tests.
- Hidden product states must never leak in public detail, profile listings, search, or sitemap; cover each public query path.
- Upload MIME spoofing, excess image count, and private report evidence must be rejected or remain inaccessible; cover storage/authorization tests.
- Repeated public report/contact/auth submissions must hit limits without blocking ordinary browsing; cover rate-limit feature tests.
- Missing Redis/SMS/AI provider must degrade gracefully; cover local adapter and disabled-feature tests.

---

## File and subsystem map

- `docker-compose.yml`, `docker/php/Dockerfile`, `docker/nginx/`, `frontend/Dockerfile`, `.env.example`: reproducible local services and environment contract.
- `backend/`: Laravel API, migrations, seeders, policies, requests, resources, services, routes and feature/unit tests.
- `frontend/`: React + TypeScript application, route groups, accessible shared primitives, typed API client and component tests.
- `docs/`: product/design/UX contracts, OpenAPI, ERD, security, runbooks, roadmap, UAT and release gates.
- Root `DESIGN.md` and `UX-CONTRACT.md`: durable visual tokens and cross-screen behavior.

## Roadmap mapped to implementation increments

### Task 1: Product foundation and reproducible developer environment

**Files:** root Docker/README/env files; `backend/` Laravel 13 scaffold; `frontend/` React + TypeScript scaffold; root ignore/security defaults.

- [ ] Create Laravel 13 and React TypeScript applications with locked dependencies and separate health endpoints.
- [ ] Configure Compose for API/PHP, web, MySQL 8.4 and Redis, health checks, named data volumes, and no committed secrets.
- [ ] Document clean install, migrations, seed, test, backup and restore commands in Spanish.
- [ ] Verify clean startup, service health, and environment-variable overrides.

### Task 2: UX contract, design system, routes and API/domain contracts

**Files:** `DESIGN.md`, `UX-CONTRACT.md`, `frontend/src/styles/tokens.css`, shared UI primitives, `docs/api/openapi.yaml`, `docs/data/erd.mmd`.

- [ ] Encode spec palette/type/layout as CSS semantic tokens and create shared navigation, buttons, fields, status messages, product cards, modal, pagination and empty/error/loading states.
- [ ] Implement route shells for public, producer and admin registers with Spanish Panama formatting and mobile-first layouts.
- [ ] Define API schemas, pagination/filter semantics, state transitions, role matrix and ERD.
- [ ] Run design contract lint and frontend typecheck; verify keyboard/focus/reduced-motion behavior.

### Task 3: Laravel domain, identities, authorization and audit

**Files:** Laravel migrations/models/enums/policies/form requests/resources/services; `backend/tests/Feature/Authorization/`, `backend/tests/Unit/Domain/`.

- [ ] Build users/roles/permissions, producer profiles, versioned consents, categories, geographic locations, products/images/status history and audit log migrations with indexes/foreign keys.
- [ ] Configure Sanctum cookie-based SPA auth, CSRF, registration/login/logout/current user, seeded local roles and a documented development admin.
- [ ] Implement policy-scoped product/profile access and auditable explicit state transitions.
- [ ] Implement tests for role matrix, resource ownership, consent versioning, phone-change reverification and invalid state transitions.

### Task 4: Public discovery and direct contact

**Files:** public catalog/product/producer controllers, resources, services and routes; frontend public pages and API client; public feature/component tests.

- [ ] Implement paginated lexical search, category and geographic filters, stable relevance/date ordering, and only-public/available product scopes.
- [ ] Build home, products, product detail, producer profile, about, help/security and shareable SEO metadata/sitemap surfaces.
- [ ] Implement WhatsApp/call contact URL construction, editable prefilled WhatsApp copy, warning copy and rate-limited contact-event recording.
- [ ] Implement anonymous reports with validation, optional private evidence and acknowledgement; add abuse limits.
- [ ] Test search/filter combinations, all hidden lifecycle states, contact-event semantics, report privacy and mobile layout.

### Task 5: Producer self-service and assisted registration

**Files:** producer profile/product controllers and policies, upload adapter, producer pages/forms, API/validation tests.

- [ ] Implement manual product draft/edit/submit flows with required photo, title, category, description, unit, optional price/stock and delivery method; cap at five validated images.
- [ ] Implement profile editing, product list/detail, pause, sold-out, withdraw and moderation-status display with correction reasons.
- [ ] Implement provider-agnostic contact verification interface with development fake adapter, retry limits, expiry and phone-change invalidation; no provider required for local mode.
- [ ] Implement operator-assisted producer registration with recorded authorization/consent and actor attribution.
- [ ] Test owner isolation, image validation, state transitions, contact verification limits and assisted-record attribution.

### Task 6: Administration, moderation and Trust & Safety MVP

**Files:** admin controllers/services/policies, moderation/report screens, security/audit pages, tests and admin MFA integration seam.

- [ ] Build moderation queues, approve/reject/request-changes decisions with required reason and complete status history.
- [ ] Build producer and report queues, case status/assignment/resolution, private evidence access, appeal/review record and safety events.
- [ ] Build category/location/user administration, aggregated dashboard KPIs and permission-aware navigation/actions.
- [ ] Add configurable rate limits, suspicious-duplicate rules for human review, audit views and admin MFA enforcement interface.
- [ ] Test permissions per admin role, evidence confidentiality, required moderation reasons and non-conclusive shared-contact behavior.

### Task 7: Optional capabilities and roadmap phase boundaries

**Files:** AI feature flag/provider interface and optional usage schema (disabled by default); advanced Trust & Safety schema/services; roadmap status docs.

- [ ] Add global/module feature flags, `AIProvider` interface and disabled/unavailable behavior that returns the user to manual entry; never auto-populate price, quantity, origin or availability.
- [ ] Provide opt-in UI affordance only when enabled, with editable/rejectable suggestions and provider budget/usage seam; leave credentials absent and AI off by default.
- [ ] Document advanced risk signals/case workflows and enable them only as a separate roadmap increment.
- [ ] Test core flows with AI disabled and provider timeout/unavailability.

### Task 8: Pilot readiness, operational documentation and release evidence

**Files:** CI workflow, backup/restore scripts, security/privacy/operations docs, UAT scripts, accessibility/performance test setup.

- [ ] Add automated checks for formatter, typecheck, unit/feature tests and production builds.
- [ ] Document threat model, data retention decision register, moderator/producer guides, incident/escalation runbook and known risks.
- [ ] Exercise UAT-01–UAT-14 where infrastructure permits; label provider/legal/production-dependent cases clearly and record evidence.
- [ ] Verify backup restoration, health checks, rollback procedure, accessibility of critical flows and representative low-bandwidth mobile performance.
- [ ] Produce phase 0–8 delivery/status matrix, remaining production gates and agency handoff package.

## Execution note

Execute tasks sequentially because they establish shared API, state and UI contracts. After each task, run its focused checks, then the full relevant checks before moving on. Do not claim production readiness while unresolved G0–G6 gates remain. No commit is required per task; commits should be small and descriptive when useful.
