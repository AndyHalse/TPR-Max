---
name: HTTP site-isolation test patterns
description: Key lessons from building the vitest+supertest enterprise multi-site isolation suite.
---

## enterprise_admin vs site_coordinator for isolation tests

`enterprise_admin` role → `resolveEnterpriseGrants()` returns `allowedSiteIds: 'all'`
→ `scopedWhere()` returns `undefined` (no filter) — intentional for super-users.

To test isolation, grant `site_coordinator` at each test site instead.
This gives `allowedSiteIds: [siteAId, siteBId]` → `scopedWhere` uses `activeSiteId` as
a real `WHERE siteId = activeSiteId` predicate.

**Why:** enterprise_admin sees all data regardless of active site — that IS the right
product behaviour. Tests need per-site-scoped users to verify the filter fires.

## Session injection in supertest (test backdoor)

`POST /api/__test__/session` must inject ALL session fields (userId, customerId,
AND activeSiteId) in ONE atomic call with explicit `session.save()` callback.

Never rely on a follow-up `POST /api/enterprise/active-site` to set activeSiteId —
auto-save timing is unreliable in a synchronous test loop.

## markerOf must return the exact marker string

`expectIsolated` uses `markersA.includes(markerA)` (exact equality).
If `createBody` wraps the marker in a prefix (`"Ticket: " + marker`), the
`markerOf` extractor must strip the prefix, OR use the marker directly as
the extracted field value.

## sites table id is varchar, not uuid

Cleanup queries must use `ANY($1::text[])`, not `ANY($1::uuid[])`.
