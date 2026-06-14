# UAT-07 — Compliance Dashboard scores MISSING DATA as 100% compliant (false assurance)

## Why — this is the most serious defect in the compliance area
The Compliance Dashboard (`server/routes/complianceDashboard.ts`) computes every category score as:

```
const xScore = xTotal === 0 ? 100 : Math.round((xCompliant / xTotal) * 100);
```

i.e. **a category with no data scores 100%.** It then combines categories with FIXED weights that always sum to 100% (lines ~995–1020):

```
contractorScore = insScore*0.25 + ramsScore*0.15 + indScore*0.15 + workerRtwScore*0.15
                  + workerDbsScore*0.10 + workerCertScore*0.10 + equipScore*0.10
siteScore       = certsScore*0.20 + permitsScore*0.15 + raScore*0.15 + auditsScore*0.15
                  + ppmScore*0.10 + fraScore*0.10 + rtwScore*0.10 + staffDbsScore*0.025 + staffTrainingScore*0.025
overallScore    = contractorScore*0.50 + siteScore*0.50
riskBand        = overallScore >= 90 ? 'green' : ...
```

**The effect:** a brand-new site, or any site that simply hasn't entered data for a category, has that category counted as 100% at full weight. A completely empty system → every category 100 → **overallScore 100, riskBand GREEN — "fully compliant"** when in reality there is NO compliance evidence on file. Even partially, untracked categories (e.g. a site that never uses RAMS, permits, audits, FRA, DBS) inflate the overall score and mask the categories that genuinely have problems.

For a product sold on compliance, a customer could rely on a green "100%" in front of an HSE auditor when they are actually unmonitored. This must not ship as-is.

Note: the Contractor Insurance block was already partly hardened (lines ~142–152 count companies with no PL/EL on record) — good, but RAMS and most other categories still ignore "should exist but missing", and the empty-category `=== 0 ? 100` rule still applies everywhere. Also line ~1066 `documentApprovals` is hardcoded `score: 100` regardless of data.

## What to change
Treat "no data" as **unknown/untracked**, NOT as compliant:

1. **Per-category:** when `xTotal === 0`, return a score of `null` (or a sentinel like `score: null, tracked: false`) instead of `100`. Keep returning the real percentage when there is data.

2. **Aggregation:** exclude untracked (`null`) categories from the weighted averages and **re-normalise the weights** across only the categories that have data. Example: if RAMS is untracked, redistribute its 0.15 weight proportionally across the remaining contractor categories so the weights of tracked categories still sum to 1. Do this for `contractorScore` and `siteScore` independently, then combine. If a whole domain (contractor or site) has no tracked categories, that domain score is `null` too.

3. **Banding / display:** never show GREEN / "100% compliant" purely because data is absent. If overall is computed from a reduced set, surface a **data-coverage indicator** alongside it (e.g. "Score based on 6 of 13 categories — 7 categories have no data yet"). Untracked categories should render grey "Not tracked / No data", not green.

4. Fix the hardcoded `documentApprovals` score (line ~1066) to follow the same rule (null when there are no approvals to assess).

## Design decision to confirm with Andy before building
There are two valid philosophies and he should pick:
- **(A) Exclude untracked categories** (recommended above) — score reflects only what's actually monitored, with a clear coverage caveat.
- **(B) Treat "required but missing" as non-compliant (0%)** — harsher; only safe where the category is genuinely mandatory for every site (insurance already does a version of this). Some categories (e.g. Equipment on a site with no equipment) would be unfairly penalised under (B), so a blanket 0% is wrong.
Recommended: implement (A) globally, and keep the existing "missing" warnings (like insurance PL/EL) so genuinely-required gaps still raise alerts.

## Acceptance test
- A brand-new tenant with no data anywhere → overall score is NOT 100% green; it shows "No data / not enough to score" with a coverage note, and no category shows a green 100% it didn't earn.
- A site with full insurance data but no RAMS → RAMS shows "Not tracked" (grey), the contractor score is computed from the tracked categories only with re-normalised weights, and the coverage indicator reflects the missing category.
- A fully-populated, genuinely-compliant site → still scores ~100% green as before (no regression).
