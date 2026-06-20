# Threat Model

## Project Overview

TPR Max is a publicly deployed multi-tenant workforce and site-safety SaaS application. It uses a React frontend in `client/src` and a Node/Express backend in `server/`, with PostgreSQL-backed tenant isolation through customer-specific databases and isolated schemas. The product handles visitor, contractor, staff, HR, emergency, compliance, reporting, billing, file uploads, and external integrations.

Production assumptions for this scan:
- `NODE_ENV` is `production` in real deployments.
- The current deployment is public on the internet.
- Replit handles TLS at the platform edge.
- Mockup sandbox and explicit development-only routes are out of scope unless production reachability is shown.

## Assets

- **Customer-isolated business data** — visitor logs, staff profiles, contractor records, HR records, incidents, compliance evidence, emergency accountability data, and reports. Exposure or tampering would impact both privacy and safety operations.
- **Authentication material** — user passwords, session cookies, per-tab bearer session tokens, platform-admin sessions, contractor portal tokens, invitation tokens, and emergency access tokens. Compromise would allow impersonation or cross-boundary access.
- **Sensitive HR and compliance documents** — right-to-work documents, DBS records, appraisals, training evidence, RAMS, permits, certificates, signed forms, and uploaded attachments. These contain regulated or high-impact personal and corporate data.
- **Platform-level secrets and integrations** — Stripe credentials, SMTP/SendGrid settings, AI provider keys, access-control integration credentials, calendar tokens, and storage access. Leakage could enable account takeover, data exfiltration, or fraudulent actions.
- **Tenant isolation controls** — customer lookup, customer database selection, contractor portal scoping, and platform-admin controls. These are core to preventing cross-tenant compromise.

## Trust Boundaries

- **Browser / public client to backend API** — all request bodies, headers, query strings, uploaded files, and tokens are attacker-controlled until validated server-side.
- **Authenticated customer user / tenant data** — a logged-in user must only act within the selected customer context and within their role.
- **Public token links / protected tenant resources** — invitation links, upload links, NDA links, emergency links, and contractor portal flows bridge unauthenticated users into tenant-specific resources and must strictly bind tokens to the right tenant and action.
- **Contractor portal / internal customer admin** — contractor portal users are less trusted than customer admins and must only access their own contractor-company data.
- **Customer app / platform-admin plane** — `/platform-admin/*` has system-wide power and must remain isolated from regular tenant sessions.
- **Backend / tenant database** — the server chooses which tenant database or schema to access. Any mistake here can break the core isolation model.
- **Backend / object storage and external services** — uploads, signed URLs, calendar integrations, AI services, email, Stripe, Paxton, BioStar, and similar integrations must not let user-controlled input escape intended scope.

## Scan Anchors

- **Production entry points:** `server/index.ts`, `server/routes/index.ts`, `client/src/App.tsx`, `client/src/main.tsx`
- **Highest-risk code areas:** `server/auth.ts`, `server/routes/auth.ts`, `server/customerDatabase.ts`, `server/routes/contractors.ts`, `server/routes/contractorPortal.ts`, `server/routes/settings.ts`, `server/routes/imports.ts`, `server/routes/emergency.ts`, `server/routes/platformAdmin.ts`, `server/billingRoutes.ts`, `server/stripeWebhookHandler.ts`
- **Public surfaces:** login, contractor portal public endpoints, invitation acceptance, public upload/token endpoints, NDA flows, public logo/object routes, tracking, kiosk/device scanning, emergency-token routes
- **Additional anchors confirmed during this scan:** `server/routes/passes.ts` public QR scan endpoints, `server/qrReaderService.ts` cross-tenant QR lookup logic, `server/routes/visitors.ts` XStation scanner flow and H&S acceptance links, `server/routes/calendarIntegration.ts` OAuth callbacks, `server/objectStorage.ts` legacy object-path normalization
- **Authenticated/admin surfaces:** most `/api/*` routes after `requireAuth`; platform admin under `/platform-admin/*`; contractor portal bearer-token APIs
- **Usually dev-only and skip unless proven reachable:** explicit `NODE_ENV !== 'production'` routes, developer bypass helpers in `server/auth.ts`, test scripts, migrations, seed scripts

