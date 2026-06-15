# BUGFIX — `GET /api/contractors/:companyId/notes` returns 500 ("Failed to fetch company notes")

**Source:** TPR Bug Report BR-008 (15 Jun 2026, `/contractors`). The console/network log shows this endpoint 500-ing repeatedly on retry:
```
[NETWORK] HTTP 500 GET /api/contractors/a0efd14a-2fc3-478e-b391-76e4b702de32/notes
[ERROR] Query failed: {"status":500,"error":"Failed to fetch company notes"}
```
It failed three times (12:28:05, :10, :19) on its own, before the unrelated cascade — so this is a real, persistent endpoint fault, not a one-off blip.

## Where it is
`server/routes/contractors.ts` ~line 2862:
```ts
app.get("/api/contractors/:companyId/notes", requireAuth, async (req, res) => {
  try {
    const { companyId } = req.params;
    const context = simpleDatabaseService.createCustomerContext(req.user!.username, req.customerId);
    const db = await customerDbService.getCustomerDatabase(context.customerId);
    const notes = await db.select().from(isolatedSchema.companyNotes)
      .where(eq(isolatedSchema.companyNotes.companyId, companyId))
      .orderBy(desc(isolatedSchema.companyNotes.changedAt));
    res.json(notes);
  } catch (error) {
    logger.error("Error fetching company notes:", error);   // <-- the real cause is hidden in here
    res.status(500).json({ error: "Failed to fetch company notes" });
  }
});
```
The handler is correct; the `db.select()` is throwing. **The actual exception is in the server log, not in the bug report** — which is exactly why this is hard to pin from the PDF alone.

## Step 1 — surface the real error (do this first)
Right now the catch logs the error but the *message* isn't visible anywhere useful. Make it diagnosable:
- Log `error.message`, `error.stack`, the `companyId`, and `context.customerId` explicitly (structured fields, via the existing `logger`).
- This is the single change that turns "Failed to fetch company notes" into an actionable cause. (See also the error-ID work in `feature-error-id-and-diagnostics-june2026.md` — the same principle.)

## Step 2 — most likely root cause: the `company_notes` table is missing/stale in that tenant's database
TPR uses per-customer isolated databases (`customerDbService.getCustomerDatabase`). A single endpoint failing persistently while others work usually means the `company_notes` table (or a column like `changed_at` / `company_id`) doesn't exist or is out of date in **that customer's** schema — i.e. a migration that never reached that tenant.
- Confirm the `company_notes` table exists in the affected customer DB with the columns the query uses (`company_id`, `changed_at`).
- If it's missing/behind, run the tenant migration (`npm run db:push`) against that customer's database, and check whether other tenants are affected too.
- Verify the migration/`db:push` process actually runs for **every** customer DB, not just the primary — if tenants can drift, that's the deeper bug to fix.

## Step 3 — make the endpoint resilient
- If `companyNotes` legitimately has no rows or the company has never had a note, return `[]` — don't error.
- Validate `companyId` (it's a UUID) and return 400 on a malformed id rather than 500.

## Acceptance criteria
- The server log for a failed notes fetch shows the actual exception message + stack + customerId + companyId.
- The affected tenant's `company_notes` table exists and matches the schema; `GET /api/contractors/:companyId/notes` returns 200 with the notes (or `[]`).
- A company with no notes returns `[]`, not 500.
- Confirmation that `db:push` / migrations apply across all customer databases so this can't silently recur on other tenants.

## Important alternative cause — connection contention (check this too)
The customer DB pool is configured with **`max: 1`** (`server/customerDatabase.ts` ~line 153) — only one query at a time per customer. The notes fetch may be 500-ing not because the table is missing, but because the single connection was busy/timed out under the page-load burst (the same root cause as the cascade). If the server log for a notes 500 shows a **connection timeout** rather than a "relation does not exist" / column error, then this is contention, not a schema problem — fix the pool first (see `investigation-contractor-page-500-cascade-june2026.md`). Step 1 (logging the real error) tells you which of the two it is.

## Note
May need `npm run db:push` against the affected (and possibly all) customer databases IF it's a schema issue. Check whether BR-008's other simultaneous 500s share the root cause — see `investigation-contractor-page-500-cascade-june2026.md`.
