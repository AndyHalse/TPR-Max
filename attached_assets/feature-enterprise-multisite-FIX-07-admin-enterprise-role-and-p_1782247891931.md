# Enterprise Multi-Site — FIX 07 — Admin "insufficient role" + enterprise pages crashing

**Two symptoms, ONE root cause: the account admin has no enterprise role grant, so every `/api/enterprise/*` call returns 403 "Insufficient enterprise role", and the Compliance Overview page then crashes (e.g. CRASH-58157) because it receives no data. Fix the role logic robustly, and make the pages resilient. Test customers only; single-site customers unaffected.**

## Root cause (verified in the code, 23 June 2026)
- `resolveEnterpriseGrants` in `server/enterpriseRoles.ts` reads grants from `site_user_roles` and returns **empty** (→ 403) when the user has no explicit grant. There is **no fallback** for a customer-level `admin`.
- Migration `20260622_067` bootstraps `enterprise_admin` for admins that existed **when it ran** — so admins created later (or customers flagged Enterprise later, e.g. Cowiesburn) never get it. Chicken-and-egg: you need `enterprise_admin` to grant roles, but nobody reliably gets it.
- Result: admin sees "Insufficient enterprise role"; the enterprise pages get 403s and crash.

## PART A — Make the account admin implicitly enterprise_admin (the real fix)
In `resolveEnterpriseGrants` (and therefore everywhere `requireEnterpriseRole` and `buildMeResponse` rely on it):
- When the **customer is enterprise** (read `customers.is_enterprise` from the management DB, as `buildMeResponse` already does) **and the user's customer-level role is `admin`**, treat them as **`enterprise_admin`** — `{ roles: ['enterprise_admin', ...anyExplicit], allowedSiteIds: 'all' }` — even with no row in `site_user_roles`.
- Keep all **explicit** grants working as today (union the implicit admin role with any explicit grants).
- This guarantees the account admin always has full enterprise access, regardless of when they were created — no dependency on the one-time migration.
- Belt-and-braces: when a new user with customer-role `admin` is created for an enterprise customer (platform-admin "Manage Users" / enterprise "People & Access"), it's fine to also insert the explicit grant — but the implicit rule above is the primary, must-have fix.
- Fail-closed elsewhere is unchanged: non-admins still need explicit grants; non-enterprise customers get no enterprise access.

## PART B — Stop the enterprise pages crashing on error/empty (defence in depth)
Make every enterprise page resilient so a 403 or a failed/empty API never white-screens the app:
`EnterpriseCompliance.tsx`, `EnterpriseSites.tsx`, `EnterpriseSiteDetail.tsx`, `EnterpriseReports.tsx`, `EnterpriseAccess.tsx`, `EnterpriseStandards.tsx`, `EnterpriseContractorPool.tsx`.
- Handle the React Query **error** state explicitly: on a 403 show a clear, friendly card ("You don't have enterprise access for this customer" or "Couldn't load this — try again"), **not** an ErrorBoundary crash.
- Guard every data access (optional chaining, default `[]`/`0`) so a missing field never throws during render — especially in the issues/expiries/site-table rendering added in the Figure-2/3 work.
- Keep the existing loading and empty states.

## PART C — Consistency
- The enterprise **menu** items that need a manage role (People & Access, Group Standards, Contractor Pool, Reports) read `enterpriseRoles` from `/api/auth/me`; since that uses `resolveEnterpriseGrants`, Part A also makes those items appear for the admin. Confirm the admin sees all six items after the fix.

## Acceptance criteria
- Logged in as the **Cowiesburn admin** (or any enterprise customer's admin): **no "Insufficient enterprise role"**, the Compliance Overview loads with no CRASH, and all six enterprise menu items appear and open.
- An admin created **after** the customer was flagged Enterprise still has full access (prove it: create a fresh admin, log in, it works).
- A genuine 403 or API error on any enterprise page shows a friendly message — never a white-screen crash.
- Non-enterprise customers: no enterprise menu, no behaviour change.
- The site-isolation tests still pass (this does not widen cross-site access — an enterprise_admin already has all sites; non-admins are unchanged).

## Do NOT
- Do not give enterprise access to non-admin users without an explicit grant, and never to non-enterprise customers.
- Do not remove or weaken explicit `site_user_roles` grants or the fail-closed behaviour for area_manager / site_coordinator.
- Do not "fix" the crash by hiding errors silently — show a clear message and log the real error.
