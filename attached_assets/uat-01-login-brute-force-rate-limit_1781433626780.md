# UAT-01 — Add brute-force protection to the login endpoint

## Why
`POST /api/auth/login` in `server/routes/auth.ts` (handler starts at line ~201) has **no rate limiting**. The only limiter (`twoFaLimiter`, 5 attempts / 15 min) is applied to `/api/auth/verify-2fa` only (line ~419). Because 2FA is only triggered *after* the password is verified, the password check itself can be brute-forced indefinitely. This is a critical security gap on the front door.

## What to change
1. In `server/routes/auth.ts`, create a login limiter alongside the existing `twoFaLimiter`:
   - Window: 15 minutes.
   - Max: 10 attempts.
   - Key by **both** IP address and the submitted `username` (or `companyName+username`) so one attacker can't lock out everyone, and one user can't be brute-forced from rotating IPs. Use a custom `keyGenerator`.
   - Skip counting successful logins (`skipSuccessfulRequests: true`) so legitimate users aren't penalised.
   - Return a clear message: "Too many login attempts. Please try again in 15 minutes."
2. Apply it: `app.post('/api/auth/login', loginLimiter, async (req, res) => { ... })`.
3. Do **not** apply the limiter to the dev-auth-bypass path in a way that breaks local dev, but it is fine for the limiter to wrap the whole route.
4. Add a short comment explaining the limiter exists to stop password brute-force.

## Important
- The current `express-rate-limit` uses the default in-memory store. That is acceptable for a single instance but will not work correctly across multiple instances. If TPR runs more than one server instance in production, back the limiter with a shared store (e.g. Redis or the database). Add a `// TODO: use shared store if running multiple instances` comment so this isn't forgotten. (This is tracked separately as UAT infra work.)

## Acceptance test
- 11 wrong-password attempts for the same username within 15 minutes → the 11th returns HTTP 429 with the throttle message.
- A correct login still works and does not count toward the limit.
- Verify normal 2FA login flow is unaffected.
