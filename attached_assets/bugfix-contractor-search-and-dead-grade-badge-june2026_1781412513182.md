# Bugfix: Contractor page search misses phone + remove the dead "Safety Rating" grade badge — June 2026

Two cosmetic/correctness fixes on the Contractor Management page. Separate from the data-integrity prompt `bugfix-contractor-document-delete-hard-vs-soft-june2026.md` — apply that one too.

Copy everything below the line into the Replit agent.

---

## Bug A — Company search box advertises "phone" but doesn't search it

On the Contractor Companies tab the search box placeholder says **"Search by company name, industry, phone, or email…"** (`client/src/pages/contractor/ContractorCompaniesTab.tsx`), but the filter behind it ignores phone. The filter is `matchesSearch()` in `client/src/pages/contractor/types.ts`:

```ts
export function matchesSearch(item: any, search: string): boolean {
  if (!search) return true;
  const s = search.toLowerCase();
  return (
    (item.name || '').toLowerCase().includes(s) ||
    (item.contactFirstName || '').toLowerCase().includes(s) ||
    (item.contactLastName || '').toLowerCase().includes(s) ||
    (item.email || '').toLowerCase().includes(s) ||
    (item.industry || '').toLowerCase().includes(s)
  );
}
```

It never checks phone, and it only checks `email` even though the cards actually display `contactEmail || email` and `contactPhone || phone`. So searching by the phone number or the contact email shown on the card returns nothing.

**Fix:** add `phone`, `contactPhone`, and `contactEmail` to the matched fields so the box does what the placeholder promises:

```ts
export function matchesSearch(item: any, search: string): boolean {
  if (!search) return true;
  const s = search.toLowerCase();
  return (
    (item.name || '').toLowerCase().includes(s) ||
    (item.contactFirstName || '').toLowerCase().includes(s) ||
    (item.contactLastName || '').toLowerCase().includes(s) ||
    (item.email || '').toLowerCase().includes(s) ||
    (item.contactEmail || '').toLowerCase().includes(s) ||
    (item.phone || '').toLowerCase().includes(s) ||
    (item.contactPhone || '').toLowerCase().includes(s) ||
    (item.industry || '').toLowerCase().includes(s)
  );
}
```

Leave the placeholder text as-is — the fix makes it accurate.

---

## Bug B — Remove the dead "Safety Rating" grade badge everywhere on the contractor pages

There is a coloured grade pill (shows things like `A+` or `0`) on contractor companies, workers, and the contractor detail page. It reads the company field `complianceScore`, but **nothing in the application ever calculates or writes that field** — the AI scoring that used to populate it was removed for performance (see the comment "Use existing compliance score without AI calculation for performance" in `server/routes/contractors.ts` ~line 750) and never replaced. The field stays at its default, so the badge always shows a meaningless `0`, or `A+` when the value is blank (`GET /api/contractors` falls back to `"A+"`). On the detail page every contractor therefore looks like a green **A+** regardless of their real state — actively misleading.

The colour helper it uses, `getSafetyRatingColor()` (in `types.ts`), also expects letter grades A–F, so a numeric score would never get a sensible colour anyway.

Right next to this dead badge is the **document-compliance badge that does work** — `getComplianceBadge(documentsStatus)`, which renders 🟢 Compliant / 🟡 Incomplete / 🔴 Missing legal docs from live document status. **Keep that one.** Just remove the dead grade pill everywhere.

**Remove all of these:**

1. `client/src/pages/contractor/ContractorCompaniesTab.tsx`
   - Grid view (~lines 167–171): the `<Badge className={getSafetyRatingColor(company.complianceScore || 'N/A')}>{company.complianceScore || 'N/A'}</Badge>` block.
   - List view (~lines 307–311): the same badge again.
   - Remove `getSafetyRatingColor` from the import on line 18 (keep `matchesSearch`, `getComplianceBadge`, `ExtendedContractorCompany`).

2. `client/src/pages/contractor/ContractorPreviousTab.tsx`
   - ~lines 226–228 and ~line 433: the two `<span className={... getSafetyRatingColor(contractor.safetyRating)}>{contractor.safetyRating}</span>` pills.
   - Remove the now-unused `getSafetyRatingColor` import (line 4).

3. `client/src/pages/contractor/ContractorWorkerProfileDialog.tsx`
   - ~line 131: the `{worker.safetyRating && <span ... getSafetyRatingColor(worker.safetyRating)}>{worker.safetyRating}</span>}` pill.
   - Remove the now-unused `getSafetyRatingColor` import (line 8).

4. `client/src/pages/ContractorDetails.tsx`
   - ~lines 1178–1188: remove the whole **"Safety Rating"** `<Card variant="glass" data-testid="card-safety-rating">…</Card>` block (the one showing `contractor?.complianceScore || 'A+'` in 2xl bold). This page has its **own** local `getSafetyRatingColor` (line 42) — delete that local function too once the card is gone, and tidy the surrounding grid so the remaining summary cards still lay out evenly.

5. `client/src/pages/contractor/useContractorManagement.ts`
   - ~line 232: drop `safetyRating: company?.complianceScore || "N/A"` from the `previousContractors` map (nothing reads it after the above).

6. `client/src/pages/contractor/types.ts`
   - Once the above are done, `getSafetyRatingColor()` is unused — delete the exported function.

Do **not** touch the legacy page `client/src/pages/Contractors.tsx` (route `/contractors/legacy`) — it computes its own real percentage from documents and is separate.

## Verification

1. On Contractor Management → Contractor Companies, type part of a company's **phone number** → the matching company shows. Same for the **contact email** shown on the card.
2. No grey `0` / `A+` grade pill anywhere on: the Contractor Companies cards (grid and list), the Previous Contractors list, the worker profile dialog, or the contractor detail page.
3. The colour-coded document-compliance badge (Compliant / Incomplete / Missing legal docs) is still present on the company cards.
4. The contractor detail page no longer shows a "Safety Rating" card; the remaining summary cards still line up.
5. `npx tsc --noEmit` is clean — no unused-import or missing-reference errors from the removals.
