import { useState, useEffect, useRef, useMemo } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import GlassCard from "@/components/GlassCard";
import { StaffSearchSelect } from "@/components/StaffSearchSelect";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import WalkInContractorForm from "@/components/WalkInContractorForm";
import ContractorPassPreviewModal from "@/components/ContractorPassPreviewModal";
// Removed EditContractorWorkerModal import - now using comprehensive ContractorEditModal
import { ContractorEditModal } from "@/components/ContractorEditModal";
import ContractorPreBooking from "@/components/ContractorPreBooking";
import ContractorHSModal from "@/components/ContractorHSModal";
import { CO2SustainabilityReports } from "@/components/CO2SustainabilityReports";
import HSDocumentAssignment from "@/components/HSDocumentAssignment";
import RAMSManagement from "@/components/RAMSManagement";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarPicker } from "@/components/ui/calendar";
import { format } from "date-fns";
import { 
  HardHat, 
  Clock, 
  Building2, 
  Search,
  CheckCircle,
  AlertTriangle,
  LogIn,
  LogOut,
  Edit,
  Trash2,
  History,
  UserPlus,
  CalendarPlus,
  Mail,
  Plus,
  User,
  Users,
  Leaf,
  Shield,
  LayoutGrid,
  List,
  Lock,
  FileText,
  CheckSquare,
  Square,
  ChevronRight,
  Zap,
  Phone,
  Camera,
  QrCode,
  Printer,
  Download,
  ShieldOff,
  Wrench,
  CalendarDays,
  ExternalLink,
  HardHat as HardHatIcon,
  ClipboardList,
  AlertCircle,
  ChevronDown,
  CheckSquare as CheckSquareIcon,
  Globe,
  MapPin,
} from "lucide-react";

import type { ContractorCompany, ContractorWorker } from "@shared/schema";
import QRScannerModal from "@/components/QRScannerModal";

// Extended type for list view with computed fields
// CDM 2015 fields (cdmRole, constructionlineGrade, chasCertified, smasAccredited,
// otherAccreditations, pdProfessionalBody) are now in the base ContractorCompany type
// from shared/schema.ts, so no extra declarations are needed here.
type ExtendedContractorCompany = ContractorCompany & {
  workersCount?: number;
  documentsStatus?: Record<string, string>;
  hasRedCard?: boolean;
  hasYellowCard?: boolean;
  serviceType?: string;
  contactEmail?: string;
};

// ── ContractorPPMTab ──────────────────────────────────────────────────────────
// Shows PPM work orders grouped by contractor company so site managers can
// see at a glance what maintenance tasks are assigned to each contractor.

type PpmWorkOrderSummary = {
  id: string;
  title: string;
  status: string;
  dueDate?: string | null;
  contractorCompanyId?: string | null;
  contractorCompanyName?: string | null;
  contractorWorkerName?: string | null;
  assignedEmail?: string | null;
  requiresCertificate?: boolean | null;
  certificateUploadedAt?: string | null;
  assetName?: string | null;
};

