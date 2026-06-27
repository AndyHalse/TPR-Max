import type { Express } from 'express';
import { requireAuth } from '../auth';
import { requireHrFeature, requireHrAdmin, recordHrAudit } from './hrMiddleware';
import { customerDbService } from '../customerDatabase';
import { calculateBradfordFactor } from '../utils/bradfordFactor';
import { logger } from '../utils/logger';

async function getPool(customerId: string) {
  const custDb = await customerDbService.getCustomerDatabase(customerId);
  const schemaName = customerDbService.generateSchemaName(customerId);
  const pool = (custDb as any).$client ?? (custDb as any).session?.client;
  return { pool, schemaName };
}

export function registerHrAbsenceRoutes(app: Express): void {

  // GET /api/staff/:staffId/absences — admin/hr_admin only (special-category health data)
  app.get('/api/staff/:staffId/absences', requireAuth, requireHrFeature, requireHrAdmin, async (req, res) => {
    try {
      const { pool, schemaName } = await getPool(req.customerId!);
      const result = await pool.query(
        `SELECT * FROM "${schemaName}".absence_records WHERE staff_id = $1 ORDER BY start_date DESC`,
        [req.params.staffId]
      );
      const bf = calculateBradfordFactor(result.rows);
      res.json({ absences: result.rows, bradfordFactor: bf });
    } catch (err: any) {
      logger.error('Absence fetch error:', err);
      res.status(500).json({ error: 'Failed to fetch absences' });
    }
  });

  // POST /api/staff/:staffId/absences — record start of absence (HR admin only)
  app.post('/api/staff/:staffId/absences', requireAuth, requireHrFeature, requireHrAdmin, async (req, res) => {
    try {
      const { pool, schemaName } = await getPool(req.customerId!);
      const { staffId } = req.params;
      const { absenceType = 'sickness', startDate, reason, documentUrl, documentName } = req.body;

      if (!startDate) return res.status(400).json({ error: 'startDate is required' });
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(startDate).slice(0, 10))) {
        return res.status(400).json({ error: 'startDate must be YYYY-MM-DD' });
      }

      const result = await pool.query(
        `INSERT INTO "${schemaName}".absence_records (staff_id, absence_type, start_date, reason, document_url, document_name)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
        [staffId, absenceType, startDate, reason || null, documentUrl || null, documentName || null]
      );

      // Only flip to on_leave if currently active — never overwrite leaver/archived/other classifications
      await pool.query(
        `UPDATE "${schemaName}".staff SET employment_status = 'on_leave' WHERE id = $1 AND employment_status = 'active'`,
        [staffId]
      );

      await recordHrAudit(pool, schemaName, {
        entityType: 'absence', entityId: result.rows[0].id, staffId,
        action: 'create', actor: req.user?.username || 'unknown',
        details: { absenceType, startDate },
      });

      res.status(201).json(result.rows[0]);
    } catch (err: any) {
      logger.error('Absence create error:', err);
      res.status(500).json({ error: 'Failed to record absence' });
    }
  });

  // PUT /api/staff/:staffId/absences/:id/return — record return (HR admin only)
  app.put('/api/staff/:staffId/absences/:id/return', requireAuth, requireHrFeature, requireHrAdmin, async (req, res) => {
    try {
      const { pool, schemaName } = await getPool(req.customerId!);
      const { staffId, id } = req.params;
      const { returnDate, daysLost, returnToWorkNotes, returnToWorkBy } = req.body;

      if (!returnDate) return res.status(400).json({ error: 'returnDate is required' });
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(returnDate).slice(0, 10))) {
        return res.status(400).json({ error: 'returnDate must be YYYY-MM-DD' });
      }

      const absResult = await pool.query(
        `SELECT * FROM "${schemaName}".absence_records WHERE id = $1 AND staff_id = $2`,
        [id, staffId]
      );
      const absence = absResult.rows[0];
      if (!absence) return res.status(404).json({ error: 'Absence record not found' });

      // Calculate bradford factor at this point
      const allAbsences = await pool.query(
        `SELECT * FROM "${schemaName}".absence_records WHERE staff_id = $1`,
        [staffId]
      );
      const bf = calculateBradfordFactor([...allAbsences.rows.filter((a: any) => a.id !== id), { ...absence, daysLost, returnDate }]);

      const startDate = new Date(absence.start_date);
      const returnDt = new Date(returnDate);
      const daysBetween = Math.ceil((returnDt.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
      const fitNoteRequired = daysBetween > 7;

      const result = await pool.query(
        `UPDATE "${schemaName}".absence_records
         SET return_date = $1, days_lost = $2, return_to_work_notes = $3,
             return_to_work_by = $4, return_to_work_completed = TRUE,
             return_to_work_date = $1, fit_note_required = $5,
             bradford_score_at_record = $6, updated_at = NOW()
         WHERE id = $7 RETURNING *`,
        [returnDate, daysLost || daysBetween, returnToWorkNotes || null,
         returnToWorkBy || null, fitNoteRequired, bf.score, id]
      );

      // Only revert to active if on_leave AND no other open absence remains
      await pool.query(
        `UPDATE "${schemaName}".staff
         SET employment_status = 'active'
         WHERE id = $1
           AND employment_status = 'on_leave'
           AND NOT EXISTS (
             SELECT 1 FROM "${schemaName}".absence_records
             WHERE staff_id = $1 AND return_date IS NULL AND id <> $2
           )`,
        [staffId, id]
      );

      await recordHrAudit(pool, schemaName, {
        entityType: 'absence', entityId: id, staffId,
        action: 'return', actor: req.user?.username || 'unknown',
        details: { returnDate, daysLost: daysLost || daysBetween, fitNoteRequired },
      });

      res.json({ absence: result.rows[0], bradfordFactor: bf, fitNoteRequired });
    } catch (err: any) {
      logger.error('Absence return error:', err);
      res.status(500).json({ error: 'Failed to record return to work' });
    }
  });

  // GET /api/absences/overview — admin/hr_admin only
  app.get('/api/absences/overview', requireAuth, requireHrFeature, requireHrAdmin, async (req, res) => {
    try {
      const { pool, schemaName } = await getPool(req.customerId!);

      const [absences, staff] = await Promise.all([
        pool.query(`SELECT * FROM "${schemaName}".absence_records ORDER BY start_date DESC`),
        pool.query(`SELECT id, first_name, last_name, department FROM "${schemaName}".staff WHERE is_active = true`),
      ]);

      const overview = staff.rows.map((s: any) => {
        const staffAbsences = absences.rows.filter((a: any) => a.staff_id === s.id);
        const currentAbsence = staffAbsences.find((a: any) => !a.return_date);
        const bf = calculateBradfordFactor(staffAbsences);
        return {
          staff: s,
          bradfordFactor: bf,
          currentlyAbsent: !!currentAbsence,
          totalSpellsThisYear: bf.spells,
          totalDaysThisYear: bf.totalDays,
        };
      }).sort((a, b) => b.bradfordFactor.score - a.bradfordFactor.score);

      const currentlyAbsent = overview.filter((o) => o.currentlyAbsent).length;
      const avgBradford = overview.length
        ? Math.round(overview.reduce((s, o) => s + o.bradfordFactor.score, 0) / overview.length)
        : 0;
      // Sum the rolling-365-day totals from the per-staff overview (consistent with Bradford rows)
      const totalDaysYTD = overview.reduce((s, o) => s + Number(o.totalDaysThisYear || 0), 0);

      res.json({ overview, summary: { currentlyAbsent, avgBradford, totalDaysYTD } });
    } catch (err: any) {
      logger.error('Absence overview error:', err);
      res.status(500).json({ error: 'Failed to fetch absence overview' });
    }
  });
}
