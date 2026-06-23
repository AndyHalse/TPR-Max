# Enterprise Multi-Site — Prompt 20 — Figure 4: Reports as a dashboard with live preview, recent & scheduled

**Enhances the existing Portfolio Reports page (`client/src/pages/EnterpriseReports.tsx`) to match Figure 4 of the Board Investment Case. Design reference: `CoWork ACS/proposal-mockups/reports.png`. Backend exists: `POST /api/enterprise/reports` (generate), `GET /api/enterprise/reports` (recent list), `GET /api/enterprise/reports/:id/download` (PDF), plus the scheduled-reports endpoints from Phase 5b.**

## Context
The live page has the report-type list, a Generate/Scheduled tab, the selected report's description, and a Generate button — but "No reports generated yet", no **live preview**, and it doesn't read as the dashboard the deck shows. Figure 4 shows a builder + a **report preview** + **recent reports** + **scheduled reports** all on one screen.

## What to build (match reports.png)

### 1. Report Builder (top)
Keep the report-type list (Portfolio Compliance Snapshot, Single Site, Contractor Compliance, Expiry Forecast, PPM Performance, Evacuation/Muster Log, Audit Trail Export). Add the **Scope / Period / Format** controls and the **Generate PDF Report** button inline, as in the deck.

### 2. Live Report Preview (centre — the main missing piece)
When a report type + scope is selected, show a **preview of the report content before generating** — e.g. for the Portfolio Compliance Snapshot: Overall Score, Critical Issues, Expiring (30 days), Compliant Sites, and the category table (Insurance / RAMS / PPM / Fire Risk with Current / Expiring / Lapsed columns), branded "TPR MAX". Source the preview from the existing compliance data (`/api/enterprise/compliance/summary` + `/sites`) so it matches what the generated PDF will contain. Show a sensible preview for each report type (or a clear "preview not available for this type, generate to view").

### 3. Recent Reports (bottom-left)
Populate from `GET /api/enterprise/reports`: report name, generated date, by whom, and a **PDF download link** (`/api/enterprise/reports/:id/download`). Show an empty state only when there genuinely are none.

### 4. Scheduled Reports (bottom-right)
List the schedules with **on/off toggles** and their cadence/recipients, per the deck's defaults: **Weekly Portfolio Snapshot** (Mon 08:00), **Monthly Board Pack** (1st of month), **Expiry Forecast – 30 days** (Fri), **Critical Issues Digest** (daily, when critical issues exist). Wire toggles + add/edit to the Phase 5b scheduled-reports endpoints. Respect the role matrix (Enterprise Admin manages all; Area Manager their area; Site Coordinator can't schedule).

### 5. Layout
Make it read as a dashboard: builder + preview prominent, recent and scheduled side-by-side beneath — matching reports.png, not a single narrow column.

## Rules
- Reports respect the caller's role scope (an Area Manager generates/sees only their area).
- Reuse the existing Puppeteer PDF generation and GCS storage — no new PDF tooling.
- en-GB dates/times; brand colours (ACS blue, green/amber/red).

## Acceptance criteria
- Selecting a report type shows a live preview of its content that matches the generated PDF.
- Generating produces a PDF; it then appears in Recent Reports with a working download link.
- Scheduled reports show with working toggles and the four defaults; scope/role respected.
- The page matches reports.png's dashboard layout.

## Do NOT
- Do not add a new PDF library (Puppeteer already exists).
- Do not show reports/schedules outside the caller's scope.
