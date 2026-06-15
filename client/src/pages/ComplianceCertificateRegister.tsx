import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  ShieldCheck, AlertTriangle, XCircle, Clock, Upload, Download, Eye, Plus, Settings,
  CheckCircle2, FileText, ChevronDown, ChevronRight, Info, RefreshCw, Layers
} from "lucide-react";
import { format } from "date-fns";

type CertStatus = 'current' | 'expiring_soon' | 'expired' | 'no_certificate' | 'no_expiry';

interface CertType {
  id: string;
  certificateType: string;
  displayName: string;
  legalBasis: string | null;
  frequency: string;
  customDays: number | null;
  isActive: boolean;
  reminderDaysBefore: number;
  latestCertificate: Certificate | null;
  status: CertStatus;
  daysUntilExpiry: number | null;
  isOverdue: boolean;
}

interface Certificate {
  id: string;
  certificateTypeId: string;
  certificateType: string;
  issueDate: string;
  expiryDate: string | null;
  nextDueDate: string | null;
  referenceNumber: string | null;
  issuedBy: string | null;
  issuingCompany: string | null;
  documentUrl: string | null;
  fileName: string | null;
  status: string;
  notes: string | null;
  isCurrent: boolean;
  createdAt: string;
}

interface StatusSummary {
  total: number;
  current: number;
  expiring_soon: number;
  expired: number;
  no_certificate: number;
  overallStatus: string;
}

const STATUS_STYLE: Record<CertStatus, { label: string; bg: string; text: string; icon: any; ring: string }> = {
  current:       { label: 'Current',       bg: 'bg-emerald-50 dark:bg-emerald-900/20', text: 'text-emerald-700 dark:text-emerald-400', icon: CheckCircle2, ring: 'ring-emerald-200 dark:ring-emerald-700' },
  expiring_soon: { label: 'Expiring Soon', bg: 'bg-amber-50 dark:bg-amber-900/20',    text: 'text-amber-700 dark:text-amber-400',     icon: Clock,         ring: 'ring-amber-200 dark:ring-amber-700' },
  expired:       { label: 'Expired',       bg: 'bg-red-50 dark:bg-red-900/20',        text: 'text-red-700 dark:text-red-400',         icon: XCircle,       ring: 'ring-red-200 dark:ring-red-700' },
  no_certificate:{ label: 'No Certificate',bg: 'bg-gray-50 dark:bg-gray-800',         text: 'text-gray-500 dark:text-gray-400',       icon: AlertTriangle, ring: 'ring-gray-200 dark:ring-gray-600' },
  no_expiry:     { label: 'No Expiry',     bg: 'bg-blue-50 dark:bg-blue-900/20',      text: 'text-blue-700 dark:text-blue-400',       icon: ShieldCheck,   ring: 'ring-blue-200 dark:ring-blue-700' },
};

const FREQ_LABELS: Record<string, string> = {
  weekly: 'Weekly', monthly: 'Monthly', quarterly: 'Quarterly', biannual: '6-Monthly',
  annual: 'Annual', five_yearly: '5-Yearly', custom: 'Custom',
};

