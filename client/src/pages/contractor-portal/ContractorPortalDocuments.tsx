import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import ContractorPortalLayout, { portalFetch, getPortalToken } from "./ContractorPortalLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  CheckCircle, Clock, XCircle, AlertTriangle, Upload,
  FileText, CalendarDays, Building, Loader2, ExternalLink
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const UK_DOC_TYPES = [
  {
    key: "publicLiability",
    name: "Public Liability Insurance",
    basis: "Common law duty of care",
    note: "Minimum £2m",
    requiresExpiry: true,
  },
  {
    key: "employersLiability",
    name: "Employers' Liability Insurance",
    basis: "Employers' Liability Act 1969",
    note: "Minimum £5m",
    requiresExpiry: true,
  },
  {
    key: "healthSafety",
    name: "Health & Safety Policy",
    basis: "H&S at Work Act 1974",
    note: "Required before work commences",
    requiresExpiry: true,
  },
  {
    key: "rams",
    name: "Risk Assessment & Method Statement (RAMS)",
    basis: "MHSWR 1999",
    note: "Site-specific",
    requiresExpiry: true,
  },
  {
    key: "cisRegistration",
    name: "CIS Registration",
    basis: "Finance Act 2004",
    note: "Construction industry",
    requiresExpiry: false,
  },
  {
    key: "professionalIndemnity",
    name: "Professional Indemnity Insurance",
    basis: "Client / design work",
    note: "Required for design roles",
    requiresExpiry: true,
  },
  {
    key: "modernSlavery",
    name: "Modern Slavery Statement",
    basis: "Modern Slavery Act 2015",
    note: "Businesses >£36m turnover",
    requiresExpiry: false,
  },
  {
    key: "environmentalPolicy",
    name: "Environmental Policy",
    basis: "Client / ISO 14001",
    note: "Increasingly required",
    requiresExpiry: false,
  },
  {
    key: "other",
    name: "Other Document",
    basis: "Additional compliance",
    note: "Any other relevant document",
    requiresExpiry: false,
  },
];

interface PortalDocument {
  id: string;
  documentName: string;
  documentType: string;
  documentUrl: string;
  status: string;
  expiryDate?: string;
  uploadedAt: string;
  issuedBy?: string;
  rejectedReason?: string;
}

const statusConfig: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline"; icon: typeof CheckCircle }> = {
  pending: { label: "Pending review", variant: "secondary", icon: Clock },
  approved: { label: "Approved", variant: "default", icon: CheckCircle },
  rejected: { label: "Rejected", variant: "destructive", icon: XCircle },
  expired: { label: "Expired", variant: "outline", icon: AlertTriangle },
};

interface UploadDialogState {
  open: boolean;
  docType: (typeof UK_DOC_TYPES)[0] | null;
}

