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
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import {
  Wrench, Plus, Edit, Trash2, Copy, Building2, ClipboardList, CalendarClock,
  CheckCircle2, AlertTriangle, Clock, Package, ShieldCheck, BookOpen,
  ClipboardCheck, UserCheck, FileUp, HardHat, FileText, Filter, X,
  Download, Upload, Mail, RefreshCw, Eye, Sparkles, Phone, MapPin, Globe, User,
  Layers, ChevronDown, ChevronRight, Bell, FileDown,
} from "lucide-react";

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
  createdAt?: string | null;
  expiredDocCount?: number;
  expiringSoonDocCount?: number;
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
  expiryAlertedAt?: string | null;
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
  { value: "scheduled", label: "Scheduled", classes: "bg-blue-100 text-blue-800 border-blue-200" },
  { value: "in_progress", label: "In Progress", classes: "bg-amber-100 text-amber-800 border-amber-200" },
  { value: "completed", label: "Completed", classes: "bg-green-100 text-green-800 border-green-200" },
  { value: "overdue", label: "Overdue", classes: "bg-red-100 text-red-800 border-red-200" },
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
    { label: "Active Schedules", value: activeSchedules, color: "text-foreground", onClick: undefined },
    { label: "Due This Month", value: dueThisMonth, color: dueThisMonth > 0 ? "text-amber-600" : "text-foreground", onClick: undefined },
    { label: "Overdue Work Orders", value: overdueWOs, color: overdueWOs > 0 ? "text-red-600" : "text-foreground", onClick: () => onWorkOrdersClick("overdue") },
    { label: "Awaiting Certificates", value: awaitingCerts, color: awaitingCerts > 0 ? "text-amber-600" : "text-foreground", onClick: () => onWorkOrdersClick("awaiting-cert") },
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
    onSuccess: () => { inv(); setOpen(false); toast({ title: "Asset created" }); },
    onError: (error: unknown) => toastError(error, toast),
  });
  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) => apiRequest("PUT", `/api/ppm/assets/${id}`, data),
    onSuccess: () => { inv(); setOpen(false); toast({ title: "Asset updated" }); },
    onError: (error: unknown) => toastError(error, toast),
  });
  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/ppm/assets/${id}`),
    onSuccess: () => { inv(); toast({ title: "Asset deleted" }); },
    onError: (error: unknown) => toastError(error, toast),
  });
  const duplicateMutation = useMutation({
    mutationFn: (id: string) => apiRequest("POST", `/api/ppm/assets/${id}/duplicate`),
    onSuccess: () => { inv(); toast({ title: "Asset duplicated", description: "A copy has been added — update the name, ref, and serial number as needed." }); },
    onError: (error: unknown) => toastError(error, toast),
  });

  // ── Group mutations ─────────────────────────────────────────────────────────
  const invG = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/ppm/asset-groups"] });
    queryClient.invalidateQueries({ queryKey: ["/api/ppm/assets"] });
  };
  const createGroupMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => apiRequest("POST", "/api/ppm/asset-groups", data),
    onSuccess: () => { invG(); setGroupForm({ name: "", description: "" }); toast({ title: "Asset group created" }); },
    onError: (error: unknown) => toastError(error, toast),
  });
  const updateGroupMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) => apiRequest("PUT", `/api/ppm/asset-groups/${id}`, data),
    onSuccess: () => { invG(); setEditingGroup(null); setGroupForm({ name: "", description: "" }); toast({ title: "Group updated" }); },
    onError: (error: unknown) => toastError(error, toast),
  });
  const deleteGroupMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/ppm/asset-groups/${id}`),
    onSuccess: () => { invG(); toast({ title: "Group deleted", description: "Assets have been moved to Ungrouped." }); },
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
            {a.assetRef && <p className="text-xs text-muted-foreground">Ref: {a.assetRef}</p>}
          </div>
          <AssetStatusBadge status={a.status} />
        </div>
        {a.category && <p className="text-xs"><span className="text-muted-foreground">Category:</span> {a.category}</p>}
        {a.location && <p className="text-xs"><span className="text-muted-foreground">Location:</span> {a.location}</p>}
        {a.manufacturer && <p className="text-xs"><span className="text-muted-foreground">Manufacturer:</span> {a.manufacturer}</p>}
        {a.serialNumber && <p className="text-xs"><span className="text-muted-foreground">Serial:</span> {a.serialNumber}</p>}
        <div className="flex gap-2 pt-1">
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => openEdit(a)}><Edit className="h-3 w-3 mr-1" />Edit</Button>
          <Button size="sm" variant="outline" className="h-7 text-xs" disabled={duplicateMutation.isPending} onClick={() => duplicateMutation.mutate(a.id)}>
            <Copy className="h-3 w-3 mr-1" />Duplicate
          </Button>
          <Button size="sm" variant="ghost" className="h-7 text-xs text-destructive hover:text-destructive" onClick={() => { if (confirm("Delete this asset? Any associated schedules will also be deleted.")) deleteMutation.mutate(a.id); }}>
            <Trash2 className="h-3 w-3 mr-1" />Delete
          </Button>
        </div>
      </GlassCard>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Register and track all physical assets that require maintenance.</p>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => { setEditingGroup(null); setGroupForm({ name: "", description: "" }); setGroupDialogOpen(true); }}>
            <Layers className="h-4 w-4 mr-1" />Manage Groups
          </Button>
          <Button onClick={openNew} size="sm"><Plus className="h-4 w-4 mr-1" />Add Asset</Button>
        </div>
      </div>

      {isLoading ? (
        <div className="text-center py-10 text-muted-foreground">Loading assets…</div>
      ) : assets.length === 0 ? (
        <div className="text-center py-16">
          <Package className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="text-muted-foreground">No assets yet. Add your first asset to get started.</p>
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
                <Badge variant="secondary" className="text-xs">{ga.length} asset{ga.length !== 1 ? "s" : ""}</Badge>
              </button>
              {expandedGroups.has(group.id) && (
                <div className="p-3">
                  {ga.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-3 text-center">No assets assigned to this group yet. Edit an asset to assign it here.</p>
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
                <span className="font-medium text-sm text-muted-foreground flex-1">Ungrouped</span>
                <Badge variant="outline" className="text-xs">{ungrouped.length} asset{ungrouped.length !== 1 ? "s" : ""}</Badge>
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
          <DialogHeader><DialogTitle>{editing ? "Edit Asset" : "New Asset"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <Label>Asset Name *</Label>
                <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. AHU-01 Air Handling Unit" />
              </div>
              <div>
                <Label>Asset Ref / Tag</Label>
                <Input value={form.assetRef} onChange={e => setForm(f => ({ ...f, assetRef: e.target.value }))} placeholder="e.g. TAG-001" />
              </div>
              <div>
                <Label>Category</Label>
                <Select value={form.category || "_none"} onValueChange={v => setForm(f => ({ ...f, category: v === "_none" ? "" : v }))}>
                  <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">— None —</SelectItem>
                    {ASSET_CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2">
                <Label>Asset Group</Label>
                <Select value={form.groupId || "_none"} onValueChange={v => setForm(f => ({ ...f, groupId: v === "_none" ? "" : v }))}>
                  <SelectTrigger><SelectValue placeholder="— Ungrouped —" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">— Ungrouped —</SelectItem>
                    {groups.map(g => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2">
                <Label>Location</Label>
                <Input value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))} placeholder="e.g. Roof Level / Plant Room 1" />
              </div>
              <div>
                <Label>Manufacturer</Label>
                <Input value={form.manufacturer} onChange={e => setForm(f => ({ ...f, manufacturer: e.target.value }))} />
              </div>
              <div>
                <Label>Model Number</Label>
                <Input value={form.modelNumber} onChange={e => setForm(f => ({ ...f, modelNumber: e.target.value }))} />
              </div>
              <div>
                <Label>Serial Number</Label>
                <Input value={form.serialNumber} onChange={e => setForm(f => ({ ...f, serialNumber: e.target.value }))} />
              </div>
              <div>
                <Label>Install Date</Label>
                <Input type="date" value={form.installDate} onChange={e => setForm(f => ({ ...f, installDate: e.target.value }))} />
              </div>
              <div>
                <Label>Status</Label>
                <Select value={form.status} onValueChange={v => setForm(f => ({ ...f, status: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="decommissioned">Decommissioned</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2">
                <Label>Notes</Label>
                <Textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={!form.name || isBusy}>{isBusy ? "Saving…" : editing ? "Update" : "Create"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Group Management Dialog ───────────────────────────────────────── */}
      <Dialog open={groupDialogOpen} onOpenChange={o => { setGroupDialogOpen(o); if (!o) { setEditingGroup(null); setGroupForm({ name: "", description: "" }); } }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Layers className="h-4 w-4" />Asset Groups</DialogTitle></DialogHeader>
          <div className="space-y-4">
            {/* Existing groups list */}
            {groups.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No groups yet. Create one below.</p>
            ) : (
              <div className="space-y-2">
                {groups.map(g => (
                  <div key={g.id} className="flex items-center gap-2 p-3 border rounded-md bg-muted/20">
                    {editingGroup?.id === g.id ? (
                      <div className="flex-1 space-y-2">
                        <Input value={groupForm.name} onChange={e => setGroupForm(f => ({ ...f, name: e.target.value }))} placeholder="Group name" />
                        <Input value={groupForm.description} onChange={e => setGroupForm(f => ({ ...f, description: e.target.value }))} placeholder="Description (optional)" />
                        <div className="flex gap-2">
                          <Button size="sm" disabled={!groupForm.name || updateGroupMutation.isPending} onClick={() => updateGroupMutation.mutate({ id: g.id, data: groupForm })}>Save</Button>
                          <Button size="sm" variant="outline" onClick={() => { setEditingGroup(null); setGroupForm({ name: "", description: "" }); }}>Cancel</Button>
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
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive hover:text-destructive" onClick={() => { if (confirm(`Delete "${g.name}"? Assets will become ungrouped.`)) deleteGroupMutation.mutate(g.id); }}>
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
                <p className="text-sm font-medium">Create New Group</p>
                <Input value={groupForm.name} onChange={e => setGroupForm(f => ({ ...f, name: e.target.value }))} placeholder="Group name e.g. HVAC System, Access Control" />
                <Input value={groupForm.description} onChange={e => setGroupForm(f => ({ ...f, description: e.target.value }))} placeholder="Description (optional)" />
                <Button size="sm" disabled={!groupForm.name || createGroupMutation.isPending} onClick={() => createGroupMutation.mutate(groupForm)}>
                  <Plus className="h-3.5 w-3.5 mr-1" />{createGroupMutation.isPending ? "Creating…" : "Create Group"}
                </Button>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setGroupDialogOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Templates Tab ───────────────────────────────────────────────────────────

function TemplatesTab() {
  const { toast } = useToast();
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
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/ppm/templates"] }); setOpen(false); toast({ title: "Template created" }); },
    onError: (error: unknown) => toastError(error, toast),
  });
  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) => apiRequest("PUT", `/api/ppm/templates/${id}`, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/ppm/templates"] }); setOpen(false); toast({ title: "Template updated" }); },
    onError: (error: unknown) => toastError(error, toast),
  });
  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/ppm/templates/${id}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/ppm/templates"] }); toast({ title: "Template deleted" }); },
    onError: (error: unknown) => toastError(error, toast),
  });

  function openNew() { setEditing(null); setForm(emptyForm()); setOpen(true); }
  function openEdit(t: PpmTemplate) {
    setEditing(t);
    setForm({ name: t.name, description: t.description ?? "", category: t.category ?? "",
      type: t.type || "non-statutory", regulationReference: t.regulationReference ?? "",
      frequency: t.frequency, customDays: t.customDays?.toString() ?? "",
      estimatedHours: t.estimatedHours ?? "", checklist: t.checklist ?? "" });
    setOpen(true);
  }
  function handleSubmit() {
    const payload = { ...form, customDays: form.customDays ? parseInt(form.customDays) : null };
    if (editing) updateMutation.mutate({ id: editing.id, data: payload });
    else createMutation.mutate(payload);
  }
  const isBusy = createMutation.isPending || updateMutation.isPending;
  const checkItems = (t: PpmTemplate) => { try { return JSON.parse(t.checklist ?? "[]"); } catch { return []; } };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Reusable maintenance task templates with statutory classification and checklist items.</p>
        <Button onClick={openNew} size="sm"><Plus className="h-4 w-4 mr-1" />Add Template</Button>
      </div>

      {isLoading ? (
        <div className="text-center py-10 text-muted-foreground">Loading templates…</div>
      ) : templates.length === 0 ? (
        <div className="text-center py-16">
          <ClipboardList className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="text-muted-foreground">No templates yet. Create a template to define recurring tasks.</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {templates.map(t => {
            const items = checkItems(t);
            const isStatutory = t.type === "statutory";
            return (
              <GlassCard key={t.id} className="p-4 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-semibold text-sm truncate">{t.name}</p>
                  <Badge variant="secondary" className="text-xs shrink-0">{freqLabel(t.frequency)}</Badge>
                </div>
                <div className="flex items-center gap-1.5">
                  {isStatutory ? (
                    <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-purple-100 text-purple-800 border border-purple-200 font-medium">
                      <ShieldCheck className="h-3 w-3" />Statutory
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
                      Non-statutory
                    </span>
                  )}
                </div>
                {t.regulationReference && (
                  <p className="text-xs flex items-start gap-1"><BookOpen className="h-3 w-3 mt-0.5 text-muted-foreground shrink-0" /><span className="text-muted-foreground">{t.regulationReference}</span></p>
                )}
                {t.description && <p className="text-xs text-muted-foreground line-clamp-2">{t.description}</p>}
                {t.category && <p className="text-xs"><span className="text-muted-foreground">Category:</span> {t.category}</p>}
                {t.estimatedHours && <p className="text-xs"><span className="text-muted-foreground">Est. time:</span> {t.estimatedHours}h</p>}
                {items.length > 0 && <p className="text-xs text-muted-foreground">{items.length} checklist item{items.length !== 1 ? "s" : ""}</p>}
                <div className="flex gap-2 pt-1">
                  <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => openEdit(t)}><Edit className="h-3 w-3 mr-1" />Edit</Button>
                  <Button size="sm" variant="ghost" className="h-7 text-xs text-destructive hover:text-destructive" onClick={() => { if (confirm("Delete this template?")) deleteMutation.mutate(t.id); }}>
                    <Trash2 className="h-3 w-3 mr-1" />Delete
                  </Button>
                </div>
              </GlassCard>
            );
          })}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing ? "Edit Template" : "New Template"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Template Name *</Label>
              <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Monthly HVAC Filter Check" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Type *</Label>
                <Select value={form.type} onValueChange={v => setForm(f => ({ ...f, type: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="statutory">Statutory (legally required)</SelectItem>
                    <SelectItem value="non-statutory">Non-statutory (best practice)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Category</Label>
                <Select value={form.category || "_none"} onValueChange={v => setForm(f => ({ ...f, category: v === "_none" ? "" : v }))}>
                  <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">— None —</SelectItem>
                    {ASSET_CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {form.type === "statutory" && (
              <div>
                <Label>Regulation / Standard Reference</Label>
                <Select value={form.regulationReference || "_custom"} onValueChange={v => setForm(f => ({ ...f, regulationReference: v === "_custom" ? "" : v }))}>
                  <SelectTrigger><SelectValue placeholder="Select or type below" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_custom">Type custom reference…</SelectItem>
                    {COMMON_REGULATIONS.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Input className="mt-1.5" value={form.regulationReference} onChange={e => setForm(f => ({ ...f, regulationReference: e.target.value }))} placeholder="e.g. BS 5839" />
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Frequency *</Label>
                <Select value={form.frequency} onValueChange={v => setForm(f => ({ ...f, frequency: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {FREQUENCIES.map(f => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              {form.frequency === "custom" && (
                <div>
                  <Label>Custom Interval (days)</Label>
                  <Input type="number" min="1" value={form.customDays} onChange={e => setForm(f => ({ ...f, customDays: e.target.value }))} placeholder="e.g. 45" />
                </div>
              )}
              <div>
                <Label>Estimated Hours</Label>
                <Input value={form.estimatedHours} onChange={e => setForm(f => ({ ...f, estimatedHours: e.target.value }))} placeholder="e.g. 2.5" />
              </div>
            </div>
            <div>
              <Label>Description</Label>
              <Textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={2} placeholder="Brief description of this maintenance task" />
            </div>
            <div>
              <Label>Checklist Items (one per line)</Label>
              <Textarea
                value={(() => { try { const arr = JSON.parse(form.checklist || "[]"); return arr.join("\n"); } catch { return form.checklist; } })()}
                onChange={e => { const lines = e.target.value.split("\n").map(l => l.trim()).filter(Boolean); setForm(f => ({ ...f, checklist: JSON.stringify(lines) })); }}
                rows={4}
                placeholder={"Check filters\nInspect belts\nRecord readings"}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={!form.name || isBusy}>{isBusy ? "Saving…" : editing ? "Update" : "Create"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Schedules Tab ───────────────────────────────────────────────────────────

function SchedulesTab() {
  const { toast } = useToast();
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
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/ppm/schedules"] }); setOpen(false); toast({ title: "Schedule created" }); },
    onError: (error: unknown) => toastError(error, toast),
  });
  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) => apiRequest("PUT", `/api/ppm/schedules/${id}`, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/ppm/schedules"] }); setOpen(false); toast({ title: "Schedule updated" }); },
    onError: (error: unknown) => toastError(error, toast),
  });
  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/ppm/schedules/${id}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/ppm/schedules"] }); toast({ title: "Schedule deleted" }); },
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
    const t = templates.find(t => t.id === templateId);
    if (!t) return;
    setForm(f => ({ ...f, templateId, title: t.name, frequency: t.frequency, customDays: t.customDays?.toString() ?? "" }));
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
            <p className="text-xs text-muted-foreground flex items-center justify-center gap-1"><AlertTriangle className="h-3 w-3" />Overdue</p>
          </GlassCard>
          <GlassCard className="p-3 text-center">
            <p className={`text-2xl font-bold ${dueSoon > 0 ? "text-amber-600" : ""}`}>{dueSoon}</p>
            <p className="text-xs text-muted-foreground flex items-center justify-center gap-1"><Clock className="h-3 w-3" />Due within 7 days</p>
          </GlassCard>
          <GlassCard className="p-3 text-center">
            <p className="text-2xl font-bold text-green-600">{upcoming}</p>
            <p className="text-xs text-muted-foreground flex items-center justify-center gap-1"><CheckCircle2 className="h-3 w-3" />Upcoming</p>
          </GlassCard>
        </div>
      )}

      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Maintenance schedules linked to specific assets. Statuses auto-refresh daily.</p>
        <Button onClick={openNew} size="sm" disabled={assets.length === 0}><Plus className="h-4 w-4 mr-1" />Add Schedule</Button>
      </div>

      {assets.length === 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          Add at least one asset in the Assets tab before creating schedules.
        </div>
      )}

      {isLoading ? (
        <div className="text-center py-10 text-muted-foreground">Loading schedules…</div>
      ) : schedules.length === 0 ? (
        <div className="text-center py-16">
          <CalendarClock className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="text-muted-foreground">No schedules yet. Create a schedule to track upcoming maintenance.</p>
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
                  <p className="text-xs text-muted-foreground mt-0.5">Asset: <span className="text-foreground">{assetName(s.assetId)}</span></p>
                  <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-1 text-xs text-muted-foreground">
                    <span>Next due: <span className="text-foreground font-medium">{fmtDate(s.nextDueDate)}</span></span>
                    {s.lastCompletedDate && <span>Last done: {fmtDate(s.lastCompletedDate)}</span>}
                    {s.assignedTo && <span>Assigned: {s.assignedTo}</span>}
                    <span>Frequency: {freqLabel(s.frequency)}</span>
                  </div>
                  {s.notes && <p className="text-xs text-muted-foreground mt-1 italic">{s.notes}</p>}
                </div>
                <div className="flex gap-1 shrink-0">
                  <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => openEdit(s)}><Edit className="h-3 w-3" /></Button>
                  <Button size="sm" variant="ghost" className="h-7 text-xs text-destructive hover:text-destructive" onClick={() => { if (confirm("Delete this schedule?")) deleteMutation.mutate(s.id); }}>
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
          <DialogHeader><DialogTitle>{editing ? "Edit Schedule" : "New Schedule"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Asset *</Label>
              <Select value={form.assetId} onValueChange={v => setForm(f => ({ ...f, assetId: v }))}>
                <SelectTrigger><SelectValue placeholder="Select asset" /></SelectTrigger>
                <SelectContent>
                  {assets.map(a => <SelectItem key={a.id} value={a.id}>{a.name}{a.assetRef ? ` (${a.assetRef})` : ""}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Apply Template (optional — prefills title & frequency)</Label>
              <Select value={form.templateId || "_none"} onValueChange={v => { if (v !== "_none") applyTemplate(v); else setForm(f => ({ ...f, templateId: "" })); }}>
                <SelectTrigger><SelectValue placeholder="Select template to prefill" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">— None —</SelectItem>
                  {templates.map(t => <SelectItem key={t.id} value={t.id}>{t.name} ({t.type === "statutory" ? "Statutory" : "Non-statutory"})</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Schedule Title *</Label>
              <Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. Monthly AC Filter Change" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Frequency *</Label>
                <Select value={form.frequency} onValueChange={v => setForm(f => ({ ...f, frequency: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {FREQUENCIES.map(f => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              {form.frequency === "custom" && (
                <div>
                  <Label>Interval (days)</Label>
                  <Input type="number" min="1" value={form.customDays} onChange={e => setForm(f => ({ ...f, customDays: e.target.value }))} />
                </div>
              )}
              <div>
                <Label>Start Date *</Label>
                <Input type="date" value={form.startDate} onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))} />
              </div>
              <div>
                <Label>Next Due Date {!editing && <span className="text-xs text-muted-foreground">(auto-calculated)</span>}</Label>
                <Input type="date" value={form.nextDueDate} onChange={e => setForm(f => ({ ...f, nextDueDate: e.target.value }))} />
                {!editing && form.nextDueDate && <p className="text-xs text-muted-foreground mt-1">Calculated from start date + frequency. Override if needed.</p>}
              </div>
              <div>
                <Label>Last Completed</Label>
                <Input type="date" value={form.lastCompletedDate} onChange={e => setForm(f => ({ ...f, lastCompletedDate: e.target.value }))} />
              </div>
              <div>
                <Label>Assigned To</Label>
                <Input value={form.assignedTo} onChange={e => setForm(f => ({ ...f, assignedTo: e.target.value }))} placeholder="Engineer or company" />
              </div>
            </div>
            {editing && (
              <div>
                <Label>Status</Label>
                <Select value={form.status} onValueChange={v => setForm(f => ({ ...f, status: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="scheduled">Scheduled</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
            <div>
              <Label>Notes</Label>
              <Textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={!form.assetId || !form.title || !form.startDate || isBusy}>
              {isBusy ? "Saving…" : editing ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Work Orders Tab ──────────────────────────────────────────────────────────

function WorkOrdersTab({ initialStatusFilter }: { initialStatusFilter?: string }) {
  const { toast } = useToast();
  const { data: currentUser } = useQuery<{ id: string; username: string; role: string }>({ queryKey: ["/api/auth/me"] });
  const isAdmin = currentUser?.role === "admin";

  // Filters
  const [filterStatus, setFilterStatus] = useState(initialStatusFilter || "all");
  const [filterAsset, setFilterAsset] = useState("all");
  const [filterContractor, setFilterContractor] = useState("");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");
  const [filterExpiringDocs, setFilterExpiringDocs] = useState(false);

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

  // Create form
  const emptyWOForm = () => ({
    title: "", description: "", assetId: "", groupId: "", scheduleId: "", dueDate: "", notes: "",
    requiresCertificate: false, status: "scheduled", scope: "single-asset" as "single-asset" | "group",
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
      toast({ title: "Work order created" });
    },
    onError: (error: unknown) => toastError(error, toast),
  });

  const updateWOMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) => apiRequest("PUT", `/api/ppm/work-orders/${id}`, data),
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ["/api/ppm/work-orders"] });
      const updated = workOrders.find(w => w.id === vars.id);
      if (updated) setSelectedWO({ ...updated, ...vars.data } as PpmWorkOrder);
      setShowEditWO(false);
      setEditingWO(null);
      toast({ title: "Work order updated" });
    },
    onError: (error: unknown) => toastError(error, toast),
  });

  const deleteWOMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/ppm/work-orders/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ppm/work-orders"] });
      setShowDetail(false);
      setSelectedWO(null);
      toast({ title: "Work order deleted" });
    },
    onError: (error: unknown) => toastError(error, toast),
  });

  const duplicateWOMutation = useMutation({
    mutationFn: (id: string) => apiRequest("POST", `/api/ppm/work-orders/${id}/duplicate`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ppm/work-orders"] });
      toast({ title: "Work order duplicated", description: "A copy has been added with status reset to Scheduled." });
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
        toast({ title: "Contractor assigned", description: "Notification email sent to contractor." });
      } else if (updated.assignedEmail) {
        toast({ title: "Contractor assigned", description: "Assignment saved but email delivery failed. Check server logs.", variant: "destructive" });
      } else {
        toast({ title: "Contractor assigned", description: "No email address provided — assignment saved without notification." });
      }
    },
    onError: (error: unknown) => toastError(error, toast),
  });

  const deleteDocMutation = useMutation({
    mutationFn: ({ woId, docId }: { woId: string; docId: string }) => apiRequest("DELETE", `/api/ppm/work-orders/${woId}/documents/${docId}`),
    onSuccess: () => { refetchDocs(); toast({ title: "Document removed" }); },
    onError: (error: unknown) => toastError(error, toast),
  });

  const resendAlertMutation = useMutation({
    mutationFn: ({ woId, docId }: { woId: string; docId: string }) => apiRequest("POST", `/api/ppm/work-orders/${woId}/documents/${docId}/resend-alert`),
    onSuccess: () => { refetchDocs(); toast({ title: "Expiry alert sent", description: "The alert email has been sent to the admin address." }); },
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
    if (filterStatus === "awaiting-cert") {
      if (!(w.status === "completed" && w.requiresCertificate && !w.certificateUploadedAt)) return false;
    } else if (filterStatus !== "all" && w.status !== filterStatus) return false;
    if (filterAsset !== "all" && w.assetId !== filterAsset) return false;
    if (filterContractor && filterContractor !== "all" && w.contractorCompanyName !== filterContractor) return false;
    if (filterDateFrom && w.dueDate && w.dueDate < filterDateFrom) return false;
    if (filterDateTo && w.dueDate && w.dueDate > filterDateTo) return false;
    if (filterExpiringDocs && !((w.expiredDocCount ?? 0) > 0 || (w.expiringSoonDocCount ?? 0) > 0)) return false;
    return true;
  });

  const statusOrder: Record<string, number> = { overdue: 0, in_progress: 1, scheduled: 2, completed: 3 };
  const sortedWOs = [...filtered].sort((a, b) => (statusOrder[a.status] ?? 5) - (statusOrder[b.status] ?? 5));

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
      toast({ title: 'Scan complete', description: 'Fields have been pre-filled — please verify before saving.' });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unable to scan document';
      toast({ title: 'Scan failed', description: msg, variant: 'destructive' });
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
      toast({ title: "Document uploaded" });
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
        <p className="text-sm text-muted-foreground">Track work order lifecycle from creation to completion and certificate upload.</p>
        <div className="flex items-center gap-2">
          {isAdmin && (
            <Button size="sm" variant="outline" onClick={() => setShowExportDialog(true)}>
              <FileDown className="h-4 w-4 mr-1" />Export All
            </Button>
          )}
          <Button size="sm" onClick={() => { setWoForm(emptyWOForm()); setShowCreate(true); }}>
            <Plus className="h-4 w-4 mr-1" />New Work Order
          </Button>
        </div>
      </div>

      {/* Filters */}
      <GlassCard className="p-3">
        <div className="flex flex-wrap gap-2 items-end">
          <div className="flex items-center gap-1 text-xs text-muted-foreground font-medium">
            <Filter className="h-3 w-3" />Filters:
          </div>
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="h-8 w-36 text-xs"><SelectValue placeholder="All statuses" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              {WO_STATUSES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
              <SelectItem value="awaiting-cert">Awaiting Certificate</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filterAsset} onValueChange={setFilterAsset}>
            <SelectTrigger className="h-8 w-40 text-xs"><SelectValue placeholder="All assets" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Assets</SelectItem>
              {assets.map(a => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filterContractor || "all"} onValueChange={v => setFilterContractor(v === "all" ? "" : v)}>
            <SelectTrigger className="h-8 w-44 text-xs">
              <SelectValue placeholder="All contractors" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All contractors</SelectItem>
              {contractorOptions.map(opt => (
                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex items-center gap-1">
            <Input type="date" className="h-8 w-36 text-xs" value={filterDateFrom} onChange={e => setFilterDateFrom(e.target.value)} />
            <span className="text-xs text-muted-foreground">to</span>
            <Input type="date" className="h-8 w-36 text-xs" value={filterDateTo} onChange={e => setFilterDateTo(e.target.value)} />
          </div>
          <Button
            size="sm"
            variant={filterExpiringDocs ? "secondary" : "outline"}
            className={`h-8 text-xs gap-1 ${filterExpiringDocs ? "border-amber-400 bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-600" : ""}`}
            onClick={() => setFilterExpiringDocs(v => !v)}
          >
            <AlertTriangle className="h-3 w-3" />Expiring docs
          </Button>
          {(filterStatus !== "all" || filterAsset !== "all" || filterContractor || filterDateFrom || filterDateTo || filterExpiringDocs) && (
            <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => { setFilterStatus("all"); setFilterAsset("all"); setFilterContractor(""); setFilterDateFrom(""); setFilterDateTo(""); setFilterExpiringDocs(false); }}>
              <X className="h-3 w-3 mr-1" />Clear
            </Button>
          )}
        </div>
      </GlassCard>

      {/* Table */}
      {woLoading ? (
        <div className="text-center py-10 text-muted-foreground">Loading work orders…</div>
      ) : sortedWOs.length === 0 ? (
        <div className="text-center py-16">
          <ClipboardCheck className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="text-muted-foreground">{workOrders.length === 0 ? "No work orders yet. Create one to get started." : "No work orders match the current filters."}</p>
        </div>
      ) : (
        <div className="rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs text-muted-foreground">
              <tr>
                <th className="text-left px-3 py-2 font-medium">Title</th>
                <th className="text-left px-3 py-2 font-medium hidden md:table-cell">Asset</th>
                <th className="text-left px-3 py-2 font-medium">Status</th>
                <th className="text-left px-3 py-2 font-medium hidden sm:table-cell">Due</th>
                <th className="text-left px-3 py-2 font-medium hidden lg:table-cell">Contractor</th>
                <th className="text-left px-3 py-2 font-medium hidden xl:table-cell">Worker</th>
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
                      <span className="text-xs text-amber-600 flex items-center gap-1"><AlertTriangle className="h-3 w-3" />Certificate missing</span>
                    )}
                    {wo.status === "overdue" && wo.missingDocsAlertedAt && (
                      <span className="text-xs text-red-600 flex items-center gap-1"><AlertTriangle className="h-3 w-3" />No documents uploaded</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-muted-foreground hidden md:table-cell">{woScope(wo)}</td>
                  <td className="px-3 py-2.5"><WOStatusBadge status={wo.status} /></td>
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
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0" title="View work order" onClick={e => { e.stopPropagation(); openDetail(wo); }}>
                        <Eye className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground" title="Edit work order" onClick={e => { e.stopPropagation(); openEditWO(wo); }}>
                        <Edit className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground" title="Duplicate work order" disabled={duplicateWOMutation.isPending} onClick={e => { e.stopPropagation(); duplicateWOMutation.mutate(wo.id); }}>
                        <Copy className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive hover:text-destructive" title="Delete work order" disabled={deleteWOMutation.isPending} onClick={e => { e.stopPropagation(); if (confirm("Delete this work order and all its documents?")) deleteWOMutation.mutate(wo.id); }}>
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
                ? <><Building2 className="h-4 w-4 text-blue-600" />Contractor Company</>
                : <><User className="h-4 w-4 text-indigo-600" />Worker Details</>
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
                    <div className="text-xs text-muted-foreground pt-1 border-t">Industry: {detailCompany.industry}</div>
                  )}
                  {detailCompany.status && (
                    <Badge variant={detailCompany.status === 'approved' ? 'default' : 'secondary'} className="text-xs capitalize">{detailCompany.status}</Badge>
                  )}
                </>
              ) : (
                <p className="text-muted-foreground text-xs">No additional details available — contractor may have been entered manually.</p>
              )}
            </div>
          )}

          {contractorDetailTarget?.type === 'worker' && (
            <div className="space-y-3 text-sm">
              {isDetailWorkerLoading ? (
                <div className="text-muted-foreground animate-pulse">Loading worker details…</div>
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
                        <span className="text-muted-foreground">CSCS Card</span>
                        <span className="font-medium">{detailWorker.cscsCard}</span>
                      </div>
                    )}
                    {detailWorker.cscsStatus && (
                      <div className="flex justify-between text-xs">
                        <span className="text-muted-foreground">CSCS Status</span>
                        <Badge variant={detailWorker.cscsStatus === 'valid' ? 'default' : 'secondary'} className="text-xs capitalize h-4">{detailWorker.cscsStatus}</Badge>
                      </div>
                    )}
                    {detailWorker.rightToWork && (
                      <div className="flex justify-between text-xs">
                        <span className="text-muted-foreground">Right to Work</span>
                        <Badge variant={detailWorker.rightToWork === 'verified' ? 'default' : 'secondary'} className="text-xs capitalize h-4">{detailWorker.rightToWork}</Badge>
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <p className="text-muted-foreground text-xs">Worker details not found — they may have been entered manually.</p>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Export All Dialog */}
      <Dialog open={showExportDialog} onOpenChange={setShowExportDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Export Work Order Report</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">Choose an optional date range and status filter to include in the report. Leave blank to export all work orders.</p>
            <div className="space-y-2">
              <Label className="text-xs font-medium">Status</Label>
              <Select value={exportStatus} onValueChange={setExportStatus}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder="All statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  {WO_STATUSES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-medium">Due Date Range</Label>
              <div className="flex items-center gap-2">
                <Input type="date" className="h-9 text-sm flex-1" value={exportDateFrom} onChange={e => setExportDateFrom(e.target.value)} />
                <span className="text-xs text-muted-foreground">to</span>
                <Input type="date" className="h-9 text-sm flex-1" value={exportDateTo} onChange={e => setExportDateTo(e.target.value)} />
              </div>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => setShowExportDialog(false)}>Cancel</Button>
            <Button size="sm" onClick={handleExportAll}>
              <FileDown className="h-4 w-4 mr-1" />Export PDF
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Work Order Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>New Work Order</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Title *</Label>
              <Input value={woForm.title} onChange={e => setWoForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. Annual boiler service" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <Label>Scope</Label>
                <Select value={woForm.scope} onValueChange={v => setWoForm(f => ({ ...f, scope: v as "single-asset" | "group", assetId: "", groupId: "" }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="single-asset">Single Asset</SelectItem>
                    <SelectItem value="group">Asset Group (full system service)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {woForm.scope === "group" ? (
                <div className="col-span-2">
                  <Label>Asset Group</Label>
                  <Select value={woForm.groupId || "_none"} onValueChange={v => setWoForm(f => ({ ...f, groupId: v === "_none" ? "" : v }))}>
                    <SelectTrigger><SelectValue placeholder="Select asset group" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_none">— None —</SelectItem>
                      {groups.map(g => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              ) : (
                <div>
                  <Label>Asset</Label>
                  <Select value={woForm.assetId || "_none"} onValueChange={v => setWoForm(f => ({ ...f, assetId: v === "_none" ? "" : v }))}>
                    <SelectTrigger><SelectValue placeholder="Select asset" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_none">— None —</SelectItem>
                      {assets.map(a => <SelectItem key={a.id} value={a.id}>{a.name}{a.assetRef ? ` (${a.assetRef})` : ""}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {woForm.scope === "single-asset" && (
                <div>
                  <Label>Schedule (optional)</Label>
                  <Select value={woForm.scheduleId || "_none"} onValueChange={v => setWoForm(f => ({ ...f, scheduleId: v === "_none" ? "" : v }))}>
                    <SelectTrigger><SelectValue placeholder="Link to schedule" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_none">— None —</SelectItem>
                      {schedules.map(s => <SelectItem key={s.id} value={s.id}>{s.title}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div>
                <Label>Due Date</Label>
                <Input type="date" value={woForm.dueDate} onChange={e => setWoForm(f => ({ ...f, dueDate: e.target.value }))} />
              </div>
              <div>
                <Label>Status</Label>
                <Select value={woForm.status} onValueChange={v => setWoForm(f => ({ ...f, status: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {WO_STATUSES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Description</Label>
              <Textarea value={woForm.description} onChange={e => setWoForm(f => ({ ...f, description: e.target.value }))} rows={2} placeholder="Scope of work…" />
            </div>
            <div>
              <Label>Notes</Label>
              <Textarea value={woForm.notes} onChange={e => setWoForm(f => ({ ...f, notes: e.target.value }))} rows={2} />
            </div>
            <div className="flex items-center gap-2">
              <input type="checkbox" id="reqCert" checked={woForm.requiresCertificate} onChange={e => setWoForm(f => ({ ...f, requiresCertificate: e.target.checked }))} className="h-4 w-4" />
              <Label htmlFor="reqCert" className="font-normal cursor-pointer">Requires service certificate upload</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button
              onClick={() => createWOMutation.mutate({
                ...woForm,
                assetId: woForm.scope === "single-asset" ? (woForm.assetId || null) : null,
                groupId: woForm.scope === "group" ? (woForm.groupId || null) : null,
                scheduleId: woForm.scheduleId || null,
              })}
              disabled={!woForm.title || createWOMutation.isPending}
            >
              {createWOMutation.isPending ? "Creating…" : "Create Work Order"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Work Order Dialog */}
      <Dialog open={showEditWO} onOpenChange={o => { setShowEditWO(o); if (!o) setEditingWO(null); }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Edit Work Order</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Title *</Label>
              <Input value={editWOForm.title} onChange={e => setEditWOForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. Annual boiler service" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <Label>Scope</Label>
                <Select value={editWOForm.scope} onValueChange={v => setEditWOForm(f => ({ ...f, scope: v as "single-asset" | "group", assetId: "", groupId: "" }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="single-asset">Single Asset</SelectItem>
                    <SelectItem value="group">Asset Group (full system service)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {editWOForm.scope === "group" ? (
                <div className="col-span-2">
                  <Label>Asset Group</Label>
                  <Select value={editWOForm.groupId || "_none"} onValueChange={v => setEditWOForm(f => ({ ...f, groupId: v === "_none" ? "" : v }))}>
                    <SelectTrigger><SelectValue placeholder="Select asset group" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_none">— None —</SelectItem>
                      {groups.map(g => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              ) : (
                <div>
                  <Label>Asset</Label>
                  <Select value={editWOForm.assetId || "_none"} onValueChange={v => setEditWOForm(f => ({ ...f, assetId: v === "_none" ? "" : v }))}>
                    <SelectTrigger><SelectValue placeholder="Select asset" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_none">— None —</SelectItem>
                      {assets.map(a => <SelectItem key={a.id} value={a.id}>{a.name}{a.assetRef ? ` (${a.assetRef})` : ""}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {editWOForm.scope === "single-asset" && (
                <div>
                  <Label>Schedule (optional)</Label>
                  <Select value={editWOForm.scheduleId || "_none"} onValueChange={v => setEditWOForm(f => ({ ...f, scheduleId: v === "_none" ? "" : v }))}>
                    <SelectTrigger><SelectValue placeholder="Link to schedule" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_none">— None —</SelectItem>
                      {schedules.map(s => <SelectItem key={s.id} value={s.id}>{s.title}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div>
                <Label>Due Date</Label>
                <Input type="date" value={editWOForm.dueDate} onChange={e => setEditWOForm(f => ({ ...f, dueDate: e.target.value }))} />
              </div>
              <div>
                <Label>Status</Label>
                <Select value={editWOForm.status} onValueChange={v => setEditWOForm(f => ({ ...f, status: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {WO_STATUSES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Description</Label>
              <Textarea value={editWOForm.description} onChange={e => setEditWOForm(f => ({ ...f, description: e.target.value }))} rows={2} placeholder="Scope of work…" />
            </div>
            <div>
              <Label>Notes</Label>
              <Textarea value={editWOForm.notes} onChange={e => setEditWOForm(f => ({ ...f, notes: e.target.value }))} rows={2} />
            </div>
            <div className="flex items-center gap-2">
              <input type="checkbox" id="editReqCert" checked={editWOForm.requiresCertificate} onChange={e => setEditWOForm(f => ({ ...f, requiresCertificate: e.target.checked }))} className="h-4 w-4" />
              <Label htmlFor="editReqCert" className="font-normal cursor-pointer">Requires service certificate upload</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowEditWO(false); setEditingWO(null); }}>Cancel</Button>
            <Button
              disabled={!editWOForm.title || updateWOMutation.isPending}
              onClick={() => editingWO && updateWOMutation.mutate({
                id: editingWO.id,
                data: {
                  ...editWOForm,
                  assetId: editWOForm.scope === "single-asset" ? (editWOForm.assetId || null) : null,
                  groupId: editWOForm.scope === "group" ? (editWOForm.groupId || null) : null,
                  scheduleId: editWOForm.scheduleId || null,
                }
              })}
            >
              {updateWOMutation.isPending ? "Saving…" : "Save Changes"}
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
                  <WOStatusBadge status={selectedWO.status} />
                  {hasCertAlert(selectedWO) && (
                    <span className="inline-flex items-center gap-1 text-xs text-amber-600 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
                      <AlertTriangle className="h-3 w-3" />Certificate missing
                    </span>
                  )}
                  {hasMissingDocsAlert(selectedWO, woDocs.length) && (
                    <span className="inline-flex items-center gap-1 text-xs text-red-600 bg-red-50 border border-red-200 px-2 py-0.5 rounded-full">
                      <AlertTriangle className="h-3 w-3" />No documents uploaded
                    </span>
                  )}
                  <a
                    href={`/api/ppm/work-orders/${selectedWO.id}/export`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-muted-foreground border border-border rounded-md px-2 py-0.5 hover:bg-muted transition-colors ml-auto"
                  >
                    <Download className="h-3 w-3" />
                    Export PDF
                  </a>
                </div>
              </SheetHeader>

              <div className="space-y-5">
                {/* Details */}
                <div className="space-y-2 text-sm">
                  {selectedWO.description && <p className="text-muted-foreground">{selectedWO.description}</p>}
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                    <span className="text-muted-foreground">{selectedWO.groupId ? "Asset Group" : "Asset"}</span>
                    <span>{selectedWO.groupId ? groupName(selectedWO.groupId) : assetName(selectedWO.assetId)}</span>
                    <span className="text-muted-foreground">Due Date</span><span>{fmtDate(selectedWO.dueDate)}</span>
                    <span className="text-muted-foreground">Completed</span><span>{fmtDate(selectedWO.completedDate)}</span>
                    {selectedWO.requiresCertificate && (
                      <>
                        <span className="text-muted-foreground">Certificate</span>
                        <span>{selectedWO.certificateUploadedAt ? `Uploaded ${fmtDate(selectedWO.certificateUploadedAt)}` : "Not yet uploaded"}</span>
                      </>
                    )}
                  </div>
                  {selectedWO.notes && <p className="text-xs text-muted-foreground italic border-l-2 pl-2">{selectedWO.notes}</p>}
                  {selectedWO.completionNotes && (
                    <div className="rounded bg-green-50 border border-green-200 p-2">
                      <p className="text-xs font-medium text-green-800">Completion Notes</p>
                      <p className="text-xs text-green-700 mt-1">{selectedWO.completionNotes}</p>
                    </div>
                  )}
                </div>

                {/* Change Status */}
                <div className="space-y-2 border-t pt-4">
                  <p className="text-sm font-semibold">Change Status</p>
                  <div className="flex flex-wrap gap-2">
                    {WO_STATUSES.map(s => (
                      <Button
                        key={s.value}
                        size="sm"
                        variant={selectedWO.status === s.value ? "default" : "outline"}
                        className="h-7 text-xs"
                        disabled={selectedWO.status === s.value || updateWOMutation.isPending}
                        onClick={() => updateWOMutation.mutate({ id: selectedWO.id, data: { status: s.value } })}
                      >
                        {s.label}
                      </Button>
                    ))}
                  </div>
                </div>

                {/* Assign Contractor */}
                <div className="space-y-2 border-t pt-4">
                  <p className="text-sm font-semibold flex items-center gap-1.5"><HardHat className="h-4 w-4" />Assign Contractor</p>
                  <div className="space-y-2">
                    <div>
                      <Label className="text-xs">Company</Label>
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
                        <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select company" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="_none">— None —</SelectItem>
                          {contractors.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    {assignForm.contractorCompanyId && (
                      <div>
                        <Label className="text-xs">Worker (optional)</Label>
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
                          <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select worker" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="_none">— Company only —</SelectItem>
                            {companyWorkers.map(w => <SelectItem key={w.id} value={w.id}>{w.firstName} {w.lastName}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                    <div>
                      <Label className="text-xs">Notification Email</Label>
                      <Input
                        className="h-8 text-xs"
                        type="email"
                        placeholder="contractor@example.com"
                        value={assignForm.assignedEmail}
                        onChange={e => setAssignForm(f => ({ ...f, assignedEmail: e.target.value }))}
                      />
                    </div>
                    <Button
                      size="sm"
                      className="w-full"
                      disabled={!assignForm.contractorCompanyId || assignMutation.isPending}
                      onClick={() => assignMutation.mutate({ id: selectedWO.id, data: assignForm })}
                    >
                      <Mail className="h-3.5 w-3.5 mr-1.5" />
                      {assignMutation.isPending ? "Assigning…" : assignForm.assignedEmail ? "Assign & Notify" : "Assign (No Email)"}
                    </Button>
                    {contractorLink && (
                      <p className="text-xs text-muted-foreground">
                        Contractor link:{" "}
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
                </div>

                {/* Documents */}
                <div className="space-y-2 border-t pt-4">
                  <p className="text-sm font-semibold flex items-center gap-1.5"><FileText className="h-4 w-4" />Documents</p>
                  {hasMissingDocsAlert(selectedWO, woDocs.length) && (
                    <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2.5">
                      <AlertTriangle className="h-4 w-4 text-red-600 mt-0.5 shrink-0" />
                      <div>
                        <p className="text-xs font-semibold text-red-700">Action required: no documents uploaded</p>
                        <p className="text-xs text-red-600 mt-0.5">This work order is overdue and has no service reports, certificates, or photos. Please upload evidence of work carried out.</p>
                      </div>
                    </div>
                  )}
                  {woDocs.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No documents uploaded yet.</p>
                  ) : (
                    <div className="space-y-1">
                      {woDocs.map(doc => {
                        const todayStr = new Date().toLocaleDateString("en-CA");
                        const in30DaysStr = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toLocaleDateString("en-CA");
                        const isExpired = !!doc.expiryDate && doc.expiryDate <= todayStr;
                        const isExpiringSoon = !!doc.expiryDate && !isExpired && doc.expiryDate <= in30DaysStr;
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
                                <Badge className="bg-red-500 text-white text-xs shrink-0">Expired</Badge>
                              )}
                              {isExpiringSoon && (
                                <Badge className="bg-amber-500 text-white text-xs shrink-0">Expiring Soon</Badge>
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
                                    <p className="text-xs">{notifyOnDocumentExpiry ? "Send expiry alert email now" : "Expiry notifications are disabled in Settings"}</p>
                                  </TooltipContent>
                                </Tooltip>
                              )}
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-6 w-6 p-0 text-destructive hover:text-destructive"
                                onClick={() => { if (confirm("Delete this document?")) deleteDocMutation.mutate({ woId: selectedWO.id, docId: doc.id }); }}
                              >
                                <X className="h-3 w-3" />
                              </Button>
                            </div>
                          </div>
                          {(doc.expiryDate || doc.referenceNumber || doc.issuedBy) && (
                            <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-muted-foreground pl-5">
                              {doc.expiryDate && <span className={isExpired ? "text-red-600 dark:text-red-400 font-medium" : isExpiringSoon ? "text-amber-600 dark:text-amber-400 font-medium" : ""}>Expires: <span className={isExpired ? "text-red-700 dark:text-red-300" : isExpiringSoon ? "text-amber-700 dark:text-amber-300" : "text-foreground"}>{fmtDate(doc.expiryDate)}</span></span>}
                              {doc.referenceNumber && <span>Ref: <span className="text-foreground">{doc.referenceNumber}</span></span>}
                              {doc.issuedBy && <span>By: <span className="text-foreground">{doc.issuedBy}</span></span>}
                              {doc.expiryDate && (
                                doc.expiryAlertedAt
                                  ? <span className="flex items-center gap-1 text-green-700 dark:text-green-400"><Bell className="h-3 w-3" />Notified: <span className="text-green-800 dark:text-green-300 font-medium">{fmtDate(doc.expiryAlertedAt)}</span></span>
                                  : <span className="flex items-center gap-1 text-muted-foreground/70"><Bell className="h-3 w-3" />Pending notification</span>
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
                          <SelectItem value="certificate">Certificate</SelectItem>
                          <SelectItem value="report">Report</SelectItem>
                          <SelectItem value="photo">Photo</SelectItem>
                          <SelectItem value="other">Other</SelectItem>
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
                        {pendingDocFile ? "Change File" : "Choose File"}
                      </Button>
                      <input ref={fileInputRef} type="file" className="hidden" accept=".pdf,.jpg,.jpeg,.png,.doc,.docx" onChange={handleDocFileSelect} />
                    </div>
                    {pendingDocFile && (
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-xs text-muted-foreground truncate flex-1 min-w-0">
                            Selected: <span className="font-medium text-foreground">{pendingDocFile.name}</span>
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
                                <><RefreshCw className="h-3.5 w-3.5 mr-1 animate-spin" />Scanning…</>
                              ) : (
                                <><Sparkles className="h-3.5 w-3.5 mr-1" />Scan with AI</>
                              )}
                            </Button>
                          )}
                        </div>
                        <div className="grid grid-cols-1 gap-1.5">
                          <div>
                            <Label className="text-xs text-muted-foreground">Expiry Date (optional)</Label>
                            <Input
                              type="date"
                              value={docExpiryDate}
                              onChange={e => setDocExpiryDate(e.target.value)}
                              className="h-7 text-xs"
                              disabled={uploadingDoc}
                            />
                          </div>
                          <div>
                            <Label className="text-xs text-muted-foreground">Reference / Document No. (optional)</Label>
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
                            <Label className="text-xs text-muted-foreground">Issued By (optional)</Label>
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
                            AI-extracted — please verify the fields above before saving.
                          </div>
                        )}
                        <Button
                          size="sm"
                          className="h-8 text-xs w-full"
                          disabled={uploadingDoc || isScanningDoc}
                          onClick={handleDocUpload}
                        >
                          {uploadingDoc ? <><RefreshCw className="h-3.5 w-3.5 mr-1 animate-spin" />Uploading…</> : <><Upload className="h-3.5 w-3.5 mr-1" />Upload Document</>}
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
                    onClick={() => { if (confirm("Delete this work order and all its documents?")) deleteWOMutation.mutate(selectedWO.id); }}
                  >
                    <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                    {deleteWOMutation.isPending ? "Deleting…" : "Delete Work Order"}
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
  const [activeTab, setActiveTab] = useState("assets");
  const [woStatusFilter, setWoStatusFilter] = useState<string | undefined>(undefined);

  function handleSummaryClick(filter?: string) {
    setWoStatusFilter(filter);
    setActiveTab("work-orders");
  }

  const { data: assets = [] } = useQuery<PpmAsset[]>({ queryKey: ["/api/ppm/assets"] });
  const { data: templates = [] } = useQuery<PpmTemplate[]>({ queryKey: ["/api/ppm/templates"] });
  const isEmpty = assets.length === 0 && templates.length === 0;

  const demoDataMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/ppm/demo-data").then(r => r.json()),
    onSuccess: (result: { assetsCreated: number; templatesCreated: number; message: string }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/ppm/assets"] });
      queryClient.invalidateQueries({ queryKey: ["/api/ppm/templates"] });
      queryClient.invalidateQueries({ queryKey: ["/api/ppm/schedules"] });
      queryClient.invalidateQueries({ queryKey: ["/api/ppm/work-orders"] });
      setActiveTab("assets");
      toast({
        title: "Demo data loaded",
        description: result.message,
      });
    },
    onError: (error: unknown) => toastError(error, toast),
  });

  function handleLoadDemo() {
    if (!isEmpty && !confirm("Demo data will be added alongside your existing data. Continue?")) return;
    demoDataMutation.mutate();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10">
            <Wrench className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Planned Preventative Maintenance</h1>
            <p className="text-sm text-muted-foreground">Manage assets, maintenance templates, schedules and work orders.</p>
          </div>
        </div>
        <Button
          variant={isEmpty ? "default" : "outline"}
          size="sm"
          onClick={handleLoadDemo}
          disabled={demoDataMutation.isPending}
          className={`shrink-0 gap-1.5 ${isEmpty ? "animate-pulse" : ""}`}
        >
          <Sparkles className="h-4 w-4" />
          {demoDataMutation.isPending ? "Loading…" : "Load Demo Data"}
        </Button>
      </div>

      <DashboardSummary onWorkOrdersClick={handleSummaryClick} />

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="assets" className="flex items-center gap-1.5">
            <Building2 className="h-4 w-4" />Assets
          </TabsTrigger>
          <TabsTrigger value="templates" className="flex items-center gap-1.5">
            <ClipboardList className="h-4 w-4" />Templates
          </TabsTrigger>
          <TabsTrigger value="schedules" className="flex items-center gap-1.5">
            <CalendarClock className="h-4 w-4" />Schedules
          </TabsTrigger>
          <TabsTrigger value="work-orders" className="flex items-center gap-1.5">
            <ClipboardCheck className="h-4 w-4" />Work Orders
          </TabsTrigger>
        </TabsList>
        <TabsContent value="assets" className="mt-4"><AssetsTab /></TabsContent>
        <TabsContent value="templates" className="mt-4"><TemplatesTab /></TabsContent>
        <TabsContent value="schedules" className="mt-4"><SchedulesTab /></TabsContent>
        <TabsContent value="work-orders" className="mt-4">
          <WorkOrdersTab key={woStatusFilter ?? "none"} initialStatusFilter={woStatusFilter} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
