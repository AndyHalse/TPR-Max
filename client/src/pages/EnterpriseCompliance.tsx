import { useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  AlertTriangle,
  ShieldCheck,
  Clock,
  Building2,
  CheckCircle2,
  FileText,
  RefreshCw,
  ExternalLink,
  TrendingUp,
  TrendingDown,
  Minus,
  Users,
  FileDown,
  CheckCheck,
  Zap,
} from "lucide-react";

// ── Constants ──────────────────────────────────────────────────────────────────

const CATEGORY_LABELS: Record<string, string> = {
  insurance: "Insurance",
  rams: "RAMS",
  inductions: "Inductions",
  certificates: "Certificates",
  ppm: "PPM",
  fire: "Fire Risk",
  rtw: "Right to Work",
};

const CATEGORY_LINKS: Record<string, string> = {
  insurance: "/contractors",
  rams: "/contractors",
  inductions: "/contractors",
  certificates: "/compliance-certificates",
  ppm: "/ppm",
  fire: "/fire-risk-assessment",
  rtw: "/contractors",
};

const ORDERED_CATS = ["insurance", "rams", "inductions", "certificates", "ppm", "fire", "rtw"];

const SOURCE_TABLE_LABELS: Record<string, string> = {
  contractor_documents: "Contractor document",
  rams_documents: "RAMS document",
  contractor_workers: "Worker record",
  compliance_certificates: "Compliance cert",
  ppm_work_orders: "PPM work order",
  fire_risk_assessments: "Fire Risk Assessment",
};

// ── Types ──────────────────────────────────────────────────────────────────────

interface SummaryData {
  estateScore: number;
  categoryScores: Record<string, number>;
  siteCount: number;
  openCriticals: number;
  openWarnings: number;
  totalItems: number;
  expiringItems: number;
  siteScores: { siteId: string; score: number }[];
  generatedAt: string;
}

interface SiteRow {
  siteId: string;
  siteName: string;
  score: number;
  categoryScores: Record<string, number>;
  openCriticals: number;
  openWarnings: number;
}

interface AlertRow {
  id: string;
  siteId: string;
  siteName: string;
  category: string;
  severity: string;
  title: string;
  detail: Record<string, unknown>;
  status: string;
  createdAt: string;
  resolvedAt: string | null;
}

interface ExpiryRow {
  id: string;
  siteId: string;
  siteName: string;
  category: string;
  sourceTable: string;
  sourceId: string;
  status: string;
  expiresAt: string | null;
  severity: string;
}

interface GroupedExpiry {
  key: string;
  category: string;
  sourceTable: string;
  siteId: string;
  siteName: string;
  count: number;
  earliestExpiresAt: string | null;
  worstStatus: "lapsed" | "expiring";
}

interface TrendPoint {
  date: string;
  score: number;
}

interface TrendData {
  days: number;
  estateTrend: TrendPoint[];
  siteTrend: { siteId: string; siteName: string; date: string; score: number }[];
}

// ── Alert detail helpers ────────────────────────────────────────────────────────

function deriveAlertDetail(category: string, severity: string, detail: Record<string, unknown>): string {
  const n = (detail?.count as number) ?? 1;
  const pl = n === 1;
  const map: Record<string, Record<string, string>> = {
    insurance: {
      critical: pl ? "Insurance document has expired or is missing" : `${n} insurance documents have expired or are missing`,
      warning:  pl ? "Insurance document expires within 30 days" : `${n} insurance documents expire within 30 days`,
    },
    rams: {
      critical: pl ? "RAMS document has expired" : `${n} RAMS documents have expired`,
      warning:  pl ? "RAMS document expires within 30 days" : `${n} RAMS documents expire soon`,
    },
    inductions: {
      critical: pl ? "Worker on site has no valid site induction" : `${n} workers on site are missing valid inductions`,
      warning:  pl ? "Worker induction expires within 30 days" : `${n} worker inductions expire within 30 days`,
    },
    certificates: {
      critical: pl ? "Compliance certificate has expired" : `${n} compliance certificates have expired`,
      warning:  pl ? "Compliance certificate expires within 30 days" : `${n} compliance certificates expire soon`,
    },
    ppm: {
      critical: pl ? "PPM work order is overdue — planned maintenance not completed" : `${n} PPM work orders are overdue`,
      warning:  pl ? "PPM work order is due within 30 days" : `${n} PPM work orders are due within 30 days`,
    },
    fire: {
      critical: "Fire risk assessment has expired or is missing",
      warning:  "Fire risk assessment expires within 30 days",
    },
    rtw: {
      critical: pl ? "Right to Work document has expired or is missing" : `${n} Right to Work documents have expired or are missing`,
      warning:  pl ? "Right to Work document expires within 30 days" : `${n} Right to Work documents expire soon`,
    },
  };
  return map[category]?.[severity] ?? `${n} ${CATEGORY_LABELS[category] ?? category} item${n !== 1 ? "s" : ""} need attention`;
}

