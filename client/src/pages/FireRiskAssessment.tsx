import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest, objectUrl } from "@/lib/queryClient";
import GlassCard from "@/components/GlassCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { Flame, Plus, CheckCircle, AlertTriangle, AlertCircle, Download, FileText, ExternalLink, Trash2, Edit, Clock, ChevronDown, ChevronUp, MapPin, User, CalendarDays, Info, Upload, X } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { EXTERNAL_LINKS } from "@/lib/externalLinks";

interface FireRiskAssessment {
  id: string;
  title: string;
  assessorName: string;
  assessorCompany: string | null;
  assessmentDate: string;
  nextReviewDate: string;
  documentUrl: string | null;
  status: string;
  findingsSummary: string | null;
  reminderSentAt: string | null;
  createdAt: string;
}

interface FraActionItem {
  id: number;
  fra_id: string;
  description: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  location: string | null;
  assigned_to: string | null;
  due_date: string | null;
  completed_at: string | null;
  completed_by: string | null;
  completion_notes: string | null;
  created_at: string;
}

interface ActionSummary {
  critical: number; high: number; medium: number; low: number;
  total: number; outstanding: number; completed: number;
  critical_outstanding: number; overdue_actions: number;
}

interface FraStatus {
  hasCurrentFRA: boolean;
  daysSinceLastAssessment: number | null;
  daysUntilReview: number | null;
  isOverdue: boolean;
  currentFRA: FireRiskAssessment | null;
  actionItems: { total: number; outstanding: number; critical_outstanding: number; overdue_actions: number; completed: number; };
  overallStatus: 'compliant' | 'action_required' | 'critical' | 'no_fra';
}

function getDefaultNextReview(): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() + 1);
  return d.toISOString().slice(0, 10);
}

