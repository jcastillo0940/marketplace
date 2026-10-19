# UX Contract

## Product context

- **Audience:** Buyers, producers, support operators, moderators, analysts and administrators in Panama.
- **Primary jobs:** Discover and contact a producer; publish an offer manually; review offers and reports safely.
- **Target markets:** Panama, with initial focus on Azuero per the roadmap.
- **Active locales:** `es-PA`.
- **Language/content register:** Direct and plain Spanish; terms and safety copy require institutional/legal review before production.
- **Timezone/calendar:** `America/Panama`, Gregorian calendar.
- **Accessibility target:** WCAG 2.2 AA.

## Business-context sources

| Domain / scope | Authoritative source | Source type | Reviewed date |
|---|---|---|---|
| Product scope and role model | `docs/superpowers/specs/2026-10-18-marketplace-solidario-design.md` | Product/design spec distilled from roadmap | 2026-10-18 |
| State lifecycle, public visibility, contact semantics | Same spec, “Estados e invariantes del dominio” | Domain contract | 2026-10-18 |
| Privacy, eligibility and legal notices | Attached roadmap; final policy pending legal review | Product brief / legal gate | 2026-10-18 |
| Billing/payment | Roadmap explicitly excludes payments and checkout | Product brief | 2026-10-18 |
| Permission model | Roadmap roles, with server-enforced implementation | Permission policy | 2026-10-18 |

## Visual contract

- **Project DESIGN.md:** `DESIGN.md`.
- **Token ownership model:** DESIGN.md owns values; CSS variables implement the contract.
- **Runtime source:** `frontend/src/styles/tokens.css`.
- **Mapping:** semantic `--color-*`, `--font-*`, `--radius-*`, and `--space-*` variables; shared components consume these.
- **Drift gate:** `npm run verify:design` plus `npx -p @google/design.md designmd lint DESIGN.md`.
- **Themes:** light; forced-colors accessible.
- **Design-context owner:** product UI changes update DESIGN.md and tokens in the same change.

## Canonical UI Map

| Capability | Canonical owner | Source of truth | Allowed variants | Verification |
|---|---|---|---|---|
| Moderation selection | Explicit selection limited to the visible moderation page (up to 20 IDs); approval selection excludes ineligible offers | Roadmap decision and UAT-27 | Select page / eligible approvals; reason required; per-item partial results | React and API tests; keyboard and screen-reader pilot remains required |
| Select/Listbox | Shared `SelectField`; native `<select>` initially | DESIGN + UX contract | Native | Keyboard selection and narrow viewport |
| Date | Typed/native date input only when date entry is introduced | UX contract | Typed/native | `es-PA`, keyboard and mobile |
| Form | Shared `Field`, `SelectField`, `TextAreaField`; page-level server alert | UX contract | Create/edit | Field errors, focus, recovery |
| Producer status changes | Shared `ConfirmActionDialog` with `ValidatedForm` and a reason-bearing API request; the detail page uses the same field and mutation rules inline | UAT-17 and the producer status policy | Activate pending profiles, suspend active profiles, reactivate suspended profiles; failed requests retain the reason for retry | Modal focus, field validation, retry, authorization and audit tests |
| Scrollbar | Global app stylesheet | DESIGN.md | Scrollbar gutter on tables | Computed CSS and keyboard scroll |
| Toast | Shared `ToastProvider` | UX contract | success/warning/info/error | Live-region test |
| Producer verification | Shared `VerificationBadge`; public label from API | `ProducerVerificationLevel` and profile `verification_level` | Public badge; MFA-protected admin review form/history | Public copy states what levels do not guarantee; private reason/actor never enter public payload |
| CRUD | Route/service behavior per resource, same shared feedback/navigation | UX contract | Successful create/edit return to owning list | Full producer flow |

## Component behavior

