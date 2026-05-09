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

function computeFraStatus(nextReviewDate: string): 'current' | 'review_due' | 'overdue' {
  const review = new Date(nextReviewDate);
  const now = new Date();
  const msUntil = review.getTime() - now.getTime();
  const daysUntil = msUntil / (1000 * 60 * 60 * 24);
  if (daysUntil < 0) return 'overdue';
  if (daysUntil <= 30) return 'review_due';
  return 'current';
}

export function registerFireRiskAssessmentRoutes(app: Express): void {

  // GET all FRAs
  app.get('/api/fire-risk-assessments', requireAuth, async (req, res) => {
    try {
      const custDb = await customerDbService.getCustomerDatabase(req.customerId!);
      const schemaName = customerDbService.generateSchemaName(req.customerId!);
      await ensureFraTable(custDb, schemaName);
      const fras = await custDb.select().from(isolatedSchema.fireRiskAssessments)
        .orderBy(desc(isolatedSchema.fireRiskAssessments.assessmentDate));

      // Auto-update status on read (non-superseded only)
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

  // GET compliance status
  app.get('/api/fire-risk-assessments/status', requireAuth, async (req, res) => {
    try {
      const custDb = await customerDbService.getCustomerDatabase(req.customerId!);
      const schemaName = customerDbService.generateSchemaName(req.customerId!);
      await ensureFraTable(custDb, schemaName);
      const fras = await custDb.select().from(isolatedSchema.fireRiskAssessments)
        .orderBy(desc(isolatedSchema.fireRiskAssessments.assessmentDate));

      const current = fras.find(f => f.status !== 'superseded') || null;
      if (!current) {
        return res.json({ hasCurrentFRA: false, daysSinceLastAssessment: null, daysUntilReview: null, isOverdue: false, currentFRA: null });
      }

      const now = new Date();
      const assessmentDate = new Date(current.assessmentDate);
      const reviewDate = new Date(current.nextReviewDate);
      const daysSince = Math.floor((now.getTime() - assessmentDate.getTime()) / (1000 * 60 * 60 * 24));
      const daysUntil = Math.ceil((reviewDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

      res.json({
        hasCurrentFRA: true,
        daysSinceLastAssessment: daysSince,
        daysUntilReview: daysUntil,
        isOverdue: daysUntil < 0,
        currentFRA: current,
      });
    } catch (err) {
      logger.error('Error getting FRA status:', err);
      res.status(500).json({ error: 'Failed to get status' });
    }
  });

  // GET single FRA
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

  // POST create FRA (supersedes any previous current FRA)
  app.post('/api/fire-risk-assessments', requireAuth, async (req, res) => {
    try {
      const custDb = await customerDbService.getCustomerDatabase(req.customerId!);
      const schemaName = customerDbService.generateSchemaName(req.customerId!);
      await ensureFraTable(custDb, schemaName);

      const body = req.body as any;
      const status = computeFraStatus(body.nextReviewDate);

      // Supersede previous current FRAs
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

  // PUT update FRA
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

  // DELETE FRA
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

  // ── FRA Reminder Cron (daily at 07:00 Europe/London) ─────────────────────
  const alertHour = parseInt(process.env.PPM_ALERT_HOUR ?? '7', 10);
  cron.schedule(`0 ${alertHour} * * *`, async () => {
    try {
      logger.info('[FRA Cron] Running daily fire risk assessment reminder check…');
      const allCustomers = await customerDbService.getAllCustomers();
      const now = new Date();
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

      for (const customer of allCustomers) {
        try {
          const custDb = await customerDbService.getCustomerDatabase(customer.id);
          const schemaName = customerDbService.generateSchemaName(customer.id);
          await ensureFraTable(custDb, schemaName);

          const fras = await custDb.select().from(isolatedSchema.fireRiskAssessments)
            .orderBy(desc(isolatedSchema.fireRiskAssessments.assessmentDate));

          const toRemind = fras.filter(f => {
            if (f.status === 'superseded') return false;
            const status = computeFraStatus(f.nextReviewDate);
            if (status !== 'review_due' && status !== 'overdue') return false;
            if (!f.reminderSentAt) return true;
            return new Date(f.reminderSentAt) < thirtyDaysAgo;
          });

          if (toRemind.length === 0) continue;

          const settingsRows = await custDb.execute(sql.raw(`SELECT company_name, email, site_name FROM ${schemaName}.company_settings LIMIT 1`));
          const settings = settingsRows.rows[0] as any;
          const companyName = settings?.company_name || 'TPR Max';
          const siteName = settings?.site_name || companyName;
          const adminEmail = settings?.email as string | undefined;
          if (!adminEmail) continue;

          const emailSvc = new EmailService(customer.id);

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
                    <p>Under the Regulatory Reform (Fire Safety) Order 2005, your Fire Risk Assessment must be kept current. An overdue FRA may result in enforcement action by the Fire Service.</p>
                    <p>Log in to TPR Max to upload your updated assessment or record a new review date.</p>
                    <p>If you have recently completed a review, please log it in TPR Max to clear this reminder.</p>
                    <p><a href="${EXTERNAL_LINKS.fire.hseFireGuidance}">HSE Fire Risk Assessment guidance →</a></p>
                  </div>
                </div>
              `,
              text: `Fire Risk Assessment ${isOverdue ? 'OVERDUE' : 'Review Due'}\n\nLast assessment: ${new Date(fra.assessmentDate).toLocaleDateString('en-GB')} by ${fra.assessorName}\nReview due: ${reviewDate.toLocaleDateString('en-GB')}\n${isOverdue ? `OVERDUE by ${Math.abs(daysUntil)} days\n` : ''}\nHSE guidance: ${EXTERNAL_LINKS.fire.hseFireGuidance}`,
            });

            await custDb.update(isolatedSchema.fireRiskAssessments)
              .set({ reminderSentAt: now, status, updatedAt: new Date() })
              .where(eq(isolatedSchema.fireRiskAssessments.id, fra.id));

            logger.info(`[FRA Cron] Reminder sent for FRA ${fra.id} (customer ${customer.id})`);
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
