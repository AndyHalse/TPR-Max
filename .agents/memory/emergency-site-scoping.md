---
name: Emergency site-scoping pattern
description: How evacuations.siteId works, which DB each table lives in, and how to derive siteId in token-based FM routes.
---

## Rule
The `evacuations` table lives in the **shared management DB** (`shared/schema.ts`, queried via `db` from `../db`). It now has a `siteId` varchar column (added via startup migration `ALTER TABLE evacuations ADD COLUMN IF NOT EXISTS site_id VARCHAR`).

People tables (staff, visitors, contractorWorkers, members, evacuationZones, musterPoints) live in the **isolated customer DB** (`server/isolatedSchema.ts`, queried via `customerDbService.getCustomerDatabase()`).

`getScopedDb(req)` returns `{ db, siteId, siteContext }` where `db` is the isolated customer DB drizzle instance. For non-enterprise: `siteId` = default site ID, `siteContext.isEnterprise = false`. For enterprise: `siteId` = activeSiteId from session. `scopedWhere(siteContext, table)` returns `undefined` for non-enterprise (no filtering), `eq(table.siteId, activeSiteId)` for enterprise.

## Token-based Fire Marshal routes (no session)
These routes authenticate via `emergencyToken` or `x-fire-marshal-id` header — there is no session. Derive siteId as:
```ts
const marshalSiteId = (validatedStaff as any).siteId || null;
```
Then use direct `eq(table.siteId, marshalSiteId)` guarded by `marshalSiteId ?` — never call `getScopedDb(req)` here (no session means `activeSiteId` won't be set).

## Muster reset
Use `resetSiteId = (req.session as any)?.activeSiteId ?? (validatedStaff as any)?.siteId ?? null` so both admin (session) and FM token (marshal record) paths work.

## withSiteId helper
`withSiteId(siteId, values)` — spreads siteId into insert values only when siteId is non-null. Safe for both enterprise (stamps siteId) and non-enterprise (no-op, null siteId ignored).

**Why:** Without site scoping, an enterprise customer's Fire Marshal at Site A could trigger an evacuation that enrolled or checked out people at Site B — a life-safety defect.

**How to apply:** Any new route that reads or writes people/evacuation data in an enterprise context must either use `getScopedDb(req)` + `scopedWhere` (for session-authenticated routes) or derive siteId from the marshal's staff record (for token routes).
