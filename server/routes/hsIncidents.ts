import type { Express } from 'express';
import cron from 'node-cron';
import multer from 'multer';
import { randomUUID } from 'crypto';
import { requireAuth } from '../auth';
import { sendTeamsNotification } from '../utils/teamsNotifier';
import { customerDbService } from '../customerDatabase';
import { simpleDatabaseService } from '../simpleDatabaseService';
import * as isolatedSchema from '../isolatedSchema';
import { EmailService } from '../emailService';
import { eq, and, isNull, isNotNull, lte, sql } from 'drizzle-orm';
import { logger } from '../utils/logger';
import { ObjectStorageService, objectStorageClient, parseObjectPath as parseObjectStoragePath } from '../objectStorage';
import { calculateRIDDORDeadline, getDaysUntilRIDDORDeadline, RIDDOR_CATEGORY_LABELS, type RIDDORCategory } from '../utils/riddorUtils';
import { EXTERNAL_LINKS } from '../utils/externalLinks';

const ensuredSchemas = new Set<string>();

async function ensureHsIncidentsTable(custDb: any, schemaName: string) {
  if (ensuredSchemas.has(schemaName)) return;
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
  await pool.query(`ALTER TABLE "${schemaName}".hs_incidents ADD COLUMN IF NOT EXISTS resolution_reminder_sent_at TIMESTAMPTZ`);
  await pool.query(`ALTER TABLE "${schemaName}".hs_incidents ADD COLUMN IF NOT EXISTS investigation_status TEXT NOT NULL DEFAULT 'open'`);
  await pool.query(`ALTER TABLE "${schemaName}".hs_incidents ADD COLUMN IF NOT EXISTS investigated_by TEXT`);
  await pool.query(`ALTER TABLE "${schemaName}".hs_incidents ADD COLUMN IF NOT EXISTS investigation_notes TEXT`);
  // Photo evidence column
  await pool.query(`ALTER TABLE "${schemaName}".hs_incidents ADD COLUMN IF NOT EXISTS photo_url TEXT`);
  // Migrate legacy near_miss records to new record_type field
  await pool.query(`UPDATE "${schemaName}".hs_incidents SET record_type = 'near_miss' WHERE is_near_miss = TRUE AND record_type = 'incident'`);
  // Audit trail table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS "${schemaName}".hs_incident_audit (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
      incident_id VARCHAR,
      action TEXT NOT NULL,
      actor_user_id VARCHAR,
      actor_username TEXT,
      before JSONB,
      after JSONB,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  ensuredSchemas.add(schemaName);
}

// Interpret a datetime-local string (yyyy-MM-ddTHH:mm) as Europe/London wall-clock time
function parseAsLondonTime(dtLocalStr: string): Date {
  if (!dtLocalStr) return new Date(NaN);
  const approx = new Date(dtLocalStr + ':00.000Z');
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London',
    timeZoneName: 'shortOffset',
  } as any).formatToParts(approx);
  const tzPart = (parts.find((p: any) => p.type === 'timeZoneName')?.value) ?? 'GMT';
  const match = tzPart.match(/GMT([+-]\d+)?/);
  const offsetH = match?.[1] ? parseInt(match[1], 10) : 0;
  const wallMs = new Date(dtLocalStr + ':00Z').getTime();
  return new Date(wallMs - offsetH * 3600000);
}

async function writeIncidentAudit(custDb: any, req: any, action: string, incidentId: string, before: any, after: any) {
  try {
    await custDb.insert(isolatedSchema.hsIncidentAudit).values({
      incidentId,
      action,
      actorUserId: (req as any).userId ?? null,
      actorUsername: req.user?.username ?? null,
      before: before ?? null,
      after: after ?? null,
    });
  } catch (e) {
    logger.error('Failed to write incident audit entry:', e);
  }
}

const requireBbsFeature = async (req: any, res: any, next: any) => {
  try {
    const context = simpleDatabaseService.createCustomerContext(req.user!.username, req.customerId);
    const settings = await simpleDatabaseService.getCompanySettings(context);
    if (!settings?.featureBbs) {
      return res.status(403).json({ error: 'Good Spot and Positive Action reporting is not enabled for your account. Please upgrade to TPR Pro or contact support.' });
    }
    next();
  } catch (error) {
    next(error);
  }
};

