import type { Express } from 'express';
import cron from 'node-cron';
import { requireAuth } from '../auth';
import { customerDbService } from '../customerDatabase';
import { simpleDatabaseService } from '../simpleDatabaseService';
import * as isolatedSchema from '../isolatedSchema';
import { EmailService } from '../emailService';
import { eq, and, isNull, isNotNull, lte, sql } from 'drizzle-orm';
import { logger } from '../utils/logger';
import { calculateRIDDORDeadline, getDaysUntilRIDDORDeadline, RIDDOR_CATEGORY_LABELS, type RIDDORCategory } from '../utils/riddorUtils';
import { EXTERNAL_LINKS } from '../utils/externalLinks';

async function ensureHsIncidentsTable(custDb: any, schemaName: string) {
  await custDb.execute(sql.raw(`
    CREATE TABLE IF NOT EXISTS ${schemaName}.hs_incidents (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
      title TEXT NOT NULL,
      description TEXT,
      incident_date TIMESTAMPTZ NOT NULL,
      location TEXT,
      reported_by TEXT,
      injured_person TEXT,
      injured_person_type TEXT,
      is_near_miss BOOLEAN NOT NULL DEFAULT FALSE,
      near_miss_potential TEXT,
      near_miss_hazard_type TEXT,
      riddor_category TEXT,
      riddor_reporting_deadline TIMESTAMPTZ,
      riddor_reported_at TIMESTAMPTZ,
      riddor_reference TEXT,
      riddor_reminder_sent_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `));
}