const CERT_TOOLTIPS: Record<string, string> = {
  fire_alarm_test_weekly:
    'Weekly functional test confirming all call points, detectors and sounders operate correctly. Required by BS 5839-1 and the Regulatory Reform (Fire Safety) Order 2005.',
  fire_alarm_test_full:
    'Full bi-annual inspection covering all zones, detectors, call points and control equipment. Required by BS 5839-1. Typically carried out by a specialist fire alarm engineer.',
  emergency_lighting_monthly:
    'Monthly short-duration function test of every emergency luminaire to confirm it illuminates on mains failure. Required by BS 5266-1.',
  emergency_lighting_annual:
    'Full 3-hour discharge test of all emergency lighting to verify battery capacity and lumen output. Required annually by BS 5266-1.',
  eicr:
    'Five-yearly (or risk-based) inspection of the fixed electrical wiring installation. Required for workplaces under the Electricity at Work Regulations 1989. Previously called a Periodic Inspection Report.',
  gas_safety:
    'Annual safety check of all gas appliances, flues and pipework by a Gas Safe registered engineer. Legally required under the Gas Safety (Installation and Use) Regulations 1998.',
  loler_lift:
    'Six-monthly thorough examination of passenger or goods lifts by a competent person. Required by the Lifting Operations and Lifting Equipment Regulations 1998 (LOLER).',
  legionella_risk_assessment:
    'Formal assessment of water systems to identify Legionella bacteria growth risks. Required by HSE\'s L8 Approved Code of Practice (ACoP). Must be reviewed whenever significant changes are made to the building or water systems.',
  legionella_water_testing:
    'Regular microbiological and chemical water sampling from risk-assessed outlets. Frequency is set by the risk assessment; typically monthly for high-risk systems. Required under HSG274 and the L8 ACoP.',
  asbestos_survey:
    'Survey to identify and assess asbestos-containing materials (ACMs) in the premises. Required under the Control of Asbestos Regulations 2012 (Regulation 4 — Duty to Manage). Must be updated when the building changes.',
  pat_testing:
    'Portable Appliance Testing — inspection and electrical testing of portable equipment. Required under the Electricity at Work Regulations 1989. Frequency is risk-based (typically annual for offices, more frequent for construction or industrial use).',
  sprinkler_system:
    'Annual inspection and testing of the automatic sprinkler system by a competent engineer. Required under BS 9251 (residential) or BS EN 12845 (commercial/industrial premises).',
  lightning_protection:
    'Annual inspection and testing of the lightning protection system and all bonding conductors. Required under BS EN 62305. Protects the structure and electrical systems from lightning strike damage.',
  fire_risk_assessment:
    'Formal written assessment of fire hazards, risks and the adequacy of existing controls. Required by the Regulatory Reform (Fire Safety) Order 2005 for all non-domestic premises. Must be reviewed regularly and after any significant changes to the building or its use.',
};

