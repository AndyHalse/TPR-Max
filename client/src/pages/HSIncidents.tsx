import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest, objectUrl, getSessionToken, getCsrfToken } from "@/lib/queryClient";
import GlassCard from "@/components/GlassCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { AlertTriangle, Plus, Trash2, ExternalLink, CheckCircle, AlertCircle, BarChart3, Edit, Search, Info, FileDown, ArrowRight, ThumbsUp, Zap, Camera, X as XIcon, ImageIcon } from "lucide-react";
import { EXTERNAL_LINKS } from "@/lib/externalLinks";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer } from "recharts";

interface HsIncident {
  id: string;
  title: string;
  description: string | null;
  incidentDate: string;
  location: string | null;
  reportedBy: string | null;
  injuredPerson: string | null;
  injuredPersonType: string | null;
  isNearMiss: boolean;
  nearMissPotential: string | null;
  nearMissHazardType: string | null;
  riddorCategory: string | null;
  riddorReportingDeadline: string | null;
  riddorReportedAt: string | null;
  riddorReference: string | null;
  riddorReminderSentAt: string | null;
  recordType: string;
  hazardType: string | null;
  resolved: boolean;
  resolvedBy: string | null;
  resolvedAt: string | null;
  resolutionNotes: string | null;
  resolutionReminderSentAt: string | null;
  investigationStatus: string;
  investigatedBy: string | null;
  investigationNotes: string | null;
  photoUrl: string | null;
  createdAt: string;
}

interface StaffMember { id: string; firstName: string; lastName: string; jobTitle?: string; }
interface ContractorWorker { id: string; firstName: string; lastName: string; companyName?: string; }
interface Visitor { id: string; firstName: string; lastName: string; company?: string; }

const RIDDOR_CATEGORIES = [
  { value: "fatality", label: "Fatality — Report IMMEDIATELY" },
  { value: "specified_injury", label: "Specified Injury (fracture, amputation, hospitalisation 24h+, loss of consciousness) — 10 days" },
  { value: "over_7_day", label: "Over-7-Day Incapacitation — 15 days" },
  { value: "dangerous_occurrence", label: "Dangerous Occurrence (near fatality, structural collapse, explosion) — 10 days" },
  { value: "occupational_disease", label: "Occupational Disease (when diagnosis confirmed)" },
  { value: "not_riddor_reportable", label: "Confirmed NOT RIDDOR reportable" },
];

const RIDDOR_LABELS: Record<string, string> = {
  fatality: "Fatality",
  specified_injury: "Specified Injury",
  over_7_day: "Over-7-Day Incapacitation",
  dangerous_occurrence: "Dangerous Occurrence",
  occupational_disease: "Occupational Disease",
  not_riddor_reportable: "Not RIDDOR Reportable",
};

const HAZARD_TYPES = [
  { value: "slip_trip_fall", label: "Slip, trip or fall" },
  { value: "struck_by_object", label: "Struck by object" },
  { value: "manual_handling", label: "Manual handling" },
  { value: "vehicle_plant", label: "Vehicle or plant" },
  { value: "working_at_height", label: "Working at height" },
  { value: "electrical", label: "Electrical" },
  { value: "fire_explosion", label: "Fire or explosion" },
  { value: "chemical_substance", label: "Chemical or substance" },
  { value: "machinery", label: "Machinery" },
  { value: "other", label: "Other" },
];

const NEAR_MISS_POTENTIALS = [
  { value: "minor", label: "Minor — First aid level injury" },
  { value: "serious", label: "Serious — Hospital treatment required" },
  { value: "critical", label: "Critical — Life-threatening or fatality" },
];

const RECORD_TYPES = [
  { value: "incident", label: "Incident", sublabel: "Something went wrong", color: "border-amber-400 bg-amber-50 dark:bg-amber-950 text-amber-900 dark:text-amber-100" },
  { value: "near_miss", label: "Near Miss", sublabel: "Nothing happened, but it could have", color: "border-blue-400 bg-blue-50 dark:bg-blue-950 text-blue-900 dark:text-blue-100" },
  { value: "good_spot", label: "Good Spot", sublabel: "I noticed a hazard and reported it", color: "border-green-400 bg-green-50 dark:bg-green-950 text-green-900 dark:text-green-100" },
  { value: "positive_action", label: "Positive Action", sublabel: "I noticed a hazard and dealt with it", color: "border-teal-400 bg-teal-50 dark:bg-teal-950 text-teal-900 dark:text-teal-100" },
];

