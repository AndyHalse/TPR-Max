import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import ContractorPortalLayout, { portalFetch, getPortalToken } from "./ContractorPortalLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Users, Phone, Mail, Loader2, HardHat, Plus, User,
  FileText, CheckCircle, Clock, XCircle, AlertTriangle, Upload, ExternalLink,
} from "lucide-react";

interface Worker {
  id: string;
  firstName: string;
  lastName: string;
  email?: string;
  phoneNumber?: string;
  mobileNumber?: string;
  jobTitle?: string;
  trade?: string;
  isActive: boolean;
}

interface CertType {
  key: string;
  name: string;
  legal_basis: string;
  notes: string;
  category: string;
  requires_expiry: boolean;
}

interface WorkerDoc {
  id: string;
  documentName: string;
  documentType: string;
  documentUrl?: string;
  status: string;
  expiryDate?: string;
  uploadedAt: string;
  issuedBy?: string;
  rejectedReason?: string;
}

const empty = { firstName: "", lastName: "", email: "", mobileNumber: "", jobTitle: "" };

function docStatusBadge(doc: WorkerDoc) {
  const expired = doc.expiryDate && new Date(doc.expiryDate).getTime() < Date.now();
  if (expired) return <Badge className="bg-red-100 text-red-700 text-xs border-0"><AlertTriangle className="w-3 h-3 mr-1" />Expired</Badge>;
  if (doc.status === 'approved') return <Badge className="bg-green-100 text-green-700 text-xs border-0"><CheckCircle className="w-3 h-3 mr-1" />Approved</Badge>;
  if (doc.status === 'rejected') return <Badge className="bg-red-100 text-red-700 text-xs border-0"><XCircle className="w-3 h-3 mr-1" />Rejected</Badge>;
  return <Badge className="bg-amber-100 text-amber-700 text-xs border-0"><Clock className="w-3 h-3 mr-1" />Pending Review</Badge>;
}