export function registerHsIncidentRoutes(app: Express): void {

  // GET all H&S incidents
  app.get('/api/hs-incidents', requireAuth, async (req, res) => {
    try {
      const custDb = await customerDbService.getCustomerDatabase(req.customerId!);
      const schemaName = customerDbService.generateSchemaName(req.customerId!);
      await ensureHsIncidentsTable(custDb, schemaName);
      const incidents = await custDb.select().from(isolatedSchema.hsIncidents)
        .orderBy(isolatedSchema.hsIncidents.incidentDate);
      res.json(incidents.reverse());
    } catch (err) {
      logger.error('Error fetching H&S incidents:', err);
      res.status(500).json({ error: 'Failed to fetch incidents' });
    }
  });

  // POST create incident
  app.post('/api/hs-incidents', requireAuth, async (req, res) => {
    try {
      const custDb = await customerDbService.getCustomerDatabase(req.customerId!);
      const schemaName = customerDbService.generateSchemaName(req.customerId!);
      await ensureHsIncidentsTable(custDb, schemaName);

      const body = req.body as any;
      const incidentDate = new Date(body.incidentDate);

      // Near miss auto-sets riddorCategory
      let riddorCategory = body.isNearMiss ? 'not_riddor_reportable' : (body.riddorCategory || null);
      let riddorDeadline: Date | null = null;
      if (riddorCategory && riddorCategory !== 'not_riddor_reportable' && riddorCategory !== 'occupational_disease') {
        riddorDeadline = calculateRIDDORDeadline(riddorCategory as RIDDORCategory, incidentDate);
      }

      const [created] = await custDb.insert(isolatedSchema.hsIncidents).values({
        title: body.title,
        description: body.description || null,
        incidentDate,
        location: body.location || null,
        reportedBy: body.reportedBy || null,
        injuredPerson: body.injuredPerson || null,
        injuredPersonType: body.injuredPersonType || null,
        isNearMiss: !!body.isNearMiss,
        nearMissPotential: body.isNearMiss ? body.nearMissPotential : null,
        nearMissHazardType: body.isNearMiss ? body.nearMissHazardType : null,
        riddorCategory,
        riddorReportingDeadline: riddorDeadline,
      }).returning();

      // Immediate fatality alert
      if (riddorCategory === 'fatality') {
        sendFatalityAlert(req.customerId!, created, incidentDate).catch(err =>
          logger.error('Failed to send fatality alert:', err));
      }

      res.status(201).json(created);
    } catch (err) {
      logger.error('Error creating H&S incident:', err);
      res.status(500).json({ error: 'Failed to create incident' });
    }
  });

  // PUT update incident
  app.put('/api/hs-incidents/:id', requireAuth, async (req, res) => {
    try {
      const custDb = await customerDbService.getCustomerDatabase(req.customerId!);
      const schemaName = customerDbService.generateSchemaName(req.customerId!);
      await ensureHsIncidentsTable(custDb, schemaName);

      const body = req.body as any;
      const incidentDate = body.incidentDate ? new Date(body.incidentDate) : undefined;

      let riddorCategory = body.isNearMiss ? 'not_riddor_reportable' : (body.riddorCategory ?? undefined);
      let riddorDeadline: Date | null | undefined = undefined;
      if (riddorCategory && incidentDate) {
        if (riddorCategory !== 'not_riddor_reportable' && riddorCategory !== 'occupational_disease') {
          riddorDeadline = calculateRIDDORDeadline(riddorCategory as RIDDORCategory, incidentDate);
        } else {
          riddorDeadline = null;
        }
      }

      const updates: Record<string, any> = {
        updatedAt: new Date(),
      };
      if (body.title !== undefined) updates.title = body.title;
      if (body.description !== undefined) updates.description = body.description;
      if (incidentDate) updates.incidentDate = incidentDate;
      if (body.location !== undefined) updates.location = body.location;
      if (body.reportedBy !== undefined) updates.reportedBy = body.reportedBy;
      if (body.injuredPerson !== undefined) updates.injuredPerson = body.injuredPerson;
      if (body.injuredPersonType !== undefined) updates.injuredPersonType = body.injuredPersonType;
      if (body.isNearMiss !== undefined) updates.isNearMiss = !!body.isNearMiss;
      if (body.isNearMiss) {
        updates.nearMissPotential = body.nearMissPotential ?? null;
        updates.nearMissHazardType = body.nearMissHazardType ?? null;
      } else {
        updates.nearMissPotential = null;
        updates.nearMissHazardType = null;
      }
      if (riddorCategory !== undefined) updates.riddorCategory = riddorCategory;
      if (riddorDeadline !== undefined) updates.riddorReportingDeadline = riddorDeadline;

      const [updated] = await custDb.update(isolatedSchema.hsIncidents)
        .set(updates)
        .where(eq(isolatedSchema.hsIncidents.id, req.params.id))
        .returning();

      if (!updated) return res.status(404).json({ error: 'Incident not found' });
      res.json(updated);
    } catch (err) {
      logger.error('Error updating H&S incident:', err);
      res.status(500).json({ error: 'Failed to update incident' });
    }
  });

  // DELETE incident
  app.delete('/api/hs-incidents/:id', requireAuth, async (req, res) => {
    try {
      const custDb = await customerDbService.getCustomerDatabase(req.customerId!);
      await custDb.delete(isolatedSchema.hsIncidents)
        .where(eq(isolatedSchema.hsIncidents.id, req.params.id));
      res.json({ success: true });
    } catch (err) {
      logger.error('Error deleting H&S incident:', err);
      res.status(500).json({ error: 'Failed to delete incident' });
    }
  });

  // PATCH mark as reported to HSE
  app.patch('/api/hs-incidents/:id/riddor-reported', requireAuth, async (req, res) => {
    try {
      const custDb = await customerDbService.getCustomerDatabase(req.customerId!);
      const { reference } = req.body as { reference: string };
      const [updated] = await custDb.update(isolatedSchema.hsIncidents)
        .set({ riddorReportedAt: new Date(), riddorReference: reference, updatedAt: new Date() })
        .where(eq(isolatedSchema.hsIncidents.id, req.params.id))
        .returning();
      if (!updated) return res.status(404).json({ error: 'Incident not found' });
      res.json(updated);
    } catch (err) {
      logger.error('Error marking RIDDOR reported:', err);
      res.status(500).json({ error: 'Failed to update' });
    }
  });

  // ── RIDDOR Reminder Cron (daily at 07:00 Europe/London) ──────────────────
  const riddorAlertHour = parseInt(process.env.PPM_ALERT_HOUR ?? '7', 10);
  cron.schedule(`0 ${riddorAlertHour} * * *`, async () => {
    try {
      logger.info('[RIDDOR Cron] Running daily RIDDOR reminder check…');
      const allCustomers = await customerDbService.getAllCustomers();
      for (const customer of allCustomers) {
        try {
          const custDb = await customerDbService.getCustomerDatabase(customer.id);
          const schemaName = customerDbService.generateSchemaName(customer.id);
          await ensureHsIncidentsTable(custDb, schemaName);

          const incidents = await custDb.select().from(isolatedSchema.hsIncidents)
            .where(and(
              isNotNull(isolatedSchema.hsIncidents.riddorCategory),
              isNull(isolatedSchema.hsIncidents.riddorReportedAt),
              isNull(isolatedSchema.hsIncidents.riddorReminderSentAt),
              isNotNull(isolatedSchema.hsIncidents.riddorReportingDeadline),
            ));

          const now = new Date();
          const fiveDaysMs = 5 * 24 * 60 * 60 * 1000;
          const oneDayMs = 24 * 60 * 60 * 1000;

          const toRemind = incidents.filter(i => {
            const cat = i.riddorCategory;
            if (!cat || cat === 'not_riddor_reportable' || cat === 'occupational_disease') return false;
            const deadline = i.riddorReportingDeadline;
            if (!deadline) return false;
            const dl = new Date(deadline);
            const msUntil = dl.getTime() - now.getTime();
            return msUntil <= fiveDaysMs && msUntil > -oneDayMs;
          });

          if (toRemind.length === 0) continue;

          const settingsRows = await custDb.execute(sql.raw(`SELECT company_name, email, site_name FROM ${schemaName}.company_settings LIMIT 1`));
          const settings = settingsRows.rows[0] as any;
          const companyName = settings?.company_name || 'TPR Max';
          const siteName = settings?.site_name || companyName;
          const adminEmail = settings?.email as string | undefined;
          if (!adminEmail) continue;

          const emailSvc = new EmailService(customer.id);
          for (const incident of toRemind) {
            const deadline = new Date(incident.riddorReportingDeadline!);
            const daysLeft = getDaysUntilRIDDORDeadline(deadline);
            const categoryLabel = RIDDOR_CATEGORY_LABELS[incident.riddorCategory as RIDDORCategory] || incident.riddorCategory;

            await emailSvc.sendEmail({
              to: adminEmail,
              subject: `⚠ RIDDOR Reporting Reminder — Action Required`,
              companyName,
              html: `
                <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
                  <div style="background:#b45309;color:#fff;padding:20px;border-radius:8px 8px 0 0">
                    <h2 style="margin:0">⚠ RIDDOR Reporting Reminder</h2>
                    <p style="margin:4px 0 0">Action required — ${companyName}</p>
                  </div>
                  <div style="background:#fff;padding:20px;border:1px solid #e5e7eb">
                    <p>This is an automated reminder from TPR Max.</p>
                    <p>An incident recorded on <strong>${new Date(incident.incidentDate).toLocaleDateString('en-GB')}</strong> at <strong>${siteName}</strong> may require reporting to the HSE under RIDDOR 2013.</p>
                    <table style="width:100%;border-collapse:collapse;margin:16px 0">
                      <tr><td style="padding:6px;border:1px solid #e5e7eb;font-weight:bold;background:#f9fafb">Incident</td><td style="padding:6px;border:1px solid #e5e7eb">${incident.title}</td></tr>
                      <tr><td style="padding:6px;border:1px solid #e5e7eb;font-weight:bold;background:#f9fafb">Category</td><td style="padding:6px;border:1px solid #e5e7eb">${categoryLabel}</td></tr>
                      <tr><td style="padding:6px;border:1px solid #e5e7eb;font-weight:bold;background:#f9fafb">Reporting deadline</td><td style="padding:6px;border:1px solid #e5e7eb;color:${daysLeft <= 2 ? '#dc2626' : '#b45309'}">${deadline.toLocaleDateString('en-GB')}</td></tr>
                      <tr><td style="padding:6px;border:1px solid #e5e7eb;font-weight:bold;background:#f9fafb">Days remaining</td><td style="padding:6px;border:1px solid #e5e7eb;color:${daysLeft <= 2 ? '#dc2626' : '#b45309'};font-weight:bold">${daysLeft <= 0 ? 'OVERDUE' : `${daysLeft} days`}</td></tr>
                    </table>
                    <p>To report this incident to the HSE, visit:<br><a href="${EXTERNAL_LINKS.riddor.report}">${EXTERNAL_LINKS.riddor.report}</a></p>
                    <p>Once reported, log in to TPR Max and mark this incident as reported to record your HSE reference number.</p>
                    <p style="color:#6b7280;font-size:12px">This reminder will not be sent again for this incident.</p>
                  </div>
                </div>
              `,
              text: `RIDDOR Reporting Reminder\n\nIncident: ${incident.title}\nDate: ${new Date(incident.incidentDate).toLocaleDateString('en-GB')}\nCategory: ${categoryLabel}\nDeadline: ${deadline.toLocaleDateString('en-GB')}\nDays remaining: ${daysLeft <= 0 ? 'OVERDUE' : daysLeft}\n\nReport to HSE: ${EXTERNAL_LINKS.riddor.report}`,
            });

            await custDb.update(isolatedSchema.hsIncidents)
              .set({ riddorReminderSentAt: now })
              .where(eq(isolatedSchema.hsIncidents.id, incident.id));

            logger.info(`[RIDDOR Cron] Reminder sent for incident ${incident.id} (customer ${customer.id})`);
          }
        } catch (custErr) {
          logger.error(`[RIDDOR Cron] Error for customer ${customer.id}:`, custErr);
        }
      }
      logger.info('[RIDDOR Cron] Daily check complete');
    } catch (err) {
      logger.error('[RIDDOR Cron] Fatal error:', err);
    }
  }, { timezone: 'Europe/London' });
}

