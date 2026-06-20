# BUGFIX — Platform Admin: audit trail, safe customer delete, role tiers, + tidy vestigial roles

Hardening of the cross-tenant Platform Admin surface (`server/routes/platformAdmin.ts`, `client/src/pages/PlatformAdminDashboard.tsx`, `requirePlatformAdmin` in `server/auth.ts`). The login/2FA is already well-built — do NOT change it. This adds accountability and safe deletion.

> ⚠️ **Requires `npm run db:push`** — new audit table + new `customers` columns (`deleted_at`, `deleted_by`).
> ⚠️ **DO NOT touch the multi-tenant customer isolation** (`customerDbService.getCustomerDatabase`, per-customer schemas). "Multi-tenant" here means per-customer data separation — it is the SaaS foundation and must remain fully intact. This ticket only removes two *unused role options* (see §5), nothing else "tenant".

---

## 1. Customer delete → soft-delete + separate permanent purge (fix data orphaning)
**Problem:** `DELETE /platform-admin/customers/:customerId` (~line 572) runs `db.delete(customers)` only. It never calls `deleteCustomerDatabase` (`server/databaseProvisioningService.ts:529`, which does `DROP SCHEMA … CASCADE` but is currently dead code). Result: the tenant's entire isolated schema — all personal data — is orphaned in the database forever (GDPR erasure failure) and the customer can't be cleanly restored.

**Fix — two distinct actions:**
1. **Soft-delete (the normal "Delete" button):**
   - Add `deletedAt timestamp` and `deletedBy varchar` columns to the `customers` table (`shared/schema.ts`).
   - The existing `DELETE /platform-admin/customers/:customerId` should now SET `deletedAt = now()`, `deletedBy = <admin id>`, instead of removing the row. The customer becomes hidden and recoverable.
   - Exclude soft-deleted customers from the default customer list (`GET /platform-admin/customers`, ~line 450) unless an explicit `?includeDeleted=true` is passed.
   - Add a "Restore" action (clears `deletedAt`/`deletedBy`).
