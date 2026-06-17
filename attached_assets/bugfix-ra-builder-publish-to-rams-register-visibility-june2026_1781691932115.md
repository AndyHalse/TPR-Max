# Fix — RA Builder: "Publish to RAMS" documents never reach the RAMS register (+ empty publish, archive sync, idempotency)

_Verified against the live codebase, 17 June 2026._

## Read this first

The Risk Assessment Builder is solid. The earlier fixes (hazard auto-save merge, orphaned-RAMS-on-delete, type-metadata reset) are all confirmed in place. **Do not touch those.** This prompt fixes four newly-found issues, all centred on what happens when a user approves and publishes an assessment.

Files involved:
- `server/routes/raBuilder.ts`
- `client/src/pages/RaBuilder.tsx`

Do **not** redesign the UI, do **not** touch other modules, and do **not** change the database schema. Run `npm run check` when done.

---

## The core problem (Fix 1 — HIGH)

There are **two different `rams_documents` tables** in this codebase:

- The **shared** one — `ramsDocuments` in `shared/schema.ts`. It has a `customerId` column. The **RAMS register** the users actually see (`client/src/components/RAMSManagement.tsx`, shown on the `/contractors` page) reads this table via `GET /api/rams` (`server/routes/rams.ts`), filtered by `customerId` and `isActive = true`.

- The **per-tenant isolated** one — `isolatedSchema.ramsDocuments`. It has **no** `customerId` column.

When a user clicks **"Approve & Publish to RAMS Library"**, `server/routes/raBuilder.ts` inserts the published document into the **isolated** table via `custDb` (around line 165), **without a `customerId`**, and with `status: 'valid'`.

Result: the document the user was just told is "added to the RAMS document register" **never appears in that register** — because the register reads the *shared* table, and the doc went into the *isolated* one with no `customerId`. (As a bonus bug, `'valid'` is not even a valid register status — the shared table expects `pending_review | approved | rejected | expired | expiring`.) The green "View in RAMS Register" link sends the user to `/contractors`, where the document is nowhere to be found.

**The fix: publish into the same shared table the register reads.**

### What to change

In `server/routes/raBuilder.ts`:

1. Make sure the shared db and shared schema are available at the top of the file:
   ```ts
   import { db } from '../db';
   import { ramsDocuments as sharedRamsDocuments } from '@shared/schema';
   ```
   (Keep the existing `isolatedSchema` import — other handlers still use it. Use the `sharedRamsDocuments` alias everywhere this prompt deals with a register document so the two never get confused.)

2. In the **approve** handler (`POST /api/ra-builder/assessments/:id/approve`), replace the insert into `isolatedSchema.ramsDocuments` with an insert into the **shared** table, setting `customerId` and a real status:

   ```ts
   const ramsIdRef = 'RA-' + id.substring(0, 8).toUpperCase();
   const [ramsDoc] = await db
     .insert(sharedRamsDocuments)
     .values({
       customerId: req.customerId!,        // REQUIRED — this is what the register filters on
       ramsIdRef,
       documentName: `${assessment.title} (RA Builder)`,
       documentUrl: `/ra-builder?open=${id}`,
       expiryDate,
       status: 'approved',                 // a valid register status (NOT 'valid')
       isActive: true,
       // companyId / uploadedBy are nullable — leave unset for RA Builder docs
     })
     .returning();
   ```

   `companyId` and `uploadedBy` are nullable, so an RA Builder document can sit in the register without being tied to a contractor company — that's correct.

3. The `linkedRamsDocumentId` stored on the assessment (isolated table) will now hold the **shared** document's id. That's fine — just keep using `db` + `sharedRamsDocuments` whenever you later read/update/delete that linked document (see Fixes 3 & the delete handler below).

4. **Keep the delete handler consistent.** The `DELETE /api/ra-builder/assessments/:id` handler currently removes the linked RAMS doc from `isolatedSchema.ramsDocuments`. Point it at the shared table instead, so deleting an assessment still cleans up its (now shared-table) register document:

   ```ts
   if (existing?.linkedRamsDocumentId) {
     await db
       .delete(sharedRamsDocuments)
       .where(eq(sharedRamsDocuments.id, existing.linkedRamsDocumentId));
   }
   ```

   (Add `customerId` to the `where` as well if you want belt-and-braces tenant safety: `and(eq(sharedRamsDocuments.id, existing.linkedRamsDocumentId), eq(sharedRamsDocuments.customerId, req.customerId!))`.)

---

## Fix 2 — Block publishing an assessment that has no hazards (MEDIUM)

Right now you can approve and publish an assessment with **zero hazards** straight into the compliance library — an empty risk assessment. Stop that on both ends.

### Server (`raBuilder.ts`, approve handler)

Before creating the RAMS document, count the assessment's hazards and refuse if there are none:

```ts
const hazardCount = await db.$count
  ? await custDb.select().from(isolatedSchema.raBuilderHazards)
      .where(eq(isolatedSchema.raBuilderHazards.assessmentId, id))
  : [];
// (or just select the rows and check length — keep it simple)
const hazards = await custDb
  .select()
  .from(isolatedSchema.raBuilderHazards)
  .where(eq(isolatedSchema.raBuilderHazards.assessmentId, id));

if (hazards.length === 0) {
  return res.status(400).json({ error: 'Add at least one hazard before publishing this assessment to the RAMS library.' });
}
```

