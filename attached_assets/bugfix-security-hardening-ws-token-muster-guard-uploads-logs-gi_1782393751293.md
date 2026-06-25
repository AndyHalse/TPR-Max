# Bugfix — Security hardening sweep (5 items)

**Date written:** 25 June 2026
**Source:** `/tpr-security-scan` privacy & exposure review
**Risk:** Medium / Low — no critical live leak. The previously-critical muster
WebSocket cross-tenant leak is already fixed; these are the residual hardening
items found in the same review.
**Database migration:** **NONE.** Do **NOT** run `npm run db:push`. All five
changes are code-only and reuse existing tables.

---

## Context for the developer

TPR is multi-tenant life-safety software. Customers are kept apart by filtering
every data access with `customerId` (a random UUID). These five fixes tighten
the edges. Apply them all in one pass. Do not change behaviour beyond what each
item describes, and do not touch the database schema.

---

## Fix 1 — Verify the muster WebSocket `emergency-token` properly (do not trust the prefix)

**File:** `server/websocketService.ts`, function `validateCredential`, the
`case 'emergency-token'` block (around lines 41–45).

**Problem:** When a browser registers for the live muster feed with an
`emergency-token`, the server only checks that the part of the token before the
first dot equals the claimed `customerId`:

```ts
case 'emergency-token': {
  // Safety tokens have format customerId.base64url — the prefix is the customerId
  const prefix = credential.split('.')[0];
  return prefix === customerId;
}
```

This does **no real verification** of the token — any string of the form
`<customerId>.anything` is accepted. Because `customerId` is a random UUID it is
not trivially guessable, but this is still weak: anyone who learns a customer's
UUID could subscribe to that customer's live evacuation feed (who is safe / who
is still missing).

**Fix:** Validate the token the same authoritative way the rest of the app does
— by looking it up in that customer's **isolated `safetyTokens` table** (the same
lookup used in `server/routes/emergency.ts` around line 4458, where a safety
token is resolved by `eq(isolatedSchema.safetyTokens.token, token)`). The token
is valid only if a row exists **for that customer** and it has not expired.

Replace the `emergency-token` case with a DB-backed check, for example:

```ts
case 'emergency-token': {
  // Do NOT trust the prefix. Verify the token exists in THIS customer's
  // isolated safetyTokens table and has not expired.
  try {
    const customerDb = await customerDbService.getCustomerDatabase(customerId);
    const now = new Date();
    const rows = await customerDb
      .select({ id: isolatedSchema.safetyTokens.id })
      .from(isolatedSchema.safetyTokens)
      .where(and(
        eq(isolatedSchema.safetyTokens.token, credential),
        gt(isolatedSchema.safetyTokens.expiresAt, now)
      ))
      .limit(1);
    return rows.length > 0;
  } catch (err) {
    logger.warn('WebSocket emergency-token validation failed', {
      error: err instanceof Error ? err.message : String(err),
    });
    return false;
  }
}
```

- Add the imports this needs at the top of `websocketService.ts`:
  `customerDbService` (the per-customer DB service used elsewhere in the
  server), `isolatedSchema`, and `gt` from `drizzle-orm` (the file already
  imports `and`, `eq`). Match the exact import paths used by
  `server/routes/emergency.ts` so this resolves the same `safetyTokens` table.
- Because the `safetyTokens` table lives in the **customer-isolated** schema,
  scoping the query to that customer's DB is itself the tenant check — a token
  from another customer simply won't be found.
- Do not change the other cases (`fire-marshal`, `session`, `monitor`); they are
  already validated correctly.

**Acceptance:** Registering on `/ws/muster` with `credentialType:
'emergency-token'` and a made-up `<someUUID>.fake` token is **rejected**
(`register_failed`). A genuine, unexpired safety token issued for that customer
is **accepted**.

---

## Fix 2 — Add an auth guard to the muster toggle endpoint

**File:** `server/routes/emergency.ts`, route
`app.post("/api/muster/:personId/toggle", ...)` (around line 5575).

**Problem:** This endpoint flips a person's "accounted for" status during an
evacuation, but it has **no auth guard** — unlike its sibling
`app.post("/api/muster/mark-all-safe", requireAuthOrFireMarshal, ...)` (line
5754). Today it relies on `req.customerId` being set and throws a 500 when it is
not. It is **not** a cross-tenant leak (it only ever touches the caller's own
tenant), but it returns a messy 500 instead of a clean 401, and a Fire Marshal
with no login session currently **cannot** use it at all.

**Fix:** Add the same middleware used by `mark-all-safe`:

```ts
app.post("/api/muster/:personId/toggle", requireAuthOrFireMarshal, async (req, res) => {
```

`requireAuthOrFireMarshal` is already imported and used in this file. It sets
`req.customerId` from either the session or a valid `x-fire-marshal-id` header,
and returns a clean 403/401 otherwise. No other change to the handler body is
needed — it already scopes every lookup to `req.customerId`'s database.

