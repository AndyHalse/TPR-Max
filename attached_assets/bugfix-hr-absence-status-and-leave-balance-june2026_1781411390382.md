# Bugfix: HR module — absence corrupts employment status, leave balance ignores pending, dashboard "YTD" is all-time (June 2026)

Four issues found in the HR module during a code review of the latest codebase. Three are data-correctness bugs, one is a hardening fix on the feature gate. They're all small and self-contained. The rest of the HR module (DBS soft-delete, confidential document download block, Right to Work, payroll sick-day source, org-chart circular-reference guard) was checked and is correct — leave it alone.

Copy everything below the line into the Replit agent.

---

## BUG 1 — Sickness absence overwrites the staff employment status (HIGH)

**File:** `server/routes/hrAbsence.ts`

The absence module treats `staff.employment_status` as if it were a temporary "are they in today" flag. It isn't — it's an employment classification (`active` / `leaver` / `archived` / `on_leave`) read by the org chart, payroll export and staff filters. Two writes corrupt it:

1. **Recording an absence always sets `on_leave`** (POST `/api/staff/:staffId/absences`, ~lines 48–51):
   ```ts
   await pool.query(
     `UPDATE "${schemaName}".staff SET employment_status = 'on_leave' WHERE id = $1`,
     [staffId]
   );
   ```
   HR routinely *back-fills* past sickness spells so the Bradford Factor is accurate. Logging a spell that already ended flips an employee who is at their desk right now to "on leave", and nothing ever corrects it (the return step is a separate call that may never be made for a historical entry). It will also clobber a `leaver`/`archived` status back to `on_leave`.

2. **Recording a return always sets `active`** (PUT `/api/staff/:staffId/absences/:id/return`, ~lines 99–102):
   ```ts
   await pool.query(
     `UPDATE "${schemaName}".staff SET employment_status = 'active' WHERE id = $1`,
     [staffId]
   );
   ```
   This blindly resets to `active`, which can resurrect a `leaver`/`archived` person, and would wrongly mark someone `active` even if they still have another open absence.

### Fix

Make both writes conditional so they only ever flip the *transient* state and never overwrite a real classification:

- **POST** — only mark an absence-holder on leave if they're currently `active`:
  ```ts
  await pool.query(
    `UPDATE "${schemaName}".staff
     SET employment_status = 'on_leave'
     WHERE id = $1 AND employment_status = 'active'`,
    [staffId]
  );
  ```

- **PUT return** — only revert to active if they're currently `on_leave`, and only if they have no *other* still-open absence:
  ```ts
  await pool.query(
    `UPDATE "${schemaName}".staff
     SET employment_status = 'active'
     WHERE id = $1
       AND employment_status = 'on_leave'
       AND NOT EXISTS (
         SELECT 1 FROM "${schemaName}".absence_records
         WHERE staff_id = $1 AND return_date IS NULL AND id <> $2
       )`,
    [staffId, id]
  );
  ```

Don't change the `absence_records` insert/update itself — those are correct. This is purely about not letting the sickness flow stamp over the employment classification.

## BUG 2 — Leave "remaining" ignores pending requests (MEDIUM)

**File:** `server/utils/leaveUtils.ts`, function `calculateLeaveBalance` (~lines 123–161)

`remaining` is computed as entitlement minus *approved* leave only:
```ts
remaining: Math.round((entitlementDays - taken) * 2) / 2,
```
`pending` is returned as a separate number but never netted off. So an employee with 3 days left can submit 10 more days of requests and the "remaining" figure still shows 3 — there's nothing stopping them over-booking, and an approver only finds out when the numbers go negative.

### Fix

Keep `taken`, `pending` and `remaining` exactly as they are (the UI may show them individually), but add an `available` figure that nets pending off, and surface *that* as the bookable number:

```ts
return {
  entitlement: entitlementDays,
  taken: Math.round(taken * 2) / 2,
  pending: Math.round(pending * 2) / 2,
  remaining: Math.round((entitlementDays - taken) * 2) / 2,
  available: Math.round((entitlementDays - taken - pending) * 2) / 2,
};
```
Add `available: number;` to the function's return type annotation. Then in the client leave screens (the staff leave panel and the booking form), show **Available** (entitlement − taken − pending) as the headline "days you can still book", with Remaining/Pending shown as supporting detail. Grep the client for where `balance.remaining` is rendered and add `balance.available` alongside it; don't remove `remaining`.

## BUG 3 — Absence overview "total days YTD" is actually all-time (LOW)

**File:** `server/routes/hrAbsence.ts`, GET `/api/absences/overview` (~line 138)

```ts
const totalDaysYTD = absences.rows.reduce((s: number, a: any) => s + Number(a.days_lost || 0), 0);
```
This sums `days_lost` across **every absence record ever**, but the field is labelled `totalDaysYTD` and sits next to per-staff Bradford scores that are correctly rolling-365-day. The headline total and the per-row totals disagree.

### Fix

The per-staff rolling figure is already computed — `o.totalDaysThisYear` (which is `bf.totalDays`, rolling 365). Sum that instead of re-totalling the raw rows:
```ts
const totalDaysYTD = overview.reduce((s, o) => s + Number(o.totalDaysThisYear || 0), 0);
```
Now the headline equals the sum of the rows beneath it. (Optional: if you'd rather keep the variable name honest, the per-staff fields are labelled `totalSpellsThisYear` / `totalDaysThisYear` but are rolling-365 not calendar-year — fine for Bradford, just be aware the "year" wording is loose throughout.)

## BUG 4 — HR feature gate fails open (LOW / hardening)

**File:** `server/routes/hrMiddleware.ts`

```ts
if (settings?.featureHrModule === false) {
  return res.status(403).json({ ... });
}
next();
```
The HR module is a paid TPR Max feature gated on `featureHrModule` (default `false` in `isolatedSchema.ts`). But this only blocks on a strict `=== false`. If `getCompanySettings` returns `undefined` (load error) or the flag is `null`/`undefined`, the gate falls through and serves the paid module. Every other feature gate in the codebase treats "not explicitly enabled" as blocked.

### Fix

Block unless the flag is explicitly truthy:
```ts
if (!settings?.featureHrModule) {
  return res.status(403).json({
    error: 'The HR module requires a TPR Max subscription.',
    planRequired: 'tpr_max',
  });
}
```
Confirm against `isolatedSchema.ts` that `featureHrModule` defaults to `false` (it does, per the schema) so this doesn't lock out an existing Max customer who already has it enabled. If any customer currently relies on the flag being absent, set it explicitly `true` for them in Platform Admin first.

## VERIFICATION

1. **Back-dated sickness, employee at work:** staff member is `active`. Log a *past* absence (start and an implied past return). Their status stays `active` after the POST? No — POST sets `on_leave` only because they were active; then log the return → they go back to `active`. Confirm the round-trip ends at `active` and a `leaver` is never flipped: set a staff member to `leaver`, log + return an absence against them → they remain `leaver` throughout.
2. **Two overlapping absences:** open absence A, open absence B, close A → staff stays `on_leave` (because B is still open); close B → staff becomes `active`.
3. **Leave over-booking:** staff with 28-day entitlement, 25 approved, 5 pending → API returns `taken: 25, pending: 5, remaining: 3, available: -2`; the booking screen shows **Available** and the user can see they've over-committed.
4. **Absence overview total:** the dashboard "total days" equals the sum of the per-staff day counts shown in the table beneath it (rolling 365), not an inflated all-time number.
5. **HR gate:** a customer with `featureHrModule` unset/false gets a 403 from any `/api/hr/...` or `/api/staff/.../leave|absences|dbs|...` route; a Max customer with it `true` is unaffected.
6. Tenant isolation unchanged — every query still runs against `"${schemaName}"` derived from `req.customerId`.
7. `npx tsc --noEmit` clean for `hrAbsence.ts`, `leaveUtils.ts`, `hrMiddleware.ts` and any client file touched for the `available` figure.