| Component | Default | Hover | Focus | Active | Disabled | Busy | Error |
|---|---|---|---|---|---|---|---|
| Button | label and intent | subtle surface shift | 3px visible ring | small color shift | no click, reduced contrast | stable dimensions, status text | inline error stays near form |
| Icon button | tooltip + accessible name | surface shift | visible ring | pressed state | inert | fixed geometry | error is text, not icon alone |
| Input | labeled, text retained | border accent | visible ring | n/a | muted/read-only distinction | submit button shows busy | `aria-invalid` + described correction |
| Secret input | masked | border accent | visible ring | n/a | inert | preserved dimensions | generic auth error, no account leakage |
| Search | URL-backed committed filters; clear when nonempty | border accent | visible ring | n/a | n/a | app spinner, stale requests ignored | inline retry; query retained |
| Textarea | resize none, sufficient height | border accent | visible ring | n/a | read-only clearly stated | submit state stable | associated text |
| Table/list | paginated, loading/error/empty/total | row tint | visible row action focus | n/a | n/a | stable footprint | partial failure with retry |

## Dataset navigation

- **Admin tables:** server pagination, default 25 rows, URL state includes committed search, filters, sort, page and page size.
- **Exploratory catalog:** server pagination; committed search, category, location filters, sort and page stay in URL. Product order is “Más relevantes” by default, matching title before descending publication date and ID; “Más recientes” orders by descending publication date and ID. Changing a filter or sort resets the page to 1.
- **Empty/no-results/error/loading:** stable panel and clear next action; loading spinner, no skeletons.
- **Back/scroll restoration:** browser history restores URL state and scroll position when possible.
- **Selection:** moderation batches apply only to explicitly selected items on the visible page. “Select all” follows the chosen decision; approval excludes offers whose producer, verified contact, category or parent category is ineligible. Changing the decision to approval removes ineligible IDs from selection. A shared reason is required; partial failures retain the reason and identify each item for retry. Other tables do not use bulk actions.

### Public producer directory

- `/productores` lists only active producer profiles with at least one publicly available offer. Public API responses omit phone numbers and other private account fields.
- Search matches public name or activity; category, province, district and corregimiento filters combine and stay in URL search parameters. District and corregimiento controls depend on their selected parent.
- Results use server pagination, ordered by public name. The page exposes the result total, loading, empty, retryable error and current-page states.
- Directory cards link to the producer profile. “Contacto confirmado” describes control of a phone number only; it is not an endorsement of product quality or a guarantee of a sale.

### Manual product draft

- `/mis-productos/nuevo` requires a title, category, description, unit, delivery method and one to five JPG/PNG/WebP photographs (up to 5 MB each). Browser submission compresses photos over 500 KB sequentially to WebP at quality 82 and a maximum 1600 px edge when the browser can produce a smaller result; otherwise it keeps the original. Each photo is sent as a `File` in the `images[]` multipart field Laravel validates as `images`; the API also normalizes uploads to WebP for storage and delivery. Development and production Nginx/PHP limits accept up to five files and 28 MB per request so the documented limits work together.
- Saving creates a private `draft`; it does not publish or submit for moderation. The producer explicitly sends it for human review from the dashboard after saving. Only moderator approval makes images/listing public.
- The public and producer category selector lists active categories whose parent is also active. Submission requires those same conditions. Approval also requires an active producer profile; the moderation queue shows that prerequisite and disables approval while it is unmet. Request-changes and reject remain available, and concurrent status changes return a recoverable message without clearing the queue.
- Every stored photo must still be readable when an offer is submitted or approved. Missing files return an actionable error so the producer can replace them instead of leaving an unreviewable item published.
- Public catalog and producer-directory cards use a derived WebP thumbnail with a maximum edge of 480 px; the product detail and social share preview use the full API-optimized WebP (maximum edge 1600 px). The public image endpoint applies the same listing-availability and per-image visibility checks to both variants; it does not expose storage paths. Existing images without a thumbnail keep working by serving the full image for the thumbnail URL until they are replaced.
- A suspended producer cannot submit or republish an offer. Existing offers can still be withdrawn.
- Suspension hides the producer's offers without changing their product statuses. When an authorized operator reactivates the profile or accepts an appeal, each offer still in `published` moves to `pending` with an audited reason and requires a fresh human approval before returning to the catalog. Approval preserves the original `published_at`; an offer already past its TTL stays hidden until the producer explicitly renews it. Paused, sold-out, withdrawn, and expired offers remain unavailable.
- The form states this review path before save and presents file selection clearly. AI assistance is optional and absent from the required fields.

### Listing freshness and renewal

