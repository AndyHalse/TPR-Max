import { useState, useRef, useCallback, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Plus, ChevronDown, ChevronUp, Trash2, Printer, ArrowLeft, Info,
  Sparkles, CheckCircle, AlertTriangle, FileEdit, Save, Loader2,
  ExternalLink, X,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────

type RAType = "general" | "coshh" | "manual_handling" | "working_at_height" | "lone_working" | "dse";
type AssessmentStatus = "draft" | "review" | "approved" | "archived";

interface Assessment {
  id: string;
  title: string;
  raType: RAType;
  status: AssessmentStatus;
  taskDescription?: string | null;
  location?: string | null;
  department?: string | null;
  preparedBy?: string | null;
  reviewedBy?: string | null;
  approvedBy?: string | null;
  assessmentDate?: string | null;
  nextReviewDate?: string | null;
  typeMetadata?: string | null;
  notes?: string | null;
  linkedRamsDocumentId?: string | null;
  hazards?: Hazard[];
  createdAt?: string;
  updatedAt?: string;
}

interface Hazard {
  id: string;
  assessmentId: string;
  hazardDescription: string;
  affectedPersons?: string | null;
  existingControls?: string | null;
  likelihood: number;
  severity: number;
  riskRating: number;
  additionalControls?: string | null;
  residualLikelihood: number;
  residualSeverity: number;
  residualRiskRating: number;
  actionBy?: string | null;
  actionDate?: string | null;
  actionStatus?: string | null;
  sortOrder: number;
}

// ── Helpers ────────────────────────────────────────────────────────────────

const RA_TYPE_CONFIG: Record<RAType, { label: string; color: string }> = {
  general: { label: "General", color: "bg-blue-100 text-blue-800" },
  coshh: { label: "COSHH", color: "bg-purple-100 text-purple-800" },
  manual_handling: { label: "Manual Handling", color: "bg-orange-100 text-orange-800" },
  working_at_height: { label: "Working at Height", color: "bg-red-100 text-red-800" },
  lone_working: { label: "Lone Working", color: "bg-amber-100 text-amber-800" },
  dse: { label: "DSE", color: "bg-teal-100 text-teal-800" },
};

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  draft: { label: "Draft", color: "bg-slate-100 text-slate-700" },
  review: { label: "Under Review", color: "bg-yellow-100 text-yellow-800" },
  approved: { label: "Approved", color: "bg-green-100 text-green-800" },
  archived: { label: "Archived", color: "bg-gray-100 text-gray-600" },
};

function riskBand(rating: number): { pill: string; label: string } {
  if (rating <= 4) return { pill: "bg-green-100 text-green-800", label: "Low" };
  if (rating <= 9) return { pill: "bg-amber-100 text-amber-800", label: "Medium" };
  if (rating <= 14) return { pill: "bg-orange-100 text-orange-800", label: "High" };
  return { pill: "bg-red-100 text-red-800", label: "Very High" };
}

function RiskPill({ rating, size = "sm" }: { rating: number; size?: "sm" | "xs" }) {
  const { pill, label } = riskBand(rating);
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className={`inline-flex items-center font-semibold rounded-full ${size === "xs" ? "px-2 py-0.5 text-xs" : "px-2.5 py-0.5 text-xs"} ${pill}`}>
          {rating} — {label}
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs text-xs" side="top">
        Risk Rating = Likelihood × Severity. Low 1–4 · Medium 5–9 · High 10–14 · Very High 15–25.
      </TooltipContent>
    </Tooltip>
  );
}

function ScoreSelector({
  value,
  onChange,
  tooltipText,
}: {
  value: number;
  onChange: (v: number) => void;
  tooltipText: string;
}) {
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n)}
          className={`w-8 h-8 rounded text-sm font-semibold border transition-colors ${
            value === n
              ? "bg-[#2460A9] text-white border-[#2460A9]"
              : "bg-white text-slate-600 border-slate-300 hover:border-[#2460A9]"
          }`}
        >
          {n}
        </button>
      ))}
      <Tooltip>
        <TooltipTrigger asChild>
          <button type="button" className="ml-1 text-slate-400 hover:text-slate-600">
            <Info className="h-4 w-4" />
          </button>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs text-xs" side="top">{tooltipText}</TooltipContent>
      </Tooltip>
    </div>
  );
}

