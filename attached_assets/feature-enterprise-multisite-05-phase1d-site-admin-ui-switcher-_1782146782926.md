# Enterprise Multi-Site — Prompt 05 — Phase 1d: Site admin UI + site switcher

**Phase 1 of the Enterprise Multi-Site build. Run only after the prompt 04 isolation tests pass. This is the user-facing layer for managing and moving between sites.**

## Context
Sites now exist (prompt 02) and data is scoped to them (prompt 03). This prompt gives enterprise admins a way to create/manage sites and lets multi-site users switch which site they are working in. Build with the existing React + Radix/Tailwind component library and React Query, matching the app’s current style. **Hidden entirely for non-enterprise customers.**

## What to build

### 1. Sites management screen (enterprise admin only)
- New page under an `/enterprise` route group, nav item only visible when the customer `is_enterprise`.
- Visual reference: `proposal-mockups/sites.png` — card grid, per-site status chip, filters (status / region / area), search, pagination, “+ Add New Site”.
- For this prompt, cards show name, reference, region, area, status, and counts (contractors/visitors on site) — the per-site **compliance score** comes later in Phase 3, so leave a placeholder or omit the score for now.
- **Add / edit site** form: name, reference (auto-suggest next SITE-00X), address, postcode, region, area (select from `areas`, with the ability to create an area inline), status.
- **Archive** a site (soft — sets `status='archived'`, `archived_at`), never hard-delete. Archived sites are hidden by default and excluded from active operations but keep their historical data.
- Write an audit entry on site create / edit / archive.

### 2. Site switcher (for any user with access to more than one site)
- A compact switcher in the top bar showing the **active site name**; clicking opens a searchable list of the sites the user may access (`allowedSiteIds`).
- Selecting a site updates the active site context (session) used by the prompt 03 scoping, and refetches the current page’s data for that site.
- Users with access to only one site (i.e. all non-enterprise users) see **no switcher** — just behave as today.

### 3. CRUD API for sites & areas
- `GET/POST/PATCH /api/enterprise/sites`, `GET /api/enterprise/sites/:id`, archive via PATCH.
- `GET/POST/PATCH /api/enterprise/areas`.
- All behind auth; for now gate writes to the customer’s admins (full role model arrives in prompt 07).
- Setting the active site: an endpoint to record the chosen `activeSiteId` in the session, validated against the user’s `allowedSiteIds`.

## Rules
- Non-enterprise customers: no sites nav, no switcher, no behaviour change.
- en-GB dates/times. No glassmorphism on any emergency/kiosk/muster surfaces (the switcher must not appear on the no-login Fire Marshal muster page).
- A user can never switch to a site outside their `allowedSiteIds` (validate server-side, not just hide in UI).

## Acceptance criteria
- An enterprise admin can create 3+ sites, edit and archive them, and see them in the grid.
- Switching site changes what every site-scoped page shows (visitors, contractors, etc.), consistent with prompt 03.
- A non-enterprise customer sees exactly the current UI with no sites/switcher.
- Site create/edit/archive appear in the audit log.

## Do NOT
- Do not show compliance scores yet (Phase 3).
- Do not allow hard-deletion of a site.
- Do not expose the switcher on emergency/kiosk/muster screens.
