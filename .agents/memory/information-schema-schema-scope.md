---
name: information_schema schema-scoping bug
description: Querying information_schema.columns without table_schema filter matches columns from all schemas, causing schema-isolation migrations to skip adding columns to customer schemas.
---

## The Rule
Always add `AND table_schema = current_schema()` when querying `information_schema.columns` for schema-isolated customer databases.

## Why
With `SET search_path TO "c_<id>", public`, a query like:
```sql
SELECT column_name FROM information_schema.columns WHERE table_name = 'company_settings'
```
returns columns from ALL schemas (including `public.company_settings`). Since `public.company_settings` is the template with all columns, the migration assumes nothing is missing and adds 0 columns to the customer schema.

This caused `induction_allow_hazard_report` (and potentially others) to be missing from new customer schemas, producing Drizzle 42703 "column does not exist" errors on ALL reads from `company_settings`.

## How to Apply
Every time you write a migration or schema-check that queries `information_schema.columns`:
```sql
-- WRONG — sees columns from all schemas
SELECT column_name FROM information_schema.columns WHERE table_name = 'company_settings'

-- CORRECT — scoped to the current customer schema
SELECT column_name FROM information_schema.columns WHERE table_name = 'company_settings' AND table_schema = current_schema()
```

Same applies to `information_schema.tables`, `information_schema.table_constraints`, etc.

## Where This Was Fixed
- `server/comprehensiveSettingsMigration.ts` migrations 100 and 101 — both had the unscoped query
- Migration 102 added as a corrective migration that adds all potentially missing columns using the correct scoped query
