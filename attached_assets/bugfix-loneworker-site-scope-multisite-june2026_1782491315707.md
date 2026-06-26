# Bugfix — Lone Worker: site-scope the whole module (multi-site) — SAFETY

**🟠 Lone Worker is a SAFETY feature (escalating safety check-ins to L1/L2/L3 contacts). `loneWorker.ts` reads `lone_worker_sessions` with NO site filter anywhere (9 reads, 0 scoped) — so for a multi-site (enterprise) customer it shows ALL sites' lone-worker sessions and a user can act on another site's session, and escalations could target the wrong site. Single-site customers unaffected. Test customers only. NO `npm run db:push`.**

## The fix (uniform site-scoping pattern)
Resolve `const { db: custDb, siteContext, siteId } = await getScopedDb(req)` and apply:
- **List reads** of `lone_worker_sessions` (L158, L214, L303, L339, L390, L427, L492, L496, L522) → add `scopedWhere(siteContext, isolatedSchema.loneWorkerSessions)` so each list returns only the active site's sessions.
- **By-id reads/actions** → fetch with `and(eq(loneWorkerSessions.id, id), scopedWhere(siteContext, …))`; out-of-scope → 404.
- **Writes** (session create) → `withSiteId(siteId, …)`.
- **Public token check-in** (`lone_worker_tokens`): the safety-confirmation token must resolve to its session's own `site_id` — do NOT break the no-login token flow; the worker confirming safety must always work regardless of active-site UI state.
- **Escalation alerts (L1/L2/L3)** and any cron: must use the **session's own `site_id`** to pick the right site's emergency contacts — never another site's. This is the safety-critical part: an overdue check-in must escalate to the correct site's people.

## Acceptance criteria
- A multi-site user sees only their active site's lone-worker sessions; a session from another site can't be read or actioned by id (404).
- Overdue/escalation alerts target the correct site's contacts (verified against the session's `site_id`).
- The public safety-confirmation token flow still works with no login.
- Single-site customers unchanged.
- Add a `loneWorker` list + by-id case to `tests/site-isolation.routes.test.ts`; confirm it passes and bites.

## Do NOT
- Do not break the public token check-in (a worker confirming safety must always succeed).
- Do not let an escalation use the wrong site's contacts.
- Do not regress single-site customers.
