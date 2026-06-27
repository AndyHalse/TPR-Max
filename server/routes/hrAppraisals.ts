import type { Express } from 'express';
import { requireAuth } from '../auth';
import { requireHrFeature, requireHrAdmin, recordHrAudit } from './hrMiddleware';
import { customerDbService } from '../customerDatabase';
import { logger } from '../utils/logger';

async function getPool(customerId: string) {
  const custDb = await customerDbService.getCustomerDatabase(customerId);
  const schemaName = customerDbService.generateSchemaName(customerId);
  const pool = (custDb as any).$client ?? (custDb as any).session?.client;
  return { pool, schemaName };
}

export function registerHrAppraisalRoutes(app: Express): void {

  // GET /api/staff/:staffId/appraisals — admin/hr_admin only
  app.get('/api/staff/:staffId/appraisals', requireAuth, requireHrFeature, requireHrAdmin, async (req, res) => {
    try {
      const { pool, schemaName } = await getPool(req.customerId!);
      const appraisals = await pool.query(
        `SELECT * FROM "${schemaName}".appraisals WHERE staff_id = $1 ORDER BY review_date DESC`,
        [req.params.staffId]
      );
      const ids = appraisals.rows.map((a: any) => a.id);
      let objectives: any[] = [];
      if (ids.length) {
        const objResult = await pool.query(
          `SELECT * FROM "${schemaName}".appraisal_objectives WHERE appraisal_id = ANY($1)`,
          [ids]
        );
        objectives = objResult.rows;
      }
      const result = appraisals.rows.map((a: any) => ({
        ...a,
        objectives: objectives.filter((o) => o.appraisal_id === a.id),
      }));
      res.json(result);
    } catch (err: any) {
      logger.error('Appraisals fetch error:', err);
      res.status(500).json({ error: 'Failed to fetch appraisals' });
    }
  });

  // POST /api/staff/:staffId/appraisals — HR admin only
  app.post('/api/staff/:staffId/appraisals', requireAuth, requireHrFeature, requireHrAdmin, async (req, res) => {
    try {
      const { pool, schemaName } = await getPool(req.customerId!);
      const { staffId } = req.params;
      const { reviewDate, reviewType = 'annual', conductedBy, overallRating, summaryNotes, nextReviewDate, objectives = [], documentUrl, documentName } = req.body;

      if (!reviewDate || !conductedBy) {
        return res.status(400).json({ error: 'reviewDate and conductedBy are required' });
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(reviewDate).slice(0, 10))) {
        return res.status(400).json({ error: 'reviewDate must be YYYY-MM-DD' });
      }
      if (nextReviewDate && !/^\d{4}-\d{2}-\d{2}$/.test(String(nextReviewDate).slice(0, 10))) {
        return res.status(400).json({ error: 'nextReviewDate must be YYYY-MM-DD' });
      }

      const appraisal = await pool.query(
        `INSERT INTO "${schemaName}".appraisals
          (staff_id, review_date, review_type, conducted_by, overall_rating, summary_notes, next_review_date, document_url, document_name)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
        [staffId, reviewDate, reviewType, conductedBy, overallRating || null, summaryNotes || null, nextReviewDate || null,
         documentUrl || null, documentName || null]
      );

      const appraisalId = appraisal.rows[0].id;
      const savedObjectives = [];
      for (const obj of objectives) {
        const o = await pool.query(
          `INSERT INTO "${schemaName}".appraisal_objectives (appraisal_id, description, target_date, status, notes)
           VALUES ($1,$2,$3,$4,$5) RETURNING *`,
          [appraisalId, obj.description, obj.targetDate || null, obj.status || 'in_progress', obj.notes || null]
        );
        savedObjectives.push(o.rows[0]);
      }

      await recordHrAudit(pool, schemaName, {
        entityType: 'appraisal', entityId: appraisalId, staffId,
        action: 'create', actor: req.user?.username || 'unknown',
        details: { reviewDate, reviewType, conductedBy, overallRating },
      });

      res.status(201).json({ ...appraisal.rows[0], objectives: savedObjectives });
    } catch (err: any) {
      logger.error('Appraisal create error:', err);
      res.status(500).json({ error: 'Failed to create appraisal' });
    }
  });

  // PUT /api/appraisals/:id — HR admin only
  app.put('/api/appraisals/:id', requireAuth, requireHrFeature, requireHrAdmin, async (req, res) => {
    try {
      const { pool, schemaName } = await getPool(req.customerId!);
      const { overallRating, summaryNotes, nextReviewDate, objectives } = req.body;

      if (nextReviewDate && !/^\d{4}-\d{2}-\d{2}$/.test(String(nextReviewDate).slice(0, 10))) {
        return res.status(400).json({ error: 'nextReviewDate must be YYYY-MM-DD' });
      }

      const result = await pool.query(
        `UPDATE "${schemaName}".appraisals
         SET overall_rating = $1, summary_notes = $2, next_review_date = $3
         WHERE id = $4 RETURNING *`,
        [overallRating || null, summaryNotes || null, nextReviewDate || null, req.params.id]
      );

      if (objectives) {
        await pool.query(`DELETE FROM "${schemaName}".appraisal_objectives WHERE appraisal_id = $1`, [req.params.id]);
        for (const obj of objectives) {
          await pool.query(
            `INSERT INTO "${schemaName}".appraisal_objectives (appraisal_id, description, target_date, status, notes)
             VALUES ($1,$2,$3,$4,$5)`,
            [req.params.id, obj.description, obj.targetDate || null, obj.status || 'in_progress', obj.notes || null]
          );
        }
      }

      await recordHrAudit(pool, schemaName, {
        entityType: 'appraisal', entityId: req.params.id,
        action: 'update', actor: req.user?.username || 'unknown',
        details: { overallRating, nextReviewDate },
      });

      res.json(result.rows[0]);
    } catch (err: any) {
      logger.error('Appraisal update error:', err);
      res.status(500).json({ error: 'Failed to update appraisal' });
    }
  });

  // GET /api/appraisals/due — admin/hr_admin only
  app.get('/api/appraisals/due', requireAuth, requireHrFeature, requireHrAdmin, async (req, res) => {
    try {
      const { pool, schemaName } = await getPool(req.customerId!);

      const result = await pool.query(
        `SELECT s.id, s.first_name, s.last_name, s.department, s.job_title,
                a.next_review_date, a.review_date AS last_review_date, a.review_type AS last_review_type
         FROM "${schemaName}".staff s
         LEFT JOIN "${schemaName}".appraisals a ON a.id = (
           SELECT id FROM "${schemaName}".appraisals
           WHERE staff_id = s.id ORDER BY review_date DESC LIMIT 1
         )
         WHERE s.is_active = TRUE
           AND (s.employment_status IS NULL OR s.employment_status NOT IN ('leaver','archived'))
           AND (a.next_review_date <= NOW() + INTERVAL '30 days' OR a.next_review_date IS NULL)
         ORDER BY a.next_review_date ASC NULLS FIRST`
      );

      res.json(result.rows);
    } catch (err: any) {
      logger.error('Appraisals due error:', err);
      res.status(500).json({ error: 'Failed to fetch appraisals due' });
    }
  });
}
