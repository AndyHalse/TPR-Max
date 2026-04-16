import { useState } from "react";
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
import { useToast } from "@/hooks/use-toast";
import {
  Wrench, Plus, Edit, Trash2, Building2, ClipboardList, CalendarClock,
  CheckCircle2, AlertTriangle, Clock, Package, ShieldCheck, BookOpen
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

// ─── Constants ───────────────────────────────────────────────────────────────

const ASSET_CATEGORIES = [
  "HVAC", "Fire & Safety", "Electrical", "Plumbing", "Lifts & Hoists",
  "Roofing", "Security", "Gas", "Water Hygiene", "General",
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

// ─── Schedule Status Derivation ───────────────────────────────────────────────
// Classify a schedule for display purposes based on nextDueDate:
//   overdue   → nextDueDate < today
//   due_soon  → 0–7 days away
//   upcoming  → > 7 days away
// Completed/cancelled retain their persisted status.

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
    mutationFn: (data: any) => apiRequest("POST", "/api/ppm/assets", data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/ppm/assets"] }); setOpen(false); toast({ title: "Asset created" }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });
  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => apiRequest("PUT", `/api/ppm/assets/${id}`, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/ppm/assets"] }); setOpen(false); toast({ title: "Asset updated" }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });
  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/ppm/assets/${id}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/ppm/assets"] }); toast({ title: "Asset deleted" }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
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
    mutationFn: (data: any) => apiRequest("POST", "/api/ppm/templates", data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/ppm/templates"] }); setOpen(false); toast({ title: "Template created" }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });
  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => apiRequest("PUT", `/api/ppm/templates/${id}`, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/ppm/templates"] }); setOpen(false); toast({ title: "Template updated" }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });
  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/ppm/templates/${id}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/ppm/templates"] }); toast({ title: "Template deleted" }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
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
    mutationFn: (data: any) => apiRequest("POST", "/api/ppm/schedules", data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/ppm/schedules"] }); setOpen(false); toast({ title: "Schedule created" }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });
  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => apiRequest("PUT", `/api/ppm/schedules/${id}`, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/ppm/schedules"] }); setOpen(false); toast({ title: "Schedule updated" }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });
  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/ppm/schedules/${id}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/ppm/schedules"] }); toast({ title: "Schedule deleted" }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

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
    const payload: any = {
      ...form, templateId: form.templateId || null,
      customDays: form.customDays ? parseInt(form.customDays) : null,
      lastCompletedDate: form.lastCompletedDate || null,
      nextDueDate: form.nextDueDate || undefined,
    };
    if (editing) updateMutation.mutate({ id: editing.id, data: payload });
    else createMutation.mutate(payload);
  }
  const isBusy = createMutation.isPending || updateMutation.isPending;

  const assetName = (id: string) => assets.find(a => a.id === id)?.name ?? id;

  // Classify schedules for display
  const enriched = schedules.map(s => ({ ...s, derived: deriveStatus(s) }));
  const overdue = enriched.filter(s => s.derived === "overdue").length;
  const dueSoon = enriched.filter(s => s.derived === "due_soon").length;
  const upcoming = enriched.filter(s => s.derived === "upcoming").length;

  // Sort: overdue first, then due_soon, then upcoming, then completed/cancelled
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
                <Label>Next Due Date</Label>
                <Input type="date" value={form.nextDueDate} onChange={e => setForm(f => ({ ...f, nextDueDate: e.target.value }))} placeholder="Auto-calculated if left blank" />
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

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function PPM() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-primary/10">
          <Wrench className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Planned Preventative Maintenance</h1>
          <p className="text-sm text-muted-foreground">Manage assets, maintenance templates and schedules for your property.</p>
        </div>
      </div>

      <Tabs defaultValue="assets">
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
        </TabsList>
        <TabsContent value="assets" className="mt-4"><AssetsTab /></TabsContent>
        <TabsContent value="templates" className="mt-4"><TemplatesTab /></TabsContent>
        <TabsContent value="schedules" className="mt-4"><SchedulesTab /></TabsContent>
      </Tabs>
    </div>
  );
}
