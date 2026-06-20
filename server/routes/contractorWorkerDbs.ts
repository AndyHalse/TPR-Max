import type { Express } from 'express';
import cron from 'node-cron';
import { requireAuth } from '../auth';
import { customerDbService } from '../customerDatabase';
import { emailService } from '../emailService';
import { logger } from '../utils/logger';
import { sendDbsExpiryReminders } from './hrDbs';
import { sendRtwExpiryReminders } from './hrRightToWork';
import { sendTrainingExpiryReminders } from './hrTraining';

async function getDbsPool(customerId: string) {
  const custDb = await customerDbService.getCustomerDatabase(customerId);
  const schemaName = customerDbService.generateSchemaName(customerId);
  const pool = (custDb as any).$client ?? (custDb as any).session?.client;
  return { pool, schemaName };
}

export function registerContractorWorkerDbsRoutes(app: Express): void {

  // GET /api/contractors/workers/:workerId/dbs
  app.get('/api/contractors/workers/:workerId/dbs', requireAuth, async (req, res) => {
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
         FROM "${schemaName}".contractor_worker_dbs
         WHERE worker_id = $1 AND deleted_at IS NULL
         ORDER BY created_at DESC`,
        [req.params.workerId]
      );
      res.json(result.rows);
    } catch (err: any) {
      logger.error('Contractor DBS fetch error:', err);
      res.status(500).json({ error: 'Failed to fetch DBS records' });
    }
  });

  // POST /api/contractors/workers/:workerId/dbs
  app.post('/api/contractors/workers/:workerId/dbs', requireAuth, async (req, res) => {
    try {
      const { pool, schemaName } = await getDbsPool(req.customerId!);
      const { workerId } = req.params;
      const {
        dbsLevel, certificateNumber, applicationReference,
        issueDate, policyExpiryDate, requestedBy, verifiedBy, verifiedDate, notes,
        documentUrl, documentName,
      } = req.body;

      if (!dbsLevel || !verifiedBy || !verifiedDate) {
        return res.status(400).json({ error: 'dbsLevel, verifiedBy and verifiedDate are required' });
      }

      await pool.query(
        `UPDATE "${schemaName}".contractor_worker_dbs SET is_current = FALSE WHERE worker_id = $1`,
        [workerId]
      );

      const result = await pool.query(
        `INSERT INTO "${schemaName}".contractor_worker_dbs
          (worker_id, dbs_level, certificate_number, application_reference,
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
        [workerId, dbsLevel, certificateNumber || null, applicationReference || null,
         issueDate || null, policyExpiryDate || null, requestedBy || null,
         verifiedBy, verifiedDate, notes || null,
         documentUrl || null, documentName || null]
      );

      res.status(201).json(result.rows[0]);
    } catch (err: any) {
      logger.error('Contractor DBS create error:', err);
      res.status(500).json({ error: 'Failed to create DBS record' });
    }
  });

  // PUT /api/contractor-dbs/:id
  app.put('/api/contractor-dbs/:id', requireAuth, async (req, res) => {
    try {
      const { pool, schemaName } = await getDbsPool(req.customerId!);
      const {
        dbsLevel, certificateNumber, applicationReference,
        issueDate, policyExpiryDate, requestedBy, verifiedBy, verifiedDate, notes,
      } = req.body;

      const result = await pool.query(
        `UPDATE "${schemaName}".contractor_worker_dbs SET
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
      res.json(result.rows[0]);
    } catch (err: any) {
      logger.error('Contractor DBS update error:', err);
      res.status(500).json({ error: 'Failed to update DBS record' });
    }
  });

  // DELETE /api/contractor-dbs/:id — soft delete (audit trail preserved)
  app.delete('/api/contractor-dbs/:id', requireAuth, async (req, res) => {
    try {
      const { pool, schemaName } = await getDbsPool(req.customerId!);
      await pool.query(
        `UPDATE "${schemaName}".contractor_worker_dbs SET deleted_at = NOW(), updated_at = NOW() WHERE id = $1`,
        [req.params.id]
      );
      res.json({ success: true });
    } catch (err: any) {
      logger.error('Contractor DBS delete error:', err);
      res.status(500).json({ error: 'Failed to delete DBS record' });
    }
  });

  // GET /api/contractor-dbs/expiry-alerts — workers with expired/expiring DBS within 90 days
  app.get('/api/contractor-dbs/expiry-alerts', requireAuth, async (req, res) => {
    try {
      const { pool, schemaName } = await getDbsPool(req.customerId!);
      const result = await pool.query(
        `SELECT d.*, w.first_name, w.last_name, w.email, cc.company_name,
           CASE
             WHEN d.policy_expiry_date < CURRENT_DATE THEN 'expired'
             WHEN d.policy_expiry_date < CURRENT_DATE + INTERVAL '90 days' THEN 'expiring_soon'
             ELSE 'valid'
           END AS status
         FROM "${schemaName}".contractor_worker_dbs d
         JOIN "${schemaName}".contractor_workers w ON w.id = d.worker_id
         LEFT JOIN "${schemaName}".contractor_companies cc ON cc.id = w.contractor_company_id
         WHERE d.is_current = TRUE
           AND d.deleted_at IS NULL
           AND d.policy_expiry_date IS NOT NULL
           AND d.policy_expiry_date <= CURRENT_DATE + INTERVAL '90 days'
         ORDER BY d.policy_expiry_date ASC`
      );
      res.json(result.rows);
    } catch (err: any) {
      logger.error('Contractor DBS expiry alerts error:', err);
      res.status(500).json({ error: 'Failed to fetch contractor DBS expiry alerts' });
    }
  });

  // PATCH /api/contractors/workers/:workerId/dbs-required — toggle opt-in flag
  app.patch('/api/contractors/workers/:workerId/dbs-required', requireAuth, async (req, res) => {
    try {
      const { pool, schemaName } = await getDbsPool(req.customerId!);
      const { dbsRequired } = req.body;
      if (typeof dbsRequired !== 'boolean') {
        return res.status(400).json({ error: 'dbsRequired must be a boolean' });
      }
      await pool.query(
        `UPDATE "${schemaName}".contractor_workers SET dbs_required = $1 WHERE id = $2`,
        [dbsRequired, req.params.workerId]
      );
      res.json({ success: true, dbsRequired });
    } catch (err: any) {
      logger.error('Contractor DBS required toggle error:', err);
      res.status(500).json({ error: 'Failed to update DBS required flag' });
    }
  });
}

// Cron helper — called from daily job
export async function sendContractorDbsExpiryReminders(customerId: string, companyName: string): Promise<void> {
  try {
    const { pool, schemaName } = await getDbsPool(customerId);
    const result = await pool.query(
      `SELECT d.*, w.first_name, w.last_name, w.email,
              cc.company_name AS contractor_company_name
       FROM "${schemaName}".contractor_worker_dbs d
       JOIN "${schemaName}".contractor_workers w ON w.id = d.worker_id
       LEFT JOIN "${schemaName}".contractor_companies cc ON cc.id = w.contractor_company_id
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
      const workerName = `${dbs.first_name} ${dbs.last_name}`;
      const expiryStr = expiry.toLocaleDateString('en-GB');
      const levelLabel = dbs.dbs_level.replace(/_/g, ' ');
      const companyLabel = dbs.contractor_company_name ? ` (${dbs.contractor_company_name})` : '';

      const subject = isExpired
        ? `🚨 Contractor Worker DBS EXPIRED — ${workerName}${companyLabel}`
        : `⚠ Contractor Worker DBS Expiring Soon — ${workerName}${companyLabel}`;

      const body = `The ${levelLabel} DBS certificate for contractor worker ${workerName}${companyLabel} ${isExpired ? `expired on ${expiryStr}` : `is expiring on ${expiryStr}`}.

DBS Level: ${levelLabel}
Certificate No.: ${dbs.certificate_number || 'N/A'}
Issue Date: ${dbs.issue_date ? new Date(dbs.issue_date).toLocaleDateString('en-GB') : 'N/A'}
Policy Expiry: ${expiryStr}
Verified by: ${dbs.verified_by}

Action required: A new DBS check should be requested ${isExpired ? 'immediately' : 'before the expiry date'} to maintain safeguarding compliance.

Log in to TPR Max to update this record.`;

      await emailService.forCustomer(customerId).sendGenericEmail(adminEmail, subject, body);

      await pool.query(
        `UPDATE "${schemaName}".contractor_worker_dbs SET reminder_sent_at = NOW() WHERE id = $1`,
        [dbs.id]
      );
    }
  } catch (err: any) {
    logger.error(`Contractor DBS reminder error for ${customerId}:`, err);
  }
}

// ── Daily DBS Expiry Reminder Cron (01:00 Europe/London) ─────────────────────
// Sends expiry reminders for both staff DBS and contractor worker DBS across
// all customers. 90-day look-ahead, 30-day dedupe via reminder_sent_at.
cron.schedule('0 1 * * *', async () => {
  logger.info('[DBS Reminder Cron] Running daily DBS expiry reminder check…');
  try {
    const allCustomers = await customerDbService.getAllCustomers();
    for (const customer of allCustomers) {
      try {
        const { pool, schemaName } = await getDbsPool(customer.id);
        const settingsResult = await pool.query(
          `SELECT company_name FROM "${schemaName}".company_settings LIMIT 1`
        );
        const companyName = settingsResult.rows[0]?.company_name || 'TPR Max';
        await Promise.all([
          sendDbsExpiryReminders(customer.id, companyName),
          sendContractorDbsExpiryReminders(customer.id, companyName),
          sendRtwExpiryReminders(customer.id, companyName),
          sendTrainingExpiryReminders(customer.id),
        ]);
      } catch (err: any) {
        logger.error(`[DBS Reminder Cron] Failed for customer ${customer.id}:`, err);
      }
    }
    logger.info('[DBS Reminder Cron] Done.');
  } catch (err: any) {
    logger.error('[DBS Reminder Cron] Fatal error:', err);
  }
}, { timezone: 'Europe/London' });
