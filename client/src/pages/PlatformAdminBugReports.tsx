import { useState } from "react";
import { Bug, Camera, Download, Maximize2, ChevronDown, X } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

interface BugReport {
  id: string;
  reportNumber: string;
  customerId: string | null;
  customerName: string | null;
  reporterName: string | null;
  reporterEmail: string | null;
  description: string;
  pageUrl: string | null;
  browserInfo: string | null;
  screenSize: string | null;
  consoleErrors: string | null;
  status: string;
  adminNotes: string | null;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
  hasScreenshot: boolean;
}

interface BugReportDetail extends BugReport {
  screenshot: string | null;
}

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  new: { label: "New", className: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300" },
  in_progress: { label: "In Progress", className: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300" },
  fixed: { label: "Fixed", className: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300" },
  closed: { label: "Closed", className: "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-400" },
};

const STATUSES = ["new", "in_progress", "fixed", "closed"] as const;

export default function PlatformAdminBugReports() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detailNotes, setDetailNotes] = useState("");
  const [detailStatus, setDetailStatus] = useState("");
  const [zoomedScreenshot, setZoomedScreenshot] = useState<string | null>(null);

  const { data, isLoading, isError } = useQuery<{ reports: BugReport[] }>({
    queryKey: ["/platform-admin/bug-reports"],
    queryFn: async () => {
      const r = await fetch("/platform-admin/bug-reports", { credentials: "include" });
      if (!r.ok) throw new Error("Failed to fetch bug reports");
      return r.json();
    },
  });

  const { data: detail, isLoading: detailLoading } = useQuery<BugReportDetail>({
    queryKey: ["/platform-admin/bug-reports", selectedId],
    queryFn: async () => {
      const r = await fetch(`/platform-admin/bug-reports/${selectedId}`, { credentials: "include" });
      if (!r.ok) throw new Error("Failed to fetch report detail");
      return r.json();
    },
    enabled: !!selectedId,
  });

  const patchMutation = useMutation({
    mutationFn: async ({ id, body }: { id: string; body: Record<string, any> }) => {
      const res = await apiRequest("PATCH", `/platform-admin/bug-reports/${id}`, body);
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/platform-admin/bug-reports"] });
      toast({ title: "Report updated" });
    },
    onError: (err: any) => {
      toast({ title: "Update failed", description: err.message, variant: "destructive" });
    },
  });

  function openDetail(report: BugReport) {
    setSelectedId(report.id);
    setDetailNotes(report.adminNotes ?? "");
    setDetailStatus(report.status);
  }

  function handleStatusChange(newStatus: string) {
    setDetailStatus(newStatus);
    if (selectedId) {
      patchMutation.mutate({ id: selectedId, body: { status: newStatus } });
    }
  }

  function handleSaveNotes() {
    if (selectedId) {
      patchMutation.mutate({ id: selectedId, body: { adminNotes: detailNotes } });
    }
  }

  const reports = data?.reports ?? [];
  const filtered = statusFilter === "all" ? reports : reports.filter((r) => r.status === statusFilter);
  const openCount = reports.filter((r) => r.status === "new" || r.status === "in_progress").length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Bug className="w-6 h-6 text-amber-500" />
          <div>
            <h2 className="text-xl font-bold">Bug Reports</h2>
            <p className="text-sm text-muted-foreground">
              {openCount > 0 ? `${openCount} open report${openCount !== 1 ? "s" : ""}` : "No open reports"}
            </p>
          </div>
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Filter by status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {STATUSES.map((s) => (
              <SelectItem key={s} value={s}>{STATUS_CONFIG[s].label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* List */}
      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">Loading reports…</div>
      ) : isError ? (
        <div className="text-center py-12 text-red-500">Failed to load bug reports.</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Bug className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p>{statusFilter === "all" ? "No bug reports yet." : `No reports with status "${STATUS_CONFIG[statusFilter]?.label ?? statusFilter}".`}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((report) => {
            const cfg = STATUS_CONFIG[report.status] ?? STATUS_CONFIG.new;
            const firstLine = report.description.split("\n")[0].slice(0, 120);
            return (
              <Card
                key={report.id}
                className="cursor-pointer hover:border-amber-300 transition-colors"
                onClick={() => openDetail(report)}
              >
                <CardContent className="p-4 flex items-center gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="font-mono text-sm font-bold text-amber-600">{report.reportNumber}</span>
                      {report.hasScreenshot && (
                        <span title="Has screenshot"><Camera className="w-3.5 h-3.5 text-slate-400" /></span>
                      )}
                      <Badge className={`text-xs px-2 py-0 ${cfg.className}`}>{cfg.label}</Badge>
                      <span className="text-xs text-muted-foreground">
                        {report.customerName || report.customerId || "—"}
                      </span>
                    </div>
                    <p className="text-sm text-slate-700 dark:text-slate-300 truncate">{firstLine}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {report.reporterName ? `${report.reporterName} · ` : ""}
                      {new Date(report.createdAt).toLocaleString()}
                    </p>
                  </div>
                  <ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0 -rotate-90" />
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Detail Dialog */}
      <Dialog open={!!selectedId} onOpenChange={(o) => { if (!o) setSelectedId(null); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          {detailLoading || !detail ? (
            <div className="py-8 text-center text-muted-foreground">Loading…</div>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Bug className="w-5 h-5 text-amber-500" />
                  {detail.reportNumber}
                </DialogTitle>
                <DialogDescription>
                  {detail.customerName || detail.customerId || "Unknown customer"} ·{" "}
                  {new Date(detail.createdAt).toLocaleString()}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4 py-2">
                {/* Meta */}
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <span className="font-medium">Reporter: </span>
                    <span className="text-muted-foreground">
                      {detail.reporterName || "—"}
                      {detail.reporterEmail ? ` (${detail.reporterEmail})` : ""}
                    </span>
                  </div>
                  <div>
                    <span className="font-medium">Page: </span>
                    <span className="text-muted-foreground">{detail.pageUrl || "—"}</span>
                  </div>
                  <div>
                    <span className="font-medium">Screen: </span>
                    <span className="text-muted-foreground">{detail.screenSize || "—"}</span>
                  </div>
                  {detail.resolvedAt && (
                    <div>
                      <span className="font-medium">Resolved: </span>
                      <span className="text-muted-foreground">{new Date(detail.resolvedAt).toLocaleString()}</span>
                    </div>
                  )}
                </div>

                {/* Description */}
                <div>
                  <Label className="text-xs uppercase tracking-wide text-muted-foreground">Description</Label>
                  <p className="mt-1 text-sm whitespace-pre-wrap bg-slate-50 dark:bg-slate-800 rounded p-3 border">
                    {detail.description}
                  </p>
                </div>

                {/* Browser info */}
                {detail.browserInfo && (
                  <div>
                    <Label className="text-xs uppercase tracking-wide text-muted-foreground">Browser</Label>
                    <p className="mt-1 text-xs text-muted-foreground break-all">{detail.browserInfo}</p>
                  </div>
                )}

                {/* Console errors */}
                {detail.consoleErrors && (
                  <div>
                    <Label className="text-xs uppercase tracking-wide text-muted-foreground">Console Errors</Label>
                    <pre className="mt-1 text-xs bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded p-3 max-h-36 overflow-auto whitespace-pre-wrap">
                      {detail.consoleErrors}
                    </pre>
                  </div>
                )}

                {/* Screenshot */}
                {detail.screenshot && (
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <Label className="text-xs uppercase tracking-wide text-muted-foreground">Screenshot</Label>
                      <div className="flex gap-1">
                        <button
                          onClick={() => {
                            const a = document.createElement("a");
                            a.href = detail.screenshot!;
                            a.download = `${detail.reportNumber || "bug-report"}.jpg`;
                            a.click();
                          }}
                          className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
                          title="Download screenshot"
                        >
                          <Download className="w-3 h-3" /> Download
                        </button>
                        <span className="text-muted-foreground/40 mx-1">·</span>
                        <button
                          onClick={() => setZoomedScreenshot(detail.screenshot!)}
                          className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
                          title="View full size"
                        >
                          <Maximize2 className="w-3 h-3" /> Full size
                        </button>
                      </div>
                    </div>
                    <img
                      src={detail.screenshot}
                      alt="Bug report screenshot"
                      className="w-full rounded border object-contain bg-slate-50 dark:bg-slate-900 cursor-zoom-in"
                      onClick={() => setZoomedScreenshot(detail.screenshot!)}
                      title="Click to view full size"
                    />
                  </div>
                )}

                {/* Status */}
                <div>
                  <Label className="text-xs uppercase tracking-wide text-muted-foreground">Status</Label>
                  <Select value={detailStatus} onValueChange={handleStatusChange}>
                    <SelectTrigger className="mt-1 w-48">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {STATUSES.map((s) => (
                        <SelectItem key={s} value={s}>{STATUS_CONFIG[s].label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Admin notes */}
                <div>
                  <Label htmlFor="admin-notes" className="text-xs uppercase tracking-wide text-muted-foreground">
                    Internal Notes
                  </Label>
                  <Textarea
                    id="admin-notes"
                    className="mt-1"
                    rows={3}
                    placeholder="Add internal notes visible only to platform admins…"
                    value={detailNotes}
                    onChange={(e) => setDetailNotes(e.target.value)}
                  />
                  <Button
                    size="sm"
                    className="mt-2"
                    onClick={handleSaveNotes}
                    disabled={patchMutation.isPending}
                  >
                    Save Notes
                  </Button>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Screenshot lightbox */}
      {zoomedScreenshot && (
        <div
          className="fixed inset-0 z-[200] bg-black/90 flex items-center justify-center p-4"
          onClick={() => setZoomedScreenshot(null)}
        >
          <button
            className="absolute top-4 right-4 text-white/80 hover:text-white bg-white/10 hover:bg-white/20 rounded-full p-2 transition-colors"
            onClick={() => setZoomedScreenshot(null)}
          >
            <X className="w-5 h-5" />
          </button>
          <button
            className="absolute top-4 right-16 text-white/80 hover:text-white bg-white/10 hover:bg-white/20 rounded-full p-2 transition-colors"
            onClick={(e) => {
              e.stopPropagation();
              const a = document.createElement("a");
              a.href = zoomedScreenshot;
              a.download = "bug-report-screenshot.jpg";
              a.click();
            }}
            title="Download"
          >
            <Download className="w-5 h-5" />
          </button>
          <img
            src={zoomedScreenshot}
            alt="Full size screenshot"
            className="max-w-full max-h-full rounded shadow-2xl object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}
