import type { Express } from 'express';
import { requireAuth } from '../auth';
import { requireEnterpriseRole, resolveEnterpriseGrants } from '../enterpriseRoles';
import { customerDbService } from '../customerDatabase';
import { db as managementDb } from '../db';
import { customers } from '@shared/schema';
import * as isolatedSchema from '../isolatedSchema';
import { eq, ne, and, inArray } from 'drizzle-orm';
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

  app.post('/api/enterprise/sites', requireAuth, requireEnterpriseRole('enterprise_admin'), async (req, res) => {
    try {
      const customerId = req.customerId!;
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

  app.patch('/api/enterprise/sites/:id', requireAuth, requireEnterpriseRole('enterprise_admin'), async (req, res) => {
    try {
      const customerId = req.customerId!;
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

  app.post('/api/enterprise/areas', requireAuth, requireEnterpriseRole('enterprise_admin'), async (req, res) => {
    try {
      const customerId = req.customerId!;
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
  app.patch('/api/enterprise/areas/:id', requireAuth, requireEnterpriseRole('enterprise_admin'), async (req, res) => {
    try {
      const customerId = req.customerId!;
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

  // ── Role grants ─────────────────────────────────────────────────────────────

  const grantSchema = z.object({
    userId: z.string().min(1),
    role: z.enum(['enterprise_admin', 'area_manager', 'site_coordinator']),
    areaId: z.string().nullable().optional(),
    siteId: z.string().nullable().optional(),
  });

  // GET /api/enterprise/role-grants/my — current user's effective grants (no role gate)
  app.get('/api/enterprise/role-grants/my', requireAuth, async (req, res) => {
    try {
      const user = (req as any).user;
      const customerId = req.customerId!;
      if (!user?.id) return res.status(401).json({ error: 'Not authenticated' });
      const grants = await resolveEnterpriseGrants(user.id, customerId);
      return res.json(grants);
    } catch (err) {
      logger.error('[enterprise/role-grants/my] error:', err);
      return res.status(500).json({ error: 'Failed to load grants' });
    }
  });

  // GET /api/enterprise/role-grants — list all visible grants (enriched with user info)
  app.get('/api/enterprise/role-grants', requireAuth, requireEnterpriseRole('enterprise_admin', 'area_manager'), async (req, res) => {
    try {
      const customerId = req.customerId!;
      const callerGrants = req.enterpriseGrants!;
      const custDb = await customerDbService.getCustomerDatabase(customerId);

      let allGrants = await custDb
        .select()
        .from(isolatedSchema.siteUserRoles);

      // area_manager: restrict to site_coordinator grants for their allowed sites only
      if (!callerGrants.roles.includes('enterprise_admin') && Array.isArray(callerGrants.allowedSiteIds)) {
        const allowedSet = new Set(callerGrants.allowedSiteIds);
        allGrants = allGrants.filter(
          g => g.role === 'site_coordinator' && g.siteId && allowedSet.has(g.siteId),
        );
      }

      // Enrich with user info
      const userIds = [...new Set(allGrants.map(g => g.userId))];
      const userMap: Record<string, any> = {};
      if (userIds.length > 0) {
        const userRows = await custDb
          .select({
            id: isolatedSchema.users.id,
            username: isolatedSchema.users.username,
            firstName: isolatedSchema.users.firstName,
            lastName: isolatedSchema.users.lastName,
            email: (isolatedSchema.users as any).email,
          })
          .from(isolatedSchema.users)
          .where(inArray(isolatedSchema.users.id, userIds));
        userRows.forEach(u => { userMap[u.id] = u; });
      }

      return res.json(allGrants.map(g => ({ ...g, user: userMap[g.userId] ?? null })));
    } catch (err) {
      logger.error('[enterprise/role-grants] GET error:', err);
      return res.status(500).json({ error: 'Failed to load role grants' });
    }
  });

  // POST /api/enterprise/role-grants — create a grant
  app.post('/api/enterprise/role-grants', requireAuth, requireEnterpriseRole('enterprise_admin', 'area_manager'), async (req, res) => {
    try {
      const customerId = req.customerId!;
      const callerGrants = req.enterpriseGrants!;
      const isAdmin = callerGrants.roles.includes('enterprise_admin');

      const body = grantSchema.safeParse(req.body);
      if (!body.success) return res.status(400).json({ error: body.error.issues });

      const { userId, role, areaId, siteId } = body.data;

      // Validate field requirements per role
      if (role === 'area_manager' && !areaId) {
        return res.status(400).json({ error: 'area_manager grants require areaId' });
      }
      if (role === 'site_coordinator' && !siteId) {
        return res.status(400).json({ error: 'site_coordinator grants require siteId' });
      }
      if (role === 'enterprise_admin' && (areaId || siteId)) {
        return res.status(400).json({ error: 'enterprise_admin grants must not include areaId or siteId' });
      }

      // Non-admins: may only grant site_coordinator for their allowed sites
      if (!isAdmin) {
        if (role !== 'site_coordinator') {
          return res.status(403).json({ error: 'Area managers can only grant the site_coordinator role' });
        }
        if (
          !siteId ||
          !Array.isArray(callerGrants.allowedSiteIds) ||
          !(callerGrants.allowedSiteIds as string[]).includes(siteId)
        ) {
          return res.status(403).json({ error: 'Site is outside your managed area' });
        }
      }

      const custDb = await customerDbService.getCustomerDatabase(customerId);

      // Verify target user exists
      const [targetUser] = await custDb
        .select({ id: isolatedSchema.users.id, username: isolatedSchema.users.username })
        .from(isolatedSchema.users)
        .where(eq(isolatedSchema.users.id, userId))
        .limit(1);
      if (!targetUser) {
        return res.status(404).json({ error: 'User not found' });
      }

      const [created] = await custDb
        .insert(isolatedSchema.siteUserRoles)
        .values({ userId, role, areaId: areaId ?? null, siteId: siteId ?? null })
        .onConflictDoNothing()
        .returning();

      const callerUser = (req as any).user;
      logger.info(
        `[enterprise/role-grants] GRANT: caller=${callerUser?.username} → userId=${userId} (${targetUser.username}) role=${role} areaId=${areaId ?? '-'} siteId=${siteId ?? '-'} customer=${customerId}`,
      );

      if (!created) {
        return res.status(409).json({ error: 'Grant already exists' });
      }
      return res.status(201).json(created);
    } catch (err) {
      logger.error('[enterprise/role-grants] POST error:', err);
      return res.status(500).json({ error: 'Failed to create role grant' });
    }
  });

  // DELETE /api/enterprise/role-grants/:id — revoke a grant
  app.delete('/api/enterprise/role-grants/:id', requireAuth, requireEnterpriseRole('enterprise_admin', 'area_manager'), async (req, res) => {
    try {
      const customerId = req.customerId!;
      const callerGrants = req.enterpriseGrants!;
      const isAdmin = callerGrants.roles.includes('enterprise_admin');

      const custDb = await customerDbService.getCustomerDatabase(customerId);

      // Load the grant to check scope + role
      const [target] = await custDb
        .select()
        .from(isolatedSchema.siteUserRoles)
        .where(eq(isolatedSchema.siteUserRoles.id, req.params.id))
        .limit(1);

      if (!target) return res.status(404).json({ error: 'Grant not found' });

      // Non-admins: may only revoke site_coordinator grants within their area
      if (!isAdmin) {
        if (target.role !== 'site_coordinator') {
          return res.status(403).json({ error: 'Area managers can only revoke site_coordinator grants' });
        }
        if (
          !target.siteId ||
          !Array.isArray(callerGrants.allowedSiteIds) ||
          !(callerGrants.allowedSiteIds as string[]).includes(target.siteId)
        ) {
          return res.status(403).json({ error: 'Grant is outside your managed area' });
        }
      }

      // Safety: cannot remove the last enterprise_admin grant
      if (target.role === 'enterprise_admin') {
        const adminGrants = await custDb
          .select({ id: isolatedSchema.siteUserRoles.id })
          .from(isolatedSchema.siteUserRoles)
          .where(eq(isolatedSchema.siteUserRoles.role, 'enterprise_admin'));
        if (adminGrants.length <= 1) {
          return res.status(400).json({
            error: 'Cannot revoke the last enterprise_admin grant — at least one must remain',
          });
        }
      }

      await custDb
        .delete(isolatedSchema.siteUserRoles)
        .where(eq(isolatedSchema.siteUserRoles.id, req.params.id));

      const callerUser = (req as any).user;
      logger.info(
        `[enterprise/role-grants] REVOKE: caller=${callerUser?.username} → grantId=${req.params.id} role=${target.role} userId=${target.userId} customer=${customerId}`,
      );

      return res.status(204).end();
    } catch (err) {
      logger.error('[enterprise/role-grants] DELETE error:', err);
      return res.status(500).json({ error: 'Failed to revoke role grant' });
    }
  });
}
