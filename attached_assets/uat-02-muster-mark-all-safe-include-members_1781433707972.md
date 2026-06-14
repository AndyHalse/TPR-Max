# UAT-02 — "Mark all safe" must include Members (life-safety)

## Why
In `server/routes/emergency.ts`, the `POST /api/muster/mark-all-safe` handler (starts ~line 5628) only loads and processes **visitors, staff and contractors**:

```
const [currentVisitors, checkedInStaff, checkedInContractors] = await Promise.all([
  databaseService.getCurrentVisitors(context),
  databaseService.getCheckedInStaff(context),
  databaseService.getCheckedInContractors(context),
]);
```

But the muster **start** logic (around lines 403–411) DOES include checked-in members when the members feature is enabled. Result: members appear on the live muster list but the "Mark all safe" button can never account for them. In a real evacuation a fire marshal could believe everyone is safe while members are silently left unaccounted. This is a life-safety data-integrity defect.

## What to change
1. In the `mark-all-safe` handler, also fetch checked-in **members** when the members feature is enabled — mirror exactly how the muster-start code (lines ~403–411) queries `isolatedSchema.members` where `isCheckedIn = true`, and only include them if the same feature flag/condition used at start is true.
2. Add a loop for members that mirrors the existing staff/visitor/contractor loops:
   - Respect the same `zoneFilter` logic: `if (zoneFilter && !zoneFilter.has((member as any).zoneId)) continue;`
   - Toggle/insert their accountability record via the same pattern (`updateAccountability(member.id, memberName, 'member')`), and use the member's accounted-status toggle if one exists, otherwise insert the accountability record directly.
   - Increment `updatedCount` and push to `errors` consistently with the other loops.
3. Make sure the `personType` value used is `'member'` and matches what the muster UI / start logic expects, so counts reconcile.

## Acceptance test
- Start an evacuation with at least one checked-in member, plus staff/visitors/contractors.
- Press "Mark all safe".
- All members are now marked accounted-for, the total-accounted count equals total-on-site, and no member is left showing as unaccounted on the muster screen.
- Zone-filtered mark-all-safe only marks members in the selected zones safe.

## Note for the developer
While here, confirm the related "phantom member" issue: deleting a checked-in member should also check them out, otherwise they linger on the muster. If that's a quick fix, address it; otherwise leave it for a separate ticket.
