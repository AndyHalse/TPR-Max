# PPM Commercial-Readiness Hardening — Public Routes, Demo Data Safety & Enterprise

**Module:** Planned Preventative Maintenance (PPM) — Dashboard, Assets, Templates, Schedules, Work Orders, Annual Planner
**Goal:** Make PPM rock-solid for commercial release: fix the broken contractor link, stop "Delete All Demo Data" destroying real customer data, and make Load/Delete Demo Data behave correctly for both standalone single-site AND enterprise multi-site customers (Cowiesburn / CPI ready).

> ⚠️ **This prompt requires `npm run db:push`** — Fix 3 adds two new columns (`is_demo`) to the contractor tables. Run `npm run db:push` after applying. Everything else is code-only.

All files: `server/routes/ppm.ts`, `server/isolatedSchema.ts`, `client/src/locales/en/ppm.json` (+ the matching key in `es/ppm.json` if present).

Do **not** change any working behaviour beyond what is listed. Keep British (en-GB) spelling and dates. Do not touch the muster/emergency/kiosk code.

---

## FIX 1 — 🔴 Contractor work-order link is blocked (entire contractor flow returns 401)

**Problem:** `server/routes/ppm.ts` line ~204 mounts a blanket gate:
```ts
app.use('/api/ppm', requireAuth, requirePPMFeature);
```
This runs in front of EVERY `/api/ppm/*` route — including the **public contractor routes** registered later in the same file:
- `GET  /api/ppm/work-order/public/:token`
- `PUT  /api/ppm/work-order/public/:token`
- `POST /api/ppm/work-order/public/:token/arrive`
- `POST /api/ppm/work-order/public/:token/files`

A contractor opening their link has no session, so `requireAuth` returns **401** and the whole mobile flow (view / arrive / update / upload) is dead. The contractor mobile page (`client/src/pages/PPMWorkOrderMobile.tsx`) calls these endpoints with no auth header.

**Fix:** Make the blanket gate skip the public sub-path so the per-route `ppmPublicRateLimit` handlers run instead. Replace the single `app.use(...)` line with a path-aware wrapper:

```ts
// Gate all authenticated PPM routes — but let the public contractor
// work-order endpoints through (they authenticate via rolling token, not session).
app.use('/api/ppm', (req, res, next) => {
  if (req.path.startsWith('/work-order/public')) return next();
  return requireAuth(req, res, () => requirePPMFeature(req, res, next));
});
```

(Note: when mounted at `/api/ppm`, Express strips the mount path, so `req.path` for the public route is `/work-order/public/:token`. Verify this matches; if your Express version exposes the full path differently, gate on `req.originalUrl.startsWith('/api/ppm/work-order/public')` instead.)

The individual authenticated routes already each carry their own `requireAuth`, so this change does not weaken them.

**Verify:** open a real contractor work-order link in a private/incognito window — it must load the work order (not 401), allow "I've arrived", file upload, and completion.

---

## FIX 2 — 🔴 "Delete All Demo Data" must only delete demo data

**Problem:** `DELETE /api/ppm/demo-data` (line ~2418) deletes ALL PPM records for the active site **regardless of `is_demo`** — real assets, schedules, completed work orders and uploaded compliance certificates included. The seeder already stamps `is_demo = true` on everything it creates, so this scorched-earth behaviour is unnecessary and dangerous for a real customer.

**Fix:** scope every PPM delete in this route to `is_demo = true` AND the caller's site filter. Replace the bulk deletes so they read like:

```ts
const demoFilter = (table: { isDemo: any; siteId?: any }) =>
  and(eq(table.isDemo, true), scopedWhere(siteContext, table as any) ?? sql`true`);

// Collect demo WO ids first (work_order_documents have no siteId / isDemo of their own)
const demoWoRows = await custDb
  .select({ id: isolatedSchema.ppmWorkOrders.id })
  .from(isolatedSchema.ppmWorkOrders)
  .where(demoFilter(isolatedSchema.ppmWorkOrders));
const demoWoIds = demoWoRows.map(w => w.id);

let woDocCount = 0;
if (demoWoIds.length > 0) {
  const deletedDocs = await custDb.delete(isolatedSchema.ppmWorkOrderDocuments)
    .where(inArray(isolatedSchema.ppmWorkOrderDocuments.workOrderId, demoWoIds))
    .returning({ id: isolatedSchema.ppmWorkOrderDocuments.id });
  woDocCount = deletedDocs.length;
}

const deletedWOs    = await custDb.delete(isolatedSchema.ppmWorkOrders).where(demoFilter(isolatedSchema.ppmWorkOrders)).returning({ id: isolatedSchema.ppmWorkOrders.id });
const deletedScheds = await custDb.delete(isolatedSchema.ppmSchedules).where(demoFilter(isolatedSchema.ppmSchedules)).returning({ id: isolatedSchema.ppmSchedules.id });
const deletedAssets = await custDb.delete(isolatedSchema.ppmAssets).where(demoFilter(isolatedSchema.ppmAssets)).returning({ id: isolatedSchema.ppmAssets.id });
const deletedGroups = await custDb.delete(isolatedSchema.ppmAssetGroups).where(demoFilter(isolatedSchema.ppmAssetGroups)).returning({ id: isolatedSchema.ppmAssetGroups.id });
```

