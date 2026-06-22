# Enterprise Multi-Site — Prompt 04 — Phase 1c: Isolation tests (THE GATE)

**Phase 1 of the Enterprise Multi-Site build. This proves the site wall holds. ⛔ Phases 2–5 must NOT start until these tests pass.**

## Context
`isolation-test-script.ts` at the repo root already tests cross-**customer** isolation (it imports `CustomerDatabaseService`, `AuthService`, `isolatedSchema`, and flags `isolationBreach`). Extend it (or add `site-isolation-test-script.ts` alongside it, same style) to test cross-**site** isolation inside one enterprise customer.

## What to build

1. **Test fixture:** one enterprise test customer with **two sites** (Site A, Site B) and a user whose active site can be switched.

2. **Cross-site read tests — every site-scoped table** (the list from prompt 02). For each table:
   - Create a record at Site A and a record at Site B (through the scoped helper from prompt 03).
   - With active site = A, list the table → must return only the Site A record. Seeing the Site B record = **FAIL (isolationBreach = true)**.
   - Repeat with active site = B.

3. **Cross-site write tests:**
   - With active site = A, attempt to update/delete a Site B record by id → must be refused or scoped out (no effect). Success = FAIL.
   - Confirm a create while in Site A always stamps `site_id = A` (never NULL, never B).

4. **Fail-closed test:** an enterprise request/context with no active site must be rejected, not served all sites.

5. **Non-enterprise regression test:** a single-site (non-enterprise) customer returns all its data normally (the scoping is a no-op). This guards against the change breaking ordinary customers.

6. **Reporting:** print a clear pass/fail summary per table; exit non-zero if any breach is detected so it can gate CI / a merge.

## Rules
- Credentials and connection details from environment variables only — never hardcoded (match the existing script’s security note).
- Run only against test/dev customers, never live data.
- The script must be runnable with a single command (add an npm script, e.g. `npm run test:site-isolation`).

## Acceptance criteria
- The script runs and reports per-table results.
- With the prompt 03 implementation correct, **all cross-site read/write tests pass** and the script exits 0.
- Deliberately removing the scope filter on one table makes that table’s test FAIL and the script exit non-zero (proves the test actually catches breaches).
- The non-enterprise regression test passes.

## ⛔ GATE
Do not proceed to prompt 07 (Phase 2) until this script passes cleanly. If any table breaches, fix prompt 03’s scoping for that table first.

## Do NOT
- Do not relax a test to make it pass. If a test fails, the scoping is wrong — fix the code, not the test.
