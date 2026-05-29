import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import GlassCard from "@/components/GlassCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  ClipboardCheck, Plus, Edit, Trash2, Eye, CheckCircle2, AlertTriangle,
  Clock, RefreshCw, ChevronUp, ChevronDown, X, LayoutDashboard,
  FileText, ListChecks, Target, TrendingUp, CalendarDays, User,
  MapPin, Flag, Filter, Camera, Upload, Link as LinkIcon, Shield, Download,
  Mail, Send, Copy, HelpCircle,
} from "lucide-react";
import { ObjectUploader } from "@/components/ObjectUploader";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

// ─── Types ───────────────────────────────────────────────────────────────────

interface AuditTemplate {
  id: string;
  name: string;
  description?: string | null;
  category: string;
  frequency: string;
  customDays?: number | null;
  estimatedMinutes?: number | null;
  passScore?: number | null;
  isActive: boolean;
  itemCount?: number;
}

interface AuditTemplateItem {
  id: string;
  question: string;
  category?: string | null;
  requiresPhoto: boolean;
  requiresNote: boolean;
  isCritical: boolean;
  sortOrder: number;
  _localId?: string;
}

interface AuditRecord {
  id: string;
  templateId?: string | null;
  templateName: string;
  category: string;
  title: string;
  conductedBy: string;
  conductedAt?: string | null;
  scheduledDate?: string | null;
  location?: string | null;
  status: string;
  overallScore?: number | null;
  passed?: boolean | null;
  summary?: string | null;
  accessToken?: string | null;
}

interface AuditRecordItem {
  id: string;
  question: string;
  isCritical: boolean;
  response?: string | null;
  note?: string | null;
  photoUrl?: string | null;
  photoFileName?: string | null;
  sortOrder: number;
}

interface AuditCorrectiveAction {
  id: string;
  auditId: string;
  auditItemId?: string | null;
  title: string;
  description?: string | null;
  priority: string;
  assignedTo?: string | null;
  assignedEmail?: string | null;
  dueDate?: string | null;
  status: string;
  closureNotes?: string | null;
  closureEvidenceUrl?: string | null;
  closedAt?: string | null;
  closedBy?: string | null;
}

interface AuditSummary {
  totalScheduled: number;
  overdueCount: number;
  completedThisMonth: number;
  openActions: number;
  overdueActions: number;
  passRate: number;
  recentAudits: AuditRecord[];
  upcomingAudits: AuditRecord[];
}

interface StaffMember {
  id: string;
  firstName: string;
  lastName: string;
  email?: string | null;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const CATEGORIES = ["safety","fire","environmental","vehicle","housekeeping","behavioural","custom"] as const;
const FREQUENCIES = ["daily","weekly","monthly","quarterly","annual","one-off"] as const;
const PRIORITIES = ["low","medium","high","critical"] as const;

const CATEGORY_LABELS: Record<string, string> = {
  safety: "Safety", fire: "Fire", environmental: "Environmental",
  vehicle: "Vehicle", housekeeping: "Housekeeping", behavioural: "Behavioural", custom: "Custom",
};

const CATEGORY_COLORS: Record<string, string> = {
  safety: "bg-blue-100 text-blue-800",
  fire: "bg-red-100 text-red-800",
  environmental: "bg-green-100 text-green-800",
  vehicle: "bg-purple-100 text-purple-800",
  housekeeping: "bg-amber-100 text-amber-800",
  behavioural: "bg-teal-100 text-teal-800",
  custom: "bg-gray-100 text-gray-800",
};

const STATUS_COLORS: Record<string, string> = {
  scheduled: "bg-blue-100 text-blue-800",
  in_progress: "bg-amber-100 text-amber-800",
  completed: "bg-green-100 text-green-800",
  overdue: "bg-red-100 text-red-800",
  cancelled: "bg-gray-100 text-gray-800",
};

const PRIORITY_COLORS: Record<string, string> = {
  low: "bg-blue-100 text-blue-800",
  medium: "bg-amber-100 text-amber-800",
  high: "bg-orange-100 text-orange-800",
  critical: "bg-red-100 text-red-800",
};

const STARTER_TEMPLATES: Record<string, { question: string; isCritical?: boolean }[]> = {
  safety: [
    { question: "Are fire exits clear and unobstructed?" },
    { question: "Are all walkways and corridors free from obstruction?" },
    { question: "Is PPE available and in good condition?", isCritical: true },
    { question: "Are hazardous materials stored correctly?" },
    { question: "Is first aid kit fully stocked and accessible?" },
    { question: "Are all machinery guards in place?", isCritical: true },
    { question: "Is adequate lighting in all work areas?" },
    { question: "Are all spills cleaned up promptly?" },
    { question: "Is signage in place and legible?" },
    { question: "Are all tools and equipment in good working order?" },
  ],
  fire: [
    { question: "Are all fire exits signed and unobstructed?", isCritical: true },
    { question: "Are fire extinguishers present, charged and in date?" },
    { question: "Are fire alarm call points visible and accessible?" },
    { question: "Is the fire evacuation plan displayed?" },
    { question: "Are fire doors self-closing and not wedged open?", isCritical: true },
    { question: "Is the fire log book up to date?" },
    { question: "Are escape route floor markings visible?" },
    { question: "Are emergency lighting units functional?" },
  ],
  vehicle: [
    { question: "Are tyres at correct pressure and within legal tread depth?" },
    { question: "Are all lights operational (headlights, indicators, brake lights)?" },
    { question: "Is the windscreen free from damage?" },
    { question: "Are mirrors clean and properly adjusted?" },
    { question: "Is the first aid kit present and stocked?" },
    { question: "Are warning triangles/breakdown kit present?" },
    { question: "Is the vehicle documentation in order?" },
    { question: "Are seatbelts present and working?" },
  ],
  housekeeping: [
    { question: "Are all work areas clean and tidy?" },
    { question: "Is waste disposed of correctly?" },
    { question: "Are storage areas organised and accessible?" },
    { question: "Are floors free from slip and trip hazards?" },
    { question: "Are toilets and welfare facilities clean?" },
    { question: "Is food stored and prepared hygienically?" },
    { question: "Are recycling bins in place and used correctly?" },
  ],
  environmental: [
    { question: "Are chemical storage areas clearly labelled?" },
    { question: "Are bund/spill containment areas in good condition?" },
    { question: "Is waste segregated correctly?" },
    { question: "Are drains protected from contamination?" },
    { question: "Are environmental permits displayed?" },
    { question: "Is noise monitored and within permitted levels?" },
  ],
  behavioural: [
    { question: "Is the worker wearing appropriate PPE?" },
    { question: "Is the worker following safe working procedures?" },
    { question: "Is the workstation/area arranged safely?" },
    { question: "Is the worker using equipment correctly?" },
    { question: "Is communication between workers clear and safe?" },
  ],
  custom: [],
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtDate(d?: string | null) {
  if (!d) return "—";
  try { return new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }); }
  catch { return d; }
}

function CatBadge({ cat }: { cat: string }) {
  return <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${CATEGORY_COLORS[cat] ?? CATEGORY_COLORS.custom}`}>{CATEGORY_LABELS[cat] ?? cat}</span>;
}

function StatBadge({ status }: { status: string }) {
  const label = status.replace("_", " ").replace(/\b\w/g, c => c.toUpperCase());
  return <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[status] ?? "bg-gray-100 text-gray-800"}`}>{label}</span>;
}