**Acceptance:** An unauthenticated call returns a clean 401/403 (not a 500). A
logged-in user toggles only their own tenant's people. A Fire Marshal using a
valid URL ID (via the `x-fire-marshal-id` header) can now toggle.

---

## Fix 3 — Add a file-type whitelist to the uploads that lack one

**Problem:** These upload handlers cap file **size** but accept **any** file
type (no `fileFilter`). Lower risk because files go to object storage and are
downloaded rather than served inline, but a MIME/extension whitelist is cheap
hardening:

- `server/routes/rams.ts:34` — `evidenceUpload`
- `server/routes/complianceCertificates.ts:17` — `upload`
- `server/routes/contractors.ts:85` — `docRequestUpload`
- `server/routes/contractors.ts:1999` — `contractorDocUpload`
- `server/routes/induction.ts:1785` — `workerDocUpload`
- `server/routes/permitToWork.ts:16` — `upload`

**Fix:** Add a `fileFilter` to each `multer({...})` call, following the **exact
same pattern already used** in `server/routes/hsIncidents.ts:876` and
`server/routes/platformAdmin.ts:22` (copy their style so it's consistent). Allow
the document/image types these features legitimately accept:

```ts
fileFilter: (_req, file, cb) => {
  const allowed = [
    'application/pdf',
    'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif',
    // office docs where the feature accepts them (certs, RAMS evidence, contractor docs):
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ];
  if (allowed.includes(file.mimetype)) return cb(null, true);
  return cb(new Error('Unsupported file type'));
},
```

- Keep each route's existing `fileSize` limit unchanged.
- For the photo-only routes, narrow the list to images + PDF as appropriate;
  for document routes keep the office types. Use judgement to match what each
  feature already lets users upload — do not reject files that currently work.
- Make sure the multer error surfaces as a clean 400 ("Unsupported file type")
  to the user, matching how `hsIncidents.ts` already handles a rejected upload.

**Acceptance:** Uploading an allowed PDF/image/doc still works on every listed
route; uploading e.g. a `.html` or `.svg` is rejected with a clear message.

---

## Fix 4 — Stop logging personal data at info level

**Problem:** Around 39 log lines print names/emails, and a couple print
Right-to-Work status, e.g.:

- `server/databaseService.ts:2154` — `logger.info('  - rightToWork: ${updates.rightToWork} ...')`
- `server/databaseService.ts:2282` — `logger.info('  - rightToWork: ${updated.rightToWork}')`
- plus assorted `logger.info(...)` / `logger.debug(...)` lines that interpolate
  `.email`, `firstName`/`lastName`, or full names.

Personal data sitting in plaintext logs is more PII than the logs need.

**Fix (conservative — do not change error handling):**
- For the two `databaseService.ts` RTW lines above: either remove them or log a
  non-personal marker instead (e.g. `logger.info('RTW field updated')` with **no
  value**). RTW status is employment-eligibility data and should not be in logs.
- For `logger.info`/`logger.debug` lines that interpolate a person's name or
  email purely for tracing: replace the name/email with the record's **ID**
  (e.g. log `staffId`/`workerId` instead of `firstName lastName` / `email`).
- **Do not** touch `logger.error(...)` lines that pass an error object (e.g.
  `logger.error('DBS fetch error:', err)`) — those don't print PII and are
  needed for diagnostics.
- Leave the muster broadcast logs that include `personName` **as they are only
  if** they're essential for life-safety auditing; otherwise switch them to
  `personId`. Use judgement — the goal is "no names/emails/RTW in routine info
  logs", not stripping useful diagnostics.

**Acceptance:** A normal request no longer writes a person's name, email, or RTW
status to the logs at info/debug level. Error logs still work.

---

## Fix 5 — Add a bare `.env` to `.gitignore`

**File:** `.gitignore`.

**Problem:** `.gitignore` ignores `.env.local` and `.env.production` but **not** a
plain `.env`. If this project is ever pushed to a Git remote with a real `.env`
present, the secrets in it would be committed.

**Fix:** Add a line so `.env` is ignored (keep `.env.example` tracked):

```
.env
```

Place it next to the existing `.env.local` / `.env.production` lines. Do **not**
add `.env.example` to `.gitignore` — that file must stay tracked.

**Acceptance:** `.env` is git-ignored; `.env.example` is still tracked.

---

## Summary checklist

- [ ] Fix 1 — WS `emergency-token` verified against `safetyTokens` table, not the prefix
- [ ] Fix 2 — `requireAuthOrFireMarshal` added to `/api/muster/:personId/toggle`
- [ ] Fix 3 — `fileFilter` MIME whitelist added to the 6 listed upload routes
- [ ] Fix 4 — names/emails/RTW removed from info/debug logs (error logs untouched)
- [ ] Fix 5 — `.env` added to `.gitignore`
- [ ] **No `npm run db:push`** was run (none of these need it)

After applying, restart the app and do a quick smoke test: start an evacuation,
open the live muster screen, toggle a person safe, and upload one document on a
contractor/RAMS/compliance form — all should still work.
