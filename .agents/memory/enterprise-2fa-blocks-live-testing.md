---
name: Enterprise customer 2FA blocks live-login verification
description: Real enterprise-scoped customers require email 2FA on login; do not force logins to test new enterprise features.
---

Real enterprise-scoped customers (e.g. companies with `is_enterprise = true` and multiple sites) have 2FA enabled on `/api/auth/login`. Completing login programmatically (via curl/script) to screenshot or exercise a new feature will send a real one-time code to that customer's real email inbox — do not do this without explicit user consent, even in a dev/test session.

The single `dev-customer-001` bypass account (`isDevAuthBypass`/`isValidDevCredentials`, company "ACS Safety & Security Ltd") skips 2FA but is **not** enterprise-enabled (`is_enterprise = false`, no sites/grants), so it cannot be used to test enterprise/multi-site features either.

**Why:** Discovered while verifying the Enterprise Estate AI Brief feature — every real enterprise account found in the DB required 2FA, and the dev-bypass account has no enterprise grants, so there is currently no safe way to get a live authenticated browser session for an enterprise multi-site view.

**How to apply:** When a feature is scoped to `requireEnterpriseRole`/enterprise customers and needs live UI verification, don't try to force a login. Instead:
1. Verify server-side logic directly by writing a temporary `.ts` script under `server/` that imports the real service functions (e.g. `customerDbService.getCustomerDatabase`, `computeLiveScores`, route helper functions) and runs them against a real customer's isolated schema — this exercises real DB reads/writes without going through HTTP/session/2FA.
2. Run it with `npx tsx path/to/script.ts`, inspect the output, then delete the script before finishing (never commit it).
3. If a true in-browser screenshot is required, ask the user for enterprise-scoped test credentials or explicit permission to trigger a real OTP email, rather than guessing at logins.
