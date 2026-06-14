# Bugfix: Staff with expired Right to Work can get in via the kiosk name-search, even though the QR scan blocks them (June 2026)

The kiosk has two ways a staff member can check themselves in:

1. **Scan their QR badge** → `POST /api/staff/qr-checkin`
2. **Search their name** (the fallback for anyone without a QR badge) → `POST /api/staff/:id/kiosk-toggle`

The QR path does the right thing. Before it checks anyone in, it looks up their Right to Work record and, if the documentation has expired, it **blocks entry** with "Entry denied: Right to Work documentation has expired. Contact HR." It even fails closed — if the compliance check itself errors, it still refuses entry as a precaution.

The name-search path does **none of that**. It just toggles the person in. So a staff member whose Right to Work has expired walks up to the same kiosk, taps "Search by name" instead of scanning, types their name, and they're in. The compliance gate is trivially bypassed.

This matters. Right to Work is a legal obligation — letting someone work on site after their RTW has lapsed is exactly what this block exists to prevent, and right now it only covers the QR door, not the one next to it. Anyone who's lost or never had a QR badge skips the check entirely.

The clean fix is to pull the RTW check out into one shared helper and run it on both kiosk check-in paths, so they can never drift apart again. One file: `server/routes/staff.ts`.

Copy everything below the line into the Replit agent.

---

## THE BUG

In `server/routes/staff.ts`:

- `POST /api/staff/qr-checkin` (around **lines 960–1058**) runs a Right to Work expiry check before checking a staff member in. If `right_to_work.is_current = TRUE` and `expiry_date` is in the past, it returns **403 BLOCKED**. If the check errors, it returns **503** and refuses entry (fail-closed).
- `POST /api/staff/:id/kiosk-toggle` (around **lines 851–957**) is the kiosk's name-search fallback (called from `client/src/pages/KioskMode.tsx`, the "staff-search" section). On its check-in branch it goes straight to `databaseService.checkInStaff(...)` with **no RTW check at all**.

Same kiosk, same self-service check-in, two different rules. The QR path enforces Right to Work; the name-search path ignores it.

