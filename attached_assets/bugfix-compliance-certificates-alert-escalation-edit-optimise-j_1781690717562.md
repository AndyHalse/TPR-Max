# Bugfix + improvements: Compliance Certificate Register — alerts go silent after one email, plus renewal safety, an Edit function, and a DDL-on-every-request cleanup (June 2026)

The **Compliance Certificate Register** is solid, but it has one bug that quietly defeats the point of the module, plus a few things worth tightening in the same pass.

The big one: the daily expiry email fires **once per certificate and then never again** — including on the day the certificate actually expires and every day after. So an admin gets a single "expiring soon" warning 30 days out, then total silence at exactly the moment a statutory certificate (gas safety, EICR, fire alarm, etc.) has lapsed and the site is legally exposed. It only resets when someone uploads a renewal — i.e. the one situation where you most need chasing (a forgotten certificate) is the one situation the system stops chasing.

Alongside that: renewals aren't done atomically, there's no way to correct a typo without deleting the record, and the route rebuilds its database tables on almost every request.

Andy has decided: **weekly reminders while a certificate is expired** (one "expiring" email, one "now expired" email on the day it lapses, then weekly until renewed), and **add an Edit function**.

Copy everything below the line into the Replit agent.

---

## THE PROBLEMS

All in `server/routes/complianceCertificates.ts` unless stated.

### 1. The expiry alert only ever fires once (HIGH — this is the important one)

The daily cron only looks at certificates that have **never** been alerted on:

```ts
const [cert] = await custDb.select().from(isolatedSchema.complianceCertificates)
  .where(and(
    eq(isolatedSchema.complianceCertificates.certificateTypeId, certType.id),
    eq(isolatedSchema.complianceCertificates.isCurrent, true),
    isNull(isolatedSchema.complianceCertificates.deletedAt),
    isNull(isolatedSchema.complianceCertificates.expiryAlertedAt)   // <-- the problem
  )).catch(() => []) as any[];
```

…and after sending, it stamps `expiryAlertedAt` once:

```ts
if (sent) {
  await custDb.update(isolatedSchema.complianceCertificates)
    .set({ expiryAlertedAt: new Date() })
    .where(eq(isolatedSchema.complianceCertificates.id, cert.id));
}
```

So the first "expiring soon" email (30 days out) permanently silences that certificate. There is no escalation from *expiring* to *expired*, and no repeat reminder while it stays expired.

**Required behaviour:** one email when it enters "expiring soon", one email the day it becomes "expired", then a reminder **every 7 days** while it remains expired — until it's renewed (a renewal creates a fresh record, which resets the cycle).

### 2. Renewal isn't atomic (MED)

The create route demotes the previous certificate and inserts the new one as two separate statements:

```ts
await custDb.update(isolatedSchema.complianceCertificates)
  .set({ isCurrent: false })
  .where(and(eq(... certificateTypeId ...), eq(... isCurrent, true)));

const [created] = await custDb.insert(isolatedSchema.complianceCertificates).values({ ... }).returning();
```

If two renewals run at once, or the insert fails after the update, you can end up with **two current certificates** or **none**. Wrap both in a transaction.

### 3. No way to correct a mistake (MED — Andy wants this)

You can add, attach a file, and delete a certificate — but there's no edit. Fixing a wrong date or reference means deleting the record and re-adding it. Add an Edit endpoint and a matching dialog.

### 4. The route rebuilds its tables on nearly every request (LOW — optimisation)

`ensureTables()` runs two `CREATE TABLE IF NOT EXISTS` statements, and it's called at the top of almost every endpoint. That's unnecessary DDL (and locks) on every page load and every save. Run it **once per customer schema per process**.

### 5. The "No Expiry" count is returned but never shown (LOW — cosmetic)

`status-summary` returns `no_expiry`, but the client `StatusSummary` interface omits it and the banner only shows four tiles (Current / Expiring / Expired / Missing). Certificates with no due date silently vanish from the headline numbers. Add a fifth tile so the figures reconcile.

---

## THE FIX

### Step 1 — Schema: add a column to track which alert phase was last sent

We need to remember whether the last alert for a certificate was the "expiring" warning or the "expired" reminder, so we can escalate and then repeat weekly. Reuse the existing `expiryAlertedAt` as "when we last alerted" and add one new column for "what we last alerted about".

