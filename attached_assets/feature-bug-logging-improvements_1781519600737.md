# FEATURE — Improve the "Report a Problem" bug logging

Three improvements to the existing bug-reporting feature, requested by Andy. This is an enhancement, not a UAT defect fix.

## Current state (for context)
- `client/src/components/ReportProblemButton.tsx` captures ONE auto-screenshot of the current viewport (html2canvas), plus `pageUrl`, `browserInfo`, `screenSize`, and recent uncaught errors via `client/src/lib/errorBuffer.ts`.
- `errorBuffer.ts` only listens to `window` `error` and `unhandledrejection` events (last 10). It does NOT capture `console.error`/`console.warn` or failed network requests.
- Server: `server/routes/bugReports.ts` stores a single `screenshot` (data:image, ≤4MB) and `consoleErrors` text. Schema `bug_reports` (in `shared/schema.ts` ~line 2664) has single `screenshot` and `consoleErrors` columns.
- Admin view: `client/src/pages/PlatformAdminBugReports.tsx` shows a list + a detail dialog with the single screenshot. No "copy all" action.

---

## 1. Allow MULTIPLE / additional screenshots
**Why:** the auto-capture grabs the main page, but the actual issue is often inside a modal or a specific area — the reporter needs to attach extra images.

**Client (`ReportProblemButton.tsx`):**
- Keep the auto-captured screenshot as the first attachment.
- Add an "Add screenshot" control that lets the user attach MORE images by either:
  - **pasting** an image from the clipboard (listen for `paste` events with image data — this is the fastest workflow: they snip with the OS tool and Ctrl+V), and/or
  - **uploading** image files (`<input type="file" accept="image/*" multiple>`).
- Show thumbnails of all attached images with a remove (×) button on each, and an optional one-line caption per image (e.g. "the modal where it happens").
- Convert each to a compressed JPEG data URL (reuse the existing MAX_W=1600, quality 0.7 logic).
- Send them as an array in the payload, e.g. `attachments: [{ dataUrl, caption }]`, in addition to the existing single `screenshot` (keep `screenshot` for backwards compatibility, or migrate it into the array — see server note).

**Server (`bugReports.ts`):**
- Accept an `attachments` array. Validate EACH item is `data:image/...` and cap each at ~4MB and the total at, say, 12MB (or limit to e.g. 5 images) to avoid huge payloads.
- Store them (see schema).

**Schema (`shared/schema.ts`, `bug_reports`):**
- Add an `attachments jsonb` column (array of `{ dataUrl, caption }`). Requires `npm run db:push` before it works live.
- Keep the existing `screenshot` column working (treat it as attachment #1 if present).

**Admin view (`PlatformAdminBugReports.tsx`):**
- In the detail dialog, render ALL attachments (the legacy single `screenshot` plus everything in `attachments`), each with its caption, in a scrollable gallery.

## 2. Capture MORE logs (console + network), not just uncaught errors
**Why:** today only uncaught errors/rejections are captured. `console.error`/`console.warn` and failed API calls are usually the most useful clues.

**`client/src/lib/errorBuffer.ts`:**
- Also capture `console.error` and `console.warn` by wrapping (monkey-patching) them — push the formatted args into the buffer, then call the original. Tag each entry with its level (error/warn).
- Also capture failed network responses: wrap `window.fetch` so any non-2xx response (or thrown fetch) records `[time] HTTP <status> <method> <url>`. Keep payloads OUT (privacy) — just method, URL path, and status.
- Increase the buffer from 10 to ~30 entries so a session's context survives.
- Keep the 500-char-per-entry cap. Be careful not to create infinite loops (don't let the wrapped console.error re-trigger itself).

**Note:** make this resilient — if wrapping fails, fall back silently to the current behaviour. Never let the error buffer itself break the app.

## 3. "Copy All" button in Platform Admin (paste into Claude Code / Replit)
**Why:** when triaging a bug, Andy wants to copy the whole report as text and paste it straight into Claude Code or Replit.

**Admin view (`PlatformAdminBugReports.tsx`) detail dialog:**
- Add a "Copy all" button that builds a single formatted plain-text/markdown block and writes it to the clipboard via `navigator.clipboard.writeText(...)`, with a toast confirmation.
- Include: report number, date, reporter name/email, page URL, browser info, screen size, status, the full description, and the captured console/network logs — laid out with clear headings so it pastes cleanly into a dev tool. Example shape:
  ```
  TPR Bug Report #<n> — <date>
  Reporter: <name> <email>
  Page: <pageUrl>
  Browser: <browserInfo> | Screen: <screenSize>

  ## Description
  <description>

  ## Console / Network logs
  <consoleErrors>

  ## Attachments
  <N> image(s) attached — view in Platform Admin.
  ```
- (Screenshots can't go into plain text — just note how many are attached.)

## Acceptance test
- Reporter can paste AND upload several extra screenshots, caption them, remove any, and submit; all appear in the admin detail view with captions.
- A report submitted after a `console.error` and a failed API call includes both in the captured logs (not just uncaught crashes).
- "Copy all" in the admin dialog copies a clean, headed text block; pasting into Claude Code/Replit gives readable, structured context.
- Old reports with only the single legacy `screenshot` still display correctly.
