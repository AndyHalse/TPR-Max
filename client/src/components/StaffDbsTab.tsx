import { useState } from "react";
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
import { Plus, XCircle, Loader2, ShieldCheck, AlertTriangle, ShieldAlert } from "lucide-react";

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
};

export default function StaffDbsTab({ staffId }: { staffId: string }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ ...EMPTY_FORM });

  const { data: records = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/staff", staffId, "dbs"],
    queryFn: () => fetch(`/api/staff/${staffId}/dbs`, { credentials: "include" }).then(r => r.json()),
  });

  const add = useMutation({
    mutationFn: (data: any) => apiRequest("POST", `/api/staff/${staffId}/dbs`, data),
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
        <Button size="sm" onClick={() => setOpen(true)}><Plus className="h-4 w-4 mr-1" /> Add DBS Record</Button>
      </div>

      {hasAlert && (
        <div className={`flex items-center gap-2 p-3 rounded-lg text-sm font-medium ${currentRecord.status === "expired" ? "bg-red-50 text-red-700 border border-red-200" : "bg-yellow-50 text-yellow-700 border border-yellow-200"}`}>
          <AlertTriangle className="h-4 w-4 flex-shrink-0" />
          {currentRecord.status === "expired"
            ? `DBS certificate expired on ${new Date(currentRecord.policy_expiry_date).toLocaleDateString("en-GB")} — action required.`
            : `DBS certificate expiring on ${new Date(currentRecord.policy_expiry_date).toLocaleDateString("en-GB")} — renew soon.`}
        </div>
      )}

      {isLoading ? (
        <div className="text-center py-4 text-gray-500 flex items-center justify-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Loading...</div>
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
                <div className="flex justify-between items-start">
                  <div className="space-y-0.5">
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