**Update the post-delete verification block** so it counts only **demo** rows remaining (`is_demo = true` within scope), not all PPM rows — otherwise the verification will (correctly) see the customer's real data and falsely report "delete incomplete".

Keep the audit log line (`logPpmAudit(... "demo_data_wiped" ...)`).

---

## FIX 3 — 🔴 Demo contractor cleanup must not delete real same-named companies — needs db:push

**Problem:** the delete route removes contractor companies by hardcoded name ("Schindler UK", "BuildRight Co", "CoolAir Services Ltd", etc.) and cascades through all their workers, documents, RAMS, visits, CDM projects and CO₂ data. A real customer who genuinely uses a contractor with one of those names loses their real record.

**Fix — add an `is_demo` flag and only ever delete demo-seeded contractors:**

1. In `server/isolatedSchema.ts`, add to **both** `contractorCompanies` and `contractorWorkers`:
   ```ts
   isDemo: boolean("is_demo").notNull().default(false),
   ```
2. In `ensurePpmColumns` (top of `ppm.ts`), add idempotent guards so existing tenant DBs get the columns without a full migration:
   ```ts
   await custDb.execute(sql`ALTER TABLE contractor_companies ADD COLUMN IF NOT EXISTS is_demo BOOLEAN NOT NULL DEFAULT FALSE`);
   await custDb.execute(sql`ALTER TABLE contractor_workers   ADD COLUMN IF NOT EXISTS is_demo BOOLEAN NOT NULL DEFAULT FALSE`);
   ```
3. In the demo **seeder** (`POST /api/ppm/demo-data`), stamp `isDemo: true` on the contractor company and worker inserts (see also Fix 4 for the siteId stamp on the same inserts).
4. In the demo **delete** route, change the contractor-company loop so it only deletes a name-matched company **when that row has `is_demo = true`**:
   ```ts
   const [existing] = await custDb
     .select({ id: isolatedSchema.contractorCompanies.id })
     .from(isolatedSchema.contractorCompanies)
     .where(and(
       eq(isolatedSchema.contractorCompanies.companyName, name),
       eq(isolatedSchema.contractorCompanies.isDemo, true),
     ))
     .limit(1);
   ```
   A real customer's "Schindler UK" (is_demo = false) is now untouchable by the demo wipe.

Then run **`npm run db:push`**.

---

## FIX 4 — ⚠️ Enterprise: demo contractors are invisible (Cowiesburn / CPI)

**Problem:** in the seeder, the contractor company and worker inserts (line ~1960 and ~1984) do not stamp `site_id`. For an **enterprise** customer the rows get `site_id = NULL`, so they never appear on any site's Contractors page or in the work-order assignment dropdown. Standalone customers are unaffected.

**Fix:** wrap both demo contractor inserts in `withSiteId(siteId, { ... })` exactly like the asset/schedule/work-order inserts already do (the `siteId` is already destructured from `getScopedDb(req)` at the top of the route). Combine with the `isDemo: true` from Fix 3, e.g.:
```ts
await custDb.insert(isolatedSchema.contractorCompanies)
  .values(withSiteId(siteId, { /* ...company fields... */, isDemo: true }) as any)...
await custDb.insert(isolatedSchema.contractorWorkers)
  .values(withSiteId(siteId, { /* ...worker fields... */, isDemo: true }) as any)...
```

---

## FIX 5 — ⚠️ Demo templates survive "Delete All Demo Data"

**Problem:** templates have no `is_demo` column, so the wipe leaves the 9 seeded demo templates behind — inconsistent with a "delete all demo" action (the response message even admits "Templates untouched").

