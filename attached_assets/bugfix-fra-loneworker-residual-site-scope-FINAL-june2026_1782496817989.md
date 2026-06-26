# Bugfix (FINAL residuals) — fireRiskAssessment + loneWorker remaining site-scope leaks

**Verification after the 9-module pass found two modules NOT fully fixed. Close them. Test customers only. Single-site unaffected. NO `npm run db:push`.**

## 1. fireRiskAssessment.ts — one by-id endpoint missed
- L330: a by-id read of `fire_risk_assessments` (`eq(fireRiskAssessments.id, …)`) has NO `scopedWhere` — the other by-id endpoints (L420/457/497/531/586/662/702/731) were fixed; this one was missed.
- Fix: `and(eq(fireRiskAssessments.id, id), scopedWhere(siteContext, isolatedSchema.fireRiskAssessments))`; out-of-scope → 404.

## 2. loneWorker.ts — only partially scoped (SAFETY)
Lone Worker is a safety feature (escalating check-ins to L1/L2/L3 contacts). Several `lone_worker_sessions` reads still lack `scopedWhere` — e.g. L158, L214, L303, L339, L390, L427, L492, L496, L522.
- Fix: add `scopedWhere(siteContext, isolatedSchema.loneWorkerSessions)` to every list read, and `and(eq(id,…), scopedWhere(...))` to any by-id read; stamp creates with `withSiteId`.
- The public token check-in (`lone_worker_tokens`) resolves via its session's own `site_id` — don't break the no-login flow.
- **Escalation alerts MUST use the session's own `site_id`** to pick the correct site's emergency contacts.

## 3. meetingRooms.ts — optional tidy (low priority)
L615/642/765/836 fetch a room via `booking.meetingRoomId` (an already site-scoped booking), so they're gatekept and safe. Optionally add `scopedWhere` there too for belt-and-braces, but it is not a leak.

## Acceptance criteria
- Every FRA and loneWorker read/by-id endpoint returns only the active site's data (404 out of scope); loneWorker escalations target the correct site's contacts.
- Public token flows (lone-worker check-in) still work.
- Single-site customers unchanged.
- Add `fireRiskAssessment` and `loneWorker` cases to the route-isolation test (the consolidated test prompt also covers this — whichever lands first).

## Do NOT
- Do not break the lone-worker public check-in or let an escalation use the wrong site's contacts.
- Do not regress single-site customers.
