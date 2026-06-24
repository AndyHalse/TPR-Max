import type { Express } from 'express';
import { requireAuth } from '../auth';
import { recordHrAudit } from './hrMiddleware';
import { customerDbService } from '../customerDatabase';
import { emailService } from '../emailService';
import { logger } from '../utils/logger';

async function getDbsPool(customerId: string) {
  const custDb = await customerDbService.getCustomerDatabase(customerId);
  const schemaName = customerDbService.generateSchemaName(customerId);
  const pool = (custDb as any).$client ?? (custDb as any).session?.client;
  return { pool, schemaName };
}

function requireAdminRole(req: any, res: any, next: any) {
  if (!['admin', 'hr_admin'].includes(req.user?.role || '')) {
    return res.status(403).json({ error: 'This area is restricted to administrators.' });
  }
  next();
}

export function registerHrDbsRoutes(app: Express): void {

  // GET /api/staff/:staffId/dbs — available to all authenticated users (no HR feature gate)
  app.get('/api/staff/:staffId/dbs', requireAuth, async (req, res) => {
    try {
      const { pool, schemaName } = await getDbsPool(req.customerId!);
      const result = await pool.query(
        `SELECT *,
          CASE
            WHEN policy_expiry_date IS NULL THEN 'no_expiry'
            WHEN policy_expiry_date < CURRENT_DATE THEN 'expired'
            WHEN policy_expiry_date < CURRENT_DATE + INTERVAL '90 days' THEN 'expiring_soon'
            ELSE 'valid'
          END AS status
         FROM "${schemaName}".staff_dbs
         WHERE staff_id = $1 AND deleted_at IS NULL
         ORDER BY created_at DESC`,
        [req.params.staffId]
      );
      res.json(result.rows);
    } catch (err: any) {
      logger.error('DBS fetch error:', err);
      res.status(500).json({ error: 'Failed to fetch DBS records' });
    }
  });

  // POST /api/staff/:staffId/dbs — admin/hr_admin only (no HR feature gate)
  app.post('/api/staff/:staffId/dbs', requireAuth, requireAdminRole, async (req, res) => {
    try {
      const { pool, schemaName } = await getDbsPool(req.customerId!);
      const { staffId } = req.params;
      const {
        dbsLevel, certificateNumber, applicationReference,
        issueDate, policyExpiryDate, requestedBy, verifiedBy, verifiedDate, notes,
        documentUrl, documentName,
      } = req.body;

      if (!dbsLevel || !verifiedBy || !verifiedDate) {
        return res.status(400).json({ error: 'dbsLevel, verifiedBy and verifiedDate are required' });
      }
      if (issueDate && !/^\d{4}-\d{2}-\d{2}$/.test(String(issueDate).slice(0, 10))) {
        return res.status(400).json({ error: 'issueDate must be YYYY-MM-DD' });
      }
      if (policyExpiryDate && !/^\d{4}-\d{2}-\d{2}$/.test(String(policyExpiryDate).slice(0, 10))) {
        return res.status(400).json({ error: 'policyExpiryDate must be YYYY-MM-DD' });
      }

      await pool.query(
        `UPDATE "${schemaName}".staff_dbs SET is_current = FALSE WHERE staff_id = $1`,
        [staffId]
      );

      const result = await pool.query(
        `INSERT INTO "${schemaName}".staff_dbs
          (staff_id, dbs_level, certificate_number, application_reference,
           issue_date, policy_expiry_date, requested_by, verified_by, verified_date, notes, is_current,
           document_url, document_name)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,TRUE,$11,$12)
         RETURNING *,
           CASE
             WHEN policy_expiry_date IS NULL THEN 'no_expiry'
             WHEN policy_expiry_date < CURRENT_DATE THEN 'expired'
             WHEN policy_expiry_date < CURRENT_DATE + INTERVAL '90 days' THEN 'expiring_soon'
             ELSE 'valid'
           END AS status`,
        [staffId, dbsLevel, certificateNumber || null, applicationReference || null,
         issueDate || null, policyExpiryDate || null, requestedBy || null,
         verifiedBy, verifiedDate, notes || null,
         documentUrl || null, documentName || null]
      );

      const row = result.rows[0];
      try {
        await recordHrAudit(pool, schemaName, {
          entityType: 'dbs', entityId: row.id, staffId,
          action: 'create', actor: req.user?.username || 'unknown',
          details: { dbsLevel, verifiedBy, verifiedDate, policyExpiryDate },
        });
      } catch (_) { /* hr_audit_log may not exist if HR module not active */ }

      res.status(201).json(row);
    } catch (err: any) {
      logger.error('DBS create error:', err);
      res.status(500).json({ error: 'Failed to create DBS record' });
    }
  });

  // GET /api/staff/:staffId/dbs-required — fetch the DBS required flag
  app.get('/api/staff/:staffId/dbs-required', requireAuth, async (req, res) => {
    try {
      const { pool, schemaName } = await getDbsPool(req.customerId!);
      const result = await pool.query(
        `SELECT dbs_required FROM "${schemaName}".staff WHERE id = $1`,
        [req.params.staffId]
      );
      if (result.rows.length === 0) return res.status(404).json({ error: 'Staff not found' });
      res.json({ dbsRequired: result.rows[0].dbs_required ?? false });
    } catch (err: any) {
      logger.error('DBS required fetch error:', err);
      res.status(500).json({ error: 'Failed to fetch DBS required flag' });
    }
  });

  // PATCH /api/staff/:staffId/dbs-required — toggle DBS required flag (admin only)
  app.patch('/api/staff/:staffId/dbs-required', requireAuth, requireAdminRole, async (req, res) => {
    try {
      const { pool, schemaName } = await getDbsPool(req.customerId!);
      const { dbsRequired } = req.body;
      if (typeof dbsRequired !== 'boolean') {
        return res.status(400).json({ error: 'dbsRequired must be a boolean' });
      }
      await pool.query(
        `UPDATE "${schemaName}".staff SET dbs_required = $1 WHERE id = $2`,
        [dbsRequired, req.params.staffId]
      );
      res.json({ success: true, dbsRequired });
    } catch (err: any) {
      logger.error('DBS required toggle error:', err);
      res.status(500).json({ error: 'Failed to update DBS required flag' });
    }
  });

  // PUT /api/dbs/:id — update record (admin/hr_admin only, no HR feature gate)
  app.put('/api/dbs/:id', requireAuth, requireAdminRole, async (req, res) => {
    try {
      const { pool, schemaName } = await getDbsPool(req.customerId!);
      const {
        dbsLevel, certificateNumber, applicationReference,
        issueDate, policyExpiryDate, requestedBy, verifiedBy, verifiedDate, notes,
      } = req.body;

      if (issueDate && !/^\d{4}-\d{2}-\d{2}$/.test(String(issueDate).slice(0, 10))) {
        return res.status(400).json({ error: 'issueDate must be YYYY-MM-DD' });
      }
      if (policyExpiryDate && !/^\d{4}-\d{2}-\d{2}$/.test(String(policyExpiryDate).slice(0, 10))) {
        return res.status(400).json({ error: 'policyExpiryDate must be YYYY-MM-DD' });
      }

      const result = await pool.query(
        `UPDATE "${schemaName}".staff_dbs SET
           dbs_level = COALESCE($1, dbs_level),
           certificate_number = COALESCE($2, certificate_number),
           application_reference = COALESCE($3, application_reference),
           issue_date = $4,
           policy_expiry_date = $5,
           requested_by = $6,
           verified_by = COALESCE($7, verified_by),
           verified_date = COALESCE($8, verified_date),
           notes = $9,
           updated_at = NOW()
         WHERE id = $10
         RETURNING *`,
        [dbsLevel || null, certificateNumber || null, applicationReference || null,
         issueDate || null, policyExpiryDate || null, requestedBy || null,
         verifiedBy || null, verifiedDate || null, notes || null, req.params.id]
      );

      if (result.rows.length === 0) return res.status(404).json({ error: 'Record not found' });

      try {
        await recordHrAudit(pool, schemaName, {
          entityType: 'dbs', entityId: req.params.id,
          action: 'update', actor: req.user?.username || 'unknown',
          details: { dbsLevel, policyExpiryDate },
        });
      } catch (_) { /* ok */ }

      res.json(result.rows[0]);
    } catch (err: any) {
      logger.error('DBS update error:', err);
      res.status(500).json({ error: 'Failed to update DBS record' });
    }
  });

  // DELETE /api/dbs/:id — soft delete (admin/hr_admin only, no HR feature gate)
  app.delete('/api/dbs/:id', requireAuth, requireAdminRole, async (req, res) => {
    try {
      const { pool, schemaName } = await getDbsPool(req.customerId!);
      const actor = req.user?.username || 'unknown';
      await pool.query(
        `UPDATE "${schemaName}".staff_dbs SET deleted_at = NOW(), updated_at = NOW(), deleted_by = $2 WHERE id = $1`,
        [req.params.id, actor]
      );
      try {
        await recordHrAudit(pool, schemaName, {
          entityType: 'dbs', entityId: req.params.id,
          action: 'delete', actor,
        });
      } catch (_) { /* ok */ }
      res.json({ success: true });
    } catch (err: any) {
      logger.error('DBS delete error:', err);
      res.status(500).json({ error: 'Failed to delete DBS record' });
    }
  });

  // GET /api/dbs/expiry-alerts — all staff with expired/expiring DBS within 90 days
  app.get('/api/dbs/expiry-alerts', requireAuth, async (req, res) => {
    try {
      const { pool, schemaName } = await getDbsPool(req.customerId!);
      const result = await pool.query(
        `SELECT d.*, s.first_name, s.last_name, s.email, s.department,
           CASE
             WHEN d.policy_expiry_date < CURRENT_DATE THEN 'expired'
             WHEN d.policy_expiry_date < CURRENT_DATE + INTERVAL '90 days' THEN 'expiring_soon'
             ELSE 'valid'
           END AS status
         FROM "${schemaName}".staff_dbs d
         JOIN "${schemaName}".staff s ON s.id = d.staff_id
         WHERE d.is_current = TRUE
           AND d.deleted_at IS NULL
           AND d.policy_expiry_date IS NOT NULL
           AND d.policy_expiry_date <= CURRENT_DATE + INTERVAL '90 days'
         ORDER BY d.policy_expiry_date ASC`
      );
      res.json(result.rows);
    } catch (err: any) {
      logger.error('DBS expiry alerts error:', err);
      res.status(500).json({ error: 'Failed to fetch DBS expiry alerts' });
    }
  });

  // ── Staff Notes ───────────────────────────────────────────────────────────
  // GET /api/staff/:staffId/notes
  app.get('/api/staff/:staffId/notes', requireAuth, async (req, res) => {
    try {
      const { pool, schemaName } = await getDbsPool(req.customerId!);
      const { staffId } = req.params;
      const result = await pool.query(
        `SELECT id, staff_id, note, note_type, added_by, created_at
         FROM "${schemaName}".staff_notes
         WHERE staff_id = $1
         ORDER BY created_at DESC`,
        [staffId]
      );
      res.json(result.rows);
    } catch (err: any) {
      logger.error('Staff notes fetch error:', err);
      res.status(500).json({ error: 'Failed to fetch staff notes' });
    }
  });

  // POST /api/staff/:staffId/notes
  app.post('/api/staff/:staffId/notes', requireAuth, requireAdminRole, async (req, res) => {
    try {
      const { pool, schemaName } = await getDbsPool(req.customerId!);
      const { staffId } = req.params;
      const { note, noteType = 'general' } = req.body;
      if (!note || typeof note !== 'string' || !note.trim()) {
        return res.status(400).json({ error: 'Note text is required' });
      }
      const actor = req.user?.username || 'unknown';
      const result = await pool.query(
        `INSERT INTO "${schemaName}".staff_notes (id, staff_id, note, note_type, added_by)
         VALUES (gen_random_uuid(), $1, $2, $3, $4)
         RETURNING *`,
        [staffId, note.trim(), noteType, actor]
      );
      res.status(201).json(result.rows[0]);
    } catch (err: any) {
      logger.error('Staff note create error:', err);
      res.status(500).json({ error: 'Failed to create staff note' });
    }
  });

  // DELETE /api/staff/notes/:noteId
  app.delete('/api/staff/notes/:noteId', requireAuth, requireAdminRole, async (req, res) => {
    try {
      const { pool, schemaName } = await getDbsPool(req.customerId!);
      await pool.query(
        `DELETE FROM "${schemaName}".staff_notes WHERE id = $1`,
        [req.params.noteId]
      );
      res.json({ success: true });
    } catch (err: any) {
      logger.error('Staff note delete error:', err);
      res.status(500).json({ error: 'Failed to delete staff note' });
    }
  });
}

