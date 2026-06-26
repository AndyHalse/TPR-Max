# Bugfix — Permit to Work: site-scope every `/api/ptw/:id` endpoint (multi-site)

**`permitToWork.ts` scopes the list (`GET /api/ptw`, L125 ✓) and create (`POST /api/ptw`, L155 ✓) correctly — but EVERY by-id endpoint fetches the permit with `eq(permitToWork.id, id)` and no site check. So a multi-site (enterprise) user with one site active can VIEW and ACT ON another site's permit by its id — submit, authorise, reject, activate, suspend, resume, close, cancel, archive, edit checklist, add/delete attachments. That's a cross-site WRITE leak, not just a read. Single-site customers are unaffected. Test customers only. NO `npm run db:push` needed.**

## The fix (one consistent pattern)
For every endpoint that loads a permit by id, change the lookup so it only returns the permit when it belongs to the caller's site scope — i.e. add `scopedWhere` to the WHERE:
```ts
const { db: custDb, siteContext } = await getScopedDb(req);
const [permit] = await custDb.select().from(isolatedSchema.permitToWork)
  .where(and(eq(isolatedSchema.permitToWork.id, id), scopedWhere(siteContext, isolatedSchema.permitToWork)));
if (!permit) return res.status(404).json({ error: 'Permit not found' });   // out-of-scope → 404, fail closed
```
Apply to **all** of these (`server/routes/permitToWork.ts`):
- `GET /api/ptw/:id` (369)
- `PATCH /api/ptw/:id/checklist/:checklistItemId` (413) and `POST /api/ptw/:id/checklist/regenerate` (448)
- `PATCH /api/ptw/:id/submit` (487), `/authorise` (555), `/reject` (585), `/activate` (608), `/suspend` (634), `/resume` (657), `/close` (680), `/cancel` (703), `/archive` (810)
- `GET /api/ptw/:id/attachments` (734), `POST …/attachments` (747), `DELETE …/attachments/:attachmentId` (788)

The child tables (`permit_checklist`, `permit_attachments`) inherit the parent's site — once the parent permit is confirmed in scope, the children are safe (keep loading them by `permitId`). Do not separately scope the children.

## Also
- **L51** — there's a read of `permit_to_work` before the route handlers (looks like a helper/cron). If it's a list/aggregation feeding per-site output, scope it; if it's a customer-wide cron that legitimately processes all permits, leave it but confirm any per-site email/notification uses the permit's own `site_id`.
- **L181/L192 (company-documents reads)** — judge whether these are contractor *company* documents (estate-wide, leave) or site-scoped; scope only if site-level.

## Acceptance criteria
- A user whose active site is A gets **404** (not the record) when requesting or acting on a permit that belongs to site B — for every `:id` endpoint above. Proven via the API, not just the UI.
- An enterprise_admin (all sites) can still act on any permit; an area_manager / site_coordinator only within their scope.
- List and create behaviour unchanged; single-site customers completely unaffected.
- Add Permit-to-Work cases to `tests/site-isolation.routes.test.ts`: a list-isolation case AND a by-id case (Site-A user gets 404 for a Site-B permit). Confirm `npm run test:site-isolation-routes` passes and bites.

## Do NOT
- Do not leave any `:id` permit fetch without the scope check.
- Do not separately scope the checklist/attachment child tables (resolve via the verified parent).
- Do not regress single-site customers.
