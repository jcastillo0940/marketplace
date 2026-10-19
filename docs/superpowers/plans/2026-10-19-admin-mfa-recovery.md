# Admin MFA Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a privacy-preserving recovery flow for internal staff MFA that requires two distinct MFA-authenticated reviewers and a fresh TOTP enrollment before administrative access returns.

**Architecture:** Keep the requester in the existing password-authenticated, MFA-pending session until they complete MFA; store recovery requests and immutable reviewer decisions in MySQL. A Laravel workflow owns locks, concurrency, expiry, approvals, TOTP cancellation and reenrollment; protected API endpoints and React screens expose only the minimum information necessary.

**Tech Stack:** Laravel 13, PHP 8.3+, MySQL 8.4, Sanctum cookie sessions, Redis-backed security limits, React 19, TypeScript, React Router, Vitest, existing shared form and confirmation components.

**Spec:** `docs/superpowers/specs/2026-10-19-admin-mfa-recovery-design.md`

## Global Constraints

- The feature is for internal staff only; producers and buyers keep the existing authentication flow.
- The recovery request expires after 72 hours by default; `MFA_RECOVERY_TTL_HOURS` is configurable from 1 through 168.
- The request and each reviewer decision require a 10–1,000 character reason.
- Two different internal people with `security.mfa_recovery.review` and confirmed MFA must approve before the old TOTP secret is removed.
- Existing administrative sessions remain blocked from `/api/admin/*` from request creation until old TOTP proof cancels recovery or a replacement TOTP is confirmed. Return HTTP `423` for this persistent recovery lock; keep the existing `428` response for ordinary staff MFA setup.
- Never store or return TOTP seeds/codes/URIs, passwords, session identifiers or identity-document copies in recovery records, audit, logs, URLs or API responses.
- Do not add email/SMS recovery, backup codes, new third-party dependencies or automatic decisions.
- Use the existing Sanctum web session and CSRF protections; the browser never supplies the target user ID.
- Keep the manual marketplace and all non-MFA producer/buyer flows unchanged.
- UI copy is Spanish (Panama), WCAG 2.2 AA patterns, and uses current project tokens/components with errors associated to fields and focus on first invalid control.

## Review Focus

- Concurrent submissions from separate password sessions must create at most one open request per target; pin this in Task 1 and Task 2 with parallel-request coverage.
- Two concurrent decisions must never count one reviewer twice or remove the seed after only one distinct approval; pin this in Task 1 and Task 3 with unique constraints and locked-row integration coverage.
- Any error during the second approval must roll back both the request state and secret removal; pin this in Task 1 and Task 3 with an injected transaction failure.
- Recovery lock must block already-authenticated sessions; a valid old TOTP must safely cancel/open-unlock, while invalid TOTP leaves the lock unchanged; pin this in Task 2 and Task 4.
- Expired and terminal requests must not be approved, but a target with a still-valid old TOTP can regain access and a target without it can submit a later request; pin this in Task 1 and Task 2.

---

## File and Interface Map

- `backend/database/migrations/2026_10_19_150000_create_admin_mfa_recovery_tables.php`: add request/approval tables and target recovery lock/reference columns; reverse cleanly.
- `backend/app/Enums/AdminMfaRecoveryStatus.php`: canonical request states.
- `backend/app/Models/AdminMfaRecoveryRequest.php`, `AdminMfaRecoveryApproval.php`: persistence, casts, and requester/approver relations.
- `backend/app/Services/AdminMfaRecoveryWorkflow.php`: transactional state transitions, expiry, locking, TOTP cancellation and enrollment completion.
- `backend/config/security.php`, `backend/database/seeders/DatabaseSeeder.php`: bounded TTL config and dedicated reviewer permission grants.
- `backend/app/Http/Controllers/Api/AdminMfaRecoveryController.php`: permission-protected reviewer queue and decision endpoints.
- `backend/app/Http/Controllers/Api/AuthController.php`, `backend/app/Http/Middleware/RequireAdminTwoFactor.php`, `backend/routes/api.php`: pending-session request, TOTP cancellation, enrollment completion and global admin lock enforcement.
- `backend/tests/Feature/Authorization/AdminMfaRecoveryTest.php`: recovery service and API authorization/state/transaction/privacy coverage.
- `frontend/src/api/client.ts`: typed request/queue/decision contracts.
- `frontend/src/App.tsx`: login challenge recovery form, permission-aware admin link and reviewer queue route/page.
- `frontend/src/App.css`: responsive queue/form presentation following existing tokens.
- `frontend/src/App.test.tsx`: requester/reviewer states, field validation, confirmation and error retention.
- `docs/api/openapi.yaml`: public pending-session and protected reviewer contracts.
- `docs/operations/admin-mfa.md`, `docs/uat/plan-piloto.md`, `docs/operations/registro-riesgos-y-fases.md`: implemented behavior, acceptance evidence and current operational gate.

