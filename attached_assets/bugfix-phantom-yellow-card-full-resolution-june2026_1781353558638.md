# Bugfix: Phantom YELLOW card — finish the job (data + all display surfaces) (June 2026)

The phantom-yellow-card fix was only partly applied. `WorkerCard.tsx` was patched to gate the disciplinary banner on a real card, so the worker card shows "CLEAR – COMPLIANT". But the **Worker Details modal** (and several other views) still read the raw stored `currentCardStatus`, which is still `'yellow'` in the database for workers who were never issued a card. So the SAME worker shows CLEAR on the card and "YELLOW CARD – WARNING" in the details modal. Two things need fixing: the stale **data**, and the **other display surfaces** that were missed.

Copy everything below the line into the Replit agent.

---

## Root cause (confirmed)

1. **The data is still wrong.** Workers created before the schema default changed to `'clear'` still have `currentCardStatus = 'yellow'` (or `'red'`) stored with NO matching `card_issues` record — leftover from the old auto-calculation. There IS a correction routine, but it's a **manual admin endpoint** `POST /api/admin/migrate-card-status` (server/routes/induction.ts ~line 1296) that has to be invoked by hand per customer — so for most tenants it never ran. The bad values are still in the database.

2. **The display fix was applied to only one component.** `WorkerCard.tsx` correctly gates the banner on `hasActiveDisciplinaryCard` (the server flag computed from `card_issues`, set in databaseService.ts at the worker-mapping functions). Every other place still reads the raw `currentCardStatus`, so the phantom value leaks through:
   - `client/src/pages/ContractorDetails.tsx` — **the Worker Details "Current Safety Status" modal** (lines ~1921, 1927, 1939) ← the one in the screenshot.
   - `client/src/components/ContractorPassPreviewModal.tsx` (~line 111) — pass preview.
   - `client/src/pages/contractor/ContractorWorkerProfileDialog.tsx` (~lines 95–96).
   - `client/src/pages/contractor/ContractorPreviousTab.tsx` (several, ~lines 305, 346, 445).
   - `server/routes/passes.ts` (~lines 188–189) — QR pass shows "ADVISORY"/"RESTRICTED".
   - `server/emailService.ts` (~line 637) — compliance summary email shows a "Yellow" badge.

A worker with a phantom `'yellow'` shows CLEAR in `WorkerCard` but YELLOW everywhere above. That inconsistency is the bug.

---

## FIX 1 — Correct the data automatically (the essential fix)

Stop relying on a hand-called endpoint. Make the correction run automatically and idempotently for every customer.

1. Convert the logic in `POST /api/admin/migrate-card-status` into a proper migration that runs through the standard per-customer migration runner (the same mechanism other schema migrations use, e.g. in `server/missingTablesMigration.ts` / `contractorMigrations.ts`). For every worker whose `current_card_status` is `'yellow'`, `'red'` or `'pending'` but has **no `card_issues` row with `status = 'active'` of the matching type**, set `current_card_status = 'clear'` and write a `worker_notes` audit entry (`change_type = 'card_status_correction'`, who/when/old→new) — reuse `workerService.correctCardStatus` so the audit note is consistent.
2. Workers WITH a genuine active matching `card_issues` record keep their status.
3. It must be safe to run repeatedly (skip already-clean workers). Keep the manual admin endpoint too, but it should now be a no-op on already-migrated data.
4. Report, per customer, how many were corrected (log it).

After this, `currentCardStatus` is reliably `'clear'` unless a real card was issued — which on its own makes the Worker Details modal and all the other surfaces show CLEAR correctly, because they read that column.

---

## FIX 2 — Make every disciplinary display consistent (defence-in-depth)

So a future stray value can never again show "CLEAR on the card, YELLOW in the modal", make all disciplinary-status displays agree by gating on a real card, exactly like `WorkerCard.tsx` already does.

**Principle:** a yellow/red card is shown ONLY when there is an active `card_issues` record. The denormalised `currentCardStatus` column is a cache; `card_issues` (surfaced to the client as `hasActiveDisciplinaryCard`) is the source of truth.

Client (the worker object on these pages already carries `hasActiveDisciplinaryCard` from the list/detail endpoints — verify and use it):
1. **`ContractorDetails.tsx` "Current Safety Status" modal (lines ~1914–1944):** only show RED/YELLOW when `viewingWorker.hasActiveDisciplinaryCard === true` AND `currentCardStatus` is red/yellow; otherwise show CLEAR – COMPLIANT. (Mirror the WorkerCard logic — `hasActiveDisciplinaryCard ? <coloured badge> : <green CLEAR>`.) Apply the same guard to the red-card ban-date line and the lines further down (~1984–2007).
2. **`ContractorPassPreviewModal.tsx`** and **`ContractorWorkerProfileDialog.tsx`** and **`ContractorPreviousTab.tsx`:** same guard — disciplinary styling/labels only when `hasActiveDisciplinaryCard`.
3. Factor the "what colour/label is this worker's safety status" logic into one small shared helper (e.g. `getWorkerSafetyStatus(worker)` in `client/src/lib/utils.ts`) that all of WorkerCard, the modal, the pass preview, the profile dialog and the previous tab call — so they can never drift again. (Same single-source-of-truth lesson as the document-ownership work.)

Server (worker objects from `getWorkersByCompanyId` / `getAllContractorWorkers` already include `hasActiveDisciplinaryCard`):
4. **`server/routes/passes.ts` (~188):** only label a pass "ADVISORY"/"RESTRICTED" when `hasActiveDisciplinaryCard`; otherwise "CLEARED". If the worker object in that route doesn't carry the flag, look up active `card_issues` rather than trusting the column.
5. **`server/emailService.ts` (~637):** the compliance-summary "Yellow/Red" badge must reflect an active card, not the raw column. Use `hasActiveDisciplinaryCard` (or join `card_issues`).

---

## FIX 3 — Prevent recurrence

1. Confirm NOTHING writes `'yellow'`/`'red'` to `currentCardStatus` except `workerService.issueCard` (issue) and `revokeCard`/`correctCardStatus` (reset). The old auto-calculation must stay removed from `databaseService.updateContractorWorker`.
2. Confirm new workers default to `'clear'` (schema default already changed — verify it's live).
3. Add a test: a worker with no `card_issues` always reports CLEAR from the shared helper and from every endpoint, regardless of what's in the `current_card_status` column.

---

## Verification

1. Open the worker from the screenshot (Andy Halse) → **both** the worker card AND the "Current Safety Status" modal show CLEAR – COMPLIANT. No YELLOW anywhere.
2. Run the migration → it reports N workers corrected; re-running reports 0. The corrected workers each have a `card_status_correction` note.
3. Issue a genuine yellow card to a test worker → card, modal, pass preview, profile dialog, previous tab, QR pass and compliance email ALL show YELLOW consistently. Reset it → ALL show CLEAR consistently.
4. Manually set a worker's `current_card_status` to `'yellow'` in the DB with no `card_issues` row → every surface still shows CLEAR (the display now gates on the active card, not the column), proving the inconsistency can't recur.
5. The QR pass for a clean worker says "CLEARED", not "ADVISORY"; the compliance email shows "Clear", not "Yellow".
6. `npx tsc --noEmit` clean for the touched files; tenant isolation unaffected.

Do NOT change how genuine cards are issued or the red-card ban logic — only the phantom data correction and the read/display consistency.
