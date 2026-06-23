# Enterprise Multi-Site — Prompt 17 — Per-site login identity + management-style preset + dual user management

**Builds on the existing enterprise multi-site engine. This does NOT create a second architecture — it's all the same one-database, site-scoped, role-based system. It adds: (1) logging in by site name, (2) a per-customer management-style preset, (3) both head-office and site-level user management, and (4) a kiosk-vs-login UX fix. Test customers only; single-site customers unaffected.**

## Context
The enterprise model already supports both patterns at once: a **Site Coordinator** logs in and is auto-scoped to their site (a standalone-feeling, isolated site with the full normal app), while an **Enterprise Admin** sees all sites + the six enterprise modules. Today, though, everyone logs in with the **parent company name** (e.g. "CPI Books") + username; there's no way to log in with a **site** name, and a customer can't be preset to "central" vs "independent sites". Creating a site only surfaces a **kiosk URL** (`/kiosk?site=…`, the physical sign-in terminal), which is being mistaken for the staff login.

## What to build

### 1. Per-site login identity — log in with EITHER the parent name OR the site name
- Add a **site login name** to each site (a `login_slug` / display name on the `sites` table; default it to the site name, e.g. "CPI Books Suffolk"; unique within the customer, and globally unique enough to resolve at login — namespace if needed).
- Update the 3-field login (`AuthService.authenticateUser(companyName, username, password)` in `server/auth.ts`) so the **Company Name** field resolves in this order:
  1. If it matches a **customer** company name → today's behaviour (role decides scope).
  2. Else if it matches a **site login name** → resolve that site's parent customer, authenticate the user against that customer, and **only allow the login if that user is permitted on that site** (Enterprise Admin / Area Manager covering it, or a Site Coordinator granted to it). On success, set `session.activeSiteId` to that site so they land straight in it.
- So a CPI Books Suffolk local user can type "CPI Books Suffolk" and land in Suffolk; head office can still type "CPI Books" and use the estate dashboard. Fail closed: a site login must never let a user into a site they aren't granted.

### 2. Management-style preset (platform-admin, per customer) — RECOMMENDED, defaults only
- Add a per-customer setting `siteManagementStyle`: `central` | `independent` (default `central`). Set it on the platform-admin customer screen, super-admin gated + audited (like the other enterprise actions).
- It only changes **defaults**, not the architecture:
  - **central** (Cowiesburn): creating a site does NOT auto-create a local login; users default to enterprise/area roles managed by head office.
  - **independent** (CPI): creating a site **auto-creates a site-admin local login** for it (with the site-name login identity from #1) and enables that site to self-manage its users (#3). Head office still has full visibility + override.
- Changing the preset later must be safe and non-destructive (it only affects new defaults; existing sites/users unchanged).

### 3. Dual user management — head office AND site (with head-office override)
- **Head office** (Enterprise Admin) manages every site's users centrally from **People & Access** (already built in FIX-04) — keep this.
- **Site-level**: introduce a **Site Admin** capability (e.g. a Site Coordinator with a `canManageSiteUsers` grant, or a new `site_admin` role) who can add/remove/reset **their own site's** users only — scoped, fail-closed, audited. Surface this on the site's page.
- **Head-office override**: Enterprise Admin can always view, edit, or remove any site user regardless of who created them.
- Reuse the existing 6-digit-code login provisioning (do not invent a second login system).

### 4. Kiosk-vs-login UX fix (the confusion)
- On the **Sites** page and the add-site confirmation, clearly separate the two links:
  - **"Sign-in terminal (kiosk) link"** — for the tablet at the door; label it as such.
  - **"Staff login"** — explain staff log in at the normal login page using the site login name (#1), and offer a copyable per-site login hint/link.
- The kiosk "Welcome to …" screen's exit should make clear it returns to the kiosk start, not the admin app (it's a public terminal).

## Rules
- One engine only — sites stay rows in the one customer database, site-scoped via `siteScope.ts`. No second architecture, no per-site database.
- Fail closed everywhere: a site login or a site admin can only ever reach their own site.
- Single-site (non-enterprise) customers: zero change — login by company name exactly as today.
- en-GB; audit site-login-name changes, preset changes, and all site-user management.

## Acceptance criteria
- A local user can log in with the **site name** ("CPI Books Suffolk") and lands in that site with the full normal app, isolated to it; the same user cannot reach another site.
- Head office can still log in with the **parent name** and use the estate dashboard across all sites.
- Setting a customer to **independent** auto-provisions a site-admin login on new sites; **central** does not. Switching the preset is non-destructive.
- A Site Admin can manage only their own site's users; an Enterprise Admin can manage/override all.
- The Sites page clearly distinguishes the kiosk terminal link from staff login.
- Non-enterprise customers are completely unaffected.

## Do NOT
- Do not create a separate enterprise login page, a login tick-box, or a per-site database.
- Do not let a site login or site admin escape their site scope.
- Do not break login-by-company-name for existing customers.
