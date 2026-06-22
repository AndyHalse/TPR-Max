# Enterprise Multi-Site — Prompt 11 — Phase 3c: Compliance Intelligence Dashboard (UI)

**Phase 3 of the Enterprise Multi-Site build. THE demo screen — the cross-site compliance dashboard. Run after prompt 10. This is the milestone to show Cowiesburn and other multi-site prospects.**

## Context
Endpoints from prompt 10 are live. Build the Overview screen exactly to the design reference. React + Radix/Tailwind + React Query, matching the app.

## Design reference
`proposal-mockups/overview.png` — match the layout, hierarchy, and colour semantics: green `#22a06b` (good), amber `#e8a000` (warning), red `#e84040` (critical), on ACS blue `#2460A9`.

## What to build
Overview screen under `/enterprise` with:
- **Overall compliance score** ring (estate or scoped to the user’s area/site) with the “+/- this month” delta from the trend data.
- **By-category bars** (the 7 categories) with per-category percentages.
- **Headline stat cards:** Critical Issues, Expiring in 30 days, Sites Fully Compliant, Active Contractors.
- **Critical Issues & Warnings feed** — ranked worst-first, each with the site, the problem, a status chip (EXPIRED / MISSING / OVERDUE / days-left), and a link through to the exact record/module. Acknowledge action inline.
- **Upcoming Expiries** (next 30 days) list.
- **Site-by-Site Compliance Breakdown** table — site, score, per-category status, overall status chip. Rows link to that site.
- Data from `/summary`, `/alerts`, `/expiries`, `/compliance/sites`, `/trend`. Poll or refetch on focus; 60s cache acceptable.
- **PDF Report** button in the header (wired in Phase 5; can be present but disabled until then).

## Rules
- Respect the signed-in user’s scope: an area_manager’s dashboard shows their area; a site_coordinator’s shows their site. Don’t show estate figures to someone not entitled.
- en-GB dates/times (DD/MM/YYYY, 24-hour). **No glassmorphism.**
- Empty/zero states handled gracefully (a brand-new site with no data shouldn’t read as “100% compliant” misleadingly — show “no data yet”).

## Acceptance criteria
- The screen matches `overview.png` in layout and colour semantics.
- Numbers match the engine/APIs; the score updates after the daily job / an event change.
- Loads in under 2 seconds with a seeded 120+ site / 50k item dataset.
- Scope is correct for each role.
- Links jump to the underlying record/module.

## Do NOT
- Do not compute scores in the client — render what the APIs return.
- Do not show misleading 100% for empty categories.
