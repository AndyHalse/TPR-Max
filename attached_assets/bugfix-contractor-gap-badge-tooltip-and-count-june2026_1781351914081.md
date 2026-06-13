# Bugfix: Contractor compliance-gap badge — missing tooltip in modern sidebar + incomplete gap count (June 2026)

Two issues with the red "gaps" badge on the Contractors nav item: (1) the modern sidebar has no hover tooltip explaining the number (the Classic icon-rail does), and (2) the number itself only counts company-document gaps — it ignores every worker-level gap, so it under-reports.

Copy everything below the line into the Replit agent.

---

## How it works today (for reference)

- `client/src/components/Layout.tsx` computes the badge once:
  ```ts
  const contractorGapsCount = (contractorsForBadge || []).filter(hasContractorComplianceGap).length;
  ```
  from `GET /api/contractors` (company list), and passes it as `badge` on the `/contractors` nav item.
- Both views read that same number. The **Classic icon-rail** (Layout.tsx ~line 373) renders a tooltip: `"{label} ({badge} gap/gaps)"` → "Contractors (5 gaps)". ✓
- The **modern Sidebar** (`client/src/components/Sidebar.tsx`) renders the tooltip only when the sidebar is **collapsed**, and even then it shows a bare `"(5)"`, not "(5 gaps)". When the sidebar is **expanded** (the normal state, per the screenshot) there is **no tooltip at all** (SidebarItem returns the bare row — line ~279).
- `hasContractorComplianceGap` (`client/src/lib/utils.ts`) only checks four **company** document keys:
  ```ts
  const COMPLIANCE_DOC_KEYS = ['publicLiability', 'employersLiability', 'healthSafety', 'cisRegistration'];
  // gap = any of those is 'missing' or 'expired'
  ```

---

## BUG 1 — Modern sidebar badge has no tooltip (and wrong wording when it does)

`Sidebar.tsx` `SidebarItem`:
- **Expanded** (`return inner` at the end): no `<Tooltip>` wrapper, so hovering the Contractors row or its red badge shows nothing.
- **Collapsed**: tooltip text is `{item.tooltip || item.label}{badge ? ` (${badge})` : ""}` → "Contractors (5)" — doesn't say "gaps", so the number is ambiguous.

**Fix:**
1. Match the Classic wording. Where the badge is appended, render `" (N gap)"` / `" (N gaps)"` (singular/plural) exactly like Layout.tsx line ~373, instead of the bare `" (N)"`.
2. Give the badge a tooltip that works in **expanded** mode too. Wrap the red badge `<span>` (both the collapsed dot at line ~242 and the expanded pill at line ~256) in its own `<Tooltip>` whose content is e.g. `"{N} compliance gap{s} — click to review"`. That way hovering the number explains it regardless of collapse state, and clicking the item still navigates to `/contractors`. (The whole nav row already navigates; the badge tooltip is purely informational.)
3. Keep one `TooltipProvider` (already present at Sidebar.tsx line ~164) — don't nest a second provider.
4. Optional nicety: make the badge deep-link to the gaps-filtered list — `/contractors?gaps=true` (the Contractors page already reads `?gaps=true`, see `showGapsOnly` in Contractors.tsx). If easy, point the badge there; otherwise leave the row navigation as-is.

Apply the same treatment to any other badged nav item (e.g. PPM) so wording is consistent everywhere.

---

## BUG 2 — The gap count is incomplete: it ignores ALL worker gaps

