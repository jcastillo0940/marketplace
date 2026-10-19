# Frontend Route Code Splitting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Load public, producer, and admin route groups on demand while preserving all existing routes and keeping the public initial JavaScript within 400 kB minified and 110 kB gzip.

**Architecture:** Keep `BrowserRouter` in `main.tsx`. Make `App.tsx` a small route-group dispatcher with three `React.lazy` imports, one accessible `Suspense` fallback, and one recoverable chunk-error boundary. Move page implementations out of the current monolithic `App.tsx` into public, producer, admin, and genuinely shared modules; enable a Vite manifest and verify that the initial static import closure meets the budget while both private groups remain dynamic.

**Tech Stack:** React 19, TypeScript, React Router 7, Vite 8, Vitest, Testing Library, Node built-ins for manifest/size verification.

**Spec:** `docs/superpowers/specs/2026-10-19-frontend-route-code-splitting-design.md`

## Global Constraints

- Preserve `BrowserRouter` and every existing URL, parameter, alias, wildcard, query parameter, navigation state, title, metadata, permission, session, API call, and screen behavior.
- The public group includes home, catalog, product/producer detail and directory, institutional/help/safety pages, `/terminos`, `/privacidad`, public reports, and account access/password recovery.
- The producer group includes `/mi-panel`, `/mis-productos*`, `/mi-perfil`, and `/verificar`.
- The admin group includes every existing `/admin*` path, including aliases and MFA recovery.
- A public visit must not download producer or admin chunks; each group is downloaded when first entered and reused afterward.
- The initial public JavaScript static-import closure must be at most 400 kB minified and 110 kB gzip.
- Loading UI is Spanish, keyboard/screen-reader accessible, uses `role="status"` and polite announcements, reserves stable space, and respects reduced motion.
- A chunk failure offers reload/retry while preserving the requested URL; do not produce an empty screen or an unbounded retry loop.
- Keep existing design tokens, responsive behavior, and styles. Add no dependencies and make no backend/API changes.
- Do not commit or stage work unless the user separately requests it; this checkout already contains extensive pre-staged user work.

## Review Focus

- **Deep link or refresh under each prefix:** the route must resolve to its group and retain path/search state; cover in Task 1 route contract tests.
- **Private screen imported through a shared barrel or navigation component:** public module graph must remain free of producer/admin chunks; cover in Task 1 manifest verifier and Task 4 production manifest checks.
- **Rejected dynamic import or stale deployment asset:** render a clear recovery action without losing the URL; cover in Task 3 error-boundary tests.
- **Lazy route tests racing the Suspense fallback:** existing user-facing assertions must await the settled screen, without weakening assertions; cover while moving suites in Tasks 2–3.
- **Chunk already loaded then revisited:** navigation must reuse it without reloading/flickering; cover in Task 3 route navigation test and Task 4 browser network inspection.

---

### Task 1: Lock route and bundle contracts

**Files:**
- Create: `frontend/scripts/verify-route-chunks.mjs`
- Create: `frontend/scripts/verify-route-chunks.test.mjs`
- Modify: `frontend/vite.config.ts`
- Modify: `frontend/package.json`
- Modify/Test: `frontend/src/App.test.tsx`
- Test: `frontend/scripts/verify-route-chunks.test.mjs`

**Interfaces:**
- The future root dispatcher exposes the default `App` component from `frontend/src/App.tsx` and renders within the router supplied by its caller.
- The future route group modules are `frontend/src/routes/PublicRoutes.tsx`, `ProducerRoutes.tsx`, and `AdminRoutes.tsx`, each default-exporting a route element.
- The build verifier reads Vite's `.vite/manifest.json`; its documented source entries are `index.html`, `src/routes/PublicRoutes.tsx`, `src/routes/ProducerRoutes.tsx`, and `src/routes/AdminRoutes.tsx`.

- [x] **Step 1: Write failing route preservation tests**

The existing `frontend/src/App.test.tsx` already covers the representative catalog/detail/report/access/legal, producer, admin/MFA and query-backed sort routes. Add explicit root (`/`) and unknown-path tests; preserve every current assertion in that suite. Existing legal assertions cover `/terminos` and `/privacidad`; sort assertions verify `sort=newest` in the request and URL.

- [x] **Step 2: Run route tests and confirm the baseline assertions pass**

Run: `npm test -- --run src/App.test.tsx` from `frontend`.  
Expected: existing behavior is observed for all paths before extraction; tests pass against the current single-file router.

