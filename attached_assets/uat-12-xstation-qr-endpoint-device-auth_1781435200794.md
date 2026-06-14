# UAT-12 — Harden the X-Station QR scan endpoint (unauthenticated, trusts body customerId)

## Why
`POST /api/xstation/qr-scan` in `server/routes/visitors.ts` (handler ~line 1771) is the hardware/door-device QR endpoint. It has issues for an internet-exposed endpoint that MUTATES check-in state:

1. **No authentication / no device credential.** The route has no `requireAuth` and no device shared-secret/API-key check. It is reachable by any client (covered only by `generalRateLimit`, 1000/15min per IP).
2. **Tenant is chosen by the caller.** `customerId` is read from the request body (`bodyCustomerId`, ~line 1773) and used to open that tenant's database. The caller picks which tenant to act on.
3. **Signature is only checked for MEETING codes.** `MTG:` codes are properly HMAC-verified (~lines 1790–1799) — good. But staff, pre-booking and visitor QR codes (~line 1879 onward) are looked up by raw string with **no signature**, so the QR string itself is the only credential, and it controls check-in/out for the caller-specified tenant.

**Impact:** anyone who obtains or guesses a valid QR string for a tenant can drive check-in/check-out state for that tenant via an unauthenticated internet endpoint — e.g. check a pre-booked visitor in, or (via the toggle paths) check someone out, which corrupts the live evacuation muster. QR strings are ~48-bit so not trivially guessable, but there is no device trust boundary at all. For an enterprise deployment (e.g. Cowiesburn, 120+ sites) this is a real hardening gap.

## What to change
1. **Add a device credential.** Require X-Station devices to present a shared secret / API key (e.g. an `x-device-key` header or signed token) that is validated against a per-customer or per-device secret before any action. Reject with 401 if missing/invalid. This creates a trust boundary instead of "anyone who can reach the URL".
2. **Derive or verify the tenant, don't blindly trust the body.** Tie `customerId` to the validated device credential (a device belongs to one tenant) rather than accepting an arbitrary `customerId` from the request body. If the body customerId must remain, validate it matches the device's tenant.
3. **Sign non-meeting QR codes too** (defence in depth). Extend the same HMAC approach already used for `MTG:` codes to staff/visitor/pre-booking QR codes, so a raw guessed/copied string alone isn't sufficient. (Larger change — can be a follow-up if device-key auth lands first.)
4. Keep the existing `MTG:` HMAC verification unchanged.

## Related, lower-priority note (separate, optional)
`POST /api/staff/qr-checkin` (`server/routes/staff.ts` ~line 1014) resolves a QR by **scanning every tenant's database** in a loop (`getAllCustomers()` then a query per customer) and first-match-wins. Two consequences:
- Performance: each scan is N database queries; at 120+ tenants this is heavy under load.
- Correctness: a QR-string collision across tenants would check the person into whichever tenant matches first.
Consider scoping staff QR check-in to a known kiosk/tenant context (like the kiosk-toggle path does) rather than a global scan. Not urgent, but worth a ticket.

## Acceptance test
- A POST to `/api/xstation/qr-scan` without a valid device key → 401, no state change.
- A POST with a valid device key but a `customerId` that doesn't match the device's tenant → rejected.
- A valid device + valid meeting `MTG:` code → works as before (HMAC still enforced).
- A valid device + valid staff/visitor QR for the device's own tenant → works.
