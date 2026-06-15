# FEATURE — Error ID correlation + richer diagnostics on every page

Goal: when anything breaks in TPR, make it fast for a developer (or Claude Code / Replit) to find the exact cause. Today the user sees a generic "Internal Server Error" and the real stack trace sits unlinked in the server log. This feature ties the two together with a shared **error ID**, and attaches richer context to every bug report.

This is an enhancement, not a UAT defect fix.

## Current state (for context — read before changing anything)
- **Server logger** exists: `server/utils/logger.ts` (Winston, structured JSON, CloudWatch-ready). Use it — do NOT add a second logging library.
- **Global Express error handler**: `server/index.ts` ~line 535. It logs `err.message`, `err.stack`, url, method, body, params, query, then returns `{ error: "Internal Server Error" }` in production. It does NOT generate or return any reference ID.
- **Client error buffer**: `client/src/lib/errorBuffer.ts` records the last 10 `window` `error` + `unhandledrejection` events (message only, capped 500 chars). Exposed via `getRecentErrors()`.
- **Error boundaries**: `client/src/components/ErrorBoundary.tsx` wraps every route (keyed on pathname in `App.tsx`). `componentDidCatch` only `console.error`s — it does NOT feed the error buffer or show an error ID.
- **Report a Problem**: `client/src/components/ReportProblemButton.tsx` posts to `/api/bug-reports` with `pageUrl`, `browserInfo`, `screenSize`, `consoleErrors` (from the buffer), screenshot, reporter details. Stored by `server/routes/bugReports.ts`.
- **API client**: `client/src/lib/queryClient.ts` (`apiRequest`) is the single funnel for API calls.

> **Overlap note — do NOT duplicate work.** A separate prompt, `feature-bug-logging-improvements.md`, already covers (a) capturing `console.error`/`console.warn` and failed network requests into the buffer, and (b) multiple/pasted screenshots. If that work is already merged, build on top of it. This prompt is specifically about the **error ID**, **breadcrumbs**, **version stamp**, and **wiring the error boundary into the buffer**. Where the two touch the same file, integrate — don't overwrite.

---

## 1. Generate and surface an error ID for every server error (highest value)
**Why:** so a user-facing failure can be matched to the exact server log line in seconds.

**Server (`server/index.ts` global error handler ~line 535):**
- Generate a short, human-readable error ID per error, e.g. `ERR-` + 5 uppercase hex chars (`ERR-7F3A2`). Keep it short enough to read aloud over the phone.
- Log it via `logger.error` **as a field** (e.g. `errorId`) alongside the existing stack/url/method/body, so it's searchable in CloudWatch.
- Return it to the client in the JSON body **even in production**: `{ error: "Internal Server Error", errorId: "ERR-7F3A2" }`. The ID is safe to expose; the stack/details stay server-side only.
- If a request ID already exists on `req` (check for any existing correlation/request middleware first), reuse that instead of inventing a second identifier — one ID, not two.

**Client (`client/src/lib/queryClient.ts`):**
- When an API response is an error and the body contains `errorId`, include it in the thrown `Error` (e.g. `err.errorId`) so callers and toasts can show it.

**Client (error toasts):**
- Where a failed `apiRequest` shows a destructive toast, append the error ID when present, e.g. description: `"Please try again. (Ref: ERR-7F3A2)"`. Don't redesign every toast — a small shared helper that formats `(Ref: …)` when an ID exists is enough.

**Client (`ErrorBoundary.tsx`):**
- On the default fallback card, if an error ID is available, show it in small muted text: `"Reference: ERR-7F3A2 — quote this if you report it."` Do NOT change the `EmergencyFallback` (muster/fire) screen layout beyond optionally adding the ref in small text — keep it high-contrast and uncluttered. (Per house rule: no glass / no clutter on emergency + kiosk screens.)

**Bug report:**
- `ReportProblemButton.tsx`: if an error ID was seen recently (see buffer change below), auto-include it in the payload as `errorId`. Store it on the bug report (`server/routes/bugReports.ts` + `bug_reports` schema in `shared/schema.ts` — add an `error_id` text column; requires `npm run db:push`). Show it in the admin detail view `client/src/pages/PlatformAdminBugReports.tsx`.

## 2. Wire the error boundary into the buffer
**Why:** when a page crashes, that crash should ride along in the next bug report, not vanish into the console.
- In `ErrorBoundary.componentDidCatch`, push a buffer entry (reuse `errorBuffer`) containing the error message, the first few lines of the stack, and the `componentStack` (trimmed) so the developer can see which component failed.

## 3. Breadcrumbs — the user's last few actions
**Why:** "what were you doing when it broke?" answered automatically.
- Add a lightweight breadcrumb trail to `errorBuffer.ts` (or a small sibling `breadcrumbs.ts`): keep the last ~15 entries, each `{ time, type, detail }`.
- Record: route changes (on navigation), and clicks on buttons/links with visible text (capture the trimmed text or `data-testid`, never input values). Keep it cheap — a single delegated listener, no per-component wiring.
- **Privacy:** never record typed input values, passwords, or field contents — only element labels/roles. Cap `detail` length.
- Include the breadcrumb trail in the bug report payload (e.g. `breadcrumbs` text/JSON) and store + show it in the admin view.

## 4. Stamp the app version / build into every report
**Why:** stops time wasted debugging a bug on a stale cached bundle.
- The logger already references `process.env.APP_VERSION`. Expose the build version (and commit SHA if available at build time, e.g. via a Vite env var like `VITE_APP_VERSION` / `VITE_GIT_SHA`) to the client.
- Include `appVersion` in the `/api/bug-reports` payload; store it (`bug_reports.app_version` text column) and show it in the admin detail view.

---

## Acceptance criteria
- Trigger a deliberate server 500 → the user sees a generic message **with** a `Ref: ERR-XXXXX`, and searching the server logs for that exact ID lands on the full stack trace for that request.
- Crash a page (throw in a component) → the friendly fallback shows a reference, and the next "Report a Problem" submission contains that crash (message + component) in its captured logs.
- A bug report submitted after a failed save includes: the error ID, the breadcrumb trail, the app version, and (from the other prompt, if merged) the failed API call.
- No typed input values, passwords, or field contents appear anywhere in breadcrumbs or captured logs.
- `EmergencyFallback` (muster/fire) remains high-contrast and uncluttered.

## Notes
- Schema changes (`error_id`, `breadcrumbs`, `app_version` on `bug_reports`) require `npm run db:push` before they work live.
- One identifier end to end. If a request-ID concept already exists server-side, reuse it rather than adding a parallel one.
- Don't add Sentry or a third-party monitoring SDK in this prompt — that's a separate decision. This is about making the data we already collect actually traceable.
