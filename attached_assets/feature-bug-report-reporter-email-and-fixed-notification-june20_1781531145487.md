# FEATURE — Capture the reporter's email + auto-email them an ACS-branded "fixed" notice

**Source:** Andy, 15 Jun 2026, re `/platform-admin/dashboard` bug reports. Two linked asks:
1. Make sure the **reporter's (staff member's) email** is on every bug report, so a developer can contact them.
2. When a report is marked **Fixed** in the platform-admin dashboard, **automatically email the reporter back** an ACS-branded, nicely written message referencing their report.

These depend on each other — you can't notify someone whose email you never captured. Do Part 1 first.

---

## PART 1 — Reliably capture & surface the reporter's email

### The bug
`server/routes/auth.ts` `/api/auth/me` (~line 701) returns `id, username, role, firstName, lastName…` but **not `email`**. The report dialog (`client/src/components/ReportProblemButton.tsx` ~line 66) therefore does:
```ts
const reporterEmail = me?.username?.includes("@") ? me.username : (me?.email ?? "");
```
`me.email` is always undefined, so unless the username happens to be an email, `reporterEmail` is blank. That's why BR-009 (reporter "PeterDunsmuir") arrived with no email. The `users` table **does** have an `email` column — it's just not exposed.

### The fix
1. **`server/routes/auth.ts`** `/api/auth/me`: add `email: user.email ?? null` to the JSON response (both the main response ~line 701 and, for consistency, the dev-bypass branch ~line 663).
2. **`client/src/components/ReportProblemButton.tsx`**: set `reporterEmail` from `me?.email || (me?.username?.includes("@") ? me.username : "")`.
3. **Fallback when the staff record has no email:** show a small **optional email field** in the report dialog, prefilled with the detected email if any, so the reporter can add/confirm a contact address. Caption it: *"Your email (so we can update you when it's fixed)."* Send whatever's in it as `reporterEmail`.
4. **Admin view (`client/src/pages/PlatformAdminBugReports.tsx`)**: make the reporter email prominent and **clickable** (`mailto:`), and if it's missing show a clear *"No contact email captured"* note (so the admin knows they can't notify this reporter).

### Part 1 acceptance
- A report from a staff member whose account has an email arrives with that email shown and clickable in the admin view.
- If the account has no email, the reporter can type one into the dialog and it comes through.

---

## PART 2 — Auto-email the reporter an ACS-branded "Fixed" notice

### Where to hook
`server/routes/bugReports.ts` already has the status PATCH (`PATCH /platform-admin/bug-reports/:id`, ~line 187) and already uses `EmailService` (used to notify support on new reports ~line 103). Reuse `EmailService` — don't add a new mailer.

### Behaviour
- When a PATCH changes status **into `fixed`** (i.e. the *previous* status was not `fixed` and the new one is `fixed`), and the report has a `reporterEmail`, send the reporter the branded email below.
- **Fire once.** Guard on the transition (old status ≠ fixed → new = fixed). Don't send on every save, don't resend if it's toggled fixed→fixed, and record that it was sent (see below) so a reopen→fix-again doesn't silently double-notify without intent.
- **Only `fixed`, not `closed`.** `closed` can mean won't-fix/duplicate — sending "we've fixed it" would be wrong. (Optional: a separate, softer template for `closed` later — not in scope now.)
- If `reporterEmail` is missing, **skip silently** and note in the response that no email was sent (the admin already sees "no contact email").

### Recommended: a short "what we fixed" note + a confirm step (read this — see "Things you may have missed")
Rather than a hollow generic email, let the admin add an optional **resolution note** (reuse the existing `adminNotes`, or a dedicated field) that's included in the email — e.g. *"The contractor email now saves correctly."* And surface a small confirm/preview when marking Fixed: *"Email PeterDunsmuir@… to let them know? [edit note] [Send] [Skip]"*. This respects ACS's rule of not firing customer-facing emails blindly, makes the message useful, and still defaults to sending. If you'd rather keep it fully automatic for now, at minimum include the resolution note when present.

