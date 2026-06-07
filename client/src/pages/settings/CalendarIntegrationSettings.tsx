import { useEffect, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import {
  Calendar, RefreshCw, Trash2, ExternalLink, Loader2, CheckCircle,
  AlertCircle, Settings2, Clock, Users, Globe
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

interface CalendarConnection {
  id: number;
  provider: 'microsoft' | 'google';
  connected_by: string;
  connected_email: string | null;
  active: boolean;
  last_synced_at: string | null;
  sync_window_days: number;
  auto_create_pre_reg: boolean;
  notify_on_create: boolean;
  domain_filter: string | null;
  created_at: string;
}

interface SyncHistory {
  id: number;
  provider: string;
  connected_email: string;
  event_title: string;
  attendee_email: string;
  event_start: string;
  synced_at: string;
}

interface SettingsForm {
  syncWindowDays: string;
  autoCreatePreReg: boolean;
  domainFilter: string;
}

const PROVIDER_LABELS: Record<string, { name: string; color: string }> = {
  microsoft: { name: 'Microsoft 365', color: 'bg-blue-50 border-blue-200 text-blue-700 dark:bg-blue-950/40 dark:border-blue-800 dark:text-blue-300' },
  google: { name: 'Google Calendar', color: 'bg-red-50 border-red-200 text-red-700 dark:bg-red-950/40 dark:border-red-800 dark:text-red-300' },
};

function formatRelativeTime(dateStr: string | null): string {
  if (!dateStr) return 'Never';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 2) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return new Date(dateStr).toLocaleDateString('en-GB');
}

export default function CalendarIntegrationSettings() {
  const { toast } = useToast();
  const [location] = useLocation();
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<SettingsForm>({ syncWindowDays: '7', autoCreatePreReg: true, domainFilter: '' });
  const [syncingId, setSyncingId] = useState<number | null>(null);

  // Show toast on OAuth redirect
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const connected = params.get('connected');
    const error = params.get('error');
    if (connected) {
      toast({ title: `${PROVIDER_LABELS[connected]?.name || connected} calendar connected ✅`, description: 'First sync will run within 15 minutes.' });
      window.history.replaceState({}, '', '/settings/calendar-integration');
    }
    if (error) {
      toast({ title: 'Connection failed', description: decodeURIComponent(error), variant: 'destructive' });
      window.history.replaceState({}, '', '/settings/calendar-integration');
    }
  }, []);

  const { data: connections = [], isLoading } = useQuery<CalendarConnection[]>({
    queryKey: ['/api/calendar/connections'],
    queryFn: async () => {
      const res = await fetch('/api/calendar/connections');
      if (!res.ok) throw new Error('Failed to fetch');
      return res.json();
    },
  });

  const { data: history = [] } = useQuery<SyncHistory[]>({
    queryKey: ['/api/calendar/history'],
    queryFn: async () => {
      const res = await fetch('/api/calendar/history');
      if (!res.ok) return [];
      return res.json();
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Partial<SettingsForm> }) => {
      const res = await apiRequest('PUT', `/api/calendar/connections/${id}`, {
        syncWindowDays: data.syncWindowDays ? parseInt(data.syncWindowDays) : undefined,
        autoCreatePreReg: data.autoCreatePreReg,
        domainFilter: data.domainFilter || null,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/calendar/connections'] });
      toast({ title: 'Settings updated' });
      setEditingId(null);
    },
    onError: () => toast({ title: 'Update failed', variant: 'destructive' }),
  });

  const disconnectMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest('DELETE', `/api/calendar/connections/${id}`, {});
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/calendar/connections'] });
      toast({ title: 'Calendar disconnected' });
    },
    onError: () => toast({ title: 'Disconnect failed', variant: 'destructive' }),
  });

  const syncNow = async (id: number) => {
    setSyncingId(id);
    try {
      const res = await apiRequest('POST', `/api/calendar/connections/${id}/sync`, {});
      const data = await res.json();
      if (data.success) {
        queryClient.invalidateQueries({ queryKey: ['/api/calendar/connections'] });
        queryClient.invalidateQueries({ queryKey: ['/api/calendar/history'] });
        toast({ title: 'Sync complete', description: `${data.created} pre-registration(s) created.` });
      } else {
        toast({ title: 'Sync failed', description: data.error, variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Sync failed', variant: 'destructive' });
    } finally {
      setSyncingId(null);
    }
  };

  const openEdit = (conn: CalendarConnection) => {
    setEditForm({
      syncWindowDays: String(conn.sync_window_days || 7),
      autoCreatePreReg: conn.auto_create_pre_reg,
      domainFilter: conn.domain_filter || '',
    });
    setEditingId(conn.id);
  };

  const hasMicrosoft = connections.some(c => c.provider === 'microsoft');
  const hasGoogle = connections.some(c => c.provider === 'google');

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start gap-4">
        <div className="p-3 rounded-xl bg-violet-500/10 border border-violet-200 dark:border-violet-800">
          <Calendar className="h-6 w-6 text-violet-600 dark:text-violet-400" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Calendar Integration</h1>
          <p className="text-slate-500 dark:text-slate-400 mt-0.5 max-w-2xl">
            Connect Outlook or Google Calendar to automatically create visitor pre-registrations
            when you invite external attendees to meetings — no manual entry needed.
          </p>
        </div>
      </div>

      {/* Connect buttons */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Microsoft */}
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-8 h-8 rounded flex items-center justify-center bg-blue-600 text-white text-sm font-bold">M</div>
            <div>
              <p className="font-semibold text-slate-900 dark:text-white">Microsoft 365</p>
              <p className="text-xs text-slate-500">Outlook Calendar</p>
            </div>
            {hasMicrosoft && <Badge className="ml-auto bg-green-100 text-green-700 border-green-200">Connected</Badge>}
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
            Uses Microsoft Graph API. Requires <code className="text-xs bg-slate-100 dark:bg-slate-800 px-1 rounded">Calendars.Read</code> permission.
          </p>
          <Button
            className="w-full"
            variant={hasMicrosoft ? 'outline' : 'default'}
            onClick={() => window.location.href = '/api/calendar/microsoft/connect'}
          >
            <ExternalLink className="h-4 w-4 mr-2" />
            {hasMicrosoft ? 'Connect another account' : 'Connect Microsoft 365'}
          </Button>
        </div>

        {/* Google */}
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-8 h-8 rounded flex items-center justify-center bg-red-500 text-white text-sm font-bold">G</div>
            <div>
              <p className="font-semibold text-slate-900 dark:text-white">Google Calendar</p>
              <p className="text-xs text-slate-500">Google Workspace / personal</p>
            </div>
            {hasGoogle && <Badge className="ml-auto bg-green-100 text-green-700 border-green-200">Connected</Badge>}
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
            Read-only access to calendar events. Requires Google OAuth app credentials.
          </p>
          <Button
            className="w-full"
            variant={hasGoogle ? 'outline' : 'default'}
            onClick={() => window.location.href = '/api/calendar/google/connect'}
          >
            <ExternalLink className="h-4 w-4 mr-2" />
            {hasGoogle ? 'Connect another account' : 'Connect Google Calendar'}
          </Button>
        </div>
      </div>

      {/* How it works info */}
      <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 p-4 flex gap-3">
        <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
        <div className="text-sm text-amber-800 dark:text-amber-300 space-y-1">
          <p className="font-medium">How it works</p>
          <p>TPR checks your calendar every 15 minutes. When it finds a meeting with external attendees (people not on your domain), it creates a visitor pre-registration automatically — so reception knows to expect them.</p>
        </div>
      </div>

      {/* Connected calendars */}
      {isLoading ? (
        <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>
      ) : connections.length > 0 ? (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider">Connected calendars</h2>
          {connections.map(conn => {
            const providerInfo = PROVIDER_LABELS[conn.provider] || { name: conn.provider, color: '' };
            return (
              <div key={conn.id} className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0">
                    <div className={`inline-flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded-full border ${providerInfo.color} flex-shrink-0`}>
                      {providerInfo.name}
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium text-slate-900 dark:text-white truncate">
                        {conn.connected_email || conn.connected_by}
                      </p>
                      <div className="flex items-center gap-3 mt-1 text-xs text-slate-400">
                        <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> Synced {formatRelativeTime(conn.last_synced_at)}</span>
                        <span className="flex items-center gap-1"><Globe className="h-3 w-3" /> {conn.sync_window_days}d ahead</span>
                        {conn.domain_filter && <span className="flex items-center gap-1"><Users className="h-3 w-3" /> Internal: @{conn.domain_filter}</span>}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs" onClick={() => syncNow(conn.id)} disabled={syncingId === conn.id}>
                      {syncingId === conn.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                      Sync now
                    </Button>
                    <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => openEdit(conn)}>
                      <Settings2 className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="sm" variant="outline" className="h-8 text-xs text-red-600 hover:border-red-300" onClick={() => disconnectMutation.mutate(conn.id)} disabled={disconnectMutation.isPending}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
                <div className="mt-3 flex items-center gap-3 text-xs text-slate-500">
                  <span className={`flex items-center gap-1 ${conn.auto_create_pre_reg ? 'text-green-600' : 'text-slate-400'}`}>
                    <CheckCircle className="h-3 w-3" />
                    {conn.auto_create_pre_reg ? 'Auto pre-registration on' : 'Auto pre-registration off'}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      ) : null}

      {/* Sync history */}
      {history.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider">Recently auto-created pre-registrations</h2>
          <div className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800">
                <tr>
                  <th className="text-left px-4 py-2.5 font-medium text-slate-600 dark:text-slate-400">Attendee</th>
                  <th className="text-left px-4 py-2.5 font-medium text-slate-600 dark:text-slate-400 hidden sm:table-cell">Meeting</th>
                  <th className="text-left px-4 py-2.5 font-medium text-slate-600 dark:text-slate-400 hidden md:table-cell">Meeting date</th>
                  <th className="text-left px-4 py-2.5 font-medium text-slate-600 dark:text-slate-400">Synced</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {history.map(item => (
                  <tr key={item.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                    <td className="px-4 py-3 text-slate-800 dark:text-slate-200">{item.attendee_email}</td>
                    <td className="px-4 py-3 text-slate-500 hidden sm:table-cell truncate max-w-xs">{item.event_title}</td>
                    <td className="px-4 py-3 text-slate-500 hidden md:table-cell">
                      {item.event_start ? new Date(item.event_start).toLocaleDateString('en-GB') : '—'}
                    </td>
                    <td className="px-4 py-3 text-slate-400 text-xs">{formatRelativeTime(item.synced_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Edit settings dialog */}
      <Dialog open={editingId !== null} onOpenChange={o => { if (!o) setEditingId(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Connection settings</DialogTitle>
            <DialogDescription>Adjust how this calendar is synced.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Sync window (days ahead)</Label>
              <Select value={editForm.syncWindowDays} onValueChange={v => setEditForm(f => ({ ...f, syncWindowDays: v }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="3">3 days</SelectItem>
                  <SelectItem value="7">7 days</SelectItem>
                  <SelectItem value="14">14 days</SelectItem>
                  <SelectItem value="30">30 days</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Internal domain (skip these attendees)</Label>
              <Input
                placeholder="e.g. yourcompany.com"
                value={editForm.domainFilter}
                onChange={e => setEditForm(f => ({ ...f, domainFilter: e.target.value }))}
              />
              <p className="text-xs text-slate-400">Attendees with this domain are treated as internal and won't get a pre-registration.</p>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-800 dark:text-slate-200">Auto-create pre-registrations</p>
                <p className="text-xs text-slate-500">When off, events are logged but no pre-reg is created.</p>
              </div>
              <Switch
                checked={editForm.autoCreatePreReg}
                onCheckedChange={v => setEditForm(f => ({ ...f, autoCreatePreReg: v }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingId(null)}>Cancel</Button>
            <Button onClick={() => updateMutation.mutate({ id: editingId!, data: editForm })} disabled={updateMutation.isPending}>
              {updateMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
