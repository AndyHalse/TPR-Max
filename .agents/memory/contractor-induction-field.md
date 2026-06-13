---
name: contractorWorkers induction field mismatch
description: The contractorWorkers isolated schema uses siteInductionCompleted, not inductionCompleted — using the wrong name silently fails at DB level.
---

## Rule
When updating the `induction completed` flag on a contractor worker, always use:
- `siteInductionCompleted` (Drizzle JS property)
- `siteInductionCompletedAt` (Drizzle JS property)

These map to DB columns `site_induction_completed` and `site_induction_completed_at` on the `contractor_workers` table in customer isolated schemas.

**Never use** `inductionCompleted` / `inductionCompletedAt` on `isolatedSchema.contractorWorkers` — those column names (`induction_completed`) do not exist in the DB for contractor workers and the update will throw "column does not exist", which is silently swallowed by the try/catch in the quiz submission route.

**Why:** The `contractorWorkers` table predates other induction tables. When `induction_completed` was added to visitors/staff it was named `induction_completed`, but contractors already had `site_induction_completed`. The two names diverged.

**How to apply:**
- In `workerService.ts::markInductionCompleted` — use `siteInductionCompleted` ✓ (fixed)
- In any future code that updates contractor worker induction status directly
- The manual-save path in `databaseService.ts::updateContractorWorker` already correctly maps `inductionCompleted → siteInductionCompleted` at line ~2087

**Frontend note:** `ContractorEditModal.tsx` reads both names in one expression:
```js
const inductionVal = target.inductionCompleted === true || (target as any).siteInductionCompleted === true;
```
So the UI handles either field name from the API.
