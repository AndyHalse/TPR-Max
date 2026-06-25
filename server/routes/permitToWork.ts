import type { Express } from 'express';
import cron from 'node-cron';
import multer from 'multer';
import { requireAuth } from '../auth';
import { customerDbService } from '../customerDatabase';
import { simpleDatabaseService } from '../simpleDatabaseService';
import { EmailService } from '../emailService';
import { ObjectStorageService, objectStorageClient } from '../objectStorage';
import { randomUUID } from 'crypto';
import * as isolatedSchema from '../isolatedSchema';
import { eq, and, inArray, lt, lte, isNull, sql } from 'drizzle-orm';
import { logger } from '../utils/logger';
import { PTW_CHECKLISTS, PERMIT_TYPE_LABELS, PTW_COMPANY_DOC_LABELS } from '../utils/ptwChecklists';
import { getScopedDb, scopedWhere, withSiteId, SiteContextError } from '../siteScope';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = [
      'application/pdf',
      'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ];
    if (allowed.includes(file.mimetype)) return cb(null, true);
    return cb(new Error('Unsupported file type'));
  },
});
const objectStorage = new ObjectStorageService();

const requirePermitToWorkFeature = async (req: any, res: any, next: any) => {
  try {
    const context = simpleDatabaseService.createCustomerContext(req.user!.username, req.customerId);
    const settings = await simpleDatabaseService.getCompanySettings(context);
    if (!settings?.featurePermitToWork) {
      return res.status(403).json({ error: 'Permit-to-Work module is not enabled for your account.' });
    }
    next();
  } catch (error) {
    next(error);
  }
};

async function generatePermitNumber(custDb: any, year: number): Promise<string> {
  const prefix = `PTW-${year}-`;
  // Query only current year's permits instead of full table scan
  const rows = await custDb.select({ permitNumber: isolatedSchema.permitToWork.permitNumber })
    .from(isolatedSchema.permitToWork)
    .where(sql`permit_number LIKE ${prefix + '%'}`);
  const maxSeq = (rows as any[]).reduce((max: number, r: any) => {
    const n = parseInt((r.permitNumber as string).split('-')[2] ?? '0', 10);
    return isNaN(n) ? max : Math.max(max, n);
  }, 0);
  return `${prefix}${(maxSeq + 1).toString().padStart(3, '0')}`;
}

// Convert a Europe/London wall-clock date+time string to the correct UTC instant.
// Prevents BST/GMT drift when the server runs in UTC.
function londonToUtc(date: string, time: string): Date {
  const asUtc = new Date(`${date}T${time}:00Z`); // treat input as UTC first for a reference point
  const londonStr = asUtc.toLocaleString('en-GB', {
    timeZone: 'Europe/London',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  });
  // en-GB format: "20/06/2026, 09:00:00"
  const [datePart, timePart] = londonStr.split(', ');
  const [dd, mm, yyyy] = datePart.split('/');
  const londonAsUtc = new Date(`${yyyy}-${mm}-${dd}T${timePart}Z`);
  // Correction: if London is UTC+1 (BST), londonAsUtc is 1h ahead of asUtc.
  // We want the UTC that displays as our target London time, so subtract the over-shoot.
  const correctionMs = asUtc.getTime() - londonAsUtc.getTime();
  return new Date(asUtc.getTime() + correctionMs);
}

// Validate that a checklist is ready for submission/authorisation.
// Returns { valid: true } or { valid: false, message: string }.
function validateChecklist(checklist: any[]): { valid: boolean; message?: string } {
  const incomplete = checklist.filter((i: any) => i.isRequired && !i.response);
  if (incomplete.length > 0) {
    return { valid: false, message: `Checklist is no longer complete — ${incomplete.length} required item(s) unanswered. Ask the requester to update it before authorising.` };
  }
  const noNotes = checklist.filter((i: any) => i.response === 'no' && !i.notes);
  if (noNotes.length > 0) {
    return { valid: false, message: `Checklist is no longer complete — ${noNotes.length} "No" answer(s) missing a mitigating control note. Ask the requester to update it before authorising.` };
  }
  return { valid: true };
}

// Best-effort async delete of an object-storage file given its /objects/... URL.
function deleteStorageFile(fileUrl: string | null | undefined): void {
  if (!fileUrl?.startsWith('/objects/')) return;
  const privateDir = objectStorage.getPrivateObjectDir(); // e.g. '.private'
  const key = fileUrl.slice('/objects/'.length); // 'customer/uploads/uuid'
  const fullPath = `${privateDir}/${key}`;
  const parts = (fullPath.startsWith('.') ? fullPath.slice(1) : fullPath).split('/').filter(Boolean);
  if (parts.length < 2) return;
  objectStorageClient.bucket(parts[0]).file(parts.slice(1).join('/')).delete().catch(() => {});
}

async function notifyAdmins(custDb: any, customer: any, settings: any, subject: string, html: string, text: string) {
  const users = await custDb.select().from(isolatedSchema.users).catch(() => []) as any[];
  const managers = users.filter((u: any) => u.role === 'admin' || u.role === 'manager');
  const emailSvc = new EmailService(customer.id);
  const companyName = (settings as any).companyName || 'TPR Max';
  for (const u of managers) {
    if (!u.email) continue;
    await emailSvc.sendEmail({ to: u.email, subject, html, text, companyName }).catch(() => {});
  }
}

