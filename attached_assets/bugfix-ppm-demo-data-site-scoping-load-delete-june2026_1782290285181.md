# Bugfix — PPM "Load Demo Data" / "Delete All Demo Data": site-scoping inconsistency (false positives)

**The PPM demo-data load and delete are inconsistent and not site-aware, giving false positives (e.g. "41 Active Schedules" but "0 Active Assets"). Fix the scoping so load populates the active site visibly and delete cleanly removes ONLY the demo data for the right scope. Works for normal single-site AND enterprise multi-site customers. Test customers only. NEEDS `npm run db:push` (adds an `is_demo` flag).**

## Root cause (verified in `server/routes/ppm.ts`, 23 June 2026)
1. **`ppm_schedules` is not site-scoped** while `ppm_assets` and `ppm_work_orders` are: schedules are read with no `scopedWhere` (line ~325) and inserted with no `withSiteId` (line ~347). So schedules show regardless of the active site; assets/work-orders show only for the active site.
2. **The demo loader (`POST /api/ppm/demo-data`, ~line 1661) inserts demo records with no `site_id`.** On an enterprise customer the scoped asset view excludes NULL-site rows → assets are invisible at every site (0), while the unscoped schedule view still shows all of them (41). That is the exact false positive.
3. **The demo delete (`DELETE /api/ppm/demo-data`, ~line 2212) wipes every PPM table with no `where`** — across all sites AND with no demo-only filter, so it would delete real PPM data, not just demo. It's also hard-blocked if any completed work order exists.

## What to fix

### 1. Make ALL site-scoped PPM tables consistently scoped (the core fix)
Audit every query in `server/routes/ppm.ts`. For every **site-scoped** table — `ppm_assets`, `ppm_schedules`, `ppm_work_orders` (and `ppm_asset_groups` if it's site-level) — reads MUST use `scopedWhere(siteContext, table)` and writes MUST use `withSiteId(siteId, …)`, exactly as `ppm_assets`/`ppm_work_orders` already do. Fix `ppm_schedules` read (~325) and insert (~347) and any others found. (Customer-level config like `ppm_templates` stays customer-scoped — leave those.)

### 2. Demo LOAD must stamp the active site
In `POST /api/ppm/demo-data`, resolve the active site via `getScopedDb(req)` / `siteContext` and stamp **`withSiteId(siteId, …)` on every seeded record** (assets, schedules, work orders, asset groups). Also set the new `is_demo = true` flag on every seeded row.
- Enterprise customer → demo loads to the **active site** (visible immediately).
- Single-site customer → loads to the **default site** (unchanged behaviour).
- After load, the dashboard must show assets, schedules, and work orders all populated and consistent for the active site — no 41-vs-0 mismatch.

### 3. Add an `is_demo` flag (so delete is precise and safe)
Add `is_demo boolean NOT NULL default false` to the seeded PPM tables (assets, schedules, work orders, asset groups) via the migration runner. The seeder sets it true. (No-db:push alternative if preferred: match the known demo `assetRef`s / demo contractor names the seeder already uses — but the flag is cleaner and unambiguous.)

### 4. Demo DELETE must clear ONLY demo data, for the right scope
Rewrite `DELETE /api/ppm/demo-data` to delete **only rows where `is_demo = true`**, scoped to the caller's allowed sites (resolve via the enterprise grant helper):
- **enterprise_admin** → demo rows across all their sites.
- **area_manager / site_coordinator** → demo rows for their sites only.
- **single-site customer** → their default site's demo rows.
Delete in FK-safe order (work-order docs → work orders → schedules → assets → asset groups), demo-only. **Never delete real PPM data.** Remove the "completed work order blocks the wipe" guard for demo rows (demo can always be cleared). After delete, all demo assets/schedules/work-orders for that scope are gone and every count reads 0 — no orphans, no lingering schedules.

### 5. Load and delete must be symmetric
Whatever load creates (tables + scope), delete removes (same tables, same scope). Verify there is no table that load fills but delete misses (that orphan is the bug).

## Acceptance criteria
- **Single-site customer:** Load Demo Data → assets, schedules, work orders all populate and the counts agree. Delete All Demo Data → everything demo clears to 0; any real PPM data is untouched.
- **Enterprise customer:** Load on the active site populates that site (visible); switching to another site shows that site's own demo (or none) — schedules included, no cross-site bleed. Delete clears demo for the caller's scope only; real data and other unrelated data untouched.
- No state where one PPM count is non-zero while related counts are zero from the same dataset (the false positive is gone).
- `npm run db:push` applied for `is_demo`; the site-isolation route test still passes (`npm run test:site-isolation-routes`), and ideally add a PPM schedules case to it.

## Do NOT
- Do not leave any site-scoped PPM table unscoped — schedules must behave exactly like assets/work-orders.
- Do not delete real (non-demo) PPM data.
- Do not regress single-site customers (default site).
