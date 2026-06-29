/**
 * Compliance Scoring Engine — Phase 3a
 *
 * Evaluates compliance status across 7 categories for each site within a
 * customer account. Maintains:
 *   compliance_items     — one row per tracked entity (upserted on change)
 *   compliance_snapshots — daily scores (site + estate)
 *   compliance_alerts    — open / acknowledged / resolved alert feed
 *
 * Entry points:
 *   evaluateSiteBackground(customerId, siteId) — fire-and-forget after mutations
 *   runDailyComplianceJob(customerId)          — full sweep + snapshots + alerts
 *   initComplianceEngine()                     — registers the 03:00 cron
 */

import cron from 'node-cron';
import { sql, eq, and, lt, lte, gte, isNotNull, ne, inArray, or, isNull } from 'drizzle-orm';
import { customerDbService } from './customerDatabase';
import * as iso from './isolatedSchema';
import { logger } from './utils/logger';

// ── Types ─────────────────────────────────────────────────────────────────────

export type Category = 'insurance' | 'rams' | 'inductions' | 'certificates' | 'ppm' | 'fire' | 'rtw';
type ItemStatus = 'current' | 'expiring' | 'lapsed' | 'missing';
type Severity = 'ok' | 'warning' | 'critical';

interface ItemDef {
  siteId: string;
  category: Category;
  sourceTable: string;
  sourceId: string;
  status: ItemStatus;
  severity: Severity;
  expiresAt: Date | null;
}

interface CategoryResult {
  items: ItemDef[];
  score: number;         // 0-100
  criticalCount: number;
  warningCount: number;
}

export interface SiteScore {
  siteId: string;
  score: number;
  categoryScores: Record<string, number>;
  openCriticals: number;
}

// ── Config defaults (stored in company_settings as compliance_weights / compliance_penalty) ─

export const DEFAULT_WEIGHTS: Record<Category, number> = {
  insurance:    20,
  rams:         15,
  inductions:   15,
  certificates: 15,
  ppm:          15,
  fire:         10,
  rtw:          10,
};
export const DEFAULT_PENALTY = 2;   // points deducted per open critical alert
export const CATEGORIES: Category[] = ['insurance', 'rams', 'inductions', 'certificates', 'ppm', 'fire', 'rtw'];

// ── Score formula ─────────────────────────────────────────────────────────────

export function calcCategoryScore(items: ItemDef[]): number {
  if (items.length === 0) return 100; // empty category not penalised
  const current  = items.filter(i => i.status === 'current').length;
  const expiring = items.filter(i => i.status === 'expiring').length;
  return Math.round(100 * (current + 0.5 * expiring) / items.length);
}

export function calcSiteScore(
  categoryScores: Record<string, number>,
  weights: Record<Category, number>,
  openCriticals: number,
  penalty: number,
): number {
  const cats = Object.keys(categoryScores) as Category[];
  if (cats.length === 0) return 100;
  let totalWeight = 0;
  let weightedSum = 0;
  for (const cat of cats) {
    const w = weights[cat] ?? 10;
    weightedSum += categoryScores[cat] * w;
    totalWeight += w;
  }
  const base = totalWeight > 0 ? weightedSum / totalWeight : 100;
  return Math.max(0, Math.round(base - openCriticals * penalty));
}

// ── Helper: load weights config ───────────────────────────────────────────────

async function loadWeightsConfig(custDb: any): Promise<{
  weights: Record<Category, number>;
  penalty: number;
}> {
  try {
    const rows = await custDb
      .select({
        complianceWeights: (iso.companySettings as any).complianceWeights,
        compliancePenalty: (iso.companySettings as any).compliancePenalty,
      })
      .from(iso.companySettings)
      .limit(1);
    const row = rows[0];
    const weights = (row?.complianceWeights && typeof row.complianceWeights === 'object')
      ? { ...DEFAULT_WEIGHTS, ...(row.complianceWeights as Record<Category, number>) }
      : DEFAULT_WEIGHTS;
    const penalty = typeof row?.compliancePenalty === 'number' ? row.compliancePenalty : DEFAULT_PENALTY;
    return { weights, penalty };
  } catch {
    return { weights: DEFAULT_WEIGHTS, penalty: DEFAULT_PENALTY };
  }
}