function InfoTooltip({ text }: { text: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button type="button" className="inline text-slate-400 hover:text-slate-600 ml-1">
          <Info className="h-3.5 w-3.5 inline" />
        </button>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs text-xs" side="top">{text}</TooltipContent>
    </Tooltip>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────

export default function RaBuilder() {
  const { toast } = useToast();

  // View state
  const [showEditor, setShowEditor] = useState(false);
  const [currentAssessmentId, setCurrentAssessmentId] = useState<string | null>(null);

  // New assessment dialog
  const [newDialogOpen, setNewDialogOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newType, setNewType] = useState<RAType>("general");

  // List filters
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");

  // Editor state
  const [assessment, setAssessment] = useState<Partial<Assessment>>({});
  const [typeMetadata, setTypeMetadata] = useState<Record<string, any>>({});
  const [hazards, setHazards] = useState<Hazard[]>([]);
  const [expandedHazards, setExpandedHazards] = useState<Set<string>>(new Set());
  const [aiSuggestions, setAiSuggestions] = useState<Record<string, string[]>>({});
  const [aiLoading, setAiLoading] = useState<Record<string, boolean>>({});

  // Auto-save
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hazardTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle");

  // ── Queries ──────────────────────────────────────────────────────────────

  const { data: assessments = [], isLoading: listLoading } = useQuery<Assessment[]>({
    queryKey: ["/api/ra-builder/assessments"],
    enabled: !showEditor,
  });

  const { data: loadedAssessment, isLoading: editorLoading } = useQuery<Assessment>({
    queryKey: ["/api/ra-builder/assessments", currentAssessmentId],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/ra-builder/assessments/${currentAssessmentId}`);
      return res.json();
    },
    enabled: !!currentAssessmentId && showEditor,
  });

  useEffect(() => {
    if (loadedAssessment) {
      setAssessment(loadedAssessment);
      setTypeMetadata(JSON.parse(loadedAssessment.typeMetadata || "{}"));
      setHazards(loadedAssessment.hazards || []);
    }
  }, [loadedAssessment]);

  // ── Auto-save helpers ────────────────────────────────────────────────────

  const scheduleAutoSave = useCallback((updates: Partial<Assessment>, meta?: Record<string, any>) => {
    if (!currentAssessmentId) return;
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    setSaveStatus("saving");
    autoSaveTimer.current = setTimeout(async () => {
      try {
        const payload: any = { ...updates };
        if (meta !== undefined) payload.typeMetadata = JSON.stringify(meta);
        await apiRequest("PUT", `/api/ra-builder/assessments/${currentAssessmentId}`, payload);
        setSaveStatus("saved");
        queryClient.invalidateQueries({ queryKey: ["/api/ra-builder/assessments"] });
      } catch {
        setSaveStatus("idle");
      }
    }, 800);
  }, [currentAssessmentId]);

  const scheduleHazardSave = useCallback((hazardId: string, updates: Partial<Hazard>) => {
    if (hazardTimers.current[hazardId]) clearTimeout(hazardTimers.current[hazardId]);
    hazardTimers.current[hazardId] = setTimeout(async () => {
      try {
        await apiRequest("PUT", `/api/ra-builder/assessments/${currentAssessmentId}/hazards/${hazardId}`, updates);
      } catch (e) {
        console.error("Hazard auto-save failed", e);
      }
    }, 800);
  }, [currentAssessmentId]);

  const updateAssessmentField = (field: keyof Assessment, value: any) => {
    const updated = { ...assessment, [field]: value };
    setAssessment(updated);
    scheduleAutoSave({ [field]: value } as any);
  };

  const updateMetaField = (field: string, value: any) => {
    const updated = { ...typeMetadata, [field]: value };
    setTypeMetadata(updated);
    scheduleAutoSave({}, updated);
  };

  const updateHazardField = (hazardId: string, field: keyof Hazard, value: any) => {
    setHazards((prev) => {
      const updated = prev.map((h) => {
        if (h.id !== hazardId) return h;
        const next = { ...h, [field]: value };
        if (field === "likelihood" || field === "severity") {
          next.riskRating = (field === "likelihood" ? Number(value) : h.likelihood) *
            (field === "severity" ? Number(value) : h.severity);
        }
        if (field === "residualLikelihood" || field === "residualSeverity") {
          next.residualRiskRating =
            (field === "residualLikelihood" ? Number(value) : h.residualLikelihood) *
            (field === "residualSeverity" ? Number(value) : h.residualSeverity);
        }
        scheduleHazardSave(hazardId, { [field]: value } as any);
        return next;
      });
      return updated;
    });
  };

  // ── Mutations ────────────────────────────────────────────────────────────

  const createMutation = useMutation({
    mutationFn: async (data: { title: string; raType: string }) => {
      const res = await apiRequest("POST", "/api/ra-builder/assessments", data);
      return res.json() as Promise<Assessment>;
    },
    onSuccess: (row) => {
      setNewDialogOpen(false);
      setNewTitle("");
      setNewType("general");
      setCurrentAssessmentId(row.id);
      setAssessment(row);
      setTypeMetadata({});
      setHazards([]);
      setExpandedHazards(new Set());
      setShowEditor(true);
      queryClient.invalidateQueries({ queryKey: ["/api/ra-builder/assessments"] });
    },
    onError: () => toast({ title: "Failed to create assessment", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/ra-builder/assessments/${id}`);
    },
    onSuccess: () => {
      toast({ title: "Assessment deleted" });
      queryClient.invalidateQueries({ queryKey: ["/api/ra-builder/assessments"] });
    },
    onError: () => toast({ title: "Failed to delete assessment", variant: "destructive" }),
  });

  const approveMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/ra-builder/assessments/${currentAssessmentId}/approve`, {});
      return res.json() as Promise<Assessment>;
    },
    onSuccess: (row) => {
      setAssessment(row);
      toast({ title: "Assessment approved and added to RAMS library" });
      queryClient.invalidateQueries({ queryKey: ["/api/ra-builder/assessments"] });
    },
    onError: () => toast({ title: "Failed to approve assessment", variant: "destructive" }),
  });

  const addHazardMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/ra-builder/assessments/${currentAssessmentId}/hazards`, {
        hazardDescription: "",
        likelihood: 3,
        severity: 3,
        residualLikelihood: 2,
        residualSeverity: 2,
        sortOrder: hazards.length,
      });
      return res.json() as Promise<Hazard>;
    },
    onSuccess: (row) => {
      setHazards((prev) => [...prev, row]);
      setExpandedHazards((prev) => new Set([...prev, row.id]));
    },
    onError: () => toast({ title: "Failed to add hazard", variant: "destructive" }),
  });

  const deleteHazardMutation = useMutation({
    mutationFn: async (hazardId: string) => {
      await apiRequest("DELETE", `/api/ra-builder/assessments/${currentAssessmentId}/hazards/${hazardId}`);
      return hazardId;
    },
    onSuccess: (hazardId) => {
      setHazards((prev) => prev.filter((h) => h.id !== hazardId));
      setExpandedHazards((prev) => { const s = new Set(prev); s.delete(hazardId); return s; });
      setAiSuggestions((prev) => { const s = { ...prev }; delete s[hazardId]; return s; });
    },
    onError: () => toast({ title: "Failed to delete hazard", variant: "destructive" }),
  });

  const reorderHazard = async (index: number, direction: "up" | "down") => {
    const swapIndex = direction === "up" ? index - 1 : index + 1;
    if (swapIndex < 0 || swapIndex >= hazards.length) return;
    const reordered = [...hazards];
    [reordered[index], reordered[swapIndex]] = [reordered[swapIndex], reordered[index]];
    const withOrder = reordered.map((h, i) => ({ ...h, sortOrder: i }));
    setHazards(withOrder);
    await apiRequest("POST", `/api/ra-builder/assessments/${currentAssessmentId}/hazards/reorder`, {}, withOrder.map((h) => ({ id: h.id, sortOrder: h.sortOrder })));
  };

  const suggestControls = async (hazardId: string) => {
    const hazard = hazards.find((h) => h.id === hazardId);
    if (!hazard || !hazard.hazardDescription) {
      toast({ title: "Enter a hazard description first", variant: "destructive" }); return;
    }
    setAiLoading((prev) => ({ ...prev, [hazardId]: true }));
    try {
      const res = await apiRequest("POST", "/api/ra-builder/suggest-controls", {
        raType: assessment.raType,
        hazardDescription: hazard.hazardDescription,
        taskDescription: assessment.taskDescription,
        existingControls: hazard.existingControls,
      });
      const data = await res.json();
      if (data.error === "no_api_key") {
        toast({ title: "No Claude API key configured. Add one in Settings > AI.", variant: "destructive" });
      } else if (data.error === "ai_failed") {
        toast({ title: data.message || "AI suggestion failed", variant: "destructive" });
      } else {
        setAiSuggestions((prev) => ({ ...prev, [hazardId]: data.suggestions || [] }));
      }
    } catch {
      toast({ title: "AI suggestion request failed", variant: "destructive" });
    } finally {
      setAiLoading((prev) => ({ ...prev, [hazardId]: false }));
    }
  };

  const appendSuggestion = (hazardId: string, suggestion: string) => {
    const hazard = hazards.find((h) => h.id === hazardId);
    const existing = hazard?.additionalControls || "";
    const updated = existing ? `${existing}\n${suggestion}` : suggestion;
    updateHazardField(hazardId, "additionalControls", updated);
  };

  // ── Export PDF (opens new print window) ──────────────────────────────────

  const handleExportPdf = () => {
    const meta = typeMetadata;
    const raTypeLabel = RA_TYPE_CONFIG[assessment.raType as RAType]?.label || assessment.raType || "General";
    const statusLabel = STATUS_CONFIG[assessment.status || "draft"]?.label || assessment.status || "Draft";

    const riskClass = (r: number) => r >= 15 ? "risk-vhigh" : r >= 10 ? "risk-high" : r >= 5 ? "risk-medium" : "risk-low";
    const riskLabel = (r: number) => r >= 15 ? "Very High" : r >= 10 ? "High" : r >= 5 ? "Medium" : "Low";
    const esc = (s: string | null | undefined) => String(s || "—").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

    const metaRows = Object.entries(meta)
      .filter(([, v]) => v !== "" && v !== null && v !== undefined)
      .map(([k, v]) => `<tr><td style="width:160px;font-weight:bold">${k.replace(/([A-Z])/g, " $1").replace(/^./, s => s.toUpperCase())}</td><td>${Array.isArray(v) ? v.join(", ") : esc(String(v))}</td></tr>`)
      .join("");

    const hazardRows = hazards.map((h, i) => `
      <tr>
        <td style="text-align:center">${i + 1}</td>
        <td>${esc(h.hazardDescription)}</td>
        <td>${esc(h.affectedPersons)}</td>
        <td>${esc(h.existingControls)}</td>
        <td style="text-align:center">${h.likelihood}</td>
        <td style="text-align:center">${h.severity}</td>
        <td class="${riskClass(h.riskRating)}" style="text-align:center">${h.riskRating}<br><small>${riskLabel(h.riskRating)}</small></td>
        <td>${esc(h.additionalControls)}</td>
        <td style="text-align:center">${h.residualLikelihood}</td>
        <td style="text-align:center">${h.residualSeverity}</td>
        <td class="${riskClass(h.residualRiskRating)}" style="text-align:center">${h.residualRiskRating}<br><small>${riskLabel(h.residualRiskRating)}</small></td>
        <td>${esc(h.actionBy)}</td>
        <td>${esc(h.actionDate)}</td>
      </tr>`).join("");

    const html = `<!DOCTYPE html>
<html><head>
  <meta charset="UTF-8">
  <title>Risk Assessment — ${esc(assessment.title)}</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:Arial,sans-serif;font-size:10pt;color:#111;padding:20px}
    h1{font-size:15pt;margin-bottom:4px}
    h2{font-size:11pt;margin:14px 0 5px;border-bottom:1px solid #ccc;padding-bottom:3px;color:#1a3a6b}
    .header{display:flex;justify-content:space-between;border-bottom:2px solid #1a3a6b;margin-bottom:12px;padding-bottom:8px}
    .header-right{text-align:right;font-size:9pt;color:#555}
    .meta-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:12px;font-size:9pt;background:#f5f7fa;padding:10px;border-radius:4px}
    .meta-label{font-weight:bold;color:#333;font-size:8pt;text-transform:uppercase;letter-spacing:.4px;margin-bottom:2px}
    table{width:100%;border-collapse:collapse;font-size:8.5pt;margin-bottom:12px}
    th,td{border:1px solid #ccc;padding:3px 5px;vertical-align:top}
    th{background:#e8eef5;font-weight:bold;text-align:left;white-space:nowrap}
    .risk-low{background:#d1fae5;color:#065f46;font-weight:bold}
    .risk-medium{background:#fef3c7;color:#92400e;font-weight:bold}
    .risk-high{background:#ffedd5;color:#9a3412;font-weight:bold}
    .risk-vhigh{background:#fee2e2;color:#991b1b;font-weight:bold}
    .signoff{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-top:16px;border-top:1px solid #ccc;padding-top:12px}
    .signoff-box{border:1px solid #ddd;padding:8px;border-radius:4px;font-size:9pt}
    .signoff-role{font-weight:bold;color:#1a3a6b;margin-bottom:4px}
    .sig-line{margin-top:20px;border-top:1px solid #999;padding-top:2px;font-size:8pt;color:#777}
    .notes{margin-top:12px;padding:8px;background:#f9f9f9;border:1px solid #ddd;font-size:9pt;border-radius:4px}
    .footer{margin-top:20px;border-top:1px solid #eee;padding-top:8px;font-size:8pt;color:#999;display:flex;justify-content:space-between}
    @media print{@page{size:A4 landscape;margin:1.2cm}}
  </style>
</head><body>
  <div class="header">
    <div>
      <h1>${esc(assessment.title)}</h1>
      <div style="font-size:9pt;color:#555;margin-top:2px">
        Type: <strong>${raTypeLabel}</strong> &nbsp;|&nbsp;
        Status: <strong>${statusLabel}</strong> &nbsp;|&nbsp;
        Ref: <strong>RA-${(currentAssessmentId || "").substring(0, 8).toUpperCase()}</strong>
      </div>
    </div>
    <div class="header-right">
      <div>Assessment Date: <strong>${esc(assessment.assessmentDate)}</strong></div>
      <div>Next Review: <strong>${esc(assessment.nextReviewDate)}</strong></div>
      <div>Location: <strong>${esc(assessment.location)}</strong></div>
      <div>Printed: <strong>${new Date().toLocaleDateString("en-GB")}</strong></div>
    </div>
  </div>
  <div class="meta-grid">
    <div><div class="meta-label">Task / Activity</div>${esc(assessment.taskDescription)}</div>
    <div><div class="meta-label">Department</div>${esc(assessment.department)}</div>
    <div><div class="meta-label">Prepared By</div>${esc(assessment.preparedBy)}</div>
  </div>
  ${assessment.raType !== "general" && metaRows ? `<h2>${raTypeLabel} — Specific Details</h2><table style="max-width:600px"><tbody>${metaRows}</tbody></table>` : ""}
  <h2>Hazard Register (${hazards.length} hazard${hazards.length !== 1 ? "s" : ""})</h2>
  ${hazards.length === 0 ? `<p style="color:#999;font-size:9pt">No hazards recorded.</p>` : `
  <table>
    <thead><tr>
      <th style="width:25px">#</th>
      <th style="width:130px">Hazard Description</th>
      <th style="width:85px">Who Affected</th>
      <th style="width:115px">Existing Controls</th>
      <th style="width:22px;text-align:center">L</th>
      <th style="width:22px;text-align:center">S</th>
      <th style="width:52px;text-align:center">Risk</th>
      <th style="width:125px">Additional Controls</th>
      <th style="width:28px;text-align:center">R.L</th>
      <th style="width:28px;text-align:center">R.S</th>
      <th style="width:60px;text-align:center">Residual</th>
      <th style="width:80px">Action By</th>
      <th style="width:60px">Due Date</th>
    </tr></thead>
    <tbody>${hazardRows}</tbody>
  </table>`}
  <div class="signoff">
    <div class="signoff-box"><div class="signoff-role">Prepared By</div><div>${esc(assessment.preparedBy)}</div><div class="sig-line">Signature</div></div>
    <div class="signoff-box"><div class="signoff-role">Reviewed By</div><div>${esc(assessment.reviewedBy)}</div><div class="sig-line">Signature</div></div>
    <div class="signoff-box"><div class="signoff-role">Approved By</div><div>${esc(assessment.approvedBy)}</div><div class="sig-line">Signature</div></div>
  </div>
  ${assessment.notes ? `<div class="notes"><strong>Notes:</strong> ${esc(assessment.notes)}</div>` : ""}
  <div class="footer">
    <span>TPR Max — Connected Workforce &amp; Site Safety Platform</span>
    <span>Generated: ${new Date().toLocaleString("en-GB")}</span>
  </div>
</body></html>`;

    const win = window.open("", "_blank");
    if (!win) {
      toast({ title: "Allow pop-ups to print / export PDF", variant: "destructive" });
      return;
    }
    win.document.write(html);
    win.document.close();
    setTimeout(() => win.print(), 600);
  };

  // ── Navigation ───────────────────────────────────────────────────────────

  const openEditor = (a: Assessment) => {
    setCurrentAssessmentId(a.id);
    setAssessment(a);
    setTypeMetadata(JSON.parse(a.typeMetadata || "{}"));
    setHazards(a.hazards || []);
    setExpandedHazards(new Set());
    setAiSuggestions({});
    setShowEditor(true);
  };

  const closeEditor = () => {
    setShowEditor(false);
    setCurrentAssessmentId(null);
    setAssessment({});
    setHazards([]);
    setSaveStatus("idle");
    queryClient.invalidateQueries({ queryKey: ["/api/ra-builder/assessments"] });
  };

  // ── Filtered list ────────────────────────────────────────────────────────

  const filteredAssessments = assessments.filter((a) => {
    if (statusFilter !== "all" && a.status !== statusFilter) return false;
    if (typeFilter !== "all" && a.raType !== typeFilter) return false;
    if (searchQuery && !a.title.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  // ── Risk summary (for Section 3) ─────────────────────────────────────────

  const riskSummary = {
    before: { veryHigh: 0, high: 0, medium: 0, low: 0 },
    after: { veryHigh: 0, high: 0, medium: 0, low: 0 },
  };
  hazards.forEach((h) => {
    const band = (r: number) => (r >= 15 ? "veryHigh" : r >= 10 ? "high" : r >= 5 ? "medium" : "low");
    (riskSummary.before as any)[band(h.riskRating)]++;
    (riskSummary.after as any)[band(h.residualRiskRating)]++;
  });

  // ── Editor view ───────────────────────────────────────────────────────────

  if (showEditor) {
    const raType = (assessment.raType || "general") as RAType;

    return (
      <TooltipProvider>
        <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900 p-4 md:p-6">
          {/* Top bar */}
          <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
            <button onClick={closeEditor} className="flex items-center gap-2 text-slate-600 hover:text-[#2460A9] text-sm font-medium">
              <ArrowLeft className="h-4 w-4" />
              Back to Assessments
            </button>
            <div className="flex items-center gap-3">
              <span className="text-xs text-slate-500">
                {saveStatus === "saving" && <span className="flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" />Saving…</span>}
                {saveStatus === "saved" && <span className="flex items-center gap-1 text-green-600"><CheckCircle className="h-3 w-3" />Saved</span>}
              </span>
              <Button variant="outline" size="sm" onClick={handleExportPdf}>
                <Printer className="h-4 w-4 mr-1" /> Print / Export PDF
              </Button>
              <Button size="sm" style={{ backgroundColor: "#2460A9" }}
                onClick={() => {
                  if (currentAssessmentId) {
                    setSaveStatus("saving");
                    apiRequest("PUT", `/api/ra-builder/assessments/${currentAssessmentId}`, {
                      ...assessment, typeMetadata: JSON.stringify(typeMetadata),
                    }).then(() => { setSaveStatus("saved"); queryClient.invalidateQueries({ queryKey: ["/api/ra-builder/assessments"] }); });
                  }
                }}
              >
                <Save className="h-4 w-4 mr-1" /> Save Draft
              </Button>
            </div>
          </div>

          <div className="max-w-5xl mx-auto space-y-6">

            {/* Section 1: Assessment Details */}
            <Card className="border-slate-200 dark:border-slate-700">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center gap-2">
                  <FileEdit className="h-5 w-5 text-[#2460A9]" /> Assessment Details
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="md:col-span-2">
                    <Label>Assessment Title <span className="text-red-500">*</span></Label>
                    <Input className="mt-1" value={assessment.title || ""} onChange={(e) => updateAssessmentField("title", e.target.value)} placeholder="e.g. Manual Handling of Stock Boxes" />
                  </div>
                  <div>
                    <Label className="flex items-center">
                      Assessment Type
                      <InfoTooltip text="Choose the type that best matches your activity. Working at Height, COSHH and Manual Handling are legally distinct categories under UK H&S regulations." />
                    </Label>
                    <Select value={raType} onValueChange={(v) => updateAssessmentField("raType", v)}>
                      <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {Object.entries(RA_TYPE_CONFIG).map(([k, v]) => (
                          <SelectItem key={k} value={k}>{v.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Status</Label>
                    <Select value={assessment.status || "draft"} onValueChange={(v) => updateAssessmentField("status", v)}>
                      <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="draft">Draft</SelectItem>
                        <SelectItem value="review">Under Review</SelectItem>
                        <SelectItem value="approved">Approved</SelectItem>
                        <SelectItem value="archived">Archived</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="md:col-span-2">
                    <Label>Task / Activity Description</Label>
                    <Textarea className="mt-1" rows={2} value={assessment.taskDescription || ""} onChange={(e) => updateAssessmentField("taskDescription", e.target.value)} placeholder="What work is being assessed?" />
                  </div>
                  <div>
                    <Label>Location / Area</Label>
                    <Input className="mt-1" value={assessment.location || ""} onChange={(e) => updateAssessmentField("location", e.target.value)} />
                  </div>
                  <div>
                    <Label>Department</Label>
                    <Input className="mt-1" value={assessment.department || ""} onChange={(e) => updateAssessmentField("department", e.target.value)} />
                  </div>
                  <div>
                    <Label>Assessment Date</Label>
                    <Input type="date" className="mt-1" value={assessment.assessmentDate || ""} onChange={(e) => updateAssessmentField("assessmentDate", e.target.value)} />
                  </div>
                  <div>
                    <Label>Next Review Date</Label>
                    <Input type="date" className="mt-1" value={assessment.nextReviewDate || ""} onChange={(e) => updateAssessmentField("nextReviewDate", e.target.value)} />
                  </div>
                  <div>
                    <Label>Prepared By</Label>
                    <StaffNamePicker
                      value={assessment.preparedBy || ""}
                      onChange={(v) => updateAssessmentField("preparedBy", v)}
                      placeholder="Select or enter preparer…"
                    />
                  </div>
                  <div>
                    <Label>Reviewed By</Label>
                    <StaffNamePicker
                      value={assessment.reviewedBy || ""}
                      onChange={(v) => updateAssessmentField("reviewedBy", v)}
                      placeholder="Select or enter reviewer…"
                    />
                  </div>
                  <div>
                    <Label className={assessment.status !== "approved" ? "text-slate-400" : ""}>Approved By</Label>
                    <StaffNamePicker
                      value={assessment.approvedBy || ""}
                      onChange={(v) => updateAssessmentField("approvedBy", v)}
                      placeholder="Select or enter approver…"
                      disabled={assessment.status !== "approved"}
                    />
                  </div>
                  <div className="md:col-span-2">
                    <Label>Notes</Label>
                    <Textarea className="mt-1" rows={2} value={assessment.notes || ""} onChange={(e) => updateAssessmentField("notes", e.target.value)} />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Section 1b: Type-specific fields */}
            {raType !== "general" && (
              <Card className="border-slate-200 dark:border-slate-700">
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg">{RA_TYPE_CONFIG[raType].label} — Specific Details</CardTitle>
                </CardHeader>
                <CardContent>
                  <TypeSpecificFields raType={raType} meta={typeMetadata} onChange={updateMetaField} />
                </CardContent>
              </Card>
            )}

            {/* Section 2: Hazard Register */}
            <Card className="border-slate-200 dark:border-slate-700">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg flex items-center gap-2">
                    Hazard Register
                    <InfoTooltip text="A well-controlled assessment should show all Very High and High pre-control ratings reduced to Medium or Low after controls are applied." />
                  </CardTitle>
                  <Button size="sm" onClick={() => addHazardMutation.mutate()} disabled={addHazardMutation.isPending} style={{ backgroundColor: "#2460A9" }}>
                    <Plus className="h-4 w-4 mr-1" /> Add Hazard
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {hazards.length === 0 && (
                  <div className="text-center py-8 text-slate-400 text-sm">
                    No hazards yet. Click "Add Hazard" to begin building your risk register.
                  </div>
                )}
                {hazards.map((h, idx) => (
                  <HazardCard
                    key={h.id}
                    hazard={h}
                    index={idx}
                    total={hazards.length}
                    expanded={expandedHazards.has(h.id)}
                    onToggle={() => setExpandedHazards((prev) => {
                      const s = new Set(prev);
                      s.has(h.id) ? s.delete(h.id) : s.add(h.id);
                      return s;
                    })}
                    onChange={(field, value) => updateHazardField(h.id, field, value)}
                    onDelete={() => deleteHazardMutation.mutate(h.id)}
                    onMoveUp={() => reorderHazard(idx, "up")}
                    onMoveDown={() => reorderHazard(idx, "down")}
                    onAiSuggest={() => suggestControls(h.id)}
                    aiLoading={!!aiLoading[h.id]}
                    aiSuggestions={aiSuggestions[h.id] || []}
                    onAppendSuggestion={(s) => appendSuggestion(h.id, s)}
                    onDismissSuggestions={() => setAiSuggestions((prev) => { const n = { ...prev }; delete n[h.id]; return n; })}
                  />
                ))}
              </CardContent>
            </Card>

            {/* Section 3: Risk Summary */}
            <Card className="border-slate-200 dark:border-slate-700">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center gap-2">
                  Risk Summary
                  <InfoTooltip text="A well-controlled assessment should show all Very High and High risks reduced to Medium or Low once additional controls are applied." />
                </CardTitle>
              </CardHeader>
              <CardContent>
                {hazards.length === 0 ? (
                  <p className="text-slate-400 text-sm">Add hazards above to see your risk summary.</p>
                ) : (
                  <div className="grid md:grid-cols-2 gap-6">
                    {[
                      { label: "Before Controls", data: riskSummary.before },
                      { label: "After Controls (Residual)", data: riskSummary.after },
                    ].map(({ label, data }) => (
                      <div key={label}>
                        <div className="font-medium text-sm text-slate-700 mb-2">{label}</div>
                        <div className="space-y-1.5">
                          {[
                            { key: "veryHigh", label: "Very High", color: "bg-red-500" },
                            { key: "high", label: "High", color: "bg-orange-500" },
                            { key: "medium", label: "Medium", color: "bg-amber-400" },
                            { key: "low", label: "Low", color: "bg-green-500" },
                          ].map(({ key, label: l, color }) => {
                            const count = (data as any)[key];
                            const pct = hazards.length ? Math.round((count / hazards.length) * 100) : 0;
                            return (
                              <div key={key} className="flex items-center gap-2">
                                <span className="w-20 text-xs text-slate-600">{l}</span>
                                <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                                  <div className={`h-full ${color} rounded-full transition-all`} style={{ width: `${pct}%` }} />
                                </div>
                                <span className="w-4 text-xs text-slate-500 text-right">{count}</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                <div className="mt-4 pt-3 border-t text-sm text-slate-500">Total hazards: <strong>{hazards.length}</strong></div>
              </CardContent>
            </Card>

            {/* Section 4: Sign-Off */}
            <Card className="border-slate-200 dark:border-slate-700">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">Sign-Off & Publication</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {assessment.linkedRamsDocumentId ? (
                  <div className="flex items-center gap-3 p-4 bg-green-50 rounded-lg border border-green-200">
                    <CheckCircle className="h-5 w-5 text-green-600 flex-shrink-0" />
                    <div>
                      <div className="font-medium text-green-800">Published to RAMS library</div>
                      <div className="text-sm text-green-600">This assessment has been approved and added to the RAMS document register.</div>
                    </div>
                    <a href="/contractors" className="ml-auto flex items-center gap-1 text-sm text-[#2460A9] hover:underline">
                      View in RAMS Register <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                ) : (
                  <>
                    {assessment.status === "approved" && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            className="w-full"
                            style={{ backgroundColor: "#2460A9" }}
                            onClick={() => approveMutation.mutate()}
                            disabled={approveMutation.isPending}
                          >
                            {approveMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CheckCircle className="h-4 w-4 mr-2" />}
                            Approve & Publish to RAMS Library
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent className="max-w-xs text-xs" side="top">
                          Approving this assessment will automatically create a record in the RAMS document library and link it to the relevant contractor company if applicable.
                        </TooltipContent>
                      </Tooltip>
                    )}
                    {assessment.status !== "approved" && (
                      <p className="text-slate-500 text-sm text-center py-2">
                        Set Status to <strong>Approved</strong> above to publish this assessment to the RAMS document library.
                      </p>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </TooltipProvider>
    );
  }

  // ── List view ─────────────────────────────────────────────────────────────

  return (
    <TooltipProvider>
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900 p-4 md:p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <FileEdit className="h-6 w-6 text-[#2460A9]" /> Risk Assessment Builder
            </h1>
            <p className="text-slate-500 text-sm mt-0.5">Author, review and approve risk assessments — General, COSHH, Manual Handling, WAH, Lone Working & DSE</p>
          </div>
          <Button onClick={() => setNewDialogOpen(true)} style={{ backgroundColor: "#2460A9" }}>
            <Plus className="h-4 w-4 mr-2" /> New Assessment
          </Button>
        </div>

        {/* Filter bar */}
        <div className="flex flex-wrap gap-3 mb-6">
          <Input
            placeholder="Search assessments…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-60"
          />
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-40"><SelectValue placeholder="All statuses" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="review">Under Review</SelectItem>
              <SelectItem value="approved">Approved</SelectItem>
              <SelectItem value="archived">Archived</SelectItem>
            </SelectContent>
          </Select>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-44"><SelectValue placeholder="All types" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              {Object.entries(RA_TYPE_CONFIG).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Assessment list */}
        {listLoading ? (
          <div className="flex items-center justify-center py-16 text-slate-400">
            <Loader2 className="h-6 w-6 animate-spin mr-2" /> Loading assessments…
          </div>
        ) : filteredAssessments.length === 0 ? (
          <div className="text-center py-16 text-slate-400">
            <FileEdit className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p className="font-medium">No assessments found</p>
            <p className="text-sm mt-1">Create your first risk assessment to get started.</p>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {filteredAssessments.map((a) => {
              const typeConf = RA_TYPE_CONFIG[a.raType] || RA_TYPE_CONFIG.general;
              const statusConf = STATUS_CONFIG[a.status] || STATUS_CONFIG.draft;
              const maxRating = (a.hazards || []).reduce((m, h) => Math.max(m, h.riskRating), 0);
              return (
                <Card key={a.id} className="border-slate-200 dark:border-slate-700 hover:shadow-md transition-shadow">
                  <CardContent className="p-5">
                    <div className="flex flex-wrap gap-2 mb-3">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${typeConf.color}`}>{typeConf.label}</span>
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${statusConf.color}`}>{statusConf.label}</span>
                      {maxRating > 0 && <RiskPill rating={maxRating} size="xs" />}
                    </div>
                    <h3 className="font-semibold text-slate-900 dark:text-white mb-1 line-clamp-2">{a.title}</h3>
                    <div className="text-xs text-slate-500 mb-2 space-y-0.5">
                      {a.preparedBy && <div>By: {a.preparedBy}</div>}
                      {a.assessmentDate && <div>Date: {a.assessmentDate}</div>}
                    </div>
                    {a.taskDescription && (
                      <p className="text-xs text-slate-500 mb-3 line-clamp-2">{a.taskDescription.slice(0, 80)}{a.taskDescription.length > 80 ? "…" : ""}</p>
                    )}
                    <div className="text-xs text-slate-400 mb-4">
                      {(a.hazards || []).length} hazard{(a.hazards || []).length !== 1 ? "s" : ""}
                    </div>
                    <div className="flex gap-2 flex-wrap">
                      <Button size="sm" variant="outline" className="flex-1" onClick={() => openEditor(a)}>Edit</Button>
                      <Button size="sm" variant="outline" onClick={() => { openEditor(a); setTimeout(handlePrint, 300); }}>
                        <Printer className="h-3.5 w-3.5" />
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button size="sm" variant="outline" className="text-red-600 hover:text-red-700 hover:border-red-300">
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete Assessment?</AlertDialogTitle>
                            <AlertDialogDescription>This will permanently delete "{a.title}" and all its hazard rows. This cannot be undone.</AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction className="bg-red-600 hover:bg-red-700" onClick={() => deleteMutation.mutate(a.id)}>Delete</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {/* New Assessment Dialog */}
        <Dialog open={newDialogOpen} onOpenChange={setNewDialogOpen}>
          <DialogContent>
            <DialogHeader><DialogTitle>New Risk Assessment</DialogTitle></DialogHeader>
            <div className="space-y-4 py-2">
              <div>
                <Label>Assessment Title <span className="text-red-500">*</span></Label>
                <Input className="mt-1" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="e.g. Manual Handling of Stock" autoFocus />
              </div>
              <div>
                <Label>Assessment Type</Label>
                <Select value={newType} onValueChange={(v) => setNewType(v as RAType)}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(RA_TYPE_CONFIG).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setNewDialogOpen(false)}>Cancel</Button>
              <Button
                style={{ backgroundColor: "#2460A9" }}
                disabled={!newTitle.trim() || createMutation.isPending}
                onClick={() => createMutation.mutate({ title: newTitle.trim(), raType: newType })}
              >
                {createMutation.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Creating…</> : "Create Assessment"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </TooltipProvider>
  );
}

// ── Hazard Card ───────────────────────────────────────────────────────────

function HazardCard({
  hazard, index, total, expanded, onToggle, onChange, onDelete,
  onMoveUp, onMoveDown, onAiSuggest, aiLoading, aiSuggestions, onAppendSuggestion, onDismissSuggestions,
}: {
  hazard: Hazard; index: number; total: number; expanded: boolean;
  onToggle: () => void; onChange: (field: keyof Hazard, value: any) => void;
  onDelete: () => void; onMoveUp: () => void; onMoveDown: () => void;
  onAiSuggest: () => void; aiLoading: boolean;
  aiSuggestions: string[]; onAppendSuggestion: (s: string) => void; onDismissSuggestions: () => void;
}) {
  return (
    <div className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
      {/* Collapsed header */}
      <div
        className="flex items-center gap-3 p-4 bg-white dark:bg-slate-800 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700/50"
        onClick={onToggle}
      >
        <div className="flex flex-col gap-0.5 mr-1">
          <button type="button" disabled={index === 0} onClick={(e) => { e.stopPropagation(); onMoveUp(); }} className="text-slate-400 hover:text-slate-600 disabled:opacity-20 p-0.5"><ChevronUp className="h-3.5 w-3.5" /></button>
          <button type="button" disabled={index === total - 1} onClick={(e) => { e.stopPropagation(); onMoveDown(); }} className="text-slate-400 hover:text-slate-600 disabled:opacity-20 p-0.5"><ChevronDown className="h-3.5 w-3.5" /></button>
        </div>
        <span className="text-xs font-medium text-slate-400 w-5 text-center">{index + 1}</span>
        <span className="flex-1 text-sm font-medium text-slate-800 dark:text-white truncate">
          {hazard.hazardDescription || <span className="text-slate-400 italic">New hazard — click to edit</span>}
        </span>
        <div className="flex items-center gap-2 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
          <RiskPill rating={hazard.riskRating} size="xs" />
          <span className="text-slate-300 text-xs">→</span>
          <RiskPill rating={hazard.residualRiskRating} size="xs" />
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <button type="button" className="p-1 text-slate-400 hover:text-red-500 transition-colors">
                <Trash2 className="h-4 w-4" />
              </button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete hazard?</AlertDialogTitle>
                <AlertDialogDescription>This will permanently remove this hazard row.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction className="bg-red-600 hover:bg-red-700" onClick={onDelete}>Delete</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          {expanded ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
        </div>
      </div>

      {/* Expanded edit fields */}
      {expanded && (
        <div className="p-4 bg-slate-50 dark:bg-slate-900/40 border-t border-slate-200 dark:border-slate-700">
          <div className="grid md:grid-cols-2 gap-4">
            {/* Hazard Description */}
            <div className="md:col-span-2">
              <Label className="flex items-center">
                Hazard Description
                <InfoTooltip text="Describe the source of harm, not the harm itself. 'Trailing cables' not 'trip hazard'. Be specific." />
              </Label>
              <Textarea className="mt-1" rows={2} value={hazard.hazardDescription || ""} onChange={(e) => onChange("hazardDescription", e.target.value)} placeholder="Describe what could cause harm…" />
            </div>

            {/* Who is Affected */}
            <div>
              <Label className="flex items-center">
                Who is Affected
                <InfoTooltip text="Select all groups at risk. Employees, contractors and visitors have different legal protections — identifying them separately satisfies MHSWR reg 3." />
              </Label>
              <AffectedPersonsPicker
                value={hazard.affectedPersons || ""}
                onChange={(v) => onChange("affectedPersons", v)}
              />
            </div>

            {/* Existing Controls */}
            <div>
              <Label className="flex items-center">
                Existing Controls
                <InfoTooltip text="Controls already in place. Include: procedures, training completed, equipment already in use, supervision arrangements." />
              </Label>
              <Textarea className="mt-1" rows={2} value={hazard.existingControls || ""} onChange={(e) => onChange("existingControls", e.target.value)} placeholder="Controls already in place…" />
            </div>

            {/* Likelihood */}
            <div>
              <Label className="text-sm mb-2 block">Likelihood (before controls)</Label>
              <ScoreSelector
                value={hazard.likelihood}
                onChange={(v) => onChange("likelihood", v)}
                tooltipText="1 = Very Unlikely · 2 = Unlikely · 3 = Possible · 4 = Likely · 5 = Almost Certain"
              />
            </div>

            {/* Severity */}
            <div>
              <Label className="text-sm mb-2 block">Severity (before controls)</Label>
              <ScoreSelector
                value={hazard.severity}
                onChange={(v) => onChange("severity", v)}
                tooltipText="1 = Negligible · 2 = Minor (first aid) · 3 = Major (RIDDOR reportable) · 4 = Multiple serious injuries · 5 = Fatality"
              />
            </div>

            {/* Risk Rating */}
            <div className="md:col-span-2 flex items-center gap-3">
              <Label className="text-sm">Risk Rating (before):</Label>
              <RiskPill rating={hazard.riskRating} />
            </div>

            {/* Additional Controls */}
            <div className="md:col-span-2">
              <Label className="flex items-center">
                Additional Controls Required
                <InfoTooltip text="Follow the hierarchy of controls: Eliminate the hazard → Substitute → Engineering controls → Administrative controls → PPE (last resort)." />
              </Label>
              <div className="relative mt-1">
                <Textarea
                  rows={3}
                  value={hazard.additionalControls || ""}
                  onChange={(e) => onChange("additionalControls", e.target.value)}
                  placeholder="New controls to implement…"
                />
                <div className="mt-2">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={aiLoading}
                        onClick={onAiSuggest}
                        className="text-violet-700 border-violet-300 hover:bg-violet-50"
                      >
                        {aiLoading ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Sparkles className="h-3.5 w-3.5 mr-1" />}
                        AI Suggest Controls
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs text-xs" side="top">
                      Uses Claude AI to suggest control measures. Requires a Claude API key in Settings &gt; AI.
                    </TooltipContent>
                  </Tooltip>
                </div>

                {/* AI Suggestions panel */}
                {aiSuggestions.length > 0 && (
                  <div className="mt-3 p-3 bg-violet-50 border border-violet-200 rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-semibold text-violet-700">AI Suggestions</span>
                      <button type="button" onClick={onDismissSuggestions} className="text-violet-400 hover:text-violet-600"><X className="h-3.5 w-3.5" /></button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {aiSuggestions.map((s, i) => (
                        <button
                          key={i}
                          type="button"
                          onClick={() => onAppendSuggestion(s)}
                          className="flex items-center gap-1 text-xs bg-white border border-violet-200 text-violet-800 px-2 py-1 rounded-full hover:bg-violet-100 transition-colors text-left"
                        >
                          <Plus className="h-3 w-3 flex-shrink-0" />
                          <span className="line-clamp-2 max-w-xs">{s}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Residual Likelihood */}
            <div>
              <Label className="text-sm mb-2 block">Residual Likelihood (after controls)</Label>
              <ScoreSelector
                value={hazard.residualLikelihood}
                onChange={(v) => onChange("residualLikelihood", v)}
                tooltipText="Expected likelihood once all additional controls are in place."
              />
            </div>

            {/* Residual Severity */}
            <div>
              <Label className="text-sm mb-2 block">Residual Severity (after controls)</Label>
              <ScoreSelector
                value={hazard.residualSeverity}
                onChange={(v) => onChange("residualSeverity", v)}
                tooltipText="Expected severity once all additional controls are in place."
              />
            </div>

            {/* Residual Risk Rating */}
            <div className="md:col-span-2 flex items-center gap-3">
              <Label className="text-sm">Residual Risk Rating:</Label>
              <RiskPill rating={hazard.residualRiskRating} />
            </div>

            {/* Action By */}
            <div>
              <Label>Action By</Label>
              <StaffNamePicker
                value={hazard.actionBy || ""}
                onChange={(v) => onChange("actionBy", v)}
                placeholder="Select or enter responsible person…"
              />
            </div>

            {/* Action Date */}
            <div>
              <Label>Action Due Date</Label>
              <Input type="date" className="mt-1" value={hazard.actionDate || ""} onChange={(e) => onChange("actionDate", e.target.value)} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Type-Specific Fields Component ─────────────────────────────────────────

function TypeSpecificFields({ raType, meta, onChange }: {
  raType: RAType;
  meta: Record<string, any>;
  onChange: (field: string, value: any) => void;
}) {
  if (raType === "coshh") {
    const exposureOptions = ["Inhalation", "Skin contact", "Eye contact", "Ingestion"];
    const exposure: string[] = meta.exposureRoutes || [];
    return (
      <div className="grid md:grid-cols-2 gap-4">
        <div>
          <Label>Substance Name</Label>
          <Input className="mt-1" value={meta.substanceName || ""} onChange={(e) => onChange("substanceName", e.target.value)} />
        </div>
        <div>
          <Label className="flex items-center">CAS Number <InfoTooltip text="Chemical Abstracts Service number. Found on the Safety Data Sheet. Uniquely identifies the substance." /></Label>
          <Input className="mt-1" value={meta.casNumber || ""} onChange={(e) => onChange("casNumber", e.target.value)} />
        </div>
        <div>
          <Label>Safety Data Sheet Ref</Label>
          <Input className="mt-1" value={meta.sdsRef || ""} onChange={(e) => onChange("sdsRef", e.target.value)} />
        </div>
        <div>
          <Label>Physical Form</Label>
          <Select value={meta.form || ""} onValueChange={(v) => onChange("form", v)}>
            <SelectTrigger className="mt-1"><SelectValue placeholder="Select…" /></SelectTrigger>
            <SelectContent>
              {["Solid", "Liquid", "Gas", "Dust", "Aerosol", "Vapour", "Mist"].map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="flex items-center">Routes of Exposure <InfoTooltip text="Identify every way the substance can enter the body. A substance safe via skin contact may still be dangerous by inhalation." /></Label>
          <div className="flex flex-wrap gap-3 mt-2">
            {exposureOptions.map((opt) => (
              <label key={opt} className="flex items-center gap-2 text-sm cursor-pointer">
                <Checkbox
                  checked={exposure.includes(opt)}
                  onCheckedChange={(checked) => onChange("exposureRoutes", checked ? [...exposure, opt] : exposure.filter((r) => r !== opt))}
                />
                {opt}
              </label>
            ))}
          </div>
        </div>
        <div>
          <Label className="flex items-center">WEL Reference <InfoTooltip text="Workplace Exposure Limit — the legal maximum airborne concentration per EH40. Leave blank if no WEL applies." /></Label>
          <Input className="mt-1" value={meta.welReference || ""} onChange={(e) => onChange("welReference", e.target.value)} />
        </div>
        <div>
          <Label>Quantity Used / Stored</Label>
          <Input className="mt-1" value={meta.quantity || ""} onChange={(e) => onChange("quantity", e.target.value)} />
        </div>
        <div>
          <Label>Frequency of Use</Label>
          <Select value={meta.frequency || ""} onValueChange={(v) => onChange("frequency", v)}>
            <SelectTrigger className="mt-1"><SelectValue placeholder="Select…" /></SelectTrigger>
            <SelectContent>
              {["Daily", "Weekly", "Monthly", "Occasional", "One-off"].map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>
    );
  }

  if (raType === "manual_handling") {
    return (
      <div className="grid md:grid-cols-2 gap-4">
        <div>
          <Label>Load Description</Label>
          <Input className="mt-1" value={meta.loadDescription || ""} onChange={(e) => onChange("loadDescription", e.target.value)} />
        </div>
        <div>
          <Label>Approximate Weight (kg)</Label>
          <Input className="mt-1" value={meta.approxWeightKg || ""} onChange={(e) => onChange("approxWeightKg", e.target.value)} placeholder="e.g. 25" />
        </div>
        <div>
          <Label>Dimensions</Label>
          <Input className="mt-1" value={meta.dimensions || ""} onChange={(e) => onChange("dimensions", e.target.value)} placeholder="e.g. 1.2m × 0.6m" />
        </div>
        <div>
          <Label>Frequency of Task</Label>
          <Select value={meta.frequency || ""} onValueChange={(v) => onChange("frequency", v)}>
            <SelectTrigger className="mt-1"><SelectValue placeholder="Select…" /></SelectTrigger>
            <SelectContent>
              {["Constant", "Frequent", "Occasional", "Rare"].map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Distance Carried</Label>
          <Input className="mt-1" value={meta.distanceCarried || ""} onChange={(e) => onChange("distanceCarried", e.target.value)} placeholder="e.g. 10m" />
        </div>
        <div>
          <Label className="flex items-center">Posture Issues <InfoTooltip text="Awkward postures — bending, twisting, reaching above shoulder height — significantly increase injury risk." /></Label>
          <Textarea className="mt-1" rows={2} value={meta.postureIssues || ""} onChange={(e) => onChange("postureIssues", e.target.value)} placeholder="e.g. Requires bending, no mechanical aid available" />
        </div>
      </div>
    );
  }

  if (raType === "working_at_height") {
    return (
      <div className="grid md:grid-cols-2 gap-4">
        <div>
          <Label className="flex items-center">Maximum Working Height (metres) <InfoTooltip text="Under WAH Regulations 2005, any work where a person could fall and be injured is 'work at height', including work below ground level." /></Label>
          <Input className="mt-1" value={meta.maxHeightMetres || ""} onChange={(e) => onChange("maxHeightMetres", e.target.value)} placeholder="e.g. 3.5" />
        </div>
        <div>
          <Label>Access Equipment</Label>
          <Select value={meta.accessEquipment || ""} onValueChange={(v) => onChange("accessEquipment", v)}>
            <SelectTrigger className="mt-1"><SelectValue placeholder="Select…" /></SelectTrigger>
            <SelectContent>
              {["Ladder", "Step Ladder", "Podium Steps", "Scaffold", "Mobile Scaffold Tower", "MEWP", "Roof Access", "Other"].map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Surface / Ground Type</Label>
          <Input className="mt-1" value={meta.surfaceType || ""} onChange={(e) => onChange("surfaceType", e.target.value)} placeholder="e.g. Flat concrete, outdoor" />
        </div>
        <div>
          <Label className="flex items-center">Emergency Rescue Plan <InfoTooltip text="A rescue plan must exist before work begins. Detail how an injured or fallen worker would be recovered." /></Label>
          <Textarea className="mt-1" rows={3} value={meta.rescuePlan || ""} onChange={(e) => onChange("rescuePlan", e.target.value)} />
        </div>
      </div>
    );
  }

  if (raType === "lone_working") {
    return (
      <div className="grid md:grid-cols-2 gap-4">
        <div>
          <Label>Work Location</Label>
          <Input className="mt-1" value={meta.workLocation || ""} onChange={(e) => onChange("workLocation", e.target.value)} />
        </div>
        <div>
          <Label>Expected Work Duration</Label>
          <Input className="mt-1" value={meta.workDuration || ""} onChange={(e) => onChange("workDuration", e.target.value)} placeholder="e.g. 2–4 hours" />
        </div>
        <div>
          <Label className="flex items-center">Check-in Interval (minutes) <InfoTooltip text="TPR Max Lone Worker module automates check-ins. Link this assessment to a lone worker session for automated safety monitoring." /></Label>
          <Input type="number" className="mt-1" value={meta.checkInIntervalMins || ""} onChange={(e) => onChange("checkInIntervalMins", e.target.value)} placeholder="e.g. 60" />
        </div>
        <div>
          <Label>Emergency Contact Name</Label>
          <Input className="mt-1" value={meta.emergencyContactName || ""} onChange={(e) => onChange("emergencyContactName", e.target.value)} />
        </div>
        <div>
          <Label>Emergency Contact Phone</Label>
          <Input className="mt-1" value={meta.emergencyContactPhone || ""} onChange={(e) => onChange("emergencyContactPhone", e.target.value)} />
        </div>
        <div>
          <Label>Communication Method</Label>
          <Select value={meta.communicationMethod || ""} onValueChange={(v) => onChange("communicationMethod", v)}>
            <SelectTrigger className="mt-1"><SelectValue placeholder="Select…" /></SelectTrigger>
            <SelectContent>
              {["Mobile phone", "Radio", "Satellite phone", "None — remote area"].map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>
    );
  }

  if (raType === "dse") {
    return (
      <div className="grid md:grid-cols-2 gap-4">
        <div>
          <Label>Assessee Name</Label>
          <Input className="mt-1" value={meta.assesseeName || ""} onChange={(e) => onChange("assesseeName", e.target.value)} />
        </div>
        <div>
          <Label>Workstation Location</Label>
          <Input className="mt-1" value={meta.workstationLocation || ""} onChange={(e) => onChange("workstationLocation", e.target.value)} />
        </div>
        <div>
          <Label>Display Type</Label>
          <Select value={meta.displayType || ""} onValueChange={(v) => onChange("displayType", v)}>
            <SelectTrigger className="mt-1"><SelectValue placeholder="Select…" /></SelectTrigger>
            <SelectContent>
              {["Desktop monitor", "Laptop", "Tablet", "Dual screen"].map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Eye Test Status</Label>
          <Select value={meta.eyeTestStatus || ""} onValueChange={(v) => onChange("eyeTestStatus", v)}>
            <SelectTrigger className="mt-1"><SelectValue placeholder="Select…" /></SelectTrigger>
            <SelectContent>
              {["Up to date", "Due", "Not applicable"].map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Seating Notes</Label>
          <Textarea className="mt-1" rows={2} value={meta.seatingNotes || ""} onChange={(e) => onChange("seatingNotes", e.target.value)} />
        </div>
        <div>
          <Label>Keyboard & Mouse</Label>
          <Textarea className="mt-1" rows={2} value={meta.keyboardMouse || ""} onChange={(e) => onChange("keyboardMouse", e.target.value)} />
        </div>
        <div>
          <Label>Lighting Conditions</Label>
          <Textarea className="mt-1" rows={2} value={meta.lighting || ""} onChange={(e) => onChange("lighting", e.target.value)} />
        </div>
        <div>
          <Label>Environmental Notes</Label>
          <Textarea className="mt-1" rows={2} value={meta.environment || ""} onChange={(e) => onChange("environment", e.target.value)} />
        </div>
      </div>
    );
  }

  return <p className="text-slate-400 text-sm">No additional fields for General assessments.</p>;
}

// ── Staff Name Picker ────────────────────────────────────────────────────────

function StaffNamePicker({
  value,
  onChange,
  placeholder,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  const { data: staffList = [] } = useQuery<{ id: string; firstName: string; lastName: string }[]>({
    queryKey: ["/api/staff"],
    staleTime: 60000,
  });

  const [isManual, setIsManual] = useState(false);

  const staffNames = staffList.map((s) => `${s.firstName} ${s.lastName}`);

  useEffect(() => {
    if (value && !staffNames.includes(value) && staffList.length > 0) {
      setIsManual(true);
    }
  }, [value, staffList.length]);

  const selectValue = isManual ? "__manual__" : (value || "");

  return (
    <div className="space-y-1 mt-1">
      <Select
        value={selectValue}
        onValueChange={(v) => {
          if (v === "__manual__") {
            setIsManual(true);
            onChange("");
          } else {
            setIsManual(false);
            onChange(v);
          }
        }}
        disabled={disabled}
      >
        <SelectTrigger>
          <SelectValue placeholder={placeholder || "Select staff member…"} />
        </SelectTrigger>
        <SelectContent>
          {staffList.map((s) => {
            const name = `${s.firstName} ${s.lastName}`;
            return <SelectItem key={s.id} value={name}>{name}</SelectItem>;
          })}
          <SelectItem value="__manual__">✏️ Enter name manually…</SelectItem>
        </SelectContent>
      </Select>
      {isManual && (
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder || "Enter name…"}
          disabled={disabled}
        />
      )}
    </div>
  );
}

// ── Affected Persons Picker ──────────────────────────────────────────────────

const AFFECTED_GROUPS = [
  "Employees",
  "Contractors",
  "Visitors",
  "Members of Public",
  "Agency Staff",
  "Young Persons",
];

function AffectedPersonsPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const selected = value
    ? value.split(",").map((s) => s.trim()).filter(Boolean)
    : [];

  const toggle = (group: string) => {
    const next = selected.includes(group)
      ? selected.filter((s) => s !== group)
      : [...selected, group];
    onChange(next.join(", "));
  };

  return (
    <div className="mt-1 flex flex-wrap gap-2">
      {AFFECTED_GROUPS.map((group) => (
        <button
          key={group}
          type="button"
          onClick={() => toggle(group)}
          className={`text-xs px-3 py-1 rounded-full border transition-colors ${
            selected.includes(group)
              ? "bg-[#2460A9] text-white border-[#2460A9]"
              : "bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-300 hover:border-[#2460A9] hover:text-[#2460A9]"
          }`}
        >
          {selected.includes(group) ? "✓ " : ""}{group}
        </button>
      ))}
    </div>
  );
}