**`shared/schema.ts`** (and `server/isolatedSchema.ts` if it's a separate copy — this project keeps the per-tenant schema in `server/isolatedSchema.ts`): add to the `complianceCertificates` table, right after `expiryAlertedAt`:

```ts
expiryAlertedAt: timestamp("expiry_alert_at"),          // existing — keep
expiryAlertPhase: text("expiry_alert_phase"),           // NEW: 'expiring' | 'expired' | null
```

> Note the existing column maps to DB column `expiry_alerted_at` — keep whatever the current `.column()` name is; only add the new `expiry_alert_phase` line. Run `npm run db:push` so the main schema picks it up.

### Step 2 — `ensureTables`: add the column for existing tenants, and only run once per schema

Existing customer schemas already have the table (without the new column), and `CREATE TABLE IF NOT EXISTS` won't add it. Add an idempotent `ALTER`, and guard the whole function so the DDL runs once per schema per process.

At the top of `server/routes/complianceCertificates.ts`:

```ts
const bootstrappedSchemas = new Set<string>();
```

Then rewrite `ensureTables`:

```ts
async function ensureTables(custDb: any, schemaName: string) {
  if (bootstrappedSchemas.has(schemaName)) return;   // already done this process

  await custDb.execute(`CREATE TABLE IF NOT EXISTS ${schemaName}.compliance_certificate_types ( ... )`);  // unchanged
  await custDb.execute(`CREATE TABLE IF NOT EXISTS ${schemaName}.compliance_certificates ( ... )`);        // unchanged

  // Bring older tenant schemas up to date.
  await custDb.execute(`ALTER TABLE ${schemaName}.compliance_certificates
    ADD COLUMN IF NOT EXISTS expiry_alert_phase TEXT`);

  bootstrappedSchemas.add(schemaName);
}
```

(Keep the existing `CREATE TABLE` bodies exactly as they are — just add the `expiry_alert_phase TEXT` column to the second one's body too, for brand-new schemas, and add the guard + ALTER.)

### Step 3 — The cron: escalate, then repeat weekly

Replace the certificate query so it **no longer** filters on `expiryAlertedAt IS NULL` (we now decide in code whether to send):

```ts
const [cert] = await custDb.select().from(isolatedSchema.complianceCertificates)
  .where(and(
    eq(isolatedSchema.complianceCertificates.certificateTypeId, certType.id),
    eq(isolatedSchema.complianceCertificates.isCurrent, true),
    isNull(isolatedSchema.complianceCertificates.deletedAt)
  )).catch(() => []) as any[];

if (!cert) continue;
const dueDate = getEffectiveDueDate(cert);
if (!dueDate) continue;

const status = calculateCertificateStatus(dueDate, certType.reminderDaysBefore);
if (status !== 'expiring_soon' && status !== 'expired') continue;

// Decide whether to send, based on the phase we last alerted in.
const phase = (cert as any).expiryAlertPhase as string | null;
const lastAlertAt: Date | null = cert.expiryAlertedAt ? new Date(cert.expiryAlertedAt) : null;
const daysSinceLastAlert = lastAlertAt
  ? Math.floor((Date.now() - lastAlertAt.getTime()) / (1000 * 60 * 60 * 24))
  : Infinity;

let shouldSend = false;
let newPhase = phase;
if (status === 'expiring_soon') {
  // Send the expiring warning once.
  if (phase !== 'expiring' && phase !== 'expired') { shouldSend = true; newPhase = 'expiring'; }
} else { // expired
  // Send immediately on crossing into expired, then once every 7 days.
  if (phase !== 'expired' || daysSinceLastAlert >= 7) { shouldSend = true; newPhase = 'expired'; }
}

if (!shouldSend) continue;
```

Then keep the existing email-building block as-is, and update the stamping step to record both the time **and** the phase:

```ts
if (sent) {
  await custDb.update(isolatedSchema.complianceCertificates)
    .set({ expiryAlertedAt: new Date(), expiryAlertPhase: newPhase })
    .where(eq(isolatedSchema.complianceCertificates.id, cert.id));
  setImmediate(() => logger.info(`📧 [Cert Cron] ${newPhase} alert sent for "${certType.displayName}" (customer ${customer.id})`));
}
```

This gives: one "expiring" email → one "expired" email the day it lapses → a weekly nudge while still expired. A renewal inserts a new row with `expiryAlertPhase = null` and `expiryAlertedAt = null`, so the cycle restarts cleanly.

### Step 4 — Make renewal atomic

In `POST /api/compliance-certificates`, wrap the demote-then-insert in a transaction:

```ts
const created = await custDb.transaction(async (tx: any) => {
  await tx.update(isolatedSchema.complianceCertificates)
    .set({ isCurrent: false })
    .where(and(
      eq(isolatedSchema.complianceCertificates.certificateTypeId, certificateTypeId),
      eq(isolatedSchema.complianceCertificates.isCurrent, true)
    ));

  const [row] = await tx.insert(isolatedSchema.complianceCertificates).values({
    /* ...exactly the same values object as now... */
    isCurrent: true,
  }).returning();
  return row;
});

res.status(201).json(created);
```

### Step 5 — Add an Edit endpoint

Add a `PATCH` route. It updates the editable fields, recomputes `nextDueDate` from the (possibly changed) issue date, validates dates, and **resets the alert cycle** so corrected dates are re-evaluated cleanly:

```ts
// ─── PATCH edit a certificate record ─────────────────────────────────────────
app.patch('/api/compliance-certificates/:id', requireAuth, requireComplianceCertificatesFeature, async (req, res) => {
  try {
    const custDb = await customerDbService.getCustomerDatabase(req.customerId!);
    const schemaName = customerDbService.generateSchemaName(req.customerId!);
    await ensureTables(custDb, schemaName);

    const { id } = req.params;
    const { issueDate, expiryDate, referenceNumber, issuedBy, issuingCompany, notes } = req.body;

    const [cert] = await custDb.select().from(isolatedSchema.complianceCertificates)
      .where(eq(isolatedSchema.complianceCertificates.id, id)) as any[];
    if (!cert) return res.status(404).json({ error: 'Certificate not found' });

    if (!issueDate) return res.status(400).json({ error: 'Issue date is required' });
    if (expiryDate && expiryDate < issueDate) {
      return res.status(400).json({ error: 'Expiry date cannot be before the issue date' });
    }

    const [certType] = await custDb.select().from(isolatedSchema.complianceCertificateTypes)
      .where(eq(isolatedSchema.complianceCertificateTypes.id, cert.certificateTypeId)) as any[];

    const nextDueDate = calculateNextDueDate(issueDate, certType?.frequency ?? 'annual', certType?.customDays);
    const status = calculateCertificateStatus(expiryDate || nextDueDate, certType?.reminderDaysBefore ?? 30);

    const [updated] = await custDb.update(isolatedSchema.complianceCertificates)
      .set({
        issueDate,
        expiryDate: expiryDate || null,
        nextDueDate: nextDueDate || null,
        referenceNumber: referenceNumber || null,
        issuedBy: issuedBy || null,
        issuingCompany: issuingCompany || null,
        notes: notes || null,
        status,
        expiryAlertedAt: null,     // re-evaluate alerts against the corrected dates
        expiryAlertPhase: null,
      })
      .where(eq(isolatedSchema.complianceCertificates.id, id)).returning();

    res.json(updated);
  } catch (err) {
    logger.error('PATCH /api/compliance-certificates/:id', err);
    res.status(500).json({ error: 'Failed to update certificate' });
  }
});
```

Also add the same `expiryDate < issueDate` guard to the existing `POST /api/compliance-certificates` create route, right after pulling the fields off `req.body`.

### Step 6 — Client: Edit dialog + "No Expiry" tile

In `client/src/pages/ComplianceCertificateRegister.tsx`:

**(a)** Add `no_expiry: number;` to the `StatusSummary` interface, and add a fifth tile to the summary banner after "Missing":

```tsx
<div className="text-center"><div className="text-2xl font-bold">{summary.no_expiry}</div><div className="text-white/75">No Expiry</div></div>
```

**(b)** Add an Edit button to the **History** dialog rows (it already lists every record with View/Download/Delete). For each record add an "Edit" button that opens an edit dialog pre-filled from that record:

- Add state: `const [editCert, setEditCert] = useState<Certificate | null>(null);`
- Reuse the existing upload form layout for the fields (issue date, expiry date, reference, issued by, issuing company, notes) — no file picker needed (file upload stays on the existing `/:id/upload` route).
- Wire a mutation: `apiRequest('PATCH', \`/api/compliance-certificates/\${editCert.id}\`, formValues)`, and on success invalidate `['/api/compliance-certificates/types']`, `['/api/compliance-certificates/status-summary']`, and the by-type history query, then toast "Certificate updated." and close.

Keep it consistent with the existing dialogs' styling.

## ACCEPTANCE — how to know it's fixed

1. **Escalation:** Add a Gas Safety certificate with an expiry ~3 days from now and a 30-day reminder. Run the cron (or wait for it). You get **one** "expiring" email. Move the clock past expiry (or set an expiry in the past) and run the cron again — you get an **"EXPIRED"** email even though one was already sent. Run the cron again the next day — **no** duplicate. Run it 7+ days later — you get **another** expired reminder.
2. **Reset on renewal:** Upload a renewal. The new record alerts fresh on its own schedule; the old (now non-current) one stops alerting.
3. **Atomic renewal:** After a renewal there is always exactly **one** `is_current = true` row per type (check the table).
4. **Edit:** Open a certificate's history, edit a wrong issue date, save — the card and "Next due"/"Expires" update, the status recolours, and no delete/re-add was needed.
5. **Validation:** Trying to save an expiry date earlier than the issue date is rejected with a clear message.
6. **Performance:** Loading the register page and saving certificates no longer issues `CREATE TABLE` statements after the first call in the process (check the query log).
7. **Banner:** A "No Expiry" certificate (e.g. asbestos survey) now appears in its own tile and the five numbers reconcile against the total.

## NOT IN SCOPE

- The stored `status` column is still not the source of truth for the screen (the live endpoints recompute it) — that's fine; don't refactor it away here.
- The `next-due fallback`, BST off-by-one, and `no_expiry` bucketing on the server were fixed in a previous pass — don't redo them.
- File-serving access control on `/objects/:objectPath` is already handled (staff session / token + customer match) — leave it.
