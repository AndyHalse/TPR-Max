# Feature: Make the Central / Independent toggle actually work

**Module:** Enterprise multi-site — site management style
**Type:** Behaviour wiring (the toggle currently stores a value but does nothing)
**Needs `npm run db:push`?** NO — the `site_management_style` column and the
`can_manage_site_users` column already exist. No schema change.

---

## Background — what's wrong today

The platform-admin "Enterprise Settings" dialog has a **Site management style**
toggle: **Central** ("HQ manages all sites and users") vs **Independent**
("Each site manages its own users"). Today this is a **no-op**: the value
`siteManagementStyle` is saved to `customers.site_management_style`
(`server/routes/platformAdmin.ts:901`) and audit-logged, but **nothing in the
app ever reads it to change behaviour**. Whichever option is chosen, the system
behaves identically.

We are now making it work.

## What "work" means (decided)

The toggle controls **who may create and manage the logins/users at a site**:

- **Central** — only HQ may manage site users. That means `enterprise_admin`
  (head office) and `area_manager` (regional). A `site_coordinator` has **no**
  user-management power.
- **Independent** — **every** `site_coordinator` may manage the users for **their
  own site(s)**, automatically. No per-user opt-in tick is required. HQ
  (`enterprise_admin` / `area_manager`) can still manage users in both modes.

> Important: the toggle ONLY affects `site_coordinator` self-management.
> `enterprise_admin` and `area_manager` keep their existing user-management
> ability in **both** modes — do not gate them on the toggle.

## Why this is a small, low-risk change

The whole per-site user-management capability **already exists**. Every
user-management route already gates a site-coordinator caller on
`callerGrants.canManageSiteIds`:

- `POST /api/enterprise/role-grants` — `server/routes/enterpriseSites.ts:583`
  (checks `callerGrants.canManageSiteIds` at ~596, ~621)
- `DELETE /api/enterprise/role-grants/:id` — `:673` (checks at ~684, ~704)
- `POST /api/enterprise/users` — `:770` (checks at ~780, ~805)

And `canManageSiteIds` is computed in **exactly one place**:
`resolveEnterpriseGrants()` in `server/enterpriseRoles.ts` (currently derived
from the per-grant `canManageSiteUsers` flag, ~lines 140–145).

So the fix is: **make `resolveEnterpriseGrants` derive `canManageSiteIds` from
the customer's `siteManagementStyle` instead of the per-grant flag.** Because
every route and the front-end read `canManageSiteIds` through this single
resolver, they all inherit the toggle behaviour automatically. Do NOT scatter
`siteManagementStyle` checks across the route handlers — keep it in the resolver.

---

## Changes

### 1. `server/enterpriseRoles.ts` — derive `canManageSiteIds` from the toggle

In `resolveEnterpriseGrants(userId, customerId, userRole)`:

a) Fetch the customer's `siteManagementStyle` together with `isEnterprise` in a
   single lookup (the `customers` table is already imported; the field is
   `customers.siteManagementStyle`). Use a small in-memory cache keyed by
   `customerId` (mirror the existing `defaultSiteIdCache` pattern in
   `server/siteScope.ts`) holding `{ isEnterprise, siteManagementStyle }`, so we
   don't add a management-DB query on every site-scoped request. Export a
   `clearCustomerEnterpriseCache(customerId: string)` function to invalidate it.

b) The `enterprise_admin` branch (and the `userRole === 'admin'` implicit-admin
   branch) is unchanged: `allowedSiteIds: 'all'`, `canManageSiteIds: []`.

c) The `area_manager` branch is unchanged — it keeps its area-derived
   `allowedSiteIds`. (HQ role, manages in both modes.)

d) Replace the `site_coordinator` `canManageSiteIds` computation
   (currently filters on `g.canManageSiteUsers`) with toggle-driven logic:

   ```ts
   // Site-coordinator user-management power is governed by the customer's
   // site management style, NOT the legacy per-grant canManageSiteUsers flag.
   //   central     → no site-level user management (HQ only)
   //   independent → every site_coordinator manages their own site(s)
   const coordinatorSiteIds = grants
     .filter(g => g.role === 'site_coordinator' && g.siteId)
     .map(g => g.siteId!);

   const canManageSiteIds =
     siteManagementStyle === 'independent' ? coordinatorSiteIds : [];
   ```

   The per-grant `canManageSiteUsers` column is now vestigial — leave it in the
   DB (no migration) but it is no longer the source of truth. Update the doc
   comments in this file (and the `ResolvedGrants.canManageSiteIds` comment at
   ~line 44–48) to say the value is derived from the management style.

