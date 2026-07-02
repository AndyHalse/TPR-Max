---
name: Enterprise test role elevation gotcha
description: seed.adminUserId has users.role='admin' which auto-elevates to enterprise_admin — role-gate tests must use seedRoleScopeUser
---

## Rule

Never use `seed.adminUserId` to test that a route rejects non-enterprise-admin users.

## Why

`resolveEnterpriseGrants` short-circuits on `userRole === 'admin'` and returns
`{ roles: ['enterprise_admin'], allowedSiteIds: 'all' }` for any enterprise customer.
The `seed.adminUserId` row has `users.role = 'admin'` in the DB, so it always resolves
to enterprise_admin even though its `site_user_roles` grant is `site_coordinator`.

## How to apply

Use `seedRoleScopeUser(seed, { role: 'site_coordinator', siteId: seed.siteAId })` to
get a user with `users.role = 'user'` — that user is NOT auto-elevated and will receive
a genuine 403 from `requireEnterpriseRole('enterprise_admin')`. Clean up via
`cleanupRoleScopeUser(seed, userId)` in the finally block.
