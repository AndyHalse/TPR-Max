# Compliance Dashboard — finish the job: deep-link the remaining "View" links to the exact item

## Context

Phase 1 (prompt `feature-compliance-dashboard-deep-links-june2026.md`) is **done and verified**: every contractor and staff issue now deep-links to the exact record/tab (e.g. `/contractors/:id?tab=documents&filter=missing`, `/hr/staff/:id?tab=dbs`), the category cards point at filtered lists, and Top Contractor Risks deep-link correctly.

Three "View" links still **don't** land on the specific thing to resolve. Fix all three.

---

## Gap 1 — Site-module issues land on the list page, not the failing item (MAIN FIX)

In `server/routes/complianceDashboard.ts`, these Critical Issues / Warnings still use a bare module path, so the user lands on a list and has to hunt:

- Compliance Certificates → `/compliance-certificates`
- Permits to Work → `/permit-to-work`
- Risk Assessments → `/ra-builder`
- Audits → `/audits`
- PPM / Maintenance → `/ppm`
- Fire Risk Assessment → `/fire-risk-assessment`

The fix is two-sided: (a) make each page accept a `?highlight=<id>` param that scrolls to, highlights, and where relevant expands/opens that record; (b) append the id to each `linkPath`. **The record id is already in scope at every push site** — use it.

### (a) Backend — update each `linkPath`

| Issue id prefix | Current | New `linkPath` |
|---|---|---|
| `cert-expired-…`, `cert-expiring-…` | `/compliance-certificates` | `` `/compliance-certificates?highlight=${row.id}` `` (this id is the `compliance_certificate_types` id `ct.id`) |
| `permit-expired-…`, `permit-pending-…` | `/permit-to-work` | `` `/permit-to-work?highlight=${row.id}` `` |
| `ra-overdue-…`, `ra-review-…` | `/ra-builder` | `` `/ra-builder?highlight=${ra.id}` `` |
| `audit-failed-…`, `audit-overdue-…`, `audit-missed-…` | `/audits` | `` `/audits?highlight=${audit.id}` `` |
| `audit-ca-overdue-…` (corrective action) | `/audits` | `` `/audits?action=${row.id}` `` (a corrective-action id, not an audit id — see note) |
| `ppm-overdue-…`, `ppm-soon-…` | `/ppm` | `` `/ppm?tab=dashboard&highlight=${o.id}` `` (keep existing `?tab=`/`?view=` support working) |
| `fra-overdue-…`, `fra-review-…` | `/fire-risk-assessment` | `` `/fire-risk-assessment?highlight=${fra.id}` `` |

### (b) Frontend — add `?highlight=<id>` handling to each page

For each of the 6 pages (`ComplianceCertificateRegister.tsx`, `PermitToWork.tsx`, `RaBuilder` page behind `/ra-builder`, `Audits.tsx`, `PPM.tsx`, `FireRiskAssessment.tsx`):

1. On mount, read `highlight` (and for audits, `action`) from `new URLSearchParams(window.location.search)`.
2. Give each rendered list item a stable anchor — e.g. `id={\`item-${record.id}\`}` or a ref map keyed by id.
3. When `highlight` is present and the matching item is in the loaded data, `scrollIntoView({ behavior: "smooth", block: "center" })` and apply a temporary highlight (e.g. a ring/background that fades after ~3s). If that item normally needs a click to reveal detail (an accordion, a row that opens a drawer/modal), open it automatically.
4. If the highlighted item isn't on the default view/filter (e.g. an expired cert hidden behind a status filter, or a completed/overdue audit on another tab), switch to the view/filter that shows it before scrolling — the user must actually see the item they came to fix.
5. Do it once per navigation; don't re-trigger on every re-render.

**PPM note:** PPM already reads `?tab=` and `?view=planner` (`PPM.tsx` ~line 2490). Add `highlight` alongside without breaking those.

**Audits corrective-action note:** `audit-ca-overdue` points at a corrective action, not an audit record. Handle `?action=<id>` by opening/scrolling to that corrective action (it may live in a different tab/section of the audits page than the audit list). If that's disproportionate, fall back to `?highlight=<the parent audit id>` — but only if you can resolve the action's audit id; otherwise keep `?action=`.

---

## Gap 2 — Contractor Inductions category card points at the wrong page (one-liner)

In `client/src/pages/ComplianceDashboard.tsx`, the `inductions` entry in `CATEGORY_META` links to `/induction-settings` — that's the induction **configuration** page, not where you resolve overdue inductions. The per-worker induction issues already deep-link correctly to the worker; the aggregate card should match the other contractor cards.

Change:
```ts
inductions: {
  label: "Contractor Inductions", icon: HardHat, link: "/contractors?gaps=true&sort=true",
  ...
}
```

---

## Gap 3 — Expiry Timeline rows aren't clickable (OPTIONAL — completes click-to-resolve)

The "Expiry Timeline — Next 90 Days" rows (`ComplianceDashboard.tsx` ~line 1054) are plain `<div>`s. A user sees "Delta — Public Liability, 12d" but can't click through. This isn't a "View" link, so it's optional — but it's the same principle and finishes the click-to-resolve story.

If doing it:
1. Backend: the `addTimeline(date, category, item)` helper builds every timeline entry. Extend it to also carry a `linkPath` (and accept it at each of the ~17 call sites — reuse the same path you already build for that category's issue, or the category's filtered list where no per-item path exists).
2. Frontend: wrap the timeline row in `<Link href={item.linkPath}>` when present, with hover styling, so the whole row is clickable.

Recommend doing it — but if it balloons, ship Gaps 1 & 2 first and leave this as a follow-up.

---

## Acceptance criteria

- Clicking "View" on **any** site-module Critical Issue or Warning (certificate, permit, risk assessment, audit, PPM, fire risk assessment) lands on that page **with the specific item scrolled into view and highlighted** — not just the list top.
- If the target item is hidden behind a tab/filter, the page switches to show it before highlighting.
- The Contractor Inductions card opens the gaps-filtered contractor list, not induction settings.
- (If Gap 3 done) Expiry Timeline rows are clickable and lead to the right place.
- No regressions: existing `?tab=`/`?view=`/`?filter=` behaviour still works; pages without a `highlight` param behave exactly as before; no console errors when an id isn't found (just skip the scroll).
- British English in any new user-facing text.

## Out of scope
- No change to score calculation or to the contractor/staff links already working from Phase 1.
