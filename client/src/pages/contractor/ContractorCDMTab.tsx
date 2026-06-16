import { useState, useEffect, useRef, useMemo } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import GlassCard from "@/components/GlassCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import {
  AlertCircle,
  AlertTriangle,
  Building2,
  CalendarDays,
  CheckCircle,
  ChevronDown,
  ClipboardList,
  Download,
  Edit,
  HardHat as HardHatIcon,
  MapPin,
  Plus,
  Search,
  Shield,
  Trash2,
  User,
  CheckSquare as CheckSquareIcon,
} from "lucide-react";
import {
  type CdmProject,
  CDM_ROLE_LABELS,
  CDM_STATUS_BADGE,
  isNotifiable,
  isF10Overdue,
  complianceScore,
} from "./types";

export default function ContractorCDMTab({ companies }: { companies: any[] }) {
  const { toast } = useToast();

  const { data: currentUser } = useQuery<{ customerId: string }>({
    queryKey: ["/api/auth/me"],
    retry: false,
  });
  const customerId = currentUser?.customerId;
  const [search, setSearch] = useState("");
  const [selectedProject, setSelectedProject] = useState<CdmProject | null>(null);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [addStep, setAddStep] = useState(1);
  const [editingProject, setEditingProject] = useState<CdmProject | null>(null);
  // Inline section editing state — tracks which section is being edited and its edits
  const [editingSection, setEditingSection] = useState<string | null>(null);
  const [sectionDraft, setSectionDraft] = useState<Record<string, any>>({});
  const [showPdfFilterDialog, setShowPdfFilterDialog] = useState(false);
  const [showComplianceSummary, setShowComplianceSummary] = useState(true);
  const [summaryStatusFilter, setSummaryStatusFilter] = useState("all");
  const [summaryFromDate, setSummaryFromDate] = useState("");
  const [summaryToDate, setSummaryToDate] = useState("");
  const [summaryContractorFilter, setSummaryContractorFilter] = useState("all");

  const loadPdfFilters = (companyId: string) => {
    try {
      const key = companyId && companyId !== "all" ? `cdm_pdf_filter_${companyId}` : "cdm_pdf_filter_all";
      const saved = localStorage.getItem(key);
      if (saved) {
        const parsed = JSON.parse(saved);
        return {
          status: parsed.status ?? "all",
          fromDate: parsed.fromDate ?? "",
          toDate: parsed.toDate ?? "",
          companyId: parsed.companyId ?? "all",
        };
      }
    } catch {}
    return { status: "all", fromDate: "", toDate: "", companyId: "all" };
  };

  const initialLastCompany = (() => { try { return localStorage.getItem("cdm_pdf_last_company") || "all"; } catch { return "all"; } })();
  const initialPdfFilters = loadPdfFilters(initialLastCompany);
  const [pdfStatusFilter, setPdfStatusFilter] = useState(initialPdfFilters.status);
  const [pdfFromDate, setPdfFromDate] = useState(initialPdfFilters.fromDate);
  const [pdfToDate, setPdfToDate] = useState(initialPdfFilters.toDate);
  const [pdfCompanyFilter, setPdfCompanyFilter] = useState(initialLastCompany);
  const pdfGeneratingRef = useRef(false);

  const resetPdfFilters = () => {
    setPdfStatusFilter("all");
    setPdfFromDate("");
    setPdfToDate("");
    setPdfCompanyFilter("all");
    try { localStorage.setItem("cdm_pdf_last_company", "all"); } catch {}
  };

  const handlePdfDialogOpenChange = (open: boolean) => {
    if (open) {
      const lastCompany = (() => { try { return localStorage.getItem("cdm_pdf_last_company") || "all"; } catch { return "all"; } })();
      setPdfCompanyFilter(lastCompany);
    }
    pdfGeneratingRef.current = false;
    setShowPdfFilterDialog(open);
  };

  useEffect(() => {
    const filters = loadPdfFilters(pdfCompanyFilter);
    setPdfStatusFilter(filters.status);
    setPdfFromDate(filters.fromDate);
    setPdfToDate(filters.toDate);
  }, [pdfCompanyFilter]);

  useEffect(() => {
    try {
      const key = pdfCompanyFilter && pdfCompanyFilter !== "all" ? `cdm_pdf_filter_${pdfCompanyFilter}` : "cdm_pdf_filter_all";
      const isDefault = (pdfStatusFilter === "all" || !pdfStatusFilter) && !pdfFromDate && !pdfToDate && (!pdfCompanyFilter || pdfCompanyFilter === "all");
      if (isDefault) {
        localStorage.removeItem(key);
      } else {
        localStorage.setItem(
          key,
          JSON.stringify({ status: pdfStatusFilter, fromDate: pdfFromDate, toDate: pdfToDate, companyId: pdfCompanyFilter })
        );
      }
    } catch {}
  }, [pdfCompanyFilter, pdfStatusFilter, pdfFromDate, pdfToDate]);

  const emptyForm = {
    companyId: "",
    title: "",
    description: "",
    location: "",
    clientName: "",
    contractorRole: "contractor",
    principalDesignerName: "",
    status: "planning",
    startDate: "",
    endDate: "",
    estimatedDays: "",
    peakWorkers: "",
    personDays: "",
    f10Status: "not_required",
    f10Date: "",
    f10Reference: "",
    f10Notes: "",
    cppStatus: "not_prepared",
    cppDate: "",
    cppNotes: "",
    pciStatus: "not_prepared",
    pciDate: "",
    pciNotes: "",
    hsfStatus: "not_started",
    hsfDate: "",
    hsfNotes: "",
    welfareToilets: false,
    welfareWashing: false,
    welfareRestArea: false,
    welfareDrinkingWater: false,
    welfareChanging: false,
    notes: "",
  };

  const [form, setForm] = useState(emptyForm);

  const { data: allProjects = [], isLoading } = useQuery<CdmProject[]>({
    queryKey: ["/api/cdm/projects", customerId],
    enabled: !!customerId,
  });

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/cdm/projects", data);
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cdm/projects", customerId] });
      setShowAddDialog(false);
      setAddStep(1);
      setForm(emptyForm);
      toast({ title: "CDM Project created" });
    },
    onError: () => toast({ title: "Error", description: "Failed to create CDM project", variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const res = await apiRequest("PATCH", `/api/cdm/projects/${id}`, data);
      return await res.json();
    },
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ["/api/cdm/projects", customerId] });
      setSelectedProject(updated);
      setEditingProject(null);
      toast({ title: "CDM Project updated" });
    },
    onError: () => toast({ title: "Error", description: "Failed to update CDM project", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => apiRequest("DELETE", `/api/cdm/projects/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cdm/projects", customerId] });
      setSelectedProject(null);
      toast({ title: "CDM Project deleted" });
    },
    onError: () => toast({ title: "Error", description: "Failed to delete CDM project", variant: "destructive" }),
  });

  const filtered = allProjects.filter(p => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      p.title.toLowerCase().includes(q) ||
      (p.clientName ?? "").toLowerCase().includes(q) ||
      (p.location ?? "").toLowerCase().includes(q)
    );
  });

  const totalActive = allProjects.filter(p => p.status === "active").length;
  const totalF10 = allProjects.filter(p => isNotifiable(p)).length;
  const totalOverdue = allProjects.filter(isF10Overdue).length;

  // Summary-panel filtered projects — independent of the project list search
  const summaryFromMs = summaryFromDate ? new Date(summaryFromDate).getTime() : null;
  const summaryToMs = summaryToDate ? new Date(summaryToDate).getTime() : null;
  const summaryProjects = allProjects.filter(p => {
    if (summaryStatusFilter !== "all" && p.status !== summaryStatusFilter) return false;
    if (summaryContractorFilter !== "all" && String(p.companyId) !== summaryContractorFilter) return false;
    if (summaryFromMs !== null || summaryToMs !== null) {
      if (!p.startDate) return false;
      const pMs = new Date(p.startDate).getTime();
      if (isNaN(pMs)) return false;
      if (summaryFromMs !== null && pMs < summaryFromMs) return false;
      if (summaryToMs !== null && pMs > summaryToMs) return false;
    }
    return true;
  });
  const summaryFiltersActive =
    summaryStatusFilter !== "all" || summaryFromDate !== "" || summaryToDate !== "" || summaryContractorFilter !== "all";

  // Compliance summary derived data (uses summaryProjects)
  const statusCounts = {
    planning: summaryProjects.filter(p => p.status === "planning").length,
    active: summaryProjects.filter(p => p.status === "active").length,
    complete: summaryProjects.filter(p => p.status === "complete").length,
    cancelled: summaryProjects.filter(p => p.status === "cancelled").length,
  };
  const notifiableProjects = summaryProjects.filter(isNotifiable);
  const f10Counts = {
    required: notifiableProjects.filter(p => p.f10Status !== "submitted" && p.f10Status !== "pending").length,
    pending: notifiableProjects.filter(p => p.f10Status === "pending").length,
    submitted: notifiableProjects.filter(p => p.f10Status === "submitted").length,
  };
  const summaryOverdue = summaryProjects.filter(isF10Overdue).length;
  // Exclude cancelled projects from compliance scoring
  const nonCancelledSummary = summaryProjects.filter(p => p.status !== "cancelled");
  // Per-contractor compliance table (excludes cancelled projects)
  const knownCompanyIds = new Set(companies.map(c => c.id));
  const contractorCompliance: { id: string; name: string; projectCount: number; avgPct: number; overdueCount: number }[] = [];
  companies.forEach(company => {
    const projects = nonCancelledSummary.filter(p => p.companyId === company.id);
    if (projects.length === 0) return;
    const avgScore = projects.reduce((sum, p) => sum + complianceScore(p), 0) / projects.length;
    const avgPct = Math.round((avgScore / 5) * 100);
    const overdueCount = projects.filter(isF10Overdue).length;
    contractorCompliance.push({ id: company.id, name: company.name, projectCount: projects.length, avgPct, overdueCount });
  });
  // Fallback row for projects whose company no longer exists in the list
  const orphanProjects = nonCancelledSummary.filter(p => !knownCompanyIds.has(p.companyId));
  if (orphanProjects.length > 0) {
    const avgScore = orphanProjects.reduce((sum, p) => sum + complianceScore(p), 0) / orphanProjects.length;
    const avgPct = Math.round((avgScore / 5) * 100);
    const overdueCount = orphanProjects.filter(isF10Overdue).length;
    contractorCompliance.push({ id: "__unknown__", name: "Unknown Contractor", projectCount: orphanProjects.length, avgPct, overdueCount });
  }

  // Compliance trend: fixed 12-month window ending at the current month (excludes cancelled)
  const complianceTrend = useMemo(() => {
    const monthMap: Record<string, { total: number; count: number }> = {};
    allProjects.filter(p => p.status !== "cancelled").forEach(p => {
      if (!p.startDate) return;
      const d = new Date(p.startDate);
      if (isNaN(d.getTime())) return;
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      if (!monthMap[key]) monthMap[key] = { total: 0, count: 0 };
      monthMap[key].total += complianceScore(p);
      monthMap[key].count++;
    });
    // Always show the last 12 calendar months ending with the current month
    const today = new Date();
    const result: { month: string; score: number | null; count: number }[] = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const label = d.toLocaleString("default", { month: "short", year: "2-digit" });
      const entry = monthMap[key];
      result.push({
        month: label,
        score: entry ? Math.round((entry.total / entry.count / 5) * 100) : null,
        count: entry ? entry.count : 0,
      });
    }
    return result;
  }, [allProjects]);

  const openEdit = (p: CdmProject) => {
    setForm({
      companyId: p.companyId,
      title: p.title,
      description: p.description ?? "",
      location: p.location ?? "",
      clientName: p.clientName ?? "",
      contractorRole: p.contractorRole,
      principalDesignerName: p.principalDesignerName ?? "",
      status: p.status,
      startDate: p.startDate ?? "",
      endDate: p.endDate ?? "",
      estimatedDays: p.estimatedDays?.toString() ?? "",
      peakWorkers: p.peakWorkers?.toString() ?? "",
      personDays: p.personDays?.toString() ?? "",
      f10Status: p.f10Status ?? "not_required",
      f10Date: p.f10Date ?? "",
      f10Reference: p.f10Reference ?? "",
      f10Notes: p.f10Notes ?? "",
      cppStatus: p.cppStatus ?? "not_prepared",
      cppDate: p.cppDate ?? "",
      cppNotes: p.cppNotes ?? "",
      pciStatus: p.pciStatus ?? "not_prepared",
      pciDate: p.pciDate ?? "",
      pciNotes: p.pciNotes ?? "",
      hsfStatus: p.hsfStatus ?? "not_started",
      hsfDate: p.hsfDate ?? "",
      hsfNotes: p.hsfNotes ?? "",
      welfareToilets: p.welfareToilets ?? false,
      welfareWashing: p.welfareWashing ?? false,
      welfareRestArea: p.welfareRestArea ?? false,
      welfareDrinkingWater: p.welfareDrinkingWater ?? false,
      welfareChanging: p.welfareChanging ?? false,
      notes: p.notes ?? "",
    });
    setEditingProject(p);
  };

  if (isLoading) return <GlassCard className="p-8 text-center text-muted-foreground">Loading CDM projects…</GlassCard>;

  return (
    <div className="space-y-4">
      {/* Stats bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Total Projects", value: allProjects.length, color: "text-slate-700 dark:text-slate-200" },
          { label: "Active", value: totalActive, color: "text-green-700 dark:text-green-400" },
          { label: "F10 Required", value: totalF10, color: "text-amber-700 dark:text-amber-400" },
          { label: "Overdue", value: totalOverdue, color: "text-red-700 dark:text-red-400" },
        ].map(s => (
          <GlassCard key={s.label} className="p-4 text-center">
            <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
            <p className="text-xs text-muted-foreground mt-1">{s.label}</p>
          </GlassCard>
        ))}
      </div>

      {/* Compliance Summary Panel */}
      {allProjects.length > 0 && (
        <GlassCard className="overflow-hidden">
          <button
            className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/30 transition-colors"
            onClick={() => setShowComplianceSummary(v => !v)}
          >
            <div className="flex items-center gap-2">
              <Shield className="h-4 w-4 text-primary" />
              <span className="font-semibold text-sm text-fixed">Compliance Summary</span>
              <span className="text-xs text-muted-foreground">Portfolio health overview</span>
              {summaryFiltersActive && (
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4">Filtered</Badge>
              )}
            </div>
            <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${showComplianceSummary ? "rotate-180" : ""}`} />
          </button>
          {showComplianceSummary && (
            <div className="px-4 pb-4 space-y-4 border-t border-border">
              {/* Filter controls */}
              <div className="flex flex-wrap items-end gap-2 pt-3">
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Contractor</label>
                  <Select value={summaryContractorFilter} onValueChange={setSummaryContractorFilter}>
                    <SelectTrigger className="h-7 text-xs w-40">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All contractors</SelectItem>
                      {companies.map(c => (
                        <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Status</label>
                  <Select value={summaryStatusFilter} onValueChange={setSummaryStatusFilter}>
                    <SelectTrigger className="h-7 text-xs w-32">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All statuses</SelectItem>
                      <SelectItem value="planning">Planning</SelectItem>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="complete">Complete</SelectItem>
                      <SelectItem value="cancelled">Cancelled</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Start date from</label>
                  <input
                    type="date"
                    className="h-7 px-2 text-xs rounded-md border border-input bg-background focus:outline-none focus:ring-1 focus:ring-ring"
                    value={summaryFromDate}
                    onChange={e => setSummaryFromDate(e.target.value)}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Start date to</label>
                  <input
                    type="date"
                    className="h-7 px-2 text-xs rounded-md border border-input bg-background focus:outline-none focus:ring-1 focus:ring-ring"
                    value={summaryToDate}
                    onChange={e => setSummaryToDate(e.target.value)}
                  />
                </div>
                {summaryFiltersActive && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs px-2 text-muted-foreground"
                    onClick={() => { setSummaryStatusFilter("all"); setSummaryFromDate(""); setSummaryToDate(""); setSummaryContractorFilter("all"); }}
                  >
                    Clear filters
                  </Button>
                )}
                <span className="text-xs text-muted-foreground ml-auto self-end pb-0.5">
                  {summaryProjects.length} of {allProjects.length} project{allProjects.length !== 1 ? "s" : ""}
                </span>
              </div>
              {summaryProjects.length === 0 && summaryFiltersActive ? (
                <p className="text-xs text-muted-foreground text-center py-4">No projects match the selected filters.</p>
              ) : (
              <>
              {/* Overall Compliance Score — matches PDF formula exactly:
                  CPP/PCI/HSF document completion; 3 docs per project */}
              {nonCancelledSummary.length === 0 && summaryProjects.length > 0 && (
                <p className="text-xs text-muted-foreground text-center py-2">All selected projects are cancelled — no compliance score to display.</p>
              )}
              {nonCancelledSummary.length > 0 && (() => {
                const compliantDocs = nonCancelledSummary.reduce((sum, p) => {
                  let c = 0;
                  if (["approved", "prepared", "distributed"].includes(p.cppStatus ?? "")) c++;
                  if (["approved", "prepared", "distributed"].includes(p.pciStatus ?? "")) c++;
                  if (["complete", "handed_over"].includes(p.hsfStatus ?? "")) c++;
                  return sum + c;
                }, 0);
                const totalDocs = nonCancelledSummary.length * 3;
                const overallPct = totalDocs > 0 ? Math.round((compliantDocs / totalDocs) * 100) : 0;
                const colorClass = overallPct >= 80
                  ? "bg-green-50 border-green-200 dark:bg-green-950/30 dark:border-green-800"
                  : overallPct >= 50
                  ? "bg-amber-50 border-amber-200 dark:bg-amber-950/30 dark:border-amber-800"
                  : "bg-red-50 border-red-200 dark:bg-red-950/30 dark:border-red-800";
                const textClass = overallPct >= 80
                  ? "text-green-700 dark:text-green-400"
                  : overallPct >= 50
                  ? "text-amber-700 dark:text-amber-400"
                  : "text-red-700 dark:text-red-400";
                const label = overallPct >= 80 ? "High Compliance" : overallPct >= 50 ? "Partial Compliance" : "Low Compliance";
                return (
                  <div className={`flex items-center justify-between rounded-lg border px-4 py-3 ${colorClass}`}>
                    <div className="flex items-center gap-2">
                      <Shield className={`h-5 w-5 ${textClass}`} />
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Overall Compliance Score</p>
                        <p className="text-xs text-muted-foreground">
                          CPP · PCI · HSF across {nonCancelledSummary.length} project{nonCancelledSummary.length !== 1 ? "s" : ""}
                          {summaryFiltersActive ? " (filtered)" : ""} · excl. cancelled
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className={`text-3xl font-bold tabular-nums ${textClass}`}>{overallPct}%</span>
                      <p className={`text-xs font-medium ${textClass}`}>{label}</p>
                    </div>
                  </div>
                );
              })()}

              {/* Status breakdown + F10 counts */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Project status breakdown */}
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Projects by Status</p>
                  <div className="space-y-1.5">
                    {([ 
                      { key: "planning", label: "Planning", color: "bg-blue-500", textColor: "text-blue-700 dark:text-blue-400" },
                      { key: "active", label: "Active", color: "bg-green-500", textColor: "text-green-700 dark:text-green-400" },
                      { key: "complete", label: "Complete", color: "bg-slate-500", textColor: "text-slate-700 dark:text-slate-300" },
                      { key: "cancelled", label: "Cancelled", color: "bg-red-400", textColor: "text-red-700 dark:text-red-400" },
                    ] as const).map(({ key, label, color, textColor }) => {
                      const count = statusCounts[key];
                      const pct = summaryProjects.length > 0 ? Math.round((count / summaryProjects.length) * 100) : 0;
                      return (
                        <div key={key} className="flex items-center gap-2">
                          <span className="text-xs w-16 text-muted-foreground">{label}</span>
                          <div className="flex-1 h-2 rounded-full bg-muted/40 overflow-hidden">
                            <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
                          </div>
                          <span className={`text-xs font-semibold w-6 text-right ${textColor}`}>{count}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
                {/* F10 notification breakdown */}
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">F10 Notifications</p>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 p-2 text-center">
                      <p className="text-lg font-bold text-amber-700 dark:text-amber-400">{f10Counts.required}</p>
                      <p className="text-[10px] text-amber-600 dark:text-amber-500 leading-tight">Required / Not Submitted</p>
                    </div>
                    <div className="rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 p-2 text-center">
                      <p className="text-lg font-bold text-blue-700 dark:text-blue-400">{f10Counts.pending}</p>
                      <p className="text-[10px] text-blue-600 dark:text-blue-500 leading-tight">Pending</p>
                    </div>
                    <div className="rounded-lg bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 p-2 text-center">
                      <p className="text-lg font-bold text-green-700 dark:text-green-400">{f10Counts.submitted}</p>
                      <p className="text-[10px] text-green-600 dark:text-green-500 leading-tight">Submitted</p>
                    </div>
                  </div>
                  {summaryOverdue > 0 && (
                    <div className="mt-2 flex items-center gap-1.5 text-xs text-red-600 dark:text-red-400 font-medium">
                      <AlertTriangle className="h-3.5 w-3.5" />
                      {summaryOverdue} project{summaryOverdue !== 1 ? "s" : ""} with overdue F10
                    </div>
                  )}
                </div>
              </div>
              {/* Per-contractor compliance table */}
              {contractorCompliance.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Compliance by Contractor</p>
                  <p className="text-[10px] text-muted-foreground mb-2">Cancelled projects excluded</p>
                  <div className="rounded-lg border border-border overflow-hidden">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-muted/30 text-muted-foreground">
                          <th className="text-left px-3 py-2 font-medium">Contractor</th>
                          <th className="text-center px-3 py-2 font-medium">Projects</th>
                          <th className="text-left px-3 py-2 font-medium">Avg Compliance</th>
                          <th className="text-center px-3 py-2 font-medium">F10 Overdue</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {contractorCompliance.map(row => (
                          <tr key={row.id} className="hover:bg-muted/20 transition-colors">
                            <td className="px-3 py-2 font-medium text-fixed truncate max-w-[160px]">{row.name}</td>
                            <td className="px-3 py-2 text-center text-muted-foreground">{row.projectCount}</td>
                            <td className="px-3 py-2">
                              <div className="flex items-center gap-2">
                                <div className="flex-1 h-1.5 rounded-full bg-muted/40 overflow-hidden">
                                  <div
                                    className={`h-full rounded-full ${row.avgPct >= 80 ? "bg-green-500" : row.avgPct >= 50 ? "bg-amber-500" : "bg-red-500"}`}
                                    style={{ width: `${row.avgPct}%` }}
                                  />
                                </div>
                                <span className={`font-semibold w-8 text-right ${row.avgPct >= 80 ? "text-green-700 dark:text-green-400" : row.avgPct >= 50 ? "text-amber-700 dark:text-amber-400" : "text-red-700 dark:text-red-400"}`}>
                                  {row.avgPct}%
                                </span>
                              </div>
                            </td>
                            <td className="px-3 py-2 text-center">
                              {row.overdueCount > 0 ? (
                                <span className="inline-flex items-center gap-0.5 text-red-600 dark:text-red-400 font-semibold">
                                  <AlertTriangle className="h-3 w-3" />{row.overdueCount}
                                </span>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
              {/* Compliance trend chart — only shown when at least one month has data */}
              {complianceTrend.some(m => m.score !== null) && (
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Compliance Trend</p>
                  <div className="h-32">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={complianceTrend} margin={{ top: 4, right: 4, left: -28, bottom: 0 }} barCategoryGap="30%">
                        <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-muted/40" />
                        <XAxis dataKey="month" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                        <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={v => `${v}%`} />
                        <Tooltip
                          formatter={(value: number | null, _name: string, item: { payload?: { count?: number } }) => {
                            if (value === null) return ["No projects", "Avg Compliance"];
                            const n = item.payload?.count ?? 0;
                            return [`${value}% (${n} project${n !== 1 ? "s" : ""})`, "Avg Compliance"];
                          }}
                          contentStyle={{ fontSize: 12, borderRadius: 6 }}
                          cursor={{ fill: "hsl(var(--muted)/0.3)" }}
                        />
                        <Bar
                          dataKey="score"
                          radius={[3, 3, 0, 0]}
                          fill="hsl(var(--primary))"
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-1 text-center">Average compliance % by project start month (last 12 months) · excl. cancelled</p>
                </div>
              )}
              </>
              )}
            </div>
          )}
        </GlassCard>
      )}

      {/* Header row */}
      <GlassCard className="p-4">
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <HardHatIcon className="h-5 w-5 text-amber-600" />
              <h3 className="font-semibold text-fixed">CDM 2015 Project Register</h3>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">Construction Design & Management Regulations 2015</p>
          </div>
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <div className="relative flex-1 sm:w-64">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <input
                className="w-full h-8 pl-8 pr-3 text-xs rounded-md border border-input bg-background focus:outline-none focus:ring-1 focus:ring-ring"
                placeholder="Search projects…"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
            <div className="relative inline-flex">
              <Button
                size="sm"
                variant="outline"
                className="whitespace-nowrap"
                onClick={() => setShowPdfFilterDialog(true)}
              >
                <Download className="h-3.5 w-3.5 mr-1" />Export PDF
              </Button>
              {((pdfStatusFilter && pdfStatusFilter !== "all") || pdfFromDate || pdfToDate) && (
                <span className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-amber-500 border border-white dark:border-gray-900" />
              )}
            </div>
            <Button size="sm" onClick={() => { setForm(emptyForm); setAddStep(1); setShowAddDialog(true); }} className="bg-amber-600 hover:bg-amber-700 text-white whitespace-nowrap">
              <Plus className="h-3.5 w-3.5 mr-1" />Add Project
            </Button>
          </div>
        </div>
      </GlassCard>

      {/* Project list */}
      {filtered.length === 0 ? (
        <GlassCard className="p-12 text-center">
          <HardHatIcon className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-sm font-medium text-muted-foreground">
            {search ? "No projects match your search." : "No CDM projects recorded yet."}
          </p>
          <p className="text-xs text-muted-foreground mt-1">Add a project to start tracking CDM 2015 compliance.</p>
        </GlassCard>
      ) : (
        <div className="space-y-2">
          {filtered.map(p => {
            const badge = CDM_STATUS_BADGE[p.status] ?? { label: p.status, className: "bg-gray-100 text-gray-700" };
            const overdue = isF10Overdue(p);
            const notifiable = isNotifiable(p);
            const score = complianceScore(p);
            const scorePct = Math.round((score / 5) * 100);
            const companyName = companies.find(c => c.id === p.companyId)?.name ?? "Unknown Company";
            return (
              <GlassCard
                key={p.id}
                className={`p-4 cursor-pointer hover:shadow-md transition-shadow ${overdue ? "border-red-300 dark:border-red-700" : ""}`}
                onClick={() => setSelectedProject(selectedProject?.id === p.id ? null : p)}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm text-fixed">{p.title}</span>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${badge.className}`}>{badge.label}</span>
                      {notifiable && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
                          <AlertCircle className="h-3 w-3" />F10
                        </span>
                      )}
                      {overdue && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300">
                          <AlertTriangle className="h-3 w-3" />F10 Overdue
                        </span>
                      )}
                      {p.f10AlertSentAt && overdue && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
                          <AlertCircle className="h-3 w-3" />Alert Sent
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-1.5 flex-wrap text-xs text-muted-foreground">
                      <span className="flex items-center gap-1"><Building2 className="h-3 w-3" />{companyName}</span>
                      {p.location && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{p.location}</span>}
                      {p.clientName && <span className="flex items-center gap-1"><User className="h-3 w-3" />Client: {p.clientName}</span>}
                      <span className="flex items-center gap-1"><HardHatIcon className="h-3 w-3" />{CDM_ROLE_LABELS[p.contractorRole] ?? p.contractorRole}</span>
                      {p.startDate && <span className="flex items-center gap-1"><CalendarDays className="h-3 w-3" />Start: {p.startDate}</span>}
                      {p.endDate && <span className="flex items-center gap-1"><CalendarDays className="h-3 w-3" />End: {p.endDate}</span>}
                    </div>
                  </div>
                  {/* Compliance ring */}
                  <div className="flex-shrink-0 flex flex-col items-center gap-0.5">
                    <div className="relative h-10 w-10">
                      <svg className="h-10 w-10 -rotate-90" viewBox="0 0 36 36">
                        <circle cx="18" cy="18" r="15.9" fill="none" stroke="currentColor" strokeWidth="3" className="text-muted/20" />
                        <circle cx="18" cy="18" r="15.9" fill="none" stroke="currentColor" strokeWidth="3" strokeDasharray={`${scorePct} ${100 - scorePct}`} strokeDashoffset="0" className={score === 5 ? "text-green-500" : score >= 3 ? "text-amber-500" : "text-red-500"} />
                      </svg>
                      <span className="absolute inset-0 flex items-center justify-center text-[9px] font-bold">{score}/5</span>
                    </div>
                    <ChevronDown className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${selectedProject?.id === p.id ? "rotate-180" : ""}`} />
                  </div>
                </div>

                {/* Expanded detail panel */}
                {selectedProject?.id === p.id && (
                  <div className="mt-4 pt-4 border-t border-border space-y-4" onClick={e => e.stopPropagation()}>
                    {/* Compliance summary */}
                    <div className={`rounded-lg p-3 text-xs font-semibold flex items-center gap-2 ${score === 5 ? "bg-green-50 text-green-800 dark:bg-green-950/30 dark:text-green-300 border border-green-200 dark:border-green-800" : "bg-amber-50 text-amber-800 dark:bg-amber-950/30 dark:text-amber-300 border border-amber-200 dark:border-amber-800"}`}>
                      {score === 5 ? <CheckCircle className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
                      Compliance score: {score} / 5 sections complete — {scorePct}%
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-sm">
                      {p.estimatedDays && <div><span className="text-muted-foreground text-xs">Duration:</span><p className="font-medium">{p.estimatedDays} days</p></div>}
                      {p.peakWorkers && <div><span className="text-muted-foreground text-xs">Peak Workers:</span><p className="font-medium">{p.peakWorkers}</p></div>}
                      {p.personDays && <div><span className="text-muted-foreground text-xs">Person-Days:</span><p className="font-medium">{p.personDays}</p></div>}
                    </div>

                    {/* Five compliance sections — inline editable */}
                    <div className="space-y-2">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Compliance Sections</p>

                      {/* S1 — F10 */}
                      {(() => {
                        const sec = "f10";
                        const isEditing = editingSection === `${p.id}-${sec}`;
                        const draft = sectionDraft;
                        return (
                          <div className="rounded-md border border-border p-3 space-y-1">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-semibold flex items-center gap-1.5"><AlertCircle className="h-3.5 w-3.5 text-amber-600" />1. F10 HSE Notification</span>
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${p.f10Status === "submitted" ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300" : p.f10Status === "pending" ? "bg-amber-100 text-amber-700" : notifiable ? "bg-red-100 text-red-700" : "bg-slate-100 text-slate-600"}`}>
                                  {p.f10Status === "submitted" ? "Submitted" : p.f10Status === "pending" ? "Pending" : notifiable ? "Required — Not Submitted" : "Not Required"}
                                </span>
                                {p.f10AlertSentAt && overdue && (
                                  <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
                                    <AlertCircle className="h-3 w-3" />Alert Sent
                                  </span>
                                )}
                                <Button size="sm" variant="ghost" className="h-6 px-1.5 text-xs" onClick={() => { setEditingSection(isEditing ? null : `${p.id}-${sec}`); setSectionDraft({ f10Status: p.f10Status ?? "not_required", f10Date: p.f10Date ?? "", f10Reference: p.f10Reference ?? "", f10Notes: p.f10Notes ?? "" }); }}>
                                  {isEditing ? "Cancel" : <><Edit className="h-3 w-3 mr-0.5" />Edit</>}
                                </Button>
                              </div>
                            </div>
                            {!isEditing && (
                              <>
                                {p.f10Status === "submitted" && <p className="text-xs text-muted-foreground">Submitted: {p.f10Date ?? "—"}{p.f10Reference ? ` · Ref: ${p.f10Reference}` : ""}</p>}
                                {overdue && <p className="text-xs text-red-600 font-medium flex items-center gap-1"><AlertTriangle className="h-3 w-3" />F10 overdue — project has started</p>}
                                {p.f10AlertSentAt && (
                                  <p className="text-xs text-amber-700 dark:text-amber-400 font-medium flex items-center gap-1">
                                    <AlertCircle className="h-3 w-3" />Last F10 alert sent: {new Date(p.f10AlertSentAt).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}
                                  </p>
                                )}
                                {p.f10Notes && <p className="text-xs text-muted-foreground italic">"{p.f10Notes}"</p>}
                              </>
                            )}
                            {isEditing && (
                              <div className="space-y-2 pt-1">
                                <div className="grid grid-cols-2 gap-2">
                                  <div><label className="text-xs text-muted-foreground">Status</label>
                                    <select className="w-full h-8 px-2 rounded border border-input bg-background text-xs" value={draft.f10Status} onChange={e => setSectionDraft({...draft, f10Status: e.target.value})}>
                                      <option value="not_required">Not Required</option>
                                      <option value="pending">Pending</option>
                                      <option value="submitted">Submitted</option>
                                    </select>
                                  </div>
                                  <div><label className="text-xs text-muted-foreground">Date Submitted</label>
                                    <input type="date" className="w-full h-8 px-2 rounded border border-input bg-background text-xs" value={draft.f10Date} onChange={e => setSectionDraft({...draft, f10Date: e.target.value})} />
                                  </div>
                                </div>
                                <div><label className="text-xs text-muted-foreground">HSE Reference</label>
                                  <input className="w-full h-8 px-2 rounded border border-input bg-background text-xs" value={draft.f10Reference} onChange={e => setSectionDraft({...draft, f10Reference: e.target.value})} placeholder="F10 reference number" />
                                </div>
                                <div><label className="text-xs text-muted-foreground">Notes</label>
                                  <textarea className="w-full px-2 py-1 rounded border border-input bg-background text-xs resize-none" rows={2} value={draft.f10Notes} onChange={e => setSectionDraft({...draft, f10Notes: e.target.value})} />
                                </div>
                                <Button size="sm" className="h-7 text-xs" disabled={updateMutation.isPending} onClick={() => { updateMutation.mutate({ id: p.id, data: { f10Status: draft.f10Status, f10Date: draft.f10Date || null, f10Reference: draft.f10Reference || null, f10Notes: draft.f10Notes || null } }); setEditingSection(null); }}>
                                  {updateMutation.isPending ? "Saving…" : "Save Section"}
                                </Button>
                              </div>
                            )}
                          </div>
                        );
                      })()}

                      {/* S2 — CPP */}
                      {(() => {
                        const sec = "cpp";
                        const isEditing = editingSection === `${p.id}-${sec}`;
                        const draft = sectionDraft;
                        return (
                          <div className="rounded-md border border-border p-3 space-y-1">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-semibold flex items-center gap-1.5"><ClipboardList className="h-3.5 w-3.5 text-blue-600" />2. Construction Phase Plan</span>
                              <div className="flex items-center gap-1.5">
                                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${p.cppStatus === "approved" ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300" : p.cppStatus === "in_progress" ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-600"}`}>
                                  {p.cppStatus === "approved" ? "Approved" : p.cppStatus === "in_progress" ? "In Progress" : "Not Prepared"}
                                </span>
                                <Button size="sm" variant="ghost" className="h-6 px-1.5 text-xs" onClick={() => { setEditingSection(isEditing ? null : `${p.id}-${sec}`); setSectionDraft({ cppStatus: p.cppStatus ?? "not_prepared", cppDate: p.cppDate ?? "", cppNotes: p.cppNotes ?? "" }); }}>
                                  {isEditing ? "Cancel" : <><Edit className="h-3 w-3 mr-0.5" />Edit</>}
                                </Button>
                              </div>
                            </div>
                            {!isEditing && (
                              <>
                                {p.cppDate && <p className="text-xs text-muted-foreground">Date: {p.cppDate}</p>}
                                {p.cppNotes && <p className="text-xs text-muted-foreground italic">"{p.cppNotes}"</p>}
                              </>
                            )}
                            {isEditing && (
                              <div className="space-y-2 pt-1">
                                <div className="grid grid-cols-2 gap-2">
                                  <div><label className="text-xs text-muted-foreground">Status</label>
                                    <select className="w-full h-8 px-2 rounded border border-input bg-background text-xs" value={draft.cppStatus} onChange={e => setSectionDraft({...draft, cppStatus: e.target.value})}>
                                      <option value="not_prepared">Not Prepared</option>
                                      <option value="in_progress">In Progress</option>
                                      <option value="approved">Approved</option>
                                    </select>
                                  </div>
                                  <div><label className="text-xs text-muted-foreground">Date Approved</label>
                                    <input type="date" className="w-full h-8 px-2 rounded border border-input bg-background text-xs" value={draft.cppDate} onChange={e => setSectionDraft({...draft, cppDate: e.target.value})} />
                                  </div>
                                </div>
                                <div><label className="text-xs text-muted-foreground">Notes</label>
                                  <textarea className="w-full px-2 py-1 rounded border border-input bg-background text-xs resize-none" rows={2} value={draft.cppNotes} onChange={e => setSectionDraft({...draft, cppNotes: e.target.value})} />
                                </div>
                                <Button size="sm" className="h-7 text-xs" disabled={updateMutation.isPending} onClick={() => { updateMutation.mutate({ id: p.id, data: { cppStatus: draft.cppStatus, cppDate: draft.cppDate || null, cppNotes: draft.cppNotes || null } }); setEditingSection(null); }}>
                                  {updateMutation.isPending ? "Saving…" : "Save Section"}
                                </Button>
                              </div>
                            )}
                          </div>
                        );
                      })()}

                      {/* S3 — PCI */}
                      {(() => {
                        const sec = "pci";
                        const isEditing = editingSection === `${p.id}-${sec}`;
                        const draft = sectionDraft;
                        return (
                          <div className="rounded-md border border-border p-3 space-y-1">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-semibold flex items-center gap-1.5"><ClipboardList className="h-3.5 w-3.5 text-purple-600" />3. Pre-Construction Information</span>
                              <div className="flex items-center gap-1.5">
                                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${p.pciStatus === "distributed" ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300" : p.pciStatus === "prepared" ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-600"}`}>
                                  {p.pciStatus === "distributed" ? "Distributed" : p.pciStatus === "prepared" ? "Prepared" : "Not Prepared"}
                                </span>
                                <Button size="sm" variant="ghost" className="h-6 px-1.5 text-xs" onClick={() => { setEditingSection(isEditing ? null : `${p.id}-${sec}`); setSectionDraft({ pciStatus: p.pciStatus ?? "not_prepared", pciDate: p.pciDate ?? "", pciNotes: p.pciNotes ?? "" }); }}>
                                  {isEditing ? "Cancel" : <><Edit className="h-3 w-3 mr-0.5" />Edit</>}
                                </Button>
                              </div>
                            </div>
                            {!isEditing && (
                              <>
                                {p.pciDate && <p className="text-xs text-muted-foreground">Date: {p.pciDate}</p>}
                                {p.pciNotes && <p className="text-xs text-muted-foreground italic">"{p.pciNotes}"</p>}
                              </>
                            )}
                            {isEditing && (
                              <div className="space-y-2 pt-1">
                                <div className="grid grid-cols-2 gap-2">
                                  <div><label className="text-xs text-muted-foreground">Status</label>
                                    <select className="w-full h-8 px-2 rounded border border-input bg-background text-xs" value={draft.pciStatus} onChange={e => setSectionDraft({...draft, pciStatus: e.target.value})}>
                                      <option value="not_prepared">Not Prepared</option>
                                      <option value="prepared">Prepared</option>
                                      <option value="distributed">Distributed</option>
                                    </select>
                                  </div>
                                  <div><label className="text-xs text-muted-foreground">Date Distributed</label>
                                    <input type="date" className="w-full h-8 px-2 rounded border border-input bg-background text-xs" value={draft.pciDate} onChange={e => setSectionDraft({...draft, pciDate: e.target.value})} />
                                  </div>
                                </div>
                                <div><label className="text-xs text-muted-foreground">Notes</label>
                                  <textarea className="w-full px-2 py-1 rounded border border-input bg-background text-xs resize-none" rows={2} value={draft.pciNotes} onChange={e => setSectionDraft({...draft, pciNotes: e.target.value})} />
                                </div>
                                <Button size="sm" className="h-7 text-xs" disabled={updateMutation.isPending} onClick={() => { updateMutation.mutate({ id: p.id, data: { pciStatus: draft.pciStatus, pciDate: draft.pciDate || null, pciNotes: draft.pciNotes || null } }); setEditingSection(null); }}>
                                  {updateMutation.isPending ? "Saving…" : "Save Section"}
                                </Button>
                              </div>
                            )}
                          </div>
                        );
                      })()}

                      {/* S4 — HSF */}
                      {(() => {
                        const sec = "hsf";
                        const isEditing = editingSection === `${p.id}-${sec}`;
                        const draft = sectionDraft;
                        return (
                          <div className="rounded-md border border-border p-3 space-y-1">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-semibold flex items-center gap-1.5"><ClipboardList className="h-3.5 w-3.5 text-indigo-600" />4. Health & Safety File</span>
                              <div className="flex items-center gap-1.5">
                                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${(p.hsfStatus === "complete" || p.hsfStatus === "handed_over") ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300" : p.hsfStatus === "in_progress" ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-600"}`}>
                                  {p.hsfStatus === "handed_over" ? "Handed Over" : p.hsfStatus === "complete" ? "Complete" : p.hsfStatus === "in_progress" ? "In Progress" : "Not Started"}
                                </span>
                                <Button size="sm" variant="ghost" className="h-6 px-1.5 text-xs" onClick={() => { setEditingSection(isEditing ? null : `${p.id}-${sec}`); setSectionDraft({ hsfStatus: p.hsfStatus ?? "not_started", hsfDate: p.hsfDate ?? "", hsfNotes: p.hsfNotes ?? "" }); }}>
                                  {isEditing ? "Cancel" : <><Edit className="h-3 w-3 mr-0.5" />Edit</>}
                                </Button>
                              </div>
                            </div>
                            {!isEditing && (
                              <>
                                {p.hsfDate && <p className="text-xs text-muted-foreground">Date: {p.hsfDate}</p>}
                                {p.hsfNotes && <p className="text-xs text-muted-foreground italic">"{p.hsfNotes}"</p>}
                              </>
                            )}
                            {isEditing && (
                              <div className="space-y-2 pt-1">
                                <div className="grid grid-cols-2 gap-2">
                                  <div><label className="text-xs text-muted-foreground">Status</label>
                                    <select className="w-full h-8 px-2 rounded border border-input bg-background text-xs" value={draft.hsfStatus} onChange={e => setSectionDraft({...draft, hsfStatus: e.target.value})}>
                                      <option value="not_started">Not Started</option>
                                      <option value="in_progress">In Progress</option>
                                      <option value="complete">Complete</option>
                                      <option value="handed_over">Handed Over</option>
                                    </select>
                                  </div>
                                  <div><label className="text-xs text-muted-foreground">Date Completed</label>
                                    <input type="date" className="w-full h-8 px-2 rounded border border-input bg-background text-xs" value={draft.hsfDate} onChange={e => setSectionDraft({...draft, hsfDate: e.target.value})} />
                                  </div>
                                </div>
                                <div><label className="text-xs text-muted-foreground">Notes</label>
                                  <textarea className="w-full px-2 py-1 rounded border border-input bg-background text-xs resize-none" rows={2} value={draft.hsfNotes} onChange={e => setSectionDraft({...draft, hsfNotes: e.target.value})} />
                                </div>
                                <Button size="sm" className="h-7 text-xs" disabled={updateMutation.isPending} onClick={() => { updateMutation.mutate({ id: p.id, data: { hsfStatus: draft.hsfStatus, hsfDate: draft.hsfDate || null, hsfNotes: draft.hsfNotes || null } }); setEditingSection(null); }}>
                                  {updateMutation.isPending ? "Saving…" : "Save Section"}
                                </Button>
                              </div>
                            )}
                          </div>
                        );
                      })()}

                      {/* S5 — Welfare */}
                      {(() => {
                        const sec = "welfare";
                        const isEditing = editingSection === `${p.id}-${sec}`;
                        const draft = sectionDraft;
                        const welfareItems = [
                          { key: "welfareToilets", label: "Toilets", val: p.welfareToilets },
                          { key: "welfareWashing", label: "Washing", val: p.welfareWashing },
                          { key: "welfareRestArea", label: "Rest Area", val: p.welfareRestArea },
                          { key: "welfareDrinkingWater", label: "Drinking Water", val: p.welfareDrinkingWater },
                          { key: "welfareChanging", label: "Changing Facilities", val: p.welfareChanging },
                        ];
                        return (
                          <div className="rounded-md border border-border p-3 space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-semibold flex items-center gap-1.5"><CheckSquareIcon className="h-3.5 w-3.5 text-green-600" />5. Welfare Provisions (CDM Reg 25)</span>
                              <Button size="sm" variant="ghost" className="h-6 px-1.5 text-xs" onClick={() => { setEditingSection(isEditing ? null : `${p.id}-${sec}`); setSectionDraft({ welfareToilets: p.welfareToilets ?? false, welfareWashing: p.welfareWashing ?? false, welfareRestArea: p.welfareRestArea ?? false, welfareDrinkingWater: p.welfareDrinkingWater ?? false, welfareChanging: p.welfareChanging ?? false }); }}>
                                {isEditing ? "Cancel" : <><Edit className="h-3 w-3 mr-0.5" />Edit</>}
                              </Button>
                            </div>
                            {!isEditing && (
                              <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                                {welfareItems.map(w => (
                                  <span key={w.key} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${w.val ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300" : "bg-muted text-muted-foreground"}`}>
                                    {w.val ? <CheckCircle className="h-3 w-3" /> : <AlertCircle className="h-3 w-3" />}{w.label}
                                  </span>
                                ))}
                              </div>
                            )}
                            {isEditing && (
                              <div className="space-y-2 pt-1">
                                <div className="grid grid-cols-2 gap-2">
                                  {welfareItems.map(w => (
                                    <label key={w.key} className="flex items-center gap-2 text-xs cursor-pointer">
                                      <input type="checkbox" checked={!!draft[w.key]} onChange={e => setSectionDraft({...draft, [w.key]: e.target.checked})} className="rounded" />
                                      {w.label}
                                    </label>
                                  ))}
                                </div>
                                <Button size="sm" className="h-7 text-xs" disabled={updateMutation.isPending} onClick={() => { updateMutation.mutate({ id: p.id, data: { welfareToilets: draft.welfareToilets, welfareWashing: draft.welfareWashing, welfareRestArea: draft.welfareRestArea, welfareDrinkingWater: draft.welfareDrinkingWater, welfareChanging: draft.welfareChanging } }); setEditingSection(null); }}>
                                  {updateMutation.isPending ? "Saving…" : "Save Section"}
                                </Button>
                              </div>
                            )}
                          </div>
                        );
                      })()}
                    </div>

                    {/* Notes */}
                    {p.notes && (
                      <div className="text-xs text-muted-foreground bg-muted/40 rounded p-2">
                        <span className="font-semibold">Notes: </span>{p.notes}
                      </div>
                    )}

                    {/* Actions */}
                    <div className="flex items-center gap-2 pt-1">
                      <Button size="sm" variant="outline" onClick={() => openEdit(p)} className="text-xs">
                        <Edit className="h-3.5 w-3.5 mr-1" />Edit Project
                      </Button>
                      <Button size="sm" variant="outline" className="text-xs text-red-600 border-red-300 hover:bg-red-50 dark:hover:bg-red-950"
                        onClick={() => { if (window.confirm(`Delete project "${p.title}"?`)) deleteMutation.mutate(p.id); }}>
                        <Trash2 className="h-3.5 w-3.5 mr-1" />Delete
                      </Button>
                    </div>
                  </div>
                )}
              </GlassCard>
            );
          })}
        </div>
      )}

      {/* Add Project Dialog */}
      <Dialog open={showAddDialog} onOpenChange={(open) => { setShowAddDialog(open); if (!open) { setAddStep(1); setForm(emptyForm); } }}>
        <DialogContent className="w-[95vw] sm:max-w-2xl max-h-[92vh] flex flex-col overflow-hidden p-0">
          <div className="flex-shrink-0 px-6 pt-6 pb-4 border-b">
            <DialogTitle className="flex items-center gap-2 text-lg font-semibold mb-3">
              <HardHatIcon className="h-5 w-5 text-amber-600" />Add CDM Project
            </DialogTitle>
            <div className="flex items-center gap-0">
              {[{ n: 1, label: "Project Details" }, { n: 2, label: "F10 & Documents" }].map((s, i) => (
                <div key={s.n} className={`flex items-center ${i === 0 ? 'flex-1' : ''}`}>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${addStep >= s.n ? 'bg-amber-600 text-white' : 'bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400'}`}>{addStep > s.n ? '✓' : s.n}</div>
                    <span className={`text-xs font-medium hidden sm:inline transition-colors ${addStep >= s.n ? 'text-amber-700 dark:text-amber-400' : 'text-gray-400 dark:text-gray-500'}`}>{s.label}</span>
                  </div>
                  {i === 0 && <div className={`flex-1 h-0.5 mx-2 transition-colors ${addStep > 1 ? 'bg-amber-600' : 'bg-gray-200 dark:bg-gray-700'}`} />}
                </div>
              ))}
            </div>
          </div>

          <div className="overflow-y-auto flex-1 min-h-0 px-6 py-4">
            {addStep === 1 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="col-span-2 space-y-1.5">
                  <label className="text-sm font-medium">Project Title *</label>
                  <Input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="e.g. Office Block Extension" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Contractor Company *</label>
                  <select className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring" value={form.companyId} onChange={e => setForm({ ...form, companyId: e.target.value })}>
                    <option value="">Select company…</option>
                    {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">CDM Role</label>
                  <select className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring" value={form.contractorRole} onChange={e => setForm({ ...form, contractorRole: e.target.value })}>
                    <option value="contractor">Contractor</option>
                    <option value="principal_contractor">Principal Contractor</option>
                    <option value="principal_designer">Principal Designer</option>
                    <option value="designer">Designer</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Client Name</label>
                  <Input value={form.clientName} onChange={e => setForm({ ...form, clientName: e.target.value })} placeholder="e.g. ABC Holdings Ltd" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Principal Designer Name</label>
                  <Input value={form.principalDesignerName} onChange={e => setForm({ ...form, principalDesignerName: e.target.value })} placeholder="Name of the appointed Principal Designer" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Location</label>
                  <Input value={form.location} onChange={e => setForm({ ...form, location: e.target.value })} placeholder="e.g. London, EC1A 1BB" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Status</label>
                  <select className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring" value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>
                    <option value="planning">Planning</option>
                    <option value="active">Active</option>
                    <option value="complete">Complete</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Start Date</label>
                  <Input type="date" value={form.startDate} onChange={e => setForm({ ...form, startDate: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">End Date</label>
                  <Input type="date" value={form.endDate} onChange={e => setForm({ ...form, endDate: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Estimated Days</label>
                  <Input type="number" min="0" value={form.estimatedDays} onChange={e => setForm({ ...form, estimatedDays: e.target.value })} placeholder="30" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Peak Workers on Site</label>
                  <Input type="number" min="0" value={form.peakWorkers} onChange={e => setForm({ ...form, peakWorkers: e.target.value })} placeholder="20" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Estimated Person-Days</label>
                  <Input type="number" min="0" value={form.personDays} onChange={e => setForm({ ...form, personDays: e.target.value })} placeholder="500" />
                </div>
                <div className="col-span-2 space-y-1.5">
                  <label className="text-sm font-medium">Description</label>
                  <Textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} rows={2} placeholder="Brief project description…" />
                </div>
                {/* F10 auto-detection */}
                {isNotifiable({ estimatedDays: form.estimatedDays ? parseInt(form.estimatedDays) : 0, peakWorkers: form.peakWorkers ? parseInt(form.peakWorkers) : 0, personDays: form.personDays ? parseInt(form.personDays) : 0 }) && (
                  <div className="col-span-2 rounded-md bg-amber-50 border border-amber-200 dark:bg-amber-950/30 dark:border-amber-800 p-3 text-xs text-amber-800 dark:text-amber-300 flex items-start gap-2">
                    <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                    <span><strong>F10 notification required</strong> — This project exceeds HSE thresholds ({">"} 30 days with {">"} 20 workers, or {">"} 500 person-days). Notify the HSE before construction starts.</span>
                  </div>
                )}
              </div>
            )}

            {addStep === 2 && (
              <div className="space-y-4">
                {/* Notifiability banner — calculated from step 1 inputs */}
                {(() => {
                  const days = parseInt(form.estimatedDays) || 0;
                  const peak = parseInt(form.peakWorkers) || 0;
                  const persons = parseInt(form.personDays) || 0;
                  const notifiable = isNotifiable({ estimatedDays: days, peakWorkers: peak, personDays: persons });
                  const daysThreshold = days > 30 && peak > 20;
                  const personDaysThreshold = persons > 500;
                  return (
                    <div className={`flex items-start gap-3 rounded-lg p-3 border ${notifiable ? "bg-amber-50 border-amber-300 dark:bg-amber-950/30 dark:border-amber-700" : "bg-green-50 border-green-300 dark:bg-green-950/30 dark:border-green-700"}`}>
                      <span className={`text-2xl font-extrabold leading-none ${notifiable ? "text-amber-600" : "text-green-600"}`}>{notifiable ? "YES" : "NO"}</span>
                      <div>
                        <p className={`text-sm font-semibold ${notifiable ? "text-amber-800 dark:text-amber-300" : "text-green-800 dark:text-green-300"}`}>
                          {notifiable ? "This project IS notifiable to the HSE (CDM 2015 Reg 6)" : "This project is NOT notifiable to the HSE"}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {notifiable
                            ? `Notification required — ${daysThreshold ? `${days} working days with ${peak} peak workers` : ""}${daysThreshold && personDaysThreshold ? "; " : ""}${personDaysThreshold ? `${persons} person-days` : ""}. An F10 notice must be submitted to the HSE before work starts.`
                            : "Below the notifiable threshold (>30 working days with >20 simultaneous workers, or >500 person-days). No F10 required."}
                        </p>
                      </div>
                    </div>
                  );
                })()}

                {/* S1 — F10 */}
                <div className="rounded-md border border-border p-3 space-y-2">
                  <h4 className="font-medium text-sm flex items-center gap-2"><AlertCircle className="h-4 w-4 text-amber-600" />1. F10 HSE Notification</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium">Status</label>
                      <select className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm focus:outline-none" value={form.f10Status} onChange={e => setForm({ ...form, f10Status: e.target.value })}>
                        <option value="not_required">Not Required</option>
                        <option value="pending">Pending</option>
                        <option value="submitted">Submitted</option>
                      </select>
                    </div>
                    {(form.f10Status === "submitted" || form.f10Status === "pending") && (
                      <>
                        <div className="space-y-1.5"><label className="text-xs font-medium">Date Submitted</label><Input type="date" value={form.f10Date} onChange={e => setForm({ ...form, f10Date: e.target.value })} /></div>
                        <div className="space-y-1.5"><label className="text-xs font-medium">HSE Reference</label><Input value={form.f10Reference} onChange={e => setForm({ ...form, f10Reference: e.target.value })} placeholder="F10 ref" /></div>
                      </>
                    )}
                    <div className="sm:col-span-2 space-y-1.5"><label className="text-xs font-medium">Notes</label><Input value={form.f10Notes} onChange={e => setForm({ ...form, f10Notes: e.target.value })} placeholder="Optional notes…" /></div>
                  </div>
                </div>

                {/* S2 — CPP */}
                <div className="rounded-md border border-border p-3 space-y-2">
                  <h4 className="font-medium text-sm flex items-center gap-2"><ClipboardList className="h-4 w-4 text-blue-600" />2. Construction Phase Plan</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium">Status</label>
                      <select className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm focus:outline-none" value={form.cppStatus} onChange={e => setForm({ ...form, cppStatus: e.target.value })}>
                        <option value="not_prepared">Not Prepared</option>
                        <option value="in_progress">In Progress</option>
                        <option value="approved">Approved</option>
                      </select>
                    </div>
                    <div className="space-y-1.5"><label className="text-xs font-medium">Date</label><Input type="date" value={form.cppDate} onChange={e => setForm({ ...form, cppDate: e.target.value })} /></div>
                    <div className="sm:col-span-2 space-y-1.5"><label className="text-xs font-medium">Notes</label><Input value={form.cppNotes} onChange={e => setForm({ ...form, cppNotes: e.target.value })} placeholder="Optional notes…" /></div>
                  </div>
                </div>

                {/* S3 — PCI */}
                <div className="rounded-md border border-border p-3 space-y-2">
                  <h4 className="font-medium text-sm flex items-center gap-2"><ClipboardList className="h-4 w-4 text-purple-600" />3. Pre-Construction Information</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium">Status</label>
                      <select className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm focus:outline-none" value={form.pciStatus} onChange={e => setForm({ ...form, pciStatus: e.target.value })}>
                        <option value="not_prepared">Not Prepared</option>
                        <option value="prepared">Prepared</option>
                        <option value="distributed">Distributed</option>
                      </select>
                    </div>
                    <div className="space-y-1.5"><label className="text-xs font-medium">Date</label><Input type="date" value={form.pciDate} onChange={e => setForm({ ...form, pciDate: e.target.value })} /></div>
                    <div className="sm:col-span-2 space-y-1.5"><label className="text-xs font-medium">Notes</label><Input value={form.pciNotes} onChange={e => setForm({ ...form, pciNotes: e.target.value })} placeholder="Optional notes…" /></div>
                  </div>
                </div>

                {/* S4 — HSF */}
                <div className="rounded-md border border-border p-3 space-y-2">
                  <h4 className="font-medium text-sm flex items-center gap-2"><ClipboardList className="h-4 w-4 text-indigo-600" />4. Health & Safety File</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium">Status</label>
                      <select className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm focus:outline-none" value={form.hsfStatus} onChange={e => setForm({ ...form, hsfStatus: e.target.value })}>
                        <option value="not_started">Not Started</option>
                        <option value="in_progress">In Progress</option>
                        <option value="complete">Complete</option>
                        <option value="handed_over">Handed Over</option>
                      </select>
                    </div>
                    <div className="space-y-1.5"><label className="text-xs font-medium">Date</label><Input type="date" value={form.hsfDate} onChange={e => setForm({ ...form, hsfDate: e.target.value })} /></div>
                    <div className="sm:col-span-2 space-y-1.5"><label className="text-xs font-medium">Notes</label><Input value={form.hsfNotes} onChange={e => setForm({ ...form, hsfNotes: e.target.value })} placeholder="Optional notes…" /></div>
                  </div>
                </div>

                {/* S5 — Welfare */}
                <div className="rounded-md border border-border p-3 space-y-2">
                  <h4 className="font-medium text-sm flex items-center gap-2"><CheckSquareIcon className="h-4 w-4 text-green-600" />5. Welfare Provisions (CDM Reg 25)</h4>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {[
                      { key: "welfareToilets" as const, label: "Toilets" },
                      { key: "welfareWashing" as const, label: "Washing Facilities" },
                      { key: "welfareRestArea" as const, label: "Rest Area" },
                      { key: "welfareDrinkingWater" as const, label: "Drinking Water" },
                      { key: "welfareChanging" as const, label: "Changing Facilities" },
                    ].map(opt => (
                      <label key={opt.key} className="flex items-center gap-2 cursor-pointer text-sm">
                        <input type="checkbox" checked={!!form[opt.key]} onChange={e => setForm({ ...form, [opt.key]: e.target.checked })} className="h-4 w-4" />
                        {opt.label}
                      </label>
                    ))}
                  </div>
                </div>

                {/* General Notes */}
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">General Notes</label>
                  <Textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} rows={2} placeholder="Any additional CDM notes…" />
                </div>
              </div>
            )}
          </div>

          <div className="flex-shrink-0 px-6 py-4 border-t flex justify-between">
            <Button variant="outline" onClick={() => { if (addStep === 1) { setShowAddDialog(false); setForm(emptyForm); } else setAddStep(1); }}>
              {addStep === 1 ? "Cancel" : "Back"}
            </Button>
            {addStep === 1 ? (
              <Button onClick={() => setAddStep(2)} disabled={!form.title || !form.companyId} className="bg-amber-600 hover:bg-amber-700 text-white">
                Next: F10 & Documents
              </Button>
            ) : (
              <Button onClick={() => createMutation.mutate(form)} disabled={createMutation.isPending} className="bg-amber-600 hover:bg-amber-700 text-white">
                {createMutation.isPending ? "Creating…" : "Create CDM Project"}
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Project Dialog */}
      <Dialog open={!!editingProject} onOpenChange={(open) => { if (!open) setEditingProject(null); }}>
        <DialogContent className="w-[95vw] sm:max-w-2xl max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><HardHatIcon className="h-5 w-5 text-amber-600" />Edit CDM Project</DialogTitle>
          </DialogHeader>
          <div className="space-y-5 pt-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="col-span-2 space-y-1.5">
                <label className="text-sm font-medium">Project Title *</label>
                <Input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">CDM Role</label>
                <select className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring" value={form.contractorRole} onChange={e => setForm({ ...form, contractorRole: e.target.value })}>
                  <option value="contractor">Contractor</option>
                  <option value="principal_contractor">Principal Contractor</option>
                  <option value="principal_designer">Principal Designer</option>
                  <option value="designer">Designer</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Status</label>
                <select className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring" value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>
                  <option value="planning">Planning</option>
                  <option value="active">Active</option>
                  <option value="complete">Complete</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Client Name</label>
                <Input value={form.clientName} onChange={e => setForm({ ...form, clientName: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Principal Designer Name</label>
                <Input value={form.principalDesignerName} onChange={e => setForm({ ...form, principalDesignerName: e.target.value })} placeholder="Name of the appointed Principal Designer" />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Location</label>
                <Input value={form.location} onChange={e => setForm({ ...form, location: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Start Date</label>
                <Input type="date" value={form.startDate} onChange={e => setForm({ ...form, startDate: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">End Date</label>
                <Input type="date" value={form.endDate} onChange={e => setForm({ ...form, endDate: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Est. Days</label>
                <Input type="number" min="0" value={form.estimatedDays} onChange={e => setForm({ ...form, estimatedDays: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Peak Workers</label>
                <Input type="number" min="0" value={form.peakWorkers} onChange={e => setForm({ ...form, peakWorkers: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Person-Days</label>
                <Input type="number" min="0" value={form.personDays} onChange={e => setForm({ ...form, personDays: e.target.value })} />
              </div>
            </div>

            {/* Five compliance sections */}
            <div className="space-y-3">
              <p className="text-sm font-semibold">Compliance Sections</p>

              {/* S1 — F10 */}
              <div className="rounded-md border border-border p-3 space-y-2">
                <h4 className="text-xs font-semibold flex items-center gap-1.5"><AlertCircle className="h-3.5 w-3.5 text-amber-600" />1. F10 HSE Notification</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div className="space-y-1"><label className="text-xs text-muted-foreground">Status</label>
                    <select className="w-full h-8 px-2 rounded-md border border-input bg-background text-xs focus:outline-none" value={form.f10Status} onChange={e => setForm({ ...form, f10Status: e.target.value })}>
                      <option value="not_required">Not Required</option><option value="pending">Pending</option><option value="submitted">Submitted</option>
                    </select>
                  </div>
                  <div className="space-y-1"><label className="text-xs text-muted-foreground">Date Submitted</label><Input type="date" className="h-8 text-xs" value={form.f10Date} onChange={e => setForm({ ...form, f10Date: e.target.value })} /></div>
                  <div className="space-y-1"><label className="text-xs text-muted-foreground">HSE Reference</label><Input className="h-8 text-xs" value={form.f10Reference} onChange={e => setForm({ ...form, f10Reference: e.target.value })} /></div>
                  <div className="space-y-1"><label className="text-xs text-muted-foreground">Notes</label><Input className="h-8 text-xs" value={form.f10Notes} onChange={e => setForm({ ...form, f10Notes: e.target.value })} /></div>
                </div>
              </div>

              {/* S2 — CPP */}
              <div className="rounded-md border border-border p-3 space-y-2">
                <h4 className="text-xs font-semibold flex items-center gap-1.5"><ClipboardList className="h-3.5 w-3.5 text-blue-600" />2. Construction Phase Plan</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div className="space-y-1"><label className="text-xs text-muted-foreground">Status</label>
                    <select className="w-full h-8 px-2 rounded-md border border-input bg-background text-xs focus:outline-none" value={form.cppStatus} onChange={e => setForm({ ...form, cppStatus: e.target.value })}>
                      <option value="not_prepared">Not Prepared</option><option value="in_progress">In Progress</option><option value="approved">Approved</option>
                    </select>
                  </div>
                  <div className="space-y-1"><label className="text-xs text-muted-foreground">Date</label><Input type="date" className="h-8 text-xs" value={form.cppDate} onChange={e => setForm({ ...form, cppDate: e.target.value })} /></div>
                  <div className="sm:col-span-2 space-y-1"><label className="text-xs text-muted-foreground">Notes</label><Input className="h-8 text-xs" value={form.cppNotes} onChange={e => setForm({ ...form, cppNotes: e.target.value })} /></div>
                </div>
              </div>

              {/* S3 — PCI */}
              <div className="rounded-md border border-border p-3 space-y-2">
                <h4 className="text-xs font-semibold flex items-center gap-1.5"><ClipboardList className="h-3.5 w-3.5 text-purple-600" />3. Pre-Construction Information</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div className="space-y-1"><label className="text-xs text-muted-foreground">Status</label>
                    <select className="w-full h-8 px-2 rounded-md border border-input bg-background text-xs focus:outline-none" value={form.pciStatus} onChange={e => setForm({ ...form, pciStatus: e.target.value })}>
                      <option value="not_prepared">Not Prepared</option><option value="prepared">Prepared</option><option value="distributed">Distributed</option>
                    </select>
                  </div>
                  <div className="space-y-1"><label className="text-xs text-muted-foreground">Date</label><Input type="date" className="h-8 text-xs" value={form.pciDate} onChange={e => setForm({ ...form, pciDate: e.target.value })} /></div>
                  <div className="sm:col-span-2 space-y-1"><label className="text-xs text-muted-foreground">Notes</label><Input className="h-8 text-xs" value={form.pciNotes} onChange={e => setForm({ ...form, pciNotes: e.target.value })} /></div>
                </div>
              </div>

              {/* S4 — HSF */}
              <div className="rounded-md border border-border p-3 space-y-2">
                <h4 className="text-xs font-semibold flex items-center gap-1.5"><ClipboardList className="h-3.5 w-3.5 text-indigo-600" />4. Health & Safety File</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div className="space-y-1"><label className="text-xs text-muted-foreground">Status</label>
                    <select className="w-full h-8 px-2 rounded-md border border-input bg-background text-xs focus:outline-none" value={form.hsfStatus} onChange={e => setForm({ ...form, hsfStatus: e.target.value })}>
                      <option value="not_started">Not Started</option><option value="in_progress">In Progress</option><option value="complete">Complete</option><option value="handed_over">Handed Over</option>
                    </select>
                  </div>
                  <div className="space-y-1"><label className="text-xs text-muted-foreground">Date</label><Input type="date" className="h-8 text-xs" value={form.hsfDate} onChange={e => setForm({ ...form, hsfDate: e.target.value })} /></div>
                  <div className="sm:col-span-2 space-y-1"><label className="text-xs text-muted-foreground">Notes</label><Input className="h-8 text-xs" value={form.hsfNotes} onChange={e => setForm({ ...form, hsfNotes: e.target.value })} /></div>
                </div>
              </div>

              {/* S5 — Welfare */}
              <div className="rounded-md border border-border p-3 space-y-2">
                <h4 className="text-xs font-semibold flex items-center gap-1.5"><CheckSquareIcon className="h-3.5 w-3.5 text-green-600" />5. Welfare Provisions (CDM Reg 25)</h4>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {[
                    { key: "welfareToilets" as const, label: "Toilets" },
                    { key: "welfareWashing" as const, label: "Washing" },
                    { key: "welfareRestArea" as const, label: "Rest Area" },
                    { key: "welfareDrinkingWater" as const, label: "Drinking Water" },
                    { key: "welfareChanging" as const, label: "Changing" },
                  ].map(opt => (
                    <label key={opt.key} className="flex items-center gap-2 cursor-pointer text-sm">
                      <input type="checkbox" checked={!!form[opt.key]} onChange={e => setForm({ ...form, [opt.key]: e.target.checked })} className="h-4 w-4" />
                      {opt.label}
                    </label>
                  ))}
                </div>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium">General Notes</label>
              <Textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} rows={2} />
            </div>
          </div>
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setEditingProject(null)}>Cancel</Button>
            <Button onClick={() => editingProject && updateMutation.mutate({ id: editingProject.id, data: form })} disabled={updateMutation.isPending || !form.title} className="bg-amber-600 hover:bg-amber-700 text-white">
              {updateMutation.isPending ? "Saving…" : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* PDF Export Filter Dialog */}
      <Dialog open={showPdfFilterDialog} onOpenChange={handlePdfDialogOpenChange}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Export CDM Report as PDF</DialogTitle>
            <DialogDescription>Optionally filter which projects are included in the report.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Contractor Company</Label>
              <Select value={pdfCompanyFilter} onValueChange={(val) => { setPdfCompanyFilter(val); try { localStorage.setItem("cdm_pdf_last_company", val); } catch {} }}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder="All companies" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All companies</SelectItem>
                  {companies.map(c => (
                    <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Project Status</Label>
              <Select value={pdfStatusFilter} onValueChange={setPdfStatusFilter}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder="All statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  <SelectItem value="planning">Planning</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="complete">Complete</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">Start date from</Label>
                <Input
                  type="date"
                  className="h-9 text-sm"
                  value={pdfFromDate}
                  onChange={e => setPdfFromDate(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">Start date to</Label>
                <Input
                  type="date"
                  className="h-9 text-sm"
                  value={pdfToDate}
                  onChange={e => setPdfToDate(e.target.value)}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              className="mr-auto"
              onClick={() => resetPdfFilters()}
            >
              Reset filters
            </Button>
            <Button variant="outline" onClick={() => handlePdfDialogOpenChange(false)}>Cancel</Button>
            <Button
              className="bg-amber-600 hover:bg-amber-700 text-white"
              onClick={() => {
                const params = new URLSearchParams();
                if (pdfCompanyFilter && pdfCompanyFilter !== "all") params.set("companyId", pdfCompanyFilter);
                if (pdfStatusFilter && pdfStatusFilter !== "all") params.set("status", pdfStatusFilter);
                if (pdfFromDate) params.set("from", pdfFromDate);
                if (pdfToDate) params.set("to", pdfToDate);
                const qs = params.toString();
                window.open(`/api/cdm/projects/export-pdf${qs ? `?${qs}` : ""}`, "_blank");
                pdfGeneratingRef.current = true;
                setShowPdfFilterDialog(false);
              }}
            >
              <Download className="h-3.5 w-3.5 mr-1.5" />Generate PDF
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

