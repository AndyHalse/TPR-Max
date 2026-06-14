# UAT-01 (REVISED) — Tighten login brute-force protection

## Correction to the original finding
The original version of this ticket claimed `/api/auth/login` had **no** rate limiting. That was wrong. Login IS rate-limited at the app level: `server/index.ts` applies `authRateLimit` to all `/api/auth/*` routes (lines ~185–222) — **100 attempts per 15 minutes per IP**, plus `generalRateLimit` (1000/15min) on `/api`. So this is NOT a critical "open front door". Severity downgraded from Critical to **Low/Medium**. The remaining issue is that the limit is loose and keyed only by IP.

## Why (the real, narrower issue)
- **100 attempts / 15 min per IP** is generous for a login endpoint (~6–7 tries/minute, sustained). It blocks crude tools but allows a patient single-target brute-force well within the cap.
- It is keyed by **IP only** (`realClientIp`). There is no **per-account** throttle or lockout, so:
  - a distributed/botnet attack (many IPs, one account) is not slowed at all, and
  - there's no defence-in-depth if an attacker stays under 100/15min against one user.
- This is hardening, not an emergency. Prioritise accordingly.

## What to change (pick the lighter touch that fits)
Option 1 — tighten the existing global `authRateLimit` (simplest): lower `max` for auth specifically (e.g. 30/15min) if that doesn't disrupt legitimate kiosk/shared-IP usage. Caution: sites where many users share one office IP could hit a low global cap — test before lowering hard.

Option 2 — add a dedicated, **per-account** login limiter (recommended for defence-in-depth): in `server/routes/auth.ts`, add a limiter on `POST /api/auth/login` keyed by `companyName+username` (not IP), e.g. 10 failed attempts / 15 min per account, `skipSuccessfulRequests: true`, with a clear "Too many login attempts for this account" message. This complements the existing IP limiter and defeats distributed brute-force against a single account without locking out a shared-IP office.

Either way, keep the existing IP-based `authRateLimit` in place.

## Note on infrastructure (shared with other UAT tickets)
`express-rate-limit` uses the default in-memory store. Fine for a single instance; if TPR ever runs multiple instances behind a load balancer, the limits become per-instance and weaker. Track moving to a shared store (Redis/DB) separately — only relevant if/when multi-instance.

## Acceptance test
- With Option 2: 11 failed logins for the SAME company+username within 15 min → 11th returns 429, even if the attempts come from different IPs.
- A correct login still works and does not count toward the failed-attempt cap.
- A shared office IP with several legitimate users logging in is not collectively locked out by the per-account limiter.
- Normal 2FA flow unaffected.
