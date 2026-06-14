import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest, getCsrfToken } from "@/lib/queryClient";
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
import {
  ClipboardList, Plus, Eye, CheckCircle2, XCircle, Clock, AlertTriangle,
  Flame, Zap, HardHat, Wind, Shovel, TriangleAlert, FileWarning,
  ChevronRight, ChevronDown, User, Calendar, MapPin, MoreVertical, RefreshCw, Pause, Play, Lock, Info,
  Shield, Upload, Trash2, RotateCcw, FileText, ExternalLink, Paperclip
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";

const PERMIT_TYPES: Record<string, { label: string; icon: any; color: string; bg: string; description: string }> = {
  hot_works:            { label: 'Hot Works',            icon: Flame,         color: 'text-orange-600', bg: 'bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-800',  description: 'Naked flames, welding, grinding or anything that generates heat or sparks.' },
  working_at_height:    { label: 'Working at Height',    icon: HardHat,       color: 'text-blue-600',   bg: 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800',         description: 'Any work where a person could fall a distance liable to cause injury.' },
  electrical_isolation: { label: 'Electrical Isolation', icon: Zap,           color: 'text-yellow-600', bg: 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800', description: 'Isolating or working on live or recently live electrical systems.' },
  confined_space:       { label: 'Confined Space',       icon: Wind,          color: 'text-purple-600', bg: 'bg-purple-50 dark:bg-purple-900/20 border-purple-200 dark:border-purple-800', description: 'Entry into or work inside an enclosed area with restricted access.' },
  excavation:           { label: 'Excavation',           icon: Shovel,        color: 'text-amber-700',  bg: 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800',     description: 'Digging, trenching or groundwork where collapse or buried services are a risk.' },
  asbestos:             { label: 'Asbestos',             icon: TriangleAlert, color: 'text-red-600',    bg: 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800',             description: 'Disturbing or working near materials that may contain asbestos.' },
  general_high_risk:    { label: 'General High Risk',    icon: FileWarning,   color: 'text-gray-600',   bg: 'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700',            description: 'Any other high-risk activity not covered by a specific permit type.' },
};

const STATUS_CONFIG: Record<string, { label: string; variant: 'default'|'secondary'|'outline'|'destructive'; color: string }> = {
  draft:      { label: 'Draft',        variant: 'secondary',    color: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300' },
  submitted:  { label: 'Pending Auth', variant: 'outline',      color: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300' },
  authorised: { label: 'Authorised',   variant: 'outline',      color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300' },
  active:     { label: 'Active',       variant: 'default',      color: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300' },
  suspended:  { label: 'Suspended',    variant: 'outline',      color: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300' },
  completed:  { label: 'Completed',    variant: 'secondary',    color: 'bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-300' },
  expired:    { label: 'Expired',      variant: 'destructive',  color: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300' },
  cancelled:  { label: 'Cancelled',    variant: 'secondary',    color: 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400' },
};

// Company compliance document types
const COMP_DOC_TYPES: Record<string, { label: string; group: 'legal' | 'site'; defaultTitle: string }> = {
  public_liability_insurance:    { label: 'Public Liability Insurance',    group: 'legal', defaultTitle: 'Public Liability Insurance' },
  employers_liability_insurance: { label: "Employers' Liability Insurance", group: 'legal', defaultTitle: "Employers' Liability Insurance" },
  health_safety_policy:          { label: 'Health & Safety Policy',        group: 'legal', defaultTitle: 'Health & Safety Policy' },
  other:                         { label: 'Other',                         group: 'site',  defaultTitle: '' },
};

const LEGAL_DOC_TYPES = ['public_liability_insurance', 'employers_liability_insurance', 'health_safety_policy'];

interface CompanyDoc {
  id: string;
  document_type: string;
  title: string;
  notes: string | null;
  file_url: string;
  file_name: string;
  expiry_date: string | null;
  status: string;
  uploaded_by_name: string | null;
  uploaded_at: string;
  replaced_at: string | null;
}

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
  workCompletedSatisfactorily: boolean | null;
  suspensionReason: string | null;
  suspendedAt: string | null;
  cancelledById: string | null;
  cancelledByName: string | null;
  cancelledAt: string | null;
  cancellationReason: string | null;
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

function docStatusBadge(status: string) {
  if (status === 'expired')
    return <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300">Expired</span>;
  if (status === 'expiring_soon')
    return <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">Expiring Soon</span>;
  return <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">Valid</span>;
}

function docStatusIcon(status: string, size = 'h-4 w-4') {
  if (status === 'expired')
    return <XCircle className={`${size} text-red-500`} />;
  if (status === 'expiring_soon')
    return <Clock className={`${size} text-amber-500`} />;
  return <CheckCircle2 className={`${size} text-emerald-500`} />;
}

export default function PermitToWork() {
  const { data: user } = useQuery<{ id: string; username: string; role?: string } | null>({
    queryKey: ['/api/auth/me'],
  });
  const { toast } = useToast();
  const qc = useQueryClient();
  const [pageSection, setPageSection] = useState<'permits' | 'compliance'>('permits');
  const [activeTab, setActiveTab] = useState('active');
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [viewPermitId, setViewPermitId] = useState<string | null>(null);
  const [actionDialogState, setActionDialogState] = useState<{ type: string; permitId: string; permitNumber: string } | null>(null);
  const [actionReason, setActionReason] = useState('');
  const [closeSatisfactory, setCloseSatisfactory] = useState(true);

  const { data: permits = [], isLoading } = useQuery<Permit[]>({
    queryKey: ['/api/ptw'],
  });

  const { data: permitDetail } = useQuery<PermitDetail>({
    queryKey: ['/api/ptw', viewPermitId],
    queryFn: async () => {
      const res = await apiRequest('GET', `/api/ptw/${viewPermitId}`);
      if (!res.ok) throw new Error('Failed to fetch permit');
      return res.json();
    },
    enabled: !!viewPermitId,
  });

  const { data: companyDocs = [] } = useQuery<CompanyDoc[]>({
    queryKey: ['/api/ptw/company-documents'],
  });

  const isManager = user?.role === 'admin' || user?.role === 'manager';

  const tab_filters: Record<string, (p: Permit) => boolean> = {
    active:     p => ['active', 'suspended'].includes(p.status),
    pending:    p => ['draft', 'submitted'].includes(p.status),
    authorised: p => p.status === 'authorised',
    history:    p => ['completed', 'expired', 'cancelled'].includes(p.status),
  };

  const filteredPermits = permits.filter(tab_filters[activeTab] || (() => true));

  const counts = {
    active:     permits.filter(tab_filters.active).length,
    pending:    permits.filter(tab_filters.pending).length,
    authorised: permits.filter(tab_filters.authorised).length,
    history:    permits.filter(tab_filters.history).length,
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
    if (type === 'close') { body.closureNotes = actionReason; body.workCompletedSatisfactorily = closeSatisfactory; }
    if (type === 'authorise') body.authNotes = actionReason;
    if (type === 'cancel') body.cancellationReason = actionReason;
    actionMutation.mutate({ type, permitId, body });
  };

  const ACTION_CONFIG: Record<string, { label: string; requiresReason: boolean; reasonLabel?: string; reasonRequired?: boolean; bg: string }> = {
    submit:    { label: 'Submit for Authorisation',    requiresReason: false, bg: 'bg-amber-600 hover:bg-amber-700' },
    authorise: { label: 'Authorise Permit',            requiresReason: true,  reasonLabel: 'Authorisation notes (optional)', reasonRequired: false, bg: 'bg-blue-600 hover:bg-blue-700' },
    reject:    { label: 'Reject Permit',               requiresReason: true,  reasonLabel: 'Rejection reason *', reasonRequired: true, bg: 'bg-red-600 hover:bg-red-700' },
    activate:  { label: 'Activate Permit (Start Work)', requiresReason: false, bg: 'bg-emerald-600 hover:bg-emerald-700' },
    suspend:   { label: 'Suspend Permit',              requiresReason: true,  reasonLabel: 'Reason for suspension *', reasonRequired: true, bg: 'bg-orange-600 hover:bg-orange-700' },
    resume:    { label: 'Resume Work',                 requiresReason: false, bg: 'bg-blue-600 hover:bg-blue-700' },
    close:     { label: 'Close & Complete Permit',     requiresReason: true,  reasonLabel: 'Closure notes (optional)', reasonRequired: false, bg: 'bg-teal-600 hover:bg-teal-700' },
    cancel:    { label: 'Cancel Permit',               requiresReason: true,  reasonLabel: 'Reason for cancellation *', reasonRequired: true, bg: 'bg-gray-600 hover:bg-gray-700' },
  };

  const expiredDocCount = companyDocs.filter(d => d.status === 'expired').length;
  const expiringSoonDocCount = companyDocs.filter(d => d.status === 'expiring_soon').length;

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
        {pageSection === 'permits' && (
          <Button onClick={() => setShowCreateDialog(true)}>
            <Plus className="h-4 w-4 mr-1.5" /> New Permit
          </Button>
        )}
      </div>

      {/* Page-level section tabs */}
      <div className="flex gap-1 border-b dark:border-gray-700 -mb-2">
        <button
          onClick={() => setPageSection('permits')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${pageSection === 'permits' ? 'border-orange-500 text-orange-600 dark:text-orange-400' : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'}`}
        >
          <span className="flex items-center gap-1.5"><ClipboardList className="h-4 w-4" />Permits</span>
        </button>
        <button
          onClick={() => setPageSection('compliance')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors relative ${pageSection === 'compliance' ? 'border-orange-500 text-orange-600 dark:text-orange-400' : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'}`}
        >
          <span className="flex items-center gap-1.5">
            <Shield className="h-4 w-4" />Compliance
            {expiredDocCount > 0 && (
              <span className="bg-red-500 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center font-bold leading-none">{expiredDocCount}</span>
            )}
            {expiredDocCount === 0 && expiringSoonDocCount > 0 && (
              <span className="bg-amber-500 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center font-bold leading-none">{expiringSoonDocCount}</span>
            )}
          </span>
        </button>
      </div>

      {/* ── Permits section ─────────────────────────────────────────────────── */}
      {pageSection === 'permits' && (
        <>
          {/* Status chips */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {([
              { key: 'active',     label: 'Active / Suspended', icon: Play,         bg: 'bg-emerald-50 dark:bg-emerald-900/20', text: 'text-emerald-700 dark:text-emerald-300' },
              { key: 'pending',    label: 'Draft / Pending',    icon: Clock,        bg: 'bg-amber-50 dark:bg-amber-900/20',    text: 'text-amber-700 dark:text-amber-300' },
              { key: 'authorised', label: 'Authorised',         icon: CheckCircle2, bg: 'bg-blue-50 dark:bg-blue-900/20',      text: 'text-blue-700 dark:text-blue-300' },
              { key: 'history',    label: 'History',            icon: ClipboardList,bg: 'bg-gray-50 dark:bg-gray-800',         text: 'text-gray-700 dark:text-gray-300' },
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
            <Card variant="glass" className="border-dashed">
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
                  <Card variant="glass" key={permit.id} className="hover:shadow-md transition-shadow cursor-pointer" onClick={() => setViewPermitId(permit.id)}>
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-3 min-w-0">
                          <div className="p-2 rounded-lg bg-gray-100 dark:bg-gray-800 shrink-0">
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
                                  <DropdownMenuItem className="text-red-600" onClick={() => setActionDialogState({ type: 'cancel', permitId: permit.id, permitNumber: permit.permitNumber })}>
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
        </>
      )}

      {/* ── Compliance section ───────────────────────────────────────────────── */}
      {pageSection === 'compliance' && (
        <ComplianceLibrary companyDocs={companyDocs} isManager={isManager} onRefresh={() => qc.invalidateQueries({ queryKey: ['/api/ptw/company-documents'] })} />
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
            onGoToCompliance={() => { setShowCreateDialog(false); setPageSection('compliance'); }}
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
              companyDocs={companyDocs}
              onAction={(type) => setActionDialogState({ type, permitId: permitDetail.id, permitNumber: permitDetail.permitNumber })}
              onChecklistUpdate={(checklistItemId, response, notes) =>
                checklistMutation.mutate({ permitId: permitDetail.id, checklistItemId, response, notes })
              }
              onQuickAction={(type) => actionMutation.mutate({ type, permitId: permitDetail.id, body: {} })}
              onGoToCompliance={() => { setViewPermitId(null); setPageSection('compliance'); }}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Action Confirm Dialog */}
      <Dialog open={!!actionDialogState} onOpenChange={open => { if (!open) { setActionDialogState(null); setActionReason(''); setCloseSatisfactory(true); }}}>
        <DialogContent className="max-w-md">
          {actionDialogState && (
            <>
              <DialogHeader>
                <DialogTitle>{ACTION_CONFIG[actionDialogState.type]?.label}</DialogTitle>
              </DialogHeader>
              <p className="text-sm text-gray-600 dark:text-gray-300">
                Permit: <strong>{actionDialogState.permitNumber}</strong>
              </p>
              {actionDialogState.type === 'close' && (
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Was the work completed satisfactorily? *</Label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setCloseSatisfactory(true)}
                      className={`flex-1 py-2 rounded-md text-sm font-medium border transition-colors ${closeSatisfactory ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:border-emerald-400'}`}
                    >
                      ✓ Yes
                    </button>
                    <button
                      type="button"
                      onClick={() => setCloseSatisfactory(false)}
                      className={`flex-1 py-2 rounded-md text-sm font-medium border transition-colors ${!closeSatisfactory ? 'bg-red-600 text-white border-red-600' : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:border-red-400'}`}
                    >
                      ✗ No
                    </button>
                  </div>
                </div>
              )}
              {ACTION_CONFIG[actionDialogState.type]?.requiresReason && (
                <div>
                  <Label>
                    {actionDialogState.type === 'close' && !closeSatisfactory
                      ? 'Closure notes — explain why work was unsatisfactory *'
                      : ACTION_CONFIG[actionDialogState.type].reasonLabel}
                  </Label>
                  <Textarea
                    rows={3}
                    value={actionReason}
                    onChange={e => setActionReason(e.target.value)}
                    placeholder={`Enter ${ACTION_CONFIG[actionDialogState.type].reasonLabel?.toLowerCase() || 'notes'}…`}
                  />
                </div>
              )}
              <DialogFooter>
                <Button variant="outline" onClick={() => { setActionDialogState(null); setActionReason(''); setCloseSatisfactory(true); }}>Cancel</Button>
                <Button
                  className={ACTION_CONFIG[actionDialogState.type]?.bg || ''}
                  onClick={handleActionConfirm}
                  disabled={
                    actionMutation.isPending ||
                    (ACTION_CONFIG[actionDialogState.type]?.reasonRequired && !actionReason.trim()) ||
                    (actionDialogState.type === 'close' && !closeSatisfactory && !actionReason.trim())
                  }
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

// ─── Compliance Library ───────────────────────────────────────────────────────

function ComplianceLibrary({ companyDocs, isManager, onRefresh }: {
  companyDocs: CompanyDoc[];
  isManager: boolean;
  onRefresh: () => void;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [uploadDialog, setUploadDialog] = useState<{ open: boolean; replaceDoc?: CompanyDoc } | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<CompanyDoc | null>(null);
  const [form, setForm] = useState({ documentType: '', title: '', notes: '', expiryDate: '' });
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  function getcsrfToken(): string {
    const c = document.cookie.split(';').find(c => c.trim().startsWith('csrf-token='));
    return c ? decodeURIComponent(c.split('=')[1]) : '';
  }

  const uploadMutation = useMutation({
    mutationFn: async (data: FormData) => {
      const isReplace = !!uploadDialog?.replaceDoc;
      const url = isReplace
        ? `/api/ptw/company-documents/${uploadDialog!.replaceDoc!.id}/replace`
        : '/api/ptw/company-documents';
      const method = isReplace ? 'PATCH' : 'POST';
      const csrfToken = getcsrfToken();
      const res = await fetch(url, {
        method,
        credentials: 'include',
        headers: { 'x-csrf-token': csrfToken },
        body: data,
      });
      if (!res.ok) { const j = await res.json(); throw new Error(j.error || 'Upload failed'); }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: uploadDialog?.replaceDoc ? 'Document replaced successfully.' : 'Document uploaded successfully.' });
      qc.invalidateQueries({ queryKey: ['/api/ptw/company-documents'] });
      setUploadDialog(null);
      setForm({ documentType: '', title: '', notes: '', expiryDate: '' });
      setFile(null);
    },
    onError: (e: any) => toast({ title: e.message || 'Upload failed', variant: 'destructive' }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (docId: string) => {
      const res = await apiRequest('DELETE', `/api/ptw/company-documents/${docId}`);
      return res;
    },
    onSuccess: () => {
      toast({ title: 'Document deleted.' });
      qc.invalidateQueries({ queryKey: ['/api/ptw/company-documents'] });
      setDeleteConfirm(null);
    },
    onError: (e: any) => toast({ title: e.message || 'Delete failed', variant: 'destructive' }),
  });

  const handleSubmit = () => {
    const isReplace = !!uploadDialog?.replaceDoc;
    if (!isReplace && !form.documentType) { toast({ title: 'Please select a document type.', variant: 'destructive' }); return; }
    const titleFinal = form.title || (form.documentType && COMP_DOC_TYPES[form.documentType]?.defaultTitle) || '';
    if (!isReplace && !titleFinal) { toast({ title: 'Please enter a title.', variant: 'destructive' }); return; }
    if (!file && !isReplace) { toast({ title: 'Please select a file.', variant: 'destructive' }); return; }
    const fd = new FormData();
    if (!isReplace) { fd.append('documentType', form.documentType); fd.append('title', titleFinal); }
    if (form.notes) fd.append('notes', form.notes);
    if (form.expiryDate) fd.append('expiryDate', form.expiryDate);
    if (file) fd.append('file', file);
    uploadMutation.mutate(fd);
  };

  const openUpload = (replaceDoc?: CompanyDoc) => {
    setForm({
      documentType: replaceDoc?.document_type || '',
      title: replaceDoc?.title || '',
      notes: replaceDoc?.notes || '',
      expiryDate: replaceDoc?.expiry_date || '',
    });
    setFile(null);
    setUploadDialog({ open: true, replaceDoc });
  };

  const legalDocs = LEGAL_DOC_TYPES.map(type => ({
    type,
    uploaded: companyDocs.find(d => d.document_type === type) || null,
  }));
  const otherDocs = companyDocs.filter(d => d.document_type === 'other');

  const totalExpired = companyDocs.filter(d => d.status === 'expired').length;
  const totalExpiring = companyDocs.filter(d => d.status === 'expiring_soon').length;
  const totalValid = companyDocs.filter(d => d.status === 'valid').length;

  return (
    <div className="space-y-6">
      {/* Summary row */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-1.5 text-sm text-emerald-700 dark:text-emerald-400">
          <CheckCircle2 className="h-4 w-4" /> {totalValid} valid
        </div>
        {totalExpiring > 0 && (
          <div className="flex items-center gap-1.5 text-sm text-amber-600 dark:text-amber-400">
            <Clock className="h-4 w-4" /> {totalExpiring} expiring soon
          </div>
        )}
        {totalExpired > 0 && (
          <div className="flex items-center gap-1.5 text-sm text-red-600 dark:text-red-400">
            <XCircle className="h-4 w-4" /> {totalExpired} expired
          </div>
        )}
        {isManager && (
          <Button size="sm" className="ml-auto" onClick={() => openUpload()}>
            <Upload className="h-4 w-4 mr-1.5" /> Upload Document
          </Button>
        )}
      </div>

      {/* Legally Required group */}
      <div>
        <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
          <Shield className="h-3.5 w-3.5" /> Legally Required
        </h3>
        <div className="space-y-3">
          {legalDocs.map(({ type, uploaded }) => {
            const typeInfo = COMP_DOC_TYPES[type];
            if (!uploaded) {
              return (
                <Card variant="glass" key={type} className="border-dashed border-amber-200 dark:border-amber-800/40 bg-amber-50/50 dark:bg-amber-900/10">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-amber-100 dark:bg-amber-900/30">
                          <FileText className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                        </div>
                        <div>
                          <p className="font-medium text-sm text-gray-900 dark:text-white">{typeInfo.label}</p>
                          <p className="text-xs text-amber-600 dark:text-amber-400 mt-0.5">Not uploaded — required for PTW compliance</p>
                        </div>
                      </div>
                      {isManager && (
                        <Button size="sm" variant="outline" className="border-amber-300 text-amber-700 hover:bg-amber-50 dark:border-amber-700 dark:text-amber-400 shrink-0" onClick={() => openUpload()}>
                          <Upload className="h-3.5 w-3.5 mr-1" /> Upload
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            }
            return (
              <ComplianceDocCard key={type} doc={uploaded} isManager={isManager} onReplace={() => openUpload(uploaded)} onDelete={() => setDeleteConfirm(uploaded)} />
            );
          })}
        </div>
      </div>

      {/* Site Required group */}
      {(otherDocs.length > 0 || isManager) && (
        <div>
          <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
            <FileText className="h-3.5 w-3.5" /> Site Required / Other
          </h3>
          {otherDocs.length === 0 ? (
            <p className="text-sm text-gray-400 dark:text-gray-500 italic">No additional documents uploaded.</p>
          ) : (
            <div className="space-y-3">
              {otherDocs.map(doc => (
                <ComplianceDocCard key={doc.id} doc={doc} isManager={isManager} onReplace={() => openUpload(doc)} onDelete={() => setDeleteConfirm(doc)} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Upload / Replace Dialog */}
      <Dialog open={!!uploadDialog?.open} onOpenChange={open => !open && setUploadDialog(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{uploadDialog?.replaceDoc ? 'Replace Document' : 'Upload Compliance Document'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {!uploadDialog?.replaceDoc && (
              <div>
                <Label>Document type *</Label>
                <Select value={form.documentType} onValueChange={v => {
                  const dt = COMP_DOC_TYPES[v];
                  setForm(f => ({ ...f, documentType: v, title: dt?.defaultTitle || '' }));
                }}>
                  <SelectTrigger><SelectValue placeholder="Select type…" /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(COMP_DOC_TYPES).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {(!uploadDialog?.replaceDoc && form.documentType === 'other') && (
              <div>
                <Label>Title *</Label>
                <Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. Site-Specific Risk Assessment" />
              </div>
            )}
            <div>
              <Label>Expiry date</Label>
              <Input type="date" value={form.expiryDate} onChange={e => setForm(f => ({ ...f, expiryDate: e.target.value }))} />
            </div>
            <div>
              <Label>Notes / coverage amount</Label>
              <Textarea rows={2} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="e.g. Minimum £5m public liability cover" />
            </div>
            <div>
              <Label>{uploadDialog?.replaceDoc ? 'New file (leave blank to keep current)' : 'File *'}</Label>
              <div
                className="mt-1 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-lg p-4 text-center cursor-pointer hover:border-orange-400 transition-colors"
                onClick={() => fileRef.current?.click()}
              >
                {file ? (
                  <div className="flex items-center justify-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                    <FileText className="h-4 w-4 text-orange-500" />
                    <span className="truncate max-w-[200px]">{file.name}</span>
                    <span className="text-gray-400">({(file.size / 1024).toFixed(0)} KB)</span>
                  </div>
                ) : (
                  <div className="text-sm text-gray-400">
                    <Upload className="h-6 w-6 mx-auto mb-1 text-gray-300" />
                    Click to select file (PDF, JPG, PNG — max 20 MB)
                  </div>
                )}
              </div>
              <input ref={fileRef} type="file" className="hidden" accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                onChange={e => setFile(e.target.files?.[0] || null)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUploadDialog(null)}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={uploadMutation.isPending}>
              {uploadMutation.isPending ? 'Uploading…' : uploadDialog?.replaceDoc ? 'Replace Document' : 'Upload Document'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <Dialog open={!!deleteConfirm} onOpenChange={open => !open && setDeleteConfirm(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete document?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-600 dark:text-gray-300">
            This will permanently remove <strong>{deleteConfirm?.title}</strong> from the compliance library.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirm(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => deleteConfirm && deleteMutation.mutate(deleteConfirm.id)} disabled={deleteMutation.isPending}>
              {deleteMutation.isPending ? 'Deleting…' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ComplianceDocCard({ doc, isManager, onReplace, onDelete }: {
  doc: CompanyDoc; isManager: boolean; onReplace: () => void; onDelete: () => void;
}) {
  const typeInfo = COMP_DOC_TYPES[doc.document_type];
  return (
    <Card variant="glass" className={doc.status === 'expired' ? 'border-red-200 dark:border-red-800/40' : doc.status === 'expiring_soon' ? 'border-amber-200 dark:border-amber-800/40' : ''}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <div className={`p-2 rounded-lg shrink-0 ${doc.status === 'expired' ? 'bg-red-100 dark:bg-red-900/30' : doc.status === 'expiring_soon' ? 'bg-amber-100 dark:bg-amber-900/30' : 'bg-emerald-100 dark:bg-emerald-900/30'}`}>
              <FileText className={`h-4 w-4 ${doc.status === 'expired' ? 'text-red-600 dark:text-red-400' : doc.status === 'expiring_soon' ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'}`} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="font-medium text-sm text-gray-900 dark:text-white">{doc.title}</p>
                {docStatusBadge(doc.status)}
              </div>
              {typeInfo && typeInfo.label !== doc.title && (
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{typeInfo.label}</p>
              )}
              <div className="flex items-center gap-3 mt-1 text-xs text-gray-400 dark:text-gray-500 flex-wrap">
                <span className="flex items-center gap-1">
                  <FileText className="h-3 w-3" />
                  <a href={doc.file_url} target="_blank" rel="noopener noreferrer" className="hover:underline text-blue-500 truncate max-w-[160px]" onClick={e => e.stopPropagation()}>
                    {doc.file_name}
                  </a>
                </span>
                {doc.expiry_date && (
                  <span className={`flex items-center gap-1 ${doc.status === 'expired' ? 'text-red-500 dark:text-red-400' : doc.status === 'expiring_soon' ? 'text-amber-600 dark:text-amber-400' : ''}`}>
                    <Calendar className="h-3 w-3" /> Expires {new Date(doc.expiry_date).toLocaleDateString('en-GB')}
                  </span>
                )}
                {doc.uploaded_by_name && <span>Uploaded by {doc.uploaded_by_name}</span>}
                {doc.replaced_at && <span>Last replaced {new Date(doc.replaced_at).toLocaleDateString('en-GB')}</span>}
              </div>
              {doc.notes && <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 italic">{doc.notes}</p>}
            </div>
          </div>
          {isManager && (
            <div className="flex items-center gap-1 shrink-0">
              <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={onReplace}>
                <RotateCcw className="h-3.5 w-3.5 mr-1" /> Replace
              </Button>
              <Button size="sm" variant="ghost" className="h-7 px-2 text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20" onClick={onDelete}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Create Permit Form ───────────────────────────────────────────────────────

function CreatePermitForm({ onSuccess, onCancel, onGoToCompliance }: {
  onSuccess: (id: string) => void;
  onCancel: () => void;
  onGoToCompliance: () => void;
}) {
  const { toast } = useToast();
  const today = new Date().toISOString().slice(0, 10);

  const [form, setForm] = useState({
    permitType: '', workDescription: '', workLocation: '',
    plannedStartDate: '', plannedStartTime: '08:00',
    plannedEndDate: '', plannedEndTime: '17:00',
  });
  const [assigneeMode, setAssigneeMode] = useState<'contractor' | 'staff'>('contractor');
  const [selectedWorker, setSelectedWorker] = useState<any>(null);
  const [selectedStaff, setSelectedStaff] = useState<any>(null);
  const [workerSearch, setWorkerSearch] = useState('');
  const [staffSearch, setStaffSearch] = useState('');
  const [pastStartWarning, setPastStartWarning] = useState(false);

  const { data: staffList = [] } = useQuery<any[]>({ queryKey: ['/api/staff'] });
  const { data: contractorWorkers = [] } = useQuery<any[]>({
    queryKey: ['/api/contractors/workers/all'],
    queryFn: () => apiRequest('GET', '/api/contractors/workers/all').then(r => r.json()),
  });
  const { data: companyDocs = [] } = useQuery<CompanyDoc[]>({ queryKey: ['/api/ptw/company-documents'] });

  const mutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest('POST', '/api/ptw', data);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to create permit');
      return json;
    },
    onSuccess: (data: any) => onSuccess(data.id),
    onError: (e: any) => toast({ title: e?.message || 'Failed to create permit', variant: 'destructive' }),
  });

  // Compliance warning — only relevant when a contractor is selected
  const legalCompanyDocs = companyDocs.filter(d => LEGAL_DOC_TYPES.includes(d.document_type));
  const expiredDocs = legalCompanyDocs.filter(d => d.status === 'expired');
  const expiringSoonDocs = legalCompanyDocs.filter(d => d.status === 'expiring_soon');
  const showComplianceWarning = assigneeMode === 'contractor' && !!selectedWorker && (expiredDocs.length > 0 || expiringSoonDocs.length > 0);

  const handleStartDateChange = (v: string) => {
    setForm(f => ({ ...f, plannedStartDate: v }));
    const picked = new Date(`${v}T${form.plannedStartTime}:00`);
    setPastStartWarning(v < today || picked < new Date());
  };

  const handleSubmit = () => {
    const { permitType, workDescription, workLocation, plannedStartDate, plannedStartTime, plannedEndDate, plannedEndTime } = form;

    if (!permitType || !workDescription || !workLocation || !plannedStartDate || !plannedEndDate) {
      toast({ title: 'Please fill in all required fields.', variant: 'destructive' }); return;
    }

    if (assigneeMode === 'contractor' && !selectedWorker) {
      toast({ title: 'Please assign a contractor worker to this permit.', variant: 'destructive' }); return;
    }
    if (assigneeMode === 'staff' && !selectedStaff) {
      toast({ title: 'Please assign a staff member to this permit.', variant: 'destructive' }); return;
    }

    const start = new Date(`${plannedStartDate}T${plannedStartTime}:00`);
    const end = new Date(`${plannedEndDate}T${plannedEndTime}:00`);
    if (end <= start) {
      toast({ title: 'End must be after start', description: 'Please check your start and end dates.', variant: 'destructive' }); return;
    }

    const payload = {
      permitType, workDescription, workLocation,
      plannedStartDate, plannedStartTime, plannedEndDate, plannedEndTime,
      ...(assigneeMode === 'contractor' ? {
        contractorWorkerId: selectedWorker.id,
        contractorWorkerName: `${selectedWorker.firstName} ${selectedWorker.lastName}`,
        contractorCompanyName: selectedWorker.companyName || null,
        contractorCompanyId: null,
        staffId: null,
        staffName: null,
      } : {
        contractorWorkerId: null,
        contractorWorkerName: null,
        contractorCompanyName: null,
        contractorCompanyId: null,
        staffId: selectedStaff.id,
        staffName: `${selectedStaff.firstName} ${selectedStaff.lastName}`,
      }),
    };
    mutation.mutate(payload);
  };

  const selectedPt = form.permitType ? PERMIT_TYPES[form.permitType] : null;

  const filteredWorkers = (contractorWorkers as any[]).filter(w => {
    const name = `${w.firstName} ${w.lastName} ${w.companyName || ''}`.toLowerCase();
    return !workerSearch || name.includes(workerSearch.toLowerCase());
  });
  const filteredStaff = (staffList as any[]).filter(s => {
    const name = `${s.firstName} ${s.lastName}`.toLowerCase();
    return !staffSearch || name.includes(staffSearch.toLowerCase());
  });

  return (
    <div className="space-y-5">
      {/* Compliance warning — contractor only */}
      {showComplianceWarning && (
        <div className={`rounded-lg border p-3 text-sm flex items-start gap-2.5 ${expiredDocs.length > 0 ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800/40 text-red-700 dark:text-red-300' : 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800/40 text-amber-700 dark:text-amber-300'}`}>
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <div>
            <span className="font-medium">
              {expiredDocs.length > 0 ? `${expiredDocs.length} company compliance document${expiredDocs.length > 1 ? 's' : ''} expired` : ''}
              {expiredDocs.length > 0 && expiringSoonDocs.length > 0 ? ', ' : ''}
              {expiringSoonDocs.length > 0 ? `${expiringSoonDocs.length} expiring soon` : ''}
            </span>
            {' — '}
            <button className="underline font-medium" onClick={onGoToCompliance}>view in Compliance tab</button>
            <p className="text-xs mt-0.5 opacity-80">You can still create this permit, but compliance documents should be renewed before work begins.</p>
          </div>
        </div>
      )}

      {/* ── 1. Permit type tiles ── */}
      <div>
        <Label className="text-sm font-medium mb-2 block">Permit type *</Label>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {Object.entries(PERMIT_TYPES).map(([k, pt]) => {
            const PtIcon = pt.icon;
            const selected = form.permitType === k;
            return (
              <button
                key={k}
                type="button"
                onClick={() => setForm(f => ({ ...f, permitType: k }))}
                className={`flex flex-col items-start gap-1.5 p-3 rounded-lg border-2 text-left transition-all ${selected ? `${pt.bg} border-current ${pt.color} ring-2 ring-offset-1 ring-current` : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 bg-white dark:bg-gray-800'}`}
              >
                <PtIcon className={`h-5 w-5 ${selected ? pt.color : 'text-gray-400'}`} />
                <span className={`text-xs font-semibold leading-tight ${selected ? pt.color : 'text-gray-700 dark:text-gray-300'}`}>{pt.label}</span>
              </button>
            );
          })}
        </div>
        {selectedPt && (
          <p className="mt-2 text-xs text-muted-foreground flex items-start gap-1.5">
            <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />{selectedPt.description}
          </p>
        )}
      </div>

      {/* ── 2. Work details ── */}
      <div>
        <Label>Work description *</Label>
        <Textarea rows={2} value={form.workDescription} onChange={e => setForm(f => ({ ...f, workDescription: e.target.value }))} placeholder="Describe the work to be carried out…" />
      </div>
      <div>
        <Label>Work location *</Label>
        <Input value={form.workLocation} onChange={e => setForm(f => ({ ...f, workLocation: e.target.value }))} placeholder="e.g. Roof Level 3, Boiler Room B" />
      </div>

      {/* ── 3. Dates ── */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Start date *</Label>
          <Input type="date" min={today} value={form.plannedStartDate} onChange={e => handleStartDateChange(e.target.value)} />
        </div>
        <div>
          <Label>Start time</Label>
          <Input type="time" value={form.plannedStartTime} onChange={e => setForm(f => ({ ...f, plannedStartTime: e.target.value }))} />
        </div>
        <div>
          <Label>End date *</Label>
          <Input type="date" min={form.plannedStartDate || today} value={form.plannedEndDate} onChange={e => setForm(f => ({ ...f, plannedEndDate: e.target.value }))} />
        </div>
        <div>
          <Label>End time</Label>
          <Input type="time" value={form.plannedEndTime} onChange={e => setForm(f => ({ ...f, plannedEndTime: e.target.value }))} />
        </div>
      </div>
      {pastStartWarning && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300 text-xs">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>This start date/time is in the past. The permit can still be created, but it cannot be activated until the start window is current or future.</span>
        </div>
      )}

      {/* ── 4. Who's doing the work ── */}
      <div>
        <Label className="text-sm font-medium block mb-2">Who's doing the work? *</Label>
        <div className="flex rounded-lg border overflow-hidden mb-3">
          <button
            type="button"
            onClick={() => setAssigneeMode('contractor')}
            className={`flex-1 py-2 text-sm font-medium transition-colors ${assigneeMode === 'contractor' ? 'bg-blue-600 text-white' : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'}`}
          >
            Contractor
          </button>
          <button
            type="button"
            onClick={() => setAssigneeMode('staff')}
            className={`flex-1 py-2 text-sm font-medium transition-colors border-l ${assigneeMode === 'staff' ? 'bg-blue-600 text-white' : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'}`}
          >
            Staff member
          </button>
        </div>

        {assigneeMode === 'contractor' ? (
          <div>
            {selectedWorker ? (
              <div className="flex items-center justify-between p-3 rounded-lg border bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800">
                <div>
                  <p className="font-medium text-sm">{selectedWorker.firstName} {selectedWorker.lastName}</p>
                  {selectedWorker.companyName && <p className="text-xs text-muted-foreground">{selectedWorker.companyName}</p>}
                </div>
                <button type="button" onClick={() => setSelectedWorker(null)} className="text-xs text-gray-500 hover:text-red-600 underline">Change</button>
              </div>
            ) : (
              <Select
                value=""
                onValueChange={v => {
                  const w = (contractorWorkers as any[]).find(w => w.id === v);
                  if (w) setSelectedWorker(w);
                }}
              >
                <SelectTrigger><SelectValue placeholder="Select contractor worker…" /></SelectTrigger>
                <SelectContent>
                  <div className="px-2 py-1.5">
                    <Input
                      placeholder="Search by name or company…"
                      value={workerSearch}
                      onChange={e => setWorkerSearch(e.target.value)}
                      className="h-8 text-sm"
                      onKeyDown={e => e.stopPropagation()}
                    />
                  </div>
                  {filteredWorkers.length === 0 && (
                    <div className="px-3 py-2 text-xs text-muted-foreground">No contractor workers found</div>
                  )}
                  {filteredWorkers.map(w => (
                    <SelectItem key={w.id} value={w.id}>
                      <span className="font-medium">{w.firstName} {w.lastName}</span>
                      {w.companyName && <span className="text-muted-foreground ml-1 text-xs">— {w.companyName}</span>}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        ) : (
          <div>
            {selectedStaff ? (
              <div className="flex items-center justify-between p-3 rounded-lg border bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800">
                <div>
                  <p className="font-medium text-sm">{selectedStaff.firstName} {selectedStaff.lastName}</p>
                  {selectedStaff.jobTitle && <p className="text-xs text-muted-foreground">{selectedStaff.jobTitle}</p>}
                </div>
                <button type="button" onClick={() => setSelectedStaff(null)} className="text-xs text-gray-500 hover:text-red-600 underline">Change</button>
              </div>
            ) : (
              <Select
                value=""
                onValueChange={v => {
                  const s = (staffList as any[]).find(s => s.id === v);
                  if (s) setSelectedStaff(s);
                }}
              >
                <SelectTrigger><SelectValue placeholder="Select staff member…" /></SelectTrigger>
                <SelectContent>
                  <div className="px-2 py-1.5">
                    <Input
                      placeholder="Search staff…"
                      value={staffSearch}
                      onChange={e => setStaffSearch(e.target.value)}
                      className="h-8 text-sm"
                      onKeyDown={e => e.stopPropagation()}
                    />
                  </div>
                  {filteredStaff.map(s => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.firstName} {s.lastName}
                      {s.jobTitle && <span className="text-muted-foreground ml-1 text-xs">— {s.jobTitle}</span>}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        )}
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
  permit, isManager, currentUserId, companyDocs, onAction, onChecklistUpdate, onQuickAction, onGoToCompliance,
}: {
  permit: PermitDetail;
  isManager: boolean;
  currentUserId?: string;
  companyDocs: CompanyDoc[];
  onAction: (type: string) => void;
  onChecklistUpdate: (id: string, response: string, notes?: string) => void;
  onQuickAction: (type: string) => void;
  onGoToCompliance: () => void;
}) {
  const pt = PERMIT_TYPES[permit.permitType] || PERMIT_TYPES.general_high_risk;
  const sc = STATUS_CONFIG[permit.status] || STATUS_CONFIG.draft;
  const PtIcon = pt.icon;
  const [activeTab, setActiveTab] = useState('details');
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());
  const [pendingNotes, setPendingNotes] = useState<Record<string, string>>({});
  const [attachUploading, setAttachUploading] = useState(false);
  const attachFileRef = useRef<HTMLInputElement>(null);
  const { toast: attachToast } = useToast();
  const qcInner = useQueryClient();

  const regenerateChecklistMutation = useMutation({
    mutationFn: () => apiRequest('POST', `/api/ptw/${permit.id}/checklist/regenerate`),
    onSuccess: () => {
      qcInner.invalidateQueries({ queryKey: ['/api/ptw', permit.id] });
      attachToast({ title: 'Checklist generated', description: 'Safety checklist items have been added to this permit.' });
    },
    onError: (err: any) => {
      attachToast({ title: 'Failed to generate checklist', description: err?.message || 'Please try again.', variant: 'destructive' });
    },
  });

  const checklist = permit.checklist || [];
  const sections: Record<string, ChecklistItem[]> = {};
  for (const item of checklist) {
    if (!sections[item.checklistSection]) sections[item.checklistSection] = [];
    sections[item.checklistSection].push(item);
  }

  const requiredItems = checklist.filter(i => i.isRequired);
  const noNoteCount = checklist.filter(i => i.response === 'no' && !i.notes && !pendingNotes[i.id]).length;
  const checklistComplete = requiredItems.length === 0 || (
    requiredItems.every(i => !!i.response) && noNoteCount === 0
  );
  const completedCount = requiredItems.filter(i =>
    !!i.response && !(i.response === 'no' && !i.notes && !pendingNotes[i.id])
  ).length;

  const canEdit = permit.status === 'draft' || permit.status === 'submitted';
  const isSameUserAsCreator = permit.createdById === currentUserId;

  // Compliance summary — legally-required docs for this permit
  const complianceSummary = LEGAL_DOC_TYPES.map(type => {
    const doc = companyDocs.find(d => d.document_type === type);
    return { type, label: COMP_DOC_TYPES[type].label, doc };
  });
  const hasComplianceIssues = complianceSummary.some(c => !c.doc || c.doc.status !== 'valid');

  return (
    <>
      <DialogHeader>
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-lg bg-gray-100 dark:bg-gray-800 shrink-0">
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
            Checklist {checklist.length > 0 && (
              <span className={`ml-1 text-xs px-1.5 rounded-full ${checklistComplete ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                {completedCount}/{requiredItems.length}
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
            {permit.contractorWorkerName && (
              <>
                <div className="text-gray-500 dark:text-gray-400">Contractor</div>
                <div className="font-medium">
                  {permit.contractorWorkerName}
                  {permit.contractorCompanyName ? ` — ${permit.contractorCompanyName}` : ''}
                </div>
              </>
            )}
            {permit.staffName && (
              <>
                <div className="text-gray-500 dark:text-gray-400">Staff member</div>
                <div className="font-medium">{permit.staffName}</div>
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

          {/* Supporting documents */}
          {(() => {
            const attachments: any[] = permit.attachments || [];

            const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
              const file = e.target.files?.[0];
              if (!file) return;
              setAttachUploading(true);
              try {
                const fd = new FormData();
                fd.append('file', file);
                fd.append('documentType', 'other');
                const res = await fetch(`/api/ptw/${permit.id}/attachments`, {
                  method: 'POST',
                  body: fd,
                  credentials: 'include',
                  headers: { 'x-csrf-token': getCsrfToken() ?? '' },
                });
                if (!res.ok) throw new Error('Upload failed');
                qcInner.invalidateQueries({ queryKey: ['/api/ptw', permit.id] });
                attachToast({ title: 'Document attached successfully.' });
              } catch {
                attachToast({ title: 'Failed to upload document', variant: 'destructive' });
              } finally {
                setAttachUploading(false);
                e.target.value = '';
              }
            };

            return (
              <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/30 p-3">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider flex items-center gap-1.5">
                    <Paperclip className="h-3.5 w-3.5" /> Supporting Documents
                  </h4>
                  {canEdit && (
                    <label className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 cursor-pointer font-medium">
                      <Upload className="h-3.5 w-3.5" />
                      {attachUploading ? 'Uploading…' : 'Attach file'}
                      <input ref={attachFileRef} type="file" className="hidden" onChange={handleFileChange} disabled={attachUploading} />
                    </label>
                  )}
                </div>
                {attachments.length === 0 ? (
                  <p className="text-xs text-gray-400 italic">No documents attached — add RAMS, method statements or isolation certificates here.</p>
                ) : (
                  <ul className="space-y-1.5">
                    {attachments.map((att: any) => (
                      <li key={att.id} className="flex items-center gap-2 text-xs">
                        <FileText className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                        <a href={att.fileUrl.startsWith('/objects') ? att.fileUrl : `/objects${att.fileUrl}`} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline truncate flex-1">
                          {att.fileName}
                        </a>
                        {att.uploadedByName && <span className="text-gray-400 shrink-0">— {att.uploadedByName}</span>}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })()}

          {/* Company compliance section */}
          <div className={`rounded-lg border p-3 ${hasComplianceIssues ? 'border-amber-200 dark:border-amber-800/40 bg-amber-50/50 dark:bg-amber-900/10' : 'border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/30'}`}>
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider flex items-center gap-1.5">
                <Shield className="h-3.5 w-3.5" /> Company Compliance
              </h4>
              <button className="text-xs text-blue-500 hover:underline flex items-center gap-0.5" onClick={onGoToCompliance}>
                Manage <ExternalLink className="h-3 w-3" />
              </button>
            </div>
            <div className="space-y-1.5">
              {complianceSummary.map(({ type, label, doc }) => (
                <div key={type} className="flex items-center justify-between text-xs">
                  <span className="text-gray-600 dark:text-gray-300">{label}</span>
                  <div className="flex items-center gap-1.5">
                    {doc ? (
                      <>
                        {docStatusIcon(doc.status, 'h-3.5 w-3.5')}
                        <span className={doc.status === 'expired' ? 'text-red-600 dark:text-red-400' : doc.status === 'expiring_soon' ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'}>
                          {doc.status === 'expired' ? 'Expired' : doc.status === 'expiring_soon' ? 'Expiring soon' : 'Valid'}
                          {doc.expiry_date && ` (${new Date(doc.expiry_date).toLocaleDateString('en-GB')})`}
                        </span>
                      </>
                    ) : (
                      <>
                        <XCircle className="h-3.5 w-3.5 text-red-400" />
                        <span className="text-red-500 dark:text-red-400">Not uploaded</span>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex gap-2 flex-wrap pt-2 border-t dark:border-gray-700">
            {permit.status === 'draft' && (
              <Button size="sm" onClick={() => onAction('submit')} className="bg-amber-600 hover:bg-amber-700 text-white" disabled={!checklistComplete}>
                <ChevronRight className="h-4 w-4 mr-1" />
                {checklistComplete
                  ? 'Submit for Authorisation'
                  : noNoteCount > 0 && completedCount < requiredItems.length
                    ? `${requiredItems.length - completedCount} item${requiredItems.length - completedCount > 1 ? 's' : ''} + ${noNoteCount} control note${noNoteCount > 1 ? 's' : ''} needed`
                    : noNoteCount > 0
                      ? `${noNoteCount} control note${noNoteCount > 1 ? 's' : ''} needed`
                      : `${requiredItems.length - completedCount} item${requiredItems.length - completedCount > 1 ? 's' : ''} needed`}
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
              <Button size="sm" variant="outline" className="text-red-600 hover:text-red-700 ml-auto" onClick={() => onAction('cancel')}>
                Cancel Permit
              </Button>
            )}
          </div>
        </TabsContent>

        {/* Checklist tab */}
        <TabsContent value="checklist" className="mt-3">
          {checklist.length === 0 ? (
            <div className="text-center py-10 space-y-3">
              <p className="text-gray-500 text-sm">No checklist items for this permit.</p>
              {canEdit && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => regenerateChecklistMutation.mutate()}
                  disabled={regenerateChecklistMutation.isPending}
                >
                  <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${regenerateChecklistMutation.isPending ? 'animate-spin' : ''}`} />
                  {regenerateChecklistMutation.isPending ? 'Generating…' : 'Generate Checklist'}
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {/* Running status banner */}
              <div className={`flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium ${checklistComplete ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/40' : 'bg-amber-50 dark:bg-amber-900/20 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800/40'}`}>
                {checklistComplete ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <Clock className="h-4 w-4 shrink-0" />}
                <span>
                  {checklistComplete
                    ? 'All required items completed — ready to submit'
                    : `${completedCount} of ${requiredItems.length} required items done${noNoteCount > 0 ? ` · ${noNoteCount} need${noNoteCount === 1 ? 's' : ''} a control note` : ''}`}
                </span>
              </div>

              {Object.entries(sections).map(([section, items]) => {
                const sectionComplete = items.every(i =>
                  !i.isRequired || (!!i.response && !(i.response === 'no' && !i.notes && !pendingNotes[i.id]))
                );
                const isCollapsed = collapsedSections.has(section);
                const toggleCollapse = () => setCollapsedSections(prev => {
                  const next = new Set(prev);
                  if (next.has(section)) next.delete(section); else next.add(section);
                  return next;
                });
                return (
                  <div key={section} className="border dark:border-gray-700 rounded-lg overflow-hidden">
                    <button
                      className={`w-full flex items-center justify-between px-4 py-3 text-sm font-semibold ${sectionComplete ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-800 dark:text-emerald-300' : 'bg-gray-50 dark:bg-gray-800 text-gray-800 dark:text-gray-200'}`}
                      onClick={toggleCollapse}
                    >
                      <span className="flex items-center gap-2">
                        {sectionComplete ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <Clock className="h-4 w-4 text-amber-500" />}
                        {section}
                      </span>
                      <span className="flex items-center gap-2">
                        <span className="text-xs text-gray-500">{items.filter(i => !!i.response).length}/{items.length}</span>
                        {isCollapsed ? <ChevronRight className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
                      </span>
                    </button>
                    {!isCollapsed && (
                      <div className="divide-y dark:divide-gray-700">
                        {items.map(item => {
                          const noteValue = pendingNotes[item.id] !== undefined ? pendingNotes[item.id] : (item.notes || '');
                          const hasNote = noteValue.trim().length > 0;
                          return (
                            <div key={item.id} className={`px-4 py-4 ${item.response === 'no' ? 'bg-red-50 dark:bg-red-900/10' : ''}`}>
                              <div className="flex items-start gap-4">
                                {/* YES / NO / N/A — bigger tap targets for tablet use */}
                                <div className="flex flex-col gap-1.5 shrink-0">
                                  {[
                                    { opt: 'yes', label: 'YES', selCls: 'bg-emerald-600 text-white border-emerald-600', unselCls: 'border-emerald-300 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-700 dark:text-emerald-400 dark:hover:bg-emerald-900/20' },
                                    { opt: 'no',  label: 'NO',  selCls: 'bg-red-600 text-white border-red-600',           unselCls: 'border-red-300 text-red-700 hover:bg-red-50 dark:border-red-700 dark:text-red-400 dark:hover:bg-red-900/20' },
                                    { opt: 'n/a', label: 'N/A', selCls: 'bg-gray-500 text-white border-gray-500',         unselCls: 'border-gray-300 text-gray-500 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-400 dark:hover:bg-gray-800' },
                                  ].map(({ opt, label, selCls, unselCls }) => (
                                    <button
                                      key={opt}
                                      disabled={!canEdit}
                                      onClick={() => canEdit && onChecklistUpdate(item.id, opt, pendingNotes[item.id] ?? item.notes ?? undefined)}
                                      className={`text-sm font-bold border-2 rounded-lg transition-colors min-w-[56px] py-1.5 px-3 ${
                                        item.response === opt
                                          ? selCls
                                          : `bg-white dark:bg-gray-900 ${unselCls}`
                                      } ${!canEdit ? 'opacity-50 cursor-default' : 'cursor-pointer'}`}
                                    >
                                      {label}
                                    </button>
                                  ))}
                                </div>

                                <div className="min-w-0 flex-1">
                                  <p className="text-sm text-gray-800 dark:text-gray-200 leading-snug">
                                    {item.itemDescription}
                                    {item.isRequired && <span className="text-red-400 ml-1 font-bold">*</span>}
                                  </p>

                                  {/* Control note textarea — shown and required for "No" */}
                                  {item.response === 'no' && (
                                    <div className="mt-2.5">
                                      <label className="text-xs font-semibold text-red-700 dark:text-red-400 block mb-1">
                                        {hasNote ? '✓ Mitigating control note saved' : 'Mitigating control note required *'}
                                      </label>
                                      <textarea
                                        className={`w-full text-sm border-2 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-2 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 ${hasNote ? 'border-emerald-400 dark:border-emerald-600 focus:ring-emerald-400' : 'border-red-300 dark:border-red-700 focus:ring-red-400'}`}
                                        rows={2}
                                        placeholder="Describe the mitigating control in place…"
                                        value={noteValue}
                                        onChange={e => setPendingNotes(prev => ({ ...prev, [item.id]: e.target.value }))}
                                        onBlur={() => {
                                          if (canEdit) onChecklistUpdate(item.id, 'no', pendingNotes[item.id] ?? item.notes ?? '');
                                        }}
                                        disabled={!canEdit}
                                      />
                                    </div>
                                  )}

                                  {/* Optional note for Yes / N/A */}
                                  {item.response && item.response !== 'no' && item.notes && (
                                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1.5 italic">Note: {item.notes}</p>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })}
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
              permit.rejectionReason ? { label: 'Rejected', date: (permit as any).rejectedAt, color: 'bg-red-500', note: permit.rejectionReason } : null,
              (permit as any).actualStartAt ? { label: 'Work started (activated)', date: (permit as any).actualStartAt, color: 'bg-emerald-500' } : null,
              permit.suspendedAt ? { label: 'Suspended', date: (permit as any).suspendedAt, color: 'bg-orange-500', note: permit.suspensionReason } : null,
              permit.closedAt ? { label: `Completed & closed${permit.workCompletedSatisfactorily === false ? ' — UNSATISFACTORY' : ''}`, date: permit.closedAt, by: permit.closedByName, color: permit.workCompletedSatisfactorily === false ? 'bg-red-500' : 'bg-teal-500', note: permit.closureNotes } : null,
              permit.cancelledAt ? { label: 'Cancelled', date: permit.cancelledAt, by: permit.cancelledByName, color: 'bg-gray-500', note: permit.cancellationReason } : null,
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
