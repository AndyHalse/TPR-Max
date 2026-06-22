# Enterprise Multi-Site — FIX 01 — Muster/Evacuation per-site scoping (CRITICAL, life-safety)

**🔴 RUN THIS BEFORE ANY ENTERPRISE DEMO. This is a life-safety data leak in the evacuation muster for enterprise (multi-site) customers.**

## The problem (confirmed in the code)
The site-scoping guard (`server/siteScope.ts`) was added and wired into ~14 routes, but **`server/routes/emergency.ts` (the muster/evacuation module) was missed.** It still reads people and zones across the whole customer with no `site_id` filter, for example:
- `server/routes/emergency.ts:202` — `custDb.select().from(evacuationZones)` returns **every zone at every site**.
- `server/routes/emergency.ts:154` and `:423` — `.from(members)` returns **every member at every site**.
- Muster points, `evacuation_accountability`, `safety_tokens`, visitors/staff/contractors in the muster are not site-filtered.

**Effect for an enterprise customer:** a live evacuation at Site A would show (or fail to account for) people from Sites B, C, D… This breaks roll-call accuracy and is exactly the danger the spec flagged: *a muster must be strictly per-site and must never combine sites.*

For single-site (non-enterprise) customers there is one default site, so today it happens to look fine — but the code is wrong and unsafe the moment a customer becomes multi-site.

## What to fix
1. **Scope every read and write in `server/routes/emergency.ts` to the active site** using the existing `siteScope.ts` helpers (`scopedWhere` for reads, `withSiteId` for writes) — the same pattern already used in `visitors.ts`, `staff.ts`, `contractors.ts`. This covers: `members`, `staff`, `visitors`, `contractor_visits`, `muster_points`, `evacuation_zones`, `evacuation_accountability`, `safety_tokens`, and any other site-scoped table the muster flow touches.
2. **A live evacuation/muster belongs to one site.** When an evacuation is activated, bind it to the activating site, and the roll-call, zones, "mark safe", missing-person list, CSV export and Fire Marshal view must show **only that site's people**. Never aggregate sites on a live muster.
3. **Public Fire Marshal muster URL + self-mark-safe tokens** must resolve to the bound site (link carries/derives the `site_id`), so the no-login muster page shows only the correct site. (Ties in with the kiosk/public-link binding from prompt 06.)
4. **PEEP / assistance flagging** must still work, scoped to the site.

## Rules
- **Fail closed:** if an enterprise muster has no resolvable site, do not silently show all sites — surface the correct active site or refuse.
- Non-enterprise customers must behave exactly as before (single default site → identical output).
- No glassmorphism on the muster/Fire Marshal screens (existing rule). en-GB times, Europe/London.

## How to verify (do all three — this is life-safety)
1. Create an enterprise test customer with **two sites**, each with its own staff/visitors/contractors and zones.
2. Activate an evacuation at **Site A**. Confirm the roll-call, zones, missing list, CSV export and Fire Marshal page show **only Site A people** — zero Site B people appear.
3. Repeat for Site B. Confirm full separation both ways.
4. Confirm a single-site customer's muster is unchanged.

## Acceptance criteria
- A live muster shows only the evacuating site's people, in every view (roll-call, zones, mark-safe, missing, CSV, Fire Marshal URL).
- No code path in `emergency.ts` reads a site-scoped table without the site filter.
- Single-site customers unaffected.

## Do NOT
- Do not combine sites on any live muster, roll-call, or export.
- Do not rely on the existing isolation test passing as proof — it tests the helper, not this route. Verify the muster behaviour directly (steps above). FIX-02 hardens the test.
