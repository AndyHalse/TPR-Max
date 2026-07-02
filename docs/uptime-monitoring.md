# TPR Max — External Uptime Monitoring Setup

TPR Max exposes a health-check endpoint designed for external uptime monitors.
An external monitor is essential — it is the only way to detect that the server
is completely dead, since in-app alerting cannot report its own death.

---

## Health endpoint

| Property | Value |
|---|---|
| **URL** | `https://<your-domain>/api/health` |
| **Method** | `GET` |
| **No auth required** | (public endpoint) |
| **Rate limit** | 60 requests / minute per IP |

### Response — healthy (HTTP 200)

```json
{
  "status": "ok",
  "db": true,
  "uptimeSeconds": 12345,
  "version": "1.0.0",
  "timestamp": "2026-07-02T03:30:00.000Z"
}
```

### Response — database unreachable (HTTP 503)

```json
{
  "status": "down",
  "db": false,
  "uptimeSeconds": 12345,
  "version": "1.0.0",
  "timestamp": "2026-07-02T03:30:00.000Z"
}
```

**Key rule for monitors:** treat HTTP 503 as "down". The HTTP status code is
the signal — do not parse the JSON body for alerting logic.

---

## Recommended monitor: UptimeRobot (free tier)

1. Go to [https://uptimerobot.com](https://uptimerobot.com) and create an account.
2. Click **Add New Monitor**.
3. Set the following:

   | Field | Value |
   |---|---|
   | Monitor Type | HTTP(s) |
   | Friendly Name | `TPR Max production` |
   | URL | `https://<your-domain>/api/health` |
   | Monitoring Interval | **1 minute** |
   | Monitor Timeout | 30 seconds |

4. Under **Alert Contacts**, add the ops email address (same as `OPS_ALERT_EMAIL`).
5. Set **Alert Threshold** to **2 consecutive failures** before alerting.
   This avoids false alarms from transient network blips.
6. Save the monitor.

---

## Recommended monitor: Better Stack (free tier)

1. Go to [https://betterstack.com](https://betterstack.com) → **Uptime** → **New monitor**.
2. Set:

   | Field | Value |
   |---|---|
   | URL | `https://<your-domain>/api/health` |
   | Check frequency | 1 minute |
   | Confirmation period | 2 consecutive failures |
   | Regions | At least 2 (e.g. EU + US) |

3. Add the ops email or a paging policy under **On-call** → **Escalation policies**.

---

## Verifying the monitor works

1. Confirm your monitor shows **green / up** against the live URL.
2. To test the 503 path without breaking production: temporarily set an invalid
   `DATABASE_URL` on a staging clone, restart, and confirm the monitor fires
   within 2 minutes.
3. In Platform Admin → **System Health**, the live health card should match
   what the external monitor sees.

---

## What the monitor catches vs. what in-app alerting catches

| Scenario | External monitor | In-app error-spike alert |
|---|---|---|
| Server process crashed | ✅ | ❌ (can't send if dead) |
| Database completely unreachable | ✅ (503) | ❌ (error handler won't fire) |
| High 5xx error rate (app running) | ❌ | ✅ |
| Crash-loop (repeated restarts) | ✅ (downtime intervals) | Partial (startup emails) |
| Slow responses / timeout | ✅ (timeout setting) | ❌ |

Both layers are needed. Neither replaces the other.
