import type { Express } from 'express';
import { requireAuth } from '../auth';
import { requireHrFeature } from './hrMiddleware';
import { customerDbService } from '../customerDatabase';
import { emailService } from '../emailService';
import { logger } from '../utils/logger';

async function getPool(customerId: string) {
  const custDb = await customerDbService.getCustomerDatabase(customerId);
  const schemaName = customerDbService.generateSchemaName(customerId);
  const pool = (custDb as any).$client ?? (custDb as any).session?.client;
  return { pool, schemaName };
}

export const LEAVER_CATEGORIES = ['legal_payroll', 'equipment', 'access', 'knowledge'] as const;
export const LEAVER_REASON_CODES = [
  'resignation', 'redundancy', 'dismissal', 'end_of_contract',
  'retirement', 'death_in_service', 'mutual_agreement',
] as const;

type DefaultItem = { key: string; label: string; is_critical?: boolean; is_auto?: boolean };
const DEFAULT_TEMPLATE: Record<string, DefaultItem[]> = {
  legal_payroll: [
    { key: 'resignation_received', label: 'Written resignation / notice received' },
    { key: 'last_day_confirmed', label: 'Final working day confirmed' },
    { key: 'notice_period_recorded', label: 'Notice period recorded in HR system' },
    { key: 'final_payroll_processed', label: 'Final payroll processed' },
    { key: 'holiday_pay_calculated', label: 'Outstanding holiday pay calculated' },
    { key: 'p45_arranged', label: 'P45 arranged with payroll' },
    { key: 'pension_provider_notified', label: 'Pension provider notified' },
    { key: 'references_policy_agreed', label: 'Reference policy discussed' },
  ],
  equipment: [
    { key: 'all_equipment_returned', label: 'All company equipment returned', is_critical: true },
  ],
  access: [
    { key: 'building_access_revoked', label: 'Building / site access revoked', is_auto: true },
    { key: 'tpr_max_deactivated', label: 'TPR Max account deactivated', is_auto: true },
    { key: 'email_account_handled', label: 'Email account forwarded / disabled' },
    { key: 'software_licences_reclaimed', label: 'Software licences reclaimed' },
    { key: 'shared_drive_access_removed', label: 'Shared drive / cloud storage access removed' },
    { key: 'mfa_devices_removed', label: 'MFA tokens / devices removed' },
  ],
  knowledge: [
    { key: 'handover_document_delivered', label: 'Handover document delivered', is_critical: true },
    { key: 'client_handover_completed', label: 'Client / project handover completed' },
    { key: 'team_announcement_sent', label: 'Team announcement sent' },
    { key: 'final_manager_meeting', label: 'Final manager 1:1 completed' },
    { key: 'exit_interview_completed', label: 'Exit interview completed' },
  ],
};

const DEFAULT_EQUIPMENT = [
  'Laptop', 'Mobile phone', 'Office keys', 'Access fob', 'ID badge', 'Uniform / PPE', 'Fuel card',
];

async function loadTemplate(pool: any, schemaName: string) {
  const tpl = await pool.query(
    `SELECT category, item_key, label, is_critical, is_auto, display_order, kind
     FROM "${schemaName}".leaver_template_items
     WHERE enabled = TRUE
     ORDER BY kind, category, display_order, item_key`
  );
  if (!tpl.rows.length) {
    const checklist: Array<DefaultItem & { category: string; display_order: number }> = [];
    let order = 0;
    for (const cat of LEAVER_CATEGORIES) {
      for (const it of DEFAULT_TEMPLATE[cat]) {
        checklist.push({ category: cat, display_order: order++, ...it });
      }
    }
    const equipment = DEFAULT_EQUIPMENT.map((name, i) => ({ name, display_order: i }));
    return { checklist, equipment };
  }
  const checklist: any[] = [];
  const equipment: any[] = [];
  for (const r of tpl.rows) {
    if (r.kind === 'equipment') {
      equipment.push({ name: r.label, display_order: r.display_order });
    } else {
      checklist.push({
        category: r.category, key: r.item_key, label: r.label,
        is_critical: !!r.is_critical, is_auto: !!r.is_auto, display_order: r.display_order,
      });
    }
  }
  return { checklist, equipment };
}

function requireAdmin(req: any, res: any, next: any) {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'Admin role required' });
  }
  next();
}

