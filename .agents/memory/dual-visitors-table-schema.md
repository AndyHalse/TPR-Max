---
name: Dual visitors table definitions (shared/schema.ts vs isolatedSchema.ts)
description: Adding a column to the isolated per-tenant visitors table is not enough; the shared/schema.ts visitors table also needs it because TS types are inferred from there.
---

`server/isolatedSchema.ts` defines the `visitors` table actually queried per-tenant by `databaseService.ts` (runtime source of truth for per-customer data). But `shared/schema.ts` also defines its own separate `visitors` pgTable, and that is the one `Visitor`/`InsertVisitor` TypeScript types are inferred from (`typeof visitors.$inferSelect`) and imported across the frontend and much of the backend (`import * as sharedSchema from "@shared/schema"`).

**Why:** These two table definitions can drift. Adding a column only to `isolatedSchema.ts` (and its startup migration in `customerDatabase.ts`) fixes the real per-tenant DB and runtime queries, but leaves the exported `Visitor` TS type stale, causing TS2339 "property does not exist" errors in frontend/backend code that reads the new field.

**How to apply:** When adding a field to an isolated-schema table (visitors, staff, contractors, etc.), grep for a same-named `pgTable` in `shared/schema.ts` and add the field there too if one exists, to keep the exported type in sync. `drizzle.config.ts` points `drizzle-kit push/generate` at `shared/schema.ts` (the main/management DATABASE_URL), so that table also needs the column physically added — but `drizzle-kit generate` can trigger a risky interactive rename-detection prompt if the live DB has pre-existing unrelated drift from that file (common since some tables are legacy/vestigial and no longer kept in sync via push). In that case, skip `drizzle-kit generate/push` and instead run a direct, safe `ALTER TABLE ... ADD COLUMN IF NOT EXISTS ...` via `executeSql` against the dev database, mirroring the additive-migration pattern already used in `customerDatabase.ts` for isolated schemas.
