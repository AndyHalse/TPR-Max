import type { Express } from 'express';
import { requireAuth } from '../auth';
import { customerDbService } from '../customerDatabase';
import { pool } from '../db';
import { logger } from '../utils/logger';
import { sendTeamsNotification } from '../utils/teamsNotifier';

async function ensureTeamsWebhooksTable(schemaName: string): Promise<void> {
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
}

export function registerTeamsIntegrationRoutes(app: Express): void {

  // ─── GET /api/teams-integration ─────────────────────────────────────────────
  app.get('/api/teams-integration', requireAuth, async (req, res) => {
    try {
      const schemaName = customerDbService.generateSchemaName(req.customerId!);
      await ensureTeamsWebhooksTable(schemaName);
      const result = await pool.query(
        `SELECT * FROM "${schemaName}".teams_webhooks ORDER BY created_at DESC`
      );
      res.json(result.rows);
    } catch (err: any) {
      logger.error('GET /api/teams-integration error:', err);
      res.status(500).json({ error: 'Failed to fetch webhooks' });
    }
  });

  // ─── POST /api/teams-integration ────────────────────────────────────────────
  app.post('/api/teams-integration', requireAuth, async (req, res) => {
    try {
      const schemaName = customerDbService.generateSchemaName(req.customerId!);
      await ensureTeamsWebhooksTable(schemaName);
      const {
        name, webhookUrl, active = true,
        notifyVisitorArrival = true, notifyEvacuation = true, notifyRiddor = true,
        notifyComplianceRed = false, notifyDocumentExpiry = false,
      } = req.body;

      if (!name?.trim() || !webhookUrl?.trim()) {
        return res.status(400).json({ error: 'name and webhookUrl are required' });
      }
      if (!webhookUrl.startsWith('https://')) {
        return res.status(400).json({ error: 'webhookUrl must start with https://' });
      }

      const result = await pool.query(
        `INSERT INTO "${schemaName}".teams_webhooks
           (name, webhook_url, active, notify_visitor_arrival, notify_evacuation,
            notify_riddor, notify_compliance_red, notify_document_expiry)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
        [name.trim(), webhookUrl.trim(), active,
          notifyVisitorArrival, notifyEvacuation, notifyRiddor,
          notifyComplianceRed, notifyDocumentExpiry]
      );
      res.status(201).json(result.rows[0]);
    } catch (err: any) {
      logger.error('POST /api/teams-integration error:', err);
      res.status(500).json({ error: 'Failed to create webhook' });
    }
  });

  // ─── PUT /api/teams-integration/:id ─────────────────────────────────────────
  app.put('/api/teams-integration/:id', requireAuth, async (req, res) => {
    try {
      const schemaName = customerDbService.generateSchemaName(req.customerId!);
      const {
        name, webhookUrl, active,
        notifyVisitorArrival, notifyEvacuation, notifyRiddor,
        notifyComplianceRed, notifyDocumentExpiry,
      } = req.body;

      const result = await pool.query(
        `UPDATE "${schemaName}".teams_webhooks SET
           name = COALESCE($1, name),
           webhook_url = COALESCE($2, webhook_url),
           active = COALESCE($3, active),
           notify_visitor_arrival = COALESCE($4, notify_visitor_arrival),
           notify_evacuation = COALESCE($5, notify_evacuation),
           notify_riddor = COALESCE($6, notify_riddor),
           notify_compliance_red = COALESCE($7, notify_compliance_red),
           notify_document_expiry = COALESCE($8, notify_document_expiry)
         WHERE id = $9 RETURNING *`,
        [name ?? null, webhookUrl ?? null, active ?? null,
          notifyVisitorArrival ?? null, notifyEvacuation ?? null, notifyRiddor ?? null,
          notifyComplianceRed ?? null, notifyDocumentExpiry ?? null,
          req.params.id]
      );
      if (result.rows.length === 0) return res.status(404).json({ error: 'Webhook not found' });
      res.json(result.rows[0]);
    } catch (err: any) {
      logger.error('PUT /api/teams-integration/:id error:', err);
      res.status(500).json({ error: 'Failed to update webhook' });
    }
  });

  // ─── DELETE /api/teams-integration/:id ──────────────────────────────────────
  app.delete('/api/teams-integration/:id', requireAuth, async (req, res) => {
    try {
      const schemaName = customerDbService.generateSchemaName(req.customerId!);
      await pool.query(
        `UPDATE "${schemaName}".teams_webhooks SET active = false WHERE id = $1`,
        [req.params.id]
      );
      res.json({ success: true });
    } catch (err: any) {
      logger.error('DELETE /api/teams-integration/:id error:', err);
      res.status(500).json({ error: 'Failed to delete webhook' });
    }
  });

  // ─── POST /api/teams-integration/:id/test ───────────────────────────────────
  app.post('/api/teams-integration/:id/test', requireAuth, async (req, res) => {
    try {
      const schemaName = customerDbService.generateSchemaName(req.customerId!);
      const result = await pool.query(
        `SELECT webhook_url FROM "${schemaName}".teams_webhooks WHERE id = $1`,
        [req.params.id]
      );
      if (result.rows.length === 0) return res.status(404).json({ error: 'Webhook not found' });

      const { webhook_url } = result.rows[0];
      const testCard = {
        type: 'message',
        attachments: [{
          contentType: 'application/vnd.microsoft.card.adaptive',
          content: {
            $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
            type: 'AdaptiveCard',
            version: '1.4',
            body: [
              { type: 'TextBlock', text: '✅ TPR Test Notification', weight: 'Bolder', size: 'Medium' },
              { type: 'TextBlock', text: 'This is a test notification from TPR Max. Your webhook is configured correctly.', wrap: true },
              { type: 'TextBlock', text: `TPR · ${new Date().toLocaleString('en-GB', { timeZone: 'Europe/London' })}`, size: 'Small', color: 'Light' },
            ],
          },
        }],
      };

      const teamsRes = await fetch(webhook_url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(testCard),
      });

      if (teamsRes.ok) {
        res.json({ success: true, message: 'Test notification sent successfully' });
      } else {
        const text = await teamsRes.text().catch(() => teamsRes.statusText);
        res.status(400).json({ success: false, message: `Teams responded: ${teamsRes.status} — ${text.substring(0, 200)}` });
      }
    } catch (err: any) {
      logger.error('POST /api/teams-integration/:id/test error:', err);
      res.status(500).json({ success: false, message: err.message });
    }
  });
}
