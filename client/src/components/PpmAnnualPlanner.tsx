import { useState, useMemo, useRef } from "react";
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
  Calendar, CheckSquare, ListTodo, Printer, Mail, Send,
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

// ─── Constants ────────────────────────────────────────────────────────────────

const YEAR = 2026;
const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const TODAY = new Date();
const CURRENT_MONTH = TODAY.getFullYear() === YEAR ? TODAY.getMonth() : -1;

const ASSET_CATEGORIES = [
  "HVAC", "Fire Safety", "Electrical", "Mechanical", "Water Hygiene",
  "Security", "Lifts & Hoists", "Grounds", "Cleaning", "Other",
];

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
  title: string;
  status: string;
  dueDate?: string | null;
  completedDate?: string | null;
  contractorCompanyName?: string | null;
  contractorWorkerName?: string | null;
  notes?: string | null;
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
  const [filterCategory, setFilterCategory] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [panel, setPanel] = useState<PanelSelection | null>(null);
  const [emailOpen, setEmailOpen] = useState(false);
  const [emailAddr, setEmailAddr] = useState("");
  const [emailMsg, setEmailMsg] = useState("");
  const printRef = useRef<HTMLDivElement>(null);

  const { data: assets = [], isLoading: loadingAssets } = useQuery<PpmAsset[]>({
    queryKey: ["/api/ppm/assets"],
  });

  const { data: allWorkOrders = [], isLoading: loadingWOs } = useQuery<PpmWorkOrder[]>({
    queryKey: ["/api/ppm/work-orders"],
  });

  const emailMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", "/api/ppm/annual-planner/email", {
        email: emailAddr,
        year: YEAR,
        message: emailMsg || undefined,
      });
    },
    onSuccess: () => {
      toast({ title: "Report sent", description: `Annual Planner ${YEAR} emailed to ${emailAddr}.` });
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
      if (d.getFullYear() !== YEAR) continue;
      const m = d.getMonth();
      if (!map.has(wo.assetId)) map.set(wo.assetId, new Map());
      const monthMap = map.get(wo.assetId)!;
      if (!monthMap.has(m)) monthMap.set(m, []);
      monthMap.get(m)!.push(wo);
    }
    return map;
  }, [allWorkOrders]);

  // ── Summary metrics ───────────────────────────────────────────────────────
  const metrics = useMemo(() => {
    const yearWOs = allWorkOrders.filter(wo => {
      if (!wo.dueDate) return false;
      return new Date(wo.dueDate).getFullYear() === YEAR;
    });
    const totalTasks = yearWOs.length;
    const complete   = yearWOs.filter(wo => wo.status === "completed").length;
    const overdue    = yearWOs.filter(wo => wo.status === "overdue").length;
    const thisMonth  = yearWOs.filter(wo => {
      if (!wo.dueDate) return false;
      const d = new Date(wo.dueDate);
      return d.getMonth() === CURRENT_MONTH && d.getFullYear() === YEAR;
    }).length;
    return { totalTasks, complete, overdue, thisMonth };
  }, [allWorkOrders]);

  // ── Filtered assets ───────────────────────────────────────────────────────
  const filteredAssets = useMemo(() => {
    return assets.filter(a => {
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
      return true;
    });
  }, [assets, filterCategory, filterStatus, wosByAssetMonth]);

  const loading = loadingAssets || loadingWOs;

  // ── Cell click ────────────────────────────────────────────────────────────
  function handleCellClick(asset: PpmAsset, monthIdx: number, wos: PpmWorkOrder[]) {
    if (wos.length === 0) return;
    setPanel({ asset, monthIdx, wos });
  }

  // ── Print ─────────────────────────────────────────────────────────────────
  function handlePrint() {
    window.print();
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
          body > *:not(#ppm-planner-print-root) { display: none !important; }
          #ppm-planner-print-root { display: block !important; }
          .no-print { display: none !important; }
          .ppm-grid-table { position: static !important; }
          .ppm-asset-col { position: static !important; }
          @page { size: A3 landscape; margin: 12mm; }
        }
      `}</style>

      <div id="ppm-planner-print-root" ref={printRef} className="space-y-4">
        {/* ── Toolbar ── */}
        <div className="flex items-center justify-between gap-2 no-print">
          <h2 className="text-base font-semibold text-foreground">Annual Maintenance Planner — {YEAR}</h2>
          <div className="flex gap-2">
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
          <h1 className="text-xl font-bold">PPM Annual Planner {YEAR}</h1>
          <p className="text-sm text-gray-500">Planned Preventive Maintenance Schedule — printed {new Date().toLocaleDateString("en-GB")}</p>
        </div>

        {/* ── Summary cards ── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <GlassCard className="p-3 text-center">
            <p className="text-xs text-muted-foreground mb-1 flex items-center justify-center gap-1">
              <ListTodo className="h-3.5 w-3.5" /> Total Tasks {YEAR}
            </p>
            <p className="text-2xl font-bold">{metrics.totalTasks}</p>
          </GlassCard>
          <GlassCard className="p-3 text-center">
            <p className="text-xs text-muted-foreground mb-1 flex items-center justify-center gap-1">
              <CheckSquare className="h-3.5 w-3.5" /> Complete
            </p>
            <p className="text-2xl font-bold text-green-600">{metrics.complete}</p>
          </GlassCard>
          <GlassCard className="p-3 text-center">
            <p className="text-xs text-muted-foreground mb-1 flex items-center justify-center gap-1">
              <AlertTriangle className="h-3.5 w-3.5" /> Overdue
            </p>
            <p className="text-2xl font-bold text-red-600">{metrics.overdue}</p>
          </GlassCard>
          <GlassCard className="p-3 text-center">
            <p className="text-xs text-muted-foreground mb-1 flex items-center justify-center gap-1">
              <Clock className="h-3.5 w-3.5" /> Due This Month
            </p>
            <p className="text-2xl font-bold text-amber-600">{metrics.thisMonth}</p>
          </GlassCard>
        </div>

        {/* ── Filters ── */}
        <div className="flex flex-wrap gap-2 items-center no-print">
          <Select value={filterCategory} onValueChange={setFilterCategory}>
            <SelectTrigger className="w-44 h-8 text-sm">
              <SelectValue placeholder="All Categories" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {ASSET_CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
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
          {(filterCategory !== "all" || filterStatus !== "all") && (
            <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => { setFilterCategory("all"); setFilterStatus("all"); }}>
              Clear filters
            </Button>
          )}
          <span className="text-xs text-muted-foreground ml-auto">{filteredAssets.length} asset{filteredAssets.length !== 1 ? "s" : ""}</span>
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
        </div>

        {/* ── Grid ── */}
        <div className="overflow-x-auto rounded-lg border border-border ppm-grid-table">
          <table className="border-collapse min-w-max w-full">
            <thead>
              <tr className="bg-muted/50">
                <th className="ppm-asset-col sticky left-0 bg-muted/80 z-10 text-left text-xs font-semibold text-muted-foreground px-3 py-2 border-b border-r border-border" style={{ minWidth: 220, width: 220 }}>
                  Asset
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
              {filteredAssets.map((asset, rowIdx) => {
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
                    {/* Month cells */}
                    {MONTHS.map((_, mIdx) => {
                      const wos = monthMap.get(mIdx) ?? [];
                      const status = getCellStatus(wos);
                      const cfg = CELL_CFG[status];
                      const isCurrentMonth = mIdx === CURRENT_MONTH;
                      return (
                        <td
                          key={mIdx}
                          className={`border-r border-border last:border-r-0 text-center align-middle ${wos.length > 0 ? "cursor-pointer hover:opacity-80 transition-opacity" : ""}`}
                          style={{
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
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
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
                    {MONTHS[panel.monthIdx]} {YEAR}
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
                          <Badge className={`text-xs border ${WO_BADGE[wo.status] ?? "bg-gray-100 text-gray-700 border-gray-200"}`}>
                            {wo.status.replace("_", " ")}
                          </Badge>
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
              Send the full {YEAR} maintenance schedule grid to a site manager or stakeholder.
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