async function sendFatalityAlert(customerId: string, incident: any, incidentDate: Date) {
  const custDb = await customerDbService.getCustomerDatabase(customerId);
  const schemaName = customerDbService.generateSchemaName(customerId);
  const settingsRows = await custDb.execute(sql.raw(`SELECT company_name, email, site_name FROM ${schemaName}.company_settings LIMIT 1`));
  const settings = settingsRows.rows[0] as any;
  const companyName = settings?.company_name || 'TPR Max';
  const siteName = settings?.site_name || companyName;
  const adminEmail = settings?.email as string | undefined;
  if (!adminEmail) return;

  const emailSvc = new EmailService(customerId);
  await emailSvc.sendEmail({
    to: adminEmail,
    subject: `🚨 URGENT — Fatal Incident Requires Immediate HSE Notification`,
    companyName,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
        <div style="background:#dc2626;color:#fff;padding:20px;border-radius:8px 8px 0 0">
          <h2 style="margin:0">🚨 URGENT — Fatal Incident Recorded</h2>
          <p style="margin:4px 0 0">${companyName} — Immediate action required</p>
        </div>
        <div style="background:#fff;padding:20px;border:1px solid #e5e7eb">
          <p><strong>A fatal incident has been recorded in TPR Max for ${siteName}.</strong></p>
          <p>Under RIDDOR 2013, fatalities must be reported to the HSE <strong>immediately (same day)</strong>.</p>
          <table style="width:100%;border-collapse:collapse;margin:16px 0">
            <tr><td style="padding:6px;border:1px solid #e5e7eb;font-weight:bold;background:#fef2f2">Incident</td><td style="padding:6px;border:1px solid #e5e7eb">${incident.title}</td></tr>
            <tr><td style="padding:6px;border:1px solid #e5e7eb;font-weight:bold;background:#fef2f2">Date</td><td style="padding:6px;border:1px solid #e5e7eb">${incidentDate.toLocaleDateString('en-GB')}</td></tr>
            <tr><td style="padding:6px;border:1px solid #e5e7eb;font-weight:bold;background:#fef2f2">Site</td><td style="padding:6px;border:1px solid #e5e7eb">${siteName}</td></tr>
          </table>
          <p style="font-size:16px"><strong>Report to HSE NOW:</strong><br><a href="${EXTERNAL_LINKS.riddor.report}" style="color:#dc2626">${EXTERNAL_LINKS.riddor.report}</a></p>
          <p>You can also call the HSE Incident Contact Centre on <strong>${EXTERNAL_LINKS.riddor.contactCentrePhone}</strong> (${EXTERNAL_LINKS.riddor.contactCentreHours}).</p>
          <p>Once reported, log in to TPR Max and mark this incident as reported to record your HSE reference number.</p>
        </div>
      </div>
    `,
    text: `URGENT — Fatal Incident Requires Immediate HSE Notification\n\nIncident: ${incident.title}\nDate: ${incidentDate.toLocaleDateString('en-GB')}\nSite: ${siteName}\n\nReport to HSE immediately: ${EXTERNAL_LINKS.riddor.report}\nHSE Incident Contact Centre: ${EXTERNAL_LINKS.riddor.contactCentrePhone} (${EXTERNAL_LINKS.riddor.contactCentreHours})`,
  });
}
