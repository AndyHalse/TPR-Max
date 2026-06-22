import type { Express } from 'express';
import cron from 'node-cron';
import { requireAuth } from '../auth';
import { getScopedDb, scopedWhere, withSiteId, SiteContextError } from '../siteScope';
import { simpleDatabaseService } from '../simpleDatabaseService';
import { customerDbService } from '../customerDatabase';
import * as isolatedSchema from '../isolatedSchema';
import { EmailService } from '../emailService';
import { eq, and, sql, inArray, isNotNull, lte } from 'drizzle-orm';
import { logger } from '../utils/logger';
import { reevaluateCompanyApproval } from '../utils/contractorCompliance';

export async function registerCdmRoutes(app: Express): Promise<void> {
// ── PPM (Planned Preventative Maintenance) routes ───────────────────────────

// Helper: calculate nextDueDate from a base date + frequency

// ── CDM F10 Daily Alert Cron ─────────────────────────────────────────────────
// Runs daily at the same hour as PPM alerts (Europe/London).
// Scans all active CDM projects that meet F10 notification thresholds but have
// no submission date recorded, and sends a single daily email to the admin.
// Deduplication: f10_alert_sent_at is updated per-project so each project only
// triggers one email per calendar day.
const cdmAlertHour = parseInt(process.env.PPM_ALERT_HOUR ?? "7", 10);
cron.schedule(`0 ${cdmAlertHour} * * *`, async () => {
  try {
    logger.info("[CDM Cron] Running daily F10 alert check…");
    const allCustomers = await customerDbService.getAllCustomers();
    // Use Europe/London date to match business-day semantics of the cron timezone
    const todayStr = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/London" }); // YYYY-MM-DD

    for (const customer of allCustomers) {
      try {
        const custDb = await customerDbService.getCustomerDatabase(customer.id);

        // Fetch active projects that require F10 but have not submitted it
        const projects = await custDb.select().from(isolatedSchema.cdmProjects)
          .where(eq(isolatedSchema.cdmProjects.status, "active"));

        const overdue: (typeof projects[0])[] = [];
        for (const project of projects) {
          // F10 threshold: (>30 days AND >20 peak workers) OR >500 person-days
          const meetsThreshold =
            ((project.estimatedDays ?? 0) > 30 && (project.peakWorkers ?? 0) > 20) ||
            (project.personDays ?? 0) > 500;
          if (!meetsThreshold) continue;

          // Not yet submitted
          if (project.f10Status === "submitted" || project.f10Date) continue;

          // Deduplication: skip if already alerted today
          if (project.f10AlertSentAt) {
            const lastAlertDate = new Date(project.f10AlertSentAt).toLocaleDateString("en-CA", { timeZone: "Europe/London" });
            if (lastAlertDate === todayStr) continue;
          }

          overdue.push(project);
        }

        if (overdue.length === 0) continue;

        // Get admin email and company name (use dedicated CDM alerts email if configured, else fall back to main company email)
        const settingsRows = await custDb.execute(`SELECT company_name, email, cdm_alerts_email FROM company_settings LIMIT 1`);
        const settings = settingsRows.rows[0] as { company_name?: string; email?: string; cdm_alerts_email?: string } | undefined;
        const companyName = (settings?.company_name as string) || "TPR-Max";
        const cdmAlertsEmail = ((settings?.cdm_alerts_email as string | undefined) || '').trim();
        const companyEmail = ((settings?.email as string | undefined) || '').trim();

        // Build a deduplicated list of recipient addresses:
        // send to both cdm_alerts_email AND the main company email when both are populated.
        const recipientSet = new Set<string>();
        if (cdmAlertsEmail) recipientSet.add(cdmAlertsEmail);
        if (companyEmail) recipientSet.add(companyEmail);
        const recipients = Array.from(recipientSet);

        if (recipients.length === 0) {
          logger.warn(`[CDM Cron] No admin email configured for customer ${customer.id} — skipping`);
          continue;
        }

        const emailSvc = new EmailService(customer.id);
        const emailPayload = {
          subject: `CDM Alert: ${overdue.length} F10 Notification${overdue.length > 1 ? "s" : ""} Outstanding`,
          companyName,
          html: `
            <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
              <div style="background:#b45309;color:#fff;padding:20px;border-radius:8px 8px 0 0">
                <h2 style="margin:0">CDM F10 Notification Alert — ${companyName}</h2>
              </div>
              <div style="background:#fff;padding:20px;border:1px solid #e5e7eb">
                <p>The following CDM project${overdue.length > 1 ? "s require" : " requires"} an F10 HSE notification but no submission has been recorded:</p>
                <ul style="padding-left:20px">
                  ${overdue.map(p => `<li><strong>${p.title}</strong>${p.location ? ` — ${p.location}` : ""}${p.clientName ? ` (Client: ${p.clientName})` : ""}</li>`).join("")}
                </ul>
                <p>These projects meet the HSE notification threshold (duration &gt;30 days with &gt;20 workers, or &gt;500 person-days). Please submit the F10 notification to the HSE and record the submission date in TPR-Max.</p>
                <p>Please log in to TPR-Max to review and update each project's F10 status.</p>
              </div>
            </div>
          `,
          text: `CDM F10 Notification Alert\n\n${overdue.length} project(s) require an F10 HSE notification but no submission has been recorded:\n\n${overdue.map(p => `- ${p.title}${p.location ? ` (${p.location})` : ""}`).join("\n")}\n\nPlease submit the F10 notification and record it in TPR-Max.`,
        };

        const sendResults = await Promise.all(recipients.map(addr => emailSvc.sendEmail({ to: addr, ...emailPayload })));
        const sent = sendResults.every(Boolean);

        if (!sent) {
          logger.warn(`[CDM Cron] Email send failed for customer ${customer.id} — skipping f10_alert_sent_at update`);
          continue;
        }

        // Mark each project as alerted today (only when email was successfully delivered)
        const now = new Date();
        for (const project of overdue) {
          await custDb.update(isolatedSchema.cdmProjects)
            .set({ f10AlertSentAt: now })
            .where(eq(isolatedSchema.cdmProjects.id, project.id));
        }

        logger.info(`[CDM Cron] Sent F10 alert for ${overdue.length} project(s) to ${recipients.join(', ')} (customer ${customer.id})`);
      } catch (custErr) {
        logger.error(`[CDM Cron] Error processing customer ${customer.id}:`, custErr);
      }
    }
    logger.info("[CDM Cron] Daily F10 check complete");
  } catch (error: unknown) {
    logger.error("[CDM Cron] Fatal error:", error);
  }
}, { timezone: "Europe/London" });

// ── CDM 2015 Routes ──────────────────────────────────────────────────────────

// GET all CDM projects for a contractor company
app.get("/api/cdm/projects", requireAuth, async (req, res) => {
  if (req.user!.role !== "admin") return res.status(403).json({ error: "Administrator access required" });
  try {
    const { companyId } = req.query;
    const { db, siteContext } = await getScopedDb(req);
    const siteFilter = scopedWhere(siteContext, isolatedSchema.cdmProjects);
    let projects: any[];
    if (companyId) {
      projects = await db.select().from(isolatedSchema.cdmProjects)
        .where(and(eq(isolatedSchema.cdmProjects.companyId, companyId as string), siteFilter))
        .orderBy(isolatedSchema.cdmProjects.createdAt);
    } else {
      projects = await db.select().from(isolatedSchema.cdmProjects)
        .where(siteFilter)
        .orderBy(isolatedSchema.cdmProjects.createdAt);
    }
    res.json(projects);
  } catch (err) {
    if (err instanceof SiteContextError) return res.status(err.statusCode).json({ error: err.message });
    logger.error("Error fetching CDM projects:", err);
    res.status(500).json({ error: "Failed to fetch CDM projects" });
  }
});

// GET CDM compliance report as PDF
app.get("/api/cdm/projects/export-pdf", requireAuth, async (req, res) => {
  if (req.user!.role !== "admin") return res.status(403).json({ error: "Administrator access required" });
  try {
    const db = await customerDbService.getCustomerDatabase(req.customerId!);
    const username = req.user!.username;
    const settingsContext = simpleDatabaseService.createCustomerContext(username, req.customerId!);
    const companySettings = await simpleDatabaseService.getCompanySettings(settingsContext);

    // Build the "Prepared By" name: prefer display name, fall back to username, then company name
    const adminUser = req.user!;
    const preparedBy = (adminUser.firstName && adminUser.lastName)
      ? `${adminUser.firstName} ${adminUser.lastName}`
      : (adminUser.firstName || adminUser.lastName || adminUser.username || companySettings?.companyName || "");

    // Resolve logo to an absolute URL so Puppeteer can fetch it (relative paths break in setContent)
    let resolvedLogoUrl = "";
    if (companySettings?.logoUrl) {
      const raw = companySettings.logoUrl;
      if (raw.startsWith("http://") || raw.startsWith("https://")) {
        resolvedLogoUrl = raw;
      } else {
        // Normalize path: /uploads/... → /objects/uploads/..., /objects/... → as-is
        let normalized = raw;
        if (normalized.startsWith("/uploads/")) {
          normalized = `/objects${normalized}`;
        } else if (!normalized.startsWith("/objects")) {
          normalized = `/objects/uploads/${normalized.replace(/^\/+/, "")}`;
        }
        resolvedLogoUrl = `http://localhost:${process.env.PORT ?? 5000}${normalized}`;
      }
    }

    // Parse optional filter query params
    const statusFilter = typeof req.query.status === 'string' && req.query.status !== 'all' ? req.query.status : null;
    const fromDate = typeof req.query.from === 'string' && req.query.from ? req.query.from : null;
    const toDate = typeof req.query.to === 'string' && req.query.to ? req.query.to : null;
    const companyIdFilter = typeof req.query.companyId === 'string' && req.query.companyId ? req.query.companyId : null;

    // Build WHERE conditions for cdmProjects
    const filterConditions: SQL<boolean>[] = [];
    if (statusFilter) filterConditions.push(eq(isolatedSchema.cdmProjects.status, statusFilter));
    if (fromDate) filterConditions.push(gte(isolatedSchema.cdmProjects.startDate, fromDate));
    if (toDate) filterConditions.push(lte(isolatedSchema.cdmProjects.startDate, toDate));
    if (companyIdFilter) filterConditions.push(eq(isolatedSchema.cdmProjects.companyId, companyIdFilter));

    const projectsBaseQuery = db.select().from(isolatedSchema.cdmProjects);
    const projectsFilteredQuery = filterConditions.length > 0
      ? projectsBaseQuery.where(filterConditions.length === 1 ? filterConditions[0] : and(...filterConditions))
      : projectsBaseQuery;

    const [projects, companies] = await Promise.all([
      projectsFilteredQuery.orderBy(isolatedSchema.cdmProjects.createdAt),
      db.select().from(isolatedSchema.contractorCompanies).orderBy(isolatedSchema.contractorCompanies.companyName),
    ]);

    const companyMap = new Map(companies.map((c: any) => [c.id, c.companyName]));
    const filteredCompanyName = companyIdFilter ? (companyMap.get(companyIdFilter) ?? null) : null;

    const esc = (s: string | null | undefined): string => {
      if (!s) return '';
      return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    };

    const grouped = new Map<string, { companyName: string; projects: any[] }>();
    for (const p of projects) {
      const cid = p.companyId ?? "__unassigned__";
      const name = companyMap.get(cid) ?? "Unassigned";
      if (!grouped.has(cid)) grouped.set(cid, { companyName: name, projects: [] });
      grouped.get(cid)!.projects.push(p);
    }

    const isNotifiable = (p: any) =>
      (p.estimatedDays && p.estimatedDays > 30) ||
      (p.peakWorkers && p.peakWorkers > 20) ||
      (p.personDays && p.personDays > 500);

    const f10Badge = (p: any) => {
      if (!isNotifiable(p)) return `<span class="badge badge-grey">Not Required</span>`;
      if (p.f10Status === "submitted") return `<span class="badge badge-green">F10 Submitted</span>`;
      if (p.f10Status === "pending") return `<span class="badge badge-amber">F10 Pending</span>`;
      return `<span class="badge badge-red">F10 Required</span>`;
    };

    const statusBadge = (s: string) => {
      const map: Record<string, string> = { planning: "badge-blue", active: "badge-green", complete: "badge-grey", cancelled: "badge-red" };
      return `<span class="badge ${map[s] ?? "badge-grey"}">${s.charAt(0).toUpperCase() + s.slice(1)}</span>`;
    };

    const tick = (v: boolean) => v
      ? `<span class="tick tick-yes">&#10003;</span>`
      : `<span class="tick tick-no">&#10007;</span>`;

    const docRow = (label: string, status: string, date: string | null, notes: string | null) => {
      const statusColors: Record<string, string> = {
        not_prepared: "#dc2626", in_progress: "#d97706", approved: "#16a34a",
        prepared: "#16a34a", distributed: "#16a34a",
        not_started: "#dc2626", complete: "#16a34a", handed_over: "#16a34a",
      };
      const colour = statusColors[esc(status)] ?? "#6b7280";
      const statusLabel = esc(status).replace(/_/g, " ").replace(/\b\w/g, (l: string) => l.toUpperCase());
      return `<tr>
        <td class="doc-label">${esc(label)}</td>
        <td><span style="color:${colour};font-weight:600">${statusLabel}</span></td>
        <td>${date ? new Date(date).toLocaleDateString("en-GB") : "—"}</td>
        <td class="notes-cell">${notes ? esc(notes.substring(0, 80)) : "—"}</td>
      </tr>`;
    };

    const roleLabel = (r: string) => r.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase());

    // --- Compliance summary stats ---
    const statusCounts = { planning: 0, active: 0, complete: 0, cancelled: 0 } as Record<string, number>;
    for (const p of projects) {
      if (p.status in statusCounts) statusCounts[p.status]++;
    }

    let notifiableCount = 0;
    let f10Submitted = 0;
    let f10Pending = 0;
    let f10RequiredUnsent = 0;
    for (const p of projects) {
      if (isNotifiable(p)) {
        notifiableCount++;
        if (p.f10Status === "submitted") f10Submitted++;
        else if (p.f10Status === "pending") f10Pending++;
        else f10RequiredUnsent++;
      }
    }

    const contractorSummaryRows: { name: string; totalProjects: number; notifiable: number; f10Ok: number; docRate: number }[] = [];
    let portfolioCompliantDocs = 0;
    let portfolioTotalDocs = 0;
    for (const [, group] of grouped) {
      const totalProjects = group.projects.length;
      const notifiable = group.projects.filter((p: any) => isNotifiable(p)).length;
      const f10Ok = group.projects.filter((p: any) => isNotifiable(p) && p.f10Status === "submitted").length;
      let compliantDocs = 0;
      for (const p of group.projects) {
        if (["approved", "prepared", "distributed"].includes(p.cppStatus ?? "")) compliantDocs++;
        if (["approved", "prepared", "distributed"].includes(p.pciStatus ?? "")) compliantDocs++;
        if (["complete", "handed_over"].includes(p.hsfStatus ?? "")) compliantDocs++;
      }
      portfolioCompliantDocs += compliantDocs;
      portfolioTotalDocs += totalProjects * 3;
      const docRate = totalProjects > 0 ? Math.round((compliantDocs / (totalProjects * 3)) * 100) : 0;
      contractorSummaryRows.push({ name: group.companyName, totalProjects, notifiable, f10Ok, docRate });
    }

    const portfolioScore = portfolioTotalDocs > 0 ? Math.round((portfolioCompliantDocs / portfolioTotalDocs) * 100) : 0;

    const rateColour = (r: number) => r >= 80 ? "#15803d" : r >= 50 ? "#b45309" : "#b91c1c";
    const rateBg = (r: number) => r >= 80 ? "#dcfce7" : r >= 50 ? "#fef3c7" : "#fee2e2";
    const portfolioScoreLabel = portfolioScore >= 80 ? "High Compliance" : portfolioScore >= 50 ? "Partial Compliance" : "Low Compliance";

    const contractorTableRows = contractorSummaryRows.map(row => `
      <tr>
        <td style="font-weight:600;color:#1e293b">${esc(row.name)}</td>
        <td style="text-align:center">${row.totalProjects}</td>
        <td style="text-align:center">${row.notifiable}</td>
        <td style="text-align:center">${row.notifiable > 0 ? `${row.f10Ok} / ${row.notifiable}` : "—"}</td>
        <td style="text-align:center">
          <span style="display:inline-block;padding:2px 8px;border-radius:9999px;font-size:9px;font-weight:700;background:${rateBg(row.docRate)};color:${rateColour(row.docRate)}">${row.docRate}%</span>
        </td>
      </tr>`).join("");

    const summaryPageHtml = `
<div class="summary-page">
<div class="summary-page-header">
  <div class="summary-page-title">Executive Compliance Summary</div>
  <div class="summary-page-subtitle">Portfolio overview &mdash; ${new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}</div>
</div>

<div class="summary-block" style="text-align:center;padding:20px 24px">
  <div class="summary-block-title" style="margin-bottom:12px">Overall Compliance Score</div>
  <div style="display:inline-flex;flex-direction:column;align-items:center;gap:6px;background:${rateBg(portfolioScore)};border:2px solid ${rateColour(portfolioScore)};border-radius:12px;padding:16px 40px">
    <div style="font-size:48px;font-weight:800;line-height:1;color:${rateColour(portfolioScore)}">${portfolioScore}%</div>
    <div style="font-size:12px;font-weight:700;letter-spacing:0.05em;text-transform:uppercase;color:${rateColour(portfolioScore)}">${portfolioScoreLabel}</div>
  </div>
  <div style="margin-top:10px;font-size:9px;color:#64748b">Weighted average of CPP, PCI &amp; HSF document completion across all projects</div>
</div>

<div class="summary-block">
  <div class="summary-block-title">Projects by Status</div>
  <div class="summary-stat-row">
    <div class="summary-stat-card summary-stat-blue">
      <div class="summary-stat-value">${statusCounts.planning}</div>
      <div class="summary-stat-label">Planning</div>
    </div>
    <div class="summary-stat-card summary-stat-green">
      <div class="summary-stat-value">${statusCounts.active}</div>
      <div class="summary-stat-label">Active</div>
    </div>
    <div class="summary-stat-card summary-stat-grey">
      <div class="summary-stat-value">${statusCounts.complete}</div>
      <div class="summary-stat-label">Complete</div>
    </div>
    <div class="summary-stat-card summary-stat-red">
      <div class="summary-stat-value">${statusCounts.cancelled}</div>
      <div class="summary-stat-label">Cancelled</div>
    </div>
  </div>
</div>

<div class="summary-block">
  <div class="summary-block-title">F10 Notification Status</div>
  <div class="summary-stat-row">
    <div class="summary-stat-card summary-stat-amber">
      <div class="summary-stat-value">${notifiableCount}</div>
      <div class="summary-stat-label">Notifiable Projects</div>
    </div>
    <div class="summary-stat-card summary-stat-green">
      <div class="summary-stat-value">${f10Submitted}</div>
      <div class="summary-stat-label">F10 Submitted</div>
    </div>
    <div class="summary-stat-card summary-stat-amber">
      <div class="summary-stat-value">${f10Pending}</div>
      <div class="summary-stat-label">F10 Pending</div>
    </div>
    <div class="summary-stat-card summary-stat-red">
      <div class="summary-stat-value">${f10RequiredUnsent}</div>
      <div class="summary-stat-label">F10 Not Submitted</div>
    </div>
  </div>
</div>

<div class="summary-block">
  <div class="summary-block-title">Per-Contractor Compliance Overview</div>
  <table class="summary-table">
    <thead>
      <tr>
        <th>Contractor</th>
        <th style="text-align:center">Projects</th>
        <th style="text-align:center">Notifiable</th>
        <th style="text-align:center">F10 Submitted</th>
        <th style="text-align:center">Doc Compliance</th>
      </tr>
    </thead>
    <tbody>${contractorTableRows || `<tr><td colspan="5" style="text-align:center;color:#64748b">No contractor data</td></tr>`}</tbody>
  </table>
  <div class="summary-table-note">Doc Compliance = percentage of CPP / PCI / HSF documents in an approved, prepared, or distributed state (CPP &amp; PCI) or complete / handed-over state (HSF) across all projects.</div>
</div>
</div>`;

    let groupsHtml = "";
    for (const [, group] of grouped) {
      const rows = group.projects.map(p => `
        <div class="project-card">
          <div class="project-header">
            <div class="project-title-row">
              <span class="project-title">${esc(p.title)}</span>
              ${statusBadge(p.status)}
              ${f10Badge(p)}
            </div>
            <div class="project-meta">
              ${p.location ? `<span>&#x1F4CD; ${esc(p.location)}</span>` : ""}
              ${p.clientName ? `<span>Client: ${esc(p.clientName)}</span>` : ""}
              <span>Role: ${esc(roleLabel(p.contractorRole ?? "contractor"))}</span>
              ${p.startDate ? `<span>Start: ${new Date(p.startDate).toLocaleDateString("en-GB")}</span>` : ""}
              ${p.endDate ? `<span>End: ${new Date(p.endDate).toLocaleDateString("en-GB")}</span>` : ""}
            </div>
            ${p.f10Reference ? `<div class="f10-ref">HSE F10 Reference: <strong>${esc(p.f10Reference)}</strong>${p.f10Date ? ` (submitted ${new Date(p.f10Date).toLocaleDateString("en-GB")})` : ""}</div>` : ""}
          </div>
          <table class="doc-table">
            <thead><tr><th>Document</th><th>Status</th><th>Date</th><th>Notes</th></tr></thead>
            <tbody>
              ${docRow("Construction Phase Plan (CPP)", p.cppStatus ?? "not_prepared", p.cppDate, p.cppNotes)}
              ${docRow("Pre-Construction Information (PCI)", p.pciStatus ?? "not_prepared", p.pciDate, p.pciNotes)}
              ${docRow("Health &amp; Safety File (HSF)", p.hsfStatus ?? "not_started", p.hsfDate, p.hsfNotes)}
            </tbody>
          </table>
          <div class="welfare-section">
            <div class="welfare-title">Welfare Provisions (CDM Reg 25)</div>
            <div class="welfare-grid">
              <div class="welfare-item">${tick(!!p.welfareToilets)} Sanitary Conveniences</div>
              <div class="welfare-item">${tick(!!p.welfareWashing)} Washing Facilities</div>
              <div class="welfare-item">${tick(!!p.welfareRestArea)} Rest Area</div>
              <div class="welfare-item">${tick(!!p.welfareDrinkingWater)} Drinking Water</div>
              <div class="welfare-item">${tick(!!p.welfareChanging)} Changing Rooms</div>
            </div>
          </div>
          ${p.notes ? `<div class="project-notes"><strong>Notes:</strong> ${esc(p.notes)}</div>` : ""}
        </div>`).join("");

      groupsHtml += `
        <div class="company-section">
          <div class="company-header">
            <span class="company-name">${esc(group.companyName)}</span>
            <span class="company-count">${group.projects.length} project${group.projects.length !== 1 ? "s" : ""}</span>
          </div>
          ${rows}
        </div>`;
    }

    const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"/>
<title>CDM 2015 Compliance Register</title>
<style>
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: Arial, sans-serif; font-size: 11px; color: #1e293b; background: #fff; padding: 16px; }
.report-header { border-bottom: 3px solid #d97706; padding-bottom: 12px; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: flex-start; }
.report-header-left h1 { font-size: 20px; font-weight: 700; color: #92400e; }
.report-header-left p { color: #64748b; font-size: 10px; margin-top: 4px; }
.report-header-right { text-align: right; font-size: 11px; color: #374151; flex-shrink: 0; margin-left: 16px; }
.report-header-right img { max-height: 48px; max-width: 140px; object-fit: contain; margin-bottom: 4px; display: block; margin-left: auto; }
.report-header-right .org-name { font-weight: 700; font-size: 12px; color: #1e293b; }
.report-header-right .org-address { font-size: 9px; color: #64748b; white-space: pre-line; margin-top: 2px; }
.company-section { margin-bottom: 24px; }
.company-header { background: #fef3c7; border-left: 4px solid #d97706; padding: 8px 12px; display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
.company-name { font-size: 13px; font-weight: 700; color: #92400e; }
.company-count { font-size: 10px; color: #78716c; }
.project-card { border: 1px solid #e2e8f0; border-radius: 6px; margin-bottom: 10px; overflow: hidden; }
.project-header { padding: 10px 12px; background: #f8fafc; border-bottom: 1px solid #e2e8f0; }
.project-title-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 4px; }
.project-title { font-size: 13px; font-weight: 600; color: #0f172a; }
.project-meta { display: flex; gap: 12px; font-size: 10px; color: #64748b; flex-wrap: wrap; margin-top: 4px; }
.f10-ref { font-size: 10px; color: #1d4ed8; margin-top: 4px; }
.badge { display: inline-block; padding: 2px 7px; border-radius: 9999px; font-size: 9px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; }
.badge-green { background: #dcfce7; color: #15803d; }
.badge-amber { background: #fef3c7; color: #b45309; }
.badge-red { background: #fee2e2; color: #b91c1c; }
.badge-blue { background: #dbeafe; color: #1d4ed8; }
.badge-grey { background: #f1f5f9; color: #475569; }
.doc-table { width: 100%; border-collapse: collapse; font-size: 10px; }
.doc-table th { background: #f1f5f9; text-align: left; padding: 5px 8px; font-weight: 600; color: #475569; border-bottom: 1px solid #e2e8f0; }
.doc-table td { padding: 5px 8px; border-bottom: 1px solid #f1f5f9; vertical-align: top; }
.doc-label { font-weight: 600; color: #334155; width: 30%; }
.notes-cell { color: #64748b; width: 30%; }
.welfare-section { padding: 8px 12px; background: #fafafa; border-top: 1px solid #e2e8f0; }
.welfare-title { font-size: 10px; font-weight: 700; color: #475569; margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.05em; }
.welfare-grid { display: flex; gap: 14px; flex-wrap: wrap; }
.welfare-item { font-size: 10px; display: flex; align-items: center; gap: 4px; }
.tick { font-size: 12px; font-weight: 700; }
.tick-yes { color: #16a34a; }
.tick-no { color: #dc2626; }
.project-notes { padding: 6px 12px; font-size: 10px; color: #64748b; background: #fffbeb; border-top: 1px solid #fef3c7; }
.report-footer { margin-top: 24px; border-top: 1px solid #e2e8f0; padding-top: 8px; font-size: 9px; color: #94a3b8; }
.cover-page { display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 100vh; page-break-after: always; text-align: center; padding: 40px; background: #fff; }
.cover-logo { max-height: 120px; max-width: 280px; object-fit: contain; margin-bottom: 32px; }
.cover-logo-placeholder { width: 80px; height: 80px; background: #d97706; border-radius: 12px; margin: 0 auto 32px; }
.cover-divider-top { width: 80px; height: 4px; background: #d97706; border-radius: 2px; margin: 0 auto 32px; }
.cover-report-title { font-size: 28px; font-weight: 700; color: #92400e; letter-spacing: -0.5px; margin-bottom: 8px; }
.cover-report-subtitle { font-size: 14px; color: #b45309; font-weight: 600; margin-bottom: 32px; letter-spacing: 0.05em; text-transform: uppercase; }
.cover-divider-bottom { width: 80px; height: 4px; background: #d97706; border-radius: 2px; margin: 0 auto 32px; }
.cover-company-name { font-size: 18px; font-weight: 700; color: #1e293b; margin-bottom: 10px; }
.cover-company-address { font-size: 12px; color: #64748b; line-height: 1.7; white-space: pre-line; margin-bottom: 32px; }
.cover-meta-box { border: 1px solid #fde68a; background: #fef3c7; border-radius: 8px; padding: 18px 32px; display: inline-block; margin-bottom: 0; }
.cover-meta-row { font-size: 11px; color: #374151; margin-bottom: 6px; display: flex; justify-content: space-between; gap: 24px; }
.cover-meta-row:last-child { margin-bottom: 0; }
.cover-meta-label { font-weight: 600; color: #92400e; }
.cover-confidential { margin-top: 48px; font-size: 9px; color: #94a3b8; letter-spacing: 0.1em; text-transform: uppercase; }
.summary-page { page-break-after: always; padding: 32px 24px; }
.summary-page-header { border-bottom: 3px solid #d97706; padding-bottom: 12px; margin-bottom: 24px; }
.summary-page-title { font-size: 22px; font-weight: 700; color: #92400e; }
.summary-page-subtitle { font-size: 11px; color: #64748b; margin-top: 4px; }
.summary-block { margin-bottom: 28px; }
.summary-block-title { font-size: 12px; font-weight: 700; color: #78350f; text-transform: uppercase; letter-spacing: 0.07em; border-left: 4px solid #d97706; padding-left: 8px; margin-bottom: 12px; background: #fef3c7; padding: 6px 10px; border-radius: 0 4px 4px 0; }
.summary-stat-row { display: flex; gap: 14px; }
.summary-stat-card { flex: 1; border-radius: 8px; padding: 16px 14px; text-align: center; border: 1px solid; }
.summary-stat-value { font-size: 28px; font-weight: 700; margin-bottom: 4px; }
.summary-stat-label { font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em; }
.summary-stat-blue { background: #dbeafe; border-color: #93c5fd; color: #1d4ed8; }
.summary-stat-green { background: #dcfce7; border-color: #86efac; color: #15803d; }
.summary-stat-grey { background: #f1f5f9; border-color: #cbd5e1; color: #475569; }
.summary-stat-red { background: #fee2e2; border-color: #fca5a5; color: #b91c1c; }
.summary-stat-amber { background: #fef3c7; border-color: #fde68a; color: #b45309; }
.summary-table { width: 100%; border-collapse: collapse; font-size: 10px; }
.summary-table th { background: #fef3c7; text-align: left; padding: 7px 10px; font-weight: 700; color: #78350f; border-bottom: 2px solid #d97706; }
.summary-table td { padding: 7px 10px; border-bottom: 1px solid #f1f5f9; vertical-align: middle; color: #374151; }
.summary-table tbody tr:nth-child(even) { background: #fafafa; }
.summary-table-note { margin-top: 8px; font-size: 9px; color: #94a3b8; font-style: italic; }
@media print { body { padding: 0; } .cover-page { min-height: 100vh; } .summary-page { min-height: 100vh; } }
</style>
</head><body>
<div class="cover-page">
${resolvedLogoUrl
  ? `<img class="cover-logo" src="${esc(resolvedLogoUrl)}" alt="Company logo" />`
  : `<div class="cover-logo-placeholder"></div>`}
<div class="cover-divider-top"></div>
<div class="cover-report-title">CDM 2015 Compliance Register${filteredCompanyName ? ` \u2014 ${esc(filteredCompanyName)}` : ""}</div>
<div class="cover-report-subtitle">Construction (Design &amp; Management) Regulations 2015</div>
<div class="cover-divider-bottom"></div>
${companySettings?.companyName ? `<div class="cover-company-name">${esc(companySettings.companyName)}</div>` : ""}
${companySettings?.address ? `<div class="cover-company-address">${esc(companySettings.address)}</div>` : ""}
<div class="cover-meta-box">
  <div class="cover-meta-row">
    <span class="cover-meta-label">Date Generated:</span>
    <span>${new Date().toLocaleDateString("en-GB", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}</span>
  </div>
  <div class="cover-meta-row">
    <span class="cover-meta-label">Total Projects:</span>
    <span>${projects.length}</span>
  </div>
  <div class="cover-meta-row">
    <span class="cover-meta-label">Contractor Companies:</span>
    <span>${grouped.size}</span>
  </div>
  <div class="cover-meta-row">
    <span class="cover-meta-label">Prepared By:</span>
    <span>${esc(preparedBy)}</span>
  </div>
</div>
<div class="cover-confidential">Confidential &mdash; For internal and regulatory use only</div>
</div>
${summaryPageHtml}
<div class="report-header">
<div class="report-header-left">
  <h1>CDM 2015 Compliance Register${filteredCompanyName ? ` \u2014 ${esc(filteredCompanyName)}` : ""}</h1>
  <p>Generated: ${new Date().toLocaleDateString("en-GB", { weekday: "long", year: "numeric", month: "long", day: "numeric" })} | Total Projects: ${projects.length} across ${grouped.size} contractor${grouped.size !== 1 ? "s" : ""}</p>
  ${(statusFilter || fromDate || toDate) ? `<p style="margin-top:4px;color:#92400e;font-weight:600">Filter: ${[statusFilter ? `Status: ${statusFilter.charAt(0).toUpperCase() + statusFilter.slice(1)}` : null, fromDate ? `From: ${new Date(fromDate).toLocaleDateString("en-GB")}` : null, toDate ? `To: ${new Date(toDate).toLocaleDateString("en-GB")}` : null].filter(Boolean).join(" | ")}</p>` : ""}
</div>
<div class="report-header-right">
  ${resolvedLogoUrl ? `<img src="${esc(resolvedLogoUrl)}" alt="Company logo" />` : ""}
  <div class="org-name">${esc(companySettings?.companyName ?? "")}</div>
  ${companySettings?.address ? `<div class="org-address">${esc(companySettings.address)}</div>` : ""}
</div>
</div>
${grouped.size === 0 ? `<p style="color:#64748b;text-align:center;margin-top:40px">No CDM projects found.</p>` : groupsHtml}
<div class="report-footer">CDM 2015 Compliance Register${companySettings?.companyName ? ` — ${esc(companySettings.companyName)}` : ""} — Confidential. For internal and regulatory use only.</div>
</body></html>`;

    const _rawSlug = filteredCompanyName ? filteredCompanyName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') : '';
    const companyFileSlug = _rawSlug ? '-' + _rawSlug : '';
    const toSafeSlugPart = (v: string) => v.toLowerCase().replace(/[^a-z0-9-]/g, '').replace(/^-|-$/g, '');
    const statusFileSlug = statusFilter ? `-${toSafeSlugPart(statusFilter)}` : '';
    const fromFileSlug = fromDate ? `-from-${toSafeSlugPart(fromDate)}` : '';
    const toFileSlug = toDate ? `-to-${toSafeSlugPart(toDate)}` : '';
    const filterFileSlug = `${statusFileSlug}${fromFileSlug}${toFileSlug}`;
    try {
      let puppeteer: any;
      try { puppeteer = await import('puppeteer'); } catch { throw new Error('puppeteer_unavailable'); }
      const puppeteerLaunch = puppeteer.default?.launch ?? puppeteer.launch;
      if (!puppeteerLaunch) throw new Error('puppeteer_launch_missing');
      const browser = await puppeteerLaunch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--no-zygote', '--single-process'],
      });
      try {
        const page = await browser.newPage();
        await page.setContent(html, { waitUntil: 'networkidle0' });
        const pdfBuffer = await page.pdf({
          format: 'A4',
          printBackground: true,
          margin: { top: '12mm', bottom: '12mm', left: '10mm', right: '10mm' },
        });
        await browser.close();
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="cdm-compliance-report${companyFileSlug}${filterFileSlug}-${new Date().toISOString().split('T')[0]}.pdf"`);
        return res.send(Buffer.from(pdfBuffer));
      } catch (pdfErr) {
        await browser.close();
        throw pdfErr;
      }
    } catch (pdfErr) {
      logger.warn('[cdm-export-pdf] PDF generation unavailable, falling back to HTML:', (pdfErr as Error).message);
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="cdm-compliance-report${companyFileSlug}${filterFileSlug}-${new Date().toISOString().split('T')[0]}.html"`);
      return res.send(html);
    }
  } catch (error) {
    logger.error("Error generating CDM PDF:", error);
    res.status(500).json({ error: "Failed to generate CDM compliance report" });
  }
});

