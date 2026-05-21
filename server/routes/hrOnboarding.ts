import type { Express } from 'express';
import { requireAuth } from '../auth';
import { requireHrFeature } from './hrMiddleware';
import { customerDbService } from '../customerDatabase';
import { logger } from '../utils/logger';

async function getPool(customerId: string) {
  const custDb = await customerDbService.getCustomerDatabase(customerId);
  const schemaName = customerDbService.generateSchemaName(customerId);
  const pool = (custDb as any).$client ?? (custDb as any).session?.client;
  return { pool, schemaName };
}

function requireAdmin(req: any, res: any, next: any) {
  if (!['admin', 'hr_admin'].includes(req.user?.role || '')) {
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

const BUILTIN_DEFAULT_SET = { id: 'builtin-default', name: 'Default (UK SME)', is_default: true, is_builtin: true };

// Get items for a template set; if templateId is null/'builtin-default'/no custom, return built-in defaults
async function loadTemplateItems(pool: any, schemaName: string, templateId?: string | null) {
  if (templateId && templateId !== BUILTIN_DEFAULT_SET.id) {
    const r = await pool.query(
      `SELECT item_key, label, display_order, due_day_offset, COALESCE(is_required, TRUE) AS is_required
       FROM "${schemaName}".onboarding_templates
       WHERE template_set_id = $1 AND COALESCE(is_active, TRUE) = TRUE
       ORDER BY display_order`,
      [templateId]
    );
    if (r.rows.length) return r.rows;
  }
  // Try legacy single template (rows with NULL template_set_id) for backwards compatibility
  const legacy = await pool.query(
    `SELECT item_key, label, display_order, due_day_offset, COALESCE(is_required, TRUE) AS is_required
     FROM "${schemaName}".onboarding_templates
     WHERE template_set_id IS NULL AND COALESCE(is_active, TRUE) = TRUE
     ORDER BY display_order`
  );
  if (legacy.rows.length && (!templateId || templateId === BUILTIN_DEFAULT_SET.id)) return legacy.rows;
  return DEFAULT_ONBOARDING_ITEMS;
}

async function listTemplateSets(pool: any, schemaName: string) {
  const sets = await pool.query(
    `SELECT id, name, is_default FROM "${schemaName}".onboarding_template_sets ORDER BY is_default DESC, name`
  );
  // Always include the built-in default as a choice if no customer "default" custom set exists
  const hasCustomDefault = sets.rows.some((s: any) => s.is_default);
  const out: any[] = [];
  if (!hasCustomDefault) out.push(BUILTIN_DEFAULT_SET);
  return [...out, ...sets.rows.map((s: any) => ({ ...s, is_builtin: false }))];
}

export async function createOnboardingChecklist(
  customerId: string,
  staffId: string,
  templateId?: string | null,
): Promise<string | null> {
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

    const items = await loadTemplateItems(pool, schemaName, templateId);
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
  app.post('/api/staff/:staffId/onboarding/create', requireAuth, requireHrFeature, async (req, res) => {
    try {
      const id = await createOnboardingChecklist(req.customerId!, req.params.staffId, req.body?.templateId);
      res.json({ success: true, checklistId: id });
    } catch (err: any) {
      logger.error('Onboarding create error:', err);
      res.status(500).json({ error: 'Failed to create onboarding checklist' });
    }
  });

  // GET /api/staff/:staffId/onboarding
  app.get('/api/staff/:staffId/onboarding', requireAuth, requireHrFeature, async (req, res) => {
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
  app.patch('/api/staff/:staffId/onboarding/items/:itemId', requireAuth, requireHrFeature, async (req, res) => {
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

  // GET /api/onboarding/overview/summary
  app.get('/api/onboarding/overview/summary', requireAuth, requireHrFeature, async (req, res) => {
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
           (SELECT COUNT(*) FROM "${schemaName}".onboarding_checklists oc2
              JOIN "${schemaName}".staff s2 ON s2.id = oc2.staff_id
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

  // GET /api/onboarding/overview?filter=...
  app.get('/api/onboarding/overview', requireAuth, requireHrFeature, async (req, res) => {
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

  // POST /api/onboarding/start — start onboarding for existing staff with chosen template
  app.post('/api/onboarding/start', requireAuth, requireHrFeature, async (req, res) => {
    try {
      const { staffId, templateId } = req.body;
      if (!staffId) return res.status(400).json({ error: 'staffId required' });
      const id = await createOnboardingChecklist(req.customerId!, staffId, templateId);
      res.json({ success: true, checklistId: id, staffId });
    } catch (err: any) {
      logger.error('Onboarding start error:', err);
      res.status(500).json({ error: 'Failed to start onboarding' });
    }
  });

  // POST /api/onboarding/start-new-starter
  app.post('/api/onboarding/start-new-starter', requireAuth, requireHrFeature, async (req, res) => {
    try {
      const { pool, schemaName } = await getPool(req.customerId!);
      const { firstName, lastName, email, department, jobTitle, contractStartDate, templateId } = req.body;
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
      );
      const newStaffId = inserted.rows[0].id;
      const checklistId = await createOnboardingChecklist(req.customerId!, newStaffId, templateId);
      res.json({ success: true, staffId: newStaffId, checklistId });
    } catch (err: any) {
      logger.error('Onboarding new-starter error:', err);
      res.status(500).json({ error: 'Failed to create new starter' });
    }
  });

  // GET /api/onboarding/eligible-staff
  app.get('/api/onboarding/eligible-staff', requireAuth, requireHrFeature, async (req, res) => {
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

  // ===== Template Sets =====

  // GET /api/onboarding/templates — list available template sets (for picker; auth required, not admin)
  app.get('/api/onboarding/templates', requireAuth, requireHrFeature, async (req, res) => {
    try {
      const { pool, schemaName } = await getPool(req.customerId!);
      const sets = await listTemplateSets(pool, schemaName);
      res.json(sets);
    } catch (err: any) {
      logger.error('Onboarding templates list error:', err);
      res.status(500).json({ error: 'Failed to list templates' });
    }
  });

  // GET /api/onboarding/templates/:id — get one template (items)
  app.get('/api/onboarding/templates/:id', requireAuth, requireAdmin, async (req, res) => {
    try {
      const { pool, schemaName } = await getPool(req.customerId!);
      const id = req.params.id;
      if (id === BUILTIN_DEFAULT_SET.id) {
        return res.json({ id, name: BUILTIN_DEFAULT_SET.name, is_default: true, is_builtin: true, items: DEFAULT_ONBOARDING_ITEMS });
      }
      const setRow = await pool.query(
        `SELECT id, name, is_default FROM "${schemaName}".onboarding_template_sets WHERE id = $1`, [id]
      );
      if (!setRow.rows[0]) return res.status(404).json({ error: 'Template not found' });
      const items = await pool.query(
        `SELECT item_key, label, display_order, due_day_offset, COALESCE(is_required, TRUE) AS is_required
         FROM "${schemaName}".onboarding_templates
         WHERE template_set_id = $1 ORDER BY display_order`,
        [id]
      );
      res.json({ ...setRow.rows[0], is_builtin: false, items: items.rows });
    } catch (err: any) {
      logger.error('Onboarding template fetch error:', err);
      res.status(500).json({ error: 'Failed to fetch template' });
    }
  });

  // POST /api/onboarding/templates — create new template set
  app.post('/api/onboarding/templates', requireAuth, requireAdmin, async (req, res) => {
    try {
      const { pool, schemaName } = await getPool(req.customerId!);
      const { name, items, is_default, copyFromId } = req.body;
      if (!name?.trim()) return res.status(400).json({ error: 'name required' });

      if (is_default) {
        await pool.query(`UPDATE "${schemaName}".onboarding_template_sets SET is_default = FALSE WHERE is_default = TRUE`);
      }
      const ins = await pool.query(
        `INSERT INTO "${schemaName}".onboarding_template_sets (name, is_default) VALUES ($1,$2) RETURNING id`,
        [name.trim(), !!is_default]
      );
      const newId = ins.rows[0].id;

      let seedItems: any[] = Array.isArray(items) ? items : [];
      if (!seedItems.length && copyFromId) {
        seedItems = await loadTemplateItems(pool, schemaName, copyFromId);
      }
      if (!seedItems.length) seedItems = DEFAULT_ONBOARDING_ITEMS;

      for (let i = 0; i < seedItems.length; i++) {
        const it = seedItems[i];
        if (!it.label?.trim()) continue;
        await pool.query(
          `INSERT INTO "${schemaName}".onboarding_templates
             (item_key, label, display_order, is_active, due_day_offset, is_required, template_set_id)
           VALUES ($1,$2,$3,TRUE,$4,$5,$6)`,
          [it.item_key || `tpl_${Date.now()}_${i}`, it.label, i, it.due_day_offset ?? null, it.is_required !== false, newId]
        );
      }
      res.json({ success: true, id: newId });
    } catch (err: any) {
      logger.error('Onboarding template create error:', err);
      res.status(500).json({ error: 'Failed to create template' });
    }
  });

  // PUT /api/onboarding/templates/:id — replace items / rename / set default.
  // Editing the built-in transparently materialises a tenant-owned default set.
  app.put('/api/onboarding/templates/:id', requireAuth, requireAdmin, async (req, res) => {
    try {
      const { pool, schemaName } = await getPool(req.customerId!);
      let id = req.params.id;
      const { name, items, is_default } = req.body as { name?: string; items: any[]; is_default?: boolean };
      if (!Array.isArray(items)) return res.status(400).json({ error: 'items array required' });

      if (id === BUILTIN_DEFAULT_SET.id) {
        await pool.query(`UPDATE "${schemaName}".onboarding_template_sets SET is_default = FALSE WHERE is_default = TRUE`);
        const ins = await pool.query(
          `INSERT INTO "${schemaName}".onboarding_template_sets (name, is_default) VALUES ($1, TRUE) RETURNING id`,
          [name?.trim() || BUILTIN_DEFAULT_SET.name]
        );
        id = ins.rows[0].id;
        for (let i = 0; i < items.length; i++) {
          const it = items[i];
          if (!it.label?.trim()) continue;
          await pool.query(
            `INSERT INTO "${schemaName}".onboarding_templates
               (item_key, label, display_order, is_active, due_day_offset, is_required, template_set_id)
             VALUES ($1,$2,$3,TRUE,$4,$5,$6)`,
            [it.item_key || `tpl_${Date.now()}_${i}`, it.label, i, it.due_day_offset ?? null, it.is_required !== false, id]
          );
        }
        return res.json({ success: true, id, materialized: true });
      }

      if (is_default) {
        await pool.query(`UPDATE "${schemaName}".onboarding_template_sets SET is_default = FALSE WHERE id <> $1`, [id]);
      }
      if (name || typeof is_default === 'boolean') {
        await pool.query(
          `UPDATE "${schemaName}".onboarding_template_sets
             SET name = COALESCE($2, name), is_default = COALESCE($3, is_default)
           WHERE id = $1`,
          [id, name?.trim() || null, typeof is_default === 'boolean' ? is_default : null]
        );
      }
      await pool.query(`DELETE FROM "${schemaName}".onboarding_templates WHERE template_set_id = $1`, [id]);
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        if (!it.label?.trim()) continue;
        await pool.query(
          `INSERT INTO "${schemaName}".onboarding_templates
             (item_key, label, display_order, is_active, due_day_offset, is_required, template_set_id)
           VALUES ($1,$2,$3,TRUE,$4,$5,$6)`,
          [it.item_key || `tpl_${Date.now()}_${i}`, it.label, i, it.due_day_offset ?? null, it.is_required !== false, id]
        );
      }
      res.json({ success: true });
    } catch (err: any) {
      logger.error('Onboarding template update error:', err);
      res.status(500).json({ error: 'Failed to update template' });
    }
  });

  // DELETE /api/onboarding/templates/:id
  app.delete('/api/onboarding/templates/:id', requireAuth, requireAdmin, async (req, res) => {
    try {
      const { pool, schemaName } = await getPool(req.customerId!);
      const id = req.params.id;
      if (id === BUILTIN_DEFAULT_SET.id) return res.status(400).json({ error: 'Built-in default cannot be deleted.' });
      await pool.query(`DELETE FROM "${schemaName}".onboarding_templates WHERE template_set_id = $1`, [id]);
      await pool.query(`DELETE FROM "${schemaName}".onboarding_template_sets WHERE id = $1`, [id]);
      res.json({ success: true });
    } catch (err: any) {
      logger.error('Onboarding template delete error:', err);
      res.status(500).json({ error: 'Failed to delete template' });
    }
  });
}
