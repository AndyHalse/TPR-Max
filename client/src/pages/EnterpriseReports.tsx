import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  BarChart3, FileText, HardHat, Clock, Building2, Shield,
  Calendar, Download, Loader2, CheckCircle2, XCircle, AlertTriangle,
  FileBarChart, ClipboardList, Flame, ChevronRight,
  Plus, Trash2, CalendarClock, Mail, Settings2, RefreshCw,
  Users,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type ReportType =
  | 'portfolio_compliance_snapshot'
  | 'single_site_report'
  | 'contractor_compliance_report'
  | 'expiry_forecast'
  | 'ppm_performance'
  | 'evacuation_muster_log'
  | 'audit_trail_export';

interface ReportMeta {
  id: ReportType;
  label: string;
  description: string;
  icon: React.ElementType;
  requiresSite?: boolean;
  requiresPeriod?: boolean;
  requiresDates?: boolean;
  adminOnly?: boolean;
  timeEst: string;
}

interface Site { id: string; name: string; reference?: string }

interface ReportRecord {
  id: string;
  reportType: ReportType;
  reportTitle: string;
  scope: string;
  status: string;
  fileSizeBytes: number | null;
  errorMessage: string | null;
  createdAt: string;
  completedAt: string | null;
  downloadUrl: string | null;
  generatedByName: string | null;
}

interface ScheduledReport {
  id: string;
  reportType: string;
  reportTitle: string;
  scope: string;
  scopeId: string | null;
  parameters: Record<string, any>;
  recipients: string[];
  frequency: 'daily' | 'weekly' | 'monthly';
  runAtHour: number;
  runAtMinute: number;
  dayOfWeek: number | null;
  dayOfMonth: number | null;
  enabled: boolean;
  isDefault: boolean;
  lastRunAt: string | null;
  lastRunStatus: string | null;
  lastRunError: string | null;
  createdByName: string | null;
  createdAt: string;
}

// ─── Report catalogue ─────────────────────────────────────────────────────────

const REPORT_TYPES: ReportMeta[] = [
  {
    id: 'portfolio_compliance_snapshot',
    label: 'Portfolio Compliance Snapshot',
    description: 'Estate-wide overview — overall score, category breakdown, critical issues, and site-by-site table.',
    icon: BarChart3,
    adminOnly: true,
    timeEst: '~10s',
  },
  {
    id: 'single_site_report',
    label: 'Single Site Report',
    description: 'Full compliance position for one chosen site — every category and open issue.',
    icon: Building2,
    requiresSite: true,
    timeEst: '~5s',
  },
  {
    id: 'contractor_compliance_report',
    label: 'Contractor Compliance Report',
    description: 'Insurance, RAMS, and induction status per contractor company across the estate.',
    icon: HardHat,
    timeEst: '~8s',
  },
  {
    id: 'expiry_forecast',
    label: 'Expiry Forecast',
    description: 'Everything expiring in the next 30, 60, or 90 days — compliance items and contractor docs.',
    icon: Calendar,
    requiresPeriod: true,
    timeEst: '~6s',
  },
  {
    id: 'ppm_performance',
    label: 'PPM Performance',
    description: 'Planned preventive maintenance — completed vs overdue by site with completion rates.',
    icon: ClipboardList,
    timeEst: '~8s',
  },
  {
    id: 'evacuation_muster_log',
    label: 'Evacuation / Muster Log',
    description: 'Muster events with headcount and timings for one site. Never combines sites.',
    icon: Flame,
    requiresSite: true,
    timeEst: '~5s',
  },
  {
    id: 'audit_trail_export',
    label: 'Audit Trail Export',
    description: 'Timestamped compliance alerts and notification history for a custom date range.',
    icon: FileText,
    requiresDates: true,
    timeEst: '~6s',
  },
];

const REPORT_TYPE_LABELS: Record<string, string> = Object.fromEntries(
  REPORT_TYPES.map(r => [r.id, r.label])
);