### Interfaces

- `AdminMfaRecoveryWorkflow::request(User $target, string $reason): AdminMfaRecoveryRequest` creates or returns the target's single open request and sets the persistent administrative lock.
- `AdminMfaRecoveryWorkflow::decide(AdminMfaRecoveryRequest $request, User $actor, string $decision, string $reason): AdminMfaRecoveryRequest` validates the actor/state, records one immutable approval, rejects on any rejection, or atomically resets the seed after two distinct approvals.
- `AdminMfaRecoveryWorkflow::cancelOrUnlockWithTotp(User $user): void` cancels an open request or unlocks after proof of the old TOTP; it does not undo a completed approval/reset.
- `AdminMfaRecoveryWorkflow::completeEnrollment(User $user): void` marks the linked approved request `enrolled` and clears the persistent lock after the controller has verified the new TOTP.
- `AdminMfaRecoveryWorkflow::expireOpenRequests(?int $targetUserId = null): int` closes expired open requests and audits each expiry; used by request/list/decision paths without a scheduler.
- `POST /api/auth/mfa/recovery-requests` accepts `{ reason }` from a valid MFA-pending password session and always returns a generic no-store `202` for an already registered request.
- `GET /api/admin/mfa-recovery-requests?page=N` returns 20 open requests per page and requires authenticated, MFA-confirmed staff with `security.mfa_recovery.review`.
- `POST /api/admin/mfa-recovery-requests/{id}/decision` accepts `{ decision: "approve" | "reject", reason }`; self-review/duplicate/stale decisions return `403` or `409` without mutation.
- `requestAdminMfaRecovery(reason: string): Promise<void>`, `getAdminMfaRecoveryRequests(page: number): Promise<Paginated<AdminMfaRecoveryRequest>>`, and `decideAdminMfaRecovery(id: number, decision: "approve" | "reject", reason: string): Promise<AdminMfaRecoveryRequest>` are the frontend API contracts.

---

### Task 1: Recovery persistence and transactional workflow

**Files:**
- Create: `backend/database/migrations/2026_10_19_150000_create_admin_mfa_recovery_tables.php`
- Create: `backend/app/Enums/AdminMfaRecoveryStatus.php`
- Create: `backend/app/Models/AdminMfaRecoveryRequest.php`
- Create: `backend/app/Models/AdminMfaRecoveryApproval.php`
- Create: `backend/app/Services/AdminMfaRecoveryWorkflow.php`
- Modify: `backend/app/Models/User.php`
- Modify: `backend/config/security.php`
- Modify: `backend/database/seeders/DatabaseSeeder.php`
- Test: `backend/tests/Feature/Authorization/AdminMfaRecoveryTest.php`

**Interfaces:** Implements all five `AdminMfaRecoveryWorkflow` methods above. `admin_mfa_recovery_requests` stores requester, initial reason, state, expiry and closure timestamps, indexed by `(status, expires_at, id)` and `(requester_user_id, status)`. `admin_mfa_recovery_approvals` stores request, actor, decision, reason and decision time with unique `(request_id, approver_id)`. `users` gains nullable `mfa_recovery_locked_at` and nullable `mfa_recovery_request_id` FK.

