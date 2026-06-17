# Bugfix — H&S Incidents page: broken photo evidence, tamper-proofing, roles, audit trail & performance (June 2026)

**Module:** H&S Incident Reports (`/hs-incidents`)
**Files:** `client/src/pages/HSIncidents.tsx`, `server/routes/hsIncidents.ts`, `client/src/lib/queryClient.ts` (read-only — use existing helpers), `server/routes/settings.ts` (`/objects` ACL — no change needed, we fix the path on our side)

> ⚠️ **This change adds a new database table (`hs_incident_audit`). You MUST run `npm run db:push` after applying it.**

Apply all eight fixes below. Keep the existing British English, en-GB dates, and the per-customer isolated-database pattern (`customerDbService.getCustomerDatabase(req.customerId!)`) throughout — every new query must stay scoped to the customer.

---

## Fix 1 — The photo evidence feature is completely broken (highest priority)

Right now photos never save and never display. Three separate faults stack up:

**(a) Upload sends an empty body.** In `HSIncidents.tsx` (`handleSubmit`, ~line 358) the file is uploaded with:
```ts
const uploadRes = await apiRequest("POST", "/api/hs-incidents/photo", fd as any);
```
`apiRequest` JSON-stringifies any truthy body and sets `Content-Type: application/json`, so the `FormData` is turned into the literal string `"{}"` and multer receives no file (returns 400). The error is swallowed with a "saved without photo" toast, so it looks intermittent.

**Fix:** upload with a raw `fetch`, exactly like the Compliance Certificate and Induction Settings pages do. Send the Bearer token and CSRF token manually; do **not** set `Content-Type` (the browser must set the multipart boundary). Import `getSessionToken` and `getCsrfToken` from `@/lib/queryClient`. Replace the upload block with:
```ts
let photoUrl = form.photoUrl || null;
if (photoFile) {
  setUploadingPhoto(true);
  try {
    const fd = new FormData();
    fd.append("photo", photoFile.file);
    const token = getSessionToken();
    const csrf = getCsrfToken();
    const headers: Record<string, string> = {};
    if (token) headers["Authorization"] = `Bearer ${token}`;
    if (csrf) headers["x-csrf-token"] = csrf;
    const uploadRes = await fetch("/api/hs-incidents/photo", {
      method: "POST",
      credentials: "include",
      headers,
      body: fd,
    });
    if (!uploadRes.ok) throw new Error("upload failed");
    const uploadData = await uploadRes.json();
    photoUrl = uploadData.url || null;
  } catch {
    toast({ title: "Photo upload failed", description: "The record will be saved without the photo.", variant: "destructive" });
  } finally {
    setUploadingPhoto(false);
  }
}
```

**(b) Stored path breaks the `/objects` ACL.** In `server/routes/hsIncidents.ts` (`POST /api/hs-incidents/photo`, ~line 798) the photo is stored at and returned as `/hs-incidents/{customerId}/{uuid}.ext`. The `/objects/:objectPath(*)` route treats the **first** path segment as the tenant id, so it reads `"hs-incidents"` as the customer, sees it doesn't match the logged-in customer, and returns **403 to the rightful owner**. The convention everywhere else (e.g. compliance certs use `/{customerId}/uploads/{uuid}`) is **customerId first**.

**Fix:** reorder the path so the customerId is the first segment, and whitelist the file extension (see Fix 6). Change the storage block to:
```ts
const customerId = req.customerId!; // requireAuth guarantees this
const fullPath = `${privateObjectDir}/${customerId}/hs-incidents/${objectId}.${ext}`;
// ...save unchanged...
const storedPath = `/${customerId}/hs-incidents/${objectId}.${ext}`;
```
(The `getObjectEntityFile` resolver already maps `/objects/{customerId}/hs-incidents/...` back to `${privateObjectDir}/{customerId}/hs-incidents/...`, so reads will resolve correctly once the path is customerId-first.)

