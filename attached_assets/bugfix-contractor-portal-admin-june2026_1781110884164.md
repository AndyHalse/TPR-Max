# Bugfix — Contractor Portal (admin + self-service) — five issues

**Scope: the Contractor Portal feature only.** Files in play:
`server/routes/contractorPortal.ts`, `server/utils/contractorPortalAuth.ts`,
`server/routes/contractors.ts` (the `/api/contractors/*/portal-*` and document-review routes),
and one shared file (`server/routes/settings.ts`) for issue 5.

Do these as separate commits so each can be tested and rolled back on its own. They're ordered by priority. Issues 1, 2 and 5 are the ones that actually matter — 3 and 4 are smaller correctness fixes.

The authentication design itself is sound (bcrypt, HMAC-signed token, timing-safe compare, the rate-limit fix already applied). Don't touch any of that.

---

## Issue 1 — Uploaded documents are silently lost when storage fails (HIGH)

**Where:** `server/routes/contractorPortal.ts`, the upload route (around lines 361–396).

**The problem:** when a contractor uploads a compliance document, the code tries to save the file to object storage inside a `try/catch`. If the save throws, the catch logs a warning, sets `documentUrl = ''`, and then **carries on and inserts the database row anyway** with status `pending` and an empty file URL. The endpoint returns `201 Created`.

So the contractor sees "uploaded successfully", but their insurance / RAMS / DBS certificate was never stored. In the admin screen the document appears in the pending list with no file to open (the "view" eye icon is hidden when `documentUrl` is empty), so the admin can't review it and doesn't know anything is wrong. A contractor can be marked as having submitted a document they didn't actually get to us. For a compliance product that is the worst possible failure mode — it's worse than a visible error.

**The fix:** if the object-storage save fails, do **not** insert the row. Return an error so the contractor knows to try again:

```ts
} catch (storageErr: any) {
  logger.error('[portal-upload] Object storage save failed:', storageErr?.message);
  return res.status(502).json({
    error: 'We could not store your file right now. Please try again in a moment.',
  });
}
```

Only insert the `contractorDocuments` row after a confirmed successful save, and never insert with an empty `documentUrl`.

**Verify:** upload a document normally → row created, file viewable from the admin "Pending Documents" tab. Then temporarily force the storage call to throw → the request returns 502 and **no** new pending document appears in the admin list.

---

## Issue 2 — "Revoke access" doesn't end a contractor's current session (MEDIUM-HIGH)

**Where:** `server/utils/contractorPortalAuth.ts` (`requireContractorPortalAuth`) and the revoke route in `server/routes/contractors.ts` (around line 4896).

**The problem:** the portal token is a stateless JWT valid for 8 hours. `requireContractorPortalAuth` only checks the signature and expiry — it never re-checks the database. The admin "Revoke" button sets `is_active = false` and clears the password, which stops **future** logins, but a contractor who is already logged in keeps full access (upload documents, add workers, view company data) for up to 8 hours after being revoked.

The admin UI promises the opposite. The confirm dialog says *"This will immediately prevent {email} from logging into the portal"* and the toast says *"{email} can no longer log in."* Right now that's not true until their token expires.

**The fix:** re-check `is_active` on each authenticated portal request. Cheapest reliable option — in `requireContractorPortalAuth`, after the token verifies, load the portal user and reject if they're not active. It already has `portalUserId` and `customerId` in the payload:

```ts
const payload = verifyPortalToken(token);
if (!payload) { /* existing 401 */ return; }

const db = await customerDbService.getCustomerDatabase(payload.customerId);
const [user] = await db
  .select({ isActive: isolatedSchema.contractorPortalUsers.isActive })
  .from(isolatedSchema.contractorPortalUsers)
  .where(eq(isolatedSchema.contractorPortalUsers.id, payload.portalUserId))
  .limit(1);

if (!user || !user.isActive) {
  res.status(401).json({ error: 'Your portal access has been removed. Please contact the site administrator.', code: 'PORTAL_ACCESS_REVOKED' });
  return;
}

(req as any).portalUser = payload;
next();
```

That makes the middleware `async` and adds the `customerDbService` / `isolatedSchema` / `eq` imports it needs. If you'd rather not hit the database on every request, the alternative is a token-version column bumped on revoke — but the per-request check is simpler and the portal is low-traffic, so prefer that unless there's a performance reason not to.

**Verify:** log in as a portal user, confirm `GET /api/contractor-portal/me` works. In another window, revoke that user from the admin screen. The first window's next portal request must return 401 with `PORTAL_ACCESS_REVOKED` — not succeed.

---