// ── Evaluation helpers ────────────────────────────────────────────────────────

function daysDiff(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

function toSeverity(status: ItemStatus): Severity {
  if (status === 'lapsed' || status === 'missing') return 'critical';
  if (status === 'expiring') return 'warning';
  return 'ok';
}

// ── Category evaluators ────────────────────────────────────────────────────────

async function evalInsurance(custDb: any, siteId: string, now: Date): Promise<ItemDef[]> {
  const INSURANCE_TYPES = ['public_liability', 'employers_liability', 'insurance', 'professional_indemnity'];
  const docs = await custDb
    .select({
      id: iso.contractorDocuments.id,
      expiryDate: iso.contractorDocuments.expiryDate,
      status: iso.contractorDocuments.status,
    })
    .from(iso.contractorDocuments)
    .where(
      and(
        eq(iso.contractorDocuments.siteId, siteId),
        eq(iso.contractorDocuments.isActive, true),
        isNull(iso.contractorDocuments.workerId),  // company-level docs only
        ne(iso.contractorDocuments.status, 'rejected'),
        inArray(iso.contractorDocuments.documentType, INSURANCE_TYPES),
      ),
    );

  return docs.map((d: any): ItemDef => {
    let status: ItemStatus = 'current';
    if (d.expiryDate) {
      const diff = daysDiff(now, new Date(d.expiryDate));
      if (diff < 0) status = 'lapsed';
      else if (diff <= 30) status = 'expiring';
    }
    return {
      siteId, category: 'insurance', sourceTable: 'contractor_documents', sourceId: d.id,
      status, severity: toSeverity(status), expiresAt: d.expiryDate ? new Date(d.expiryDate) : null,
    };
  });
}

async function evalRams(custDb: any, siteId: string, now: Date): Promise<ItemDef[]> {
  const docs = await custDb
    .select({ id: iso.ramsDocuments.id, expiryDate: iso.ramsDocuments.expiryDate, status: iso.ramsDocuments.status })
    .from(iso.ramsDocuments)
    .where(and(eq(iso.ramsDocuments.siteId, siteId), eq(iso.ramsDocuments.isActive, true)));

  return docs.map((d: any): ItemDef => {
    let status: ItemStatus = 'current';
    const isExpiredStatus = d.status === 'expired';
    if (isExpiredStatus || (d.expiryDate && daysDiff(now, new Date(d.expiryDate)) < 0)) {
      status = 'lapsed';
    } else if (d.expiryDate && daysDiff(now, new Date(d.expiryDate)) <= 30) {
      status = 'expiring';
    }
    return {
      siteId, category: 'rams', sourceTable: 'rams_documents', sourceId: d.id,
      status, severity: toSeverity(status), expiresAt: d.expiryDate ? new Date(d.expiryDate) : null,
    };
  });
}

async function evalInductions(custDb: any, siteId: string, now: Date): Promise<ItemDef[]> {
  // Workers currently checked in at this site
  const onSite = await custDb
    .select({ id: iso.contractorWorkers.id })
    .from(iso.contractorWorkers)
    .where(and(eq(iso.contractorWorkers.siteId, siteId), eq(iso.contractorWorkers.isCheckedIn, true)));

  if (onSite.length === 0) return [];

  const workerIds = onSite.map((w: any) => w.id);

  // Their induction tokens at this site (completed / valid)
  const tokens = await custDb
    .select({
      workerId: iso.inductionTokens.workerId,
      expiresAt: iso.inductionTokens.expiresAt,
      quizCompleted: iso.inductionTokens.quizCompleted,
      status: iso.inductionTokens.status,
    })
    .from(iso.inductionTokens)
    .where(
      and(
        eq(iso.inductionTokens.siteId, siteId),
        inArray(iso.inductionTokens.workerId, workerIds),
        eq(iso.inductionTokens.quizCompleted, true),
      ),
    );

  // Build map: workerId → most recent valid token
  const tokenMap = new Map<string, any>();
  for (const t of tokens) {
    if (!t.workerId) continue;
    const existing = tokenMap.get(t.workerId);
    if (!existing || (t.expiresAt && existing.expiresAt && new Date(t.expiresAt) > new Date(existing.expiresAt))) {
      tokenMap.set(t.workerId, t);
    }
  }

  return onSite.map((w: any): ItemDef => {
    const token = tokenMap.get(w.id);
    if (!token) {
      return {
        siteId, category: 'inductions', sourceTable: 'contractor_workers', sourceId: w.id,
        status: 'missing', severity: 'critical', expiresAt: null,
      };
    }
    let status: ItemStatus = 'current';
    if (token.expiresAt) {
      const diff = daysDiff(now, new Date(token.expiresAt));
      if (diff < 0) status = 'lapsed';
      else if (diff <= 14) status = 'expiring';
    }
    return {
      siteId, category: 'inductions', sourceTable: 'contractor_workers', sourceId: w.id,
      status, severity: toSeverity(status), expiresAt: token.expiresAt ? new Date(token.expiresAt) : null,
    };
  });
}

async function evalCertificates(custDb: any, siteId: string, now: Date): Promise<ItemDef[]> {
  const certs = await custDb
    .select({
      id: iso.complianceCertificates.id,
      expiryDate: iso.complianceCertificates.expiryDate,
      nextDueDate: iso.complianceCertificates.nextDueDate,
      isCurrent: iso.complianceCertificates.isCurrent,
    })
    .from(iso.complianceCertificates)
    .where(
      and(
        eq(iso.complianceCertificates.siteId, siteId),
        isNull(iso.complianceCertificates.deletedAt),
        eq(iso.complianceCertificates.isCurrent, true),
      ),
    );

  return certs.map((c: any): ItemDef => {
    const expDate = c.nextDueDate || c.expiryDate;
    let status: ItemStatus = 'current';
    if (expDate) {
      const diff = daysDiff(now, new Date(expDate));
      if (diff < 0) status = 'lapsed';
      else if (diff <= 60) status = 'expiring';
    }
    return {
      siteId, category: 'certificates', sourceTable: 'compliance_certificates', sourceId: c.id,
      status, severity: toSeverity(status), expiresAt: expDate ? new Date(expDate) : null,
    };
  });
}

async function evalPpm(custDb: any, siteId: string, now: Date): Promise<ItemDef[]> {
  const orders = await custDb
    .select({
      id: iso.ppmWorkOrders.id,
      status: iso.ppmWorkOrders.status,
      dueDate: iso.ppmWorkOrders.dueDate,
    })
    .from(iso.ppmWorkOrders)
    .where(
      and(
        eq(iso.ppmWorkOrders.siteId, siteId),
        inArray(iso.ppmWorkOrders.status, ['scheduled', 'overdue']),
      ),
    );

  return orders.map((o: any): ItemDef => {
    let status: ItemStatus = 'current';
    const dueDate = o.dueDate ? new Date(o.dueDate) : null;
    if (o.status === 'overdue') {
      status = dueDate && daysDiff(dueDate, now) > 30 ? 'lapsed' : 'expiring';
    } else if (dueDate && daysDiff(now, dueDate) <= 14) {
      status = 'expiring';
    }
    return {
      siteId, category: 'ppm', sourceTable: 'ppm_work_orders', sourceId: o.id,
      status, severity: toSeverity(status), expiresAt: dueDate,
    };
  });
}

async function evalFra(custDb: any, siteId: string, now: Date): Promise<ItemDef[]> {
  const fras = await custDb
    .select({
      id: iso.fireRiskAssessments.id,
      nextReviewDate: iso.fireRiskAssessments.nextReviewDate,
    })
    .from(iso.fireRiskAssessments)
    .where(
      and(
        eq(iso.fireRiskAssessments.siteId, siteId),
        isNull(iso.fireRiskAssessments.deletedAt),
      ),
    );

  return fras.map((f: any): ItemDef => {
    let status: ItemStatus = 'current';
    if (f.nextReviewDate) {
      const reviewDate = new Date(f.nextReviewDate);
      const daysOverdue = daysDiff(reviewDate, now);
      if (daysOverdue > 365) status = 'lapsed';        // overdue > 12 months → critical
      else if (daysOverdue > 0 || daysDiff(now, reviewDate) <= 60) status = 'expiring'; // due ≤ 60 days
    }
    return {
      siteId, category: 'fire', sourceTable: 'fire_risk_assessments', sourceId: f.id,
      status, severity: toSeverity(status),
      expiresAt: f.nextReviewDate ? new Date(f.nextReviewDate) : null,
    };
  });
}

async function evalRtw(custDb: any, siteId: string, now: Date): Promise<ItemDef[]> {
  const workers = await custDb
    .select({
      id: iso.contractorWorkers.id,
      rightToWork: iso.contractorWorkers.rightToWork,
      rightToWorkExpiryDate: iso.contractorWorkers.rightToWorkExpiryDate,
    })
    .from(iso.contractorWorkers)
    .where(
      and(
        eq(iso.contractorWorkers.siteId, siteId),
        isNotNull(iso.contractorWorkers.rightToWork),
        ne(iso.contractorWorkers.rightToWork, 'pending'),
      ),
    );

  return workers.map((w: any): ItemDef => {
    let status: ItemStatus = 'current';
    if (w.rightToWork === 'expired' || w.rightToWork === 'invalid') {
      status = 'lapsed';
    } else if (w.rightToWork === 'valid' && w.rightToWorkExpiryDate) {
      const diff = daysDiff(now, new Date(w.rightToWorkExpiryDate));
      if (diff < 0) status = 'lapsed';
      else if (diff <= 28) status = 'expiring';
    }
    return {
      siteId, category: 'rtw', sourceTable: 'contractor_workers', sourceId: w.id,
      status, severity: toSeverity(status),
      expiresAt: w.rightToWorkExpiryDate ? new Date(w.rightToWorkExpiryDate) : null,
    };
  });
}

// ── Upsert helpers ────────────────────────────────────────────────────────────

async function upsertItems(custDb: any, items: ItemDef[]): Promise<void> {
  for (const item of items) {
    const expiresStr = item.expiresAt ? item.expiresAt.toISOString().split('T')[0] : null;
    await custDb.execute(sql`
      INSERT INTO compliance_items
        (id, site_id, category, source_table, source_id, status, severity, expires_at, updated_at)
      VALUES
        (gen_random_uuid()::text, ${item.siteId}, ${item.category}, ${item.sourceTable},
         ${item.sourceId}, ${item.status}, ${item.severity}, ${expiresStr}, NOW())
      ON CONFLICT (site_id, category, source_table, source_id) DO UPDATE SET
        status     = EXCLUDED.status,
        severity   = EXCLUDED.severity,
        expires_at = EXCLUDED.expires_at,
        updated_at = NOW()
    `);
  }
}

// ── Alert management ──────────────────────────────────────────────────────────

async function syncAlerts(custDb: any, siteId: string, items: ItemDef[]): Promise<void> {
  // Determine which categories have critical / warning items
  const criticalCats = new Set(items.filter(i => i.severity === 'critical').map(i => i.category));
  const warningCats  = new Set(items.filter(i => i.severity === 'warning').map(i => i.category));

  // Load existing open/acknowledged alerts for this site
  const existingAlerts = await custDb
    .select({ id: iso.complianceAlerts.id, category: iso.complianceAlerts.category, severity: iso.complianceAlerts.severity })
    .from(iso.complianceAlerts)
    .where(and(eq(iso.complianceAlerts.siteId, siteId), inArray(iso.complianceAlerts.status, ['open', 'acknowledged'])));

  const existingSet = new Set(existingAlerts.map((a: any) => `${a.category}:${a.severity}`));

  // Auto-resolve alerts where the condition has cleared
  for (const alert of existingAlerts) {
    const key = `${alert.category}:${alert.severity}`;
    const stillNeeded = (alert.severity === 'critical' && criticalCats.has(alert.category))
      || (alert.severity === 'warning' && warningCats.has(alert.category));
    if (!stillNeeded) {
      await custDb.execute(sql`
        UPDATE compliance_alerts SET status='resolved', resolved_at=NOW() WHERE id=${alert.id}
      `);
    }
  }

  // Raise new critical alerts (one per category)
  for (const cat of criticalCats) {
    const key = `${cat}:critical`;
    if (!existingSet.has(key)) {
      const count = items.filter(i => i.category === cat && i.severity === 'critical').length;
      await custDb.execute(sql`
        INSERT INTO compliance_alerts (id, site_id, category, severity, title, detail, status)
        VALUES (
          gen_random_uuid()::text, ${siteId}, ${cat}, 'critical',
          ${`${count} critical ${cat} item${count !== 1 ? 's' : ''} require attention`},
          ${JSON.stringify({ count, siteId })},
          'open'
        )
      `);
    }
  }

  // Raise new warning alerts (one per category)
  for (const cat of warningCats) {
    if (criticalCats.has(cat)) continue; // critical already covers it
    const key = `${cat}:warning`;
    if (!existingSet.has(key)) {
      const count = items.filter(i => i.category === cat && i.severity === 'warning').length;
      await custDb.execute(sql`
        INSERT INTO compliance_alerts (id, site_id, category, severity, title, detail, status)
        VALUES (
          gen_random_uuid()::text, ${siteId}, ${cat}, 'warning',
          ${`${count} ${cat} item${count !== 1 ? 's' : ''} expiring soon`},
          ${JSON.stringify({ count, siteId })},
          'open'
        )
      `);
    }
  }

  // Extra critical alert: 3+ overdue PPM at one site
  const overduePpm = items.filter(i => i.category === 'ppm' && i.status === 'lapsed').length;
  if (overduePpm >= 3 && !existingSet.has('ppm:critical')) {
    await custDb.execute(sql`
      INSERT INTO compliance_alerts (id, site_id, category, severity, title, detail, status)
      VALUES (
        gen_random_uuid()::text, ${siteId}, 'ppm', 'critical',
        ${`${overduePpm} PPM work orders overdue at this site`},
        ${JSON.stringify({ count: overduePpm, siteId })},
        'open'
      )
      ON CONFLICT DO NOTHING
    `);
  }
}

// ── Core site evaluation ──────────────────────────────────────────────────────

export async function evaluateSite(customerId: string, siteId: string): Promise<void> {
  const custDb = await customerDbService.getCustomerDatabase(customerId);
  const now = new Date();

  const [insItems, ramsItems, indItems, certItems, ppmItems, fraItems, rtwItems] = await Promise.all([
    evalInsurance(custDb, siteId, now),
    evalRams(custDb, siteId, now),
    evalInductions(custDb, siteId, now),
    evalCertificates(custDb, siteId, now),
    evalPpm(custDb, siteId, now),
    evalFra(custDb, siteId, now),
    evalRtw(custDb, siteId, now),
  ]);

  const allItems: ItemDef[] = [
    ...insItems, ...ramsItems, ...indItems, ...certItems,
    ...ppmItems, ...fraItems, ...rtwItems,
  ];

  await upsertItems(custDb, allItems);
  await syncAlerts(custDb, siteId, allItems);
}

/**
 * Fire-and-forget wrapper — call after any mutation to a source table.
 * Never awaited so it never blocks the response.
 */
export function evaluateSiteBackground(customerId: string, siteId: string | null | undefined): void {
  if (!siteId) return;
  evaluateSite(customerId, siteId).catch(err =>
    logger.error(`[compliance] background evaluation error site=${siteId}:`, err),
  );
}

// ── Daily job ─────────────────────────────────────────────────────────────────

export async function runDailyComplianceJob(customerId: string): Promise<void> {
  const custDb = await customerDbService.getCustomerDatabase(customerId);
  const { weights, penalty } = await loadWeightsConfig(custDb);
  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD en-GB date as ISO

  // Load all active (non-archived) sites
  const sites = await custDb
    .select({ id: iso.sites.id })
    .from(iso.sites)
    .where(ne(iso.sites.status, 'archived'));

  const siteScores: number[] = [];

  for (const site of sites) {
    // Evaluate all categories for this site
    await evaluateSite(customerId, site.id);

    // Read back the freshly-upserted items
    const items = await custDb
      .select({ status: iso.complianceItems.status, severity: iso.complianceItems.severity, category: iso.complianceItems.category })
      .from(iso.complianceItems)
      .where(eq(iso.complianceItems.siteId, site.id));

    // Count open critical alerts for penalty
    const openCriticals = await custDb
      .select({ id: iso.complianceAlerts.id })
      .from(iso.complianceAlerts)
      .where(and(
        eq(iso.complianceAlerts.siteId, site.id),
        eq(iso.complianceAlerts.severity, 'critical'),
        eq(iso.complianceAlerts.status, 'open'),
      ));

    // Category scores
    const catScores: Record<string, number> = {};
    for (const cat of CATEGORIES) {
      const catItems = items.filter((i: any) => i.category === cat);
      catScores[cat] = calcCategoryScore(catItems);
    }

    const siteScore = calcSiteScore(catScores, weights, openCriticals.length, penalty);
    siteScores.push(siteScore);

    // Write / replace snapshot (idempotent: delete + insert)
    await custDb.execute(sql`
      DELETE FROM compliance_snapshots
      WHERE COALESCE(site_id,'') = ${site.id} AND date = ${today}
    `);
    await custDb.execute(sql`
      INSERT INTO compliance_snapshots (id, site_id, date, overall_score, category_scores)
      VALUES (gen_random_uuid()::text, ${site.id}, ${today}, ${siteScore}, ${JSON.stringify(catScores)})
    `);
  }

  // Estate-level snapshot (site_id NULL)
  const estateScore = siteScores.length > 0
    ? Math.round(siteScores.reduce((a, b) => a + b, 0) / siteScores.length)
    : 100;

  await custDb.execute(sql`
    DELETE FROM compliance_snapshots WHERE site_id IS NULL AND date = ${today}
  `);
  await custDb.execute(sql`
    INSERT INTO compliance_snapshots (id, site_id, date, overall_score, category_scores)
    VALUES (gen_random_uuid()::text, NULL, ${today}, ${estateScore}, '{}')
  `);

  logger.info(`[compliance] daily job complete for customer=${customerId}: ${sites.length} sites, estate score=${estateScore}`);
}

// ── Compute live score from existing items (for API without running full eval) ─

export async function computeLiveScores(
  custDb: any,
  allowedSiteIds: string[] | 'all',
): Promise<{ estateScore: number; siteScores: SiteScore[]; categoryScores: Record<string, number> }> {
  const { weights, penalty } = await loadWeightsConfig(custDb);

  let sitesQuery = custDb.select({ id: iso.sites.id }).from(iso.sites).where(ne(iso.sites.status, 'archived'));
  if (Array.isArray(allowedSiteIds)) {
    sitesQuery = custDb.select({ id: iso.sites.id }).from(iso.sites).where(
      and(ne(iso.sites.status, 'archived'), inArray(iso.sites.id, allowedSiteIds))
    );
  }
  const sites = await sitesQuery;
  if (sites.length === 0) return { estateScore: 100, siteScores: [], categoryScores: {} };

  const allSiteIds = sites.map((s: any) => s.id);

  const items = await custDb
    .select({
      siteId: iso.complianceItems.siteId,
      category: iso.complianceItems.category,
      status: iso.complianceItems.status,
      severity: iso.complianceItems.severity,
    })
    .from(iso.complianceItems)
    .where(inArray(iso.complianceItems.siteId, allSiteIds));

  const openAlerts = await custDb
    .select({ siteId: iso.complianceAlerts.siteId, severity: iso.complianceAlerts.severity })
    .from(iso.complianceAlerts)
    .where(and(inArray(iso.complianceAlerts.siteId, allSiteIds), eq(iso.complianceAlerts.status, 'open')));

  const siteResults: SiteScore[] = [];
  const estateCategory: Record<string, number[]> = {};

  for (const site of sites) {
    const siteItems = items.filter((i: any) => i.siteId === site.id);
    const siteCriticals = openAlerts.filter((a: any) => a.siteId === site.id && a.severity === 'critical').length;
    const catScores: Record<string, number> = {};
    for (const cat of CATEGORIES) {
      const catItems = siteItems.filter((i: any) => i.category === cat);
      catScores[cat] = calcCategoryScore(catItems);
      if (!estateCategory[cat]) estateCategory[cat] = [];
      estateCategory[cat].push(catScores[cat]);
    }
    const score = calcSiteScore(catScores, weights, siteCriticals, penalty);
    siteResults.push({ siteId: site.id, score, categoryScores: catScores, openCriticals: siteCriticals });
  }

  const estateCategoryScores: Record<string, number> = {};
  for (const cat of CATEGORIES) {
    const vals = estateCategory[cat] ?? [];
    estateCategoryScores[cat] = vals.length > 0 ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : 100;
  }

  let estateScore = siteResults.length > 0
    ? Math.round(siteResults.reduce((a, b) => a + b.score, 0) / siteResults.length)
    : 100;

  // ── Contractor pool health injection ────────────────────────────────────────
  // Company-level docs (insurance, RAMS, H&S) are NOT linked to a specific site,
  // so they never appear in compliance_items. We fetch them here and blend their
  // completeness into the relevant estate category scores (50 % site / 50 % pool).
  // This ensures the estate score reflects contractor gaps even when all sites
  // score 100 % on their own site-linked documents.
  try {
    const KEY_POOL_DOCS: Array<{ type: string; category: Category }> = [
      { type: 'publicLiability',    category: 'insurance' },
      { type: 'employersLiability', category: 'insurance' },
      { type: 'rams',               category: 'rams' },
      { type: 'healthSafety',       category: 'certificates' },
    ];
    const poolCategories = new Set(KEY_POOL_DOCS.map(d => d.category));

    const companies = await custDb
      .select({ id: iso.contractorCompanies.id })
      .from(iso.contractorCompanies)
      .where(eq(iso.contractorCompanies.isActive, true));

    if (companies.length > 0) {
      const companyIds = companies.map((c: any) => c.id);

      const poolDocs = await custDb
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

      // Build set of approved document types per company
      const approvedByCompany = new Map<string, Set<string>>();
      for (const d of poolDocs) {
        if (d.status === 'approved' || d.status === 'valid') {
          if (!approvedByCompany.has(d.companyId)) approvedByCompany.set(d.companyId, new Set());
          approvedByCompany.get(d.companyId)!.add(d.documentType);
        }
      }

      // Score each pool category: % of companies that have every required doc
      const poolCatScore: Partial<Record<Category, number>> = {};
      for (const cat of poolCategories) {
        const keyTypes = KEY_POOL_DOCS.filter(k => k.category === cat).map(k => k.type);
        let total = 0; let current = 0;
        for (const co of companies) {
          const approved = approvedByCompany.get((co as any).id) ?? new Set<string>();
          for (const docType of keyTypes) {
            total++;
            if (approved.has(docType)) current++;
          }
        }
        poolCatScore[cat] = total > 0 ? Math.round((current / total) * 100) : 100;
      }

      // Blend 50 / 50: site average meets pool score for each affected category
      for (const cat of poolCategories) {
        const siteCatScore = estateCategoryScores[cat] ?? 100;
        const poolScore = poolCatScore[cat] ?? 100;
        estateCategoryScores[cat] = Math.round((siteCatScore + poolScore) / 2);
      }

      // Recalculate estate score from the blended category scores
      let totalWeight = 0; let weightedSum = 0;
      for (const cat of CATEGORIES) {
        const w = weights[cat] ?? 10;
        weightedSum += (estateCategoryScores[cat] ?? 100) * w;
        totalWeight += w;
      }
      estateScore = totalWeight > 0 ? Math.round(weightedSum / totalWeight) : estateScore;
    }
  } catch (poolErr) {
    logger.warn('[compliance] pool health injection skipped (non-fatal):', poolErr);
  }
  // ── End pool injection ─────────────────────────────────────────────────────

  return { estateScore, siteScores: siteResults, categoryScores: estateCategoryScores };
}

// ── Cron initialisation ───────────────────────────────────────────────────────

let _initialised = false;

export function initComplianceEngine(): void {
  if (_initialised) return;
  _initialised = true;

  // Daily at 03:00 Europe/London — evaluates all customers
  cron.schedule('0 3 * * *', async () => {
    logger.info('[compliance] daily cron starting (03:00 Europe/London)');
    try {
      const customers = await customerDbService.getAllCustomers();
      for (const customer of customers) {
        try {
          await runDailyComplianceJob(customer.id);
        } catch (err) {
          logger.error(`[compliance] daily job failed for customer=${customer.id}:`, err);
        }
      }
      logger.info(`[compliance] daily cron complete for ${customers.length} customers`);
    } catch (err) {
      logger.error('[compliance] daily cron outer error:', err);
    }
  }, { timezone: 'Europe/London' });

  logger.info('[compliance] engine initialised — daily cron scheduled at 03:00 Europe/London');
}
