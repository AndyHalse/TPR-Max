# Bug fix batch — Permit-to-Work module (June 2026 review)

Six fixes plus a small hardening batch, all in the Permit-to-Work module. The two files involved are `server/routes/permitToWork.ts` and `client/src/pages/PermitToWork.tsx` (plus small schema additions). Do them in order — Fix 1 is a broken feature, the rest are logic and audit-trail gaps. Each fix is self-contained: finish and sanity-check one before starting the next. Don't refactor anything that isn't listed here.

After each fix, run `npm run check` (tsc) and make sure there are no new type errors.

---

## Fix 1 — "Attach file" on a permit is broken (do this first)

The Supporting Documents upload on the permit detail dialog fails every time, for two separate reasons. Both halves must be fixed.

**Half A — server calls a function that doesn't exist.** `server/routes/permitToWork.ts:613`:

```ts
fileUrl = await objectStorage.uploadObject(objectKey, req.file.buffer, req.file.mimetype);
```

`ObjectStorageService` has no `uploadObject` method anywhere in the codebase — this throws and the route returns 500. The company-documents upload **in the same file** (lines 223–234) does it correctly. Replace the block at lines 610–614 with that working pattern:

```ts
if (req.file) {
  fileName = req.file.originalname;
  const privateDir = objectStorage.getPrivateObjectDir();
  const objectId = randomUUID();
  const fullPath = `${privateDir}/uploads/${objectId}`;
  const parts = fullPath.slice(1).split('/');
  const bucketName = parts[0];
  const objectName = parts.slice(1).join('/');
  const bucket = objectStorageClient.bucket(bucketName);
  const fileObj = bucket.file(objectName);
  await fileObj.save(req.file.buffer, { contentType: req.file.mimetype, resumable: false });
  fileUrl = `/objects/uploads/${objectId}`;
}
```

(`randomUUID` and `objectStorageClient` are already imported at the top of the file.)

**Half B — client doesn't send the CSRF token.** The raw `fetch` in `client/src/pages/PermitToWork.tsx:1277` (inside `handleFileChange` in `PermitDetailView`) sends no `x-csrf-token` header, so the server rejects it with 403 before the route even runs. There is already a `getcsrfToken()` helper inside `ComplianceLibrary` (line 521) — **move it to module scope** (top of the file, near the other helpers) so both components can use it, then add the header:

```ts
const res = await fetch(`/api/ptw/${permit.id}/attachments`, {
  method: 'POST',
  body: fd,
  credentials: 'include',
  headers: { 'x-csrf-token': getcsrfToken() },
});
```

Don't set a Content-Type header — the browser sets the multipart boundary itself.

**Verify:** open a draft permit → Details tab → Attach file → pick a PDF. It should appear in the Supporting Documents list and open in a new tab when clicked. (The link prefix logic at line 1314 already handles `/objects/...` URLs — no change needed there.)

---

## Fix 2 — The authoriser can't see who's doing the work

If a permit is assigned to a **contractor**, neither the permit detail dialog nor the "requires authorisation" email shows the person's name. A manager is approving hot works without seeing who's doing it.

**Change A — detail dialog.** In `client/src/pages/PermitToWork.tsx`, the Details tab grid (around line 1221) only renders a `staffName` row. Add a contractor row above it:

```tsx
{permit.contractorWorkerName && (
  <>
    <div className="text-gray-500 dark:text-gray-400">Contractor</div>
    <div className="font-medium">
      {permit.contractorWorkerName}
      {permit.contractorCompanyName ? ` — ${permit.contractorCompanyName}` : ''}
    </div>
  </>
)}
```

**Change B — authorisation email.** In `server/routes/permitToWork.ts`, the submit-notification email table (lines 410–416) has no assignee row. Add one after the "Work type" row:

```ts
<tr><td style="padding:4px 0;color:#6b7280">Assigned to</td><td>${esc(assignee)}</td></tr>
```

where `assignee` is built just above the template:

```ts
const p = permit as any;
const assignee = p.contractorWorkerName
  ? `${p.contractorWorkerName}${p.contractorCompanyName ? ` (${p.contractorCompanyName})` : ''} — Contractor`
  : p.staffName ? `${p.staffName} — Staff` : 'Not specified';
```

**Change C — escape user text in this email while you're in it.** `workLocation`, `workDescription` and the assignee name are user-typed and currently interpolated raw into HTML. Add a tiny helper near the top of the file and wrap every user-supplied value in this email AND in the two cron emails (lines 680 and 691, which interpolate `p.workLocation`):

