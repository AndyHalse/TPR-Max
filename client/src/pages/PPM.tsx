import { useState, useEffect, useRef, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import type { CompanySettings } from "@shared/schema";
import { queryClient, apiRequest } from "@/lib/queryClient";
import GlassCard from "@/components/GlassCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import {
  Wrench, Plus, Edit, Trash2, Copy, Building2, ClipboardList, CalendarClock,
  CheckCircle2, AlertTriangle, Clock, Package, ShieldCheck, BookOpen,
  ClipboardCheck, UserCheck, FileUp, HardHat, FileText, Filter, X,
  Download, Upload, Mail, RefreshCw, Eye, Sparkles, Phone, MapPin, Globe, User,
  Layers, ChevronDown, ChevronUp, ChevronsUpDown, ChevronRight, Bell, FileDown, BellOff, Scan, CalendarDays,
  LayoutDashboard, Info, Lock, ShieldAlert,
} from "lucide-react";
import { Link, useSearch } from "wouter";
import { useTranslation } from "react-i18next";
import PpmAnnualPlanner from "@/components/PpmAnnualPlanner";
import PpmDashboard from "@/components/PpmDashboard";
import { getCompanyClearance, getWorkerClearance } from "@/pages/contractor/types";

// ─── Types ───────────────────────────────────────────────────────────────────

interface PpmAssetGroup {
  id: string;
  name: string;
  description?: string | null;
  createdAt?: string | null;
}

interface PpmAsset {
  id: string;
  groupId?: string | null;
  name: string;
  assetRef?: string | null;
  category?: string | null;
  location?: string | null;
  manufacturer?: string | null;
  modelNumber?: string | null;
  serialNumber?: string | null;
  installDate?: string | null;
  notes?: string | null;
  status: string;
}

interface PpmTemplate {
  id: string;
  name: string;
  description?: string | null;
  category?: string | null;
  type: string;
  regulationReference?: string | null;
  frequency: string;
  customDays?: number | null;
  estimatedHours?: string | null;
  checklist?: string | null;
}

interface PpmSchedule {
  id: string;
  assetId: string;
  templateId?: string | null;
  title: string;
  frequency: string;
  customDays?: number | null;
  startDate: string;
  nextDueDate: string;
  lastCompletedDate?: string | null;
  assignedTo?: string | null;
  status: string;
  notes?: string | null;
}

interface PpmWorkOrder {
  id: string;
  scheduleId?: string | null;
  assetId?: string | null;
  groupId?: string | null;
  title: string;
  description?: string | null;
  status: string;
  contractorCompanyId?: string | null;
  contractorCompanyName?: string | null;
  contractorWorkerId?: string | null;
  contractorWorkerName?: string | null;
  assignedEmail?: string | null;
  dueDate?: string | null;
  completedDate?: string | null;
  notes?: string | null;
  completionNotes?: string | null;
  requiresCertificate?: boolean | null;
  certificateUploadedAt?: string | null;
  arrivedAt?: string | null;
  createdAt?: string | null;
  expiredDocCount?: number;
  expiringSoonDocCount?: number;
  templateType?: string | null;
  missingDocsAlertedAt?: string | null;
}

interface PpmWorkOrderDocument {
  id: string;
  workOrderId: string;
  fileName: string;
  fileUrl: string;
  fileType?: string | null;
  uploadedBy?: string | null;
  expiryDate?: string | null;
  referenceNumber?: string | null;
  issuedBy?: string | null;
  expiryAlertedAt?: string | null;
  createdAt?: string | null;
  scannedAt?: string | null;
}

interface ContractorCompany {
  id: string;
  name: string;
  email?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  contactFirstName?: string | null;
  contactLastName?: string | null;
  address?: string | null;
  postcode?: string | null;
  industry?: string | null;
  status?: string | null;
  companyNumber?: string | null;
  website?: string | null;
}

interface ContractorWorker {
  id: string;
  companyId: string;
  firstName: string;
  lastName: string;
  email?: string | null;
  phone?: string | null;
  cscsCard?: string | null;
  cscsStatus?: string | null;
  rightToWork?: string | null;
  postcode?: string | null;
  workerStatus?: string | null;
  inductionCompleted?: boolean | null;
  siteInductionCompleted?: boolean | null;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const ASSET_CATEGORIES = [
  "Electrical", "Mechanical", "Fire Safety", "HVAC", "Plumbing",
  "Lifts & Hoists", "Gas", "Water Hygiene", "Security", "Other",
];

const FREQUENCIES = [
  { value: "weekly", label: "Weekly (7 days)" },
  { value: "monthly", label: "Monthly" },
  { value: "quarterly", label: "Quarterly (3 months)" },
  { value: "annual", label: "Annual" },
  { value: "custom", label: "Custom (days)" },
];

const COMMON_REGULATIONS = [
  "BS 5839 (Fire detection & alarm systems)",
  "BS 7671 (Electrical installations – IET Wiring Regs)",
  "BS 9251 (Fire suppression systems)",
  "LOLER (Lifting Operations & Lifting Equipment Regs 1998)",
  "PSSR (Pressure Systems Safety Regs 2000)",
  "L8 / HSG274 (Legionella control)",
  "Gas Safety (Installation & Use) Regs 1998",
  "Building Regs Part B (Fire safety)",
  "COSHH (Control of Substances Hazardous to Health)",
  "Other / Custom",
];

const WO_STATUSES = [
  { value: "scheduled",   label: "Scheduled",   classes: "bg-blue-100 text-blue-800 border-blue-200" },
  { value: "in_progress", label: "In Progress", classes: "bg-amber-100 text-amber-800 border-amber-200" },
  { value: "on_site",     label: "On Site",     classes: "bg-purple-100 text-purple-800 border-purple-200" },
  { value: "completed",   label: "Completed",   classes: "bg-green-100 text-green-800 border-green-200" },
  { value: "overdue",     label: "Overdue",     classes: "bg-red-100 text-red-800 border-red-200" },
];

// ─── Schedule Status Derivation ───────────────────────────────────────────────

type DerivedStatus = "overdue" | "due_soon" | "upcoming" | "completed" | "cancelled";

function deriveStatus(s: PpmSchedule): DerivedStatus {
  if (s.status === "completed") return "completed";
  if (s.status === "cancelled") return "cancelled";
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const due = new Date(s.nextDueDate); due.setHours(0, 0, 0, 0);
  const daysAway = Math.round((due.getTime() - today.getTime()) / 86400000);
  if (daysAway < 0) return "overdue";
  if (daysAway <= 7) return "due_soon";
  return "upcoming";
}

const STATUS_CONFIG: Record<DerivedStatus, { label: string; classes: string; icon: typeof AlertTriangle }> = {
  overdue:   { label: "Overdue",   classes: "bg-red-100 text-red-800 border-red-200",    icon: AlertTriangle },
  due_soon:  { label: "Due Soon",  classes: "bg-amber-100 text-amber-800 border-amber-200", icon: Clock },
  upcoming:  { label: "Upcoming",  classes: "bg-green-100 text-green-800 border-green-200", icon: CheckCircle2 },
  completed: { label: "Completed", classes: "bg-blue-100 text-blue-800 border-blue-200",   icon: CheckCircle2 },
  cancelled: { label: "Cancelled", classes: "bg-gray-100 text-gray-600 border-gray-200",   icon: Clock },
};

function StatusBadge({ status }: { status: DerivedStatus }) {
  const cfg = STATUS_CONFIG[status];
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${cfg.classes}`}>
      <Icon className="h-3 w-3" />{cfg.label}
    </span>
  );
}

function WOStatusBadge({ status }: { status: string }) {
  const cfg = WO_STATUSES.find(s => s.value === status) ?? { label: status, classes: "bg-gray-100 text-gray-700 border-gray-200" };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${cfg.classes}`}>
      {cfg.label}
    </span>
  );
}

// If the contractor has arrived (arrivedAt set) and the work order isn't completed,
// treat it as "on_site" regardless of what the DB status column says.  This covers
// records created before the on_site status was introduced (stored as in_progress).
function effectiveWOStatus(wo: { status: string; arrivedAt?: string | null }): string {
  if (wo.arrivedAt && wo.status !== "completed") return "on_site";
  return wo.status;
}

function AssetStatusBadge({ status }: { status: string }) {
  return status === "active"
    ? <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 border border-green-200">Active</span>
    : <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600 border border-gray-200">Decommissioned</span>;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtDate(d?: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function freqLabel(f: string) {
  return FREQUENCIES.find(x => x.value === f)?.label ?? f;
}

function toastError(error: unknown, toast: ReturnType<typeof useToast>["toast"]) {
  toast({ title: "Error", description: error instanceof Error ? error.message : "An unexpected error occurred", variant: "destructive" });
}

function clientCalcNextDueDate(startDate: string, frequency: string, customDays: string): string {
  if (!startDate || !frequency) return "";
  const d = new Date(startDate);
  switch (frequency) {
    case "weekly":    d.setDate(d.getDate() + 7); break;
    case "monthly":   d.setMonth(d.getMonth() + 1); break;
    case "quarterly": d.setMonth(d.getMonth() + 3); break;
    case "annual":    d.setFullYear(d.getFullYear() + 1); break;
    case "custom":    d.setDate(d.getDate() + (parseInt(customDays) || 30)); break;
    default: break;
  }
  return d.toISOString().split("T")[0];
}

// Convert file to base64 for upload
async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ─── Dashboard Summary Strip ──────────────────────────────────────────────────

function DashboardSummary({ onWorkOrdersClick }: { onWorkOrdersClick: (filter?: string) => void }) {
  const { t } = useTranslation("ppm");
  const { data: schedules = [] } = useQuery<PpmSchedule[]>({ queryKey: ["/api/ppm/schedules"] });
  const { data: workOrders = [] } = useQuery<PpmWorkOrder[]>({ queryKey: ["/api/ppm/work-orders"] });

  const today = new Date(); today.setHours(0, 0, 0, 0);
  const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);

  const activeSchedules = schedules.filter(s => s.status !== "cancelled" && s.status !== "completed").length;
  const dueThisMonth = schedules.filter(s => {
    if (s.status === "cancelled" || s.status === "completed") return false;
    const due = new Date(s.nextDueDate);
    return due >= today && due <= endOfMonth;
  }).length;
  const overdueWOs = workOrders.filter(w => w.status === "overdue").length;
  const awaitingCerts = workOrders.filter(w =>
    w.status === "completed" && w.requiresCertificate && !w.certificateUploadedAt
  ).length;

  const stats = [
    { label: t("dashboard.activeSchedules"), value: activeSchedules, color: "text-foreground", onClick: undefined },
    { label: t("dashboard.dueThisMonth"), value: dueThisMonth, color: dueThisMonth > 0 ? "text-amber-600" : "text-foreground", onClick: undefined },
    { label: t("dashboard.overdueWorkOrders"), value: overdueWOs, color: overdueWOs > 0 ? "text-red-600" : "text-foreground", onClick: () => onWorkOrdersClick("overdue") },
    { label: t("dashboard.awaitingCertificates"), value: awaitingCerts, color: awaitingCerts > 0 ? "text-amber-600" : "text-foreground", onClick: () => onWorkOrdersClick("awaiting-cert") },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {stats.map(s => (
        <GlassCard
          key={s.label}
          className={`p-4 text-center ${s.onClick ? "cursor-pointer hover:shadow-md transition-shadow" : ""}`}
          onClick={s.onClick}
        >
          <p className={`text-3xl font-bold ${s.color}`}>{s.value}</p>
          <p className="text-xs text-muted-foreground mt-1">{s.label}</p>
        </GlassCard>
      ))}
    </div>
  );
}

// ─── Assets Tab ──────────────────────────────────────────────────────────────

