import type { Express } from 'express';
import { requireAuth } from '../auth';
import { customerDbService } from '../customerDatabase';
import { simpleDatabaseService } from '../simpleDatabaseService';
import { databaseService } from '../databaseService';
import { logger } from '../utils/logger';
import * as isolatedSchema from '../isolatedSchema';
import { eq, and, desc, asc } from 'drizzle-orm';
import { AiModelManager } from '../managers/AiModelManager';
import { ResultUtils } from '../utils/result';
import { db } from '../db';
import { ramsDocuments as sharedRamsDocuments } from '@shared/schema';
import { getScopedDb, scopedWhere, withSiteId, SiteContextError } from '../siteScope';

const requireRaBuilderFeature = async (req: any, res: any, next: any) => {
  try {
    const context = simpleDatabaseService.createCustomerContext(req.user!.username, req.customerId);
    const settings = await simpleDatabaseService.getCompanySettings(context);
    if (!settings?.featureRaBuilder) {
      return res.status(403).json({ error: 'Risk Assessment Builder is not enabled for your account.' });
    }
    next();
  } catch (error) {
    next(error);
  }
};

export function registerRaBuilderRoutes(app: Express): void {
  app.use('/api/ra-builder', requireAuth, requireRaBuilderFeature);

  // ── Assessments ────────────────────────────────────────────────────────────

  app.get('/api/ra-builder/assessments', requireAuth, async (req, res) => {
    try {
      const { db: custDb, siteId, siteContext } = await getScopedDb(req);
      const rows = await custDb
        .select()
        .from(isolatedSchema.raBuilderAssessments)
        .where(scopedWhere(siteContext, isolatedSchema.raBuilderAssessments))
        .orderBy(desc(isolatedSchema.raBuilderAssessments.updatedAt));
      // Fetch all hazards in one query and group by assessmentId so list cards
      // can show the hazard count and highest risk rating without an N+1 load.
      const allHazards = await custDb
        .select()
        .from(isolatedSchema.raBuilderHazards)
        .orderBy(asc(isolatedSchema.raBuilderHazards.sortOrder));
      const hazardsByAssessment: Record<string, typeof allHazards> = {};
      for (const h of allHazards) {
        if (!hazardsByAssessment[h.assessmentId]) hazardsByAssessment[h.assessmentId] = [];
        hazardsByAssessment[h.assessmentId].push(h);
      }
      res.json(rows.map((r) => ({ ...r, hazards: hazardsByAssessment[r.id] ?? [] })));
    } catch (error) {
      logger.error('GET /api/ra-builder/assessments', error);
      res.status(500).json({ error: 'Failed to fetch assessments' });
    }
  });

  app.post('/api/ra-builder/assessments', requireAuth, async (req, res) => {
    try {
      const { db: custDb, siteId } = await getScopedDb(req);
      const parsed = isolatedSchema.insertRaBuilderAssessmentSchema.parse(req.body);
      const [row] = await custDb
        .insert(isolatedSchema.raBuilderAssessments)
        .values(withSiteId(siteId, { ...parsed, typeMetadata: parsed.typeMetadata || '{}' }))
        .returning();
      res.status(201).json(row);
    } catch (err) {
      if (err instanceof SiteContextError) return res.status(err.statusCode).json({ error: err.message });
      logger.error('POST /api/ra-builder/assessments', err);
      res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to create assessment' });
    }
  });

  app.get('/api/ra-builder/assessments/:id', requireAuth, async (req, res) => {
    try {
      const { db: custDb, siteContext } = await getScopedDb(req);
      const { id } = req.params;
      const [assessment] = await custDb
        .select()
        .from(isolatedSchema.raBuilderAssessments)
        .where(and(eq(isolatedSchema.raBuilderAssessments.id, id), scopedWhere(siteContext, isolatedSchema.raBuilderAssessments)));
      if (!assessment) return res.status(404).json({ error: 'Assessment not found' });
      const hazards = await custDb
        .select()
        .from(isolatedSchema.raBuilderHazards)
        .where(eq(isolatedSchema.raBuilderHazards.assessmentId, id))
        .orderBy(asc(isolatedSchema.raBuilderHazards.sortOrder));
      res.json({ ...assessment, hazards });
    } catch (error) {
      logger.error('GET /api/ra-builder/assessments/:id', error);
      res.status(500).json({ error: 'Failed to fetch assessment' });
    }
  });

  app.put('/api/ra-builder/assessments/:id', requireAuth, async (req, res) => {
    try {
      const { db: custDb, siteContext } = await getScopedDb(req);
      const { id } = req.params;
      const parsed = isolatedSchema.insertRaBuilderAssessmentSchema.partial().parse(req.body);

      // Fix 3: keep the shared RAMS document in step with the assessment's status.
      // When the status dropdown changes, reflect that in the register immediately.
      if (parsed.status !== undefined) {
        const [existing] = await custDb
          .select()
          .from(isolatedSchema.raBuilderAssessments)
          .where(and(eq(isolatedSchema.raBuilderAssessments.id, id), scopedWhere(siteContext, isolatedSchema.raBuilderAssessments)));
        if (existing?.linkedRamsDocumentId) {
          const active = parsed.status === 'approved';
          await db
            .update(sharedRamsDocuments)
            .set({ isActive: active, status: active ? 'approved' : 'expired' })
            .where(and(
              eq(sharedRamsDocuments.id, existing.linkedRamsDocumentId),
              eq(sharedRamsDocuments.customerId, req.customerId!),
            ));
        }
      }

      const [row] = await custDb
        .update(isolatedSchema.raBuilderAssessments)
        .set({ ...parsed, updatedAt: new Date() })
        .where(and(eq(isolatedSchema.raBuilderAssessments.id, id), scopedWhere(siteContext, isolatedSchema.raBuilderAssessments)))
        .returning();
      if (!row) return res.status(404).json({ error: 'Assessment not found' });
      res.json(row);
    } catch (error) {
      logger.error('PUT /api/ra-builder/assessments/:id', error);
      res.status(400).json({ error: error instanceof Error ? error.message : 'Failed to update assessment' });
    }
  });

  app.delete('/api/ra-builder/assessments/:id', requireAuth, async (req, res) => {
    try {
      const { db: custDb, siteContext } = await getScopedDb(req);
      const { id } = req.params;

      // If this assessment was published to RAMS, remove the linked document
      // first so the register doesn't keep a dead link to a deleted assessment.
      const [existing] = await custDb
        .select()
        .from(isolatedSchema.raBuilderAssessments)
        .where(and(eq(isolatedSchema.raBuilderAssessments.id, id), scopedWhere(siteContext, isolatedSchema.raBuilderAssessments)));

      if (existing?.linkedRamsDocumentId) {
        // Fix 1: doc lives in the shared table, not the isolated one
        await db
          .delete(sharedRamsDocuments)
          .where(and(
            eq(sharedRamsDocuments.id, existing.linkedRamsDocumentId),
            eq(sharedRamsDocuments.customerId, req.customerId!),
          ));
      }

      await custDb
        .delete(isolatedSchema.raBuilderAssessments)
        .where(and(eq(isolatedSchema.raBuilderAssessments.id, id), scopedWhere(siteContext, isolatedSchema.raBuilderAssessments)));
      res.json({ success: true });
    } catch (error) {
      logger.error('DELETE /api/ra-builder/assessments/:id', error);
      res.status(500).json({ error: 'Failed to delete assessment' });
    }
  });

  app.post('/api/ra-builder/assessments/:id/approve', requireAuth, async (req, res) => {
    try {
      const { db: custDb, siteContext } = await getScopedDb(req);
      const { id } = req.params;

      const [assessment] = await custDb
        .select()
        .from(isolatedSchema.raBuilderAssessments)
        .where(and(eq(isolatedSchema.raBuilderAssessments.id, id), scopedWhere(siteContext, isolatedSchema.raBuilderAssessments)));
      if (!assessment) return res.status(404).json({ error: 'Assessment not found' });

      // Fix 4: idempotent approve — if already published, re-affirm and return.
      if (assessment.linkedRamsDocumentId) {
        await db
          .update(sharedRamsDocuments)
          .set({ isActive: true, status: 'approved' })
          .where(and(
            eq(sharedRamsDocuments.id, assessment.linkedRamsDocumentId),
            eq(sharedRamsDocuments.customerId, req.customerId!),
          ));
        const [reaffirmed] = await custDb
          .update(isolatedSchema.raBuilderAssessments)
          .set({ status: 'approved', updatedAt: new Date() })
          .where(and(eq(isolatedSchema.raBuilderAssessments.id, id), scopedWhere(siteContext, isolatedSchema.raBuilderAssessments)))
          .returning();
        return res.json(reaffirmed);
      }

      // Fix 2: block publishing an assessment with no hazards.
      const hazards = await custDb
        .select()
        .from(isolatedSchema.raBuilderHazards)
        .where(eq(isolatedSchema.raBuilderHazards.assessmentId, id));
      if (hazards.length === 0) {
        return res.status(400).json({ error: 'Add at least one hazard before publishing this assessment to the RAMS library.' });
      }

      // Create expiry date — nextReviewDate or 12 months from now
      let expiryDate: Date;
      if (assessment.nextReviewDate) {
        const parsed = new Date(assessment.nextReviewDate);
        expiryDate = isNaN(parsed.getTime()) ? new Date(Date.now() + 365 * 24 * 60 * 60 * 1000) : parsed;
      } else {
        expiryDate = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
      }

      // Fix 1: insert into the shared table that the RAMS register reads.
      const ramsIdRef = 'RA-' + id.substring(0, 8).toUpperCase();
      const [ramsDoc] = await db
        .insert(sharedRamsDocuments)
        .values({
          customerId: req.customerId!,
          ramsIdRef,
          documentName: `${assessment.title} (RA Builder)`,
          documentUrl: `/ra-builder?open=${id}`,
          expiryDate,
          status: 'approved',
          isActive: true,
        })
        .returning();

      // Update assessment — preserve manually-entered approver name if already set
      const [updated] = await custDb
        .update(isolatedSchema.raBuilderAssessments)
        .set({
          status: 'approved',
          approvedBy: assessment.approvedBy?.trim() ? assessment.approvedBy : req.user!.username,
          linkedRamsDocumentId: ramsDoc.id,
          updatedAt: new Date(),
        })
        .where(and(eq(isolatedSchema.raBuilderAssessments.id, id), scopedWhere(siteContext, isolatedSchema.raBuilderAssessments)))
        .returning();

      res.json(updated);
    } catch (error) {
      logger.error('POST /api/ra-builder/assessments/:id/approve', error);
      res.status(500).json({ error: 'Failed to approve assessment' });
    }
  });

  app.post('/api/ra-builder/assessments/:id/archive', requireAuth, async (req, res) => {
    try {
      const { db: custDb, siteContext } = await getScopedDb(req);
      const { id } = req.params;

      // Fix 3: deactivate the linked shared RAMS doc so it drops out of the register.
      const [existing] = await custDb
        .select()
        .from(isolatedSchema.raBuilderAssessments)
        .where(and(eq(isolatedSchema.raBuilderAssessments.id, id), scopedWhere(siteContext, isolatedSchema.raBuilderAssessments)));
      if (existing?.linkedRamsDocumentId) {
        await db
          .update(sharedRamsDocuments)
          .set({ isActive: false, status: 'expired' })
          .where(and(
            eq(sharedRamsDocuments.id, existing.linkedRamsDocumentId),
            eq(sharedRamsDocuments.customerId, req.customerId!),
          ));
      }

      const [row] = await custDb
        .update(isolatedSchema.raBuilderAssessments)
        .set({ status: 'archived', updatedAt: new Date() })
        .where(and(eq(isolatedSchema.raBuilderAssessments.id, id), scopedWhere(siteContext, isolatedSchema.raBuilderAssessments)))
        .returning();
      if (!row) return res.status(404).json({ error: 'Assessment not found' });
      res.json(row);
    } catch (error) {
      logger.error('POST /api/ra-builder/assessments/:id/archive', error);
      res.status(500).json({ error: 'Failed to archive assessment' });
    }
  });

  // ── Hazards ────────────────────────────────────────────────────────────────

  app.get('/api/ra-builder/assessments/:id/hazards', requireAuth, async (req, res) => {
    try {
      const { db: custDb, siteContext } = await getScopedDb(req);
      const { id } = req.params;
      const [parentAssessment] = await custDb.select().from(isolatedSchema.raBuilderAssessments)
        .where(and(eq(isolatedSchema.raBuilderAssessments.id, id), scopedWhere(siteContext, isolatedSchema.raBuilderAssessments)));
      if (!parentAssessment) return res.status(404).json({ error: 'Assessment not found' });
      const rows = await custDb
        .select()
        .from(isolatedSchema.raBuilderHazards)
        .where(eq(isolatedSchema.raBuilderHazards.assessmentId, id))
        .orderBy(asc(isolatedSchema.raBuilderHazards.sortOrder));
      res.json(rows);
    } catch (error) {
      logger.error('GET /api/ra-builder/assessments/:id/hazards', error);
      res.status(500).json({ error: 'Failed to fetch hazards' });
    }
  });

  app.post('/api/ra-builder/assessments/:id/hazards', requireAuth, async (req, res) => {
    try {
      const { db: custDb, siteContext } = await getScopedDb(req);
      const { id } = req.params;
      const [parentAssessment] = await custDb.select().from(isolatedSchema.raBuilderAssessments)
        .where(and(eq(isolatedSchema.raBuilderAssessments.id, id), scopedWhere(siteContext, isolatedSchema.raBuilderAssessments)));
      if (!parentAssessment) return res.status(404).json({ error: 'Assessment not found' });
      const body = { ...req.body, assessmentId: id };
      const likelihood = Number(body.likelihood) || 3;
      const severity = Number(body.severity) || 3;
      const residualLikelihood = Number(body.residualLikelihood) || 2;
      const residualSeverity = Number(body.residualSeverity) || 2;
      const parsed = isolatedSchema.insertRaBuilderHazardSchema.parse({
        ...body,
        likelihood,
        severity,
        riskRating: likelihood * severity,
        residualLikelihood,
        residualSeverity,
        residualRiskRating: residualLikelihood * residualSeverity,
      });
      const [row] = await custDb
        .insert(isolatedSchema.raBuilderHazards)
        .values(parsed)
        .returning();
      res.status(201).json(row);
    } catch (error) {
      logger.error('POST /api/ra-builder/assessments/:id/hazards', error);
      res.status(400).json({ error: error instanceof Error ? error.message : 'Failed to add hazard' });
    }
  });

  app.put('/api/ra-builder/assessments/:id/hazards/:hazardId', requireAuth, async (req, res) => {
    try {
      const { db: custDb, siteContext } = await getScopedDb(req);
      const { id, hazardId } = req.params;
      const [parentAssessment] = await custDb.select().from(isolatedSchema.raBuilderAssessments)
        .where(and(eq(isolatedSchema.raBuilderAssessments.id, id), scopedWhere(siteContext, isolatedSchema.raBuilderAssessments)));
      if (!parentAssessment) return res.status(404).json({ error: 'Assessment not found' });
      const body = req.body;
      const updates: any = { ...body };

      const hasLikelihood = body.likelihood !== undefined;
      const hasSeverity = body.severity !== undefined;
      const hasResidualLikelihood = body.residualLikelihood !== undefined;
      const hasResidualSeverity = body.residualSeverity !== undefined;

      // Recalculate ratings any time at least one factor of a pair arrives
      const needsRating = hasLikelihood || hasSeverity;
      const needsResidualRating = hasResidualLikelihood || hasResidualSeverity;

      if (needsRating || needsResidualRating) {
        const [existing] = await custDb
          .select()
          .from(isolatedSchema.raBuilderHazards)
          .where(and(eq(isolatedSchema.raBuilderHazards.id, hazardId), eq(isolatedSchema.raBuilderHazards.assessmentId, id)));
        if (!existing) return res.status(404).json({ error: 'Hazard not found' });

        if (needsRating) {
          const lk = hasLikelihood ? Number(body.likelihood) : (existing.likelihood ?? 1);
          const sv = hasSeverity   ? Number(body.severity)   : (existing.severity   ?? 1);
          updates.likelihood  = lk;
          updates.severity    = sv;
          updates.riskRating  = lk * sv;
        }
        if (needsResidualRating) {
          const rl = hasResidualLikelihood ? Number(body.residualLikelihood) : (existing.residualLikelihood ?? 1);
          const rs = hasResidualSeverity   ? Number(body.residualSeverity)   : (existing.residualSeverity   ?? 1);
          updates.residualLikelihood  = rl;
          updates.residualSeverity    = rs;
          updates.residualRiskRating  = rl * rs;
        }
      }

      const parsed = isolatedSchema.insertRaBuilderHazardSchema.partial().parse(updates);
      const [row] = await custDb
        .update(isolatedSchema.raBuilderHazards)
        .set(parsed)
        .where(and(eq(isolatedSchema.raBuilderHazards.id, hazardId), eq(isolatedSchema.raBuilderHazards.assessmentId, id)))
        .returning();
      if (!row) return res.status(404).json({ error: 'Hazard not found' });
      res.json(row);
    } catch (error) {
      logger.error('PUT /api/ra-builder/assessments/:id/hazards/:hazardId', error);
      res.status(400).json({ error: error instanceof Error ? error.message : 'Failed to update hazard' });
    }
  });

  app.delete('/api/ra-builder/assessments/:id/hazards/:hazardId', requireAuth, async (req, res) => {
    try {
      const { db: custDb, siteContext } = await getScopedDb(req);
      const { id, hazardId } = req.params;
      const [parentAssessment] = await custDb.select().from(isolatedSchema.raBuilderAssessments)
        .where(and(eq(isolatedSchema.raBuilderAssessments.id, id), scopedWhere(siteContext, isolatedSchema.raBuilderAssessments)));
      if (!parentAssessment) return res.status(404).json({ error: 'Assessment not found' });
      await custDb
        .delete(isolatedSchema.raBuilderHazards)
        .where(and(eq(isolatedSchema.raBuilderHazards.id, hazardId), eq(isolatedSchema.raBuilderHazards.assessmentId, id)));
      res.json({ success: true });
    } catch (error) {
      logger.error('DELETE /api/ra-builder/assessments/:id/hazards/:hazardId', error);
      res.status(500).json({ error: 'Failed to delete hazard' });
    }
  });

  app.post('/api/ra-builder/assessments/:id/hazards/reorder', requireAuth, async (req, res) => {
    try {
      const { db: custDb, siteContext } = await getScopedDb(req);
      const { id } = req.params;
      const [parentAssessment] = await custDb.select().from(isolatedSchema.raBuilderAssessments)
        .where(and(eq(isolatedSchema.raBuilderAssessments.id, id), scopedWhere(siteContext, isolatedSchema.raBuilderAssessments)));
      if (!parentAssessment) return res.status(404).json({ error: 'Assessment not found' });
      const items: { id: string; sortOrder: number }[] = req.body;
      await Promise.all(
        items.map(({ id: hazardId, sortOrder }) =>
          custDb
            .update(isolatedSchema.raBuilderHazards)
            .set({ sortOrder })
            .where(and(eq(isolatedSchema.raBuilderHazards.id, hazardId), eq(isolatedSchema.raBuilderHazards.assessmentId, id)))
        )
      );
      res.json({ success: true });
    } catch (error) {
      logger.error('POST /api/ra-builder/assessments/:id/hazards/reorder', error);
      res.status(500).json({ error: 'Failed to reorder hazards' });
    }
  });

  // ── AI Suggest Controls ────────────────────────────────────────────────────

  app.post('/api/ra-builder/suggest-controls', requireAuth, async (req, res) => {
    try {
      const { raType, hazardDescription, taskDescription, existingControls } = req.body;
      if (!hazardDescription) {
        return res.status(400).json({ error: 'hazardDescription is required' });
      }

      if (!req.customerId) {
        return res.status(401).json({ error: 'Customer context not found' });
      }

      const { decryptData } = await import('../utils/encryption');
      const context = { customerId: req.customerId };
      const apiKeys = await databaseService.getCustomerApiKeys(context);
      const claudeKeyRow = apiKeys.find((k: any) => k.serviceType === 'claude' && k.status === 'active');

      if (!claudeKeyRow) {
        return res.status(200).json({ error: 'no_api_key', message: 'No Claude API key configured in Settings > AI' });
      }

      const claudeApiKey = decryptData(
        claudeKeyRow.encryptedKey,
        claudeKeyRow.initializationVector,
        claudeKeyRow.authTag || ''
      );

      const combinedPrompt = `You are a UK Health & Safety compliance expert. Given a hazard description and task context, suggest practical control measures based on the hierarchy of controls: Elimination, Substitution, Engineering Controls, Administrative Controls, PPE. Return ONLY a JSON array of control measure strings. No markdown, no explanation, no numbering. Return 4–6 specific, practical suggestions.

Assessment type: ${raType || 'general'}
Task: ${taskDescription || 'Not specified'}
Hazard: ${hazardDescription}
Existing controls already in place: ${existingControls || 'None stated'}
Suggest additional control measures.`;

      const aiManager = new AiModelManager();
      const result = await aiManager.callClaude(combinedPrompt, 'claude-sonnet-4-6', {
        claudeApiKey,
        maxTokens: 512,
      });

      if (!ResultUtils.isSuccess(result)) {
        const errMsg = result.error?.message || 'AI suggestion failed';
        logger.error('Claude suggest-controls failed:', errMsg);
        return res.status(200).json({ error: 'ai_failed', message: errMsg });
      }

      // Strip markdown fences if present
      const rawContent = result.data || '[]';
      const cleaned = rawContent.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      let suggestions: string[] = [];
      try {
        suggestions = JSON.parse(cleaned);
        if (!Array.isArray(suggestions)) suggestions = [];
      } catch {
        suggestions = [];
      }

      res.json({ suggestions });
    } catch (error) {
      logger.error('POST /api/ra-builder/suggest-controls', error);
      res.status(200).json({ error: 'ai_failed', message: error instanceof Error ? error.message : 'AI suggestion failed' });
    }
  });
}
