# Bugfix: Contractor Portal — request the legally correct documents from company vs worker (June 2026)

Third in the contractor-worker series, after `bugfix-add-worker-process-audit-june2026.md` (applied) and `bugfix-worker-phone-create-and-doc-ownership-june2026.md`. This one covers the **contractor portal and the document-request flow** specifically: making sure the **company** is asked for company documents and the **worker** is asked for worker documents — and closing the gap where the contracting company can't supply its workers' documents through the portal.

Copy everything below the line into the Replit agent.

---

## Background — the correct legal split (use as the rule everywhere)

**CONTRACTING COMPANY provides (company-level, held by the business):** Employers' Liability Insurance (Employers' Liability (Compulsory Insurance) Act 1969, min £5m), Public Liability Insurance, written Health & Safety Policy (Health and Safety at Work etc. Act 1974 s.2(3)), Professional Indemnity, CIS Registration (Finance Act 2004), RAMS, Modern Slavery statement (Modern Slavery Act 2015), Environmental Policy.

**INDIVIDUAL WORKER provides (per person):** Right to Work (Immigration, Asylum and Nationality Act 2006), CSCS card, IPAF/PASMA (Work at Height Regulations 2005 / PUWER 1998), CPCS/NPORS, Asbestos Awareness (CAR 2012), Manual Handling (MHOR 1992), Working at Height, First Aid (where applicable), DBS, site induction, occupational health.

A worker must NEVER be asked for the company's insurance or H&S policy. The company holds those once for the whole business.

---

## What is already CORRECT (verify, do not change)