function AssetsTab() {
  const { toast } = useToast();
  const { t } = useTranslation("ppm");

  // ── Asset form state ────────────────────────────────────────────────────────
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<PpmAsset | null>(null);
  const emptyForm = () => ({
    name: "", assetRef: "", category: "", location: "", manufacturer: "",
    modelNumber: "", serialNumber: "", installDate: "", notes: "", status: "active", groupId: "",
  });
  const [form, setForm] = useState(emptyForm());

  // ── Group management state ──────────────────────────────────────────────────
  const [groupDialogOpen, setGroupDialogOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState<PpmAssetGroup | null>(null);
  const [groupForm, setGroupForm] = useState({ name: "", description: "" });
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  // ── Data ────────────────────────────────────────────────────────────────────
  const { data: assets = [], isLoading } = useQuery<PpmAsset[]>({ queryKey: ["/api/ppm/assets"] });
  const { data: groups = [] } = useQuery<PpmAssetGroup[]>({ queryKey: ["/api/ppm/asset-groups"] });

  // Expand all groups by default when they first load
  useEffect(() => {
    if (groups.length > 0) setExpandedGroups(new Set(groups.map(g => g.id)));
  }, [groups.length]);

  // ── Asset mutations ─────────────────────────────────────────────────────────
  const inv = () => { queryClient.invalidateQueries({ queryKey: ["/api/ppm/assets"] }); };
  const createMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => apiRequest("POST", "/api/ppm/assets", data),
    onSuccess: () => { inv(); setOpen(false); toast({ title: t("assets.toast.assetCreated") }); },
    onError: (error: unknown) => toastError(error, toast),
  });
  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) => apiRequest("PUT", `/api/ppm/assets/${id}`, data),
    onSuccess: () => { inv(); setOpen(false); toast({ title: t("assets.toast.assetUpdated") }); },
    onError: (error: unknown) => toastError(error, toast),
  });
  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/ppm/assets/${id}`),
    onSuccess: () => { inv(); toast({ title: t("assets.toast.assetDeleted") }); },
    onError: (error: unknown) => toastError(error, toast),
  });
  const duplicateMutation = useMutation({
    mutationFn: (id: string) => apiRequest("POST", `/api/ppm/assets/${id}/duplicate`),
    onSuccess: () => { inv(); toast({ title: t("assets.toast.assetCreated") }); },
    onError: (error: unknown) => toastError(error, toast),
  });

  // ── Group mutations ─────────────────────────────────────────────────────────
  const invG = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/ppm/asset-groups"] });
    queryClient.invalidateQueries({ queryKey: ["/api/ppm/assets"] });
  };
  const createGroupMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => apiRequest("POST", "/api/ppm/asset-groups", data),
    onSuccess: () => { invG(); setGroupForm({ name: "", description: "" }); toast({ title: t("assets.toast.groupCreated") }); },
    onError: (error: unknown) => toastError(error, toast),
  });
  const updateGroupMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) => apiRequest("PUT", `/api/ppm/asset-groups/${id}`, data),
    onSuccess: () => { invG(); setEditingGroup(null); setGroupForm({ name: "", description: "" }); toast({ title: t("assets.toast.groupUpdated") }); },
    onError: (error: unknown) => toastError(error, toast),
  });
  const deleteGroupMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/ppm/asset-groups/${id}`),
    onSuccess: () => { invG(); toast({ title: t("assets.toast.groupDeleted") }); },
    onError: (error: unknown) => toastError(error, toast),
  });

  // ── Helpers ─────────────────────────────────────────────────────────────────
  function openNew() { setEditing(null); setForm(emptyForm()); setOpen(true); }
  function openEdit(a: PpmAsset) {
    setEditing(a);
    setForm({ name: a.name, assetRef: a.assetRef ?? "", category: a.category ?? "", location: a.location ?? "",
      manufacturer: a.manufacturer ?? "", modelNumber: a.modelNumber ?? "", serialNumber: a.serialNumber ?? "",
      installDate: a.installDate ?? "", notes: a.notes ?? "", status: a.status, groupId: a.groupId ?? "" });
    setOpen(true);
  }
  function handleSubmit() {
    const payload = { ...form, groupId: form.groupId || null };
    if (editing) updateMutation.mutate({ id: editing.id, data: payload });
    else createMutation.mutate(payload);
  }
  function toggleGroup(id: string) {
    setExpandedGroups(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }
  const isBusy = createMutation.isPending || updateMutation.isPending;

  // ── Grouped / ungrouped partitions ─────────────────────────────────────────
  const grouped = groups.map(g => ({ group: g, assets: assets.filter(a => a.groupId === g.id) }));
  const ungrouped = assets.filter(a => !a.groupId);

  // ── Asset card (reused in all sections) ─────────────────────────────────────
  function AssetCard({ a }: { a: PpmAsset }) {
    return (
      <GlassCard className="p-4 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-semibold text-sm truncate">{a.name}</p>
            {a.assetRef && <p className="text-xs text-muted-foreground">{t("dashboard.refLabel")}: {a.assetRef}</p>}
          </div>
          <AssetStatusBadge status={a.status} />
        </div>
        {a.category && <p className="text-xs"><span className="text-muted-foreground">{t("dashboard.categoryLabel")}:</span> {a.category}</p>}
        {a.location && <p className="text-xs"><span className="text-muted-foreground">{t("dashboard.locationLabel")}:</span> {a.location}</p>}
        {a.manufacturer && <p className="text-xs"><span className="text-muted-foreground">{t("dashboard.manufacturerLabel")}:</span> {a.manufacturer}</p>}
        {a.serialNumber && <p className="text-xs"><span className="text-muted-foreground">{t("dashboard.serialLabel")}:</span> {a.serialNumber}</p>}
        <div className="flex gap-2 pt-1">
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => openEdit(a)}><Edit className="h-3 w-3 mr-1" />{t("dashboard.editBtn")}</Button>
          <Button size="sm" variant="outline" className="h-7 text-xs" disabled={duplicateMutation.isPending} onClick={() => duplicateMutation.mutate(a.id)}>
            <Copy className="h-3 w-3 mr-1" />{t("dashboard.duplicateBtn")}
          </Button>
          <Button size="sm" variant="ghost" className="h-7 text-xs text-destructive hover:text-destructive" onClick={() => { if (confirm(t("dashboard.deleteAssetConfirm"))) deleteMutation.mutate(a.id); }}>
            <Trash2 className="h-3 w-3 mr-1" />{t("dashboard.deleteBtn")}
          </Button>
        </div>
      </GlassCard>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{t("assets.descriptionText")}</p>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => { setEditingGroup(null); setGroupForm({ name: "", description: "" }); setGroupDialogOpen(true); }}>
            <Layers className="h-4 w-4 mr-1" />{t("assets.manageGroups")}
          </Button>
          <Button onClick={openNew} size="sm"><Plus className="h-4 w-4 mr-1" />{t("assets.addAsset")}</Button>
        </div>
      </div>

      {isLoading ? (
        <div className="text-center py-10 text-muted-foreground">{t("assets.loadingAssets")}</div>
      ) : assets.length === 0 ? (
        <div className="text-center py-16">
          <Package className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="text-muted-foreground">{t("assets.noAssets")}</p>
        </div>
      ) : groups.length === 0 ? (
        // No groups defined — flat list (backward compatible)
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {assets.map(a => <AssetCard key={a.id} a={a} />)}
        </div>
      ) : (
        <div className="space-y-5">
          {/* Each Asset Group as a collapsible section */}
          {grouped.map(({ group, assets: ga }) => (
            <div key={group.id} className="border rounded-lg overflow-hidden">
              <button
                onClick={() => toggleGroup(group.id)}
                className="w-full flex items-center gap-2 px-4 py-3 bg-muted/40 hover:bg-muted/60 transition-colors text-left"
              >
                {expandedGroups.has(group.id)
                  ? <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                  : <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />}
                <Layers className="h-4 w-4 text-blue-600 shrink-0" />
                <span className="font-semibold text-sm flex-1">{group.name}</span>
                <Badge variant="secondary" className="text-xs">{ga.length !== 1 ? t("dashboard.assetCountPlural", { count: ga.length }) : t("dashboard.assetCountSingular", { count: ga.length })}</Badge>
              </button>
              {expandedGroups.has(group.id) && (
                <div className="p-3">
                  {ga.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-3 text-center">{t("dashboard.noAssignedYet")}</p>
                  ) : (
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      {ga.map(a => <AssetCard key={a.id} a={a} />)}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}

          {/* Ungrouped assets at the bottom */}
          {ungrouped.length > 0 && (
            <div className="border rounded-lg overflow-hidden border-dashed">
              <div className="flex items-center gap-2 px-4 py-3 bg-muted/20">
                <Package className="h-4 w-4 text-muted-foreground shrink-0" />
                <span className="font-medium text-sm text-muted-foreground flex-1">{t("assets.ungrouped")}</span>
                <Badge variant="outline" className="text-xs">{ungrouped.length !== 1 ? t("dashboard.assetCountPlural", { count: ungrouped.length }) : t("dashboard.assetCountSingular", { count: ungrouped.length })}</Badge>
              </div>
              <div className="p-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {ungrouped.map(a => <AssetCard key={a.id} a={a} />)}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Asset Form Dialog ─────────────────────────────────────────────── */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing ? t("assets.editAsset") : t("assets.newAsset")}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <Label>{t("assets.assetName")}</Label>
                <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. AHU-01 Air Handling Unit" />
              </div>
              <div>
                <Label>{t("assets.assetRefTag")}</Label>
                <Input value={form.assetRef} onChange={e => setForm(f => ({ ...f, assetRef: e.target.value }))} placeholder="e.g. TAG-001" />
              </div>
              <div>
                <Label>{t("assets.category")}</Label>
                <Select value={form.category || "_none"} onValueChange={v => setForm(f => ({ ...f, category: v === "_none" ? "" : v }))}>
                  <SelectTrigger><SelectValue placeholder={t("assets.selectCategory")} /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">{t("assets.noneOption")}</SelectItem>
                    {ASSET_CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2">
                <Label>{t("assets.assetGroup")}</Label>
                <Select value={form.groupId || "_none"} onValueChange={v => setForm(f => ({ ...f, groupId: v === "_none" ? "" : v }))}>
                  <SelectTrigger><SelectValue placeholder={t("assets.ungroupedOption")} /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">{t("assets.ungroupedOption")}</SelectItem>
                    {groups.map(g => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2">
                <Label>{t("assets.location")}</Label>
                <Input value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))} placeholder="e.g. Roof Level / Plant Room 1" />
              </div>
              <div>
                <Label>{t("assets.manufacturer")}</Label>
                <Input value={form.manufacturer} onChange={e => setForm(f => ({ ...f, manufacturer: e.target.value }))} />
              </div>
              <div>
                <Label>{t("assets.modelNumber")}</Label>
                <Input value={form.modelNumber} onChange={e => setForm(f => ({ ...f, modelNumber: e.target.value }))} />
              </div>
              <div>
                <Label>{t("assets.serialNumber")}</Label>
                <Input value={form.serialNumber} onChange={e => setForm(f => ({ ...f, serialNumber: e.target.value }))} />
              </div>
              <div>
                <Label>{t("assets.installDate")}</Label>
                <Input type="date" value={form.installDate} onChange={e => setForm(f => ({ ...f, installDate: e.target.value }))} />
              </div>
              <div>
                <Label>{t("assets.statusLabel")}</Label>
                <Select value={form.status} onValueChange={v => setForm(f => ({ ...f, status: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">{t("assets.active")}</SelectItem>
                    <SelectItem value="decommissioned">{t("assets.decommissioned")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2">
                <Label>{t("assets.notes")}</Label>
                <Textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>{t("dashboard.cancelBtn")}</Button>
            <Button onClick={handleSubmit} disabled={!form.name || isBusy}>{isBusy ? t("assets.saving") : editing ? t("assets.update") : t("assets.create")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Group Management Dialog ───────────────────────────────────────── */}
      <Dialog open={groupDialogOpen} onOpenChange={o => { setGroupDialogOpen(o); if (!o) { setEditingGroup(null); setGroupForm({ name: "", description: "" }); } }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Layers className="h-4 w-4" />{t("assets.assetGroups")}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            {/* Existing groups list */}
            {groups.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">{t("assets.noGroupsYet")}</p>
            ) : (
              <div className="space-y-2">
                {groups.map(g => (
                  <div key={g.id} className="flex items-center gap-2 p-3 border rounded-md bg-muted/20">
                    {editingGroup?.id === g.id ? (
                      <div className="flex-1 space-y-2">
                        <Input value={groupForm.name} onChange={e => setGroupForm(f => ({ ...f, name: e.target.value }))} placeholder="Group name" />
                        <Input value={groupForm.description} onChange={e => setGroupForm(f => ({ ...f, description: e.target.value }))} placeholder="Description (optional)" />
                        <div className="flex gap-2">
                          <Button size="sm" disabled={!groupForm.name || updateGroupMutation.isPending} onClick={() => updateGroupMutation.mutate({ id: g.id, data: groupForm })}>{t("dashboard.saveBtn")}</Button>
                          <Button size="sm" variant="outline" onClick={() => { setEditingGroup(null); setGroupForm({ name: "", description: "" }); }}>{t("dashboard.cancelBtnLabel")}</Button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm truncate">{g.name}</p>
                          {g.description && <p className="text-xs text-muted-foreground truncate">{g.description}</p>}
                          <p className="text-xs text-muted-foreground">{assets.filter(a => a.groupId === g.id).length} asset{assets.filter(a => a.groupId === g.id).length !== 1 ? "s" : ""}</p>
                        </div>
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => { setEditingGroup(g); setGroupForm({ name: g.name, description: g.description ?? "" }); }}>
                          <Edit className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive hover:text-destructive" onClick={() => { if (confirm(t("assets.deleteGroupConfirm", { name: g.name }))) deleteGroupMutation.mutate(g.id); }}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Create new group form */}
            {!editingGroup && (
              <div className="border-t pt-4 space-y-2">
                <p className="text-sm font-medium">{t("assets.createNewGroup")}</p>
                <Input value={groupForm.name} onChange={e => setGroupForm(f => ({ ...f, name: e.target.value }))} placeholder={t("assets.groupName")} />
                <Input value={groupForm.description} onChange={e => setGroupForm(f => ({ ...f, description: e.target.value }))} placeholder={t("assets.groupDescription")} />
                <Button size="sm" disabled={!groupForm.name || createGroupMutation.isPending} onClick={() => createGroupMutation.mutate(groupForm)}>
                  <Plus className="h-3.5 w-3.5 mr-1" />{createGroupMutation.isPending ? t("assets.creating") : t("assets.createGroup")}
                </Button>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setGroupDialogOpen(false)}>{t("dashboard.closeBtn")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Templates Tab ───────────────────────────────────────────────────────────

function TemplatesTab() {
  const { toast } = useToast();
  const { t } = useTranslation("ppm");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<PpmTemplate | null>(null);
  const emptyForm = () => ({
    name: "", description: "", category: "", type: "non-statutory",
    regulationReference: "", frequency: "monthly", customDays: "",
    estimatedHours: "", checklist: "",
  });
  const [form, setForm] = useState(emptyForm());

  const { data: templates = [], isLoading } = useQuery<PpmTemplate[]>({ queryKey: ["/api/ppm/templates"] });

  const createMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => apiRequest("POST", "/api/ppm/templates", data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/ppm/templates"] }); setOpen(false); toast({ title: t("templates.toast.templateCreated") }); },
    onError: (error: unknown) => toastError(error, toast),
  });
  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) => apiRequest("PUT", `/api/ppm/templates/${id}`, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/ppm/templates"] }); setOpen(false); toast({ title: t("templates.toast.templateUpdated") }); },
    onError: (error: unknown) => toastError(error, toast),
  });
  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/ppm/templates/${id}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/ppm/templates"] }); toast({ title: t("templates.toast.templateDeleted") }); },
    onError: (error: unknown) => toastError(error, toast),
  });

  function openNew() { setEditing(null); setForm(emptyForm()); setOpen(true); }
  function openEdit(tmpl: PpmTemplate) {
    setEditing(tmpl);
    setForm({ name: tmpl.name, description: tmpl.description ?? "", category: tmpl.category ?? "",
      type: tmpl.type || "non-statutory", regulationReference: tmpl.regulationReference ?? "",
      frequency: tmpl.frequency, customDays: tmpl.customDays?.toString() ?? "",
      estimatedHours: tmpl.estimatedHours ?? "", checklist: tmpl.checklist ?? "" });
    setOpen(true);
  }
  function handleSubmit() {
    const payload = { ...form, customDays: form.customDays ? parseInt(form.customDays) : null };
    if (editing) updateMutation.mutate({ id: editing.id, data: payload });
    else createMutation.mutate(payload);
  }
  const isBusy = createMutation.isPending || updateMutation.isPending;
  const checkItems = (tmpl: PpmTemplate) => { try { return JSON.parse(tmpl.checklist ?? "[]"); } catch { return []; } };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{t("templates.descriptionText")}</p>
        <Button onClick={openNew} size="sm"><Plus className="h-4 w-4 mr-1" />{t("templates.addTemplate")}</Button>
      </div>

      {isLoading ? (
        <div className="text-center py-10 text-muted-foreground">{t("templates.loadingTemplates")}</div>
      ) : templates.length === 0 ? (
        <div className="text-center py-16">
          <ClipboardList className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="text-muted-foreground">{t("templates.noTemplates")}</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {templates.map(tmpl => {
            const items = checkItems(tmpl);
            const isStatutory = tmpl.type === "statutory";
            return (
              <GlassCard key={tmpl.id} className="p-4 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-semibold text-sm truncate">{tmpl.name}</p>
                  <Badge variant="secondary" className="text-xs shrink-0">{freqLabel(tmpl.frequency)}</Badge>
                </div>
                <div className="flex items-center gap-1.5">
                  {isStatutory ? (
                    <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-purple-100 text-purple-800 border border-purple-200 font-medium">
                      <ShieldCheck className="h-3 w-3" />{t("templates.statutory")}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
                      {t("templates.nonStatutory")}
                    </span>
                  )}
                </div>
                {tmpl.regulationReference && (
                  <p className="text-xs flex items-start gap-1"><BookOpen className="h-3 w-3 mt-0.5 text-muted-foreground shrink-0" /><span className="text-muted-foreground">{tmpl.regulationReference}</span></p>
                )}
                {tmpl.description && <p className="text-xs text-muted-foreground line-clamp-2">{tmpl.description}</p>}
                {tmpl.category && <p className="text-xs"><span className="text-muted-foreground">{t("templates.category")}:</span> {tmpl.category}</p>}
                {tmpl.estimatedHours && <p className="text-xs"><span className="text-muted-foreground">{t("templates.estTime")}</span> {tmpl.estimatedHours}h</p>}
                {items.length > 0 && <p className="text-xs text-muted-foreground">{items.length} {items.length !== 1 ? t("templates.checklistCountPlural") : t("templates.checklistCount")}</p>}
                <div className="flex gap-2 pt-1">
                  <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => openEdit(tmpl)}><Edit className="h-3 w-3 mr-1" />{t("dashboard.editBtn")}</Button>
                  <Button size="sm" variant="ghost" className="h-7 text-xs text-destructive hover:text-destructive" onClick={() => { if (confirm(t("dashboard.deleteTemplateConfirm"))) deleteMutation.mutate(tmpl.id); }}>
                    <Trash2 className="h-3 w-3 mr-1" />{t("dashboard.deleteBtn")}
                  </Button>
                </div>
              </GlassCard>
            );
          })}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing ? t("templates.editTemplate") : t("templates.newTemplate")}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>{t("templates.templateName")}</Label>
              <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Monthly HVAC Filter Check" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>{t("templates.type")}</Label>
                <Select value={form.type} onValueChange={v => setForm(f => ({ ...f, type: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="statutory">{t("templates.statutoryLegal")}</SelectItem>
                    <SelectItem value="non-statutory">{t("templates.nonStatutoryBest")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>{t("templates.category")}</Label>
                <Select value={form.category || "_none"} onValueChange={v => setForm(f => ({ ...f, category: v === "_none" ? "" : v }))}>
                  <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">{t("assets.noneOption")}</SelectItem>
                    {ASSET_CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {form.type === "statutory" && (
              <div>
                <Label>{t("templates.regulationReference")}</Label>
                <Select value={form.regulationReference || "_custom"} onValueChange={v => setForm(f => ({ ...f, regulationReference: v === "_custom" ? "" : v }))}>
                  <SelectTrigger><SelectValue placeholder={t("templates.selectOrType")} /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_custom">{t("templates.typeCustom")}</SelectItem>
                    {COMMON_REGULATIONS.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Input className="mt-1.5" value={form.regulationReference} onChange={e => setForm(f => ({ ...f, regulationReference: e.target.value }))} placeholder="e.g. BS 5839" />
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>{t("templates.frequency")}</Label>
                <Select value={form.frequency} onValueChange={v => setForm(f => ({ ...f, frequency: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {FREQUENCIES.map(f => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              {form.frequency === "custom" && (
                <div>
                  <Label>{t("templates.customInterval")}</Label>
                  <Input type="number" min="1" value={form.customDays} onChange={e => setForm(f => ({ ...f, customDays: e.target.value }))} placeholder="e.g. 45" />
                </div>
              )}
              <div>
                <Label>{t("templates.estimatedHours")}</Label>
                <Input value={form.estimatedHours} onChange={e => setForm(f => ({ ...f, estimatedHours: e.target.value }))} placeholder="e.g. 2.5" />
              </div>
            </div>
            <div>
              <Label>{t("templates.description")}</Label>
              <Textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={2} placeholder={t("templates.descriptionPlaceholder")} />
            </div>
            <div>
              <Label>{t("templates.checklistItems")}</Label>
              <Textarea
                value={(() => { try { const arr = JSON.parse(form.checklist || "[]"); return arr.join("\n"); } catch { return form.checklist; } })()}
                onChange={e => { const lines = e.target.value.split("\n").map(l => l.trim()).filter(Boolean); setForm(f => ({ ...f, checklist: JSON.stringify(lines) })); }}
                rows={4}
                placeholder={"Check filters\nInspect belts\nRecord readings"}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>{t("dashboard.cancelBtn")}</Button>
            <Button onClick={handleSubmit} disabled={!form.name || isBusy}>{isBusy ? t("assets.saving") : editing ? t("assets.update") : t("assets.create")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Schedules Tab ───────────────────────────────────────────────────────────

function SchedulesTab() {
  const { toast } = useToast();
  const { t } = useTranslation("ppm");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<PpmSchedule | null>(null);
  const emptyForm = () => ({
    assetId: "", templateId: "", title: "", frequency: "monthly",
    customDays: "", startDate: new Date().toISOString().split("T")[0],
    nextDueDate: "", lastCompletedDate: "", assignedTo: "", status: "scheduled", notes: "",
  });
  const [form, setForm] = useState(emptyForm());

  const { data: schedules = [], isLoading } = useQuery<PpmSchedule[]>({ queryKey: ["/api/ppm/schedules"] });
  const { data: assets = [] } = useQuery<PpmAsset[]>({ queryKey: ["/api/ppm/assets"] });
  const { data: templates = [] } = useQuery<PpmTemplate[]>({ queryKey: ["/api/ppm/templates"] });

  const createMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => apiRequest("POST", "/api/ppm/schedules", data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/ppm/schedules"] }); setOpen(false); toast({ title: t("schedules.toast.scheduleCreated") }); },
    onError: (error: unknown) => toastError(error, toast),
  });
  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) => apiRequest("PUT", `/api/ppm/schedules/${id}`, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/ppm/schedules"] }); setOpen(false); toast({ title: t("schedules.toast.scheduleUpdated") }); },
    onError: (error: unknown) => toastError(error, toast),
  });
  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/ppm/schedules/${id}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/ppm/schedules"] }); toast({ title: t("schedules.toast.scheduleDeleted") }); },
    onError: (error: unknown) => toastError(error, toast),
  });

  useEffect(() => {
    if (!editing && form.startDate && form.frequency) {
      const calculated = clientCalcNextDueDate(form.startDate, form.frequency, form.customDays);
      setForm(f => ({ ...f, nextDueDate: calculated }));
    }
  }, [form.startDate, form.frequency, form.customDays, editing]);

  function openNew() { setEditing(null); setForm(emptyForm()); setOpen(true); }
  function openEdit(s: PpmSchedule) {
    setEditing(s);
    setForm({ assetId: s.assetId, templateId: s.templateId ?? "", title: s.title,
      frequency: s.frequency, customDays: s.customDays?.toString() ?? "",
      startDate: s.startDate, nextDueDate: s.nextDueDate,
      lastCompletedDate: s.lastCompletedDate ?? "", assignedTo: s.assignedTo ?? "",
      status: s.status, notes: s.notes ?? "" });
    setOpen(true);
  }
  function applyTemplate(templateId: string) {
    const tmpl = templates.find(tmpl => tmpl.id === templateId);
    if (!tmpl) return;
    setForm(f => ({ ...f, templateId, title: tmpl.name, frequency: tmpl.frequency, customDays: tmpl.customDays?.toString() ?? "" }));
  }
  function handleSubmit() {
    const payload: Record<string, unknown> = {
      ...form,
      templateId: form.templateId || null,
      customDays: form.customDays ? parseInt(form.customDays) : null,
      lastCompletedDate: form.lastCompletedDate || null,
      nextDueDate: form.nextDueDate || undefined,
    };
    if (editing) updateMutation.mutate({ id: editing.id, data: payload });
    else createMutation.mutate(payload);
  }
  const isBusy = createMutation.isPending || updateMutation.isPending;
  const assetName = (id: string) => assets.find(a => a.id === id)?.name ?? id;

  const enriched = schedules.map(s => ({ ...s, derived: deriveStatus(s) }));
  const overdue = enriched.filter(s => s.derived === "overdue").length;
  const dueSoon = enriched.filter(s => s.derived === "due_soon").length;
  const upcoming = enriched.filter(s => s.derived === "upcoming").length;
  const order: Record<DerivedStatus, number> = { overdue: 0, due_soon: 1, upcoming: 2, completed: 3, cancelled: 4 };
  const sorted = [...enriched].sort((a, b) => order[a.derived] - order[b.derived]);

  return (
    <div className="space-y-4">
      {schedules.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          <GlassCard className="p-3 text-center">
            <p className={`text-2xl font-bold ${overdue > 0 ? "text-red-600" : ""}`}>{overdue}</p>
            <p className="text-xs text-muted-foreground flex items-center justify-center gap-1"><AlertTriangle className="h-3 w-3" />{t("schedules.stats.overdue")}</p>
          </GlassCard>
          <GlassCard className="p-3 text-center">
            <p className={`text-2xl font-bold ${dueSoon > 0 ? "text-amber-600" : ""}`}>{dueSoon}</p>
            <p className="text-xs text-muted-foreground flex items-center justify-center gap-1"><Clock className="h-3 w-3" />{t("schedules.stats.dueWithin7")}</p>
          </GlassCard>
          <GlassCard className="p-3 text-center">
            <p className="text-2xl font-bold text-green-600">{upcoming}</p>
            <p className="text-xs text-muted-foreground flex items-center justify-center gap-1"><CheckCircle2 className="h-3 w-3" />{t("schedules.stats.upcoming")}</p>
          </GlassCard>
        </div>
      )}

      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{t("schedules.descriptionText")}</p>
        <Button onClick={openNew} size="sm" disabled={assets.length === 0}><Plus className="h-4 w-4 mr-1" />{t("schedules.addSchedule")}</Button>
      </div>

      {assets.length === 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          {t("dashboard.addAtLeastOneAsset")}
        </div>
      )}

      {isLoading ? (
        <div className="text-center py-10 text-muted-foreground">{t("schedules.loadingSchedules")}</div>
      ) : schedules.length === 0 ? (
        <div className="text-center py-16">
          <CalendarClock className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="text-muted-foreground">{t("schedules.noSchedules")}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {sorted.map(s => (
            <GlassCard key={s.id} className={`p-4 border-l-4 ${s.derived === "overdue" ? "border-l-red-500" : s.derived === "due_soon" ? "border-l-amber-500" : s.derived === "upcoming" ? "border-l-green-500" : "border-l-gray-300"}`}>
              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-sm">{s.title}</p>
                    <StatusBadge status={s.derived} />
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">{t("dashboard.assetLabel")}: <span className="text-foreground">{assetName(s.assetId)}</span></p>
                  <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-1 text-xs text-muted-foreground">
                    <span>{t("dashboard.nextDueLabel")}: <span className="text-foreground font-medium">{fmtDate(s.nextDueDate)}</span></span>
                    {s.lastCompletedDate && <span>{t("dashboard.lastDoneLabel")}: {fmtDate(s.lastCompletedDate)}</span>}
                    {s.assignedTo && <span>{t("dashboard.assignedLabel")}: {s.assignedTo}</span>}
                    <span>{t("dashboard.frequencyLabel")}: {freqLabel(s.frequency)}</span>
                  </div>
                  {s.notes && <p className="text-xs text-muted-foreground mt-1 italic">{s.notes}</p>}
                </div>
                <div className="flex gap-1 shrink-0">
                  <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => openEdit(s)}><Edit className="h-3 w-3" /></Button>
                  <Button size="sm" variant="ghost" className="h-7 text-xs text-destructive hover:text-destructive" onClick={() => { if (confirm(t("dashboard.deleteScheduleConfirm"))) deleteMutation.mutate(s.id); }}>
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            </GlassCard>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing ? t("schedules.editSchedule") : t("schedules.newSchedule")}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>{t("schedules.asset")}</Label>
              <Select value={form.assetId} onValueChange={v => setForm(f => ({ ...f, assetId: v }))}>
                <SelectTrigger><SelectValue placeholder={t("schedules.selectAsset")} /></SelectTrigger>
                <SelectContent>
                  {assets.map(a => <SelectItem key={a.id} value={a.id}>{a.name}{a.assetRef ? ` (${a.assetRef})` : ""}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{t("schedules.applyTemplate")}</Label>
              <Select value={form.templateId || "_none"} onValueChange={v => { if (v !== "_none") applyTemplate(v); else setForm(f => ({ ...f, templateId: "" })); }}>
                <SelectTrigger><SelectValue placeholder={t("schedules.selectTemplatePrefill")} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">{t("assets.noneOption")}</SelectItem>
                  {templates.map(tmpl => <SelectItem key={tmpl.id} value={tmpl.id}>{tmpl.name} ({tmpl.type === "statutory" ? t("templates.statutory") : t("templates.nonStatutory")})</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{t("schedules.scheduleTitle")}</Label>
              <Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. Monthly AC Filter Change" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>{t("schedules.frequency")}</Label>
                <Select value={form.frequency} onValueChange={v => setForm(f => ({ ...f, frequency: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {FREQUENCIES.map(f => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              {form.frequency === "custom" && (
                <div>
                  <Label>{t("schedules.intervalDays")}</Label>
                  <Input type="number" min="1" value={form.customDays} onChange={e => setForm(f => ({ ...f, customDays: e.target.value }))} />
                </div>
              )}
              <div>
                <Label>{t("schedules.startDate")}</Label>
                <Input type="date" value={form.startDate} onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))} />
              </div>
              <div>
                <Label>{t("schedules.nextDueDate")} {!editing && <span className="text-xs text-muted-foreground">({t("schedules.autoCalculated")})</span>}</Label>
                <Input type="date" value={form.nextDueDate} onChange={e => setForm(f => ({ ...f, nextDueDate: e.target.value }))} />
                {!editing && form.nextDueDate && <p className="text-xs text-muted-foreground mt-1">{t("schedules.calculatedNote")}</p>}
              </div>
              <div>
                <Label>{t("schedules.lastCompleted")}</Label>
                <Input type="date" value={form.lastCompletedDate} onChange={e => setForm(f => ({ ...f, lastCompletedDate: e.target.value }))} />
              </div>
              <div>
                <Label>{t("schedules.assignedTo")}</Label>
                <Input value={form.assignedTo} onChange={e => setForm(f => ({ ...f, assignedTo: e.target.value }))} placeholder={t("schedules.assignedPlaceholder")} />
              </div>
            </div>
            {editing && (
              <div>
                <Label>{t("assets.statusLabel")}</Label>
                <Select value={form.status} onValueChange={v => setForm(f => ({ ...f, status: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="scheduled">{t("schedules.statusScheduled")}</SelectItem>
                    <SelectItem value="completed">{t("schedules.statusCompleted")}</SelectItem>
                    <SelectItem value="cancelled">{t("schedules.statusCancelled")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
            <div>
              <Label>{t("assets.notes")}</Label>
              <Textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>{t("dashboard.cancelBtn")}</Button>
            <Button onClick={handleSubmit} disabled={!form.assetId || !form.title || !form.startDate || isBusy}>
              {isBusy ? t("assets.saving") : editing ? t("assets.update") : t("assets.create")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Work Orders Tab ──────────────────────────────────────────────────────────

function WorkOrdersTab({ initialStatusFilter, initialWorkOrderId }: { initialStatusFilter?: string; initialWorkOrderId?: string }) {
  const { toast } = useToast();
  const { t } = useTranslation("ppm");
  const { data: currentUser } = useQuery<{ id: string; username: string; role: string }>({ queryKey: ["/api/auth/me"] });
  const isAdmin = currentUser?.role === "admin";

  // Filters
  const [filterStatus, setFilterStatus] = useState(initialStatusFilter || "all");
  const [filterAsset, setFilterAsset] = useState("all");
  const [filterContractor, setFilterContractor] = useState("");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");
  const [filterExpiringDocs, setFilterExpiringDocs] = useState(() => {
    try { return localStorage.getItem('ppm_filterExpiringDocs') === 'true'; } catch { return false; }
  });

  // Export All dialog
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [exportStatus, setExportStatus] = useState("all");
  const [exportDateFrom, setExportDateFrom] = useState("");
  const [exportDateTo, setExportDateTo] = useState("");

  function handleExportAll() {
    const params = new URLSearchParams();
    if (exportStatus !== "all") params.set("status", exportStatus);
    if (exportDateFrom) params.set("dateFrom", exportDateFrom);
    if (exportDateTo) params.set("dateTo", exportDateTo);
    const url = `/api/ppm/work-orders/export-all${params.toString() ? `?${params}` : ""}`;
    window.open(url, "_blank");
    setShowExportDialog(false);
  }

  // Dialogs/sheets
  const [showCreate, setShowCreate] = useState(false);
  const [selectedWO, setSelectedWO] = useState<PpmWorkOrder | null>(null);
  const [contractorLink, setContractorLink] = useState<string | null>(null);
  const [showDetail, setShowDetail] = useState(false);
  const [showEditWO, setShowEditWO] = useState(false);
  const [contractorDetailTarget, setContractorDetailTarget] = useState<{ type: 'company' | 'worker'; workOrder: PpmWorkOrder } | null>(null);

  // Work order table sort
  const [woSortKey, setWoSortKey] = useState<"title" | "asset" | "status" | "due" | "contractor" | "worker" | null>(null);
  const [woSortDir, setWoSortDir] = useState<"asc" | "desc">("asc");
  const toggleWOSort = (key: "title" | "asset" | "status" | "due" | "contractor" | "worker") => {
    if (woSortKey === key) setWoSortDir(d => d === "asc" ? "desc" : "asc");
    else { setWoSortKey(key); setWoSortDir("asc"); }
  };

  // Create form
  const emptyWOForm = () => ({
    title: "", description: "", assetId: "", groupId: "", scheduleId: "", dueDate: "", notes: "",
    requiresCertificate: false, status: "scheduled", scope: "single-asset" as "single-asset" | "group",
    contractorCompanyId: "" as string | null, contractorCompanyName: "" as string | null,
    contractorWorkerId: "" as string | null, contractorWorkerName: "" as string | null,
  });
  const [woForm, setWoForm] = useState(emptyWOForm());

  // Edit form
  const [editingWO, setEditingWO] = useState<PpmWorkOrder | null>(null);
  const [editWOForm, setEditWOForm] = useState(emptyWOForm());
  const openEditWO = (wo: PpmWorkOrder) => {
    setEditingWO(wo);
    setEditWOForm({
      title: wo.title,
      description: wo.description || "",
      assetId: wo.assetId || "",
      groupId: wo.groupId || "",
      scheduleId: wo.scheduleId || "",
      dueDate: wo.dueDate || "",
      notes: wo.notes || "",
      requiresCertificate: wo.requiresCertificate ?? false,
      status: wo.status,
      scope: wo.groupId ? "group" : "single-asset",
      contractorCompanyId: wo.contractorCompanyId || "",
      contractorCompanyName: wo.contractorCompanyName || "",
      contractorWorkerId: wo.contractorWorkerId || "",
      contractorWorkerName: wo.contractorWorkerName || "",
    });
    setShowEditWO(true);
  };

  // Assign contractor form (in detail sheet)
  const [assignForm, setAssignForm] = useState({
    contractorCompanyId: "", contractorCompanyName: "", contractorWorkerId: "",
    contractorWorkerName: "", assignedEmail: "",
  });
  const [selectedCompanyIdForWorkers, setSelectedCompanyIdForWorkers] = useState("");

  // Document upload
  const [uploadingDoc, setUploadingDoc] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [docFileType, setDocFileType] = useState("other");
  const [pendingDocFile, setPendingDocFile] = useState<File | null>(null);
  const [isScanningDoc, setIsScanningDoc] = useState(false);
  const [docAiExtracted, setDocAiExtracted] = useState(false);
  const [docExpiryDate, setDocExpiryDate] = useState("");
  const [docReferenceNumber, setDocReferenceNumber] = useState("");
  const [docIssuedBy, setDocIssuedBy] = useState("");

  useEffect(() => {
    setPendingDocFile(null);
    setDocAiExtracted(false);
    setDocExpiryDate("");
    setDocReferenceNumber("");
    setDocIssuedBy("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, [selectedWO?.id]);

  // Data queries
  const { data: workOrders = [], isLoading: woLoading } = useQuery<PpmWorkOrder[]>({ queryKey: ["/api/ppm/work-orders"] });
  const { data: assets = [] } = useQuery<PpmAsset[]>({ queryKey: ["/api/ppm/assets"] });
  const { data: groups = [] } = useQuery<PpmAssetGroup[]>({ queryKey: ["/api/ppm/asset-groups"] });
  const { data: schedules = [] } = useQuery<PpmSchedule[]>({ queryKey: ["/api/ppm/schedules"] });
  const { data: contractors = [] } = useQuery<ContractorCompany[]>({ queryKey: ["/api/contractors"] });
  const { data: companySettings } = useQuery<CompanySettings>({ queryKey: ["/api/settings"] });
  const notifyOnDocumentExpiry = companySettings?.notifyOnDocumentExpiry !== false;
  const { data: companyWorkers = [] } = useQuery<ContractorWorker[]>({
    queryKey: ["/api/contractors", selectedCompanyIdForWorkers, "workers"],
    enabled: !!selectedCompanyIdForWorkers,
    queryFn: async () => {
      const res = await fetch(`/api/contractors/${selectedCompanyIdForWorkers}/workers`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
  });
  const newWOCompanyId = woForm.contractorCompanyId || "";
  const { data: newWOWorkers = [] } = useQuery<ContractorWorker[]>({
    queryKey: ["/api/contractors", newWOCompanyId, "workers"],
    enabled: !!newWOCompanyId,
    queryFn: async () => {
      const res = await fetch(`/api/contractors/${newWOCompanyId}/workers`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
  });
  const editWOCompanyId = editWOForm.contractorCompanyId || "";
  const { data: editWOWorkers = [] } = useQuery<ContractorWorker[]>({
    queryKey: ["/api/contractors", editWOCompanyId, "workers"],
    enabled: !!editWOCompanyId,
    queryFn: async () => {
      const res = await fetch(`/api/contractors/${editWOCompanyId}/workers`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
  });
  const { data: woDocs = [], refetch: refetchDocs } = useQuery<PpmWorkOrderDocument[]>({
    queryKey: ["/api/ppm/work-orders", selectedWO?.id, "documents"],
    enabled: !!selectedWO?.id,
    queryFn: async () => {
      if (!selectedWO?.id) return [];
      const res = await fetch(`/api/ppm/work-orders/${selectedWO.id}/documents`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
  });

  const detailWorkerId = contractorDetailTarget?.type === 'worker' ? contractorDetailTarget.workOrder.contractorWorkerId : null;
  const { data: detailWorker, isLoading: isDetailWorkerLoading } = useQuery<ContractorWorker>({
    queryKey: ["/api/contractors/workers", detailWorkerId],
    enabled: !!detailWorkerId,
    queryFn: async () => {
      const res = await fetch(`/api/contractors/workers/${detailWorkerId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Worker not found");
      return res.json();
    },
  });
  const detailCompany = contractorDetailTarget?.type === 'company'
    ? contractors.find(c => c.id === contractorDetailTarget.workOrder.contractorCompanyId) ?? null
    : null;

  const createWOMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => apiRequest("POST", "/api/ppm/work-orders", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ppm/work-orders"] });
      setShowCreate(false);
      setWoForm(emptyWOForm());
      toast({ title: t("workOrders.toast.workOrderCreated") });
    },
    onError: (error: unknown) => toastError(error, toast),
  });

  const updateWOMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Record<string, unknown> }) => {
      const res = await apiRequest("PUT", `/api/ppm/work-orders/${id}`, data);
      return res.json() as Promise<PpmWorkOrder>;
    },
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ["/api/ppm/work-orders"] });
      if (selectedWO && updated?.id === selectedWO.id) setSelectedWO(updated);
      setShowEditWO(false);
      setEditingWO(null);
      toast({ title: t("workOrders.toast.workOrderUpdated") });
    },
    onError: (error: unknown) => toastError(error, toast),
  });

  const deleteWOMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/ppm/work-orders/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ppm/work-orders"] });
      setShowDetail(false);
      setSelectedWO(null);
      toast({ title: t("workOrders.toast.workOrderDeleted") });
    },
    onError: (error: unknown) => toastError(error, toast),
  });

  const duplicateWOMutation = useMutation({
    mutationFn: (id: string) => apiRequest("POST", `/api/ppm/work-orders/${id}/duplicate`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ppm/work-orders"] });
      toast({ title: t("workOrders.toast.workOrderDuplicated"), description: t("workOrders.toast.workOrderDuplicatedDesc") });
    },
    onError: (error: unknown) => toastError(error, toast),
  });

  const assignMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Record<string, unknown> }) => {
      const res = await apiRequest("POST", `/api/ppm/work-orders/${id}/assign`, data);
      return res.json() as Promise<PpmWorkOrder & { notificationSent: boolean }>;
    },
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ["/api/ppm/work-orders"] });
      setSelectedWO(updated);
      if (updated.notificationSent) {
        toast({ title: t("workOrders.toast.contractorAssigned"), description: t("workOrders.toast.contractorAssignedEmail") });
      } else if (updated.assignedEmail) {
        toast({ title: t("workOrders.toast.contractorAssigned"), description: t("workOrders.toast.contractorAssignedEmailFailed"), variant: "destructive" });
      } else {
        toast({ title: t("workOrders.toast.contractorAssigned"), description: t("workOrders.toast.contractorAssignedNoEmail") });
      }
    },
    onError: (error: unknown) => toastError(error, toast),
  });

  const deleteDocMutation = useMutation({
    mutationFn: ({ woId, docId }: { woId: string; docId: string }) => apiRequest("DELETE", `/api/ppm/work-orders/${woId}/documents/${docId}`),
    onSuccess: () => { refetchDocs(); toast({ title: t("workOrders.toast.documentRemoved") }); },
    onError: (error: unknown) => toastError(error, toast),
  });

  const resendAlertMutation = useMutation({
    mutationFn: ({ woId, docId }: { woId: string; docId: string }) => apiRequest("POST", `/api/ppm/work-orders/${woId}/documents/${docId}/resend-alert`),
    onSuccess: () => { refetchDocs(); toast({ title: t("workOrders.toast.expirySent"), description: t("workOrders.toast.expiryDesc") }); },
    onError: (error: unknown) => toastError(error, toast),
  });

  const bulkResendAlertMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/ppm/documents/bulk-resend-alert").then(r => r.json()),
    onSuccess: (data: { count: number; message?: string }) => {
      if (data.count === 0) {
        toast({ title: t("workOrders.toast.noDocumentsToAlert"), description: t("workOrders.toast.noDocumentsToAlertDesc") });
      } else {
        toast({ title: t("workOrders.toast.bulkAlertsSent"), description: `Alert email sent covering ${data.count} document${data.count !== 1 ? "s" : ""}.` });
      }
    },
    onError: (error: unknown) => toastError(error, toast),
  });

  const bulkResendAlertsMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/ppm/documents/bulk-resend-alerts`),
    onSuccess: (data: { documentsAlerted: number; contractorEmailsSent: number }) => {
      toast({
        title: t("workOrders.toast.bulkAlertsMaySent"),
        description: `${data.documentsAlerted} document alert${data.documentsAlerted !== 1 ? "s" : ""} sent to admin${data.contractorEmailsSent > 0 ? `, ${data.contractorEmailsSent} contractor notification${data.contractorEmailsSent !== 1 ? "s" : ""} sent` : ""}.`,
      });
    },
    onError: (error: unknown) => toastError(error, toast),
  });

  // Derive unique contractor companies from loaded work orders for structured dropdown
  const contractorOptions = useMemo(() => {
    const seen = new Set<string>();
    const opts: { value: string; label: string }[] = [];
    workOrders.forEach(w => {
      const key = w.contractorCompanyId ?? w.contractorCompanyName ?? "";
      if (key && !seen.has(key)) {
        seen.add(key);
        opts.push({ value: w.contractorCompanyName ?? key, label: w.contractorCompanyName ?? key });
      }
    });
    return opts.sort((a, b) => a.label.localeCompare(b.label));
  }, [workOrders]);

  // Apply filters
  const filtered = workOrders.filter(w => {
    if (initialWorkOrderId && w.id !== initialWorkOrderId) return false;
    if (filterStatus === "awaiting-cert") {
      if (!(w.status === "completed" && w.requiresCertificate && !w.certificateUploadedAt)) return false;
    } else if (filterStatus !== "all" && effectiveWOStatus(w) !== filterStatus) return false;
    if (filterAsset !== "all" && w.assetId !== filterAsset) return false;
    if (filterContractor && filterContractor !== "all" && w.contractorCompanyName !== filterContractor) return false;
    if (filterDateFrom && w.dueDate && w.dueDate < filterDateFrom) return false;
    if (filterDateTo && w.dueDate && w.dueDate > filterDateTo) return false;
    if (filterExpiringDocs && !((w.expiredDocCount ?? 0) > 0 || (w.expiringSoonDocCount ?? 0) > 0)) return false;
    return true;
  });

  const statusOrder: Record<string, number> = { overdue: 0, on_site: 1, in_progress: 2, scheduled: 3, completed: 4 };
  const sortedWOs = useMemo(() => {
    const arr = [...filtered];
    const dir = woSortDir === "asc" ? 1 : -1;
    if (!woSortKey) {
      return arr.sort((a, b) => (statusOrder[effectiveWOStatus(a)] ?? 5) - (statusOrder[effectiveWOStatus(b)] ?? 5));
    }
    return arr.sort((a, b) => {
      if (woSortKey === "status") {
        return dir * ((statusOrder[effectiveWOStatus(a)] ?? 5) - (statusOrder[effectiveWOStatus(b)] ?? 5));
      }
      if (woSortKey === "due") {
        const av = a.dueDate ?? "", bv = b.dueDate ?? "";
        if (!av && !bv) return 0;
        if (!av) return dir;
        if (!bv) return -dir;
        return dir * av.localeCompare(bv);
      }
      let av = "", bv = "";
      if (woSortKey === "title") { av = a.title ?? ""; bv = b.title ?? ""; }
      else if (woSortKey === "asset") {
        av = a.groupId ? (groups.find(g => g.id === a.groupId)?.name ?? "") : (assets.find(x => x.id === a.assetId)?.name ?? "");
        bv = b.groupId ? (groups.find(g => g.id === b.groupId)?.name ?? "") : (assets.find(x => x.id === b.assetId)?.name ?? "");
      } else if (woSortKey === "contractor") { av = a.contractorCompanyName ?? ""; bv = b.contractorCompanyName ?? ""; }
      else if (woSortKey === "worker") { av = a.contractorWorkerName ?? ""; bv = b.contractorWorkerName ?? ""; }
      return dir * av.localeCompare(bv, undefined, { sensitivity: "base" });
    });
  }, [filtered, woSortKey, woSortDir, assets, groups]);

  async function openDetail(wo: PpmWorkOrder) {
    setSelectedWO(wo);
    setContractorLink(null);
    setAssignForm({
      contractorCompanyId: wo.contractorCompanyId ?? "",
      contractorCompanyName: wo.contractorCompanyName ?? "",
      contractorWorkerId: wo.contractorWorkerId ?? "",
      contractorWorkerName: wo.contractorWorkerName ?? "",
      assignedEmail: wo.assignedEmail ?? "",
    });
    setSelectedCompanyIdForWorkers(wo.contractorCompanyId ?? "");
    setShowDetail(true);
    // Fetch contractor link separately so the token is never part of the list payload
    try {
      const res = await fetch(`/api/ppm/work-orders/${wo.id}/token`, { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setContractorLink(data.contractorUrl ?? null);
      }
    } catch { /* non-critical — link simply won't be shown */ }
  }

  function handleDocFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPendingDocFile(file);
    setDocAiExtracted(false);
    setDocExpiryDate("");
    setDocReferenceNumber("");
    setDocIssuedBy("");
  }

  async function scanPpmDocument() {
    if (!pendingDocFile) return;
    setIsScanningDoc(true);
    setDocAiExtracted(false);
    try {
      const fileData = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result as string;
          const base64 = result.split(',')[1];
          resolve(base64);
        };
        reader.onerror = reject;
        reader.readAsDataURL(pendingDocFile);
      });
      const response = await apiRequest('POST', '/api/contractors/documents/scan', {
        fileData,
        mimeType: pendingDocFile.type || 'application/octet-stream',
        documentType: docFileType || 'other',
      });
      const data = await response.json();
      const fields = data.fields as { expiryDate: string | null; issuedBy: string | null; policyNumber: string | null };
      if (!docExpiryDate && fields.expiryDate) setDocExpiryDate(fields.expiryDate);
      if (!docIssuedBy && fields.issuedBy) setDocIssuedBy(fields.issuedBy);
      if (!docReferenceNumber && fields.policyNumber) setDocReferenceNumber(fields.policyNumber);
      setDocAiExtracted(true);
      toast({ title: t("workOrders.toast.scanComplete"), description: t("workOrders.toast.scanCompleteDesc") });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unable to scan document';
      toast({ title: t("workOrders.toast.scanFailed"), description: msg, variant: 'destructive' });
    } finally {
      setIsScanningDoc(false);
    }
  }

  async function handleDocUpload() {
    if (!pendingDocFile || !selectedWO) return;
    setUploadingDoc(true);
    try {
      const b64 = await fileToBase64(pendingDocFile);
      const uploadRes = await apiRequest("POST", "/api/objects/upload", { data: b64, mimeType: pendingDocFile.type });
      const { objectPath } = await uploadRes.json();
      await apiRequest("POST", `/api/ppm/work-orders/${selectedWO.id}/documents`, {
        fileName: pendingDocFile.name, fileUrl: objectPath, fileType: docFileType, uploadedBy: "admin",
        expiryDate: docExpiryDate || null,
        referenceNumber: docReferenceNumber || null,
        issuedBy: docIssuedBy || null,
      });
      refetchDocs();
      if (docFileType === "certificate") {
        queryClient.invalidateQueries({ queryKey: ["/api/ppm/work-orders"] });
      }
      toast({ title: t("workOrders.toast.documentUploaded") });
      setPendingDocFile(null);
      setDocAiExtracted(false);
      setDocExpiryDate("");
      setDocReferenceNumber("");
      setDocIssuedBy("");
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (err) {
      toastError(err, toast);
    } finally {
      setUploadingDoc(false);
    }
  }

  const assetName = (id?: string | null) => assets.find(a => a.id === id)?.name ?? "—";
  const groupName = (id?: string | null) => groups.find(g => g.id === id)?.name ?? "—";
  const woScope = (wo: PpmWorkOrder) => wo.groupId ? `Group: ${groupName(wo.groupId)}` : assetName(wo.assetId);
  const hasCertAlert = (w: PpmWorkOrder) => w.status === "completed" && w.requiresCertificate && !w.certificateUploadedAt;
  const hasMissingDocsAlert = (w: PpmWorkOrder, docCount: number) => w.status === "overdue" && docCount === 0;

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">{t("workOrders.descriptionText")}</p>
        <div className="flex items-center gap-2">
          {isAdmin && (
            <Button size="sm" variant="outline" onClick={() => setShowExportDialog(true)}>
              <FileDown className="h-4 w-4 mr-1" />{t("workOrders.exportAll")}
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            onClick={() => { if (confirm(t("workOrders.confirmBulkAlert"))) bulkResendAlertMutation.mutate(); }}
            disabled={bulkResendAlertMutation.isPending}
            title={t("workOrders.sendAllExpiryAlerts")}
          >
            {bulkResendAlertMutation.isPending ? <RefreshCw className="h-4 w-4 mr-1 animate-spin" /> : <Bell className="h-4 w-4 mr-1" />}
            {t("workOrders.sendAllExpiryAlerts")}
          </Button>
          <Button size="sm" onClick={() => { setWoForm(emptyWOForm()); setShowCreate(true); }}>
            <Plus className="h-4 w-4 mr-1" />{t("workOrders.newWorkOrder")}
          </Button>
        </div>
      </div>

      {/* Filters */}
      <GlassCard className="p-3">
        <div className="flex flex-wrap gap-2 items-end">
          <div className="flex items-center gap-1 text-xs text-muted-foreground font-medium">
            <Filter className="h-3 w-3" />{t("workOrders.filters")}
          </div>
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="h-8 w-36 text-xs"><SelectValue placeholder={t("workOrders.allStatuses")} /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("workOrders.allStatuses")}</SelectItem>
              {WO_STATUSES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
              <SelectItem value="awaiting-cert">{t("workOrders.awaitingCertificate")}</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filterAsset} onValueChange={setFilterAsset}>
            <SelectTrigger className="h-8 w-40 text-xs"><SelectValue placeholder={t("workOrders.allAssets")} /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("workOrders.allAssets")}</SelectItem>
              {assets.map(a => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filterContractor || "all"} onValueChange={v => setFilterContractor(v === "all" ? "" : v)}>
            <SelectTrigger className="h-8 w-44 text-xs">
              <SelectValue placeholder={t("workOrders.allContractors")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("workOrders.allContractors")}</SelectItem>
              {contractorOptions.map(opt => (
                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex items-center gap-1">
            <Input type="date" className="h-8 w-36 text-xs" value={filterDateFrom} onChange={e => setFilterDateFrom(e.target.value)} />
            <span className="text-xs text-muted-foreground">{t("workOrders.to")}</span>
            <Input type="date" className="h-8 w-36 text-xs" value={filterDateTo} onChange={e => setFilterDateTo(e.target.value)} />
          </div>
          <Button
            size="sm"
            variant={filterExpiringDocs ? "secondary" : "outline"}
            className={`h-8 text-xs gap-1 ${filterExpiringDocs ? "border-amber-400 bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-600" : ""}`}
            onClick={() => setFilterExpiringDocs(v => { const next = !v; try { localStorage.setItem('ppm_filterExpiringDocs', String(next)); } catch {} return next; })}
          >
            <AlertTriangle className="h-3 w-3" />{t("workOrders.expiringDocs")}
          </Button>
          {isAdmin && (
            <Button
              size="sm"
              variant="outline"
              className="h-8 text-xs gap-1"
              disabled={bulkResendAlertsMutation.isPending || !notifyOnDocumentExpiry}
              title={notifyOnDocumentExpiry ? t("workOrders.sendAllExpiryAlerts") : t("workOrders.expiryNotificationsDisabledShort")}
              onClick={() => bulkResendAlertsMutation.mutate()}
            >
              {bulkResendAlertsMutation.isPending ? <RefreshCw className="h-3 w-3 animate-spin" /> : <Bell className="h-3 w-3" />}
              {t("workOrders.resendAllAlerts")}
            </Button>
          )}
          {(filterStatus !== "all" || filterAsset !== "all" || filterContractor || filterDateFrom || filterDateTo || filterExpiringDocs) && (
            <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => { setFilterStatus("all"); setFilterAsset("all"); setFilterContractor(""); setFilterDateFrom(""); setFilterDateTo(""); setFilterExpiringDocs(false); try { localStorage.setItem('ppm_filterExpiringDocs', 'false'); } catch {} }}>
              <X className="h-3 w-3 mr-1" />{t("workOrders.clearFilters")}
            </Button>
          )}
        </div>
      </GlassCard>

      {/* Table */}
      {woLoading ? (
        <div className="text-center py-10 text-muted-foreground">{t("workOrders.loadingWorkOrders")}</div>
      ) : sortedWOs.length === 0 ? (
        <div className="text-center py-16">
          <ClipboardCheck className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="text-muted-foreground">{workOrders.length === 0 ? t("workOrders.noWorkOrders") : t("workOrders.noWorkOrdersFilter")}</p>
        </div>
      ) : (
        <div className="rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs text-muted-foreground">
              <tr>
                {(["title","asset","status","due","contractor","worker"] as const).map((col) => {
                  const labels: Record<string, string> = {
                    title: t("workOrders.colTitle"),
                    asset: t("workOrders.colAsset"),
                    status: t("workOrders.colStatus"),
                    due: t("workOrders.colDue"),
                    contractor: t("workOrders.colContractor"),
                    worker: t("workOrders.colWorker"),
                  };
                  const hidden = col === "asset" ? "hidden md:table-cell" : col === "due" ? "hidden sm:table-cell" : col === "contractor" ? "hidden lg:table-cell" : col === "worker" ? "hidden xl:table-cell" : "";
                  const Icon = woSortKey === col ? (woSortDir === "asc" ? ChevronUp : ChevronDown) : ChevronsUpDown;
                  return (
                    <th key={col} className={`text-left px-3 py-2 font-medium cursor-pointer select-none group ${hidden}`} onClick={() => toggleWOSort(col)}>
                      <span className="inline-flex items-center gap-0.5 hover:text-foreground transition-colors">
                        {labels[col]}
                        <Icon className={`h-3 w-3 ${woSortKey === col ? "text-foreground" : "opacity-40 group-hover:opacity-70"}`} />
                      </span>
                    </th>
                  );
                })}
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {sortedWOs.map(wo => (
                <tr key={wo.id} className={`hover:bg-muted/30 cursor-pointer ${wo.status === "overdue" ? "bg-red-50/50 dark:bg-red-950/20" : ""}`} onClick={() => openDetail(wo)}>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-1.5">
                      <div className="font-medium truncate max-w-[200px]">{wo.title}</div>
                      {(wo.expiredDocCount ?? 0) > 0 && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="inline-flex items-center justify-center h-5 w-5 rounded-full bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400 cursor-default" aria-label="Expired documents">
                              <AlertTriangle className="h-3 w-3" />
                            </span>
                          </TooltipTrigger>
                          <TooltipContent side="top">
                            {wo.expiredDocCount} document{(wo.expiredDocCount ?? 0) === 1 ? "" : "s"} expired
                            {(wo.expiringSoonDocCount ?? 0) > 0 ? `, ${wo.expiringSoonDocCount} expiring soon` : ""}
                          </TooltipContent>
                        </Tooltip>
                      )}
                      {(wo.expiredDocCount ?? 0) === 0 && (wo.expiringSoonDocCount ?? 0) > 0 && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="inline-flex items-center justify-center h-5 w-5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400 cursor-default" aria-label="Documents expiring soon">
                              <AlertTriangle className="h-3 w-3" />
                            </span>
                          </TooltipTrigger>
                          <TooltipContent side="top">
                            {wo.expiringSoonDocCount} document{(wo.expiringSoonDocCount ?? 0) === 1 ? "" : "s"} expiring soon
                          </TooltipContent>
                        </Tooltip>
                      )}
                    </div>
                    {hasCertAlert(wo) && (
                      <span className="text-xs text-amber-600 flex items-center gap-1"><AlertTriangle className="h-3 w-3" />{t("workOrders.certificateMissing")}</span>
                    )}
                    {wo.status === "overdue" && wo.missingDocsAlertedAt && (
                      <span className="text-xs text-red-600 flex items-center gap-1"><AlertTriangle className="h-3 w-3" />{t("workOrders.noDocumentsUploaded")}</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-muted-foreground hidden md:table-cell">{woScope(wo)}</td>
                  <td className="px-3 py-2.5"><WOStatusBadge status={effectiveWOStatus(wo)} /></td>
                  <td className="px-3 py-2.5 text-muted-foreground hidden sm:table-cell">{fmtDate(wo.dueDate)}</td>
                  <td className="px-3 py-2.5 hidden lg:table-cell max-w-[150px]">
                    {wo.contractorCompanyName ? (
                      <button className="text-blue-600 dark:text-blue-400 hover:underline text-left text-sm truncate max-w-[140px] block" onClick={e => { e.stopPropagation(); setContractorDetailTarget({ type: 'company', workOrder: wo }); }}>
                        {wo.contractorCompanyName}
                      </button>
                    ) : <span className="text-muted-foreground text-sm">—</span>}
                  </td>
                  <td className="px-3 py-2.5 hidden xl:table-cell max-w-[150px]">
                    {wo.contractorWorkerName ? (
                      <button className="text-blue-600 dark:text-blue-400 hover:underline text-left text-sm truncate max-w-[140px] block" onClick={e => { e.stopPropagation(); setContractorDetailTarget({ type: 'worker', workOrder: wo }); }}>
                        {wo.contractorWorkerName}
                      </button>
                    ) : <span className="text-muted-foreground text-sm">—</span>}
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-1">
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0" title={t("workOrders.viewWorkOrder")} onClick={e => { e.stopPropagation(); openDetail(wo); }}>
                        <Eye className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground" title={t("workOrders.editWorkOrder")} onClick={e => { e.stopPropagation(); openEditWO(wo); }}>
                        <Edit className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground" title={t("workOrders.duplicateWorkOrder")} disabled={duplicateWOMutation.isPending} onClick={e => { e.stopPropagation(); duplicateWOMutation.mutate(wo.id); }}>
                        <Copy className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive hover:text-destructive" title={t("workOrders.deleteWorkOrder")} disabled={deleteWOMutation.isPending} onClick={e => { e.stopPropagation(); if (confirm(t("workOrders.confirmDeleteWO"))) deleteWOMutation.mutate(wo.id); }}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Contractor / Worker Detail Dialog */}
      <Dialog open={!!contractorDetailTarget} onOpenChange={open => { if (!open) setContractorDetailTarget(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {contractorDetailTarget?.type === 'company'
                ? <><Building2 className="h-4 w-4 text-blue-600" />{t("workOrders.contractorCompany")}</>
                : <><User className="h-4 w-4 text-indigo-600" />{t("workOrders.workerDetails")}</>
              }
            </DialogTitle>
          </DialogHeader>

          {contractorDetailTarget?.type === 'company' && (
            <div className="space-y-3 text-sm">
              <p className="font-semibold text-base">{contractorDetailTarget.workOrder.contractorCompanyName}</p>
              {detailCompany ? (
                <>
                  {(detailCompany.contactFirstName || detailCompany.contactLastName) && (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <User className="h-3.5 w-3.5 shrink-0" />
                      <span>{[detailCompany.contactFirstName, detailCompany.contactLastName].filter(Boolean).join(" ")}</span>
                    </div>
                  )}
                  {(detailCompany.contactEmail || detailCompany.email) && (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Mail className="h-3.5 w-3.5 shrink-0" />
                      <a href={`mailto:${detailCompany.contactEmail || detailCompany.email}`} className="hover:underline text-blue-600">{detailCompany.contactEmail || detailCompany.email}</a>
                    </div>
                  )}
                  {detailCompany.contactPhone && (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Phone className="h-3.5 w-3.5 shrink-0" />
                      <a href={`tel:${detailCompany.contactPhone}`} className="hover:underline">{detailCompany.contactPhone}</a>
                    </div>
                  )}
                  {(detailCompany.address || detailCompany.postcode) && (
                    <div className="flex items-start gap-2 text-muted-foreground">
                      <MapPin className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                      <span>{[detailCompany.address, detailCompany.postcode].filter(Boolean).join(", ")}</span>
                    </div>
                  )}
                  {detailCompany.website && (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Globe className="h-3.5 w-3.5 shrink-0" />
                      <a href={detailCompany.website} target="_blank" rel="noopener noreferrer" className="hover:underline text-blue-600 truncate">{detailCompany.website}</a>
                    </div>
                  )}
                  {detailCompany.industry && (
                    <div className="text-xs text-muted-foreground pt-1 border-t">{t("workOrders.industry")} {detailCompany.industry}</div>
                  )}
                  {detailCompany.status && (
                    <Badge variant={detailCompany.status === 'approved' ? 'default' : 'secondary'} className="text-xs capitalize">{detailCompany.status}</Badge>
                  )}
                </>
              ) : (
                <p className="text-muted-foreground text-xs">{t("workOrders.noCompanyDetails")}</p>
              )}
            </div>
          )}

          {contractorDetailTarget?.type === 'worker' && (
            <div className="space-y-3 text-sm">
              {isDetailWorkerLoading ? (
                <div className="text-muted-foreground animate-pulse">{t("workOrders.loadingWorkerDetails")}</div>
              ) : detailWorker ? (
                <>
                  <p className="font-semibold text-base">{detailWorker.firstName} {detailWorker.lastName}</p>
                  <p className="text-xs text-muted-foreground">{contractorDetailTarget.workOrder.contractorCompanyName}</p>
                  {detailWorker.email && (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Mail className="h-3.5 w-3.5 shrink-0" />
                      <a href={`mailto:${detailWorker.email}`} className="hover:underline text-blue-600">{detailWorker.email}</a>
                    </div>
                  )}
                  {detailWorker.phone && (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Phone className="h-3.5 w-3.5 shrink-0" />
                      <a href={`tel:${detailWorker.phone}`} className="hover:underline">{detailWorker.phone}</a>
                    </div>
                  )}
                  {detailWorker.postcode && (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <MapPin className="h-3.5 w-3.5 shrink-0" />
                      <span>{detailWorker.postcode}</span>
                    </div>
                  )}
                  <div className="border-t pt-2 space-y-1">
                    {detailWorker.cscsCard && (
                      <div className="flex justify-between text-xs">
                        <span className="text-muted-foreground">{t("workOrders.cscsCard")}</span>
                        <span className="font-medium">{detailWorker.cscsCard}</span>
                      </div>
                    )}
                    {detailWorker.cscsStatus && (
                      <div className="flex justify-between text-xs">
                        <span className="text-muted-foreground">{t("workOrders.cscsStatus")}</span>
                        <Badge variant={detailWorker.cscsStatus === 'valid' ? 'default' : 'secondary'} className="text-xs capitalize h-4">{detailWorker.cscsStatus}</Badge>
                      </div>
                    )}
                    {detailWorker.rightToWork && (
                      <div className="flex justify-between text-xs">
                        <span className="text-muted-foreground">{t("workOrders.rightToWork")}</span>
                        <Badge variant={detailWorker.rightToWork === 'verified' ? 'default' : 'secondary'} className="text-xs capitalize h-4">{detailWorker.rightToWork}</Badge>
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <p className="text-muted-foreground text-xs">{t("workOrders.workerNotFound")}</p>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Export All Dialog */}
      <Dialog open={showExportDialog} onOpenChange={setShowExportDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("workOrders.exportTitle")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">{t("workOrders.exportDesc")}</p>
            <div className="space-y-2">
              <Label className="text-xs font-medium">{t("workOrders.exportStatus")}</Label>
              <Select value={exportStatus} onValueChange={setExportStatus}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder={t("workOrders.allStatuses")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("workOrders.allStatuses")}</SelectItem>
                  {WO_STATUSES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-medium">{t("workOrders.exportDueDateRange")}</Label>
              <div className="flex items-center gap-2">
                <Input type="date" className="h-9 text-sm flex-1" value={exportDateFrom} onChange={e => setExportDateFrom(e.target.value)} />
                <span className="text-xs text-muted-foreground">{t("workOrders.to")}</span>
                <Input type="date" className="h-9 text-sm flex-1" value={exportDateTo} onChange={e => setExportDateTo(e.target.value)} />
              </div>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => setShowExportDialog(false)}>{t("dashboard.cancelBtn")}</Button>
            <Button size="sm" onClick={handleExportAll}>
              <FileDown className="h-4 w-4 mr-1" />{t("workOrders.exportPdf")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Work Order Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{t("workOrders.newWorkOrderTitle")}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>{t("workOrders.titleLabel")}</Label>
              <Input value={woForm.title} onChange={e => setWoForm(f => ({ ...f, title: e.target.value }))} placeholder={t("workOrders.titlePlaceholder")} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <Label>{t("workOrders.scope")}</Label>
                <Select value={woForm.scope} onValueChange={v => setWoForm(f => ({ ...f, scope: v as "single-asset" | "group", assetId: "", groupId: "" }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="single-asset">{t("workOrders.singleAsset")}</SelectItem>
                    <SelectItem value="group">{t("workOrders.assetGroup")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {woForm.scope === "group" ? (
                <div className="col-span-2">
                  <Label>{t("workOrders.assetGroupLabel")}</Label>
                  <Select value={woForm.groupId || "_none"} onValueChange={v => setWoForm(f => ({ ...f, groupId: v === "_none" ? "" : v }))}>
                    <SelectTrigger><SelectValue placeholder={t("workOrders.selectAssetGroup")} /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_none">{t("assets.noneOption")}</SelectItem>
                      {groups.map(g => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              ) : (
                <div>
                  <Label>{t("workOrders.assetLabel")}</Label>
                  <Select value={woForm.assetId || "_none"} onValueChange={v => setWoForm(f => ({ ...f, assetId: v === "_none" ? "" : v }))}>
                    <SelectTrigger><SelectValue placeholder={t("schedules.selectAsset")} /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_none">{t("assets.noneOption")}</SelectItem>
                      {assets.map(a => <SelectItem key={a.id} value={a.id}>{a.name}{a.assetRef ? ` (${a.assetRef})` : ""}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {woForm.scope === "single-asset" && (
                <div>
                  <Label>{t("workOrders.scheduleOptional")}</Label>
                  <Select value={woForm.scheduleId || "_none"} onValueChange={v => setWoForm(f => ({ ...f, scheduleId: v === "_none" ? "" : v }))}>
                    <SelectTrigger><SelectValue placeholder={t("workOrders.linkToSchedule")} /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_none">{t("assets.noneOption")}</SelectItem>
                      {schedules.map(s => <SelectItem key={s.id} value={s.id}>{s.title}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div>
                <Label>{t("workOrders.dueDate")}</Label>
                <Input type="date" value={woForm.dueDate} onChange={e => setWoForm(f => ({ ...f, dueDate: e.target.value }))} />
              </div>
              <div>
                <Label>{t("workOrders.statusLabel")}</Label>
                <Select value={woForm.status} onValueChange={v => setWoForm(f => ({ ...f, status: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {WO_STATUSES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>{t("workOrders.descriptionLabel")}</Label>
              <Textarea value={woForm.description} onChange={e => setWoForm(f => ({ ...f, description: e.target.value }))} rows={2} placeholder={t("workOrders.descriptionPlaceholder")} />
            </div>
            <div>
              <Label>{t("workOrders.notesLabel")}</Label>
              <Textarea value={woForm.notes} onChange={e => setWoForm(f => ({ ...f, notes: e.target.value }))} rows={2} />
            </div>
            <div>
              <Label>Contractor (optional)</Label>
              <Select
                value={woForm.contractorCompanyId || "_none"}
                onValueChange={v => {
                  const c = contractors.find(x => x.id === v);
                  setWoForm(f => ({ ...f, contractorCompanyId: v === "_none" ? null : v, contractorCompanyName: v === "_none" ? null : (c?.name ?? v), contractorWorkerId: null, contractorWorkerName: null }));
                }}
              >
                <SelectTrigger><SelectValue placeholder="— None —" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">— None —</SelectItem>
                  {contractors.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {woForm.contractorCompanyId && (
              <div>
                <Label>Worker (optional)</Label>
                <Select
                  value={woForm.contractorWorkerId || "_none"}
                  onValueChange={v => {
                    const w = newWOWorkers.find(x => x.id === v);
                    setWoForm(f => ({ ...f, contractorWorkerId: v === "_none" ? null : v, contractorWorkerName: v === "_none" ? null : `${w?.firstName ?? ""} ${w?.lastName ?? ""}`.trim() }));
                  }}
                >
                  <SelectTrigger><SelectValue placeholder="— No specific worker —" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">— No specific worker —</SelectItem>
                    {newWOWorkers.map(w => <SelectItem key={w.id} value={w.id}>{w.firstName} {w.lastName}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="flex items-center gap-2">
              <input type="checkbox" id="reqCert" checked={woForm.requiresCertificate} onChange={e => setWoForm(f => ({ ...f, requiresCertificate: e.target.checked }))} className="h-4 w-4" />
              <Label htmlFor="reqCert" className="font-normal cursor-pointer">{t("workOrders.requiresCertificate")}</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>{t("dashboard.cancelBtn")}</Button>
            <Button
              onClick={() => createWOMutation.mutate({
                ...woForm,
                assetId: woForm.scope === "single-asset" ? (woForm.assetId || null) : null,
                groupId: woForm.scope === "group" ? (woForm.groupId || null) : null,
                scheduleId: woForm.scheduleId || null,
                contractorCompanyId: woForm.contractorCompanyId || null,
                contractorCompanyName: woForm.contractorCompanyName || null,
                contractorWorkerId: woForm.contractorWorkerId || null,
                contractorWorkerName: woForm.contractorWorkerName || null,
              })}
              disabled={!woForm.title || createWOMutation.isPending}
            >
              {createWOMutation.isPending ? t("workOrders.creating") : t("workOrders.createWorkOrder")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Work Order Dialog */}
      <Dialog open={showEditWO} onOpenChange={o => { setShowEditWO(o); if (!o) setEditingWO(null); }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{t("workOrders.editWorkOrderTitle")}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>{t("workOrders.titleLabel")}</Label>
              <Input value={editWOForm.title} onChange={e => setEditWOForm(f => ({ ...f, title: e.target.value }))} placeholder={t("workOrders.titlePlaceholder")} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <Label>{t("workOrders.scope")}</Label>
                <Select value={editWOForm.scope} onValueChange={v => setEditWOForm(f => ({ ...f, scope: v as "single-asset" | "group", assetId: "", groupId: "" }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="single-asset">{t("workOrders.singleAsset")}</SelectItem>
                    <SelectItem value="group">{t("workOrders.assetGroup")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {editWOForm.scope === "group" ? (
                <div className="col-span-2">
                  <Label>{t("workOrders.assetGroupLabel")}</Label>
                  <Select value={editWOForm.groupId || "_none"} onValueChange={v => setEditWOForm(f => ({ ...f, groupId: v === "_none" ? "" : v }))}>
                    <SelectTrigger><SelectValue placeholder={t("workOrders.selectAssetGroup")} /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_none">{t("assets.noneOption")}</SelectItem>
                      {groups.map(g => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              ) : (
                <div>
                  <Label>{t("workOrders.assetLabel")}</Label>
                  <Select value={editWOForm.assetId || "_none"} onValueChange={v => setEditWOForm(f => ({ ...f, assetId: v === "_none" ? "" : v }))}>
                    <SelectTrigger><SelectValue placeholder={t("schedules.selectAsset")} /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_none">{t("assets.noneOption")}</SelectItem>
                      {assets.map(a => <SelectItem key={a.id} value={a.id}>{a.name}{a.assetRef ? ` (${a.assetRef})` : ""}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {editWOForm.scope === "single-asset" && (
                <div>
                  <Label>{t("workOrders.scheduleOptional")}</Label>
                  <Select value={editWOForm.scheduleId || "_none"} onValueChange={v => setEditWOForm(f => ({ ...f, scheduleId: v === "_none" ? "" : v }))}>
                    <SelectTrigger><SelectValue placeholder={t("workOrders.linkToSchedule")} /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_none">{t("assets.noneOption")}</SelectItem>
                      {schedules.map(s => <SelectItem key={s.id} value={s.id}>{s.title}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div>
                <Label>{t("workOrders.dueDate")}</Label>
                <Input type="date" value={editWOForm.dueDate} onChange={e => setEditWOForm(f => ({ ...f, dueDate: e.target.value }))} />
              </div>
              <div>
                <Label>{t("workOrders.statusLabel")}</Label>
                <Select value={editWOForm.status} onValueChange={v => setEditWOForm(f => ({ ...f, status: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {WO_STATUSES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>{t("workOrders.descriptionLabel")}</Label>
              <Textarea value={editWOForm.description} onChange={e => setEditWOForm(f => ({ ...f, description: e.target.value }))} rows={2} placeholder={t("workOrders.descriptionPlaceholder")} />
            </div>
            <div>
              <Label>{t("workOrders.notesLabel")}</Label>
              <Textarea value={editWOForm.notes} onChange={e => setEditWOForm(f => ({ ...f, notes: e.target.value }))} rows={2} />
            </div>
            <div>
              <Label>Contractor (optional)</Label>
              <Select
                value={editWOForm.contractorCompanyId || "_none"}
                onValueChange={v => {
                  const c = contractors.find(x => x.id === v);
                  setEditWOForm(f => ({ ...f, contractorCompanyId: v === "_none" ? null : v, contractorCompanyName: v === "_none" ? null : (c?.name ?? v), contractorWorkerId: null, contractorWorkerName: null }));
                }}
              >
                <SelectTrigger><SelectValue placeholder="— None —" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">— None —</SelectItem>
                  {contractors.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {editWOForm.contractorCompanyId && (
              <div>
                <Label>Worker (optional)</Label>
                <Select
                  value={editWOForm.contractorWorkerId || "_none"}
                  onValueChange={v => {
                    const w = editWOWorkers.find(x => x.id === v);
                    setEditWOForm(f => ({ ...f, contractorWorkerId: v === "_none" ? null : v, contractorWorkerName: v === "_none" ? null : `${w?.firstName ?? ""} ${w?.lastName ?? ""}`.trim() }));
                  }}
                >
                  <SelectTrigger><SelectValue placeholder="— No specific worker —" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">— No specific worker —</SelectItem>
                    {editWOWorkers.map(w => <SelectItem key={w.id} value={w.id}>{w.firstName} {w.lastName}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="flex items-center gap-2">
              <input type="checkbox" id="editReqCert" checked={editWOForm.requiresCertificate} onChange={e => setEditWOForm(f => ({ ...f, requiresCertificate: e.target.checked }))} className="h-4 w-4" />
              <Label htmlFor="editReqCert" className="font-normal cursor-pointer">{t("workOrders.requiresCertificate")}</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowEditWO(false); setEditingWO(null); }}>{t("dashboard.cancelBtn")}</Button>
            <Button
              disabled={!editWOForm.title || updateWOMutation.isPending}
              onClick={() => editingWO && updateWOMutation.mutate({
                id: editingWO.id,
                data: {
                  ...editWOForm,
                  assetId: editWOForm.scope === "single-asset" ? (editWOForm.assetId || null) : null,
                  groupId: editWOForm.scope === "group" ? (editWOForm.groupId || null) : null,
                  scheduleId: editWOForm.scheduleId || null,
                  contractorCompanyId: editWOForm.contractorCompanyId || null,
                  contractorCompanyName: editWOForm.contractorCompanyName || null,
                  contractorWorkerId: editWOForm.contractorWorkerId || null,
                  contractorWorkerName: editWOForm.contractorWorkerName || null,
                }
              })}
            >
              {updateWOMutation.isPending ? t("assets.saving") : t("workOrders.saveChanges")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Work Order Detail Sheet */}
      <Sheet open={showDetail} onOpenChange={setShowDetail}>
        <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
          {selectedWO && (
            <>
              <SheetHeader className="mb-4">
                <SheetTitle className="flex items-center gap-2">
                  <ClipboardCheck className="h-5 w-5" />
                  {selectedWO.title}
                </SheetTitle>
                <div className="flex items-center gap-2 flex-wrap">
                  <WOStatusBadge status={effectiveWOStatus(selectedWO)} />
                  {hasCertAlert(selectedWO) && (
                    <span className="inline-flex items-center gap-1 text-xs text-amber-600 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
                      <AlertTriangle className="h-3 w-3" />{t("workOrders.certificateMissing")}
                    </span>
                  )}
                  {hasMissingDocsAlert(selectedWO, woDocs.length) && (
                    <span className="inline-flex items-center gap-1 text-xs text-red-600 bg-red-50 border border-red-200 px-2 py-0.5 rounded-full">
                      <AlertTriangle className="h-3 w-3" />{t("workOrders.noDocumentsUploaded")}
                    </span>
                  )}
                  <a
                    href={`/api/ppm/work-orders/${selectedWO.id}/export`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-muted-foreground border border-border rounded-md px-2 py-0.5 hover:bg-muted transition-colors ml-auto"
                  >
                    <Download className="h-3 w-3" />
                    {t("workOrders.exportPdf")}
                  </a>
                </div>
              </SheetHeader>

              <div className="space-y-5">
                {/* Details */}
                <div className="space-y-2 text-sm">
                  {selectedWO.description && <p className="text-muted-foreground">{selectedWO.description}</p>}
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                    <span className="text-muted-foreground">{selectedWO.groupId ? t("workOrders.assetGroupLabel") : t("workOrders.assetLabel")}</span>
                    <span>{selectedWO.groupId ? groupName(selectedWO.groupId) : assetName(selectedWO.assetId)}</span>
                    <span className="text-muted-foreground">{t("workOrders.dueDate")}</span><span>{fmtDate(selectedWO.dueDate)}</span>
                    <span className="text-muted-foreground">{t("workOrders.arrivedOnSite")}</span>
                    <span>
                      {selectedWO.arrivedAt
                        ? new Date(selectedWO.arrivedAt).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })
                        : "—"}
                    </span>
                    <span className="text-muted-foreground">{t("workOrders.completed")}</span><span>{fmtDate(selectedWO.completedDate)}</span>
                    {selectedWO.requiresCertificate && (
                      <>
                        <span className="text-muted-foreground">{t("workOrders.certificate")}</span>
                        <span>{selectedWO.certificateUploadedAt ? `${t("workOrders.uploaded")} ${fmtDate(selectedWO.certificateUploadedAt)}` : t("workOrders.notYetUploaded")}</span>
                      </>
                    )}
                  </div>
                  {selectedWO.notes && <p className="text-xs text-muted-foreground italic border-l-2 pl-2">{selectedWO.notes}</p>}
                  {selectedWO.completionNotes && (
                    <div className="rounded bg-green-50 border border-green-200 p-2">
                      <p className="text-xs font-medium text-green-800">{t("workOrders.completionNotes")}</p>
                      <p className="text-xs text-green-700 mt-1">{selectedWO.completionNotes}</p>
                    </div>
                  )}
                </div>

                {/* Change Status */}
                <div className="space-y-2 border-t pt-4">
                  <p className="text-sm font-semibold">{t("workOrders.changeStatus")}</p>
                  <div className="flex flex-wrap gap-2">
                    {WO_STATUSES.map(s => (
                      <Button
                        key={s.value}
                        size="sm"
                        variant={effectiveWOStatus(selectedWO) === s.value ? "default" : "outline"}
                        className="h-7 text-xs"
                        disabled={effectiveWOStatus(selectedWO) === s.value || updateWOMutation.isPending}
                        onClick={() => updateWOMutation.mutate({ id: selectedWO.id, data: { status: s.value } })}
                      >
                        {s.label}
                      </Button>
                    ))}
                  </div>
                </div>

                {/* Assign Contractor */}
                <div className="space-y-2 border-t pt-4">
                  <p className="text-sm font-semibold flex items-center gap-1.5"><HardHat className="h-4 w-4" />{t("workOrders.assignContractor")}</p>
                  {(() => {
                    const selectedCompany = contractors.find(c => c.id === assignForm.contractorCompanyId);
                    const companyClearance = selectedCompany ? getCompanyClearance((selectedCompany as any).documentsStatus) : { cleared: true, reasons: [] as string[] };
                    const selectedWorker = companyWorkers.find(w => w.id === assignForm.contractorWorkerId);
                    const workerClearance = selectedWorker ? getWorkerClearance(selectedWorker) : { cleared: true, reasons: [] as string[] };
                    const blockedByCompliance = !!selectedCompany && !companyClearance.cleared;
                    const blockedByWorker = !!selectedWorker && !workerClearance.cleared;
                    const blockReason = blockedByCompliance
                      ? `Cannot assign — ${selectedCompany!.name} is not cleared: ${companyClearance.reasons.join(", ")}`
                      : blockedByWorker
                        ? `Cannot assign — ${selectedWorker!.firstName} ${selectedWorker!.lastName} is not cleared: ${workerClearance.reasons.join(", ")}`
                        : "";
                    return (
                  <div className="space-y-2">
                    <div className="rounded-md border border-blue-200 bg-blue-50 dark:bg-blue-950/20 dark:border-blue-800 px-2.5 py-1.5 text-[11px] text-blue-800 dark:text-blue-200 flex items-start gap-1.5">
                      <ShieldAlert className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                      <span>{t("workOrders.complianceNote")}</span>
                    </div>
                    <div>
                      <Label className="text-xs">{t("workOrders.companyLabel")}</Label>
                      <Select
                        value={assignForm.contractorCompanyId || "_none"}
                        onValueChange={v => {
                          const co = contractors.find(c => c.id === v);
                          setAssignForm(f => ({
                            ...f,
                            contractorCompanyId: v === "_none" ? "" : v,
                            contractorCompanyName: co?.name ?? "",
                            assignedEmail: co?.contactEmail ?? co?.email ?? f.assignedEmail,
                            contractorWorkerId: "",
                            contractorWorkerName: "",
                          }));
                          setSelectedCompanyIdForWorkers(v === "_none" ? "" : v);
                        }}
                      >
                        <SelectTrigger className="h-8 text-xs"><SelectValue placeholder={t("workOrders.selectCompany")} /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="_none">{t("assets.noneOption")}</SelectItem>
                          {contractors.map(c => {
                            const clr = getCompanyClearance((c as any).documentsStatus);
                            return (
                              <SelectItem
                                key={c.id}
                                value={c.id}
                                disabled={!clr.cleared}
                                title={clr.cleared ? undefined : `Not cleared: ${clr.reasons.join(", ")}`}
                              >
                                <span className="flex items-center gap-1.5">
                                  {!clr.cleared && <Lock className="h-3 w-3 text-red-500" />}
                                  <span className={clr.cleared ? "" : "line-through text-muted-foreground"}>{c.name}</span>
                                  {!clr.cleared && <span className="text-[10px] text-red-600">— {clr.reasons[0]}</span>}
                                </span>
                              </SelectItem>
                            );
                          })}
                        </SelectContent>
                      </Select>
                    </div>
                    {assignForm.contractorCompanyId && (
                      <div>
                        <Label className="text-xs">{t("workOrders.workerOptional")}</Label>
                        <Select
                          value={assignForm.contractorWorkerId || "_none"}
                          onValueChange={v => {
                            const w = companyWorkers.find(w => w.id === v);
                            setAssignForm(f => ({
                              ...f,
                              contractorWorkerId: v === "_none" ? "" : v,
                              contractorWorkerName: w ? `${w.firstName} ${w.lastName}` : "",
                              assignedEmail: w?.email ?? f.assignedEmail,
                            }));
                          }}
                        >
                          <SelectTrigger className="h-8 text-xs"><SelectValue placeholder={t("workOrders.selectWorker")} /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="_none">{t("workOrders.companyOnly")}</SelectItem>
                            {companyWorkers.map(w => {
                              const wc = getWorkerClearance(w);
                              return (
                                <SelectItem
                                  key={w.id}
                                  value={w.id}
                                  disabled={!wc.cleared}
                                  title={wc.cleared ? undefined : `Not cleared: ${wc.reasons.join(", ")}`}
                                >
                                  <span className="flex items-center gap-1.5">
                                    {!wc.cleared && <Lock className="h-3 w-3 text-red-500" />}
                                    <span className={wc.cleared ? "" : "line-through text-muted-foreground"}>{w.firstName} {w.lastName}</span>
                                    {!wc.cleared && <span className="text-[10px] text-red-600">— {wc.reasons[0]}</span>}
                                  </span>
                                </SelectItem>
                              );
                            })}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                    {(blockedByCompliance || blockedByWorker) && (
                      <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 dark:bg-red-950/20 dark:border-red-800 px-2.5 py-2">
                        <Lock className="h-3.5 w-3.5 text-red-600 mt-0.5 shrink-0" />
                        <div className="text-[11px] text-red-700 dark:text-red-300">
                          <p className="font-semibold">{t("workOrders.notClearedToWork")}</p>
                          <ul className="list-disc pl-4 mt-0.5">
                            {(blockedByCompliance ? companyClearance.reasons : workerClearance.reasons).map((r, i) => (
                              <li key={i}>{r}</li>
                            ))}
                          </ul>
                          <Link href={blockedByWorker ? `/contractors?company=${assignForm.contractorCompanyId}` : "/contractors"} className="underline underline-offset-2 mt-1 inline-block">
                            {t("workOrders.openContractorProfile")}
                          </Link>
                        </div>
                      </div>
                    )}
                    <div>
                      <Label className="text-xs">{t("workOrders.notificationEmail")}</Label>
                      <Input
                        className="h-8 text-xs"
                        type="email"
                        placeholder="contractor@example.com"
                        value={assignForm.assignedEmail}
                        onChange={e => setAssignForm(f => ({ ...f, assignedEmail: e.target.value }))}
                      />
                    </div>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="inline-block w-full">
                          <Button
                            size="sm"
                            className="w-full"
                            disabled={!assignForm.contractorCompanyId || assignMutation.isPending || blockedByCompliance || blockedByWorker}
                            onClick={() => assignMutation.mutate({ id: selectedWO.id, data: assignForm })}
                          >
                            <Mail className="h-3.5 w-3.5 mr-1.5" />
                            {assignMutation.isPending ? t("workOrders.assigning") : assignForm.assignedEmail ? t("workOrders.assignAndNotify") : t("workOrders.assignNoEmail")}
                          </Button>
                        </span>
                      </TooltipTrigger>
                      {(blockedByCompliance || blockedByWorker) && (
                        <TooltipContent side="top"><p className="text-xs max-w-[260px]">{blockReason}</p></TooltipContent>
                      )}
                    </Tooltip>
                    {contractorLink && (
                      <p className="text-xs text-muted-foreground">
                        {t("workOrders.contractorLink")}{" "}
                        <a
                          href={contractorLink}
                          target="_blank"
                          rel="noreferrer"
                          className="text-primary underline underline-offset-2"
                        >
                          {contractorLink.replace(/^https?:\/\/[^/]+/, "").slice(0, 28)}…
                        </a>
                      </p>
                    )}
                  </div>
                    );
                  })()}
                </div>

                {/* Documents */}
                <div className="space-y-2 border-t pt-4">
                  <p className="text-sm font-semibold flex items-center gap-1.5"><FileText className="h-4 w-4" />{t("workOrders.documentsSection")}</p>
                  {!notifyOnDocumentExpiry && (
                    <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-700 px-3 py-2.5">
                      <BellOff className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
                      <p className="text-xs text-amber-700 dark:text-amber-300">
                        {t("workOrders.expiryNotificationsDisabled")}{" "}
                        <Link href="/settings" className="underline underline-offset-2 font-medium hover:text-amber-900 dark:hover:text-amber-100">
                          {t("workOrders.goToSettings")}
                        </Link>{" "}
                        {t("workOrders.toEnableThem")}.
                      </p>
                    </div>
                  )}
                  {hasMissingDocsAlert(selectedWO, woDocs.length) && (
                    <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2.5">
                      <AlertTriangle className="h-4 w-4 text-red-600 mt-0.5 shrink-0" />
                      <div>
                        <p className="text-xs font-semibold text-red-700">{t("workOrders.actionRequiredNoDocs")}</p>
                        <p className="text-xs text-red-600 mt-0.5">{t("workOrders.actionRequiredNoDocsDesc")}</p>
                      </div>
                    </div>
                  )}
                  {woDocs.length === 0 ? (
                    <p className="text-xs text-muted-foreground">{t("workOrders.noDocumentsYet")}</p>
                  ) : (
                    <div className="space-y-1">
                      {woDocs.map(doc => {
                        const todayStr = new Date().toLocaleDateString("en-CA");
                        const in30DaysStr = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toLocaleDateString("en-CA");
                        const isExpired = !!doc.expiryDate && doc.expiryDate <= todayStr;
                        const isExpiringSoon = !!doc.expiryDate && !isExpired && doc.expiryDate <= in30DaysStr;
                        const hasMetadata = !!(doc.expiryDate || doc.referenceNumber || doc.issuedBy);
                        const scanPending = !hasMetadata && doc.scannedAt === null;
                        return (
                        <div key={doc.id} className={`rounded border px-2 py-1.5 text-xs space-y-0.5 ${isExpired ? "border-red-300 bg-red-50 dark:bg-red-950/20 dark:border-red-800" : isExpiringSoon ? "border-amber-300 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-700" : ""}`}>
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                              <span className="truncate font-medium">{doc.fileName}</span>
                              {doc.fileType && doc.fileType !== "other" && (
                                <Badge variant="secondary" className="text-xs shrink-0">{doc.fileType}</Badge>
                              )}
                              {isExpired && (
                                <Badge className="bg-red-500 text-white text-xs shrink-0">{t("workOrders.expired")}</Badge>
                              )}
                              {isExpiringSoon && (
                                <Badge className="bg-amber-500 text-white text-xs shrink-0">{t("workOrders.expiringSoon")}</Badge>
                              )}
                              {scanPending && (
                                <span className="inline-flex items-center gap-1 text-xs text-muted-foreground shrink-0">
                                  <Scan className="h-3 w-3" />{t("workOrders.scanPending")}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              <a href={doc.fileUrl} target="_blank" rel="noreferrer" title="View document" className="inline-flex items-center justify-center h-6 w-6 rounded text-muted-foreground hover:text-primary hover:bg-muted transition-colors">
                                <Eye className="h-3.5 w-3.5" />
                              </a>
                              <a href={doc.fileUrl} download={doc.fileName} target="_blank" rel="noreferrer" title="Download document" className="inline-flex items-center justify-center h-6 w-6 rounded text-muted-foreground hover:text-primary hover:bg-muted transition-colors">
                                <Download className="h-3.5 w-3.5" />
                              </a>
                              {isAdmin && (isExpired || isExpiringSoon) && (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <span className="inline-flex">
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        className={`h-6 w-6 p-0 ${!notifyOnDocumentExpiry ? "opacity-40 cursor-not-allowed text-muted-foreground" : isExpired ? "text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/30" : "text-amber-600 hover:text-amber-700 hover:bg-amber-50 dark:hover:bg-amber-950/30"}`}
                                        disabled={resendAlertMutation.isPending || !notifyOnDocumentExpiry}
                                        onClick={() => resendAlertMutation.mutate({ woId: selectedWO.id, docId: doc.id })}
                                      >
                                        {resendAlertMutation.isPending ? <RefreshCw className="h-3 w-3 animate-spin" /> : <Bell className="h-3 w-3" />}
                                      </Button>
                                    </span>
                                  </TooltipTrigger>
                                  <TooltipContent side="top">
                                    <p className="text-xs">{notifyOnDocumentExpiry ? t("workOrders.sendExpiryAlertNow") : t("workOrders.expiryNotificationsDisabledShort")}</p>
                                  </TooltipContent>
                                </Tooltip>
                              )}
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-6 w-6 p-0 text-destructive hover:text-destructive"
                                onClick={() => { if (confirm(t("workOrders.confirmDeleteDoc"))) deleteDocMutation.mutate({ woId: selectedWO.id, docId: doc.id }); }}
                              >
                                <X className="h-3 w-3" />
                              </Button>
                            </div>
                          </div>
                          {(doc.expiryDate || doc.referenceNumber || doc.issuedBy) && (
                            <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-muted-foreground pl-5">
                              {doc.expiryDate && <span className={isExpired ? "text-red-600 dark:text-red-400 font-medium" : isExpiringSoon ? "text-amber-600 dark:text-amber-400 font-medium" : ""}>{t("workOrders.expires")} <span className={isExpired ? "text-red-700 dark:text-red-300" : isExpiringSoon ? "text-amber-700 dark:text-amber-300" : "text-foreground"}>{fmtDate(doc.expiryDate)}</span></span>}
                              {doc.referenceNumber && <span>{t("workOrders.ref")} <span className="text-foreground">{doc.referenceNumber}</span></span>}
                              {doc.issuedBy && <span>{t("workOrders.by")} <span className="text-foreground">{doc.issuedBy}</span></span>}
                              {doc.expiryDate && (
                                doc.expiryAlertedAt
                                  ? <span className="flex items-center gap-1 text-green-700 dark:text-green-400"><Bell className="h-3 w-3" />{t("workOrders.notified")} <span className="text-green-800 dark:text-green-300 font-medium">{fmtDate(doc.expiryAlertedAt)}</span></span>
                                  : <span className="flex items-center gap-1 text-muted-foreground/70"><Bell className="h-3 w-3" />{t("workOrders.pendingNotification")}</span>
                              )}
                            </div>
                          )}
                        </div>
                        );
                      })}
                    </div>
                  )}
                  {/* Upload */}
                  <div className="space-y-2 pt-1">
                    <div className="flex items-center gap-2">
                      <Select value={docFileType} onValueChange={setDocFileType}>
                        <SelectTrigger className="h-8 w-32 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="certificate">{t("workOrders.docTypeCertificate")}</SelectItem>
                          <SelectItem value="report">{t("workOrders.docTypeReport")}</SelectItem>
                          <SelectItem value="photo">{t("workOrders.docTypePhoto")}</SelectItem>
                          <SelectItem value="other">{t("workOrders.docTypeOther")}</SelectItem>
                        </SelectContent>
                      </Select>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 text-xs flex-1"
                        disabled={uploadingDoc || isScanningDoc}
                        onClick={() => fileInputRef.current?.click()}
                      >
                        <Upload className="h-3.5 w-3.5 mr-1" />
                        {pendingDocFile ? t("workOrders.changeFile") : t("workOrders.chooseFile")}
                      </Button>
                      <input ref={fileInputRef} type="file" className="hidden" accept=".pdf,.jpg,.jpeg,.png,.doc,.docx" onChange={handleDocFileSelect} />
                    </div>
                    {pendingDocFile && (
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-xs text-muted-foreground truncate flex-1 min-w-0">
                            {t("workOrders.selected")} <span className="font-medium text-foreground">{pendingDocFile.name}</span>
                          </p>
                          {/\.(pdf|jpg|jpeg|png)$/i.test(pendingDocFile.name) && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs text-purple-700 border-purple-300 hover:bg-purple-50 dark:text-purple-300 dark:border-purple-700 dark:hover:bg-purple-950 shrink-0"
                              disabled={isScanningDoc || uploadingDoc}
                              onClick={scanPpmDocument}
                            >
                              {isScanningDoc ? (
                                <><RefreshCw className="h-3.5 w-3.5 mr-1 animate-spin" />{t("workOrders.scanning")}</>
                              ) : (
                                <><Sparkles className="h-3.5 w-3.5 mr-1" />{t("workOrders.scanWithAi")}</>
                              )}
                            </Button>
                          )}
                        </div>
                        <div className="grid grid-cols-1 gap-1.5">
                          <div>
                            <Label className="text-xs text-muted-foreground">{t("workOrders.expiryDateOptional")}</Label>
                            <Input
                              type="date"
                              value={docExpiryDate}
                              onChange={e => setDocExpiryDate(e.target.value)}
                              className="h-7 text-xs"
                              disabled={uploadingDoc}
                            />
                          </div>
                          <div>
                            <Label className="text-xs text-muted-foreground">{t("workOrders.referenceOptional")}</Label>
                            <Input
                              type="text"
                              value={docReferenceNumber}
                              onChange={e => setDocReferenceNumber(e.target.value)}
                              className="h-7 text-xs"
                              placeholder="e.g. CERT-12345"
                              disabled={uploadingDoc}
                            />
                          </div>
                          <div>
                            <Label className="text-xs text-muted-foreground">{t("workOrders.issuedByOptional")}</Label>
                            <Input
                              type="text"
                              value={docIssuedBy}
                              onChange={e => setDocIssuedBy(e.target.value)}
                              className="h-7 text-xs"
                              placeholder="e.g. SafeContractor"
                              disabled={uploadingDoc}
                            />
                          </div>
                        </div>
                        {docAiExtracted && (
                          <div className="flex items-center gap-1.5 text-xs text-purple-700 dark:text-purple-300 bg-purple-50 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-800 rounded-md px-3 py-2">
                            <Sparkles className="h-3.5 w-3.5 shrink-0" />
                            {t("workOrders.aiExtracted")}
                          </div>
                        )}
                        <Button
                          size="sm"
                          className="h-8 text-xs w-full"
                          disabled={uploadingDoc || isScanningDoc}
                          onClick={handleDocUpload}
                        >
                          {uploadingDoc ? <><RefreshCw className="h-3.5 w-3.5 mr-1 animate-spin" />{t("workOrders.uploading")}</> : <><Upload className="h-3.5 w-3.5 mr-1" />{t("workOrders.uploadDocument")}</>}
                        </Button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Delete */}
                <div className="border-t pt-4">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-destructive hover:text-destructive w-full"
                    disabled={deleteWOMutation.isPending}
                    onClick={() => { if (confirm(t("workOrders.confirmDeleteWO"))) deleteWOMutation.mutate(selectedWO.id); }}
                  >
                    <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                    {deleteWOMutation.isPending ? t("assets.deleting") : t("workOrders.deleteWorkOrderBtn")}
                  </Button>
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function PPM() {
  const { toast } = useToast();
  const { t } = useTranslation("ppm");
  const search = useSearch();
  const searchParams = new URLSearchParams(search);
  const defaultTab = searchParams.get('highlight')
    ? "work-orders"
    : searchParams.get("view") === "planner"
      ? "annual-planner"
      : searchParams.get("tab") ?? "dashboard";
  const [activeTab, setActiveTab] = useState(defaultTab);
  const [woStatusFilter, setWoStatusFilter] = useState<string | undefined>(undefined);
  const [woHighlightId, setWoHighlightId] = useState<string | undefined>(
    searchParams.get('highlight') ?? undefined
  );

  const { data: companySettings } = useQuery<CompanySettings>({ queryKey: ["/api/settings"] });
  const notificationsEnabled = companySettings?.notifyOnDocumentExpiry !== false;

  function handleSummaryClick(filter?: string) {
    setWoStatusFilter(filter);
    setWoHighlightId(undefined);
    setActiveTab("work-orders");
  }

  function navigateToWorkOrder(id: string) {
    setWoStatusFilter(undefined);
    setWoHighlightId(id);
    setActiveTab("work-orders");
  }

  const { data: assets = [] } = useQuery<PpmAsset[]>({ queryKey: ["/api/ppm/assets"] });
  const { data: templates = [] } = useQuery<PpmTemplate[]>({ queryKey: ["/api/ppm/templates"] });
  const { data: pageWorkOrders = [] } = useQuery<PpmWorkOrder[]>({ queryKey: ["/api/ppm/work-orders"] });
  const isEmpty = assets.length === 0 && templates.length === 0;

  const complianceScore = useMemo(() => {
    const total = pageWorkOrders.length;
    if (total === 0) return null;
    const complete = pageWorkOrders.filter(w => w.status === "completed").length;
    return Math.round((complete / total) * 100);
  }, [pageWorkOrders]);

  const demoDataMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/ppm/demo-data").then(r => r.json()),
    onSuccess: (result: { assetsCreated: number; templatesCreated: number; message: string }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/ppm/asset-groups"] });
      queryClient.invalidateQueries({ queryKey: ["/api/ppm/assets"] });
      queryClient.invalidateQueries({ queryKey: ["/api/ppm/templates"] });
      queryClient.invalidateQueries({ queryKey: ["/api/ppm/schedules"] });
      queryClient.invalidateQueries({ queryKey: ["/api/ppm/work-orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/contractors"] });
      setActiveTab("assets");
      toast({
        title: t("page.demoDataLoaded"),
        description: result.message,
      });
    },
    onError: (error: unknown) => toastError(error, toast),
  });

  const deleteDemoMutation = useMutation({
    mutationFn: () => apiRequest("DELETE", "/api/ppm/demo-data").then(r => r.json()),
    onSuccess: (result: { message: string }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/ppm/asset-groups"] });
      queryClient.invalidateQueries({ queryKey: ["/api/ppm/assets"] });
      queryClient.invalidateQueries({ queryKey: ["/api/ppm/templates"] });
      queryClient.invalidateQueries({ queryKey: ["/api/ppm/schedules"] });
      queryClient.invalidateQueries({ queryKey: ["/api/ppm/work-orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/contractors"] });
      setActiveTab("assets");
      toast({
        title: t("page.demoDataRemoved"),
        description: result.message,
      });
    },
    onError: (error: unknown) => toastError(error, toast),
  });

  function handleLoadDemo() {
    if (!isEmpty && !confirm(t("page.confirmLoadDemo"))) return;
    demoDataMutation.mutate();
  }

  function handleDeleteDemo() {
    if (!confirm(t("page.confirmDeleteDemo"))) return;
    deleteDemoMutation.mutate();
  }

  if (companySettings !== undefined && !companySettings.featurePPM) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center max-w-md space-y-4">
          <div className="p-4 rounded-full bg-muted inline-flex mx-auto">
            <Wrench className="h-10 w-10 text-muted-foreground" />
          </div>
          <h2 className="text-xl font-semibold">{t("page.moduleNotAvailableTitle")}</h2>
          <p className="text-muted-foreground">
            {t("page.moduleNotAvailableDesc")}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10">
            <Wrench className="h-6 w-6 text-primary" />
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-2xl font-bold">{t("page.title")}</h1>
              {complianceScore !== null && (
                <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full border ${
                  complianceScore >= 80
                    ? "bg-green-50 text-green-700 border-green-200"
                    : complianceScore >= 60
                    ? "bg-amber-50 text-amber-700 border-amber-200"
                    : "bg-red-50 text-red-700 border-red-200"
                }`}>
                  <ShieldCheck className="h-3 w-3" />
                  {t("page.complianceScore", { score: complianceScore })}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1.5">
              <p className="text-sm text-muted-foreground">{t("page.subtitle")}</p>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button type="button" className="text-muted-foreground hover:text-foreground transition-colors">
                      <Info size={14} />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="max-w-sm text-xs space-y-2 p-3">
                    <p><strong>Planned Preventative Maintenance (PPM)</strong> — A proactive maintenance strategy aligned with <strong>SFG20</strong> (the industry standard for building services maintenance) and <strong>BS EN ISO 55001</strong> (Asset Management). PPM reduces unexpected breakdowns, extends asset lifespan, and lowers long-term costs.</p>
                    <p>Employers have a legal duty under the <strong>Health &amp; Safety at Work Act 1974</strong> and the <strong>Workplace (Health, Safety and Welfare) Regulations 1992</strong> to ensure plant and equipment is properly maintained. A documented PPM programme provides evidence of compliance.</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {!isEmpty && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleDeleteDemo}
              disabled={deleteDemoMutation.isPending || demoDataMutation.isPending}
              className="gap-1.5 text-destructive hover:text-destructive border-destructive/30 hover:border-destructive/60 hover:bg-destructive/5"
            >
              <Trash2 className="h-4 w-4" />
              {deleteDemoMutation.isPending ? t("page.deletingDemo") : t("page.deleteAllDemoData")}
            </Button>
          )}
          <Button
            variant={isEmpty ? "default" : "outline"}
            size="sm"
            onClick={handleLoadDemo}
            disabled={demoDataMutation.isPending || deleteDemoMutation.isPending}
            className={`gap-1.5 ${isEmpty ? "animate-pulse" : ""}`}
          >
            <Sparkles className="h-4 w-4" />
            {demoDataMutation.isPending ? t("page.loadingDemo") : t("page.loadDemoData")}
          </Button>
        </div>
      </div>

      <DashboardSummary onWorkOrdersClick={handleSummaryClick} />

      {!notificationsEnabled && (
        <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-700 px-4 py-3">
          <BellOff className="h-5 w-5 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
          <div className="space-y-1">
            <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">{t("page.notificationsDisabledTitle")}</p>
            <p className="text-xs text-amber-700 dark:text-amber-400">
              {t("page.notificationsDisabledDesc")}{" "}
              <Link href="/settings" className="underline underline-offset-2 font-medium hover:text-amber-900 dark:hover:text-amber-200">
                {t("page.goToNotificationSettings")}
              </Link>{" "}
              {t("page.toTurnOn")}
            </p>
          </div>
        </div>
      )}

      {(() => {
        const overdueCount = pageWorkOrders.filter(wo => wo.status === "overdue").length;
        if (overdueCount === 0) return null;
        return (
          <div className="flex items-center gap-3 px-4 py-2.5 mb-3 rounded-lg bg-red-50 border border-red-200 text-red-800 text-sm">
            <AlertTriangle className="h-4 w-4 shrink-0 text-red-600" />
            <span>
              <span className="font-semibold">{overdueCount !== 1 ? t("page.overdueWorkOrdersPlural", { count: overdueCount }) : t("page.overdueWorkOrdersSingular", { count: overdueCount })}</span>
              {" "}{t("page.actionRequired")}
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="ml-auto h-7 text-red-700 hover:bg-red-100 text-xs"
              onClick={() => setActiveTab("work-orders")}
            >
              {t("page.viewNow")}
            </Button>
          </div>
        );
      })()}

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="dashboard" className="flex items-center gap-1.5">
            <LayoutDashboard className="h-4 w-4" />{t("page.tabs.dashboard")}
          </TabsTrigger>
          <TabsTrigger value="assets" className="flex items-center gap-1.5">
            <Building2 className="h-4 w-4" />{t("page.tabs.assets")}
          </TabsTrigger>
          <TabsTrigger value="templates" className="flex items-center gap-1.5">
            <ClipboardList className="h-4 w-4" />{t("page.tabs.templates")}
          </TabsTrigger>
          <TabsTrigger value="schedules" className="flex items-center gap-1.5">
            <CalendarClock className="h-4 w-4" />{t("page.tabs.schedules")}
          </TabsTrigger>
          <TabsTrigger value="work-orders" className="flex items-center gap-1.5">
            <ClipboardCheck className="h-4 w-4" />{t("page.tabs.workOrders")}
          </TabsTrigger>
          <TabsTrigger value="annual-planner" className="flex items-center gap-1.5">
            <CalendarDays className="h-4 w-4" />{t("page.tabs.annualPlanner")}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="dashboard" className="mt-4"><PpmDashboard /></TabsContent>
        <TabsContent value="assets" className="mt-4"><AssetsTab /></TabsContent>
        <TabsContent value="templates" className="mt-4"><TemplatesTab /></TabsContent>
        <TabsContent value="schedules" className="mt-4"><SchedulesTab /></TabsContent>
        <TabsContent value="work-orders" className="mt-4">
          <WorkOrdersTab key={`${woStatusFilter ?? "none"}-${woHighlightId ?? "none"}`} initialStatusFilter={woStatusFilter} initialWorkOrderId={woHighlightId} />
        </TabsContent>
        <TabsContent value="annual-planner" className="mt-4">
          <PpmAnnualPlanner navigateToWorkOrder={navigateToWorkOrder} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
