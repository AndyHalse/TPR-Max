# HR module — role locks, leave-approval integrity, missing reminders, audit trail & validation

**Module:** HR (Staff Profile, Org Chart, Leave, Absence, Appraisals, Training, DBS, Right to Work, Documents, Onboarding, Leaver, Payroll Export, HR Dashboard)
**Files:**
`server/routes/hrMiddleware.ts`, `server/routes/hrStaff.ts`, `server/routes/hrRightToWork.ts`, `server/routes/hrTraining.ts`, `server/routes/hrLeave.ts`, `server/routes/hrAbsence.ts`, `server/routes/hrDocuments.ts`, `server/routes/hrOnboarding.ts`, `server/routes/hrLeaver.ts`, `server/routes/hrAppraisals.ts`, `server/routes/hrPayroll.ts`, `server/routes/hrDashboard.ts`, `server/routes/hrDbs.ts`, `server/routes/contractorWorkerDbs.ts` (daily cron), `server/isolatedSchema.ts`
**⚠️ This prompt adds new database columns and a new table — run `npm run db:push` after applying.**

Do not change anything outside the HR module. Keep the existing tenant-isolation pattern exactly as-is — every query already runs against the per-customer schema returned by `customerDbService.getCustomerDatabase(req.customerId!)` / `generateSchemaName(req.customerId!)`. Do not break it. Read each file before editing and match the existing style (raw SQL via the resolved `pool`, `logger` for errors).

**Context for the whole change:** the HR module is operated by the customer's HR team. Today every HR data route is guarded only by `requireAuth` + `requireHrFeature`, so **any** logged-in user (reception, security, kiosk operator) can read and write DBS criminal-record checks, Right to Work, pay grades, emergency contacts, sickness/absence, appraisals and the whole-company payroll export. The module already has a `requireAdmin` helper (`['admin','hr_admin']`) used for leaver-deactivate, onboarding templates and confidential documents — we are extending that same gate across the module.

---

## 1. Add one shared HR-admin gate and apply it to every personal-data route

In `server/routes/hrMiddleware.ts`, add alongside `requireHrFeature`:

```ts
export const requireHrAdmin = (req: any, res: any, next: any) => {
  if (!['admin', 'hr_admin'].includes(req.user?.role || '')) {
    return res.status(403).json({ error: 'This area is restricted to HR administrators.' });
  }
  next();
};
```

Then add `requireHrAdmin` (after `requireHrFeature`) to **every** route in these files — GET, POST, PUT, PATCH and DELETE alike, because all of them read or write personal data:

- `hrStaff.ts` — org-chart, org-chart/validation, `PATCH /api/staff/:id/hr`
- `hrDbs.ts` — all four `/dbs` routes + `/dbs/expiry-alerts`
- `hrRightToWork.ts` — all `/right-to-work` routes
- `hrAbsence.ts` — all `/absences` routes + `/absences/overview`
- `hrAppraisals.ts` — all `/appraisals` routes
- `hrTraining.ts` — all `/training` and `/training/requirements` routes + `/training/matrix`, `/training/expiring`
- `hrLeave.ts` — all `/leave` routes **except** `GET /api/leave/bank-holidays` and `GET /api/leave/working-days` (pure calculators, no personal data — leave those on `requireAuth` only)
- `hrDocuments.ts` — all `/documents` routes (keep the existing extra `is_confidential` role check on top)
- `hrPayroll.ts` — `/hr/payroll-export`
- `hrDashboard.ts` — `/hr/dashboard`
- `hrLeaver.ts` — see section 3 below
- `hrOnboarding.ts` — see section 3 below

**Consolidate the duplicates:** `hrLeaver.ts` and `hrOnboarding.ts` each define their own local `requireAdmin`. Replace both with the shared `requireHrAdmin` import so there is one definition. Keep behaviour identical (`['admin','hr_admin']`).

Do not touch `requireHrFeature` itself.

## 2. Stop staff approving their own leave, and record the real approver

In `hrLeave.ts`, `PUT /api/leave/:id/approve` currently trusts `req.body.approvedById` for the approver identity. Once section 1 is applied, only HR admins can reach this route, which fixes self-approval — but the recorded approver must come from the server, never the request body.

- Remove all use of `req.body.approvedById`.
- Derive the actor from the logged-in user: `const actor = req.user?.username || 'unknown';`
- Look up the matching staff row to populate `approved_by_id` (used by the existing name join): `SELECT id FROM "<schema>".staff WHERE LOWER(email) = LOWER($1) OR LOWER(username) = LOWER($1) LIMIT 1` using the logged-in user's email/username; if no match, set `approved_by_id = NULL` (the audit record from section 5 still captures the real actor).
- Keep `approved_at = NOW()`.
- Apply the same server-derived-actor rule to `PUT /api/leave/:id/decline` and `PUT /api/leave/:id/cancel` (record who did it in the audit log — section 5).

## 3. Gate the whole leaver and onboarding flow consistently

`hrLeaver.ts` currently admin-gates only the final `deactivate` and the template routes, but leaves `initiate-leaver` (which flips someone to "leaver", cancels their future leave and reassigns their reports), exit-interview, and the item/equipment add/patch/delete routes open to any user.

- Add `requireHrAdmin` to **all** leaver routes: `initiate-leaver`, `GET /leaver`, item add/patch/delete, equipment add/patch/delete, exit-interview, archive, `GET /hr/leavers`. (`deactivate` and the template routes already require admin — keep them.)
- In `hrOnboarding.ts`, add `requireHrAdmin` to every route, not just the template CRUD that already has it.

## 4. Wire up the Right to Work and mandatory-training expiry reminders

