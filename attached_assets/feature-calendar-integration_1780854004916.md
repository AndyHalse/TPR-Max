# Replit Prompt — Calendar Integration (Outlook / Google Calendar → Visitor Pre-Registration)

## What This Does

Connects TPR to Outlook (Microsoft 365) or Google Calendar. When a meeting is created with external attendees, TPR automatically creates visitor pre-registrations for those attendees — without the admin doing anything.

This eliminates the most common source of friction in visitor management: the gap between "we've invited someone to a meeting" and "we've told reception to expect them." For SMEs without a dedicated receptionist, this gap often means visitors arriving unannounced to a locked door.

Feature flag: `featureCalendarIntegration` (default: `false` — TPR Pro and above).

---

## How It Works (Overview)

The integration uses a **polling approach** rather than webhooks for simplicity and reliability:

1. Admin connects their Microsoft 365 or Google Calendar account via OAuth.
2. TPR stores the OAuth tokens securely.
3. A scheduled cron job (every 15 minutes) fetches upcoming calendar events.
4. For each event with external attendees (not @your-domain emails), TPR checks whether a pre-registration already exists.
5. If not, TPR creates a visitor pre-registration and optionally sends the visitor their invite email.
6. The admin is notified of newly created pre-registrations.

---

## Files to Create

- `server/routes/calendarIntegration.ts`
- `server/services/calendarSync.ts` — polling service + pre-reg creation logic
- `server/services/microsoftGraphService.ts` — Microsoft Graph API calls
- `server/services/googleCalendarService.ts` — Google Calendar API calls
- `client/src/pages/settings/CalendarIntegrationSettings.tsx`

## Files to Change

- `server/isolatedSchema.ts` — add `calendarConnections` and `calendarSyncedEvents` tables
- `server/customerDatabase.ts` — migrations
- `server/cron.ts` (or wherever scheduled jobs are registered) — add 15-minute sync cron
- `client/src/pages/Settings.tsx` — nav link
- `client/src/App.tsx` — route + OAuth callback routes

---

## 1. Database — `server/isolatedSchema.ts`

```typescript
export const calendarConnections = pgTable('calendar_connections', {
  id: serial('id').primaryKey(),
  provider: text('provider').notNull(),           // 'microsoft' | 'google'
  connectedBy: text('connected_by').notNull(),    // TPR user who connected it
  accessToken: text('access_token').notNull(),    // encrypted at rest
  refreshToken: text('refresh_token').notNull(),  // encrypted at rest
  tokenExpiry: timestamp('token_expiry'),
  calendarId: text('calendar_id'),                // specific calendar to sync (optional — default: primary)
  active: boolean('active').default(true),
  lastSyncedAt: timestamp('last_synced_at'),
  syncWindowDays: integer('sync_window_days').default(7),   // how far ahead to look
  autoCreatePreReg: boolean('auto_create_pre_reg').default(true),
  notifyOnCreate: boolean('notify_on_create').default(true),
  domainFilter: text('domain_filter'),            // only create pre-regs for specific domain (optional)
  createdAt: timestamp('created_at').defaultNow(),
});

export const calendarSyncedEvents = pgTable('calendar_synced_events', {
  id: serial('id').primaryKey(),
  connectionId: integer('connection_id').notNull(),
  externalEventId: text('external_event_id').notNull(),     // the event ID from Google/Microsoft
  eventTitle: text('event_title'),
  eventStart: timestamp('event_start'),
  attendeeEmail: text('attendee_email').notNull(),
  visitorPreRegId: integer('visitor_pre_reg_id'),           // FK to visitor pre-registration if created
  status: text('status').default('synced'),                 // 'synced' | 'pre_reg_created' | 'skipped'
  syncedAt: timestamp('synced_at').defaultNow(),
});
```

Migrations:
```typescript
await pool.query(`
  CREATE TABLE IF NOT EXISTS "${schemaName}".calendar_connections (
    id SERIAL PRIMARY KEY,
    provider TEXT NOT NULL,
    connected_by TEXT NOT NULL,
    access_token TEXT NOT NULL,
    refresh_token TEXT NOT NULL,
    token_expiry TIMESTAMPTZ,
    calendar_id TEXT,
    active BOOLEAN DEFAULT true,
    last_synced_at TIMESTAMPTZ,
    sync_window_days INTEGER DEFAULT 7,
    auto_create_pre_reg BOOLEAN DEFAULT true,
    notify_on_create BOOLEAN DEFAULT true,
    domain_filter TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )
`);
await pool.query(`
  CREATE TABLE IF NOT EXISTS "${schemaName}".calendar_synced_events (
    id SERIAL PRIMARY KEY,
    connection_id INTEGER NOT NULL,
    external_event_id TEXT NOT NULL,
    event_title TEXT,
    event_start TIMESTAMPTZ,
    attendee_email TEXT NOT NULL,
    visitor_pre_reg_id INTEGER,
    status TEXT DEFAULT 'synced',
    synced_at TIMESTAMPTZ DEFAULT NOW()
  )
`);
```

Tokens must be encrypted at rest. Use the existing `server/utils/encryption.ts` encrypt/decrypt functions before storing and after reading.

---

## 2. OAuth Flow — Microsoft 365

### Environment variables required:
```
MICROSOFT_OAUTH_CLIENT_ID=
MICROSOFT_OAUTH_CLIENT_SECRET=
MICROSOFT_OAUTH_REDIRECT_URI=https://[your-domain]/api/calendar/microsoft/callback
```

### Scopes required:
`Calendars.Read` `User.Read` `offline_access`

### Routes:

`GET /api/calendar/microsoft/connect` (authenticated) — redirects to Microsoft OAuth consent screen.

`GET /api/calendar/microsoft/callback` — OAuth callback. Exchanges code for tokens. Stores encrypted tokens in `calendarConnections`. Redirects to `/settings/calendar-integration?connected=true`.

Token refresh: before each Graph API call, check `token_expiry`. If expired or within 5 minutes, use `refresh_token` to get a new `access_token` and update the stored record.

---

## 3. OAuth Flow — Google Calendar

### Environment variables required:
```
GOOGLE_OAUTH_CLIENT_ID=
GOOGLE_OAUTH_CLIENT_SECRET=
GOOGLE_OAUTH_REDIRECT_URI=https://[your-domain]/api/calendar/google/callback
```

### Scopes required:
`https://www.googleapis.com/auth/calendar.events.readonly`

`GET /api/calendar/google/connect` — redirects to Google consent screen.

`GET /api/calendar/google/callback` — OAuth callback. Exchanges code for tokens. Stores encrypted tokens.

Token refresh follows the same pattern as Microsoft.

---

## 4. Calendar Sync Service — `server/services/calendarSync.ts`

This runs on the cron every 15 minutes. For each active `calendarConnections` record:

