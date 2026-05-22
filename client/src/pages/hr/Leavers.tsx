import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { LogOut, AlertTriangle, Loader2, Settings as SettingsIcon, ShieldAlert, ArrowLeft } from "lucide-react";
import { Link } from "wouter";

export const REASON_LABELS: Record<string, string> = {
  resignation: "Resignation",
  redundancy: "Redundancy",
  dismissal: "Dismissal",
  end_of_contract: "End of contract",
  retirement: "Retirement",
  death_in_service: "Death in service",
  mutual_agreement: "Mutual agreement",
};

export default function Leavers() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [initiateOpen, setInitiateOpen] = useState(false);
  const [selectedStaff, setSelectedStaff] = useState("");
  const [form, setForm] = useState({ lastDay: "", reasonCode: "resignation", additionalDetail: "" });

  const { data: leavers = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/hr/leavers"],
    queryFn: () => fetch("/api/hr/leavers", { credentials: "include" }).then(r => r.json()),
  });

  const { data: activeStaff = [] } = useQuery<any[]>({
    queryKey: ["/api/staff"],
    queryFn: () => fetch("/api/staff", { credentials: "include" }).then(r => r.json()),
  });

  const initiate = useMutation({
    mutationFn: ({ staffId, ...data }: any) =>
      apiRequest("POST", `/api/staff/${staffId}/initiate-leaver`, {
        ...data,
        isVoluntary: data.reasonCode !== "dismissal" && data.reasonCode !== "redundancy",
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/hr/leavers"] });
      qc.invalidateQueries({ queryKey: ["/api/staff"] });
      setInitiateOpen(false);
      setSelectedStaff("");
      setForm({ lastDay: "", reasonCode: "resignation", additionalDetail: "" });
      toast({ title: "Leaver process initiated" });
    },
    onError: () => toast({ title: "Error", description: "Failed to initiate leaver process", variant: "destructive" }),
  });

  const eligibleStaff = activeStaff.filter((s: any) =>
    s.isActive && !["leaver", "archived"].includes(s.employment_status)
  );

  return (
    <div className="space-y-6">
      <Link to="/hr" className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-500 hover:text-gray-900 transition-colors py-1 px-2 -ml-2 rounded-lg hover:bg-gray-100">
        <ArrowLeft className="h-4 w-4" /> Back to HR Hub
      </Link>
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <LogOut className="h-6 w-6 text-red-500" /> Leavers
          </h1>
          <p className="text-gray-500 text-sm mt-1">Structured offboarding for departing staff</p>
        </div>
        <div className="flex gap-2">
          <Link href="/settings/leaver-template">
            <Button variant="outline" size="sm"><SettingsIcon className="h-4 w-4 mr-1" /> Template</Button>
          </Link>
          <Button onClick={() => setInitiateOpen(true)} className="bg-red-600 hover:bg-red-700 text-white">
            <LogOut className="h-4 w-4 mr-2" /> Initiate Leaver
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-blue-600" /></div>
      ) : leavers.length === 0 ? (
        <Card>
          <CardContent className="text-center py-12">
            <LogOut className="h-12 w-12 mx-auto text-gray-300 mb-3" />
            <p className="text-gray-500">No active leaver processes.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {leavers.map((l: any) => {
            const urgent = l.daysUntilLastDay !== null && l.daysUntilLastDay <= 3;
            const complete = l.percent === 100;
            return (
              <Card key={l.id} className={urgent && !complete ? "border-red-200" : complete ? "border-green-200" : ""}>
                <CardContent className="pt-4 pb-4">
                  <div className="flex items-start justify-between flex-wrap gap-3">
                    <div>
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className="font-semibold text-lg">{l.first_name} {l.last_name}</span>
                        {complete ? <Badge className="bg-green-100 text-green-800">Complete</Badge>
                          : urgent ? <Badge className="bg-red-100 text-red-800 flex items-center gap-1"><AlertTriangle className="h-3 w-3" />Urgent</Badge>
                          : null}
                        {!l.criticalComplete && !complete && (
                          <Badge className="bg-amber-100 text-amber-800 flex items-center gap-1">
                            <ShieldAlert className="h-3 w-3" />Critical pending
                          </Badge>
                        )}
                        {l.deactivation_override_reason && (
                          <Badge className="bg-orange-100 text-orange-800">Override used</Badge>
                        )}
                      </div>
                      <div className="text-sm text-gray-500">{l.department} · {l.job_title}</div>
                      <div className="text-sm text-gray-500 mt-1">
                        Last day: <strong>{l.last_day ? new Date(l.last_day).toLocaleDateString("en-GB") : "—"}</strong>{" "}
                        {l.daysUntilLastDay !== null && (
                          <span className={urgent ? "text-red-600 font-medium" : ""}> ({l.daysUntilLastDay} days)</span>
                        )}
                      </div>
                      {l.reason_code && (
                        <div className="text-sm text-gray-500 mt-1">
                          Reason: <strong>{REASON_LABELS[l.reason_code] || l.reason_code}</strong>
                          {l.additional_detail && <span className="text-gray-400"> — {l.additional_detail}</span>}
                        </div>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <div className="text-right">
                        <div className="text-sm font-medium">{l.completed_items}/{l.total_items} tasks</div>
                        <div className="w-28 h-2 bg-gray-200 rounded-full mt-1">
                          <div className={`h-2 rounded-full ${complete ? "bg-green-500" : "bg-blue-500"}`} style={{ width: `${l.percent}%` }} />
                        </div>
                      </div>
                      <Link href={`/hr/staff/${l.id}?tab=leaver`}>
                        <Button size="sm" variant="outline">Open Offboarding</Button>
                      </Link>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={initiateOpen} onOpenChange={setInitiateOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Initiate Leaver Process</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Staff Member *</Label>
              <select
                className="w-full border rounded-md h-9 px-3 text-sm"
                value={selectedStaff}
                onChange={e => setSelectedStaff(e.target.value)}
              >
                <option value="">Select staff member…</option>
                {eligibleStaff.map((s: any) => (
                  <option key={s.id} value={s.id}>
                    {s.firstName} {s.lastName} — {s.department}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label>Last Working Day *</Label>
              <Input type="date" value={form.lastDay} onChange={e => setForm(f => ({ ...f, lastDay: e.target.value }))} />
            </div>
            <div>
              <Label>Reason *</Label>
              <Select value={form.reasonCode} onValueChange={v => setForm(f => ({ ...f, reasonCode: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(REASON_LABELS).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Additional Detail (optional)</Label>
              <Textarea
                value={form.additionalDetail}
                onChange={e => setForm(f => ({ ...f, additionalDetail: e.target.value }))}
                rows={2}
                placeholder="Any context the offboarding team should know"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setInitiateOpen(false)}>Cancel</Button>
            <Button
              className="bg-red-600 hover:bg-red-700 text-white"
              disabled={initiate.isPending || !selectedStaff || !form.lastDay}
              onClick={() => initiate.mutate({ staffId: selectedStaff, ...form })}
            >
              {initiate.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />} Initiate Leaver
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