- [ ] **Step 1: Write failing workflow tests**

Add tests named `test_request_sets_lock_and_returns_existing_open_request`, `test_request_serializes_concurrent_open_requests`, `test_approval_requires_two_distinct_reviewers_and_removes_seed_only_on_second`, `test_rejection_is_terminal_and_keeps_lock_and_seed`, `test_expired_request_cannot_be_decided_and_is_audited`, `test_second_approval_transaction_failure_preserves_seed_and_state`, and `test_configured_expiry_is_clamped_between_one_and_168_hours`. Assert two approvals have unique actors/reasons, the first keeps the old seed, and the second writes the target's lock/request link while clearing only the old seed and confirmation timestamp.

- [ ] **Step 2: Run the focused feature tests and confirm they fail for missing recovery behavior**

Run: `docker compose exec -T api php artisan test --filter=AdminMfaRecoveryTest`

Expected: FAIL because the migration, workflow and recovery models do not exist yet.

- [ ] **Step 3: Implement recovery tables, status enum, relations, bounded TTL config and permission seed**

Use states `pending_first_approval`, `awaiting_second_approval`, `approved`, `rejected`, `expired`, `cancelled`, and `enrolled`. Add `security.mfa_recovery.review` to the `admin` and `super_admin` role permission sets. Make schema rollback drop the user FK/columns before the request and approval tables.

- [ ] **Step 4: Implement transactional workflow methods**

Use one lock order for every transition: lock the target user, then the request row. For a decision, read the target ID, begin a transaction, lock that user, then reload/lock the request and validate its target/state. This serializes an old-TOTP cancellation against approval without a lock-order deadlock. Mark expired requests before duplicate detection or cancellation. Keep one open request per target. Reject requester self-review and repeat review by the same approver. Any rejection closes the request. Only the second approval removes the secret and `two_factor_confirmed_at`; keep `mfa_recovery_locked_at` set and link the approved request until reenrollment. Write audit events without secrets or codes.

- [ ] **Step 5: Run `AdminMfaRecoveryTest` and verify all workflow tests pass**

Run: `docker compose exec -T api php artisan test --filter=AdminMfaRecoveryTest`

Expected: PASS, including unique-actor, expiry, concurrency and rollback assertions.

- [ ] **Step 6: Run Pint for changed PHP and commit only Task 1 paths**

Run: `docker compose exec -T api ./vendor/bin/pint --test`

Expected: PASS for changed files. Commit only the listed Task 1 paths with message `feat: add MFA recovery workflow`.

### Task 2: Password-session requests and recovery cancellation

**Files:**
- Modify: `backend/app/Http/Controllers/Api/AuthController.php`
- Modify: `backend/routes/api.php`
- Modify: `backend/app/Services/AdminMfaRecoveryWorkflow.php`
- Test: `backend/tests/Feature/Authorization/AdminMfaRecoveryTest.php`

**Interfaces:** Add `POST /api/auth/mfa/recovery-requests` under `web` + `throttle:auth`, outside `auth:sanctum`. It resolves target only from `mfa_pending_user_id`, requires an unexpired five-minute challenge and confirmed staff MFA, validates `reason` length 10–1,000, and responds `202` with generic text and `Cache-Control: no-store, private`. Extend `/api/auth/mfa/challenge` to call `cancelOrUnlockWithTotp()` only after a valid code and before establishing the authenticated session.

- [ ] **Step 1: Add failing request/cancellation tests**

Add tests named `test_pending_staff_can_request_recovery_without_receiving_authenticated_session`, `test_request_endpoint_does_not_accept_a_client_user_id`, `test_request_is_generic_for_an_existing_open_request`, `test_request_rejects_missing_or_expired_challenge_without_disclosing_account`, `test_request_reason_validation_preserves_csrf_and_auth_throttle`, `test_valid_old_totp_cancels_open_request_and_unlocks`, `test_valid_old_totp_expires_stale_request_then_unlocks`, `test_valid_old_totp_unlocks_after_terminal_request`, and `test_invalid_old_totp_keeps_request_and_lock`.

