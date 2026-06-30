import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { getSessionToken, getCsrfToken } from "@/lib/queryClient";
import {
  BarChart3,
  Download,
  Loader2,
  ChevronLeft,
  CheckCircle,
  AlertTriangle,
  XCircle,
  Users,
  FileText,
  Wrench,
  Shield,
  Truck,
  ClipboardList,
} from "lucide-react";

interface Props {
  open: boolean;
  onClose: () => void;
  contractor: { id: string; companyName?: string; name?: string } | null;
}

function fmtDate(d: string | Date | null | undefined): string {
  if (!d) return "—";
  const dt = typeof d === "string" ? new Date(d) : d;
  if (isNaN(dt.getTime())) return "—";
  return dt.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function RagBadge({ rag }: { rag: "green" | "amber" | "red" }) {
  if (rag === "green")
    return (
      <Badge className="bg-green-100 text-green-800 border-green-200">
        <CheckCircle className="mr-1" size={11} /> Good Standing
      </Badge>
    );
  if (rag === "amber")
    return (
      <Badge className="bg-amber-100 text-amber-800 border-amber-200">
        <AlertTriangle className="mr-1" size={11} /> Attention Required
      </Badge>
    );
  return (
    <Badge className="bg-red-100 text-red-800 border-red-200">
      <XCircle className="mr-1" size={11} /> Concerns Identified
    </Badge>
  );
}

function SlaBadge({ sla }: { sla: string }) {
  if (sla === "pass")    return <Badge className="bg-green-100 text-green-800 border-green-200 text-xs">Pass</Badge>;
  if (sla === "warn")    return <Badge className="bg-amber-100 text-amber-800 border-amber-200 text-xs">Warn</Badge>;
  if (sla === "fail")    return <Badge className="bg-red-100 text-red-800 border-red-200 text-xs">Fail</Badge>;
  if (sla === "expired") return <Badge variant="outline" className="text-xs text-slate-500">Expired</Badge>;
  if (sla === "pending") return <Badge variant="outline" className="text-xs text-slate-500">Pending</Badge>;
  return <Badge variant="outline" className="text-xs text-blue-600">Direct</Badge>;
}

function SectionHeader({ icon: Icon, title }: { icon: any; title: string }) {
  return (
    <div className="flex items-center gap-2 border-b border-slate-200 pb-2 mb-3 mt-5">
      <Icon size={15} className="text-blue-600 flex-shrink-0" />
      <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
    </div>
  );
}

function KpiCard({
  label,
  value,
  color = "blue",
}: {
  label: string;
  value: string | number;
  color?: "blue" | "green" | "amber" | "red" | "slate";
}) {
  const colors = {
    blue: "text-blue-700 bg-blue-50 border-blue-100",
    green: "text-green-700 bg-green-50 border-green-100",
    amber: "text-amber-700 bg-amber-50 border-amber-100",
    red: "text-red-700 bg-red-50 border-red-100",
    slate: "text-slate-700 bg-slate-50 border-slate-100",
  };
  return (
    <div className={`rounded-lg border p-3 text-center ${colors[color]}`}>
      <div className="text-xl font-bold leading-tight">{value}</div>
      <div className="text-xs mt-0.5 opacity-75">{label}</div>
    </div>
  );
}

export default function ContractorSlaReportDialog({ open, onClose, contractor }: Props) {
  const { toast } = useToast();
  const companyName = contractor?.companyName || contractor?.name || "Contractor";

  // Default: last 90 days
  const today = new Date();
  const ninetyAgo = new Date();
  ninetyAgo.setDate(ninetyAgo.getDate() - 90);

  const [dateFrom, setDateFrom] = useState(ninetyAgo.toISOString().slice(0, 10));
  const [dateTo, setDateTo]     = useState(today.toISOString().slice(0, 10));
  const [slaDays, setSlaDays]   = useState("5");

  const [reportData, setReportData] = useState<any>(null);
  const [loading, setLoading]       = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [error, setError]           = useState<string | null>(null);

  const companyId = contractor?.id;

  async function generateReport() {
    if (!companyId) return;
    setLoading(true);
    setError(null);
    setReportData(null);
    try {
      const token = getSessionToken();
      const csrfToken = getCsrfToken();
      const res = await fetch(`/api/contractors/${companyId}/sla-report`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(csrfToken ? { "x-csrf-token": csrfToken } : {}),
        },
        body: JSON.stringify({ dateFrom, dateTo, slaDays: Number(slaDays) }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `Error ${res.status}`);
      }
      const data = await res.json();
      setReportData(data);
    } catch (e: any) {
      setError(e.message || "Failed to generate report");
      toast({ title: "Report error", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  async function downloadPdf() {
    if (!companyId) return;
    setPdfLoading(true);
    try {
      const token = getSessionToken();
      const csrfToken = getCsrfToken();
      const res = await fetch(`/api/contractors/${companyId}/sla-report/pdf`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(csrfToken ? { "x-csrf-token": csrfToken } : {}),
        },
        body: JSON.stringify({ dateFrom, dateTo, slaDays: Number(slaDays) }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `Error ${res.status}`);
      }
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement("a");
      a.href     = url;
      const safe = companyName.replace(/[^a-zA-Z0-9 -]/g, "").trim().replace(/\s+/g, "-").toLowerCase();
      a.download = `sla-report-${safe}-${dateTo}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      toast({ title: "PDF error", description: e.message, variant: "destructive" });
    } finally {
      setPdfLoading(false);
    }
  }

  function handleClose() {
    setReportData(null);
    setError(null);
    onClose();
  }

  const { summary, turnaround, cards, ppm, incidents, attendance, equipment, rams } =
    reportData ?? {};

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-blue-600" />
            SLA Activity Report — {companyName}
          </DialogTitle>
        </DialogHeader>

        {/* ── Parameters panel ─────────────────────────────── */}
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 mb-4">
          <div className="flex flex-wrap gap-4 items-end">
            <div className="flex flex-col gap-1">
              <Label className="text-xs text-slate-600">From</Label>
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="h-8 text-sm w-36"
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label className="text-xs text-slate-600">To</Label>
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="h-8 text-sm w-36"
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label className="text-xs text-slate-600">SLA target (working days)</Label>
              <Input
                type="number"
                min={1}
                max={30}
                value={slaDays}
                onChange={(e) => setSlaDays(e.target.value)}
                className="h-8 text-sm w-20"
              />
            </div>
            <Button onClick={generateReport} disabled={loading} className="h-8 px-4 text-sm">
              {loading ? (
                <>
                  <Loader2 className="mr-2 animate-spin" size={13} />
                  Generating…
                </>
              ) : (
                <>
                  <BarChart3 className="mr-2" size={13} />
                  Generate Report
                </>
              )}
            </Button>
            {reportData && (
              <>
                <Button
                  variant="outline"
                  onClick={() => { setReportData(null); setError(null); }}
                  className="h-8 px-3 text-sm"
                >
                  <ChevronLeft size={13} className="mr-1" /> New Search
                </Button>
                <Button
                  variant="outline"
                  onClick={downloadPdf}
                  disabled={pdfLoading}
                  className="h-8 px-3 text-sm text-blue-700 border-blue-300 hover:bg-blue-50"
                >
                  {pdfLoading ? (
                    <Loader2 className="mr-2 animate-spin" size={13} />
                  ) : (
                    <Download className="mr-2" size={13} />
                  )}
                  Download PDF
                </Button>
              </>
            )}
          </div>
        </div>

        {/* ── Error state ───────────────────────────────────── */}
        {error && (
          <div className="rounded-lg bg-red-50 border border-red-200 p-4 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* ── Loading ───────────────────────────────────────── */}
        {loading && (
          <div className="flex flex-col items-center justify-center py-16 gap-3 text-slate-500">
            <Loader2 className="animate-spin" size={32} />
            <p className="text-sm">Collecting report data…</p>
          </div>
        )}

        {/* ── Report results ────────────────────────────────── */}
        {reportData && summary && (
          <div className="space-y-1">

            {/* Summary KPIs */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
              <div className="col-span-2 sm:col-span-1 flex items-center justify-center">
                <RagBadge rag={summary.ragStatus} />
              </div>
              {summary.docPassRate !== null && (
                <KpiCard
                  label="Doc SLA Pass Rate"
                  value={`${summary.docPassRate}%`}
                  color={summary.docPassRate >= 80 ? "green" : summary.docPassRate >= 60 ? "amber" : "red"}
                />
              )}
              {summary.ppmRate !== null && (
                <KpiCard
                  label="PPM On-Time Rate"
                  value={`${summary.ppmRate}%`}
                  color={summary.ppmRate >= 80 ? "green" : summary.ppmRate >= 60 ? "amber" : "red"}
                />
              )}
              <KpiCard
                label="Safety Cards"
                value={summary.redCards + summary.yellowCards}
                color={summary.redCards > 0 ? "red" : summary.yellowCards > 0 ? "amber" : "green"}
              />
              <KpiCard label="Workers" value={summary.totalWorkers} color="blue" />
            </div>

            {/* 1. Compliance turnaround */}
            <SectionHeader icon={FileText} title={`Compliance Document Turnaround — SLA target: ${summary.slaDays} working days`} />
            {turnaround?.length > 0 ? (
              <div className="overflow-x-auto rounded-lg border border-slate-200">
                <table className="w-full text-xs">
                  <thead className="bg-slate-800 text-white">
                    <tr>
                      <th className="text-left px-3 py-2">Requested</th>
                      <th className="text-left px-3 py-2">Document Type</th>
                      <th className="text-left px-3 py-2">Received</th>
                      <th className="text-left px-3 py-2">Turnaround</th>
                      <th className="text-left px-3 py-2">SLA</th>
                    </tr>
                  </thead>
                  <tbody>
                    {turnaround.map((t: any, i: number) => (
                      <tr key={i} className={i % 2 === 1 ? "bg-slate-50" : ""}>
                        <td className="px-3 py-2">{fmtDate(t.requestedAt)}</td>
                        <td className="px-3 py-2 capitalize">{t.documentType}</td>
                        <td className="px-3 py-2">{t.receivedAt ? fmtDate(t.receivedAt) : "—"}</td>
                        <td className="px-3 py-2">
                          {t.workingDays !== null ? `${t.workingDays} day${t.workingDays === 1 ? "" : "s"}` : "—"}
                        </td>
                        <td className="px-3 py-2">
                          <SlaBadge sla={t.sla} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-xs text-slate-400 italic py-2">No document requests sent during this period.</p>
            )}

            {/* 2. PPM */}
            <SectionHeader icon={Wrench} title="Planned Preventative Maintenance (PPM)" />
            {ppm?.orders?.length > 0 ? (
              <>
                <div className="flex gap-3 mb-3 flex-wrap">
                  <KpiCard label="Total" value={ppm.orders.length} color="blue" />
                  <KpiCard label="On Time" value={ppm.onTime} color="green" />
                  <KpiCard label="Overdue" value={ppm.overdue} color={ppm.overdue > 0 ? "red" : "green"} />
                  {ppm.rate !== null && (
                    <KpiCard
                      label="On-Time Rate"
                      value={`${ppm.rate}%`}
                      color={ppm.rate >= 80 ? "green" : ppm.rate >= 60 ? "amber" : "red"}
                    />
                  )}
                </div>
                <div className="overflow-x-auto rounded-lg border border-slate-200">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-800 text-white">
                      <tr>
                        <th className="text-left px-3 py-2">Task</th>
                        <th className="text-left px-3 py-2">Status</th>
                        <th className="text-left px-3 py-2">Due</th>
                        <th className="text-left px-3 py-2">Completed</th>
                        <th className="text-left px-3 py-2">Result</th>
                        <th className="text-left px-3 py-2">Certificate</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ppm.orders.map((o: any, i: number) => {
                        const isOverdue = o.status !== "completed" && o.dueDate && new Date(o.dueDate) < new Date();
                        const onTime    = o.completedDate && o.dueDate && new Date(o.completedDate) <= new Date(o.dueDate);
                        return (
                          <tr key={o.id} className={i % 2 === 1 ? "bg-slate-50" : ""}>
                            <td className="px-3 py-2 max-w-[200px] truncate">{o.title}</td>
                            <td className="px-3 py-2">
                              {o.status === "completed" ? (
                                <Badge className="bg-green-100 text-green-800 border-green-200 text-xs">Completed</Badge>
                              ) : isOverdue ? (
                                <Badge className="bg-red-100 text-red-800 border-red-200 text-xs">Overdue</Badge>
                              ) : (
                                <Badge className="bg-amber-100 text-amber-800 border-amber-200 text-xs">Pending</Badge>
                              )}
                            </td>
                            <td className="px-3 py-2">{fmtDate(o.dueDate)}</td>
                            <td className="px-3 py-2">{fmtDate(o.completedDate)}</td>
                            <td className="px-3 py-2">
                              {o.completedDate ? (
                                onTime ? (
                                  <Badge className="bg-green-100 text-green-800 border-green-200 text-xs">On Time</Badge>
                                ) : (
                                  <Badge className="bg-red-100 text-red-800 border-red-200 text-xs">Late</Badge>
                                )
                              ) : "—"}
                            </td>
                            <td className="px-3 py-2">
                              {o.requiresCertificate
                                ? o.certificateUploadedAt
                                  ? <Badge className="bg-green-100 text-green-800 border-green-200 text-xs">Uploaded</Badge>
                                  : <Badge className="bg-red-100 text-red-800 border-red-200 text-xs">Missing</Badge>
                                : <span className="text-slate-400">N/A</span>}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            ) : (
              <p className="text-xs text-slate-400 italic py-2">No PPM work orders found for this contractor in the period.</p>
            )}

            {/* 3. Safety cards */}
            <SectionHeader icon={Shield} title="Safety Card History" />
            {cards?.length > 0 ? (
              <div className="overflow-x-auto rounded-lg border border-slate-200">
                <table className="w-full text-xs">
                  <thead className="bg-slate-800 text-white">
                    <tr>
                      <th className="text-left px-3 py-2">Worker</th>
                      <th className="text-left px-3 py-2">Card</th>
                      <th className="text-left px-3 py-2">Offence</th>
                      <th className="text-left px-3 py-2">Issued</th>
                      <th className="text-left px-3 py-2">Location</th>
                      <th className="text-left px-3 py-2">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cards.map((c: any, i: number) => (
                      <tr key={c.id} className={i % 2 === 1 ? "bg-slate-50" : ""}>
                        <td className="px-3 py-2">{c.workerName}</td>
                        <td className="px-3 py-2">
                          {c.cardType === "red" ? (
                            <Badge className="bg-red-100 text-red-800 border-red-200 text-xs">Red</Badge>
                          ) : (
                            <Badge className="bg-amber-100 text-amber-800 border-amber-200 text-xs">Yellow</Badge>
                          )}
                        </td>
                        <td className="px-3 py-2 max-w-[160px] truncate">{c.offenceName}</td>
                        <td className="px-3 py-2">{fmtDate(c.issuedAt)}</td>
                        <td className="px-3 py-2">{c.location || "—"}</td>
                        <td className="px-3 py-2">
                          {c.status === "active"   ? <Badge className="bg-red-100 text-red-800 border-red-200 text-xs">Active</Badge>
                          : c.status === "appealed" ? <Badge className="bg-amber-100 text-amber-800 border-amber-200 text-xs">Appealed</Badge>
                          : <Badge className="bg-green-100 text-green-800 border-green-200 text-xs">Resolved</Badge>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-xs text-green-600 italic py-2 flex items-center gap-1">
                <CheckCircle size={12} /> No safety cards issued during this period.
              </p>
            )}

            {/* 4. H&S incidents */}
            <SectionHeader icon={AlertTriangle} title="Health & Safety Incidents" />
            {incidents?.length > 0 ? (
              <div className="overflow-x-auto rounded-lg border border-slate-200">
                <table className="w-full text-xs">
                  <thead className="bg-slate-800 text-white">
                    <tr>
                      <th className="text-left px-3 py-2">Date</th>
                      <th className="text-left px-3 py-2">Title</th>
                      <th className="text-left px-3 py-2">Type</th>
                      <th className="text-left px-3 py-2">Person Involved</th>
                      <th className="text-left px-3 py-2">RIDDOR</th>
                    </tr>
                  </thead>
                  <tbody>
                    {incidents.map((inc: any, i: number) => (
                      <tr key={inc.id} className={i % 2 === 1 ? "bg-slate-50" : ""}>
                        <td className="px-3 py-2">{fmtDate(inc.incidentDate)}</td>
                        <td className="px-3 py-2 max-w-[200px] truncate">{inc.title}</td>
                        <td className="px-3 py-2 capitalize">{(inc.recordType || "incident").replace(/_/g, " ")}</td>
                        <td className="px-3 py-2">{inc.injuredPerson || "—"}</td>
                        <td className="px-3 py-2">
                          {inc.riddorCategory && inc.riddorCategory !== "not_riddor_reportable"
                            ? <Badge className="bg-red-100 text-red-800 border-red-200 text-xs">RIDDOR</Badge>
                            : <span className="text-slate-400">No</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-xs text-green-600 italic py-2 flex items-center gap-1">
                <CheckCircle size={12} /> No contractor-related incidents recorded during this period.
              </p>
            )}

            {/* 5. Attendance */}
            <SectionHeader icon={Users} title="Worker Attendance" />
            {attendance?.length > 0 ? (
              <>
                <div className="flex gap-3 mb-3 flex-wrap">
                  <KpiCard label="Total Site Days" value={attendance.reduce((s: number, a: any) => s + a.daysOnSite, 0)} color="blue" />
                  <KpiCard label="Total Hours" value={`${attendance.reduce((s: number, a: any) => s + a.totalHours, 0).toFixed(1)}h`} color="blue" />
                  <KpiCard label="Active Workers" value={attendance.length} color="blue" />
                </div>
                <div className="overflow-x-auto rounded-lg border border-slate-200">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-800 text-white">
                      <tr>
                        <th className="text-left px-3 py-2">Worker</th>
                        <th className="text-left px-3 py-2">Days on Site</th>
                        <th className="text-left px-3 py-2">Total Hours</th>
                      </tr>
                    </thead>
                    <tbody>
                      {attendance.map((a: any, i: number) => (
                        <tr key={a.workerId} className={i % 2 === 1 ? "bg-slate-50" : ""}>
                          <td className="px-3 py-2">{a.name}</td>
                          <td className="px-3 py-2">{a.daysOnSite}</td>
                          <td className="px-3 py-2">{a.totalHours > 0 ? `${a.totalHours}h` : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            ) : (
              <p className="text-xs text-slate-400 italic py-2">No attendance records found for this period.</p>
            )}

            {/* 6. Equipment */}
            <SectionHeader icon={Truck} title="Plant & Equipment Register" />
            {equipment?.length > 0 ? (
              <div className="overflow-x-auto rounded-lg border border-slate-200">
                <table className="w-full text-xs">
                  <thead className="bg-slate-800 text-white">
                    <tr>
                      <th className="text-left px-3 py-2">Equipment</th>
                      <th className="text-left px-3 py-2">Category</th>
                      <th className="text-left px-3 py-2">Make / Model</th>
                      <th className="text-left px-3 py-2">Serial / Reg</th>
                      <th className="text-left px-3 py-2">Cert Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {equipment.map((e: any, i: number) => (
                      <tr key={e.id} className={i % 2 === 1 ? "bg-slate-50" : ""}>
                        <td className="px-3 py-2 font-medium">{e.name}</td>
                        <td className="px-3 py-2 capitalize">{e.category}</td>
                        <td className="px-3 py-2">{e.make_model || "—"}</td>
                        <td className="px-3 py-2">{e.serial_or_reg || "—"}</td>
                        <td className="px-3 py-2">
                          {e.docStatus === "pass" ? (
                            <Badge className="bg-green-100 text-green-800 border-green-200 text-xs">All Valid</Badge>
                          ) : e.docStatus === "warn" ? (
                            <Badge className="bg-amber-100 text-amber-800 border-amber-200 text-xs">Pending</Badge>
                          ) : e.docStatus === "fail" ? (
                            <Badge className="bg-red-100 text-red-800 border-red-200 text-xs">Expired</Badge>
                          ) : (
                            <Badge variant="outline" className="text-xs text-slate-500">No Certs</Badge>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-xs text-slate-400 italic py-2">No equipment registered for this contractor.</p>
            )}

            {/* 7. RAMS */}
            <SectionHeader icon={ClipboardList} title="RAMS Documents" />
            {rams?.length > 0 ? (
              <div className="overflow-x-auto rounded-lg border border-slate-200">
                <table className="w-full text-xs">
                  <thead className="bg-slate-800 text-white">
                    <tr>
                      <th className="text-left px-3 py-2">Document</th>
                      <th className="text-left px-3 py-2">Status</th>
                      <th className="text-left px-3 py-2">Expiry</th>
                      <th className="text-left px-3 py-2">Uploaded</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rams.map((r: any, i: number) => (
                      <tr key={r.id} className={i % 2 === 1 ? "bg-slate-50" : ""}>
                        <td className="px-3 py-2">{r.documentName}</td>
                        <td className="px-3 py-2">
                          {r.status === "approved" ? (
                            <Badge className="bg-green-100 text-green-800 border-green-200 text-xs">Approved</Badge>
                          ) : r.status === "expired" ? (
                            <Badge className="bg-red-100 text-red-800 border-red-200 text-xs">Expired</Badge>
                          ) : r.status === "expiring" ? (
                            <Badge className="bg-amber-100 text-amber-800 border-amber-200 text-xs">Expiring Soon</Badge>
                          ) : (
                            <Badge variant="outline" className="text-xs capitalize">{r.status}</Badge>
                          )}
                        </td>
                        <td className="px-3 py-2">{fmtDate(r.expiryDate)}</td>
                        <td className="px-3 py-2">{fmtDate(r.uploadedAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-xs text-slate-400 italic py-2">No RAMS documents on file for this contractor.</p>
            )}

          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
