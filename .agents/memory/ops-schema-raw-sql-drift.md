---
name: Raw-SQL DDL bypass causes schema.ts drift
description: When a migration is applied via hand-written SQL instead of drizzle-kit push, the Drizzle column types must be hand-verified against the live DB or they silently diverge.
---

If `drizzle-kit push:pg` gets stuck (e.g. an interactive prompt about an unrelated rename) and a new table/column is instead created via raw SQL, always re-check the live column types with `\d <table>` and match `shared/schema.ts` to what was actually created (not what was originally drafted). Drizzle defaults for id columns are easy to get wrong by hand (`varchar` vs `uuid`, `timestamp` vs `timestamptz`, `integer` vs `bigint`), and any declared index in schema.ts must also be created manually since it won't be picked up until the next successful push.

**Why:** A backup-verification feature shipped with `shared/schema.ts` declaring `varchar`/`timestamp`/`integer` for a table that raw SQL had actually created as `uuid`/`timestamptz`/`bigint`. The mismatch was invisible at runtime (pg coerces) but would have caused a destructive type-conversion migration the next time `drizzle-kit push` ran.

**How to apply:** After any raw-SQL schema change, run `psql "$DATABASE_URL" -c "\d <table>"` and diff it against the Drizzle definition before considering the work done.
