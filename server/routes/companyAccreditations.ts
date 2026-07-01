import type { Express } from 'express';
import { requireAuth } from '../auth';
import { customerDbService } from '../customerDatabase';
import { logger } from '../utils/logger';

const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;

function deriveStatus(expiryDate: string | null | undefined): 'valid' | 'expiring_soon' | 'expired' {
  if (!expiryDate) return 'valid';
  const exp = new Date(expiryDate);
  const now = new Date();
  if (exp < now) return 'expired';
  if (exp.getTime() - now.getTime() < NINETY_DAYS_MS) return 'expiring_soon';
  return 'valid';
}

async function getPool(customerId: string) {
  const custDb = await customerDbService.getCustomerDatabase(customerId);
  const schemaName = customerDbService.generateSchemaName(customerId);
  const pool = (custDb as any).$client ?? (custDb as any).session?.client;
  return { pool, schemaName };
}

// Seed-on-read: create tables + catalogue if not yet present (safe for older schemas)
async function ensureTables(pool: any, schemaName: string): Promise<void> {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS "${schemaName}".company_accreditation_types (
        key TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        is_ssip_member BOOLEAN NOT NULL DEFAULT false,
        has_grade BOOLEAN NOT NULL DEFAULT false,
        is_active BOOLEAN NOT NULL DEFAULT true,
        display_order INTEGER NOT NULL DEFAULT 99
      )
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS "${schemaName}".contractor_company_accreditations (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id VARCHAR NOT NULL REFERENCES "${schemaName}".contractor_companies(id) ON DELETE CASCADE,
        type_key TEXT NOT NULL REFERENCES "${schemaName}".company_accreditation_types(key),
        custom_name TEXT,
        certificate_number TEXT,
        grade TEXT,
        expiry_date TEXT,
        notes TEXT,
        is_demo BOOLEAN NOT NULL DEFAULT false,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);
    await pool.query(`
      INSERT INTO "${schemaName}".company_accreditation_types (key, name, is_ssip_member, has_grade, display_order)
      VALUES
        ('chas',             'CHAS',                                   true,  false, 1),
        ('safe_contractor',  'SafeContractor (Alcumus)',                true,  false, 2),
        ('constructionline', 'Constructionline',                       true,  true,  3),
        ('smas',             'SMAS Worksafe',                          true,  false, 4),
        ('achilles',         'Achilles (Building Confidence / UVDB)',  true,  false, 5),
        ('altius',           'Altius (RISQS)',                         true,  false, 6),
        ('avetta',           'Avetta',                                 true,  false, 7),
        ('acclaim',          'Acclaim Accreditation',                  true,  false, 8),
        ('bureau_veritas',   'Bureau Veritas Certification',           true,  false, 9),
        ('cqms',             'CQMS',                                   true,  false, 10),
        ('other',            'Other',                                  false, false, 99)
      ON CONFLICT (key) DO NOTHING
    `);
  } catch (e: any) {
    logger.warn('[Accreditations] ensureTables error (non-fatal):', e.message?.slice(0, 120));
  }
}

