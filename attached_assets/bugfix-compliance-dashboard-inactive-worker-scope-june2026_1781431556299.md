# Bugfix: Compliance Dashboard — inactive / off-site contractor workers still count (June 2026)

Fifth in the contractor-worker series. The earlier prompts (RTW double-count, worker-doc status correctness, dedupe) are applied. This one fixes a scoping inconsistency: two of the four contractor-worker sections don't apply the same "active worker" filter the other two do, so deactivated and long-gone workers still raise critical issues and drag the score.

Copy everything below the line into the Replit agent.

---

## Context

`/compliance-dashboard` has four contractor-**worker** sections. They are meant to score the same population of workers — workers who are **active on the books AND have been on site in the last 12 months**. The dashboard already builds that population near the top:

```ts
// Active worker IDs (visited in the last 12 months)
let activeWorkerIds = new Set<string>(); // from contractor_visits.checked_in_at >= ago12Months
```

Two sections use it correctly. Two don't. The result: a contractor worker you deactivated, or one who hasn't visited in over a year, can still throw a **critical** compliance issue (expired DBS, expired CSCS, etc.) and lower the contractor score — with no way to clear it except editing/deleting the old document.

File: `server/routes/complianceDashboard.ts`.

---

## How the four sections currently filter

- **Section 3 — Contractor Inductions** — query `WHERE is_active = TRUE`, then `.filter(w => activeWorkerIds.has(w.id))`. ✅ Correct — active **and** recently on site.
- **Section 4 — Worker Right to Work** — query `WHERE cw.is_active = TRUE …`, then `.filter(w => activeWorkerIds.has(w.id))`. ✅ Correct.
- **Section 5 — Worker DBS** — main loop query has `cw.is_active = TRUE` but **no** `activeWorkerIds` filter. ❌ Counts active-but-long-gone workers. (Note: the *missing-DBS* sub-check lower down DOES apply `if (!activeWorkerIds.has(row.id)) continue;` — so this section is even inconsistent with itself.)
- **Section 6 — Worker Certifications** — query joins `contractor_workers cw` but has **neither** `cw.is_active = TRUE` **nor** the `activeWorkerIds` filter. ❌ Worst case — counts documents belonging to fully deactivated/removed workers.

---

## BUG 1 — Worker Certifications (Section 6) counts inactive and off-site workers

The query (≈ lines 424–432) is:

```sql
SELECT cd.id, cd.expiry_date, cd.document_name, cd.status, cd.document_type,
       cw.id AS worker_id, cw.first_name, cw.last_name, cw.company_id
FROM "<schema>".contractor_documents cd
JOIN "<schema>".contractor_workers cw ON cw.id = cd.worker_id
WHERE cd.worker_id IS NOT NULL
  AND cd.is_active = TRUE
  AND cd.document_type <> 'right_to_work'
```

There is no `cw.is_active` check, so a deactivated worker's expired CSCS/IPAF certificate is still raised as a **critical** issue and counted in `workerCertTotal`.

**Fix:** add `AND cw.is_active = TRUE` to the SQL, and apply the recent-visit filter the same way Sections 3 and 4 do — either in SQL (join against the recent-visit worker IDs) or by skipping rows where `!activeWorkerIds.has(row.worker_id)` inside the loop, before any counting. Match whichever style the file already uses so it reads consistently.

---

## BUG 2 — Worker DBS (Section 5) ignores the recent-visit filter

The main DBS loop (≈ lines 343–385) filters `cw.is_active = TRUE` but never checks `activeWorkerIds`, so a worker who is still on the books but hasn't been on site in over 12 months is scored — unlike Inductions and Worker RTW, and unlike this section's own "DBS required but missing" sub-check, which already filters on `activeWorkerIds`.

**Fix:** apply the `activeWorkerIds` filter to the main DBS loop too, so both the "expired/expiring DBS" path and the "missing DBS" path use the identical definition of an active worker. After this, a worker is in scope for DBS only if `cw.is_active = TRUE` **and** `activeWorkerIds.has(worker_id)`.

---

## Why this matters

- The contractor score and the overall score the customer sees are wrong whenever there are deactivated or dormant workers with lapsed documents — which is normal for any site that has run for a while.
- These phantom issues are unclearable from the dashboard: the worker is gone, so the only fix is to hunt down and edit/delete the old document.
- The "compliance turned red" Teams/email alert can fire off the back of workers who aren't even on site.

---

## Verification

1. Deactivate a contractor worker who has an expired CSCS document → the document **no longer** appears under "Worker Certifications" and no longer counts in `workerCertTotal`. Reactivate → it returns.
2. Take an **active** worker whose last `contractor_visits.checked_in_at` is more than 12 months ago, with an expired DBS → they no longer raise a critical "Worker DBS expired" issue, matching how Inductions/RTW already treat them.
3. The "DBS required but not on record" sub-check and the main DBS loop now include exactly the same set of workers (both `cw.is_active = TRUE` AND recently visited).
4. A worker who is active AND visited in the last 12 months still raises issues exactly as before — no regression for genuinely in-scope workers.
5. `totalChecks` and the contractor score drop only by the previously-counted out-of-scope workers; an account with no contractor data still defaults every score to 100 (no divide-by-zero).
6. `npx tsc --noEmit` clean for `complianceDashboard.ts`. Per-customer schema isolation unaffected.

Do NOT change the domain weights, the company insurance/RAMS sections, the staff sections, or the `document_type <> 'right_to_work'` exclusion from the earlier fix.
