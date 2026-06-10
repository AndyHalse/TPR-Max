---
name: Contractor Portal auth & routing
description: JWT Bearer auth pattern, CSRF bypass, App.tsx routing, and feature flag for the contractor self-service portal at /contractor-portal/*.
---

## Auth pattern
- JWT is HMAC-SHA256 using Node `crypto` (no jsonwebtoken). Secret: `cportal::${SESSION_SECRET}`.
- Token stored in `localStorage` as `portal_token`; sent as `Authorization: Bearer` header.
- 8-hour expiry. `requireContractorPortalAuth` middleware in `server/utils/contractorPortalAuth.ts`.
- Public portal endpoints (login, accept-invite) bypass CSRF via the `/api/contractor-portal/` prefix in `server/index.ts`.

## App.tsx routing
- `isContractorPortalRoute = location.startsWith('/contractor-portal')` added to `isPublicRoute` so the main session auth block is skipped.
- Explicit path matching renders portal pages directly (no Wouter `<Route>`) — avoids the main `<Switch>` and `<Layout>`.

## Feature flag
- `featureContractorPortal: boolean` on `isolatedSchema.companySettings` (default false).
- Login endpoint checks this flag; invite endpoint also checks it.
- Migration: `ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS feature_contractor_portal BOOLEAN DEFAULT false`.

## DB table
- `contractor_portal_users` in isolated (per-customer) schema. NOT in shared/schema.ts.
- Drizzle definition in `server/isolatedSchema.ts` as `contractorPortalUsers`.
- Migration in `server/customerDatabase.ts` creates the table and a unique index on (email, contractor_company_id).

## Document upload
- Portal uploads to object storage using `ObjectStorageService().getPrivateObjectDir()` → `contractor-portal/${objectId}.${ext}`.
- `uploadedBy` set to `portal:${portalUserId}` — FK to users.id exists in schema but NOT enforced at DB level (same pattern as PPM `uploadedBy: "contractor"`).

**Why:** Bearer JWT avoids CSRF entirely (no cookie used). Isolated schema keeps portal users scoped per-customer.
