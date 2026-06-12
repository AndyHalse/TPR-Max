# Bugfix — Contractor Portal Admin screen (/contractor-portal-admin) — seven issues

**Scope:** the Contractor Portal *admin* screen and its API endpoints only. Files in play:
`client/src/pages/ContractorPortalAdmin.tsx` and the six portal-admin routes in
`server/routes/contractors.ts` (lines ~4766–5052: portal-invite, portal-users, revoke,
resend-login, document review, portal-documents).

Do these as **separate commits** so each can be tested and rolled back on its own. They are
ordered by priority. Issues 1 and 2 are the ones that really matter. Do not touch the
contractor-facing portal (`server/routes/contractorPortal.ts`), the portal auth utils, or any
unrelated screens.

Note: `apiRequest` in `client/src/lib/queryClient.ts` already **throws** on any non-OK
response, so mutation `onError` handlers fire correctly today — keep that behaviour.

---

## Issue 1 — Admin endpoints have no role check (HIGH — security)

**Where:** `server/routes/contractors.ts`, all six portal-admin routes listed above.

**The problem:** every route uses only `requireAuth`. Any logged-in user — including ordinary
`user`-role accounts such as a reception desk login — can approve or reject contractor
compliance documents, revoke portal access, and send portal invites. For a compliance product
this is unacceptable: document approval must be an admin-level action.

The codebase already has this pattern: `server/routes/hrOnboarding.ts` (line 14) defines a
local `requireAdmin` middleware that checks `req.user?.role`.

**The fix:** add a local middleware in `server/routes/contractors.ts` near the portal-admin
routes:

```ts
function requirePortalAdmin(req: any, res: any, next: any) {
  if (!['admin', 'tenant_admin'].includes(req.user?.role || '')) {
    return res.status(403).json({ error: 'Admin role required' });
  }
  next();
}
```

Before finalising the allowed-role list, check the role values actually used in the users
table (`shared/schema.ts` line 996 comment says: admin, user, tenant_admin, tenant_staff) and
check whether `client/src/components/Sidebar.tsx` already hides the "/contractor-portal-admin"
entry for non-admin roles — the middleware list must match whoever is meant to see the page.

Apply it to these six routes, after `requireAuth`:

- `POST /api/contractors/:companyId/portal-invite`
- `GET  /api/contractors/:companyId/portal-users`
- `PATCH /api/contractors/portal-users/:userId/revoke`
- `POST /api/contractors/portal-users/:userId/resend-login`
- `PUT  /api/contractors/documents/:docId/review`
- `GET  /api/contractors/:companyId/portal-documents`

Do **not** apply it to any other route in the file in this commit.

**Verify:** log in as an admin → everything on /contractor-portal-admin still works. Log in
as a non-admin user and call one of the endpoints directly (e.g. the revoke PATCH) → 403.

---

## Issue 2 — Document approval records no audit trail (HIGH — compliance)

**Where:** `server/routes/contractors.ts`, `PUT /api/contractors/documents/:docId/review`
(around line 4995).

**The problem:** approving or rejecting a portal document updates `status`, `approvedAt` and
`rejectedReason` but never records **who** made the decision. The
`contractor_documents` table in `server/isolatedSchema.ts` already has an `approvedBy` column
(line ~949) — it is simply never set. If a contractor's insurance is challenged after an
incident, "who approved this document and when" must be answerable.

**The fix:** in the update, set the reviewer on both outcomes (no schema migration needed):

```ts
.set({
  status,
  approvedBy: req.user!.id,          // the reviewer, for both approve and reject
  approvedAt: status === 'approved' ? new Date() : null,
  rejectedReason: status === 'rejected' ? (rejectedReason || 'Document rejected') : null,
  updatedAt: new Date(),
})
```

**Verify:** approve a pending document, then check the `contractor_documents` row —
`approved_by` holds the admin's user id and `approved_at` is set. Reject one — `approved_by`
is set, `approved_at` is null, `rejected_reason` is stored.

---

## Issue 3 — Page loads with N+1 requests and swallows errors (MEDIUM-HIGH)

**Where:** `client/src/pages/ContractorPortalAdmin.tsx` (the two queries at lines ~49–87) and
`server/routes/contractors.ts`.

**The problem (two halves):**

1. *Performance:* the page fetches `/api/contractors/:id/portal-users` once per contractor
   company, sequentially (`for` loop with `await`), then does the same again for documents.
   With hundreds of contractors the page would take a very long time to load.
2. *Silent failure:* each per-company fetch is wrapped in `try {} catch {}` and non-OK
   responses are skipped. If requests fail, users and pending documents silently vanish from
   the list — an admin could see "All clear! No documents waiting for review" when the data
   simply failed to load. A compliance screen must never fail silently.

**The fix:** replace the client-side fan-out with **one** new endpoint.

Server — add `GET /api/contractor-portal/admin-overview` (with `requireAuth` +
`requirePortalAdmin` from Issue 1) that returns everything in two joined queries against the
customer's isolated DB:

