import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Wrench, CheckCircle2, Clock, AlertTriangle, FileText, Upload,
  RefreshCw, Download, Building2, CalendarDays, User, X
} from "lucide-react";

interface WorkOrder {
  id: string;
  title: string;
  description?: string | null;
  status: string;
  assetId?: string | null;
  dueDate?: string | null;
  completedDate?: string | null;
  notes?: string | null;
  completionNotes?: string | null;
  contractorCompanyName?: string | null;
  contractorWorkerName?: string | null;
  requiresCertificate?: boolean | null;
  certificateUploadedAt?: string | null;
}

interface Asset {
  id: string;
  name: string;
  assetRef?: string | null;
  category?: string | null;
  location?: string | null;
  manufacturer?: string | null;
  modelNumber?: string | null;
}

interface WODocument {
  id: string;
  fileName: string;
  fileUrl: string;
  fileType?: string | null;
  uploadedBy?: string | null;
  createdAt?: string | null;
  expiryDate?: string | null;
  referenceNumber?: string | null;
  issuedBy?: string | null;
}

function fmtDate(d?: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" });
}

const STATUS_CONFIG: Record<string, { label: string; bg: string; text: string; icon: typeof CheckCircle2 }> = {
  scheduled:   { label: "Scheduled",   bg: "bg-blue-100",   text: "text-blue-800",   icon: Clock },
  in_progress: { label: "In Progress", bg: "bg-amber-100",  text: "text-amber-800",  icon: RefreshCw },
  completed:   { label: "Completed",   bg: "bg-green-100",  text: "text-green-800",  icon: CheckCircle2 },
  overdue:     { label: "Overdue",     bg: "bg-red-100",    text: "text-red-800",    icon: AlertTriangle },
};

