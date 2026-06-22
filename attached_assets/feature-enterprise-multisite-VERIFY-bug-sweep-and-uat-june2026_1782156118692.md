# Enterprise Multi-Site — VERIFY, BUG-SWEEP & UAT (finish the foundation and prove it's safe)

**This is not a new-feature prompt. Its job is to close the remaining site-isolation holes, make the test actually catch leaks, sweep for bugs, run UAT, and REPORT BACK a clear pass/fail. Run against TEST customers only — never live data. Do every part and finish with the written report in Part E.**

## Background (verified in the code, 22 June 2026)
The enterprise multi-site build (Phases 0–3) is applied and the muster/evacuation leak has been fixed (`emergency.ts` is now site-scoped). But a verification audit found gaps that must be closed before this can be trusted or demoed:
- `server/routes/induction.ts`, `server/routes/rams.ts`, `server/routes/passes.ts` still read/write site-scoped tables (`induction_tokens`, `pre_bookings`, `incident_reports`) **without** the site filter — they bypass `server/siteScope.ts`.
- `site-isolation-test-script.ts` only exercises the scope **helpers** (`scopedWhere` / `withSiteId`), not the real route handlers — so it passes green even while those three routes leak. The test gives false confidence.

---

## PART A — Finish the site-scoping coverage
1. Audit **every** file in `server/routes/` and find every read/write of a **site-scoped table** (the ~34 tables given a `site_id` in migration `20260622_065`). For each, route it through `server/siteScope.ts` (`scopedWhere` on reads, `withSiteId` on writes) exactly as `visitors.ts` / `staff.ts` / `emergency.ts` already do.
2. Confirmed offenders to fix first: **`induction.ts`** (induction_tokens; also members/departments where queried), **`rams.ts`** (pre_bookings, incident_reports), **`passes.ts`** (pre_bookings). Then sweep the rest.
3. **Public / token endpoints** (induction acceptance, self-mark-safe, mobile audit, contractor QR, passes): the record created must carry the originating site's `site_id`, resolved from the link; fail closed for an enterprise customer if it can't be resolved.
4. Output a list of every file changed and every table now scoped.

## PART B — Make the isolation test test the REAL routes
Rewrite/extend `site-isolation-test-script.ts` so it proves the **actual endpoints** isolate, not just the helpers:
- Drive the real route handlers / authenticated HTTP endpoints as a user whose active site is A; create data; then, as active-site-B, assert none of A's data is returned — and vice versa.
- Cover every site-scoped feature, explicitly including the previously-broken ones: **muster/evacuation, induction, RAMS, passes**, plus visitors/staff/contractors/PPM/FRA/audits/compliance certs/etc.
- Prove the test bites: temporarily un-scope one route, confirm the test goes RED, then restore.
- Add a write-path test: for an enterprise customer, no insert into a site-scoped table may land without a `site_id`.
- Exit non-zero on any breach. Add an npm script to run it.

## PART C — Bug-sweep
- Run the TypeScript build / `tsc` and fix every type error introduced by the enterprise work; report any pre-existing errors found.
- Review the core enterprise files for correctness bugs and fix them: `siteScope.ts`, `enterpriseRoles.ts` (grant → allowlist resolution; fail-closed; an Area Manager can never widen scope), `complianceEngine.ts` (score maths matches the spec; empty categories excluded; idempotent daily job; no cross-customer or cross-scope bleed), `enterpriseSites.ts`, `enterpriseCompliance.ts`, `SiteSwitcher.tsx`, `EnterpriseSites.tsx`, `EnterpriseAccess.tsx`, `EnterpriseCompliance.tsx`.
- Check the migrations (`siteMigrations.ts` 065–068) are idempotent and that the backfill left no site-scoped row with a NULL `site_id`.
- List every bug found and whether it was fixed.

## PART D — UAT (run these and record pass/fail for each)
Set up **two test customers**: (1) an **enterprise** customer with **2 sites** (Site A, Site B), each with its own staff/visitors/contractors/zones; (2) a normal **single-site** customer. Then run:

1. **Site CRUD** — enterprise admin creates, edits, archives a site; archive is soft (no hard delete); actions are audited.
2. **Site switcher** — switching site changes what every site-scoped page shows; a user with one site sees no switcher.
3. **Data isolation per feature** — create a visitor/contractor/staff/PPM/RAMS/induction/pass/incident at Site A; confirm it is invisible at Site B, and vice versa.
4. **Muster is per-site** — activate an evacuation at Site A; roll-call, zones, mark-safe, missing list, CSV export and Fire Marshal URL show **only Site A people**. Repeat for B.
5. **Kiosk binding** — a kiosk bound to Site A only checks people into Site A.
6. **Roles** — an **Area Manager** for one area cannot see/act on another area (test via UI **and** direct API call); a **Site Coordinator** is confined to their site; the last enterprise admin can't be removed.
7. **Compliance dashboard scope** — estate score for admin; area-only for area manager; site-only for coordinator; numbers match the engine; a doc expired yesterday raises a critical alert.
8. **Single-site customer unaffected** — every page behaves exactly as before; no sites/switcher/enterprise UI appears.
9. **Write guarantee** — every record created in enterprise mode lands with the correct `site_id` (spot-check the DB).

## PART E — REPORT BACK (required)
Produce a clear written summary I can read without opening the code:
- ✅ what passed, ❌ what failed, 🔧 what was fixed in this run, ⏳ what's still open.
- The Part A list of files/tables scoped, the Part B test result (and proof it bites), the Part C bug list, and the Part D UAT pass/fail table.
- A one-line verdict: **is the site-isolation foundation now safe to demo, yes or no?**

## Rules
- Test customers only; credentials from env; fail closed everywhere; single-site customers must stay identical.
- Do not weaken a test to make it green — red means a real leak; fix the route.
- Do **not** start Phase 4 or 5 features in this prompt — this is verification and hardening only.

## Acceptance criteria
- Every site-scoped table is accessed only through the scope helper across all routes.
- The hardened test drives real endpoints, covers muster/induction/RAMS/passes, passes, and demonstrably fails if a route is un-scoped.
- TypeScript builds clean; the bug list is addressed.
- The Part D UAT table is complete with the single-site regression passing.
- Part E report delivered with the yes/no verdict.
