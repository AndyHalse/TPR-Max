import type { Express } from 'express';
import { requireAuth } from '../auth';
import { getScopedDb, scopedWhere, withSiteId } from '../siteScope';
import * as isolatedSchema from '../isolatedSchema';
import { eq, and, asc, isNull } from 'drizzle-orm';
import { logger } from '../utils/logger';

/** Resolve effective visit reasons for a request.
 *
 * Resolution order (enterprise customers):
 *   1. scope='site' + siteId=activeSiteId  → site has its own override set
 *   2. scope='enterprise'                   → enterprise defaults pushed by head office
 *   3. scope='site' + siteId IS NULL        → legacy records created before Phase 4a
 *
 * Non-enterprise customers: direct query (unchanged behaviour).
 */
async function resolveVisitReasons(req: any, includeInactive = false) {
  const { db: custDb, siteContext } = await getScopedDb(req);
  const activeFilter = includeInactive ? [] : [eq(isolatedSchema.visitReasons.isActive, true)];
  const orderBy = [asc(isolatedSchema.visitReasons.sortOrder), asc(isolatedSchema.visitReasons.createdAt)];

  if (siteContext.isEnterprise && siteContext.activeSiteId) {
    const activeSiteId = siteContext.activeSiteId;

    // 1. Site-specific override
    const siteOverrides = await custDb
      .select()
      .from(isolatedSchema.visitReasons)
      .where(and(
        ...activeFilter,
        eq(isolatedSchema.visitReasons.scope, 'site'),
        eq(isolatedSchema.visitReasons.siteId, activeSiteId),
      ))
      .orderBy(...orderBy);
    if (siteOverrides.length > 0) return { reasons: siteOverrides, source: 'site_override' as const };

    // 2. Enterprise defaults
    const enterpriseDefaults = await custDb
      .select()
      .from(isolatedSchema.visitReasons)
      .where(and(...activeFilter, eq(isolatedSchema.visitReasons.scope, 'enterprise')))
      .orderBy(...orderBy);
    if (enterpriseDefaults.length > 0) return { reasons: enterpriseDefaults, source: 'enterprise_default' as const };
  }

  // 3. Legacy / non-enterprise: all active records (unchanged)
  const all = await custDb
    .select()
    .from(isolatedSchema.visitReasons)
    .where(includeInactive ? undefined : eq(isolatedSchema.visitReasons.isActive, true))
    .orderBy(...orderBy);
  return { reasons: all, source: 'legacy' as const };
}