function alertStatusChip(category: string, severity: string): { label: string; bg: string; text: string } {
  if (severity === "critical" && category === "ppm") return { label: "OVERDUE", bg: "#fee2e2", text: "#b91c1c" };
  if (severity === "critical")                       return { label: "EXPIRED", bg: "#fee2e2", text: "#b91c1c" };
  return { label: "EXPIRING", bg: "#fef3c7", text: "#92400e" };
}

// ── Colour helpers ─────────────────────────────────────────────────────────────

function scoreColor(score: number | null | undefined): string {
  if (score == null) return "#94a3b8";
  if (score >= 80) return "#22a06b";
  if (score >= 50) return "#e8a000";
  return "#e84040";
}

function scoreBadgeClass(score: number | null | undefined): string {
  if (score == null) return "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300";
  if (score >= 80) return "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300";
  if (score >= 50) return "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300";
  return "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300";
}

function scoreLabel(score: number | null | undefined): string {
  if (score == null) return "No data";
  if (score >= 80) return "Good";
  if (score >= 50) return "Warning";
  return "Critical";
}

// ── Date helpers ───────────────────────────────────────────────────────────────

function toGBDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

function daysUntil(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const ms = new Date(iso).getTime() - Date.now();
  return Math.ceil(ms / 86_400_000);
}

function ExpiryChip({ expiresAt, status }: { expiresAt: string | null; status: string }) {
  const days = daysUntil(expiresAt);
  if (status === "lapsed" || (days !== null && days < 0)) {
    return (
      <span className="inline-flex items-center rounded px-1.5 py-0.5 text-xs font-semibold bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300">
        EXPIRED
      </span>
    );
  }
  if (days === 0) {
    return (
      <span className="inline-flex items-center rounded px-1.5 py-0.5 text-xs font-semibold bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300">
        TODAY
      </span>
    );
  }
  if (days !== null) {
    return (
      <span className="inline-flex items-center rounded px-1.5 py-0.5 text-xs font-semibold bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
        {days}d left
      </span>
    );
  }
  return null;
}

// ── Score Ring ─────────────────────────────────────────────────────────────────

function ScoreRing({
  score,
  noData,
  size = 152,
}: {
  score: number;
  noData: boolean;
  size?: number;
}) {
  const strokeW = 12;
  const r = (size - strokeW) / 2 - 2;
  const cx = size / 2;
  const cy = size / 2;
  const circ = 2 * Math.PI * r;
  const fill = noData ? 0 : Math.min(100, Math.max(0, score));
  const offset = circ * (1 - fill / 100);
  const color = noData ? "#94a3b8" : scoreColor(score);

  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#e2e8f0" strokeWidth={strokeW} />
        <circle
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={strokeW}
          strokeDasharray={circ}
          strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: "stroke-dashoffset 0.9s ease" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center select-none">
        {noData ? (
          <span className="text-sm text-slate-400 font-medium text-center leading-tight">No data<br />yet</span>
        ) : (
          <>
            <span className="text-4xl font-bold leading-none" style={{ color }}>
              {score}
            </span>
            <span className="text-xs text-slate-500 font-medium mt-0.5">/ 100</span>
          </>
        )}
      </div>
    </div>
  );
}

