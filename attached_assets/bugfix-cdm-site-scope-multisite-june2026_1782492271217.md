# Bugfix — CDM 2015: site-scope the whole module (multi-site)

**`cdm.ts` reads `cdm_projects` with NO site filter (list L37/141/145/203; by-id L632) — so a multi-site (enterprise) customer sees ALL sites' CDM projects and can act on another site's project by id. Single-site customers unaffected. Test customers only. NO `npm run db:push`.**

## The fix (uniform site-scoping pattern)
Resolve `const { db: custDb, siteContext, siteId } = await getScopedDb(req)` and apply:
- **List reads** of `cdm_projects` (L37, L141, L145, L203 — project list, dashboard/threshold checks, F10 status) → add `scopedWhere(siteContext, isolatedSchema.cdmProjects)`.
- **By-id reads/actions** (L632 and any other `eq(cdmProjects.id, …)`) → fetch with `and(eq(cdmProjects.id, id), scopedWhere(siteContext, …))`; out-of-scope → 404.
- **Writes** (project create/update) → `withSiteId(siteId, …)`.
- **F10 notification cron**: runs per customer; the threshold check (>30 days AND >20 peak workers, OR >500 person-days) and the F10 alert email must be evaluated per project using its own `site_id`, and de-duplicated per project per day as now.

## Acceptance criteria
- A multi-site user sees only their active site's CDM projects and gets 404 for another site's project by id.
- F10 threshold alerts fire per project against the correct site.
- Single-site customers unchanged.
- Add a `cdm` list + by-id case to `tests/site-isolation.routes.test.ts`; confirm it passes and bites.

## Do NOT
- Do not regress single-site customers or the F10 alert dedup.
