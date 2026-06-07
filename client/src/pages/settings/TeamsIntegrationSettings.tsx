import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Webhook, Plus, Trash2, TestTube, CheckCircle, XCircle, Loader2, ToggleLeft, ToggleRight, ExternalLink, Bell, BellOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

interface TeamsWebhook {
  id: number;
  name: string;
  webhook_url: string;
  active: boolean;
  notify_visitor_arrival: boolean;
  notify_evacuation: boolean;
  notify_riddor: boolean;
  notify_compliance_red: boolean;
  notify_document_expiry: boolean;
  created_at: string;
}

interface WebhookForm {
  name: string;
  webhookUrl: string;
  notifyVisitorArrival: boolean;
  notifyEvacuation: boolean;
  notifyRiddor: boolean;
  notifyComplianceRed: boolean;
  notifyDocumentExpiry: boolean;
}

const EMPTY_FORM: WebhookForm = {
  name: "",
  webhookUrl: "",
  notifyVisitorArrival: true,
  notifyEvacuation: true,
  notifyRiddor: true,
  notifyComplianceRed: false,
  notifyDocumentExpiry: false,
};

const EVENT_LABELS = [
  { key: "notifyVisitorArrival", db: "notify_visitor_arrival", label: "Visitor arrival", desc: "When a visitor signs in" },
  { key: "notifyEvacuation", db: "notify_evacuation", label: "Evacuation start & end", desc: "When an emergency is activated or completed" },
  { key: "notifyRiddor", db: "notify_riddor", label: "RIDDOR incident", desc: "When a RIDDOR-reportable incident is logged" },
  { key: "notifyComplianceRed", db: "notify_compliance_red", label: "Compliance score drops to red", desc: "When compliance dashboard falls below threshold" },
  { key: "notifyDocumentExpiry", db: "notify_document_expiry", label: "Document expiry warnings", desc: "Upcoming compliance certificate expirations" },
] as const;