## Threat Categories

### Spoofing

The application supports several identity types: tenant users, platform admins, contractor portal users, public token holders, and emergency access holders. The system must verify the correct credential type on every request, reject expired or forged tokens, and prevent one auth plane from being confused with another. Login, OTP, session creation, contractor portal tokens, invitation flows, and emergency token flows are all high-value targets.

Required guarantees:
- Protected customer APIs MUST require a valid tenant user session or valid per-tab bearer session token.
- Platform-admin endpoints MUST require a platform-admin session and MUST not be reachable through normal tenant sessions.
- Contractor portal APIs MUST require a valid contractor portal token and MUST remain scoped to that portal user’s contractor company.
- Public token endpoints MUST verify token authenticity, expiry, tenant binding, and intended action before exposing data or accepting uploads.
- Public device, scanner, and OAuth callback endpoints MUST authenticate the device or bind the callback state to the initiating session before changing tenant state.

### Tampering

Users can submit complex forms, CSV imports, document uploads, billing actions, onboarding data, and emergency/accountability actions. The backend must treat all client inputs as untrusted and enforce validation and business rules server-side. This is especially important where IDs, company IDs, worker IDs, or tenant context are passed in the URL or body.

Required guarantees:
- Sensitive state changes MUST validate caller role and tenant scope on the server.
- Upload and import handlers MUST validate file type, size, and ownership before persisting data.
- User-supplied identifiers MUST NOT let callers act on records outside their allowed tenant, contractor-company, or role scope.
- Billing, access-control, and workflow actions MUST be derived from trusted server-side state, not client claims.
- State-changing links sent by email MUST require an explicit user action, not mutate records on a bare `GET`.

### Information Disclosure

The product stores large amounts of personal, safety, and HR data, and also exposes public link-based workflows. The biggest risk is unauthorized disclosure across tenants, between internal and portal users, or through overly broad public token endpoints. Error messages, object routes, logs, and AI features also need scrutiny because they may reveal sensitive operational or personal data.

Required guarantees:
- Tenant data MUST only be returned from the correct tenant database or schema.
- Public endpoints MUST disclose only the minimum data needed for the specific link-based workflow.
- Object storage and download routes MUST enforce access rules before returning private files.
- Logs, diagnostics, and API errors MUST NOT expose secrets, OTPs, passwords, or unnecessary sensitive data.

### Denial of Service

The application accepts large JSON payloads, file uploads, CSV imports, AI generation requests, and external-integration actions. These can be abused to consume CPU, memory, storage, third-party quotas, or operator attention if the app lacks route-specific throttling or work limits.

Required guarantees:
- Public and auth endpoints with high abuse potential MUST be rate-limited appropriately.
- File uploads, imports, and AI generation MUST have enforced size and cost limits.
- Expensive external-service actions MUST be gated by authentication and, where appropriate, role checks or quotas.
- Public endpoints MUST not allow unbounded processing on attacker-controlled input.

### Elevation of Privilege

This codebase has multiple role layers: standard users, managers, HR admins, portal admins, contractor portal users, fire marshals with emergency tokens, and platform admins. Any missing route-level authorization or tenant scoping bug could turn into privilege escalation or cross-tenant compromise.

Required guarantees:
- Route handlers MUST enforce role checks server-side for admin, HR, portal-admin, and platform-admin actions.
- Customer context selection MUST be trusted and MUST NOT be overridable by attacker-controlled tenant identifiers after authentication.
- Queries and object lookups MUST bind records to the caller’s tenant and, where applicable, contractor company.
- High-privilege actions such as customer provisioning, credential resets, billing changes, document approval, and emergency accountability changes MUST verify both identity and authority for the exact target resource.
- Deactivated users MUST be blocked both at login time and on subsequent authenticated requests.
