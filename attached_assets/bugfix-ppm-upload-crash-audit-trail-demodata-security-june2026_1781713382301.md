# PPM module — fix upload crash, add audit trail, stop full-data wipe, close security gaps (June 2026)

## ⚠️ This prompt needs `npm run db:push`
It adds a new `ppm_audit` table (finding 2). Run `npm run db:push` after the schema change and before relying on the audit trail.

## Context
Deep review of the PPM (Planned Preventive Maintenance) module on 17 Jun 2026. The module is well-built overall — strong per-tenant isolation, admin role checks on every write, the rolling-token contractor mobile flow, upload limits, dedup-guarded London crons, and a contractor-compliance hard-gate. These fixes close the remaining gaps. Apply **all** of the following.

**Files in play:** `server/routes/ppm.ts`, `server/isolatedSchema.ts`, `client/src/pages/PPM.tsx`, `client/src/components/PpmDashboard.tsx`.

Keep British English (en-GB) and the existing code style throughout.

---

## 1. 🔴 SHOWSTOPPER — contractor file upload crashes (missing import)

`server/routes/ppm.ts` line ~2639 uses `objectStorageClient.bucket(bucketName)` inside `POST /api/ppm/work-order/public/:token/files`, but `objectStorageClient` is **never imported** — only `ObjectStorageService` is. Every contractor cert/report/photo upload throws `ReferenceError: objectStorageClient is not defined` and returns 500. This is the only upload path (the old `/upload` and `/documents` routes are 410'd), so contractor evidence capture is fully broken. It also fails `npm run check`.

**Fix:** change the import on line 9 from:
```ts
import { ObjectStorageService } from '../objectStorage';
```
to:
```ts
import { ObjectStorageService, objectStorageClient } from '../objectStorage';
```
(`objectStorageClient` is already exported from `server/objectStorage.ts`.) Verify the `/files` upload now succeeds end to end from the contractor mobile view.

---

## 2. 🔴 Add an audit trail + stop silent hard-deletion of compliance evidence

There is no audit logging anywhere in PPM, and completed work orders plus their uploaded service certificates (statutory fire/gas/electrical/lift evidence) can be hard-deleted by any admin with no trace.

**2a. New audit table** in `server/isolatedSchema.ts`, mirroring the existing `fraAudit` / `hsIncidentAudit` style:
```ts
export const ppmAudit = pgTable("ppm_audit", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()::text`),
  entityType: text("entity_type").notNull(), // work_order | document | schedule | asset | demo_reset
  entityId: varchar("entity_id"),
  event: text("event").notNull(), // created | updated | completed | deleted | assigned | document_uploaded | document_deleted | demo_data_wiped
  performedBy: text("performed_by"),
  details: jsonb("details"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});
