# Enterprise Multi-Site — Prompt 16 — Platform-admin enterprise management + safeguards

**Can be run any time AFTER prompt 01 (Phase 0). Best run right after Phase 0 so you can flag a customer as enterprise from the UI rather than by hand. Touches the super-admin “Customer Accounts” screen.**

## Context
Phase 0 (prompt 01) added `is_enterprise`, `enterprise_group_id` and the `enterprise_groups` table to the management DB. The platform-admin screen (`server/routes/platformAdmin.ts`, `client/src/pages/PlatformAdminDashboard.tsx`) is the 20-customer “Customer Accounts” list. This prompt makes it enterprise-aware and, because a 120-site account is the worst place to discover an unrecoverable admin action, adds the audit-trail and safeguard fixes the spec recommends.

## What to build

### 1. Enterprise awareness
- On a customer row, allow flagging the customer as **Enterprise** (`is_enterprise`) and assigning it to an **Enterprise Group** (create/select an `enterprise_groups` record).
- For an enterprise customer, show site count and (once Phase 3 exists) estate compliance score on the row.
- The “Add Customer” flow gains an enterprise option that sets the flag and group at creation.
- Non-enterprise customers render exactly as now.

### 2. Platform-admin safeguards (recommended in the spec — high value at enterprise scale)
- **Audit trail:** log every platform-admin action (create/edit/deactivate/flag customer, reset credentials, group changes) with who/when/what-changed. Add a simple audit log view.
- **Customer delete/deactivate safety:** ensure deactivating or deleting a customer is recoverable (soft-delete already exists via `deleted_at`/`deleted_by` on `customers` — make the UI use it and confirm destructive actions; never orphan tenant data silently).
- **Privilege check:** confirm only an appropriately privileged platform admin can flag enterprise / manage groups / delete customers (enforce server-side, not just hide buttons).

## Rules
- Additive and safe; existing single customers unaffected.
- Destructive actions require confirmation and are reversible/audited.
- en-GB throughout.

## Acceptance criteria
- A platform admin can flag Cowiesburn as Enterprise and assign it to a group from the UI; the customer then gets the enterprise behaviour built in the other prompts.
- Every platform-admin action is recorded in an audit log that can be viewed.
- Deactivating a customer is recoverable; no action silently orphans data.
- Non-enterprise customers look and behave exactly as before.

## Do NOT
- Do not allow an unprivileged admin to flag enterprise or delete customers.
- Do not hard-delete customer data without a recoverable path and confirmation.
