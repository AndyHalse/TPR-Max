# Enterprise Multi-Site — Prompt 01 — Phase 0: Group Foundation (management DB)

**Phase 0 of the Enterprise Multi-Site build. Run prompt 00 (master order) context first. This is small and safe — it reserves the “enterprise group” idea so existing customers can be grouped later with no risky migration.**

## Context
TPR Max is database-per-customer. The management database (`shared/schema.ts`) holds one row per customer in the `customers` table. Today there is no concept of grouping customers, or of marking a customer as an enterprise account. This prompt adds that, and changes nothing else. **No existing customer is affected.**

## What to build

1. **New table `enterprise_groups`** in `shared/schema.ts` (management DB), with a Drizzle definition and a matching migration. Columns:
   - `id` varchar PK default `gen_random_uuid()`
   - `name` text NOT NULL
   - `slug` text NOT NULL UNIQUE
   - `contact_email` text
   - `is_active` boolean NOT NULL default true
   - `created_at`, `updated_at` timestamps default now()

2. **Add columns to the existing `customers` table** (all nullable / safe defaults — must not affect existing rows):
   - `is_enterprise` boolean NOT NULL default `false`
   - `enterprise_group_id` varchar NULL, FK → `enterprise_groups.id`
   - `enterprise_role` text NULL — reserved; the customer’s relationship to the group (e.g. `'hq'`). Leave NULL for now.

3. **Migration:** add these via the management-DB migration mechanism used for `shared/schema.ts` (Drizzle `db:push` / the existing management migration path — match how `customers` columns were last added, e.g. `platformDisabledFeatures`). Use `ADD COLUMN IF NOT EXISTS` semantics so it is safe to re-run.

4. **No UI yet.** Do not change the platform-admin screen in this prompt (that comes later). Just the schema + types + migration.

## Rules
- Every change is additive and backwards-compatible. `is_enterprise` defaults to false, so every current customer is a normal single-site customer with identical behaviour.
- Do not touch any per-customer isolated table in this prompt.
- Export the new Drizzle types so later prompts can import them.

## Acceptance criteria
- App builds and runs; existing customers load and behave exactly as before.
- `enterprise_groups` table exists; `customers` has the three new columns, all NULL/false on existing rows.
- A customer can be flagged `is_enterprise = true` and linked to an `enterprise_group_id` via a direct DB update (UI comes later) with no errors.
- `npm run db:push` (or the project’s management-DB migration command) completes cleanly.

## Do NOT
- Do not add `site_id` anywhere yet (that is prompt 02).
- Do not change login, sessions, or any isolated-schema table.