```

**2b. Write audit rows** on every sensitive action in `server/routes/ppm.ts`. Add a small helper at module scope and call it (best-effort, wrapped so a logging failure never breaks the main action):
```ts
async function logPpmAudit(custDb: any, entityType: string, entityId: string | null, event: string, performedBy: string | null, details?: unknown) {
  try {
    await custDb.insert(isolatedSchema.ppmAudit).values({ entityType, entityId, event, performedBy: performedBy ?? null, details: details ?? null });
  } catch (e) { logger.error("[PPM audit] failed to write audit row", e); }
}
```
Call it on: work-order create / update (capture status change) / **delete** / duplicate / assign; document upload (admin **and** contractor `/files`) and document delete; schedule create/update/delete; asset create/update/delete; and the demo-data wipe (see #3). For contractor public-endpoint actions use `performedBy: "contractor"`. For admin actions use `req.user!.username`. On deletes, record enough in `details` (title, status, completedDate, contractor) to reconstruct what was removed.

**2c. Block hard-deletion of completed work orders.** In `DELETE /api/ppm/work-orders/:id`, load the row first; if `status === "completed"`, return `400 { error: "Completed work orders are compliance records and cannot be deleted. Cancel it instead if needed." }`. (Keep delete allowed for non-completed statuses.) Log a `deleted` audit row for the ones that are allowed through.

> Decision needed only if you disagree: an alternative is a soft-delete (`deletedAt`) so nothing is ever physically removed. The above (block-completed + audit) is simpler and matches what the other modules are doing — go with it unless Andy says otherwise.

---

## 3. ⚠️ "Delete demo data" wipes ALL real PPM data

`DELETE /api/ppm/demo-data` (server/routes/ppm.ts ~2156) runs unconditional `custDb.delete(table)` on every PPM table — there is no "is this demo?" filter. Labelled "Delete All Demo Data" in `PPM.tsx`, but an admin who has entered real work orders/certificates loses everything with no undo.

**Fix (defensive, no schema change required):** make the wipe safe rather than relying on a flag:
- Before deleting, count real-looking work orders — i.e. any work order whose `status === "completed"` **or** that has any linked documents. If any exist, **refuse**: return `400 { error: "Real PPM data detected (completed work orders or uploaded documents). Demo reset is blocked to protect your records. Delete items individually if you really mean to." }`.
- Only when no completed/with-document work orders exist, proceed with the wipe (this is the genuine "demo only, never used for real" case).
- Write a `demo_data_wiped` audit row (entityType `demo_reset`) recording counts removed and `performedBy`.
- Tighten the client confirm wording in `PPM.tsx` `handleDeleteDemo` (~line 2572) to: "This permanently deletes all PPM assets, schedules and work orders, and the demo contractor companies. It cannot be undone. Continue?" — drop the implication that it only removes "demo" rows.

---

## 4. ⚠️ Public token endpoints scan every tenant DB on a cache miss

GET/PUT/arrive/files fall back to iterating `getAllCustomers()` and querying each tenant when the token cache misses. A wrong-but-valid-length token forces O(tenants) work. It's rate-limited, but tighten it:
- The token is generated as `randomBytes(24).toString("hex")` = exactly 48 hex chars. Reject anything that isn't a 48-char hex string **before** any scan: `if (!/^[a-f0-9]{48}$/.test(token)) return res.status(400).json({ error: "Invalid token" });`. Apply to all four public endpoints (GET, PUT, arrive, files) in place of the current `token.length < 10` check.
- Leave the cross-tenant scan as the fallback (it's the design), but this stops malformed/garbage tokens triggering a full-fleet scan.

---

## 5. ⚠️ Contractor-supplied filename injected unescaped into admin emails

`fileName` comes from the public upload endpoint (untrusted) and is interpolated raw as `${doc.fileName}` / `${d.fileName}` into admin alert email HTML — e.g. the single-doc resend (~917), bulk resend (~1054), and the cron expiry digest (~2943). HTML/link injection into the admin inbox.

**Fix:** add an `escapeHtml` helper at module scope (reuse the same `esc` pattern already used in the PDF export — `& < > "`), and wrap every interpolation of contractor- or document-derived strings in the **email** bodies: `fileName`, and for safety also `wo.title` where it appears in emails. Apply across the resend, bulk-resend, bulk-resend-alerts, and cron email builders. (The PDF export already escapes correctly — leave it.)

---

## 6. ⚠️ Annual-planner email endpoint has no admin check

`POST /api/ppm/annual-planner/email` (~2212) is `requireAuth` only, so any authenticated user can email the full asset maintenance schedule to any address.

**Fix:** add the same guard used elsewhere in this file:
```ts
if (req.user!.role !== "admin") return res.status(403).json({ error: "Administrator access required" });
```
right after the handler opens. Also escape the user-supplied `message` and `asset.name` / `asset.assetRef` in the email body using the helper from #5 (the `message` currently only does `\n→<br>`).

---

## 7. 🟡 Minor tidy-ups
- **Missing type import:** `server/routes/ppm.ts:1189` uses `SQL<unknown>[]` but `SQL` isn't imported. Add `SQL` to the `drizzle-orm` import on line 12 (`import { eq, and, sql, SQL, ... } from 'drizzle-orm';`) so `npm run check` passes.
- **Date locale:** `client/src/components/PpmDashboard.tsx:865` uses `toLocaleTimeString()` with no locale → can render 12-hour AM/PM. Change to `toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })` to match the rest of the app.

---

## After applying
1. Run `npm run db:push` (new `ppm_audit` table).
2. Run `npm run check` — it should now pass (was failing on findings 1 and 7).
3. Smoke test: contractor opens a work-order link → uploads a photo and a PDF cert (should succeed, finding 1); admin tries to delete a completed work order (should be blocked, 2c); "Delete demo data" on an account with a completed work order (should refuse, #3); confirm an audit row appears for create/assign/complete/delete/upload.