- [ ] **Step 2: Run focused tests and confirm failure**

Run: `docker compose exec -T api php artisan test --filter=AdminMfaRecoveryTest`

Expected: FAIL for the missing endpoint and TOTP recovery transitions.

- [ ] **Step 3: Implement pending-session request and valid-TOTP cancellation**

Do not accept a target ID, reveal whether a request exists, authenticate the requester, or log the supplied reason. Keep the five-minute pending challenge until it expires or a valid TOTP proves the original device is available. Before cancellation, expire and audit stale requests for that user. A valid TOTP cancels any still-open request; if only a rejected/expired request remains, record `admin.mfa_recovery.unlocked_by_totp` and clear the lock without changing terminal history.

- [ ] **Step 4: Run focused request/cancellation tests and verify pass**

Run: `docker compose exec -T api php artisan test --filter=AdminMfaRecoveryTest`

Expected: PASS, including generic responses, no authenticated session on request, and unchanged state after invalid TOTP.

- [ ] **Step 5: Run Pint and commit only Task 2 paths**

Run: `docker compose exec -T api ./vendor/bin/pint --test`

Expected: PASS for changed PHP. Commit only Task 2 paths with message `feat: accept MFA recovery requests`.

### Task 3: Reviewer queue, distinct decisions and lock enforcement

**Files:**
- Create: `backend/app/Http/Controllers/Api/AdminMfaRecoveryController.php`
- Modify: `backend/app/Http/Middleware/RequireAdminTwoFactor.php`
- Modify: `backend/routes/api.php`
- Modify: `backend/app/Services/AdminMfaRecoveryWorkflow.php`
- Test: `backend/tests/Feature/Authorization/AdminMfaRecoveryTest.php`

**Interfaces:** Add protected GET queue and POST decision routes inside the existing `auth:sanctum` + `admin.mfa` group. Both require `security.mfa_recovery.review`. Queue is paginated 20/request and returns minimum target name/email, request/reviewer reasons, status, timestamps and actor names; never TOTP seed/URI, IDs of session, IP or uploads. Include the current reviewer’s prior vote in each queue item so the UI can disable an already-used decision, but never expose any other target security state. The middleware returns HTTP `423` while `mfa_recovery_locked_at` is set, even for existing sessions.

- [ ] **Step 1: Add failing reviewer/lock tests**

Add tests named `test_queue_requires_mfa_and_dedicated_permission`, `test_queue_returns_only_open_requests_and_minimal_fields`, `test_requester_cannot_review_own_request`, `test_same_reviewer_cannot_supply_second_approval`, `test_second_distinct_approval_completes_and_locks_out_old_sessions`, `test_rejected_expired_or_stale_request_cannot_be_approved`, `test_admin_lock_blocks_preexisting_authenticated_sessions`, and `test_recovery_payload_and_audit_never_include_totp_material`.

- [ ] **Step 2: Run focused tests and confirm failure**

Run: `docker compose exec -T api php artisan test --filter=AdminMfaRecoveryTest`

Expected: FAIL for missing queue/decision routes and recovery lock middleware.

- [ ] **Step 3: Implement reviewer controller and protected routes**

Return only open, unexpired requests; expire stale rows and audit before querying. Require the dedicated permission in each endpoint as well as the route middleware. Map self-review to 403 and stale/repeated/concurrent decisions to 409. Apply 20-row pagination and private no-store cache headers.

- [ ] **Step 4: Enforce target lock in admin MFA middleware**

Reject every protected admin API request with 423 while `mfa_recovery_locked_at` is set, before handling the route. Preserve current 403 behavior for non-staff and 428 for staff without confirmed MFA when no recovery lock applies; add coverage proving unrelated staff without MFA still receive 428.

- [ ] **Step 5: Run focused tests and verify pass**

Run: `docker compose exec -T api php artisan test --filter=AdminMfaRecoveryTest`

Expected: PASS, especially simultaneous second approvals, old-session lockout and secret privacy.

- [ ] **Step 6: Run OpenAPI verification, Pint and commit only Task 3 paths**

