import type { Express } from 'express';
import { requireAuth } from '../auth';
import { customerDbService } from '../customerDatabase';
import { db as managementDb } from '../db';
import { customers } from '@shared/schema';
import * as isolatedSchema from '../isolatedSchema';
import { eq, ne, and } from 'drizzle-orm';
import { z } from 'zod';
import { logger } from '../utils/logger';

// ── Helpers ─────────────────────────────────────────────────────────────────

async function getIsEnterprise(customerId: string): Promise<boolean> {
  const rows = await managementDb
    .select({ isEnterprise: customers.isEnterprise })
    .from(customers)
    .where(eq(customers.id, customerId))
    .limit(1);
  return rows[0]?.isEnterprise ?? false;
}

async function validateSiteOwnership(
  customerId: string,
  siteId: string,
): Promise<boolean> {
  const custDb = await customerDbService.getCustomerDatabase(customerId);
  const rows = await custDb
    .select({ id: isolatedSchema.sites.id })
    .from(isolatedSchema.sites)
    .where(eq(isolatedSchema.sites.id, siteId))
    .limit(1);
  return rows.length > 0;
}

// ── Route registration ───────────────────────────────────────────────────────

export function registerEnterpriseSiteRoutes(app: Express): void {

  // ── List sites ─────────────────────────────────────────────────────────────
  app.get('/api/enterprise/sites', requireAuth, async (req, res) => {
    try {
      const customerId = req.customerId!;
      const custDb = await customerDbService.getCustomerDatabase(customerId);
      const allSites = await custDb
        .select()
        .from(isolatedSchema.sites)
        .orderBy(isolatedSchema.sites.isDefault, isolatedSchema.sites.name);
      return res.json(allSites);
    } catch (err) {
      logger.error('[enterprise/sites] GET sites error:', err);
      return res.status(500).json({ error: 'Failed to load sites' });
    }
  });

  // ── Get single site ────────────────────────────────────────────────────────
  app.get('/api/enterprise/sites/:id', requireAuth, async (req, res) => {
    try {
      const customerId = req.customerId!;
      const custDb = await customerDbService.getCustomerDatabase(customerId);
      const rows = await custDb
        .select()
        .from(isolatedSchema.sites)
        .where(eq(isolatedSchema.sites.id, req.params.id))
        .limit(1);
      if (!rows[0]) return res.status(404).json({ error: 'Site not found' });
      return res.json(rows[0]);
    } catch (err) {
      logger.error('[enterprise/sites] GET site error:', err);
      return res.status(500).json({ error: 'Failed to load site' });
    }
  });

  // ── Create site ────────────────────────────────────────────────────────────
  const createSiteSchema = z.object({
    name: z.string().min(1).max(200),
    reference: z.string().max(50).optional().nullable(),
    address: z.string().max(500).optional().nullable(),
    postcode: z.string().max(20).optional().nullable(),
    region: z.string().max(100).optional().nullable(),
    areaId: z.string().optional().nullable(),
    status: z.enum(['active', 'onboarding', 'archived']).default('active'),
  });

  app.post('/api/enterprise/sites', requireAuth, async (req, res) => {
    try {
      const customerId = req.customerId!;
      const user = (req as any).user;
      if (user?.role !== 'admin') {
        return res.status(403).json({ error: 'Admin role required' });
      }
      const body = createSiteSchema.safeParse(req.body);
      if (!body.success) return res.status(400).json({ error: body.error.issues });

      const custDb = await customerDbService.getCustomerDatabase(customerId);

      // Auto-generate reference if not provided
      let reference = body.data.reference;
      if (!reference) {
        const count = await custDb
          .select({ id: isolatedSchema.sites.id })
          .from(isolatedSchema.sites);
        reference = `SITE-${String(count.length + 1).padStart(3, '0')}`;
      }

      const [created] = await custDb
        .insert(isolatedSchema.sites)
        .values({
          name: body.data.name,
          reference,
          address: body.data.address ?? null,
          postcode: body.data.postcode ?? null,
          region: body.data.region ?? null,
          areaId: body.data.areaId ?? null,
          status: body.data.status,
          isDefault: false,
        })
        .returning();

      logger.info(`[enterprise/sites] Created site ${created.id} for customer ${customerId}`);
      return res.status(201).json(created);
    } catch (err: any) {
      if (err?.code === '23505') {
        return res.status(409).json({ error: 'Site reference already exists' });
      }
      logger.error('[enterprise/sites] POST site error:', err);
      return res.status(500).json({ error: 'Failed to create site' });
    }
  });

  // ── Update / archive site ──────────────────────────────────────────────────
  const updateSiteSchema = z.object({
    name: z.string().min(1).max(200).optional(),
    reference: z.string().max(50).optional().nullable(),
    address: z.string().max(500).optional().nullable(),
    postcode: z.string().max(20).optional().nullable(),
    region: z.string().max(100).optional().nullable(),
    areaId: z.string().optional().nullable(),
    status: z.enum(['active', 'onboarding', 'archived']).optional(),
  });

  app.patch('/api/enterprise/sites/:id', requireAuth, async (req, res) => {
    try {
      const customerId = req.customerId!;
      const user = (req as any).user;
      if (user?.role !== 'admin') {
        return res.status(403).json({ error: 'Admin role required' });
      }
      const body = updateSiteSchema.safeParse(req.body);
      if (!body.success) return res.status(400).json({ error: body.error.issues });

      const custDb = await customerDbService.getCustomerDatabase(customerId);

      // Prevent archiving the default site
      if (body.data.status === 'archived') {
        const [existing] = await custDb
          .select({ isDefault: isolatedSchema.sites.isDefault })
          .from(isolatedSchema.sites)
          .where(eq(isolatedSchema.sites.id, req.params.id))
          .limit(1);
        if (existing?.isDefault) {
          return res.status(400).json({ error: 'Cannot archive the default site' });
        }
      }

      const updateValues: Record<string, any> = { ...body.data };
      if (body.data.status === 'archived') {
        updateValues.archivedAt = new Date();
      } else if (body.data.status && body.data.status !== 'archived') {
        updateValues.archivedAt = null;
      }

      const [updated] = await custDb
        .update(isolatedSchema.sites)
        .set(updateValues)
        .where(eq(isolatedSchema.sites.id, req.params.id))
        .returning();

      if (!updated) return res.status(404).json({ error: 'Site not found' });
      return res.json(updated);
    } catch (err: any) {
      if (err?.code === '23505') {
        return res.status(409).json({ error: 'Site reference already exists' });
      }
      logger.error('[enterprise/sites] PATCH site error:', err);
      return res.status(500).json({ error: 'Failed to update site' });
    }
  });

  // ── List areas ─────────────────────────────────────────────────────────────
  app.get('/api/enterprise/areas', requireAuth, async (req, res) => {
    try {
      const customerId = req.customerId!;
      const custDb = await customerDbService.getCustomerDatabase(customerId);
      const allAreas = await custDb
        .select()
        .from(isolatedSchema.areas)
        .orderBy(isolatedSchema.areas.name);
      return res.json(allAreas);
    } catch (err) {
      logger.error('[enterprise/areas] GET areas error:', err);
      return res.status(500).json({ error: 'Failed to load areas' });
    }
  });

  // ── Create area ────────────────────────────────────────────────────────────
  const createAreaSchema = z.object({
    name: z.string().min(1).max(200),
    description: z.string().max(500).optional().nullable(),
  });

  app.post('/api/enterprise/areas', requireAuth, async (req, res) => {
    try {
      const customerId = req.customerId!;
      const user = (req as any).user;
      if (user?.role !== 'admin') {
        return res.status(403).json({ error: 'Admin role required' });
      }
      const body = createAreaSchema.safeParse(req.body);
      if (!body.success) return res.status(400).json({ error: body.error.issues });

      const custDb = await customerDbService.getCustomerDatabase(customerId);
      const [created] = await custDb
        .insert(isolatedSchema.areas)
        .values(body.data)
        .returning();
      return res.status(201).json(created);
    } catch (err) {
      logger.error('[enterprise/areas] POST area error:', err);
      return res.status(500).json({ error: 'Failed to create area' });
    }
  });

  // ── Update area ────────────────────────────────────────────────────────────
  app.patch('/api/enterprise/areas/:id', requireAuth, async (req, res) => {
    try {
      const customerId = req.customerId!;
      const user = (req as any).user;
      if (user?.role !== 'admin') {
        return res.status(403).json({ error: 'Admin role required' });
      }
      const body = createAreaSchema.safeParse(req.body);
      if (!body.success) return res.status(400).json({ error: body.error.issues });

      const custDb = await customerDbService.getCustomerDatabase(customerId);
      const [updated] = await custDb
        .update(isolatedSchema.areas)
        .set(body.data)
        .where(eq(isolatedSchema.areas.id, req.params.id))
        .returning();
      if (!updated) return res.status(404).json({ error: 'Area not found' });
      return res.json(updated);
    } catch (err) {
      logger.error('[enterprise/areas] PATCH area error:', err);
      return res.status(500).json({ error: 'Failed to update area' });
    }
  });

  // ── Set active site (session) ──────────────────────────────────────────────
  app.post('/api/enterprise/active-site', requireAuth, async (req, res) => {
    try {
      const customerId = req.customerId!;
      const { siteId } = req.body as { siteId: string | null };

      if (siteId !== null) {
        // Validate site belongs to this customer
        const valid = await validateSiteOwnership(customerId, siteId);
        if (!valid) {
          return res.status(404).json({ error: 'Site not found for this account' });
        }
      }

      (req.session as any).activeSiteId = siteId ?? undefined;

      // Flush the siteContext cache so next request re-resolves
      (req as any).siteContext = undefined;

      return res.json({ activeSiteId: siteId });
    } catch (err) {
      logger.error('[enterprise/active-site] error:', err);
      return res.status(500).json({ error: 'Failed to set active site' });
    }
  });

  // ── Validate & return site for kiosk binding ───────────────────────────────
  // Called by KioskMode on mount with ?siteId=<id> from the kiosk URL.
  // Returns site details if the siteId is valid + active for this customer.
  app.get('/api/enterprise/kiosk-site', requireAuth, async (req, res) => {
    try {
      const customerId = req.customerId!;
      const siteId = req.query.siteId as string | undefined;

      if (!siteId) {
        return res.status(400).json({ error: 'siteId query parameter required' });
      }

      const custDb = await customerDbService.getCustomerDatabase(customerId);
      const rows = await custDb
        .select()
        .from(isolatedSchema.sites)
        .where(
          and(
            eq(isolatedSchema.sites.id, siteId),
            ne(isolatedSchema.sites.status, 'archived'),
          ),
        )
        .limit(1);

      if (!rows[0]) {
        return res.status(404).json({ error: 'Site not found or archived' });
      }

      return res.json({ site: rows[0] });
    } catch (err) {
      logger.error('[enterprise/kiosk-site] error:', err);
      return res.status(500).json({ error: 'Failed to validate kiosk site' });
    }
  });

  // ── Customer enterprise status (for UI gating) ────────────────────────────
  app.get('/api/enterprise/status', requireAuth, async (req, res) => {
    try {
      const customerId = req.customerId!;
      const isEnterprise = await getIsEnterprise(customerId);
      const activeSiteId = (req.session as any)?.activeSiteId ?? null;
      return res.json({ isEnterprise, activeSiteId });
    } catch (err) {
      logger.error('[enterprise/status] error:', err);
      return res.status(500).json({ error: 'Failed to get enterprise status' });
    }
  });
}
