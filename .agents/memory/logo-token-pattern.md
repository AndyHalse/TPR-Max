---
name: Logo loading — must use JS fetch with Bearer token, not <img src>
description: The server uses Bearer-token-only auth (session has no userId). <img src> requests never send Authorization headers → 401 on every logo load. Must fetch via JS with Bearer token and render as blob URL.
---

## Rule
**Never use `<img src="/api/company-logo?...">` for authenticated logo loading.** Use JavaScript `fetch()` with the `Authorization: Bearer <token>` header, convert to a blob URL, and render `<img src={blobUrl}>`.

**Why:** The app authenticates via `sessionStorage.getItem('session_token')` (Bearer JWT), NOT via session cookie. The session cookie exists in the browser but `req.session.userId` is always `null` (session was regenerated with a new ID at login, so the old cookie maps to an empty session in Postgres). `requireAuth` (server/auth.ts:814) checks Bearer token first, then session fallback — but native browser image requests (`<img src>`) never send custom `Authorization` headers. Result: every `<img>` request to `/api/company-logo` gets 401.

The server logs showed this clearly:
```
Session Debug [GET /api/company-logo]: {"hasSession":true,"hasUserId":false,"sessionExists":"yes"}
🚨 SECURITY: requireAuth failed - missing tenant context: {"hasUserId":false,"hasCustomerId":false}
GET /api/company-logo 401
```

Concurrent React Query fetches (which DO send Bearer) to the same endpoint succeed (200). Only browser-native img requests fail.

**How to apply:** In `Layout.tsx`, use a `useEffect` to fetch the logo via JS:
```js
const sessionToken = sessionStorage.getItem('session_token');
const res = await fetch(`/api/company-logo?t=${encodeURIComponent(logoUrl)}`, {
  credentials: 'include',
  headers: sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {},
});
const blob = await res.blob();
const blobUrl = URL.createObjectURL(blob);
setLogoBlobUrl(blobUrl);
```
Use `logoBlobUrl` as the `<img src>`. Track `logoBlobUrlRef` to revoke the object URL on change/unmount.

Use `logoFetchKey` (increment to retry) + a 5-second retry `useEffect` on `logoError` for resilience against server restarts.

**Do NOT use `/api/public-logo/:token` stage** — the `tprmax-logo-token` in sessionStorage is a secondary token set only during Login.tsx flow. The `session_token` (Bearer) is the primary auth credential.
