# Fix — RA Builder: hazard edits silently lost + deleted assessments leave dead links in RAMS (verified against live codebase 14 June 2026)

## The problem (read this first)

Three bugs in the Risk Assessment Builder. The six bugs from the last RA Builder prompt are all fixed and in place — these are new. The first one loses people's work, so it's the priority.

Files involved:
- `client/src/pages/RaBuilder.tsx`
- `server/routes/raBuilder.ts`

Do not redesign anything, do not touch any other module, and do not change the database schema.

### Bug 1 — Hazard edits get silently dropped if you type quickly (HIGH — data loss)

This is the same class of bug that was just fixed for the assessment-level auto-save, but it was never fixed for the **hazard** auto-save underneath it.

Every hazard field (description, who's affected, existing controls, likelihood, severity, action by, etc.) saves through `scheduleHazardSave` in `RaBuilder.tsx` (around line 247):

```ts
const scheduleHazardSave = useCallback((hazardId: string, updates: Partial<Hazard>) => {
  if (hazardTimers.current[hazardId]) clearTimeout(hazardTimers.current[hazardId]);
  hazardTimers.current[hazardId] = setTimeout(async () => {
    try {
      await apiRequest("PUT", `/api/ra-builder/assessments/${currentAssessmentId}/hazards/${hazardId}`, updates);
    } catch (e) {
      console.error("Hazard auto-save failed", e);
    }
  }, 800);
}, [currentAssessmentId]);
```

It fires one field at a time (`updateHazardField` calls it with `{ [field]: value }`). Each call clears the previous timer and the new one only carries the **latest** field. So if someone types a hazard description and then — within 800ms — clicks a Likelihood or Severity score (a completely normal flow, the buttons are right there), the description's save is cancelled and only the score is sent to the server.

On screen it looks saved, because the local state updated. But reload the page and the description is gone. On the most important part of the whole assessment — the hazard register — this quietly throws away work.

### Bug 2 — Deleting an assessment leaves a dead document in the RAMS register (MEDIUM/HIGH)

When an assessment is approved, the approve handler inserts a record into the RAMS document library pointing at `/ra-builder?open={id}`, and stores that document's id back on the assessment as `linkedRamsDocumentId`. Good.

But the delete handler (`DELETE /api/ra-builder/assessments/:id`, `server/routes/raBuilder.ts` around line 113) only deletes the assessment row:

```ts
await custDb
  .delete(isolatedSchema.raBuilderAssessments)
  .where(eq(isolatedSchema.raBuilderAssessments.id, id));
```

It never touches the RAMS document it created. So if you delete an assessment that was published, the RAMS register keeps showing a live document whose link opens `/ra-builder?open={deletedId}` — which loads a blank, broken editor because the assessment no longer exists. (The hazards do clean themselves up — the DB cascades those — but the RAMS document is a separate table and gets orphaned.)

This is exactly the kind of dead RAMS link the last prompt fixed, just arriving by a different route.

### Bug 3 — Changing an assessment's type leaves the old type's fields behind (MEDIUM — wrong info on a compliance document)

The type-specific fields (COSHH substance name, Working at Height rescue plan, etc.) all live in one `typeMetadata` object. When you change the Assessment Type dropdown, that object is never cleared.

So if someone starts a COSHH assessment, fills in Substance Name / CAS Number, then switches the type to Working at Height, the old COSHH values stay in `typeMetadata`. The printed PDF makes this visible: `buildAndPrint` prints **every** stored metadata key under the new type's heading (around line 424), so a "Working at Height — Specific Details" table ends up listing a substance name and CAS number. On a legally-relied-on H&S document that's misleading.

**Scope:** two files. Run `npm run check` (or the project's type-check) when done.

---

## Fix 1 — Accumulate hazard edits before saving (PRIORITY)

Mirror exactly what the assessment-level `scheduleAutoSave` already does: hold a per-hazard pending object, merge each edit into it, and send the merged object when the timer fires.

In `RaBuilder.tsx`, add a pending-updates ref next to the existing `hazardTimers` ref (around line 196):

```ts
const hazardTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
const pendingHazardUpdates = useRef<Record<string, Partial<Hazard>>>({});
```

Then change `scheduleHazardSave` so it merges instead of replacing:

```ts
const scheduleHazardSave = useCallback((hazardId: string, updates: Partial<Hazard>) => {
  // Merge this edit into any pending edits for the same hazard so a quick
  // sequence of field changes is saved together, not overwritten.
  pendingHazardUpdates.current[hazardId] = {
    ...pendingHazardUpdates.current[hazardId],
    ...updates,
  };
  if (hazardTimers.current[hazardId]) clearTimeout(hazardTimers.current[hazardId]);
  hazardTimers.current[hazardId] = setTimeout(async () => {
    const merged = pendingHazardUpdates.current[hazardId];
    delete pendingHazardUpdates.current[hazardId];
    try {
      await apiRequest("PUT", `/api/ra-builder/assessments/${currentAssessmentId}/hazards/${hazardId}`, merged);
    } catch (e) {
      console.error("Hazard auto-save failed", e);
    }
  }, 800);
}, [currentAssessmentId]);
```

Keep the 800ms debounce as-is. Don't change `updateHazardField` — it can keep calling with one field at a time; the merge now catches them all.

---

## Fix 2 — Remove the RAMS document when its assessment is deleted

In `server/routes/raBuilder.ts`, the `DELETE /api/ra-builder/assessments/:id` handler should first look up the assessment, and if it has a linked RAMS document, remove that too — then delete the assessment.

Replace the body of the handler (around line 117) with:

```ts
const { id } = req.params;

// If this assessment was published to RAMS, remove the linked document
// first so the register doesn't keep a dead link to a deleted assessment.
const [existing] = await custDb
  .select()
  .from(isolatedSchema.raBuilderAssessments)
  .where(eq(isolatedSchema.raBuilderAssessments.id, id));

if (existing?.linkedRamsDocumentId) {
  await custDb
    .delete(isolatedSchema.ramsDocuments)
    .where(eq(isolatedSchema.ramsDocuments.id, existing.linkedRamsDocumentId));
}

await custDb
  .delete(isolatedSchema.raBuilderAssessments)
  .where(eq(isolatedSchema.raBuilderAssessments.id, id));
res.json({ success: true });
```

(If you'd rather keep the RAMS document as a historical record and just hide it, set `isActive: false` on it instead of deleting — but for a deleted assessment a hard delete is cleaner. Pick one; don't leave it live.)

---

## Fix 3 — Clear type metadata when the assessment type changes

In `RaBuilder.tsx`, the type dropdown calls `updateAssessmentField("raType", v)`. Make that one case also reset the type-specific fields, so a type change starts clean.

Change the Assessment Type `Select`'s `onValueChange` (around line 650) from:

```tsx
<Select value={raType} onValueChange={(v) => updateAssessmentField("raType", v)}>
```

to a small handler that resets the metadata when the type actually changes:

```tsx
<Select value={raType} onValueChange={(v) => {
  if (v === assessment.raType) return;
  setTypeMetadata({});
  setAssessment((prev) => ({ ...prev, raType: v as RAType }));
  // persist both the new type and the cleared metadata in one save
  scheduleAutoSave({ raType: v } as Partial<Assessment>, {});
}}>
```

This means switching type discards the previous type's fields — which is the correct behaviour, because those fields don't belong to the new type. The General type already shows no specific fields, so switching to General also clears them, as expected.

---

## How to test when done

1. **Hazard save (the important one):** open a hazard, type a description, then immediately click a Likelihood score within a second. Wait 2 seconds, reload from the list and reopen. Both the description and the score are there. (Before this fix the description reverts to blank.)
2. **RAMS cleanup:** approve an assessment so it appears in the RAMS register. Delete the assessment from the RA Builder list. Go to the RAMS register — the document is gone (or marked inactive), and there's no link that opens a blank editor.
3. **Type switch:** create a COSHH assessment, fill in Substance Name. Switch the type to Working at Height. The COSHH fields are cleared, and a printed PDF shows no substance name under "Working at Height — Specific Details".
4. `npm run check` passes with no new type errors, and no other module's behaviour has changed.