function getDaysUntil(dateStr: string): number {
  return Math.ceil((new Date(dateStr).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

const emptyForm = {
  title: "Fire Risk Assessment",
  assessorName: "",
  assessorCompany: "",
  assessmentDate: new Date().toISOString().slice(0, 10),
  nextReviewDate: getDefaultNextReview(),
  findingsSummary: "",
  documentUrl: "",
};

const COMMON_ACTIONS = [
  { label: "Fire exit route obstructed or blocked", priority: "critical" as const },
  { label: "Fire door damaged, wedged open or not self-closing", priority: "high" as const },
  { label: "Fire extinguisher missing, expired or not serviced", priority: "high" as const },
  { label: "Fire alarm not tested in last 6 months", priority: "high" as const },
  { label: "Emergency lighting not tested or faulty", priority: "high" as const },
  { label: "Fire warden not designated or not trained", priority: "high" as const },
  { label: "Sprinkler / suppression system service overdue", priority: "high" as const },
  { label: "Flammable materials stored unsafely", priority: "high" as const },
  { label: "No fire drill conducted in last 12 months", priority: "medium" as const },
  { label: "Fire evacuation plan not posted or out of date", priority: "medium" as const },
  { label: "Fire risk assessment not reviewed after premises changes", priority: "medium" as const },
  { label: "Assembly point not clearly marked or signage missing", priority: "medium" as const },
  { label: "Electrical equipment not PAT tested", priority: "medium" as const },
  { label: "Exit / fire route signage missing or faded", priority: "low" as const },
  { label: "Fire safety records not available on site", priority: "low" as const },
  { label: "Other (describe below)", priority: "medium" as const },
] as const;

const emptyActionForm = {
  commonAction: "" as string,
  description: "",
  priority: "medium" as const,
  location: "",
  assignedTo: "",
  assignedToOther: "",
  dueDate: "",
};

const emptyCompleteForm = {
  completionNotes: "",
};

const PRIORITY_CONFIG = {
  critical: { label: "Critical", color: "bg-red-100 text-red-800 border-red-300", dot: "🔴", ring: "border-red-300 dark:border-red-700", bg: "bg-red-50/50 dark:bg-red-950/20" },
  high:     { label: "High",     color: "bg-orange-100 text-orange-800 border-orange-300", dot: "🟠", ring: "border-orange-200 dark:border-orange-800", bg: "" },
  medium:   { label: "Medium",   color: "bg-yellow-100 text-yellow-800 border-yellow-300", dot: "🟡", ring: "border-slate-200 dark:border-slate-700", bg: "" },
  low:      { label: "Low",      color: "bg-blue-100 text-blue-800 border-blue-300", dot: "🔵", ring: "border-slate-200 dark:border-slate-700", bg: "" },
};

export default function FireRiskAssessmentPage() {
  const { toast } = useToast();

  const { data: currentUser } = useQuery<{ id: string; username: string; role: string }>({
    queryKey: ["/api/auth/me"],
  });
  const isManager = ['admin', 'manager', 'hr_admin'].includes(currentUser?.role ?? '');

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [pdfUploading, setPdfUploading] = useState(false);
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const pdfInputRef = useRef<HTMLInputElement>(null);

  // Action item state
  const [showActionForm, setShowActionForm] = useState(false);
  const [editingActionId, setEditingActionId] = useState<number | null>(null);
  const [actionForm, setActionForm] = useState({ ...emptyActionForm });
  const [completingActionId, setCompletingActionId] = useState<number | null>(null);
  const [completeForm, setCompleteForm] = useState({ ...emptyCompleteForm });
  const [showCompletedActions, setShowCompletedActions] = useState(false);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const didHighlight = useRef(false);

  const { data: fras = [], isLoading } = useQuery<FireRiskAssessment[]>({
    queryKey: ["/api/fire-risk-assessments"],
  });

  useEffect(() => {
    if (didHighlight.current || !fras.length) return;
    const id = new URLSearchParams(window.location.search).get('highlight');
    if (!id) return;
    const found = fras.find(f => String(f.id) === id);
    if (!found) return;
    setHighlightedId(id);
    didHighlight.current = true;
    setTimeout(() => {
      document.getElementById(`item-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setTimeout(() => setHighlightedId(null), 3000);
    }, 400);
  }, [fras]);

  const { data: fraStatus } = useQuery<FraStatus>({
    queryKey: ["/api/fire-risk-assessments/status"],
  });

  const { data: staffList = [] } = useQuery<{ id: string; firstName: string; lastName: string; jobTitle: string | null }[]>({
    queryKey: ["/api/staff"],
  });

  const currentFra = fras.find(f => f.status !== "superseded");
  const history = fras.filter(f => f.status === "superseded");

  const { data: actionsData } = useQuery<{ items: FraActionItem[]; summary: ActionSummary }>({
    queryKey: ["/api/fire-risk-assessments", currentFra?.id, "actions"],
    queryFn: () => apiRequest("GET", `/api/fire-risk-assessments/${currentFra!.id}/actions`).then(r => r.json()),
    enabled: !!currentFra?.id,
  });

  const actions = actionsData?.items ?? [];
  const actionSummary = actionsData?.summary;
  const outstandingActions = actions.filter(a => !a.completed_at);
  const completedActions = actions.filter(a => a.completed_at);

  // FRA CRUD mutations
  const createMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/fire-risk-assessments", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/fire-risk-assessments"] });
      setShowForm(false);
      setForm({ ...emptyForm });
      toast({ title: "Fire Risk Assessment recorded" });
    },
    onError: () => toast({ title: "Failed to save", variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => apiRequest("PUT", `/api/fire-risk-assessments/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/fire-risk-assessments"] });
      setShowForm(false);
      setEditingId(null);
      setForm({ ...emptyForm });
      toast({ title: "Fire Risk Assessment updated" });
    },
    onError: () => toast({ title: "Failed to update", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/fire-risk-assessments/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/fire-risk-assessments"] });
      setDeleteId(null);
      toast({ title: "Record deleted" });
    },
    onError: () => toast({ title: "Failed to delete", variant: "destructive" }),
  });

  // Action item mutations
  const createActionMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", `/api/fire-risk-assessments/${currentFra!.id}/actions`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/fire-risk-assessments", currentFra?.id, "actions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/fire-risk-assessments/status"] });
      setShowActionForm(false);
      setActionForm({ ...emptyActionForm });
      toast({ title: "Action item added" });
    },
    onError: () => toast({ title: "Failed to add action item", variant: "destructive" }),
  });

  const updateActionMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) =>
      apiRequest("PUT", `/api/fire-risk-assessments/${currentFra!.id}/actions/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/fire-risk-assessments", currentFra?.id, "actions"] });
      setShowActionForm(false);
      setEditingActionId(null);
      setActionForm({ ...emptyActionForm });
      toast({ title: "Action item updated" });
    },
    onError: () => toast({ title: "Failed to update action item", variant: "destructive" }),
  });

  const completeActionMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) =>
      apiRequest("PATCH", `/api/fire-risk-assessments/${currentFra!.id}/actions/${id}/complete`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/fire-risk-assessments", currentFra?.id, "actions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/fire-risk-assessments/status"] });
      setCompletingActionId(null);
      setCompleteForm({ ...emptyCompleteForm });
      toast({ title: "Action marked as complete" });
    },
    onError: () => toast({ title: "Failed to complete action", variant: "destructive" }),
  });

  const reopenActionMutation = useMutation({
    mutationFn: (id: number) =>
      apiRequest("PATCH", `/api/fire-risk-assessments/${currentFra!.id}/actions/${id}/reopen`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/fire-risk-assessments", currentFra?.id, "actions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/fire-risk-assessments/status"] });
      toast({ title: "Action reopened" });
    },
    onError: () => toast({ title: "Failed to reopen action", variant: "destructive" }),
  });

  const deleteActionMutation = useMutation({
    mutationFn: (id: number) =>
      apiRequest("DELETE", `/api/fire-risk-assessments/${currentFra!.id}/actions/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/fire-risk-assessments", currentFra?.id, "actions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/fire-risk-assessments/status"] });
      toast({ title: "Action removed" });
    },
    onError: () => toast({ title: "Failed to remove action", variant: "destructive" }),
  });

  async function handlePdfFile(file: File) {
    if (!file) return;
    if (file.type !== "application/pdf") {
      toast({ title: "PDF only", description: "Please select a PDF file.", variant: "destructive" });
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      toast({ title: "File too large", description: "Maximum PDF size is 20 MB.", variant: "destructive" });
      return;
    }
    setPdfUploading(true);
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = e => resolve((e.target!.result as string).split(",")[1]);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const res = await apiRequest("POST", "/api/objects/upload", { data: base64, mimeType: "application/pdf" });
      const { objectPath } = await res.json();
      setForm(f => ({ ...f, documentUrl: objectPath }));
      setUploadedFileName(file.name);
      toast({ title: "PDF uploaded", description: file.name });
    } catch {
      toast({ title: "Upload failed", description: "Could not upload the PDF. Try again.", variant: "destructive" });
    } finally {
      setPdfUploading(false);
    }
  }

  function handleEdit(fra: FireRiskAssessment) {
    setForm({
      title: fra.title,
      assessorName: fra.assessorName,
      assessorCompany: fra.assessorCompany || "",
      assessmentDate: fra.assessmentDate,
      nextReviewDate: fra.nextReviewDate,
      findingsSummary: fra.findingsSummary || "",
      documentUrl: fra.documentUrl || "",
    });
    setUploadedFileName(fra.documentUrl?.startsWith("/objects/") ? "Previously uploaded PDF" : null);
    setEditingId(fra.id);
    setShowForm(true);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const payload = {
      ...form,
      assessorCompany: form.assessorCompany || null,
      findingsSummary: form.findingsSummary || null,
      documentUrl: form.documentUrl || null,
    };
    if (editingId) {
      updateMutation.mutate({ id: editingId, data: payload });
    } else {
      createMutation.mutate(payload);
    }
  }

  function handleEditAction(action: FraActionItem) {
    const existingAssigned = action.assigned_to || "";
    const isStaffMember = staffList.some(s => `${s.firstName} ${s.lastName}` === existingAssigned);
    setActionForm({
      commonAction: "other",
      description: action.description,
      priority: action.priority,
      location: action.location || "",
      assignedTo: isStaffMember ? existingAssigned : (existingAssigned ? "__other__" : ""),
      assignedToOther: isStaffMember ? "" : existingAssigned,
      dueDate: action.due_date || "",
    });
    setEditingActionId(action.id);
    setShowActionForm(true);
  }

  function handleActionSubmit(e: React.FormEvent) {
    e.preventDefault();
    const resolvedAssignedTo =
      actionForm.assignedTo === "__other__"
        ? actionForm.assignedToOther.trim() || null
        : actionForm.assignedTo || null;
    const payload = {
      description: actionForm.description,
      priority: actionForm.priority,
      location: actionForm.location || null,
      assignedTo: resolvedAssignedTo,
      dueDate: actionForm.dueDate || null,
    };
    if (editingActionId) {
      updateActionMutation.mutate({ id: editingActionId, data: payload });
    } else {
      createActionMutation.mutate(payload);
    }
  }

  function handleCompleteSubmit(e: React.FormEvent) {
    e.preventDefault();
    completeActionMutation.mutate({
      id: completingActionId!,
      data: {
        completionNotes: completeForm.completionNotes || null,
      },
    });
  }

  const statusBanner = () => {
    if (!fraStatus) return null;
    if (!fraStatus.hasCurrentFRA) {
      return (
        <div className="rounded-lg border border-red-400 bg-red-50 dark:bg-red-950 p-4 flex items-center gap-3">
          <AlertCircle className="text-red-600 shrink-0" size={22} />
          <div>
            <p className="font-semibold text-red-800 dark:text-red-200">🚨 No Fire Risk Assessment on record</p>
            <p className="text-sm text-red-700 dark:text-red-300 mt-0.5">Under the Regulatory Reform (Fire Safety) Order 2005, every non-domestic premises must have a documented FRA. This is a criminal offence if not in place.</p>
          </div>
        </div>
      );
    }
    if (fraStatus.overallStatus === 'critical') {
      const critCount = fraStatus.actionItems.critical_outstanding;
      return (
        <div className="rounded-lg border border-red-400 bg-red-50 dark:bg-red-950 p-4 flex items-center gap-3">
          <AlertCircle className="text-red-600 shrink-0" size={22} />
          <div>
            <p className="font-semibold text-red-800 dark:text-red-200">
              🚨 {fraStatus.isOverdue ? "Fire Risk Assessment OVERDUE" : `Critical Action${critCount !== 1 ? "s" : ""} Outstanding`}
            </p>
            <p className="text-sm text-red-700 dark:text-red-300 mt-0.5">
              {fraStatus.isOverdue
                ? `Last review: ${fraStatus.currentFRA ? new Date(fraStatus.currentFRA.assessmentDate).toLocaleDateString("en-GB") : "—"} · Overdue by ${Math.abs(fraStatus.daysUntilReview!)} day${Math.abs(fraStatus.daysUntilReview!) !== 1 ? "s" : ""}`
                : `${critCount} critical action${critCount !== 1 ? "s" : ""} require immediate attention`
              }
            </p>
          </div>
        </div>
      );
    }
    if (fraStatus.overallStatus === 'action_required') {
      return (
        <div className="rounded-lg border border-amber-400 bg-amber-50 dark:bg-amber-950 p-4 flex items-center gap-3">
          <AlertTriangle className="text-amber-600 shrink-0" size={22} />
          <div>
            <p className="font-semibold text-amber-800 dark:text-amber-200">⚠ Fire Safety Actions Outstanding</p>
            <p className="text-sm text-amber-700 dark:text-amber-300 mt-0.5">
              {fraStatus.actionItems.outstanding} action item{fraStatus.actionItems.outstanding !== 1 ? "s" : ""} need attention · Next review: {fraStatus.currentFRA ? new Date(fraStatus.currentFRA.nextReviewDate).toLocaleDateString("en-GB") : "—"}
            </p>
          </div>
        </div>
      );
    }
    if (fraStatus.daysUntilReview !== null && fraStatus.daysUntilReview <= 30) {
      return (
        <div className="rounded-lg border border-amber-400 bg-amber-50 dark:bg-amber-950 p-4 flex items-center gap-3">
          <AlertTriangle className="text-amber-600 shrink-0" size={22} />
          <div>
            <p className="font-semibold text-amber-800 dark:text-amber-200">⚠ Review due within 30 days</p>
            <p className="text-sm text-amber-700 dark:text-amber-300 mt-0.5">
              Next review due: {fraStatus.currentFRA ? new Date(fraStatus.currentFRA.nextReviewDate).toLocaleDateString("en-GB") : "—"} · {fraStatus.daysUntilReview} day{fraStatus.daysUntilReview !== 1 ? "s" : ""} remaining
            </p>
          </div>
        </div>
      );
    }
    return (
      <div className="rounded-lg border border-green-400 bg-green-50 dark:bg-green-950 p-4 flex items-center gap-3">
        <CheckCircle className="text-green-600 shrink-0" size={22} />
        <div>
          <p className="font-semibold text-green-800 dark:text-green-200">✅ Fire Risk Assessment current — all actions resolved</p>
          <p className="text-sm text-green-700 dark:text-green-300 mt-0.5">
            Next review: {fraStatus.currentFRA ? new Date(fraStatus.currentFRA.nextReviewDate).toLocaleDateString("en-GB") : "—"} · {fraStatus.daysUntilReview} day{fraStatus.daysUntilReview !== 1 ? "s" : ""} remaining
          </p>
        </div>
      </div>
    );
  };

  const statusBadge = (status: string) => {
    if (status === "current") return <Badge className="bg-green-100 text-green-800 border-green-300">Current</Badge>;
    if (status === "review_due") return <Badge className="bg-amber-100 text-amber-800 border-amber-300">Review Due</Badge>;
    if (status === "overdue") return <Badge className="bg-red-100 text-red-800 border-red-300">Overdue</Badge>;
    if (status === "superseded") return <Badge variant="outline" className="text-muted-foreground">Superseded</Badge>;
    return <Badge variant="outline">{status}</Badge>;
  };

  const ActionCard = ({ action }: { action: FraActionItem }) => {
    const cfg = PRIORITY_CONFIG[action.priority] || PRIORITY_CONFIG.medium;
    const days = action.due_date ? getDaysUntil(action.due_date) : null;
    const isOverdue = days !== null && days < 0;
    return (
      <div className={`rounded-lg border p-4 ${cfg.ring} ${cfg.bg}`}>
        <div className="flex items-start gap-3">
          <span className="text-lg shrink-0 mt-0.5">{cfg.dot}</span>
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2 flex-wrap">
              <p className="font-medium text-sm">{action.description}</p>
              <Badge className={`text-xs shrink-0 ${cfg.color}`}>{cfg.label}</Badge>
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs text-muted-foreground">
              {action.location && (
                <span className="flex items-center gap-1"><MapPin size={11} /> {action.location}</span>
              )}
              {action.assigned_to && (
                <span className="flex items-center gap-1"><User size={11} /> {action.assigned_to}</span>
              )}
              {action.due_date && (
                <span className={`flex items-center gap-1 font-medium ${isOverdue ? "text-red-600" : days !== null && days <= 7 ? "text-amber-600" : ""}`}>
                  <CalendarDays size={11} />
                  Due {new Date(action.due_date).toLocaleDateString("en-GB")}
                  {isOverdue && <span className="text-red-600 font-semibold"> — OVERDUE {Math.abs(days!)} day{Math.abs(days!) !== 1 ? "s" : ""}</span>}
                  {!isOverdue && days !== null && days <= 7 && <span className="text-amber-600"> — {days} day{days !== 1 ? "s" : ""} left</span>}
                </span>
              )}
            </div>
          </div>
          {isManager && (
            <div className="flex gap-1 shrink-0">
              <Button size="sm" variant="ghost" onClick={() => handleEditAction(action)} title="Edit">
                <Edit size={13} />
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="text-green-700 border-green-300 hover:bg-green-50 text-xs h-7 px-2"
                onClick={() => { setCompletingActionId(action.id); setCompleteForm({ ...emptyCompleteForm }); }}
              >
                <CheckCircle size={12} className="mr-1" /> Mark Complete
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="text-red-500 hover:text-red-700"
                onClick={() => deleteActionMutation.mutate(action.id)}
                title="Remove action"
              >
                <Trash2 size={13} />
              </Button>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="p-4 sm:p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Flame className="text-orange-500" size={26} />
            Fire Risk Assessment
          </h1>
          <div className="flex items-center gap-1.5 mt-1">
            <p className="text-sm text-muted-foreground">Regulatory Reform (Fire Safety) Order 2005 compliance</p>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button type="button" className="text-muted-foreground hover:text-foreground transition-colors">
                    <Info size={14} />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-sm text-xs space-y-2 p-3">
                  <p><strong>Regulatory Reform (Fire Safety) Order 2005</strong> — Every non-domestic premises must have a documented Fire Risk Assessment carried out by a competent person. The 'Responsible Person' (employer, owner or occupier) has a legal duty to ensure fire safety measures are in place and kept up to date.</p>
                  <p>Failure to conduct or maintain a valid FRA is a <strong>criminal offence</strong> and can result in prosecution, unlimited fines, or imprisonment. The FRA must be reviewed regularly and whenever significant changes to the premises or workforce occur.</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>
        {isManager && (
          <Button onClick={() => { setShowForm(true); setEditingId(null); setForm({ ...emptyForm }); setUploadedFileName(null); }}>
            <Plus size={16} className="mr-1" /> {currentFra ? "Record New Review" : "Record FRA"}
          </Button>
        )}
      </div>

      {/* Status banner */}
      {statusBanner()}

      {/* Current FRA card */}
      {currentFra && (
        <GlassCard id={`item-${currentFra.id}`} className={`p-5${highlightedId === String(currentFra.id) ? ' ring-2 ring-blue-500 bg-blue-50/50 dark:bg-blue-950/20' : ''}`}>
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                <FileText size={18} className="text-orange-500" />
                <h2 className="font-semibold text-lg">{currentFra.title}</h2>
                {statusBadge(currentFra.status)}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                <div><span className="text-muted-foreground">Assessor:</span> <span className="font-medium">{currentFra.assessorName}</span>{currentFra.assessorCompany ? ` · ${currentFra.assessorCompany}` : ""}</div>
                <div><span className="text-muted-foreground">Assessment date:</span> <span className="font-medium">{new Date(currentFra.assessmentDate).toLocaleDateString("en-GB")}</span></div>
                <div><span className="text-muted-foreground">Next review:</span> <span className="font-medium">{new Date(currentFra.nextReviewDate).toLocaleDateString("en-GB")}</span></div>
                {currentFra.documentUrl && (
                  <div>
                    <a
                      href={currentFra.documentUrl.startsWith("/objects/") ? objectUrl(currentFra.documentUrl) : currentFra.documentUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-blue-600 hover:underline"
                    >
                      {currentFra.documentUrl.startsWith("/objects/") ? <FileText size={14} /> : <Download size={14} />}
                      {currentFra.documentUrl.startsWith("/objects/") ? "View uploaded PDF" : "View FRA document"}
                    </a>
                  </div>
                )}
              </div>
              {currentFra.findingsSummary && (
                <div className="mt-3 text-sm bg-gray-50 dark:bg-gray-900 rounded p-3">
                  <p className="font-medium text-xs text-muted-foreground mb-1">KEY FINDINGS</p>
                  <p className="whitespace-pre-wrap">{currentFra.findingsSummary}</p>
                </div>
              )}
            </div>
            {isManager && (
              <div className="flex gap-1 shrink-0">
                <Button size="sm" variant="ghost" onClick={() => handleEdit(currentFra)}>
                  <Edit size={14} />
                </Button>
                <Button size="sm" variant="ghost" className="text-red-500 hover:text-red-700" onClick={() => setDeleteId(currentFra.id)}>
                  <Trash2 size={14} />
                </Button>
              </div>
            )}
          </div>
        </GlassCard>
      )}

      {/* ── FIRE SAFETY ACTIONS ──────────────────────────────────────────────── */}
      {currentFra && (
        <GlassCard className="p-5">
          <div className="flex items-center justify-between gap-3 mb-4">
            <div>
              <h2 className="font-semibold flex items-center gap-2">
                <AlertTriangle size={16} className="text-amber-500" />
                Fire Safety Actions
              </h2>
              {actionSummary && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  {actionSummary.outstanding > 0
                    ? <><span className="font-medium text-foreground">{actionSummary.outstanding}</span> outstanding{actionSummary.critical_outstanding > 0 && <span className="text-red-600 font-semibold"> · {actionSummary.critical_outstanding} critical</span>} · </>
                    : <><span className="text-green-600 font-medium">All actions resolved</span> · </>
                  }
                  {actionSummary.completed} completed
                </p>
              )}
            </div>
            {isManager && (
              <Button size="sm" onClick={() => { setShowActionForm(true); setEditingActionId(null); setActionForm({ ...emptyActionForm }); }}>
                <Plus size={14} className="mr-1" /> Add Action
              </Button>
            )}
          </div>

          {outstandingActions.length === 0 && completedActions.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">No action items recorded yet. Add actions from the findings of this assessment.</p>
          )}

          {/* Outstanding actions — grouped by priority */}
          {(["critical", "high", "medium", "low"] as const).map(priority => {
            const group = outstandingActions.filter(a => a.priority === priority);
            if (group.length === 0) return null;
            const cfg = PRIORITY_CONFIG[priority];
            return (
              <div key={priority} className="mb-3">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">{cfg.dot} {cfg.label}</p>
                <div className="space-y-2">
                  {group.map(action => <ActionCard key={action.id} action={action} />)}
                </div>
              </div>
            );
          })}

          {/* Completed actions — collapsible */}
          {completedActions.length > 0 && (
            <div className="mt-4 border-t pt-4">
              <button
                className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground w-full"
                onClick={() => setShowCompletedActions(v => !v)}
              >
                <CheckCircle size={14} className="text-green-500" />
                Completed ({completedActions.length})
                {showCompletedActions ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </button>
              {showCompletedActions && (
                <div className="mt-3 space-y-2">
                  {completedActions.map(action => (
                    <div key={action.id} className="rounded-lg border border-green-200 dark:border-green-800 bg-green-50/50 dark:bg-green-950/20 p-3">
                      <div className="flex items-start gap-2">
                        <CheckCircle size={14} className="text-green-500 shrink-0 mt-0.5" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm line-through text-muted-foreground">{action.description}</p>
                          <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-1 text-xs text-muted-foreground">
                            <span>Completed by {action.completed_by} · {new Date(action.completed_at!).toLocaleDateString("en-GB")}</span>
                            {action.location && <span><MapPin size={10} className="inline mr-0.5" />{action.location}</span>}
                          </div>
                          {action.completion_notes && (
                            <p className="text-xs text-muted-foreground mt-1 italic">"{action.completion_notes}"</p>
                          )}
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <Badge className={`text-xs ${PRIORITY_CONFIG[action.priority]?.color}`}>
                            {PRIORITY_CONFIG[action.priority]?.label}
                          </Badge>
                          {isManager && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-amber-600 hover:text-amber-800 h-6 px-1 text-xs"
                              onClick={() => reopenActionMutation.mutate(action.id)}
                              title="Reopen this action"
                            >
                              Reopen
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </GlassCard>
      )}

      {/* What to do panel */}
      {(!fraStatus?.hasCurrentFRA || fraStatus?.isOverdue) && (
        <GlassCard className="p-5 border border-amber-200 dark:border-amber-800">
          <h2 className="font-semibold mb-2 flex items-center gap-2"><AlertTriangle size={16} className="text-amber-500" /> What you need to do</h2>
          <div className="text-sm space-y-2 text-muted-foreground">
            <p>Every non-domestic premises must have a documented Fire Risk Assessment (FRA) carried out by a <strong>competent person</strong>. If you have 5 or more employees, it must be written down.</p>
            <p>The FRA must be reviewed <strong>regularly</strong> — at least annually, or after any significant changes to the premises, occupancy, or processes.</p>
            <div className="flex flex-wrap gap-2 mt-3">
              <a href={EXTERNAL_LINKS.fire.hseFireGuidance.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-blue-600 hover:underline text-sm">
                <ExternalLink size={12} /> {EXTERNAL_LINKS.fire.hseFireGuidance.label}
              </a>
              <a href={EXTERNAL_LINKS.fire.nfcc.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-blue-600 hover:underline text-sm">
                <ExternalLink size={12} /> {EXTERNAL_LINKS.fire.nfcc.label}
              </a>
            </div>
          </div>
        </GlassCard>
      )}

      {/* History table */}
      {history.length > 0 && (
        <GlassCard className="p-4">
          <h2 className="font-semibold mb-3 flex items-center gap-2"><Clock size={16} /> Previous Assessments</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left pb-2 pr-3 font-medium text-muted-foreground">Date</th>
                  <th className="text-left pb-2 pr-3 font-medium text-muted-foreground">Assessor</th>
                  <th className="text-left pb-2 pr-3 font-medium text-muted-foreground">Next review was</th>
                  <th className="text-left pb-2 font-medium text-muted-foreground">Status</th>
                  <th className="pb-2"></th>
                </tr>
              </thead>
              <tbody>
                {history.map(fra => (
                  <tr key={fra.id} id={`item-${fra.id}`} className={`border-b last:border-0${highlightedId === String(fra.id) ? ' bg-blue-50 dark:bg-blue-950/20' : ''}`}>
                    <td className="py-2 pr-3">{new Date(fra.assessmentDate).toLocaleDateString("en-GB")}</td>
                    <td className="py-2 pr-3">{fra.assessorName}{fra.assessorCompany ? ` · ${fra.assessorCompany}` : ""}</td>
                    <td className="py-2 pr-3">{new Date(fra.nextReviewDate).toLocaleDateString("en-GB")}</td>
                    <td className="py-2 pr-3">{statusBadge(fra.status)}</td>
                    <td className="py-2">
                      <div className="flex gap-1">
                        {fra.documentUrl && (
                          <a href={fra.documentUrl.startsWith("/objects/") ? objectUrl(fra.documentUrl) : fra.documentUrl} target="_blank" rel="noopener noreferrer" title={fra.documentUrl.startsWith("/objects/") ? "View uploaded PDF" : "Open document URL"}>
                            <Button size="sm" variant="ghost">
                              {fra.documentUrl.startsWith("/objects/") ? <FileText size={13} /> : <Download size={13} />}
                            </Button>
                          </a>
                        )}
                        {isManager && (
                          <Button size="sm" variant="ghost" className="text-red-500 hover:text-red-700" onClick={() => setDeleteId(fra.id)}>
                            <Trash2 size={13} />
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </GlassCard>
      )}

      {isLoading && <div className="text-center py-8 text-muted-foreground">Loading…</div>}

      {/* FRA form dialog */}
      <Dialog open={showForm} onOpenChange={open => { if (!open) { setShowForm(false); setEditingId(null); setUploadedFileName(null); } }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit Fire Risk Assessment" : "Record Fire Risk Assessment"}</DialogTitle>
            <DialogDescription>
              {!editingId && currentFra && "Recording a new FRA will mark the previous one as superseded."}
              {!editingId && !currentFra && "Record the details of your Fire Risk Assessment."}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label>Title</Label>
              <Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label>Assessor name *</Label>
                <Input required value={form.assessorName} onChange={e => setForm(f => ({ ...f, assessorName: e.target.value }))} placeholder="Competent person's name" />
              </div>
              <div>
                <Label>Assessor company</Label>
                <Input value={form.assessorCompany} onChange={e => setForm(f => ({ ...f, assessorCompany: e.target.value }))} placeholder="External assessor (optional)" />
              </div>
              <div>
                <Label>Assessment date *</Label>
                <Input required type="date" value={form.assessmentDate} onChange={e => setForm(f => ({ ...f, assessmentDate: e.target.value }))} />
              </div>
              <div>
                <Label>Next review date *</Label>
                <Input required type="date" value={form.nextReviewDate} onChange={e => setForm(f => ({ ...f, nextReviewDate: e.target.value }))} />
              </div>
            </div>
            <div>
              <Label>Findings summary</Label>
              <Textarea value={form.findingsSummary} onChange={e => setForm(f => ({ ...f, findingsSummary: e.target.value }))} rows={4} placeholder="Key findings and action points from the assessment…" />
            </div>
            <div className="space-y-3">
              <Label>FRA Document (optional)</Label>
              {/* PDF upload zone */}
              <input
                ref={pdfInputRef}
                type="file"
                accept="application/pdf"
                className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) handlePdfFile(f); e.target.value = ""; }}
              />
              {uploadedFileName ? (
                <div className="flex items-center gap-2 p-3 bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-lg">
                  <FileText size={16} className="text-green-600 shrink-0" />
                  <span className="text-sm text-green-800 dark:text-green-200 flex-1 truncate">{uploadedFileName}</span>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-6 w-6 p-0 text-green-700 hover:text-red-600"
                    onClick={() => { setUploadedFileName(null); setForm(f => ({ ...f, documentUrl: "" })); }}
                  >
                    <X size={13} />
                  </Button>
                </div>
              ) : (
                <div
                  className={`border-2 border-dashed rounded-lg p-5 text-center cursor-pointer transition-colors ${dragOver ? "border-orange-400 bg-orange-50 dark:bg-orange-950/30" : "border-slate-200 dark:border-slate-700 hover:border-orange-300 hover:bg-orange-50/50 dark:hover:bg-orange-950/20"}`}
                  onClick={() => pdfInputRef.current?.click()}
                  onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={e => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files?.[0]; if (f) handlePdfFile(f); }}
                >
                  {pdfUploading ? (
                    <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                      <div className="w-4 h-4 border-2 border-orange-400 border-t-transparent rounded-full animate-spin" />
                      Uploading PDF…
                    </div>
                  ) : (
                    <>
                      <Upload size={20} className="mx-auto mb-2 text-muted-foreground" />
                      <p className="text-sm font-medium text-foreground">Click to upload or drag & drop</p>
                      <p className="text-xs text-muted-foreground mt-0.5">PDF only · Max 20 MB</p>
                    </>
                  )}
                </div>
              )}
              {/* Divider */}
              <div className="flex items-center gap-2">
                <div className="flex-1 h-px bg-border" />
                <span className="text-xs text-muted-foreground">or paste a URL</span>
                <div className="flex-1 h-px bg-border" />
              </div>
              {/* URL fallback */}
              <Input
                value={uploadedFileName ? "" : form.documentUrl}
                disabled={!!uploadedFileName}
                onChange={e => setForm(f => ({ ...f, documentUrl: e.target.value }))}
                placeholder="https://… link to document management system"
              />
            </div>
            {!editingId && currentFra && (
              <div className="rounded bg-amber-50 dark:bg-amber-950 border border-amber-200 p-3 text-sm text-amber-800 dark:text-amber-200">
                The previous FRA ({new Date(currentFra.assessmentDate).toLocaleDateString("en-GB")}) will be marked as superseded.
              </div>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => { setShowForm(false); setEditingId(null); }}>Cancel</Button>
              <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
                {editingId ? "Save Changes" : "Record FRA"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Add / Edit action item dialog */}
      <Dialog open={showActionForm} onOpenChange={open => { if (!open) { setShowActionForm(false); setEditingActionId(null); } }}>
        <DialogContent className="max-w-md max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingActionId ? "Edit Action Item" : "Add Fire Safety Action"}</DialogTitle>
            <DialogDescription>Record an action required from the findings of this Fire Risk Assessment.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleActionSubmit} className="space-y-4">

            {/* Common actions picker — shown only when adding, not editing */}
            {!editingActionId && (
              <div>
                <Label>Common fire safety issues</Label>
                <Select
                  value={actionForm.commonAction}
                  onValueChange={v => {
                    if (v === "other") {
                      setActionForm(f => ({ ...f, commonAction: "other", description: "", priority: "medium" }));
                    } else {
                      const found = COMMON_ACTIONS.find(a => a.label === v);
                      setActionForm(f => ({
                        ...f,
                        commonAction: v,
                        description: v,
                        priority: found?.priority ?? "medium",
                      }));
                    }
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a common issue or choose Other…" />
                  </SelectTrigger>
                  <SelectContent>
                    {COMMON_ACTIONS.map(a => (
                      <SelectItem key={a.label} value={a.label === "Other (describe below)" ? "other" : a.label}>
                        {a.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Description — always shown when editing; shown when Other selected or after any common pick */}
            {(editingActionId || actionForm.commonAction) && (
              <div>
                <Label>{actionForm.commonAction === "other" ? "Description *" : "Description (edit if needed) *"}</Label>
                <Textarea
                  required
                  rows={3}
                  value={actionForm.description}
                  onChange={e => setActionForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="Describe what needs to be done and any relevant detail…"
                />
              </div>
            )}

            {/* Priority + due date — shown once an action type is chosen */}
            {(editingActionId || actionForm.commonAction) && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Priority *</Label>
                  <Select value={actionForm.priority} onValueChange={v => setActionForm(f => ({ ...f, priority: v as any }))}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="critical">🔴 Critical — immediate risk to life</SelectItem>
                      <SelectItem value="high">🟠 High — resolve within 1 month</SelectItem>
                      <SelectItem value="medium">🟡 Medium — resolve within 3 months</SelectItem>
                      <SelectItem value="low">🔵 Low — resolve within 12 months</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Due date</Label>
                  <Input type="date" value={actionForm.dueDate} onChange={e => setActionForm(f => ({ ...f, dueDate: e.target.value }))} />
                </div>
              </div>
            )}

            {(editingActionId || actionForm.commonAction) && (
              <>
                <div>
                  <Label>Location on premises</Label>
                  <Input value={actionForm.location} onChange={e => setActionForm(f => ({ ...f, location: e.target.value }))} placeholder="e.g. Ground floor stairwell, Server room" />
                </div>
                <div>
                  <Label>Assigned to</Label>
                  <Select
                    value={actionForm.assignedTo}
                    onValueChange={v => setActionForm(f => ({ ...f, assignedTo: v, assignedToOther: v !== "__other__" ? "" : f.assignedToOther }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select a staff member…" />
                    </SelectTrigger>
                    <SelectContent>
                      {staffList.map(s => (
                        <SelectItem key={s.id} value={`${s.firstName} ${s.lastName}`}>
                          {s.firstName} {s.lastName}{s.jobTitle ? ` — ${s.jobTitle}` : ""}
                        </SelectItem>
                      ))}
                      <SelectItem value="__other__">Other / enter role manually…</SelectItem>
                    </SelectContent>
                  </Select>
                  {actionForm.assignedTo === "__other__" && (
                    <Input
                      className="mt-2"
                      value={actionForm.assignedToOther}
                      onChange={e => setActionForm(f => ({ ...f, assignedToOther: e.target.value }))}
                      placeholder="e.g. Facilities Manager, Head of H&S"
                    />
                  )}
                </div>
              </>
            )}

            {actionForm.priority === "critical" && !editingActionId && (
              <div className="rounded bg-red-50 dark:bg-red-950 border border-red-200 p-3 text-sm text-red-800 dark:text-red-200">
                🚨 A critical priority action will trigger an immediate email alert to site management.
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => { setShowActionForm(false); setEditingActionId(null); }}>Cancel</Button>
              {(editingActionId || actionForm.commonAction) && (
                <Button type="submit" disabled={createActionMutation.isPending || updateActionMutation.isPending}>
                  {editingActionId ? "Save Changes" : "Add Action"}
                </Button>
              )}
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Mark complete dialog */}
      <Dialog open={!!completingActionId} onOpenChange={open => { if (!open) setCompletingActionId(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Mark Action as Complete</DialogTitle>
            <DialogDescription>Record how this action was resolved. Completion is attributed to your account. Completed actions remain on record as evidence of compliance.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCompleteSubmit} className="space-y-4">
            <div>
              <Label>Completion notes</Label>
              <Textarea
                rows={3}
                value={completeForm.completionNotes}
                onChange={e => setCompleteForm(f => ({ ...f, completionNotes: e.target.value }))}
                placeholder="Describe what was done to resolve this action (optional but recommended for audit purposes)"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setCompletingActionId(null)}>Cancel</Button>
              <Button type="submit" className="bg-green-600 hover:bg-green-700" disabled={completeActionMutation.isPending}>
                <CheckCircle size={14} className="mr-1" /> Mark Complete
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={open => { if (!open) setDeleteId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this FRA record?</AlertDialogTitle>
            <AlertDialogDescription>This will permanently remove this fire risk assessment record and all associated action items.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-red-600 hover:bg-red-700" onClick={() => deleteMutation.mutate(deleteId!)}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
