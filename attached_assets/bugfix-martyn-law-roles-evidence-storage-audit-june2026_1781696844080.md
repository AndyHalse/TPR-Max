# Bugfix — Martyn's Law module: roles, evidence storage, audit honesty, validation & polish

**Module:** Martyn's Law (UK Protect Duty) compliance
**Files:** `client/src/pages/MartynLaw.tsx`, `server/routes/rams.ts`, (config table `martyn_law_config` in `server/isolatedSchema.ts`)
**Date:** 17 June 2026
**db:push needed?** **No.** All columns already exist. This is code-only.

> ⚠️ Scope guard: the Martyn's Law endpoints live in `server/routes/rams.ts` alongside the separate RAMS document routes. **Only touch the Martyn's Law / compliance endpoints and the evidence upload/download — do NOT change the RAMS document routes (`/api/rams...`) in this prompt.**

This fixes ten issues found in a deep-dive review. Apply them all.

---

## 🔴 1. Add role checks to every write (currently anyone logged in can edit)

Right now `PUT /api/martyn-law`, `POST /api/martyn-law/evidence/upload`, the file download, and the compliance endpoints only use `requireAuth`. Any user — including a basic reception/kiosk login — can rewrite the security plan, change the Designated Security Supervisor, or delete evidence.

Mirror the existing pattern used in `server/routes/contractors.ts` (e.g. line 857):

```ts
if (!['admin', 'manager'].includes(req.user!.role)) {
  return res.status(403).json({ error: 'Administrator or manager access required' });
}
```

- **`PUT /api/martyn-law`** — add the role check at the top (after `customerId`).
- **`POST /api/martyn-law/evidence/upload`** — add the role check.
- **Reading is fine for any authenticated user**: leave `GET /api/martyn-law`, `GET /api/compliance/summary`, `GET /api/compliance/report`, and the evidence file download open to `requireAuth` (so staff can view/print), but the download must still be customer-scoped — see #3.

In `MartynLaw.tsx`, also hide/disable the **Save All**, **Add Entry**, evidence **delete**, **Attach File**, and checklist-toggle controls for users who aren't admin/manager (read the current user's role from wherever the app already exposes it — follow the same approach another page uses, e.g. the Staff or Contractor page). Viewers should see the record but not be able to edit it.

---

## 🔴 2. Move evidence files OFF local disk into object storage

This is the only module in the app still writing uploads to a local folder (`EVIDENCE_UPLOAD_DIR = path.resolve('./uploads/martyn-law')` at `rams.ts:20`). On redeploy the container filesystem is wiped, so every uploaded compliance evidence file is permanently lost while the evidence log still shows a dead link.

Switch it to the same object-storage pattern every other module uses (see `server/routes/complianceCertificates.ts` lines 304–341):

- Use `import { ObjectStorageService, objectStorageClient } from '../objectStorage';` and `multer.memoryStorage()` (not disk storage). Keep the 10 MB limit.
- On upload, save to a **per-customer path**:
  ```ts
  const privateDir = objectStorage.getPrivateObjectDir();
  const objectId = randomUUID();
  const customerId = req.customerId!;
  const fullPath = `${privateDir}/${customerId}/martyn-law/${objectId}`;
  const parts = fullPath.slice(1).split('/');
  const bucket = objectStorageClient.bucket(parts[0]);
  await bucket.file(parts.slice(1).join('/')).save(req.file.buffer, { contentType: req.file.mimetype, resumable: false });
  const url = `/objects/${customerId}/martyn-law/${objectId}`;
  res.json({ url, name: req.file.originalname });
  ```
- Delete the `EVIDENCE_UPLOAD_DIR` constant, the `fs.mkdirSync`, the `evidenceStorage` disk config, and the old `GET /api/martyn-law/evidence/file/:filename` route. The evidence log's `documentUrl` now points at `/objects/...`, which is already served (and ACL-checked) by the existing `/objects` route.
- The client (`handleFileAttach`) already just reads `data.url` and `data.name`, so no client change needed beyond the document link continuing to work.

---

## 🔴 3. Lock evidence downloads to the requesting customer

Because files now live under `/objects/${customerId}/martyn-law/...` and are served by the existing `/objects` ACL route, this is resolved by #2 — the path is customer-scoped and the `/objects` handler already checks access. **Verify** that a user from customer A cannot fetch a `/objects/<customerB-id>/martyn-law/...` URL. If the `/objects` route does not already enforce that the path's customer segment matches `req.customerId`, add that check there.

---

## ⚠️ 4. Make the audit trail honest about what changed

