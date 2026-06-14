# Fix — "Mark all safe" by zone silently skips people who are in the zone (verified against live codebase 14 June 2026)

## The problem (read this first)

On the Emergency Muster screen, a Fire Marshal can pick one or more zones and press **Mark all safe** to clear everyone in those zones in one tap. The zone filtering on the server is built the wrong way, and the result is that some people who are genuinely in the selected zone don't get marked — with no error and no warning.

For a product whose headline is "instant emergency accountability", this is the worst kind of bug: it looks like it worked, the count goes up, but a real person standing at the assembly point is left unaccounted for.

### What the code actually does

`POST /api/muster/mark-all-safe` (`server/routes/emergency.ts:5588`) decides who is "in" a selected zone like this (around line 5613):

1. Take the `zoneIds` the screen sent.
2. Look up those zones and get their **names**.
3. Find evacuation accountability records whose **`lastKnownLocation` text matches one of those zone names**.
4. Build an allow-list of those person IDs, and only mark those people safe.

```ts
const inZone = await db
  .select({ personId: evacuationAccountability.personId })
  .from(evacuationAccountability)
  .where(and(
    eq(evacuationAccountability.evacuationId, activeEvacuation.evacuationId),
    inArray(evacuationAccountability.lastKnownLocation, zoneNames)   // ← fragile text match
  ));
allowedPersonIds = new Set(inZone.map(r => r.personId));
```

The whole rest of the system identifies a person's zone by their `zoneId` (a proper foreign key), not by a text field:

- The muster list groups people by `p.zoneId` (`EmergencyMuster.tsx`, zone counts and the client-side zone filter).
- The screen sends `zoneIds` precisely because that's the real key.

`mark-all-safe` is the one place that throws the `zoneId` away and matches on a text field instead.

### Why the text field can't be trusted

`evacuationAccountability.lastKnownLocation` is set to different things in different places:

- At evacuation **activation** it's set to the **zone name** (`emergency.ts:509-542`). For people already on site when the alarm went off, the match works.
- When someone **checks in** (staff, visitor, contractor routes) it's set to the literal string **`'Just Checked In'`** (`staff.ts:777`, `visitors.ts:451`, `contractors.ts:4688`) — not a zone name.
- When a Fire Marshal **toggles** a single person and a new accountability row is created (`emergency.ts:5530`), `lastKnownLocation` is **not set at all** (null).
- If a zone is **renamed** mid-incident, the old name stored at activation no longer matches the live name.

So anyone who arrived after the alarm, or whose record came from a toggle, or whose zone was renamed, has a `lastKnownLocation` that will never match the zone name — and they get **silently excluded** from "Mark all safe" for that zone, even though they're physically in it.

### A second sharp edge in the same block

If that zone lookup throws for any reason, the code logs a warning and **falls back to marking everyone safe** (`emergency.ts:5632-5635`):

```ts
} catch (e) {
  logger.warn('[mark-all-safe] Zone filter lookup failed, falling back to all:', e);
}
```

`allowedPersonIds` stays `null`, which the loops below treat as "no filter — mark all". So a transient database hiccup turns a single-zone "mark safe" into a **whole-site** "mark safe". In a safety tool, over-marking is just as dangerous as under-marking — it tells the Fire Marshal people are accounted for when nobody checked them.

**Scope:** one file, `server/routes/emergency.ts`, one handler (`mark-all-safe`). Don't touch the toggle or the main muster query. Run `npm run check` when done.

---

## The fix — filter by `zoneId`, the same key everything else uses

The personnel lists this handler already loads (`checkedInStaff`, `currentVisitors`, `checkedInContractors`, and the members query) each carry the person's real `zoneId`. So we don't need the accountability table or `lastKnownLocation` at all — we can compare the person's `zoneId` directly against the selected `zoneIds`.

**Step 1.** Replace the whole zone-resolution block (around lines 5611-5635, from `let allowedPersonIds` down to the end of the `try/catch`) with a simple set of the selected zone IDs:

```ts
      // Build a set of the selected zone IDs. We filter each person by their own
      // zoneId below — the same key the muster screen and zone counts use.
      // No text matching, no dependency on accountability records existing yet.
      const zoneFilter: Set<string> | null =
        zoneIds && zoneIds.length > 0 ? new Set(zoneIds) : null;
```

**Step 2.** Change each per-person skip check to compare `zoneId`. There are four loops — staff, visitors, contractors, members. Replace:

```ts
        if (allowedPersonIds && !allowedPersonIds.has(staff.id)) continue;
```
with:
```ts
        if (zoneFilter && !zoneFilter.has((staff as any).zoneId)) continue;
```

Do the same for the visitor loop (`(visitor as any).zoneId`), the contractor loop (`(contractor as any).zoneId`), and the member filter. For the members block (around line 5748) replace:

```ts
          const filteredMembers = allowedPersonIds
            ? checkedInMembers.filter(m => allowedPersonIds!.has(m.id))
            : checkedInMembers;
```
with:
```ts
          const filteredMembers = zoneFilter
            ? checkedInMembers.filter(m => zoneFilter.has((m as any).zoneId))
            : checkedInMembers;
```

**Step 3.** Delete the now-unused `allowedPersonIds` variable and the `inArray` zone lookup. If `inArray` is no longer used anywhere else in the file, remove it from the import line too (let `npm run check` tell you).

That's it. Now "Mark all safe in Zone A" marks exactly the people whose `zoneId` is Zone A — whether they were on site at activation, checked in afterwards, or were created by a toggle. And because there's no try/catch that can fail, the silent "fall back to marking everyone" path is gone: if no zones are selected it marks all (as designed), and if zones are selected it always honours them.

---

## How to test when done

1. `npm run check` passes with no new type errors.
2. **Late-arrival test (the main bug):** start a drill with zones configured. After the drill is running, check in a new person and assign them to Zone A. On the muster, select Zone A and press **Mark all safe**. Confirm the late arrival is now marked safe. (Before this fix they'd be skipped because their `lastKnownLocation` was `'Just Checked In'`, not the zone name.)
3. **Wrong-zone test:** with people in Zone A and Zone B, select only Zone A and mark safe. Confirm Zone B people are still unaccounted — the filter must not leak across zones.
4. **No-zone test:** with no zones selected, press **Mark all safe** and confirm everyone on site is marked (unchanged behaviour).
5. **Rename test (optional):** start an evacuation, rename a zone, then mark that zone safe — the people in it should still be marked.
