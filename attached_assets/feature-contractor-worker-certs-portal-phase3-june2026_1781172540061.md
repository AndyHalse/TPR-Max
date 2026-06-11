# Feature — Worker documents in the self-service portal (Phase 3 of the worker-compliance roadmap)

**Priority: HIGH — this is the feature Andy originally asked for: contractors uploading their workers' CSCS, IPAF, DBS and training certificates through the portal. Effort: medium, and mostly assembly once Phase 2 exists. Do Phase 2 first.**

Roadmap: `TPR Max - Roadmap/contractor-worker-compliance-roadmap.md`. Depends on Phase 2 (`feature-contractor-worker-certs-phase2-june2026.md`) and Phase 1 (`feature-contractor-worker-dbs-phase1-june2026.md`).

## The problem

The self-service Contractor Portal lets a contractor log in and manage their company, but for workers it's bare:

- Add a worker = first name, last name, email, phone, job title, trade (`ContractorPortalWorkers.tsx`, `POST /api/contractor-portal/workers` in `contractorPortal.ts`). No certificates, no card numbers, no uploads.
- Document upload (`POST /api/contractor-portal/documents/upload`) only sets `companyId` — it can't attach a document to a specific worker.

So a contractor can't upload their worker's CSCS card copy or Asbestos Awareness certificate themselves. Today that all has to be done by the customer's admin or via a one-off token link. Phase 3 brings worker certificates into the portal, reusing the catalogue and evidence store built in Phase 2.

## What to build

All of this reuses Phase 2's catalogue (`worker_certification_types`) and evidence store (`contractor_documents` keyed on `worker_id`). The portal is just another front door onto the same data.

1. **Per-worker certificate upload in the portal.** New authenticated portal endpoint, e.g. `POST /api/contractor-portal/workers/:workerId/certificates`, behind `requireContractorPortalAuth`. It must:
   - confirm the worker belongs to the logged-in portal user's `contractorCompanyId` (don't trust a `workerId` from the request without checking ownership — a portal user must only touch their own company's workers);
   - reuse the Phase 2 upload logic (object storage, dedupe-by-type, expiry, `status = 'pending'`, audit note, admin notification email);
   - apply the Phase-1 rule: storage failure returns an error, never a row with an empty `document_url`.

2. **Worker certificate list in the portal.** `GET /api/contractor-portal/workers/:workerId/certificates` — same derived statuses as Phase 2 (valid / expiring_soon / expired / missing / pending_review), scoped to the caller's company.

3. **Extend the portal worker form/detail UI** (`ContractorPortalWorkers.tsx`): add CSCS/IPAF card numbers and a certificates section per worker (upload copy + expiry date), driven by the catalogue so the list matches the admin side exactly. Show each worker's overall compliance state so the contractor can see what's outstanding.

4. **Document review loop already exists** — uploads land as `pending` and appear in the admin "Pending Documents" tab (`ContractorPortalAdmin.tsx`), which already approves/rejects via `PUT /api/contractors/documents/:docId/review`. Make sure worker-tagged portal uploads show there too (the admin pending-docs query currently filters `uploadedBy startsWith 'portal:'` — keep that working for worker docs). Consider showing the worker name alongside the company on those pending rows.

5. **Close the loop to the contractor (small but worth it):** when an admin approves or rejects a worker certificate, email the portal user who uploaded it. The portal's whole point is the upload→review cycle, and right now the contractor never hears the outcome. (This applies to company documents too — fixing it here covers both.)

## Scope guard

- No schema work beyond what Phase 2 created — this is wiring the portal onto it.
- A portal user must only ever read/write workers and documents for **their own** `contractorCompanyId`. Verify ownership on every worker-scoped endpoint.
- Don't add new certificate types here — that's Phase 4.
- Don't let the contractor self-*verify* a certificate (e.g. DBS). Contractors upload; the customer's admin verifies/approves. Verification stays admin-side.

## Verify

1. Log into the portal, open a worker, upload a CSCS copy with expiry → it appears `pending` in the admin "Pending Documents" tab with the worker's name, and on the worker's cert list in the portal as "pending review".
2. Admin approves → portal shows "valid"; the uploading contractor gets an email; the cert counts toward compliance (per Phase 2).
3. Try to upload against a `workerId` from a different company (tamper the request) → rejected (ownership check).
4. Force a storage failure → error returned, no empty-URL row created.
5. Admin rejects a document → contractor receives a rejection email with the reason.
