# Bugfix — Fire Risk Assessment: site-scope by-id endpoints + secondary lists (multi-site)

**`fireRiskAssessment.ts` scopes the main list (L216 ✓) but a second list (L240) and the by-id endpoints read `fire_risk_assessments` with no site check — so a multi-site (enterprise) user can view/edit/complete-actions on another site's FRA by id, and the secondary list/compliance-status leaks across sites. FRA is fire-safety compliance (RRFSO 2005), so rank above plain severity. Single-site customers unaffected. Test customers only. NO `npm run db:push`.**

## The fix (uniform site-scoping pattern)
With `const { db: custDb, siteContext } = await getScopedDb(req)`:
- **List reads** of `fire_risk_assessments` (L240, L465, L753 — second list, compliance-status, outstanding-actions widget) → add `scopedWhere(siteContext, isolatedSchema.fireRiskAssessments)`. (Keep the main list L216 as is.)
- **By-id reads/actions** (L328, L414, L451 — view, edit, action items, complete) → fetch with `and(eq(fireRiskAssessments.id, id), scopedWhere(siteContext, …))`; out-of-scope → 404.
- **Child tables** (`fra_audit`, FRA action items) resolve via the parent FRA — load by the parent id once it's confirmed in scope; don't scope separately.
- Keep writes' `withSiteId`. The auto-supersede (only one active FRA) must be **per site** — superseding a previous FRA must compare within the same `site_id`, not across the customer.
- Critical-action email alerts and the daily reminder cron must use the FRA's own `site_id`.

## Acceptance criteria
- A multi-site user gets 404 for another site's FRA by id; the compliance-status and outstanding-actions widgets reflect only the active site.
- Auto-supersede operates per site (creating a new FRA at Site A does not supersede Site B's active FRA).
- Single-site customers unchanged.
- Add a `fireRiskAssessment` by-id case to `tests/site-isolation.routes.test.ts`; confirm it passes and bites.

## Do NOT
- Do not let auto-supersede span sites.
- Do not separately scope `fra_audit`/action items (resolve via the verified parent).
- Do not regress single-site customers.
