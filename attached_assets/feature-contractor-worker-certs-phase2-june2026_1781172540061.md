# Feature — Worker certificates: real evidence + expiry (Phase 2 of the worker-compliance roadmap)

**Priority: HIGH. Effort: medium–large. This is the foundational phase — Phases 3 and 4 build directly on it. Read the architecture note first; it changes a recommendation from the roadmap doc.**

Roadmap: `TPR Max - Roadmap/contractor-worker-compliance-roadmap.md`. Prior: Phase 1 (DBS) — `feature-contractor-worker-dbs-phase1-june2026.md`.

## The problem

A contractor worker's certificates (`contractor_workers` table) are stored as tick-boxes and status words with **no expiry date and no uploaded copy**:

- `cscsCard` (number) + `cscsStatus` (valid/expired/none/pending) — no expiry
- `ipafStatus` (none/3a/3b/1+/expired) — no number, no expiry
- `asbestosAwareness`, `manualHandling`, `workingAtHeight` — plain booleans

So "Asbestos Awareness: completed" can be ticked with nothing behind it — no certificate, no expiry, no evidence for an HSE audit. This phase turns those into **dated, evidenced records** and wires their expiry into compliance.

## Architecture — build on `contractor_documents`, don't add a parallel table

The roadmap doc suggested a new `worker_certifications` table. After checking the code, **don't** — the platform already has the right store. `contractor_documents` already has a `worker_id` column, plus `expiry_date`, `status` (pending/approved/rejected), `issued_by`, `document_url`, and AI-analysis fields. The token upload flow (`/api/doc-request/:token/upload` in `contractors.ts`) already writes evidenced, dated documents into it with a dedupe-by-type pattern, an audit note, and an admin notification email.

So the unified design is:

1. **A catalogue table for certificate *types*** — `worker_certification_types`: `key`, `name`, `legal_basis`, `category` (legal / site / training / safeguarding / trade), `requires_expiry` (bool), `requires_number` (bool), `is_active`. Seed it with the existing `WORKER_DOC_FRAMEWORK` from `client/src/pages/WorkerDocumentUpload.tsx` (Right to Work, PL, EL, CSCS, IPAF, H&S Policy, Training, Other) plus the Phase-1 DBS type. This is the single source of truth for "what certificates exist", so adding one later (Phase 4) is a catalogue row, not a code change.

2. **`contractor_documents` (with `worker_id`) is the evidence store** — each worker certificate is a document row tagged with `worker_id` + a `document_type` matching a catalogue key, carrying the uploaded copy, expiry date, and approval status. Date-driven, exactly like the rest of the platform.

3. **The tick-box columns become a read-through, then retire.** Compute a worker's cert status live from their `contractor_documents` rows (has approved doc? expired by date? expiring within 90 days?), not from the booleans. Keep the old boolean columns readable for one release for backward compatibility, but stop writing them and stop trusting them for compliance.

## What to build

- Migration: create `worker_certification_types` and seed it (mirror how other seed/catalogue data is provisioned per customer schema). Confirm `contractor_documents.worker_id` is populated going forward.
- Routes (`requireAuth`, customer-scoped):
  - `GET /api/contractors/workers/:workerId/certificates` — the worker's certs computed from `contractor_documents` joined to the catalogue, each with derived status (`valid` / `expiring_soon` (<90 days) / `expired` / `missing` / `pending_review`).
  - `POST /api/contractors/workers/:workerId/certificates` — upload/replace a worker certificate (reuse the existing object-storage + dedupe-by-type + audit-note + admin-email pattern from `/api/doc-request/:token/upload`; just key on `worker_id` as well as `companyId`). **Apply the Phase-1 lesson: if object storage fails, return an error — never save a row with an empty `document_url`.**
  - Admin approve/reject reuses the existing `PUT /api/contractors/documents/:docId/review` route — no new review flow needed.
- Expiry: worker certificate documents already flow through `expiry_date` and `expiry_alerted_at`. Make sure the existing contractor-document expiry digest cron includes worker-tagged documents (it may currently only consider company docs). Same 90-day window, same dedupe column.
- Compliance wiring:
  - `server/utils/contractorCompliance.ts` `getWorkerClearanceStatus()` — add reasons for any **required** certificate that is missing or expired. Make "required" configurable per worker/site (same opt-in approach as Phase 1 DBS — don't make every cert mandatory for every customer, or you'll mark existing workers non-compliant overnight). A simple per-customer "required worker certificates" setting (list of catalogue keys) is enough.
  - `server/routes/complianceDashboard.ts` — surface expired/expiring worker certificates in the contractor domain (a worker-competency signal), so they show on the dashboard's critical-issues and 90-day timeline.

## UI

In `client/src/pages/ContractorDetails.tsx`, replace the worker tick-box section with a **certificates panel**: one row per catalogue cert with status badge, expiry date, "view copy", and upload/replace. Keep CSCS/IPAF card numbers as fields on those rows. Show an overall worker compliance state (clear / expiring / expired / missing-required).

## Scope guard

- Don't build a brand-new `worker_certifications` table — use `contractor_documents` + the catalogue, as above.
- Don't expose this in the self-service portal yet — that's **Phase 3**.
- Don't add new certificate *types* beyond the existing framework + DBS — catalogue expansion is **Phase 4**.
- Don't delete the old boolean columns in this release; stop writing/trusting them and remove them in a later cleanup once nothing reads them.

## Verify

1. Upload a CSCS copy with a future expiry → worker cert panel shows "valid" with the date; a row exists in `contractor_documents` with `worker_id` set.
2. Set expiry to yesterday → status flips to "expired" live (no cron needed for display); worker appears in the expiry digest; if CSCS is marked required, `getWorkerClearanceStatus` returns non-compliant.
3. A worker with no required certs configured is unaffected (no false non-compliance) — confirms no regression.
4. Storage failure on upload returns an error and creates no row.
5. Expired worker cert shows on the compliance dashboard's critical list and 90-day timeline.