- [x] **Step 3: Add a failing production-manifest verifier test**

Export pure manifest inspection helpers from `verify-route-chunks.mjs` and exercise them via Node's built-in test runner in `verify-route-chunks.test.mjs`. With temporary fixture manifests/assets, assert that a public static import closure over 400,000 bytes minified or 110,000 gzip bytes fails; a missing public route group, statically imported producer/admin group, or absent dynamic group fails; and a valid fixture passes. The verifier measures each JS file's byte length and `gzipSync` length and sums them over the static import closure rooted at the HTML entry.

- [x] **Step 4: Enable the Vite build manifest and verification command**

Set `build.manifest: true` in `frontend/vite.config.ts`. Add `test:route-chunks` as `node --test scripts/verify-route-chunks.test.mjs` and `verify:route-chunks` as `node scripts/verify-route-chunks.mjs` in `frontend/package.json`; the verifier reads `frontend/dist/.vite/manifest.json`, recursively follows only `imports` for the initial bundle, and separately asserts the three route-group entries and dynamic import edges.

- [x] **Step 5: Run the verifier fixture tests**

Run: `npm test -- --run src/App.test.tsx` and `npm run test:route-chunks` from `frontend`.  
Expected: route tests pass; verifier fixture tests pass and prove both size-limit failures and graph-shape failures are rejected.

### Task 2: Extract shared and public route modules

**Files:**
- Create: `frontend/src/routes/PublicRoutes.tsx`
- Create: `frontend/src/routes/shared/SiteChrome.tsx`
- Create: `frontend/src/routes/shared/SeoMetadata.ts`
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/App.test.tsx`
- Test: `frontend/src/App.test.tsx`

**Interfaces:**
- `SiteChrome.tsx` exports the existing `SiteHeader` and `SiteFooter` components with unchanged props and behavior.
- `SeoMetadata.ts` exports the existing `useSeoMetadata(title: string, description: string, image?: string, type?: 'website' | 'product' | 'profile'): void` hook.
- `PublicRoutes.tsx` default-exports the public `<Routes>` tree, including the public fallback route.

- [x] **Step 1: Move shared chrome and metadata with focused behavior tests**

Move the current definitions without visual or behavioral edits. Add/retain tests for public header links, mobile menu behavior, footer links, and metadata update/restore on product and profile details. Confirm new imports do not reach producer or admin route modules.

- [x] **Step 2: Extract the public pages and route table**

Move public page components and public access/report pages from `App.tsx` into `PublicRoutes.tsx`; preserve the exact existing paths, route order, props, links, title and SEO calls. Keep producer/admin page implementations out of this module. Retain `App.tsx` temporarily as the existing route root until the other groups have equivalent modules.

- [x] **Step 3: Run the existing public and shared tests**

Run: `npm test -- --run src/App.test.tsx`.  
Expected: all prior public route assertions pass after any necessary async `findBy*` waits; assertions are not removed or weakened.

### Task 3: Extract producer/admin groups and install lazy dispatcher

**Files:**
- Create: `frontend/src/routes/ProducerRoutes.tsx`
- Create: `frontend/src/routes/AdminRoutes.tsx`
- Create: `frontend/src/routes/RouteGroupErrorBoundary.tsx`
- Create: `frontend/src/routes/RouteLoadingState.tsx`
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/App.css`
- Modify: `frontend/src/App.test.tsx`
- Test: `frontend/src/routes/RouteGroupErrorBoundary.test.tsx`

**Interfaces:**
- `ProducerRoutes.tsx` default-exports a route tree for the producer routes listed in the spec.
- `AdminRoutes.tsx` default-exports a route tree for all current admin routes and aliases.
- `RouteLoadingState.tsx` default-exports an accessible Spanish loading element with status text, existing spinner treatment, and reserved layout space.
- `RouteGroupErrorBoundary.tsx` exports a boundary that renders a Spanish error and a keyboard-accessible reload link whose `href` is the current `window.location.href`.
- `App.tsx` lazily imports the three route modules and wraps the selected group in the shared error boundary and `Suspense` fallback.

- [x] **Step 1: Extract producer routes and run producer tests**

Move producer screen implementations into `ProducerRoutes.tsx`, import only required shared modules, and preserve every current producer path and form. Run the existing producer tests and route cases in `App.test.tsx`; update only asynchronous wait mechanics required by lazy loading.

