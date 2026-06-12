# Bugfix + Refactor: Contractor Worker Process, Audit Trail & Deletion (June 2026)

Copy everything below this line into the Replit agent.

---

You are fixing the contractor worker management process in this app (the /contractors page and everything behind it). There are confirmed bugs, missing audit trails, and a missing delete capability. This is a compliance product — if a worker record is wrong and there is no audit trail of who did what and when, the customer is legally exposed. Treat every fix below as a compliance requirement, not a cosmetic one.

Work through the five sections in order. Do not skip the verification steps at the end.

---

## SECTION 1 — Phone number (and other mandatory fields) being lost

### Root causes (all confirmed in the code)

1. **Backwards field mapping in `server/routes/induction.ts`** (PUT `/api/contractors/workers/:id`, around line 1274). The `directFieldMappings` object contains BOTH of these lines:
   ```
   phoneNumber: 'phone',   // WRONG — maps phoneNumber into a key called "phone" that does not exist in the DB schema
   phone: 'phoneNumber',   // correct
   ```
   When a client sends `phoneNumber`, the value lands in `mappedData.phone`, then `insertContractorWorkerSchema.partial().parse(mappedData)` silently strips it (Zod drops unknown keys). The phone update is silently discarded.

2. **No server-side mandatory enforcement.** `phone_number` is nullable in the DB and `insertContractorWorkerSchema` does not require it. Mandatory checks exist only in some client forms, and not all of them.

3. **Multiple inconsistent worker creation paths:**
   - Admin wizard (`client/src/pages/contractor/ContractorAddWorkerDialog.tsx`) — requires phone client-side only.
   - Contractor portal (`server/routes/contractorPortal.ts`, POST `/api/contractor-portal/workers`, ~line 611) — only requires first and last name. Email and phone are optional. Workers created here have NULL phone, which is why admins later open the edit modal and get blocked by "Please fill in this field".
   - Walk-in form (`client/src/components/WalkInContractorForm.tsx`).
   - Each path validates differently.

4. **Three duplicate edit modals that drift apart:**
   - `client/src/pages/Contractors.tsx` has an inline edit-worker modal (`handleEditWorker`, ~line 703) that initialises `phone: worker.phone || ""` and has NO phone validation — saving writes an empty string over the existing phone number.
   - `client/src/components/ContractorEditModal.tsx` (the one with Profile / Visit History / H&S Documents / Notes tabs) — validates phone, mostly correct.
   - `client/src/components/EditContractorWorkerModal.tsx` — **dead code, imported nowhere**. Delete it.

### Required fixes

1. In `server/routes/induction.ts` PUT route: remove the `phoneNumber: 'phone'` line. Map both `uiData.phone` and `uiData.phoneNumber` to `mappedData.phoneNumber` (prefer `phoneNumber` if both present).
2. Add server-side validation on BOTH worker update routes (`PUT /api/contractors/workers/:id` in induction.ts and `PUT /api/workers/:id` in contractors.ts) and the admin create route (`POST /api/contractors/:companyId/workers`): `firstName`, `lastName`, `email`, `phone/phoneNumber` must be present and non-blank. If an update would overwrite an existing phone or email with an empty string, reject it with a 400 and a clear message ("Phone number cannot be blank — it is a mandatory field"). Never silently wipe a mandatory field.
3. Contractor portal POST `/api/contractor-portal/workers`: require email AND phone (mobile or landline) as well as names. Return a clear 400 if missing.
4. Consolidate the edit modals: keep `ContractorEditModal.tsx` as the single canonical edit modal. Replace the inline edit-worker modal in `Contractors.tsx` with it. Delete `EditContractorWorkerModal.tsx` entirely. There must be exactly ONE add-worker wizard and ONE edit-worker modal in the codebase when you are done.
5. Consolidate the two update endpoints: keep `PUT /api/contractors/workers/:id` as the canonical one, make `PUT /api/workers/:id` delegate to the same shared handler (or remove it and update its callers). Two endpoints with different field-mapping logic is how this bug happened.

---

## SECTION 2 — Phantom yellow cards (workers showing yellow cards no admin ever issued)

### Root cause (confirmed)

The system conflates two completely different things in one field (`currentCardStatus`):
- **Disciplinary cards** (yellow/red) issued deliberately by an admin via POST `/api/card-issues`, recorded in the `card_issues` table.
- **Compliance status** computed by `calculateWorkerCardStatus()` in `server/databaseService.ts` (~line 2298), which returns `'yellow'` if site induction is incomplete, CSCS/IPAF expired, or — worst of all — as the default fallback when it "can't determine status".

