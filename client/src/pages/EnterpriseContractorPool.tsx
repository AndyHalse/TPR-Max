import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
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
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  HardHat, ChevronDown, ChevronRight, CheckCircle, XCircle, Clock,
  AlertTriangle, Building2, Users, Plus, Trash2, ShieldCheck, Info, Search,
  ExternalLink, FileText, UserCheck, Upload, ArrowRight,
} from "lucide-react";

interface Company {
  id: string;
  companyName: string;
  status: string;
  riskRating: string;
  workerCount: number;
  clearedCount: number;
  sitesClearedCount: number;
  totalSitesCount: number;
  documentsStatus: Record<string, string>;
  complianceIssues: number;
  overallCompliance: string;
}

interface Site {
  id: string;
  name: string;
  reference: string;
}

interface SiteClearance {
  status: string;
  inductedAt: string | null;
  expiryDate: string | null;
  notes: string | null;
  clearanceId: string;
}

interface Worker {
  id: string;
  firstName: string;
  lastName: string;
  jobTitle: string | null;
  workerStatus: string;
  siteClearances: Record<string, SiteClearance>;
}

// ─── Clearance status badge ──────────────────────────────────────────────────
function ClearanceBadge({ status }: { status?: string }) {
  if (!status || status === 'pending') {
    return (
      <Badge variant="outline" className="text-xs border-orange-300 text-orange-700 dark:text-orange-400">
        <Clock size={10} className="mr-1" />Pending
      </Badge>
    );
  }
  if (status === 'inducted') {
    return (
      <Badge variant="default" className="text-xs bg-green-600 hover:bg-green-700">
        <CheckCircle size={10} className="mr-1" />Inducted
      </Badge>
    );
  }
  if (status === 'expired') {
    return (
      <Badge variant="destructive" className="text-xs">
        <AlertTriangle size={10} className="mr-1" />Expired
      </Badge>
    );
  }
  if (status === 'waived') {
    return (
      <Badge variant="secondary" className="text-xs">
        <Info size={10} className="mr-1" />Waived
      </Badge>
    );
  }
  return <Badge variant="secondary" className="text-xs capitalize">{status}</Badge>;
}

