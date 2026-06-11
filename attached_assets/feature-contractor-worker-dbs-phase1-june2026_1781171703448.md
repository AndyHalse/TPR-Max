# Feature — Contractor Worker DBS (Phase 1 of the worker-compliance roadmap)

**Priority: HIGH — unblocks schools, care homes, and NHS deals. Effort: medium (one new table, one route file, compliance wiring, one cron helper). Mostly mirrors the existing staff DBS module, so there's a proven pattern to copy.**

## Background (what and why)

TPR records DBS checks for the customer's own **staff** (HR module: `server/routes/hrDbs.ts`, `staff_dbs` table, `client/src/components/StaffDbsTab.tsx`). But there is **no DBS anywhere for contractor workers** — `contractor_workers` has no DBS fields, and the contractor compliance check never looks at DBS. For any customer with a school, care home, or NHS site, a contractor's worker can be cleared for site access with no DBS on record at all. This phase closes that gap.

Build it by mirroring the staff DBS module as closely as possible — same shape, same status logic, same soft-delete and expiry-reminder patterns — but keyed to a contractor worker instead of a staff member.

---

## 1. New table: `contractor_worker_dbs`

Add it the same way `staff_dbs` is created (see `server/missingTablesMigration.ts:627`), so it's provisioned for every customer schema. Mirror the staff columns but key on `worker_id`.

```sql
CREATE TABLE IF NOT EXISTS contractor_worker_dbs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id TEXT NOT NULL,
  dbs_level TEXT NOT NULL,              -- basic | standard | enhanced | enhanced_barred
  certificate_number TEXT,
  application_reference TEXT,
  issue_date DATE,
  policy_expiry_date DATE,             -- renewal/review date used for expiry logic
  requested_by TEXT,
  verified_by TEXT NOT NULL,
  verified_date DATE NOT NULL,
  is_current BOOLEAN NOT NULL DEFAULT TRUE,
  notes TEXT,
  document_url TEXT,
  document_name TEXT,
  reminder_sent_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMP
);
```

**Heads-up — fix a latent bug while you're here:** the staff version (`hrDbs.ts`) inserts `document_url` and `document_name`, but the `staff_dbs` DDL in `missingTablesMigration.ts` doesn't declare those columns (they must be patched in elsewhere or the insert fails). Make sure `contractor_worker_dbs` declares `document_url`, `document_name`, **and `deleted_at`** from the start — all three are used by the route logic below. (Worth raising a separate ticket to backfill the missing `staff_dbs` columns too.)

DBS levels are England & Wales. Note for later (not this phase): Scotland uses PVG and Northern Ireland uses AccessNI — keep `dbs_level` as free text so those can be added without a schema change.

---

## 2. New route file: `server/routes/contractorWorkerDbs.ts`

Copy `server/routes/hrDbs.ts` and adapt: `staff_dbs` → `contractor_worker_dbs`, `staff_id` → `worker_id`, join to `contractor_workers` instead of `staff`. Use the same raw `pool.query` approach and the same status CASE expression (`no_expiry` / `expired` / `expiring_soon` (<90 days) / `valid`).

Endpoints (all `requireAuth`, customer-scoped via `req.customerId` — these are admin/staff endpoints, **not** portal endpoints):

- `GET  /api/contractors/workers/:workerId/dbs` — list DBS records for a worker (newest first, exclude soft-deleted).
- `POST /api/contractors/workers/:workerId/dbs` — create a record. Require `dbsLevel`, `verifiedBy`, `verifiedDate`. Set any previous record for that worker to `is_current = FALSE` first (same as staff).
- `PUT  /api/contractor-dbs/:id` — update.
- `DELETE /api/contractor-dbs/:id` — **soft delete** (`deleted_at = NOW()`), never a hard delete. DBS is safeguarding data — the audit trail must survive. (This is the same rule that was fixed for staff DBS.)
- `GET  /api/contractor-dbs/expiry-alerts` — all workers with a current DBS expiring within 90 days or already expired, joined to worker name/company.

