# Compliance Dashboard — remaining accuracy work (verified status + the one open fix) — June 2026

This is the consolidated, up-to-date prompt for `/compliance-dashboard`. Several earlier compliance-dashboard prompts are now **already applied in the live code** — do NOT redo them. After verifying the current codebase, only TWO items remain open. One has its own prompt (inactive-worker scope). The other — worker Right to Work / CSCS / IPAF source of truth — is specced in full below.

Copy everything below the line into the Replit agent.

---

## Already applied — DO NOT touch these (verified in current code)

Confirm by reading, then leave alone:

- **RAMS live-expiry** — `complianceDashboard.ts` Section 2 computes RAMS expiry live from `expiryDate` (lines ~160–212). Done.
- **Worker certs no longer double-count Right to Work** — Section 6 query has `AND cd.document_type <> 'right_to_work'` (line ~431). Done.
- **Worker certs status filter** — pending = warning, rejected = warning, only approved-and-in-date counts compliant (Section 6, lines ~438–494). Done.
- **Portal doc approval → company insurance columns** — `PUT /api/contractors/documents/:docId/review` (contractors.ts ~5189) syncs an approved **company** doc's expiry onto `contractor_companies` (publicLiability / employersLiability / professionalIndemnity / healthSafety columns, lines ~5218–5244). Done.
- **Compliance certificates next-due** — `getEffectiveDueDate()` (`expiryDate || nextDueDate`) is used across `complianceCertificates.ts`. Done.

Do not change domain weights, the company insurance/RAMS sections, or the staff sections.

---

## OPEN ITEM 1 — Inactive / off-site contractor workers still score (separate prompt)

Run `bugfix-compliance-dashboard-inactive-worker-scope-june2026.md` for this. Summary: Worker Certifications (Section 6) and the Worker DBS main loop (Section 5) don't apply the same "active AND visited in last 12 months" filter that Inductions (Section 3) and Worker RTW (Section 4) use, so deactivated/dormant workers' lapsed docs still raise critical issues and drag the score. That prompt has the full fix. Run it alongside this one — both are small and touch the same file.

---

## OPEN ITEM 2 — Worker Right to Work / CSCS / IPAF: two sources of truth (the fix)

This is the one genuinely-unbuilt piece of the old dedupe prompt (its Bugs 1 and 2 are already applied per the list above; only this "Bug 3" remains). The earlier prompt is superseded by what follows — use this version.

### The problem

The dashboard reads a worker's Right to Work from the **worker-table column** `contractor_workers.right_to_work_status` + `right_to_work_expiry_date` (Section 4, complianceDashboard.ts lines ~284–288). But the actual RTW evidence is now uploaded as a `contractor_documents` row (`worker_id` set, `document_type = 'right_to_work'`), reviewed and approved via the portal-admin queue.

Nothing syncs the column from the approved document. The doc-review route (contractors.ts ~5221) deliberately syncs **company** docs onto company columns but skips worker docs — see its own comment: *"Worker certs, CIS, RAMS, modern slavery and 'other' are intentionally skipped."*

Consequences:
- A worker can have an approved, in-date RTW passport uploaded while the dashboard still reads "expired"/"pending" from the stale column — or the reverse: column says "valid" while the uploaded passport has actually expired.
- CSCS/IPAF are read inconsistently too: the worker profile keeps `cscs_status`/`ipaf_status` columns, but Section 6 reads those certs from the documents. Two screens can disagree.
- The worker edit modal already tells users *"Status and expiry are tracked automatically from the uploaded documents"* — the code doesn't deliver that promise.

### The fix — make the approved document the single source of truth

1. **On approval, sync the worker column from the document.** In `PUT /api/contractors/documents/:docId/review` (contractors.ts ~5189), extend the existing approval block so that when `status === 'approved'` **and** the doc has a `workerId`, it maps the document type to the worker column and updates `contractor_workers`:
   - `right_to_work` → `right_to_work_status = 'valid'`, `right_to_work_expiry_date = doc.expiryDate`
   - `cscs_card` → `cscs_status = 'valid'` (+ expiry column if one exists)
   - `ipaf_card` → `ipaf_status = 'valid'` (+ expiry if present)
   Mirror the company-column pattern already in the route (try/catch, non-fatal warn on failure). Only act on the document types that have a matching worker column; skip the rest.

2. **On rejection (and when an approved doc later expires), reflect it back.** Rejecting a `right_to_work` doc → set `right_to_work_status = 'pending'` (or `'expired'` if its expiry has passed). Same shape for CSCS/IPAF. Keep it simple and consistent with how the status enum is used elsewhere.

3. **Audit it.** The route already writes a `worker_notes` `'document_review'` entry for worker docs (lines ~5304–5318). Extend that note (or add a second `'status_sync'` note) recording the derived column change — who, when, and which document it came from.

4. **Make the profile status derived, not a free dropdown.** On the worker profile, show RTW/CSCS/IPAF status as read-only "tracked from uploaded document" indicators. If you keep the dropdowns editable for now, at minimum make upload+approval authoritative so there is exactly one place the fact is set.

After this, Section 4 reads RTW from a column that is kept in sync with the approved passport, and Section 6 reads the other worker certs from documents (minus RTW) — no fact counted twice, no two screens disagreeing.

---

## Verification

1. Upload a worker `right_to_work` document with a future expiry and approve it → the worker profile shows RTW "Valid" with that expiry, and the dashboard "Worker Right to Work" domain uses the **same** expiry. Change/expire the document → profile and dashboard both follow it. A `worker_notes` entry records the sync (who/when/source document).
2. Reject a worker RTW document → the worker's RTW status is no longer "valid"; it shows pending/expired and is not counted compliant.
3. Approve a worker CSCS document → `cscs_status` reflects it; the cert still appears once under "Worker Certifications" (not double-counted against RTW).
4. A worker with no uploaded RTW document behaves exactly as before (no regression for manual-entry customers).
5. `npx tsc --noEmit` clean for `contractors.ts`. Per-customer schema isolation unaffected. An account with no contractor data still defaults every dashboard score to 100 (no divide-by-zero).
6. Run this together with the inactive-worker-scope prompt, then reload the dashboard for a real tenant and confirm the contractor score moves only in the expected direction (stale workers drop out; RTW now reflects the real passport).

Do NOT re-apply the already-done items listed at the top, change the domain weights, or alter the company insurance / RAMS / staff sections.
