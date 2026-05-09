import type { Express } from 'express';
import cron from 'node-cron';
import { requireAuth } from '../auth';
import { customerDbService } from '../customerDatabase';
import * as isolatedSchema from '../isolatedSchema';
import { EmailService } from '../emailService';
import { eq, desc, sql } from 'drizzle-orm';
import { EXTERNAL_LINKS } from '../utils/externalLinks';
import { logger } from '../utils/logger';

async function ensureFraTable(custDb: any, schemaName: string) {
  await custDb.execute(sql.raw(`
    CREATE TABLE IF NOT EXISTS ${schemaName}.fire_risk_assessments (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
      title TEXT NOT NULL DEFAULT 'Fire Risk Assessment',
      assessor_name TEXT NOT NULL,
      assessor_company TEXT,
      assessment_date TEXT NOT NULL,
      next_review_date TEXT NOT NULL,
      document_url TEXT,
      status TEXT NOT NULL DEFAULT 'current',
      findings_summary TEXT,
      reminder_sent_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `));
}

async function ensureFraActionsTable(custDb: any, schemaName: string) {
  await custDb.execute(sql.raw(`
    CREATE TABLE IF NOT EXISTS ${schemaName}.fra_action_items (
      id SERIAL PRIMARY KEY,
      fra_id TEXT NOT NULL REFERENCES ${schemaName}.fire_risk_assessments(id) ON DELETE CASCADE,
      description TEXT NOT NULL,
      priority TEXT NOT NULL DEFAULT 'medium',
      location TEXT,
      assigned_to TEXT,
      due_date DATE,
      completed_at TIMESTAMPTZ DEFAULT NULL,
      completed_by TEXT DEFAULT NULL,
      completion_notes TEXT DEFAULT NULL,
      reminder_sent_at TIMESTAMPTZ DEFAULT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `));
}

function computeFraStatus(nextReviewDate: string): 'current' | 'review_due' | 'overdue' {
  const review = new Date(nextReviewDate);
  const now = new Date();
  const msUntil = review.getTime() - now.getTime();
  const daysUntil = msUntil / (1000 * 60 * 60 * 24);
  if (daysUntil < 0) return 'overdue';
  if (daysUntil <= 30) return 'review_due';
  return 'current';
}

function priorityOrder(p: string): number {
  return { critical: 1, high: 2, medium: 3, low: 4 }[p] ?? 5;
}

async function getActionSummary(custDb: any, schemaName: string, fraId?: string) {
  const whereClause = fraId
    ? `WHERE fra_id = '${fraId.replace(/'/g, "''")}'`
    : '';
  const rows = await custDb.execute(sql.raw(`
    SELECT
      COUNT(*) FILTER (WHERE priority = 'critical') AS critical,
      COUNT(*) FILTER (WHERE priority = 'high') AS high,
      COUNT(*) FILTER (WHERE priority = 'medium') AS medium,
      COUNT(*) FILTER (WHERE priority = 'low') AS low,
      COUNT(*) AS total,
      COUNT(*) FILTER (WHERE completed_at IS NULL) AS outstanding,
      COUNT(*) FILTER (WHERE completed_at IS NOT NULL) AS completed,
      COUNT(*) FILTER (WHERE completed_at IS NULL AND priority = 'critical') AS critical_outstanding,
      COUNT(*) FILTER (WHERE completed_at IS NULL AND due_date IS NOT NULL AND due_date < CURRENT_DATE) AS overdue_actions
    FROM ${schemaName}.fra_action_items
    ${whereClause}
  `));
  const r = rows.rows[0] as any;
  return {
    critical: parseInt(r.critical) || 0,
    high: parseInt(r.high) || 0,
    medium: parseInt(r.medium) || 0,
    low: parseInt(r.low) || 0,
    total: parseInt(r.total) || 0,
    outstanding: parseInt(r.outstanding) || 0,
    completed: parseInt(r.completed) || 0,
    critical_outstanding: parseInt(r.critical_outstanding) || 0,
    overdue_actions: parseInt(r.overdue_actions) || 0,
  };
}