function PriBadge({ priority }: { priority: string }) {
  const label = priority.charAt(0).toUpperCase() + priority.slice(1);
  return <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${PRIORITY_COLORS[priority] ?? "bg-gray-100 text-gray-800"}`}>{label}</span>;
}

// ─── Checklist Builder ────────────────────────────────────────────────────────

interface ChecklistBuilderProps {
  items: (Omit<AuditTemplateItem, "id"> & { _localId: string })[];
  onChange: (items: (Omit<AuditTemplateItem, "id"> & { _localId: string })[]) => void;
}

function ChecklistBuilder({ items, onChange }: ChecklistBuilderProps) {
  function addItem() {
    onChange([...items, { _localId: crypto.randomUUID(), question: "", requiresPhoto: false, requiresNote: false, isCritical: false, sortOrder: items.length }]);
  }
  function removeItem(localId: string) { onChange(items.filter(i => i._localId !== localId)); }
  function updateItem(localId: string, patch: Partial<typeof items[0]>) {
    onChange(items.map(i => i._localId === localId ? { ...i, ...patch } : i));
  }
  function moveItem(localId: string, dir: -1 | 1) {
    const idx = items.findIndex(i => i._localId === localId);
    if (idx < 0) return;
    const next = idx + dir;
    if (next < 0 || next >= items.length) return;
    const arr = [...items];
    [arr[idx], arr[next]] = [arr[next], arr[idx]];
    onChange(arr);
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between mb-1">
        <Label className="text-sm font-medium">Checklist Items</Label>
        <Button type="button" variant="outline" size="sm" onClick={addItem}>
          <Plus className="h-3.5 w-3.5 mr-1" />Add Item
        </Button>
      </div>
      {items.length === 0 && (
        <p className="text-xs text-slate-400 italic text-center py-4">No items yet. Click "Add Item" or load a starter template.</p>
      )}
      {items.map((item, idx) => (
        <div key={item._localId} className={`border rounded-lg p-3 space-y-2 bg-white/50 ${item.isCritical ? "border-l-4 border-l-amber-400" : ""}`}>
          <div className="flex gap-2 items-start">
            <div className="flex flex-col gap-0.5 pt-1">
              <button type="button" disabled={idx === 0} onClick={() => moveItem(item._localId, -1)} className="text-slate-400 hover:text-slate-600 disabled:opacity-30"><ChevronUp className="h-3.5 w-3.5" /></button>
              <button type="button" disabled={idx === items.length - 1} onClick={() => moveItem(item._localId, 1)} className="text-slate-400 hover:text-slate-600 disabled:opacity-30"><ChevronDown className="h-3.5 w-3.5" /></button>
            </div>
            <Input
              value={item.question}
              onChange={e => updateItem(item._localId, { question: e.target.value })}
              placeholder="Enter inspection question or check…"
              className="flex-1 text-sm"
            />
            <button type="button" onClick={() => removeItem(item._localId)} className="text-slate-400 hover:text-red-500 mt-1"><X className="h-4 w-4" /></button>
          </div>
          <div className="flex flex-wrap gap-2 ml-8">
            <Toggle active={item.requiresPhoto} onClick={() => updateItem(item._localId, { requiresPhoto: !item.requiresPhoto })} label="Photo" />
            <Toggle active={item.requiresNote} onClick={() => updateItem(item._localId, { requiresNote: !item.requiresNote })} label="Note" />
            <Toggle active={item.isCritical} onClick={() => updateItem(item._localId, { isCritical: !item.isCritical })} label="Critical" danger />
          </div>
        </div>
      ))}
    </div>
  );
}

function Toggle({ active, onClick, label, danger }: { active: boolean; onClick: () => void; label: string; danger?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium border transition-colors ${
        active
          ? danger ? "bg-red-100 border-red-300 text-red-700" : "bg-blue-100 border-blue-300 text-blue-700"
          : "bg-white border-slate-200 text-slate-500 hover:border-slate-300"
      }`}
    >
      {active && <CheckCircle2 className="h-3 w-3" />}
      {label}
    </button>
  );
}

// ─── Template Dialog ──────────────────────────────────────────────────────────

