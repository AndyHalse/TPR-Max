# PRIORITY 01 🔴 — Make PPM fully site-aware (multi-site safe)

**Module:** PPM / planned maintenance (`server/routes/ppm.ts` + PPM tables)
**Type:** Bug fix — multi-site data isolation (security + correctness)
**Needs `npm run db:push`?** **YES** — add `site_id` to any PPM table missing it,
plus an `is_demo` flag on demo-created rows.
**Supersedes** the earlier `bugfix-ppm-full-site-scoping-multisite-production-june2026.md`
(this is the consolidated, self-checking version — use this one).

---

## Why this is the top priority
Cowiesburn is a facilities-management client; PPM (planned maintenance) is the
heart of what they do. Today PPM is only **partly** site-aware: a few endpoints
scope to the active site but most don’t. On a multi-site (enterprise) customer
this means one site’s assets, work orders and schedules show up mixed with
another’s, and the demo loader produces nonsense counts (e.g. “41 schedules /
0 assets”). For a single-site customer it’s invisible, which is why it slipped
through. **This must be fixed and proven before any Cowiesburn pilot.**

The root cause is the recurring one: site-scoping was applied **per-endpoint, not
systematically**. So fix it systematically.

## The isolation rules (already exist — use them, don’t reinvent)
`server/siteScope.ts` provides:
- `getScopedDb(req)` → `{ db, siteId, siteContext }`
- `scopedWhere(siteContext, table)` → a `WHERE site_id …` condition (returns
  `undefined` for non-enterprise, so it’s a safe no-op there)
- `withSiteId(siteId, values)` → stamps `site_id` on an insert/update

Every **read** of a site-scoped PPM table must include `scopedWhere(...)` in its
`and(...)`. Every **write** must wrap its values in `withSiteId(siteId, ...)`.
Fail closed via `SiteContextError` → 403.

---

## Step 1 — Find every PPM table and every place it’s touched (systematic sweep)
Do not rely on line numbers. In `server/routes/ppm.ts` (and any PPM helper/
service it calls), enumerate every PPM-related table — at minimum:
`ppm_assets`, `ppm_work_orders`, `ppm_schedules`, plus asset groups, work-order
documents/attachments, annual-planner data, dashboard/count queries, exports,
copy/duplicate operations, the scheduled-task crons, and the demo load/delete
routes.

For **each** table, grep for every `.select(`, `.insert(`, `.update(`,
`.delete(` that references it and list them. This list is the work.

## Step 2 — Schema: every site-scoped PPM table needs `site_id`
Some PPM tables (e.g. `ppm_schedules`, asset groups, work-order docs) do **not**
currently carry `site_id`. Add a nullable `site_id` column to every PPM table
that holds site-specific data, in `server/isolatedSchema.ts`, and add those
tables to the documented site-scoped list in `server/siteScope.ts` (the header
comment + anywhere the set is enforced). Also add an **`is_demo boolean not null
default false`** column to every PPM table the demo loader writes to.
→ This requires **`npm run db:push`**.

Backfill: for existing rows on a single-site customer, set `site_id` to that
customer’s default site (the same default `getScopedDb` resolves), so nothing
disappears for current single-site users.

## Step 3 — Scope every read
Convert every PPM **read** of a site-scoped table to go through `getScopedDb(req)`
and add `scopedWhere(siteContext, table)` to its `where(and(...))`. This includes
the easy-to-miss ones: dashboard counts/aggregates, the annual planner, exports/
downloads, “open work order by id” (must 404/403 if it’s another site’s id, not
just render it), and any cron that iterates assets/work orders.

## Step 4 — Scope every write
Convert every PPM **insert/update** to stamp the active site via
`withSiteId(siteId, values)`. Copy/duplicate operations must stamp the *target*
site. Crons that create work orders from schedules must carry the schedule’s
`site_id` onto the new work order.

## Step 5 — Fix the demo data load/delete (Andy’s explicit ask)
- **Load** (`POST /api/ppm/demo-data`): every demo row inserted must be stamped
  with the caller’s active `site_id` (via `withSiteId`) **and** `is_demo = true`.
- **Delete** (`DELETE /api/ppm/demo-data`): must delete **only** `is_demo = true`
  rows, **scoped to the caller’s site(s)** — it must never touch real data or
  other sites. After deleting, run a **verification pass** that re-counts every
  PPM table for `is_demo = true` within scope and confirms zero remain; return
  that confirmation in the response so the UI can show “demo data fully cleared”.
- Load and delete must be **symmetric** (delete removes exactly what load
  created).

## Step 6 — Extend the route isolation test (this is part of the fix)
In `tests/site-isolation.routes.test.ts` add real-route cases proving PPM is
walled:
- As a Site-A user: create a PPM asset, a schedule and a work order.
- As a Site-B user: `GET` the PPM asset list / work-order list / schedule list →
  must **not** contain Site A’s rows.
- As a Site-B user: `GET` Site A’s work order **by id** → **403/404**, not the
  record.
- Demo load as Site A then `GET` as Site B → none of Site A’s demo rows appear.
- Demo delete as Site A removes only Site A’s `is_demo` rows.

## Acceptance criteria
- Every site-scoped PPM read uses `scopedWhere`; every write uses `withSiteId`.
  (Prove it: a grep of `ppm.ts` shows no remaining bare
  `eq(table.customerId, …)`-only filter on a site-scoped PPM table.)
- Multi-site customer: each site sees only its own PPM; “by id” cross-site access
  is refused.
- Single-site / non-enterprise customer: **behaviour unchanged**, nothing hidden.
- Demo load/delete are site-scoped, demo-only, symmetric, with a clean
  verification pass.
- New PPM isolation tests pass and the suite is green.

## What Andy verifies in Replit afterwards
`npm run db:push` ran cleanly; on a 2-site test customer, log in as a
site-coordinator and confirm you only see that site’s PPM; run demo load then
delete and confirm counts are sane and fully cleared; confirm a single-site
customer’s existing PPM still shows.
