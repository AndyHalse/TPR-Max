# Bugfix + improvements: Permit-to-Work — broken reminder labels, BST time-window drift, a self-authorise button that fails, no checklist re-check at authorise, plus permissions, audit-trail and cleanup (June 2026)

The **Permit-to-Work** module is well built. The status flow (draft → submitted → authorised → active → suspended → completed, plus reject / cancel / auto-expire) is properly enforced on the server, the seven permit types map to sensible UK-standard checklists, self-authorisation is blocked, and the daily cron auto-expires stale permits and chases overdue closures. None of that needs touching.

But a deep read turned up a handful of real bugs and a few process gaps. Two of them affect whether unsafe work can get signed off, so they matter for a safety system.

Andy has decided:
- **Live-permit actions (activate, suspend, resume, close) become managers/admins only** — matching how Cancel already works. (Note for Andy: this means an operative can't start their own authorised work without a manager present. If that's awkward on site, "creator or manager" is the alternative — say the word and I'll change it.)
- **The checklist stays editable after submit, but authorising re-validates it** — a "No" answer with no mitigating-control note, or an unanswered required item, must block authorisation.

Everything below the line goes to the Replit agent.

---

## THE PROBLEMS

Server file is `server/routes/permitToWork.ts` and client file is `client/src/pages/PermitToWork.tsx` unless stated otherwise.

### 1. Compliance-reminder emails show raw codes instead of document names (HIGH — customer-facing)

The daily cron builds its document labels from the wrong keys:

```ts
const DOC_TYPE_LABELS: Record<string, string> = {
  pli: 'Public Liability Insurance (PLI)',
  eli: 'Employers\' Liability Insurance (ELI)',
  hs_policy: 'Health & Safety Policy',
};
```

But the app actually stores document types as `public_liability_insurance`, `employers_liability_insurance`, `health_safety_policy` (see `COMP_DOC_TYPES` and `LEGAL_DOC_TYPES` in the client). So `DOC_TYPE_LABELS[doc.document_type]` never matches, and the expiry email falls back to the raw code — customers get *"Compliance Document Expiring — public_liability_insurance"*.

**Fix:** make the cron's labels use the same keys the app stores. Best to export a single shared map (e.g. `PTW_COMPANY_DOC_LABELS`) from `server/utils/ptwChecklists.ts` keyed by `public_liability_insurance` / `employers_liability_insurance` / `health_safety_policy`, and use it in both the cron and anywhere else a label is needed. One source of truth so this can't drift again.

### 2. Permit time windows drift by an hour during British Summer Time (HIGH — safety-relevant)

Start/end times are parsed with no timezone:

```ts
const permitValidFrom = new Date(`${plannedStartDate}T${plannedStartTime}:00`);
const permitValidUntil = new Date(`${plannedEndDate}T${plannedEndTime}:00`);
```

`new Date('2026-06-20T08:00:00')` (no offset) is interpreted in the **server's** timezone. On Replit the server runs in UTC, so an 08:00 permit booked by a UK user in summer is stored as 08:00 UTC = **09:00 BST**. The activation window check (`now < validFrom || now > validUntil`), the auto-expiry, the overdue-closure alert and the 2-hour expiry warning all then compare against a window that's an hour off real UK time for roughly half the year. For a system that gates high-risk work, the window needs to mean what the user typed.

**Fix:** parse the planned date/time as **Europe/London** wall-clock time, not server-local. Use a small timezone-aware conversion (e.g. via the date library already in the project, or compute the correct UTC instant for Europe/London) so that "08:00 on 20 June" always stores the instant that is 08:00 in London — whether BST or GMT. Apply the same parsing in **both** the create route (`POST /api/ptw`) and the update route (`PUT /api/ptw/:id`), which has the identical naive parse. Display is fine as-is (the UI shows the raw date/time strings) — only the stored `permitValidFrom` / `permitValidUntil` instants need fixing.

### 3. A manager who created a permit is offered an "Authorise" button that then fails (MED)

In the **list** dropdown menu, Authorise and Reject show for any manager on a submitted permit:

```tsx
{permit.status === 'submitted' && isManager && (
  <>
    <DropdownMenuItem onClick={() => setActionDialogState({ type: 'authorise', ... })}>Authorise</DropdownMenuItem>
    <DropdownMenuItem onClick={() => setActionDialogState({ type: 'reject', ... })}>Reject</DropdownMenuItem>
  </>
)}
```

The server correctly blocks self-authorisation (`if (permit.createdById === req.user!.id) return 403`), so a manager who raised the permit clicks Authorise and just gets an error toast. The **detail view** already gets this right — it gates on `isManager && !isSameUserAsCreator`. The two screens disagree.

Also inconsistent: self-authorise is blocked server-side, but self-**reject** is not.

**Fix:**
- In the list dropdown, hide Authorise/Reject when the current user created the permit (mirror the detail view's `!isSameUserAsCreator`). The page already has the current user (`user?.id`) — pass it through or compute `permit.createdById === user?.id`.
- Add the same self-check to the server **reject** route as exists on authorise, so a creator can't reject their own submission either. (Separation of duties should apply to both decisions.)

### 4. Authorising a permit doesn't re-check the safety checklist (MED — safety, per Andy's decision)

The checklist is validated only at **submit** (`PATCH /api/ptw/:id/submit` rejects incomplete required items and "No" answers with no control note). But the checklist remains editable in `submitted` status (by design — Andy wants it editable), and `PATCH /api/ptw/:id/authorise` does **no** checklist validation. So between submit and authorise, an answer could flip to "No" (or a control note be cleared) and the permit could still be authorised.

**Fix:** in the authorise route, before flipping the status, re-run the same checklist validation that submit uses:
- every required item must have a `response`;
- no item may have `response === 'no'` without a `notes` value.

If it fails, return 400 with a clear message (e.g. *"Checklist is no longer complete — N required item(s) or missing control note(s). Ask the requester to update it before authorising."*) so the authoriser knows to send it back. Pull this validation into one small helper used by both submit and authorise rather than duplicating it.

### 5. No record of who submitted a permit, or when (MED — audit trail)

The permit stores `authorisedAt`/`authorisedBy`, `closedAt`/`closedBy`, `cancelledAt`/`cancelledBy` — but there's **no `submittedAt` / `submittedById` / `submittedByName`**. The detail-view timeline shows "Submitted for authorisation" with no date and no name. For a legally-defensible permit record, the submission step should be captured like every other.

**Fix:**
- Add `submitted_at TIMESTAMP`, `submitted_by_id VARCHAR`, `submitted_by_name TEXT` to the `permit_to_work` table (add to the `CREATE TABLE` in `server/customerDatabase.ts` **and** as `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` alongside the existing `cancelled_*` migrations there, plus the matching fields in `server/isolatedSchema.ts`).
- Set them in the submit route.
- Surface them in the timeline (`submittedAt` / `submittedByName`).

### 6. Old rejection reasons never clear (LOW — cosmetic but confusing)

Rejecting a permit sends it back to `draft` but leaves `rejectionReason` / `rejectedAt` / `rejectedById` on the record. After it's re-submitted and authorised, the detail view still shows *"Rejected — reason …"*. 

**Fix:** clear `rejectionReason`, `rejectedAt`, `rejectedById` when a permit is re-submitted (in the submit route), so a stale rejection doesn't linger on a now-authorised permit. (Keep them while it sits in draft after rejection — that's useful — just clear on the next submit.)

### 7. Live-permit actions aren't permission-gated (MED — per Andy's decision)

`activate`, `suspend`, `resume` and `close` have **no role check** — any authenticated user with the feature enabled can start, suspend or close live high-risk work. `cancel` is already role-gated, so this is inconsistent.

**Fix (Andy's decision — managers/admins only):**
- Server: add the manager/admin check (same pattern as authorise/cancel: `if (req.user!.role !== 'admin' && req.user!.role !== 'manager') return 403`) to the `activate`, `suspend`, `resume` and `close` routes.
- Client: hide the Activate / Suspend / Resume / Close controls (both the list dropdown and the detail-view buttons) for non-managers, so nobody's offered a button that 403s. Submit-for-authorisation stays available to the creator regardless of role.

### 8. Dead duplicate schema in the route file (LOW — cleanup)

`server/routes/permitToWork.ts` defines an `ensureTables()` function (the `CREATE TABLE IF NOT EXISTS …` for `permit_to_work`, `permit_checklist`, `permit_attachments`, `ptw_company_documents`) that is **never called** — the tables are actually provisioned in `server/customerDatabase.ts`. It's a second copy of the schema that has to be kept in sync by hand and already risks drifting.

**Fix:** delete the unused `ensureTables()` from `server/routes/permitToWork.ts`. Confirm nothing references it first (it isn't called anywhere in that file). Leave the real provisioning in `customerDatabase.ts` untouched.

### 9. Replacing or deleting a compliance document orphans the old file (LOW — storage leak)

`PATCH /api/ptw/company-documents/:docId/replace` overwrites `file_url` with the new upload but never removes the previous object from storage; `DELETE /api/ptw/company-documents/:docId` deletes the DB row but leaves the file. Same applies to permit attachment delete. Files accumulate forever.

**Fix:** on replace and on delete, best-effort delete the old object from storage (the upload paths already build the object key from `file_url` — reuse that to resolve and delete, wrapped in `.catch(() => {})` so a missing file never breaks the request). Don't block the user-facing response on it.

### 10. Smaller optimisations (LOW — do if quick, skip if risky)

- **Permit-number generation** (`generatePermitNumber`) selects the **entire** `permit_to_work` table and computes max+1 in JS on every create. It's not race-safe (two simultaneous creates can collide) and there's no unique constraint on `permit_number`. At minimum, add a `UNIQUE` constraint on `permit_number` so a collision fails loudly rather than producing duplicates; ideally narrow the query to the current year's prefix.
- **`requirePermitToWorkFeature`** runs a `getCompanySettings` DB read on every PTW request. Fine for now — only worth a short-TTL cache if this route shows up in slow-query logs. Leave unless trivial.

---

## WHAT NOT TO CHANGE

- The status state machine and its transition guards — they're correct.
- The checklist content in `ptwChecklists.ts`.
- Keeping the checklist editable in `submitted` status (Andy wants it editable — item 4 adds a re-check at authorise instead of locking it).
- The self-authorise block (item 3 extends it to reject, doesn't remove it).

## ACCEPTANCE CHECKS

1. Let a compliance document (e.g. Public Liability Insurance) lapse and confirm the reminder email reads "Public Liability Insurance", not `public_liability_insurance`.
2. Create a permit for 08:00 during BST; confirm its stored validity window and the activation/expiry behaviour line up with 08:00 **UK** time, not 09:00.
3. As a manager, raise a permit, submit it, and confirm you are **not** offered Authorise or Reject on it in either the list or the detail view; a second manager can authorise it.
4. Submit a permit, then change a checklist answer to "No" with no control note; confirm a second manager **cannot** authorise it until it's fixed.
5. Confirm the timeline shows who submitted the permit and when.
6. Reject a permit, re-submit it, authorise it — confirm the old rejection reason no longer shows.
7. As a non-manager, confirm Activate / Suspend / Resume / Close are not available; as a manager, confirm they are.
8. Replace a compliance document and confirm the old file is gone from storage.

Run `npm run db:push` after the schema changes (new `submitted_*` columns and the `permit_number` unique constraint).
