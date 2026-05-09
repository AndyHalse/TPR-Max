import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import GlassCard from "@/components/GlassCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { Flame, Plus, CheckCircle, AlertTriangle, AlertCircle, Download, FileText, ExternalLink, Trash2, Edit, Clock } from "lucide-react";
import { EXTERNAL_LINKS } from "@/lib/externalLinks";

interface FireRiskAssessment {
  id: string;
  title: string;
  assessorName: string;
  assessorCompany: string | null;
  assessmentDate: string;
  nextReviewDate: string;
  documentUrl: string | null;
  status: string;
  findingsSummary: string | null;
  reminderSentAt: string | null;
  createdAt: string;
}

interface FraStatus {
  hasCurrentFRA: boolean;
  daysSinceLastAssessment: number | null;
  daysUntilReview: number | null;
  isOverdue: boolean;
  currentFRA: FireRiskAssessment | null;
}

function getDefaultNextReview(): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() + 1);
  return d.toISOString().slice(0, 10);
}

const emptyForm = {
  title: "Fire Risk Assessment",
  assessorName: "",
  assessorCompany: "",
  assessmentDate: new Date().toISOString().slice(0, 10),
  nextReviewDate: getDefaultNextReview(),
  findingsSummary: "",
  documentUrl: "",
};

