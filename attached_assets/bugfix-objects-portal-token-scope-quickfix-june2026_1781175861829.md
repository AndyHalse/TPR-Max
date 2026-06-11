# Quick fix — limit contractor-portal tokens to contractor-portal files (ship today)

**Priority: HIGH but tiny. Effort: a few lines in one route. This is the immediately-shippable slice of the bigger isolation fix (`bugfix-objects-cross-tenant-isolation-june2026.md`) — do this now, do the full namespacing fix after.**

## Context

`GET /objects/:objectPath(*)` (`server/routes/settings.ts:711`) was correctly locked down so a caller must have a staff session **or** a valid contractor-portal token. Good. But the portal-token branch accepts the token and then serves **any** object path — including `/objects/uploads/...` files (staff documents, permits, HR, certificates) that have nothing to do with the contractor portal.

A contractor only ever legitimately needs **contractor-portal** files. So the cheap, safe win that ships today — with no schema change and no backfill — is: a portal token may only fetch objects under the `contractor-portal/` prefix. Staff sessions are unchanged.

This shrinks the blast radius a lot now; the full per-customer ownership check (so contractor A can't read contractor B's portal files in another customer) is the separate namespacing prompt.

## The change

In the portal-token branch of `GET /objects/:objectPath(*)`, after the token verifies, reject anything that isn't a contractor-portal object:

```ts
const hasStaffSession = !!(req.session?.userId && req.session?.customerId);
if (!hasStaffSession) {
  const authHeader = req.headers['authorization'];
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
  const payload = token ? verifyPortalToken(token) : null;
  if (!payload) {
    return res.status(401).json({ error: 'Authentication required to access this file.' });
  }
  // Portal tokens may only read contractor-portal documents, never staff/uploads objects.
  if (!req.path.includes('/contractor-portal/')) {
    return res.status(403).json({ error: 'Not permitted.' });
  }
}
```

That's the whole change.

## Optional same-day upgrade (stronger, still no schema change)

If you want to go one better today: for a portal token, look up the requested `documentUrl` in that token's customer schema and confirm a `contractor_documents` row with that URL belongs to the token's `contractorCompanyId`. That scopes a contractor to their **own company's** documents, not just any contractor-portal file. Do this only if it's quick — otherwise ship the prefix check above and leave full per-customer scoping to the namespacing prompt.

## Scope guard

- Touch only the portal-token branch of the `/objects` route. Don't change the staff-session path, `/api/public-logo`, or `/public-objects`.
- No schema changes, no upload-path changes — those belong to `bugfix-objects-cross-tenant-isolation-june2026.md`.

## Verify

1. With a valid portal token, fetch a `/objects/contractor-portal/<uuid>` file → works.
2. With the same portal token, fetch a `/objects/uploads/<uuid>` file (a staff/permit document) → `403`.
3. Staff session can still fetch both kinds → unchanged.
4. Normal portal upload → admin review → view flow still works.
