import type { Express } from 'express';
import { requireAuth } from '../auth';
import { requireHrFeature, requireHrAdmin, recordHrAudit } from './hrMiddleware';
import { customerDbService } from '../customerDatabase';
import { emailService } from '../emailService';
import { logger } from '../utils/logger';

async function getRtwPool(customerId: string) {
  const custDb = await customerDbService.getCustomerDatabase(customerId);
  const schemaName = customerDbService.generateSchemaName(customerId);
  const pool = (custDb as any).$client ?? (custDb as any).session?.client;
  return { pool, schemaName };
}

export function registerHrRightToWorkRoutes(app: Express): void {

  // GET /api/staff/:staffId/right-to-work — admin/hr_admin only
  app.get('/api/staff/:staffId/right-to-work', requireAuth, requireHrFeature, requireHrAdmin, async (req, res) => {
    try {
      const { pool, schemaName } = await getRtwPool(req.customerId!);
      const result = await pool.query(
        `SELECT * FROM "${schemaName}".right_to_work WHERE staff_id = $1 ORDER BY created_at DESC`,
        [req.params.staffId]
      );
      res.json(result.rows);
    } catch (err: any) {
      logger.error('RTW fetch error:', err);
      res.status(500).json({ error: 'Failed to fetch right to work records' });
    }
  });

  // POST /api/staff/:staffId/right-to-work — HR admin only
  app.post('/api/staff/:staffId/right-to-work', requireAuth, requireHrFeature, requireHrAdmin, async (req, res) => {
    try {
      const { pool, schemaName } = await getRtwPool(req.customerId!);
      const { staffId } = req.params;
      const {
        documentType, documentReference, issueDate, expiryDate,
        verifiedDate, verifiedBy, verificationMethod = 'manual', notes,
      } = req.body;

      if (!documentType || !verifiedDate || !verifiedBy) {
        return res.status(400).json({ error: 'documentType, verifiedDate and verifiedBy are required' });
      }
      if (issueDate && !/^\d{4}-\d{2}-\d{2}$/.test(String(issueDate).slice(0, 10))) {
        return res.status(400).json({ error: 'issueDate must be YYYY-MM-DD' });
      }
      if (expiryDate && !/^\d{4}-\d{2}-\d{2}$/.test(String(expiryDate).slice(0, 10))) {
        return res.status(400).json({ error: 'expiryDate must be YYYY-MM-DD' });
      }

      await pool.query(
        `UPDATE "${schemaName}".right_to_work SET is_current = FALSE WHERE staff_id = $1`,
        [staffId]
      );

      const result = await pool.query(
        `INSERT INTO "${schemaName}".right_to_work
          (staff_id, document_type, document_reference, issue_date, expiry_date,
           verified_date, verified_by, verification_method, notes, is_current)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,TRUE) RETURNING *`,
        [staffId, documentType, documentReference || null, issueDate || null,
         expiryDate || null, verifiedDate, verifiedBy, verificationMethod, notes || null]
      );

      const row = result.rows[0];
      await recordHrAudit(pool, schemaName, {
        entityType: 'right_to_work', entityId: row.id, staffId,
        action: 'create', actor: req.user?.username || 'unknown',
        details: { documentType, verifiedBy, expiryDate },
      });

      res.status(201).json(row);
    } catch (err: any) {
      logger.error('RTW create error:', err);
      res.status(500).json({ error: 'Failed to create right to work record' });
    }
  });

  // GET /api/right-to-work/expiring — admin/hr_admin only
  app.get('/api/right-to-work/expiring', requireAuth, requireHrFeature, requireHrAdmin, async (req, res) => {
    try {
      const { pool, schemaName } = await getRtwPool(req.customerId!);
      const result = await pool.query(
        `SELECT rtw.*, s.first_name, s.last_name, s.email, s.department
         FROM "${schemaName}".right_to_work rtw
         JOIN "${schemaName}".staff s ON s.id = rtw.staff_id
         WHERE rtw.is_current = TRUE
           AND rtw.expiry_date IS NOT NULL
           AND rtw.expiry_date <= NOW() + INTERVAL '90 days'
         ORDER BY rtw.expiry_date ASC`
      );
      res.json(result.rows);
    } catch (err: any) {
      logger.error('RTW expiring error:', err);
      res.status(500).json({ error: 'Failed to fetch expiring RTW records' });
    }
  });

  // GET /api/right-to-work/status/:staffId — admin/hr_admin only
  app.get('/api/right-to-work/status/:staffId', requireAuth, requireHrFeature, requireHrAdmin, async (req, res) => {
    try {
      const { pool, schemaName } = await getRtwPool(req.customerId!);
      const result = await pool.query(
        `SELECT * FROM "${schemaName}".right_to_work WHERE staff_id = $1 AND is_current = TRUE LIMIT 1`,
        [req.params.staffId]
      );
      const rtw = result.rows[0];
      if (!rtw) {
        return res.json({ hasRTW: false, isExpired: false, daysUntilExpiry: null, isVerified: false, blocksAccess: false });
      }

      const now = new Date();
      let isExpired = false;
      let daysUntilExpiry: number | null = null;

      if (rtw.expiry_date) {
        const expiry = new Date(rtw.expiry_date);
        const diff = Math.floor((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        daysUntilExpiry = diff;
        isExpired = diff < 0;
      }

      res.json({
        hasRTW: true,
        isExpired,
        daysUntilExpiry,
        isVerified: !!rtw.verified_date,
        blocksAccess: isExpired && !!rtw.expiry_date,
      });
    } catch (err: any) {
      logger.error('RTW status error:', err);
      res.status(500).json({ error: 'Failed to fetch RTW status' });
    }
  });
}

// Cron helper — called from daily job
export async function sendRtwExpiryReminders(customerId: string, companyName: string): Promise<void> {
  try {
    const { pool, schemaName } = await getRtwPool(customerId);
    const result = await pool.query(
      `SELECT rtw.*, s.first_name, s.last_name, s.email
       FROM "${schemaName}".right_to_work rtw
       JOIN "${schemaName}".staff s ON s.id = rtw.staff_id
       WHERE rtw.is_current = TRUE
         AND rtw.expiry_date IS NOT NULL
         AND rtw.expiry_date <= NOW() + INTERVAL '90 days'
         AND (rtw.reminder_sent_at IS NULL OR rtw.reminder_sent_at < NOW() - INTERVAL '30 days')`
    );

    const settingsResult = await pool.query(
      `SELECT email FROM "${schemaName}".users WHERE role = 'admin' LIMIT 1`
    );
    const adminEmail = settingsResult.rows[0]?.email;
    if (!adminEmail) return;

    for (const rtw of result.rows) {
      const expiry = new Date(rtw.expiry_date);
      const now = new Date();
      const isExpired = expiry < now;
      const staffName = `${rtw.first_name} ${rtw.last_name}`;
      const expiryStr = expiry.toLocaleDateString('en-GB');

      const subject = isExpired
        ? `🚨 Right to Work Document EXPIRED — ${staffName}`
        : `⚠ Right to Work Document Expiring — ${staffName}`;

      const body = `The Right to Work document for ${staffName} ${isExpired ? `expired on ${expiryStr}` : `is expiring on ${expiryStr}`}.

Document type: ${rtw.document_type}
Reference: ${rtw.document_reference || 'N/A'}
Expiry date: ${expiryStr}
Originally verified: ${new Date(rtw.verified_date).toLocaleDateString('en-GB')} by ${rtw.verified_by}

You must obtain and verify a new document ${isExpired ? 'immediately' : 'before the expiry date'}. Continuing to employ someone without valid Right to Work evidence may result in a civil penalty of up to £60,000.

Log in to TPR Max to upload the renewed document.`;

      await emailService.forCustomer(customerId).sendGenericEmail(adminEmail, subject, body);

      await pool.query(
        `UPDATE "${schemaName}".right_to_work SET reminder_sent_at = NOW() WHERE id = $1`,
        [rtw.id]
      );
    }
  } catch (err: any) {
    logger.error(`RTW reminder error for ${customerId}:`, err);
  }
}
