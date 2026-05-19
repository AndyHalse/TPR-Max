import type { Express } from 'express';
import { requireAuth } from '../auth';
import { customerDbService } from '../customerDatabase';
import * as isolatedSchema from '../isolatedSchema';
import { eq, asc } from 'drizzle-orm';
import { logger } from '../utils/logger';

export function registerVisitReasonRoutes(app: Express): void {

  // GET /api/visit-reasons — active reasons ordered by sort_order (kiosk + admin)
  app.get('/api/visit-reasons', requireAuth, async (req: any, res) => {
    try {
      const custDb = await customerDbService.getCustomerDatabase(req.customerId!);
      const reasons = await custDb
        .select()
        .from(isolatedSchema.visitReasons)
        .where(eq(isolatedSchema.visitReasons.isActive, true))
        .orderBy(asc(isolatedSchema.visitReasons.sortOrder), asc(isolatedSchema.visitReasons.createdAt));
      return res.json(reasons);
    } catch (err: any) {
      logger.error('GET /api/visit-reasons error:', err);
      return res.status(500).json({ error: 'Failed to fetch visit reasons' });
    }
  });

  // GET /api/visit-reasons/all — all reasons including inactive (admin)
  app.get('/api/visit-reasons/all', requireAuth, async (req: any, res) => {
    try {
      const custDb = await customerDbService.getCustomerDatabase(req.customerId!);
      const reasons = await custDb
        .select()
        .from(isolatedSchema.visitReasons)
        .orderBy(asc(isolatedSchema.visitReasons.sortOrder), asc(isolatedSchema.visitReasons.createdAt));
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
      const custDb = await customerDbService.getCustomerDatabase(req.customerId!);
      const [created] = await custDb
        .insert(isolatedSchema.visitReasons)
        .values({
          label: label.trim(),
          instructions: instructions || '',
          requireHsAcceptance: requireHsAcceptance ?? false,
          hsContent: hsContent || '',
          isActive: isActive ?? true,
          sortOrder: sortOrder ?? 0,
          appliesTo: appliesTo || 'both',
        })
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
      const custDb = await customerDbService.getCustomerDatabase(req.customerId!);
      for (let i = 0; i < ids.length; i++) {
        await custDb
          .update(isolatedSchema.visitReasons)
          .set({ sortOrder: i, updatedAt: new Date() })
          .where(eq(isolatedSchema.visitReasons.id, ids[i]));
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
      const custDb = await customerDbService.getCustomerDatabase(req.customerId!);
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
        .where(eq(isolatedSchema.visitReasons.id, id))
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
      const custDb = await customerDbService.getCustomerDatabase(req.customerId!);
      await custDb
        .update(isolatedSchema.visitReasons)
        .set({ isActive: false, updatedAt: new Date() })
        .where(eq(isolatedSchema.visitReasons.id, id));
      return res.json({ ok: true });
    } catch (err: any) {
      logger.error('DELETE /api/visit-reasons/:id error:', err);
      return res.status(500).json({ error: 'Failed to delete visit reason' });
    }
  });
}
