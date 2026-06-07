# Replit Prompt — Microsoft Teams Notifications

## What This Does

Allows customers to connect TPR to a Microsoft Teams channel via an Incoming Webhook URL. When key events happen in TPR, a formatted card is posted to the Teams channel in real time.

This is a high-value, low-effort integration. Most UK SMEs use Microsoft 365 / Teams as their primary communications platform. Getting evacuation alerts, visitor arrivals, and compliance warnings into Teams means staff see them immediately without logging into TPR.

Feature flag: `featureTeamsIntegration` (default: `false` — TPR Pro and above).

---

## How Teams Incoming Webhooks Work

Teams Incoming Webhooks accept a POST request to a URL the customer generates in their Teams channel settings. The payload is an **Adaptive Card** (JSON). TPR posts to that URL. No OAuth needed — the URL is the secret.

Microsoft Adaptive Cards docs: https://adaptivecards.io/

---

## Files to Create

- `server/routes/teamsIntegration.ts`
- `server/utils/teamsNotifier.ts`
- `client/src/pages/settings/TeamsIntegrationSettings.tsx`

## Files to Change

- `server/isolatedSchema.ts` — add `teamsWebhooks` table
- `server/customerDatabase.ts` — migration
- `server/routes/visitors.ts` — trigger on visitor arrival
- `server/routes/emergency.ts` — trigger on evacuation start/end
- `server/routes/hsIncidents.ts` — trigger on RIDDOR-flagged incident
- `server/routes/complianceDashboard.ts` — trigger on compliance score drop to red
- `client/src/pages/Settings.tsx` — nav link
- `client/src/App.tsx` — route

---

## 1. Database — `server/isolatedSchema.ts`

```typescript
export const teamsWebhooks = pgTable('teams_webhooks', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),                  // e.g. "Reception alerts"
  webhookUrl: text('webhook_url').notNull(),      // the Teams Incoming Webhook URL
  active: boolean('active').default(true),
  notifyVisitorArrival: boolean('notify_visitor_arrival').default(true),
  notifyEvacuation: boolean('notify_evacuation').default(true),
  notifyRiddor: boolean('notify_riddor').default(true),
  notifyComplianceRed: boolean('notify_compliance_red').default(false),
  notifyDocumentExpiry: boolean('notify_document_expiry').default(false),
  createdAt: timestamp('created_at').defaultNow(),
});
```

Migration in `server/customerDatabase.ts`:
```typescript
await pool.query(`
  CREATE TABLE IF NOT EXISTS "${schemaName}".teams_webhooks (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    webhook_url TEXT NOT NULL,
    active BOOLEAN DEFAULT true,
    notify_visitor_arrival BOOLEAN DEFAULT true,
    notify_evacuation BOOLEAN DEFAULT true,
    notify_riddor BOOLEAN DEFAULT true,
    notify_compliance_red BOOLEAN DEFAULT false,
    notify_document_expiry BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )
`);
```

---

## 2. Notifier Utility — `server/utils/teamsNotifier.ts`

This is the core send function. All other routes call this — they never post to Teams directly.

```typescript
export type TeamsEventType =
  | 'visitor_arrival'
  | 'evacuation_started'
  | 'evacuation_ended'
  | 'riddor_incident'
  | 'compliance_red'
  | 'document_expiry';

export interface TeamsNotificationPayload {
  eventType: TeamsEventType;
  title: string;
  summary: string;          // 1-2 line plain text summary
  facts?: { name: string; value: string }[];   // key/value pairs shown in card
  accentColour?: string;    // hex colour for card top border — default '#0078D4' (Teams blue)
  urgency?: 'normal' | 'high';
}

export async function sendTeamsNotification(
  pool: Pool,
  schemaName: string,
  eventType: TeamsEventType,
  payload: TeamsNotificationPayload
): Promise<void> {
  // 1. Get all active webhooks subscribed to this event type
  const columnMap: Record<TeamsEventType, string> = {
    visitor_arrival: 'notify_visitor_arrival',
    evacuation_started: 'notify_evacuation',
    evacuation_ended: 'notify_evacuation',
    riddor_incident: 'notify_riddor',
    compliance_red: 'notify_compliance_red',
    document_expiry: 'notify_document_expiry',
  };
  const col = columnMap[eventType];
  const result = await pool.query(
    `SELECT webhook_url FROM "${schemaName}".teams_webhooks WHERE active = true AND ${col} = true`
  );
  if (result.rows.length === 0) return;

  // 2. Build Adaptive Card payload
  const card = buildAdaptiveCard(payload);

  // 3. POST to each webhook URL — fire and forget, log failures
  await Promise.allSettled(
    result.rows.map(row =>
      fetch(row.webhook_url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(card),
      }).catch(err => logger.warn(`Teams webhook failed: ${err.message}`))
    )
  );
}

function buildAdaptiveCard(payload: TeamsNotificationPayload): object {
  return {
    type: 'message',
    attachments: [{
      contentType: 'application/vnd.microsoft.card.adaptive',
      content: {
        $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
        type: 'AdaptiveCard',
        version: '1.4',
        body: [
          {
            type: 'TextBlock',
            text: payload.title,
            weight: 'Bolder',
            size: 'Medium',
            color: payload.urgency === 'high' ? 'Attention' : 'Default',
          },
          {
            type: 'TextBlock',
            text: payload.summary,
            wrap: true,
          },
          ...(payload.facts && payload.facts.length > 0 ? [{
            type: 'FactSet',
            facts: payload.facts,
          }] : []),
          {
            type: 'TextBlock',
            text: `TPR · ${new Date().toLocaleString('en-GB', { timeZone: 'Europe/London' })}`,
            size: 'Small',
            color: 'Light',
          },
        ],
      },
    }],
  };
}
```

