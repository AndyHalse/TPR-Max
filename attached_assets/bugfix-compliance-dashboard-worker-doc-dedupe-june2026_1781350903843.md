# Bugfix: Compliance Dashboard — Right to Work double-counted + worker-doc status correctness (June 2026)

Fourth in the contractor-worker series. The three earlier prompts are applied and verified. Now that worker documents (Right to Work, CSCS, IPAF, training certs) flow into `contractor_documents` with `worker_id` set, the `/compliance-dashboard` double-counts Right to Work and counts unverified documents as compliant. Fix both, plus resolve the source-of-truth split.

Copy everything below the line into the Replit agent.

---

## Context — what changed upstream

Worker compliance documents are now uploaded as file evidence and stored in `contractor_documents` (worker_id set), via the worker Certificates tab, the emailed `/worker-upload` link, and the new contractor-portal worker upload. The worker certificate catalogue (`worker_certification_types`) includes `right_to_work`, `cscs_card`, `ipaf_card`, `cpcs_card`, `asbestos_awareness`, `manual_handling`, `working_at_height`, `first_aid`, `training`, `certification`. Company-level documents have been removed from the worker level. All good. But the compliance dashboard was written before this and now double-counts.

File: `server/routes/complianceDashboard.ts`.

---

## BUG 1 — Right to Work is counted twice (double-count + duplicate alerts)

- **Section 4 "Worker Right to Work"** (≈ lines 280–338, 15% of the contractor score) reads `contractor_workers.right_to_work_status` + `right_to_work_expiry_date` (the worker-table columns).
- **Section 6 "Worker Certifications"** (≈ lines 419–469, 10% of the contractor score) reads **every** active worker `contractor_documents` row with an expiry date — including `document_type = 'right_to_work'`.

So a worker's Right to Work is counted in BOTH domains. An expiring/expired RTW raises two separate issues — "Worker Right to Work expired" (Section 4) and "Worker certification expired — Right to Work" (Section 6) — and is weighted twice in the score.

**Fix:** in Section 6's SQL, exclude the document types that already have their own dedicated dashboard domain. Right to Work is the one with a dedicated domain (Section 4), so add `AND cd.document_type <> 'right_to_work'` to the Worker Certifications query. (CSCS, IPAF, CPCS, training certs have no separate domain, so they correctly remain in Worker Certifications.) The domain weights stay as they are; only the Worker Certifications denominator shrinks, which is correct.

---

## BUG 2 — Worker Certifications counts unverified / rejected documents as compliant

Section 6's query has **no `status` filter**:
```sql
WHERE cd.worker_id IS NOT NULL AND cd.is_active = TRUE AND cd.expiry_date IS NOT NULL
```
So a document still `pending` review, or one that was `rejected`, counts as **compliant** as long as its expiry date is more than 30 days away. That overstates compliance and contradicts the review workflow — a rejected certificate is not compliance evidence.

**Fix:** align with the status logic already used in `server/routes/contractorWorkerCerts.ts` / `WorkerCertificatesTab.tsx`:
- `status = 'approved'` and in date → compliant.
- `status = 'approved'` and expired/≤30 days → critical/warning (as now).
- `status = 'rejected'` → count as a warning issue ("certificate rejected — re-upload required"), NOT compliant.
- `status = 'pending'` → count as a warning ("certificate awaiting review"), and exclude from the compliant numerator (your call whether it stays in the denominator — be consistent and document it).

Do the same review for **Section 4 Worker Right to Work** if RTW evidence is meant to come from the approved document (see Bug 3): an approved in-date RTW = compliant; pending/rejected = not yet compliant.

---

## BUG 3 — Two disconnected sources of truth for RTW / CSCS / IPAF (the root cause)

The worker table still has `right_to_work_status`, `cscs_status`, `ipaf_status` columns, AND the same facts now live as uploaded `contractor_documents`. Nothing keeps them in sync. The dashboard even reads them inconsistently: **RTW from the column**, but **CSCS/IPAF from the documents**. The worker edit modal already tells users "Status and expiry are tracked automatically from the uploaded documents" — so documents are intended to be the source of truth, but the code doesn't deliver that.

