# Enterprise Multi-Site — Prompt 08 — Phase 2b: Role management UI

**Phase 2 of the Enterprise Multi-Site build. The screen for granting site/area roles. Run after prompt 07.**

## Context
`site_user_roles` and the `requireEnterpriseRole` middleware exist (prompt 07). This adds the admin UI to grant and revoke them. React + Radix/Tailwind, matching the app.

## What to build
- **People & Access screen** under `/enterprise` (enterprise_admin sees all; area_manager sees only their area’s coordinators).
- List users with their current grants (role + scope, e.g. “Area Manager — North”, “Site Coordinator — Edinburgh HQ”).
- **Add grant:** pick user → role → scope (area for area_manager, site for site_coordinator; none for enterprise_admin). Prevent invalid combinations.
- **Revoke grant** with confirmation; write an audit entry on grant and revoke.
- Show a clear, read-only summary of each user’s **effective site access** (the resolved allowlist) so an admin can see exactly what someone can reach.
- Surface a warning if granting a change would lock the last enterprise_admin out (don’t allow removing the final admin).

## Rules
- Server-side enforcement already exists — the UI must reflect, not replace it. Hide controls the current user isn’t allowed to use.
- en-GB throughout. Non-enterprise customers never see this screen.

## Acceptance criteria
- An enterprise_admin can grant and revoke roles and immediately see effective access change.
- An area_manager can only manage site_coordinators within their own area.
- Granting/revoking is audited.
- **Verification (matrix gate):** create an Area Manager for “North”, log in as them, and confirm — in the UI and by direct API call — they cannot see or act on a site outside North.

## Do NOT
- Do not allow removal of the last enterprise_admin.
- Do not let the UI offer scopes the signed-in user can’t grant.
