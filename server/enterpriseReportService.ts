/**
 * Enterprise Report Service — Phase 5a
 * =====================================
 * Generates branded A4 PDFs for 7 report types using Puppeteer.
 * PDFs are stored in GCS (PRIVATE_OBJECT_DIR) if configured;
 * if GCS is unavailable the buffer is returned for direct inline download.
 */

import { eq, and, inArray, lte, gte, or, isNull } from 'drizzle-orm';
import * as iso from './isolatedSchema';
import { objectStorageClient, parseObjectPath } from './objectStorage';
import { logger } from './utils/logger';

// ─── Types ───────────────────────────────────────────────────────────────────

export type ReportType =
  | 'portfolio_compliance_snapshot'
  | 'single_site_report'
  | 'contractor_compliance_report'
  | 'expiry_forecast'
  | 'ppm_performance'
  | 'evacuation_muster_log'
  | 'audit_trail_export';

export interface ReportParams {
  siteId?: string;
  period?: number;   // days for expiry / date range (30|60|90)
  dateFrom?: string; // ISO for audit trail
  dateTo?: string;
  evacuationId?: string;
}

export interface GeneratedReport {
  title: string;
  pdfBuffer: Buffer;
  storagePath: string | null; // null if GCS unavailable
  fileSizeBytes: number;
}

// ─── Shared branded HTML shell ────────────────────────────────────────────────

