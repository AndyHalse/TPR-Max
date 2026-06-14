# Bugfix: Compliance Certificate Register ignores the calculated "next due" date — recurring tests are never flagged (June 2026)

On the **Compliance Certificate Register** page, recurring statutory tests (weekly fire alarm test, monthly emergency lighting, monthly Legionella sampling, and most of the 14 standard types) are never tracked for being due or overdue.

When you log a certificate, the system already works out the **next due date** from the certificate type's frequency (issue date + 7 days / 1 month / 1 year / etc.) and saves it to the database column `next_due_date`. But nothing ever reads it back. Every status calculation — the card colour, the "Expiring Soon / Expired" label, the daily expiry email, and the green/amber/red compliance banner — looks **only** at the manually-typed `expiry_date`.

A weekly fire alarm test has no "expiry date" to type in, so a sensible user leaves that box blank. The card then shows a permanent blue **"No Expiry"**, the daily cron skips it, and the summary banner counts it as **"Current"** — so the test is never flagged again no matter how overdue it gets. The register silently behaves like a passive filing cabinet for exactly the recurring tests it's meant to police.

There are two smaller issues in the same area worth fixing in the same pass: the summary banner over-counts "Current", and the days-remaining figure is off by one during British Summer Time.

Copy everything below the line into the Replit agent.

---

## THE BUG

### 1. The calculated next-due date is dead data

In `server/routes/complianceCertificates.ts`, the create route works out the next due date and stores it:

```ts
const nextDueDate = calculateNextDueDate(issueDate, certType.frequency, certType.customDays);
const status = calculateCertificateStatus(expiryDate || nextDueDate, certType.reminderDaysBefore);
// ...
nextDueDate: nextDueDate || null,
```

Note the create route correctly falls back to `nextDueDate` when there's no `expiryDate` — but only for the *stored* `status` column, which is never displayed.

Every endpoint that drives what the user actually sees uses `expiryDate` on its own and ignores `nextDueDate`:

- **`GET /api/compliance-certificates/types`** (the card grid):
  ```ts
  const s = calculateCertificateStatus(latestCert.expiryDate, t.reminderDaysBefore);
  status = latestCert.expiryDate ? s : 'no_expiry';
  daysUntilExpiry = getDaysUntilExpiry(latestCert.expiryDate);
  ```
  No `expiryDate` → always `'no_expiry'`, regardless of how overdue the next test is.

- **`GET /api/compliance-certificates/status-summary`** (the banner):
  ```ts
  const s = calculateCertificateStatus(cert.expiryDate, t.reminderDaysBefore);
  if (!cert.expiryDate) current++;        // <-- counts a never-tracked cert as "Current"
  ```

- **The daily expiry cron:**
  ```ts
  if (!cert || !cert.expiryDate) continue;   // <-- skips every cert with no expiry date
  ```

So a recurring test logged without an expiry date is invisible to status, alerts, and the compliance score forever.

### 2. The banner over-reports "Current"

Separate from the fallback issue: `status-summary` lumps every no-expiry certificate into the `current` count. Even after we fix the fallback, a genuinely no-fixed-expiry document (e.g. an asbestos management survey, which has no set interval) shouldn't be quietly counted as "Current — fully compliant". It should sit in its own bucket so the banner is honest.

### 3. Off-by-one days counter in British Summer Time

In `server/utils/complianceCertUtils.ts`, `getDaysUntilExpiry` normalises `today` to local midnight but parses the expiry date as UTC midnight without normalising it:

```ts
export function getDaysUntilExpiry(expiryDate: string | null | undefined): number | null {
  if (!expiryDate) return null;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  return Math.ceil((new Date(expiryDate).getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}
```

During BST, `new Date("2025-06-14")` is 01:00 local, while `today` is 00:00 local — the leftover hour makes `Math.ceil` round up, so a certificate due **today** reads as **"1d"**. `calculateCertificateStatus` already normalises both sides correctly; this helper should too.

## THE FIX

Four small changes — one helper, three endpoints, plus a client tweak so the user can see the next-due date.

### 1. `server/utils/complianceCertUtils.ts` — add an "effective due date" helper and fix the BST off-by-one

Add a helper that returns the date the register should judge a certificate against: the manually-entered expiry if there is one, otherwise the calculated next-due date.

```ts
/**
 * The date the register should judge a certificate against.
 * Prefer a manually-entered expiry date; otherwise fall back to the
 * frequency-derived next-due date so recurring tests (weekly fire alarm,
 * monthly emergency lighting, etc.) are still tracked when no expiry is typed.
 */
export function getEffectiveDueDate(
  cert: { expiryDate?: string | null; nextDueDate?: string | null }
): string | null {
  return cert.expiryDate || cert.nextDueDate || null;
}
```

And normalise the expiry date in `getDaysUntilExpiry` the same way `calculateCertificateStatus` does:

```ts
export function getDaysUntilExpiry(expiryDate: string | null | undefined): number | null {
  if (!expiryDate) return null;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const expiry = new Date(expiryDate); expiry.setHours(0, 0, 0, 0);
  return Math.ceil((expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}
```

### 2. `GET /api/compliance-certificates/types` — judge against the effective due date

Import the new helper alongside the others, then in the `.map` over types:

