# Enterprise Multi-Site — FIX 02 — Complete the site-scoping coverage + harden the isolation test

**Run after FIX-01. This closes the remaining site-scoping gaps and fixes the test so it actually catches leaks instead of giving false reassurance.**

## The problem (confirmed in the code)
The site-scoping guard (`server/siteScope.ts`) is wired into ~14 route files but **several routes that read/write site-scoped tables still bypass it**, so they leak across sites for enterprise customers. Confirmed offenders (audit for more):
- `server/routes/induction.ts` — `induction_tokens`, `members`, `departments` not scoped.
- `server/routes/analytics.ts` — `members`, `departments` not scoped (cross-site dashboard/analytics counts).
- `server/routes/imports.ts` — bulk import of staff/visitors/contractors/members **does not stamp `site_id`** (imported rows land with no/!active site).
- `server/routes/rams.ts` — `incident_reports`, `pre_bookings` not scoped.
- `server/routes/passes.ts` — `pre_bookings` not scoped.
- `server/routes/reports.ts` — `departments` not scoped.

Also: **the isolation test (`site-isolation-test-script.ts`) exercises the helper functions (`scopedWhere` / `withSiteId`) directly, not the real route handlers.** That means a route that bypasses the helper (like the ones above and the muster bug in FIX-01) can leak while the test still passes. The test gives false confidence.

## What to fix

### 1. Complete the scoping coverage (the audit)
Go through **every** route file under `server/routes/` and, for every read or write of a **site-scoped table** (the ~34 tables given a `site_id` in migration 065), make it go through the `siteScope.ts` helper — `scopedWhere` on reads, `withSiteId` on writes — exactly as `visitors.ts` / `staff.ts` already do. Start with the confirmed offenders above, then sweep the rest. Produce a short list of every file changed and every table now scoped.

Special cases:
- **Bulk import (`imports.ts`):** every imported row must be stamped with the active `site_id`.
- **Public / token endpoints** (induction, audit mobile, self-mark-safe, contractor QR, passes): the created record must carry the originating site's `site_id` (link carries/derives it), failing closed if it can't be resolved for an enterprise customer.
- **Analytics / reports / dashboard counts:** must respect the caller's site/area scope, not count the whole estate.

### 2. Harden the isolation test so it tests real routes
Upgrade `site-isolation-test-script.ts` so it proves the **actual endpoints** isolate, not just the helpers:
- For each site-scoped feature, drive the **real route handler / HTTP endpoint** (authenticated as a user whose active site is A), create data, then assert that listing as active-site-B returns none of it — and vice versa.
- Add explicit cases for the previously-missed areas: **muster/evacuation** (per FIX-01), induction, analytics, imports, RAMS, passes, reports.
- A route that bypasses the helper must make the test **FAIL** (prove this by temporarily un-scoping one route and seeing red).
- Keep the existing helper-level checks too. Exit non-zero on any breach so it can gate a merge.

### 3. Write-path guarantee
Confirm that for an enterprise customer, **no insert into a site-scoped table can land without a `site_id`** (default-site fallback for single-site customers only). Add a test for this.

## Rules
- Fail closed everywhere; non-enterprise customers unaffected (single default site → identical behaviour).
- Credentials from env only; run against test/dev customers only.
- One central helper remains the single source of truth — do not scatter ad-hoc `site_id` filters outside it.

## Acceptance criteria
- Every site-scoped table is read/written only through the scope helper across all routes (list of changed files provided).
- The hardened isolation test drives real endpoints, covers the previously-missed routes, and passes — and demonstrably FAILS if any route is un-scoped.
- Bulk imports and public/token flows stamp the correct `site_id`.
- ⛔ **This is the real Phase 1 gate. Treat the build's site isolation as unproven until this hardened test passes.**

## Do NOT
- Do not weaken a test to make it green — a red test means a real leak; fix the route.
- Do not leave any site-scoped table accessible outside the helper.
