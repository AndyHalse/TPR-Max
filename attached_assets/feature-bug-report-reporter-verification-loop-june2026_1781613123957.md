# Feature — Bug Report "Did this fix work?" reporter verification loop

**Date:** 16 June 2026
**File(s) to change:** `server/routes/bugReports.ts`, `shared/schema.ts`, the platform-admin bug-reports dashboard component (client), plus one new public page.
**Status:** Not built — apply on Replit. Needs `npm run db:push` after the schema change.

---

## What this does (plain English)

Right now, when we mark a bug report **Fixed**, TPR emails the person who reported it. That email is nice but it's a dead end — there's no way for them to tell us whether the fix actually worked, so nothing comes back into the platform-admin dashboard.

This change closes the loop. The "Fixed" email gets two buttons:

- **✅ Yes, this is fixed** → the report auto-closes (status → `closed`), stamped as confirmed by the reporter. They see a short thank-you page. No login needed.
- **❌ No, it's still broken** → they're taken to a short page where they can type what's still wrong and optionally attach a screenshot. The report then flips to a new **Reopened** status, jumps back onto the platform-admin dashboard flagged, and emails us so we know it bounced back.

Both buttons are one-click links containing a secure random token, so the reporter does **not** have to log in (they may not even have an account).

---

## Decisions already made (build to these — do not change)

1. **"Still broken" lets them explain** — a short page with a text box + optional single screenshot, then reopen.
2. **Reopened status is labelled "Reopened"** on the dashboard.
3. **"Yes" auto-closes instantly** — status goes straight to `closed`, no extra "confirmed, awaiting admin" step.

---

## 1. Schema changes (`shared/schema.ts`)

Add the new status to the allowed set and add these columns to the `bugReports` table (`pgTable("bug_reports", …)` around line 2664):

```ts
  // --- reporter verification loop ---
  feedbackToken: text("feedback_token"),              // random token used in the email links; null once consumed/expired
  reporterConfirmedAt: timestamp("reporter_confirmed_at"), // set when reporter clicks "Yes, fixed"
  reporterFeedback: text("reporter_feedback"),         // 'confirmed' | 'still_broken' | null
  reopenReason: text("reopen_reason"),                 // the note they typed when saying "still broken"
  reopenScreenshot: text("reopen_screenshot"),         // optional data:image/... they attached when reopening
  reopenedAt: timestamp("reopened_at"),                // when it bounced back to Reopened
```

Add an index is optional — not needed.

**Status values** are currently `new | in_progress | fixed | closed` (validated in `bugReports.ts` as `ALLOWED_STATUSES`). Add `reopened`:

```ts
const ALLOWED_STATUSES = ['new', 'in_progress', 'fixed', 'closed', 'reopened'];
```

Run `npm run db:push` after this.

---

## 2. Generate + store the token when we mark a report Fixed

In the existing `PATCH /platform-admin/bug-reports/:id` handler in `server/routes/bugReports.ts`, inside the `isFixedTransition && !alreadyNotified` block (where the Fixed email is built and sent):

- Generate a token **before** building the email:
  ```ts
  import { randomBytes } from 'crypto';
  // ...
  const feedbackToken = randomBytes(24).toString('base64url'); // URL-safe, ~32 chars
  ```
- Save it onto the record in `setData`:
  ```ts
  setData.feedbackToken = feedbackToken;
  setData.reporterFeedback = null; // reset any prior feedback if re-fixing a reopened report
  ```
- Pass `feedbackToken` and the **base URL** into the email builders so the two buttons can be rendered.

**Base URL** — follow the existing pattern used in `server/emergencyEmailService.ts` / `server/inductionService.ts`:
```ts
const baseUrl = process.env.FRONTEND_URL
  || (process.env.REPLIT_DOMAINS ? `https://${process.env.REPLIT_DOMAINS.split(',')[0].trim()}` : 'http://localhost:5000');
```

> Note: re-fixing a **Reopened** report should send the email again. The current guard uses `reporterNotifiedAt` to avoid double-sending. Adjust the logic so that a transition `reopened → fixed` is allowed to notify again: treat `alreadyNotified` as `false` when `current.status === 'reopened'`, OR clear `reporterNotifiedAt` whenever the status moves off `fixed`. Pick the cleaner of the two and keep the "only notify once per fix" behaviour for the normal path.

---

## 3. Add the two buttons to the Fixed email

In `buildFixedEmailHtml(...)` add a `baseUrl` and `feedbackToken` param, and insert a button block **above** the "If you're still seeing the problem…" paragraph. Use table-based buttons (email-client safe), matching the existing ACS blue `#2460A9` and green `#16a34a`:

```html
<!-- Verification buttons -->
<table width="100%" cellpadding="0" cellspacing="0" style="margin:4px 0 24px">
  <tr>
    <td align="center">
      <p style="margin:0 0 14px;font-size:15px;color:#1e293b">Can you confirm the issue is sorted?</p>
      <table cellpadding="0" cellspacing="0" style="display:inline-block">
        <tr>
          <td style="padding:0 6px">
            <a href="${baseUrl}/bug-feedback/${feedbackToken}?r=fixed"
               style="display:inline-block;background:#16a34a;color:#ffffff;text-decoration:none;font-weight:bold;font-size:14px;padding:12px 22px;border-radius:6px">✓ Yes, this is fixed</a>
          </td>
          <td style="padding:0 6px">
            <a href="${baseUrl}/bug-feedback/${feedbackToken}?r=broken"
               style="display:inline-block;background:#ffffff;color:#b91c1c;text-decoration:none;font-weight:bold;font-size:14px;padding:11px 21px;border:1px solid #b91c1c;border-radius:6px">✗ No, still broken</a>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
```

