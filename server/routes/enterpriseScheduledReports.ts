/**
 * Enterprise Scheduled Reports API — Phase 5b
 * =============================================
 * GET    /api/enterprise/scheduled-reports              — list schedules
 * POST   /api/enterprise/scheduled-reports              — create schedule
 * PATCH  /api/enterprise/scheduled-reports/:id          — update (toggle, recipients, etc.)
 * DELETE /api/enterprise/scheduled-reports/:id          — delete
 * POST   /api/enterprise/scheduled-reports/seed-defaults — seed 4 built-in defaults
 */

import type { Application } from 'express';
import { eq, desc } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { requireAuth } from '../auth';
import { requireEnterpriseRole } from '../enterpriseRoles';
import { customerDbService } from '../customerDatabase';
import * as iso from '../isolatedSchema';
import { logger } from '../utils/logger';

// ─── Role helper ─────────────────────────────────────────────────────────────

function callerIsAdmin(req: any): boolean {
  return req.enterpriseGrants?.roles?.includes('enterprise_admin') ?? false;
}

// ─── Built-in default schedules ───────────────────────────────────────────────

const DEFAULT_SCHEDULES: Omit<
  typeof iso.scheduledReports.$inferInsert,
  'id' | 'createdBy' | 'createdByName' | 'createdAt' | 'updatedAt'
>[] = [
  {
    reportType: 'portfolio_compliance_snapshot',
    reportTitle: 'Weekly Portfolio Snapshot',
    scope: 'estate',
    scopeId: null,
    parameters: {},
    recipients: [],
    frequency: 'weekly',
    runAtHour: 8,
    runAtMinute: 0,
    dayOfWeek: 1, // Monday
    dayOfMonth: null,
    enabled: false,
    isDefault: true,
    lastRunAt: null,
    lastRunStatus: null,
    lastRunError: null,
  },
  {
    reportType: 'portfolio_compliance_snapshot',
    reportTitle: 'Monthly Board Pack',
    scope: 'estate',
    scopeId: null,
    parameters: {},
    recipients: [],
    frequency: 'monthly',
    runAtHour: 8,
    runAtMinute: 0,
    dayOfWeek: null,
    dayOfMonth: 1, // 1st of month
    enabled: false,
    isDefault: true,
    lastRunAt: null,
    lastRunStatus: null,
    lastRunError: null,
  },
  {
    reportType: 'expiry_forecast',
    reportTitle: 'Expiry Forecast — 30 Days',
    scope: 'estate',
    scopeId: null,
    parameters: { period: 30 },
    recipients: [],
    frequency: 'weekly',
    runAtHour: 18,
    runAtMinute: 0,
    dayOfWeek: 5, // Friday
    dayOfMonth: null,
    enabled: false,
    isDefault: true,
    lastRunAt: null,
    lastRunStatus: null,
    lastRunError: null,
  },
  {
    reportType: 'portfolio_compliance_snapshot',
    reportTitle: 'Critical Issues Digest',
    scope: 'estate',
    scopeId: null,
    parameters: {},
    recipients: [],
    frequency: 'daily',
    runAtHour: 7,
    runAtMinute: 30,
    dayOfWeek: null,
    dayOfMonth: null,
    enabled: false,
    isDefault: true,
    lastRunAt: null,
    lastRunStatus: null,
    lastRunError: null,
  },
];

// ─── Routes ───────────────────────────────────────────────────────────────────