export function registerCompanyAccreditationsRoutes(app: Express): void {

  // GET /api/contractor-companies/accreditation-types  ── active catalogue
  app.get('/api/contractor-companies/accreditation-types', requireAuth, async (req, res) => {
    try {
      const { pool, schemaName } = await getPool(req.customerId!);
      await ensureTables(pool, schemaName);
      const result = await pool.query(
        `SELECT * FROM "${schemaName}".company_accreditation_types
         WHERE is_active = true ORDER BY display_order, name`
      );
      res.json(result.rows);
    } catch (err: any) {
      logger.error('[Accreditations] types fetch error:', err);
      res.status(500).json({ error: 'Failed to fetch accreditation types' });
    }
  });

  // GET /api/contractor-companies/accreditations  ── ALL companies' accreditations, keyed by company_id (for badge list)
  app.get('/api/contractor-companies/accreditations', requireAuth, async (req, res) => {
    try {
      const { pool, schemaName } = await getPool(req.customerId!);
      await ensureTables(pool, schemaName);
      const result = await pool.query(
        `SELECT a.*, t.name AS type_name, t.is_ssip_member, t.has_grade
         FROM "${schemaName}".contractor_company_accreditations a
         JOIN "${schemaName}".company_accreditation_types t ON t.key = a.type_key
         WHERE t.is_active = true
         ORDER BY a.company_id, t.display_order`
      );
      const grouped: Record<string, any[]> = {};
      for (const row of result.rows) {
        if (!grouped[row.company_id]) grouped[row.company_id] = [];
        grouped[row.company_id].push({ ...row, status: deriveStatus(row.expiry_date) });
      }
      res.json(grouped);
    } catch (err: any) {
      logger.error('[Accreditations] all-companies fetch error:', err);
      res.status(500).json({ error: 'Failed to fetch accreditations' });
    }
  });

  // GET /api/contractor-companies/:companyId/accreditations  ── one company, with status
  app.get('/api/contractor-companies/:companyId/accreditations', requireAuth, async (req, res) => {
    try {
      const { pool, schemaName } = await getPool(req.customerId!);
      await ensureTables(pool, schemaName);
      const result = await pool.query(
        `SELECT a.*, t.name AS type_name, t.is_ssip_member, t.has_grade
         FROM "${schemaName}".contractor_company_accreditations a
         JOIN "${schemaName}".company_accreditation_types t ON t.key = a.type_key
         WHERE a.company_id = $1
         ORDER BY t.display_order, a.created_at`,
        [req.params.companyId]
      );
      res.json(result.rows.map((r: any) => ({ ...r, status: deriveStatus(r.expiry_date) })));
    } catch (err: any) {
      logger.error('[Accreditations] company fetch error:', err);
      res.status(500).json({ error: 'Failed to fetch accreditations' });
    }
  });

  // POST /api/contractor-companies/:companyId/accreditations  ── add
  app.post('/api/contractor-companies/:companyId/accreditations', requireAuth, async (req, res) => {
    try {
      const { pool, schemaName } = await getPool(req.customerId!);
      await ensureTables(pool, schemaName);
      const { companyId } = req.params;
      const { typeKey, customName, certificateNumber, grade, expiryDate, notes } = req.body;
      if (!typeKey) return res.status(400).json({ error: 'typeKey is required' });
      const result = await pool.query(
        `INSERT INTO "${schemaName}".contractor_company_accreditations
           (company_id, type_key, custom_name, certificate_number, grade, expiry_date, notes)
         VALUES ($1,$2,$3,$4,$5,$6,$7)
         RETURNING *`,
        [companyId, typeKey, customName || null, certificateNumber || null, grade || null, expiryDate || null, notes || null]
      );
      res.status(201).json({ ...result.rows[0], status: deriveStatus(result.rows[0].expiry_date) });
    } catch (err: any) {
      logger.error('[Accreditations] add error:', err);
      res.status(500).json({ error: 'Failed to add accreditation' });
    }
  });

  // PATCH /api/contractor-companies/:companyId/accreditations/:id  ── edit
  app.patch('/api/contractor-companies/:companyId/accreditations/:id', requireAuth, async (req, res) => {
    try {
      const { pool, schemaName } = await getPool(req.customerId!);
      const { companyId, id } = req.params;
      const { customName, certificateNumber, grade, expiryDate, notes } = req.body;
      const result = await pool.query(
        `UPDATE "${schemaName}".contractor_company_accreditations
         SET custom_name=$1, certificate_number=$2, grade=$3, expiry_date=$4, notes=$5, updated_at=NOW()
         WHERE id=$6 AND company_id=$7
         RETURNING *`,
        [customName || null, certificateNumber || null, grade || null, expiryDate || null, notes || null, id, companyId]
      );
      if (!result.rows.length) return res.status(404).json({ error: 'Accreditation not found' });
      res.json({ ...result.rows[0], status: deriveStatus(result.rows[0].expiry_date) });
    } catch (err: any) {
      logger.error('[Accreditations] update error:', err);
      res.status(500).json({ error: 'Failed to update accreditation' });
    }
  });

  // DELETE /api/contractor-companies/:companyId/accreditations/:id  ── remove
  app.delete('/api/contractor-companies/:companyId/accreditations/:id', requireAuth, async (req, res) => {
    try {
      const { pool, schemaName } = await getPool(req.customerId!);
      const { companyId, id } = req.params;
      const result = await pool.query(
        `DELETE FROM "${schemaName}".contractor_company_accreditations
         WHERE id=$1 AND company_id=$2
         RETURNING id`,
        [id, companyId]
      );
      if (!result.rows.length) return res.status(404).json({ error: 'Accreditation not found' });
      res.json({ success: true });
    } catch (err: any) {
      logger.error('[Accreditations] delete error:', err);
      res.status(500).json({ error: 'Failed to delete accreditation' });
    }
  });
}
