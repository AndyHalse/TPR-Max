import { useState, useMemo, useRef, Fragment, type CSSProperties } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import GlassCard from "@/components/GlassCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import {
  CheckCircle2, AlertTriangle, Clock, Minus, ChevronRight,
  Calendar, CheckSquare, ListTodo, Printer, Mail, Send, FileDown,
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

// ─── Constants ────────────────────────────────────────────────────────────────

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const MONTHS_FULL = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const TODAY = new Date();

const ASSET_CATEGORIES = [
  "HVAC", "Fire Safety", "Electrical", "Mechanical", "Water Hygiene",
  "Security", "Lifts & Hoists", "Grounds", "Cleaning", "Other",
];

// Category display order (and group header label). Unlisted categories sort last.
const CATEGORY_ORDER: string[] = [
  "Fire Safety",
  "Water Hygiene",
  "HVAC",
  "Mechanical",
  "Electrical",
  "Security",
  "Lifts & Hoists",
  "Grounds",
  "Cleaning",
  "Other",
];
// Total column count for colspan on group header rows: Asset + Freq + 12 months
const TOTAL_COLS = 14;

// ─── Types ────────────────────────────────────────────────────────────────────

type CellStatus = "overdue" | "due_soon" | "in_progress" | "scheduled" | "completed" | "empty";

interface PpmAsset {
  id: string;
  name: string;
  assetRef?: string | null;
  category?: string | null;
  location?: string | null;
  status: string;
}

interface PpmWorkOrder {
  id: string;
  assetId?: string | null;
  scheduleId?: string | null;
  title: string;
  status: string;
  dueDate?: string | null;
  completedDate?: string | null;
  contractorCompanyName?: string | null;
  contractorWorkerName?: string | null;
  notes?: string | null;
  templateType?: string | null;
}

interface PpmSchedule {
  id: string;
  assetId: string;
  frequency: string;
  customDays?: number | null;
}

// ─── Frequency badge config ────────────────────────────────────────────────────

const FREQ_BADGE_CFG: Record<string, { bg: string; color: string; border: string; label: string }> = {
  "12M": { bg: "rgba(88,166,255,0.15)",  color: "#3b82f6", border: "1px solid rgba(59,130,246,0.3)",  label: "12M" },
  "6M":  { bg: "rgba(168,85,247,0.15)", color: "#a855f7", border: "1px solid rgba(168,85,247,0.3)", label: "6M" },
  "3M":  { bg: "rgba(249,115,22,0.15)", color: "#f97316", border: "1px solid rgba(249,115,22,0.3)", label: "3M" },
  "M":   { bg: "rgba(34,197,94,0.15)",  color: "#22c55e", border: "1px solid rgba(34,197,94,0.3)",  label: "M" },
  "W":   { bg: "rgba(239,68,68,0.15)",  color: "#ef4444", border: "1px solid rgba(239,68,68,0.3)",  label: "W" },
};
const UNKNOWN_FREQ_BADGE = { bg: "rgba(148,163,184,0.1)", color: "#94a3b8", border: "1px solid rgba(148,163,184,0.2)" };
const BADGE_STYLE_BASE: CSSProperties = {
  fontSize: 10, padding: "2px 6px", borderRadius: 4, fontWeight: 600, fontFamily: "monospace",
  display: "inline-block", lineHeight: 1.4,
};

function freqToCode(frequency: string, customDays?: number | null): string {
  switch (frequency) {
    case "annual":
    case "annually":    return "12M";
    case "biannual":
    case "biannually":
    case "semi-annual": return "6M";
    case "quarterly":   return "3M";
    case "monthly":     return "M";
    case "weekly":      return "W";
    case "custom":
      if (customDays) {
        if (customDays >= 350)                         return "12M";
        if (customDays >= 160 && customDays <= 200)    return "6M";
        if (customDays >= 80  && customDays <= 100)    return "3M";
        if (customDays >= 28  && customDays <= 35)     return "M";
        if (customDays <= 7)                           return "W";
        return `${customDays}d`;
      }
      return "custom";
    default: return frequency || "—";
  }
}

// ─── Status helpers ───────────────────────────────────────────────────────────

const STATUS_PRIORITY: CellStatus[] = ["overdue", "due_soon", "in_progress", "scheduled", "completed"];

