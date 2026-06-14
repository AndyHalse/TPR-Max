# UAT-09 — Flag ACTIVE permits that are past their validity window as "Overdue"

## Context (this module is otherwise strong)
Permit-to-Work authorisation logic in `server/routes/permitToWork.ts` is well-built: role checks on every transition, separation of duties (you cannot authorise a permit you created — line ~508), and `activate` correctly refuses a permit whose validity window has already passed (lines ~556–558). This ticket is a refinement, not a critical bug.

## Why
The scheduled auto-expire job (lines ~756–762) intentionally expires only `draft`, `submitted` and `authorised` permits past `permitValidUntil` — it deliberately does NOT touch `active` permits (correct: you don't want to silently void a permit while live work is in progress, e.g. someone in a confined space).

The problem: an **`active` permit whose `permitValidUntil` has passed stays `active` forever** until someone manually closes it. The client renders the status badge straight from `permit.status` (`client/src/pages/PermitToWork.tsx` status map ~line 40, list badge ~line 1452), so it shows a normal "Active" badge with no visual warning. The only safeguard is a single overdue email (lines ~773–780). On a safety-critical document, a supervisor scanning the permit board would see a green "Active" permit that has actually run past its authorised end time — with no on-screen signal that work should have stopped.

## What to change (UI/derived-state only — do NOT auto-expire active permits)
1. **Server (read path):** when returning permits (`GET /api/ptw` and `GET /api/ptw/:id`), add a derived boolean such as `isOverdue = status === 'active' && new Date() > new Date(permitValidUntil)`. Do not change the stored `status`. (Alternatively compute this client-side — but server-side is cleaner for the dashboard/list to reuse.)
2. **Client:** when `isOverdue` is true, render the badge as a distinct **"Active — Overdue"** state in amber/red (not the normal green "Active"), and show the time elapsed past `permitValidUntil` (e.g. "2h past validity"). Add the same indicator anywhere active permits are summarised/counted.
3. **Optional but recommended:** change the overdue alert (lines ~773–780) from a single one-shot email (guarded by `expiryAlertedAt`) to repeat/escalate (e.g. re-alert every N hours while still active-and-overdue), so a missed first email doesn't mean silence. Keep it non-fatal.

## Acceptance test
- Create, authorise and activate a permit with a short validity window; let `permitValidUntil` pass.
- The permit must NOT auto-change to expired/cancelled (work-in-progress safety) — it stays `active`.
- But the permit board and detail view now show an amber/red "Active — Overdue" badge with elapsed time, not a normal green "Active".
- Closing the permit clears the overdue state as before.
- A permit still inside its validity window shows the normal "Active" badge (no regression).