```ts
const esc = (s: any) => String(s ?? '').replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
```

**Verify:** create a permit assigned to a contractor → submit → the email and the detail dialog both show the contractor's name and company.

---

## Fix 3 — Cancelling a permit leaves no audit trail

Right now **any logged-in user can cancel any permit — including one with live work running — and nothing records who did it or why.** Every other transition (authorise, reject, suspend, close) records who/when/why. For a safety-of-life audit trail this must too.

**Change A — schema.** Add four columns to the `permit_to_work` table definition in `server/isolatedSchema.ts` (table starts at line 2596), matching the style of the existing `suspendedById` group:

```ts
cancelledById: varchar("cancelled_by_id"),
cancelledByName: text("cancelled_by_name"),
cancelledAt: timestamp("cancelled_at"),
cancellationReason: text("cancellation_reason"),
```

Then find where `permit_to_work` is created for customer schemas (search `permit_to_work` in `server/customerDatabase.ts` / `server/migrationRunner.ts`) and add the columns there too, plus self-healing ALTERs for existing customers alongside the existing ones:

```sql
ALTER TABLE "${schemaName}".permit_to_work ADD COLUMN IF NOT EXISTS cancelled_by_id VARCHAR;
ALTER TABLE "${schemaName}".permit_to_work ADD COLUMN IF NOT EXISTS cancelled_by_name TEXT;
ALTER TABLE "${schemaName}".permit_to_work ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMP;
ALTER TABLE "${schemaName}".permit_to_work ADD COLUMN IF NOT EXISTS cancellation_reason TEXT;
```

**Change B — the cancel route** (`server/routes/permitToWork.ts:564`). New rules:

- `cancellationReason` is required in the body — 400 if missing.
- Draft or submitted permits: the creator **or** a manager/admin can cancel.
- Authorised, active or suspended permits: **manager/admin only** — there may be live work on site.
- Record who/when/why:

```ts
const { cancellationReason } = req.body;
if (!cancellationReason) return res.status(400).json({ error: 'Cancellation reason is required.' });
const status = (permit as any).status;
const isManager = req.user!.role === 'admin' || req.user!.role === 'manager';
const isCreator = (permit as any).createdById === req.user!.id;
if (['authorised', 'active', 'suspended'].includes(status) && !isManager) {
  return res.status(403).json({ error: 'Only managers or admins can cancel an authorised or active permit.' });
}
if (['draft', 'submitted'].includes(status) && !isManager && !isCreator) {
  return res.status(403).json({ error: 'Only the permit creator or a manager can cancel this permit.' });
}
const cancelledByName = `${req.user!.firstName || ''} ${req.user!.lastName || ''}`.trim() || req.user!.username;
// then in .set({...}): status: 'cancelled', cancelledById: req.user!.id, cancelledByName, cancelledAt: new Date(), cancellationReason, updatedAt: new Date()
```

**Change C — client.** Cancel currently fires instantly with no dialog (list dropdown ~line 401, detail view ~line 1411 via `onQuickAction('cancel')`). Make it use the existing reason dialog instead:

1. In `ACTION_CONFIG` (line 218): `cancel: { label: 'Cancel Permit', requiresReason: true, reasonLabel: 'Reason for cancellation *', reasonRequired: true, bg: 'bg-gray-600 hover:bg-gray-700' }`
2. In `handleActionConfirm` (line 199): add `if (type === 'cancel') body.cancellationReason = actionReason;`
3. Change both cancel triggers from `actionMutation.mutate(...)` / `onQuickAction('cancel')` to `setActionDialogState({ type: 'cancel', permitId, permitNumber })` (the detail view should call `onAction('cancel')`).
4. Add `cancelledByName`, `cancelledAt`, `cancellationReason` to the `Permit` interface, and add a cancelled event to the Timeline array (around line 1543):

```ts
(permit as any).cancelledAt ? { label: 'Cancelled', date: (permit as any).cancelledAt, by: (permit as any).cancelledByName, color: 'bg-gray-500', note: (permit as any).cancellationReason } : null,
```

**Verify:** as a non-manager, cancelling someone else's active permit is refused; cancelling your own draft asks for a reason; the timeline shows who cancelled and why.

---

## Fix 4 — Closing a permit always records "work completed satisfactorily"

The database has a `work_completed_satisfactorily` field that can be false, but the client hardcodes `true` (`PermitToWork.tsx:205`). The close dialog needs a Yes/No choice.