function StatusPill({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? { label: status, bg: "bg-gray-100", text: "text-gray-800", icon: Clock };
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium ${cfg.bg} ${cfg.text}`}>
      <Icon className="h-4 w-4" />{cfg.label}
    </span>
  );
}

async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function PPMWorkOrderMobile({ token }: { token: string }) {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);

  // currentToken starts as the URL token. After each write, the server returns a rotated
  // nextToken so the original email link becomes single-use (rolling token semantics).
  const [currentToken, setCurrentToken] = useState(token);
  const [completionNotes, setCompletionNotes] = useState("");
  const [fileType, setFileType] = useState("certificate");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [updateMsg, setUpdateMsg] = useState("");

  const { data, isLoading, error } = useQuery<{ workOrder: WorkOrder; documents: WODocument[]; asset: Asset | null }>({
    queryKey: ["/api/ppm/work-order/public", currentToken],
    queryFn: async () => {
      const res = await fetch(`/api/ppm/work-order/public/${currentToken}`);
      if (!res.ok) throw new Error((await res.json())?.error ?? "Work order not found");
      return res.json();
    },
    staleTime: 30000,
  });

  const wo = data?.workOrder;
  const docs = data?.documents ?? [];
  const asset = data?.asset ?? null;

  const updateMutation = useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const res = await fetch(`/api/ppm/work-order/public/${currentToken}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error((await res.json())?.error ?? "Update failed");
      return res.json();
    },
    onSuccess: (result: { nextToken?: string }) => {
      // Adopt the rotated token so subsequent requests use the new session token
      if (result.nextToken) {
        setCurrentToken(result.nextToken);
        // Update the browser URL so a page refresh still works with the new token
        window.history.replaceState(null, "", `/ppm/work-order/${result.nextToken}`);
        qc.invalidateQueries({ queryKey: ["/api/ppm/work-order/public", result.nextToken] });
      } else {
        qc.invalidateQueries({ queryKey: ["/api/ppm/work-order/public", currentToken] });
      }
      setUpdateMsg("Status updated successfully.");
      setTimeout(() => setUpdateMsg(""), 3000);
    },
  });

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (docs.length >= 5) { setUploadError("Maximum 5 files allowed."); return; }
    setUploading(true);
    setUploadError("");
    try {
      const b64 = await fileToBase64(file);
      // Atomic upload+document in a single request via the /files endpoint
      const res = await fetch(`/api/ppm/work-order/public/${currentToken}/files`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data: b64, mimeType: file.type, fileName: file.name, fileType }),
      });
      if (!res.ok) {
        const { error: errMsg } = await res.json().catch(() => ({ error: "Upload failed" }));
        throw new Error(errMsg ?? "Upload failed");
      }
      const { nextToken } = await res.json();
      // Adopt the rotated token returned by the server
      if (nextToken) {
        setCurrentToken(nextToken);
        // Update browser URL so a page refresh still works with the new token
        window.history.replaceState(null, "", `/ppm/work-order/${nextToken}`);
        qc.invalidateQueries({ queryKey: ["/api/ppm/work-order/public", nextToken] });
      } else {
        qc.invalidateQueries({ queryKey: ["/api/ppm/work-order/public", currentToken] });
      }
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  // ── Render states ──────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600 mx-auto mb-3"></div>
          <p className="text-slate-600 text-sm">Loading work order…</p>
        </div>
      </div>
    );
  }

  if (error || !wo) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-red-50 p-6">
        <div className="max-w-sm bg-white rounded-2xl shadow-lg p-8 text-center">
          <AlertTriangle className="h-12 w-12 text-red-500 mx-auto mb-4" />
          <h1 className="text-xl font-bold text-gray-900 mb-2">Work Order Not Found</h1>
          <p className="text-gray-600 text-sm">{error instanceof Error ? error.message : "This link is invalid or has expired."}</p>
        </div>
      </div>
    );
  }

  const isCompleted = wo.status === "completed";
  const canComplete = wo.status === "scheduled" || wo.status === "in_progress" || wo.status === "overdue";

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-blue-700 text-white px-4 pt-safe-top pb-6">
        <div className="max-w-lg mx-auto pt-4">
          <div className="flex items-center gap-2 mb-3">
            <Wrench className="h-5 w-5 opacity-80" />
            <span className="text-sm font-medium opacity-80">PPM Work Order</span>
          </div>
          <h1 className="text-xl font-bold leading-tight">{wo.title}</h1>
          {wo.contractorCompanyName && (
            <p className="text-sm opacity-75 mt-1">{wo.contractorCompanyName}{wo.contractorWorkerName ? ` · ${wo.contractorWorkerName}` : ""}</p>
          )}
          <div className="mt-3">
            <StatusPill status={wo.status} />
          </div>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 py-5 space-y-5">

        {/* Asset info */}
        {asset && (
          <div className="bg-white rounded-xl shadow-sm border p-4">
            <div className="flex items-center gap-2 mb-3">
              <Building2 className="h-4 w-4 text-blue-500" />
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Asset</p>
            </div>
            <p className="font-semibold text-slate-900">{asset.name}</p>
            {asset.assetRef && <p className="text-xs text-slate-500 mt-0.5">Ref: {asset.assetRef}</p>}
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-600">
              {asset.category && <span className="flex items-center gap-1"><span className="text-xs text-slate-400">Category:</span> {asset.category}</span>}
              {asset.location && <span className="flex items-center gap-1"><span className="text-xs text-slate-400">Location:</span> {asset.location}</span>}
              {asset.manufacturer && <span className="flex items-center gap-1"><span className="text-xs text-slate-400">Manufacturer:</span> {asset.manufacturer}</span>}
            </div>
          </div>
        )}

        {/* Key info */}
        <div className="bg-white rounded-xl shadow-sm border p-4 space-y-3">
          {wo.description && <p className="text-sm text-slate-600">{wo.description}</p>}
          <div className="grid grid-cols-2 gap-3 text-sm">
            {wo.dueDate && (
              <div className="flex items-start gap-2">
                <CalendarDays className="h-4 w-4 text-slate-400 mt-0.5 shrink-0" />
                <div>
                  <p className="text-xs text-slate-500">Due Date</p>
                  <p className="font-medium">{fmtDate(wo.dueDate)}</p>
                </div>
              </div>
            )}
            {wo.requiresCertificate && (
              <div className="flex items-start gap-2">
                <FileText className="h-4 w-4 text-slate-400 mt-0.5 shrink-0" />
                <div>
                  <p className="text-xs text-slate-500">Certificate</p>
                  <p className={`font-medium text-sm ${wo.certificateUploadedAt ? "text-green-700" : "text-amber-700"}`}>
                    {wo.certificateUploadedAt ? "Uploaded" : "Required"}
                  </p>
                </div>
              </div>
            )}
          </div>
          {wo.notes && (
            <div className="border-l-2 border-slate-300 pl-3">
              <p className="text-xs text-slate-500">Admin Notes</p>
              <p className="text-sm text-slate-600">{wo.notes}</p>
            </div>
          )}
        </div>

        {/* Update status */}
        {!isCompleted && (
          <div className="bg-white rounded-xl shadow-sm border p-4 space-y-3">
            <h2 className="font-semibold text-sm flex items-center gap-2"><RefreshCw className="h-4 w-4 text-blue-600" />Update Status</h2>
            <Textarea
              placeholder="Add completion notes or details about work carried out…"
              value={completionNotes}
              onChange={e => setCompletionNotes(e.target.value)}
              rows={3}
              className="text-sm"
            />
            <div className="flex flex-col gap-2">
              {wo.status !== "in_progress" && (
                <Button
                  className="w-full"
                  variant="outline"
                  disabled={updateMutation.isPending}
                  onClick={() => updateMutation.mutate({ status: "in_progress", completionNotes: completionNotes || undefined })}
                >
                  <Clock className="h-4 w-4 mr-2" />Mark In Progress
                </Button>
              )}
              {canComplete && (
                <Button
                  className="w-full bg-green-600 hover:bg-green-700 text-white"
                  disabled={updateMutation.isPending}
                  onClick={() => updateMutation.mutate({ status: "completed", completionNotes: completionNotes || undefined })}
                >
                  <CheckCircle2 className="h-4 w-4 mr-2" />Mark Completed
                </Button>
              )}
            </div>
            {updateMsg && <p className="text-sm text-green-700 text-center">{updateMsg}</p>}
            {updateMutation.isError && (
              <p className="text-sm text-red-600 text-center">{updateMutation.error instanceof Error ? updateMutation.error.message : "Update failed"}</p>
            )}
          </div>
        )}

        {isCompleted && wo.completionNotes && (
          <div className="bg-green-50 border border-green-200 rounded-xl p-4">
            <p className="text-xs font-medium text-green-800 mb-1">Completion Notes</p>
            <p className="text-sm text-green-700">{wo.completionNotes}</p>
          </div>
        )}

        {/* Document upload */}
        <div className="bg-white rounded-xl shadow-sm border p-4 space-y-3">
          <h2 className="font-semibold text-sm flex items-center gap-2"><Upload className="h-4 w-4 text-blue-600" />Upload Documents</h2>
          <p className="text-xs text-slate-500">Upload service certificates, photos or reports (max 5 files, PDF/JPG/PNG/DOC).</p>

          {docs.length > 0 && (
            <div className="space-y-1.5">
              {docs.map(doc => (
                <div key={doc.id} className="rounded-lg border bg-slate-50 px-3 py-2">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-slate-400 shrink-0" />
                    <span className="text-xs truncate flex-1">{doc.fileName}</span>
                    {doc.fileType && doc.fileType !== "other" && (
                      <span className="text-xs bg-slate-200 text-slate-600 rounded px-1.5 py-0.5 shrink-0">{doc.fileType}</span>
                    )}
                    <a href={doc.fileUrl} target="_blank" rel="noreferrer" className="shrink-0">
                      <Download className="h-4 w-4 text-blue-600" />
                    </a>
                  </div>
                  {(doc.expiryDate || doc.referenceNumber || doc.issuedBy) && (
                    <div className="mt-1.5 ml-6 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-slate-500">
                      {doc.referenceNumber && (
                        <span>Ref: <span className="font-medium text-slate-700">{doc.referenceNumber}</span></span>
                      )}
                      {doc.issuedBy && (
                        <span>Issued by: <span className="font-medium text-slate-700">{doc.issuedBy}</span></span>
                      )}
                      {doc.expiryDate && (
                        <span>Expires: <span className="font-medium text-slate-700">{fmtDate(doc.expiryDate)}</span></span>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {docs.length < 5 && (
            <div className="space-y-2">
              <Select value={fileType} onValueChange={setFileType}>
                <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="certificate">Service Certificate</SelectItem>
                  <SelectItem value="report">Inspection Report</SelectItem>
                  <SelectItem value="photo">Photo</SelectItem>
                  <SelectItem value="other">Other Document</SelectItem>
                </SelectContent>
              </Select>
              <Button
                className="w-full"
                variant="outline"
                disabled={uploading}
                onClick={() => fileRef.current?.click()}
              >
                {uploading ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
                {uploading ? "Uploading…" : "Choose File to Upload"}
              </Button>
              <input ref={fileRef} type="file" className="hidden" accept=".pdf,.jpg,.jpeg,.png,.doc,.docx" onChange={handleFileUpload} />
              {uploadError && (
                <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 rounded-lg p-2">
                  <X className="h-4 w-4 shrink-0" />{uploadError}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="text-center pb-6">
          <p className="text-xs text-slate-400">Powered by TPR-Max PPM System</p>
        </div>
      </div>
    </div>
  );
}
