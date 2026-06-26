# Bugfix — Risk Assessment Builder: site-scope by-id endpoints (multi-site)

**`raBuilder.ts` scopes the main list (L38 ✓) but every by-id endpoint reads `ra_builder_assessments` with no site check (L82, L109, L146, L177, L259) — so a multi-site (enterprise) user can view/edit/delete/publish another site's RA by id. Single-site customers unaffected. Test customers only. NO `npm run db:push`.**

## The fix (uniform site-scoping pattern)
With `const { db: custDb, siteContext } = await getScopedDb(req)`:
- **By-id reads/actions** of `ra_builder_assessments` (L82, L109, L146, L177, L259 — view, update, hazards, delete, publish-to-RAMS) → fetch with `and(eq(raBuilderAssessments.id, id), scopedWhere(siteContext, isolatedSchema.raBuilderAssessments))`; out-of-scope → 404.
- **Child `ra_builder_hazards`** resolves via the parent RA — load by the parent id once it's confirmed in scope; don't scope separately.
- Keep the main list (L38) and writes' `withSiteId`.
- **Publish-to-RAMS**: when a RA is published into the shared RAMS register, the resulting `rams_documents` record must carry the RA's `site_id` (so it lands on the correct site's register).

## Acceptance criteria
- A multi-site user gets 404 for another site's RA on every by-id endpoint.
- Publishing a RA creates the RAMS record on the correct site.
- Single-site customers unchanged.
- Add a `raBuilder` by-id case to `tests/site-isolation.routes.test.ts`; confirm it passes and bites.

## Do NOT
- Do not separately scope `ra_builder_hazards` (resolve via the verified parent).
- Do not regress single-site customers.
