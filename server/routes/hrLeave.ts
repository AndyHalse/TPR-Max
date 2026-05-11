import type { Express } from 'express';
import { requireAuth } from '../auth';
import { customerDbService } from '../customerDatabase';
import { emailService } from '../emailService';
import { calculateWorkingDays, calculateLeaveBalance, getLeaveYear } from '../utils/leaveUtils';
import { logger } from '../utils/logger';

async function getPool(customerId: string) {
  const custDb = await customerDbService.getCustomerDatabase(customerId);
  const schemaName = customerDbService.generateSchemaName(customerId);
  const pool = (custDb as any).$client ?? (custDb as any).session?.client;
  return { pool, schemaName };
}

export function registerHrLeaveRoutes(app: Express): void {

  // GET /api/staff/:staffId/leave
  app.get('/api/staff/:staffId/leave', requireAuth, async (req, res) => {
    try {
      const { pool, schemaName } = await getPool(req.customerId!);
      const { staffId } = req.params;

      const [leaveResult, staffResult] = await Promise.all([
        pool.query(
          `SELECT lr.*, s.first_name || ' ' || s.last_name AS approved_by_name
           FROM "${schemaName}".leave_requests lr
           LEFT JOIN "${schemaName}".staff s ON s.id = lr.approved_by_id
           WHERE lr.staff_id = $1
           ORDER BY lr.created_at DESC`,
          [staffId]
        ),
        pool.query(
          `SELECT annual_leave_entitlement_days, leave_year_start, working_days_per_week
           FROM "${schemaName}".staff WHERE id = $1`,
          [staffId]
        ),
      ]);

      const staff = staffResult.rows[0];
      const leaveYear = getLeaveYear(staff?.leave_year_start ? new Date(staff.leave_year_start) : null);
      const balance = calculateLeaveBalance(
        Number(staff?.annual_leave_entitlement_days ?? 28),
        leaveYear,
        leaveResult.rows
      );

      res.json({ requests: leaveResult.rows, balance, leaveYear });
    } catch (err: any) {
      logger.error('Leave fetch error:', err);
      res.status(500).json({ error: 'Failed to fetch leave' });
    }
  });

  // POST /api/staff/:staffId/leave — submit request
  app.post('/api/staff/:staffId/leave', requireAuth, async (req, res) => {
    try {
      const { pool, schemaName } = await getPool(req.customerId!);
      const { staffId } = req.params;
      const { leaveType, startDate, endDate, reason, notes } = req.body;

      if (!leaveType || !startDate || !endDate) {
        return res.status(400).json({ error: 'leaveType, startDate and endDate are required' });
      }

      const staffResult = await pool.query(
        `SELECT working_days_per_week, line_manager_id, first_name, last_name, email
         FROM "${schemaName}".staff WHERE id = $1`,
        [staffId]
      );
      const staff = staffResult.rows[0];
      if (!staff) return res.status(404).json({ error: 'Staff member not found' });

      const daysTaken = calculateWorkingDays(
        new Date(startDate),
        new Date(endDate),
        Number(staff.working_days_per_week ?? 5)
      );

      const result = await pool.query(
        `INSERT INTO "${schemaName}".leave_requests
          (staff_id, leave_type, start_date, end_date, days_taken, status, reason, notes)
         VALUES ($1,$2,$3,$4,$5,'pending',$6,$7) RETURNING *`,
        [staffId, leaveType, startDate, endDate, daysTaken, reason || null, notes || null]
      );

      // Notify line manager
      if (staff.line_manager_id) {
        const mgr = await pool.query(
          `SELECT email, first_name FROM "${schemaName}".staff WHERE id = $1`,
          [staff.line_manager_id]
        );
        if (mgr.rows[0]?.email) {
          const staffName = `${staff.first_name} ${staff.last_name}`;
          await emailService.forCustomer(req.customerId!).sendGenericEmail(
            mgr.rows[0].email,
            `Leave Request — ${staffName}`,
            `${staffName} has submitted a leave request:\n\nType: ${leaveType}\nFrom: ${startDate}\nTo: ${endDate}\nDays: ${daysTaken}\n\nPlease log in to TPR Max to approve or decline.`
          );
        }
      }

      res.status(201).json(result.rows[0]);
    } catch (err: any) {
      logger.error('Leave create error:', err);
      res.status(500).json({ error: 'Failed to create leave request' });
    }
  });

  // PUT /api/leave/:id/approve
  app.put('/api/leave/:id/approve', requireAuth, async (req, res) => {
    try {
      const { pool, schemaName } = await getPool(req.customerId!);

      const leaveResult = await pool.query(
        `UPDATE "${schemaName}".leave_requests
         SET status = 'approved', approved_by_id = $1, approved_at = NOW(), updated_at = NOW()
         WHERE id = $2 RETURNING *`,
        [req.body.approvedById || null, req.params.id]
      );

      const leave = leaveResult.rows[0];
      if (!leave) return res.status(404).json({ error: 'Leave request not found' });

      const staff = await pool.query(
        `SELECT email, first_name, last_name FROM "${schemaName}".staff WHERE id = $1`,
        [leave.staff_id]
      );
      if (staff.rows[0]?.email) {
        await emailService.forCustomer(req.customerId!).sendGenericEmail(
          staff.rows[0].email,
          'Leave Request Approved',
          `Your leave request from ${leave.start_date} to ${leave.end_date} (${leave.days_taken} days) has been approved.`
        );
      }

      res.json(leave);
    } catch (err: any) {
      logger.error('Leave approve error:', err);
      res.status(500).json({ error: 'Failed to approve leave' });
    }
  });

  // PUT /api/leave/:id/decline
  app.put('/api/leave/:id/decline', requireAuth, async (req, res) => {
    try {
      const { pool, schemaName } = await getPool(req.customerId!);
      const { declineReason } = req.body;

      const leaveResult = await pool.query(
        `UPDATE "${schemaName}".leave_requests
         SET status = 'declined', decline_reason = $1, updated_at = NOW()
         WHERE id = $2 RETURNING *`,
        [declineReason || null, req.params.id]
      );

      const leave = leaveResult.rows[0];
      if (!leave) return res.status(404).json({ error: 'Leave request not found' });

      const staff = await pool.query(
        `SELECT email FROM "${schemaName}".staff WHERE id = $1`,
        [leave.staff_id]
      );
      if (staff.rows[0]?.email) {
        await emailService.forCustomer(req.customerId!).sendGenericEmail(
          staff.rows[0].email,
          'Leave Request Declined',
          `Your leave request from ${leave.start_date} to ${leave.end_date} has been declined.\n\nReason: ${declineReason || 'No reason provided'}`
        );
      }

      res.json(leave);
    } catch (err: any) {
      logger.error('Leave decline error:', err);
      res.status(500).json({ error: 'Failed to decline leave' });
    }
  });

  // PUT /api/leave/:id/cancel
  app.put('/api/leave/:id/cancel', requireAuth, async (req, res) => {
    try {
      const { pool, schemaName } = await getPool(req.customerId!);

      const leaveResult = await pool.query(
        `SELECT * FROM "${schemaName}".leave_requests WHERE id = $1`,
        [req.params.id]
      );
      const leave = leaveResult.rows[0];
      if (!leave) return res.status(404).json({ error: 'Leave request not found' });
      if (new Date(leave.start_date) <= new Date()) {
        return res.status(400).json({ error: 'Cannot cancel leave that has already started' });
      }

      const result = await pool.query(
        `UPDATE "${schemaName}".leave_requests SET status = 'cancelled', updated_at = NOW() WHERE id = $1 RETURNING *`,
        [req.params.id]
      );
      res.json(result.rows[0]);
    } catch (err: any) {
      logger.error('Leave cancel error:', err);
      res.status(500).json({ error: 'Failed to cancel leave' });
    }
  });

  // GET /api/leave/calendar
  app.get('/api/leave/calendar', requireAuth, async (req, res) => {
    try {
      const { pool, schemaName } = await getPool(req.customerId!);
      const { start, end } = req.query;

      const result = await pool.query(
        `SELECT lr.*, s.first_name, s.last_name, s.department
         FROM "${schemaName}".leave_requests lr
         JOIN "${schemaName}".staff s ON s.id = lr.staff_id
         WHERE lr.status = 'approved'
           AND lr.start_date <= $1
           AND lr.end_date >= $2
         ORDER BY lr.start_date`,
        [end || '2099-12-31', start || '2000-01-01']
      );
      res.json(result.rows);
    } catch (err: any) {
      logger.error('Leave calendar error:', err);
      res.status(500).json({ error: 'Failed to fetch leave calendar' });
    }
  });

  // GET /api/leave/pending-approval
  app.get('/api/leave/pending-approval', requireAuth, async (req, res) => {
    try {
      const { pool, schemaName } = await getPool(req.customerId!);
      const result = await pool.query(
        `SELECT lr.*, s.first_name, s.last_name, s.department, s.job_title
         FROM "${schemaName}".leave_requests lr
         JOIN "${schemaName}".staff s ON s.id = lr.staff_id
         WHERE lr.status = 'pending'
         ORDER BY lr.created_at ASC`
      );
      res.json(result.rows);
    } catch (err: any) {
      logger.error('Pending leave error:', err);
      res.status(500).json({ error: 'Failed to fetch pending leave' });
    }
  });

  // GET /api/leave/balance/:staffId
  app.get('/api/leave/balance/:staffId', requireAuth, async (req, res) => {
    try {
      const { pool, schemaName } = await getPool(req.customerId!);
      const [leaveResult, staffResult] = await Promise.all([
        pool.query(
          `SELECT * FROM "${schemaName}".leave_requests WHERE staff_id = $1 AND status IN ('approved','pending')`,
          [req.params.staffId]
        ),
        pool.query(
          `SELECT annual_leave_entitlement_days, leave_year_start FROM "${schemaName}".staff WHERE id = $1`,
          [req.params.staffId]
        ),
      ]);

      const staff = staffResult.rows[0];
      const leaveYear = getLeaveYear(staff?.leave_year_start ? new Date(staff.leave_year_start) : null);
      const balance = calculateLeaveBalance(
        Number(staff?.annual_leave_entitlement_days ?? 28),
        leaveYear,
        leaveResult.rows
      );

      res.json({ balance, leaveYear });
    } catch (err: any) {
      logger.error('Leave balance error:', err);
      res.status(500).json({ error: 'Failed to fetch leave balance' });
    }
  });
}