const esc = (s: any) => String(s ?? '').replace(/[&<>"']/g, (c: string) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] ?? c));

export function registerPermitToWorkRoutes(app: Express): void {

  // ─── GET all permits ─────────────────────────────────────────────────────────
  app.get('/api/ptw', requireAuth, requirePermitToWorkFeature, async (req, res) => {
    try {
      const { db: custDb, siteContext } = await getScopedDb(req);
      const permits = await custDb.select().from(isolatedSchema.permitToWork)
        .where(scopedWhere(siteContext, isolatedSchema.permitToWork))
        .orderBy(isolatedSchema.permitToWork.createdAt);
      const now = new Date();
      res.json(permits.reverse().map((p: any) => ({
        ...p,
        isOverdue: p.status === 'active' && new Date(p.permitValidUntil) < now,
      })));
    } catch (err) {
      logger.error('GET /api/ptw', err);
      res.status(500).json({ error: 'Failed to fetch permits' });
    }
  });

  // ─── POST create permit ──────────────────────────────────────────────────────
  app.post('/api/ptw', requireAuth, requirePermitToWorkFeature, async (req, res) => {
    try {
      const { db: custDb, siteId } = await getScopedDb(req);

      const { permitType, workDescription, workLocation, plannedStartDate, plannedStartTime, plannedEndDate, plannedEndTime, contractorCompanyId, contractorCompanyName, contractorWorkerId, contractorWorkerName, staffId, staffName, linkedPpmWorkOrderId } = req.body;

      const year = new Date().getFullYear();
      const permitNumber = await generatePermitNumber(custDb, year);
      const permitValidFrom = londonToUtc(plannedStartDate, plannedStartTime);
      const permitValidUntil = londonToUtc(plannedEndDate, plannedEndTime);

      if (permitValidUntil <= permitValidFrom) {
        return res.status(400).json({ error: 'End date/time must be after start date/time.' });
      }

      const [permit] = await custDb.insert(isolatedSchema.permitToWork).values(withSiteId(siteId, {
        permitNumber,
        permitType,
        workDescription,
        workLocation,
        plannedStartDate,
        plannedStartTime,
        plannedEndDate,
        plannedEndTime,
        permitValidFrom,
        permitValidUntil,
        contractorCompanyId: contractorCompanyId || null,
        contractorCompanyName: contractorCompanyName || null,
        contractorWorkerId: contractorWorkerId || null,
        contractorWorkerName: contractorWorkerName || null,
        staffId: staffId || null,
        staffName: staffName || null,
        linkedPpmWorkOrderId: linkedPpmWorkOrderId || null,
        createdById: req.user!.id,
        createdByName: `${req.user!.firstName || ''} ${req.user!.lastName || ''}`.trim() || req.user!.username,
        status: 'draft',
      })).returning();

      // Seed checklist items for this permit type
      const items = PTW_CHECKLISTS[permitType] || PTW_CHECKLISTS.general_high_risk;
      if (items.length > 0) {
        await custDb.insert(isolatedSchema.permitChecklist).values(
          items.map(item => ({
            permitId: (permit as any).id,
            checklistSection: item.section,
            itemDescription: item.description,
            isRequired: item.isRequired,
            displayOrder: item.order,
          }))
        );
      }

      const checklist = await custDb.select().from(isolatedSchema.permitChecklist)
        .where(eq(isolatedSchema.permitChecklist.permitId, (permit as any).id))
        .orderBy(isolatedSchema.permitChecklist.displayOrder);

      res.status(201).json({ ...permit, checklist });
    } catch (err) {
      logger.error('POST /api/ptw', err);
      res.status(500).json({ error: 'Failed to create permit' });
    }
  });

  // ─── Company compliance documents ────────────────────────────────────────────

  function calcDocStatus(expiryDate: string | null): string {
    if (!expiryDate) return 'valid';
    const expiry = new Date(expiryDate);
    const now = new Date();
    const in30 = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    if (expiry < now) return 'expired';
    if (expiry <= in30) return 'expiring_soon';
    return 'valid';
  }

  app.get('/api/ptw/company-documents', requireAuth, requirePermitToWorkFeature, async (req, res) => {
    try {
      const custDb = await customerDbService.getCustomerDatabase(req.customerId!);
      const schemaName = customerDbService.generateSchemaName(req.customerId!);
      const rows = await custDb.execute(`SELECT * FROM ${schemaName}.ptw_company_documents ORDER BY uploaded_at DESC`);
      const docs = (rows.rows || rows).map((d: any) => ({ ...d, status: calcDocStatus(d.expiry_date) }));
      res.json(docs);
    } catch (err) {
      logger.error('GET /api/ptw/company-documents', err);
      res.status(500).json({ error: 'Failed to fetch company documents' });
    }
  });

  app.post('/api/ptw/company-documents', requireAuth, requirePermitToWorkFeature, upload.single('file'), async (req: any, res) => {
    try {
      if (req.user!.role !== 'admin' && req.user!.role !== 'manager') {
        return res.status(403).json({ error: 'Only managers or admins can upload company documents.' });
      }
      const custDb = await customerDbService.getCustomerDatabase(req.customerId!);
      const schemaName = customerDbService.generateSchemaName(req.customerId!);

      const { documentType, title, notes, expiryDate } = req.body;
      if (!documentType || !title) return res.status(400).json({ error: 'Document type and title are required.' });

      let fileUrl = req.body.fileUrl || '';
      let fileName = req.body.fileName || '';
      if (req.file) {
        fileName = req.file.originalname;
        const privateDir = objectStorage.getPrivateObjectDir();
        const objectId = randomUUID();
        const ptwCustomerId = req.customerId!;
        const fullPath = `${privateDir}/${ptwCustomerId}/uploads/${objectId}`;
        const parts = fullPath.slice(1).split('/');
        const bucketName = parts[0];
        const objectName = parts.slice(1).join('/');
        const bucket = objectStorageClient.bucket(bucketName);
        const fileObj = bucket.file(objectName);
        await fileObj.save(req.file.buffer, { contentType: req.file.mimetype, resumable: false });
        fileUrl = `/objects/${ptwCustomerId}/uploads/${objectId}`;
      }
      if (!fileUrl || !fileName) return res.status(400).json({ error: 'File is required.' });

      const uploadedByName = `${req.user!.firstName || ''} ${req.user!.lastName || ''}`.trim() || req.user!.username;
      const result = await custDb.execute(
        sql`INSERT INTO ${sql.raw(schemaName)}.ptw_company_documents (id, document_type, title, notes, file_url, file_name, expiry_date, uploaded_by_id, uploaded_by_name, uploaded_at)
         VALUES (gen_random_uuid()::text, ${documentType}, ${title}, ${notes || null}, ${fileUrl}, ${fileName}, ${expiryDate || null}, ${req.user!.id}, ${uploadedByName}, NOW()) RETURNING *`
      );
      const doc = (result.rows || result)[0];
      res.status(201).json({ ...doc, status: calcDocStatus(doc.expiry_date) });
    } catch (err) {
      logger.error('POST /api/ptw/company-documents', err);
      res.status(500).json({ error: 'Failed to upload company document' });
    }
  });

  app.patch('/api/ptw/company-documents/:docId/replace', requireAuth, requirePermitToWorkFeature, upload.single('file'), async (req: any, res) => {
    try {
      if (req.user!.role !== 'admin' && req.user!.role !== 'manager') {
        return res.status(403).json({ error: 'Only managers or admins can replace company documents.' });
      }
      const custDb = await customerDbService.getCustomerDatabase(req.customerId!);
      const schemaName = customerDbService.generateSchemaName(req.customerId!);
      const { docId } = req.params;

      const existing = await custDb.execute(sql`SELECT * FROM ${sql.raw(schemaName)}.ptw_company_documents WHERE id = ${docId}`);
      const existingDoc = (existing.rows || existing)[0];
      if (!existingDoc) return res.status(404).json({ error: 'Document not found.' });

      const { notes, expiryDate } = req.body;
      let fileUrl = existingDoc.file_url;
      let fileName = existingDoc.file_name;
      if (req.file) {
        fileName = req.file.originalname;
        const privateDir = objectStorage.getPrivateObjectDir();
        const objectId = randomUUID();
        const ptwReplaceCustomerId = req.customerId!;
        const fullPath = `${privateDir}/${ptwReplaceCustomerId}/uploads/${objectId}`;
        const parts = fullPath.slice(1).split('/');
        const bucketName = parts[0];
        const objectName = parts.slice(1).join('/');
        const bucket = objectStorageClient.bucket(bucketName);
        const fileObj = bucket.file(objectName);
        await fileObj.save(req.file.buffer, { contentType: req.file.mimetype, resumable: false });
        fileUrl = `/objects/${ptwReplaceCustomerId}/uploads/${objectId}`;
      }

      // Delete the old storage object if we're uploading a replacement file
      if (req.file) {
        deleteStorageFile(existingDoc.file_url);
      }

      const uploadedByName = `${req.user!.firstName || ''} ${req.user!.lastName || ''}`.trim() || req.user!.username;
      const result = await custDb.execute(
        sql`UPDATE ${sql.raw(schemaName)}.ptw_company_documents
         SET file_url = ${fileUrl}, file_name = ${fileName}, notes = ${notes || null}, expiry_date = ${expiryDate || null},
             uploaded_by_id = ${req.user!.id}, uploaded_by_name = ${uploadedByName}, replaced_at = NOW()
         WHERE id = ${docId} RETURNING *`
      );
      const doc = (result.rows || result)[0];
      res.json({ ...doc, status: calcDocStatus(doc.expiry_date) });
    } catch (err) {
      logger.error('PATCH /api/ptw/company-documents/:docId/replace', err);
      res.status(500).json({ error: 'Failed to replace company document' });
    }
  });

  app.delete('/api/ptw/company-documents/:docId', requireAuth, requirePermitToWorkFeature, async (req, res) => {
    try {
      if (req.user!.role !== 'admin' && req.user!.role !== 'manager') {
        return res.status(403).json({ error: 'Only managers or admins can delete company documents.' });
      }
      const custDb = await customerDbService.getCustomerDatabase(req.customerId!);
      const schemaName = customerDbService.generateSchemaName(req.customerId!);
      const { docId } = req.params;
      // Fetch the file URL before deleting so we can remove the storage object
      const docResult = await custDb.execute(sql`SELECT file_url FROM ${sql.raw(schemaName)}.ptw_company_documents WHERE id = ${docId}`);
      const docToDelete = (docResult.rows || docResult)[0];
      await custDb.execute(sql`DELETE FROM ${sql.raw(schemaName)}.ptw_company_documents WHERE id = ${docId}`);
      if (docToDelete?.file_url) deleteStorageFile(docToDelete.file_url);
      res.json({ success: true });
    } catch (err) {
      logger.error('DELETE /api/ptw/company-documents/:docId', err);
      res.status(500).json({ error: 'Failed to delete company document' });
    }
  });

  app.patch('/api/ptw/company-documents/:docId/approve', requireAuth, requirePermitToWorkFeature, async (req, res) => {
    try {
      if (req.user!.role !== 'admin' && req.user!.role !== 'manager') {
        return res.status(403).json({ error: 'Only managers or admins can approve documents.' });
      }
      const custDb = await customerDbService.getCustomerDatabase(req.customerId!);
      const schemaName = customerDbService.generateSchemaName(req.customerId!);
      const { docId } = req.params;
      // Ensure approved_by / approved_at columns exist (idempotent)
      await custDb.execute(sql`ALTER TABLE ${sql.raw(schemaName)}.ptw_company_documents ADD COLUMN IF NOT EXISTS approved_by TEXT`);
      await custDb.execute(sql`ALTER TABLE ${sql.raw(schemaName)}.ptw_company_documents ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ`);
      const approverName = `${req.user!.firstName || ''} ${req.user!.lastName || ''}`.trim() || req.user!.username;
      const result = await custDb.execute(
        sql`UPDATE ${sql.raw(schemaName)}.ptw_company_documents
            SET approved_by = ${approverName}, approved_at = NOW()
            WHERE id = ${docId}
            RETURNING *`
      );
      const doc = (result.rows || result)[0];
      if (!doc) return res.status(404).json({ error: 'Document not found.' });
      res.json({ ...doc, status: calcDocStatus(doc.expiry_date) });
    } catch (err) {
      logger.error('PATCH /api/ptw/company-documents/:docId/approve', err);
      res.status(500).json({ error: 'Failed to approve document' });
    }
  });

  // ─── GET single permit ───────────────────────────────────────────────────────
  app.get('/api/ptw/:id', requireAuth, requirePermitToWorkFeature, async (req, res) => {
    try {
      const custDb = await customerDbService.getCustomerDatabase(req.customerId!);
      const { id } = req.params;
      const [permit] = await custDb.select().from(isolatedSchema.permitToWork)
        .where(eq(isolatedSchema.permitToWork.id, id));
      if (!permit) return res.status(404).json({ error: 'Permit not found' });
      const checklist = await custDb.select().from(isolatedSchema.permitChecklist)
        .where(eq(isolatedSchema.permitChecklist.permitId, id))
        .orderBy(isolatedSchema.permitChecklist.displayOrder);
      const attachments = await custDb.select().from(isolatedSchema.permitAttachments)
        .where(eq(isolatedSchema.permitAttachments.permitId, id));
      res.json({ ...permit, checklist, attachments, isOverdue: (permit as any).status === 'active' && new Date((permit as any).permitValidUntil) < new Date() });
    } catch (err) {
      logger.error('GET /api/ptw/:id', err);
      res.status(500).json({ error: 'Failed to fetch permit' });
    }
  });

  // ─── PUT update permit (draft only) ─────────────────────────────────────────
  app.put('/api/ptw/:id', requireAuth, requirePermitToWorkFeature, async (req, res) => {
    try {
      const custDb = await customerDbService.getCustomerDatabase(req.customerId!);
      const { id } = req.params;
      const [permit] = await custDb.select().from(isolatedSchema.permitToWork)
        .where(eq(isolatedSchema.permitToWork.id, id));
      if (!permit) return res.status(404).json({ error: 'Permit not found' });
      if ((permit as any).status !== 'draft') return res.status(400).json({ error: 'Only draft permits can be edited.' });

      const { workDescription, workLocation, plannedStartDate, plannedStartTime, plannedEndDate, plannedEndTime } = req.body;
      const permitValidFrom = londonToUtc(plannedStartDate, plannedStartTime);
      const permitValidUntil = londonToUtc(plannedEndDate, plannedEndTime);

      const [updated] = await custDb.update(isolatedSchema.permitToWork)
        .set({ workDescription, workLocation, plannedStartDate, plannedStartTime, plannedEndDate, plannedEndTime, permitValidFrom, permitValidUntil, updatedAt: new Date() })
        .where(eq(isolatedSchema.permitToWork.id, id)).returning();
      res.json(updated);
    } catch (err) {
      logger.error('PUT /api/ptw/:id', err);
      res.status(500).json({ error: 'Failed to update permit' });
    }
  });

  // ─── PATCH update checklist item ─────────────────────────────────────────────
  app.patch('/api/ptw/:id/checklist/:checklistItemId', requireAuth, requirePermitToWorkFeature, async (req, res) => {
    try {
      const custDb = await customerDbService.getCustomerDatabase(req.customerId!);
      const { id, checklistItemId } = req.params;
      const { response, notes } = req.body;
      const [permit] = await custDb.select({ status: isolatedSchema.permitToWork.status }).from(isolatedSchema.permitToWork)
        .where(eq(isolatedSchema.permitToWork.id, id));
      if (!permit) return res.status(404).json({ error: 'Permit not found' });
      if ((permit as any).status !== 'draft' && (permit as any).status !== 'submitted') {
        return res.status(400).json({ error: 'Checklist can only be updated in draft or submitted status.' });
      }
      const updateValues: Record<string, any> = {
        response,
        respondedById: req.user!.id,
        respondedAt: new Date(),
      };
      // Only touch the note when the client explicitly sends one.
      // An absent note must NOT wipe a previously saved mitigating control note.
      if (notes !== undefined) {
        updateValues.notes = notes === '' ? null : notes;
      }

      const [item] = await custDb.update(isolatedSchema.permitChecklist)
        .set(updateValues)
        .where(and(eq(isolatedSchema.permitChecklist.id, checklistItemId), eq(isolatedSchema.permitChecklist.permitId, id)))
        .returning();
      if (!item) return res.status(404).json({ error: 'Checklist item not found on this permit.' });
      res.json(item);
    } catch (err) {
      logger.error('PATCH /api/ptw/:id/checklist/:checklistItemId', err);
      res.status(500).json({ error: 'Failed to update checklist item' });
    }
  });

  // ─── POST regenerate checklist ────────────────────────────────────────────
  app.post('/api/ptw/:id/checklist/regenerate', requireAuth, requirePermitToWorkFeature, async (req, res) => {
    try {
      const custDb = await customerDbService.getCustomerDatabase(req.customerId!);
      const { id } = req.params;
      const [permit] = await custDb.select().from(isolatedSchema.permitToWork)
        .where(eq(isolatedSchema.permitToWork.id, id));
      if (!permit) return res.status(404).json({ error: 'Permit not found' });

      const existing = await custDb.select({ id: isolatedSchema.permitChecklist.id })
        .from(isolatedSchema.permitChecklist)
        .where(eq(isolatedSchema.permitChecklist.permitId, id));
      if (existing.length > 0) {
        return res.status(409).json({ error: 'This permit already has checklist items.' });
      }

      const permitType = (permit as any).permitType;
      const items = PTW_CHECKLISTS[permitType] || PTW_CHECKLISTS.general_high_risk;
      await custDb.insert(isolatedSchema.permitChecklist).values(
        items.map(item => ({
          permitId: id,
          checklistSection: item.section,
          itemDescription: item.description,
          isRequired: item.isRequired,
          displayOrder: item.order,
        }))
      );

      const checklist = await custDb.select().from(isolatedSchema.permitChecklist)
        .where(eq(isolatedSchema.permitChecklist.permitId, id))
        .orderBy(isolatedSchema.permitChecklist.displayOrder);

      res.json({ checklist });
    } catch (err) {
      logger.error('POST /api/ptw/:id/checklist/regenerate', err);
      res.status(500).json({ error: 'Failed to regenerate checklist' });
    }
  });

  // ─── PATCH submit ────────────────────────────────────────────────────────────
  app.patch('/api/ptw/:id/submit', requireAuth, requirePermitToWorkFeature, async (req, res) => {
    try {
      const custDb = await customerDbService.getCustomerDatabase(req.customerId!);
      const { id } = req.params;
      const [permit] = await custDb.select().from(isolatedSchema.permitToWork)
        .where(eq(isolatedSchema.permitToWork.id, id));
      if (!permit) return res.status(404).json({ error: 'Permit not found' });
      if ((permit as any).status !== 'draft') return res.status(400).json({ error: 'Permit must be in draft to submit.' });

      const checklist = await custDb.select().from(isolatedSchema.permitChecklist)
        .where(eq(isolatedSchema.permitChecklist.permitId, id));
      const incomplete = (checklist as any[]).filter(i => i.isRequired && !i.response);
      if (incomplete.length > 0) return res.status(400).json({ error: `${incomplete.length} required checklist item(s) are not completed.`, incomplete });

      const noResponse = (checklist as any[]).filter(i => i.response === 'no' && !i.notes);
      if (noResponse.length > 0) return res.status(400).json({ error: 'Items answered "No" must have a mitigating control note.', noResponse });

      const submittedByName = `${req.user!.firstName || ''} ${req.user!.lastName || ''}`.trim() || req.user!.username;
      const [updated] = await custDb.update(isolatedSchema.permitToWork)
        .set({
          status: 'submitted',
          submittedAt: new Date(),
          submittedById: req.user!.id,
          submittedByName,
          // Clear stale rejection data so it doesn't show on a re-submitted permit
          rejectionReason: null,
          rejectedAt: null,
          rejectedById: null,
          updatedAt: new Date(),
        })
        .where(eq(isolatedSchema.permitToWork.id, id)).returning();

      // Notify admins/managers
      const context = simpleDatabaseService.createCustomerContext(req.user!.username, req.customerId!);
      const settings = await simpleDatabaseService.getCompanySettings(context).catch(() => null);
      const customer = { id: req.customerId! };
      const typeLabel = PERMIT_TYPE_LABELS[(permit as any).permitType] || (permit as any).permitType;
      const p = permit as any;
      const assignee = p.contractorWorkerName
        ? `${esc(p.contractorWorkerName)}${p.contractorCompanyName ? ` (${esc(p.contractorCompanyName)})` : ''} — Contractor`
        : p.staffName ? `${esc(p.staffName)} — Staff` : 'Not specified';
      const subject = `📋 Permit-to-Work Requires Authorisation — ${typeLabel} ${p.permitNumber}`;
      const html = `<div style="font-family:Arial,sans-serif;max-width:640px">
        <div style="background:#d97706;color:#fff;padding:20px;border-radius:8px 8px 0 0"><h2 style="margin:0">${subject}</h2></div>
        <div style="background:#fff;padding:20px;border:1px solid #e5e7eb">
          <p>A Permit-to-Work has been submitted for authorisation.</p>
          <table style="width:100%;border-collapse:collapse">
            <tr><td style="padding:4px 0;color:#6b7280;width:160px">Permit number</td><td style="font-weight:600">${esc(p.permitNumber)}</td></tr>
            <tr><td style="padding:4px 0;color:#6b7280">Work type</td><td>${esc(typeLabel)}</td></tr>
            <tr><td style="padding:4px 0;color:#6b7280">Assigned to</td><td>${assignee}</td></tr>
            <tr><td style="padding:4px 0;color:#6b7280">Location</td><td>${esc(p.workLocation)}</td></tr>
            <tr><td style="padding:4px 0;color:#6b7280">Description</td><td>${esc(p.workDescription)}</td></tr>
            <tr><td style="padding:4px 0;color:#6b7280">Planned start</td><td>${esc(p.plannedStartDate)} ${esc(p.plannedStartTime)}</td></tr>
            <tr><td style="padding:4px 0;color:#6b7280">Planned end</td><td>${esc(p.plannedEndDate)} ${esc(p.plannedEndTime)}</td></tr>
          </table>
          <p>Please log in to TPR Max to review and authorise this permit.</p>
        </div>
      </div>`;
      await notifyAdmins(custDb, customer, settings, subject, html, `Permit ${(permit as any).permitNumber} submitted for authorisation.`);

      res.json(updated);
    } catch (err) {
      logger.error('PATCH /api/ptw/:id/submit', err);
      res.status(500).json({ error: 'Failed to submit permit' });
    }
  });

  // ─── PATCH authorise ─────────────────────────────────────────────────────────
  app.patch('/api/ptw/:id/authorise', requireAuth, requirePermitToWorkFeature, async (req, res) => {
    try {
      const custDb = await customerDbService.getCustomerDatabase(req.customerId!);
      const { id } = req.params;
      const [permit] = await custDb.select().from(isolatedSchema.permitToWork)
        .where(eq(isolatedSchema.permitToWork.id, id));
      if (!permit) return res.status(404).json({ error: 'Permit not found' });
      if ((permit as any).status !== 'submitted') return res.status(400).json({ error: 'Permit must be submitted to authorise.' });
      if (req.user!.role !== 'admin' && req.user!.role !== 'manager') return res.status(403).json({ error: 'Only managers or admins can authorise permits.' });
      if ((permit as any).createdById === req.user!.id) return res.status(403).json({ error: 'You cannot authorise a permit you created.' });

      // Re-validate checklist — it can be edited in 'submitted' status, so re-check before approving
      const authChecklist = await custDb.select().from(isolatedSchema.permitChecklist)
        .where(eq(isolatedSchema.permitChecklist.permitId, id));
      const clResult = validateChecklist(authChecklist as any[]);
      if (!clResult.valid) return res.status(400).json({ error: clResult.message });

      const { authNotes } = req.body;
      const authorisedByName = `${req.user!.firstName || ''} ${req.user!.lastName || ''}`.trim() || req.user!.username;
      const [updated] = await custDb.update(isolatedSchema.permitToWork)
        .set({ status: 'authorised', authorisedById: req.user!.id, authorisedByName, authorisedAt: new Date(), authNotes: authNotes || null, updatedAt: new Date() })
        .where(eq(isolatedSchema.permitToWork.id, id)).returning();
      res.json(updated);
    } catch (err) {
      logger.error('PATCH /api/ptw/:id/authorise', err);
      res.status(500).json({ error: 'Failed to authorise permit' });
    }
  });

  // ─── PATCH reject ────────────────────────────────────────────────────────────
  app.patch('/api/ptw/:id/reject', requireAuth, requirePermitToWorkFeature, async (req, res) => {
    try {
      const custDb = await customerDbService.getCustomerDatabase(req.customerId!);
      const { id } = req.params;
      const { rejectionReason } = req.body;
      if (!rejectionReason) return res.status(400).json({ error: 'Rejection reason is required.' });
      const [permit] = await custDb.select().from(isolatedSchema.permitToWork).where(eq(isolatedSchema.permitToWork.id, id));
      if (!permit) return res.status(404).json({ error: 'Permit not found' });
      if ((permit as any).status !== 'submitted') return res.status(400).json({ error: 'Only submitted permits can be rejected.' });
      if (req.user!.role !== 'admin' && req.user!.role !== 'manager') return res.status(403).json({ error: 'Only managers or admins can reject permits.' });
      if ((permit as any).createdById === req.user!.id) return res.status(403).json({ error: 'You cannot reject a permit you created.' });

      const [updated] = await custDb.update(isolatedSchema.permitToWork)
        .set({ status: 'draft', rejectedById: req.user!.id, rejectedAt: new Date(), rejectionReason, updatedAt: new Date() })
        .where(eq(isolatedSchema.permitToWork.id, id)).returning();
      res.json(updated);
    } catch (err) {
      logger.error('PATCH /api/ptw/:id/reject', err);
      res.status(500).json({ error: 'Failed to reject permit' });
    }
  });

  // ─── PATCH activate ──────────────────────────────────────────────────────────
  app.patch('/api/ptw/:id/activate', requireAuth, requirePermitToWorkFeature, async (req, res) => {
    try {
      const custDb = await customerDbService.getCustomerDatabase(req.customerId!);
      const { id } = req.params;
      const [permit] = await custDb.select().from(isolatedSchema.permitToWork).where(eq(isolatedSchema.permitToWork.id, id));
      if (!permit) return res.status(404).json({ error: 'Permit not found' });
      if ((permit as any).status !== 'authorised') return res.status(400).json({ error: 'Permit must be authorised before activation.' });
      if (req.user!.role !== 'admin' && req.user!.role !== 'manager') return res.status(403).json({ error: 'Only managers or admins can activate permits.' });

      const now = new Date();
      const validFrom = new Date((permit as any).permitValidFrom);
      const validUntil = new Date((permit as any).permitValidUntil);
      if (now < validFrom || now > validUntil) {
        return res.status(400).json({ error: 'Permit validity window has passed. A new permit must be issued.' });
      }
      const [updated] = await custDb.update(isolatedSchema.permitToWork)
        .set({ status: 'active', actualStartAt: now, updatedAt: now })
        .where(eq(isolatedSchema.permitToWork.id, id)).returning();
      res.json(updated);
    } catch (err) {
      logger.error('PATCH /api/ptw/:id/activate', err);
      res.status(500).json({ error: 'Failed to activate permit' });
    }
  });

  // ─── PATCH suspend ───────────────────────────────────────────────────────────
  app.patch('/api/ptw/:id/suspend', requireAuth, requirePermitToWorkFeature, async (req, res) => {
    try {
      const custDb = await customerDbService.getCustomerDatabase(req.customerId!);
      const { id } = req.params;
      const { suspensionReason } = req.body;
      if (!suspensionReason) return res.status(400).json({ error: 'Suspension reason is required.' });
      const [permit] = await custDb.select().from(isolatedSchema.permitToWork).where(eq(isolatedSchema.permitToWork.id, id));
      if (!permit) return res.status(404).json({ error: 'Permit not found' });
      if ((permit as any).status !== 'active') return res.status(400).json({ error: 'Only active permits can be suspended.' });
      if (req.user!.role !== 'admin' && req.user!.role !== 'manager') return res.status(403).json({ error: 'Only managers or admins can suspend permits.' });

      const suspendedByName = `${req.user!.firstName || ''} ${req.user!.lastName || ''}`.trim() || req.user!.username;
      const [updated] = await custDb.update(isolatedSchema.permitToWork)
        .set({ status: 'suspended', suspendedById: req.user!.id, suspendedAt: new Date(), suspensionReason, updatedAt: new Date() })
        .where(eq(isolatedSchema.permitToWork.id, id)).returning();
      res.json(updated);
    } catch (err) {
      logger.error('PATCH /api/ptw/:id/suspend', err);
      res.status(500).json({ error: 'Failed to suspend permit' });
    }
  });

  // ─── PATCH resume ────────────────────────────────────────────────────────────
  app.patch('/api/ptw/:id/resume', requireAuth, requirePermitToWorkFeature, async (req, res) => {
    try {
      const custDb = await customerDbService.getCustomerDatabase(req.customerId!);
      const { id } = req.params;
      const [permit] = await custDb.select().from(isolatedSchema.permitToWork).where(eq(isolatedSchema.permitToWork.id, id));
      if (!permit) return res.status(404).json({ error: 'Permit not found' });
      if ((permit as any).status !== 'suspended') return res.status(400).json({ error: 'Permit must be suspended to resume.' });
      if (req.user!.role !== 'admin' && req.user!.role !== 'manager') return res.status(403).json({ error: 'Only managers or admins can resume permits.' });
      const now = new Date();
      if (now > new Date((permit as any).permitValidUntil)) {
        return res.status(400).json({ error: 'Permit validity window has passed. Close this permit and raise a new one.' });
      }
      const [updated] = await custDb.update(isolatedSchema.permitToWork)
        .set({ status: 'active', updatedAt: new Date() })
        .where(eq(isolatedSchema.permitToWork.id, id)).returning();
      res.json(updated);
    } catch (err) {
      logger.error('PATCH /api/ptw/:id/resume', err);
      res.status(500).json({ error: 'Failed to resume permit' });
    }
  });

  // ─── PATCH close ─────────────────────────────────────────────────────────────
  app.patch('/api/ptw/:id/close', requireAuth, requirePermitToWorkFeature, async (req, res) => {
    try {
      const custDb = await customerDbService.getCustomerDatabase(req.customerId!);
      const { id } = req.params;
      const { closureNotes, workCompletedSatisfactorily } = req.body;
      const [permit] = await custDb.select().from(isolatedSchema.permitToWork).where(eq(isolatedSchema.permitToWork.id, id));
      if (!permit) return res.status(404).json({ error: 'Permit not found' });
      if ((permit as any).status !== 'active' && (permit as any).status !== 'suspended') {
        return res.status(400).json({ error: 'Permit must be active or suspended to close.' });
      }
      if (req.user!.role !== 'admin' && req.user!.role !== 'manager') return res.status(403).json({ error: 'Only managers or admins can close permits.' });
      const closedByName = `${req.user!.firstName || ''} ${req.user!.lastName || ''}`.trim() || req.user!.username;
      const [updated] = await custDb.update(isolatedSchema.permitToWork)
        .set({ status: 'completed', closedById: req.user!.id, closedByName, closedAt: new Date(), actualEndAt: new Date(), closureNotes: closureNotes || null, workCompletedSatisfactorily: workCompletedSatisfactorily ?? true, updatedAt: new Date() })
        .where(eq(isolatedSchema.permitToWork.id, id)).returning();
      res.json(updated);
    } catch (err) {
      logger.error('PATCH /api/ptw/:id/close', err);
      res.status(500).json({ error: 'Failed to close permit' });
    }
  });

  // ─── PATCH cancel ────────────────────────────────────────────────────────────
  app.patch('/api/ptw/:id/cancel', requireAuth, requirePermitToWorkFeature, async (req, res) => {
    try {
      const custDb = await customerDbService.getCustomerDatabase(req.customerId!);
      const { id } = req.params;
      const { cancellationReason } = req.body;
      if (!cancellationReason?.trim()) return res.status(400).json({ error: 'Cancellation reason is required.' });
      const [permit] = await custDb.select().from(isolatedSchema.permitToWork).where(eq(isolatedSchema.permitToWork.id, id));
      if (!permit) return res.status(404).json({ error: 'Permit not found' });
      const terminatedStatuses = ['completed', 'expired', 'cancelled'];
      if (terminatedStatuses.includes((permit as any).status)) return res.status(400).json({ error: 'Permit cannot be cancelled in its current state.' });
      const pStatus = (permit as any).status;
      const isMgr = req.user!.role === 'admin' || req.user!.role === 'manager';
      const isCreator = (permit as any).createdById === req.user!.id;
      if (['authorised', 'active', 'suspended'].includes(pStatus) && !isMgr) {
        return res.status(403).json({ error: 'Only managers or admins can cancel an authorised or active permit.' });
      }
      if (['draft', 'submitted'].includes(pStatus) && !isMgr && !isCreator) {
        return res.status(403).json({ error: 'Only the permit creator or a manager can cancel this permit.' });
      }
      const cancelledByName = `${req.user!.firstName || ''} ${req.user!.lastName || ''}`.trim() || req.user!.username;
      const [updated] = await custDb.update(isolatedSchema.permitToWork)
        .set({ status: 'cancelled', cancelledById: req.user!.id, cancelledByName, cancelledAt: new Date(), cancellationReason: cancellationReason.trim(), updatedAt: new Date() })
        .where(eq(isolatedSchema.permitToWork.id, id)).returning();
      res.json(updated);
    } catch (err) {
      logger.error('PATCH /api/ptw/:id/cancel', err);
      res.status(500).json({ error: 'Failed to cancel permit' });
    }
  });

  // ─── Attachments ─────────────────────────────────────────────────────────────
  app.get('/api/ptw/:id/attachments', requireAuth, requirePermitToWorkFeature, async (req, res) => {
    try {
      const custDb = await customerDbService.getCustomerDatabase(req.customerId!);
      const { id } = req.params;
      const attachments = await custDb.select().from(isolatedSchema.permitAttachments)
        .where(eq(isolatedSchema.permitAttachments.permitId, id));
      res.json(attachments);
    } catch (err) {
      logger.error('GET /api/ptw/:id/attachments', err);
      res.status(500).json({ error: 'Failed to fetch attachments' });
    }
  });

  app.post('/api/ptw/:id/attachments', requireAuth, requirePermitToWorkFeature, upload.single('file'), async (req: any, res) => {
    try {
      const custDb = await customerDbService.getCustomerDatabase(req.customerId!);
      const { id } = req.params;
      const [permit] = await custDb.select({ status: isolatedSchema.permitToWork.status }).from(isolatedSchema.permitToWork).where(eq(isolatedSchema.permitToWork.id, id));
      if (!permit) return res.status(404).json({ error: 'Permit not found' });
      if ((permit as any).status === 'expired' || (permit as any).status === 'cancelled') {
        return res.status(400).json({ error: 'Cannot attach documents to expired or cancelled permits.' });
      }

      const { documentType } = req.body;
      let fileUrl = req.body.fileUrl || '';
      let fileName = req.body.fileName || '';

      if (req.file) {
        fileName = req.file.originalname;
        const objectId = randomUUID();
        const privateObjectDir = objectStorage.getPrivateObjectDir();
        const ptwAttachCustomerId = req.customerId!;
        const fullPath = `${privateObjectDir}/${ptwAttachCustomerId}/uploads/${objectId}`;
        const parts = fullPath.slice(1).split('/');
        const bucketName = parts[0];
        const objectName = parts.slice(1).join('/');
        const bucket = objectStorageClient.bucket(bucketName);
        const fileObj = bucket.file(objectName);
        await fileObj.save(req.file.buffer, { contentType: req.file.mimetype, resumable: false });
        fileUrl = `/objects/${ptwAttachCustomerId}/uploads/${objectId}`;
      }
      if (!fileUrl || !fileName) return res.status(400).json({ error: 'File URL and name are required.' });

      const uploadedByName = `${req.user!.firstName || ''} ${req.user!.lastName || ''}`.trim() || req.user!.username;
      const [attachment] = await custDb.insert(isolatedSchema.permitAttachments).values({
        permitId: id, documentType: documentType || 'other', fileName, fileUrl, uploadedById: req.user!.id, uploadedByName,
      }).returning();
      res.status(201).json(attachment);
    } catch (err) {
      logger.error('POST /api/ptw/:id/attachments', err);
      res.status(500).json({ error: 'Failed to upload attachment' });
    }
  });

  app.delete('/api/ptw/:id/attachments/:attachmentId', requireAuth, requirePermitToWorkFeature, async (req, res) => {
    try {
      const custDb = await customerDbService.getCustomerDatabase(req.customerId!);
      const { id, attachmentId } = req.params;
      const [permit] = await custDb.select({ status: isolatedSchema.permitToWork.status }).from(isolatedSchema.permitToWork).where(eq(isolatedSchema.permitToWork.id, id));
      if (!permit) return res.status(404).json({ error: 'Permit not found' });
      if ((permit as any).status !== 'draft' && (permit as any).status !== 'submitted') {
        return res.status(400).json({ error: 'Attachments can only be deleted in draft or submitted status.' });
      }
      // Fetch the attachment first so we can delete the storage object
      const [attachmentToDelete] = await custDb.select().from(isolatedSchema.permitAttachments)
        .where(eq(isolatedSchema.permitAttachments.id, attachmentId));
      await custDb.delete(isolatedSchema.permitAttachments).where(eq(isolatedSchema.permitAttachments.id, attachmentId));
      if (attachmentToDelete?.fileUrl) deleteStorageFile(attachmentToDelete.fileUrl);
      res.json({ success: true });
    } catch (err) {
      logger.error('DELETE /api/ptw/:id/attachments/:attachmentId', err);
      res.status(500).json({ error: 'Failed to delete attachment' });
    }
  });

  // PATCH /api/ptw/:id/archive — archive an expired/cancelled/completed permit
  app.patch('/api/ptw/:id/archive', requireAuth, requirePermitToWorkFeature, async (req: any, res) => {
    try {
      const custDb = await customerDbService.getCustomerDatabase(req.customerId!);
      const { id } = req.params;
      const [permit] = await custDb.select({ id: isolatedSchema.permitToWork.id, status: isolatedSchema.permitToWork.status, permitNumber: isolatedSchema.permitToWork.permitNumber })
        .from(isolatedSchema.permitToWork).where(eq(isolatedSchema.permitToWork.id, id));
      if (!permit) return res.status(404).json({ error: 'Permit not found' });
      const archivable = ['expired', 'cancelled', 'completed'];
      if (!archivable.includes((permit as any).status)) {
        return res.status(400).json({ error: 'Only expired, cancelled, or completed permits can be archived.' });
      }
      await custDb.update(isolatedSchema.permitToWork)
        .set({ status: 'archived', updatedAt: new Date() })
        .where(eq(isolatedSchema.permitToWork.id, id));
      res.json({ success: true });
    } catch (err) {
      logger.error('PATCH /api/ptw/:id/archive', err);
      res.status(500).json({ error: 'Failed to archive permit' });
    }
  });

  // ─── Daily PTW cron ──────────────────────────────────────────────────────────
  const ptwAlertHour = parseInt(process.env.PTW_ALERT_HOUR ?? '7', 10);
  cron.schedule(`0 ${ptwAlertHour} * * *`, async () => {
    try {
      logger.info('📋 [PTW Cron] Running daily permit expiry check…');
      const allCustomers = await customerDbService.getAllCustomers();
      for (const customer of allCustomers) {
        try {
          const custDb = await customerDbService.getCustomerDatabase(customer.id);
          const context = { customerId: customer.id, username: 'system' };
          const settings = await simpleDatabaseService.getCompanySettings(context as any).catch(() => null);
          if (!settings?.featurePermitToWork) continue;

          const companyName = (settings as any).companyName || 'TPR Max';
          const emailSvc = new EmailService(customer.id);
          const now = new Date();
          const nowPlus2h = new Date(now.getTime() + 2 * 60 * 60 * 1000);

          // 1. Auto-expire permits past validity window (draft/submitted/authorised — never active ones with live work)
          const toExpire = await custDb.select({ id: isolatedSchema.permitToWork.id, permitNumber: isolatedSchema.permitToWork.permitNumber, createdById: isolatedSchema.permitToWork.createdById })
            .from(isolatedSchema.permitToWork)
            .where(and(inArray(isolatedSchema.permitToWork.status, ['draft', 'submitted', 'authorised']), lt(isolatedSchema.permitToWork.permitValidUntil, now)))
            .catch(() => []) as any[];
          for (const p of toExpire) {
            await custDb.update(isolatedSchema.permitToWork).set({ status: 'expired', updatedAt: now })
              .where(eq(isolatedSchema.permitToWork.id, p.id));
            setImmediate(() => logger.info(`📋 [PTW Cron] Permit ${p.permitNumber} auto-expired`));
          }

          // 2. Overdue closure alerts for active permits past validity
          const overdue = await custDb.select().from(isolatedSchema.permitToWork)
            .where(and(eq(isolatedSchema.permitToWork.status, 'active'), lt(isolatedSchema.permitToWork.permitValidUntil, now), isNull(isolatedSchema.permitToWork.overdueClosureAlertedAt)))
            .catch(() => []) as any[];
          for (const p of overdue) {
            const subject = `🚨 Permit-to-Work OVERDUE — Work Not Closed — ${p.permitNumber}`;
            const html = `<div style="font-family:Arial,sans-serif;max-width:640px"><div style="background:#dc2626;color:#fff;padding:20px;border-radius:8px 8px 0 0"><h2 style="margin:0">${subject}</h2></div><div style="background:#fff;padding:20px;border:1px solid #e5e7eb"><p>Work was authorised until <strong>${new Date(p.permitValidUntil).toLocaleString('en-GB')}</strong> but this permit has not been closed. Immediate action required.</p><p>Permit: ${p.permitNumber} — ${PERMIT_TYPE_LABELS[p.permitType] || p.permitType}<br>Location: ${p.workLocation}</p></div></div>`;
            await notifyAdmins(custDb, customer, settings, subject, html, `Permit ${p.permitNumber} overdue for closure.`);
            await custDb.update(isolatedSchema.permitToWork).set({ overdueClosureAlertedAt: now }).where(eq(isolatedSchema.permitToWork.id, p.id));
          }

          // 3. 2-hour expiry warning
          const expiringSoon = await custDb.select().from(isolatedSchema.permitToWork)
            .where(and(inArray(isolatedSchema.permitToWork.status, ['authorised', 'active']), lte(isolatedSchema.permitToWork.permitValidUntil, nowPlus2h), isNull(isolatedSchema.permitToWork.expiryAlertedAt)))
            .catch(() => []) as any[];
          for (const p of expiringSoon) {
            const subject = `⏰ Permit-to-Work Expiring in 2 Hours — ${p.permitNumber}`;
            const html = `<div style="font-family:Arial,sans-serif;max-width:640px"><div style="background:#d97706;color:#fff;padding:20px;border-radius:8px 8px 0 0"><h2 style="margin:0">${subject}</h2></div><div style="background:#fff;padding:20px;border:1px solid #e5e7eb"><p>Permit ${p.permitNumber} for <strong>${PERMIT_TYPE_LABELS[p.permitType] || p.permitType}</strong> expires at ${new Date(p.permitValidUntil).toLocaleString('en-GB')}.</p><p>Location: ${p.workLocation}</p></div></div>`;
            await notifyAdmins(custDb, customer, settings, subject, html, `Permit ${p.permitNumber} expiring in 2 hours.`);
            await custDb.update(isolatedSchema.permitToWork).set({ expiryAlertedAt: now }).where(eq(isolatedSchema.permitToWork.id, p.id));
          }

          // 4. Company compliance document expiry alerts (PLI, ELI, H&S Policy)
          const schemaName = customerDbService.generateSchemaName(customer.id);
          await custDb.execute(`ALTER TABLE ${schemaName}.ptw_company_documents ADD COLUMN IF NOT EXISTS expiry_alerted_at TIMESTAMP`).catch(() => {});
          const now30 = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
          const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          const companyDocsResult = await custDb.execute(
            sql`SELECT * FROM ${sql.raw(schemaName)}.ptw_company_documents
             WHERE expiry_date IS NOT NULL
               AND replaced_at IS NULL
               AND expiry_date <= ${now30.toISOString().split('T')[0]}
               AND (expiry_alerted_at IS NULL OR expiry_alerted_at < ${sevenDaysAgo.toISOString()})`
          ).catch(() => ({ rows: [] }));
          const companyDocs = companyDocsResult.rows || companyDocsResult;
          for (const doc of companyDocs) {
            const expiryDate = new Date(doc.expiry_date);
            const isExpired = expiryDate < now;
            const daysUntilExpiry = Math.ceil((expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
            const docLabel = PTW_COMPANY_DOC_LABELS[doc.document_type] || doc.document_type;
            const expiryStr = expiryDate.toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });
            const subject = isExpired
              ? `🚨 Compliance Document EXPIRED — ${docLabel}`
              : `⚠️ Compliance Document Expiring in ${daysUntilExpiry} Day${daysUntilExpiry === 1 ? '' : 's'} — ${docLabel}`;
            const statusBg = isExpired ? '#dc2626' : '#d97706';
            const statusMsg = isExpired
              ? `<strong style="color:#dc2626">This document expired on ${expiryStr}.</strong> Please upload a replacement immediately to remain compliant.`
              : `This document expires on <strong>${expiryStr}</strong> (in ${daysUntilExpiry} day${daysUntilExpiry === 1 ? '' : 's'}). Please upload a replacement before it expires.`;
            const html = `<div style="font-family:Arial,sans-serif;max-width:640px">
              <div style="background:${statusBg};color:#fff;padding:20px;border-radius:8px 8px 0 0"><h2 style="margin:0">${subject}</h2></div>
              <div style="background:#fff;padding:20px;border:1px solid #e5e7eb">
                <p><strong>Document:</strong> ${doc.title}</p>
                <p><strong>Type:</strong> ${docLabel}</p>
                <p>${statusMsg}</p>
                <p>Go to the <a href="/permit-to-work?tab=compliance">Compliance Library</a> to upload a replacement document.</p>
              </div>
            </div>`;
            const text = `${subject}\n\nDocument: ${doc.title}\nType: ${docLabel}\nExpiry: ${expiryStr}\n\nPlease visit the Compliance Library to upload a replacement.`;
            await notifyAdmins(custDb, customer, settings, subject, html, text);
            await custDb.execute(
              sql`UPDATE ${sql.raw(schemaName)}.ptw_company_documents SET expiry_alerted_at = ${now.toISOString()} WHERE id = ${doc.id}`
            ).catch(() => {});
            logger.info(`[PTW Cron] Compliance doc alert sent: ${doc.title} (${doc.document_type})`);
          }
        } catch (custErr) {
          logger.error(`[PTW Cron] Error for customer ${customer.id}:`, custErr);
        }
      }
      logger.info('✅ [PTW Cron] Daily check complete');
    } catch (error) {
      logger.error('❌ [PTW Cron] Fatal error:', error);
    }
  }, { timezone: 'Europe/London' });
}