---

## 3. Trigger Points

### Visitor arrival — `server/routes/visitors.ts`

After a visitor is checked in successfully, add:

```typescript
await sendTeamsNotification(pool, schemaName, 'visitor_arrival', {
  eventType: 'visitor_arrival',
  title: '👤 Visitor arrived',
  summary: `${visitorName} has signed in at ${siteName}.`,
  facts: [
    { name: 'Visitor', value: visitorName },
    { name: 'Host', value: hostName || 'Not specified' },
    { name: 'Time', value: new Date().toLocaleTimeString('en-GB') },
    { name: 'Purpose', value: visitReason || 'Not specified' },
  ],
});
```

### Evacuation started — `server/routes/emergency.ts`

When evacuation is activated (the POST /api/emergency/activate endpoint), add:

```typescript
await sendTeamsNotification(pool, schemaName, 'evacuation_started', {
  eventType: 'evacuation_started',
  title: '🚨 EVACUATION IN PROGRESS',
  summary: `An evacuation has been activated at ${siteName}. Check TPR for the live roll-call.`,
  facts: [
    { name: 'Site', value: siteName },
    { name: 'Activated by', value: req.user?.name || 'Unknown' },
    { name: 'Time', value: new Date().toLocaleTimeString('en-GB') },
    { name: 'Personnel on site', value: String(onSiteCount) },
  ],
  urgency: 'high',
  accentColour: '#D32F2F',
});
```

When evacuation is ended (POST /api/emergency/end):

```typescript
await sendTeamsNotification(pool, schemaName, 'evacuation_ended', {
  eventType: 'evacuation_ended',
  title: '✅ Evacuation complete',
  summary: `The evacuation at ${siteName} has been marked as complete.`,
  facts: [
    { name: 'Site', value: siteName },
    { name: 'Duration', value: durationString },
    { name: 'Accounted for', value: `${accountedCount} of ${totalCount}` },
  ],
});
```

### RIDDOR incident — `server/routes/hsIncidents.ts`

When a new incident is logged with `riddorCategory` that is NOT `'not_riddor_reportable'`:

```typescript
await sendTeamsNotification(pool, schemaName, 'riddor_incident', {
  eventType: 'riddor_incident',
  title: '⚠️ RIDDOR reportable incident logged',
  summary: `A RIDDOR-reportable incident has been recorded. Report to HSE by the deadline.`,
  facts: [
    { name: 'Incident', value: body.title },
    { name: 'Category', value: body.riddorCategory },
    { name: 'Reporting deadline', value: deadlineString },
    { name: 'Logged by', value: req.user?.name },
  ],
  urgency: 'high',
  accentColour: '#F57C00',
});
```

---

## 4. Backend CRUD Routes — `server/routes/teamsIntegration.ts`

Register on `/api/teams-integration`. Admin auth required on all routes.

- `GET /api/teams-integration` — list all webhooks
- `POST /api/teams-integration` — create webhook (name, webhookUrl, notification toggles)
- `PUT /api/teams-integration/:id` — update webhook config
- `DELETE /api/teams-integration/:id` — soft delete (set active = false)
- `POST /api/teams-integration/:id/test` — send a test card to the webhook to confirm it works. Sends a simple "This is a test notification from TPR" card.

---

## 5. Settings Page — `client/src/pages/settings/TeamsIntegrationSettings.tsx`

Page at `/settings/teams-integration`.

**Shows:**
- Explanation of how to set up an Incoming Webhook in Teams (brief, linked to Microsoft docs).
- List of configured webhooks with active/inactive toggle.
- "Add webhook" form: webhook name, paste URL, checkboxes for which events to subscribe to.
- "Send test" button per webhook to verify the connection works.
- Edit and delete controls.

**How to get the Teams webhook URL (shown as help text):**
In your Teams channel → Connectors (or Manage Channel → Connectors) → Incoming Webhook → configure → copy the URL.

---

## 6. Feature Flag

In `server/isolatedSchema.ts`:
```typescript
featureTeamsIntegration: boolean('feature_teams_integration').default(false),
```

Migration:
```typescript
await pool.query(`ALTER TABLE "${schemaName}".company_settings ADD COLUMN IF NOT EXISTS feature_teams_integration BOOLEAN DEFAULT false`);
```

Set `true` for TPR Pro and above in `platformAdmin.ts` provisioning.

---

## Done When

- [ ] `teams_webhooks` table created with all columns
- [ ] `sendTeamsNotification()` utility posts correctly formatted Adaptive Card to webhook URL
- [ ] Webhook URL subscription filtering works (only posts to webhooks that subscribe to that event type)
- [ ] Visitor arrival triggers Teams card with correct details
- [ ] Evacuation start triggers high-urgency red Teams card
- [ ] Evacuation end triggers completion Teams card
- [ ] RIDDOR incident triggers Teams card with deadline
- [ ] Test endpoint posts a test card and returns success/failure based on HTTP response from Teams
- [ ] Settings page lists, creates, edits, and deactivates webhooks
- [ ] Failed webhook posts are caught and logged — they do NOT break the primary operation (sign-in, evacuation, etc.)
- [ ] `featureTeamsIntegration` flag defaults to `false`
- [ ] `npm run check` passes with no new errors

---

*Prompt written: June 2026*
