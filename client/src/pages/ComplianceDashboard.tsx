import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { format, formatDistanceToNow } from "date-fns";
import {
  ShieldCheck, AlertTriangle, XCircle, CheckCircle2, Clock, ChevronDown, ChevronUp,
  ArrowRight, RefreshCw, Building2, HardHat, FileText, Wrench, Flame, Users, ScrollText,
  Download, HelpCircle, ClipboardList, Shield, ClipboardCheck,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface CategoryStat {
  total?: number; tracked?: number; compliant: number;
  expiring?: number; expired?: number; overdue?: number;
  dueSoon?: number; current?: number; reviewDue?: number; score: number;
}

interface CriticalIssue {
  id: string; category: string; severity: "critical" | "warning";
  title: string; detail: string; daysOverdue?: number; linkPath?: string;
}

interface ContractorRisk {
  id: string; name: string; issueCount: number; issues: string[];
}

interface TimelineItem {
  date: string; category: string; item: string; daysUntilExpiry: number;
}

interface DashboardData {
  overallScore: number;
  contractorScore: number;
  siteScore: number;
  contractorBand: "green" | "amber" | "orange" | "red";
  siteBand: "green" | "amber" | "orange" | "red";
  riskBand: "green" | "amber" | "orange" | "red";
  riskLabel: string;
  calculatedAt: string;
  totalChecks: number;
  categories: {
    contractorInsurance: CategoryStat;
    rams: CategoryStat;
    inductions: CategoryStat;
    staffRightToWork: CategoryStat;
    complianceCerts: CategoryStat;
    permits: CategoryStat;
    riskAssessments: CategoryStat;
    audits: CategoryStat;
    ppm: CategoryStat;
    fireRiskAssessment: CategoryStat;
  };
  criticalIssues: CriticalIssue[];
  warnings: CriticalIssue[];
  topContractorRisks: ContractorRisk[];
  expiryTimeline: TimelineItem[];
}

const BAND_COLOURS = {
  green:  { ring: "ring-emerald-400", bg: "from-emerald-600 to-emerald-700", text: "text-emerald-600", arc: "#10b981", light: "bg-emerald-50 dark:bg-emerald-900/20" },
  amber:  { ring: "ring-amber-400",   bg: "from-amber-500 to-amber-600",     text: "text-amber-600",   arc: "#f59e0b", light: "bg-amber-50 dark:bg-amber-900/20" },
  orange: { ring: "ring-orange-400",  bg: "from-orange-500 to-orange-600",   text: "text-orange-600",  arc: "#f97316", light: "bg-orange-50 dark:bg-orange-900/20" },
  red:    { ring: "ring-red-400",     bg: "from-red-600 to-red-700",         text: "text-red-600",     arc: "#ef4444", light: "bg-red-50 dark:bg-red-900/20" },
};

const CATEGORY_META: Record<string, { label: string; icon: any; link: string; stat: (c: CategoryStat) => string }> = {
  contractorInsurance: {
    label: "Contractor Insurance", icon: Building2, link: "/contractors",
    stat: c => c.total === 0 ? "No policies tracked" : c.expired ? `${c.expired} expired` : c.expiring ? `${c.expiring} expiring soon` : `All ${c.total} current`,
  },
  rams: {
    label: "RAMS Documents", icon: FileText, link: "/contractors",
    stat: c => c.total === 0 ? "No documents" : c.expired ? `${c.expired} expired` : c.expiring ? `${c.expiring} expiring soon` : `All ${c.total} valid`,
  },
  inductions: {
    label: "Contractor Inductions", icon: HardHat, link: "/contractors",
    stat: c => c.total === 0 ? "No active workers" : c.overdue ? `${c.overdue} overdue` : `All ${c.total} inducted`,
  },
  staffRightToWork: {
    label: "Staff Right to Work", icon: Users, link: "/hr",
    stat: c => (c.tracked ?? 0) === 0 ? "None tracked" : c.expired ? `${c.expired} expired` : c.expiring ? `${c.expiring} expiring soon` : `All ${c.tracked} compliant`,
  },
  complianceCerts: {
    label: "Compliance Certificates", icon: ShieldCheck, link: "/compliance-certificates",
    stat: c => c.total === 0 ? "No certificates" : c.expired ? `${c.expired} expired` : c.expiring ? `${c.expiring} expiring soon` : `All ${c.total} current`,
  },
  permits: {
    label: "Permits to Work", icon: ClipboardCheck, link: "/permit-to-work",
    stat: c => c.total === 0 ? "No active permits" : c.expired ? `${c.expired} expired unclosed` : (c as any).pending ? `${(c as any).pending} awaiting auth` : `${c.total} in order`,
  },
  riskAssessments: {
    label: "Risk Assessments", icon: AlertTriangle, link: "/ra-builder",
    stat: c => c.total === 0 ? "None recorded" : c.reviewDue ? `${c.reviewDue} review due` : `${c.total} assessed`,
  },
  audits: {
    label: "Audits", icon: ClipboardList, link: "/audits",
    stat: c => c.total === 0 ? "No audits run" : c.overdue ? `${c.overdue} overdue` : `${c.compliant} of ${c.total} passed`,
  },
  ppm: {
    label: "PPM / Maintenance", icon: Wrench, link: "/ppm",
    stat: c => c.total === 0 ? "No open orders" : c.overdue ? `${c.overdue} overdue` : c.dueSoon ? `${c.dueSoon} due this week` : `${c.total} on schedule`,
  },
  fireRiskAssessment: {
    label: "Fire Risk Assessment", icon: Flame, link: "/fire-risk-assessment",
    stat: c => c.total === 0 ? "None recorded" : c.overdue ? `${c.overdue} overdue` : c.reviewDue ? `${c.reviewDue} review due` : `${c.current} current`,
  },
};

function ScoreArc({ score, band, size = 140 }: { score: number; band: keyof typeof BAND_COLOURS; size?: number }) {
  const scale = size / 140;
  const r = 54 * scale;
  const cx = size / 2; const cy = size / 2;
  const strokeW = 10 * scale;
  const circumference = 2 * Math.PI * r;
  const offset = circumference * (1 - score / 100);
  const colour = BAND_COLOURS[band].arc;

  return (
    <svg width={size} height={size} className="rotate-[-90deg]">
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth={strokeW} />
      <circle
        cx={cx} cy={cy} r={r} fill="none"
        stroke="white"
        strokeDasharray={circumference} strokeDashoffset={offset}
        strokeLinecap="round" strokeWidth={strokeW}
        style={{ transition: "stroke-dashoffset 0.6s ease" }}
      />
    </svg>
  );
}

function ScoreArcMain({ score, band }: { score: number; band: keyof typeof BAND_COLOURS }) {
  const r = 54;
  const cx = 70; const cy = 70;
  const circumference = 2 * Math.PI * r;
  const offset = circumference * (1 - score / 100);
  const colour = BAND_COLOURS[band].arc;

  return (
    <svg width="140" height="140" className="rotate-[-90deg]">
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#e5e7eb" strokeWidth="10" className="dark:stroke-gray-700" />
      <circle
        cx={cx} cy={cy} r={r} fill="none"
        stroke={colour} strokeWidth="10"
        strokeDasharray={circumference} strokeDashoffset={offset}
        strokeLinecap="round"
        style={{ transition: "stroke-dashoffset 0.6s ease" }}
      />
    </svg>
  );
}

function DomainPanel({
  title, icon, score, band, catKeys, categories, headerGradient, ringClass, badgeClass,
}: {
  title: string; icon: React.ReactNode; score: number; band: keyof typeof BAND_COLOURS;
  catKeys: string[]; categories: Record<string, CategoryStat>;
  headerGradient: string; ringClass: string; badgeClass: string;
}) {
  const bandLabel = score >= 90 ? "Good Standing" : score >= 70 ? "Attention Required" : score >= 50 ? "At Risk" : "Critical";
  return (
    <Card variant="glass" className={`ring-2 ${ringClass} overflow-hidden`}>
      <div className={`bg-gradient-to-r ${headerGradient} p-4`}>
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-white mb-0.5">
              {icon}
              <h3 className="text-base font-bold">{title}</h3>
            </div>
            <p className="text-white/80 text-sm font-semibold">{bandLabel}</p>
          </div>
          <div className="relative flex items-center justify-center shrink-0">
            <ScoreArc score={score} band={band} size={80} />
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-2xl font-black text-white leading-none">{score}</span>
              <span className="text-white/60 text-[10px]">/ 100</span>
            </div>
          </div>
        </div>
      </div>
      <CardContent className="p-4">
        <div className="grid gap-3 sm:grid-cols-2">
          {catKeys.map(key => (
            <CategoryCard key={key} catKey={key} data={categories[key]} />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function CategoryCard({ catKey, data }: { catKey: string; data: CategoryStat }) {
  const meta = CATEGORY_META[catKey];
  if (!meta) return null;
  const Icon = meta.icon;
  const score = data.score;
  const dotColor = score >= 90 ? "bg-emerald-500" : score >= 70 ? "bg-amber-500" : score >= 50 ? "bg-orange-500" : "bg-red-500";
  const barColor = score >= 90 ? "bg-emerald-500" : score >= 70 ? "bg-amber-500" : score >= 50 ? "bg-orange-500" : "bg-red-500";

  return (
    <Card variant="glass" className="hover:shadow-md transition-shadow">
      <CardContent className="p-4">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-gray-100 dark:bg-gray-800">
              <Icon className="h-4 w-4 text-gray-600 dark:text-gray-400" />
            </div>
            <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">{meta.label}</span>
          </div>
          <div className={`h-2.5 w-2.5 rounded-full mt-1 shrink-0 ${dotColor}`} />
        </div>

        <div className="mb-2">
          <div className="flex justify-between text-xs mb-1">
            <span className="text-gray-500 dark:text-gray-400">{meta.stat(data)}</span>
            <span className="font-bold text-gray-800 dark:text-gray-200">{score}%</span>
          </div>
          <div className="h-1.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
            <div className={`h-full rounded-full transition-all duration-500 ${barColor}`} style={{ width: `${score}%` }} />
          </div>
        </div>

        <Link href={meta.link}>
          <a className="inline-flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:underline mt-1">
            View <ArrowRight className="h-3 w-3" />
          </a>
        </Link>
      </CardContent>
    </Card>
  );
}

function IssueItem({ issue }: { issue: CriticalIssue }) {
  const isCrit = issue.severity === "critical";
  return (
    <div className={`flex items-start gap-3 p-3 rounded-lg ${isCrit ? "bg-red-50 dark:bg-red-900/15" : "bg-amber-50 dark:bg-amber-900/15"}`}>
      {isCrit
        ? <XCircle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
        : <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
      }
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-gray-900 dark:text-white">{issue.title}</p>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{issue.detail}</p>
        {issue.daysOverdue && (
          <p className={`text-xs font-semibold mt-0.5 ${isCrit ? "text-red-600" : "text-amber-600"}`}>
            {issue.daysOverdue} days overdue
          </p>
        )}
      </div>
      {issue.linkPath && (
        <Link href={issue.linkPath}>
          <a className="text-xs text-blue-600 dark:text-blue-400 hover:underline shrink-0 mt-0.5">View</a>
        </Link>
      )}
    </div>
  );
}

const TIMELINE_CATEGORY_COLOURS: Record<string, string> = {
  "Contractor Insurance": "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  "RAMS": "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300",
  "Contractor Inductions": "bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-300",
  "Staff Right to Work": "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300",
  "Compliance Certificates": "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  "Permits to Work": "bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-300",
  "Risk Assessments": "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
  "Audits": "bg-violet-100 text-violet-800 dark:bg-violet-900/30 dark:text-violet-300",
  "PPM": "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300",
  "Fire Risk Assessment": "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
};

function groupTimelineItems(items: TimelineItem[]) {
  const groups: { label: string; items: TimelineItem[] }[] = [
    { label: "This week", items: [] },
    { label: "Next week", items: [] },
    { label: "This month", items: [] },
    { label: "Next month", items: [] },
    { label: "In 60–90 days", items: [] },
  ];
  for (const item of items) {
    const d = item.daysUntilExpiry;
    if (d <= 7) groups[0].items.push(item);
    else if (d <= 14) groups[1].items.push(item);
    else if (d <= 30) groups[2].items.push(item);
    else if (d <= 60) groups[3].items.push(item);
    else groups[4].items.push(item);
  }
  return groups.filter(g => g.items.length > 0);
}

const MAX_VISIBLE = 8;

async function generateCompliancePDF(data: DashboardData) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageW = 210;
  const margin = 12;
  const colW = pageW - margin * 2;
  const generatedAt = format(new Date(), "dd MMMM yyyy 'at' HH:mm");

  // Brand blue
  const BR: [number,number,number] = [36, 96, 169];

  // Band solid fill & light track colours
  const BAND_FILL: Record<string,[number,number,number]> = {
    green:  [5, 150, 105],
    amber:  [180, 83, 9],
    orange: [194, 65, 12],
    red:    [185, 28, 28],
  };
  const BAND_TRACK: Record<string,[number,number,number]> = {
    green:  [110, 231, 183],
    amber:  [252, 211, 77],
    orange: [253, 186, 116],
    red:    [252, 165, 165],
  };
  const BAND_LABEL: Record<string,[number,number,number]> = {
    green:  [209, 250, 229],
    amber:  [254, 243, 199],
    orange: [255, 237, 213],
    red:    [254, 226, 226],
  };

  const bFill  = BAND_FILL[data.riskBand]  ?? BAND_FILL.green;
  const bTrack = BAND_TRACK[data.riskBand] ?? BAND_TRACK.green;
  const bLabel = BAND_LABEL[data.riskBand] ?? BAND_LABEL.green;

  let y = 0;

  // ── helpers ────────────────────────────────────────────────────────────────

  function checkPage(needed = 12) {
    if (y + needed > 278) { doc.addPage(); y = margin; }
  }

  function scoreColor(score: number): [number,number,number] {
    return score >= 90 ? [5, 150, 105] : score >= 70 ? [180, 83, 9] : score >= 50 ? [194, 65, 12] : [185, 28, 28];
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

  // Draw the score arc ring (segments approximation)
  function drawArc(cx: number, cy: number, r: number, score: number,
                   trackCol: [number,number,number], arcCol: [number,number,number]) {
    const segs = 90;
    const start = -Math.PI / 2;
    // track
    doc.setDrawColor(...trackCol);
    doc.setLineWidth(2.8);
    for (let i = 0; i < segs; i++) {
      const t1 = start + (2 * Math.PI * i) / segs;
      const t2 = start + (2 * Math.PI * (i + 1)) / segs;
      doc.line(cx + r * Math.cos(t1), cy + r * Math.sin(t1),
               cx + r * Math.cos(t2), cy + r * Math.sin(t2));
    }
    // score fill
    doc.setDrawColor(...arcCol);
    const filled = Math.round(segs * score / 100);
    for (let i = 0; i < filled; i++) {
      const t1 = start + (2 * Math.PI * i) / segs;
      const t2 = start + (2 * Math.PI * (i + 1)) / segs;
      doc.line(cx + r * Math.cos(t1), cy + r * Math.sin(t1),
               cx + r * Math.cos(t2), cy + r * Math.sin(t2));
    }
  }

  function progressBar(x: number, barY: number, w: number, h: number,
                       pct: number, col: [number,number,number]) {
    doc.setFillColor(229, 231, 235);
    doc.roundedRect(x, barY, w, h, h / 2, h / 2, "F");
    const fw = Math.max(w * pct / 100, h);
    doc.setFillColor(...col);
    doc.roundedRect(x, barY, fw, h, h / 2, h / 2, "F");
  }

  // ── COVER HEADER ──────────────────────────────────────────────────────────
  doc.setFillColor(...BR);
  doc.rect(0, 0, 210, 32, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.setTextColor(255, 255, 255);
  doc.text("Compliance Intelligence Dashboard", margin, 12);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(180, 210, 255);
  doc.text("TPR · Total Protection & Response", margin, 19);
  doc.text(`Generated: ${generatedAt}`, margin, 24.5);
  doc.text(`Data snapshot: ${format(new Date(data.calculatedAt), "dd MMM yyyy HH:mm")}`, margin, 29.5);
  y = 38;

  // ── SCORE HERO ────────────────────────────────────────────────────────────
  const heroH = 48;
  doc.setFillColor(...bFill);
  doc.roundedRect(margin, y, colW, heroH, 3, 3, "F");

  // Arc gauge
  const arcCx = margin + 28;
  const arcCy = y + heroH / 2 + 1;
  const arcR  = 17;
  drawArc(arcCx, arcCy, arcR, data.overallScore, bTrack, [255, 255, 255]);

  // Score in centre
  doc.setFont("helvetica", "bold");
  doc.setFontSize(17);
  doc.setTextColor(255, 255, 255);
  doc.text(`${data.overallScore}`, arcCx, arcCy + 3.5, { align: "center" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.5);
  doc.setTextColor(...bLabel);
  doc.text("/ 100", arcCx, arcCy + 8.5, { align: "center" });

  // Right-side text
  const tx = margin + 60;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(...bLabel);
  doc.text("Overall Compliance Score", tx, y + 11);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(255, 255, 255);
  doc.text(data.riskLabel, tx, y + 20);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(...bLabel);
  doc.text(`Based on ${data.totalChecks} compliance checks across your site`, tx, y + 27);

  // Pills row
  let pillX = tx;
  const pillY = y + 33;
  const pills: { label: string }[] = [];
  if (data.criticalIssues.length > 0)
    pills.push({ label: `  ${data.criticalIssues.length} Critical` });
  if (data.warnings.length > 0)
    pills.push({ label: `  ${data.warnings.length} Warning${data.warnings.length !== 1 ? "s" : ""}` });
  if (pills.length === 0)
    pills.push({ label: `  No issues found` });

  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  for (const pill of pills) {
    const pw = doc.getTextWidth(pill.label) + 5;
    doc.setFillColor(...bTrack);
    doc.roundedRect(pillX, pillY, pw, 6, 3, 3, "F");
    doc.setTextColor(...bFill);
    doc.text(pill.label, pillX + 2.5, pillY + 4.2);
    pillX += pw + 4;
  }

  y += heroH + 7;

  // ── CATEGORY BREAKDOWN (2-column cards) ───────────────────────────────────
  sectionHeader("Category Breakdown");

  const catKeys = ["contractorInsurance", "rams", "inductions", "complianceCerts", "ppm", "fireRiskAssessment", "staffRightToWork"] as const;
  const cardW = (colW - 4) / 2;
  const cardH = 23;
  let col = 0;
  let rowStartY = y;

  for (let i = 0; i < catKeys.length; i++) {
    const key  = catKeys[i];
    const meta = CATEGORY_META[key];
    const cat  = (data.categories as any)[key] as CategoryStat;
    const sc   = cat.score;
    const sc3  = scoreColor(sc);

    if (col === 0) { checkPage(cardH + 3); rowStartY = y; }

    const cx = margin + col * (cardW + 4);
    const cy = rowStartY;

    // Card
    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(229, 231, 235);
    doc.setLineWidth(0.3);
    doc.roundedRect(cx, cy, cardW, cardH, 2, 2, "FD");

    // Coloured top stripe
    doc.setFillColor(...sc3);
    doc.roundedRect(cx, cy, cardW, 3, 2, 2, "F");
    doc.rect(cx, cy + 1.5, cardW, 1.5, "F"); // square off bottom of stripe

    // Label
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor(31, 41, 55);
    doc.text(meta.label, cx + 4, cy + 8.5);

    // Stat description
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.5);
    doc.setTextColor(107, 114, 128);
    doc.text(meta.stat(cat), cx + 4, cy + 13.5);

    // Score % right-aligned
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.setTextColor(...sc3);
    doc.text(`${sc}%`, cx + cardW - 4, cy + 13.5, { align: "right" });

    // Progress bar
    progressBar(cx + 4, cy + 17, cardW - 8, 2.5, sc, sc3);

    col++;
    if (col === 2) { col = 0; y += cardH + 3; }
  }
  if (col !== 0) y += cardH + 3;
  y += 5;

  // ── CRITICAL ISSUES ───────────────────────────────────────────────────────
  if (data.criticalIssues.length > 0) {
    sectionHeader(`Critical Issues (${data.criticalIssues.length})`);
    for (const issue of data.criticalIssues) {
      const detailStr = issue.detail + (issue.daysOverdue ? ` — ${issue.daysOverdue} days overdue` : "");
      const detailLines = doc.splitTextToSize(detailStr, colW - 16);
      const bh = detailLines.length * 4.5 + 12;
      checkPage(bh + 3);

      // Card
      doc.setFillColor(254, 242, 242);
      doc.setDrawColor(254, 202, 202);
      doc.setLineWidth(0.3);
      doc.roundedRect(margin, y, colW, bh, 2, 2, "FD");
      // Left accent
      doc.setFillColor(220, 38, 38);
      doc.roundedRect(margin, y, 3, bh, 1.5, 1.5, "F");
      doc.rect(margin + 1.5, y, 1.5, bh, "F");

      doc.setFont("helvetica", "bold");
      doc.setFontSize(7.5);
      doc.setTextColor(185, 28, 28);
      doc.text(issue.title, margin + 6, y + 6);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(7);
      doc.setTextColor(107, 114, 128);
      doc.text(detailLines, margin + 6, y + 11);

      y += bh + 2.5;
    }
    y += 3;
  }

  // ── WARNINGS ──────────────────────────────────────────────────────────────
  if (data.warnings.length > 0) {
    sectionHeader(`Warnings (${data.warnings.length})`);
    for (const issue of data.warnings) {
      const detailStr = issue.detail + (issue.daysOverdue ? ` — ${issue.daysOverdue} days overdue` : "");
      const detailLines = doc.splitTextToSize(detailStr, colW - 16);
      const bh = detailLines.length * 4.5 + 12;
      checkPage(bh + 3);

      doc.setFillColor(255, 251, 235);
      doc.setDrawColor(253, 230, 138);
      doc.setLineWidth(0.3);
      doc.roundedRect(margin, y, colW, bh, 2, 2, "FD");
      doc.setFillColor(217, 119, 6);
      doc.roundedRect(margin, y, 3, bh, 1.5, 1.5, "F");
      doc.rect(margin + 1.5, y, 1.5, bh, "F");

      doc.setFont("helvetica", "bold");
      doc.setFontSize(7.5);
      doc.setTextColor(146, 64, 14);
      doc.text(issue.title, margin + 6, y + 6);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(7);
      doc.setTextColor(107, 114, 128);
      doc.text(detailLines, margin + 6, y + 11);

      y += bh + 2.5;
    }
    y += 3;
  }

  // ── EXPIRY TIMELINE ───────────────────────────────────────────────────────
  const CAT_PILL: Record<string,{ bg:[number,number,number]; fg:[number,number,number] }> = {
    "Contractor Insurance":   { bg: [219,234,254], fg: [29,78,216]   },
    "RAMS":                   { bg: [237,233,254], fg: [109,40,217]  },
    "Contractor Inductions":  { bg: [207,250,254], fg: [14,116,144]  },
    "Compliance Certificates":{ bg: [209,250,229], fg: [5,122,85]    },
    "PPM":                    { bg: [255,237,213], fg: [154,52,18]   },
    "Fire Risk Assessment":   { bg: [254,226,226], fg: [153,27,27]   },
    "Staff Right to Work":    { bg: [224,231,255], fg: [67,56,202]   },
  };

  const timelineGroups = groupTimelineItems(data.expiryTimeline);
  if (timelineGroups.length > 0) {
    sectionHeader("Expiry Timeline — Next 90 Days");
    for (const group of timelineGroups) {
      checkPage(14);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7);
      doc.setTextColor(107, 114, 128);
      doc.text(group.label.toUpperCase(), margin, y + 4);
      y += 7;

      for (const item of group.items) {
        checkPage(8);
        const urgentCol: [number,number,number] = item.daysUntilExpiry <= 7
          ? [220, 38, 38] : item.daysUntilExpiry <= 14 ? [180, 83, 9] : [55, 65, 81];
        const daysLabel = item.daysUntilExpiry === 0 ? "Today" : `${item.daysUntilExpiry}d`;

        // Row stripe
        doc.setFillColor(249, 250, 251);
        doc.rect(margin, y, colW, 7.5, "F");

        // Date
        doc.setFont("helvetica", "normal");
        doc.setFontSize(7);
        doc.setTextColor(107, 114, 128);
        doc.text(format(new Date(item.date), "dd MMM yyyy"), margin + 2, y + 5);

        // Category pill
        const pillMeta = CAT_PILL[item.category] ?? { bg: [243,244,246], fg: [55,65,81] };
        const catShort = item.category.length > 14 ? item.category.slice(0, 13) + "…" : item.category;
        doc.setFontSize(6);
        const pw = doc.getTextWidth(catShort) + 5;
        doc.setFillColor(...pillMeta.bg);
        doc.roundedRect(margin + 29, y + 1.8, pw, 4, 2, 2, "F");
        doc.setFont("helvetica", "bold");
        doc.setTextColor(...pillMeta.fg);
        doc.text(catShort, margin + 29 + pw / 2, y + 5, { align: "center" });

        // Item name (truncated to fit)
        const itemX = margin + 30 + pw + 2;
        const itemMaxW = pageW - margin - 14 - itemX;
        const itemLabel = doc.splitTextToSize(item.item, itemMaxW)[0] ?? item.item;
        doc.setFont("helvetica", "normal");
        doc.setFontSize(7.5);
        doc.setTextColor(31, 41, 55);
        doc.text(itemLabel, itemX, y + 5);

        // Days badge
        doc.setFont("helvetica", "bold");
        doc.setFontSize(7.5);
        doc.setTextColor(...urgentCol);
        doc.text(daysLabel, pageW - margin - 2, y + 5, { align: "right" });

        doc.setDrawColor(229, 231, 235);
        doc.setLineWidth(0.2);
        doc.line(margin, y + 7.5, pageW - margin, y + 7.5);
        y += 7.5;
      }
      y += 4;
    }
  }

  // ── TOP CONTRACTOR RISKS ──────────────────────────────────────────────────
  if (data.topContractorRisks.length > 0) {
    sectionHeader("Top Contractor Risks");
    for (const contractor of data.topContractorRisks) {
      const issuesText = contractor.issues.join("  ·  ");
      const issueLines = doc.splitTextToSize(issuesText, colW - 40);
      const bh = Math.max(issueLines.length * 4.5 + 13, 17);
      checkPage(bh + 3);

      doc.setFillColor(254, 242, 242);
      doc.setDrawColor(254, 202, 202);
      doc.setLineWidth(0.3);
      doc.roundedRect(margin, y, colW, bh, 2, 2, "FD");

      // Contractor name
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.setTextColor(31, 41, 55);
      doc.text(contractor.name, margin + 4, y + 7);

      // Issue count badge
      const badgeStr = `${contractor.issueCount} issue${contractor.issueCount !== 1 ? "s" : ""}`;
      doc.setFontSize(6.5);
      const bw = doc.getTextWidth(badgeStr) + 6;
      doc.setFillColor(254, 202, 202);
      doc.roundedRect(pageW - margin - bw - 4, y + 3, bw, 5, 2.5, 2.5, "F");
      doc.setFont("helvetica", "bold");
      doc.setTextColor(153, 27, 27);
      doc.text(badgeStr, pageW - margin - bw / 2 - 4, y + 6.8, { align: "center" });

      // Issue tags text
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7);
      doc.setTextColor(185, 28, 28);
      doc.text(issueLines, margin + 4, y + 12.5);

      y += bh + 3;
    }
    y += 2;
  }

  // ── SCORE METHODOLOGY NOTE ────────────────────────────────────────────────
  checkPage(26);
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.3);
  doc.roundedRect(margin, y, colW, 24, 2, 2, "FD");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(55, 65, 81);
  doc.text("How the score is calculated", margin + 4, y + 6.5);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(107, 114, 128);
  const noteLines = doc.splitTextToSize(
    "The overall score is a weighted average of 7 compliance categories: Contractor Insurance (20%), RAMS Documents (15%), Contractor Inductions (15%), Compliance Certificates (15%), PPM / Maintenance (15%), Fire Risk Assessment (10%), and Staff Right to Work (10%). Categories with no tracked items score 100 (not applicable).",
    colW - 8
  );
  doc.text(noteLines, margin + 4, y + 12);

  // ── PAGE NUMBERS ──────────────────────────────────────────────────────────
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
      `TPR Compliance Report  ·  ${generatedAt}  ·  Page ${p} of ${pageCount}`,
      pageW / 2, 289.5, { align: "center" }
    );
    // Brand dot
    doc.setFillColor(...BR);
    doc.circle(pageW - margin + 1, 289, 1.5, "F");
  }

  const fileName = `compliance-report-${format(new Date(), "yyyy-MM-dd-HHmm")}.pdf`;
  doc.save(fileName);
}

export default function ComplianceDashboard() {
  const [showAllCritical, setShowAllCritical] = useState(false);
  const [showAllWarnings, setShowAllWarnings] = useState(false);
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);

  const { data, isLoading, dataUpdatedAt, refetch, isFetching } = useQuery<DashboardData>({
    queryKey: ["/api/compliance-dashboard"],
    refetchInterval: 5 * 60 * 1000,
  });

  async function handleDownloadPDF() {
    if (!data) return;
    setIsGeneratingPDF(true);
    try {
      await generateCompliancePDF(data);
    } finally {
      setIsGeneratingPDF(false);
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-400">
        <RefreshCw className="h-6 w-6 animate-spin mr-2" />
        Calculating compliance score…
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-400">
        <AlertTriangle className="h-6 w-6 mr-2" />
        Failed to load compliance dashboard
      </div>
    );
  }

  const band = data.riskBand;
  const bc = BAND_COLOURS[band];
  const updatedText = dataUpdatedAt ? formatDistanceToNow(new Date(dataUpdatedAt), { addSuffix: true }) : "just now";

  const visibleCritical = showAllCritical ? data.criticalIssues : data.criticalIssues.slice(0, MAX_VISIBLE);
  const visibleWarnings = showAllWarnings ? data.warnings : data.warnings.slice(0, MAX_VISIBLE);
  const timelineGroups = groupTimelineItems(data.expiryTimeline);

  const contractorKeys = ["contractorInsurance", "rams", "inductions", "staffRightToWork"];
  const siteKeys = ["complianceCerts", "permits", "riskAssessments", "audits", "ppm", "fireRiskAssessment"];

  return (
    <div className="space-y-6 p-4 md:p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Compliance Intelligence Dashboard</h1>
            <Tooltip>
              <TooltipTrigger asChild>
                <button className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors">
                  <HelpCircle size={18} />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right" className="max-w-xs text-xs leading-relaxed">
                Aggregates compliance data across all modules — contractor insurance, RAMS, inductions, certificates, PPM, fire risk assessments, and staff right-to-work — into a single scored health rating. The score is weighted by severity: expired items count more than expiring ones. Use this page to spot issues before they become enforcement risks.
              </TooltipContent>
            </Tooltip>
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            Live compliance health across all modules · Updated {updatedText}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={`h-4 w-4 mr-1.5 ${isFetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleDownloadPDF}
            disabled={isGeneratingPDF || !data}
            className="border-blue-200 text-blue-700 hover:bg-blue-50 dark:border-blue-700 dark:text-blue-400 dark:hover:bg-blue-900/20"
          >
            <Download className={`h-4 w-4 mr-1.5 ${isGeneratingPDF ? "animate-bounce" : ""}`} />
            {isGeneratingPDF ? "Generating…" : "Download PDF"}
          </Button>
        </div>
      </div>

      {/* Section 1 — Score Hero */}
      <Card variant="glass" className={`ring-2 ${bc.ring} overflow-hidden`}>
        <div className={`bg-gradient-to-r ${bc.bg} p-6 text-white`}>
          <div className="flex items-center gap-8 flex-wrap">
            <div className="relative flex items-center justify-center">
              <ScoreArcMain score={data.overallScore} band={band} />
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-4xl font-black leading-none">{data.overallScore}</span>
                <span className="text-xs text-white/70 mt-0.5">/ 100</span>
              </div>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white/80 text-sm font-medium">Overall Compliance Score</p>
              <p className="text-3xl font-bold mt-0.5">{data.riskLabel}</p>
              <p className="text-white/70 text-sm mt-2">
                Based on {data.totalChecks} compliance checks across your site
              </p>
              <div className="flex gap-4 mt-4">
                {data.criticalIssues.length > 0 && (
                  <div className="flex items-center gap-1.5 bg-white/20 rounded-full px-3 py-1 text-sm font-semibold">
                    <XCircle className="h-4 w-4" /> {data.criticalIssues.length} Critical
                  </div>
                )}
                {data.warnings.length > 0 && (
                  <div className="flex items-center gap-1.5 bg-white/20 rounded-full px-3 py-1 text-sm font-semibold">
                    <AlertTriangle className="h-4 w-4" /> {data.warnings.length} Warnings
                  </div>
                )}
                {data.criticalIssues.length === 0 && data.warnings.length === 0 && (
                  <div className="flex items-center gap-1.5 bg-white/20 rounded-full px-3 py-1 text-sm font-semibold">
                    <CheckCircle2 className="h-4 w-4" /> No issues found
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </Card>

      {/* Section 2 — Contractor vs Site Domain Panels */}
      <div className="grid gap-4 lg:grid-cols-2">
        <DomainPanel
          title="Contractor Compliance"
          icon={<HardHat className="h-5 w-5" />}
          score={data.contractorScore ?? data.overallScore}
          band={data.contractorBand ?? data.riskBand}
          catKeys={contractorKeys}
          categories={data.categories as any}
          headerGradient="from-blue-600 to-blue-700"
          ringClass="ring-blue-300 dark:ring-blue-700"
          badgeClass="bg-blue-100 text-blue-800"
        />
        <DomainPanel
          title="Site Compliance"
          icon={<Shield className="h-5 w-5" />}
          score={data.siteScore ?? data.overallScore}
          band={data.siteBand ?? data.riskBand}
          catKeys={siteKeys}
          categories={data.categories as any}
          headerGradient="from-amber-500 to-orange-600"
          ringClass="ring-amber-300 dark:ring-amber-700"
          badgeClass="bg-amber-100 text-amber-800"
        />
      </div>

      {/* Section 3 — Issues & Warnings */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Critical Issues */}
        <Card variant="glass" className="border-red-200 dark:border-red-800">
          <CardHeader className="pb-3 border-b border-red-100 dark:border-red-800/50">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2 text-red-700 dark:text-red-400">
                <XCircle className="h-4 w-4" /> Critical Issues
              </CardTitle>
              <Badge className={`${data.criticalIssues.length > 0 ? "bg-red-600 text-white" : "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"}`}>
                {data.criticalIssues.length}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="pt-3 space-y-2 max-h-96 overflow-y-auto">
            {data.criticalIssues.length === 0 ? (
              <div className="flex items-center gap-2 py-4 text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="h-5 w-5" />
                <span className="text-sm font-medium">No critical issues — great work!</span>
              </div>
            ) : (
              <>
                {visibleCritical.map(issue => <IssueItem key={issue.id} issue={issue} />)}
                {data.criticalIssues.length > MAX_VISIBLE && (
                  <Button variant="ghost" size="sm" className="w-full text-xs" onClick={() => setShowAllCritical(v => !v)}>
                    {showAllCritical ? <><ChevronUp className="h-3 w-3 mr-1" />Show less</> : <><ChevronDown className="h-3 w-3 mr-1" />Show all {data.criticalIssues.length}</>}
                  </Button>
                )}
              </>
            )}
          </CardContent>
        </Card>

        {/* Warnings */}
        <Card variant="glass" className="border-amber-200 dark:border-amber-800">
          <CardHeader className="pb-3 border-b border-amber-100 dark:border-amber-800/50">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2 text-amber-700 dark:text-amber-400">
                <AlertTriangle className="h-4 w-4" /> Warnings
              </CardTitle>
              <Badge className={`${data.warnings.length > 0 ? "bg-amber-500 text-white" : "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"}`}>
                {data.warnings.length}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="pt-3 space-y-2 max-h-96 overflow-y-auto">
            {data.warnings.length === 0 ? (
              <div className="flex items-center gap-2 py-4 text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="h-5 w-5" />
                <span className="text-sm font-medium">No warnings</span>
              </div>
            ) : (
              <>
                {visibleWarnings.map(issue => <IssueItem key={issue.id} issue={issue} />)}
                {data.warnings.length > MAX_VISIBLE && (
                  <Button variant="ghost" size="sm" className="w-full text-xs" onClick={() => setShowAllWarnings(v => !v)}>
                    {showAllWarnings ? <><ChevronUp className="h-3 w-3 mr-1" />Show less</> : <><ChevronDown className="h-3 w-3 mr-1" />Show all {data.warnings.length}</>}
                  </Button>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Section 4 — Expiry Timeline */}
      <Card variant="glass">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Clock className="h-4 w-4 text-gray-500" />
            Expiry Timeline — Next 90 Days
          </CardTitle>
        </CardHeader>
        <CardContent>
          {timelineGroups.length === 0 ? (
            <div className="flex items-center gap-2 py-6 text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="h-5 w-5" />
              <span className="text-sm font-medium">Nothing expiring in the next 90 days</span>
            </div>
          ) : (
            <div className="space-y-5">
              {timelineGroups.map(group => (
                <div key={group.label}>
                  <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">{group.label}</p>
                  <div className="space-y-1.5">
                    {group.items.map((item, i) => {
                      const catClass = TIMELINE_CATEGORY_COLOURS[item.category] ?? "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300";
                      const urgentText = item.daysUntilExpiry <= 7 ? "text-red-600 dark:text-red-400 font-bold" :
                        item.daysUntilExpiry <= 14 ? "text-amber-600 dark:text-amber-400 font-semibold" : "text-gray-600 dark:text-gray-400";
                      return (
                        <div key={i} className="flex items-center gap-3 py-2 border-b border-gray-100 dark:border-gray-800 last:border-0">
                          <span className="text-xs font-mono text-gray-500 dark:text-gray-400 shrink-0 w-20">
                            {format(new Date(item.date), "dd MMM yyyy")}
                          </span>
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${catClass}`}>
                            {item.category}
                          </span>
                          <span className="text-sm text-gray-800 dark:text-gray-200 flex-1 truncate">{item.item}</span>
                          <span className={`text-xs shrink-0 ${urgentText}`}>
                            {item.daysUntilExpiry === 0 ? "Today" : `${item.daysUntilExpiry}d`}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Section 5 — Top Contractor Risks */}
      {data.topContractorRisks.length > 0 && (
        <Card variant="glass">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <HardHat className="h-4 w-4 text-gray-500" />
              Top Contractor Risks
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {data.topContractorRisks.map(c => (
                <div key={c.id} className="flex items-start gap-3 p-3 rounded-lg bg-gray-50 dark:bg-gray-800/50">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{c.name}</p>
                      <Badge variant="outline" className="text-xs text-red-600 border-red-300 dark:text-red-400 dark:border-red-700 shrink-0">
                        {c.issueCount} issue{c.issueCount !== 1 ? "s" : ""}
                      </Badge>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {c.issues.map((issue, i) => (
                        <span key={i} className="text-xs bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 px-2 py-0.5 rounded-full">
                          {issue}
                        </span>
                      ))}
                    </div>
                  </div>
                  <Link href="/contractors">
                    <a className="text-xs text-blue-600 dark:text-blue-400 hover:underline shrink-0 mt-0.5">View</a>
                  </Link>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Scoring methodology note */}
      <div className="rounded-lg bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 p-4 text-xs text-gray-500 dark:text-gray-400">
        <p className="font-semibold text-gray-700 dark:text-gray-300 mb-1">How the score is calculated</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <p className="font-medium text-blue-700 dark:text-blue-400 mb-0.5">🟦 Contractor Compliance (50% of overall)</p>
            <p>Contractor Insurance (35%) · RAMS Documents (25%) · Contractor Inductions (25%) · Staff Right to Work (15%)</p>
          </div>
          <div>
            <p className="font-medium text-amber-700 dark:text-amber-400 mb-0.5">🟧 Site Compliance (50% of overall)</p>
            <p>Compliance Certificates (25%) · Permits to Work (20%) · Risk Assessments (20%) · Audits (15%) · PPM (10%) · Fire Risk Assessment (10%)</p>
          </div>
        </div>
        <p className="mt-2">Each category scores 0–100 based on compliant vs total tracked items. Categories with no tracked items score 100 (not applicable).</p>
      </div>
    </div>
  );
}
