import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import GlassCard from "@/components/GlassCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useToast } from "@/hooks/use-toast";
import {
  Headphones, Plus, ListFilter, TicketCheck, AlertCircle,
  Clock, CheckCircle2, XCircle, Loader2, RefreshCw, Info,
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

// ─── Types ────────────────────────────────────────────────────────────────────

interface HelpDeskTicket {
  id: string;
  ticketNumber?: string | null;
  title: string;
  description?: string | null;
  category?: string | null;
  priority?: string | null;
  status: string;
  location?: string | null;
  assetId?: string | null;
  reportedByName?: string | null;
  reportedByEmail?: string | null;
  assignedTo?: string | null;
  resolutionNotes?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  resolvedAt?: string | null;
}

interface HelpDeskStats {
  open?: number;
  in_progress?: number;
  pending?: number;
  resolved?: number;
  closed?: number;
  total?: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUSES = [
  { value: "open",        label: "Open",        classes: "bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-700" },
  { value: "in_progress", label: "In Progress",  classes: "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-700" },
  { value: "pending",     label: "Pending",      classes: "bg-purple-100 text-purple-800 border-purple-200 dark:bg-purple-900/30 dark:text-purple-300 dark:border-purple-700" },
  { value: "resolved",    label: "Resolved",     classes: "bg-green-100 text-green-800 border-green-200 dark:bg-green-900/30 dark:text-green-300 dark:border-green-700" },
  { value: "closed",      label: "Closed",       classes: "bg-gray-100 text-gray-600 border-gray-200 dark:bg-gray-800/50 dark:text-gray-400 dark:border-gray-600" },
];

const PRIORITIES = [
  { value: "low",    label: "Low",    classes: "bg-gray-100 text-gray-600 border-gray-200 dark:bg-gray-800/50 dark:text-gray-400 dark:border-gray-600" },
  { value: "medium", label: "Medium", classes: "bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-700" },
  { value: "high",   label: "High",   classes: "bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-900/30 dark:text-orange-300 dark:border-orange-700" },
  { value: "urgent", label: "Urgent", classes: "bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-700" },
];

const CATEGORIES = [
  { value: "maintenance", label: "Maintenance" },
  { value: "it",          label: "IT" },
  { value: "facilities",  label: "Facilities" },
  { value: "safety",      label: "Safety" },
  { value: "other",       label: "Other" },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(d?: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function toastError(error: unknown, toast: ReturnType<typeof useToast>["toast"]) {
  toast({ title: "Error", description: error instanceof Error ? error.message : "An unexpected error occurred", variant: "destructive" });
}

// ─── Badge Components ─────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUSES.find(s => s.value === status) ?? { label: status, classes: "bg-gray-100 text-gray-600 border-gray-200" };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${cfg.classes}`}>
      {cfg.label}
    </span>
  );
}

function PriorityBadge({ priority }: { priority?: string | null }) {
  if (!priority) return <span className="text-xs text-muted-foreground">—</span>;
  const cfg = PRIORITIES.find(p => p.value === priority) ?? { label: priority, classes: "bg-gray-100 text-gray-600 border-gray-200" };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${cfg.classes}`}>
      {cfg.label}
    </span>
  );
}

// ─── Summary Strip ────────────────────────────────────────────────────────────

function SummaryStrip({ onFilterClick }: { onFilterClick: (status: string) => void }) {
  const { data: stats = {} as HelpDeskStats } = useQuery<HelpDeskStats>({ queryKey: ["/api/helpdesk/stats"] });

  const cards = [
    { label: "Open",        value: stats.open ?? 0,        status: "open",        icon: AlertCircle,  color: "text-blue-600" },
    { label: "In Progress", value: stats.in_progress ?? 0, status: "in_progress", icon: Clock,        color: "text-amber-600" },
    { label: "Pending",     value: stats.pending ?? 0,     status: "pending",     icon: ListFilter,   color: "text-purple-600" },
    { label: "Resolved",    value: stats.resolved ?? 0,    status: "resolved",    icon: CheckCircle2, color: "text-green-600" },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {cards.map(c => {
        const Icon = c.icon;
        return (
          <GlassCard
            key={c.label}
            className="p-3 cursor-pointer hover:ring-1 hover:ring-primary/30 transition-all"
            onClick={() => onFilterClick(c.status)}
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">{c.label}</p>
                <p className={`text-2xl font-bold ${c.value > 0 ? c.color : "text-foreground"}`}>{c.value}</p>
              </div>
              <Icon className={`h-8 w-8 opacity-20 ${c.color}`} />
            </div>
          </GlassCard>
        );
      })}
    </div>
  );
}

// ─── Ticket Detail Sheet ──────────────────────────────────────────────────────

function TicketSheet({
  ticket,
  open,
  onClose,
}: {
  ticket: HelpDeskTicket | null;
  open: boolean;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const [form, setForm] = useState<Partial<HelpDeskTicket>>({});

  function set(k: keyof HelpDeskTicket, v: string) {
    setForm(f => ({ ...f, [k]: v }));
  }

  const inv = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/helpdesk/tickets"] });
    queryClient.invalidateQueries({ queryKey: ["/api/helpdesk/stats"] });
  };

  const updateMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      apiRequest("PUT", `/api/helpdesk/tickets/${ticket!.id}`, data).then(r => r.json()),
    onSuccess: () => { inv(); toast({ title: "Ticket updated" }); },
    onError: (e) => toastError(e, toast),
  });

  const deleteMutation = useMutation({
    mutationFn: () => apiRequest("DELETE", `/api/helpdesk/tickets/${ticket!.id}`),
    onSuccess: () => { inv(); onClose(); toast({ title: "Ticket deleted" }); },
    onError: (e) => toastError(e, toast),
  });

  if (!ticket) return null;

  const merged: HelpDeskTicket = { ...ticket, ...form };

  return (
    <Sheet open={open} onOpenChange={o => { if (!o) { setForm({}); onClose(); } }}>
      <SheetContent className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <TicketCheck className="h-5 w-5" />
            <span>{ticket.ticketNumber ?? "Ticket"} — {ticket.title}</span>
          </SheetTitle>
        </SheetHeader>

        <div className="mt-6 space-y-4 text-sm">

          {/* Read-only info */}
          <div className="grid grid-cols-2 gap-3 rounded-lg bg-muted/40 p-3 text-xs">
            <div>
              <p className="text-muted-foreground">Category</p>
              <p className="font-medium capitalize">{ticket.category ?? "—"}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Location</p>
              <p className="font-medium">{ticket.location ?? "—"}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Reported By</p>
              <p className="font-medium">{ticket.reportedByName ?? "—"}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Email</p>
              <p className="font-medium break-all">{ticket.reportedByEmail ?? "—"}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Created</p>
              <p className="font-medium">{fmtDate(ticket.createdAt)}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Resolved</p>
              <p className="font-medium">{fmtDate(ticket.resolvedAt)}</p>
            </div>
          </div>

          {ticket.description && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1">Description</p>
              <p className="text-sm bg-muted/40 rounded-lg p-3 whitespace-pre-wrap">{ticket.description}</p>
            </div>
          )}

          {/* Editable fields */}
          <div className="space-y-3 pt-2 border-t">
            <div className="space-y-1">
              <Label className="text-xs">Status</Label>
              <Select value={merged.status} onValueChange={v => set("status", v)}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUSES.map(s => (
                    <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Priority</Label>
              <Select value={merged.priority ?? ""} onValueChange={v => set("priority", v)}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Select priority" />
                </SelectTrigger>
                <SelectContent>
                  {PRIORITIES.map(p => (
                    <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Assigned To</Label>
              <Input
                className="h-9"
                value={merged.assignedTo ?? ""}
                onChange={e => set("assignedTo", e.target.value)}
                placeholder="Name or team"
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Resolution Notes</Label>
              <Textarea
                rows={3}
                value={merged.resolutionNotes ?? ""}
                onChange={e => set("resolutionNotes", e.target.value)}
                placeholder="Describe what was done to resolve this ticket…"
              />
            </div>
          </div>

          <Button
            className="w-full"
            disabled={updateMutation.isPending}
            onClick={() => updateMutation.mutate(form as Record<string, unknown>)}
          >
            {updateMutation.isPending
              ? <><RefreshCw className="h-4 w-4 mr-1.5 animate-spin" />Saving…</>
              : "Save Changes"
            }
          </Button>

          <div className="border-t pt-3">
            <Button
              variant="ghost"
              size="sm"
              className="w-full text-destructive hover:text-destructive"
              disabled={deleteMutation.isPending}
              onClick={() => { if (confirm("Delete this ticket permanently?")) deleteMutation.mutate(); }}
            >
              {deleteMutation.isPending ? "Deleting…" : "Delete Ticket"}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ─── Tickets List Tab ─────────────────────────────────────────────────────────

function TicketsTab({ statusFilter, onClearFilter }: { statusFilter: string | null; onClearFilter: () => void }) {
  const [selected, setSelected] = useState<HelpDeskTicket | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [search, setSearch] = useState("");

  const { data: tickets = [], isLoading } = useQuery<HelpDeskTicket[]>({ queryKey: ["/api/helpdesk/tickets"] });

  const visible = tickets.filter(t => {
    if (statusFilter && t.status !== statusFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        t.title.toLowerCase().includes(q) ||
        (t.ticketNumber ?? "").toLowerCase().includes(q) ||
        (t.location ?? "").toLowerCase().includes(q) ||
        (t.reportedByName ?? "").toLowerCase().includes(q)
      );
    }
    return true;
  });

  function openTicket(t: HelpDeskTicket) {
    setSelected(t);
    setSheetOpen(true);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Input
          className="h-9 max-w-xs"
          placeholder="Search tickets…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        {statusFilter && (
          <Button variant="outline" size="sm" onClick={onClearFilter} className="gap-1.5 h-9">
            <XCircle className="h-3.5 w-3.5" />
            Clear filter
          </Button>
        )}
        {statusFilter && (
          <StatusBadge status={statusFilter} />
        )}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground gap-2">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span>Loading tickets…</span>
        </div>
      ) : visible.length === 0 ? (
        <GlassCard className="py-12 text-center text-muted-foreground">
          <TicketCheck className="h-10 w-10 mx-auto mb-3 opacity-20" />
          <p className="font-medium">{statusFilter ? "No tickets with this status" : "No tickets yet"}</p>
          <p className="text-xs mt-1">Switch to the New Ticket tab to log a fault or request.</p>
        </GlassCard>
      ) : (
        <GlassCard className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/30 text-xs text-muted-foreground">
                  <th className="px-4 py-2.5 text-left font-medium">Ticket No</th>
                  <th className="px-4 py-2.5 text-left font-medium">Title</th>
                  <th className="px-4 py-2.5 text-left font-medium hidden sm:table-cell">Category</th>
                  <th className="px-4 py-2.5 text-left font-medium hidden md:table-cell">Priority</th>
                  <th className="px-4 py-2.5 text-left font-medium">Status</th>
                  <th className="px-4 py-2.5 text-left font-medium hidden lg:table-cell">Location</th>
                  <th className="px-4 py-2.5 text-left font-medium hidden lg:table-cell">Reported By</th>
                  <th className="px-4 py-2.5 text-left font-medium hidden md:table-cell">Created</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((t, i) => (
                  <tr
                    key={t.id}
                    className={`border-b last:border-0 cursor-pointer hover:bg-muted/40 transition-colors ${i % 2 === 0 ? "" : "bg-muted/10"}`}
                    onClick={() => openTicket(t)}
                  >
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground whitespace-nowrap">
                      {t.ticketNumber ?? "—"}
                    </td>
                    <td className="px-4 py-3 font-medium max-w-[200px] truncate">{t.title}</td>
                    <td className="px-4 py-3 hidden sm:table-cell">
                      <span className="capitalize text-xs">{t.category ?? "—"}</span>
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      <PriorityBadge priority={t.priority} />
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={t.status} />
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell text-xs text-muted-foreground truncate max-w-[140px]">
                      {t.location ?? "—"}
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell text-xs text-muted-foreground">
                      {t.reportedByName ?? "—"}
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell text-xs text-muted-foreground whitespace-nowrap">
                      {fmtDate(t.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </GlassCard>
      )}

      <TicketSheet
        ticket={selected}
        open={sheetOpen}
        onClose={() => { setSheetOpen(false); setSelected(null); }}
      />
    </div>
  );
}

// ─── New Ticket Tab ───────────────────────────────────────────────────────────

const EMPTY_FORM = {
  title: "",
  description: "",
  category: "",
  priority: "medium",
  location: "",
  reportedByName: "",
  reportedByEmail: "",
};

function NewTicketTab({ onCreated }: { onCreated: () => void }) {
  const { toast } = useToast();
  const [form, setForm] = useState({ ...EMPTY_FORM });

  function set(k: keyof typeof EMPTY_FORM, v: string) {
    setForm(f => ({ ...f, [k]: v }));
  }

  const createMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      apiRequest("POST", "/api/helpdesk/tickets", data).then(r => r.json()),
    onSuccess: (row: HelpDeskTicket) => {
      queryClient.invalidateQueries({ queryKey: ["/api/helpdesk/tickets"] });
      queryClient.invalidateQueries({ queryKey: ["/api/helpdesk/stats"] });
      toast({ title: "Ticket created", description: `${row.ticketNumber} has been logged.` });
      setForm({ ...EMPTY_FORM });
      onCreated();
    },
    onError: (e) => toastError(e, toast),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim()) {
      toast({ title: "Title required", description: "Please enter a title for the ticket.", variant: "destructive" });
      return;
    }
    createMutation.mutate({
      title: form.title.trim(),
      description: form.description || undefined,
      category: form.category || undefined,
      priority: form.priority || undefined,
      location: form.location || undefined,
      reportedByName: form.reportedByName || undefined,
      reportedByEmail: form.reportedByEmail || undefined,
    });
  }

  return (
    <GlassCard className="max-w-xl">
      <form onSubmit={handleSubmit} className="space-y-4 p-1">
        <div className="space-y-1">
          <Label htmlFor="hd-title">Title <span className="text-destructive">*</span></Label>
          <Input
            id="hd-title"
            value={form.title}
            onChange={e => set("title", e.target.value)}
            placeholder="Brief description of the fault or request"
            className="h-9"
          />
        </div>

        <div className="space-y-1">
          <Label htmlFor="hd-description">Description</Label>
          <Textarea
            id="hd-description"
            rows={3}
            value={form.description}
            onChange={e => set("description", e.target.value)}
            placeholder="Provide any additional detail that would help resolve this ticket…"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label>Category</Label>
            <Select value={form.category} onValueChange={v => set("category", v)}>
              <SelectTrigger className="h-9"><SelectValue placeholder="Select…" /></SelectTrigger>
              <SelectContent>
                {CATEGORIES.map(c => (
                  <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label>Priority</Label>
            <Select value={form.priority} onValueChange={v => set("priority", v)}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                {PRIORITIES.map(p => (
                  <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-1">
          <Label htmlFor="hd-location">Location</Label>
          <Input
            id="hd-location"
            value={form.location}
            onChange={e => set("location", e.target.value)}
            placeholder="e.g. Ground floor reception, 2nd floor kitchen"
            className="h-9"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label htmlFor="hd-name">Reported By</Label>
            <Input
              id="hd-name"
              value={form.reportedByName}
              onChange={e => set("reportedByName", e.target.value)}
              placeholder="Full name"
              className="h-9"
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="hd-email">Email</Label>
            <Input
              id="hd-email"
              type="email"
              value={form.reportedByEmail}
              onChange={e => set("reportedByEmail", e.target.value)}
              placeholder="email@example.com"
              className="h-9"
            />
          </div>
        </div>

        <div className="pt-2 flex items-center gap-3">
          <Button type="submit" disabled={createMutation.isPending} className="gap-1.5">
            {createMutation.isPending
              ? <><Loader2 className="h-4 w-4 animate-spin" />Submitting…</>
              : <><Plus className="h-4 w-4" />Submit Ticket</>
            }
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => setForm({ ...EMPTY_FORM })}
            disabled={createMutation.isPending}
          >
            Clear
          </Button>
        </div>
      </form>
    </GlassCard>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function HelpDesk() {
  const [activeTab, setActiveTab] = useState("tickets");
  const [statusFilter, setStatusFilter] = useState<string | null>(null);

  function handleSummaryClick(status: string) {
    setStatusFilter(status);
    setActiveTab("tickets");
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10">
            <Headphones className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Help Desk</h1>
            <div className="flex items-center gap-1.5">
              <p className="text-sm text-muted-foreground">Log and manage reactive maintenance faults and service requests.</p>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button type="button" className="text-muted-foreground hover:text-foreground transition-colors">
                      <Info size={14} />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="max-w-sm text-xs space-y-2 p-3">
                    <p><strong>Reactive Maintenance</strong> — The management of unplanned maintenance tasks in response to reported faults or failures. All reactive work should be logged, prioritised, and resolved in a timely manner to meet your duty of care under the <strong>Health &amp; Safety at Work Act 1974</strong>.</p>
                    <p>Maintaining a full audit trail of reported faults and their resolution is essential for compliance with the <strong>Workplace (Health, Safety and Welfare) Regulations 1992</strong> and supports evidence of due diligence in the event of an incident or inspection.</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          </div>
        </div>
        <Button
          size="sm"
          className="shrink-0 gap-1.5"
          onClick={() => { setActiveTab("new-ticket"); }}
        >
          <Plus className="h-4 w-4" />
          New Ticket
        </Button>
      </div>

      <SummaryStrip onFilterClick={handleSummaryClick} />

      <Tabs value={activeTab} onValueChange={v => { setActiveTab(v); if (v !== "tickets") setStatusFilter(null); }}>
        <TabsList>
          <TabsTrigger value="tickets" className="flex items-center gap-1.5">
            <TicketCheck className="h-4 w-4" />Tickets
          </TabsTrigger>
          <TabsTrigger value="new-ticket" className="flex items-center gap-1.5">
            <Plus className="h-4 w-4" />New Ticket
          </TabsTrigger>
        </TabsList>

        <TabsContent value="tickets" className="mt-4">
          <TicketsTab
            statusFilter={statusFilter}
            onClearFilter={() => setStatusFilter(null)}
          />
        </TabsContent>

        <TabsContent value="new-ticket" className="mt-4">
          <NewTicketTab onCreated={() => setActiveTab("tickets")} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