`hasContractorComplianceGap` only flags a contractor **company** when one of four **company** documents (Public Liability, Employers' Liability, Health & Safety Policy, CIS) is missing or expired. The number therefore **excludes**:
- **Every worker-level gap** — Right to Work, CSCS, IPAF, CPCS, training certificates, DBS, site induction. This is the biggest omission, and especially wrong now that worker documents are tracked properly.
- **Other company documents** — RAMS, Professional Indemnity, Modern Slavery, Environmental Policy.
- **Expiring-soon** items (only counts `missing`/`expired`, not `expiring`).

It also counts **companies that have a gap** (max 1 per company) while the tooltip says "N gaps", which misrepresents the figure. And `GET /api/contractors` returns companies with no active-only filter, so inactive/archived companies can inflate it.

So the honest answer to "does the badge include all gaps for all current contractors and workers?" is **no — it's company-insurance/CIS only**.

**Fix — make the badge reflect the whole contractor element (companies + workers):**

The authoritative gap logic already exists in `server/routes/complianceDashboard.ts`, which evaluates contractor insurance, RAMS, inductions, worker Right to Work, worker DBS, worker certifications and equipment into `criticalIssues` / `warnings`. Do NOT build a third, thinner calculation — reuse that engine so the badge, the `/compliance-dashboard`, and the Contractors page can never disagree (the same single-source-of-truth lesson from the document-ownership work).

1. Add a lightweight endpoint, e.g. `GET /api/contractors/compliance-gap-count`, that returns the **contractor-element** gap total plus a small breakdown:
   ```json
   { "total": 12, "company": 4, "worker": 8,
     "breakdown": { "insurance": 2, "rams": 1, "inductions": 3, "workerRightToWork": 2, "workerDbs": 1, "workerCertifications": 1, "equipment": 2 } }
   ```
   Compute it from the same per-section logic the dashboard already uses (factor the contractor sections into a shared helper both routes call, rather than duplicating SQL). Count a "gap" as a **missing or expired** (critical) item; expiring-soon may be returned as a separate amber sub-count but should NOT inflate the red badge.
2. Scope to **current** records only: active (non-archived) contractor companies and active (non-archived) workers. Exclude archived workers (the archive columns now exist) and inactive companies.
3. Point the sidebar badge at this endpoint instead of deriving from the company list + `hasContractorComplianceGap`. Keep the 30s refetch.
4. Decide and document the badge's meaning, and make the tooltip wording match exactly:
   - **Recommended:** badge = **total outstanding compliance gaps** across companies + workers (so "12 gaps" is literally true). Tooltip: "Contractors — 12 compliance gaps".
   - If that proves too noisy in real data, switch to **count of contractors + workers with ≥1 gap** ("8 need attention") — but then the tooltip must say "need attention", not "gaps". Pick one; don't let the number and the word disagree.
5. Update the Contractors page for consistency: its "Show gaps only" filter and any "N gaps" text currently use the same company-only `hasContractorComplianceGap`. Either broaden them to include worker gaps (preferred, using the shared logic) or clearly label them "company-document gaps" so the page and the badge don't contradict each other. Flag to the user which you chose.

Keep `hasContractorComplianceGap` if still used elsewhere, but rename it to `hasContractorCompanyDocumentGap` so its limited scope is obvious, and make sure nothing relies on it as a proxy for "fully compliant".

---

## Verification

1. Modern sidebar, **expanded**: hovering the Contractors badge shows a tooltip like "Contractors — N compliance gaps" (or the agreed wording). Same in **collapsed** mode, with correct singular/plural.
2. The badge number equals the count returned by `/api/contractors/compliance-gap-count` and includes worker gaps: create a worker with an expired Right to Work and a missing CSCS under a company that has all company docs valid → the badge increments (previously it would NOT have, because the company docs were fine).
3. Remove all company-doc gaps but leave a worker induction outstanding → badge still shows the worker gap (was previously 0).
4. Archive a worker who had a gap → badge decrements (archived workers excluded).
5. The badge, the `/compliance-dashboard` contractor section, and the Contractors page agree on what's outstanding (no three different numbers).
6. Expiring-soon-only items do not light up the red badge unless you deliberately included them; if shown, they're a separate amber indicator.
7. `npx tsc --noEmit` clean; tenant isolation unaffected; the badge endpoint is per-customer.

Do NOT change the Classic icon-rail tooltip (it's already correct) or the badge styling/position — only the modern sidebar tooltip behaviour and the count source.
