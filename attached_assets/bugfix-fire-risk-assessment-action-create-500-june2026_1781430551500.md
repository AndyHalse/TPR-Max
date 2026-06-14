# Fix — Adding any Fire Risk Assessment action item fails with "Failed to add action item" (and critical-action alerts never send). Verified against live codebase 14 June 2026.

## The problem (read this first)

On the Fire Risk Assessment page, when a user adds an action item (any priority), they get a red **"Failed to add action item"** error. The action looks like it failed.

But it didn't fail — the row is actually written to the database first. The error is thrown a moment *after* the save, so the screen reports failure while the data quietly went in. The user, seeing the error, clicks **Add** again — and now there are two copies of the same action in the assessment.

On top of that, the email alert that's meant to fire the instant a **critical** fire safety action is logged never sends. Not once. The code that builds and sends it is never reached.

For the one module whose whole job is keeping a site's fire actions tracked and legally defensible, this is bad: duplicated actions clutter the list, and the "we'll email you the moment a critical risk is logged" promise is silently broken.

### What's actually wrong

In `server/routes/fireRiskAssessment.ts`, the **POST create action item** handler (`POST /api/fire-risk-assessments/:fraId/actions`, around line 344) reads the request body into `body` and uses `body.priority`, `body.dueDate` everywhere — except in three places where someone wrote the bare names `priority` and `dueDate` instead:

- **Line 376:** `if (priority === 'critical') {` — should be `body.priority`.
- **Line 400:** `${dueDate ? ... new Date(dueDate)...}` inside the email HTML — should be `body.dueDate`.
- **Line 407:** `${dueDate ? ...}` inside the email plain-text — should be `body.dueDate`.

There is no variable called `priority` or `dueDate` anywhere in that function. The body field is `body.priority` / `body.dueDate`. So `priority` and `dueDate` are undefined identifiers.

### Why it breaks every single add

The insert runs first and succeeds (lines 359–373). Then execution hits line 376:

```ts
const created = rows.rows[0];

// If critical action — send immediate alert
if (priority === 'critical') {   // ← ReferenceError: priority is not defined
```

`priority` doesn't exist, so the moment JavaScript evaluates that line it throws a `ReferenceError` — **for every action, whatever its priority**, because the error is in the `if` condition itself, before the comparison even happens. The throw jumps straight to the handler's `catch` (line 416), which returns **HTTP 500 "Failed to create action item"**.

So:

1. The row is inserted (the save already happened).
2. The 500 comes back.
3. The front end (`client/src/pages/FireRiskAssessment.tsx`, `createActionMutation`) runs its `onError` branch → toast **"Failed to add action item"**, and because `onSuccess` never fires, the list is **not** refreshed. The new action only appears after a manual page refresh.
4. The user retries → duplicate action item.

And because the `if (priority === 'critical')` block is never entered (it throws on the condition), the critical-action alert email — the whole block at lines 376–413 — never runs.

This should also be failing `npm run check` with *"Cannot find name 'priority'"* and *"Cannot find name 'dueDate'"*, which is a good sign the build step isn't being run before deploys. Worth flagging separately.

**Scope:** one file, `server/routes/fireRiskAssessment.ts`, one handler (the POST create action). Three identifier fixes, nothing else. Don't touch the update, complete, or cron handlers — they already use `body.*` / `a.*` correctly.

---

## The fix — use `body.priority` and `body.dueDate`

**Step 1 — line 376.** Change:

```ts
      // If critical action — send immediate alert
      if (priority === 'critical') {
```
to:
```ts
      // If critical action — send immediate alert
      if (body.priority === 'critical') {
```

**Step 2 — line 400** (inside the email HTML table). Change:

```ts
                      ${dueDate ? `<tr><td style="padding:6px;border:1px solid #e5e7eb;font-weight:bold;background:#fef2f2">Due date</td><td style="padding:6px;border:1px solid #e5e7eb;color:#dc2626">${new Date(dueDate).toLocaleDateString('en-GB')}</td></tr>` : ''}
```
to use `body.dueDate` in both spots:
```ts
                      ${body.dueDate ? `<tr><td style="padding:6px;border:1px solid #e5e7eb;font-weight:bold;background:#fef2f2">Due date</td><td style="padding:6px;border:1px solid #e5e7eb;color:#dc2626">${new Date(body.dueDate).toLocaleDateString('en-GB')}</td></tr>` : ''}
```

**Step 3 — line 407** (inside the email plain-text). Change:

```ts
              text: `CRITICAL FIRE SAFETY ACTION\n\n${body.description}${body.location ? `\nLocation: ${body.location}` : ''}${body.assignedTo ? `\nAssigned to: ${body.assignedTo}` : ''}${dueDate ? `\nDue: ${new Date(dueDate).toLocaleDateString('en-GB')}` : ''}\n\nCritical actions represent an immediate risk to life. Log in to TPR Max to resolve.`,
```
to use `body.dueDate` in both spots:
```ts
              text: `CRITICAL FIRE SAFETY ACTION\n\n${body.description}${body.location ? `\nLocation: ${body.location}` : ''}${body.assignedTo ? `\nAssigned to: ${body.assignedTo}` : ''}${body.dueDate ? `\nDue: ${new Date(body.dueDate).toLocaleDateString('en-GB')}` : ''}\n\nCritical actions represent an immediate risk to life. Log in to TPR Max to resolve.`,
```

That's the whole fix. After it, the handler runs cleanly to `res.status(201).json(created)`, the front end gets its success, the list refreshes, no duplicates — and a critical action fires its alert email exactly once, as designed.

---

## How to test when done

1. **`npm run check` passes** — the two "Cannot find name 'priority' / 'dueDate'" errors are gone. (If it was passing before, the build step wasn't running — flag that.)
2. **Add a normal action (medium/low):** on the Fire Risk Assessment page, add an action item. You should see **"Action item added"** (green), the item appears in the list immediately, and there's no duplicate. Add a couple more and confirm no error, no doubles.
3. **No-retry-duplicate check:** add one action, then refresh the page. There should be exactly one row — confirming the old behaviour (saved-but-reported-failed → user retries → two rows) is gone.
4. **Critical action alert:** with an admin email set in company settings, add a **critical** priority action. Confirm (a) the UI shows success, and (b) the critical-action alert email is sent to the admin address, with the due date shown correctly if one was set.
5. **Critical with no due date:** add a critical action with the due-date field left blank — the email should send fine and simply omit the "Due date" row (proves the `body.dueDate` guard works).
