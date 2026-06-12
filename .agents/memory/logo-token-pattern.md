---
name: Logo token missing on session-cookie login
description: tprmax-logo-token is only stored during the login-page flow; session-cookie logins never set it, causing getLogoSrc() to silently return null and the sidebar to show company initials instead of the logo.
---

## Rule
When `logoFallbackStage === 0` and there is no `tprmax-logo-token` in sessionStorage, treat it as stage 1 — return `/api/company-logo` rather than `null`.

**Why:** `sessionStorage.setItem('tprmax-logo-token', data.logoToken)` only runs in `Login.tsx` after a successful login form submission. Users who land on the app via a pre-existing session cookie (e.g. "Remember me" or re-opening the tab) never execute that path, so stage 0 always misses and the logo falls back to the company initials placeholder.

**How to apply:** In `getLogoSrc()` in `Layout.tsx`:
```js
const effectiveStage = (logoFallbackStage === 0 && !logoToken) ? 1 : logoFallbackStage;
```
Use `effectiveStage` in all subsequent `if` branches instead of `logoFallbackStage` directly. This preserves the full 4-stage fallback chain for users who DO have the token.