### The email
- **From:** ACS support sender (same one EmailService already uses). **From name:** `ACS Safety & Security — Software Development Team`.
- **Reply-To:** a monitored dev/support mailbox, so when the customer replies it reaches the team (set this explicitly).
- **BCC:** the support inbox, so there's an internal record a notification went out.
- **Subject:** `Your TPR issue ${reportNumber} has been resolved`
- **HTML body** — ACS branded (brand blue **#2460A9**), with a coloured header band referencing the report:

```
[ Header band, background #2460A9, white text ]
   ACS Safety & Security — TPR Support
   Report ${reportNumber} — Resolved

Hi ${reporterFirstName || reporterName || "there"},

Good news — the issue you reported has now been fixed.

  Your report (${reportNumber}):
  "${original description}"

  ${resolutionNote ? "What we did: " + resolutionNote : ""}

If you're still seeing the problem, please refresh the page (or sign out and back in) to pick up the latest version. If it persists, just reply to this email and we'll take another look.

Thanks for helping us make TPR better.

Kind Regards

Software Development Team
ACS Safety & Security Ltd

T: +44 (0)1344 771569
```
- **Append the full legal disclaimer verbatim** beneath the signature (smaller, muted text):
  > If you are not the intended recipient of the message, please notify the sender immediately and do not disclose the contents to any other person, use it for any purpose, or store or copy the information in any medium. Internet communications are not secure and therefore ACS Safety & Security Limited, does not accept legal responsibility for the contents of this message. Any views or opinions presented are solely those of the author and do not necessarily represent those of ACS Safety & Security Ltd, unless otherwise specifically stated. If the content of this e-mail is to become contractually binding, it must be made in writing & signed by a Director of ACS Safety & Security Ltd.
- **Plain-text version** of the same (EmailService takes `html` + `text`).
- Keep it clean and professional — no glassmorphism, no gimmicks; this is a transactional email.

### Record that it was sent
- Add `reporterNotifiedAt timestamp` to the `bug_reports` schema (`shared/schema.ts`). Set it when the email sends. Show *"Reporter notified on …"* in the admin detail view. Prevents accidental double-sends and gives you an audit trail. (Requires `npm run db:push`.)

### Part 2 acceptance
- Marking a report **Fixed** (with a reporter email present) sends the branded email, with the correct signature + disclaimer, the report number in the subject and header, and the original description quoted.
- It sends **once** per fix transition; `reporterNotifiedAt` is set and shown.
- Marking **Closed** does **not** send the "fixed" email.
- A report with no reporter email is skipped cleanly, with the admin told no email went out.
- Replying to the email reaches the monitored dev/support mailbox.

---

## Things you may have missed (recommendations)
1. **Confirm/preview before sending** — covered above. ACS's own rule is not to fire customer emails blindly; a one-click confirm with an editable note is safer and produces a better message. Strongly recommended over silent auto-send.
2. **Resolution note** — a generic "it's fixed" is weak; quoting what was fixed builds trust (and these are going to real customers like Cowiesburn).
3. **Reply-To + BCC** — so replies land somewhere monitored and you keep an internal copy.
4. **Send-once guard + `reporterNotifiedAt`** — avoid double-notifying on re-saves or reopen→refix.
5. **`closed` ≠ `fixed`** — don't tell someone it's fixed when it was closed as won't-fix/duplicate.
6. **Missing-email handling** — make it visible in the admin UI so it's obvious when a reporter can't be reached (ties back to Part 1).
7. **Deliverability** — make sure the support sender domain is SPF/DKIM-aligned so these don't land in spam (likely already fine if new-report emails deliver).

## Notes
- Schema change (`reporter_notified_at`) needs `npm run db:push`.
- Reuse the existing `EmailService`; don't introduce a second mail path.
