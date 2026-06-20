---
name: Platform Admin hardening patterns
description: Covers soft-delete, purge, super_admin tier, audit trail patterns established in the June 2026 hardening sprint.
---

# Platform Admin hardening

## Soft-delete pattern (customers table)
- `deleted_at TIMESTAMPTZ` + `deleted_by TEXT` columns in shared schema
- Startup migration in server/index.ts uses ADD COLUMN IF NOT EXISTS (safe to replay)
- GET /customers filters `WHERE deleted_at IS NULL` by default; `?includeDeleted=true` bypasses
- Restore: sets both to NULL; Purge: calls `databaseProvisioningService.deleteCustomerDatabase()` then removes row

**Why:** Accidental deletes of paying customers needed a recovery path; GDPR erasure still available via purge.

## super_admin tier
- `platformAdmins.role` values: `admin | super_admin | support`
- `requireSuperAdmin` middleware in `server/auth.ts` (async DB lookup)
- Startup migration promotes oldest admin to super_admin if none exists
- POST/PATCH/DELETE /admins and all customer.delete/restore/purge require super_admin

**Why:** Preventing any single rogue admin account from irreversibly deleting customers.

## writeAudit helper
- Module-level async function in platformAdmin.ts — inserts into `platformAdminAudit`
- Never throws: catches all errors and logs them so the action is never blocked
- Actions recorded: customer.soft_delete, customer.restore, customer.purge, customer.status_change, customer.update, customer.credentials_reset, customer.features_change, admin.create, admin.update, admin.delete
- GET /platform-admin/audit (requireSuperAdmin) — paginated, filterable by targetType / adminId

## DatabaseProvisioningService
- Constructor is private — always use `databaseProvisioningService` singleton (exported from databaseProvisioningService.ts)
- `deleteCustomerDatabase(customerId)` throws in dev (no real schema to drop) — purge endpoint catches and logs but continues

## VALID_ROLES
- Removed tenant_admin and tenant_staff from `VALID_ROLES` set in platformAdmin.ts
- Only `admin` and `user` are valid roles for isolated-schema users now
