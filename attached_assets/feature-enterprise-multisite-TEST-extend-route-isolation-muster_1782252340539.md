# Enterprise Multi-Site — TEST — Extend the route isolation test to muster, contractors, RAMS, passes (+ drill-down role check)

**The route-level isolation test (`tests/site-isolation.routes.test.ts`) genuinely drives real `/api` routes and asserts cross-site isolation — but it only covers 7 features. It does NOT cover the four that historically leaked: muster/evacuation, contractors, RAMS, passes. Close those gaps so the test is a net with no holes. Test/dev environment only. Do not weaken any assertion to go green — red means a real leak.**

## Context
The test already has an `expectIsolated({ createPath, createBody, listPath, markerOf })` helper that creates a record at Site A and Site B via real endpoints and asserts each site cannot see the other's record ("cross-site leak!"). Reuse it. The session/site mechanism (`/api/__test__/session`, `/api/enterprise/active-site`) is already in place. Read each route file to get the exact request body and response shape — don't guess.

## What to add

### 1. Muster / evacuation — the life-safety one (do this first, custom test)
This is a READ-isolation test, not a simple CRUD create/list:
- Seed people on site at **Site A** and at **Site B** (e.g. a staff member or visitor checked in at each, via their real endpoints).
- As the **Site A** session, drive the real muster / roll-call endpoint(s) in `server/routes/emergency.ts` (activate/roll-call/accountability/Fire Marshal list — read the file for the exact paths).
- Assert the roll-call / accountability for Site A contains **only Site A's people** and **never** Site B's. Repeat with Site B active.
- A live muster must never aggregate sites. If Site B's people appear in Site A's muster, the test must FAIL.

### 2. Contractors — test the SITE-SCOPED records only (important nuance)
For enterprise customers, contractor **companies/workers are intentionally estate-wide (shared, `site_id` null)** — do NOT test those for isolation (they are *meant* to be visible across sites). Test the **per-site** contractor records instead: `contractor_visits` / `contractor_prebookings` and the per-site induction/clearance. Use the real contractor endpoints (`server/routes/contractors.ts`). Assert a visit/clearance created at Site A is invisible at Site B and vice versa.

### 3. RAMS
Use the real RAMS endpoints (`server/routes/rams.ts`) to create a `rams_documents` record at Site A and Site B; assert cross-site isolation via the list endpoint, with `expectIsolated`.

### 4. Passes / pre-bookings
Use the real passes / pre-booking resolution endpoints (`server/routes/passes.ts`) — create a pre-booking/pass at Site A and Site B and assert a Site A pass cannot be resolved/listed from the Site B context (passes.ts uses a fetch-then-reject pattern — the test must confirm a Site B session cannot retrieve a Site A pass).

### 5. Drill-down role scope (new, important)
Add a test for `GET /api/enterprise/sites/:id`:
- An **enterprise_admin** can open any site (200).
- An **area_manager** granted Area X gets **200** for a site in Area X and **403** for a site outside it.
- A **site_coordinator** gets 200 for their own site, 403 for any other.
Seed the grants via the real grant mechanism; fail-closed must hold.

### 6. Prove the new tests bite
Temporarily remove the site filter from ONE newly-covered route (e.g. the muster roll-call query), run the suite, confirm that test goes **RED**, then restore it. Put the before/after in the run output.

## Rules
- Drive the **real route handlers** with supertest — no helper-only shortcuts.
- Don't test estate-wide contractor companies for isolation (they're shared by design); only the per-site contractor records.
- The suite exits non-zero on any breach; keep it under `npm run test:site-isolation-routes`.

## Acceptance criteria
- The route isolation test now covers muster/evacuation, contractors (per-site records), RAMS, and passes, in addition to the existing 7 — all via real endpoints.
- The drill-down role test proves an area_manager/site_coordinator cannot open a site outside their scope (403), while an admin can (200).
- Deliberately un-scoping one of the new routes makes its test go red (proof it bites); restored after.
- The full suite passes on the real codebase.

## Do NOT
- Do not weaken an assertion to make it pass — a red test means a real leak; fix the route.
- Do not assert isolation on estate-wide contractor companies (that would be wrong — they're shared on purpose).