Gate: use `requireAuth` only. Do **not** put this behind `requireHrFeature` (that's the staff HR module) or behind `featureContractorPortal` (the self-service portal) — contractor DBS belongs to contractor management generally. If a feature flag is wanted, add a dedicated `featureContractorDbs` defaulting **true**, but plain `requireAuth` is fine for Phase 1.

Register the routes wherever the other contractor routes are registered (alongside `registerContractorRoutes` / in `server/routes/index.ts`).

---

## 3. Wire DBS into the worker clearance decision — opt-in per worker

In `server/utils/contractorCompliance.ts`, `getWorkerClearanceStatus()` currently checks banned/suspended, Right to Work, and induction. Add DBS — but **make it opt-in so it doesn't break existing non-DBS customers** (a construction site doesn't need DBS, and we mustn't suddenly mark every existing worker non-compliant).

- Add a `dbs_required BOOLEAN DEFAULT FALSE` column to `contractor_workers` (migration in `customerDatabase.ts`, same pattern as the other `ADD COLUMN IF NOT EXISTS` calls there).
- In `getWorkerClearanceStatus`, only when `worker.dbsRequired === true`: look up the worker's current, non-deleted `contractor_worker_dbs` record and:
  - no current record → `reasons.push("DBS check required but not on record")`
  - `policy_expiry_date < today` → `reasons.push("DBS check expired")`

That way DBS only affects clearance for workers a customer has flagged as needing it (schools, care, NHS), and everyone else is unchanged.

---

## 4. Daily expiry reminders

Add `sendContractorDbsExpiryReminders(customerId, companyName)` to the new route file, mirroring `sendDbsExpiryReminders` in `hrDbs.ts` (same 90-day window, same `reminder_sent_at` 30-day dedupe, email the admin). Wire it into the **same daily cron** that runs the other contractor/HR reminder jobs.

Note: I couldn't confirm the staff `sendDbsExpiryReminders` is actually called by any cron (it's exported but I found no caller). When you wire the contractor one in, check the staff one is wired too — if it isn't, that's a real gap, so add both to the daily job registration.

---

## 5. Admin UI

Add a **DBS tab/section to the contractor worker record** (`client/src/pages/ContractorDetails.tsx`, where the worker is viewed/edited). Mirror `StaffDbsTab.tsx` — level, certificate number, issue date, expiry, verified by/date, notes, document upload, and a status badge (valid / expiring soon / expired). Add the `DBS required` toggle (the `dbs_required` flag from step 3) on the worker so admins can mark which workers need it.

A short "DBS" summary badge on the worker list/card (valid / expiring / expired / required-missing) would help, but the tab is the must-have for Phase 1.

---

## Scope guard — what's NOT in Phase 1

- **Contractor uploading their own worker's DBS via the self-service portal** — that comes in Phase 3 (worker documents in the portal) of the roadmap. Phase 1 is admin-side recording and verification, because verification must stay with the customer's staff, not the contractor.
- **Compliance dashboard scoring** — wiring DBS into `getWorkerClearanceStatus` (the access gate) and the expiry alerts is enough for Phase 1. Adding a DBS category to the compliance dashboard score can follow.
- Don't touch the staff DBS module beyond (optionally) backfilling its missing `document_url` / `document_name` columns as a separate fix.

## How to verify

1. On a worker with `dbs_required = false`, clearance is unchanged (no DBS warnings) — confirms no regression for existing customers.
2. Flag a worker `dbs_required = true` with no DBS record → `getWorkerClearanceStatus` returns non-compliant with "DBS check required but not on record".
3. Add an Enhanced DBS with a future expiry → worker becomes compliant; the DBS tab shows a green "valid" badge.
4. Set the expiry to yesterday → clearance returns "DBS check expired"; status badge shows "expired"; the worker appears in `GET /api/contractor-dbs/expiry-alerts`.
5. Soft-delete a record → it disappears from the list but the row still exists with `deleted_at` set.
6. Run the daily reminder job → admin receives an email for the expiring/expired DBS, and a second run within 30 days does not re-send.
