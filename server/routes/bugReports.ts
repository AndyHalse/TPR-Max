import type { Express } from 'express';
import rateLimit from 'express-rate-limit';
import { requireAuth, requirePlatformAdmin } from '../auth';
import { db } from '../db';
import { bugReports, customers, insertBugReportSchema } from '@shared/schema';
import { eq, desc, sql } from 'drizzle-orm';
import { EmailService } from '../emailService';
import { logger } from '../utils/logger';

const MAX_ATTACHMENT_BYTES = 4 * 1024 * 1024;
const MAX_TOTAL_BYTES = 12 * 1024 * 1024;
const MAX_ATTACHMENTS = 5;

const bugReportLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many bug reports submitted. Please wait a few minutes and try again.' },
});

export function registerBugReportRoutes(app: Express) {

  // POST /api/bug-reports — tenant-facing, rate-limited
  app.post('/api/bug-reports', requireAuth, bugReportLimiter, async (req, res) => {
    try {
      const parsed = insertBugReportSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: 'Invalid request', details: parsed.error.errors });
      }
      const data = parsed.data;

      if (data.screenshot) {
        if (!data.screenshot.startsWith('data:image/')) {
          return res.status(400).json({ error: 'Screenshot must be a valid image data URL.' });
        }
        if (data.screenshot.length > MAX_ATTACHMENT_BYTES) {
          return res.status(400).json({ error: 'Screenshot too large (max 4MB).' });
        }
      }

      if (data.attachments && data.attachments.length > 0) {
        if (data.attachments.length > MAX_ATTACHMENTS) {
          return res.status(400).json({ error: `Too many attachments (max ${MAX_ATTACHMENTS}).` });
        }
        let totalBytes = 0;
        for (const att of data.attachments) {
          if (!att.dataUrl.startsWith('data:image/')) {
            return res.status(400).json({ error: 'Each attachment must be a valid image data URL.' });
          }
          if (att.dataUrl.length > MAX_ATTACHMENT_BYTES) {
            return res.status(400).json({ error: 'One or more attachments exceed the 4MB per-image limit.' });
          }
          totalBytes += att.dataUrl.length;
        }
        if (totalBytes > MAX_TOTAL_BYTES) {
          return res.status(400).json({ error: 'Total attachments exceed 12MB. Please reduce the number or size of images.' });
        }
      }

      const customerId = req.customerId!;

      let customerName = '';
      try {
        const [customer] = await db
          .select({ companyName: customers.companyName })
          .from(customers)
          .where(eq(customers.id, customerId))
          .limit(1);
        customerName = customer?.companyName ?? '';
      } catch (_) { /* non-fatal */ }

      const [countRow] = await db.select({ count: sql<number>`count(*)::int` }).from(bugReports);
      const nextNum = (countRow?.count ?? 0) + 1;
      const reportNumber = `BR-${String(nextNum).padStart(3, '0')}`;

      const [inserted] = await db.insert(bugReports).values({
        reportNumber,
        customerId,
        customerName: customerName || null,
        reporterName: data.reporterName ?? null,
        reporterEmail: data.reporterEmail ?? null,
        description: data.description,
        pageUrl: data.pageUrl ?? null,
        browserInfo: data.browserInfo ?? null,
        screenSize: data.screenSize ?? null,
        consoleErrors: data.consoleErrors ?? null,
        screenshot: data.screenshot ?? null,
        attachments: data.attachments && data.attachments.length > 0 ? data.attachments : null,
        errorId: (data as any).errorId ?? null,
        breadcrumbs: (data as any).breadcrumbs ?? null,
        appVersion: (data as any).appVersion ?? null,
        status: 'new',
      }).returning({ id: bugReports.id, reportNumber: bugReports.reportNumber });

      const totalImages =
        (data.screenshot ? 1 : 0) + (data.attachments?.length ?? 0);

      const notifyEmail = process.env.BUG_REPORT_NOTIFY_EMAIL || 'andy@acsltd.eu';
      try {
        const emailSvc = new EmailService();
        const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        await emailSvc.sendEmail({
          to: notifyEmail,
          subject: `Bug Report ${reportNumber} — ${customerName || customerId}`,
          html: `
            <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#1e293b">
              <h2 style="color:#d97706">🐛 ${reportNumber} — New Bug Report</h2>
              <table style="width:100%;border-collapse:collapse;margin-bottom:16px">
                <tr><td style="padding:4px 8px;font-weight:bold;width:140px">Customer</td><td>${esc(customerName || customerId)}</td></tr>
                <tr><td style="padding:4px 8px;font-weight:bold">Reporter</td><td>${esc(data.reporterName ?? '—')} (${esc(data.reporterEmail ?? '—')})</td></tr>
                <tr><td style="padding:4px 8px;font-weight:bold">Page</td><td>${esc(data.pageUrl ?? '—')}</td></tr>
                <tr><td style="padding:4px 8px;font-weight:bold">Screen</td><td>${esc(data.screenSize ?? '—')}</td></tr>
                ${totalImages > 0 ? `<tr><td style="padding:4px 8px;font-weight:bold">Attachments</td><td>${totalImages} image(s)</td></tr>` : ''}
              </table>
              <h3>Description</h3>
              <p style="white-space:pre-wrap;background:#f8fafc;padding:12px;border-radius:4px;border-left:4px solid #d97706">${esc(data.description)}</p>
              ${data.consoleErrors ? `<h3>Console / Network Logs</h3><pre style="background:#fee2e2;padding:8px;font-size:12px;overflow:auto;border-radius:4px">${esc(data.consoleErrors)}</pre>` : ''}
            </div>
          `,
          text: `${reportNumber} — New Bug Report\nCustomer: ${customerName || customerId}\nReporter: ${data.reporterName ?? '—'} (${data.reporterEmail ?? '—'})\nPage: ${data.pageUrl ?? '—'}\n\n${data.description}`,
        });
      } catch (emailErr: any) {
        logger.warn('[bug-reports] Email notification failed:', emailErr.message?.substring(0, 80));
      }

      return res.status(201).json(inserted);
    } catch (error: any) {
      logger.error('Error creating bug report:', error);
      return res.status(500).json({ error: 'Failed to submit bug report.' });
    }
  });

  // GET /platform-admin/bug-reports — all reports, no screenshot (hasScreenshot boolean instead)
  app.get('/platform-admin/bug-reports', requirePlatformAdmin, async (_req, res) => {
    try {
      const reports = await db.select({
        id: bugReports.id,
        reportNumber: bugReports.reportNumber,
        customerId: bugReports.customerId,
        customerName: bugReports.customerName,
        reporterName: bugReports.reporterName,
        reporterEmail: bugReports.reporterEmail,
        description: bugReports.description,
        pageUrl: bugReports.pageUrl,
        browserInfo: bugReports.browserInfo,
        screenSize: bugReports.screenSize,
        consoleErrors: bugReports.consoleErrors,
        errorId: bugReports.errorId,
        breadcrumbs: bugReports.breadcrumbs,
        appVersion: bugReports.appVersion,
        status: bugReports.status,
        adminNotes: bugReports.adminNotes,
        createdAt: bugReports.createdAt,
        updatedAt: bugReports.updatedAt,
        resolvedAt: bugReports.resolvedAt,
        hasScreenshot: sql<boolean>`(${bugReports.screenshot} IS NOT NULL)`,
        attachmentCount: sql<number>`coalesce(jsonb_array_length(${bugReports.attachments}), 0)`,
      })
        .from(bugReports)
        .orderBy(desc(bugReports.createdAt));

      return res.json({ reports });
    } catch (error: any) {
      logger.error('Error listing bug reports:', error);
      return res.status(500).json({ error: 'Failed to load bug reports.' });
    }
  });

  // GET /platform-admin/bug-reports/:id — full report including screenshot
  app.get('/platform-admin/bug-reports/:id', requirePlatformAdmin, async (req, res) => {
    try {
      const [report] = await db
        .select()
        .from(bugReports)
        .where(eq(bugReports.id, req.params.id))
        .limit(1);
      if (!report) return res.status(404).json({ error: 'Report not found.' });
      return res.json(report);
    } catch (error: any) {
      logger.error('Error fetching bug report:', error);
      return res.status(500).json({ error: 'Failed to load bug report.' });
    }
  });

  // PATCH /platform-admin/bug-reports/:id — update status and/or adminNotes
  app.patch('/platform-admin/bug-reports/:id', requirePlatformAdmin, async (req, res) => {
    try {
      const { status, adminNotes } = req.body;
      const ALLOWED_STATUSES = ['new', 'in_progress', 'fixed', 'closed'];

      if (status !== undefined && !ALLOWED_STATUSES.includes(status)) {
        return res.status(400).json({ error: `Status must be one of: ${ALLOWED_STATUSES.join(', ')}` });
      }

      const setData: Record<string, any> = { updatedAt: new Date() };
      if (status !== undefined) {
        setData.status = status;
        setData.resolvedAt = (status === 'fixed' || status === 'closed') ? new Date() : null;
      }
      if (adminNotes !== undefined) setData.adminNotes = adminNotes;

      const [updated] = await db
        .update(bugReports)
        .set(setData)
        .where(eq(bugReports.id, req.params.id))
        .returning();
      if (!updated) return res.status(404).json({ error: 'Report not found.' });

      return res.json(updated);
    } catch (error: any) {
      logger.error('Error updating bug report:', error);
      return res.status(500).json({ error: 'Failed to update bug report.' });
    }
  });
}
