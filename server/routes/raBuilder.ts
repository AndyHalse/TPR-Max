import type { Express } from 'express';
import { requireAuth } from '../auth';
import { customerDbService } from '../customerDatabase';
import { simpleDatabaseService } from '../simpleDatabaseService';
import { databaseService } from '../databaseService';
import { logger } from '../utils/logger';
import * as isolatedSchema from '../isolatedSchema';
import { eq, desc, asc } from 'drizzle-orm';

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
      const context = simpleDatabaseService.createCustomerContext(req.user!.username, req.customerId);
      const custDb = await customerDbService.getCustomerDatabase(context.customerId);
      const rows = await custDb
        .select()
        .from(isolatedSchema.raBuilderAssessments)
        .orderBy(desc(isolatedSchema.raBuilderAssessments.updatedAt));
      res.json(rows);
    } catch (error) {
      logger.error('GET /api/ra-builder/assessments', error);
      res.status(500).json({ error: 'Failed to fetch assessments' });
    }
  });

  app.post('/api/ra-builder/assessments', requireAuth, async (req, res) => {
    try {
      const context = simpleDatabaseService.createCustomerContext(req.user!.username, req.customerId);
      const custDb = await customerDbService.getCustomerDatabase(context.customerId);
      const parsed = isolatedSchema.insertRaBuilderAssessmentSchema.parse(req.body);
      const [row] = await custDb
        .insert(isolatedSchema.raBuilderAssessments)
        .values({ ...parsed, typeMetadata: parsed.typeMetadata || '{}' })
        .returning();
      res.status(201).json(row);
    } catch (error) {
      logger.error('POST /api/ra-builder/assessments', error);
      res.status(400).json({ error: error instanceof Error ? error.message : 'Failed to create assessment' });
    }
  });

  app.get('/api/ra-builder/assessments/:id', requireAuth, async (req, res) => {
    try {
      const context = simpleDatabaseService.createCustomerContext(req.user!.username, req.customerId);
      const custDb = await customerDbService.getCustomerDatabase(context.customerId);
      const { id } = req.params;
      const [assessment] = await custDb
        .select()
        .from(isolatedSchema.raBuilderAssessments)
        .where(eq(isolatedSchema.raBuilderAssessments.id, id));
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
      const context = simpleDatabaseService.createCustomerContext(req.user!.username, req.customerId);
      const custDb = await customerDbService.getCustomerDatabase(context.customerId);
      const { id } = req.params;
      const parsed = isolatedSchema.insertRaBuilderAssessmentSchema.partial().parse(req.body);
      const [row] = await custDb
        .update(isolatedSchema.raBuilderAssessments)
        .set({ ...parsed, updatedAt: new Date() })
        .where(eq(isolatedSchema.raBuilderAssessments.id, id))
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
      const context = simpleDatabaseService.createCustomerContext(req.user!.username, req.customerId);
      const custDb = await customerDbService.getCustomerDatabase(context.customerId);
      const { id } = req.params;
      await custDb
        .delete(isolatedSchema.raBuilderAssessments)
        .where(eq(isolatedSchema.raBuilderAssessments.id, id));
      res.json({ success: true });
    } catch (error) {
      logger.error('DELETE /api/ra-builder/assessments/:id', error);
      res.status(500).json({ error: 'Failed to delete assessment' });
    }
  });

  app.post('/api/ra-builder/assessments/:id/approve', requireAuth, async (req, res) => {
    try {
      const context = simpleDatabaseService.createCustomerContext(req.user!.username, req.customerId);
      const custDb = await customerDbService.getCustomerDatabase(context.customerId);
      const { id } = req.params;

      const [assessment] = await custDb
        .select()
        .from(isolatedSchema.raBuilderAssessments)
        .where(eq(isolatedSchema.raBuilderAssessments.id, id));
      if (!assessment) return res.status(404).json({ error: 'Assessment not found' });

      // Create expiry date — nextReviewDate or 12 months from now
      let expiryDate: Date;
      if (assessment.nextReviewDate) {
        const parsed = new Date(assessment.nextReviewDate);
        expiryDate = isNaN(parsed.getTime()) ? new Date(Date.now() + 365 * 24 * 60 * 60 * 1000) : parsed;
      } else {
        expiryDate = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
      }

      // Create RAMS document record
      const ramsIdRef = 'RA-' + id.substring(0, 8).toUpperCase();
      const [ramsDoc] = await custDb
        .insert(isolatedSchema.ramsDocuments)
        .values({
          ramsIdRef,
          documentName: `${assessment.title} (RA Builder)`,
          documentUrl: `/ra-builder/assessments/${id}/print`,
          expiryDate,
          status: 'valid',
          isActive: true,
        })
        .returning();

      // Update assessment
      const [updated] = await custDb
        .update(isolatedSchema.raBuilderAssessments)
        .set({
          status: 'approved',
          approvedBy: req.user!.username,
          linkedRamsDocumentId: ramsDoc.id,
          updatedAt: new Date(),
        })
        .where(eq(isolatedSchema.raBuilderAssessments.id, id))
        .returning();

      res.json(updated);
    } catch (error) {
      logger.error('POST /api/ra-builder/assessments/:id/approve', error);
      res.status(500).json({ error: 'Failed to approve assessment' });
    }
  });

  app.post('/api/ra-builder/assessments/:id/archive', requireAuth, async (req, res) => {
    try {
      const context = simpleDatabaseService.createCustomerContext(req.user!.username, req.customerId);
      const custDb = await customerDbService.getCustomerDatabase(context.customerId);
      const { id } = req.params;
      const [row] = await custDb
        .update(isolatedSchema.raBuilderAssessments)
        .set({ status: 'archived', updatedAt: new Date() })
        .where(eq(isolatedSchema.raBuilderAssessments.id, id))
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
      const context = simpleDatabaseService.createCustomerContext(req.user!.username, req.customerId);
      const custDb = await customerDbService.getCustomerDatabase(context.customerId);
      const { id } = req.params;
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
      const context = simpleDatabaseService.createCustomerContext(req.user!.username, req.customerId);
      const custDb = await customerDbService.getCustomerDatabase(context.customerId);
      const { id } = req.params;
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
      const context = simpleDatabaseService.createCustomerContext(req.user!.username, req.customerId);
      const custDb = await customerDbService.getCustomerDatabase(context.customerId);
      const { hazardId } = req.params;
      const body = req.body;
      const likelihood = body.likelihood !== undefined ? Number(body.likelihood) : undefined;
      const severity = body.severity !== undefined ? Number(body.severity) : undefined;
      const residualLikelihood = body.residualLikelihood !== undefined ? Number(body.residualLikelihood) : undefined;
      const residualSeverity = body.residualSeverity !== undefined ? Number(body.residualSeverity) : undefined;
      const updates: any = { ...body };
      if (likelihood !== undefined) updates.likelihood = likelihood;
      if (severity !== undefined) updates.severity = severity;
      if (likelihood !== undefined && severity !== undefined) updates.riskRating = likelihood * severity;
      if (residualLikelihood !== undefined) updates.residualLikelihood = residualLikelihood;
      if (residualSeverity !== undefined) updates.residualSeverity = residualSeverity;
      if (residualLikelihood !== undefined && residualSeverity !== undefined) {
        updates.residualRiskRating = residualLikelihood * residualSeverity;
      }
      const parsed = isolatedSchema.insertRaBuilderHazardSchema.partial().parse(updates);
      const [row] = await custDb
        .update(isolatedSchema.raBuilderHazards)
        .set(parsed)
        .where(eq(isolatedSchema.raBuilderHazards.id, hazardId))
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
      const context = simpleDatabaseService.createCustomerContext(req.user!.username, req.customerId);
      const custDb = await customerDbService.getCustomerDatabase(context.customerId);
      const { hazardId } = req.params;
      await custDb
        .delete(isolatedSchema.raBuilderHazards)
        .where(eq(isolatedSchema.raBuilderHazards.id, hazardId));
      res.json({ success: true });
    } catch (error) {
      logger.error('DELETE /api/ra-builder/assessments/:id/hazards/:hazardId', error);
      res.status(500).json({ error: 'Failed to delete hazard' });
    }
  });

  app.post('/api/ra-builder/assessments/:id/hazards/reorder', requireAuth, async (req, res) => {
    try {
      const context = simpleDatabaseService.createCustomerContext(req.user!.username, req.customerId);
      const custDb = await customerDbService.getCustomerDatabase(context.customerId);
      const items: { id: string; sortOrder: number }[] = req.body;
      await Promise.all(
        items.map(({ id: hazardId, sortOrder }) =>
          custDb
            .update(isolatedSchema.raBuilderHazards)
            .set({ sortOrder })
            .where(eq(isolatedSchema.raBuilderHazards.id, hazardId))
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

      if (!req.session?.customerId) {
        return res.status(401).json({ error: 'Customer context not found' });
      }

      const { decryptData } = await import('../utils/encryption');
      const context = { customerId: req.session.customerId };
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

      const systemPrompt = `You are a UK Health & Safety compliance expert. Given a hazard description and task context, suggest practical control measures based on the hierarchy of controls: Elimination, Substitution, Engineering Controls, Administrative Controls, PPE. Return ONLY a JSON array of control measure strings. No markdown, no explanation, no numbering. Return 4–6 specific, practical suggestions.`;

      const userMessage = `Assessment type: ${raType || 'general'}
Task: ${taskDescription || 'Not specified'}
Hazard: ${hazardDescription}
Existing controls already in place: ${existingControls || 'None stated'}
Suggest additional control measures.`;

      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': claudeApiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-3-5-sonnet-20241022',
          max_tokens: 512,
          system: systemPrompt,
          messages: [{ role: 'user', content: userMessage }],
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        logger.error('Claude API error:', errText);
        return res.status(200).json({ error: 'ai_failed', message: 'Claude API returned an error' });
      }

      const data = await response.json() as any;
      const rawContent = data?.content?.[0]?.text || '[]';
      // Strip markdown fences if present
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
