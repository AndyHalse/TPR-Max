import type { Express } from 'express';
import { requireAuth } from '../auth';
import { customerDbService } from '../customerDatabase';
import { logger } from '../utils/logger';
import { eq } from 'drizzle-orm';
import * as isolatedSchema from '../isolatedSchema';

async function getCertPool(customerId: string) {
  const custDb = await customerDbService.getCustomerDatabase(customerId);
  const schemaName = customerDbService.generateSchemaName(customerId);
  const pool = (custDb as any).$client ?? (custDb as any).session?.client;
  return { pool, schemaName, custDb };
}

export function registerContractorWorkerCertsRoutes(app: Express): void {

  // GET /api/contractor-workers/certification-types
  // Returns the active certificate catalogue for this customer
  app.get('/api/contractor-workers/certification-types', requireAuth, async (req, res) => {
    try {
      const { pool, schemaName } = await getCertPool(req.customerId!);
      const result = await pool.query(
        `SELECT * FROM "${schemaName}".worker_certification_types
         WHERE is_active = TRUE
         ORDER BY CASE category WHEN 'legal' THEN 1 WHEN 'site' THEN 2 WHEN 'training' THEN 3 ELSE 4 END, name`
      );
      res.json(result.rows);
    } catch (err: any) {
      logger.error('Cert types fetch error:', err);
      res.status(500).json({ error: 'Failed to fetch certification types' });
    }
  });

  // GET /api/contractors/workers/:workerId/certificates
  // Returns catalogue rows joined to the worker's contractor_documents, with derived status
  app.get('/api/contractors/workers/:workerId/certificates', requireAuth, async (req, res) => {
    try {
      const { pool, schemaName } = await getCertPool(req.customerId!);
      const { workerId } = req.params;

      const [typesResult, docsResult] = await Promise.all([
        pool.query(
          `SELECT * FROM "${schemaName}".worker_certification_types
           WHERE is_active = TRUE
           ORDER BY CASE category WHEN 'legal' THEN 1 WHEN 'site' THEN 2 WHEN 'training' THEN 3 ELSE 4 END, name`
        ),
        pool.query(
          `SELECT * FROM "${schemaName}".contractor_documents
           WHERE worker_id = $1 AND is_active = TRUE
           ORDER BY uploaded_at DESC`,
          [workerId]
        ),
      ]);

      const now = new Date();
      const ninetyDaysAhead = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);

      const rows = typesResult.rows.map((type: any) => {
        const doc = docsResult.rows.find((d: any) => d.document_type === type.key) ?? null;

        let status = 'missing';
        if (doc) {
          if (doc.status === 'pending') {
            status = 'pending_review';
          } else if (doc.status === 'rejected') {
            status = 'rejected';
          } else if (doc.status === 'approved') {
            if (doc.expiry_date) {
              const expiry = new Date(doc.expiry_date);
              if (expiry < now) {
                status = 'expired';
              } else if (expiry < ninetyDaysAhead) {
                status = 'expiring_soon';
              } else {
                status = 'valid';
              }
            } else {
              status = type.requires_expiry ? 'valid' : 'valid';
            }
          }
        }

        return { ...type, status, document: doc };
      });

      res.json(rows);
    } catch (err: any) {
      logger.error('Worker certs fetch error:', err);
      res.status(500).json({ error: 'Failed to fetch worker certificates' });
    }
  });

  // POST /api/contractors/workers/:workerId/certificates
  // Creates/replaces a certificate record in contractor_documents
  app.post('/api/contractors/workers/:workerId/certificates', requireAuth, async (req, res) => {
    try {
      const { pool, schemaName, custDb } = await getCertPool(req.customerId!);
      const { workerId } = req.params;
      const { documentType, documentUrl, expiryDate, issuedBy, certNumber, documentName } = req.body;

      if (!documentType || !documentUrl) {
        return res.status(400).json({ error: 'documentType and documentUrl are required' });
      }

      // Look up worker to get companyId and username for uploadedBy
      const workers = await pool.query(
        `SELECT company_id FROM "${schemaName}".contractor_workers WHERE id = $1 LIMIT 1`,
        [workerId]
      );
      if (!workers.rows.length) {
        return res.status(404).json({ error: 'Worker not found' });
      }
      const companyId = workers.rows[0].company_id;

      // Resolve the uploading user's DB id
      const username = req.user!.username;
      const [currentUser] = await custDb
        .select({ id: isolatedSchema.users.id })
        .from(isolatedSchema.users)
        .where(eq(isolatedSchema.users.username, username))
        .limit(1);
      const uploadedBy = currentUser?.id ?? username;

      // Mark any previous doc of the same type for this worker as inactive
      await pool.query(
        `UPDATE "${schemaName}".contractor_documents
         SET is_active = FALSE, updated_at = NOW()
         WHERE worker_id = $1 AND document_type = $2 AND is_active = TRUE`,
        [workerId, documentType]
      );

      // Insert the new document
      const result = await pool.query(
        `INSERT INTO "${schemaName}".contractor_documents
           (company_id, worker_id, document_name, document_type, document_url, expiry_date,
            uploaded_by, status, is_active, issued_by, policy_number, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,'pending',TRUE,$8,$9,NOW(),NOW())
         RETURNING *`,
        [
          companyId,
          workerId,
          documentName || documentType.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()),
          documentType,
          documentUrl,
          expiryDate ? new Date(expiryDate) : null,
          uploadedBy,
          issuedBy || null,
          certNumber || null,
        ]
      );

      // Audit note
      try {
        await custDb.insert(isolatedSchema.companyNotes).values({
          companyId,
          changeType: 'document_uploaded',
          notes: `Worker certificate "${documentType}" uploaded by ${username}${expiryDate ? ` (expires ${new Date(expiryDate).toLocaleDateString('en-GB')})` : ''}`,
          changedBy: username,
        });
      } catch {
        // Non-fatal
      }

      res.status(201).json(result.rows[0]);
    } catch (err: any) {
      logger.error('Worker cert upload error:', err);
      res.status(500).json({ error: 'Failed to upload certificate' });
    }
  });

  // DELETE /api/contractors/workers/certificates/:docId
  // Soft-deactivate a certificate document (keeps audit trail)
  app.delete('/api/contractors/workers/certificates/:docId', requireAuth, async (req, res) => {
    try {
      const { pool, schemaName } = await getCertPool(req.customerId!);
      const result = await pool.query(
        `UPDATE "${schemaName}".contractor_documents
         SET is_active = FALSE, updated_at = NOW()
         WHERE id = $1
         RETURNING id`,
        [req.params.docId]
      );
      if (!result.rows.length) {
        return res.status(404).json({ error: 'Document not found' });
      }
      res.json({ success: true });
    } catch (err: any) {
      logger.error('Worker cert delete error:', err);
      res.status(500).json({ error: 'Failed to remove certificate' });
    }
  });
}
