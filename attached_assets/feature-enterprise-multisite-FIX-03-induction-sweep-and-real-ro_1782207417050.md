# Enterprise Multi-Site — FIX 03 — Close the last leaks + make the isolation test test the REAL routes

**Run against TEST customers only. This is the prompt that finally proves the site-isolation, instead of taking it on trust. Do BOTH parts and finish with the report in Part C. Part B is the important half — do not skip it.**

## Why this exists (verified in the code, 22 June 2026)
Earlier scoping work fixed `rams.ts`, `passes.ts` and the muster (`emergency.ts`), but two things remain:
1. **At least one route still leaks across sites.** `GET /api/induction/admin/tokens` in `server/routes/induction.ts` (around line 1185) lists induction tokens filtered by **`customerId` only** — `.where(eq(inductionTokens.customerId, customerId))` — with **no site filter**. For an enterprise customer, this returns induction records from every site, not just the user's active site. The same "customer-only filter, no site scope" pattern very likely exists on other admin/list endpoints that weren't checked.
2. **The isolation test still doesn't test the real routes.** `site-isolation-test-script.ts` (~1,140 lines) is thorough but only exercises the scope **helpers** (`scopedWhere` / `withSiteId`) directly — it invokes **zero** real route handlers. That's exactly why the induction leak went unnoticed: a test that never calls the routes cannot catch a route that bypasses the helper. "The test passes" currently does **not** mean the app is safe.

## PART A — Close the remaining leaks (induction + full sweep)
1. **Fix the induction admin list** (`/api/induction/admin/tokens`): add `scopedWhere(siteContext, inductionTokens)` to the query alongside the existing customer filter, so it returns only the active site's records (and respects an enterprise user's allowed-site scope).
2. **Sweep the entire `server/routes/` directory for the same pattern.** Find every read of a **site-scoped table** (the ~34 tables given a `site_id` in migration `20260622_065`) where the query filters by `customerId` only — or has no site filter — and is **not** going through `scopedWhere`. Fix each:
   - **List / multi-row reads** → add `scopedWhere(siteContext, table)` to the WHERE clause.
   - **Single-record fetches by id / token / qr** → either add `scopedWhere`, or fetch then reject if the record's `site_id` isn't in the caller's scope (the safe pattern already used in `passes.ts`). Either is acceptable, but the site MUST be enforced.
   - Pay attention to **admin list endpoints, dashboards, dropdowns, search, and CSV/PDF exports** — these are the usual places a `customerId`-only filter hides.
3. Output the full list of files and endpoints changed.

## PART B — Rebuild the isolation test so it drives the REAL routes (do not skip)
Rewrite `site-isolation-test-script.ts` (or add a companion) so it proves the **actual HTTP endpoints** isolate, not just the helpers:
- Stand up the real Express app (use the app's existing `registerRoutes(app)` wiring; drive it with **supertest** or by issuing real HTTP requests to the running server).
- Use a **real authenticated session whose active site is Site A** (and a second context for Site B) — the same session/site mechanism the app uses in production, so the routes resolve `siteContext` exactly as they do live.
- For each site-scoped feature, **call the real endpoints**: create data at Site A via its endpoint, then list via the endpoint with active site = B and assert **none** of A's data appears — and vice versa. Cover, at minimum, the endpoints that were broken or missed: **induction admin tokens, muster/evacuation, RAMS, passes**, plus visitors, staff, contractors, PPM, FRA, audits, compliance certs, meeting rooms.
- **Prove the test bites:** temporarily remove the site filter from one route, confirm the test goes RED, then restore it. A test that can't fail is worthless.
- Keep the existing helper-level checks as a second layer, but the **route-level checks are the gate**.
- Exit non-zero on any breach; expose it as `npm run test:site-isolation`.

## PART C — Report back (required)
A short written summary I can read without opening the code:
- Part A: every endpoint/file changed and the table it now scopes.
- Part B: the test now drives real routes (list the endpoints it hits), the proof it bites (the deliberate-break result), and the final pass/fail.
- One-line verdict: **is the enterprise site-isolation now proven safe to demo across all routes — yes or no?**

## Rules
- Test customers only; credentials from env; fail closed; **single-site customers must stay identical** in behaviour.
- Do not weaken or narrow a test to make it green — red means a real leak; fix the route.
- Do not start any Phase 4 or 5 feature here — this is isolation hardening only.

## Acceptance criteria
- The induction admin list and every other offending endpoint found in the sweep are site-scoped.
- The isolation test drives the **real route handlers**, covers the previously-missed endpoints, demonstrably fails when a route is un-scoped, and passes when they're all fixed.
- Single-site regression passes (a non-enterprise customer sees no change).
- Part C report delivered with the yes/no verdict.
