# Bugfix — Enterprise dashboard "People On-Site" counts ignore the active site

## The bug (one line)
On an enterprise (multi-site) customer, the Dashboard "People On-Site" cards
(Visitors / Staff / Contractors / Total) show the **same numbers on every site**,
because the `/api/stats` endpoint counts people across the **whole customer
database** and never filters by the active site.

## Root cause (verified in code — do not re-investigate, just fix)
- `client/src/pages/Dashboard.tsx` reads the four cards from `GET /api/stats`.
- `server/routes/analytics.ts` (`app.get("/api/stats", …)`) resolves the site
  context (`analyticsSiteCtx`) and **correctly** scopes the *members* count with
  `scopedWhere(analyticsSiteCtx, isolatedSchema.members)` — but then gets
  visitors, staff, contractors, todayCheckins and totalStaff from
  `databaseService.getStats(context)`, which is passed only the **customer**
  context, not the site context.
- `server/databaseService.ts` → `getStats()` queries `visitors`, `staff`,
  `contractorWorkers` filtered **only** by `isCheckedIn = true` / `isActive = true`
  with **no `site_id` filter**. So it returns estate-wide totals.
- Net effect: `membersOnSite` is per-site but the other four counts are
  estate-wide → the endpoint is **half-scoped and inconsistent** (this is the
  recurring enterprise bug class: correct in the helper, bypassed at one call site).

This is why every site shows Visitors 1 / Staff 8 / Contractors 2 / Total 11.

## Important context — the Muster page is NOT broken
`GET /api/muster` (`server/routes/emergency.ts`) already scopes every people table
through `scopedWhere`. It shows 0 at Gateway 1 because — per migration 065 — every
**pre-existing** person was back-filled onto the default **Primary Site (SITE-001)**.
So the 11 people genuinely all live on Primary Site right now; muster is the only
screen telling the truth. After this fix, the Dashboard will **agree with muster**:
Primary Site will show the 11, and other sites will show 0 until people actually
check in there. **Do not "fix" muster and do not move/reassign anyone's `site_id`.**

## Scope of this change
Backend only. **No schema change — do NOT run `npm run db:push`.**
Applies identically to Central (Cowiesburn) and Independent (CPI) enterprise
customers — same scoping engine, so one fix covers both. Single-site
(non-enterprise) customers are unaffected: `scopedWhere` returns `undefined` for
them, so counts are unchanged.

## Fix

### 1. Make `getStats` site-aware (`server/databaseService.ts`)
- Add an **optional** parameter so existing callers (report emails, induction
  metrics) keep their current whole-customer behaviour:

  ```ts
  import { scopedWhere, type SiteContext } from "./siteScope";

  async getStats(
    context: CustomerContext,
    siteContext?: SiteContext,
  ): Promise<{ … same shape … }> {
    const db = await customerDbService.getCustomerDatabase(context.customerId);
    const siteFilter = (t: { siteId: any }) =>
      siteContext ? scopedWhere(siteContext, t) : undefined;
    …
  }
  ```
- Add `siteFilter(...)` into the `.where(and(...))` of **every** count in
  `getStats`: current visitors, today's check-ins, staff on site, total staff,
  and contractors on site. `and(eq(...), undefined)` is safe — Drizzle ignores
  the `undefined`.
  - current visitors → `and(eq(visitors.isCheckedIn, true), siteFilter(visitors))`
  - today check-ins → `and(gte(...), lt(...), siteFilter(visitors))`
  - staff on site → `and(eq(staff.isCheckedIn, true), siteFilter(staff))`
  - total staff → `and(eq(staff.isActive, true), siteFilter(staff))`
  - contractors on site → `and(eq(contractorWorkers.isCheckedIn, true), siteFilter(contractorWorkers))`

### 2. Pass the site context from the route (`server/routes/analytics.ts`)
- The route already has `analyticsSiteCtx` from `getScopedDb(req)`. Change:
  ```ts
  const stats = await databaseService.getStats(context);
  ```
  to:
  ```ts
  const stats = await databaseService.getStats(context, analyticsSiteCtx);
  ```
- Leave the existing members scoping and `totalPeopleOnSite` maths as-is — once
  the four sub-counts are scoped, the total becomes correct automatically.

### 3. Do NOT change the other callers
`getStats` is also called in `server/routes/reports.ts` and
`server/routes/induction.ts`. Leave those calls unchanged (no second arg) so they
keep returning whole-customer figures — that is their intended behaviour.

## Regression test — must bite (`tests/site-isolation.routes.test.ts`)
Add a real supertest case that drives the live route:
- Seed Site A with (say) 2 checked-in staff + 1 checked-in visitor; Site B with 0.
- As a Site-A user (`activeSiteId = A`), `GET /api/stats` → `staffOnSite === 2`,
  `currentVisitors === 1`, `totalPeopleOnSite === 3`.
- As a Site-B user (`activeSiteId = B`), `GET /api/stats` → all those counts `=== 0`.
- **Prove it bites:** temporarily revert step 2 (call `getStats(context)` with no
  site context) → the Site-B assertion must go RED → restore the fix → GREEN.
- Keep the test hitting `/api/stats` via supertest, not `getStats()` directly.

## Acceptance criteria
- [ ] On an enterprise customer, switching the Active Site changes the four
      Dashboard cards to that site's real numbers.
- [ ] Dashboard "People On-Site" now **matches** the Muster totals for the same
      site (both scoped identically).
- [ ] Single-site (non-enterprise) customers: Dashboard counts unchanged.
- [ ] `reports.ts` / `induction.ts` stats callers unchanged.
- [ ] New `/api/stats` isolation test passes and demonstrably fails when the
      site arg is removed.
- [ ] No `db:push` was run.

## After deploy — runtime proof (Andy)
1. `npm run test:site-isolation-routes` → all green (incl. the new `/api/stats` case).
2. Log in as the enterprise customer, switch to **Primary Site** → Dashboard shows
   the 11; open Muster on Primary Site → also shows the 11. They agree.
3. Switch to **Gateway 1** → Dashboard and Muster both show 0.
4. Check one person in at Gateway 1 → both Dashboard and Muster tick to 1.

## Note (data, not code)
Because migration 065 parked all legacy people on Primary Site, a multi-site demo
will look empty on the other sites until you check people in there. That is
correct behaviour, not a bug — decide separately whether you want some demo
people distributed across sites for sales walkthroughs.
