# Enterprise Multi-Site — FIX 06 — Enterprise menu doesn't appear (the /api/auth/me Bearer path drops isEnterprise)

**A real bug: a logged-in enterprise customer (e.g. CPI Books, flagged Enterprise) sees NONE of the six Enterprise menu items. Root cause found. Small, precise fix. Test customers only; single-site customers unaffected.**

## Root cause (verified in the code, 23 June 2026)
`GET /api/auth/me` in `server/routes/auth.ts` has **two auth paths**:
- **Session-cookie path** (~lines 776–819) correctly resolves and returns `isEnterprise`, `enterpriseRoles`, and `activeSiteId`.
- **Bearer-token path** (~lines 690–714) returns the user object **without** `isEnterprise`, `enterpriseRoles`, or `activeSiteId` — it stops at its own `res.json({...})` at ~line 702.

The client authenticates with the per-tab Bearer token, so it hits the Bearer path and never receives `isEnterprise`. The sidebar gating in `client/src/components/Layout.tsx` hides every item flagged `enterpriseOnly` when `!user?.isEnterprise` (~line 297), so all six Enterprise items (Compliance Overview, Sites, People & Access, Group Standards, Contractor Pool, Portfolio Reports) disappear — even for a correctly-flagged enterprise customer.

## What to fix

### 1. Make BOTH auth paths return the same enterprise fields (the actual bug)
Resolve `isEnterprise` (from the management `customers` table), `enterpriseRoles` (via `resolveEnterpriseGrants`), and `activeSiteId` in the **Bearer-token path** too, and include them in its `res.json(...)` — identical to the session path.
- **Best practice:** extract a single `buildMeResponse(user, customerId, req)` helper that both paths call, so the two response shapes can never drift apart again. Both paths must return exactly the same fields.

### 2. Stop silently defaulting isEnterprise to false
The session path wraps the management-DB lookup in a `try/catch` that silently sets `isEnterprise = false` (~line 788). If that query ever fails, the Enterprise menu vanishes with no clue why. Log a clear warning via the Winston `logger` on failure instead of swallowing it. Apply the same to the Bearer path's new lookup.

### 3. Land enterprise admins on the estate dashboard (the good version of "an enterprise login")
Do NOT add a separate enterprise login screen or a "tick box" on the login form — access comes from the account, not user self-selection. Instead:
- After login, for a user whose `enterpriseRoles` include `enterprise_admin` or `area_manager`, default their landing page to **`/enterprise` (Compliance Overview)** — unless they have an explicit `defaultLandingPage` set, which wins.
- A `site_coordinator` (single-site local user) lands on the normal Dashboard, scoped to their site, as today.
- Non-enterprise users are completely unchanged.

## Rules
- No change for single-site customers — `isEnterprise` stays false and the menu stays hidden for them.
- Don't add a login-screen tick box or a separate enterprise login route.
- en-GB; keep the existing per-tab Bearer-token security model intact.

## Acceptance criteria
- Logged in as **CPI Books admin**, the sidebar now shows the Enterprise section: Compliance Overview, Sites, People & Access, Group Standards, Contractor Pool, Portfolio Reports.
- `/api/auth/me` returns identical `isEnterprise` / `enterpriseRoles` / `activeSiteId` whether called via session cookie or Bearer token (prove it: hit both ways).
- An enterprise_admin lands on Compliance Overview after login; a site_coordinator lands on their site Dashboard.
- A non-enterprise customer sees no Enterprise menu and behaves exactly as before.
- If the management-DB enterprise lookup fails, a warning is logged (not silently swallowed).

## Do NOT
- Do not add a separate enterprise login page or a self-select tick box.
- Do not fix only one of the two auth paths — they must return the same shape (use a shared helper).