`updateContractorWorker()` runs this auto-calculation on EVERY worker update (unless `_bypassAutoCalculation` is set) and WRITES the result into `currentCardStatus`. The check-in flow also calls `updateContractorWorker`. So a brand-new worker whose induction isn't done yet gets `currentCardStatus = 'yellow'` written to the database the first time anyone touches their record — and `client/src/components/WorkerCard.tsx` renders `'yellow'` as a big banner saying **"YELLOW CARD - WARNING"**, indistinguishable from a real disciplinary card.

The reverse is also true and is even more dangerous: an admin issues a genuine disciplinary yellow card, then someone edits the worker's profile, the auto-calc runs on the merged data, decides the worker is compliant, and silently flips `currentCardStatus` back to `'clear'` — erasing a disciplinary card nobody revoked, with no record.

### Required fixes

1. **Separate the two concepts.** `currentCardStatus` becomes disciplinary-only: `clear | yellow | red`. It may ONLY be changed by:
   - POST `/api/card-issues` (admin issues a card),
   - the reset-card endpoints (admin lifts/downgrades a card),
   - a new explicit revoke action.
   Each of these must record who did it and when, and write a worker note (see Section 3).
2. **Remove the automatic card status calculation from `updateContractorWorker()` entirely.** Delete the auto-calc block and the `_bypassAutoCalculation` flag (no longer needed). Compliance gaps must never write to `currentCardStatus`.
3. Keep `calculateWorkerCardStatus`-style logic but rename it to `calculateComplianceStatus` and return it as a separate, computed, never-persisted field (e.g. `complianceStatus: 'compliant' | 'action_needed' | 'blocked'`) on worker read endpoints. The UI should show compliance gaps as their own indicator (e.g. an amber "Induction outstanding" or "CSCS expired" chip), clearly worded as compliance, never as a "card".
4. Update `WorkerCard.tsx` (and anywhere else rendering `currentCardStatus`): the "YELLOW CARD - WARNING" / "RED CARD - BANNED" banner shows ONLY when the worker has an active record in `card_issues`. Show compliance issues separately with different wording and styling.
5. **Data migration:** for every worker where `currentCardStatus` is `'yellow'` or `'red'` but there is NO active matching record in `card_issues`, reset `currentCardStatus` to `'clear'` and insert a worker note: changeType `card_status_correction`, note "Card status automatically corrected — yellow/red status had been set by the old compliance auto-calculation, not by an admin-issued card", changedBy `system-migration`. Workers WITH a genuine active card issue keep their status.
6. Default for new workers: `currentCardStatus = 'clear'` (change the schema default from `'pending'`; `'pending'` as a card status is meaningless and renders inconsistently).

---

## SECTION 3 — Full audit trail in Worker Notes (who did what, when)

The `worker_notes` table already exists with `changeType`, `oldValue`, `newValue`, `notes`, `changedBy`, `changedAt` — and the admin create route already writes good step-by-step notes. But that is the ONLY place that writes them. Close every gap:

1. **Worker profile updates** (the canonical PUT route): before updating, load the existing worker, diff it against the incoming changes, and write ONE worker note per save listing every changed field in plain English with old → new values. Example: `"Profile updated by andy.halse on 13/06/2026, 14:32:10. Changes — Phone: '01344 771569' → '01344 999888'; Right to Work: Pending → Valid; Site induction: Not completed → Completed."` Use changeType `profile_update` (or `compliance_update` if any of RTW/CSCS/IPAF/training fields changed). If nothing actually changed, write no note.
2. **Card issues:** POST `/api/card-issues` must write a worker note: changeType `card_issued`, notes `"YELLOW card issued by <username> on <date & time>. Offence: <offence name>. Details: <description>. Location: <location>. Witness: <witness>."` Same for red. The card reset endpoints already write notes — make their format match.
3. **Right to Work verification:** when RTW is set to `valid`, automatically stamp `rightToWorkVerifiedBy` (the logged-in username) and `rightToWorkVerifiedAt` (now) on the worker record — these columns already exist and are never populated. Include them in the audit note.
4. **Worker created via contractor portal:** add the same creation audit notes the admin route writes, with changedBy set to the portal user's identity (e.g. `portal:joe@contractor.com`).
5. **Check-in / check-out:** write a worker note (changeType `site_attendance`) recording check-in/out time and who processed it, if visits aren't already fully covered by the visit history tab.
6. **Archive / delete** — see Section 4.
7. The Notes tab in `ContractorEditModal.tsx` must display, for every note: the note text, the changedBy user, and the changedAt date AND time (en-GB format). Order newest first. Notes must be read-only once written — no edit or delete endpoint for worker notes may exist.

All `changedBy` values must come from the authenticated session (`req.user.username` / portal token), never from the request body.

---

## SECTION 4 — Worker deletion (currently broken and unexposed)