export function registerHrLeaverRoutes(app: Express): void {

  // POST /api/staff/:staffId/initiate-leaver
  app.post('/api/staff/:staffId/initiate-leaver', requireAuth, requireHrFeature, async (req, res) => {
    try {
      const { pool, schemaName } = await getPool(req.customerId!);
      const { staffId } = req.params;
      const { lastDay, reasonCode, additionalDetail, reason, isVoluntary } = req.body;

      if (!lastDay) return res.status(400).json({ error: 'lastDay is required' });
      const finalReasonCode = reasonCode || (isVoluntary === false ? 'dismissal' : 'resignation');
      if (!LEAVER_REASON_CODES.includes(finalReasonCode)) {
        return res.status(400).json({ error: 'Invalid reason code' });
      }

      // Cascade direct reports up one level
      const leaverInfo = await pool.query(
        `SELECT line_manager_id FROM "${schemaName}".staff WHERE id = $1`, [staffId]
      );
      const upstreamManagerId = leaverInfo.rows[0]?.line_manager_id || null;
      const reassign = await pool.query(
        `UPDATE "${schemaName}".staff
         SET line_manager_id = $1, updated_at = NOW()
         WHERE line_manager_id = $2
         RETURNING id, first_name, last_name`,
        [upstreamManagerId, staffId]
      );
      if (reassign.rowCount && reassign.rowCount > 0) {
        const names = reassign.rows.map((r: any) => `${r.first_name} ${r.last_name}`).join(', ');
        logger.info(
          `[hr-audit] Leaver ${staffId}: reassigned ${reassign.rowCount} direct report(s) to ${upstreamManagerId || 'Unassigned'} — ${names}`
        );
      }

      // Set staff to leaver (deactivation happens later — gated on critical items)
      await pool.query(
        `UPDATE "${schemaName}".staff
         SET employment_status = 'leaver', contract_end_date = $1, updated_at = NOW()
         WHERE id = $2`,
        [lastDay, staffId]
      );

      // Create checklist
      const additional = additionalDetail || reason || null;
      const checklist = await pool.query(
        `INSERT INTO "${schemaName}".leaver_checklists
           (staff_id, last_day, reason, reason_code, additional_detail, is_voluntary)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
        [staffId, lastDay, additional, finalReasonCode, additional, isVoluntary ?? null]
      );
      const checklistId = checklist.rows[0].id;

      // Populate items from template
      const { checklist: items, equipment } = await loadTemplate(pool, schemaName);
      for (const it of items) {
        await pool.query(
          `INSERT INTO "${schemaName}".leaver_items
             (checklist_id, item_key, label, category, is_critical, is_auto,
              completed, completed_at, completed_by, display_order)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
          [checklistId, it.key, it.label, it.category, !!it.is_critical, !!it.is_auto,
           !!it.is_auto, it.is_auto ? new Date() : null, it.is_auto ? 'System (auto)' : null,
           it.display_order]
        );
      }
      for (const eq of equipment) {
        await pool.query(
          `INSERT INTO "${schemaName}".leaver_equipment (checklist_id, name, display_order)
           VALUES ($1,$2,$3)`,
          [checklistId, eq.name, eq.display_order]
        );
      }

      // Cancel future approved leave
      await pool.query(
        `UPDATE "${schemaName}".leave_requests
         SET status = 'cancelled', updated_at = NOW()
         WHERE staff_id = $1 AND status IN ('pending','approved') AND start_date > NOW()`,
        [staffId]
      );

      // Notify admin
      const staffInfo = await pool.query(
        `SELECT first_name, last_name FROM "${schemaName}".staff WHERE id = $1`, [staffId]
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
          `The leaver process has been initiated for ${staffName}.\n\nLast day: ${lastDay}\nReason: ${finalReasonCode.replace(/_/g, ' ')}${additional ? `\nDetail: ${additional}` : ''}\n\nComplete the offboarding checklist in TPR Max.`
        );
      }

      res.status(201).json({ success: true, checklistId });
    } catch (err: any) {
      logger.error('Initiate leaver error:', err);
      res.status(500).json({ error: 'Failed to initiate leaver process' });
    }
  });

  // GET /api/staff/:staffId/leaver — full leaver record (checklist + equipment + interview)
  app.get('/api/staff/:staffId/leaver', requireAuth, requireHrFeature, async (req, res) => {
    try {
      const { pool, schemaName } = await getPool(req.customerId!);
      const checklist = await pool.query(
        `SELECT * FROM "${schemaName}".leaver_checklists WHERE staff_id = $1 ORDER BY created_at DESC LIMIT 1`,
        [req.params.staffId]
      );
      if (!checklist.rows[0]) return res.json(null);
      const cid = checklist.rows[0].id;

      const [items, equipment, interview] = await Promise.all([
        pool.query(
          `SELECT * FROM "${schemaName}".leaver_items WHERE checklist_id = $1 ORDER BY category, display_order`,
          [cid]
        ),
        pool.query(
          `SELECT * FROM "${schemaName}".leaver_equipment WHERE checklist_id = $1 ORDER BY display_order, created_at`,
          [cid]
        ),
        pool.query(
          `SELECT * FROM "${schemaName}".leaver_exit_interviews WHERE checklist_id = $1`,
          [cid]
        ),
      ]);

      const total = items.rows.length;
      const completed = items.rows.filter((i: any) => i.completed).length;
      const criticalItems = items.rows.filter((i: any) => i.is_critical);
      const allEquipmentReturned = equipment.rows.length === 0
        || equipment.rows.every((e: any) => e.returned);
      const criticalDone = criticalItems.every((i: any) => i.completed) && allEquipmentReturned;

      res.json({
        checklist: checklist.rows[0],
        items: items.rows,
        equipment: equipment.rows,
        interview: interview.rows[0] || null,
        total,
        completed,
        percent: total ? Math.round((completed / total) * 100) : 0,
        criticalDone,
        allEquipmentReturned,
      });
    } catch (err: any) {
      logger.error('Leaver fetch error:', err);
      res.status(500).json({ error: 'Failed to fetch leaver checklist' });
    }
  });

  // PATCH /api/staff/:staffId/leaver/items/:itemId
  app.patch('/api/staff/:staffId/leaver/items/:itemId', requireAuth, requireHrFeature, async (req, res) => {
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
        [completed, notes ?? null, completedBy, req.params.itemId]
      );
      res.json(result.rows[0]);
    } catch (err: any) {
      logger.error('Leaver item update error:', err);
      res.status(500).json({ error: 'Failed to update leaver item' });
    }
  });

  // POST /api/staff/:staffId/leaver/items — add custom item
  app.post('/api/staff/:staffId/leaver/items', requireAuth, requireHrFeature, async (req, res) => {
    try {
      const { pool, schemaName } = await getPool(req.customerId!);
      const { category, label, isCritical } = req.body;
      if (!category || !label) return res.status(400).json({ error: 'category and label required' });
      if (!LEAVER_CATEGORIES.includes(category)) return res.status(400).json({ error: 'Invalid category' });

      const checklist = await pool.query(
        `SELECT id FROM "${schemaName}".leaver_checklists WHERE staff_id = $1 ORDER BY created_at DESC LIMIT 1`,
        [req.params.staffId]
      );
      if (!checklist.rows[0]) return res.status(404).json({ error: 'No active checklist' });

      const max = await pool.query(
        `SELECT COALESCE(MAX(display_order), 0) AS m FROM "${schemaName}".leaver_items WHERE checklist_id = $1 AND category = $2`,
        [checklist.rows[0].id, category]
      );
      const itemKey = `custom_${Date.now()}`;
      const inserted = await pool.query(
        `INSERT INTO "${schemaName}".leaver_items
           (checklist_id, item_key, label, category, is_critical, display_order)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
        [checklist.rows[0].id, itemKey, label, category, !!isCritical, Number(max.rows[0].m) + 1]
      );
      res.status(201).json(inserted.rows[0]);
    } catch (err: any) {
      logger.error('Leaver item add error:', err);
      res.status(500).json({ error: 'Failed to add item' });
    }
  });

  // DELETE /api/staff/:staffId/leaver/items/:itemId
  app.delete('/api/staff/:staffId/leaver/items/:itemId', requireAuth, requireHrFeature, async (req, res) => {
    try {
      const { pool, schemaName } = await getPool(req.customerId!);
      // Don't allow deleting auto items
      const check = await pool.query(
        `SELECT is_auto FROM "${schemaName}".leaver_items WHERE id = $1`, [req.params.itemId]
      );
      if (check.rows[0]?.is_auto) {
        return res.status(400).json({ error: 'Cannot delete system-automated item' });
      }
      await pool.query(`DELETE FROM "${schemaName}".leaver_items WHERE id = $1`, [req.params.itemId]);
      res.json({ success: true });
    } catch (err: any) {
      logger.error('Leaver item delete error:', err);
      res.status(500).json({ error: 'Failed to delete item' });
    }
  });

  // GET /api/staff/:staffId/leaver/equipment — included in main GET, but separate endpoint useful too
  // POST /api/staff/:staffId/leaver/equipment — add equipment row
  app.post('/api/staff/:staffId/leaver/equipment', requireAuth, requireHrFeature, async (req, res) => {
    try {
      const { pool, schemaName } = await getPool(req.customerId!);
      const { name, assetTag, serialNumber } = req.body;
      if (!name) return res.status(400).json({ error: 'name required' });
      const checklist = await pool.query(
        `SELECT id FROM "${schemaName}".leaver_checklists WHERE staff_id = $1 ORDER BY created_at DESC LIMIT 1`,
        [req.params.staffId]
      );
      if (!checklist.rows[0]) return res.status(404).json({ error: 'No active checklist' });
      const max = await pool.query(
        `SELECT COALESCE(MAX(display_order), 0) AS m FROM "${schemaName}".leaver_equipment WHERE checklist_id = $1`,
        [checklist.rows[0].id]
      );
      const inserted = await pool.query(
        `INSERT INTO "${schemaName}".leaver_equipment
           (checklist_id, name, asset_tag, serial_number, display_order)
         VALUES ($1,$2,$3,$4,$5) RETURNING *`,
        [checklist.rows[0].id, name, assetTag || null, serialNumber || null, Number(max.rows[0].m) + 1]
      );
      res.status(201).json(inserted.rows[0]);
    } catch (err: any) {
      logger.error('Leaver equipment add error:', err);
      res.status(500).json({ error: 'Failed to add equipment' });
    }
  });

  // PATCH /api/staff/:staffId/leaver/equipment/:eqId
  app.patch('/api/staff/:staffId/leaver/equipment/:eqId', requireAuth, requireHrFeature, async (req, res) => {
    try {
      const { pool, schemaName } = await getPool(req.customerId!);
      const { name, assetTag, serialNumber, returned, returnedOn, notes } = req.body;
      const updates: string[] = [];
      const values: any[] = [];
      let i = 1;
      const add = (col: string, val: any) => {
        if (val !== undefined) { updates.push(`${col} = $${i++}`); values.push(val === '' ? null : val); }
      };
      add('name', name); add('asset_tag', assetTag); add('serial_number', serialNumber);
      add('returned', returned); add('returned_on', returnedOn); add('notes', notes);
      if (returned === true && returnedOn === undefined) {
        updates.push(`returned_on = COALESCE(returned_on, CURRENT_DATE)`);
      }
      if (returned === false) {
        updates.push(`returned_on = NULL`);
      }
      if (!updates.length) return res.json({ success: true });
      values.push(req.params.eqId);
      const result = await pool.query(
        `UPDATE "${schemaName}".leaver_equipment SET ${updates.join(', ')} WHERE id = $${i} RETURNING *`,
        values
      );
      res.json(result.rows[0]);
    } catch (err: any) {
      logger.error('Leaver equipment update error:', err);
      res.status(500).json({ error: 'Failed to update equipment' });
    }
  });

  // DELETE /api/staff/:staffId/leaver/equipment/:eqId
  app.delete('/api/staff/:staffId/leaver/equipment/:eqId', requireAuth, requireHrFeature, async (req, res) => {
    try {
      const { pool, schemaName } = await getPool(req.customerId!);
      await pool.query(`DELETE FROM "${schemaName}".leaver_equipment WHERE id = $1`, [req.params.eqId]);
      res.json({ success: true });
    } catch (err: any) {
      logger.error('Leaver equipment delete error:', err);
      res.status(500).json({ error: 'Failed to delete equipment' });
    }
  });

  // GET + PUT /api/staff/:staffId/leaver/exit-interview
  app.put('/api/staff/:staffId/leaver/exit-interview', requireAuth, requireHrFeature, async (req, res) => {
    try {
      const { pool, schemaName } = await getPool(req.customerId!);
      const checklist = await pool.query(
        `SELECT id FROM "${schemaName}".leaver_checklists WHERE staff_id = $1 ORDER BY created_at DESC LIMIT 1`,
        [req.params.staffId]
      );
      if (!checklist.rows[0]) return res.status(404).json({ error: 'No checklist' });
      const cid = checklist.rows[0].id;
      const {
        reasonForLeaving, whatWorkedWell, whatCouldImprove,
        wouldRecommend, wouldRehire, additionalComments,
      } = req.body;
      const conductedBy = req.user?.username || 'unknown';
      const result = await pool.query(
        `INSERT INTO "${schemaName}".leaver_exit_interviews
           (checklist_id, reason_for_leaving, what_worked_well, what_could_improve,
            would_recommend, would_rehire, additional_comments, conducted_by, conducted_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW())
         ON CONFLICT (checklist_id) DO UPDATE SET
           reason_for_leaving = EXCLUDED.reason_for_leaving,
           what_worked_well = EXCLUDED.what_worked_well,
           what_could_improve = EXCLUDED.what_could_improve,
           would_recommend = EXCLUDED.would_recommend,
           would_rehire = EXCLUDED.would_rehire,
           additional_comments = EXCLUDED.additional_comments,
           conducted_by = EXCLUDED.conducted_by,
           conducted_at = NOW(),
           updated_at = NOW()
         RETURNING *`,
        [cid, reasonForLeaving || null, whatWorkedWell || null, whatCouldImprove || null,
         wouldRecommend || null, wouldRehire || null, additionalComments || null, conductedBy]
      );

      // Auto-tick the "exit_interview_completed" item if present
      await pool.query(
        `UPDATE "${schemaName}".leaver_items
         SET completed = TRUE, completed_at = NOW(), completed_by = $1
         WHERE checklist_id = $2 AND item_key = 'exit_interview_completed' AND completed = FALSE`,
        [conductedBy, cid]
      );

      res.json(result.rows[0]);
    } catch (err: any) {
      logger.error('Exit interview save error:', err);
      res.status(500).json({ error: 'Failed to save exit interview' });
    }
  });

  // POST /api/staff/:staffId/leaver/deactivate — gated on critical items, with override (admin only)
  app.post('/api/staff/:staffId/leaver/deactivate', requireAuth, requireAdmin, async (req, res) => {
    try {
      const { pool, schemaName } = await getPool(req.customerId!);
      const { overrideReason } = req.body;
      const actor = req.user?.username || 'unknown';

      const checklist = await pool.query(
        `SELECT id FROM "${schemaName}".leaver_checklists WHERE staff_id = $1 ORDER BY created_at DESC LIMIT 1`,
        [req.params.staffId]
      );
      if (!checklist.rows[0]) return res.status(404).json({ error: 'No active checklist' });
      const cid = checklist.rows[0].id;

      const crit = await pool.query(
        `SELECT id, label, completed FROM "${schemaName}".leaver_items
         WHERE checklist_id = $1 AND is_critical = TRUE`,
        [cid]
      );
      const eqUnreturned = await pool.query(
        `SELECT id FROM "${schemaName}".leaver_equipment WHERE checklist_id = $1 AND returned = FALSE`,
        [cid]
      );
      const outstanding = crit.rows.filter((r: any) => !r.completed).map((r: any) => r.label);
      const blocked = outstanding.length > 0 || (eqUnreturned.rowCount ?? 0) > 0;

      if (blocked && !overrideReason) {
        return res.status(400).json({
          error: 'Critical items incomplete',
          outstanding,
          unreturnedEquipment: eqUnreturned.rowCount,
        });
      }

      if (blocked && overrideReason) {
        await pool.query(
          `UPDATE "${schemaName}".leaver_checklists
           SET deactivation_override_reason = $1,
               deactivation_override_by = $2,
               deactivation_override_at = NOW()
           WHERE id = $3`,
          [overrideReason, actor, cid]
        );
        logger.warn(
          `[hr-audit] Leaver deactivation OVERRIDE for staff ${req.params.staffId} by ${actor}: ${overrideReason} — outstanding: ${outstanding.join(', ') || 'none'}, unreturned equipment: ${eqUnreturned.rowCount}`
        );
      }

      await pool.query(
        `UPDATE "${schemaName}".staff SET is_active = FALSE, updated_at = NOW() WHERE id = $1`,
        [req.params.staffId]
      );
      await pool.query(
        `UPDATE "${schemaName}".leaver_checklists SET completed_at = NOW(), updated_at = NOW() WHERE id = $1`,
        [cid]
      );

      logger.info(`[hr-audit] Leaver ${req.params.staffId} deactivated by ${actor}`);
      res.json({ success: true, overrideUsed: blocked });
    } catch (err: any) {
      logger.error('Leaver deactivate error:', err);
      res.status(500).json({ error: 'Failed to deactivate leaver' });
    }
  });

  // POST /api/staff/:staffId/archive
  app.post('/api/staff/:staffId/archive', requireAuth, requireHrFeature, async (req, res) => {
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
  app.get('/api/hr/leavers', requireAuth, requireHrFeature, async (req, res) => {
    try {
      const { pool, schemaName } = await getPool(req.customerId!);
      const result = await pool.query(
        `SELECT s.id, s.first_name, s.last_name, s.department, s.job_title,
                lc.last_day, lc.reason, lc.reason_code, lc.additional_detail, lc.created_at,
                lc.completed_at, lc.deactivation_override_reason,
                COUNT(li.id) AS total_items,
                COUNT(li.id) FILTER (WHERE li.completed = TRUE) AS completed_items,
                COUNT(li.id) FILTER (WHERE li.is_critical = TRUE) AS critical_items,
                COUNT(li.id) FILTER (WHERE li.is_critical = TRUE AND li.completed = TRUE) AS critical_done
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
        criticalComplete: Number(r.critical_items) === Number(r.critical_done),
      })));
    } catch (err: any) {
      logger.error('Leavers fetch error:', err);
      res.status(500).json({ error: 'Failed to fetch leavers' });
    }
  });

  // ===== Customer-level Leaver Template =====
  // GET /api/hr/leaver-template
  app.get('/api/hr/leaver-template', requireAuth, requireAdmin, async (req, res) => {
    try {
      const { pool, schemaName } = await getPool(req.customerId!);
      const tpl = await pool.query(
        `SELECT * FROM "${schemaName}".leaver_template_items ORDER BY kind, category, display_order`
      );
      if (tpl.rows.length === 0) {
        // Return computed defaults so the UI can show them
        const defaults: any[] = [];
        let order = 0;
        for (const cat of LEAVER_CATEGORIES) {
          for (const it of DEFAULT_TEMPLATE[cat]) {
            defaults.push({
              kind: 'checklist', category: cat, item_key: it.key, label: it.label,
              is_critical: !!it.is_critical, is_auto: !!it.is_auto,
              enabled: true, display_order: order++, isDefault: true,
            });
          }
        }
        DEFAULT_EQUIPMENT.forEach((name, i) =>
          defaults.push({
            kind: 'equipment', category: 'equipment', item_key: `default_eq_${i}`,
            label: name, is_critical: false, is_auto: false,
            enabled: true, display_order: i, isDefault: true,
          })
        );
        return res.json({ items: defaults, isCustom: false });
      }
      res.json({ items: tpl.rows, isCustom: true });
    } catch (err: any) {
      logger.error('Leaver template fetch error:', err);
      res.status(500).json({ error: 'Failed to fetch leaver template' });
    }
  });

  // PUT /api/hr/leaver-template — replace whole template
  app.put('/api/hr/leaver-template', requireAuth, requireAdmin, async (req, res) => {
    try {
      const { pool, schemaName } = await getPool(req.customerId!);
      const { items } = req.body as { items: any[] };
      if (!Array.isArray(items)) return res.status(400).json({ error: 'items array required' });

      await pool.query(`DELETE FROM "${schemaName}".leaver_template_items`);
      let order = 0;
      for (const it of items) {
        const kind = it.kind === 'equipment' ? 'equipment' : 'checklist';
        const category = LEAVER_CATEGORIES.includes(it.category) ? it.category : 'legal_payroll';
        const key = it.item_key || `tpl_${Date.now()}_${order}`;
        await pool.query(
          `INSERT INTO "${schemaName}".leaver_template_items
             (category, item_key, label, is_critical, is_auto, display_order, enabled, kind)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
           ON CONFLICT (kind, category, item_key) DO UPDATE SET
             label = EXCLUDED.label,
             is_critical = EXCLUDED.is_critical,
             is_auto = EXCLUDED.is_auto,
             display_order = EXCLUDED.display_order,
             enabled = EXCLUDED.enabled,
             updated_at = NOW()`,
          [category, key, it.label || 'Untitled',
           !!it.is_critical, !!it.is_auto, order++, it.enabled !== false, kind]
        );
      }
      res.json({ success: true });
    } catch (err: any) {
      logger.error('Leaver template save error:', err);
      res.status(500).json({ error: 'Failed to save leaver template' });
    }
  });

  // POST /api/hr/leaver-template/reset — wipe overrides; defaults will be used
  app.post('/api/hr/leaver-template/reset', requireAuth, requireAdmin, async (req, res) => {
    try {
      const { pool, schemaName } = await getPool(req.customerId!);
      await pool.query(`DELETE FROM "${schemaName}".leaver_template_items`);
      res.json({ success: true });
    } catch (err: any) {
      logger.error('Leaver template reset error:', err);
      res.status(500).json({ error: 'Failed to reset template' });
    }
  });
}
