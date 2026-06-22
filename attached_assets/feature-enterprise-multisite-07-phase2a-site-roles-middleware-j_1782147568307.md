# Enterprise Multi-Site — Prompt 07 — Phase 2a: Site roles + access middleware

**Phase 2 of the Enterprise Multi-Site build. ⛔ Only start after the prompt 04 isolation tests pass. This decides who can see and do what, where.**

## Context
Prompt 03 gave every enterprise user access to all of their customer’s sites. Now we restrict access per user with three enterprise roles, granted per site or per area. Existing roles (`admin` / `user` / `tenant_admin` / `tenant_staff`) are unchanged for non-enterprise customers.

## What to build

### 1. New table `site_user_roles` (isolated schema + migration, same raw-SQL pattern)
- `id` varchar PK gen_random_uuid()
- `user_id` varchar NOT NULL → users.id
- `role` text NOT NULL — `enterprise_admin` | `area_manager` | `site_coordinator`
- `area_id` varchar NULL → areas.id (for area_manager)
- `site_id` varchar NULL → sites.id (for site_coordinator)
- `created_at` timestamp default now()
- UNIQUE(user_id, role, area_id, site_id)

Grants are **additive** — a user may be area_manager for two areas and site_coordinator elsewhere. Effective scope = the union.

### 2. Grant-resolution middleware
`requireEnterpriseRole(...allowedRoles)` that:
- Resolves the user’s grants into a concrete **site-id allowlist** and attaches it to the request (this populates `allowedSiteIds` used by the prompt 03 scope helper — replace the “all sites” placeholder from prompt 03 with the real resolved set).
  - `enterprise_admin` → all sites.
  - `area_manager` → all sites whose `area_id` is in their granted areas.
  - `site_coordinator` → their granted site(s) only.
- Rejects the request if the user lacks any allowed role.
- The scope helper then validates **every** query against this allowlist — an Area Manager calling an estate endpoint gets only their area, never the whole estate.

### 3. Capability matrix (enforce server-side)
| Capability | Enterprise Admin | Area Manager | Site Coordinator |
|---|---|---|---|
| Create / archive sites | ✓ | — | — |
| Assign users & roles | ✓ all | Site Coordinators in own area | — |
| Dashboard scope | all sites | own area | own site |
| Generate reports | all | own area | own site |
| Manage scheduled reports | ✓ | own area | — |
| Site operations | ✓ | own area | own site |
| Push central config | ✓ | — | — |
| Billing / account settings | ✓ | — | — |

### 4. Wire it in
- Put `requireEnterpriseRole(...)` on the enterprise routes (sites/areas/role-grants/compliance/reports) and on site operations where the matrix restricts them.
- `GET/POST/DELETE /api/enterprise/role-grants` to manage grants (enterprise_admin, plus area_manager limited to their area).

## Rules
- **Fail closed.** No grant = no access. The allowlist is resolved server-side; never trust a site id from the client beyond validating it against the allowlist.
- Non-enterprise customers: this middleware is not applied; their existing roles are untouched.
- Audit every role grant/revoke.

## Acceptance criteria
- The capability matrix is enforced end-to-end.
- An Area Manager API call (list, dashboard, report, any site-scoped read) can **never** return data outside their area — prove it with a test that tries directly via the API, not just the UI.
- A Site Coordinator is confined to their site.
- The prompt 04 isolation tests still pass, now with role-limited allowlists.

## Do NOT
- Do not enforce roles only in the UI — the server is the boundary.
- Do not let a user widen their own scope via a request parameter.