export default function TeamsIntegrationSettings() {
  const { toast } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState<WebhookForm>(EMPTY_FORM);
  const [testingId, setTestingId] = useState<number | null>(null);

  const { data: webhooks = [], isLoading } = useQuery<TeamsWebhook[]>({
    queryKey: ["/api/teams-integration"],
    queryFn: async () => {
      const res = await fetch("/api/teams-integration");
      if (!res.ok) throw new Error("Failed to fetch webhooks");
      return res.json();
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: WebhookForm) => {
      const res = await apiRequest("POST", "/api/teams-integration", {
        name: data.name,
        webhookUrl: data.webhookUrl,
        notifyVisitorArrival: data.notifyVisitorArrival,
        notifyEvacuation: data.notifyEvacuation,
        notifyRiddor: data.notifyRiddor,
        notifyComplianceRed: data.notifyComplianceRed,
        notifyDocumentExpiry: data.notifyDocumentExpiry,
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error || "Failed"); }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/teams-integration"] });
      toast({ title: "Webhook added", description: "Teams webhook configured successfully." });
      setShowForm(false);
      setForm(EMPTY_FORM);
    },
    onError: (e: any) => toast({ title: "Failed to add webhook", description: e.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Partial<WebhookForm> & { active?: boolean } }) => {
      const body: any = {};
      if (data.name !== undefined) body.name = data.name;
      if (data.webhookUrl !== undefined) body.webhookUrl = data.webhookUrl;
      if (data.active !== undefined) body.active = data.active;
      if (data.notifyVisitorArrival !== undefined) body.notifyVisitorArrival = data.notifyVisitorArrival;
      if (data.notifyEvacuation !== undefined) body.notifyEvacuation = data.notifyEvacuation;
      if (data.notifyRiddor !== undefined) body.notifyRiddor = data.notifyRiddor;
      if (data.notifyComplianceRed !== undefined) body.notifyComplianceRed = data.notifyComplianceRed;
      if (data.notifyDocumentExpiry !== undefined) body.notifyDocumentExpiry = data.notifyDocumentExpiry;
      const res = await apiRequest("PUT", `/api/teams-integration/${id}`, body);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/teams-integration"] });
      toast({ title: "Webhook updated" });
      setShowForm(false);
      setEditId(null);
      setForm(EMPTY_FORM);
    },
    onError: (e: any) => toast({ title: "Update failed", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("DELETE", `/api/teams-integration/${id}`, {});
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/teams-integration"] });
      toast({ title: "Webhook removed" });
    },
    onError: () => toast({ title: "Failed to remove webhook", variant: "destructive" }),
  });

  const testWebhook = async (id: number) => {
    setTestingId(id);
    try {
      const res = await apiRequest("POST", `/api/teams-integration/${id}/test`, {});
      const data = await res.json();
      if (data.success) {
        toast({ title: "Test sent ✅", description: data.message });
      } else {
        toast({ title: "Test failed", description: data.message, variant: "destructive" });
      }
    } catch {
      toast({ title: "Test failed", variant: "destructive" });
    } finally {
      setTestingId(null);
    }
  };

  const openEdit = (wh: TeamsWebhook) => {
    setForm({
      name: wh.name,
      webhookUrl: wh.webhook_url,
      notifyVisitorArrival: wh.notify_visitor_arrival,
      notifyEvacuation: wh.notify_evacuation,
      notifyRiddor: wh.notify_riddor,
      notifyComplianceRed: wh.notify_compliance_red,
      notifyDocumentExpiry: wh.notify_document_expiry,
    });
    setEditId(wh.id);
    setShowForm(true);
  };

  const handleSubmit = () => {
    if (!form.name.trim() || !form.webhookUrl.trim()) {
      toast({ title: "Name and webhook URL are required", variant: "destructive" });
      return;
    }
    if (editId !== null) {
      updateMutation.mutate({ id: editId, data: form });
    } else {
      createMutation.mutate(form);
    }
  };

  const isSaving = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          <div className="p-3 rounded-xl bg-indigo-500/10 border border-indigo-200 dark:border-indigo-800">
            <Webhook className="h-6 w-6 text-indigo-600 dark:text-indigo-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Microsoft Teams Notifications</h1>
            <p className="text-slate-500 dark:text-slate-400 mt-0.5 max-w-2xl">
              Post real-time alerts to Teams channels when key events happen in TPR — visitor arrivals, evacuations,
              RIDDOR incidents, and more. No sign-in needed, just a Webhook URL from your Teams channel.
            </p>
          </div>
        </div>
        <Button onClick={() => { setShowForm(true); setEditId(null); setForm(EMPTY_FORM); }} className="gap-2 flex-shrink-0">
          <Plus className="h-4 w-4" />
          Add webhook
        </Button>
      </div>

      {/* Setup help */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 p-4 flex items-start gap-3">
        <div className="flex-shrink-0 mt-0.5">
          <ExternalLink className="h-4 w-4 text-slate-400" />
        </div>
        <div className="text-sm text-slate-600 dark:text-slate-400 space-y-1">
          <p className="font-medium text-slate-700 dark:text-slate-300">How to get your Teams Webhook URL</p>
          <p>In Teams: open the channel → <strong>Manage channel</strong> → <strong>Connectors</strong> → find <strong>Incoming Webhook</strong> → Configure → copy the URL.</p>
          <a
            href="https://learn.microsoft.com/en-us/microsoftteams/platform/webhooks-and-connectors/how-to/add-incoming-webhook"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-indigo-600 dark:text-indigo-400 hover:underline"
          >
            Microsoft documentation <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      </div>

      {/* Webhook list */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
        </div>
      ) : webhooks.filter(w => w.active).length === 0 ? (
        <div className="text-center py-16 text-slate-400 border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-xl">
          <Webhook className="h-10 w-10 mx-auto mb-3 opacity-40" />
          <p className="font-medium">No webhooks configured yet</p>
          <p className="text-sm mt-1">Add a Teams Incoming Webhook URL to start receiving alerts.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {webhooks.filter(w => w.active).map((wh) => (
            <div key={wh.id} className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3 min-w-0">
                  <div className="p-2 rounded-lg bg-indigo-50 dark:bg-indigo-950/50 flex-shrink-0">
                    <Webhook className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-900 dark:text-white">{wh.name}</p>
                    <p className="text-xs text-slate-400 font-mono truncate max-w-xs mt-0.5">{wh.webhook_url}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 gap-1.5 text-xs"
                    onClick={() => testWebhook(wh.id)}
                    disabled={testingId === wh.id}
                  >
                    {testingId === wh.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <TestTube className="h-3.5 w-3.5" />}
                    Test
                  </Button>
                  <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => openEdit(wh)}>
                    Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 text-xs text-red-600 hover:text-red-700 hover:border-red-300"
                    onClick={() => deleteMutation.mutate(wh.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>

              {/* Subscribed events */}
              <div className="mt-4 flex flex-wrap gap-1.5">
                {EVENT_LABELS.map(ev => {
                  const on = wh[ev.db as keyof TeamsWebhook] as boolean;
                  return (
                    <span
                      key={ev.key}
                      className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full border ${
                        on
                          ? "bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800 text-green-700 dark:text-green-400"
                          : "bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-400 line-through"
                      }`}
                    >
                      {on ? <Bell className="h-3 w-3" /> : <BellOff className="h-3 w-3" />}
                      {ev.label}
                    </span>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add / Edit Dialog */}
      <Dialog open={showForm} onOpenChange={(o) => { if (!o) { setShowForm(false); setEditId(null); setForm(EMPTY_FORM); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editId !== null ? "Edit webhook" : "Add Teams webhook"}</DialogTitle>
            <DialogDescription>
              Paste the Incoming Webhook URL from your Teams channel and choose which events to send.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Webhook name</Label>
              <Input
                placeholder="e.g. Reception alerts, Safety channel"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Webhook URL</Label>
              <Input
                placeholder="https://outlook.office.com/webhook/…"
                value={form.webhookUrl}
                onChange={e => setForm(f => ({ ...f, webhookUrl: e.target.value }))}
              />
              <p className="text-xs text-slate-400">Must start with https://</p>
            </div>

            <div className="space-y-3">
              <Label className="text-sm font-medium">Events to send</Label>
              {EVENT_LABELS.map(ev => {
                const key = ev.key as keyof WebhookForm;
                return (
                  <div key={ev.key} className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-slate-800 dark:text-slate-200">{ev.label}</p>
                      <p className="text-xs text-slate-500">{ev.desc}</p>
                    </div>
                    <Switch
                      checked={form[key] as boolean}
                      onCheckedChange={val => setForm(f => ({ ...f, [key]: val }))}
                    />
                  </div>
                );
              })}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowForm(false); setEditId(null); setForm(EMPTY_FORM); }}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={isSaving} className="gap-2">
              {isSaving && <Loader2 className="h-4 w-4 animate-spin" />}
              {editId !== null ? "Save changes" : "Add webhook"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
