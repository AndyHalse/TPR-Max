# Bug fix batch — four issues (June 2026 review)

Four separate, independent fixes in the TPR codebase. Do them in order. Each one is self-contained — finish and sanity-check one before starting the next. Don't refactor anything that isn't listed here.

After each fix, run `npm run check` (tsc) and make sure there are no new type errors.

---

## Fix 1 — Stop giving the HR module away free (REVENUE — do this first)

**Problem:** the HR module is switched ON by default for every new customer, so everyone gets a paid TPR Max feature for free. The default is set to `true` in **two** places — both must change, or the fix won't hold.

**Change A — `server/isolatedSchema.ts` line 527:**
```ts
// FROM
featureHrModule: boolean("feature_hr_module").default(true),
// TO
featureHrModule: boolean("feature_hr_module").default(false),
```

**Change B — `server/customerDatabase.ts` line ~1007** (runtime column-add — currently re-defaults it to true):
```ts
// FROM
await pool.query(`ALTER TABLE "${schemaName}".company_settings ADD COLUMN IF NOT EXISTS feature_hr_module BOOLEAN DEFAULT true`);
// TO
await pool.query(`ALTER TABLE "${schemaName}".company_settings ADD COLUMN IF NOT EXISTS feature_hr_module BOOLEAN DEFAULT false`);
```

**Change C — provisioning.** In `server/routes/platformAdmin.ts` the feature-flag list around line 819 already includes `featureHrModule`. Make sure that when a customer is provisioned (or upgraded) on the **TPR Max** tier, `featureHrModule` is explicitly set to `true` for them. If the provisioning code sets the Max-tier flags as a group, add `featureHrModule` to that group. The goal: HR is OFF for Basic/Pro, ON for Max.

**Do NOT** retroactively switch off HR for existing live customers who already have it on — only change the default for new ones. If you can tell which existing customers are on Max vs not, leave the Max ones as-is.

**Verify:** create a new test customer on a non-Max plan → `feature_hr_module` should be `false` and the HR section should not appear / HR routes should 403.

---

## Fix 2 — Audit mobile links shouldn't scan every customer (PERFORMANCE / minor security)

**Problem:** the four public audit endpoints in `server/routes/auditEngine.ts` (the mobile audit links — no login) find the right customer by looping through **every** customer database until a token matches. Slow, and it gets worse as we add customers. The emergency/muster module already solved this exact problem by putting the customer ID inside the token.

**The pattern to copy** is in `server/routes/emergency.ts`:
- Token is built as `` `${customerId}.${randomToken}` `` (emergency.ts:40)
- On the public side it's parsed back with `token.split('.')` to get the customer ID (emergency.ts:4267), then it goes straight to that one customer's database — no loop.

**Step 1 — encode the customer ID when the token is generated.** Two spots in `auditEngine.ts`:
- Line ~761 (`GET /api/audits/records/:id/token`)
- Line ~783 (`POST /api/audits/records/:id/send-link`)

In both, change:
```ts
const token = randomBytes(24).toString('hex');
// TO
const token = `${context.customerId}.${randomBytes(24).toString('hex')}`;
```
(`context.customerId` is already in scope in both handlers.)

**Step 2 — use the prefix on the four public endpoints** instead of looping all customers. The endpoints are:
- `GET  /api/audits/public/:token` (line ~44)
- `PUT  /api/audits/public/:token` (line ~69)
- `POST /api/audits/public/:token/submit` (line ~98)
- `POST /api/audits/public/:token/upload` (line ~140)

Add one small helper near the top of `registerAuditEngineRoutes` and use it in all four:
```ts
// Resolve the customer DB straight from the token prefix (format: customerId.randomToken).
// Falls back to the old all-customer scan for legacy tokens issued before this change.
async function resolveAuditDb(token: string) {
  const dotIndex = token.indexOf('.');
  if (dotIndex > 0) {
    const customerId = token.slice(0, dotIndex);
    try {
      const custDb = await customerDbService.getCustomerDatabase(customerId);
      const [record] = await custDb.select().from(isolatedSchema.auditRecords)
        .where(eq(isolatedSchema.auditRecords.accessToken, token));
      if (record) return { custDb, record };
    } catch { /* fall through to legacy scan */ }
  }
  // Legacy fallback: tokens generated before customerId was prefixed
  const allCustomers = await customerDbService.getAllCustomers();
  for (const customer of allCustomers) {
    const custDb = await customerDbService.getCustomerDatabase(customer.id);
    const [record] = await custDb.select().from(isolatedSchema.auditRecords)
      .where(eq(isolatedSchema.auditRecords.accessToken, token));
    if (record) return { custDb, record };
  }
  return null;
}
```
Then in each of the four endpoints, replace the `const allCustomers = ... for (const customer ...) { ... }` block with:
```ts
const resolved = await resolveAuditDb(token);
if (!resolved) return res.status(404).json({ error: 'Audit not found or link is invalid.' });
const { custDb, record } = resolved;
// ...then the existing expiry check + body of the loop, unchanged...
```
Keep all the existing expiry checks, item queries, scoring, and upload logic exactly as they are — you're only replacing the customer-lookup loop, not the work inside it.

