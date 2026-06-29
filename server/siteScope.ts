/**
 * SITE ISOLATION BOUNDARY
 * ========================
 * This module is the single mandatory gating point for all data access to
 * site-scoped tables in the Enterprise Multi-Site model.
 *
 * ALL reads and writes to the 34 site-scoped tables MUST go through
 * getScopedDb() / scopedWhere() / withSiteId().
 *
 * Bypassing these helpers on site-scoped tables is a SECURITY DEFECT that
 * breaks enterprise multi-site isolation and violates the data boundary
 * between sites within a customer account.
 *
 * Site-scoped tables (34):
 *   staff, visitors, members, visitor_history, staff_attendance_history,
 *   pre_bookings, departments, muster_points, evacuation_zones,
 *   safety_tokens, contractor_companies, contractor_workers,
 *   contractor_documents, compliance_documents, worker_certifications,
 *   rams_documents, induction_tokens, contractor_visits,
 *   contractor_prebookings, local_labour_records, meeting_rooms,
 *   room_bookings, ppm_assets, ppm_work_orders, cdm_projects,
 *   hs_incidents, fire_risk_assessments, compliance_certificates,
 *   permit_to_work, audit_records, ra_builder_assessments,
 *   incident_reports, lone_worker_sessions, help_desk_tickets.
 *
 * Non-enterprise customers are completely unaffected — scopedWhere()
 * returns undefined (no extra filter) and their single default site id is
 * stamped on all new writes by withSiteId().
 */

import type { Request } from 'express';
import { eq, and, inArray, SQL, sql } from 'drizzle-orm';
import { customerDbService } from './customerDatabase';
import { db as managementDb } from './db';
import { customers } from '@shared/schema';
import * as isolatedSchema from './isolatedSchema';
import { resolveEnterpriseGrants } from './enterpriseRoles';
import { logger } from './utils/logger';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface SiteContext {
  isEnterprise: boolean;
  /** null = non-enterprise (single-site, no per-site filter). */
  activeSiteId: string | null;
  /** 'all' = non-enterprise; array = enterprise allowed sites. */
  allowedSiteIds: string[] | 'all';
}

