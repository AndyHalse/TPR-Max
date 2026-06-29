---
name: Missing column startup migration pattern
description: How to diagnose and fix 42703 errors caused by isolatedSchema columns that don't exist in older customer DBs.
---

## The Rule
Drizzle ORM generates `SELECT "col1", "col2", ... "col_N"` listing **every column in the schema definition** — including columns added after the table was originally created. If any of those columns doesn't exist in the actual DB table, the query fails with PostgreSQL error `42703` (undefined_column) on **every read** for that table, for every user of that customer.

The error message from Drizzle is typically empty (`e.message === ""`) — the real details are in `e.cause.message` and `e.cause.code`.

## Why It Happens
When a new column is added to `server/isolatedSchema.ts` and the migration to add it to existing customer schemas either:
- Was placed only in `server/index.ts` without schema-qualification (runs for wrong schema or fails silently per-customer)
- Was never added to `server/customerDatabase.ts` `ensureIsolatedSchema` at all

**Affected tables seen in production:** `staff.updated_at`, `visitors.updated_at`, `members.updated_at`, `contractor_workers.updated_at`, `contractor_workers.is_demo`, `contractor_companies.is_demo`.

## How to Apply
For any new column added to `isolatedSchema.ts`, immediately add to `customerDatabase.ts` `ensureIsolatedSchema` in the relevant try-block:

```typescript
await pool.query(`ALTER TABLE "${schemaName}".tablename ADD COLUMN IF NOT EXISTS colname TYPE DEFAULT value`);
await pool.query(`ALTER TABLE "${schemaName}".tablename ALTER COLUMN colname SET DEFAULT value`);
```

Two statements because:
1. `ADD COLUMN IF NOT EXISTS` handles the column-missing case (creates with default)
2. `ALTER COLUMN SET DEFAULT` handles the column-exists-without-default case (backfills the default without touching rows)

Both are idempotent and safe to run repeatedly.

## Debugging
- `42703` with hint "Perhaps you meant to reference column X" → the suggested column EXISTS; the missing column has a similar name
- `42703` + empty `e.message` → look at `e.cause.message` and `e.cause.code`
- Log context with: `const c = (e as any)?.cause; logger.warn('...', e.message || c?.message || String(e), c?.code)`
