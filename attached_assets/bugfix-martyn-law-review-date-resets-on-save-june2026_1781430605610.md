# Bugfix: Martyn's Law "last review date" resets to today on every save (June 2026)

On the **Martyn's Law Compliance** page, the **Annual Review** record is supposed to prove the venue reviewed its security plan within the last 12 months — that's its whole legal purpose. But the recorded review date isn't tied to actually doing a review. It silently advances to today every time anyone clicks **Save All**, for any reason.

So a venue that genuinely did its annual review on 1 January, then ticks a checklist item on 14 June, will show **"Last reviewed 14 June"**. The date an inspector might rely on becomes a record of "the last time someone clicked Save" — and it always reads more recent (more compliant) than the truth. That's worse than no date at all.

There's a smaller issue to fix in the same pass: the audit-log lookup builds SQL by pasting the customer ID straight into the query string, while the query right below it parameterises properly. It should be parameterised too.

Copy everything below the line into the Replit agent.

---

## THE BUG

### 1. The review date advances on every save, not just on a real review

In `server/routes/rams.ts`, the `PUT /api/martyn-law` handler stamps today's date whenever the reviewer name is present:

```ts
lastReviewedAt: lastReviewedBy ? new Date() : undefined,
lastReviewedBy: lastReviewedBy ?? null,
```

The problem is that `lastReviewedBy` is **sticky**. The client loads the saved config into its form when the page opens (`client/src/pages/MartynLaw.tsx`, the `setForm(d)` init block) and `handleSave` sends the whole form back on every save:

```ts
const handleSave = () => saveMutation.mutate(form);
```

So once a reviewer has ever been recorded, `lastReviewedBy` is sent on **every** subsequent save — changing the venue type, ticking a checklist box, adding an evidence entry, anything. Each of those saves re-runs the line above and pushes `lastReviewedAt` to `new Date()`.

The UI even promises this won't happen by accident — the Annual Review card says *"Saving with this field set will record today's date as the last review date"* — but because the field is auto-filled from the saved record, "this field set" is true on basically every save. Recording a review and saving the page are not the same action, and right now they're treated as one.

### 2. SQL built by string interpolation in the audit-log lookup

A few lines down in the same handler, the audit-log read pastes `customerId` directly into the SQL string:

```ts
const currentAuditRaw = await custDb.execute(
  `SELECT audit_log FROM martyn_law_config WHERE customer_id = '${customerId}'` as any
);
```

The very next statement parameterises the same value correctly (`$1`, `$2`). `customerId` is server-derived from the session, so this isn't an open injection hole today, but it's inconsistent and one refactor away from being one. Parameterise it.

## THE FIX

Decouple "recording a review" from "saving the page". The date should only move when the user explicitly says they're recording a new review.

### 1. `client/src/pages/MartynLaw.tsx` — add an explicit "record review" action

Add a piece of local state for the intent, defaulting to off:

```tsx
const [recordReviewNow, setRecordReviewNow] = useState(false);
```

Send it with the save payload. In the `saveMutation` `mutationFn`:

```ts
mutationFn: (payload: MartynLawData) =>
  apiRequest("PUT", "/api/martyn-law", {
    ...payload,
    checklistItems: checklist,
    evidenceLog: evidence,
    recordReviewNow,
  }),
```

Reset the flag after a successful save so it can't carry over to the next one. In `onSuccess`, alongside the existing invalidate/toast:

```ts
setRecordReviewNow(false);
```

In the **Annual Review** card, replace the "Saving with this field set will record today's date…" helper text with an explicit checkbox the user has to tick when they're actually recording a review. After the `StaffSelect` for the reviewer:

```tsx
<label className="flex items-start gap-2 mt-2 text-xs text-gray-600 dark:text-gray-400">
  <input
    type="checkbox"
    checked={recordReviewNow}
    onChange={e => setRecordReviewNow(e.target.checked)}
    className="mt-0.5 h-4 w-4 rounded border-gray-300"
  />
  <span>Record a new annual review with today's date when I save. Leave unticked to edit this page without changing the last review date.</span>
</label>
```

(Remove the old "Saving with this field set will record today's date as the last review date." paragraph — it's now wrong.)

### 2. `server/routes/rams.ts` — only stamp the date when explicitly asked

Pull the new flag out of the body:

```ts
const {
  venueType, venueCapacity, isInScope, scopeNotes,
  supervisorName, supervisorRole, supervisorPhone, supervisorEmail, supervisorStaffId,
  siaProviderName, siaLicenseNumber, siaExpiryDate,
  actionPlan, evacuationProcedure, lockdownProcedure, communicationPlan,
  checklistItems, evidenceLog,
  lastReviewedBy, lastReviewerStaffId,
  recordReviewNow,
} = req.body;
```

Then change the stamp so it only fires on an explicit review, and only when there's actually a reviewer named:

```ts
lastReviewedAt: (recordReviewNow && lastReviewedBy) ? new Date() : undefined,
lastReviewedBy: lastReviewedBy ?? null,
```

`undefined` tells Drizzle to leave the column untouched, so ordinary saves now preserve whatever review date was last set. The reviewer name still saves normally — only the date is gated behind the explicit action.

### 3. `server/routes/rams.ts` — parameterise the audit-log read

```ts
const currentAuditRaw = await custDb.execute(
  `SELECT audit_log FROM martyn_law_config WHERE customer_id = $1` as any,
  [customerId] as any
);
```

## ACCEPTANCE — how to know it's fixed

1. Open Martyn's Law, go to **Annual Review**, pick a reviewer, **tick** the new "Record a new annual review" box, and Save All. The banner and the Annual Review card show today's date as last reviewed. Good.
2. Reload the page. Change the **Venue Type**, or tick a **checklist** item, and Save All **without** ticking the review box. The last review date stays exactly as it was in step 1 — it does **not** move to today.
3. The "record review" box is unticked again after every save (it never silently stays on).
4. A page with no reviewer ever set still shows no review date and never invents one.
5. Saving still works end to end — audit trail gets a new entry, checklist/evidence/venue fields all persist as before.

## NOT IN SCOPE

- Evidence files uploaded via "Attach File" but never saved into an entry are left orphaned on disk. That's a real but separate housekeeping issue — don't tackle it here.
- The venue capacity field doesn't tell the user which tier (Standard 200–799 / Enhanced 800+) they fall into. That's a feature gap, not a bug — leave it.