function getWoStatus(wo: PpmWorkOrder): CellStatus {
  if (wo.status === "overdue") return "overdue";
  if (wo.status === "completed") return "completed";
  if (wo.status === "in_progress") {
    const due = wo.dueDate ? new Date(wo.dueDate) : null;
    if (due) {
      const in14 = new Date(TODAY); in14.setDate(TODAY.getDate() + 14);
      if (due <= in14) return "due_soon";
    }
    return "in_progress";
  }
  if (wo.status === "scheduled") {
    const due = wo.dueDate ? new Date(wo.dueDate) : null;
    if (due) {
      const in14 = new Date(TODAY); in14.setDate(TODAY.getDate() + 14);
      if (due <= in14) return "due_soon";
    }
    return "scheduled";
  }
  return "scheduled";
}

function getCellStatus(wos: PpmWorkOrder[]): CellStatus {
  if (wos.length === 0) return "empty";
  const found = new Set<CellStatus>(wos.map(getWoStatus));
  for (const s of STATUS_PRIORITY) { if (found.has(s)) return s; }
  return "empty";
}

// ─── Cell visual config ───────────────────────────────────────────────────────

interface CellConfig {
  bg: string;
  border: string;
  text: string;
  icon?: JSX.Element;
  label: string;
}

const CELL_CFG: Record<CellStatus, CellConfig> = {
  overdue:    { bg: "#FDEAEA", border: "#F09595", text: "#C62828", label: "Overdue",    icon: <AlertTriangle className="h-3 w-3 shrink-0" /> },
  due_soon:   { bg: "#FEF3CD", border: "#F0C040", text: "#B45309", label: "Due Soon",   icon: <Clock className="h-3 w-3 shrink-0" /> },
  in_progress:{ bg: "#EBF5FB", border: "#85C1E9", text: "#1565C0", label: "In Progress",icon: <Clock className="h-3 w-3 shrink-0" /> },
  scheduled:  { bg: "#EBF5FB", border: "#90CAF9", text: "#1565C0", label: "Scheduled", icon: <Calendar className="h-3 w-3 shrink-0 opacity-70" /> },
  completed:  { bg: "#EAF3DE", border: "#97C459", text: "#2E7D32", label: "Completed",  icon: <CheckCircle2 className="h-3 w-3 shrink-0" /> },
  empty:      { bg: "#FFFFFF", border: "#E5E7EB", text: "#9CA3AF", label: "No Task" },
};

// ─── WO status badge ──────────────────────────────────────────────────────────

const WO_BADGE: Record<string, string> = {
  scheduled:   "bg-blue-100 text-blue-800 border-blue-200",
  in_progress: "bg-yellow-100 text-yellow-800 border-yellow-200",
  completed:   "bg-green-100 text-green-800 border-green-200",
  overdue:     "bg-red-100 text-red-800 border-red-200",
};

