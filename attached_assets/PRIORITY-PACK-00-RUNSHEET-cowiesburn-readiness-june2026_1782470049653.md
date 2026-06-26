# PRIORITY PACK — Cowiesburn / multi-site readiness (runsheet)

**Written 26 June 2026. Do these in order. Do NOT batch them — apply, test, and
confirm each one before starting the next.**

These three close the gaps identified in *TPR Max Enterprise — How It Works &
Cowiesburn Fit*. The architecture is right; this is finishing + proving, not
rebuilding.

| # | Prompt file | What it fixes | `db:push`? | Gate before next |
|---|-------------|---------------|-----------|------------------|
| 01 🔴 | `PRIORITY-01-bugfix-ppm-full-site-scoping-multisite-june2026.md` | PPM (maintenance) isn’t fully site-aware — sites’ PPM data bleeds together. The real blocker for an FM client like Cowiesburn. | **YES** (site_id on PPM tables that lack it + an is_demo flag) | PPM list/by-id isolation tests added by this prompt must pass |
| 02 🟠 | `PRIORITY-02-feature-central-independent-management-style-june2026.md` | The Central/Independent switch does nothing — needed for “independent per-site” customers; harmless for Cowiesburn (Central). | NO | Its management-style tests must pass |
| 03 🟢 | `PRIORITY-03-run-and-prove-isolation-test-june2026.md` | Runs the whole route-level isolation test, proves it actually catches leaks, and extends it to cover #01 and #02. Your evidence the site wall holds. | NO | This IS the gate — green + proven-to-bite = safe to demo multi-site |

## Why this order
- **01 first** because it’s the only 🔴 and it’s the one that directly bites
  Cowiesburn (FM = PPM-heavy). It also needs a `db:push`, so do it while you’re
  set up for a schema change.
- **02 next** because it’s low-risk and needed for the *other* customer type
  (independent-per-site). It depends on nothing in 01.
- **03 last** because it’s the proof step — it should run *after* 01 and 02 are
  in, and prompts 01 and 02 each add their own tests that 03 then runs as one
  suite. 03 also does the “deliberately break a wall to prove the test fails”
  check, which is the whole point of having the test.

## Standing rules for the Replit agent (all three prompts)
- Route **all** site-scoping through the existing helpers in
  `server/siteScope.ts` (`getScopedDb` / `scopedWhere` / `withSiteId`) and all
  role/grant logic through `resolveEnterpriseGrants` in
  `server/enterpriseRoles.ts`. Do not invent parallel logic.
- **Fail closed**: no site context / no grant → no rows / 403, never “show all”.
- **Single-site (non-enterprise) customers must be completely unaffected** —
  `scopedWhere` is a no-op for them.
- British English; en-GB dates/times; no glassmorphism on emergency/kiosk/muster.
- Report back honestly: what changed, test output pasted, and anything skipped.

## What Andy must do himself (can’t be done from a code snapshot)
After 01+02 are applied and 03 is run: log in as a **site coordinator** for one
site and confirm you only see that site’s data (PPM included); flip a customer
between Central and Independent and confirm user-management appears/disappears
correctly; and eyeball the dashboards with ~120 sample sites for speed.
