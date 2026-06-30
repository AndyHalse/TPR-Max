import type { Express } from 'express';
import { requireAuth } from '../auth';
import { customerDbService } from '../customerDatabase';
import { logger } from '../utils/logger';
import { eq, and, gte, lte, inArray, desc } from 'drizzle-orm';
import * as iso from '../isolatedSchema';
import {
  contractorCompanies,
  contractorWorkers,
  contractorDocumentRequests,
  contractorVisits,
  cardIssues,
  cardOffences,
  ramsDocuments,
} from '../../shared/schema';
import { renderPdf } from '../enterpriseReportService';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function workingDaysBetween(start: Date | null, end: Date | null): number {
  if (!start || !end || end <= start) return 0;
  let days = 0;
  const d = new Date(start);
  d.setHours(0, 0, 0, 0);
  const e = new Date(end);
  e.setHours(0, 0, 0, 0);
  while (d < e) {
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6) days++;
    d.setDate(d.getDate() + 1);
  }
  return days;
}

function fmtD(d: Date | string | null | undefined): string {
  if (!d) return '—';
  const dt = typeof d === 'string' ? new Date(d) : d;
  if (isNaN(dt.getTime())) return '—';
  return dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function esc(s: string | null | undefined): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function slaBadge(sla: string): string {
  if (sla === 'pass')    return '<span class="badge badge-ok">Pass</span>';
  if (sla === 'warn')    return '<span class="badge badge-warn">Warn</span>';
  if (sla === 'fail')    return '<span class="badge badge-crit">Fail</span>';
  if (sla === 'expired') return '<span class="badge badge-grey">Expired</span>';
  if (sla === 'pending') return '<span class="badge badge-grey">Pending</span>';
  return '<span class="badge badge-ok">Direct</span>';
}

// ─── Data collection ──────────────────────────────────────────────────────────

async function collectSlaData(
  db: any,
  pool: any,
  schemaName: string,
  companyId: string,
  dateFrom: Date,
  dateTo: Date,
  slaDays: number,
  activeSiteId?: string,
) {
  // 1. Company info — raw SQL to avoid selecting columns that may not exist in DB yet
  const companyRows = await pool.query(
    `SELECT id, company_name FROM "${schemaName}"."contractor_companies" WHERE id = $1 LIMIT 1`,
    [companyId],
  );
  if (!companyRows.rows.length) throw new Error('Contractor company not found');
  const company = { companyName: companyRows.rows[0].company_name };

  // 2. Workers — explicit columns only to avoid selecting columns missing from DB
  const workers = await db
    .select({ id: contractorWorkers.id, firstName: contractorWorkers.firstName, lastName: contractorWorkers.lastName })
    .from(contractorWorkers)
    .where(eq(contractorWorkers.companyId, companyId));
  const workerIds: string[] = workers.map((w: any) => w.id);
  const workerMap = new Map<string, string>(
    workers.map((w: any) => [w.id as string, `${w.firstName} ${w.lastName}`]),
  );

  // 3. Compliance document requests → company docs (raw SQL to avoid missing equipment_id)
  const docRequests = await db
    .select({
      id: contractorDocumentRequests.id,
      createdAt: contractorDocumentRequests.createdAt,
      status: contractorDocumentRequests.status,
      requestedBy: contractorDocumentRequests.requestedBy,
    })
    .from(contractorDocumentRequests)
    .where(
      and(
        eq(contractorDocumentRequests.companyId, companyId),
        gte(contractorDocumentRequests.createdAt, dateFrom),
        lte(contractorDocumentRequests.createdAt, dateTo),
      ),
    )
    .orderBy(desc(contractorDocumentRequests.createdAt));

  let companyDocs: any[] = [];
  try {
    const r = await pool.query(
      `SELECT id, document_type, uploaded_at, status
         FROM "${schemaName}".contractor_documents
        WHERE company_id = $1
          AND worker_id IS NULL
          AND is_active = TRUE
          AND uploaded_at >= $2
          AND uploaded_at <= $3
        ORDER BY uploaded_at ASC`,
      [companyId, dateFrom.toISOString(), dateTo.toISOString()],
    );
    companyDocs = r.rows;
  } catch (err: any) {
    logger.warn('[SLA] companyDocs query failed:', err.message);
  }

  const turnaround = docRequests.map((req: any) => {
    const afterDocs = companyDocs.filter(
      (d: any) => new Date(d.uploaded_at) >= new Date(req.createdAt),
    );
    const firstDoc = afterDocs[0];
    if (!firstDoc) {
      const s = req.status === 'expired' ? 'expired' : 'pending';
      return {
        requestedAt: req.createdAt,
        documentType: 'Company Documents',
        receivedAt: null,
        workingDays: null,
        sla: s,
        requestedBy: req.requestedBy,
      };
    }
    const days = workingDaysBetween(new Date(req.createdAt), new Date(firstDoc.uploaded_at));
    const sla = days <= slaDays ? 'pass' : days <= Math.ceil(slaDays * 1.5) ? 'warn' : 'fail';
    return {
      requestedAt: req.createdAt,
      documentType: (firstDoc.document_type || 'Company Documents').replace(/_/g, ' '),
      receivedAt: firstDoc.uploaded_at,
      workingDays: days,
      sla,
      requestedBy: req.requestedBy,
    };
  });

  // 4. Safety cards
  let cards: any[] = [];
  if (workerIds.length > 0) {
    const rawCards = await db
      .select({
        id: cardIssues.id,
        workerId: cardIssues.workerId,
        cardType: cardIssues.cardType,
        issuedAt: cardIssues.issuedAt,
        description: cardIssues.description,
        location: cardIssues.location,
        status: cardIssues.status,
        offenceId: cardIssues.offenceId,
      })
      .from(cardIssues)
      .where(
        and(
          inArray(cardIssues.workerId, workerIds),
          gte(cardIssues.issuedAt, dateFrom),
          lte(cardIssues.issuedAt, dateTo),
        ),
      )
      .orderBy(desc(cardIssues.issuedAt));

    const offenceIds = [
      ...new Set(rawCards.map((c: any) => c.offenceId).filter(Boolean)),
    ] as string[];
    let offenceMap = new Map<string, string>();
    if (offenceIds.length > 0) {
      try {
        const offs = await db
          .select({ id: cardOffences.id, name: cardOffences.offenceName })
          .from(cardOffences)
          .where(inArray(cardOffences.id, offenceIds));
        offenceMap = new Map(offs.map((o: any) => [o.id as string, o.name as string]));
      } catch {}
    }

    cards = rawCards.map((c: any) => ({
      ...c,
      workerName: workerMap.get(c.workerId) ?? 'Unknown',
      offenceName: offenceMap.get(c.offenceId) ?? c.description,
    }));
  }

  // 5. PPM work orders for this contractor company
  let ppmOrders: any[] = [];
  try {
    const ppmWhere: any[] = [eq(iso.ppmWorkOrders.contractorCompanyId, companyId)];
    if (activeSiteId) ppmWhere.push(eq(iso.ppmWorkOrders.siteId, activeSiteId));
    const all = await db.select({
      id: iso.ppmWorkOrders.id,
      contractorCompanyId: iso.ppmWorkOrders.contractorCompanyId,
      siteId: iso.ppmWorkOrders.siteId,
      status: iso.ppmWorkOrders.status,
      title: iso.ppmWorkOrders.title,
      dueDate: iso.ppmWorkOrders.dueDate,
      completedDate: iso.ppmWorkOrders.completedDate,
      requiresCertificate: iso.ppmWorkOrders.requiresCertificate,
      certificateUploadedAt: iso.ppmWorkOrders.certificateUploadedAt,
    }).from(iso.ppmWorkOrders).where(and(...ppmWhere));
    ppmOrders = all.filter((o: any) => {
      const due  = o.dueDate       ? new Date(o.dueDate)       : null;
      const done = o.completedDate ? new Date(o.completedDate) : null;
      return (due  && due  >= dateFrom && due  <= dateTo)
          || (done && done >= dateFrom && done <= dateTo);
    });
  } catch (err: any) {
    logger.warn('[SLA] PPM query failed:', err.message);
  }
  const now = new Date();
  const ppmCompleted  = ppmOrders.filter((o: any) => o.status === 'completed');
  const ppmOnTime     = ppmCompleted.filter(
    (o: any) => o.dueDate && o.completedDate && new Date(o.completedDate) <= new Date(o.dueDate),
  );
  const ppmOverdue    = ppmOrders.filter(
    (o: any) => o.status !== 'completed' && o.dueDate && new Date(o.dueDate) < now,
  );
  const ppmOutstanding = ppmOrders.filter((o: any) => o.status !== 'completed');
  const ppmRate = ppmOrders.length > 0
    ? Math.round((ppmOnTime.length / ppmOrders.length) * 100)
    : null;

  // 6. H&S incidents linked to this contractor
  let incidents: any[] = [];
  try {
    const incWhere: any[] = [
      gte(iso.hsIncidents.incidentDate, dateFrom),
      lte(iso.hsIncidents.incidentDate, dateTo),
    ];
    if (activeSiteId) incWhere.push(eq(iso.hsIncidents.siteId, activeSiteId));
    const all = await db.select({
      id: iso.hsIncidents.id,
      incidentDate: iso.hsIncidents.incidentDate,
      siteId: iso.hsIncidents.siteId,
      contractorCompanyId: iso.hsIncidents.contractorCompanyId,
      injuredPersonType: iso.hsIncidents.injuredPersonType,
      title: iso.hsIncidents.title,
      recordType: iso.hsIncidents.recordType,
      injuredPerson: iso.hsIncidents.injuredPerson,
      riddorCategory: iso.hsIncidents.riddorCategory,
    }).from(iso.hsIncidents).where(and(...incWhere));
    incidents = all.filter(
      (i: any) =>
        i.contractorCompanyId === companyId || i.injuredPersonType === 'contractor',
    );
  } catch (err: any) {
    logger.warn('[SLA] H&S incidents query failed:', err.message);
  }

  // 7. Worker attendance via contractor_visits
  let allVisits: any[] = [];
  try {
    let v = await db
      .select({
        workerId: contractorVisits.workerId,
        siteId: contractorVisits.siteId,
        checkedInAt: contractorVisits.checkedInAt,
        checkedOutAt: contractorVisits.checkedOutAt,
      })
      .from(contractorVisits)
      .where(
        and(
          eq(contractorVisits.companyId, companyId),
          gte(contractorVisits.checkedInAt, dateFrom),
          lte(contractorVisits.checkedInAt, dateTo),
        ),
      );
    if (activeSiteId) v = v.filter((x: any) => !x.siteId || x.siteId === activeSiteId);
    allVisits = v;
  } catch (err: any) {
    logger.warn('[SLA] Visits query failed:', err.message);
  }

  const attMap = new Map<string, { name: string; days: Set<string>; totalMins: number }>();
  for (const v of allVisits) {
    const wid = v.workerId;
    if (!attMap.has(wid))
      attMap.set(wid, { name: workerMap.get(wid) ?? 'Unknown', days: new Set(), totalMins: 0 });
    const e = attMap.get(wid)!;
    if (v.checkedInAt) {
      e.days.add(new Date(v.checkedInAt).toISOString().slice(0, 10));
      if (v.checkedOutAt) {
        const mins = Math.round(
          (new Date(v.checkedOutAt).getTime() - new Date(v.checkedInAt).getTime()) / 60000,
        );
        if (mins > 0 && mins < 1440) e.totalMins += mins;
      }
    }
  }
  const attendance = [...attMap.entries()]
    .map(([wid, a]) => ({
      workerId: wid,
      name: a.name,
      daysOnSite: a.days.size,
      totalHours: parseFloat((a.totalMins / 60).toFixed(1)),
    }))
    .sort((a, b) => b.daysOnSite - a.daysOnSite);

  // 8. Equipment (raw SQL — equipment_id not in Drizzle schema)
  let equipment: any[] = [];
  try {
    const r = await pool.query(
      `SELECT e.id::text, e.name, e.category, e.make_model, e.serial_or_reg,
          COUNT(CASE WHEN d.status = 'approved'
                      AND (d.expiry_date IS NULL OR d.expiry_date > NOW()) THEN 1 END)::int AS valid_certs,
          COUNT(CASE WHEN d.expiry_date IS NOT NULL
                      AND d.expiry_date < NOW() THEN 1 END)::int AS expired_certs,
          COUNT(CASE WHEN d.status = 'pending' THEN 1 END)::int AS pending_certs
        FROM "${schemaName}".contractor_equipment e
        LEFT JOIN "${schemaName}".contractor_documents d
               ON d.equipment_id = e.id::text AND d.is_active = TRUE
       WHERE e.company_id = $1 AND e.is_active = TRUE
       GROUP BY e.id, e.name, e.category, e.make_model, e.serial_or_reg
       ORDER BY e.name`,
      [companyId],
    );
    equipment = r.rows.map((row: any) => ({
      ...row,
      docStatus:
        row.expired_certs > 0  ? 'fail'    :
        row.pending_certs > 0  ? 'warn'    :
        row.valid_certs   > 0  ? 'pass'    : 'missing',
    }));
  } catch (err: any) {
    logger.warn('[SLA] Equipment query failed:', err.message);
  }

  // 9. RAMS documents for this company
  let rams: any[] = [];
  try {
    rams = await db
      .select({
        id: ramsDocuments.id,
        documentName: ramsDocuments.documentName,
        status: ramsDocuments.status,
        expiryDate: ramsDocuments.expiryDate,
        uploadedAt: ramsDocuments.uploadedAt,
      })
      .from(ramsDocuments)
      .where(and(eq(ramsDocuments.companyId, companyId), eq(ramsDocuments.isActive, true)));
  } catch (err: any) {
    logger.warn('[SLA] RAMS query failed:', err.message);
  }

  // Summary / RAG status
  const slaMeasured = turnaround.filter((t: any) => t.workingDays !== null).length;
  const slaPass     = turnaround.filter((t: any) => t.sla === 'pass').length;
  const docPassRate = slaMeasured > 0 ? Math.round((slaPass / slaMeasured) * 100) : null;
  const redCards    = cards.filter((c: any) => c.cardType === 'red').length;
  const yellowCards = cards.filter((c: any) => c.cardType === 'yellow').length;

  let ragStatus: 'green' | 'amber' | 'red' = 'green';
  if (
    redCards > 0 ||
    (docPassRate !== null && docPassRate < 60) ||
    (ppmRate    !== null && ppmRate    < 60)
  ) ragStatus = 'red';
  else if (
    yellowCards > 0 ||
    (docPassRate !== null && docPassRate < 80) ||
    (ppmRate    !== null && ppmRate    < 80)
  ) ragStatus = 'amber';

  return {
    company,
    workers,
    turnaround,
    cards,
    ppm: {
      orders: ppmOrders,
      onTime: ppmOnTime.length,
      overdue: ppmOverdue.length,
      completed: ppmCompleted.length,
      outstanding: ppmOutstanding.length,
      rate: ppmRate,
    },
    incidents,
    attendance,
    equipment,
    rams,
    summary: {
      docPassRate,
      ppmRate,
      redCards,
      yellowCards,
      ragStatus,
      totalWorkers: workers.length,
      slaDays,
      dateFrom: dateFrom.toISOString(),
      dateTo: dateTo.toISOString(),
    },
  };
}

// ─── PDF HTML builder ─────────────────────────────────────────────────────────

function buildSlaReportHtml(data: any, orgName: string): string {
  const { company, turnaround, cards, ppm, incidents, attendance, equipment, rams, summary } = data;
  const dateRange = `${fmtD(summary.dateFrom)} – ${fmtD(summary.dateTo)}`;
  const ragColor =
    summary.ragStatus === 'green' ? '#16a34a' :
    summary.ragStatus === 'amber' ? '#d97706' : '#dc2626';
  const ragLabel =
    summary.ragStatus === 'green' ? 'Good Standing' :
    summary.ragStatus === 'amber' ? 'Attention Required' : 'Concerns Identified';

  const kpiBlock = `
<div class="kpi-row">
  <div class="kpi-rag" style="border-color:${ragColor};background:${ragColor}18">
    <div class="kpi-big" style="color:${ragColor}">${esc(ragLabel)}</div>
    <div class="kpi-label">Overall SLA Status</div>
  </div>
  ${summary.docPassRate !== null ? `
  <div class="kpi-box">
    <div class="kpi-big" style="color:${summary.docPassRate >= 80 ? '#16a34a' : summary.docPassRate >= 60 ? '#d97706' : '#dc2626'}">${summary.docPassRate}%</div>
    <div class="kpi-label">Doc SLA Pass Rate</div>
  </div>` : ''}
  ${summary.ppmRate !== null ? `
  <div class="kpi-box">
    <div class="kpi-big" style="color:${summary.ppmRate >= 80 ? '#16a34a' : summary.ppmRate >= 60 ? '#d97706' : '#dc2626'}">${summary.ppmRate}%</div>
    <div class="kpi-label">PPM On-Time Rate</div>
  </div>` : ''}
  <div class="kpi-box">
    <div class="kpi-big" style="color:${summary.redCards > 0 ? '#dc2626' : summary.yellowCards > 0 ? '#d97706' : '#16a34a'}">${summary.redCards + summary.yellowCards}</div>
    <div class="kpi-label">Safety Cards</div>
  </div>
  <div class="kpi-box">
    <div class="kpi-big" style="color:#1d4ed8">${summary.totalWorkers}</div>
    <div class="kpi-label">Registered Workers</div>
  </div>
</div>`;

  // Compliance turnaround
  const turnaroundRows = turnaround.length
    ? turnaround.map((t: any) => `
<tr>
  <td>${fmtD(t.requestedAt)}</td>
  <td>${esc(t.documentType)}</td>
  <td>${t.receivedAt ? fmtD(t.receivedAt) : '—'}</td>
  <td>${t.workingDays !== null ? `${t.workingDays}d` : '—'}</td>
  <td>${slaBadge(t.sla)}</td>
</tr>`).join('')
    : `<tr><td colspan="5" class="empty">No document requests sent during this period.</td></tr>`;

  const turnaroundSection = `
<div class="section">
  <div class="section-title">Compliance Document Turnaround
    <span class="section-sub">(SLA target: ${summary.slaDays} working days)</span>
  </div>
  <table><thead><tr><th>Requested</th><th>Document Type</th><th>Received</th><th>Turnaround</th><th>SLA</th></tr></thead>
  <tbody>${turnaroundRows}</tbody></table>
</div>`;

  // PPM
  const ppmRows = ppm.orders.length
    ? ppm.orders.map((o: any) => {
        const overdue = o.status !== 'completed' && o.dueDate && new Date(o.dueDate) < new Date();
        const onTime  = o.completedDate && o.dueDate && new Date(o.completedDate) <= new Date(o.dueDate);
        return `<tr>
  <td>${esc(o.title)}</td>
  <td>${o.status === 'completed' ? '<span class="badge badge-ok">Completed</span>' : overdue ? '<span class="badge badge-crit">Overdue</span>' : '<span class="badge badge-warn">Pending</span>'}</td>
  <td>${fmtD(o.dueDate)}</td>
  <td>${fmtD(o.completedDate)}</td>
  <td>${o.completedDate ? (onTime ? '<span class="badge badge-ok">On Time</span>' : '<span class="badge badge-crit">Late</span>') : '—'}</td>
  <td>${o.requiresCertificate ? (o.certificateUploadedAt ? '<span class="badge badge-ok">✔</span>' : '<span class="badge badge-crit">Missing</span>') : '<span class="badge badge-grey">N/A</span>'}</td>
</tr>`;}).join('')
    : `<tr><td colspan="6" class="empty">No PPM work orders found for this contractor in the period.</td></tr>`;

  const ppmSection = `
<div class="section">
  <div class="section-title">Planned Preventative Maintenance (PPM)</div>
  <div class="mini-kpis">
    <div class="mini-kpi"><span class="mk-n">${ppm.orders.length}</span><span class="mk-l">Total</span></div>
    <div class="mini-kpi" style="background:#dcfce7;border-color:#bbf7d0"><span class="mk-n" style="color:#16a34a">${ppm.onTime}</span><span class="mk-l">On Time</span></div>
    <div class="mini-kpi" style="background:#fee2e2;border-color:#fecaca"><span class="mk-n" style="color:#dc2626">${ppm.overdue}</span><span class="mk-l">Overdue</span></div>
    ${ppm.rate !== null ? `<div class="mini-kpi" style="background:#fef3c7;border-color:#fde68a"><span class="mk-n" style="color:#d97706">${ppm.rate}%</span><span class="mk-l">On-Time Rate</span></div>` : ''}
  </div>
  <table><thead><tr><th>Task</th><th>Status</th><th>Due</th><th>Completed</th><th>Result</th><th>Certificate</th></tr></thead>
  <tbody>${ppmRows}</tbody></table>
</div>`;

  // Safety cards
  const cardRows = cards.length
    ? cards.map((c: any) => `
<tr>
  <td>${esc(c.workerName)}</td>
  <td>${c.cardType === 'red' ? '<span class="badge badge-crit">Red</span>' : '<span class="badge badge-warn">Yellow</span>'}</td>
  <td>${esc(c.offenceName)}</td>
  <td>${fmtD(c.issuedAt)}</td>
  <td>${esc(c.location ?? '—')}</td>
  <td>${c.status === 'active' ? '<span class="badge badge-crit">Active</span>' : c.status === 'appealed' ? '<span class="badge badge-warn">Appealed</span>' : '<span class="badge badge-ok">Resolved</span>'}</td>
</tr>`).join('')
    : `<tr><td colspan="6" class="empty ok">No safety cards issued during this period.</td></tr>`;

  const cardsSection = `
<div class="section">
  <div class="section-title">Safety Card History</div>
  <table><thead><tr><th>Worker</th><th>Card</th><th>Offence</th><th>Issued</th><th>Location</th><th>Status</th></tr></thead>
  <tbody>${cardRows}</tbody></table>
</div>`;

  // H&S incidents
  const incRows = incidents.length
    ? incidents.map((i: any) => `
<tr>
  <td>${fmtD(i.incidentDate)}</td>
  <td>${esc(i.title)}</td>
  <td>${esc((i.recordType ?? 'incident').replace(/_/g,' '))}</td>
  <td>${esc(i.injuredPerson ?? '—')}</td>
  <td>${i.riddorCategory && i.riddorCategory !== 'not_riddor_reportable' ? '<span class="badge badge-crit">RIDDOR</span>' : '<span class="badge badge-grey">No</span>'}</td>
</tr>`).join('')
    : `<tr><td colspan="5" class="empty ok">No contractor-related incidents recorded.</td></tr>`;

  const incidentsSection = `
<div class="section">
  <div class="section-title">Health &amp; Safety Incidents</div>
  <table><thead><tr><th>Date</th><th>Title</th><th>Type</th><th>Person Involved</th><th>RIDDOR</th></tr></thead>
  <tbody>${incRows}</tbody></table>
</div>`;

  // Attendance
  const totalDays  = attendance.reduce((s: number, a: any) => s + a.daysOnSite, 0);
  const totalHours = attendance.reduce((s: number, a: any) => s + a.totalHours, 0);
  const attRows = attendance.length
    ? attendance.map((a: any) => `
<tr>
  <td>${esc(a.name)}</td>
  <td>${a.daysOnSite}</td>
  <td>${a.totalHours > 0 ? `${a.totalHours}h` : '—'}</td>
</tr>`).join('')
    : `<tr><td colspan="3" class="empty">No attendance records found.</td></tr>`;

  const attSection = `
<div class="section">
  <div class="section-title">Worker Attendance</div>
  <div class="mini-kpis">
    <div class="mini-kpi"><span class="mk-n">${totalDays}</span><span class="mk-l">Site Days</span></div>
    <div class="mini-kpi"><span class="mk-n">${totalHours.toFixed(1)}h</span><span class="mk-l">Total Hours</span></div>
    <div class="mini-kpi"><span class="mk-n">${attendance.length}</span><span class="mk-l">Active Workers</span></div>
  </div>
  <table><thead><tr><th>Worker</th><th>Days on Site</th><th>Total Hours</th></tr></thead>
  <tbody>${attRows}</tbody></table>
</div>`;

  // Equipment
  const eqRows = equipment.length
    ? equipment.map((e: any) => `
<tr>
  <td>${esc(e.name)}</td>
  <td>${esc(e.category)}</td>
  <td>${esc(e.make_model ?? '—')}</td>
  <td>${esc(e.serial_or_reg ?? '—')}</td>
  <td>${e.docStatus === 'pass' ? '<span class="badge badge-ok">All Valid</span>' : e.docStatus === 'warn' ? '<span class="badge badge-warn">Pending</span>' : e.docStatus === 'fail' ? '<span class="badge badge-crit">Expired</span>' : '<span class="badge badge-grey">No Certs</span>'}</td>
  <td>${e.valid_certs}v / ${e.expired_certs}e / ${e.pending_certs}p</td>
</tr>`).join('')
    : `<tr><td colspan="6" class="empty">No equipment registered.</td></tr>`;

  const eqSection = `
<div class="section">
  <div class="section-title">Plant &amp; Equipment Register</div>
  <table><thead><tr><th>Equipment</th><th>Category</th><th>Make/Model</th><th>Serial/Reg</th><th>Cert Status</th><th>Certs (v/e/p)</th></tr></thead>
  <tbody>${eqRows}</tbody></table>
</div>`;

  // RAMS
  const ramsRows = rams.length
    ? rams.map((r: any) => `
<tr>
  <td>${esc(r.documentName)}</td>
  <td>${r.status === 'approved' ? '<span class="badge badge-ok">Approved</span>' : r.status === 'expired' ? '<span class="badge badge-crit">Expired</span>' : r.status === 'expiring' ? '<span class="badge badge-warn">Expiring Soon</span>' : `<span class="badge badge-grey">${esc(r.status)}</span>`}</td>
  <td>${fmtD(r.expiryDate)}</td>
  <td>${fmtD(r.uploadedAt)}</td>
</tr>`).join('')
    : `<tr><td colspan="4" class="empty">No RAMS documents on file.</td></tr>`;

  const ramsSection = `
<div class="section">
  <div class="section-title">RAMS Documents</div>
  <table><thead><tr><th>Document</th><th>Status</th><th>Expiry</th><th>Uploaded</th></tr></thead>
  <tbody>${ramsRows}</tbody></table>
</div>`;

  const now = new Date();
  const dateStr = now.toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });
  const timeStr = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:Arial,Helvetica,sans-serif;font-size:9pt;color:#1a2e4a;background:#fff}
