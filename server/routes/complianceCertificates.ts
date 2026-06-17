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
import { eq, and, isNull, ne } from 'drizzle-orm';
import { logger } from '../utils/logger';
import { calculateCertificateStatus, calculateNextDueDate, getDaysUntilExpiry, getEffectiveDueDate, CERT_SEED_DATA } from '../utils/complianceCertUtils';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });
const objectStorage = new ObjectStorageService();

// DDL guard — run CREATE TABLE + ALTER once per customer schema per process lifetime
const bootstrappedSchemas = new Set<string>();

const requireComplianceCertificatesFeature = async (req: any, res: any, next: any) => {
  try {
    const context = simpleDatabaseService.createCustomerContext(req.user!.username, req.customerId);
    const settings = await simpleDatabaseService.getCompanySettings(context);
    if (!settings?.featureComplianceCertificates) {
      return res.status(403).json({ error: 'Compliance Certificate Register is not enabled. Please contact support to activate this module.' });
    }
    next();
  } catch (error) {
    next(error);
  }
};

async function ensureTables(custDb: any, schemaName: string) {
  if (bootstrappedSchemas.has(schemaName)) return;  // DDL already run this process

  await custDb.execute(`CREATE TABLE IF NOT EXISTS ${schemaName}.compliance_certificate_types (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
    certificate_type TEXT NOT NULL,
    display_name TEXT NOT NULL,
    legal_basis TEXT,
    frequency TEXT NOT NULL,
    custom_days INTEGER,
    is_active BOOLEAN NOT NULL DEFAULT true,
    reminder_days_before INTEGER NOT NULL DEFAULT 30,
    created_at TIMESTAMP DEFAULT NOW()
  )`);
  await custDb.execute(`CREATE TABLE IF NOT EXISTS ${schemaName}.compliance_certificates (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
    certificate_type_id VARCHAR NOT NULL REFERENCES ${schemaName}.compliance_certificate_types(id),
    certificate_type TEXT NOT NULL,
    issue_date TEXT NOT NULL,
    expiry_date TEXT,
    next_due_date TEXT,
    reference_number TEXT,
    issued_by TEXT,
    issuing_company TEXT,
    document_url TEXT,
    file_name TEXT,
    status TEXT NOT NULL DEFAULT 'current',
    linked_ppm_work_order_id VARCHAR,
    uploaded_by VARCHAR,
    notes TEXT,
    is_current BOOLEAN NOT NULL DEFAULT true,
    expiry_alerted_at TIMESTAMP,
    expiry_alert_phase TEXT,
    deleted_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW()
  )`);

  // Bring existing tenant schemas up to date (idempotent)
  await custDb.execute(`ALTER TABLE ${schemaName}.compliance_certificates
    ADD COLUMN IF NOT EXISTS expiry_alert_phase TEXT`);

  bootstrappedSchemas.add(schemaName);
}

