---
name: contractor_workers siteId stamping gap
description: Why Enterprise Dashboard/Muster contractor counts can silently show 0 despite checked-in workers, and how the fix + backfill strategy works.
---

## The bug

`contractor_workers.siteId` was never stamped on insert in the 3 creation origins
(admin, portal, prebooking) — unlike other site-scoped tables (`imports.ts`,
`ppm.ts`) which correctly call `withSiteId()`. For Enterprise customers,
`scopedWhere()` filters strictly on `siteId = activeSiteId`, so any worker with
`siteId = null` silently drops out of every site-scoped read: Dashboard
"People On-Site" stats, Emergency Muster, and site-scoped worker lists — even
while `isCheckedIn = true`. Standalone (non-enterprise) customers were
unaffected because `scopedWhere()` returns undefined when `!ctx.isEnterprise`.

**Why:** `withSiteId()` stamping is opt-in per insert call, not enforced by the
schema or a shared insert helper — easy to miss on any table with a `siteId`
column.

## The fix (3 layers, all required together)

1. **Stamp at creation** — pass the caller's resolved `siteId` (from
   `getScopedDb(req)`) into `WorkerServiceContext` and apply `withSiteId()` in
   all 3 `createWorker` insert paths.
2. **Self-heal at check-in** — `checkInWorker` re-stamps `siteId` to wherever
   the worker is physically checking in (`ctx.siteId`), since that's the only
   moment true physical presence is known. This corrects workers created
   before the fix, or via any path that couldn't resolve a site at creation
   time (e.g. contractor portal, which uses JWT bearer auth with no session
   and can't resolve `siteId` at all).
3. **Backfill already-broken records** — for existing checked-in workers with
   `siteId IS NULL`, don't guess: pull the correct site from each worker's
   most recent `contractor_visits` row (`ORDER BY checked_in_at DESC`), since
   visit inserts already correctly stamp `siteId` via `withSiteId()`. Added as
   a startup migration in `customerDatabase.ts` alongside the other
   `ensure*Columns` per-schema migrations.

**How to apply:** Any time a site-scoped table shows suspiciously-zero counts
for Enterprise customers despite data existing, check whether every insert
path for that table calls `withSiteId()` — grep for `.insert(isolatedSchema.<table>)`
and confirm each one wraps its values. If some records are already broken in
production, look for a sibling table with correct `siteId` history (visits,
audit logs, etc.) to backfill from rather than leaving them permanently
null — a per-schema `try/catch` UPDATE in the customerDatabase.ts migration
block is the established pattern.
