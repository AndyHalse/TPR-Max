# Bugfix — Compliance Dashboard: role gate, honest errors, working deep links, performance

**Module:** Compliance Intelligence Dashboard
**Files:** `server/routes/complianceDashboard.ts` (API), `client/src/pages/ComplianceDashboard.tsx` (front-end), `client/src/pages/ContractorManagement.tsx` (live contractor list).
**Database changes:** NONE — do **not** run `npm run db:push`. All changes are code-only.

## Context

The Compliance Dashboard is read-only: it aggregates compliance data from ~17 modules into a single scored health rating. It is well-built — tenant isolation is solid (every query is scoped to the customer's own schema, and `generateSchemaName` sanitises the id before it touches SQL), and missing data is handled honestly (untracked categories are excluded from the weighted score). This prompt fixes eight remaining issues, worst-first. **Do not change the scoring maths or the tenant-isolation pattern.**

---

## Fix 1 (SERIOUS) — Add a role check so non-admins can't read everyone's HR data

The route is currently gated only by `requireAuth` plus the `featureComplianceDashboard` flag (`complianceDashboard.ts:23`). But the dashboard surfaces **staff and contractor-worker personal data** — names, departments, DBS expiry dates, Right-to-Work expiry dates. This is exactly the data the HR module locks behind an admin role (`hrLeaver.ts:91` uses `['admin','hr_admin']`). As it stands, a basic `staff`/`user`/`supervisor` account that is blocked from the HR pages can read the same sensitive data through this dashboard. That is a privacy/GDPR problem.

**Do this:** add a role gate to the dashboard route, allowing only management-tier roles.

```ts
// in server/routes/complianceDashboard.ts

// Roles allowed to view the aggregated compliance picture (includes HR-sensitive
// personal data, so this must match or exceed the HR module's gate).
// >>> Andy: adjust this list if you want a different set of roles. <<<
const COMPLIANCE_DASHBOARD_ROLES = ['admin', 'manager', 'hr_admin'];

const requireComplianceDashboardRole = (req: any, res: any, next: any) => {
  const role = req.user?.role || '';
  if (!COMPLIANCE_DASHBOARD_ROLES.includes(role)) {
    return res.status(403).json({ error: 'You do not have permission to view the Compliance Dashboard.' });
  }
  next();
};
```

Add it to the middleware chain (and drop the duplicate `requireAuth` on the GET line while you're there):

```ts
app.use('/api/compliance-dashboard', requireAuth, requireComplianceDashboardRole, requireComplianceDashboardFeature);

app.get('/api/compliance-dashboard', async (req, res) => {   // requireAuth already applied above
```

**Front-end:** if the API returns 403, the page should show a clear, friendly "You don't have permission to view this page" state rather than the generic "Failed to load compliance dashboard". Also hide the Compliance Dashboard nav link for roles not in `COMPLIANCE_DASHBOARD_ROLES` (match however other admin-only nav items are already hidden — do not invent a new pattern).

---

## Fix 2 (ISSUE) — A failed query must not masquerade as "Not tracked"

Every one of the ~17 sections wraps its query in a `try/catch` that logs a non-fatal `logger.warn` and carries on with zero counts. A zero count produces a `null` score, which the UI shows as **"Not tracked / No data"**. So if (for example) the Worker DBS query throws, the page shows "Worker DBS — Not tracked" and can still report an overall **"Good Standing"**, while in reality a whole category silently failed. For a compliance tool this is a trust problem — a failure looks identical to "you have no records".

**Do this:**
- In each section's `catch`, record the failure. Add an array near the top of the handler:
  ```ts
  const loadErrors: string[] = [];
  ```
  and in each `catch (e: any)` push the friendly category name, e.g.:
  ```ts
  logger.warn('Worker DBS query error (non-fatal):', e.message);
  loadErrors.push('Worker DBS');
  ```
  (Do this for every section's catch — Contractor Insurance, RAMS, Inductions, Worker RTW, Worker DBS, Worker Certifications, Equipment, Staff RTW, Staff DBS, Staff Training, Compliance Certificates, Permits, Risk Assessments, Audits, PPM, FRA, Document Approvals.)
- Add `loadErrors` to the JSON response payload.
- In `ComplianceDashboard.tsx`, if `data.loadErrors?.length`, render an honest amber banner at the top of the page, e.g. *"Some compliance data couldn't be loaded right now (Worker DBS, PPM). The score below may be incomplete — please refresh, and contact support if this persists."* Do **not** silently fold these into "Not tracked".

---

## Fix 3 (ISSUE) — Make the category "View" links actually filter the contractor list

Several category cards link to the contractor **list** with query params: `/contractors?gaps=true&sort=true&docType=insurance` (used by RAMS, Inductions, Worker RTW, Worker DBS, Worker Certifications, Equipment, and Document Approvals — see `CATEGORY_META` in `ComplianceDashboard.tsx`). **The live contractor list page `ContractorManagement.tsx` reads none of these params**, so the user lands on the full, unfiltered list and the promised filtering/sorting never happens. (The query-param handling exists only in the *legacy* `Contractors.tsx`, which is not the live page — and the per-contractor *detail* links like `?tab=workers&workerId=…&filter=missing` already work correctly via `ContractorDetails.tsx`, so leave those alone.)

**Do this:** make `ContractorManagement.tsx` honour the deep-link params on mount:
- `?gaps=true` — show only companies/workers with an outstanding compliance gap (expired, expiring, missing, or pending docs).
- `?sort=true` — sort worst-compliance-first.
- `?docType=insurance` (and any other values already produced by the dashboard) — pre-apply that document-type filter where the list supports it.

Read them once on mount with `new URLSearchParams(window.location.search)` (the same approach `ContractorDetails.tsx` already uses), apply them to the existing filter/sort state, and strip them from the URL after consuming so a refresh doesn't re-lock the view. If any param can't be honoured cleanly, at minimum apply `gaps`/`sort` — do not leave all three silently ignored.

---

## Fix 4 (ISSUE) — Reduce the per-load cost and stop hammering the DB

The endpoint runs ~20 queries sequentially, loads whole tables into memory, and the page auto-refetches every 5 minutes per open tab — with no caching. For a large tenant (e.g. a 120-site customer) this is slow and DB-heavy. There is also a genuine **N+1**: the "pending insurance" lookup runs once per company that has no PL/EL expiry, inside the company loop (`complianceDashboard.ts:146`).

**Do this:**
- **Kill the N+1:** before the company loop, run one query that returns the set of `company_id`s with a pending `publicLiability`/`employersLiability` document, then check membership in memory:
  ```ts
  // one query instead of one-per-company
  const pendingInsRes = await pool.query(
    `SELECT DISTINCT company_id FROM "${schemaName}".contractor_documents
     WHERE document_type IN ('publicLiability','employersLiability')
       AND status = 'pending' AND is_active = TRUE`
  );
  const companiesWithPendingInsurance = new Set<string>(pendingInsRes.rows.map((r:any) => r.company_id));
  ```
  Replace the in-loop query with `companiesWithPendingInsurance.has(c.id)`.
- **Cache the computed result** per customer for a short TTL (e.g. 60–120 seconds) in an in-memory map keyed by `customerId`, served before recomputing. The page's 5-minute auto-refetch and multiple open tabs will then hit the cache instead of recomputing every time. Add a `?refresh=1` bypass so the "Refresh" button forces a fresh calc. Keep it simple — a `Map<customerId, { at: number; payload: any }>` is fine; **do not** add a new dependency or DB table.

---

## Fix 5 (MINOR) — Replace `companies.find()` inside the worker loops

In Sections 3–7, each worker does `companies.find(c => c.id === …)` — O(workers × companies). Build the lookup once:
```ts
const companyById = new Map(companies.map(c => [c.id, c]));
```
and use `companyById.get(...)?.company_name ?? ''` throughout.

## Fix 6 (MINOR) — Fix the date off-by-one

`daysUntil` (`complianceDashboard.ts:39`) ceils raw millisecond differences and `isoDate` converts via `toISOString()` (UTC). For date-only expiry values this can drift by a day around midnight / British Summer Time. Normalise both ends to the start of the day in **Europe/London** before computing the difference, so "days until expiry" and the displayed ISO date are stable and correct for UK users. Keep all displayed dates/times in en-GB.

## Fix 7 (MINOR) — Audit the PDF export

The "Download PDF" button exports a report containing personal data with no server-side record of who exported it. Add a lightweight audit log entry (who / when) when the dashboard data is fetched specifically for export — reuse whatever audit/log helper the app already has; if there's no suitable existing audit table, a single `logger.info('Compliance report exported', { user, customerId, at })` is acceptable. Do not create a new DB table.

## Fix 8 (TRIVIAL) — Show "0 days overdue"

In `ComplianceDashboard.tsx:292`, `{issue.daysOverdue && (…)}` hides the line when the value is exactly `0` (due today). Change to `{issue.daysOverdue != null && (…)}` and render "Due today" when it's 0.

---

## Acceptance checklist
- [ ] A `staff`/`user`/`supervisor` account gets a clean 403 + friendly message and no dashboard nav link; `admin`/`manager`/`hr_admin` still see everything.
- [ ] Forcing a category query to fail shows the amber "couldn't load X" banner — the category is **not** silently shown as "Good Standing"/"Not tracked".
- [ ] Clicking "View" on RAMS / Inductions / Worker RTW / DBS / Certs / Equipment / Document Approvals lands on the contractor list **with the gap filter applied**.
- [ ] Only one "pending insurance" query runs regardless of company count; repeat loads within ~60–120s are served from cache; "Refresh" forces a recalc.
- [ ] No new DB columns/tables; `npm run check` passes; tenant isolation and the scoring maths are unchanged.
