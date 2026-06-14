# Compliance Intelligence Dashboard — make every "View" link land on the exact action point

## The problem

The Compliance Intelligence Dashboard (`/compliance-dashboard`) is going to be one of the most-used screens in TPR. Right now its "View" links are useless: they all dump the user on a generic page instead of taking them to the exact thing that needs fixing.

- The category cards (Contractor Insurance, RAMS Documents, etc.) all link to `/contractors`, `/hr`, etc.
- Every Critical Issue and Warning links to the same generic page — e.g. "Public Liability insurance expired — Delta Technical Services" just goes to `/contractors`, not to Delta's Documents tab.
- Top Contractor Risks all link to `/contractors`.

A user staring at "Staff DBS expired — Mark Anthony, 21 days overdue" should be ONE click from Mark Anthony's DBS record. Today they land on a list and have to hunt. Fix that.

The good news: the destination pages **already support deep-linking**. We just aren't building the links. No new routing work is needed on the target pages — only build the correct URLs.

### Deep-link support that already exists (verified — use these, don't reinvent)

- **Contractor detail page** `client/src/pages/ContractorDetails.tsx` reads `?tab=`, `?filter=missing`, and `?workerId=` from the URL on mount:
  - `?tab=` accepts: `workers`, `equipment`, `documents`, `safety`, `compliance`, `reporting`, `activity`, `portal`
  - `?filter=missing` on the **documents** tab filters to only documents whose status is `missing` or `expired` (i.e. the ones needing action)
  - `?workerId=<id>` auto-opens that worker's profile dialog (which contains the worker's **DBS** and **Certificates** sub-tabs)
  - Company-level documents (Public Liability, Employers' Liability, Professional Indemnity, Health & Safety Policy, CIS) live on the **documents** tab
  - The live RAMS module (RAMSManagement) lives on the **compliance** tab
  - Equipment lives on the **equipment** tab
- **Contractors list page** `client/src/pages/Contractors.tsx` reads `?gaps=true` (show only contractors with document gaps) and `?sort=true` (sort gaps-first).
- **Staff profile page** `client/src/pages/hr/StaffProfile.tsx` (route `/hr/staff/:id`) reads `?tab=` accepting: `employment`, `rtw`, `dbs`, `training`, `leave`, `absence`, `documents`, `onboarding`, `appraisals`, `attendance`.
- **Staff training** has its own page at `/hr/training`.
- **PPM** `client/src/pages/PPM.tsx` reads `?tab=` and `?view=planner`.

---

## Part 1 — Backend: build precise `linkPath` for every issue

File: **`server/routes/complianceDashboard.ts`**

Every `criticalIssues.push(...)` and `warnings.push(...)` currently sets a generic `linkPath`. Replace each one with a precise deep-link built from the IDs that are **already in scope** at that point in the code. Use this exact mapping.

### Contractor company-level issues (insurance, H&S policy)
The company id is `c.id` in the insurance loop.

- **Insurance EXPIRED** (`pl/el/pi/hs/chas/sc-expired-...`): `linkPath: \`/contractors/${c.id}?tab=documents&filter=missing\``
  (expired docs appear under the `missing` filter, so this lands them right on the gap)
- **Insurance EXPIRING soon** (`...-expiring-...`): `linkPath: \`/contractors/${c.id}?tab=documents\``
  (the doc isn't missing/expired yet, so don't apply `filter=missing` — show the full documents list with the "Expiring soon" badge)
- **No insurance on record** (`ins-missing-...`): `linkPath: \`/contractors/${c.id}?tab=documents&filter=missing\``

### RAMS documents
Company id is `r.companyId` (may be null — guard it). RAMS is managed on the **compliance** tab.

- **RAMS expired / expiring** (`rams-expired-...`, `rams-expiring-...`):
  `linkPath: r.companyId ? \`/contractors/${r.companyId}?tab=compliance\` : '/contractors'`

### Contractor inductions (worker-level)
Worker id is `w.id`, company id `w.company_id`.

- **Induction expired / not completed / expiring** (`ind-expired-...`, `ind-incomplete-...`, `ind-expiring-...`):
  `linkPath: w.company_id ? \`/contractors/${w.company_id}?tab=workers&workerId=${w.id}\` : '/contractors'`

### Worker Right to Work (worker-level)
Worker id `w.id`, company id `w.company_id`.

- **All worker RTW issues** (`wrtw-expired-...`, `wrtw-expiring-...`):
  `linkPath: w.company_id ? \`/contractors/${w.company_id}?tab=workers&workerId=${w.id}\` : '/contractors'`

### Worker DBS (worker-level)
Worker id `row.worker_id` (and `row.id` for the missing case), company id `row.company_id`. The worker dialog opened by `?workerId=` contains the DBS sub-tab.

- **All worker DBS issues** (`wdbs-expired-...`, `wdbs-expiring-...`, `wdbs-missing-...`):
  `linkPath: row.company_id ? \`/contractors/${row.company_id}?tab=workers&workerId=${row.worker_id ?? row.id}\` : '/contractors'`

### Worker Certifications (worker-level)
Worker id `row.worker_id`, company id `row.company_id`. The worker dialog contains the Certificates sub-tab.

- **All worker cert issues** (`wcert-rejected-...`, `wcert-pending-...`, `wcert-expired-...`, `wcert-expiring-...`):
  `linkPath: row.company_id ? \`/contractors/${row.company_id}?tab=workers&workerId=${row.worker_id}\` : '/contractors'`

### Equipment
Company id `equip.company_id`.

- **All equipment issues** (`equip-nocert-...`, `equip-expired-...`, `equip-expiring-...`):
  `linkPath: equip.company_id ? \`/contractors/${equip.company_id}?tab=equipment\` : '/contractors'`

### Staff Right to Work
The query already selects `rtw.staff_id`. Deep-link to the staff profile RTW tab.

- `rtw-expired-...`, `rtw-expiring-...`: `linkPath: \`/hr/staff/${row.staff_id}?tab=rtw\``

### Staff DBS
**The query must be updated** — it currently selects `d.id AS dbs_id, ... s.first_name, s.last_name` but **not the staff id**. Add `s.id AS staff_id` to the SELECT, then:

- `sdbs-expired-...`, `sdbs-expiring-...`: `linkPath: \`/hr/staff/${row.staff_id}?tab=dbs\``

### Staff Training
**The query must be updated** — add `s.id AS staff_id` to the SELECT (currently absent), then:

- `strtrain-expired-...`, `strtrain-expiring-...`: `linkPath: \`/hr/staff/${row.staff_id}?tab=training\``

### Site modules (leave as the module landing page — those pages list the items directly)
These don't have per-item deep-link support today, so keep them pointing at their module page (this is already correct):
- Compliance Certificates → `/compliance-certificates`
- Permits to Work → `/permit-to-work`
- Risk Assessments → `/ra-builder`
- Audits → `/audits`
- PPM / Maintenance → `/ppm`
- Fire Risk Assessment → `/fire-risk-assessment`

### Document Approvals warning
- `doc-approvals-pending`: change to `linkPath: '/contractors?gaps=true&sort=true'`

---

## Part 2 — Frontend: category card links + Top Contractor Risks

File: **`client/src/pages/ComplianceDashboard.tsx`**

### Category card "View" links (`CATEGORY_META`)
These cards are **aggregates across all contractors**, so a single link can't point at one contractor. Point each one at the most useful filtered destination instead of the generic page.

Update the `link` value in `CATEGORY_META` for the contractor categories so they open the contractors list pre-filtered to gaps, worst-first:

- `contractorInsurance`, `rams`, `inductions`, `workerRightToWork`, `workerDbs`, `workerCertifications`, `equipment`, `documentApprovals`:
  `link: "/contractors?gaps=true&sort=true"`

Leave the site/staff categories as they are, except improve the staff ones to their dedicated pages:
- `staffRightToWork` → keep `/hr` (no list-level RTW filter exists) **or** `/hr` is fine
- `staffDbs` → keep `/hr`
- `staffTraining` → `/hr/training`

(Site module links — complianceCerts, permits, riskAssessments, audits, ppm, fireRiskAssessment — are already correct, no change.)

### Top Contractor Risks
The "View" link for each contractor risk row is hard-coded to `/contractors`. Each risk object already has `c.id` (the contractor company id). Change the link to the contractor's documents tab filtered to gaps:

```tsx
<Link href={`/contractors/${c.id}?tab=documents&filter=missing`}>
```

(Most contractor risks are document/insurance gaps, so the documents tab with the missing filter is the right landing spot.)

### Issue items
`IssueItem` already renders `issue.linkPath` from the backend — no change needed there. Once Part 1 ships the precise paths, the Critical Issues and Warnings lists will deep-link automatically.

---

## Part 3 — Data correctness

### 3a. Insurance "No insurance on record" wording (approved-only is kept)
Keep the current rule that **only an approved insurance document counts** toward the company expiry columns the dashboard reads (it's the auditable, defensible behaviour). The confusing bit is that a freshly uploaded but not-yet-approved insurance certificate still shows as "No insurance on record", which makes it look like nothing was done.

Fix the wording, not the rule. In the insurance section of `complianceDashboard.ts`, when a company has no PL/EL expiry on record, check whether a **pending** insurance document exists for that company before deciding the message:

- Query (or reuse data for) `contractor_documents` where `company_id = c.id`, `document_type IN ('publicLiability','employersLiability')`, `status = 'pending'`, `is_active = TRUE`.
- If a pending insurance doc exists, change the warning title/detail to:
  - title: `'Insurance awaiting approval'`
  - detail: `\`${c.company_name} — insurance uploaded but not yet approved\``
  - keep `linkPath: \`/contractors/${c.id}?tab=documents\``
- If no document at all, keep the existing "No insurance on record" warning.

This way the dashboard tells the truth: "someone uploaded it, it just needs signing off" vs "genuinely nothing here".

### 3b. Verify every data point lands where it claims
While building the links, sanity-check that each issue's underlying data is actually reachable at the link target. Specifically confirm:

1. **Worker-level issues** — confirm the worker dialog opened by `?workerId=` does show the DBS and Certificates sub-tabs for that worker, and that induction/RTW status is visible/editable there. If induction is edited on the worker edit modal rather than the view dialog, point induction links at `?tab=workers` and confirm the worker is visible in the list.
2. **RAMS** — confirm the `compliance` tab is where a user actually manages/replaces a RAMS document (RAMSManagement component). If RAMS is also expected on the `documents` tab, pick the tab where the user can actually re-upload/renew.
3. **Staff DBS / Staff Training** — after adding `s.id AS staff_id` to those two queries, confirm the `?tab=dbs` and `?tab=training` tabs on `/hr/staff/:id` load that staff member's record.
4. **Counts vs lists** — spot-check that the number on a category card matches the number of related items in the Critical Issues + Warnings lists for that category (e.g. if Contractor Insurance shows "13 expired unclosed" style figures, the issues list should contain the matching items). Flag any category where the headline stat and the itemised issues disagree.

---

## Acceptance criteria

- Clicking "View" on a Critical Issue or Warning opens the **exact** contractor/staff record and the **correct tab** for that item (e.g. Staff DBS expired → that staff member's DBS tab; Public Liability expired for Delta → Delta's Documents tab filtered to gaps).
- Category card "View" links open the contractors list filtered to gaps (contractor categories) or the right HR page (staff categories).
- Top Contractor Risks "View" opens that contractor's Documents tab with the missing filter.
- An uploaded-but-unapproved insurance certificate shows "Insurance awaiting approval", not "No insurance on record".
- No regressions: the dashboard still loads, scores are unchanged, and every link resolves to a real page (no 404s, no blank tabs).
- British English throughout any user-facing text.

## Out of scope
- No changes to how the overall/domain scores are calculated.
- No new tab support added to site-module pages (Permits, Certificates, Audits, RA, FRA) — those keep their module-level links.
