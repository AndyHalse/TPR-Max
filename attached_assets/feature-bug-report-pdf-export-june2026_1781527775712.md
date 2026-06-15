# FEATURE — "Download PDF" for a bug report (full package incl. all screenshots)

Add a **Download PDF** button to the bug-report detail view in Platform Admin. The PDF must bundle every piece of a report — text details, logs, breadcrumbs, error ID, app version, AND all screenshots with their captions — into one file a developer can read top-to-bottom, or drop straight into Claude to understand and fix the issue.

This is an enhancement, not a UAT defect fix.

## Current state (for context — read before changing anything)
- Admin detail view: `client/src/pages/PlatformAdminBugReports.tsx`.
  - Already has a **"Copy all"** button that assembles a plain-TEXT block (`copyText` array, ~lines 61–79): report number, reporter, customer, page, browser, screen, app version, error ref, status, description, console/network logs, breadcrumbs, attachments header. It does **not** include the images.
  - Already builds an `allImages` array (~line 168): the auto-screenshot (labelled "Auto-screenshot") plus each attachment, using `a.caption || \`Attachment ${i + 1}\`` as the label.
  - `BugReportDetail` includes: `description`, `pageUrl`, `browserInfo`, `screenSize`, `consoleErrors`, `screenshot` (full-res data URL), `attachments: Array<{ dataUrl, caption }>`, `errorId`, `breadcrumbs`, `appVersion`, `reporterName/Email`, `customerName`, `reportNumber`, `createdAt`, `status`.
- Reporter side (`client/src/components/ReportProblemButton.tsx`) already captures per-attachment captions (optional `Input`, max 200 chars) and sends them. **Captions already flow end-to-end** (capture → store → display) — do NOT rebuild that. The PDF just needs to USE them.

> Generate the PDF **client-side** (the detail view already holds all data + full-res images). Use a lightweight library already common in the stack — prefer **jsPDF** (add it if not present). Nothing should be sent to the server; the file is built in the browser and saved locally.

---

## 1. Add the "Download PDF" button
- Place it next to the existing "Copy all" button in the detail dialog header.
- On click, generate and download a PDF named: `\`${reportNumber}-${slugifiedPageName}.pdf\`` — e.g. `BR-007-compliance-dashboard.pdf` (derive the slug from `pageUrl`; fall back to `bug-report` if empty).
- Keep "Copy all" as-is — it's the fast text-only paste for Claude chat. The PDF is the full package.

## 2. PDF contents and layout (in this order)
**Page 1 — the summary (text):**
- Title: `TPR Bug Report ${reportNumber}` + the created date/time (en-GB format).
- A clearly readable details block: Reporter (name + email), Customer, Page URL, Browser, Screen size, **App Version**, **Error Ref** (if present — put it near the top, it's the fastest route to the matching server log), Status.
- Heading **Description** + the full description text (wrap long lines; flow onto extra pages if needed).
- Heading **Console / Network Logs** + the `consoleErrors` text in a monospace style (wrap/flow as needed). Skip the heading if empty.
- Heading **Breadcrumbs (last actions)** + the `breadcrumbs` text. Skip if empty.

**Following pages — the images:**
- One image per page (auto-screenshot first, then each attachment in order).
- Above each image, print its **caption** as a heading: use the user's caption, falling back to "Auto-screenshot" for the main shot and "Attachment N" only when the caption is blank (mirror the existing `allImages` labelling).
- Scale each image to fit the page width (and height) while preserving aspect ratio — never stretch or crop. Add a small margin.

## 3. Make captions pull their weight (small extra, optional but recommended)
**Why:** captions are the single most useful clue for a developer/Claude, but today they're optional and easy to skip — which is why real reports (e.g. BR-007) show generic "Attachment 1/2". The plumbing is fine; the prompt is the problem.
- In `ReportProblemButton.tsx`, make the caption field a touch more inviting: change the `Label`/hint so it reads like a question, e.g. *"What does this image show?"* as the placeholder, and a one-line helper under the attachments list: *"A quick caption on each image helps us fix it faster."*
- Do NOT make captions mandatory — keep them optional. Just nudge.

## Acceptance criteria
- From a bug report's detail view, clicking **Download PDF** produces a single PDF that opens cleanly and contains: all the text details (incl. error ref + app version), the console/network logs, the breadcrumbs, and **every** screenshot — auto-screenshot plus all attachments — each on its own page under its caption.
- A report whose attachments have user captions shows those captions as the image headings in the PDF (not "Attachment 1/2").
- Filename is `BR-XXX-<page>.pdf`.
- The PDF is generated entirely in the browser; no new server endpoint, nothing uploaded.
- "Copy all" still works unchanged.

## Notes
- No schema changes needed — all fields already exist on `bug_reports`.
- If jsPDF isn't already a dependency, add it (client-only). Keep the bundle impact small — import it dynamically inside the download handler (like `html2canvas` is dynamically imported in `ReportProblemButton.tsx`) so it isn't loaded until used.
- Large data-URL images: scale sensibly so the PDF doesn't become huge; the stored attachments are already capped at 4MB each.