export class SiteContextError extends Error {
  readonly statusCode = 403;
  constructor(message: string) {
    super(message);
    this.name = 'SiteContextError';
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Default-site cache  (in-memory, per customerId, survives for process lifetime)
// Fine to hold long-term because the default site for a customer rarely changes.
// ─────────────────────────────────────────────────────────────────────────────

const defaultSiteIdCache = new Map<string, string>();

async function resolveDefaultSiteId(
  customerId: string,
  custDb: Awaited<ReturnType<typeof customerDbService.getCustomerDatabase>>,
): Promise<string | null> {
  if (defaultSiteIdCache.has(customerId)) return defaultSiteIdCache.get(customerId)!;

  try {
    const rows = await custDb
      .select({ id: isolatedSchema.sites.id })
      .from(isolatedSchema.sites)
      .where(eq(isolatedSchema.sites.isDefault, true))
      .limit(1);

    const id = rows[0]?.id ?? null;
    if (id) defaultSiteIdCache.set(customerId, id);
    return id;
  } catch (err: any) {
    // 42P01 = relation does not exist — sites table not yet migrated for this customer.
    // Safe to return null: non-enterprise reads need no site filter, and withSiteId()
    // already handles null siteId gracefully for writes.  Do not throw — that would
    // crash every data-loading API for standard customers that haven't run migration 065 yet.
    const isMissingTable =
      err?.cause?.code === '42P01' ||
      err?.code === '42P01' ||
      String(err?.message).includes('does not exist');
    if (isMissingTable) {
      logger.warn(`[siteScope] sites table missing for ${customerId} — ensureSitesTable will repair on next startup`);
      return null;
    }
    throw err;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Context resolution
// ─────────────────────────────────────────────────────────────────────────────

async function resolveSiteContext(req: Request): Promise<SiteContext> {
  const customerId = req.customerId!;

  try {
    const rows = await managementDb
      .select({ isEnterprise: customers.isEnterprise })
      .from(customers)
      .where(eq(customers.id, customerId))
      .limit(1);

    const isEnterprise = rows[0]?.isEnterprise ?? false;

    if (!isEnterprise) {
      return { isEnterprise: false, activeSiteId: null, allowedSiteIds: 'all' };
    }

    // Enterprise path — fail closed: active site MUST be in the session.
    const activeSiteId: string | null = (req.session as any)?.activeSiteId ?? null;

    if (!activeSiteId) {
      throw new SiteContextError(
        'Enterprise session has no active site. Select a site before accessing site-scoped resources.',
      );
    }

    // Resolve per-user site allowlist from enterprise role grants.
    // Fail closed: no grant → empty allowlist → 403 on any site-scoped query.
    const userId = (req as any).user?.id;
    const userRole = (req as any).user?.role;
    let allowedSiteIds: string[] | 'all';
    if (!userId) {
      allowedSiteIds = [];
    } else {
      const grants = await resolveEnterpriseGrants(userId, customerId, userRole);
      allowedSiteIds = grants.allowedSiteIds;
    }

    // Security: verify the session's active site is within the user's grant.
    // This catches stale sessions after grant revocation and any tampering that
    // somehow bypassed the POST /api/enterprise/active-site check.
    if (allowedSiteIds !== 'all' && !allowedSiteIds.includes(activeSiteId)) {
      // Clear the invalid site from the session so it does not keep triggering
      // this error on every request after a grant change.
      (req.session as any).activeSiteId = undefined;
      throw new SiteContextError(
        'Active site is outside your authorised site grants. Please select a permitted site.',
      );
    }

    return { isEnterprise: true, activeSiteId, allowedSiteIds };
  } catch (err) {
    if (err instanceof SiteContextError) throw err;

    // Graceful degradation in dev-bypass / DB-unreachable scenarios.
    logger.warn('[siteScope] Could not resolve site context — defaulting to non-enterprise:', err);
    return { isEnterprise: false, activeSiteId: null, allowedSiteIds: 'all' };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get the site-scoped database handle for a request.
 *
 * - Lazily resolves and caches SiteContext on req.siteContext.
 * - For enterprise with no active site: throws SiteContextError (403).
 * - For non-enterprise: siteId is the customer's default site (for write-stamping).
 */
export async function getScopedDb(req: Request): Promise<{
  db: Awaited<ReturnType<typeof customerDbService.getCustomerDatabase>>;
  siteId: string | null;
  siteContext: SiteContext;
}> {
  if (!req.siteContext) {
    req.siteContext = await resolveSiteContext(req);
  }

  const ctx = req.siteContext;
  const db = await customerDbService.getCustomerDatabase(req.customerId!);

  let siteId: string | null = ctx.activeSiteId;

  // Non-enterprise: resolve default site id so writes are stamped correctly.
  if (!ctx.isEnterprise) {
    siteId = await resolveDefaultSiteId(req.customerId!, db);
  }

  return { db, siteId, siteContext: ctx };
}

/**
 * Build a Drizzle WHERE condition that scopes a query to the active site.
 *
 * Non-enterprise (allowedSiteIds = 'all')  → undefined  (no extra filter).
 * Enterprise single-site (activeSiteId set) → eq(table.siteId, activeSiteId).
 * Enterprise multi-site with array         → inArray(table.siteId, ids).
 *
 * Use inside and(...):
 *   .where(and(otherCondition, scopedWhere(ctx, isolatedSchema.visitors)))
 * When scopedWhere returns undefined, Drizzle's and() ignores it automatically.
 */
export function scopedWhere(
  ctx: SiteContext,
  table: { siteId: any },
): SQL | undefined {
  if (!ctx.isEnterprise) return undefined;

  if (ctx.activeSiteId) {
    // When an active site is selected in the session, always scope to it —
    // even for enterprise_admin users.  An admin operating in "Site A context"
    // should only see Site A data, consistent with how GET /api/visitors and
    // GET /api/staff filter using activeSiteId directly.
    //
    // Defense-in-depth for scoped roles: if allowedSiteIds is an explicit list
    // (site_coordinator / area_manager), verify activeSiteId is in the grant.
    // Enterprise-admin has allowedSiteIds='all' and bypasses this array check.
    if (
      Array.isArray(ctx.allowedSiteIds) &&
      !ctx.allowedSiteIds.includes(ctx.activeSiteId)
    ) {
      return sql`false`;
    }
    return eq(table.siteId, ctx.activeSiteId);
  }

  // No active site selected — apply grant-based list filter.
  if (ctx.allowedSiteIds === 'all') return undefined;

  if (Array.isArray(ctx.allowedSiteIds) && ctx.allowedSiteIds.length > 0) {
    return inArray(table.siteId, ctx.allowedSiteIds);
  }

  // Safety: no allowed sites → return no rows.
  return sql`false`;
}

/**
 * Stamp the active siteId onto an INSERT / UPDATE values object.
 *
 * Non-enterprise: siteId = default site id (or null if not resolved yet).
 * Enterprise:     siteId = active site id.
 *
 * Leaves the object unchanged when siteId is null (should not happen in
 * normal operation — a missing default site is a data-setup problem, not a
 * security problem, so we do not hard-block here).
 */
export function withSiteId<T extends Record<string, any>>(
  siteId: string | null,
  values: T,
): T {
  if (!siteId) return values;
  return { ...values, siteId };
}

/**
 * Express error handler for SiteContextError.
 * Call this in catch blocks that use getScopedDb():
 *   } catch (err) {
 *     if (err instanceof SiteContextError) return res.status(403).json({ error: err.message });
 *     ...
 *   }
 */
export { SiteContextError as default };
