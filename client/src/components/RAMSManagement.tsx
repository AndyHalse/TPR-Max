import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useRef } from "react";
import {
  FileText,
  Upload,
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  Search,
  Plus,
  Eye,
  RefreshCw,
  Building2,
  Users,
  Shield,
  History,
  ChevronRight,
  Download,
  X,
  Paperclip,
  Loader2,
  Check,
  User,
  Calendar,
} from "lucide-react";
import type { ContractorCompany, ContractorWorker } from "@shared/schema";

// ─── Types ───────────────────────────────────────────────────────────────────

interface RamsDoc {
  id: string;
  companyId: string | null;
  ramsIdRef: string;
  documentName: string;
  documentUrl: string;
  expiryDate: string;
  status: "pending_review" | "approved" | "rejected" | "expired" | "expiring";
  uploadedAt: string;
  uploadedBy: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  reviewNotes: string | null;
  version: number;
  previousVersionId: string | null;
  approvedBy: string | null;
  approvedAt: string | null;
  rejectionReason: string | null;
  jobDescription: string | null;
  siteLocation: string | null;
  workCategory: string | null;
  requiredBeforeAccess: boolean;
  alertDaysBefore: number;
  acknowledgementCount?: number;
}

interface RamsAck {
  id: string;
  ramsDocumentId: string;
  workerId: string;
  companyId: string | null;
  acknowledgedAt: string;
  method: string;
}

interface RamsAuditEntry {
  id: string;
  ramsDocumentId: string;
  action: string;
  performedBy: string | null;
  performedByName: string | null;
  performedAt: string;
  notes: string | null;
  metadata: string | null;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const WORK_CATEGORIES = [
  { value: "general", label: "General Works" },
  { value: "excavation", label: "Excavation & Groundworks" },
  { value: "electrical", label: "Electrical Works" },
  { value: "roofing", label: "Roofing & Height Work" },
  { value: "confined_space", label: "Confined Space Entry" },
  { value: "working_at_height", label: "Working at Height" },
  { value: "hot_works", label: "Hot Works / Welding" },
  { value: "demolition", label: "Demolition" },
  { value: "asbestos", label: "Asbestos-Related Works" },
  { value: "lifting", label: "Lifting Operations (LOLER)" },
  { value: "mechanical", label: "Mechanical / HVAC" },
  { value: "it_comms", label: "IT / Communications" },
];

const statusConfig: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  pending_review: { label: "Pending Review", color: "bg-amber-100 text-amber-800 border-amber-200", icon: Clock },
  approved:       { label: "Approved",        color: "bg-green-100 text-green-800 border-green-200",  icon: CheckCircle2 },
  rejected:       { label: "Rejected",        color: "bg-red-100 text-red-800 border-red-200",        icon: XCircle },
  expired:        { label: "Expired",         color: "bg-gray-100 text-gray-700 border-gray-200",     icon: AlertTriangle },
  expiring:       { label: "Expiring Soon",   color: "bg-orange-100 text-orange-800 border-orange-200", icon: AlertTriangle },
};

