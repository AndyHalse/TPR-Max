import type { Express } from 'express';
import { requireAuth } from '../auth';
import { customerDbService } from '../customerDatabase';
import { logger } from '../utils/logger';
import * as isolatedSchema from '../isolatedSchema';
import { eq } from 'drizzle-orm';

async function getEquipPool(customerId: string) {
  const custDb = await customerDbService.getCustomerDatabase(customerId);
  const schemaName = customerDbService.generateSchemaName(customerId);
  const pool = (custDb as any).$client ?? (custDb as any).session?.client;
  return { pool, schemaName, custDb };
}

export function registerContractorEquipmentRoutes(app: Express): void {

  // GET /api/contractor-equipment/certification-types
  // Returns the equipment certificate catalogue
  app.get('/api/contractor-equipment/certification-types', requireAuth, async (req, res) => {
    try {
      const { pool, schemaName } = await getEquipPool(req.customerId!);
      const result = await pool.query(
        `SELECT * FROM "${schemaName}".equipment_certification_types
         WHERE is_active = TRUE
         ORDER BY CASE category WHEN 'legal' THEN 1 WHEN 'inspection' THEN 2 ELSE 3 END, name`
      );
      res.json(result.rows);
    } catch (err: any) {
      logger.error('Equipment cert types fetch error:', err);
      res.status(500).json({ error: 'Failed to fetch equipment certification types' });
    }
  });

  // GET /api/contractors/:companyId/equipment
  // List all equipment for a contractor company
  app.get('/api/contractors/:companyId/equipment', requireAuth, async (req, res) => {
    try {
      const { pool, schemaName } = await getEquipPool(req.customerId!);
      const { companyId } = req.params;
      const result = await pool.query(
        `SELECT e.*,
          (SELECT COUNT(*) FROM "${schemaName}".contractor_documents d
           WHERE d.equipment_id = e.id AND d.is_active = TRUE AND d.status = 'approved'
             AND (d.expiry_date IS NULL OR d.expiry_date > NOW())) AS valid_cert_count,
          (SELECT COUNT(*) FROM "${schemaName}".contractor_documents d
           WHERE d.equipment_id = e.id AND d.is_active = TRUE
             AND d.expiry_date IS NOT NULL AND d.expiry_date < NOW()) AS expired_cert_count,
          (SELECT COUNT(*) FROM "${schemaName}".contractor_documents d
           WHERE d.equipment_id = e.id AND d.is_active = TRUE AND d.status = 'pending') AS pending_cert_count
         FROM "${schemaName}".contractor_equipment e
         WHERE e.company_id = $1 AND e.is_active = TRUE
         ORDER BY e.created_at DESC`,
        [companyId]
      );
      res.json(result.rows);
    } catch (err: any) {
      logger.error('Equipment list fetch error:', err);
      res.status(500).json({ error: 'Failed to fetch equipment' });
    }
  });

  // POST /api/contractors/:companyId/equipment
  // Add a new piece of equipment
  app.post('/api/contractors/:companyId/equipment', requireAuth, async (req, res) => {
    try {
      const { pool, schemaName } = await getEquipPool(req.customerId!);
      const { companyId } = req.params;
      const { name, category, makeModel, serialOrReg, notes } = req.body;
      if (!name || !category) {
        return res.status(400).json({ error: 'name and category are required' });
      }
      const result = await pool.query(
        `INSERT INTO "${schemaName}".contractor_equipment
           (company_id, name, category, make_model, serial_or_reg, notes, is_active, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,TRUE,NOW(),NOW()) RETURNING *`,
        [companyId, name, category, makeModel || null, serialOrReg || null, notes || null]
      );
      res.status(201).json(result.rows[0]);
    } catch (err: any) {
      logger.error('Equipment create error:', err);
      res.status(500).json({ error: 'Failed to create equipment record' });
    }
  });

  // PATCH /api/contractors/:companyId/equipment/:equipId
  // Update an equipment record
  app.patch('/api/contractors/:companyId/equipment/:equipId', requireAuth, async (req, res) => {
    try {
      const { pool, schemaName } = await getEquipPool(req.customerId!);
      const { companyId, equipId } = req.params;
      const { name, category, makeModel, serialOrReg, notes } = req.body;
      const result = await pool.query(
        `UPDATE "${schemaName}".contractor_equipment
         SET name = COALESCE($1, name),
             category = COALESCE($2, category),
             make_model = $3,
             serial_or_reg = $4,
             notes = $5,
             updated_at = NOW()
         WHERE id = $6 AND company_id = $7 AND is_active = TRUE
         RETURNING *`,
        [name || null, category || null, makeModel ?? null, serialOrReg ?? null, notes ?? null, equipId, companyId]
      );
      if (!result.rows.length) return res.status(404).json({ error: 'Equipment not found' });
      res.json(result.rows[0]);
    } catch (err: any) {
      logger.error('Equipment update error:', err);
      res.status(500).json({ error: 'Failed to update equipment record' });
    }
  });

  // DELETE /api/contractors/:companyId/equipment/:equipId
  // Soft-delete an equipment record
  app.delete('/api/contractors/:companyId/equipment/:equipId', requireAuth, async (req, res) => {
    try {
      const { pool, schemaName } = await getEquipPool(req.customerId!);
      const { companyId, equipId } = req.params;
      const result = await pool.query(
        `UPDATE "${schemaName}".contractor_equipment
         SET is_active = FALSE, updated_at = NOW()
         WHERE id = $1 AND company_id = $2 RETURNING id`,
        [equipId, companyId]
      );
      if (!result.rows.length) return res.status(404).json({ error: 'Equipment not found' });
      res.json({ success: true });
    } catch (err: any) {
      logger.error('Equipment delete error:', err);
      res.status(500).json({ error: 'Failed to remove equipment record' });
    }
  });

  // GET /api/contractors/equipment/:equipId/certificates
  // Catalogue joined to this equipment's documents — same pattern as worker certs
  app.get('/api/contractors/equipment/:equipId/certificates', requireAuth, async (req, res) => {
    try {
      const { pool, schemaName } = await getEquipPool(req.customerId!);
      const { equipId } = req.params;

      const [typesResult, docsResult] = await Promise.all([
        pool.query(
          `SELECT * FROM "${schemaName}".equipment_certification_types
           WHERE is_active = TRUE
           ORDER BY CASE category WHEN 'legal' THEN 1 WHEN 'inspection' THEN 2 ELSE 3 END, name`
        ),
        pool.query(
          `SELECT * FROM "${schemaName}".contractor_documents
           WHERE equipment_id = $1 AND is_active = TRUE
           ORDER BY uploaded_at DESC`,
          [equipId]
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
              if (expiry < now) status = 'expired';
              else if (expiry < ninetyDaysAhead) status = 'expiring_soon';
              else status = 'valid';
            } else {
              status = 'valid';
            }
          }
        }
        return { ...type, status, document: doc };
      });

      res.json(rows);
    } catch (err: any) {
      logger.error('Equipment certs fetch error:', err);
      res.status(500).json({ error: 'Failed to fetch equipment certificates' });
    }
  });

  // POST /api/contractors/equipment/:equipId/certificates
  // Upload / replace a certificate for a piece of equipment
  app.post('/api/contractors/equipment/:equipId/certificates', requireAuth, async (req, res) => {
    try {
      const { pool, schemaName, custDb } = await getEquipPool(req.customerId!);
      const { equipId } = req.params;
      const { documentType, documentUrl, expiryDate, issuedBy, certNumber, documentName } = req.body;
      if (!documentType || !documentUrl) {
        return res.status(400).json({ error: 'documentType and documentUrl are required' });
      }

      // Resolve equipment → companyId
      const equipRows = await pool.query(
        `SELECT company_id FROM "${schemaName}".contractor_equipment WHERE id = $1 LIMIT 1`,
        [equipId]
      );
      if (!equipRows.rows.length) return res.status(404).json({ error: 'Equipment not found' });
      const companyId = equipRows.rows[0].company_id;

      // Resolve uploader
      const username = req.user!.username;
      const [currentUser] = await custDb
        .select({ id: isolatedSchema.users.id })
        .from(isolatedSchema.users)
        .where(eq(isolatedSchema.users.username, username))
        .limit(1);
      const uploadedBy = currentUser?.id ?? username;

      // Retire previous active cert of the same type for this equipment
      await pool.query(
        `UPDATE "${schemaName}".contractor_documents
         SET is_active = FALSE, updated_at = NOW()
         WHERE equipment_id = $1 AND document_type = $2 AND is_active = TRUE`,
        [equipId, documentType]
      );

      const result = await pool.query(
        `INSERT INTO "${schemaName}".contractor_documents
           (company_id, equipment_id, document_name, document_type, document_url, expiry_date,
            uploaded_by, status, is_active, issued_by, policy_number, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,'pending',TRUE,$8,$9,NOW(),NOW())
         RETURNING *`,
        [
          companyId,
          equipId,
          documentName || documentType.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()),
          documentType,
          documentUrl,
          expiryDate ? new Date(expiryDate) : null,
          uploadedBy,
          issuedBy || null,
          certNumber || null,
        ]
      );

      try {
        await custDb.insert(isolatedSchema.companyNotes).values({
          companyId,
          changeType: 'document_uploaded',
          notes: `Equipment certificate "${documentType}" uploaded by ${username}${expiryDate ? ` (expires ${new Date(expiryDate).toLocaleDateString('en-GB')})` : ''}`,
          changedBy: username,
        });
      } catch {
        // Non-fatal
      }

      res.status(201).json(result.rows[0]);
    } catch (err: any) {
      logger.error('Equipment cert upload error:', err);
      res.status(500).json({ error: 'Failed to upload equipment certificate' });
    }
  });

  // DELETE /api/contractors/equipment/certificates/:docId
  // Soft-deactivate an equipment certificate
  app.delete('/api/contractors/equipment/certificates/:docId', requireAuth, async (req, res) => {
    try {
      const { pool, schemaName } = await getEquipPool(req.customerId!);
      const result = await pool.query(
        `UPDATE "${schemaName}".contractor_documents
         SET is_active = FALSE, updated_at = NOW()
         WHERE id = $1 RETURNING id`,
        [req.params.docId]
      );
      if (!result.rows.length) return res.status(404).json({ error: 'Document not found' });
      res.json({ success: true });
    } catch (err: any) {
      logger.error('Equipment cert delete error:', err);
      res.status(500).json({ error: 'Failed to remove equipment certificate' });
    }
  });
}
