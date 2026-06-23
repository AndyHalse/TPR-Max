/**
 * Enterprise Schedule Runner — Phase 5b
 * ======================================
 * Runs every minute (Europe/London). Checks all enabled scheduled reports
 * for all enterprise customers and fires those whose time+day has come.
 * Deduplicates by comparing lastRunAt to minimum cadence intervals.
 */

import cron from 'node-cron';
import { eq, and, sql } from 'drizzle-orm';
import { customerDbService } from './customerDatabase';
import * as iso from './isolatedSchema';
import { generateReport, type ReportType } from './enterpriseReportService';
import { EmailService } from './emailService';
import { logger } from './utils/logger';

// ─── London time helpers ──────────────────────────────────────────────────────

function getLondonTimeParts(): {
  hour: number;
  minute: number;
  dayOfWeek: number; // 1=Mon…7=Sun
  dayOfMonth: number;
} {
  const now = new Date();
  const fmt = (opts: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', ...opts }).format(now);

  const hour       = parseInt(fmt({ hour: 'numeric', hour12: false }));
  const minute     = parseInt(fmt({ minute: 'numeric' }));
  const dayOfMonth = parseInt(fmt({ day: 'numeric' }));
  const weekdayStr = fmt({ weekday: 'long' }).toLowerCase();

  const dayMap: Record<string, number> = {
    monday: 1, tuesday: 2, wednesday: 3, thursday: 4,
    friday: 5, saturday: 6, sunday: 7,
  };
  const dayOfWeek = dayMap[weekdayStr] ?? 1;

  return { hour, minute, dayOfWeek, dayOfMonth };
}

/** Minimum gap (minutes) before a schedule may re-fire. */
const MIN_GAP_MINUTES: Record<string, number> = {
  daily:   23 * 60,       // 1380 min
  weekly:  6  * 24 * 60,  // 8640 min
  monthly: 27 * 24 * 60,  // 38880 min
};

function isDue(
  schedule: typeof iso.scheduledReports.$inferSelect,
  now: { hour: number; minute: number; dayOfWeek: number; dayOfMonth: number },
): boolean {
  // Hour + minute must match
  if (schedule.runAtHour !== now.hour || schedule.runAtMinute !== now.minute) return false;

  // Day constraint
  if (schedule.frequency === 'weekly' && schedule.dayOfWeek !== null) {
    if (schedule.dayOfWeek !== now.dayOfWeek) return false;
  }
  if (schedule.frequency === 'monthly' && schedule.dayOfMonth !== null) {
    if (schedule.dayOfMonth !== now.dayOfMonth) return false;
  }

  // Deduplication — don't re-fire if we ran too recently
  if (schedule.lastRunAt) {
    const gapMs = (MIN_GAP_MINUTES[schedule.frequency] ?? 23 * 60) * 60 * 1000;
    const elapsed = Date.now() - new Date(schedule.lastRunAt).getTime();
    if (elapsed < gapMs) return false;
  }

  return true;
}

// ─── Critical-issues check ────────────────────────────────────────────────────

async function hasCriticalAlerts(db: any): Promise<boolean> {
  try {
    const rows = await db
      .select({ id: iso.complianceAlerts.id })
      .from(iso.complianceAlerts)
      .where(
        and(
          eq(iso.complianceAlerts.severity, 'critical'),
          eq(iso.complianceAlerts.status, 'open'),
        ),
      )
      .limit(1);
    return rows.length > 0;
  } catch {
    return false;
  }
}

// ─── Email body builder ───────────────────────────────────────────────────────

function buildEmailHtml(schedule: typeof iso.scheduledReports.$inferSelect, companyName: string): string {
  const freq = schedule.frequency.charAt(0).toUpperCase() + schedule.frequency.slice(1);
  return `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px">
      <div style="background:#1e3a5f;padding:20px 24px;border-radius:8px 8px 0 0">
        <h1 style="color:#fff;margin:0;font-size:18px">${companyName}</h1>
        <p style="color:#93c5fd;margin:4px 0 0;font-size:13px">Scheduled Report</p>
      </div>
      <div style="background:#f8fafc;padding:24px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 8px 8px">
        <h2 style="color:#1e3a5f;font-size:16px;margin:0 0 12px">${schedule.reportTitle}</h2>
        <p style="color:#64748b;font-size:14px;margin:0 0 16px">
          Your ${freq.toLowerCase()} scheduled report is attached as a PDF.
        </p>
        <table style="width:100%;border-collapse:collapse;font-size:13px">
          <tr>
            <td style="padding:6px 12px;background:#e0e7ef;color:#1e3a5f;font-weight:600;border-radius:4px 0 0 4px">Type</td>
            <td style="padding:6px 12px;background:#f1f5f9;border-radius:0 4px 4px 0">${schedule.reportType.replace(/_/g, ' ')}</td>
          </tr>
          <tr><td colspan="2" style="padding:3px"></td></tr>
          <tr>
            <td style="padding:6px 12px;background:#e0e7ef;color:#1e3a5f;font-weight:600;border-radius:4px 0 0 4px">Frequency</td>
            <td style="padding:6px 12px;background:#f1f5f9;border-radius:0 4px 4px 0">${freq}</td>
          </tr>
          <tr><td colspan="2" style="padding:3px"></td></tr>
          <tr>
            <td style="padding:6px 12px;background:#e0e7ef;color:#1e3a5f;font-weight:600;border-radius:4px 0 0 4px">Generated</td>
            <td style="padding:6px 12px;background:#f1f5f9;border-radius:0 4px 4px 0">${new Date().toLocaleString('en-GB', { timeZone: 'Europe/London', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</td>
          </tr>
        </table>
        <p style="color:#94a3b8;font-size:11px;margin:20px 0 0">
          This is an automated scheduled report from TPR Max. To unsubscribe, ask your administrator to remove you from this schedule.
        </p>
      </div>
    </div>
  `.trim();
}

// ─── Runner ───────────────────────────────────────────────────────────────────

async function runScheduler(): Promise<void> {
  const timeParts = getLondonTimeParts();

  let customers: { id: string }[] = [];
  try {
    customers = await customerDbService.getAllCustomers();
  } catch (err: any) {
    logger.error('[ScheduleRunner] Could not fetch customers:', err.message);
    return;
  }

  for (const customer of customers) {
    try {
      const db = await customerDbService.getCustomerDatabase(customer.id);

      // Load all enabled schedules
      const schedules = await db
        .select()
        .from(iso.scheduledReports)
        .where(eq(iso.scheduledReports.enabled, true));

      for (const schedule of schedules) {
        if (!isDue(schedule, timeParts)) continue;

        logger.info(`[ScheduleRunner] Firing schedule "${schedule.reportTitle}" (${schedule.id}) for customer ${customer.id}`);

        // Mark as running immediately (prevents double-fire if this iteration is slow)
        await db
          .update(iso.scheduledReports)
          .set({ lastRunAt: new Date(), lastRunStatus: 'running' as any, updatedAt: new Date() })
          .where(eq(iso.scheduledReports.id, schedule.id));

        try {
          // Critical-issues digest: skip if no open critical alerts
          if (schedule.reportType === 'critical_issues_digest') {
            const hasCritical = await hasCriticalAlerts(db);
            if (!hasCritical) {
              logger.info(`[ScheduleRunner] Skipping critical_issues_digest — no open critical alerts for ${customer.id}`);
              await db
                .update(iso.scheduledReports)
                .set({ lastRunStatus: 'skipped', updatedAt: new Date() })
                .where(eq(iso.scheduledReports.id, schedule.id));
              continue;
            }
          }

          // Generate PDF
          const params = (schedule.parameters ?? {}) as Record<string, any>;
          const pdfBuffer = await generateReport(
            customer.id,
            schedule.reportType as ReportType,
            params,
          );

          // Get company name for email
          let companyName = 'TPR Max';
          try {
            const settings = await db
              .select({ companyName: iso.companySettings.companyName })
              .from(iso.companySettings)
              .limit(1);
            companyName = settings[0]?.companyName ?? 'TPR Max';
          } catch { /* fallback */ }

          // Send to each recipient
          const recipients = Array.isArray(schedule.recipients)
            ? (schedule.recipients as string[])
            : [];

          const emailSvc = new EmailService(customer.id);
          const dateStr = new Date().toLocaleString('en-GB', {
            timeZone: 'Europe/London',
            day: '2-digit', month: 'short', year: 'numeric',
          });

          let allSent = true;
          for (const recipient of recipients) {
            if (!recipient || typeof recipient !== 'string') continue;
            const sent = await emailSvc.sendEmail({
              to: recipient,
              subject: `${schedule.reportTitle} — ${dateStr}`,
              html: buildEmailHtml(schedule, companyName),
              text: `Your scheduled report "${schedule.reportTitle}" is attached.`,
              companyName,
              attachments: [
                {
                  filename: `${schedule.reportTitle.replace(/[^a-z0-9]/gi, '-').toLowerCase()}-${new Date().toISOString().slice(0, 10)}.pdf`,
                  content: pdfBuffer,
                  contentType: 'application/pdf',
                },
              ],
            });
            if (!sent) allSent = false;
          }

          // Record in enterprise_reports history
          try {
            await db.insert(iso.enterpriseReports).values({
              id: crypto.randomUUID(),
              reportType: schedule.reportType,
              reportTitle: `${schedule.reportTitle} (Scheduled)`,
              scope: schedule.scope as any,
              scopeId: schedule.scopeId ?? null,
              parameters: params,
              generatedBy: schedule.createdBy ?? 'scheduler',
              generatedByName: `Scheduled — ${schedule.frequency}`,
              status: 'ready',
              storagePath: null,
              fileSizeBytes: pdfBuffer.length,
              errorMessage: null,
              createdAt: new Date(),
              completedAt: new Date(),
            });
          } catch { /* non-fatal */ }

          await db
            .update(iso.scheduledReports)
            .set({
              lastRunAt: new Date(),
              lastRunStatus: allSent ? 'sent' : 'partial',
              lastRunError: null,
              updatedAt: new Date(),
            })
            .where(eq(iso.scheduledReports.id, schedule.id));

          logger.info(`[ScheduleRunner] ✅ "${schedule.reportTitle}" sent to ${recipients.length} recipient(s) for ${customer.id}`);

        } catch (genErr: any) {
          logger.error(`[ScheduleRunner] ❌ Failed to generate/send "${schedule.reportTitle}":`, genErr.message);
          await db
            .update(iso.scheduledReports)
            .set({
              lastRunStatus: 'failed',
              lastRunError: genErr.message?.substring(0, 200),
              updatedAt: new Date(),
            })
            .where(eq(iso.scheduledReports.id, schedule.id));
        }
      }
    } catch (err: any) {
      logger.error(`[ScheduleRunner] Error processing customer ${customer.id}:`, err.message);
    }
  }
}

// ─── Boot ─────────────────────────────────────────────────────────────────────

export function startEnterpriseScheduleRunner(): void {
  // Run every minute, London timezone
  cron.schedule('* * * * *', () => {
    runScheduler().catch(err =>
      logger.error('[ScheduleRunner] Unhandled error in runner:', err),
    );
  }, { timezone: 'Europe/London' });

  logger.info('[ScheduleRunner] Enterprise schedule runner started (every minute, Europe/London)');
}
