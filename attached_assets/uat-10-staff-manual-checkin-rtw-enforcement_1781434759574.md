# UAT-10 — Manual staff check-in bypasses Right to Work enforcement

## Why — this is a real compliance gap
TPR enforces Right to Work (RTW) at staff check-in via the helper `checkStaffRightToWork(...)` in `server/routes/staff.ts` (defined ~line 64). It is correctly applied to BOTH kiosk paths:
- `POST /api/staff/qr-checkin` (QR badge)
- `POST /api/staff/:id/kiosk-toggle` (manual kiosk toggle) — gate at lines ~909–916

But the **admin manual check-in endpoint** `POST /api/staff/:id/checkin` (lines ~768–843) does **NOT** call the RTW gate. It calls `databaseService.checkInStaff(...)` directly (line ~779) with no compliance check.

**Impact:** a staff member whose Right to Work has expired is correctly blocked at the kiosk, but any authenticated user can still check them in via the manual endpoint, completely bypassing enforcement. RTW enforcement is therefore only partial, despite being marketed as live. In the UK, employing someone without valid Right to Work carries civil penalties of up to £60,000 per worker, so this gap matters legally, not just cosmetically.

## What to change (primary fix)
In `server/routes/staff.ts`, in `POST /api/staff/:id/checkin` (~line 769), add the same RTW gate the kiosk-toggle uses, BEFORE calling `databaseService.checkInStaff`. Mirror lines ~909–916 exactly:

```ts
// Right to Work gate — enforce on the manual path too, matching the kiosk paths.
if (context.customerId) {
  const rtw = await checkStaffRightToWork(context.customerId, id);
  if (!rtw.ok) {
    return res.status(rtw.status).json(rtw.body);
  }
}
```
Place it after the customer context is created (~line 776) and before `databaseService.checkInStaff` (~line 779). Keep the fail-closed behaviour (the helper already returns 503 and blocks if the check itself errors).

## Two policy decisions to confirm with Andy (do NOT change without his steer)
1. **"No RTW record = allowed".** The gate only blocks when an RTW record EXISTS and is expired (`checkStaffRightToWork` ~line 79). A staff member with NO right_to_work record on file is currently allowed in. For some staff (e.g. long-standing British citizens) RTW may legitimately not be tracked, so blanket-blocking could lock everyone out. Options: (a) leave as-is (block only known-expired), (b) add a setting "require RTW record for all staff before entry". Recommend making it a configurable setting, default off, so customers in high-risk sectors can switch it on. Flag for Andy — don't hardcode a block.
2. **DBS is not enforced at any check-in path** — only RTW is. DBS is role-dependent (not every role needs it), so it should NOT be a blanket entry block. If DBS-at-entry enforcement is wanted, it needs to be role-scoped and configurable — a separate ticket, not this one.

## Acceptance test
- Staff member with an EXPIRED right_to_work record:
  - Kiosk check-in → blocked (unchanged).
  - Manual `POST /api/staff/:id/checkin` → now ALSO blocked with the same 403 "Right to Work documentation has expired" message.
- Staff member with a VALID (or no) RTW record → manual check-in still succeeds.
- Simulate an RTW check error → manual check-in fails closed with 503, matching the kiosk behaviour.
- Check-OUT is never blocked by RTW on any path.
