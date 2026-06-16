# Bugfix — "Link expired" when clicking *No, still broken* (email scanners auto-burn the token)

**Date:** 16 June 2026
**Reported as:** BR-020 (Emma Leschenko, on Edge/Windows → Microsoft 365 mail)
**File(s) to change:** `client/src/pages/BugFeedback.tsx`, `server/routes/bugReports.ts`, `shared/schema.ts`
**Status:** Not built — apply on Replit. Needs `npm run db:push` (one new column).

---

## The bug (plain English)

The bug-report verification loop is live. When a report is marked **Fixed**, the reporter gets an email with two buttons — **Yes, this is fixed** and **No, still broken** — sharing one single-use token.

The **Yes** page is coded to confirm **automatically on page load** (`BugFeedback.tsx`, the `useEffect` that POSTs to `/confirm` as soon as `phase === "confirming"`). That POST sets `feedbackToken = null`, so the token is single-use.

Microsoft 365 / Outlook (and many corporate mail filters) **automatically open links in emails** to scan them — "Safe Links" / link detonation — and the aggressive ones execute the page's JavaScript. So when the email arrives, the scanner opens the **Yes** link, the page auto-confirms, the report is silently marked **Closed**, and the token is destroyed.

By the time the human clicks **No, still broken**, the token is already gone. The lookup `GET /api/bug-feedback/:token` returns 404 → the page shows the `invalid` state → **"Link expired."**

> Proof it's the auto-confirm and not the "No" path: the reopen flow only consumes the token on an explicit POST submit. The GET lookup never consumes it. So the only thing that could have burned the token before Emma clicked is the auto-firing **Yes** confirm — triggered by the scanner, not by her.

This is the same class of bug that made everyone add a "confirm unsubscribe" button: **never change state on page load — only on a real click/submit.** Bots load pages; they don't click buttons.

---

## Root cause, precisely

`client/src/pages/BugFeedback.tsx`:
- The `?r=fixed` branch sets `phase: "confirming"`, and a second `useEffect` immediately fires `POST /api/bug-feedback/:token/confirm` with no human interaction.
- `POST /confirm` (in `server/routes/bugReports.ts`) sets `feedbackToken: null` → single-use.
- Result: any automated GET that runs JS on the `?r=fixed` URL closes the report and burns the shared token.

---

## Fix

### 1. Client — require an explicit click to confirm (`BugFeedback.tsx`)

**Remove the auto-confirm `useEffect` entirely.** Replace the `"confirming"` auto-state with a **confirm screen that has a button**:

- When `?r=fixed` and not already responded → set a new phase `"confirm_prompt"`.
- Render a card: heading *"Glad to hear it!"*, text *"Can you confirm report {reportNumber} is now sorted?"*, and a green button **"Yes, it's fixed"**.
- Only when the user **clicks that button** do we `POST /api/bug-feedback/:token/confirm`. While in flight show a spinner; on success go to `confirm_done`; on failure show an inline retry message (not the scary "expired" screen unless it's a genuine 404).
- Keep the existing `reopen_form` (the *No* path) exactly as-is — it already requires an explicit submit, which is correct.

So both buttons in the email now do the same safe thing: **open a page that waits for a human action.** Neither consumes the token on load.

Add the new phase to the `PageState` union:
```ts
| { phase: "confirm_prompt"; reportNumber: string }
```
And in the loader `.then((data) => …)`, replace the `response === "fixed"` branch:
```ts
if (response === "fixed") {
  setState({ phase: "confirm_prompt", reportNumber: data.reportNumber });
}
```
Delete `didAutoConfirm` and the auto-confirm `useEffect`. Add a `handleConfirm()` that mirrors `handleReopen()` (sets submitting, POSTs, handles errors, sets `confirm_done`).

> Distinguish "genuinely used/expired" (HTTP 404 → show **invalid/expired** screen) from "network/server hiccup" (show a retry message). Don't show "Link expired" for a transient error.

### 2. Server — add a real token expiry so "expired" is honest (`schema.ts` + `bugReports.ts`)

Right now "expired" is a lie — the token never expires, it's just consumed. Add a genuine TTL.

`shared/schema.ts`, in `bugReports`:
```ts
feedbackTokenExpiresAt: timestamp("feedback_token_expires_at"),
```
(omit it in `insertBugReportSchema` like the other internal fields). Run `npm run db:push`.

When generating the token on the **Fixed** transition (`PATCH /platform-admin/bug-reports/:id`, where `feedbackToken = randomBytes(...)` is set), also set:
```ts
setData.feedbackTokenExpiresAt = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000); // 60 days
```

In `GET /api/bug-feedback/:token`, `POST /confirm`, and `POST /reopen`: after looking up by token, treat an **expired** token as not found:
```ts
if (report.feedbackTokenExpiresAt && report.feedbackTokenExpiresAt < new Date()) {
  return res.status(404).json({ error: 'This link has expired.' });
}
```
Select `feedbackTokenExpiresAt` in the GET query (it currently only selects id/reportNumber/status/reporterFeedback).

### 3. Don't let the token die from a single mis-fire — keep idempotency, and don't 404 the *other* button

The token is shared between Yes and No. With the auto-confirm gone, a scanner can no longer consume it. But to be belt-and-braces:

- The confirm/reopen handlers already return success idempotently if the *same* feedback was already recorded — keep that.
- Because state now only changes on an explicit human click, a mail scanner loading either URL just renders a page and leaves the token intact. No further protection needed.

---

## Clean up the report Emma was testing

The report she tested was almost certainly auto-closed by the scanner (status `closed`, `reporterFeedback: 'confirmed'`, but `reporterConfirmedAt` set by a bot, not her). After deploying the fix:
- Find the most recent report that went to `closed` with `reporterFeedback = 'confirmed'` around 16 Jun ~13:00–15:00 that Emma was the reporter on, and **re-open it / re-mark it Fixed** so a fresh email + working link goes out.
- BR-020 itself is the *report about this bug* — close it once the fix is verified.

---

## Acceptance checklist

- [ ] `npm run db:push` runs clean; `feedback_token_expires_at` column exists.
- [ ] Marking a report Fixed sends the email; **neither** link changes anything until a human acts.
- [ ] Opening the **Yes** link shows a confirm **button**; the report only closes after it's clicked.
- [ ] Opening the **No** link, typing a reason, and submitting reopens the report (token still valid — not "expired").
- [ ] Simulate a scanner: `curl` the `?r=fixed` page URL and also `curl -X GET /api/bug-feedback/:token` → token is **not** consumed, report unchanged, both buttons still work afterwards.
- [ ] A token older than its expiry shows the friendly **expired** screen; a transient/network error shows a **retry** message, not "expired".
- [ ] The report Emma tested has been re-fixed so she gets a fresh, working link.
```
