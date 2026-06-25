import { useState } from "react";
import { Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { BookOpen, Plus, AlertTriangle, CheckCircle, Clock, XCircle, Loader2, Search, ArrowLeft } from "lucide-react";

const STATUS_STYLE: Record<string, { bg: string; icon: any; label: string }> = {
  valid: { bg: "bg-green-100", icon: CheckCircle, label: "Valid" },
  expiring_soon: { bg: "bg-yellow-100", icon: Clock, label: "Expiring" },
  expired: { bg: "bg-red-100", icon: XCircle, label: "Expired" },
  no_expiry: { bg: "bg-gray-100", icon: CheckCircle, label: "No expiry" },
  not_completed: { bg: "bg-white", icon: null, label: "—" },
};

export default function TrainingMatrix() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [reqOpen, setReqOpen] = useState(false);
  const [reqForm, setReqForm] = useState({ courseName: "", appliesTo: "all", renewalPeriodMonths: "" });
  const [search, setSearch] = useState("");

  const { data: matrixData, isLoading } = useQuery<any>({
    queryKey: ["/api/training/matrix"],
    queryFn: () => fetch("/api/training/matrix", { credentials: "include" }).then(r => r.json()),
  });

  const { data: expiring = [] } = useQuery<any[]>({
    queryKey: ["/api/training/expiring"],
    queryFn: () => fetch("/api/training/expiring", { credentials: "include" }).then(r => r.json()),
  });

  const addReq = useMutation({
    mutationFn: (d: any) => apiRequest("POST", "/api/training/requirements", d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/training/matrix"] }); setReqOpen(false); toast({ title: "Training requirement added" }); },
    onError: () => toast({ title: "Error", description: "Failed to add requirement", variant: "destructive" }),
  });

  const delReq = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/training/requirements/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/training/matrix"] }); toast({ title: "Requirement removed" }); },
  });

  const { requirements = [], matrix = [] } = matrixData || {};

  const filteredMatrix = search
    ? matrix.filter((m: any) => `${m.staff.first_name} ${m.staff.last_name} ${m.staff.department}`.toLowerCase().includes(search.toLowerCase()))
    : matrix;

  return (
    <div className="space-y-6">
      <Link to="/hr" className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-500 hover:text-gray-900 transition-colors py-1 px-2 -ml-2 rounded-lg hover:bg-gray-100">
        <ArrowLeft className="h-4 w-4" /> Back to HR Hub
      </Link>
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><BookOpen className="h-6 w-6 text-blue-600" /> Training Matrix</h1>
          <p className="text-gray-500 text-sm mt-1">Mandatory training compliance across all staff</p>
        </div>
        <Button size="sm" onClick={() => setReqOpen(true)}><Plus className="h-4 w-4 mr-1" /> Add Requirement</Button>
      </div>

      {expiring.length > 0 && (
        <Card variant="glass" className="border-yellow-200 bg-yellow-50">
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 mb-3"><AlertTriangle className="h-4 w-4 text-yellow-700" /><span className="font-medium text-yellow-800">{expiring.length} mandatory training records expiring or expired</span></div>
            <div className="space-y-1">
              {expiring.slice(0, 5).map((e: any) => (
                <div key={e.id} className="text-sm text-yellow-800">
                  <span className="font-medium">{e.first_name} {e.last_name}</span> — {e.course_name} · <span className={e.status === "expired" ? "text-red-700 font-medium" : ""}>{e.status === "expired" ? "EXPIRED" : `expires ${new Date(e.expiry_date).toLocaleDateString("en-GB")}`}</span>
                </div>
              ))}
              {expiring.length > 5 && <div className="text-sm text-yellow-700 font-medium">and {expiring.length - 5} more…</div>}
            </div>
          </CardContent>
        </Card>
      )}

      {requirements.length === 0 ? (
        <Card variant="glass">
          <CardContent className="text-center py-12">
            <BookOpen className="h-12 w-12 mx-auto text-gray-300 mb-3" />
            <p className="text-gray-500 mb-4">No mandatory training requirements defined.</p>
            <Button onClick={() => setReqOpen(true)}><Plus className="h-4 w-4 mr-1" /> Add First Requirement</Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="relative flex-1 max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input className="pl-9" placeholder="Filter staff…" value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <div className="flex gap-2 flex-wrap">
              {Object.entries(STATUS_STYLE).map(([k, v]) => k !== "not_completed" && (
                <div key={k} className={`text-xs px-2 py-1 rounded ${v.bg} text-gray-700`}>{v.label}</div>
              ))}
              <div className="text-xs px-2 py-1 rounded bg-white border text-gray-400">Not completed</div>
            </div>
          </div>

          {isLoading ? <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-blue-600" /></div> : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="text-left p-2 border font-medium">Staff Member</th>
                    <th className="text-left p-2 border font-medium">Dept</th>
                    {requirements.map((r: any) => (
                      <th key={r.id} className="p-2 border font-medium text-center min-w-[100px]">
                        <div className="text-xs">{r.course_name}</div>
                        {r.renewal_period_months && <div className="text-xs text-gray-400 font-normal">Renews {r.renewal_period_months}m</div>}
                        <button onClick={() => delReq.mutate(r.id)} className="text-red-400 hover:text-red-600 text-xs mt-1">✕</button>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredMatrix.map((row: any) => (
                    <tr key={row.staff.id} className="hover:bg-gray-50">
                      <td className="p-2 border font-medium">{row.staff.first_name} {row.staff.last_name}</td>
                      <td className="p-2 border text-gray-500 text-xs">{row.staff.department}</td>
                      {requirements.map((req: any) => {
                        const cell = row.courses[req.course_name];
                        const s = cell?.status || "not_completed";
                        const style = STATUS_STYLE[s] || STATUS_STYLE.not_completed;
                        const Icon = style.icon;
                        return (
                          <td key={req.id} className={`p-2 border text-center ${style.bg}`}>
                            {Icon ? (
                              <div className="flex flex-col items-center">
                                <Icon className={`h-4 w-4 ${s === "expired" ? "text-red-600" : s === "expiring_soon" ? "text-yellow-600" : "text-green-600"}`} />
                                {cell?.expiryDate && <div className="text-xs text-gray-500">{new Date(cell.expiryDate).toLocaleDateString("en-GB")}</div>}
                              </div>
                            ) : (
                              <span className="text-gray-300">—</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <Dialog open={reqOpen} onOpenChange={setReqOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Training Requirement</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Course Name *</Label><Input value={reqForm.courseName} onChange={e => setReqForm(f => ({ ...f, courseName: e.target.value }))} placeholder="e.g. Manual Handling, First Aid" /></div>
            <div><Label>Renewal Period (months)</Label><Input type="number" value={reqForm.renewalPeriodMonths} onChange={e => setReqForm(f => ({ ...f, renewalPeriodMonths: e.target.value }))} placeholder="e.g. 12 for annual" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReqOpen(false)}>Cancel</Button>
            <Button disabled={addReq.isPending} onClick={() => addReq.mutate(reqForm)}>{addReq.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}Add</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