- A public listing is visible only while its `published_at` date is within `LISTING_TTL_DAYS`. The default is 90 days; `0` disables expiry. The organization must confirm the policy before the pilot.
- An expired listing remains in the producer's private list with an explicit “Oferta vencida” state and stops appearing in catalog, producer profile, contact/report targets, image delivery and sitemap.
- Only the owning producer can renew an expired published listing while the producer profile and category path are active. Renewal resets its publication date and records both status history and an audit entry. It does not modify offer details or imply renewed stock; the UI asks the producer to confirm availability before renewal.

### Admin catalog management (AD06)

- `/admin/catalogos` supports root categories and one subcategory level. A subcategory must reference an active root category; subcategories cannot have children. Existing root categories with children cannot be moved under another category.
- Admins can edit names and hierarchy, deactivate eligible categories/locations, and reactivate inactive entries. Reactivation is unavailable while a required parent is inactive. The API validates the same rules and audits changes.
- Categories with offers or child categories cannot be deactivated. Locations with producer profiles or child locations cannot be deactivated. Location parent choices must be active and match the province/district/corregimiento hierarchy.
- Catalog forms use shared labeled `Field` and `SelectField` controls, inline field errors with focus recovery, and a page alert for server validation failures.
### Public safety and help guides

- `/seguridad` gives practical buyer steps: confirm availability, price and delivery with the producer; do not share passwords or verification codes; the marketplace does not process payments; phone confirmation is not a guarantee; use the report action from a product/profile.
- `/ayuda-productor` makes manual publishing the primary path: account/profile, offer details and photos, human review, then updates through “Mis publicaciones”. Any AI assistance is optional and its suggestions remain producer-controlled.
- `/ayuda` routes buyers and producers to those guides and the catalog. Guide links have descriptive names and remain usable on narrow screens.
- Safety copy describes current product behavior and avoids promises of support response times or legal conclusions. Legal review remains a production gate.

### Anonymous public reports

- `/reportar/producto/:id` and `/reportar/productor/:id` accept reports without requiring an account; email and evidence are optional.
- The form validates attachments before sending, prevents duplicate submissions while a request is active, and shows success only after the API returns a receipt reference.
- A validation error, rate limit, unavailable resource, or service failure is announced as an error. Failed submissions retain the entered fields and can be retried; server internals are never shown.
- Evidence stays private and is limited by the API to three JPG/PNG/PDF files up to 5 MB each. The receipt reference remains visible after success and the submitted form becomes read-only.

### Producer phone verification

- `/mi-perfil` keeps the phone private and shows the verification controls only while the contact status is unverified. It provides the SMS request action, six-digit OTP entry, expiry feedback and verified state.
- Producer registration, assisted registration and profile editing share the dependent province → district → corregimiento picker. Changing a parent resets lower levels; province or district can be the final selected location, and only the selected location ID is submitted.
- The producer requests an SMS through the configured provider, then enters the six-digit, time-limited code in the same screen. The development code is shown only when the local fake provider is explicitly configured; production never returns it.
- A verified contact label means control of the number, not endorsement, sale confirmation, or payment protection. Changing the private phone invalidates public visibility and requires a new verification.
### Administrative producer detail

- `/admin/productores/:id` requires the server-side `producers.assist` permission and administrative MFA. It presents producer/account metadata, consent versions, contact-verification status, product states, and bounded audit history.
- Producer trust review is a separate `producers.verify` permission behind administrative MFA. Reasons and actor history remain private. Public levels are contact confirmed, identity reviewed, and producer validated; the effective public level falls back to unverified when phone control is not current. Labels do not guarantee quality, availability, payment, or delivery.
- The detail must never return or render the producer's private phone number, verification code/hash, report evidence, or exact private address. A confirmed-contact label only indicates control of the phone number.
- The producer directory links to this detail; unavailable, unauthorized, loading, and empty-history states remain explicit.

## Flow ledger

