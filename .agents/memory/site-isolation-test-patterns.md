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

## List response shape normalization

Routes return three different shapes — `expectIsolated` handles all:
- Plain array: `Array.isArray(body)`
- `{ items: [...] }` — most routes
- `{ records: [...], total, page, pageSize }` — audit engine paginated response

Fallback chain: `body?.items ?? body?.records ?? (Array.isArray(body) ? body : [])`.

## Helpdesk ticket_number design flaw (schema-wide unique + per-site sequential)

`help_desk_tickets.ticket_number` has a schema-wide UNIQUE constraint but the route
generates per-site sequential numbers starting from 1 (HD-001, HD-002…).
Dev/demo data occupies HD-001 through HD-008 across multiple sites; a 5-attempt retry
loop is not enough to skip past them.

**Fix for tests**: use `seedHelpdeskTicketRaw(siteId, title)` from
`tests/helpers/seedEnterprise.ts` to insert tickets directly via SQL with a
collision-safe `ISOTEST-{timestamp}-{rand}` ticket_number. Test only GET list and
GET/PUT by-id isolation (not POST creation).

**Cleanup**: match on `description = 'ISO_HDISOTEST'` (set by the helper) or
`site_id = ANY([siteAId, siteBId])`. Pre-test sweep in `seedEnterpriseTestCustomer`
deletes stale `ISO_HDISOTEST` rows so aborted runs don't pollute the next one.

## RA Builder DELETE HTTP status quirk

`DELETE /api/ra-builder/assessments/:id` uses `scopedWhere` so cross-site calls
delete 0 rows (data isolation is correct), but the route always returns
`{ success: true }` even when 0 rows are deleted.

Test with a DATA-level assertion: verify Site A can still GET its record after
Site B's DELETE attempt, rather than asserting [403, 404] on the HTTP status.

## CDM projects schema migrations

`cdm_projects` may be missing columns (cpp_status, pci_status, hsf_status,
welfare_*, site_id, notes, f10_alert_sent_at) in a stale customer schema.
Call `ensureCdmProjectsColumns()` at the start of the CDM test block; it runs
`ALTER TABLE … ADD COLUMN IF NOT EXISTS` for each column (idempotent).
