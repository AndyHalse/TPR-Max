# BUGFIX — Platform-admin saves fail with "Platform admin authentication required"

**Source:** Andy, 15 Jun 2026, `tpr-max.com/platform-admin/dashboard`. Editing a customer (Edit Customer → Save Changes) shows an error toast: **"Platform admin authentication required"**, even though the admin is logged in and the customer list loaded fine. The "Module Features" panel also sticks on "Loading feature data…".

## Root cause (strong — confirmed by code review)
Platform-admin auth is **cookie-session based**: `requirePlatformAdmin` (`server/auth.ts` ~line 1048) only passes if `req.session.platformAdminId` is set.

In `client/src/pages/PlatformAdminDashboard.tsx`, the two request styles are split:
- **GET queries use a bare `fetch(..., { credentials: "include" })`** with no `Authorization` header (e.g. customer list line ~124, branding ~177, admins ~209, features ~434). These **work** — the platform-admin cookie authenticates them.
- **Mutations use `apiRequest()`** (e.g. `editCustomerMutation` line ~364, credentials reset ~371, `toggleStatusMutation` Deactivate ~152, create/update/delete admin, branding update, features update ~450). `apiRequest` (`client/src/lib/queryClient.ts` line ~87) attaches `Authorization: Bearer <getSessionToken()>` — a **customer** session token left in storage. These **fail** with "Platform admin authentication required".

So the only difference between what works and what fails is the **stale customer Bearer token** that `apiRequest` bolts on. When the server sees that Bearer token it authenticates the request as a (customer) user instead of honouring the platform-admin cookie session, so `req.session.platformAdminId` isn't in play and `requirePlatformAdmin` rejects it. The bare-fetch GETs avoid this by sending the cookie only.

**This affects every platform-admin write, not just Edit Customer** — Deactivate, Delete, reset credentials, create/edit/delete admin, branding, and module-feature toggles all go through `apiRequest` and will hit the same wall.

## The fix
**Primary (client) — don't send the customer Bearer token on platform-admin routes.** Two clean options; pick one:
1. In `apiRequest` (and `getQueryFn`) in `client/src/lib/queryClient.ts`, **skip the `Authorization` header when the URL starts with `/platform-admin/`** — these routes authenticate by cookie only. Keep `credentials: "include"`. This is the smallest, safest change and fixes all platform-admin mutations at once.
2. Or give the platform-admin dashboard its own tiny request helper (bare `fetch` + `credentials:"include"` + CSRF) and use it for the mutations, matching how its GETs already work.

**Verify (server).** Add logging in `requirePlatformAdmin` / the global auth middleware to confirm: when a Bearer token is present, is the platform-admin cookie session being ignored or overwritten? Make sure a Bearer token never clobbers an existing `req.session.platformAdminId` for `/platform-admin/*` requests.

**Tidy (root of the stale token).** Work out why a customer `sessionToken` is in storage during a platform-admin session and **clear it on platform-admin login** so customer and platform-admin auth don't bleed into each other.

**The "Loading feature data…" panel.** That GET uses bare fetch so it should authenticate, but make it robust: show an explicit error state (with a retry) instead of sticking on "Loading feature data…" forever if the fetch fails. Confirm it resolves once the auth fix is in.

## Acceptance criteria
- Edit Customer → Save Changes succeeds and shows "Customer updated successfully".
- Deactivate, Delete, reset credentials, create/edit/delete platform admin, branding save, and module-feature toggles all succeed (no "Platform admin authentication required").
- The Module Features panel loads the customer's flags (no perpetual "Loading…"), or shows a clear error with retry.
- CSRF protection still holds for these writes.
- Logging in to the platform admin clears any stale customer session token.

## Security note
While here, double-check these platform-admin write routes all sit behind `requirePlatformAdmin` server-side (they appear to). The bug is the client failing to authenticate correctly — do **not** "fix" it by weakening the server checks. The server requirement is correct; the client just shouldn't be sending the wrong credential.
