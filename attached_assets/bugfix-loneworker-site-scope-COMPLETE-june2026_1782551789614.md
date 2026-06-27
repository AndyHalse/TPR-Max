# Bugfix — loneWorker: COMPLETE the site-scoping (the residual prompt missed this entirely) — SAFETY

**Verification shows ALL nine reads of `lone_worker_sessions` in `server/routes/loneWorker.ts` are still unscoped (L159, 215, 307, 343, 394, 431, 496, 501, 528) — the earlier residual prompt fixed FRA but not this. Lone Worker is a SAFETY feature (escalating check-ins to L1/L2/L3 contacts). The route-isolation test already has a `GET /api/lone-worker/active` case that will FAIL until this is fixed. Test customers only. Single-site unaffected. NO `npm run db:push`.**

## The fix (do every read — none are currently scoped)
With `const { db: custDb, siteContext, siteId } = await getScopedDb(req)`:
- **Every list read** of `lone_worker_sessions` (L159, L215, L307, L343, L394, L431, L496, L501, L528 — active sessions, history, dashboards, monitoring views) → add `scopedWhere(siteContext, isolatedSchema.loneWorkerSessions)` to the WHERE.
- **Any by-id read/action** → `and(eq(loneWorkerSessions.id, id), scopedWhere(siteContext, …))`; out-of-scope → 404.
- **Creates** → `withSiteId(siteId, …)`.
- **Public token check-in** (`lone_worker_tokens`): resolve via the session's own `site_id`; do NOT break the no-login safety-confirmation flow.
- **Escalation alerts and any cron**: use the session's OWN `site_id` to choose the correct site's emergency contacts — never another site's. This is the safety-critical part.

## Acceptance criteria
- `npm run test:site-isolation-routes` — the loneWorker case now PASSES (Site A sees only Site A's active sessions; Site B's are invisible; by-id out-of-scope → 404).
- Escalations target the correct site's contacts.
- Public safety-confirmation token flow still works with no login.
- Single-site customers unchanged.

## Do NOT
- Do not break the public token check-in or escalate to the wrong site's contacts.
- Do not leave ANY `lone_worker_sessions` read unscoped.
- Do not regress single-site customers.