// ── Category bar ───────────────────────────────────────────────────────────────

function CategoryBar({ cat, score, noData }: { cat: string; score: number | undefined; noData: boolean }) {
  const label = CATEGORY_LABELS[cat] ?? cat;
  const link = CATEGORY_LINKS[cat] ?? "/";
  const pct = noData || score == null ? null : Math.round(score);
  const color = pct == null ? "#94a3b8" : scoreColor(pct);

  return (
    <Link href={link} className="group flex items-center gap-3 py-1.5 hover:opacity-80 transition-opacity cursor-pointer">
      <span className="w-24 text-sm text-slate-600 dark:text-slate-300 shrink-0">{label}</span>
      <div className="flex-1 bg-slate-100 dark:bg-slate-800 rounded-full h-2.5 overflow-hidden">
        {pct != null && (
          <div
            className="h-full rounded-full transition-all duration-700"
            style={{ width: `${pct}%`, backgroundColor: color }}
          />
        )}
      </div>
      <span className="w-10 text-right text-sm font-semibold shrink-0" style={{ color: pct == null ? "#94a3b8" : color }}>
        {pct == null ? "—" : `${pct}%`}
      </span>
      <ExternalLink className="w-3 h-3 text-slate-300 group-hover:text-slate-500 transition-colors shrink-0" />
    </Link>
  );
}

// ── Stat card ──────────────────────────────────────────────────────────────────

