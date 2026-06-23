# Enterprise Multi-Site — FINAL — Build check, REAL-ROUTE isolation test, and UAT

**This is the final sign-off. Three parts. Part 2 is the keystone and has been asked for twice before and skipped both times — it is the PRIMARY acceptance criterion of this prompt. Test customers only. Single-site customers must stay unaffected. Finish with the report in Part 4.**

---

## PART 1 — Build & typecheck
- Run the production build / TypeScript check (`npm run build`, and `tsc --noEmit` or the project's `check` script).
- Fix every error introduced by the enterprise multi-site work. Report any pre-existing errors separately.
- Output: clean build, and a list of anything fixed.

---

## PART 2 — Rebuild the isolation test to drive the REAL ROUTES (the keystone)

**The problem:** `site-isolation-test-script.ts` currently calls **zero** API endpoints — it only exercises the scope helper functions (`scopedWhere` / `withSiteId`). That proves the helpers work but **cannot catch a route that bypasses them** (e.g. the induction token route does its own custom site-filtering that the current test never touches). A green test today does NOT mean the app is leak-free.

**What to build — a test that hits the real endpoints.** Everything needed is already installed:
- `supertest` and `vitest` are dependencies. The Express app is created in `server/index.ts`. Export the app (or add a small `buildApp()` that does `express()` + `registerRoutes(app)`) so a test can drive it with supertest.
- Authenticate a **real session** whose `customerId` = an enterprise test customer and whose `activeSiteId` = **Site A** — using the app's normal login/session mechanism (`req.session.customerId` / `userId` / `activeSiteId`, see `server/auth.ts`). Provide a second context for **Site B**. (If a documented dev/test session helper is needed, add one that only works in test mode.)
- **For each site-scoped feature, call the real `/api/...` endpoint** (not the helper): as the Site-A session, create a record via its endpoint; then as the Site-B session, list via the endpoint and assert **none** of A's records appear — and vice versa.
- **Mandatory coverage** (these are the fragile/previously-broken ones — they MUST be driven through their real routes): **induction admin tokens** (`/api/induction/admin/tokens`), **muster/evacuation** (`/api/emergency/...` roll-call + Fire Marshal), **RAMS**, **passes**, **contractors**, **visitors**, **staff**, and the **enterprise compliance** endpoints. Add the rest of the site-scoped tables too.
- **Prove the test bites:** temporarily remove the site filter from ONE route, confirm the test goes RED, then restore it. Include the before/after result in the report.
- Keep the existing helper-level checks as a secondary layer, but the **route-level checks are the gate**.
- Wire it to `npm run test:site-isolation`; exit non-zero on any breach.

**Explicit failure condition:** a test that only calls `scopedWhere` / `withSiteId` and does **not** issue real HTTP requests to `/api/...` endpoints does **NOT** satisfy Part 2 and means this prompt is not complete. The test must make real authenticated requests against the routes.

Then **run it** and report the result.

---

## PART 3 — UAT (run these against a 2-site enterprise test customer; record pass/fail for each)
Seed/confirm one **enterprise** test customer with **Site A** and **Site B** (each with its own staff/visitors/contractors), and one normal **single-site** customer. Then:

1. **Create site** — add a second site; it appears in the list and on the dashboard.
2. **Site switcher** — switching site changes what every page shows; a one-site user sees no switcher.
3. **Per-site user (FIX-04)** — create a site_coordinator for Site A from People & Access; they receive a login code; logging in as them lands them in Site A only.
4. **Data isolation** — visitor/contractor/staff/induction created at Site A is invisible at Site B, and vice versa.
5. **Muster per-site** — activate an evacuation at Site A; roll-call, mark-safe, missing list, CSV and Fire Marshal URL show **only Site A** people.
6. **Roles** — an Area Manager cannot see/act outside their area (check via the API directly, not just the UI).
7. **Group Standards** — set an induction/required-doc standard at HQ; it applies to all sites; a site override works.
8. **Shared contractor** — a contractor onboarded once is bookable at another site without re-entering company compliance.
9. **Reports** — generate a Portfolio Compliance Snapshot PDF; it matches the dashboard figures.
10. **Single-site regression** — the normal customer shows no Enterprise menu, no switcher, and behaves exactly as before.

---

## PART 4 — REPORT BACK (required)
A short written summary I can read without opening the code:
- Part 1: build clean? what was fixed.
- Part 2: the **list of real `/api` endpoints the test now drives**, the proof-it-bites result (deliberate break → red → restored), and the final pass/fail. If the test still doesn't hit real routes, say so plainly — do not report Part 2 as done.
- Part 3: the UAT pass/fail table.
- One-line verdict: **is enterprise multi-site site-isolation now proven safe to demo across all routes — yes or no?**

## Rules
- Test customers only; fail closed; single-site customers unchanged; en-GB.
- Do not weaken or narrow any test to make it green — red means a real leak; fix the route.
- Do not start new features here — this is verification only.

## Acceptance criteria
- Build/typecheck clean.
- The isolation test makes **real authenticated HTTP requests** to the routes, covers the mandatory list, demonstrably fails when a route is un-scoped, and passes when all are fixed.
- The UAT table is complete with the single-site regression passing.
- Part 4 report delivered with the yes/no verdict.
