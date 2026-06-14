# Fix — Dashboard page: US time format on a UK product, plus dead code (verified against live codebase 14 June 2026)

All changes are in one file: `client/src/pages/Dashboard.tsx`. No backend, no schema, no `db:push`. Run `npm run check` when done.

## The problem (read this first)

### Bug 1 — Check-in times show in US 12-hour format (HIGH — it's the visible one)

The dashboard's pop-up panels (Current Visitors, Today's Check-ins, Staff On-Site, Department Details, Visitor Details) all show arrival/check-in times using a `formatTime` helper that's hard-coded to the **American** locale:

```ts
// line ~624
const formatTime = (date: string | Date) => {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  return dateObj.toLocaleTimeString('en-US', {   // <-- US
    hour: '2-digit',
    minute: '2-digit'
  });
};
```

So a contractor who arrived at 14:30 is shown as **"02:30 PM"**. Every other time on the same page — the whole Reception Diary — uses British 24-hour format via `formatVisitTime` (`en-GB`). Right now the page shows both styles at once: the diary says `14:30`, the pop-up says `02:30 PM`. `en-GB` appears 11 times in this file; `en-US` appears exactly once, here. It's a straight oversight.

This is a UK product sold to UK sites. Times should be 24-hour throughout.

### Bug 2 — A whole "Today's Check-ins" panel is built but can never open (MEDIUM)

There's a fully-built modal for `openModal === 'checkins'` (around line 1978) and a `todayCheckins` field in the `Stats` type (line 19), but **nothing on the page ever opens it** — there's no card or button that calls `setOpenModal('checkins')`. It's dead weight: a feature that was started and left unreachable. Either wire it up or remove it (see options below).

### Bug 3 — Six dead click-handlers left behind, including a fake "security check" (LOW — cleanup)

Near the top of the component (lines ~555–622) there are seven handler functions. Only one — `handleEmergencyMuster` — is actually used. The other six are never referenced anywhere in the page:

- `handleViewDepartmentAnalytics`
- `handleGenerateReport`
- `handleExportData`
- `handleSecurityCheck`
- `handleViewAllVisitors`
- `handleViewAllActivity`

Two of these are worth calling out because they only *pretend* to do something:

```ts
const handleSecurityCheck = () => {
  toast({ title: "Security Check", description: "Running comprehensive security scan..." });
  setTimeout(() => {
    toast({ title: "Security Check Complete", description: "All systems secure. No issues detected." });
  }, 3000);
};
```

`handleSecurityCheck` always reports "All systems secure" without checking anything, and `handleExportData` says "exported successfully" without exporting anything. They're not wired to any button today, so users can't trigger them — but leaving fake "security scan passed" code in a security product is asking for trouble. Delete them.

### Bug 4 — Compact-view sort key can shift dates by a day in summer (LOW)

In the compact list view, contractor rows are given a sort key built with `toISOString()` (line ~1407):

```ts
sortTime: `${new Date(entry.scheduledDate).toISOString().split('T')[0]}T${entry.scheduledTime}`,
```

`toISOString()` converts to UTC. During British Summer Time (UTC+1), a booking stored at local midnight becomes the *previous* day in UTC, so the date portion of the sort key is wrong and contractors can sort into the wrong day relative to visitors and meetings. Only affects ordering in the compact weekly view, but it's a real off-by-one. Use a local date string instead.

---

## Fix 1 — Use British 24-hour time (PRIORITY)

In `client/src/pages/Dashboard.tsx`, change `formatTime` to match the rest of the page:

```ts
const formatTime = (date: string | Date) => {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  return dateObj.toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit'
  });
};
```

That's the whole fix — `en-US` → `en-GB`. It already feeds all five pop-ups, so they all correct at once.

## Fix 2 — Decide on the "Today's Check-ins" panel

Pick one:

**Option A (recommended — make it usable):** make the "Visitors" stat card also offer today's check-ins, or add a small "Today's check-ins" stat card that calls `setOpenModal('checkins')`. The `todayVisitors` data the modal needs is already being fetched (`/api/visitors/today`), so wiring a trigger is all that's missing.

**Option B (simplest — remove it):** delete the unused `'checkins'` modal block (around lines 1978–2030) and drop `todayCheckins` from the `Stats` interface if nothing else uses it.

If you're unsure, go with Option B for now — don't leave a half-built panel in the code.

## Fix 3 — Delete the six unused handlers

Remove `handleViewDepartmentAnalytics`, `handleGenerateReport`, `handleExportData`, `handleSecurityCheck`, `handleViewAllVisitors`, and `handleViewAllActivity` (lines ~555–622). Keep `handleEmergencyMuster` — that one's wired to the "Activate Emergency" button. After deleting, check for any now-unused imports (e.g. `Download`) and remove those too so `npm run check` stays clean.

## Fix 4 — Local date for the compact sort key

Replace the `toISOString()` sort key (line ~1407) with a local date string. There's already a `formatLocalDate` helper in this file (line ~54) — reuse it:

```ts
sortTime: `${formatLocalDate(new Date(entry.scheduledDate))}T${entry.scheduledTime}`,
```

---

## How to test when done

1. `npm run check` passes with no new type errors and no unused-import warnings.
2. **Time format:** check a visitor in, open the **Current Visitors** pop-up — the arrival time shows as 24-hour (e.g. `14:30`), matching the Reception Diary. Same for **Staff On-Site** and **Department Details**.
3. **Dead panel:** if you took Option B, confirm nothing references `'checkins'` or `todayCheckins` and the page still builds. If Option A, confirm the new trigger opens the panel and lists today's check-ins.
4. **Compact sort:** switch the diary to **Weekly + Compact list** with contractors booked across several days and confirm they sort into the correct day (test this in summer / BST especially).