2. **Permanent purge (a separate, clearly-marked "Permanently erase" action):**
   - New endpoint e.g. `DELETE /platform-admin/customers/:customerId/purge` that:
     - calls `deleteCustomerDatabase(customerId)` to `DROP SCHEMA … CASCADE` (true erasure of the tenant's data), THEN removes the `customers` row,
     - is wrapped so a failure to drop the schema does NOT leave a half-deleted state (log + report honestly if it fails),
     - is **super_admin only** (see §3) and requires the existing client "type DELETE to confirm" gate plus a second explicit "I understand this is irreversible" confirmation.
   - Client: keep the typed-confirm dialog; make the purge path visually distinct (red, "permanently erase all data — cannot be undone").

Both delete and purge MUST write an audit entry (see §2).

## 2. Audit trail for every sensitive Platform Admin action
**Problem:** no sensitive action is recorded anywhere except Winston `logger.info` (rotates, not queryable, not tamper-evident). For the highest-privilege surface this is a governance gap (enterprise due-diligence — e.g. Cowiesburn — will ask).

**Fix:**
- Add a `platform_admin_audit` table (`shared/schema.ts`) with: `id`, `adminId`, `adminUsername`, `action` (e.g. `customer.soft_delete`, `customer.purge`, `customer.restore`, `customer.create`, `customer.update`, `customer.status_change`, `customer.credentials_reset`, `customer.features_change`, `admin.create`, `admin.update`, `admin.delete`, `branding.update`), `targetType` (customer/admin), `targetId`, `targetLabel` (e.g. company name), `details jsonb` (before/after where sensible — NEVER store passwords or secrets), `ipAddress`, `createdAt` (default now()).
- Write an entry from EVERY sensitive endpoint: create/update/soft-delete/restore/purge customer, status change, credentials reset, feature toggle, create/update/delete platform admin, branding update. Wrap each audit write in try/catch + `logger` so an audit failure never blocks the action, but DO log loudly if it fails.
- Add a read endpoint `GET /platform-admin/audit` (super_admin only, paginated, newest first) and a simple read-only audit view in `PlatformAdminDashboard.tsx`.

## 3. Enforce platform-admin role tiers (super_admin vs admin/support)
**Problem:** `requirePlatformAdmin` (`server/auth.ts`) only checks a session exists — the `platformAdmins.role` column (values `admin | super_admin | support`, default `admin`) is never enforced. So ANY platform admin can delete/purge customers, reset any tenant's credentials, and create/delete other platform admins (privilege escalation + lockout).

**Fix:**
- Add a `requireSuperAdmin` middleware (extends `requirePlatformAdmin`: also loads the admin and checks `role === 'super_admin'`, else 403).
- Gate these **dangerous** endpoints with `requireSuperAdmin`: customer **purge**, customer **soft-delete** (optional — your call, but recommended), credential reset (`/customers/:id/credentials`), and all platform-admin management (`POST/PATCH/DELETE /platform-admin/admins/*`). Leave routine read/edit (view customers, edit details, toggle features, branding, blog, traffic) at `requirePlatformAdmin`.
- **CRITICAL — do not lock the owner out:** existing admins default to `role = 'admin'`. As part of the migration, set the existing primary/seed admin account(s) (at minimum Andy's) to `role = 'super_admin'`, otherwise no one will be able to perform the gated actions. New admins default to `admin` (or `support`). Make this migration explicit and safe.
- Surface the admin's role in the UI and only show the dangerous buttons to super_admins.

## 4. (Excluded) Credential-reset standalone gate
Andy excluded the standalone credential-reset hardening — it is adequately covered by §2 (it will now be audited) and §3 (it becomes super_admin-only). No separate work needed.

## 5. Remove the vestigial `tenant_admin` / `tenant_staff` role options
**Context:** these are leftover *customer-user* role options that imply a sub-organisation model TPR does NOT offer. They are NOT related to the multi-tenant customer isolation (which stays). They appear as dropdown options and in validation, and are only loosely wired in one place.

**Fix (carefully, in this order):**
1. **Migrate existing data first:** in every customer's isolated `users` table, update any existing rows with `role = 'tenant_admin'` → `'admin'` and `role = 'tenant_staff'` → `'user'`. (Write a small migration that iterates customer schemas via the existing customer-DB service.) This ensures no user loses access when the roles are retired.
2. Remove `tenant_admin`/`tenant_staff` from `VALID_ROLES` (`platformAdmin.ts:981`) so they can't be set going forward (leave only `admin`, `user`).
3. Rewire the one functional reference: `contractors.ts:5075` `['admin', 'tenant_admin'].includes(...)` → `['admin'].includes(...)` (safe because step 1 migrated those users to `admin`).
4. Remove the `<option value="tenant_admin">` / `tenant_staff` entries from the dropdowns in `PlatformAdminDashboard.tsx` (~lines 1871, 1872, 1915, 1916).
5. Update the schema comments (`shared/schema.ts:996`, `isolatedSchema.ts:302`) to list only `admin, user`.
6. **Leave ALL multi-tenant customer-isolation code untouched.** Do not change `customerDbService`, `getCustomerDatabase`, `tenantId`, per-customer schema provisioning, or any data-isolation logic.

## 6. Minor: pagination + OTP store
- **Pagination:** `GET /platform-admin/customers` (~line 450) and `GET /platform-admin/admins` (~line 1196) load whole tables — add `limit`/`offset` (or cursor) pagination, default e.g. 50, with the client requesting pages. Low urgency but include it.
- **OTP store:** `pendingOtps` is an in-memory `Map` (`platformAdmin.ts:76`). Fine for a single instance; only weakens across multiple instances. Add a `// TODO: move to shared store (Redis/DB) if running multiple instances` comment. No functional change unless TPR is multi-instance — confirm deployment topology before doing more.

---

## Acceptance test
- **Delete:** clicking Delete on a customer marks it `deleted_at` (hidden, recoverable); the customer's data/schema still exists; an audit row is written; a non-super_admin is blocked if soft-delete is gated.
- **Purge:** "Permanently erase" (super_admin only, double-confirmed) drops the tenant schema AND removes the record; no orphaned schema remains; audit row written.
- **Restore:** a soft-deleted customer can be restored and reappears.
- **Audit:** every sensitive action (create/update/delete/purge/restore customer, status, credentials reset, feature toggle, admin create/update/delete, branding) produces a `platform_admin_audit` row with who/what/when; the audit view lists them newest-first, paginated.
- **Roles:** a `super_admin` can purge customers and manage admins; an `admin`/`support` gets 403 on those; Andy's account is super_admin (not locked out).
- **Tenant roles:** the create/edit-user dropdowns no longer show tenant_admin/tenant_staff; any pre-existing tenant_admin/tenant_staff users now show as admin/user and retain the access they had; contractor-portal admin access still works for migrated admins.
- **Isolation untouched:** every customer still only sees their own data; nothing in the per-customer database routing changed.
- Customer/admin lists paginate; nothing loads the whole table at once.
