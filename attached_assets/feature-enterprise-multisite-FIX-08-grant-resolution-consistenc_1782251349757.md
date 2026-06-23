# Enterprise Multi-Site — FIX 08 — Grant resolution called inconsistently (drill-down 403s) + real error states

**Two issues. (1) `resolveEnterpriseGrants` is called five different ways across `enterpriseSites.ts` — one with the wrong arguments — so the per-site drill-down 403s for everyone and admins get an empty site list. (2) The enterprise pages are crash-safe but never show an error message. Test customers only; single-site customers unaffected.**

## Bugs found (verified in the code, 23 June 2026)
`resolveEnterpriseGrants(userId, customerId, userRole?)` — the implicit-admin rule only fires when `userRole === 'admin'` is passed. The API gate (`requireEnterpriseRole`, line 157) and `buildMeResponse` pass it correctly. But in `server/routes/enterpriseSites.ts`:
- **Line ~123 (drill-down `GET /api/enterprise/sites/:id` scope check):** `resolveEnterpriseGrants(req)` — **wrong arguments** (passes `req` as `userId`, no `customerId`/`role`). Resolves to empty grants → the check returns **403 "Site is outside your managed scope" for EVERY user, including enterprise_admin.** The per-site drill-down is broken for everyone.
- **Line ~87 (`GET /api/enterprise/sites` list):** `resolveEnterpriseGrants(user.id, customerId)` — no `user.role` → an admin without an explicit grant gets `allowedSiteIds: []` → **empty site list**.
- **Lines ~457 and ~564 (site-user management / role-grants):** same omission → admins can be blocked from operations they should own.

Also: the implicit-admin rule is not gated on `isEnterprise` (a non-enterprise admin also resolves as enterprise_admin — harmless today but untidy).

## PART A — One request-based resolver, used everywhere (the durable fix)
- Add a single helper, e.g. `resolveGrantsForReq(req)`, that reads `req.session.userId` (or `req.user.id`), `req.customerId`, and the user's `role`, and calls `resolveEnterpriseGrants(userId, customerId, role)`. 
- **Replace every direct `resolveEnterpriseGrants(...)` call in `server/routes/enterpriseSites.ts` (lines ~87, ~123, ~457, ~564) with `resolveGrantsForReq(req)`** so no call site can pass the wrong/partial arguments again. Fix the line ~123 wrong-signature call specifically.
- Audit the rest of the server for any other `resolveEnterpriseGrants(` call that omits the role and route it through the helper too.
- Gate the implicit-admin rule on the customer being enterprise: only treat `role === 'admin'` as `enterprise_admin` when `customers.is_enterprise` is true (read it as `buildMeResponse` does). Non-enterprise admins resolve to no enterprise role.

## PART B — Real error states on every enterprise page (not just crash-safety)
For `EnterpriseCompliance`, `EnterpriseSites`, `EnterpriseSiteDetail`, `EnterpriseReports`, `EnterpriseAccess`, `EnterpriseStandards`, `EnterpriseContractorPool`:
- When a primary query is in **error** (React Query `isError`), render a clear, friendly **error card** — distinct from the empty/no-data state:
  - On a **403** → "You don't have enterprise access for this customer" (and, if relevant, "ask an Enterprise Admin to grant you a role").
  - On any other failure → "Couldn't load this — please try again" with a **Retry** button (refetch).
- Keep the existing loading and genuine empty-data states. A user must be able to tell "failed / no access" from "loaded, nothing here".
- Log the real error to the console/Winston; never swallow it silently.

## Acceptance criteria
- An enterprise **admin** sees all sites in the Sites list, can **open the per-site drill-down** (no 403), and can manage site users.
- An **area_manager / site_coordinator** still only sees/opens their authorised sites (fail-closed unchanged — re-confirm with the isolation tests).
- Every enterprise page shows a clear error message + retry on a 403 or network failure, distinct from the empty state — no blank/misleading "no data" page on error.
- A non-enterprise customer's admin gets no enterprise access; non-enterprise customers are unchanged.
- `npm run test:site-isolation-routes` still passes (this doesn't widen cross-site access — admins already have all sites; non-admins are unchanged).

## Do NOT
- Do not leave any `resolveEnterpriseGrants` call passing partial/wrong arguments — route them all through the one request helper.
- Do not give enterprise access to non-admins without a grant, or to non-enterprise customers.
- Do not "handle" errors by hiding them — show a clear message and log the real error.
