# Feature — Enterprise demo dataset: seed a believable multi-site estate + a TOTALLY-CLEAN one-click removal

**Goal: make the enterprise demo *sell itself* with realistic data, and let you wipe every trace of it the moment a customer says yes — so the account is pristine for real use. Two actions: "Load Enterprise Demo" and "Reset — Remove All Demo Data". Test/enterprise customers only. Single-site customers unaffected. NEEDS `npm run db:push` (an `is_demo` flag on the seeded tables).**

## Why
Current demo data undersells the product: 3 sites all scoring ~100 (an all-green estate proves nothing), contractor pool all "4 docs missing", Group Standards empty, no Area Manager. A demo needs a believable *operating estate with real problems to find*.

## PART 1 — "Load Enterprise Demo" (one action, on the enterprise admin's Sites or a Settings/demo control)
Seed, all flagged `is_demo = true`:
1. **~10–12 sites** with realistic **property** names and regions (e.g. Glasgow Royal Infirmary, Edinburgh HQ, Aberdeen Retail Park, Perth Retail Centre, Stirling Office Park, Inverness Business Park, Dundee Waterfront, Falkirk Distribution Hub, Ayr Seafront Offices, Dumfries Trade Estate) across 4–6 regions — NOT company names.
2. **A realistic compliance SPREAD** — drive the scores with real underlying records so the engine computes them: a couple of **Critical** sites (expired contractor insurance with active bookings; RAMS missing with works imminent; FRA review >12 months overdue; 3+ PPM overdue), a few **Warning** sites (items expiring within 30 days), the rest **Compliant**. Aim for a spread like 54 / 71 / 88 / 91 / 96 / 100, not all-green.
3. **The 3-tier hierarchy**: 1–2 enterprise admins, **1–2 area managers** (each over a region), several site coordinators — so People & Access shows all three tiers populated.
4. **Group Standards**: a few visit reasons + an induction defined at group level (so the "set once, all sites inherit" story is visible, not empty).
5. **Contractor Pool**: contractors with a **MIX** — some fully cleared (green), some part-cleared, a couple genuinely missing docs — and per-site clearance recorded so you can show "cleared at Edinburgh & Perth, missing at Glasgow".
6. Supporting records that make the dashboards live: visitors/contractors on site, a few PPM work orders (some overdue), certificates (some expiring), an incident or two — enough that the Compliance Overview's critical-issues feed and 30-day expiries are populated and ranked worst-first.

## PART 2 — "Reset — Remove All Demo Data" (totally clean for go-live)
A clear, confirmed action that removes **every** `is_demo = true` record across **all** sites and modules, leaving the account pristine (back to a single default Primary Site, no demo sites/users/roles/standards/contractors/records):
- Delete in FK-safe order across every seeded table (sites, site_user_roles for demo users, demo users/logins, group standards, contractor pool + per-site clearances, and all the supporting module records — PPM, certs, RAMS, incidents, FRA, etc.).
- **Delete ONLY `is_demo = true` rows — never real data.**
- **End with a verification pass** (Andy's requirement): confirm **zero** `is_demo` rows remain in **every** table, and the enterprise dashboards/counts all read clean. Return `{ cleared: true, remaining: { sites:0, users:0, standards:0, contractors:0, ppm:0, certs:0, … } }`. If anything remains, report it — never claim clean when it isn't.
- After reset, the customer can start entering their real estate with zero demo residue.

## Rules
- `is_demo` flag added to every seeded table via the migration runner; seeder sets true; everything created by real users stays false.
- Load/Reset are **symmetric** — what Load creates, Reset removes (no orphans).
- All seeded data is correctly **site-scoped** (`withSiteId`) so it behaves like real multi-site data and respects the isolation work.
- Single-site (non-enterprise) customers: unaffected; this is an enterprise-only control.
- en-GB dates throughout the seeded data.

## Acceptance criteria
- "Load Enterprise Demo" produces a ~10-site estate with a realistic compliance spread (critical/warning/compliant), populated People & Access (all 3 tiers), seeded Group Standards, and a mixed Contractor Pool — every enterprise screen looks like a live, real estate.
- "Reset — Remove All Demo Data" leaves the account totally clean (verified: 0 `is_demo` rows everywhere, dashboards empty/default), with real data untouched.
- Load → Reset → Load again works repeatably with no residue or duplicates.
- The seeded data is site-scoped and isolation tests still pass.

## Do NOT
- Do not seed all-green or all-red data (it must be a believable spread).
- Do not delete any non-demo data on Reset.
- Do not report "clean" without the verification pass confirming every table is clear.