**Verify:** generate a fresh audit link, open it on a phone/incognito, confirm load + item save + submit + photo upload all still work. Old links (without a dot) must still work via the fallback.

---

## Fix 3 — "Clear sample data" import must not report success when a delete fails (DATA INTEGRITY)

**File:** `server/routes/imports.ts`, the clear-sample-data handler starting around line 2268 (the one that deletes `@example.com` / `@memberco.com` seed rows).

**Problem:** every delete is wrapped in its own `try/catch` that just logs a warning (`del()` helper at line ~2285, plus several inline `catch (e) { logger.warn(...) }`). If one delete fails partway through, the rest still run and the endpoint reports success — leaving orphaned rows behind while telling the user it worked.

**Fix:** make the whole clear operation atomic and surface failures.
1. Get a single client and wrap the deletes in a transaction:
   ```ts
   const client = await pool.connect();   // pool is already obtained at line ~2271
   const failures: string[] = [];
   try {
     await client.query('BEGIN');
     // ...run all the deletes through `client.query(...)` instead of `pool.query(...)`...
     await client.query('COMMIT');
   } catch (e) {
     await client.query('ROLLBACK');
     throw e;
   } finally {
     client.release();
   }
   ```
2. In the `del()` helper and the inline delete blocks, **stop swallowing**. On error, push the table name + message into `failures` and re-throw so the transaction rolls back:
   ```ts
   } catch (e) {
     failures.push(`${table}: ${(e as any).message}`);
     throw e;   // abort the whole clear — don't continue past a failed delete
   }
   ```
3. If everything succeeds, return as now (`{ deleted }`). The transaction guarantees all-or-nothing, so the user can never be told "cleared" when rows were left behind.

If switching every delete to a single `client` is too invasive in one pass, the minimum acceptable version is: keep `pool.query`, but collect every failure into a `failures` array, and at the end — if `failures.length > 0` — return `res.status(500).json({ error: 'Some records could not be cleared', failures, deleted })` instead of a success response. The user must never get a 200 when a delete failed.

**Verify:** run "clear sample data" on a tenant with seeded demo data — it should clear cleanly and report the counts. (No easy way to force a mid-delete failure in normal testing; just confirm the happy path still works and the response shape is unchanged on success.)

---

## Fix 4 — Lone-worker tables: migrate properly, drop the runtime self-heal (RELIABILITY)

**Problem:** `server/routes/loneWorker.ts` around line 446–475 creates its two tables (`lone_worker_sessions`, `lone_worker_tokens`) at runtime, inside the cron's error handler, only **after** a query fails with "does not exist". That means for any customer missing those tables, the lone-worker feature silently does nothing until the next 60-second cron tick triggers the repair. The raw `CREATE TABLE` SQL there is also a hand-copy of the Drizzle schema and can drift from it.

**Fix:**
1. Add a proper migration for these two tables in `server/migrationRunner.ts`, following the existing migration pattern in that file (give it a new version id, e.g. `20260605_0xx_lone_worker_tables`, and use `CREATE TABLE IF NOT EXISTS` for both tables). This runs per-customer via `ensureSchema` on first DB connection, so every tenant — existing and new — gets the tables reliably, not lazily. Match the column definitions to the Drizzle schema in `server/isolatedSchema.ts` (`loneWorkerSessions`, `loneWorkerTokens`) so there's no drift — use the schema as the source of truth, not the old raw SQL in loneWorker.ts.
2. In `server/routes/loneWorker.ts`, **remove the runtime self-heal block** (the `if (custErr.message?.includes('does not exist')) { ... CREATE TABLE ... }` branch, ~line 447–475). Keep the surrounding cron loop and the normal error logging in the `else` branch.

**Verify:** confirm the migration runs without error on an existing tenant (check logs for the new migration id) and that the lone-worker cron logs no "does not exist" errors after startup.

---

## Summary checklist
- [ ] Fix 1: `featureHrModule` defaults to `false` in both isolatedSchema.ts AND customerDatabase.ts; Max-tier provisioning sets it `true`; existing customers untouched
- [ ] Fix 2: audit tokens carry `customerId.` prefix; four public endpoints resolve via prefix with legacy fallback; old links still work
- [ ] Fix 3: clear-sample-data is atomic (transaction) OR returns 500 with `failures` when any delete fails — never a false success
- [ ] Fix 4: lone-worker tables added to migrationRunner; runtime self-heal block removed
- [ ] `npm run check` passes with no new errors after each fix
