# Fix — Permit-to-Work checklist: re-clicking an answer wipes the saved mitigating control note (verified against live codebase 14 June 2026)

## The problem (read this first)

This is on the Permit-to-Work page, in the safety checklist of an open permit. It quietly destroys a safety record, which is why it's the priority.

### Bug 1 — Toggling a YES / NO / N/A button erases the note already saved against that item (HIGH)

Here's the workflow it breaks:

1. On a checklist item the user answers **NO**. A red box appears asking for a "mitigating control note" — the written explanation of how the risk is being controlled. The user types it and it saves.
2. Later they reopen the permit, or click the same answer button again, or switch NO → YES → NO.
3. The note they wrote is **silently wiped from the database.** No warning, no undo. The textarea just goes blank.

Why it happens. When you click YES, NO or N/A, the page sends the answer *plus* whatever note is currently held in the page's short-term memory (`pendingNotes`) for that item. But `pendingNotes` only holds notes typed **in the current screen session**. For a permit that was just opened, it's empty. So the click sends "answer = no, note = (nothing)", and the server takes "nothing" to mean "clear the note" and overwrites the real saved note with a blank.

The exact lines:

- **Client** — `client/src/pages/PermitToWork.tsx:1552`, the YES/NO/N/A button:
  ```tsx
  onClick={() => canEdit && onChecklistUpdate(item.id, opt, pendingNotes[item.id])}
  ```
  `pendingNotes[item.id]` is `undefined` whenever the user hasn't typed a note in this session — which is the normal case for a reopened permit.

- **Server** — `server/routes/permitToWork.ts:379-380`, the checklist update:
  ```ts
  const [item] = await custDb.update(isolatedSchema.permitChecklist)
    .set({ response, notes: notes || null, respondedById: req.user!.id, respondedAt: new Date() })
  ```
  `notes || null` turns an absent note into `null`, so the saved note is overwritten and lost.

The proof it's a genuine oversight: the textarea's `onBlur` handler 30 lines down (`PermitToWork.tsx:1583`) already does the right thing — it falls back to the existing note with `pendingNotes[item.id] ?? item.notes ?? ''`. The button handler just below the buttons was never given the same fallback. So the two paths disagree, and the button path is the one that loses data.

**Why this matters for TPR specifically.** The mitigating control note is the legally meaningful part of a permit — it's the written evidence that a hazard answered "No" (control *not* in place as standard) has been dealt with another way. Losing it silently means the permit's audit trail says a control was missing with no record of how it was managed. For a product that sells a "legally defensible audit trail", that's the worst field to drop.

### Bug 2 — Checklist tab counter shows the wrong total (MINOR, cosmetic)

On the permit detail dialog, the **Checklist** tab badge (`PermitToWork.tsx:1253`) reads:

```tsx
{completedCount}/{checklist.length}
```

But `completedCount` (line 1216) only counts **required** items, while `checklist.length` is **every** item including optional ones. So a permit with 14 items where all 12 required ones are done shows "12/14" in amber — looking like 2 things are still outstanding — even though the permit is actually ready to submit. The running banner inside the tab already uses the correct denominator (`requiredItems.length`, line 1505); only this badge is out of step.

**Scope:** two files — `client/src/pages/PermitToWork.tsx` (both fixes) and `server/routes/permitToWork.ts` (a defensive guard for Fix 1). Don't touch the permit state machine or the submit/authorise logic. Run `npm run check` when done.

---

## Fix 1 — Preserve the existing note when an answer button is clicked (PRIORITY)

Two small changes. Do both — the client fix stops the common case, the server guard makes it safe regardless of what any client sends.

### 1a. Client — give the button the same fallback the textarea already has

In `client/src/pages/PermitToWork.tsx`, find the YES/NO/N/A button around line 1552:

```tsx
onClick={() => canEdit && onChecklistUpdate(item.id, opt, pendingNotes[item.id])}
```

Change it to fall back to the note already on the item:

```tsx
onClick={() => canEdit && onChecklistUpdate(item.id, opt, pendingNotes[item.id] ?? item.notes ?? undefined)}
```

Now clicking an answer keeps any note the user typed this session, and if they haven't typed one, it keeps the note already saved on the record instead of blanking it.

### 1b. Server — only overwrite the note when one was actually sent

In `server/routes/permitToWork.ts`, in the `PATCH /api/ptw/:id/checklist/:checklistItemId` handler (around line 368-384), the update currently always writes `notes`:

```ts
const { response, notes } = req.body;
```
```ts
const [item] = await custDb.update(isolatedSchema.permitChecklist)
  .set({ response, notes: notes || null, respondedById: req.user!.id, respondedAt: new Date() })
  .where(and(eq(isolatedSchema.permitChecklist.id, checklistItemId), eq(isolatedSchema.permitChecklist.permitId, id)))
  .returning();
```

Change it so the note is only updated when the request actually included one. Build the update object conditionally:

```ts
const { response, notes } = req.body;
```
```ts
const updateValues: Record<string, any> = {
  response,
  respondedById: req.user!.id,
  respondedAt: new Date(),
};
// Only touch the note when the client explicitly sends one.
// An absent note must NOT wipe a previously saved mitigating control note.
if (notes !== undefined) {
  updateValues.notes = notes === '' ? null : notes;
}

const [item] = await custDb.update(isolatedSchema.permitChecklist)
  .set(updateValues)
  .where(and(eq(isolatedSchema.permitChecklist.id, checklistItemId), eq(isolatedSchema.permitChecklist.permitId, id)))
  .returning();
```

This keeps the deliberate "clear the note" behaviour (when the textarea is emptied and blurred, the client sends `''`, which still saves as `null`), but a request that simply doesn't mention `notes` no longer destroys what's there.

---

## Fix 2 — Correct the checklist tab counter

In `client/src/pages/PermitToWork.tsx`, the Checklist tab badge around line 1253:

```tsx
{completedCount}/{checklist.length}
```

Change the denominator to the required-item count so it matches `completedCount` and the banner:

```tsx
{completedCount}/{requiredItems.length}
```

`requiredItems` is already defined just above (line 1211), so no new variable is needed. A permit with all required items done will now correctly read e.g. "12/12" in green.

---

## How to test when done

1. `npm run check` passes with no new type errors.
2. **Note-wipe test (the important one):**
   - Open a permit, answer a checklist item **NO**, type a mitigating control note, click away so it saves.
   - Close the permit and reopen it — the note is still there.
   - Click the **NO** button on that item again (or switch NO → YES → NO). Confirm the note is **still there** afterwards (before this fix it vanished).
3. **Deliberate clear still works:** on a NO item with a note, delete the text in the box and click away — the note should clear to empty as intended.
4. **Counter test:** open a permit whose required items are all done but which also has optional items. The Checklist tab badge should show "required-done / required-total" (e.g. 12/12) in green, not 12/14 in amber.
5. **Submit still gated:** answering an item NO with no note should still block submission with the "must have a mitigating control note" message — that safety gate must stay intact.