export function registerEnterpriseScheduledReportRoutes(app: Application) {

  // ── List schedules ──────────────────────────────────────────────────────────
  app.get('/api/enterprise/scheduled-reports',
    requireAuth,
    requireEnterpriseRole('enterprise_admin', 'area_manager'),
    async (req: any, res) => {
      try {
        const customerId: string = req.user.customerId;
        const db = await customerDbService.getCustomerDatabase(customerId);

        const rows = await db
          .select()
          .from(iso.scheduledReports)
          .orderBy(desc(iso.scheduledReports.createdAt));

        res.json(rows);
      } catch (err: any) {
        logger.error('[ScheduledReports GET] Error:', err);
        res.status(500).json({ error: 'Failed to list scheduled reports' });
      }
    },
  );

  // ── Seed built-in defaults ─────────────────────────────────────────────────
  app.post('/api/enterprise/scheduled-reports/seed-defaults',
    requireAuth,
    requireEnterpriseRole('enterprise_admin'),
    async (req: any, res) => {
      try {
        const customerId: string = req.user.customerId;
        const db = await customerDbService.getCustomerDatabase(customerId);

        // Only insert defaults that don't already exist (match by title + isDefault)
        const existing = await db
          .select({ reportTitle: iso.scheduledReports.reportTitle })
          .from(iso.scheduledReports)
          .where(eq(iso.scheduledReports.isDefault, true));

        const existingTitles = new Set(existing.map(r => r.reportTitle));
        const toInsert = DEFAULT_SCHEDULES.filter(d => !existingTitles.has(d.reportTitle));

        if (toInsert.length === 0) {
          return res.json({ message: 'Defaults already seeded', inserted: 0 });
        }

        const now = new Date();
        await db.insert(iso.scheduledReports).values(
          toInsert.map(d => ({
            ...d,
            id: randomUUID(),
            createdBy: req.user.id,
            createdByName: req.user.name ?? req.user.email,
            createdAt: now,
            updatedAt: now,
          })),
        );

        logger.info(`[ScheduledReports] Seeded ${toInsert.length} default schedules for ${customerId}`);
        res.json({ message: 'Defaults seeded', inserted: toInsert.length });
      } catch (err: any) {
        logger.error('[ScheduledReports seed-defaults] Error:', err);
        res.status(500).json({ error: 'Failed to seed defaults' });
      }
    },
  );

  // ── Create schedule ─────────────────────────────────────────────────────────
  app.post('/api/enterprise/scheduled-reports',
    requireAuth,
    requireEnterpriseRole('enterprise_admin'),
    async (req: any, res) => {
      try {
        const customerId: string = req.user.customerId;
        const {
          reportType, reportTitle, scope = 'estate', scopeId = null,
          parameters = {}, recipients = [], frequency,
          runAtHour = 8, runAtMinute = 0,
          dayOfWeek = null, dayOfMonth = null,
          enabled = true,
        } = req.body;

        if (!reportType || !reportTitle || !frequency) {
          return res.status(400).json({ error: 'reportType, reportTitle, and frequency are required' });
        }
        if (!['daily', 'weekly', 'monthly'].includes(frequency)) {
          return res.status(400).json({ error: 'frequency must be daily|weekly|monthly' });
        }
        if (!Array.isArray(recipients)) {
          return res.status(400).json({ error: 'recipients must be an array of email strings' });
        }

        const db = await customerDbService.getCustomerDatabase(customerId);
        const now = new Date();
        const id = randomUUID();

        await db.insert(iso.scheduledReports).values({
          id,
          reportType,
          reportTitle,
          scope,
          scopeId,
          parameters,
          recipients,
          frequency,
          runAtHour,
          runAtMinute,
          dayOfWeek: frequency === 'weekly' ? dayOfWeek : null,
          dayOfMonth: frequency === 'monthly' ? dayOfMonth : null,
          enabled,
          isDefault: false,
          lastRunAt: null,
          lastRunStatus: null,
          lastRunError: null,
          createdBy: req.user.id,
          createdByName: req.user.name ?? req.user.email,
          createdAt: now,
          updatedAt: now,
        });

        logger.info(`[ScheduledReports] Created schedule "${reportTitle}" for ${customerId}`);
        const [row] = await db.select().from(iso.scheduledReports).where(eq(iso.scheduledReports.id, id));
        res.status(201).json(row);
      } catch (err: any) {
        logger.error('[ScheduledReports POST] Error:', err);
        res.status(500).json({ error: 'Failed to create scheduled report' });
      }
    },
  );

  // ── Update schedule ─────────────────────────────────────────────────────────
  app.patch('/api/enterprise/scheduled-reports/:id',
    requireAuth,
    requireEnterpriseRole('enterprise_admin'),
    async (req: any, res) => {
      try {
        const customerId: string = req.user.customerId;
        const { id } = req.params;
        const db = await customerDbService.getCustomerDatabase(customerId);

        const [existing] = await db
          .select()
          .from(iso.scheduledReports)
          .where(eq(iso.scheduledReports.id, id));

        if (!existing) return res.status(404).json({ error: 'Schedule not found' });

        const allowed = [
          'reportTitle', 'recipients', 'frequency', 'runAtHour', 'runAtMinute',
          'dayOfWeek', 'dayOfMonth', 'enabled', 'scope', 'scopeId', 'parameters',
        ];
        const updates: Record<string, any> = { updatedAt: new Date() };
        for (const key of allowed) {
          if (key in req.body) updates[key] = req.body[key];
        }

        // Nullify day fields that don't apply to new frequency
        const freq = updates.frequency ?? existing.frequency;
        if (freq !== 'weekly')  updates.dayOfWeek  = null;
        if (freq !== 'monthly') updates.dayOfMonth = null;

        await db
          .update(iso.scheduledReports)
          .set(updates)
          .where(eq(iso.scheduledReports.id, id));

        const [updated] = await db.select().from(iso.scheduledReports).where(eq(iso.scheduledReports.id, id));
        logger.info(`[ScheduledReports] Updated schedule ${id} for ${customerId}`);
        res.json(updated);
      } catch (err: any) {
        logger.error('[ScheduledReports PATCH] Error:', err);
        res.status(500).json({ error: 'Failed to update scheduled report' });
      }
    },
  );

  // ── Delete schedule ─────────────────────────────────────────────────────────
  app.delete('/api/enterprise/scheduled-reports/:id',
    requireAuth,
    requireEnterpriseRole('enterprise_admin'),
    async (req: any, res) => {
      try {
        const customerId: string = req.user.customerId;
        const { id } = req.params;
        const db = await customerDbService.getCustomerDatabase(customerId);

        const [existing] = await db
          .select({ id: iso.scheduledReports.id })
          .from(iso.scheduledReports)
          .where(eq(iso.scheduledReports.id, id));

        if (!existing) return res.status(404).json({ error: 'Schedule not found' });

        await db.delete(iso.scheduledReports).where(eq(iso.scheduledReports.id, id));
        logger.info(`[ScheduledReports] Deleted schedule ${id} for ${customerId}`);
        res.json({ success: true });
      } catch (err: any) {
        logger.error('[ScheduledReports DELETE] Error:', err);
        res.status(500).json({ error: 'Failed to delete scheduled report' });
      }
    },
  );
}
