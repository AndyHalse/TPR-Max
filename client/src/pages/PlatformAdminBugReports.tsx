import { useState } from "react";
import { Bug, Camera, Download, Maximize2, ChevronDown, X, Copy, Image, FileText, Loader2, Mail, CheckCircle2, AlertCircle, RotateCcw } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

interface Attachment {
  dataUrl: string;
  caption: string;
}

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
  errorId: string | null;
  breadcrumbs: string | null;
  appVersion: string | null;
  status: string;
  adminNotes: string | null;
  resolutionNote: string | null;
  reporterNotifiedAt: string | null;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
  hasScreenshot: boolean;
  attachmentCount: number;
  reporterFeedback: string | null;
  reporterConfirmedAt: string | null;
  reopenReason: string | null;
  reopenedAt: string | null;
  hasReopenScreenshot: boolean;
}

interface BugReportDetail extends BugReport {
  screenshot: string | null;
  attachments: Attachment[] | null;
  reopenScreenshot: string | null;
}

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  new: { label: "New", className: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300" },
  in_progress: { label: "In Progress", className: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300" },
  fixed: { label: "Fixed", className: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300" },
  closed: { label: "Closed", className: "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-400" },
  reopened: { label: "Reopened", className: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300" },
};

const STATUSES = ["new", "in_progress", "fixed", "closed", "reopened"] as const;

function buildCopyText(detail: BugReportDetail): string {
  const totalImages =
    (detail.screenshot ? 1 : 0) + (detail.attachments?.length ?? 0);
  return [
    `TPR Bug Report ${detail.reportNumber} — ${new Date(detail.createdAt).toLocaleString()}`,
    `Reporter: ${detail.reporterName || "—"}${detail.reporterEmail ? ` <${detail.reporterEmail}>` : ""}`,
    `Customer: ${detail.customerName || detail.customerId || "—"}`,
    `Page: ${detail.pageUrl || "—"}`,
    `Browser: ${detail.browserInfo || "—"} | Screen: ${detail.screenSize || "—"}`,
    `App Version: ${detail.appVersion || "—"}`,
    ...(detail.errorId ? [`Error Ref: ${detail.errorId}`] : []),
    `Status: ${STATUS_CONFIG[detail.status]?.label ?? detail.status}`,
    "",
    "## Description",
    detail.description,
    "",
    ...(detail.consoleErrors
      ? ["## Console / Network Logs", detail.consoleErrors, ""]
      : []),
    ...(detail.breadcrumbs
      ? ["## Breadcrumbs (last actions)", detail.breadcrumbs, ""]
      : []),
    ...(detail.reopenReason
      ? ["## Reporter Reopen Note", detail.reopenReason, ""]
      : []),
    `## Attachments`,
    totalImages > 0
      ? `${totalImages} image(s) attached — view in Platform Admin.`
      : "No images attached.",
  ].join("\n");
}

export default function PlatformAdminBugReports() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detailNotes, setDetailNotes] = useState("");
  const [detailStatus, setDetailStatus] = useState("");
  const [zoomedImage, setZoomedImage] = useState<string | null>(null);
  const [pdfGenerating, setPdfGenerating] = useState(false);
  const [showFixConfirm, setShowFixConfirm] = useState(false);
  const [resolutionNoteText, setResolutionNoteText] = useState("");

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
    onSuccess: (data: any) => {
      qc.invalidateQueries({ queryKey: ["/platform-admin/bug-reports"] });
      if (data?.emailSent) {
        toast({ title: "Marked Fixed — reporter notified", description: `Email sent to ${data.reporterEmail ?? "reporter"}` });
      } else if (data?.emailSkippedReason === 'no_email') {
        toast({ title: "Marked Fixed", description: "No reporter email on file — notification skipped." });
      } else if (data?.emailSkippedReason === 'already_notified') {
        toast({ title: "Report updated", description: "Reporter was already notified of this fix." });
      } else {
        toast({ title: "Report updated" });
      }
    },
    onError: (err: any) => {
      toast({ title: "Update failed", description: err.message, variant: "destructive" });
    },
  });

  function openDetail(report: BugReport) {
    setSelectedId(report.id);
    setDetailNotes(report.adminNotes ?? "");
    setDetailStatus(report.status);
    setResolutionNoteText(report.resolutionNote ?? "");
  }

  function handleStatusChange(newStatus: string) {
    if (newStatus === 'fixed' && selectedId) {
      setDetailStatus('fixed');
      setShowFixConfirm(true);
      return;
    }
    setDetailStatus(newStatus);
    if (selectedId) {
      patchMutation.mutate({ id: selectedId, body: { status: newStatus } });
    }
  }

  function handleConfirmFix(skip: boolean) {
    setShowFixConfirm(false);
    if (selectedId) {
      patchMutation.mutate({
        id: selectedId,
        body: { status: 'fixed', resolutionNote: resolutionNoteText.trim() || undefined, skipNotification: skip },
      });
    }
  }

  function handleSaveNotes() {
    if (selectedId) {
      patchMutation.mutate({ id: selectedId, body: { adminNotes: detailNotes } });
    }
  }

  async function handleCopyAll() {
    if (!detail) return;
    try {
      await navigator.clipboard.writeText(buildCopyText(detail));
      toast({ title: "Copied to clipboard", description: "Paste it straight into Claude Code." });
    } catch (_) {
      toast({ title: "Copy failed", description: "Your browser blocked clipboard access.", variant: "destructive" });
    }
  }

  async function handleDownloadPdf() {
    if (!detail) return;
    setPdfGenerating(true);
    try {
      const { jsPDF } = (await import("jspdf")) as { jsPDF: any };
      const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

      const PW = 210, PH = 297, M = 15;
      const CW = PW - M * 2;
      let y = M;

      const addLine = (
        text: string,
        fs: number,
        style: "normal" | "bold" = "normal",
        font: "helvetica" | "courier" = "helvetica",
        r = 30, g = 30, b = 30,
      ) => {
        doc.setFontSize(fs);
        doc.setFont(font, style);
        doc.setTextColor(r, g, b);
        const lineH = fs * 0.3528 * 1.45;
        const wrapped: string[] = doc.splitTextToSize(text, CW);
        let i = 0;
        while (i < wrapped.length) {
          const fit = Math.max(1, Math.floor((PH - M - y) / lineH));
          const chunk = wrapped.slice(i, i + fit);
          doc.text(chunk, M, y);
          y += chunk.length * lineH;
          i += fit;
          if (i < wrapped.length) { doc.addPage(); y = M; }
        }
      };

      const gap = (mm: number) => { y += mm; };
      const checkPage = (need: number) => { if (y + need > PH - M) { doc.addPage(); y = M; } };

      // ── Page 1: summary ──────────────────────────────────────────────
      addLine(`TPR Bug Report ${detail.reportNumber}`, 16, "bold");
      gap(1);
      addLine(new Date(detail.createdAt).toLocaleString("en-GB"), 9, "normal", "helvetica", 100, 100, 100);
      gap(6);

      const meta: [string, string, boolean?][] = [
        ["Reporter", `${detail.reporterName || "—"}${detail.reporterEmail ? ` <${detail.reporterEmail}>` : ""}`],
        ...(detail.errorId ? [["Error Ref", detail.errorId, true] as [string, string, boolean]] : []),
        ["App Version", detail.appVersion || "—"],
        ["Status", STATUS_CONFIG[detail.status]?.label ?? detail.status],
        ["Customer", detail.customerName || detail.customerId || "—"],
        ["Page", detail.pageUrl || "—"],
        ["Browser", detail.browserInfo || "—"],
        ["Screen", detail.screenSize || "—"],
      ];
      for (const [label, value, isErr] of meta) {
        checkPage(6);
        doc.setFontSize(9);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(60, 60, 60);
        doc.text(`${label}:`, M, y);
        doc.setFont("helvetica", "normal");
        if (isErr) doc.setTextColor(160, 20, 20); else doc.setTextColor(30, 30, 30);
        const vLines: string[] = doc.splitTextToSize(value, CW - 38);
        doc.text(vLines, M + 38, y);
        y += Math.max(5, vLines.length * 4.2);
      }
      gap(4);

      checkPage(12);
      addLine("Description", 12, "bold");
      gap(1);
      addLine(detail.description, 9);
      gap(5);

      if (detail.consoleErrors?.trim()) {
        checkPage(12);
        addLine("Console / Network Logs", 12, "bold");
        gap(1);
        addLine(detail.consoleErrors, 7.5, "normal", "courier");
        gap(5);
      }

      if (detail.breadcrumbs?.trim()) {
        checkPage(12);
        addLine("Breadcrumbs (last actions)", 12, "bold");
        gap(1);
        addLine(detail.breadcrumbs, 7.5, "normal", "courier");
      }

      if (detail.reopenReason?.trim()) {
        checkPage(12);
        addLine("Reporter Reopen Note", 12, "bold");
        gap(1);
        addLine(detail.reopenReason, 9);
      }

      // ── Image pages ───────────────────────────────────────────────────
      for (const img of allImages) {
        doc.addPage();
        y = M;
        addLine(img.caption, 13, "bold");
        gap(4);

        const fmt = img.dataUrl.startsWith("data:image/png") ? "PNG" : "JPEG";
        await new Promise<void>((resolve) => {
          const el = new window.Image();
          el.onload = () => {
            const mmPerPx = 0.264583;
            const availW = CW;
            const availH = PH - M - y;
            const scale = Math.min(availW / (el.naturalWidth * mmPerPx), availH / (el.naturalHeight * mmPerPx), 1);
            const dw = el.naturalWidth * mmPerPx * scale;
            const dh = el.naturalHeight * mmPerPx * scale;
            try { doc.addImage(img.dataUrl, fmt, M, y, dw, dh); } catch (_) {}
            resolve();
          };
          el.onerror = () => resolve();
          el.src = img.dataUrl;
        });
      }

      const slug = (() => {
        const seg = (detail.pageUrl ?? "").split("/").filter(Boolean).pop() ?? "";
        return seg.replace(/[^a-z0-9]/gi, "-").toLowerCase() || "bug-report";
      })();
      doc.save(`${detail.reportNumber}-${slug}.pdf`);
    } catch (err: any) {
      toast({ title: "PDF generation failed", description: err?.message || String(err), variant: "destructive" });
    } finally {
      setPdfGenerating(false);
    }
  }

  function downloadImage(dataUrl: string, filename: string) {
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = filename;
    a.click();
  }

  const reports = data?.reports ?? [];
  // Sort reopened to the top, then by createdAt desc
  const sorted = [...reports].sort((a, b) => {
    const aReopened = a.status === "reopened" ? 0 : 1;
    const bReopened = b.status === "reopened" ? 0 : 1;
    if (aReopened !== bReopened) return aReopened - bReopened;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });
  const filtered = statusFilter === "all" ? sorted : sorted.filter((r) => r.status === statusFilter);
  const openCount = reports.filter((r) => r.status === "new" || r.status === "in_progress" || r.status === "reopened").length;
  const reopenedCount = reports.filter((r) => r.status === "reopened").length;

  const allImages: Array<{ dataUrl: string; caption: string; index: number }> = [];
  if (detail) {
    if (detail.screenshot) allImages.push({ dataUrl: detail.screenshot, caption: "Auto-screenshot", index: 0 });
    (detail.attachments ?? []).forEach((a, i) =>
      allImages.push({ dataUrl: a.dataUrl, caption: a.caption || `Attachment ${i + 1}`, index: allImages.length })
    );
    if (detail.reopenScreenshot) {
      allImages.push({ dataUrl: detail.reopenScreenshot, caption: "Reporter screenshot (reopen)", index: allImages.length });
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Bug className="w-6 h-6 text-amber-500" />
          <div>
            <h2 className="text-xl font-bold">Bug Reports</h2>
            <p className="text-sm text-muted-foreground">
              {reopenedCount > 0
                ? <span className="text-red-600 font-medium">{reopenedCount} reopened</span>
                : null}
              {reopenedCount > 0 && openCount > reopenedCount ? " · " : null}
              {openCount - reopenedCount > 0
                ? `${openCount - reopenedCount} open`
                : openCount === 0 ? "No open reports" : null}
              {reopenedCount === 0 && openCount === 0 ? "No open reports" : null}
            </p>
          </div>
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-44">
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
            const imgCount = (report.hasScreenshot ? 1 : 0) + (report.attachmentCount ?? 0) + (report.hasReopenScreenshot ? 1 : 0);
            const isReopened = report.status === "reopened";
            return (
              <Card
                key={report.id}
                className={`cursor-pointer hover:border-amber-300 transition-colors ${isReopened ? "border-red-300 dark:border-red-700" : ""}`}
                onClick={() => openDetail(report)}
              >
                <CardContent className="p-4 flex items-center gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="font-mono text-sm font-bold text-amber-600">{report.reportNumber}</span>
                      {imgCount > 0 && (
                        <span className="flex items-center gap-0.5 text-xs text-slate-400" title={`${imgCount} image${imgCount !== 1 ? "s" : ""}`}>
                          <Image className="w-3.5 h-3.5" />{imgCount}
                        </span>
                      )}
                      <Badge className={`text-xs px-2 py-0 ${cfg.className}`}>{cfg.label}</Badge>
                      {isReopened && (
                        <span className="text-xs text-red-600 font-medium flex items-center gap-0.5">
                          <RotateCcw className="w-3 h-3" /> Needs attention
                        </span>
                      )}
                      <span className="text-xs text-muted-foreground">
                        {report.customerName || report.customerId || "—"}
                      </span>
                    </div>
                    <p className="text-sm text-slate-700 dark:text-slate-300 truncate">{firstLine}</p>
                    {isReopened && report.reopenReason && (
                      <p className="text-xs text-red-600 dark:text-red-400 mt-0.5 truncate">
                        Reporter: "{report.reopenReason}"
                      </p>
                    )}
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
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <DialogTitle className="flex items-center gap-2">
                      <Bug className="w-5 h-5 text-amber-500" />
                      {detail.reportNumber}
                    </DialogTitle>
                    <DialogDescription>
                      {detail.customerName || detail.customerId || "Unknown customer"} ·{" "}
                      {new Date(detail.createdAt).toLocaleString()}
                    </DialogDescription>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 mt-0.5">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex items-center gap-1.5"
                      onClick={handleCopyAll}
                      title="Copy entire report as text for pasting into Claude Code"
                    >
                      <Copy className="w-3.5 h-3.5" /> Copy all
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex items-center gap-1.5"
                      onClick={handleDownloadPdf}
                      disabled={pdfGenerating}
                      title="Download full report as PDF (includes all screenshots)"
                    >
                      {pdfGenerating
                        ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        : <FileText className="w-3.5 h-3.5" />}
                      {pdfGenerating ? "Generating…" : "Download PDF"}
                    </Button>
                  </div>
                </div>
              </DialogHeader>

              <div className="space-y-4 py-2">
                {/* Meta */}
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="col-span-2">
                    <span className="font-medium">Reporter: </span>
                    <span className="text-muted-foreground">{detail.reporterName || "—"}</span>
                    {detail.reporterEmail ? (
                      <a
                        href={`mailto:${detail.reporterEmail}`}
                        className="ml-2 inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 dark:text-blue-400 hover:underline text-xs"
                      >
                        <Mail className="w-3 h-3" />
                        {detail.reporterEmail}
                      </a>
                    ) : (
                      <span className="ml-2 inline-flex items-center gap-1 text-amber-600 dark:text-amber-400 text-xs">
                        <AlertCircle className="w-3 h-3" />
                        No contact email captured
                      </span>
                    )}
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
                  {detail.reporterNotifiedAt && (
                    <div className="col-span-2 flex items-center gap-1.5 text-green-700 dark:text-green-400">
                      <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" />
                      <span className="text-xs">Reporter notified on {new Date(detail.reporterNotifiedAt).toLocaleString()}</span>
                    </div>
                  )}
                </div>

                {/* Reporter feedback panels */}
                {detail.reporterFeedback === 'confirmed' && detail.reporterConfirmedAt && (
                  <div className="flex items-start gap-2.5 bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-lg px-4 py-3">
                    <CheckCircle2 className="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5" />
                    <p className="text-sm text-green-700 dark:text-green-400">
                      ✓ Reporter confirmed fixed on {new Date(detail.reporterConfirmedAt).toLocaleString()}
                    </p>
                  </div>
                )}

                {detail.reporterFeedback === 'still_broken' && (
                  <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg px-4 py-3 space-y-2">
                    <div className="flex items-center gap-2">
                      <RotateCcw className="w-4 h-4 text-red-600 flex-shrink-0" />
                      <p className="text-sm font-semibold text-red-700 dark:text-red-400">
                        Reporter says it's still broken
                        {detail.reopenedAt ? ` · ${new Date(detail.reopenedAt).toLocaleString()}` : ""}
                      </p>
                    </div>
                    {detail.reopenReason && (
                      <p className="text-sm text-red-800 dark:text-red-300 whitespace-pre-wrap pl-6">
                        "{detail.reopenReason}"
                      </p>
                    )}
                    {detail.reopenScreenshot && (
                      <div className="pl-6 mt-2">
                        <p className="text-xs text-red-600 mb-1 font-medium">Reporter's screenshot:</p>
                        <div className="border border-red-200 rounded overflow-hidden cursor-zoom-in" onClick={() => setZoomedImage(detail.reopenScreenshot!)}>
                          <img src={detail.reopenScreenshot} alt="Reporter screenshot" className="w-full max-h-40 object-contain bg-slate-50 dark:bg-slate-900" />
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Description */}
                <div>
                  <Label className="text-xs uppercase tracking-wide text-muted-foreground">Description</Label>
                  <p className="mt-1 text-sm whitespace-pre-wrap bg-slate-50 dark:bg-slate-800 rounded p-3 border">
                    {detail.description}
                  </p>
                </div>

                {/* Error ref + version */}
                {(detail.errorId || detail.appVersion) && (
                  <div className="flex flex-wrap gap-4 text-sm">
                    {detail.errorId && (
                      <div>
                        <span className="font-medium">Error Ref: </span>
                        <code className="font-mono text-red-600 bg-red-50 dark:bg-red-950/30 px-1.5 py-0.5 rounded text-xs">{detail.errorId}</code>
                      </div>
                    )}
                    {detail.appVersion && (
                      <div>
                        <span className="font-medium">App Version: </span>
                        <span className="text-muted-foreground font-mono text-xs">{detail.appVersion}</span>
                      </div>
                    )}
                  </div>
                )}

                {/* Browser info */}
                {detail.browserInfo && (
                  <div>
                    <Label className="text-xs uppercase tracking-wide text-muted-foreground">Browser</Label>
                    <p className="mt-1 text-xs text-muted-foreground break-all">{detail.browserInfo}</p>
                  </div>
                )}

                {/* Console / network logs */}
                {detail.consoleErrors && (
                  <div>
                    <Label className="text-xs uppercase tracking-wide text-muted-foreground">Console / Network Logs</Label>
                    <pre className="mt-1 text-xs bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded p-3 max-h-48 overflow-auto whitespace-pre-wrap">
                      {detail.consoleErrors}
                    </pre>
                  </div>
                )}

                {/* Breadcrumbs */}
                {detail.breadcrumbs && (
                  <div>
                    <Label className="text-xs uppercase tracking-wide text-muted-foreground">Breadcrumbs (last actions)</Label>
                    <pre className="mt-1 text-xs bg-slate-50 dark:bg-slate-800 border rounded p-3 max-h-36 overflow-auto whitespace-pre-wrap">
                      {detail.breadcrumbs}
                    </pre>
                  </div>
                )}

                {/* Image gallery — legacy screenshot + attachments */}
                {allImages.length > 0 && (
                  <div>
                    <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                      Screenshots &amp; Attachments ({allImages.length})
                    </Label>
                    <div className="mt-2 space-y-3">
                      {allImages.map((img, i) => (
                        <div key={i} className="border rounded-lg overflow-hidden">
                          <div className="flex items-center justify-between px-3 py-1.5 bg-slate-50 dark:bg-slate-800 text-xs text-muted-foreground">
                            <span className="font-medium">{img.caption || `Image ${i + 1}`}</span>
                            <div className="flex gap-2">
                              <button
                                onClick={() => downloadImage(img.dataUrl, `${detail.reportNumber}-img${i + 1}.jpg`)}
                                className="hover:text-foreground flex items-center gap-1 transition-colors"
                              >
                                <Download className="w-3 h-3" /> Download
                              </button>
                              <span className="text-muted-foreground/40">·</span>
                              <button
                                onClick={() => setZoomedImage(img.dataUrl)}
                                className="hover:text-foreground flex items-center gap-1 transition-colors"
                              >
                                <Maximize2 className="w-3 h-3" /> Full size
                              </button>
                            </div>
                          </div>
                          <img
                            src={img.dataUrl}
                            alt={img.caption || `Screenshot ${i + 1}`}
                            className="w-full object-contain bg-slate-50 dark:bg-slate-900 cursor-zoom-in max-h-64"
                            onClick={() => setZoomedImage(img.dataUrl)}
                          />
                        </div>
                      ))}
                    </div>
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

      {/* Fix & Notify confirm dialog */}
      <Dialog open={showFixConfirm} onOpenChange={(o) => {
        if (!o) {
          setShowFixConfirm(false);
          setDetailStatus(detail?.status ?? detailStatus);
        }
      }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-green-600" />
              Mark as Fixed
            </DialogTitle>
            <DialogDescription>
              {detail?.reporterEmail
                ? `Optionally add a note about what was fixed, then notify ${detail.reporterName || 'the reporter'} by email.${detail.status === 'reopened' ? ' This will send a fresh verification email since the report was reopened.' : ''}`
                : 'No reporter email on file — the report will be marked Fixed without sending a notification.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {detail?.reporterEmail && (
              <div className="flex items-center gap-2 text-sm bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300 rounded-md px-3 py-2">
                <Mail className="w-4 h-4 flex-shrink-0" />
                <span className="truncate">{detail.reporterEmail}</span>
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="resolution-note" className="text-sm font-medium">
                What was fixed? <span className="text-muted-foreground font-normal">(optional — included in the email)</span>
              </Label>
              <Textarea
                id="resolution-note"
                rows={3}
                placeholder="e.g. The contractor email field now saves correctly."
                value={resolutionNoteText}
                onChange={(e) => setResolutionNoteText(e.target.value)}
                maxLength={500}
              />
            </div>
          </div>

          <div className="space-y-2 border-t pt-4">
            <Button
              className="w-full bg-green-600 hover:bg-green-700 text-white"
              onClick={() => handleConfirmFix(false)}
              disabled={patchMutation.isPending}
            >
              {patchMutation.isPending
                ? <Loader2 className="w-4 h-4 animate-spin mr-2" />
                : <CheckCircle2 className="w-4 h-4 mr-2" />}
              {detail?.reporterEmail ? 'Confirm & Send Email' : 'Mark Fixed'}
            </Button>
            {detail?.reporterEmail && (
              <Button
                variant="outline"
                className="w-full"
                onClick={() => handleConfirmFix(true)}
                disabled={patchMutation.isPending}
              >
                Mark Fixed — Skip notification
              </Button>
            )}
            <Button
              variant="ghost"
              className="w-full text-muted-foreground"
              onClick={() => { setShowFixConfirm(false); setDetailStatus(detail?.status ?? 'new'); }}
            >
              Cancel
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Image lightbox */}
      {zoomedImage && (
        <div
          className="fixed inset-0 z-[200] bg-black/90 flex items-center justify-center p-4"
          onClick={() => setZoomedImage(null)}
        >
          <button
            className="absolute top-4 right-4 text-white/80 hover:text-white bg-white/10 hover:bg-white/20 rounded-full p-2 transition-colors"
            onClick={() => setZoomedImage(null)}
          >
            <X className="w-5 h-5" />
          </button>
          <button
            className="absolute top-4 right-16 text-white/80 hover:text-white bg-white/10 hover:bg-white/20 rounded-full p-2 transition-colors"
            onClick={(e) => {
              e.stopPropagation();
              downloadImage(zoomedImage, "bug-report-screenshot.jpg");
            }}
            title="Download"
          >
            <Download className="w-5 h-5" />
          </button>
          <img
            src={zoomedImage}
            alt="Full size screenshot"
            className="max-w-full max-h-full rounded shadow-2xl object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}
