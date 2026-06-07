import type { Express } from 'express';
import cron from 'node-cron';
import { requireAuth } from '../auth';
import { customerDbService } from '../customerDatabase';
import { pool } from '../db';
import { logger } from '../utils/logger';
import { encryptToken, decryptToken, syncCalendarForCustomer } from '../services/calendarSync';
import {
  buildMicrosoftAuthUrl,
  exchangeMicrosoftCode,
} from '../services/microsoftGraphService';
import {
  buildGoogleAuthUrl,
  exchangeGoogleCode,
} from '../services/googleCalendarService';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getBaseUrl(req: any): string {
  return process.env.APP_URL ||
    `${req.get('x-forwarded-proto') || req.protocol}://${req.get('x-forwarded-host') || req.get('host')}`;
}

async function ensureCalendarTables(schemaName: string): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS "${schemaName}".calendar_connections (
      id SERIAL PRIMARY KEY,
      provider TEXT NOT NULL,
      connected_by TEXT NOT NULL,
      connected_email TEXT,
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
      visitor_pre_reg_id TEXT,
      status TEXT DEFAULT 'synced',
      synced_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
}

// ─── Routes ───────────────────────────────────────────────────────────────────

export function registerCalendarIntegrationRoutes(app: Express): void {

  // ── GET /api/calendar/connections ─────────────────────────────────────────
  app.get('/api/calendar/connections', requireAuth, async (req, res) => {
    try {
      const schemaName = customerDbService.generateSchemaName(req.customerId!);
      await ensureCalendarTables(schemaName);
      const result = await pool.query(
        `SELECT id, provider, connected_by, connected_email, active, last_synced_at,
                sync_window_days, auto_create_pre_reg, notify_on_create, domain_filter, created_at
         FROM "${schemaName}".calendar_connections WHERE active = true ORDER BY created_at DESC`
      );
      res.json(result.rows);
    } catch (err: any) {
      logger.error('GET /api/calendar/connections:', err);
      res.status(500).json({ error: 'Failed to fetch connections' });
    }
  });

  // ── PUT /api/calendar/connections/:id ─────────────────────────────────────
  app.put('/api/calendar/connections/:id', requireAuth, async (req, res) => {
    try {
      const schemaName = customerDbService.generateSchemaName(req.customerId!);
      const { syncWindowDays, autoCreatePreReg, notifyOnCreate, domainFilter } = req.body;
      const result = await pool.query(
        `UPDATE "${schemaName}".calendar_connections SET
           sync_window_days = COALESCE($1, sync_window_days),
           auto_create_pre_reg = COALESCE($2, auto_create_pre_reg),
           notify_on_create = COALESCE($3, notify_on_create),
           domain_filter = COALESCE($4, domain_filter)
         WHERE id = $5 AND active = true RETURNING id`,
        [syncWindowDays ?? null, autoCreatePreReg ?? null, notifyOnCreate ?? null, domainFilter ?? null, req.params.id]
      );
      if (result.rows.length === 0) return res.status(404).json({ error: 'Connection not found' });
      res.json({ success: true });
    } catch (err: any) {
      logger.error('PUT /api/calendar/connections/:id:', err);
      res.status(500).json({ error: 'Failed to update connection' });
    }
  });

  // ── DELETE /api/calendar/connections/:id (disconnect) ────────────────────
  app.delete('/api/calendar/connections/:id', requireAuth, async (req, res) => {
    try {
      const schemaName = customerDbService.generateSchemaName(req.customerId!);
      await pool.query(
        `UPDATE "${schemaName}".calendar_connections
         SET active = false, access_token = '', refresh_token = ''
         WHERE id = $1`,
        [req.params.id]
      );
      res.json({ success: true });
    } catch (err: any) {
      logger.error('DELETE /api/calendar/connections/:id:', err);
      res.status(500).json({ error: 'Failed to disconnect' });
    }
  });

  // ── POST /api/calendar/connections/:id/sync ───────────────────────────────
  app.post('/api/calendar/connections/:id/sync', requireAuth, async (req, res) => {
    try {
      const schemaName = customerDbService.generateSchemaName(req.customerId!);
      const connResult = await pool.query(
        `SELECT * FROM "${schemaName}".calendar_connections WHERE id = $1 AND active = true`,
        [req.params.id]
      );
      if (connResult.rows.length === 0) return res.status(404).json({ error: 'Connection not found' });

      const result = await syncCalendarForCustomer(pool, schemaName, connResult.rows[0]);
      res.json({ success: true, ...result });
    } catch (err: any) {
      logger.error('POST /api/calendar/connections/:id/sync:', err);
      res.status(500).json({ error: err.message || 'Sync failed' });
    }
  });

  // ── GET /api/calendar/history ─────────────────────────────────────────────
  app.get('/api/calendar/history', requireAuth, async (req, res) => {
    try {
      const schemaName = customerDbService.generateSchemaName(req.customerId!);
      await ensureCalendarTables(schemaName);
      const result = await pool.query(
        `SELECT cse.*, cc.provider, cc.connected_email
         FROM "${schemaName}".calendar_synced_events cse
         JOIN "${schemaName}".calendar_connections cc ON cc.id = cse.connection_id
         WHERE cse.status = 'pre_reg_created'
         ORDER BY cse.synced_at DESC LIMIT 20`
      );
      res.json(result.rows);
    } catch (err: any) {
      logger.error('GET /api/calendar/history:', err);
      res.status(500).json({ error: 'Failed to fetch history' });
    }
  });

  // ── Microsoft OAuth ───────────────────────────────────────────────────────

  app.get('/api/calendar/microsoft/connect', requireAuth, async (req, res) => {
    try {
      if (!process.env.MICROSOFT_OAUTH_CLIENT_ID) {
        return res.status(503).json({ error: 'Microsoft OAuth not configured. Set MICROSOFT_OAUTH_CLIENT_ID.' });
      }
      const state = Buffer.from(JSON.stringify({
        customerId: req.customerId,
        username: req.user?.username,
        csrf: Math.random().toString(36).substring(2),
      })).toString('base64url');
      (req.session as any).calendarOauthState = state;
      const redirectUri = process.env.MICROSOFT_OAUTH_REDIRECT_URI ||
        `${getBaseUrl(req)}/api/calendar/microsoft/callback`;
      const url = buildMicrosoftAuthUrl(redirectUri, state);
      res.redirect(url);
    } catch (err: any) {
      logger.error('Microsoft OAuth connect error:', err);
      res.status(500).send(err.message);
    }
  });

  app.get('/api/calendar/microsoft/callback', async (req, res) => {
    try {
      const { code, state, error: oauthError } = req.query as Record<string, string>;
      if (oauthError) return res.redirect('/settings/calendar-integration?error=oauth_denied');
      if (!code || !state) return res.redirect('/settings/calendar-integration?error=oauth_failed');

      let stateData: any;
      try { stateData = JSON.parse(Buffer.from(state, 'base64url').toString()); } catch {
        return res.redirect('/settings/calendar-integration?error=oauth_failed');
      }

      const { customerId, username } = stateData;
      const schemaName = customerDbService.generateSchemaName(customerId);
      await ensureCalendarTables(schemaName);

      const redirectUri = process.env.MICROSOFT_OAUTH_REDIRECT_URI ||
        `${getBaseUrl(req)}/api/calendar/microsoft/callback`;

      const tokens = await exchangeMicrosoftCode(code, redirectUri);

      await pool.query(
        `INSERT INTO "${schemaName}".calendar_connections
           (provider, connected_by, connected_email, access_token, refresh_token, token_expiry,
            auto_create_pre_reg, sync_window_days, domain_filter)
         VALUES ('microsoft', $1, $2, $3, $4, $5, true, 7, $6)`,
        [
          username || 'admin',
          tokens.userEmail,
          encryptToken(tokens.accessToken),
          encryptToken(tokens.refreshToken),
          tokens.expiresAt,
          tokens.userEmail ? tokens.userEmail.split('@')[1] : null,
        ]
      );

      logger.info(`Microsoft calendar connected for customer ${customerId} by ${username}`);
      res.redirect('/settings/calendar-integration?connected=microsoft');
    } catch (err: any) {
      logger.error('Microsoft OAuth callback error:', err);
      res.redirect(`/settings/calendar-integration?error=${encodeURIComponent(err.message.substring(0, 100))}`);
    }
  });

  // ── Google OAuth ──────────────────────────────────────────────────────────

  app.get('/api/calendar/google/connect', requireAuth, async (req, res) => {
    try {
      if (!process.env.GOOGLE_OAUTH_CLIENT_ID) {
        return res.status(503).json({ error: 'Google OAuth not configured. Set GOOGLE_OAUTH_CLIENT_ID.' });
      }
      const state = Buffer.from(JSON.stringify({
        customerId: req.customerId,
        username: req.user?.username,
        csrf: Math.random().toString(36).substring(2),
      })).toString('base64url');
      (req.session as any).calendarOauthState = state;
      const redirectUri = process.env.GOOGLE_OAUTH_REDIRECT_URI ||
        `${getBaseUrl(req)}/api/calendar/google/callback`;
      const url = buildGoogleAuthUrl(redirectUri, state);
      res.redirect(url);
    } catch (err: any) {
      logger.error('Google OAuth connect error:', err);
      res.status(500).send(err.message);
    }
  });

  app.get('/api/calendar/google/callback', async (req, res) => {
    try {
      const { code, state, error: oauthError } = req.query as Record<string, string>;
      if (oauthError) return res.redirect('/settings/calendar-integration?error=oauth_denied');
      if (!code || !state) return res.redirect('/settings/calendar-integration?error=oauth_failed');

      let stateData: any;
      try { stateData = JSON.parse(Buffer.from(state, 'base64url').toString()); } catch {
        return res.redirect('/settings/calendar-integration?error=oauth_failed');
      }

      const { customerId, username } = stateData;
      const schemaName = customerDbService.generateSchemaName(customerId);
      await ensureCalendarTables(schemaName);

      const redirectUri = process.env.GOOGLE_OAUTH_REDIRECT_URI ||
        `${getBaseUrl(req)}/api/calendar/google/callback`;

      const tokens = await exchangeGoogleCode(code, redirectUri);

      await pool.query(
        `INSERT INTO "${schemaName}".calendar_connections
           (provider, connected_by, connected_email, access_token, refresh_token, token_expiry,
            auto_create_pre_reg, sync_window_days, domain_filter)
         VALUES ('google', $1, $2, $3, $4, $5, true, 7, $6)`,
        [
          username || 'admin',
          tokens.userEmail,
          encryptToken(tokens.accessToken),
          encryptToken(tokens.refreshToken),
          tokens.expiresAt,
          tokens.userEmail ? tokens.userEmail.split('@')[1] : null,
        ]
      );

      logger.info(`Google calendar connected for customer ${customerId} by ${username}`);
      res.redirect('/settings/calendar-integration?connected=google');
    } catch (err: any) {
      logger.error('Google OAuth callback error:', err);
      res.redirect(`/settings/calendar-integration?error=${encodeURIComponent(err.message.substring(0, 100))}`);
    }
  });

  // ── 15-minute calendar sync cron ──────────────────────────────────────────
  cron.schedule('*/15 * * * *', async () => {
    try {
      logger.info('[Calendar Cron] Starting 15-minute sync...');
      const customers = await customerDbService.getAllCustomers();
      let totalCreated = 0;

      for (const customer of customers) {
        try {
          const schemaName = customerDbService.generateSchemaName(customer.id);

          // Check if table exists before querying
          const tableCheck = await pool.query(
            `SELECT 1 FROM information_schema.tables
             WHERE table_schema = $1 AND table_name = 'calendar_connections' LIMIT 1`,
            [schemaName]
          );
          if (tableCheck.rows.length === 0) continue;

          const connections = await pool.query(
            `SELECT * FROM "${schemaName}".calendar_connections WHERE active = true`
          );

          for (const conn of connections.rows) {
            try {
              const result = await syncCalendarForCustomer(pool, schemaName, conn);
              totalCreated += result.created;
              if (result.created > 0) {
                logger.info(`[Calendar Cron] Customer ${customer.id}: ${result.created} pre-regs created`);
              }
            } catch (connErr: any) {
              logger.warn(`[Calendar Cron] Sync failed for connection ${conn.id} (${customer.id}): ${connErr.message}`);
            }
          }
        } catch (custErr: any) {
          logger.warn(`[Calendar Cron] Customer ${customer.id} error: ${custErr.message}`);
        }
      }

      if (totalCreated > 0) logger.info(`[Calendar Cron] Total pre-registrations created: ${totalCreated}`);
    } catch (err: any) {
      logger.error('[Calendar Cron] Fatal error:', err);
    }
  }, { timezone: 'Europe/London' });
}