function StatCard({
  icon,
  label,
  value,
  color,
  loading,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  color: string;
  loading?: boolean;
}) {
  return (
    <Card>
      <CardContent className="pt-5 pb-4">
        <div className="flex items-start gap-3">
          <div className="rounded-lg p-2.5" style={{ backgroundColor: `${color}18` }}>
            <div style={{ color }}>{icon}</div>
          </div>
          <div className="min-w-0">
            {loading ? (
              <Skeleton className="h-8 w-16 mb-1" />
            ) : (
              <div className="text-3xl font-bold leading-none text-slate-800 dark:text-slate-100 tabular-nums">
                {value}
              </div>
            )}
            <div className="text-xs text-slate-500 mt-1 leading-tight">{label}</div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Alert row ──────────────────────────────────────────────────────────────────

function AlertFeedRow({
  alert,
  onAcknowledge,
  isPending,
}: {
  alert: AlertRow;
  onAcknowledge: (id: string) => void;
  isPending: boolean;
}) {
  const isCritical = alert.severity === "critical";
  const link = CATEGORY_LINKS[alert.category] ?? "/";
  const chip = alertStatusChip(alert.category, alert.severity);
  const detailText = deriveAlertDetail(alert.category, alert.severity, alert.detail);
  const severityAccent = isCritical ? "#e84040" : "#e8a000";

  return (
    <div className={`flex items-start gap-3 py-3 border-b border-slate-100 dark:border-slate-800 last:border-0 ${alert.status === "acknowledged" ? "opacity-60" : ""}`}>
      <div className="mt-0.5 shrink-0">
        <AlertTriangle className="w-4 h-4" style={{ color: severityAccent }} />
      </div>
      <div className="flex-1 min-w-0">
        {/* Row 1: chips + location */}
        <div className="flex flex-wrap items-center gap-1.5 mb-1">
          <span
            className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-bold tracking-wide"
            style={{ backgroundColor: chip.bg, color: chip.text }}
          >
            {chip.label}
          </span>
          <span
            className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold text-white"
            style={{ backgroundColor: severityAccent }}
          >
            {CATEGORY_LABELS[alert.category] ?? alert.category}
          </span>
          <span className="text-xs text-slate-500 dark:text-slate-400 font-medium truncate">
            {alert.siteName}
          </span>
        </div>
        {/* Row 2: plain-English detail */}
        <p className="text-sm text-slate-700 dark:text-slate-200 leading-snug">{detailText}</p>
      </div>
      <div className="flex items-center gap-1 shrink-0 ml-1">
        <Tooltip>
          <TooltipTrigger asChild>
            <Link href={link}>
              <Button variant="ghost" size="icon" className="h-7 w-7">
                <ExternalLink className="w-3.5 h-3.5 text-slate-400" />
              </Button>
            </Link>
          </TooltipTrigger>
          <TooltipContent>Open {CATEGORY_LABELS[alert.category] ?? alert.category} module</TooltipContent>
        </Tooltip>
        {alert.status === "open" && (
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs px-2 border-slate-200"
            onClick={() => onAcknowledge(alert.id)}
            disabled={isPending}
          >
            <CheckCheck className="w-3 h-3 mr-1" />
            Ack
          </Button>
        )}
        {alert.status === "acknowledged" && (
          <span className="text-[11px] text-slate-400 italic whitespace-nowrap">Ack'd</span>
        )}
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function EnterpriseCompliance() {
  const { toast } = useToast();
  const [evaluating, setEvaluating] = useState(false);

  const STALE = 60_000; // 60 s — matches server cache TTL

  const { data: summary, isLoading: summaryLoading, refetch: refetchSummary } = useQuery<SummaryData>({
    queryKey: ["/api/enterprise/compliance/summary"],
    staleTime: STALE,
    refetchOnWindowFocus: true,
  });

  const { data: sites, isLoading: sitesLoading } = useQuery<SiteRow[]>({
    queryKey: ["/api/enterprise/compliance/sites"],
    staleTime: STALE,
    refetchOnWindowFocus: true,
  });

  const { data: alerts, isLoading: alertsLoading } = useQuery<AlertRow[]>({
    queryKey: ["/api/enterprise/compliance/alerts"],
    staleTime: STALE,
    refetchOnWindowFocus: true,
  });

  const { data: expiries, isLoading: expiriesLoading } = useQuery<ExpiryRow[]>({
    queryKey: ["/api/enterprise/compliance/expiries", { days: 30 }],
    queryFn: () =>
      fetch("/api/enterprise/compliance/expiries?days=30", { credentials: "include" }).then((r) => r.json()),
    staleTime: STALE,
    refetchOnWindowFocus: true,
  });

  const { data: trend, isError: trendError } = useQuery<TrendData>({
    queryKey: ["/api/enterprise/compliance/trend", { days: 30 }],
    queryFn: () =>
      fetch("/api/enterprise/compliance/trend?days=30", { credentials: "include" }).then((r) => r.json()),
    staleTime: STALE,
    refetchOnWindowFocus: true,
  });

  const { data: contractors, isError: contractorsError } = useQuery<unknown[]>({
    queryKey: ["/api/contractors"],
    staleTime: 120_000,
  });

  // ── Derived values ───────────────────────────────────────────────────────────

  const noData = !summaryLoading && (summary?.totalItems === 0 || summary?.siteCount === 0);

  const estateScore = summary?.estateScore ?? 0;

  const trendDelta = useMemo<number | null>(() => {
    const pts = trend?.estateTrend ?? [];
    if (pts.length < 2) return null;
    return pts[pts.length - 1].score - pts[0].score;
  }, [trend]);

  const sitesFullyCompliant = useMemo(
    () => (summary?.siteScores ?? []).filter((s) => s.score >= 95).length,
    [summary],
  );

  const activeContractors: string | number = contractorsError
    ? "—"
    : Array.isArray(contractors)
    ? contractors.length
    : 0;

  const openAlerts = useMemo(
    () => (alerts ?? []).filter((a) => a.status === "open" || a.status === "acknowledged"),
    [alerts],
  );

  const groupedExpiries = useMemo<GroupedExpiry[]>(() => {
    if (!expiries) return [];
    const map = new Map<string, GroupedExpiry>();
    for (const row of expiries) {
      const key = `${row.category}:${row.siteId}:${row.sourceTable}`;
      const existing = map.get(key);
      const isWorse = (s: string) => s === "lapsed";
      if (existing) {
        existing.count++;
        if (row.expiresAt && (!existing.earliestExpiresAt || row.expiresAt < existing.earliestExpiresAt)) {
          existing.earliestExpiresAt = row.expiresAt;
        }
        if (isWorse(row.status) && !isWorse(existing.worstStatus)) {
          existing.worstStatus = "lapsed";
        }
      } else {
        map.set(key, {
          key,
          category: row.category,
          sourceTable: row.sourceTable,
          siteId: row.siteId,
          siteName: row.siteName,
          count: 1,
          earliestExpiresAt: row.expiresAt,
          worstStatus: (row.status === "lapsed" ? "lapsed" : "expiring") as "lapsed" | "expiring",
        });
      }
    }
    // Sort: lapsed first, then by earliest expiry date
    return Array.from(map.values()).sort((a, b) => {
      if (a.worstStatus !== b.worstStatus) return a.worstStatus === "lapsed" ? -1 : 1;
      if (!a.earliestExpiresAt) return 1;
      if (!b.earliestExpiresAt) return -1;
      return a.earliestExpiresAt < b.earliestExpiresAt ? -1 : 1;
    });
  }, [expiries]);

  // ── Acknowledge mutation ─────────────────────────────────────────────────────

  const ackMutation = useMutation({
    mutationFn: async (alertId: string) => {
      const res = await apiRequest("POST", `/api/enterprise/compliance/alerts/${alertId}/acknowledge`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/enterprise/compliance/alerts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/enterprise/compliance/summary"] });
    },
    onError: (e: Error) => {
      toast({ title: "Failed to acknowledge", description: e.message, variant: "destructive" });
    },
  });

  // ── Manual evaluation ────────────────────────────────────────────────────────

  async function runEvaluation() {
    setEvaluating(true);
    try {
      const res = await apiRequest("POST", "/api/enterprise/compliance/evaluate");
      if (!res.ok) throw new Error("Evaluation failed");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["/api/enterprise/compliance/summary"] }),
        queryClient.invalidateQueries({ queryKey: ["/api/enterprise/compliance/sites"] }),
        queryClient.invalidateQueries({ queryKey: ["/api/enterprise/compliance/alerts"] }),
      ]);
      toast({ title: "Evaluation complete", description: "Compliance scores have been recalculated." });
    } catch {
      toast({ title: "Evaluation failed", description: "Could not run compliance evaluation.", variant: "destructive" });
    } finally {
      setEvaluating(false);
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <TooltipProvider>
      <div className="p-6 max-w-7xl mx-auto space-y-6">

        {/* ── Header ── */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">
              Estate Compliance Overview
            </h1>
            {summary?.generatedAt && (
              <p className="text-xs text-slate-400 mt-0.5">
                Updated {toGBDate(summary.generatedAt)} at{" "}
                {new Date(summary.generatedAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    refetchSummary();
                    queryClient.invalidateQueries({ queryKey: ["/api/enterprise/compliance"] });
                  }}
                >
                  <RefreshCw className="w-4 h-4 mr-1.5" />
                  Refresh
                </Button>
              </TooltipTrigger>
              <TooltipContent>Reload from server (60 s cache)</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={runEvaluation}
                  disabled={evaluating}
                >
                  <Zap className="w-4 h-4 mr-1.5" />
                  {evaluating ? "Evaluating…" : "Re-evaluate"}
                </Button>
              </TooltipTrigger>
              <TooltipContent>Recalculate all compliance scores now</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline" size="sm" disabled>
                  <FileDown className="w-4 h-4 mr-1.5" />
                  PDF Report
                </Button>
              </TooltipTrigger>
              <TooltipContent>PDF reports available in Phase 5</TooltipContent>
            </Tooltip>
          </div>
        </div>

        {/* ── Row 1: Score ring + Category bars ── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

          {/* Score ring */}
          <Card className="lg:col-span-1">
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-semibold text-slate-700 dark:text-slate-200">
                Overall Compliance Score
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col items-center gap-4 pt-0 pb-6">
              {summaryLoading ? (
                <Skeleton className="w-36 h-36 rounded-full" />
              ) : (
                <ScoreRing score={estateScore} noData={noData} size={152} />
              )}

              {/* Status badge */}
              {!summaryLoading && (
                <span className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-semibold ${scoreBadgeClass(noData ? null : estateScore)}`}>
                  {noData ? "No data yet" : scoreLabel(estateScore)}
                </span>
              )}

              {/* Trend delta */}
              {trendError ? (
                <p className="text-xs text-amber-500 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" />
                  Trend data unavailable
                </p>
              ) : trendDelta !== null && !noData ? (
                <div className="flex items-center gap-1 text-sm">
                  {trendDelta > 0 ? (
                    <TrendingUp className="w-4 h-4 text-green-500" />
                  ) : trendDelta < 0 ? (
                    <TrendingDown className="w-4 h-4 text-red-500" />
                  ) : (
                    <Minus className="w-4 h-4 text-slate-400" />
                  )}
                  <span
                    className={`font-semibold ${trendDelta > 0 ? "text-green-600" : trendDelta < 0 ? "text-red-500" : "text-slate-400"}`}
                  >
                    {trendDelta > 0 ? "+" : ""}
                    {trendDelta} pts
                  </span>
                  <span className="text-slate-400">vs 30 days ago</span>
                </div>
              ) : null}

              {noData && (
                <p className="text-xs text-slate-400 text-center max-w-[180px]">
                  Run an evaluation to generate your first compliance scores.
                </p>
              )}
            </CardContent>
          </Card>

          {/* Category bars */}
          <Card className="lg:col-span-2">
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-semibold text-slate-700 dark:text-slate-200">
                Compliance by Category
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              {summaryLoading ? (
                <div className="space-y-3">
                  {ORDERED_CATS.map((c) => <Skeleton key={c} className="h-6 w-full" />)}
                </div>
              ) : (
                <div className="divide-y divide-slate-50 dark:divide-slate-800/50">
                  {ORDERED_CATS.map((cat) => (
                    <CategoryBar
                      key={cat}
                      cat={cat}
                      score={summary?.categoryScores?.[cat]}
                      noData={noData}
                    />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* ── Row 2: Stat cards ── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            icon={<AlertTriangle className="w-5 h-5" />}
            label="Critical issues open"
            value={summaryLoading ? "—" : (summary?.openCriticals ?? 0)}
            color="#e84040"
            loading={summaryLoading}
          />
          <StatCard
            icon={<Clock className="w-5 h-5" />}
            label="Expiring in 30 days"
            value={summaryLoading ? "—" : (summary?.expiringItems ?? 0)}
            color="#e8a000"
            loading={summaryLoading}
          />
          <StatCard
            icon={<CheckCircle2 className="w-5 h-5" />}
            label={`Sites scoring ≥ 95 (of ${summary?.siteCount ?? 0})`}
            value={summaryLoading ? "—" : sitesFullyCompliant}
            color="#22a06b"
            loading={summaryLoading}
          />
          <StatCard
            icon={<Users className="w-5 h-5" />}
            label="Contractor companies"
            value={activeContractors}
            color="#2460A9"
          />
        </div>

        {/* ── Row 3: Alerts feed + Expiries ── */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">

          {/* Critical alerts feed */}
          <Card className="lg:col-span-3">
            <CardHeader className="pb-2 flex flex-row items-center justify-between">
              <CardTitle className="text-base font-semibold text-slate-700 dark:text-slate-200">
                Critical Issues & Warnings
              </CardTitle>
              {!alertsLoading && openAlerts.length > 0 && (
                <Badge variant="outline" className="text-xs">
                  {openAlerts.filter((a) => a.status === "open").length} open
                </Badge>
              )}
            </CardHeader>
            <CardContent className="pt-0">
              {alertsLoading ? (
                <div className="space-y-3">
                  {[1, 2, 3].map((i) => <Skeleton key={i} className="h-14 w-full" />)}
                </div>
              ) : openAlerts.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-10 text-slate-400">
                  <ShieldCheck className="w-10 h-10 text-green-400" />
                  <p className="text-sm font-medium text-green-600 dark:text-green-400">No open issues</p>
                  <p className="text-xs text-center">All sites are within acceptable compliance thresholds.</p>
                </div>
              ) : (
                <div className="max-h-96 overflow-y-auto -mx-2 px-2">
                  {openAlerts.map((alert) => (
                    <AlertFeedRow
                      key={alert.id}
                      alert={alert}
                      onAcknowledge={(id) => ackMutation.mutate(id)}
                      isPending={ackMutation.isPending}
                    />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Upcoming expiries — grouped */}
          <Card className="lg:col-span-2">
            <CardHeader className="pb-2 flex flex-row items-center justify-between">
              <CardTitle className="text-base font-semibold text-slate-700 dark:text-slate-200">
                Upcoming Expiries
                <span className="ml-1.5 text-xs font-normal text-slate-400">(next 30 days)</span>
              </CardTitle>
              {!expiriesLoading && groupedExpiries.length > 0 && (
                <Badge variant="outline" className="text-xs shrink-0">
                  {groupedExpiries.length} type{groupedExpiries.length !== 1 ? "s" : ""}
                </Badge>
              )}
            </CardHeader>
            <CardContent className="pt-0">
              {expiriesLoading ? (
                <div className="space-y-2">
                  {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
                </div>
              ) : groupedExpiries.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-10 text-slate-400">
                  <CheckCircle2 className="w-8 h-8 text-green-400" />
                  <p className="text-sm text-green-600 dark:text-green-400">Nothing expiring</p>
                </div>
              ) : (
                <div className="max-h-96 overflow-y-auto -mx-2 px-2">
                  {groupedExpiries.slice(0, 20).map((grp) => {
                    const days = daysUntil(grp.earliestExpiresAt);
                    const isExpired = grp.worstStatus === "lapsed" || (days !== null && days < 0);
                    const typeLabel = SOURCE_TABLE_LABELS[grp.sourceTable] ?? grp.sourceTable;
                    const catLabel = CATEGORY_LABELS[grp.category] ?? grp.category;
                    const drillLink = CATEGORY_LINKS[grp.category] ?? "/";

                    return (
                      <Link
                        key={grp.key}
                        href={drillLink}
                        className="flex items-start justify-between gap-2 py-2.5 border-b border-slate-100 dark:border-slate-800 last:border-0 hover:bg-slate-50 dark:hover:bg-slate-800/50 -mx-2 px-2 rounded transition-colors group"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                              {catLabel}
                            </p>
                            {grp.count > 1 && (
                              <span className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                                ×{grp.count}
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-slate-400 truncate mt-0.5">
                            {typeLabel} · {grp.siteName}
                          </p>
                        </div>
                        <div className="flex flex-col items-end gap-1 shrink-0">
                          <span className="text-[11px] text-slate-500">{toGBDate(grp.earliestExpiresAt)}</span>
                          {isExpired ? (
                            <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-bold bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300">
                              EXPIRED
                            </span>
                          ) : days !== null ? (
                            <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-bold ${
                              days <= 7
                                ? "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300"
                                : "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300"
                            }`}>
                              {days === 0 ? "TODAY" : `${days}d`}
                            </span>
                          ) : null}
                        </div>
                      </Link>
                    );
                  })}
                  {groupedExpiries.length > 20 && (
                    <p className="text-xs text-slate-400 text-center py-2">
                      +{groupedExpiries.length - 20} more group{groupedExpiries.length - 20 !== 1 ? "s" : ""}
                    </p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* ── Row 4: Site-by-site table ── */}
        <Card>
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-base font-semibold text-slate-700 dark:text-slate-200">
              Site-by-Site Compliance Breakdown
            </CardTitle>
            <span className="text-xs text-slate-400">Worst performing first</span>
          </CardHeader>
          <CardContent className="pt-0">
            {sitesLoading ? (
              <div className="space-y-2">
                {[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
              </div>
            ) : !sites || sites.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-10 text-slate-400">
                <Building2 className="w-8 h-8" />
                <p className="text-sm">No site data yet. Run an evaluation first.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-700">
                      <th className="text-left font-medium text-slate-500 py-2 pr-4 text-xs">Site</th>
                      <th className="text-center font-medium text-slate-500 py-2 px-2 text-xs w-20">Score</th>
                      {ORDERED_CATS.map((cat) => (
                        <th key={cat} className="text-center font-medium text-slate-500 py-2 px-1 text-xs">
                          <Tooltip>
                            <TooltipTrigger className="cursor-default">
                              {cat === "insurance" ? "Ins" : cat === "inductions" ? "Ind" : cat === "certificates" ? "Cert" : cat === "rtw" ? "RTW" : CATEGORY_LABELS[cat]}
                            </TooltipTrigger>
                            <TooltipContent>{CATEGORY_LABELS[cat]}</TooltipContent>
                          </Tooltip>
                        </th>
                      ))}
                      <th className="text-center font-medium text-slate-500 py-2 px-2 text-xs">Issues</th>
                      <th className="py-2 px-2 w-8" />
                    </tr>
                  </thead>
                  <tbody>
                    {sites.map((site) => {
                      const sScore = noData ? null : site.score;
                      return (
                        <tr
                          key={site.siteId}
                          className="border-b border-slate-100 dark:border-slate-800 last:border-0 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
                        >
                          <td className="py-2.5 pr-4">
                            <span className="font-medium text-slate-700 dark:text-slate-200 truncate max-w-[180px] block">
                              {site.siteName}
                            </span>
                          </td>
                          <td className="py-2.5 px-2 text-center">
                            <span
                              className={`inline-flex items-center justify-center rounded-full px-2.5 py-0.5 text-xs font-bold ${scoreBadgeClass(sScore)}`}
                            >
                              {sScore == null ? "—" : sScore}
                            </span>
                          </td>
                          {ORDERED_CATS.map((cat) => {
                            const cs = noData ? null : site.categoryScores?.[cat];
                            return (
                              <td key={cat} className="py-2.5 px-1 text-center">
                                <Tooltip>
                                  <TooltipTrigger>
                                    <span
                                      className="inline-block w-2.5 h-2.5 rounded-full"
                                      style={{ backgroundColor: cs == null ? "#cbd5e1" : scoreColor(cs) }}
                                    />
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    {CATEGORY_LABELS[cat]}: {cs == null ? "No data" : `${Math.round(cs)}%`}
                                  </TooltipContent>
                                </Tooltip>
                              </td>
                            );
                          })}
                          <td className="py-2.5 px-2 text-center">
                            <div className="flex items-center justify-center gap-1">
                              {site.openCriticals > 0 && (
                                <span className="inline-flex items-center rounded px-1 py-0.5 text-xs font-semibold bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300">
                                  {site.openCriticals}
                                </span>
                              )}
                              {site.openWarnings > 0 && (
                                <span className="inline-flex items-center rounded px-1 py-0.5 text-xs font-semibold bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                                  {site.openWarnings}
                                </span>
                              )}
                              {site.openCriticals === 0 && site.openWarnings === 0 && (
                                <CheckCircle2 className="w-3.5 h-3.5 text-green-400" />
                              )}
                            </div>
                          </td>
                          <td className="py-2.5 px-2">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Link href={`/enterprise/sites`}>
                                  <Button variant="ghost" size="icon" className="h-7 w-7">
                                    <ExternalLink className="w-3.5 h-3.5 text-slate-400" />
                                  </Button>
                                </Link>
                              </TooltipTrigger>
                              <TooltipContent>View {site.siteName}</TooltipContent>
                            </Tooltip>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── Footer note ── */}
        <p className="text-xs text-slate-400 text-center pb-2">
          Scores are calculated nightly at 03:00 and on compliance events.
          Use <strong>Re-evaluate</strong> to recalculate now.
          Category scores are weighted means; a −2 penalty per open critical alert applies (floor 0).
        </p>
      </div>
    </TooltipProvider>
  );
}