1. Add state next to `actionReason` (line 141): `const [closeSatisfactory, setCloseSatisfactory] = useState(true);` — reset it to `true` wherever `setActionReason('')` is called.
2. In the action dialog, when `actionDialogState.type === 'close'`, render a labelled Yes/No toggle above the notes box ("Was the work completed satisfactorily? *") — two buttons styled like the YES/NO checklist buttons are fine.
3. In `handleActionConfirm`: `body.workCompletedSatisfactorily = closeSatisfactory;` and if `closeSatisfactory === false`, require closure notes (disable the confirm button if the notes box is empty, same pattern as `reasonRequired`).
4. On the Details tab, when the permit is completed, show a row: "Work completed satisfactorily" → Yes / No (red if No). Add the field to the `Permit` interface.

The server route already accepts the value (`permitToWork.ts:554`) — no server change needed.

---

## Fix 5 — A suspended permit can be resumed after it has expired

Suspend a permit on Friday, resume it the following week — it goes straight back to `active` even though the validity window passed. The activate route checks the window (`permitToWork.ts:488`); resume (line 524) doesn't.

In the resume route, after the status check, add:

```ts
const now = new Date();
if (now > new Date((permit as any).permitValidUntil)) {
  return res.status(400).json({ error: 'Permit validity window has passed. Close this permit and raise a new one.' });
}
```

---

## Fix 6 — No way to edit a draft permit

`PUT /api/ptw/:id` exists on the server but **nothing in the client ever calls it**. When a manager rejects a permit it returns to draft — but the requester can't fix the dates or description, only re-answer the checklist. Two changes:

**Change A — server validation first.** The PUT route (`permitToWork.ts:333`) is missing the end-after-start check the POST has. Copy lines 130–135 from the create route into it (build `permitValidFrom`/`permitValidUntil`, reject if `permitValidUntil <= permitValidFrom`). Also return 400 if any of the six fields is missing.

**Change B — an Edit screen.** Add an "Edit Details" option for draft permits:

- In the list dropdown (next to "Submit for Authorisation", ~line 358) and as a small button on the Details tab when `permit.status === 'draft'`.
- It opens a dialog with the same fields as the create form's work-details and dates sections: work description, work location, start date/time, end date/time — pre-filled from the permit. Reuse the same client-side end-after-start guard from `CreatePermitForm.handleSubmit` (line 892).
- On save: `apiRequest('PUT', `/api/ptw/${id}`, fields)`, invalidate `['/api/ptw']` and `['/api/ptw', id]`, toast on success.
- Permit type and assignee are **not** editable — if those are wrong, cancel and raise a new permit.

**Verify:** reject a submitted permit → open it → Edit Details → change the end date → save → resubmit.

---

## Fix 7 — Small hardening batch (all in `server/routes/permitToWork.ts` unless stated)

1. **Duplicate permit numbers.** `generatePermitNumber` (line 87) counts rows and adds 1 — two permits created in the same moment get the same number. Change it to take the **max** existing sequence number for the year + 1 (parse the `PTW-YYYY-NNN` suffix), add a unique index in the customer-schema provisioning (`CREATE UNIQUE INDEX IF NOT EXISTS permit_to_work_permit_number_uq ON "${schemaName}".permit_to_work (permit_number)`), and on insert failure from that constraint retry once with a regenerated number.
2. **Checklist item ownership.** The checklist PATCH (line 368) updates by `checklistItemId` alone — it never checks the item belongs to the permit in the URL. Change the `.where()` to `and(eq(permitChecklist.id, checklistItemId), eq(permitChecklist.permitId, id))` (import `and` is already there) and return 404 if no row comes back.
3. **Stuck pending permits.** The daily cron (line 664) only auto-expires `authorised` permits past their window — drafts and submitted ones sit in "Pending" forever and can never be activated. Widen the filter to `inArray(permitToWork.status, ['draft', 'submitted', 'authorised'])` with the same `permitValidUntil < now` condition.
4. **Dead code.** Delete the `ensureTables` function (lines 31–85) — it is never called anywhere; the tables are provisioned in `customerDatabase.ts` / `migrationRunner.ts`. Before deleting, confirm `ptw_company_documents` creation really does exist in `customerDatabase.ts` (~line 989 — it does) so nothing is lost.

---

## Out of scope — do NOT attempt in this session

Checking the **selected contractor's own compliance** (insurance, induction, RAMS status from the contractor module) when raising a permit. That needs a design decision (warn vs block, which checks count) and will be specced separately. The current warning about the customer's own PLI/ELI/H&S policy documents stays as-is.
