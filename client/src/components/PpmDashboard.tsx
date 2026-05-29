import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Building2, CalendarClock, AlertTriangle, CheckCircle2, TrendingUp, Download,
} from "lucide-react";
import {
  PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
} from "recharts";
import type { CompanySettings } from "@shared/schema";

// ─── Types (matching PPM.tsx shapes) ────────────────────────────────────────

interface PpmAsset {
  id: string;
  name: string;
  category?: string | null;
  status: string;
}

interface PpmWorkOrder {
  id: string;
  assetId?: string | null;
  title: string;
  status: string;
  dueDate?: string | null;
  completedDate?: string | null;
  contractorCompanyName?: string | null;
  templateType?: string | null;
  expiredDocCount?: number;
  expiringSoonDocCount?: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const NAVY = "#1e3a5f";
const TEAL = "#0d9488";
const RED = "#ef4444";
const BLUE = "#3b82f6";
const SLATE = "#94a3b8";
const LIGHT_GREY = "#e2e8f0";

const MONTH_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function withinMonth(dateStr: string | null | undefined, year: number, month: number): boolean {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  return d.getFullYear() === year && d.getMonth() === month;
}

function isOverdue(wo: PpmWorkOrder, today: Date): boolean {
  if (wo.status === "overdue") return true;
  if (wo.status === "completed" || wo.status === "cancelled") return false;
  if (!wo.dueDate) return false;
  return new Date(wo.dueDate) < today;
}

function fmt(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace("#", "");
  return [
    parseInt(clean.slice(0, 2), 16),
    parseInt(clean.slice(2, 4), 16),
    parseInt(clean.slice(4, 6), 16),
  ];
}

// ─── KPI Card ────────────────────────────────────────────────────────────────

interface KpiCardProps {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  accent?: string;
  sub?: string;
}

function KpiCard({ label, value, icon, accent = NAVY, sub }: KpiCardProps) {
  return (
    <Card className="flex-1 min-w-0">
      <CardContent className="p-4 flex items-start gap-3">
        <div
          className="rounded-lg p-2 shrink-0"
          style={{ background: `${accent}18`, color: accent }}
        >
          {icon}
        </div>
        <div className="min-w-0">
          <p className="text-2xl font-bold text-gray-900 leading-tight">{value}</p>
          <p className="text-xs text-gray-500 mt-0.5 leading-snug">{label}</p>
          {sub && <p className="text-xs mt-0.5" style={{ color: accent }}>{sub}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Donut centre label ──────────────────────────────────────────────────────

function DonutLabel({ total }: { total: number }) {
  return (
    <text
      x="50%"
      y="50%"
      textAnchor="middle"
      dominantBaseline="central"
      style={{ fontSize: 20, fontWeight: 700, fill: "#1e293b" }}
    >
      {total}
    </text>
  );
}

// ─── PDF Generator ────────────────────────────────────────────────────────────

async function generatePpmPDF(
  assets: PpmAsset[],
  workOrders: PpmWorkOrder[],
  companySettings: CompanySettings | undefined,
) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageW = 210;
  const margin = 12;
  const colW = pageW - margin * 2;
  const generatedAt = format(new Date(), "dd MMMM yyyy 'at' HH:mm");

  const companyName = companySettings?.companyName ?? "TPR";
  const accentHex = companySettings?.accentColor ?? "#2460A9";
  const BR = hexToRgb(accentHex);

  const now = new Date();
  const curYear = now.getFullYear();
  const curMonth = now.getMonth();

  // ── Compute KPIs ────────────────────────────────────────────────────────────
  const activeAssets = assets.filter(a => a.status === "active").length;
  const nonCancelled = workOrders.filter(wo => wo.status !== "cancelled");
  const completed = workOrders.filter(wo => wo.status === "completed");
  const dueThisMonth = workOrders.filter(
    wo => wo.status !== "completed" && wo.status !== "cancelled" && withinMonth(wo.dueDate, curYear, curMonth)
  ).length;
  const overdueList = workOrders.filter(wo => isOverdue(wo, now));
  const completedThisMonth = completed.filter(wo => withinMonth(wo.completedDate, curYear, curMonth)).length;
  const complianceRate = nonCancelled.length > 0 ? Math.round((completed.length / nonCancelled.length) * 100) : 0;
  const complianceColour: [number,number,number] = complianceRate >= 80 ? [22, 163, 74] : complianceRate >= 50 ? [217, 119, 6] : [239, 68, 68];

  // ── Compute donut data ───────────────────────────────────────────────────────
  const statusCounts: Record<string, number> = { Completed: 0, "In Progress": 0, Overdue: 0, Scheduled: 0, Cancelled: 0 };
  for (const wo of workOrders) {
    if (wo.status === "completed") statusCounts["Completed"]++;
    else if (wo.status === "in_progress") statusCounts["In Progress"]++;
    else if (isOverdue(wo, now)) statusCounts["Overdue"]++;
    else if (wo.status === "cancelled") statusCounts["Cancelled"]++;
    else statusCounts["Scheduled"]++;
  }
  const statusColours: Record<string, [number,number,number]> = {
    Completed:    [13, 148, 136],
    "In Progress":[59, 130, 246],
    Overdue:      [239, 68, 68],
    Scheduled:    [148, 163, 184],
    Cancelled:    [226, 232, 240],
  };

  // ── Monthly trend (last 6 months) ───────────────────────────────────────────
  const monthlyTrend = Array.from({ length: 6 }, (_, i) => {
    const offset = 5 - i;
    const d = new Date(curYear, curMonth - offset, 1);
    const y = d.getFullYear();
    const m = d.getMonth();
    const comp = workOrders.filter(wo => wo.status === "completed" && withinMonth(wo.completedDate, y, m)).length;
    const over = workOrders.filter(wo => isOverdue(wo, now) && withinMonth(wo.dueDate, y, m)).length;
    return { month: MONTH_SHORT[m], completed: comp, overdue: over };
  });

  // ── Assets by category ───────────────────────────────────────────────────────
  const catCounts: Record<string, number> = {};
  for (const a of assets.filter(a => a.status === "active")) {
    const cat = a.category || "Other";
    catCounts[cat] = (catCounts[cat] ?? 0) + 1;
  }
  const categoryData = Object.entries(catCounts).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);

  // ── Statutory stats ──────────────────────────────────────────────────────────
  function statGroup(list: PpmWorkOrder[]) {
    const total = list.filter(wo => wo.status !== "cancelled").length;
    const done = list.filter(wo => wo.status === "completed").length;
    return { total, done, pct: total > 0 ? Math.round((done / total) * 100) : 0 };
  }
  const statutory = statGroup(workOrders.filter(wo => wo.templateType === "statutory"));
  const nonStatutory = statGroup(workOrders.filter(wo => wo.templateType === "non_statutory" || wo.templateType === "non-statutory"));

  // ── Overdue rows (top 10) ───────────────────────────────────────────────────
  const assetMap = Object.fromEntries(assets.map(a => [a.id, a]));
  const overdueRows = [...overdueList]
    .sort((a, b) => (a.dueDate ? new Date(a.dueDate).getTime() : 0) - (b.dueDate ? new Date(b.dueDate).getTime() : 0))
    .slice(0, 10)
    .map(wo => ({ ...wo, assetName: wo.assetId ? (assetMap[wo.assetId]?.name ?? "—") : "—" }));

  // ── Expiring certs ──────────────────────────────────────────────────────────
  const expiringCerts = workOrders
    .filter(wo => (wo.expiringSoonDocCount ?? 0) > 0 || (wo.expiredDocCount ?? 0) > 0)
    .sort((a, b) => (b.expiredDocCount ?? 0) - (a.expiredDocCount ?? 0))
    .map(wo => ({ ...wo, assetName: wo.assetId ? (assetMap[wo.assetId]?.name ?? "—") : "—" }));

  let y = 0;

  function checkPage(needed = 12) {
    if (y + needed > 278) { doc.addPage(); y = margin; }
  }

  function sectionHeader(title: string) {
    checkPage(12);
    doc.setFillColor(...BR);
    doc.roundedRect(margin, y, colW, 7, 1.5, 1.5, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(255, 255, 255);
    doc.text(title.toUpperCase(), margin + 3.5, y + 4.8);
    y += 10;
  }

  function progressBar(x: number, barY: number, w: number, h: number, pct: number, col: [number,number,number]) {
    doc.setFillColor(229, 231, 235);
    doc.roundedRect(x, barY, w, h, h / 2, h / 2, "F");
    const fw = Math.max(w * pct / 100, h);
    doc.setFillColor(...col);
    doc.roundedRect(x, barY, fw, h, h / 2, h / 2, "F");
  }

  // ── COVER HEADER ────────────────────────────────────────────────────────────
  doc.setFillColor(...BR);
  doc.rect(0, 0, 210, 32, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.setTextColor(255, 255, 255);
  doc.text("Planned Preventative Maintenance", margin, 12);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(200, 220, 255);
  doc.text(`${companyName}  ·  PPM Dashboard Report`, margin, 19);
  doc.text(`Generated: ${generatedAt}`, margin, 25);
  y = 38;

  // ── COMPLIANCE HERO CARD ─────────────────────────────────────────────────────
  const heroH = 36;
  // Lighten brand colour for hero background
  const heroR = Math.min(255, BR[0] + 180);
  const heroG = Math.min(255, BR[1] + 180);
  const heroB = Math.min(255, BR[2] + 180);
  doc.setFillColor(heroR, heroG, heroB);
  doc.roundedRect(margin, y, colW, heroH, 3, 3, "F");
  doc.setFillColor(...BR);
  doc.roundedRect(margin, y, colW, heroH, 3, 3, "D");

  // Big score
  doc.setFont("helvetica", "bold");
  doc.setFontSize(28);
  doc.setTextColor(...complianceColour);
  doc.text(`${complianceRate}%`, margin + 10, y + 22);

  // Labels
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(...BR);
  doc.text("Overall Completion Rate", margin + 40, y + 11);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(55, 65, 81);
  doc.text(`${completed.length} of ${nonCancelled.length} work orders completed`, margin + 40, y + 18);
  doc.text(`${workOrders.length} total work orders  ·  ${activeAssets} active assets`, margin + 40, y + 25);
  doc.text(`${overdueList.length} overdue  ·  ${dueThisMonth} due this month  ·  ${completedThisMonth} completed this month`, margin + 40, y + 31);

  y += heroH + 7;

  // ── KPI CARDS (5 across in 2 cols of 2+3 layout, simplified to 2 rows) ──────
  sectionHeader("Key Performance Indicators");

  const kpis = [
    { label: "Active Assets",         value: `${activeAssets}`,       col: [13,148,136]   as [number,number,number] },
    { label: "Due This Month",         value: `${dueThisMonth}`,       col: (dueThisMonth > 0 ? [217,119,6] : [148,163,184]) as [number,number,number] },
    { label: "Overdue Work Orders",    value: `${overdueList.length}`,  col: (overdueList.length > 0 ? [239,68,68] : [148,163,184]) as [number,number,number] },
    { label: "Completed This Month",   value: `${completedThisMonth}`, col: [22,163,74]    as [number,number,number] },
    { label: "Overall Completion Rate",value: `${complianceRate}%`,    col: complianceColour },
  ];

  const kpiCardW = (colW - 8) / 3;
  const kpiCardH = 18;
  for (let i = 0; i < kpis.length; i++) {
    const kpi = kpis[i];
    const col = i % 3;
    const row = Math.floor(i / 3);
    if (i % 3 === 0) checkPage(kpiCardH + 3);
    const cx = margin + col * (kpiCardW + 4);
    const cy = y + row * (kpiCardH + 3);

    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(229, 231, 235);
    doc.setLineWidth(0.3);
    doc.roundedRect(cx, cy, kpiCardW, kpiCardH, 2, 2, "FD");

    // Coloured top stripe
    doc.setFillColor(...kpi.col);
    doc.roundedRect(cx, cy, kpiCardW, 2.5, 2, 2, "F");
    doc.rect(cx, cy + 1.2, kpiCardW, 1.3, "F");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(...kpi.col);
    doc.text(kpi.value, cx + 4, cy + 10.5);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.5);
    doc.setTextColor(107, 114, 128);
    doc.text(kpi.label, cx + 4, cy + 15.5);
  }
  y += Math.ceil(kpis.length / 3) * (kpiCardH + 3) + 4;

  // ── WORK ORDER STATUS BREAKDOWN ──────────────────────────────────────────────
  sectionHeader("Work Order Status Breakdown");
  const statusEntries = Object.entries(statusCounts).filter(([, v]) => v > 0);
  const totalWO = workOrders.length;
  if (statusEntries.length === 0) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(107, 114, 128);
    doc.text("No work orders recorded.", margin + 2, y + 5);
    y += 10;
  } else {
    const barMaxW = colW - 60;
    for (const [name, count] of statusEntries) {
      checkPage(9);
      const pct = totalWO > 0 ? Math.round((count / totalWO) * 100) : 0;
      const col = statusColours[name] ?? [107, 114, 128];

      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      doc.setTextColor(55, 65, 81);
      doc.text(name, margin + 2, y + 5.5);

      progressBar(margin + 40, y + 2.5, barMaxW, 4, pct, col);

      doc.setFont("helvetica", "bold");
      doc.setFontSize(7.5);
      doc.setTextColor(...col);
      doc.text(`${count}  (${pct}%)`, margin + 40 + barMaxW + 3, y + 5.5);

      doc.setDrawColor(243, 244, 246);
      doc.setLineWidth(0.2);
      doc.line(margin, y + 8.5, pageW - margin, y + 8.5);
      y += 8.5;
    }
    y += 4;
  }

  // ── MONTHLY COMPLETION TREND ─────────────────────────────────────────────────
  sectionHeader("Monthly Completion Trend (Last 6 Months)");
  const maxMonthVal = Math.max(...monthlyTrend.map(m => Math.max(m.completed, m.overdue)), 1);
  const barAreaH = 30;
  const barAreaW = colW - 20;
  const monthColW = barAreaW / 6;

  // Y-axis label
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6);
  doc.setTextColor(156, 163, 175);
  doc.text(`Max: ${maxMonthVal}`, margin, y + 3);

  for (let i = 0; i < monthlyTrend.length; i++) {
    const m = monthlyTrend[i];
    const bx = margin + 16 + i * monthColW;

    // Completed bar
    const compH = maxMonthVal > 0 ? (m.completed / maxMonthVal) * barAreaH : 0;
    if (compH > 0) {
      doc.setFillColor(13, 148, 136);
      doc.roundedRect(bx, y + barAreaH - compH, monthColW * 0.35, compH, 1, 1, "F");
    }

    // Overdue bar
    const overdueH = maxMonthVal > 0 ? (m.overdue / maxMonthVal) * barAreaH : 0;
    if (overdueH > 0) {
      doc.setFillColor(239, 68, 68);
      doc.roundedRect(bx + monthColW * 0.38, y + barAreaH - overdueH, monthColW * 0.35, overdueH, 1, 1, "F");
    }

    // Month label
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.5);
    doc.setTextColor(107, 114, 128);
    doc.text(m.month, bx + monthColW * 0.1, y + barAreaH + 5);

    // Values
    doc.setFontSize(6);
    if (m.completed > 0) {
      doc.setTextColor(13, 148, 136);
      doc.text(`${m.completed}`, bx, y + barAreaH - compH - 1);
    }
    if (m.overdue > 0) {
      doc.setTextColor(239, 68, 68);
      doc.text(`${m.overdue}`, bx + monthColW * 0.38, y + barAreaH - overdueH - 1);
    }
  }