export default function ComplianceCertificateRegister() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [uploadTypeId, setUploadTypeId] = useState<string | null>(null);
  const [viewHistoryTypeId, setViewHistoryTypeId] = useState<string | null>(null);
  const [showAddCustomType, setShowAddCustomType] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const didHighlight = useRef(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadForm, setUploadForm] = useState({
    issueDate: '', expiryDate: '', referenceNumber: '', issuedBy: '', issuingCompany: '', notes: '',
  });

  const { data: certTypes = [], isLoading } = useQuery<CertType[]>({
    queryKey: ['/api/compliance-certificates/types'],
  });

  useEffect(() => {
    if (didHighlight.current || !certTypes.length) return;
    const id = new URLSearchParams(window.location.search).get('highlight');
    if (!id) return;
    const found = certTypes.find(c => String(c.id) === id);
    if (!found) return;
    setStatusFilter('all');
    setExpandedId(found.id);
    setHighlightedId(found.id);
    didHighlight.current = true;
    setTimeout(() => {
      document.getElementById(`item-${found.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setTimeout(() => setHighlightedId(null), 3000);
    }, 400);
  }, [certTypes]);

  const { data: summary } = useQuery<StatusSummary>({
    queryKey: ['/api/compliance-certificates/status-summary'],
  });

  const { data: history = [] } = useQuery<Certificate[]>({
    queryKey: [`/api/compliance-certificates/by-type/${viewHistoryTypeId}`],
    enabled: !!viewHistoryTypeId,
  });

  const seedMutation = useMutation({
    mutationFn: () => apiRequest('POST', '/api/compliance-certificates/types/seed', {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['/api/compliance-certificates/types'] });
      qc.invalidateQueries({ queryKey: ['/api/compliance-certificates/status-summary'] });
      toast({ title: 'Standard certificate types loaded.' });
    },
    onError: () => toast({ title: 'Failed to load standard types', variant: 'destructive' }),
  });

  const uploadMutation = useMutation({
    mutationFn: async ({ typeId, data }: { typeId: string; data: any }) => {
      // Step 1: create the certificate record via JSON POST
      const created = await apiRequest('POST', '/api/compliance-certificates', { ...data, certificateTypeId: typeId }).then(r => (r as Response).json());
      // Step 2: if a file was selected, upload it to the new record
      if (uploadFile) {
        const fd = new FormData();
        fd.append('file', uploadFile);
        const csrfToken = document.cookie.split(';').find(c => c.trim().startsWith('csrf-token='))?.split('=')[1];
        await fetch(`/api/compliance-certificates/${created.id}/upload`, {
          method: 'POST',
          credentials: 'include',
          headers: csrfToken ? { 'x-csrf-token': csrfToken } : {},
          body: fd,
        }).then(r => r.ok ? r.json() : r.json().then(e => Promise.reject(e)));
      }
      return created;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['/api/compliance-certificates/types'] });
      qc.invalidateQueries({ queryKey: ['/api/compliance-certificates/status-summary'] });
      if (viewHistoryTypeId) qc.invalidateQueries({ queryKey: [`/api/compliance-certificates/by-type/${viewHistoryTypeId}`] });
      setUploadTypeId(null);
      setUploadFile(null);
      setUploadForm({ issueDate: '', expiryDate: '', referenceNumber: '', issuedBy: '', issuingCompany: '', notes: '' });
      toast({ title: 'Certificate record uploaded successfully.' });
    },
    onError: (e: any) => toast({ title: e?.error || 'Failed to upload certificate', variant: 'destructive' }),
  });

  const toggleActiveMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      apiRequest('PUT', `/api/compliance-certificates/types/${id}`, { isActive }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['/api/compliance-certificates/types'] }),
    onError: () => toast({ title: 'Failed to update', variant: 'destructive' }),
  });

  const deleteCertMutation = useMutation({
    mutationFn: (id: string) => apiRequest('DELETE', `/api/compliance-certificates/${id}`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['/api/compliance-certificates/types'] });
      qc.invalidateQueries({ queryKey: ['/api/compliance-certificates/status-summary'] });
      if (viewHistoryTypeId) qc.invalidateQueries({ queryKey: [`/api/compliance-certificates/by-type/${viewHistoryTypeId}`] });
      toast({ title: 'Certificate record deleted.' });
    },
    onError: () => toast({ title: 'Failed to delete', variant: 'destructive' }),
  });

  const filteredTypes = certTypes.filter(t => {
    if (!t.isActive) return false;
    if (statusFilter === 'all') return true;
    if (statusFilter === 'attention') return t.status === 'expired' || t.status === 'expiring_soon' || t.status === 'no_certificate';
    return t.status === statusFilter;
  });

  const currentType = uploadTypeId ? certTypes.find(t => t.id === uploadTypeId) : null;
  const historyType = viewHistoryTypeId ? certTypes.find(t => t.id === viewHistoryTypeId) : null;

  const handleUploadSubmit = () => {
    if (!uploadTypeId) return;
    if (!uploadForm.issueDate) { toast({ title: 'Issue date is required', variant: 'destructive' }); return; }
    uploadMutation.mutate({ typeId: uploadTypeId, data: uploadForm });
  };

  const overallBg = summary?.overallStatus === 'compliant' ? 'from-emerald-600 to-emerald-700'
    : summary?.overallStatus === 'attention_needed' ? 'from-amber-500 to-amber-600'
    : 'from-red-600 to-red-700';

  return (
    <div className="space-y-6 p-4 md:p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <ShieldCheck className="h-6 w-6 text-blue-600" />
            Compliance Certificate Register
          </h1>
          <div className="flex items-center gap-1.5 mt-1">
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Track statutory inspection and compliance certificates required by law.
            </p>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button type="button" className="text-muted-foreground hover:text-foreground transition-colors">
                    <Info size={14} />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-sm text-xs space-y-2 p-3">
                  <p><strong>Compliance Certificate Register</strong> — A centralised record of all statutory inspection and maintenance certificates required by UK law for workplace premises.</p>
                  <p>Employers have legal duties under the <strong>Health &amp; Safety at Work Act 1974</strong>, <strong>EICR (BS 7671)</strong>, <strong>Gas Safety (Installation &amp; Use) Regulations 1998</strong>, <strong>LOLER 1998</strong>, <strong>Legionella (HSG274)</strong>, and the <strong>Regulatory Reform (Fire Safety) Order 2005</strong> to ensure certificates are kept current and accessible for inspection.</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>
        <div className="flex gap-2">
          {certTypes.length === 0 && !isLoading && (
            <Button variant="outline" size="sm" onClick={() => seedMutation.mutate()} disabled={seedMutation.isPending}>
              <Layers className="h-4 w-4 mr-1.5" />
              {seedMutation.isPending ? 'Loading…' : 'Load Standard Types'}
            </Button>
          )}
          <Button size="sm" onClick={() => setShowAddCustomType(true)}>
            <Plus className="h-4 w-4 mr-1.5" /> Add Custom Type
          </Button>
        </div>
      </div>

      {/* Summary banner */}
      {summary && (
        <div className={`bg-gradient-to-r ${overallBg} rounded-xl p-5 text-white`}>
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <p className="text-white/80 text-sm font-medium">Overall Compliance Status</p>
              <p className="text-xl font-bold mt-0.5">
                {summary.overallStatus === 'compliant' ? '✓ Fully Compliant'
                  : summary.overallStatus === 'attention_needed' ? '⚠ Attention Required'
                  : '✗ Action Needed'}
              </p>
            </div>
            <div className="flex gap-6 text-sm">
              <div className="text-center"><div className="text-2xl font-bold">{summary.current}</div><div className="text-white/75">Current</div></div>
              <div className="text-center"><div className="text-2xl font-bold">{summary.expiring_soon}</div><div className="text-white/75">Expiring</div></div>
              <div className="text-center"><div className="text-2xl font-bold">{summary.expired}</div><div className="text-white/75">Expired</div></div>
              <div className="text-center"><div className="text-2xl font-bold">{summary.no_certificate}</div><div className="text-white/75">Missing</div></div>
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        {[
          { key: 'all', label: `All (${certTypes.filter(t => t.isActive).length})` },
          { key: 'attention', label: `Needs Attention (${certTypes.filter(t => t.isActive && (t.status === 'expired' || t.status === 'expiring_soon' || t.status === 'no_certificate')).length})` },
          { key: 'current', label: 'Current' },
          { key: 'expiring_soon', label: 'Expiring Soon' },
          { key: 'expired', label: 'Expired' },
          { key: 'no_certificate', label: 'Missing' },
        ].map(f => (
          <button
            key={f.key}
            onClick={() => setStatusFilter(f.key)}
            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
              statusFilter === f.key
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="flex items-center justify-center h-40 text-gray-400">
          <RefreshCw className="h-6 w-6 animate-spin mr-2" /> Loading certificate register…
        </div>
      )}

      {/* Empty state */}
      {!isLoading && certTypes.length === 0 && (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <ShieldCheck className="h-12 w-12 text-gray-300 mb-4" />
            <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-300 mb-2">No Certificate Types Configured</h3>
            <p className="text-gray-500 dark:text-gray-400 max-w-sm text-sm mb-4">
              Load the 14 standard UK statutory certificate types, or add your own custom types.
            </p>
            <Button onClick={() => seedMutation.mutate()} disabled={seedMutation.isPending}>
              <Layers className="h-4 w-4 mr-2" />
              {seedMutation.isPending ? 'Loading…' : 'Load Standard Types'}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Certificate grid */}
      {!isLoading && filteredTypes.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredTypes.map(certType => {
            const s = STATUS_STYLE[certType.status] || STATUS_STYLE.no_certificate;
            const StatusIcon = s.icon;
            const isExpanded = expandedId === certType.id;
            const cert = certType.latestCertificate;

            return (
              <Card
                key={certType.id}
                id={`item-${certType.id}`}
                className={`ring-1 ${s.ring} transition-shadow hover:shadow-md ${s.bg}${highlightedId === certType.id ? ' ring-2 ring-blue-500 shadow-lg shadow-blue-100 dark:shadow-blue-900/30' : ''}`}
              >
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-2 min-w-0">
                      <StatusIcon className={`h-5 w-5 mt-0.5 shrink-0 ${s.text}`} />
                      <div className="min-w-0">
                        <div className="flex items-start gap-1">
                          <CardTitle className="text-sm font-semibold text-gray-900 dark:text-white leading-snug">
                            {certType.displayName}
                          </CardTitle>
                          {CERT_TOOLTIPS[certType.certificateType] && (
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Info className="h-3.5 w-3.5 text-gray-400 hover:text-blue-500 shrink-0 mt-0.5 cursor-help" />
                                </TooltipTrigger>
                                <TooltipContent side="top" className="max-w-xs text-xs p-2.5">
                                  {CERT_TOOLTIPS[certType.certificateType]}
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          )}
                        </div>
                        {certType.legalBasis && (
                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate" title={certType.legalBasis}>
                            {certType.legalBasis}
                          </p>
                        )}
                      </div>
                    </div>
                    <Badge variant="outline" className={`text-xs shrink-0 ${s.text} border-current`}>
                      {s.label}
                    </Badge>
                  </div>
                </CardHeader>

                <CardContent className="space-y-3">
                  {/* Key dates */}
                  <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                    <div className="text-gray-500 dark:text-gray-400">Frequency</div>
                    <div className="text-gray-800 dark:text-gray-200 font-medium">{FREQ_LABELS[certType.frequency] || certType.frequency}</div>

                    {cert?.issueDate && (
                      <>
                        <div className="text-gray-500 dark:text-gray-400">Last issued</div>
                        <div className="text-gray-800 dark:text-gray-200">{cert.issueDate}</div>
                      </>
                    )}
                    {cert?.expiryDate && (
                      <>
                        <div className="text-gray-500 dark:text-gray-400">Expires</div>
                        <div className={`font-semibold ${certType.status === 'expired' ? 'text-red-600' : certType.status === 'expiring_soon' ? 'text-amber-600' : 'text-gray-800 dark:text-gray-200'}`}>
                          {cert.expiryDate}
                          {certType.daysUntilExpiry !== null && (
                            <span className="ml-1 font-normal text-gray-500">
                              ({certType.daysUntilExpiry < 0 ? `${Math.abs(certType.daysUntilExpiry)}d ago` : `${certType.daysUntilExpiry}d`})
                            </span>
                          )}
                        </div>
                      </>
                    )}
                    {!cert?.expiryDate && cert?.nextDueDate && (
                      <>
                        <div className="text-gray-500 dark:text-gray-400">Next due</div>
                        <div className={`font-semibold ${certType.status === 'expired' ? 'text-red-600' : certType.status === 'expiring_soon' ? 'text-amber-600' : 'text-gray-800 dark:text-gray-200'}`}>
                          {cert.nextDueDate}
                          {certType.daysUntilExpiry !== null && (
                            <span className="ml-1 font-normal text-gray-500">
                              ({certType.daysUntilExpiry < 0 ? `${Math.abs(certType.daysUntilExpiry)}d ago` : `${certType.daysUntilExpiry}d`})
                            </span>
                          )}
                        </div>
                      </>
                    )}
                    {cert?.issuingCompany && (
                      <>
                        <div className="text-gray-500 dark:text-gray-400">Issued by</div>
                        <div className="text-gray-800 dark:text-gray-200 truncate">{cert.issuingCompany}</div>
                      </>
                    )}
                    {cert?.referenceNumber && (
                      <>
                        <div className="text-gray-500 dark:text-gray-400">Ref</div>
                        <div className="text-gray-800 dark:text-gray-200">{cert.referenceNumber}</div>
                      </>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2 pt-1">
                    <Button
                      size="sm"
                      className="flex-1 text-xs"
                      onClick={() => setUploadTypeId(certType.id)}
                    >
                      <Upload className="h-3 w-3 mr-1" />
                      {cert ? 'Renew' : 'Upload'}
                    </Button>
                    {cert?.documentUrl && (
                      <>
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button size="sm" variant="outline" className="text-xs px-2" asChild>
                                <a href={`/api/compliance-certificates/${cert.id}/download`} target="_blank" rel="noopener noreferrer">
                                  <Eye className="h-3 w-3" />
                                </a>
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>View certificate</TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button size="sm" variant="outline" className="text-xs px-2" asChild>
                                <a href={`/api/compliance-certificates/${cert.id}/download`} target="_blank" rel="noopener noreferrer" download>
                                  <Download className="h-3 w-3" />
                                </a>
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Download certificate</TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </>
                    )}
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            size="sm" variant="outline"
                            className="text-xs px-2"
                            onClick={() => {
                              setViewHistoryTypeId(certType.id);
                            }}
                          >
                            <Eye className="h-3 w-3" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>View history</TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>

                  {/* Expand notes */}
                  {cert?.notes && (
                    <button
                      className="text-xs text-blue-600 flex items-center gap-1"
                      onClick={() => setExpandedId(isExpanded ? null : certType.id)}
                    >
                      {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                      Notes
                    </button>
                  )}
                  {isExpanded && cert?.notes && (
                    <p className="text-xs text-gray-600 dark:text-gray-300 bg-white/60 dark:bg-black/20 rounded p-2">{cert.notes}</p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Upload / Renew Dialog */}
      <Dialog open={!!uploadTypeId} onOpenChange={open => { if (!open) { setUploadTypeId(null); setUploadFile(null); setUploadForm({ issueDate: '', expiryDate: '', referenceNumber: '', issuedBy: '', issuingCompany: '', notes: '' }); }}}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {currentType?.latestCertificate ? 'Renew Certificate' : 'Upload Certificate'} — {currentType?.displayName}
            </DialogTitle>
            <DialogDescription className="sr-only">
              Enter the certificate details and optionally attach a document.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Issue Date *</Label>
                <Input type="date" value={uploadForm.issueDate} onChange={e => setUploadForm(p => ({ ...p, issueDate: e.target.value }))} />
              </div>
              <div>
                <Label>Expiry Date</Label>
                <Input type="date" value={uploadForm.expiryDate} onChange={e => setUploadForm(p => ({ ...p, expiryDate: e.target.value }))} />
                <p className="text-xs text-gray-500 mt-1">Leave blank if no fixed expiry.</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Reference / Certificate No.</Label>
                <Input value={uploadForm.referenceNumber} onChange={e => setUploadForm(p => ({ ...p, referenceNumber: e.target.value }))} placeholder="e.g. GS/2025/001" />
              </div>
              <div>
                <Label>Issued By (Person)</Label>
                <Input value={uploadForm.issuedBy} onChange={e => setUploadForm(p => ({ ...p, issuedBy: e.target.value }))} placeholder="Inspector name" />
              </div>
            </div>
            <div>
              <Label>Issuing Company / Organisation</Label>
              <Input value={uploadForm.issuingCompany} onChange={e => setUploadForm(p => ({ ...p, issuingCompany: e.target.value }))} placeholder="e.g. ABC Gas Services Ltd" />
            </div>
            <div>
              <Label>Certificate Document</Label>
              <div className="mt-1 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-lg p-4 text-center">
                {uploadFile ? (
                  <div className="flex items-center justify-center gap-2 text-sm">
                    <FileText className="h-4 w-4 text-blue-600" />
                    <span className="truncate max-w-xs">{uploadFile.name}</span>
                    <button onClick={() => setUploadFile(null)} className="text-red-500 ml-1">×</button>
                  </div>
                ) : (
                  <label className="cursor-pointer">
                    <Upload className="h-6 w-6 text-gray-400 mx-auto mb-1" />
                    <p className="text-sm text-gray-500">Click to upload PDF/image</p>
                    <input type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden" onChange={e => setUploadFile(e.target.files?.[0] || null)} />
                  </label>
                )}
              </div>
            </div>
            <div>
              <Label>Notes</Label>
              <Textarea value={uploadForm.notes} onChange={e => setUploadForm(p => ({ ...p, notes: e.target.value }))} rows={2} placeholder="Any relevant notes about this certificate…" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUploadTypeId(null)}>Cancel</Button>
            <Button onClick={handleUploadSubmit} disabled={uploadMutation.isPending}>
              {uploadMutation.isPending ? 'Saving…' : 'Save Certificate'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* History Dialog */}
      <Dialog open={!!viewHistoryTypeId} onOpenChange={open => !open && setViewHistoryTypeId(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Certificate History — {historyType?.displayName}
            </DialogTitle>
            <DialogDescription className="sr-only">
              View and manage previous certificate records for this type.
            </DialogDescription>
          </DialogHeader>
          {history.length === 0 ? (
            <div className="text-center py-10 text-gray-500">No certificate records uploaded yet.</div>
          ) : (
            <div className="space-y-3">
              {history.map(cert => (
                <div key={cert.id} className={`rounded-lg border p-4 ${cert.isCurrent ? 'border-blue-300 bg-blue-50 dark:bg-blue-900/20 dark:border-blue-700' : 'border-gray-200 dark:border-gray-700'}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-1 text-sm">
                      {cert.isCurrent && <Badge className="bg-blue-600 text-white text-xs mb-1">Current</Badge>}
                      <div><span className="text-gray-500">Issued:</span> <strong>{cert.issueDate}</strong></div>
                      {cert.expiryDate && <div><span className="text-gray-500">Expires:</span> <strong>{cert.expiryDate}</strong></div>}
                      {cert.referenceNumber && <div><span className="text-gray-500">Ref:</span> {cert.referenceNumber}</div>}
                      {cert.issuingCompany && <div><span className="text-gray-500">By:</span> {cert.issuingCompany}</div>}
                      {cert.notes && <div className="text-gray-500 italic">"{cert.notes}"</div>}
                    </div>
                    <div className="flex gap-2 shrink-0">
                      {cert.documentUrl && (
                        <>
                          <Button size="sm" variant="outline" asChild>
                            <a href={`/api/compliance-certificates/${cert.id}/download`} target="_blank" rel="noopener noreferrer">
                              <Eye className="h-3 w-3 mr-1" /> View
                            </a>
                          </Button>
                          <Button size="sm" variant="outline" asChild>
                            <a href={`/api/compliance-certificates/${cert.id}/download`} target="_blank" rel="noopener noreferrer" download>
                              <Download className="h-3 w-3 mr-1" /> Download
                            </a>
                          </Button>
                        </>
                      )}
                      {!cert.isCurrent && (
                        <Button
                          size="sm" variant="ghost"
                          className="text-red-500 hover:text-red-700"
                          onClick={() => deleteCertMutation.mutate(cert.id)}
                          disabled={deleteCertMutation.isPending}
                        >
                          Delete
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setViewHistoryTypeId(null)}>Close</Button>
            <Button onClick={() => { setViewHistoryTypeId(null); setUploadTypeId(historyType?.id || null); }}>
              <Upload className="h-4 w-4 mr-1.5" /> Upload New Certificate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Custom Type Dialog */}
      <Dialog open={showAddCustomType} onOpenChange={setShowAddCustomType}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add Custom Certificate Type</DialogTitle>
            <DialogDescription className="sr-only">Define a new custom certificate type to track.</DialogDescription>
          </DialogHeader>
          <AddCustomTypeForm
            onSuccess={() => {
              setShowAddCustomType(false);
              qc.invalidateQueries({ queryKey: ['/api/compliance-certificates/types'] });
              toast({ title: 'Custom certificate type added.' });
            }}
            onCancel={() => setShowAddCustomType(false)}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}

function AddCustomTypeForm({ onSuccess, onCancel }: { onSuccess: () => void; onCancel: () => void }) {
  const { toast } = useToast();
  const [form, setForm] = useState({ displayName: '', frequency: 'annual', customDays: '', legalBasis: '', reminderDaysBefore: '30' });

  const mutation = useMutation({
    mutationFn: (data: any) => apiRequest('POST', '/api/compliance-certificates/types', data),
    onSuccess,
    onError: () => toast({ title: 'Failed to create certificate type', variant: 'destructive' }),
  });

  const handleSubmit = () => {
    if (!form.displayName) { toast({ title: 'Name is required', variant: 'destructive' }); return; }
    mutation.mutate({
      displayName: form.displayName,
      frequency: form.frequency,
      customDays: form.frequency === 'custom' ? parseInt(form.customDays) || 365 : null,
      legalBasis: form.legalBasis || null,
      reminderDaysBefore: parseInt(form.reminderDaysBefore) || 30,
    });
  };

  return (
    <div className="space-y-4">
      <div><Label>Name *</Label><Input value={form.displayName} onChange={e => setForm(p => ({ ...p, displayName: e.target.value }))} placeholder="e.g. Insurance Policy Certificate" /></div>
      <div>
        <Label>Renewal Frequency</Label>
        <Select value={form.frequency} onValueChange={v => setForm(p => ({ ...p, frequency: v }))}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {Object.entries(FREQ_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      {form.frequency === 'custom' && (
        <div><Label>Custom interval (days)</Label><Input type="number" min={1} value={form.customDays} onChange={e => setForm(p => ({ ...p, customDays: e.target.value }))} placeholder="365" /></div>
      )}
      <div><Label>Legal Basis / Reference</Label><Input value={form.legalBasis} onChange={e => setForm(p => ({ ...p, legalBasis: e.target.value }))} placeholder="e.g. Health & Safety at Work Act 1974" /></div>
      <div><Label>Alert me (days before expiry)</Label><Input type="number" min={1} max={365} value={form.reminderDaysBefore} onChange={e => setForm(p => ({ ...p, reminderDaysBefore: e.target.value }))} /></div>
      <DialogFooter>
        <Button variant="outline" onClick={onCancel}>Cancel</Button>
        <Button onClick={handleSubmit} disabled={mutation.isPending}>{mutation.isPending ? 'Saving…' : 'Add Type'}</Button>
      </DialogFooter>
    </div>
  );
}
