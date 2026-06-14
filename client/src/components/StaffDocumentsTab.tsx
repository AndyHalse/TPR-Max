import { useState } from "react";
import { Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import {
  FileText, Plus, XCircle, Loader2, Upload,
  CheckCircle, AlertTriangle, Shield, ClipboardList, Clock,
} from "lucide-react";

const DOC_TYPE_LABELS: Record<string, string> = {
  contract: "Contract",
  right_to_work: "Right to Work",
  certificate: "Certificate",
  health_questionnaire: "Health Questionnaire",
  disciplinary: "Disciplinary",
  appraisal: "Appraisal",
  other: "Other",
};

function FileUploadField({ value, fileName, onUploaded, onClear }: {
  value?: string;
  fileName?: string;
  onUploaded: (url: string, name: string) => void;
  onClear: () => void;
}) {
  const { toast } = useToast();
  const [uploading, setUploading] = useState(false);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const base64 = (reader.result as string).split(',')[1];
          const res = await apiRequest("POST", "/api/objects/upload", { data: base64, mimeType: file.type }) as any;
          onUploaded(res.objectPath, file.name);
        } catch {
          toast({ title: "Upload failed", variant: "destructive" });
        } finally {
          setUploading(false);
        }
      };
      reader.readAsDataURL(file);
    } catch {
      toast({ title: "Upload failed", variant: "destructive" });
      setUploading(false);
    }
  };

  if (value) {
    return (
      <div className="flex items-center gap-2 p-2 bg-blue-50 border border-blue-200 rounded-md">
        <FileText className="h-4 w-4 text-blue-500 flex-shrink-0" />
        <a href={value} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-600 underline truncate flex-1">{fileName || "View file"}</a>
        <Button size="sm" variant="ghost" className="text-red-400 hover:text-red-600 h-6 px-2 text-xs flex-shrink-0" onClick={onClear}>Remove</Button>
      </div>
    );
  }

  return (
    <label className="cursor-pointer block">
      <input type="file" className="hidden" onChange={handleFile} accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.gif" />
      <div className={`flex items-center gap-2 p-2 border border-dashed border-gray-300 rounded-md hover:border-blue-400 hover:bg-blue-50 transition-colors ${uploading ? "opacity-60 pointer-events-none" : ""}`}>
        {uploading ? <Loader2 className="h-4 w-4 animate-spin text-gray-400" /> : <Upload className="h-4 w-4 text-gray-400" />}
        <span className="text-sm text-gray-500">{uploading ? "Uploading…" : "Click to attach a file (PDF, Word, image)"}</span>
      </div>
    </label>
  );
}

type StatusColour = "green" | "amber" | "red" | "grey";

const CHECKLIST_ROW_STYLES: Record<StatusColour, { row: string; badge: string }> = {
  green: { row: "border-green-200 bg-green-50", badge: "bg-green-100 text-green-800" },
  amber: { row: "border-amber-200 bg-amber-50", badge: "bg-amber-100 text-amber-800" },
  red:   { row: "border-red-200   bg-red-50",   badge: "bg-red-100   text-red-800"   },
  grey:  { row: "border-gray-200  bg-gray-50",  badge: "bg-gray-100  text-gray-600"  },
};

function ChecklistRow({
  icon: Icon,
  label,
  colour,
  statusText,
  action,
}: {
  icon: React.ElementType;
  label: string;
  colour: StatusColour;
  statusText: string;
  action?: React.ReactNode;
}) {
  const { row, badge } = CHECKLIST_ROW_STYLES[colour];
  return (
    <div className={`flex items-center gap-3 p-3 rounded-lg border ${row}`}>
      <Icon className="h-4 w-4 flex-shrink-0 opacity-70" />
      <span className="text-sm font-medium flex-1 text-gray-800">{label}</span>
      <Badge className={`${badge} text-xs whitespace-nowrap`}>{statusText}</Badge>
      {action}
    </div>
  );
}

interface StaffDocumentsTabProps {
  staffId: string;
  onSwitchToDbs?: () => void;
}

