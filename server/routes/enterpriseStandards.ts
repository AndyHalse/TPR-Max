import type { Express } from 'express';
import { requireAuth } from '../auth';
import { requireEnterpriseRole } from '../enterpriseRoles';
import { customerDbService } from '../customerDatabase';
import * as isolatedSchema from '../isolatedSchema';
import { eq, and, isNotNull, inArray, asc } from 'drizzle-orm';
import { logger } from '../utils/logger';

export function registerEnterpriseStandardsRoutes(app: Express): void {

  // ── Visit Reasons Standards ──────────────────────────────────────────────────

  // GET /api/enterprise/standards/visit-reasons
  // Returns all enterprise-scoped (scope='enterprise') visit reasons
  app.get('/api/enterprise/standards/visit-reasons', requireAuth, requireEnterpriseRole('enterprise_admin'), async (req: any, res) => {
    try {
      const custDb = await customerDbService.getCustomerDatabase(req.customerId!);
      const standards = await custDb
        .select()
        .from(isolatedSchema.visitReasons)
        .where(eq(isolatedSchema.visitReasons.scope, 'enterprise'))
        .orderBy(asc(isolatedSchema.visitReasons.sortOrder), asc(isolatedSchema.visitReasons.createdAt));
      return res.json(standards);
    } catch (err: any) {
      logger.error('[enterprise/standards] GET visit-reasons error:', err);
      return res.status(500).json({ error: 'Failed to fetch enterprise standards' });
    }
  });

  // POST /api/enterprise/standards/visit-reasons
  // Create a new enterprise-level visit reason standard
  app.post('/api/enterprise/standards/visit-reasons', requireAuth, requireEnterpriseRole('enterprise_admin'), async (req: any, res) => {
    try {
      const { label, instructions, requireHsAcceptance, hsContent, sortOrder, appliesTo } = req.body;
      if (!label?.trim()) return res.status(400).json({ error: 'Label is required' });
      const custDb = await customerDbService.getCustomerDatabase(req.customerId!);
      const [created] = await custDb
        .insert(isolatedSchema.visitReasons)
        .values({
          label: label.trim(),
          instructions: instructions || '',
          requireHsAcceptance: requireHsAcceptance ?? false,
          hsContent: hsContent || '',
          isActive: true,
          sortOrder: sortOrder ?? 0,
          appliesTo: appliesTo || 'both',
          scope: 'enterprise',
          siteId: null,
        })
        .returning();
      logger.info(`[enterprise/standards] Created enterprise visit reason ${created.id} for ${req.customerId}`);
      return res.status(201).json(created);
    } catch (err: any) {
      logger.error('[enterprise/standards] POST visit-reasons error:', err);
      return res.status(500).json({ error: 'Failed to create enterprise standard' });
    }
  });

  // PUT /api/enterprise/standards/visit-reasons/:id
  // Update an enterprise-level visit reason standard
  app.put('/api/enterprise/standards/visit-reasons/:id', requireAuth, requireEnterpriseRole('enterprise_admin'), async (req: any, res) => {
    try {
      const { id } = req.params;
      const { label, instructions, requireHsAcceptance, hsContent, isActive, sortOrder, appliesTo } = req.body;
      const custDb = await customerDbService.getCustomerDatabase(req.customerId!);

      const [existing] = await custDb
        .select({ id: isolatedSchema.visitReasons.id })
        .from(isolatedSchema.visitReasons)
        .where(and(eq(isolatedSchema.visitReasons.id, id), eq(isolatedSchema.visitReasons.scope, 'enterprise')));
      if (!existing) return res.status(404).json({ error: 'Enterprise standard not found' });

      const update: Partial<typeof isolatedSchema.visitReasons.$inferSelect> = { updatedAt: new Date() };
      if (label !== undefined) update.label = label.trim();
      if (instructions !== undefined) update.instructions = instructions;
      if (requireHsAcceptance !== undefined) update.requireHsAcceptance = requireHsAcceptance;
      if (hsContent !== undefined) update.hsContent = hsContent;
      if (isActive !== undefined) update.isActive = isActive;
      if (sortOrder !== undefined) update.sortOrder = sortOrder;
      if (appliesTo !== undefined) update.appliesTo = appliesTo;

      const [updated] = await custDb
        .update(isolatedSchema.visitReasons)
        .set(update)
        .where(eq(isolatedSchema.visitReasons.id, id))
        .returning();
      logger.info(`[enterprise/standards] Updated enterprise visit reason ${id}`);
      return res.json(updated);
    } catch (err: any) {
      logger.error('[enterprise/standards] PUT visit-reasons/:id error:', err);
      return res.status(500).json({ error: 'Failed to update enterprise standard' });
    }
  });

  // DELETE /api/enterprise/standards/visit-reasons/:id
  // Soft-delete an enterprise-level visit reason standard
  app.delete('/api/enterprise/standards/visit-reasons/:id', requireAuth, requireEnterpriseRole('enterprise_admin'), async (req: any, res) => {
    try {
      const { id } = req.params;
      const custDb = await customerDbService.getCustomerDatabase(req.customerId!);
      const [existing] = await custDb
        .select({ id: isolatedSchema.visitReasons.id })
        .from(isolatedSchema.visitReasons)
        .where(and(eq(isolatedSchema.visitReasons.id, id), eq(isolatedSchema.visitReasons.scope, 'enterprise')));
      if (!existing) return res.status(404).json({ error: 'Enterprise standard not found' });
      await custDb
        .update(isolatedSchema.visitReasons)
        .set({ isActive: false, updatedAt: new Date() })
        .where(eq(isolatedSchema.visitReasons.id, id));
      logger.info(`[enterprise/standards] Soft-deleted enterprise visit reason ${id}`);
      return res.json({ ok: true });
    } catch (err: any) {
      logger.error('[enterprise/standards] DELETE visit-reasons/:id error:', err);
      return res.status(500).json({ error: 'Failed to delete enterprise standard' });
    }
  });

  // GET /api/enterprise/standards/visit-reasons/overrides
  // Returns which sites have per-site visit reason overrides (divergence view)
  app.get('/api/enterprise/standards/visit-reasons/overrides', requireAuth, requireEnterpriseRole('enterprise_admin'), async (req: any, res) => {
    try {
      const custDb = await customerDbService.getCustomerDatabase(req.customerId!);

      const overrideRows = await custDb
        .select({ siteId: isolatedSchema.visitReasons.siteId })
        .from(isolatedSchema.visitReasons)
        .where(and(
          eq(isolatedSchema.visitReasons.scope, 'site'),
          isNotNull(isolatedSchema.visitReasons.siteId),
        ));

      const siteIds = [...new Set(overrideRows.map(r => r.siteId).filter(Boolean) as string[])];
      if (siteIds.length === 0) return res.json([]);

      const sites = await custDb
        .select({ id: isolatedSchema.sites.id, name: isolatedSchema.sites.name, reference: isolatedSchema.sites.reference })
        .from(isolatedSchema.sites)
        .where(inArray(isolatedSchema.sites.id, siteIds));

      const result = sites.map(site => ({
        siteId: site.id,
        siteName: site.name,
        siteReference: site.reference,
        overrideCount: overrideRows.filter(r => r.siteId === site.id).length,
      }));

      return res.json(result);
    } catch (err: any) {
      logger.error('[enterprise/standards] GET visit-reasons/overrides error:', err);
      return res.status(500).json({ error: 'Failed to fetch overrides' });
    }
  });

  // DELETE /api/enterprise/standards/sites/:siteId/visit-reasons
  // Reset a site's visit reason overrides — site reverts to inheriting enterprise defaults
  app.delete('/api/enterprise/standards/sites/:siteId/visit-reasons', requireAuth, requireEnterpriseRole('enterprise_admin'), async (req: any, res) => {
    try {
      const { siteId } = req.params;
      const custDb = await customerDbService.getCustomerDatabase(req.customerId!);
      await custDb
        .delete(isolatedSchema.visitReasons)
        .where(and(
          eq(isolatedSchema.visitReasons.scope, 'site'),
          eq(isolatedSchema.visitReasons.siteId, siteId),
        ));
      logger.info(`[enterprise/standards] Reset site ${siteId} visit reasons to enterprise default for ${req.customerId}`);
      return res.json({ ok: true });
    } catch (err: any) {
      logger.error('[enterprise/standards] DELETE sites/:siteId/visit-reasons error:', err);
      return res.status(500).json({ error: 'Failed to reset site override' });
    }
  });

  // ── Induction Standards ──────────────────────────────────────────────────────

  // GET /api/enterprise/standards/induction/overrides
  // Returns which sites have per-site induction setting overrides
  // MUST be registered BEFORE /induction/:roleType to avoid Express matching
  // the literal string 'overrides' as the :roleType parameter.
  app.get('/api/enterprise/standards/induction/overrides', requireAuth, requireEnterpriseRole('enterprise_admin'), async (req: any, res) => {
    try {
      const custDb = await customerDbService.getCustomerDatabase(req.customerId!);
      const overrides = await custDb
        .select({
          roleType: isolatedSchema.inductionSettings.roleType,
          siteId: isolatedSchema.inductionSettings.siteId,
        })
        .from(isolatedSchema.inductionSettings)
        .where(and(
          eq(isolatedSchema.inductionSettings.scope, 'site'),
          isNotNull(isolatedSchema.inductionSettings.siteId),
        ));
      return res.json(overrides);
    } catch (err: any) {
      logger.error('[enterprise/standards] GET induction/overrides error:', err);
      return res.status(500).json({ error: 'Failed to fetch induction overrides' });
    }
  });

  // GET /api/enterprise/standards/induction/:roleType
  // Returns the enterprise-level induction settings for a given role type
  app.get('/api/enterprise/standards/induction/:roleType', requireAuth, requireEnterpriseRole('enterprise_admin'), async (req: any, res) => {
    try {
      const { roleType } = req.params;
      if (!['visitor', 'staff', 'contractor'].includes(roleType)) {
        return res.status(400).json({ error: 'Invalid roleType' });
      }
      const custDb = await customerDbService.getCustomerDatabase(req.customerId!);
      const [setting] = await custDb
        .select()
        .from(isolatedSchema.inductionSettings)
        .where(and(
          eq(isolatedSchema.inductionSettings.roleType, roleType),
          eq(isolatedSchema.inductionSettings.scope, 'enterprise'),
        ));
      return res.json(setting ?? null);
    } catch (err: any) {
      logger.error('[enterprise/standards] GET induction/:roleType error:', err);
      return res.status(500).json({ error: 'Failed to fetch induction standard' });
    }
  });

  // PATCH /api/enterprise/standards/induction/:roleType
  // Push / update enterprise induction settings for a role type (upsert)
  app.patch('/api/enterprise/standards/induction/:roleType', requireAuth, requireEnterpriseRole('enterprise_admin'), async (req: any, res) => {
    try {
      const { roleType } = req.params;
      if (!['visitor', 'staff', 'contractor'].includes(roleType)) {
        return res.status(400).json({ error: 'Invalid roleType' });
      }
      const custDb = await customerDbService.getCustomerDatabase(req.customerId!);
      const { passPercentage, kioskEnabled, sendLinkEnabled, failureFeedbackLevel } = req.body;

      const [existing] = await custDb
        .select({ id: isolatedSchema.inductionSettings.id })
        .from(isolatedSchema.inductionSettings)
        .where(and(
          eq(isolatedSchema.inductionSettings.roleType, roleType),
          eq(isolatedSchema.inductionSettings.scope, 'enterprise'),
        ));

      if (existing) {
        const update: any = { updatedAt: new Date() };
        if (passPercentage !== undefined) update.passPercentage = passPercentage;
        if (kioskEnabled !== undefined) update.kioskEnabled = kioskEnabled;
        if (sendLinkEnabled !== undefined) update.sendLinkEnabled = sendLinkEnabled;
        if (failureFeedbackLevel !== undefined) update.failureFeedbackLevel = failureFeedbackLevel;

        const [updated] = await custDb
          .update(isolatedSchema.inductionSettings)
          .set(update)
          .where(eq(isolatedSchema.inductionSettings.id, existing.id))
          .returning();
        logger.info(`[enterprise/standards] Updated enterprise induction standard for ${roleType}`);
        return res.json(updated);
      }

      // Bootstrap from existing site-level setting (or use safe defaults)
      const [siteSetting] = await custDb
        .select()
        .from(isolatedSchema.inductionSettings)
        .where(eq(isolatedSchema.inductionSettings.roleType, roleType))
        .limit(1);

      const displayName = roleType.charAt(0).toUpperCase() + roleType.slice(1);
      const [created] = await custDb
        .insert(isolatedSchema.inductionSettings)
        .values({
          roleType,
          videoTitle: siteSetting?.videoTitle ?? `${displayName} Induction`,
          videoUrl: siteSetting?.videoUrl ?? '',
          videoDescription: siteSetting?.videoDescription ?? null,
          videoDurationMinutes: siteSetting?.videoDurationMinutes ?? 15,
          videoFormat: siteSetting?.videoFormat ?? 'interactive_slides',
          modelType: siteSetting?.modelType ?? 'claude-sonnet-4-6',
          passPercentage: passPercentage ?? siteSetting?.passPercentage ?? 80,
          kioskEnabled: kioskEnabled ?? siteSetting?.kioskEnabled ?? false,
          sendLinkEnabled: sendLinkEnabled ?? siteSetting?.sendLinkEnabled ?? true,
          failureFeedbackLevel: failureFeedbackLevel ?? siteSetting?.failureFeedbackLevel ?? 'questions_topics',
          scope: 'enterprise',
          siteId: null,
        })
        .returning();
      logger.info(`[enterprise/standards] Created enterprise induction standard for ${roleType}`);
      return res.status(201).json(created);
    } catch (err: any) {
      logger.error('[enterprise/standards] PATCH induction/:roleType error:', err);
      return res.status(500).json({ error: 'Failed to push induction standard' });
    }
  });
}
