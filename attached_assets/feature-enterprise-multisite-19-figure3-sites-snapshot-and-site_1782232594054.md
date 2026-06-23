# Enterprise Multi-Site — Prompt 19 — Figure 3: Sites as a compliance snapshot + per-site drill-down (the big one)

**The largest of the three enhancements, and the one customers will most expect from the deck. The live Sites page (`client/src/pages/EnterpriseSites.tsx`) is currently location-management only (kiosk URLs, edit/archive) — it shows NO compliance scores and has NO drill-down. Figure 3 of the Board Investment Case shows each site with its own score and status, and customers expect to click a site and drill into all its compliance issues. Design reference: `CoWork ACS/proposal-mockups/sites.png`. The compliance data already exists via `/api/enterprise/compliance/sites`, `/alerts`, `/expiries`.**

## Part A — Turn the Sites page into a compliance snapshot
Enhance `EnterpriseSites.tsx` to match sites.png while keeping the existing management features:
- **Four stat cards** at the top: Total Sites, Fully Compliant (+% of estate), With Warnings, Critical Status — from `/api/enterprise/compliance/sites` aggregated.
- **Each site card** shows: site name, region + area manager, a prominent **compliance score** (e.g. 54 / 71 / 96, colour-coded), **status chips** (Critical / Warning / Compliant + the headline issue, e.g. "Insurance expired", "RAMS missing", "3 PPM overdue"), and footer counts: **Contractors · On site · Open issues** — all from the per-site compliance data.
- **Filters & search:** All / Compliant / Warning / Critical tabs, plus Region and Area Manager filters and a search box (name / region / postcode), and pagination — as in the deck.
- **Keep** the existing per-site kiosk URL, "View users at this site / Manage", Edit and Archive — move them into the card (e.g. a footer or an actions menu) so the card now leads with compliance but still manages the location.
- The whole card (or a "View" affordance) is **clickable → opens the site drill-down (Part B)**.

## Part B — New per-site drill-down view (the key feature)
Add a new route **`/enterprise/sites/:id`** and page **`EnterpriseSiteDetail.tsx`** showing one site's full compliance position, with tabs (matching the deck's section tabs):
- **Overview** — that site's score, category breakdown, its critical issues & upcoming expiries (reuse `/alerts` and `/expiries` filtered to this `siteId`; the per-site score from `/compliance/sites`).
- **Contractors** — contractors active at this site with insurance / RAMS / induction status.
- **Documents** — compliance documents/certificates for this site with status and expiry.
- **PPM** — planned maintenance for this site: completed vs overdue.
- **Reports** — generate a Single Site Report PDF for this site (links to the reports generator scoped to this site).
- Every issue links to the exact record/module (scoped to this site). A header shows the site name, score, and status; a back link returns to the Sites grid.
- Drive it from site-filtered compliance data; where a tab needs the underlying records, reuse the existing scoped module data for that `siteId` (the same site scoping the app already enforces) — do not bypass `siteScope`.

## Rules
- Respect role scope: an Area Manager only sees their area's sites; a Site Coordinator only their own site (the drill-down must refuse a site outside the caller's allowlist — fail closed).
- en-GB dates/times; existing colour semantics (green ≥ good, amber warning, red critical).
- Reuse existing endpoints; if `/alerts` or `/expiries` don't yet accept a `?siteId=` filter, add that filter to those endpoints (don't create parallel ones).
- Single-site (non-enterprise) customers unaffected.

## Acceptance criteria
- The Sites page matches sites.png: stat cards, per-site score + status chips + counts, filters, search, pagination — while still exposing kiosk URL / manage / edit / archive.
- Clicking a site opens `/enterprise/sites/:id` showing that site's full compliance with working Overview / Contractors / Documents / PPM / Reports tabs, every issue drilling to the record.
- An Area Manager cannot open a site outside their area (server-enforced).
- A Single Site Report PDF can be generated from the site's Reports tab.

## Do NOT
- Do not drop the location-management features (kiosk URL, edit, archive, manage users).
- Do not let the drill-down reach a site outside the caller's scope.
- Do not create a separate database per site — this is all the existing site-scoped data.