// GET single CDM project
app.get("/api/cdm/projects/:id", requireAuth, async (req, res) => {
  if (req.user!.role !== "admin") return res.status(403).json({ error: "Administrator access required" });
  try {
    const { id } = req.params;
    const db = await customerDbService.getCustomerDatabase(req.customerId!);
    const [project] = await db.select().from(isolatedSchema.cdmProjects)
      .where(eq(isolatedSchema.cdmProjects.id, id));
    if (!project) return res.status(404).json({ error: "CDM project not found" });
    res.json(project);
  } catch (error) {
    logger.error("Error fetching CDM project:", error);
    res.status(500).json({ error: "Failed to fetch CDM project" });
  }
});

// POST create CDM project (admin only)
app.post("/api/cdm/projects", requireAuth, async (req, res) => {
  if (req.user!.role !== "admin") return res.status(403).json({ error: "Administrator access required" });
  try {
    const { db, siteId } = await getScopedDb(req);
    const data = req.body;
    const [project] = await db.insert(isolatedSchema.cdmProjects).values(withSiteId(siteId, {
      companyId: data.companyId,
      title: data.title,
      description: data.description || null,
      location: data.location || null,
      clientName: data.clientName || null,
      contractorRole: data.contractorRole || "contractor",
      principalContractorId: data.principalContractorId || null,
      principalDesignerName: data.principalDesignerName || null,
      status: data.status || "planning",
      startDate: data.startDate || null,
      endDate: data.endDate || null,
      estimatedDays: data.estimatedDays ? parseInt(data.estimatedDays) : null,
      peakWorkers: data.peakWorkers ? parseInt(data.peakWorkers) : null,
      personDays: data.personDays ? parseInt(data.personDays) : null,
      f10Status: data.f10Status || "not_required",
      f10Date: data.f10Date || null,
      f10Reference: data.f10Reference || null,
      f10Notes: data.f10Notes || null,
      cppStatus: data.cppStatus || "not_prepared",
      cppDate: data.cppDate || null,
      cppNotes: data.cppNotes || null,
      pciStatus: data.pciStatus || "not_prepared",
      pciDate: data.pciDate || null,
      pciNotes: data.pciNotes || null,
      hsfStatus: data.hsfStatus || "not_started",
      hsfDate: data.hsfDate || null,
      hsfNotes: data.hsfNotes || null,
      welfareToilets: data.welfareToilets || false,
      welfareWashing: data.welfareWashing || false,
      welfareRestArea: data.welfareRestArea || false,
      welfareDrinkingWater: data.welfareDrinkingWater || false,
      welfareChanging: data.welfareChanging || false,
      notes: data.notes || null,
    })).returning();
    res.json(project);
  } catch (error) {
    logger.error("Error creating CDM project:", error);
    res.status(500).json({ error: "Failed to create CDM project" });
  }
});

