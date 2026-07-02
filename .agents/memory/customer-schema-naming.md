---
name: Customer schema naming convention
description: Real tenant schema names use the c_<8-hex> prefix, not cust_ or customer_ — relevant for any code that pattern-matches schema names.
---

Customer (tenant) Postgres schemas are named `c_<8-char-uuid-prefix>` (see `customerDatabase.ts` `generateSchemaName()`), e.g. `c_13fa092a`. Code that needs to distinguish tenant schemas from shared/system schemas must match this `c_` prefix — patterns like `cust_` or `customer_` never match any real schema and will silently no-op.

**Why:** A backup-verification job's per-tenant core-table check used `schema.startsWith('cust_') || schema.startsWith('customer_')`, which never matched, so the check silently never ran for any customer in production until caught in code review.

**How to apply:** When writing schema-enumeration or schema-name-matching logic (ops jobs, migrations, audits), verify the prefix against a real schema name from `information_schema.schemata` rather than assuming a naming convention.
