import type { Express } from 'express';
import { requireAuth } from '../auth';
import { customerDbService } from '../customerDatabase';
import { logger } from '../utils/logger';

async function getPool(customerId: string) {
  const custDb = await customerDbService.getCustomerDatabase(customerId);
  const schemaName = customerDbService.generateSchemaName(customerId);
  const pool = (custDb as any).$client ?? (custDb as any).session?.client;
  return { pool, schemaName };
}

function requireAdmin(req: any, res: any, next: any) {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'Admin role required' });
  }
  next();
}

// Default template — 12 core items + UK-statutory items
export const DEFAULT_ONBOARDING_ITEMS = [
  { item_key: 'contract_sent', label: 'Contract of employment sent to employee', display_order: 1, due_day_offset: -7, is_required: true },
  { item_key: 'contract_signed', label: 'Signed contract received and filed', display_order: 2, due_day_offset: 0, is_required: true },
  { item_key: 'rtw_verified', label: 'Right to Work documents verified', display_order: 3, due_day_offset: 0, is_required: true },
  { item_key: 'rtw_uploaded', label: 'Right to Work documents uploaded to TPR Max', display_order: 4, due_day_offset: 0, is_required: true },
  { item_key: 'bank_ni_collected', label: 'Bank details and NI number collected', display_order: 5, due_day_offset: 0, is_required: true },
  { item_key: 'emergency_contact', label: 'Emergency contact details collected', display_order: 6, due_day_offset: 0, is_required: true },
  { item_key: 'payroll_details', label: 'Tax / starter checklist sent to payroll', display_order: 7, due_day_offset: 1, is_required: true },
  { item_key: 'pension_letter', label: 'Pension auto-enrolment letter issued', display_order: 8, due_day_offset: 33, is_required: true },
  { item_key: 'confidentiality_signed', label: 'Confidentiality / IT acceptable use signed', display_order: 9, due_day_offset: 1, is_required: true },
  { item_key: 'system_access', label: 'TPR Max account created and QR code issued', display_order: 10, due_day_offset: 0, is_required: true },
  { item_key: 'site_induction', label: 'Site induction completed', display_order: 11, due_day_offset: 1, is_required: true },
  { item_key: 'hs_briefing', label: 'First day H&S briefing completed', display_order: 12, due_day_offset: 1, is_required: true },
  { item_key: 'first_week_meetings', label: 'First-week meetings booked (line manager, team, HR)', display_order: 13, due_day_offset: 3, is_required: true },
  { item_key: 'mandatory_training', label: 'Mandatory training scheduled or completed', display_order: 14, due_day_offset: 14, is_required: true },
  { item_key: 'line_manager_intro', label: 'Introduced to line manager and team', display_order: 15, due_day_offset: 1, is_required: true },
  { item_key: 'probation_review_set', label: 'Probation review date confirmed', display_order: 16, due_day_offset: 7, is_required: true },
];

async function loadTemplate(pool: any, schemaName: string) {
  const r = await pool.query(
    `SELECT item_key, label, display_order, COALESCE(due_day_offset, 0) AS due_day_offset, COALESCE(is_required, TRUE) AS is_required, COALESCE(is_active, TRUE) AS is_active
     FROM "${schemaName}".onboarding_templates ORDER BY display_order`
  );
  const isCustom = r.rows.length > 0;
  const items = isCustom ? r.rows.filter((i: any) => i.is_active) : DEFAULT_ONBOARDING_ITEMS;
  return { items, isCustom };
}

