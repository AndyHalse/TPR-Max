import type { Express } from 'express';
import { randomBytes } from 'crypto';
import cron from 'node-cron';
import { requireAuth } from '../auth';
import { customerDbService } from '../customerDatabase';
import { simpleDatabaseService } from '../simpleDatabaseService';
import { ObjectStorageService } from '../objectStorage';
import { logger } from '../utils/logger';
import * as isolatedSchema from '../isolatedSchema';
import { eq, and, sql, desc, or, lt, isNull, inArray, count } from 'drizzle-orm';

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

// ── Public rate limiter (simple in-memory) ───────────────────────────────────
const publicRateLimitMap = new Map<string, { count: number; resetAt: number }>();
function auditPublicRateLimit(req: any, res: any, next: any) {
  const ip = req.ip ?? 'unknown';
  const now = Date.now();
  const entry = publicRateLimitMap.get(ip);
  if (!entry || entry.resetAt < now) {
    publicRateLimitMap.set(ip, { count: 1, resetAt: now + 60000 });
    return next();
  }
  entry.count++;
  if (entry.count > 60) {
    return res.status(429).json({ error: 'Too many requests. Please try again later.' });
  }
  next();
}

export function registerAuditEngineRoutes(app: Express): void {

  // ── PUBLIC ENDPOINTS (registered BEFORE auth middleware) ─────────────────

  app.get('/api/audits/public/:token', auditPublicRateLimit, async (req, res) => {
    try {
      const { token } = req.params;
      const allCustomers = await customerDbService.getAllCustomers();
      for (const customer of allCustomers) {
        const custDb = await customerDbService.getCustomerDatabase(customer.id);
        const [record] = await custDb.select().from(isolatedSchema.auditRecords)
          .where(eq(isolatedSchema.auditRecords.accessToken, token));
        if (record) {
          if (record.accessTokenExpiresAt && new Date(record.accessTokenExpiresAt) < new Date()) {
            return res.status(410).json({ error: 'This link has expired. Please request a new one.' });
          }
          const items = await custDb.select().from(isolatedSchema.auditRecordItems)
            .where(eq(isolatedSchema.auditRecordItems.auditId, record.id))
            .orderBy(isolatedSchema.auditRecordItems.sortOrder);
          return res.json({ record, items });
        }
      }
      return res.status(404).json({ error: 'Audit not found or link is invalid.' });
    } catch (error: unknown) {
      logger.error('GET /api/audits/public/:token', error);
      res.status(500).json({ error: 'Failed to load audit' });
    }
  });

  app.put('/api/audits/public/:token', auditPublicRateLimit, async (req, res) => {
    try {
      const { token } = req.params;
      const { itemId, response, note, photoUrl, photoFileName } = req.body;
      const allCustomers = await customerDbService.getAllCustomers();
      for (const customer of allCustomers) {
        const custDb = await customerDbService.getCustomerDatabase(customer.id);
        const [record] = await custDb.select().from(isolatedSchema.auditRecords)
          .where(eq(isolatedSchema.auditRecords.accessToken, token));
        if (record) {
          if (record.accessTokenExpiresAt && new Date(record.accessTokenExpiresAt) < new Date()) {
            return res.status(410).json({ error: 'This link has expired.' });
          }
          await custDb.update(isolatedSchema.auditRecordItems)
            .set({ response, note, photoUrl, photoFileName })
            .where(and(
              eq(isolatedSchema.auditRecordItems.id, itemId),
              eq(isolatedSchema.auditRecordItems.auditId, record.id)
            ));
          return res.json({ ok: true });
        }
      }
      return res.status(404).json({ error: 'Audit not found.' });
    } catch (error: unknown) {
      logger.error('PUT /api/audits/public/:token', error);
      res.status(500).json({ error: 'Failed to update item' });
    }
  });

  app.post('/api/audits/public/:token/submit', auditPublicRateLimit, async (req, res) => {
    try {
      const { token } = req.params;
      const { summary } = req.body;
      const allCustomers = await customerDbService.getAllCustomers();
      for (const customer of allCustomers) {
        const custDb = await customerDbService.getCustomerDatabase(customer.id);
        const [record] = await custDb.select().from(isolatedSchema.auditRecords)
          .where(eq(isolatedSchema.auditRecords.accessToken, token));
        if (record) {
          if (record.accessTokenExpiresAt && new Date(record.accessTokenExpiresAt) < new Date()) {
            return res.status(410).json({ error: 'This link has expired.' });
          }
          const items = await custDb.select().from(isolatedSchema.auditRecordItems)
            .where(eq(isolatedSchema.auditRecordItems.auditId, record.id));
          const passCount = items.filter(i => i.response === 'pass').length;
          const failCount = items.filter(i => i.response === 'fail').length;
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
          const [updated] = await custDb.update(isolatedSchema.auditRecords)
            .set({ status: 'completed', overallScore: score, passed, conductedAt: new Date(), summary: summary || null, updatedAt: new Date() })
            .where(eq(isolatedSchema.auditRecords.id, record.id))
            .returning();
          return res.json({ record: updated, overallScore: score, passed, passCount, failCount, naCount: items.filter(i => i.response === 'na').length });
        }
      }
      return res.status(404).json({ error: 'Audit not found.' });
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
      const allCustomers = await customerDbService.getAllCustomers();
      for (const customer of allCustomers) {
        const custDb = await customerDbService.getCustomerDatabase(customer.id);
        const [record] = await custDb.select().from(isolatedSchema.auditRecords)
          .where(eq(isolatedSchema.auditRecords.accessToken, token));
        if (record) {
          if (record.accessTokenExpiresAt && new Date(record.accessTokenExpiresAt) < new Date()) {
            return res.status(410).json({ error: 'This link has expired.' });
          }
          const buffer = Buffer.from(data, 'base64');
          const storage = new ObjectStorageService();
          const uploadPath = `audit-photos/${record.id}/${Date.now()}-${fileName}`;
          const fileUrl = await storage.uploadFile(buffer, uploadPath, mimeType);
          if (itemId) {
            await custDb.update(isolatedSchema.auditRecordItems)
              .set({ photoUrl: fileUrl, photoFileName: fileName })
              .where(and(
                eq(isolatedSchema.auditRecordItems.id, itemId),
                eq(isolatedSchema.auditRecordItems.auditId, record.id)
              ));
          }
          return res.json({ fileUrl, fileName });
        }
      }
      return res.status(404).json({ error: 'Audit not found.' });
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
      const context = simpleDatabaseService.createCustomerContext(req.user!.username, req.customerId);
      const custDb = await customerDbService.getCustomerDatabase(context.customerId);
      await custDb.delete(isolatedSchema.auditTemplates)
        .where(eq(isolatedSchema.auditTemplates.id, req.params.id));
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
      const context = simpleDatabaseService.createCustomerContext(req.user!.username, req.customerId);
      const custDb = await customerDbService.getCustomerDatabase(context.customerId);
      const records = await custDb.select().from(isolatedSchema.auditRecords)
        .orderBy(desc(isolatedSchema.auditRecords.createdAt));
      res.json(records);
    } catch (error: unknown) {
      logger.error('GET /api/audits/records', error);
      res.status(500).json({ error: 'Failed to fetch audit records' });
    }
  });

  app.post('/api/audits/records', requireAuth, async (req, res) => {
    try {
      const parsed = isolatedSchema.insertAuditRecordSchema.parse(req.body);
      const context = simpleDatabaseService.createCustomerContext(req.user!.username, req.customerId);
      const custDb = await customerDbService.getCustomerDatabase(context.customerId);
      const [record] = await custDb.insert(isolatedSchema.auditRecords).values(parsed).returning();
      res.status(201).json(record);
    } catch (error: unknown) {
      logger.error('POST /api/audits/records', error);
      res.status(400).json({ error: error instanceof Error ? error.message : 'Failed to create audit record' });
    }
  });

  app.get('/api/audits/records/:id', requireAuth, async (req, res) => {
    try {
      const context = simpleDatabaseService.createCustomerContext(req.user!.username, req.customerId);
      const custDb = await customerDbService.getCustomerDatabase(context.customerId);
      const [record] = await custDb.select().from(isolatedSchema.auditRecords)
        .where(eq(isolatedSchema.auditRecords.id, req.params.id));
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
      const context = simpleDatabaseService.createCustomerContext(req.user!.username, req.customerId);
      const custDb = await customerDbService.getCustomerDatabase(context.customerId);
      const parsed = isolatedSchema.insertAuditRecordSchema.partial().parse(req.body);
      const [record] = await custDb.update(isolatedSchema.auditRecords)
        .set({ ...parsed, updatedAt: new Date() })
        .where(eq(isolatedSchema.auditRecords.id, req.params.id))
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
      const context = simpleDatabaseService.createCustomerContext(req.user!.username, req.customerId);
      const custDb = await customerDbService.getCustomerDatabase(context.customerId);
      await custDb.delete(isolatedSchema.auditRecords)
        .where(eq(isolatedSchema.auditRecords.id, req.params.id));
      res.json({ ok: true });
    } catch (error: unknown) {
      logger.error('DELETE /api/audits/records/:id', error);
      res.status(500).json({ error: 'Failed to delete audit record' });
    }
  });

  app.post('/api/audits/records/:id/start', requireAuth, async (req, res) => {
    try {
      const context = simpleDatabaseService.createCustomerContext(req.user!.username, req.customerId);
      const custDb = await customerDbService.getCustomerDatabase(context.customerId);
      const [record] = await custDb.select().from(isolatedSchema.auditRecords)
        .where(eq(isolatedSchema.auditRecords.id, req.params.id));
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
      const context = simpleDatabaseService.createCustomerContext(req.user!.username, req.customerId);
      const custDb = await customerDbService.getCustomerDatabase(context.customerId);
      const [record] = await custDb.select().from(isolatedSchema.auditRecords)
        .where(eq(isolatedSchema.auditRecords.id, req.params.id));
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
      const [updated] = await custDb.update(isolatedSchema.auditRecords)
        .set({ status: 'completed', overallScore: score, passed, conductedAt: new Date(), summary, updatedAt: new Date() })
        .where(eq(isolatedSchema.auditRecords.id, req.params.id))
        .returning();
      res.json({ record: updated, overallScore: score, passed, passCount, failCount, naCount, items });
    } catch (error: unknown) {
      logger.error('POST /api/audits/records/:id/submit', error);
      res.status(500).json({ error: 'Failed to submit audit' });
    }
  });

  app.get('/api/audits/records/:id/token', requireAuth, async (req, res) => {
    try {
      const context = simpleDatabaseService.createCustomerContext(req.user!.username, req.customerId);
      const custDb = await customerDbService.getCustomerDatabase(context.customerId);
      const token = randomBytes(24).toString('hex');
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      const [record] = await custDb.update(isolatedSchema.auditRecords)
        .set({ accessToken: token, accessTokenExpiresAt: expiresAt, updatedAt: new Date() })
        .where(eq(isolatedSchema.auditRecords.id, req.params.id))
        .returning();
      if (!record) return res.status(404).json({ error: 'Audit record not found' });
      res.json({ token, expiresAt });
    } catch (error: unknown) {
      logger.error('GET /api/audits/records/:id/token', error);
      res.status(500).json({ error: 'Failed to generate access token' });
    }
  });

  // ── RECORD ITEMS (auto-save during audit) ────────────────────────────────

  app.put('/api/audits/records/:id/items/:itemId', requireAuth, async (req, res) => {
    try {
      const context = simpleDatabaseService.createCustomerContext(req.user!.username, req.customerId);
      const custDb = await customerDbService.getCustomerDatabase(context.customerId);
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
      const context = simpleDatabaseService.createCustomerContext(req.user!.username, req.customerId);
      const custDb = await customerDbService.getCustomerDatabase(context.customerId);
      const actions = await custDb.select().from(isolatedSchema.auditCorrectiveActions)
        .where(eq(isolatedSchema.auditCorrectiveActions.auditId, req.params.id))
        .orderBy(desc(isolatedSchema.auditCorrectiveActions.createdAt));
      res.json(actions);
    } catch (error: unknown) {
      logger.error('GET /api/audits/records/:id/actions', error);
      res.status(500).json({ error: 'Failed to fetch corrective actions' });
    }
  });

  app.post('/api/audits/records/:id/actions', requireAuth, async (req, res) => {
    try {
      const context = simpleDatabaseService.createCustomerContext(req.user!.username, req.customerId);
      const custDb = await customerDbService.getCustomerDatabase(context.customerId);
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
      const context = simpleDatabaseService.createCustomerContext(req.user!.username, req.customerId);
      const custDb = await customerDbService.getCustomerDatabase(context.customerId);
      await custDb.delete(isolatedSchema.auditCorrectiveActions)
        .where(eq(isolatedSchema.auditCorrectiveActions.id, req.params.id));
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
      res.json(action);
    } catch (error: unknown) {
      logger.error('POST /api/audits/actions/:id/close', error);
      res.status(500).json({ error: 'Failed to close action' });
    }
  });

  // ── DASHBOARD SUMMARY ─────────────────────────────────────────────────────

  app.get('/api/audits/summary', requireAuth, async (req, res) => {
    try {
      const context = simpleDatabaseService.createCustomerContext(req.user!.username, req.customerId);
      const custDb = await customerDbService.getCustomerDatabase(context.customerId);
      const allRecords = await custDb.select().from(isolatedSchema.auditRecords)
        .orderBy(desc(isolatedSchema.auditRecords.createdAt));
      const allActions = await custDb.select().from(isolatedSchema.auditCorrectiveActions);
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const ninetyDaysAgo = new Date(today); ninetyDaysAgo.setDate(today.getDate() - 90);
      const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

      const totalScheduled = allRecords.filter(r => r.status === 'scheduled').length;
      const overdueCount = allRecords.filter(r => r.status === 'overdue').length;
      const completedThisMonth = allRecords.filter(r =>
        r.status === 'completed' && r.conductedAt && new Date(r.conductedAt) >= firstOfMonth
      ).length;
      const openActions = allActions.filter(a => a.status === 'open' || a.status === 'in_progress').length;
      const overdueActions = allActions.filter(a => a.status === 'overdue').length;

      const last90Completed = allRecords.filter(r =>
        r.status === 'completed' && r.conductedAt && new Date(r.conductedAt) >= ninetyDaysAgo
      );
      const passRate = last90Completed.length > 0
        ? Math.round((last90Completed.filter(r => r.passed).length / last90Completed.length) * 100)
        : 0;

      const recentAudits = allRecords
        .filter(r => r.status === 'completed')
        .slice(0, 10);

      const upcomingAudits = allRecords
        .filter(r => r.status === 'scheduled' && r.scheduledDate)
        .sort((a, b) => (a.scheduledDate ?? '').localeCompare(b.scheduledDate ?? ''))
        .slice(0, 10);

      res.json({
        totalScheduled,
        overdueCount,
        completedThisMonth,
        openActions,
        overdueActions,
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
