# FINAL — Extend the route-isolation test to EVERY module (the proof net)

**This is the keystone. Across the site-scoping work the code fixes landed but the test cases were repeatedly skipped — so the fixes are unproven and can silently regress. This prompt's ONLY job is the test. Do NOT change feature code. Test/dev only. Treat "the test only calls helpers" or "I added a couple" as FAILURE — it must drive real `/api` routes for every module and be able to fail.**

## What exists
`tests/site-isolation.routes.test.ts` drives real routes (supertest, Site-A vs Site-B sessions via `/api/__test__/session` + `/api/enterprise/active-site`) with an `expectIsolated` helper. It currently covers only a handful of features. Extend it — do not rewrite it.

## Add a real-route isolation case for EVERY site-scoped module
For each module below, add: (a) a **list** case — create at Site A and Site B via the real endpoint, assert each site's list excludes the other's record; and (b) a **by-id** case — assert a Site-A session gets 404 (not the record) for a Site-B record's id on a representative `:id` endpoint. Read each route file for the exact path + request body.

Modules (all must be present):
- visitors, staff, **contractors** (per-site records: visits/clearances — NOT estate-wide companies), **muster/evacuation** (roll-call shows only the active site), **RAMS**, **passes/pre-bookings**, induction (admin tokens), **PPM** (assets, schedules, work orders), **permit-to-work** (`/api/ptw/:id`), **reports** (a generated report contains only the active site), **auditEngine**, **loneWorker**, **complianceCertificates**, **cdm**, **hsIncidents**, **fireRiskAssessment**, **meetingRooms** (rooms + bookings), **raBuilder**, **helpdesk**.

## Prove it bites (mandatory)
Temporarily remove the site filter from ONE route (e.g. the PTW `:id` lookup or the hsIncidents list), run the suite, confirm THAT module's test goes RED, then restore. Put the before/after in the report. A suite that can't fail is worthless.

## Report back
- The full list of `/api` endpoints the suite now hits (must include every module above).
- The proof-it-bites result (which route broken → red → restored).
- Final pass/fail of `npm run test:site-isolation-routes`.
- One-line verdict: **does the test now prove site isolation across every module — yes or no?**

## Rules / acceptance
- Real authenticated HTTP requests to `/api` routes only — no helper-only shortcuts.
- Do NOT test estate-wide contractor companies for isolation (shared by design).
- Suite exits non-zero on any breach. Do not weaken an assertion to go green — red = a real leak; report it.
- No feature-code changes in this prompt.
