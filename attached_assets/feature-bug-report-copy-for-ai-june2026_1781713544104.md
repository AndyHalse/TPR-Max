# Feature — "Copy for AI" button on Platform Admin bug reports

## Goal
Add a one-click **"Copy for AI"** button to the bug-report detail view in Platform
Admin that copies a single, structured, ready-to-paste prompt for an AI coding
assistant (Claude Code / Replit). It must turn the report from a *human report*
into an *AI task* — with a clear instruction, all diagnostic data, the **likely
source file** for the page, and a clean reproduction trail.

Leave the existing **"Copy all"** and **"Download PDF"** buttons exactly as they
are. This is a third, additional button next to them.

## Where
File: `client/src/pages/PlatformAdminBugReports.tsx`
- The button toolbar lives in the dialog header, around line 472–495 (next to
  `Copy all` / `Download PDF`).
- The existing human-format builder is `buildCopyText(detail)` at line 67. Do
  **not** modify it. Add a new sibling builder `buildAiPromptText(detail)`.

## What the new button does
1. Builds an AI-oriented prompt via a new `buildAiPromptText(detail)` function.
2. Copies it to the clipboard (`navigator.clipboard.writeText`), same pattern as
   the existing `handleCopyAll` (line 187).
3. Shows the existing success toast ("Copied to clipboard" or similar).
4. Button label: **"Copy for AI"** with an existing lucide icon (e.g. `Sparkles`
   or `Bot` — whichever is already imported or easy to add). Tooltip:
   "Copy as a ready-to-paste prompt for Claude Code / Replit".

## The prompt format `buildAiPromptText` must produce

```
You are fixing a bug in the TPR Max codebase (React + TypeScript front end in
client/src, Express + TypeScript API in server/). Use the report below to find
the root cause and propose a fix. Do not guess — read the named source file
first, and ask for the screenshots if you need them.

# Bug {reportNumber}
- Reported: {createdAt, en-GB}
- Status: {status label}
- Reporter: {reporterName} <{reporterEmail}>
- Customer / tenant: {customerName || customerId}
- App version: {appVersion}
- Error ref: {errorId}            (omit line if none)
- Browser: {browserInfo}
- Screen: {screenSize}

## Where it happened
- Route (URL path): {pageUrl}
- Likely source file: {mapped file path, see ROUTE MAP below}
  (If the route is dynamic or unknown, say "Unknown — search client/src/pages".)

## What the user reported
{description}

## Console / network logs at the time
{consoleErrors, or "None captured."}

## What the user did just before (most recent last)
{breadcrumbs, or "No breadcrumb trail captured."}

## Reporter's reopen note          (whole section omitted if none)
{reopenReason}

## Screenshots
{N} image(s) were attached but are NOT included in this text. They are visible
in Platform Admin and in the report PDF (use the "Download PDF" button). Ask the
user to paste them if the cause isn't clear from the data above.

## Your task
1. Read the likely source file and trace the code path the user hit.
2. Identify the root cause.
3. Propose the smallest correct fix, and call out any tenant-isolation,
   permissions, or input-validation concerns you notice while there.
```

Notes on the fields:
- Use **en-GB** date formatting (`toLocaleString('en-GB')`) — consistent with the
  rest of TPR.
- Omit the `Error ref`, `Reopen note` section, and tidy empty sections rather
  than printing "—" / "undefined".
- `{N}` = `(detail.screenshot ? 1 : 0) + (detail.attachments?.length ?? 0)`, same
  as `buildCopyText`. If 0, print "No screenshots were attached."

## ROUTE MAP — route → likely source file
Add a small static lookup (a plain `Record<string, string>`) near the top of the
file. Derived from `client/src/App.tsx`. Match `detail.pageUrl` against it. For
dynamic routes (e.g. `/contractors/:id`), match by the leading segment and note
the param. If no match, output the "Unknown — search client/src/pages" fallback.

```ts
const ROUTE_TO_FILE: Record<string, string> = {
  "/": "client/src/pages/Dashboard.tsx",
  "/staff": "client/src/pages/StaffManagement.tsx",
  "/visitors": "client/src/pages/Visitors.tsx",
  "/members": "client/src/pages/Members.tsx",
  "/contractors": "client/src/pages/ContractorManagement.tsx",
  "/contractors/legacy": "client/src/pages/Contractors.tsx",
  "/contractor-portal-admin": "client/src/pages/ContractorPortalAdmin.tsx",
  "/checkin": "client/src/pages/VisitorCheckIn.tsx",
  "/muster": "client/src/pages/EmergencyMuster.tsx",
  "/incident-reports": "client/src/pages/IncidentReports.tsx",
  "/ppm": "client/src/pages/PPM.tsx",
  "/audits": "client/src/pages/Audits.tsx",
  "/helpdesk": "client/src/pages/Helpdesk.tsx",
  "/martyn-law": "client/src/pages/MartynLaw.tsx",
  "/fire-marshal-panel": "client/src/pages/FireMarshalPanel.tsx",
  "/fire-marshal-mobile": "client/src/pages/FireMarshalMobile.tsx",
  "/reports": "client/src/pages/Reports.tsx",
  "/time-attendance": "client/src/pages/TimeAttendance.tsx",
  "/settings": "client/src/pages/Settings.tsx",
  "/settings/ai": "client/src/pages/SettingsAi.tsx",
  "/induction-settings": "client/src/pages/InductionSettings.tsx",
  "/email-outbox": "client/src/pages/EmailOutbox.tsx",
  "/meeting-rooms": "client/src/pages/MeetingRooms.tsx",
  "/billing": "client/src/pages/Billing.tsx",
  "/profile": "client/src/pages/Profile.tsx",
  "/hs-incidents": "client/src/pages/HSIncidents.tsx",
  "/fire-risk-assessment": "client/src/pages/FireRiskAssessment.tsx",
  "/compliance-certificates": "client/src/pages/ComplianceCertificates.tsx",
  "/compliance-dashboard": "client/src/pages/ComplianceDashboard.tsx",
  "/permit-to-work": "client/src/pages/PermitToWork.tsx",
  "/ra-builder": "client/src/pages/RaBuilder.tsx",
  "/template-library": "client/src/pages/TemplateLibrary.tsx",
  "/hr": "client/src/pages/Hr.tsx",
};
```

IMPORTANT: the file names above are derived from the route table but a few page
component import paths may differ. Before finalising, **verify each path against
the actual `import` statements in `client/src/App.tsx`** and correct any that
don't match. If a route has no obvious page file, drop it from the map rather
than guessing — the fallback text handles misses safely. Add a matcher for the
dynamic `"/contractors/:id"` → `ContractorDetails.tsx` and `"/hr/staff/:id"` →
the HR staff detail page, matching on the leading path segment.

## Acceptance criteria
- New "Copy for AI" button appears next to "Copy all" / "Download PDF", same
  styling (`variant="outline" size="sm"`).
- Clicking it copies the structured prompt above and shows a success toast.
- Existing "Copy all" and "Download PDF" behave exactly as before.
- Dates are en-GB. Empty/absent fields are omitted cleanly (no "undefined" / "—").
- For a known route the prompt names the correct source file; for an unknown
  route it prints the safe fallback.
- `npm run check` passes (no TypeScript errors). No DB changes, no `db:push`.

## Out of scope (do NOT build)
- No live in-dashboard AI chat or API calls to Claude/Replit.
- No backend changes, no new captured fields, no schema changes.
- No change to how bugs are submitted (`ReportProblemButton.tsx`).
