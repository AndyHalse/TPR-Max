# PRIORITY 02 🟠 — Make the Central / Independent toggle actually work

**Module:** Enterprise multi-site — site management style
**Type:** Behaviour wiring (toggle currently stores a value but does nothing)
**Needs `npm run db:push`?** **NO** — `customers.site_management_style` and
`site_user_roles.can_manage_site_users` already exist.

---

## What’s wrong today
The platform-admin “Enterprise Settings” dialog has a **Site management style**
toggle — **Central** (“HQ manages all sites and users”) vs **Independent** (“Each
site manages its own users”). It is currently a **no-op**: the value is saved to
`customers.site_management_style` (`server/routes/platformAdmin.ts`) and
audit-logged, but **nothing reads it to change behaviour**. Both settings run
identically. We are wiring it up.

## What it must do (decided)
The toggle controls **who may create/manage the logins/users at a site**:
- **Central** — only HQ may: `enterprise_admin` (head office) + `area_manager`
  (regional). A `site_coordinator` has **no** user-management power.
- **Independent** — **every** `site_coordinator` may manage the users for **their
  own site(s)**, automatically (no per-user tick). HQ can still manage users too.

The toggle ONLY affects `site_coordinator` self-management. `enterprise_admin`
and `area_manager` keep their user-management ability in **both** modes — do not
gate them on the toggle.

## Why this is low-risk
The per-site user-management capability already exists. Every user-management
route already gates a site-coordinator caller on `callerGrants.canManageSiteIds`
(see `POST /api/enterprise/role-grants`, `DELETE /api/enterprise/role-grants/:id`,
`POST /api/enterprise/users` in `server/routes/enterpriseSites.ts`). And
`canManageSiteIds` is computed in exactly one place: `resolveEnterpriseGrants()`
in `server/enterpriseRoles.ts`. So change that one function and every route plus
the front-end inherit the behaviour. **Do not scatter `siteManagementStyle`
checks across route handlers.**

---

## Changes

### 1. `server/enterpriseRoles.ts` — derive `canManageSiteIds` from the toggle
In `resolveEnterpriseGrants(userId, customerId, userRole)`:
- Fetch the customer’s `siteManagementStyle` together with `isEnterprise` in one
  lookup (the `customers` table is already imported). Cache it per `customerId`
  in memory (mirror the `defaultSiteIdCache` pattern in `server/siteScope.ts`),
  and export `clearCustomerEnterpriseCache(customerId)` to invalidate it.
- `enterprise_admin` / implicit-admin branch: unchanged (`allowedSiteIds:'all'`,
  `canManageSiteIds: []`).
- `area_manager` branch: unchanged (HQ role — manages in both modes).
- `site_coordinator`: replace the current `canManageSiteUsers`-flag logic with:
  ```ts
  const coordinatorSiteIds = grants
    .filter(g => g.role === 'site_coordinator' && g.siteId)
    .map(g => g.siteId!);
  const canManageSiteIds =
    siteManagementStyle === 'independent' ? coordinatorSiteIds : [];
  ```
- The per-grant `can_manage_site_users` column is now vestigial (leave it in the
  DB; it is no longer the source of truth). Update the doc comments accordingly.
- Keep fail-closed on any error; default `siteManagementStyle` to `'central'` if
  missing (safest — locks site self-management off unless explicitly opted in).

### 2. Invalidate the cache when the toggle changes
In `server/routes/platformAdmin.ts`, the
`PATCH /platform-admin/customers/:customerId/site-management-style` handler **and**
the `is_enterprise` PATCH must call `clearCustomerEnterpriseCache(customerId)`
after the DB update, so the new style takes effect immediately (no restart).

### 3. Surface the style to the client (no guesswork for users)
Add `siteManagementStyle` to the response of `GET /api/enterprise/role-grants/my`
(`server/routes/enterpriseSites.ts`). On the Sites / People & Access area where a
site-coordinator would add users (`client/src/pages/EnterpriseSites.tsx` — the
add-user affordance already keys off `myGrants.canManageSiteIds`, so it will
correctly hide in Central mode), add a short plain-English line:
- Central: “User management is handled centrally by head office.”
- Independent: “You can manage the users for your site(s).”

### 4. Remove the now-pointless per-user tick
In `client/src/pages/EnterpriseSites.tsx` the hardcoded `canManageSiteUsers: true`
on grant/user creation becomes a harmless no-op — leave the field being sent (so
older builds don’t break) but remove any UI checkbox exposing it. Do not add a
new checkbox.

---

## Tests — prove the toggle bites
Extend the real-route test `tests/site-isolation.routes.test.ts` with a
`describe('site management style gating', …)`:
1. **Central**: set customer `site_management_style='central'` (clear cache). As a
   `site_coordinator` for Site A: `POST /api/enterprise/users` (Site A) → **403**;
   `POST /api/enterprise/role-grants` (Site A) → **403**;
   `GET /api/enterprise/role-grants/my` → `canManageSiteIds: []`,
   `siteManagementStyle: 'central'`.
2. **Independent**: set `'independent'` (clear cache). Same session:
   `POST /api/enterprise/users` (Site A) → **201**; same for **Site B** → **403**
   (scope still holds); `role-grants/my` lists Site A in `canManageSiteIds`.
3. **HQ unaffected**: an `enterprise_admin` can `POST /api/enterprise/users` in
   both modes.
4. **Bite check** (document in PR): force `canManageSiteIds` back to old flag
   logic → the Central test goes **red** → restore.

## Acceptance criteria
- Flipping Central ↔ Independent changes site-coordinator user-management
  ability **immediately**, proven by the tests above.
- `enterprise_admin` / `area_manager` manage users in both modes.
- Non-enterprise customers unaffected.
- No `db:push`. All grant logic still flows through `resolveEnterpriseGrants`.

## What Andy verifies in Replit
Log in as a site-coordinator: in **Central** the add-user option is hidden / the
API returns 403 and the banner says HQ-managed; flip the customer to
**Independent** in platform-admin, re-login, and the coordinator can now add a
user for their own site only. Confirm an enterprise_admin can manage users in
both modes.
