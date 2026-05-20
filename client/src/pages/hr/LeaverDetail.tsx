import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import {
  ChevronDown, ChevronRight, CheckCircle2, Plus, Trash2, ShieldAlert,
  Loader2, Briefcase, Banknote, KeyRound, Users, AlertTriangle,
} from "lucide-react";
import { REASON_LABELS } from "./Leavers";

const CATEGORIES: Array<{ key: string; label: string; icon: any; color: string }> = [
  { key: "legal_payroll", label: "Legal & Payroll", icon: Banknote, color: "text-blue-600" },
  { key: "equipment", label: "Equipment", icon: Briefcase, color: "text-amber-600" },
  { key: "access", label: "Access & Systems", icon: KeyRound, color: "text-purple-600" },
  { key: "knowledge", label: "Knowledge & People", icon: Users, color: "text-green-600" },
];

export default function LeaverDetail({ staffId }: { staffId: string }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [openCat, setOpenCat] = useState<Record<string, boolean>>({
    legal_payroll: true, equipment: true, access: true, knowledge: true,
  });
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [overrideReason, setOverrideReason] = useState("");
  const [addItem, setAddItem] = useState<{ category: string; label: string; isCritical: boolean } | null>(null);
  const [newEq, setNewEq] = useState({ name: "", assetTag: "", serialNumber: "" });
  const [interview, setInterview] = useState<any>({});
  const [interviewDirty, setInterviewDirty] = useState(false);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["/api/staff", staffId, "leaver"] });
    qc.invalidateQueries({ queryKey: ["/api/hr/leavers"] });
  };

  const { data, isLoading } = useQuery<any>({
    queryKey: ["/api/staff", staffId, "leaver"],
    queryFn: () => fetch(`/api/staff/${staffId}/leaver`, { credentials: "include" }).then(r => r.json()),
  });

  // Sync interview state when loaded
  if (data?.interview && !interviewDirty && Object.keys(interview).length === 0) {
    setInterview(data.interview);
  }

  const toggleItem = useMutation({
    mutationFn: ({ id, completed, notes }: any) =>
      apiRequest("PATCH", `/api/staff/${staffId}/leaver/items/${id}`, { completed, notes }),
    onSuccess: invalidate,
  });

  const addCustomItem = useMutation({
    mutationFn: (body: any) => apiRequest("POST", `/api/staff/${staffId}/leaver/items`, body),
    onSuccess: () => { setAddItem(null); invalidate(); toast({ title: "Item added" }); },
  });

  const deleteItem = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/staff/${staffId}/leaver/items/${id}`),
    onSuccess: invalidate,
  });

  const addEquipment = useMutation({
    mutationFn: (body: any) => apiRequest("POST", `/api/staff/${staffId}/leaver/equipment`, body),
    onSuccess: () => { setNewEq({ name: "", assetTag: "", serialNumber: "" }); invalidate(); },
  });

  const patchEquipment = useMutation({
    mutationFn: ({ id, ...body }: any) => apiRequest("PATCH", `/api/staff/${staffId}/leaver/equipment/${id}`, body),
    onSuccess: invalidate,
  });

  const deleteEquipment = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/staff/${staffId}/leaver/equipment/${id}`),
    onSuccess: invalidate,
  });

  const saveInterview = useMutation({
    mutationFn: (body: any) => apiRequest("PUT", `/api/staff/${staffId}/leaver/exit-interview`, body),
    onSuccess: () => { setInterviewDirty(false); invalidate(); toast({ title: "Exit interview saved" }); },
  });

  const deactivate = useMutation({
    mutationFn: (body: any) => apiRequest("POST", `/api/staff/${staffId}/leaver/deactivate`, body),
    onSuccess: (res: any) => {
      setOverrideOpen(false); setOverrideReason("");
      invalidate();
      qc.invalidateQueries({ queryKey: ["/api/staff", staffId] });
      toast({ title: res?.overrideUsed ? "Deactivated (override used)" : "Deactivated", description: "Staff member is now inactive." });
    },
    onError: async (err: any) => {
      const msg = err?.message || "";
      if (msg.includes("Critical items incomplete")) {
        setOverrideOpen(true);
      } else {
        toast({ title: "Error", description: "Failed to deactivate", variant: "destructive" });
      }
    },
  });

  if (isLoading) return <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-blue-600" /></div>;
  if (!data) {
    return (
      <div className="text-center py-8 text-gray-400">
        No leaver process found. Use <strong>Initiate Leaver</strong> from the Leavers page.
      </div>
    );
  }

  const itemsByCat: Record<string, any[]> = {};
  for (const cat of CATEGORIES) itemsByCat[cat.key] = [];
  for (const it of data.items || []) (itemsByCat[it.category] ||= []).push(it);

  const criticalOutstanding = (data.items || []).filter((i: any) => i.is_critical && !i.completed);
  const equipmentUnreturned = (data.equipment || []).filter((e: any) => !e.returned);
  const canDeactivate = criticalOutstanding.length === 0 && equipmentUnreturned.length === 0;
  const alreadyDeactivated = !!data.checklist?.completed_at;

  return (
    <div className="space-y-5">
      {/* Summary card */}
      <Card>
        <CardContent className="pt-4 pb-4">
          <div className="flex items-start justify-between flex-wrap gap-3">
            <div>
              <div className="text-sm text-gray-500">Last working day</div>
              <div className="text-lg font-semibold">
                {data.checklist.last_day ? new Date(data.checklist.last_day).toLocaleDateString("en-GB") : "—"}
              </div>
              {data.checklist.reason_code && (
                <div className="text-sm text-gray-600 mt-1">
                  Reason: <strong>{REASON_LABELS[data.checklist.reason_code] || data.checklist.reason_code}</strong>
                </div>
              )}
              {data.checklist.additional_detail && (
                <div className="text-xs text-gray-500 mt-1">{data.checklist.additional_detail}</div>
              )}
            </div>
            <div className="flex flex-col items-end gap-2">
              <div className="text-sm font-medium">{data.completed}/{data.total} tasks</div>
              <div className="w-40 h-2 bg-gray-200 rounded-full">
                <div className="h-2 rounded-full bg-blue-500" style={{ width: `${data.percent}%` }} />
              </div>
              {alreadyDeactivated ? (
                <Badge className="bg-gray-200 text-gray-700">Deactivated</Badge>
              ) : canDeactivate ? (
                <Button size="sm" className="bg-red-600 hover:bg-red-700 text-white" onClick={() => deactivate.mutate({})}>
                  {deactivate.isPending && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
                  Complete & Deactivate
                </Button>
              ) : (
                <Button size="sm" variant="outline" className="border-amber-300 text-amber-700" onClick={() => setOverrideOpen(true)}>
                  <ShieldAlert className="h-3 w-3 mr-1" /> Override Deactivation
                </Button>
              )}
            </div>
          </div>
          {!canDeactivate && !alreadyDeactivated && (
            <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-md text-sm text-amber-900 flex gap-2">
              <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
              <div>
                <div className="font-medium">Deactivation blocked</div>
                <div className="text-xs mt-1">
                  {criticalOutstanding.length > 0 && (
                    <div>Critical items pending: {criticalOutstanding.map((i: any) => i.label).join(", ")}</div>
                  )}
                  {equipmentUnreturned.length > 0 && (
                    <div>Equipment not returned: {equipmentUnreturned.map((e: any) => e.name).join(", ")}</div>
                  )}
                </div>
              </div>
            </div>
          )}
          {data.checklist.deactivation_override_reason && (
            <div className="mt-3 p-3 bg-orange-50 border border-orange-200 rounded-md text-sm">
              <div className="font-medium text-orange-900">Override used by {data.checklist.deactivation_override_by}</div>
              <div className="text-orange-800 text-xs mt-1">{data.checklist.deactivation_override_reason}</div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Checklist sections */}
      {CATEGORIES.map(cat => {
        const Icon = cat.icon;
        const items = itemsByCat[cat.key] || [];
        const done = items.filter(i => i.completed).length;
        return (
          <Card key={cat.key}>
            <Collapsible open={openCat[cat.key]} onOpenChange={v => setOpenCat(s => ({ ...s, [cat.key]: v }))}>
              <CollapsibleTrigger className="w-full">
                <CardHeader className="py-3 cursor-pointer hover:bg-gray-50 transition">
                  <CardTitle className="flex items-center justify-between text-base">
                    <span className="flex items-center gap-2">
                      {openCat[cat.key] ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      <Icon className={`h-4 w-4 ${cat.color}`} />
                      {cat.label}
                    </span>
                    <span className="text-xs font-normal text-gray-500">{done}/{items.length}</span>
                  </CardTitle>
                </CardHeader>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <CardContent className="pt-0 pb-3 space-y-2">
                  {cat.key === "equipment" && (
                    <EquipmentSection
                      equipment={data.equipment || []}
                      onPatch={(id: string, body: any) => patchEquipment.mutate({ id, ...body })}
                      onDelete={(id: string) => deleteEquipment.mutate(id)}
                      onAdd={() => newEq.name && addEquipment.mutate(newEq)}
                      newEq={newEq}
                      setNewEq={setNewEq}
                    />
                  )}
                  {items.map(it => (
                    <div key={it.id} className="flex items-start gap-2 p-2 rounded hover:bg-gray-50 border border-transparent hover:border-gray-200">
                      <input
                        type="checkbox"
                        checked={!!it.completed}
                        disabled={it.is_auto}
                        onChange={e => toggleItem.mutate({ id: it.id, completed: e.target.checked, notes: it.notes })}
                        className="mt-1"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`text-sm ${it.completed ? "line-through text-gray-400" : ""}`}>{it.label}</span>
                          {it.is_critical && <Badge className="bg-red-100 text-red-700 text-xs">Critical</Badge>}
                          {it.is_auto && <Badge className="bg-gray-100 text-gray-600 text-xs">Auto</Badge>}
                        </div>
                        {it.completed && it.completed_by && (
                          <div className="text-xs text-gray-400 mt-0.5">
                            {it.completed_by} · {it.completed_at ? new Date(it.completed_at).toLocaleString("en-GB") : ""}
                          </div>
                        )}
                      </div>
                      {!it.is_auto && (
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-gray-400 hover:text-red-600"
                          onClick={() => deleteItem.mutate(it.id)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  ))}
                  {addItem?.category === cat.key ? (
                    <div className="flex items-center gap-2 p-2 border rounded bg-blue-50">
                      <Input
                        placeholder="New item label"
                        value={addItem.label}
                        onChange={e => setAddItem({ ...addItem, label: e.target.value })}
                        className="h-8 text-sm"
                      />
                      <label className="text-xs flex items-center gap-1 whitespace-nowrap">
                        <input type="checkbox" checked={addItem.isCritical}
                          onChange={e => setAddItem({ ...addItem, isCritical: e.target.checked })} />
                        Critical
                      </label>
                      <Button size="sm" disabled={!addItem.label}
                        onClick={() => addCustomItem.mutate({ category: addItem.category, label: addItem.label, isCritical: addItem.isCritical })}>
                        Add
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setAddItem(null)}>Cancel</Button>
                    </div>
                  ) : (
                    <Button variant="ghost" size="sm" className="text-xs text-blue-600 h-7"
                      onClick={() => setAddItem({ category: cat.key, label: "", isCritical: false })}>
                      <Plus className="h-3 w-3 mr-1" /> Add item
                    </Button>
                  )}
                </CardContent>
              </CollapsibleContent>
            </Collapsible>
          </Card>
        );
      })}

      {/* Exit Interview */}
      <Card>
        <CardHeader className="py-3">
          <CardTitle className="text-base flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-green-600" /> Exit Interview
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label>Reason for leaving (in their own words)</Label>
            <Textarea rows={2} value={interview.reason_for_leaving || ""}
              onChange={e => { setInterview({ ...interview, reason_for_leaving: e.target.value }); setInterviewDirty(true); }} />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <Label>What worked well</Label>
              <Textarea rows={2} value={interview.what_worked_well || ""}
                onChange={e => { setInterview({ ...interview, what_worked_well: e.target.value }); setInterviewDirty(true); }} />
            </div>
            <div>
              <Label>What could be improved</Label>
              <Textarea rows={2} value={interview.what_could_improve || ""}
                onChange={e => { setInterview({ ...interview, what_could_improve: e.target.value }); setInterviewDirty(true); }} />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <Label>Would they recommend us as an employer?</Label>
              <Select value={interview.would_recommend || ""}
                onValueChange={v => { setInterview({ ...interview, would_recommend: v }); setInterviewDirty(true); }}>
                <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="yes">Yes</SelectItem>
                  <SelectItem value="no">No</SelectItem>
                  <SelectItem value="maybe">Maybe</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Would we re-hire?</Label>
              <Select value={interview.would_rehire || ""}
                onValueChange={v => { setInterview({ ...interview, would_rehire: v }); setInterviewDirty(true); }}>
                <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="yes">Yes</SelectItem>
                  <SelectItem value="no">No</SelectItem>
                  <SelectItem value="maybe">Maybe</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label>Additional comments</Label>
            <Textarea rows={3} value={interview.additional_comments || ""}
              onChange={e => { setInterview({ ...interview, additional_comments: e.target.value }); setInterviewDirty(true); }} />
          </div>
          <div className="flex justify-between items-center pt-1">
            <div className="text-xs text-gray-500">
              {data.interview?.conducted_by && (
                <>Last saved by {data.interview.conducted_by} · {new Date(data.interview.conducted_at).toLocaleString("en-GB")}</>
              )}
            </div>
            <Button
              size="sm"
              disabled={saveInterview.isPending || !interviewDirty}
              onClick={() => saveInterview.mutate({
                reasonForLeaving: interview.reason_for_leaving,
                whatWorkedWell: interview.what_worked_well,
                whatCouldImprove: interview.what_could_improve,
                wouldRecommend: interview.would_recommend,
                wouldRehire: interview.would_rehire,
                additionalComments: interview.additional_comments,
              })}
            >
              {saveInterview.isPending && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
              Save Exit Interview
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Override dialog */}
      <Dialog open={overrideOpen} onOpenChange={setOverrideOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-700">
              <ShieldAlert className="h-5 w-5" /> Override Deactivation
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-gray-600">
              Critical items remain incomplete. Provide a written reason for proceeding — this will be logged in the audit trail.
            </p>
            {criticalOutstanding.length > 0 && (
              <div className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded p-2">
                Pending: {criticalOutstanding.map((i: any) => i.label).join(", ")}
              </div>
            )}
            {equipmentUnreturned.length > 0 && (
              <div className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded p-2">
                Unreturned equipment: {equipmentUnreturned.map((e: any) => e.name).join(", ")}
              </div>
            )}
            <div>
              <Label>Override reason *</Label>
              <Textarea rows={3} value={overrideReason} onChange={e => setOverrideReason(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOverrideOpen(false)}>Cancel</Button>
            <Button
              className="bg-amber-600 hover:bg-amber-700 text-white"
              disabled={!overrideReason.trim() || deactivate.isPending}
              onClick={() => deactivate.mutate({ overrideReason })}
            >
              {deactivate.isPending && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
              Override & Deactivate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function EquipmentSection({ equipment, onPatch, onDelete, onAdd, newEq, setNewEq }: any) {
  return (
    <div className="space-y-2">
      {equipment.length === 0 && (
        <div className="text-xs text-gray-400 italic">No equipment items. Add below if needed.</div>
      )}
      {equipment.map((eq: any) => (
        <div key={eq.id} className="grid grid-cols-12 gap-2 items-center p-2 rounded border border-gray-100 bg-gray-50">
          <input
            type="checkbox" checked={!!eq.returned} className="col-span-1"
            onChange={e => onPatch(eq.id, { returned: e.target.checked })}
          />
          <Input
            className="col-span-3 h-8 text-sm" defaultValue={eq.name}
            onBlur={e => e.target.value !== eq.name && e.target.value.trim() && onPatch(eq.id, { name: e.target.value })}
          />
          <Input
            placeholder="Asset tag" className="col-span-2 h-8 text-sm" defaultValue={eq.asset_tag || ""}
            onBlur={e => e.target.value !== (eq.asset_tag || "") && onPatch(eq.id, { assetTag: e.target.value })}
          />
          <Input
            placeholder="Serial" className="col-span-2 h-8 text-sm" defaultValue={eq.serial_number || ""}
            onBlur={e => e.target.value !== (eq.serial_number || "") && onPatch(eq.id, { serialNumber: e.target.value })}
          />
          <Input
            type="date" className="col-span-3 h-8 text-sm" disabled={!eq.returned}
            value={eq.returned_on ? String(eq.returned_on).slice(0, 10) : ""}
            onChange={e => onPatch(eq.id, { returnedOn: e.target.value || null })}
          />
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0 col-span-1 text-gray-400 hover:text-red-600"
            onClick={() => onDelete(eq.id)}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      ))}
      <div className="grid grid-cols-12 gap-2 items-center p-2 rounded border border-dashed border-blue-200 bg-blue-50/30">
        <div className="col-span-1" />
        <Input placeholder="Item name" className="col-span-3 h-8 text-sm"
          value={newEq.name} onChange={e => setNewEq({ ...newEq, name: e.target.value })} />
        <Input placeholder="Asset tag" className="col-span-2 h-8 text-sm"
          value={newEq.assetTag} onChange={e => setNewEq({ ...newEq, assetTag: e.target.value })} />
        <Input placeholder="Serial" className="col-span-2 h-8 text-sm"
          value={newEq.serialNumber} onChange={e => setNewEq({ ...newEq, serialNumber: e.target.value })} />
        <div className="col-span-3" />
        <Button size="sm" className="col-span-1 h-7" disabled={!newEq.name} onClick={onAdd}>
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