export default function ContractorPortalWorkers() {
  const qc = useQueryClient();

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ ...empty });
  const [formError, setFormError] = useState("");

  const [docsWorkerId, setDocsWorkerId] = useState<string | null>(null);
  const [uploadType, setUploadType] = useState("");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadExpiry, setUploadExpiry] = useState("");
  const [uploadIssuedBy, setUploadIssuedBy] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");

  const { data: workers = [], isLoading } = useQuery<Worker[]>({
    queryKey: ["portal-workers"],
    queryFn: async () => {
      const r = await portalFetch("/api/contractor-portal/workers");
      if (!r.ok) throw new Error("workers");
      return r.json();
    },
    enabled: !!getPortalToken(),
  });

  const { data: certTypes = [] } = useQuery<CertType[]>({
    queryKey: ["portal-worker-cert-types"],
    queryFn: async () => {
      const r = await portalFetch("/api/contractor-portal/worker-cert-types");
      if (!r.ok) return [];
      return r.json();
    },
    enabled: !!getPortalToken(),
  });

  const { data: workerDocs = [], isLoading: docsLoading } = useQuery<WorkerDoc[]>({
    queryKey: ["portal-worker-docs", docsWorkerId],
    queryFn: async () => {
      if (!docsWorkerId) return [];
      const r = await portalFetch(`/api/contractor-portal/workers/${docsWorkerId}/documents`);
      if (!r.ok) throw new Error("worker-docs");
      return r.json();
    },
    enabled: !!docsWorkerId && !!getPortalToken(),
  });

  const addWorker = useMutation({
    mutationFn: (data: typeof empty) =>
      portalFetch("/api/contractor-portal/workers", {
        method: "POST",
        body: JSON.stringify(data),
      }).then(async (r) => {
        const json = await r.json();
        if (!r.ok) throw new Error(json.error || "Failed to add worker.");
        return json;
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["portal-workers"] });
      setOpen(false);
      setForm({ ...empty });
      setFormError("");
    },
    onError: (err: Error) => setFormError(err.message),
  });

  const docsWorker = docsWorkerId ? workers.find(w => w.id === docsWorkerId) : null;

  const handleOpen = () => { setForm({ ...empty }); setFormError(""); setOpen(true); };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");
    if (!form.firstName.trim() || !form.lastName.trim()) {
      setFormError("First name and last name are required.");
      return;
    }
    if (!form.email.trim()) {
      setFormError("Email address is required.");
      return;
    }
    if (!form.mobileNumber.trim()) {
      setFormError("Mobile number is required.");
      return;
    }
    addWorker.mutate(form);
  };

  const handleOpenDocs = (workerId: string) => {
    setDocsWorkerId(workerId);
    setUploadType("");
    setUploadFile(null);
    setUploadExpiry("");
    setUploadIssuedBy("");
    setUploadError("");
  };

  const handleCloseDocs = () => {
    setDocsWorkerId(null);
    setUploadType("");
    setUploadFile(null);
    setUploadExpiry("");
    setUploadIssuedBy("");
    setUploadError("");
  };

  const handleUpload = async () => {
    if (!docsWorkerId || !uploadType || !uploadFile) {
      setUploadError("Please select a document type and file.");
      return;
    }
    const selectedCert = certTypes.find(c => c.key === uploadType);
    if (selectedCert?.requires_expiry && !uploadExpiry) {
      setUploadError("An expiry date is required for this document.");
      return;
    }
    setUploading(true);
    setUploadError("");
    try {
      const token = getPortalToken();
      const fd = new FormData();
      fd.append("file", uploadFile);
      fd.append("documentType", uploadType);
      fd.append("documentName", selectedCert?.name ?? uploadType);
      if (uploadExpiry) fd.append("expiryDate", uploadExpiry);
      if (uploadIssuedBy) fd.append("issuedBy", uploadIssuedBy);

      const r = await fetch(`/api/contractor-portal/workers/${docsWorkerId}/documents`, {
        method: "POST",
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: fd,
      });
      const json = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(json.error || "Upload failed.");

      qc.invalidateQueries({ queryKey: ["portal-worker-docs", docsWorkerId] });
      setUploadType("");
      setUploadFile(null);
      setUploadExpiry("");
      setUploadIssuedBy("");
    } catch (err: any) {
      setUploadError(err.message || "Upload failed.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <ContractorPortalLayout>
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Workers</h2>
          <p className="text-slate-500 mt-1">
            People registered under your company who may work on site.
          </p>
        </div>
        <Button onClick={handleOpen} className="bg-blue-600 hover:bg-blue-700 shrink-0">
          <Plus className="h-4 w-4 mr-1.5" />
          Add worker
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
        </div>
      ) : workers.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <Users className="h-12 w-12 mx-auto text-slate-300 mb-3" />
            <p className="text-slate-500 font-medium">No workers yet</p>
            <p className="text-slate-400 text-sm mt-1 mb-4">
              Add your workers so the site team knows who to expect on site.
            </p>
            <Button onClick={handleOpen} variant="outline">
              <Plus className="h-4 w-4 mr-1.5" />
              Add first worker
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {workers.map((worker) => (
            <Card key={worker.id}>
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
                    <span className="text-sm font-semibold text-blue-700">
                      {worker.firstName[0]}{worker.lastName[0]}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-medium text-slate-900">
                        {worker.firstName} {worker.lastName}
                      </p>
                      <Badge
                        variant={worker.isActive ? "default" : "secondary"}
                        className="text-xs"
                      >
                        {worker.isActive ? "Active" : "Inactive"}
                      </Badge>
                    </div>

                    {(worker.jobTitle || worker.trade) && (
                      <div className="flex items-center gap-1 text-xs text-slate-500 mt-0.5">
                        <HardHat className="h-3 w-3" />
                        {worker.jobTitle || worker.trade}
                      </div>
                    )}

                    <div className="mt-2 space-y-0.5">
                      {worker.email && (
                        <div className="flex items-center gap-1.5 text-xs text-slate-500">
                          <Mail className="h-3 w-3 flex-shrink-0" />
                          <span className="truncate">{worker.email}</span>
                        </div>
                      )}
                      {(worker.mobileNumber || worker.phoneNumber) && (
                        <div className="flex items-center gap-1.5 text-xs text-slate-500">
                          <Phone className="h-3 w-3 flex-shrink-0" />
                          {worker.mobileNumber || worker.phoneNumber}
                        </div>
                      )}
                    </div>

                    <Button
                      size="sm"
                      variant="outline"
                      className="mt-3 w-full h-7 text-xs"
                      onClick={() => handleOpenDocs(worker.id)}
                    >
                      <FileText className="h-3 w-3 mr-1.5" />
                      Documents
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Add Worker Dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add worker</DialogTitle>
            <DialogDescription>
              Add a person who works for your company to the compliance register.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4 mt-2">
            {formError && (
              <Alert variant="destructive">
                <AlertDescription>{formError}</AlertDescription>
              </Alert>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="wFirstName">First name <span className="text-red-500">*</span></Label>
                <div className="relative">
                  <User className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                  <Input
                    id="wFirstName"
                    placeholder="First"
                    value={form.firstName}
                    onChange={(e) => setForm((f) => ({ ...f, firstName: e.target.value }))}
                    className="pl-9"
                    required
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="wLastName">Last name <span className="text-red-500">*</span></Label>
                <Input
                  id="wLastName"
                  placeholder="Last"
                  value={form.lastName}
                  onChange={(e) => setForm((f) => ({ ...f, lastName: e.target.value }))}
                  required
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="wEmail">Email address <span className="text-red-500">*</span></Label>
              <div className="relative">
                <Mail className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                <Input
                  id="wEmail"
                  type="email"
                  placeholder="worker@company.com"
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                  className="pl-9"
                  required
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="wMobile">Mobile number <span className="text-red-500">*</span></Label>
              <div className="relative">
                <Phone className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                <Input
                  id="wMobile"
                  type="tel"
                  placeholder="+44 7700 900000"
                  value={form.mobileNumber}
                  onChange={(e) => setForm((f) => ({ ...f, mobileNumber: e.target.value }))}
                  className="pl-9"
                  required
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="wJobTitle">Job title / trade</Label>
              <div className="relative">
                <HardHat className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                <Input
                  id="wJobTitle"
                  placeholder="e.g. Electrician, Site Manager"
                  value={form.jobTitle}
                  onChange={(e) => setForm((f) => ({ ...f, jobTitle: e.target.value }))}
                  className="pl-9"
                />
              </div>
            </div>

            <DialogFooter className="gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button
                type="submit"
                className="bg-blue-600 hover:bg-blue-700"
                disabled={addWorker.isPending}
              >
                {addWorker.isPending ? (
                  <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" />Adding...</>
                ) : (
                  "Add worker"
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Worker Documents Dialog */}
      <Dialog open={!!docsWorkerId} onOpenChange={(v) => { if (!v) handleCloseDocs(); }}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-blue-600" />
              {docsWorker ? `${docsWorker.firstName} ${docsWorker.lastName} — Documents` : 'Worker Documents'}
            </DialogTitle>
            <DialogDescription>
              Upload compliance documents for this worker. Each document is reviewed by the site team.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5 mt-2">
            {/* Existing docs */}
            {docsLoading ? (
              <div className="flex items-center justify-center py-8 gap-2 text-slate-400">
                <Loader2 className="h-5 w-5 animate-spin" />
                <span className="text-sm">Loading documents…</span>
              </div>
            ) : workerDocs.length === 0 ? (
              <div className="text-center py-6 text-slate-400 border border-dashed border-slate-200 rounded-xl">
                <FileText className="h-8 w-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm font-medium">No documents uploaded yet</p>
                <p className="text-xs mt-1">Use the form below to upload this worker's compliance documents.</p>
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Uploaded Documents</p>
                {workerDocs.map((doc) => (
                  <div key={doc.id} className="flex items-center justify-between p-3 border rounded-lg gap-3 hover:bg-slate-50">
                    <div className="flex items-center gap-3 min-w-0">
                      <FileText className="h-4 w-4 text-slate-400 flex-shrink-0" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-800 truncate">{doc.documentName}</p>
                        <div className="flex items-center gap-2 flex-wrap mt-0.5">
                          {docStatusBadge(doc)}
                          {doc.expiryDate && (
                            <span className="text-xs text-slate-400">
                              Expires {new Date(doc.expiryDate).toLocaleDateString('en-GB')}
                            </span>
                          )}
                          {doc.rejectedReason && (
                            <span className="text-xs text-red-500">Reason: {doc.rejectedReason}</span>
                          )}
                        </div>
                      </div>
                    </div>
                    {doc.documentUrl && (
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0 flex-shrink-0" onClick={() => window.open(doc.documentUrl, '_blank')}>
                        <ExternalLink className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Upload new document */}
            <div className="border-t pt-4 space-y-3">
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Upload New Document</p>

              <div className="space-y-1.5">
                <Label className="text-sm">Document type <span className="text-red-500">*</span></Label>
                <Select value={uploadType} onValueChange={setUploadType}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select document type…" />
                  </SelectTrigger>
                  <SelectContent>
                    {certTypes.map(ct => (
                      <SelectItem key={ct.key} value={ct.key}>{ct.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {uploadType && certTypes.find(c => c.key === uploadType) && (
                  <p className="text-xs text-slate-400">
                    {certTypes.find(c => c.key === uploadType)!.legal_basis}
                    {certTypes.find(c => c.key === uploadType)!.notes ? ` — ${certTypes.find(c => c.key === uploadType)!.notes}` : ''}
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label className="text-sm">File <span className="text-red-500">*</span></Label>
                <input
                  type="file"
                  accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.webp"
                  className="block w-full text-sm text-slate-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-medium file:bg-slate-100 file:text-slate-700 hover:file:bg-slate-200 cursor-pointer"
                  onChange={e => setUploadFile(e.target.files?.[0] || null)}
                  key={uploadType}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-sm">
                    Expiry date{certTypes.find(c => c.key === uploadType)?.requires_expiry ? ' *' : ' (optional)'}
                  </Label>
                  <Input type="date" value={uploadExpiry} onChange={e => setUploadExpiry(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm">Issued by (optional)</Label>
                  <Input
                    type="text"
                    placeholder="Training provider / body"
                    value={uploadIssuedBy}
                    onChange={e => setUploadIssuedBy(e.target.value)}
                  />
                </div>
              </div>

              {uploadError && (
                <Alert variant="destructive">
                  <AlertDescription>{uploadError}</AlertDescription>
                </Alert>
              )}

              <Button
                className="w-full bg-blue-600 hover:bg-blue-700"
                onClick={handleUpload}
                disabled={uploading || !uploadType || !uploadFile}
              >
                {uploading
                  ? <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" />Uploading…</>
                  : <><Upload className="h-4 w-4 mr-1.5" />Upload Document</>
                }
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </ContractorPortalLayout>
  );
}
