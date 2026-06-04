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
  const pool = (custDb as any).$client ?? (custDb as any).session?.client;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS "${schemaName}".hs_incidents (
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
  `);
  // BBS columns (idempotent ALTER TABLE — safe to run on every request)
  await pool.query(`ALTER TABLE "${schemaName}".hs_incidents ADD COLUMN IF NOT EXISTS record_type TEXT NOT NULL DEFAULT 'incident'`);
  await pool.query(`ALTER TABLE "${schemaName}".hs_incidents ADD COLUMN IF NOT EXISTS hazard_type TEXT`);
  await pool.query(`ALTER TABLE "${schemaName}".hs_incidents ADD COLUMN IF NOT EXISTS resolved BOOLEAN NOT NULL DEFAULT FALSE`);
  await pool.query(`ALTER TABLE "${schemaName}".hs_incidents ADD COLUMN IF NOT EXISTS resolved_by TEXT`);
  await pool.query(`ALTER TABLE "${schemaName}".hs_incidents ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ`);
  await pool.query(`ALTER TABLE "${schemaName}".hs_incidents ADD COLUMN IF NOT EXISTS resolution_notes TEXT`);
  // Migrate legacy near_miss records to new record_type field
  await pool.query(`UPDATE "${schemaName}".hs_incidents SET record_type = 'near_miss' WHERE is_near_miss = TRUE AND record_type = 'incident'`);
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
      const recordType: string = body.recordType || (body.isNearMiss ? 'near_miss' : 'incident');
      const isBbs = recordType === 'good_spot' || recordType === 'positive_action';
      const isNearMiss = recordType === 'near_miss';

      // Near miss auto-sets riddorCategory; BBS types are never RIDDOR
      let riddorCategory: string | null = null;
      if (isBbs) {
        riddorCategory = null;
      } else if (isNearMiss) {
        riddorCategory = 'not_riddor_reportable';
      } else {
        riddorCategory = body.riddorCategory || null;
      }

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
        injuredPerson: isBbs ? null : (body.injuredPerson || null),
        injuredPersonType: isBbs ? null : (body.injuredPersonType || null),
        isNearMiss,
        nearMissPotential: isNearMiss ? (body.nearMissPotential || null) : null,
        nearMissHazardType: isNearMiss ? (body.nearMissHazardType || null) : null,
        riddorCategory,
        riddorReportingDeadline: riddorDeadline,
        recordType,
        hazardType: isBbs ? (body.hazardType || null) : null,
        resolved: isBbs ? !!body.resolved : false,
        resolvedBy: isBbs ? (body.resolvedBy || null) : null,
        resolvedAt: (isBbs && body.resolvedAt) ? new Date(body.resolvedAt) : null,
        resolutionNotes: isBbs ? (body.resolutionNotes || null) : null,
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
      const recordType: string = body.recordType || (body.isNearMiss ? 'near_miss' : 'incident');
      const isBbs = recordType === 'good_spot' || recordType === 'positive_action';
      const isNearMiss = recordType === 'near_miss';

      let riddorCategory: string | null | undefined = undefined;
      if (isBbs) {
        riddorCategory = null;
      } else if (isNearMiss) {
        riddorCategory = 'not_riddor_reportable';
      } else {
        riddorCategory = body.riddorCategory ?? undefined;
      }

      let riddorDeadline: Date | null | undefined = undefined;
      if (riddorCategory !== undefined && incidentDate) {
        if (riddorCategory && riddorCategory !== 'not_riddor_reportable' && riddorCategory !== 'occupational_disease') {
          riddorDeadline = calculateRIDDORDeadline(riddorCategory as RIDDORCategory, incidentDate);
        } else {
          riddorDeadline = null;
        }
      }

      const updates: Record<string, any> = { updatedAt: new Date(), recordType, isNearMiss };
      if (body.title !== undefined) updates.title = body.title;
      if (body.description !== undefined) updates.description = body.description;
      if (incidentDate) updates.incidentDate = incidentDate;
      if (body.location !== undefined) updates.location = body.location;
      if (body.reportedBy !== undefined) updates.reportedBy = body.reportedBy;
      updates.injuredPerson = isBbs ? null : (body.injuredPerson ?? null);
      updates.injuredPersonType = isBbs ? null : (body.injuredPersonType ?? null);
      updates.nearMissPotential = isNearMiss ? (body.nearMissPotential ?? null) : null;
      updates.nearMissHazardType = isNearMiss ? (body.nearMissHazardType ?? null) : null;
      updates.hazardType = isBbs ? (body.hazardType ?? null) : null;
      if (riddorCategory !== undefined) updates.riddorCategory = riddorCategory;
      if (riddorDeadline !== undefined) updates.riddorReportingDeadline = riddorDeadline;
      if (isBbs) {
        updates.resolved = !!body.resolved;
        updates.resolvedBy = body.resolvedBy ?? null;
        updates.resolvedAt = body.resolvedAt ? new Date(body.resolvedAt) : null;
        updates.resolutionNotes = body.resolutionNotes ?? null;
      }

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

  // PATCH resolve a Good Spot or Positive Action
  app.patch('/api/hs-incidents/:id/resolve', requireAuth, async (req, res) => {
    try {
      const custDb = await customerDbService.getCustomerDatabase(req.customerId!);
      const { resolvedBy, resolutionNotes } = req.body as { resolvedBy: string; resolutionNotes: string };
      const [updated] = await custDb.update(isolatedSchema.hsIncidents)
        .set({ resolved: true, resolvedBy: resolvedBy || null, resolvedAt: new Date(), resolutionNotes: resolutionNotes || null, updatedAt: new Date() })
        .where(eq(isolatedSchema.hsIncidents.id, req.params.id))
        .returning();
      if (!updated) return res.status(404).json({ error: 'Record not found' });
      res.json(updated);
    } catch (err) {
      logger.error('Error resolving Good Spot:', err);
      res.status(500).json({ error: 'Failed to resolve' });
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

  // GET PDF report for a single incident
  app.get('/api/hs-incidents/:id/pdf', requireAuth, async (req, res) => {
    try {
      const custDb = await customerDbService.getCustomerDatabase(req.customerId!);
      const schemaName = customerDbService.generateSchemaName(req.customerId!);
      await ensureHsIncidentsTable(custDb, schemaName);

      const [incident] = await custDb.select().from(isolatedSchema.hsIncidents)
        .where(eq(isolatedSchema.hsIncidents.id, req.params.id));
      if (!incident) return res.status(404).json({ error: 'Incident not found' });

      const settingsRows = await custDb.execute(sql.raw(`SELECT company_name, address FROM ${schemaName}.company_settings LIMIT 1`));
      const settings = settingsRows.rows[0] as any;
      const companyName = settings?.company_name || 'TPR Max';
      const siteName = companyName;
      const address = settings?.address || '';

      const esc = (s: any) => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
      const dateStr = new Date().toLocaleDateString('en-GB', { weekday:'long', year:'numeric', month:'long', day:'numeric' });
      const incidentDateStr = new Date(incident.incidentDate).toLocaleDateString('en-GB', { day:'numeric', month:'long', year:'numeric', hour:'2-digit', minute:'2-digit' });

      const RIDDOR_LABELS: Record<string,string> = {
        fatality: 'Fatality',
        specified_injury: 'Specified Injury',
        over_7_day: 'Over-7-Day Incapacitation',
        dangerous_occurrence: 'Dangerous Occurrence',
        occupational_disease: 'Occupational Disease',
        not_riddor_reportable: 'Confirmed Not RIDDOR Reportable',
      };
      const HAZARD_LABELS: Record<string,string> = {
        slip_trip_fall:'Slip, trip or fall', struck_by_object:'Struck by object',
        manual_handling:'Manual handling', vehicle_plant:'Vehicle or plant',
        working_at_height:'Working at height', electrical:'Electrical',
        fire_explosion:'Fire or explosion', chemical_substance:'Chemical or substance',
        machinery:'Machinery', other:'Other',
      };
      const SEVERITY_LABELS: Record<string,string> = { minor:'Minor — First aid level', serious:'Serious — Hospital treatment required', critical:'Critical — Life-threatening or fatality' };

      const personTypeLabel = (v: string) => {
        if (v === 'staff' || v === 'employee') return 'Staff';
        if (v === 'contractor') return 'Contractor';
        if (v === 'visitor') return 'Visitor';
        if (v === 'member_of_public') return 'Member of Public';
        return v;
      };

      const row = (label: string, value: string, highlight = false) =>
        value ? `<tr><td class="label">${esc(label)}</td><td class="${highlight ? 'value-alert' : 'value'}">${esc(value)}</td></tr>` : '';

      const riddorStatus = incident.riddorReportedAt
        ? `Reported to HSE on ${new Date(incident.riddorReportedAt).toLocaleDateString('en-GB')}${incident.riddorReference ? ` — Ref: ${incident.riddorReference}` : ''}`
        : incident.riddorReportingDeadline
          ? `Pending — deadline ${new Date(incident.riddorReportingDeadline).toLocaleDateString('en-GB')}`
          : 'Not yet assessed';

      const isBbsRecord = incident.recordType === 'good_spot' || incident.recordType === 'positive_action';
      const reportTitle = isBbsRecord ? 'POSITIVE SAFETY REPORT' : 'WORKPLACE INCIDENT REPORT';
      const refPrefix = isBbsRecord ? 'BBS' : 'IR';

      let bannerClass = 'standard';
      let bannerText = '✓ Workplace Incident Report';
      if (isBbsRecord) {
        bannerClass = 'good-spot';
        bannerText = incident.recordType === 'good_spot'
          ? '✓ GOOD SPOT — Hazard identified and reported'
          : '✓ POSITIVE ACTION — Hazard identified and resolved';
      } else if (incident.isNearMiss) {
        bannerClass = 'near-miss';
        bannerText = '⚠ NEAR MISS REPORT — No injury occurred but potential hazard identified';
      } else if (incident.riddorCategory && incident.riddorCategory !== 'not_riddor_reportable') {
        bannerClass = 'riddor';
        bannerText = `⚠ RIDDOR 2013 — ${esc(RIDDOR_LABELS[incident.riddorCategory] || incident.riddorCategory)}`;
      }

      const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>${reportTitle} — ${esc(incident.title)}</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family: Arial, Helvetica, sans-serif; font-size:11px; color:#1f2937; background:#fff; }
  .header { background:#1e3a5f; color:#fff; padding:20px 24px; display:flex; justify-content:space-between; align-items:flex-start; }
  .header-left h1 { font-size:20px; font-weight:700; letter-spacing:-0.5px; }
  .header-left p { font-size:11px; opacity:0.8; margin-top:3px; }
  .header-right { text-align:right; font-size:10px; opacity:0.85; line-height:1.6; }
  .type-banner { padding:8px 24px; font-size:12px; font-weight:600; }
  .type-banner.riddor { background:#fef3c7; color:#92400e; border-bottom:2px solid #f59e0b; }
  .type-banner.near-miss { background:#dbeafe; color:#1e40af; border-bottom:2px solid #3b82f6; }
  .type-banner.standard { background:#f0fdf4; color:#166534; border-bottom:2px solid #22c55e; }
  .type-banner.good-spot { background:#f0fdf4; color:#166534; border-bottom:2px solid #22c55e; }
  .section { margin:16px 24px 0; }
  .section-title { font-size:12px; font-weight:700; color:#1e3a5f; text-transform:uppercase; letter-spacing:0.5px; border-bottom:2px solid #1e3a5f; padding-bottom:4px; margin-bottom:8px; }
  table { width:100%; border-collapse:collapse; }
  td { padding:6px 8px; border:1px solid #e5e7eb; vertical-align:top; }
  td.label { background:#f9fafb; font-weight:600; color:#374151; width:32%; }
  td.value { color:#1f2937; }
  td.value-alert { color:#b91c1c; font-weight:600; }
  .description-box { background:#f9fafb; border:1px solid #e5e7eb; border-radius:4px; padding:10px; margin-top:8px; min-height:60px; font-size:11px; line-height:1.6; white-space:pre-wrap; }
  .riddor-box { margin:16px 24px 0; background:#fef3c7; border:1px solid #f59e0b; border-radius:6px; padding:12px 14px; }
  .riddor-box .riddor-title { font-weight:700; color:#92400e; font-size:12px; margin-bottom:6px; }
  .near-miss-box { margin:16px 24px 0; background:#dbeafe; border:1px solid #93c5fd; border-radius:6px; padding:12px 14px; }
  .near-miss-box .nm-title { font-weight:700; color:#1e40af; font-size:12px; margin-bottom:6px; }
  .bbs-box { margin:16px 24px 0; background:#f0fdf4; border:1px solid #86efac; border-radius:6px; padding:12px 14px; }
  .bbs-box .bbs-title { font-weight:700; color:#166534; font-size:12px; margin-bottom:6px; }
  .action-box { margin:16px 24px 0; background:#f0fdf4; border:1px solid #86efac; border-radius:6px; padding:12px 14px; }
  .sig-section { margin:20px 24px 0; display:flex; gap:40px; }
  .sig-box { flex:1; }
  .sig-line { border-bottom:1px solid #9ca3af; margin-top:30px; margin-bottom:4px; }
  .sig-label { font-size:10px; color:#6b7280; }
  .footer { margin-top:24px; padding:12px 24px; border-top:1px solid #e5e7eb; font-size:9px; color:#9ca3af; display:flex; justify-content:space-between; }
  @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
</style>
</head>
<body>

<div class="header">
  <div class="header-left">
    <h1>${esc(companyName)}</h1>
    <p>${esc(siteName)}${address ? ` · ${esc(address)}` : ''}</p>
  </div>
  <div class="header-right">
    <strong>${reportTitle}</strong><br>
    Ref: ${refPrefix}-${esc(incident.id.slice(0,8).toUpperCase())}<br>
    Generated: ${dateStr}
  </div>
</div>

<div class="type-banner ${bannerClass}">
  ${bannerText}
</div>

<div class="section">
  <div class="section-title">${isBbsRecord ? 'Observation Details' : 'Incident Details'}</div>
  <table>
    ${row(isBbsRecord ? 'Observation title' : 'Incident title', incident.title)}
    ${row('Date &amp; time', incidentDateStr)}
    ${row('Location', incident.location || '')}
    ${row('Reported by', incident.reportedBy || '')}
  </table>
</div>

${!isBbsRecord ? `
<div class="section">
  <div class="section-title">Person Involved</div>
  <table>
    ${row('Injured / involved person', incident.injuredPerson || 'Not recorded')}
    ${row('Person type', incident.injuredPersonType ? personTypeLabel(incident.injuredPersonType) : '')}
  </table>
</div>` : ''}

${incident.description ? `
<div class="section">
  <div class="section-title">${isBbsRecord ? 'Observation Description' : 'Description of Incident'}</div>
  <div class="description-box">${esc(incident.description)}</div>
</div>` : ''}

${isBbsRecord ? `
<div class="bbs-box">
  <div class="bbs-title">${incident.recordType === 'good_spot' ? 'Good Spot — Hazard Identified' : 'Positive Action — Hazard Identified &amp; Resolved'}</div>
  <table>
    ${row('Hazard type', incident.hazardType ? HAZARD_LABELS[incident.hazardType] || incident.hazardType : 'Not specified')}
    ${row('Status', incident.resolved ? `Resolved by ${esc(incident.resolvedBy || 'N/A')} on ${incident.resolvedAt ? new Date(incident.resolvedAt).toLocaleDateString('en-GB') : 'N/A'}` : 'Awaiting resolution')}
    ${incident.resolutionNotes ? row('Resolution notes', incident.resolutionNotes) : ''}
  </table>
  <p style="margin-top:8px;font-size:10px;color:#166534">Proactive hazard reporting demonstrates due diligence under the Management of Health &amp; Safety at Work Regulations 1999.</p>
</div>` : ''}

${!isBbsRecord && incident.isNearMiss ? `
<div class="near-miss-box">
  <div class="nm-title">Near Miss — Management of Health &amp; Safety at Work Regulations 1999</div>
  <table>
    ${row('Potential severity if injury had occurred', incident.nearMissPotential ? SEVERITY_LABELS[incident.nearMissPotential] || incident.nearMissPotential : 'Not assessed')}
    ${row('Hazard type', incident.nearMissHazardType ? HAZARD_LABELS[incident.nearMissHazardType] || incident.nearMissHazardType : 'Not recorded')}
  </table>
  <p style="margin-top:8px;font-size:10px;color:#1e40af">Near misses must be investigated and used to update risk assessments under MHSWR 1999.</p>
</div>` : ''}

${!isBbsRecord && !incident.isNearMiss && incident.riddorCategory ? `
<div class="riddor-box">
  <div class="riddor-title">RIDDOR 2013 — Reporting of Injuries, Diseases and Dangerous Occurrences Regulations</div>
  <table>
    ${row('RIDDOR Category', RIDDOR_LABELS[incident.riddorCategory] || incident.riddorCategory)}
    ${row('Reporting deadline', incident.riddorReportingDeadline ? new Date(incident.riddorReportingDeadline).toLocaleDateString('en-GB') : 'N/A')}
    ${row('Reporting status', riddorStatus, !incident.riddorReportedAt && incident.riddorCategory !== 'not_riddor_reportable')}
    ${incident.riddorReference ? row('HSE Reference', incident.riddorReference) : ''}
  </table>
</div>` : ''}

${!isBbsRecord ? `
<div class="action-box">
  <table>
    ${row('Investigated by', '')}
    ${row('Action taken', '')}
    ${row('Follow-up required', '')}
    ${row('Risk assessment updated', '☐  Yes    ☐  No')}
  </table>
</div>

<div class="sig-section">
  <div class="sig-box">
    <div class="sig-line"></div>
    <div class="sig-label">Manager signature &amp; date</div>
  </div>
  <div class="sig-box">
    <div class="sig-line"></div>
    <div class="sig-label">H&amp;S representative signature &amp; date</div>
  </div>
  <div class="sig-box">
    <div class="sig-line"></div>
    <div class="sig-label">Director sign-off &amp; date</div>
  </div>
</div>` : `
<div class="sig-section">
  <div class="sig-box">
    <div class="sig-line"></div>
    <div class="sig-label">H&amp;S representative acknowledgement &amp; date</div>
  </div>
  <div class="sig-box">
    <div class="sig-line"></div>
    <div class="sig-label">Manager review &amp; date</div>
  </div>
</div>`}

<div class="footer">
  <span>Generated by TPR Max · ${esc(companyName)} · ${dateStr}</span>
  <span>MHSWR 1999 | Health and Safety at Work Act 1974</span>
</div>

</body>
</html>`;

      try {
        let puppeteer: any;
        try {
          puppeteer = await import('puppeteer');
        } catch {
          throw new Error('puppeteer_unavailable');
        }
        const browser = await puppeteer.default.launch({
          headless: true,
          args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
        });
        try {
          const page = await browser.newPage();
          await page.setContent(html, { waitUntil: 'networkidle0' });
          const pdfBuffer = await page.pdf({ format: 'A4', printBackground: true, margin: { top: '0', bottom: '0', left: '0', right: '0' } });
          await browser.close();
          const slug = incident.title.replace(/[^a-z0-9]/gi, '-').slice(0, 40).toLowerCase();
          res.setHeader('Content-Type', 'application/pdf');
          res.setHeader('Content-Disposition', `attachment; filename="incident-report-${slug}-${new Date().toISOString().slice(0,10)}.pdf"`);
          return res.send(Buffer.from(pdfBuffer));
        } catch (pdfErr) {
          await browser.close();
          throw pdfErr;
        }
      } catch (pdfGenerationErr) {
        logger.warn('[incident-pdf] PDF generation unavailable, falling back to HTML:', (pdfGenerationErr as Error).message);
        const printHtml = html.replace('</body>', '<script>window.onload=function(){window.print();}</script></body>');
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.setHeader('Content-Disposition', `inline; filename="incident-report-${new Date().toISOString().slice(0,10)}.html"`);
        return res.send(printHtml);
      }
    } catch (err) {
      logger.error('Error generating incident PDF:', err);
      res.status(500).json({ error: 'Failed to generate PDF' });
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