Run: `pwsh -File scripts/verify-openapi.ps1`

Expected: PASS with OpenAPI and Laravel route/method inventory matching. Run Pint and commit only Task 3 paths with message `feat: add protected MFA recovery review API`.

### Task 4: Forced TOTP reenrollment after approval

**Files:**
- Modify: `backend/app/Http/Controllers/Api/AuthController.php`
- Modify: `backend/app/Services/AdminMfaRecoveryWorkflow.php`
- Test: `backend/tests/Feature/Authorization/AdminMfaRecoveryTest.php`

**Interfaces:** `POST /api/auth/mfa/confirm` continues to require a six-digit valid TOTP. For a user linked to an approved recovery, call `completeEnrollment(User $user)` in the same database transaction as setting the new `two_factor_confirmed_at`; that method changes request `approved` → `enrolled`, clears the lock and request link, and audits the enrollment.

- [ ] **Step 1: Add failing reenrollment tests**

Add tests named `test_approved_request_requires_fresh_enrollment_before_admin_access`, `test_valid_new_totp_completes_enrollment_and_unlocks`, `test_invalid_new_totp_keeps_recovery_lock`, and `test_initial_mfa_enrollment_does_not_create_recovery_history`.

- [ ] **Step 2: Run focused tests and confirm failure**

Run: `docker compose exec -T api php artisan test --filter=AdminMfaRecoveryTest`

Expected: FAIL because successful confirmation does not yet complete a linked recovery.

- [ ] **Step 3: Complete recovery atomically during TOTP confirmation**

Verify the replacement code before mutating state. Inside one transaction, persist the new encrypted seed's confirmation timestamp, mark linked request enrolled, clear `mfa_recovery_locked_at` and `mfa_recovery_request_id`, and write `admin.mfa_recovery.enrolled`. If the transaction fails, keep the account locked and the request approved.

- [ ] **Step 4: Run focused tests and verify pass**

Run: `docker compose exec -T api php artisan test --filter=AdminMfaRecoveryTest`

Expected: PASS; before confirmation the old session and all admin routes remain blocked, after confirmation a fresh login with new TOTP succeeds.

- [ ] **Step 5: Run Pint and commit only Task 4 paths**

Run: `docker compose exec -T api ./vendor/bin/pint --test`

Expected: PASS for changed PHP. Commit only Task 4 paths with message `feat: require MFA reenrollment after recovery`.

### Task 5: Requester and reviewer React workflows