function TemplateDialog({
  open, onClose, existing, onSaved,
}: {
  open: boolean;
  onClose: () => void;
  existing?: AuditTemplate & { items?: AuditTemplateItem[] };
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [name, setName] = useState(existing?.name ?? "");
  const [category, setCategory] = useState(existing?.category ?? "safety");
  const [frequency, setFrequency] = useState(existing?.frequency ?? "monthly");
  const [estimatedMinutes, setEstimatedMinutes] = useState(String(existing?.estimatedMinutes ?? ""));
  const [passScore, setPassScore] = useState(String(existing?.passScore ?? "80"));
  const [description, setDescription] = useState(existing?.description ?? "");
  const [items, setItems] = useState<(Omit<AuditTemplateItem, "id"> & { _localId: string })[]>([]);

  useEffect(() => {
    if (open) {
      setName(existing?.name ?? "");
      setCategory(existing?.category ?? "safety");
      setFrequency(existing?.frequency ?? "monthly");
      setEstimatedMinutes(String(existing?.estimatedMinutes ?? ""));
      setPassScore(String(existing?.passScore ?? "80"));
      setDescription(existing?.description ?? "");
      setItems((existing?.items ?? []).map(i => ({ ...i, _localId: i.id ?? crypto.randomUUID() })));
    }
  }, [open, existing]);

  function loadStarter() {
    const starters = STARTER_TEMPLATES[category] ?? [];
    setItems(starters.map((s, idx) => ({
      _localId: crypto.randomUUID(),
      question: s.question,
      requiresPhoto: false,
      requiresNote: false,
      isCritical: !!s.isCritical,
      sortOrder: idx,
    })));
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      const body = {
        name, category, frequency, description: description || null,
        estimatedMinutes: estimatedMinutes ? Number(estimatedMinutes) : null,
        passScore: passScore ? Number(passScore) : 80,
        isActive: true,
        items: items.map(({ _localId, ...rest }, idx) => ({ ...rest, sortOrder: idx })),
      };
      if (existing) {
        return apiRequest("PUT", `/api/audits/templates/${existing.id}`, body);
      }
      return apiRequest("POST", "/api/audits/templates", body);
    },
    onSuccess: () => {
      toast({ title: existing ? "Template updated" : "Template created" });
      queryClient.invalidateQueries({ queryKey: ["/api/audits/templates"] });
      onSaved();
      onClose();
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{existing ? "Edit Template" : "Create Inspection Template"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <Label>Template Name *</Label>
              <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Monthly Safety Walk" />
            </div>
            <div>
              <Label>Category</Label>
              <div className="flex gap-2">
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger className="flex-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map(c => <SelectItem key={c} value={c}>{CATEGORY_LABELS[c]}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Button type="button" variant="outline" size="sm" onClick={loadStarter} className="whitespace-nowrap text-xs">
                  Load Starter
                </Button>
              </div>
            </div>
            <div>
              <Label>Frequency</Label>
              <Select value={frequency} onValueChange={setFrequency}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {FREQUENCIES.map(f => <SelectItem key={f} value={f}>{f.charAt(0).toUpperCase() + f.slice(1)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Estimated Duration (mins)</Label>
              <Input type="number" value={estimatedMinutes} onChange={e => setEstimatedMinutes(e.target.value)} placeholder="e.g. 45" />
            </div>
            <div>
              <Label>Pass Score %</Label>
              <Input type="number" min="0" max="100" value={passScore} onChange={e => setPassScore(e.target.value)} />
            </div>
            <div className="col-span-2">
              <Label>Description</Label>
              <Textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Optional description…" rows={2} />
            </div>
          </div>
          <ChecklistBuilder items={items} onChange={setItems} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => saveMutation.mutate()} disabled={!name.trim() || saveMutation.isPending}>
            {saveMutation.isPending ? <><RefreshCw className="h-4 w-4 mr-2 animate-spin" />Saving…</> : "Save Template"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Record Dialog ────────────────────────────────────────────────────────────

function RecordDialog({
  open, onClose, templates, currentUser,
}: {
  open: boolean;
  onClose: () => void;
  templates: AuditTemplate[];
  currentUser?: string;
}) {
  const { toast } = useToast();
  const [title, setTitle] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [conductedBy, setConductedBy] = useState(currentUser ?? "");
  const [conductedByManual, setConductedByManual] = useState(false);
  const [scheduledDate, setScheduledDate] = useState("");
  const [location, setLocation] = useState("");

  const { data: staffList = [] } = useQuery<StaffMember[]>({
    queryKey: ["/api/staff"],
    staleTime: 60000,
  });

  useEffect(() => {
    if (open) {
      setTitle(""); setTemplateId(""); setScheduledDate(""); setLocation("");
      setConductedBy(currentUser ?? "");
      setConductedByManual(false);
    }
  }, [open, currentUser]);

  function onTemplateChange(id: string) {
    setTemplateId(id);
    const t = templates.find(t => t.id === id);
    if (t && !title) setTitle(t.name);
  }

  function onConductedBySelect(val: string) {
    if (val === "__manual__") {
      setConductedByManual(true);
      setConductedBy("");
    } else {
      setConductedByManual(false);
      setConductedBy(val);
    }
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      const t = templates.find(t => t.id === templateId);
      return apiRequest("POST", "/api/audits/records", {
        templateId: templateId || null,
        templateName: t?.name ?? title,
        category: t?.category ?? "custom",
        title, conductedBy,
        scheduledDate: scheduledDate || null,
        location: location || null,
        status: "scheduled",
      });
    },
    onSuccess: () => {
      toast({ title: "Audit scheduled" });
      queryClient.invalidateQueries({ queryKey: ["/api/audits/records"] });
      queryClient.invalidateQueries({ queryKey: ["/api/audits/summary"] });
      onClose();
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const selectedStaffValue = conductedByManual ? "__manual__"
    : staffList.find(s => `${s.firstName} ${s.lastName}` === conductedBy) ? conductedBy : (conductedBy ? "__manual__" : "");

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Schedule New Audit</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Select Template</Label>
            <Select value={templateId} onValueChange={onTemplateChange}>
              <SelectTrigger><SelectValue placeholder="Choose a template…" /></SelectTrigger>
              <SelectContent>
                {templates.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Title *</Label>
            <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="Audit title…" />
          </div>
          <div>
            <Label>Conducted By</Label>
            {staffList.length > 0 ? (
              <>
                <Select value={selectedStaffValue} onValueChange={onConductedBySelect}>
                  <SelectTrigger><SelectValue placeholder="Select staff member…" /></SelectTrigger>
                  <SelectContent>
                    {staffList.map(s => (
                      <SelectItem key={s.id} value={`${s.firstName} ${s.lastName}`}>
                        {s.firstName} {s.lastName}
                      </SelectItem>
                    ))}
                    <SelectItem value="__manual__">Type manually…</SelectItem>
                  </SelectContent>
                </Select>
                {conductedByManual && (
                  <Input className="mt-2" value={conductedBy} onChange={e => setConductedBy(e.target.value)} placeholder="Enter name…" />
                )}
              </>
            ) : (
              <Input value={conductedBy} onChange={e => setConductedBy(e.target.value)} placeholder="Name of person conducting audit" />
            )}
          </div>
          <div>
            <Label>Scheduled Date</Label>
            <Input type="date" value={scheduledDate} onChange={e => setScheduledDate(e.target.value)} />
          </div>
          <div>
            <Label>Location</Label>
            <Input value={location} onChange={e => setLocation(e.target.value)} placeholder="Optional…" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => saveMutation.mutate()} disabled={!title.trim() || !conductedBy.trim() || saveMutation.isPending}>
            {saveMutation.isPending ? <><RefreshCw className="h-4 w-4 mr-2 animate-spin" />Scheduling…</> : "Schedule Audit"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Conduct Audit Dialog ─────────────────────────────────────────────────────

function ConductAuditDialog({
  open, onClose, record, onComplete,
}: {
  open: boolean;
  onClose: () => void;
  record: AuditRecord;
  onComplete: () => void;
}) {
  const { toast } = useToast();
  const [items, setItems] = useState<AuditRecordItem[]>([]);
  const [savingItem, setSavingItem] = useState<string | null>(null);
  const [localItems, setLocalItems] = useState<Record<string, Partial<AuditRecordItem>>>({});
  const [submitResult, setSubmitResult] = useState<{ overallScore: number; passed: boolean; passCount: number; failCount: number; naCount: number; items: AuditRecordItem[] } | null>(null);
  const [showCapa, setShowCapa] = useState<AuditRecordItem | null>(null);
  const [summary, setSummary] = useState("");
  const [started, setStarted] = useState(false);

  const startMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/audits/records/${record.id}/start`, {});
      return res.json();
    },
    onSuccess: (data: any) => {
      setItems(data.items ?? []);
      setStarted(true);
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  useEffect(() => {
    if (open) {
      setSubmitResult(null);
      setLocalItems({});
      setSummary("");
      if (record.status === 'in_progress') {
        apiRequest("GET", `/api/audits/records/${record.id}`).then(async (res: any) => {
          const d = await res.json();
          setItems(d.items ?? []);
          setStarted(true);
        }).catch(() => {});
      } else if (record.status === 'scheduled' || record.status === 'overdue') {
        startMutation.mutate();
      } else {
        apiRequest("GET", `/api/audits/records/${record.id}`).then(async (res: any) => {
          const d = await res.json();
          setItems(d.items ?? []);
          setStarted(true);
        }).catch(() => {});
      }
    }
  }, [open, record.id, record.status]);

  const mergedItems = items.map(item => ({ ...item, ...(localItems[item.id] ?? {}) }));
  const respondedCount = mergedItems.filter(i => i.response && i.response !== 'not_checked').length;
  const totalCount = mergedItems.length;
  const progress = totalCount > 0 ? Math.round((respondedCount / totalCount) * 100) : 0;
  const canSubmit = mergedItems.length > 0 && mergedItems.every(i => i.response && i.response !== 'not_checked');
  const isCompleted = record.status === 'completed' || !!submitResult;

  async function saveItem(itemId: string, patch: Partial<AuditRecordItem>) {
    setLocalItems(prev => ({ ...prev, [itemId]: { ...(prev[itemId] ?? {}), ...patch } }));
    setSavingItem(itemId);
    try {
      await apiRequest("PUT", `/api/audits/records/${record.id}/items/${itemId}`, patch);
    } catch {
      // item saved locally even if request fails
    } finally {
      setSavingItem(null);
    }
  }

  const submitMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/audits/records/${record.id}/submit`, { summary });
      return res.json();
    },
    onSuccess: (data: any) => {
      setSubmitResult(data);
      queryClient.invalidateQueries({ queryKey: ["/api/audits/records"] });
      queryClient.invalidateQueries({ queryKey: ["/api/audits/summary"] });
      queryClient.invalidateQueries({ queryKey: ["/api/audits/actions"] });
      if (data.autoActionsCreated > 0) {
        toast({ title: `${data.autoActionsCreated} corrective action${data.autoActionsCreated > 1 ? 's' : ''} created automatically`, description: "View them in the Actions tab." });
      }
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  if (!started && !isCompleted) {
    return (
      <Dialog open={open} onOpenChange={v => !v && onClose()}>
        <DialogContent className="max-w-lg">
          <div className="flex items-center justify-center py-12">
            <div className="text-center">
              <RefreshCw className="h-8 w-8 animate-spin text-blue-600 mx-auto mb-3" />
              <p className="text-slate-600">Starting audit…</p>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  if (submitResult) {
    const failedItems = items.filter(i => (localItems[i.id]?.response ?? i.response) === 'fail');
    return (
      <Dialog open={open} onOpenChange={v => !v && onClose()}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Audit Complete — Results</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className={`rounded-xl p-6 text-center ${submitResult.passed ? "bg-green-50 border border-green-200" : "bg-red-50 border border-red-200"}`}>
              <div className={`text-5xl font-bold mb-2 ${submitResult.passed ? "text-green-600" : "text-red-600"}`}>
                {submitResult.overallScore}%
              </div>
              <div className="text-lg font-semibold mb-3">
                {submitResult.passed ? <span className="text-green-700">✓ Audit Passed</span> : <span className="text-red-700">✗ Audit Failed</span>}
              </div>
              <div className="grid grid-cols-3 gap-3 text-sm">
                <div className="bg-white/70 rounded-lg p-3">
                  <div className="text-xl font-bold text-green-600">{submitResult.passCount}</div>
                  <div className="text-xs text-slate-500">Passed</div>
                </div>
                <div className="bg-white/70 rounded-lg p-3">
                  <div className="text-xl font-bold text-red-600">{submitResult.failCount}</div>
                  <div className="text-xs text-slate-500">Failed</div>
                </div>
                <div className="bg-white/70 rounded-lg p-3">
                  <div className="text-xl font-bold text-slate-500">{submitResult.naCount}</div>
                  <div className="text-xs text-slate-500">N/A</div>
                </div>
              </div>
            </div>
            {failedItems.length > 0 && (
              <div>
                <p className="text-sm font-semibold text-slate-700 mb-2">Failed Items</p>
                <div className="space-y-2">
                  {failedItems.map(item => (
                    <div key={item.id} className="flex items-center justify-between p-3 bg-red-50 rounded-lg border border-red-100">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          {item.isCritical && <Badge className="bg-amber-500 text-white text-xs">Critical</Badge>}
                          <span className="text-sm text-slate-800 truncate">{item.question}</span>
                        </div>
                        {(localItems[item.id]?.note ?? item.note) && (
                          <p className="text-xs text-slate-500">Note: {localItems[item.id]?.note ?? item.note}</p>
                        )}
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        className="ml-2 shrink-0 text-xs"
                        onClick={() => setShowCapa(item)}
                      >
                        <Flag className="h-3 w-3 mr-1" />Raise CAPA
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button onClick={() => { onComplete(); onClose(); }}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ClipboardCheck className="h-5 w-5 text-blue-600" />
            {record.title}
          </DialogTitle>
        </DialogHeader>

        {/* Progress */}
        <div className="space-y-1">
          <div className="flex justify-between text-xs text-slate-500">
            <span>{respondedCount} of {totalCount} items completed</span>
            <span>{progress}%</span>
          </div>
          <Progress value={progress} className="h-2" />
        </div>

        <div className="space-y-3">
          {mergedItems.map(item => {
            const resp = item.response;
            const isSaving = savingItem === item.id;
            return (
              <div key={item.id} className={`border rounded-lg p-4 space-y-3 bg-white/50 ${item.isCritical ? "border-l-4 border-l-amber-400" : ""}`}>
                <div className="flex items-start gap-2">
                  <div className="flex-1">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      {item.isCritical && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800">
                          <AlertTriangle className="h-3 w-3" />Critical
                        </span>
                      )}
                      {isSaving && (
                        <span className="text-xs text-slate-400 flex items-center gap-1">
                          <RefreshCw className="h-3 w-3 animate-spin" />Saving…
                        </span>
                      )}
                    </div>
                    <p className="text-sm font-medium text-slate-800">{item.question}</p>
                  </div>
                </div>

                {item.isCritical && resp === 'fail' && (
                  <div className="flex items-center gap-2 p-2 bg-red-50 border border-red-200 rounded">
                    <AlertTriangle className="h-4 w-4 text-red-500 shrink-0" />
                    <p className="text-xs text-red-700">Critical item — a fail here will override the overall result regardless of score.</p>
                  </div>
                )}

                <div className="flex gap-2">
                  {(['pass', 'fail', 'na'] as const).map(r => (
                    <button
                      key={r}
                      onClick={() => saveItem(item.id, { response: r })}
                      className={`flex-1 py-2 rounded-lg text-sm font-semibold border-2 transition-all ${
                        resp === r
                          ? r === 'pass' ? 'bg-green-500 border-green-500 text-white'
                            : r === 'fail' ? 'bg-red-500 border-red-500 text-white'
                            : 'bg-slate-500 border-slate-500 text-white'
                          : r === 'pass' ? 'border-green-300 text-green-700 hover:bg-green-50'
                            : r === 'fail' ? 'border-red-300 text-red-700 hover:bg-red-50'
                            : 'border-slate-300 text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      {r === 'pass' ? '✓ Pass' : r === 'fail' ? '✗ Fail' : 'N/A'}
                    </button>
                  ))}
                </div>

                {(resp === 'fail' || item.requiresNote) && (
                  <Textarea
                    placeholder={resp === 'fail' ? "Describe the issue found…" : "Add a note…"}
                    value={item.note ?? ""}
                    onChange={e => setLocalItems(prev => ({ ...prev, [item.id]: { ...(prev[item.id] ?? {}), note: e.target.value } }))}
                    onBlur={e => saveItem(item.id, { note: e.target.value })}
                    rows={2}
                    className="text-sm"
                  />
                )}

                {(resp === 'fail' || item.requiresPhoto) && (
                  <div>
                    <Label className="text-xs text-slate-500 mb-1 block">Photo Evidence</Label>
                    <ObjectUploader
                      onUpload={(url, name) => saveItem(item.id, { photoUrl: url, photoFileName: name })}
                      existingUrl={item.photoUrl ?? undefined}
                      existingName={item.photoFileName ?? undefined}
                      accept="image/*"
                    />
                  </div>
                )}
              </div>
            );
          })}

          <div>
            <Label className="text-sm">Inspector Notes (optional)</Label>
            <Textarea
              placeholder="Overall observations…"
              value={summary}
              onChange={e => setSummary(e.target.value)}
              rows={2}
              className="text-sm"
            />
          </div>
        </div>

        <DialogFooter className="flex-col gap-2">
          {!canSubmit && (
            <p className="text-xs text-slate-500 w-full text-center">Mark all {totalCount} items before submitting</p>
          )}
          <div className="flex gap-2 w-full">
            <Button variant="outline" onClick={onClose} className="flex-1">Close</Button>
            <Button
              onClick={() => submitMutation.mutate()}
              disabled={!canSubmit || submitMutation.isPending}
              className="flex-1 bg-blue-600 hover:bg-blue-700 text-white"
            >
              {submitMutation.isPending ? <><RefreshCw className="h-4 w-4 mr-2 animate-spin" />Submitting…</> : "Submit Audit"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Send Audit Link Dialog ───────────────────────────────────────────────────

function SendAuditLinkDialog({ open, onClose, record, onCopied }: {
  open: boolean; onClose: () => void; record: AuditRecord; onCopied?: () => void;
}) {
  const { toast } = useToast();
  const [staffId, setStaffId] = useState("");
  const [staffName, setStaffName] = useState("");
  const [staffEmail, setStaffEmail] = useState("");
  const [emailManual, setEmailManual] = useState(false);
  const [sending, setSending] = useState(false);
  const [copying, setCopying] = useState(false);

  const { data: staffList = [] } = useQuery<StaffMember[]>({
    queryKey: ["/api/staff"],
    staleTime: 60000,
  });

  useEffect(() => {
    if (open) { setStaffId(""); setStaffName(""); setStaffEmail(""); setEmailManual(false); }
  }, [open]);

  function onStaffSelect(val: string) {
    if (val === "__manual__") {
      setEmailManual(true);
      setStaffId(""); setStaffName(""); setStaffEmail("");
    } else {
      setEmailManual(false);
      setStaffId(val);
      const s = staffList.find(s => s.id === val);
      if (s) { setStaffName(`${s.firstName} ${s.lastName}`); setStaffEmail(s.email ?? ""); }
    }
  }

  async function handleCopyLink() {
    setCopying(true);
    try {
      const res = await apiRequest("GET", `/api/audits/records/${record.id}/token`);
      const data = await res.json();
      const link = `${window.location.origin}/audit/complete/${data.token}`;
      await navigator.clipboard.writeText(link);
      toast({ title: "Mobile link copied!", description: "Share this link with the inspector. Expires in 7 days." });
      onClose();
    } catch {
      toast({ title: "Error generating link", variant: "destructive" });
    } finally {
      setCopying(false);
    }
  }

  async function handleSendEmail() {
    if (!staffEmail) { toast({ title: "Email address required", variant: "destructive" }); return; }
    setSending(true);
    try {
      const res = await apiRequest("POST", `/api/audits/records/${record.id}/send-link`, { staffEmail, staffName });
      const data = await res.json();
      if (data.emailSent) {
        toast({ title: "Inspection link sent!", description: `Email sent to ${staffEmail}.` });
      } else {
        toast({ title: "Link generated (email may not have sent)", description: `Check email configuration. Link: ${data.link}`, variant: "destructive" });
      }
      onClose();
    } catch (err: any) {
      toast({ title: "Error sending link", description: err.message, variant: "destructive" });
    } finally {
      setSending(false);
    }
  }

  const selectedValue = emailManual ? "__manual__" : (staffId || "");

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5 text-blue-600" />
            Send Mobile Inspection Link
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <p className="text-sm text-slate-600 mb-3">
              <span className="font-semibold">{record.title}</span> — send this link so the inspector can complete the audit on their mobile device.
            </p>
          </div>
          <div className="space-y-2">
            <Label>Assign to Staff Member</Label>
            <Select value={selectedValue} onValueChange={onStaffSelect}>
              <SelectTrigger>
                <SelectValue placeholder="Select staff member…" />
              </SelectTrigger>
              <SelectContent>
                {staffList.map(s => (
                  <SelectItem key={s.id} value={s.id}>{s.firstName} {s.lastName}{s.email ? ` — ${s.email}` : ""}</SelectItem>
                ))}
                <SelectItem value="__manual__">Enter email manually…</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {emailManual && (
            <div className="space-y-2">
              <Label>Name (optional)</Label>
              <Input value={staffName} onChange={e => setStaffName(e.target.value)} placeholder="Inspector's name" />
              <Label>Email Address</Label>
              <Input type="email" value={staffEmail} onChange={e => setStaffEmail(e.target.value)} placeholder="inspector@company.com" />
            </div>
          )}
          {staffId && !emailManual && !staffEmail && (
            <p className="text-xs text-amber-600">This staff member has no email address on record. Use the copy link option instead.</p>
          )}
        </div>
        <DialogFooter className="flex-col gap-2 sm:flex-row">
          <Button variant="outline" className="flex-1" onClick={handleCopyLink} disabled={copying || sending}>
            {copying ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : <Copy className="h-4 w-4 mr-2" />}
            Copy Link Only
          </Button>
          <Button
            className="flex-1 bg-blue-600 hover:bg-blue-700 text-white"
            onClick={handleSendEmail}
            disabled={sending || copying || !staffEmail}
          >
            {sending ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
            Send by Email
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── CAPA Dialog ──────────────────────────────────────────────────────────────

function CapaDialog({ open, onClose, auditId, auditItemId, prefillTitle }: {
  open: boolean; onClose: () => void; auditId: string; auditItemId?: string; prefillTitle?: string;
}) {
  const { toast } = useToast();
  const [title, setTitle] = useState(prefillTitle ?? "");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("medium");
  const [assignedTo, setAssignedTo] = useState("");
  const [assignedEmail, setAssignedEmail] = useState("");
  const [assignedToManual, setAssignedToManual] = useState(false);
  const [dueDate, setDueDate] = useState("");

  const { data: staffList = [] } = useQuery<StaffMember[]>({
    queryKey: ["/api/staff"],
    staleTime: 60000,
  });

  useEffect(() => {
    if (open) {
      setTitle(prefillTitle ?? ""); setDescription(""); setPriority("medium");
      setAssignedTo(""); setAssignedEmail(""); setAssignedToManual(false); setDueDate("");
    }
  }, [open, prefillTitle]);

  function onAssignedToSelect(val: string) {
    if (val === "__manual__") {
      setAssignedToManual(true);
      setAssignedTo("");
      setAssignedEmail("");
    } else {
      setAssignedToManual(false);
      const staff = staffList.find(s => s.id === val);
      if (staff) {
        setAssignedTo(`${staff.firstName} ${staff.lastName}`);
        setAssignedEmail(staff.email ?? "");
      }
    }
  }

  const selectedAssigneeId = assignedToManual ? "__manual__"
    : staffList.find(s => `${s.firstName} ${s.lastName}` === assignedTo)?.id ?? (assignedTo ? "__manual__" : "");

  const saveMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/audits/records/${auditId}/actions`, {
      auditItemId: auditItemId || null, title, description: description || null,
      priority, assignedTo: assignedTo || null, assignedEmail: assignedEmail || null,
      dueDate: dueDate || null, status: "open",
    }),
    onSuccess: () => {
      toast({ title: "Corrective action created" });
      queryClient.invalidateQueries({ queryKey: ["/api/audits/actions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/audits/summary"] });
      onClose();
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Raise Corrective Action</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Title *</Label>
            <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="Action title…" />
          </div>
          <div>
            <Label>Description</Label>
            <Textarea value={description} onChange={e => setDescription(e.target.value)} rows={2} placeholder="Describe the corrective action required…" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Priority</Label>
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PRIORITIES.map(p => <SelectItem key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Due Date</Label>
              <Input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} />
            </div>
          </div>
          <div>
            <Label>Assigned To</Label>
            {staffList.length > 0 ? (
              <>
                <Select value={selectedAssigneeId} onValueChange={onAssignedToSelect}>
                  <SelectTrigger><SelectValue placeholder="Select staff member…" /></SelectTrigger>
                  <SelectContent>
                    {staffList.map(s => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.firstName} {s.lastName}
                      </SelectItem>
                    ))}
                    <SelectItem value="__manual__">Type manually…</SelectItem>
                  </SelectContent>
                </Select>
                {assignedToManual && (
                  <Input className="mt-2" value={assignedTo} onChange={e => setAssignedTo(e.target.value)} placeholder="Enter name…" />
                )}
              </>
            ) : (
              <Input value={assignedTo} onChange={e => setAssignedTo(e.target.value)} placeholder="Name…" />
            )}
          </div>
          <div>
            <Label>Assigned Email</Label>
            <Input type="email" value={assignedEmail} onChange={e => setAssignedEmail(e.target.value)} placeholder="email@example.com" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => saveMutation.mutate()} disabled={!title.trim() || saveMutation.isPending}>
            {saveMutation.isPending ? "Creating…" : "Create Action"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Close Action Dialog ──────────────────────────────────────────────────────

function CloseActionDialog({ open, onClose, action }: { open: boolean; onClose: () => void; action: AuditCorrectiveAction }) {
  const { toast } = useToast();
  const [closureNotes, setClosureNotes] = useState("");
  const [evidenceUrl, setEvidenceUrl] = useState<string | undefined>();
  const [evidenceFileName, setEvidenceFileName] = useState<string | undefined>();

  useEffect(() => { if (open) { setClosureNotes(""); setEvidenceUrl(undefined); setEvidenceFileName(undefined); } }, [open]);

  const closeMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/audits/actions/${action.id}/close`, {
      closureNotes, closureEvidenceUrl: evidenceUrl || null, closureEvidenceFileName: evidenceFileName || null,
    }),
    onSuccess: () => {
      toast({ title: "Action closed" });
      queryClient.invalidateQueries({ queryKey: ["/api/audits/actions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/audits/summary"] });
      onClose();
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Close Corrective Action</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div>
            <p className="text-sm text-slate-600 font-medium mb-1">{action.title}</p>
          </div>
          <div>
            <Label>Closure Notes *</Label>
            <Textarea value={closureNotes} onChange={e => setClosureNotes(e.target.value)} rows={3} placeholder="Describe what was done to resolve this action…" />
          </div>
          <div>
            <Label>Evidence (optional)</Label>
            <ObjectUploader
              onUpload={(url, name) => { setEvidenceUrl(url); setEvidenceFileName(name); }}
              existingUrl={evidenceUrl}
              existingName={evidenceFileName}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => closeMutation.mutate()} disabled={!closureNotes.trim() || closeMutation.isPending}>
            {closeMutation.isPending ? "Closing…" : "Close Action"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function Audits() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("overview");
  const [showTemplateDialog, setShowTemplateDialog] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<(AuditTemplate & { items?: AuditTemplateItem[] }) | null>(null);
  const [showRecordDialog, setShowRecordDialog] = useState(false);
  const [conductingRecord, setConductingRecord] = useState<AuditRecord | null>(null);
  const [sendLinkRecord, setSendLinkRecord] = useState<AuditRecord | null>(null);
  const [showCapaDialog, setShowCapaDialog] = useState(false);
  const [capaContext, setCapaContext] = useState<{ auditId: string; auditItemId?: string; title?: string } | null>(null);
  const [closingAction, setClosingAction] = useState<AuditCorrectiveAction | null>(null);
  const [statusFilter, setStatusFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [actionStatusFilter, setActionStatusFilter] = useState("all");
  const [actionPriorityFilter, setActionPriorityFilter] = useState("all");

  const { data: summary, isLoading: summaryLoading } = useQuery<AuditSummary>({
    queryKey: ["/api/audits/summary"],
    staleTime: 30000,
  });

  const { data: templates = [] } = useQuery<AuditTemplate[]>({
    queryKey: ["/api/audits/templates"],
    staleTime: 30000,
  });

  const { data: records = [], isLoading: recordsLoading } = useQuery<AuditRecord[]>({
    queryKey: ["/api/audits/records"],
    staleTime: 30000,
  });

  const { data: actions = [], isLoading: actionsLoading } = useQuery<AuditCorrectiveAction[]>({
    queryKey: ["/api/audits/actions"],
    staleTime: 30000,
  });

  const deleteTplMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/audits/templates/${id}`),
    onSuccess: () => { toast({ title: "Template deleted" }); queryClient.invalidateQueries({ queryKey: ["/api/audits/templates"] }); },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const seedUkTemplatesMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/audits/templates/seed", {}),
    onSuccess: (data: any) => {
      toast({ title: "UK Templates Loaded", description: data?.message ?? "Templates added successfully." });
      queryClient.invalidateQueries({ queryKey: ["/api/audits/templates"] });
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const deleteRecordMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/audits/records/${id}`),
    onSuccess: () => { toast({ title: "Audit deleted" }); queryClient.invalidateQueries({ queryKey: ["/api/audits/records"] }); queryClient.invalidateQueries({ queryKey: ["/api/audits/summary"] }); },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  async function editTemplate(tpl: AuditTemplate) {
    try {
      const data: any = await apiRequest("GET", `/api/audits/templates/${tpl.id}`);
      setEditingTemplate(data);
      setShowTemplateDialog(true);
    } catch { setEditingTemplate(tpl); setShowTemplateDialog(true); }
  }

  async function generateToken(record: AuditRecord) {
    try {
      const res = await apiRequest("GET", `/api/audits/records/${record.id}/token`);
      const data = await res.json();
      const link = `${window.location.origin}/audit/complete/${data.token}`;
      await navigator.clipboard.writeText(link);
      toast({ title: "Mobile link copied to clipboard", description: "Expires in 7 days." });
    } catch { toast({ title: "Error generating link", variant: "destructive" }); }
  }

  const filteredRecords = records.filter(r => {
    if (statusFilter !== "all" && r.status !== statusFilter) return false;
    if (categoryFilter !== "all" && r.category !== categoryFilter) return false;
    return true;
  });

  const filteredActions = actions.filter(a => {
    if (actionStatusFilter !== "all" && a.status !== actionStatusFilter) return false;
    if (actionPriorityFilter !== "all" && a.priority !== actionPriorityFilter) return false;
    return true;
  });

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-fixed flex items-center gap-2">
            <ClipboardCheck className="h-7 w-7 text-blue-600" />
            Audit & Inspection Engine
            <Tooltip>
              <TooltipTrigger asChild>
                <button className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors">
                  <HelpCircle size={18} />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right" className="max-w-xs text-xs leading-relaxed">
                Create audit templates with custom checklists, schedule inspections against those templates, record findings with photos and evidence, assign corrective actions, and track resolution — all in one place. Use the Overview tab to monitor completion rates and open actions at a glance.
              </TooltipContent>
            </Tooltip>
          </h1>
          <p className="text-sm text-variable mt-0.5">Schedule inspections, record findings, manage corrective actions</p>
        </div>
        <Button onClick={() => setShowRecordDialog(true)} className="bg-blue-600 hover:bg-blue-700 text-white">
          <Plus className="h-4 w-4 mr-2" />Schedule Audit
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="overview"><LayoutDashboard className="h-4 w-4 mr-1.5" />Overview</TabsTrigger>
          <TabsTrigger value="templates"><ListChecks className="h-4 w-4 mr-1.5" />Templates</TabsTrigger>
          <TabsTrigger value="records"><ClipboardCheck className="h-4 w-4 mr-1.5" />Audit Records</TabsTrigger>
          <TabsTrigger value="actions"><Flag className="h-4 w-4 mr-1.5" />Actions{actions.filter(a => a.status === 'open' || a.status === 'overdue').length > 0 && <Badge className="ml-1.5 bg-red-500 text-white text-xs">{actions.filter(a => a.status === 'open' || a.status === 'overdue').length}</Badge>}</TabsTrigger>
        </TabsList>

        {/* ── Tab 1: Overview ── */}
        <TabsContent value="overview" className="space-y-6">
          {summaryLoading ? (
            <div className="flex items-center justify-center py-12"><RefreshCw className="h-6 w-6 animate-spin text-blue-600" /></div>
          ) : (
            <>
              {/* Stats */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <GlassCard className="p-4 text-center">
                  <div className="text-3xl font-bold text-blue-600">{summary?.totalScheduled ?? 0}</div>
                  <div className="text-xs text-variable mt-1 flex items-center justify-center gap-1"><Clock className="h-3.5 w-3.5" />Scheduled</div>
                </GlassCard>
                <GlassCard className="p-4 text-center">
                  <div className={`text-3xl font-bold ${(summary?.overdueCount ?? 0) > 0 ? "text-red-600" : "text-slate-600"}`}>{summary?.overdueCount ?? 0}</div>
                  <div className="text-xs text-variable mt-1 flex items-center justify-center gap-1"><AlertTriangle className="h-3.5 w-3.5" />Overdue</div>
                </GlassCard>
                <GlassCard className="p-4 text-center">
                  <div className="text-3xl font-bold text-green-600">{summary?.completedThisMonth ?? 0}</div>
                  <div className="text-xs text-variable mt-1 flex items-center justify-center gap-1"><CheckCircle2 className="h-3.5 w-3.5" />Completed This Month</div>
                </GlassCard>
                <GlassCard className="p-4 text-center">
                  <div className={`text-3xl font-bold ${(summary?.openActions ?? 0) > 0 ? "text-amber-600" : "text-slate-600"}`}>{summary?.openActions ?? 0}</div>
                  <div className="text-xs text-variable mt-1 flex items-center justify-center gap-1"><Flag className="h-3.5 w-3.5" />Open Actions</div>
                </GlassCard>
              </div>

              {/* Pass rate */}
              <GlassCard className="p-5">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-semibold text-fixed flex items-center gap-2"><TrendingUp className="h-4 w-4 text-green-600" />Pass Rate (Last 90 Days)</span>
                  <span className={`text-2xl font-bold ${(summary?.passRate ?? 0) >= 80 ? "text-green-600" : (summary?.passRate ?? 0) >= 60 ? "text-amber-600" : "text-red-600"}`}>
                    {summary?.passRate ?? 0}%
                  </span>
                </div>
                <Progress value={summary?.passRate ?? 0} className="h-3" />
                <p className="text-xs text-variable mt-1">Percentage of completed audits that passed in the last 90 days</p>
              </GlassCard>

              {/* Upcoming + Open Actions */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <GlassCard className="p-4">
                  <h3 className="font-semibold text-fixed mb-3 flex items-center gap-2"><CalendarDays className="h-4 w-4 text-blue-600" />Upcoming Audits</h3>
                  {(summary?.upcomingAudits ?? []).length === 0 ? (
                    <p className="text-xs text-variable italic">No upcoming audits scheduled.</p>
                  ) : (
                    <div className="space-y-2">
                      {(summary?.upcomingAudits ?? []).slice(0, 5).map(r => (
                        <div key={r.id} className="flex items-center justify-between py-1.5 border-b border-white/20 last:border-0">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 mb-0.5">
                              <CatBadge cat={r.category} />
                              <span className="text-xs text-slate-500">{fmtDate(r.scheduledDate)}</span>
                            </div>
                            <p className="text-sm font-medium text-fixed truncate">{r.title}</p>
                          </div>
                          <StatBadge status={r.status} />
                        </div>
                      ))}
                    </div>
                  )}
                </GlassCard>

                <GlassCard className="p-4">
                  <h3 className="font-semibold text-fixed mb-3 flex items-center gap-2"><Flag className="h-4 w-4 text-amber-600" />Open Actions</h3>
                  {actions.filter(a => a.status === 'open' || a.status === 'overdue').length === 0 ? (
                    <p className="text-xs text-variable italic">No open corrective actions.</p>
                  ) : (
                    <div className="space-y-2">
                      {actions.filter(a => a.status === 'open' || a.status === 'overdue').slice(0, 5).map(a => (
                        <div key={a.id} className="flex items-center justify-between py-1.5 border-b border-white/20 last:border-0">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 mb-0.5">
                              <PriBadge priority={a.priority} />
                              {a.dueDate && <span className="text-xs text-slate-500">Due {fmtDate(a.dueDate)}</span>}
                            </div>
                            <p className="text-sm font-medium text-fixed truncate">{a.title}</p>
                            {a.assignedTo && <p className="text-xs text-slate-500">{a.assignedTo}</p>}
                          </div>
                          <StatBadge status={a.status} />
                        </div>
                      ))}
                    </div>
                  )}
                </GlassCard>
              </div>
            </>
          )}
        </TabsContent>

        {/* ── Tab 2: Templates ── */}
        <TabsContent value="templates" className="space-y-4">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <p className="text-sm text-variable">{templates.length} template{templates.length !== 1 ? "s" : ""}</p>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => seedUkTemplatesMutation.mutate()} disabled={seedUkTemplatesMutation.isPending}>
                <Download className="h-4 w-4 mr-2" />
                {seedUkTemplatesMutation.isPending ? "Loading…" : "Load UK Templates"}
              </Button>
              <Button onClick={() => { setEditingTemplate(null); setShowTemplateDialog(true); }}>
                <Plus className="h-4 w-4 mr-2" />New Template
              </Button>
            </div>
          </div>
          {templates.length === 0 ? (
            <GlassCard className="p-12 text-center">
              <ListChecks className="h-10 w-10 text-slate-300 mx-auto mb-3" />
              <p className="text-slate-500 font-medium">No templates yet</p>
              <p className="text-xs text-slate-400 mb-4">Load 10 ready-made UK inspection templates, or build your own from scratch.</p>
              <div className="flex gap-3 justify-center flex-wrap">
                <Button onClick={() => seedUkTemplatesMutation.mutate()} disabled={seedUkTemplatesMutation.isPending}>
                  <Download className="h-4 w-4 mr-2" />
                  {seedUkTemplatesMutation.isPending ? "Loading…" : "Load UK Templates"}
                </Button>
                <Button variant="outline" onClick={() => { setEditingTemplate(null); setShowTemplateDialog(true); }}>
                  <Plus className="h-4 w-4 mr-2" />Create Template
                </Button>
              </div>
            </GlassCard>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {templates.map(t => (
                <GlassCard key={t.id} className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-fixed truncate">{t.name}</p>
                      <CatBadge cat={t.category} />
                    </div>
                    <div className={`shrink-0 px-2 py-0.5 rounded-full text-xs font-medium ${t.isActive ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"}`}>
                      {t.isActive ? "Active" : "Inactive"}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs text-variable">
                    <div className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" />{t.frequency.charAt(0).toUpperCase() + t.frequency.slice(1)}</div>
                    {t.estimatedMinutes && <div className="flex items-center gap-1"><Target className="h-3.5 w-3.5" />{t.estimatedMinutes} mins</div>}
                    <div className="flex items-center gap-1"><ListChecks className="h-3.5 w-3.5" />{t.itemCount ?? 0} items</div>
                    <div className="flex items-center gap-1"><Shield className="h-3.5 w-3.5" />Pass: {t.passScore ?? 80}%</div>
                  </div>
                  {t.description && <p className="text-xs text-variable line-clamp-2">{t.description}</p>}
                  <div className="flex gap-2 pt-1">
                    <Button size="sm" variant="outline" className="flex-1" onClick={() => editTemplate(t)}>
                      <Edit className="h-3.5 w-3.5 mr-1" />Edit
                    </Button>
                    <Button size="sm" variant="outline" className="text-red-600 hover:bg-red-50" onClick={() => { if (confirm("Delete this template?")) deleteTplMutation.mutate(t.id); }}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </GlassCard>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ── Tab 3: Audit Records ── */}
        <TabsContent value="records" className="space-y-4">
          {/* Filters */}
          <div className="flex flex-wrap gap-3 items-center">
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-slate-500" />
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-36 h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="scheduled">Scheduled</SelectItem>
                  <SelectItem value="in_progress">In Progress</SelectItem>
                  <SelectItem value="overdue">Overdue</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                </SelectContent>
              </Select>
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger className="w-36 h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  {CATEGORIES.map(c => <SelectItem key={c} value={c}>{CATEGORY_LABELS[c]}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="ml-auto">
              <Button onClick={() => setShowRecordDialog(true)}>
                <Plus className="h-4 w-4 mr-2" />New Audit
              </Button>
            </div>
          </div>

          {recordsLoading ? (
            <div className="flex items-center justify-center py-12"><RefreshCw className="h-6 w-6 animate-spin text-blue-600" /></div>
          ) : filteredRecords.length === 0 ? (
            <GlassCard className="p-12 text-center">
              <ClipboardCheck className="h-10 w-10 text-slate-300 mx-auto mb-3" />
              <p className="text-slate-500 font-medium">No audit records</p>
              <p className="text-xs text-slate-400 mb-4">Schedule your first audit to get started.</p>
              <Button onClick={() => setShowRecordDialog(true)}><Plus className="h-4 w-4 mr-2" />Schedule Audit</Button>
            </GlassCard>
          ) : (
            <div className="space-y-3">
              {filteredRecords.map(r => (
                <GlassCard key={r.id} className="p-4">
                  <div className="flex flex-col md:flex-row md:items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <CatBadge cat={r.category} />
                        <StatBadge status={r.status} />
                        {r.status === 'completed' && r.overallScore !== null && r.overallScore !== undefined && (
                          <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${r.passed ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                            {r.overallScore}% {r.passed ? "Pass" : "Fail"}
                          </span>
                        )}
                      </div>
                      <p className="font-semibold text-fixed truncate">{r.title}</p>
                      <p className="text-xs text-variable">{r.templateName}</p>
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-variable mt-1">
                        {r.scheduledDate && <span className="flex items-center gap-1"><CalendarDays className="h-3 w-3" />{fmtDate(r.scheduledDate)}</span>}
                        {r.location && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{r.location}</span>}
                        {r.conductedBy && <span className="flex items-center gap-1"><User className="h-3 w-3" />{r.conductedBy}</span>}
                      </div>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      {(r.status === 'scheduled' || r.status === 'in_progress' || r.status === 'overdue') && (
                        <Button size="sm" onClick={() => setConductingRecord(r)}>
                          <ClipboardCheck className="h-3.5 w-3.5 mr-1" />Conduct
                        </Button>
                      )}
                      {r.status === 'completed' && (
                        <Button size="sm" variant="outline" onClick={() => setConductingRecord(r)}>
                          <Eye className="h-3.5 w-3.5 mr-1" />View
                        </Button>
                      )}
                      <Button size="sm" variant="outline" title="Send mobile link" onClick={() => setSendLinkRecord(r)}>
                        <Mail className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="sm" variant="outline" className="text-red-600 hover:bg-red-50" onClick={() => { if (confirm("Delete this audit record?")) deleteRecordMutation.mutate(r.id); }}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </GlassCard>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ── Tab 4: Actions ── */}
        <TabsContent value="actions" className="space-y-4">
          <div className="flex flex-wrap gap-3 items-center">
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-slate-500" />
              <Select value={actionStatusFilter} onValueChange={setActionStatusFilter}>
                <SelectTrigger className="w-36 h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="open">Open</SelectItem>
                  <SelectItem value="in_progress">In Progress</SelectItem>
                  <SelectItem value="overdue">Overdue</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                </SelectContent>
              </Select>
              <Select value={actionPriorityFilter} onValueChange={setActionPriorityFilter}>
                <SelectTrigger className="w-36 h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Priorities</SelectItem>
                  {PRIORITIES.map(p => <SelectItem key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="ml-auto">
              <Button onClick={() => {
                const firstRecord = records[0];
                if (!firstRecord) { toast({ title: "Create an audit record first", variant: "destructive" }); return; }
                setCapaContext({ auditId: firstRecord.id });
                setShowCapaDialog(true);
              }}>
                <Plus className="h-4 w-4 mr-2" />New Action
              </Button>
            </div>
          </div>

          {actionsLoading ? (
            <div className="flex items-center justify-center py-12"><RefreshCw className="h-6 w-6 animate-spin text-blue-600" /></div>
          ) : filteredActions.length === 0 ? (
            <GlassCard className="p-12 text-center">
              <Flag className="h-10 w-10 text-slate-300 mx-auto mb-3" />
              <p className="text-slate-500 font-medium">No corrective actions</p>
              <p className="text-xs text-slate-400">Actions are created from failed audit items.</p>
            </GlassCard>
          ) : (
            <div className="space-y-3">
              {filteredActions.map(a => (
                <GlassCard key={a.id} className="p-4">
                  <div className="flex flex-col md:flex-row md:items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <PriBadge priority={a.priority} />
                        <StatBadge status={a.status} />
                      </div>
                      <p className="font-semibold text-fixed">{a.title}</p>
                      {a.description && <p className="text-xs text-variable mt-0.5">{a.description}</p>}
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-variable mt-1">
                        {a.assignedTo && <span className="flex items-center gap-1"><User className="h-3 w-3" />{a.assignedTo}</span>}
                        {a.dueDate && <span className="flex items-center gap-1"><CalendarDays className="h-3 w-3" />Due {fmtDate(a.dueDate)}</span>}
                      </div>
                      {a.closureNotes && (
                        <p className="text-xs text-green-700 mt-1 italic">Closed: {a.closureNotes}</p>
                      )}
                    </div>
                    <div className="flex gap-2 shrink-0">
                      {(a.status === 'open' || a.status === 'in_progress' || a.status === 'overdue') && (
                        <Button size="sm" onClick={() => setClosingAction(a)}>
                          <CheckCircle2 className="h-3.5 w-3.5 mr-1" />Close Action
                        </Button>
                      )}
                    </div>
                  </div>
                </GlassCard>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Dialogs */}
      <TemplateDialog
        open={showTemplateDialog}
        onClose={() => { setShowTemplateDialog(false); setEditingTemplate(null); }}
        existing={editingTemplate ?? undefined}
        onSaved={() => {}}
      />

      <RecordDialog
        open={showRecordDialog}
        onClose={() => setShowRecordDialog(false)}
        templates={templates}
        currentUser={undefined}
      />

      {conductingRecord && (
        <ConductAuditDialog
          open={!!conductingRecord}
          onClose={() => setConductingRecord(null)}
          record={conductingRecord}
          onComplete={() => {
            queryClient.invalidateQueries({ queryKey: ["/api/audits/records"] });
            queryClient.invalidateQueries({ queryKey: ["/api/audits/summary"] });
          }}
        />
      )}

      {sendLinkRecord && (
        <SendAuditLinkDialog
          open={!!sendLinkRecord}
          onClose={() => setSendLinkRecord(null)}
          record={sendLinkRecord}
        />
      )}

      {showCapaDialog && capaContext && (
        <CapaDialog
          open={showCapaDialog}
          onClose={() => { setShowCapaDialog(false); setCapaContext(null); }}
          auditId={capaContext.auditId}
          auditItemId={capaContext.auditItemId}
          prefillTitle={capaContext.title}
        />
      )}

      {closingAction && (
        <CloseActionDialog
          open={!!closingAction}
          onClose={() => setClosingAction(null)}
          action={closingAction}
        />
      )}
    </div>
  );
}
