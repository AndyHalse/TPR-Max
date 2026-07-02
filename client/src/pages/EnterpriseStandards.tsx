import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BookOpen, Plus, Pencil, Trash2, RotateCcw, AlertTriangle, Building2, CheckCircle, Info, Users } from "lucide-react";

interface VisitReason {
  id: string;
  label: string;
  instructions: string;
  requireHsAcceptance: boolean;
  hsContent: string;
  isActive: boolean;
  sortOrder: number;
  appliesTo: string;
  scope: string;
  siteId: string | null;
}

interface SiteOverride {
  siteId: string;
  siteName: string;
  siteReference: string;
  overrideCount: number;
}

interface InductionSetting {
  id: string;
  roleType: string;
  passPercentage: number;
  kioskEnabled: boolean;
  sendLinkEnabled: boolean;
  failureFeedbackLevel: string;
  scope: string;
  siteId: string | null;
}

interface InductionOverride {
  roleType: string;
  siteId: string;
}

const ROLE_TYPES = ["visitor", "staff", "contractor"] as const;
const ROLE_LABELS: Record<string, string> = { visitor: "Visitor", staff: "Staff", contractor: "Contractor" };

// ─── Visit Reason Form ─────────────────────────────────────────────────────────
function VisitReasonForm({
  initial,
  onSave,
  onCancel,
  isSaving,
}: {
  initial?: Partial<VisitReason>;
  onSave: (data: Partial<VisitReason>) => void;
  onCancel: () => void;
  isSaving: boolean;
}) {
  const [label, setLabel] = useState(initial?.label ?? "");
  const [instructions, setInstructions] = useState(initial?.instructions ?? "");
  const [requireHsAcceptance, setRequireHsAcceptance] = useState(initial?.requireHsAcceptance ?? false);
  const [hsContent, setHsContent] = useState(initial?.hsContent ?? "");
  const [appliesTo, setAppliesTo] = useState(initial?.appliesTo ?? "both");

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <Label>Label <span className="text-red-500">*</span></Label>
        <Input value={label} onChange={e => setLabel(e.target.value)} placeholder="e.g. Site Inspection" />
      </div>
      <div className="space-y-1">
        <Label>Instructions</Label>
        <Textarea value={instructions} onChange={e => setInstructions(e.target.value)} rows={2} placeholder="Optional instructions shown to visitors/contractors" />
      </div>
      <div className="space-y-1">
        <Label>Applies to</Label>
        <Select value={appliesTo} onValueChange={setAppliesTo}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="both">Both visitors & contractors</SelectItem>
            <SelectItem value="visitor">Visitors only</SelectItem>
            <SelectItem value="contractor">Contractors only</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="flex items-center gap-3">
        <Switch id="hs" checked={requireHsAcceptance} onCheckedChange={setRequireHsAcceptance} />
        <Label htmlFor="hs" className="cursor-pointer">Require H&amp;S acceptance</Label>
      </div>
      {requireHsAcceptance && (
        <div className="space-y-1">
          <Label>H&amp;S content shown to visitor</Label>
          <Textarea value={hsContent} onChange={e => setHsContent(e.target.value)} rows={3} placeholder="Health &amp; Safety notice text..." />
        </div>
      )}
      <DialogFooter className="pt-2">
        <Button variant="outline" onClick={onCancel}>Cancel</Button>
        <Button disabled={!label.trim() || isSaving} onClick={() => onSave({ label, instructions, requireHsAcceptance, hsContent, appliesTo })}>
          {isSaving ? "Saving…" : "Save standard"}
        </Button>
      </DialogFooter>
    </div>
  );
}