export function registerFireRiskAssessmentRoutes(app: Express): void {

  // ── GET all FRAs ──────────────────────────────────────────────────────────
  app.get('/api/fire-risk-assessments', requireAuth, async (req, res) => {
    try {
      const custDb = await customerDbService.getCustomerDatabase(req.customerId!);
      const schemaName = customerDbService.generateSchemaName(req.customerId!);
      await ensureFraTable(custDb, schemaName);
      const fras = await custDb.select().from(isolatedSchema.fireRiskAssessments)
        .orderBy(desc(isolatedSchema.fireRiskAssessments.assessmentDate));

      for (const fra of fras) {
        if (fra.status === 'superseded') continue;
        const newStatus = computeFraStatus(fra.nextReviewDate);
        if (newStatus !== fra.status) {
          await custDb.update(isolatedSchema.fireRiskAssessments)
            .set({ status: newStatus, updatedAt: new Date() })
            .where(eq(isolatedSchema.fireRiskAssessments.id, fra.id));
          fra.status = newStatus;
        }
      }

      res.json(fras);
    } catch (err) {
      logger.error('Error fetching FRAs:', err);
      res.status(500).json({ error: 'Failed to fetch fire risk assessments' });
    }
  });

  // ── GET compliance status (enhanced with action items) ────────────────────
  app.get('/api/fire-risk-assessments/status', requireAuth, async (req, res) => {
    try {
      const custDb = await customerDbService.getCustomerDatabase(req.customerId!);
      const schemaName = customerDbService.generateSchemaName(req.customerId!);
      await ensureFraTable(custDb, schemaName);
      await ensureFraActionsTable(custDb, schemaName);

      const fras = await custDb.select().from(isolatedSchema.fireRiskAssessments)
        .orderBy(desc(isolatedSchema.fireRiskAssessments.assessmentDate));

      const current = fras.find(f => f.status !== 'superseded') || null;
      if (!current) {
        return res.json({
          hasCurrentFRA: false,
          daysSinceLastAssessment: null,
          daysUntilReview: null,
          isOverdue: false,
          currentFRA: null,
          actionItems: { total: 0, outstanding: 0, critical_outstanding: 0, overdue_actions: 0, completed: 0 },
          overallStatus: 'no_fra',
        });
      }

      const now = new Date();
      const assessmentDate = new Date(current.assessmentDate);
      const reviewDate = new Date(current.nextReviewDate);
      const daysSince = Math.floor((now.getTime() - assessmentDate.getTime()) / (1000 * 60 * 60 * 24));
      const daysUntil = Math.ceil((reviewDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      const isOverdue = daysUntil < 0;

      const summary = await getActionSummary(custDb, schemaName, current.id);

      let overallStatus: 'compliant' | 'action_required' | 'critical' | 'no_fra';
      if (isOverdue || summary.critical_outstanding > 0) {
        overallStatus = 'critical';
      } else if (summary.outstanding > 0) {
        overallStatus = 'action_required';
      } else {
        overallStatus = 'compliant';
      }

      res.json({
        hasCurrentFRA: true,
        daysSinceLastAssessment: daysSince,
        daysUntilReview: daysUntil,
        isOverdue,
        currentFRA: current,
        actionItems: {
          total: summary.total,
          outstanding: summary.outstanding,
          critical_outstanding: summary.critical_outstanding,
          overdue_actions: summary.overdue_actions,
          completed: summary.completed,
        },
        overallStatus,
      });
    } catch (err) {
      logger.error('Error getting FRA status:', err);
      res.status(500).json({ error: 'Failed to get status' });
    }
  });

  // ── GET outstanding actions across ALL FRAs (dashboard widget) ─────────────
  app.get('/api/fire-risk-assessments/actions/outstanding', requireAuth, async (req, res) => {
    try {
      const custDb = await customerDbService.getCustomerDatabase(req.customerId!);
      const schemaName = customerDbService.generateSchemaName(req.customerId!);
      await ensureFraActionsTable(custDb, schemaName);

      const rows = await custDb.execute(sql.raw(`
        SELECT a.*, f.title as fra_title
        FROM ${schemaName}.fra_action_items a
        JOIN ${schemaName}.fire_risk_assessments f ON f.id = a.fra_id
        WHERE a.completed_at IS NULL
        ORDER BY
          CASE a.priority WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END,
          a.due_date ASC NULLS LAST
      `));

      res.json(rows.rows);
    } catch (err) {
      logger.error('Error fetching outstanding actions:', err);
      res.status(500).json({ error: 'Failed to fetch outstanding actions' });
    }
  });

  // ── GET single FRA ────────────────────────────────────────────────────────
  app.get('/api/fire-risk-assessments/:id', requireAuth, async (req, res) => {
    try {
      const custDb = await customerDbService.getCustomerDatabase(req.customerId!);
      const [fra] = await custDb.select().from(isolatedSchema.fireRiskAssessments)
        .where(eq(isolatedSchema.fireRiskAssessments.id, req.params.id));
      if (!fra) return res.status(404).json({ error: 'FRA not found' });
      res.json(fra);
    } catch (err) {
      logger.error('Error fetching FRA:', err);
      res.status(500).json({ error: 'Failed to fetch FRA' });
    }
  });

  // ── POST create FRA ────────────────────────────────────────────────────────
  app.post('/api/fire-risk-assessments', requireAuth, async (req, res) => {
    try {
      const custDb = await customerDbService.getCustomerDatabase(req.customerId!);
      const schemaName = customerDbService.generateSchemaName(req.customerId!);
      await ensureFraTable(custDb, schemaName);

      const body = req.body as any;
      const status = computeFraStatus(body.nextReviewDate);

      await custDb.execute(sql.raw(`
        UPDATE ${schemaName}.fire_risk_assessments
        SET status = 'superseded', updated_at = NOW()
        WHERE status != 'superseded'
      `));

      const [created] = await custDb.insert(isolatedSchema.fireRiskAssessments).values({
        title: body.title || 'Fire Risk Assessment',
        assessorName: body.assessorName,
        assessorCompany: body.assessorCompany || null,
        assessmentDate: body.assessmentDate,
        nextReviewDate: body.nextReviewDate,
        documentUrl: body.documentUrl || null,
        status,
        findingsSummary: body.findingsSummary || null,
      }).returning();

      res.status(201).json(created);
    } catch (err) {
      logger.error('Error creating FRA:', err);
      res.status(500).json({ error: 'Failed to create fire risk assessment' });
    }
  });

  // ── PUT update FRA ────────────────────────────────────────────────────────
  app.put('/api/fire-risk-assessments/:id', requireAuth, async (req, res) => {
    try {
      const custDb = await customerDbService.getCustomerDatabase(req.customerId!);
      const body = req.body as any;
      const updates: Record<string, any> = { updatedAt: new Date() };
      if (body.title !== undefined) updates.title = body.title;
      if (body.assessorName !== undefined) updates.assessorName = body.assessorName;
      if (body.assessorCompany !== undefined) updates.assessorCompany = body.assessorCompany;
      if (body.assessmentDate !== undefined) updates.assessmentDate = body.assessmentDate;
      if (body.nextReviewDate !== undefined) {
        updates.nextReviewDate = body.nextReviewDate;
        updates.status = computeFraStatus(body.nextReviewDate);
      }
      if (body.documentUrl !== undefined) updates.documentUrl = body.documentUrl;
      if (body.findingsSummary !== undefined) updates.findingsSummary = body.findingsSummary;

      const [updated] = await custDb.update(isolatedSchema.fireRiskAssessments)
        .set(updates)
        .where(eq(isolatedSchema.fireRiskAssessments.id, req.params.id))
        .returning();

      if (!updated) return res.status(404).json({ error: 'FRA not found' });
      res.json(updated);
    } catch (err) {
      logger.error('Error updating FRA:', err);
      res.status(500).json({ error: 'Failed to update FRA' });
    }
  });

  // ── DELETE FRA ────────────────────────────────────────────────────────────
  app.delete('/api/fire-risk-assessments/:id', requireAuth, async (req, res) => {
    try {
      const custDb = await customerDbService.getCustomerDatabase(req.customerId!);
      await custDb.delete(isolatedSchema.fireRiskAssessments)
        .where(eq(isolatedSchema.fireRiskAssessments.id, req.params.id));
      res.json({ success: true });
    } catch (err) {
      logger.error('Error deleting FRA:', err);
      res.status(500).json({ error: 'Failed to delete FRA' });
    }
  });

  // ── GET action items for a specific FRA ───────────────────────────────────
  app.get('/api/fire-risk-assessments/:fraId/actions', requireAuth, async (req, res) => {
    try {
      const custDb = await customerDbService.getCustomerDatabase(req.customerId!);
      const schemaName = customerDbService.generateSchemaName(req.customerId!);
      await ensureFraActionsTable(custDb, schemaName);
      const fraId = req.params.fraId.replace(/'/g, "''");

      const rows = await custDb.execute(sql.raw(`
        SELECT * FROM ${schemaName}.fra_action_items
        WHERE fra_id = '${fraId}'
        ORDER BY
          CASE priority WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END,
          due_date ASC NULLS LAST,
          created_at ASC
      `));

      const summary = await getActionSummary(custDb, schemaName, req.params.fraId);

      res.json({ items: rows.rows, summary });
    } catch (err) {
      logger.error('Error fetching FRA actions:', err);
      res.status(500).json({ error: 'Failed to fetch action items' });
    }
  });

  // ── POST create action item ───────────────────────────────────────────────
  app.post('/api/fire-risk-assessments/:fraId/actions', requireAuth, async (req, res) => {
    try {
      const custDb = await customerDbService.getCustomerDatabase(req.customerId!);
      const schemaName = customerDbService.generateSchemaName(req.customerId!);
      await ensureFraActionsTable(custDb, schemaName);

      const body = req.body as any;
      if (!body.description?.trim()) {
        return res.status(400).json({ error: 'Description is required' });
      }
      if (!['critical', 'high', 'medium', 'low'].includes(body.priority)) {
        return res.status(400).json({ error: 'Priority must be critical, high, medium, or low' });
      }

      const fraId = req.params.fraId.replace(/'/g, "''");
      const description = (body.description as string).replace(/'/g, "''");
      const priority = body.priority as string;
      const location = body.location ? (body.location as string).replace(/'/g, "''") : null;
      const assignedTo = body.assignedTo ? (body.assignedTo as string).replace(/'/g, "''") : null;
      const dueDate = body.dueDate || null;

      const rows = await custDb.execute(sql.raw(`
        INSERT INTO ${schemaName}.fra_action_items
          (fra_id, description, priority, location, assigned_to, due_date)
        VALUES
          ('${fraId}', '${description}', '${priority}',
           ${location ? `'${location}'` : 'NULL'},
           ${assignedTo ? `'${assignedTo}'` : 'NULL'},
           ${dueDate ? `'${dueDate}'` : 'NULL'})
        RETURNING *
      `));

      const created = rows.rows[0];

      // If critical action — send immediate alert
      if (priority === 'critical') {
        try {
          const settingsRows = await custDb.execute(sql.raw(
            `SELECT company_name, email, site_name FROM ${schemaName}.company_settings LIMIT 1`
          ));
          const settings = settingsRows.rows[0] as any;
          if (settings?.email) {
            const emailSvc = new EmailService(req.customerId!);
            await emailSvc.sendEmail({
              to: settings.email,
              subject: `🚨 Critical Fire Safety Action Added — ${settings.site_name || settings.company_name}`,
              companyName: settings.company_name || 'TPR Max',
              html: `
                <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
                  <div style="background:#dc2626;color:#fff;padding:20px;border-radius:8px 8px 0 0">
                    <h2 style="margin:0">🚨 Critical Fire Safety Action Recorded</h2>
                    <p style="margin:4px 0 0">${settings.company_name || 'TPR Max'}</p>
                  </div>
                  <div style="background:#fff;padding:20px;border:1px solid #e5e7eb">
                    <p>A <strong>critical priority</strong> fire safety action has been logged and requires <strong>immediate attention</strong>.</p>
                    <table style="width:100%;border-collapse:collapse;margin:16px 0">
                      <tr><td style="padding:6px;border:1px solid #e5e7eb;font-weight:bold;background:#fef2f2">Action</td><td style="padding:6px;border:1px solid #e5e7eb">${body.description}</td></tr>
                      ${body.location ? `<tr><td style="padding:6px;border:1px solid #e5e7eb;font-weight:bold;background:#fef2f2">Location</td><td style="padding:6px;border:1px solid #e5e7eb">${body.location}</td></tr>` : ''}
                      ${body.assignedTo ? `<tr><td style="padding:6px;border:1px solid #e5e7eb;font-weight:bold;background:#fef2f2">Assigned to</td><td style="padding:6px;border:1px solid #e5e7eb">${body.assignedTo}</td></tr>` : ''}
                      ${dueDate ? `<tr><td style="padding:6px;border:1px solid #e5e7eb;font-weight:bold;background:#fef2f2">Due date</td><td style="padding:6px;border:1px solid #e5e7eb;color:#dc2626">${new Date(dueDate).toLocaleDateString('en-GB')}</td></tr>` : ''}
                    </table>
                    <p>Critical actions represent an immediate risk to life and must be resolved without delay. Log in to TPR Max to update the status once resolved.</p>
                    <p style="color:#6b7280;font-size:12px">Outstanding critical actions may be treated as non-compliance under the Regulatory Reform (Fire Safety) Order 2005.</p>
                  </div>
                </div>
              `,
              text: `CRITICAL FIRE SAFETY ACTION\n\n${body.description}${body.location ? `\nLocation: ${body.location}` : ''}${body.assignedTo ? `\nAssigned to: ${body.assignedTo}` : ''}${dueDate ? `\nDue: ${new Date(dueDate).toLocaleDateString('en-GB')}` : ''}\n\nCritical actions represent an immediate risk to life. Log in to TPR Max to resolve.`,
            });
          }
        } catch (emailErr) {
          logger.error('Error sending critical action email:', emailErr);
        }
      }

      res.status(201).json(created);
    } catch (err) {
      logger.error('Error creating FRA action:', err);
      res.status(500).json({ error: 'Failed to create action item' });
    }
  });

  // ── PUT update action item ────────────────────────────────────────────────
  app.put('/api/fire-risk-assessments/:fraId/actions/:actionId', requireAuth, async (req, res) => {
    try {
      const custDb = await customerDbService.getCustomerDatabase(req.customerId!);
      const schemaName = customerDbService.generateSchemaName(req.customerId!);
      const body = req.body as any;
      const actionId = parseInt(req.params.actionId, 10);

      const setParts: string[] = ["updated_at = NOW()"];
      if (body.description !== undefined) setParts.push(`description = '${(body.description as string).replace(/'/g, "''")}'`);
      if (body.priority !== undefined) setParts.push(`priority = '${body.priority}'`);
      if (body.location !== undefined) setParts.push(`location = ${body.location ? `'${(body.location as string).replace(/'/g, "''")}'` : 'NULL'}`);
      if (body.assignedTo !== undefined) setParts.push(`assigned_to = ${body.assignedTo ? `'${(body.assignedTo as string).replace(/'/g, "''")}'` : 'NULL'}`);
      if (body.dueDate !== undefined) setParts.push(`due_date = ${body.dueDate ? `'${body.dueDate}'` : 'NULL'}`);

      const rows = await custDb.execute(sql.raw(`
        UPDATE ${schemaName}.fra_action_items
        SET ${setParts.join(', ')}
        WHERE id = ${actionId} AND fra_id = '${req.params.fraId.replace(/'/g, "''")}'
        RETURNING *
      `));

      if (!rows.rows[0]) return res.status(404).json({ error: 'Action item not found' });
      res.json(rows.rows[0]);
    } catch (err) {
      logger.error('Error updating FRA action:', err);
      res.status(500).json({ error: 'Failed to update action item' });
    }
  });

  // ── PATCH mark action complete ─────────────────────────────────────────────
  app.patch('/api/fire-risk-assessments/:fraId/actions/:actionId/complete', requireAuth, async (req, res) => {
    try {
      const custDb = await customerDbService.getCustomerDatabase(req.customerId!);
      const schemaName = customerDbService.generateSchemaName(req.customerId!);
      const body = req.body as any;
      const actionId = parseInt(req.params.actionId, 10);

      const completedBy = body.completedBy ? (body.completedBy as string).replace(/'/g, "''") : 'Unknown';
      const notes = body.completionNotes ? (body.completionNotes as string).replace(/'/g, "''") : null;

      const rows = await custDb.execute(sql.raw(`
        UPDATE ${schemaName}.fra_action_items
        SET
          completed_at = NOW(),
          completed_by = '${completedBy}',
          completion_notes = ${notes ? `'${notes}'` : 'NULL'},
          updated_at = NOW()
        WHERE id = ${actionId} AND fra_id = '${req.params.fraId.replace(/'/g, "''")}'
          AND completed_at IS NULL
        RETURNING *
      `));

      if (!rows.rows[0]) return res.status(404).json({ error: 'Action item not found or already completed' });
      res.json(rows.rows[0]);
    } catch (err) {
      logger.error('Error completing FRA action:', err);
      res.status(500).json({ error: 'Failed to complete action item' });
    }
  });

  // ── FRA + Action Item Cron (daily at 07:00 Europe/London) ─────────────────
  const alertHour = parseInt(process.env.PPM_ALERT_HOUR ?? '7', 10);
  cron.schedule(`0 ${alertHour} * * *`, async () => {
    try {
      logger.info('[FRA Cron] Running daily fire risk assessment + action item check…');
      const allCustomers = await customerDbService.getAllCustomers();
      const now = new Date();
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

      for (const customer of allCustomers) {
        try {
          const custDb = await customerDbService.getCustomerDatabase(customer.id);
          const schemaName = customerDbService.generateSchemaName(customer.id);
          await ensureFraTable(custDb, schemaName);
          await ensureFraActionsTable(custDb, schemaName);

          const settingsRows = await custDb.execute(sql.raw(
            `SELECT company_name, email, site_name FROM ${schemaName}.company_settings LIMIT 1`
          ));
          const settings = settingsRows.rows[0] as any;
          const companyName = settings?.company_name || 'TPR Max';
          const siteName = settings?.site_name || companyName;
          const adminEmail = settings?.email as string | undefined;
          if (!adminEmail) continue;

          const emailSvc = new EmailService(customer.id);

          // ── FRA Review Reminders ─────────────────────────────────────────
          const fras = await custDb.select().from(isolatedSchema.fireRiskAssessments)
            .orderBy(desc(isolatedSchema.fireRiskAssessments.assessmentDate));

          const toRemind = fras.filter(f => {
            if (f.status === 'superseded') return false;
            const status = computeFraStatus(f.nextReviewDate);
            if (status !== 'review_due' && status !== 'overdue') return false;
            if (!f.reminderSentAt) return true;
            return new Date(f.reminderSentAt) < thirtyDaysAgo;
          });

          for (const fra of toRemind) {
            const status = computeFraStatus(fra.nextReviewDate);
            const reviewDate = new Date(fra.nextReviewDate);
            const daysUntil = Math.ceil((reviewDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
            const isOverdue = daysUntil < 0;
            const subject = isOverdue
              ? `🚨 Fire Risk Assessment OVERDUE — ${siteName}`
              : `📋 Fire Risk Assessment Review Due — ${siteName}`;

            await emailSvc.sendEmail({
              to: adminEmail,
              subject,
              companyName,
              html: `
                <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
                  <div style="background:${isOverdue ? '#dc2626' : '#d97706'};color:#fff;padding:20px;border-radius:8px 8px 0 0">
                    <h2 style="margin:0">${isOverdue ? '🚨 Fire Risk Assessment OVERDUE' : '📋 Fire Risk Assessment Review Due'}</h2>
                    <p style="margin:4px 0 0">${companyName}</p>
                  </div>
                  <div style="background:#fff;padding:20px;border:1px solid #e5e7eb">
                    <p>Your Fire Risk Assessment is <strong>${isOverdue ? 'overdue' : 'due for review'}</strong>.</p>
                    <table style="width:100%;border-collapse:collapse;margin:16px 0">
                      <tr><td style="padding:6px;border:1px solid #e5e7eb;font-weight:bold;background:#f9fafb">Last assessment</td><td style="padding:6px;border:1px solid #e5e7eb">${new Date(fra.assessmentDate).toLocaleDateString('en-GB')} by ${fra.assessorName}</td></tr>
                      <tr><td style="padding:6px;border:1px solid #e5e7eb;font-weight:bold;background:#f9fafb">Review due by</td><td style="padding:6px;border:1px solid #e5e7eb;color:${isOverdue ? '#dc2626' : '#d97706'}">${reviewDate.toLocaleDateString('en-GB')}</td></tr>
                      ${isOverdue ? `<tr><td style="padding:6px;border:1px solid #e5e7eb;font-weight:bold;background:#fef2f2">Status</td><td style="padding:6px;border:1px solid #e5e7eb;color:#dc2626;font-weight:bold">OVERDUE by ${Math.abs(daysUntil)} days</td></tr>` : ''}
                    </table>
                    <p>Under the Regulatory Reform (Fire Safety) Order 2005, your Fire Risk Assessment must be kept current.</p>
                    <p><a href="${EXTERNAL_LINKS.fire.hseFireGuidance}">GOV.UK Fire Risk Assessment guidance →</a></p>
                  </div>
                </div>
              `,
              text: `Fire Risk Assessment ${isOverdue ? 'OVERDUE' : 'Review Due'}\n\nLast assessment: ${new Date(fra.assessmentDate).toLocaleDateString('en-GB')} by ${fra.assessorName}\nReview due: ${reviewDate.toLocaleDateString('en-GB')}\n${isOverdue ? `OVERDUE by ${Math.abs(daysUntil)} days\n` : ''}\nGuidance: ${EXTERNAL_LINKS.fire.hseFireGuidance}`,
            });

            await custDb.update(isolatedSchema.fireRiskAssessments)
              .set({ reminderSentAt: now, status, updatedAt: new Date() })
              .where(eq(isolatedSchema.fireRiskAssessments.id, fra.id));

            logger.info(`[FRA Cron] Review reminder sent for FRA ${fra.id} (customer ${customer.id})`);
          }

          // ── Action Item Digest Reminders ─────────────────────────────────
          const sevenDaysAhead = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
          const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

          const actionRows = await custDb.execute(sql.raw(`
            SELECT a.*, f.title as fra_title
            FROM ${schemaName}.fra_action_items a
            JOIN ${schemaName}.fire_risk_assessments f ON f.id = a.fra_id
            WHERE a.completed_at IS NULL
              AND a.due_date IS NOT NULL
              AND a.due_date <= '${sevenDaysAhead.toISOString().slice(0, 10)}'
              AND (a.reminder_sent_at IS NULL OR a.reminder_sent_at < '${sevenDaysAgo.toISOString()}')
            ORDER BY
              CASE a.priority WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END,
              a.due_date ASC
          `));

          const actionItems = actionRows.rows as any[];

          // Immediately email any overdue critical actions individually
          const overduecrits = actionItems.filter(a => a.priority === 'critical' && new Date(a.due_date) < now);
          for (const action of overduecrits) {
            const daysOverdue = Math.floor((now.getTime() - new Date(action.due_date).getTime()) / (1000 * 60 * 60 * 24));
            await emailSvc.sendEmail({
              to: adminEmail,
              subject: `🚨 Critical Fire Safety Action Overdue — Immediate Attention Required`,
              companyName,
              html: `
                <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
                  <div style="background:#dc2626;color:#fff;padding:20px;border-radius:8px 8px 0 0">
                    <h2 style="margin:0">🚨 Critical Fire Safety Action Overdue</h2>
                    <p style="margin:4px 0 0">${companyName}</p>
                  </div>
                  <div style="background:#fff;padding:20px;border:1px solid #e5e7eb">
                    <p>The following <strong>critical</strong> fire safety action is overdue by <strong>${daysOverdue} day${daysOverdue !== 1 ? 's' : ''}</strong> and requires immediate resolution.</p>
                    <table style="width:100%;border-collapse:collapse;margin:16px 0">
                      <tr><td style="padding:6px;border:1px solid #e5e7eb;font-weight:bold;background:#fef2f2">Action</td><td style="padding:6px;border:1px solid #e5e7eb">${action.description}</td></tr>
                      ${action.location ? `<tr><td style="padding:6px;border:1px solid #e5e7eb;font-weight:bold;background:#fef2f2">Location</td><td style="padding:6px;border:1px solid #e5e7eb">${action.location}</td></tr>` : ''}
                      ${action.assigned_to ? `<tr><td style="padding:6px;border:1px solid #e5e7eb;font-weight:bold;background:#fef2f2">Assigned to</td><td style="padding:6px;border:1px solid #e5e7eb">${action.assigned_to}</td></tr>` : ''}
                      <tr><td style="padding:6px;border:1px solid #e5e7eb;font-weight:bold;background:#fef2f2">Was due</td><td style="padding:6px;border:1px solid #e5e7eb;color:#dc2626;font-weight:bold">${new Date(action.due_date).toLocaleDateString('en-GB')} (${daysOverdue} day${daysOverdue !== 1 ? 's' : ''} overdue)</td></tr>
                    </table>
                    <p>Outstanding critical actions may be treated as non-compliance under the Regulatory Reform (Fire Safety) Order 2005.</p>
                  </div>
                </div>
              `,
              text: `CRITICAL FIRE SAFETY ACTION OVERDUE\n\n${action.description}${action.location ? `\nLocation: ${action.location}` : ''}${action.assigned_to ? `\nAssigned to: ${action.assigned_to}` : ''}\nWas due: ${new Date(action.due_date).toLocaleDateString('en-GB')} (${daysOverdue} days overdue)`,
            });
          }

          // Send one digest for all other due-soon / non-critical overdue actions
          const digestItems = actionItems.filter(a => !(a.priority === 'critical' && new Date(a.due_date) < now));
          if (digestItems.length > 0) {
            const criticals = digestItems.filter(a => a.priority === 'critical');
            const highs = digestItems.filter(a => a.priority === 'high');
            const others = digestItems.filter(a => a.priority !== 'critical' && a.priority !== 'high');

            const formatAction = (a: any) => {
              const daysLeft = Math.ceil((new Date(a.due_date).getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
              const dueTxt = daysLeft < 0 ? `${Math.abs(daysLeft)} days overdue` : `due in ${daysLeft} day${daysLeft !== 1 ? 's' : ''}`;
              return `<li style="margin-bottom:6px">${a.description}${a.location ? ` — <em>${a.location}</em>` : ''}${a.assigned_to ? ` — Assigned: ${a.assigned_to}` : ''}<br><span style="color:${daysLeft < 0 ? '#dc2626' : '#b45309'}">${new Date(a.due_date).toLocaleDateString('en-GB')} (${dueTxt})</span></li>`;
            };

            const htmlSections = [
              criticals.length ? `<p><strong style="color:#dc2626">🔴 CRITICAL — resolve immediately:</strong></p><ul>${criticals.map(formatAction).join('')}</ul>` : '',
              highs.length ? `<p><strong style="color:#d97706">🟠 HIGH PRIORITY — resolve within 1 month:</strong></p><ul>${highs.map(formatAction).join('')}</ul>` : '',
              others.length ? `<p><strong style="color:#ca8a04">🟡 OTHER ACTIONS:</strong></p><ul>${others.map(formatAction).join('')}</ul>` : '',
            ].filter(Boolean).join('');

            await emailSvc.sendEmail({
              to: adminEmail,
              subject: `⚠ Fire Safety Actions Outstanding — ${digestItems.length} item${digestItems.length !== 1 ? 's' : ''} due`,
              companyName,
              html: `
                <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
                  <div style="background:#d97706;color:#fff;padding:20px;border-radius:8px 8px 0 0">
                    <h2 style="margin:0">⚠ Fire Safety Actions Outstanding</h2>
                    <p style="margin:4px 0 0">${companyName}</p>
                  </div>
                  <div style="background:#fff;padding:20px;border:1px solid #e5e7eb">
                    <p>The following fire safety actions from your Fire Risk Assessment require attention:</p>
                    ${htmlSections}
                    <p>Log in to TPR Max to update the status of these actions or mark them as complete once resolved.</p>
                    <p style="color:#6b7280;font-size:12px">Outstanding actions from your fire risk assessment may be treated as non-compliance under the Regulatory Reform (Fire Safety) Order 2005.</p>
                  </div>
                </div>
              `,
              text: digestItems.map(a => {
                const daysLeft = Math.ceil((new Date(a.due_date).getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
                return `[${a.priority.toUpperCase()}] ${a.description}${a.location ? ` — ${a.location}` : ''}${a.assigned_to ? ` — Assigned: ${a.assigned_to}` : ''}\nDue: ${new Date(a.due_date).toLocaleDateString('en-GB')} (${daysLeft < 0 ? `${Math.abs(daysLeft)} days overdue` : `${daysLeft} days`})`;
              }).join('\n\n'),
            });
          }

          // Mark reminder_sent_at on all processed actions
          if (actionItems.length > 0) {
            const ids = actionItems.map(a => a.id).join(',');
            await custDb.execute(sql.raw(
              `UPDATE ${schemaName}.fra_action_items SET reminder_sent_at = NOW() WHERE id IN (${ids})`
            ));
          }

        } catch (custErr) {
          logger.error(`[FRA Cron] Error for customer ${customer.id}:`, custErr);
        }
      }
      logger.info('[FRA Cron] Daily check complete');
    } catch (err) {
      logger.error('[FRA Cron] Fatal error:', err);
    }
  }, { timezone: 'Europe/London' });
}
