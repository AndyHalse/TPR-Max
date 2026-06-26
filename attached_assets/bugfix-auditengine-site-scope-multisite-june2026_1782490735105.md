# Bugfix — Audit & Inspection Engine: site-scope the whole module (multi-site)

**`auditEngine.ts` imports `siteScope` but uses it on NOTHING — the main audit list, every by-id endpoint, the dashboard/stats, and the mobile flow all read `audit_records` with no site filter. For a multi-site (enterprise) customer this shows ALL sites' audits and lets a user act on any site's audit by id. Single-site customers unaffected. Test customers only. NO `npm run db:push`.**

## The fix (uniform site-scoping pattern)
Resolve `const { db: custDb, siteContext, siteId } = await getScopedDb(req)` and apply:
- **List reads** of `audit_records` (L51, L64, and the dashboard/summary reads L686/688, L1126/1129/1132/1148/1155/1166/1171/1202) → add `scopedWhere(siteContext, isolatedSchema.auditRecords)` to the WHERE so they return only the active site's audits.
- **By-id reads/actions** of `audit_records` (L719, L762, L789, L830 — view, start, conduct, submit/score, corrective actions) → fetch with `and(eq(auditRecords.id, id), scopedWhere(siteContext, auditRecords))`; if not found → 404 (out-of-scope fails closed).
- **Writes** (audit create) → `withSiteId(siteId, …)`.
- **Child tables** `audit_record_items` and `audit_corrective_actions` resolve via the parent audit — once the parent is confirmed in scope, load children by `auditRecordId`; don't scope them separately. **`audit_templates` / `audit_template_items` are reusable customer-level config — leave them customer-scoped (NOT site-scoped).**
- **Mobile audit view** (token-based public URL, no login): the token must resolve to the audit's own `site_id`; records created/updated from mobile inherit that site. Don't break the public flow.
- **Daily overdue cron**: runs per customer; ensure any per-site count/notification uses each record's `site_id`.

## Acceptance criteria
- A user whose active site is A sees only Site A audits in the list and dashboard, and gets 404 for a Site B audit by id (every action endpoint). enterprise_admin sees all; area/site users their scope.
- Reusable templates still shared across the customer (not site-restricted).
- Single-site customers unchanged.
- Add an `auditEngine` list + by-id case to `tests/site-isolation.routes.test.ts`; confirm it passes and bites.

## Do NOT
- Do not site-scope `audit_templates`/`audit_template_items` (customer-level by design).
- Do not separately scope the child item/corrective-action tables (resolve via the verified parent).
- Do not regress single-site customers or the public mobile audit flow.
