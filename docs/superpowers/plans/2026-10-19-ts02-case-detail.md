# Trust & Safety case detail implementation plan

> **For agentic workers:** Execute this plan with `superpowers:executing-plans`; each task must use test-driven development.

**Goal:** Implement the roadmap’s `/admin/seguridad/casos/{id}` case dossier with resource context, review history, evidence controls, and recoverable loading/error states.

**Architecture:** Add a permission-protected Laravel detail endpoint that returns only case fields safe for authorized reviewers, resource identity, evidence metadata, and an audit timeline. Add a React detail route linked from the existing queue, reuse its existing API/action/field patterns, and retain the queue as the owner list.

**Tech Stack:** Laravel 13, Eloquent, MySQL, React, TypeScript, React Router, existing shared form/status components.

**Spec:** `C:/Users/Usuario/Downloads/Roadmap_Marketplace_Solidario_Super_Carnes_Agencia.md` (TS02, sections 5, 8 and 15); `docs/uat/plan-piloto.md`.

## Global Constraints

- Spanish (Panama) UI; responsive, keyboard-accessible controls and recoverable remote states.
- Only `reports.manage` plus administrative MFA may read case details or evidence.
- Never expose reporter account ID, email, exact address, or private evidence storage path.
- Case and alert decisions remain human, audited, and do not imply a fraud finding.
- Preserve the existing `/admin/denuncias` queue as the case owner list.

## Review Focus

- Unauthorized or nonexistent cases must not leak whether evidence exists.
- Contact information and private storage keys must never appear in the detail response or timeline.
- Evidence downloads must keep the existing authorization and access audit.
- A request for an old case must not overwrite the current detail route after navigation.
- A resolved case remains readable but its transition actions must remain governed by server state.

---

### Task 1: Protected dossier API and audit timeline

**Files:** Modify `backend/app/Http/Controllers/Api/TrustSafetyController.php`, `backend/routes/api.php`, `docs/api/openapi.yaml`; test `backend/tests/Feature/Authorization/ProducerOwnershipTest.php`.

- [x] Write failing feature tests for authorized case detail, related public resource summary, audit entries and omission of reporter/contact/private storage fields.
- [x] Verify tests fail because the route does not exist (HTTP 405).
- [x] Implement `GET /api/admin/reports/{id}` under existing admin MFA middleware, authorize `reports.review`, and return resource identity, evidence metadata and report/evidence-access audit entries.
- [x] Verify authorized, unauthorized, missing-case and privacy assertions pass (19 assertions).
- [x] Add the route to OpenAPI and confirm route parity (74 operations).

### Task 2: Dossier route and owner-list navigation

**Files:** Modify `frontend/src/api/client.ts`, `frontend/src/App.tsx`, `frontend/src/App.test.tsx`, and `docs/uat/plan-piloto.md`.

- [x] Add failing tests for the queue’s “Abrir expediente” link, detail loading, audit activity, safe evidence links and private-note validation.
- [x] Verify tests failed because the route and client method were absent.
- [x] Implement `getReportCase(id)` and `/admin/seguridad/casos/:id` with a case header, linked resource summary, event timeline, review actions and existing evidence endpoint.
- [x] Add a back link that returns to `/admin/denuncias` and queue links that preserve an individual case ID.
- [x] Run the complete backend and frontend suites, build, lint, design verification, OpenAPI parity and `git diff --check`.
- [x] Update UAT-09, screen inventory, phase register and agency acceptance evidence to record the implementation and remaining staging acceptance.