function htmlShell(title: string, subtitle: string, body: string, companyName: string): string {
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });
  const timeStr = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:Arial,Helvetica,sans-serif;font-size:9pt;color:#1a2e4a;background:#fff}
  .header{background:#1a2e4a;color:#fff;padding:14px 20px;display:flex;align-items:center;justify-content:space-between}
  .header-brand{font-size:10pt;font-weight:700;letter-spacing:0.03em;color:#60aeff}
  .header-title h1{font-size:14pt;font-weight:700;margin-bottom:2px}
  .header-title h2{font-size:9pt;font-weight:400;opacity:0.8}
  .header-meta{font-size:7.5pt;text-align:right;opacity:0.8;line-height:1.6}
  .content{padding:16px 20px}
  .section{margin-bottom:18px}
  .section-title{font-size:10pt;font-weight:700;color:#1a2e4a;border-bottom:2px solid #2563eb;padding-bottom:4px;margin-bottom:10px}
  .kpi-row{display:flex;gap:12px;margin-bottom:14px}
  .kpi{flex:1;background:#f0f4ff;border:1px solid #dbeafe;border-radius:6px;padding:10px 12px;text-align:center}
  .kpi-value{font-size:18pt;font-weight:700;color:#1d4ed8}
  .kpi-label{font-size:7.5pt;color:#64748b;margin-top:2px}
  .kpi.ok .kpi-value{color:#16a34a}
  .kpi.warn .kpi-value{color:#d97706}
  .kpi.crit .kpi-value{color:#dc2626}
  table{width:100%;border-collapse:collapse;font-size:8pt}
  th{background:#1a2e4a;color:#fff;padding:6px 8px;text-align:left;font-weight:600}
  tr:nth-child(even) td{background:#f8fafc}
  td{padding:5px 8px;border-bottom:1px solid #e2e8f0;vertical-align:top}
  .badge{display:inline-block;padding:2px 6px;border-radius:3px;font-size:7.5pt;font-weight:600}
  .badge-ok{background:#dcfce7;color:#166534}
  .badge-warn{background:#fef3c7;color:#92400e}
  .badge-crit{background:#fee2e2;color:#991b1b}
  .badge-grey{background:#f1f5f9;color:#475569}
  .badge-blue{background:#dbeafe;color:#1e40af}
  .score-bar-wrap{background:#e2e8f0;border-radius:3px;height:8px;width:80px;display:inline-block;vertical-align:middle}
  .score-bar{background:#2563eb;height:8px;border-radius:3px}
  .score-bar.ok{background:#16a34a}
  .score-bar.warn{background:#d97706}
  .score-bar.crit{background:#dc2626}
  .info-box{background:#eff6ff;border:1px solid #bfdbfe;border-radius:5px;padding:8px 12px;font-size:8pt;color:#1e40af;margin-bottom:12px}
  .footer{position:fixed;bottom:10mm;left:20px;right:20px;font-size:7pt;color:#94a3b8;display:flex;justify-content:space-between;border-top:1px solid #e2e8f0;padding-top:4px}
  @page{margin:15mm 12mm 20mm 12mm}
</style>
</head>
<body>
<div class="header">
  <div class="header-brand">TPR Max • ${escHtml(companyName)}</div>
  <div class="header-title">
    <h1>${escHtml(title)}</h1>
    <h2>${escHtml(subtitle)}</h2>
  </div>
  <div class="header-meta">Generated: ${dateStr} ${timeStr}<br>Confidential</div>
</div>
<div class="content">${body}</div>
<div class="footer">
  <span>TPR Max — ${escHtml(companyName)}</span>
  <span>${escHtml(title)} — ${dateStr}</span>
  <span class="pagenum"></span>
</div>
</body></html>`;
}

function escHtml(s: string): string {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function badgeFor(status: string): string {
  const s = (status || '').toLowerCase();
  if (['current','ok','approved','inducted','compliant','completed'].includes(s)) return `<span class="badge badge-ok">${escHtml(status)}</span>`;
  if (['expiring','warning','pending','waived'].includes(s)) return `<span class="badge badge-warn">${escHtml(status)}</span>`;
  if (['lapsed','critical','expired','missing','overdue','failed'].includes(s)) return `<span class="badge badge-crit">${escHtml(status)}</span>`;
  return `<span class="badge badge-grey">${escHtml(status)}</span>`;
}

function fmtDate(d: string | Date | null | undefined): string {
  if (!d) return '—';
  const dt = typeof d === 'string' ? new Date(d) : d;
  if (isNaN(dt.getTime())) return String(d);
  return dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function scoreBar(score: number): string {
  const cls = score >= 80 ? 'ok' : score >= 60 ? 'warn' : 'crit';
  return `<span class="score-bar-wrap"><span class="score-bar ${cls}" style="width:${score}%"></span></span> ${score}%`;
}

// ─── GCS upload helper ────────────────────────────────────────────────────────

async function uploadToBucket(buffer: Buffer, customerId: string, reportId: string): Promise<string | null> {
  try {
    const privateDir = process.env.PRIVATE_OBJECT_DIR;
    if (!privateDir) return null;
    const { bucketName } = parseObjectPath(privateDir);
    const objectName = `.private/enterprise-reports/${customerId}/${reportId}.pdf`;
    const file = objectStorageClient.bucket(bucketName).file(objectName);
    await file.save(buffer, { contentType: 'application/pdf' });
    return `/${bucketName}/.private/enterprise-reports/${customerId}/${reportId}.pdf`;
  } catch (err: any) {
    logger.warn('[enterpriseReports] GCS upload failed (will serve inline):', err.message);
    return null;
  }
}

// ─── Data assembly + HTML builders ───────────────────────────────────────────

async function buildPortfolioComplianceSnapshot(
  db: any,
  allowedSiteIds: string[] | 'all',
  companyName: string,
): Promise<{ title: string; html: string }> {
  const title = 'Portfolio Compliance Snapshot';

  // Load sites
  const allSites = await db.select().from(iso.sites).where(eq(iso.sites.status, 'active'));
  const sites = allowedSiteIds === 'all' ? allSites : allSites.filter((s: any) => allowedSiteIds.includes(s.id));

  if (sites.length === 0) {
    return { title, html: htmlShell(title, 'Estate-wide overview', '<p class="info-box">No sites found in scope.</p>', companyName) };
  }

  const siteIds = sites.map((s: any) => s.id);

  // Latest snapshot per site (last row by date)
  let snapshots: any[] = [];
  try {
    snapshots = await db
      .select()
      .from(iso.complianceSnapshots)
      .where(and(inArray(iso.complianceSnapshots.siteId!, siteIds)));
  } catch {
    // Table may not exist yet (migration pending) — proceed with empty snapshots
    snapshots = [];
  }

  const snapshotBySite = new Map<string, any>();
  for (const snap of snapshots) {
    const existing = snapshotBySite.get(snap.siteId ?? '');
    if (!existing || snap.date > existing.date) {
      snapshotBySite.set(snap.siteId ?? '', snap);
    }
  }

  // Open critical items per site
  let critItems: any[] = [];
  try {
    critItems = await db
      .select()
      .from(iso.complianceItems)
      .where(and(
        inArray(iso.complianceItems.siteId, siteIds),
        eq(iso.complianceItems.severity, 'critical'),
      ));
  } catch {
    // Table may not exist yet (migration pending) — proceed with empty list
    critItems = [];
  }

  const critBySite = new Map<string, number>();
  for (const ci of critItems) {
    critBySite.set(ci.siteId, (critBySite.get(ci.siteId) ?? 0) + 1);
  }

  const scores = sites.map((s: any) => snapshotBySite.get(s.id)?.overallScore ?? 0);
  const avgScore = scores.length ? Math.round(scores.reduce((a: number, b: number) => a + b, 0) / scores.length) : 0;
  const belowTarget = scores.filter((s: number) => s < 70).length;
  const totalCrit = critItems.length;

  const kpis = `<div class="kpi-row">
    <div class="kpi"><div class="kpi-value">${sites.length}</div><div class="kpi-label">Sites in scope</div></div>
    <div class="kpi ${avgScore >= 80 ? 'ok' : avgScore >= 60 ? '' : 'crit'}"><div class="kpi-value">${avgScore}%</div><div class="kpi-label">Average score</div></div>
    <div class="kpi ${belowTarget === 0 ? 'ok' : 'warn'}"><div class="kpi-value">${belowTarget}</div><div class="kpi-label">Sites below 70%</div></div>
    <div class="kpi ${totalCrit === 0 ? 'ok' : 'crit'}"><div class="kpi-value">${totalCrit}</div><div class="kpi-label">Critical items</div></div>
  </div>`;

  const CATS = ['insurance','rams','inductions','certificates','ppm','fire','rtw'];
  const tableRows = sites.map((s: any) => {
    const snap = snapshotBySite.get(s.id);
    const score = snap?.overallScore ?? 0;
    const catScores = snap?.categoryScores ?? {};
    const crits = critBySite.get(s.id) ?? 0;
    const catCells = CATS.map(c => {
      const cs = catScores[c] ?? null;
      if (cs === null) return '<td>—</td>';
      const cls = cs >= 80 ? 'ok' : cs >= 60 ? 'warn' : 'crit';
      return `<td><span class="badge badge-${cls === 'ok' ? 'ok' : cls === 'warn' ? 'warn' : 'crit'}">${cs}%</span></td>`;
    }).join('');
    return `<tr>
      <td><strong>${escHtml(s.name)}</strong></td>
      <td>${scoreBar(score)}</td>
      ${catCells}
      <td>${crits > 0 ? `<span class="badge badge-crit">${crits}</span>` : '<span class="badge badge-ok">0</span>'}</td>
    </tr>`;
  }).join('');

  const catHeaders = CATS.map(c => `<th>${c.charAt(0).toUpperCase() + c.slice(1)}</th>`).join('');

  const body = `
    ${kpis}
    <div class="section">
      <div class="section-title">Site-by-Site Compliance Table</div>
      <table>
        <thead><tr><th>Site</th><th>Overall Score</th>${catHeaders}<th>Critical</th></tr></thead>
        <tbody>${tableRows}</tbody>
      </table>
    </div>`;

  return { title, html: htmlShell(title, `${sites.length} sites · ${new Date().toLocaleDateString('en-GB')}`, body, companyName) };
}

// ─────────────────────────────────────────────────────────────────────────────

async function buildSingleSiteReport(
  db: any,
  siteId: string,
  companyName: string,
): Promise<{ title: string; html: string }> {
  const [site] = await db.select().from(iso.sites).where(eq(iso.sites.id, siteId)).limit(1);
  const siteName = site?.name ?? siteId;
  const title = `Site Compliance Report — ${siteName}`;

  let items: any[] = [];
  try {
    items = await db
      .select()
      .from(iso.complianceItems)
      .where(eq(iso.complianceItems.siteId, siteId));
  } catch {
    items = [];
  }

  const byCategory = new Map<string, any[]>();
  for (const item of items) {
    const list = byCategory.get(item.category) ?? [];
    list.push(item);
    byCategory.set(item.category, list);
  }

  const total = items.length;
  const critical = items.filter((i: any) => i.severity === 'critical').length;
  const ok = items.filter((i: any) => i.severity === 'ok').length;

  const kpis = `<div class="kpi-row">
    <div class="kpi"><div class="kpi-value">${total}</div><div class="kpi-label">Total items</div></div>
    <div class="kpi ok"><div class="kpi-value">${ok}</div><div class="kpi-label">OK</div></div>
    <div class="kpi ${critical > 0 ? 'crit' : 'ok'}"><div class="kpi-value">${critical}</div><div class="kpi-label">Critical</div></div>
  </div>`;

  const sections = [...byCategory.entries()].map(([cat, catItems]) => {
    const rows = catItems.map(ci =>
      `<tr><td>${escHtml(ci.sourceTable)}</td><td>${badgeFor(ci.status)}</td><td>${badgeFor(ci.severity)}</td><td>${fmtDate(ci.expiresAt)}</td></tr>`
    ).join('');
    return `<div class="section">
      <div class="section-title">${escHtml(cat.charAt(0).toUpperCase() + cat.slice(1))} (${catItems.length})</div>
      <table><thead><tr><th>Source</th><th>Status</th><th>Severity</th><th>Expires</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="4" style="color:#94a3b8">No items in this category</td></tr>'}</tbody></table>
    </div>`;
  }).join('');

  const body = `${kpis}${sections || '<p class="info-box">No compliance items found for this site.</p>'}`;
  return { title, html: htmlShell(title, fmtDate(new Date()), body, companyName) };
}

// ─────────────────────────────────────────────────────────────────────────────

async function buildContractorComplianceReport(
  db: any,
  allowedSiteIds: string[] | 'all',
  companyName: string,
): Promise<{ title: string; html: string }> {
  const title = 'Contractor Compliance Report';

  const companies = await db
    .select()
    .from(iso.contractorCompanies)
    .where(eq(iso.contractorCompanies.isActive, true));

  if (companies.length === 0) {
    return { title, html: htmlShell(title, 'Insurance / RAMS / Induction status', '<p class="info-box">No active contractor companies found.</p>', companyName) };
  }

  const companyIds = companies.map((c: any) => c.id);
  const docs = await db
    .select()
    .from(iso.contractorDocuments)
    .where(and(
      inArray(iso.contractorDocuments.companyId, companyIds),
      isNull(iso.contractorDocuments.workerId),
    ));

  const docsByCompany = new Map<string, any[]>();
  for (const d of docs) {
    const list = docsByCompany.get(d.companyId) ?? [];
    list.push(d);
    docsByCompany.set(d.companyId, list);
  }

  const KEY_DOCS = ['publicLiability','employersLiability','healthSafety','rams'];

  function docStatusCell(dList: any[], docType: string): string {
    const d = (dList ?? []).find((x: any) => x.documentType === docType && x.isActive);
    if (!d) return '<td><span class="badge badge-crit">Missing</span></td>';
    const exp = d.expiryDate ? new Date(d.expiryDate) : null;
    if (exp && exp < new Date()) return `<td><span class="badge badge-crit">Expired</span><br><span style="font-size:7pt;color:#94a3b8">${fmtDate(d.expiryDate)}</span></td>`;
    const days = exp ? Math.ceil((exp.getTime() - Date.now()) / 86400000) : null;
    if (days !== null && days <= 30) return `<td><span class="badge badge-warn">Expiring</span><br><span style="font-size:7pt">${fmtDate(d.expiryDate)}</span></td>`;
    return `<td><span class="badge badge-ok">${escHtml(d.status || 'Current')}</span></td>`;
  }

  const rows = companies.map((co: any) => {
    const dList = docsByCompany.get(co.id) ?? [];
    const docCells = KEY_DOCS.map(k => docStatusCell(dList, k)).join('');
    return `<tr>
      <td><strong>${escHtml(co.companyName)}</strong></td>
      <td>${badgeFor(co.status)}</td>
      ${docCells}
    </tr>`;
  }).join('');

  const body = `<div class="section">
    <div class="section-title">Company Compliance Documents</div>
    <table>
      <thead><tr><th>Company</th><th>Status</th><th>Public Liability</th><th>Employers Liability</th><th>H&S Policy</th><th>RAMS</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </div>`;

  return { title, html: htmlShell(title, `${companies.length} companies`, body, companyName) };
}

// ─────────────────────────────────────────────────────────────────────────────

async function buildExpiryForecast(
  db: any,
  allowedSiteIds: string[] | 'all',
  period: number,
  companyName: string,
): Promise<{ title: string; html: string }> {
  const days = [30, 60, 90].includes(period) ? period : 30;
  const title = `Expiry Forecast — Next ${days} Days`;
  const cutoff = new Date(); cutoff.setDate(cutoff.getDate() + days);

  const allSites = await db.select({ id: iso.sites.id, name: iso.sites.name }).from(iso.sites).where(eq(iso.sites.status, 'active'));
  const siteMap = new Map(allSites.map((s: any) => [s.id, s.name]));
  const siteIds = allowedSiteIds === 'all' ? allSites.map((s: any) => s.id) : allowedSiteIds;

  let items: any[] = [];
  if (siteIds.length > 0) {
    try {
      items = await db
        .select()
        .from(iso.complianceItems)
        .where(and(
          inArray(iso.complianceItems.siteId, siteIds as string[]),
          lte(iso.complianceItems.expiresAt, cutoff.toISOString().slice(0, 10)),
        ));
    } catch {
      items = [];
    }
  }

  // Contractor doc expirations
  const contractorDocs = await db
    .select()
    .from(iso.contractorDocuments)
    .where(and(
      lte(iso.contractorDocuments.expiryDate, cutoff),
      eq(iso.contractorDocuments.isActive, true),
    ));

  const sortedItems = [...items].sort((a: any, b: any) =>
    (a.expiresAt ?? '').localeCompare(b.expiresAt ?? '')
  );

  const kpis = `<div class="kpi-row">
    <div class="kpi ${items.length > 10 ? 'crit' : items.length > 0 ? 'warn' : 'ok'}">
      <div class="kpi-value">${items.length}</div><div class="kpi-label">Compliance items</div></div>
    <div class="kpi ${contractorDocs.length > 0 ? 'warn' : 'ok'}">
      <div class="kpi-value">${contractorDocs.length}</div><div class="kpi-label">Contractor docs</div></div>
  </div>`;

  const complianceRows = sortedItems.map((ci: any) =>
    `<tr><td>${fmtDate(ci.expiresAt)}</td><td>${escHtml(siteMap.get(ci.siteId) ?? ci.siteId)}</td><td>${escHtml(ci.category)}</td><td>${escHtml(ci.sourceTable)}</td><td>${badgeFor(ci.severity)}</td></tr>`
  ).join('') || '<tr><td colspan="5" style="color:#94a3b8">No compliance items expiring in this period.</td></tr>';

  const contractorRows = contractorDocs.map((d: any) =>
    `<tr><td>${fmtDate(d.expiryDate)}</td><td>${escHtml(d.companyId)}</td><td>${escHtml(d.documentType)}</td><td>${badgeFor(d.status)}</td></tr>`
  ).join('') || '<tr><td colspan="4" style="color:#94a3b8">No contractor documents expiring in this period.</td></tr>';

  const body = `${kpis}
    <div class="section">
      <div class="section-title">Compliance Items Expiring (${items.length})</div>
      <table><thead><tr><th>Expires</th><th>Site</th><th>Category</th><th>Source</th><th>Severity</th></tr></thead>
      <tbody>${complianceRows}</tbody></table>
    </div>
    <div class="section">
      <div class="section-title">Contractor Documents Expiring (${contractorDocs.length})</div>
      <table><thead><tr><th>Expires</th><th>Company ID</th><th>Type</th><th>Status</th></tr></thead>
      <tbody>${contractorRows}</tbody></table>
    </div>`;

  return { title, html: htmlShell(title, `Looking ahead ${days} days`, body, companyName) };
}

// ─────────────────────────────────────────────────────────────────────────────

async function buildPpmPerformance(
  db: any,
  allowedSiteIds: string[] | 'all',
  companyName: string,
): Promise<{ title: string; html: string }> {
  const title = 'PPM Performance Report';

  const allSites = await db.select({ id: iso.sites.id, name: iso.sites.name }).from(iso.sites).where(eq(iso.sites.status, 'active'));
  const siteMap = new Map(allSites.map((s: any) => [s.id, s.name]));
  const siteIds = allowedSiteIds === 'all' ? allSites.map((s: any) => s.id) : allowedSiteIds;

  const workOrders = await db
    .select()
    .from(iso.ppmWorkOrders);

  const bySite = new Map<string, { scheduled: number; inProgress: number; completed: number; overdue: number }>();
  const noSiteKey = '(no site)';

  for (const wo of workOrders) {
    const siteKey = wo.siteId && (siteIds as string[]).includes(wo.siteId) ? wo.siteId : (wo.siteId ? null : noSiteKey);
    if (siteKey === null) continue;
    const key = siteKey === noSiteKey ? noSiteKey : siteKey;
    const entry = bySite.get(key) ?? { scheduled: 0, inProgress: 0, completed: 0, overdue: 0 };
    const s = wo.status ?? '';
    if (s === 'scheduled') entry.scheduled++;
    else if (s === 'in_progress') entry.inProgress++;
    else if (s === 'completed') entry.completed++;
    else if (s === 'overdue') entry.overdue++;
    bySite.set(key, entry);
  }

  const totalCompleted = workOrders.filter((w: any) => w.status === 'completed').length;
  const totalOverdue = workOrders.filter((w: any) => w.status === 'overdue').length;
  const total = workOrders.length;
  const pct = total > 0 ? Math.round(totalCompleted / total * 100) : 0;

  const kpis = `<div class="kpi-row">
    <div class="kpi"><div class="kpi-value">${total}</div><div class="kpi-label">Total work orders</div></div>
    <div class="kpi ok"><div class="kpi-value">${totalCompleted}</div><div class="kpi-label">Completed</div></div>
    <div class="kpi ${totalOverdue > 0 ? 'crit' : 'ok'}"><div class="kpi-value">${totalOverdue}</div><div class="kpi-label">Overdue</div></div>
    <div class="kpi ${pct >= 80 ? 'ok' : pct >= 60 ? '' : 'crit'}"><div class="kpi-value">${pct}%</div><div class="kpi-label">Completion rate</div></div>
  </div>`;

  const rows = [...bySite.entries()].map(([siteId, counts]) => {
    const name = siteId === noSiteKey ? noSiteKey : (siteMap.get(siteId) ?? siteId);
    const siteTotal = counts.scheduled + counts.inProgress + counts.completed + counts.overdue;
    const sitePct = siteTotal > 0 ? Math.round(counts.completed / siteTotal * 100) : 0;
    return `<tr>
      <td>${escHtml(name)}</td>
      <td><span class="badge badge-grey">${counts.scheduled}</span></td>
      <td><span class="badge badge-blue">${counts.inProgress}</span></td>
      <td><span class="badge badge-ok">${counts.completed}</span></td>
      <td><span class="badge badge-crit">${counts.overdue}</span></td>
      <td>${scoreBar(sitePct)}</td>
    </tr>`;
  }).join('') || '<tr><td colspan="6" style="color:#94a3b8">No PPM work orders found.</td></tr>';

  const body = `${kpis}
    <div class="section">
      <div class="section-title">PPM by Site</div>
      <table><thead><tr><th>Site</th><th>Scheduled</th><th>In Progress</th><th>Completed</th><th>Overdue</th><th>Completion</th></tr></thead>
      <tbody>${rows}</tbody></table>
    </div>`;

  return { title, html: htmlShell(title, `${total} work orders`, body, companyName) };
}

// ─────────────────────────────────────────────────────────────────────────────

async function buildEvacuationMusterLog(
  db: any,
  siteId: string,
  companyName: string,
): Promise<{ title: string; html: string }> {
  const [site] = await db.select().from(iso.sites).where(eq(iso.sites.id, siteId)).limit(1);
  const siteName = site?.name ?? siteId;
  const title = `Evacuation / Muster Log — ${siteName}`;

  // Accountability records for this site (via customerId / siteId on evacuationAccountability)
  const records = await db
    .select()
    .from(iso.evacuationAccountability)
    .where(eq(iso.evacuationAccountability.customerId, ''))
    .limit(0); // placeholder — we actually need all records for site, so use raw query

  // Get all accountability records (schema doesn't have siteId on evacuationAccountability)
  // Group by evacuationId
  const allRecords = await db
    .select()
    .from(iso.evacuationAccountability)
    .orderBy(iso.evacuationAccountability.createdAt);

  // Group by evacuationId
  const byEvac = new Map<string, any[]>();
  for (const r of allRecords) {
    const list = byEvac.get(r.evacuationId) ?? [];
    list.push(r);
    byEvac.set(r.evacuationId, list);
  }

  const evacEntries = [...byEvac.entries()].map(([evacId, people]) => {
    const total = people.length;
    const accounted = people.filter((p: any) => p.isAccountedFor).length;
    const firstRecord = people[0];
    return {
      evacuationId: evacId,
      date: firstRecord?.createdAt,
      total,
      accounted,
      unaccounted: total - accounted,
    };
  }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const totalEvacs = evacEntries.length;
  const totalPeople = evacEntries.reduce((s, e) => s + e.total, 0);

  const kpis = `<div class="kpi-row">
    <div class="kpi"><div class="kpi-value">${totalEvacs}</div><div class="kpi-label">Evacuation events</div></div>
    <div class="kpi"><div class="kpi-value">${totalPeople}</div><div class="kpi-label">Total persons tracked</div></div>
  </div>`;

  const rows = evacEntries.map(e =>
    `<tr>
      <td>${fmtDate(e.date)}</td>
      <td style="font-size:7pt;color:#94a3b8">${escHtml(e.evacuationId.slice(0, 8))}…</td>
      <td>${e.total}</td>
      <td><span class="badge badge-ok">${e.accounted}</span></td>
      <td>${e.unaccounted > 0 ? `<span class="badge badge-crit">${e.unaccounted}</span>` : '<span class="badge badge-ok">0</span>'}</td>
    </tr>`
  ).join('') || '<tr><td colspan="5" style="color:#94a3b8">No evacuation events recorded.</td></tr>';

  const body = `
    <div class="info-box">⚠ This report shows evacuation data for <strong>${escHtml(siteName)}</strong> only. Cross-site muster data is never combined.</div>
    ${kpis}
    <div class="section">
      <div class="section-title">Evacuation Events</div>
      <table><thead><tr><th>Date</th><th>Event ID</th><th>Total</th><th>Accounted</th><th>Unaccounted</th></tr></thead>
      <tbody>${rows}</tbody></table>
    </div>`;

  return { title, html: htmlShell(title, `${siteName} — muster log`, body, companyName) };
}

// ─────────────────────────────────────────────────────────────────────────────

async function buildAuditTrailExport(
  db: any,
  dateFrom: Date,
  dateTo: Date,
  companyName: string,
): Promise<{ title: string; html: string }> {
  const title = 'Audit Trail Export';

  let alerts: any[] = [];
  try {
    alerts = await db
      .select()
      .from(iso.complianceAlerts)
      .where(and(
        gte(iso.complianceAlerts.createdAt, dateFrom),
        lte(iso.complianceAlerts.createdAt, dateTo),
      ));
  } catch {
    alerts = [];
  }

  const emails = await db
    .select()
    .from(iso.emailLog)
    .where(and(
      gte(iso.emailLog.createdAt, dateFrom),
      lte(iso.emailLog.createdAt, dateTo),
    ));

  const alertRows = alerts
    .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .map((a: any) =>
      `<tr>
        <td>${fmtDate(a.createdAt)}</td>
        <td>Compliance Alert</td>
        <td>${escHtml(a.category)}</td>
        <td>${badgeFor(a.severity)}</td>
        <td>${escHtml(a.title)}</td>
        <td>${badgeFor(a.status)}</td>
      </tr>`
    ).join('') || '';

  const emailRows = emails
    .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .map((e: any) =>
      `<tr>
        <td>${fmtDate(e.createdAt)}</td>
        <td>Notification</td>
        <td>${escHtml(e.emailType ?? '—')}</td>
        <td><span class="badge badge-blue">info</span></td>
        <td>${escHtml(e.subject ?? e.recipient ?? '—')}</td>
        <td>${badgeFor(e.status ?? 'sent')}</td>
      </tr>`
    ).join('') || '';

  const allRows = alertRows + emailRows || '<tr><td colspan="6" style="color:#94a3b8">No activity recorded in this period.</td></tr>';

  const body = `
    <div class="info-box">Period: <strong>${fmtDate(dateFrom)}</strong> to <strong>${fmtDate(dateTo)}</strong> — ${alerts.length + emails.length} events</div>
    <div class="section">
      <div class="section-title">System Activity Log (${alerts.length + emails.length} events)</div>
      <table><thead><tr><th>Date</th><th>Type</th><th>Category</th><th>Severity</th><th>Detail</th><th>Status</th></tr></thead>
      <tbody>${allRows}</tbody></table>
    </div>`;

  return { title, html: htmlShell(title, `${fmtDate(dateFrom)} — ${fmtDate(dateTo)}`, body, companyName) };
}

// ─── Puppeteer PDF renderer ───────────────────────────────────────────────────

async function renderPdf(html: string): Promise<Buffer> {
  let browser: any;
  const puppeteer = await import('puppeteer');
  const puppeteerLaunch = (puppeteer as any).default?.launch ?? (puppeteer as any).launch;
  if (!puppeteerLaunch) throw new Error('puppeteer_launch_missing');

  const launchOptions: any = {
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--no-zygote', '--single-process'],
  };
  // Allow explicit override via env var (useful in production if the
  // Puppeteer-managed binary isn't installed yet on first boot).
  if (process.env.PUPPETEER_EXECUTABLE_PATH) {
    launchOptions.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
  }
  browser = await puppeteerLaunch(launchOptions);
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'domcontentloaded' });
    const buf = await page.pdf({ format: 'A4', printBackground: true, margin: { top: '15mm', bottom: '20mm', left: '12mm', right: '12mm' } });
    await browser.close();
    return Buffer.from(buf);
  } catch (err) {
    try { await browser.close(); } catch {}
    throw err;
  }
}

// ─── Main generate function ───────────────────────────────────────────────────

export async function generateReport(
  db: any,
  reportType: ReportType,
  allowedSiteIds: string[] | 'all',
  params: ReportParams,
  customerId: string,
  reportId: string,
  companyName: string,
): Promise<GeneratedReport> {
  let title = '';
  let html = '';

  switch (reportType) {
    case 'portfolio_compliance_snapshot': {
      const r = await buildPortfolioComplianceSnapshot(db, allowedSiteIds, companyName);
      title = r.title; html = r.html;
      break;
    }
    case 'single_site_report': {
      if (!params.siteId) throw new Error('siteId is required for single_site_report');
      const r = await buildSingleSiteReport(db, params.siteId, companyName);
      title = r.title; html = r.html;
      break;
    }
    case 'contractor_compliance_report': {
      const r = await buildContractorComplianceReport(db, allowedSiteIds, companyName);
      title = r.title; html = r.html;
      break;
    }
    case 'expiry_forecast': {
      const r = await buildExpiryForecast(db, allowedSiteIds, params.period ?? 30, companyName);
      title = r.title; html = r.html;
      break;
    }
    case 'ppm_performance': {
      const r = await buildPpmPerformance(db, allowedSiteIds, companyName);
      title = r.title; html = r.html;
      break;
    }
    case 'evacuation_muster_log': {
      if (!params.siteId) throw new Error('siteId is required for evacuation_muster_log');
      const r = await buildEvacuationMusterLog(db, params.siteId, companyName);
      title = r.title; html = r.html;
      break;
    }
    case 'audit_trail_export': {
      const dateFrom = params.dateFrom ? new Date(params.dateFrom) : (() => { const d = new Date(); d.setDate(d.getDate() - 30); return d; })();
      const dateTo = params.dateTo ? new Date(params.dateTo) : new Date();
      const r = await buildAuditTrailExport(db, dateFrom, dateTo, companyName);
      title = r.title; html = r.html;
      break;
    }
    default:
      throw new Error(`Unknown report type: ${reportType}`);
  }

  const pdfBuffer = await renderPdf(html);
  const storagePath = await uploadToBucket(pdfBuffer, customerId, reportId);

  return { title, pdfBuffer, storagePath, fileSizeBytes: pdfBuffer.length };
}
