# Fix — Incident Reports: the "Refresh" button can wipe a report's accountability to 0% (verified against live codebase 14 June 2026)

## The problem (read this first)

This is on the **Incident Reports** page — the report that's auto-generated after every evacuation or fire drill. It's a safety record, so wrong numbers here matter.

When a report shows **0 accounted for**, the page deliberately shows an amber warning that says:

> "No accountability data was recorded for this event. Use **Refresh** to recalculate from the latest muster records."

So the product is actively telling the user to press Refresh. The trouble is that Refresh recalculates the numbers a different way from how the report was first built — and in one common case it makes a correct report wrong.

### What actually happens

When the list of reports is built (`GET /api/emergency/incident-reports`, `server/routes/emergency.ts` around line 2836), the "accounted for" figure is worked out like this:

```ts
const totalCt = accountability.length || evac.totalPeopleOnSite || 0;
const rawAccountedCt = accountability.length > 0
  ? accountability.filter(p => p.isAccountedFor).length
  : (evac.totalAccountedFor || 0);          // ← fallback to the evacuation's own summary figure
const accountedCt = Math.min(rawAccountedCt, totalCt);
```

The key bit: if there are **no per-person muster rows** (`evacuationAccountability`), it falls back to the number the evacuation itself recorded — `evac.totalAccountedFor`. That's how older events, or events that were accounted for at summary level, still show a sensible figure.

Now look at the Refresh endpoint (`POST /api/emergency/incident-reports/:evacuationId/refresh`, around line 2935). It drops that fallback completely:

```ts
const totalCt = accountability.length || evac.totalPeopleOnSite || 0;
const accountedCt = Math.min(accountability.filter(p => p.isAccountedFor).length, totalCt);
```

When there are no per-person rows, `accountability.filter(...).length` is `0`, so `accountedCt` becomes `0` and the completion percentage becomes `0%` — **even though `totalOnSite` still reads, say, 10.**

So the sequence is:

1. An evacuation is accounted for (10 of 10 safe). It has summary figures but no per-person `evacuationAccountability` rows (true for older events and summary-level accounting).
2. The report correctly shows **10/10, 100%**.
3. The user — or anyone — clicks **Refresh**.
4. The report is rewritten to **0/10, 0%**, and the amber "no accountability data" warning now appears.

A correct safety record has just been turned into a wrong one by the button the UI told the user to press. For a product whose headline is "instant emergency accountability," a report that reads 0% accounted for when everyone was actually safe is exactly the wrong failure.

### Second, smaller issue — inconsistent customer scoping

While fixing the above, tighten one more thing in the same Refresh handler. It reads the accountability rows like this:

```ts
const accountability = await db
  .select()
  .from(evacuationAccountability)
  .where(eq(evacuationAccountability.evacuationId, evacuationId));
```

The list endpoint scopes the same query by **both** `evacuationId` and `customerId`:

```ts
.where(and(
  eq(evacuationAccountability.evacuationId, evac.evacuationId),
  eq(evacuationAccountability.customerId, customerId)
));
```

The evacuation itself is already verified to belong to the customer just above, so this isn't an open hole today — but every other query in this area carries the `customerId` filter, and this one should too. It's a cheap, defensive consistency fix.

**Scope:** one file, `server/routes/emergency.ts`, one handler (the `/refresh` endpoint). Don't touch the list or delete endpoints. Run `npm run check` when done.

---

## Fix 1 — Make Refresh use the same fallback as the original report (PRIORITY)

In `server/routes/emergency.ts`, find the refresh handler (`POST /api/emergency/incident-reports/:evacuationId/refresh`, around line 2935). Replace the totals calculation:

```ts
      const totalCt = accountability.length || evac.totalPeopleOnSite || 0;
      const accountedCt = Math.min(accountability.filter(p => p.isAccountedFor).length, totalCt);
      const unaccountedCt = Math.max(0, totalCt - accountedCt);
      const pct = totalCt > 0 ? Math.min(100, Math.round((accountedCt / totalCt) * 100)) : 0;
```

with the same logic the list endpoint uses — fall back to the evacuation's own summary figure when there are no per-person rows:

```ts
      const totalCt = accountability.length || evac.totalPeopleOnSite || 0;
      const rawAccountedCt = accountability.length > 0
        ? accountability.filter(p => p.isAccountedFor).length
        : (evac.totalAccountedFor || 0);
      const accountedCt = Math.min(rawAccountedCt, totalCt);
      const unaccountedCt = Math.max(0, totalCt - accountedCt);
      const pct = totalCt > 0 ? Math.min(100, Math.round((accountedCt / totalCt) * 100)) : 0;
```

Now Refresh and the original report always agree. Refreshing an event that genuinely has live muster rows still recalculates from those rows (that's the intended use); refreshing an event that only has summary figures keeps the correct number instead of zeroing it.

## Fix 2 — Scope the accountability read by customer

Still in the refresh handler, change:

```ts
      const accountability = await db
        .select()
        .from(evacuationAccountability)
        .where(eq(evacuationAccountability.evacuationId, evacuationId));
```

to:

```ts
      const accountability = await db
        .select()
        .from(evacuationAccountability)
        .where(and(
          eq(evacuationAccountability.evacuationId, evacuationId),
          eq(evacuationAccountability.customerId, customerId)
        ));
```

(`and` is already imported and used throughout this file, so no new imports.)

---

## How to test when done

1. `npm run check` passes with no new type errors.
2. **The main test:** find (or create) a completed evacuation that has a summary "accounted for" figure but no per-person muster rows — it should show something like 100% on the Incident Reports page. Click **Refresh**. Confirm the figure **stays correct** (before this fix it dropped to 0%).
3. **Normal refresh still works:** for an evacuation that does have live muster records, click Refresh and confirm the accounted/percentage figures recalculate from those records as before.
4. Confirm the amber "no accountability data" warning no longer appears on reports that actually were fully accounted for.