Consequence: a worker can show "Right to Work: Valid" on the profile dropdown while their uploaded RTW passport document is expired (or vice-versa), and the dashboard's RTW expiry (from the column) ignores the real expiry on the uploaded document.

**Fix — make the approved document the single source of truth, and sync the worker-table columns from it:**
1. When a worker document of type `right_to_work` / `cscs_card` / `ipaf_card` is **approved** (in the review route `PUT /api/contractors/documents/:docId/review`, and on portal/worker-link upload+approval), update the matching worker-table column: set `right_to_work_status = 'valid'` + `right_to_work_expiry_date` from the document; `cscs_status = 'valid'`; `ipaf_status` accordingly. When such a document is rejected or expires, reflect that back (e.g. RTW → 'expired'/'pending'). Write a `worker_notes` audit line for the change (who/when/derived-from-document).
2. The worker profile's RTW/CSCS/IPAF status fields become **read-only, derived** indicators (shown as "tracked from uploaded document"), not free dropdowns — so there is exactly one place the fact is set. If you keep the dropdowns editable for now, at least make the upload/approval authoritative and have the dropdown reflect it.
3. After this, the dashboard reads consistently (RTW domain from the column that is now synced from the document; Worker Certifications from documents minus RTW). No fact is counted twice and no two screens can disagree.

If full sync is too large for this pass, ship Bugs 1 + 2 now (they remove the double-count and the false-compliant), and raise Bug 3 as the follow-up — but note in the PR that until Bug 3 lands, the RTW domain's expiry comes from the manual column, not the uploaded passport.

---

## CHECK 4 — Document Approvals vs portal-admin queue (confirm, likely no change)

Section 17 "Document Approvals" (≈ line 938) counts `contractor_documents WHERE status='pending' AND is_active=TRUE` — now correctly includes both company and worker pending docs, matching the portal-admin "Docs to review" queue. This is intended, not a double-count (same backlog surfaced on two screens). Just confirm the two counts agree (both use `status='pending' AND is_active=TRUE`) and that `documentApprovals` stays a warning bucket with a fixed score of 100 (it must not drag the domain scores).

---

## CHECK 5 — Legacy `worker_certifications` table (investigate)

There is a separate `worker_certifications` table and `/api/workers/:workerId/certifications` endpoints, distinct from the `contractor_documents`-based worker certificate system. The dashboard does not read it, but confirm whether anything in the worker profile still writes/reads it. If it is legacy/dead, remove it (or migrate its data into `contractor_documents`) so worker qualifications live in exactly one store. If it is still in use, document why and ensure it isn't creating a third, separate record of the same certificates.

---

## Verification

1. A worker with an expiring Right to Work produces **one** dashboard alert (in "Worker Right to Work"), not two. The RTW document no longer also appears under "Worker Certifications".
2. The contractor score is no longer inflated/deflated by RTW being weighted in two domains; `totalChecks` drops by the number of RTW documents previously double-counted.
3. Upload a worker CSCS document but leave it `pending` → it does NOT count as compliant in "Worker Certifications"; it shows as a warning. Approve it → it counts as compliant.
4. Reject a worker certificate → it shows as a warning/non-compliant, never compliant.
5. (If Bug 3 shipped) Approve a `right_to_work` document with an expiry date → the worker's profile RTW status shows Valid with that expiry, and the dashboard "Worker Right to Work" domain uses that same expiry. Change/expire the document → profile and dashboard both reflect it. A `worker_notes` entry records the sync.
6. Dashboard "Document Approvals" count equals the `/contractor-portal-admin` "Docs to review" count.
7. `npx tsc --noEmit` clean for `complianceDashboard.ts` and any review-route file touched. Tenant isolation (per-customer schema) unaffected.
8. Re-run the dashboard for a customer with no contractor data → all scores still default to 100 (no divide-by-zero), unchanged.

Do NOT change the domain weights, the company insurance section, or the staff sections.
