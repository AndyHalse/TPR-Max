import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertCircle,
  CheckCircle,
  Clock,
  FileText,
  Upload,
  XCircle,
  HelpCircle,
  ExternalLink,
} from "lucide-react";
import { apiRequest, getSessionToken } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface EquipCertType {
  id: string;
  key: string;
  name: string;
  legal_basis: string | null;
  category: string;
  requires_expiry: boolean;
  requires_number: boolean;
  status: "missing" | "pending_review" | "rejected" | "expired" | "expiring_soon" | "valid";
  document: {
    id: string;
    document_url: string;
    expiry_date: string | null;
    issued_by: string | null;
    policy_number: string | null;
    status: string;
    uploaded_at: string;
  } | null;
}

interface Props {
  equipmentId: string;
}

function StatusBadge({ status }: { status: EquipCertType["status"] }) {
  switch (status) {
    case "valid":
      return <Badge className="bg-green-600 hover:bg-green-700 text-white gap-1"><CheckCircle className="w-3 h-3" /> Valid</Badge>;
    case "expiring_soon":
      return <Badge className="bg-amber-500 hover:bg-amber-600 text-white gap-1"><Clock className="w-3 h-3" /> Expiring Soon</Badge>;
    case "expired":
      return <Badge variant="destructive" className="gap-1"><XCircle className="w-3 h-3" /> Expired</Badge>;
    case "pending_review":
      return <Badge variant="secondary" className="gap-1"><Clock className="w-3 h-3" /> Pending Review</Badge>;
    case "rejected":
      return <Badge variant="destructive" className="gap-1"><XCircle className="w-3 h-3" /> Rejected</Badge>;
    default:
      return <Badge variant="outline" className="gap-1 text-muted-foreground"><HelpCircle className="w-3 h-3" /> Missing</Badge>;
  }
}

