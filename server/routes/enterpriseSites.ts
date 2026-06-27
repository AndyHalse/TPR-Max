import type { Express } from 'express';
import { requireAuth } from '../auth';
import { requireEnterpriseRole, resolveEnterpriseGrants } from '../enterpriseRoles';
import { customerDbService } from '../customerDatabase';
import { db as managementDb } from '../db';
import { customers, siteLoginNames } from '@shared/schema';
import * as isolatedSchema from '../isolatedSchema';
import { eq, ne, and, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import { logger } from '../utils/logger';
import { geocodePostcode, geocodePostcodesBulk } from '../geocodeService';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';

// ── Helpers ─────────────────────────────────────────────────────────────────

async function getIsEnterprise(customerId: string): Promise<boolean> {
  const rows = await managementDb
    .select({ isEnterprise: customers.isEnterprise })
    .from(customers)
    .where(eq(customers.id, customerId))
    .limit(1);
  return rows[0]?.isEnterprise ?? false;
}

/**
 * Register a site's login name in the management DB (site_login_names table).
 * Tries the site name first; if globally taken, namespaces with the company name.
 * Returns the registered login name, or null if all candidates were already taken.
 */
async function registerSiteLoginName(
  customerId: string,
  siteId: string,
  siteName: string,
): Promise<string | null> {
  const custRows = await managementDb
    .select({ companyName: customers.companyName })
    .from(customers)
    .where(eq(customers.id, customerId))
    .limit(1);
  const companyName = custRows[0]?.companyName ?? customerId;

  const candidates = [
    siteName.trim(),
    `${companyName}: ${siteName.trim()}`,
    `${companyName} — ${siteName.trim()}`,
  ];

  for (const loginName of candidates) {
    try {
      await managementDb.insert(siteLoginNames).values({ customerId, siteId, loginName });
      return loginName;
    } catch (err: any) {
      if (err?.code === '23505') continue; // unique constraint — try next candidate
      throw err;
    }
  }
  return null; // all candidates conflicted (extremely rare)
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

// ── Request-scoped grant resolver ────────────────────────────────────────────
// Single helper so every route reads the same three values (userId, customerId,
// role) from the request and can never pass the wrong/partial arguments to
// resolveEnterpriseGrants.  All four call sites in this file MUST use this.

async function resolveGrantsForReq(req: import('express').Request) {
  const user = (req as any).user;
  return resolveEnterpriseGrants(
    user?.id ?? '',
    req.customerId!,
    user?.role,
  );
}

// ── Route registration ───────────────────────────────────────────────────────

export function registerEnterpriseSiteRoutes(app: Express): void {

  // ── List sites ─────────────────────────────────────────────────────────────
  app.get('/api/enterprise/sites', requireAuth, async (req, res) => {
    try {
      const customerId = req.customerId!;
      const user = (req as any).user;
      const custDb = await customerDbService.getCustomerDatabase(customerId);

      // Resolve grants so non-admin users only see (and can enumerate) their
      // authorised sites. enterprise_admin sees all sites.
      const grants = user?.id
        ? await resolveGrantsForReq(req)
        : { allowedSiteIds: [] as string[] };

      let query = custDb
        .select()
        .from(isolatedSchema.sites)
        .orderBy(isolatedSchema.sites.isDefault, isolatedSchema.sites.name);

      if (grants.allowedSiteIds !== 'all') {
        const allowed = grants.allowedSiteIds as string[];
        if (allowed.length === 0) {
          return res.json([]);
        }
        const rows = await custDb
          .select()
          .from(isolatedSchema.sites)
          .where(inArray(isolatedSchema.sites.id, allowed))
          .orderBy(isolatedSchema.sites.isDefault, isolatedSchema.sites.name);
        return res.json(rows);
      }

      const allSites = await query;
      return res.json(allSites);
    } catch (err) {
      logger.error('[enterprise/sites] GET sites error:', err);
      return res.status(500).json({ error: 'Failed to load sites' });
    }
  });

  // ── Get single site ────────────────────────────────────────────────────────
  app.get('/api/enterprise/sites/:id', requireAuth, requireEnterpriseRole('enterprise_admin', 'area_manager', 'site_coordinator'), async (req, res) => {
    try {
      const customerId = req.customerId!;
      const siteId = req.params.id;

      // Scope check: area_manager and site_coordinator may only view their allowed sites
      const grants = await resolveGrantsForReq(req);
      if (!grants.roles.includes('enterprise_admin')) {
        const allowed = Array.isArray(grants.allowedSiteIds) ? grants.allowedSiteIds : [];
        if (!allowed.includes(siteId)) {
          return res.status(403).json({ error: 'Site is outside your managed scope' });
        }
      }

      const custDb = await customerDbService.getCustomerDatabase(customerId);
      const rows = await custDb
        .select()
        .from(isolatedSchema.sites)
        .where(eq(isolatedSchema.sites.id, siteId))
        .limit(1);
      if (!rows[0]) return res.status(404).json({ error: 'Site not found' });
      return res.json(rows[0]);
    } catch (err) {
      logger.error('[enterprise/sites] GET site error:', err);
      return res.status(500).json({ error: 'Failed to load site' });
    }
  });

  // ── Create site ────────────────────────────────────────────────────────────
  const PROPERTY_TYPES = ['office', 'retail', 'industrial', 'warehouse', 'mixed_use', 'residential', 'other'] as const;

  const createSiteSchema = z.object({
    name: z.string().min(1).max(200),
    reference: z.string().max(50).optional().nullable(),
    address: z.string().max(500).optional().nullable(),
    addressLine2: z.string().max(500).optional().nullable(),
    city: z.string().max(200).optional().nullable(),
    county: z.string().max(200).optional().nullable(),
    postcode: z.string().max(20).optional().nullable(),
    region: z.string().max(100).optional().nullable(),
    areaId: z.string().optional().nullable(),
    status: z.enum(['active', 'onboarding', 'archived']).default('active'),
    siteContactName: z.string().max(200).optional().nullable(),
    siteContactRole: z.string().max(200).optional().nullable(),
    siteContactPhone: z.string().max(50).optional().nullable(),
    siteContactEmail: z.string().email().max(255).optional().nullable(),
    accessNotes: z.string().max(1000).optional().nullable(),
    propertyType: z.enum(PROPERTY_TYPES).optional().nullable(),
    clientName: z.string().max(200).optional().nullable(),
    managingSurveyor: z.string().max(200).optional().nullable(),
    floorArea: z.string().max(200).optional().nullable(),
    unitCount: z.number().int().nonnegative().optional().nullable(),
    what3words: z.string().max(60).optional().nullable(),
    mapLink: z.string().max(500).optional().nullable(),
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

      // Geocode postcode for estate map (non-fatal — a failure never blocks the save)
      let latitude: number | null = null;
      let longitude: number | null = null;
      if (body.data.postcode) {
        const coords = await geocodePostcode(body.data.postcode).catch(() => null);
        if (coords) { latitude = coords.lat; longitude = coords.lng; }
      }

      const [created] = await custDb
        .insert(isolatedSchema.sites)
        .values({
          name: body.data.name,
          reference,
          address: body.data.address ?? null,
          addressLine2: body.data.addressLine2 ?? null,
          city: body.data.city ?? null,
          county: body.data.county ?? null,
          postcode: body.data.postcode ?? null,
          region: body.data.region ?? null,
          areaId: body.data.areaId ?? null,
          status: body.data.status,
          isDefault: false,
          latitude,
          longitude,
          siteContactName: body.data.siteContactName ?? null,
          siteContactRole: body.data.siteContactRole ?? null,
          siteContactPhone: body.data.siteContactPhone ?? null,
          siteContactEmail: body.data.siteContactEmail ?? null,
          accessNotes: body.data.accessNotes ?? null,
          propertyType: body.data.propertyType ?? null,
          clientName: body.data.clientName ?? null,
          managingSurveyor: body.data.managingSurveyor ?? null,
          floorArea: body.data.floorArea ?? null,
          unitCount: body.data.unitCount ?? null,
          what3words: body.data.what3words ?? null,
          mapLink: body.data.mapLink ?? null,
        })
        .returning();

      // Register a global site login name so users can log in by typing the site name.
      let finalSite: typeof created = created;
      try {
        const loginSlug = await registerSiteLoginName(customerId, created.id, body.data.name);
        if (loginSlug) {
          const [withSlug] = await custDb
            .update(isolatedSchema.sites)
            .set({ loginSlug })
            .where(eq(isolatedSchema.sites.id, created.id))
            .returning();
          finalSite = withSlug ?? created;
          logger.info(`[enterprise/sites] Created site ${created.id} with login slug "${loginSlug}"`);
        }
      } catch (slugErr) {
        logger.warn(`[enterprise/sites] Login slug registration failed for ${created.id} (non-fatal):`, slugErr);
      }

      logger.info(`[enterprise/sites] Created site ${finalSite.id} for customer ${customerId}`);
      return res.status(201).json(finalSite);
    } catch (err: any) {
      if (err?.code === '23505') {
        return res.status(409).json({ error: 'Site reference already exists' });
      }
      logger.error('[enterprise/sites] POST site error:', err);
      return res.status(500).json({ error: 'Failed to create site' });
    }
  });

  // ── Update site login slug ──────────────────────────────────────────────────
  // Allows enterprise admins to rename the login slug for a site.
  // Atomically removes the old site_login_names entry and registers a new one.
  app.patch('/api/enterprise/sites/:id/login-slug', requireAuth, requireEnterpriseRole('enterprise_admin'), async (req, res) => {
    try {
      const customerId = req.customerId!;
      const siteId = req.params.id;

      const bodySchema = z.object({ loginSlug: z.string().min(1).max(200).trim() });
      const parsed = bodySchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: parsed.error.issues });

      const custDb = await customerDbService.getCustomerDatabase(customerId);
      const [existing] = await custDb
        .select({ id: isolatedSchema.sites.id, loginSlug: isolatedSchema.sites.loginSlug })
        .from(isolatedSchema.sites)
        .where(eq(isolatedSchema.sites.id, siteId))
        .limit(1);
      if (!existing) return res.status(404).json({ error: 'Site not found' });

      const newSlug = parsed.data.loginSlug;

      // Check global uniqueness first
      const conflict = await managementDb
        .select({ id: siteLoginNames.id })
        .from(siteLoginNames)
        .where(sql`LOWER(${siteLoginNames.loginName}) = LOWER(${newSlug})`)
        .limit(1);
      if (conflict[0]) {
        return res.status(409).json({ error: 'That login name is already in use by another site' });
      }

      // Remove old entry if it existed
      if (existing.loginSlug) {
        await managementDb
          .delete(siteLoginNames)
          .where(eq(siteLoginNames.loginName, existing.loginSlug));
      }

      // Insert new entry
      await managementDb.insert(siteLoginNames).values({ customerId, siteId, loginName: newSlug });

      // Update site record
      const [updated] = await custDb
        .update(isolatedSchema.sites)
        .set({ loginSlug: newSlug })
        .where(eq(isolatedSchema.sites.id, siteId))
        .returning();

      logger.info(`[enterprise/sites] Updated login slug for site ${siteId}: "${newSlug}"`);
      return res.json(updated);
    } catch (err: any) {
      if (err?.code === '23505') {
        return res.status(409).json({ error: 'That login name is already in use' });
      }
      logger.error('[enterprise/sites] PATCH login-slug error:', err);
      return res.status(500).json({ error: 'Failed to update login slug' });
    }
  });

  // ── Update / archive site ──────────────────────────────────────────────────
  const updateSiteSchema = z.object({
    name: z.string().min(1).max(200).optional(),
    reference: z.string().max(50).optional().nullable(),
    address: z.string().max(500).optional().nullable(),
    addressLine2: z.string().max(500).optional().nullable(),
    city: z.string().max(200).optional().nullable(),
    county: z.string().max(200).optional().nullable(),
    postcode: z.string().max(20).optional().nullable(),
    region: z.string().max(100).optional().nullable(),
    areaId: z.string().optional().nullable(),
    status: z.enum(['active', 'onboarding', 'archived']).optional(),
    siteContactName: z.string().max(200).optional().nullable(),
    siteContactRole: z.string().max(200).optional().nullable(),
    siteContactPhone: z.string().max(50).optional().nullable(),
    siteContactEmail: z.string().email().max(255).optional().nullable(),
    accessNotes: z.string().max(1000).optional().nullable(),
    propertyType: z.enum(PROPERTY_TYPES).optional().nullable(),
    clientName: z.string().max(200).optional().nullable(),
    managingSurveyor: z.string().max(200).optional().nullable(),
    floorArea: z.string().max(200).optional().nullable(),
    unitCount: z.number().int().nonnegative().optional().nullable(),
    what3words: z.string().max(60).optional().nullable(),
    mapLink: z.string().max(500).optional().nullable(),
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

      // Re-geocode when postcode is being changed
      if ('postcode' in body.data) {
        if (body.data.postcode) {
          const coords = await geocodePostcode(body.data.postcode).catch(() => null);
          updateValues.latitude = coords?.lat ?? null;
          updateValues.longitude = coords?.lng ?? null;
        } else {
          updateValues.latitude = null;
          updateValues.longitude = null;
        }
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

  // ── Backfill geocoding for sites missing coordinates ──────────────────────
  app.post('/api/enterprise/sites/geocode-missing', requireAuth, requireEnterpriseRole('enterprise_admin'), async (req, res) => {
    try {
      const customerId = req.customerId!;
      const custDb = await customerDbService.getCustomerDatabase(customerId);

      const needsGeo = await custDb
        .select({ id: isolatedSchema.sites.id, postcode: isolatedSchema.sites.postcode })
        .from(isolatedSchema.sites)
        .where(
          and(
            sql`${isolatedSchema.sites.postcode} is not null`,
            sql`(${isolatedSchema.sites.latitude} is null or ${isolatedSchema.sites.longitude} is null)`,
          ),
        );

      if (needsGeo.length === 0) {
        return res.json({ updated: 0, skipped: 0 });
      }

      const postcodes = needsGeo.map(s => s.postcode!);
      const geocoded = await geocodePostcodesBulk(postcodes);

      let updated = 0;
      let skipped = 0;

      for (const site of needsGeo) {
        const coords = geocoded.get(site.postcode!);
        if (!coords) { skipped++; continue; }
        await custDb
          .update(isolatedSchema.sites)
          .set({ latitude: coords.lat, longitude: coords.lng })
          .where(eq(isolatedSchema.sites.id, site.id));
        updated++;
      }

      return res.json({ updated, skipped });
    } catch (err) {
      logger.error('[enterprise/sites] geocode-missing error:', err);
      return res.status(500).json({ error: 'Geocoding backfill failed' });
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
      const user = (req as any).user;
      const { siteId } = req.body as { siteId: string | null };

      if (siteId !== null) {
        // Validate site belongs to this customer
        const valid = await validateSiteOwnership(customerId, siteId);
        if (!valid) {
          return res.status(404).json({ error: 'Site not found for this account' });
        }

        // Validate the caller's enterprise grants include this site.
        // enterprise_admin gets 'all'; area_manager and site_coordinator are
        // restricted to their granted sites only.
        if (!user?.id) {
          return res.status(401).json({ error: 'Not authenticated' });
        }
        const grants = await resolveGrantsForReq(req);
        if (grants.allowedSiteIds !== 'all') {
          if (!grants.allowedSiteIds.includes(siteId)) {
            return res.status(403).json({ error: 'You are not authorised to access this site' });
          }
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

  // ── List enterprise users (for grant picker) ───────────────────────────────
  // Requires enterprise_admin or area_manager role; returns active users only.
  app.get('/api/enterprise/users', requireAuth, requireEnterpriseRole('enterprise_admin', 'area_manager'), async (req, res) => {
    try {
      const customerId = req.customerId!;
      const custDb = await customerDbService.getCustomerDatabase(customerId);
      const rows = await custDb
        .select({
          id: isolatedSchema.users.id,
          username: isolatedSchema.users.username,
          firstName: isolatedSchema.users.firstName,
          lastName: isolatedSchema.users.lastName,
          email: (isolatedSchema.users as any).email,
          role: isolatedSchema.users.role,
        })
        .from(isolatedSchema.users)
        .orderBy(isolatedSchema.users.lastName, isolatedSchema.users.firstName);
      return res.json(rows);
    } catch (err) {
      logger.error('[enterprise/users] GET error:', err);
      return res.status(500).json({ error: 'Failed to load users' });
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
      const grants = await resolveGrantsForReq(req);
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
  // enterprise_admin / area_manager have full create access (existing).
  // site_coordinator with canManageSiteUsers=true may also grant site_coordinator roles,
  // but only for sites in their canManageSiteIds list (fail-closed).
  app.post('/api/enterprise/role-grants', requireAuth, requireEnterpriseRole('enterprise_admin', 'area_manager', 'site_coordinator'), async (req, res) => {
    try {
      const customerId = req.customerId!;
      const callerGrants = req.enterpriseGrants!;
      const isAdmin = callerGrants.roles.includes('enterprise_admin');
      const isAreaManager = !isAdmin && callerGrants.roles.includes('area_manager');
      const isSiteAdminOnly = !isAdmin && !isAreaManager && callerGrants.roles.includes('site_coordinator');

      // Block site_coordinator callers that don't have canManageSiteUsers power at all
      if (isSiteAdminOnly && callerGrants.canManageSiteIds.length === 0) {
        return res.status(403).json({ error: 'Insufficient enterprise role' });
      }

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

      // site_coordinator with canManageSiteUsers: may only grant site_coordinator for their own canManage sites
      if (isSiteAdminOnly) {
        if (role !== 'site_coordinator') {
          return res.status(403).json({ error: 'Site admins can only grant the site_coordinator role' });
        }
        if (!siteId || !callerGrants.canManageSiteIds.includes(siteId)) {
          return res.status(403).json({ error: 'Site is outside your user-management scope' });
        }
      }

      // Non-admin, non-site-admin: area_manager scope check
      if (!isAdmin && !isSiteAdminOnly) {
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
  // Also allowed by site_coordinator with canManageSiteUsers for grants within their canManage sites.
  app.delete('/api/enterprise/role-grants/:id', requireAuth, requireEnterpriseRole('enterprise_admin', 'area_manager', 'site_coordinator'), async (req, res) => {
    try {
      const customerId = req.customerId!;
      const callerGrants = req.enterpriseGrants!;
      const isAdmin = callerGrants.roles.includes('enterprise_admin');
      const isAreaManager = !isAdmin && callerGrants.roles.includes('area_manager');
      const isSiteAdminOnly = !isAdmin && !isAreaManager && callerGrants.roles.includes('site_coordinator');

      // Block site_coordinator callers that have no canManageSiteUsers power
      if (isSiteAdminOnly && callerGrants.canManageSiteIds.length === 0) {
        return res.status(403).json({ error: 'Insufficient enterprise role' });
      }

      const custDb = await customerDbService.getCustomerDatabase(customerId);

      // Load the grant to check scope + role
      const [target] = await custDb
        .select()
        .from(isolatedSchema.siteUserRoles)
        .where(eq(isolatedSchema.siteUserRoles.id, req.params.id))
        .limit(1);

      if (!target) return res.status(404).json({ error: 'Grant not found' });

      // site_coordinator with canManageSiteUsers: may only revoke site_coordinator grants for their canManage sites
      if (isSiteAdminOnly) {
        if (target.role !== 'site_coordinator') {
          return res.status(403).json({ error: 'Site admins can only revoke site_coordinator grants' });
        }
        if (!target.siteId || !callerGrants.canManageSiteIds.includes(target.siteId)) {
          return res.status(403).json({ error: 'Grant is outside your user-management scope' });
        }
      }

      // Non-admin, non-site-admin: area_manager checks
      if (!isAdmin && !isSiteAdminOnly) {
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

  // ── Create enterprise user + role grant in one step ─────────────────────
  // Creates a login for this customer AND grants an enterprise role.
  // Mirrors the platform-admin user creation path (bcrypt, same schema).
  // If username already exists → 409 { existingUserId } so the caller can offer
  // to grant the role to the existing account instead.
  const createEnterpriseUserSchema = z.object({
    username: z.string().min(1).max(50),
    password: z.string().min(8, 'Password must be at least 8 characters'),
    email: z.string().email('Invalid email').optional().nullable(),
    firstName: z.string().max(100).optional().nullable(),
    lastName: z.string().max(100).optional().nullable(),
    role: z.enum(['enterprise_admin', 'area_manager', 'site_coordinator']),
    areaId: z.string().optional().nullable(),
    siteId: z.string().optional().nullable(),
    canManageSiteUsers: z.boolean().optional(),
  });

  // Also accessible to site_coordinator with canManageSiteUsers=true (for their own site).
  app.post('/api/enterprise/users', requireAuth, requireEnterpriseRole('enterprise_admin', 'area_manager', 'site_coordinator'), async (req, res) => {
    try {
      const customerId = req.customerId!;
      const callerGrants = req.enterpriseGrants!;
      const isAdmin = callerGrants.roles.includes('enterprise_admin');
      const isAreaManager = !isAdmin && callerGrants.roles.includes('area_manager');
      const isSiteAdminOnly = !isAdmin && !isAreaManager && callerGrants.roles.includes('site_coordinator');
      const callerUser = (req as any).user;

      // Block site_coordinator callers that have no canManageSiteUsers power
      if (isSiteAdminOnly && callerGrants.canManageSiteIds.length === 0) {
        return res.status(403).json({ error: 'Insufficient enterprise role' });
      }

      const body = createEnterpriseUserSchema.safeParse(req.body);
      if (!body.success) return res.status(400).json({ error: body.error.issues[0]?.message ?? 'Validation failed' });

      const { username, password, email, firstName, lastName, role, areaId, siteId } = body.data;

      // Role field requirements
      if (role === 'area_manager' && !areaId) {
        return res.status(400).json({ error: 'area_manager role requires areaId' });
      }
      if (role === 'site_coordinator' && !siteId) {
        return res.status(400).json({ error: 'site_coordinator role requires siteId' });
      }
      if (role === 'enterprise_admin' && (areaId || siteId)) {
        return res.status(400).json({ error: 'enterprise_admin grants must not include areaId or siteId' });
      }

      // site_coordinator with canManageSiteUsers: may only create site_coordinator users for their canManage sites
      if (isSiteAdminOnly) {
        if (role !== 'site_coordinator') {
          return res.status(403).json({ error: 'Site admins can only create site_coordinator users' });
        }
        if (!siteId || !callerGrants.canManageSiteIds.includes(siteId)) {
          return res.status(403).json({ error: 'Site is outside your user-management scope' });
        }
      }

      // Non-admin, non-site-admin scope check (area_manager)
      if (!isAdmin && !isSiteAdminOnly) {
        if (role !== 'site_coordinator') {
          return res.status(403).json({ error: 'Area managers can only grant the site_coordinator role' });
        }
        if (!siteId || !Array.isArray(callerGrants.allowedSiteIds) || !(callerGrants.allowedSiteIds as string[]).includes(siteId)) {
          return res.status(403).json({ error: 'Site is outside your managed area' });
        }
      }

      const custDb = await customerDbService.getCustomerDatabase(customerId);

      // Check username uniqueness
      const [existing] = await custDb
        .select({ id: isolatedSchema.users.id })
        .from(isolatedSchema.users)
        .where(eq(isolatedSchema.users.username, username))
        .limit(1);

      if (existing) {
        return res.status(409).json({
          error: 'That username is already in use. You can grant a role to the existing account instead.',
          existingUserId: existing.id,
        });
      }

      // Create user (same path as platform-admin Manage Users)
      const hashedPassword = await bcrypt.hash(password, 10);
      const [newUser] = await custDb
        .insert(isolatedSchema.users)
        .values({
          username,
          password: hashedPassword,
          email: email?.trim() || null,
          firstName: firstName || null,
          lastName: lastName || null,
          role: 'user',
        })
        .returning({
          id: isolatedSchema.users.id,
          username: isolatedSchema.users.username,
          email: (isolatedSchema.users as any).email,
          firstName: isolatedSchema.users.firstName,
          lastName: isolatedSchema.users.lastName,
        });

      // Create role grant
      const [grant] = await custDb
        .insert(isolatedSchema.siteUserRoles)
        .values({ userId: newUser.id, role, areaId: areaId ?? null, siteId: siteId ?? null, canManageSiteUsers: body.data.canManageSiteUsers ?? false })
        .returning();

      logger.info(
        `[enterprise/users] CREATE: caller=${callerUser?.username} → newUser=${username} role=${role} areaId=${areaId ?? '-'} siteId=${siteId ?? '-'} customer=${customerId}`,
      );

      return res.status(201).json({ user: newUser, grant });
    } catch (err: any) {
      if (err?.code === '23505' && err?.constraint?.includes('username')) {
        return res.status(409).json({ error: 'That username is already in use.' });
      }
      logger.error('[enterprise/users] POST error:', err);
      return res.status(500).json({ error: 'Failed to create user' });
    }
  });

  // ── List users who can access a specific site ────────────────────────────
  // Returns site_coordinators for that site + area_managers for its area
  // + enterprise_admins, each enriched with user info and an isInherited flag.
  // Also accessible to site_coordinator with canManageSiteUsers=true for their own site.
  app.get('/api/enterprise/sites/:id/users', requireAuth, requireEnterpriseRole('enterprise_admin', 'area_manager', 'site_coordinator'), async (req, res) => {
    try {
      const customerId = req.customerId!;
      const siteId = req.params.id;
      const callerGrants = req.enterpriseGrants!;
      const isAdmin = callerGrants.roles.includes('enterprise_admin');

      if (!isAdmin) {
        const inAllowedSites = Array.isArray(callerGrants.allowedSiteIds) &&
          (callerGrants.allowedSiteIds as string[]).includes(siteId);
        const inCanManageSites = callerGrants.canManageSiteIds.includes(siteId);
        if (!inAllowedSites && !inCanManageSites) {
          return res.status(403).json({ error: 'Site is outside your managed scope' });
        }
      }

      const custDb = await customerDbService.getCustomerDatabase(customerId);

      const [site] = await custDb
        .select({ areaId: isolatedSchema.sites.areaId })
        .from(isolatedSchema.sites)
        .where(eq(isolatedSchema.sites.id, siteId))
        .limit(1);
      if (!site) return res.status(404).json({ error: 'Site not found' });

      const allGrants = await custDb.select().from(isolatedSchema.siteUserRoles);

      const relevant = allGrants.filter(g => {
        if (g.role === 'enterprise_admin') return true;
        if (g.role === 'area_manager' && site.areaId && g.areaId === site.areaId) return true;
        if (g.role === 'site_coordinator' && g.siteId === siteId) return true;
        return false;
      });

      const userIds = [...new Set(relevant.map(g => g.userId))];
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

      return res.json(relevant.map(g => ({
        ...g,
        user: userMap[g.userId] ?? null,
        isInherited: g.role !== 'site_coordinator',
      })));
    } catch (err) {
      logger.error('[enterprise/sites/:id/users] GET error:', err);
      return res.status(500).json({ error: 'Failed to load site users' });
    }
  });

  // ── Edit enterprise user details ─────────────────────────────────────────
  app.patch('/api/enterprise/users/:id', requireAuth, requireEnterpriseRole('enterprise_admin'), async (req, res) => {
    try {
      const customerId = req.customerId!;
      const targetId = req.params.id;
      const callerUser = (req as any).user;

      const bodySchema = z.object({
        firstName: z.string().max(100).optional().nullable(),
        lastName:  z.string().max(100).optional().nullable(),
        email:     z.string().email('Invalid email').optional().nullable(),
        username:  z.string().min(3).max(50).regex(/^[A-Za-z0-9_-]+$/, 'Username may only contain letters, numbers, underscores, and hyphens').optional(),
      });
      const parsed = bodySchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Validation failed' });

      const custDb = await customerDbService.getCustomerDatabase(customerId);

      const [target] = await custDb
        .select({ id: isolatedSchema.users.id, username: isolatedSchema.users.username })
        .from(isolatedSchema.users)
        .where(eq(isolatedSchema.users.id, targetId))
        .limit(1);
      if (!target) return res.status(404).json({ error: 'User not found' });

      if (parsed.data.username && parsed.data.username !== target.username) {
        const [conflict] = await custDb
          .select({ id: isolatedSchema.users.id })
          .from(isolatedSchema.users)
          .where(eq(isolatedSchema.users.username, parsed.data.username))
          .limit(1);
        if (conflict) return res.status(409).json({ error: 'That username is already in use.' });
      }

      const updates: Record<string, any> = {};
      if (parsed.data.firstName !== undefined) updates.firstName = parsed.data.firstName;
      if (parsed.data.lastName  !== undefined) updates.lastName  = parsed.data.lastName;
      if (parsed.data.email     !== undefined) updates.email     = parsed.data.email;
      if (parsed.data.username  !== undefined) updates.username  = parsed.data.username;

      if (Object.keys(updates).length === 0) return res.json({ ok: true });

      const [updated] = await custDb
        .update(isolatedSchema.users)
        .set(updates)
        .where(eq(isolatedSchema.users.id, targetId))
        .returning({
          id:        isolatedSchema.users.id,
          username:  isolatedSchema.users.username,
          firstName: isolatedSchema.users.firstName,
          lastName:  isolatedSchema.users.lastName,
          email:     (isolatedSchema.users as any).email,
        });

      logger.info(
        `[enterprise/users] EDIT: caller=${callerUser?.username} → target=${targetId} fields=${Object.keys(updates).join(',')} customer=${customerId}`,
      );
      return res.json({ user: updated });
    } catch (err: any) {
      if (err?.code === '23505') return res.status(409).json({ error: 'That username is already in use.' });
      logger.error('[enterprise/users] PATCH edit error:', err);
      return res.status(500).json({ error: 'Failed to update user' });
    }
  });

  // ── Reset enterprise user password ────────────────────────────────────────
  app.patch('/api/enterprise/users/:id/password', requireAuth, requireEnterpriseRole('enterprise_admin'), async (req, res) => {
    try {
      const customerId = req.customerId!;
      const targetId = req.params.id;
      const callerUser = (req as any).user;

      const bodySchema = z.object({ password: z.string().min(8, 'Password must be at least 8 characters') });
      const parsed = bodySchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Validation failed' });

      const custDb = await customerDbService.getCustomerDatabase(customerId);

      const [target] = await custDb
        .select({ id: isolatedSchema.users.id, username: isolatedSchema.users.username })
        .from(isolatedSchema.users)
        .where(eq(isolatedSchema.users.id, targetId))
        .limit(1);
      if (!target) return res.status(404).json({ error: 'User not found' });

      const hashedPassword = await bcrypt.hash(parsed.data.password, 10);
      await custDb
        .update(isolatedSchema.users)
        .set({ password: hashedPassword })
        .where(eq(isolatedSchema.users.id, targetId));

      logger.info(
        `[enterprise/users] PASSWORD_RESET: caller=${callerUser?.username} → target=${target.username} (${targetId}) customer=${customerId}`,
      );
      return res.json({ ok: true });
    } catch (err) {
      logger.error('[enterprise/users] PATCH password error:', err);
      return res.status(500).json({ error: 'Failed to reset password' });
    }
  });

  // ── Deactivate enterprise user ────────────────────────────────────────────
  app.patch('/api/enterprise/users/:id/deactivate', requireAuth, requireEnterpriseRole('enterprise_admin'), async (req, res) => {
    try {
      const customerId = req.customerId!;
      const targetId = req.params.id;
      const callerUser = (req as any).user;

      const custDb = await customerDbService.getCustomerDatabase(customerId);

      const [target] = await custDb
        .select({ id: isolatedSchema.users.id, username: isolatedSchema.users.username })
        .from(isolatedSchema.users)
        .where(eq(isolatedSchema.users.id, targetId))
        .limit(1);
      if (!target) return res.status(404).json({ error: 'User not found' });

      await custDb
        .update(isolatedSchema.users)
        .set({ isActive: false })
        .where(eq(isolatedSchema.users.id, targetId));

      logger.info(
        `[enterprise/users] DEACTIVATE: caller=${callerUser?.username} → target=${target.username} (${targetId}) customer=${customerId}`,
      );
      return res.json({ ok: true });
    } catch (err) {
      logger.error('[enterprise/users] PATCH deactivate error:', err);
      return res.status(500).json({ error: 'Failed to deactivate user' });
    }
  });

  // ── Diagnostic: NULL site_id integrity check ─────────────────────────────
  // Returns per-table counts of rows with site_id IS NULL. Used by the
  // site-isolation test script and manual audits. Requires enterprise_admin.
  const SITE_SCOPED_TABLES = [
    'staff', 'visitors', 'members', 'visitor_history', 'staff_attendance_history',
    'pre_bookings', 'departments', 'muster_points', 'evacuation_zones', 'safety_tokens',
    'contractor_companies', 'contractor_workers', 'contractor_documents',
    'compliance_documents', 'rams_documents', 'worker_certifications',
    'induction_tokens', 'contractor_visits', 'contractor_prebookings',
    'local_labour_records', 'meeting_rooms', 'room_bookings', 'ppm_assets',
    'ppm_work_orders', 'cdm_projects', 'hs_incidents', 'fire_risk_assessments',
    'compliance_certificates', 'permit_to_work', 'audit_records',
    'ra_builder_assessments', 'incident_reports', 'lone_worker_sessions',
    'help_desk_tickets',
  ] as const;

  app.get('/api/enterprise/diagnostics/site-id-integrity', requireAuth, requireEnterpriseRole('enterprise_admin'), async (req, res) => {
    try {
      const { customerId } = (req as any).customerContext;
      const custDb = await customerDbService.getCustomerDatabase(customerId);
      const results: Record<string, number> = {};

      for (const table of SITE_SCOPED_TABLES) {
        try {
          const rows = await custDb.execute(
            `SELECT COUNT(*)::int AS cnt FROM ${table} WHERE site_id IS NULL`
          );
          results[table] = (rows.rows?.[0]?.cnt as number) ?? 0;
        } catch {
          results[table] = -1;
        }
      }

      const violations = Object.entries(results).filter(([, cnt]) => cnt > 0);
      return res.json({
        ok: violations.length === 0,
        violations: Object.fromEntries(violations),
        all: results,
      });
    } catch (err) {
      logger.error('[enterprise/diagnostics] site-id-integrity error:', err);
      return res.status(500).json({ error: 'Diagnostic check failed' });
    }
  });
}