// PUT update CDM project (admin only)
app.put("/api/cdm/projects/:id", requireAuth, async (req, res) => {
  if (req.user!.role !== "admin") return res.status(403).json({ error: "Administrator access required" });
  try {
    const { id } = req.params;
    const db = await customerDbService.getCustomerDatabase(req.customerId!);
    const data = req.body;
    const updates: Record<string, any> = {};
    if (data.title !== undefined) updates.title = data.title;
    if (data.description !== undefined) updates.description = data.description;
    if (data.location !== undefined) updates.location = data.location;
    if (data.clientName !== undefined) updates.clientName = data.clientName;
    if (data.contractorRole !== undefined) updates.contractorRole = data.contractorRole;
    if (data.principalContractorId !== undefined) updates.principalContractorId = data.principalContractorId;
    if (data.principalDesignerName !== undefined) updates.principalDesignerName = data.principalDesignerName;
    if (data.status !== undefined) updates.status = data.status;
    if (data.startDate !== undefined) updates.startDate = data.startDate;
    if (data.endDate !== undefined) updates.endDate = data.endDate;
    if (data.estimatedDays !== undefined) updates.estimatedDays = data.estimatedDays ? parseInt(data.estimatedDays) : null;
    if (data.peakWorkers !== undefined) updates.peakWorkers = data.peakWorkers ? parseInt(data.peakWorkers) : null;
    if (data.personDays !== undefined) updates.personDays = data.personDays ? parseInt(data.personDays) : null;
    if (data.f10Status !== undefined) updates.f10Status = data.f10Status;
    if (data.f10Status === "submitted") updates.f10AlertSentAt = null;
    if (data.f10Date !== undefined) updates.f10Date = data.f10Date;
    if (data.f10Reference !== undefined) updates.f10Reference = data.f10Reference;
    if (data.f10Notes !== undefined) updates.f10Notes = data.f10Notes;
    if (data.cppStatus !== undefined) updates.cppStatus = data.cppStatus;
    if (data.cppDate !== undefined) updates.cppDate = data.cppDate;
    if (data.cppNotes !== undefined) updates.cppNotes = data.cppNotes;
    if (data.pciStatus !== undefined) updates.pciStatus = data.pciStatus;
    if (data.pciDate !== undefined) updates.pciDate = data.pciDate;
    if (data.pciNotes !== undefined) updates.pciNotes = data.pciNotes;
    if (data.hsfStatus !== undefined) updates.hsfStatus = data.hsfStatus;
    if (data.hsfDate !== undefined) updates.hsfDate = data.hsfDate;
    if (data.hsfNotes !== undefined) updates.hsfNotes = data.hsfNotes;
    if (data.welfareToilets !== undefined) updates.welfareToilets = data.welfareToilets;
    if (data.welfareWashing !== undefined) updates.welfareWashing = data.welfareWashing;
    if (data.welfareRestArea !== undefined) updates.welfareRestArea = data.welfareRestArea;
    if (data.welfareDrinkingWater !== undefined) updates.welfareDrinkingWater = data.welfareDrinkingWater;
    if (data.welfareChanging !== undefined) updates.welfareChanging = data.welfareChanging;
    if (data.notes !== undefined) updates.notes = data.notes;
    const [project] = await db.update(isolatedSchema.cdmProjects)
      .set(updates)
      .where(eq(isolatedSchema.cdmProjects.id, id))
      .returning();
    if (!project) return res.status(404).json({ error: "CDM project not found" });
    res.json(project);
  } catch (error) {
    logger.error("Error updating CDM project:", error);
    res.status(500).json({ error: "Failed to update CDM project" });
  }
});

