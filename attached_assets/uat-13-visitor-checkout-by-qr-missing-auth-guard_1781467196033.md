# UAT-13 — Add requireAuth to /api/visitors/checkout-by-qr (consistency / hardening)

## Severity: LOW
This is a defence-in-depth / consistency fix, not an active exploit. Worth doing, but not urgent.

## Why
`POST /api/visitors/checkout-by-qr` in `server/routes/visitors.ts` (handler ~line 1066) is a **state-mutating** endpoint — it toggles a visitor's checked-in/checked-out status by QR code. Unlike essentially every sibling visitor endpoint, it has **no `requireAuth` middleware**.

It then resolves the tenant from `req.customerId` (~line 1075), which is only populated by authentication (session, or Bearer-token hydration). Consequences:
- In practice it works, because its only caller is the authenticated kiosk (`client/src/pages/KioskMode.tsx` ~line 177), so `req.customerId` is set.
- But a genuinely unauthenticated request has `req.customerId === undefined`, so `getCustomerDatabase(undefined)` throws and the caller gets a 500 instead of a clean 401. That's a sloppy failure mode on a public, state-changing route.
- It is scoped (a caller can only ever act on their own tenant's visitors, since the tenant comes from their own auth context — no cross-tenant access), which is why this is Low and not High.

The fix simply brings it in line with the rest of the visitor routes.

## What to change
1. In `server/routes/visitors.ts`, add `requireAuth` to the route definition:
   ```ts
   app.post("/api/visitors/checkout-by-qr", requireAuth, async (req, res) => { ... })
   ```
2. Since `requireAuth` guarantees `req.customerId`, you can simplify the `req.user?.username || 'system'` fallback (~line 1074) to use `req.user!.username` like the sibling endpoints, if you want consistency.
3. Confirm the kiosk caller (`KioskMode.tsx`) already sends session credentials (it uses `apiRequest`, which does) — so no client change is needed.

## Acceptance test
- Kiosk visitor QR check-out still works exactly as before (authenticated session).
- An unauthenticated POST to `/api/visitors/checkout-by-qr` now returns a clean 401, not a 500.
- No cross-tenant behaviour change (was already scoped to the caller's tenant).
