# Replit Prompt — Outgoing Webhooks (Zapier / Make Integration)

## What This Does

Adds a configurable outgoing webhook system to TPR. When key events happen, TPR POSTs a JSON payload to a customer-configured URL. This lets customers connect TPR to any external tool — Zapier, Make (formerly Integromat), their own systems, Slack, or anything else with a webhook endpoint.

This is the fastest way to give SMEs integrations without building each one individually. A customer on Zapier can connect TPR to their accounting system, HR platform, notification tool, or spreadsheet in minutes.

Feature flag: `featureWebhooks` (default: `false` — TPR Pro and above).

---

## Files to Create

- `server/routes/webhooks.ts`
- `server/utils/webhookDispatcher.ts`
- `client/src/pages/settings/WebhookSettings.tsx`

## Files to Change

- `server/isolatedSchema.ts` — add `webhookEndpoints` and `webhookDeliveryLog` tables
- `server/customerDatabase.ts` — migrations
- Trigger files (visitors.ts, contractors.ts, emergency.ts, hsIncidents.ts) — add dispatch calls
- `client/src/pages/Settings.tsx` — nav link
- `client/src/App.tsx` — route

---

## 1. Database — `server/isolatedSchema.ts`

```typescript
export const webhookEndpoints = pgTable('webhook_endpoints', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  url: text('url').notNull(),
  secret: text('secret'),                        // HMAC-SHA256 signing secret (optional)
  active: boolean('active').default(true),
  events: text('events').array().notNull(),       // array of subscribed event names
  createdAt: timestamp('created_at').defaultNow(),
  lastTriggeredAt: timestamp('last_triggered_at'),
  consecutiveFailures: integer('consecutive_failures').default(0),
});

export const webhookDeliveryLog = pgTable('webhook_delivery_log', {
  id: serial('id').primaryKey(),
  endpointId: integer('endpoint_id').notNull(),
  event: text('event').notNull(),
  payload: jsonb('payload').notNull(),
  responseStatus: integer('response_status'),
  responseBody: text('response_body'),
  deliveredAt: timestamp('delivered_at').defaultNow(),
  success: boolean('success').notNull(),
  error: text('error'),
});
```

Migrations in `server/customerDatabase.ts`:
```typescript
await pool.query(`
  CREATE TABLE IF NOT EXISTS "${schemaName}".webhook_endpoints (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    url TEXT NOT NULL,
    secret TEXT,
    active BOOLEAN DEFAULT true,
    events TEXT[] NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    last_triggered_at TIMESTAMPTZ,
    consecutive_failures INTEGER DEFAULT 0
  )
`);
await pool.query(`
  CREATE TABLE IF NOT EXISTS "${schemaName}".webhook_delivery_log (
    id SERIAL PRIMARY KEY,
    endpoint_id INTEGER NOT NULL,
    event TEXT NOT NULL,
    payload JSONB NOT NULL,
    response_status INTEGER,
    response_body TEXT,
    delivered_at TIMESTAMPTZ DEFAULT NOW(),
    success BOOLEAN NOT NULL,
    error TEXT
  )
`);
```

---

## 2. Supported Event Types

Define these as a constant in `server/utils/webhookDispatcher.ts`:

```typescript
export const WEBHOOK_EVENTS = [
  'visitor.arrived',
  'visitor.departed',
  'visitor.pre_registered',
  'contractor.arrived',
  'contractor.departed',
  'evacuation.started',
  'evacuation.ended',
  'incident.created',                // any H&S incident
  'incident.riddor_flagged',
  'contractor.document_expired',
  'contractor.induction_expired',
  'permit_to_work.approved',
  'permit_to_work.completed',
  'lone_worker.alert',
] as const;

export type WebhookEvent = typeof WEBHOOK_EVENTS[number];
```

---

## 3. Dispatcher — `server/utils/webhookDispatcher.ts`

