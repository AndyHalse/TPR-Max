# Reports page — gate report types by feature, add 6 new module reports, fix 3 bugs (verified against live codebase 14 June 2026)

## Read this first

This is all about the **Reports & Analytics** page (`/reports`). Today it can generate nine report types — visitor logs, staff attendance, contractor activity/compliance/gap, site headcount and evacuation readiness. Three things are wrong or missing:

1. **The report-type dropdown shows everything, all the time.** A customer who has contractors switched off still sees three contractor reports. A customer with no muster module still sees evacuation readiness. The dropdown should only offer a report if the feature behind it is actually turned on — same way the left-hand menu already hides modules that are off.

2. **Whole modules now have no report at all.** We've built H&S / Behaviour-Based Safety, Permit to Work, the RA Builder, Fire Risk Assessment, PPM and the Audit & Inspection engine — and none of them can be reported on. We want a report for each, and each one must only appear in the dropdown when its feature is on.

3. **Three real bugs** on the existing page (one of them loses data).

Do the three bug fixes and the gating first — they're small and safe. Then add the six new reports. You can ship in that order.

**Files in play:**
- `client/src/pages/Reports.tsx` — the page (dropdown, formatting, email handler).
- `server/routes/reports.ts` — generate / view / email endpoints.
- `server/emailService.ts` — `generateReportHTML` (the printable/emailable HTML).
- `server/isolatedSchema.ts` — table definitions (read-only reference; **no schema change needed** — the `reports` table already has a `data` text column we'll reuse for snapshots).

Run `npm run check` when done. **No `npm run db:push` needed** — we're not adding columns.

---

# PART A — Bug fixes (do these first)

## Bug 1 — the "To Date" silently drops the whole final day (data loss)

In `server/routes/reports.ts`, every date-ranged report filters like this (it appears in the generate, view and email handlers):

```ts
const visitorsInRange = allVisitors.filter(v =>
  v.checkedInAt >= fromDate && v.checkedInAt <= toDate
);
```

The problem: when a user picks the "To Date" from the calendar, it comes in as **midnight** of that day (00:00:00). So `<= toDate` excludes everything that happened *during* the chosen end day. Pick "14 June" as the end date and a visitor who checked in at 9am on 14 June is left out of the report. The default range (which uses `new Date()` = right now) hides this, but as soon as someone sets an end date they lose that day.

**Fix:** normalise the end date to the end of the day before filtering. In the `/api/reports/generate` handler, right after the dates are parsed:

```ts
const fromDate = new Date(dateFrom);
const toDate = new Date(dateTo);
```

change to:

```ts
const fromDate = new Date(dateFrom);
const toDate = new Date(dateTo);
toDate.setHours(23, 59, 59, 999); // include the whole final day
```

Then do the **same** in the `/api/reports/:id/view` and `/api/reports/:id/email` handlers. In both, the report's stored `dateTo` is used directly in the filter (`v.checkedInAt <= report.dateFrom`/`report.dateTo`). Add a normalised local just under where the handler starts using the report:

```ts
const rangeFrom = report.dateFrom;
const rangeTo = new Date(report.dateTo);
rangeTo.setHours(23, 59, 59, 999);
```

and use `rangeFrom` / `rangeTo` in the visitor filter instead of `report.dateFrom` / `report.dateTo`. (The stored value is already end-of-day once Bug 1 is fixed in generate, but normalising on read too means existing saved reports are correct as well.)

## Bug 2 — dates on the page are in US format, not British

Andy is British and the emailed report already uses `en-GB`. The on-screen page doesn't. In `client/src/pages/Reports.tsx`:

- The date-picker buttons use `format(dateFrom, "MMM dd, yyyy")` → "Jun 14, 2026". Change both the From and To buttons to `format(dateFrom, "dd MMM yyyy")` / `format(dateTo, "dd MMM yyyy")` → "14 Jun 2026".
- Every `new Date(...).toLocaleDateString()` in this file (the report rows, "Generated", "Emailed", the period column) has no locale, so it falls back to the browser default. Make them all explicit British: `.toLocaleDateString('en-GB')`. There are several — the desktop table, the mobile card list, and the "Emailed {date}" line.

## Bug 3 — emailing a report can send it to a made-up address

In `handleEmailReport` (`Reports.tsx`), when staff are selected the recipient list is built like this:

```ts
recipients = selectedStaff.map(staffId => {
  const staffMember = staff?.find(s => s.id === staffId);
  return staffMember?.email || `${staffMember?.firstName?.toLowerCase()}.${staffMember?.lastName?.toLowerCase()}@company.com`;
});
```

If a selected staff member has no email on file, it **invents** `firstname.lastname@company.com` and sends a confidential site report there. That's a data-leak risk and a silent failure. Replace it so staff without an email are skipped, and warn the user if that leaves no valid recipients:

```ts
if (selectedStaff.length > 0) {
  const withEmail = selectedStaff
    .map(staffId => staff?.find(s => s.id === staffId))
    .filter((s): s is NonNullable<typeof s> => !!s?.email)
    .map(s => s.email as string);

  const missing = selectedStaff.length - withEmail.length;
  if (missing > 0) {
    toast({
      title: "Some staff have no email",
      description: `${missing} selected staff member${missing !== 1 ? 's have' : ' has'} no email address and will be skipped.`,
    });
  }
  recipients = withEmail;
} else if (emailRecipients.trim()) {
  recipients = emailRecipients.split(",").map(e => e.trim()).filter(e => e.length > 0);
} else {
  recipients = [settings?.email || "admin@company.com"];
}
```

(Keep the existing "no recipients" guard below it — it'll now also catch the case where every selected staff member lacked an email.)

---

# PART B — Gate the report-type dropdown by feature

The left-hand menu already hides modules that are off, using each company's settings flags. We'll do the same for the report dropdown so it only offers reports the customer actually has.

### B1 — read the feature flags on the page

In `Reports.tsx` the settings query is currently typed thin:

```ts
const { data: settings } = useQuery<{ email?: string; reportRecipients?: string }>({
  queryKey: ["/api/settings"],
});
```

`/api/settings` already returns the full company settings (including every `featureX` flag). Widen the type so we can read them:

```ts
import type { CompanySettings } from "@shared/schema";
// ...
const { data: settings } = useQuery<CompanySettings>({
  queryKey: ["/api/settings"],
});
```

(`settings?.email` keeps working.)

### B2 — describe each report type once, with its feature and default

Add this above the `return` in the component. The `defaultOn` semantics match `Layout.tsx` exactly: a `defaultOn: true` report shows unless its flag is explicitly `false`; a `defaultOn: false` report shows only when its flag is explicitly `true`.

```ts
type ReportOption = { value: string; label: string; featureKey?: keyof CompanySettings; defaultOn?: boolean };

const REPORT_OPTIONS: ReportOption[] = [
  // Visitor logs — gated with the page itself, always offered
  { value: "daily",                 label: "Daily Visitor Log",            featureKey: "featureVisitors",            defaultOn: true },
  { value: "weekly",                label: "Weekly Visitor Log",           featureKey: "featureVisitors",            defaultOn: true },
  { value: "monthly",               label: "Monthly Visitor Log",          featureKey: "featureVisitors",            defaultOn: true },
  { value: "staff_attendance",      label: "Staff Attendance Report",      featureKey: "featureStaff",               defaultOn: true },
  { value: "contractor_activity",   label: "Contractor Activity Report",   featureKey: "featureContractors",         defaultOn: true },
  { value: "contractor_compliance", label: "Contractor Compliance Report", featureKey: "featureContractors",         defaultOn: true },
  { value: "compliance_gap",        label: "Contractor Compliance Gap Report", featureKey: "featureContractors",     defaultOn: true },
  { value: "site_headcount",        label: "Site Headcount / Roll Call",   featureKey: "featureMusterList",          defaultOn: true },
  { value: "evacuation_readiness",  label: "Evacuation Readiness Report",  featureKey: "featureMusterList",          defaultOn: true },
  // NEW module reports (Part C)
  { value: "health_safety",         label: "Health & Safety / BBS Report", featureKey: "featureHsIncidents",         defaultOn: true },
  { value: "fire_risk",             label: "Fire Risk Assessment Report",  featureKey: "featureFireRiskAssessment",  defaultOn: true },
  { value: "permit_to_work",        label: "Permit to Work Report",        featureKey: "featurePermitToWork",        defaultOn: false },
  { value: "risk_assessments",      label: "Risk Assessment Register",     featureKey: "featureRaBuilder",           defaultOn: false },
  { value: "ppm_compliance",        label: "PPM Compliance Report",        featureKey: "featurePPM",                 defaultOn: false },
  { value: "audit_inspection",      label: "Audit & Inspection Report",    featureKey: "featureAuditEngine",         defaultOn: false },
];

const visibleReportOptions = REPORT_OPTIONS.filter(opt => {
  if (!opt.featureKey) return true;
  if (!settings) return opt.defaultOn === true; // before settings load, show only default-on
  const val = settings[opt.featureKey];
  return opt.defaultOn ? val !== false : val === true;
});
```

### B3 — render only the visible options, and keep the selected type valid

Replace the hard-coded `<SelectItem>` list with:

```tsx
<SelectContent>
  {visibleReportOptions.map(opt => (
    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
  ))}
</SelectContent>
```

The default `reportType` state is `"weekly"`, which is always visible, so that's fine. But add a guard so that if the visible set ever changes and the current selection isn't in it, we fall back to the first visible option:

```ts
useEffect(() => {
  if (visibleReportOptions.length && !visibleReportOptions.some(o => o.value === reportType)) {
    setReportType(visibleReportOptions[0].value);
  }
}, [visibleReportOptions, reportType]);
```

(Import `useEffect` from React.)

### B4 — labels and colours for the new types

In `formatReportType`, add to the `typeMap`:

```ts
health_safety: "Health & Safety / BBS",
fire_risk: "Fire Risk Assessment",
permit_to_work: "Permit to Work",
risk_assessments: "Risk Assessment Register",
ppm_compliance: "PPM Compliance",
audit_inspection: "Audit & Inspection",
```

In `getReportTypeColor`, add to the `colorMap`:

```ts
health_safety: "bg-rose-100 text-rose-800",
fire_risk: "bg-orange-100 text-orange-800",
permit_to_work: "bg-cyan-100 text-cyan-800",
risk_assessments: "bg-violet-100 text-violet-800",
ppm_compliance: "bg-teal-100 text-teal-800",
audit_inspection: "bg-lime-100 text-lime-800",
```

---

# PART C — Add the six new module reports (server)

All six are **snapshot reports over the chosen date range**. Rather than re-query in three places like the older reports do, add **one helper** in `server/routes/reports.ts` and call it from generate, view and email. The helper pulls straight from the customer DB (`custDb`, already available via `customerDbService.getCustomerDatabase`) and the `isolatedSchema` tables, filtered to the date range.

### C1 — the data column dates

Each module has a natural "when did it happen" column to range-filter on:

| Report | Table (`isolatedSchema`) | Date column | Notes |
|---|---|---|---|
| `health_safety` | `hsIncidents` | `incidentDate` | `recordType` ∈ incident / near_miss / good_spot / positive_action; `riddorCategory` set = RIDDOR-reportable; `resolved` boolean |
| `fire_risk` | `fireRiskAssessments` | `assessmentDate` | `status`, `nextReviewDate` |
| `permit_to_work` | `permitToWork` | `createdAt` | `status`, `permitType`, `permitValidUntil` |
| `risk_assessments` | `raBuilderAssessments` | `assessmentDate` | `raType`, `status`, `nextReviewDate` |
| `ppm_compliance` | `ppmWorkOrders` | `dueDate` | `status`, `completedDate` |
| `audit_inspection` | `auditRecords` | `conductedAt` | `status`, `passed`, `overallScore` |

### C2 — helper to build the report data

Add near the top of `registerReportRoutes` (after the imports are already in scope). It returns both a short summary (for the `totalVisitors`/`avgDuration` columns the list view shows) and the full row set (for the HTML):

```ts
import { and, gte, lte } from 'drizzle-orm'; // add gte/lte to the existing drizzle-orm import

const MODULE_REPORT_TYPES = [
  'health_safety', 'fire_risk', 'permit_to_work',
  'risk_assessments', 'ppm_compliance', 'audit_inspection',
] as const;

async function buildModuleReportData(
  customerId: string,
  reportType: string,
  fromDate: Date,
  toDate: Date,
): Promise<{ data: any; summaryCount: string; summaryNote: string }> {
  const custDb = await customerDbService.getCustomerDatabase(customerId);
  const inRange = (col: any) => and(gte(col, fromDate), lte(col, toDate));

  if (reportType === 'health_safety') {
    const rows = await custDb.select().from(isolatedSchema.hsIncidents)
      .where(inRange(isolatedSchema.hsIncidents.incidentDate));
    const incidents  = rows.filter(r => r.recordType === 'incident').length;
    const nearMisses = rows.filter(r => r.recordType === 'near_miss').length;
    const goodSpots  = rows.filter(r => r.recordType === 'good_spot').length;
    const positives  = rows.filter(r => r.recordType === 'positive_action').length;
    const riddor     = rows.filter(r => !!r.riddorCategory).length;
    const open       = rows.filter(r => !r.resolved).length;
    return {
      data: { type: 'health_safety', rows, incidents, nearMisses, goodSpots, positives, riddor, open },
      summaryCount: `${rows.length} records`,
      summaryNote: `${incidents} incidents / ${riddor} RIDDOR`,
    };
  }

  if (reportType === 'fire_risk') {
    const rows = await custDb.select().from(isolatedSchema.fireRiskAssessments)
      .where(inRange(isolatedSchema.fireRiskAssessments.assessmentDate));
    const now = new Date();
    const overdue = rows.filter(r => r.nextReviewDate && new Date(r.nextReviewDate) < now).length;
    return {
      data: { type: 'fire_risk', rows, overdue },
      summaryCount: `${rows.length} assessments`,
      summaryNote: `${overdue} review overdue`,
    };
  }

  if (reportType === 'permit_to_work') {
    const rows = await custDb.select().from(isolatedSchema.permitToWork)
      .where(inRange(isolatedSchema.permitToWork.createdAt));
    const active = rows.filter(r => r.status === 'active' || r.status === 'authorised' || r.status === 'approved').length;
    const closed = rows.filter(r => r.status === 'closed').length;
    return {
      data: { type: 'permit_to_work', rows, active, closed },
      summaryCount: `${rows.length} permits`,
      summaryNote: `${active} active / ${closed} closed`,
    };
  }

  if (reportType === 'risk_assessments') {
    const rows = await custDb.select().from(isolatedSchema.raBuilderAssessments)
      .where(inRange(isolatedSchema.raBuilderAssessments.assessmentDate));
    const now = new Date();
    const dueReview = rows.filter(r => r.nextReviewDate && new Date(r.nextReviewDate) < now).length;
    const approved  = rows.filter(r => r.status === 'approved').length;
    return {
      data: { type: 'risk_assessments', rows, dueReview, approved },
      summaryCount: `${rows.length} assessments`,
      summaryNote: `${dueReview} review due`,
    };
  }

  if (reportType === 'ppm_compliance') {
    const rows = await custDb.select().from(isolatedSchema.ppmWorkOrders)
      .where(inRange(isolatedSchema.ppmWorkOrders.dueDate));
    const now = new Date();
    const completed = rows.filter(r => r.status === 'completed' || !!r.completedDate).length;
    const overdue   = rows.filter(r => r.status !== 'completed' && !r.completedDate && r.dueDate && new Date(r.dueDate) < now).length;
    const pct = rows.length ? Math.round((completed / rows.length) * 100) : 0;
    return {
      data: { type: 'ppm_compliance', rows, completed, overdue, pct },
      summaryCount: `${rows.length} work orders`,
      summaryNote: `${pct}% complete / ${overdue} overdue`,
    };
  }

  // audit_inspection
  const rows = await custDb.select().from(isolatedSchema.auditRecords)
    .where(inRange(isolatedSchema.auditRecords.conductedAt));
  const passed = rows.filter(r => r.passed === true).length;
  const completed = rows.filter(r => r.status === 'completed').length;
  return {
    data: { type: 'audit_inspection', rows, passed, completed },
    summaryCount: `${rows.length} audits`,
    summaryNote: `${passed} passed`,
  };
}
```

### C3 — wire it into generate

In `/api/reports/generate`, after the existing `else if (reportType === 'compliance_gap')` block, add:

```ts
} else if (MODULE_REPORT_TYPES.includes(reportType as any)) {
  const built = await buildModuleReportData(context.customerId, reportType, fromDate, toDate);
  totalVisitors = built.summaryCount;
  avgDuration   = built.summaryNote;
  snapshotData  = JSON.stringify(built.data);
}
```

`snapshotData` is already saved into the `data` column lower down — no other change needed there. (The `data` column exists; the report row stores the snapshot just like `compliance_gap` does.)

### C4 — wire it into view and email

In **both** the `/api/reports/:id/view` and `/api/reports/:id/email` handlers, after the `else if (report.reportType === 'compliance_gap')` block, add the same branch. Prefer the saved snapshot, fall back to a fresh build (so an old report without `data` still renders):

```ts
} else if (MODULE_REPORT_TYPES.includes(report.reportType as any)) {
  if (report.data) {
    reportData = JSON.parse(report.data);
  } else {
    const rebuilt = await buildModuleReportData(context.customerId, report.reportType, report.dateFrom, report.dateTo);
    reportData = rebuilt.data;
  }
}
```

### C5 — render the HTML for each new type

In `server/emailService.ts`, inside `generateReportHTML`:

First add the titles to `reportTypeNames`:

```ts
health_safety: 'Health & Safety / BBS Report',
fire_risk: 'Fire Risk Assessment Report',
permit_to_work: 'Permit to Work Report',
risk_assessments: 'Risk Assessment Register',
ppm_compliance: 'PPM Compliance Report',
audit_inspection: 'Audit & Inspection Report',
```

Then add these branches after the existing `evacuation_readiness` branch (they reuse the existing `.stats-grid` / `.stat-card` / `table` / `.badge` styles, so they match the other reports). Dates use `en-GB`:

```ts
} else if (reportData.type === 'health_safety') {
  const rows = reportData.rows || [];
  const ser = reportData.incidents > 0
    ? ((reportData.goodSpots + reportData.positives) / reportData.incidents).toFixed(1)
    : '—';
  bodyContent = `
    <div class="stats-grid">
      <div class="stat-card red"><div class="stat-number">${reportData.incidents}</div><div class="stat-label">Incidents</div></div>
      <div class="stat-card amber"><div class="stat-number">${reportData.nearMisses}</div><div class="stat-label">Near Misses</div></div>
      <div class="stat-card green"><div class="stat-number">${reportData.goodSpots + reportData.positives}</div><div class="stat-label">Good Spots &amp; Positive Actions</div></div>
      <div class="stat-card red"><div class="stat-number">${reportData.riddor}</div><div class="stat-label">RIDDOR-Reportable</div></div>
      <div class="stat-card"><div class="stat-number">${ser}</div><div class="stat-label">Safety Engagement Ratio</div></div>
      <div class="stat-card amber"><div class="stat-number">${reportData.open}</div><div class="stat-label">Unresolved</div></div>
    </div>
    ${rows.length ? `<h3>Records</h3><table><thead><tr><th>Date</th><th>Type</th><th>Title</th><th>Location</th><th>Reported By</th><th>RIDDOR</th><th>Status</th></tr></thead><tbody>
    ${rows.map((r: any) => `<tr>
      <td>${r.incidentDate ? new Date(r.incidentDate).toLocaleDateString('en-GB') : '-'}</td>
      <td>${(r.recordType || '').replace('_', ' ')}</td>
      <td>${r.title || '-'}</td>
      <td>${r.location || '-'}</td>
      <td>${r.reportedBy || '-'}</td>
      <td>${r.riddorCategory ? '<span class="badge badge-red">Yes</span>' : '-'}</td>
      <td>${r.resolved ? '<span class="badge badge-green">Resolved</span>' : '<span class="badge badge-amber">Open</span>'}</td>
    </tr>`).join('')}
    </tbody></table>` : '<p>No health &amp; safety records in this period.</p>'}`;

} else if (reportData.type === 'fire_risk') {
  const rows = reportData.rows || [];
  bodyContent = `
    <div class="stats-grid">
      <div class="stat-card"><div class="stat-number">${rows.length}</div><div class="stat-label">Assessments</div></div>
      <div class="stat-card red"><div class="stat-number">${reportData.overdue}</div><div class="stat-label">Review Overdue</div></div>
    </div>
    ${rows.length ? `<h3>Fire Risk Assessments</h3><table><thead><tr><th>Title</th><th>Assessor</th><th>Assessed</th><th>Next Review</th><th>Status</th></tr></thead><tbody>
    ${rows.map((r: any) => {
      const overdue = r.nextReviewDate && new Date(r.nextReviewDate) < new Date();
      return `<tr>
        <td>${r.title || '-'}</td>
        <td>${r.assessorName || '-'}${r.assessorCompany ? ' (' + r.assessorCompany + ')' : ''}</td>
        <td>${r.assessmentDate ? new Date(r.assessmentDate).toLocaleDateString('en-GB') : '-'}</td>
        <td>${r.nextReviewDate ? new Date(r.nextReviewDate).toLocaleDateString('en-GB') : '-'} ${overdue ? '<span class="badge badge-red">Overdue</span>' : ''}</td>
        <td>${r.status || '-'}</td>
      </tr>`;
    }).join('')}
    </tbody></table>` : '<p>No fire risk assessments in this period.</p>'}`;

} else if (reportData.type === 'permit_to_work') {
  const rows = reportData.rows || [];
  bodyContent = `
    <div class="stats-grid">
      <div class="stat-card"><div class="stat-number">${rows.length}</div><div class="stat-label">Permits</div></div>
      <div class="stat-card green"><div class="stat-number">${reportData.active}</div><div class="stat-label">Active / Authorised</div></div>
      <div class="stat-card"><div class="stat-number">${reportData.closed}</div><div class="stat-label">Closed</div></div>
    </div>
    ${rows.length ? `<h3>Permits</h3><table><thead><tr><th>Permit #</th><th>Type</th><th>Work</th><th>Location</th><th>Contractor</th><th>Valid Until</th><th>Status</th></tr></thead><tbody>
    ${rows.map((r: any) => `<tr>
      <td>${r.permitNumber || '-'}</td>
      <td>${r.permitType || '-'}</td>
      <td>${r.workDescription || '-'}</td>
      <td>${r.workLocation || '-'}</td>
      <td>${r.contractorCompanyName || '-'}</td>
      <td>${r.permitValidUntil ? new Date(r.permitValidUntil).toLocaleDateString('en-GB') : '-'}</td>
      <td>${r.status || '-'}</td>
    </tr>`).join('')}
    </tbody></table>` : '<p>No permits raised in this period.</p>'}`;

} else if (reportData.type === 'risk_assessments') {
  const rows = reportData.rows || [];
  bodyContent = `
    <div class="stats-grid">
      <div class="stat-card"><div class="stat-number">${rows.length}</div><div class="stat-label">Assessments</div></div>
      <div class="stat-card green"><div class="stat-number">${reportData.approved}</div><div class="stat-label">Approved</div></div>
      <div class="stat-card amber"><div class="stat-number">${reportData.dueReview}</div><div class="stat-label">Review Due</div></div>
    </div>
    ${rows.length ? `<h3>Risk Assessments</h3><table><thead><tr><th>Title</th><th>Type</th><th>Location</th><th>Prepared By</th><th>Assessed</th><th>Next Review</th><th>Status</th></tr></thead><tbody>
    ${rows.map((r: any) => {
      const overdue = r.nextReviewDate && new Date(r.nextReviewDate) < new Date();
      return `<tr>
        <td>${r.title || '-'}</td>
        <td>${r.raType || '-'}</td>
        <td>${r.location || '-'}</td>
        <td>${r.preparedBy || '-'}</td>
        <td>${r.assessmentDate ? new Date(r.assessmentDate).toLocaleDateString('en-GB') : '-'}</td>
        <td>${r.nextReviewDate ? new Date(r.nextReviewDate).toLocaleDateString('en-GB') : '-'} ${overdue ? '<span class="badge badge-red">Overdue</span>' : ''}</td>
        <td>${r.status || '-'}</td>
      </tr>`;
    }).join('')}
    </tbody></table>` : '<p>No risk assessments in this period.</p>'}`;

} else if (reportData.type === 'ppm_compliance') {
  const rows = reportData.rows || [];
  bodyContent = `
    <div class="stats-grid">
      <div class="stat-card"><div class="stat-number">${rows.length}</div><div class="stat-label">Work Orders Due</div></div>
      <div class="stat-card green"><div class="stat-number">${reportData.completed}</div><div class="stat-label">Completed</div></div>
      <div class="stat-card red"><div class="stat-number">${reportData.overdue}</div><div class="stat-label">Overdue</div></div>
      <div class="stat-card ${reportData.pct >= 90 ? 'green' : reportData.pct >= 70 ? 'amber' : 'red'}"><div class="stat-number">${reportData.pct}%</div><div class="stat-label">Completion Rate</div></div>
    </div>
    ${rows.length ? `<h3>Work Orders</h3><table><thead><tr><th>Title</th><th>Assigned To</th><th>Due</th><th>Completed</th><th>Status</th></tr></thead><tbody>
    ${rows.map((r: any) => {
      const overdue = r.status !== 'completed' && !r.completedDate && r.dueDate && new Date(r.dueDate) < new Date();
      return `<tr>
        <td>${r.title || '-'}</td>
        <td>${r.contractorCompanyName || r.assignedEmail || '-'}</td>
        <td>${r.dueDate ? new Date(r.dueDate).toLocaleDateString('en-GB') : '-'} ${overdue ? '<span class="badge badge-red">Overdue</span>' : ''}</td>
        <td>${r.completedDate ? new Date(r.completedDate).toLocaleDateString('en-GB') : '-'}</td>
        <td>${r.completedDate || r.status === 'completed' ? '<span class="badge badge-green">Completed</span>' : '<span class="badge badge-amber">' + (r.status || 'Open') + '</span>'}</td>
      </tr>`;
    }).join('')}
    </tbody></table>` : '<p>No PPM work orders due in this period.</p>'}`;

} else if (reportData.type === 'audit_inspection') {
  const rows = reportData.rows || [];
  bodyContent = `
    <div class="stats-grid">
      <div class="stat-card"><div class="stat-number">${rows.length}</div><div class="stat-label">Audits</div></div>
      <div class="stat-card green"><div class="stat-number">${reportData.passed}</div><div class="stat-label">Passed</div></div>
      <div class="stat-card"><div class="stat-number">${reportData.completed}</div><div class="stat-label">Completed</div></div>
    </div>
    ${rows.length ? `<h3>Audits &amp; Inspections</h3><table><thead><tr><th>Title</th><th>Template</th><th>Conducted By</th><th>Conducted</th><th>Score</th><th>Result</th></tr></thead><tbody>
    ${rows.map((r: any) => `<tr>
      <td>${r.title || '-'}</td>
      <td>${r.templateName || '-'}</td>
      <td>${r.conductedBy || '-'}</td>
      <td>${r.conductedAt ? new Date(r.conductedAt).toLocaleDateString('en-GB') : '-'}</td>
      <td>${r.overallScore != null ? r.overallScore + '%' : '-'}</td>
      <td>${r.passed === true ? '<span class="badge badge-green">Pass</span>' : r.passed === false ? '<span class="badge badge-red">Fail</span>' : '<span class="badge badge-gray">' + (r.status || '-') + '</span>'}</td>
    </tr>`).join('')}
    </tbody></table>` : '<p>No audits in this period.</p>'}`;
```

That's it — the existing `<html>…${baseStyles}…${bodyContent}…</html>` wrapper renders all six.

---

## How to test when done

1. `npm run check` passes with no new type errors.
2. **Gating:** as a platform admin, turn **Permit to Work off** for a test company. Open `/reports` → the Permit to Work option is gone from the dropdown. Turn it back on → it reappears. Repeat the check for PPM, RA Builder and Audits (all default-off) and for Contractors (turn it off → the three contractor reports disappear).
3. **Bug 1:** generate a Weekly Visitor Log with an explicit "To Date" of today, after a visitor checked in this morning. Confirm that visitor now appears (before the fix they'd be missing).
4. **Bug 2:** dates on the page read "14 Jun 2026", not "Jun 14, 2026".
5. **Bug 3:** select a staff member with no email on the Reports page and hit Email — you get the "some staff have no email" toast and the report is not sent to a fake address.
6. **New reports:** with each module on and some data present, generate that module's report. Confirm the stat cards and table render in View, Print and the emailed copy. With no data in the range, confirm the friendly "No … in this period" line shows instead of a broken table.
7. Generate a report, then **delete the data** behind it and re-open it — it should still render from the saved snapshot (the `data` column), not error.