export async function createOnboardingChecklist(customerId: string, staffId: string): Promise<string | null> {
  try {
    const { pool, schemaName } = await getPool(customerId);

    const existing = await pool.query(
      `SELECT id FROM "${schemaName}".onboarding_checklists WHERE staff_id = $1 LIMIT 1`,
      [staffId]
    );
    if (existing.rows.length) return existing.rows[0].id;

    const checklist = await pool.query(
      `INSERT INTO "${schemaName}".onboarding_checklists (staff_id) VALUES ($1) RETURNING id`,
      [staffId]
    );
    const checklistId = checklist.rows[0].id;

    const { items } = await loadTemplate(pool, schemaName);

    for (const item of items) {
      await pool.query(
        `INSERT INTO "${schemaName}".onboarding_items (checklist_id, item_key, label, display_order, due_day_offset, is_required)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [checklistId, item.item_key, item.label, item.display_order || 0, item.due_day_offset ?? null, item.is_required !== false]
      );
    }
    return checklistId;
  } catch (err: any) {
    logger.error(`Onboarding checklist creation error for ${staffId}:`, err);
    return null;
  }
}

export function registerHrOnboardingRoutes(app: Express): void {

  // POST /api/staff/:staffId/onboarding/create
  app.post('/api/staff/:staffId/onboarding/create', requireAuth, async (req, res) => {
    try {
      const id = await createOnboardingChecklist(req.customerId!, req.params.staffId);
      res.json({ success: true, checklistId: id });
    } catch (err: any) {
      logger.error('Onboarding create error:', err);
      res.status(500).json({ error: 'Failed to create onboarding checklist' });
    }
  });

  // GET /api/staff/:staffId/onboarding
  app.get('/api/staff/:staffId/onboarding', requireAuth, async (req, res) => {
    try {
      const { pool, schemaName } = await getPool(req.customerId!);

      const checklist = await pool.query(
        `SELECT * FROM "${schemaName}".onboarding_checklists WHERE staff_id = $1 LIMIT 1`,
        [req.params.staffId]
      );
      if (!checklist.rows[0]) return res.json(null);

      const items = await pool.query(
        `SELECT * FROM "${schemaName}".onboarding_items WHERE checklist_id = $1 ORDER BY display_order`,
        [checklist.rows[0].id]
      );

      const total = items.rows.length;
      const completed = items.rows.filter((i: any) => i.completed).length;
      const pct = total ? Math.round((completed / total) * 100) : 0;

      res.json({ checklist: checklist.rows[0], items: items.rows, total, completed, percent: pct });
    } catch (err: any) {
      logger.error('Onboarding fetch error:', err);
      res.status(500).json({ error: 'Failed to fetch onboarding checklist' });
    }
  });

  // PATCH /api/staff/:staffId/onboarding/items/:itemId
  app.patch('/api/staff/:staffId/onboarding/items/:itemId', requireAuth, async (req, res) => {
    try {
      const { pool, schemaName } = await getPool(req.customerId!);
      const { completed, notes } = req.body;
      const completedBy = req.user?.username || 'unknown';

      const result = await pool.query(
        `UPDATE "${schemaName}".onboarding_items
         SET completed = $1, notes = $2,
             completed_at = CASE WHEN $1 = TRUE THEN NOW() ELSE NULL END,
             completed_by = CASE WHEN $1 = TRUE THEN $3 ELSE NULL END
         WHERE id = $4 RETURNING *`,
        [completed, notes || null, completedBy, req.params.itemId]
      );

      res.json(result.rows[0]);
    } catch (err: any) {
      logger.error('Onboarding item update error:', err);
      res.status(500).json({ error: 'Failed to update onboarding item' });
    }
  });

  // GET /api/onboarding/overview/summary — counts for dashboard cards
  app.get('/api/onboarding/overview/summary', requireAuth, async (req, res) => {
    try {
      const { pool, schemaName } = await getPool(req.customerId!);
      const result = await pool.query(
        `WITH per_checklist AS (
           SELECT oc.id, s.contract_start_date,
                  COUNT(oi.id) AS total_items,
                  COUNT(oi.id) FILTER (WHERE oi.completed = TRUE) AS completed_items,
                  COUNT(oi.id) FILTER (
                    WHERE oi.completed = FALSE
                      AND oi.due_day_offset IS NOT NULL
                      AND s.contract_start_date IS NOT NULL
                      AND (s.contract_start_date + (oi.due_day_offset || ' days')::interval) < NOW()
                  ) AS overdue_items
           FROM "${schemaName}".onboarding_checklists oc
           JOIN "${schemaName}".staff s ON s.id = oc.staff_id
           LEFT JOIN "${schemaName}".onboarding_items oi ON oi.checklist_id = oc.id
           WHERE s.is_active = TRUE
           GROUP BY oc.id, s.contract_start_date
         )
         SELECT
           (SELECT COUNT(*) FROM "${schemaName}".staff s2
             WHERE s2.is_active = TRUE
               AND s2.contract_start_date IS NOT NULL
               AND date_trunc('month', s2.contract_start_date) = date_trunc('month', NOW())
           ) AS starting_this_month,
           (SELECT COUNT(*) FROM per_checklist WHERE total_items > 0 AND completed_items < total_items) AS in_progress,
           (SELECT COALESCE(SUM(overdue_items), 0) FROM per_checklist) AS overdue_items`
      );
      const row = result.rows[0] || {};
      res.json({
        starting_this_month: Number(row.starting_this_month || 0),
        in_progress: Number(row.in_progress || 0),
        overdue_items: Number(row.overdue_items || 0),
      });
    } catch (err: any) {
      logger.error('Onboarding summary error:', err);
      res.status(500).json({ error: 'Failed to fetch summary' });
    }
  });

  // GET /api/onboarding/overview?filter=in_progress|starting_this_month|overdue
  app.get('/api/onboarding/overview', requireAuth, async (req, res) => {
    try {
      const { pool, schemaName } = await getPool(req.customerId!);
      const filter = String(req.query.filter || 'in_progress');

      let whereClause = `HAVING COUNT(oi.id) > COUNT(oi.id) FILTER (WHERE oi.completed = TRUE)`;
      if (filter === 'starting_this_month') {
        whereClause = `HAVING date_trunc('month', s.contract_start_date) = date_trunc('month', NOW())`;
      } else if (filter === 'overdue') {
        whereClause = `HAVING COUNT(oi.id) FILTER (
            WHERE oi.completed = FALSE
              AND oi.due_day_offset IS NOT NULL
              AND s.contract_start_date IS NOT NULL
              AND (s.contract_start_date + (oi.due_day_offset || ' days')::interval) < NOW()
          ) > 0`;
      }

      const result = await pool.query(
        `SELECT oc.id, oc.staff_id, s.first_name, s.last_name, s.department, s.contract_start_date,
                COUNT(oi.id) AS total_items,
                COUNT(oi.id) FILTER (WHERE oi.completed = TRUE) AS completed_items,
                COUNT(oi.id) FILTER (
                  WHERE oi.completed = FALSE
                    AND oi.due_day_offset IS NOT NULL
                    AND s.contract_start_date IS NOT NULL
                    AND (s.contract_start_date + (oi.due_day_offset || ' days')::interval) < NOW()
                ) AS overdue_items,
                COALESCE((
                  SELECT json_agg(json_build_object('label', oi2.label, 'due_day_offset', oi2.due_day_offset))
                  FROM "${schemaName}".onboarding_items oi2
                  WHERE oi2.checklist_id = oc.id
                    AND oi2.completed = FALSE
                    AND oi2.due_day_offset IS NOT NULL
                    AND s.contract_start_date IS NOT NULL
                    AND (s.contract_start_date + (oi2.due_day_offset || ' days')::interval) < NOW()
                ), '[]'::json) AS overdue_list
         FROM "${schemaName}".onboarding_checklists oc
         JOIN "${schemaName}".staff s ON s.id = oc.staff_id
         LEFT JOIN "${schemaName}".onboarding_items oi ON oi.checklist_id = oc.id
         WHERE s.is_active = TRUE
         GROUP BY oc.id, s.id, s.first_name, s.last_name, s.department, s.contract_start_date
         ${whereClause}
         ORDER BY s.contract_start_date DESC NULLS LAST`
      );

      res.json(result.rows.map((r: any) => {
        const total = Number(r.total_items || 0);
        const done = Number(r.completed_items || 0);
        const start = r.contract_start_date ? new Date(r.contract_start_date) : null;
        const daysSinceStart = start ? Math.floor((Date.now() - start.getTime()) / 86400000) : null;
        return {
          ...r,
          total_items: total,
          completed_items: done,
          overdue_items: Number(r.overdue_items || 0),
          percent: total ? Math.round((done / total) * 100) : 0,
          days_since_start: daysSinceStart,
        };
      }));
    } catch (err: any) {
      logger.error('Onboarding overview error:', err);
      res.status(500).json({ error: 'Failed to fetch onboarding overview' });
    }
  });

  // POST /api/onboarding/start — start onboarding for existing staff
  app.post('/api/onboarding/start', requireAuth, async (req, res) => {
    try {
      const { staffId } = req.body;
      if (!staffId) return res.status(400).json({ error: 'staffId required' });
      const id = await createOnboardingChecklist(req.customerId!, staffId);
      res.json({ success: true, checklistId: id, staffId });
    } catch (err: any) {
      logger.error('Onboarding start error:', err);
      res.status(500).json({ error: 'Failed to start onboarding' });
    }
  });

  // POST /api/onboarding/start-new-starter — create staff stub + checklist
  app.post('/api/onboarding/start-new-starter', requireAuth, async (req, res) => {
    try {
      const { pool, schemaName } = await getPool(req.customerId!);
      const { firstName, lastName, email, department, jobTitle, contractStartDate } = req.body;
      if (!firstName || !lastName || !email || !contractStartDate) {
        return res.status(400).json({ error: 'firstName, lastName, email and contractStartDate are required' });
      }

      const empId = `EMP-${Date.now().toString().slice(-6)}`;
      const inserted = await pool.query(
        `INSERT INTO "${schemaName}".staff
           (customer_id, first_name, last_name, email, department, job_title, employee_id, contract_start_date, is_active, access_level)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,TRUE,'staff')
         RETURNING id`,
        [req.customerId!, firstName, lastName, email, department || 'General', jobTitle || null, empId, contractStartDate]
      ).catch(async (e: any) => {
        // Fallback if contract_start_date column lives elsewhere
        const r2 = await pool.query(
          `INSERT INTO "${schemaName}".staff
             (customer_id, first_name, last_name, email, department, job_title, employee_id, is_active, access_level)
           VALUES ($1,$2,$3,$4,$5,$6,$7,TRUE,'staff')
           RETURNING id`,
          [req.customerId!, firstName, lastName, email, department || 'General', jobTitle || null, empId]
        );
        return r2;
      });

      const newStaffId = inserted.rows[0].id;
      const checklistId = await createOnboardingChecklist(req.customerId!, newStaffId);
      res.json({ success: true, staffId: newStaffId, checklistId });
    } catch (err: any) {
      logger.error('Onboarding new-starter error:', err);
      res.status(500).json({ error: 'Failed to create new starter' });
    }
  });

  // GET /api/onboarding/eligible-staff — staff with no onboarding checklist yet
  app.get('/api/onboarding/eligible-staff', requireAuth, async (req, res) => {
    try {
      const { pool, schemaName } = await getPool(req.customerId!);
      const result = await pool.query(
        `SELECT s.id, s.first_name, s.last_name, s.department, s.job_title, s.contract_start_date
         FROM "${schemaName}".staff s
         LEFT JOIN "${schemaName}".onboarding_checklists oc ON oc.staff_id = s.id
         WHERE s.is_active = TRUE AND oc.id IS NULL
         ORDER BY s.first_name, s.last_name`
      );
      res.json(result.rows);
    } catch (err: any) {
      logger.error('Onboarding eligible staff error:', err);
      res.status(500).json({ error: 'Failed to fetch eligible staff' });
    }
  });

  // GET /api/onboarding/template
  app.get('/api/onboarding/template', requireAuth, requireAdmin, async (req, res) => {
    try {
      const { pool, schemaName } = await getPool(req.customerId!);
      const { items, isCustom } = await loadTemplate(pool, schemaName);
      res.json({ items, isCustom });
    } catch (err: any) {
      logger.error('Onboarding template fetch error:', err);
      res.status(500).json({ error: 'Failed to fetch onboarding template' });
    }
  });

  // PUT /api/onboarding/template
  app.put('/api/onboarding/template', requireAuth, requireAdmin, async (req, res) => {
    try {
      const { pool, schemaName } = await getPool(req.customerId!);
      const { items } = req.body as { items: any[] };
      if (!Array.isArray(items)) return res.status(400).json({ error: 'items array required' });

      await pool.query(`DELETE FROM "${schemaName}".onboarding_templates`);
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        if (!it.label?.trim()) continue;
        await pool.query(
          `INSERT INTO "${schemaName}".onboarding_templates
             (item_key, label, display_order, is_active, due_day_offset, is_required)
           VALUES ($1,$2,$3,$4,$5,$6)`,
          [
            it.item_key || `tpl_${Date.now()}_${i}`,
            it.label,
            i,
            it.is_active !== false,
            it.due_day_offset ?? null,
            it.is_required !== false,
          ]
        );
      }
      res.json({ success: true });
    } catch (err: any) {
      logger.error('Onboarding template update error:', err);
      res.status(500).json({ error: 'Failed to update template' });
    }
  });

  // POST /api/onboarding/template/reset
  app.post('/api/onboarding/template/reset', requireAuth, requireAdmin, async (req, res) => {
    try {
      const { pool, schemaName } = await getPool(req.customerId!);
      await pool.query(`DELETE FROM "${schemaName}".onboarding_templates`);
      res.json({ success: true });
    } catch (err: any) {
      logger.error('Onboarding template reset error:', err);
      res.status(500).json({ error: 'Failed to reset template' });
    }
  });
}