export function registerHsIncidentRoutes(app: Express): void {

  const requireManager = (req: any, res: any, next: any) => {
    if (!['admin', 'manager'].includes(req.user?.role || '')) {
      return res.status(403).json({ error: 'You need manager or admin permissions to do this.' });
    }
    next();
  };

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
      if (!body.title || !String(body.title).trim()) {
        return res.status(400).json({ error: 'A title is required.' });
      }
      const parsedDate = parseAsLondonTime(body.incidentDate);
      if (!body.incidentDate || isNaN(parsedDate.getTime())) {
        return res.status(400).json({ error: 'A valid incident date and time is required.' });
      }
      const incidentDate = parsedDate;
      const recordType: string = body.recordType || (body.isNearMiss ? 'near_miss' : 'incident');
      const isBbs = recordType === 'good_spot' || recordType === 'positive_action';
      const isNearMiss = recordType === 'near_miss';

      // BBS feature flag check
      if (isBbs) {
        const context = simpleDatabaseService.createCustomerContext(req.user!.username, req.customerId!);
        const settings = await simpleDatabaseService.getCompanySettings(context);
        if (!settings?.featureBbs) {
          return res.status(403).json({ error: 'Good Spot and Positive Action reporting is not enabled for your account.' });
        }
      }

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
        investigationStatus: !isBbs ? (body.investigationStatus || 'open') : 'open',
        investigatedBy: !isBbs ? (body.investigatedBy || null) : null,
        investigationNotes: !isBbs ? (body.investigationNotes || null) : null,
        photoUrl: body.photoUrl || null,
      }).returning();

      // Immediate fatality alert
      if (riddorCategory === 'fatality') {
        sendFatalityAlert(req.customerId!, created, incidentDate).catch(err =>
          logger.error('Failed to send fatality alert:', err));
      }

      // Good Spot / Positive Action notification email
      if (isBbs) {
        sendGoodSpotNotification(req.customerId!, created, incidentDate).catch(err =>
          logger.error('Failed to send Good Spot notification:', err));
      }

      // Teams notification for RIDDOR reportable incidents — fire and forget
      if (riddorCategory && riddorCategory !== 'not_riddor_reportable' && riddorCategory !== 'occupational_disease') {
        const _teamsSchemaInc = customerDbService.generateSchemaName(req.customerId!);
        const _deadlineStr = riddorDeadline ? riddorDeadline.toLocaleDateString('en-GB') : 'Check with HSE';
        sendTeamsNotification(_teamsSchemaInc, 'riddor_incident', {
          eventType: 'riddor_incident',
          title: '⚠️ RIDDOR reportable incident logged',
          summary: 'A RIDDOR-reportable incident has been recorded. Report to HSE by the deadline.',
          facts: [
            { name: 'Incident', value: body.title || created.title },
            { name: 'Category', value: RIDDOR_CATEGORY_LABELS[riddorCategory as RIDDORCategory] || riddorCategory },
            { name: 'Reporting deadline', value: _deadlineStr },
            { name: 'Logged by', value: body.reportedBy || req.user?.username || 'Unknown' },
          ],
          urgency: 'high',
        }).catch(() => {});
      }

      await writeIncidentAudit(custDb, req, 'create', created.id, null, created);
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
      if (!body.title || !String(body.title).trim()) {
        return res.status(400).json({ error: 'A title is required.' });
      }
      if (body.incidentDate !== undefined) {
        const parsedDate = parseAsLondonTime(body.incidentDate);
        if (isNaN(parsedDate.getTime())) {
          return res.status(400).json({ error: 'A valid incident date and time is required.' });
        }
      }
      const incidentDate = body.incidentDate ? parseAsLondonTime(body.incidentDate) : undefined;
      const recordType: string = body.recordType || (body.isNearMiss ? 'near_miss' : 'incident');
      const isBbs = recordType === 'good_spot' || recordType === 'positive_action';
      const isNearMiss = recordType === 'near_miss';

      // BBS feature flag check
      if (isBbs) {
        const context = simpleDatabaseService.createCustomerContext(req.user!.username, req.customerId!);
        const settings = await simpleDatabaseService.getCompanySettings(context);
        if (!settings?.featureBbs) {
          return res.status(403).json({ error: 'Good Spot and Positive Action reporting is not enabled for your account.' });
        }
      }

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
      } else {
        updates.investigationStatus = body.investigationStatus || 'open';
        updates.investigatedBy = body.investigatedBy ?? null;
        updates.investigationNotes = body.investigationNotes ?? null;
      }
      if (body.photoUrl !== undefined) updates.photoUrl = body.photoUrl || null;

      const [beforeRow] = await custDb.select().from(isolatedSchema.hsIncidents)
        .where(eq(isolatedSchema.hsIncidents.id, req.params.id));
      if (!beforeRow) return res.status(404).json({ error: 'Incident not found' });

      const [updated] = await custDb.update(isolatedSchema.hsIncidents)
        .set(updates)
        .where(eq(isolatedSchema.hsIncidents.id, req.params.id))
        .returning();

      if (!updated) return res.status(404).json({ error: 'Incident not found' });
      await writeIncidentAudit(custDb, req, 'update', req.params.id, beforeRow, updated);
      res.json(updated);
    } catch (err) {
      logger.error('Error updating H&S incident:', err);
      res.status(500).json({ error: 'Failed to update incident' });
    }
  });

  // DELETE incident — managers/admins only; full audit entry written before deletion
  app.delete('/api/hs-incidents/:id', requireAuth, requireManager, async (req, res) => {
    try {
      const custDb = await customerDbService.getCustomerDatabase(req.customerId!);
      const schemaName = customerDbService.generateSchemaName(req.customerId!);
      await ensureHsIncidentsTable(custDb, schemaName);
      const [beforeRow] = await custDb.select().from(isolatedSchema.hsIncidents)
        .where(eq(isolatedSchema.hsIncidents.id, req.params.id));
      if (!beforeRow) return res.status(404).json({ error: 'Incident not found' });
      await writeIncidentAudit(custDb, req, 'delete', req.params.id, beforeRow, null);
      await custDb.delete(isolatedSchema.hsIncidents)
        .where(eq(isolatedSchema.hsIncidents.id, req.params.id));
      res.json({ success: true });
    } catch (err) {
      logger.error('Error deleting H&S incident:', err);
      res.status(500).json({ error: 'Failed to delete incident' });
    }
  });

  // PATCH resolve a Good Spot or Positive Action
  app.patch('/api/hs-incidents/:id/resolve', requireAuth, requireBbsFeature, async (req, res) => {
    try {
      const custDb = await customerDbService.getCustomerDatabase(req.customerId!);
      const { resolvedBy, resolutionNotes } = req.body as { resolvedBy: string; resolutionNotes: string };
      const [beforeRow] = await custDb.select().from(isolatedSchema.hsIncidents)
        .where(eq(isolatedSchema.hsIncidents.id, req.params.id));
      if (!beforeRow) return res.status(404).json({ error: 'Record not found' });
      const [updated] = await custDb.update(isolatedSchema.hsIncidents)
        .set({ resolved: true, resolvedBy: resolvedBy || null, resolvedAt: new Date(), resolutionNotes: resolutionNotes || null, updatedAt: new Date() })
        .where(eq(isolatedSchema.hsIncidents.id, req.params.id))
        .returning();
      if (!updated) return res.status(404).json({ error: 'Record not found' });
      await writeIncidentAudit(custDb, req, 'resolve', req.params.id, beforeRow, updated);
      res.json(updated);
    } catch (err) {
      logger.error('Error resolving Good Spot:', err);
      res.status(500).json({ error: 'Failed to resolve' });
    }
  });

  // PATCH mark as reported to HSE — managers/admins only (legal action)
  app.patch('/api/hs-incidents/:id/riddor-reported', requireAuth, requireManager, async (req, res) => {
    try {
      const custDb = await customerDbService.getCustomerDatabase(req.customerId!);
      const { reference } = req.body as { reference: string };
      const [beforeRow] = await custDb.select().from(isolatedSchema.hsIncidents)
        .where(eq(isolatedSchema.hsIncidents.id, req.params.id));
      if (!beforeRow) return res.status(404).json({ error: 'Incident not found' });
      const [updated] = await custDb.update(isolatedSchema.hsIncidents)
        .set({ riddorReportedAt: new Date(), riddorReference: reference, updatedAt: new Date() })
        .where(eq(isolatedSchema.hsIncidents.id, req.params.id))
        .returning();
      if (!updated) return res.status(404).json({ error: 'Incident not found' });
      await writeIncidentAudit(custDb, req, 'riddor_reported', req.params.id, beforeRow, updated);
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

  // ── Good Spot Resolution Reminder Cron (daily at 08:00 Europe/London) ────
  cron.schedule('0 8 * * *', async () => {
    try {
      logger.info('[Resolution Reminder Cron] Running daily unresolved Good Spot check…');
      const allCustomers = await customerDbService.getAllCustomers();
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

      for (const customer of allCustomers) {
        try {
          const custDb = await customerDbService.getCustomerDatabase(customer.id);
          const schemaName = customerDbService.generateSchemaName(customer.id);
          await ensureHsIncidentsTable(custDb, schemaName);

          const unresolved = await custDb.select().from(isolatedSchema.hsIncidents)
            .where(and(
              sql`${isolatedSchema.hsIncidents.recordType} IN ('good_spot', 'positive_action')`,
              eq(isolatedSchema.hsIncidents.resolved, false),
              lte(isolatedSchema.hsIncidents.createdAt, sevenDaysAgo),
              isNull(isolatedSchema.hsIncidents.resolutionReminderSentAt),
            ));

          if (unresolved.length === 0) continue;

          const settingsRows = await custDb.execute(sql.raw(`SELECT company_name, email, site_name FROM ${schemaName}.company_settings LIMIT 1`));
          const settings = settingsRows.rows[0] as any;
          const companyName = settings?.company_name || 'TPR';
          const siteName = settings?.site_name || companyName;
          const adminEmail = settings?.email as string | undefined;
          if (!adminEmail) continue;

          const HAZARD_LABELS: Record<string, string> = {
            slip_trip_fall: 'Slip, trip or fall', struck_by_object: 'Struck by object',
            manual_handling: 'Manual handling', vehicle_plant: 'Vehicle or plant',
            working_at_height: 'Working at height', electrical: 'Electrical',
            fire_explosion: 'Fire or explosion', chemical_substance: 'Chemical or substance',
            machinery: 'Machinery', other: 'Other',
          };

          const rows = unresolved.map(i => {
            const daysOld = Math.floor((Date.now() - new Date(i.createdAt!).getTime()) / (1000 * 60 * 60 * 24));
            const typeLabel = i.recordType === 'positive_action' ? 'Positive Action' : 'Good Spot';
            return `
              <tr>
                <td style="padding:8px;border:1px solid #e5e7eb">${typeLabel}</td>
                <td style="padding:8px;border:1px solid #e5e7eb">${i.title}</td>
                <td style="padding:8px;border:1px solid #e5e7eb">${i.location || '—'}</td>
                <td style="padding:8px;border:1px solid #e5e7eb">${i.reportedBy || '—'}</td>
                <td style="padding:8px;border:1px solid #e5e7eb">${i.hazardType ? (HAZARD_LABELS[i.hazardType] || i.hazardType) : '—'}</td>
                <td style="padding:8px;border:1px solid #e5e7eb;color:${daysOld >= 14 ? '#dc2626' : '#b45309'};font-weight:bold">${daysOld} days</td>
              </tr>
            `;
          }).join('');

          const emailSvc = new EmailService(customer.id);
          await emailSvc.sendEmail({
            to: adminEmail,
            subject: `⏳ ${unresolved.length} Good Spot${unresolved.length > 1 ? 's' : ''} awaiting resolution — ${siteName}`,
            companyName,
            html: `
              <div style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto">
                <div style="background:#b45309;color:#fff;padding:20px;border-radius:8px 8px 0 0">
                  <h2 style="margin:0">⏳ Good Spots Awaiting Resolution</h2>
                  <p style="margin:4px 0 0;opacity:0.85">${siteName}</p>
                </div>
                <div style="background:#fff;padding:20px;border:1px solid #e5e7eb;border-top:none">
                  <p>${unresolved.length} safety observation${unresolved.length > 1 ? 's have' : ' has'} been logged but not yet resolved. Staff are more likely to keep reporting hazards when they see their observations acted on.</p>
                  <table style="width:100%;border-collapse:collapse;margin:16px 0;font-size:13px">
                    <thead>
                      <tr style="background:#f9fafb">
                        <th style="padding:8px;border:1px solid #e5e7eb;text-align:left">Type</th>
                        <th style="padding:8px;border:1px solid #e5e7eb;text-align:left">Observation</th>
                        <th style="padding:8px;border:1px solid #e5e7eb;text-align:left">Location</th>
                        <th style="padding:8px;border:1px solid #e5e7eb;text-align:left">Reported by</th>
                        <th style="padding:8px;border:1px solid #e5e7eb;text-align:left">Hazard</th>
                        <th style="padding:8px;border:1px solid #e5e7eb;text-align:left">Age</th>
                      </tr>
                    </thead>
                    <tbody>${rows}</tbody>
                  </table>
                  <p>Log in to TPR and mark each Good Spot as resolved once the hazard has been dealt with.</p>
                  <p style="font-size:12px;color:#6b7280;margin-top:16px">Each observation will only be reminded once. This reminder was sent automatically by TPR.</p>
                </div>
              </div>
            `,
            text: `${unresolved.length} Good Spot${unresolved.length > 1 ? 's' : ''} awaiting resolution at ${siteName}.\n\n${unresolved.map(i => `- ${i.title}${i.location ? ` (${i.location})` : ''}${i.reportedBy ? ` — reported by ${i.reportedBy}` : ''}`).join('\n')}\n\nLog in to TPR to resolve these records.`,
          });

          const now = new Date();
          for (const record of unresolved) {
            await custDb.update(isolatedSchema.hsIncidents)
              .set({ resolutionReminderSentAt: now })
              .where(eq(isolatedSchema.hsIncidents.id, record.id));
          }

          logger.info(`[Resolution Reminder Cron] Sent reminder for ${unresolved.length} unresolved record(s) — customer ${customer.id}`);
        } catch (custErr) {
          logger.error(`[Resolution Reminder Cron] Error for customer ${customer.id}:`, custErr);
        }
      }
      logger.info('[Resolution Reminder Cron] Daily check complete');
    } catch (err) {
      logger.error('[Resolution Reminder Cron] Fatal error:', err);
    }
  }, { timezone: 'Europe/London' });

  // POST /api/hs-incidents/photo — upload a photo for an incident (admin-authenticated)
  const incidentPhotoUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
      if (file.mimetype.startsWith('image/')) cb(null, true);
      else cb(new Error('Only image files are allowed'));
    },
  });

  app.post('/api/hs-incidents/photo', requireAuth, incidentPhotoUpload.single('photo'), async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ error: 'No photo file provided' });
      const rawExt = (req.file.originalname.split('.').pop() || '').toLowerCase();
      const allowed = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic'];
      const ext = allowed.includes(rawExt)
        ? rawExt
        : (req.file.mimetype.split('/')[1] || 'jpg').replace(/[^a-z0-9]/g, '');
      const mimeType = req.file.mimetype || 'image/jpeg';
      const objectId = randomUUID();
      const objectStorageService = new ObjectStorageService();
      const privateObjectDir = objectStorageService.getPrivateObjectDir();
      const customerId = req.customerId!;
      const fullPath = `${privateObjectDir}/${customerId}/hs-incidents/${objectId}.${ext}`;
      const { bucketName, objectName } = parseObjectStoragePath(fullPath);
      const bucket = objectStorageClient.bucket(bucketName);
      const file = bucket.file(objectName);
      await file.save(req.file.buffer, { contentType: mimeType });
      const storedPath = `/${customerId}/hs-incidents/${objectId}.${ext}`;
      logger.info(`📷 Incident photo saved: ${storedPath}`);
      return res.json({ success: true, url: storedPath });
    } catch (error: any) {
      logger.error('Error uploading incident photo:', error);
      res.status(500).json({ error: error.message || 'Failed to upload photo' });
    }
  });
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

