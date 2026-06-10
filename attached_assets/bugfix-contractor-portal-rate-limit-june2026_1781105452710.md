# Bugfix — Contractor Portal login has no brute-force protection

**Priority: HIGH (security). Effort: very small — two lines plus a test.**

## The problem

The new Contractor Portal added two public, internet-facing endpoints that handle passwords:

- `POST /api/contractor-portal/login` (`server/routes/contractorPortal.ts:32`) — email + password login
- `POST /api/contractor-portal/accept-invite` (`server/routes/contractorPortal.ts:116`) — invite token + new password

Neither has login-grade rate limiting. The main app login is protected by `authRateLimit` (100 requests per 15 minutes per IP, defined in `server/index.ts:185`), but that limiter is only applied to `/api/auth` and `/api/onboarding` (`server/index.ts:222-223`). The portal endpoints only get `generalRateLimit` (1,000 requests per 15 minutes per IP) — that's roughly one password guess per second, all day, which is no defence against automated credential-stuffing or invite-token guessing.

The authentication itself is fine (bcrypt, HMAC-signed token, timing-safe comparison) — do not change any of that. The only gap is the missing rate limit.

## The fix

In `server/index.ts`, where the existing limiters are applied (around line 222), add the contractor portal auth endpoints alongside the others:

```ts
// Apply rate limiting
app.use('/api/auth', authRateLimit);
app.use('/api/onboarding', authRateLimit);
app.use('/api/contractor-portal/login', authRateLimit);          // NEW
app.use('/api/contractor-portal/accept-invite', authRateLimit);  // NEW
app.use('/api', generalRateLimit);
```

That's the whole fix. Reuse the existing `authRateLimit` — do NOT create a new limiter, and do NOT change its settings (the 100/15-min window, `realClientIp` key generator, and localhost skip are all deliberate and shared with the main login).

## Why accept-invite is included

`accept-invite` is how a portal account gets its first password, gated only by an invite token in the request body. Without a rate limit an attacker can churn through token guesses at high speed. Same risk class as the login, same fix.

## Do NOT rate-limit the other portal routes

`/api/contractor-portal/me`, `/documents`, `/workers`, `/document-stats` and the upload route are all behind `requireContractorPortalAuth` and already covered by `generalRateLimit`. Leave them as they are — a logged-in contractor uploading several documents shouldn't hit a login-grade limit.

## How to verify

1. Restart the server.
2. Send 101 POST requests to `/api/contractor-portal/login` with a wrong password from the same (non-localhost) IP within 15 minutes — request 101 must return HTTP 429 with the "Too many authentication attempts" message.
3. Confirm a correct login still works from a different IP (or after the window resets).
4. Confirm `GET /api/contractor-portal/documents` with a valid portal token is NOT affected by the new limit.
5. Quick regression: main app login at `/api/auth/login` still works.

## Scope guard

Change only `server/index.ts`. No changes to `contractorPortal.ts`, `contractorPortalAuth.ts`, or any client code.
