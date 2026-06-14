# UAT-03 — Add auth guard to muster "mark-all-safe" endpoint

## Why
`POST /api/muster/mark-all-safe` in `server/routes/emergency.ts` (handler starts ~line 5628) has **no route middleware**. It manually reads `req.customerId` / `req.session.customerId` and returns 401 if missing, but it doesn't use the standard guard the other muster routes use. Every other muster route uses `requireAuth`, and the file already imports `requireAuthOrFireMarshal` (line 5) — the purpose-built guard that allows EITHER a logged-in user OR a fire marshal operating via their special URL (via the `x-fire-marshal-id` header). Right now `mark-all-safe` is the odd one out and has no role/identity gate at the middleware layer.

## What to change
1. In `server/routes/emergency.ts`, add the existing `requireAuthOrFireMarshal` middleware to the route:
   ```
   app.post("/api/muster/mark-all-safe", requireAuthOrFireMarshal, async (req, res) => { ... })
   ```
   Use `requireAuthOrFireMarshal` (NOT plain `requireAuth`) so a fire marshal acting from their evacuation URL can still mark people safe during a real evacuation — that is the whole point of the feature.
2. The middleware sets `req.customerId` for both the logged-in and fire-marshal cases, so the existing line inside the handler that reads `req.customerId || (req.session as any)?.customerId` will keep working. You can leave the in-handler 401 check as a belt-and-braces fallback, or simplify it — either is fine, but do not remove the customerId read.
3. Confirm this matches how the other accountability routes in the same file are guarded (e.g. the toggle-accounted route around line 5628 area and `/api/muster/*` routes), so the muster endpoints are consistent.

## Acceptance test
- A logged-in admin can still press "Mark all safe" and it works.
- A fire marshal hitting the endpoint with a valid `x-fire-marshal-id` header (their evacuation URL flow) can still mark all safe.
- A request with no session and no valid fire-marshal id returns 403, not a partial action.