async function sendGoodSpotNotification(customerId: string, incident: any, incidentDate: Date) {
  const custDb = await customerDbService.getCustomerDatabase(customerId);
  const schemaName = customerDbService.generateSchemaName(customerId);
  const settingsRows = await custDb.execute(sql.raw(`SELECT company_name, email, site_name FROM ${schemaName}.company_settings LIMIT 1`));
  const settings = settingsRows.rows[0] as any;
  const companyName = settings?.company_name || 'TPR';
  const siteName = settings?.site_name || companyName;
  const adminEmail = settings?.email as string | undefined;
  if (!adminEmail) return;

  const isPositiveAction = incident.recordType === 'positive_action';
  const typeLabel = isPositiveAction ? 'Positive Action' : 'Good Spot';
  const subjectPrefix = isPositiveAction ? '✅ Positive Action' : '✅ Good Spot';
  const headerColor = '#166534';

  const HAZARD_LABELS: Record<string, string> = {
    slip_trip_fall: 'Slip, trip or fall', struck_by_object: 'Struck by object',
    manual_handling: 'Manual handling', vehicle_plant: 'Vehicle or plant',
    working_at_height: 'Working at height', electrical: 'Electrical',
    fire_explosion: 'Fire or explosion', chemical_substance: 'Chemical or substance',
    machinery: 'Machinery', other: 'Other',
  };

  const emailSvc = new EmailService(customerId);
  await emailSvc.sendEmail({
    to: adminEmail,
    subject: `${subjectPrefix} logged — ${incident.title}`,
    companyName,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
        <div style="background:${headerColor};color:#fff;padding:20px;border-radius:8px 8px 0 0">
          <h2 style="margin:0">${subjectPrefix} Logged</h2>
          <p style="margin:4px 0 0;opacity:0.85">${siteName}</p>
        </div>
        <div style="background:#fff;padding:20px;border:1px solid #e5e7eb;border-top:none">
          <p style="margin:0 0 16px">A ${typeLabel.toLowerCase()} has been recorded in TPR. ${isPositiveAction ? 'Someone has already dealt with this hazard.' : 'Please review and arrange for the hazard to be resolved.'}</p>
          <table style="width:100%;border-collapse:collapse;margin:0 0 16px">
            <tr><td style="padding:8px;border:1px solid #e5e7eb;font-weight:bold;background:#f0fdf4;width:35%">Type</td><td style="padding:8px;border:1px solid #e5e7eb;color:#166534;font-weight:600">${typeLabel}</td></tr>
            <tr><td style="padding:8px;border:1px solid #e5e7eb;font-weight:bold;background:#f9fafb">Observation</td><td style="padding:8px;border:1px solid #e5e7eb">${incident.title}</td></tr>
            <tr><td style="padding:8px;border:1px solid #e5e7eb;font-weight:bold;background:#f9fafb">Date &amp; time</td><td style="padding:8px;border:1px solid #e5e7eb">${incidentDate.toLocaleString('en-GB', { dateStyle: 'long', timeStyle: 'short', timeZone: 'Europe/London' })}</td></tr>
            ${incident.location ? `<tr><td style="padding:8px;border:1px solid #e5e7eb;font-weight:bold;background:#f9fafb">Location</td><td style="padding:8px;border:1px solid #e5e7eb">${incident.location}</td></tr>` : ''}
            ${incident.reportedBy ? `<tr><td style="padding:8px;border:1px solid #e5e7eb;font-weight:bold;background:#f9fafb">Reported by</td><td style="padding:8px;border:1px solid #e5e7eb">${incident.reportedBy}</td></tr>` : ''}
            ${incident.hazardType ? `<tr><td style="padding:8px;border:1px solid #e5e7eb;font-weight:bold;background:#f9fafb">Hazard type</td><td style="padding:8px;border:1px solid #e5e7eb">${HAZARD_LABELS[incident.hazardType] || incident.hazardType}</td></tr>` : ''}
            ${incident.description ? `<tr><td style="padding:8px;border:1px solid #e5e7eb;font-weight:bold;background:#f9fafb">Description</td><td style="padding:8px;border:1px solid #e5e7eb">${incident.description}</td></tr>` : ''}
            ${isPositiveAction && incident.resolutionNotes ? `<tr><td style="padding:8px;border:1px solid #e5e7eb;font-weight:bold;background:#f0fdf4">Action taken</td><td style="padding:8px;border:1px solid #e5e7eb;color:#166534">${incident.resolutionNotes}</td></tr>` : ''}
          </table>
          ${!isPositiveAction ? `
          <div style="background:#fef9c3;border:1px solid #fde047;border-radius:6px;padding:12px;margin-bottom:16px">
            <p style="margin:0;font-size:13px;color:#713f12"><strong>Action required:</strong> Log in to TPR, review this Good Spot, and mark it as resolved once the hazard has been dealt with. Staff are more likely to report again when they see their observations acted on promptly.</p>
          </div>` : `
          <div style="background:#f0fdf4;border:1px solid #86efac;border-radius:6px;padding:12px;margin-bottom:16px">
            <p style="margin:0;font-size:13px;color:#166534"><strong>No action required</strong> — this hazard has already been dealt with. Log in to TPR to review and close the record.</p>
          </div>`}
          <p style="font-size:12px;color:#6b7280;margin:0">This notification was sent automatically by TPR. It demonstrates proactive safety culture under the Management of Health &amp; Safety at Work Regulations 1999.</p>
        </div>
      </div>
    `,
    text: `${typeLabel} logged — ${incident.title}\n\nDate: ${incidentDate.toLocaleString('en-GB')}\n${incident.location ? `Location: ${incident.location}\n` : ''}${incident.reportedBy ? `Reported by: ${incident.reportedBy}\n` : ''}${incident.hazardType ? `Hazard: ${HAZARD_LABELS[incident.hazardType] || incident.hazardType}\n` : ''}${incident.description ? `\nDescription: ${incident.description}\n` : ''}${isPositiveAction && incident.resolutionNotes ? `\nAction taken: ${incident.resolutionNotes}\n` : ''}`,
  });
}
