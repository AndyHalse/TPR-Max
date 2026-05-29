import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { format, formatDistanceToNow } from "date-fns";
import {
  ShieldCheck, AlertTriangle, XCircle, CheckCircle2, Clock, ChevronDown, ChevronUp,
  ArrowRight, RefreshCw, Building2, HardHat, FileText, Wrench, Flame, Users, ScrollText,
  Download, HelpCircle,
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
  riskBand: "green" | "amber" | "orange" | "red";
  riskLabel: string;
  calculatedAt: string;
  totalChecks: number;
  categories: {
    contractorInsurance: CategoryStat;
    rams: CategoryStat;
    inductions: CategoryStat;
    complianceCerts: CategoryStat;
    ppm: CategoryStat;
    fireRiskAssessment: CategoryStat;
    staffRightToWork: CategoryStat;
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
  complianceCerts: {
    label: "Compliance Certificates", icon: ShieldCheck, link: "/compliance-certificates",
    stat: c => c.total === 0 ? "No certificates" : c.expired ? `${c.expired} expired` : c.expiring ? `${c.expiring} expiring soon` : `All ${c.total} current`,
  },
  ppm: {
    label: "PPM / Maintenance", icon: Wrench, link: "/ppm",
    stat: c => c.total === 0 ? "No open orders" : c.overdue ? `${c.overdue} overdue` : c.dueSoon ? `${c.dueSoon} due this week` : `${c.total} on schedule`,
  },
  fireRiskAssessment: {
    label: "Fire Risk Assessment", icon: Flame, link: "/fire-risk-assessment",
    stat: c => c.total === 0 ? "None recorded" : c.overdue ? `${c.overdue} overdue` : c.reviewDue ? `${c.reviewDue} review due` : `${c.current} current`,
  },
  staffRightToWork: {
    label: "Staff Right to Work", icon: Users, link: "/hr",
    stat: c => (c.tracked ?? 0) === 0 ? "None tracked" : c.expired ? `${c.expired} expired` : c.expiring ? `${c.expiring} expiring soon` : `All ${c.tracked} compliant`,
  },
};

function ScoreArc({ score, band }: { score: number; band: keyof typeof BAND_COLOURS }) {
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

function CategoryCard({ catKey, data }: { catKey: string; data: CategoryStat }) {
  const meta = CATEGORY_META[catKey];
  if (!meta) return null;
  const Icon = meta.icon;
  const score = data.score;
  const dotColor = score >= 90 ? "bg-emerald-500" : score >= 70 ? "bg-amber-500" : score >= 50 ? "bg-orange-500" : "bg-red-500";
  const barColor = score >= 90 ? "bg-emerald-500" : score >= 70 ? "bg-amber-500" : score >= 50 ? "bg-orange-500" : "bg-red-500";

  return (
    <Card className="hover:shadow-md transition-shadow">
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
  "Compliance Certificates": "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  "PPM": "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300",
  "Fire Risk Assessment": "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  "Staff Right to Work": "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300",
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
  const margin = 14;
  const colW = pageW - margin * 2;
  const generatedAt = format(new Date(), "dd MMMM yyyy 'at' HH:mm");

  const BRAND = "#2460A9";
  const BAND_TEXT: Record<string, string> = { green: "#059669", amber: "#d97706", orange: "#ea580c", red: "#dc2626" };
  const bandColour = BAND_TEXT[data.riskBand] ?? "#374151";

  let y = 0;

  function checkPage(needed = 12) {
    if (y + needed > 275) {
      doc.addPage();
      y = margin;
    }
  }

  function sectionTitle(title: string) {
    checkPage(14);
    doc.setFillColor(245, 247, 250);
    doc.rect(margin, y, colW, 8, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(55, 65, 81);
    doc.text(title.toUpperCase(), margin + 3, y + 5.5);
    y += 11;
  }

  function row(label: string, value: string, valueColour?: string) {
    checkPage(8);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(107, 114, 128);
    doc.text(label, margin + 2, y + 4.5);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    const [r, g, b] = valueColour
      ? [parseInt(valueColour.slice(1, 3), 16), parseInt(valueColour.slice(3, 5), 16), parseInt(valueColour.slice(5, 7), 16)]
      : [31, 41, 55];
    doc.setTextColor(r, g, b);
    doc.text(value, pageW - margin - 2, y + 4.5, { align: "right" });
    doc.setDrawColor(229, 231, 235);
    doc.line(margin, y + 7, pageW - margin, y + 7);
    y += 8;
  }

  function issueBlock(issue: CriticalIssue) {
    const isCrit = issue.severity === "critical";
    const lines = doc.splitTextToSize(`${issue.title}: ${issue.detail}${issue.daysOverdue ? ` (${issue.daysOverdue} days overdue)` : ""}`, colW - 12);
    checkPage(lines.length * 5 + 6);
    doc.setFillColor(isCrit ? 254 : 255, isCrit ? 242 : 251, isCrit ? 242 : 235);
    doc.roundedRect(margin, y, colW, lines.length * 5 + 4, 1.5, 1.5, "F");
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(isCrit ? 185 : 146, isCrit ? 28 : 64, isCrit ? 28 : 14);
    doc.text(lines, margin + 4, y + 5);
    y += lines.length * 5 + 7;
  }

  /* ── Cover header ── */
  doc.setFillColor(36, 96, 169);
  doc.rect(0, 0, 210, 38, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.setTextColor(255, 255, 255);
  doc.text("Compliance Intelligence Dashboard", margin, 16);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(200, 220, 255);
  doc.text("TPR · Connected Workforce & Site Safety Platform", margin, 23);
  doc.text(`Generated: ${generatedAt}`, margin, 29);
  doc.text(`Data snapshot: ${format(new Date(data.calculatedAt), "dd MMM yyyy HH:mm")}`, margin, 34);
  y = 46;

  /* ── Overall Score ── */
  sectionTitle("Overall Compliance Score");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(36);
  doc.setTextColor(...(bandColour.match(/[\da-f]{2}/gi)!.map(h => parseInt(h, 16))) as [number, number, number]);
  doc.text(`${data.overallScore}`, margin + 2, y + 14);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.setTextColor(55, 65, 81);
  doc.text(`/ 100 — ${data.riskLabel}`, margin + 22, y + 14);
  doc.setFontSize(8.5);
  doc.setTextColor(107, 114, 128);
  doc.text(`Based on ${data.totalChecks} compliance checks across your site`, margin + 2, y + 21);
  doc.text(`Critical issues: ${data.criticalIssues.length}   Warnings: ${data.warnings.length}`, margin + 2, y + 27);
  y += 34;

  /* ── Category Breakdown ── */
  sectionTitle("Category Breakdown");
  const catKeys = ["contractorInsurance", "rams", "inductions", "complianceCerts", "ppm", "fireRiskAssessment", "staffRightToWork"] as const;
  for (const key of catKeys) {
    const meta = CATEGORY_META[key];
    const cat = (data.categories as any)[key] as CategoryStat;
    const score = cat.score;
    const colour = score >= 90 ? "#059669" : score >= 70 ? "#d97706" : score >= 50 ? "#ea580c" : "#dc2626";
    row(meta.label, `${score}% — ${meta.stat(cat)}`, colour);
  }
  y += 4;

  /* ── Critical Issues ── */
  if (data.criticalIssues.length > 0) {
    sectionTitle(`Critical Issues (${data.criticalIssues.length})`);
    for (const issue of data.criticalIssues) issueBlock(issue);
    y += 3;
  }

  /* ── Warnings ── */
  if (data.warnings.length > 0) {
    sectionTitle(`Warnings (${data.warnings.length})`);
    for (const issue of data.warnings) issueBlock(issue);
    y += 3;
  }

  /* ── Expiry Timeline ── */
  const timelineGroups = groupTimelineItems(data.expiryTimeline);
  if (timelineGroups.length > 0) {
    sectionTitle("Expiry Timeline — Next 90 Days");
    for (const group of timelineGroups) {
      checkPage(10);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.setTextColor(107, 114, 128);
      doc.text(group.label.toUpperCase(), margin + 2, y + 4);
      y += 7;
      for (const item of group.items) {
        const urgentColour = item.daysUntilExpiry <= 7 ? "#dc2626" : item.daysUntilExpiry <= 14 ? "#d97706" : "#374151";
        const daysLabel = item.daysUntilExpiry === 0 ? "Today" : `${item.daysUntilExpiry}d`;
        checkPage(7);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8.5);
        doc.setTextColor(107, 114, 128);
        doc.text(format(new Date(item.date), "dd MMM yyyy"), margin + 2, y + 4.5);
        doc.setTextColor(55, 65, 81);
        doc.text(item.item, margin + 32, y + 4.5);
        const [ur, ug, ub] = urgentColour.match(/[\da-f]{2}/gi)!.map(h => parseInt(h, 16)) as [number, number, number];
        doc.setFont("helvetica", "bold");
        doc.setTextColor(ur, ug, ub);
        doc.text(daysLabel, pageW - margin - 2, y + 4.5, { align: "right" });
        doc.setDrawColor(229, 231, 235);
        doc.line(margin, y + 6.5, pageW - margin, y + 6.5);
        y += 7.5;
      }
      y += 3;
    }
  }

  /* ── Top Contractor Risks ── */
  if (data.topContractorRisks.length > 0) {
    sectionTitle("Top Contractor Risks");
    for (const contractor of data.topContractorRisks) {
      const lines = doc.splitTextToSize(`${contractor.name} — ${contractor.issues.join(", ")}`, colW - 10);
      checkPage(lines.length * 5 + 6);
      doc.setFillColor(254, 242, 242);
      doc.roundedRect(margin, y, colW, lines.length * 5 + 4, 1.5, 1.5, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.setTextColor(185, 28, 28);
      doc.text(`${contractor.issueCount} issue${contractor.issueCount !== 1 ? "s" : ""}`, pageW - margin - 4, y + 5, { align: "right" });
      doc.setFont("helvetica", "normal");
      doc.setTextColor(55, 65, 81);
      doc.text(lines, margin + 4, y + 5);
      y += lines.length * 5 + 7;
    }
    y += 3;
  }

  /* ── Footer note ── */
  checkPage(22);
  doc.setFillColor(248, 250, 252);
  doc.rect(margin, y, colW, 20, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(55, 65, 81);
  doc.text("How the score is calculated", margin + 3, y + 5);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(107, 114, 128);
  const noteLines = doc.splitTextToSize(
    "The overall score is a weighted average of 7 compliance categories: Contractor Insurance (20%), RAMS Documents (15%), Contractor Inductions (15%), Compliance Certificates (15%), PPM / Maintenance (15%), Fire Risk Assessment (10%), and Staff Right to Work (10%). Categories with no tracked items score 100 (not applicable).",
    colW - 6
  );
  doc.text(noteLines, margin + 3, y + 10);

  /* ── Page numbers ── */
  const pageCount = (doc as any).internal.getNumberOfPages();
  for (let p = 1; p <= pageCount; p++) {
    doc.setPage(p);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(156, 163, 175);
    doc.text(`TPR Compliance Report · ${generatedAt} · Page ${p} of ${pageCount}`, pageW / 2, 292, { align: "center" });
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

  const catKeys = ["contractorInsurance", "rams", "inductions", "complianceCerts", "ppm", "fireRiskAssessment", "staffRightToWork"] as const;

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
      <Card className={`ring-2 ${bc.ring} overflow-hidden`}>
        <div className={`bg-gradient-to-r ${bc.bg} p-6 text-white`}>
          <div className="flex items-center gap-8 flex-wrap">
            <div className="relative flex items-center justify-center">
              <ScoreArc score={data.overallScore} band={band} />
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

      {/* Section 2 — Category Scores */}
      <div>
        <h2 className="text-base font-semibold text-gray-800 dark:text-gray-200 mb-3">Category Breakdown</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {catKeys.map(key => (
            <CategoryCard key={key} catKey={key} data={(data.categories as any)[key]} />
          ))}
        </div>
      </div>

      {/* Section 3 — Issues & Warnings */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Critical Issues */}
        <Card className="border-red-200 dark:border-red-800">
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
        <Card className="border-amber-200 dark:border-amber-800">
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
      <Card>
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
        <Card>
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
        <p>
          The overall score is a weighted average of 7 compliance categories: Contractor Insurance (20%), RAMS Documents (15%),
          Contractor Inductions (15%), Compliance Certificates (15%), PPM / Maintenance (15%), Fire Risk Assessment (10%),
          and Staff Right to Work (10%). Each category scores 0–100 based on compliant vs total items.
          Categories with no tracked items score 100 (not applicable).
        </p>
      </div>
    </div>
  );
}