export default function EquipmentCertificatesTab({ equipmentId }: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [uploadingType, setUploadingType] = useState<EquipCertType | null>(null);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [expiryDate, setExpiryDate] = useState("");
  const [issuedBy, setIssuedBy] = useState("");
  const [certNumber, setCertNumber] = useState("");

  const { data: certs = [], isLoading } = useQuery<EquipCertType[]>({
    queryKey: ["/api/contractors/equipment", equipmentId, "certificates"],
    queryFn: async () => {
      const token = getSessionToken();
      const headers: Record<string, string> = {};
      if (token) headers["Authorization"] = `Bearer ${token}`;
      const res = await fetch(`/api/contractors/equipment/${equipmentId}/certificates`, { credentials: "include", headers });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Failed to load equipment certificates (${res.status})`);
      }
      return res.json();
    },
  });

  const uploadMutation = useMutation({
    mutationFn: async (type: EquipCertType) => {
      if (!uploadFile) throw new Error("No file selected");
      const reader = new FileReader();
      const base64 = await new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve((reader.result as string).split(",")[1]);
        reader.onerror = reject;
        reader.readAsDataURL(uploadFile);
      });
      const uploadRes = await apiRequest("POST", "/api/objects/upload", { data: base64, mimeType: uploadFile.type });
      if (!uploadRes.ok) throw new Error("File upload failed. Please try again.");
      const { objectPath } = await uploadRes.json();

      const certRes = await apiRequest("POST", `/api/contractors/equipment/${equipmentId}/certificates`, {
        documentType: type.key,
        documentUrl: objectPath,
        documentName: `${type.name} — ${uploadFile.name}`,
        expiryDate: expiryDate || null,
        issuedBy: issuedBy || null,
        certNumber: certNumber || null,
      });
      if (!certRes.ok) {
        const body = await certRes.json().catch(() => ({}));
        throw new Error(body.error || "Failed to save certificate");
      }
      return certRes.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/contractors/equipment", equipmentId, "certificates"] });
      queryClient.invalidateQueries({ queryKey: ["/api/contractors"] });
      toast({ title: "Certificate uploaded — awaiting admin review" });
      closeDialog();
    },
    onError: (err: Error) => {
      toast({ title: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (docId: string) => {
      const res = await apiRequest("DELETE", `/api/contractors/equipment/certificates/${docId}`);
      if (!res.ok) throw new Error("Failed to remove certificate");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/contractors/equipment", equipmentId, "certificates"] });
      toast({ title: "Certificate removed" });
    },
    onError: (err: Error) => toast({ title: err.message, variant: "destructive" }),
  });

  function openUpload(type: EquipCertType) {
    setUploadingType(type);
    setUploadFile(null);
    setExpiryDate("");
    setIssuedBy("");
    setCertNumber("");
  }

  function closeDialog() {
    setUploadingType(null);
    setUploadFile(null);
    setExpiryDate("");
    setIssuedBy("");
    setCertNumber("");
  }

  const grouped = {
    legal: certs.filter((c) => c.category === "legal"),
    inspection: certs.filter((c) => c.category === "inspection"),
    other: certs.filter((c) => c.category !== "legal" && c.category !== "inspection"),
  };

  const categoryLabel: Record<string, string> = {
    legal: "Legal Documents",
    inspection: "Inspections & Tests",
    other: "Other",
  };

  if (isLoading) {
    return <div className="text-sm text-muted-foreground py-4 text-center">Loading certificates…</div>;
  }

  const validCount = certs.filter((c) => c.status === "valid").length;
  const expiredCount = certs.filter((c) => c.status === "expired" || c.status === "expiring_soon").length;
  const missingCount = certs.filter((c) => c.status === "missing").length;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h4 className="font-semibold text-sm">Certificates & Documentation</h4>
        <div className="flex gap-2 text-xs">
          {validCount > 0 && <span className="text-green-600 font-medium">{validCount} valid</span>}
          {expiredCount > 0 && <span className="text-amber-600 font-medium">{expiredCount} expiring/expired</span>}
          {missingCount > 0 && <span className="text-muted-foreground">{missingCount} missing</span>}
        </div>
      </div>

      {(["legal", "inspection", "other"] as const).map((cat) => {
        const items = grouped[cat];
        if (!items.length) return null;
        return (
          <div key={cat} className="space-y-2">
            <h5 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {categoryLabel[cat]}
            </h5>
            <div className="space-y-2">
              {items.map((cert) => (
                <div key={cert.key} className="flex items-start gap-3 p-3 border rounded-lg bg-muted/30">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium">{cert.name}</span>
                      <StatusBadge status={cert.status} />
                    </div>
                    {cert.document && (
                      <div className="mt-1 flex flex-wrap gap-3 text-xs text-muted-foreground">
                        {cert.document.expiry_date && (
                          <span>Expires: {new Date(cert.document.expiry_date).toLocaleDateString("en-GB")}</span>
                        )}
                        {cert.document.policy_number && <span>#{cert.document.policy_number}</span>}
                        {cert.document.issued_by && <span>Issued by: {cert.document.issued_by}</span>}
                        {cert.document.document_url && (
                          <a
                            href={cert.document.document_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:underline flex items-center gap-1"
                          >
                            <FileText className="w-3 h-3" /> View document
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        )}
                      </div>
                    )}
                    {cert.legal_basis && (
                      <p className="text-xs text-muted-foreground/70 mt-0.5 truncate">{cert.legal_basis}</p>
                    )}
                  </div>
                  <div className="flex gap-1 shrink-0">
                    {cert.document && cert.status !== "pending_review" && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-xs text-muted-foreground hover:text-destructive"
                        onClick={() => deleteMutation.mutate(cert.document!.id)}
                        disabled={deleteMutation.isPending}
                      >
                        Remove
                      </Button>
                    )}
                    <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => openUpload(cert)}>
                      <Upload className="w-3 h-3" />
                      {cert.document ? "Replace" : "Upload"}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}

      <Dialog open={!!uploadingType} onOpenChange={(o) => !o && closeDialog()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Upload className="w-4 h-4" />
              Upload {uploadingType?.name}
            </DialogTitle>
          </DialogHeader>
          {uploadingType && (
            <div className="space-y-4">
              <div className="space-y-1">
                <Label>Certificate file</Label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png,.webp"
                  className="hidden"
                  onChange={(e) => setUploadFile(e.target.files?.[0] ?? null)}
                />
                <Button variant="outline" className="w-full justify-start gap-2" onClick={() => fileInputRef.current?.click()}>
                  <Upload className="w-4 h-4" />
                  {uploadFile ? uploadFile.name : "Choose file (PDF or image)"}
                </Button>
              </div>
              {uploadingType.requires_number && (
                <div className="space-y-1">
                  <Label>Reference number</Label>
                  <Input placeholder="e.g. cert reference" value={certNumber} onChange={(e) => setCertNumber(e.target.value)} />
                </div>
              )}
              <div className="space-y-1">
                <Label>Issued by</Label>
                <Input placeholder="Inspection body or insurer" value={issuedBy} onChange={(e) => setIssuedBy(e.target.value)} />
              </div>
              {uploadingType.requires_expiry && (
                <div className="space-y-1">
                  <Label>Expiry date</Label>
                  <Input type="date" value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} />
                </div>
              )}
              {!uploadFile && (
                <div className="flex items-center gap-2 text-xs text-amber-600 bg-amber-50 dark:bg-amber-900/20 rounded p-2">
                  <AlertCircle className="w-3 h-3 shrink-0" />
                  Please select a file before uploading.
                </div>
              )}
              <div className="flex gap-2 justify-end pt-2">
                <Button variant="outline" onClick={closeDialog}>Cancel</Button>
                <Button
                  onClick={() => uploadingType && uploadMutation.mutate(uploadingType)}
                  disabled={!uploadFile || uploadMutation.isPending}
                >
                  {uploadMutation.isPending ? "Uploading…" : "Upload certificate"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
