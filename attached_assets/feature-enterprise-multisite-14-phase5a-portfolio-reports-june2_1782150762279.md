# Enterprise Multi-Site — Prompt 14 — Phase 5a: Portfolio reports (PDF)

**Phase 5 of the Enterprise Multi-Site build. Board-ready reporting across the estate. Run after Phase 3 (needs the compliance data).**

## Context
Generate PDF reports across sites. **Puppeteer is already a dependency** — reuse it for server-side HTML→PDF (do not add a new PDF library). Store generated PDFs in Google Cloud Storage (already wired). Design reference: `proposal-mockups/reports.png`.

## What to build

### 1. Report types
- **Portfolio Compliance Snapshot** — estate-wide: overall score, category breakdown, critical issues, site-by-site table.
- **Single Site Report** — full compliance position for one chosen site.
- **Contractor Compliance Report** — insurance / RAMS / induction status per contractor.
- **Expiry Forecast** — everything expiring in the next 30 / 60 / 90 days.
- **PPM Performance** — completed vs overdue by site.
- **Evacuation / Muster Log** — muster events with headcount and timings (per site — never combine sites).
- **Audit Trail Export** — timestamped action log for a date range.

### 2. Builder + API
- `POST /api/enterprise/reports` — generate (type + scope + period + format) → returns a PDF (Puppeteer), stored in GCS, with a download URL.
- `GET /api/enterprise/reports` — history.
- Report **respects the caller’s role scope** — an area_manager can only generate for their area, a site_coordinator for their site.
- A “Generate Report” / “PDF Report” action on the dashboard (prompt 11) wires to this.

### 3. UI
- Report builder per `reports.png`: report-type list, scope/period/format controls, live preview panel, and a recent-reports history with download links.

## Rules
- Reuse Puppeteer; render branded (ACS blue) PDFs.
- Scope-aware and audited (who generated what, when).
- en-GB dates; muster reports strictly per-site.

## Acceptance criteria
- A Portfolio Compliance Snapshot PDF generates in under 30s for a full 120+ site estate and matches the dashboard figures.
- Each report type produces a correct, branded PDF stored in GCS with a working download link.
- Scope is enforced (area_manager can’t generate an estate report).

## Do NOT
- Do not add a new PDF dependency (Puppeteer exists).
- Do not produce a cross-site muster log.
