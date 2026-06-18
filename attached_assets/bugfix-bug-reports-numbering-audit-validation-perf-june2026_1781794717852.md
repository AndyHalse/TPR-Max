# Bug Reports — commercial-readiness hardening (numbering, audit trail, validation, dates, pagination)

**Module:** Bug Reports (in-app "Report a Problem" → Platform Admin triage → reporter feedback loop)
**Why:** Deep-dive review on 18 Jun 2026. The feature is well-built — access control, the token-based feedback loop, the BR-020 scanner fix, upload validation and email escaping are all sound. These six fixes close the remaining gaps before it's put in front of paying customers at scale. (Apply all six = the "Everything" set.)

---

## Files in scope

- `server/routes/bugReports.ts` — all API routes (submit, feedback, platform-admin list/detail/patch)
- `client/src/pages/PlatformAdminBugReports.tsx` — admin triage view
- `shared/schema.ts` — `bugReports` table (~2664) and `insertBugReportSchema` (~2701)

Bug reports live in the **shared** DB by design (platform admins triage every customer's reports in one place). Keep it that way — these routes are correctly gated by `requirePlatformAdmin`.

---

## Fix 1 — 🔴 Stop report numbers colliding

**Problem.** `server/routes/bugReports.ts:246-248` builds the number from a live row count:
```ts
const [countRow] = await db.select({ count: sql<number>`count(*)::int` }).from(bugReports);
const reportNumber = `BR-${String((countRow?.count ?? 0) + 1).padStart(3, '0')}`;
```
There is **no unique constraint** on `report_number` (`shared/schema.ts:2666`). Two reports submitted at the same moment both read the same count and both become e.g. `BR-027`. Duplicate numbers break the whole "reply about BR-026" workflow. (Same class of bug we already fixed on Helpdesk ticket numbers.)

**Fix — use an atomic Postgres sequence, plus a unique index as a backstop:**

1. Add a **migration** (raw SQL, run-once — follow the existing `migrationRunner.ts` pattern) that creates the sequence and seeds it past the highest existing number:
   ```sql
   CREATE SEQUENCE IF NOT EXISTS bug_report_seq;
   SELECT setval(
     'bug_report_seq',
     GREATEST(
       (SELECT COALESCE(MAX(NULLIF(regexp_replace(report_number, '\D', '', 'g'), '')::int), 0) FROM bug_reports),
       1
     ),
     true
   );
   ```
2. Generate the number atomically in the submit route (replace the count logic):
   ```ts
   const [{ seq }] = await db.execute(sql`SELECT nextval('bug_report_seq')::int AS seq`) as any;
   const reportNumber = `BR-${String(seq).padStart(3, '0')}`;
   ```
3. Add a **unique index** on `report_number` in `shared/schema.ts` as a safety net:
   ```ts
   bugReportNumberUnique: uniqueIndex("bug_reports_report_number_unique").on(table.reportNumber),
   ```
   (Import `uniqueIndex` from `drizzle-orm/pg-core` if not already.)

> ⚠️ Needs **`npm run db:push`** for the unique index. The sequence is created by the migration.

---

## Fix 2 — ⚠️ Cap the diagnostic free-text fields

**Problem.** `description` is capped at 5,000 chars, but `consoleErrors`, `breadcrumbs`, `pageUrl`, `browserInfo` are uncapped (`insertBugReportSchema`, `shared/schema.ts:2701`). A page that spews console logs could write a huge row and bloat the notification email.

**Fix — extend the Zod schema** (no DB change):
```ts
}).extend({
  description: z.string().min(1).max(5000),
  attachments: z.array(z.object({
    dataUrl: z.string().startsWith("data:image/"),
    caption: z.string().max(200),
  })).max(5).optional(),
  consoleErrors: z.string().max(20000).optional().nullable(),
  breadcrumbs:   z.string().max(20000).optional().nullable(),
  pageUrl:       z.string().max(2000).optional().nullable(),
  browserInfo:   z.string().max(1000).optional().nullable(),
  errorId:       z.string().max(200).optional().nullable(),
  appVersion:    z.string().max(100).optional().nullable(),
});
```

---

## Fix 3 — ⚠️ Add an admin audit trail

**Problem.** The PATCH route (`bugReports.ts:531`) overwrites status, admin notes and resolution in place. There's no record of **which platform admin** changed what, or the history of status transitions.

**Fix:**

1. New shared table in `shared/schema.ts`:
   ```ts
   export const bugReportAudit = pgTable("bug_report_audit", {
     id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
     bugReportId: varchar("bug_report_id").notNull().references(() => bugReports.id),
     changedBy: text("changed_by"),     // platform admin id from session
     changes: jsonb("changes").$type<Array<{ field: string; from: any; to: any }>>(),
     createdAt: timestamp("created_at").defaultNow().notNull(),
   }, (table) => ({
     bugAuditReportIdx: index("bug_report_audit_report_id_idx").on(table.bugReportId),
   }));
   ```
2. In the PATCH handler, after loading `current` and before/after the update, build a `changes` array comparing `current` vs the new values for `status`, `adminNotes`, `resolutionNote`. If non-empty, insert one audit row with `changedBy: req.session.platformAdminId`. Wrap in try/catch — audit logging must never fail the update.
3. Surface it: in `GET /platform-admin/bug-reports/:id`, also return the audit rows (newest first) so the admin detail view can show a simple "History" list. Add a compact history block to `PlatformAdminBugReports.tsx` (date in en-GB, who, what changed).

> ⚠️ Needs **`npm run db:push`** (new table).

---

## Fix 4 — ⚠️ Preserve the original resolution time

**Problem.** `bugReports.ts:550` resets `resolvedAt` to "now" on every fixed/closed save, so re-saving a closed report loses the true first-resolution time:
```ts
setData.resolvedAt = (status === 'fixed' || status === 'closed') ? new Date() : null;
```

**Fix — preserve it once set:**
```ts
if (status === 'fixed' || status === 'closed') {
  setData.resolvedAt = current.resolvedAt ?? new Date();   // keep the original
} else {
  setData.resolvedAt = null;   // reopened / in_progress / new clears it
}
```

---

## Fix 5 — 🟡 Make on-screen dates en-GB

**Problem.** The Copy-for-AI text and the PDF correctly use `en-GB`, but the on-screen dates use bare `toLocaleString()` (`PlatformAdminBugReports.tsx` lines ~181, 562, 589, 660, 666, 676, 687).

**Fix:** change each bare `new Date(x).toLocaleString()` to `new Date(x).toLocaleString("en-GB")` for consistency. (Leave the two that already pass `"en-GB"` alone.)

---

## Fix 6 — 🟡 Paginate the admin list

**Problem.** `GET /platform-admin/bug-reports` (`bugReports.ts:470`) loads every report on each open. Fine now, but unbounded as the count grows.

**Fix:**
- Server: accept `?limit` (default 100) and `?offset` (default 0); add `.limit(limit).offset(offset)` to the query; also return the total: `{ reports, total }` where `total` is `SELECT count(*)::int FROM bug_reports`.
- Client (`PlatformAdminBugReports.tsx`): fetch the first page on load and add a **"Load more"** button that increases the offset and appends, hiding the button once `reports.length >= total`. Keep the existing newest-first ordering.

---

## What NOT to change

- Don't change the access guards, the feedback-token flow, the BR-020 scanner fix, upload size/type validation, or the email HTML-escaping — all correct.
- Don't add a delete route — reports staying immutable is good for the audit story.

---

## Database

- **`npm run db:push` required** — Fix 1 (unique index on `report_number`) and Fix 3 (new `bug_report_audit` table). The Fix 1 sequence is created via the migration block. Fixes 2, 4, 5, 6 need no schema change.

---

## Test plan (after deploy)

1. Submit two reports quickly — confirm they get **different** sequential numbers, and the count keeps climbing past the current highest (no reset).
2. As a platform admin, change a report's status and notes — confirm a **History** entry records who/what/when in en-GB.
3. Mark a report fixed, then re-save it — confirm `resolvedAt` keeps the **original** time.
4. Submit a report with a very long console log — confirm it's rejected cleanly (not silently truncated server-side) or capped per the schema.
5. With many reports present, confirm the list loads a page and **"Load more"** fetches the rest.
