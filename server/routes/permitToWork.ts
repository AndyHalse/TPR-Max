import type { Express } from 'express';
import cron from 'node-cron';
import multer from 'multer';
import { requireAuth } from '../auth';
import { customerDbService } from '../customerDatabase';
import { simpleDatabaseService } from '../simpleDatabaseService';
import { EmailService } from '../emailService';
import { ObjectStorageService } from '../objectStorage';
import * as isolatedSchema from '../isolatedSchema';
import { eq, and, inArray, lt, lte, isNull } from 'drizzle-orm';
import { logger } from '../utils/logger';
import { PTW_CHECKLISTS, PERMIT_TYPE_LABELS } from '../utils/ptwChecklists';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });
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

async function ensureTables(custDb: any, schemaName: string) {
  await custDb.execute(`CREATE TABLE IF NOT EXISTS ${schemaName}.permit_to_work (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
    permit_number TEXT NOT NULL,
    permit_type TEXT NOT NULL,
    work_description TEXT NOT NULL,
    work_location TEXT NOT NULL,
    contractor_company_id VARCHAR, contractor_company_name TEXT,
    contractor_worker_id VARCHAR, contractor_worker_name TEXT,
    staff_id VARCHAR, staff_name TEXT,
    planned_start_date TEXT NOT NULL, planned_start_time TEXT NOT NULL,
    planned_end_date TEXT NOT NULL, planned_end_time TEXT NOT NULL,
    actual_start_at TIMESTAMP, actual_end_at TIMESTAMP,
    permit_valid_from TIMESTAMP NOT NULL, permit_valid_until TIMESTAMP NOT NULL,
    status TEXT NOT NULL DEFAULT 'draft',
    authorised_by_id VARCHAR, authorised_by_name TEXT, authorised_at TIMESTAMP, auth_notes TEXT,
    rejected_by_id VARCHAR, rejected_at TIMESTAMP, rejection_reason TEXT,
    closed_by_id VARCHAR, closed_by_name TEXT, closed_at TIMESTAMP,
    closure_notes TEXT, work_completed_satisfactorily BOOLEAN,
    suspended_by_id VARCHAR, suspended_at TIMESTAMP, suspension_reason TEXT,
    linked_ppm_work_order_id VARCHAR, linked_incident_id VARCHAR, linked_compliance_cert_id VARCHAR,
    expiry_alerted_at TIMESTAMP, overdue_closure_alerted_at TIMESTAMP,
    created_by_id VARCHAR, created_by_name TEXT,
    created_at TIMESTAMP DEFAULT NOW(), updated_at TIMESTAMP DEFAULT NOW()
  )`);
  await custDb.execute(`CREATE TABLE IF NOT EXISTS ${schemaName}.permit_checklist (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
    permit_id VARCHAR NOT NULL REFERENCES ${schemaName}.permit_to_work(id) ON DELETE CASCADE,
    checklist_section TEXT NOT NULL, item_description TEXT NOT NULL,
    is_required BOOLEAN NOT NULL DEFAULT true,
    response TEXT, responded_by_id VARCHAR, responded_at TIMESTAMP,
    notes TEXT, display_order INTEGER NOT NULL DEFAULT 0
  )`);
  await custDb.execute(`CREATE TABLE IF NOT EXISTS ${schemaName}.permit_attachments (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
    permit_id VARCHAR NOT NULL REFERENCES ${schemaName}.permit_to_work(id) ON DELETE CASCADE,
    document_type TEXT NOT NULL, file_name TEXT NOT NULL, file_url TEXT NOT NULL,
    uploaded_by_id VARCHAR, uploaded_by_name TEXT,
    uploaded_at TIMESTAMP DEFAULT NOW()
  )`);
  await custDb.execute(`CREATE TABLE IF NOT EXISTS ${schemaName}.ptw_company_documents (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
    document_type TEXT NOT NULL,
    title TEXT NOT NULL,
    notes TEXT,
    file_url TEXT NOT NULL,
    file_name TEXT NOT NULL,
    expiry_date TEXT,
    uploaded_by_id VARCHAR, uploaded_by_name TEXT,
    uploaded_at TIMESTAMP DEFAULT NOW(),
    replaced_at TIMESTAMP,
    expiry_alerted_at TIMESTAMP
  )`);
  await custDb.execute(`ALTER TABLE ${schemaName}.ptw_company_documents ADD COLUMN IF NOT EXISTS expiry_alerted_at TIMESTAMP`).catch(() => {});
}

