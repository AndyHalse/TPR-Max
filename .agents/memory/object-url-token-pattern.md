---
name: objectUrl token pattern for img tags
description: How authenticated object-storage images are served when the session cookie lacks userId (Bearer-token-only tabs).
---

## The rule
Always wrap `/objects/...` image paths with `objectUrl(path)` from `@/lib/queryClient` before assigning to `<img src={...}>`.

**Why:** The `/objects/...` route requires auth. Staff tabs use a per-tab Bearer token stored in sessionStorage, not the session cookie. `<img>` tags cannot send `Authorization` headers, so they returned 401. The fix appends `?token=<bearer>` which the route now also accepts.

**How to apply:**
- Import `objectUrl` from `@/lib/queryClient`.
- Wrap every `staff.photoUrl`, `member.photoUrl`, `vs.photoUrl` etc. in `objectUrl(...)` before passing to `src`.
- `objectUrl(null | undefined)` returns `undefined` safely — use inside a truthiness guard as usual.
- The `/objects/:objectPath(*)` route on the server accepts the token from `req.query.token` (staff JWT) OR the `Authorization` header OR the contractor portal JWT (tried in that order).
- Session-token-less users (e.g. traditional cookie sessions with no `userId`) still work via `hasStaffSession` check.