**Files:**
- Modify: `frontend/src/api/client.ts`
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/App.css`
- Test: `frontend/src/App.test.tsx`

**Interfaces:** Implement the three typed API methods from the Interface Map. Add a secondary “Perdí mi autenticador” action to the MFA challenge. Add the permission-aware `/admin/seguridad/recuperacion-mfa` queue page, 20-row pagination, accessible approve/reject confirmation, and clear 423 recovery-lock guidance with a route back to `/ingresar`.

- [ ] **Step 1: Add failing React tests for requester and reviewer paths**

Add tests named `shows_recovery_form_from_admin_mfa_challenge`, `submits_recovery_reason_and_shows_generic_confirmation`, `focuses_and_associates_invalid_recovery_reason`, `shows_recovery_submission_error_and_preserves_reason`, `hides_recovery_queue_link_without_permission`, `loads_empty_and_error_recovery_queues`, `shows_prior_vote_and_disables_same_reviewer`, `requires_confirmation_and_reason_for_review_decision`, `retains_reviewer_reason_on_network_error`, and `shows_recovery_lock_guidance_on_423`.

- [ ] **Step 2: Run the focused React tests and confirm failure**

Run: `cd frontend; npm test -- App.test.tsx`

Expected: FAIL because the API client, recovery form and reviewer page are not present.

- [ ] **Step 3: Implement typed API calls and request form**

Use the existing `ValidatedForm`, field errors, no-store JSON behavior, and busy/error patterns. Keep request reason after network failure; show only the generic registered confirmation after `202` and never echo the reason in confirmation.

- [ ] **Step 4: Implement permission-aware reviewer queue and decision dialog**

Render queue rows as a bounded, accessible list using existing page patterns, with loading/error/retry/empty states, request expiry and prior vote visible. The approval/rejection dialog requires a distinct reviewer reason and confirmation, disables repeat submits, and refreshes the current page after success. Hide the navigation action when permission is absent; keep the API as the enforcement boundary.

- [ ] **Step 5: Run focused React tests and verify pass**

Run: `cd frontend; npm test -- App.test.tsx`

Expected: PASS for request validation, reviewer identity separation, accessible confirmation, error retention, and 423 guidance.

- [ ] **Step 6: Run frontend lint and compare with sibling admin screens**

Run: `cd frontend; npm run lint`

Expected: zero lint errors; report existing warnings if any. Compare the recovery queue with `/admin/alertas` and `/admin/usuarios` for headings, navigation, permission visibility, empty/error/loading feedback and form density.

- [ ] **Step 7: Run the premium frontend audit, build and design verification**

Run: `New-Item -ItemType Directory -Force docs/uat/evidence`; then `python C:/Users/Usuario/.codex/plugins/cache/openai-curated-remote/frontend-design-premium/1.4.0/skills/frontend-design-premium/scripts/audit_project.py E:/marketplace --mode strict | Tee-Object docs/uat/evidence/mfa-recovery-frontend-audit.json`; then `cd frontend; npm run build; npm run verify:design`.

Expected: strict audit has zero blocking findings and its JSON is saved at `docs/uat/evidence/mfa-recovery-frontend-audit.json`; TypeScript/Vite and design-token checks pass.

- [ ] **Step 8: Exercise requester and reviewer screens in a browser**

Using synthetic internal accounts and requests only, verify request success/error, empty/loading/failed queue, first and second decisions, duplicate-reviewer denial, accessible dialog focus, keyboard operation, preserved reason after a network error, and 423 recovery guidance at a 390×844 viewport. Confirm no horizontal overflow and compare one adjacent admin screen.

- [ ] **Step 9: Commit only Task 5 paths**

Commit only Task 5 paths with message `feat: add MFA recovery screens`.

### Task 6: Contract, runbook and final regression evidence

**Files:**
- Modify: `docs/api/openapi.yaml`
- Modify: `docs/operations/admin-mfa.md`
- Modify: `docs/uat/plan-piloto.md`
- Modify: `docs/operations/registro-riesgos-y-fases.md`

**Interfaces:** Document exact request/decision bodies, 202 generic request response, 403/409/423/429/428 cases, permission, pagination and no-store behavior. Mark UAT-10 local coverage after actual passing runs; retain institutional identity-verification, bootstrap and staging acceptance as external gates.

- [ ] **Step 1: Add OpenAPI schemas and route operations**

Document `MfaRecoveryRequest`, `MfaRecoveryDecision`, queue item, pagination, reasons and 72-hour default/configurable expiry. Ensure no response schema includes TOTP material or session fields.

- [ ] **Step 2: Run OpenAPI contract verification**

Run: `pwsh -File scripts/verify-openapi.ps1`

Expected: PASS; the new three operations are represented and existing API routes remain aligned.

- [ ] **Step 3: Update operational guidance and UAT evidence**

Document identity verification outside the system, dual authorization, treatment of rejected/expired requests, valid-old-TOTP cancellation, replacement enrollment, permission bootstrap and the prohibition on database edits. Distinguish automated local evidence from staging acceptance.

- [ ] **Step 4: Run full backend/frontend regression, PHP style, API contract and design checks**

Run: `docker compose exec -T api php artisan test`; `docker compose exec -T api ./vendor/bin/pint --test`; `cd frontend; npm test; npm run lint; npm run build; npm run verify:design; npm run verify:openapi`; and `pwsh -File scripts/verify-openapi.ps1`.

Expected: all commands PASS; report the actual counts and any existing lint warnings without claiming staging/production acceptance.

- [ ] **Step 5: Commit only Task 6 documentation paths**

Commit the four listed documentation files with message `docs: document MFA recovery operations and acceptance`.