**(c) `<img>` tags can't authenticate.** Both image renders use `src={`/objects${incident.photoUrl}`}` (list view ~line 1008, and the form preview ~line 1268) with no token. An `<img>` request can't send an Authorization header. Use the existing `objectUrl()` helper, which appends `?token=...`:
```ts
import { objectUrl } from "@/lib/queryClient";
// list view + form preview:
src={objectUrl(`/objects${incident.photoUrl}`)}
```
(The form preview only needs `objectUrl` for the already-saved `form.photoUrl` case — the freshly-picked `photoFile.preview` blob URL stays as-is.)

---

## Fix 2 — Stop legal records being silently destroyed (hard delete → admin-only + audited)

`DELETE /api/hs-incidents/:id` (~line 266) is a hard delete with no role check and no record of who did it. A RIDDOR incident (a legal record — failing to report is a criminal offence), a near miss, or an HSE reference number can be permanently erased by any logged-in user with no trace.

**Fix:** gate it to managers/admins **and** write the full deleted record into the new audit table (Fix 4) *before* deleting, so it can always be recovered. See the role helper and audit helper below. The delete handler must:
1. Reject non-admin/manager callers with 403.
2. Read the row first; if not found, 404.
3. Write an audit entry (`action: 'delete'`, `before: <full row>`).
4. Then delete.

---

## Fix 3 — Add role checks to the legal-action routes

Every route is currently `requireAuth` only — no role gating — despite the codebase having an established pattern (e.g. `['admin', 'manager'].includes(req.user!.role)`).

Add a local helper at the top of `registerHsIncidentRoutes`:
```ts
const requireManager = (req: any, res: any, next: any) => {
  if (!['admin', 'manager'].includes(req.user?.role || '')) {
    return res.status(403).json({ error: 'You need manager or admin permissions to do this.' });
  }
  next();
};
```
Apply it to the **management/legal** actions only — keep front-line reporting open so staff can still log incidents and resolve Good Spots (that openness is the whole point of the safety-culture module):
- `DELETE /api/hs-incidents/:id` → add `requireManager`
- `PATCH /api/hs-incidents/:id/riddor-reported` → add `requireManager`

Leave `POST` (create), `PUT` (edit), `PATCH /resolve`, GET and the PDF route on `requireAuth` as they are. If Andy later wants edit gated too, it's a one-line addition.

---

## Fix 4 — Add a proper audit trail (who-what-when, before/after)

Today "Resolved by" / "Investigated by" / "Reported by" are free-text fields the user types — they are **not** the logged-in user — and edits overwrite the record with no history. A fatality could be downgraded, or an HSE reference altered, with no trace.

**Add a new audit table to the isolated schema** (`server/isolatedSchema.ts`), following the existing table style in that file:
```ts
export const hsIncidentAudit = pgTable("hs_incident_audit", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()::text`),
  incidentId: varchar("incident_id"),          // not FK — we keep audit rows after deletes
  action: text("action").notNull(),             // 'create' | 'update' | 'delete' | 'riddor_reported' | 'resolve'
  actorUserId: varchar("actor_user_id"),
  actorUsername: text("actor_username"),
  before: jsonb("before"),
  after: jsonb("after"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});
