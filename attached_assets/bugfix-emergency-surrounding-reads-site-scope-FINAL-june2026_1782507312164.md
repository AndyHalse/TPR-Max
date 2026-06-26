# Bugfix (FINAL) — emergency.ts: site-scope the non-muster surrounding reads (multi-site)

**The live muster/roll-call was already fixed (FIX-01, strictly per-site). But `emergency.ts` has ~47 reads of site-scoped tables and only ~6 scoped — the surrounding NON-live-muster reads (dashboards, history, lists, people-on-site widgets) still ignore the active site for enterprise customers. Single-site unaffected. Test customers only. NO `npm run db:push`.**

## The fix
Audit every read in `server/routes/emergency.ts` of site-scoped tables — `members`, `staff`, `visitors`, `contractor_visits`, `muster_points`, `evacuation_zones`, `safety_tokens`, `evacuation_accountability` (via parent). For each:
- **List / dashboard / history / people-on-site reads** → add `scopedWhere(siteContext, <table>)`.
- **By-id reads/actions** → `and(eq(<table>.id, id), scopedWhere(siteContext, <table>))`; out-of-scope → 404.
- **Writes** → `withSiteId`.
- **Keep the live muster strictly per-site** (already correct — do not regress it; a live evacuation must never aggregate sites).
- `evacuation_accountability` and other child rows resolve via the parent evacuation/zone — once the parent is in scope, load children by parent id; don't scope separately.
- Public Fire Marshal / self-mark-safe token flows resolve via their own `site_id` — don't break the no-login flow.

## Acceptance criteria
- For a multi-site customer, every emergency dashboard/list/history shows only the active site; a record from another site can't be read by id.
- The live muster remains strictly per-site (unchanged).
- Public token flows still work; single-site customers unchanged.
- Add an `emergency` case to the route-isolation test (or rely on the consolidated test prompt's muster case).

## Do NOT
- Do not aggregate sites on any live muster/roll-call.
- Do not break the public Fire Marshal / self-mark-safe flows.
- Do not regress single-site customers.