## Issue 3 — "Expired" documents are never counted as expired (MEDIUM)

**Where:** `server/routes/contractorPortal.ts`, the `document-stats` route (around lines 460–495), and the admin pending-docs view.

**The problem:** the stats summary counts documents by their `status` string — `pending` / `approved` / `rejected` / `expired`. But nothing in the codebase ever sets a contractor document's `status` to `expired`. Documents move between pending/approved/rejected only. Expiry is held in the `expiry_date` column and is only ever evaluated live by date elsewhere (e.g. `server/utils/contractorCompliance.ts` correctly does `expiryDate < now`). So the portal's `expired` count is always 0, and an approved-but-expired insurance certificate still shows as "approved" in the portal stats.

This is the same class of bug already logged against RAMS in the compliance dashboard — trusting a `status` value that's never transitioned by date.

**The fix:** compute "expired" from `expiry_date` at read time rather than trusting `status`. In `document-stats`, treat an active document as expired when `expiryDate` is set and in the past, and don't double-count it under its stored status:

```ts
const now = new Date();
let pending = 0, approved = 0, rejected = 0, expired = 0;
for (const d of docs) {
  if (d.expiryDate && new Date(d.expiryDate) < now) { expired++; continue; }
  if (d.status === 'approved') approved++;
  else if (d.status === 'rejected') rejected++;
  else pending++;
}
return res.json({ pending, approved, rejected, expired, total: docs.length });
```

(Select `expiryDate` and `status` in the query.) Keep it date-derived — do **not** add a cron that writes `status = 'expired'`, so this stays consistent with how the rest of the platform reads expiry.

**Verify:** add an approved document with an expiry date in the past → it shows under `expired`, not `approved`, in the stats response.

---

## Issue 4 — Login can pick the wrong contractor company (LOW–MEDIUM)

**Where:** `server/routes/contractorPortal.ts`, the login route (around lines 46–57).

**The problem:** portal users are unique per `(email, contractor_company_id)` — the same contact email can exist for two different contractor companies within one customer tenant. Login looks up the user by `email` + `isActive` with `.limit(1)` and no company, so if that email belongs to two companies it logs into whichever row comes back first — possibly the wrong company. Low likelihood, but when it happens the contractor sees another company's workers and documents, which for a compliance tool is a data-exposure problem, not just a UX glitch.

**The fix:** when more than one active account shares the email, don't guess. Either return all matches and have the client pick the company, or (simpler) fetch all matching active users, and if more than one bcrypt-matches the password, ask them to use the company-specific invite link. The minimum acceptable fix is: stop silently taking `.limit(1)` — detect the multi-match case and handle it explicitly rather than picking an arbitrary row.

**Verify:** create two active portal users with the same email under two different contractor companies, then log in — you must land on the correct company (or be asked which), never an arbitrary one.

---

## Issue 5 — Private documents are served with no access check (HIGH — confirm intent first)

**Where:** `server/routes/settings.ts` around line 740 (`GET /objects/:objectPath(*)`) and `server/objectStorage.ts` `downloadObject` (around line 99).

**The problem:** the route that serves uploaded files has no authentication and no ACL check. It just resolves the path and streams the file. `downloadObject` reads the object's ACL policy but only uses it to set the `Cache-Control` header — it never blocks a private object. The `canAccessObject` helper exists and is imported but isn't called on this route.

That means every contractor-portal upload — insurance, RAMS, **DBS certificates** (sensitive personal data) — is downloadable by anyone who has the URL, with no login. The only thing protecting it is the unguessable random UUID in the path. That's "security through obscurity", and these URLs travel through email, logs, and browser history.

**This is platform-wide, not just the portal** — every module that stores files uses this route — so confirm it's not deliberate before changing it. If it isn't deliberate (it shouldn't be for compliance documents), the fix is to enforce access on this route: require an authenticated session (staff session **or** a valid portal token), load the object's ACL, and call `canAccessObject` / `canAccessObjectEntity` before streaming. Return 401/403 instead of the file when the caller isn't allowed.

Because this one is broader and higher-risk, **flag it back to Andy before implementing** rather than changing the serving route blind. Note it, get a decision, then do it as its own piece of work.

---

## Scope guard

- Issues 1–4: change only `contractorPortal.ts`, `contractorPortalAuth.ts`, and the portal/document routes in `contractors.ts`. No client changes needed (the admin screen already behaves correctly once the backend does).
- Issue 5: confirm intent first; if approved, change the object-serving route and `objectStorage.ts` only.
- Don't touch the auth/token logic, the rate limiters, or unrelated contractor routes.
