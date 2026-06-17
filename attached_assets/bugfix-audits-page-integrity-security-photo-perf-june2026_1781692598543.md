# Audits & Inspection module — integrity, security, photo, performance & audit-trail fixes

**Module:** Audit & Inspection Engine
**Files:** `server/routes/auditEngine.ts`, `client/src/pages/Audits.tsx`, `client/src/pages/AuditMobile.tsx`, `server/isolatedSchema.ts`
**⚠️ This prompt adds new database columns and a new table — run `npm run db:push` after applying.**

Do not change anything outside the Audit & Inspection module. Keep the existing tenant-isolation pattern (every query runs against `custDb` from `customerDbService.getCustomerDatabase(context.customerId)`) — do not break it. Read the existing code before editing; match the existing style.

---

## 1. Stop completed audits and corrective actions being permanently deleted (soft-delete + protect evidence)

Hard deletes currently destroy compliance evidence with no trace.

- In `server/isolatedSchema.ts`, add to **`auditRecords`**, **`auditCorrectiveActions`** and **`auditTemplates`**:
  - `deletedAt: timestamp("deleted_at")` (nullable)
  - `deletedBy: text("deleted_by")` (nullable)
- Change the three DELETE endpoints (`DELETE /api/audits/records/:id`, `DELETE /api/audits/actions/:id`, `DELETE /api/audits/templates/:id`) from hard `custDb.delete(...)` to a soft-delete UPDATE that sets `deletedAt = new Date()` and `deletedBy = req.user!.name || req.user!.username`.
- **Block deletion of completed audits entirely:** in `DELETE /api/audits/records/:id`, if the record `status === 'completed'`, return `403` with `{ error: 'Completed audits cannot be deleted — they are compliance evidence.' }`.
- Exclude soft-deleted rows from every read: add `isNull(...deletedAt)` to the WHERE of `GET /records`, `GET /records/:id`, `GET /templates`, `GET /templates/:id`, `GET /actions`, `GET /records/:id/actions`, and the `/summary` queries.

## 2. Add role checks (managers/admins only for write/delete)

Currently any authenticated user with the feature flag can create, edit and delete everything. Use the same role/permission check used elsewhere in the codebase (find how other modules gate admin/manager actions — match that exact pattern; do not invent a new one).

- **Read** endpoints (GET templates, records, actions, summary): any authenticated user — leave as-is.
- **Write/delete** endpoints (all POST/PUT/DELETE under `/api/audits`, including `/start`, `/submit`, `/send-link`, `/token`, `/actions/:id/close`, template + item create/update/delete): require manager/admin role. Return `403` with a clear message if not authorised.
- The **public** `/api/audits/public/...` endpoints stay open (they are token-gated by design) — do not add role checks there.

## 3. Prevent silent score tampering on completed audits

`PUT /api/audits/records/:id` accepts any field via `insertAuditRecordSchema.partial()`, so `passed` / `overallScore` / `status` can be overwritten without changing answers.

- In `PUT /api/audits/records/:id`, strip `overallScore`, `passed`, `status`, `conductedAt`, `accessToken`, `accessTokenExpiresAt` from the accepted body (allow only editable metadata like title, location, scheduledDate, summary, category, assignee).
- Score/pass/status must only ever be set by the `/start`, `/submit` and cron flows that calculate them.

## 4. Lock the mobile link once an audit is submitted

The public edit and submit endpoints have no status check, so a completed audit can be re-opened and re-submitted within the 7-day window.

- In `PUT /api/audits/public/:token` and `POST /api/audits/public/:token/submit` and `POST /api/audits/public/:token/upload`: after resolving the record, if `record.status === 'completed'`, return `410` with `{ error: 'This audit has already been submitted and can no longer be changed.' }`.

## 5. Harden the public photo-upload endpoint

In `POST /api/audits/public/:token/upload` (and apply the same to the authenticated item-upload path if it shares logic):

- **Sanitise the filename** before building the storage path — strip any path separators and `..` (e.g. keep only the base name and a safe character set). Never concatenate the raw `fileName` into the object path.
- **Cap the size:** reject if the decoded buffer exceeds ~6 MB → `413` `{ error: 'Image too large. Please use a smaller photo.' }`.
- **Allow images only:** reject if `mimeType` is not in an allow-list (`image/jpeg`, `image/png`, `image/webp`, `image/heic`) → `400`.

## 6. Resize mobile photos in the browser before upload

In `client/src/pages/AuditMobile.tsx` (the `FileReader`/upload handler around lines 53–116): before sending, downscale the image with a canvas to max 1280px on the long edge and re-encode as JPEG (quality ~0.8), then send that — reuse the same client-side resize approach already used for the Staff photo upload. Show an honest error if the upload still fails. This stops normal phone photos failing the size limit.

## 7. Reject malformed tokens before the full-fleet database scan

In `resolveAuditDb()` (`server/routes/auditEngine.ts` ~line 44): the legacy fallback loops through every customer database for any unresolved token. Before the fallback scan, validate the token shape — it must look like `customerId.<hex>` (a dot with non-empty parts, hex of expected length). If it doesn't match, return `null` immediately and skip the fleet-wide scan. Keep the legacy scan only for correctly-shaped tokens that miss the prefix lookup.

## 8. Paginate / aggregate the heavy read endpoints

- `GET /api/audits/records`: add pagination (page + pageSize query params, sensible default e.g. 50, newest first) instead of returning every record. Update `Audits.tsx` to use it.
- `GET /api/audits/summary`: replace the load-everything-then-filter-in-JS counts with database-side `count()` / conditional aggregates where practical (mirror the existing `itemCounts` groupBy pattern already used for templates). Behaviour and numbers must stay identical.

## 9. Add an activity log for sensitive audit actions

Add a new table in `server/isolatedSchema.ts` — `auditActivityLog` — append-only:
- `id` (uuid pk), `auditId` (nullable varchar), `actorName` (text), `action` (text, e.g. `record.deleted`, `record.completed`, `action.closed`, `template.deleted`, `score.recalculated`), `detail` (text, nullable — short human-readable note), `createdAt` (timestamp defaultNow).
- Write one row (best-effort, wrapped so a logging failure never breaks the main action — but log the failure via `logger`) on: record soft-delete, action soft-delete, template soft-delete, audit submit (desktop + mobile), and corrective-action close.
- No edit/delete endpoints for this table — it is append-only.

## 10. Record who actually completed a mobile audit

When an audit is completed via `POST /api/audits/public/:token/submit`, the original `conductedBy` (set at creation) is kept even though someone else did it on their phone. Add an optional `completedByName` to the public submit body, and if the mobile screen collects/holds the assignee name, save it to a new nullable `auditRecords.completedBy: text("completed_by")` column (add in schema) so the evidence shows who actually carried it out. Display it on the audit detail view in `Audits.tsx`. If no name is supplied, leave `completedBy` null and keep showing `conductedBy`.

---

## After applying
1. Run `npm run db:push` (new columns on `audit_records`, `audit_corrective_actions`, `audit_templates`, plus the new `audit_activity_log` table).
2. Smoke test: create → start → complete an audit (desktop and mobile link), upload a photo from a phone, try to delete a completed audit (should be blocked), confirm a non-manager cannot delete/edit, confirm a submitted mobile link can no longer be changed, and confirm the activity log records the actions.
