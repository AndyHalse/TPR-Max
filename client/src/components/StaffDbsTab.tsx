import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, objectUrl } from "@/lib/queryClient";
import { Plus, XCircle, Loader2, ShieldCheck, AlertTriangle, ShieldAlert, Upload, FileText, ExternalLink } from "lucide-react";

const DBS_LEVELS: Record<string, string> = {
  basic: "Basic DBS Check",
  standard: "Standard DBS Check",
  enhanced: "Enhanced DBS Check",
  enhanced_barred_adults: "Enhanced + Barred Adults List",
  enhanced_barred_children: "Enhanced + Barred Children List",
  enhanced_barred_both: "Enhanced + Both Barred Lists",
};

const STATUS_STYLES: Record<string, string> = {
  valid: "bg-green-100 text-green-800",
  expiring_soon: "bg-yellow-100 text-yellow-800",
  expired: "bg-red-100 text-red-800",
  no_expiry: "bg-gray-100 text-gray-800",
};

function StatusBadge({ status }: { status: string }) {
  const Icon = status === "expired" ? ShieldAlert : status === "expiring_soon" ? AlertTriangle : ShieldCheck;
  return (
    <Badge className={`${STATUS_STYLES[status] || "bg-gray-100 text-gray-800"} flex items-center gap-1`}>
      <Icon className="h-3 w-3" />
      {status === "no_expiry" ? "No Expiry Set" : status.replace(/_/g, " ")}
    </Badge>
  );
}

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
          const json = await res.json();
          onUploaded(json.objectPath, file.name);
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
        <span className="text-sm text-blue-600 truncate flex-1">{fileName || "Certificate document"}</span>
        <Button
          size="sm"
          variant="ghost"
          className="text-blue-500 hover:text-blue-700 h-6 px-2 text-xs flex-shrink-0"
          onClick={() => window.open(objectUrl(value), '_blank')}
        >
          <ExternalLink className="h-3 w-3 mr-1" />View
        </Button>
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

const EMPTY_FORM = {
  dbsLevel: "",
  certificateNumber: "",
  applicationReference: "",
  issueDate: "",
  policyExpiryDate: "",
  requestedBy: "",
  verifiedBy: "",
  verifiedDate: "",
  notes: "",
  documentUrl: "",
  documentName: "",
};