export default function ContractorPortalDocuments() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [dialog, setDialog] = useState<UploadDialogState>({ open: false, docType: null });
  const [file, setFile] = useState<File | null>(null);
  const [expiryDate, setExpiryDate] = useState("");
  const [issuedBy, setIssuedBy] = useState("");
  const [uploadError, setUploadError] = useState("");

  const { data: docs = [], isLoading } = useQuery<PortalDocument[]>({
    queryKey: ["portal-documents"],
    queryFn: async () => {
      const r = await portalFetch("/api/contractor-portal/documents");
      if (!r.ok) throw new Error("docs");
      return r.json();
    },
    enabled: !!getPortalToken(),
  });

  const { data: progressData } = useQuery<{ requirements: Array<{ document_type: string; is_required: boolean }> }>({
    queryKey: ["portal-onboarding-progress"],
    queryFn: async () => {
      const r = await portalFetch("/api/contractor-portal/onboarding-progress");
      if (!r.ok) return { requirements: [] };
      return r.json();
    },
    enabled: !!getPortalToken(),
    staleTime: 60 * 1000,
  });

  const uploadMutation = useMutation({
    mutationFn: async () => {
      if (!file || !dialog.docType) throw new Error("No file selected.");
      const form = new FormData();
      form.append("file", file);
      form.append("documentType", dialog.docType.key);
      form.append("documentName", dialog.docType.name);
      if (expiryDate) form.append("expiryDate", expiryDate);
      if (issuedBy) form.append("issuedBy", issuedBy);

      const token = getPortalToken();
      const res = await fetch("/api/contractor-portal/documents/upload", {
        method: "POST",
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: form,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Upload failed.");
      }
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["portal-documents"] });
      qc.invalidateQueries({ queryKey: ["portal-doc-stats"] });
      qc.invalidateQueries({ queryKey: ["portal-onboarding-progress"] });
      toast({ title: "Document uploaded", description: "Your document has been submitted for review." });
      closeDialog();
    },
    onError: (err: Error) => {
      setUploadError(err.message);
    },
  });

  function openDialog(docType: (typeof UK_DOC_TYPES)[0]) {
    setDialog({ open: true, docType });
    setFile(null);
    setExpiryDate("");
    setIssuedBy("");
    setUploadError("");
  }

  function closeDialog() {
    setDialog({ open: false, docType: null });
    setFile(null);
    setExpiryDate("");
    setIssuedBy("");
    setUploadError("");
  }

  function getLatestDoc(key: string): PortalDocument | undefined {
    return docs
      .filter((d) => d.documentType === key)
      .sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime())[0];
  }

  const requirementMap = new Map<string, boolean>(
    (progressData?.requirements ?? []).map((r) => [r.document_type, r.is_required])
  );
  const sortedDocTypes = [...UK_DOC_TYPES].sort((a, b) => {
    const aReq = requirementMap.has(a.key) ? requirementMap.get(a.key)! : false;
    const bReq = requirementMap.has(b.key) ? requirementMap.get(b.key)! : false;
    if (aReq === bReq) return 0;
    return aReq ? -1 : 1;
  });

  if (isLoading) {
    return (
      <ContractorPortalLayout>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
        </div>
      </ContractorPortalLayout>
    );
  }

  return (
    <ContractorPortalLayout>
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-slate-900">Compliance Documents</h2>
        <p className="text-slate-500 mt-1">
          Upload your compliance documents. Each document will be reviewed by the site administrator.
        </p>
      </div>

      <div className="space-y-3">
        {sortedDocTypes.map((docType) => {
          const current = getLatestDoc(docType.key);
          const cfg = current ? (statusConfig[current.status] ?? statusConfig.pending) : null;
          const StatusIcon = cfg?.icon;
          const isExpiringSoon =
            current?.expiryDate &&
            new Date(current.expiryDate) < new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
          const isRequired = requirementMap.has(docType.key) ? requirementMap.get(docType.key) : undefined;

          return (
            <Card key={docType.key} className={`transition-all ${current?.status === "rejected" ? "border-red-200 bg-red-50/50" : isRequired && !current ? "border-amber-200" : ""}`}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-medium text-slate-900">{docType.name}</h3>
                      {isRequired === true && (
                        <Badge className="text-xs bg-red-100 text-red-700 border border-red-200 font-medium">Required</Badge>
                      )}
                      {isRequired === false && (
                        <Badge variant="outline" className="text-xs text-slate-400 border-slate-200">Optional</Badge>
                      )}
                      {current && cfg && StatusIcon && (
                        <Badge variant={cfg.variant} className="text-xs">
                          <StatusIcon className="h-3 w-3 mr-1" />
                          {cfg.label}
                        </Badge>
                      )}
                      {!current && (
                        <Badge variant="outline" className="text-xs text-slate-400 border-slate-200">
                          Not uploaded
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {docType.basis} · {docType.note}
                    </p>

                    {current && (
                      <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-1.5 text-xs text-slate-500">
                        {current.issuedBy && (
                          <span className="flex items-center gap-1">
                            <Building className="h-3 w-3" />
                            {current.issuedBy}
                          </span>
                        )}
                        {current.expiryDate && (
                          <span className={`flex items-center gap-1 ${isExpiringSoon ? "text-amber-600 font-medium" : ""}`}>
                            <CalendarDays className="h-3 w-3" />
                            Expires {new Date(current.expiryDate).toLocaleDateString("en-GB")}
                            {isExpiringSoon && " (expiring soon)"}
                          </span>
                        )}
                        {current.documentUrl && current.documentUrl !== "pending-upload" && (
                          <a
                            href={current.documentUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1 text-blue-600 hover:underline"
                          >
                            <ExternalLink className="h-3 w-3" />
                            View file
                          </a>
                        )}
                      </div>
                    )}

                    {current?.status === "rejected" && current.rejectedReason && (
                      <p className="text-xs text-red-600 mt-1.5 bg-red-100 px-2 py-1 rounded">
                        Reason: {current.rejectedReason}
                      </p>
                    )}
                  </div>

                  <Button
                    size="sm"
                    variant={current?.status === "approved" ? "outline" : "default"}
                    className={
                      current?.status === "approved"
                        ? "shrink-0"
                        : "shrink-0 bg-blue-600 hover:bg-blue-700"
                    }
                    onClick={() => openDialog(docType)}
                  >
                    <Upload className="h-3.5 w-3.5 mr-1.5" />
                    {current ? "Re-upload" : "Upload"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Upload dialog */}
      <Dialog open={dialog.open} onOpenChange={(o) => { if (!o) closeDialog(); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Upload {dialog.docType?.name}</DialogTitle>
            <DialogDescription>
              {dialog.docType?.basis} · {dialog.docType?.note}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 mt-2">
            {uploadError && (
              <Alert variant="destructive">
                <AlertDescription>{uploadError}</AlertDescription>
              </Alert>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="file">Document file</Label>
              <Input
                id="file"
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
              <p className="text-xs text-slate-400">PDF, JPG, PNG, DOC/DOCX · Maximum 20 MB</p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="issuedBy">Issued by</Label>
              <Input
                id="issuedBy"
                placeholder="e.g. Aviva Insurance, HSE, etc."
                value={issuedBy}
                onChange={(e) => setIssuedBy(e.target.value)}
              />
            </div>

            {dialog.docType?.requiresExpiry && (
              <div className="space-y-1.5">
                <Label htmlFor="expiryDate">
                  Expiry date
                  <span className="text-red-500 ml-0.5">*</span>
                </Label>
                <Input
                  id="expiryDate"
                  type="date"
                  value={expiryDate}
                  onChange={(e) => setExpiryDate(e.target.value)}
                  min={new Date().toISOString().split("T")[0]}
                  required={dialog.docType?.requiresExpiry}
                />
              </div>
            )}

            <div className="flex gap-3 pt-2">
              <Button variant="outline" className="flex-1" onClick={closeDialog} disabled={uploadMutation.isPending}>
                Cancel
              </Button>
              <Button
                className="flex-1 bg-blue-600 hover:bg-blue-700"
                onClick={() => uploadMutation.mutate()}
                disabled={!file || uploadMutation.isPending || (dialog.docType?.requiresExpiry && !expiryDate)}
              >
                {uploadMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Uploading...
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4 mr-2" />
                    Upload
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </ContractorPortalLayout>
  );
}