// ─── Doc status pill — clickable when onClick provided ────────────────────────
function DocPill({
  label,
  status,
  onClick,
}: {
  label: string;
  status: string;
  onClick?: () => void;
}) {
  const cls =
    status === 'approved'
      ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
      : status === 'expiring'
      ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400'
      : status === 'expired' || status === 'missing'
      ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
      : 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400';

  const interactiveCls = onClick
    ? 'cursor-pointer hover:opacity-80 hover:shadow-sm transition-all ring-0 hover:ring-1 hover:ring-current/20'
    : '';

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${cls} ${interactiveCls}`}
          onClick={onClick}
        >
          {(status === 'missing' || status === 'expired') && <Upload size={10} className="flex-shrink-0" />}
          {label}: {status}
          {onClick && (status === 'missing' || status === 'expired' || status === 'expiring') && (
            <ArrowRight size={10} className="flex-shrink-0" />
          )}
        </span>
      </TooltipTrigger>
      {onClick && (
        <TooltipContent side="bottom" className="text-xs">
          Click to upload / manage this document
        </TooltipContent>
      )}
    </Tooltip>
  );
}

// ─── Clear worker at site dialog ─────────────────────────────────────────────
function ClearWorkerDialog({
  worker,
  sites,
  existingClearance,
  prefillSiteId,
  onClose,
  onSaved,
}: {
  worker: Worker;
  sites: Site[];
  existingClearance?: SiteClearance;
  prefillSiteId?: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [siteId, setSiteId] = useState(prefillSiteId ?? "");
  const [status, setStatus] = useState(existingClearance?.status ?? "inducted");
  const [inductedAt, setInductedAt] = useState(
    existingClearance?.inductedAt
      ? existingClearance.inductedAt.slice(0, 10)
      : new Date().toISOString().slice(0, 10)
  );
  const [expiryDate, setExpiryDate] = useState(existingClearance?.expiryDate?.slice(0, 10) ?? "");
  const [notes, setNotes] = useState(existingClearance?.notes ?? "");

  const saveMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/enterprise/contractor-pool/workers/${worker.id}/clear`, {
        siteId,
        status,
        inductedAt: inductedAt || undefined,
        expiryDate: expiryDate || undefined,
        notes: notes || undefined,
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Clearance saved", description: `${worker.firstName} ${worker.lastName} marked as ${status} at selected site.` });
      onSaved();
      onClose();
    },
    onError: () => toast({ title: "Error", description: "Failed to save clearance.", variant: "destructive" }),
  });

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Site clearance — {worker.firstName} {worker.lastName}</DialogTitle>
      </DialogHeader>
      <div className="space-y-4 py-1">
        <div className="space-y-1">
          <Label>Site <span className="text-red-500">*</span></Label>
          <Select value={siteId} onValueChange={setSiteId} disabled={!!prefillSiteId}>
            <SelectTrigger><SelectValue placeholder="Select site…" /></SelectTrigger>
            <SelectContent>
              {sites.map(s => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name} {s.reference ? `(${s.reference})` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>Status</Label>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="inducted">Inducted</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="expired">Expired</SelectItem>
              <SelectItem value="waived">Waived</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label>Inducted on</Label>
            <Input type="date" value={inductedAt} onChange={e => setInductedAt(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Expires on</Label>
            <Input type="date" value={expiryDate} onChange={e => setExpiryDate(e.target.value)} />
          </div>
        </div>
        <div className="space-y-1">
          <Label>Notes</Label>
          <Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="Optional notes…" />
        </div>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button disabled={!siteId || saveMutation.isPending} onClick={() => saveMutation.mutate()}>
          {saveMutation.isPending ? "Saving…" : "Save clearance"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

// ─── Workers table for a company ─────────────────────────────────────────────
function CompanyWorkers({
  companyId,
  sites,
}: {
  companyId: string;
  sites: Site[];
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();
  const [clearingWorker, setClearingWorker] = useState<{ worker: Worker; siteId?: string } | null>(null);

  const { data: workers = [], isLoading } = useQuery<Worker[]>({
    queryKey: [`/api/enterprise/contractor-pool/${companyId}/workers`],
  });

  const deleteMutation = useMutation({
    mutationFn: async (clearanceId: string) => {
      const res = await apiRequest("DELETE", `/api/enterprise/contractor-pool/clearances/${clearanceId}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/enterprise/contractor-pool/${companyId}/workers`] });
      queryClient.invalidateQueries({ queryKey: ["/api/enterprise/contractor-pool"] });
      toast({ title: "Clearance removed" });
    },
    onError: () => toast({ title: "Error", description: "Failed to remove clearance.", variant: "destructive" }),
  });

  if (isLoading) return <p className="text-sm text-muted-foreground px-4 py-3">Loading workers…</p>;
  if (workers.length === 0) return (
    <div className="px-4 py-6 text-center">
      <Users size={28} className="mx-auto mb-2 opacity-30" />
      <p className="text-sm text-muted-foreground">No active workers registered for this company.</p>
      <Button
        size="sm"
        variant="outline"
        className="mt-3 text-xs"
        onClick={() => navigate(`/contractors/${companyId}?tab=workers`)}
      >
        <UserCheck size={12} className="mr-1.5" />
        Manage workers in full view
        <ExternalLink size={11} className="ml-1.5" />
      </Button>
    </div>
  );

  return (
    <div className="px-4 pb-3">
      <div className="overflow-x-auto rounded border">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted/50 border-b">
              <th className="text-left px-3 py-2 font-medium text-muted-foreground">Worker</th>
              {sites.map(s => (
                <th key={s.id} className="text-center px-3 py-2 font-medium text-muted-foreground whitespace-nowrap">
                  {s.name}
                </th>
              ))}
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y">
            {workers.map(w => (
              <tr key={w.id} className="hover:bg-muted/30">
                <td className="px-3 py-2">
                  <button
                    className="text-left group"
                    onClick={() => navigate(`/contractors/${companyId}?tab=workers&workerId=${w.id}`)}
                  >
                    <p className="font-medium group-hover:text-primary group-hover:underline transition-colors">
                      {w.firstName} {w.lastName}
                    </p>
                    {w.jobTitle && <p className="text-xs text-muted-foreground">{w.jobTitle}</p>}
                  </button>
                </td>
                {sites.map(s => {
                  const clearance = w.siteClearances?.[s.id];
                  return (
                    <td key={s.id} className="px-3 py-2 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          className="focus:outline-none"
                          onClick={() => setClearingWorker({ worker: w, siteId: s.id })}
                          title={clearance ? `Edit clearance (${clearance.status})` : "Add clearance"}
                        >
                          <ClearanceBadge status={clearance?.status} />
                        </button>
                        {clearance && (
                          <button
                            className="text-muted-foreground hover:text-destructive"
                            onClick={() => deleteMutation.mutate(clearance.clearanceId)}
                            title="Remove clearance"
                          >
                            <Trash2 size={12} />
                          </button>
                        )}
                      </div>
                    </td>
                  );
                })}
                <td className="px-3 py-2 text-right">
                  <div className="flex items-center justify-end gap-1">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 text-xs"
                          onClick={() => navigate(`/contractors/${companyId}?tab=workers&workerId=${w.id}`)}
                        >
                          <ExternalLink size={11} />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="left" className="text-xs">Open full worker profile</TooltipContent>
                    </Tooltip>
                    <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setClearingWorker({ worker: w })}>
                      <Plus size={12} className="mr-1" />Clear
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Link to full worker cards view */}
      <div className="mt-3 flex justify-end">
        <Button
          size="sm"
          variant="outline"
          className="text-xs gap-1.5"
          onClick={() => navigate(`/contractors/${companyId}?tab=workers`)}
        >
          <UserCheck size={12} />
          View all worker cards (inc. Yellow/Red cards)
          <ExternalLink size={11} />
        </Button>
      </div>

      <Dialog open={!!clearingWorker} onOpenChange={open => { if (!open) setClearingWorker(null); }}>
        {clearingWorker && (
          <ClearWorkerDialog
            worker={clearingWorker.worker}
            sites={sites}
            prefillSiteId={clearingWorker.siteId}
            existingClearance={
              clearingWorker.siteId
                ? clearingWorker.worker.siteClearances?.[clearingWorker.siteId]
                : undefined
            }
            onClose={() => setClearingWorker(null)}
            onSaved={() => {
              queryClient.invalidateQueries({ queryKey: [`/api/enterprise/contractor-pool/${companyId}/workers`] });
              queryClient.invalidateQueries({ queryKey: ["/api/enterprise/contractor-pool"] });
            }}
          />
        )}
      </Dialog>
    </div>
  );
}

// ─── Company row ─────────────────────────────────────────────────────────────
function CompanyRow({ company, sites }: { company: Company; sites: Site[] }) {
  const [open, setOpen] = useState(false);
  const [, navigate] = useLocation();

  const isCompliant = company.overallCompliance === 'compliant';

  const docLabelMap: Record<string, string> = {
    publicLiability: 'Public Liability',
    employersLiability: 'Employers Liability',
    healthSafety: 'Health & Safety',
    rams: 'RAMS',
  };

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <Card className={`border ${!isCompliant ? 'border-amber-200 dark:border-amber-800' : ''}`}>
        <CollapsibleTrigger asChild>
          <CardHeader className="py-3 cursor-pointer hover:bg-muted/30 rounded-t-lg">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {open
                  ? <ChevronDown size={16} className="text-muted-foreground flex-shrink-0" />
                  : <ChevronRight size={16} className="text-muted-foreground flex-shrink-0" />}
                <div>
                  <div className="flex items-center gap-2">
                    <CardTitle className="text-sm font-semibold">{company.companyName}</CardTitle>
                    <Badge variant={company.status === 'approved' ? 'default' : 'secondary'} className="text-xs">
                      {company.status}
                    </Badge>
                    {company.complianceIssues > 0 && (
                      <Badge variant="destructive" className="text-xs">
                        {company.complianceIssues} doc{company.complianceIssues !== 1 ? 's' : ''} missing
                      </Badge>
                    )}
                  </div>
                  <div className="flex gap-3 mt-1 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Users size={11} />
                      {company.workerCount} worker{company.workerCount !== 1 ? 's' : ''}
                    </span>
                    <span className={`flex items-center gap-1 ${company.sitesClearedCount > 0 ? 'text-green-700 dark:text-green-400' : ''}`}>
                      <ShieldCheck size={11} />
                      {company.sitesClearedCount > 0
                        ? `Cleared at ${company.sitesClearedCount} of ${company.totalSitesCount} site${company.totalSitesCount !== 1 ? 's' : ''}`
                        : company.totalSitesCount > 0
                        ? `Not cleared at any of ${company.totalSitesCount} site${company.totalSitesCount !== 1 ? 's' : ''}`
                        : 'No sites'}
                    </span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {/* Deep-link: open full contractor detail */}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs gap-1 z-10"
                      onClick={e => {
                        e.stopPropagation();
                        navigate(`/contractors/${company.id}`);
                      }}
                    >
                      <ExternalLink size={11} />
                      Full details
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="left" className="text-xs">
                    Open complete contractor profile — upload documents, manage workers, issue cards
                  </TooltipContent>
                </Tooltip>
                {isCompliant
                  ? <CheckCircle size={16} className="text-green-500" />
                  : <AlertTriangle size={16} className="text-amber-500" />}
              </div>
            </div>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="pt-0 pb-0">
            {/* Compliance doc summary — each pill navigates to documents tab */}
            <div className="flex flex-wrap gap-1.5 px-1 py-2 border-t items-center">
              <span className="text-xs text-muted-foreground font-medium mr-1">
                <FileText size={12} className="inline mr-1 mb-0.5" />Documents:
              </span>
              {Object.entries(company.documentsStatus).map(([key, status]) => (
                <DocPill
                  key={key}
                  label={docLabelMap[key] ?? key.replace(/([A-Z])/g, ' $1').trim()}
                  status={status}
                  onClick={
                    status !== 'approved'
                      ? () => navigate(`/contractors/${company.id}?tab=documents`)
                      : undefined
                  }
                />
              ))}
              {/* Quick upload link when docs are missing */}
              {company.complianceIssues > 0 && (
                <button
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-primary/10 text-primary hover:bg-primary/20 transition-colors ml-1"
                  onClick={() => navigate(`/contractors/${company.id}?tab=documents`)}
                >
                  <Upload size={10} />
                  Upload missing docs
                  <ArrowRight size={10} />
                </button>
              )}
            </div>

            {/* Action row */}
            <div className="flex items-center gap-2 px-1 py-2 border-t bg-muted/20">
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-xs gap-1.5"
                onClick={() => navigate(`/contractors/${company.id}?tab=workers`)}
              >
                <UserCheck size={12} />
                Workers &amp; Cards
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-xs gap-1.5"
                onClick={() => navigate(`/contractors/${company.id}?tab=documents`)}
              >
                <FileText size={12} />
                Documents
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-xs gap-1.5"
                onClick={() => navigate(`/contractors/${company.id}?tab=compliance`)}
              >
                <ShieldCheck size={12} />
                Compliance
              </Button>
              <div className="ml-auto text-xs text-muted-foreground italic">
                Click a worker below to open their full profile
              </div>
            </div>

            <CompanyWorkers companyId={company.id} sites={sites} />
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function EnterpriseContractorPool() {
  const [search, setSearch] = useState("");

  const {
    data: companies = [],
    isLoading,
    isError: poolError,
    error: poolErrorObj,
    refetch: refetchPool,
  } = useQuery<Company[]>({
    queryKey: ["/api/enterprise/contractor-pool"],
  });

  const { data: sites = [] } = useQuery<Site[]>({
    queryKey: ["/api/enterprise/contractor-pool/sites"],
  });

  const filtered = search.trim()
    ? companies.filter(c => c.companyName.toLowerCase().includes(search.toLowerCase()))
    : companies;

  const totalWorkers = companies.reduce((s, c) => s + c.workerCount, 0);
  const attentionCount = companies.filter(c => c.overallCompliance !== 'compliant').length;

  if (poolError) {
    const is403 = (poolErrorObj as any)?.status === 403;
    return (
      <div className="p-6 flex items-center justify-center min-h-64">
        <Card className="p-8 max-w-sm text-center space-y-3">
          <div className="w-12 h-12 rounded-xl bg-amber-50 dark:bg-amber-900/20 flex items-center justify-center mx-auto">
            <ShieldCheck size={24} className="text-amber-400" />
          </div>
          <h2 className="font-semibold">{is403 ? "Access restricted" : "Couldn't load contractor pool"}</h2>
          <p className="text-sm text-muted-foreground">
            {is403
              ? "You don't have enterprise access for this customer. Ask an Enterprise Admin to grant you a role."
              : "The request failed — please try again or contact your administrator."}
          </p>
          {!is403 && (
            <Button variant="outline" size="sm" onClick={() => refetchPool()}>Try again</Button>
          )}
        </Card>
      </div>
    );
  }

  return (
    <TooltipProvider delayDuration={400}>
      <div className="p-6 max-w-5xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10">
            <HardHat size={22} className="text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Shared Contractor Pool</h1>
            <p className="text-sm text-muted-foreground">
              Onboard a contractor once — deploy them across all sites with per-site clearance tracking.
            </p>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4">
          <Card className="p-4 text-center">
            <p className="text-2xl font-bold">{companies.length}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Companies</p>
          </Card>
          <Card className="p-4 text-center">
            <p className="text-2xl font-bold">{totalWorkers}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Workers</p>
          </Card>
          <Card className={`p-4 text-center ${attentionCount > 0 ? 'border-amber-200 dark:border-amber-800' : ''}`}>
            <p className={`text-2xl font-bold ${attentionCount > 0 ? 'text-amber-600' : 'text-green-600'}`}>
              {attentionCount}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">Need attention</p>
          </Card>
        </div>

        {/* Info banner */}
        <div className="flex items-start gap-2 p-3 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg text-sm text-blue-800 dark:text-blue-300">
          <Info size={15} className="mt-0.5 flex-shrink-0" />
          <p>
            Company compliance (insurance, accreditations) is verified once here. Site clearance and induction must be recorded per site — a worker inducted at one site is <strong>not</strong> automatically cleared at another.{" "}
            <span className="font-medium">Click any company to open its full profile for document upload, worker management, and card issuing.</span>
          </p>
        </div>

        {/* Search */}
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            className="w-full pl-9 pr-3 py-2 border rounded-md text-sm bg-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            placeholder="Search contractors…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        {/* List */}
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading contractor pool…</p>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-12 text-center text-muted-foreground">
            <Building2 size={36} className="opacity-30" />
            <p className="text-sm">
              {search ? "No contractors match your search." : "No contractors onboarded yet."}
            </p>
            <p className="text-xs">
              Contractors added from the main Contractors module will appear here automatically.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map(co => (
              <CompanyRow key={co.id} company={co} sites={sites} />
            ))}
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}
