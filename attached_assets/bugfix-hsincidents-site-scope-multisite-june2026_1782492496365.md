# Bugfix — H&S Incidents (RIDDOR): site-scope by-id endpoints + secondary lists (multi-site)

**`hsIncidents.ts` scopes the main list (L134 ✓) but every by-id endpoint and two secondary lists read `hs_incidents` with no site check — so a multi-site (enterprise) user can view/resolve/investigate/edit/delete another site's incident (incl. RIDDOR records) by id, and the secondary lists leak across sites. Single-site customers unaffected. Test customers only. NO `npm run db:push`.**

## The fix (uniform site-scoping pattern)
With `const { db: custDb, siteContext } = await getScopedDb(req)`:
- **By-id reads/actions** of `hs_incidents` (L326, L350, L368, L389, L412 — view, resolve, investigation status, edit, delete) → fetch with `and(eq(hsIncidents.id, id), scopedWhere(siteContext, isolatedSchema.hsIncidents))`; out-of-scope → 404.
- **Secondary list reads** (L686, L780 — e.g. dashboard/pyramid/trend/CSV export) → add `scopedWhere(siteContext, isolatedSchema.hsIncidents)`.
- **Child `hs_incident_audit`** resolves via the parent incident — load by `incidentId` once the parent is confirmed in scope; don't scope it separately.
- Keep the existing main-list scoping (L134) and the writes' `withSiteId`.
- RIDDOR deadline calc, reminder cron, and any per-site email must use the incident's own `site_id`.

## Acceptance criteria
- A multi-site user gets 404 for another site's incident on every by-id endpoint; the dashboard/exports show only the active site.
- RIDDOR records and reminders stay tied to the correct site.
- Single-site customers unchanged.
- Add an `hsIncidents` by-id case to `tests/site-isolation.routes.test.ts` (the main list is already covered if present); confirm it passes and bites.

## Do NOT
- Do not separately scope `hs_incident_audit` (resolve via the verified parent).
- Do not regress single-site customers.