.header{background:#1a2e4a;color:#fff;padding:12px 18px;display:flex;align-items:center;justify-content:space-between}
.header-brand{font-size:9pt;font-weight:700;color:#60aeff;min-width:120px}
.header-center h1{font-size:13pt;font-weight:700;margin-bottom:1px}
.header-center h2{font-size:8.5pt;font-weight:400;opacity:.8}
.header-meta{font-size:7pt;text-align:right;opacity:.8;line-height:1.6;min-width:120px}
.content{padding:14px 18px}
.info-banner{background:#eff6ff;border:1px solid #bfdbfe;border-radius:5px;padding:7px 12px;font-size:8pt;color:#1e40af;margin-bottom:12px}
.kpi-row{display:flex;gap:8px;margin-bottom:14px}
.kpi-rag{flex:2;border:2px solid;border-radius:6px;padding:8px 12px;display:flex;flex-direction:column;justify-content:center;text-align:center}
.kpi-box{flex:1;background:#f0f4ff;border:1px solid #dbeafe;border-radius:6px;padding:8px;text-align:center}
.kpi-big{font-size:15pt;font-weight:700;line-height:1.1}
.kpi-label{font-size:7pt;color:#64748b;margin-top:2px}
.section{margin-bottom:16px}
.section-title{font-size:10pt;font-weight:700;color:#1a2e4a;border-bottom:2px solid #2563eb;padding-bottom:3px;margin-bottom:8px}
.section-sub{font-size:7.5pt;font-weight:400;color:#64748b;margin-left:6px}
.mini-kpis{display:flex;gap:6px;margin-bottom:8px}
.mini-kpi{background:#f0f4ff;border:1px solid #dbeafe;border-radius:4px;padding:4px 10px;text-align:center;display:flex;flex-direction:column;align-items:center}
.mk-n{font-size:12pt;font-weight:700;color:#1d4ed8;line-height:1.1}
.mk-l{font-size:7pt;color:#64748b}
table{width:100%;border-collapse:collapse;font-size:8pt}
th{background:#1a2e4a;color:#fff;padding:5px 7px;text-align:left;font-weight:600;font-size:7.5pt}
tr:nth-child(even) td{background:#f8fafc}
td{padding:4px 7px;border-bottom:1px solid #e2e8f0;vertical-align:top}
td.empty{color:#94a3b8;font-style:italic;text-align:center;padding:10px}
td.ok{color:#16a34a}
.badge{display:inline-block;padding:1px 5px;border-radius:3px;font-size:7pt;font-weight:600}
.badge-ok{background:#dcfce7;color:#166534}
.badge-warn{background:#fef3c7;color:#92400e}
.badge-crit{background:#fee2e2;color:#991b1b}
.badge-grey{background:#f1f5f9;color:#475569}
.footer{position:fixed;bottom:8mm;left:18px;right:18px;font-size:6.5pt;color:#94a3b8;display:flex;justify-content:space-between;border-top:1px solid #e2e8f0;padding-top:3px}
@page{margin:14mm 12mm 18mm 12mm}
@media print{.footer{position:fixed}}
</style></head><body>
<div class="header">
  <div class="header-brand">TPR Max<br>${esc(orgName)}</div>
  <div class="header-center">
    <h1>Contractor SLA Activity Report</h1>
    <h2>${esc(company.companyName)} &nbsp;·&nbsp; ${dateRange}</h2>
  </div>
  <div class="header-meta">Generated: ${dateStr}<br>${timeStr}<br>Confidential</div>
</div>
<div class="content">
  <div class="info-banner">
    <strong>${esc(company.companyName)}</strong> &nbsp;·&nbsp; Period: ${dateRange}
    &nbsp;·&nbsp; SLA Target: ${summary.slaDays} working days
    &nbsp;·&nbsp; Registered Workers: ${summary.totalWorkers}
  </div>
  ${kpiBlock}
  ${turnaroundSection}
  ${ppmSection}
  ${cardsSection}
  ${incidentsSection}
  ${attSection}
  ${eqSection}
  ${ramsSection}
</div>
<div class="footer">
  <span>TPR Max — ${esc(orgName)}</span>
  <span>Contractor SLA Activity Report — ${esc(company.companyName)} — ${dateStr}</span>
</div>
</body></html>`;
}

// ─── Route registration ───────────────────────────────────────────────────────

export function registerContractorSlaReportRoutes(app: Express): void {
  // JSON data endpoint — on-screen view
  app.post('/api/contractors/:companyId/sla-report', requireAuth, async (req, res) => {
    try {
      const { companyId } = req.params;
      const { dateFrom, dateTo, slaDays = 5 } = req.body;
      if (!dateFrom || !dateTo)
        return res.status(400).json({ error: 'dateFrom and dateTo are required' });

      const from = new Date(dateFrom);
      const to   = new Date(dateTo);
      to.setHours(23, 59, 59, 999);
      if (isNaN(from.getTime()) || isNaN(to.getTime()))
        return res.status(400).json({ error: 'Invalid date format' });

      const customerId = (req as any).customerId as string;
      const db         = await customerDbService.getCustomerDatabase(customerId);
      const schemaName = customerDbService.generateSchemaName(customerId);
      const pool       = (db as any).$client ?? (db as any).session?.client;
      const siteId     = (req as any).activeSiteId as string | undefined;

      const data = await collectSlaData(db, pool, schemaName, companyId, from, to, Number(slaDays), siteId);
      res.json(data);
    } catch (err: any) {
      logger.error('[SLA Report] data error:', err.message);
      res.status(500).json({ error: err.message ?? 'Failed to generate report data' });
    }
  });

  // PDF download endpoint
  app.post('/api/contractors/:companyId/sla-report/pdf', requireAuth, async (req, res) => {
    try {
      const { companyId } = req.params;
      const { dateFrom, dateTo, slaDays = 5 } = req.body;
      if (!dateFrom || !dateTo)
        return res.status(400).json({ error: 'dateFrom and dateTo are required' });

      const from = new Date(dateFrom);
      const to   = new Date(dateTo);
      to.setHours(23, 59, 59, 999);

      const customerId = (req as any).customerId as string;
      const db         = await customerDbService.getCustomerDatabase(customerId);
      const schemaName = customerDbService.generateSchemaName(customerId);
      const pool       = (db as any).$client ?? (db as any).session?.client;
      const siteId     = (req as any).activeSiteId as string | undefined;

      // Org branding name
      let orgName = 'Your Organisation';
      try {
        const [s] = await db.select({ n: iso.companySettings.companyName }).from(iso.companySettings).limit(1);
        if (s?.n) orgName = s.n;
      } catch {}

      const data      = await collectSlaData(db, pool, schemaName, companyId, from, to, Number(slaDays), siteId);
      const html      = buildSlaReportHtml(data, orgName);
      const pdfBuffer = await renderPdf(html);

      const safeName = (data.company?.companyName ?? 'contractor')
        .replace(/[^a-zA-Z0-9 -]/g, '')
        .trim()
        .replace(/\s+/g, '-')
        .toLowerCase();
      const fileName = `sla-report-${safeName}-${new Date().toISOString().slice(0, 10)}.pdf`;

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
      res.send(pdfBuffer);
    } catch (err: any) {
      logger.error('[SLA Report] PDF error:', err.message);
      if (!res.headersSent)
        res.status(500).json({ error: err.message ?? 'Failed to generate PDF' });
    }
  });
}
