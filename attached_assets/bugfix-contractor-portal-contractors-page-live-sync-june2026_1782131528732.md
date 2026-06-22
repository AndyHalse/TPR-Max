# Fix: make the Contractors page show Contractor Portal changes live + notify on new workers + tidy labels and scale

**Module:** Contractor Portal ↔ Contractor Management ("Contractors") page
**Type:** Bug-fix / polish (no schema changes)
**`npm run db:push` required?** ❌ NO — nothing in this prompt changes the database schema.
**Build check:** run `npm run check` and `npm run build` before finishing; both must pass.

---

## Background (read first)

The Contractor Portal (what a contractor logs into) and the internal **Contractors** page
(`ContractorManagement.tsx` → `useContractorManagement.ts`, the LIVE one — `Contractors.tsx`
is legacy, do not touch it) already share the same underlying tables
(`contractor_companies`, `contractor_workers`, `contractor_documents`). A worker or document
added in the portal **does** save to the right records and the document-type keys already
match the page's compliance badges. The system is invite-only by design — the portal does NOT
create new companies, and that must stay true.

The problem is **visibility, not data**: the Contractors page does not refresh itself, so
portal additions only appear after a full page reload, which makes it look like the portal
isn't feeding the page. Fix the items below. Do not change the invite-only model and do not
weaken tenant isolation (every query stays scoped via `customerDbService.getCustomerDatabase`).

---

## 1. Make the Contractors page refresh so portal changes appear without a manual reload

File: `client/src/pages/contractor/useContractorManagement.ts`

The global React Query defaults turn off polling and refetch-on-focus
(`client/src/lib/queryClient.ts`: `refetchInterval: false`, `refetchOnWindowFocus: false`),
and a contractor's portal session cannot invalidate the admin's cache. So the admin's open
page goes stale.

- On the **companies** query (`queryKey: ["/api/contractors", customerId]`, ~line 70) add:
  `refetchOnWindowFocus: true` and `refetchInterval: 30000`.
- On the **all-workers** query (`queryKey: ["/api/contractors/workers/all", customerId]`, ~line 83) add the same two options.
- Find the **per-company worker list** query used by the "Workers" button/dialog and add `refetchOnWindowFocus: true` there too, so an open worker list updates when a contractor adds a worker.
- Keep the existing 30s/60s intervals already on the lone-worker and CDM queries as they are.

Goal: with the Contractors page open, a worker or document added in the portal should appear
within ~30 seconds, or immediately when the user clicks back onto the tab — no hard refresh needed.

## 2. Email the team when a contractor ADDS A WORKER via the portal

File: `server/routes/contractorPortal.ts`, handler `app.post('/api/contractor-portal/workers', ...)` (~line 688).

Today documents and onboarding-submission send an admin email, but adding a worker does not.
After the worker is created successfully, send a **non-fatal** notification email that mirrors
the existing document-upload email in the same file (reuse the same pattern exactly):

- Recipient: `process.env.CONTRACTOR_NOTIFY_EMAIL || process.env.BUG_REPORT_NOTIFY_EMAIL || 'andy@acsltd.eu'`.
- Use `new EmailService(pu.customerId)`.
- Subject: `👷 New worker added — <workerName> (<companyName>)`.
- Body: worker full name, the contractor company name (look it up by `pu.contractorCompanyId`),
  and a button linking to `${baseUrl}/contractors` (use the same `baseUrl` logic as the other
  emails in this file). Use the same ACS blue `#2460A9` header styling as the existing emails.
- Wrap the whole email send in `try/catch` and swallow errors (the worker was already created —
  the email must never fail the request). Keep all dates `en-GB`.

## 3. Fix the raw on-screen labels (missing translation keys)

File: `client/src/pages/contractor/ContractorCompaniesTab.tsx` renders labels via
`t()` that are **missing from the English locale**, so raw keys show on screen
(e.g. `companies.insuranceChip`, `badges.notstarted`). Add the missing keys to BOTH
`client/src/locales/en/contractors.json` and `client/src/locales/es/contractors.json`
(English values below; provide the natural Spanish equivalents in the `es` file).

Under the existing `"companies"` object add:
- `"insuranceChip": "Insurance"`
- `"publicLiabilityChip": "Public Liability"`
- `"employersLiabilityChip": "Employers' Liability"`
- `"healthSafetyChip": "Health & Safety"`
- `"cisRegistrationChip": "CIS Registration"`

Under the existing `"badges"` object add every status value that flows into
`t(`badges.${company.status ...}`)` (line ~246/377) and
`t(`badges.${badge.label.toLowerCase()...}`)` (line ~259/388). At minimum add:
- `"notstarted": "Not Started"`
- `"compliant": "Compliant"`
- `"approved": "Approved"`
- `"noncompliant": "Non-Compliant"`

Then **sweep** `client/src/pages/contractor/` for any other `t('companies.*')` or
`t(`badges.${...}`)` whose key is not present in `en/contractors.json`, and add those too,
so no raw `companies.*` or `badges.*` key can ever render. Confirm by loading the Contractors
page in English and checking every chip and badge shows real words.

## 4. Polish for correctness and scale

File: `server/databaseService.ts`, `getAllContractorCompanies` (~line 1692):

- **Worker count consistency:** the per-company `workersCount` currently counts ALL workers
  while the worker *list* (`getAllContractorWorkers`, ~line 1814) filters `isActive = true`.
  Add `eq(isolatedSchema.contractorWorkers.isActive, true)` to the count so the card number
  matches the visible list.
- **Remove the N+1:** it currently runs two queries per company inside `Promise.all` (a count
  query + a documents query each). Replace with a constant number of queries: fetch all active
  workers for the customer's companies once (grouped/counted by `companyId`), and all active
  company-level documents once, then build each company's `workersCount` and `documentsStatus`
  in memory from those results. Keep the exact same returned shape and the same `getDocStatus`
  rules (missing → expired → expiring(≤30 days) → status). This matters for large tenants
  (Cowiesburn-scale, 120+ companies).

File: `server/routes/contractorPortal.ts`, the two upload handlers (company doc upload ~line 555
and worker doc upload ~line 745):

- **File-type validation:** before saving to object storage, reject anything whose
  `req.file.mimetype` is not in an allowlist of
  `application/pdf`, `image/jpeg`, `image/png`, `image/webp`,
  `application/msword`,
  `application/vnd.openxmlformats-officedocument.wordprocessingml.document`.
  Return HTTP `415` with a clear message ("Please upload a PDF, image, or Word document.").
  Keep the existing 20 MB size cap. Continue deriving the stored object name from the random
  UUID (not the user's filename) so the filename can't influence the storage path.

---

## Acceptance test (please verify before finishing)

1. Log into the Contractor Portal as a test contractor, add a worker → within ~30s (or on tab
   focus) it appears on the Contractors page **without a manual reload**, and the team gets a
   "New worker added" email.
2. Upload a company document in the portal → it appears on the Contractors page and the right
   compliance chip updates, without a reload.
3. The Contractors page shows real words for every filter chip and status badge (no
   `companies.insuranceChip` / `badges.notstarted` raw keys), in both English and Spanish.
4. A company card's worker count equals the number of workers shown in its list.
5. Uploading a `.exe` (or other disallowed type) in the portal is rejected with a clear message.
6. `npm run check` and `npm run build` both pass.
