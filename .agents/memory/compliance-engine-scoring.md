---
name: Compliance engine scoring blind spots
description: Two structural gaps in the compliance scoring engine that cause false 100% scores
---

## Rule
The compliance engine (`server/complianceEngine.ts`) has two categories that need special handling beyond the standard `compliance_items` table query.

### 1 — Contractor pool documents are never site-linked
Company-level contractor docs (publicLiability, employersLiability, RAMS, healthSafety) are stored in `contractor_documents` with `workerID = NULL` and **no siteId**. They never appear in `compliance_items`, so `calcCategoryScore([]) = 100` for every empty category.

**Fix applied in `computeLiveScores`**: After computing site scores, fetch all active contractor companies + their key docs, compute a pool score per category (% of companies with each doc approved), then blend 50/50 with the site average for insurance, rams, and certificates. Recalculate estate score from blended categories.

### 2 — PPM evaluation only checked work orders, not schedules
`evalPpm` originally queried only `ppm_work_orders` with `status IN ('scheduled', 'overdue')`. Sites that use `ppm_schedules` without explicit work orders scored 100% (empty → 100%).

**Fix applied in `evalPpm`**: Also query `ppm_schedules` for the site (status = scheduled/overdue). Derive effective overdue status from `nextDueDate < today`. Exclude schedules that already have an open work order (de-duplicate by scheduleId) to avoid double-counting.

**Why:** Both fixes are necessary because the compliance_items table is only populated by site-linked document evaluators, but two important compliance signals (contractor pool health and PPM schedules) live outside that pattern.

**How to apply:** Any new compliance category that tracks data not tied to a specific siteId must inject its contribution separately into `computeLiveScores` after the site loop. Any evaluator using a two-level entity (schedule → work order) must evaluate the parent schedule directly, not just open child work orders.