export default function StaffDocumentsTab({ staffId, onSwitchToDbs }: StaffDocumentsTabProps) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    documentType: "contract",
    title: "",
    fileUrl: "",
    fileName: "",
    isConfidential: false,
    expiryDate: "",
    notes: "",
  });

  const openDialog = (type = "contract") => {
    setForm({ documentType: type, title: "", fileUrl: "", fileName: "", isConfidential: false, expiryDate: "", notes: "" });
    setOpen(true);
  };

  const { data: docs = [], isLoading: docsLoading } = useQuery<any[]>({
    queryKey: ["/api/staff", staffId, "documents"],
    queryFn: () =>
      fetch(`/api/staff/${staffId}/documents`, { credentials: "include" }).then(r => {
        if (!r.ok) throw new Error(`${r.status}`);
        return r.json();
      }),
  });

  const { data: rtwStatus } = useQuery<any>({
    queryKey: ["/api/right-to-work/status", staffId],
    queryFn: () =>
      fetch(`/api/right-to-work/status/${staffId}`, { credentials: "include" }).then(r => r.json()),
  });

  const { data: dbsRecords = [] } = useQuery<any[]>({
    queryKey: ["/api/staff", staffId, "dbs"],
    queryFn: () =>
      fetch(`/api/staff/${staffId}/dbs`, { credentials: "include" }).then(r => {
        if (!r.ok) return [];
        return r.json();
      }),
  });

  const add = useMutation({
    mutationFn: (d: any) => apiRequest("POST", `/api/staff/${staffId}/documents/upload`, d),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/staff", staffId, "documents"] });
      setOpen(false);
      toast({ title: "Document added" });
    },
    onError: () => toast({ title: "Error", description: "Failed to add document", variant: "destructive" }),
  });

  const del = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/staff/${staffId}/documents/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/staff", staffId, "documents"] });
      toast({ title: "Document removed" });
    },
  });

  // --- Required documents checklist ---
  const hasContract = (docs as any[]).some((d: any) => d.document_type === "contract");
  const currentDbs = (dbsRecords as any[]).find((r: any) => r.is_current);
  const dbsStatus: string = currentDbs?.status ?? "not_recorded";

  // Right to Work
  let rtwColour: StatusColour = "grey";
  let rtwLabel = "Not recorded";
  if (rtwStatus) {
    if (rtwStatus.isExpired) {
      rtwColour = "red"; rtwLabel = "Expired";
    } else if (rtwStatus.hasRTW && rtwStatus.daysUntilExpiry !== null && rtwStatus.daysUntilExpiry <= 30) {
      rtwColour = "amber"; rtwLabel = "Expiring soon";
    } else if (rtwStatus.hasRTW) {
      rtwColour = "green"; rtwLabel = "Verified";
    } else {
      rtwColour = "amber"; rtwLabel = "Not recorded";
    }
  }

  // Contract
  const contractColour: StatusColour = hasContract ? "green" : "amber";
  const contractLabel = hasContract ? "Stored" : "Missing";

  // DBS (role-dependent — show neutral grey when not recorded, never red just for absence)
  let dbsColour: StatusColour = "grey";
  let dbsLabel = "Not recorded";
  if (dbsStatus === "valid") { dbsColour = "green"; dbsLabel = "Valid"; }
  else if (dbsStatus === "no_expiry") { dbsColour = "green"; dbsLabel = "No expiry set"; }
  else if (dbsStatus === "expiring_soon") { dbsColour = "amber"; dbsLabel = "Expiring soon"; }
  else if (dbsStatus === "expired") { dbsColour = "red"; dbsLabel = "Expired"; }

  return (
    <div className="space-y-5">
      {/* Required documents checklist */}
      <div>
        <h3 className="font-semibold text-gray-700 mb-2 text-sm flex items-center gap-1.5">
          <ClipboardList className="h-4 w-4" /> Required Documents
        </h3>
        <div className="space-y-2">
          <ChecklistRow
            icon={rtwColour === "green" ? CheckCircle : rtwColour === "red" ? XCircle : AlertTriangle}
            label="Right to Work"
            colour={rtwColour}
            statusText={rtwLabel}
            action={
              <Link href={`/hr/staff/${staffId}?tab=rtw`}>
                <Button size="sm" variant="ghost" className="h-7 text-xs px-2 shrink-0">Manage</Button>
              </Link>
            }
          />
          <ChecklistRow
            icon={hasContract ? CheckCircle : AlertTriangle}
            label="Contract / Statement of Particulars"
            colour={contractColour}
            statusText={contractLabel}
            action={
              !hasContract ? (
                <Button size="sm" variant="ghost" className="h-7 text-xs px-2 shrink-0" onClick={() => openDialog("contract")}>
                  Upload
                </Button>
              ) : undefined
            }
          />
          <ChecklistRow
            icon={dbsColour === "green" ? Shield : dbsColour === "red" ? XCircle : dbsColour === "amber" ? AlertTriangle : Clock}
            label="DBS Check"
            colour={dbsColour}
            statusText={dbsLabel}
            action={
              onSwitchToDbs ? (
                <Button size="sm" variant="ghost" className="h-7 text-xs px-2 shrink-0" onClick={onSwitchToDbs}>
                  Manage
                </Button>
              ) : undefined
            }
          />
        </div>
        <p className="text-[11px] text-gray-400 mt-2">
          Right to Work and DBS statuses reflect their dedicated records, not document uploads.
        </p>
      </div>

      {/* Document list */}
      <div className="border-t pt-4">
        <div className="flex justify-between items-center mb-3">
          <h3 className="font-semibold text-gray-700 text-sm flex items-center gap-1.5">
            <FileText className="h-4 w-4" /> Documents
          </h3>
          <Button size="sm" onClick={() => openDialog()}>
            <Plus className="h-4 w-4 mr-1" /> Add Document
          </Button>
        </div>

        {docsLoading ? (
          <div className="text-center py-4 text-gray-400 text-sm flex items-center justify-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : docs.length === 0 ? (
          <div className="text-center py-6">
            <FileText className="h-8 w-8 mx-auto text-gray-300 mb-2" />
            <p className="text-gray-400 text-sm">No documents stored yet.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {(docs as any[]).map((d: any) => (
              <Card key={d.id}>
                <CardContent className="pt-2 pb-2">
                  <div className="flex justify-between items-center gap-2">
                    <div className="min-w-0 flex items-center gap-2">
                      <FileText className="h-4 w-4 text-blue-500 flex-shrink-0" />
                      <div className="min-w-0">
                        <div className="font-medium text-sm truncate">
                          {d.title}
                          {d.is_confidential && <Badge className="bg-red-100 text-red-800 text-xs ml-1">Confidential</Badge>}
                        </div>
                        <div className="text-xs text-gray-500">
                          {DOC_TYPE_LABELS[d.document_type] || d.document_type} · {new Date(d.created_at).toLocaleDateString("en-GB")}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      {d.file_url && (
                        <a href={d.file_url} target="_blank" rel="noopener noreferrer">
                          <Button size="sm" variant="outline" className="h-7 text-xs">View</Button>
                        </a>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-red-400 hover:text-red-600 h-7 w-7 p-0"
                        onClick={() => del.mutate(d.id)}
                        disabled={del.isPending}
                      >
                        <XCircle className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Add Document dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Document</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Document Type</Label>
              <Select value={form.documentType} onValueChange={v => setForm(f => ({ ...f, documentType: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(DOC_TYPE_LABELS).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Title *</Label>
              <Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. Employment Contract 2024" />
            </div>
            <div>
              <Label>File *</Label>
              <FileUploadField
                value={form.fileUrl}
                fileName={form.fileName}
                onUploaded={(url, name) => setForm(f => ({ ...f, fileUrl: url, fileName: f.title || name }))}
                onClear={() => setForm(f => ({ ...f, fileUrl: "", fileName: "" }))}
              />
            </div>
            <div>
              <Label>Expiry Date</Label>
              <Input type="date" value={form.expiryDate} onChange={e => setForm(f => ({ ...f, expiryDate: e.target.value }))} />
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="staff-doc-confidential"
                checked={form.isConfidential}
                onChange={e => setForm(f => ({ ...f, isConfidential: e.target.checked }))}
              />
              <Label htmlFor="staff-doc-confidential">Confidential document</Label>
            </div>
            <div>
              <Label>Notes</Label>
              <Textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button disabled={add.isPending || !form.title} onClick={() => add.mutate(form)}>
              {add.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
