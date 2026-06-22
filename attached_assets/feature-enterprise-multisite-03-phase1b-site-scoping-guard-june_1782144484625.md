# Enterprise Multi-Site — Prompt 03 — Phase 1b: Site-scoping guard (the security spine)

**Phase 1 of the Enterprise Multi-Site build. THIS IS THE SECURITY BOUNDARY between one site’s data and another’s. Build it carefully and consistently. Prompt 04 will try to break it.**

## Context
After prompt 02, every site-scoped table has a nullable `site_id`. Now we make the application enforce site scoping for enterprise customers, while leaving non-enterprise customers completely unchanged. Routes today resolve `req.customerId` and call `customerDbService.getCustomerDatabase(customerId)` (see `server/routes/contractors.ts` for the pattern).

## What to build

### 1. Site context on the session/request
- Extend the auth/session handling (`server/auth.ts`) so that, after login, the request carries an **active site context** for enterprise customers:
  - `req.siteContext = { isEnterprise: boolean, activeSiteId: string | null, allowedSiteIds: string[] | 'all' }`
- For a **non-enterprise** customer: `isEnterprise = false`, `activeSiteId = <the default site id>`, `allowedSiteIds = 'all'` (there is only one site). Behaviour must be identical to today.
- For an **enterprise** customer: `activeSiteId` is the site the user is currently working in (set via the site switcher — prompt 05); `allowedSiteIds` is the set of sites the user may access (for now, all sites of the customer — real per-user limits come with roles in prompt 07).
- Read `is_enterprise` from the management `customers` record.

### 2. A single, mandatory site-scoped data-access helper
Create `server/siteScope.ts` exporting a helper that ALL site-scoped reads/writes must go through. It wraps `getCustomerDatabase` and injects `site_id`:
- `getScopedDb(req)` → returns `{ db, siteId, allowedSiteIds }` (throws if enterprise and no active site context).
- Provide helpers that enforce scoping, e.g.:
  - `scopedWhere(req, table)` → returns a Drizzle condition `eq(table.siteId, activeSiteId)` for site-scoped tables; for an enterprise user widening to the whole estate, supports an explicit `{ all: true }` that returns `inArray(table.siteId, allowedSiteIds)` (or no filter when `allowedSiteIds = 'all'`).
  - On **insert/update** to a site-scoped table, the helper sets `site_id = activeSiteId` automatically. A write must never land without a `site_id` for an enterprise customer.

### 3. Apply scoping to every site-scoped route
Update the route handlers that read/write the site-scoped tables (listed in prompt 02) so they go through the helper instead of querying the table directly. Every list/read filters by site; every create/update stamps the active `site_id`.
- For non-enterprise customers the filter is a no-op (single default site), so output is unchanged.
- Prohibit direct access to site-scoped tables that bypasses the helper. Add a short comment block at the top of `siteScope.ts` stating this is the isolation boundary and bypassing it is a security defect.

### 4. Default-site fallback
Any code path that creates a record without a site (e.g. a public kiosk or token endpoint before the kiosk-site work in prompt 06) must attach the customer’s **default site** rather than NULL.

## Rules
- **Fail closed:** if an enterprise request has no resolvable site context, reject the request (do not silently query across all sites).
- Non-enterprise customers must see zero behavioural change — verify a normal customer’s pages still load identically.
- Keep the helper small, central, and the single source of truth. Do not scatter `site_id` filters ad hoc across routes outside the helper.
- en-GB unaffected; no schema changes in this prompt.

## Acceptance criteria
- A non-enterprise test customer behaves exactly as before (no visible change anywhere).
- For an enterprise test customer with two sites, a list endpoint (e.g. visitors, contractors) returns only the active site’s records.
- Creating a record while “in” site A attaches `site_id = A`; switching to site B and listing does not show it.
- An enterprise request with no active site context is rejected, not served cross-site data.
- App builds and runs.

## Do NOT
- Do not weaken cross-**customer** isolation (the existing database-per-customer boundary stays).
- Do not let any site-scoped write occur without a `site_id` for enterprise customers.
- Do not build the switcher UI here (prompt 05) — just accept and honour an active site id from the session.