```typescript
export async function syncCalendarForCustomer(
  pool: Pool,
  schemaName: string,
  connection: CalendarConnection
): Promise<void> {
  // 1. Refresh token if needed
  const tokens = await refreshIfNeeded(connection);

  // 2. Fetch events for the next N days
  const events = connection.provider === 'microsoft'
    ? await fetchMicrosoftEvents(tokens, connection.syncWindowDays)
    : await fetchGoogleEvents(tokens, connection.syncWindowDays, connection.calendarId);

  for (const event of events) {
    for (const attendee of event.attendees) {
      // 3. Skip internal attendees (same domain as the connected account)
      if (isInternalEmail(attendee.email, connection)) continue;

      // 4. Apply domain filter if configured
      if (connection.domainFilter && !attendee.email.endsWith(`@${connection.domainFilter}`)) continue;

      // 5. Check if this attendee for this event has already been synced
      const alreadySynced = await pool.query(
        `SELECT id FROM "${schemaName}".calendar_synced_events
         WHERE connection_id = $1 AND external_event_id = $2 AND attendee_email = $3`,
        [connection.id, event.id, attendee.email]
      );
      if (alreadySynced.rows.length > 0) continue;

      // 6. Create visitor pre-registration
      let preRegId: number | null = null;
      if (connection.autoCreatePreReg) {
        preRegId = await createVisitorPreReg(pool, schemaName, {
          firstName: attendee.displayName?.split(' ')[0] || '',
          lastName: attendee.displayName?.split(' ').slice(1).join(' ') || '',
          email: attendee.email,
          expectedArrival: event.start,
          hostNote: `Auto-created from calendar: ${event.subject}`,
          source: 'calendar_sync',
        });
      }

      // 7. Log the sync
      await pool.query(
        `INSERT INTO "${schemaName}".calendar_synced_events
         (connection_id, external_event_id, event_title, event_start, attendee_email, visitor_pre_reg_id, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          connection.id,
          event.id,
          event.subject,
          event.start,
          attendee.email,
          preRegId,
          preRegId ? 'pre_reg_created' : 'synced',
        ]
      );
    }
  }

  // 8. Update last_synced_at
  await pool.query(
    `UPDATE "${schemaName}".calendar_connections SET last_synced_at = NOW() WHERE id = $1`,
    [connection.id]
  );
}
```

---

## 5. Microsoft Graph API — `server/services/microsoftGraphService.ts`

```typescript
export async function fetchMicrosoftEvents(tokens: OAuthTokens, daysAhead: number) {
  const now = new Date().toISOString();
  const end = new Date(Date.now() + daysAhead * 86400000).toISOString();
  const response = await fetch(
    `https://graph.microsoft.com/v1.0/me/calendarView?startDateTime=${now}&endDateTime=${end}&$select=id,subject,start,attendees&$top=50`,
    { headers: { Authorization: `Bearer ${tokens.accessToken}` } }
  );
  const data = await response.json();
  return (data.value || []).map(event => ({
    id: event.id,
    subject: event.subject,
    start: new Date(event.start.dateTime || event.start.date),
    attendees: (event.attendees || [])
      .filter(a => a.type !== 'required' || true)   // include all attendees
      .map(a => ({ email: a.emailAddress.address, displayName: a.emailAddress.name })),
  }));
}
```

---

## 6. Google Calendar API — `server/services/googleCalendarService.ts`

```typescript
export async function fetchGoogleEvents(tokens: OAuthTokens, daysAhead: number, calendarId = 'primary') {
  const now = new Date().toISOString();
  const end = new Date(Date.now() + daysAhead * 86400000).toISOString();
  const response = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?timeMin=${now}&timeMax=${end}&singleEvents=true&maxResults=50&fields=items(id,summary,start,attendees)`,
    { headers: { Authorization: `Bearer ${tokens.accessToken}` } }
  );
  const data = await response.json();
  return (data.items || []).map(event => ({
    id: event.id,
    subject: event.summary,
    start: new Date(event.start.dateTime || event.start.date),
    attendees: (event.attendees || [])
      .filter(a => !a.self)
      .map(a => ({ email: a.email, displayName: a.displayName })),
  }));
}
```

---

## 7. Settings Page — `client/src/pages/settings/CalendarIntegrationSettings.tsx`

Page at `/settings/calendar-integration`.

**Shows:**
- "Connect Microsoft 365 Calendar" button (opens OAuth flow).
- "Connect Google Calendar" button (opens OAuth flow).
- For each connected calendar: provider, connected by, last synced timestamp, sync window (7/14/30 days), active toggle.
- Settings per connection: auto-create pre-registrations (on/off), notify admin on creation (on/off), domain filter field.
- "Sync now" button (triggers immediate sync for that connection).
- Recent sync activity: last 10 pre-registrations auto-created from calendar, with event name, attendee email, and timestamp.
- "Disconnect" button (soft delete — sets active = false, clears tokens).

---

## 8. Cron Job

In `server/cron.ts`, add:

```typescript
// Calendar sync — every 15 minutes
cron.schedule('*/15 * * * *', async () => {
  const customers = await customerDbService.getAllCustomers();
  for (const customer of customers) {
    const pool = await customerDbService.getCustomerPool(customer.id);
    const connections = await pool.query(
      `SELECT * FROM "${customer.schemaName}".calendar_connections WHERE active = true`
    );
    for (const conn of connections.rows) {
      await syncCalendarForCustomer(pool, customer.schemaName, conn).catch(err =>
        logger.warn(`Calendar sync failed for customer ${customer.id}: ${err.message}`)
      );
    }
  }
}, { timezone: 'Europe/London' });
```

Failures on one customer must not stop the sync for others. All errors are caught and logged per-customer.

---

## 9. Feature Flag

```typescript
featureCalendarIntegration: boolean('feature_calendar_integration').default(false),
```

Migration:
```typescript
await pool.query(`ALTER TABLE "${schemaName}".company_settings ADD COLUMN IF NOT EXISTS feature_calendar_integration BOOLEAN DEFAULT false`);
```

Set `true` for TPR Pro and above.

---

## Done When

- [ ] Both tables created with migrations
- [ ] Tokens stored encrypted at rest (using existing encryption.ts)
- [ ] Microsoft OAuth connect/callback flow works end-to-end
- [ ] Google OAuth connect/callback flow works end-to-end
- [ ] Token refresh works for both providers
- [ ] Cron runs every 15 minutes and calls sync for all active connections
- [ ] Internal attendees are skipped (same domain as the connected account)
- [ ] Previously synced event+attendee combinations are not duplicated
- [ ] Visitor pre-registration created with correct first name, last name, email, expected arrival
- [ ] Sync history visible in settings page
- [ ] "Sync now" manual trigger works from settings
- [ ] Disconnect clears tokens and sets active = false
- [ ] Cron failures on one customer do not break other customers
- [ ] Environment variables documented in `.env.example`
- [ ] `featureCalendarIntegration` flag defaults to `false`
- [ ] `npm run check` passes with no new errors

---

*Prompt written: June 2026*