export function registerComplianceCertificateRoutes(app: Express): void {

  // ─── GET types (dashboard endpoint) ─────────────────────────────────────────
  app.get('/api/compliance-certificates/types', requireAuth, requireComplianceCertificatesFeature, async (req, res) => {
    try {
      const custDb = await customerDbService.getCustomerDatabase(req.customerId!);
      const schemaName = customerDbService.generateSchemaName(req.customerId!);
      await ensureTables(custDb, schemaName);

      const types = await custDb.select().from(isolatedSchema.complianceCertificateTypes)
        .orderBy(isolatedSchema.complianceCertificateTypes.displayName);

      const certs = await custDb.select().from(isolatedSchema.complianceCertificates)
        .where(and(eq(isolatedSchema.complianceCertificates.isCurrent, true), isNull(isolatedSchema.complianceCertificates.deletedAt)));

      const certsByType: Record<string, any> = {};
      for (const c of certs as any[]) {
        certsByType[c.certificateTypeId] = c;
      }

      const result = (types as any[]).map(t => {
        const latestCert = certsByType[t.id] || null;
        let status: string = 'no_certificate';
        let daysUntilExpiry: number | null = null;
        let isOverdue = false;

        if (latestCert) {
          const dueDate = getEffectiveDueDate(latestCert);
          const s = calculateCertificateStatus(dueDate, t.reminderDaysBefore);
          status = dueDate ? s : 'no_expiry';
          daysUntilExpiry = getDaysUntilExpiry(dueDate);
          isOverdue = status === 'expired';
        }

        return { ...t, latestCertificate: latestCert, status, daysUntilExpiry, isOverdue };
      });

      res.json(result);
    } catch (err) {
      logger.error('GET /api/compliance-certificates/types', err);
      res.status(500).json({ error: 'Failed to fetch certificate types' });
    }
  });

  // ─── POST seed standard types ────────────────────────────────────────────────
  app.post('/api/compliance-certificates/types/seed', requireAuth, requireComplianceCertificatesFeature, async (req, res) => {
    try {
      const custDb = await customerDbService.getCustomerDatabase(req.customerId!);
      const schemaName = customerDbService.generateSchemaName(req.customerId!);
      await ensureTables(custDb, schemaName);

      const existing = await custDb.select({ certificateType: isolatedSchema.complianceCertificateTypes.certificateType })
        .from(isolatedSchema.complianceCertificateTypes);
      const existingTypes = new Set((existing as any[]).map(e => e.certificateType));

      const toInsert = CERT_SEED_DATA.filter(d => !existingTypes.has(d.type));
      if (toInsert.length === 0) return res.json({ message: 'Already seeded', count: 0 });

      const inserted = await custDb.insert(isolatedSchema.complianceCertificateTypes).values(
        toInsert.map(d => ({
          certificateType: d.type,
          displayName: d.name,
          legalBasis: d.legal,
          frequency: d.freq,
          customDays: (d as any).customDays ?? null,
        }))
      ).returning();

      res.status(201).json({ message: 'Seeded successfully', count: inserted.length });
    } catch (err) {
      logger.error('POST /api/compliance-certificates/types/seed', err);
      res.status(500).json({ error: 'Failed to seed certificate types' });
    }
  });

  // ─── POST create custom type ─────────────────────────────────────────────────
  app.post('/api/compliance-certificates/types', requireAuth, requireComplianceCertificatesFeature, async (req, res) => {
    try {
      const custDb = await customerDbService.getCustomerDatabase(req.customerId!);
      const schemaName = customerDbService.generateSchemaName(req.customerId!);
      await ensureTables(custDb, schemaName);

      const { displayName, frequency, customDays, legalBasis, reminderDaysBefore } = req.body;
      const [created] = await custDb.insert(isolatedSchema.complianceCertificateTypes).values({
        certificateType: 'custom',
        displayName,
        frequency: frequency || 'annual',
        customDays: customDays ?? null,
        legalBasis: legalBasis || null,
        reminderDaysBefore: reminderDaysBefore ?? 30,
      }).returning();
      res.status(201).json(created);
    } catch (err) {
      logger.error('POST /api/compliance-certificates/types', err);
      res.status(500).json({ error: 'Failed to create certificate type' });
    }
  });

  // ─── PUT update type ─────────────────────────────────────────────────────────
  app.put('/api/compliance-certificates/types/:id', requireAuth, requireComplianceCertificatesFeature, async (req, res) => {
    try {
      const custDb = await customerDbService.getCustomerDatabase(req.customerId!);
      const { id } = req.params;
      const { isActive, reminderDaysBefore, displayName } = req.body;
      const [type] = await custDb.select({ certificateType: isolatedSchema.complianceCertificateTypes.certificateType })
        .from(isolatedSchema.complianceCertificateTypes).where(eq(isolatedSchema.complianceCertificateTypes.id, id));
      if (!type) return res.status(404).json({ error: 'Certificate type not found' });

      const updates: any = {};
      if (isActive !== undefined) updates.isActive = isActive;
      if (reminderDaysBefore !== undefined) updates.reminderDaysBefore = reminderDaysBefore;
      if (displayName !== undefined && (type as any).certificateType === 'custom') updates.displayName = displayName;

      const [updated] = await custDb.update(isolatedSchema.complianceCertificateTypes)
        .set(updates).where(eq(isolatedSchema.complianceCertificateTypes.id, id)).returning();
      res.json(updated);
    } catch (err) {
      logger.error('PUT /api/compliance-certificates/types/:id', err);
      res.status(500).json({ error: 'Failed to update certificate type' });
    }
  });

  // ─── GET all certificates ────────────────────────────────────────────────────
  app.get('/api/compliance-certificates', requireAuth, requireComplianceCertificatesFeature, async (req, res) => {
    try {
      const custDb = await customerDbService.getCustomerDatabase(req.customerId!);
      const schemaName = customerDbService.generateSchemaName(req.customerId!);
      await ensureTables(custDb, schemaName);

      let query = custDb.select().from(isolatedSchema.complianceCertificates)
        .where(isNull(isolatedSchema.complianceCertificates.deletedAt));
      const certs = await query.orderBy(isolatedSchema.complianceCertificates.createdAt) as any[];
      res.json(certs.reverse());
    } catch (err) {
      logger.error('GET /api/compliance-certificates', err);
      res.status(500).json({ error: 'Failed to fetch certificates' });
    }
  });

  // ─── GET certificates for a specific type ───────────────────────────────────
  app.get('/api/compliance-certificates/by-type/:typeId', requireAuth, requireComplianceCertificatesFeature, async (req, res) => {
    try {
      const custDb = await customerDbService.getCustomerDatabase(req.customerId!);
      const { typeId } = req.params;
      const certs = await custDb.select().from(isolatedSchema.complianceCertificates)
        .where(and(eq(isolatedSchema.complianceCertificates.certificateTypeId, typeId), isNull(isolatedSchema.complianceCertificates.deletedAt)))
        .orderBy(isolatedSchema.complianceCertificates.createdAt) as any[];
      res.json(certs.reverse());
    } catch (err) {
      logger.error('GET /api/compliance-certificates/by-type/:typeId', err);
      res.status(500).json({ error: 'Failed to fetch certificate history' });
    }
  });

  // ─── GET status summary ──────────────────────────────────────────────────────
  app.get('/api/compliance-certificates/status-summary', requireAuth, requireComplianceCertificatesFeature, async (req, res) => {
    try {
      const custDb = await customerDbService.getCustomerDatabase(req.customerId!);
      const schemaName = customerDbService.generateSchemaName(req.customerId!);
      await ensureTables(custDb, schemaName);

      const types = await custDb.select().from(isolatedSchema.complianceCertificateTypes)
        .where(eq(isolatedSchema.complianceCertificateTypes.isActive, true)) as any[];
      const certs = await custDb.select().from(isolatedSchema.complianceCertificates)
        .where(and(eq(isolatedSchema.complianceCertificates.isCurrent, true), isNull(isolatedSchema.complianceCertificates.deletedAt))) as any[];
      const certsByType: Record<string, any> = {};
      for (const c of certs) certsByType[c.certificateTypeId] = c;

      let current = 0, expiring = 0, expired = 0, noCert = 0, noExpiry = 0;
      for (const t of types) {
        const cert = certsByType[t.id];
        if (!cert) { noCert++; continue; }
        const dueDate = getEffectiveDueDate(cert);
        if (!dueDate) { noExpiry++; continue; }   // logged but no due date to judge — own bucket
        const s = calculateCertificateStatus(dueDate, t.reminderDaysBefore);
        if (s === 'current') current++;
        else if (s === 'expiring_soon') expiring++;
        else if (s === 'expired') expired++;
      }

      let overallStatus: string = 'compliant';
      if (expired > 0 || noCert > 0) overallStatus = 'critical';
      else if (expiring > 0) overallStatus = 'attention_needed';

      res.json({ total: types.length, current, expiring_soon: expiring, expired, no_certificate: noCert, no_expiry: noExpiry, overallStatus });
    } catch (err) {
      logger.error('GET /api/compliance-certificates/status-summary', err);
      res.status(500).json({ error: 'Failed to fetch status summary' });
    }
  });

  // ─── POST create certificate record (JSON only) ─────────────────────────────
  // Note: multer is NOT used here because multer v2 resets req.body for JSON
  // requests. File upload is handled as a second step via /:id/upload.
  app.post('/api/compliance-certificates', requireAuth, requireComplianceCertificatesFeature, async (req, res) => {
    try {
      const custDb = await customerDbService.getCustomerDatabase(req.customerId!);
      const schemaName = customerDbService.generateSchemaName(req.customerId!);
      await ensureTables(custDb, schemaName);

      const { certificateTypeId, issueDate, expiryDate, referenceNumber, issuedBy, issuingCompany, documentUrl, fileName, linkedPpmWorkOrderId, notes } = req.body;

      if (!issueDate) return res.status(400).json({ error: 'Issue date is required' });
      if (expiryDate && expiryDate < issueDate) {
        return res.status(400).json({ error: 'Expiry date cannot be before the issue date' });
      }

      const [certType] = await custDb.select().from(isolatedSchema.complianceCertificateTypes)
        .where(eq(isolatedSchema.complianceCertificateTypes.id, certificateTypeId)) as any[];
      if (!certType) return res.status(404).json({ error: 'Certificate type not found' });

      const nextDueDate = calculateNextDueDate(issueDate, certType.frequency, certType.customDays);
      const status = calculateCertificateStatus(expiryDate || nextDueDate, certType.reminderDaysBefore);

      // Atomic renewal: demote previous current + insert new in a single transaction
      const created = await custDb.transaction(async (tx: any) => {
        await tx.update(isolatedSchema.complianceCertificates)
          .set({ isCurrent: false })
          .where(and(
            eq(isolatedSchema.complianceCertificates.certificateTypeId, certificateTypeId),
            eq(isolatedSchema.complianceCertificates.isCurrent, true)
          ));
        const [row] = await tx.insert(isolatedSchema.complianceCertificates).values({
          certificateTypeId,
          certificateType: certType.certificateType,
          issueDate,
          expiryDate: expiryDate || null,
          nextDueDate: nextDueDate || null,
          referenceNumber: referenceNumber || null,
          issuedBy: issuedBy || null,
          issuingCompany: issuingCompany || null,
          documentUrl: documentUrl || null,
          fileName: fileName || null,
          status,
          linkedPpmWorkOrderId: linkedPpmWorkOrderId || null,
          uploadedBy: req.user!.id,
          notes: notes || null,
          isCurrent: true,
        }).returning();
        return row;
      });
      res.status(201).json(created);
    } catch (err) {
      logger.error('POST /api/compliance-certificates', err);
      res.status(500).json({ error: 'Failed to create certificate' });
    }
  });

  // ─── POST upload document to existing record ─────────────────────────────────
  app.post('/api/compliance-certificates/:id/upload', requireAuth, requireComplianceCertificatesFeature, upload.single('file'), async (req: any, res) => {
    try {
      const custDb = await customerDbService.getCustomerDatabase(req.customerId!);
      const { id } = req.params;
      const [cert] = await custDb.select().from(isolatedSchema.complianceCertificates).where(eq(isolatedSchema.complianceCertificates.id, id)) as any[];
      if (!cert) return res.status(404).json({ error: 'Certificate not found' });

      let fileUrl = cert.documentUrl || '';
      let fileName = cert.fileName || '';

      if (req.file) {
        fileName = req.file.originalname;
        const privateDir = objectStorage.getPrivateObjectDir();
        const objectId = randomUUID();
        const certCustomerId = req.customerId!;
        const fullPath = `${privateDir}/${certCustomerId}/uploads/${objectId}`;
        const parts = fullPath.slice(1).split('/');
        const bucketName = parts[0];
        const objectName = parts.slice(1).join('/');
        const bucket = objectStorageClient.bucket(bucketName);
        const fileObj = bucket.file(objectName);
        await fileObj.save(req.file.buffer, { contentType: req.file.mimetype, resumable: false });
        fileUrl = `/objects/${certCustomerId}/uploads/${objectId}`;
      } else if (req.body.fileUrl) {
        fileUrl = req.body.fileUrl;
        fileName = req.body.fileName || fileName;
      }

      const [updated] = await custDb.update(isolatedSchema.complianceCertificates)
        .set({ documentUrl: fileUrl, fileName })
        .where(eq(isolatedSchema.complianceCertificates.id, id)).returning();
      res.json(updated);
    } catch (err) {
      logger.error('POST /api/compliance-certificates/:id/upload', err);
      res.status(500).json({ error: 'Failed to upload document' });
    }
  });

  // ─── GET download certificate document ──────────────────────────────────────
  app.get('/api/compliance-certificates/:id/download', requireAuth, requireComplianceCertificatesFeature, async (req, res) => {
    try {
      const custDb = await customerDbService.getCustomerDatabase(req.customerId!);
      const { id } = req.params;
      const [cert] = await custDb.select().from(isolatedSchema.complianceCertificates).where(eq(isolatedSchema.complianceCertificates.id, id)) as any[];
      if (!cert || !cert.documentUrl) return res.status(404).json({ error: 'Document not found' });
      res.redirect(cert.documentUrl);
    } catch (err) {
      logger.error('GET /api/compliance-certificates/:id/download', err);
      res.status(500).json({ error: 'Failed to download document' });
    }
  });

  // ─── PATCH edit a certificate record ─────────────────────────────────────────
  app.patch('/api/compliance-certificates/:id', requireAuth, requireComplianceCertificatesFeature, async (req, res) => {
    try {
      const custDb = await customerDbService.getCustomerDatabase(req.customerId!);
      const schemaName = customerDbService.generateSchemaName(req.customerId!);
      await ensureTables(custDb, schemaName);

      const { id } = req.params;
      const { issueDate, expiryDate, referenceNumber, issuedBy, issuingCompany, notes } = req.body;

      const [cert] = await custDb.select().from(isolatedSchema.complianceCertificates)
        .where(eq(isolatedSchema.complianceCertificates.id, id)) as any[];
      if (!cert) return res.status(404).json({ error: 'Certificate not found' });

      if (!issueDate) return res.status(400).json({ error: 'Issue date is required' });
      if (expiryDate && expiryDate < issueDate) {
        return res.status(400).json({ error: 'Expiry date cannot be before the issue date' });
      }

      const [certType] = await custDb.select().from(isolatedSchema.complianceCertificateTypes)
        .where(eq(isolatedSchema.complianceCertificateTypes.id, cert.certificateTypeId)) as any[];

      const nextDueDate = calculateNextDueDate(issueDate, certType?.frequency ?? 'annual', certType?.customDays);
      const status = calculateCertificateStatus(expiryDate || nextDueDate, certType?.reminderDaysBefore ?? 30);

      const [updated] = await custDb.update(isolatedSchema.complianceCertificates)
        .set({
          issueDate,
          expiryDate: expiryDate || null,
          nextDueDate: nextDueDate || null,
          referenceNumber: referenceNumber || null,
          issuedBy: issuedBy || null,
          issuingCompany: issuingCompany || null,
          notes: notes || null,
          status,
          expiryAlertedAt: null,    // re-evaluate alerts against the corrected dates
          expiryAlertPhase: null,
        })
        .where(eq(isolatedSchema.complianceCertificates.id, id)).returning();

      res.json(updated);
    } catch (err) {
      logger.error('PATCH /api/compliance-certificates/:id', err);
      res.status(500).json({ error: 'Failed to update certificate' });
    }
  });

  // ─── DELETE (soft delete) certificate ────────────────────────────────────────
  app.delete('/api/compliance-certificates/:id', requireAuth, requireComplianceCertificatesFeature, async (req, res) => {
    try {
      const custDb = await customerDbService.getCustomerDatabase(req.customerId!);
      const { id } = req.params;
      const [cert] = await custDb.select().from(isolatedSchema.complianceCertificates)
        .where(eq(isolatedSchema.complianceCertificates.id, id)) as any[];
      if (!cert) return res.status(404).json({ error: 'Certificate not found' });

      await custDb.update(isolatedSchema.complianceCertificates)
        .set({ deletedAt: new Date() })
        .where(eq(isolatedSchema.complianceCertificates.id, id));

      // If this was current, promote the previous cert of the same type
      if (cert.isCurrent) {
        const prev = await custDb.select().from(isolatedSchema.complianceCertificates)
          .where(and(
            eq(isolatedSchema.complianceCertificates.certificateTypeId, cert.certificateTypeId),
            isNull(isolatedSchema.complianceCertificates.deletedAt),
            ne(isolatedSchema.complianceCertificates.id, id)
          ))
          .orderBy(isolatedSchema.complianceCertificates.createdAt) as any[];
        if (prev.length > 0) {
          await custDb.update(isolatedSchema.complianceCertificates)
            .set({ isCurrent: true })
            .where(eq(isolatedSchema.complianceCertificates.id, prev[prev.length - 1].id));
        }
      }
      res.json({ success: true });
    } catch (err) {
      logger.error('DELETE /api/compliance-certificates/:id', err);
      res.status(500).json({ error: 'Failed to delete certificate' });
    }
  });

  // ─── Daily cron for certificate expiry alerts ────────────────────────────────
  const certAlertHour = parseInt(process.env.CERT_ALERT_HOUR ?? '7', 10);
  cron.schedule(`0 ${certAlertHour} * * *`, async () => {
    try {
      logger.info('📜 [Cert Cron] Running daily certificate expiry check…');
      const allCustomers = await customerDbService.getAllCustomers();

      for (const customer of allCustomers) {
        try {
          const custDb = await customerDbService.getCustomerDatabase(customer.id);
          const context = { customerId: customer.id, username: 'system' };
          const settings = await simpleDatabaseService.getCompanySettings(context as any).catch(() => null);
          if (!settings?.featureComplianceCertificates) continue;

          const adminEmail = (settings as any).adminEmail || (settings as any).notificationEmail;
          if (!adminEmail) continue;

          const companyName = (settings as any).companyName || 'TPR Max';
          const emailSvc = new EmailService(customer.id);

          const types = await custDb.select().from(isolatedSchema.complianceCertificateTypes)
            .where(eq(isolatedSchema.complianceCertificateTypes.isActive, true))
            .catch(() => []) as any[];

          for (const certType of types) {
            const [cert] = await custDb.select().from(isolatedSchema.complianceCertificates)
              .where(and(
                eq(isolatedSchema.complianceCertificates.certificateTypeId, certType.id),
                eq(isolatedSchema.complianceCertificates.isCurrent, true),
                isNull(isolatedSchema.complianceCertificates.deletedAt)
              )).catch(() => []) as any[];

            if (!cert) continue;
            const dueDate = getEffectiveDueDate(cert);
            if (!dueDate) continue;   // genuinely no expiry/next-due — nothing to alert on

            const status = calculateCertificateStatus(dueDate, certType.reminderDaysBefore);
            if (status !== 'expiring_soon' && status !== 'expired') continue;

            // Phase-aware escalation: expiring once → expired once → weekly while still expired
            const phase = (cert as any).expiryAlertPhase as string | null;
            const lastAlertAt: Date | null = cert.expiryAlertedAt ? new Date(cert.expiryAlertedAt) : null;
            const daysSinceLastAlert = lastAlertAt
              ? Math.floor((Date.now() - lastAlertAt.getTime()) / (1000 * 60 * 60 * 24))
              : Infinity;

            let shouldSend = false;
            let newPhase = phase;
            if (status === 'expiring_soon') {
              if (phase !== 'expiring' && phase !== 'expired') { shouldSend = true; newPhase = 'expiring'; }
            } else { // expired
              if (phase !== 'expired' || daysSinceLastAlert >= 7) { shouldSend = true; newPhase = 'expired'; }
            }
            if (!shouldSend) continue;

            const days = getDaysUntilExpiry(dueDate);
            const isExpired = status === 'expired';
            const subject = isExpired
              ? `🚨 Compliance Certificate EXPIRED — ${certType.displayName}`
              : `⚠ Compliance Certificate Expiring — ${certType.displayName}`;

            const statusLine = isExpired
              ? `Due <strong>${Math.abs(days ?? 0)} days ago</strong> (${dueDate})`
              : `Due on <strong>${dueDate}</strong> (${days} days remaining)`;

            const html = `<div style="font-family:Arial,sans-serif;max-width:640px">
              <div style="background:${isExpired ? '#dc2626' : '#d97706'};color:#fff;padding:20px;border-radius:8px 8px 0 0">
                <h2 style="margin:0">${subject}</h2>
              </div>
              <div style="background:#fff;padding:20px;border:1px solid #e5e7eb">
                <p>Your <strong>${certType.displayName}</strong> certificate is ${isExpired ? 'expired' : 'expiring soon'} and requires renewal.</p>
                <table style="width:100%;border-collapse:collapse;font-size:14px">
                  <tr><td style="padding:4px 0;color:#6b7280;width:160px">Certificate type</td><td>${certType.displayName}</td></tr>
                  <tr><td style="padding:4px 0;color:#6b7280">Legal requirement</td><td>${certType.legalBasis || '—'}</td></tr>
                  <tr><td style="padding:4px 0;color:#6b7280">Last issued by</td><td>${cert.issuingCompany || cert.issuedBy || '—'}</td></tr>
                  <tr><td style="padding:4px 0;color:#6b7280">Issue date</td><td>${cert.issueDate}</td></tr>
                  <tr><td style="padding:4px 0;color:#6b7280">Due date</td><td>${dueDate}</td></tr>
                  <tr><td style="padding:4px 0;color:${isExpired ? '#dc2626' : '#d97706'};font-weight:600">Status</td><td style="color:${isExpired ? '#dc2626' : '#d97706'};font-weight:600">${statusLine}</td></tr>
                </table>
                <p style="margin-top:16px">Log in to TPR Max to upload the renewed certificate and update your compliance record.</p>
                <p style="color:#6b7280;font-size:13px">If this certificate has already been renewed, please upload the new document to clear this reminder.</p>
              </div>
              <div style="background:#f9fafb;padding:12px 20px;border:1px solid #e5e7eb;border-top:0;border-radius:0 0 8px 8px;font-size:12px;color:#9ca3af">
                This alert was sent by ${companyName} via TPR Max Compliance Register.
              </div>
            </div>`;

            const sent = await emailSvc.sendEmail({
              to: adminEmail,
              subject,
              html,
              text: `${subject}\n\nCertificate: ${certType.displayName}\nLegal basis: ${certType.legalBasis || '—'}\nDue: ${dueDate}\nStatus: ${status}`,
              companyName,
            });

            if (sent) {
              await custDb.update(isolatedSchema.complianceCertificates)
                .set({ expiryAlertedAt: new Date(), expiryAlertPhase: newPhase })
                .where(eq(isolatedSchema.complianceCertificates.id, cert.id));
              setImmediate(() => logger.info(`📧 [Cert Cron] ${newPhase} alert sent for "${certType.displayName}" (customer ${customer.id})`));
            }
          }
        } catch (custErr) {
          logger.error(`[Cert Cron] Error for customer ${customer.id}:`, custErr);
        }
      }
      logger.info('✅ [Cert Cron] Daily check complete');
    } catch (error) {
      logger.error('❌ [Cert Cron] Fatal error:', error);
    }
  }, { timezone: 'Europe/London' });
}
