import type { Express } from 'express';
import { requireAuth } from '../auth';
import { customerDbService } from '../customerDatabase';
import { emailService } from '../emailService';
import { logger } from '../utils/logger';

async function getPool(customerId: string) {
  const custDb = await customerDbService.getCustomerDatabase(customerId);
  const schemaName = customerDbService.generateSchemaName(customerId);
  const pool = (custDb as any).$client ?? (custDb as any).session?.client;
  return { pool, schemaName };
}

const DEFAULT_LEAVER_ITEMS = [
  { key: 'resignation_received', label: 'Written resignation / notice received', order: 1 },
  { key: 'last_day_confirmed', label: 'Final working day confirmed', order: 2 },
  { key: 'handover_plan', label: 'Handover plan agreed', order: 3 },
  { key: 'payroll_notified', label: 'Payroll team notified of leave date', order: 4 },
  { key: 'equipment_returned', label: 'All company equipment returned', order: 5 },
  { key: 'access_removed', label: 'Building / system access removed', order: 6 },
  { key: 'tpr_max_deactivated', label: 'TPR Max QR code deactivated', order: 7 },
  { key: 'p45_issued', label: 'P45 reference number noted', order: 8 },
  { key: 'exit_interview', label: 'Exit interview completed', order: 9 },
  { key: 'references_agreed', label: 'Reference process discussed', order: 10 },
];

