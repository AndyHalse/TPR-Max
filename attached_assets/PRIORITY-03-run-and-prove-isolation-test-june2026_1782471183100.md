# PRIORITY 03 🟢 — Run the site-isolation test, and PROVE it actually catches leaks

**Do this LAST — after PRIORITY-01 (PPM) and PRIORITY-02 (Central/Independent)
are applied.** This is the proof step: it confirms the site wall holds before any
multi-site customer (Cowiesburn) is let near it.
**Needs `npm run db:push`?** NO (01 already ran it).

---

## Why this matters
The wall between sites is enforced in **software** (`server/siteScope.ts`), not by
separate databases. Software walls are only trustworthy if proven — and a test
that can’t fail proves nothing. So this task is two things: (1) run the test and
report honestly, and (2) deliberately break a wall to show the test goes red,
then restore it.

The test is `tests/site-isolation.routes.test.ts`, run via
`npm run test:site-isolation-routes`. It must drive **real `/api` routes** with
supertest as a Site-A user vs a Site-B user — not just call the helper functions.

## Tasks

### 1. Run it and report
- Run `npm run test:site-isolation-routes`.
- Paste the full output. State plainly: how many tests, how many passed/failed,
  and name any failures with the route involved.
- If anything fails, fix the **route** (route it through `getScopedDb` /
  `scopedWhere` / `withSiteId`), not the test, and re-run until green.

### 2. Prove the test can BITE (the important bit)
- Pick one historically-sensitive route the test covers (e.g. the muster/
  evacuation list, or contractor records, or — now — a PPM list).
- **Temporarily** remove its `scopedWhere(...)` (un-wall it) and re-run the test.
- Confirm the corresponding test **fails** (goes red) because Site B can now see
  Site A’s data. Paste that red output.
- **Restore** the `scopedWhere(...)` and re-run → green again.
- Report this as: “broke X → test N went red → restored → green”. If breaking a
  wall does NOT turn a test red, the test is not really driving that route — fix
  the test so it does, then repeat.

### 3. Confirm coverage is complete
Verify the suite covers, via **real routes**, every site-scoped area — and call
out any that are missing so they can be added:
- visitors, staff, members, departments
- muster / evacuation (life-safety — must be per-site)
- contractors (per-site records; companies are intentionally estate-wide)
- RAMS, passes, induction admin tokens, audits, permits
- **PPM** — assets, work orders, schedules, demo load/delete (added in 01)
- **Management-style gating** — Central blocks site-coordinator user management,
  Independent allows it for their own site only (added in 02)
For each, the assertion must be “Site B cannot see / act on Site A’s data, and
cross-site by-id access is refused”.

### 4. Final verdict
End your report with a clear yes/no: **is the multi-site site wall proven to hold
across every covered route, and does the test demonstrably catch a deliberate
leak?** List anything still uncovered. No hedging.

## Acceptance criteria
- `npm run test:site-isolation-routes` is green.
- A deliberate un-walling of at least one route was shown to turn the suite red,
  then restored to green (evidence pasted).
- PPM and management-style cases are present and passing.
- A written statement of any site-scoped route not yet covered by a real-route
  test.

## What Andy does after this
With the suite green and proven-to-bite, do a human click-through on a 2-site
test customer: log in as a site-coordinator and confirm you see only your own
site (visitors, contractors, PPM, muster); confirm Central vs Independent
behaves as expected; and load ~120 sample sites to sanity-check dashboard speed.
Only then is it safe to put multi-site in front of Cowiesburn.
