# Feature — Operations layer: monitoring, error alerting, and backup verification (July 2026)

## Read this first

TPR currently has no way of telling anyone it has fallen over. There is no health check, no uptime alerting, and no proof the database backups can actually be restored. This prompt adds the minimum operations layer a life-safety SaaS needs: a health endpoint, an external uptime check, error-spike alerting by email, and an automated backup-verification job with a visible status on Platform Admin.

> ⚠️ **`npm run db:push` IS needed** — one new table (`ops_backup_checks`). Take a database backup before running it.
> ✅ Everything else is additive. Do not modify any existing module logic, routes, or schemas beyond what is listed here.
> ✅ Reuse the existing email service (the same one that sends evacuation/expiry alerts) — do not add a new email dependency.

---

## Part 1 — Health check endpoint

Create `GET /api/health` (public, no auth, rate-limited to 60/min per IP):

Return JSON:
```json
{
  "status": "ok" | "degraded" | "down",
  "db": true,
  "uptimeSeconds": 12345,
  "version": "<from package.json>",
  "timestamp": "<ISO>"
}
```

- `db`: run a trivial `SELECT 1` against the database with a 3-second timeout. If it fails or times out, `status = "down"` and respond with HTTP 503 (uptime monitors key off the status code).
- Must NOT leak anything sensitive: no env vars, no connection strings, no customer counts, no internal paths.
- Register it BEFORE any auth middleware so it always answers.

Also create `GET /api/health/deep` — same as above plus: email service configured (bool), file storage reachable (bool — a lightweight GCS metadata call with timeout), and count of cron jobs registered. This one requires platform-admin auth (reuse the existing platform admin middleware).

## Part 2 — Error-spike alerting

The app already logs errors through Winston and a global error handler. Add an in-memory error counter to the global error handler:

1. Count unhandled 5xx errors in a rolling 5-minute window (a simple timestamp array or counter with reset is fine — no new dependency).
2. If the count crosses a threshold (default 10 in 5 minutes, configurable via env var `OPS_ERROR_ALERT_THRESHOLD`), send ONE alert email to the platform ops address (`OPS_ALERT_EMAIL` env var; fall back to the existing platform admin email setting) containing: the count, the window, the top 3 error messages with routes (message + route only — no request bodies, no personal data), and the server start time.
3. Cooldown: never send more than one spike alert per 30 minutes, however many errors occur. Store last-sent time in memory.
4. Also send a one-off "server started" email on boot IF `OPS_STARTUP_EMAIL=true` — useful for spotting crash-loops. Default off.

## Part 3 — Backup verification job

Neon takes storage-level backups, but nobody has ever proven a restore works. Add an automated verification that the data is readable and complete enough to restore from:

1. New table `ops_backup_checks`: `id`, `ran_at`, `status` ('pass' | 'fail'), `tables_checked` (int), `total_rows` (int), `duration_ms` (int), `notes` (text).
2. Daily cron at 03:30 Europe/London (register it alongside the existing crons, same pattern):
   - Enumerate all customer schemas plus the platform schema.
   - For each schema, count tables and total rows (fast `pg_class`/`information_schema` estimates are fine — do NOT `COUNT(*)` every table on large schemas; use `reltuples` estimates).
   - Sanity checks: every customer schema has more than 0 tables; the core tables (`users`, `visitors`, `contractors`, `staff` — where present) exist in each; total row estimate has not dropped by more than 20% versus the previous check (a big drop means data loss).
   - Write a row to `ops_backup_checks`. On 'fail', email `OPS_ALERT_EMAIL` immediately with which schema and which check failed.
3. This does not replace a real restore test — add a note to the Platform Admin panel (Part 4) saying "Last manual restore test: —" with a button for the platform admin to record the date they last performed a manual Neon restore test (store in platform settings). Manual restore discipline stays human; the daily job catches silent data loss.

## Part 4 — Platform Admin "System Health" tab

Add a "System Health" tab to the existing Platform Admin page (follow the exact pattern of the existing tabs — same components, same styling, ACS blue, no new UI libraries):

- Current health: live call to `/api/health/deep`, shown as green/amber/red cards (DB, email, storage, crons).
- Error alerting: current 5-minute error count, threshold, last alert sent.
- Backup checks: last 14 rows of `ops_backup_checks` in a table (date, status, tables, rows, duration), with a red banner if the latest check failed or if no check has run in 48 hours.
- Manual restore test: the recorded date + "Record restore test done today" button (platform admin only, writes to platform settings with the admin's name and timestamp).

## Part 5 — External uptime monitoring (instructions, not code)

Add a `docs/uptime-monitoring.md` file with setup instructions for pointing a free external monitor (e.g. UptimeRobot or Better Stack) at `GET /api/health`, checking every 1 minute, alerting the ops email on two consecutive failures. Include the exact URL pattern and expected 200/503 behaviour. The external monitor is what catches the server being completely dead — the in-app alerting cannot report its own death.

---

## What NOT to do

- Do not add Sentry, Datadog, Prometheus, or any new monitoring dependency — email + the admin tab is the whole scope.
- Do not touch any customer-facing page, the kiosk, or emergency screens.
- Do not log or email any personal data (names, emails, visitor records) in alerts.
- Do not change existing cron jobs.

## Acceptance tests

1. `GET /api/health` returns 200 with `db: true` normally; returns 503 when the DB connection string is temporarily broken.
2. `GET /api/health/deep` returns 401 without platform-admin auth.
3. Forcing 10+ errors in 5 minutes (hit a deliberately-erroring test route) produces exactly one alert email; a further 50 errors within 30 minutes produce no second email.
4. Running the backup-check job manually writes a 'pass' row and it appears on the System Health tab.
5. Deleting a test schema's tables (on a disposable test schema only) makes the next check write 'fail' and send an alert email.
6. No existing test breaks; `tests/site-isolation.routes.test.ts` still passes.