1. **Contractor portal company documents** — `client/src/pages/contractor-portal/ContractorPortalDocuments.tsx`, the `UK_DOC_TYPES` array. All eight (Public Liability, Employers' Liability, Health & Safety Policy, RAMS, CIS, Professional Indemnity, Modern Slavery, Environmental, + Other) are correctly **company-level**. Leave this list as-is.
2. **Portal-admin role gate** — `GET /api/contractor-portal/admin-overview` and the invite/review routes use `requireAuth, requirePortalAdmin`. Keep.
3. **Doc review** records the reviewer and requires a rejection reason that emails the contractor. Keep.

---

## BUG A — The worker document-request page asks the WORKER for COMPANY documents

`client/src/pages/WorkerDocumentUpload.tsx` (the page a worker reaches via the emailed `/worker-upload/{token}` link, from `POST /api/contractors/workers/:workerId/request-documents`) defines `WORKER_DOC_FRAMEWORK` at the top. It wrongly includes three **company-level** items:
- `public_liability` — "Public Liability Insurance"
- `employers_liability` — "Employers' Liability Insurance"
- `health_safety_policy` — "Health & Safety Policy"

A worker cannot and should not provide these. (This is the same mistake found on the worker Certificates tab catalogue — it is hardcoded separately here, so the catalogue fix does NOT cover this page.)

**Fix:** remove those three entries from `WORKER_DOC_FRAMEWORK`. Keep `right_to_work`, `cscs_card`, `ipaf_card`, `training`, `certification`. Add the individual training/competence types to match the worker catalogue: `asbestos_awareness` (CAR 2012), `manual_handling` (MHOR 1992), `working_at_height` (Work at Height Regs 2005), `first_aid` (where applicable), `cpcs_card`. Keep the legal/site/training grouping.

---

## BUG B — The contracting company cannot upload its workers' documents through the portal

`client/src/pages/contractor-portal/ContractorPortalWorkers.tsx` lets a portal user add workers (name, email, mobile, trade) but gives them **no way to upload that worker's documents**. The contracting company holds its own workers' Right to Work, CSCS, IPAF and training certificates — for a contractor-compliance product they must be able to supply them through the portal, not only by the site admin emailing each worker individually.

**Fix:** add per-worker document upload to the contractor portal.
1. On the portal Workers page, each worker card gets a "Documents" action opening a panel that lists the **worker-level** catalogue ONLY (Right to Work, CSCS, IPAF, CPCS, Asbestos Awareness, Manual Handling, Working at Height, First Aid, Other certification) with upload + expiry + card-number fields and a status badge — mirror the styling of the existing `ContractorPortalDocuments.tsx` company-doc uploader and `WorkerCertificatesTab.tsx`.
2. New portal endpoints (auth: `requireContractorPortalAuth`, scoped to the portal user's own company so they can only touch their own workers):
   - `GET /api/contractor-portal/workers/:workerId/documents` — list worker docs + derived status.
   - `POST /api/contractor-portal/workers/:workerId/documents` — upload/replace, stored in `contractor_documents` with `worker_id` set, `company_id` = the portal user's company, `status = 'pending'`, and `uploadedBy = 'portal:<portalUserId>'` so it enters the same review queue (see Bug C). Verify the worker belongs to the portal user's company before writing — reject cross-company access with 403.
3. Do NOT offer the company-document types on the worker panel, and do NOT offer worker-document types on the company Documents page. Each list is scoped to its owner.

---

## BUG C — Portal-admin review queue is company-only and doesn't say which worker

`GET /api/contractor-portal/admin-overview` (server/routes/contractors.ts ~line 4784) builds `pendingDocs` filtering `uploadedBy LIKE 'portal:%'` and selecting `documentType · companyName` with **no worker name**. Consequences:
- Worker documents uploaded via the emailed `/worker-upload` link are stored with `uploadedBy = <admin user id>` (not `portal:%`), so they **never appear** in this central queue — they're only reviewable on the worker's own profile. The admin's "Docs to review" count understates the real backlog.
- Once Bug B is done, portal-uploaded worker docs WILL appear here, but the reviewer won't see which worker they belong to.

**Fix:**
1. In the `pendingDocs` query, LEFT JOIN `contractor_workers` on `contractor_documents.worker_id` and return `workerId`, `workerFirstName`, `workerLastName`. In `ContractorPortalAdmin.tsx`, when a pending doc has a worker, show "Worker: <name>" and a small "Worker document" vs "Company document" label next to `documentType · companyName`.
2. Decide and implement the review scope explicitly: the central queue should show **all** pending portal-relevant documents awaiting review — both company docs AND worker docs — so the admin has one backlog. Either broaden the filter to include worker-document uploads regardless of channel (portal link OR emailed worker link), or add a clear second section. Whichever you choose, the "Docs to review" stat must match what's actually outstanding. Keep tenant isolation (per-customer DB) intact.
3. Approving/rejecting a worker document must write a `worker_notes` audit entry (who, when, approved/rejected + reason) on that worker, the same way company-doc review already audits at company level.

---

## BUG D — One source of truth for the worker document framework

The worker document list is now defined in at least three places that have already drifted (which is how the company-docs-on-worker error spread): the `worker_certification_types` seed (`server/missingTablesMigration.ts`), `WorkerCertificatesTab.tsx` (reads the server catalogue), and `WorkerDocumentUpload.tsx` (hardcoded `WORKER_DOC_FRAMEWORK`), plus the new portal worker panel from Bug B.

**Fix:** make all worker-document UIs read ONE catalogue — the server `worker_certification_types` table (already exposed via `GET /api/contractor-workers/certification-types`). Replace the hardcoded `WORKER_DOC_FRAMEWORK` in `WorkerDocumentUpload.tsx` and the new portal worker panel with a fetch of that catalogue (filtered to active worker-level types). Likewise keep the company-document framework in one place. After this, adding or correcting a document type happens once and every screen follows.

---

## BUG E — Portal add-worker form doesn't enforce the fields the server now requires

`ContractorPortalWorkers.tsx` only client-validates first/last name, but the server (`workerService.createWorker`, portal path) now requires email AND phone — so a submit without them returns a 400 the user doesn't expect. Mark **Email** and **Mobile number** as required in the form (red asterisk + validation) to match the server. The form sends `mobileNumber`, which the server already accepts as the phone value — keep that.

---

## Verification

1. Open the emailed worker-upload link (`/worker-upload/{token}`) → **Public Liability, Employers' Liability and Health & Safety Policy are gone**; the worker is asked only for Right to Work, CSCS, IPAF, CPCS, Asbestos, Manual Handling, Working at Height, First Aid, Other.
2. In the contractor portal, open a worker → upload a CSCS card with expiry → it saves as pending and appears on that worker's profile in the main app.
3. That portal-uploaded worker doc appears in `/contractor-portal-admin` → Pending Documents, labelled "Worker document" with the worker's name and company. Approve it → worker profile shows it valid; a worker-note audit entry records the approval (who/when).
4. The portal company Documents page still shows only the 8 company documents; the worker panel shows only worker documents — no crossover.
5. "Docs to review" stat equals the true number of outstanding documents (company + worker).
6. Try to fetch/upload a worker's documents via the portal endpoints for a worker that belongs to a DIFFERENT company → 403.
7. Portal add-worker without email or mobile → blocked client-side with a clear message (matches the server requirement).
8. Confirm `WorkerDocumentUpload.tsx` and the new portal worker panel both read the server `worker_certification_types` catalogue (no hardcoded list remaining).
9. `npx tsc --noEmit` clean for the changed files; tenant isolation unaffected.

Do NOT change the company document catalogue, the portal role gates, or the company Documents tab.
