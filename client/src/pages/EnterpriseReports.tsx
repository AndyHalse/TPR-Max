import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import {
  BarChart3, FileText, HardHat, Clock, Building2,
  Calendar, Download, Loader2, CheckCircle2, XCircle, AlertTriangle,
  FileBarChart, ClipboardList, Flame, ChevronRight,
  Plus, Trash2, CalendarClock, Mail, Settings2, RefreshCw,
  Users, ShieldCheck, TrendingUp,
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

interface SummaryData {
  estateScore: number;
  categoryScores: Record<string, number>;
  siteCount: number;
  openCriticals: number;
  openWarnings: number;
  totalItems: number;
  expiringItems: number;
  siteScores: { siteId: string; score: number }[];
  generatedAt: string;
}

interface SiteRow {
  siteId: string;
  siteName: string;
  score: number;
  categoryScores: Record<string, number>;
  openCriticals: number;
  openWarnings: number;
}

interface ExpiryRow {
  id: string;
  siteId: string;
  siteName: string;
  category: string;
  sourceTable: string;
  sourceId: string;
  status: string;
  expiresAt: string | null;
  severity: string;
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

const CATEGORY_LABELS: Record<string, string> = {
  insurance: "Insurance",
  rams: "RAMS",
  inductions: "Inductions",
  certificates: "Certificates",
  ppm: "PPM",
  fire: "Fire Risk",
  rtw: "Right to Work",
};

const ORDERED_CATS = ["insurance", "rams", "inductions", "certificates", "ppm", "fire", "rtw"];

const DAY_NAMES = ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

const BRAND_BLUE = "#2460A9";

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

function toGBDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

function daysUntil(iso: string | null | undefined): number | null {
  if (!iso) return null;
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000);
}

function describeSchedule(s: ScheduledReport): string {
  const time = fmtTime(s.runAtHour, s.runAtMinute);
  if (s.frequency === 'daily') return `Daily at ${time}`;
  if (s.frequency === 'weekly') return `Weekly · ${DAY_NAMES[s.dayOfWeek ?? 1]} ${time}`;
  if (s.frequency === 'monthly') return `Monthly · ${s.dayOfMonth ?? 1}${ordinal(s.dayOfMonth ?? 1)} ${time}`;
  return s.frequency;
}

function ordinal(n: number): string {
  if (n === 1 || n === 21 || n === 31) return 'st';
  if (n === 2 || n === 22) return 'nd';
  if (n === 3 || n === 23) return 'rd';
  return 'th';
}

function scoreColor(score: number | null | undefined): string {
  if (score == null) return "#94a3b8";
  if (score >= 80) return "#22a06b";
  if (score >= 50) return "#e8a000";
  return "#e84040";
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

// ─── Add/Edit Schedule Dialog ──────────────────────────────────────────────────

interface ScheduleFormData {
  reportType: string;
  reportTitle: string;
  scope: string;
  frequency: 'daily' | 'weekly' | 'monthly';
  runAtHour: number;
  runAtMinute: number;
  dayOfWeek: number;
  dayOfMonth: number;
  recipients: string;
  enabled: boolean;
}

function ScheduleDialog({
  open, onClose, initial, sites, onSave, isSaving,
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
    const recipientList = form.recipients.split(/[,\n]/).map(s => s.trim()).filter(s => s.includes('@'));
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
          <div className="space-y-1.5">
            <Label>Schedule name</Label>
            <Input value={form.reportTitle} onChange={e => set('reportTitle', e.target.value)} placeholder="e.g. Weekly Portfolio Snapshot" />
          </div>
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
                <Input type="number" min={1} max={28} value={form.dayOfMonth} onChange={e => set('dayOfMonth', parseInt(e.target.value) || 1)} />
              </div>
            )}
            <div className="space-y-1.5">
              <Label>Time (24h)</Label>
              <div className="flex gap-1 items-center">
                <Input type="number" min={0} max={23} className="w-16 text-center" value={form.runAtHour} onChange={e => set('runAtHour', parseInt(e.target.value) || 0)} />
                <span className="text-muted-foreground font-mono">:</span>
                <Input type="number" min={0} max={59} step={5} className="w-16 text-center" value={form.runAtMinute} onChange={e => set('runAtMinute', parseInt(e.target.value) || 0)} />
              </div>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Recipients <span className="text-muted-foreground text-xs">(comma-separated emails)</span></Label>
            <Input value={form.recipients} onChange={e => set('recipients', e.target.value)} placeholder="director@example.com, safety@example.com" />
          </div>
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

// ─── Scheduled Reports panel (compact for dashboard placement) ────────────────

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
    <>
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs text-muted-foreground">Auto-generated and emailed on schedule (Europe/London).</p>
        <div className="flex gap-1.5">
          <Button variant="outline" size="sm" onClick={() => seedMutation.mutate()} disabled={seedMutation.isPending} className="h-7 text-xs">
            {seedMutation.isPending ? <Loader2 size={11} className="mr-1 animate-spin" /> : <RefreshCw size={11} className="mr-1" />}
            Defaults
          </Button>
          <Button size="sm" onClick={() => { setEditing(null); setDialogOpen(true); }} className="h-7 text-xs">
            <Plus size={11} className="mr-1" />New
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-12 w-full" />)}
        </div>
      ) : schedules.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          <CalendarClock size={28} className="mx-auto mb-2 opacity-30" />
          <p className="text-sm font-medium">No schedules yet</p>
          <p className="text-xs mt-1 mb-3">Click <strong>Defaults</strong> to add the 4 built-in schedules.</p>
          <Button variant="outline" size="sm" onClick={() => seedMutation.mutate()} disabled={seedMutation.isPending}>
            <RefreshCw size={11} className="mr-1" />Load Defaults
          </Button>
        </div>
      ) : (
        <div className="space-y-2 max-h-[340px] overflow-y-auto pr-0.5">
          {schedules.map(s => (
            <div
              key={s.id}
              className={`flex items-center gap-2.5 p-3 rounded-lg border bg-card transition-opacity ${s.enabled ? '' : 'opacity-55'}`}
            >
              <Switch
                checked={s.enabled}
                onCheckedChange={v => toggleMutation.mutate({ id: s.id, enabled: v })}
                className="shrink-0"
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <p className="text-sm font-medium truncate">{s.reportTitle}</p>
                  {s.isDefault && <Badge variant="outline" className="text-[10px] py-0 px-1">Default</Badge>}
                  {!s.enabled && <Badge variant="secondary" className="text-[10px] py-0 px-1">Off</Badge>}
                  <RunStatusBadge status={s.lastRunStatus} />
                </div>
                <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground flex-wrap">
                  <span className="flex items-center gap-1">
                    <CalendarClock size={10} />{describeSchedule(s)}
                  </span>
                  {Array.isArray(s.recipients) && s.recipients.length > 0 ? (
                    <span className="flex items-center gap-1">
                      <Mail size={10} />{s.recipients.length} recipient{s.recipients.length !== 1 ? 's' : ''}
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-amber-500">
                      <AlertTriangle size={10} />No recipients
                    </span>
                  )}
                </div>
              </div>
              <div className="flex gap-0.5 shrink-0">
                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => { setEditing(s); setDialogOpen(true); }} title="Edit">
                  <Settings2 size={12} />
                </Button>
                <Button
                  variant="ghost" size="icon" className="h-6 w-6 text-red-400 hover:text-red-600 hover:bg-red-50"
                  onClick={() => { if (confirm(`Delete "${s.reportTitle}"?`)) deleteMutation.mutate(s.id); }}
                  title="Delete"
                >
                  <Trash2 size={12} />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {schedules.filter(s => s.enabled && s.frequency === 'daily').length > 2 && (
        <div className="flex items-start gap-2 mt-3 p-2.5 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-800">
          <AlertTriangle size={13} className="mt-0.5 shrink-0" />
          <p>You have {schedules.filter(s => s.enabled && s.frequency === 'daily').length} daily schedules enabled.</p>
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
    </>
  );
}

// ─── Live Report Preview ───────────────────────────────────────────────────────

interface PreviewProps {
  reportType: ReportType;
  siteId: string;
  period: string;
  dateFrom: string;
  dateTo: string;
  sites: Site[];
  summary: SummaryData | undefined;
  siteRows: SiteRow[] | undefined;
  expiries: ExpiryRow[] | undefined;
  summaryLoading: boolean;
  sitesLoading: boolean;
  expiriesLoading: boolean;
}

function PreviewStatBox({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <div className="text-center px-3 py-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700/50">
      <div className="text-2xl font-bold tabular-nums" style={{ color: color ?? BRAND_BLUE }}>{value}</div>
      <div className="text-[10px] text-slate-500 mt-0.5 leading-tight">{label}</div>
    </div>
  );
}

function PreviewHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="rounded-t-lg px-4 py-3 flex items-center justify-between" style={{ backgroundColor: BRAND_BLUE }}>
      <div>
        <div className="text-xs font-bold text-white/70 tracking-widest uppercase">TPR MAX</div>
        <div className="text-sm font-semibold text-white leading-tight mt-0.5">{title}</div>
      </div>
      {subtitle && <div className="text-[10px] text-white/60 text-right">{subtitle}</div>}
    </div>
  );
}

function ReportPreview({
  reportType, siteId, period, dateFrom, dateTo,
  sites, summary, siteRows, expiries,
  summaryLoading, sitesLoading, expiriesLoading,
}: PreviewProps) {
  const loading = summaryLoading || sitesLoading || expiriesLoading;
  const selectedSite = sites.find(s => s.id === siteId);
  const selectedSiteRow = siteRows?.find(r => r.siteId === siteId);

  // Per-category expiry counts
  const catCounts = useMemo(() => {
    if (!expiries) return {} as Record<string, { lapsed: number; expiring: number }>;
    const map: Record<string, { lapsed: number; expiring: number }> = {};
    for (const row of expiries) {
      if (!map[row.category]) map[row.category] = { lapsed: 0, expiring: 0 };
      if (row.status === 'lapsed') map[row.category].lapsed++;
      else map[row.category].expiring++;
    }
    return map;
  }, [expiries]);

  // Grouped expiries for expiry_forecast
  const groupedExpiries = useMemo(() => {
    if (!expiries) return [];
    const map = new Map<string, { category: string; lapsed: number; expiring: number; earliest: string | null }>();
    for (const row of expiries) {
      const key = row.category;
      const ex = map.get(key);
      if (ex) {
        if (row.status === 'lapsed') ex.lapsed++; else ex.expiring++;
        if (row.expiresAt && (!ex.earliest || row.expiresAt < ex.earliest)) ex.earliest = row.expiresAt;
      } else {
        map.set(key, {
          category: row.category,
          lapsed: row.status === 'lapsed' ? 1 : 0,
          expiring: row.status === 'expiring' ? 1 : 0,
          earliest: row.expiresAt ?? null,
        });
      }
    }
    return Array.from(map.values()).sort((a, b) => {
      if (a.lapsed !== b.lapsed) return b.lapsed - a.lapsed;
      return b.expiring - a.expiring;
    });
  }, [expiries]);

  const compliantSites = useMemo(
    () => (summary?.siteScores ?? []).filter(s => s.score >= 80).length,
    [summary],
  );

  // ── Portfolio Compliance Snapshot ────────────────────────────────────────────
  if (reportType === 'portfolio_compliance_snapshot') {
    return (
      <div className="rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden text-sm">
        <PreviewHeader
          title="Portfolio Compliance Snapshot"
          subtitle={`Generated ${toGBDate(new Date().toISOString())}`}
        />
        {loading ? (
          <div className="p-4 space-y-3">
            {[1, 2, 3].map(i => <Skeleton key={i} className="h-10 w-full" />)}
          </div>
        ) : (
          <div className="p-4 space-y-4 bg-white dark:bg-slate-900">
            {/* Key metrics */}
            <div className="grid grid-cols-4 gap-2">
              <PreviewStatBox label="Overall Score" value={summary?.estateScore ?? 0} color={scoreColor(summary?.estateScore)} />
              <PreviewStatBox label="Critical Issues" value={summary?.openCriticals ?? 0} color="#e84040" />
              <PreviewStatBox label="Expiring (30d)" value={summary?.expiringItems ?? 0} color="#e8a000" />
              <PreviewStatBox label="Compliant Sites" value={`${compliantSites}/${summary?.siteCount ?? 0}`} color="#22a06b" />
            </div>

            {/* Category table */}
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 mb-1.5">Compliance by Category</p>
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-100 dark:border-slate-800">
                    <th className="text-left font-medium text-slate-500 py-1.5 pr-3">Category</th>
                    <th className="text-center font-medium text-slate-500 py-1.5 px-2">Score</th>
                    <th className="text-center font-medium text-slate-500 py-1.5 px-2">Expiring</th>
                    <th className="text-center font-medium text-slate-500 py-1.5 px-2">Lapsed</th>
                  </tr>
                </thead>
                <tbody>
                  {ORDERED_CATS.map(cat => {
                    const score = summary?.categoryScores?.[cat];
                    const cc = catCounts[cat] ?? { lapsed: 0, expiring: 0 };
                    const color = scoreColor(score);
                    return (
                      <tr key={cat} className="border-b border-slate-50 dark:border-slate-800/50 last:border-0">
                        <td className="py-1.5 pr-3 text-slate-700 dark:text-slate-300">{CATEGORY_LABELS[cat]}</td>
                        <td className="py-1.5 px-2 text-center">
                          <span className="font-semibold" style={{ color }}>
                            {score != null ? `${Math.round(score)}%` : '—'}
                          </span>
                        </td>
                        <td className="py-1.5 px-2 text-center">
                          {cc.expiring > 0 ? (
                            <span className="inline-flex items-center rounded px-1 py-0.5 font-semibold bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
                              {cc.expiring}
                            </span>
                          ) : <span className="text-slate-300">—</span>}
                        </td>
                        <td className="py-1.5 px-2 text-center">
                          {cc.lapsed > 0 ? (
                            <span className="inline-flex items-center rounded px-1 py-0.5 font-semibold bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300">
                              {cc.lapsed}
                            </span>
                          ) : <span className="text-slate-300">—</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Sites mini-table */}
            {siteRows && siteRows.length > 0 && (
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 mb-1.5">Site Scores</p>
                <div className="space-y-1">
                  {siteRows.slice(0, 5).map(s => (
                    <div key={s.siteId} className="flex items-center gap-2">
                      <span className="flex-1 text-xs text-slate-600 dark:text-slate-300 truncate">{s.siteName}</span>
                      <div className="flex-1 bg-slate-100 dark:bg-slate-800 rounded-full h-1.5 overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${s.score}%`, backgroundColor: scoreColor(s.score) }} />
                      </div>
                      <span className="text-xs font-semibold w-8 text-right tabular-nums" style={{ color: scoreColor(s.score) }}>{s.score}</span>
                    </div>
                  ))}
                  {siteRows.length > 5 && (
                    <p className="text-[10px] text-slate-400 text-center pt-0.5">+{siteRows.length - 5} more sites in PDF</p>
                  )}
                </div>
              </div>
            )}

            <p className="text-[10px] text-slate-400 text-center pt-1 border-t border-slate-100 dark:border-slate-800">
              This preview reflects live compliance data · Full PDF includes open alerts and induction records
            </p>
          </div>
        )}
      </div>
    );
  }

  // ── Single Site Report ────────────────────────────────────────────────────────
  if (reportType === 'single_site_report') {
    if (!siteId) {
      return (
        <div className="rounded-lg border border-dashed border-slate-200 dark:border-slate-700 p-8 text-center text-slate-400">
          <Building2 className="w-8 h-8 mx-auto mb-2 opacity-40" />
          <p className="text-sm">Select a site above to see a preview</p>
        </div>
      );
    }
    return (
      <div className="rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden text-sm">
        <PreviewHeader title={`Site Report — ${selectedSite?.name ?? siteId}`} subtitle={toGBDate(new Date().toISOString())} />
        {sitesLoading ? (
          <div className="p-4 space-y-2">{[1, 2, 3].map(i => <Skeleton key={i} className="h-8 w-full" />)}</div>
        ) : selectedSiteRow ? (
          <div className="p-4 space-y-4 bg-white dark:bg-slate-900">
            <div className="grid grid-cols-3 gap-2">
              <PreviewStatBox label="Compliance Score" value={selectedSiteRow.score} color={scoreColor(selectedSiteRow.score)} />
              <PreviewStatBox label="Critical Issues" value={selectedSiteRow.openCriticals} color="#e84040" />
              <PreviewStatBox label="Warnings" value={selectedSiteRow.openWarnings} color="#e8a000" />
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 mb-1.5">Category Breakdown</p>
              <div className="space-y-1.5">
                {ORDERED_CATS.map(cat => {
                  const score = selectedSiteRow.categoryScores?.[cat];
                  return (
                    <div key={cat} className="flex items-center gap-2">
                      <span className="w-24 text-xs text-slate-600 dark:text-slate-300 shrink-0">{CATEGORY_LABELS[cat]}</span>
                      <div className="flex-1 bg-slate-100 dark:bg-slate-800 rounded-full h-2 overflow-hidden">
                        {score != null && (
                          <div className="h-full rounded-full" style={{ width: `${score}%`, backgroundColor: scoreColor(score) }} />
                        )}
                      </div>
                      <span className="text-xs font-semibold w-8 text-right tabular-nums" style={{ color: scoreColor(score) }}>
                        {score != null ? `${Math.round(score)}%` : '—'}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
            <p className="text-[10px] text-slate-400 text-center border-t border-slate-100 dark:border-slate-800 pt-2">
              Full PDF includes all open alerts, contractor records, and induction evidence
            </p>
          </div>
        ) : (
          <div className="p-6 text-center text-slate-400">
            <p className="text-sm">No compliance data for this site yet — run an evaluation first.</p>
          </div>
        )}
      </div>
    );
  }

  // ── Expiry Forecast ───────────────────────────────────────────────────────────
  if (reportType === 'expiry_forecast') {
    return (
      <div className="rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden text-sm">
        <PreviewHeader title={`Expiry Forecast — Next ${period} Days`} subtitle={toGBDate(new Date().toISOString())} />
        {expiriesLoading ? (
          <div className="p-4 space-y-2">{[1, 2, 3].map(i => <Skeleton key={i} className="h-8 w-full" />)}</div>
        ) : (
          <div className="p-4 bg-white dark:bg-slate-900 space-y-3">
            {groupedExpiries.length === 0 ? (
              <div className="text-center py-6 text-slate-400">
                <ShieldCheck className="w-8 h-8 mx-auto mb-2 text-green-400" />
                <p className="text-sm text-green-600 dark:text-green-400">Nothing expiring in {period} days</p>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-2">
                  <PreviewStatBox
                    label={`Lapsed items`}
                    value={groupedExpiries.reduce((s, g) => s + g.lapsed, 0)}
                    color="#e84040"
                  />
                  <PreviewStatBox
                    label={`Expiring in ${period}d`}
                    value={groupedExpiries.reduce((s, g) => s + g.expiring, 0)}
                    color="#e8a000"
                  />
                </div>
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-slate-100 dark:border-slate-800">
                      <th className="text-left font-medium text-slate-500 py-1.5 pr-3">Category</th>
                      <th className="text-center font-medium text-slate-500 py-1.5 px-2">Lapsed</th>
                      <th className="text-center font-medium text-slate-500 py-1.5 px-2">Expiring</th>
                      <th className="text-right font-medium text-slate-500 py-1.5 pl-2">Earliest</th>
                    </tr>
                  </thead>
                  <tbody>
                    {groupedExpiries.map(g => (
                      <tr key={g.category} className="border-b border-slate-50 dark:border-slate-800/50 last:border-0">
                        <td className="py-1.5 pr-3 text-slate-700 dark:text-slate-300">{CATEGORY_LABELS[g.category] ?? g.category}</td>
                        <td className="py-1.5 px-2 text-center">
                          {g.lapsed > 0 ? <span className="font-semibold text-red-600">{g.lapsed}</span> : <span className="text-slate-300">—</span>}
                        </td>
                        <td className="py-1.5 px-2 text-center">
                          {g.expiring > 0 ? <span className="font-semibold text-amber-600">{g.expiring}</span> : <span className="text-slate-300">—</span>}
                        </td>
                        <td className="py-1.5 pl-2 text-right text-slate-500">{toGBDate(g.earliest)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
            <p className="text-[10px] text-slate-400 text-center border-t border-slate-100 dark:border-slate-800 pt-2">
              Full PDF includes individual item names, companies, and site locations
            </p>
          </div>
        )}
      </div>
    );
  }

  // ── PPM Performance ───────────────────────────────────────────────────────────
  if (reportType === 'ppm_performance') {
    const ppmScore = summary?.categoryScores?.ppm;
    const ppmLapsed = catCounts['ppm']?.lapsed ?? 0;
    const ppmExpiring = catCounts['ppm']?.expiring ?? 0;
    return (
      <div className="rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden text-sm">
        <PreviewHeader title="PPM Performance Report" subtitle={toGBDate(new Date().toISOString())} />
        {summaryLoading ? (
          <div className="p-4 space-y-2">{[1, 2].map(i => <Skeleton key={i} className="h-10 w-full" />)}</div>
        ) : (
          <div className="p-4 bg-white dark:bg-slate-900 space-y-3">
            <div className="grid grid-cols-3 gap-2">
              <PreviewStatBox label="PPM Score" value={ppmScore != null ? `${Math.round(ppmScore)}%` : '—'} color={scoreColor(ppmScore)} />
              <PreviewStatBox label="Overdue WOs" value={ppmLapsed} color="#e84040" />
              <PreviewStatBox label="Due Soon" value={ppmExpiring} color="#e8a000" />
            </div>
            {siteRows && siteRows.length > 0 && (
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 mb-1.5">PPM by Site</p>
                <div className="space-y-1.5">
                  {siteRows.slice(0, 5).map(s => {
                    const sitePpm = s.categoryScores?.ppm;
                    return (
                      <div key={s.siteId} className="flex items-center gap-2">
                        <span className="flex-1 text-xs text-slate-600 dark:text-slate-300 truncate">{s.siteName}</span>
                        <div className="flex-1 bg-slate-100 dark:bg-slate-800 rounded-full h-1.5 overflow-hidden">
                          <div className="h-full rounded-full" style={{ width: `${sitePpm ?? 0}%`, backgroundColor: scoreColor(sitePpm) }} />
                        </div>
                        <span className="text-xs font-semibold w-8 text-right" style={{ color: scoreColor(sitePpm) }}>
                          {sitePpm != null ? `${Math.round(sitePpm)}%` : '—'}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            <p className="text-[10px] text-slate-400 text-center border-t border-slate-100 dark:border-slate-800 pt-2">
              Full PDF includes individual work order details and completion timelines
            </p>
          </div>
        )}
      </div>
    );
  }

  // ── Contractor Compliance Report ──────────────────────────────────────────────
  if (reportType === 'contractor_compliance_report') {
    const insScore = summary?.categoryScores?.insurance;
    const ramsScore = summary?.categoryScores?.rams;
    const indScore = summary?.categoryScores?.inductions;
    return (
      <div className="rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden text-sm">
        <PreviewHeader title="Contractor Compliance Report" subtitle={toGBDate(new Date().toISOString())} />
        {summaryLoading ? (
          <div className="p-4 space-y-2">{[1, 2].map(i => <Skeleton key={i} className="h-10 w-full" />)}</div>
        ) : (
          <div className="p-4 bg-white dark:bg-slate-900 space-y-3">
            <div className="grid grid-cols-3 gap-2">
              <PreviewStatBox label="Insurance Score" value={insScore != null ? `${Math.round(insScore)}%` : '—'} color={scoreColor(insScore)} />
              <PreviewStatBox label="RAMS Score" value={ramsScore != null ? `${Math.round(ramsScore)}%` : '—'} color={scoreColor(ramsScore)} />
              <PreviewStatBox label="Inductions Score" value={indScore != null ? `${Math.round(indScore)}%` : '—'} color={scoreColor(indScore)} />
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 mb-1">Contractor document issues (30 days)</p>
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-100 dark:border-slate-800">
                    <th className="text-left font-medium text-slate-500 py-1.5 pr-3">Category</th>
                    <th className="text-center font-medium text-slate-500 py-1.5 px-2">Lapsed</th>
                    <th className="text-center font-medium text-slate-500 py-1.5 px-2">Expiring</th>
                  </tr>
                </thead>
                <tbody>
                  {(['insurance', 'rams', 'inductions', 'rtw'] as const).map(cat => {
                    const cc = catCounts[cat] ?? { lapsed: 0, expiring: 0 };
                    return (
                      <tr key={cat} className="border-b border-slate-50 dark:border-slate-800/50 last:border-0">
                        <td className="py-1.5 pr-3 text-slate-700 dark:text-slate-300">{CATEGORY_LABELS[cat]}</td>
                        <td className="py-1.5 px-2 text-center">
                          {cc.lapsed > 0 ? <span className="font-semibold text-red-600">{cc.lapsed}</span> : <span className="text-slate-300">—</span>}
                        </td>
                        <td className="py-1.5 px-2 text-center">
                          {cc.expiring > 0 ? <span className="font-semibold text-amber-600">{cc.expiring}</span> : <span className="text-slate-300">—</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="text-[10px] text-slate-400 text-center border-t border-slate-100 dark:border-slate-800 pt-2">
              Full PDF includes per-company breakdown with document names and expiry dates
            </p>
          </div>
        )}
      </div>
    );
  }

  // ── Muster / Evacuation Log ───────────────────────────────────────────────────
  if (reportType === 'evacuation_muster_log') {
    if (!siteId) {
      return (
        <div className="rounded-lg border border-dashed border-slate-200 dark:border-slate-700 p-8 text-center text-slate-400">
          <Flame className="w-8 h-8 mx-auto mb-2 opacity-40" />
          <p className="text-sm">Select a site above to generate the muster log preview</p>
        </div>
      );
    }
    return (
      <div className="rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden text-sm">
        <PreviewHeader title={`Evacuation / Muster Log — ${selectedSite?.name ?? siteId}`} subtitle={toGBDate(new Date().toISOString())} />
        <div className="p-5 bg-white dark:bg-slate-900 text-center text-slate-500">
          <Flame className="w-8 h-8 mx-auto mb-2 text-amber-400" />
          <p className="text-sm font-medium">Muster event history</p>
          <p className="text-xs mt-1 text-slate-400">The PDF will contain every muster event for <strong>{selectedSite?.name}</strong>, including headcount, accountability timestamps, and unaccounted personnel.</p>
        </div>
      </div>
    );
  }

  // ── Audit Trail Export ────────────────────────────────────────────────────────
  if (reportType === 'audit_trail_export') {
    return (
      <div className="rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden text-sm">
        <PreviewHeader title="Audit Trail Export" subtitle={`${toGBDate(dateFrom)} – ${toGBDate(dateTo)}`} />
        <div className="p-5 bg-white dark:bg-slate-900 space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <PreviewStatBox label="Critical alerts (total)" value={summary?.openCriticals ?? '—'} color="#e84040" />
            <PreviewStatBox label="Warnings (total)" value={summary?.openWarnings ?? '—'} color="#e8a000" />
          </div>
          <div className="rounded-lg bg-slate-50 dark:bg-slate-800/60 p-3 text-xs text-slate-600 dark:text-slate-300 space-y-1">
            <p><span className="font-medium">Period:</span> {toGBDate(dateFrom)} to {toGBDate(dateTo)}</p>
            <p><span className="font-medium">Includes:</span> Compliance alerts, notification history, acknowledgements, status changes</p>
            <p><span className="font-medium">Format:</span> Chronological, timestamped, with user attribution</p>
          </div>
          <p className="text-[10px] text-slate-400 text-center border-t border-slate-100 dark:border-slate-800 pt-2">
            Full PDF includes every compliance event within the date range
          </p>
        </div>
      </div>
    );
  }

  return null;
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

  const STALE = 60_000;

  const { data: rawSites = [] } = useQuery<any[]>({
    queryKey: ['/api/enterprise/sites'],
    staleTime: STALE,
  });
  const sites = useMemo<Site[]>(
    () => rawSites.map(s => ({ id: s.id, name: s.name, reference: s.siteReference ?? undefined })),
    [rawSites],
  );

  const { data: poolHealth } = useQuery<{
    total: number; compliant: number; needsAttention: number;
    pendingCompanies: string[]; totalMissingDocs: number;
  }>({
    queryKey: ['/api/enterprise/compliance/contractor-pool-health'],
    staleTime: STALE,
  });

  const { data: history = [], isLoading: histLoading, isError: histError, error: histErrorObj, refetch: refetchHist } = useQuery<ReportRecord[]>({
    queryKey: ['/api/enterprise/reports'],
    refetchInterval: 5000,
  });

  const { data: summary, isLoading: summaryLoading } = useQuery<SummaryData>({
    queryKey: ['/api/enterprise/compliance/summary'],
    staleTime: STALE,
    refetchOnWindowFocus: true,
  });

  const { data: siteRows, isLoading: sitesLoading } = useQuery<SiteRow[]>({
    queryKey: ['/api/enterprise/compliance/sites'],
    staleTime: STALE,
    refetchOnWindowFocus: true,
  });

  const expiryDays = meta.requiresPeriod ? period : '30';
  const { data: expiries, isLoading: expiriesLoading } = useQuery<ExpiryRow[]>({
    queryKey: ['/api/enterprise/compliance/expiries', { days: expiryDays }],
    queryFn: async () => {
      const r = await fetch(`/api/enterprise/compliance/expiries?days=${expiryDays}`, { credentials: 'include' });
      if (!r.ok) throw new Error("Failed to load expiries");
      return r.json();
    },
    staleTime: STALE,
    refetchOnWindowFocus: true,
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
    onError: (err: any) => toast({ title: 'Generation failed', description: err?.message || err?.detail || 'Unable to generate report.', variant: 'destructive' }),
  });

  const canGenerate = !generateMutation.isPending && (!meta.requiresSite || siteId.length > 0);

  // Sorted site rows — worst first for portfolio preview
  const sortedSiteRows = useMemo(
    () => (siteRows ?? []).slice().sort((a, b) => a.score - b.score),
    [siteRows],
  );

  if (histError) {
    const is403 = (histErrorObj as any)?.status === 403;
    return (
      <div className="p-6 flex items-center justify-center min-h-64">
        <Card className="p-8 max-w-sm text-center space-y-3">
          <div className="w-12 h-12 rounded-xl bg-amber-50 dark:bg-amber-900/20 flex items-center justify-center mx-auto">
            <ShieldCheck size={24} className="text-amber-400" />
          </div>
          <h2 className="font-semibold">{is403 ? "Access restricted" : "Couldn't load reports"}</h2>
          <p className="text-sm text-muted-foreground">
            {is403
              ? "You don't have enterprise access for this customer. Ask an Enterprise Admin to grant you a role."
              : "The request failed — please try again or contact your administrator."}
          </p>
          {!is403 && (
            <Button variant="outline" size="sm" onClick={() => refetchHist()}>Try again</Button>
          )}
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-5">

      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg" style={{ backgroundColor: `${BRAND_BLUE}18` }}>
          <FileBarChart size={22} style={{ color: BRAND_BLUE }} />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Portfolio Reports</h1>
          <p className="text-sm text-muted-foreground">Generate board-ready PDFs, preview contents live, or schedule automatic delivery.</p>
        </div>
      </div>

      {/* ── Contractor Pool Health Banner ── */}
      {poolHealth && poolHealth.needsAttention > 0 && (
        <div className="flex items-start gap-3 p-4 rounded-xl border border-amber-200 bg-amber-50 dark:border-amber-800/40 dark:bg-amber-900/10">
          <AlertTriangle size={16} className="text-amber-500 mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">
              Contractor pool has {poolHealth.needsAttention} of {poolHealth.total} companies with compliance gaps
            </p>
            <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">
              {poolHealth.totalMissingDocs} missing key document{poolHealth.totalMissingDocs !== 1 ? 's' : ''} across pending companies.
              The compliance score only includes documents linked to a specific site — unlinked contractor documents do not affect these reports.
            </p>
          </div>
          <a href="/enterprise/contractor-pool" className="text-xs font-medium text-amber-700 dark:text-amber-400 underline underline-offset-2 shrink-0">
            View pool
          </a>
        </div>
      )}

      {/* ── Row 1: Builder + Preview ── */}
      <div className="grid grid-cols-1 xl:grid-cols-5 gap-5">

        {/* Report Builder */}
        <Card className="xl:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold text-slate-700 dark:text-slate-200">Report Builder</CardTitle>
          </CardHeader>
          <CardContent className="pt-0 space-y-4">
            {/* Report type list */}
            <div className="space-y-1">
              {REPORT_TYPES.map(rt => {
                const Icon = rt.icon;
                const isSelected = rt.id === selected;
                return (
                  <button
                    key={rt.id}
                    onClick={() => { setSelected(rt.id); setSiteId(''); }}
                    className={`w-full text-left px-3 py-2 rounded-lg border transition-all flex items-center gap-2.5 ${
                      isSelected
                        ? 'border-primary bg-primary/5 shadow-sm'
                        : 'border-transparent hover:border-border hover:bg-muted/30'
                    }`}
                  >
                    <Icon size={14} className={`shrink-0 ${isSelected ? 'text-primary' : 'text-muted-foreground'}`} />
                    <span className={`text-sm font-medium flex-1 ${isSelected ? 'text-primary' : 'text-slate-700 dark:text-slate-300'}`}>
                      {rt.label}
                    </span>
                    <span className="text-[10px] text-muted-foreground/60 flex items-center gap-0.5 shrink-0">
                      <Clock size={9} />{rt.timeEst}
                    </span>
                    {isSelected && <ChevronRight size={13} className="text-primary shrink-0" />}
                  </button>
                );
              })}
            </div>

            {/* Scope / Period / Format controls */}
            <div className="border-t border-slate-100 dark:border-slate-800 pt-4 space-y-3">
              {meta.requiresSite && (
                <div className="space-y-1.5">
                  <Label className="text-xs">Site <span className="text-red-500">*</span></Label>
                  <Select value={siteId} onValueChange={setSiteId}>
                    <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Select a site…" /></SelectTrigger>
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
                  <Label className="text-xs">Forecast period</Label>
                  <Select value={period} onValueChange={setPeriod}>
                    <SelectTrigger className="h-8 text-sm w-40"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="30">Next 30 days</SelectItem>
                      <SelectItem value="60">Next 60 days</SelectItem>
                      <SelectItem value="90">Next 90 days</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
              {meta.requiresDates && (
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1.5">
                    <Label className="text-xs">From</Label>
                    <Input type="date" className="h-8 text-sm" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">To</Label>
                    <Input type="date" className="h-8 text-sm" value={dateTo} onChange={e => setDateTo(e.target.value)} />
                  </div>
                </div>
              )}
              {!meta.requiresSite && !meta.requiresPeriod && !meta.requiresDates && (
                <p className="text-xs text-muted-foreground bg-muted/40 rounded-md px-3 py-2">
                  No additional configuration — scoped to your access level automatically.
                </p>
              )}
            </div>

            {/* Format note + Generate */}
            <div className="border-t border-slate-100 dark:border-slate-800 pt-3 space-y-2.5">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Format</span>
                <span className="font-medium">PDF (A4, branded)</span>
              </div>
              <Button className="w-full" disabled={!canGenerate} onClick={() => generateMutation.mutate()}>
                {generateMutation.isPending
                  ? <><Loader2 size={14} className="mr-2 animate-spin" />Generating PDF…</>
                  : <><FileBarChart size={14} className="mr-2" />Generate PDF Report</>}
              </Button>
              {generateMutation.isPending && (
                <p className="text-xs text-center text-muted-foreground">Building your report — up to 30 seconds for large estates.</p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Live Preview */}
        <Card className="xl:col-span-3">
          <CardHeader className="pb-3 flex flex-row items-center justify-between">
            <CardTitle className="text-base font-semibold text-slate-700 dark:text-slate-200">
              Live Preview
            </CardTitle>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <TrendingUp size={12} />
              <span>Sourced from live compliance data</span>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <ReportPreview
              reportType={selected}
              siteId={siteId}
              period={period}
              dateFrom={dateFrom}
              dateTo={dateTo}
              sites={sites}
              summary={summary}
              siteRows={sortedSiteRows}
              expiries={expiries}
              summaryLoading={summaryLoading}
              sitesLoading={sitesLoading}
              expiriesLoading={expiriesLoading}
            />
          </CardContent>
        </Card>
      </div>

      {/* ── Row 2: Recent + Scheduled ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

        {/* Recent Reports */}
        <Card>
          <CardHeader className="pb-3 flex flex-row items-center justify-between">
            <CardTitle className="text-base font-semibold text-slate-700 dark:text-slate-200">Recent Reports</CardTitle>
            {!histLoading && history.length > 0 && (
              <Badge variant="outline" className="text-xs">{history.length}</Badge>
            )}
          </CardHeader>
          <CardContent className="pt-0">
            {histLoading ? (
              <div className="space-y-2">
                {[1, 2, 3].map(i => <Skeleton key={i} className="h-14 w-full" />)}
              </div>
            ) : history.length === 0 ? (
              <div className="text-center py-10 text-muted-foreground">
                <FileText size={28} className="mx-auto mb-2 opacity-30" />
                <p className="text-sm font-medium">No reports generated yet</p>
                <p className="text-xs mt-1">Generate a report above — it will appear here.</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-[340px] overflow-y-auto">
                {history.map(r => {
                  const rtMeta = REPORT_TYPES.find(x => x.id === r.reportType);
                  const Icon = rtMeta?.icon ?? FileText;
                  return (
                    <div key={r.id} className="flex items-center gap-3 p-3 border rounded-lg hover:bg-muted/20 transition-colors">
                      <Icon size={15} className="text-muted-foreground shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{r.reportTitle}</p>
                        <div className="flex items-center gap-2 mt-0.5 flex-wrap text-xs text-muted-foreground">
                          <span>{fmtDate(r.createdAt)}</span>
                          {r.generatedByName && <span>by {r.generatedByName}</span>}
                          {r.fileSizeBytes && <span>{fmtBytes(r.fileSizeBytes)}</span>}
                          {r.status === 'failed' && r.errorMessage && (
                            <span className="text-red-600 truncate max-w-40">{r.errorMessage}</span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <StatusBadge status={r.status} />
                        {r.status === 'ready' && r.downloadUrl && (
                          <a
                            href={r.downloadUrl}
                            className="flex items-center gap-1 text-xs font-medium hover:underline"
                            style={{ color: BRAND_BLUE }}
                            download
                          >
                            <Download size={13} />PDF
                          </a>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Scheduled Reports */}
        <Card>
          <CardHeader className="pb-3 flex flex-row items-center justify-between">
            <CardTitle className="text-base font-semibold text-slate-700 dark:text-slate-200">Scheduled Reports</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <ScheduledReportsPanel sites={sites} />
          </CardContent>
        </Card>
      </div>

    </div>
  );
}
