import type { Express } from 'express';
import { randomBytes } from 'crypto';
import cron from 'node-cron';
import rateLimit from 'express-rate-limit';
import { requireAuth } from '../auth';
import { customerDbService } from '../customerDatabase';
import { simpleDatabaseService } from '../simpleDatabaseService';
import { ObjectStorageService } from '../objectStorage';
import { EmailService } from '../emailService';
import { logger } from '../utils/logger';
import * as isolatedSchema from '../isolatedSchema';
import { eq, and, sql, desc, or, lt, isNull, gte, inArray, count } from 'drizzle-orm';
import { getScopedDb, scopedWhere, withSiteId, SiteContextError } from '../siteScope';

// ── Audit feature gate ───────────────────────────────────────────────────────
const requireAuditFeature = async (req: any, res: any, next: any) => {
  try {
    const context = simpleDatabaseService.createCustomerContext(req.user!.username, req.customerId);
    const settings = await simpleDatabaseService.getCompanySettings(context);
    if (!settings?.featureAuditEngine) {
      return res.status(403).json({ error: 'Audit & Inspection module is not enabled for your account.' });
    }
    next();
  } catch (error) {
    next(error);
  }
};

// ── Public rate limiter for mobile audit endpoints ───────────────────────────
// Uses express-rate-limit (same library as auth and general API limits).
// 60 requests per minute per IP. For multi-process deployments, swap the
// default MemoryStore for a shared Redis store here without changing routes.
const auditPublicRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please try again later.' },
});

