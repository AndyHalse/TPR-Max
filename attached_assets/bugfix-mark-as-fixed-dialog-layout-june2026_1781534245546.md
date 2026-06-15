# BUGFIX — Tidy the "Mark as Fixed" confirm dialog layout

**Source:** Andy, 15 Jun 2026. The new Fix-&-Notify confirm dialog works, but the layout is cramped — three buttons with long labels squeezed into one row of a narrow dialog.

## Where
`client/src/pages/PlatformAdminBugReports.tsx` ~lines 632–708 (the `{/* Fix & Notify confirm dialog */}` block).

## The problem
The footer crams three actions onto one row inside a `max-w-md` dialog: **Cancel** (left) and, on the right, **"Mark Fixed — Skip notification"** + **"Confirm & Send Email"**. Two long labels side by side in a narrow dialog look cramped and unbalanced.

## The fix — stack the actions vertically, clear primary action
Keep the header, the email chip, and the "What was fixed?" note as they are. Rework only the footer (and widen slightly):
- Widen the dialog to `max-w-lg`.
- Replace the single cramped row with a **vertical stack of full-width buttons**, primary first:
  1. **Primary, full width, green:** `Confirm & Send Email` (or `Mark Fixed` when there's no reporter email). Keep the spinner/check icon.
  2. **Secondary, full width, outline** (only when `detail?.reporterEmail` exists): `Mark Fixed — Skip notification`.
  3. **Cancel** as a quiet, centered text/ghost button underneath.
- Give the stack comfortable spacing (`space-y-2`) and a top border/padding to separate it from the note field.
- On the email chip, keep the address on one line but make sure long addresses truncate gracefully (already `truncate` — keep it).

This makes the primary action obvious, stops the two long labels fighting for space, and reads cleanly on the narrow dialog and on mobile.

## Acceptance criteria
- The three actions no longer crowd a single row; the primary action is visually dominant and full-width.
- With a reporter email: three stacked buttons (Confirm & Send Email / Mark Fixed — Skip notification / Cancel).
- Without a reporter email: two stacked buttons (Mark Fixed / Cancel) — no empty "skip" option.
- Looks tidy at the dialog's width and on a phone-width screen.
- No change to behaviour — only layout. `handleConfirmFix(true/false)` wiring stays the same.
