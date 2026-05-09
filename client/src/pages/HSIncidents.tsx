import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import GlassCard from "@/components/GlassCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { AlertTriangle, Plus, Trash2, ExternalLink, CheckCircle, Clock, AlertCircle, BarChart3, Edit } from "lucide-react";

interface HsIncident {
  id: string;
  title: string;
  description: string | null;
  incidentDate: string;
  location: string | null;
  reportedBy: string | null;
  injuredPerson: string | null;
  injuredPersonType: string | null;
  isNearMiss: boolean;
  nearMissPotential: string | null;
  nearMissHazardType: string | null;
  riddorCategory: string | null;
  riddorReportingDeadline: string | null;
  riddorReportedAt: string | null;
  riddorReference: string | null;
  riddorReminderSentAt: string | null;
  createdAt: string;
}

const RIDDOR_CATEGORIES = [
  { value: "fatality", label: "Fatality — Report IMMEDIATELY" },
  { value: "specified_injury", label: "Specified Injury (fracture, amputation, hospitalisation 24h+, loss of consciousness) — 10 days" },
  { value: "over_7_day", label: "Over-7-Day Incapacitation — 15 days" },
  { value: "dangerous_occurrence", label: "Dangerous Occurrence (near fatality, structural collapse, explosion) — 10 days" },
  { value: "occupational_disease", label: "Occupational Disease (when diagnosis confirmed)" },
  { value: "not_riddor_reportable", label: "Confirmed NOT RIDDOR reportable" },
];

const RIDDOR_LABELS: Record<string, string> = {
  fatality: "Fatality",
  specified_injury: "Specified Injury",
  over_7_day: "Over-7-Day Incapacitation",
  dangerous_occurrence: "Dangerous Occurrence",
  occupational_disease: "Occupational Disease",
  not_riddor_reportable: "Not RIDDOR Reportable",
};

const HAZARD_TYPES = [
  { value: "slip_trip_fall", label: "Slip, trip or fall" },
  { value: "struck_by_object", label: "Struck by object" },
  { value: "manual_handling", label: "Manual handling" },
  { value: "vehicle_plant", label: "Vehicle or plant" },
  { value: "working_at_height", label: "Working at height" },
  { value: "electrical", label: "Electrical" },
  { value: "fire_explosion", label: "Fire or explosion" },
  { value: "chemical_substance", label: "Chemical or substance" },
  { value: "machinery", label: "Machinery" },
  { value: "other", label: "Other" },
];

const NEAR_MISS_POTENTIALS = [
  { value: "minor", label: "Minor — First aid level injury" },
  { value: "serious", label: "Serious — Hospital treatment required" },
  { value: "critical", label: "Critical — Life-threatening or fatality" },
];