| Operation | Trigger | Pending | Success destination | Success feedback | Failure recovery | Focus outcome | Source ref |
|---|---|---|---|---|---|---|---|
| Create product | “Guardar borrador” or “Enviar a revisión” | Stable busy submit, no duplicate submit | Producer product list | Shared success toast and row state | Preserve values/files and show inline errors | Owning list heading | Product roadmap |
| Edit product | “Guardar cambios” | Stable busy submit | Producer product list | Shared success toast | Preserve input, inline correction | Owning list heading |
| Withdraw product | Explicit action and accessible confirmation | Disable confirmed action | Producer list | Status toast | Keep product and explain retry | Trigger action after cancel |
| Search | Enter or 300ms debounce after composition | Spinner, cancel prior request | Same list URL | Results count | Retain query, offer retry | Search input |
| Bulk action | Not in MVP | n/a | n/a | n/a | n/a | n/a | Product scope |
| Upload | Accessible picker/drop | Per-file state | Current product form | Uploaded count | Keep valid files and remove failed file | Error message/file list |
| Send public report | “Enviar reporte” | Stable busy submit, duplicate activation blocked | Same report form with receipt reference | Receipt and confirmation status | Preserve entered data; distinguish validation, rate limit, unavailable resource and service failure | Keep focus in form; inline alert | Roadmap TS / UAT-09 |
| Cancel/back | Back/cancel | Dialog only if dirty | Prior list/detail | No toast | Keep draft values | Previous focus/heading |
| Soft delete | Withdraw product | Confirmation | Producer list | “Publicación retirada” | Restore only if domain policy supports | List heading |
| Hard delete | Not exposed in MVP | n/a | n/a | n/a | n/a | n/a | Privacy gate |

## Navigation and responsive behavior

- Document title is route-specific and names product or producer when safe.
- Unauthenticated protected routes return to sign-in with an encoded callback; forbidden routes show an app-owned 403.
- Public filters and paging live in search params. Private forms do not put sensitive state in URLs.
- Private sidebar becomes an accessible mobile drawer; focus remains visible and is not hidden under sticky UI.
- Admin table scrolling is internal to the table surface; producer forms keep natural document scrolling.
- Truncated values have a detail route or accessible full-value text.

## Overlays and feedback

- App-owned modal with title, description, Escape, focus trap, initial focus, and focus restoration.
- Destructive actions state the object and consequence; final action uses its real verb.
- Toasts use shared top-right desktop/bottom mobile placement, polite live region, deduplication and 5s default duration; critical detail also remains inline.
- Banners persist only while action is required or information is safety-critical.
- Tooltips are supplementary and keyboard reachable; no content exists only on hover.
- Unsaved changes: app-owned confirmation for in-app navigation; browser lifecycle warning only for actual page unload.
- Layer order: dialog > drawer > popover > toast; toast must not cover dialog actions.

## Async and resilience

- Mutations are pessimistic until the server confirms.
- Prevent duplicate submission; use idempotency only for endpoints with external side effects.
- Draft recovery is server-backed after authentication; no sensitive browser local storage.
- Offline reads show a clear connection state; do not claim stale data are current. Writes fail with retained inputs and retry path.
- Debounce search 300ms, cancel superseded requests; mutations use bounded timeout and no blind retry for non-idempotent operations.
- Server session revocation takes effect immediately; expired sessions return to sign-in with saved non-sensitive route state.
- Upload preserves successes and valid selections when a sibling file fails.

## Validation

- Server is the authority; client mirrors validation for immediate correction.
- Forms use `noValidate`, real labels, visible inline errors, first-invalid focus and retained values.
- Auth errors do not reveal whether an account exists.
- Secrets are masked; contact numbers are not logged or placed in URLs except the intended external WhatsApp destination after user action.
- Before submit, describe password requirements; allow paste/password managers; prevent duplicate submissions.

## Permission and clipboard

- Hide actions the user cannot perform; server still returns 403 for direct calls.
- Do not provide copy buttons for secrets or private evidence.
- Explain disabled actions when the reason is not obvious.

## Verification

- Required commands: `npm run build`, `npm run verify:design`, `php artisan test`, Docker Compose config/health checks.
- Browser matrix: phone width 390px, tablet 768px, desktop 1440px; keyboard and reduced motion.
- Accessibility: shared primitives, visible focus, screen-reader names/live regions, contrast; manual critical-flow review.
- Locale/domain review: Panama Spanish and terms/legal copy reviewed by assigned owner before production.
- Canonical sibling workflow: producer create/edit/list is the reference for future CRUD routes.
- CRUD/failure evidence: test/API smoke workflow and browser producer-to-moderation-to-catalog runbook.