// DELETE CDM project (admin only)
app.delete("/api/cdm/projects/:id", requireAuth, async (req, res) => {
  if (req.user!.role !== "admin") return res.status(403).json({ error: "Administrator access required" });
  try {
    const { id } = req.params;
    const db = await customerDbService.getCustomerDatabase(req.customerId!);
    await db.delete(isolatedSchema.cdmProjects)
      .where(eq(isolatedSchema.cdmProjects.id, id));
    res.json({ success: true });
  } catch (error) {
    logger.error("Error deleting CDM project:", error);
    res.status(500).json({ error: "Failed to delete CDM project" });
  }
});

// PATCH update CDM project — alias for PUT (same handler, required by API contract)
app.patch("/api/cdm/projects/:id", requireAuth, async (req, res) => {
  if (req.user!.role !== "admin") return res.status(403).json({ error: "Administrator access required" });
  try {
    const { id } = req.params;
    const db = await customerDbService.getCustomerDatabase(req.customerId!);
    const data = req.body;
    const updates: Record<string, any> = {};
    if (data.title !== undefined) updates.title = data.title;
    if (data.description !== undefined) updates.description = data.description;
    if (data.location !== undefined) updates.location = data.location;
    if (data.clientName !== undefined) updates.clientName = data.clientName;
    if (data.contractorRole !== undefined) updates.contractorRole = data.contractorRole;
    if (data.principalContractorId !== undefined) updates.principalContractorId = data.principalContractorId;
    if (data.principalDesignerName !== undefined) updates.principalDesignerName = data.principalDesignerName;
    if (data.status !== undefined) updates.status = data.status;
    if (data.startDate !== undefined) updates.startDate = data.startDate;
    if (data.endDate !== undefined) updates.endDate = data.endDate;
    if (data.estimatedDays !== undefined) updates.estimatedDays = data.estimatedDays ? parseInt(data.estimatedDays) : null;
    if (data.peakWorkers !== undefined) updates.peakWorkers = data.peakWorkers ? parseInt(data.peakWorkers) : null;
    if (data.personDays !== undefined) updates.personDays = data.personDays ? parseInt(data.personDays) : null;
    // isNotifiable is a computed/display value — not persisted in DB, derived from estimatedDays/peakWorkers/personDays
    if (data.f10Status !== undefined) updates.f10Status = data.f10Status;
    if (data.f10Status === "submitted") updates.f10AlertSentAt = null;
    if (data.f10Date !== undefined) updates.f10Date = data.f10Date;
    if (data.f10Reference !== undefined) updates.f10Reference = data.f10Reference;
    if (data.f10Notes !== undefined) updates.f10Notes = data.f10Notes;
    if (data.cppStatus !== undefined) updates.cppStatus = data.cppStatus;
    if (data.cppDate !== undefined) updates.cppDate = data.cppDate;
    if (data.cppNotes !== undefined) updates.cppNotes = data.cppNotes;
    if (data.pciStatus !== undefined) updates.pciStatus = data.pciStatus;
    if (data.pciDate !== undefined) updates.pciDate = data.pciDate;
    if (data.pciNotes !== undefined) updates.pciNotes = data.pciNotes;
    if (data.hsfStatus !== undefined) updates.hsfStatus = data.hsfStatus;
    if (data.hsfDate !== undefined) updates.hsfDate = data.hsfDate;
    if (data.hsfNotes !== undefined) updates.hsfNotes = data.hsfNotes;
    if (data.welfareToilets !== undefined) updates.welfareToilets = data.welfareToilets;
    if (data.welfareWashing !== undefined) updates.welfareWashing = data.welfareWashing;
    if (data.welfareRestArea !== undefined) updates.welfareRestArea = data.welfareRestArea;
    if (data.welfareDrinkingWater !== undefined) updates.welfareDrinkingWater = data.welfareDrinkingWater;
    if (data.welfareChanging !== undefined) updates.welfareChanging = data.welfareChanging;
    if (data.notes !== undefined) updates.notes = data.notes;
    if (Object.keys(updates).length === 0) return res.status(400).json({ error: "No fields to update" });
    const [project] = await db.update(isolatedSchema.cdmProjects).set(updates).where(eq(isolatedSchema.cdmProjects.id, id)).returning();
    if (!project) return res.status(404).json({ error: "CDM project not found" });
    res.json(project);
  } catch (error) {
    logger.error("Error updating CDM project (PATCH):", error);
    res.status(500).json({ error: "Failed to update CDM project" });
  }
});


