import type { Express } from 'express';
import { randomBytes } from 'crypto';
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

const ALLOWED_STATUSES = ['new', 'in_progress', 'fixed', 'closed', 'reopened'];

const bugReportLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many bug reports submitted. Please wait a few minutes and try again.' },
});

const feedbackLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please try again later.' },
});

const DISCLAIMER = `If you are not the intended recipient of this message, please notify the sender immediately and do not disclose the contents to any other person, use it for any purpose, or store or copy the information in any medium. Internet communications are not secure and therefore ACS Safety & Security Limited does not accept legal responsibility for the contents of this message. Any views or opinions presented are solely those of the author and do not necessarily represent those of ACS Safety & Security Limited.`;

function getBaseUrl(): string {
  return process.env.FRONTEND_URL
    || (process.env.REPLIT_DOMAINS ? `https://${process.env.REPLIT_DOMAINS.split(',')[0].trim()}` : 'http://localhost:5000');
}

function buildFixedEmailHtml(opts: {
  reportNumber: string;
  reporterFirstName: string | null;
  reporterName: string | null;
  description: string;
  resolutionNote: string | null;
  feedbackToken?: string;
  baseUrl?: string;
}): string {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const greeting = opts.reporterFirstName || opts.reporterName?.split(' ')[0] || 'there';
  const desc = esc(opts.description.slice(0, 600) + (opts.description.length > 600 ? '…' : ''));

  const verificationButtons = opts.feedbackToken && opts.baseUrl ? `
      <!-- Verification buttons -->
      <table width="100%" cellpadding="0" cellspacing="0" style="margin:4px 0 24px">
        <tr>
          <td align="center">
            <p style="margin:0 0 14px;font-size:15px;color:#1e293b">Can you confirm the issue is sorted?</p>
            <table cellpadding="0" cellspacing="0" style="display:inline-block">
              <tr>
                <td style="padding:0 6px">
                  <a href="${opts.baseUrl}/bug-feedback/${opts.feedbackToken}?r=fixed"
                     style="display:inline-block;background:#16a34a;color:#ffffff;text-decoration:none;font-weight:bold;font-size:14px;padding:12px 22px;border-radius:6px">&#10003; Yes, this is fixed</a>
                </td>
                <td style="padding:0 6px">
                  <a href="${opts.baseUrl}/bug-feedback/${opts.feedbackToken}?r=broken"
                     style="display:inline-block;background:#ffffff;color:#b91c1c;text-decoration:none;font-weight:bold;font-size:14px;padding:11px 21px;border:1px solid #b91c1c;border-radius:6px">&#10007; No, still broken</a>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
  ` : '';

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f6f9;font-family:Arial,Helvetica,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f9;padding:24px 0">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:6px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,0.08)">

  <!-- Header band -->
  <tr>
    <td style="background:#2460A9;padding:24px 32px">
      <p style="margin:0;color:#ffffff;font-size:13px;font-weight:bold;letter-spacing:0.5px;text-transform:uppercase;opacity:0.85">ACS Safety &amp; Security — TPR Support</p>
      <p style="margin:6px 0 0;color:#ffffff;font-size:20px;font-weight:bold">Report ${esc(opts.reportNumber)} — Resolved</p>
    </td>
  </tr>

  <!-- Body -->
  <tr>
    <td style="padding:28px 32px;color:#1e293b;font-size:15px;line-height:1.6">
      <p style="margin:0 0 16px">Hi ${esc(greeting)},</p>
      <p style="margin:0 0 20px">Good news — the issue you reported has now been fixed.</p>

      <!-- Original report callout -->
      <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px">
        <tr>
          <td style="background:#f0f5fb;border-left:4px solid #2460A9;border-radius:0 4px 4px 0;padding:14px 16px">
            <p style="margin:0 0 6px;font-size:12px;font-weight:bold;color:#2460A9;text-transform:uppercase;letter-spacing:0.4px">Your report (${esc(opts.reportNumber)})</p>
            <p style="margin:0;font-size:14px;color:#334155;font-style:italic">&ldquo;${desc}&rdquo;</p>
          </td>
        </tr>
      </table>

      ${opts.resolutionNote ? `
      <!-- Resolution note -->
      <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px">
        <tr>
          <td style="background:#f0fdf4;border-left:4px solid #16a34a;border-radius:0 4px 4px 0;padding:14px 16px">
            <p style="margin:0 0 6px;font-size:12px;font-weight:bold;color:#16a34a;text-transform:uppercase;letter-spacing:0.4px">What we did</p>
            <p style="margin:0;font-size:14px;color:#334155">${esc(opts.resolutionNote)}</p>
          </td>
        </tr>
      </table>
      ` : ''}

      ${verificationButtons}

      <p style="margin:0 0 20px">If you're still seeing the problem, please refresh the page (or sign out and back in) to pick up the latest version. If it persists, just reply to this email and we'll take another look.</p>

      <p style="margin:0 0 4px">Thanks for helping us make TPR better.</p>
      <p style="margin:0 0 24px">Kind Regards</p>

      <!-- Signature -->
      <table cellpadding="0" cellspacing="0" style="border-top:2px solid #2460A9;padding-top:16px;margin-bottom:8px">
        <tr>
          <td>
            <p style="margin:0;font-size:14px;font-weight:bold;color:#1e293b">Software Development Team</p>
            <p style="margin:2px 0;font-size:14px;font-weight:bold;color:#2460A9">ACS Safety &amp; Security Ltd</p>
            <p style="margin:6px 0 0;font-size:13px;color:#64748b">T: +44 (0)1344 771569</p>
          </td>
        </tr>
      </table>
    </td>
  </tr>

  <!-- Disclaimer -->
  <tr>
    <td style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:16px 32px">
      <p style="margin:0;font-size:10px;color:#94a3b8;line-height:1.5">${esc(DISCLAIMER)}</p>
    </td>
  </tr>

</table>
</td></tr>
</table>
</body>
</html>`;
}

function buildFixedEmailText(opts: {
  reportNumber: string;
  reporterFirstName: string | null;
  reporterName: string | null;
  description: string;
  resolutionNote: string | null;
  feedbackToken?: string;
  baseUrl?: string;
}): string {
  const greeting = opts.reporterFirstName || opts.reporterName?.split(' ')[0] || 'there';
  const desc = opts.description.slice(0, 600) + (opts.description.length > 600 ? '…' : '');
  const feedbackLines = opts.feedbackToken && opts.baseUrl ? [
    `Is it fixed?`,
    `  Yes → ${opts.baseUrl}/bug-feedback/${opts.feedbackToken}?r=fixed`,
    `  Still broken → ${opts.baseUrl}/bug-feedback/${opts.feedbackToken}?r=broken`,
    '',
  ] : [];
  return [
    `Hi ${greeting},`,
    '',
    `Good news — the issue you reported (${opts.reportNumber}) has now been fixed.`,
    '',
    `Your report:`,
    `"${desc}"`,
    '',
    ...(opts.resolutionNote ? [`What we did: ${opts.resolutionNote}`, ''] : []),
    ...feedbackLines,
    `If you're still seeing the problem, please refresh the page (or sign out and back in) to pick up the latest version. If it persists, just reply to this email and we'll take another look.`,
    '',
    `Thanks for helping us make TPR better.`,
    '',
    `Kind Regards`,
    `Software Development Team`,
    `ACS Safety & Security Ltd`,
    `T: +44 (0)1344 771569`,
    '',
    '---',
    DISCLAIMER,
  ].join('\n');
}

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

  // ── Public feedback routes (no auth — token is the credential) ────────────

  // GET /api/bug-feedback/:token — look up a report by token
  app.get('/api/bug-feedback/:token', feedbackLimiter, async (req, res) => {
    try {
      const { token } = req.params;
      const [report] = await db
        .select({
          id: bugReports.id,
          reportNumber: bugReports.reportNumber,
          status: bugReports.status,
          reporterFeedback: bugReports.reporterFeedback,
          feedbackTokenExpiresAt: bugReports.feedbackTokenExpiresAt,
        })
        .from(bugReports)
        .where(eq(bugReports.feedbackToken, token))
        .limit(1);

      if (!report) return res.status(404).json({ error: 'Token not found or already used.' });
      if (report.feedbackTokenExpiresAt && report.feedbackTokenExpiresAt < new Date()) {
        return res.status(404).json({ error: 'This link has expired.' });
      }

      const alreadyResponded = report.reporterFeedback !== null;
      return res.json({
        reportNumber: report.reportNumber,
        status: report.status,
        alreadyResponded,
      });
    } catch (error: any) {
      logger.error('[bug-feedback] GET error:', error);
      return res.status(500).json({ error: 'Failed to look up report.' });
    }
  });

  // POST /api/bug-feedback/:token/confirm — reporter says "Yes, it's fixed"
  app.post('/api/bug-feedback/:token/confirm', feedbackLimiter, async (req, res) => {
    try {
      const { token } = req.params;
      const [report] = await db
        .select()
        .from(bugReports)
        .where(eq(bugReports.feedbackToken, token))
        .limit(1);

      if (!report) return res.status(404).json({ error: 'Token not found or already used.' });
      if (report.feedbackTokenExpiresAt && report.feedbackTokenExpiresAt < new Date()) {
        return res.status(404).json({ error: 'This link has expired.' });
      }

      // Idempotent — if already confirmed, just return success
      if (report.reporterFeedback === 'confirmed') {
        return res.json({ ok: true, reportNumber: report.reportNumber });
      }

      const now = new Date();
      await db.update(bugReports).set({
        status: 'closed',
        reporterFeedback: 'confirmed',
        reporterConfirmedAt: now,
        resolvedAt: report.resolvedAt ?? now,
        updatedAt: now,
        feedbackToken: null,
      }).where(eq(bugReports.id, report.id));

      // Notify us (non-fatal)
      try {
        const notifyEmail = process.env.BUG_REPORT_NOTIFY_EMAIL || 'andy@acsltd.eu';
        const emailSvc = new EmailService();
        await emailSvc.sendEmail({
          to: notifyEmail,
          subject: `✅ ${report.reportNumber} — Reporter confirmed fix (auto-closed)`,
          html: `<p style="font-family:Arial,sans-serif"><strong>${report.reportNumber}</strong> was confirmed fixed by the reporter and has been auto-closed.</p>`,
          text: `${report.reportNumber} — Reporter confirmed the fix. Report auto-closed.`,
        });
      } catch (_) { /* non-fatal */ }

      return res.json({ ok: true, reportNumber: report.reportNumber });
    } catch (error: any) {
      logger.error('[bug-feedback] confirm error:', error);
      return res.status(500).json({ error: 'Failed to confirm report.' });
    }
  });

  // POST /api/bug-feedback/:token/reopen — reporter says "Still broken"
  app.post('/api/bug-feedback/:token/reopen', feedbackLimiter, async (req, res) => {
    try {
      const { token } = req.params;
      const { reason, screenshot } = req.body as { reason?: string; screenshot?: string };

      if (!reason || typeof reason !== 'string' || reason.trim().length === 0) {
        return res.status(400).json({ error: 'Please describe what is still wrong.' });
      }
      if (reason.length > 2000) {
        return res.status(400).json({ error: 'Reason too long (max 2000 characters).' });
      }
      if (screenshot) {
        if (!screenshot.startsWith('data:image/')) {
          return res.status(400).json({ error: 'Screenshot must be a valid image data URL.' });
        }
        if (screenshot.length > MAX_ATTACHMENT_BYTES) {
          return res.status(400).json({ error: 'Screenshot too large (max 4MB).' });
        }
      }

      const [report] = await db
        .select()
        .from(bugReports)
        .where(eq(bugReports.feedbackToken, token))
        .limit(1);

      if (!report) return res.status(404).json({ error: 'Token not found or already used.' });
      if (report.feedbackTokenExpiresAt && report.feedbackTokenExpiresAt < new Date()) {
        return res.status(404).json({ error: 'This link has expired.' });
      }

      // Idempotent
      if (report.reporterFeedback === 'still_broken') {
        return res.json({ ok: true, reportNumber: report.reportNumber });
      }

      const now = new Date();
      await db.update(bugReports).set({
        status: 'reopened',
        reporterFeedback: 'still_broken',
        reopenReason: reason.trim(),
        reopenScreenshot: screenshot ?? null,
        reopenedAt: now,
        updatedAt: now,
        feedbackToken: null,
      }).where(eq(bugReports.id, report.id));

      // Alert us (non-fatal)
      try {
        const notifyEmail = process.env.BUG_REPORT_NOTIFY_EMAIL || 'andy@acsltd.eu';
        const emailSvc = new EmailService();
        const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        await emailSvc.sendEmail({
          to: notifyEmail,
          subject: `⚠️ ${report.reportNumber} — Reopened by reporter`,
          html: `
            <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#1e293b">
              <h2 style="color:#b91c1c">⚠️ ${esc(report.reportNumber)} — Reopened by Reporter</h2>
              <p><strong>${esc(report.reporterName || 'The reporter')}</strong> says the issue is still not fixed.</p>
              <h3>Their note:</h3>
              <p style="white-space:pre-wrap;background:#fef2f2;padding:12px;border-radius:4px;border-left:4px solid #b91c1c">${esc(reason.trim())}</p>
              ${screenshot ? '<p><em>A screenshot was attached — view in Platform Admin.</em></p>' : ''}
            </div>
          `,
          text: `${report.reportNumber} — Reopened by reporter.\n\n${report.reporterName || 'Reporter'} says:\n${reason.trim()}${screenshot ? '\n\n[Screenshot attached — view in Platform Admin]' : ''}`,
        });
      } catch (_) { /* non-fatal */ }

      return res.json({ ok: true, reportNumber: report.reportNumber });
    } catch (error: any) {
      logger.error('[bug-feedback] reopen error:', error);
      return res.status(500).json({ error: 'Failed to reopen report.' });
    }
  });

  // ── Platform admin routes ─────────────────────────────────────────────────

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
        resolutionNote: bugReports.resolutionNote,
        reporterNotifiedAt: bugReports.reporterNotifiedAt,
        createdAt: bugReports.createdAt,
        updatedAt: bugReports.updatedAt,
        resolvedAt: bugReports.resolvedAt,
        reporterFeedback: bugReports.reporterFeedback,
        reporterConfirmedAt: bugReports.reporterConfirmedAt,
        reopenReason: bugReports.reopenReason,
        reopenedAt: bugReports.reopenedAt,
        hasReopenScreenshot: sql<boolean>`(${bugReports.reopenScreenshot} IS NOT NULL)`,
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
      // Never send feedbackToken to client (security)
      const { feedbackToken: _ft, ...safeReport } = report;
      return res.json(safeReport);
    } catch (error: any) {
      logger.error('Error fetching bug report:', error);
      return res.status(500).json({ error: 'Failed to load bug report.' });
    }
  });

  // PATCH /platform-admin/bug-reports/:id — update status, adminNotes, and/or resolutionNote
  app.patch('/platform-admin/bug-reports/:id', requirePlatformAdmin, async (req, res) => {
    try {
      const { status, adminNotes, resolutionNote, skipNotification } = req.body;

      if (status !== undefined && !ALLOWED_STATUSES.includes(status)) {
        return res.status(400).json({ error: `Status must be one of: ${ALLOWED_STATUSES.join(', ')}` });
      }

      // Fetch the current record first (needed for fixed-transition email)
      const [current] = await db
        .select()
        .from(bugReports)
        .where(eq(bugReports.id, req.params.id))
        .limit(1);
      if (!current) return res.status(404).json({ error: 'Report not found.' });

      const setData: Record<string, any> = { updatedAt: new Date() };
      if (status !== undefined) {
        setData.status = status;
        setData.resolvedAt = (status === 'fixed' || status === 'closed') ? new Date() : null;
      }
      if (adminNotes !== undefined) setData.adminNotes = adminNotes;
      if (resolutionNote !== undefined) setData.resolutionNote = resolutionNote;

      // Detect fixed transition — only fire notification once per transition
      const isFixedTransition =
        status === 'fixed' &&
        current.status !== 'fixed' &&
        !skipNotification;

      // Allow re-notification when re-fixing a reopened report
      const alreadyNotified = !!current.reporterNotifiedAt && current.status !== 'reopened';

      let emailSent = false;
      let emailSkippedReason: string | null = null;

      if (isFixedTransition && !alreadyNotified) {
        const reporterEmail = current.reporterEmail;
        if (!reporterEmail) {
          emailSkippedReason = 'no_email';
        } else {
          try {
            const emailSvc = new EmailService();
            const resolvedNote = resolutionNote ?? current.resolutionNote ?? null;
            const reporterFirstName = current.reporterName?.split(' ')[0] ?? null;
            const baseUrl = getBaseUrl();
            const feedbackToken = randomBytes(24).toString('base64url');

            // Save token (and reset any prior feedback) before sending email
            setData.feedbackToken = feedbackToken;
            setData.feedbackTokenExpiresAt = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000); // 60 days
            setData.reporterFeedback = null;

            const html = buildFixedEmailHtml({
              reportNumber: current.reportNumber,
              reporterFirstName,
              reporterName: current.reporterName,
              description: current.description,
              resolutionNote: resolvedNote,
              feedbackToken,
              baseUrl,
            });
            const text = buildFixedEmailText({
              reportNumber: current.reportNumber,
              reporterFirstName,
              reporterName: current.reporterName,
              description: current.description,
              resolutionNote: resolvedNote,
              feedbackToken,
              baseUrl,
            });

            const replyToAddr = process.env.BUG_REPORT_REPLY_TO || process.env.BUG_REPORT_NOTIFY_EMAIL || 'andy@acsltd.eu';
            const bccAddr = process.env.BUG_REPORT_NOTIFY_EMAIL || 'andy@acsltd.eu';

            await emailSvc.sendEmail({
              to: reporterEmail,
              subject: `Your TPR issue ${current.reportNumber} has been resolved`,
              fromName: 'ACS Safety & Security — Software Development Team',
              replyTo: replyToAddr,
              bcc: bccAddr,
              html,
              text,
            });

            setData.reporterNotifiedAt = new Date();
            emailSent = true;
            logger.info(`[bug-reports] Fixed notification sent to ${reporterEmail} for ${current.reportNumber}`);
          } catch (emailErr: any) {
            logger.warn('[bug-reports] Fixed notification email failed:', emailErr.message?.substring(0, 80));
            emailSkippedReason = 'send_failed';
            // Don't save feedbackToken if email failed
            delete setData.feedbackToken;
            delete setData.feedbackTokenExpiresAt;
            delete setData.reporterFeedback;
          }
        }
      } else if (isFixedTransition && alreadyNotified) {
        emailSkippedReason = 'already_notified';
      }

      const [updated] = await db
        .update(bugReports)
        .set(setData)
        .where(eq(bugReports.id, req.params.id))
        .returning();

      // Never send feedbackToken back to client
      const { feedbackToken: _ft, ...safeUpdated } = updated;
      return res.json({
        ...safeUpdated,
        emailSent,
        ...(emailSkippedReason ? { emailSkippedReason } : {}),
        ...(emailSent ? { reporterEmail: current.reporterEmail } : {}),
      });
    } catch (error: any) {
      logger.error('Error updating bug report:', error);
      return res.status(500).json({ error: 'Failed to update bug report.' });
    }
  });
}
