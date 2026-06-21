import { useState, useEffect, useRef, useMemo } from "react";
import { useTranslation, Trans } from "react-i18next";
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
  const { t, i18n } = useTranslation(["contractors", "common"]);
  const { toast } = useToast();
  const dateLocale = i18n.language === 'es' ? 'es-ES' : 'en-GB';

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
      toast({ title: t("cdm.projectCreated") });
    },
    onError: () => toast({ title: t("common:error"), description: t("cdm.failedCreateProject"), variant: "destructive" }),
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
      toast({ title: t("cdm.projectUpdated") });
    },
    onError: () => toast({ title: t("common:error"), description: t("cdm.failedUpdateProject"), variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => apiRequest("DELETE", `/api/cdm/projects/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cdm/projects", customerId] });
      setSelectedProject(null);
      toast({ title: t("cdm.projectDeleted") });
    },
    onError: () => toast({ title: t("common:error"), description: t("cdm.failedDeleteProject"), variant: "destructive" }),
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
    contractorCompliance.push({ id: "__unknown__", name: t("common:unknown"), projectCount: orphanProjects.length, avgPct, overdueCount });
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

  if (isLoading) return <GlassCard className="p-8 text-center text-muted-foreground">{t("cdm.loadingCdm")}</GlassCard>;

  return (
    <div className="space-y-4">
      {/* Stats bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: t("cdm.totalProjects"), value: allProjects.length, color: "text-slate-700 dark:text-slate-200" },
          { label: t("cdm.active"), value: totalActive, color: "text-green-700 dark:text-green-400" },
          { label: t("cdm.f10Required"), value: totalF10, color: "text-amber-700 dark:text-amber-400" },
          { label: t("cdm.overdue"), value: totalOverdue, color: "text-red-700 dark:text-red-400" },
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
              <span className="font-semibold text-sm text-fixed">{t("cdm.summary")}</span>
              <span className="text-xs text-muted-foreground">{t("cdm.portfolioHealth")}</span>
              {summaryFiltersActive && (
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4">{t("cdm.filtered")}</Badge>
              )}
            </div>
            <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${showComplianceSummary ? "rotate-180" : ""}`} />
          </button>
          {showComplianceSummary && (
            <div className="px-4 pb-4 space-y-4 border-t border-border">
              {/* Filter controls */}
              <div className="flex flex-wrap items-end gap-2 pt-3">
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">{t("cdm.contractor")}</label>
                  <Select value={summaryContractorFilter} onValueChange={setSummaryContractorFilter}>
                    <SelectTrigger className="h-7 text-xs w-40">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{t("cdm.allContractors")}</SelectItem>
                      {companies.map(c => (
                        <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">{t("common:status")}</label>
                  <Select value={summaryStatusFilter} onValueChange={setSummaryStatusFilter}>
                    <SelectTrigger className="h-7 text-xs w-32">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{t("cdm.allStatuses")}</SelectItem>
                      <SelectItem value="planning">{t("cdm.planning")}</SelectItem>
                      <SelectItem value="active">{t("cdm.active")}</SelectItem>
                      <SelectItem value="complete">{t("cdm.complete")}</SelectItem>
                      <SelectItem value="cancelled">{t("cdm.cancelled")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">{t("cdm.startDateFrom")}</label>
                  <input
                    type="date"
                    className="h-7 px-2 text-xs rounded-md border border-input bg-background focus:outline-none focus:ring-1 focus:ring-ring"
                    value={summaryFromDate}
                    onChange={e => setSummaryFromDate(e.target.value)}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">{t("cdm.startDateTo")}</label>
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
                    {t("cdm.clearFilters")}
                  </Button>
                )}
                <span className="text-xs text-muted-foreground ml-auto self-end pb-0.5">
                  {t("common:matching", { count: summaryProjects.length, total: allProjects.length })} {t(`cdm.project`, { count: allProjects.length })}
                </span>
              </div>
              {summaryProjects.length === 0 && summaryFiltersActive ? (
                <p className="text-xs text-muted-foreground text-center py-4">{t("cdm.noMatchFilters")}</p>
              ) : (
              <>
              {/* Overall Compliance Score — matches PDF formula exactly:
                  CPP/PCI/HSF document completion; 3 docs per project */}
              {nonCancelledSummary.length === 0 && summaryProjects.length > 0 && (
                <p className="text-xs text-muted-foreground text-center py-2">{t("cdm.allCancelledNoScore")}</p>
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
                const label = overallPct >= 80 ? t("cdm.highCompliance") : overallPct >= 50 ? t("cdm.partialCompliance") : t("cdm.lowCompliance");
                return (
                  <div className={`flex items-center justify-between rounded-lg border px-4 py-3 ${colorClass}`}>
                    <div className="flex items-center gap-2">
                      <Shield className={`h-5 w-5 ${textClass}`} />
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{t("cdm.overallComplianceScore")}</p>
                        <p className="text-xs text-muted-foreground">
                          {t("cdm.complianceExclCancelled", { count: nonCancelledSummary.length })}
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
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">{t("cdm.projectsByStatus")}</p>
                  <div className="space-y-1.5">
                    {[
                      { key: "planning", label: t("cdm.planning"), color: "bg-blue-500", textColor: "text-blue-700 dark:text-blue-400" },
                      { key: "active", label: t("cdm.active"), color: "bg-green-500", textColor: "text-green-700 dark:text-green-400" },
                      { key: "complete", label: t("cdm.complete"), color: "bg-slate-500", textColor: "text-slate-700 dark:text-slate-400" },
                      { key: "cancelled", label: t("cdm.cancelled"), color: "bg-red-500", textColor: "text-red-700 dark:text-red-400" },
                    ].map(s => {
                      const count = statusCounts[s.key as keyof typeof statusCounts];
                      const pct = summaryProjects.length > 0 ? (count / summaryProjects.length) * 100 : 0;
                      return (
                        <div key={s.key} className="space-y-1">
                          <div className="flex items-center justify-between text-[10px]">
                            <span className={`font-medium ${s.textColor}`}>{s.label} ({count})</span>
                            <span className="text-muted-foreground tabular-nums">{Math.round(pct)}%</span>
                          </div>
                          <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                            <div className={`h-full ${s.color}`} style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
                {/* F10 notification breakdown */}
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">{t("cdm.f10NotificationStatus")}</p>
                  <div className="space-y-1.5">
                    {[
                      { label: t("cdm.notifiable"), value: notifiableProjects.length, total: summaryProjects.length, color: "bg-amber-500", textColor: "text-amber-700 dark:text-amber-400" },
                      { label: t("cdm.submitted"), value: f10Counts.submitted, total: notifiableProjects.length, color: "bg-green-600", textColor: "text-green-700 dark:text-green-400" },
                      { label: t("cdm.overdue"), value: summaryOverdue, total: notifiableProjects.length, color: "bg-red-500", textColor: "text-red-700 dark:text-red-400" },
                    ].map(s => {
                      const pct = s.total > 0 ? (s.value / s.total) * 100 : 0;
                      return (
                        <div key={s.label} className="space-y-1">
                          <div className="flex items-center justify-between text-[10px]">
                            <span className={`font-medium ${s.textColor}`}>{s.label} ({s.value})</span>
                            <span className="text-muted-foreground tabular-nums">{Math.round(pct)}%</span>
                          </div>
                          <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                            <div className={`h-full ${s.color}`} style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  {summaryOverdue > 0 && (
                    <div className="mt-2 flex items-center gap-1.5 text-[10px] text-red-600 font-medium">
                      <AlertTriangle className="h-3 w-3" />
                      <span>{t("contractors:f10OverdueTooltip", { count: summaryOverdue })}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Contractor & Trend Grid */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Compliance by contractor */}
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">{t("cdm.complianceByContractor")}</p>
                  <div className="rounded-md border border-border overflow-hidden">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-muted/50 text-[10px] uppercase tracking-wider text-muted-foreground border-b border-border">
                          <th className="px-3 py-1.5 font-semibold">{t("cdm.contractor")}</th>
                          <th className="px-3 py-1.5 font-semibold text-center">{t("common:count")}</th>
                          <th className="px-3 py-1.5 font-semibold text-center">{t("cdm.avgCompliance")}</th>
                          <th className="px-3 py-1.5 font-semibold text-center">{t("cdm.overdueF10")}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {contractorCompliance.sort((a,b) => a.avgPct - b.avgPct).map(c => (
                          <tr key={c.id} className="text-[11px] hover:bg-muted/20 transition-colors">
                            <td className="px-3 py-1.5 font-medium">{c.name}</td>
                            <td className="px-3 py-1.5 text-center tabular-nums text-muted-foreground">{c.projectCount}</td>
                            <td className="px-3 py-1.5 text-center font-bold tabular-nums">
                              <span className={c.avgPct >= 80 ? "text-green-600" : c.avgPct >= 50 ? "text-amber-600" : "text-red-600"}>
                                {c.avgPct}%
                              </span>
                            </td>
                            <td className="px-3 py-1.5 text-center tabular-nums">
                              {c.overdueCount > 0 ? <span className="text-red-600 font-bold">{c.overdueCount}</span> : "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Compliance trend chart */}
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">{t("cdm.complianceTrend")}</p>
                  <div className="h-[140px] w-full mt-2">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={complianceTrend} margin={{ top: 5, right: 5, bottom: 0, left: -25 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                        <XAxis
                          dataKey="month"
                          axisLine={false}
                          tickLine={false}
                          tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }}
                        />
                        <YAxis
                          domain={[0, 100]}
                          axisLine={false}
                          tickLine={false}
                          tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }}
                          tickFormatter={(v) => `${v}%`}
                        />
                        <Tooltip
                          contentStyle={{ fontSize: '10px', borderRadius: '8px', border: '1px solid hsl(var(--border))' }}
                          formatter={(v: any) => [`${v}%`, t("cdm.avgCompliance")]}
                        />
                        <Bar
                          dataKey="score"
                          radius={[2, 2, 0, 0]}
                          fill="hsl(var(--primary))"
                          barSize={20}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
              </>
              )}
            </div>
          )}
        </GlassCard>
      )}

      {/* Main search and action bar */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9 h-10"
            placeholder={t("common:searchPlaceholder")}
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Button variant="outline" className="flex-1 sm:flex-none h-10" onClick={() => setShowPdfFilterDialog(true)}>
            <Download className="h-4 w-4 mr-2" />{t("cdm.exportPdf")}
          </Button>
          <Button className="flex-1 sm:flex-none h-10 bg-amber-600 hover:bg-amber-700 text-white" onClick={() => setShowAddDialog(true)}>
            <Plus className="h-4 w-4 mr-2" />{t("cdm.addProject")}
          </Button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <GlassCard className="p-12 text-center">
          <HardHatIcon className="h-12 w-12 text-muted-foreground/30 mx-auto mb-4" />
          <p className="text-sm font-medium text-muted-foreground">{t("cdm.noCdmProjects")}</p>
          <p className="text-xs text-muted-foreground mt-1">{t("cdm.startProject")}</p>
        </GlassCard>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {filtered.map(p => {
            const badge = CDM_STATUS_BADGE[p.status] ?? { label: p.status, className: "" };
            const isSel = selectedProject?.id === p.id;
            const overdue = isF10Overdue(p);
            const scorePct = Math.round((complianceScore(p) / 5) * 100);

            return (
              <GlassCard
                key={p.id}
                className={`overflow-hidden transition-all border ${isSel ? 'ring-2 ring-primary' : overdue ? 'border-red-200 dark:border-red-900/50' : ''}`}
              >
                <div
                  className="p-4 cursor-pointer hover:bg-muted/30 transition-colors"
                  onClick={() => setSelectedProject(isSel ? null : p)}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <h4 className="font-bold text-sm text-fixed truncate">{p.title}</h4>
                        <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${badge.className}`}>
                          {badge.label}
                        </span>
                        {overdue && (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400">
                            <AlertTriangle className="h-2.5 w-2.5" />{t("cdm.overdue")}
                          </span>
                        )}
                      </div>
                      <div className="flex flex-col gap-1">
                        <p className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                          <Building2 className="h-3 w-3" />{p.clientName || t("cdm.client")}
                        </p>
                        <p className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                          <MapPin className="h-3 w-3" />{p.location || t("cdm.location")}
                        </p>
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Compliance</div>
                      <div className={`text-xl font-black tabular-nums ${scorePct >= 80 ? 'text-green-600' : scorePct >= 50 ? 'text-amber-600' : 'text-red-600'}`}>
                        {scorePct}%
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 border-t pt-3">
                    <div className="space-y-0.5">
                      <p className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider">{t("cdm.projectDates")}</p>
                      <p className="text-[10px] font-medium flex items-center gap-1">
                        <CalendarDays className="h-2.5 w-2.5 text-muted-foreground" />
                        {p.startDate ? new Date(p.startDate).toLocaleDateString(dateLocale, { day: '2-digit', month: 'short' }) : '—'}
                        <span className="text-muted-foreground mx-1">→</span>
                        {p.endDate ? new Date(p.endDate).toLocaleDateString(dateLocale, { day: '2-digit', month: 'short' }) : '—'}
                      </p>
                    </div>
                    <div className="space-y-0.5">
                      <p className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider">{t("cdm.cdmRole")}</p>
                      <p className="text-[10px] font-medium flex items-center gap-1">
                        <Shield className="h-2.5 w-2.5 text-muted-foreground" />
                        {CDM_ROLE_LABELS[p.contractorRole] || p.contractorRole}
                      </p>
                    </div>
                  </div>

                  <div className="mt-3 flex items-center justify-between text-[10px] text-muted-foreground font-medium uppercase tracking-tight">
                    <span>{t("common:viewDetails")}</span>
                    <ChevronDown className={`h-3 w-3 transition-transform ${isSel ? 'rotate-180' : ''}`} />
                  </div>
                </div>

                {isSel && (
                  <div className="px-4 pb-4 pt-2 border-t bg-muted/20 space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                      {/* Section 1: F10 Notification */}
                      {(() => {
                        const isEditing = editingSection === 'f10';
                        const draft = isEditing ? sectionDraft : {};
                        const val = (k: string) => isEditing ? draft[k] : p[k as keyof CdmProject];
                        const notifiable = isNotifiable(p);

                        return (
                          <div className={`space-y-2 rounded-md border p-2.5 ${overdue ? 'bg-red-50/50 border-red-100 dark:bg-red-950/10 dark:border-red-900/50' : 'bg-background'}`}>
                            <div className="flex items-center justify-between">
                              <h5 className="text-[11px] font-bold uppercase tracking-wider flex items-center gap-1.5">
                                <AlertCircle className={`h-3 w-3 ${overdue ? 'text-red-600' : 'text-amber-600'}`} />
                                1. F10 HSE Notification
                              </h5>
                              <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => {
                                if (isEditing) setEditingSection(null);
                                else {
                                  setEditingSection('f10');
                                  setSectionDraft({ f10Status: p.f10Status, f10Date: p.f10Date, f10Reference: p.f10Reference, f10Notes: p.f10Notes });
                                }
                              }}>
                                <Edit className="h-2.5 w-2.5" />
                              </Button>
                            </div>

                            {!isEditing && (
                              <div className="space-y-1.5">
                                <div className="flex items-center justify-between">
                                  <span className="text-[10px] text-muted-foreground">Status</span>
                                  <Badge variant="outline" className={`text-[9px] px-1 py-0 h-4${p.f10Status === 'submitted' ? ' text-green-600 border-green-600' : ''}`}>
                                    {p.f10Status?.replace('_', ' ') || t("cdm.notSet")}
                                  </Badge>
                                </div>
                                {p.f10Date && (
                                  <div className="flex items-center justify-between">
                                    <span className="text-[10px] text-muted-foreground">{t("common:date")}</span>
                                    <span className="text-[10px] font-medium">{new Date(p.f10Date).toLocaleDateString(dateLocale)}</span>
                                  </div>
                                )}
                                {p.f10Reference && (
                                  <div className="flex items-center justify-between">
                                    <span className="text-[10px] text-muted-foreground">Reference</span>
                                    <span className="text-[10px] font-medium">{p.f10Reference}</span>
                                  </div>
                                )}
                                {overdue && notifiable && (
                                  <p className="text-[9px] text-red-600 font-bold mt-1.5 animate-pulse">
                                    {t("contractors:f10Overdue").toUpperCase()}
                                  </p>
                                )}
                                {!notifiable && (
                                  <p className="text-[9px] text-muted-foreground italic">{t("cdm.notNotifiable")}</p>
                                )}
                              </div>
                            )}

                            {isEditing && (
                              <div className="space-y-2 pt-1">
                                <div className="space-y-1">
                                  <label className="text-[9px] font-semibold text-muted-foreground">Status</label>
                                  <select className="w-full h-7 px-2 rounded-md border border-input bg-background text-[10px] focus:outline-none" value={draft.f10Status} onChange={e => setSectionDraft({...draft, f10Status: e.target.value})}>
                                    <option value="not_required">{t("cdm.notRequired")}</option>
                                    <option value="pending">{t("common:pending")}</option>
                                    <option value="submitted">{t("cdm.submitted")}</option>
                                  </select>
                                </div>
                                {(draft.f10Status === 'submitted' || draft.f10Status === 'pending') && (
                                  <>
                                    <div className="space-y-1">
                                      <label className="text-[9px] font-semibold text-muted-foreground">{t("cdm.dateSubmitted")}</label>
                                      <Input type="date" className="h-7 text-[10px] px-2" value={draft.f10Date || ''} onChange={e => setSectionDraft({...draft, f10Date: e.target.value})} />
                                    </div>
                                    <div className="space-y-1">
                                      <label className="text-[9px] font-semibold text-muted-foreground">{t("cdm.hseReference")}</label>
                                      <Input className="h-7 text-[10px] px-2" value={draft.f10Reference || ''} onChange={e => setSectionDraft({...draft, f10Reference: e.target.value})} />
                                    </div>
                                  </>
                                )}
                                <Button size="sm" className="h-7 text-xs w-full" disabled={updateMutation.isPending} onClick={() => { updateMutation.mutate({ id: p.id, data: draft }); setEditingSection(null); }}>
                                  {updateMutation.isPending ? t("cdm.saving") : t("cdm.saveSection")}
                                </Button>
                              </div>
                            )}
                          </div>
                        );
                      })()}

                      {/* Section 2: CPP */}
                      {(() => {
                        const isEditing = editingSection === 'cpp';
                        const draft = isEditing ? sectionDraft : {};
                        const isCompliant = ["approved", "prepared", "distributed"].includes(p.cppStatus ?? "");

                        return (
                          <div className={`space-y-2 rounded-md border p-2.5 bg-background ${!isCompliant && p.status === 'active' ? 'border-amber-200 dark:border-amber-900/50' : ''}`}>
                            <div className="flex items-center justify-between">
                              <h5 className="text-[11px] font-bold uppercase tracking-wider flex items-center gap-1.5">
                                <ClipboardList className="h-3 w-3 text-blue-600" />
                                2. Construction Phase Plan
                              </h5>
                              <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => {
                                if (isEditing) setEditingSection(null);
                                else {
                                  setEditingSection('cpp');
                                  setSectionDraft({ cppStatus: p.cppStatus, cppDate: p.cppDate, cppNotes: p.cppNotes });
                                }
                              }}>
                                <Edit className="h-2.5 w-2.5" />
                              </Button>
                            </div>

                            {!isEditing && (
                              <div className="space-y-1.5">
                                <div className="flex items-center justify-between">
                                  <span className="text-[10px] text-muted-foreground">Status</span>
                                  <Badge variant="outline" className={`text-[9px] px-1 py-0 h-4${isCompliant ? ' text-green-600 border-green-600' : ''}`}>
                                    {p.cppStatus?.replace('_', ' ') || t("cdm.notSet")}
                                  </Badge>
                                </div>
                                {p.cppDate && (
                                  <div className="flex items-center justify-between">
                                    <span className="text-[10px] text-muted-foreground">{t("common:date")}</span>
                                    <span className="text-[10px] font-medium">{new Date(p.cppDate).toLocaleDateString(dateLocale)}</span>
                                  </div>
                                )}
                                {!isCompliant && p.status === 'active' && (
                                  <p className="text-[9px] text-amber-600 font-bold mt-1.5 uppercase">{t("cdm.notCompliant")}</p>
                                )}
                              </div>
                            )}

                            {isEditing && (
                              <div className="space-y-2 pt-1">
                                <div className="space-y-1">
                                  <label className="text-[9px] font-semibold text-muted-foreground">Status</label>
                                  <select className="w-full h-7 px-2 rounded-md border border-input bg-background text-[10px] focus:outline-none" value={draft.cppStatus} onChange={e => setSectionDraft({...draft, cppStatus: e.target.value})}>
                                    <option value="not_prepared">{t("cdm.notRequired")}</option>
                                    <option value="in_progress">{t("cdm.inProgress")}</option>
                                    <option value="approved">{t("cdm.approved")}</option>
                                  </select>
                                </div>
                                <div className="space-y-1">
                                  <label className="text-[9px] font-semibold text-muted-foreground">{t("common:date")}</label>
                                  <Input type="date" className="h-7 text-[10px] px-2" value={draft.cppDate || ''} onChange={e => setSectionDraft({...draft, cppDate: e.target.value})} />
                                </div>
                                <Button size="sm" className="h-7 text-xs w-full" disabled={updateMutation.isPending} onClick={() => { updateMutation.mutate({ id: p.id, data: draft }); setEditingSection(null); }}>
                                  {updateMutation.isPending ? t("cdm.saving") : t("cdm.saveSection")}
                                </Button>
                              </div>
                            )}
                          </div>
                        );
                      })()}

                      {/* Section 3: PCI */}
                      {(() => {
                        const isEditing = editingSection === 'pci';
                        const draft = isEditing ? sectionDraft : {};
                        const isCompliant = ["approved", "prepared", "distributed"].includes(p.pciStatus ?? "");

                        return (
                          <div className={`space-y-2 rounded-md border p-2.5 bg-background ${!isCompliant && p.status === 'active' ? 'border-amber-200 dark:border-amber-900/50' : ''}`}>
                            <div className="flex items-center justify-between">
                              <h5 className="text-[11px] font-bold uppercase tracking-wider flex items-center gap-1.5">
                                <ClipboardList className="h-3 w-3 text-purple-600" />
                                3. Pre-Construction Info
                              </h5>
                              <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => {
                                if (isEditing) setEditingSection(null);
                                else {
                                  setEditingSection('pci');
                                  setSectionDraft({ pciStatus: p.pciStatus, pciDate: p.pciDate, pciNotes: p.pciNotes });
                                }
                              }}>
                                <Edit className="h-2.5 w-2.5" />
                              </Button>
                            </div>

                            {!isEditing && (
                              <div className="space-y-1.5">
                                <div className="flex items-center justify-between">
                                  <span className="text-[10px] text-muted-foreground">Status</span>
                                  <Badge variant="outline" className={`text-[9px] px-1 py-0 h-4${isCompliant ? ' text-green-600 border-green-600' : ''}`}>
                                    {p.pciStatus?.replace('_', ' ') || t("cdm.notSet")}
                                  </Badge>
                                </div>
                                {p.pciDate && (
                                  <div className="flex items-center justify-between">
                                    <span className="text-[10px] text-muted-foreground">{t("common:date")}</span>
                                    <span className="text-[10px] font-medium">{new Date(p.pciDate).toLocaleDateString(dateLocale)}</span>
                                  </div>
                                )}
                              </div>
                            )}

                            {isEditing && (
                              <div className="space-y-2 pt-1">
                                <div className="space-y-1">
                                  <label className="text-[9px] font-semibold text-muted-foreground">Status</label>
                                  <select className="w-full h-7 px-2 rounded-md border border-input bg-background text-[10px] focus:outline-none" value={draft.pciStatus} onChange={e => setSectionDraft({...draft, pciStatus: e.target.value})}>
                                    <option value="not_prepared">{t("cdm.notRequired")}</option>
                                    <option value="prepared">{t("cdm.prepared")}</option>
                                    <option value="distributed">{t("cdm.distributed")}</option>
                                  </select>
                                </div>
                                <div className="space-y-1">
                                  <label className="text-[9px] font-semibold text-muted-foreground">{t("common:date")}</label>
                                  <Input type="date" className="h-7 text-[10px] px-2" value={draft.pciDate || ''} onChange={e => setSectionDraft({...draft, pciDate: e.target.value})} />
                                </div>
                                <Button size="sm" className="h-7 text-xs w-full" disabled={updateMutation.isPending} onClick={() => { updateMutation.mutate({ id: p.id, data: draft }); setEditingSection(null); }}>
                                  {updateMutation.isPending ? t("cdm.saving") : t("cdm.saveSection")}
                                </Button>
                              </div>
                            )}
                          </div>
                        );
                      })()}

                      {/* Section 4: HSF */}
                      {(() => {
                        const isEditing = editingSection === 'hsf';
                        const draft = isEditing ? sectionDraft : {};
                        const isCompliant = ["complete", "handed_over"].includes(p.hsfStatus ?? "");

                        return (
                          <div className={`space-y-2 rounded-md border p-2.5 bg-background ${!isCompliant && p.status === 'complete' ? 'border-amber-200 dark:border-amber-900/50' : ''}`}>
                            <div className="flex items-center justify-between">
                              <h5 className="text-[11px] font-bold uppercase tracking-wider flex items-center gap-1.5">
                                <ClipboardList className="h-3 w-3 text-indigo-600" />
                                4. Health & Safety File
                              </h5>
                              <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => {
                                if (isEditing) setEditingSection(null);
                                else {
                                  setEditingSection('hsf');
                                  setSectionDraft({ hsfStatus: p.hsfStatus, hsfDate: p.hsfDate, hsfNotes: p.hsfNotes });
                                }
                              }}>
                                <Edit className="h-2.5 w-2.5" />
                              </Button>
                            </div>

                            {!isEditing && (
                              <div className="space-y-1.5">
                                <div className="flex items-center justify-between">
                                  <span className="text-[10px] text-muted-foreground">Status</span>
                                  <Badge variant="outline" className={`text-[9px] px-1 py-0 h-4${isCompliant ? ' text-green-600 border-green-600' : ''}`}>
                                    {p.hsfStatus?.replace('_', ' ') || t("cdm.notSet")}
                                  </Badge>
                                </div>
                                {p.hsfDate && (
                                  <div className="flex items-center justify-between">
                                    <span className="text-[10px] text-muted-foreground">{t("common:date")}</span>
                                    <span className="text-[10px] font-medium">{new Date(p.hsfDate).toLocaleDateString(dateLocale)}</span>
                                  </div>
                                )}
                              </div>
                            )}

                            {isEditing && (
                              <div className="space-y-2 pt-1">
                                <div className="space-y-1">
                                  <label className="text-[9px] font-semibold text-muted-foreground">Status</label>
                                  <select className="w-full h-7 px-2 rounded-md border border-input bg-background text-[10px] focus:outline-none" value={draft.hsfStatus} onChange={e => setSectionDraft({...draft, hsfStatus: e.target.value})}>
                                    <option value="not_started">{t("cdm.notStarted")}</option>
                                    <option value="in_progress">{t("cdm.inProgress")}</option>
                                    <option value="complete">{t("cdm.complete")}</option>
                                    <option value="handed_over">{t("cdm.handedOver")}</option>
                                  </select>
                                </div>
                                <div className="space-y-1">
                                  <label className="text-[9px] font-semibold text-muted-foreground">{t("common:date")}</label>
                                  <Input type="date" className="h-7 text-[10px] px-2" value={draft.hsfDate || ''} onChange={e => setSectionDraft({...draft, hsfDate: e.target.value})} />
                                </div>
                                <Button size="sm" className="h-7 text-xs w-full" disabled={updateMutation.isPending} onClick={() => { updateMutation.mutate({ id: p.id, data: draft }); setEditingSection(null); }}>
                                  {updateMutation.isPending ? t("cdm.saving") : t("cdm.saveSection")}
                                </Button>
                              </div>
                            )}
                          </div>
                        );
                      })()}

                      {/* Section 5: Welfare */}
                      {(() => {
                        const isEditing = editingSection === 'welfare';
                        const draft = isEditing ? sectionDraft : {};
                        const welfareItems = [
                          { key: 'welfareToilets', label: t("cdm.toilets") },
                          { key: 'welfareWashing', label: t("cdm.washingFacilities") },
                          { key: 'welfareRestArea', label: t("cdm.restArea") },
                          { key: 'welfareDrinkingWater', label: t("cdm.drinkingWater") },
                          { key: 'welfareChanging', label: t("cdm.changingFacilities") },
                        ];
                        const activeItems = welfareItems.filter(w => !!p[w.key as keyof CdmProject]);

                        return (
                          <div className="space-y-2 rounded-md border p-2.5 bg-background">
                            <div className="flex items-center justify-between">
                              <h5 className="text-[11px] font-bold uppercase tracking-wider flex items-center gap-1.5">
                                <CheckSquareIcon className="h-3 w-3 text-green-600" />
                                5. Welfare Provisions
                              </h5>
                              <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => {
                                if (isEditing) setEditingSection(null);
                                else {
                                  setEditingSection('welfare');
                                  setSectionDraft({
                                    welfareToilets: p.welfareToilets,
                                    welfareWashing: p.welfareWashing,
                                    welfareRestArea: p.welfareRestArea,
                                    welfareDrinkingWater: p.welfareDrinkingWater,
                                    welfareChanging: p.welfareChanging,
                                  });
                                }
                              }}>
                                <Edit className="h-2.5 w-2.5" />
                              </Button>
                            </div>

                            {!isEditing && (
                              <div className="flex flex-wrap gap-1 mt-1">
                                {activeItems.length === 0 && <span className="text-[10px] text-muted-foreground italic">{t("common:none")}</span>}
                                {activeItems.map(w => (
                                  <Badge key={w.key} variant="secondary" className="text-[9px] px-1 py-0 h-4 bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-400 border-green-100 dark:border-green-900">
                                    {w.label}
                                  </Badge>
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
                                  {updateMutation.isPending ? t("cdm.saving") : t("cdm.saveSection")}
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
                        <span className="font-semibold">{t("common:notes")}: </span>{p.notes}
                      </div>
                    )}

                    {/* Actions */}
                    <div className="flex items-center gap-2 pt-1">
                      <Button size="sm" variant="outline" onClick={() => openEdit(p)} className="text-xs">
                        <Edit className="h-3.5 w-3.5 mr-1" />{t("cdm.editProject")}
                      </Button>
                      <Button size="sm" variant="outline" className="text-xs text-red-600 border-red-300 hover:bg-red-50 dark:hover:bg-red-950"
                        onClick={() => { if (window.confirm(t("cdm.deleteProject", { title: p.title }))) deleteMutation.mutate(p.id); }}>
                        <Trash2 className="h-3.5 w-3.5 mr-1" />{t("common:delete")}
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
              <HardHatIcon className="h-5 w-5 text-amber-600" />{t("cdm.addCdmProject")}
            </DialogTitle>
            <div className="flex items-center gap-0">
              {[{ n: 1, label: t("cdm.projectDetails") }, { n: 2, label: t("cdm.f10AndDocuments") }].map((s, i) => (
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
                  <label className="text-sm font-medium">{t("cdm.projectTitle")}</label>
                  <Input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder={t("cdm.officeBlockExtensionPlaceholder")} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">{t("cdm.contractorCompany")}</label>
                  <select className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring" value={form.companyId} onChange={e => setForm({ ...form, companyId: e.target.value })}>
                    <option value="">{t("cdm.selectCompanyPlaceholder")}</option>
                    {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">{t("cdm.cdmRole")}</label>
                  <select className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring" value={form.contractorRole} onChange={e => setForm({ ...form, contractorRole: e.target.value })}>
                    <option value="contractor">{t("contractors:editCompanyDialog.contractor")}</option>
                    <option value="principal_contractor">{t("cdm.principalContractor")}</option>
                    <option value="principal_designer">{t("cdm.principalDesigner")}</option>
                    <option value="designer">{t("cdm.designer")}</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">{t("cdm.clientName")}</label>
                  <Input value={form.clientName} onChange={e => setForm({ ...form, clientName: e.target.value })} placeholder={t("cdm.abcHoldingsPlaceholder")} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">{t("cdm.principalDesignerName")}</label>
                  <Input value={form.principalDesignerName} onChange={e => setForm({ ...form, principalDesignerName: e.target.value })} placeholder={t("cdm.pdNamePlaceholder")} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">{t("common:location")}</label>
                  <Input value={form.location} onChange={e => setForm({ ...form, location: e.target.value })} placeholder={t("cdm.londonPlaceholder")} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">{t("common:status")}</label>
                  <select className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring" value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>
                    <option value="planning">{t("cdm.planning")}</option>
                    <option value="active">{t("cdm.active")}</option>
                    <option value="complete">{t("cdm.complete")}</option>
                    <option value="cancelled">{t("cdm.cancelled")}</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">{t("common:date")} (Start)</label>
                  <Input type="date" value={form.startDate} onChange={e => setForm({ ...form, startDate: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">{t("common:date")} (End)</label>
                  <Input type="date" value={form.endDate} onChange={e => setForm({ ...form, endDate: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">{t("cdm.estimatedDays")}</label>
                  <Input type="number" min="0" value={form.estimatedDays} onChange={e => setForm({ ...form, estimatedDays: e.target.value })} placeholder="30" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">{t("cdm.peakWorkers")}</label>
                  <Input type="number" min="0" value={form.peakWorkers} onChange={e => setForm({ ...form, peakWorkers: e.target.value })} placeholder="20" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">{t("cdm.estimatedPersonDays")}</label>
                  <Input type="number" min="0" value={form.personDays} onChange={e => setForm({ ...form, personDays: e.target.value })} placeholder="500" />
                </div>
                <div className="col-span-2 space-y-1.5">
                  <label className="text-sm font-medium">{t("cdm.description")}</label>
                  <Textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} rows={2} placeholder={t("cdm.descriptionPlaceholder")} />
                </div>
                {/* F10 auto-detection */}
                {isNotifiable({ estimatedDays: form.estimatedDays ? parseInt(form.estimatedDays) : 0, peakWorkers: form.peakWorkers ? parseInt(form.peakWorkers) : 0, personDays: form.personDays ? parseInt(form.personDays) : 0 }) && (
                  <div className="col-span-2 rounded-md bg-amber-50 border border-amber-200 dark:bg-amber-950/30 dark:border-amber-800 p-3 text-xs text-amber-800 dark:text-amber-300 flex items-start gap-2">
                    <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                    <span><Trans i18nKey="cdm.f10ThresholdInfo" ns="contractors" /></span>
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
                      <span className={`text-2xl font-extrabold leading-none ${notifiable ? "text-amber-600" : "text-green-600"}`}>{notifiable ? t("common:yes").toUpperCase() : t("common:no").toUpperCase()}</span>
                      <div>
                        <p className={`text-sm font-semibold ${notifiable ? "text-amber-800 dark:text-amber-300" : "text-green-800 dark:text-green-300"}`}>
                          {notifiable ? t("cdm.isNotifiableHse") : t("cdm.isNotNotifiableHse")}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {notifiable
                            ? t("cdm.notificationRequired", { days: days, peak: peak }) + (daysThreshold && personDaysThreshold ? "; " : "") + (personDaysThreshold ? t("cdm.personDaysInfo", { count: persons }) : "") + ". " + t("cdm.f10NoticeMustBeSubmitted")
                            : t("cdm.belowThresholdInfo")}
                        </p>
                      </div>
                    </div>
                  );
                })()}

                {/* S1 — F10 */}
                <div className="rounded-md border border-border p-3 space-y-2">
                  <h4 className="font-medium text-sm flex items-center gap-2"><AlertCircle className="h-4 w-4 text-amber-600" />1. {t("cdm.f10HseNotification")}</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium">{t("common:status")}</label>
                      <select className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm focus:outline-none" value={form.f10Status} onChange={e => setForm({ ...form, f10Status: e.target.value })}>
                        <option value="not_required">{t("cdm.notRequired")}</option>
                        <option value="pending">{t("common:pending")}</option>
                        <option value="submitted">{t("cdm.submitted")}</option>
                      </select>
                    </div>
                    {(form.f10Status === "submitted" || form.f10Status === "pending") && (
                      <>
                        <div className="space-y-1.5"><label className="text-xs font-medium">{t("cdm.dateSubmitted")}</label><Input type="date" value={form.f10Date} onChange={e => setForm({ ...form, f10Date: e.target.value })} /></div>
                        <div className="space-y-1.5"><label className="text-xs font-medium">{t("cdm.hseReference")}</label><Input value={form.f10Reference} onChange={e => setForm({ ...form, f10Reference: e.target.value })} placeholder="F10 ref" /></div>
                      </>
                    )}
                    <div className="sm:col-span-2 space-y-1.5"><label className="text-xs font-medium">{t("common:notes")}</label><Input value={form.f10Notes} onChange={e => setForm({ ...form, f10Notes: e.target.value })} placeholder={t("cdm.optionalNotes")} /></div>
                  </div>
                </div>

                {/* S2 — CPP */}
                <div className="rounded-md border border-border p-3 space-y-2">
                  <h4 className="font-medium text-sm flex items-center gap-2"><ClipboardList className="h-4 w-4 text-blue-600" />2. {t("cdm.cpp")}</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium">{t("common:status")}</label>
                      <select className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm focus:outline-none" value={form.cppStatus} onChange={e => setForm({ ...form, cppStatus: e.target.value })}>
                        <option value="not_prepared">{t("cdm.notRequired")}</option>
                        <option value="in_progress">{t("cdm.inProgress")}</option>
                        <option value="approved">{t("cdm.approved")}</option>
                      </select>
                    </div>
                    <div className="space-y-1.5"><label className="text-xs font-medium">{t("common:date")}</label><Input type="date" value={form.cppDate} onChange={e => setForm({ ...form, cppDate: e.target.value })} /></div>
                    <div className="sm:col-span-2 space-y-1.5"><label className="text-xs font-medium">{t("common:notes")}</label><Input value={form.cppNotes} onChange={e => setForm({ ...form, cppNotes: e.target.value })} placeholder={t("cdm.optionalNotes")} /></div>
                  </div>
                </div>

                {/* S3 — PCI */}
                <div className="rounded-md border border-border p-3 space-y-2">
                  <h4 className="font-medium text-sm flex items-center gap-2"><ClipboardList className="h-4 w-4 text-purple-600" />3. {t("cdm.pci")}</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium">{t("common:status")}</label>
                      <select className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm focus:outline-none" value={form.pciStatus} onChange={e => setForm({ ...form, pciStatus: e.target.value })}>
                        <option value="not_prepared">{t("cdm.notRequired")}</option>
                        <option value="prepared">{t("cdm.prepared")}</option>
                        <option value="distributed">{t("cdm.distributed")}</option>
                      </select>
                    </div>
                    <div className="space-y-1.5"><label className="text-xs font-medium">{t("common:date")}</label><Input type="date" value={form.pciDate} onChange={e => setForm({ ...form, pciDate: e.target.value })} /></div>
                    <div className="sm:col-span-2 space-y-1.5"><label className="text-xs font-medium">{t("common:notes")}</label><Input value={form.pciNotes} onChange={e => setForm({ ...form, pciNotes: e.target.value })} placeholder={t("cdm.optionalNotes")} /></div>
                  </div>
                </div>

                {/* S4 — HSF */}
                <div className="rounded-md border border-border p-3 space-y-2">
                  <h4 className="font-medium text-sm flex items-center gap-2"><ClipboardList className="h-4 w-4 text-indigo-600" />4. {t("cdm.hsf")}</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium">{t("common:status")}</label>
                      <select className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm focus:outline-none" value={form.hsfStatus} onChange={e => setForm({ ...form, hsfStatus: e.target.value })}>
                        <option value="not_started">{t("cdm.notStarted")}</option>
                        <option value="in_progress">{t("cdm.inProgress")}</option>
                        <option value="complete">{t("cdm.complete")}</option>
                        <option value="handed_over">{t("cdm.handedOver")}</option>
                      </select>
                    </div>
                    <div className="space-y-1.5"><label className="text-xs font-medium">{t("common:date")}</label><Input type="date" value={form.hsfDate} onChange={e => setForm({ ...form, hsfDate: e.target.value })} /></div>
                    <div className="sm:col-span-2 space-y-1.5"><label className="text-xs font-medium">{t("common:notes")}</label><Input value={form.hsfNotes} onChange={e => setForm({ ...form, hsfNotes: e.target.value })} placeholder={t("cdm.optionalNotes")} /></div>
                  </div>
                </div>

                {/* S5 — Welfare */}
                <div className="rounded-md border border-border p-3 space-y-2">
                  <h4 className="font-medium text-sm flex items-center gap-2"><CheckSquareIcon className="h-4 w-4 text-green-600" />5. {t("cdm.welfareProvisions")}</h4>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {[
                      { key: "welfareToilets" as const, label: t("cdm.toilets") },
                      { key: "welfareWashing" as const, label: t("cdm.washingFacilities") },
                      { key: "welfareRestArea" as const, label: t("cdm.restArea") },
                      { key: "welfareDrinkingWater" as const, label: t("cdm.drinkingWater") },
                      { key: "welfareChanging" as const, label: t("cdm.changingFacilities") },
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
                  <label className="text-sm font-medium">{t("cdm.generalNotes")}</label>
                  <Textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} rows={2} placeholder="Any additional CDM notes…" />
                </div>
              </div>
            )}
          </div>

          <div className="flex-shrink-0 px-6 py-4 border-t flex justify-between">
            <Button variant="outline" onClick={() => { if (addStep === 1) { setShowAddDialog(false); setForm(emptyForm); } else setAddStep(1); }}>
              {addStep === 1 ? t("common:cancel") : t("common:back")}
            </Button>
            {addStep === 1 ? (
              <Button onClick={() => setAddStep(2)} disabled={!form.title || !form.companyId} className="bg-amber-600 hover:bg-amber-700 text-white">
                {t("cdm.nextF10")}
              </Button>
            ) : (
              <Button onClick={() => createMutation.mutate(form)} disabled={createMutation.isPending} className="bg-amber-600 hover:bg-amber-700 text-white">
                {createMutation.isPending ? t("common:saving") : t("cdm.createCdmProject")}
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Project Dialog */}
      <Dialog open={!!editingProject} onOpenChange={(open) => { if (!open) setEditingProject(null); }}>
        <DialogContent className="w-[95vw] sm:max-w-2xl max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><HardHatIcon className="h-5 w-5 text-amber-600" />{t("cdm.editProject")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-5 pt-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="col-span-2 space-y-1.5">
                <label className="text-sm font-medium">{t("cdm.projectTitle")}</label>
                <Input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">{t("cdm.cdmRole")}</label>
                <select className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring" value={form.contractorRole} onChange={e => setForm({ ...form, contractorRole: e.target.value })}>
                  <option value="contractor">{t("contractors:editCompanyDialog.contractor")}</option>
                  <option value="principal_contractor">{t("cdm.principalContractor")}</option>
                  <option value="principal_designer">{t("cdm.principalDesigner")}</option>
                  <option value="designer">{t("cdm.designer")}</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">{t("common:status")}</label>
                <select className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring" value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>
                  <option value="planning">{t("cdm.planning")}</option>
                  <option value="active">{t("cdm.active")}</option>
                  <option value="complete">{t("cdm.complete")}</option>
                  <option value="cancelled">{t("cdm.cancelled")}</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">{t("cdm.clientName")}</label>
                <Input value={form.clientName} onChange={e => setForm({ ...form, clientName: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">{t("cdm.principalDesignerName")}</label>
                <Input value={form.principalDesignerName} onChange={e => setForm({ ...form, principalDesignerName: e.target.value })} placeholder={t("cdm.pdNamePlaceholder")} />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">{t("common:location")}</label>
                <Input value={form.location} onChange={e => setForm({ ...form, location: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">{t("common:date")} (Start)</label>
                <Input type="date" value={form.startDate} onChange={e => setForm({ ...form, startDate: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">{t("common:date")} (End)</label>
                <Input type="date" value={form.endDate} onChange={e => setForm({ ...form, endDate: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">{t("cdm.estDays")}</label>
                <Input type="number" min="0" value={form.estimatedDays} onChange={e => setForm({ ...form, estimatedDays: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">{t("cdm.peakWorkers")}</label>
                <Input type="number" min="0" value={form.peakWorkers} onChange={e => setForm({ ...form, peakWorkers: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">{t("cdm.estimatedPersonDays")}</label>
                <Input type="number" min="0" value={form.personDays} onChange={e => setForm({ ...form, personDays: e.target.value })} />
              </div>
            </div>

            {/* Five compliance sections */}
            <div className="space-y-3">
              <p className="text-sm font-semibold">{t("cdm.complianceSections")}</p>

              {/* S1 — F10 */}
              <div className="rounded-md border border-border p-3 space-y-2">
                <h4 className="text-xs font-semibold flex items-center gap-1.5"><AlertCircle className="h-3.5 w-3.5 text-amber-600" />1. {t("cdm.f10HseNotification")}</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div className="space-y-1"><label className="text-xs text-muted-foreground">{t("common:status")}</label>
                    <select className="w-full h-8 px-2 rounded-md border border-input bg-background text-xs focus:outline-none" value={form.f10Status} onChange={e => setForm({ ...form, f10Status: e.target.value })}>
                      <option value="not_required">{t("cdm.notRequired")}</option><option value="pending">{t("common:pending")}</option><option value="submitted">{t("cdm.submitted")}</option>
                    </select>
                  </div>
                  <div className="space-y-1"><label className="text-xs text-muted-foreground">{t("cdm.dateSubmitted")}</label><Input type="date" className="h-8 text-xs" value={form.f10Date} onChange={e => setForm({ ...form, f10Date: e.target.value })} /></div>
                  <div className="space-y-1"><label className="text-xs text-muted-foreground">{t("cdm.hseReference")}</label><Input className="h-8 text-xs" value={form.f10Reference} onChange={e => setForm({ ...form, f10Reference: e.target.value })} /></div>
                  <div className="space-y-1"><label className="text-xs text-muted-foreground">{t("common:notes")}</label><Input className="h-8 text-xs" value={form.f10Notes} onChange={e => setForm({ ...form, f10Notes: e.target.value })} /></div>
                </div>
              </div>

              {/* S2 — CPP */}
              <div className="rounded-md border border-border p-3 space-y-2">
                <h4 className="text-xs font-semibold flex items-center gap-1.5"><ClipboardList className="h-3.5 w-3.5 text-blue-600" />2. {t("cdm.cpp")}</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div className="space-y-1"><label className="text-xs text-muted-foreground">{t("common:status")}</label>
                    <select className="w-full h-8 px-2 rounded-md border border-input bg-background text-xs focus:outline-none" value={form.cppStatus} onChange={e => setForm({ ...form, cppStatus: e.target.value })}>
                      <option value="not_prepared">{t("cdm.notRequired")}</option><option value="in_progress">{t("cdm.inProgress")}</option><option value="approved">{t("cdm.approved")}</option>
                    </select>
                  </div>
                  <div className="space-y-1"><label className="text-xs text-muted-foreground">{t("common:date")}</label><Input type="date" className="h-8 text-xs" value={form.cppDate} onChange={e => setForm({ ...form, cppDate: e.target.value })} /></div>
                  <div className="sm:col-span-2 space-y-1"><label className="text-xs text-muted-foreground">{t("common:notes")}</label><Input className="h-8 text-xs" value={form.cppNotes} onChange={e => setForm({ ...form, cppNotes: e.target.value })} /></div>
                </div>
              </div>

              {/* S3 — PCI */}
              <div className="rounded-md border border-border p-3 space-y-2">
                <h4 className="text-xs font-semibold flex items-center gap-1.5"><ClipboardList className="h-3.5 w-3.5 text-purple-600" />3. {t("cdm.pci")}</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div className="space-y-1"><label className="text-xs text-muted-foreground">{t("common:status")}</label>
                    <select className="w-full h-8 px-2 rounded-md border border-input bg-background text-xs focus:outline-none" value={form.pciStatus} onChange={e => setForm({ ...form, pciStatus: e.target.value })}>
                      <option value="not_prepared">{t("cdm.notRequired")}</option><option value="prepared">{t("cdm.prepared")}</option><option value="distributed">{t("cdm.distributed")}</option>
                    </select>
                  </div>
                  <div className="space-y-1"><label className="text-xs text-muted-foreground">{t("common:date")}</label><Input type="date" className="h-8 text-xs" value={form.pciDate} onChange={e => setForm({ ...form, pciDate: e.target.value })} /></div>
                  <div className="sm:col-span-2 space-y-1"><label className="text-xs text-muted-foreground">{t("common:notes")}</label><Input className="h-8 text-xs" value={form.pciNotes} onChange={e => setForm({ ...form, pciNotes: e.target.value })} /></div>
                </div>
              </div>

              {/* S4 — HSF */}
              <div className="rounded-md border border-border p-3 space-y-2">
                <h4 className="text-xs font-semibold flex items-center gap-1.5"><ClipboardList className="h-3.5 w-3.5 text-indigo-600" />4. {t("cdm.hsf")}</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div className="space-y-1"><label className="text-xs text-muted-foreground">{t("common:status")}</label>
                    <select className="w-full h-8 px-2 rounded-md border border-input bg-background text-xs focus:outline-none" value={form.hsfStatus} onChange={e => setForm({ ...form, hsfStatus: e.target.value })}>
                      <option value="not_started">{t("cdm.notStarted")}</option><option value="in_progress">{t("cdm.inProgress")}</option><option value="complete">{t("cdm.complete")}</option><option value="handed_over">{t("cdm.handedOver")}</option>
                    </select>
                  </div>
                  <div className="space-y-1"><label className="text-xs text-muted-foreground">{t("common:date")}</label><Input type="date" className="h-8 text-xs" value={form.hsfDate} onChange={e => setForm({ ...form, hsfDate: e.target.value })} /></div>
                  <div className="sm:col-span-2 space-y-1"><label className="text-xs text-muted-foreground">{t("common:notes")}</label><Input className="h-8 text-xs" value={form.hsfNotes} onChange={e => setForm({ ...form, hsfNotes: e.target.value })} /></div>
                </div>
              </div>

              {/* S5 — Welfare */}
              <div className="rounded-md border border-border p-3 space-y-2">
                <h4 className="text-xs font-semibold flex items-center gap-1.5"><CheckSquareIcon className="h-3.5 w-3.5 text-green-600" />5. {t("cdm.welfareProvisions")}</h4>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {[
                    { key: "welfareToilets" as const, label: t("cdm.toilets") },
                    { key: "welfareWashing" as const, label: t("cdm.washing") },
                    { key: "welfareRestArea" as const, label: t("cdm.restArea") },
                    { key: "welfareDrinkingWater" as const, label: t("cdm.drinkingWater") },
                    { key: "welfareChanging" as const, label: t("cdm.changing") },
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
              <label className="text-sm font-medium">{t("cdm.generalNotes")}</label>
              <Textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} rows={2} />
            </div>
          </div>
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setEditingProject(null)}>{t("common:cancel")}</Button>
            <Button onClick={() => editingProject && updateMutation.mutate({ id: editingProject.id, data: form })} disabled={updateMutation.isPending || !form.title} className="bg-amber-600 hover:bg-amber-700 text-white">
              {updateMutation.isPending ? t("common:saving") : t("common:saveChanges")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* PDF Export Filter Dialog */}
      <Dialog open={showPdfFilterDialog} onOpenChange={handlePdfDialogOpenChange}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("cdm.exportCdmPdf")}</DialogTitle>
            <DialogDescription>{t("cdm.pdfFilterDesc")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">{t("cdm.contractorCompany")}</Label>
              <Select value={pdfCompanyFilter} onValueChange={(val) => { setPdfCompanyFilter(val); try { localStorage.setItem("cdm_pdf_last_company", val); } catch {} }}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder={t("cdm.allCompanies")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("cdm.allCompanies")}</SelectItem>
                  {companies.map(c => (
                    <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">{t("common:status")}</Label>
              <Select value={pdfStatusFilter} onValueChange={setPdfStatusFilter}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder={t("cdm.allStatuses")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("cdm.allStatuses")}</SelectItem>
                  <SelectItem value="planning">{t("cdm.planning")}</SelectItem>
                  <SelectItem value="active">{t("cdm.active")}</SelectItem>
                  <SelectItem value="complete">{t("cdm.complete")}</SelectItem>
                  <SelectItem value="cancelled">{t("cdm.cancelled")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">{t("cdm.startDateFrom")}</Label>
                <Input
                  type="date"
                  className="h-9 text-sm"
                  value={pdfFromDate}
                  onChange={e => setPdfFromDate(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">{t("cdm.startDateTo")}</Label>
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
              {t("cdm.clearFilters")}
            </Button>
            <Button variant="outline" onClick={() => handlePdfDialogOpenChange(false)}>{t("common:cancel")}</Button>
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
              <Download className="h-3.5 w-3.5 mr-1.5" />{t("cdm.generatePdf")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