const PPM_STATUS_BADGE: Record<string, { label: string; className: string }> = {
  scheduled:   { label: "Scheduled",   className: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300" },
  in_progress: { label: "In Progress", className: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300" },
  completed:   { label: "Completed",   className: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300" },
  overdue:     { label: "Overdue",     className: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300" },
};

function ContractorPPMTab() {
  const [search, setSearch] = useState("");

  const { data: workOrders = [], isLoading } = useQuery<PpmWorkOrderSummary[]>({
    queryKey: ["/api/ppm/work-orders"],
  });

  // Only show work orders that are assigned to a contractor
  const assigned = workOrders.filter(wo => wo.contractorCompanyId || wo.contractorCompanyName);

  // Group by contractor company
  const grouped = assigned.reduce<Record<string, { companyName: string; items: PpmWorkOrderSummary[] }>>((acc, wo) => {
    const key = wo.contractorCompanyId ?? wo.contractorCompanyName ?? "unassigned";
    const label = wo.contractorCompanyName ?? "Unknown Company";
    if (!acc[key]) acc[key] = { companyName: label, items: [] };
    acc[key].items.push(wo);
    return acc;
  }, {});

  // Apply search filter across company name, worker name, or work order title
  const filtered = Object.entries(grouped).filter(([, group]) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      group.companyName.toLowerCase().includes(q) ||
      group.items.some(wo =>
        wo.title.toLowerCase().includes(q) ||
        (wo.contractorWorkerName?.toLowerCase().includes(q))
      )
    );
  });

  if (isLoading) {
    return (
      <GlassCard className="p-8 text-center text-muted-foreground">
        Loading PPM work orders…
      </GlassCard>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary + search */}
      <GlassCard className="p-4">
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
          <div>
            <h3 className="font-semibold text-fixed">PPM Work Orders by Contractor</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              {assigned.length} work order{assigned.length !== 1 ? "s" : ""} assigned across {Object.keys(grouped).length} contractor{Object.keys(grouped).length !== 1 ? "s" : ""}
            </p>
          </div>
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <div className="relative flex-1 sm:w-64">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <input
                className="w-full h-8 pl-8 pr-3 text-xs rounded-md border border-input bg-background focus:outline-none focus:ring-1 focus:ring-ring"
                placeholder="Search contractors or tasks…"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
            <a href="/ppm" className="flex items-center gap-1.5 text-xs text-primary hover:underline whitespace-nowrap">
              <ExternalLink className="h-3.5 w-3.5" />
              Open PPM
            </a>
          </div>
        </div>
      </GlassCard>

      {filtered.length === 0 && (
        <GlassCard className="p-12 text-center">
          <Wrench className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-sm font-medium text-muted-foreground">
            {search ? "No results match your search." : "No PPM work orders are currently assigned to contractors."}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Assign contractors to work orders from the <a href="/ppm" className="text-primary hover:underline">PPM module</a>.
          </p>
        </GlassCard>
      )}

      {/* One card per contractor company */}
      {filtered.map(([key, group]) => {
        const overdueCount = group.items.filter(wo => wo.status === "overdue").length;
        const pendingCertCount = group.items.filter(wo => wo.status === "completed" && wo.requiresCertificate && !wo.certificateUploadedAt).length;
        return (
          <GlassCard key={key} className="p-0 overflow-hidden">
            {/* Company header */}
            <div className="flex items-center justify-between px-4 py-3 bg-muted/30 border-b border-border">
              <div className="flex items-center gap-2.5">
                <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <Building2 className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <p className="font-semibold text-sm text-fixed">{group.companyName}</p>
                  <p className="text-xs text-muted-foreground">{group.items.length} work order{group.items.length !== 1 ? "s" : ""}</p>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                {overdueCount > 0 && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300">
                    <AlertTriangle className="h-3 w-3" />{overdueCount} overdue
                  </span>
                )}
                {pendingCertCount > 0 && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
                    <Shield className="h-3 w-3" />{pendingCertCount} cert pending
                  </span>
                )}
              </div>
            </div>
            {/* Work orders list */}
            <div className="divide-y divide-border">
              {group.items.map(wo => {
                const badge = PPM_STATUS_BADGE[wo.status] ?? { label: wo.status, className: "bg-gray-100 text-gray-700" };
                const isOverdue = wo.status === "overdue";
                const awaitingCert = wo.status === "completed" && wo.requiresCertificate && !wo.certificateUploadedAt;
                return (
                  <div key={wo.id} className={`flex items-start justify-between gap-3 px-4 py-3 hover:bg-muted/20 transition-colors ${isOverdue ? "bg-red-50/40 dark:bg-red-950/20" : ""}`}>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm text-fixed truncate">{wo.title}</span>
                        <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${badge.className}`}>
                          {badge.label}
                        </span>
                        {awaitingCert && (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
                            <Shield className="h-2.5 w-2.5" />Cert needed
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-1 flex-wrap">
                        {wo.contractorWorkerName && (
                          <span className="text-xs text-muted-foreground flex items-center gap-1">
                            <User className="h-3 w-3" />{wo.contractorWorkerName}
                          </span>
                        )}
                        {wo.dueDate && (
                          <span className={`text-xs flex items-center gap-1 ${isOverdue ? "text-red-600 font-medium" : "text-muted-foreground"}`}>
                            <CalendarDays className="h-3 w-3" />Due: {new Date(wo.dueDate).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
                          </span>
                        )}
                      </div>
                    </div>
                    <a
                      href={`/ppm?wo=${wo.id}`}
                      className="flex-shrink-0 flex items-center gap-1 text-xs text-primary hover:underline mt-0.5"
                    >
                      <ExternalLink className="h-3 w-3" />View
                    </a>
                  </div>
                );
              })}
            </div>
          </GlassCard>
        );
      })}
    </div>
  );
}

// ── CDM 2015 Project Register ─────────────────────────────────────────────────

type CdmProject = {
  id: string;
  companyId: string;
  title: string;
  description?: string | null;
  location?: string | null;
  clientName?: string | null;
  contractorRole: string;
  principalContractorId?: string | null;
  principalDesignerName?: string | null;
  status: string;
  startDate?: string | null;
  endDate?: string | null;
  estimatedDays?: number | null;
  peakWorkers?: number | null;
  personDays?: number | null;
  // Section 1 — F10
  f10Status: string;
  f10Date?: string | null;
  f10Reference?: string | null;
  f10Notes?: string | null;
  f10AlertSentAt?: string | null;
  // Section 2 — CPP
  cppStatus: string;
  cppDate?: string | null;
  cppNotes?: string | null;
  // Section 3 — PCI
  pciStatus: string;
  pciDate?: string | null;
  pciNotes?: string | null;
  // Section 4 — HSF
  hsfStatus: string;
  hsfDate?: string | null;
  hsfNotes?: string | null;
  // Section 5 — Welfare
  welfareToilets?: boolean | null;
  welfareWashing?: boolean | null;
  welfareRestArea?: boolean | null;
  welfareDrinkingWater?: boolean | null;
  welfareChanging?: boolean | null;
  notes?: string | null;
  createdAt?: string | null;
};

const CDM_ROLE_LABELS: Record<string, string> = {
  principal_contractor: "Principal Contractor",
  principal_designer: "Principal Designer",
  contractor: "Contractor",
  designer: "Designer",
  client: "Client",
};

const CDM_STATUS_BADGE: Record<string, { label: string; className: string }> = {
  planning:  { label: "Planning",  className: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300" },
  active:    { label: "Active",    className: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300" },
  complete:  { label: "Complete",  className: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300" },
  cancelled: { label: "Cancelled", className: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300" },
};

/** Returns true when the project is notifiable under CDM 2015 Reg 6 */
function isNotifiable(p: { estimatedDays?: number | null; peakWorkers?: number | null; personDays?: number | null }): boolean {
  const daysOk = (p.estimatedDays ?? 0) > 30 && (p.peakWorkers ?? 0) > 20;
  const personDaysOk = (p.personDays ?? 0) > 500;
  return daysOk || personDaysOk;
}

/** F10 overdue = notifiable project, F10 not yet submitted, and start date is in the past */
function isF10Overdue(p: CdmProject): boolean {
  if (!isNotifiable(p)) return false;
  if (p.f10Status === "submitted") return false;
  if (!p.startDate) return false;
  return new Date(p.startDate) < new Date();
}

/** Compliance score: how many of the 5 sections are fully green */
function complianceScore(p: CdmProject): number {
  let score = 0;
  if (!isNotifiable(p) || p.f10Status === "submitted") score++;
  if (p.cppStatus === "approved") score++;
  if (p.pciStatus === "distributed") score++;
  if (p.hsfStatus === "complete" || p.hsfStatus === "handed_over") score++;
  const welfareAll = p.welfareToilets && p.welfareWashing && p.welfareRestArea && p.welfareDrinkingWater && p.welfareChanging;
  if (welfareAll) score++;
  return score;
}

function ContractorCDMTab({ companies }: { companies: any[] }) {
  const { toast } = useToast();
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
    queryKey: ["/api/cdm/projects"],
  });

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/cdm/projects", data);
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cdm/projects"] });
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
      queryClient.invalidateQueries({ queryKey: ["/api/cdm/projects"] });
      setSelectedProject(updated);
      setEditingProject(null);
      toast({ title: "CDM Project updated" });
    },
    onError: () => toast({ title: "Error", description: "Failed to update CDM project", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => apiRequest("DELETE", `/api/cdm/projects/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cdm/projects"] });
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

export default function ContractorManagement() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [showQRScanner, setShowQRScanner] = useState(false);
  const [activeTab, setActiveTab] = useState<"previous" | "walkin" | "prebook" | "contractors" | "co2" | "assign-hs" | "rams" | "ppm" | "cdm">("previous");
  const [selectedCO2CompanyId, setSelectedCO2CompanyId] = useState<string>("");
  const [searchTerm, setSearchTerm] = useState("");

  // Enhanced search filter function
  const matchesSearch = (company: any, search: string) => {
    if (!search) return true;
    const searchLower = search.toLowerCase();
    return (
      (company.name || "").toLowerCase().includes(searchLower) ||
      ((company.contactEmail || company.email) || "").toLowerCase().includes(searchLower) ||
      (company.phone || "").toLowerCase().includes(searchLower) ||
      (company.industry || "").toLowerCase().includes(searchLower) ||
      (company.address || "").toLowerCase().includes(searchLower) ||
      (company.description || "").toLowerCase().includes(searchLower) ||
      (company.contactFirstName || "").toLowerCase().includes(searchLower) ||
      (company.contactLastName || "").toLowerCase().includes(searchLower)
    );
  };
  const [showWalkInForm, setShowWalkInForm] = useState(false);
  const [showAllWorkers, setShowAllWorkers] = useState(false);
  const [showAllCompanies, setShowAllCompanies] = useState(false);
  const [companyViewMode, setCompanyViewMode] = useState<'grid' | 'list'>('grid');
  const [previousViewMode, setPreviousViewMode] = useState<'grid' | 'list'>('list');
  const [showPassPreview, setShowPassPreview] = useState(false);
  const [selectedWorker, setSelectedWorker] = useState<ContractorWorker | null>(null);
  const [selectedCompanyName, setSelectedCompanyName] = useState<string>("");
  // Removed unused showEditWorkerModal and workerToEdit - now using comprehensive modal
  const [showAddContractorDialog, setShowAddContractorDialog] = useState(false);
  const [showContractorEditModal, setShowContractorEditModal] = useState(false);
  const [showCompanyEditDialog, setShowCompanyEditDialog] = useState(false);
  const [selectedWorkerForEdit, setSelectedWorkerForEdit] = useState<ContractorWorker | null>(null);
  const [selectedWorkerCompanyName, setSelectedWorkerCompanyName] = useState<string>("");
  const [showAddWorkerDialog, setShowAddWorkerDialog] = useState(false);
  const [selectedContractor, setSelectedContractor] = useState<ContractorCompany | null>(null);
  const [showHSModal, setShowHSModal] = useState(false);
  const [cdmAccreditationForm, setCdmAccreditationForm] = useState({
    cdmRole: "" as string,
    constructionlineGrade: "" as string, // not_registered | registered | silver | gold | platinum
    chasCertified: false,
    smasAccredited: false,
    otherAccreditations: "",
    pdProfessionalBody: "",
  });
  const [workerForCheckIn, setWorkerForCheckIn] = useState<ContractorWorker | null>(null);
  const [companyForCheckIn, setCompanyForCheckIn] = useState<string>("");
  const [preBookingWorker, setPreBookingWorker] = useState<ContractorWorker | null>(null);
  const [preBookDate, setPreBookDate] = useState(new Date());
  const [preBookTime, setPreBookTime] = useState(() => {
    const now = new Date();
    const nextHour = new Date(now);
    nextHour.setMinutes(0);
    nextHour.setHours(nextHour.getHours() + 1);
    return `${String(nextHour.getHours()).padStart(2, '0')}:00`;
  });
  const [preBookPurpose, setPreBookPurpose] = useState("Site work");
  const [preBookDuration, setPreBookDuration] = useState("8");
  const [preBookNotes, setPreBookNotes] = useState("");
  const [preBookCompanyName, setPreBookCompanyName] = useState("");
  const [preBookHost, setPreBookHost] = useState('');
  const [showCheckInHostDialog, setShowCheckInHostDialog] = useState(false);
  const [checkInWorkerId, setCheckInWorkerId] = useState<string | null>(null);
  const [checkInWorkerName, setCheckInWorkerName] = useState('');
  const [selectedCheckInHost, setSelectedCheckInHost] = useState('');
  const [viewingWorker, setViewingWorker] = useState<any | null>(null);
  const [qrPassWorker, setQrPassWorker] = useState<any | null>(null);
  const [qrPassData, setQrPassData] = useState<{ qrCode: string; workerName: string } | null>(null);
  const [isUploadingWorkerPhoto, setIsUploadingWorkerPhoto] = useState(false);
  const workerPhotoInputId = "worker-photo-upload-input";
  
  // Form states for adding contractor
  const [contractorForm, setContractorForm] = useState({
    name: "",
    email: "",
    contactFirstName: "",
    contactLastName: "",
    phone: "",
    address: "",
    postcode: "",
    website: "",
    description: "",
    industry: "",
    status: "pending" as "pending" | "approved" | "suspended"
  });

  const [isGeneratingDescription, setIsGeneratingDescription] = useState(false);

  // Company wizard state
  const [addWizardStep, setAddWizardStep] = useState(1);
  const [docChecklist, setDocChecklist] = useState({
    publicLiability: false,
    employersLiability: false,
    cisRegistration: false,
    healthSafetyPolicy: false,
    rams: false,
    modernSlavery: false,
    environmentalPolicy: false,
    professionalIndemnity: false,
  });

  // Worker wizard state (for the add worker dialog)
  const [workerWizardStep, setWorkerWizardStep] = useState(1);

  // Stores the newly created company after step 3 submit (used for "Add First Worker" flow)
  const [justCreatedCompany, setJustCreatedCompany] = useState<any>(null);

  const resetAddWizard = () => {
    setAddWizardStep(1);
    setJustCreatedCompany(null);
    setDocChecklist({ publicLiability: false, employersLiability: false, cisRegistration: false, healthSafetyPolicy: false, rams: false, modernSlavery: false, environmentalPolicy: false, professionalIndemnity: false });
    setContractorForm({ name: "", email: "", contactFirstName: "", contactLastName: "", phone: "", address: "", postcode: "", website: "", description: "", industry: "", status: "pending" });
  };

  const [workerWizardSavedName, setWorkerWizardSavedName] = useState("");

  const resetWorkerWizard = () => {
    setWorkerWizardStep(1);
    setWorkerWizardSavedName("");
    setWorkerForm({ companyId: "", firstName: "", lastName: "", email: "", phone: "", postcode: "", transportMethod: "car_diesel", rightToWork: "pending", cscsCard: "", cscsStatus: "pending", ipafStatus: "none", asbestosAwareness: false, manualHandling: false, workingAtHeight: false, inductionCompleted: false, isActive: true });
  };

  // UK Compliance Document framework
  const UK_LEGAL_DOCS = [
    { key: "publicLiability" as const, name: "Public Liability Insurance", basis: "Common law duty of care", note: "Minimum £2m recommended" },
    { key: "employersLiability" as const, name: "Employers' Liability Insurance", basis: "Employers' Liability Act 1969", note: "Minimum £5m — required if they employ anyone" },
    { key: "cisRegistration" as const, name: "CIS Registration", basis: "Finance Act 2004", note: "Construction industry only — skip if not applicable" },
  ];
  const UK_SITE_DOCS = [
    { key: "healthSafetyPolicy" as const, name: "Health & Safety Policy", basis: "H&S at Work Act 1974", note: "Required before work commences" },
    { key: "rams" as const, name: "Risk Assessment & Method Statement (RAMS)", basis: "MHSWR 1999", note: "Site-specific — required before each job" },
  ];
  const UK_GOOD_DOCS = [
    { key: "modernSlavery" as const, name: "Modern Slavery Statement", basis: "Modern Slavery Act 2015", note: "Good practice — mandatory for businesses >£36m turnover" },
    { key: "environmentalPolicy" as const, name: "Environmental Policy", basis: "Client / ISO 14001", note: "Increasingly required by clients" },
    { key: "professionalIndemnity" as const, name: "Professional Indemnity Insurance", basis: "Client / design work", note: "Required for design/consultancy work" },
  ];

  // Get current user for customer isolation and admin access control
  const { data: currentUser, isError: authError } = useQuery<{ id: string; username: string; customerId: string; role?: string }>({
    queryKey: ["/api/auth/me"],
    retry: false, // Don't retry if auth fails
    staleTime: 5000,
  });

  // Secure customer ID - no fallback for production security
  const customerId = currentUser?.customerId;

  // OpenAI auto-populate description mutation
  const generateDescriptionMutation = useMutation({
    mutationFn: async (data: { website: string; companyName: string; industry?: string }) => {
      const response = await apiRequest("POST", "/api/contractors/generate-description", data);
      return await response.json();
    },
    onSuccess: (response: { description: string }) => {
      setContractorForm(prev => ({
        ...prev,
        description: response.description
      }));
      toast({
        title: "Success",
        description: "Company description generated successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error", 
        description: error.message || "Failed to generate description",
        variant: "destructive",
      });
    },
    onSettled: () => {
      setIsGeneratingDescription(false);
    }
  });

  const handleGenerateDescription = async () => {
    if (!contractorForm.website || !contractorForm.name) {
      toast({
        title: "Missing Information",
        description: "Please enter company name and website first",
        variant: "destructive",
      });
      return;
    }

    setIsGeneratingDescription(true);
    generateDescriptionMutation.mutate({
      website: contractorForm.website,
      companyName: contractorForm.name,
      industry: contractorForm.industry || undefined
    });
  };
  
  // Form state for adding worker
  const [workerForm, setWorkerForm] = useState({
    companyId: "",
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    postcode: "", // HOME POSTCODE - MANDATORY for emissions calculations
    transportMethod: "car_diesel",
    rightToWork: "pending" as "valid" | "expired" | "pending",
    cscsCard: "",
    cscsStatus: "pending" as "valid" | "expired" | "pending",
    ipafStatus: "none" as "none" | "3a" | "3b" | "1+" | "expired",
    asbestosAwareness: false,
    manualHandling: false,
    workingAtHeight: false,
    inductionCompleted: false,
    isActive: true
  });

  const { data: companies = [] } = useQuery<ExtendedContractorCompany[]>({
    queryKey: ["/api/contractors", customerId],
    enabled: !!currentUser,
  });

  // Lightweight CDM projects query for header-level F10 overdue count
  const { data: allCdmProjects = [] } = useQuery<CdmProject[]>({
    queryKey: ["/api/cdm/projects", customerId],
    enabled: !!currentUser,
    refetchInterval: 60000,
  });
  const headerF10OverdueCount = allCdmProjects.filter(isF10Overdue).length;

  const { data: allWorkers = [], refetch: refetchWorkers } = useQuery<ContractorWorker[]>({
    queryKey: ["/api/contractors/workers/all", customerId],
    enabled: activeTab === "previous" && !!customerId,
  });

  const { data: staffList = [] } = useQuery<any[]>({
    queryKey: ['/api/staff'],
  });

  const { data: zones = [] } = useQuery<any[]>({
    queryKey: ["/api/zones"],
  });

  const { data: activeLoneWorkers = [] } = useQuery<any[]>({
    queryKey: ['/api/lone-worker/active'],
    refetchInterval: 30000,
  });

  const startContractorLoneWorkerMutation = useMutation({
    mutationFn: (id: string) => apiRequest("POST", `/api/contractor-workers/${id}/lone-worker/start`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['/api/lone-worker/active'] }),
    onError: () => toast({ title: "Error", description: "Failed to start lone worker session.", variant: "destructive" }),
  });

  const endContractorLoneWorkerMutation = useMutation({
    mutationFn: (id: string) => apiRequest("POST", `/api/contractor-workers/${id}/lone-worker/end`, { endedBy: 'supervisor' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['/api/lone-worker/active'] }),
    onError: () => toast({ title: "Error", description: "Failed to end lone worker session.", variant: "destructive" }),
  });

  const getContractorLoneWorkerSession = (workerId: string) =>
    activeLoneWorkers.find((s: any) => s.personId === workerId && s.personType === 'contractor');

  const getLoneWorkerCountdown = (session: any): string => {
    if (!session?.nextDeadline) return 'Lone Worker';
    const minsLeft = Math.round((new Date(session.nextDeadline).getTime() - Date.now()) / 60000);
    if (minsLeft < 0) return `${Math.abs(minsLeft)}m overdue`;
    return `Next: ${minsLeft}m`;
  };

  const generateTestWorkersMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch("/api/contractors/generate-test-workers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (!response.ok) throw new Error("Failed to generate test workers");
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Test Workers Generated",
        description: "Successfully created test workers for all contractor companies",
      });
      refetchWorkers();
      queryClient.invalidateQueries({ queryKey: ["/api/contractors", customerId] });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to generate test workers",
        variant: "destructive",
      });
    },
  });

  const handleGenerateTestWorkers = () => {
    generateTestWorkersMutation.mutate();
  };
  
  // Create contractor mutation
  const createContractorMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/contractors", data);
      return await res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/contractors", customerId] });
      setJustCreatedCompany(data);
      setAddWizardStep(4);
      setContractorForm({
        name: "",
        email: "",
        contactFirstName: "",
        contactLastName: "",
        phone: "",
        address: "",
        postcode: "",
        website: "",
        description: "",
        industry: "",
        status: "pending"
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to add contractor",
        variant: "destructive",
      });
    },
  });

  const updateContractorMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      return await apiRequest("PUT", `/api/contractors/${id}`, data);
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Contractor company updated successfully",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/contractors", customerId] });
      setShowCompanyEditDialog(false);
      setSelectedContractor(null);
      setContractorForm({
        name: "",
        email: "",
        contactFirstName: "",
        contactLastName: "",
        phone: "",
        address: "",
        postcode: "",
        website: "",
        description: "",
        industry: "",
        status: "pending"
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update contractor",
        variant: "destructive",
      });
    },
  });

  const updateCdmAccreditationsMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      return await apiRequest("PATCH", `/api/contractors/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/contractors", customerId] });
    },
  });

  // Create worker mutation
  const createWorkerMutation = useMutation({
    mutationFn: async (data: any) => {
      return await apiRequest("POST", `/api/contractors/${data.companyId}/workers`, data);
    },
    onSuccess: (_data: any, variables: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/contractors", customerId] });
      queryClient.invalidateQueries({ queryKey: ["/api/contractors/workers/all", customerId] });
      setWorkerWizardSavedName(`${variables.firstName} ${variables.lastName}`);
      setWorkerWizardStep(4);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to add worker",
        variant: "destructive",
      });
    },
  });

  const handleAddContractor = () => {
    createContractorMutation.mutate(contractorForm);
  };

  const handleAddWorker = () => {
    createWorkerMutation.mutate({
      ...workerForm,
      companyId: selectedContractor?.id
    });
  };

  // Delete contractor mutation
  const deleteContractorMutation = useMutation({
    mutationFn: async (contractorId: string) => {
      const response = await apiRequest("DELETE", `/api/contractors/${contractorId}`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/contractors", customerId] });
      queryClient.invalidateQueries({ queryKey: ["/api/contractors/workers/all", customerId] });
      toast({
        title: "Success",
        description: "Contractor deleted successfully",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to delete contractor",
        variant: "destructive",
      });
    },
  });

  // Delete worker mutation
  const deleteWorkerMutation = useMutation({
    mutationFn: async (workerId: string) => {
      const response = await apiRequest("DELETE", `/api/workers/${workerId}`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/contractors/workers/all", customerId] });
      queryClient.invalidateQueries({ queryKey: ["/api/contractors", customerId] });
      toast({
        title: "Success",
        description: "Worker deleted successfully",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to delete worker",
        variant: "destructive",
      });
    },
  });

  // Navigation handlers
  const handleViewContractorDetails = (contractorId: string) => {
    setLocation(`/contractors/${contractorId}`);
  };

  const handleEditContractor = (contractorId: string) => {
    // Find the contractor to edit
    const contractorToEdit = companies.find(c => c.id === contractorId);
    if (contractorToEdit) {
      setSelectedContractor(contractorToEdit);
      // Pre-fill form with existing contractor data
      
      setContractorForm({
        name: contractorToEdit.name || "",
        email: contractorToEdit.email || "",
        contactFirstName: contractorToEdit.contactFirstName || "",
        contactLastName: contractorToEdit.contactLastName || "",
        phone: (contractorToEdit as any).contactPhone || contractorToEdit.phone || "",
        address: contractorToEdit.address || "",
        postcode: contractorToEdit.postcode || "",
        website: contractorToEdit.website || "",
        description: contractorToEdit.description || "",
        industry: contractorToEdit.industry || "",
        status: (contractorToEdit.status as "pending" | "approved" | "suspended") || "pending"
      });
      
      console.log('🔍 Pre-filling form with contractor data:', {
        original: contractorToEdit,
        mapped: {
          name: contractorToEdit.name || "",
          email: contractorToEdit.email || "",
          phone: (contractorToEdit as any).contactPhone || contractorToEdit.phone || "",
        }
      });
      setCdmAccreditationForm({
        cdmRole: contractorToEdit.cdmRole ?? "",
        constructionlineGrade: contractorToEdit.constructionlineGrade ?? "",
        chasCertified: contractorToEdit.chasCertified ?? false,
        smasAccredited: contractorToEdit.smasAccredited ?? false,
        otherAccreditations: contractorToEdit.otherAccreditations ?? "",
        pdProfessionalBody: contractorToEdit.pdProfessionalBody ?? "",
      });
      setShowCompanyEditDialog(true);
    }
  };

  const handleDeleteContractor = (contractorId: string, contractorName: string) => {
    if (window.confirm(`Are you sure you want to delete "${contractorName}"? This action cannot be undone.`)) {
      deleteContractorMutation.mutate(contractorId);
    }
  };

  const handleDeleteWorker = (workerId: string, workerName: string) => {
    if (window.confirm(`Are you sure you want to delete "${workerName}"? This action cannot be undone.`)) {
      deleteWorkerMutation.mutate(workerId);
    }
  };

  // Removed unused handleEditWorker functions - now using comprehensive modal directly

  const checkInMutation = useMutation({
    mutationFn: async (data: { workerId: string; hostStaffId?: string; hostName?: string }) => {
      const response = await apiRequest("POST", `/api/contractors/workers/${data.workerId}/checkin`, {
        hsRulesAccepted: true,
        hsRulesAcceptedAt: new Date().toISOString(),
        purpose: "Work",
        hostStaffId: data.hostStaffId,
        hostName: data.hostName,
      });
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/contractors/workers/all", customerId] });
      queryClient.invalidateQueries({ queryKey: ["/api/contractors/checked-in"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      
      if (data.ePassSent) {
        toast({
          title: "Digital Pass Sent",
          description: `E-Pass has been sent to ${data.worker?.email || 'contractor'}. They can use it to check out.`,
          duration: 5000
        });
      } else {
        const worker = data.worker;
        const company = companies.find(c => c.id === worker.companyId);
        
        setSelectedWorker(worker);
        setSelectedCompanyName(company?.name || "Unknown Company");
        setShowPassPreview(true);
        
        toast({
          title: "Checked In",
          description: data.hasEmail
            ? "E-pass could not be sent — please print the physical pass below."
            : "Contractor checked in. No email on file — printing physical pass.",
          variant: data.hasEmail ? "destructive" : "default",
          duration: 6000,
        });
      }
    },
    onError: (error: any) => {
      toast({
        title: "Cannot Check In",
        description: error?.message || "Failed to check in contractor",
        variant: "destructive",
      });
    },
  });

  const checkOutMutation = useMutation({
    mutationFn: async (workerId: string) => {
      const response = await apiRequest("POST", `/api/contractors/workers/${workerId}/checkout`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/contractors/workers/all", customerId] });
      queryClient.invalidateQueries({ queryKey: ["/api/contractors/checked-in"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/contractors", customerId] });
      toast({
        title: "Success",
        description: "Contractor checked out successfully!",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to check out contractor",
        variant: "destructive",
      });
    },
  });

  const sendInductionMutation = useMutation({
    mutationFn: async (contractorId: string) => {
      const response = await apiRequest("POST", `/api/contractors/${contractorId}/send-induction`);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Induction Email Sent ✅",
        description: "The induction link has been emailed to the contractor. They must complete it before site access.",
        duration: 5000,
      });
    },
    onError: (error) => {
      toast({
        title: "Failed to Send Induction",
        description: error.message || "Unable to send induction email. Please try again.",
        variant: "destructive",
      });
    },
  });

  const { data: companySettings } = useQuery<any>({ queryKey: ['/api/settings'] });

  useEffect(() => {
    if (qrPassWorker?.qrCode) {
      setQrPassData({ qrCode: qrPassWorker.qrCode, workerName: `${qrPassWorker.firstName} ${qrPassWorker.lastName}` });
    } else if (!qrPassWorker) {
      setQrPassData(null);
    }
  }, [qrPassWorker]);

  const sendWorkerQrPassMutation = useMutation({
    mutationFn: async ({ id, method }: { id: string; method: string }) => {
      const response = await apiRequest("POST", `/api/contractors/workers/${id}/send-qr-pass`, { method });
      return response.json();
    },
    onSuccess: (data) => {
      if (data.qrCode) {
        setQrPassData({ qrCode: data.qrCode, workerName: data.workerName || '' });
      }
      if (data.method === 'email') {
        toast({ title: "QR Pass Sent", description: data.message || "QR pass has been emailed to the contractor" });
      }
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to send QR pass", variant: "destructive" });
    },
  });

  const getWorkerPassBranding = () => {
    const brandColor = companySettings?.backgroundColor || companySettings?.primaryColor || '#2460A9';
    const accentColor = companySettings?.accentColor || brandColor;
    const companyName = companySettings?.companyName || 'Company';
    const logoPath = companySettings?.logoUrl || '';
    const logoUrl = logoPath ? (logoPath.startsWith('http') ? logoPath : `${window.location.origin}/objects${logoPath.startsWith('/') ? '' : '/'}${logoPath}`) : '';
    return { brandColor, accentColor, companyName, logoUrl };
  };

  const getBrandedWorkerPassHtml = (qrCode: string, workerName: string, workerCompanyName: string) => {
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(qrCode)}`;
    const { brandColor, companyName, logoUrl } = getWorkerPassBranding();
    const logoHtml = logoUrl ? `<img src="${logoUrl}" style="max-height:40px;max-width:160px;margin:0 auto 6px auto;display:block;" crossorigin="anonymous">` : '';
    return `
      <div style="border:2px solid ${brandColor};border-radius:14px;padding:20px 18px;max-width:280px;margin:0 auto;font-family:'Segoe UI',Arial,sans-serif;text-align:center;background:#fff;">
        <div style="background:${brandColor};margin:-20px -18px 12px -18px;border-radius:12px 12px 0 0;padding:14px 12px 10px 12px;">
          ${logoHtml}
          <div style="color:#fff;font-size:15px;font-weight:700;letter-spacing:0.5px;">${companyName}</div>
          <div style="color:rgba(255,255,255,0.8);font-size:10px;margin-top:2px;">CONTRACTOR CHECK-IN PASS</div>
        </div>
        <img src="${qrUrl}" style="width:180px;height:180px;margin:6px auto 10px auto;display:block;border-radius:8px;border:1px solid #e5e7eb;">
        <h3 style="margin:0 0 2px 0;font-size:16px;color:#111;">${workerName}</h3>
        <p style="margin:2px 0;color:#555;font-size:13px;">${workerCompanyName}</p>
        <div style="margin-top:10px;padding-top:8px;border-top:1px solid #e5e7eb;">
          <p style="margin:0;font-size:10px;color:#aaa;">Scan at kiosk to check in / check out</p>
        </div>
      </div>`;
  };

  const handlePrintWorkerQrPass = (qrCode: string, workerName: string, workerCompanyName: string) => {
    const passHtml = getBrandedWorkerPassHtml(qrCode, workerName, workerCompanyName);
    const printWindow = window.open('', '_blank', 'width=400,height=600');
    if (!printWindow) return;
    printWindow.document.write(`<html><head><title>Contractor QR Pass - ${workerName}</title></head><body style="margin:0;display:flex;justify-content:center;padding:20px;">${passHtml}</body></html>`);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => { printWindow.print(); printWindow.close(); }, 500);
  };

  const handleDownloadWorkerQrPass = async (qrCode: string, workerName: string, workerCompanyName: string) => {
    toast({ title: "Generating Pass", description: "Creating branded QR pass image..." });
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(qrCode)}`;
    const { brandColor, companyName, logoUrl } = getWorkerPassBranding();
    const canvas = document.createElement('canvas');
    canvas.width = 320; canvas.height = 420;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, 320, 420);
    ctx.strokeStyle = brandColor; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.roundRect(2, 2, 316, 416, 12); ctx.stroke();
    ctx.fillStyle = brandColor; ctx.fillRect(2, 2, 316, 70);
    ctx.fillStyle = '#ffffff'; ctx.font = 'bold 14px Arial'; ctx.textAlign = 'center'; ctx.fillText(companyName, 160, 32);
    ctx.font = '11px Arial'; ctx.fillText('CONTRACTOR CHECK-IN PASS', 160, 52);
    const img = new Image(); img.crossOrigin = 'anonymous';
    img.onload = () => {
      ctx.drawImage(img, 60, 80, 200, 200);
      ctx.fillStyle = '#111111'; ctx.font = 'bold 16px Arial'; ctx.fillText(workerName, 160, 305);
      ctx.fillStyle = '#555555'; ctx.font = '13px Arial'; ctx.fillText(workerCompanyName, 160, 325);
      ctx.fillStyle = '#aaaaaa'; ctx.font = '10px Arial'; ctx.fillText('Scan at kiosk to check in / check out', 160, 365);
      const link = document.createElement('a');
      link.download = `qr-pass-${workerName.replace(/\s/g, '-')}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
      toast({ title: "Download Complete", description: "QR pass saved to your downloads" });
    };
    img.onerror = () => toast({ title: "Download Failed", description: "Could not generate pass image", variant: "destructive" });
    img.src = qrUrl;
  };

  const preBookWorkerMutation = useMutation({
    mutationFn: async (data: { worker: ContractorWorker; date: Date; time: string; purpose: string; duration: string; notes: string; companyName: string; hostStaffId?: string; hostName?: string }) => {
      const response = await apiRequest('POST', '/api/contractors/prebookings', {
        companyName: data.companyName,
        contactEmail: data.worker.email || '',
        contactPhone: data.worker.phone || '',
        workerName: `${data.worker.firstName} ${data.worker.lastName}`,
        workerEmail: data.worker.email || '',
        purpose: data.purpose,
        scheduledDate: data.date.toISOString(),
        scheduledTime: data.time,
        duration: data.duration,
        notes: data.notes,
        documentsRequired: [],
        hostStaffId: data.hostStaffId || undefined,
        hostName: data.hostName || undefined,
      });
      return response.json();
    },
    onSuccess: (data: any) => {
      toast({
        title: "Worker pre-booked successfully",
        description: data?.emailSent
          ? "Pre-booking pass with QR code has been emailed to the contractor"
          : "The booking has been created and will appear in the Reception Diary"
      });
      queryClient.invalidateQueries({ queryKey: ['/api/contractors/prebookings'] });
      queryClient.invalidateQueries({ queryKey: ['/api/contractors/prebookings/today'] });
      queryClient.invalidateQueries({ queryKey: ['/api/contractors/prebookings/upcoming'] });
      queryClient.invalidateQueries({ queryKey: ['/api/reception/diary'] });
      setPreBookingWorker(null);
      setPreBookDate(new Date());
      const now = new Date();
      const nextHour = new Date(now);
      nextHour.setMinutes(0);
      nextHour.setHours(nextHour.getHours() + 1);
      setPreBookTime(`${String(nextHour.getHours()).padStart(2, '0')}:00`);
      setPreBookPurpose("Site work");
      setPreBookDuration("8");
      setPreBookNotes("");
      setPreBookCompanyName("");
      setPreBookHost('');
    },
    onError: (error: any) => {
      toast({ title: "Failed to pre-book worker", description: error.message, variant: "destructive" });
    }
  });

  const updateWorkerPhotoMutation = useMutation({
    mutationFn: async ({ workerId, photoUrl }: { workerId: string; photoUrl: string }) => {
      const response = await apiRequest("PUT", `/api/contractors/workers/${workerId}`, { photoUrl });
      return response.json();
    },
    onSuccess: (data) => {
      const worker = data.worker || data;
      setViewingWorker((prev: any) => prev ? { ...prev, photoUrl: worker.photoUrl } : prev);
      queryClient.invalidateQueries({ queryKey: ['/api/contractors/workers/all'] });
      toast({ title: "Photo updated", description: "Worker photo saved successfully." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to save worker photo.", variant: "destructive" });
    },
  });

  const handleWorkerPhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !viewingWorker) return;
    let base64: string;
    try {
      base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (ev) => resolve((ev.target?.result as string).split(',')[1]);
        reader.onerror = () => reject(new Error('Failed to read file'));
        reader.readAsDataURL(file);
      });
    } catch {
      toast({ title: "Error", description: "Could not read the file. Please try again.", variant: "destructive" });
      return;
    }
    setIsUploadingWorkerPhoto(true);
    try {
      const uploadRes = await apiRequest("POST", "/api/objects/upload", { data: base64, mimeType: file.type });
      const { objectPath } = await uploadRes.json();
      updateWorkerPhotoMutation.mutate({ workerId: viewingWorker.id, photoUrl: objectPath });
    } catch {
      toast({ title: "Error", description: "Failed to upload photo.", variant: "destructive" });
    } finally {
      setIsUploadingWorkerPhoto(false);
      e.target.value = "";
    }
  };

  // Get previous contractors (workers with their company info)
  const previousContractors = allWorkers.map(worker => {
    const company = companies.find(c => c.id === worker.companyId);
    return {
      ...worker,
      companyName: company?.name || 'Unknown Company',
      companyStatus: company?.status || 'unknown',
      safetyRating: company?.complianceScore || 'N/A'
    };
  }).filter(contractor => 
    (contractor.firstName || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
    (contractor.lastName || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
    (contractor.companyName || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
    (contractor.email || "").toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getSafetyRatingColor = (rating: string) => {
    if (rating.startsWith('A')) return 'bg-green-100 text-green-800';
    if (rating.startsWith('B')) return 'bg-yellow-100 text-yellow-800';
    if (rating.startsWith('C')) return 'bg-orange-100 text-orange-800';
    if (rating.startsWith('D')) return 'bg-red-100 text-red-800';
    if (rating === 'F') return 'bg-red-200 text-red-900';
    return 'bg-gray-100 text-gray-800';
  };

  // Derive compliance badge from documentsStatus returned by the API
  const getComplianceBadge = (documentsStatus?: Record<string, string>) => {
    if (!documentsStatus) return { label: 'Not started', className: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300', icon: '⬜' };
    const allMissing = Object.values(documentsStatus).every(v => v === 'missing');
    if (allMissing) return { label: 'Not started', className: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300', icon: '⬜' };
    const missingLegal = documentsStatus.publicLiability === 'missing' || documentsStatus.employersLiability === 'missing'
      || documentsStatus.publicLiability === 'expired' || documentsStatus.employersLiability === 'expired';
    if (missingLegal) return { label: 'Missing legal docs', className: 'bg-red-100 text-red-700', icon: '🔴' };
    const missingSite = (documentsStatus.healthSafety === 'missing' || documentsStatus.rams === 'missing'
      || documentsStatus.healthSafety === 'expired' || documentsStatus.rams === 'expired');
    if (missingSite) return { label: 'Incomplete', className: 'bg-amber-100 text-amber-700', icon: '🟡' };
    return { label: 'Compliant', className: 'bg-green-100 text-green-700', icon: '🟢' };
  };

  if (showWalkInForm) {
    return <WalkInContractorForm onBack={() => setShowWalkInForm(false)} />;
  }

  return (
    <div className="p-3 sm:p-6 space-y-4 sm:space-y-6 pb-24 sm:pb-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <HardHat className="h-8 w-8 text-orange-600" />
          <h1 className="text-xl sm:text-3xl font-bold text-slate-800 dark:text-slate-100">Contractor Management</h1>
          {headerF10OverdueCount > 0 && (
            <span
              className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-100 text-red-700 text-xs font-semibold cursor-pointer hover:bg-red-200 transition-colors"
              title={`${headerF10OverdueCount} CDM project${headerF10OverdueCount > 1 ? "s" : ""} with overdue F10 notification`}
              onClick={() => setActiveTab("cdm")}
            >
              <AlertTriangle className="h-3 w-3" />
              {headerF10OverdueCount} F10 overdue
            </span>
          )}
        </div>
        <Button
          onClick={() => setShowQRScanner(true)}
          className="bg-blue-600 hover:bg-blue-700 text-white font-semibold flex items-center gap-2 px-3 sm:px-4 py-2 sm:py-2.5 text-sm sm:text-base"
          title="Scan a contractor QR code to check in / out"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 sm:w-5 sm:h-5 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="3" y="14" width="7" height="7" />
            <path d="M14 14h1v1h-1zm3 0h1v1h-1zm-3 3h1v1h-1zm3 3h1v1h-1zm3-3h1v1h-1zm0-3h1v1h-1z" />
          </svg>
          <span className="hidden sm:inline">Scan QR</span>
          <span className="sm:hidden">Scan</span>
        </Button>
      </div>

      {/* Tab Navigation — horizontal scroll on mobile, wrap on desktop */}
      <div className="flex overflow-x-auto gap-1.5 sm:flex-wrap sm:overflow-visible pb-1 sm:pb-0 scrollbar-hide">
        <Button
          variant={activeTab === "previous" ? "default" : "outline"}
          onClick={() => setActiveTab("previous")}
          className="flex items-center gap-1.5 text-xs sm:text-sm px-2.5 sm:px-4 whitespace-nowrap flex-shrink-0"
          data-testid="tab-previous-contractors"
        >
          <History className="h-3.5 w-3.5 flex-shrink-0" />
          <span className="sm:hidden">Prev</span>
          <span className="hidden sm:inline">Previous Workers</span>
        </Button>
        <Button
          variant={activeTab === "contractors" ? "default" : "outline"}
          onClick={() => setActiveTab("contractors")}
          className="flex items-center gap-1.5 text-xs sm:text-sm px-2.5 sm:px-4 whitespace-nowrap flex-shrink-0"
          data-testid="tab-contractors"
        >
          <Building2 className="h-3.5 w-3.5 flex-shrink-0" />
          <span className="hidden sm:inline">Contractors</span>
          <span className="sm:hidden">Companies</span>
        </Button>
        <Button
          variant={activeTab === "walkin" ? "default" : "outline"}
          onClick={() => setActiveTab("walkin")}
          className="flex items-center gap-1.5 text-xs sm:text-sm px-2.5 sm:px-4 whitespace-nowrap flex-shrink-0"
          data-testid="tab-walkin-registration"
        >
          <UserPlus className="h-3.5 w-3.5 flex-shrink-0" />
          <span>Walk-in</span>
        </Button>
        <Button
          variant={activeTab === "prebook" ? "default" : "outline"}
          onClick={() => setActiveTab("prebook")}
          className="flex items-center gap-1.5 text-xs sm:text-sm px-2.5 sm:px-4 whitespace-nowrap flex-shrink-0"
          data-testid="tab-pre-booking"
        >
          <CalendarPlus className="h-3.5 w-3.5 flex-shrink-0" />
          <span className="hidden sm:inline">Pre-booking</span>
          <span className="sm:hidden">Pre-book</span>
        </Button>
        <Button
          variant={activeTab === "co2" ? "default" : "outline"}
          onClick={() => setActiveTab("co2")}
          className="flex items-center gap-1.5 text-xs sm:text-sm px-2.5 sm:px-4 whitespace-nowrap flex-shrink-0"
          data-testid="tab-co2-reports"
        >
          <Leaf className="h-3.5 w-3.5 flex-shrink-0" />
          <span className="hidden sm:inline">CO2 Reports</span>
          <span className="sm:hidden">CO2</span>
        </Button>
        <Button
          variant={activeTab === "assign-hs" ? "default" : "outline"}
          onClick={() => setActiveTab("assign-hs")}
          className="flex items-center gap-1.5 text-xs sm:text-sm px-2.5 sm:px-4 whitespace-nowrap flex-shrink-0"
          data-testid="tab-assign-hs"
        >
          <Shield className="h-3.5 w-3.5 flex-shrink-0" />
          <span className="hidden sm:inline">H&S Document</span>
          <span className="sm:hidden">H&S</span>
        </Button>
        <Button
          variant={activeTab === "rams" ? "default" : "outline"}
          onClick={() => setActiveTab("rams")}
          className="flex items-center gap-1.5 text-xs sm:text-sm px-2.5 sm:px-4 whitespace-nowrap flex-shrink-0"
          data-testid="tab-rams"
        >
          <FileText className="h-3.5 w-3.5 flex-shrink-0" />
          <span className="hidden sm:inline">RAMS</span>
          <span className="sm:hidden">RAMS</span>
        </Button>
        <Button
          variant={activeTab === "ppm" ? "default" : "outline"}
          onClick={() => setActiveTab("ppm")}
          className="flex items-center gap-1.5 text-xs sm:text-sm px-2.5 sm:px-4 whitespace-nowrap flex-shrink-0"
          data-testid="tab-ppm"
        >
          <Wrench className="h-3.5 w-3.5 flex-shrink-0" />
          <span>PPM</span>
        </Button>
        <Button
          variant={activeTab === "cdm" ? "default" : "outline"}
          onClick={() => setActiveTab("cdm")}
          className="flex items-center gap-1.5 text-xs sm:text-sm px-2.5 sm:px-4 whitespace-nowrap flex-shrink-0"
          data-testid="tab-cdm"
        >
          <HardHatIcon className="h-3.5 w-3.5 flex-shrink-0" />
          <span>CDM 2015</span>
        </Button>
      </div>

      {/* Tab Content */}
      {activeTab === "previous" && (
        <div className="space-y-4">
          <div className="space-y-4">
            {/* Section Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <History className="h-5 w-5 text-slate-600 dark:text-slate-400" />
                <h2 className="text-xl font-semibold text-fixed">Previous Contractor Workers</h2>
                <span className="hidden sm:inline text-sm text-variable">
                  Select a contractor who has been onsite before
                </span>
              </div>
              {/* Remove Duplicates button removed - duplication prevented via email validation */}
            </div>

            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-3 h-5 w-5 text-slate-400" />
              <Input
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search by contractor name or company..."
                className="pl-10"
                data-testid="input-search-contractors"
              />
            </div>

            {/* Show All Button & View Toggle */}
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2">
              <div className="text-sm text-slate-600 dark:text-slate-300">
                Showing {showAllWorkers ? previousContractors.length : Math.min(6, previousContractors.length)} of {previousContractors.length} contractors
                {searchTerm && ` matching "${searchTerm}"`}
              </div>
              <div className="flex items-center gap-2">
                <div className="flex border rounded-lg overflow-hidden">
                  <Button
                    size="sm"
                    variant={previousViewMode === 'grid' ? 'default' : 'outline'}
                    className="rounded-none border-0 px-2"
                    onClick={() => setPreviousViewMode('grid')}
                    title="Grid view"
                  >
                    <LayoutGrid size={14} />
                  </Button>
                  <Button
                    size="sm"
                    variant={previousViewMode === 'list' ? 'default' : 'outline'}
                    className="rounded-none border-0 px-2"
                    onClick={() => setPreviousViewMode('list')}
                    title="List view"
                  >
                    <List size={14} />
                  </Button>
                </div>
                <Button 
                  variant="outline" 
                  size="sm"
                  className="text-blue-600 border-blue-600 hover:bg-blue-50 text-xs sm:text-sm whitespace-nowrap"
                  onClick={() => setShowAllWorkers(!showAllWorkers)}
                >
                  {showAllWorkers ? 'Show Less' : `Show All ${allWorkers.length} Workers`}
                </Button>
              </div>
            </div>

            {/* Contractors Grid/List */}
            <div className={previousViewMode === 'grid' ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-6" : "space-y-2"}>
              {previousContractors.slice(0, showAllWorkers ? previousContractors.length : 6).map((contractor) => (
                previousViewMode === 'grid' ? (
                <GlassCard 
                  key={contractor.id} 
                  hover
                  className="cursor-pointer overflow-hidden"
                  onClick={() => setViewingWorker(contractor)}
                >
                  <div className="flex items-start space-x-3 mb-3">
                    <div className={`w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 overflow-hidden ${
                      contractor.photoUrl ? '' :
                      ['bg-gradient-to-r from-orange-500 to-red-500',
                       'bg-gradient-to-r from-blue-500 to-purple-500',
                       'bg-gradient-to-r from-green-500 to-teal-500',
                       'bg-gradient-to-r from-purple-500 to-pink-500',
                       'bg-gradient-to-r from-indigo-500 to-purple-500',
                       'bg-gradient-to-r from-teal-500 to-cyan-500'][previousContractors.indexOf(contractor) % 6]
                    }`}>
                      {contractor.photoUrl ? (
                        <img
                          src={contractor.photoUrl.startsWith('/objects/') ? contractor.photoUrl : `/objects${contractor.photoUrl}`}
                          alt={`${contractor.firstName} ${contractor.lastName}`}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <span className="text-white font-bold text-sm">
                          {(contractor.firstName?.[0] || '').toUpperCase()}{(contractor.lastName?.[0] || '').toUpperCase()}
                        </span>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <h3 className="font-semibold text-fixed text-sm truncate">
                          {contractor.firstName} {contractor.lastName}
                        </h3>
                        <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium flex-shrink-0 ${
                          contractor.isCheckedIn ? 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300' : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200'
                        }`}>
                          {contractor.isCheckedIn ? 'Checked In' : 'Available'}
                        </span>
                      </div>
                      <p className="text-variable text-xs truncate flex items-center gap-1">
                        <Building2 className="h-3 w-3 flex-shrink-0" />
                        {contractor.companyName}
                      </p>
                      <p className="text-variable text-xs">
                        Last visit: {contractor.updatedAt ? new Date(contractor.updatedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Unknown'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap mb-2">
                    {contractor.rightToWork === 'valid' ? (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-green-100 text-green-800">
                        <CheckCircle className="h-3 w-3 mr-0.5" />
                        Work Auth
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-red-100 text-red-800">
                        <AlertTriangle className="h-3 w-3 mr-0.5" />
                        Work Auth
                      </span>
                    )}
                    {!contractor.inductionCompleted && (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-100 text-amber-800">
                        <AlertTriangle className="h-3 w-3 mr-0.5" />
                        No Induction
                      </span>
                    )}
                    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${getSafetyRatingColor(contractor.safetyRating)}`}>
                      {contractor.safetyRating}
                    </span>
                    {(contractor as any).hasRedCard && (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-red-200 text-red-900">Red Card</span>
                    )}
                    {(contractor as any).hasYellowCard && (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-yellow-200 text-yellow-900">Yellow Card</span>
                    )}
                    {(!(contractor as any).hasRedCard && !(contractor as any).hasYellowCard) && (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-green-200 text-green-900">Clear</span>
                    )}
                    {(contractor as any).zoneId && (() => {
                      const zone = zones.find((z: any) => z.id === (contractor as any).zoneId);
                      return zone ? (
                        <span className="inline-flex items-center gap-1 text-xs">
                          <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: zone.color }} />
                          {zone.name}
                        </span>
                      ) : null;
                    })()}
                    {contractor.isCheckedIn && contractor.checkedInAt && (
                      <span className="text-[10px] text-variable flex items-center ml-auto">
                        <Clock className="h-3 w-3 mr-0.5" />
                        {new Date(contractor.checkedInAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center flex-wrap gap-2 pt-2 border-t border-gray-200/50 dark:border-gray-700/50">
                    <div className="flex items-center gap-1.5 flex-1">
                      <Button 
                        size="sm" 
                        variant="ghost" 
                        className="h-8 w-8 p-0"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedWorkerForEdit(contractor);
                          setSelectedWorkerCompanyName(contractor.companyName);
                          setShowContractorEditModal(true);
                        }}
                        data-testid={`button-edit-worker-${contractor.id}`}
                        title="Edit contractor"
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button 
                        size="sm" 
                        variant="ghost" 
                        className="h-8 w-8 p-0 text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50"
                        onClick={(e) => {
                          e.stopPropagation();
                          sendInductionMutation.mutate(contractor.id);
                        }}
                        disabled={sendInductionMutation.isPending}
                        title="Send Site Induction Email"
                        data-testid={`button-send-induction-${contractor.id}`}
                      >
                        <Mail className="h-4 w-4" />
                      </Button>
                      {contractor.isCheckedIn && (
                        <Button 
                          size="sm" 
                          variant="ghost" 
                          className="h-8 w-8 p-0"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedWorker(contractor);
                            setSelectedCompanyName(contractor.companyName);
                            setShowPassPreview(true);
                          }}
                          title="Print Pass"
                          data-testid={`button-print-pass-${contractor.id}`}
                        >
                          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                          </svg>
                        </Button>
                      )}
                      {(() => {
                        const isBanned = contractor.currentCardStatus === 'red' && contractor.redCardBanUntil && new Date(contractor.redCardBanUntil) > new Date();
                        const isClear = !isBanned && contractor.isActive && (!contractor.currentCardStatus || contractor.currentCardStatus === 'clear' || contractor.currentCardStatus === 'yellow');
                        return isClear ? (
                          <>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-8 w-8 p-0 text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50"
                              onClick={(e) => { e.stopPropagation(); setQrPassWorker(contractor); }}
                              title="QR Pass"
                              data-testid={`button-qr-pass-${contractor.id}`}
                            >
                              <QrCode className="h-4 w-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-8 w-8 p-0 text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50"
                              onClick={(e) => {
                                e.stopPropagation();
                                setPreBookingWorker(contractor);
                                setPreBookCompanyName(contractor.companyName);
                              }}
                              title="Pre-Book Worker"
                              data-testid={`button-prebook-${contractor.id}`}
                            >
                              <CalendarPlus className="h-4 w-4" />
                            </Button>
                          </>
                        ) : null;
                      })()}
                      {(() => {
                        const lwSession = getContractorLoneWorkerSession(contractor.id);
                        return lwSession ? (
                          <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-amber-600 hover:text-amber-700 hover:bg-amber-50" onClick={(e) => { e.stopPropagation(); endContractorLoneWorkerMutation.mutate(contractor.id); }} disabled={endContractorLoneWorkerMutation.isPending} title="End lone worker session"><ShieldOff className="h-4 w-4" /></Button>
                        ) : (contractor.isCheckedIn && companySettings?.loneWorkerEnabled) ? (
                          <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-slate-400 hover:text-green-700 hover:bg-green-50" onClick={(e) => { e.stopPropagation(); startContractorLoneWorkerMutation.mutate(contractor.id); }} disabled={startContractorLoneWorkerMutation.isPending || !contractor.email} title={contractor.email ? "Start lone worker session" : "Worker needs an email address"}><Shield className="h-4 w-4" /></Button>
                        ) : null;
                      })()}
                    </div>
                    {!contractor.isCheckedIn ? (() => {
                      const redBanned = contractor.currentCardStatus === 'red';
                      const notCleared = redBanned || contractor.rightToWork !== 'valid' || !contractor.inductionCompleted;
                      const blockReason = redBanned ? 'Active site ban (Red Card)' : contractor.rightToWork !== 'valid' ? 'Right to work not verified' : !contractor.inductionCompleted ? 'Site induction not completed' : '';
                      return (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (notCleared) {
                              toast({ title: "Cannot Check In", description: blockReason, variant: "destructive" });
                              return;
                            }
                            setWorkerForCheckIn(contractor);
                            setCompanyForCheckIn(contractor.companyName);
                            setShowHSModal(true);
                          }}
                          disabled={checkInMutation.isPending}
                          title={notCleared ? blockReason : 'Check in contractor'}
                          className={`h-9 px-3 text-sm font-medium border ${notCleared ? 'text-gray-400 border-gray-200 cursor-not-allowed dark:text-gray-600 dark:border-gray-600' : 'text-green-600 hover:text-green-700 border-green-300 hover:border-green-400 hover:bg-green-50'}`}
                          data-testid={`button-checkin-${contractor.id}`}
                        >
                          <LogIn className="mr-1.5 h-4 w-4" />
                          Check In
                        </Button>
                      );
                    })() : (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={(e) => {
                          e.stopPropagation();
                          checkOutMutation.mutate(contractor.id);
                        }}
                        disabled={checkOutMutation.isPending}
                        className="h-9 px-3 text-sm font-medium text-red-600 hover:text-red-700 border-red-300 hover:border-red-400 hover:bg-red-50"
                        data-testid={`button-checkout-${contractor.id}`}
                      >
                        <LogOut className="mr-1.5 h-4 w-4" />
                        Check Out
                      </Button>
                    )}
                  </div>
                </GlassCard>
                ) : (
                <div key={contractor.id} className="bg-white/60 dark:bg-slate-800/60 rounded-lg border border-white/30 dark:border-slate-700/40 hover:bg-white/80 dark:hover:bg-slate-800/80 transition-all cursor-pointer" onClick={() => setViewingWorker(contractor)}>
                  {/* Info row — name never truncates on mobile */}
                  <div className="flex items-center gap-3 px-3 pt-3 pb-1">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 overflow-hidden ${
                      contractor.photoUrl ? '' :
                      ['bg-gradient-to-r from-orange-500 to-red-500',
                       'bg-gradient-to-r from-blue-500 to-purple-500',
                       'bg-gradient-to-r from-green-500 to-teal-500',
                       'bg-gradient-to-r from-purple-500 to-pink-500',
                       'bg-gradient-to-r from-indigo-500 to-purple-500',
                       'bg-gradient-to-r from-teal-500 to-cyan-500'][previousContractors.indexOf(contractor) % 6]
                    }`}>
                      {contractor.photoUrl ? (
                        <img src={contractor.photoUrl.startsWith('/objects/') ? contractor.photoUrl : `/objects${contractor.photoUrl}`} alt={`${contractor.firstName} ${contractor.lastName}`} className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-white font-bold text-xs">{(contractor.firstName?.[0] || '').toUpperCase()}{(contractor.lastName?.[0] || '').toUpperCase()}</span>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-fixed text-sm leading-tight">{contractor.firstName} {contractor.lastName}</p>
                      <p className="text-variable text-xs flex items-center gap-1 mt-0.5">
                        <Building2 className="h-3 w-3 flex-shrink-0" />
                        {contractor.companyName}
                        {contractor.isCheckedIn && contractor.checkedInAt && (
                          <span className="flex items-center gap-0.5 ml-2 text-green-700 font-medium">
                            <Clock className="h-3 w-3" />
                            {new Date(contractor.checkedInAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        )}
                      </p>
                      <div className="flex flex-wrap items-center gap-1 mt-1">
                        <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium ${contractor.isCheckedIn ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>
                          {contractor.isCheckedIn ? 'Checked In' : 'Available'}
                        </span>
                        {contractor.rightToWork === 'valid' ? (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-green-100 text-green-800"><CheckCircle className="h-2.5 w-2.5 mr-0.5" />Work Auth</span>
                        ) : (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-red-100 text-red-800"><AlertTriangle className="h-2.5 w-2.5 mr-0.5" />Work Auth</span>
                        )}
                        {!contractor.inductionCompleted && (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-100 text-amber-800"><AlertTriangle className="h-2.5 w-2.5 mr-0.5" />No Induction</span>
                        )}
                        <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${getSafetyRatingColor(contractor.safetyRating)}`}>{contractor.safetyRating}</span>
                        {(contractor as any).hasRedCard && <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-red-200 text-red-900">Red Card</span>}
                        {(contractor as any).hasYellowCard && <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-yellow-200 text-yellow-900">Yellow Card</span>}
                        {(!(contractor as any).hasRedCard && !(contractor as any).hasYellowCard) && <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-green-200 text-green-900">Clear</span>}
                        {(contractor as any).zoneId && (() => {
                          const zone = zones.find((z: any) => z.id === (contractor as any).zoneId);
                          return zone ? <span className="inline-flex items-center gap-1 text-[10px]"><span className="w-2 h-2 rounded-full" style={{ backgroundColor: zone.color }} />{zone.name}</span> : null;
                        })()}
                      </div>
                    </div>
                    {/* Desktop: all actions inline */}
                    {(() => {
                      const isBanned = contractor.currentCardStatus === 'red' && contractor.redCardBanUntil && new Date(contractor.redCardBanUntil) > new Date();
                      const isClear = !isBanned && contractor.isActive && (!contractor.currentCardStatus || contractor.currentCardStatus === 'clear' || contractor.currentCardStatus === 'yellow');
                      const redBanned = contractor.currentCardStatus === 'red';
                      const notCleared = redBanned || contractor.rightToWork !== 'valid' || !contractor.inductionCompleted;
                      const blockReason = redBanned ? 'Active site ban (Red Card)' : contractor.rightToWork !== 'valid' ? 'Right to work not verified' : !contractor.inductionCompleted ? 'Site induction not completed' : '';
                      const lwSession = getContractorLoneWorkerSession(contractor.id);
                      return (
                        <div className="hidden sm:flex items-center gap-1.5 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                          {lwSession && <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-medium bg-amber-100 text-amber-800 animate-pulse"><Shield className="h-3 w-3" />{getLoneWorkerCountdown(lwSession)}</span>}
                          <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={(e) => { e.stopPropagation(); setSelectedWorkerForEdit(contractor); setSelectedWorkerCompanyName(contractor.companyName); setShowContractorEditModal(true); }} title="Edit"><Edit className="h-3.5 w-3.5" /></Button>
                          {isClear && <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-indigo-600 hover:bg-indigo-50" onClick={(e) => { e.stopPropagation(); setPreBookingWorker(contractor); setPreBookCompanyName(contractor.companyName); }} title="Pre-Book"><CalendarPlus className="h-3.5 w-3.5" /></Button>}
                          {lwSession ? (
                            <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-amber-600 hover:text-amber-700 hover:bg-amber-50" onClick={(e) => { e.stopPropagation(); endContractorLoneWorkerMutation.mutate(contractor.id); }} disabled={endContractorLoneWorkerMutation.isPending} title="End lone worker session"><ShieldOff className="h-3.5 w-3.5" /></Button>
                          ) : (contractor.isCheckedIn && companySettings?.loneWorkerEnabled) ? (
                            <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-slate-400 hover:text-green-700 hover:bg-green-50" onClick={(e) => { e.stopPropagation(); startContractorLoneWorkerMutation.mutate(contractor.id); }} disabled={startContractorLoneWorkerMutation.isPending || !contractor.email} title={contractor.email ? "Start lone worker session" : "Worker needs an email address"}><Shield className="h-3.5 w-3.5" /></Button>
                          ) : null}
                          {!contractor.isCheckedIn ? (
                            <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); if (notCleared) { toast({ title: "Cannot Check In", description: blockReason, variant: "destructive" }); return; } setWorkerForCheckIn(contractor); setCompanyForCheckIn(contractor.companyName); setShowHSModal(true); }} disabled={checkInMutation.isPending} title={notCleared ? blockReason : 'Check in'} className={`h-9 px-3 ${notCleared ? 'text-gray-400 border-gray-200 cursor-not-allowed' : 'text-green-600 border-green-300 hover:bg-green-50'}`}><LogIn className="mr-1 h-4 w-4" />Check In</Button>
                          ) : (
                            <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); checkOutMutation.mutate(contractor.id); }} disabled={checkOutMutation.isPending} className="h-9 px-3 text-red-600 border-red-300 hover:bg-red-50"><LogOut className="mr-1 h-4 w-4" />Check Out</Button>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                  {/* Mobile: actions as bottom row */}
                  {(() => {
                    const isBanned = contractor.currentCardStatus === 'red' && contractor.redCardBanUntil && new Date(contractor.redCardBanUntil) > new Date();
                    const isClear = !isBanned && contractor.isActive && (!contractor.currentCardStatus || contractor.currentCardStatus === 'clear' || contractor.currentCardStatus === 'yellow');
                    const redBanned = contractor.currentCardStatus === 'red';
                    const notCleared = redBanned || contractor.rightToWork !== 'valid' || !contractor.inductionCompleted;
                    const blockReason = redBanned ? 'Active site ban (Red Card)' : contractor.rightToWork !== 'valid' ? 'Right to work not verified' : !contractor.inductionCompleted ? 'Site induction not completed' : '';
                    const lwSession = getContractorLoneWorkerSession(contractor.id);
                    return (
                      <div className="sm:hidden flex items-center justify-between gap-2 px-3 pb-3 pt-1" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center gap-1.5">
                          <Button size="sm" variant="ghost" className="h-9 w-9 p-0" onClick={(e) => { e.stopPropagation(); setSelectedWorkerForEdit(contractor); setSelectedWorkerCompanyName(contractor.companyName); setShowContractorEditModal(true); }} title="Edit"><Edit className="h-4 w-4" /></Button>
                          {isClear && <Button size="sm" variant="ghost" className="h-9 w-9 p-0 text-indigo-600 hover:bg-indigo-50" onClick={(e) => { e.stopPropagation(); setPreBookingWorker(contractor); setPreBookCompanyName(contractor.companyName); }} title="Pre-Book"><CalendarPlus className="h-4 w-4" /></Button>}
                          {lwSession ? (
                            <Button size="sm" variant="ghost" className="h-9 w-9 p-0 text-amber-600 hover:text-amber-700 hover:bg-amber-50" onClick={(e) => { e.stopPropagation(); endContractorLoneWorkerMutation.mutate(contractor.id); }} disabled={endContractorLoneWorkerMutation.isPending} title="End lone worker session"><ShieldOff className="h-4 w-4" /></Button>
                          ) : (contractor.isCheckedIn && companySettings?.loneWorkerEnabled) ? (
                            <Button size="sm" variant="ghost" className="h-9 w-9 p-0 text-slate-400 hover:text-green-700 hover:bg-green-50" onClick={(e) => { e.stopPropagation(); startContractorLoneWorkerMutation.mutate(contractor.id); }} disabled={startContractorLoneWorkerMutation.isPending || !contractor.email} title={contractor.email ? "Start lone worker session" : "Worker needs an email address"}><Shield className="h-4 w-4" /></Button>
                          ) : null}
                        </div>
                        {!contractor.isCheckedIn ? (
                          <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); if (notCleared) { toast({ title: "Cannot Check In", description: blockReason, variant: "destructive" }); return; } setWorkerForCheckIn(contractor); setCompanyForCheckIn(contractor.companyName); setShowHSModal(true); }} disabled={checkInMutation.isPending} title={notCleared ? blockReason : 'Check in'} className={`h-9 px-3 font-medium ${notCleared ? 'text-gray-400 border-gray-200 cursor-not-allowed' : 'text-green-600 border-green-300 hover:bg-green-50'}`}><LogIn className="mr-1 h-4 w-4" />Check In</Button>
                        ) : (
                          <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); checkOutMutation.mutate(contractor.id); }} disabled={checkOutMutation.isPending} className="h-9 px-3 font-medium text-red-600 border-red-300 hover:bg-red-50"><LogOut className="mr-1 h-4 w-4" />Check Out</Button>
                        )}
                      </div>
                    );
                  })()}
                </div>
                )
              ))}
            </div>

            {previousContractors.length === 0 && (
              <div className="text-center py-8 text-slate-500 dark:text-slate-400">
                {searchTerm ? `No contractors found matching "${searchTerm}"` : "No previous contractors found"}
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === "walkin" && (
        <GlassCard className="p-6">
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <UserPlus className="h-5 w-5 text-green-600" />
              <h2 className="text-xl font-semibold text-slate-800 dark:text-slate-100">Walk-in Registration</h2>
              <span className="hidden sm:inline text-sm text-slate-500 dark:text-slate-400">
                Register new contractor with document upload for clearance
              </span>
            </div>
            
            <div className="text-center py-8">
              <p className="text-slate-600 dark:text-slate-300 mb-4">Register a new contractor who is visiting for the first time</p>
              <Button
                onClick={() => setShowWalkInForm(true)}
                className="bg-green-600 hover:bg-green-700 text-white"
                data-testid="button-start-walkin-registration"
              >
                <UserPlus className="mr-2 h-4 w-4" />
                Start Walk-in Registration
              </Button>
            </div>
          </div>
        </GlassCard>
      )}

      {activeTab === "contractors" && (
        <GlassCard className="p-6">
          <div className="space-y-4">
            {/* Section Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Building2 className="h-5 w-5 text-purple-600" />
                <h2 className="text-xl font-semibold text-slate-800 dark:text-slate-100">Contractor Companies</h2>
                <span className="hidden sm:inline text-sm text-slate-500 dark:text-slate-400">
                  Manage all contractor companies and their details
                </span>
              </div>
              <Button
                onClick={() => setShowAddContractorDialog(true)}
                className="bg-blue-600 hover:bg-blue-700 text-white"
                data-testid="button-add-contractor"
              >
                <Plus className="mr-2 h-4 w-4" />
                Add Contractor
              </Button>
            </div>

            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-3 h-5 w-5 text-slate-400" />
              <Input
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search by company name, industry, phone, or email..."
                className="pl-10"
                data-testid="input-search-companies"
              />
            </div>

            {/* Show All Button & View Toggle */}
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2">
              <div className="text-sm text-slate-600 dark:text-slate-300">
                Showing {showAllCompanies ? companies.filter(company => 
                  matchesSearch(company, searchTerm)
                ).length : Math.min(6, companies.filter(company => 
                  matchesSearch(company, searchTerm)
                ).length)} of {companies.filter(company => 
                  matchesSearch(company, searchTerm)
                ).length} companies
                {searchTerm && ` matching "${searchTerm}"`}
              </div>
              <div className="flex items-center gap-2">
                <div className="flex border rounded-lg overflow-hidden">
                  <Button
                    size="sm"
                    variant={companyViewMode === 'grid' ? 'default' : 'outline'}
                    className="rounded-none border-0 px-2"
                    onClick={() => setCompanyViewMode('grid')}
                    title="Grid view"
                  >
                    <LayoutGrid size={14} />
                  </Button>
                  <Button
                    size="sm"
                    variant={companyViewMode === 'list' ? 'default' : 'outline'}
                    className="rounded-none border-0 px-2"
                    onClick={() => setCompanyViewMode('list')}
                    title="List view"
                  >
                    <List size={14} />
                  </Button>
                </div>
                <Button 
                  variant="outline"
                  size="sm"
                  className="text-purple-600 border-purple-600 hover:bg-purple-50 text-xs sm:text-sm whitespace-nowrap"
                  onClick={() => setShowAllCompanies(!showAllCompanies)}
                >
                  {showAllCompanies ? 'Show Less' : `Show All ${companies.length} Companies`}
                </Button>
              </div>
            </div>

            {/* Companies Grid/List */}
            <div className={companyViewMode === 'grid' ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4" : "space-y-2"}>
              {companies.filter(company => 
                matchesSearch(company, searchTerm)
              ).slice(0, showAllCompanies ? companies.length : 6).map((company) => (
                companyViewMode === 'grid' ? (
                <GlassCard key={company.id} className="p-4 hover:shadow-md transition-shadow">
                  <div className="space-y-3">
                    <div>
                      <h3
                        className="font-semibold text-slate-800 dark:text-slate-100 hover:text-blue-700 dark:hover:text-blue-400 cursor-pointer hover:underline transition-colors"
                        onClick={() => handleViewContractorDetails(company.id)}
                        title="Click to view contractor details"
                      >
                        {company.name}
                      </h3>
                      <p className="text-sm text-slate-600 dark:text-slate-300">{company.contactEmail || company.email}</p>
                      <p className="text-sm text-slate-600 dark:text-slate-300">{(company as any).contactPhone || company.phone || 'No phone provided'}</p>
                      {company.industry && (
                        <p className="text-sm text-blue-600 font-medium capitalize">
                          {company.industry}
                        </p>
                      )}
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        Workers: {company.workersCount || 0}
                      </p>
                    </div>

                    <div className="flex flex-wrap gap-1">
                      <Badge 
                        className={company.status === 'approved' ? "bg-green-100 text-green-800" : "bg-yellow-100 text-yellow-800"}
                      >
                        {company.status || 'pending'}
                      </Badge>
                      
                      <Badge className={getSafetyRatingColor(company.complianceScore || 'N/A')}>
                        {company.complianceScore || 'N/A'}
                      </Badge>
                      
                      {company.industry && (
                        <Badge className="bg-blue-100 text-blue-800 capitalize">
                          {company.serviceType || company.industry}
                        </Badge>
                      )}

                      {/* Compliance badge — derived from documentsStatus */}
                      {(() => {
                        const badge = getComplianceBadge((company as any).documentsStatus);
                        return (
                          <Badge className={`${badge.className} text-xs`} title="Document compliance status">
                            {badge.icon} {badge.label}
                          </Badge>
                        );
                      })()}

                      {/* CDM duty role badge */}
                      {company.cdmRole && (
                        <Badge className="bg-purple-100 text-purple-800 text-xs" title="CDM duty holder role">
                          CDM: {company.cdmRole.replace(/_/g, ' ')}
                        </Badge>
                      )}

                      {/* Constructionline grade badge */}
                      {company.constructionlineGrade && company.constructionlineGrade !== "not_registered" && (
                        <Badge className="bg-indigo-100 text-indigo-800 text-xs" title="Constructionline grade">
                          CL {company.constructionlineGrade}
                        </Badge>
                      )}

                      {/* CHAS certified badge */}
                      {company.chasCertified && (
                        <Badge className="bg-teal-100 text-teal-800 text-xs" title="CHAS accredited">
                          CHAS
                        </Badge>
                      )}

                      {/* SMAS accredited badge */}
                      {company.smasAccredited && (
                        <Badge className="bg-cyan-100 text-cyan-800 text-xs" title="SMAS accredited">
                          SMAS
                        </Badge>
                      )}
                    </div>

                    {/* Finish setup link if onboarding incomplete */}
                    {(company as any).onboardingCompleted === false && (
                      <button
                        className="text-xs text-amber-600 font-medium flex items-center gap-1 hover:underline"
                        onClick={() => handleViewContractorDetails(company.id)}
                      >
                        <Zap className="w-3 h-3" /> Finish setup
                      </button>
                    )}

                    <div className="space-y-2">
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          onClick={() => handleViewContractorDetails(company.id)}
                          className="flex-1 bg-blue-600 hover:bg-blue-700 text-white"
                          data-testid={`button-workers-${company.id}`}
                        >
                          <Users className="h-3 w-3 mr-1" />
                          Workers
                        </Button>
                        
                        <Button
                          size="sm"
                          variant="outline"
                          className="flex-1 text-purple-600 border-purple-300 hover:bg-purple-50"
                          onClick={() => setLocation(`/contractors/${company.id}?tab=documents`)}
                          data-testid={`button-documents-${company.id}`}
                        >
                          <FileText className="h-3 w-3 mr-1" />
                          Documents
                        </Button>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          className="flex-1 text-green-600 border-green-600 hover:bg-green-50"
                          onClick={() => {
                            setSelectedContractor(company);
                            setWorkerForm({ ...workerForm, companyId: company.id });
                            setShowAddWorkerDialog(true);
                          }}
                          data-testid={`button-add-worker-${company.id}`}
                        >
                          <UserPlus className="h-3 w-3 mr-1" />
                          Add Worker
                        </Button>
                      </div>
                      
                      <div className="flex gap-2">
                        <Button 
                          size="sm" 
                          variant="outline" 
                          className="flex-1 text-blue-600 hover:bg-blue-50"
                          onClick={() => handleEditContractor(company.id)}
                          data-testid={`button-edit-company-${company.id}`}
                        >
                          <Edit className="h-3 w-3 mr-1" />
                          Edit
                        </Button>
                        
                        <Button 
                          size="sm" 
                          variant="outline" 
                          className="flex-1 text-red-600 hover:bg-red-50"
                          onClick={() => handleDeleteContractor(company.id, company.name)}
                          disabled={deleteContractorMutation.isPending}
                          data-testid={`button-delete-company-${company.id}`}
                        >
                          <Trash2 className="h-3 w-3 mr-1" />
                          Delete
                        </Button>
                      </div>
                    </div>
                  </div>
                </GlassCard>
                ) : (
                <GlassCard key={company.id} className="p-3 hover:shadow-md transition-shadow">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-4 flex-1 min-w-0">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3
                            className="font-semibold text-slate-800 dark:text-slate-100 truncate hover:text-blue-700 dark:hover:text-blue-400 cursor-pointer hover:underline transition-colors"
                            onClick={() => handleViewContractorDetails(company.id)}
                          >{company.name}</h3>
                          <Badge 
                            className={`text-xs ${company.status === 'approved' ? "bg-green-100 text-green-800" : "bg-yellow-100 text-yellow-800"}`}
                          >
                            {company.status || 'pending'}
                          </Badge>
                          <Badge className={`text-xs ${getSafetyRatingColor(company.complianceScore || 'N/A')}`}>
                            {company.complianceScore || 'N/A'}
                          </Badge>
                          {company.industry && (
                            <Badge className="text-xs bg-blue-100 text-blue-800 capitalize">
                              {company.serviceType || company.industry}
                            </Badge>
                          )}
                          {/* Compliance badge */}
                          {(() => {
                            const badge = getComplianceBadge((company as any).documentsStatus);
                            return (
                              <Badge className={`${badge.className} text-xs`}>
                                {badge.icon} {badge.label}
                              </Badge>
                            );
                          })()}
                          {/* CDM accreditation badges */}
                          {company.cdmRole && (
                            <Badge className="bg-purple-100 text-purple-800 text-xs" title="CDM duty holder role">
                              CDM: {company.cdmRole.replace(/_/g, ' ')}
                            </Badge>
                          )}
                          {company.constructionlineGrade && company.constructionlineGrade !== "not_registered" && (
                            <Badge className="bg-indigo-100 text-indigo-800 text-xs">CL {company.constructionlineGrade}</Badge>
                          )}
                          {company.chasCertified && <Badge className="bg-teal-100 text-teal-800 text-xs">CHAS</Badge>}
                          {company.smasAccredited && <Badge className="bg-cyan-100 text-cyan-800 text-xs">SMAS</Badge>}
                          {(company as any).onboardingCompleted === false && (
                            <span className="text-xs text-amber-600 font-medium flex items-center gap-1 cursor-pointer hover:underline" onClick={() => handleViewContractorDetails(company.id)}>
                              <Zap className="w-3 h-3" /> Finish setup
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-4 text-sm text-slate-600 dark:text-slate-300 mt-1">
                          <span>{company.contactEmail || company.email}</span>
                          <span>{(company as any).contactPhone || company.phone || 'No phone'}</span>
                          <span className="text-xs text-slate-500 dark:text-slate-400">Workers: {company.workersCount || 0}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <Button
                        size="sm"
                        onClick={() => handleViewContractorDetails(company.id)}
                        className="bg-blue-600 hover:bg-blue-700 text-white"
                      >
                        <Users className="h-3 w-3 mr-1" />
                        Workers
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-purple-600 border-purple-300 hover:bg-purple-50"
                        onClick={() => setLocation(`/contractors/${company.id}?tab=documents`)}
                      >
                        <FileText className="h-3 w-3 mr-1" />
                        Documents
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-green-600 border-green-600 hover:bg-green-50"
                        onClick={() => {
                          setSelectedContractor(company);
                          setWorkerForm({ ...workerForm, companyId: company.id });
                          setShowAddWorkerDialog(true);
                        }}
                      >
                        <UserPlus className="h-3 w-3 mr-1" />
                        Add Worker
                      </Button>
                      <Button 
                        size="sm" 
                        variant="outline" 
                        className="text-blue-600 hover:bg-blue-50"
                        onClick={() => handleEditContractor(company.id)}
                      >
                        <Edit className="h-3 w-3 mr-1" />
                        Edit
                      </Button>
                      <Button 
                        size="sm" 
                        variant="outline" 
                        className="text-red-600 hover:bg-red-50"
                        onClick={() => handleDeleteContractor(company.id, company.name)}
                        disabled={deleteContractorMutation.isPending}
                      >
                        <Trash2 className="h-3 w-3 mr-1" />
                        Delete
                      </Button>
                    </div>
                  </div>
                </GlassCard>
                )
              ))}
            </div>

            {companies.filter(company => 
              matchesSearch(company, searchTerm)
            ).length === 0 && (
              <div className="text-center py-8 text-slate-500 dark:text-slate-400">
                {searchTerm ? `No contractor companies found matching "${searchTerm}"` : "No contractor companies found"}
              </div>
            )}
          </div>
        </GlassCard>
      )}

      {activeTab === "prebook" && (
        <ContractorPreBooking />
      )}

      {/* Contractor Pass Preview Modal */}
      {selectedWorker && (
        <ContractorPassPreviewModal
          isOpen={showPassPreview}
          onClose={() => {
            setShowPassPreview(false);
            setSelectedWorker(null);
            setSelectedCompanyName("");
          }}
          worker={selectedWorker}
          companyName={selectedCompanyName}
        />
      )}

      {/* Removed simple EditContractorWorkerModal - now using comprehensive ContractorEditModal for all edits */}
      
      {/* Contractor Edit Modal with Check-in/out */}
      <ContractorEditModal
        worker={selectedWorkerForEdit}
        companyName={selectedWorkerCompanyName}
        open={showContractorEditModal}
        onOpenChange={setShowContractorEditModal}
      />
      
      {/* Edit Contractor Company Dialog */}
      <Dialog open={showCompanyEditDialog} onOpenChange={setShowCompanyEditDialog}>
        <DialogContent className="w-[95vw] sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Edit className="h-5 w-5" />
              Edit Contractor Company
            </DialogTitle>
            <DialogDescription>
              Update contractor company details and service information.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-200">Company Name *</label>
              <Input
                value={contractorForm.name}
                onChange={(e) => setContractorForm({ ...contractorForm, name: e.target.value })}
                placeholder=""
                data-testid="input-edit-company-name"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-200">Contact First Name *</label>
              <Input
                value={contractorForm.contactFirstName}
                onChange={(e) => setContractorForm({ ...contractorForm, contactFirstName: e.target.value })}
                placeholder=""
                data-testid="input-edit-contact-first-name"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-200">Contact Last Name *</label>
              <Input
                value={contractorForm.contactLastName}
                onChange={(e) => setContractorForm({ ...contractorForm, contactLastName: e.target.value })}
                placeholder=""
                data-testid="input-edit-contact-last-name"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-200">Email Address *</label>
              <Input
                type="email"
                value={contractorForm.email}
                onChange={(e) => setContractorForm({ ...contractorForm, email: e.target.value })}
                placeholder=""
                data-testid="input-edit-email"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-200">Phone Number *</label>
              <Input
                type="tel"
                value={contractorForm.phone}
                onChange={(e) => setContractorForm({ ...contractorForm, phone: e.target.value })}
                placeholder=""
                data-testid="input-edit-phone"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-200">Postcode</label>
              <Input
                value={contractorForm.postcode}
                onChange={(e) => setContractorForm({ ...contractorForm, postcode: e.target.value })}
                placeholder=""
                data-testid="input-edit-postcode"
              />
            </div>
            <div className="col-span-2 space-y-2">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-200">Address *</label>
              <Textarea
                value={contractorForm.address}
                onChange={(e) => setContractorForm({ ...contractorForm, address: e.target.value })}
                placeholder=""
                data-testid="input-edit-address"
                rows={2}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-200">Website</label>
              <Input
                value={contractorForm.website}
                onChange={(e) => setContractorForm({ ...contractorForm, website: e.target.value })}
                placeholder=""
                data-testid="input-edit-website"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-200">Industry</label>
              <select
                value={contractorForm.industry}
                onChange={(e) => setContractorForm({ ...contractorForm, industry: e.target.value })}
                data-testid="select-edit-industry"
                className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring appearance-none"
              >
                <option value="">Select industry</option>
                <option value="construction">Construction</option>
                <option value="electrical">Electrical</option>
                <option value="plumbing">Plumbing</option>
                <option value="hvac">HVAC</option>
                <option value="roofing">Roofing</option>
                <option value="painting">Painting</option>
                <option value="landscaping">Landscaping</option>
                <option value="security">Security</option>
                <option value="cleaning">Cleaning</option>
                <option value="it">IT Services</option>
                <option value="catering">Catering</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div className="col-span-2 space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-slate-700 dark:text-slate-200">Description</label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleGenerateDescription}
                  disabled={isGeneratingDescription || !contractorForm.website || !contractorForm.name}
                  className="text-xs"
                  data-testid="button-edit-generate-description"
                >
                  {isGeneratingDescription ? (
                    <>🤖 Generating...</>
                  ) : (
                    <>🤖 Auto-fill with AI</>
                  )}
                </Button>
              </div>
              <Textarea
                value={contractorForm.description}
                onChange={(e) => setContractorForm({ ...contractorForm, description: e.target.value })}
                placeholder=""
                data-testid="input-edit-description"
                rows={2}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-200">Status</label>
              <select
                value={contractorForm.status}
                onChange={(e) => setContractorForm({ ...contractorForm, status: e.target.value as "pending" | "approved" | "suspended" })}
                data-testid="select-edit-status"
                className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring appearance-none"
              >
                <option value="pending">Pending Review</option>
                <option value="approved">Approved</option>
                <option value="suspended">Suspended</option>
              </select>
            </div>
          </div>

          {/* CDM 2015 & Accreditations */}
          <div className="border-t pt-4 mt-2">
            <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-2 mb-3">
              <HardHatIcon className="h-4 w-4 text-amber-600" />CDM 2015 & Accreditations
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-700 dark:text-slate-300">CDM Duty Holder Role</label>
                <select
                  value={cdmAccreditationForm.cdmRole}
                  onChange={e => setCdmAccreditationForm({ ...cdmAccreditationForm, cdmRole: e.target.value })}
                  className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring appearance-none"
                >
                  <option value="">Not specified</option>
                  <option value="principal_contractor">Principal Contractor</option>
                  <option value="principal_designer">Principal Designer</option>
                  <option value="contractor">Contractor</option>
                  <option value="designer">Designer</option>
                  <option value="client">Client</option>
                </select>
              </div>
              {/* Constructionline Grade */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-700 dark:text-slate-300">Constructionline Grade</label>
                <select
                  value={cdmAccreditationForm.constructionlineGrade}
                  onChange={e => setCdmAccreditationForm({ ...cdmAccreditationForm, constructionlineGrade: e.target.value })}
                  className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring appearance-none"
                >
                  <option value="">Not Registered</option>
                  <option value="registered">Registered</option>
                  <option value="silver">Silver</option>
                  <option value="gold">Gold</option>
                  <option value="platinum">Platinum</option>
                </select>
              </div>
              {/* CHAS Accreditation */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-700 dark:text-slate-300">CHAS</label>
                <label className="flex items-center gap-2 cursor-pointer text-sm h-9 border border-input rounded-md px-3">
                  <input type="checkbox" className="h-4 w-4" checked={cdmAccreditationForm.chasCertified} onChange={e => setCdmAccreditationForm({ ...cdmAccreditationForm, chasCertified: e.target.checked })} />
                  CHAS Certified
                </label>
              </div>
              {/* SMAS Worksafe */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-700 dark:text-slate-300">SMAS Worksafe</label>
                <label className="flex items-center gap-2 cursor-pointer text-sm h-9 border border-input rounded-md px-3">
                  <input type="checkbox" className="h-4 w-4" checked={cdmAccreditationForm.smasAccredited} onChange={e => setCdmAccreditationForm({ ...cdmAccreditationForm, smasAccredited: e.target.checked })} />
                  SMAS Accredited
                </label>
              </div>
              {/* Other Accreditations */}
              <div className="col-span-2 space-y-1.5">
                <label className="text-xs font-medium text-slate-700 dark:text-slate-300">Other Accreditations (e.g. CHAS, Acclaim, SafeContractor)</label>
                <Input className="h-9 text-sm" value={cdmAccreditationForm.otherAccreditations} onChange={e => setCdmAccreditationForm({ ...cdmAccreditationForm, otherAccreditations: e.target.value })} placeholder="e.g. CHAS Premium, SafeContractor approved…" />
              </div>
              {/* Principal Designer Professional Body */}
              <div className="col-span-2 space-y-1.5">
                <label className="text-xs font-medium text-slate-700 dark:text-slate-300">Principal Designer Professional Body (if applicable)</label>
                <Input className="h-9 text-sm" value={cdmAccreditationForm.pdProfessionalBody} onChange={e => setCdmAccreditationForm({ ...cdmAccreditationForm, pdProfessionalBody: e.target.value })} placeholder="e.g. RIBA, ARB, ICE, CIOB…" />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => setShowCompanyEditDialog(false)}
              data-testid="button-cancel-edit"
            >
              Cancel
            </Button>
            <Button 
              onClick={() => {
                if (selectedContractor) {
                  updateContractorMutation.mutate({ id: selectedContractor.id, data: contractorForm });
                  updateCdmAccreditationsMutation.mutate({ id: selectedContractor.id, data: cdmAccreditationForm });
                }
              }}
              disabled={!contractorForm.name || !contractorForm.email || !contractorForm.contactFirstName || !contractorForm.contactLastName || updateContractorMutation.isPending}
              className="bg-blue-600 hover:bg-blue-700"
              data-testid="button-update-contractor"
            >
              {updateContractorMutation.isPending ? "Updating..." : "Update Contractor"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* Add Contractor Company — 3-step Wizard */}
      <Dialog open={showAddContractorDialog} onOpenChange={(open) => { setShowAddContractorDialog(open); if (!open) resetAddWizard(); }}>
        <DialogContent className="w-[95vw] sm:max-w-2xl max-h-[92vh] flex flex-col overflow-hidden p-0">
          {/* Header + Progress */}
          <div className="flex-shrink-0 px-6 pt-6 pb-4 border-b">
            <DialogTitle className="flex items-center gap-2 text-lg font-semibold mb-4">
              <Building2 className="h-5 w-5 text-blue-600" />
              Add New Contractor Company
            </DialogTitle>
            {/* Step indicator */}
            <div className="flex items-center gap-0">
              {[{ n: 1, label: "Company Details" }, { n: 2, label: "UK Documents" }, { n: 3, label: "Review" }].map((s, i) => (
                <div key={s.n} className={`flex items-center ${i < 2 ? 'flex-1' : ''}`}>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${addWizardStep >= s.n ? 'bg-blue-600 text-white' : 'bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400'}`}>{addWizardStep > s.n ? '✓' : s.n}</div>
                    <span className={`text-xs font-medium hidden sm:inline transition-colors ${addWizardStep >= s.n ? 'text-blue-700 dark:text-blue-400' : 'text-gray-400 dark:text-gray-500'}`}>{s.label}</span>
                  </div>
                  {i < 2 && <div className={`flex-1 h-0.5 mx-2 transition-colors ${addWizardStep > s.n ? 'bg-blue-600' : 'bg-gray-200 dark:bg-gray-700'}`} />}
                </div>
              ))}
            </div>
          </div>

          {/* Step 1 — Company Details */}
          {addWizardStep === 1 && (
            <div className="overflow-y-auto flex-1 min-h-0 px-6 py-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700 dark:text-slate-200">Company Name *</label>
                  <Input value={contractorForm.name} onChange={(e) => setContractorForm({ ...contractorForm, name: e.target.value })} data-testid="input-company-name" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700 dark:text-slate-200">Industry</label>
                  <Select value={contractorForm.industry} onValueChange={(v) => setContractorForm({ ...contractorForm, industry: v })}>
                    <SelectTrigger data-testid="select-industry"><SelectValue placeholder="Select industry" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="construction">Construction</SelectItem>
                      <SelectItem value="electrical">Electrical</SelectItem>
                      <SelectItem value="plumbing">Plumbing & Heating</SelectItem>
                      <SelectItem value="hvac">HVAC / Mechanical</SelectItem>
                      <SelectItem value="roofing">Roofing</SelectItem>
                      <SelectItem value="painting">Painting & Decorating</SelectItem>
                      <SelectItem value="landscaping">Landscaping / Grounds</SelectItem>
                      <SelectItem value="security">Security</SelectItem>
                      <SelectItem value="cleaning">Cleaning / Facilities</SelectItem>
                      <SelectItem value="it">IT Services</SelectItem>
                      <SelectItem value="catering">Catering</SelectItem>
                      <SelectItem value="engineering">Engineering</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700 dark:text-slate-200">Contact First Name *</label>
                  <Input value={contractorForm.contactFirstName} onChange={(e) => setContractorForm({ ...contractorForm, contactFirstName: e.target.value })} data-testid="input-contact-first-name" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700 dark:text-slate-200">Contact Last Name *</label>
                  <Input value={contractorForm.contactLastName} onChange={(e) => setContractorForm({ ...contractorForm, contactLastName: e.target.value })} data-testid="input-contact-last-name" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700 dark:text-slate-200">Email Address *</label>
                  <Input type="email" value={contractorForm.email} onChange={(e) => setContractorForm({ ...contractorForm, email: e.target.value })} data-testid="input-email" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700 dark:text-slate-200">Phone Number *</label>
                  <Input type="tel" value={contractorForm.phone} onChange={(e) => setContractorForm({ ...contractorForm, phone: e.target.value })} data-testid="input-phone" />
                </div>
                <div className="md:col-span-2 space-y-2">
                  <label className="text-sm font-medium text-slate-700 dark:text-slate-200">Address</label>
                  <Textarea value={contractorForm.address} onChange={(e) => setContractorForm({ ...contractorForm, address: e.target.value })} data-testid="input-address" rows={2} />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700 dark:text-slate-200">Postcode</label>
                  <Input value={contractorForm.postcode} onChange={(e) => setContractorForm({ ...contractorForm, postcode: e.target.value })} data-testid="input-postcode" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700 dark:text-slate-200">Website</label>
                  <Input value={contractorForm.website} onChange={(e) => setContractorForm({ ...contractorForm, website: e.target.value })} data-testid="input-website" />
                </div>
                <div className="md:col-span-2 space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium text-slate-700 dark:text-slate-200">Description</label>
                    <Button type="button" variant="outline" size="sm" onClick={handleGenerateDescription} disabled={isGeneratingDescription || !contractorForm.website || !contractorForm.name} className="text-xs" data-testid="button-generate-description">
                      {isGeneratingDescription ? <>🤖 Generating...</> : <>🤖 Auto-fill with AI</>}
                    </Button>
                  </div>
                  <Textarea value={contractorForm.description} onChange={(e) => setContractorForm({ ...contractorForm, description: e.target.value })} data-testid="input-description" rows={2} />
                </div>
              </div>
            </div>
          )}

          {/* Step 2 — UK Compliance Documents */}
          {addWizardStep === 2 && (
            <div className="overflow-y-auto flex-1 min-h-0 px-6 py-4 space-y-5">
              <div className="bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-700 rounded-lg px-4 py-3 text-sm text-blue-800 dark:text-blue-300">
                Tick which documents this contractor currently holds. You can upload the actual files from their detail page after registration. This helps you track compliance from day one.
              </div>

              {/* Legally Required */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-6 h-6 bg-red-100 rounded-full flex items-center justify-center flex-shrink-0">
                    <Lock className="w-3.5 h-3.5 text-red-600" />
                  </div>
                  <h4 className="font-semibold text-gray-900 dark:text-white text-sm">Legally Required</h4>
                  <Badge className="bg-red-100 text-red-700 text-xs">UK Law</Badge>
                </div>
                <div className="space-y-2">
                  {UK_LEGAL_DOCS.map(doc => (
                    <label key={doc.key} className={`flex items-start gap-3 p-3 border rounded-lg cursor-pointer transition-colors ${docChecklist[doc.key] ? 'border-green-400 bg-green-50 dark:bg-green-900/20 dark:border-green-600' : 'border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800'}`}>
                      <input type="checkbox" checked={docChecklist[doc.key]} onChange={(e) => setDocChecklist({ ...docChecklist, [doc.key]: e.target.checked })} className="mt-0.5 w-4 h-4 accent-green-600 flex-shrink-0" />
                      <div className="min-w-0">
                        <p className="font-medium text-sm text-gray-900 dark:text-white">{doc.name}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{doc.basis} — {doc.note}</p>
                      </div>
                      {docChecklist[doc.key] && <CheckCircle className="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5" />}
                    </label>
                  ))}
                </div>
              </div>

              {/* Site Required */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-6 h-6 bg-amber-100 rounded-full flex items-center justify-center flex-shrink-0">
                    <Shield className="w-3.5 h-3.5 text-amber-600" />
                  </div>
                  <h4 className="font-semibold text-gray-900 dark:text-white text-sm">Site Required</h4>
                  <Badge className="bg-amber-100 text-amber-700 text-xs">Most sites</Badge>
                </div>
                <div className="space-y-2">
                  {UK_SITE_DOCS.map(doc => (
                    <label key={doc.key} className={`flex items-start gap-3 p-3 border rounded-lg cursor-pointer transition-colors ${docChecklist[doc.key] ? 'border-green-400 bg-green-50 dark:bg-green-900/20 dark:border-green-600' : 'border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800'}`}>
                      <input type="checkbox" checked={docChecklist[doc.key]} onChange={(e) => setDocChecklist({ ...docChecklist, [doc.key]: e.target.checked })} className="mt-0.5 w-4 h-4 accent-green-600 flex-shrink-0" />
                      <div className="min-w-0">
                        <p className="font-medium text-sm text-gray-900 dark:text-white">{doc.name}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{doc.basis} — {doc.note}</p>
                      </div>
                      {docChecklist[doc.key] && <CheckCircle className="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5" />}
                    </label>
                  ))}
                </div>
              </div>

              {/* Good Practice */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-6 h-6 bg-green-100 rounded-full flex items-center justify-center flex-shrink-0">
                    <CheckSquare className="w-3.5 h-3.5 text-green-600" />
                  </div>
                  <h4 className="font-semibold text-gray-900 dark:text-white text-sm">Good Practice</h4>
                  <Badge className="bg-green-100 text-green-700 text-xs">Recommended</Badge>
                </div>
                <div className="space-y-2">
                  {UK_GOOD_DOCS.map(doc => (
                    <label key={doc.key} className={`flex items-start gap-3 p-3 border rounded-lg cursor-pointer transition-colors ${docChecklist[doc.key] ? 'border-green-400 bg-green-50 dark:bg-green-900/20 dark:border-green-600' : 'border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800'}`}>
                      <input type="checkbox" checked={docChecklist[doc.key]} onChange={(e) => setDocChecklist({ ...docChecklist, [doc.key]: e.target.checked })} className="mt-0.5 w-4 h-4 accent-green-600 flex-shrink-0" />
                      <div className="min-w-0">
                        <p className="font-medium text-sm text-gray-900 dark:text-white">{doc.name}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{doc.basis} — {doc.note}</p>
                      </div>
                      {docChecklist[doc.key] && <CheckCircle className="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5" />}
                    </label>
                  ))}
                </div>
              </div>

              {/* Running count */}
              <div className="text-center text-sm text-gray-600 dark:text-gray-300 pt-1">
                {Object.values(docChecklist).filter(Boolean).length} of {[...UK_LEGAL_DOCS, ...UK_SITE_DOCS].length} required documents confirmed
              </div>
            </div>
          )}

          {/* Step 3 — Review & Submit */}
          {addWizardStep === 3 && (
            <div className="overflow-y-auto flex-1 min-h-0 px-6 py-4 space-y-4">
              <p className="text-sm text-gray-600 dark:text-gray-300">Please review the details before creating the contractor record.</p>

              {/* Company summary */}
              <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 space-y-2">
                <h4 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2"><Building2 className="w-4 h-4" /> Company Details</h4>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                  <span className="text-gray-500 dark:text-gray-400">Company</span><span className="font-medium">{contractorForm.name}</span>
                  <span className="text-gray-500 dark:text-gray-400">Contact</span><span>{contractorForm.contactFirstName} {contractorForm.contactLastName}</span>
                  <span className="text-gray-500 dark:text-gray-400">Email</span><span>{contractorForm.email}</span>
                  <span className="text-gray-500 dark:text-gray-400">Phone</span><span>{contractorForm.phone || '—'}</span>
                  <span className="text-gray-500 dark:text-gray-400">Industry</span><span className="capitalize">{contractorForm.industry || '—'}</span>
                  <span className="text-gray-500 dark:text-gray-400">Postcode</span><span>{contractorForm.postcode || '—'}</span>
                </div>
              </div>

              {/* Document checklist summary */}
              <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 space-y-2">
                <h4 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2"><FileText className="w-4 h-4" /> Compliance Documents</h4>
                <div className="space-y-1.5">
                  {[...UK_LEGAL_DOCS, ...UK_SITE_DOCS, ...UK_GOOD_DOCS].map(doc => (
                    <div key={doc.key} className="flex items-center gap-2 text-sm">
                      {docChecklist[doc.key]
                        ? <CheckCircle className="w-4 h-4 text-green-600 flex-shrink-0" />
                        : <div className="w-4 h-4 rounded-full border-2 border-gray-300 dark:border-gray-500 flex-shrink-0" />
                      }
                      <span className={docChecklist[doc.key] ? 'text-gray-800 dark:text-gray-100' : 'text-gray-400 dark:text-gray-500'}>{doc.name}</span>
                      {!docChecklist[doc.key] && UK_LEGAL_DOCS.some(d => d.key === doc.key) && <Badge className="bg-red-100 text-red-700 text-xs ml-auto">Required</Badge>}
                    </div>
                  ))}
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">Upload the actual document files from the contractor's detail page after registration.</p>
              </div>

              {/* Warnings */}
              {(!docChecklist.publicLiability || !docChecklist.employersLiability) && (
                <div className="bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-700 rounded-lg px-4 py-3 flex items-start gap-2 text-sm text-amber-800 dark:text-amber-300">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <span>Some legally required documents have not been confirmed. Ensure these are provided before the contractor begins any work on site.</span>
                </div>
              )}
            </div>
          )}

          {/* Step 4 — Success */}
          {addWizardStep === 4 && (
            <div className="overflow-y-auto flex-1 min-h-0 px-6 py-8 flex flex-col items-center justify-center gap-6 text-center">
              <div className="w-16 h-16 bg-green-100 dark:bg-green-900/40 rounded-full flex items-center justify-center">
                <CheckCircle className="w-9 h-9 text-green-600" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">Contractor Added Successfully</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  <span className="font-medium text-gray-800 dark:text-gray-100">{justCreatedCompany?.name || justCreatedCompany?.companyName || 'The company'}</span> has been registered.
                  Upload their compliance documents from the detail page at any time.
                </p>
              </div>
              <div className="flex flex-col sm:flex-row gap-3 w-full max-w-sm">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => { setShowAddContractorDialog(false); resetAddWizard(); }}
                >
                  Done
                </Button>
                <Button
                  className="flex-1 bg-blue-600 hover:bg-blue-700"
                  onClick={() => {
                    setShowAddContractorDialog(false);
                    resetAddWizard();
                    if (justCreatedCompany) {
                      setSelectedContractor(justCreatedCompany as any);
                      setWorkerForm({ ...workerForm, companyId: justCreatedCompany.id });
                      setShowAddWorkerDialog(true);
                    }
                  }}
                >
                  Add First Worker →
                </Button>
              </div>
            </div>
          )}

          {/* Footer navigation */}
          <div className="flex-shrink-0 border-t px-6 py-4 flex items-center justify-between gap-3">
            {addWizardStep < 4 && (
              <Button variant="outline" onClick={() => addWizardStep > 1 ? setAddWizardStep(addWizardStep - 1) : setShowAddContractorDialog(false)}>
                {addWizardStep > 1 ? '← Back' : 'Cancel'}
              </Button>
            )}
            {addWizardStep === 4 && <div />}
            <div className="flex items-center gap-2">
              {addWizardStep < 3 ? (
                <Button
                  onClick={() => setAddWizardStep(addWizardStep + 1)}
                  disabled={addWizardStep === 1 && (!contractorForm.name || !contractorForm.email || !contractorForm.contactFirstName || !contractorForm.contactLastName || !contractorForm.phone)}
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  Next →
                </Button>
              ) : addWizardStep === 3 ? (
                <Button onClick={handleAddContractor} disabled={!contractorForm.name || !contractorForm.email || !contractorForm.contactFirstName || !contractorForm.contactLastName || createContractorMutation.isPending} className="bg-blue-600 hover:bg-blue-700" data-testid="button-save-contractor">
                  {createContractorMutation.isPending ? "Creating..." : "Create Contractor"}
                </Button>
              ) : null}
            </div>
          </div>
        </DialogContent>
      </Dialog>
      
      {/* Add Worker — 3-step Wizard */}
      <Dialog open={showAddWorkerDialog} onOpenChange={(open) => { setShowAddWorkerDialog(open); if (!open) resetWorkerWizard(); }}>
        <DialogContent className="w-[95vw] sm:max-w-2xl max-h-[92vh] flex flex-col overflow-hidden p-0">
          {/* Header + Progress */}
          <div className="flex-shrink-0 px-6 pt-6 pb-4 border-b">
            <DialogTitle className="flex items-center gap-2 text-lg font-semibold mb-4">
              <User className="h-5 w-5 text-blue-600" />
              Add Worker — {selectedContractor?.name}
            </DialogTitle>
            <div className="flex items-center gap-0">
              {[{ n: 1, label: "Personal Details" }, { n: 2, label: "Right to Work & Cards" }, { n: 3, label: "Training & Review" }].map((s, i) => (
                <div key={s.n} className={`flex items-center ${i < 2 ? 'flex-1' : ''}`}>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${workerWizardStep >= s.n ? 'bg-blue-600 text-white' : 'bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400'}`}>{workerWizardStep > s.n ? '✓' : s.n}</div>
                    <span className={`text-xs font-medium hidden sm:inline transition-colors ${workerWizardStep >= s.n ? 'text-blue-700 dark:text-blue-400' : 'text-gray-400 dark:text-gray-500'}`}>{s.label}</span>
                  </div>
                  {i < 2 && <div className={`flex-1 h-0.5 mx-2 transition-colors ${workerWizardStep > s.n ? 'bg-blue-600' : 'bg-gray-200 dark:bg-gray-700'}`} />}
                </div>
              ))}
            </div>
          </div>

          {/* Step 1 — Personal Details */}
          {workerWizardStep === 1 && (
            <div className="overflow-y-auto flex-1 min-h-0 px-6 py-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700 dark:text-slate-200">First Name *</label>
                  <Input value={workerForm.firstName} onChange={(e) => setWorkerForm({ ...workerForm, firstName: e.target.value })} data-testid="input-worker-firstname" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700 dark:text-slate-200">Last Name *</label>
                  <Input value={workerForm.lastName} onChange={(e) => setWorkerForm({ ...workerForm, lastName: e.target.value })} data-testid="input-worker-lastname" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700 dark:text-slate-200">Email Address</label>
                  <Input type="email" value={workerForm.email} onChange={(e) => setWorkerForm({ ...workerForm, email: e.target.value })} data-testid="input-worker-email" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700 dark:text-slate-200">Phone Number *</label>
                  <Input type="tel" value={workerForm.phone} onChange={(e) => setWorkerForm({ ...workerForm, phone: e.target.value })} data-testid="input-worker-phone" placeholder="e.g. 07700 900000" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700 dark:text-slate-200">Home Postcode</label>
                  <Input value={workerForm.postcode} onChange={(e) => setWorkerForm({ ...workerForm, postcode: e.target.value })} data-testid="input-worker-postcode" />
                  <p className="text-xs text-slate-500 dark:text-slate-400">Used for CO2 emissions calculations</p>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700 dark:text-slate-200">Vehicle / Transport</label>
                  <select
                    value={workerForm.transportMethod}
                    onChange={(e) => setWorkerForm({ ...workerForm, transportMethod: e.target.value })}
                    data-testid="select-worker-transport"
                    className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring appearance-none"
                  >
                    <option value="car_diesel">Car (Diesel)</option>
                    <option value="car_petrol">Car (Petrol)</option>
                    <option value="electric_car">Electric Car</option>
                    <option value="hybrid_car">Hybrid Car</option>
                    <option value="van_diesel">Van (Diesel)</option>
                    <option value="van_petrol">Van (Petrol)</option>
                    <option value="motorcycle">Motorcycle</option>
                    <option value="public_transport">Public Transport</option>
                    <option value="bicycle">Bicycle</option>
                    <option value="walking">Walking</option>
                  </select>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Used for CO2 emissions calculations</p>
                </div>
              </div>
            </div>
          )}

          {/* Step 2 — Right to Work & Competence Cards */}
          {workerWizardStep === 2 && (
            <div className="overflow-y-auto flex-1 min-h-0 px-6 py-4 space-y-5">

              {/* Right to Work */}
              <div className="border rounded-lg p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 bg-red-100 rounded-full flex items-center justify-center flex-shrink-0">
                    <Lock className="w-3.5 h-3.5 text-red-600" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-gray-900 dark:text-white text-sm">Right to Work</h4>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Immigration Act 2014 — <span className="font-semibold text-red-600">Legally required before work commences</span></p>
                  </div>
                </div>
                <select
                  value={workerForm.rightToWork}
                  onChange={(e) => setWorkerForm({ ...workerForm, rightToWork: e.target.value as "valid" | "expired" | "pending" })}
                  data-testid="select-right-to-work"
                  className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring appearance-none"
                >
                  <option value="valid">Valid — check complete</option>
                  <option value="pending">Pending — check in progress</option>
                  <option value="expired">Expired — requires re-check</option>
                </select>
                {workerForm.rightToWork === 'pending' && (
                  <div className="bg-amber-50 border border-amber-200 rounded px-3 py-2 text-xs text-amber-800">
                    Worker cannot be permitted to work unsupervised until Right to Work is confirmed.
                  </div>
                )}
              </div>

              {/* CSCS Card */}
              <div className="border rounded-lg p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 bg-amber-100 rounded-full flex items-center justify-center flex-shrink-0">
                    <Shield className="w-3.5 h-3.5 text-amber-600" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-gray-900 dark:text-white text-sm">CSCS Card</h4>
                    <p className="text-xs text-gray-500 dark:text-gray-400">CDM 2015 / Site policy — required on most construction sites</p>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-slate-600 dark:text-slate-300">Card Number</label>
                    <Input value={workerForm.cscsCard} onChange={(e) => setWorkerForm({ ...workerForm, cscsCard: e.target.value })} placeholder="e.g. CS-1234567" data-testid="input-cscs-card" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-slate-600 dark:text-slate-300">Status</label>
                    <select
                      value={workerForm.cscsStatus}
                      onChange={(e) => setWorkerForm({ ...workerForm, cscsStatus: e.target.value as "valid" | "expired" | "pending" })}
                      data-testid="select-cscs-status"
                      className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring appearance-none"
                    >
                      <option value="valid">Valid</option>
                      <option value="pending">Pending</option>
                      <option value="expired">Expired</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* IPAF */}
              <div className="border rounded-lg p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 bg-amber-100 rounded-full flex items-center justify-center flex-shrink-0">
                    <Shield className="w-3.5 h-3.5 text-amber-600" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-gray-900 dark:text-white text-sm">IPAF Card</h4>
                    <p className="text-xs text-gray-500 dark:text-gray-400">PUWER / WAHR 2005 — required for MEWP operation (cherry pickers, scissor lifts)</p>
                  </div>
                </div>
                <select
                  value={workerForm.ipafStatus}
                  onChange={(e) => setWorkerForm({ ...workerForm, ipafStatus: e.target.value as "none" | "3a" | "3b" | "1+" | "expired" })}
                  data-testid="select-ipaf-status"
                  className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring appearance-none"
                >
                  <option value="none">Not applicable / not held</option>
                  <option value="3a">3a — Mobile Vertical (scissor lifts)</option>
                  <option value="3b">3b — Mobile Boom (cherry pickers)</option>
                  <option value="1+">1+ — Static Vertical (push-around)</option>
                  <option value="expired">Held but Expired</option>
                </select>
              </div>
            </div>
          )}

          {/* Step 3 — Training & Summary */}
          {workerWizardStep === 3 && (
            <div className="overflow-y-auto flex-1 min-h-0 px-6 py-4 space-y-5">
              {/* Training certificates */}
              <div>
                <h4 className="font-semibold text-gray-900 dark:text-white text-sm mb-3">Training Certificates</h4>
                <div className="space-y-2">
                  <label className="flex items-start gap-3 p-3 border dark:border-gray-700 rounded-lg cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800">
                    <input type="checkbox" checked={workerForm.asbestosAwareness} onChange={(e) => setWorkerForm({ ...workerForm, asbestosAwareness: e.target.checked })} className="mt-0.5 w-4 h-4 accent-green-600" data-testid="checkbox-asbestos" />
                    <div>
                      <p className="font-medium text-sm">Asbestos Awareness</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">CAR 2012 — required for most construction and refurbishment work</p>
                    </div>
                  </label>
                  <label className="flex items-start gap-3 p-3 border dark:border-gray-700 rounded-lg cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800">
                    <input type="checkbox" checked={workerForm.manualHandling} onChange={(e) => setWorkerForm({ ...workerForm, manualHandling: e.target.checked })} className="mt-0.5 w-4 h-4 accent-green-600" data-testid="checkbox-manual-handling" />
                    <div>
                      <p className="font-medium text-sm">Manual Handling</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">MHOR 1992 — required for all roles involving lifting or carrying</p>
                    </div>
                  </label>
                  <label className="flex items-start gap-3 p-3 border dark:border-gray-700 rounded-lg cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800">
                    <input type="checkbox" checked={workerForm.workingAtHeight} onChange={(e) => setWorkerForm({ ...workerForm, workingAtHeight: e.target.checked })} className="mt-0.5 w-4 h-4 accent-green-600" data-testid="checkbox-working-height" />
                    <div>
                      <p className="font-medium text-sm">Working at Height</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">WAHR 2005 — required when using ladders, scaffolding, or MEWPs</p>
                    </div>
                  </label>
                  <label className="flex items-start gap-3 p-3 border dark:border-gray-700 rounded-lg cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800">
                    <input type="checkbox" checked={workerForm.inductionCompleted} onChange={(e) => setWorkerForm({ ...workerForm, inductionCompleted: e.target.checked })} className="mt-0.5 w-4 h-4 accent-green-600" data-testid="checkbox-induction" />
                    <div>
                      <p className="font-medium text-sm">Site Induction Completed</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">Site-specific H&S briefing completed</p>
                    </div>
                  </label>
                </div>
              </div>

              {/* Compliance summary panel */}
              <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 space-y-2">
                <h4 className="font-semibold text-gray-900 dark:text-white text-sm flex items-center gap-2"><Shield className="w-4 h-4" /> Compliance Summary</h4>
                <div className="space-y-1.5 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-gray-600 dark:text-gray-300">Right to Work</span>
                    <Badge className={workerForm.rightToWork === 'valid' ? 'bg-green-100 text-green-700' : workerForm.rightToWork === 'expired' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}>
                      {workerForm.rightToWork === 'valid' ? '✅ Valid' : workerForm.rightToWork === 'expired' ? '❌ Expired' : '⏳ Pending'}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-600 dark:text-gray-300">CSCS Card</span>
                    <Badge className={workerForm.cscsStatus === 'valid' ? 'bg-green-100 text-green-700' : workerForm.cscsStatus === 'expired' ? 'bg-red-100 text-red-700' : workerForm.cscsCard ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-500'}>
                      {workerForm.cscsStatus === 'valid' ? '✅ Valid' : workerForm.cscsStatus === 'expired' ? '❌ Expired' : workerForm.cscsCard ? '⏳ Pending' : '— Not recorded'}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-600 dark:text-gray-300">IPAF</span>
                    <Badge className={workerForm.ipafStatus === 'none' ? 'bg-gray-100 text-gray-500' : workerForm.ipafStatus === 'expired' ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}>
                      {workerForm.ipafStatus === 'none' ? '— Not applicable' : workerForm.ipafStatus === 'expired' ? '❌ Expired' : `✅ ${workerForm.ipafStatus}`}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-600 dark:text-gray-300">Asbestos Awareness</span>
                    <Badge className={workerForm.asbestosAwareness ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}>
                      {workerForm.asbestosAwareness ? '✅ Held' : '— Not recorded'}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-600 dark:text-gray-300">Manual Handling</span>
                    <Badge className={workerForm.manualHandling ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}>
                      {workerForm.manualHandling ? '✅ Held' : '— Not recorded'}
                    </Badge>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Step 4 — Success */}
          {workerWizardStep === 4 && (
            <div className="overflow-y-auto flex-1 min-h-0 px-6 py-10 flex flex-col items-center justify-center gap-5 text-center">
              <div className="w-16 h-16 bg-green-100 dark:bg-green-900/40 rounded-full flex items-center justify-center">
                <CheckCircle className="w-9 h-9 text-green-600" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">Worker Added</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  <span className="font-medium text-gray-800 dark:text-gray-100">{workerWizardSavedName}</span> has been registered to {selectedContractor?.name}.
                </p>
              </div>
              <div className="flex flex-col sm:flex-row gap-3 w-full max-w-sm">
                <Button variant="outline" className="flex-1" onClick={() => { setShowAddWorkerDialog(false); resetWorkerWizard(); }}>
                  Done
                </Button>
                <Button className="flex-1 bg-blue-600 hover:bg-blue-700" onClick={() => resetWorkerWizard()}>
                  Add Another Worker →
                </Button>
              </div>
            </div>
          )}

          {/* Footer navigation */}
          {workerWizardStep < 4 && (
          <div className="flex-shrink-0 border-t px-6 py-4 flex items-center justify-between gap-3">
            <Button variant="outline" onClick={() => workerWizardStep > 1 ? setWorkerWizardStep(workerWizardStep - 1) : setShowAddWorkerDialog(false)}>
              {workerWizardStep > 1 ? '← Back' : 'Cancel'}
            </Button>
            <div className="flex items-center gap-2">
              {workerWizardStep < 3 ? (
                <Button onClick={() => setWorkerWizardStep(workerWizardStep + 1)} disabled={workerWizardStep === 1 && (!workerForm.firstName || !workerForm.lastName || !workerForm.phone)} className="bg-blue-600 hover:bg-blue-700">
                  Next →
                </Button>
              ) : (
                <Button onClick={handleAddWorker} disabled={!workerForm.firstName || !workerForm.lastName || !workerForm.phone || createWorkerMutation.isPending} className="bg-blue-600 hover:bg-blue-700" data-testid="button-save-worker">
                  {createWorkerMutation.isPending ? "Saving..." : "Save Worker"}
                </Button>
              )}
            </div>
          </div>
          )}
        </DialogContent>
      </Dialog>

      {activeTab === "co2" && (
        <div className="space-y-6">
          {/* Company Selection */}
          <GlassCard className="p-4">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Leaf className="h-5 w-5 text-green-600" />
                <span className="font-medium">Select Company:</span>
              </div>
              <Select value={selectedCO2CompanyId} onValueChange={setSelectedCO2CompanyId}>
                <SelectTrigger className="w-64" data-testid="select-co2-company">
                  <SelectValue placeholder="Choose contractor company" />
                </SelectTrigger>
                <SelectContent>
                  {companies.map((company) => (
                    <SelectItem key={company.id} value={company.id}>
                      {company.name} ({company.workersCount} workers)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </GlassCard>

          {/* CO2 Reports Component */}
          {selectedCO2CompanyId && (
            <CO2SustainabilityReports
              companyId={selectedCO2CompanyId}
              companyName={companies.find(c => c.id === selectedCO2CompanyId)?.name}
            />
          )}
        </div>
      )}

      {activeTab === "assign-hs" && (
        <HSDocumentAssignment 
          onNavigateToTab={(target) => {
            switch (target) {
              case 'contractors':
                setActiveTab('contractors');
                break;
              case 'previous':
                setActiveTab('previous');
                break;
              case 'templates':
                toast({
                  title: "Document Templates",
                  description: "Use the assignment dialog to view and manage document templates",
                });
                break;
              case 'assignments':
                toast({
                  title: "Assignment History",
                  description: "Assignment history is displayed in the current dashboard",
                });
                break;
              default:
                break;
            }
          }}
        />
      )}

      {activeTab === "rams" && (
        <RAMSManagement />
      )}

      {activeTab === "ppm" && (
        <ContractorPPMTab />
      )}

      {activeTab === "cdm" && (
        <ContractorCDMTab companies={companies} />
      )}
      
      {/* H&S Acceptance Modal */}
      {workerForCheckIn && (
        <ContractorHSModal
          isOpen={showHSModal}
          onClose={() => {
            setShowHSModal(false);
            setWorkerForCheckIn(null);
            setCompanyForCheckIn("");
          }}
          onAccept={(worker) => {
            setCheckInWorkerId(worker.id);
            setCheckInWorkerName(`${worker.firstName} ${worker.lastName}`);
            setSelectedCheckInHost('');
            setShowCheckInHostDialog(true);
            setShowHSModal(false);
            setWorkerForCheckIn(null);
            setCompanyForCheckIn("");
          }}
          worker={workerForCheckIn}
          companyName={companyForCheckIn}
        />
      )}

      {/* Pre-Book Worker Modal */}
      <Dialog open={!!preBookingWorker} onOpenChange={(open) => !open && setPreBookingWorker(null)}>
        <DialogContent
          className="w-[95vw] sm:max-w-md"
          onFocusOutside={(e) => e.preventDefault()}
          onInteractOutside={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarPlus className="w-5 h-5 text-indigo-600" />
              Pre-Book Worker
            </DialogTitle>
            <DialogDescription>
              Schedule {preBookingWorker?.firstName} {preBookingWorker?.lastName} from {preBookCompanyName} for an upcoming site visit.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="p-3 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
              <div className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-green-600" />
                <span className="text-sm font-medium text-green-700 dark:text-green-400">
                  {preBookingWorker?.firstName} {preBookingWorker?.lastName} - Cleared for Work
                </span>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-start text-left font-normal">
                    <CalendarPlus className="mr-2 h-4 w-4" />
                    {format(preBookDate, "PPP")}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <CalendarPicker
                    mode="single"
                    selected={preBookDate}
                    onSelect={(date) => date && setPreBookDate(date)}
                    disabled={(date) => {
                      const today = new Date();
                      today.setHours(0, 0, 0, 0);
                      const checkDate = new Date(date);
                      checkDate.setHours(0, 0, 0, 0);
                      return checkDate < today;
                    }}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Arrival Time</Label>
                <Input
                  type="time"
                  value={preBookTime}
                  onChange={(e) => setPreBookTime(e.target.value)}
                  min={(() => {
                    const today = new Date();
                    today.setHours(0, 0, 0, 0);
                    const selectedDay = new Date(preBookDate);
                    selectedDay.setHours(0, 0, 0, 0);
                    if (selectedDay.getTime() === today.getTime()) {
                      const now = new Date();
                      return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
                    }
                    return undefined;
                  })()}
                />
              </div>
              <div className="space-y-2">
                <Label>Duration (hours)</Label>
                <select
                  value={preBookDuration}
                  onChange={(e) => setPreBookDuration(e.target.value)}
                  className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring appearance-none"
                >
                  <option value="2">2 hours</option>
                  <option value="4">4 hours (Half day)</option>
                  <option value="8">8 hours (Full day)</option>
                  <option value="10">10 hours</option>
                  <option value="12">12 hours</option>
                </select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Purpose</Label>
              <select
                value={preBookPurpose}
                onChange={(e) => setPreBookPurpose(e.target.value)}
                className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring appearance-none"
              >
                <option value="Site work">Site Work</option>
                <option value="Maintenance">Maintenance</option>
                <option value="Installation">Installation</option>
                <option value="Inspection">Inspection</option>
                <option value="Repair">Repair</option>
                <option value="Survey">Survey</option>
                <option value="Other">Other</option>
              </select>
            </div>

            <div className="space-y-2">
              <Label>Host Staff Member *</Label>
              <StaffSearchSelect
                staff={staffList.filter((s: any) => s.isActive !== false)}
                value={preBookHost}
                onChange={setPreBookHost}
                placeholder="Search by name or department…"
              />
            </div>

            <div className="space-y-2">
              <Label>Notes (optional)</Label>
              <Textarea
                value={preBookNotes}
                onChange={(e) => setPreBookNotes(e.target.value)}
                placeholder="Any additional notes..."
                rows={2}
              />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setPreBookingWorker(null)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (!preBookingWorker) return;
                const preBookHostStaff = staffList.find((s: any) => s.id === preBookHost);
                preBookWorkerMutation.mutate({
                  worker: preBookingWorker,
                  date: preBookDate,
                  time: preBookTime,
                  purpose: preBookPurpose,
                  duration: preBookDuration,
                  notes: preBookNotes,
                  companyName: preBookCompanyName,
                  hostStaffId: preBookHost || undefined,
                  hostName: preBookHostStaff ? `${preBookHostStaff.firstName} ${preBookHostStaff.lastName}` : undefined,
                });
              }}
              disabled={preBookWorkerMutation.isPending || !preBookHost}
              className="bg-indigo-600 hover:bg-indigo-700 text-white"
            >
              {preBookWorkerMutation.isPending ? "Booking..." : "Confirm Pre-Booking"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Worker Profile Popup */}
      <Dialog open={!!viewingWorker} onOpenChange={(open) => { if (!open) setViewingWorker(null); }}>
        <DialogContent className="w-[95vw] sm:max-w-sm p-0 overflow-hidden rounded-2xl" aria-describedby={undefined}>
          <DialogTitle className="sr-only">Worker Profile</DialogTitle>
          {viewingWorker && (() => {
            const ww = viewingWorker;
            const photoSrc = ww.photoUrl
              ? (ww.photoUrl.startsWith('/objects/') ? ww.photoUrl : `/objects${ww.photoUrl}`)
              : null;
            const isCheckedIn = ww.isCheckedIn;
            const isBanned = ww.currentCardStatus === 'red' && ww.redCardBanUntil && new Date(ww.redCardBanUntil) > new Date();
            const isClear = !isBanned && ww.isActive !== false && (!ww.currentCardStatus || ww.currentCardStatus === 'clear' || ww.currentCardStatus === 'yellow');
            const notCleared = isBanned || ww.rightToWork !== 'valid' || !ww.inductionCompleted;
            const blockReason = isBanned ? 'Active site ban (Red Card)' : ww.rightToWork !== 'valid' ? 'Right to work not verified' : !ww.inductionCompleted ? 'Site induction not completed' : '';
            return (
              <>
                {/* Slim top bar */}
                <div className="bg-gradient-to-r from-orange-500 to-amber-500 px-4 py-2 pr-10">
                  <p className="text-white/80 text-[10px] font-medium uppercase tracking-widest">Contractor Worker · {ww.companyName}</p>
                </div>

                {/* Photo + details */}
                <div className="flex flex-col items-center px-6 pt-5 pb-6">
                  {/* Hidden file input */}
                  <input
                    type="file"
                    accept="image/*"
                    id={workerPhotoInputId}
                    className="hidden"
                    onChange={handleWorkerPhotoUpload}
                  />

                  {/* Avatar with upload overlay */}
                  <div className="relative group">
                    <div className="w-36 h-36 rounded-full border-4 border-orange-100 shadow-xl overflow-hidden bg-gradient-to-br from-orange-500 to-amber-500 flex items-center justify-center">
                      {photoSrc ? (
                        <img src={photoSrc} alt={`${ww.firstName} ${ww.lastName}`} className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-white font-bold text-4xl">
                          {(ww.firstName?.[0] || '').toUpperCase()}{(ww.lastName?.[0] || '').toUpperCase()}
                        </span>
                      )}
                    </div>
                    <label
                      htmlFor={workerPhotoInputId}
                      className="absolute inset-0 rounded-full flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 cursor-pointer transition-opacity"
                      title="Upload photo"
                    >
                      {isUploadingWorkerPhoto ? (
                        <div className="animate-spin h-6 w-6 border-2 border-white border-t-transparent rounded-full" />
                      ) : (
                        <Camera size={24} className="text-white" />
                      )}
                    </label>
                  </div>

                  <h2 className="mt-3 text-xl font-bold text-gray-900 dark:text-white">{ww.firstName} {ww.lastName}</h2>
                  {ww.jobTitle && <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{ww.jobTitle}</p>}

                  {/* Status + compliance badges */}
                  <div className="flex items-center gap-2 mt-2 flex-wrap justify-center">
                    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${isCheckedIn ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'}`}>
                      {isCheckedIn ? '● On Site' : '● Available'}
                    </span>
                    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${ww.rightToWork === 'valid' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                      {ww.rightToWork === 'valid' ? '✓' : '!'} Work Auth
                    </span>
                    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${ww.inductionCompleted ? 'bg-blue-100 text-blue-800' : 'bg-amber-100 text-amber-800'}`}>
                      {ww.inductionCompleted ? '✓ Inducted' : '! No Induction'}
                    </span>
                    {ww.safetyRating && (
                      <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${getSafetyRatingColor(ww.safetyRating)}`}>
                        {ww.safetyRating}
                      </span>
                    )}
                    {isBanned && (
                      <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-red-200 text-red-900">
                        🚫 Site Ban
                      </span>
                    )}
                  </div>

                  {/* Details grid with icon bubbles */}
                  <div className="mt-5 w-full space-y-3 border-t pt-4">
                    {ww.email && (
                      <div className="flex items-center gap-3 text-sm">
                        <div className="w-7 h-7 rounded-full bg-orange-50 flex items-center justify-center flex-shrink-0">
                          <Mail size={13} className="text-orange-600" />
                        </div>
                        <span className="text-gray-700 dark:text-gray-200 break-all">{ww.email}</span>
                      </div>
                    )}
                    {(ww.phoneNumber || ww.mobileNumber) && (
                      <div className="flex items-center gap-3 text-sm">
                        <div className="w-7 h-7 rounded-full bg-orange-50 dark:bg-orange-900/30 flex items-center justify-center flex-shrink-0">
                          <Phone size={13} className="text-orange-600" />
                        </div>
                        <span className="text-gray-700 dark:text-gray-200">{ww.phoneNumber || ww.mobileNumber}</span>
                      </div>
                    )}
                    {ww.updatedAt && !isCheckedIn && (
                      <div className="flex items-center gap-3 text-sm">
                        <div className="w-7 h-7 rounded-full bg-orange-50 dark:bg-orange-900/30 flex items-center justify-center flex-shrink-0">
                          <History size={13} className="text-orange-600" />
                        </div>
                        <span className="text-gray-700 dark:text-gray-200">
                          Last visit: {new Date(ww.updatedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </span>
                      </div>
                    )}
                    {isCheckedIn && ww.checkedInAt && (
                      <div className="flex items-center gap-3 text-sm">
                        <div className="w-7 h-7 rounded-full bg-green-50 dark:bg-green-900/30 flex items-center justify-center flex-shrink-0">
                          <Clock size={13} className="text-green-600" />
                        </div>
                        <span className="text-gray-700 dark:text-gray-200">
                          Signed in at {new Date(ww.checkedInAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Action buttons */}
                  <div className="flex gap-2 mt-5 w-full flex-wrap">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1 text-xs"
                      onClick={() => {
                        setViewingWorker(null);
                        setSelectedWorkerForEdit(ww);
                        setSelectedWorkerCompanyName(ww.companyName);
                        setShowContractorEditModal(true);
                      }}
                    >
                      <Edit size={13} className="mr-1" /> Edit Profile
                    </Button>
                    {isClear && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1 text-xs text-indigo-600 border-indigo-300 hover:bg-indigo-50"
                        onClick={() => { setViewingWorker(null); setQrPassWorker(ww); }}
                      >
                        <QrCode size={13} className="mr-1" /> QR Pass
                      </Button>
                    )}
                    {isClear && !isCheckedIn && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1 text-xs text-indigo-600 border-indigo-300 hover:bg-indigo-50"
                        onClick={() => {
                          setViewingWorker(null);
                          setPreBookingWorker(ww);
                          setPreBookCompanyName(ww.companyName);
                        }}
                      >
                        <CalendarPlus size={13} className="mr-1" /> Pre-Book
                      </Button>
                    )}
                    {!isCheckedIn ? (
                      <Button
                        size="sm"
                        className={`flex-1 text-xs ${notCleared ? 'bg-gray-200 text-gray-400 cursor-not-allowed' : 'bg-green-600 hover:bg-green-700 text-white'}`}
                        disabled={notCleared || checkInMutation.isPending}
                        title={notCleared ? blockReason : 'Check in worker'}
                        onClick={() => {
                          if (notCleared) { toast({ title: "Cannot Check In", description: blockReason, variant: "destructive" }); return; }
                          setViewingWorker(null);
                          setWorkerForCheckIn(ww);
                          setCompanyForCheckIn(ww.companyName);
                          setShowHSModal(true);
                        }}
                      >
                        <LogIn size={13} className="mr-1" /> Check In
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        className="flex-1 text-xs bg-red-600 hover:bg-red-700 text-white"
                        disabled={checkOutMutation.isPending}
                        onClick={() => { setViewingWorker(null); checkOutMutation.mutate(ww.id); }}
                      >
                        <LogOut size={13} className="mr-1" /> Check Out
                      </Button>
                    )}
                  </div>
                </div>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* Host Selection Dialog for Contractor Check-in */}
      <Dialog open={showCheckInHostDialog} onOpenChange={(open) => { if (!open) { setShowCheckInHostDialog(false); setSelectedCheckInHost(''); setCheckInWorkerId(null); } }}>
        <DialogContent
          className="w-[95vw] sm:max-w-md"
          onFocusOutside={(e) => e.preventDefault()}
          onInteractOutside={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle>Select Host for {checkInWorkerName}</DialogTitle>
            <DialogDescription>Who is {checkInWorkerName} visiting today?</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Host Staff Member *</Label>
              <StaffSearchSelect
                staff={staffList.filter((s: any) => s.isActive !== false)}
                value={selectedCheckInHost}
                onChange={setSelectedCheckInHost}
                placeholder="Search by name or department…"
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => { setShowCheckInHostDialog(false); setSelectedCheckInHost(''); setCheckInWorkerId(null); }}>
              Cancel
            </Button>
            <Button
              disabled={!selectedCheckInHost || checkInMutation.isPending}
              onClick={() => {
                if (!checkInWorkerId) return;
                const host = staffList.find((s: any) => s.id === selectedCheckInHost);
                checkInMutation.mutate({
                  workerId: checkInWorkerId,
                  hostStaffId: selectedCheckInHost,
                  hostName: host ? `${host.firstName} ${host.lastName}` : undefined,
                });
                setShowCheckInHostDialog(false);
                setSelectedCheckInHost('');
                setCheckInWorkerId(null);
              }}
              className="bg-green-600 hover:bg-green-700 text-white"
            >
              {checkInMutation.isPending ? "Checking In..." : "Check In & Print Pass"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Contractor Worker QR Pass Dialog */}
      <Dialog open={!!qrPassWorker} onOpenChange={(open) => { if (!open) { setQrPassWorker(null); setQrPassData(null); } }}>
        <DialogContent className="w-[95vw] sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <QrCode className="w-5 h-5 text-indigo-600" />
              Contractor QR Check-In Pass
            </DialogTitle>
            <DialogDescription>
              Send a QR code pass to {qrPassWorker?.firstName} {qrPassWorker?.lastName} for quick kiosk check-in and check-out.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="p-3 bg-indigo-50 rounded-lg border border-indigo-200">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full flex items-center justify-center">
                  <span className="text-white font-bold text-sm">
                    {qrPassWorker ? `${qrPassWorker.firstName[0]}${qrPassWorker.lastName[0]}` : ''}
                  </span>
                </div>
                <div>
                  <p className="font-semibold text-gray-800">{qrPassWorker?.firstName} {qrPassWorker?.lastName}</p>
                  <p className="text-sm text-gray-600">{qrPassWorker?.companyName}</p>
                </div>
              </div>
            </div>

            {qrPassData && (
              <div className="text-center p-4 bg-white rounded-lg border">
                <img
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(qrPassData.qrCode)}`}
                  alt="Contractor QR Code"
                  className="w-40 h-40 mx-auto mb-2 rounded-lg shadow-sm"
                />
                <p className="text-xs text-gray-500 font-mono">{qrPassData.qrCode}</p>
              </div>
            )}

            <div className="grid grid-cols-1 gap-3">
              <Button
                onClick={() => qrPassWorker && sendWorkerQrPassMutation.mutate({ id: qrPassWorker.id, method: 'email' })}
                disabled={sendWorkerQrPassMutation.isPending}
                className="w-full justify-start gap-3 h-14 bg-blue-600 hover:bg-blue-700 text-white"
              >
                <Mail size={20} />
                <div className="text-left">
                  <div className="font-medium">Email QR Pass</div>
                  <div className="text-xs opacity-80">Send branded pass with QR code to {qrPassWorker?.email}</div>
                </div>
              </Button>

              <Button
                variant="outline"
                onClick={() => {
                  if (!qrPassWorker) return;
                  sendWorkerQrPassMutation.mutate({ id: qrPassWorker.id, method: 'print' }, {
                    onSuccess: (data) => {
                      handlePrintWorkerQrPass(data.qrCode, data.workerName, data.companyName || qrPassWorker.companyName);
                    }
                  });
                }}
                disabled={sendWorkerQrPassMutation.isPending}
                className="w-full justify-start gap-3 h-14"
              >
                <Printer size={20} className="text-green-600" />
                <div className="text-left">
                  <div className="font-medium">Print QR Pass</div>
                  <div className="text-xs text-gray-500">Print a card-sized pass with QR code</div>
                </div>
              </Button>

              <Button
                variant="outline"
                onClick={() => {
                  if (!qrPassWorker) return;
                  sendWorkerQrPassMutation.mutate({ id: qrPassWorker.id, method: 'download' }, {
                    onSuccess: (data) => {
                      handleDownloadWorkerQrPass(data.qrCode, data.workerName, data.companyName || qrPassWorker.companyName);
                    }
                  });
                }}
                disabled={sendWorkerQrPassMutation.isPending}
                className="w-full justify-start gap-3 h-14"
              >
                <Download size={20} className="text-purple-600" />
                <div className="text-left">
                  <div className="font-medium">Download QR Image</div>
                  <div className="text-xs text-gray-500">Download branded pass as image</div>
                </div>
              </Button>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => { setQrPassWorker(null); setQrPassData(null); }}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <QRScannerModal isOpen={showQRScanner} onClose={() => setShowQRScanner(false)} />
    </div>
  );
}