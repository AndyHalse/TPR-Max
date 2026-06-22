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

      // If no items at all for this scope, trigger a background evaluation
      let hasItems = false;
      try {
        const check = await custDb
          .select({ id: iso.complianceItems.id })
          .from(iso.complianceItems)
          .limit(1);
        hasItems = check.length > 0;
      } catch { /* table may not exist yet if migration pending */ }

      if (!hasItems) {
        // Fire-and-forget initial evaluation for all allowed sites
        (async () => {
          const sites = await custDb
            .select({ id: iso.sites.id })
            .from(iso.sites)
            .where(ne(iso.sites.status, 'archived'));
          for (const s of sites) {
            if (allowed === 'all' || allowed.includes(s.id)) {
              await evaluateSite(customerId, s.id).catch(() => {});
            }
          }
        })();
      }

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

      const payload = {
        estateScore,
        categoryScores,
        siteCount: siteScores.length,
        openCriticals,
        openWarnings,
        totalItems,
        expiringItems,
        siteScores: siteScores.map(s => ({ siteId: s.siteId, score: s.score })),
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
  // Per-site breakdown table: score, category scores, open alert counts.
  app.get('/api/enterprise/compliance/sites', requireAuth, ROLE_GATE, async (req, res) => {
    try {
      const customerId = req.customerId!;
      const allowed = await callerScope(req);
      const custDb = await customerDbService.getCustomerDatabase(customerId);

      const { siteScores } = await computeLiveScores(custDb, allowed);
      const siteIds = siteScores.map(s => s.siteId);
      const nameMap = await loadSiteNames(custDb, siteIds);

      // Open alert counts per site
      let alertMap = new Map<string, { critical: number; warning: number }>();
      if (siteIds.length > 0) {
        const alerts = await custDb
          .select({ siteId: iso.complianceAlerts.siteId, severity: iso.complianceAlerts.severity })
          .from(iso.complianceAlerts)
          .where(and(inArray(iso.complianceAlerts.siteId, siteIds), eq(iso.complianceAlerts.status, 'open')));
        for (const a of alerts) {
          const cur = alertMap.get(a.siteId) ?? { critical: 0, warning: 0 };
          if (a.severity === 'critical') cur.critical++;
          else if (a.severity === 'warning') cur.warning++;
          alertMap.set(a.siteId, cur);
        }
      }

      const result = siteScores.map(s => ({
        siteId: s.siteId,
        siteName: nameMap.get(s.siteId) ?? s.siteId,
        score: s.score,
        categoryScores: s.categoryScores,
        openCriticals: alertMap.get(s.siteId)?.critical ?? 0,
        openWarnings:  alertMap.get(s.siteId)?.warning ?? 0,
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

  // ── GET /api/enterprise/compliance/expiries?days=30 ───────────────────────
  // Items expiring within N days, sorted by date ascending.
  app.get('/api/enterprise/compliance/expiries', requireAuth, ROLE_GATE, async (req, res) => {
    try {
      const customerId = req.customerId!;
      const allowed = await callerScope(req);
      const custDb = await customerDbService.getCustomerDatabase(customerId);

      const days = Math.min(Math.max(parseInt(req.query.days as string) || 30, 1), 365);
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
}