```
(Import `jsonb` from `drizzle-orm/pg-core` if it isn't already imported there.)

In `hsIncidents.ts`, add a small helper and call it from each mutating route:
```ts
async function writeIncidentAudit(custDb: any, req: any, action: string, incidentId: string, before: any, after: any) {
  try {
    await custDb.insert(isolatedSchema.hsIncidentAudit).values({
      incidentId,
      action,
      actorUserId: (req as any).userId ?? null,
      actorUsername: req.user?.username ?? null,
      before: before ?? null,
      after: after ?? null,
    });
  } catch (e) {
    logger.error('Failed to write incident audit entry:', e); // never block the main action
  }
}
```
Wire it in:
- **create** → after the insert: `writeIncidentAudit(custDb, req, 'create', created.id, null, created)`
- **update** → read the row before updating, then: `writeIncidentAudit(custDb, req, 'update', req.params.id, beforeRow, updated)`
- **riddor-reported** → `writeIncidentAudit(custDb, req, 'riddor_reported', req.params.id, beforeRow, updated)`
- **resolve** → `writeIncidentAudit(custDb, req, 'resolve', req.params.id, beforeRow, updated)`
- **delete** → as described in Fix 2: `writeIncidentAudit(custDb, req, 'delete', req.params.id, beforeRow, null)` before deleting.

Also add the table create to `ensureHsIncidentsTable` (idempotent `CREATE TABLE IF NOT EXISTS "${schemaName}".hs_incident_audit (...)`) so existing customers get it without a manual migration, mirroring the columns above.

---

## Fix 5 — Stop rebuilding the table on every request (performance)

`ensureHsIncidentsTable` runs 1 `CREATE` + 13 `ALTER TABLE` + a table-wide `UPDATE` on **every** GET/POST/PUT/PDF request (~line 17). On a busy account that's a lot of needless DDL and a full-table write per page load.

**Fix:** run it at most once per customer per process. Add a module-level cache:
```ts
const ensuredSchemas = new Set<string>();
async function ensureHsIncidentsTable(custDb: any, schemaName: string) {
  if (ensuredSchemas.has(schemaName)) return;
  // ...existing CREATE/ALTER/UPDATE body, plus the new audit table from Fix 4...
  ensuredSchemas.add(schemaName);
}
```
The legacy `UPDATE ... SET record_type = 'near_miss'` migration then runs only once per process instead of on every request, which is fine — it's a one-off backfill.

---

## Fix 6 — Sanitise the upload file extension

In the photo route (~line 792), `ext` comes straight from the user-supplied filename (`req.file.originalname.split('.').pop()`) and can contain `/` or path characters that get injected into the storage path.

**Fix:** whitelist to known image extensions, falling back to deriving it from the (already-validated) mime type:
```ts
const rawExt = (req.file.originalname.split('.').pop() || '').toLowerCase();
const allowed = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic'];
const ext = allowed.includes(rawExt)
  ? rawExt
  : (req.file.mimetype.split('/')[1] || 'jpg').replace(/[^a-z0-9]/g, '');
```

---

## Fix 7 — Validate input on create/update

`POST` and `PUT` trust the body blindly. A missing `title` or a bad `incidentDate` currently produces a generic 500.

**Fix:** at the top of both handlers (after parsing `body`), validate and return a clear 400:
```ts
if (!body.title || !String(body.title).trim()) {
  return res.status(400).json({ error: 'A title is required.' });
}
const parsedDate = new Date(body.incidentDate);
if (!body.incidentDate || isNaN(parsedDate.getTime())) {
  return res.status(400).json({ error: 'A valid incident date and time is required.' });
}
```
Use `parsedDate` where the code currently builds `incidentDate`. (On `PUT`, only validate the date if `body.incidentDate` was supplied, since edits may be partial.)

---

## Fix 8 — Fix possible BST hour-drift on incident times

The `datetime-local` value (e.g. `2026-06-17T14:30`) is parsed with `new Date(...)` on the server, which interprets it in the **server's** timezone. On a UTC-hosted server, a time entered in BST is stored an hour off.

**Fix:** keep storage in UTC (correct), but make the entered local time unambiguous. The simplest robust fix is to interpret the incoming `datetime-local` string as **Europe/London** wall-clock time before storing. If a date utility is already used elsewhere for London time, reuse it; otherwise append the correct offset based on the date, or document that the input is treated as London time and ensure the server `TZ` is set to `Europe/London`. At minimum, confirm the deployment sets `TZ=Europe/London` so `new Date('2026-06-17T14:30')` matches what the user typed. Flag in the PR description which approach was taken so we can verify a logged time displays back identically.

---

## After applying

1. **Run `npm run db:push`** (new `hs_incident_audit` table).
2. Test the full photo journey: add a photo on a new incident → save → confirm the thumbnail displays in the list and in the edit form, and the PDF/record open without a 403.
3. Confirm a non-manager user gets a clear 403 when trying to delete or mark-RIDDOR-reported, and that a manager can.
4. Confirm deleting an incident leaves a `delete` row in `hs_incident_audit` containing the full record.
5. Confirm a record logged at a given time displays back at the same time (no hour drift).