```typescript
import crypto from 'crypto';

export interface WebhookPayload {
  event: WebhookEvent;
  timestamp: string;       // ISO 8601
  customerId: string;
  data: Record<string, unknown>;
}

export async function dispatchWebhook(
  pool: Pool,
  schemaName: string,
  customerId: string,
  event: WebhookEvent,
  data: Record<string, unknown>
): Promise<void> {
  // 1. Get active endpoints subscribed to this event
  const result = await pool.query(
    `SELECT * FROM "${schemaName}".webhook_endpoints
     WHERE active = true AND $1 = ANY(events)`,
    [event]
  );
  if (result.rows.length === 0) return;

  const payload: WebhookPayload = {
    event,
    timestamp: new Date().toISOString(),
    customerId,
    data,
  };
  const body = JSON.stringify(payload);

  // 2. Fire to each endpoint — do not await all before returning (non-blocking)
  result.rows.forEach(endpoint => {
    deliverWebhook(pool, schemaName, endpoint, body, payload).catch(err =>
      logger.warn(`Webhook delivery error: ${err.message}`)
    );
  });
}

async function deliverWebhook(
  pool: Pool,
  schemaName: string,
  endpoint: any,
  body: string,
  payload: WebhookPayload
): Promise<void> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-TPR-Event': payload.event,
    'X-TPR-Timestamp': payload.timestamp,
  };

  // HMAC signature if secret configured
  if (endpoint.secret) {
    const sig = crypto.createHmac('sha256', endpoint.secret).update(body).digest('hex');
    headers['X-TPR-Signature'] = `sha256=${sig}`;
  }

  let success = false;
  let responseStatus: number | null = null;
  let responseBody: string | null = null;
  let error: string | null = null;

  try {
    const response = await fetch(endpoint.url, {
      method: 'POST',
      headers,
      body,
      signal: AbortSignal.timeout(10000),    // 10s timeout
    });
    responseStatus = response.status;
    responseBody = await response.text().catch(() => null);
    success = response.ok;
  } catch (err: any) {
    error = err.message;
  }

  // Log delivery
  await pool.query(
    `INSERT INTO "${schemaName}".webhook_delivery_log
     (endpoint_id, event, payload, response_status, response_body, success, error)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [endpoint.id, payload.event, JSON.stringify(payload), responseStatus, responseBody, success, error]
  );

  // Update consecutive_failures and last_triggered_at
  if (success) {
    await pool.query(
      `UPDATE "${schemaName}".webhook_endpoints
       SET consecutive_failures = 0, last_triggered_at = NOW()
       WHERE id = $1`,
      [endpoint.id]
    );
  } else {
    await pool.query(
      `UPDATE "${schemaName}".webhook_endpoints
       SET consecutive_failures = consecutive_failures + 1, last_triggered_at = NOW()
       WHERE id = $1`,
      [endpoint.id]
    );
    // Auto-disable after 10 consecutive failures
    await pool.query(
      `UPDATE "${schemaName}".webhook_endpoints
       SET active = false
       WHERE id = $1 AND consecutive_failures >= 10`,
      [endpoint.id]
    );
  }
}
```

---

## 4. Example Dispatch Calls in Trigger Files

### `server/routes/visitors.ts` — visitor check-in:
```typescript
await dispatchWebhook(pool, schemaName, customerId, 'visitor.arrived', {
  visitorId: newVisitor.id,
  firstName: newVisitor.firstName,
  lastName: newVisitor.lastName,
  email: newVisitor.email,
  host: hostName,
  visitReason: body.visitReason,
  checkedInAt: new Date().toISOString(),
});
```

### `server/routes/emergency.ts` — evacuation activated:
```typescript
await dispatchWebhook(pool, schemaName, customerId, 'evacuation.started', {
  activatedBy: req.user?.name,
  activatedAt: new Date().toISOString(),
  onSiteCount,
  isDrill: body.isDrill || false,
});
```

Apply the same pattern to all other trigger points listed above.

---

## 5. Admin Routes — `server/routes/webhooks.ts`

Register on `/api/webhooks`. Admin auth required.

- `GET /api/webhooks` — list all webhook endpoints with delivery stats
- `POST /api/webhooks` — create endpoint (name, url, secret?, events[])
- `PUT /api/webhooks/:id` — update endpoint config
- `DELETE /api/webhooks/:id` — soft delete (active = false)
- `POST /api/webhooks/:id/test` — send a test `ping` event to the endpoint. Payload: `{ event: 'ping', timestamp, customerId, data: { message: 'Test webhook from TPR' } }`
- `GET /api/webhooks/:id/logs` — last 50 delivery log entries for this endpoint (id, event, success, responseStatus, deliveredAt)
- `POST /api/webhooks/:id/enable` — re-enable an auto-disabled endpoint and reset consecutive_failures to 0

---

## 6. Settings Page — `client/src/pages/settings/WebhookSettings.tsx`

Page at `/settings/webhooks`.

**Shows:**
- List of configured webhooks with name, URL (masked after first 30 chars), subscribed events, active/inactive status, last triggered timestamp.
- Status badge: Active / Disabled (auto-disabled if too many failures).
- "Add webhook" form: name, URL, optional signing secret, multi-select of event types to subscribe.
- Delivery log per webhook: last 10 attempts with event name, timestamp, HTTP status, success/fail badge.
- "Send test" button — calls the test endpoint and shows inline success/fail.
- "Re-enable" button on auto-disabled webhooks.

**Zapier setup hint (shown as help text):**
"To connect TPR to Zapier, create a Zap using the 'Webhooks by Zapier' trigger, select 'Catch Hook', copy the webhook URL it gives you, and paste it here."

---

## 7. Feature Flag

```typescript
featureWebhooks: boolean('feature_webhooks').default(false),
```

```typescript
await pool.query(`ALTER TABLE "${schemaName}".company_settings ADD COLUMN IF NOT EXISTS feature_webhooks BOOLEAN DEFAULT false`);
```

Set `true` for TPR Pro and above.

---

## Done When

- [ ] Both tables created with migrations and Drizzle schema
- [ ] `dispatchWebhook()` fires to subscribed endpoints asynchronously — primary operations are never blocked by webhook delivery
- [ ] HMAC-SHA256 signature added to request header when secret is configured
- [ ] 10-second request timeout enforced
- [ ] Delivery logged (success and failure) in `webhook_delivery_log`
- [ ] Auto-disable after 10 consecutive failures
- [ ] Test endpoint sends a `ping` payload and returns HTTP status received from target
- [ ] Settings page: create, edit, disable, re-enable endpoints; view delivery logs
- [ ] Event subscriptions work — endpoint only receives events it is subscribed to
- [ ] `featureWebhooks` flag defaults to `false`
- [ ] `npm run check` passes with no new errors

---

*Prompt written: June 2026*