export default function StaffDbsTab({ staffId }: { staffId: string }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ ...EMPTY_FORM });

  const { data: records = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/staff", staffId, "dbs"],
    queryFn: () => fetch(`/api/staff/${staffId}/dbs`, { credentials: "include" }).then(r => {
      if (!r.ok) throw new Error(`${r.status}`);
      return r.json();
    }),
  });

  const { data: dbsRequiredData } = useQuery<{ dbsRequired: boolean }>({
    queryKey: ["/api/staff", staffId, "dbs-required"],
    queryFn: () => fetch(`/api/staff/${staffId}/dbs-required`, { credentials: "include" }).then(r => {
      if (!r.ok) throw new Error(`${r.status}`);
      return r.json();
    }),
  });

  const dbsRequired = dbsRequiredData?.dbsRequired ?? false;

  const toggleRequired = useMutation({
    mutationFn: (val: boolean) => apiRequest("PATCH", `/api/staff/${staffId}/dbs-required`, { dbsRequired: val }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/staff", staffId, "dbs-required"] });
      qc.invalidateQueries({ queryKey: ["/api/staff"] });
    },
    onError: () => toast({ title: "Error", description: "Failed to update DBS requirement", variant: "destructive" }),
  });

  const add = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", `/api/staff/${staffId}/dbs`, data);
      return (res as Response).json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/staff", staffId, "dbs"] });
      setOpen(false);
      setForm({ ...EMPTY_FORM });
      toast({ title: "DBS record added" });
    },
    onError: () => toast({ title: "Error", description: "Failed to add DBS record", variant: "destructive" }),
  });

  const del = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/dbs/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/staff", staffId, "dbs"] });
      toast({ title: "DBS record removed" });
    },
    onError: () => toast({ title: "Error", description: "Failed to remove record", variant: "destructive" }),
  });

  const currentRecord = records.find((r: any) => r.is_current);
  const hasAlert = currentRecord && (currentRecord.status === "expired" || currentRecord.status === "expiring_soon");

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="font-semibold text-gray-700">DBS Certificates &amp; Safeguarding</h3>
        <Button size="sm" onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4 mr-1" /> Add DBS Record
        </Button>
      </div>

      {/* DBS Check Required toggle — mirrors contractor worker DBS tab */}
      <Card className="border-gray-200 bg-gray-50">
        <CardContent className="pt-3 pb-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-gray-800">DBS Check Required</p>
              <p className="text-xs text-gray-500 mt-0.5">
                Enable to require a valid DBS certificate for site clearance (schools, care, NHS)
              </p>
            </div>
            <Switch
              checked={dbsRequired}
              onCheckedChange={val => toggleRequired.mutate(val)}
              disabled={toggleRequired.isPending}
            />
          </div>
        </CardContent>
      </Card>

      {hasAlert && (
        <div className={`flex items-center gap-2 p-3 rounded-lg text-sm font-medium ${currentRecord.status === "expired" ? "bg-red-50 text-red-700 border border-red-200" : "bg-yellow-50 text-yellow-700 border border-yellow-200"}`}>
          <AlertTriangle className="h-4 w-4 flex-shrink-0" />
          {currentRecord.status === "expired"
            ? `DBS certificate expired on ${new Date(currentRecord.policy_expiry_date).toLocaleDateString("en-GB")} — action required.`
            : `DBS certificate expiring on ${new Date(currentRecord.policy_expiry_date).toLocaleDateString("en-GB")} — renew soon.`}
        </div>
      )}

      {isLoading ? (
        <div className="text-center py-4 text-gray-500 flex items-center justify-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading...
        </div>
      ) : records.length === 0 ? (
        <div className="text-center py-8">
          <ShieldCheck className="h-10 w-10 mx-auto text-gray-300 mb-2" />
          <p className="text-gray-400 text-sm">No DBS records on file.</p>
          <p className="text-gray-400 text-xs mt-1">Add a DBS certificate to track safeguarding compliance.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {records.map((r: any) => (
            <Card key={r.id} className={r.is_current ? "border-blue-200" : "opacity-60"}>
              <CardContent className="pt-3 pb-3">
                <div className="flex justify-between items-start gap-2">
                  <div className="space-y-0.5 min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm">{DBS_LEVELS[r.dbs_level] || r.dbs_level}</span>
                      {r.is_current && <Badge className="bg-blue-100 text-blue-800 text-xs">Current</Badge>}
                      <StatusBadge status={r.status || "no_expiry"} />
                    </div>
                    {r.certificate_number && (
                      <div className="text-xs text-gray-500">Cert No: {r.certificate_number}</div>
                    )}
                    {r.application_reference && (
                      <div className="text-xs text-gray-500">App Ref: {r.application_reference}</div>
                    )}
                    <div className="text-xs text-gray-500">
                      {r.issue_date && <>Issued {new Date(r.issue_date).toLocaleDateString("en-GB")} · </>}
                      Verified {new Date(r.verified_date).toLocaleDateString("en-GB")} by {r.verified_by}
                      {r.policy_expiry_date && <> · Policy expiry {new Date(r.policy_expiry_date).toLocaleDateString("en-GB")}</>}
                    </div>
                    {r.notes && <div className="text-xs text-gray-400 italic mt-1">{r.notes}</div>}
                    {r.document_url && (
                      <button
                        className="flex items-center gap-1 text-xs text-blue-500 hover:text-blue-700 mt-1"
                        onClick={() => window.open(objectUrl(r.document_url), '_blank')}
                      >
                        <FileText className="h-3 w-3" />
                        {r.document_name || "View certificate"}
                        <ExternalLink className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-red-400 hover:text-red-600 h-7 w-7 p-0 flex-shrink-0"
                    onClick={() => del.mutate(r.id)}
                    disabled={del.isPending}
                  >
                    <XCircle className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={v => { setOpen(v); if (!v) setForm({ ...EMPTY_FORM }); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Add DBS Record</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>DBS Level *</Label>
              <Select value={form.dbsLevel} onValueChange={v => setForm(f => ({ ...f, dbsLevel: v }))}>
                <SelectTrigger><SelectValue placeholder="Select DBS level" /></SelectTrigger>
                <SelectContent>
                  {Object.entries(DBS_LEVELS).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Certificate Number</Label>
                <Input value={form.certificateNumber} onChange={e => setForm(f => ({ ...f, certificateNumber: e.target.value }))} placeholder="e.g. 001234567890" />
              </div>
              <div>
                <Label>Application Reference</Label>
                <Input value={form.applicationReference} onChange={e => setForm(f => ({ ...f, applicationReference: e.target.value }))} placeholder="Optional" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Issue Date</Label>
                <Input type="date" value={form.issueDate} onChange={e => setForm(f => ({ ...f, issueDate: e.target.value }))} />
              </div>
              <div>
                <Label>Policy Expiry Date</Label>
                <Input type="date" value={form.policyExpiryDate} onChange={e => setForm(f => ({ ...f, policyExpiryDate: e.target.value }))} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Date Verified *</Label>
                <Input type="date" value={form.verifiedDate} onChange={e => setForm(f => ({ ...f, verifiedDate: e.target.value }))} />
              </div>
              <div>
                <Label>Verified By *</Label>
                <Input value={form.verifiedBy} onChange={e => setForm(f => ({ ...f, verifiedBy: e.target.value }))} placeholder="Name of verifier" />
              </div>
            </div>

            <div>
              <Label>Requested By</Label>
              <Input value={form.requestedBy} onChange={e => setForm(f => ({ ...f, requestedBy: e.target.value }))} placeholder="Name or role" />
            </div>

            <div>
              <Label>Notes</Label>
              <Textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} placeholder="Any additional information..." />
            </div>

            <div>
              <Label>Certificate Document</Label>
              <FileUploadField
                value={form.documentUrl}
                fileName={form.documentName}
                onUploaded={(url, name) => setForm(f => ({ ...f, documentUrl: url, documentName: name }))}
                onClear={() => setForm(f => ({ ...f, documentUrl: "", documentName: "" }))}
              />
            </div>

            <p className="text-xs text-gray-400">
              Note: DBS certificates do not have an official expiry date. The policy expiry date is set by your organisation (commonly 3 years).
              Adding a new record will mark the previous one as superseded.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button
              disabled={add.isPending || !form.dbsLevel || !form.verifiedBy || !form.verifiedDate}
              onClick={() => add.mutate(form)}
            >
              {add.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