function getDaysUntil(deadline: string): number {
  const diff = new Date(deadline).getTime() - Date.now();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

function RiddorBadge({ incident }: { incident: HsIncident }) {
  if (!incident.riddorCategory || incident.riddorCategory === "not_riddor_reportable") return null;
  if (incident.riddorReportedAt) {
    return <Badge className="bg-green-100 text-green-800 border-green-300">✅ Reported to HSE</Badge>;
  }
  if (!incident.riddorReportingDeadline) return null;
  const days = getDaysUntil(incident.riddorReportingDeadline);
  if (days <= 0) return <Badge className="bg-red-100 text-red-800 border-red-300">🔴 RIDDOR OVERDUE</Badge>;
  if (days <= 2) return <Badge className="bg-red-100 text-red-800 border-red-300">🔴 {days}d remaining</Badge>;
  if (days <= 5) return <Badge className="bg-amber-100 text-amber-800 border-amber-300">🟡 {days}d remaining</Badge>;
  return <Badge className="bg-blue-100 text-blue-800 border-blue-300">RIDDOR deadline: {days}d</Badge>;
}

const emptyForm = {
  title: "",
  description: "",
  incidentDate: new Date().toISOString().slice(0, 16),
  location: "",
  reportedBy: "",
  injuredPerson: "",
  injuredPersonType: "",
  isNearMiss: false,
  nearMissPotential: "",
  nearMissHazardType: "",
  riddorCategory: "",
};

export default function HSIncidents() {
  const { toast } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [reportingId, setReportingId] = useState<string | null>(null);
  const [hseReference, setHseReference] = useState("");
  const [filterType, setFilterType] = useState<"all" | "riddor" | "near_miss">("all");
  const [form, setForm] = useState({ ...emptyForm });

  const { data: incidents = [], isLoading } = useQuery<HsIncident[]>({ queryKey: ["/api/hs-incidents"] });

  const createMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/hs-incidents", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/hs-incidents"] });
      setShowForm(false);
      setForm({ ...emptyForm });
      toast({ title: "Incident recorded successfully" });
    },
    onError: () => toast({ title: "Failed to save incident", variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => apiRequest("PUT", `/api/hs-incidents/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/hs-incidents"] });
      setShowForm(false);
      setEditingId(null);
      setForm({ ...emptyForm });
      toast({ title: "Incident updated" });
    },
    onError: () => toast({ title: "Failed to update incident", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/hs-incidents/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/hs-incidents"] });
      setDeleteId(null);
      toast({ title: "Incident deleted" });
    },
    onError: () => toast({ title: "Failed to delete", variant: "destructive" }),
  });

  const reportedMutation = useMutation({
    mutationFn: ({ id, reference }: { id: string; reference: string }) =>
      apiRequest("PATCH", `/api/hs-incidents/${id}/riddor-reported`, { reference }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/hs-incidents"] });
      setReportingId(null);
      setHseReference("");
      toast({ title: "Marked as reported to HSE" });
    },
    onError: () => toast({ title: "Failed to update", variant: "destructive" }),
  });

  function handleEdit(incident: HsIncident) {
    setForm({
      title: incident.title,
      description: incident.description || "",
      incidentDate: incident.incidentDate ? new Date(incident.incidentDate).toISOString().slice(0, 16) : "",
      location: incident.location || "",
      reportedBy: incident.reportedBy || "",
      injuredPerson: incident.injuredPerson || "",
      injuredPersonType: incident.injuredPersonType || "",
      isNearMiss: incident.isNearMiss,
      nearMissPotential: incident.nearMissPotential || "",
      nearMissHazardType: incident.nearMissHazardType || "",
      riddorCategory: incident.riddorCategory || "",
    });
    setEditingId(incident.id);
    setShowForm(true);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const payload = {
      ...form,
      incidentDate: form.incidentDate,
      riddorCategory: form.isNearMiss ? "not_riddor_reportable" : form.riddorCategory || null,
      nearMissPotential: form.isNearMiss ? form.nearMissPotential : null,
      nearMissHazardType: form.isNearMiss ? form.nearMissHazardType : null,
    };
    if (editingId) {
      updateMutation.mutate({ id: editingId, data: payload });
    } else {
      createMutation.mutate(payload);
    }
  }

  const filtered = incidents.filter(i => {
    if (filterType === "riddor") return !i.isNearMiss && i.riddorCategory && i.riddorCategory !== "not_riddor_reportable";
    if (filterType === "near_miss") return i.isNearMiss;
    return true;
  });

  // Near miss analytics (last 90 days)
  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  const recentNearMisses = incidents.filter(i => i.isNearMiss && new Date(i.incidentDate) > ninetyDaysAgo);
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const thisMonth = recentNearMisses.filter(i => new Date(i.incidentDate) > thirtyDaysAgo).length;
  const lastMonth = recentNearMisses.filter(i => {
    const d = new Date(i.incidentDate);
    return d <= thirtyDaysAgo && d > new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
  }).length;

  const hazardCounts: Record<string, number> = {};
  recentNearMisses.forEach(i => {
    if (i.nearMissHazardType) hazardCounts[i.nearMissHazardType] = (hazardCounts[i.nearMissHazardType] || 0) + 1;
  });

  const severityCounts = {
    minor: recentNearMisses.filter(i => i.nearMissPotential === "minor").length,
    serious: recentNearMisses.filter(i => i.nearMissPotential === "serious").length,
    critical: recentNearMisses.filter(i => i.nearMissPotential === "critical").length,
  };

  const pendingRiddor = incidents.filter(i =>
    !i.isNearMiss &&
    i.riddorCategory &&
    i.riddorCategory !== "not_riddor_reportable" &&
    i.riddorCategory !== "occupational_disease" &&
    !i.riddorReportedAt &&
    i.riddorReportingDeadline
  );

  return (
    <div className="p-4 sm:p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <AlertTriangle className="text-amber-500" size={26} />
            H&S Incident Reports
          </h1>
          <p className="text-sm text-muted-foreground mt-1">RIDDOR 2013 &amp; Near Miss reporting — Management of Health &amp; Safety at Work Regulations 1999</p>
        </div>
        <Button onClick={() => { setShowForm(true); setEditingId(null); setForm({ ...emptyForm }); }}>
          <Plus size={16} className="mr-1" /> Record Incident
        </Button>
      </div>

      {/* RIDDOR pending alerts */}
      {pendingRiddor.length > 0 && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950 p-4 space-y-2">
          <p className="font-semibold text-amber-800 dark:text-amber-200 flex items-center gap-2">
            <AlertCircle size={16} /> {pendingRiddor.length} incident{pendingRiddor.length > 1 ? "s" : ""} pending HSE notification
          </p>
          {pendingRiddor.map(i => {
            const days = getDaysUntil(i.riddorReportingDeadline!);
            return (
              <div key={i.id} className="flex items-center justify-between text-sm">
                <span className="font-medium">{i.title}</span>
                <span className={days <= 2 ? "text-red-700 font-bold" : "text-amber-700"}>
                  {days <= 0 ? "OVERDUE" : `${days} day${days !== 1 ? "s" : ""} remaining`}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* Near miss summary widget */}
      {recentNearMisses.length > 0 && (
        <GlassCard className="p-4">
          <h2 className="font-semibold flex items-center gap-2 mb-3">
            <BarChart3 size={16} className="text-blue-500" /> Near Miss Summary (last 90 days)
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
            <div className="rounded-lg bg-blue-50 dark:bg-blue-950 p-3">
              <div className="text-2xl font-bold text-blue-700">{recentNearMisses.length}</div>
              <div className="text-xs text-muted-foreground">Total near misses</div>
            </div>
            <div className="rounded-lg bg-green-50 dark:bg-green-950 p-3">
              <div className="text-2xl font-bold text-green-700">{thisMonth}</div>
              <div className="text-xs text-muted-foreground">This month</div>
            </div>
            <div className="rounded-lg bg-amber-50 dark:bg-amber-950 p-3">
              <div className="text-2xl font-bold text-amber-700">{lastMonth}</div>
              <div className="text-xs text-muted-foreground">Last month</div>
            </div>
            <div className="rounded-lg bg-red-50 dark:bg-red-950 p-3">
              <div className="text-2xl font-bold text-red-700">{severityCounts.critical}</div>
              <div className="text-xs text-muted-foreground">Critical potential</div>
            </div>
          </div>
          {Object.keys(hazardCounts).length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {Object.entries(hazardCounts).sort((a, b) => b[1] - a[1]).map(([type, count]) => (
                <Badge key={type} variant="outline" className="text-xs">
                  {HAZARD_TYPES.find(h => h.value === type)?.label || type}: {count}
                </Badge>
              ))}
            </div>
          )}
        </GlassCard>
      )}

      {/* Filter tabs */}
      <div className="flex gap-2">
        {(["all", "riddor", "near_miss"] as const).map(f => (
          <Button key={f} size="sm" variant={filterType === f ? "default" : "outline"} onClick={() => setFilterType(f)}>
            {f === "all" ? "All" : f === "riddor" ? "RIDDOR Only" : "Near Misses"}
          </Button>
        ))}
      </div>

      {/* Incident list */}
      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">Loading incidents…</div>
      ) : filtered.length === 0 ? (
        <GlassCard className="text-center py-12 text-muted-foreground">
          <AlertTriangle size={40} className="mx-auto mb-3 opacity-30" />
          <p>No incidents recorded yet.</p>
        </GlassCard>
      ) : (
        <div className="space-y-3">
          {filtered.map(incident => {
            const days = incident.riddorReportingDeadline ? getDaysUntil(incident.riddorReportingDeadline) : null;
            const borderColor = incident.riddorReportedAt ? "border-green-300"
              : days !== null && days <= 0 ? "border-red-400"
              : days !== null && days <= 2 ? "border-red-300"
              : days !== null && days <= 5 ? "border-amber-300"
              : "";

            return (
              <GlassCard key={incident.id} className={`p-4 border-l-4 ${borderColor || "border-transparent"}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <span className="font-semibold">{incident.title}</span>
                      {incident.isNearMiss && (
                        <Badge className="bg-blue-100 text-blue-800 border-blue-300 text-xs">Near Miss</Badge>
                      )}
                      {incident.nearMissPotential === "critical" && (
                        <Badge className="bg-red-100 text-red-800 border-red-300 text-xs">Critical potential</Badge>
                      )}
                      {incident.nearMissPotential === "serious" && (
                        <Badge className="bg-amber-100 text-amber-800 border-amber-300 text-xs">Serious potential</Badge>
                      )}
                      <RiddorBadge incident={incident} />
                    </div>
                    <div className="text-sm text-muted-foreground space-y-0.5">
                      <div>{new Date(incident.incidentDate).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}{incident.location ? ` · ${incident.location}` : ""}</div>
                      {incident.reportedBy && <div>Reported by: {incident.reportedBy}</div>}
                      {incident.injuredPerson && <div>Injured person: {incident.injuredPerson}{incident.injuredPersonType ? ` (${incident.injuredPersonType})` : ""}</div>}
                      {incident.description && <div className="mt-1 text-xs">{incident.description}</div>}
                      {incident.riddorCategory && !incident.isNearMiss && (
                        <div className="mt-1">RIDDOR: {RIDDOR_LABELS[incident.riddorCategory] || incident.riddorCategory}
                          {incident.riddorReportingDeadline && !incident.riddorReportedAt && (
                            <span className={`ml-2 font-medium ${days !== null && days <= 2 ? "text-red-600" : "text-amber-600"}`}>
                              — deadline {new Date(incident.riddorReportingDeadline).toLocaleDateString("en-GB")}
                            </span>
                          )}
                        </div>
                      )}
                      {incident.riddorReportedAt && incident.riddorReference && (
                        <div className="text-green-700 text-xs">HSE Ref: {incident.riddorReference}</div>
                      )}
                      {incident.nearMissHazardType && (
                        <div className="text-xs">Hazard: {HAZARD_TYPES.find(h => h.value === incident.nearMissHazardType)?.label || incident.nearMissHazardType}</div>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    {!incident.isNearMiss && incident.riddorCategory && incident.riddorCategory !== "not_riddor_reportable" && !incident.riddorReportedAt && (
                      <Button size="sm" variant="outline" className="text-xs" onClick={() => { setReportingId(incident.id); setHseReference(""); }}>
                        <CheckCircle size={12} className="mr-1" /> Mark Reported
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" onClick={() => handleEdit(incident)}>
                      <Edit size={14} />
                    </Button>
                    <Button size="sm" variant="ghost" className="text-red-500 hover:text-red-700" onClick={() => setDeleteId(incident.id)}>
                      <Trash2 size={14} />
                    </Button>
                  </div>
                </div>
              </GlassCard>
            );
          })}
        </div>
      )}

      {/* Create/Edit form dialog */}
      <Dialog open={showForm} onOpenChange={open => { if (!open) { setShowForm(false); setEditingId(null); } }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit Incident" : "Record Incident"}</DialogTitle>
            <DialogDescription>Record a workplace incident, near miss, or RIDDOR-reportable event.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="sm:col-span-2">
                <Label>Incident title *</Label>
                <Input required value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="Brief description of what happened" />
              </div>
              <div>
                <Label>Date &amp; time *</Label>
                <Input required type="datetime-local" value={form.incidentDate} onChange={e => setForm(f => ({ ...f, incidentDate: e.target.value }))} />
              </div>
              <div>
                <Label>Location</Label>
                <Input value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))} placeholder="Where it happened" />
              </div>
              <div>
                <Label>Reported by</Label>
                <Input value={form.reportedBy} onChange={e => setForm(f => ({ ...f, reportedBy: e.target.value }))} />
              </div>
              <div>
                <Label>Injured person</Label>
                <Input value={form.injuredPerson} onChange={e => setForm(f => ({ ...f, injuredPerson: e.target.value }))} placeholder="Name (if applicable)" />
              </div>
              <div>
                <Label>Person type</Label>
                <Select value={form.injuredPersonType} onValueChange={v => setForm(f => ({ ...f, injuredPersonType: v }))}>
                  <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="employee">Employee</SelectItem>
                    <SelectItem value="contractor">Contractor</SelectItem>
                    <SelectItem value="visitor">Visitor</SelectItem>
                    <SelectItem value="member_of_public">Member of public</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="sm:col-span-2">
                <Label>Description</Label>
                <Textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={3} placeholder="Full details of what happened…" />
              </div>
            </div>

            {/* Near miss section */}
            <div className="rounded-lg border p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Checkbox id="nearMiss" checked={form.isNearMiss} onCheckedChange={v => setForm(f => ({ ...f, isNearMiss: !!v, riddorCategory: v ? "not_riddor_reportable" : "" }))} />
                <Label htmlFor="nearMiss" className="font-medium cursor-pointer">This is a near miss — no injury occurred, but one could have</Label>
              </div>
              {form.isNearMiss && (
                <div className="space-y-3 pl-6">
                  <div>
                    <Label>Potential severity if injury had occurred</Label>
                    <Select value={form.nearMissPotential} onValueChange={v => setForm(f => ({ ...f, nearMissPotential: v }))}>
                      <SelectTrigger><SelectValue placeholder="Select severity…" /></SelectTrigger>
                      <SelectContent>
                        {NEAR_MISS_POTENTIALS.map(p => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Hazard type</Label>
                    <Select value={form.nearMissHazardType} onValueChange={v => setForm(f => ({ ...f, nearMissHazardType: v }))}>
                      <SelectTrigger><SelectValue placeholder="Select hazard type…" /></SelectTrigger>
                      <SelectContent>
                        {HAZARD_TYPES.map(h => <SelectItem key={h.value} value={h.value}>{h.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <p className="text-xs text-muted-foreground bg-blue-50 dark:bg-blue-950 rounded p-2">
                    Near misses are not reportable to the HSE under RIDDOR, but they must be investigated and used to update your risk assessments under the Management of Health &amp; Safety at Work Regulations 1999.
                  </p>
                </div>
              )}
            </div>

            {/* RIDDOR section */}
            {!form.isNearMiss && (
              <div className="rounded-lg border p-4 space-y-3">
                <div>
                  <h3 className="font-semibold">RIDDOR Assessment</h3>
                  <p className="text-xs text-muted-foreground mt-1">Under RIDDOR 2013, certain workplace incidents must be reported to the HSE. Failure to report is a criminal offence.</p>
                </div>
                <div>
                  <Label>RIDDOR category</Label>
                  <Select value={form.riddorCategory} onValueChange={v => setForm(f => ({ ...f, riddorCategory: v }))}>
                    <SelectTrigger><SelectValue placeholder="— Not yet assessed —" /></SelectTrigger>
                    <SelectContent>
                      {RIDDOR_CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                {form.riddorCategory === "fatality" && (
                  <div className="rounded bg-red-50 dark:bg-red-950 border border-red-300 p-3 text-sm text-red-800 dark:text-red-200">
                    ⚠ Fatalities must be reported to the HSE <strong>immediately</strong>. An email alert will be sent when this incident is saved.
                  </div>
                )}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => { setShowForm(false); setEditingId(null); }}>Cancel</Button>
              <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
                {editingId ? "Save Changes" : "Record Incident"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Mark as reported to HSE dialog */}
      <Dialog open={!!reportingId} onOpenChange={open => { if (!open) setReportingId(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mark as Reported to HSE</DialogTitle>
            <DialogDescription>Enter the HSE reference number you received after reporting this incident.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>HSE Reference Number</Label>
              <Input value={hseReference} onChange={e => setHseReference(e.target.value)} placeholder="e.g. 2024/12345" />
            </div>
            <p className="text-sm text-muted-foreground">
              Don't have a reference number yet? You can report at:{" "}
              <a href="https://www.hse.gov.uk/riddor/report.htm" target="_blank" rel="noopener" className="text-blue-600 underline">
                hse.gov.uk/riddor/report.htm <ExternalLink size={12} className="inline" />
              </a>
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setReportingId(null)}>Cancel</Button>
              <Button onClick={() => reportedMutation.mutate({ id: reportingId!, reference: hseReference })} disabled={reportedMutation.isPending}>
                <CheckCircle size={14} className="mr-1" /> Confirm Reported
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={open => { if (!open) setDeleteId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete incident?</AlertDialogTitle>
            <AlertDialogDescription>This will permanently remove this incident record.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-red-600 hover:bg-red-700" onClick={() => deleteMutation.mutate(deleteId!)}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