The page tells the user the audit trail records "who, when, and **what changed**" (tooltip at `MartynLaw.tsx:1053`, text at line 1056), but `PUT /api/martyn-law` only ever logs the entry `"Record saved"` (`rams.ts:273`).

Pick one — **prefer capturing a real change summary**:
- Before writing the update, load the existing row, compare the key fields (venueType, venueCapacity, isInScope, supervisorName, siaProviderName/expiry, the four plan text fields, checklist completed-count, evidence count), and build a short human list of what changed, e.g. `"Updated: Supervisor, Lockdown procedure, Evidence (+1)"`. Store that as the audit entry's `action` instead of the flat `"Record saved"`.
- If a full diff is too much, at minimum change the wording in the UI (tooltip + helper text) so it no longer claims it records *what* changed — only *who and when*.

---

## ⚠️ 5. Validate uploaded file types on the server (stored-XSS risk)

`evidenceUpload` only limits size; the `accept=` attribute is client-side only, so the server will store any file type. An uploaded `.html` or `.svg` containing a script would run from the app's own origin when opened.

- Add a `fileFilter` to the multer config that whitelists the same types the UI offers: `pdf, doc, docx, xls, xlsx, jpg, jpeg, png`. Reject anything else with a clear 400.
- The `/objects` route should serve these with `Content-Disposition: attachment` (download) rather than inline where possible; if that's controlled centrally, confirm evidence files download rather than render. At minimum ensure non-image/non-pdf types can't render inline.

---

## ⚠️ 6. Validate the save payload

`PUT /api/martyn-law` trusts `req.body` directly, unlike the RAMS routes which use `insertRamsDocumentSchema.safeParse`. Add a small `zod` schema for the Martyn's Law body: `venueCapacity` a non-negative integer (or null), `supervisorEmail` a valid email when present, `isInScope` a boolean, the text fields strings. Reject with 400 on failure. Keep it lenient — these are mostly free-text — but stop obviously bad input.

---

## 🟡 7. Show evidence dates in UK format

In `MartynLaw.tsx` the evidence list renders the raw stored string (`{entry.date}` at line 924), showing e.g. `2026-06-17`. Format it to en-GB to match the rest of the page:
```tsx
{format(new Date(entry.date), "dd MMM yyyy")}
```

---

## 🟡 8. Make the audit-log append atomic

The audit append (`rams.ts:291–304`) does a separate read-then-write of the `audit_log` column, so two near-simultaneous saves can lose an entry. Use a single SQL statement to append rather than read-modify-write, e.g. append to the existing JSON in one `UPDATE` (Postgres `jsonb` concat or `COALESCE(audit_log,'[]')`), keeping the trim-to-last-200 behaviour.

---

## 🟡 9. Refresh the "Last reviewed" banner after saving

After a successful save the page invalidates `/api/martyn-law` but the local `form` state isn't re-synced (the `initialized` guard at `MartynLaw.tsx:243` only runs once), so the "Last reviewed" date and in-scope badge can look stale until a manual reload. On `saveMutation.onSuccess`, update `form` (and `checklist`/`evidence`) from the mutation's returned record, or re-sync `form` from the refetched `config`.

---

## 🟡 10. Remind when the annual review or SIA licence is overdue

Both `lastReviewedAt` (the Act requires at least a 12-monthly review) and `siaExpiryDate` are captured but nothing flags them when overdue. Add a lightweight reminder consistent with other modules:
- On the page, show an amber warning badge when `lastReviewedAt` is more than 12 months ago, or when `siaExpiryDate` is in the past or within 30 days.
- Optionally (if a daily compliance cron already exists on `Europe/London`), include an overdue-review / SIA-expiry line in it. Do not add a brand-new cron just for this if one isn't already there — the on-page badge is the priority.

---

## Acceptance checklist
- [ ] A non-admin/non-manager user gets a 403 on save/upload and sees read-only UI.
- [ ] Uploaded evidence survives a redeploy (stored in object storage, not local disk).
- [ ] A user cannot open another customer's evidence file via a guessed `/objects/...` URL.
- [ ] The audit trail either lists what changed, or the UI no longer claims it does.
- [ ] Uploading a `.html`/`.exe`/`.svg` is rejected with a clear message.
- [ ] Bad save payloads (e.g. negative capacity, malformed email) are rejected.
- [ ] Evidence dates display as `17 Jun 2026`.
- [ ] Saving a review immediately updates the "Last reviewed" banner without a reload.
- [ ] Overdue annual review / SIA expiry shows an amber warning on the page.
- [ ] RAMS document routes (`/api/rams...`) are untouched.
