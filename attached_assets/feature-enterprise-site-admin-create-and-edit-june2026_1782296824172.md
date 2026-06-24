# Feature: Local site admin on Add New Site (create + edit / reset / replace / deactivate)

**Module:** Enterprise → Sites
**Files:** `client/src/pages/EnterpriseSites.tsx`, `server/routes/enterpriseSites.ts`
**db:push needed?** No new tables or columns — uses existing `users` and `siteUserRoles` tables.

---

## Background — what already exists (do NOT rebuild)

- **Add New Site** dialog (`SiteFormDialog`, around `EnterpriseSites.tsx:847`) only captures site fields: name, reference, status, address, postcode, region, area. It POSTs to `/api/enterprise/sites`.
- **`POST /api/enterprise/users`** (`enterpriseSites.ts:815`) **already accepts** `username, password, email, firstName, lastName, role, areaId, siteId` and creates the user + a `siteUserRoles` grant in one call. It is the right endpoint to reuse for creating a site admin.
- The old "independent management style" auto-provision block inside `POST /api/enterprise/sites` (`enterpriseSites.ts:228`) generates a throwaway `site-admin-{ref}` user with a random password and **no name/email**.
- There is currently **no** endpoint to edit a user's details, reset a password, or deactivate a user.

## What Andy decided

1. **Password:** the enterprise admin **sets the password manually** (no email invite, no auto-generate). Min 8 characters. Show a note telling them to share it securely and that the admin should change it on first login.
2. **Required at creation:** a local admin **must** be set up when creating a new site. The Create Site button stays disabled until the admin fields are valid.
3. **Edit / change must cover all four:** edit name/email/username, reset password, replace with a different person, and deactivate/remove the admin.

---

## Part 1 — Add New Site: capture the local admin (frontend + wiring)

In `SiteFormDialog`, **only when creating** (`!isEdit`), add a "Site Administrator" section below the site fields with:

- **First Name** and **Last Name** (side by side)
- **Username** — helper text: "Letters, numbers, underscores, and hyphens only. Min 3 characters." Validate `^[A-Za-z0-9_-]{3,}$`.
- **Email**
- **Password** — min 8 chars, with the "share securely / change on first login" note.

Match the styling of the existing `AddSiteUserDialog` (`EnterpriseSites.tsx:236`) — same Input/Label components, same layout grid.

**Create flow (sequential, site first):**
1. POST `/api/enterprise/sites` as today → get back the new `site.id`.
2. Then POST `/api/enterprise/users` with `{ username, password, email, firstName, lastName, role: 'site_coordinator', siteId: <new site id> }`.
3. On success, toast: "Site created and {firstName} {lastName} set up as site administrator."

**Required-admin rule:** `Create Site` disabled until site name AND all admin fields are valid (first name, last name, username ≥3 valid chars, email, password ≥8). Keep `Save Changes` (edit mode) unaffected — the admin section is create-only.

**Username conflict:** if the user POST returns 409, the site already exists. Do **not** orphan it — surface "Site created, but that username is already taken. Open the site and add the administrator." and refresh the list. (Cleaner than a rollback; flag this trade-off to Andy.)

**Backend grant flag:** in `POST /api/enterprise/users` the grant is currently created **without** `canManageSiteUsers` (`enterpriseSites.ts:902`). A site admin should be able to manage their own site's users, matching the old auto-provision path which set `canManageSiteUsers: true`. Add an optional `canManageSiteUsers` boolean to the request body (validated), and when the dialog creates a site admin send `canManageSiteUsers: true`.

**Retire the silent auto-provision:** the `siteManagementStyle === 'independent'` auto-provision block (`enterpriseSites.ts:220-262`) now conflicts with an explicit admin. Since the admin is created in a separate call straight after, remove (or gate off) that auto-provision so a site never ends up with both a real admin and a `site-admin-{ref}` ghost. Confirm with Andy before deleting; safest is to skip auto-provision whenever the client immediately creates an admin.

---

## Part 2 — Edit / change an existing site admin

In the site drill-down `SiteUsersDialog` (`EnterpriseSites.tsx:429`), each listed `site_coordinator` for the site gets an actions menu with:

- **Edit details** — first name, last name, email, username.
- **Reset password** — set a new password (min 8), shown once / copyable.
- **Replace** — open the existing add-admin form for a new person, then deactivate + remove the previous admin's grant for this site.
- **Deactivate / remove** — confirm dialog; removes their site grant and (if this was their only grant) sets `isActive = false`.

### New backend endpoints (all `requireEnterpriseRole('enterprise_admin')`, all scoped to `req.customerId`)

1. **`PATCH /api/enterprise/users/:id`** — update `firstName`, `lastName`, `email`, `username`. Validate username regex + uniqueness (return 409 on clash). Never let it touch users outside the caller's customer DB.
2. **`PATCH /api/enterprise/users/:id/password`** — body `{ password }`, min 8, bcrypt-hash and store. Log the reset (who reset whom) via the existing `logger.info` pattern.
3. **`PATCH /api/enterprise/users/:id/deactivate`** (or reuse a single PATCH) — set `isActive = false`.

**Replace** is composed client-side: create the new admin (Part 1 user POST), delete the old admin's grant (`DELETE /api/enterprise/role-grants/:id`, already exists), then deactivate the old user.

---

## Standing rules for this module (apply throughout)

- **Tenant + scope isolation:** every new route resolves the customer DB via `req.customerId` and never trusts an id from the body. Edit/reset/deactivate must 404 if the target user isn't in the caller's customer DB. (This is the recurring enterprise bug class — inconsistent scope resolution at call sites.)
- **Roles:** site-admin create/edit/reset/replace/deactivate are `enterprise_admin` only on the server, regardless of what the UI shows.
- **Passwords:** always bcrypt (`bcrypt.hash(pw, 10)`), never logged or returned in any GET.
- **Audit:** keep the existing `logger.info('[enterprise/users] ...')` style line on every create/edit/reset/deactivate, naming caller and target.
- **UK English** in all labels and toasts.
- **Route-level isolation test:** add cases to the enterprise isolation test (`site-isolation-test-script.ts`) proving the new PATCH routes reject a user id from another customer.

## Acceptance checklist

- [ ] Can't create a site without a valid admin (button stays disabled).
- [ ] New site → admin appears in the site's user list as site coordinator with user-management power.
- [ ] No `site-admin-{ref}` ghost account is created alongside the real admin.
- [ ] Edit details, reset password, replace, and deactivate all work from the site drill-down.
- [ ] Every new route rejects a user id belonging to another customer (403/404).
- [ ] Username conflicts return a clear message, not a 500.
