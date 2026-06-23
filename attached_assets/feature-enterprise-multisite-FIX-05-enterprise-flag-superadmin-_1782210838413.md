# Enterprise Multi-Site — FIX 05 — Gate "flag as Enterprise" behind super-admin + audit (small, consistency fix)

**Small platform-admin hardening. Low risk. Run any time. Test customers only.**

## The gap (verified in the code, 23 June 2026)
The platform-admin already enforces a proper super-admin tier and an audit trail: `requireSuperAdmin` guards customer delete/restore/purge, enterprise-group creation, and platform-admin management; actions are written to `platform_admin_audit` via `writeAudit(...)`.

But one enterprise action is inconsistent: `PATCH /platform-admin/customers/:customerId/enterprise` (server/routes/platformAdmin.ts, ~line 859) — which **flags or unflags a customer as Enterprise and sets/changes their enterprise group** — is gated only by `requirePlatformAdmin`, not `requireSuperAdmin`, and does not appear to call `writeAudit`. Flagging a customer Enterprise changes their whole experience and pricing tier, and group assignment moves a customer between estates — these are high-stakes and should match the safeguards on the actions around them.

## What to fix
1. Add `requireSuperAdmin` to the `PATCH /platform-admin/customers/:customerId/enterprise` route (and any related enterprise-group *assignment* route that changes a customer's `is_enterprise` / `enterprise_group_id`), so only a super-admin can flag a customer Enterprise or move them between groups.
2. Call `writeAudit(...)` on that action — record who flagged/unflagged, the customer, and the before/after enterprise state + group — matching how the other platform-admin actions audit.
3. In the platform-admin UI, hide or disable the Enterprise toggle / group selector for non-super-admins (mirror the existing `isSuperAdmin` gating already used elsewhere on the dashboard), so the control isn't shown to admins who can't use it.

## Rules
- No behaviour change for super-admins; the only change is that regular admins can no longer flag enterprise / change groups, and the action is now audited.
- Don't touch the other already-correct super-admin routes.

## Acceptance criteria
- A non-super-admin platform admin cannot flag a customer Enterprise or change its group (refused server-side, control hidden in the UI).
- A super-admin can, and the action is recorded in `platform_admin_audit` with who/what/before-after.

## Do NOT
- Do not rebuild the super-admin system — it already exists; this only closes one route that was missed.