function getDaysUntil(deadline: string): number {
  const diff = new Date(deadline).getTime() - Date.now();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

function RiddorBadge({ incident }: { incident: HsIncident }) {
  if (!incident.riddorCategory || incident.riddorCategory === "not_riddor_reportable") return null;
  if (incident.riddorReportedAt) {
    return <Badge className="bg-green-100 text-green-800 border-green-300">✅ Reported to HSE</Badge>;
  }
  if (!incident.riddorReportingDeadline) return null;
  const days = getDaysUntil(incident.riddorReportingDeadline);
  if (days <= 0) return <Badge className="bg-red-100 text-red-800 border-red-300">🔴 RIDDOR OVERDUE</Badge>;
  if (days <= 2) return <Badge className="bg-red-100 text-red-800 border-red-300">🔴 {days}d remaining</Badge>;
  if (days <= 5) return <Badge className="bg-amber-100 text-amber-800 border-amber-300">🟡 {days}d remaining</Badge>;
  return <Badge className="bg-blue-100 text-blue-800 border-blue-300">RIDDOR deadline: {days}d</Badge>;
}

function PersonCombobox({
  value,
  onChange,
  options,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { label: string; sublabel?: string }[];
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(value);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setQuery(value); }, [value]);

  const filtered = query.trim().length === 0
    ? options.slice(0, 12)
    : options.filter(o => o.label.toLowerCase().includes(query.toLowerCase())).slice(0, 12);

  function handleSelect(label: string) {
    onChange(label);
    setQuery(label);
    setOpen(false);
  }

  return (
    <div className="relative" ref={containerRef}>
      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
        <Input
          value={query}
          className="pl-8"
          placeholder={placeholder ?? "Search or type a name…"}
          onChange={e => { setQuery(e.target.value); onChange(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 160)}
        />
      </div>
      {open && filtered.length > 0 && (
        <div className="absolute z-50 w-full mt-1 bg-popover border rounded-md shadow-lg max-h-52 overflow-y-auto">
          {filtered.map((o, i) => (
            <button
              key={`${o.label}|||${o.sublabel ?? ""}|||${i}`}
              type="button"
              className="w-full text-left px-3 py-2 hover:bg-accent text-sm transition-colors"
              onMouseDown={() => handleSelect(o.label)}
            >
              <div className="font-medium">{o.label}</div>
              {o.sublabel && <div className="text-xs text-muted-foreground">{o.sublabel}</div>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const emptyForm = {
  title: "",
  description: "",
  incidentDate: new Date().toISOString().slice(0, 16),
  location: "",
  reportedBy: "",
  injuredPerson: "",
  injuredPersonType: "",
  recordType: "incident" as string,
  nearMissPotential: "",
  nearMissHazardType: "",
  hazardType: "",
  riddorCategory: "",
  resolutionNotes: "",
  investigationStatus: "open" as string,
  investigatedBy: "",
  investigationNotes: "",
  photoUrl: "" as string,
};

function personTypeLabel(v: string) {
  if (v === "staff" || v === "employee") return "Staff";
  if (v === "contractor") return "Contractor";
  if (v === "visitor") return "Visitor";
  if (v === "member_of_public") return "Member of public";
  return v;
}

export default function HSIncidents() {
  const { toast } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [reportingId, setReportingId] = useState<string | null>(null);
  const [hseReference, setHseReference] = useState("");
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [resolveForm, setResolveForm] = useState({ resolvedBy: "", resolutionNotes: "" });
  const [filterType, setFilterType] = useState<"all" | "incident" | "near_miss" | "good_spot" | "positive_action" | "riddor">("all");
  const [form, setForm] = useState({ ...emptyForm });
  const [showManagementView, setShowManagementView] = useState(false);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [photoFile, setPhotoFile] = useState<{ file: File; preview: string } | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);

  const { data: staffList = [] } = useQuery<StaffMember[]>({
    queryKey: ["/api/staff"],
    queryFn: () => apiRequest("GET", "/api/staff").then(r => r.json()),
  });
  const { data: contractorWorkers = [] } = useQuery<ContractorWorker[]>({
    queryKey: ["/api/contractors/workers/all"],
    queryFn: () => apiRequest("GET", "/api/contractors/workers/all").then(r => r.json()),
  });
  const { data: visitors = [] } = useQuery<Visitor[]>({
    queryKey: ["/api/visitors"],
    queryFn: () => apiRequest("GET", "/api/visitors").then(r => r.json()),
  });
  const { data: settings } = useQuery<any>({
    queryKey: ["/api/settings"],
    queryFn: () => apiRequest("GET", "/api/settings").then(r => r.json()),
  });
  const featureBbs: boolean = settings?.featureBbs ?? true;

  function deduplicateOptions(opts: { label: string; sublabel?: string }[]) {
    const seen = new Set<string>();
    return opts.filter(o => {
      const key = `${o.label}|||${o.sublabel ?? ""}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  const staffOptions = deduplicateOptions(staffList.map(s => ({ label: `${s.firstName} ${s.lastName}`, sublabel: s.jobTitle ? `Staff · ${s.jobTitle}` : "Staff" })));
  const contractorOptions = deduplicateOptions(contractorWorkers.map(w => ({ label: `${w.firstName} ${w.lastName}`, sublabel: w.companyName ? `Contractor · ${w.companyName}` : "Contractor" })));
  const visitorOptions = deduplicateOptions(visitors.map(v => ({ label: `${v.firstName} ${v.lastName}`, sublabel: v.company ? `Visitor · ${v.company}` : "Visitor" })));
  const reportedByOptions = deduplicateOptions([...staffList.map(s => ({ label: `${s.firstName} ${s.lastName}`, sublabel: s.jobTitle ? `Staff · ${s.jobTitle}` : "Staff" })), ...contractorWorkers.map(w => ({ label: `${w.firstName} ${w.lastName}`, sublabel: w.companyName ? `Contractor · ${w.companyName}` : "Contractor" }))]);

  function injuredPersonOptions() {
    const t = form.injuredPersonType;
    if (t === "staff" || t === "employee") return staffOptions;
    if (t === "contractor") return contractorOptions;
    if (t === "visitor") return visitorOptions;
    return [];
  }

  const { data: incidents = [], isLoading } = useQuery<HsIncident[]>({ queryKey: ["/api/hs-incidents"] });

  const createMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/hs-incidents", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/hs-incidents"] });
      setShowForm(false);
      setForm({ ...emptyForm });
      toast({ title: "Record saved successfully" });
    },
    onError: () => toast({ title: "Failed to save record", variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => apiRequest("PUT", `/api/hs-incidents/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/hs-incidents"] });
      setShowForm(false);
      setEditingId(null);
      setForm({ ...emptyForm });
      toast({ title: "Record updated" });
    },
    onError: () => toast({ title: "Failed to update record", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/hs-incidents/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/hs-incidents"] });
      setDeleteId(null);
      toast({ title: "Record deleted" });
    },
    onError: () => toast({ title: "Failed to delete", variant: "destructive" }),
  });

  const reportedMutation = useMutation({
    mutationFn: ({ id, reference }: { id: string; reference: string }) =>
      apiRequest("PATCH", `/api/hs-incidents/${id}/riddor-reported`, { reference }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/hs-incidents"] });
      setReportingId(null);
      setHseReference("");
      toast({ title: "Marked as reported to HSE" });
    },
    onError: () => toast({ title: "Failed to update", variant: "destructive" }),
  });

  const resolveMutation = useMutation({
    mutationFn: ({ id, ...data }: { id: string; resolvedBy: string; resolutionNotes: string }) =>
      apiRequest("PATCH", `/api/hs-incidents/${id}/resolve`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/hs-incidents"] });
      setResolvingId(null);
      setResolveForm({ resolvedBy: "", resolutionNotes: "" });
      toast({ title: "Marked as resolved — thank you for taking action!" });
    },
    onError: () => toast({ title: "Failed to resolve", variant: "destructive" }),
  });

  function handleEdit(incident: HsIncident) {
    const recordType = incident.recordType || (incident.isNearMiss ? "near_miss" : "incident");
    setForm({
      title: incident.title,
      description: incident.description || "",
      incidentDate: incident.incidentDate ? new Date(incident.incidentDate).toISOString().slice(0, 16) : "",
      location: incident.location || "",
      reportedBy: incident.reportedBy || "",
      injuredPerson: incident.injuredPerson || "",
      injuredPersonType: incident.injuredPersonType || "",
      recordType,
      nearMissPotential: incident.nearMissPotential || "",
      nearMissHazardType: incident.nearMissHazardType || "",
      hazardType: incident.hazardType || "",
      riddorCategory: incident.riddorCategory || "",
      resolutionNotes: incident.resolutionNotes || "",
      investigationStatus: incident.investigationStatus || "open",
      investigatedBy: incident.investigatedBy || "",
      investigationNotes: incident.investigationNotes || "",
    });
    setForm(f => ({ ...f, photoUrl: incident.photoUrl || "" }));
    setPhotoFile(null);
    setEditingId(incident.id);
    setShowForm(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const isNearMiss = form.recordType === "near_miss";
    const isBbs = form.recordType === "good_spot" || form.recordType === "positive_action";

    let photoUrl = form.photoUrl || null;
    if (photoFile) {
      setUploadingPhoto(true);
      try {
        const fd = new FormData();
        fd.append("photo", photoFile.file);
        const token = getSessionToken();
        const csrf = getCsrfToken();
        const headers: Record<string, string> = {};
        if (token) headers["Authorization"] = `Bearer ${token}`;
        if (csrf) headers["x-csrf-token"] = csrf;
        const uploadRes = await fetch("/api/hs-incidents/photo", {
          method: "POST",
          credentials: "include",
          headers,
          body: fd,
        });
        if (!uploadRes.ok) throw new Error("upload failed");
        const uploadData = await uploadRes.json();
        photoUrl = uploadData.url || null;
      } catch {
        toast({ title: "Photo upload failed", description: "The record will be saved without the photo.", variant: "destructive" });
      } finally {
        setUploadingPhoto(false);
      }
    }

    const payload = {
      ...form,
      photoUrl,
      isNearMiss,
      riddorCategory: isBbs ? null : (isNearMiss ? "not_riddor_reportable" : form.riddorCategory || null),
      nearMissPotential: isNearMiss ? form.nearMissPotential : null,
      nearMissHazardType: isNearMiss ? form.nearMissHazardType : null,
      hazardType: isBbs ? form.hazardType : null,
      injuredPerson: isBbs ? null : form.injuredPerson,
      injuredPersonType: isBbs ? null : form.injuredPersonType,
      investigationStatus: !isBbs ? (form.investigationStatus || "open") : undefined,
      investigatedBy: !isBbs ? (form.investigatedBy || null) : undefined,
      investigationNotes: !isBbs ? (form.investigationNotes || null) : undefined,
    };
    if (editingId) {
      updateMutation.mutate({ id: editingId, data: payload });
    } else {
      createMutation.mutate(payload);
    }
  }

  function handleRecordTypeChange(newType: string) {
    setForm(f => ({
      ...f,
      recordType: newType,
      nearMissPotential: "",
      nearMissHazardType: "",
      hazardType: "",
      riddorCategory: "",
      resolutionNotes: "",
    }));
  }

  // ── Analytics ───────────────────────────────────────────────────────────────
  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

  const recent = {
    incidents: incidents.filter(i => (i.recordType || (i.isNearMiss ? 'near_miss' : 'incident')) === 'incident' && new Date(i.incidentDate) > ninetyDaysAgo),
    nearMisses: incidents.filter(i => (i.recordType || (i.isNearMiss ? 'near_miss' : 'incident')) === 'near_miss' && new Date(i.incidentDate) > ninetyDaysAgo),
    goodSpots: incidents.filter(i => i.recordType === 'good_spot' && new Date(i.incidentDate) > ninetyDaysAgo),
    positiveActions: incidents.filter(i => i.recordType === 'positive_action' && new Date(i.incidentDate) > ninetyDaysAgo),
  };

  const positiveReports = recent.goodSpots.length + recent.positiveActions.length;
  const negativeReports = recent.incidents.length + recent.nearMisses.length;
  const engagementRatio = positiveReports / Math.max(1, negativeReports);

  const allBbsRecords = incidents.filter(i => i.recordType === 'good_spot' || i.recordType === 'positive_action');
  const resolvedBbs = allBbsRecords.filter(i => i.resolved);
  const resolutionRate = allBbsRecords.length > 0 ? Math.round((resolvedBbs.length / allBbsRecords.length) * 100) : 0;

  const openInvestigations = incidents.filter(i => {
    const rt = i.recordType || (i.isNearMiss ? 'near_miss' : 'incident');
    return (rt === 'incident' || rt === 'near_miss') && (!i.investigationStatus || i.investigationStatus === 'open');
  }).length;

  // Hazard breakdown across near_miss + good_spot + positive_action
  const hazardCounts: Record<string, number> = {};
  incidents.forEach(i => {
    const rt = i.recordType || (i.isNearMiss ? 'near_miss' : 'incident');
    if (rt === 'near_miss' && i.nearMissHazardType) hazardCounts[i.nearMissHazardType] = (hazardCounts[i.nearMissHazardType] || 0) + 1;
    if ((rt === 'good_spot' || rt === 'positive_action') && i.hazardType) hazardCounts[i.hazardType] = (hazardCounts[i.hazardType] || 0) + 1;
  });

  const showDashboard = incidents.length > 0;

  // Pyramid data (all-time)
  const pyramidData = {
    riddor: incidents.filter(i => {
      const rt = i.recordType || (i.isNearMiss ? 'near_miss' : 'incident');
      return rt === 'incident' && i.riddorCategory && i.riddorCategory !== 'not_riddor_reportable' && i.riddorCategory !== 'occupational_disease';
    }).length,
    incidents: incidents.filter(i => (i.recordType || (i.isNearMiss ? 'near_miss' : 'incident')) === 'incident').length,
    nearMisses: incidents.filter(i => (i.recordType || (i.isNearMiss ? 'near_miss' : 'incident')) === 'near_miss').length,
    goodSpots: incidents.filter(i => i.recordType === 'good_spot' || i.recordType === 'positive_action').length,
  };
  const pyramidMax = Math.max(pyramidData.goodSpots, pyramidData.nearMisses, pyramidData.incidents, 1);

  // 12-month monthly trend
  const monthlyTrend = (() => {
    const months: { month: string; positive: number; negative: number }[] = [];
    const now = new Date();
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const next = new Date(d.getFullYear(), d.getMonth() + 1, 1);
      const label = d.toLocaleDateString('en-GB', { month: 'short', year: '2-digit' });
      const inMonth = incidents.filter(inc => {
        const dt = new Date(inc.incidentDate);
        return dt >= d && dt < next;
      });
      const positive = inMonth.filter(inc => inc.recordType === 'good_spot' || inc.recordType === 'positive_action').length;
      const negative = inMonth.filter(inc => {
        const rt = inc.recordType || (inc.isNearMiss ? 'near_miss' : 'incident');
        return rt === 'incident' || rt === 'near_miss';
      }).length;
      months.push({ month: label, positive, negative });
    }
    return months;
  })();

  const pendingRiddor = incidents.filter(i => {
    const rt = i.recordType || (i.isNearMiss ? 'near_miss' : 'incident');
    return rt === 'incident' && i.riddorCategory && i.riddorCategory !== "not_riddor_reportable" && i.riddorCategory !== "occupational_disease" && !i.riddorReportedAt && i.riddorReportingDeadline;
  });

  const filtered = incidents.filter(i => {
    const rt = i.recordType || (i.isNearMiss ? 'near_miss' : 'incident');
    if (filterType === 'riddor') {
      if (!(rt === 'incident' && i.riddorCategory && i.riddorCategory !== 'not_riddor_reportable')) return false;
    } else if (filterType !== 'all') {
      if (rt !== filterType) return false;
    }
    const incDate = new Date(i.incidentDate);
    if (dateFrom && incDate < new Date(dateFrom + 'T00:00:00')) return false;
    if (dateTo && incDate > new Date(dateTo + 'T23:59:59')) return false;
    return true;
  });

  function handleDownloadPdf(id: string) {
    window.open(`/api/hs-incidents/${id}/pdf`, '_blank');
  }

  const submitLabel = () => {
    if (editingId) return "Save Changes";
    if (form.recordType === "near_miss") return "Record Near Miss";
    if (form.recordType === "good_spot") return "Record Good Spot";
    if (form.recordType === "positive_action") return "Record Positive Action";
    return "Record Incident";
  };

  function NextAction({ incident }: { incident: HsIncident }) {
    const rt = incident.recordType || (incident.isNearMiss ? 'near_miss' : 'incident');
    const days = incident.riddorReportingDeadline ? getDaysUntil(incident.riddorReportingDeadline) : null;

    if (rt === 'good_spot' || rt === 'positive_action') {
      if (incident.resolved) {
        return (
          <div className="mt-2 flex items-center gap-2 rounded-md bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 px-3 py-1.5 text-xs text-green-800 dark:text-green-200">
            <CheckCircle size={12} className="shrink-0" />
            <span>Resolved by <strong>{incident.resolvedBy || "N/A"}</strong>{incident.resolvedAt ? ` on ${new Date(incident.resolvedAt).toLocaleDateString("en-GB")}` : ""}
              {incident.resolutionNotes ? ` — ${incident.resolutionNotes}` : ""}
            </span>
          </div>
        );
      }
      return (
        <div className="mt-2 flex items-center gap-2 rounded-md bg-teal-50 dark:bg-teal-950 border border-teal-200 dark:border-teal-800 px-3 py-1.5 text-xs text-teal-800 dark:text-teal-200">
          <ArrowRight size={12} className="shrink-0" />
          <span>Thank you for reporting this. Mark it as resolved once the hazard has been dealt with.</span>
        </div>
      );
    }

    if (rt === 'near_miss') {
      return (
        <div className="mt-2 flex items-center gap-2 rounded-md bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 px-3 py-1.5 text-xs text-blue-800 dark:text-blue-200">
          <ArrowRight size={12} className="shrink-0" />
          <span><strong>Action required:</strong> Investigate the hazard and update your risk assessments (required under MHSWR 1999)</span>
        </div>
      );
    }

    if (!incident.riddorCategory || incident.riddorCategory === "") {
      return (
        <div className="mt-2 flex items-center gap-2 rounded-md bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 px-3 py-1.5 text-xs text-amber-800 dark:text-amber-200">
          <ArrowRight size={12} className="shrink-0" />
          <span><strong>Action required:</strong> Assess whether this incident is reportable under RIDDOR 2013 — edit the record to complete your assessment</span>
        </div>
      );
    }
    if (incident.riddorCategory === "not_riddor_reportable") return null;

    if (!incident.riddorReportedAt && days !== null) {
      if (days <= 0) {
        return (
          <div className="mt-2 flex items-center gap-2 rounded-md bg-red-50 dark:bg-red-950 border border-red-300 px-3 py-1.5 text-xs text-red-800 dark:text-red-200">
            <AlertCircle size={12} className="shrink-0" />
            <span><strong>URGENT — OVERDUE:</strong> This RIDDOR incident should already have been reported to the HSE. Report now at <a href={EXTERNAL_LINKS.riddor?.report?.url ?? "https://www.hse.gov.uk/riddor/report.htm"} target="_blank" rel="noopener noreferrer" className="underline">hse.gov.uk</a></span>
          </div>
        );
      }
      return (
        <div className={`mt-2 flex items-center gap-2 rounded-md border px-3 py-1.5 text-xs ${days <= 2 ? "bg-red-50 dark:bg-red-950 border-red-300 text-red-800 dark:text-red-200" : "bg-amber-50 dark:bg-amber-950 border-amber-200 text-amber-800 dark:text-amber-200"}`}>
          <ArrowRight size={12} className="shrink-0" />
          <span>
            <strong>Action required:</strong> Report this incident to the HSE by{" "}
            <strong>{new Date(incident.riddorReportingDeadline!).toLocaleDateString("en-GB")}</strong>
            {" "}({days} day{days !== 1 ? "s" : ""} remaining) — then click <em>Mark Reported</em> to record your HSE reference
          </span>
        </div>
      );
    }
    return null;
  }

  const isBbs = (rt: string) => rt === 'good_spot' || rt === 'positive_action';

  function exportCsv() {
    const HAZARD_LABELS: Record<string, string> = {
      slip_trip_fall: 'Slip, trip or fall', struck_by_object: 'Struck by object',
      manual_handling: 'Manual handling', vehicle_plant: 'Vehicle or plant',
      working_at_height: 'Working at height', electrical: 'Electrical',
      fire_explosion: 'Fire or explosion', chemical_substance: 'Chemical or substance',
      machinery: 'Machinery', other: 'Other',
    };
    const RIDDOR_LABELS_CSV: Record<string, string> = {
      fatality: 'Fatality', specified_injury: 'Specified Injury',
      over_7_day: 'Over-7-Day Incapacitation', dangerous_occurrence: 'Dangerous Occurrence',
      occupational_disease: 'Occupational Disease', not_riddor_reportable: 'Not RIDDOR Reportable',
    };

    const headers = [
      'Date & Time', 'Record Type', 'Title', 'Location', 'Reported By',
      'Injured Person', 'Person Type', 'Hazard Type', 'Description',
      'Near Miss Potential', 'RIDDOR Category', 'RIDDOR Deadline', 'RIDDOR Reported', 'HSE Reference',
      'Resolved', 'Resolved By', 'Resolved At', 'Resolution Notes',
      'Investigation Status', 'Investigated By', 'Investigation Notes',
    ];

    const rows = filtered.map(i => {
      const rt = i.recordType || (i.isNearMiss ? 'near_miss' : 'incident');
      const isBbsRecord = rt === 'good_spot' || rt === 'positive_action';
      const recordTypeLabel = rt === 'incident' ? 'Incident' : rt === 'near_miss' ? 'Near Miss' : rt === 'good_spot' ? 'Good Spot' : 'Positive Action';
      return [
        new Date(i.incidentDate).toLocaleString('en-GB'),
        recordTypeLabel,
        i.title,
        i.location || '',
        i.reportedBy || '',
        (!isBbsRecord && i.injuredPerson) ? i.injuredPerson : '',
        (!isBbsRecord && i.injuredPersonType) ? personTypeLabel(i.injuredPersonType) : '',
        i.hazardType ? (HAZARD_LABELS[i.hazardType] || i.hazardType) :
          (i.nearMissHazardType ? (HAZARD_LABELS[i.nearMissHazardType] || i.nearMissHazardType) : ''),
        i.description || '',
        i.nearMissPotential || '',
        i.riddorCategory ? (RIDDOR_LABELS_CSV[i.riddorCategory] || i.riddorCategory) : '',
        i.riddorReportingDeadline ? new Date(i.riddorReportingDeadline).toLocaleDateString('en-GB') : '',
        i.riddorReportedAt ? new Date(i.riddorReportedAt).toLocaleDateString('en-GB') : '',
        i.riddorReference || '',
        isBbsRecord ? (i.resolved ? 'Yes' : 'No') : '',
        isBbsRecord ? (i.resolvedBy || '') : '',
        (isBbsRecord && i.resolvedAt) ? new Date(i.resolvedAt).toLocaleDateString('en-GB') : '',
        isBbsRecord ? (i.resolutionNotes || '') : '',
        (!isBbsRecord) ? ((i as any).investigationStatus || 'open') : '',
        (!isBbsRecord) ? ((i as any).investigatedBy || '') : '',
        (!isBbsRecord) ? ((i as any).investigationNotes || '') : '',
      ];
    });

    const escape = (v: string) => `"${String(v).replace(/"/g, '""')}"`;
    const csv = [headers, ...rows].map(row => row.map(escape).join(',')).join('\n');

    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;

    const parts = ['hs-records'];
    if (filterType !== 'all') parts.push(filterType.replace('_', '-'));
    if (dateFrom) parts.push(`from-${dateFrom}`);
    if (dateTo) parts.push(`to-${dateTo}`);
    parts.push(new Date().toISOString().slice(0, 10));
    a.download = parts.join('-') + '.csv';

    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return (
    <TooltipProvider>
    <div className="p-4 sm:p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <AlertTriangle className="text-amber-500" size={26} />
            H&S Incident Reports
          </h1>
          <div className="flex items-center gap-1.5 mt-1">
            <p className="text-sm text-muted-foreground">RIDDOR 2013 · Near Miss reporting · Behaviour-Based Safety</p>
            <Tooltip>
              <TooltipTrigger asChild>
                <button type="button" className="text-muted-foreground hover:text-foreground transition-colors">
                  <Info size={14} />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-sm text-xs space-y-2 p-3">
                <p><strong>RIDDOR 2013</strong> — The Reporting of Injuries, Diseases and Dangerous Occurrences Regulations 2013. Employers are legally required to report certain workplace incidents to the HSE. Failure to report is a <strong>criminal offence</strong>.</p>
                <p><strong>Near Miss reporting</strong> — Required under the Management of Health &amp; Safety at Work Regulations 1999. A near miss is any unplanned event that didn't cause injury but had the potential to.</p>
                <p><strong>Good Spot</strong> — A positive safety observation. Someone has noticed a hazard and reported it before anyone was hurt. Recording Good Spots builds a proactive safety culture and demonstrates due diligence under MHSWR 1999.</p>
                <p><strong>Positive Action</strong> — Someone has not only spotted a hazard but taken steps to resolve it. This represents the highest standard of proactive safety behaviour.</p>
              </TooltipContent>
            </Tooltip>
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={exportCsv}
            disabled={filtered.length === 0}
          >
            <FileDown size={14} className="mr-1" /> Export CSV
            {filtered.length > 0 && (
              <span className="ml-1.5 text-xs text-muted-foreground">({filtered.length})</span>
            )}
          </Button>
          <Button onClick={() => { setShowForm(true); setEditingId(null); setForm({ ...emptyForm }); }}>
            <Plus size={16} className="mr-1" /> Record
          </Button>
        </div>
      </div>

      {/* RIDDOR pending alerts */}
      {pendingRiddor.length > 0 && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950 p-4 space-y-2">
          <p className="font-semibold text-amber-800 dark:text-amber-200 flex items-center gap-2">
            <AlertCircle size={16} /> {pendingRiddor.length} incident{pendingRiddor.length > 1 ? "s" : ""} pending HSE notification
          </p>
          {pendingRiddor.map(i => {
            const days = getDaysUntil(i.riddorReportingDeadline!);
            return (
              <div key={i.id} className="flex items-center justify-between text-sm">
                <span className="font-medium">{i.title}</span>
                <span className={days <= 2 ? "text-red-700 font-bold" : "text-amber-700"}>
                  {days <= 0 ? "OVERDUE" : `${days} day${days !== 1 ? "s" : ""} remaining`}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* Date range filter */}
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm text-muted-foreground shrink-0">Date range:</span>
        <div className="flex items-center gap-2">
          <Input
            type="date"
            value={dateFrom}
            onChange={e => setDateFrom(e.target.value)}
            className="w-40 text-sm"
            placeholder="From"
          />
          <span className="text-muted-foreground text-sm">—</span>
          <Input
            type="date"
            value={dateTo}
            onChange={e => setDateTo(e.target.value)}
            className="w-40 text-sm"
            placeholder="To"
          />
        </div>
        {(dateFrom || dateTo) && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => { setDateFrom(''); setDateTo(''); }}
            className="text-xs text-muted-foreground"
          >
            Clear
          </Button>
        )}
        {(dateFrom || dateTo) && (
          <span className="text-xs text-muted-foreground">
            {filtered.length} record{filtered.length !== 1 ? 's' : ''} in range
          </span>
        )}
      </div>

      {/* Safety Engagement Dashboard */}
      {showDashboard && (
        <GlassCard className="p-4 space-y-4">
          <h2 className="font-semibold flex items-center gap-2">
            <BarChart3 size={16} className="text-blue-500" /> Safety Engagement Dashboard (last 90 days)
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-center">
            <div className="rounded-lg bg-amber-50 dark:bg-amber-950 p-3">
              <div className="text-2xl font-bold text-amber-700">{recent.incidents.length}</div>
              <div className="text-xs text-muted-foreground">Incidents</div>
            </div>
            <div className="rounded-lg bg-blue-50 dark:bg-blue-950 p-3">
              <div className="text-2xl font-bold text-blue-700">{recent.nearMisses.length}</div>
              <div className="text-xs text-muted-foreground">Near Misses</div>
            </div>
            <div className={`rounded-lg p-3 ${openInvestigations > 0 ? 'bg-purple-50 dark:bg-purple-950' : 'bg-gray-50 dark:bg-gray-900'}`}>
              <div className={`text-2xl font-bold ${openInvestigations > 0 ? 'text-purple-700' : 'text-gray-500'}`}>{openInvestigations}</div>
              <div className="text-xs text-muted-foreground">Open Investigations</div>
            </div>
            <div className="rounded-lg bg-green-50 dark:bg-green-950 p-3">
              <div className="text-2xl font-bold text-green-700">{recent.goodSpots.length}</div>
              <div className="text-xs text-muted-foreground">Good Spots</div>
            </div>
            <div className="rounded-lg bg-teal-50 dark:bg-teal-950 p-3">
              <div className="text-2xl font-bold text-teal-700">{recent.positiveActions.length}</div>
              <div className="text-xs text-muted-foreground">Positive Actions</div>
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            {/* Engagement ratio */}
            <div className="rounded-lg border p-3 space-y-1">
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Safety Engagement Ratio</div>
              <div className="text-xl font-bold">{engagementRatio.toFixed(1)}:1 <span className="text-sm font-normal text-muted-foreground">positive : incident</span></div>
              <div className={`text-xs rounded px-2 py-1 ${engagementRatio > 2 ? "bg-green-50 text-green-800" : engagementRatio >= 0.5 ? "bg-amber-50 text-amber-800" : "bg-red-50 text-red-800"}`}>
                {engagementRatio > 2 ? "🟢 Strong safety culture — more hazards being caught proactively than incidents occurring." : engagementRatio >= 0.5 ? "🟡 Developing — positive reporting is building. Keep encouraging Good Spot submissions." : "🔴 Low engagement — fewer positive reports than incidents. Encourage staff to report hazards."}
              </div>
            </div>

            {/* Resolution rate */}
            {allBbsRecords.length > 0 && (
              <div className="rounded-lg border p-3 space-y-1">
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Good Spot Resolution Rate</div>
                <div className="text-xl font-bold">{resolutionRate}% <span className="text-sm font-normal text-muted-foreground">{resolvedBbs.length}/{allBbsRecords.length} resolved</span></div>
                <div className="w-full bg-gray-100 dark:bg-gray-800 rounded-full h-2 mt-1">
                  <div className="bg-green-500 h-2 rounded-full" style={{ width: `${resolutionRate}%` }} />
                </div>
                <div className="text-xs text-muted-foreground">High resolution rates build trust — staff report more when they see action taken.</div>
              </div>
            )}
          </div>

          {Object.keys(hazardCounts).length > 0 && (
            <div>
              <div className="text-xs font-semibold text-muted-foreground mb-2">Hazard types (near misses + observations)</div>
              <div className="flex flex-wrap gap-2">
                {Object.entries(hazardCounts).sort((a, b) => b[1] - a[1]).map(([type, count]) => (
                  <Badge key={type} variant="outline" className="text-xs">
                    {HAZARD_TYPES.find(h => h.value === type)?.label || type}: {count}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Management view toggle */}
          <div className="pt-2 border-t">
            <button
              type="button"
              onClick={() => setShowManagementView(v => !v)}
              className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1.5 transition-colors"
            >
              <BarChart3 size={13} />
              {showManagementView ? "Hide management view" : "Show management view — pyramid & 12-month trend"}
            </button>
          </div>

          {showManagementView && (
            <div className="space-y-6 pt-2">

              {/* Safety Observation Pyramid */}
              <div>
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Safety observation pyramid (all time)</div>
                <div className="space-y-2">

                  <div className="flex items-center gap-3">
                    <div className="w-28 text-xs text-muted-foreground text-right shrink-0">{pyramidData.riddor} RIDDOR</div>
                    <div className="flex-1">
                      <div className="h-7 rounded flex items-center px-2 bg-red-500 text-red-50 text-xs font-semibold transition-all"
                        style={{ width: `${Math.max(8, Math.round((pyramidData.riddor / pyramidMax) * 100))}%`, minWidth: pyramidData.riddor > 0 ? '2rem' : '1.5rem' }}>
                        {pyramidData.riddor > 0 ? pyramidData.riddor : ''}
                      </div>
                    </div>
                    <div className="w-36 text-xs text-muted-foreground shrink-0 hidden sm:block">Reportable to HSE</div>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="w-28 text-xs text-muted-foreground text-right shrink-0">{pyramidData.incidents} incident{pyramidData.incidents !== 1 ? 's' : ''}</div>
                    <div className="flex-1">
                      <div className="h-7 rounded flex items-center px-2 bg-orange-500 text-orange-50 text-xs font-semibold transition-all"
                        style={{ width: `${Math.max(10, Math.round((pyramidData.incidents / pyramidMax) * 100))}%`, minWidth: '2rem' }}>
                        {pyramidData.incidents > 0 ? pyramidData.incidents : ''}
                      </div>
                    </div>
                    <div className="w-36 text-xs text-muted-foreground shrink-0 hidden sm:block">Something went wrong</div>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="w-28 text-xs text-muted-foreground text-right shrink-0">{pyramidData.nearMisses} near miss{pyramidData.nearMisses !== 1 ? 'es' : ''}</div>
                    <div className="flex-1">
                      <div className="h-7 rounded flex items-center px-2 bg-amber-500 text-amber-50 text-xs font-semibold transition-all"
                        style={{ width: `${Math.max(12, Math.round((pyramidData.nearMisses / pyramidMax) * 100))}%`, minWidth: '2rem' }}>
                        {pyramidData.nearMisses > 0 ? pyramidData.nearMisses : ''}
                      </div>
                    </div>
                    <div className="w-36 text-xs text-muted-foreground shrink-0 hidden sm:block">Could have gone wrong</div>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="w-28 text-xs text-muted-foreground text-right shrink-0">{pyramidData.goodSpots} good spot{pyramidData.goodSpots !== 1 ? 's' : ''}</div>
                    <div className="flex-1">
                      <div className="h-7 rounded flex items-center px-2 bg-green-600 text-green-50 text-xs font-semibold transition-all"
                        style={{ width: `${Math.max(15, Math.round((pyramidData.goodSpots / pyramidMax) * 100))}%`, minWidth: '2rem' }}>
                        {pyramidData.goodSpots > 0 ? `${pyramidData.goodSpots} hazards caught proactively` : '0'}
                      </div>
                    </div>
                    <div className="w-36 text-xs text-green-700 dark:text-green-400 font-medium shrink-0 hidden sm:block">Proactive — harm prevented</div>
                  </div>

                </div>
                <p className="text-xs text-muted-foreground mt-3 bg-green-50 dark:bg-green-950 rounded p-2 border border-green-200 dark:border-green-800">
                  A wide base of good spots means fewer incidents reach the top. HSE research shows 23 near misses occur for every reportable injury — most are never recorded without a system like this.
                </p>
              </div>

              {/* 12-month trend chart */}
              <div>
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Leading vs lagging indicators — 12-month trend</div>
                <div className="flex items-center gap-4 mb-3 flex-wrap">
                  <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <span className="inline-block w-5 h-0.5 bg-green-600 rounded" />
                    Good spots &amp; positive actions
                  </span>
                  <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <span className="inline-block w-5 h-0.5 bg-red-500 rounded" style={{ borderTop: '2px dashed #ef4444', background: 'none' }} />
                    Incidents &amp; near misses
                  </span>
                </div>
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={monthlyTrend} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(128,128,128,0.15)" />
                    <XAxis dataKey="month" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                    <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} allowDecimals={false} />
                    <RechartsTooltip
                      contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb' }}
                      formatter={(value: number, name: string) => [value, name === 'positive' ? 'Good spots & positive actions' : 'Incidents & near misses']}
                    />
                    <Line type="monotone" dataKey="positive" stroke="#16a34a" strokeWidth={2} dot={{ r: 3, fill: '#16a34a' }} activeDot={{ r: 5 }} name="positive" />
                    <Line type="monotone" dataKey="negative" stroke="#ef4444" strokeWidth={2} strokeDasharray="5 3" dot={{ r: 3, fill: '#ef4444' }} activeDot={{ r: 5 }} name="negative" />
                  </LineChart>
                </ResponsiveContainer>
                <p className="text-xs text-muted-foreground mt-2">
                  As positive reporting builds, incidents fall. When staff see their observations acted on, they report more — which means more hazards caught before they cause harm.
                </p>
              </div>

            </div>
          )}
        </GlassCard>
      )}

      {/* Filter tabs */}
      <div className="flex flex-wrap gap-2">
        {([
          { key: "all", label: "All" },
          { key: "incident", label: "Incidents" },
          { key: "near_miss", label: "Near Misses" },
          { key: "good_spot", label: "Good Spots" },
          { key: "positive_action", label: "Positive Actions" },
          { key: "riddor", label: "RIDDOR Only" },
        ] as const).map(f => (
          <Button key={f.key} size="sm" variant={filterType === f.key ? "default" : "outline"} onClick={() => setFilterType(f.key)}>
            {f.label}
          </Button>
        ))}
      </div>

      {/* Incident list */}
      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">Loading records…</div>
      ) : filtered.length === 0 ? (
        <GlassCard className="text-center py-12 text-muted-foreground">
          <AlertTriangle size={40} className="mx-auto mb-3 opacity-30" />
          <p>No records found.</p>
        </GlassCard>
      ) : (
        <div className="space-y-3">
          {filtered.map(incident => {
            const rt = incident.recordType || (incident.isNearMiss ? 'near_miss' : 'incident');
            const days = incident.riddorReportingDeadline ? getDaysUntil(incident.riddorReportingDeadline) : null;

            let borderColor = "border-transparent";
            if (rt === 'good_spot') borderColor = "border-green-400";
            else if (rt === 'positive_action') borderColor = "border-teal-500";
            else if (rt === 'near_miss') borderColor = "border-blue-400";
            else if (incident.riddorReportedAt) borderColor = "border-green-300";
            else if (days !== null && days <= 0) borderColor = "border-red-400";
            else if (days !== null && days <= 2) borderColor = "border-red-300";
            else if (days !== null && days <= 5) borderColor = "border-amber-300";

            return (
              <GlassCard key={incident.id} className={`p-4 border-l-4 ${borderColor}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <span className="font-semibold">{incident.title}</span>

                      {rt === 'good_spot' && (
                        <Badge className="bg-green-100 text-green-800 border-green-300 text-xs flex items-center gap-1">
                          <ThumbsUp size={10} /> Good Spot
                        </Badge>
                      )}
                      {rt === 'positive_action' && (
                        <Badge className="bg-teal-100 text-teal-800 border-teal-300 text-xs flex items-center gap-1">
                          <Zap size={10} /> Positive Action
                        </Badge>
                      )}
                      {rt === 'near_miss' && (
                        <Badge className="bg-blue-100 text-blue-800 border-blue-300 text-xs">Near Miss</Badge>
                      )}
                      {incident.nearMissPotential === "critical" && (
                        <Badge className="bg-red-100 text-red-800 border-red-300 text-xs">Critical potential</Badge>
                      )}
                      {incident.nearMissPotential === "serious" && (
                        <Badge className="bg-amber-100 text-amber-800 border-amber-300 text-xs">Serious potential</Badge>
                      )}
                      {isBbs(rt) && incident.resolved && (
                        <Badge className="bg-green-100 text-green-800 border-green-300 text-xs">✅ Resolved</Badge>
                      )}
                      {isBbs(rt) && !incident.resolved && (
                        <Badge className="bg-amber-100 text-amber-800 border-amber-300 text-xs">⏳ Awaiting resolution</Badge>
                      )}
                      {!isBbs(rt) && incident.investigationStatus === 'closed' && (
                        <Badge className="bg-purple-100 text-purple-800 border-purple-300 text-xs">🔍 Investigation closed</Badge>
                      )}
                      {!isBbs(rt) && incident.investigationStatus === 'in_progress' && (
                        <Badge className="bg-blue-100 text-blue-800 border-blue-300 text-xs">🔍 Under investigation</Badge>
                      )}
                      {!isBbs(rt) && (!incident.investigationStatus || incident.investigationStatus === 'open') && (
                        <Badge className="bg-gray-100 text-gray-600 border-gray-300 text-xs">🔍 Investigation open</Badge>
                      )}
                      <RiddorBadge incident={incident} />
                    </div>
                    <div className="text-sm text-muted-foreground space-y-0.5">
                      <div>{new Date(incident.incidentDate).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}{incident.location ? ` · ${incident.location}` : ""}</div>
                      {incident.reportedBy && <div>Reported by: {incident.reportedBy}</div>}
                      {!isBbs(rt) && incident.injuredPerson && (
                        <div>Injured person: {incident.injuredPerson}{incident.injuredPersonType ? ` (${personTypeLabel(incident.injuredPersonType)})` : ""}</div>
                      )}
                      {isBbs(rt) && incident.hazardType && (
                        <div>Hazard: {HAZARD_TYPES.find(h => h.value === incident.hazardType)?.label || incident.hazardType}</div>
                      )}
                      {rt === 'near_miss' && incident.nearMissHazardType && (
                        <div className="text-xs">Hazard: {HAZARD_TYPES.find(h => h.value === incident.nearMissHazardType)?.label || incident.nearMissHazardType}</div>
                      )}
                      {incident.description && <div className="mt-1 text-xs">{incident.description}</div>}
                      {incident.photoUrl && (
                        <div className="mt-2">
                          <a href={objectUrl(`/objects${incident.photoUrl}`)} target="_blank" rel="noopener noreferrer">
                            <img src={objectUrl(`/objects${incident.photoUrl}`)} alt="Hazard photo" className="h-20 w-auto rounded border object-cover hover:opacity-90 transition-opacity" onError={e => { e.currentTarget.style.display = 'none'; }} />
                          </a>
                        </div>
                      )}
                      {!isBbs(rt) && incident.riddorCategory && rt !== 'near_miss' && (
                        <div className="mt-1">RIDDOR: {RIDDOR_LABELS[incident.riddorCategory] || incident.riddorCategory}
                          {incident.riddorReportingDeadline && !incident.riddorReportedAt && (
                            <span className={`ml-2 font-medium ${days !== null && days <= 2 ? "text-red-600" : "text-amber-600"}`}>
                              — deadline {new Date(incident.riddorReportingDeadline).toLocaleDateString("en-GB")}
                            </span>
                          )}
                        </div>
                      )}
                      {incident.riddorReportedAt && incident.riddorReference && (
                        <div className="text-green-700 text-xs">HSE Ref: {incident.riddorReference}</div>
                      )}
                      {!isBbs(rt) && incident.investigatedBy && (
                        <div className="text-xs text-purple-700 dark:text-purple-300">Investigated by: {incident.investigatedBy}</div>
                      )}
                      {!isBbs(rt) && incident.investigationNotes && (
                        <div className="text-xs text-muted-foreground mt-1 italic">{incident.investigationNotes}</div>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-1 shrink-0 flex-wrap justify-end">
                    {isBbs(rt) && !incident.resolved && (
                      <Button size="sm" variant="outline" className="text-xs text-green-700 border-green-300 hover:bg-green-50" onClick={() => { setResolvingId(incident.id); setResolveForm({ resolvedBy: "", resolutionNotes: "" }); }}>
                        <CheckCircle size={12} className="mr-1" /> Mark Resolved
                      </Button>
                    )}
                    {!isBbs(rt) && rt !== 'near_miss' && incident.riddorCategory && incident.riddorCategory !== "not_riddor_reportable" && !incident.riddorReportedAt && (
                      <Button size="sm" variant="outline" className="text-xs" onClick={() => { setReportingId(incident.id); setHseReference(""); }}>
                        <CheckCircle size={12} className="mr-1" /> Mark Reported
                      </Button>
                    )}
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button size="sm" variant="ghost" onClick={() => handleDownloadPdf(incident.id)}>
                          <FileDown size={14} />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Download PDF report</TooltipContent>
                    </Tooltip>
                    <Button size="sm" variant="ghost" onClick={() => handleEdit(incident)}>
                      <Edit size={14} />
                    </Button>
                    <Button size="sm" variant="ghost" className="text-red-500 hover:text-red-700" onClick={() => setDeleteId(incident.id)}>
                      <Trash2 size={14} />
                    </Button>
                  </div>
                </div>
                <NextAction incident={incident} />
              </GlassCard>
            );
          })}
        </div>
      )}

      {/* Create/Edit form dialog */}
      <Dialog open={showForm} onOpenChange={open => { if (!open) { setShowForm(false); setEditingId(null); } }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit Record" : "Record Incident / Observation"}</DialogTitle>
            <DialogDescription>Record a workplace incident, near miss, or positive safety observation.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">

            {/* Record type selector */}
            <div>
              <Label className="mb-2 block">Record type</Label>
              <div className="grid grid-cols-2 gap-2">
                {RECORD_TYPES.map(rt => {
                  const isBbsType = rt.value === 'good_spot' || rt.value === 'positive_action';
                  const locked = isBbsType && !featureBbs;
                  return (
                    <button
                      key={rt.value}
                      type="button"
                      disabled={locked}
                      onClick={() => !locked && handleRecordTypeChange(rt.value)}
                      title={locked ? "Good Spot and Positive Action reporting is not enabled on your plan" : undefined}
                      className={`text-left p-3 rounded-lg border-2 transition-all ${locked ? "opacity-40 cursor-not-allowed border-gray-200 dark:border-gray-700" : form.recordType === rt.value ? rt.color + " font-semibold" : "border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600"}`}
                    >
                      <div className="text-sm font-medium">{rt.label}</div>
                      <div className="text-xs opacity-70 mt-0.5">{locked ? "Not available on your plan" : rt.sublabel}</div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="sm:col-span-2">
                <Label>{form.recordType === 'good_spot' || form.recordType === 'positive_action' ? 'Observation title *' : 'Incident title *'}</Label>
                <Input required value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder={
                  form.recordType === 'good_spot' ? "What hazard did you spot?" :
                  form.recordType === 'positive_action' ? "What hazard did you deal with?" :
                  "Brief description of what happened"
                } />
              </div>
              <div>
                <Label>Date &amp; time *</Label>
                <Input required type="datetime-local" value={form.incidentDate} onChange={e => setForm(f => ({ ...f, incidentDate: e.target.value }))} />
              </div>
              <div>
                <Label>Location</Label>
                <Input value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))} placeholder="Where it happened" />
              </div>
              <div className="sm:col-span-2">
                <Label>Reported by</Label>
                <PersonCombobox value={form.reportedBy} onChange={v => setForm(f => ({ ...f, reportedBy: v }))} options={reportedByOptions} placeholder="Search staff or contractor, or type a name…" />
              </div>

              {/* Person involved — only for incident/near_miss */}
              {(form.recordType === 'incident' || form.recordType === 'near_miss') && (
                <>
                  <div>
                    <Label>Person type</Label>
                    <Select value={form.injuredPersonType} onValueChange={v => setForm(f => ({ ...f, injuredPersonType: v, injuredPerson: "" }))}>
                      <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="staff">Staff</SelectItem>
                        <SelectItem value="contractor">Contractor</SelectItem>
                        <SelectItem value="visitor">Visitor</SelectItem>
                        <SelectItem value="member_of_public">Member of public</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Injured person</Label>
                    {form.injuredPersonType === "member_of_public" || form.injuredPersonType === "" ? (
                      <Input value={form.injuredPerson} onChange={e => setForm(f => ({ ...f, injuredPerson: e.target.value }))} placeholder={form.injuredPersonType === "" ? "Select person type first, or type a name" : "Name (if applicable)"} />
                    ) : (
                      <PersonCombobox value={form.injuredPerson} onChange={v => setForm(f => ({ ...f, injuredPerson: v }))} options={injuredPersonOptions()} placeholder={form.injuredPersonType === "staff" ? "Search staff members…" : form.injuredPersonType === "contractor" ? "Search contractor workers…" : "Search visitors…"} />
                    )}
                  </div>
                </>
              )}

              <div className="sm:col-span-2">
                <Label>Description</Label>
                <Textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={3} placeholder={
                  form.recordType === 'good_spot' ? "Describe what you spotted and where…" :
                  form.recordType === 'positive_action' ? "Describe what you spotted and what you did to fix it…" :
                  "Full details of what happened…"
                } />
              </div>
            </div>

            {/* Hazard type — for good_spot and positive_action */}
            {(form.recordType === 'good_spot' || form.recordType === 'positive_action') && (
              <div className="rounded-lg border border-green-200 dark:border-green-800 p-4 space-y-3 bg-green-50/50 dark:bg-green-950/30">
                <h3 className="font-semibold text-green-900 dark:text-green-100">Hazard Details</h3>
                <div>
                  <Label>Hazard type</Label>
                  <Select value={form.hazardType} onValueChange={v => setForm(f => ({ ...f, hazardType: v }))}>
                    <SelectTrigger><SelectValue placeholder="Select hazard type…" /></SelectTrigger>
                    <SelectContent>
                      {HAZARD_TYPES.map(h => <SelectItem key={h.value} value={h.value}>{h.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                {form.recordType === 'positive_action' && (
                  <div>
                    <Label>What did you do to fix it?</Label>
                    <Textarea value={form.resolutionNotes} onChange={e => setForm(f => ({ ...f, resolutionNotes: e.target.value }))} rows={2} placeholder="Describe the action you took…" />
                  </div>
                )}
                <p className="text-xs text-green-700 dark:text-green-300 bg-green-100 dark:bg-green-900 rounded p-2">
                  {form.recordType === 'good_spot'
                    ? "Good Spot reports demonstrate proactive safety culture under MHSWR 1999. Thank you for reporting!"
                    : "Positive Action is the highest standard of proactive safety behaviour. Your action may have prevented an injury."}
                </p>
              </div>
            )}

            {/* Near miss section */}
            {form.recordType === 'near_miss' && (
              <div className="rounded-lg border border-blue-200 dark:border-blue-800 p-4 space-y-3 bg-blue-50/50 dark:bg-blue-950/30">
                <h3 className="font-semibold text-blue-900 dark:text-blue-100">Near Miss Details</h3>
                <div>
                  <Label>Potential severity if injury had occurred</Label>
                  <Select value={form.nearMissPotential} onValueChange={v => setForm(f => ({ ...f, nearMissPotential: v }))}>
                    <SelectTrigger><SelectValue placeholder="Select severity…" /></SelectTrigger>
                    <SelectContent>
                      {NEAR_MISS_POTENTIALS.map(p => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Hazard type</Label>
                  <Select value={form.nearMissHazardType} onValueChange={v => setForm(f => ({ ...f, nearMissHazardType: v }))}>
                    <SelectTrigger><SelectValue placeholder="Select hazard type…" /></SelectTrigger>
                    <SelectContent>
                      {HAZARD_TYPES.map(h => <SelectItem key={h.value} value={h.value}>{h.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <p className="text-xs text-muted-foreground bg-blue-50 dark:bg-blue-950 rounded p-2">
                  Near misses are not reportable to the HSE under RIDDOR, but they must be investigated and used to update your risk assessments under MHSWR 1999.
                </p>
              </div>
            )}

            {/* Investigation section — for incident and near_miss */}
            {(form.recordType === 'incident' || form.recordType === 'near_miss') && (
              <div className="rounded-lg border border-purple-200 dark:border-purple-800 p-4 space-y-3 bg-purple-50/50 dark:bg-purple-950/30">
                <h3 className="font-semibold text-purple-900 dark:text-purple-100">Investigation</h3>
                <div>
                  <Label>Investigation status</Label>
                  <Select value={form.investigationStatus} onValueChange={v => setForm(f => ({ ...f, investigationStatus: v }))}>
                    <SelectTrigger><SelectValue placeholder="Select status…" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="open">Open — not yet investigated</SelectItem>
                      <SelectItem value="in_progress">In progress</SelectItem>
                      <SelectItem value="closed">Closed — investigation complete</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Investigated by</Label>
                  <PersonCombobox value={form.investigatedBy} onChange={v => setForm(f => ({ ...f, investigatedBy: v }))} options={reportedByOptions} placeholder="Search staff or type a name…" />
                </div>
                <div>
                  <Label>Investigation notes</Label>
                  <Textarea value={form.investigationNotes} onChange={e => setForm(f => ({ ...f, investigationNotes: e.target.value }))} rows={3} placeholder="Root cause, contributing factors, corrective actions taken…" />
                </div>
              </div>
            )}

            {/* RIDDOR section — only for standard incidents */}
            {form.recordType === 'incident' && (
              <div className="rounded-lg border p-4 space-y-3">
                <div>
                  <h3 className="font-semibold">RIDDOR Assessment</h3>
                  <p className="text-xs text-muted-foreground mt-1">Under RIDDOR 2013, certain workplace incidents must be reported to the HSE. Failure to report is a criminal offence.</p>
                </div>
                <div>
                  <Label>RIDDOR category</Label>
                  <Select value={form.riddorCategory} onValueChange={v => setForm(f => ({ ...f, riddorCategory: v }))}>
                    <SelectTrigger><SelectValue placeholder="— Not yet assessed —" /></SelectTrigger>
                    <SelectContent>
                      {RIDDOR_CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                {form.riddorCategory === "fatality" && (
                  <div className="rounded bg-red-50 dark:bg-red-950 border border-red-300 p-3 text-sm text-red-800 dark:text-red-200">
                    ⚠ Fatalities must be reported to the HSE <strong>immediately</strong>. An email alert will be sent when this incident is saved.
                  </div>
                )}
              </div>
            )}

            {/* Photo upload */}
            <div className="space-y-2">
              <Label className="flex items-center gap-1.5"><Camera size={14} />Photo evidence (optional)</Label>
              {(form.photoUrl || photoFile) ? (
                <div className="relative inline-block">
                  <img
                    src={photoFile ? photoFile.preview : objectUrl(`/objects${form.photoUrl}`)}
                    alt="Evidence photo"
                    className="h-28 w-auto rounded border object-cover"
                    onError={e => { e.currentTarget.style.display = 'none'; }}
                  />
                  <button
                    type="button"
                    onClick={() => { if (photoFile) URL.revokeObjectURL(photoFile.preview); setPhotoFile(null); setForm(f => ({ ...f, photoUrl: "" })); }}
                    className="absolute -top-2 -right-2 w-6 h-6 bg-white rounded-full shadow border flex items-center justify-center text-gray-600 hover:text-red-600"
                  >
                    <XIcon size={12} />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => photoInputRef.current?.click()}
                  className="flex items-center gap-2 px-3 py-2 border border-dashed border-gray-300 rounded-lg text-sm text-gray-500 hover:border-blue-400 hover:text-blue-600 transition-colors"
                >
                  <ImageIcon size={14} />Add photo
                </button>
              )}
              <input
                ref={photoInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={e => {
                  const f = e.target.files?.[0];
                  if (f) { setPhotoFile({ file: f, preview: URL.createObjectURL(f) }); }
                  e.target.value = "";
                }}
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => { setShowForm(false); setEditingId(null); setPhotoFile(null); }}>Cancel</Button>
              <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending || uploadingPhoto}>
                {uploadingPhoto ? <><div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />Uploading photo…</> : submitLabel()}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Resolve Good Spot / Positive Action dialog */}
      <Dialog open={!!resolvingId} onOpenChange={open => { if (!open) setResolvingId(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mark as Resolved</DialogTitle>
            <DialogDescription>Record who resolved this hazard and what action was taken.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Resolved by</Label>
              <Input value={resolveForm.resolvedBy} onChange={e => setResolveForm(f => ({ ...f, resolvedBy: e.target.value }))} placeholder="Name of person who resolved it" />
            </div>
            <div>
              <Label>What was done?</Label>
              <Textarea value={resolveForm.resolutionNotes} onChange={e => setResolveForm(f => ({ ...f, resolutionNotes: e.target.value }))} rows={3} placeholder="Describe the action taken to resolve the hazard…" />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setResolvingId(null)}>Cancel</Button>
              <Button className="bg-green-600 hover:bg-green-700 text-white" onClick={() => resolveMutation.mutate({ id: resolvingId!, ...resolveForm })} disabled={resolveMutation.isPending}>
                <CheckCircle size={14} className="mr-1" /> Confirm Resolved
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Mark as reported to HSE dialog */}
      <Dialog open={!!reportingId} onOpenChange={open => { if (!open) setReportingId(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mark as Reported to HSE</DialogTitle>
            <DialogDescription>Enter the HSE reference number you received after reporting this incident.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>HSE Reference Number</Label>
              <Input value={hseReference} onChange={e => setHseReference(e.target.value)} placeholder="e.g. 2024/12345" />
            </div>
            <p className="text-sm text-muted-foreground">
              Don't have a reference number yet? You can report at:{" "}
              <a href={EXTERNAL_LINKS.riddor.report.url} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">
                {EXTERNAL_LINKS.riddor.report.label} <ExternalLink size={12} className="inline" />
              </a>
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setReportingId(null)}>Cancel</Button>
              <Button onClick={() => reportedMutation.mutate({ id: reportingId!, reference: hseReference })} disabled={reportedMutation.isPending}>
                <CheckCircle size={14} className="mr-1" /> Confirm Reported
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={open => { if (!open) setDeleteId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete record?</AlertDialogTitle>
            <AlertDialogDescription>This will permanently remove this record.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-red-600 hover:bg-red-700" onClick={() => deleteMutation.mutate(deleteId!)}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
    </TooltipProvider>
  );
}
