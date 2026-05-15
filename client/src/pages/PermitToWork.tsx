import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import {
  ClipboardList, Plus, Eye, CheckCircle2, XCircle, Clock, AlertTriangle,
  Flame, Zap, HardHat, Wind, Shovel, TriangleAlert, FileWarning,
  ChevronRight, User, Calendar, MapPin, MoreVertical, RefreshCw, Pause, Play, Lock, Info
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";

const PERMIT_TYPES: Record<string, { label: string; icon: any; color: string }> = {
  hot_works:           { label: 'Hot Works',          icon: Flame,        color: 'text-orange-600' },
  working_at_height:   { label: 'Working at Height',  icon: HardHat,      color: 'text-blue-600' },
  electrical_isolation:{ label: 'Electrical Isolation',icon: Zap,          color: 'text-yellow-600' },
  confined_space:      { label: 'Confined Space',     icon: Wind,         color: 'text-purple-600' },
  excavation:          { label: 'Excavation',         icon: Shovel,       color: 'text-amber-700' },
  asbestos:            { label: 'Asbestos',           icon: TriangleAlert,color: 'text-red-600' },
  general_high_risk:   { label: 'General High Risk',  icon: FileWarning,  color: 'text-gray-600' },
};

const STATUS_CONFIG: Record<string, { label: string; variant: 'default'|'secondary'|'outline'|'destructive'; color: string }> = {
  draft:       { label: 'Draft',       variant: 'secondary', color: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300' },
  submitted:   { label: 'Pending Auth',variant: 'outline',   color: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300' },
  authorised:  { label: 'Authorised',  variant: 'outline',   color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300' },
  active:      { label: 'Active',      variant: 'default',   color: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300' },
  suspended:   { label: 'Suspended',   variant: 'outline',   color: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300' },
  completed:   { label: 'Completed',   variant: 'secondary', color: 'bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-300' },
  expired:     { label: 'Expired',     variant: 'destructive', color: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300' },
  cancelled:   { label: 'Cancelled',   variant: 'secondary', color: 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400' },
};

interface Permit {
  id: string;
  permitNumber: string;
  permitType: string;
  workDescription: string;
  workLocation: string;
  plannedStartDate: string;
  plannedStartTime: string;
  plannedEndDate: string;
  plannedEndTime: string;
  permitValidFrom: string;
  permitValidUntil: string;
  status: string;
  contractorCompanyName: string | null;
  contractorWorkerName: string | null;
  staffName: string | null;
  authorisedByName: string | null;
  authorisedAt: string | null;
  authNotes: string | null;
  rejectionReason: string | null;
  closureNotes: string | null;
  closedByName: string | null;
  closedAt: string | null;
  suspensionReason: string | null;
  suspendedAt: string | null;
  createdById: string | null;
  createdByName: string | null;
  createdAt: string;
}

interface ChecklistItem {
  id: string;
  checklistSection: string;
  itemDescription: string;
  isRequired: boolean;
  response: string | null;
  respondedAt: string | null;
  notes: string | null;
  displayOrder: number;
}

interface PermitDetail extends Permit {
  checklist: ChecklistItem[];
  attachments: any[];
}

export default function PermitToWork() {
  const { data: user } = useQuery<{ id: string; username: string; role?: string } | null>({
    queryKey: ['/api/auth/me'],
  });
  const { toast } = useToast();
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState('active');
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [viewPermitId, setViewPermitId] = useState<string | null>(null);
  const [actionDialogState, setActionDialogState] = useState<{ type: string; permitId: string; permitNumber: string } | null>(null);
  const [actionReason, setActionReason] = useState('');

  const { data: permits = [], isLoading } = useQuery<Permit[]>({
    queryKey: ['/api/ptw'],
  });

  const { data: permitDetail } = useQuery<PermitDetail>({
    queryKey: ['/api/ptw', viewPermitId],
    enabled: !!viewPermitId,
  });

  const isManager = user?.role === 'admin' || user?.role === 'manager';

  const tab_filters: Record<string, (p: Permit) => boolean> = {
    active:    p => ['active', 'suspended'].includes(p.status),
    pending:   p => ['draft', 'submitted'].includes(p.status),
    authorised:p => p.status === 'authorised',
    history:   p => ['completed', 'expired', 'cancelled'].includes(p.status),
  };

  const filteredPermits = permits.filter(tab_filters[activeTab] || (() => true));

  const counts = {
    active:    permits.filter(tab_filters.active).length,
    pending:   permits.filter(tab_filters.pending).length,
    authorised:permits.filter(tab_filters.authorised).length,
    history:   permits.filter(tab_filters.history).length,
  };

  const doAction = (type: string, permitId: string, body: any = {}) =>
    apiRequest('PATCH', `/api/ptw/${permitId}/${type}`, body);

  const actionMutation = useMutation({
    mutationFn: ({ type, permitId, body }: { type: string; permitId: string; body: any }) =>
      doAction(type, permitId, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['/api/ptw'] });
      if (viewPermitId) qc.invalidateQueries({ queryKey: ['/api/ptw', viewPermitId] });
      setActionDialogState(null);
      setActionReason('');
      toast({ title: 'Permit updated successfully.' });
    },
    onError: (e: any) => toast({ title: e?.error || 'Action failed', variant: 'destructive' }),
  });

  const checklistMutation = useMutation({
    mutationFn: ({ permitId, checklistItemId, response, notes }: { permitId: string; checklistItemId: string; response: string; notes?: string }) =>
      apiRequest('PATCH', `/api/ptw/${permitId}/checklist/${checklistItemId}`, { response, notes }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['/api/ptw', viewPermitId] });
    },
    onError: () => toast({ title: 'Failed to update checklist', variant: 'destructive' }),
  });

  const handleActionConfirm = () => {
    if (!actionDialogState) return;
    const { type, permitId } = actionDialogState;
    const body: any = {};
    if (type === 'reject') body.rejectionReason = actionReason;
    if (type === 'suspend') body.suspensionReason = actionReason;
    if (type === 'close') { body.closureNotes = actionReason; body.workCompletedSatisfactorily = true; }
    if (type === 'authorise') body.authNotes = actionReason;
    actionMutation.mutate({ type, permitId, body });
  };

  const ACTION_CONFIG: Record<string, { label: string; requiresReason: boolean; reasonLabel?: string; reasonRequired?: boolean; bg: string }> = {
    submit:    { label: 'Submit for Authorisation', requiresReason: false, bg: 'bg-amber-600 hover:bg-amber-700' },
    authorise: { label: 'Authorise Permit',         requiresReason: true,  reasonLabel: 'Authorisation notes (optional)', reasonRequired: false, bg: 'bg-blue-600 hover:bg-blue-700' },
    reject:    { label: 'Reject Permit',            requiresReason: true,  reasonLabel: 'Rejection reason *', reasonRequired: true, bg: 'bg-red-600 hover:bg-red-700' },
    activate:  { label: 'Activate Permit (Start Work)', requiresReason: false, bg: 'bg-emerald-600 hover:bg-emerald-700' },
    suspend:   { label: 'Suspend Permit',           requiresReason: true,  reasonLabel: 'Reason for suspension *', reasonRequired: true, bg: 'bg-orange-600 hover:bg-orange-700' },
    resume:    { label: 'Resume Work',              requiresReason: false, bg: 'bg-blue-600 hover:bg-blue-700' },
    close:     { label: 'Close & Complete Permit',  requiresReason: true,  reasonLabel: 'Closure notes (optional)', reasonRequired: false, bg: 'bg-teal-600 hover:bg-teal-700' },
    cancel:    { label: 'Cancel Permit',            requiresReason: false, bg: 'bg-gray-600 hover:bg-gray-700' },
  };

  return (
    <div className="space-y-6 p-4 md:p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <ClipboardList className="h-6 w-6 text-orange-600" />
            Permit-to-Work System
          </h1>
          <div className="flex items-center gap-1.5 mt-1">
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Manage high-risk work authorisation permits — hot works, electrical isolation, confined spaces and more.
            </p>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button type="button" className="text-muted-foreground hover:text-foreground transition-colors">
                    <Info size={14} />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-sm text-xs space-y-2 p-3">
                  <p><strong>Permit-to-Work System</strong> — A formal written system used to control high-risk activities, ensuring work is properly planned, authorised, and carried out safely.</p>
                  <p>Required under the <strong>Health &amp; Safety at Work Act 1974</strong>, <strong>Management of Health &amp; Safety at Work Regulations 1999</strong>, <strong>CDM Regulations 2015</strong>, <strong>Working at Height Regulations 2005</strong>, <strong>Confined Spaces Regulations 1997</strong>, and the <strong>Electricity at Work Regulations 1989</strong>. A documented PTW system provides evidence of duty of care compliance.</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>
        <Button onClick={() => setShowCreateDialog(true)}>
          <Plus className="h-4 w-4 mr-1.5" /> New Permit
        </Button>
      </div>

      {/* Status chips */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {([
          { key: 'active',    label: 'Active / Suspended', icon: Play,        bg: 'bg-emerald-50 dark:bg-emerald-900/20', text: 'text-emerald-700 dark:text-emerald-300' },
          { key: 'pending',   label: 'Draft / Pending',    icon: Clock,       bg: 'bg-amber-50 dark:bg-amber-900/20',    text: 'text-amber-700 dark:text-amber-300' },
          { key: 'authorised',label: 'Authorised',         icon: CheckCircle2,bg: 'bg-blue-50 dark:bg-blue-900/20',      text: 'text-blue-700 dark:text-blue-300' },
          { key: 'history',   label: 'History',            icon: ClipboardList,bg:'bg-gray-50 dark:bg-gray-800',          text: 'text-gray-700 dark:text-gray-300' },
        ] as any[]).map(chip => (
          <button key={chip.key} onClick={() => setActiveTab(chip.key)}
            className={`${chip.bg} ${chip.text} rounded-xl p-3 text-left transition-all ring-2 ${activeTab === chip.key ? 'ring-current' : 'ring-transparent hover:ring-current/40'}`}>
            <chip.icon className="h-5 w-5 mb-1" />
            <div className="text-2xl font-bold">{counts[chip.key as keyof typeof counts]}</div>
            <div className="text-xs font-medium">{chip.label}</div>
          </button>
        ))}
      </div>

      {/* Permit list */}
      {isLoading ? (
        <div className="flex items-center justify-center h-32 text-gray-400">
          <RefreshCw className="h-5 w-5 animate-spin mr-2" /> Loading permits…
        </div>
      ) : filteredPermits.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <ClipboardList className="h-10 w-10 text-gray-300 mb-3" />
            <h3 className="text-base font-semibold text-gray-600 dark:text-gray-300">No permits in this category</h3>
            <p className="text-sm text-gray-500 mt-1">Create a new permit using the button above.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filteredPermits.map(permit => {
            const pt = PERMIT_TYPES[permit.permitType] || PERMIT_TYPES.general_high_risk;
            const sc = STATUS_CONFIG[permit.status] || STATUS_CONFIG.draft;
            const PtIcon = pt.icon;
            return (
              <Card key={permit.id} className="hover:shadow-md transition-shadow cursor-pointer" onClick={() => setViewPermitId(permit.id)}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0">
                      <div className={`p-2 rounded-lg bg-gray-100 dark:bg-gray-800 shrink-0`}>
                        <PtIcon className={`h-5 w-5 ${pt.color}`} />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono text-xs text-gray-500 dark:text-gray-400">{permit.permitNumber}</span>
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${sc.color}`}>{sc.label}</span>
                        </div>
                        <p className="font-semibold text-gray-900 dark:text-white text-sm mt-0.5 truncate">{pt.label}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{permit.workDescription}</p>
                        <div className="flex items-center gap-3 mt-1.5 text-xs text-gray-500 dark:text-gray-400 flex-wrap">
                          <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{permit.workLocation}</span>
                          <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />{permit.plannedStartDate} {permit.plannedStartTime}</span>
                          {(permit.contractorWorkerName || permit.staffName) && (
                            <span className="flex items-center gap-1"><User className="h-3 w-3" />{permit.contractorWorkerName || permit.staffName}</span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0" onClick={e => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => setViewPermitId(permit.id)}>
                            <Eye className="h-4 w-4 mr-2" /> View Details
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          {permit.status === 'draft' && (
                            <DropdownMenuItem onClick={() => setActionDialogState({ type: 'submit', permitId: permit.id, permitNumber: permit.permitNumber })}>
                              <ChevronRight className="h-4 w-4 mr-2" /> Submit for Authorisation
                            </DropdownMenuItem>
                          )}
                          {permit.status === 'submitted' && isManager && (
                            <>
                              <DropdownMenuItem onClick={() => setActionDialogState({ type: 'authorise', permitId: permit.id, permitNumber: permit.permitNumber })}>
                                <CheckCircle2 className="h-4 w-4 mr-2 text-blue-500" /> Authorise
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => setActionDialogState({ type: 'reject', permitId: permit.id, permitNumber: permit.permitNumber })}>
                                <XCircle className="h-4 w-4 mr-2 text-red-500" /> Reject
                              </DropdownMenuItem>
                            </>
                          )}
                          {permit.status === 'authorised' && (
                            <DropdownMenuItem onClick={() => actionMutation.mutate({ type: 'activate', permitId: permit.id, body: {} })}>
                              <Play className="h-4 w-4 mr-2 text-emerald-500" /> Activate (Start Work)
                            </DropdownMenuItem>
                          )}
                          {permit.status === 'active' && (
                            <>
                              <DropdownMenuItem onClick={() => setActionDialogState({ type: 'suspend', permitId: permit.id, permitNumber: permit.permitNumber })}>
                                <Pause className="h-4 w-4 mr-2 text-orange-500" /> Suspend
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => setActionDialogState({ type: 'close', permitId: permit.id, permitNumber: permit.permitNumber })}>
                                <Lock className="h-4 w-4 mr-2 text-teal-500" /> Close & Complete
                              </DropdownMenuItem>
                            </>
                          )}
                          {permit.status === 'suspended' && (
                            <>
                              <DropdownMenuItem onClick={() => actionMutation.mutate({ type: 'resume', permitId: permit.id, body: {} })}>
                                <Play className="h-4 w-4 mr-2 text-blue-500" /> Resume
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => setActionDialogState({ type: 'close', permitId: permit.id, permitNumber: permit.permitNumber })}>
                                <Lock className="h-4 w-4 mr-2 text-teal-500" /> Close & Complete
                              </DropdownMenuItem>
                            </>
                          )}
                          {!['completed', 'expired', 'cancelled'].includes(permit.status) && (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem className="text-red-600" onClick={() => actionMutation.mutate({ type: 'cancel', permitId: permit.id, body: {} })}>
                                <XCircle className="h-4 w-4 mr-2" /> Cancel Permit
                              </DropdownMenuItem>
                            </>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Create Permit Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="h-5 w-5" /> New Permit-to-Work
            </DialogTitle>
          </DialogHeader>
          <CreatePermitForm
            onSuccess={(permitId) => {
              setShowCreateDialog(false);
              qc.invalidateQueries({ queryKey: ['/api/ptw'] });
              toast({ title: 'Permit created. Complete the checklist before submitting.' });
              setViewPermitId(permitId);
            }}
            onCancel={() => setShowCreateDialog(false)}
          />
        </DialogContent>
      </Dialog>

      {/* Permit Detail Dialog */}
      <Dialog open={!!viewPermitId} onOpenChange={open => !open && setViewPermitId(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          {permitDetail && (
            <PermitDetailView
              permit={permitDetail}
              isManager={isManager}
              currentUserId={user?.id}
              onAction={(type) => setActionDialogState({ type, permitId: permitDetail.id, permitNumber: permitDetail.permitNumber })}
              onChecklistUpdate={(checklistItemId, response, notes) =>
                checklistMutation.mutate({ permitId: permitDetail.id, checklistItemId, response, notes })
              }
              onQuickAction={(type) => actionMutation.mutate({ type, permitId: permitDetail.id, body: {} })}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Action Confirm Dialog */}
      <Dialog open={!!actionDialogState} onOpenChange={open => { if (!open) { setActionDialogState(null); setActionReason(''); }}}>
        <DialogContent className="max-w-md">
          {actionDialogState && (
            <>
              <DialogHeader>
                <DialogTitle>{ACTION_CONFIG[actionDialogState.type]?.label}</DialogTitle>
              </DialogHeader>
              <p className="text-sm text-gray-600 dark:text-gray-300">
                Permit: <strong>{actionDialogState.permitNumber}</strong>
              </p>
              {ACTION_CONFIG[actionDialogState.type]?.requiresReason && (
                <div>
                  <Label>{ACTION_CONFIG[actionDialogState.type].reasonLabel}</Label>
                  <Textarea
                    rows={3}
                    value={actionReason}
                    onChange={e => setActionReason(e.target.value)}
                    placeholder={`Enter ${ACTION_CONFIG[actionDialogState.type].reasonLabel?.toLowerCase() || 'notes'}…`}
                  />
                </div>
              )}
              <DialogFooter>
                <Button variant="outline" onClick={() => { setActionDialogState(null); setActionReason(''); }}>Cancel</Button>
                <Button
                  className={ACTION_CONFIG[actionDialogState.type]?.bg || ''}
                  onClick={handleActionConfirm}
                  disabled={actionMutation.isPending || (ACTION_CONFIG[actionDialogState.type]?.reasonRequired && !actionReason.trim())}
                >
                  {actionMutation.isPending ? 'Processing…' : ACTION_CONFIG[actionDialogState.type]?.label}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Create Permit Form ───────────────────────────────────────────────────────

function CreatePermitForm({ onSuccess, onCancel }: { onSuccess: (id: string) => void; onCancel: () => void }) {
  const { toast } = useToast();
  const [form, setForm] = useState({
    permitType: '', workDescription: '', workLocation: '',
    plannedStartDate: '', plannedStartTime: '08:00',
    plannedEndDate: '', plannedEndTime: '17:00',
    contractorCompanyName: '', contractorWorkerName: '',
  });

  const mutation = useMutation({
    mutationFn: (data: any) => apiRequest('POST', '/api/ptw', data),
    onSuccess: (data: any) => onSuccess(data.id),
    onError: (e: any) => toast({ title: e?.error || 'Failed to create permit', variant: 'destructive' }),
  });

  const handleSubmit = () => {
    if (!form.permitType || !form.workDescription || !form.workLocation || !form.plannedStartDate || !form.plannedEndDate) {
      toast({ title: 'Please fill in all required fields', variant: 'destructive' });
      return;
    }
    mutation.mutate(form);
  };

  return (
    <div className="space-y-4">
      <div>
        <Label>Permit Type *</Label>
        <Select value={form.permitType} onValueChange={v => setForm(p => ({ ...p, permitType: v }))}>
          <SelectTrigger><SelectValue placeholder="Select work type…" /></SelectTrigger>
          <SelectContent>
            {Object.entries(PERMIT_TYPES).map(([k, v]) => (
              <SelectItem key={k} value={k}>
                <div className="flex items-center gap-2">
                  <v.icon className={`h-4 w-4 ${v.color}`} />
                  {v.label}
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label>Work Description *</Label>
        <Textarea rows={2} value={form.workDescription} onChange={e => setForm(p => ({ ...p, workDescription: e.target.value }))} placeholder="Describe the work to be carried out…" />
      </div>
      <div>
        <Label>Work Location *</Label>
        <Input value={form.workLocation} onChange={e => setForm(p => ({ ...p, workLocation: e.target.value }))} placeholder="e.g. Plant Room B, Level 2" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Planned Start Date *</Label>
          <Input type="date" value={form.plannedStartDate} onChange={e => setForm(p => ({ ...p, plannedStartDate: e.target.value }))} />
        </div>
        <div>
          <Label>Start Time *</Label>
          <Input type="time" value={form.plannedStartTime} onChange={e => setForm(p => ({ ...p, plannedStartTime: e.target.value }))} />
        </div>
        <div>
          <Label>Planned End Date *</Label>
          <Input type="date" value={form.plannedEndDate} onChange={e => setForm(p => ({ ...p, plannedEndDate: e.target.value }))} />
        </div>
        <div>
          <Label>End Time *</Label>
          <Input type="time" value={form.plannedEndTime} onChange={e => setForm(p => ({ ...p, plannedEndTime: e.target.value }))} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Contractor / Company</Label>
          <Input value={form.contractorCompanyName} onChange={e => setForm(p => ({ ...p, contractorCompanyName: e.target.value }))} placeholder="Company name" />
        </div>
        <div>
          <Label>Operative Name</Label>
          <Input value={form.contractorWorkerName} onChange={e => setForm(p => ({ ...p, contractorWorkerName: e.target.value }))} placeholder="Worker name" />
        </div>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onCancel}>Cancel</Button>
        <Button onClick={handleSubmit} disabled={mutation.isPending}>
          {mutation.isPending ? 'Creating…' : 'Create Permit & Complete Checklist →'}
        </Button>
      </DialogFooter>
    </div>
  );
}

// ─── Permit Detail View ───────────────────────────────────────────────────────

function PermitDetailView({
  permit, isManager, currentUserId, onAction, onChecklistUpdate, onQuickAction,
}: {
  permit: PermitDetail;
  isManager: boolean;
  currentUserId?: string;
  onAction: (type: string) => void;
  onChecklistUpdate: (id: string, response: string, notes?: string) => void;
  onQuickAction: (type: string) => void;
}) {
  const pt = PERMIT_TYPES[permit.permitType] || PERMIT_TYPES.general_high_risk;
  const sc = STATUS_CONFIG[permit.status] || STATUS_CONFIG.draft;
  const PtIcon = pt.icon;
  const [activeTab, setActiveTab] = useState('details');
  const [expandedSection, setExpandedSection] = useState<string | null>(null);

  // Group checklist by section
  const sections: Record<string, ChecklistItem[]> = {};
  for (const item of permit.checklist || []) {
    if (!sections[item.checklistSection]) sections[item.checklistSection] = [];
    sections[item.checklistSection].push(item);
  }

  const checklistComplete = permit.checklist.length === 0 || permit.checklist.every(i => !i.isRequired || !!i.response);
  const completedCount = permit.checklist.filter(i => !!i.response).length;

  const canEdit = permit.status === 'draft' || permit.status === 'submitted';
  const isSameUserAsCreator = permit.createdById === currentUserId;

  return (
    <>
      <DialogHeader>
        <div className="flex items-start gap-3">
          <div className={`p-2 rounded-lg bg-gray-100 dark:bg-gray-800 shrink-0`}>
            <PtIcon className={`h-6 w-6 ${pt.color}`} />
          </div>
          <div>
            <DialogTitle className="text-base">{pt.label} — {permit.permitNumber}</DialogTitle>
            <div className="flex items-center gap-2 mt-1">
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${sc.color}`}>{sc.label}</span>
              <span className="text-xs text-gray-500">{permit.workLocation}</span>
            </div>
          </div>
        </div>
      </DialogHeader>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="mt-2">
        <TabsList className="grid grid-cols-3 w-full">
          <TabsTrigger value="details">Details</TabsTrigger>
          <TabsTrigger value="checklist">
            Checklist {permit.checklist.length > 0 && (
              <span className={`ml-1 text-xs px-1.5 rounded-full ${checklistComplete ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                {completedCount}/{permit.checklist.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="history">Timeline</TabsTrigger>
        </TabsList>

        {/* Details tab */}
        <TabsContent value="details" className="space-y-4 mt-3">
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <div className="text-gray-500 dark:text-gray-400">Work type</div>
            <div className="font-medium">{pt.label}</div>
            <div className="text-gray-500 dark:text-gray-400">Description</div>
            <div>{permit.workDescription}</div>
            <div className="text-gray-500 dark:text-gray-400">Location</div>
            <div>{permit.workLocation}</div>
            <div className="text-gray-500 dark:text-gray-400">Planned start</div>
            <div>{permit.plannedStartDate} {permit.plannedStartTime}</div>
            <div className="text-gray-500 dark:text-gray-400">Planned end</div>
            <div>{permit.plannedEndDate} {permit.plannedEndTime}</div>
            {(permit.contractorCompanyName || permit.contractorWorkerName) && (
              <>
                <div className="text-gray-500 dark:text-gray-400">Contractor</div>
                <div>{permit.contractorCompanyName}{permit.contractorWorkerName ? ` — ${permit.contractorWorkerName}` : ''}</div>
              </>
            )}
            {permit.staffName && (
              <>
                <div className="text-gray-500 dark:text-gray-400">Staff member</div>
                <div>{permit.staffName}</div>
              </>
            )}
            {permit.authorisedByName && (
              <>
                <div className="text-gray-500 dark:text-gray-400">Authorised by</div>
                <div>{permit.authorisedByName} {permit.authorisedAt ? `(${new Date(permit.authorisedAt).toLocaleDateString('en-GB')})` : ''}</div>
              </>
            )}
            {permit.authNotes && (
              <>
                <div className="text-gray-500 dark:text-gray-400">Auth notes</div>
                <div className="italic">{permit.authNotes}</div>
              </>
            )}
            {permit.rejectionReason && (
              <>
                <div className="text-red-500">Rejected — reason</div>
                <div className="text-red-600">{permit.rejectionReason}</div>
              </>
            )}
            {permit.suspensionReason && (
              <>
                <div className="text-orange-500">Suspended — reason</div>
                <div className="text-orange-600">{permit.suspensionReason}</div>
              </>
            )}
            {permit.closedByName && (
              <>
                <div className="text-gray-500 dark:text-gray-400">Closed by</div>
                <div>{permit.closedByName} {permit.closedAt ? `(${new Date(permit.closedAt).toLocaleDateString('en-GB')})` : ''}</div>
              </>
            )}
            {permit.closureNotes && (
              <>
                <div className="text-gray-500 dark:text-gray-400">Closure notes</div>
                <div>{permit.closureNotes}</div>
              </>
            )}
          </div>

          {/* Action buttons */}
          <div className="flex gap-2 flex-wrap pt-2 border-t dark:border-gray-700">
            {permit.status === 'draft' && (
              <Button size="sm" onClick={() => onAction('submit')} className="bg-amber-600 hover:bg-amber-700 text-white" disabled={!checklistComplete}>
                <ChevronRight className="h-4 w-4 mr-1" />
                {checklistComplete ? 'Submit for Authorisation' : `Complete checklist first (${completedCount}/${permit.checklist.length})`}
              </Button>
            )}
            {permit.status === 'submitted' && isManager && !isSameUserAsCreator && (
              <>
                <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white" onClick={() => onAction('authorise')}>
                  <CheckCircle2 className="h-4 w-4 mr-1" /> Authorise
                </Button>
                <Button size="sm" variant="destructive" onClick={() => onAction('reject')}>
                  <XCircle className="h-4 w-4 mr-1" /> Reject
                </Button>
              </>
            )}
            {permit.status === 'authorised' && (
              <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => onQuickAction('activate')}>
                <Play className="h-4 w-4 mr-1" /> Activate (Start Work)
              </Button>
            )}
            {permit.status === 'active' && (
              <>
                <Button size="sm" className="bg-orange-600 hover:bg-orange-700 text-white" onClick={() => onAction('suspend')}>
                  <Pause className="h-4 w-4 mr-1" /> Suspend
                </Button>
                <Button size="sm" className="bg-teal-600 hover:bg-teal-700 text-white" onClick={() => onAction('close')}>
                  <Lock className="h-4 w-4 mr-1" /> Close & Complete
                </Button>
              </>
            )}
            {permit.status === 'suspended' && (
              <>
                <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white" onClick={() => onQuickAction('resume')}>
                  <Play className="h-4 w-4 mr-1" /> Resume
                </Button>
                <Button size="sm" className="bg-teal-600 hover:bg-teal-700 text-white" onClick={() => onAction('close')}>
                  <Lock className="h-4 w-4 mr-1" /> Close & Complete
                </Button>
              </>
            )}
            {!['completed', 'expired', 'cancelled'].includes(permit.status) && (
              <Button size="sm" variant="outline" className="text-red-600 hover:text-red-700 ml-auto" onClick={() => onQuickAction('cancel')}>
                Cancel Permit
              </Button>
            )}
          </div>
        </TabsContent>

        {/* Checklist tab */}
        <TabsContent value="checklist" className="mt-3">
          {permit.checklist.length === 0 ? (
            <div className="text-center py-8 text-gray-500 text-sm">No checklist items for this permit.</div>
          ) : (
            <div className="space-y-3">
              {Object.entries(sections).map(([section, items]) => {
                const sectionComplete = items.every(i => !i.isRequired || !!i.response);
                return (
                  <div key={section} className="border dark:border-gray-700 rounded-lg overflow-hidden">
                    <button
                      className={`w-full flex items-center justify-between px-4 py-2.5 text-sm font-semibold ${sectionComplete ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-800 dark:text-emerald-300' : 'bg-gray-50 dark:bg-gray-800 text-gray-800 dark:text-gray-200'}`}
                      onClick={() => setExpandedSection(expandedSection === section ? null : section)}
                    >
                      <span className="flex items-center gap-2">
                        {sectionComplete ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <Clock className="h-4 w-4 text-amber-500" />}
                        {section}
                      </span>
                      <span className="text-xs text-gray-500">{items.filter(i => !!i.response).length}/{items.length}</span>
                    </button>
                    {(expandedSection === section || !Object.keys(sections).some(s => s !== section && expandedSection === s)) && (
                      <div className="divide-y dark:divide-gray-700">
                        {items.map(item => (
                          <div key={item.id} className={`px-4 py-3 ${item.response === 'no' ? 'bg-red-50 dark:bg-red-900/10' : ''}`}>
                            <div className="flex items-start gap-3">
                              <div className="flex gap-2 mt-0.5">
                                {['yes', 'no', 'n/a'].map(opt => (
                                  <button
                                    key={opt}
                                    disabled={!canEdit}
                                    onClick={() => canEdit && onChecklistUpdate(item.id, opt)}
                                    className={`text-xs px-2 py-0.5 rounded font-medium border transition-colors ${
                                      item.response === opt
                                        ? opt === 'yes' ? 'bg-emerald-600 text-white border-emerald-600'
                                          : opt === 'no' ? 'bg-red-600 text-white border-red-600'
                                          : 'bg-gray-500 text-white border-gray-500'
                                        : 'bg-transparent text-gray-500 border-gray-300 dark:border-gray-600 hover:border-gray-500'
                                    } ${!canEdit ? 'opacity-60 cursor-default' : 'cursor-pointer'}`}
                                  >
                                    {opt.toUpperCase()}
                                  </button>
                                ))}
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="text-sm text-gray-800 dark:text-gray-200">
                                  {item.itemDescription}
                                  {item.isRequired && <span className="text-red-400 ml-1">*</span>}
                                </p>
                                {item.response === 'no' && (
                                  <p className="text-xs text-red-600 mt-1">Mitigating control note required:</p>
                                )}
                                {item.notes && <p className="text-xs text-amber-700 dark:text-amber-400 mt-1 italic">Note: {item.notes}</p>}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* Timeline tab */}
        <TabsContent value="history" className="mt-3">
          <div className="space-y-3 text-sm">
            {[
              { label: 'Permit created', date: permit.createdAt, by: permit.createdByName, color: 'bg-gray-400' },
              permit.status !== 'draft' ? { label: 'Submitted for authorisation', date: null, color: 'bg-amber-400' } : null,
              permit.authorisedAt ? { label: 'Authorised', date: permit.authorisedAt, by: permit.authorisedByName, color: 'bg-blue-500', note: permit.authNotes } : null,
              permit.rejectedAt ? { label: 'Rejected', date: (permit as any).rejectedAt, color: 'bg-red-500', note: permit.rejectionReason } : null,
              (permit as any).actualStartAt ? { label: 'Work started (activated)', date: (permit as any).actualStartAt, color: 'bg-emerald-500' } : null,
              permit.suspendedAt ? { label: 'Suspended', date: (permit as any).suspendedAt, color: 'bg-orange-500', note: permit.suspensionReason } : null,
              permit.closedAt ? { label: `Completed & closed`, date: permit.closedAt, by: permit.closedByName, color: 'bg-teal-500', note: permit.closureNotes } : null,
            ].filter(Boolean).map((event: any, i) => (
              <div key={i} className="flex gap-3">
                <div className="flex flex-col items-center">
                  <div className={`w-3 h-3 rounded-full mt-0.5 shrink-0 ${event.color}`} />
                  <div className="w-px flex-1 bg-gray-200 dark:bg-gray-700 mt-1" />
                </div>
                <div className="pb-3">
                  <p className="font-medium text-gray-800 dark:text-gray-200">{event.label}</p>
                  {event.date && <p className="text-xs text-gray-500">{new Date(event.date).toLocaleString('en-GB')}{event.by ? ` — ${event.by}` : ''}</p>}
                  {event.note && <p className="text-xs italic text-gray-600 dark:text-gray-400 mt-0.5">"{event.note}"</p>}
                </div>
              </div>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </>
  );
}