// PUT update contractor company CDM/accreditation fields (admin only)
app.put("/api/cdm/contractor/:id/accreditations", requireAuth, async (req, res) => {
  if (req.user!.role !== "admin") return res.status(403).json({ error: "Administrator access required" });
  try {
    const { id } = req.params;
    const db = await customerDbService.getCustomerDatabase(req.customerId!);
    const data = req.body;
    const updates: Record<string, any> = {};
    if (data.cdmRole !== undefined) updates.cdmRole = data.cdmRole;
    if (data.constructionlineGrade !== undefined) updates.constructionlineGrade = data.constructionlineGrade;
    if (data.smasAccredited !== undefined) updates.smasAccredited = data.smasAccredited;
    if (data.otherAccreditations !== undefined) updates.otherAccreditations = data.otherAccreditations;
    if (data.pdProfessionalBody !== undefined) updates.pdProfessionalBody = data.pdProfessionalBody;
    const [company] = await db.update(isolatedSchema.contractorCompanies)
      .set(updates)
      .where(eq(isolatedSchema.contractorCompanies.id, id))
      .returning();
    if (!company) return res.status(404).json({ error: "Contractor company not found" });
    res.json(company);
  } catch (error) {
    logger.error("Error updating CDM accreditations:", error);
    res.status(500).json({ error: "Failed to update CDM accreditations" });
  }
});