function fmtDate(d?: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

// ─── Side panel props ─────────────────────────────────────────────────────────

interface PanelSelection {
  asset: PpmAsset;
  monthIdx: number;
  wos: PpmWorkOrder[];
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  navigateToWorkOrder: (id: string) => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function PpmAnnualPlanner({ navigateToWorkOrder }: Props) {
  const { toast } = useToast();
  const [year, setYear] = useState<number>(new Date().getFullYear());
  const [filterName, setFilterName] = useState("");
  const [filterCategory, setFilterCategory] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterFrequency, setFilterFrequency] = useState("all");
  const [panel, setPanel] = useState<PanelSelection | null>(null);
  const [emailOpen, setEmailOpen] = useState(false);
  const [emailAddr, setEmailAddr] = useState("");
  const [emailMsg, setEmailMsg] = useState("");
  const printRef = useRef<HTMLDivElement>(null);

  const CURRENT_MONTH = new Date().getFullYear() === year ? new Date().getMonth() : -1;

  const { data: assets = [], isLoading: loadingAssets } = useQuery<PpmAsset[]>({
    queryKey: ["/api/ppm/assets"],
  });

  const { data: allWorkOrders = [], isLoading: loadingWOs } = useQuery<PpmWorkOrder[]>({
    queryKey: ["/api/ppm/work-orders", year],
    queryFn: async () => {
      const res = await fetch(`/api/ppm/work-orders?year=${year}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch work orders");
      return res.json();
    },
  });

  const { data: schedules = [], isLoading: loadingSchedules } = useQuery<PpmSchedule[]>({
    queryKey: ["/api/ppm/schedules"],
  });

  // assetId → Set of canonical frequency codes (e.g. "12M", "6M", "M")
  const assetFreqMap = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const s of schedules) {
      if (!s.assetId) continue;
      const code = freqToCode(s.frequency, s.customDays);
      if (!map.has(s.assetId)) map.set(s.assetId, new Set());
      map.get(s.assetId)!.add(code);
    }
    return map;
  }, [schedules]);

  const emailMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", "/api/ppm/annual-planner/email", {
        email: emailAddr,
        year,
        message: emailMsg || undefined,
      });
    },
    onSuccess: () => {
      toast({ title: "Report sent", description: `Annual Planner ${year} emailed to ${emailAddr}.` });
      setEmailOpen(false);
      setEmailAddr("");
      setEmailMsg("");
    },
    onError: (err: any) => {
      toast({ title: "Failed to send", description: err?.message ?? "Check your email settings.", variant: "destructive" });
    },
  });

  // ── Index work orders by assetId + month ──────────────────────────────────
  const wosByAssetMonth = useMemo(() => {
    const map = new Map<string, Map<number, PpmWorkOrder[]>>();
    for (const wo of allWorkOrders) {
      if (!wo.assetId || !wo.dueDate) continue;
      const d = new Date(wo.dueDate);
      if (d.getFullYear() !== year) continue;
      const m = d.getMonth();
      if (!map.has(wo.assetId)) map.set(wo.assetId, new Map());
      const monthMap = map.get(wo.assetId)!;
      if (!monthMap.has(m)) monthMap.set(m, []);
      monthMap.get(m)!.push(wo);
    }
    return map;
  }, [allWorkOrders, year]);

  // ── Summary metrics ───────────────────────────────────────────────────────
  const metrics = useMemo(() => {
    const todayMs = new Date().setHours(0, 0, 0, 0);

    // Total unique assets in the planner (one row per asset)
    const totalAssets = assets.length;

    // Completed entries — work orders for the selected year with status 'completed'
    const completed = allWorkOrders.filter(wo => wo.status === "completed").length;

    // Upcoming — future due date, not overdue or completed
    const upcoming = allWorkOrders.filter(wo => {
      if (wo.status === "overdue" || wo.status === "completed") return false;
      if (!wo.dueDate) return false;
      return new Date(wo.dueDate).getTime() >= todayMs;
    }).length;

    // Overdue — past due date and not completed
    const overdue = allWorkOrders.filter(wo => {
      if (wo.status === "completed") return false;
      if (wo.status === "overdue") return true; // explicitly flagged
      if (!wo.dueDate) return false;
      return new Date(wo.dueDate).getTime() < todayMs;
    }).length;

    // No Dates Recorded — assets with zero work orders in the selected year
    const noDates = assets.filter(a => !wosByAssetMonth.has(a.id)).length;

    return { totalAssets, completed, upcoming, overdue, noDates };
  }, [allWorkOrders, assets, wosByAssetMonth]);

  // ── Filtered assets ───────────────────────────────────────────────────────
  const filteredAssets = useMemo(() => {
    const nameQ = filterName.trim().toLowerCase();
    return assets.filter(a => {
      if (nameQ && !a.name.toLowerCase().includes(nameQ)) return false;
      if (filterCategory !== "all" && a.category !== filterCategory) return false;
      if (filterStatus !== "all") {
        const monthMap = wosByAssetMonth.get(a.id);
        if (!monthMap) return filterStatus === "empty";
        const statuses = Array.from(monthMap.values()).flat().map(getWoStatus);
        if (filterStatus === "overdue" && !statuses.includes("overdue")) return false;
        if (filterStatus === "completed" && !statuses.some(s => s === "completed")) return false;
        if (filterStatus === "scheduled" && !statuses.some(s => s === "scheduled" || s === "in_progress")) return false;
        if (filterStatus === "empty" && monthMap.size > 0) return false;
      }
      if (filterFrequency !== "all") {
        const freqSet = assetFreqMap.get(a.id);
        if (!freqSet || !freqSet.has(filterFrequency)) return false;
      }
      return true;
    });
  }, [assets, filterName, filterCategory, filterStatus, filterFrequency, wosByAssetMonth, assetFreqMap]);

  // ── Grouped assets (for category section headers) ─────────────────────────
  const groupedAssets = useMemo(() => {
    // Bucket assets by category; assets with no category go to "Other"
    const buckets = new Map<string, typeof filteredAssets>();
    for (const a of filteredAssets) {
      const cat = (a.category && a.category.trim()) ? a.category.trim() : "Other";
      if (!buckets.has(cat)) buckets.set(cat, []);
      buckets.get(cat)!.push(a);
    }
    // Sort buckets by CATEGORY_ORDER; unknown categories come after, then "Other"
    const ordered: { cat: string; assets: typeof filteredAssets }[] = [];
    for (const cat of CATEGORY_ORDER) {
      if (buckets.has(cat)) {
        ordered.push({ cat, assets: buckets.get(cat)! });
        buckets.delete(cat);
      }
    }
    // Remaining unlisted categories (alphabetical), excluding "Other" (handled last)
    const leftover = Array.from(buckets.keys()).filter(k => k !== "Other").sort();
    for (const cat of leftover) {
      ordered.push({ cat, assets: buckets.get(cat)! });
    }
    if (buckets.has("Other")) {
      ordered.push({ cat: "Other", assets: buckets.get("Other")! });
    }
    return ordered;
  }, [filteredAssets]);

  const loading = loadingAssets || loadingWOs || loadingSchedules;

  // ── Cell click ────────────────────────────────────────────────────────────
  function handleCellClick(asset: PpmAsset, monthIdx: number, wos: PpmWorkOrder[]) {
    if (wos.length === 0) return;
    setPanel({ asset, monthIdx, wos });
  }

  // ── Print ─────────────────────────────────────────────────────────────────
  function handlePrint() {
    window.print();
  }

  // ── CSV Export ─────────────────────────────────────────────────────────────
  function handleExportCSV() {
    const headers = ["Asset", "Asset Ref", "Category", "Location", ...MONTHS_FULL, "Total Tasks", "Complete", "Overdue"];

    const rows = filteredAssets.map(asset => {
      const monthMap = wosByAssetMonth.get(asset.id) ?? new Map();
      let totalTasks = 0, complete = 0, overdue = 0;
      const monthCells = MONTHS.map((_, mIdx) => {
        const wos = monthMap.get(mIdx) ?? [];
        totalTasks += wos.length;
        complete += wos.filter(w => w.status === "completed").length;
        overdue += wos.filter(w => w.status === "overdue").length;
        const status = getCellStatus(wos);
        return status === "empty" ? "" : CELL_CFG[status].label;
      });
      return [asset.name, asset.assetRef ?? "", asset.category ?? "", asset.location ?? "", ...monthCells, totalTasks, complete, overdue];
    });

    const csvContent = [headers, ...rows]
      .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(","))
      .join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `PPM-Annual-Planner-${year}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-muted-foreground">
        <RefreshCwIcon className="h-5 w-5 animate-spin mr-2" /> Loading planner…
      </div>
    );
  }

  if (assets.length === 0) {
    return (
      <div className="text-center py-24 text-muted-foreground space-y-2">
        <Calendar className="h-10 w-10 mx-auto opacity-30" />
        <p className="font-medium">No assets yet</p>
        <p className="text-sm">Use "Load Demo Data" to populate the planner.</p>
      </div>
    );
  }

  return (
    <>
      {/* ── Print-specific styles ── */}
      <style>{`
        @media print {
          /* Force colour printing (backgrounds, borders) */
          * { -webkit-print-color-adjust: exact !important; color-adjust: exact !important; }

          /* Hide everything, then reveal only the planner root and its children.
             This works even when the root is deeply nested — unlike "body > * display:none"
             which would hide the app shell that contains the planner. */
          body * { visibility: hidden; }
          #ppm-planner-print-root,
          #ppm-planner-print-root * { visibility: visible; }

          /* Lift the planner to the top-left so it fills the page */
          #ppm-planner-print-root {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            max-width: none;
          }

          /* Hide controls that should not appear in the PDF */
          .no-print { display: none !important; }

          /* Remove scroll containers and sticky positioning for the table */
          .ppm-grid-table {
            overflow: visible !important;
            max-height: none !important;
            max-width: none !important;
          }
          .ppm-grid-table table { width: 100% !important; }
          .ppm-asset-col { position: static !important; background: white !important; }
          thead th { position: static !important; background: #f9fafb !important; }

          @page { size: A3 landscape; margin: 12mm; }
        }
      `}</style>

      <div id="ppm-planner-print-root" ref={printRef} className="space-y-4">
        {/* ── Toolbar ── */}
        <div className="flex items-center justify-between gap-2 no-print">
          <h2 className="text-base font-semibold text-foreground">Annual Maintenance Planner — {year}</h2>
          <div className="flex items-center gap-2">
            <Select value={String(year)} onValueChange={v => setYear(Number(v))}>
              <SelectTrigger className="w-24 h-8 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[new Date().getFullYear() - 1, new Date().getFullYear(), new Date().getFullYear() + 1].map(y => (
                  <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" className="gap-2 h-8" onClick={handleExportCSV}>
              <FileDown className="h-3.5 w-3.5" /> Export CSV
            </Button>
            <Button variant="outline" size="sm" className="gap-2 h-8" onClick={handlePrint}>
              <Printer className="h-3.5 w-3.5" /> Print / Export PDF
            </Button>
            <Button variant="outline" size="sm" className="gap-2 h-8" onClick={() => setEmailOpen(true)}>
              <Mail className="h-3.5 w-3.5" /> Email Report
            </Button>
          </div>
        </div>

        {/* Print header (only visible when printing) */}
        <div className="hidden print:block mb-4">
          <h1 className="text-xl font-bold">PPM Annual Planner {year}</h1>
          <p className="text-sm text-gray-500">Planned Preventive Maintenance Schedule — printed {new Date().toLocaleDateString("en-GB")}</p>
        </div>

        {/* ── Summary cards ── */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <GlassCard className="p-3 text-center">
            <p className="text-xs text-muted-foreground mb-1 flex items-center justify-center gap-1">
              <ListTodo className="h-3.5 w-3.5" /> Total Assets
            </p>
            {filteredAssets.length < metrics.totalAssets ? (
              <p className="text-2xl font-bold">
                {filteredAssets.length}
                <span className="text-sm font-normal text-muted-foreground"> / {metrics.totalAssets}</span>
              </p>
            ) : (
              <p className="text-2xl font-bold">{metrics.totalAssets}</p>
            )}
          </GlassCard>
          <GlassCard className="p-3 text-center">
            <p className="text-xs text-muted-foreground mb-1 flex items-center justify-center gap-1">
              <CheckSquare className="h-3.5 w-3.5" /> Completed
            </p>
            <p className="text-2xl font-bold text-green-600">{metrics.completed}</p>
          </GlassCard>
          <GlassCard className="p-3 text-center">
            <p className="text-xs text-muted-foreground mb-1 flex items-center justify-center gap-1">
              <Calendar className="h-3.5 w-3.5" /> Upcoming
            </p>
            <p className="text-2xl font-bold text-blue-600">{metrics.upcoming}</p>
          </GlassCard>
          <GlassCard className="p-3 text-center">
            <p className="text-xs text-muted-foreground mb-1 flex items-center justify-center gap-1">
              <AlertTriangle className="h-3.5 w-3.5" /> Overdue
            </p>
            <p className="text-2xl font-bold text-red-600">{metrics.overdue}</p>
          </GlassCard>
          <GlassCard className="p-3 text-center">
            <p className="text-xs text-muted-foreground mb-1 flex items-center justify-center gap-1">
              <Minus className="h-3.5 w-3.5" /> No Dates Recorded
            </p>
            <p className="text-2xl font-bold text-muted-foreground">{metrics.noDates}</p>
          </GlassCard>
        </div>

        {/* ── Filters ── */}
        <div className="flex flex-wrap gap-2 items-center no-print">
          <Input
            value={filterName}
            onChange={e => setFilterName(e.target.value)}
            placeholder="Search assets..."
            className="h-8 text-sm w-48"
          />
          <Select value={filterCategory} onValueChange={setFilterCategory}>
            <SelectTrigger className="w-44 h-8 text-sm">
              <SelectValue placeholder="All Categories" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {ASSET_CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filterFrequency} onValueChange={setFilterFrequency}>
            <SelectTrigger className="w-36 h-8 text-sm">
              <SelectValue placeholder="All Frequencies" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Frequencies</SelectItem>
              <SelectItem value="12M">Annual (12M)</SelectItem>
              <SelectItem value="6M">6-Monthly</SelectItem>
              <SelectItem value="3M">Quarterly (3M)</SelectItem>
              <SelectItem value="M">Monthly</SelectItem>
              <SelectItem value="W">Weekly</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-40 h-8 text-sm">
              <SelectValue placeholder="All Statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="overdue">Has Overdue</SelectItem>
              <SelectItem value="scheduled">Scheduled</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
            </SelectContent>
          </Select>
          {(filterName !== "" || filterCategory !== "all" || filterStatus !== "all" || filterFrequency !== "all") && (
            <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => { setFilterName(""); setFilterCategory("all"); setFilterStatus("all"); setFilterFrequency("all"); }}>
              Clear filters
            </Button>
          )}
        </div>

        {/* ── Legend ── */}
        <div className="flex flex-wrap gap-3 text-xs text-muted-foreground items-center">
          {(["overdue","due_soon","in_progress","scheduled","completed","empty"] as CellStatus[]).map(s => {
            const cfg = CELL_CFG[s];
            return (
              <span key={s} className="flex items-center gap-1">
                <span className="inline-block w-3 h-3 rounded-sm border" style={{ background: cfg.bg, borderColor: cfg.border }} />
                {cfg.label}
              </span>
            );
          })}
          <span className="flex items-center gap-1 border-l pl-3 ml-1">
            <span className="inline-flex items-center justify-center w-3 h-3 rounded-sm border text-[7px] font-bold" style={{ background: "#EBF5FB", borderColor: "#90CAF9", color: "#1565C0" }}>S</span>
            Statutory
          </span>
        </div>

        {/* ── Grid ── */}
        <div className="overflow-x-auto rounded-lg border border-border ppm-grid-table">
          <table className="border-collapse min-w-max w-full">
            <thead>
              <tr className="bg-muted/50">
                <th className="ppm-asset-col sticky left-0 bg-muted/80 z-10 text-left text-xs font-semibold text-muted-foreground px-3 py-2 border-b border-r border-border" style={{ minWidth: 220, width: 220 }}>
                  Asset
                </th>
                <th className="text-center text-xs font-semibold text-muted-foreground px-2 py-2 border-b border-r border-border" style={{ minWidth: 60, width: 60 }}>
                  Freq
                </th>
                {MONTHS.map((m, i) => (
                  <th
                    key={m}
                    className="text-center text-xs font-semibold text-muted-foreground border-b border-r border-border last:border-r-0"
                    style={{
                      minWidth: 52,
                      width: 52,
                      paddingTop: 6,
                      paddingBottom: 6,
                      borderLeft: i === CURRENT_MONTH ? "2px solid #0d9488" : undefined,
                      background: i === CURRENT_MONTH ? "#f0fdfa" : undefined,
                      color: i === CURRENT_MONTH ? "#0d9488" : undefined,
                    }}
                  >
                    {m}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {groupedAssets.map(({ cat, assets: groupAssets }) => (
                <Fragment key={`grp-${cat}`}>
                  {/* ── Category group header ── */}
                  <tr key={`hdr-${cat}`}>
                    <td
                      colSpan={TOTAL_COLS}
                      style={{
                        background: "#f1f5f9",
                        borderBottom: "1px solid #e2e8f0",
                        borderTop: "1px solid #e2e8f0",
                        padding: "4px 12px",
                        fontFamily: "monospace",
                        fontSize: 11,
                        fontWeight: 700,
                        letterSpacing: "0.06em",
                        color: "#2563eb",
                        textTransform: "uppercase",
                      }}
                    >
                      // {cat}
                    </td>
                  </tr>
                  {/* ── Asset rows ── */}
                  {groupAssets.map((asset, rowIdx) => {
                    const monthMap = wosByAssetMonth.get(asset.id) ?? new Map<number, PpmWorkOrder[]>();
                    return (
                      <tr
                        key={asset.id}
                        className={`border-b border-border last:border-b-0 ${rowIdx % 2 === 0 ? "bg-white dark:bg-background" : "bg-muted/20"}`}
                      >
                        {/* Asset name column */}
                        <td className="ppm-asset-col sticky left-0 z-10 px-3 py-1 border-r border-border text-sm" style={{ minWidth: 220, width: 220, background: rowIdx % 2 === 0 ? "white" : undefined }}>
                          <p className="font-medium text-foreground truncate leading-tight">{asset.name}</p>
                          <p className="text-xs text-muted-foreground truncate">
                            {[asset.assetRef, asset.category].filter(Boolean).join(" · ")}
                          </p>
                        </td>
                        {/* Frequency badge column */}
                        <td className="border-r border-border px-1 py-1 align-middle" style={{ minWidth: 60, width: 60 }}>
                          <div className="flex flex-col items-center gap-0.5">
                            {(() => {
                              const freqSet = assetFreqMap.get(asset.id);
                              if (!freqSet || freqSet.size === 0) {
                                return (
                                  <span style={{ ...BADGE_STYLE_BASE, ...UNKNOWN_FREQ_BADGE }}>—</span>
                                );
                              }
                              return Array.from(freqSet).map(code => {
                                const cfg = FREQ_BADGE_CFG[code];
                                return cfg ? (
                                  <span key={code} style={{ ...BADGE_STYLE_BASE, background: cfg.bg, color: cfg.color, border: cfg.border }}>
                                    {cfg.label}
                                  </span>
                                ) : (
                                  <span key={code} style={{ ...BADGE_STYLE_BASE, ...UNKNOWN_FREQ_BADGE }}>
                                    {code || "—"}
                                  </span>
                                );
                              });
                            })()}
                          </div>
                        </td>
                        {/* Month cells */}
                        {MONTHS.map((_, mIdx) => {
                          const wos = monthMap.get(mIdx) ?? [];
                          const status = getCellStatus(wos);
                          const cfg = CELL_CFG[status];
                          const isCurrentMonth = mIdx === CURRENT_MONTH;
                          const hasStatutory = wos.some(w => w.templateType === "statutory");
                          return (
                            <td
                              key={mIdx}
                              className={`border-r border-border last:border-r-0 text-center align-middle ${wos.length > 0 ? "cursor-pointer hover:opacity-80 transition-opacity" : ""}`}
                              style={{
                                position: "relative",
                                minWidth: 52,
                                width: 52,
                                height: 44,
                                padding: 2,
                                borderLeft: isCurrentMonth ? "2px solid #0d9488" : undefined,
                              }}
                              onClick={() => handleCellClick(asset, mIdx, wos)}
                            >
                              <div
                                className="flex items-center justify-center gap-0.5 rounded mx-auto h-full"
                                style={{
                                  background: cfg.bg,
                                  border: `1px solid ${cfg.border}`,
                                  color: cfg.text,
                                  minHeight: 36,
                                }}
                              >
                                {status === "empty" ? (
                                  <Minus className="h-3 w-3 opacity-30" />
                                ) : (
                                  cfg.icon ?? null
                                )}
                              </div>
                              {status !== "empty" && hasStatutory && (
                                <span
                                  style={{
                                    position: "absolute", top: 4, right: 5,
                                    fontSize: 8, fontWeight: 700,
                                    color: cfg.text, opacity: 0.85,
                                    lineHeight: 1,
                                    pointerEvents: "none",
                                  }}
                                >S</span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>

        {/* ── Side panel ── */}
        <Sheet open={!!panel} onOpenChange={(o) => { if (!o) setPanel(null); }}>
          <SheetContent side="right" className="w-[360px] sm:w-[360px] overflow-y-auto">
            {panel && (
              <>
                <SheetHeader className="mb-4">
                  <SheetTitle className="text-lg font-bold leading-tight">{panel.asset.name}</SheetTitle>
                  <p className="text-sm text-muted-foreground">
                    {[panel.asset.assetRef, panel.asset.category].filter(Boolean).join(" · ")}
                  </p>
                  <p className="text-sm font-medium text-primary mt-1">
                    {MONTHS[panel.monthIdx]} {year}
                  </p>
                </SheetHeader>

                <div className="space-y-4">
                  {panel.wos.map((wo) => {
                    const woStatus = getWoStatus(wo);
                    const cfg = CELL_CFG[woStatus];
                    return (
                      <div
                        key={wo.id}
                        className="rounded-lg border p-3 space-y-2"
                        style={{ borderColor: cfg.border, background: cfg.bg }}
                      >
                        {/* Status badge */}
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5">
                            <Badge className={`text-xs border ${WO_BADGE[wo.status] ?? "bg-gray-100 text-gray-700 border-gray-200"}`}>
                              {wo.status.replace("_", " ")}
                            </Badge>
                            {wo.templateType === "statutory" && (
                              <Badge className="text-xs border bg-purple-50 text-purple-700 border-purple-200">Statutory</Badge>
                            )}
                          </div>
                          {cfg.icon && (
                            <span style={{ color: cfg.text }}>{cfg.icon}</span>
                          )}
                        </div>

                        {/* Task title */}
                        <p className="font-semibold text-sm text-foreground">{wo.title}</p>

                        {/* Details */}
                        <div className="text-xs text-muted-foreground space-y-1">
                          <div className="flex justify-between">
                            <span>Due date</span>
                            <span className="font-medium text-foreground">{fmtDate(wo.dueDate)}</span>
                          </div>
                          {wo.contractorCompanyName && (
                            <div className="flex justify-between">
                              <span>Contractor</span>
                              <span className="font-medium text-foreground">{wo.contractorCompanyName}</span>
                            </div>
                          )}
                          {wo.contractorWorkerName && (
                            <div className="flex justify-between">
                              <span>Worker</span>
                              <span className="font-medium text-foreground">{wo.contractorWorkerName}</span>
                            </div>
                          )}
                          {wo.completedDate && (
                            <div className="flex justify-between">
                              <span>Completed</span>
                              <span className="font-medium text-foreground">{fmtDate(wo.completedDate)}</span>
                            </div>
                          )}
                        </div>

                        {wo.notes && (
                          <p className="text-xs text-muted-foreground border-t pt-2 mt-1">{wo.notes}</p>
                        )}

                        {/* Navigate button */}
                        <Button
                          size="sm"
                          variant="outline"
                          className="w-full mt-1 text-xs gap-1"
                          onClick={() => {
                            setPanel(null);
                            navigateToWorkOrder(wo.id);
                          }}
                        >
                          View Work Order <ChevronRight className="h-3 w-3" />
                        </Button>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </SheetContent>
        </Sheet>
      </div>

      {/* ── Email Report Dialog ── */}
      <Dialog open={emailOpen} onOpenChange={setEmailOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Mail className="h-4 w-4" /> Email Annual Planner Report
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              Send the full {year} maintenance schedule grid to a site manager or stakeholder.
            </p>
            <div className="space-y-1.5">
              <Label htmlFor="planner-email">Recipient email address</Label>
              <Input
                id="planner-email"
                type="email"
                placeholder="manager@example.com"
                value={emailAddr}
                onChange={e => setEmailAddr(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="planner-msg">Additional message <span className="text-muted-foreground font-normal">(optional)</span></Label>
              <Textarea
                id="planner-msg"
                placeholder="Please review the attached maintenance schedule for this year…"
                rows={3}
                value={emailMsg}
                onChange={e => setEmailMsg(e.target.value)}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              The email will include a colour-coded 12-month grid showing all {assets.length} assets, plus summary statistics.
            </p>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setEmailOpen(false)}>Cancel</Button>
            <Button
              onClick={() => emailMutation.mutate()}
              disabled={!emailAddr.includes("@") || emailMutation.isPending}
              className="gap-2"
            >
              {emailMutation.isPending ? (
                <><RefreshCwIcon className="h-3.5 w-3.5 animate-spin" /> Sending…</>
              ) : (
                <><Send className="h-3.5 w-3.5" /> Send Report</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function RefreshCwIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
      <path d="M21 3v5h-5" />
      <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
      <path d="M8 16H3v5" />
    </svg>
  );
}
