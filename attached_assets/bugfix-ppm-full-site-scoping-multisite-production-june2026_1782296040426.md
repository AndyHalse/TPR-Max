# Bugfix — Make the ENTIRE PPM module site-aware (multi-site production readiness)

**The PPM module is only partially site-scoped: of ~47 reads of site-scoped PPM tables only 3 use `scopedWhere`, and of ~13 writes only 3 use `withSiteId`. So for enterprise (multi-site) customers, PPM shows ALL sites' data regardless of the active site (schedules, work orders, documents, dashboard counts, annual planner, exports) — only the Assets tab is scoped. This is why "Load Demo Data" shows 41 schedules but 0 assets. Make the whole module site-aware. Single-site customers MUST be unaffected (one default site = no-op). Test customers only. NEEDS `npm run db:push` (adds `is_demo`). Replaces the earlier demo-only prompt.**

## The principle (apply to EVERY query in `server/routes/ppm.ts`)
Every read/write of a **site-scoped** PPM table — `ppm_assets`, `ppm_schedules`, `ppm_work_orders`, `ppm_work_order_documents`, `ppm_asset_groups` — must go through `siteScope`:
- **List / collection reads** → add `scopedWhere(siteContext, table)` to the WHERE.
- **By-id / single-record reads, updates, deletes** → after fetching (or in the WHERE), verify the record's `site_id` is in the caller's allowed scope; refuse (404/403) if not. Fail closed.
- **Inserts** → `withSiteId(siteId, …)` so every new row carries the active site.
- (`ppm_templates` is customer-level config — leave it customer-scoped. Confirm whether `ppm_asset_groups` should be site-level or customer-level and scope accordingly; if assets within a group can belong to different sites, keep groups customer-level but scope the assets.)

Audit every one of the ~47 reads and ~13 writes — do not fix only the obvious ones. Produce a list of every line changed.

## Specific areas that are currently unscoped (fix all)
1. **Schedules** — list read (~325) and insert (~347): scope + stamp.
2. **Work orders** — the list (~438), by-id reads (~505/556/622/643/689…), updates, and the duplicate/copy insert (~655): scope + stamp + site-membership check on by-id.
3. **Work-order documents** — all reads (~404/465/791/858…) and inserts (~828): scope to the parent work order's site.
4. **Asset groups** — list (~209) and insert (~223).
5. **Dashboard / stats** — the counts (Active Schedules, Due This Month, Overdue, Awaiting Certificates, completion rate, statutory vs non-statutory) must count only the **active site**. The "41 schedules vs 0 assets" mismatch must be impossible.
6. **Annual Planner** — scope to the active site.
7. **Exports (CSV/PDF)** and the work-order PDF — export only the active site's data (respect the caller's scope).
8. **Cron jobs / scheduled tasks** — they run per customer; ensure any per-site logic, notification, or "overdue" calc uses the correct `site_id` and never mixes sites in a single site's email/report.
9. **Asset duplicate/copy** (~190) — stamp the source asset's site.

## Demo data (load + delete) — must be correct AND complete
- **Load** (`POST /api/ppm/demo-data`): resolve the active site (`getScopedDb(req)`) and stamp `withSiteId(siteId, …)` on EVERY seeded record (assets, schedules, work orders, asset groups, documents). Set `is_demo = true` on each. After load, the dashboard shows assets, schedules and work orders all populated and consistent for the active site.
- **`is_demo` flag**: add `is_demo boolean NOT NULL default false` to the seeded PPM tables via the migration runner; the seeder sets it true.
- **Delete** (`DELETE /api/ppm/demo-data`): delete **only `is_demo = true`** rows, scoped to the caller's allowed sites (enterprise_admin → all their sites; area_manager/site_coordinator → their sites; single-site → default site). FK-safe order (work-order docs → work orders → schedules → assets → asset groups). Never delete real PPM data. Remove the "completed work order blocks the wipe" guard for demo rows.
- **Andy's explicit requirement — verify ALL fields/tables are clear after delete:** at the end of the delete, run a verification pass that confirms **zero** `is_demo = true` rows remain in scope across **every** PPM table (assets, schedules, work orders, work-order documents, asset groups) and that the dashboard counts for that scope read 0. Return that confirmation in the response (e.g. `{ cleared: true, remaining: { assets:0, schedules:0, workOrders:0, documents:0, groups:0 } }`). If anything remains, report it rather than claiming success.
- **Load and delete must be symmetric** — every table load fills, delete clears.

## Acceptance criteria
- **Single-site customer:** PPM behaves exactly as before; Load populates and counts agree; Delete clears all demo to 0 with the verification confirming every table empty; real data untouched.
- **Enterprise customer:** every PPM tab (Dashboard, Assets, Templates*, Schedules, Work Orders, Annual Planner) shows ONLY the active site's data; switching site changes all of them consistently; a work order/schedule/document from another site cannot be read or edited by ID. (*Templates are customer-level by design.)
- No state where one PPM count is non-zero while related counts are zero from the same dataset.
- Delete returns a verified "all clear" with per-table remaining counts of 0.
- Add PPM cases (schedules, work orders, documents) to `tests/site-isolation.routes.test.ts` and confirm `npm run test:site-isolation-routes` passes and bites.

## Do NOT
- Do not leave ANY site-scoped PPM query unscoped — audit all ~47 reads / ~13 writes.
- Do not delete real (non-demo) PPM data.
- Do not regress single-site customers.
- Do not report delete success without the verification pass confirming every table is clear.
