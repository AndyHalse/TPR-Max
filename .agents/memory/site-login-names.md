---
name: Site login names pattern
description: Per-site login identity — how site_login_names table works and how autoActiveSiteId flows through the auth pipeline.
---

## Rule
The `site_login_names` table in the management DB (shared/schema.ts) provides a global lookup: when a user types a site name instead of a company name, authenticateUser resolves it to the parent customer + siteId, then verifies the user has a grant for that site before allowing login.

## Key design choices

**Management DB lookup table:** `site_login_names { id, customer_id, site_id (text, not FK), login_name (UNIQUE), created_at }`
- `site_id` is opaque text — it lives in the isolated customer DB
- `login_name` global uniqueness is enforced by a UNIQUE constraint + code-level fallback namespacing

**Namespacing on collision:** `registerSiteLoginName()` in enterpriseSites.ts tries candidates in order:
1. Site name (e.g. "Suffolk")
2. "CompanyName: SiteName"
3. "CompanyName — SiteName"
First candidate that doesn't conflict (23505) wins. The resolved name is stored back to `sites.loginSlug`.

**Auth flow:** `authenticateUser` in server/auth.ts — if company name lookup returns nothing, falls back to site_login_names lookup. After user authenticates, resolveEnterpriseGrants is called to verify the user actually has access to the resolved site. Fail-closed: any error in grants resolution denies login.

**autoActiveSiteId threading:** `authenticateUser` returns `{ user, customer, autoActiveSiteId? }`. The login handler stores it in `PendingCustomerOtp.autoActiveSiteId`. The 2FA verify handler passes it to `createCustomerSession`. Inside `createCustomerSession`, autoActiveSiteId fast-paths the session.activeSiteId assignment, skipping the single-site auto-assignment check.

**Isolated schema columns** added via per-customer startup migration in customerDatabase.ts:
- `sites.login_slug TEXT` — mirrors the management DB login_name for this site
- `site_user_roles.can_manage_site_users BOOLEAN DEFAULT FALSE` — site-admin capability flag

**siteManagementStyle** column on customers (`central` | `independent`, default `central`). Set via `PATCH /platform-admin/customers/:id/site-management-style` (super_admin + audit). Front-end toggle in EnterpriseDialog in PlatformAdminDashboard.tsx.

**Why:**
Logging in via site name rather than company name lets site-scoped staff have a simpler login experience without knowing the parent company name. The management DB lookup is necessary because each customer's users are in an isolated DB — only the management DB has cross-customer visibility.
