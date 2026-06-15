# INVESTIGATION — simultaneous multi-endpoint 500 cascade on /contractors

**Source:** TPR Bug Report BR-008 (15 Jun 2026). This is an investigation prompt, not a known-line fix — the goal is to find out whether TPR has a recurring database-connection problem.

## What the logs show
At **12:28:29**, within the same second, a whole set of unrelated endpoints all returned HTTP 500 at once, then recovered:
```
HTTP 500 GET /api/auth/me
HTTP 500 GET /api/staff
HTTP 500 GET /api/lone-worker/active
HTTP 500 GET /api/zones
HTTP 500 GET /api/cdm/projects
HTTP 500 GET /api/company-settings
HTTP 500 GET /api/settings
HTTP 500 GET /api/contractors/workers/all
HTTP 500 GET /api/ppm/expiry-count   (12:28:31)
```
Seven+ different routes failing in the same instant is almost never seven separate bugs. The usual causes are **one shared dependency briefly going down** — most likely the customer database connection (pool exhausted, connection dropped/timed out, or a reconnect storm), or the auth/session layer that every one of these routes depends on.

## STRONG LIKELY ROOT CAUSE (found by code review — start here)
`server/customerDatabase.ts` (~line 153) creates every customer pool with **`max: 1`**:
```ts
pool = new Pool({
  connectionString,
  max: 1,                       // <-- only ONE connection per customer, ever
  min: 1,
  idleTimeoutMillis: 0,
  connectionTimeoutMillis: 10000,
});
```
With `max: 1`, TPR can run **only one query at a time per customer**. The `/contractors` page fires 8+ requests on load (`auth/me`, `staff`, `zones`, `settings`, `company-settings`, `workers/all`, `ppm/expiry-count`, `notes`…) — they all contend for the single connection and queue. If any one query is slow, or the Neon database is waking from suspend, the lone connection is held, the queue backs up, and every request that waits past `connectionTimeoutMillis: 10000` (10s) throws **at the same instant** — exactly the 12:28:29 cascade. The persistent notes 500 is plausibly the same contention.

**This is almost certainly the bug.** `max: 1` is fine for a single user clicking slowly; it collapses under any concurrency (multiple users, or one busy page). At 120-site scale (Cowiesburn) it would fail constantly.

### Recommended fix (verify against Neon's limits first)
- Raise `max` to a realistic pool size per customer (e.g. **5–10**) so a normal page load doesn't self-DoS.
- **Neon caveat:** Neon caps direct connections, so don't just crank `max` blindly. Use Neon's **pooled connection string** (the `-pooler` endpoint / PgBouncer) so a higher `max` is safe, OR keep per-customer `max` modest but pooled. Confirm the chosen `max` × expected concurrent customers stays within Neon's connection ceiling.
- Reconsider `idleTimeoutMillis: 0` (never closes idle connections) — with many customer pools held open this adds up; a finite idle timeout lets Neon scale to zero cleanly.
- Make sure the Neon cold-start path (the "endpoint waking up" retry at ~line 210) doesn't hold the single connection hostage while a page-load burst queues behind it.

## Also check
1. **Server logs for 12:28:29–12:28:31** — confirm the shared exception is a pool/connection timeout (e.g. `Connection terminated`, pool timeout, `connectionTimeoutMillis` exceeded), which would confirm the `max: 1` diagnosis above.
2. **Connection release** — confirm queries release the connection back to the pool promptly (no leaks holding the single slot).
3. Is there a `pool.on('error')` handler, and does a dropped connection re-establish cleanly rather than cascade? (There is one ~line 167 handling Neon suspend — verify it actually recovers in-flight requests.)
3. **Is it recurring or a one-off?** Check the logs/monitoring for other timestamps with the same simultaneous-500 signature. A one-off that self-healed is low priority; a repeating pattern under load is serious and will hit real customers (especially the larger ones — relevant to the Cowiesburn 120-site deal).
4. **Auth/session layer** — `requireAuth` and `/api/auth/me` both 500'd. If a session/token lookup briefly failed, every authenticated route would 500 at once. Rule this in or out.

## Why this matters
Right now these 500s are invisible until someone happens to file a bug report with the logs attached. That's the case for proper error monitoring — at minimum, an alert when many endpoints 500 in a short window. (Tie-in: the error-ID + diagnostics work in `feature-error-id-and-diagnostics-june2026.md`; a monitoring tool like Sentry is the bigger-picture answer if these turn out to be recurring.)

## Deliverable
- A clear root-cause statement for the 12:28:29 cascade (DB pool / connection drop / auth — which one), backed by the server-log exception.
- If it's a pool/connection issue: a fix (pool sizing, connection release, reconnect handling) and confirmation it survives a burst of concurrent requests.
- A recommendation on whether to add a "many 500s in a short window" alert.

## Related
- `bugfix-contractor-notes-500-june2026.md` — the persistent notes 500 may share a root cause (both touch the customer DB).
