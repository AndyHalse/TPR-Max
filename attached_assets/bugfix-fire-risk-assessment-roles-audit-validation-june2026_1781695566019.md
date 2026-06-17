# Fix — Fire Risk Assessment: roles, audit trail, no-hard-delete, validation & polish

**Module:** Fire Risk Assessment
**Files:** `server/routes/fireRiskAssessment.ts`, `client/src/pages/FireRiskAssessment.tsx`, `server/isolatedSchema.ts`
**⚠️ REQUIRES `npm run db:push`** — adds an audit table + a soft-delete column.

The Fire Risk Assessment module is well built — auto-supersede on new FRA, auto-status (current / review_due / overdue), critical-action email alerts citing the Fire Safety Order 2005, a daily `Europe/London` cron, en-GB dates throughout, clean per-customer tenant isolation, and client-side PDF type + 20 MB size checks. Don't change any of that. The gaps are governance: who's allowed to act, and whether there's a trace. Apply all of the following.

---

## 🔴 1. Add role checks to every write/delete action

Right now any authenticated user can create, edit, delete an FRA and raise/complete fire-safety actions. Restrict **all writes** (create FRA, update FRA, delete FRA, create action, update action, complete action) to manager/admin-level roles, matching how the other modules in this codebase gate sensitive writes. Viewing/listing can stay open to any authenticated user in the tenant.

- Add a role-check middleware (reuse the existing role pattern used elsewhere — e.g. the permit-to-work / audits managers-only check) and apply it to: `POST /api/fire-risk-assessments`, `PUT /api/fire-risk-assessments/:id`, `DELETE /api/fire-risk-assessments/:id`, `POST /:fraId/actions`, `PUT /:fraId/actions/:actionId`, `PATCH /:fraId/actions/:actionId/complete`, and the new single-action DELETE below.
- On the client, hide the Add / Edit / Delete / Mark-complete buttons for users without that role (don't rely on hiding alone — the server check is the real gate).

## 🔴 2. Stop hard-deleting legal records — soft-delete instead

`DELETE /api/fire-risk-assessments/:id` permanently removes the FRA and cascades to all action items. FRAs are legal compliance evidence under the Regulatory Reform (Fire Safety) Order 2005.

- Add a `deleted_at TIMESTAMPTZ DEFAULT NULL` column to `fire_risk_assessments` (and to the `ensureFraTable` DDL + the Drizzle schema in `isolatedSchema.ts`).
- Change `DELETE` to set `deleted_at = NOW()` (and record who — see audit below) instead of removing the row. Do **not** cascade-delete the action items.
- Exclude `deleted_at IS NOT NULL` rows from all list/status/dashboard queries.

## 🔴 3. Full audit trail on every sensitive action

Nothing currently records who-what-when. Add a `fra_audit` table (raw DDL in an `ensureFraAuditTable` helper, plus Drizzle schema) with: `id`, `fra_id`, `action_item_id` (nullable), `event` (created / updated / deleted / action_created / action_updated / action_completed), `performed_by` (the **authenticated username from `req.user`**, never client-supplied), `details` (JSON/text — e.g. before/after of changed fields), `created_at`.

Write an audit row inside each write handler. Keep it best-effort (wrapped so a logging failure never fails the user's action), but log failures via the Winston `logger`.

## ⚠️ 4. Capture the real user on action completion (not free text)

`completedBy` is currently typed into a box by the user and stored as `completed_by` — unverifiable on a legal record.

- Server: set `completed_by` from `req.user` (the authenticated username), ignoring any client value.
- Client: remove the free-text "Completed by" input from the Mark-complete dialog; keep the completion-notes field. Show the captured user in the completed-action row as before.

## ⚠️ 5. Make action edit as safe as action create

- `PUT /:fraId/actions/:actionId` must validate `priority` against `['critical','high','medium','low']` (reject 400 otherwise), exactly like the POST handler does.
- If an edit raises an action **to** `critical` (was not critical before), send the same immediate critical-action alert email the create path sends. Compare old vs new priority to detect the escalation.

## ⚠️ 6. Escape user input in alert/digest emails

`description`, `location`, `assignedTo`/`assigned_to`, and `assessorName` are interpolated straight into email HTML. Escape them (HTML-encode `< > & " '`) before building any email body — in the create-critical alert, the cron overdue-critical alert, the cron digest, and the FRA review reminder.

## ⚠️ 7. Tighten FRA input validation

- On create/update, validate that `assessorName`, `assessmentDate`, and `nextReviewDate` are present and that the two dates are valid `YYYY-MM-DD` dates; reject 400 with a clear message otherwise (don't let `computeFraStatus(undefined)` silently fall through to "current").
- Validate that `nextReviewDate` is **after** `assessmentDate`; reject 400 if not.

## ⚠️ 8. Stop running DDL on the hot path

`ensureFraTable` / `ensureFraActionsTable` (and the new audit/ DDL) run `CREATE TABLE IF NOT EXISTS` on almost every request. Move table creation to a one-time-per-process guard (a module-level `Set` of customerIds already ensured, or an init-on-boot step) so the DDL runs once per customer per process, not per request. Same pattern as agreed for the H&S Incidents and Audits modules.

## 🟡 9. Don't write on read

The FRA list handler issues a status `UPDATE` per record on every page load. Only write back when the computed status actually differs **and** batch it, or compute status for display without persisting on the read path (persist via the cron / on mutation instead).

## 🟡 10. Single-action delete + reopen + un-supersede

- Add `DELETE /api/fire-risk-assessments/:fraId/actions/:actionId` (manager-only, soft-delete with `deleted_at`, audited) so a mistaken action can be removed without nuking the whole FRA.
- Add a way to reopen a completed action (e.g. `PATCH …/actions/:actionId/reopen` clearing `completed_at`/`completed_by`/`completion_notes`, audited).
- When the live FRA is (soft-)deleted, promote the most recent remaining non-deleted FRA back from `superseded` to its computed status so the dashboard doesn't read "no FRA" while a historical assessment still exists.

## 🟡 11. Pagination

Add simple pagination (or a sensible cap with "show all") to the FRA history list and the action-item lists. Volumes are small today, so a limit + offset is enough.

## 🟡 12. BST date handling

`computeFraStatus` parses TEXT dates as UTC midnight, so day-threshold comparisons can be a few hours out around midnight in BST. Parse the stored `YYYY-MM-DD` as a local (Europe/London) date when computing days-until-review, so "overdue"/"due" flip at local midnight.

---

### After applying
- Run `npm run db:push` (new `fra_audit` table, `deleted_at` columns).
- Sanity-check: a non-manager user is blocked from create/edit/delete/complete (server returns 403); deleting an FRA hides it but keeps the row + writes an audit entry; completing an action records the logged-in user; editing an action to critical fires the alert; an invalid review date is rejected; the dashboard/compliance score still reads FRA status correctly.