// ── Nightly Contractor Document Expiry Cron ────────────────────────────────
// Runs at midnight (00:00) Europe/London every night.
// Scans all active contractor documents across all customers for those whose
// expiryDate has passed OR is within the next 30 days, and have not yet
// triggered an alert (expiryAlertedAt IS NULL).
// Sends a digest email to the admin with "Expired" and "Expiring Soon" sections,
// then stamps expiryAlertedAt so the alert is never repeated for the same document.
{
  const rawHour = parseInt(process.env.CONTRACTOR_EXPIRY_ALERT_HOUR ?? "0", 10);
  const contractorExpiryAlertHour = isNaN(rawHour) || rawHour < 0 || rawHour > 23 ? 0 : rawHour;
  cron.schedule(`0 ${contractorExpiryAlertHour} * * *`, async () => {
    try {
      logger.info("[Contractor Expiry Cron] Running nightly contractor document expiry check…");
      const allCustomers = await customerDbService.getAllCustomers();
      const now = new Date();

      for (const customer of allCustomers) {
        try {
          const custDb = await customerDbService.getCustomerDatabase(customer.id);

          // ── Auto-revert approved companies whose compliance has now lapsed ────
          // Runs every night for every customer, regardless of expiry alerts.
          // reevaluateCompanyApproval is a no-op when the company is still compliant.
          try {
            const rvPool = (custDb as any).$client ?? (custDb as any).session?.client;
            if (rvPool) {
              const approvedResult = await rvPool.query(
                `SELECT id FROM contractor_companies WHERE onboarding_status = 'approved'`
              );
              for (const row of approvedResult.rows) {
                await reevaluateCompanyApproval(custDb, customer.id, row.id);
              }
            }
          } catch (revertErr) {
            logger.warn(`[Contractor Expiry Cron] Auto-revert check failed for customer ${customer.id} (non-fatal):`, revertErr);
          }

          const settingsRows = await custDb.execute(`SELECT company_name, email FROM company_settings LIMIT 1`);
          const settings = settingsRows.rows[0] as { company_name?: string; email?: string } | undefined;
          const companyName = (settings?.company_name as string) || "TPR-Max";
          const adminEmail = settings?.email as string | undefined;

          if (!adminEmail) {
            logger.info(`[Contractor Expiry Cron] No admin email configured for customer ${customer.id} — skipping`);
            continue;
          }

          // Find active documents that have already expired OR expire within 30 days,
          // and have not yet been alerted (expiryAlertedAt IS NULL).
          const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

          const allAlertDocs = await custDb.select({
            id: isolatedSchema.contractorDocuments.id,
            documentName: isolatedSchema.contractorDocuments.documentName,
            documentType: isolatedSchema.contractorDocuments.documentType,
            expiryDate: isolatedSchema.contractorDocuments.expiryDate,
            companyId: isolatedSchema.contractorDocuments.companyId,
            workerId: isolatedSchema.contractorDocuments.workerId,
          }).from(isolatedSchema.contractorDocuments)
            .where(and(
              eq(isolatedSchema.contractorDocuments.isActive, true),
              isNotNull(isolatedSchema.contractorDocuments.expiryDate),
              lte(isolatedSchema.contractorDocuments.expiryDate, thirtyDaysFromNow),
              sql`${isolatedSchema.contractorDocuments.expiryAlertedAt} IS NULL`
            ));

          if (allAlertDocs.length === 0) {
            logger.info(`[Contractor Expiry Cron] No newly-expired or expiring-soon contractor documents for customer ${customer.id}`);
            continue;
          }

          // Split into already-expired and expiring soon
          const expiredDocs = allAlertDocs.filter(d => d.expiryDate && new Date(d.expiryDate) < now);
          const expiringSoonDocs = allAlertDocs.filter(d => d.expiryDate && new Date(d.expiryDate) >= now);

          // Enrich with contractor company / worker names
          const companyIds = [...new Set(allAlertDocs.map(d => d.companyId).filter((id): id is string => !!id))];
          const workerIds = [...new Set(allAlertDocs.map(d => d.workerId).filter((id): id is string => !!id))];

          const [companies, workers] = await Promise.all([
            companyIds.length > 0
              ? custDb.select({ id: isolatedSchema.contractorCompanies.id, companyName: isolatedSchema.contractorCompanies.companyName })
                  .from(isolatedSchema.contractorCompanies)
                  .where(inArray(isolatedSchema.contractorCompanies.id, companyIds))
              : Promise.resolve([]),
            workerIds.length > 0
              ? custDb.select({ id: isolatedSchema.contractorWorkers.id, firstName: isolatedSchema.contractorWorkers.firstName, lastName: isolatedSchema.contractorWorkers.lastName })
                  .from(isolatedSchema.contractorWorkers)
                  .where(inArray(isolatedSchema.contractorWorkers.id, workerIds))
              : Promise.resolve([]),
          ]);

          const companyMap = Object.fromEntries(companies.map(c => [c.id, c.companyName]));
          const workerMap = Object.fromEntries(workers.map(w => [w.id, `${w.firstName} ${w.lastName}`]));

          const docTypeLabel = (t: string) =>
            t.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase());

          const buildTableRows = (docs: typeof allAlertDocs, dateColor: string) =>
            docs.map(d => {
              const entityName = d.workerId
                ? (workerMap[d.workerId] ?? "Unknown Worker")
                : d.companyId
                  ? (companyMap[d.companyId] ?? "Unknown Company")
                  : "—";
              const dateStr = d.expiryDate
                ? new Date(d.expiryDate).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
                : "—";
              return `<tr>
                <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;font-weight:500">${d.documentName}</td>
                <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6">${docTypeLabel(d.documentType)}</td>
                <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6">${entityName}</td>
                <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;color:${dateColor};font-weight:600">${dateStr}</td>
              </tr>`;
            }).join("");

          const buildTextLines = (docs: typeof allAlertDocs, verb: string) =>
            docs.map(d => {
              const entityName = d.workerId
                ? (workerMap[d.workerId] ?? "Unknown Worker")
                : d.companyId ? (companyMap[d.companyId] ?? "Unknown Company") : "—";
              const dateStr = d.expiryDate
                ? new Date(d.expiryDate).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
                : "—";
              return `- ${d.documentName} (${docTypeLabel(d.documentType)}) — ${entityName} — ${verb} ${dateStr}`;
            }).join("\n");

          const tableHeader = (bgColor: string, lastColLabel: string) => `
            <thead>
              <tr style="background:${bgColor}">
                <th style="text-align:left;padding:8px 12px;font-size:12px;text-transform:uppercase;color:#6b7280">Document</th>
                <th style="text-align:left;padding:8px 12px;font-size:12px;text-transform:uppercase;color:#6b7280">Type</th>
                <th style="text-align:left;padding:8px 12px;font-size:12px;text-transform:uppercase;color:#6b7280">Contractor / Worker</th>
                <th style="text-align:left;padding:8px 12px;font-size:12px;text-transform:uppercase;color:#6b7280">${lastColLabel}</th>
              </tr>
            </thead>`;

          let htmlSections = "";
          let textSections = "";

          if (expiredDocs.length > 0) {
            htmlSections += `
              <h3 style="margin:16px 0 8px;color:#dc2626">Expired (${expiredDocs.length})</h3>
              <p style="margin:0 0 8px;font-size:13px;color:#374151">These documents have already lapsed and require immediate renewal:</p>
              <table style="width:100%;border-collapse:collapse;margin:0 0 16px;font-size:14px">
                ${tableHeader("#fef2f2", "Expired On")}
                <tbody>${buildTableRows(expiredDocs, "#dc2626")}</tbody>
              </table>`;
            textSections += `EXPIRED (${expiredDocs.length}):\n${buildTextLines(expiredDocs, "expired")}\n\n`;
          }

          if (expiringSoonDocs.length > 0) {
            htmlSections += `
              <h3 style="margin:16px 0 8px;color:#d97706">Expiring Soon — within 30 days (${expiringSoonDocs.length})</h3>
              <p style="margin:0 0 8px;font-size:13px;color:#374151">These documents will expire within the next 30 days — please arrange renewals in advance:</p>
              <table style="width:100%;border-collapse:collapse;margin:0 0 16px;font-size:14px">
                ${tableHeader("#fffbeb", "Expires On")}
                <tbody>${buildTableRows(expiringSoonDocs, "#d97706")}</tbody>
              </table>`;
            textSections += `EXPIRING SOON — within 30 days (${expiringSoonDocs.length}):\n${buildTextLines(expiringSoonDocs, "expires")}\n\n`;
          }

          const totalCount = allAlertDocs.length;
          const subjectParts: string[] = [];
          if (expiredDocs.length > 0) subjectParts.push(`${expiredDocs.length} Expired`);
          if (expiringSoonDocs.length > 0) subjectParts.push(`${expiringSoonDocs.length} Expiring Soon`);

          const emailSvc = new EmailService(customer.id);
          const sent = await emailSvc.sendEmail({
            to: adminEmail,
            subject: `Contractor Alert: ${subjectParts.join(", ")} Document${totalCount > 1 ? "s" : ""}`,
            companyName,
            html: `
              <div style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto">
                <div style="background:#dc2626;color:#fff;padding:20px;border-radius:8px 8px 0 0">
                  <h2 style="margin:0">Contractor Document Expiry Alert — ${companyName}</h2>
                </div>
                <div style="background:#fff;padding:20px;border:1px solid #e5e7eb">
                  <p style="margin-top:0">The following contractor document${totalCount > 1 ? "s require" : " requires"} your attention:</p>
                  ${htmlSections}
                  <p style="color:#6b7280;font-size:13px">Please log in to TPR-Max to review these documents and request updated copies from the relevant contractors.</p>
                </div>
                <div style="background:#f9fafb;padding:12px 20px;border:1px solid #e5e7eb;border-top:0;border-radius:0 0 8px 8px;font-size:12px;color:#9ca3af">
                  This is an automated nightly alert sent by ${companyName} via TPR-Max.
                </div>
              </div>
            `,
            text: `Contractor Document Expiry Alert\n\n${textSections}Please log in to TPR-Max to review and action these documents.`,
          });

          if (sent) {
            const alertedIds = allAlertDocs.map(d => d.id);
            await custDb.update(isolatedSchema.contractorDocuments)
              .set({ expiryAlertedAt: new Date() })
              .where(inArray(isolatedSchema.contractorDocuments.id, alertedIds));
            logger.info(`[Contractor Expiry Cron] Digest sent for ${expiredDocs.length} expired + ${expiringSoonDocs.length} expiring-soon document(s) (customer ${customer.id})`);
          }
        } catch (custErr) {
          logger.error(`[Contractor Expiry Cron] Error processing customer ${customer.id}:`, custErr);
        }
      }
    } catch (err) {
      logger.error("[Contractor Expiry Cron] Fatal error in nightly check:", err);
    }
  }, { timezone: "Europe/London" });
  logger.info("[Contractor Expiry Cron] Nightly contractor document expiry check scheduled");
}

// ── End CDM routes ──────────────────────────────────────────────────────────
}