const actionLabels: Record<string, string> = {
  uploaded:    "Document Uploaded",
  approved:    "Document Approved",
  rejected:    "Document Rejected",
  new_version: "New Version Uploaded",
  acknowledged:"Acknowledged by Worker",
  archived:    "Document Archived",
  updated:     "Metadata Updated",
  expired:     "Document Expired",
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmt(d: string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function fmtTime(d: string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function StatusBadge({ status }: { status: string }) {
  const cfg = statusConfig[status] || { label: status, color: "bg-gray-100 text-gray-700 border-gray-200", icon: FileText };
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${cfg.color}`}>
      <Icon size={10} />
      {cfg.label}
    </span>
  );
}

// ─── Upload / New Version Dialog ──────────────────────────────────────────────

interface UploadDialogProps {
  open: boolean;
  onClose: () => void;
  companies: ContractorCompany[];
  existingDoc?: RamsDoc | null;
  defaultCompanyId?: string;
  onSuccess: () => void;
}

function UploadDialog({ open, onClose, companies, existingDoc, defaultCompanyId, onSuccess }: UploadDialogProps) {
  const { toast } = useToast();
  const isNewVersion = !!existingDoc;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);

  const [form, setForm] = useState({
    companyId: existingDoc?.companyId || defaultCompanyId || "",
    documentName: existingDoc?.documentName || "",
    documentUrl: "",
    ramsIdRef: existingDoc?.ramsIdRef || `RAMS-${Date.now()}`,
    expiryDate: "",
    jobDescription: existingDoc?.jobDescription || "",
    siteLocation: existingDoc?.siteLocation || "",
    workCategory: existingDoc?.workCategory || "general",
    requiredBeforeAccess: existingDoc?.requiredBeforeAccess ?? true,
    alertDaysBefore: existingDoc?.alertDaysBefore ?? 14,
  });
  const set = (k: string, v: any) => setForm(p => ({ ...p, [k]: v }));

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    let base64: string;
    try {
      base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (ev) => resolve((ev.target?.result as string).split(",")[1]);
        reader.onerror = () => reject(new Error("Failed to read file"));
        reader.readAsDataURL(file);
      });
    } catch {
      toast({ title: "Error", description: "Could not read the file.", variant: "destructive" });
      return;
    }
    setUploading(true);
    try {
      const res = await apiRequest("POST", "/api/objects/upload", { data: base64, mimeType: file.type });
      const { objectPath } = await res.json();
      set("documentUrl", objectPath);
      setSelectedFileName(file.name);
      if (!form.documentName) set("documentName", file.name.replace(/\.[^/.]+$/, ""));
      toast({ title: "File uploaded", description: file.name });
    } catch {
      toast({ title: "Upload failed", description: "Please try again.", variant: "destructive" });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const mutation = useMutation({
    mutationFn: async () => {
      if (!form.documentUrl || !form.documentName || !form.expiryDate) throw new Error("Please upload a document, add a name and set an expiry date");
      const payload = {
        ...form,
        expiryDate: new Date(form.expiryDate).toISOString(),
        alertDaysBefore: Number(form.alertDaysBefore),
        status: "pending_review",
      };
      if (isNewVersion) {
        return apiRequest("POST", `/api/rams/${existingDoc!.id}/new-version`, payload);
      }
      return apiRequest("POST", "/api/rams", payload);
    },
    onSuccess: () => {
      toast({ title: isNewVersion ? "New version submitted" : "RAMS submitted for review", description: "It will appear as 'Pending Review' until approved." });
      queryClient.invalidateQueries({ queryKey: ["/api/rams"] });
      onSuccess();
      onClose();
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="w-[95vw] sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText size={18} className="text-blue-600" />
            {isNewVersion ? `Upload New Version — v${(existingDoc!.version || 1) + 1}` : "Upload RAMS Document"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {!isNewVersion && (
            <div className="space-y-1">
              <Label>Contractor Company *</Label>
              <Select value={form.companyId} onValueChange={v => set("companyId", v)}>
                <SelectTrigger><SelectValue placeholder="Select company" /></SelectTrigger>
                <SelectContent>
                  {companies.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Document Name *</Label>
              <Input value={form.documentName} onChange={e => set("documentName", e.target.value)} placeholder="e.g. Roofing RAMS v1" />
            </div>
            <div className="space-y-1">
              <Label>RAMS Reference</Label>
              <Input value={form.ramsIdRef} onChange={e => set("ramsIdRef", e.target.value)} placeholder="Auto-generated" />
            </div>
          </div>

          <div className="space-y-1">
            <Label>Document File *</Label>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx"
              className="hidden"
              onChange={handleFileUpload}
            />
            {form.documentUrl ? (
              <div className="flex items-center gap-2 p-3 rounded-lg border border-green-200 bg-green-50">
                <CheckCircle2 size={16} className="text-green-600 shrink-0" />
                <span className="text-sm text-green-800 flex-1 truncate">{selectedFileName || "Document uploaded"}</span>
                <button
                  type="button"
                  onClick={() => { set("documentUrl", ""); setSelectedFileName(null); }}
                  className="text-slate-400 hover:text-slate-600"
                >
                  <X size={14} />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="w-full flex flex-col items-center gap-2 p-5 rounded-lg border-2 border-dashed border-slate-200 hover:border-blue-400 hover:bg-blue-50 transition-colors disabled:opacity-50"
              >
                {uploading ? (
                  <Loader2 size={22} className="text-blue-500 animate-spin" />
                ) : (
                  <Paperclip size={22} className="text-slate-400" />
                )}
                <span className="text-sm text-slate-500">
                  {uploading ? "Uploading…" : "Click to upload PDF, Word, Excel or PowerPoint"}
                </span>
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Work Category</Label>
              <Select value={form.workCategory} onValueChange={v => set("workCategory", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {WORK_CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Expiry Date *</Label>
              <Input type="date" value={form.expiryDate} onChange={e => set("expiryDate", e.target.value)} />
            </div>
          </div>

          <div className="space-y-1">
            <Label>Site / Location</Label>
            <Input value={form.siteLocation} onChange={e => set("siteLocation", e.target.value)} placeholder="e.g. Main Building — Roof" />
          </div>

          <div className="space-y-1">
            <Label>Job Description</Label>
            <Textarea value={form.jobDescription} onChange={e => set("jobDescription", e.target.value)} placeholder="Brief description of the work covered by this RAMS" rows={2} />
          </div>

          <div className="flex items-center gap-3 p-3 bg-orange-50 rounded-lg border border-orange-200">
            <input type="checkbox" id="rba" checked={form.requiredBeforeAccess} onChange={e => set("requiredBeforeAccess", e.target.checked)} className="w-4 h-4 accent-orange-600" />
            <div>
              <label htmlFor="rba" className="text-sm font-medium text-orange-800 cursor-pointer">Required before site access</label>
              <p className="text-xs text-orange-600 mt-0.5">Workers cannot be checked in until this RAMS is approved and acknowledged</p>
            </div>
          </div>

          <div className="space-y-1">
            <Label>Alert before expiry (days)</Label>
            <Input type="number" min={1} max={90} value={form.alertDaysBefore} onChange={e => set("alertDaysBefore", e.target.value)} className="w-32" />
          </div>
        </div>

        <DialogFooter className="flex-wrap gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending} className="gradient-blue text-white">
            {mutation.isPending ? "Submitting..." : isNewVersion ? "Submit New Version" : "Submit for Review"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Approval / Rejection Dialog ──────────────────────────────────────────────

interface ReviewDialogProps {
  doc: RamsDoc;
  action: "approve" | "reject";
  onClose: () => void;
  onSuccess: () => void;
}

function ReviewDialog({ doc, action, onClose, onSuccess }: ReviewDialogProps) {
  const { toast } = useToast();
  const [notes, setNotes] = useState("");

  const mutation = useMutation({
    mutationFn: async () => {
      if (action === "reject" && !notes.trim()) throw new Error("Please provide a reason for rejection");
      const endpoint = action === "approve" ? `/api/rams/${doc.id}/approve` : `/api/rams/${doc.id}/reject`;
      return apiRequest("POST", endpoint, action === "approve" ? { notes } : { reason: notes });
    },
    onSuccess: () => {
      toast({ title: action === "approve" ? "RAMS Approved" : "RAMS Rejected", description: action === "approve" ? "Document approved for site access." : "Contractor has been notified." });
      queryClient.invalidateQueries({ queryKey: ["/api/rams"] });
      onSuccess();
      onClose();
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="w-[95vw] sm:max-w-md">
        <DialogHeader>
          <DialogTitle className={`flex items-center gap-2 ${action === "approve" ? "text-green-700" : "text-red-700"}`}>
            {action === "approve" ? <CheckCircle2 size={18} /> : <XCircle size={18} />}
            {action === "approve" ? "Approve RAMS Document" : "Reject RAMS Document"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="p-3 bg-slate-50 rounded-lg border">
            <p className="font-medium text-sm">{doc.documentName}</p>
            <p className="text-xs text-slate-500 mt-1">v{doc.version} · Ref: {doc.ramsIdRef}</p>
          </div>

          <div className="space-y-1">
            <Label>{action === "approve" ? "Approval Notes (optional)" : "Reason for Rejection *"}</Label>
            <Textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder={action === "approve" ? "Any conditions or comments..." : "Explain what needs to be corrected..."}
              rows={3}
            />
          </div>
        </div>

        <DialogFooter className="flex-wrap gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending}
            className={action === "approve" ? "bg-green-600 hover:bg-green-700 text-white" : "bg-red-600 hover:bg-red-700 text-white"}
          >
            {mutation.isPending ? "Saving..." : action === "approve" ? "Approve" : "Reject"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Document Detail Dialog ───────────────────────────────────────────────────

interface DetailDialogProps {
  doc: RamsDoc;
  workers: ContractorWorker[];
  onClose: () => void;
  onApprove: () => void;
  onReject: () => void;
  onNewVersion: () => void;
}

function DetailDialog({ doc, workers, onClose, onApprove, onReject, onNewVersion }: DetailDialogProps) {
  const [detailTab, setDetailTab] = useState<"info" | "acks" | "audit">("info");

  const { data: acks = [] } = useQuery<RamsAck[]>({
    queryKey: ["/api/rams", doc.id, "acknowledgements"],
    queryFn: () => fetch(`/api/rams/${doc.id}/acknowledgements`).then(r => r.json()),
  });

  const { data: audit = [] } = useQuery<RamsAuditEntry[]>({
    queryKey: ["/api/rams", doc.id, "audit"],
    queryFn: () => fetch(`/api/rams/${doc.id}/audit`).then(r => r.json()),
  });

  const workerMap = Object.fromEntries(workers.map(w => [w.id, `${w.firstName} ${w.lastName}`]));

  const catLabel = WORK_CATEGORIES.find(c => c.value === doc.workCategory)?.label || doc.workCategory || "—";

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="w-[95vw] sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-start justify-between gap-2">
            <div>
              <DialogTitle className="text-lg">{doc.documentName}</DialogTitle>
              <p className="text-sm text-slate-500 mt-0.5">v{doc.version} · Ref: {doc.ramsIdRef}</p>
            </div>
            <StatusBadge status={doc.status} />
          </div>
        </DialogHeader>

        {/* Action buttons (only for pending_review) */}
        {doc.status === "pending_review" && (
          <div className="flex flex-wrap gap-2 pb-2 border-b">
            <Button onClick={onApprove} size="sm" className="bg-green-600 hover:bg-green-700 text-white gap-1">
              <Check size={14} /> Approve
            </Button>
            <Button onClick={onReject} size="sm" variant="destructive" className="gap-1">
              <X size={14} /> Reject
            </Button>
          </div>
        )}
        {doc.status === "approved" && (
          <div className="flex flex-wrap gap-2 pb-2 border-b">
            <Button onClick={onNewVersion} size="sm" variant="outline" className="gap-1">
              <RefreshCw size={14} /> Upload New Version
            </Button>
            <a href={doc.documentUrl} target="_blank" rel="noopener noreferrer">
              <Button size="sm" variant="outline" className="gap-1">
                <Download size={14} /> Download
              </Button>
            </a>
          </div>
        )}

        <Tabs value={detailTab} onValueChange={v => setDetailTab(v as any)}>
          <TabsList className="w-full">
            <TabsTrigger value="info" className="flex-1 text-xs sm:text-sm">Details</TabsTrigger>
            <TabsTrigger value="acks" className="flex-1 text-xs sm:text-sm">
              Acknowledgements {acks.length > 0 && <span className="ml-1 text-xs bg-green-100 text-green-800 rounded-full px-1.5">{acks.length}</span>}
            </TabsTrigger>
            <TabsTrigger value="audit" className="flex-1 text-xs sm:text-sm">
              Audit Trail {audit.length > 0 && <span className="ml-1 text-xs bg-slate-100 text-slate-700 rounded-full px-1.5">{audit.length}</span>}
            </TabsTrigger>
          </TabsList>

          {/* ── Details ── */}
          <TabsContent value="info" className="space-y-4 mt-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">Work Category</p>
                <p className="text-sm">{catLabel}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">Site / Location</p>
                <p className="text-sm">{doc.siteLocation || "—"}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">Uploaded</p>
                <p className="text-sm">{fmtTime(doc.uploadedAt)}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">Expiry Date</p>
                <p className={`text-sm font-medium ${new Date(doc.expiryDate) < new Date() ? "text-red-600" : ""}`}>{fmt(doc.expiryDate)}</p>
              </div>
              {doc.approvedAt && (
                <div>
                  <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">Approved</p>
                  <p className="text-sm">{fmtTime(doc.approvedAt)}</p>
                </div>
              )}
              {doc.rejectionReason && (
                <div className="sm:col-span-2">
                  <p className="text-xs font-medium text-red-500 uppercase tracking-wide mb-1">Rejection Reason</p>
                  <p className="text-sm text-red-700 bg-red-50 p-2 rounded">{doc.rejectionReason}</p>
                </div>
              )}
              {doc.reviewNotes && (
                <div className="sm:col-span-2">
                  <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">Review Notes</p>
                  <p className="text-sm bg-slate-50 p-2 rounded">{doc.reviewNotes}</p>
                </div>
              )}
              {doc.jobDescription && (
                <div className="sm:col-span-2">
                  <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">Job Description</p>
                  <p className="text-sm">{doc.jobDescription}</p>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2 p-3 rounded-lg border border-orange-200 bg-orange-50">
              <Shield size={16} className="text-orange-600 shrink-0" />
              <p className="text-xs text-orange-800">
                {doc.requiredBeforeAccess ? "Required before site access — workers cannot check in until acknowledged" : "Not required before site access"}
              </p>
            </div>

            {doc.previousVersionId && (
              <div className="flex items-center gap-2 p-3 rounded-lg border bg-slate-50">
                <History size={14} className="text-slate-500" />
                <p className="text-xs text-slate-600">This is version {doc.version} — a previous version exists</p>
              </div>
            )}

            <a href={doc.documentUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-blue-600 text-sm hover:underline">
              <Download size={14} /> View / Download Document
            </a>
          </TabsContent>

          {/* ── Acknowledgements ── */}
          <TabsContent value="acks" className="mt-4">
            {acks.length === 0 ? (
              <div className="text-center py-8 text-slate-500">
                <Users size={32} className="mx-auto mb-2 opacity-40" />
                <p className="text-sm">No workers have acknowledged this document yet</p>
                {doc.status !== "approved" && <p className="text-xs mt-1">Document must be approved before workers can acknowledge</p>}
              </div>
            ) : (
              <div className="space-y-2">
                {acks.map(ack => (
                  <div key={ack.id} className="flex items-center gap-3 p-3 rounded-lg border bg-green-50 border-green-200">
                    <CheckCircle2 size={16} className="text-green-600 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{workerMap[ack.workerId] || ack.workerId}</p>
                      <p className="text-xs text-slate-500">{fmtTime(ack.acknowledgedAt)} · {ack.method}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          {/* ── Audit Trail ── */}
          <TabsContent value="audit" className="mt-4">
            {audit.length === 0 ? (
              <div className="text-center py-8 text-slate-500">
                <History size={32} className="mx-auto mb-2 opacity-40" />
                <p className="text-sm">No audit entries yet</p>
              </div>
            ) : (
              <div className="space-y-2">
                {audit.map((entry, i) => (
                  <div key={entry.id} className="flex gap-3">
                    <div className="flex flex-col items-center">
                      <div className="w-2 h-2 rounded-full bg-blue-400 mt-1.5 shrink-0" />
                      {i < audit.length - 1 && <div className="w-px flex-1 bg-slate-200 mt-1" />}
                    </div>
                    <div className="flex-1 pb-3">
                      <p className="text-sm font-medium">{actionLabels[entry.action] || entry.action}</p>
                      <p className="text-xs text-slate-500">{entry.performedByName || "System"} · {fmtTime(entry.performedAt)}</p>
                      {entry.notes && <p className="text-xs text-slate-600 mt-1 bg-slate-50 p-1.5 rounded">{entry.notes}</p>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

interface RAMSManagementProps {
  /** When set, locks the view to this contractor company and hides global controls */
  companyId?: string;
  /** Hide the section header (used when embedded inside another page) */
  embedded?: boolean;
}

export default function RAMSManagement({ companyId, embedded }: RAMSManagementProps = {}) {
  const { toast } = useToast();
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterCompany, setFilterCompany] = useState(companyId || "all");
  const [searchTerm, setSearchTerm] = useState("");
  const [showUpload, setShowUpload] = useState(false);
  const [selectedDoc, setSelectedDoc] = useState<RamsDoc | null>(null);
  const [reviewAction, setReviewAction] = useState<"approve" | "reject" | null>(null);
  const [newVersionDoc, setNewVersionDoc] = useState<RamsDoc | null>(null);

  // Data queries — when embedded, filter by companyId on the server to avoid fetching all docs
  const { data: docs = [], isLoading } = useQuery<RamsDoc[]>({
    queryKey: companyId ? ["/api/rams", companyId] : ["/api/rams"],
    queryFn: async () => {
      const url = companyId ? `/api/rams?companyId=${companyId}` : "/api/rams";
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch RAMS docs");
      return res.json();
    },
  });

  const { data: companies = [] } = useQuery<ContractorCompany[]>({
    queryKey: ["/api/contractors"],
  });

  const { data: workers = [] } = useQuery<ContractorWorker[]>({
    queryKey: ["/api/contractors/workers/all"],
  });

  // Computed stats
  const stats = {
    total: docs.length,
    pending: docs.filter(d => d.status === "pending_review").length,
    approved: docs.filter(d => d.status === "approved").length,
    rejected: docs.filter(d => d.status === "rejected").length,
    expiring: docs.filter(d => d.status === "expiring" || d.status === "expired").length,
  };

  // Filtered docs
  const filtered = docs.filter(d => {
    if (filterStatus !== "all" && d.status !== filterStatus) return false;
    if (filterCompany !== "all" && d.companyId !== filterCompany) return false;
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      const companyName = companies.find(c => c.id === d.companyId)?.name?.toLowerCase() || "";
      if (!d.documentName.toLowerCase().includes(q) && !d.ramsIdRef.toLowerCase().includes(q) && !companyName.includes(q)) return false;
    }
    return true;
  });

  const companyName = (id: string | null) => id ? (companies.find(c => c.id === id)?.name || "Unknown") : "—";

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/rams/${id}`),
    onSuccess: () => {
      toast({ title: "RAMS document archived" });
      queryClient.invalidateQueries({ queryKey: ["/api/rams"] });
      setSelectedDoc(null);
    },
  });

  return (
    <div className="space-y-6">
      {/* Header — hidden when embedded inside another page */}
      {!embedded && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold text-fixed flex items-center gap-2">
              <Shield size={20} className="text-blue-600" />
              RAMS Management
            </h2>
            <p className="text-sm text-variable mt-0.5">Risk Assessments & Method Statements — upload, review, track acknowledgements</p>
          </div>
          <Button onClick={() => setShowUpload(true)} className="gradient-blue text-white gap-2">
            <Plus size={16} /> Upload RAMS
          </Button>
        </div>
      )}
      {embedded && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">All RAMS documents for this contractor — upload, review, and track acknowledgements.</p>
          <Button onClick={() => setShowUpload(true)} size="sm" className="gradient-blue text-white gap-2">
            <Plus size={14} /> Upload RAMS
          </Button>
        </div>
      )}

      {/* Stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Pending Review", value: stats.pending, color: "text-amber-700", bg: "bg-amber-50 border-amber-200", icon: Clock },
          { label: "Approved",       value: stats.approved, color: "text-green-700", bg: "bg-green-50 border-green-200", icon: CheckCircle2 },
          { label: "Rejected",       value: stats.rejected, color: "text-red-700",   bg: "bg-red-50 border-red-200",    icon: XCircle },
          { label: "Expiring/Expired",value: stats.expiring, color: "text-orange-700", bg: "bg-orange-50 border-orange-200", icon: AlertTriangle },
        ].map(s => {
          const Icon = s.icon;
          return (
            <div key={s.label} className={`rounded-xl border p-3 ${s.bg}`}>
              <div className="flex items-center gap-2">
                <Icon size={16} className={s.color} />
                <span className={`text-xl font-bold ${s.color}`}>{s.value}</span>
              </div>
              <p className="text-xs text-slate-600 mt-1">{s.label}</p>
            </div>
          );
        })}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[160px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <Input
            placeholder="Search RAMS..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="pl-8 h-9 text-sm"
          />
        </div>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="h-9 text-sm w-40">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="pending_review">Pending Review</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
            <SelectItem value="expiring">Expiring Soon</SelectItem>
            <SelectItem value="expired">Expired</SelectItem>
          </SelectContent>
        </Select>
        {!companyId && (
          <Select value={filterCompany} onValueChange={setFilterCompany}>
            <SelectTrigger className="h-9 text-sm w-44">
              <SelectValue placeholder="Company" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Companies</SelectItem>
              {companies.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Pending Review Alert */}
      {stats.pending > 0 && (
        <div className="flex items-center gap-3 p-3 bg-amber-50 border border-amber-200 rounded-xl">
          <AlertTriangle size={18} className="text-amber-600 shrink-0" />
          <p className="text-sm text-amber-800">
            <span className="font-semibold">{stats.pending} RAMS document{stats.pending > 1 ? "s" : ""}</span> pending review — approve or reject to allow site access.
          </p>
        </div>
      )}

      {/* Document list */}
      {isLoading ? (
        <div className="py-12 text-center text-slate-500">
          <FileText size={32} className="mx-auto mb-2 opacity-30 animate-pulse" />
          <p className="text-sm">Loading RAMS documents...</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="py-12 text-center">
          <FileText size={40} className="mx-auto mb-3 text-slate-300" />
          <p className="text-slate-600 font-medium">No RAMS documents found</p>
          <p className="text-slate-400 text-sm mt-1">Upload a RAMS document to get started</p>
          <Button onClick={() => setShowUpload(true)} className="mt-4 gradient-blue text-white gap-2">
            <Plus size={16} /> Upload RAMS
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(doc => {
            const co = companyName(doc.companyId);
            const catLabel = WORK_CATEGORIES.find(c => c.value === doc.workCategory)?.label || doc.workCategory || "General";
            return (
              <div
                key={doc.id}
                className="flex flex-col sm:flex-row sm:items-center gap-3 p-4 rounded-xl border bg-white/70 hover:bg-white/90 transition-colors cursor-pointer shadow-sm"
                onClick={() => setSelectedDoc(doc)}
              >
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div className="shrink-0 w-10 h-10 rounded-lg bg-blue-50 border border-blue-100 flex items-center justify-center">
                    <FileText size={18} className="text-blue-600" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-sm truncate">{doc.documentName}</span>
                      <span className="text-xs text-slate-400">v{doc.version}</span>
                      <StatusBadge status={doc.status} />
                    </div>
                    <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1">
                      <span className="text-xs text-slate-500 flex items-center gap-1"><Building2 size={10} />{co}</span>
                      <span className="text-xs text-slate-500">{catLabel}</span>
                      {doc.siteLocation && <span className="text-xs text-slate-500">{doc.siteLocation}</span>}
                      <span className="text-xs text-slate-400">Expires {fmt(doc.expiryDate)}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  {(doc.acknowledgementCount ?? 0) > 0 && (
                    <span className="inline-flex items-center gap-1 text-xs text-green-700 bg-green-50 border border-green-200 rounded-full px-2 py-0.5">
                      <Users size={10} /> {doc.acknowledgementCount} ack
                    </span>
                  )}
                  {doc.status === "pending_review" && (
                    <div className="flex gap-1" onClick={e => e.stopPropagation()}>
                      <Button size="sm" onClick={e => { e.stopPropagation(); setSelectedDoc(doc); setReviewAction("approve"); }} className="bg-green-600 hover:bg-green-700 text-white h-7 text-xs px-2 gap-0.5">
                        <Check size={12} /> Approve
                      </Button>
                      <Button size="sm" variant="destructive" onClick={e => { e.stopPropagation(); setSelectedDoc(doc); setReviewAction("reject"); }} className="h-7 text-xs px-2 gap-0.5">
                        <X size={12} /> Reject
                      </Button>
                    </div>
                  )}
                  <ChevronRight size={16} className="text-slate-400" />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Compliance summary by company — hidden in embedded/single-company mode */}
      {!companyId && companies.length > 0 && docs.length > 0 && (
        <div className="mt-4">
          <h3 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
            <Building2 size={14} /> RAMS Compliance by Company
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {companies.map(co => {
              const companyDocs = docs.filter(d => d.companyId === co.id);
              if (companyDocs.length === 0) return null;
              const approved = companyDocs.filter(d => d.status === "approved").length;
              const pending = companyDocs.filter(d => d.status === "pending_review").length;
              const rejected = companyDocs.filter(d => d.status === "rejected").length;
              const compliant = pending === 0 && rejected === 0 && approved > 0;
              return (
                <div key={co.id} className={`flex items-center gap-3 p-3 rounded-lg border ${compliant ? "bg-green-50 border-green-200" : "bg-amber-50 border-amber-200"}`}>
                  {compliant ? <CheckCircle2 size={16} className="text-green-600 shrink-0" /> : <Clock size={16} className="text-amber-600 shrink-0" />}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{co.name}</p>
                    <p className="text-xs text-slate-500">{approved} approved · {pending} pending · {rejected} rejected</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Dialogs ── */}

      {showUpload && (
        <UploadDialog
          open
          onClose={() => setShowUpload(false)}
          companies={companies}
          defaultCompanyId={companyId}
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ["/api/rams"] });
            if (companyId) queryClient.invalidateQueries({ queryKey: ["/api/rams", companyId] });
          }}
        />
      )}

      {newVersionDoc && (
        <UploadDialog
          open
          onClose={() => setNewVersionDoc(null)}
          companies={companies}
          existingDoc={newVersionDoc}
          defaultCompanyId={companyId}
          onSuccess={() => {
            setNewVersionDoc(null);
            queryClient.invalidateQueries({ queryKey: ["/api/rams"] });
            if (companyId) queryClient.invalidateQueries({ queryKey: ["/api/rams", companyId] });
          }}
        />
      )}

      {selectedDoc && !reviewAction && !newVersionDoc && (
        <DetailDialog
          doc={selectedDoc}
          workers={workers}
          onClose={() => setSelectedDoc(null)}
          onApprove={() => setReviewAction("approve")}
          onReject={() => setReviewAction("reject")}
          onNewVersion={() => { setNewVersionDoc(selectedDoc); setSelectedDoc(null); }}
        />
      )}

      {selectedDoc && reviewAction && (
        <ReviewDialog
          doc={selectedDoc}
          action={reviewAction}
          onClose={() => setReviewAction(null)}
          onSuccess={() => { setReviewAction(null); setSelectedDoc(null); }}
        />
      )}
    </div>
  );
}