  // Baseline
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.3);
  doc.line(margin + 16, y + barAreaH, margin + 16 + barAreaW, y + barAreaH);

  // Legend
  doc.setFillColor(13, 148, 136);
  doc.circle(margin + 16, y + barAreaH + 10, 1.5, "F");
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.5);
  doc.setTextColor(55, 65, 81);
  doc.text("Completed", margin + 19, y + barAreaH + 11);
  doc.setFillColor(239, 68, 68);
  doc.circle(margin + 43, y + barAreaH + 10, 1.5, "F");
  doc.text("Overdue", margin + 46, y + barAreaH + 11);

  y += barAreaH + 16;

  // ── ACTIVE ASSETS BY CATEGORY ───────────────────────────────────────────────
  sectionHeader("Active Assets by Category");
  if (categoryData.length === 0) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(107, 114, 128);
    doc.text("No active assets.", margin + 2, y + 5);
    y += 10;
  } else {
    const maxCat = Math.max(...categoryData.map(c => c.count), 1);
    const catBarMaxW = colW - 50;
    for (const cat of categoryData) {
      checkPage(9);
      const catPct = (cat.count / maxCat) * 100;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      doc.setTextColor(55, 65, 81);
      const catLabel = cat.name.length > 16 ? cat.name.slice(0, 15) + "…" : cat.name;
      doc.text(catLabel, margin + 2, y + 5.5);
      progressBar(margin + 36, y + 2.5, catBarMaxW, 4, catPct, BR);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7.5);
      doc.setTextColor(...BR);
      doc.text(`${cat.count}`, margin + 36 + catBarMaxW + 3, y + 5.5);
      doc.setDrawColor(243, 244, 246);
      doc.setLineWidth(0.2);
      doc.line(margin, y + 8.5, pageW - margin, y + 8.5);
      y += 8.5;
    }
    y += 4;
  }

  // ── STATUTORY VS NON-STATUTORY COMPLIANCE ────────────────────────────────────
  sectionHeader("Statutory vs Non-Statutory Compliance");
  for (const { label, stats, colour } of [
    { label: "Statutory",     stats: statutory,    colour: [13,148,136] as [number,number,number] },
    { label: "Non-Statutory", stats: nonStatutory, colour: BR },
  ]) {
    checkPage(14);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(55, 65, 81);
    doc.text(label, margin + 2, y + 5);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(107, 114, 128);
    doc.text(`${stats.done} / ${stats.total} — ${stats.pct}%`, pageW - margin - 2, y + 5, { align: "right" });
    progressBar(margin + 2, y + 7, colW - 4, 4, stats.pct, colour);
    if (stats.total === 0) {
      doc.setFontSize(6.5);
      doc.setTextColor(156, 163, 175);
      doc.text(`No ${label.toLowerCase()} work orders recorded`, margin + 2, y + 14.5);
      y += 6;
    }
    y += 14;
  }
  y += 3;

  // ── OVERDUE WORK ORDERS (top 10) ─────────────────────────────────────────────
  if (overdueRows.length > 0) {
    sectionHeader(`Requires Attention — Overdue Work Orders (${overdueList.length})`);

    // Table header
    doc.setFillColor(254, 242, 242);
    doc.rect(margin, y, colW, 7, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor(185, 28, 28);
    doc.text("Work Order", margin + 2, y + 4.8);
    doc.text("Asset", margin + 75, y + 4.8);
    doc.text("Due Date", margin + 120, y + 4.8);
    doc.text("Assigned To", margin + 148, y + 4.8);
    y += 7;

    for (let i = 0; i < overdueRows.length; i++) {
      const wo = overdueRows[i];
      checkPage(8);
      doc.setFillColor(i % 2 === 0 ? 255 : 249, i % 2 === 0 ? 255 : 250, i % 2 === 0 ? 255 : 251);
      doc.rect(margin, y, colW, 7.5, "F");

      doc.setFont("helvetica", "normal");
      doc.setFontSize(7);
      doc.setTextColor(31, 41, 55);
      const woTitle = doc.splitTextToSize(wo.title, 68)[0];
      doc.text(woTitle, margin + 2, y + 4.8);
      const assetShort = (wo.assetName ?? "—").length > 18 ? (wo.assetName ?? "—").slice(0, 17) + "…" : (wo.assetName ?? "—");
      doc.setTextColor(107, 114, 128);
      doc.text(assetShort, margin + 75, y + 4.8);
      doc.setTextColor(220, 38, 38);
      doc.text(fmt(wo.dueDate), margin + 120, y + 4.8);
      doc.setTextColor(107, 114, 128);
      const assignedShort = (wo.contractorCompanyName ?? "Unassigned").length > 16
        ? (wo.contractorCompanyName ?? "Unassigned").slice(0, 15) + "…"
        : (wo.contractorCompanyName ?? "Unassigned");
      doc.text(assignedShort, margin + 148, y + 4.8);

      y += 7.5;
    }
    if (overdueList.length > 10) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7);
      doc.setTextColor(107, 114, 128);
      doc.text(`… and ${overdueList.length - 10} more overdue work orders`, margin + 2, y + 4);
      y += 7;
    }
    y += 5;
  }

  // ── CERTIFICATES EXPIRING ────────────────────────────────────────────────────
  sectionHeader("Certificates Expiring Within 30 Days");
  if (expiringCerts.length === 0) {
    checkPage(12);
    doc.setFillColor(240, 253, 244);
    doc.setDrawColor(187, 247, 208);
    doc.setLineWidth(0.3);
    doc.roundedRect(margin, y, colW, 10, 2, 2, "FD");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(22, 163, 74);
    doc.text("All certificates are current — no expiry alerts", margin + 5, y + 6.5);
    y += 14;
  } else {
    for (const wo of expiringCerts) {
      checkPage(12);
      const bh = 13;
      doc.setFillColor(255, 255, 255);
      doc.setDrawColor(229, 231, 235);
      doc.setLineWidth(0.3);
      doc.roundedRect(margin, y, colW, bh, 2, 2, "FD");

      // Left accent
      const hasExpired = (wo.expiredDocCount ?? 0) > 0;
      doc.setFillColor(hasExpired ? 220 : 217, hasExpired ? 38 : 119, hasExpired ? 38 : 6);
      doc.roundedRect(margin, y, 3, bh, 1.5, 1.5, "F");
      doc.rect(margin + 1.5, y, 1.5, bh, "F");

      doc.setFont("helvetica", "bold");
      doc.setFontSize(7.5);
      doc.setTextColor(31, 41, 55);
      doc.text(doc.splitTextToSize(wo.title, colW - 45)[0], margin + 6, y + 5.5);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7);
      doc.setTextColor(107, 114, 128);
      doc.text(wo.assetName ?? "—", margin + 6, y + 10);

      // Badges right side
      let bx = pageW - margin - 2;
      if ((wo.expiringSoonDocCount ?? 0) > 0) {
        const bl = `${wo.expiringSoonDocCount} expiring soon`;
        const bw = doc.getTextWidth(bl) + 5;
        bx -= bw;
        doc.setFillColor(254, 243, 199);
        doc.roundedRect(bx, y + 2.5, bw, 5, 2.5, 2.5, "F");
        doc.setFont("helvetica", "bold");
        doc.setFontSize(6.5);
        doc.setTextColor(146, 64, 14);
        doc.text(bl, bx + 2.5, y + 6.3);
        bx -= 3;
      }
      if ((wo.expiredDocCount ?? 0) > 0) {
        const bl = `${wo.expiredDocCount} expired`;
        const bw = doc.getTextWidth(bl) + 5;
        bx -= bw;
        doc.setFillColor(254, 226, 226);
        doc.roundedRect(bx, y + 2.5, bw, 5, 2.5, 2.5, "F");
        doc.setFont("helvetica", "bold");
        doc.setFontSize(6.5);
        doc.setTextColor(153, 27, 27);
        doc.text(bl, bx + 2.5, y + 6.3);
      }

      y += bh + 2.5;
    }
    y += 3;
  }

  // ── PAGE NUMBERS ──────────────────────────────────────────────────────────────
  const pageCount = (doc as any).internal.getNumberOfPages();
  for (let p = 1; p <= pageCount; p++) {
    doc.setPage(p);
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.3);
    doc.line(margin, 284, pageW - margin, 284);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.5);
    doc.setTextColor(156, 163, 175);
    doc.text(
      `${companyName}  ·  PPM Report  ·  ${generatedAt}  ·  Page ${p} of ${pageCount}`,
      pageW / 2, 289.5, { align: "center" }
    );
    doc.setFillColor(...BR);
    doc.circle(pageW - margin + 1, 289, 1.5, "F");
  }

  const fileName = `ppm-report-${format(new Date(), "yyyy-MM-dd-HHmm")}.pdf`;
  doc.save(fileName);
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function PpmDashboard() {
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);

  const { data: assets = [], isLoading: loadingAssets } = useQuery<PpmAsset[]>({
    queryKey: ["/api/ppm/assets"],
  });
  const { data: workOrders = [], isLoading: loadingWO, dataUpdatedAt } = useQuery<PpmWorkOrder[]>({
    queryKey: ["/api/ppm/work-orders"],
  });
  const { data: companySettings } = useQuery<CompanySettings>({
    queryKey: ["/api/settings"],
  });
  useQuery({ queryKey: ["/api/ppm/schedules"] });

  const isLoading = loadingAssets || loadingWO;

  const now = useMemo(() => new Date(), []);
  const curYear = now.getFullYear();
  const curMonth = now.getMonth();

  async function handleDownloadPDF() {
    setIsGeneratingPDF(true);
    try {
      await generatePpmPDF(assets, workOrders, companySettings);
    } finally {
      setIsGeneratingPDF(false);
    }
  }

  // ── KPIs ─────────────────────────────────────────────────────────────────

  const kpi = useMemo(() => {
    const activeAssets = assets.filter(a => a.status === "active").length;

    const nonCancelled = workOrders.filter(wo => wo.status !== "cancelled");
    const completed = workOrders.filter(wo => wo.status === "completed");

    const dueThisMonth = workOrders.filter(
      wo => wo.status !== "completed" && wo.status !== "cancelled" && withinMonth(wo.dueDate, curYear, curMonth)
    ).length;

    const overdueList = workOrders.filter(wo => isOverdue(wo, now));

    const completedThisMonth = completed.filter(
      wo => withinMonth(wo.completedDate, curYear, curMonth)
    ).length;

    const complianceRate = nonCancelled.length > 0
      ? Math.round((completed.length / nonCancelled.length) * 100)
      : 0;

    return { activeAssets, dueThisMonth, overdueList, completedThisMonth, complianceRate, completed, nonCancelled };
  }, [assets, workOrders, now, curYear, curMonth]);

  // ── Donut data ────────────────────────────────────────────────────────────

  const donutData = useMemo(() => {
    const counts: Record<string, number> = {
      Completed: 0, "In Progress": 0, Overdue: 0, Scheduled: 0, Cancelled: 0,
    };
    for (const wo of workOrders) {
      if (wo.status === "completed") counts["Completed"]++;
      else if (wo.status === "in_progress") counts["In Progress"]++;
      else if (isOverdue(wo, now)) counts["Overdue"]++;
      else if (wo.status === "cancelled") counts["Cancelled"]++;
      else counts["Scheduled"]++;
    }
    const colours: Record<string, string> = {
      Completed: TEAL, "In Progress": BLUE, Overdue: RED, Scheduled: SLATE, Cancelled: LIGHT_GREY,
    };
    return Object.entries(counts)
      .filter(([, v]) => v > 0)
      .map(([name, value]) => ({ name, value, fill: colours[name] }));
  }, [workOrders, now]);

  // ── Monthly trend (last 6 months) ─────────────────────────────────────────

  const monthlyTrend = useMemo(() => {
    return Array.from({ length: 6 }, (_, i) => {
      const offset = 5 - i;
      const d = new Date(curYear, curMonth - offset, 1);
      const y = d.getFullYear();
      const m = d.getMonth();
      const completed = workOrders.filter(
        wo => wo.status === "completed" && withinMonth(wo.completedDate, y, m)
      ).length;
      const overdue = workOrders.filter(
        wo => isOverdue(wo, now) && withinMonth(wo.dueDate, y, m)
      ).length;
      return { month: MONTH_SHORT[m], completed, overdue };
    });
  }, [workOrders, now, curYear, curMonth]);

  // ── Assets by category ────────────────────────────────────────────────────

  const categoryData = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const a of assets.filter(a => a.status === "active")) {
      const cat = a.category || "Other";
      counts[cat] = (counts[cat] ?? 0) + 1;
    }
    return Object.entries(counts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
  }, [assets]);

  // ── Statutory compliance ──────────────────────────────────────────────────

  const statutoryStats = useMemo(() => {
    const statutory = workOrders.filter(wo => wo.templateType === "statutory");
    const nonStatutory = workOrders.filter(wo => wo.templateType === "non_statutory" || wo.templateType === "non-statutory");
    function stats(list: PpmWorkOrder[]) {
      const total = list.filter(wo => wo.status !== "cancelled").length;
      const done = list.filter(wo => wo.status === "completed").length;
      const pct = total > 0 ? Math.round((done / total) * 100) : 0;
      return { total, done, pct };
    }
    return { statutory: stats(statutory), nonStatutory: stats(nonStatutory) };
  }, [workOrders]);

  // ── Overdue table ─────────────────────────────────────────────────────────

  const overdueRows = useMemo(() => {
    const assetMap = Object.fromEntries(assets.map(a => [a.id, a]));
    return [...kpi.overdueList]
      .sort((a, b) => {
        const da = a.dueDate ? new Date(a.dueDate).getTime() : 0;
        const db = b.dueDate ? new Date(b.dueDate).getTime() : 0;
        return da - db;
      })
      .slice(0, 10)
      .map(wo => ({
        ...wo,
        assetName: wo.assetId ? (assetMap[wo.assetId]?.name ?? "—") : "—",
      }));
  }, [kpi.overdueList, assets]);

  // ── Expiring certs ────────────────────────────────────────────────────────

  const expiringCerts = useMemo(() => {
    const assetMap = Object.fromEntries(assets.map(a => [a.id, a]));
    return workOrders
      .filter(wo => (wo.expiringSoonDocCount ?? 0) > 0 || (wo.expiredDocCount ?? 0) > 0)
      .sort((a, b) => (b.expiredDocCount ?? 0) - (a.expiredDocCount ?? 0))
      .map(wo => ({
        ...wo,
        assetName: wo.assetId ? (assetMap[wo.assetId]?.name ?? "—") : "—",
      }));
  }, [workOrders, assets]);

  // ── Compliance colour helper ──────────────────────────────────────────────

  const complianceColour = kpi.complianceRate >= 80 ? "#16a34a" : kpi.complianceRate >= 50 ? "#d97706" : RED;

  const accentColor = companySettings?.accentColor ?? TEAL;

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="space-y-6 p-1">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Skeleton className="h-72 rounded-xl" />
          <Skeleton className="h-72 rounded-xl" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Skeleton className="h-72 rounded-xl" />
          <Skeleton className="h-72 rounded-xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-8">

      {/* ── Download button row ── */}
      <div className="flex justify-end">
        <Button
          variant="outline"
          size="sm"
          onClick={handleDownloadPDF}
          disabled={isGeneratingPDF}
          className="border-blue-200 text-blue-700 hover:bg-blue-50 dark:border-blue-700 dark:text-blue-400 dark:hover:bg-blue-900/20"
          style={{ borderColor: `${accentColor}60`, color: accentColor }}
        >
          <Download className={`h-4 w-4 mr-1.5 ${isGeneratingPDF ? "animate-bounce" : ""}`} />
          {isGeneratingPDF ? "Generating…" : "Download PDF"}
        </Button>
      </div>

      {/* ── Section 1: KPI Strip ── */}
      <div className="flex flex-col md:flex-row gap-3">
        <KpiCard
          label="Active Assets"
          value={kpi.activeAssets}
          icon={<Building2 className="h-5 w-5" />}
          accent={accentColor}
        />
        <KpiCard
          label="Due This Month"
          value={kpi.dueThisMonth}
          icon={<CalendarClock className="h-5 w-5" />}
          accent={kpi.dueThisMonth > 0 ? "#d97706" : "#94a3b8"}
        />
        <KpiCard
          label="Overdue"
          value={kpi.overdueList.length}
          icon={<AlertTriangle className="h-5 w-5" />}
          accent={kpi.overdueList.length > 0 ? RED : "#94a3b8"}
        />
        <KpiCard
          label="Completed This Month"
          value={kpi.completedThisMonth}
          icon={<CheckCircle2 className="h-5 w-5" />}
          accent="#16a34a"
        />
        <KpiCard
          label="Overall Completion Rate"
          value={`${kpi.complianceRate}%`}
          icon={<TrendingUp className="h-5 w-5" />}
          accent={complianceColour}
          sub={`${kpi.completed.length} of ${kpi.nonCancelled.length} completed`}
        />
      </div>

      {dataUpdatedAt > 0 && (
        <p className="text-xs text-gray-400 -mt-3">
          Last updated {new Date(dataUpdatedAt).toLocaleTimeString()}
        </p>
      )}

      {/* ── Section 2: Status donut + Monthly trend ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

        {/* Donut */}
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-sm font-semibold text-gray-700">Work Order Status Breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            {workOrders.length === 0 ? (
              <p className="text-sm text-gray-400 py-10 text-center">No work orders yet</p>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie
                    data={donutData}
                    cx="50%"
                    cy="50%"
                    innerRadius={68}
                    outerRadius={100}
                    dataKey="value"
                    paddingAngle={2}
                  >
                    {donutData.map((entry, i) => (
                      <Cell key={i} fill={entry.fill} />
                    ))}
                    <DonutLabel total={workOrders.length} />
                  </Pie>
                  <Tooltip formatter={(v: number, name: string) => [`${v} work orders`, name]} />
                  <Legend iconType="circle" iconSize={8} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Monthly trend */}
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-sm font-semibold text-gray-700">Monthly Completion Trend</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={monthlyTrend} barCategoryGap="30%">
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                <Tooltip />
                <Bar dataKey="completed" name="Completed" fill={TEAL} radius={[3, 3, 0, 0]} />
                <Bar dataKey="overdue" name="Overdue" fill={RED} radius={[3, 3, 0, 0]} />
                <Legend iconType="circle" iconSize={8} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* ── Section 3: Assets by Category + Statutory compliance ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

        {/* Horizontal bar — assets by category */}
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-sm font-semibold text-gray-700">Active Assets by Category</CardTitle>
          </CardHeader>
          <CardContent>
            {categoryData.length === 0 ? (
              <p className="text-sm text-gray-400 py-10 text-center">No active assets</p>
            ) : (
              <ResponsiveContainer width="100%" height={Math.max(240, categoryData.length * 36)}>
                <BarChart
                  layout="vertical"
                  data={categoryData}
                  margin={{ left: 8, right: 32, top: 4, bottom: 4 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                  <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
                  <YAxis type="category" dataKey="name" width={100} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="count" name="Assets" fill={NAVY} radius={[0, 3, 3, 0]}
                    label={{ position: "right", fontSize: 11, fill: "#64748b" }}
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Statutory vs Non-Statutory compliance */}
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-sm font-semibold text-gray-700">Statutory vs Non-Statutory Compliance</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6 pt-3">
            {[
              { label: "Statutory", stats: statutoryStats.statutory, colour: TEAL },
              { label: "Non-Statutory", stats: statutoryStats.nonStatutory, colour: NAVY },
            ].map(({ label, stats, colour }) => (
              <div key={label}>
                <div className="flex justify-between text-xs text-gray-600 mb-1">
                  <span className="font-medium">{label}</span>
                  <span>{stats.done} / {stats.total} — {stats.pct}%</span>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-4 overflow-hidden">
                  <div
                    className="h-4 rounded-full transition-all"
                    style={{ width: `${stats.pct}%`, background: colour }}
                  />
                </div>
                {stats.total === 0 && (
                  <p className="text-xs text-gray-400 mt-1">No {label.toLowerCase()} work orders recorded</p>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* ── Section 4: Overdue table ── */}
      {overdueRows.length > 0 && (
        <Card className="border-red-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2" style={{ color: RED }}>
              <AlertTriangle className="h-4 w-4" />
              Requires Attention
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-red-50 text-gray-600">
                    <th className="text-left px-4 py-2 font-medium">Work Order</th>
                    <th className="text-left px-4 py-2 font-medium">Asset</th>
                    <th className="text-left px-4 py-2 font-medium">Due Date</th>
                    <th className="text-left px-4 py-2 font-medium">Assigned To</th>
                    <th className="text-left px-4 py-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {overdueRows.map((wo, i) => {
                    const isPast = wo.dueDate ? new Date(wo.dueDate) < now : false;
                    return (
                      <tr key={wo.id} className={i % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                        <td className="px-4 py-2.5 font-medium text-gray-900 max-w-[200px] truncate">{wo.title}</td>
                        <td className="px-4 py-2.5 text-gray-600 max-w-[150px] truncate">{wo.assetName}</td>
                        <td className="px-4 py-2.5 whitespace-nowrap">
                          <span className={isPast ? "text-red-600 font-medium" : "text-gray-600"}>
                            {fmt(wo.dueDate)}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-gray-600">{wo.contractorCompanyName || "Unassigned"}</td>
                        <td className="px-4 py-2.5">
                          <Badge className="bg-red-100 text-red-700 border-red-200 text-xs font-semibold uppercase tracking-wide">
                            Overdue
                          </Badge>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {kpi.overdueList.length > 10 && (
              <p className="text-xs text-gray-500 px-4 py-3">
                and {kpi.overdueList.length - 10} more overdue items
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Section 5: Certificates expiring ── */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold text-gray-700">Certificates Expiring Within 30 Days</CardTitle>
        </CardHeader>
        <CardContent>
          {expiringCerts.length === 0 ? (
            <div className="flex items-center gap-2 text-sm text-green-600 py-2">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              All certificates are current
            </div>
          ) : (
            <ul className="divide-y divide-gray-100">
              {expiringCerts.map(wo => (
                <li key={wo.id} className="flex items-center justify-between py-2.5 gap-4">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{wo.title}</p>
                    <p className="text-xs text-gray-500 truncate">{wo.assetName}</p>
                  </div>
                  <div className="flex gap-1.5 shrink-0">
                    {(wo.expiredDocCount ?? 0) > 0 && (
                      <Badge className="bg-red-100 text-red-700 border-red-200 text-xs">
                        {wo.expiredDocCount} expired
                      </Badge>
                    )}
                    {(wo.expiringSoonDocCount ?? 0) > 0 && (
                      <Badge className="bg-amber-100 text-amber-700 border-amber-200 text-xs">
                        {wo.expiringSoonDocCount} expiring soon
                      </Badge>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