`sendRtwExpiryReminders` (`hrRightToWork.ts`) and `sendTrainingExpiryReminders` (`hrTraining.ts`) are fully written but **never called by any cron**, so those emails never fire — including the RTW warning about the £60,000 illegal-working civil penalty. Only the DBS reminder is wired.

- In `server/routes/contractorWorkerDbs.ts`, find the existing daily cron (around lines 245–271, `{ timezone: 'Europe/London' }`) that loops every customer and calls `sendDbsExpiryReminders(customer.id, companyName)`.
- In that same per-customer loop, also call `sendRtwExpiryReminders(customer.id, companyName)` and `sendTrainingExpiryReminders(customer.id)`. Import both from their route files.
- Wrap each call in its own `try/catch` that logs via `logger.error` so one customer or one reminder type failing never stops the others.
- Only run them for customers with the HR module enabled (check `featureHrModule` the same way the surrounding code checks its feature flags; if that's awkward inside the loop, the reminder functions already no-op safely when there's no data, so calling them unconditionally is acceptable — but prefer gating on the flag).
- Keep everything on `Europe/London`.

## 5. Add an HR audit trail (who-changed-what-when)

Changes to pay grade, employment status, DBS verification, Right to Work, appraisals and leave currently record only `updated_at`. Add a lightweight audit log.

- In `server/isolatedSchema.ts`, add a new per-customer table **`hrAuditLog`**:
  - `id` (uuid/text primary key, same style as other tables in this file)
  - `entityType: text("entity_type")` — e.g. `staff_hr`, `dbs`, `right_to_work`, `absence`, `appraisal`, `leave`, `training`, `document`, `leaver`
  - `entityId: text("entity_id")` (nullable)
  - `staffId: text("staff_id")` (nullable — the staff member the record is about)
  - `action: text("action")` — `create` | `update` | `delete` | `approve` | `decline` | `cancel` | `deactivate`
  - `actor: text("actor")` — the logged-in `req.user.username`
  - `details: jsonb("details")` (nullable — key changed fields / new values; include before-value where the route already reads the row first)
  - `createdAt: timestamp("created_at").defaultNow()`
- Also add `deletedBy: text("deleted_by")` (nullable) to **`staffDbs`**, **`staffTrainingRecords`** and **`staffDocuments`** (they already soft-delete via `deleted_at` — now record who).
- Add a small helper (e.g. in `hrMiddleware.ts` or a new `server/utils/hrAudit.ts`):

```ts
export async function recordHrAudit(pool: any, schemaName: string, entry: {
  entityType: string; entityId?: string | null; staffId?: string | null;
  action: string; actor: string; details?: any;
}) {
  try {
    await pool.query(
      `INSERT INTO "${schemaName}".hr_audit_log
        (entity_type, entity_id, staff_id, action, actor, details)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [entry.entityType, entry.entityId ?? null, entry.staffId ?? null,
       entry.action, entry.actor, entry.details ? JSON.stringify(entry.details) : null]
    );
  } catch (err: any) {
    logger.warn(`[hr-audit] failed to record ${entry.entityType}/${entry.action}: ${err.message}`);
  }
}
```

- Call `recordHrAudit(...)` after every successful **mutating** action (create/update/delete/approve/decline/cancel/deactivate) across the HR routes, with `actor = req.user?.username || 'unknown'`. The helper must never block or fail the main operation (it swallows its own errors).
- On the soft-delete routes (DBS, training, document delete), set `deleted_by = req.user?.username` in the UPDATE as well as writing the audit row.

## 6. Tighten input validation

Only `hrLeave.ts` validates date format today. Add a shared guard and apply it.

- Add a small helper (next to the audit helper) and reuse the format already used in `hrLeave.ts`:

```ts
export const isValidIsoDate = (v: unknown): boolean =>
  typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v.slice(0, 10));
```

- In each POST/PUT below, if a supplied date field is present but not a valid ISO date, return `400` with a clear message (e.g. `{ error: 'Dates must be in YYYY-MM-DD format' }`) instead of letting a malformed value throw a raw 500:
  - `hrDbs.ts` — `issueDate`, `policyExpiryDate`, `verifiedDate`
  - `hrRightToWork.ts` — `issueDate`, `expiryDate`, `verifiedDate`
  - `hrAbsence.ts` — `startDate`, `returnDate`
  - `hrAppraisals.ts` — `reviewDate`, `nextReviewDate`, and each objective `targetDate`
  - `hrTraining.ts` — `completedDate`, `expiryDate`
- **Document upload** (`hrDocuments.ts`, `POST /api/staff/:staffId/documents/upload`): validate the upload metadata —
  - reject if `fileSizeBytes` is present and not a positive number ≤ 20 MB (`20 * 1024 * 1024`) → `413` `{ error: 'File too large (20 MB maximum).' }`
  - sanitise `fileName` to its base name with a safe character set before storing (strip path separators and `..`)
  - require `fileUrl` to be an internal object-storage path (e.g. starts with the same prefix other modules use for stored objects) rather than an arbitrary external URL → `400` if it doesn't match. Match whatever the contractor/staff document upload routes already do for this; do not invent a new storage scheme.

---

## Out of scope (deliberately not in this prompt)
- Pagination on the big read lists (absence overview, training matrix, leavers) — fine at realistic staff numbers.
- Preserving appraisal-objective / training-requirement history on edit/delete.

## After applying
- Run `npm run db:push` (new `hr_audit_log` table + `deleted_by` columns).
- Smoke test as a **non-admin** user: every HR data route should now return 403. As an **admin/hr_admin**: everything works as before, leave approval records the real approver, and the HR audit log fills in. Confirm the daily cron logs show RTW and training reminders running alongside DBS.