// Cron helper — called from daily job
export async function sendDbsExpiryReminders(customerId: string, companyName: string): Promise<void> {
  try {
    const { pool, schemaName } = await getDbsPool(customerId);
    const result = await pool.query(
      `SELECT d.*, s.first_name, s.last_name, s.email
       FROM "${schemaName}".staff_dbs d
       JOIN "${schemaName}".staff s ON s.id = d.staff_id
       WHERE d.is_current = TRUE
         AND d.deleted_at IS NULL
         AND d.policy_expiry_date IS NOT NULL
         AND d.policy_expiry_date <= CURRENT_DATE + INTERVAL '90 days'
         AND (d.reminder_sent_at IS NULL OR d.reminder_sent_at < NOW() - INTERVAL '30 days')`
    );

    const settingsResult = await pool.query(
      `SELECT email FROM "${schemaName}".users WHERE role = 'admin' LIMIT 1`
    );
    const adminEmail = settingsResult.rows[0]?.email;
    if (!adminEmail) return;

    for (const dbs of result.rows) {
      const expiry = new Date(dbs.policy_expiry_date);
      const isExpired = expiry < new Date();
      const staffName = `${dbs.first_name} ${dbs.last_name}`;
      const expiryStr = expiry.toLocaleDateString('en-GB');
      const levelLabel = dbs.dbs_level.replace(/_/g, ' ');

      const subject = isExpired
        ? `🚨 DBS Certificate EXPIRED — ${staffName}`
        : `⚠ DBS Certificate Expiring Soon — ${staffName}`;

      const body = `The ${levelLabel} DBS certificate for ${staffName} ${isExpired ? `expired on ${expiryStr}` : `is expiring on ${expiryStr}`}.

DBS Level: ${levelLabel}
Certificate No.: ${dbs.certificate_number || 'N/A'}
Issue Date: ${dbs.issue_date ? new Date(dbs.issue_date).toLocaleDateString('en-GB') : 'N/A'}
Policy Expiry: ${expiryStr}
Verified by: ${dbs.verified_by}

Action required: A new DBS check should be requested ${isExpired ? 'immediately' : 'before the expiry date'} to maintain safeguarding compliance.

Log in to TPR Max to update this record.`;

      await emailService.forCustomer(customerId).sendGenericEmail(adminEmail, subject, body);

      await pool.query(
        `UPDATE "${schemaName}".staff_dbs SET reminder_sent_at = NOW() WHERE id = $1`,
        [dbs.id]
      );
    }
  } catch (err: any) {
    logger.error(`DBS reminder error for ${customerId}:`, err);
  }
}
