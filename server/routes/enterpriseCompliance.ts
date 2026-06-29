/**
 * Enterprise Compliance API — Phase 3b
 *
 * All endpoints under /api/enterprise/compliance/...
 * Scope is enforced via requireEnterpriseRole + resolveEnterpriseGrants.
 * Fail closed: no grant → empty allowedSiteIds → no data returned.
 */

import type { Express } from 'express';
import { sql, eq, and, lte, gte, inArray, ne, isNull, or } from 'drizzle-orm';
import { requireAuth } from '../auth';
import { requireEnterpriseRole, resolveEnterpriseGrants } from '../enterpriseRoles';
import { customerDbService } from '../customerDatabase';
import * as iso from '../isolatedSchema';
import { computeLiveScores, evaluateSite, DEFAULT_WEIGHTS, DEFAULT_PENALTY, CATEGORIES } from '../complianceEngine';
import { logger } from '../utils/logger';

// ── Simple in-memory cache (60 s TTL) per (customerId + scopeKey) ─────────────
const _summaryCache = new Map<string, { ts: number; data: unknown }>();
const CACHE_TTL_MS = 60_000;

function cacheGet(key: string): unknown | null {
  const entry = _summaryCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_TTL_MS) { _summaryCache.delete(key); return null; }
  return entry.data;
}
function cacheSet(key: string, data: unknown): void {
  _summaryCache.set(key, { ts: Date.now(), data });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildScopeKey(allowedSiteIds: string[] | 'all'): string {
  return allowedSiteIds === 'all' ? 'all' : allowedSiteIds.slice().sort().join(',');
}

/** Resolve allowed site IDs for the caller; returns 'all' for enterprise_admin. */
async function callerScope(req: any): Promise<string[] | 'all'> {
  const grants = req.enterpriseGrants;
  if (!grants) return [];
  if (grants.roles.includes('enterprise_admin')) return 'all';
  return Array.isArray(grants.allowedSiteIds) ? grants.allowedSiteIds : [];
}

/** Enrich site rows with their last snapshot score. */
async function loadSiteNames(custDb: any, siteIds: string[]): Promise<Map<string, string>> {
  if (siteIds.length === 0) return new Map();
  const rows = await custDb
    .select({ id: iso.sites.id, name: iso.sites.name })
    .from(iso.sites)
    .where(inArray(iso.sites.id, siteIds));
  return new Map(rows.map((r: any) => [r.id, r.name]));
}

// ── On-demand freshness ───────────────────────────────────────────────────────
// computeLiveScores only READS materialised compliance_items, so date-based
// statuses (e.g. PPM that became overdue since the last evaluation) can drift out
// of date. Before scoring we re-evaluate in-scope sites, bounded by a per-site TTL
// and an in-flight lock so a burst of requests triggers at most one evaluation per
// site per window. evaluateSite is idempotent (item upsert + alert sync). Sites are
// evaluated sequentially to respect the small per-customer DB connection pool.
const EVAL_TTL_MS = 120_000;
const _siteEvalTs = new Map<string, number>();
const _siteEvalInflight = new Map<string, Promise<void>>();

async function ensureFreshComplianceEvaluation(customerId: string, siteIds: string[]): Promise<void> {
  const now = Date.now();
  for (const siteId of siteIds) {
    const key = `${customerId}:${siteId}`;
    if (now - (_siteEvalTs.get(key) ?? 0) < EVAL_TTL_MS) continue; // recently evaluated

    let p = _siteEvalInflight.get(key);
    if (!p) {
      p = evaluateSite(customerId, siteId)
        .then(() => { _siteEvalTs.set(key, Date.now()); })
        .catch(err => logger.warn(`[compliance] freshness eval failed site=${siteId}:`, err))
        .finally(() => { _siteEvalInflight.delete(key); });
      _siteEvalInflight.set(key, p);
    }
    await p;
  }
}

/** Active (non-archived) site IDs visible to the caller. */
async function inScopeActiveSiteIds(custDb: any, allowed: string[] | 'all'): Promise<string[]> {
  const rows = await custDb.select({ id: iso.sites.id }).from(iso.sites).where(ne(iso.sites.status, 'archived'));
  const ids = rows.map((r: any) => r.id as string);
  return allowed === 'all' ? ids : ids.filter((id: string) => allowed.includes(id));
}

// ── Route registration ────────────────────────────────────────────────────────

export function registerEnterpriseComplianceRoutes(app: Express): void {

  const ROLE_GATE = requireEnterpriseRole('enterprise_admin', 'area_manager', 'site_coordinator');

  // ── GET /api/enterprise/compliance/summary ─────────────────────────────────
  // Returns estate score + per-category scores + headline stats.
  // Cached 60 s per scope; if no items exist yet, triggers a background evaluation.
  app.get('/api/enterprise/compliance/summary', requireAuth, ROLE_GATE, async (req, res) => {
    try {
      const customerId = req.customerId!;
      const allowed = await callerScope(req);
      const cacheKey = `${customerId}:${buildScopeKey(allowed)}`;

      const cached = cacheGet(cacheKey);
      if (cached) return res.json(cached);

      const custDb = await customerDbService.getCustomerDatabase(customerId);

      // Fire-and-forget freshness: kick off a background re-evaluation so date-based
      // statuses (e.g. overdue PPM) stay current, but don't block the response —
      // the summary returns current materialised data immediately and the next
      // request will reflect any newly evaluated statuses.
      inScopeActiveSiteIds(custDb, allowed)
        .then(ids => ensureFreshComplianceEvaluation(customerId, ids))
        .catch(err => logger.warn('[compliance/summary] background eval error:', err));

      const { estateScore, siteScores, categoryScores } = await computeLiveScores(custDb, allowed);

      // Headline stats
      const allSiteIds = siteScores.map(s => s.siteId);
      let openCriticals = 0;
      let openWarnings = 0;
      let totalItems = 0;
      let expiringItems = 0;

      if (allSiteIds.length > 0) {
        const alerts = await custDb
          .select({ severity: iso.complianceAlerts.severity, status: iso.complianceAlerts.status })
          .from(iso.complianceAlerts)
          .where(and(inArray(iso.complianceAlerts.siteId, allSiteIds), inArray(iso.complianceAlerts.status, ['open'])));
        openCriticals = alerts.filter((a: any) => a.severity === 'critical').length;
        openWarnings  = alerts.filter((a: any) => a.severity === 'warning').length;

        const items = await custDb
          .select({ status: iso.complianceItems.status })
          .from(iso.complianceItems)
          .where(inArray(iso.complianceItems.siteId, allSiteIds));
        totalItems    = items.length;
        expiringItems = items.filter((i: any) => i.status === 'expiring').length;
      }

      const siteNames = await loadSiteNames(custDb, siteScores.map(s => s.siteId));

      const payload = {
        estateScore,
        categoryScores,
        siteCount: siteScores.length,
        openCriticals,
        openWarnings,
        totalItems,
        expiringItems,
        siteScores: siteScores
          .map(s => ({ siteId: s.siteId, siteName: siteNames.get(s.siteId) ?? 'Unnamed site', score: s.score }))
          .sort((a, b) => a.score - b.score),   // worst-first so problem sites surface without scrolling
        generatedAt: new Date().toISOString(),
      };

      cacheSet(cacheKey, payload);
      return res.json(payload);
    } catch (err) {
      logger.error('[compliance/summary] error:', err);
      return res.status(500).json({ error: 'Failed to load compliance summary' });
    }
  });

  // ── GET /api/enterprise/compliance/sites ──────────────────────────────────
  // Per-site breakdown table: score, category scores, open alert counts,
  // contractor count, and on-site headcount.
  app.get('/api/enterprise/compliance/sites', requireAuth, ROLE_GATE, async (req, res) => {
    try {
      const customerId = req.customerId!;
      const allowed = await callerScope(req);
      const custDb = await customerDbService.getCustomerDatabase(customerId);

      // Re-evaluate in-scope sites so the Sites page reflects current statuses
      // (e.g. overdue PPM) before scoring. Bounded by a per-site TTL + in-flight lock.
      const scopeSiteIds = await inScopeActiveSiteIds(custDb, allowed);
      await ensureFreshComplianceEvaluation(customerId, scopeSiteIds);

      const { siteScores } = await computeLiveScores(custDb, allowed);
      const siteIds = siteScores.map(s => s.siteId);
      const nameMap = await loadSiteNames(custDb, siteIds);

      // Open alert counts per site
      let alertMap = new Map<string, { critical: number; warning: number }>();
      // Contractor counts per site (distinct companies with clearances)
      let contractorMap = new Map<string, number>();
      // On-site headcount per site (staff + visitors currently checked in)
      let onSiteMap = new Map<string, number>();

      if (siteIds.length > 0) {
        const [alerts, clearances, checkedInStaff, checkedInVisitors] = await Promise.all([
          custDb
            .select({ siteId: iso.complianceAlerts.siteId, severity: iso.complianceAlerts.severity })
            .from(iso.complianceAlerts)
            .where(and(inArray(iso.complianceAlerts.siteId, siteIds), eq(iso.complianceAlerts.status, 'open'))),
          custDb
            .select({ siteId: iso.contractorSiteClearances.siteId, companyId: iso.contractorSiteClearances.companyId })
            .from(iso.contractorSiteClearances)
            .where(inArray(iso.contractorSiteClearances.siteId, siteIds)),
          custDb
            .select({ siteId: iso.staff.siteId })
            .from(iso.staff)
            .where(and(inArray(iso.staff.siteId, siteIds), eq(iso.staff.isCheckedIn, true))),
          custDb
            .select({ siteId: iso.visitors.siteId })
            .from(iso.visitors)
            .where(and(inArray(iso.visitors.siteId, siteIds), eq(iso.visitors.isCheckedIn, true))),
        ]);

        for (const a of alerts) {
          const cur = alertMap.get(a.siteId) ?? { critical: 0, warning: 0 };
          if (a.severity === 'critical') cur.critical++;
          else if (a.severity === 'warning') cur.warning++;
          alertMap.set(a.siteId, cur);
        }

        // Count distinct contractor companies per site
        const contractorBySite = new Map<string, Set<string>>();
        for (const c of clearances) {
          if (!c.siteId) continue;
          const set = contractorBySite.get(c.siteId) ?? new Set();
          set.add(c.companyId);
          contractorBySite.set(c.siteId, set);
        }
        for (const [sid, companies] of contractorBySite) {
          contractorMap.set(sid, companies.size);
        }

        // Sum on-site people per site
        for (const row of [...checkedInStaff, ...checkedInVisitors]) {
          if (!row.siteId) continue;
          onSiteMap.set(row.siteId, (onSiteMap.get(row.siteId) ?? 0) + 1);
        }
      }

      const result = siteScores.map(s => ({
        siteId: s.siteId,
        siteName: nameMap.get(s.siteId) ?? s.siteId,
        score: s.score,
        categoryScores: s.categoryScores,
        openCriticals:    alertMap.get(s.siteId)?.critical ?? 0,
        openWarnings:     alertMap.get(s.siteId)?.warning ?? 0,
        contractorCount:  contractorMap.get(s.siteId) ?? 0,
        onSiteCount:      onSiteMap.get(s.siteId) ?? 0,
      })).sort((a, b) => a.score - b.score); // worst sites first

      return res.json(result);
    } catch (err) {
      logger.error('[compliance/sites] error:', err);
      return res.status(500).json({ error: 'Failed to load site breakdown' });
    }
  });

  // ── GET /api/enterprise/compliance/alerts ─────────────────────────────────
  // Ranked: critical first, newest within severity.
  // Query params: severity, siteId, category, status (default: open,acknowledged)
  app.get('/api/enterprise/compliance/alerts', requireAuth, ROLE_GATE, async (req, res) => {
    try {
      const customerId = req.customerId!;
      const allowed = await callerScope(req);
      const custDb = await customerDbService.getCustomerDatabase(customerId);

      const { severity, siteId, category, status: statusParam } = req.query as Record<string, string>;
      const statuses = statusParam ? statusParam.split(',') : ['open', 'acknowledged'];

      // Build allowed site list
      let allSiteIds: string[] = [];
      if (allowed === 'all') {
        const sites = await custDb.select({ id: iso.sites.id }).from(iso.sites).where(ne(iso.sites.status, 'archived'));
        allSiteIds = sites.map((s: any) => s.id);
      } else {
        allSiteIds = allowed;
      }

      if (siteId && !allSiteIds.includes(siteId)) {
        return res.json([]); // caller not entitled to this site
      }

      const targetSiteIds = siteId ? [siteId] : allSiteIds;
      if (targetSiteIds.length === 0) return res.json([]);

      let q = custDb
        .select()
        .from(iso.complianceAlerts)
        .where(
          and(
            inArray(iso.complianceAlerts.siteId, targetSiteIds),
            inArray(iso.complianceAlerts.status, statuses),
            severity ? eq(iso.complianceAlerts.severity, severity) : undefined,
            category ? eq(iso.complianceAlerts.category, category) : undefined,
          ),
        );

      const rows = await q;
      const nameMap = await loadSiteNames(custDb, [...new Set(rows.map((r: any) => r.siteId))]);

      // Sort: critical first, then warning; newest within severity
      const severityOrder: Record<string, number> = { critical: 0, warning: 1 };
      const sorted = rows
        .map((r: any) => ({ ...r, siteName: nameMap.get(r.siteId) ?? r.siteId }))
        .sort((a: any, b: any) => {
          const sev = (severityOrder[a.severity] ?? 2) - (severityOrder[b.severity] ?? 2);
          if (sev !== 0) return sev;
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        });

      return res.json(sorted);
    } catch (err) {
      logger.error('[compliance/alerts] error:', err);
      return res.status(500).json({ error: 'Failed to load alerts' });
    }
  });

  // ── POST /api/enterprise/compliance/alerts/:id/acknowledge ────────────────
  app.post('/api/enterprise/compliance/alerts/:id/acknowledge', requireAuth,
    requireEnterpriseRole('enterprise_admin', 'area_manager'), async (req, res) => {
    try {
      const customerId = req.customerId!;
      const allowed = await callerScope(req);
      const custDb = await customerDbService.getCustomerDatabase(customerId);

      const [alert] = await custDb
        .select()
        .from(iso.complianceAlerts)
        .where(eq(iso.complianceAlerts.id, req.params.id))
        .limit(1);

      if (!alert) return res.status(404).json({ error: 'Alert not found' });

      // Scope check
      if (allowed !== 'all' && !allowed.includes(alert.siteId)) {
        return res.status(403).json({ error: 'Alert is outside your managed scope' });
      }
      if (alert.status !== 'open') {
        return res.status(409).json({ error: `Alert is already ${alert.status}` });
      }

      await custDb.execute(sql`
        UPDATE compliance_alerts SET status='acknowledged' WHERE id=${req.params.id}
      `);

      const callerUser = (req as any).user;
      logger.info(`[compliance/alerts] ACKNOWLEDGE: caller=${callerUser?.username} alertId=${req.params.id} siteId=${alert.siteId} customer=${customerId}`);

      return res.json({ id: req.params.id, status: 'acknowledged' });
    } catch (err) {
      logger.error('[compliance/alerts/acknowledge] error:', err);
      return res.status(500).json({ error: 'Failed to acknowledge alert' });
    }
  });

  // ── GET /api/enterprise/compliance/expiries?days=30&siteId=X ────────────
  // Items expiring within N days, sorted by date ascending.
  // Optional ?siteId= to scope to a single site (caller must be entitled to it).
  app.get('/api/enterprise/compliance/expiries', requireAuth, ROLE_GATE, async (req, res) => {
    try {
      const customerId = req.customerId!;
      const allowed = await callerScope(req);
      const custDb = await customerDbService.getCustomerDatabase(customerId);

      const days = Math.min(Math.max(parseInt(req.query.days as string) || 30, 1), 365);
      const filterSiteId = req.query.siteId as string | undefined;
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() + days);
      const cutoffStr = cutoff.toISOString().split('T')[0];
      const todayStr  = new Date().toISOString().split('T')[0];

      let siteIds: string[] = [];
      if (allowed === 'all') {
        const sites = await custDb.select({ id: iso.sites.id }).from(iso.sites).where(ne(iso.sites.status, 'archived'));
        siteIds = sites.map((s: any) => s.id);
      } else {
        siteIds = allowed;
      }

      // Scope to a single site if requested
      if (filterSiteId) {
        if (!siteIds.includes(filterSiteId)) return res.json([]); // not in caller's scope
        siteIds = [filterSiteId];
      }

      if (siteIds.length === 0) return res.json([]);

      // Items with expiresAt between today and cutoff (expiring or lapsed)
      const rows = await custDb
        .select()
        .from(iso.complianceItems)
        .where(
          and(
            inArray(iso.complianceItems.siteId, siteIds),
            inArray(iso.complianceItems.status, ['expiring', 'lapsed']),
            // expires_at <= cutoff
          ),
        );

      // Further filter client-side (Drizzle date comparison with string is safe here)
      const filtered = rows
        .filter((r: any) => r.expiresAt && r.expiresAt <= cutoffStr)
        .sort((a: any, b: any) => {
          if (!a.expiresAt) return 1;
          if (!b.expiresAt) return -1;
          return a.expiresAt < b.expiresAt ? -1 : 1;
        });

      const nameMap = await loadSiteNames(custDb, [...new Set(filtered.map((r: any) => r.siteId))]);

      return res.json(filtered.map((r: any) => ({ ...r, siteName: nameMap.get(r.siteId) ?? r.siteId })));
    } catch (err) {
      logger.error('[compliance/expiries] error:', err);
      return res.status(500).json({ error: 'Failed to load expiries' });
    }
  });

  // ── GET /api/enterprise/compliance/sites/:id ─────────────────────────────
  // Per-site detail: score, category scores, alert counts, item counts.
  // Fail-closed: returns 403 if caller is not entitled to this site.
  app.get('/api/enterprise/compliance/sites/:id', requireAuth, ROLE_GATE, async (req, res) => {
    try {
      const siteId = req.params.id;
      const customerId = req.customerId!;
      const allowed = await callerScope(req);

      // Scope check
      if (allowed !== 'all' && !allowed.includes(siteId)) {
        return res.status(403).json({ error: 'Site is outside your managed scope' });
      }

      const custDb = await customerDbService.getCustomerDatabase(customerId);
      const nameMap = await loadSiteNames(custDb, [siteId]);

      // Re-evaluate this site so its detail reflects current statuses before scoring.
      await ensureFreshComplianceEvaluation(customerId, [siteId]);

      const { siteScores } = await computeLiveScores(custDb, [siteId]);
      const siteScore = siteScores.find((s: any) => s.siteId === siteId);

      const alerts = await custDb
        .select({ severity: iso.complianceAlerts.severity })
        .from(iso.complianceAlerts)
        .where(and(eq(iso.complianceAlerts.siteId, siteId), eq(iso.complianceAlerts.status, 'open')));

      const items = await custDb
        .select({ status: iso.complianceItems.status })
        .from(iso.complianceItems)
        .where(eq(iso.complianceItems.siteId, siteId));

      return res.json({
        siteId,
        siteName: nameMap.get(siteId) ?? siteId,
        score: siteScore?.score ?? 100,
        categoryScores: siteScore?.categoryScores ?? {},
        openCriticals: alerts.filter((a: any) => a.severity === 'critical').length,
        openWarnings:  alerts.filter((a: any) => a.severity === 'warning').length,
        totalItems:    items.length,
        lapsedItems:   items.filter((i: any) => i.status === 'lapsed').length,
        expiringItems: items.filter((i: any) => i.status === 'expiring').length,
      });
    } catch (err) {
      logger.error('[compliance/sites/:id] error:', err);
      return res.status(500).json({ error: 'Failed to load site compliance detail' });
    }
  });

  // ── GET /api/enterprise/compliance/items?siteId=X&category=X ─────────────
  // Raw compliance items for a site (for drill-down tabs).
  // siteId is required; category is optional filter.
  app.get('/api/enterprise/compliance/items', requireAuth, ROLE_GATE, async (req, res) => {
    try {
      const customerId = req.customerId!;
      const allowed = await callerScope(req);
      const { siteId, category } = req.query as Record<string, string>;

      if (!siteId) return res.status(400).json({ error: 'siteId is required' });

      // Scope check
      if (allowed !== 'all' && !allowed.includes(siteId)) {
        return res.json([]); // fail closed
      }

      const custDb = await customerDbService.getCustomerDatabase(customerId);

      const conditions: any[] = [eq(iso.complianceItems.siteId, siteId)];
      if (category) conditions.push(eq(iso.complianceItems.category, category));

      const rows = await custDb
        .select()
        .from(iso.complianceItems)
        .where(and(...conditions))
        .orderBy(iso.complianceItems.expiresAt);

      return res.json(rows);
    } catch (err) {
      logger.error('[compliance/items] error:', err);
      return res.status(500).json({ error: 'Failed to load compliance items' });
    }
  });

  // ── GET /api/enterprise/compliance/trend?days=90 ──────────────────────────
  // From compliance_snapshots — returns estate + per-site trend data.
  app.get('/api/enterprise/compliance/trend', requireAuth, ROLE_GATE, async (req, res) => {
    try {
      const customerId = req.customerId!;
      const allowed = await callerScope(req);
      const custDb = await customerDbService.getCustomerDatabase(customerId);

      const days = Math.min(Math.max(parseInt(req.query.days as string) || 90, 7), 365);
      const fromDate = new Date();
      fromDate.setDate(fromDate.getDate() - days);
      const fromStr = fromDate.toISOString().split('T')[0];

      // Estate trend (site_id IS NULL)
      const estateTrend = await custDb
        .select({
          date: iso.complianceSnapshots.date,
          score: iso.complianceSnapshots.overallScore,
          categoryScores: iso.complianceSnapshots.categoryScores,
        })
        .from(iso.complianceSnapshots)
        .where(and(isNull(iso.complianceSnapshots.siteId), gte(iso.complianceSnapshots.date, fromStr)))
        .orderBy(iso.complianceSnapshots.date);

      // Per-site trend for caller's scope
      let siteTrend: any[] = [];
      if (allowed !== 'all' && allowed.length > 0) {
        siteTrend = await custDb
          .select({
            siteId: iso.complianceSnapshots.siteId,
            date: iso.complianceSnapshots.date,
            score: iso.complianceSnapshots.overallScore,
          })
          .from(iso.complianceSnapshots)
          .where(and(
            inArray(iso.complianceSnapshots.siteId, allowed),
            gte(iso.complianceSnapshots.date, fromStr),
          ))
          .orderBy(iso.complianceSnapshots.date);
      } else if (allowed === 'all') {
        // Return site-level trend grouped, limited to avoid huge payloads
        const sites = await custDb.select({ id: iso.sites.id }).from(iso.sites).where(ne(iso.sites.status, 'archived'));
        const siteIds = sites.map((s: any) => s.id);
        if (siteIds.length > 0) {
          siteTrend = await custDb
            .select({
              siteId: iso.complianceSnapshots.siteId,
              date: iso.complianceSnapshots.date,
              score: iso.complianceSnapshots.overallScore,
            })
            .from(iso.complianceSnapshots)
            .where(and(inArray(iso.complianceSnapshots.siteId, siteIds), gte(iso.complianceSnapshots.date, fromStr)))
            .orderBy(iso.complianceSnapshots.date);
        }
      }

      const nameMap = await loadSiteNames(custDb, [...new Set(siteTrend.map((r: any) => r.siteId).filter(Boolean))]);

      return res.json({
        days,
        estateTrend,
        siteTrend: siteTrend.map((r: any) => ({ ...r, siteName: nameMap.get(r.siteId) ?? r.siteId })),
      });
    } catch (err) {
      logger.error('[compliance/trend] error:', err);
      return res.status(500).json({ error: 'Failed to load trend data' });
    }
  });

  // ── GET /api/enterprise/compliance/config ─────────────────────────────────
  app.get('/api/enterprise/compliance/config', requireAuth,
    requireEnterpriseRole('enterprise_admin'), async (req, res) => {
    try {
      const customerId = req.customerId!;
      const custDb = await customerDbService.getCustomerDatabase(customerId);
      // Ensure columns exist (lazy migration)
      await custDb.execute(sql`
        ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS compliance_weights JSONB DEFAULT '{}'
      `).catch(() => {});
      await custDb.execute(sql`
        ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS compliance_penalty INT DEFAULT 2
      `).catch(() => {});

      const rows = await custDb
        .select({
          complianceWeights: (iso.companySettings as any).complianceWeights,
          compliancePenalty: (iso.companySettings as any).compliancePenalty,
        })
        .from(iso.companySettings)
        .limit(1);

      const row = rows[0];
      return res.json({
        weights: row?.complianceWeights && Object.keys(row.complianceWeights as object).length > 0
          ? row.complianceWeights
          : DEFAULT_WEIGHTS,
        penalty: row?.compliancePenalty ?? DEFAULT_PENALTY,
        categories: CATEGORIES,
      });
    } catch (err) {
      logger.error('[compliance/config] GET error:', err);
      return res.status(500).json({ error: 'Failed to load config' });
    }
  });

  // ── PATCH /api/enterprise/compliance/config ───────────────────────────────
  app.patch('/api/enterprise/compliance/config', requireAuth,
    requireEnterpriseRole('enterprise_admin'), async (req, res) => {
    try {
      const customerId = req.customerId!;
      const custDb = await customerDbService.getCustomerDatabase(customerId);
      const { weights, penalty } = req.body;

      if (weights !== undefined && typeof weights !== 'object') {
        return res.status(400).json({ error: 'weights must be an object' });
      }
      if (penalty !== undefined && typeof penalty !== 'number') {
        return res.status(400).json({ error: 'penalty must be a number' });
      }

      await custDb.execute(sql`
        ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS compliance_weights JSONB DEFAULT '{}'
      `).catch(() => {});
      await custDb.execute(sql`
        ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS compliance_penalty INT DEFAULT 2
      `).catch(() => {});

      if (weights !== undefined) {
        await custDb.execute(sql`UPDATE company_settings SET compliance_weights = ${JSON.stringify(weights)}`);
      }
      if (penalty !== undefined) {
        await custDb.execute(sql`UPDATE company_settings SET compliance_penalty = ${penalty}`);
      }

      // Invalidate summary cache for this customer
      for (const key of _summaryCache.keys()) {
        if (key.startsWith(`${customerId}:`)) _summaryCache.delete(key);
      }

      const callerUser = (req as any).user;
      logger.info(`[compliance/config] updated by ${callerUser?.username} customer=${customerId}`);

      return res.json({ ok: true });
    } catch (err) {
      logger.error('[compliance/config] PATCH error:', err);
      return res.status(500).json({ error: 'Failed to update config' });
    }
  });

  // ── POST /api/enterprise/compliance/evaluate (admin manual trigger) ────────
  app.post('/api/enterprise/compliance/evaluate', requireAuth,
    requireEnterpriseRole('enterprise_admin'), async (req, res) => {
    try {
      const customerId = req.customerId!;
      const { siteId } = req.body;
      const custDb = await customerDbService.getCustomerDatabase(customerId);

      if (siteId) {
        // Single site
        await evaluateSite(customerId, siteId);
      } else {
        // All sites
        const sites = await custDb.select({ id: iso.sites.id }).from(iso.sites).where(ne(iso.sites.status, 'archived'));
        for (const s of sites) {
          await evaluateSite(customerId, s.id).catch(() => {});
        }
      }

      // Bust summary cache
      for (const key of _summaryCache.keys()) {
        if (key.startsWith(`${customerId}:`)) _summaryCache.delete(key);
      }

      return res.json({ ok: true, evaluated: siteId ? 1 : 'all' });
    } catch (err) {
      logger.error('[compliance/evaluate] error:', err);
      return res.status(500).json({ error: 'Failed to run evaluation' });
    }
  });

  // ── GET /api/enterprise/compliance/contractor-pool-health ──────────────────
  // Returns a summary of contractor pool readiness so the compliance overview
  // can surface pending/missing-doc issues that don't affect the scored items.
  app.get('/api/enterprise/compliance/contractor-pool-health', requireAuth,
    requireEnterpriseRole('enterprise_admin', 'area_manager', 'site_coordinator'),
    async (req, res) => {
      try {
        const customerId = req.customerId!;
        const custDb = await customerDbService.getCustomerDatabase(customerId);

        const KEY_DOCS = ['publicLiability', 'employersLiability', 'healthSafety', 'rams'];

        const companies = await custDb
          .select({ id: iso.contractorCompanies.id, status: iso.contractorCompanies.status })
          .from(iso.contractorCompanies)
          .where(eq(iso.contractorCompanies.isActive, true));

        if (companies.length === 0) {
          return res.json({ total: 0, compliant: 0, needsAttention: 0, pendingCompanies: 0, totalMissingDocs: 0 });
        }

        const companyIds = companies.map(c => c.id);

        const allDocs = await custDb
          .select({
            companyId: iso.contractorDocuments.companyId,
            documentType: iso.contractorDocuments.documentType,
            status: iso.contractorDocuments.status,
          })
          .from(iso.contractorDocuments)
          .where(and(
            inArray(iso.contractorDocuments.companyId, companyIds),
            isNull(iso.contractorDocuments.workerId),
            eq(iso.contractorDocuments.isActive, true),
            ne(iso.contractorDocuments.status, 'rejected'),
          ));

        // Group docs by company
        const docsByCompany = new Map<string, typeof allDocs>();
        for (const d of allDocs) {
          const list = docsByCompany.get(d.companyId) ?? [];
          list.push(d);
          docsByCompany.set(d.companyId, list);
        }

        let compliant = 0;
        let needsAttention = 0;
        let pendingCompanies = 0;
        let totalMissingDocs = 0;

        for (const co of companies) {
          const docs = docsByCompany.get(co.id) ?? [];
          const approvedDocTypes = new Set(
            docs.filter(d => d.status === 'approved' || d.status === 'valid').map(d => d.documentType)
          );
          const missing = KEY_DOCS.filter(k => !approvedDocTypes.has(k));
          totalMissingDocs += missing.length;

          if (co.status !== 'approved' || missing.length > 0) {
            needsAttention++;
            if (co.status !== 'approved') pendingCompanies++;
          } else {
            compliant++;
          }
        }

        res.json({
          total: companies.length,
          compliant,
          needsAttention,
          pendingCompanies,
          totalMissingDocs,
        });
      } catch (err) {
        logger.error('[compliance/contractor-pool-health] error:', err);
        res.status(500).json({ error: 'Failed to load contractor pool health' });
      }
    },
  );
}