```ts
// 1) All portal users, joined to contractorCompanies for companyName.
//    Same fields as the existing portal-users route, plus companyId and companyName.
// 2) All pending portal docs: contractorDocuments where status = 'pending'
//    AND isActive = true AND uploadedBy LIKE 'portal:%',
//    joined to contractorCompanies for companyName.
return res.json({ portalUsers, pendingDocs });
```

Keep the existing per-company routes untouched — other screens may use them.

Client — replace both queries in `ContractorPortalAdmin.tsx` with a single
`useQuery({ queryKey: ["/api/contractor-portal/admin-overview"] })` using the default query
function (it already handles auth headers and errors). Derive `allPortalUsers` and
`allPendingDocs` from its result. Use the query's `isError` state to render a visible error
card with a Retry button instead of an empty list. Keep the existing empty states for the
genuinely-empty case.

This also fixes a refresh race: today, after adding a contractor and sending the invite
straight away, the new portal user may not appear until a manual page reload (the user list
refetches before the contractor list has refreshed). With one endpoint, simply invalidate
`["/api/contractor-portal/admin-overview"]` in the `onSuccess` of the invite, revoke and
review mutations (replacing the current `refetchPortalUsers()` / `refetchDocs()` calls).

**Verify:** page loads with one overview request (check the network tab). Add a contractor →
send the invite from the post-create dialog → the new pending user appears **without** a
manual reload. Temporarily make the overview endpoint return 500 → the page shows the error
card with Retry, not "All clear!".

---

## Issue 4 — Rejection is silent and reason is hardcoded (MEDIUM)

**Where:** `client/src/pages/ContractorPortalAdmin.tsx` (Reject button, ~line 448) and the
review route in `server/routes/contractors.ts`.

**The problem:** the Reject button sends a hardcoded reason ("Rejected by administrator") and
the contractor is never notified — they only find out their insurance document was rejected
if they happen to log back into the portal.

**The fix, client side:** clicking Reject opens a small dialog (match the existing Revoke
confirm dialog style) with a required `Textarea` for the reason, then calls the existing
mutation with that reason.

**The fix, server side:** in the review route, when `status === 'rejected'`, email the
uploader after the DB update succeeds. The `uploadedBy` value for portal uploads is
`portal:<portalUserId>` — parse the id, look up that user in `contractorPortalUsers` for their
email; if not found, fall back to the contractor company's contact email. Use the existing
`EmailService(customerId)` pattern used elsewhere in this file. Plain message: which document,
which company, the reason, and that they can re-upload via the portal. Wrap the email send in
try/catch and only log a warning on failure (same pattern as the portal-invite route) — the
rejection itself must still succeed.

**Verify:** reject a document with a reason → contractor portal user receives the email with
that reason; the reason is stored in `rejected_reason`. Approving sends no email.

---

## Issue 5 — Action spinners fire on every row (LOW — cosmetic)

**Where:** `client/src/pages/ContractorPortalAdmin.tsx`, the per-row buttons (~lines 349–375
and 438–453).

**The problem:** the buttons use the shared `mutation.isPending`, so clicking "Resend Link"
on one user shows the spinner and disables the button on *every* row.

**The fix:** scope it with the mutation's `variables` (React Query v5 exposes the in-flight
variables), e.g. for resend-login:

```tsx
const busy = resendLoginMutation.isPending && resendLoginMutation.variables === u.id;
```

Use `busy` for that row's spinner; keep `disabled={resendLoginMutation.isPending}` so double
submits stay blocked. Apply the same pattern to the row-level Resend (compare
`variables.email === u.email`), Approve and Reject buttons (compare `variables.docId`).

**Verify:** with two or more rows, click an action — only that row shows the spinner.

---

## Issue 6 — Possible "null Smith" in user names (LOW)

**Where:** `client/src/pages/ContractorPortalAdmin.tsx` line ~316.

**The problem:** `` `${u.firstName} ${u.lastName}`.trim() `` renders the literal string
"null" if either field comes back null.

**The fix:**

```tsx
const fullName = [u.firstName, u.lastName].filter(Boolean).join(' ');
// render fullName || u.email
```

---

## Issue 7 — Dead error checks (LOW — cleanup, no behaviour change)

**Where:** `client/src/pages/ContractorPortalAdmin.tsx`, `createContractorMutation` (~line 93)
and `resendLoginMutation` (~line 133).

**The problem:** both check `res.ok` after `apiRequest(...)`, but `apiRequest` already throws
on non-OK responses (`throwIfResNotOk` in `client/src/lib/queryClient.ts`), so those branches
can never run and mislead the next reader.

**The fix:** remove the dead `if (!res.ok)` branches and just `return res.json()`. Do not
change `apiRequest` itself.

---

## After all commits

Run the app and walk the whole screen once as an admin: add contractor → post-create invite →
resend invite → resend login → approve a doc → reject a doc with a reason → revoke access.
Then once as a non-admin user: the page's API calls must all return 403.
