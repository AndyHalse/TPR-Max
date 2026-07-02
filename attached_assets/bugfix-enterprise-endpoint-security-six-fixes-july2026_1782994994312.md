# Bugfix — Enterprise endpoint security: six fixes in one pass (July 2026)

## Context for you (the Replit agent)

A static security review of the TPR Max enterprise subsystem found six confirmed
issues. This prompt fixes all six, then extends the route-level isolation test so
each fix is proven and stays proven. Everything here is **code-only**.

**Hard rules:**
- Do **NOT** run `npm run db:push`. No schema changes are needed or allowed.
- Do **NOT** refactor, rename, or "improve" anything outside the changes listed.
- All enterprise role logic must go through the existing shared path:
  `requireEnterpriseRole(...)` middleware → read scope from `req.enterpriseGrants`.
  Never define a new bespoke role helper inside a route file.
- Where I give line numbers they are from a 2 July snapshot — re-locate by
  grepping for the code shown, don't trust the numbers blindly.
- When done, run the verification steps at the bottom and report back honestly,
  including anything that failed.

---

## FIX 1 (CRITICAL) — Scheduled reports never run: runner calls `generateReport` with the wrong signature

**File:** `server/enterpriseScheduleRunner.ts` (and read `server/enterpriseReportService.ts`)

**The bug:** in `runScheduler()` the runner calls:

```ts
const pdfBuffer = await generateReport(
  customer.id,
  schedule.reportType as ReportType,
  params,
);
```

But the real signature in `enterpriseReportService.ts` is:

```ts
export async function generateReport(
  db: any,
  reportType: ReportType,
  allowedSiteIds: string[] | 'all',
  params: ReportParams,
  customerId: string,
  reportId: string,
  companyName: string,
): Promise<GeneratedReport>
```

So the runner passes a customer-ID **string** where a database handle belongs.
tsx doesn't type-check, so this ships and every scheduled run throws at runtime,
gets caught, and is marked `lastRunStatus='failed'` — the feature has never
worked. Additionally, `generateReport` returns a `GeneratedReport` object
(`{ title, pdfBuffer, storagePath, fileSizeBytes }`), not a raw Buffer, so the
email-attachment code is also wrong.

**Fix — rewrite the generation block in the runner to:**

1. Build the correct arguments:
   - `db` — the runner already has `db` from `customerDbService.getCustomerDatabase(customer.id)`. Use it.
   - `allowedSiteIds` — translate the schedule's saved scope (this mapping does
     not exist today; create a small helper in the runner file):
     - `scope === 'estate'` → `'all'`
     - `scope === 'site'` → `[schedule.scopeId]` (skip the run with
       `lastRunStatus='failed'` and a clear `lastRunError` if `scopeId` is null)
     - `scope === 'area'` → query the sites table for `areaId === schedule.scopeId`
       and pass those site IDs (fail the run clearly if none found)
   - `params` — the schedule's `parameters`. If the report type is
     `single_site_report` or `evacuation_muster_log` and `params.siteId` is
     missing but `scope === 'site'`, set `params.siteId = schedule.scopeId`.
   - `customerId` — `customer.id`
   - `reportId` — `crypto.randomUUID()`, generated before the call and reused
     for the history row below
   - `companyName` — the runner already fetches this; pass it through.

2. Use the return value properly: attach `result.pdfBuffer` to the email, and in
   the `enterprise_reports` history insert store `storagePath: result.storagePath`
   and `fileSizeBytes: result.fileSizeBytes` (today it stores `storagePath: null`,
   which makes the download endpoint 404 on every scheduled row).

3. While in this file, one small efficiency fix: the runner loops
   `customerDbService.getAllCustomers()` — **every** customer, every minute.
   Filter to enterprise customers only (`isEnterprise` flag) before opening
   their databases.

---

## FIX 2 (CRITICAL) — Contractor-pool `clear` lets an area manager act outside their area

**File:** `server/routes/enterpriseContractorPool.ts`

