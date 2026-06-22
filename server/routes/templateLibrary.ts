import type { Express } from 'express';
import { logger } from '../utils/logger';
import { requireAuth } from '../auth';
import { customerDbService } from '../customerDatabase';
import { pool } from '../db';
import * as isolatedSchema from '../isolatedSchema';
import { eq } from 'drizzle-orm';
import { templateLibrarySeeds } from '../data/templateLibrarySeeds';
import { getScopedDb, withSiteId, SiteContextError } from '../siteScope';

async function ensureLibraryTemplatesTable(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS library_templates (
      id SERIAL PRIMARY KEY,
      category TEXT NOT NULL,
      industry TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      content JSONB NOT NULL,
      regulatory_basis TEXT[] DEFAULT '{}',
      tags TEXT[] DEFAULT '{}',
      difficulty TEXT DEFAULT 'beginner',
      estimated_time TEXT,
      active BOOLEAN DEFAULT true,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  // Seed templates — idempotent via ON CONFLICT DO NOTHING on title+category
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS library_templates_title_category_idx
    ON library_templates (title, category)
  `);

  for (const tpl of templateLibrarySeeds) {
    await pool.query(
      `INSERT INTO library_templates
         (category, industry, title, description, content, regulatory_basis, tags, difficulty, estimated_time)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (title, category) DO NOTHING`,
      [
        tpl.category,
        tpl.industry,
        tpl.title,
        tpl.description,
        JSON.stringify(tpl.content),
        tpl.regulatoryBasis,
        tpl.tags,
        tpl.difficulty,
        tpl.estimatedTime,
      ]
    );
  }

  logger.info(`✅ Library templates table ready (${templateLibrarySeeds.length} templates seeded)`);
}

export async function registerTemplateLibraryRoutes(app: Express): Promise<void> {
  await ensureLibraryTemplatesTable();

  // ─── GET /api/template-library ───────────────────────────────────────────────
  // Public read — no auth required to browse
  app.get('/api/template-library', async (req, res) => {
    try {
      const { category, industry, q } = req.query as Record<string, string>;

      let query = `SELECT * FROM library_templates WHERE active = true`;
      const params: any[] = [];

      if (category) {
        params.push(category);
        query += ` AND category = $${params.length}`;
      }
      if (industry) {
        params.push(industry);
        query += ` AND industry = $${params.length}`;
      }
      if (q) {
        params.push(`%${q.toLowerCase()}%`);
        query += ` AND (LOWER(title) LIKE $${params.length} OR LOWER(description) LIKE $${params.length} OR EXISTS (SELECT 1 FROM unnest(tags) t WHERE LOWER(t) LIKE $${params.length}))`;
      }

      query += ` ORDER BY category, title`;

      const result = await pool.query(query, params);
      res.json(result.rows);
    } catch (error) {
      logger.error('GET /api/template-library error:', error);
      res.status(500).json({ error: 'Failed to fetch templates' });
    }
  });

  // ─── GET /api/template-library/:id ───────────────────────────────────────────
  app.get('/api/template-library/:id', async (req, res) => {
    try {
      const result = await pool.query(
        `SELECT * FROM library_templates WHERE id = $1 AND active = true`,
        [req.params.id]
      );
      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Template not found' });
      }
      res.json(result.rows[0]);
    } catch (error) {
      logger.error('GET /api/template-library/:id error:', error);
      res.status(500).json({ error: 'Failed to fetch template' });
    }
  });

  // ─── POST /api/template-library/:id/import ───────────────────────────────────
  // Authenticated — creates a draft record in the customer's schema
  app.post('/api/template-library/:id/import', requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const customerId = user?.customerId;
      if (!customerId) {
        return res.status(401).json({ error: 'Unauthenticated' });
      }

      // Fetch the template from the platform DB
      const tplResult = await pool.query(
        `SELECT * FROM library_templates WHERE id = $1 AND active = true`,
        [req.params.id]
      );
      if (tplResult.rows.length === 0) {
        return res.status(404).json({ error: 'Template not found' });
      }
      const template = tplResult.rows[0];
      const content = typeof template.content === 'string'
        ? JSON.parse(template.content)
        : template.content;

      const { db: custDb, siteId } = await getScopedDb(req);

      // All template types are imported as RA Builder assessments (the primary
      // document system in this platform) with an appropriate raType.
      const raTypeMap: Record<string, string> = {
        induction: 'induction',
        rams: 'rams',
        risk_assessment: 'general',
      };
      const raType = raTypeMap[template.category] ?? 'general';

      // Build notes from template content
      let notes = `Imported from template library: ${template.title}\n`;
      notes += `Industry: ${template.industry} | Regulatory basis: ${(template.regulatory_basis || []).join(', ')}\n\n`;
      if (template.category === 'induction') {
        notes += `Scope: ${content.welcomeMessage || ''}\n`;
        if (content.sections?.length) {
          notes += `\nSections:\n`;
          content.sections.forEach((s: any, i: number) => {
            notes += `${i + 1}. ${s.title}: ${s.body}\n`;
          });
        }
      } else if (template.category === 'rams') {
        notes += `Scope: ${content.scope || ''}\n`;
        if (content.emergencyProcedure) {
          notes += `\nEmergency Procedure: ${content.emergencyProcedure}\n`;
        }
        if (content.supervisorResponsibilities) {
          notes += `\nSupervisor Responsibilities: ${content.supervisorResponsibilities}\n`;
        }
        if (content.ppe?.length) {
          notes += `\nRequired PPE: ${content.ppe.join(', ')}\n`;
        }
      } else {
        notes += `Location: ${content.location || '[To be completed]'}\n`;
      }

      // Insert the RA Builder assessment (draft) — stamp siteId for enterprise.
      const [newAssessment] = await custDb
        .insert(isolatedSchema.raBuilderAssessments)
        .values(withSiteId(siteId, {
          title: `[DRAFT] ${template.title}`,
          raType,
          status: 'draft',
          taskDescription: notes,
          preparedBy: user.name || user.username || 'Imported',
          assessmentDate: new Date().toISOString().split('T')[0],
        }))
        .returning();

      // For RAMS and RA templates — also create the hazard records
      const hazards = content.hazards ?? [];
      if (hazards.length > 0 && (template.category === 'rams' || template.category === 'risk_assessment')) {
        for (let i = 0; i < hazards.length; i++) {
          const h = hazards[i];
          const likelihood = Number(h.likelihood) || 3;
          const severity = Number(h.severity) || 3;
          await custDb.insert(isolatedSchema.raBuilderHazards).values({
            assessmentId: newAssessment.id,
            hazardDescription: h.hazard || h.description || '',
            affectedPersons: h.whoMightBeHarmed || '',
            existingControls: h.existingControls || h.controls || '',
            likelihood,
            severity,
            riskRating: likelihood * severity,
            additionalControls: h.additionalControls || '',
            residualLikelihood: Math.max(1, likelihood - 1),
            residualSeverity: severity,
            residualRiskRating: Math.max(1, likelihood - 1) * severity,
            sortOrder: i,
          });
        }
      }

      logger.info(`Template "${template.title}" imported by user ${user.username} for customer ${customerId}`);

      res.status(201).json({
        id: newAssessment.id,
        title: newAssessment.title,
        redirectUrl: '/ra-builder',
        message: `"${template.title}" imported as a draft. Open the RA Builder to customise it.`,
      });
    } catch (error) {
      logger.error('POST /api/template-library/:id/import error:', error);
      res.status(500).json({ error: 'Failed to import template' });
    }
  });
}