Use a plain `select().length` check — don't over-engineer it.

### Client (`RaBuilder.tsx`)

1. Disable the **"Approve & Publish to RAMS Library"** button when there are no hazards, and tell the user why. The button is in Section 4 (around line 891). Add `disabled={approveMutation.isPending || hazards.length === 0}` and, when `hazards.length === 0`, change the tooltip text to something like *"Add at least one hazard before you can publish this assessment."*

2. Surface the server's specific message instead of the generic toast. The `approveMutation` `onError` currently shows a fixed `"Failed to approve assessment"`. Make it read the error message if there is one, e.g.:
   ```ts
   onError: (err: any) => toast({
     title: err?.message || "Failed to approve assessment",
     variant: "destructive",
   }),
   ```
   (Confirm how `apiRequest` surfaces a non-2xx body in this project and match that — the goal is the user sees "Add at least one hazard…" rather than a generic failure.)

---

## Fix 3 — Keep the RAMS document in step with the assessment's status (MEDIUM)

When an approved assessment is **archived** or **reverted to Draft/Under Review**, its published RAMS document currently stays `isActive = true` in the register — so the register shows a live document for an assessment that's no longer approved. The "Published to RAMS library" banner also keeps showing regardless of status.

Status changes happen through `PUT /api/ra-builder/assessments/:id` (the Status dropdown auto-saves). So sync the linked document there.

In `raBuilder.ts`, in the **PUT** handler, when the incoming payload includes a `status`, fetch the existing assessment to get its `linkedRamsDocumentId`, then set the shared RAMS doc's `isActive` to match whether the new status is `'approved'`:

```ts
// inside PUT /api/ra-builder/assessments/:id, after parsing `parsed`
if (parsed.status !== undefined) {
  const [existing] = await custDb
    .select()
    .from(isolatedSchema.raBuilderAssessments)
    .where(eq(isolatedSchema.raBuilderAssessments.id, id));
  if (existing?.linkedRamsDocumentId) {
    const active = parsed.status === 'approved';
    await db
      .update(sharedRamsDocuments)
      .set({ isActive: active, status: active ? 'approved' : 'expired' })
      .where(eq(sharedRamsDocuments.id, existing.linkedRamsDocumentId));
  }
}
```

(Reverting to draft and back to approved should therefore drop the doc out of the register and bring it back. Use `'expired'` or another valid status for the inactive state — just not `'valid'`.)

Also apply the same deactivation in the **`POST /api/ra-builder/assessments/:id/archive`** handler (set the linked shared doc `isActive: false`), so archiving by either route is consistent. The archive endpoint already loads/updates the assessment — add the linked-doc deactivation alongside it.

---

## Fix 4 — Make approve idempotent (MEDIUM)

The approve endpoint has no guard: if it's ever called when the assessment **already** has a `linkedRamsDocumentId` (stale client state, double-click, retry), it creates a **second** RAMS document and overwrites the link, orphaning the first — the exact orphaned-RAMS problem an earlier prompt fought.

At the top of the approve handler, after loading the assessment, short-circuit if it's already published:

```ts
if (assessment.linkedRamsDocumentId) {
  // Already published — make sure it's active and approved, don't create a duplicate.
  await db
    .update(sharedRamsDocuments)
    .set({ isActive: true, status: 'approved' })
    .where(eq(sharedRamsDocuments.id, assessment.linkedRamsDocumentId));

  const [reaffirmed] = await custDb
    .update(isolatedSchema.raBuilderAssessments)
    .set({ status: 'approved', updatedAt: new Date() })
    .where(eq(isolatedSchema.raBuilderAssessments.id, id))
    .returning();
  return res.json(reaffirmed);
}
```

Then proceed to the normal "create new RAMS doc" path only when there is no existing link.

---

## How to test when done

1. **Publish shows up in the register (the main fix):** create an assessment, add a hazard, set Status to **Approved**, click **Approve & Publish to RAMS Library**. Click **View in RAMS Register** (→ `/contractors`, RAMS tab). The document **is now listed** there, named "*\<title\> (RA Builder)*", with an Approved status and the correct expiry. (Before this fix it was missing entirely.)
2. **Empty publish blocked:** create an assessment with **no hazards**. The Approve & Publish button is disabled with an explanatory tooltip; if you somehow hit the endpoint, the server returns "Add at least one hazard…".
3. **Archive sync:** with a published assessment, change its Status to **Archived** (or back to **Draft**). Refresh the RAMS register — the document is **gone** from the live list. Set it back to **Approved** — it reappears.
4. **No duplicates:** approve a published assessment again (e.g. reload then re-trigger). Only **one** document exists in the register; no orphan is left behind.
5. `npm run check` passes with no new type errors, and the RAMS register, contractors page, and compliance dashboard all still behave as before for documents created the normal way.

## Note for later (out of scope — do not fix now)

The compliance dashboard (`server/routes/complianceDashboard.ts`) reads RAMS from the **isolated** table, while the register reads the **shared** one. After this fix, RA Builder docs live in the shared table, so they'll show in the register but may drop off the compliance dashboard's RAMS count. Flag this for a follow-up that standardises every module onto one RAMS table — it's a wider piece of work and shouldn't be bundled into this fix.
