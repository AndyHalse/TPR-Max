import { useState, useEffect, useRef, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
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
import { useToast } from "@/hooks/use-toast";
import {
  Wrench, Plus, Edit, Trash2, Copy, Building2, ClipboardList, CalendarClock,
  CheckCircle2, AlertTriangle, Clock, Package, ShieldCheck, BookOpen,
  ClipboardCheck, UserCheck, FileUp, HardHat, FileText, Filter, X,
  Download, Upload, Mail, RefreshCw, Eye, Sparkles,
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

interface PpmAsset {
  id: string;
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
}

interface PpmWorkOrderDocument {
  id: string;
  workOrderId: string;
  fileName: string;
  fileUrl: string;
  fileType?: string | null;
  uploadedBy?: string | null;
  createdAt?: string | null;
}

interface ContractorCompany {
  id: string;
  name: string;
  email?: string | null;
  contactEmail?: string | null;
}

interface ContractorWorker {
  id: string;
  companyId: string;
  firstName: string;
  lastName: string;
  email?: string | null;
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
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<PpmAsset | null>(null);
  const emptyForm = () => ({
    name: "", assetRef: "", category: "", location: "", manufacturer: "",
    modelNumber: "", serialNumber: "", installDate: "", notes: "", status: "active",
  });
  const [form, setForm] = useState(emptyForm());

  const { data: assets = [], isLoading } = useQuery<PpmAsset[]>({ queryKey: ["/api/ppm/assets"] });

  const createMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => apiRequest("POST", "/api/ppm/assets", data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/ppm/assets"] }); setOpen(false); toast({ title: "Asset created" }); },
    onError: (error: unknown) => toastError(error, toast),
  });
  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) => apiRequest("PUT", `/api/ppm/assets/${id}`, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/ppm/assets"] }); setOpen(false); toast({ title: "Asset updated" }); },
    onError: (error: unknown) => toastError(error, toast),
  });
  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/ppm/assets/${id}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/ppm/assets"] }); toast({ title: "Asset deleted" }); },
    onError: (error: unknown) => toastError(error, toast),
  });
  const duplicateMutation = useMutation({
    mutationFn: (id: string) => apiRequest("POST", `/api/ppm/assets/${id}/duplicate`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/ppm/assets"] }); toast({ title: "Asset duplicated", description: "A copy has been added — update the name, ref, and serial number as needed." }); },
    onError: (error: unknown) => toastError(error, toast),
  });

  function openNew() { setEditing(null); setForm(emptyForm()); setOpen(true); }
  function openEdit(a: PpmAsset) {
    setEditing(a);
    setForm({ name: a.name, assetRef: a.assetRef ?? "", category: a.category ?? "", location: a.location ?? "",
      manufacturer: a.manufacturer ?? "", modelNumber: a.modelNumber ?? "", serialNumber: a.serialNumber ?? "",
      installDate: a.installDate ?? "", notes: a.notes ?? "", status: a.status });
    setOpen(true);
  }
  function handleSubmit() {
    if (editing) updateMutation.mutate({ id: editing.id, data: form });
    else createMutation.mutate(form);
  }
  const isBusy = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Register and track all physical assets that require maintenance.</p>
        <Button onClick={openNew} size="sm"><Plus className="h-4 w-4 mr-1" />Add Asset</Button>
      </div>

      {isLoading ? (
        <div className="text-center py-10 text-muted-foreground">Loading assets…</div>
      ) : assets.length === 0 ? (
        <div className="text-center py-16">
          <Package className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="text-muted-foreground">No assets yet. Add your first asset to get started.</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {assets.map(a => (
            <GlassCard key={a.id} className="p-4 space-y-2">
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
                <Button size="sm" variant="outline" className="h-7 text-xs" disabled={duplicateMutation.isPending} onClick={() => duplicateMutation.mutate(a.id)} title="Duplicate this asset">
                  <Copy className="h-3 w-3 mr-1" />Duplicate
                </Button>
                <Button size="sm" variant="ghost" className="h-7 text-xs text-destructive hover:text-destructive" onClick={() => { if (confirm("Delete this asset? Any associated schedules will also be deleted.")) deleteMutation.mutate(a.id); }}>
                  <Trash2 className="h-3 w-3 mr-1" />Delete
                </Button>
              </div>
            </GlassCard>
          ))}
        </div>
      )}

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

  // Filters
  const [filterStatus, setFilterStatus] = useState(initialStatusFilter || "all");
  const [filterAsset, setFilterAsset] = useState("all");
  const [filterContractor, setFilterContractor] = useState("");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");

  // Dialogs/sheets
  const [showCreate, setShowCreate] = useState(false);
  const [selectedWO, setSelectedWO] = useState<PpmWorkOrder | null>(null);
  const [contractorLink, setContractorLink] = useState<string | null>(null);
  const [showDetail, setShowDetail] = useState(false);

  // Create form
  const emptyWOForm = () => ({
    title: "", description: "", assetId: "", scheduleId: "", dueDate: "", notes: "",
    requiresCertificate: false, status: "scheduled",
  });
  const [woForm, setWoForm] = useState(emptyWOForm());

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

  // Data queries
  const { data: workOrders = [], isLoading: woLoading } = useQuery<PpmWorkOrder[]>({ queryKey: ["/api/ppm/work-orders"] });
  const { data: assets = [] } = useQuery<PpmAsset[]>({ queryKey: ["/api/ppm/assets"] });
  const { data: schedules = [] } = useQuery<PpmSchedule[]>({ queryKey: ["/api/ppm/schedules"] });
  const { data: contractors = [] } = useQuery<ContractorCompany[]>({ queryKey: ["/api/contractors"] });
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

  async function handleDocUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !selectedWO) return;
    setUploadingDoc(true);
    try {
      const b64 = await fileToBase64(file);
      const uploadRes = await apiRequest("POST", "/api/objects/upload", { data: b64, mimeType: file.type });
      const { objectPath } = await uploadRes.json();
      await apiRequest("POST", `/api/ppm/work-orders/${selectedWO.id}/documents`, {
        fileName: file.name, fileUrl: objectPath, fileType: docFileType, uploadedBy: "admin",
      });
      refetchDocs();
      if (docFileType === "certificate") {
        queryClient.invalidateQueries({ queryKey: ["/api/ppm/work-orders"] });
      }
      toast({ title: "Document uploaded" });
    } catch (err) {
      toastError(err, toast);
    } finally {
      setUploadingDoc(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  const assetName = (id?: string | null) => assets.find(a => a.id === id)?.name ?? "—";
  const hasCertAlert = (w: PpmWorkOrder) => w.status === "completed" && w.requiresCertificate && !w.certificateUploadedAt;
  const hasMissingDocsAlert = (w: PpmWorkOrder, docCount: number) => w.status === "overdue" && docCount === 0;

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">Track work order lifecycle from creation to completion and certificate upload.</p>
        <Button size="sm" onClick={() => { setWoForm(emptyWOForm()); setShowCreate(true); }}>
          <Plus className="h-4 w-4 mr-1" />New Work Order
        </Button>
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
            <Input type="date" className="h-8 w-32 text-xs" value={filterDateFrom} onChange={e => setFilterDateFrom(e.target.value)} />
            <span className="text-xs text-muted-foreground">to</span>
            <Input type="date" className="h-8 w-32 text-xs" value={filterDateTo} onChange={e => setFilterDateTo(e.target.value)} />
          </div>
          {(filterStatus !== "all" || filterAsset !== "all" || filterContractor || filterDateFrom || filterDateTo) && (
            <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => { setFilterStatus("all"); setFilterAsset("all"); setFilterContractor(""); setFilterDateFrom(""); setFilterDateTo(""); }}>
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
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {sortedWOs.map(wo => (
                <tr key={wo.id} className={`hover:bg-muted/30 cursor-pointer ${wo.status === "overdue" ? "bg-red-50/50 dark:bg-red-950/20" : ""}`} onClick={() => openDetail(wo)}>
                  <td className="px-3 py-2.5">
                    <div className="font-medium truncate max-w-[200px]">{wo.title}</div>
                    {hasCertAlert(wo) && (
                      <span className="text-xs text-amber-600 flex items-center gap-1"><AlertTriangle className="h-3 w-3" />Certificate missing</span>
                    )}
                    {wo.status === "overdue" && wo.missingDocsAlertedAt && (
                      <span className="text-xs text-red-600 flex items-center gap-1"><AlertTriangle className="h-3 w-3" />No documents uploaded</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-muted-foreground hidden md:table-cell">{assetName(wo.assetId)}</td>
                  <td className="px-3 py-2.5"><WOStatusBadge status={wo.status} /></td>
                  <td className="px-3 py-2.5 text-muted-foreground hidden sm:table-cell">{fmtDate(wo.dueDate)}</td>
                  <td className="px-3 py-2.5 text-muted-foreground hidden lg:table-cell truncate max-w-[150px]">
                    {wo.contractorWorkerName || wo.contractorCompanyName || "—"}
                  </td>
                  <td className="px-3 py-2.5">
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={e => { e.stopPropagation(); openDetail(wo); }}>
                      <Eye className="h-3.5 w-3.5" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

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
              <div>
                <Label>Asset</Label>
                <Select value={woForm.assetId || "_none"} onValueChange={v => setWoForm(f => ({ ...f, assetId: v === "_none" ? "" : v }))}>
                  <SelectTrigger><SelectValue placeholder="Select asset" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">— None —</SelectItem>
                    {assets.map(a => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
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
            <Button onClick={() => createWOMutation.mutate({ ...woForm, assetId: woForm.assetId || null, scheduleId: woForm.scheduleId || null })} disabled={!woForm.title || createWOMutation.isPending}>
              {createWOMutation.isPending ? "Creating…" : "Create Work Order"}
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
                </div>
              </SheetHeader>

              <div className="space-y-5">
                {/* Details */}
                <div className="space-y-2 text-sm">
                  {selectedWO.description && <p className="text-muted-foreground">{selectedWO.description}</p>}
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                    <span className="text-muted-foreground">Asset</span><span>{assetName(selectedWO.assetId)}</span>
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
                      {woDocs.map(doc => (
                        <div key={doc.id} className="flex items-center justify-between gap-2 rounded border px-2 py-1.5 text-xs">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                            <span className="truncate font-medium">{doc.fileName}</span>
                            {doc.fileType && doc.fileType !== "other" && (
                              <Badge variant="secondary" className="text-xs shrink-0">{doc.fileType}</Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <a href={doc.fileUrl} target="_blank" rel="noreferrer" className="text-primary hover:underline">
                              <Download className="h-3.5 w-3.5" />
                            </a>
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
                      ))}
                    </div>
                  )}
                  {/* Upload */}
                  <div className="flex items-center gap-2 pt-1">
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
                      disabled={uploadingDoc}
                      onClick={() => fileInputRef.current?.click()}
                    >
                      {uploadingDoc ? <RefreshCw className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Upload className="h-3.5 w-3.5 mr-1" />}
                      {uploadingDoc ? "Uploading…" : "Upload Document"}
                    </Button>
                    <input ref={fileInputRef} type="file" className="hidden" accept=".pdf,.jpg,.jpeg,.png,.doc,.docx" onChange={handleDocUpload} />
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
