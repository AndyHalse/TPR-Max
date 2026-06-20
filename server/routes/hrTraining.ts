import type { Express } from 'express';
import { requireAuth } from '../auth';
import { requireHrFeature, requireHrAdmin, recordHrAudit } from './hrMiddleware';
import { customerDbService } from '../customerDatabase';
import { emailService } from '../emailService';
import { logger } from '../utils/logger';

async function getPool(customerId: string) {
  const custDb = await customerDbService.getCustomerDatabase(customerId);
  const schemaName = customerDbService.generateSchemaName(customerId);
  const pool = (custDb as any).$client ?? (custDb as any).session?.client;
  return { pool, schemaName };
}

function trainingStatus(expiryDate: string | null): 'valid' | 'expiring_soon' | 'expired' | 'no_expiry' {
  if (!expiryDate) return 'no_expiry';
  const expiry = new Date(expiryDate);
  const now = new Date();
  const diff = Math.floor((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  if (diff < 0) return 'expired';
  if (diff <= 60) return 'expiring_soon';
  return 'valid';
}

export function registerHrTrainingRoutes(app: Express): void {

  // GET /api/staff/:staffId/training
  app.get('/api/staff/:staffId/training', requireAuth, requireHrFeature, async (req, res) => {
    try {
      const { pool, schemaName } = await getPool(req.customerId!);
      const result = await pool.query(
        `SELECT * FROM "${schemaName}".staff_training_records
         WHERE staff_id = $1 AND deleted_at IS NULL
         ORDER BY completed_date DESC`,
        [req.params.staffId]
      );
      const rows = result.rows.map((r: any) => ({ ...r, status: trainingStatus(r.expiry_date) }));
      res.json(rows);
    } catch (err: any) {
      logger.error('Training fetch error:', err);
      res.status(500).json({ error: 'Failed to fetch training records' });
    }
  });

  // POST /api/staff/:staffId/training — HR admin only
  app.post('/api/staff/:staffId/training', requireAuth, requireHrFeature, requireHrAdmin, async (req, res) => {
    try {
      const { pool, schemaName } = await getPool(req.customerId!);
      const { staffId } = req.params;
      const { courseName, provider, completedDate, expiryDate, isMandatory, mandatoryRole, notes, documentUrl, documentName } = req.body;

      if (!courseName || !completedDate) {
        return res.status(400).json({ error: 'courseName and completedDate are required' });
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(completedDate).slice(0, 10))) {
        return res.status(400).json({ error: 'completedDate must be YYYY-MM-DD' });
      }
      if (expiryDate && !/^\d{4}-\d{2}-\d{2}$/.test(String(expiryDate).slice(0, 10))) {
        return res.status(400).json({ error: 'expiryDate must be YYYY-MM-DD' });
      }

      const result = await pool.query(
        `INSERT INTO "${schemaName}".staff_training_records
          (staff_id, course_name, provider, completed_date, expiry_date, is_mandatory, mandatory_role, notes, document_url, document_name)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
        [staffId, courseName, provider || null, completedDate, expiryDate || null,
         isMandatory || false, mandatoryRole || null, notes || null,
         documentUrl || null, documentName || null]
      );

      const row = result.rows[0];
      await recordHrAudit(pool, schemaName, {
        entityType: 'training', entityId: row.id, staffId,
        action: 'create', actor: req.user?.username || 'unknown',
        details: { courseName, completedDate, expiryDate, isMandatory },
      });

      res.status(201).json({ ...row, status: trainingStatus(row.expiry_date) });
    } catch (err: any) {
      logger.error('Training create error:', err);
      res.status(500).json({ error: 'Failed to create training record' });
    }
  });

  // DELETE /api/staff/:staffId/training/:id — soft delete (HR admin only)
  app.delete('/api/staff/:staffId/training/:id', requireAuth, requireHrFeature, requireHrAdmin, async (req, res) => {
    try {
      const { pool, schemaName } = await getPool(req.customerId!);
      const actor = req.user?.username || 'unknown';
      await pool.query(
        `UPDATE "${schemaName}".staff_training_records
         SET deleted_at = NOW(), deleted_by = $3
         WHERE id = $1 AND staff_id = $2`,
        [req.params.id, req.params.staffId, actor]
      );
      await recordHrAudit(pool, schemaName, {
        entityType: 'training', entityId: req.params.id, staffId: req.params.staffId,
        action: 'delete', actor,
      });
      res.json({ success: true });
    } catch (err: any) {
      logger.error('Training delete error:', err);
      res.status(500).json({ error: 'Failed to delete training record' });
    }
  });

  // GET /api/training/matrix
  app.get('/api/training/matrix', requireAuth, requireHrFeature, async (req, res) => {
    try {
      const { pool, schemaName } = await getPool(req.customerId!);

      const [reqsResult, staffResult, recordsResult] = await Promise.all([
        pool.query(`SELECT * FROM "${schemaName}".training_requirements ORDER BY course_name`),
        pool.query(`SELECT id, first_name, last_name, department FROM "${schemaName}".staff WHERE is_active = true ORDER BY department, last_name`),
        pool.query(`SELECT * FROM "${schemaName}".staff_training_records WHERE deleted_at IS NULL`),
      ]);

      const requirements = reqsResult.rows;
      const staffList = staffResult.rows;
      const records = recordsResult.rows;

      const matrix = staffList.map((s: any) => {
        const staffRecords = records.filter((r: any) => r.staff_id === s.id);
        const courses: Record<string, any> = {};
        for (const requirement of requirements) {
          const match = staffRecords.find((r: any) => r.course_name === requirement.course_name);
          courses[requirement.course_name] = match
            ? { completedDate: match.completed_date, expiryDate: match.expiry_date, status: trainingStatus(match.expiry_date) }
            : { status: 'not_completed' };
        }
        return { staff: s, courses };
      });

      res.json({ requirements, matrix });
    } catch (err: any) {
      logger.error('Training matrix error:', err);
      res.status(500).json({ error: 'Failed to fetch training matrix' });
    }
  });

  // GET /api/training/expiring
  app.get('/api/training/expiring', requireAuth, requireHrFeature, async (req, res) => {
    try {
      const { pool, schemaName } = await getPool(req.customerId!);
      const result = await pool.query(
        `SELECT tr.*, s.first_name, s.last_name, s.department
         FROM "${schemaName}".staff_training_records tr
         JOIN "${schemaName}".staff s ON s.id = tr.staff_id
         WHERE tr.deleted_at IS NULL
           AND tr.is_mandatory = TRUE
           AND tr.expiry_date IS NOT NULL
           AND tr.expiry_date <= NOW() + INTERVAL '60 days'
         ORDER BY tr.expiry_date ASC`
      );
      res.json(result.rows.map((r: any) => ({ ...r, status: trainingStatus(r.expiry_date) })));
    } catch (err: any) {
      logger.error('Training expiring error:', err);
      res.status(500).json({ error: 'Failed to fetch expiring training' });
    }
  });

  // GET /api/training/requirements
  app.get('/api/training/requirements', requireAuth, requireHrFeature, async (req, res) => {
    try {
      const { pool, schemaName } = await getPool(req.customerId!);
      const result = await pool.query(`SELECT * FROM "${schemaName}".training_requirements ORDER BY course_name`);
      res.json(result.rows);
    } catch (err: any) {
      logger.error('Training requirements fetch error:', err);
      res.status(500).json({ error: 'Failed to fetch training requirements' });
    }
  });

  // POST /api/training/requirements — HR admin only
  app.post('/api/training/requirements', requireAuth, requireHrFeature, requireHrAdmin, async (req, res) => {
    try {
      const { pool, schemaName } = await getPool(req.customerId!);
      const { courseName, appliesTo = 'all', appliesValue, renewalPeriodMonths } = req.body;
      if (!courseName) return res.status(400).json({ error: 'courseName is required' });

      const result = await pool.query(
        `INSERT INTO "${schemaName}".training_requirements (course_name, applies_to, applies_value, renewal_period_months)
         VALUES ($1,$2,$3,$4) RETURNING *`,
        [courseName, appliesTo, appliesValue || null, renewalPeriodMonths || null]
      );
      res.status(201).json(result.rows[0]);
    } catch (err: any) {
      logger.error('Training requirement create error:', err);
      res.status(500).json({ error: 'Failed to create training requirement' });
    }
  });

  // DELETE /api/training/requirements/:id — HR admin only
  app.delete('/api/training/requirements/:id', requireAuth, requireHrFeature, requireHrAdmin, async (req, res) => {
    try {
      const { pool, schemaName } = await getPool(req.customerId!);
      await pool.query(`DELETE FROM "${schemaName}".training_requirements WHERE id = $1`, [req.params.id]);
      res.json({ success: true });
    } catch (err: any) {
      logger.error('Training requirement delete error:', err);
      res.status(500).json({ error: 'Failed to delete training requirement' });
    }
  });
}

export async function sendTrainingExpiryReminders(customerId: string): Promise<void> {
  try {
    const { pool, schemaName } = await getPool(customerId);
    const result = await pool.query(
      `SELECT tr.*, s.first_name, s.last_name
       FROM "${schemaName}".staff_training_records tr
       JOIN "${schemaName}".staff s ON s.id = tr.staff_id
       WHERE tr.deleted_at IS NULL
         AND tr.is_mandatory = TRUE
         AND tr.expiry_date IS NOT NULL
         AND tr.expiry_date <= NOW() + INTERVAL '60 days'
         AND (tr.reminder_sent_at IS NULL OR tr.reminder_sent_at < NOW() - INTERVAL '14 days')`
    );

    if (!result.rows.length) return;

    const adminResult = await pool.query(`SELECT email FROM "${schemaName}".users WHERE role = 'admin' LIMIT 1`);
    const adminEmail = adminResult.rows[0]?.email;
    if (!adminEmail) return;

    const grouped: Record<string, any[]> = {};
    for (const row of result.rows) {
      const key = `${row.first_name} ${row.last_name}`;
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(row);
    }

    for (const [name, records] of Object.entries(grouped)) {
      const lines = records.map((r: any) =>
        `• ${r.course_name} — expires ${new Date(r.expiry_date).toLocaleDateString('en-GB')}`
      ).join('\n');

      const subject = `⚠ Mandatory Training Expiring — ${name}`;
      const body = `The following mandatory training records for ${name} are expiring:\n\n${lines}\n\nPlease arrange renewal as soon as possible.`;

      await emailService.forCustomer(customerId).sendGenericEmail(adminEmail, subject, body);

      for (const r of records) {
        await pool.query(
          `UPDATE "${schemaName}".staff_training_records SET reminder_sent_at = NOW() WHERE id = $1`,
          [r.id]
        );
      }
    }
  } catch (err: any) {
    logger.error(`Training reminder error for ${customerId}:`, err);
  }
}
