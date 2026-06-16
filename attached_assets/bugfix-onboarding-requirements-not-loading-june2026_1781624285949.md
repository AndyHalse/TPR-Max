# Bugfix — Contractor Portal "Onboarding Requirements" tab stuck on "Loading requirements…"

**Symptom:** On the Contractor Portal admin page, the new **Requirements** tab spins forever on "Loading requirements…" and never shows the UK contractor document list. Effort: small. Two root causes, fix both.

## Root cause

1. **The defaults are only seeded during the per-customer schema migration.** The UK defaults INSERT lives inside the Contractor Portal migration block in `server/customerDatabase.ts:1303` (`INSERT … ON CONFLICT (document_type) DO NOTHING`). For a customer whose schema was provisioned before that migration ran — or where the seed didn't complete — `contractor_onboarding_requirements` is **empty** (or the table is missing), so `GET /api/contractors/onboarding-requirements` (`server/routes/contractors.ts:5524`) returns `[]` (or 500s).

2. **The UI treats "empty" as "loading".** In `client/src/pages/ContractorPortalAdmin.tsx`:
   - The query (line ~185) has **no `queryFn`, no `isLoading`, no `isError`** handling — it relies on the default fetcher and only reads `data`.
   - The Requirements tab (line ~655) renders the spinner whenever `requirementsDef.length === 0`. So an empty array *or* a failed request both show "Loading requirements…" indefinitely.

## Fix 1 — Make the GET endpoint self-heal (seed-on-read)

This is the important one: it fixes every existing customer with no manual migration.

In `server/routes/contractors.ts`, `GET /api/contractors/onboarding-requirements`:
- Defensively `CREATE TABLE IF NOT EXISTS` the requirements table (same DDL as `customerDatabase.ts:1292`) before selecting, so a missing table can't 500.
- `SELECT … ORDER BY sort_order`. **If zero rows come back, run the UK defaults seed** (the exact `INSERT … ON CONFLICT (document_type) DO NOTHING` block from `customerDatabase.ts:1304-1314`), then re-select and return.
- Return the rows.

Extract the seed SQL into a small shared helper (e.g. `seedOnboardingRequirements(pool, schemaName)`) and call it from **both** `customerDatabase.ts` and this endpoint, so the default list lives in one place and can't drift.

## Fix 2 — Make the PUT toggle resilient

In `PUT /api/contractors/onboarding-requirements/:docType` (`contractors.ts:5541`): the current `UPDATE … WHERE document_type = $2` silently does nothing if that row was never seeded. Change it to an upsert so a toggle always persists:

```sql
INSERT INTO "<schema>".contractor_onboarding_requirements (document_type, label, is_required, sort_order)
VALUES ($2, $3, $1, 99)
ON CONFLICT (document_type) DO UPDATE SET is_required = $1, updated_at = NOW()
```
(Pass the label through from the client, or look it up from the known UK list so the label isn't blank for a freshly-inserted row.)

## Fix 3 — Fix the UI states (loading vs error vs empty)

In `ContractorPortalAdmin.tsx`:
- Pull `isLoading`, `isError`, `refetch` off the requirements `useQuery`.
- In the Requirements tab body, branch properly:
  - `isLoading` → show the "Loading requirements…" spinner (this is the *only* place it should appear).
  - `isError` → show an error state with a **Retry** button (mirror the existing `overviewError` pattern already in this file).
  - loaded **and empty** → show a short "No requirements configured" message with a **"Restore UK defaults"** button that calls the endpoint/refetches (with Fix 1 this should never happen, but don't fall back to an infinite spinner ever again).
  - loaded with rows → render the toggle list (unchanged).

## How to verify

1. On the existing customer that currently spins: open the Requirements tab → it now lists all nine UK document types (Public Liability, Employers' Liability, RAMS, Health & Safety required; CIS, Professional Indemnity, Modern Slavery, Environmental, Other optional). No manual `db:push` needed.
2. Toggle "RAMS" off then on → the change persists across a refresh (confirms the upsert).
3. Temporarily simulate an API failure (or 403) → the tab shows an error with Retry, not an endless spinner.
4. A brand-new customer still gets the defaults seeded by the existing migration (unchanged), and the tab loads first time.
5. The default list is defined in exactly one place (the shared seed helper) — confirm `customerDatabase.ts` and the GET endpoint both call it.
