# UAT-11 — Lone Worker: expired check-in link falsely claims "a new email has been sent"

## Context (this module is otherwise well-built)
Lone Worker monitoring in `server/routes/loneWorker.ts` is strong: tiered L1→L2→L3 escalation, escalation level correctly reset on start/end/confirm, incident record created at L3, singleton cron, both staff and contractor paths supported. This is a single real defect in an otherwise solid module.

## Why
A welfare check-in email (with a one-time confirmation token) is sent to the worker only in two places:
- on session **start** (`sendFirstWelfareEmail`, ~line 241), and
- on a **successful** confirmation (`sendLoneWorkerWelfareCheck`, ~lines 313 and 380, which also mints the next token).

The escalation routine `processLoneWorkerSession` (L1/L2/L3, ~lines 75–140) emails **supervisors only** — it never mints a new worker token or sends the worker a fresh welfare email.

The worker's token expires at `intervalMins + gracePeriodMins`. Once it expires:
- The confirm handler returns: **"This confirmation link has expired. A new check-in email has been sent."** (`GET /api/lone-worker/ok/:customerId/:token`, ~line 344; same in the token-only alias ~line 294).
- **But no new email is ever sent.** Nothing in the expiry branch or the escalation path re-sends a welfare email or mints a new token.

**Impact:** a lone worker who is actually safe but slightly delayed clicks their link, is told a new email is coming, and it never arrives. They have no way to self-confirm "I'm OK" and must wait for a supervisor to manually end the session. The message is a false promise during a safety-critical escalation, which causes confusion exactly when clarity matters.

## What to change
Preferred fix (B) — make the promise true and let the worker keep self-confirming:
1. When the confirm endpoint is hit with an **expired** (but otherwise valid, unused, session-active) token, mint a fresh token and send a new `sendLoneWorkerWelfareCheck` email to `session.personEmail`, then return a message like "This link had expired — we've sent you a fresh check-in link." Only do this while the session is still `active`/`escalated` (not ended/cancelled).
2. Guard against abuse/spam: only re-send if the last welfare email was more than, say, 60 seconds ago (reuse the cooldown idea from UAT-04 if convenient), and don't re-send for ended sessions.

Minimum fix (A) — if (B) is out of scope right now, at least make the message **honest**: change the expired-link text to instruct the worker to contact their supervisor immediately (and remove the false "a new check-in email has been sent" claim). Do not ship the false message.

Recommended: implement (B). It keeps the worker in the safety loop instead of dead-ending them.

## Acceptance test
- Start a lone worker session; let the welfare token expire without confirming.
- Click the expired link:
  - With fix (B): a new welfare email is sent, the worker receives a fresh working link, and confirming it resets the deadline and escalation level as normal.
  - With fix (A): the worker sees an honest message telling them to contact their supervisor; no false claim of a sent email.
- Supervisors still receive L1/L2/L3 escalation emails on the existing schedule (no regression).
- Re-sending is rate-limited and does not fire for ended/cancelled sessions.
