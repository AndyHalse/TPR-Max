# UAT-04 — Add a resend cooldown to the 2FA login OTP

## Why
In `server/routes/auth.ts`, the `POST /api/auth/login` handler (~line 360 onwards) generates a fresh OTP and sends a verification email **every time** valid-looking credentials are submitted, with no cooldown. Two problems:
1. A user who mistypes their password (or just resubmits) triggers a new email each time — inbox clutter and confusion about which code is current.
2. It is an email-bombing vector: anyone who knows a valid company + username + password can hammer the login form and flood that user's inbox.

## What to change
1. Add a per-user (or per email) cooldown so a new OTP email is only sent if at least, say, **60 seconds** have passed since the last one for that user.
   - Track the last-send time alongside the existing `pendingCustomerOtps` map entry (it already stores `userId`, `email`, `expiresAt`, etc.). Add a `lastSentAt` timestamp, keyed by userId or email.
   - On a new login that would send an OTP: if a non-expired pending OTP already exists for that user AND it was sent less than 60s ago, **re-use the existing pending token** (return the same `requires2fa` response with the existing `maskedEmail`) WITHOUT sending another email. The user can still enter the code they already received.
2. Optionally cap the total number of OTP emails per pending token (e.g. max 3 sends within the 10-minute window), after which return a clear "Too many codes requested, please wait and try again" message.
3. Keep the existing 10-minute expiry and the `verify-2fa` rate limiter — this change is about send frequency, not verification attempts.

## Important
- The OTP store is currently an in-memory `Map`, so this cooldown is per-instance only. That's acceptable for a single instance; if TPR runs multiple instances this (and the OTP store itself) should move to a shared store — tracked separately. Add a `// TODO: shared store for multi-instance` comment.

## Acceptance test
- Submit valid credentials twice within 60 seconds → only ONE OTP email is sent; both responses point the user to the same code.
- Submit again after 60+ seconds → a new code may be sent (or capped, if you implemented the per-window cap).
- Normal first-time login still receives a code immediately.
