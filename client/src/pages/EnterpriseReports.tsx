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
import {
  BarChart3, FileText, HardHat, Clock, Building2, Shield,
  Calendar, Download, Loader2, CheckCircle2, XCircle, AlertTriangle,
  FileBarChart, ClipboardList, Flame, ChevronRight
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

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

function StatusBadge({ status }: { status: string }) {
  if (status === 'ready') return <Badge className="bg-green-600 hover:bg-green-700 text-xs"><CheckCircle2 size={10} className="mr-1" />Ready</Badge>;
  if (status === 'failed') return <Badge variant="destructive" className="text-xs"><XCircle size={10} className="mr-1" />Failed</Badge>;
  return <Badge variant="secondary" className="text-xs"><Loader2 size={10} className="mr-1 animate-spin" />Generating</Badge>;
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

      // If the server returned PDF inline (no GCS), trigger browser download
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
        toast({
          title: 'Report ready',
          description: `${data.title} (${fmtBytes(data.fileSizeBytes)}) is ready to download.`,
        });
      } else {
        toast({ title: 'Report generated', description: 'PDF downloaded directly.' });
      }
    },
    onError: () => toast({ title: 'Generation failed', description: 'Unable to generate report. Check the logs.', variant: 'destructive' }),
  });

  const canGenerate = !generateMutation.isPending && (
    !meta.requiresSite || siteId.length > 0
  );

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-primary/10">
          <FileBarChart size={22} className="text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Portfolio Reports</h1>
          <p className="text-sm text-muted-foreground">Generate board-ready PDF reports across your estate.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* ── Report type selector ── */}
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

        {/* ── Configuration + Generate ── */}
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
              {/* Site selector */}
              {meta.requiresSite && (
                <div className="space-y-1.5">
                  <Label>Site <span className="text-red-500">*</span></Label>
                  <Select value={siteId} onValueChange={setSiteId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a site…" />
                    </SelectTrigger>
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

              {/* Expiry period */}
              {meta.requiresPeriod && (
                <div className="space-y-1.5">
                  <Label>Forecast period</Label>
                  <Select value={period} onValueChange={setPeriod}>
                    <SelectTrigger className="w-40">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="30">Next 30 days</SelectItem>
                      <SelectItem value="60">Next 60 days</SelectItem>
                      <SelectItem value="90">Next 90 days</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Date range */}
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
                  No additional configuration required. The report will be scoped to your access level automatically.
                </p>
              )}

              <Separator />

              <Button
                className="w-full"
                disabled={!canGenerate}
                onClick={() => generateMutation.mutate()}
              >
                {generateMutation.isPending ? (
                  <><Loader2 size={15} className="mr-2 animate-spin" />Generating PDF…</>
                ) : (
                  <><FileBarChart size={15} className="mr-2" />Generate PDF Report</>
                )}
              </Button>

              {generateMutation.isPending && (
                <p className="text-xs text-center text-muted-foreground">
                  Building your report — this may take up to 30 seconds for large estates.
                </p>
              )}
            </CardContent>
          </Card>

          {/* ── Recent reports history ── */}
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
                        <a
                          href={r.downloadUrl}
                          className="flex items-center gap-1 text-xs text-primary hover:underline ml-1"
                          download
                        >
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
    </div>
  );
}
