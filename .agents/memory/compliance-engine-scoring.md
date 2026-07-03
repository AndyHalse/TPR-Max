---
name: Compliance engine scoring blind spots
description: Why the enterprise compliance engine can show false 100% scores, and the patterns that fix it
---

## Rule
The enterprise compliance score (`server/complianceEngine.ts`, `computeLiveScores`) is built from the per-site `compliance_items` table. Several real compliance signals do NOT live in that table or are time-sensitive, so they silently score 100% unless handled specially.

### 1 — Shared contractor pool docs are not site-linked
Company-level contractor docs (public/employers liability, RAMS, H&S) live in `contractor_documents` with no siteId, so they never reach `compliance_items`. An empty category scores 100. They must be scored separately and blended into BOTH the per-site displayed scores and the estate score — not only the estate. Blending only at estate level was the original cause of "all sites 100% but estate < 100".
**Why:** per-site cards and the Sites-page header counts read site scores, not the estate score.

### 2 — Pool/document scoring must be expiry-aware
A doc that is approved but expired (or expiring soon) must not score as fully compliant. Score per (company, docType): current=1, expiring≤30d=0.5, missing/expired/unapproved=0. Mirror the Contractor Pool UI's `docStatus` semantics so the dashboard and the pool page agree.

### 3 — Two-level entities (schedule → work order) must evaluate the parent
PPM scored 100 when a site used `ppm_schedules` with no explicit `ppm_work_orders`. Evaluate the parent schedule directly (overdue when `nextDueDate < today`), de-duplicated against any open child work order.

### 4 — Date-based statuses are stale unless read endpoints freshen first
`compliance_items` is only (re)written by `evaluateSite`, which otherwise runs on a daily cron. So "overdue today" PPM/expiries won't appear until the next cron run. Read endpoints that serve live scores (`/summary`, `/sites`, `/sites/:id`) must re-evaluate in-scope sites before scoring, bounded by a short per-site TTL + in-flight lock, sequential to respect the per-customer DB pool (max 5). `evaluateSite` is idempotent.

**How to apply:** Any compliance signal not tied to a siteId must be injected into `computeLiveScores` after the site loop AND blended per-site, not just into the estate. Keep the estate calc fed by RAW site scores so no-contractor customers are unchanged. Any date-derived status needs a freshness pass on the read path. Note: daily `compliance_snapshots` still store raw (non-pool-blended) scores — reports built on snapshots use the old semantics.

### 5 — Induction token fallback must read the SHARED db, not the isolated schema
There are two `induction_tokens` tables: one in `shared/schema.ts` (management/shared DB, actually written by `inductionService.ts`/`routes/induction.ts` on every quiz completion) and one in `server/isolatedSchema.ts` (per-tenant isolated DB — never written by any code path). `evalInductions` originally read the isolated one, so its "digital induction completed" fallback was permanently dead and Inductions could show 0% even for genuinely-inducted workers whose `siteInductionCompleted` flag hadn't been set directly. Fix: query `managementDb` + shared `inductionTokens`, scoped by `workerId IN (this site's worker ids)` and optionally `customerId`, then self-heal `contractorWorkers.siteInductionCompleted` in the isolated DB when a completed token is found but the flag wasn't set. `inductions` is not in `POOL_CATEGORIES` so it has no pool-blending rescue — a wrong table here shows as a hard 0%, unlike insurance/rams/certificates which get partially masked by pool blending.
**Why:** the isolated `inductionTokens` table looked like the "right" table to query (same schema module as everything else in `complianceEngine.ts`) but was silently dead — nothing in the induction quiz flow writes to it.
