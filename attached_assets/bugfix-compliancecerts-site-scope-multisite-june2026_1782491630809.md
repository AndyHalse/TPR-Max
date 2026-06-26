# Bugfix — Compliance Certificate Register: site-scope the whole module (multi-site)

**`complianceCertificates.ts` reads `compliance_certificates` with NO site filter anywhere (list L107/228/243/262/463/508; by-id L353/392/411/453) — so a multi-site (enterprise) customer sees ALL sites' certificates and can act on another site's certificate by id. Single-site customers unaffected. Test customers only. NO `npm run db:push`.**

## The fix (uniform site-scoping pattern)
Resolve `const { db: custDb, siteContext, siteId } = await getScopedDb(req)` and apply:
- **List reads** of `compliance_certificates` (L107, L228, L243, L262, L463, L508 — register, dashboard, expiry/status views) → add `scopedWhere(siteContext, isolatedSchema.complianceCertificates)`.
- **By-id reads/actions** (L353, L392, L411, L453 — view, edit, renew, delete) → fetch with `and(eq(complianceCertificates.id, id), scopedWhere(siteContext, …))`; out-of-scope → 404.
- **Writes** (certificate create/renew) → `withSiteId(siteId, …)`.
- **`compliance_certificate_types` are reusable customer-level config — leave them customer-scoped (NOT site-scoped).**
- **Expiry-alert cron**: runs per customer; ensure per-site expiry counts/emails use each certificate's `site_id`.

## Acceptance criteria
- A multi-site user sees only their active site's certificates (register, dashboard, expiry views) and gets 404 for another site's certificate by id.
- Certificate *types* remain shared across the customer.
- Single-site customers unchanged.
- Add a `complianceCertificates` list + by-id case to `tests/site-isolation.routes.test.ts`; confirm it passes and bites.

## Do NOT
- Do not site-scope `compliance_certificate_types` (customer-level by design).
- Do not regress single-site customers.