export function registerAuditEngineRoutes(app: Express): void {

  // Resolve custDb + record from token — uses customerId prefix for O(1) lookup,
  // falls back to full scan for legacy tokens issued before the prefix was added.
  async function resolveAuditDb(token: string): Promise<{ custDb: any; record: any } | null> {
    const dotIndex = token.indexOf('.');
    if (dotIndex > 0) {
      const customerId = token.slice(0, dotIndex);
      try {
        const custDb = await customerDbService.getCustomerDatabase(customerId);
        const [record] = await custDb.select().from(isolatedSchema.auditRecords)
          .where(eq(isolatedSchema.auditRecords.accessToken, token));
        if (record) return { custDb, record };
      } catch { /* fall through to legacy scan */ }
    }
    // Fix 7: Reject malformed tokens before scanning every customer database.
    // Valid tokens look like <customerId>.<48 hex chars>. Anything else is bogus.
    const hexPart = dotIndex > 0 ? token.slice(dotIndex + 1) : token;
    if (!/^[0-9a-f]{48}$/.test(hexPart)) return null;
    // Legacy fallback: tokens issued before customerId prefix was added
    const allCustomers = await customerDbService.getAllCustomers();
    for (const customer of allCustomers) {
      const custDb = await customerDbService.getCustomerDatabase(customer.id);
      const [record] = await custDb.select().from(isolatedSchema.auditRecords)
        .where(eq(isolatedSchema.auditRecords.accessToken, token));
      if (record) return { custDb, record };
    }
    return null;
  }

  function isMgr(req: any): boolean {
    return req.user?.role === 'admin' || req.user?.role === 'manager';
  }

  async function appendAuditLog(custDb: any, entry: {
    auditId?: string | null;
    actorName: string;
    action: string;
    detail?: string | null;
  }): Promise<void> {
    try {
      await custDb.insert(isolatedSchema.auditActivityLog).values({
        auditId: entry.auditId ?? null,
        actorName: entry.actorName,
        action: entry.action,
        detail: entry.detail ?? null,
      });
    } catch (err: any) {
      logger.warn(`[AuditActivityLog] Failed to write log: ${err.message}`);
    }
  }

  // ── PUBLIC ENDPOINTS (registered BEFORE auth middleware) ─────────────────

  app.get('/api/audits/public/:token', auditPublicRateLimit, async (req, res) => {
    try {
      const { token } = req.params;
      const resolved = await resolveAuditDb(token);
      if (!resolved) return res.status(404).json({ error: 'Audit not found or link is invalid.' });
      const { custDb, record } = resolved;
      if (record.accessTokenExpiresAt && new Date(record.accessTokenExpiresAt) < new Date()) {
        return res.status(410).json({ error: 'This link has expired. Please request a new one.' });
      }
      const items = await custDb.select().from(isolatedSchema.auditRecordItems)
        .where(eq(isolatedSchema.auditRecordItems.auditId, record.id))
        .orderBy(isolatedSchema.auditRecordItems.sortOrder);
      return res.json({ record, items });
    } catch (error: unknown) {
      logger.error('GET /api/audits/public/:token', error);
      res.status(500).json({ error: 'Failed to load audit' });
    }
  });

  app.put('/api/audits/public/:token', auditPublicRateLimit, async (req, res) => {
    try {
      const { token } = req.params;
      const { itemId, response, note, photoUrl, photoFileName } = req.body;
      const resolved = await resolveAuditDb(token);
      if (!resolved) return res.status(404).json({ error: 'Audit not found.' });
      const { custDb, record } = resolved;
      if (record.accessTokenExpiresAt && new Date(record.accessTokenExpiresAt) < new Date()) {
        return res.status(410).json({ error: 'This link has expired.' });
      }
      // Fix 4: Lock completed audits — no further changes allowed.
      if (record.status === 'completed') {
        return res.status(410).json({ error: 'This audit has already been submitted and can no longer be changed.' });
      }
      await custDb.update(isolatedSchema.auditRecordItems)
        .set({ response, note, photoUrl, photoFileName })
        .where(and(
          eq(isolatedSchema.auditRecordItems.id, itemId),
          eq(isolatedSchema.auditRecordItems.auditId, record.id)
        ));
      return res.json({ ok: true });
    } catch (error: unknown) {
      logger.error('PUT /api/audits/public/:token', error);
      res.status(500).json({ error: 'Failed to update item' });
    }
  });

  app.post('/api/audits/public/:token/submit', auditPublicRateLimit, async (req, res) => {
    try {
      const { token } = req.params;
      const resolved = await resolveAuditDb(token);
      if (!resolved) return res.status(404).json({ error: 'Audit not found.' });
      const { custDb, record } = resolved;
      if (record.accessTokenExpiresAt && new Date(record.accessTokenExpiresAt) < new Date()) {
        return res.status(410).json({ error: 'This link has expired.' });
      }
      // Fix 4: Prevent re-submission of a completed audit.
      if (record.status === 'completed') {
        return res.status(410).json({ error: 'This audit has already been submitted and can no longer be changed.' });
      }
      const { summary, completedByName } = req.body;
      const items = await custDb.select().from(isolatedSchema.auditRecordItems)
        .where(eq(isolatedSchema.auditRecordItems.auditId, record.id));
      const passCount = items.filter((i: any) => i.response === 'pass').length;
      const failCount = items.filter((i: any) => i.response === 'fail').length;
      const scoreable = passCount + failCount;
      const score = scoreable > 0 ? Math.round((passCount / scoreable) * 100) : 100;
      const hasCriticalFail = items.some((i: any) => i.isCritical && i.response === 'fail');
      let template = null;
      if (record.templateId) {
        const [t] = await custDb.select().from(isolatedSchema.auditTemplates)
          .where(eq(isolatedSchema.auditTemplates.id, record.templateId));
        template = t;
      }
      const passThreshold = template?.passScore ?? 80;
      const passed = hasCriticalFail ? false : score >= passThreshold;
      const [updated] = await custDb.update(isolatedSchema.auditRecords)
        .set({ status: 'completed', overallScore: score, passed, conductedAt: new Date(), summary: summary || null, completedBy: completedByName || null, updatedAt: new Date() })
        .where(eq(isolatedSchema.auditRecords.id, record.id))
        .returning();

      // Auto-create corrective actions for failed items (skip any already raised).
      // Mirrors the authenticated submit handler so mobile-completed audits behave
      // the same as desktop ones.
      let autoActionsCreated = 0;
      const failedItems = items.filter((i: any) => i.response === 'fail');
      if (failedItems.length > 0) {
        const existingActions = await custDb.select().from(isolatedSchema.auditCorrectiveActions)
          .where(eq(isolatedSchema.auditCorrectiveActions.auditId, record.id));
        const existingItemIds = new Set(existingActions.map((a: any) => a.auditItemId).filter(Boolean));
        const newActions = failedItems
          .filter((item: any) => !existingItemIds.has(item.id))
          .map((item: any) => ({
            auditId: record.id,
            auditItemId: item.id,
            title: `Failed: ${item.question}`,
            description: item.note || null,
            priority: (item.isCritical ? 'high' : 'medium') as 'high' | 'medium',
            status: 'open' as const,
          }));
        if (newActions.length > 0) {
          await custDb.insert(isolatedSchema.auditCorrectiveActions).values(newActions);
          autoActionsCreated = newActions.length;
        }
      }

      const naCount = items.filter((i: any) => i.response === 'na').length;
      await appendAuditLog(custDb, {
        auditId: record.id,
        actorName: completedByName || record.conductedBy,
        action: 'record.completed',
        detail: `Mobile audit submitted. Score: ${score}%, ${passed ? 'PASSED' : 'FAILED'}`,
      });
      return res.json({ record: updated, overallScore: score, passed, passCount, failCount, naCount, autoActionsCreated });
    } catch (error: unknown) {
      logger.error('POST /api/audits/public/:token/submit', error);
      res.status(500).json({ error: 'Failed to submit audit' });
    }
  });

  app.post('/api/audits/public/:token/upload', auditPublicRateLimit, async (req, res) => {
    try {
      const { token } = req.params;
      const { data, mimeType, fileName, itemId } = req.body;
      if (!data || !mimeType || !fileName) return res.status(400).json({ error: 'Missing file data' });

      // Fix 5: Allow images only.
      const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp', 'image/heic'];
      if (!ALLOWED_MIME.includes(mimeType)) {
        return res.status(400).json({ error: 'Only image files (JPEG, PNG, WebP, HEIC) are allowed.' });
      }

      const buffer = Buffer.from(data, 'base64');

      // Fix 5: Cap file size at 6 MB.
      if (buffer.length > 6 * 1024 * 1024) {
        return res.status(413).json({ error: 'Image too large. Please use a smaller photo.' });
      }

      // Fix 5: Sanitise filename — strip path separators and unsafe characters.
      const safeFileName = fileName.replace(/^.*[\\/]/, '').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120) || 'upload';

      const resolved = await resolveAuditDb(token);
      if (!resolved) return res.status(404).json({ error: 'Audit not found.' });
      const { custDb, record } = resolved;
      if (record.accessTokenExpiresAt && new Date(record.accessTokenExpiresAt) < new Date()) {
        return res.status(410).json({ error: 'This link has expired.' });
      }
      // Fix 4: Reject uploads for completed audits.
      if (record.status === 'completed') {
        return res.status(410).json({ error: 'This audit has already been submitted and can no longer be changed.' });
      }
      const storage = new ObjectStorageService();
      const uploadPath = `audit-photos/${record.id}/${Date.now()}-${safeFileName}`;
      const fileUrl = await storage.uploadFile(buffer, uploadPath, mimeType);
      if (itemId) {
        await custDb.update(isolatedSchema.auditRecordItems)
          .set({ photoUrl: fileUrl, photoFileName: safeFileName })
          .where(and(
            eq(isolatedSchema.auditRecordItems.id, itemId),
            eq(isolatedSchema.auditRecordItems.auditId, record.id)
          ));
      }
      return res.json({ fileUrl, fileName });
    } catch (error: unknown) {
      logger.error('POST /api/audits/public/:token/upload', error);
      res.status(500).json({ error: 'Upload failed' });
    }
  });

  // ── AUTHENTICATED MIDDLEWARE ──────────────────────────────────────────────
  app.use('/api/audits', requireAuth, requireAuditFeature);

  // ── TEMPLATES ─────────────────────────────────────────────────────────────

  app.get('/api/audits/templates', requireAuth, async (req, res) => {
    try {
      const context = simpleDatabaseService.createCustomerContext(req.user!.username, req.customerId);
      const custDb = await customerDbService.getCustomerDatabase(context.customerId);
      const templates = await custDb.select().from(isolatedSchema.auditTemplates)
        .where(isNull(isolatedSchema.auditTemplates.deletedAt))
        .orderBy(desc(isolatedSchema.auditTemplates.createdAt));
      const itemCounts = await custDb.select({
        templateId: isolatedSchema.auditTemplateItems.templateId,
        count: count(),
      }).from(isolatedSchema.auditTemplateItems)
        .groupBy(isolatedSchema.auditTemplateItems.templateId);
      const countMap: Record<string, number> = {};
      for (const r of itemCounts) countMap[r.templateId] = Number(r.count);
      res.json(templates.map(t => ({ ...t, itemCount: countMap[t.id] ?? 0 })));
    } catch (error: unknown) {
      logger.error('GET /api/audits/templates', error);
      res.status(500).json({ error: 'Failed to fetch audit templates' });
    }
  });

  app.post('/api/audits/templates', requireAuth, async (req, res) => {
    try {
      const { items, ...templateData } = req.body;
      const parsed = isolatedSchema.insertAuditTemplateSchema.parse(templateData);
      const context = simpleDatabaseService.createCustomerContext(req.user!.username, req.customerId);
      const custDb = await customerDbService.getCustomerDatabase(context.customerId);
      const [template] = await custDb.insert(isolatedSchema.auditTemplates).values(parsed).returning();
      if (Array.isArray(items) && items.length > 0) {
        const itemRows = items.map((item: any, idx: number) => ({
          templateId: template.id,
          question: item.question,
          category: item.category || null,
          requiresPhoto: !!item.requiresPhoto,
          requiresNote: !!item.requiresNote,
          isCritical: !!item.isCritical,
          sortOrder: idx,
        }));
        await custDb.insert(isolatedSchema.auditTemplateItems).values(itemRows);
      }
      const createdItems = await custDb.select().from(isolatedSchema.auditTemplateItems)
        .where(eq(isolatedSchema.auditTemplateItems.templateId, template.id))
        .orderBy(isolatedSchema.auditTemplateItems.sortOrder);
      res.status(201).json({ ...template, items: createdItems });
    } catch (error: unknown) {
      logger.error('POST /api/audits/templates', error);
      res.status(400).json({ error: error instanceof Error ? error.message : 'Failed to create template' });
    }
  });

  // ── SEED UK AUDIT TEMPLATES ───────────────────────────────────────────────
  app.post('/api/audits/templates/seed', requireAuth, async (req, res) => {
    try {
      const context = simpleDatabaseService.createCustomerContext(req.user!.username, req.customerId);
      const custDb = await customerDbService.getCustomerDatabase(context.customerId);

      const UK_AUDIT_TEMPLATES: Array<{
        name: string; description: string; category: string;
        frequency: string; passScore: number; estimatedMinutes: number;
        items: Array<{ question: string; isCritical?: boolean; requiresPhoto?: boolean; requiresNote?: boolean }>;
      }> = [
        {
          name: 'Fire Safety Inspection',
          description: 'Monthly fire safety walkthrough in line with the Regulatory Reform (Fire Safety) Order 2005 and BS 5839-1.',
          category: 'fire', frequency: 'monthly', passScore: 85, estimatedMinutes: 30,
          items: [
            { question: 'Are all fire exits clear, unobstructed, and correctly signed?', isCritical: true },
            { question: 'Are fire extinguishers present, in date, and at the correct locations?', isCritical: true },
            { question: 'Are fire alarm call points visible, accessible, and undamaged?' },
            { question: 'Are fire doors self-closing and not wedged open?', isCritical: true },
            { question: 'Is the fire evacuation plan displayed in prominent locations?' },
            { question: 'Is the fire log book present and up to date?', requiresNote: true },
            { question: 'Are escape route floor markings and signage clearly visible?' },
            { question: 'Are emergency lighting units functional (monthly flash test completed)?' },
            { question: 'Is fire detection equipment free from obstruction (detectors, sounders)?' },
            { question: 'Are flammable/combustible materials stored correctly and away from ignition sources?' },
            { question: 'Have any changes to the building layout been assessed for fire risk impact?', requiresNote: true },
          ],
        },
        {
          name: 'General H&S Workplace Inspection',
          description: 'Routine health and safety walkthrough in line with the Health and Safety at Work etc. Act 1974 and Workplace (Health, Safety and Welfare) Regulations 1992.',
          category: 'safety', frequency: 'monthly', passScore: 80, estimatedMinutes: 60,
          items: [
            { question: 'Are all walkways and corridors free from obstruction and slip/trip hazards?' },
            { question: 'Is adequate lighting provided in all work areas?' },
            { question: 'Is PPE available, in good condition, and being used correctly?', isCritical: true },
            { question: 'Are all machinery guards in place and functional?', isCritical: true },
            { question: 'Are hazardous substances stored correctly with COSHH data sheets accessible?' },
            { question: 'Is the first aid kit fully stocked, accessible, and within its check date?', requiresPhoto: true },
            { question: 'Are all electrical sockets, leads, and equipment in safe condition (no visible damage)?' },
            { question: 'Is welfare provision adequate (toilets, washing facilities, rest area, drinking water)?' },
            { question: 'Are H&S notices and employer liability insurance certificate displayed?' },
            { question: 'Are all incidents, near-misses, and accidents recorded in the accident book?', requiresNote: true },
            { question: 'Is the workplace temperature reasonable (min 16°C for sedentary, 13°C for physical work)?' },
            { question: 'Are manual handling aids available and in use where required?' },
          ],
        },
        {
          name: 'COSHH Substances Inspection',
          description: 'Inspection of chemical and hazardous substance controls under the Control of Substances Hazardous to Health Regulations 2002.',
          category: 'safety', frequency: 'quarterly', passScore: 90, estimatedMinutes: 45,
          items: [
            { question: 'Are all hazardous substances correctly labelled with GHS/CLP hazard symbols?', isCritical: true },
            { question: 'Are Safety Data Sheets (SDS) available for all chemicals used on-site?', isCritical: true },
            { question: 'Are COSHH risk assessments in place and reviewed within the last 12 months?', requiresNote: true },
            { question: 'Are hazardous substances stored in appropriate, ventilated storage?' },
            { question: 'Is PPE specified in COSHH assessments available and worn correctly?' },
            { question: 'Are LEV (Local Exhaust Ventilation) systems maintained and within test date?' },
            { question: 'Are spill kits present near chemical storage areas?', requiresPhoto: true },
            { question: 'Are waste chemicals disposed of in line with the Environment Agency requirements?' },
            { question: 'Have workers using hazardous substances received COSHH training?', requiresNote: true },
            { question: 'Is emergency eyewash/shower accessible where corrosive substances are used?', isCritical: true },
          ],
        },
        {
          name: 'Manual Handling Assessment Check',
          description: 'Review of manual handling controls under the Manual Handling Operations Regulations 1992.',
          category: 'safety', frequency: 'quarterly', passScore: 80, estimatedMinutes: 30,
          items: [
            { question: 'Have manual handling risk assessments been conducted for key tasks?', requiresNote: true },
            { question: 'Are mechanical handling aids (trolleys, pallet trucks, hoists) available and in use?' },
            { question: 'Are mechanical aids in good working order and within their inspection dates?' },
            { question: 'Are workers following safe lifting techniques observed during the inspection?', requiresNote: true },
            { question: 'Have all workers received manual handling training?' },
            { question: 'Are loads clearly labelled with weight where practicable?' },
            { question: 'Are storage areas arranged to minimise awkward reaches and bending?' },
            { question: 'Are manual handling incidents/near-misses being reported and investigated?', requiresNote: true },
          ],
        },
        {
          name: 'Working at Height Pre-Task Check',
          description: 'Pre-task safety check under the Work at Height Regulations 2005 before any working at height activity commences.',
          category: 'safety', frequency: 'one-off', passScore: 100, estimatedMinutes: 20,
          items: [
            { question: 'Has a working at height risk assessment been completed for this task?', isCritical: true, requiresNote: true },
            { question: 'Is the selected access equipment (ladder, scaffold, MEWP) appropriate for the task?', isCritical: true },
            { question: 'Has the access equipment been inspected prior to use (pre-use check completed)?', requiresPhoto: true },
            { question: 'Is the ground surface stable and level for the equipment being used?', isCritical: true },
            { question: 'Is collective fall protection (guardrails, barriers) in place where possible?' },
            { question: 'If PPE fall arrest is required, has it been inspected and correctly fitted?', isCritical: true },
            { question: 'Has the exclusion zone below the work area been established and signed?' },
            { question: 'Are workers competent and trained for the equipment being used?', isCritical: true },
            { question: 'Has the weather/environmental conditions been assessed as safe to proceed?' },
            { question: 'Is a rescue plan in place in case of fall or emergency?', isCritical: true, requiresNote: true },
          ],
        },
        {
          name: 'Electrical Safety Inspection',
          description: 'Annual inspection of electrical safety compliance under the Electricity at Work Regulations 1989.',
          category: 'safety', frequency: 'annual', passScore: 90, estimatedMinutes: 60,
          items: [
            { question: 'Is the Electrical Installation Condition Report (EICR) in date?', isCritical: true, requiresNote: true },
            { question: 'Has PAT testing been completed on all portable appliances within the required interval?', requiresNote: true },
            { question: 'Are electrical panels and distribution boards locked and accessible only to authorised persons?', isCritical: true },
            { question: 'Are there any signs of overloading (excessive extension leads, adapters)?', requiresPhoto: true },
            { question: 'Are all sockets, switches, and faceplates in good condition with no cracks/damage?' },
            { question: 'Are power cables routed safely without creating trip hazards?' },
            { question: 'Are RCDs (Residual Current Devices) installed and tested on circuits protecting portable equipment?' },
            { question: 'Is there a documented procedure for reporting electrical faults?' },
            { question: 'Are electrical isolation procedures (Lockout/Tagout) in place and understood?', requiresNote: true },
            { question: 'Is all electrical work carried out only by competent, qualified persons?', isCritical: true },
          ],
        },
        {
          name: 'First Aid Readiness Check',
          description: 'Monthly check of first aid provision under the Health and Safety (First Aid) Regulations 1981.',
          category: 'safety', frequency: 'monthly', passScore: 90, estimatedMinutes: 20,
          items: [
            { question: 'Is the first aid kit present, accessible, and clearly signed?', isCritical: true },
            { question: 'Are all first aid kit contents within their expiry dates?', isCritical: true, requiresPhoto: true },
            { question: 'Is the number of trained first aiders adequate for the current workforce on site?', isCritical: true, requiresNote: true },
            { question: 'Are first aider contact details displayed prominently in the workplace?' },
            { question: 'Is the nearest hospital with A&E posted on the first aid notice?' },
            { question: 'Is an AED (defibrillator) present, charged, and within service date?', requiresPhoto: true },
            { question: 'Is the accident/incident book/system accessible and being used correctly?', requiresNote: true },
            { question: 'Have first aiders\' certificates been checked and are they within 3-year renewal date?' },
          ],
        },
        {
          name: 'PPE Compliance Inspection',
          description: 'Inspection of PPE availability, condition, and usage under the Personal Protective Equipment at Work Regulations 1992.',
          category: 'safety', frequency: 'monthly', passScore: 85, estimatedMinutes: 25,
          items: [
            { question: 'Is the correct PPE specified for each role/task in the risk assessments?', isCritical: true },
            { question: 'Is PPE available at the point of use in sufficient quantities?' },
            { question: 'Is all PPE CE/UKCA marked and appropriate for the hazards identified?', isCritical: true },
            { question: 'Is PPE in good condition — no damage, defects, or deterioration?', requiresPhoto: true },
            { question: 'Are workers wearing the correct PPE as observed during the inspection?', isCritical: true, requiresNote: true },
            { question: 'Is PPE stored correctly when not in use (lockers, hooks, clean storage)?' },
            { question: 'Is a PPE inspection/replacement record maintained?', requiresNote: true },
            { question: 'Have workers received training on the correct use, fitting, and limitations of their PPE?' },
            { question: 'Is face-fit testing in place where tight-fitting respiratory protection is required?' },
          ],
        },
        {
          name: 'Contractor Site Safety Induction Check',
          description: 'Pre-work safety check for contractors arriving on site, supporting Contractor Management and CDM Regulations 2015.',
          category: 'safety', frequency: 'one-off', passScore: 100, estimatedMinutes: 30,
          items: [
            { question: 'Has the contractor signed in and provided valid ID?', isCritical: true },
            { question: 'Has the contractor received a site induction (emergency procedures, hazards, rules)?', isCritical: true, requiresNote: true },
            { question: 'Is a valid method statement and risk assessment (RAMS) in place for the work?', isCritical: true, requiresPhoto: true },
            { question: 'Has the contractor\'s insurance (public liability, employer\'s liability) been verified?', isCritical: true },
            { question: 'Does the contractor hold relevant accreditations (e.g. CSCS, CHAS, SafeContractor)?' },
            { question: 'Has the permit to work (if required) been issued and signed?', isCritical: true },
            { question: 'Is the contractor\'s PPE appropriate for the work being carried out?' },
            { question: 'Has the site supervisor/responsible person been allocated for the contractor?', requiresNote: true },
            { question: 'Has the contractor been briefed on asbestos register/known site hazards?', isCritical: true },
            { question: 'Has out-of-hours or lone working been assessed and controlled if applicable?', requiresNote: true },
          ],
        },
        {
          name: 'Vehicle & Fleet Safety Check',
          description: 'Monthly vehicle inspection under the Road Traffic Act 1988 and fleet management best practice.',
          category: 'vehicle', frequency: 'monthly', passScore: 80, estimatedMinutes: 30,
          items: [
            { question: 'Are tyres at correct pressure and within legal minimum tread depth (1.6mm)?', isCritical: true },
            { question: 'Are all lights operational (headlights, tail lights, indicators, brake lights)?', isCritical: true },
            { question: 'Is the windscreen free from significant damage and screen wash topped up?' },
            { question: 'Are all mirrors clean, undamaged, and properly adjusted?' },
            { question: 'Is the vehicle road tax (VED) and MOT certificate in date?', isCritical: true, requiresNote: true },
            { question: 'Is the vehicle insurance certificate present and in date?', isCritical: true },
            { question: 'Is the first aid kit present and fully stocked?' },
            { question: 'Are warning triangle and high-visibility vest present in the vehicle?' },
            { question: 'Is the driver\'s licence valid and checked within the last 12 months?', isCritical: true, requiresNote: true },
            { question: 'Are seatbelts present and in working order for all seats?', isCritical: true },
            { question: 'Is oil level, coolant, and brake fluid within correct operating range?' },
          ],
        },
      ];

      // Get existing template names to skip duplicates
      const existing = await custDb.select({ name: isolatedSchema.auditTemplates.name })
        .from(isolatedSchema.auditTemplates);
      const existingNames = new Set(existing.map(t => t.name));

      const toInsert = UK_AUDIT_TEMPLATES.filter(t => !existingNames.has(t.name));
      if (toInsert.length === 0) {
        return res.json({ inserted: 0, skipped: UK_AUDIT_TEMPLATES.length, message: 'All UK templates are already loaded.' });
      }

      let inserted = 0;
      for (const tplData of toInsert) {
        const { items, ...tplFields } = tplData;
        const [template] = await custDb.insert(isolatedSchema.auditTemplates)
          .values({ ...tplFields, isActive: true })
          .returning();
        if (items.length > 0) {
          const itemRows = items.map((item, idx) => ({
            templateId: template.id,
            question: item.question,
            isCritical: !!item.isCritical,
            requiresPhoto: !!item.requiresPhoto,
            requiresNote: !!item.requiresNote,
            sortOrder: idx,
          }));
          await custDb.insert(isolatedSchema.auditTemplateItems).values(itemRows);
        }
        inserted++;
      }

      res.json({ inserted, skipped: UK_AUDIT_TEMPLATES.length - inserted, message: `Loaded ${inserted} UK audit template${inserted !== 1 ? 's' : ''}.` });
    } catch (error: unknown) {
      logger.error('POST /api/audits/templates/seed', error);
      res.status(500).json({ error: 'Failed to seed UK audit templates' });
    }
  });

  app.get('/api/audits/templates/:id', requireAuth, async (req, res) => {
    try {
      const context = simpleDatabaseService.createCustomerContext(req.user!.username, req.customerId);
      const custDb = await customerDbService.getCustomerDatabase(context.customerId);
      const [template] = await custDb.select().from(isolatedSchema.auditTemplates)
        .where(eq(isolatedSchema.auditTemplates.id, req.params.id));
      if (!template) return res.status(404).json({ error: 'Template not found' });
      const items = await custDb.select().from(isolatedSchema.auditTemplateItems)
        .where(eq(isolatedSchema.auditTemplateItems.templateId, req.params.id))
        .orderBy(isolatedSchema.auditTemplateItems.sortOrder);
      res.json({ ...template, items });
    } catch (error: unknown) {
      logger.error('GET /api/audits/templates/:id', error);
      res.status(500).json({ error: 'Failed to fetch template' });
    }
  });

  app.put('/api/audits/templates/:id', requireAuth, async (req, res) => {
    try {
      const { items, ...templateData } = req.body;
      const context = simpleDatabaseService.createCustomerContext(req.user!.username, req.customerId);
      const custDb = await customerDbService.getCustomerDatabase(context.customerId);
      const parsed = isolatedSchema.insertAuditTemplateSchema.partial().parse(templateData);
      const [template] = await custDb.update(isolatedSchema.auditTemplates)
        .set({ ...parsed, updatedAt: new Date() })
        .where(eq(isolatedSchema.auditTemplates.id, req.params.id))
        .returning();
      if (!template) return res.status(404).json({ error: 'Template not found' });
      if (Array.isArray(items)) {
        await custDb.delete(isolatedSchema.auditTemplateItems)
          .where(eq(isolatedSchema.auditTemplateItems.templateId, req.params.id));
        if (items.length > 0) {
          const itemRows = items.map((item: any, idx: number) => ({
            templateId: template.id,
            question: item.question,
            category: item.category || null,
            requiresPhoto: !!item.requiresPhoto,
            requiresNote: !!item.requiresNote,
            isCritical: !!item.isCritical,
            sortOrder: idx,
          }));
          await custDb.insert(isolatedSchema.auditTemplateItems).values(itemRows);
        }
      }
      const updatedItems = await custDb.select().from(isolatedSchema.auditTemplateItems)
        .where(eq(isolatedSchema.auditTemplateItems.templateId, template.id))
        .orderBy(isolatedSchema.auditTemplateItems.sortOrder);
      res.json({ ...template, items: updatedItems });
    } catch (error: unknown) {
      logger.error('PUT /api/audits/templates/:id', error);
      res.status(400).json({ error: error instanceof Error ? error.message : 'Failed to update template' });
    }
  });

  app.delete('/api/audits/templates/:id', requireAuth, async (req, res) => {
    try {
      if (!isMgr(req)) return res.status(403).json({ error: 'Manager or Admin role required.' });
      const context = simpleDatabaseService.createCustomerContext(req.user!.username, req.customerId);
      const custDb = await customerDbService.getCustomerDatabase(context.customerId);
      await custDb.update(isolatedSchema.auditTemplates)
        .set({ deletedAt: new Date(), deletedBy: req.user!.name || req.user!.username })
        .where(eq(isolatedSchema.auditTemplates.id, req.params.id));
      await appendAuditLog(custDb, {
        auditId: null,
        actorName: req.user!.name || req.user!.username,
        action: 'template.deleted',
        detail: `Template ${req.params.id} soft-deleted`,
      });
      res.json({ ok: true });
    } catch (error: unknown) {
      logger.error('DELETE /api/audits/templates/:id', error);
      res.status(500).json({ error: 'Failed to delete template' });
    }
  });

  app.get('/api/audits/templates/:id/items', requireAuth, async (req, res) => {
    try {
      const context = simpleDatabaseService.createCustomerContext(req.user!.username, req.customerId);
      const custDb = await customerDbService.getCustomerDatabase(context.customerId);
      const items = await custDb.select().from(isolatedSchema.auditTemplateItems)
        .where(eq(isolatedSchema.auditTemplateItems.templateId, req.params.id))
        .orderBy(isolatedSchema.auditTemplateItems.sortOrder);
      res.json(items);
    } catch (error: unknown) {
      logger.error('GET /api/audits/templates/:id/items', error);
      res.status(500).json({ error: 'Failed to fetch template items' });
    }
  });

  app.post('/api/audits/templates/:id/items', requireAuth, async (req, res) => {
    try {
      const context = simpleDatabaseService.createCustomerContext(req.user!.username, req.customerId);
      const custDb = await customerDbService.getCustomerDatabase(context.customerId);
      const [item] = await custDb.insert(isolatedSchema.auditTemplateItems)
        .values({ ...req.body, templateId: req.params.id })
        .returning();
      res.status(201).json(item);
    } catch (error: unknown) {
      logger.error('POST /api/audits/templates/:id/items', error);
      res.status(400).json({ error: error instanceof Error ? error.message : 'Failed to add item' });
    }
  });

  app.put('/api/audits/templates/:id/items/:itemId', requireAuth, async (req, res) => {
    try {
      const context = simpleDatabaseService.createCustomerContext(req.user!.username, req.customerId);
      const custDb = await customerDbService.getCustomerDatabase(context.customerId);
      const [item] = await custDb.update(isolatedSchema.auditTemplateItems)
        .set(req.body)
        .where(and(
          eq(isolatedSchema.auditTemplateItems.id, req.params.itemId),
          eq(isolatedSchema.auditTemplateItems.templateId, req.params.id)
        ))
        .returning();
      if (!item) return res.status(404).json({ error: 'Item not found' });
      res.json(item);
    } catch (error: unknown) {
      logger.error('PUT /api/audits/templates/:id/items/:itemId', error);
      res.status(400).json({ error: error instanceof Error ? error.message : 'Failed to update item' });
    }
  });

  app.delete('/api/audits/templates/:id/items/:itemId', requireAuth, async (req, res) => {
    try {
      const context = simpleDatabaseService.createCustomerContext(req.user!.username, req.customerId);
      const custDb = await customerDbService.getCustomerDatabase(context.customerId);
      await custDb.delete(isolatedSchema.auditTemplateItems)
        .where(and(
          eq(isolatedSchema.auditTemplateItems.id, req.params.itemId),
          eq(isolatedSchema.auditTemplateItems.templateId, req.params.id)
        ));
      res.json({ ok: true });
    } catch (error: unknown) {
      logger.error('DELETE /api/audits/templates/:id/items/:itemId', error);
      res.status(500).json({ error: 'Failed to delete item' });
    }
  });

  // ── AUDIT RECORDS ─────────────────────────────────────────────────────────

  app.get('/api/audits/records', requireAuth, async (req, res) => {
    try {
      const { db: custDb, siteId, siteContext } = await getScopedDb(req);
      const page = Math.max(1, parseInt(String(req.query.page ?? '1'), 10));
      const pageSize = Math.min(200, Math.max(1, parseInt(String(req.query.pageSize ?? '50'), 10)));
      const offset = (page - 1) * pageSize;
      const siteFilter = scopedWhere(siteContext, isolatedSchema.auditRecords);
      const [{ total }] = await custDb.select({ total: count() })
        .from(isolatedSchema.auditRecords)
        .where(and(isNull(isolatedSchema.auditRecords.deletedAt), siteFilter));
      const records = await custDb.select().from(isolatedSchema.auditRecords)
        .where(and(isNull(isolatedSchema.auditRecords.deletedAt), siteFilter))
        .orderBy(desc(isolatedSchema.auditRecords.createdAt))
        .limit(pageSize).offset(offset);
      res.json({ records, total: Number(total), page, pageSize });
    } catch (err: unknown) {
      if (err instanceof SiteContextError) return res.status(err.statusCode).json({ error: err.message });
      logger.error('GET /api/audits/records', err);
      res.status(500).json({ error: 'Failed to fetch audit records' });
    }
  });

  app.post('/api/audits/records', requireAuth, async (req, res) => {
    try {
      if (!isMgr(req)) return res.status(403).json({ error: 'Manager or Admin role required.' });
      const parsed = isolatedSchema.insertAuditRecordSchema.parse(req.body);
      const { db: custDb, siteId } = await getScopedDb(req);
      const [record] = await custDb.insert(isolatedSchema.auditRecords)
        .values(withSiteId(siteId, parsed)).returning();
      res.status(201).json(record);
    } catch (err: unknown) {
      if (err instanceof SiteContextError) return res.status(err.statusCode).json({ error: err.message });
      logger.error('POST /api/audits/records', err);
      res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to create audit record' });
    }
  });

  app.get('/api/audits/records/:id', requireAuth, async (req, res) => {
    try {
      const { db: custDb, siteContext } = await getScopedDb(req);
      const [record] = await custDb.select().from(isolatedSchema.auditRecords)
        .where(and(eq(isolatedSchema.auditRecords.id, req.params.id), scopedWhere(siteContext, isolatedSchema.auditRecords)));
      if (!record) return res.status(404).json({ error: 'Audit record not found' });
      const items = await custDb.select().from(isolatedSchema.auditRecordItems)
        .where(eq(isolatedSchema.auditRecordItems.auditId, req.params.id))
        .orderBy(isolatedSchema.auditRecordItems.sortOrder);
      const actions = await custDb.select().from(isolatedSchema.auditCorrectiveActions)
        .where(eq(isolatedSchema.auditCorrectiveActions.auditId, req.params.id))
        .orderBy(desc(isolatedSchema.auditCorrectiveActions.createdAt));
      res.json({ record, items, actions });
    } catch (error: unknown) {
      logger.error('GET /api/audits/records/:id', error);
      res.status(500).json({ error: 'Failed to fetch audit record' });
    }
  });

  app.put('/api/audits/records/:id', requireAuth, async (req, res) => {
    try {
      if (!isMgr(req)) return res.status(403).json({ error: 'Manager or Admin role required.' });
      const { db: custDb, siteContext } = await getScopedDb(req);
      // Fix 3: Strip read-only/server-computed fields before parsing to prevent score tampering.
      const { overallScore: _s, passed: _p, status: _st, conductedAt: _ca,
              accessToken: _at, accessTokenExpiresAt: _ate,
              deletedAt: _da, deletedBy: _db, completedBy: _cb, ...safeBody } = req.body;
      const parsed = isolatedSchema.insertAuditRecordSchema.partial().parse(safeBody);
      const [record] = await custDb.update(isolatedSchema.auditRecords)
        .set({ ...parsed, updatedAt: new Date() })
        .where(and(eq(isolatedSchema.auditRecords.id, req.params.id), isNull(isolatedSchema.auditRecords.deletedAt), scopedWhere(siteContext, isolatedSchema.auditRecords)))
        .returning();
      if (!record) return res.status(404).json({ error: 'Audit record not found' });
      res.json(record);
    } catch (error: unknown) {
      logger.error('PUT /api/audits/records/:id', error);
      res.status(400).json({ error: error instanceof Error ? error.message : 'Failed to update audit record' });
    }
  });

  app.delete('/api/audits/records/:id', requireAuth, async (req, res) => {
    try {
      if (!isMgr(req)) return res.status(403).json({ error: 'Manager or Admin role required.' });
      const { db: custDb, siteContext } = await getScopedDb(req);
      const [existing] = await custDb.select().from(isolatedSchema.auditRecords)
        .where(and(eq(isolatedSchema.auditRecords.id, req.params.id), isNull(isolatedSchema.auditRecords.deletedAt), scopedWhere(siteContext, isolatedSchema.auditRecords)));
      if (!existing) return res.status(404).json({ error: 'Audit record not found' });
      // Fix 1: Block deletion of completed audits.
      if (existing.status === 'completed') {
        return res.status(403).json({ error: 'Completed audit records cannot be deleted.' });
      }
      await custDb.update(isolatedSchema.auditRecords)
        .set({ deletedAt: new Date(), deletedBy: req.user!.name || req.user!.username })
        .where(eq(isolatedSchema.auditRecords.id, req.params.id));
      await appendAuditLog(custDb, {
        auditId: req.params.id,
        actorName: req.user!.name || req.user!.username,
        action: 'record.deleted',
        detail: `Audit record soft-deleted (was ${existing.status})`,
      });
      res.json({ ok: true });
    } catch (error: unknown) {
      logger.error('DELETE /api/audits/records/:id', error);
      res.status(500).json({ error: 'Failed to delete audit record' });
    }
  });

  app.post('/api/audits/records/:id/start', requireAuth, async (req, res) => {
    try {
      const { db: custDb, siteContext } = await getScopedDb(req);
      const [record] = await custDb.select().from(isolatedSchema.auditRecords)
        .where(and(eq(isolatedSchema.auditRecords.id, req.params.id), scopedWhere(siteContext, isolatedSchema.auditRecords)));
      if (!record) return res.status(404).json({ error: 'Audit record not found' });
      if (record.status !== 'scheduled' && record.status !== 'overdue') {
        return res.status(400).json({ error: `Cannot start an audit with status: ${record.status}` });
      }
      const existingItems = await custDb.select().from(isolatedSchema.auditRecordItems)
        .where(eq(isolatedSchema.auditRecordItems.auditId, record.id));
      if (existingItems.length === 0 && record.templateId) {
        const templateItems = await custDb.select().from(isolatedSchema.auditTemplateItems)
          .where(eq(isolatedSchema.auditTemplateItems.templateId, record.templateId))
          .orderBy(isolatedSchema.auditTemplateItems.sortOrder);
        if (templateItems.length > 0) {
          const rows = templateItems.map(ti => ({
            auditId: record.id,
            templateItemId: ti.id,
            question: ti.question,
            isCritical: ti.isCritical,
            sortOrder: ti.sortOrder,
          }));
          await custDb.insert(isolatedSchema.auditRecordItems).values(rows);
        }
      }
      const [updated] = await custDb.update(isolatedSchema.auditRecords)
        .set({ status: 'in_progress', updatedAt: new Date() })
        .where(eq(isolatedSchema.auditRecords.id, record.id))
        .returning();
      const items = await custDb.select().from(isolatedSchema.auditRecordItems)
        .where(eq(isolatedSchema.auditRecordItems.auditId, record.id))
        .orderBy(isolatedSchema.auditRecordItems.sortOrder);
      res.json({ record: updated, items });
    } catch (error: unknown) {
      logger.error('POST /api/audits/records/:id/start', error);
      res.status(500).json({ error: 'Failed to start audit' });
    }
  });

  app.post('/api/audits/records/:id/submit', requireAuth, async (req, res) => {
    try {
      const { db: custDb, siteContext } = await getScopedDb(req);
      const [record] = await custDb.select().from(isolatedSchema.auditRecords)
        .where(and(eq(isolatedSchema.auditRecords.id, req.params.id), scopedWhere(siteContext, isolatedSchema.auditRecords)));
      if (!record) return res.status(404).json({ error: 'Audit record not found' });
      const items = await custDb.select().from(isolatedSchema.auditRecordItems)
        .where(eq(isolatedSchema.auditRecordItems.auditId, req.params.id));
      const passCount = items.filter(i => i.response === 'pass').length;
      const failCount = items.filter(i => i.response === 'fail').length;
      const naCount = items.filter(i => i.response === 'na').length;
      const scoreable = passCount + failCount;
      const score = scoreable > 0 ? Math.round((passCount / scoreable) * 100) : 100;
      const hasCriticalFail = items.some(i => i.isCritical && i.response === 'fail');
      let template = null;
      if (record.templateId) {
        const [t] = await custDb.select().from(isolatedSchema.auditTemplates)
          .where(eq(isolatedSchema.auditTemplates.id, record.templateId));
        template = t;
      }
      const passThreshold = template?.passScore ?? 80;
      const passed = hasCriticalFail ? false : score >= passThreshold;
      const summary = req.body.summary || record.summary || null;
      const completedByName = req.body.completedByName || req.user!.name || req.user!.username;
      const [updated] = await custDb.update(isolatedSchema.auditRecords)
        .set({ status: 'completed', overallScore: score, passed, conductedAt: new Date(), summary, completedBy: completedByName, updatedAt: new Date() })
        .where(eq(isolatedSchema.auditRecords.id, req.params.id))
        .returning();

      // Auto-create corrective actions for all failed items (skip any already raised)
      let autoActionsCreated = 0;
      const failedItems = items.filter(i => i.response === 'fail');
      if (failedItems.length > 0) {
        const existingActions = await custDb.select().from(isolatedSchema.auditCorrectiveActions)
          .where(eq(isolatedSchema.auditCorrectiveActions.auditId, req.params.id));
        const existingItemIds = new Set(existingActions.map(a => a.auditItemId).filter(Boolean));
        const newActions = failedItems
          .filter(item => !existingItemIds.has(item.id))
          .map(item => ({
            auditId: req.params.id,
            auditItemId: item.id,
            title: `Failed: ${item.question}`,
            description: item.note || null,
            priority: (item.isCritical ? 'high' : 'medium') as 'high' | 'medium',
            status: 'open' as const,
          }));
        if (newActions.length > 0) {
          await custDb.insert(isolatedSchema.auditCorrectiveActions).values(newActions);
          autoActionsCreated = newActions.length;
        }
      }

      await appendAuditLog(custDb, {
        auditId: req.params.id,
        actorName: completedByName,
        action: 'record.completed',
        detail: `Desktop audit submitted. Score: ${score}%, ${passed ? 'PASSED' : 'FAILED'}`,
      });
      res.json({ record: updated, overallScore: score, passed, passCount, failCount, naCount, items, autoActionsCreated });
    } catch (error: unknown) {
      logger.error('POST /api/audits/records/:id/submit', error);
      res.status(500).json({ error: 'Failed to submit audit' });
    }
  });

  app.get('/api/audits/records/:id/token', requireAuth, async (req, res) => {
    try {
      const { db: custDb, siteContext } = await getScopedDb(req);
      const token = `${req.customerId}.${randomBytes(24).toString('hex')}`;
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      const [record] = await custDb.update(isolatedSchema.auditRecords)
        .set({ accessToken: token, accessTokenExpiresAt: expiresAt, updatedAt: new Date() })
        .where(and(eq(isolatedSchema.auditRecords.id, req.params.id), scopedWhere(siteContext, isolatedSchema.auditRecords)))
        .returning();
      if (!record) return res.status(404).json({ error: 'Audit record not found' });
      res.json({ token, expiresAt });
    } catch (error: unknown) {
      logger.error('GET /api/audits/records/:id/token', error);
      res.status(500).json({ error: 'Failed to generate access token' });
    }
  });

  // Send audit mobile link by email to a staff member
  app.post('/api/audits/records/:id/send-link', requireAuth, async (req, res) => {
    try {
      const context = simpleDatabaseService.createCustomerContext(req.user!.username, req.customerId);
      const { db: custDb, siteContext } = await getScopedDb(req);
      const { staffEmail, staffName } = req.body;
      if (!staffEmail) return res.status(400).json({ error: 'Staff email is required' });

      const token = `${req.customerId}.${randomBytes(24).toString('hex')}`;
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      const [record] = await custDb.update(isolatedSchema.auditRecords)
        .set({ accessToken: token, accessTokenExpiresAt: expiresAt, updatedAt: new Date() })
        .where(and(eq(isolatedSchema.auditRecords.id, req.params.id), scopedWhere(siteContext, isolatedSchema.auditRecords)))
        .returning();
      if (!record) return res.status(404).json({ error: 'Audit record not found' });

      const link = `${req.protocol}://${req.get('host')}/audit/complete/${token}`;
      const settings = await simpleDatabaseService.getCompanySettings(context);
      const companyName = settings?.companyName || 'TPR Max';
      const assignee = staffName || staffEmail;
      const dueDateStr = record.scheduledDate ? new Date(record.scheduledDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : 'As soon as possible';

      const html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #f8fafc; padding: 24px;">
          <div style="background: #1e3a5f; border-radius: 12px 12px 0 0; padding: 24px; text-align: center;">
            <h1 style="color: white; margin: 0; font-size: 22px;">${companyName}</h1>
            <p style="color: #93c5fd; margin: 6px 0 0; font-size: 14px;">Audit &amp; Inspection</p>
          </div>
          <div style="background: white; border-radius: 0 0 12px 12px; padding: 32px;">
            <p style="color: #334155; font-size: 16px; margin: 0 0 8px;">Hi ${assignee},</p>
            <p style="color: #64748b; font-size: 15px; margin: 0 0 24px;">You have been assigned an audit inspection to complete. Please use the link below on your mobile device to carry out the inspection, record your findings, and submit the results.</p>
            <div style="background: #f1f5f9; border-radius: 8px; padding: 20px; margin-bottom: 24px;">
              <table style="width: 100%; border-collapse: collapse;">
                <tr><td style="color: #94a3b8; font-size: 12px; padding: 4px 0; width: 130px;">Audit Title</td><td style="color: #1e293b; font-size: 14px; font-weight: 600; padding: 4px 0;">${record.title}</td></tr>
                <tr><td style="color: #94a3b8; font-size: 12px; padding: 4px 0;">Category</td><td style="color: #1e293b; font-size: 14px; padding: 4px 0; text-transform: capitalize;">${record.category}</td></tr>
                ${record.location ? `<tr><td style="color: #94a3b8; font-size: 12px; padding: 4px 0;">Location</td><td style="color: #1e293b; font-size: 14px; padding: 4px 0;">${record.location}</td></tr>` : ''}
                <tr><td style="color: #94a3b8; font-size: 12px; padding: 4px 0;">Due Date</td><td style="color: #1e293b; font-size: 14px; padding: 4px 0;">${dueDateStr}</td></tr>
              </table>
            </div>
            <div style="text-align: center; margin-bottom: 24px;">
              <a href="${link}" style="display: inline-block; background: #2563eb; color: white; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-size: 16px; font-weight: 600;">Open Inspection on Mobile →</a>
            </div>
            <p style="color: #94a3b8; font-size: 12px; text-align: center; margin: 0;">This link expires on ${expiresAt.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}. Do not share it with others.</p>
          </div>
          <p style="color: #cbd5e1; font-size: 11px; text-align: center; margin-top: 16px;">${companyName} · Powered by TPR Max</p>
        </div>`;

      const emailSvc = new EmailService(context.customerId);
      const emailSent = await emailSvc.sendEmail({
        to: staffEmail,
        subject: `[${companyName}] Inspection Assigned: ${record.title}`,
        html,
        companyName,
      });

      res.json({ ok: true, link, token, emailSent });
    } catch (error: unknown) {
      logger.error('POST /api/audits/records/:id/send-link', error);
      res.status(500).json({ error: 'Failed to send audit link' });
    }
  });

  // ── RECORD ITEMS (auto-save during audit) ────────────────────────────────

  app.put('/api/audits/records/:id/items/:itemId', requireAuth, async (req, res) => {
    try {
      const { db: custDb, siteContext } = await getScopedDb(req);
      const [parentAudit] = await custDb.select({ id: isolatedSchema.auditRecords.id })
        .from(isolatedSchema.auditRecords)
        .where(and(eq(isolatedSchema.auditRecords.id, req.params.id), scopedWhere(siteContext, isolatedSchema.auditRecords)));
      if (!parentAudit) return res.status(404).json({ error: 'Audit record not found' });
      const { response, note, photoUrl, photoFileName } = req.body;
      const [item] = await custDb.update(isolatedSchema.auditRecordItems)
        .set({ response, note, photoUrl, photoFileName })
        .where(and(
          eq(isolatedSchema.auditRecordItems.id, req.params.itemId),
          eq(isolatedSchema.auditRecordItems.auditId, req.params.id)
        ))
        .returning();
      if (!item) return res.status(404).json({ error: 'Item not found' });
      res.json(item);
    } catch (error: unknown) {
      logger.error('PUT /api/audits/records/:id/items/:itemId', error);
      res.status(500).json({ error: 'Failed to update item' });
    }
  });

  // ── CORRECTIVE ACTIONS ────────────────────────────────────────────────────

  app.get('/api/audits/records/:id/actions', requireAuth, async (req, res) => {
    try {
      const { db: custDb, siteContext } = await getScopedDb(req);
      const [parentAudit] = await custDb.select({ id: isolatedSchema.auditRecords.id })
        .from(isolatedSchema.auditRecords)
        .where(and(eq(isolatedSchema.auditRecords.id, req.params.id), scopedWhere(siteContext, isolatedSchema.auditRecords)));
      if (!parentAudit) return res.status(404).json({ error: 'Audit record not found' });
      const actions = await custDb.select().from(isolatedSchema.auditCorrectiveActions)
        .where(and(
          eq(isolatedSchema.auditCorrectiveActions.auditId, req.params.id),
          isNull(isolatedSchema.auditCorrectiveActions.deletedAt)
        ))
        .orderBy(desc(isolatedSchema.auditCorrectiveActions.createdAt));
      res.json(actions);
    } catch (error: unknown) {
      logger.error('GET /api/audits/records/:id/actions', error);
      res.status(500).json({ error: 'Failed to fetch corrective actions' });
    }
  });

  app.post('/api/audits/records/:id/actions', requireAuth, async (req, res) => {
    try {
      if (!isMgr(req)) return res.status(403).json({ error: 'Manager or Admin role required.' });
      const { db: custDb, siteContext } = await getScopedDb(req);
      const [parentAudit] = await custDb.select({ id: isolatedSchema.auditRecords.id })
        .from(isolatedSchema.auditRecords)
        .where(and(eq(isolatedSchema.auditRecords.id, req.params.id), scopedWhere(siteContext, isolatedSchema.auditRecords)));
      if (!parentAudit) return res.status(404).json({ error: 'Audit record not found' });
      const parsed = isolatedSchema.insertAuditCorrectiveActionSchema.parse({ ...req.body, auditId: req.params.id });
      const [action] = await custDb.insert(isolatedSchema.auditCorrectiveActions).values(parsed).returning();
      res.status(201).json(action);
    } catch (error: unknown) {
      logger.error('POST /api/audits/records/:id/actions', error);
      res.status(400).json({ error: error instanceof Error ? error.message : 'Failed to create corrective action' });
    }
  });

  app.get('/api/audits/actions', requireAuth, async (req, res) => {
    try {
      const context = simpleDatabaseService.createCustomerContext(req.user!.username, req.customerId);
      const custDb = await customerDbService.getCustomerDatabase(context.customerId);
      const actions = await custDb.select().from(isolatedSchema.auditCorrectiveActions)
        .where(isNull(isolatedSchema.auditCorrectiveActions.deletedAt))
        .orderBy(desc(isolatedSchema.auditCorrectiveActions.createdAt));
      res.json(actions);
    } catch (error: unknown) {
      logger.error('GET /api/audits/actions', error);
      res.status(500).json({ error: 'Failed to fetch corrective actions' });
    }
  });

  app.put('/api/audits/actions/:id', requireAuth, async (req, res) => {
    try {
      const context = simpleDatabaseService.createCustomerContext(req.user!.username, req.customerId);
      const custDb = await customerDbService.getCustomerDatabase(context.customerId);
      const parsed = isolatedSchema.insertAuditCorrectiveActionSchema.partial().parse(req.body);
      const [action] = await custDb.update(isolatedSchema.auditCorrectiveActions)
        .set({ ...parsed, updatedAt: new Date() })
        .where(eq(isolatedSchema.auditCorrectiveActions.id, req.params.id))
        .returning();
      if (!action) return res.status(404).json({ error: 'Action not found' });
      res.json(action);
    } catch (error: unknown) {
      logger.error('PUT /api/audits/actions/:id', error);
      res.status(400).json({ error: error instanceof Error ? error.message : 'Failed to update action' });
    }
  });

  app.delete('/api/audits/actions/:id', requireAuth, async (req, res) => {
    try {
      if (!isMgr(req)) return res.status(403).json({ error: 'Manager or Admin role required.' });
      const context = simpleDatabaseService.createCustomerContext(req.user!.username, req.customerId);
      const custDb = await customerDbService.getCustomerDatabase(context.customerId);
      const [existing] = await custDb.select().from(isolatedSchema.auditCorrectiveActions)
        .where(eq(isolatedSchema.auditCorrectiveActions.id, req.params.id));
      if (!existing) return res.status(404).json({ error: 'Action not found' });
      await custDb.update(isolatedSchema.auditCorrectiveActions)
        .set({ deletedAt: new Date(), deletedBy: req.user!.name || req.user!.username })
        .where(eq(isolatedSchema.auditCorrectiveActions.id, req.params.id));
      await appendAuditLog(custDb, {
        auditId: existing.auditId,
        actorName: req.user!.name || req.user!.username,
        action: 'action.deleted',
        detail: `Corrective action soft-deleted: "${existing.title}"`,
      });
      res.json({ ok: true });
    } catch (error: unknown) {
      logger.error('DELETE /api/audits/actions/:id', error);
      res.status(500).json({ error: 'Failed to delete action' });
    }
  });

  app.post('/api/audits/actions/:id/close', requireAuth, async (req, res) => {
    try {
      const context = simpleDatabaseService.createCustomerContext(req.user!.username, req.customerId);
      const custDb = await customerDbService.getCustomerDatabase(context.customerId);
      const { closureNotes, closureEvidenceUrl, closureEvidenceFileName } = req.body;
      if (!closureNotes) return res.status(400).json({ error: 'Closure notes are required' });
      const [action] = await custDb.update(isolatedSchema.auditCorrectiveActions)
        .set({
          status: 'completed',
          closureNotes,
          closureEvidenceUrl: closureEvidenceUrl || null,
          closureEvidenceFileName: closureEvidenceFileName || null,
          closedAt: new Date(),
          closedBy: req.user!.name || req.user!.username,
          updatedAt: new Date(),
        })
        .where(eq(isolatedSchema.auditCorrectiveActions.id, req.params.id))
        .returning();
      if (!action) return res.status(404).json({ error: 'Action not found' });
      await appendAuditLog(custDb, {
        auditId: action.auditId,
        actorName: req.user!.name || req.user!.username,
        action: 'action.closed',
        detail: `Corrective action closed: "${action.title}"`,
      });
      res.json(action);
    } catch (error: unknown) {
      logger.error('POST /api/audits/actions/:id/close', error);
      res.status(500).json({ error: 'Failed to close action' });
    }
  });

  // ── DASHBOARD SUMMARY ─────────────────────────────────────────────────────

  app.get('/api/audits/summary', requireAuth, async (req, res) => {
    try {
      const { db: custDb, siteContext } = await getScopedDb(req);
      const siteFilter = scopedWhere(siteContext, isolatedSchema.auditRecords);
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const ninetyDaysAgo = new Date(today); ninetyDaysAgo.setDate(today.getDate() - 90);
      const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

      // Fix 8: Use DB aggregation instead of loading all rows into JS.
      const [{ totalScheduled }] = await custDb.select({ totalScheduled: count() })
        .from(isolatedSchema.auditRecords)
        .where(and(eq(isolatedSchema.auditRecords.status, 'scheduled'), isNull(isolatedSchema.auditRecords.deletedAt), siteFilter));
      const [{ overdueCount }] = await custDb.select({ overdueCount: count() })
        .from(isolatedSchema.auditRecords)
        .where(and(eq(isolatedSchema.auditRecords.status, 'overdue'), isNull(isolatedSchema.auditRecords.deletedAt), siteFilter));
      const [{ completedThisMonth }] = await custDb.select({ completedThisMonth: count() })
        .from(isolatedSchema.auditRecords)
        .where(and(
          eq(isolatedSchema.auditRecords.status, 'completed'),
          gte(isolatedSchema.auditRecords.conductedAt, firstOfMonth),
          isNull(isolatedSchema.auditRecords.deletedAt),
          siteFilter
        ));
      const [{ openActions }] = await custDb.select({ openActions: count() })
        .from(isolatedSchema.auditCorrectiveActions)
        .where(and(
          or(eq(isolatedSchema.auditCorrectiveActions.status, 'open'), eq(isolatedSchema.auditCorrectiveActions.status, 'in_progress')),
          isNull(isolatedSchema.auditCorrectiveActions.deletedAt)
        ));
      const [{ overdueActions }] = await custDb.select({ overdueActions: count() })
        .from(isolatedSchema.auditCorrectiveActions)
        .where(and(eq(isolatedSchema.auditCorrectiveActions.status, 'overdue'), isNull(isolatedSchema.auditCorrectiveActions.deletedAt)));
      const [{ last90Total }] = await custDb.select({ last90Total: count() })
        .from(isolatedSchema.auditRecords)
        .where(and(
          eq(isolatedSchema.auditRecords.status, 'completed'),
          gte(isolatedSchema.auditRecords.conductedAt, ninetyDaysAgo),
          isNull(isolatedSchema.auditRecords.deletedAt),
          siteFilter
        ));
      const [{ last90Passed }] = await custDb.select({ last90Passed: count() })
        .from(isolatedSchema.auditRecords)
        .where(and(
          eq(isolatedSchema.auditRecords.status, 'completed'),
          eq(isolatedSchema.auditRecords.passed, true),
          gte(isolatedSchema.auditRecords.conductedAt, ninetyDaysAgo),
          isNull(isolatedSchema.auditRecords.deletedAt),
          siteFilter
        ));
      const passRate = Number(last90Total) > 0
        ? Math.round((Number(last90Passed) / Number(last90Total)) * 100)
        : 0;

      const recentAudits = await custDb.select().from(isolatedSchema.auditRecords)
        .where(and(eq(isolatedSchema.auditRecords.status, 'completed'), isNull(isolatedSchema.auditRecords.deletedAt), siteFilter))
        .orderBy(desc(isolatedSchema.auditRecords.conductedAt))
        .limit(10);

      const upcomingAudits = await custDb.select().from(isolatedSchema.auditRecords)
        .where(and(eq(isolatedSchema.auditRecords.status, 'scheduled'), isNull(isolatedSchema.auditRecords.deletedAt), siteFilter))
        .orderBy(isolatedSchema.auditRecords.scheduledDate)
        .limit(10);

      res.json({
        totalScheduled: Number(totalScheduled),
        overdueCount: Number(overdueCount),
        completedThisMonth: Number(completedThisMonth),
        openActions: Number(openActions),
        overdueActions: Number(overdueActions),
        passRate,
        recentAudits,
        upcomingAudits,
      });
    } catch (error: unknown) {
      logger.error('GET /api/audits/summary', error);
      res.status(500).json({ error: 'Failed to fetch audit summary' });
    }
  });

  // ── CRON: daily overdue check at 08:00 Europe/London ─────────────────────
  cron.schedule('0 8 * * *', async () => {
    try {
      logger.info('🔍 [Audit Cron] Running daily overdue check…');
      const allCustomers = await customerDbService.getAllCustomers();
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const todayStr = today.toISOString().split('T')[0];
      for (const customer of allCustomers) {
        try {
          const custDb = await customerDbService.getCustomerDatabase(customer.id);
          const records = await custDb.select().from(isolatedSchema.auditRecords)
            .where(eq(isolatedSchema.auditRecords.status, 'scheduled'));
          let markedOverdue = 0;
          for (const record of records) {
            if (record.scheduledDate && record.scheduledDate < todayStr && !record.overdueAlertedAt) {
              await custDb.update(isolatedSchema.auditRecords)
                .set({ status: 'overdue', overdueAlertedAt: new Date(), updatedAt: new Date() })
                .where(eq(isolatedSchema.auditRecords.id, record.id));
              markedOverdue++;
            }
          }
          const actions = await custDb.select().from(isolatedSchema.auditCorrectiveActions)
            .where(or(
              eq(isolatedSchema.auditCorrectiveActions.status, 'open'),
              eq(isolatedSchema.auditCorrectiveActions.status, 'in_progress')
            ));
          let markedActionsOverdue = 0;
          for (const action of actions) {
            if (action.dueDate && action.dueDate < todayStr) {
              await custDb.update(isolatedSchema.auditCorrectiveActions)
                .set({ status: 'overdue', updatedAt: new Date() })
                .where(eq(isolatedSchema.auditCorrectiveActions.id, action.id));
              markedActionsOverdue++;
            }
          }
          if (markedOverdue > 0 || markedActionsOverdue > 0) {
            logger.info(`✅ [Audit Cron] ${customer.id}: ${markedOverdue} audits overdue, ${markedActionsOverdue} actions overdue`);
          }
        } catch (err: any) {
          logger.warn(`⚠️ [Audit Cron] Failed for customer ${customer.id}: ${err.message}`);
        }
      }
    } catch (error: unknown) {
      logger.error('[Audit Cron] Fatal error', error);
    }
  }, { timezone: 'Europe/London' });
}
