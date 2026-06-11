# Security — files can be read across customer tenants (the remaining objects gap)

**Priority: HIGH (multi-tenant data isolation / GDPR). Effort: medium — the robust fix needs customer-namespaced object paths + a backfill. Read it all before starting.**

## Context — what's already fixed, and what's left

The earlier objects prompt (`bugfix-objects-no-access-control-june2026.md`) has been **partly implemented — good:**

- `GET /objects/:objectPath(*)` now requires a staff session **or** a valid contractor-portal token (`server/routes/settings.ts:711`). The open-to-the-internet hole is closed. ✅
- Logos/branding now serve through a separate `/api/public-logo/:token` route, so locking down `/objects` didn't break the login-page logos. ✅

**What's still wrong (this prompt):** the `/objects` route checks that the caller is logged in to *something*, but never checks the file belongs to *their* customer. And uploaded files all live in one shared directory with UUID names, not namespaced per customer (`getPrivateObjectDir()` returns a single dir; uploads go to `<privateDir>/uploads/<uuid>` and `<privateDir>/contractor-portal/<uuid>`). So:

1. A logged-in staff user of **Customer A** who has a **Customer B** object path can fetch Customer B's file.
2. Worse — `verifyPortalToken(token) !== null` accepts **any** valid contractor-portal token from **any** tenant, ignoring its `customerId`. So a contractor logged into one customer's portal can fetch **any** file in **any** other customer's account if they have the path.

These are compliance documents — insurance, RAMS, DBS, certificates. TPR's headline selling point is schema-per-customer data isolation, so a cross-tenant file read undercuts exactly what enterprise buyers are told. UUID paths make it non-trivial (you need the path), but paths leak through emails, logs, and shared links, and an insider at one tenant is a realistic threat. This needs closing.

## The fix

### Part 1 — namespace object storage by customer (the real fix)

Make every object's storage path carry its customer id, then check it on the way out.

- **On upload**, write to a customer-scoped path — e.g. `<privateDir>/<customerId>/uploads/<uuid>` and `<privateDir>/<customerId>/contractor-portal/<uuid>`. Update the upload sites that build these paths: `server/routes/settings.ts` (`/api/objects/upload`), `server/routes/contractorPortal.ts` (portal upload), and the other `…/uploads/<uuid>` writers (`permitToWork.ts`, `complianceCertificates.ts`, `contractors.ts`, `ppm.ts`, cdm/induction). The stored `documentUrl` becomes `/objects/<customerId>/...`.
- **On serve** (`GET /objects/:objectPath`), after confirming the caller is authenticated, extract the `customerId` segment from the requested path and require it to match the caller's customer:
  - staff session → must equal `req.session.customerId`;
  - portal token → must equal the token's `payload.customerId`.
  - Mismatch → `403`.
- **Backfill existing objects:** existing files sit in the un-namespaced `<privateDir>/uploads/...` and `/contractor-portal/...`. Either (a) run a one-off migration that moves each existing object under its owning customer's prefix and rewrites the stored `document_url` values, or (b) keep a legacy fall-through that serves old-style paths only to a staff session whose customer owns the referencing DB row. Option (a) is cleaner; if you do (b) as an interim, it must still verify ownership by looking the document row up in the caller's customer schema — never serve a legacy path on token-only auth.

### Part 2 — tighten the portal-token branch now (quick hardening, do regardless)

Even before Part 1 lands, restrict what a portal token can reach: a portal token should only ever be allowed to fetch objects under the `contractor-portal/` prefix **and** belonging to its own `customerId`. A staff session should never be required to use the portal branch. This shrinks the blast radius immediately:

```ts
// portal-token branch
const payload = token ? verifyPortalToken(token) : null;
if (!payload) return res.status(401)...;
// portal tokens may only read contractor-portal objects for their own customer
if (!req.path.includes(`/contractor-portal/`) || !req.path.includes(payload.customerId)) {
  return res.status(403).json({ error: 'Not permitted.' });
}
```

(Exact path check depends on Part 1's path format — wire it to whatever the namespacing produces.)

## Scope guard

- Don't reopen the auth gate that's already working, and don't touch `/api/public-logo` or `/public-objects` — logos are handled.
- This is about **customer ownership**, not per-user ACL. Don't try to build the per-user `canAccessObject` group rules (those access-group types are still stubs) — customer-level isolation is the goal.
- Touch the object **upload path-building** and the **`/objects` serve route**; avoid unrelated contractor logic.

## How to verify

1. As a staff user of Customer A, fetch one of Customer A's document URLs → works.
2. Take a Customer B document path and request it while logged in as Customer A (staff) → `403`, not the file.
3. With a valid Customer A **portal token**, request a Customer B object path → `403`.
4. With a Customer A portal token, request a Customer A **non-portal** `/uploads/` object (not a contractor-portal file) → `403` (portal tokens are limited to contractor-portal objects).
5. Normal portal upload → review → view-by-admin flow still works end to end (paths now namespaced).
6. An existing (pre-change) document still opens for its owning customer (backfill / legacy fall-through works), and does **not** open for another customer.