const DAY_NAMES = ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtBytes(n: number | null | undefined): string {
  if (!n) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1048576) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1048576).toFixed(1)} MB`;
}

function fmtDate(s: string | null): string {
  if (!s) return '—';
  return new Date(s).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function fmtTime(h: number, m: number): string {
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function describeSchedule(s: ScheduledReport): string {
  const time = fmtTime(s.runAtHour, s.runAtMinute);
  if (s.frequency === 'daily') return `Daily at ${time}`;
  if (s.frequency === 'weekly') return `Weekly on ${DAY_NAMES[s.dayOfWeek ?? 1]} at ${time}`;
  if (s.frequency === 'monthly') return `Monthly on the ${s.dayOfMonth ?? 1}${ordinal(s.dayOfMonth ?? 1)} at ${time}`;
  return s.frequency;
}

function ordinal(n: number): string {
  if (n === 1 || n === 21 || n === 31) return 'st';
  if (n === 2 || n === 22) return 'nd';
  if (n === 3 || n === 23) return 'rd';
  return 'th';
}

function StatusBadge({ status }: { status: string }) {
  if (status === 'ready') return <Badge className="bg-green-600 hover:bg-green-700 text-xs"><CheckCircle2 size={10} className="mr-1" />Ready</Badge>;
  if (status === 'failed') return <Badge variant="destructive" className="text-xs"><XCircle size={10} className="mr-1" />Failed</Badge>;
  return <Badge variant="secondary" className="text-xs"><Loader2 size={10} className="mr-1 animate-spin" />Generating</Badge>;
}

function RunStatusBadge({ status }: { status: string | null }) {
  if (!status || status === 'running') return null;
  if (status === 'sent') return <Badge className="bg-green-600 hover:bg-green-700 text-xs">Sent</Badge>;
  if (status === 'partial') return <Badge className="bg-amber-500 hover:bg-amber-600 text-xs">Partial</Badge>;
  if (status === 'skipped') return <Badge variant="secondary" className="text-xs">Skipped</Badge>;
  if (status === 'failed') return <Badge variant="destructive" className="text-xs">Failed</Badge>;
  return null;
}

// ─── Add/Edit Schedule Dialog ─────────────────────────────────────────────────

interface ScheduleFormData {
  reportType: string;
  reportTitle: string;
  scope: string;
  frequency: 'daily' | 'weekly' | 'monthly';
  runAtHour: number;
  runAtMinute: number;
  dayOfWeek: number;
  dayOfMonth: number;
  recipients: string; // comma-separated
  enabled: boolean;
}

function ScheduleDialog({
  open,
  onClose,
  initial,
  sites,
  onSave,
  isSaving,
}: {
  open: boolean;
  onClose: () => void;
  initial?: ScheduledReport | null;
  sites: Site[];
  onSave: (data: any) => void;
  isSaving: boolean;
}) {
  const [form, setForm] = useState<ScheduleFormData>(() => ({
    reportType: initial?.reportType ?? 'portfolio_compliance_snapshot',
    reportTitle: initial?.reportTitle ?? '',
    scope: initial?.scope ?? 'estate',
    frequency: initial?.frequency ?? 'weekly',
    runAtHour: initial?.runAtHour ?? 8,
    runAtMinute: initial?.runAtMinute ?? 0,
    dayOfWeek: initial?.dayOfWeek ?? 1,
    dayOfMonth: initial?.dayOfMonth ?? 1,
    recipients: Array.isArray(initial?.recipients) ? initial.recipients.join(', ') : '',
    enabled: initial?.enabled ?? true,
  }));

  const set = (k: keyof ScheduleFormData, v: any) => setForm(prev => ({ ...prev, [k]: v }));

  function handleSave() {
    const recipientList = form.recipients
      .split(/[,\n]/)
      .map(s => s.trim())
      .filter(s => s.includes('@'));
    onSave({
      reportType: form.reportType,
      reportTitle: form.reportTitle || REPORT_TYPE_LABELS[form.reportType] || form.reportType,
      scope: form.scope,
      frequency: form.frequency,
      runAtHour: form.runAtHour,
      runAtMinute: form.runAtMinute,
      dayOfWeek: form.frequency === 'weekly' ? form.dayOfWeek : null,
      dayOfMonth: form.frequency === 'monthly' ? form.dayOfMonth : null,
      recipients: recipientList,
      enabled: form.enabled,
    });
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{initial ? 'Edit Schedule' : 'New Scheduled Report'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          {/* Report type */}
          <div className="space-y-1.5">
            <Label>Report type</Label>
            <Select value={form.reportType} onValueChange={v => {
              set('reportType', v);
              if (!form.reportTitle) set('reportTitle', REPORT_TYPE_LABELS[v] ?? '');
            }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {REPORT_TYPES.map(rt => (
                  <SelectItem key={rt.id} value={rt.id}>{rt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Title */}
          <div className="space-y-1.5">
            <Label>Schedule name</Label>
            <Input
              value={form.reportTitle}
              onChange={e => set('reportTitle', e.target.value)}
              placeholder="e.g. Weekly Portfolio Snapshot"
            />
          </div>

          {/* Frequency */}
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label>Frequency</Label>
              <Select value={form.frequency} onValueChange={v => set('frequency', v as any)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="daily">Daily</SelectItem>
                  <SelectItem value="weekly">Weekly</SelectItem>
                  <SelectItem value="monthly">Monthly</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {form.frequency === 'weekly' && (
              <div className="space-y-1.5">
                <Label>Day of week</Label>
                <Select value={String(form.dayOfWeek)} onValueChange={v => set('dayOfWeek', parseInt(v))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {DAY_NAMES.slice(1).map((d, i) => (
                      <SelectItem key={i + 1} value={String(i + 1)}>{d}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {form.frequency === 'monthly' && (
              <div className="space-y-1.5">
                <Label>Day of month</Label>
                <Input
                  type="number" min={1} max={28}
                  value={form.dayOfMonth}
                  onChange={e => set('dayOfMonth', parseInt(e.target.value) || 1)}
                />
              </div>
            )}
            <div className="space-y-1.5">
              <Label>Time (24h)</Label>
              <div className="flex gap-1 items-center">
                <Input
                  type="number" min={0} max={23} className="w-16 text-center"
                  value={form.runAtHour}
                  onChange={e => set('runAtHour', parseInt(e.target.value) || 0)}
                />
                <span className="text-muted-foreground font-mono">:</span>
                <Input
                  type="number" min={0} max={59} step={5} className="w-16 text-center"
                  value={form.runAtMinute}
                  onChange={e => set('runAtMinute', parseInt(e.target.value) || 0)}
                />
              </div>
            </div>
          </div>

          {/* Recipients */}
          <div className="space-y-1.5">
            <Label>Recipients <span className="text-muted-foreground text-xs">(comma-separated emails)</span></Label>
            <Input
              value={form.recipients}
              onChange={e => set('recipients', e.target.value)}
              placeholder="director@example.com, safety@example.com"
            />
          </div>

          {/* Enabled toggle */}
          <div className="flex items-center gap-3">
            <Switch checked={form.enabled} onCheckedChange={v => set('enabled', v)} id="sched-enabled" />
            <Label htmlFor="sched-enabled">Enable immediately</Label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isSaving}>Cancel</Button>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? <><Loader2 size={14} className="mr-1.5 animate-spin" />Saving…</> : 'Save Schedule'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Scheduled Reports panel ──────────────────────────────────────────────────

function ScheduledReportsPanel({ sites }: { sites: Site[] }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ScheduledReport | null>(null);

  const { data: schedules = [], isLoading } = useQuery<ScheduledReport[]>({
    queryKey: ['/api/enterprise/scheduled-reports'],
  });

  const seedMutation = useMutation({
    mutationFn: () => apiRequest('POST', '/api/enterprise/scheduled-reports/seed-defaults', {}),
    onSuccess: async (res) => {
      const data = await res.json();
      queryClient.invalidateQueries({ queryKey: ['/api/enterprise/scheduled-reports'] });
      toast({ title: data.inserted > 0 ? `${data.inserted} defaults added` : 'Defaults already present' });
    },
    onError: () => toast({ title: 'Failed to seed defaults', variant: 'destructive' }),
  });

  const createMutation = useMutation({
    mutationFn: (data: any) => apiRequest('POST', '/api/enterprise/scheduled-reports', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/enterprise/scheduled-reports'] });
      setDialogOpen(false);
      toast({ title: 'Schedule created' });
    },
    onError: () => toast({ title: 'Failed to create schedule', variant: 'destructive' }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) =>
      apiRequest('PATCH', `/api/enterprise/scheduled-reports/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/enterprise/scheduled-reports'] });
      setDialogOpen(false);
      setEditing(null);
      toast({ title: 'Schedule updated' });
    },
    onError: () => toast({ title: 'Failed to update schedule', variant: 'destructive' }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest('DELETE', `/api/enterprise/scheduled-reports/${id}`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/enterprise/scheduled-reports'] });
      toast({ title: 'Schedule deleted' });
    },
    onError: () => toast({ title: 'Failed to delete schedule', variant: 'destructive' }),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      apiRequest('PATCH', `/api/enterprise/scheduled-reports/${id}`, { enabled }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['/api/enterprise/scheduled-reports'] }),
    onError: () => toast({ title: 'Failed to toggle schedule', variant: 'destructive' }),
  });

  function handleSave(data: any) {
    if (editing) {
      updateMutation.mutate({ id: editing.id, data });
    } else {
      createMutation.mutate(data);
    }
  }

  const isSaving = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="space-y-5">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <p className="text-sm font-medium">Scheduled Reports</p>
          <p className="text-xs text-muted-foreground">Reports are generated and emailed automatically on schedule (Europe/London).</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline" size="sm"
            onClick={() => seedMutation.mutate()}
            disabled={seedMutation.isPending}
          >
            {seedMutation.isPending
              ? <Loader2 size={13} className="mr-1.5 animate-spin" />
              : <RefreshCw size={13} className="mr-1.5" />}
            Load Defaults
          </Button>
          <Button size="sm" onClick={() => { setEditing(null); setDialogOpen(true); }}>
            <Plus size={13} className="mr-1.5" />New Schedule
          </Button>
        </div>
      </div>

      {/* List */}
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading schedules…</p>
      ) : schedules.length === 0 ? (
        <div className="border rounded-lg p-8 text-center text-muted-foreground">
          <CalendarClock size={32} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm font-medium">No schedules yet</p>
          <p className="text-xs mt-1 mb-4">Click <strong>Load Defaults</strong> to add the 4 built-in schedules, or create your own.</p>
          <Button variant="outline" size="sm" onClick={() => seedMutation.mutate()} disabled={seedMutation.isPending}>
            <RefreshCw size={13} className="mr-1.5" />Load Defaults
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {schedules.map(s => (
            <Card key={s.id} className={`transition-opacity ${s.enabled ? '' : 'opacity-60'}`}>
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  {/* Toggle */}
                  <div className="pt-0.5">
                    <Switch
                      checked={s.enabled}
                      onCheckedChange={v => toggleMutation.mutate({ id: s.id, enabled: v })}
                    />
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-medium">{s.reportTitle}</p>
                      {s.isDefault && <Badge variant="outline" className="text-xs py-0">Default</Badge>}
                      {!s.enabled && <Badge variant="secondary" className="text-xs py-0">Disabled</Badge>}
                    </div>

                    <div className="flex items-center gap-3 mt-1.5 flex-wrap text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <CalendarClock size={11} />{describeSchedule(s)}
                      </span>
                      <span className="flex items-center gap-1">
                        <FileText size={11} />{REPORT_TYPE_LABELS[s.reportType] ?? s.reportType}
                      </span>
                      {Array.isArray(s.recipients) && s.recipients.length > 0 && (
                        <span className="flex items-center gap-1">
                          <Mail size={11} />{s.recipients.length} recipient{s.recipients.length !== 1 ? 's' : ''}
                        </span>
                      )}
                      {Array.isArray(s.recipients) && s.recipients.length === 0 && (
                        <span className="flex items-center gap-1 text-amber-500">
                          <AlertTriangle size={11} />No recipients
                        </span>
                      )}
                    </div>

                    {/* Last run */}
                    <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                      {s.lastRunAt ? (
                        <span className="text-xs text-muted-foreground">
                          Last run: {fmtDate(s.lastRunAt)}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">Never run</span>
                      )}
                      <RunStatusBadge status={s.lastRunStatus} />
                      {s.lastRunStatus === 'failed' && s.lastRunError && (
                        <span className="text-xs text-red-600 truncate max-w-xs">{s.lastRunError}</span>
                      )}
                    </div>

                    {/* Recipients preview */}
                    {Array.isArray(s.recipients) && s.recipients.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {s.recipients.slice(0, 4).map(r => (
                          <span key={r} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-muted text-muted-foreground">
                            {r}
                          </span>
                        ))}
                        {s.recipients.length > 4 && (
                          <span className="text-xs text-muted-foreground">+{s.recipients.length - 4} more</span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex gap-1.5 flex-shrink-0">
                    <Button
                      variant="ghost" size="icon" className="h-7 w-7"
                      onClick={() => { setEditing(s); setDialogOpen(true); }}
                      title="Edit"
                    >
                      <Settings2 size={13} />
                    </Button>
                    <Button
                      variant="ghost" size="icon" className="h-7 w-7 text-red-500 hover:text-red-600 hover:bg-red-50"
                      onClick={() => {
                        if (confirm(`Delete "${s.reportTitle}"?`)) deleteMutation.mutate(s.id);
                      }}
                      title="Delete"
                    >
                      <Trash2 size={13} />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Volume note */}
      {schedules.filter(s => s.enabled && s.frequency === 'daily').length > 2 && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-800">
          <AlertTriangle size={14} className="mt-0.5 flex-shrink-0" />
          <p>You have {schedules.filter(s => s.enabled && s.frequency === 'daily').length} daily schedules enabled. Consider consolidating to avoid high email volume to recipients.</p>
        </div>
      )}

      <ScheduleDialog
        open={dialogOpen}
        onClose={() => { setDialogOpen(false); setEditing(null); }}
        initial={editing}
        sites={sites}
        onSave={handleSave}
        isSaving={isSaving}
      />
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function EnterpriseReports() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [selected, setSelected] = useState<ReportType>('portfolio_compliance_snapshot');
  const [siteId, setSiteId] = useState('');
  const [period, setPeriod] = useState('30');
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 30);
    return d.toISOString().slice(0, 10);
  });
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().slice(0, 10));

  const meta = REPORT_TYPES.find(r => r.id === selected)!;

  const { data: sites = [] } = useQuery<Site[]>({
    queryKey: ['/api/enterprise/contractor-pool/sites'],
  });

  const { data: history = [], isLoading: histLoading } = useQuery<ReportRecord[]>({
    queryKey: ['/api/enterprise/reports'],
    refetchInterval: 5000,
  });

  const generateMutation = useMutation({
    mutationFn: async () => {
      const params: Record<string, any> = {};
      if (meta.requiresSite && siteId) params.siteId = siteId;
      if (meta.requiresPeriod) params.period = parseInt(period);
      if (meta.requiresDates) { params.dateFrom = dateFrom; params.dateTo = dateTo; }

      const res = await apiRequest('POST', '/api/enterprise/reports', {
        reportType: selected,
        parameters: params,
      });

      const contentType = res.headers.get('content-type') ?? '';
      if (contentType.includes('pdf')) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url;
        a.download = `${selected}-${new Date().toISOString().slice(0, 10)}.pdf`;
        a.click();
        URL.revokeObjectURL(url);
        return null;
      }
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/enterprise/reports'] });
      if (data?.downloadUrl) {
        toast({ title: 'Report ready', description: `${data.title} (${fmtBytes(data.fileSizeBytes)}) is ready.` });
      } else {
        toast({ title: 'Report generated', description: 'PDF downloaded directly.' });
      }
    },
    onError: () => toast({ title: 'Generation failed', description: 'Unable to generate report.', variant: 'destructive' }),
  });

  const canGenerate = !generateMutation.isPending && (!meta.requiresSite || siteId.length > 0);

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-primary/10">
          <FileBarChart size={22} className="text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Portfolio Reports</h1>
          <p className="text-sm text-muted-foreground">Generate board-ready PDF reports or schedule automatic delivery.</p>
        </div>
      </div>

      <Tabs defaultValue="generate">
        <TabsList>
          <TabsTrigger value="generate" className="gap-1.5">
            <FileBarChart size={14} />Generate
          </TabsTrigger>
          <TabsTrigger value="scheduled" className="gap-1.5">
            <CalendarClock size={14} />Scheduled
          </TabsTrigger>
        </TabsList>

        {/* ── Generate tab ── */}
        <TabsContent value="generate" className="mt-5">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Report type selector */}
            <div className="lg:col-span-1 space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide px-1">Report type</p>
              {REPORT_TYPES.map(rt => {
                const Icon = rt.icon;
                const isSelected = rt.id === selected;
                return (
                  <button
                    key={rt.id}
                    onClick={() => { setSelected(rt.id); setSiteId(''); }}
                    className={`w-full text-left p-3 rounded-lg border transition-all flex items-start gap-3 ${
                      isSelected
                        ? 'border-primary bg-primary/5 shadow-sm'
                        : 'border-border hover:border-muted-foreground/40 hover:bg-muted/30'
                    }`}
                  >
                    <Icon size={16} className={`mt-0.5 flex-shrink-0 ${isSelected ? 'text-primary' : 'text-muted-foreground'}`} />
                    <div className="min-w-0">
                      <p className={`text-sm font-medium leading-tight ${isSelected ? 'text-primary' : ''}`}>{rt.label}</p>
                      <p className="text-xs text-muted-foreground mt-0.5 leading-snug line-clamp-2">{rt.description}</p>
                      <span className="text-xs text-muted-foreground/70 mt-1 inline-block"><Clock size={10} className="inline mr-0.5" />{rt.timeEst}</span>
                    </div>
                    {isSelected && <ChevronRight size={14} className="text-primary flex-shrink-0 mt-0.5 ml-auto" />}
                  </button>
                );
              })}
            </div>

            {/* Config + generate */}
            <div className="lg:col-span-2 space-y-5">
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-2">
                    {(() => { const Icon = meta.icon; return <Icon size={18} className="text-primary" />; })()}
                    <CardTitle className="text-base">{meta.label}</CardTitle>
                  </div>
                  <CardDescription className="text-sm">{meta.description}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {meta.requiresSite && (
                    <div className="space-y-1.5">
                      <Label>Site <span className="text-red-500">*</span></Label>
                      <Select value={siteId} onValueChange={setSiteId}>
                        <SelectTrigger><SelectValue placeholder="Select a site…" /></SelectTrigger>
                        <SelectContent>
                          {sites.map(s => (
                            <SelectItem key={s.id} value={s.id}>
                              {s.name}{s.reference ? ` (${s.reference})` : ''}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  {meta.requiresPeriod && (
                    <div className="space-y-1.5">
                      <Label>Forecast period</Label>
                      <Select value={period} onValueChange={setPeriod}>
                        <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="30">Next 30 days</SelectItem>
                          <SelectItem value="60">Next 60 days</SelectItem>
                          <SelectItem value="90">Next 90 days</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  {meta.requiresDates && (
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label>From</Label>
                        <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
                      </div>
                      <div className="space-y-1.5">
                        <Label>To</Label>
                        <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} />
                      </div>
                    </div>
                  )}

                  {!meta.requiresSite && !meta.requiresPeriod && !meta.requiresDates && (
                    <p className="text-sm text-muted-foreground bg-muted/40 rounded-md px-3 py-2">
                      No additional configuration required — scoped to your access level automatically.
                    </p>
                  )}

                  <Separator />

                  <Button className="w-full" disabled={!canGenerate} onClick={() => generateMutation.mutate()}>
                    {generateMutation.isPending
                      ? <><Loader2 size={15} className="mr-2 animate-spin" />Generating PDF…</>
                      : <><FileBarChart size={15} className="mr-2" />Generate PDF Report</>}
                  </Button>

                  {generateMutation.isPending && (
                    <p className="text-xs text-center text-muted-foreground">
                      Building your report — up to 30 seconds for large estates.
                    </p>
                  )}
                </CardContent>
              </Card>

              {/* History */}
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Recent Reports</p>
                {histLoading ? (
                  <p className="text-sm text-muted-foreground">Loading history…</p>
                ) : history.length === 0 ? (
                  <div className="border rounded-lg p-6 text-center text-muted-foreground">
                    <FileText size={28} className="mx-auto mb-2 opacity-30" />
                    <p className="text-sm">No reports generated yet.</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {history.map(r => {
                      const rtMeta = REPORT_TYPES.find(x => x.id === r.reportType);
                      const Icon = rtMeta?.icon ?? FileText;
                      return (
                        <div key={r.id} className="flex items-center gap-3 p-3 border rounded-lg hover:bg-muted/20 transition-colors">
                          <Icon size={16} className="text-muted-foreground flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{r.reportTitle}</p>
                            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                              <span className="text-xs text-muted-foreground">{fmtDate(r.createdAt)}</span>
                              {r.generatedByName && <span className="text-xs text-muted-foreground">by {r.generatedByName}</span>}
                              {r.fileSizeBytes && <span className="text-xs text-muted-foreground">{fmtBytes(r.fileSizeBytes)}</span>}
                              {r.status === 'failed' && r.errorMessage && (
                                <span className="text-xs text-red-600 truncate max-w-48">{r.errorMessage}</span>
                              )}
                            </div>
                          </div>
                          <StatusBadge status={r.status} />
                          {r.status === 'ready' && r.downloadUrl && (
                            <a href={r.downloadUrl} className="flex items-center gap-1 text-xs text-primary hover:underline ml-1" download>
                              <Download size={13} />PDF
                            </a>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        </TabsContent>

        {/* ── Scheduled tab ── */}
        <TabsContent value="scheduled" className="mt-5">
          <ScheduledReportsPanel sites={sites} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