// ─── Visit Reasons Tab ─────────────────────────────────────────────────────────
function VisitReasonsTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<VisitReason | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [resettingSiteId, setResettingSiteId] = useState<string | null>(null);

  const { data: standards = [], isLoading, isError: standardsError, error: standardsErrorObj, refetch: refetchStandards } = useQuery<VisitReason[]>({
    queryKey: ["/api/enterprise/standards/visit-reasons"],
  });

  const { data: overrides = [] } = useQuery<SiteOverride[]>({
    queryKey: ["/api/enterprise/standards/visit-reasons/overrides"],
  });

  const createMutation = useMutation({
    mutationFn: async (data: Partial<VisitReason>) => {
      const res = await apiRequest("POST", "/api/enterprise/standards/visit-reasons", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/enterprise/standards/visit-reasons"] });
      setShowAdd(false);
      toast({ title: "Standard created", description: "Visit reason added to group standards." });
    },
    onError: () => toast({ title: "Error", description: "Failed to create standard.", variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<VisitReason> }) => {
      const res = await apiRequest("PUT", `/api/enterprise/standards/visit-reasons/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/enterprise/standards/visit-reasons"] });
      setEditing(null);
      toast({ title: "Standard updated" });
    },
    onError: () => toast({ title: "Error", description: "Failed to update standard.", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("DELETE", `/api/enterprise/standards/visit-reasons/${id}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/enterprise/standards/visit-reasons"] });
      setDeletingId(null);
      toast({ title: "Standard removed" });
    },
    onError: () => toast({ title: "Error", description: "Failed to remove standard.", variant: "destructive" }),
  });

  const resetSiteMutation = useMutation({
    mutationFn: async (siteId: string) => {
      const res = await apiRequest("DELETE", `/api/enterprise/standards/sites/${siteId}/visit-reasons`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/enterprise/standards/visit-reasons/overrides"] });
      queryClient.invalidateQueries({ queryKey: ["/api/visit-reasons"] });
      setResettingSiteId(null);
      toast({ title: "Site reset", description: "Site will now inherit the group standard." });
    },
    onError: () => toast({ title: "Error", description: "Failed to reset site.", variant: "destructive" }),
  });

  if (standardsError) {
    const is403 = (standardsErrorObj as any)?.status === 403;
    return (
      <div className="p-6 flex items-center justify-center min-h-64">
        <Card className="p-8 max-w-sm text-center space-y-3">
          <div className="w-12 h-12 rounded-xl bg-amber-50 dark:bg-amber-900/20 flex items-center justify-center mx-auto">
            <AlertTriangle size={24} className="text-amber-400" />
          </div>
          <h2 className="font-semibold">{is403 ? "Access restricted" : "Couldn't load standards"}</h2>
          <p className="text-sm text-muted-foreground">
            {is403
              ? "You don't have enterprise access for this customer. Ask an Enterprise Admin to grant you a role."
              : "The request failed — please try again or contact your administrator."}
          </p>
          {!is403 && (
            <Button variant="outline" size="sm" onClick={() => refetchStandards()}>Try again</Button>
          )}
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Enterprise standards list */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">Group Visit Reasons</CardTitle>
              <CardDescription className="text-sm mt-1">
                All sites without a local override inherit these reasons automatically.
              </CardDescription>
            </div>
            <Button size="sm" onClick={() => setShowAdd(true)}>
              <Plus size={14} className="mr-1" />Add standard
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : standards.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-8 text-center text-muted-foreground">
              <Info size={32} className="opacity-40" />
              <p className="text-sm">No group standards defined yet.</p>
              <p className="text-xs">Click "Add standard" to define visit reasons that all sites will inherit.</p>
            </div>
          ) : (
            <div className="divide-y">
              {standards.map(r => (
                <div key={r.id} className="flex items-center justify-between py-3">
                  <div className="flex items-start gap-3">
                    <CheckCircle size={16} className="mt-0.5 text-green-500 flex-shrink-0" />
                    <div>
                      <p className="text-sm font-medium">{r.label}</p>
                      <div className="flex gap-2 mt-0.5">
                        {r.appliesTo !== "both" && (
                          <Badge variant="secondary" className="text-xs">{r.appliesTo === "visitor" ? "Visitors" : "Contractors"}</Badge>
                        )}
                        {r.requireHsAcceptance && (
                          <Badge variant="outline" className="text-xs">H&amp;S acceptance</Badge>
                        )}
                        {!r.isActive && (
                          <Badge variant="destructive" className="text-xs">Inactive</Badge>
                        )}
                      </div>
                      {r.instructions && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{r.instructions}</p>}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 ml-4 flex-shrink-0">
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditing(r)}>
                      <Pencil size={13} />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => setDeletingId(r.id)}>
                      <Trash2 size={13} />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Site divergence panel */}
      {overrides.length > 0 && (
        <Card className="border-amber-200 bg-amber-50/50 dark:border-amber-800 dark:bg-amber-950/20">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <AlertTriangle size={16} className="text-amber-600" />
              <CardTitle className="text-base text-amber-800 dark:text-amber-400">
                Sites with local overrides ({overrides.length})
              </CardTitle>
            </div>
            <CardDescription className="text-amber-700 dark:text-amber-500 text-sm">
              These sites are not using the group standard. You can reset them to inherit it.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="divide-y divide-amber-200 dark:divide-amber-800">
              {overrides.map(o => (
                <div key={o.siteId} className="flex items-center justify-between py-3">
                  <div className="flex items-center gap-2">
                    <Building2 size={15} className="text-amber-600 flex-shrink-0" />
                    <div>
                      <p className="text-sm font-medium">{o.siteName}</p>
                      <p className="text-xs text-muted-foreground">{o.siteReference} · {o.overrideCount} local reason{o.overrideCount !== 1 ? "s" : ""}</p>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-amber-300 hover:bg-amber-100 dark:border-amber-700"
                    onClick={() => setResettingSiteId(o.siteId)}
                  >
                    <RotateCcw size={13} className="mr-1" />Reset to standard
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Add dialog */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add group visit reason standard</DialogTitle>
          </DialogHeader>
          <VisitReasonForm
            onSave={data => createMutation.mutate(data)}
            onCancel={() => setShowAdd(false)}
            isSaving={createMutation.isPending}
          />
        </DialogContent>
      </Dialog>

      {/* Edit dialog */}
      <Dialog open={!!editing} onOpenChange={open => { if (!open) setEditing(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit group visit reason standard</DialogTitle>
          </DialogHeader>
          {editing && (
            <VisitReasonForm
              initial={editing}
              onSave={data => updateMutation.mutate({ id: editing.id, data })}
              onCancel={() => setEditing(null)}
              isSaving={updateMutation.isPending}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={!!deletingId} onOpenChange={open => { if (!open) setDeletingId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove standard?</AlertDialogTitle>
            <AlertDialogDescription>
              This visit reason will be deactivated in the group standard. Sites currently using it will no longer see it.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => deletingId && deleteMutation.mutate(deletingId)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Reset site confirm */}
      <AlertDialog open={!!resettingSiteId} onOpenChange={open => { if (!open) setResettingSiteId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset site to group standard?</AlertDialogTitle>
            <AlertDialogDescription>
              The site's local visit reason overrides will be deleted. The site will immediately start inheriting the group standard.
              This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => resettingSiteId && resetSiteMutation.mutate(resettingSiteId)}>
              Reset to standard
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─── Induction Standards Tab ────────────────────────────────────────────────────
function InductionStandardsTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [pushingRole, setPushingRole] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ passPercentage: number; kioskEnabled: boolean; sendLinkEnabled: boolean; failureFeedbackLevel: string }>({
    passPercentage: 80,
    kioskEnabled: false,
    sendLinkEnabled: true,
    failureFeedbackLevel: "questions_topics",
  });

  const { data: overrides = [] } = useQuery<InductionOverride[]>({
    queryKey: ["/api/enterprise/standards/induction/overrides"],
  });

  const roleQueries = ROLE_TYPES.map(role =>
    useQuery<InductionSetting | null>({
      queryKey: [`/api/enterprise/standards/induction/${role}`],
    })
  );

  const pushMutation = useMutation({
    mutationFn: async ({ roleType, data }: { roleType: string; data: typeof draft }) => {
      const res = await apiRequest("PATCH", `/api/enterprise/standards/induction/${roleType}`, data);
      return res.json();
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: [`/api/enterprise/standards/induction/${vars.roleType}`] });
      setPushingRole(null);
      toast({ title: "Standard pushed", description: `Group induction standard for ${ROLE_LABELS[vars.roleType]} updated.` });
    },
    onError: () => toast({ title: "Error", description: "Failed to push standard.", variant: "destructive" }),
  });

  const overridesByRole = (role: string) => overrides.filter(o => o.roleType === role);

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2 p-3 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg text-sm text-blue-800 dark:text-blue-300">
        <Info size={15} className="mt-0.5 flex-shrink-0" />
        <p>Group induction standards set pass thresholds and kiosk behaviour for all sites. Sites without their own settings inherit these values automatically.</p>
      </div>

      {ROLE_TYPES.map((role, i) => {
        const { data: setting, isLoading } = roleQueries[i];
        const roleOverrides = overridesByRole(role);

        return (
          <Card key={role}>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base capitalize">{ROLE_LABELS[role]} Induction</CardTitle>
                  <CardDescription className="text-sm">
                    {setting ? "Group standard is set" : "No group standard — sites use their own settings"}
                  </CardDescription>
                </div>
                <Button size="sm" onClick={() => {
                  setDraft({
                    passPercentage: setting?.passPercentage ?? 80,
                    kioskEnabled: setting?.kioskEnabled ?? false,
                    sendLinkEnabled: setting?.sendLinkEnabled ?? true,
                    failureFeedbackLevel: setting?.failureFeedbackLevel ?? "questions_topics",
                  });
                  setPushingRole(role);
                }}>
                  {setting ? "Update standard" : "Push standard"}
                </Button>
              </div>
            </CardHeader>
            {(setting || isLoading) && (
              <CardContent>
                {isLoading ? (
                  <p className="text-sm text-muted-foreground">Loading…</p>
                ) : setting && (
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground w-32">Pass threshold</span>
                      <Badge variant="secondary">{setting.passPercentage}%</Badge>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground w-32">Kiosk induction</span>
                      <Badge variant={setting.kioskEnabled ? "default" : "secondary"}>
                        {setting.kioskEnabled ? "Enabled" : "Disabled"}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground w-32">Send by email</span>
                      <Badge variant={setting.sendLinkEnabled ? "default" : "secondary"}>
                        {setting.sendLinkEnabled ? "Enabled" : "Disabled"}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground w-32">Failure feedback</span>
                      <Badge variant="secondary" className="capitalize">
                        {setting.failureFeedbackLevel?.replace(/_/g, " ") ?? "—"}
                      </Badge>
                    </div>
                  </div>
                )}
                {roleOverrides.length > 0 && (
                  <div className="mt-3 flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-400">
                    <AlertTriangle size={12} />
                    {roleOverrides.length} site{roleOverrides.length !== 1 ? "s" : ""} with local overrides
                  </div>
                )}
              </CardContent>
            )}
          </Card>
        );
      })}

      {/* Push standard dialog */}
      <Dialog open={!!pushingRole} onOpenChange={open => { if (!open) setPushingRole(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {pushingRole ? `Push ${ROLE_LABELS[pushingRole]} induction standard` : "Push induction standard"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-1">
            <div className="space-y-1">
              <Label>Pass threshold (%)</Label>
              <Input
                type="number"
                min={0}
                max={100}
                value={draft.passPercentage}
                onChange={e => setDraft(d => ({ ...d, passPercentage: Number(e.target.value) }))}
              />
            </div>
            <div className="space-y-1">
              <Label>Failure feedback level</Label>
              <Select value={draft.failureFeedbackLevel} onValueChange={v => setDraft(d => ({ ...d, failureFeedbackLevel: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="score_only">Score only</SelectItem>
                  <SelectItem value="questions_topics">Questions &amp; topics</SelectItem>
                  <SelectItem value="topics_rewatch">Topics &amp; rewatch</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <Label htmlFor="kiosk" className="cursor-pointer">Kiosk induction enabled</Label>
              <Switch id="kiosk" checked={draft.kioskEnabled} onCheckedChange={v => setDraft(d => ({ ...d, kioskEnabled: v }))} />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="sendLink" className="cursor-pointer">Allow sending by email</Label>
              <Switch id="sendLink" checked={draft.sendLinkEnabled} onCheckedChange={v => setDraft(d => ({ ...d, sendLinkEnabled: v }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPushingRole(null)}>Cancel</Button>
            <Button
              disabled={pushMutation.isPending}
              onClick={() => pushingRole && pushMutation.mutate({ roleType: pushingRole, data: draft })}
            >
              {pushMutation.isPending ? "Pushing…" : "Push to all sites"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────────
// ── Contractor Pool Mode tab ──────────────────────────────────────────────
function ContractorPoolTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [confirmMode, setConfirmMode] = useState<'shared' | 'independent' | null>(null);

  const { data: poolData, isLoading } = useQuery<{ mode: string }>({
    queryKey: ['/api/enterprise/contractor-pool-mode'],
    staleTime: 0,
    refetchOnMount: true,
  });
  const currentMode = (poolData?.mode ?? 'shared') as 'shared' | 'independent';

  const updateMutation = useMutation({
    mutationFn: async (mode: 'shared' | 'independent') => {
      const res = await apiRequest('PUT', '/api/enterprise/contractor-pool-mode', { mode });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as any)?.error ?? 'Failed to update contractor pool mode.');
      }
      return res.json();
    },
    onSuccess: (_data, mode) => {
      queryClient.invalidateQueries({ queryKey: ['/api/enterprise/contractor-pool-mode'] });
      setConfirmMode(null);
      toast({ title: 'Setting saved', description: `Contractor pool mode switched to ${mode === 'independent' ? 'Independent per site' : 'Shared across estate'}.` });
    },
    onError: (err: any) => {
      setConfirmMode(null);
      toast({ title: 'Error', description: err?.message ?? 'Failed to update contractor pool mode.', variant: 'destructive' });
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-2 p-3 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg text-sm text-blue-800 dark:text-blue-300">
        <Info size={15} className="mt-0.5 flex-shrink-0" />
        <p>
          Controls how contractor firms are approved across your estate. This is a global setting — all sites use the same mode.
        </p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Users size={16} />
            Contractor Pool Mode
          </CardTitle>
          <CardDescription className="text-sm">
            Choose how contractor firms are approved and made visible across your sites.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : (
            <>
              {/* Shared mode option */}
              <div
                role="button"
                tabIndex={0}
                className={`flex items-start gap-4 p-4 rounded-lg border-2 cursor-pointer transition-colors ${
                  currentMode === 'shared'
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:border-primary/40'
                }`}
                onClick={() => currentMode !== 'shared' && setConfirmMode('shared')}
                onKeyDown={e => e.key === 'Enter' && currentMode !== 'shared' && setConfirmMode('shared')}
              >
                <div className="mt-0.5 w-5 h-5 rounded-full border-2 border-primary flex items-center justify-center flex-shrink-0">
                  {currentMode === 'shared' && <div className="w-2.5 h-2.5 rounded-full bg-primary" />}
                </div>
                <div>
                  <p className="font-medium text-sm">Shared across estate</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    A contractor is vetted and approved once at head-office level. Every site sees the full approved pool automatically.
                    Best for centrally managed estates.
                  </p>
                </div>
                {currentMode === 'shared' && (
                  <Badge variant="outline" className="ml-auto text-xs text-primary border-primary/40 flex-shrink-0">
                    Active
                  </Badge>
                )}
              </div>

              {/* Independent mode option */}
              <div
                role="button"
                tabIndex={0}
                className={`flex items-start gap-4 p-4 rounded-lg border-2 cursor-pointer transition-colors ${
                  currentMode === 'independent'
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:border-primary/40'
                }`}
                onClick={() => currentMode !== 'independent' && setConfirmMode('independent')}
                onKeyDown={e => e.key === 'Enter' && currentMode !== 'independent' && setConfirmMode('independent')}
              >
                <div className="mt-0.5 w-5 h-5 rounded-full border-2 border-primary flex items-center justify-center flex-shrink-0">
                  {currentMode === 'independent' && <div className="w-2.5 h-2.5 rounded-full bg-primary" />}
                </div>
                <div>
                  <p className="font-medium text-sm">Independent per site</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Each site approves its own contractor firms independently. Compliance documents are still entered once
                    (no re-keying), but approval is site-by-site. Best for sites that operate autonomously.
                  </p>
                </div>
                {currentMode === 'independent' && (
                  <Badge variant="outline" className="ml-auto text-xs text-primary border-primary/40 flex-shrink-0">
                    Active
                  </Badge>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Confirmation dialog */}
      <AlertDialog open={!!confirmMode} onOpenChange={open => { if (!open) setConfirmMode(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmMode === 'independent' ? 'Switch to Independent mode?' : 'Switch back to Shared mode?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmMode === 'independent'
                ? 'Every currently-approved contractor will be seeded as approved at all active sites, so no site loses access immediately. From this point, new contractors added to the pool will start as "pending" and require per-site approval.'
                : 'Switching back to Shared mode makes the estate-wide contractor list visible to all sites again. Per-site approval records are preserved but will no longer filter the list.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={updateMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => confirmMode && updateMutation.mutate(confirmMode)}
              disabled={updateMutation.isPending}
            >
              {updateMutation.isPending ? 'Switching…' : `Switch to ${confirmMode === 'independent' ? 'Independent' : 'Shared'}`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default function EnterpriseStandards() {
  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-primary/10">
          <BookOpen size={22} className="text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Group Standards</h1>
          <p className="text-sm text-muted-foreground">
            Define visit reasons and induction settings once — all sites inherit them unless they set a local override.
          </p>
        </div>
      </div>

      <Tabs defaultValue="visit-reasons">
        <TabsList>
          <TabsTrigger value="visit-reasons">Visit Reasons</TabsTrigger>
          <TabsTrigger value="inductions">Inductions</TabsTrigger>
          <TabsTrigger value="contractor-pool">Contractor Pool</TabsTrigger>
        </TabsList>

        <TabsContent value="visit-reasons" className="mt-4">
          <VisitReasonsTab />
        </TabsContent>

        <TabsContent value="inductions" className="mt-4">
          <InductionStandardsTab />
        </TabsContent>

        <TabsContent value="contractor-pool" className="mt-4">
          <ContractorPoolTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
