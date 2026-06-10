---
name: getCustomerDatabase return shape
description: getCustomerDatabase() returns the drizzle instance directly — never destructure { db } from it
---

**Rule:** Always use `const db = await customerDbService.getCustomerDatabase(customerId)` — never `const { db } = await ...`.

**Why:** `customerDbService.getCustomerDatabase()` returns the drizzle `NodePgDatabase` instance directly (its `return db` at the end of the function). The drizzle instance has NO `.db` property, so `{ db } = drizzleInstance` silently yields `db = undefined`. All subsequent `db.select(...)` calls then throw "Cannot read properties of undefined (reading 'select')" — a confusing error because the variable name is correct but the destructuring was wrong.

**How to apply:** Any route file calling `getCustomerDatabase` must assign it directly. The broken pattern `({ db } = await ...)` was widespread in `contractorPortal.ts` (7 routes) and caused all portal endpoints to silently fail. If you see `{ db } = await customerDbService...` anywhere in the codebase, fix it to `db = await customerDbService...`.

**Also:** The `featureContractorPortal` column defaults to `false` in the DB schema. Do NOT gate the portal-invite or accept-invite endpoints on this flag — the sidebar feature gate is sufficient for admin pages, and the invite token is sufficient security for the accept flow. Gating on the DB flag blocks all invites by default.
