/**
 * ENTERPRISE ROLE GRANTS
 * ======================
 * Resolution and enforcement of enterprise multi-site roles.
 *
 * Three roles, each with an additive scope:
 *   enterprise_admin   → all sites for this customer
 *   area_manager       → all sites within their granted areas
 *   site_coordinator   → their explicit site(s) only
 *
 * Grants are stored in `site_user_roles` in the isolated customer DB.
 * `requireEnterpriseRole(...)` is an Express middleware factory that:
 *   1. Resolves the caller's effective site scope from their grants.
 *   2. Rejects (403) if they hold none of the required roles.
 *   3. Attaches `req.enterpriseGrants` for downstream handlers.
 *
 * Non-enterprise customers: middleware returns 403 — enterprise routes are
 * gated at a higher level (isEnterprise check) or simply never applied.
 *
 * Fail closed: no grant = empty allowedSiteIds = 403.
 */

import type { Request, Response, NextFunction } from 'express';
import { eq, inArray } from 'drizzle-orm';
import { customerDbService } from './customerDatabase';
import { db as managementDb } from './db';
import { customers } from '@shared/schema';
import * as isolatedSchema from './isolatedSchema';
import { logger } from './utils/logger';

// ── Types ──────────────────────────────────────────────────────────────────────

export type EnterpriseRole = 'enterprise_admin' | 'area_manager' | 'site_coordinator';

export interface ResolvedGrants {
  /** Distinct roles held by this user (union of all grants). */
  roles: EnterpriseRole[];
  /**
   * 'all'  → enterprise_admin (no site restriction).
   * array  → explicit site-id allowlist (empty = no access).
   */
  allowedSiteIds: string[] | 'all';
  /**
   * Site IDs where this user has explicit user-management power
   * (site_coordinator with canManageSiteUsers=true).
   * enterprise_admin gets [] because their full access is expressed via allowedSiteIds='all'.
   */
  canManageSiteIds: string[];
}

// Extend Express Request so downstream handlers can read grants without re-querying.
declare global {
  namespace Express {
    interface Request {
      enterpriseGrants?: ResolvedGrants;
    }
  }
}

// ── Grant resolution ───────────────────────────────────────────────────────────

/**
 * Resolve a user's effective site scope from their site_user_roles grants.
 *
 * - enterprise_admin  → { roles: [...], allowedSiteIds: 'all' }
 * - area_manager      → sites whose area_id is in the user's granted areas
 * - site_coordinator  → explicit site(s) only
 * - no grants         → { roles: [], allowedSiteIds: [] }
 *
 * Grants are additive — union of all grants forms the effective scope.
 * Called by both requireEnterpriseRole() and siteScope.ts.
 *
 * @param userRole  The user's platform role (e.g. 'admin', 'hr_admin').
 *                  Users with role='admin' are automatically enterprise_admin.
 */
export async function resolveEnterpriseGrants(
  userId: string,
  customerId: string,
  userRole?: string,
): Promise<ResolvedGrants> {
  // Platform admins automatically have enterprise_admin scope — but ONLY for
  // enterprise customers.  A non-enterprise customer's admin should not receive
  // any enterprise role (they would still 403 on requireEnterpriseRole, but
  // it is cleaner to resolve correctly rather than relying on that gate).
  if (userRole === 'admin') {
    try {
      const custRows = await managementDb
        .select({ isEnterprise: customers.isEnterprise })
        .from(customers)
        .where(eq(customers.id, customerId))
        .limit(1);
      if (custRows[0]?.isEnterprise) {
        return { roles: ['enterprise_admin'], allowedSiteIds: 'all', canManageSiteIds: [] };
      }
      // Not an enterprise customer — fall through to the grants-based resolution,
      // which will return empty (non-enterprise customers have no site_user_roles).
    } catch (err) {
      logger.error('[enterpriseRoles] isEnterprise check failed — failing closed:', err);
      return { roles: [], allowedSiteIds: [], canManageSiteIds: [] };
    }
  }

  try {
    const custDb = await customerDbService.getCustomerDatabase(customerId);

    const grants = await custDb
      .select()
      .from(isolatedSchema.siteUserRoles)
      .where(eq(isolatedSchema.siteUserRoles.userId, userId));

    if (grants.length === 0) {
      return { roles: [], allowedSiteIds: [] };
    }

    const roles = [...new Set(grants.map(g => g.role as EnterpriseRole))];

    // enterprise_admin → unrestricted; canManageSiteIds unused (they use allowedSiteIds='all')
    if (roles.includes('enterprise_admin')) {
      return { roles, allowedSiteIds: 'all', canManageSiteIds: [] };
    }

    const allowedSet = new Set<string>();

    // area_manager → all sites whose area_id matches a granted area
    const areaGrants = grants.filter(g => g.role === 'area_manager' && g.areaId);
    if (areaGrants.length > 0) {
      const areaIds = areaGrants.map(g => g.areaId!);
      const sitesInAreas = await custDb
        .select({ id: isolatedSchema.sites.id })
        .from(isolatedSchema.sites)
        .where(inArray(isolatedSchema.sites.areaId, areaIds));
      sitesInAreas.forEach(s => allowedSet.add(s.id));
    }

    // site_coordinator → explicit site(s)
    grants
      .filter(g => g.role === 'site_coordinator' && g.siteId)
      .forEach(g => allowedSet.add(g.siteId!));

    // canManageSiteIds: site_coordinator grants that have explicit user-management power
    const canManageSiteIds = grants
      .filter(g => g.role === 'site_coordinator' && g.canManageSiteUsers && g.siteId)
      .map(g => g.siteId!);

    return { roles, allowedSiteIds: [...allowedSet], canManageSiteIds };
  } catch (err) {
    logger.error('[enterpriseRoles] resolveEnterpriseGrants error:', err);
    // Fail closed on error.
    return { roles: [], allowedSiteIds: [], canManageSiteIds: [] };
  }
}

// ── Middleware factory ─────────────────────────────────────────────────────────

/**
 * Express middleware factory.
 *
 * Usage:
 *   app.post('/api/enterprise/sites', requireAuth, requireEnterpriseRole('enterprise_admin'), handler)
 *   app.get('/api/enterprise/role-grants', requireAuth, requireEnterpriseRole('enterprise_admin','area_manager'), handler)
 *
 * Attaches req.enterpriseGrants so route handlers can read the resolved scope
 * without re-querying the DB.
 */
export function requireEnterpriseRole(...allowedRoles: EnterpriseRole[]) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = (req as any).user;
      const customerId = req.customerId;

      if (!user?.id || !customerId) {
        res.status(401).json({ error: 'Not authenticated' });
        return;
      }

      const grants = await resolveEnterpriseGrants(user.id, customerId, user.role);

      const hasRole = grants.roles.some(r => allowedRoles.includes(r));
      if (!hasRole) {
        res.status(403).json({
          error: 'Insufficient enterprise role',
          required: allowedRoles,
          held: grants.roles,
        });
        return;
      }

      req.enterpriseGrants = grants;
      next();
    } catch (err) {
      logger.error('[enterpriseRoles] requireEnterpriseRole error:', err);
      next(err);
    }
  };
}
