# Bugfix — Help Desk: site-scope by-id endpoint + secondary lists (multi-site)

**`helpdesk.ts` scopes the main ticket list (L33 ✓) but a by-id endpoint (L87) and two secondary lists (L59, L154) read `help_desk_tickets` with no site check — so a multi-site (enterprise) user can view/act on another site's ticket by id, and the secondary lists leak across sites. Single-site customers unaffected. Test customers only. NO `npm run db:push`.**

## The fix (uniform site-scoping pattern)
With `const { db: custDb, siteContext } = await getScopedDb(req)`:
- **By-id reads/actions** of `help_desk_tickets` (L87 — view/update/resolve) → fetch with `and(eq(helpDeskTickets.id, id), scopedWhere(siteContext, isolatedSchema.helpDeskTickets))`; out-of-scope → 404.
- **List reads** L59, L154 (e.g. by-status / dashboard / counts) → add `scopedWhere(siteContext, isolatedSchema.helpDeskTickets)`.
- Keep the main list (L33) and writes' `withSiteId`.
- Ticket-number generation and any counts should be per the active site's scope.

## Acceptance criteria
- A multi-site user gets 404 for another site's ticket by id; all ticket lists/counts reflect only the active site.
- Single-site customers unchanged.
- Add a `helpdesk` by-id case to `tests/site-isolation.routes.test.ts`; confirm it passes and bites.

## Do NOT
- Do not regress single-site customers.
