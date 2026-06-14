# UAT-08 — Add audit trail for COMPANY-level contractor document approvals/rejections

## Why
The contractor document review endpoint `PUT /api/contractors/documents/:docId/review` in `server/routes/contractors.ts` (handler starts ~line 5189) is now correctly access-controlled (`requireAuth, requirePortalFeature, requirePortalAdmin`) — good.

But it only writes an **audit record for WORKER documents**. The audit write at ~line 5358 is gated on `if ((updated as any).workerId) { ... insert into workerNotes ... }`. For **company-level documents** (Public Liability, Employers Liability, Professional Indemnity, Health & Safety Policy, RAMS, CIS, Modern Slavery, etc. — these have no `workerId`), **no audit record is written at all**. The only trace is the overwriteable columns on the document row itself (`approvedBy`, `approvedAt`, `rejectedReason`), which:
- don't record the previous state,
- are overwritten on the next review,
- don't capture rejection history.

This matters because approving a company-level insurance/policy document **pushes its expiry date onto the contractor company record** (~lines 5218–5244), which directly drives the Compliance Dashboard score. So an action that changes a contractor's compliance status leaves no tamper-evident trail of who approved it, when, or what it was before. For a compliance product used in audits, that's a governance gap.

## What to change
In `server/routes/contractors.ts`, in the review handler (after the document update, alongside the existing worker-notes block ~line 5358):

1. Add a parallel branch for **company-level** documents — i.e. `if (!(updated as any).workerId && (updated as any).companyId) { ... }`.
2. Write an audit record into the existing **`company_notes`** table (defined in `server/isolatedSchema.ts` ~line 931 — check its columns and mirror how `workerNotes` is used). Capture at minimum:
   - `companyId`
   - `changeType: 'document_review'`
   - `oldValue: 'pending'` (or the prior status if easily available), `newValue: status`
   - a human-readable `notes` string: e.g. `Document "<documentName>" <approved|rejected> by reviewer (<reviewerId>). Reason: <rejectedReason>` and, when an expiry date was synced onto the company record, note that too (e.g. "Company <PL/EL/PI/H&S> expiry updated to <date>.")
   - `changedBy: reviewerId`
   - timestamp (use the table's default or set explicitly)
3. Wrap it in try/catch and log non-fatally, exactly like the worker-notes block, so an audit failure never blocks the review.
4. Keep the existing worker-notes branch unchanged — this adds coverage for the company-level case, it does not replace anything.

## Acceptance test
- Approve a company-level Public Liability insurance document → a `company_notes` row is created recording who approved it, when, the status change, and the expiry date synced to the company. The compliance dashboard reflects the new expiry as before.
- Reject a company-level RAMS document with a reason → a `company_notes` row records the rejection and the reason.
- Approve/reject a WORKER document → still writes to `workerNotes` exactly as before (no regression).
- Confirm an audit write failure (e.g. simulate) does not break the review response.

## Note
This is purely additive (new audit rows) — no migration if `company_notes` already has the needed columns. If `company_notes` lacks a suitable `changeType`/`oldValue`/`newValue` shape, mirror the `workerNotes` columns or add the minimal columns needed.