(Note: the authenticated admin path `POST /api/staff/:id/checkin` also has no RTW check. That one is an admin deliberately checking someone in from the staff page, so an override there is defensible — see "A decision for Andy" at the end. The clear bug is the **kiosk** name-search, which is meant to mirror the QR kiosk behaviour but doesn't.)

## THE FIX

### Step 1 — Extract the RTW check into one shared helper

Near the top of `server/routes/staff.ts`, alongside the other helpers (e.g. just after `generateFireMarshalUrlId`), add a single function that performs the same check the QR path already does. Return a structured result instead of writing the response, so both call sites can use it.

```ts
// Right to Work gate for kiosk check-ins.
// Returns { ok: true } to allow, or a { ok: false, status, body } to block.
// Fails CLOSED: if the compliance check itself errors, entry is refused.
async function checkStaffRightToWork(
  customerId: string,
  staffId: string
): Promise<{ ok: true } | { ok: false; status: number; body: any }> {
  try {
    const custDb = await customerDbService.getCustomerDatabase(customerId);
    const schemaName = customerDbService.generateSchemaName(customerId);
    const rtwPool = (custDb as any).$client ?? (custDb as any).session?.client;
    if (!rtwPool) return { ok: true }; // No raw pool available — same behaviour as the QR path
    const rtwResult = await rtwPool.query(
      `SELECT is_current, expiry_date FROM "${schemaName}".right_to_work
       WHERE staff_id = $1 AND is_current = TRUE LIMIT 1`,
      [staffId]
    );
    const rtw = rtwResult.rows[0];
    if (rtw && rtw.expiry_date && new Date(rtw.expiry_date) < new Date()) {
      return {
        ok: false,
        status: 403,
        body: {
          success: false,
          reason: 'BLOCKED',
          message: 'Entry denied: Right to Work documentation has expired. Contact HR.',
        },
      };
    }
    return { ok: true };
  } catch (rtwErr) {
    logger.error('RTW check failed — denying entry as precaution:', rtwErr);
    return {
      ok: false,
      status: 503,
      body: {
        success: false,
        reason: 'RTW_CHECK_FAILED',
        message: 'Entry temporarily unavailable: compliance check could not be completed. Please contact the site administrator.',
      },
    };
  }
}
```

### Step 2 — Use the helper in `kiosk-toggle`, on the check-in branch only

In `POST /api/staff/:id/kiosk-toggle`, after the staff member is looked up and **before** the check-in happens, gate the check-in (not the check-out — same rule as QR, you never block someone leaving):

```ts
const existing = await databaseService.getStaffById(context, id);
if (!existing) {
  return res.status(404).json({ error: "Staff member not found" });
}

const isCheckedIn = !!existing.isCheckedIn;

// Right to Work gate — only when checking IN, never block a check-out.
// Mirrors POST /api/staff/qr-checkin so both kiosk paths enforce the same rule.
if (!isCheckedIn && context.customerId) {
  const rtw = await checkStaffRightToWork(context.customerId, id);
  if (!rtw.ok) {
    return res.status(rtw.status).json(rtw.body);
  }
}

const staff = isCheckedIn
  ? await databaseService.checkOutStaff(context, id)
  : await databaseService.checkInStaff(context, id, true);
```

### Step 3 (optional, recommended) — De-duplicate the QR path

Replace the inline RTW block inside `POST /api/staff/qr-checkin` (the `if (!foundStaff.isCheckedIn) { ... }` block that runs the same `right_to_work` query) with a call to the new helper, so there's only one copy of the logic:

```ts
if (!foundStaff.isCheckedIn) {
  const rtw = await checkStaffRightToWork(foundContext.customerId, foundStaff.id);
  if (!rtw.ok) {
    return res.status(rtw.status).json(rtw.body);
  }
}
```

Behaviour is identical to today — same query, same 403/503 responses — it's just shared now. If you'd rather not touch the working QR path, Steps 1 and 2 alone fix the bug; Step 3 only prevents future drift.

### Front-end note

`KioskMode.tsx` already surfaces the error: `staffToggleMutation.onError` shows a toast with `error?.message`. Confirm the message comes through — `apiRequest` should reject on a non-2xx and the toast will read "Entry denied: Right to Work documentation has expired. Contact HR." If the toast shows a generic message instead of the server's, have `onError` read the server body (same pattern the QR scan result uses) so the kiosk user sees *why* they were blocked. No other UI change needed.

## VERIFICATION

1. **The core bug.** Give a test staff member a Right to Work record with `is_current = TRUE` and an `expiry_date` in the past, and make sure they're checked out.
   - Kiosk → **Search by name** → tap the staff member. Entry is **denied** with the RTW message. (Before the fix: they were checked in.)
   - Same staff member, Kiosk → **Scan QR** → still denied (unchanged). Both kiosk doors now behave the same.
2. **A compliant staff member is unaffected.** Staff member with a current, non-expired RTW (or no RTW record at all) → name-search check-in works exactly as before.
3. **Check-OUT is never blocked.** Check the expired-RTW staff member in by some means, then Kiosk → Search by name → they can still check **out**. We never trap someone on site.
4. **Fail-closed still holds.** Temporarily break the RTW query (e.g. wrong column name in the helper) → name-search check-in returns the 503 "compliance check could not be completed" message, not a silent allow. Restore afterwards.
5. **No regression on the QR path.** If you did Step 3, re-run test 1's QR scan and a compliant QR scan — identical to before.
6. `npx tsc --noEmit` clean for `server/routes/staff.ts`.

## A decision for Andy (not part of this fix)

The authenticated admin path `POST /api/staff/:id/checkin` (the "Check In" button on the Staff Management page) also has no RTW check. That's arguably fine — it's a logged-in administrator making a deliberate call, and an override is sometimes legitimate. But if you want Right to Work to be a hard gate everywhere with no exceptions, say so and we'll apply the same helper there too (probably with an explicit "override" confirmation so admins know they're letting in someone non-compliant). Left out on purpose for now.
