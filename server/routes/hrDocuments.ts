import type { Express } from 'express';
import { requireAuth } from '../auth';
import { requireHrFeature, requireHrAdmin, recordHrAudit } from './hrMiddleware';
import { customerDbService } from '../customerDatabase';
import { logger } from '../utils/logger';

async function getPool(customerId: string) {
  const custDb = await customerDbService.getCustomerDatabase(customerId);
  const schemaName = customerDbService.generateSchemaName(customerId);
  const pool = (custDb as any).$client ?? (custDb as any).session?.client;
  return { pool, schemaName };
}

export function registerHrDocumentRoutes(app: Express): void {

  // GET /api/staff/:staffId/documents — admin/hr_admin only
  app.get('/api/staff/:staffId/documents', requireAuth, requireHrFeature, requireHrAdmin, async (req, res) => {
    try {
      const { pool, schemaName } = await getPool(req.customerId!);
      const userRole = req.user?.role || '';
      const result = await pool.query(
        `SELECT * FROM "${schemaName}".staff_documents
         WHERE staff_id = $1
           AND deleted_at IS NULL
           AND (is_confidential = FALSE OR $2 = ANY(ARRAY['admin','hr_admin']))
         ORDER BY created_at DESC`,
        [req.params.staffId, userRole]
      );
      res.json(result.rows);
    } catch (err: any) {
      logger.error('Documents fetch error:', err);
      res.status(500).json({ error: 'Failed to fetch documents' });
    }
  });

  // POST /api/staff/:staffId/documents/upload — HR admin only
  app.post('/api/staff/:staffId/documents/upload', requireAuth, requireHrFeature, requireHrAdmin, async (req, res) => {
    try {
      const { pool, schemaName } = await getPool(req.customerId!);
      const { staffId } = req.params;
      const { documentType, title, fileUrl, fileName, fileSizeBytes, isConfidential, expiryDate, notes } = req.body;

      if (!documentType || !title || !fileUrl || !fileName) {
        return res.status(400).json({ error: 'documentType, title, fileUrl and fileName are required' });
      }
      if (typeof fileUrl !== 'string' || (!fileUrl.startsWith('/objects/') && !fileUrl.startsWith('https://'))) {
        return res.status(400).json({ error: 'fileUrl must be a valid object storage path or URL' });
      }
      if (expiryDate && !/^\d{4}-\d{2}-\d{2}$/.test(String(expiryDate).slice(0, 10))) {
        return res.status(400).json({ error: 'expiryDate must be YYYY-MM-DD' });
      }

      const uploadedBy = req.user?.username || 'unknown';

      const result = await pool.query(
        `INSERT INTO "${schemaName}".staff_documents
          (staff_id, document_type, title, file_url, file_name, file_size_bytes,
           uploaded_by, is_confidential, expiry_date, notes)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
        [staffId, documentType, title, fileUrl, fileName, fileSizeBytes || null,
         uploadedBy, isConfidential || false, expiryDate || null, notes || null]
      );

      const row = result.rows[0];
      await recordHrAudit(pool, schemaName, {
        entityType: 'document', entityId: row.id, staffId,
        action: 'upload', actor: uploadedBy,
        details: { documentType, title, fileName, isConfidential: isConfidential || false },
      });

      res.status(201).json(row);
    } catch (err: any) {
      logger.error('Document upload error:', err);
      res.status(500).json({ error: 'Failed to upload document' });
    }
  });

  // GET /api/staff/:staffId/documents/:id/download — admin/hr_admin only
  app.get('/api/staff/:staffId/documents/:id/download', requireAuth, requireHrFeature, requireHrAdmin, async (req, res) => {
    try {
      const { pool, schemaName } = await getPool(req.customerId!);
      const result = await pool.query(
        `SELECT file_url, file_name, is_confidential FROM "${schemaName}".staff_documents
         WHERE id = $1 AND staff_id = $2 AND deleted_at IS NULL`,
        [req.params.id, req.params.staffId]
      );
      const doc = result.rows[0];
      if (!doc) return res.status(404).json({ error: 'Document not found' });
      if (doc.is_confidential && !['admin', 'hr_admin'].includes(req.user?.role || '')) {
        return res.status(403).json({ error: 'You do not have permission to download this document.' });
      }
      res.json({ fileUrl: doc.file_url, fileName: doc.file_name });
    } catch (err: any) {
      logger.error('Document download error:', err);
      res.status(500).json({ error: 'Failed to get document download link' });
    }
  });

  // DELETE /api/staff/:staffId/documents/:id — soft delete (HR admin only)
  app.delete('/api/staff/:staffId/documents/:id', requireAuth, requireHrFeature, requireHrAdmin, async (req, res) => {
    try {
      const { pool, schemaName } = await getPool(req.customerId!);
      const actor = req.user?.username || 'unknown';
      await pool.query(
        `UPDATE "${schemaName}".staff_documents SET deleted_at = NOW(), deleted_by = $3
         WHERE id = $1 AND staff_id = $2`,
        [req.params.id, req.params.staffId, actor]
      );
      await recordHrAudit(pool, schemaName, {
        entityType: 'document', entityId: req.params.id, staffId: req.params.staffId,
        action: 'delete', actor,
      });
      res.json({ success: true });
    } catch (err: any) {
      logger.error('Document delete error:', err);
      res.status(500).json({ error: 'Failed to delete document' });
    }
  });
}