export function registerVisitReasonRoutes(app: Express): void {

  // GET /api/visit-reasons — active reasons ordered by sort_order (kiosk + admin)
  // Enterprise-aware: resolves site override → enterprise default → legacy
  app.get('/api/visit-reasons', requireAuth, async (req: any, res) => {
    try {
      const { reasons } = await resolveVisitReasons(req, false);
      return res.json(reasons);
    } catch (err: any) {
      logger.error('GET /api/visit-reasons error:', err);
      return res.status(500).json({ error: 'Failed to fetch visit reasons' });
    }
  });

  // GET /api/visit-reasons/all — all reasons including inactive (admin)
  // Enterprise-aware: resolves site override → enterprise default → legacy
  app.get('/api/visit-reasons/all', requireAuth, async (req: any, res) => {
    try {
      const { reasons } = await resolveVisitReasons(req, true);
      return res.json(reasons);
    } catch (err: any) {
      logger.error('GET /api/visit-reasons/all error:', err);
      return res.status(500).json({ error: 'Failed to fetch visit reasons' });
    }
  });

  // POST /api/visit-reasons — create
  app.post('/api/visit-reasons', requireAuth, async (req: any, res) => {
    try {
      const { label, instructions, requireHsAcceptance, hsContent, isActive, sortOrder, appliesTo } = req.body;
      if (!label?.trim()) return res.status(400).json({ error: 'Label is required' });
      const { db: custDb, siteId } = await getScopedDb(req);
      const [created] = await custDb
        .insert(isolatedSchema.visitReasons)
        .values(withSiteId(siteId, {
          label: label.trim(),
          instructions: instructions || '',
          requireHsAcceptance: requireHsAcceptance ?? false,
          hsContent: hsContent || '',
          isActive: isActive ?? true,
          sortOrder: sortOrder ?? 0,
          appliesTo: appliesTo || 'both',
        }))
        .returning();
      return res.status(201).json(created);
    } catch (err: any) {
      logger.error('POST /api/visit-reasons error:', err);
      return res.status(500).json({ error: 'Failed to create visit reason' });
    }
  });

  // PUT /api/visit-reasons/reorder — update sort_order for a list of IDs
  app.put('/api/visit-reasons/reorder', requireAuth, async (req: any, res) => {
    try {
      const { ids } = req.body;
      if (!Array.isArray(ids)) return res.status(400).json({ error: 'ids must be an array' });
      const { db: custDb, siteContext } = await getScopedDb(req);
      for (let i = 0; i < ids.length; i++) {
        await custDb
          .update(isolatedSchema.visitReasons)
          .set({ sortOrder: i, updatedAt: new Date() })
          .where(and(eq(isolatedSchema.visitReasons.id, ids[i]), scopedWhere(siteContext, isolatedSchema.visitReasons)));
      }
      return res.json({ ok: true });
    } catch (err: any) {
      logger.error('PUT /api/visit-reasons/reorder error:', err);
      return res.status(500).json({ error: 'Failed to reorder visit reasons' });
    }
  });

  // PUT /api/visit-reasons/:id — update
  app.put('/api/visit-reasons/:id', requireAuth, async (req: any, res) => {
    try {
      const { id } = req.params;
      const { label, instructions, requireHsAcceptance, hsContent, isActive, sortOrder, appliesTo } = req.body;
      const { db: custDb, siteContext } = await getScopedDb(req);
      const updateData: Partial<typeof isolatedSchema.visitReasons.$inferSelect> = { updatedAt: new Date() };
      if (label !== undefined) updateData.label = label.trim();
      if (instructions !== undefined) updateData.instructions = instructions;
      if (requireHsAcceptance !== undefined) updateData.requireHsAcceptance = requireHsAcceptance;
      if (hsContent !== undefined) updateData.hsContent = hsContent;
      if (isActive !== undefined) updateData.isActive = isActive;
      if (sortOrder !== undefined) updateData.sortOrder = sortOrder;
      if (appliesTo !== undefined) updateData.appliesTo = appliesTo;
      const [updated] = await custDb
        .update(isolatedSchema.visitReasons)
        .set(updateData)
        .where(and(eq(isolatedSchema.visitReasons.id, id), scopedWhere(siteContext, isolatedSchema.visitReasons)))
        .returning();
      if (!updated) return res.status(404).json({ error: 'Visit reason not found' });
      return res.json(updated);
    } catch (err: any) {
      logger.error('PUT /api/visit-reasons/:id error:', err);
      return res.status(500).json({ error: 'Failed to update visit reason' });
    }
  });

  // DELETE /api/visit-reasons/:id — soft delete
  app.delete('/api/visit-reasons/:id', requireAuth, async (req: any, res) => {
    try {
      const { id } = req.params;
      const { db: custDb, siteContext } = await getScopedDb(req);
      await custDb
        .update(isolatedSchema.visitReasons)
        .set({ isActive: false, updatedAt: new Date() })
        .where(and(eq(isolatedSchema.visitReasons.id, id), scopedWhere(siteContext, isolatedSchema.visitReasons)));
      return res.json({ ok: true });
    } catch (err: any) {
      logger.error('DELETE /api/visit-reasons/:id error:', err);
      return res.status(500).json({ error: 'Failed to delete visit reason' });
    }
  });
}