export default function FireRiskAssessmentPage() {
  const { toast } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...emptyForm });

  const { data: fras = [], isLoading } = useQuery<FireRiskAssessment[]>({
    queryKey: ["/api/fire-risk-assessments"],
  });

  const { data: fraStatus } = useQuery<FraStatus>({
    queryKey: ["/api/fire-risk-assessments/status"],
  });

  const createMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/fire-risk-assessments", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/fire-risk-assessments"] });
      setShowForm(false);
      setForm({ ...emptyForm });
      toast({ title: "Fire Risk Assessment recorded" });
    },
    onError: () => toast({ title: "Failed to save", variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => apiRequest("PUT", `/api/fire-risk-assessments/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/fire-risk-assessments"] });
      setShowForm(false);
      setEditingId(null);
      setForm({ ...emptyForm });
      toast({ title: "Fire Risk Assessment updated" });
    },
    onError: () => toast({ title: "Failed to update", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/fire-risk-assessments/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/fire-risk-assessments"] });
      setDeleteId(null);
      toast({ title: "Record deleted" });
    },
    onError: () => toast({ title: "Failed to delete", variant: "destructive" }),
  });

  function handleEdit(fra: FireRiskAssessment) {
    setForm({
      title: fra.title,
      assessorName: fra.assessorName,
      assessorCompany: fra.assessorCompany || "",
      assessmentDate: fra.assessmentDate,
      nextReviewDate: fra.nextReviewDate,
      findingsSummary: fra.findingsSummary || "",
      documentUrl: fra.documentUrl || "",
    });
    setEditingId(fra.id);
    setShowForm(true);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const payload = {
      ...form,
      assessorCompany: form.assessorCompany || null,
      findingsSummary: form.findingsSummary || null,
      documentUrl: form.documentUrl || null,
    };
    if (editingId) {
      updateMutation.mutate({ id: editingId, data: payload });
    } else {
      createMutation.mutate(payload);
    }
  }

  const statusBanner = () => {
    if (!fraStatus) return null;
    if (!fraStatus.hasCurrentFRA) {
      return (
        <div className="rounded-lg border border-red-400 bg-red-50 dark:bg-red-950 p-4 flex items-center gap-3">
          <AlertCircle className="text-red-600 shrink-0" size={22} />
          <div>
            <p className="font-semibold text-red-800 dark:text-red-200">🚨 No Fire Risk Assessment on record</p>
            <p className="text-sm text-red-700 dark:text-red-300 mt-0.5">Under the Regulatory Reform (Fire Safety) Order 2005, every non-domestic premises must have a documented FRA. This is a criminal offence if not in place.</p>
          </div>
        </div>
      );
    }
    if (fraStatus.isOverdue) {
      return (
        <div className="rounded-lg border border-red-400 bg-red-50 dark:bg-red-950 p-4 flex items-center gap-3">
          <AlertCircle className="text-red-600 shrink-0" size={22} />
          <div>
            <p className="font-semibold text-red-800 dark:text-red-200">🚨 Fire Risk Assessment OVERDUE</p>
            <p className="text-sm text-red-700 dark:text-red-300 mt-0.5">
              Last review: {fraStatus.currentFRA ? new Date(fraStatus.currentFRA.assessmentDate).toLocaleDateString("en-GB") : "—"} · 
              Overdue by {Math.abs(fraStatus.daysUntilReview!)} day{Math.abs(fraStatus.daysUntilReview!) !== 1 ? "s" : ""}
            </p>
          </div>
        </div>
      );
    }
    if (fraStatus.daysUntilReview !== null && fraStatus.daysUntilReview <= 30) {
      return (
        <div className="rounded-lg border border-amber-400 bg-amber-50 dark:bg-amber-950 p-4 flex items-center gap-3">
          <AlertTriangle className="text-amber-600 shrink-0" size={22} />
          <div>
            <p className="font-semibold text-amber-800 dark:text-amber-200">⚠ Review due within 30 days</p>
            <p className="text-sm text-amber-700 dark:text-amber-300 mt-0.5">
              Next review due: {fraStatus.currentFRA ? new Date(fraStatus.currentFRA.nextReviewDate).toLocaleDateString("en-GB") : "—"} · {fraStatus.daysUntilReview} day{fraStatus.daysUntilReview !== 1 ? "s" : ""} remaining
            </p>
          </div>
        </div>
      );
    }
    return (
      <div className="rounded-lg border border-green-400 bg-green-50 dark:bg-green-950 p-4 flex items-center gap-3">
        <CheckCircle className="text-green-600 shrink-0" size={22} />
        <div>
          <p className="font-semibold text-green-800 dark:text-green-200">✅ Fire Risk Assessment current</p>
          <p className="text-sm text-green-700 dark:text-green-300 mt-0.5">
            Next review: {fraStatus.currentFRA ? new Date(fraStatus.currentFRA.nextReviewDate).toLocaleDateString("en-GB") : "—"} · {fraStatus.daysUntilReview} day{fraStatus.daysUntilReview !== 1 ? "s" : ""} remaining
          </p>
        </div>
      </div>
    );
  };

  const currentFra = fras.find(f => f.status !== "superseded");
  const history = fras.filter(f => f.status === "superseded");

  const statusBadge = (status: string) => {
    if (status === "current") return <Badge className="bg-green-100 text-green-800 border-green-300">Current</Badge>;
    if (status === "review_due") return <Badge className="bg-amber-100 text-amber-800 border-amber-300">Review Due</Badge>;
    if (status === "overdue") return <Badge className="bg-red-100 text-red-800 border-red-300">Overdue</Badge>;
    if (status === "superseded") return <Badge variant="outline" className="text-muted-foreground">Superseded</Badge>;
    return <Badge variant="outline">{status}</Badge>;
  };

  return (
    <div className="p-4 sm:p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Flame className="text-orange-500" size={26} />
            Fire Risk Assessment
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Regulatory Reform (Fire Safety) Order 2005 compliance</p>
        </div>
        <Button onClick={() => { setShowForm(true); setEditingId(null); setForm({ ...emptyForm }); }}>
          <Plus size={16} className="mr-1" /> {currentFra ? "Record New Review" : "Record FRA"}
        </Button>
      </div>

      {/* Status banner */}
      {statusBanner()}

      {/* Current FRA card */}
      {currentFra && (
        <GlassCard className="p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                <FileText size={18} className="text-orange-500" />
                <h2 className="font-semibold text-lg">{currentFra.title}</h2>
                {statusBadge(currentFra.status)}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                <div><span className="text-muted-foreground">Assessor:</span> <span className="font-medium">{currentFra.assessorName}</span>{currentFra.assessorCompany ? ` · ${currentFra.assessorCompany}` : ""}</div>
                <div><span className="text-muted-foreground">Assessment date:</span> <span className="font-medium">{new Date(currentFra.assessmentDate).toLocaleDateString("en-GB")}</span></div>
                <div><span className="text-muted-foreground">Next review:</span> <span className="font-medium">{new Date(currentFra.nextReviewDate).toLocaleDateString("en-GB")}</span></div>
                {currentFra.documentUrl && (
                  <div>
                    <a href={currentFra.documentUrl} target="_blank" rel="noopener" className="inline-flex items-center gap-1 text-blue-600 hover:underline">
                      <Download size={14} /> Download FRA document
                    </a>
                  </div>
                )}
              </div>
              {currentFra.findingsSummary && (
                <div className="mt-3 text-sm bg-gray-50 dark:bg-gray-900 rounded p-3">
                  <p className="font-medium text-xs text-muted-foreground mb-1">KEY FINDINGS</p>
                  <p className="whitespace-pre-wrap">{currentFra.findingsSummary}</p>
                </div>
              )}
            </div>
            <div className="flex gap-1 shrink-0">
              <Button size="sm" variant="ghost" onClick={() => handleEdit(currentFra)}>
                <Edit size={14} />
              </Button>
              <Button size="sm" variant="ghost" className="text-red-500 hover:text-red-700" onClick={() => setDeleteId(currentFra.id)}>
                <Trash2 size={14} />
              </Button>
            </div>
          </div>
        </GlassCard>
      )}

      {/* What to do panel (shown when no FRA or overdue) */}
      {(!fraStatus?.hasCurrentFRA || fraStatus?.isOverdue) && (
        <GlassCard className="p-5 border border-amber-200 dark:border-amber-800">
          <h2 className="font-semibold mb-2 flex items-center gap-2"><AlertTriangle size={16} className="text-amber-500" /> What you need to do</h2>
          <div className="text-sm space-y-2 text-muted-foreground">
            <p>Every non-domestic premises must have a documented Fire Risk Assessment (FRA) carried out by a <strong>competent person</strong>. If you have 5 or more employees, it must be written down.</p>
            <p>The FRA must be reviewed <strong>regularly</strong> — at least annually, or after any significant changes to the premises, occupancy, or processes.</p>
            <div className="flex flex-wrap gap-2 mt-3">
              <a href={EXTERNAL_LINKS.fire.hseFireGuidance.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-blue-600 hover:underline text-sm">
                <ExternalLink size={12} /> {EXTERNAL_LINKS.fire.hseFireGuidance.label}
              </a>
              <a href={EXTERNAL_LINKS.fire.nfcc.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-blue-600 hover:underline text-sm">
                <ExternalLink size={12} /> {EXTERNAL_LINKS.fire.nfcc.label}
              </a>
            </div>
          </div>
        </GlassCard>
      )}

      {/* History table */}
      {history.length > 0 && (
        <GlassCard className="p-4">
          <h2 className="font-semibold mb-3 flex items-center gap-2"><Clock size={16} /> Previous Assessments</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left pb-2 pr-3 font-medium text-muted-foreground">Date</th>
                  <th className="text-left pb-2 pr-3 font-medium text-muted-foreground">Assessor</th>
                  <th className="text-left pb-2 pr-3 font-medium text-muted-foreground">Next review was</th>
                  <th className="text-left pb-2 font-medium text-muted-foreground">Status</th>
                  <th className="pb-2"></th>
                </tr>
              </thead>
              <tbody>
                {history.map(fra => (
                  <tr key={fra.id} className="border-b last:border-0">
                    <td className="py-2 pr-3">{new Date(fra.assessmentDate).toLocaleDateString("en-GB")}</td>
                    <td className="py-2 pr-3">{fra.assessorName}{fra.assessorCompany ? ` · ${fra.assessorCompany}` : ""}</td>
                    <td className="py-2 pr-3">{new Date(fra.nextReviewDate).toLocaleDateString("en-GB")}</td>
                    <td className="py-2 pr-3">{statusBadge(fra.status)}</td>
                    <td className="py-2">
                      <div className="flex gap-1">
                        {fra.documentUrl && (
                          <a href={fra.documentUrl} target="_blank" rel="noopener">
                            <Button size="sm" variant="ghost"><Download size={13} /></Button>
                          </a>
                        )}
                        <Button size="sm" variant="ghost" className="text-red-500 hover:text-red-700" onClick={() => setDeleteId(fra.id)}>
                          <Trash2 size={13} />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </GlassCard>
      )}

      {isLoading && <div className="text-center py-8 text-muted-foreground">Loading…</div>}

      {/* Form dialog */}
      <Dialog open={showForm} onOpenChange={open => { if (!open) { setShowForm(false); setEditingId(null); } }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit Fire Risk Assessment" : "Record Fire Risk Assessment"}</DialogTitle>
            <DialogDescription>
              {!editingId && currentFra && "Recording a new FRA will mark the previous one as superseded."}
              {!editingId && !currentFra && "Record the details of your Fire Risk Assessment."}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label>Title</Label>
              <Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label>Assessor name *</Label>
                <Input required value={form.assessorName} onChange={e => setForm(f => ({ ...f, assessorName: e.target.value }))} placeholder="Competent person's name" />
              </div>
              <div>
                <Label>Assessor company</Label>
                <Input value={form.assessorCompany} onChange={e => setForm(f => ({ ...f, assessorCompany: e.target.value }))} placeholder="External assessor (optional)" />
              </div>
              <div>
                <Label>Assessment date *</Label>
                <Input required type="date" value={form.assessmentDate} onChange={e => setForm(f => ({ ...f, assessmentDate: e.target.value }))} />
              </div>
              <div>
                <Label>Next review date *</Label>
                <Input required type="date" value={form.nextReviewDate} onChange={e => setForm(f => ({ ...f, nextReviewDate: e.target.value }))} />
              </div>
            </div>
            <div>
              <Label>Findings summary</Label>
              <Textarea value={form.findingsSummary} onChange={e => setForm(f => ({ ...f, findingsSummary: e.target.value }))} rows={4} placeholder="Key findings and action points from the assessment…" />
            </div>
            <div>
              <Label>Document URL</Label>
              <Input value={form.documentUrl} onChange={e => setForm(f => ({ ...f, documentUrl: e.target.value }))} placeholder="Link to uploaded FRA document (optional)" />
              <p className="text-xs text-muted-foreground mt-1">Paste a URL to the FRA document stored in your document management system or object storage.</p>
            </div>
            {!editingId && currentFra && (
              <div className="rounded bg-amber-50 dark:bg-amber-950 border border-amber-200 p-3 text-sm text-amber-800 dark:text-amber-200">
                The previous FRA ({new Date(currentFra.assessmentDate).toLocaleDateString("en-GB")}) will be marked as superseded.
              </div>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => { setShowForm(false); setEditingId(null); }}>Cancel</Button>
              <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
                {editingId ? "Save Changes" : "Record FRA"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={open => { if (!open) setDeleteId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this FRA record?</AlertDialogTitle>
            <AlertDialogDescription>This will permanently remove this fire risk assessment record.</AlertDialogDescription>
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