e) Keep all existing **fail-closed** behaviour: any error resolving the customer
   row → return `{ roles: [], allowedSiteIds: [], canManageSiteIds: [] }`.
   Default `siteManagementStyle` to `'central'` if missing (safest — locks site
   self-management off unless explicitly opted in).

### 2. Invalidate the cache when the toggle changes

In `server/routes/platformAdmin.ts`, the
`PATCH /platform-admin/customers/:customerId/site-management-style` handler
(`:901`) and the enterprise-flag handler (the `is_enterprise` PATCH just above
it) must call `clearCustomerEnterpriseCache(customerId)` after the DB update, so
the new style takes effect immediately rather than after a process restart.

### 3. Surface the style to the client (clear UX, no guesswork)

Add `siteManagementStyle` to the response of
`GET /api/enterprise/role-grants/my` (`server/routes/enterpriseSites.ts:526`).
The resolver already knows it; include it in the returned object.

On the **People & Access** / **Sites** area where a site-coordinator would expect
to add users (`client/src/pages/EnterpriseSites.tsx` — the add-user affordance
already keys off `myGrants.canManageSiteIds`, so it will correctly hide in
Central mode), add a short, plain-English context line so coordinators aren't
left wondering:

- Central: "User management is handled centrally by head office."
- Independent: "You can manage the users for your site(s)."

No glassmorphism (this can appear near admin/management surfaces, but keep it a
plain banner regardless).

### 4. Remove the now-pointless per-user tick

Decision: in Independent mode **every** coordinator manages their own site, so
there is no per-coordinator "can manage site users" checkbox to show. In
`client/src/pages/EnterpriseSites.tsx` the hardcoded `canManageSiteUsers: true`
on grant/user creation (lines ~576 and ~1165) becomes a harmless no-op — leave
the field being sent (so older builds don't break) but remove any UI checkbox
that exposes it to the admin, if one is rendered. Do not add a new checkbox.

---

## Tests — prove the toggle bites (required)

Extend the **real-route** test `tests/site-isolation.routes.test.ts` (the
supertest file that drives actual `/api` endpoints — NOT a helper-only test).
Add a `describe('site management style gating', …)` block:

1. **Central mode** — set the test customer's `site_management_style = 'central'`
   (and clear the enterprise cache). As a `site_coordinator` session for Site A:
   - `POST /api/enterprise/users` for Site A → **403**
   - `POST /api/enterprise/role-grants` for Site A → **403**
   - Confirm `GET /api/enterprise/role-grants/my` returns
     `canManageSiteIds: []` and `siteManagementStyle: 'central'`.
2. **Independent mode** — set `site_management_style = 'independent'` (clear
   cache). Same `site_coordinator` session for Site A:
   - `POST /api/enterprise/users` for Site A → **201 / success**
   - The same call for **Site B** (not theirs) → **403** (scope still holds).
   - `GET /api/enterprise/role-grants/my` returns Site A in `canManageSiteIds`.
3. **HQ unaffected** — an `enterprise_admin` can `POST /api/enterprise/users` in
   **both** modes.
4. **Bite check** (manual, document in the PR): temporarily force
   `canManageSiteIds` back to the old flag-based logic → the Central test must go
   **red** → restore. A green test that can't fail proves nothing.

---

## Acceptance criteria

- Flipping Central ↔ Independent in the platform-admin dialog changes site-
  coordinator user-management ability **immediately** (no restart), proven by
  the route tests above going green for the right mode and red for the wrong one.
- `enterprise_admin` and `area_manager` can manage users in **both** modes.
- Single-site / non-enterprise customers are completely unaffected
  (non-enterprise → `canManageSiteIds: []`, as today).
- No `npm run db:push` required.
- All grant/scope logic still flows through the single `resolveEnterpriseGrants`
  resolver — no `siteManagementStyle` checks added inside individual route
  handlers.

## After applying — what Andy must verify in Replit (I can't run it here)

1. `npm run test:site-isolation-routes` → all green, and confirm the bite check.
2. Log in as a **site-coordinator** for one site:
   - With the customer set to **Central**: the add-user option is hidden / a
     create-user API call returns 403, and the banner says HQ-managed.
   - Flip the customer to **Independent** in platform-admin, re-log-in (or
     refresh): the coordinator can now add a user for their own site, and
     cannot for any other site.
3. Confirm an `enterprise_admin` can still manage users in both modes.