- [x] **Step 2: Extract admin routes and run admin tests**

Move admin screen implementations into `AdminRoutes.tsx`, including `/admin/moderacion`, `/admin/metricas`, assisted registration, and MFA recovery. Preserve aliases, permissions, navigation destinations, MFA behavior, query state and route parameters. Run the existing admin tests and route cases in `App.test.tsx`.

- [x] **Step 3: Add error-boundary regression tests**

Test a rejected lazy import: the boundary announces a Spanish error and presents a link with an accessible reload name and `href` equal to the current URL. Test that failure does not loop automatically and that the normal route path renders no error UI.

- [x] **Step 4: Replace the monolithic route root with lazy group dispatch**

In `App.tsx`, use `lazy(() => import('./routes/PublicRoutes'))`, corresponding imports for producer/admin, and select a group from `useLocation().pathname`: `/admin` or a path beginning `/admin/` selects admin; `/mi-panel`, `/mi-perfil`, `/verificar`, `/mis-productos`, or a path beginning `/mis-productos/` selects producer; every other pathname selects public. Do not normalize or rewrite the location. Wrap the selected group in `RouteGroupErrorBoundary` and `Suspense`.

- [x] **Step 5: Run complete frontend tests and design verification**

Run: `npm test -- --run` and `npm run verify:design` from `frontend`.  
Expected: all route and existing UI tests pass, and design verification reports zero errors and zero warnings.

### Task 4: Enforce production bundle and prove network behavior

**Files:**
- Modify: `frontend/package.json`
- Modify: `docs/uat/plan-piloto.md`
- Test: `frontend/scripts/verify-route-chunks.mjs`
- Test: production browser inspection against the built app

**Interfaces:**
- `npm run build` runs TypeScript, Vite production build, then `npm run verify:route-chunks`.
- The manifest verifier reports initial static closure minified/gzip totals and each route group's emitted chunk size; non-zero exit means acceptance failure.

- [x] **Step 1: Wire the build acceptance gate**

Update `build` so the verifier runs only after Vite emits `dist/.vite/manifest.json`. Print the measured public initial closure and separate public/producer/admin dynamic group sizes; fail above 400,000 minified bytes or 110,000 gzip bytes.

- [x] **Step 2: Run the production build and verify route graph/size**

Run: `npm run build` from `frontend`.  
Expected: TypeScript succeeds; Vite emits distinct dynamic producer/admin chunks; the public initial static closure contains no private group; the verifier prints totals at or below both approved limits.

- [ ] **Step 3: Inspect browser network and route behavior**

Serve `frontend/dist` with the project preview server and use a browser with cache disabled. On `/`, confirm neither private chunk is requested. Navigate to producer and then admin routes; confirm each chunk is requested on first entry only, route content renders, the URL/query state is retained, and revisiting a group does not refetch it. Repeat by loading a direct producer URL and a direct admin URL. Capture the measured build sizes and inspection outcome in `docs/uat/plan-piloto.md` without representing local inspection as staging acceptance.

- [ ] **Step 4: Exercise loading/error recovery and mobile layout**

Block one emitted route chunk in the browser, enter that group, and verify the accessible error/reload state. Restore the chunk and reload the same URL. Check one narrow mobile viewport, keyboard traversal, and reduced-motion mode; confirm loading and error do not create a blank screen, obscure the page, or cause a substantial layout jump.

## Self-review

- **Spec coverage:** the three groups, unchanged routes/query state/permissions/metadata, real deferred downloads, shared styles, accessible loading, chunk failure recovery, exact size limits, manifest evidence, browser network evidence, mobile, keyboard and reduced-motion checks all have a task.
- **Step clarity:** tests name routes and expected behaviors; source modules and exports are fixed; the build graph and size calculation are specified; no placeholder implementation steps remain.
- **Interface consistency:** only `App.tsx` imports the three default route modules dynamically; each exports one route element; the common header/footer and SEO hook have explicit named interfaces.
- **Review focus coverage:** deep links/search state (Tasks 1 and 4), static leakage (Tasks 1 and 4), failed chunks (Tasks 3 and 4), lazy async assertions (Tasks 2–3), and group reuse (Task 4) each have explicit evidence.
- **Proportion:** four tasks create measurable checkpoints for route contracts, extraction, recovery behavior, and production graph/network acceptance without specifying the internals of each screen.