**Fix (no db:push needed):** in the delete route, after the PPM deletes, remove the demo templates by their known seeded names. Define the list once near the other demo constants:
```ts
const DEMO_TEMPLATE_NAMES = [
  "Monthly HVAC Filter Check","Annual Fire Alarm Full Test","Monthly Emergency Lighting Functional Test",
  "Annual Boiler Service & Gas Safety Check","6-Monthly Lift Thorough Examination",
  "Quarterly Sprinkler System Inspection","Fixed Wiring Inspection & Testing (EICR)",
  "Monthly Access Control System Check","Monthly Water Hygiene Inspection",
  // plus the quarterly/annual variants used in DEMO_SCHEDULES:
  "Quarterly HVAC Filter & Coil Service","Annual HVAC Full Plant Service",
  "Quarterly Emergency Lighting Functional Test","Annual Emergency Lighting Duration Test",
  "Annual Sprinkler Full Flow Test","6-Monthly Access Control System Health Check",
  "6-Monthly CCTV System Health Check",
];
```
> **Important:** confirm this list against the actual template names created in `POST /api/ppm/demo-data` (both the `DEMO_TEMPLATES` array and any `templateName` values referenced in `DEMO_SCHEDULES`) so every seeded template is covered and no real customer template name collides.

Then:
```ts
const deletedTemplates = await custDb.delete(isolatedSchema.ppmTemplates)
  .where(inArray(isolatedSchema.ppmTemplates.name, DEMO_TEMPLATE_NAMES))
  .returning({ id: isolatedSchema.ppmTemplates.id });
```
Update the success message to reflect that demo templates were removed.

---

## FIX 6 — ⚠️ Demo LOAD pre-wipe isn't site-scoped (multi-site clash)

**Problem:** Step 1 of the seeder (line ~2002) deletes existing demo assets by `assetRef` across the **whole customer DB**, not the active site. Loading demo on Site B therefore wipes Site A's demo data — you can't run a demo on two sites at once.

**Fix:** add the active-site filter to the Step-1 pre-wipe selects/deletes so it only clears demo rows for the **current** site:
```ts
const _demoAssetRows = await custDb
  .select({ id: isolatedSchema.ppmAssets.id })
  .from(isolatedSchema.ppmAssets)
  .where(and(
    inArray(isolatedSchema.ppmAssets.assetRef, DEMO_ASSET_REFS),
    scopedWhere(siteContext, isolatedSchema.ppmAssets) ?? sql`true`,
  ));
```
Apply the same site filter to the `ppmAssetGroups` name-based delete in Step 1. (Non-enterprise customers are unaffected — `scopedWhere` returns undefined.)

---

## FIX 7 — ⚠️ Role inconsistency between demo data and the work-orders list

**Problem:** managers can Load/Delete demo data (`["admin","manager"]` at lines ~1822 / ~2419) but `GET /api/ppm/work-orders` is admin-only (line ~555), so a manager who loads demo then opens the Work Orders tab gets a 403.

**Fix:** make the read consistent — allow `manager` to view the work-orders list (and the other admin-only PPM **GET** list routes if any) by changing the guard on `GET /api/ppm/work-orders` from `req.user!.role !== "admin"` to `!["admin","manager"].includes(req.user!.role)`. Leave write/delete actions admin-only as they are.

---

## FIX 8 — 🟡 Add pagination to the work-orders list

**Problem:** `GET /api/ppm/work-orders` loads every row for the selected year into memory. Fine for a single site; heavy at Cowiesburn scale (many sites, years of history).

**Fix:** accept optional `?limit` (default 200, max 500) and `?offset` (default 0) query params and apply `.limit()` / `.offset()` to the main query, keeping the existing year + site filters and the batched document-expiry lookup (do **not** reintroduce N+1). Return rows for the requested page; the existing UI year filter already keeps result sets small, so this is a safety cap rather than a UX change.

---

## FIX 9 — 🟡 Cache the PPM feature-flag lookup

**Problem:** `requirePPMFeature` calls `getCompanySettings` on **every** PPM request just to read `featurePPM`.

**Fix:** add a small in-memory per-customer cache (e.g. `Map<customerId, { featurePPM: boolean; ts: number }>` with a 60-second TTL) so the flag isn't re-read from the DB on every request. Keep the existing `ensurePpmColumns` call (it's already memoised per-process per-customer). Do not change the 403 behaviour when the feature is off.

---

## After applying

1. Run **`npm run db:push`** (Fix 3 adds the `is_demo` columns).
2. **Standalone smoke test:** Load Demo Data → confirm assets/templates/schedules/work orders + 7 demo contractors appear. Add one real asset of your own. Click **Delete All Demo Data** → demo data and demo contractors vanish, **your real asset and any real contractor stay**. Demo templates are gone.
3. **Contractor link test:** open a work-order contractor link in incognito → loads, "I've arrived" works, file upload works, completion works (Fix 1).
4. **Enterprise test:** as an enterprise admin with an active site selected, Load Demo Data → demo contractors now appear on that site's Contractors page and in the assignment dropdown (Fix 4). Switch to a second site, Load Demo there → first site's demo is untouched (Fix 6). Delete Demo on one site → only that site's demo clears.
5. Confirm a `manager` user can open the Work Orders tab without a 403 (Fix 7).

Keep all dates en-GB. Do not alter the muster, emergency or kiosk screens.