`DELETE /api/workers/:id` exists but: (a) no admin UI calls it, (b) it is a hard delete that hits foreign-key violations — 14+ tables reference `contractor_workers.id` with no cascade — so it returns 500 for any worker with notes, visits, or cards, and (c) it would destroy compliance history if it worked, which is the opposite of what an audit needs.

### Required implementation

1. **Soft delete (archive) as the standard path:**
   - New endpoint `POST /api/contractors/workers/:id/archive` (and an unarchive counterpart). Sets `isActive = false`, plus new columns `archivedAt`, `archivedBy`, `archiveReason` (require a reason, free text).
   - Writes a worker note (changeType `worker_archived`, who/when/why) and a company note ("Worker X archived by Y on date — reason").
   - Archived workers: excluded from the default workers list, the kiosk, check-in, and mustering; visible under an "Archived" filter; cannot check in; their full history and notes remain intact.
   - UI: an "Archive Worker" button in `ContractorEditModal.tsx` with a confirmation dialog that states the worker's history will be kept.
2. **Hard delete only for GDPR erasure:**
   - Keep `DELETE /api/workers/:id` but restrict it to admin-role users, require a confirmation payload (`{ "confirmName": "<worker full name>" }` which must match), and make it work: inside a single transaction, delete the worker's child rows (notes, card issues, visits, certificates, DBS records, documents, CO2 records — every table referencing worker_id) and then the worker.
   - Before deleting, write a company-level note: "Worker <name> permanently deleted (GDPR erasure) by <username> on <date & time>".
   - UI: inside the archive dialog, a secondary "Permanently delete (GDPR)" option, clearly marked as irreversible, with the type-the-name confirmation.
3. **Role checks:** add-worker, edit-worker, archive, hard delete, and card issuing must all check the user's role server-side (admin/manager level for archive and card issuing; admin only for hard delete). Currently any authenticated user can do all of it.

---

## SECTION 5 — Refactor for one consistent process

After Sections 1–4, do this consolidation pass so the process is driven by one code path:

1. Create one shared server-side module (e.g. `server/services/workerService.ts`) containing: `createWorker`, `updateWorker`, `archiveWorker`, `hardDeleteWorker`, `issueCard`, `revokeCard` — each one validating input, enforcing mandatory fields, applying changes, and writing audit notes. All routes (admin, portal, walk-in, check-in) call through this module. No route may write to `contractor_workers` directly.
2. One Zod schema for worker create/update shared by all routes, with `phone`→`phoneNumber` normalisation in exactly one place.
3. Delete dead code: `EditContractorWorkerModal.tsx`, the inline edit modal in `Contractors.tsx`, the duplicated mapping logic in the second PUT route.
4. Keep the existing 3-step Add Worker wizard UX exactly as it is — it works well. Only its plumbing changes.

---

## Verification (do all of these before declaring done)

1. Add a worker via the admin wizard with all mandatory fields → open the edit modal → phone, email, postcode all present. Check the Notes tab shows the three creation audit notes with user + date + time.
2. Edit the worker's phone number → save → reopen → new number persists. Notes tab shows a `profile_update` note with old → new values, user, date and time.
3. Attempt to save the edit modal with the phone field blanked → server rejects with a clear message; the stored phone is untouched.
4. Add a worker via the contractor portal without a phone number → rejected with 400.
5. New worker with induction NOT completed: worker card shows a compliance chip ("Induction outstanding"), NOT a "YELLOW CARD - WARNING" banner. Check the worker in/out — still no yellow card banner, and `currentCardStatus` in the DB is still `clear`.
6. Issue a real yellow card as an admin → banner appears, Notes tab shows "Yellow card issued by <user> on <date & time>" with the offence. Then edit the worker's profile → the yellow card banner is still there (auto-calc no longer erases it).
7. Run the migration → a worker who previously had a phantom yellow (no card_issues record) is now clear, with a correction note in their Notes tab.
8. Archive a worker (with reason) → disappears from the active list, appears under Archived filter, history intact, audit notes written. Unarchive works.
9. Hard delete a worker with visit history and notes as an admin (typing their name to confirm) → succeeds with no FK error, company note records the GDPR deletion.
10. Try archive/hard-delete/card-issue as a non-admin user → 403.
11. `npm run db:push` (or the project's migration command) runs cleanly; note any new columns (`archivedAt`, `archivedBy`, `archiveReason`) and the `currentCardStatus` default change.
12. Run the existing test suite; add tests for: the phone mapping fix, mandatory-field rejection, no auto-calc write on update, card status preserved after profile edit, archive flow, and hard-delete transaction.

Do NOT touch the kiosk or emergency mustering screens beyond excluding archived workers. Do not redesign any UI beyond what is specified.