**The bug:** `POST /api/enterprise/contractor-pool/workers/:workerId/clear` takes
`siteId` from the request body and writes a site clearance ("worker inducted at
this site") without ever checking that site against the caller's grants. An
area manager for one area can grant clearance at any site in the estate.

**Fix:** before the insert/upsert:
1. Resolve the caller's allowed sites from `req.enterpriseGrants` exactly the
   way `callerAllowedSiteIds` does in `server/routes/enterpriseReports.ts`
   (enterprise_admin → all; otherwise `grants.allowedSiteIds`). Reuse or mirror
   that thin accessor — do not re-resolve grants.
2. If the caller is not enterprise_admin and the body `siteId` is not in their
   allowed sites → `403 { error: 'Site is outside your managed scope' }`.
3. Also verify the `siteId` exists in the sites table for this customer →
   `404 { error: 'Site not found' }` if not.

---

## FIX 3 — Demo load/reset open to any logged-in user

**File:** `server/routes/enterpriseDemoRoutes.ts`

**The bug:** `POST /api/enterprise-demo/load` and `POST /api/enterprise-demo/reset`
are gated by `requireAuth` only. Any logged-in user in an enterprise tenant can
inject ~10 demo sites into the live estate or wipe the demo data mid-demo.

**Fix:** add `requireEnterpriseRole('enterprise_admin')` to both `/load` and
`/reset` (after `requireAuth`). Leave `GET /api/enterprise-demo/status` as-is.
Do not change the delete logic itself — `deleteAllDemoRows` correctly deletes
only `WHERE is_demo = true` and must stay that way.

---

## FIX 4 — Group Standards "overrides" endpoint is unreachable (route ordering)

**File:** `server/routes/enterpriseStandards.ts`

**The bug:** `GET /api/enterprise/standards/induction/:roleType` is registered
**before** `GET /api/enterprise/standards/induction/overrides`. Express matches
in registration order, so a request for `/induction/overrides` hits the
`:roleType` route with `roleType = 'overrides'`, fails the
`['visitor','staff','contractor']` check, and always returns 400. The overrides
endpoint is dead code and the Group Standards page can never show which sites
have overridden the group induction standard.

**Fix:** move the `/induction/overrides` route registration **above** the
`/induction/:roleType` registration. No logic changes. Check the visit-reasons
block is not affected (it isn't — different path shapes — but confirm).

---

## FIX 5 — Scheduled-reports input validation

**File:** `server/routes/enterpriseScheduledReports.ts` (POST create and PATCH update)

Validate on **both** create and update (reject with a 400 and a plain message):

1. **`reportType`** — must be one of the valid report types. Export the
   canonical list from `server/enterpriseReportService.ts` (e.g.
   `export const VALID_REPORT_TYPES`) and import it here AND in
   `server/routes/enterpriseReports.ts` (which currently keeps its own copy) so
   there is exactly one source of truth.
2. **`recipients`** — must be an array of at most **20** strings; each trimmed,
   lowercased, and matching a sane email pattern
   (`/^[^\s@]+@[^\s@]+\.[^\s@]+$/`). Reject the whole request if any entry
   fails, naming the bad entry. These addresses receive estate compliance data
   by automated email — they must never be silently accepted free text.
3. **Timing fields** — `runAtHour` integer 0–23, `runAtMinute` integer 0–59,
   `dayOfWeek` integer 1–7 or null, `dayOfMonth` integer 1–28 or null (29–31
   would silently never fire in shorter months because the runner matches the
   exact day).
4. **Scope** — `scope` must be `'estate' | 'area' | 'site'`. If `'site'`, the
   `scopeId` must exist in the sites table; if `'area'`, in the areas table.
   Reject otherwise.

---

## FIX 6 — "Critical Issues Digest" default can never behave as a digest

**Files:** `server/routes/enterpriseScheduledReports.ts` (DEFAULT_SCHEDULES) and
`server/enterpriseScheduleRunner.ts`

**The bug:** the seeded "Critical Issues Digest" default has
`reportType: 'portfolio_compliance_snapshot'`, but the runner's
skip-when-no-critical-alerts logic checks
`schedule.reportType === 'critical_issues_digest'` — a type that isn't in the
valid list and that `generateReport` can't build. So the digest behaviour is
unreachable: the seeded default is just a daily snapshot, and any schedule
actually created with type `critical_issues_digest` would crash generation.

**Fix (no new report type):**
1. In `DEFAULT_SCHEDULES`, give the Critical Issues Digest entry
   `parameters: { criticalOnly: true }` (keep its reportType as
   `portfolio_compliance_snapshot`).
2. In the runner, replace the `reportType === 'critical_issues_digest'` check
   with: skip when `parameters?.criticalOnly === true` and there are no open
   critical alerts.
3. Belt and braces for any legacy rows: if a stored schedule has
   `reportType === 'critical_issues_digest'`, treat it in the runner as
   `portfolio_compliance_snapshot` with `criticalOnly: true` instead of letting
   it crash.

---

## EXTEND THE ISOLATION TEST — these routes currently have no automated proof

**File:** `tests/site-isolation.routes.test.ts` (run via `npm run test:site-isolation-routes`)

Add cases that drive the **real `/api` routes with supertest** (never the helper
functions):

1. **Scheduled reports** — a plain user and a site_coordinator get 403 on
   `GET/POST /api/enterprise/scheduled-reports`; an enterprise_admin succeeds;
   a POST with a bad recipient (`"not-an-email"`), `runAtHour: 25`, or an
   invalid `reportType` gets 400.
2. **Contractor pool clear** — an area_manager scoped to Area A gets **403**
   when POSTing `/api/enterprise/contractor-pool/workers/:id/clear` with a
   siteId in Area B, and succeeds with a siteId in Area A.
3. **Demo routes** — a non-admin user gets 403 on `/api/enterprise-demo/load`
   and `/reset`; enterprise_admin is allowed.
4. **Standards ordering regression** — enterprise_admin GET
   `/api/enterprise/standards/induction/overrides` returns 200 with an array
   (this is the regression test for FIX 4 — it returned 400 before).

**Prove the tests bite:** temporarily comment out the new scope check from FIX 2,
confirm its test goes RED, then restore it and confirm green. State in your
report that you did this and what you saw.

---

## Verification (do all of these, report results honestly)

1. `npx tsc --noEmit` — must pass with no errors. This is non-negotiable: the
   critical bug in FIX 1 exists precisely because tsx skips type-checking, and
   tsc catches that entire class.
2. `npm run test:site-isolation-routes` — full suite green, including the new
   cases, with the bite-check performed as described.
3. Confirm the app boots and the runner logs its startup line without errors.
4. Report back: each fix applied (file + what changed), test results pasted,
   the bite-check result, and anything you could not complete. Do not claim
   something works unless a test or command output shows it.