async function generatePermitNumber(custDb: any, year: number): Promise<string> {
  const all = await custDb.select({ permitNumber: isolatedSchema.permitToWork.permitNumber })
    .from(isolatedSchema.permitToWork);
  const thisYear = all.filter((r: any) => r.permitNumber?.startsWith(`PTW-${year}-`));
  const next = (thisYear.length + 1).toString().padStart(3, '0');
  return `PTW-${year}-${next}`;
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

export function registerPermitToWorkRoutes(app: Express): void {

  // ─── GET all permits ─────────────────────────────────────────────────────────
  app.get('/api/ptw', requireAuth, requirePermitToWorkFeature, async (req, res) => {
    try {
      const custDb = await customerDbService.getCustomerDatabase(req.customerId!);
      const schemaName = customerDbService.generateSchemaName(req.customerId!);
      await ensureTables(custDb, schemaName);
      const permits = await custDb.select().from(isolatedSchema.permitToWork)
        .orderBy(isolatedSchema.permitToWork.createdAt);
      res.json(permits.reverse());
    } catch (err) {
      logger.error('GET /api/ptw', err);
      res.status(500).json({ error: 'Failed to fetch permits' });
    }
  });

  // ─── POST create permit ──────────────────────────────────────────────────────
  app.post('/api/ptw', requireAuth, requirePermitToWorkFeature, async (req, res) => {
    try {
      const custDb = await customerDbService.getCustomerDatabase(req.customerId!);
      const schemaName = customerDbService.generateSchemaName(req.customerId!);
      await ensureTables(custDb, schemaName);

      const { permitType, workDescription, workLocation, plannedStartDate, plannedStartTime, plannedEndDate, plannedEndTime, contractorCompanyId, contractorCompanyName, contractorWorkerId, contractorWorkerName, staffId, staffName, linkedPpmWorkOrderId } = req.body;

      const year = new Date().getFullYear();
      const permitNumber = await generatePermitNumber(custDb, year);
      const permitValidFrom = new Date(`${plannedStartDate}T${plannedStartTime}:00`);
      const permitValidUntil = new Date(`${plannedEndDate}T${plannedEndTime}:00`);

      const [permit] = await custDb.insert(isolatedSchema.permitToWork).values({
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
      }).returning();

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
      await ensureTables(custDb, schemaName);
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
      await ensureTables(custDb, schemaName);

      const { documentType, title, notes, expiryDate } = req.body;
      if (!documentType || !title) return res.status(400).json({ error: 'Document type and title are required.' });

      let fileUrl = req.body.fileUrl || '';
      let fileName = req.body.fileName || '';
      if (req.file) {
        fileName = req.file.originalname;
        const objectKey = `ptw-company-docs/${req.customerId}/${documentType}-${Date.now()}_${fileName}`;
        fileUrl = await objectStorage.uploadObject(objectKey, req.file.buffer, req.file.mimetype);
      }
      if (!fileUrl || !fileName) return res.status(400).json({ error: 'File is required.' });

      const uploadedByName = `${req.user!.firstName || ''} ${req.user!.lastName || ''}`.trim() || req.user!.username;
      const result = await custDb.execute(
        `INSERT INTO ${schemaName}.ptw_company_documents (id, document_type, title, notes, file_url, file_name, expiry_date, uploaded_by_id, uploaded_by_name, uploaded_at)
         VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, $6, $7, $8, NOW()) RETURNING *`,
        [documentType, title, notes || null, fileUrl, fileName, expiryDate || null, req.user!.id, uploadedByName]
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

      const existing = await custDb.execute(`SELECT * FROM ${schemaName}.ptw_company_documents WHERE id = $1`, [docId]);
      const existingDoc = (existing.rows || existing)[0];
      if (!existingDoc) return res.status(404).json({ error: 'Document not found.' });

      const { notes, expiryDate } = req.body;
      let fileUrl = existingDoc.file_url;
      let fileName = existingDoc.file_name;
      if (req.file) {
        fileName = req.file.originalname;
        const objectKey = `ptw-company-docs/${req.customerId}/${existingDoc.document_type}-${Date.now()}_${fileName}`;
        fileUrl = await objectStorage.uploadObject(objectKey, req.file.buffer, req.file.mimetype);
      }

      const uploadedByName = `${req.user!.firstName || ''} ${req.user!.lastName || ''}`.trim() || req.user!.username;
      const result = await custDb.execute(
        `UPDATE ${schemaName}.ptw_company_documents
         SET file_url = $1, file_name = $2, notes = $3, expiry_date = $4,
             uploaded_by_id = $5, uploaded_by_name = $6, replaced_at = NOW()
         WHERE id = $7 RETURNING *`,
        [fileUrl, fileName, notes || null, expiryDate || null, req.user!.id, uploadedByName, docId]
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
      await custDb.execute(`DELETE FROM ${schemaName}.ptw_company_documents WHERE id = $1`, [docId]);
      res.json({ success: true });
    } catch (err) {
      logger.error('DELETE /api/ptw/company-documents/:docId', err);
      res.status(500).json({ error: 'Failed to delete company document' });
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
      res.json({ ...permit, checklist, attachments });
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
      const permitValidFrom = new Date(`${plannedStartDate}T${plannedStartTime}:00`);
      const permitValidUntil = new Date(`${plannedEndDate}T${plannedEndTime}:00`);

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
      const [item] = await custDb.update(isolatedSchema.permitChecklist)
        .set({ response, notes: notes || null, respondedById: req.user!.id, respondedAt: new Date() })
        .where(eq(isolatedSchema.permitChecklist.id, checklistItemId)).returning();
      res.json(item);
    } catch (err) {
      logger.error('PATCH /api/ptw/:id/checklist/:checklistItemId', err);
      res.status(500).json({ error: 'Failed to update checklist item' });
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

      const [updated] = await custDb.update(isolatedSchema.permitToWork)
        .set({ status: 'submitted', updatedAt: new Date() })
        .where(eq(isolatedSchema.permitToWork.id, id)).returning();

      // Notify admins/managers
      const context = simpleDatabaseService.createCustomerContext(req.user!.username, req.customerId!);
      const settings = await simpleDatabaseService.getCompanySettings(context).catch(() => null);
      const customer = { id: req.customerId! };
      const typeLabel = PERMIT_TYPE_LABELS[(permit as any).permitType] || (permit as any).permitType;
      const subject = `📋 Permit-to-Work Requires Authorisation — ${typeLabel} ${(permit as any).permitNumber}`;
      const html = `<div style="font-family:Arial,sans-serif;max-width:640px">
        <div style="background:#d97706;color:#fff;padding:20px;border-radius:8px 8px 0 0"><h2 style="margin:0">${subject}</h2></div>
        <div style="background:#fff;padding:20px;border:1px solid #e5e7eb">
          <p>A Permit-to-Work has been submitted for authorisation.</p>
          <table style="width:100%;border-collapse:collapse">
            <tr><td style="padding:4px 0;color:#6b7280;width:160px">Permit number</td><td style="font-weight:600">${(permit as any).permitNumber}</td></tr>
            <tr><td style="padding:4px 0;color:#6b7280">Work type</td><td>${typeLabel}</td></tr>
            <tr><td style="padding:4px 0;color:#6b7280">Location</td><td>${(permit as any).workLocation}</td></tr>
            <tr><td style="padding:4px 0;color:#6b7280">Description</td><td>${(permit as any).workDescription}</td></tr>
            <tr><td style="padding:4px 0;color:#6b7280">Planned start</td><td>${(permit as any).plannedStartDate} ${(permit as any).plannedStartTime}</td></tr>
            <tr><td style="padding:4px 0;color:#6b7280">Planned end</td><td>${(permit as any).plannedEndDate} ${(permit as any).plannedEndTime}</td></tr>
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
      const [permit] = await custDb.select().from(isolatedSchema.permitToWork).where(eq(isolatedSchema.permitToWork.id, id));
      if (!permit) return res.status(404).json({ error: 'Permit not found' });
      const terminatedStatuses = ['completed', 'expired', 'cancelled'];
      if (terminatedStatuses.includes((permit as any).status)) return res.status(400).json({ error: 'Permit cannot be cancelled in its current state.' });
      const [updated] = await custDb.update(isolatedSchema.permitToWork)
        .set({ status: 'cancelled', updatedAt: new Date() })
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
        const objectKey = `ptw-attachments/${req.customerId}/${id}/${Date.now()}_${fileName}`;
        fileUrl = await objectStorage.uploadObject(objectKey, req.file.buffer, req.file.mimetype);
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
      await custDb.delete(isolatedSchema.permitAttachments).where(eq(isolatedSchema.permitAttachments.id, attachmentId));
      res.json({ success: true });
    } catch (err) {
      logger.error('DELETE /api/ptw/:id/attachments/:attachmentId', err);
      res.status(500).json({ error: 'Failed to delete attachment' });
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

          // 1. Auto-expire authorised permits past validity window
          const toExpire = await custDb.select({ id: isolatedSchema.permitToWork.id, permitNumber: isolatedSchema.permitToWork.permitNumber, createdById: isolatedSchema.permitToWork.createdById })
            .from(isolatedSchema.permitToWork)
            .where(and(eq(isolatedSchema.permitToWork.status, 'authorised'), lt(isolatedSchema.permitToWork.permitValidUntil, now)))
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
            `SELECT * FROM ${schemaName}.ptw_company_documents
             WHERE expiry_date IS NOT NULL
               AND replaced_at IS NULL
               AND expiry_date <= $1
               AND (expiry_alerted_at IS NULL OR expiry_alerted_at < $2)`,
            [now30.toISOString().split('T')[0], sevenDaysAgo.toISOString()]
          ).catch(() => ({ rows: [] }));
          const companyDocs = companyDocsResult.rows || companyDocsResult;
          const DOC_TYPE_LABELS: Record<string, string> = {
            pli: 'Public Liability Insurance (PLI)',
            eli: 'Employers\' Liability Insurance (ELI)',
            hs_policy: 'Health & Safety Policy',
          };
          for (const doc of companyDocs) {
            const expiryDate = new Date(doc.expiry_date);
            const isExpired = expiryDate < now;
            const daysUntilExpiry = Math.ceil((expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
            const docLabel = DOC_TYPE_LABELS[doc.document_type] || doc.document_type;
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
              `UPDATE ${schemaName}.ptw_company_documents SET expiry_alerted_at = $1 WHERE id = $2`,
              [now.toISOString(), doc.id]
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
