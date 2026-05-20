import { useState } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  User, ArrowLeft, Shield, BookOpen, Calendar, Activity,
  FileText, CheckSquare, LogOut, Star, Briefcase, Phone,
  AlertTriangle, ChevronRight, Plus, Clock, CheckCircle, XCircle, Loader2
} from "lucide-react";

function statusBadge(status: string) {
  const map: Record<string, string> = {
    active: "bg-green-100 text-green-800",
    on_leave: "bg-yellow-100 text-yellow-800",
    leaver: "bg-red-100 text-red-800",
    archived: "bg-gray-100 text-gray-800",
  };
  return map[status] || "bg-gray-100 text-gray-800";
}

function RtwTab({ staffId }: { staffId: string }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ documentType: "", documentReference: "", issueDate: "", expiryDate: "", verifiedDate: "", verifiedBy: "", notes: "" });

  const { data: records = [], isLoading } = useQuery<any[]>({ queryKey: ["/api/staff", staffId, "right-to-work"], queryFn: () => fetch(`/api/staff/${staffId}/right-to-work`, { credentials: "include" }).then(r => r.json()) });
  const { data: status } = useQuery<any>({ queryKey: ["/api/right-to-work/status", staffId], queryFn: () => fetch(`/api/right-to-work/status/${staffId}`, { credentials: "include" }).then(r => r.json()) });

  const add = useMutation({
    mutationFn: (data: any) => apiRequest("POST", `/api/staff/${staffId}/right-to-work`, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/staff", staffId, "right-to-work"] }); qc.invalidateQueries({ queryKey: ["/api/right-to-work/status", staffId] }); setOpen(false); toast({ title: "RTW record added" }); },
    onError: () => toast({ title: "Error", description: "Failed to add RTW record", variant: "destructive" }),
  });

  const docTypes = ["British Passport", "EEA Passport", "Biometric Residence Permit", "Share Code (eVisa)", "UK Birth Certificate + NI", "UK Driving Licence + NI"];

  return (
    <div className="space-y-4">
      {status && (
        <div className={`rounded-lg p-4 flex items-center gap-3 ${status.isExpired ? "bg-red-50 border border-red-200" : status.hasRTW ? "bg-green-50 border border-green-200" : "bg-yellow-50 border border-yellow-200"}`}>
          {status.isExpired ? <XCircle className="text-red-600 h-5 w-5 flex-shrink-0" /> : status.hasRTW ? <CheckCircle className="text-green-600 h-5 w-5 flex-shrink-0" /> : <AlertTriangle className="text-yellow-600 h-5 w-5 flex-shrink-0" />}
          <div>
            <div className="font-medium">{status.isExpired ? "RTW document EXPIRED" : status.hasRTW ? "RTW document verified" : "No RTW document on record"}</div>
            {status.daysUntilExpiry !== null && <div className="text-sm text-gray-600">{status.isExpired ? `Expired ${Math.abs(status.daysUntilExpiry)} days ago` : `Expires in ${status.daysUntilExpiry} days`}</div>}
          </div>
        </div>
      )}

      <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
        <p className="text-xs text-amber-700">
          <strong>Beta:</strong> Right to Work records in TPR are supplementary.
          Always verify eligibility using the official Home Office Employer
          Checking Service before permitting work to commence.
        </p>
      </div>

      <div className="flex justify-between items-center">
        <h3 className="font-semibold text-gray-700">RTW Records</h3>
        <Button size="sm" onClick={() => setOpen(true)}><Plus className="h-4 w-4 mr-1" /> Add Record</Button>
      </div>

      {isLoading ? <div className="text-center py-4 text-gray-500">Loading...</div> : records.length === 0 ? (
        <div className="text-center py-8 text-gray-400">No Right to Work records. Please add one immediately to ensure compliance.</div>
      ) : (
        <div className="space-y-3">
          {records.map((r: any) => (
            <Card key={r.id} className={r.is_current ? "border-blue-200" : "opacity-60"}>
              <CardContent className="pt-4">
                <div className="flex justify-between items-start">
                  <div>
                    <div className="font-medium">{r.document_type}</div>
                    {r.document_reference && <div className="text-sm text-gray-500">Ref: {r.document_reference}</div>}
                    <div className="text-sm text-gray-500">Verified {new Date(r.verified_date).toLocaleDateString("en-GB")} by {r.verified_by}</div>
                  </div>
                  <div className="text-right">
                    {r.is_current && <Badge className="bg-blue-100 text-blue-800 text-xs">Current</Badge>}
                    {r.expiry_date && <div className="text-sm mt-1">Expires {new Date(r.expiry_date).toLocaleDateString("en-GB")}</div>}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Right to Work Record</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Document Type *</Label>
              <Select value={form.documentType} onValueChange={v => setForm(f => ({ ...f, documentType: v }))}>
                <SelectTrigger><SelectValue placeholder="Select document type" /></SelectTrigger>
                <SelectContent>{docTypes.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Document Reference</Label><Input value={form.documentReference} onChange={e => setForm(f => ({ ...f, documentReference: e.target.value }))} placeholder="Passport number, etc." /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Issue Date</Label><Input type="date" value={form.issueDate} onChange={e => setForm(f => ({ ...f, issueDate: e.target.value }))} /></div>
              <div><Label>Expiry Date</Label><Input type="date" value={form.expiryDate} onChange={e => setForm(f => ({ ...f, expiryDate: e.target.value }))} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Date Verified *</Label><Input type="date" value={form.verifiedDate} onChange={e => setForm(f => ({ ...f, verifiedDate: e.target.value }))} /></div>
              <div><Label>Verified By *</Label><Input value={form.verifiedBy} onChange={e => setForm(f => ({ ...f, verifiedBy: e.target.value }))} placeholder="Name of verifier" /></div>
            </div>
            <div><Label>Notes</Label><Textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button disabled={add.isPending} onClick={() => add.mutate(form)}>{add.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function TrainingTab({ staffId }: { staffId: string }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ courseName: "", provider: "", completedDate: "", expiryDate: "", isMandatory: false, notes: "" });

  const { data: records = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/staff", staffId, "training"],
    queryFn: () => fetch(`/api/staff/${staffId}/training`, { credentials: "include" }).then(r => r.json()),
  });

  const add = useMutation({
    mutationFn: (data: any) => apiRequest("POST", `/api/staff/${staffId}/training`, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/staff", staffId, "training"] }); setOpen(false); toast({ title: "Training record added" }); },
    onError: () => toast({ title: "Error", description: "Failed to add training record", variant: "destructive" }),
  });

  const del = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/staff/${staffId}/training/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/staff", staffId, "training"] }); toast({ title: "Record removed" }); },
  });

  const statusColor: Record<string, string> = { valid: "bg-green-100 text-green-800", expiring_soon: "bg-yellow-100 text-yellow-800", expired: "bg-red-100 text-red-800", no_expiry: "bg-gray-100 text-gray-800" };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="font-semibold text-gray-700">Training Records</h3>
        <Button size="sm" onClick={() => setOpen(true)}><Plus className="h-4 w-4 mr-1" /> Add Training</Button>
      </div>

      {isLoading ? <div className="text-center py-4 text-gray-500">Loading...</div> : records.length === 0 ? (
        <div className="text-center py-8 text-gray-400">No training records yet.</div>
      ) : (
        <div className="space-y-2">
          {records.map((r: any) => (
            <Card key={r.id}>
              <CardContent className="pt-3 pb-3">
                <div className="flex justify-between items-center">
                  <div>
                    <div className="font-medium flex items-center gap-2">{r.course_name} {r.is_mandatory && <Badge className="bg-blue-100 text-blue-800 text-xs">Mandatory</Badge>}</div>
                    {r.provider && <div className="text-sm text-gray-500">{r.provider}</div>}
                    <div className="text-sm text-gray-500">Completed {new Date(r.completed_date).toLocaleDateString("en-GB")}{r.expiry_date ? ` · Expires ${new Date(r.expiry_date).toLocaleDateString("en-GB")}` : ""}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge className={statusColor[r.status] || "bg-gray-100 text-gray-800"}>{r.status?.replace(/_/g, " ")}</Badge>
                    <Button size="sm" variant="ghost" className="text-red-500 h-7 w-7 p-0" onClick={() => del.mutate(r.id)}><XCircle className="h-4 w-4" /></Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Training Record</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Course Name *</Label><Input value={form.courseName} onChange={e => setForm(f => ({ ...f, courseName: e.target.value }))} /></div>
            <div><Label>Provider</Label><Input value={form.provider} onChange={e => setForm(f => ({ ...f, provider: e.target.value }))} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Completed Date *</Label><Input type="date" value={form.completedDate} onChange={e => setForm(f => ({ ...f, completedDate: e.target.value }))} /></div>
              <div><Label>Expiry Date</Label><Input type="date" value={form.expiryDate} onChange={e => setForm(f => ({ ...f, expiryDate: e.target.value }))} /></div>
            </div>
            <div className="flex items-center gap-2">
              <input type="checkbox" id="mandatory" checked={form.isMandatory} onChange={e => setForm(f => ({ ...f, isMandatory: e.target.checked }))} />
              <Label htmlFor="mandatory">Mandatory training</Label>
            </div>
            <div><Label>Notes</Label><Textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button disabled={add.isPending} onClick={() => add.mutate(form)}>{add.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function LeaveTab({ staffId }: { staffId: string }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ leaveType: "annual", startDate: "", endDate: "", reason: "" });

  const { data, isLoading } = useQuery<any>({
    queryKey: ["/api/staff", staffId, "leave"],
    queryFn: () => fetch(`/api/staff/${staffId}/leave`, { credentials: "include" }).then(r => r.json()),
  });

  const submit = useMutation({
    mutationFn: (d: any) => apiRequest("POST", `/api/staff/${staffId}/leave`, d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/staff", staffId, "leave"] }); setOpen(false); toast({ title: "Leave request submitted" }); },
    onError: () => toast({ title: "Error", description: "Failed to submit leave request", variant: "destructive" }),
  });

  const statusColor: Record<string, string> = { pending: "bg-yellow-100 text-yellow-800", approved: "bg-green-100 text-green-800", declined: "bg-red-100 text-red-800", cancelled: "bg-gray-100 text-gray-800" };

  if (isLoading) return <div className="text-center py-8 text-gray-400">Loading...</div>;

  const { balance, requests = [] } = data || {};

  return (
    <div className="space-y-4">
      {balance && (
        <div className="grid grid-cols-4 gap-3">
          {[["Entitlement", balance.entitlement], ["Taken", balance.taken], ["Pending", balance.pending], ["Remaining", balance.remaining]].map(([label, val]) => (
            <Card key={String(label)}><CardContent className="pt-3 pb-3 text-center"><div className="text-2xl font-bold text-blue-700">{val}</div><div className="text-xs text-gray-500">{label}</div></CardContent></Card>
          ))}
        </div>
      )}

      <div className="flex justify-between items-center">
        <h3 className="font-semibold text-gray-700">Leave History</h3>
        <Button size="sm" onClick={() => setOpen(true)}><Plus className="h-4 w-4 mr-1" /> Request Leave</Button>
      </div>

      {requests.length === 0 ? <div className="text-center py-8 text-gray-400">No leave requests.</div> : (
        <div className="space-y-2">
          {requests.map((r: any) => (
            <Card key={r.id}>
              <CardContent className="pt-3 pb-3">
                <div className="flex justify-between items-center">
                  <div>
                    <div className="font-medium capitalize">{r.leave_type} Leave — {r.days_taken} day{r.days_taken !== 1 ? "s" : ""}</div>
                    <div className="text-sm text-gray-500">{new Date(r.start_date).toLocaleDateString("en-GB")} — {new Date(r.end_date).toLocaleDateString("en-GB")}</div>
                    {r.reason && <div className="text-sm text-gray-400">{r.reason}</div>}
                  </div>
                  <Badge className={statusColor[r.status]}>{r.status}</Badge>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Request Leave</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Leave Type *</Label>
              <Select value={form.leaveType} onValueChange={v => setForm(f => ({ ...f, leaveType: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["annual", "sick", "compassionate", "maternity", "paternity", "unpaid", "other"].map(t => <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Start Date *</Label><Input type="date" value={form.startDate} onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))} /></div>
              <div><Label>End Date *</Label><Input type="date" value={form.endDate} onChange={e => setForm(f => ({ ...f, endDate: e.target.value }))} /></div>
            </div>
            <div><Label>Reason</Label><Textarea value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))} rows={2} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button disabled={submit.isPending} onClick={() => submit.mutate(form)}>{submit.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}Submit Request</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function AbsenceTab({ staffId }: { staffId: string }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [openRecord, setOpenRecord] = useState(false);
  const [openReturn, setOpenReturn] = useState<string | null>(null);
  const [recordForm, setRecordForm] = useState({ absenceType: "sickness", startDate: "", reason: "" });
  const [returnForm, setReturnForm] = useState({ returnDate: "", returnToWorkNotes: "" });

  const { data, isLoading } = useQuery<any>({
    queryKey: ["/api/staff", staffId, "absences"],
    queryFn: () => fetch(`/api/staff/${staffId}/absences`, { credentials: "include" }).then(r => r.json()),
  });

  const recordAbsence = useMutation({
    mutationFn: (d: any) => apiRequest("POST", `/api/staff/${staffId}/absences`, d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/staff", staffId, "absences"] }); setOpenRecord(false); toast({ title: "Absence recorded" }); },
    onError: () => toast({ title: "Error", description: "Failed to record absence", variant: "destructive" }),
  });

  const recordReturn = useMutation({
    mutationFn: ({ id, ...d }: any) => apiRequest("PUT", `/api/staff/${staffId}/absences/${id}/return`, d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/staff", staffId, "absences"] }); setOpenReturn(null); toast({ title: "Return to work recorded" }); },
    onError: () => toast({ title: "Error", description: "Failed to record return", variant: "destructive" }),
  });

  if (isLoading) return <div className="text-center py-8 text-gray-400">Loading...</div>;

  const { absences = [], bradfordFactor } = data || {};
  const bfRating: Record<string, string> = { low: "bg-green-100 text-green-800", medium: "bg-yellow-100 text-yellow-800", high: "bg-orange-100 text-orange-800", critical: "bg-red-100 text-red-800" };

  return (
    <div className="space-y-4">
      {bradfordFactor && (
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm text-gray-500">Bradford Factor Score (rolling 12 months)</div>
                <div className="text-3xl font-bold text-gray-900">{bradfordFactor.score}</div>
                <div className="text-sm text-gray-500">{bradfordFactor.spells} spell{bradfordFactor.spells !== 1 ? "s" : ""} · {bradfordFactor.totalDays} days lost</div>
              </div>
              <Badge className={bfRating[bradfordFactor.rating] || "bg-gray-100 text-gray-800"}>{bradfordFactor.rating?.toUpperCase()}</Badge>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex justify-between items-center">
        <h3 className="font-semibold text-gray-700">Absence History</h3>
        <Button size="sm" onClick={() => setOpenRecord(true)}><Plus className="h-4 w-4 mr-1" /> Record Absence</Button>
      </div>

      {absences.length === 0 ? <div className="text-center py-8 text-gray-400">No absence records.</div> : (
        <div className="space-y-2">
          {absences.map((a: any) => (
            <Card key={a.id} className={!a.return_date ? "border-yellow-300" : ""}>
              <CardContent className="pt-3 pb-3">
                <div className="flex justify-between items-center">
                  <div>
                    <div className="font-medium capitalize">{a.absence_type} — {a.days_lost ? `${a.days_lost} days` : "Ongoing"}</div>
                    <div className="text-sm text-gray-500">Started {new Date(a.start_date).toLocaleDateString("en-GB")}{a.return_date ? ` · Returned ${new Date(a.return_date).toLocaleDateString("en-GB")}` : ""}</div>
                    {a.fit_note_required && <Badge className="bg-orange-100 text-orange-800 text-xs mt-1">Fit note required</Badge>}
                  </div>
                  {!a.return_date && (
                    <Button size="sm" variant="outline" onClick={() => { setOpenReturn(a.id); setReturnForm({ returnDate: new Date().toISOString().split("T")[0], returnToWorkNotes: "" }); }}>
                      Record Return
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={openRecord} onOpenChange={setOpenRecord}>
        <DialogContent>
          <DialogHeader><DialogTitle>Record Absence</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Absence Type</Label>
              <Select value={recordForm.absenceType} onValueChange={v => setRecordForm(f => ({ ...f, absenceType: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{["sickness", "unauthorised", "family_emergency", "bereavement", "other"].map(t => <SelectItem key={t} value={t} className="capitalize">{t.replace(/_/g, " ")}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Start Date *</Label><Input type="date" value={recordForm.startDate} onChange={e => setRecordForm(f => ({ ...f, startDate: e.target.value }))} /></div>
            <div><Label>Reason</Label><Textarea value={recordForm.reason} onChange={e => setRecordForm(f => ({ ...f, reason: e.target.value }))} rows={2} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenRecord(false)}>Cancel</Button>
            <Button disabled={recordAbsence.isPending} onClick={() => recordAbsence.mutate(recordForm)}>{recordAbsence.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}Record</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!openReturn} onOpenChange={() => setOpenReturn(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Record Return to Work</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Return Date *</Label><Input type="date" value={returnForm.returnDate} onChange={e => setReturnForm(f => ({ ...f, returnDate: e.target.value }))} /></div>
            <div><Label>Return to Work Interview Notes</Label><Textarea value={returnForm.returnToWorkNotes} onChange={e => setReturnForm(f => ({ ...f, returnToWorkNotes: e.target.value }))} rows={3} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenReturn(null)}>Cancel</Button>
            <Button disabled={recordReturn.isPending} onClick={() => recordReturn.mutate({ id: openReturn, ...returnForm })}>{recordReturn.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}Record Return</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function DocumentsTab({ staffId }: { staffId: string }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ documentType: "contract", title: "", fileUrl: "", fileName: "", isConfidential: false, expiryDate: "", notes: "" });

  const { data: docs = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/staff", staffId, "documents"],
    queryFn: () => fetch(`/api/staff/${staffId}/documents`, { credentials: "include" }).then(r => r.json()),
  });

  const add = useMutation({
    mutationFn: (d: any) => apiRequest("POST", `/api/staff/${staffId}/documents/upload`, d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/staff", staffId, "documents"] }); setOpen(false); toast({ title: "Document added" }); },
    onError: () => toast({ title: "Error", description: "Failed to add document", variant: "destructive" }),
  });

  const del = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/staff/${staffId}/documents/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/staff", staffId, "documents"] }); toast({ title: "Document removed" }); },
  });

  const docTypeLabels: Record<string, string> = { contract: "Contract", right_to_work: "Right to Work", certificate: "Certificate", health_questionnaire: "Health Questionnaire", disciplinary: "Disciplinary", appraisal: "Appraisal", other: "Other" };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="font-semibold text-gray-700">Documents</h3>
        <Button size="sm" onClick={() => setOpen(true)}><Plus className="h-4 w-4 mr-1" /> Add Document</Button>
      </div>

      {isLoading ? <div className="text-center py-4 text-gray-500">Loading...</div> : docs.length === 0 ? (
        <div className="text-center py-8 text-gray-400">No documents stored.</div>
      ) : (
        <div className="space-y-2">
          {docs.map((d: any) => (
            <Card key={d.id}>
              <CardContent className="pt-3 pb-3">
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-3">
                    <FileText className="h-5 w-5 text-blue-500" />
                    <div>
                      <div className="font-medium">{d.title} {d.is_confidential && <Badge className="bg-red-100 text-red-800 text-xs ml-1">Confidential</Badge>}</div>
                      <div className="text-sm text-gray-500">{docTypeLabels[d.document_type] || d.document_type} · {new Date(d.created_at).toLocaleDateString("en-GB")}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {d.file_url && <a href={d.file_url} target="_blank" rel="noopener noreferrer"><Button size="sm" variant="outline">View</Button></a>}
                    <Button size="sm" variant="ghost" className="text-red-500 h-7 w-7 p-0" onClick={() => del.mutate(d.id)}><XCircle className="h-4 w-4" /></Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Document</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Document Type</Label>
              <Select value={form.documentType} onValueChange={v => setForm(f => ({ ...f, documentType: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(docTypeLabels).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Title *</Label><Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} /></div>
            <div><Label>File URL *</Label><Input value={form.fileUrl} onChange={e => setForm(f => ({ ...f, fileUrl: e.target.value }))} placeholder="https://..." /></div>
            <div><Label>File Name *</Label><Input value={form.fileName} onChange={e => setForm(f => ({ ...f, fileName: e.target.value }))} /></div>
            <div><Label>Expiry Date</Label><Input type="date" value={form.expiryDate} onChange={e => setForm(f => ({ ...f, expiryDate: e.target.value }))} /></div>
            <div className="flex items-center gap-2">
              <input type="checkbox" id="confidential" checked={form.isConfidential} onChange={e => setForm(f => ({ ...f, isConfidential: e.target.checked }))} />
              <Label htmlFor="confidential">Confidential document</Label>
            </div>
            <div><Label>Notes</Label><Textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button disabled={add.isPending} onClick={() => add.mutate(form)}>{add.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function OnboardingTab({ staffId }: { staffId: string }) {
  const qc = useQueryClient();
  const { toast } = useToast();

  const { data, isLoading, refetch } = useQuery<any>({
    queryKey: ["/api/staff", staffId, "onboarding"],
    queryFn: () => fetch(`/api/staff/${staffId}/onboarding`, { credentials: "include" }).then(r => r.json()),
  });

  const create = useMutation({
    mutationFn: () => apiRequest("POST", `/api/staff/${staffId}/onboarding/create`, {}),
    onSuccess: () => { refetch(); toast({ title: "Onboarding checklist created" }); },
  });

  const toggle = useMutation({
    mutationFn: ({ itemId, completed }: { itemId: string; completed: boolean }) =>
      apiRequest("PATCH", `/api/staff/${staffId}/onboarding/items/${itemId}`, { completed }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/staff", staffId, "onboarding"] }); },
  });

  if (isLoading) return <div className="text-center py-8 text-gray-400">Loading...</div>;

  if (!data) return (
    <div className="text-center py-8">
      <CheckSquare className="h-12 w-12 mx-auto text-gray-300 mb-3" />
      <p className="text-gray-500 mb-4">No onboarding checklist yet.</p>
      <Button onClick={() => create.mutate()} disabled={create.isPending}>{create.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}Create Onboarding Checklist</Button>
    </div>
  );

  const { items = [], percent } = data;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-gray-700">Onboarding Progress</h3>
        <Badge className={percent === 100 ? "bg-green-100 text-green-800" : "bg-blue-100 text-blue-800"}>{percent}% complete</Badge>
      </div>
      <div className="w-full bg-gray-200 rounded-full h-2">
        <div className="bg-blue-600 h-2 rounded-full transition-all" style={{ width: `${percent}%` }} />
      </div>
      <div className="space-y-2">
        {items.map((item: any) => (
          <div key={item.id} className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${item.completed ? "bg-green-50 border-green-200" : "bg-white border-gray-200 hover:bg-gray-50"}`}
            onClick={() => toggle.mutate({ itemId: item.id, completed: !item.completed })}>
            {item.completed ? <CheckCircle className="h-5 w-5 text-green-600 mt-0.5 flex-shrink-0" /> : <Clock className="h-5 w-5 text-gray-400 mt-0.5 flex-shrink-0" />}
            <div>
              <div className={`text-sm font-medium ${item.completed ? "line-through text-gray-400" : "text-gray-900"}`}>{item.label}</div>
              {item.completed_by && <div className="text-xs text-gray-400">Completed by {item.completed_by}</div>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function AppraisalsTab({ staffId }: { staffId: string }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ reviewDate: "", reviewType: "annual", conductedBy: "", overallRating: "", summaryNotes: "", nextReviewDate: "" });

  const { data: appraisals = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/staff", staffId, "appraisals"],
    queryFn: () => fetch(`/api/staff/${staffId}/appraisals`, { credentials: "include" }).then(r => r.json()),
  });

  const add = useMutation({
    mutationFn: (d: any) => apiRequest("POST", `/api/staff/${staffId}/appraisals`, d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/staff", staffId, "appraisals"] }); setOpen(false); toast({ title: "Appraisal recorded" }); },
    onError: () => toast({ title: "Error", description: "Failed to record appraisal", variant: "destructive" }),
  });

  const ratingColors: Record<string, string> = { outstanding: "bg-purple-100 text-purple-800", exceeds_expectations: "bg-blue-100 text-blue-800", meets_expectations: "bg-green-100 text-green-800", below_expectations: "bg-yellow-100 text-yellow-800", unsatisfactory: "bg-red-100 text-red-800" };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="font-semibold text-gray-700">Appraisal History</h3>
        <Button size="sm" onClick={() => setOpen(true)}><Plus className="h-4 w-4 mr-1" /> Add Appraisal</Button>
      </div>

      {isLoading ? <div className="text-center py-4 text-gray-500">Loading...</div> : appraisals.length === 0 ? (
        <div className="text-center py-8 text-gray-400">No appraisals recorded.</div>
      ) : (
        <div className="space-y-3">
          {appraisals.map((a: any) => (
            <Card key={a.id}>
              <CardContent className="pt-4">
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <div className="font-medium capitalize">{a.review_type} Review</div>
                    <div className="text-sm text-gray-500">{new Date(a.review_date).toLocaleDateString("en-GB")} · Conducted by {a.conducted_by}</div>
                  </div>
                  {a.overall_rating && <Badge className={ratingColors[a.overall_rating] || "bg-gray-100 text-gray-800"}>{a.overall_rating?.replace(/_/g, " ")}</Badge>}
                </div>
                {a.summary_notes && <p className="text-sm text-gray-600 mt-2">{a.summary_notes}</p>}
                {a.next_review_date && <div className="text-sm text-blue-600 mt-2">Next review: {new Date(a.next_review_date).toLocaleDateString("en-GB")}</div>}
                {a.objectives?.length > 0 && (
                  <div className="mt-3 space-y-1">
                    <div className="text-xs font-medium text-gray-500 uppercase tracking-wide">Objectives</div>
                    {a.objectives.map((o: any) => <div key={o.id} className="text-sm text-gray-600 flex items-center gap-2"><ChevronRight className="h-3 w-3" />{o.description}</div>)}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Record Appraisal</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Review Date *</Label><Input type="date" value={form.reviewDate} onChange={e => setForm(f => ({ ...f, reviewDate: e.target.value }))} /></div>
              <div><Label>Review Type</Label>
                <Select value={form.reviewType} onValueChange={v => setForm(f => ({ ...f, reviewType: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{["annual", "probation", "mid_year", "pip"].map(t => <SelectItem key={t} value={t} className="capitalize">{t.replace(/_/g, " ")}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div><Label>Conducted By *</Label><Input value={form.conductedBy} onChange={e => setForm(f => ({ ...f, conductedBy: e.target.value }))} /></div>
            <div><Label>Overall Rating</Label>
              <Select value={form.overallRating} onValueChange={v => setForm(f => ({ ...f, overallRating: v }))}>
                <SelectTrigger><SelectValue placeholder="Select rating" /></SelectTrigger>
                <SelectContent>{["outstanding", "exceeds_expectations", "meets_expectations", "below_expectations", "unsatisfactory"].map(r => <SelectItem key={r} value={r} className="capitalize">{r.replace(/_/g, " ")}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Summary Notes</Label><Textarea value={form.summaryNotes} onChange={e => setForm(f => ({ ...f, summaryNotes: e.target.value }))} rows={3} /></div>
            <div><Label>Next Review Date</Label><Input type="date" value={form.nextReviewDate} onChange={e => setForm(f => ({ ...f, nextReviewDate: e.target.value }))} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button disabled={add.isPending} onClick={() => add.mutate(form)}>{add.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function EmploymentTab({ staffId, staff }: { staffId: string; staff: any }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    employmentType: staff?.employment_type || "full_time",
    contractStartDate: staff?.contract_start_date ? staff.contract_start_date.slice(0, 10) : "",
    contractEndDate: staff?.contract_end_date ? staff.contract_end_date.slice(0, 10) : "",
    team: staff?.team || "",
    payGrade: staff?.pay_grade || "",
    emergencyContactName: staff?.emergency_contact_name || "",
    emergencyContactPhone: staff?.emergency_contact_phone || "",
    emergencyContactRelationship: staff?.emergency_contact_relationship || "",
    employmentStatus: staff?.employment_status || "active",
    annualLeaveEntitlementDays: staff?.annual_leave_entitlement_days ?? 28,
    workingDaysPerWeek: staff?.working_days_per_week ?? 5,
    lineManagerId: staff?.line_manager_id || "",
  });
  const [mgrSearch, setMgrSearch] = useState("");

  const { data: allStaff = [] } = useQuery<any[]>({ queryKey: ["/api/staff"], queryFn: () => fetch("/api/staff", { credentials: "include" }).then(r => r.json()) });

  // Compute descendant ids of the current staff member so we exclude them from the dropdown
  const descendantIds = (() => {
    const ids = new Set<string>([staffId]);
    let added = true;
    while (added) {
      added = false;
      for (const s of allStaff) {
        const mgr = (s.lineManagerId ?? s.line_manager_id) as string | null | undefined;
        if (mgr && ids.has(mgr) && !ids.has(s.id)) {
          ids.add(s.id);
          added = true;
        }
      }
    }
    return ids;
  })();

  const managerOptions = (allStaff as any[])
    .filter(s => {
      if (descendantIds.has(s.id)) return false;
      if (s.isActive === false) return false;
      const status = s.employmentStatus ?? s.employment_status;
      if (status === "leaver" || status === "archived") return false;
      const q = mgrSearch.trim().toLowerCase();
      if (!q) return true;
      const fn = (s.firstName ?? s.first_name ?? "").toLowerCase();
      const ln = (s.lastName ?? s.last_name ?? "").toLowerCase();
      const dept = (s.department ?? "").toLowerCase();
      const jt = (s.jobTitle ?? s.job_title ?? "").toLowerCase();
      return `${fn} ${ln} ${dept} ${jt}`.includes(q);
    })
    .sort((a, b) => `${a.lastName ?? a.last_name ?? ""}${a.firstName ?? a.first_name ?? ""}`
      .localeCompare(`${b.lastName ?? b.last_name ?? ""}${b.firstName ?? b.first_name ?? ""}`))
    .slice(0, 100);

  const selectedManager = (allStaff as any[]).find(s => s.id === form.lineManagerId);

  const save = useMutation({
    mutationFn: (d: any) => apiRequest("PATCH", `/api/staff/${staffId}/hr`, d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/staff"] }); qc.invalidateQueries({ queryKey: ["/api/staff", staffId] }); setEditing(false); toast({ title: "Employment details updated" }); },
    onError: (e: any) => toast({ title: "Error", description: e?.message || "Failed to update", variant: "destructive" }),
  });

  const empTypeLabels: Record<string, string> = { full_time: "Full Time", part_time: "Part Time", casual: "Casual", zero_hours: "Zero Hours", fixed_term: "Fixed Term", apprentice: "Apprentice" };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="font-semibold text-gray-700">Employment Details</h3>
        <Button size="sm" variant={editing ? "outline" : "default"} onClick={() => setEditing(!editing)}>{editing ? "Cancel" : "Edit"}</Button>
      </div>

      {editing ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Employment Type</Label>
              <Select value={form.employmentType} onValueChange={v => setForm(f => ({ ...f, employmentType: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(empTypeLabels).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Employment Status</Label>
              <Select value={form.employmentStatus} onValueChange={v => setForm(f => ({ ...f, employmentStatus: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{["active", "on_leave", "probation", "suspended", "leaver", "archived"].map(s => <SelectItem key={s} value={s} className="capitalize">{s.replace(/_/g, " ")}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Contract Start</Label><Input type="date" value={form.contractStartDate} onChange={e => setForm(f => ({ ...f, contractStartDate: e.target.value }))} /></div>
            <div><Label>Contract End (fixed term)</Label><Input type="date" value={form.contractEndDate} onChange={e => setForm(f => ({ ...f, contractEndDate: e.target.value }))} /></div>
            <div><Label>Team</Label><Input value={form.team} onChange={e => setForm(f => ({ ...f, team: e.target.value }))} /></div>
            <div><Label>Pay Grade</Label><Input value={form.payGrade} onChange={e => setForm(f => ({ ...f, payGrade: e.target.value }))} /></div>
            <div><Label>Annual Leave Entitlement (days)</Label><Input type="number" step="0.5" value={form.annualLeaveEntitlementDays} onChange={e => setForm(f => ({ ...f, annualLeaveEntitlementDays: e.target.value }))} /></div>
            <div><Label>Working Days Per Week</Label><Input type="number" step="0.5" min="0.5" max="5" value={form.workingDaysPerWeek} onChange={e => setForm(f => ({ ...f, workingDaysPerWeek: e.target.value }))} /></div>
            <div className="col-span-2">
              <Label>Line Manager</Label>
              <Select
                value={form.lineManagerId || "__none__"}
                onValueChange={v => setForm(f => ({ ...f, lineManagerId: v === "__none__" ? "" : v }))}
              >
                <SelectTrigger data-testid="select-line-manager">
                  <SelectValue placeholder="No line manager" />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  <div className="p-2 sticky top-0 bg-white border-b">
                    <Input
                      placeholder="Search staff…"
                      value={mgrSearch}
                      onChange={e => setMgrSearch(e.target.value)}
                      onKeyDown={e => e.stopPropagation()}
                      className="h-8"
                    />
                  </div>
                  <SelectItem value="__none__">No line manager</SelectItem>
                  {managerOptions.length === 0 && (
                    <div className="px-3 py-2 text-xs text-gray-400">No matching active staff</div>
                  )}
                  {managerOptions.map((s: any) => (
                    <SelectItem key={s.id} value={s.id}>
                      {(s.firstName ?? s.first_name)} {(s.lastName ?? s.last_name)}
                      {s.department ? <span className="text-gray-400 text-xs ml-1">— {s.department}</span> : null}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-gray-400 mt-1">Current user and their direct/indirect reports are hidden to prevent circular references.</p>
            </div>
          </div>
          <div className="border-t pt-3">
            <h4 className="font-medium text-gray-700 mb-3 flex items-center gap-2"><Phone className="h-4 w-4" /> Emergency Contact</h4>
            <div className="grid grid-cols-3 gap-3">
              <div><Label>Name</Label><Input value={form.emergencyContactName} onChange={e => setForm(f => ({ ...f, emergencyContactName: e.target.value }))} /></div>
              <div><Label>Phone</Label><Input value={form.emergencyContactPhone} onChange={e => setForm(f => ({ ...f, emergencyContactPhone: e.target.value }))} /></div>
              <div><Label>Relationship</Label><Input value={form.emergencyContactRelationship} onChange={e => setForm(f => ({ ...f, emergencyContactRelationship: e.target.value }))} /></div>
            </div>
          </div>
          <Button disabled={save.isPending} onClick={() => save.mutate(form)}>{save.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}Save Changes</Button>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4">
          {[
            ["Employment Type", empTypeLabels[staff?.employment_type] || staff?.employment_type || "—"],
            ["Status", staff?.employment_status?.replace(/_/g, " ") || "active"],
            ["Contract Start", staff?.contract_start_date ? new Date(staff.contract_start_date).toLocaleDateString("en-GB") : "—"],
            ["Contract End", staff?.contract_end_date ? new Date(staff.contract_end_date).toLocaleDateString("en-GB") : "—"],
            ["Team", staff?.team || "—"],
            ["Pay Grade", staff?.pay_grade || "—"],
            ["Annual Leave Entitlement", `${staff?.annual_leave_entitlement_days ?? 28} days`],
            ["Working Days / Week", staff?.working_days_per_week ?? 5],
            ["Line Manager", selectedManager
              ? `${selectedManager.firstName ?? selectedManager.first_name} ${selectedManager.lastName ?? selectedManager.last_name}`
              : "—"],
          ].map(([label, value]) => (
            <div key={String(label)} className="bg-gray-50 rounded-lg p-3">
              <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">{label}</div>
              <div className="font-medium capitalize">{String(value)}</div>
            </div>
          ))}
          {(staff?.emergency_contact_name || staff?.emergency_contact_phone) && (
            <div className="col-span-2 bg-orange-50 border border-orange-200 rounded-lg p-3">
              <div className="text-xs text-gray-500 uppercase tracking-wide mb-1 flex items-center gap-1"><Phone className="h-3 w-3" /> Emergency Contact</div>
              <div className="font-medium">{staff.emergency_contact_name || "—"}</div>
              <div className="text-sm text-gray-600">{staff.emergency_contact_phone} {staff.emergency_contact_relationship ? `(${staff.emergency_contact_relationship})` : ""}</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function StaffProfile() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();

  const { data: staffList = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/staff"],
    queryFn: () => fetch("/api/staff", { credentials: "include" }).then(r => r.json()),
  });

  const staff = staffList.find((s: any) => s.id === id);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (!staff) {
    return (
      <div className="text-center py-16">
        <User className="h-12 w-12 mx-auto text-gray-300 mb-3" />
        <p className="text-gray-500">Staff member not found.</p>
        <Button className="mt-4" onClick={() => navigate("/staff")}>Back to Staff</Button>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate("/staff")}><ArrowLeft className="h-4 w-4 mr-1" /> Back</Button>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="flex items-start gap-4">
            <div className="w-16 h-16 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0 text-2xl font-bold text-blue-700 overflow-hidden">
              {staff.photoUrl ? <img src={staff.photoUrl} alt="" className="w-full h-full object-cover" /> : `${staff.firstName?.[0]}${staff.lastName?.[0]}`}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3 flex-wrap">
                <h1 className="text-2xl font-bold text-gray-900">{staff.firstName} {staff.lastName}</h1>
                <Badge className={statusBadge(staff.employment_status || "active")}>{(staff.employment_status || "active").replace(/_/g, " ")}</Badge>
              </div>
              <div className="text-gray-500 mt-1">{staff.jobTitle || "—"} {staff.department ? `· ${staff.department}` : ""}</div>
              <div className="flex flex-wrap gap-4 mt-2 text-sm text-gray-500">
                {staff.email && <span>{staff.email}</span>}
                {staff.employeeId && <span>ID: {staff.employeeId}</span>}
                {staff.accessLevel && <span>Access: {staff.accessLevel}</span>}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="employment">
        <TabsList className="w-full flex-wrap h-auto gap-1">
          <TabsTrigger value="employment" className="text-xs"><Briefcase className="h-3 w-3 mr-1" />Employment</TabsTrigger>
          <TabsTrigger value="rtw" className="text-xs"><Shield className="h-3 w-3 mr-1" />Right to Work</TabsTrigger>
          <TabsTrigger value="training" className="text-xs"><BookOpen className="h-3 w-3 mr-1" />Training</TabsTrigger>
          <TabsTrigger value="leave" className="text-xs"><Calendar className="h-3 w-3 mr-1" />Leave</TabsTrigger>
          <TabsTrigger value="absence" className="text-xs"><Activity className="h-3 w-3 mr-1" />Absence</TabsTrigger>
          <TabsTrigger value="documents" className="text-xs"><FileText className="h-3 w-3 mr-1" />Documents</TabsTrigger>
          <TabsTrigger value="onboarding" className="text-xs"><CheckSquare className="h-3 w-3 mr-1" />Onboarding</TabsTrigger>
          <TabsTrigger value="appraisals" className="text-xs"><Star className="h-3 w-3 mr-1" />Appraisals</TabsTrigger>
          {(staff.employment_status === "leaver") && (
            <TabsTrigger value="leaver" className="text-xs text-red-600"><LogOut className="h-3 w-3 mr-1" />Leaver</TabsTrigger>
          )}
        </TabsList>

        <div className="mt-4">
          <TabsContent value="employment"><EmploymentTab staffId={id!} staff={staff} /></TabsContent>
          <TabsContent value="rtw"><RtwTab staffId={id!} /></TabsContent>
          <TabsContent value="training"><TrainingTab staffId={id!} /></TabsContent>
          <TabsContent value="leave"><LeaveTab staffId={id!} /></TabsContent>
          <TabsContent value="absence"><AbsenceTab staffId={id!} /></TabsContent>
          <TabsContent value="documents"><DocumentsTab staffId={id!} /></TabsContent>
          <TabsContent value="onboarding"><OnboardingTab staffId={id!} /></TabsContent>
          <TabsContent value="appraisals"><AppraisalsTab staffId={id!} /></TabsContent>
          {staff.employment_status === "leaver" && (
            <TabsContent value="leaver">
              <div className="text-center py-8 text-gray-400">
                <LogOut className="h-10 w-10 mx-auto mb-3 text-red-400" />
                <p>Use the <strong>Leavers</strong> page in the HR section to manage this employee's offboarding checklist.</p>
              </div>
            </TabsContent>
          )}
        </div>
      </Tabs>
    </div>
  );
}