export function registerHrLeaverRoutes(app: Express): void {

  // POST /api/staff/:staffId/initiate-leaver
  app.post('/api/staff/:staffId/initiate-leaver', requireAuth, async (req, res) => {
    try {
      const { pool, schemaName } = await getPool(req.customerId!);
      const { staffId } = req.params;
      const { lastDay, reason, isVoluntary } = req.body;

      if (!lastDay) return res.status(400).json({ error: 'lastDay is required' });

      // 1. Set staff to leaver
      await pool.query(
        `UPDATE "${schemaName}".staff
         SET employment_status = 'leaver', contract_end_date = $1, is_active = false, updated_at = NOW()
         WHERE id = $2`,
        [lastDay, staffId]
      );

      // 2. Create leaver checklist
      const checklist = await pool.query(
        `INSERT INTO "${schemaName}".leaver_checklists (staff_id, last_day, reason, is_voluntary)
         VALUES ($1,$2,$3,$4) RETURNING id`,
        [staffId, lastDay, reason || null, isVoluntary ?? null]
      );
      const checklistId = checklist.rows[0].id;

      // 3. Populate items
      for (const item of DEFAULT_LEAVER_ITEMS) {
        const isAutoComplete = item.key === 'access_removed' || item.key === 'tpr_max_deactivated';
        await pool.query(
          `INSERT INTO "${schemaName}".leaver_items (checklist_id, item_key, label, completed, completed_at, completed_by, display_order)
           VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [checklistId, item.key, item.label, isAutoComplete, isAutoComplete ? new Date() : null,
           isAutoComplete ? 'System (auto)' : null, item.order]
        );
      }

      // 4. Cancel future approved leave
      await pool.query(
        `UPDATE "${schemaName}".leave_requests
         SET status = 'cancelled', updated_at = NOW()
         WHERE staff_id = $1 AND status IN ('pending','approved') AND start_date > NOW()`,
        [staffId]
      );

      // 5. Get staff name and notify HR admin
      const staffInfo = await pool.query(
        `SELECT first_name, last_name FROM "${schemaName}".staff WHERE id = $1`,
        [staffId]
      );
      const adminResult = await pool.query(
        `SELECT email FROM "${schemaName}".users WHERE role = 'admin' LIMIT 1`
      );

      const staffName = staffInfo.rows[0]
        ? `${staffInfo.rows[0].first_name} ${staffInfo.rows[0].last_name}`
        : 'Staff member';

      if (adminResult.rows[0]?.email) {
        await emailService.forCustomer(req.customerId!).sendGenericEmail(
          adminResult.rows[0].email,
          `Leaver Process Initiated — ${staffName}`,
          `The leaver process has been initiated for ${staffName}.\n\nLast day: ${lastDay}\nReason: ${reason || 'Not specified'}\n\nSite access and QR check-in have been deactivated immediately. Please complete the leaver checklist in TPR Max.`
        );
      }

      res.status(201).json({ success: true, checklistId });
    } catch (err: any) {
      logger.error('Initiate leaver error:', err);
      res.status(500).json({ error: 'Failed to initiate leaver process' });
    }
  });

  // GET /api/staff/:staffId/leaver
  app.get('/api/staff/:staffId/leaver', requireAuth, async (req, res) => {
    try {
      const { pool, schemaName } = await getPool(req.customerId!);

      const checklist = await pool.query(
        `SELECT * FROM "${schemaName}".leaver_checklists WHERE staff_id = $1 ORDER BY created_at DESC LIMIT 1`,
        [req.params.staffId]
      );
      if (!checklist.rows[0]) return res.json(null);

      const items = await pool.query(
        `SELECT * FROM "${schemaName}".leaver_items WHERE checklist_id = $1 ORDER BY display_order`,
        [checklist.rows[0].id]
      );

      const total = items.rows.length;
      const completed = items.rows.filter((i: any) => i.completed).length;

      res.json({ checklist: checklist.rows[0], items: items.rows, total, completed, percent: total ? Math.round((completed / total) * 100) : 0 });
    } catch (err: any) {
      logger.error('Leaver fetch error:', err);
      res.status(500).json({ error: 'Failed to fetch leaver checklist' });
    }
  });

  // PATCH /api/staff/:staffId/leaver/items/:itemId
  app.patch('/api/staff/:staffId/leaver/items/:itemId', requireAuth, async (req, res) => {
    try {
      const { pool, schemaName } = await getPool(req.customerId!);
      const { completed, notes } = req.body;
      const completedBy = req.user?.username || 'unknown';

      const result = await pool.query(
        `UPDATE "${schemaName}".leaver_items
         SET completed = $1, notes = $2,
             completed_at = CASE WHEN $1 = TRUE THEN NOW() ELSE NULL END,
             completed_by = CASE WHEN $1 = TRUE THEN $3 ELSE NULL END
         WHERE id = $4 RETURNING *`,
        [completed, notes || null, completedBy, req.params.itemId]
      );

      res.json(result.rows[0]);
    } catch (err: any) {
      logger.error('Leaver item update error:', err);
      res.status(500).json({ error: 'Failed to update leaver item' });
    }
  });

  // POST /api/staff/:staffId/archive
  app.post('/api/staff/:staffId/archive', requireAuth, async (req, res) => {
    try {
      const { pool, schemaName } = await getPool(req.customerId!);
      await pool.query(
        `UPDATE "${schemaName}".staff SET employment_status = 'archived', updated_at = NOW() WHERE id = $1`,
        [req.params.staffId]
      );
      res.json({ success: true });
    } catch (err: any) {
      logger.error('Archive error:', err);
      res.status(500).json({ error: 'Failed to archive staff member' });
    }
  });

  // GET /api/hr/leavers — all staff currently in leaver status
  app.get('/api/hr/leavers', requireAuth, async (req, res) => {
    try {
      const { pool, schemaName } = await getPool(req.customerId!);
      const result = await pool.query(
        `SELECT s.id, s.first_name, s.last_name, s.department, s.job_title,
                lc.last_day, lc.reason, lc.created_at,
                COUNT(li.id) AS total_items,
                COUNT(li.id) FILTER (WHERE li.completed = TRUE) AS completed_items
         FROM "${schemaName}".staff s
         LEFT JOIN "${schemaName}".leaver_checklists lc ON lc.staff_id = s.id
         LEFT JOIN "${schemaName}".leaver_items li ON li.checklist_id = lc.id
         WHERE s.employment_status = 'leaver'
         GROUP BY s.id, lc.id
         ORDER BY lc.last_day ASC`
      );
      res.json(result.rows.map((r: any) => ({
        ...r,
        percent: r.total_items ? Math.round((r.completed_items / r.total_items) * 100) : 0,
        daysUntilLastDay: r.last_day ? Math.ceil((new Date(r.last_day).getTime() - Date.now()) / (1000 * 60 * 60 * 24)) : null,
      })));
    } catch (err: any) {
      logger.error('Leavers fetch error:', err);
      res.status(500).json({ error: 'Failed to fetch leavers' });
    }
  });
}
