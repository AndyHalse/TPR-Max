# Enterprise Multi-Site — FIX 04 — Per-site user management & login (create logins where you assign them)

**Run against TEST customers only. Single-site customers must be completely unaffected. The enterprise dashboard, site list and site switcher already exist and work once logged in as an enterprise customer — this prompt fixes the user/login management so each site can have its own people without going to two different screens.**

## The gap (verified in the code, 23 June 2026)
The enterprise model is built: sites (`/enterprise/sites`), the Compliance Overview (`/enterprise`), the site switcher (in `Layout.tsx`), and role grants (`/enterprise/people`, `EnterpriseAccess.tsx`). Roles work — `enterprise_admin` (all sites), `area_manager` (a region), `site_coordinator` (one site).

**But you can only assign a role to a user that already exists.** `EnterpriseAccess.tsx` posts `{ userId, role }` to `/api/enterprise/role-grants` — it has no way to *create* a login. To add a new person you must go to the **platform-admin** "Manage Users" dialog (customer-level), create them there, then come back to People & Access and grant the site role. For an estate like Cowiesburn (120+ sites) or CPI (each site run locally), provisioning local logins this way is two screens and far too slow.

## What to build

### 1. Create-or-invite a user directly from People & Access
On the **Enterprise → People & Access** screen, add an **"Add User"** flow that, in one step:
- Creates the login for this customer (name, email, the same **6-digit email login code** mechanism the platform-admin "Manage Users" dialog already uses — reuse that exact user-creation/credential path, do not invent a new one), **and**
- Grants the chosen enterprise role + scope (enterprise_admin / area_manager + area / site_coordinator + site).
- If the email already exists for this customer, offer to grant the role to that existing user instead of creating a duplicate.

### 2. A per-site "Users at this site" view
On a site's detail (from `/enterprise/sites`), show **the people who can log in at this site** — i.e. site_coordinators granted to it, plus area_managers/enterprise_admins who cover it (clearly labelled as inherited/estate-wide). From here an admin can **add a local user for this site** (same create-or-invite flow, pre-scoped to that site) and revoke a site grant. This is the "manage each site's own logins" experience, mirroring how platform-admin manages users per customer.

### 3. Site-local users land in their own site on login
When a **site_coordinator with exactly one site** logs in, set their session `activeSiteId` to that site automatically (so they go straight into their site — no switcher step). Users with more than one site (enterprise_admin / area_manager) get the switcher as now, defaulting to a sensible site. (Hook into the existing session/`siteScope.ts` `activeSiteId` resolution.)

### 4. Respect the role matrix and keep platform-admin working
- **enterprise_admin** can add/manage users for any site. **area_manager** can add/manage **site_coordinators within their own area** only. **site_coordinator** cannot manage users.
- The platform-admin "Manage Users" dialog stays as-is (customer-level) — this adds the enterprise-side flow, it doesn't replace it.
- Audit every user create, role grant, and revoke.

## Rules
- Reuse the existing user-creation + 6-digit-code path — one identity system, no second login mechanism.
- Fail closed: a user can only be created/granted within the acting admin's own scope; never let an area_manager grant outside their area or escalate to enterprise_admin.
- Single-site (non-enterprise) customers: no change anywhere — they keep using platform-admin "Manage Users" exactly as today.
- en-GB throughout. No glassmorphism on any emergency/kiosk/muster surface.

## Acceptance criteria
- From **People & Access**, an enterprise_admin can create a brand-new login AND assign it a site/area role in one step, and the new user receives their 6-digit code.
- From a **site's page**, an admin can see who can log in at that site and add a local user scoped to it.
- A site_coordinator with one site logs in and lands directly in that site; a head-office user can switch across sites.
- An area_manager can only create/manage site_coordinators within their own area (proven by trying outside it — it's refused, server-side).
- Single-site customers are unchanged; the platform-admin Manage Users dialog still works.

## Do NOT
- Do not create a second, separate login system per site — it's one customer identity store, with site/area role grants.
- Do not let role creation escape the acting admin's scope.
- Do not touch the isolation work from FIX-01/02/03 except to rely on it.
