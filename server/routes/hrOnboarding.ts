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

const DEFAULT_ONBOARDING_ITEMS = [
  { key: 'contract_sent', label: 'Contract of employment sent to employee', order: 1 },
  { key: 'contract_signed', label: 'Signed contract received and filed', order: 2 },
  { key: 'rtw_verified', label: 'Right to Work documents verified', order: 3 },
  { key: 'rtw_uploaded', label: 'Right to Work documents uploaded to TPR Max', order: 4 },
  { key: 'emergency_contact', label: 'Emergency contact details collected', order: 5 },
  { key: 'payroll_details', label: 'Bank details and tax information sent to payroll', order: 6 },
  { key: 'system_access', label: 'TPR Max account created and QR code issued', order: 7 },
  { key: 'site_induction', label: 'Site induction completed', order: 8 },
  { key: 'hs_briefing', label: 'First day H&S briefing completed', order: 9 },
  { key: 'mandatory_training', label: 'Mandatory training scheduled or completed', order: 10 },
  { key: 'line_manager_intro', label: 'Introduced to line manager and team', order: 11 },
  { key: 'probation_review_set', label: 'First probation review date confirmed', order: 12 },
];

export async function createOnboardingChecklist(customerId: string, staffId: string): Promise<void> {
  try {
    const { pool, schemaName } = await getPool(customerId);

    const existing = await pool.query(
      `SELECT id FROM "${schemaName}".onboarding_checklists WHERE staff_id = $1 LIMIT 1`,
      [staffId]
    );
    if (existing.rows.length) return;

    const checklist = await pool.query(
      `INSERT INTO "${schemaName}".onboarding_checklists (staff_id) VALUES ($1) RETURNING id`,
      [staffId]
    );
    const checklistId = checklist.rows[0].id;

    // Get customer template or use defaults
    const tmpl = await pool.query(
      `SELECT * FROM "${schemaName}".onboarding_templates WHERE is_active = TRUE ORDER BY display_order`
    );
    const items = tmpl.rows.length ? tmpl.rows : DEFAULT_ONBOARDING_ITEMS.map(i => ({
      item_key: i.key, label: i.label, display_order: i.order,
    }));

    for (const item of items) {
      await pool.query(
        `INSERT INTO "${schemaName}".onboarding_items (checklist_id, item_key, label, display_order)
         VALUES ($1,$2,$3,$4)`,
        [checklistId, item.item_key || item.key, item.label, item.display_order || item.order || 0]
      );
    }
  } catch (err: any) {
    logger.error(`Onboarding checklist creation error for ${staffId}:`, err);
  }
}

export function registerHrOnboardingRoutes(app: Express): void {

  // POST /api/staff/:staffId/onboarding/create
  app.post('/api/staff/:staffId/onboarding/create', requireAuth, async (req, res) => {
    try {
      await createOnboardingChecklist(req.customerId!, req.params.staffId);
      res.json({ success: true });
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

  // GET /api/onboarding/overview
  app.get('/api/onboarding/overview', requireAuth, async (req, res) => {
    try {
      const { pool, schemaName } = await getPool(req.customerId!);

      const result = await pool.query(
        `SELECT oc.*, s.first_name, s.last_name, s.department, s.contract_start_date,
                COUNT(oi.id) AS total_items,
                COUNT(oi.id) FILTER (WHERE oi.completed = TRUE) AS completed_items
         FROM "${schemaName}".onboarding_checklists oc
         JOIN "${schemaName}".staff s ON s.id = oc.staff_id
         LEFT JOIN "${schemaName}".onboarding_items oi ON oi.checklist_id = oc.id
         WHERE s.is_active = TRUE
         GROUP BY oc.id, s.id, s.first_name, s.last_name, s.department, s.contract_start_date
         HAVING COUNT(oi.id) > COUNT(oi.id) FILTER (WHERE oi.completed = TRUE)
         ORDER BY s.contract_start_date DESC`
      );

      res.json(result.rows.map((r: any) => ({
        ...r,
        percent: r.total_items ? Math.round((r.completed_items / r.total_items) * 100) : 0,
      })));
    } catch (err: any) {
      logger.error('Onboarding overview error:', err);
      res.status(500).json({ error: 'Failed to fetch onboarding overview' });
    }
  });

  // GET /api/onboarding/templates
  app.get('/api/onboarding/templates', requireAuth, async (req, res) => {
    try {
      const { pool, schemaName } = await getPool(req.customerId!);
      const result = await pool.query(
        `SELECT * FROM "${schemaName}".onboarding_templates ORDER BY display_order`
      );
      res.json(result.rows.length ? result.rows : DEFAULT_ONBOARDING_ITEMS);
    } catch (err: any) {
      logger.error('Onboarding templates error:', err);
      res.status(500).json({ error: 'Failed to fetch onboarding templates' });
    }
  });

  // PUT /api/onboarding/templates
  app.put('/api/onboarding/templates', requireAuth, async (req, res) => {
    try {
      const { pool, schemaName } = await getPool(req.customerId!);
      const { items } = req.body;

      await pool.query(`DELETE FROM "${schemaName}".onboarding_templates`);
      for (const item of items) {
        await pool.query(
          `INSERT INTO "${schemaName}".onboarding_templates (item_key, label, display_order, is_active)
           VALUES ($1,$2,$3,$4)`,
          [item.key || item.item_key, item.label, item.order || item.display_order || 0, item.isActive !== false]
        );
      }
      res.json({ success: true });
    } catch (err: any) {
      logger.error('Onboarding template update error:', err);
      res.status(500).json({ error: 'Failed to update onboarding templates' });
    }
  });
}