```ts
if (latestCert) {
  const dueDate = getEffectiveDueDate(latestCert);
  const s = calculateCertificateStatus(dueDate, t.reminderDaysBefore);
  status = dueDate ? s : 'no_expiry';
  daysUntilExpiry = getDaysUntilExpiry(dueDate);
  isOverdue = status === 'expired';
}
```

(Optionally also return `nextDueDate: latestCert?.nextDueDate ?? null` in the response object so the client can label it — see step 5.)

### 3. `GET /api/compliance-certificates/status-summary` — count against the effective due date, and stop inflating "Current"

Replace the counting loop so it uses the effective due date and gives genuinely-no-expiry certs their own bucket instead of folding them into `current`:

```ts
let current = 0, expiring = 0, expired = 0, noCert = 0, noExpiry = 0;
for (const t of types) {
  const cert = certsByType[t.id];
  if (!cert) { noCert++; continue; }
  const dueDate = getEffectiveDueDate(cert);
  if (!dueDate) { noExpiry++; continue; }   // logged, but no due date to judge — its own bucket
  const s = calculateCertificateStatus(dueDate, t.reminderDaysBefore);
  if (s === 'current') current++;
  else if (s === 'expiring_soon') expiring++;
  else if (s === 'expired') expired++;
}

let overallStatus: string = 'compliant';
if (expired > 0 || noCert > 0) overallStatus = 'critical';
else if (expiring > 0) overallStatus = 'attention_needed';

res.json({ total: types.length, current, expiring_soon: expiring, expired, no_certificate: noCert, no_expiry: noExpiry, overallStatus });
```

### 4. Daily expiry cron — alert on the effective due date

In the cron loop, replace the `expiry_date`-only guard and the lines that build the email so they use the effective due date. Change:

```ts
if (!cert || !cert.expiryDate) continue;
const status = calculateCertificateStatus(cert.expiryDate, certType.reminderDaysBefore);
```

to:

```ts
if (!cert) continue;
const dueDate = getEffectiveDueDate(cert);
if (!dueDate) continue;   // genuinely no expiry/next-due — nothing to alert on
const status = calculateCertificateStatus(dueDate, certType.reminderDaysBefore);
```

Then, lower down, use `dueDate` where the email currently reads `cert.expiryDate` for the days/date calculations:

```ts
const days = getDaysUntilExpiry(dueDate);
// ...
const statusLine = isExpired
  ? `Due <strong>${Math.abs(days ?? 0)} days ago</strong> (${dueDate})`
  : `Due on <strong>${dueDate}</strong> (${days} days remaining)`;
```

Leave the table row that prints the issue date as-is. For the "Expiry date" table row, show `dueDate` (relabel it "Due date" so it's accurate for recurring tests):

```ts
<tr><td style="padding:4px 0;color:#6b7280">Due date</td><td>${dueDate}</td></tr>
```

### 5. Client — show the next-due date so the user understands what's being tracked

In `client/src/pages/ComplianceCertificateRegister.tsx`, the card currently only renders an "Expires" row when `cert?.expiryDate` is set. Add a fallback so that when there's no manual expiry but the type is recurring, the card shows the calculated next-due date. After the existing `cert?.expiryDate` block:

```tsx
{!cert?.expiryDate && cert?.nextDueDate && (
  <>
    <div className="text-gray-500 dark:text-gray-400">Next due</div>
    <div className={`font-semibold ${certType.status === 'expired' ? 'text-red-600' : certType.status === 'expiring_soon' ? 'text-amber-600' : 'text-gray-800 dark:text-gray-200'}`}>
      {cert.nextDueDate}
      {certType.daysUntilExpiry !== null && (
        <span className="ml-1 font-normal text-gray-500">
          ({certType.daysUntilExpiry < 0 ? `${Math.abs(certType.daysUntilExpiry)}d ago` : `${certType.daysUntilExpiry}d`})
        </span>
      )}
    </div>
  </>
)}
```

Add `nextDueDate: string | null;` to the `Certificate` interface (it's already in the DB and now returned by the API). If you returned a top-level `nextDueDate` on the type object in step 2, expose it on the `CertType` interface too.

## ACCEPTANCE — how to know it's fixed

1. Load the standard types. Add a **Fire Alarm Test (Weekly)** with an issue date of 10 days ago and **no expiry date**. The card should now show **"Expired"** (red) with "Next due … (Xd ago)", not a blue "No Expiry".
2. Add an **Emergency Lighting Test (Monthly)** issued 20 days ago, no expiry. With the default 30-day reminder it should show **"Expiring Soon"** (amber), because the next-due date (issue + 1 month) is within 30 days.
3. The compliance banner's **Current** count should no longer include those recurring tests, and the overall status should move to **Attention Required / Action Needed** accordingly.
4. A certificate with a genuinely blank expiry **and** no calculated next-due (e.g. the asbestos survey, frequency "custom" with 0 days) still shows **"No Expiry"** and is not counted as "Current".
5. The daily cron email fires for an overdue recurring test (previously it skipped anything with no expiry date).
6. For a certificate due today, the days figure reads **"0d"**, not "1d", in summer.

## NOT IN SCOPE

- The `/objects/:objectPath` file-serving access-control gap (the download endpoint redirects there) is a separate, already-logged platform-wide issue — don't change it here.
- Don't change the stored `status` column logic on create; the live endpoints are the source of truth for display.
