# Fix — Compliance Dashboard: RAMS expiry not detected (verified against live codebase 9 June 2026)

## The problem (read this first)

The Compliance Dashboard reports **expired RAMS documents as fully compliant**. They never show as a critical issue and they inflate the RAMS score.

Why: the dashboard decides a RAMS document's state by reading its stored `status` field and checking whether it equals `'expired'` or `'expiring'`. But **nothing in the codebase ever sets those values.** A RAMS document's `status` is only ever `'valid'` (the schema default) or `'pending_review'`. There is no cron and no scheduled job that transitions a RAMS to expired/expiring when its `expiryDate` passes. So every RAMS sits on `'valid'` forever and the dashboard counts it as compliant — even years after it expired.

Every other category on this dashboard (Contractor Insurance, Inductions, Right to Work, Compliance Certificates) already works out expiry **live** from the actual date. RAMS is the only one that trusts a stale status string. This fix brings RAMS into line with the others.

**Scope:** one file, one block. Do **not** touch any other category, the domain weights, or the overall score maths. Run `npm run check` when done.

---

## File to change

`server/routes/complianceDashboard.ts`

## What to do

Find the **RAMS Documents** block (section 2, currently around lines 114–146). It begins with the comment `// ── 2. RAMS Documents ───` and ends at the `const ramsScore = ...` line.

**Replace the whole block** — from the `// ── 2. RAMS Documents` comment down to and including the `const ramsScore` line — with this:

```ts
      // ── 2. RAMS Documents ─────────────────────────────────────────────────────
      // NOTE: ramsDocuments.status is NOT kept in sync with expiryDate — nothing in
      // the system ever transitions it to 'expiring'/'expired'. So compute expiry
      // LIVE from expiryDate (matching Contractor Insurance / Compliance Certificates),
      // and treat the stored status only as a backstop for manual overrides.
      const rams = await custDb.select().from(schema.ramsDocuments)
        .where(eq(schema.ramsDocuments.isActive, true));

      let ramsTotal = rams.length, ramsValid = 0, ramsExpiring = 0, ramsExpired = 0;

      for (const r of rams) {
        const companyName = companies.find(c => c.id === r.companyId)?.name;
        const ramsDays = daysUntil(r.expiryDate);

        if (r.status === 'expired' || (ramsDays !== null && ramsDays < 0)) {
          ramsExpired++;
          criticalIssues.push({
            id: `rams-expired-${r.id}`, category: 'RAMS Documents', severity: 'critical',
            title: 'RAMS document expired',
            detail: ramsDays !== null && ramsDays < 0
              ? `${r.documentName} (${r.ramsIdRef}) — expired ${Math.abs(ramsDays)} days ago`
              : `${r.documentName} (${r.ramsIdRef})`,
            daysOverdue: ramsDays !== null && ramsDays < 0 ? Math.abs(ramsDays) : undefined,
            linkPath: '/contractors',
          });
          if (companyName && r.companyId) {
            ensureContractorRisk(r.companyId, companyName);
            contractorRiskMap[r.companyId].issues.push(`RAMS expired: ${r.documentName}`);
            contractorRiskMap[r.companyId].issueCount++;
          }
        } else if (r.status === 'expiring' || (ramsDays !== null && ramsDays <= 30)) {
          ramsExpiring++;
          warnings.push({
            id: `rams-expiring-${r.id}`, category: 'RAMS Documents', severity: 'warning',
            title: 'RAMS document expiring soon',
            detail: ramsDays !== null
              ? `${r.documentName} (${r.ramsIdRef}) — expires in ${ramsDays} days`
              : `${r.documentName} (${r.ramsIdRef})`,
            linkPath: '/contractors',
          });
          if (companyName && r.companyId) {
            ensureContractorRisk(r.companyId, companyName);
            contractorRiskMap[r.companyId].issues.push(`RAMS expiring: ${r.documentName}`);
            contractorRiskMap[r.companyId].issueCount++;
          }
          addTimeline(r.expiryDate, 'RAMS', r.documentName);
        } else {
          ramsValid++;
          addTimeline(r.expiryDate, 'RAMS', r.documentName);
        }
      }

      const ramsScore = ramsTotal === 0 ? 100 : Math.round((ramsValid / ramsTotal) * 100);
```

### What changed and why

- **Expiry is now computed from `expiryDate`**, exactly like Contractor Insurance and Compliance Certificates already do. The stored `status` is kept as a backstop (`r.status === 'expired'` / `'expiring'`) so any manual override still works, but it's no longer the only thing checked.
- **Expired RAMS now appear as critical issues** with a "expired N days ago" detail and `daysOverdue`, so they sort correctly alongside other critical items.
- **Expiring RAMS (within 30 days) now also attribute to the contractor's risk profile**, matching how Contractor Insurance behaves — so the "Top 5 Contractor Risks" panel is accurate.
- The `expiryDate` column is `NOT NULL` in the schema, so `ramsDays` will always be a real number in practice; the `!== null` guards are just safety.

---

## Verify

1. `npm run check` passes.
2. In a test customer, upload a RAMS document and set its `expiryDate` to **yesterday** (status left on `valid`). Load the Compliance Dashboard:
   - It appears in **Critical Issues** as "RAMS document expired".
   - The **RAMS category score drops** (it's no longer counted as compliant).
   - The contractor shows in **Top Contractor Risks** with a "RAMS expired" issue.
3. Set another RAMS `expiryDate` to **20 days from now**: it appears under **Warnings** as "expiring soon" and on the **90-day expiry timeline**.
4. A RAMS with a **future expiry (>30 days)** still counts as compliant — no change.

---

## Not covered by this prompt (separate jobs)

These were found in the same review but are out of scope here — ask if you want prompts for them:

- The dashboard's **score-explanation tooltip** still describes the old "7 categories" model with outdated weights. The real engine now uses 10 categories across two 50/50 domains (Contractor / Site). The text needs updating to match.
- The **Permits to Work** category checks for status `'pending'`, which the permit workflow never uses (it uses `'submitted'`), so the "awaiting authorisation" warning never fires.