Update `buildFixedEmailText(...)` to include the two plain links too (for text-only clients):
```
Is it fixed?  Yes → {baseUrl}/bug-feedback/{token}?r=fixed
Still broken? No → {baseUrl}/bug-feedback/{token}?r=broken
```

---

## 4. New PUBLIC routes (no auth — token is the credential)

Add these to `registerBugReportRoutes(app)`. **Do not** put `requireAuth` / `requirePlatformAdmin` on them. Rate-limit them with a small limiter to stop abuse.

### a) GET `/api/bug-feedback/:token` — look up a report by token
Returns minimal, safe info so the public page can render: `{ reportNumber, status, alreadyResponded }`. 404 if the token doesn't match any report. If the report is already `closed` or `reopened` from a prior click, return `alreadyResponded: true` so the page can say "thanks, we've already got your response."

### b) POST `/api/bug-feedback/:token/confirm` — the "Yes, fixed" action
- Find the report by `feedbackToken`. 404 if none.
- If already responded → return success idempotently (don't error).
- Set: `status = 'closed'`, `reporterFeedback = 'confirmed'`, `reporterConfirmedAt = now`, `resolvedAt = now` (if not set), `updatedAt = now`, and **clear** `feedbackToken = null` so the link can't be reused.
- Email us (BCC pattern below) a short "Reporter confirmed BR-xxx is fixed — auto-closed" note. Non-fatal if it fails.

### c) POST `/api/bug-feedback/:token/reopen` — the "Still broken" action
- Body: `{ reason: string (max 2000), screenshot?: data:image/... }`. Validate the screenshot the same way the main POST does (must start with `data:image/`, max 4MB).
- Find the report by `feedbackToken`. 404 if none. Idempotent if already responded.
- Set: `status = 'reopened'`, `reporterFeedback = 'still_broken'`, `reopenReason = reason`, `reopenScreenshot = screenshot ?? null`, `reopenedAt = now`, `updatedAt = now`, and **clear** `feedbackToken = null`.
- Email us a "⚠️ BR-xxx reopened by reporter" alert including the reason and a note if a screenshot was attached. Reuse the `BUG_REPORT_NOTIFY_EMAIL` env (`andy@acsltd.eu` fallback), same as the existing new-report notification.

> Security: the token is the only credential, so it must be (a) long & random (done — 24 bytes), (b) single-use (cleared on response), and (c) only ever grant access to that one report. Never accept a report `id` from the public endpoints — only the token.

---

## 5. New public page (client) — `/bug-feedback/:token`

A single lightweight page, **no app chrome, no login**. On load it calls `GET /api/bug-feedback/:token` and reads `?r=` from the query string:

- `?r=fixed` → immediately POST to `/confirm`, then show a clean thank-you card: *"Thanks — we've marked report BR-xxx as resolved. 👍"* with ACS branding (blue `#2460A9`, ACS logo).
- `?r=broken` → show a short form: heading *"Sorry it's still not right"*, a textarea *"What's still happening?"* (required), an optional screenshot picker (reuse the resize-to-data-URL pattern the existing bug reporter uses — resize to a sensible max before sending). On submit, POST to `/reopen`, then show *"Thanks — we've reopened report BR-xxx and the team will take another look."*
- If `alreadyResponded` is true → show *"Thanks, we've already recorded your response for BR-xxx."*
- Invalid/expired token → friendly *"This link has expired or already been used. If you still need help, just reply to the email."*

**HARD RULE reminder:** this page is a normal informational page — glassmorphism is fine here, but keep it simple and fast. (It is not an emergency/kiosk screen.)

---

## 6. Platform-admin dashboard changes (client)

The bug-reports list/detail already reads `status`. Add handling for the new `reopened` status:

- **Status filter / tabs:** add a **Reopened** option.
- **Badge:** show `Reopened` in red/amber so it stands out — these are the ones that need attention. Sort or surface reopened reports near the top.
- **Detail view:** when a report has `reporterFeedback`, show it clearly:
  - `confirmed` → green line: *"✓ Reporter confirmed fixed on {reporterConfirmedAt}"*.
  - `still_broken` → red panel showing `reopenReason` and the `reopenScreenshot` if present (render the image), plus *"Reopened on {reopenedAt}"*.
- The status dropdown (New / In Progress / Fixed / Closed) should include **Reopened** so an admin can also set it manually if needed. Re-marking a Reopened report as **Fixed** should send a fresh verification email (see the note in section 2).

---

## Acceptance checklist

- [ ] `npm run db:push` runs clean; new columns + `reopened` status exist.
- [ ] Marking a report Fixed (with a reporter email) sends the email with both working buttons.
- [ ] Clicking **Yes** with no login → report shows **Closed**, `reporterConfirmedAt` set, thank-you page shown, link can't be reused.
- [ ] Clicking **No** → form appears, note (and optional screenshot) submits → report shows **Reopened** on the dashboard with the reason + image visible, and a reopen alert email arrives at `andy@acsltd.eu`.
- [ ] Re-fixing a Reopened report sends a fresh verification email.
- [ ] Reused/expired token shows the friendly "already used" message, never a crash or another status change.
- [ ] Public endpoints reject a bad/unknown token with 404 and never accept a raw report id.
