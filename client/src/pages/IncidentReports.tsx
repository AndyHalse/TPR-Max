import { useQuery } from "@tanstack/react-query";
import GlassCard from "@/components/GlassCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollText, Download, ShieldAlert, Siren, Clock, Users, CheckCircle, XCircle, Eye } from "lucide-react";

interface IncidentReport {
  id: string;
  evacuationId: string;
  customerId: string;
  isDrill: boolean;
  activatedBy: string | null;
  startedAt: string | null;
  completedAt: string | null;
  durationSeconds: number | null;
  totalOnSite: number;
  accountedFor: number;
  unaccounted: number;
  completionPct: number;
  generatedAt: string | null;
  reportUrl: string | null;
}

function formatDuration(seconds: number | null): string {
  if (seconds === null || seconds === undefined) return "—";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m ${s}s`;
}

function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) +
    " " +
    d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

export default function IncidentReports() {
  const { data: reports = [], isLoading } = useQuery<IncidentReport[]>({
    queryKey: ["/api/emergency/incident-reports"],
  });

  const openReport = (r: IncidentReport) => {
    window.open(`/api/emergency/incident-report/${r.evacuationId}`, "_blank");
  };

  const downloadPdf = (r: IncidentReport) => {
    window.open(`/api/emergency/incident-report/${r.evacuationId}?format=pdf`, "_blank");
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <ScrollText className="text-blue-600 dark:text-blue-400 flex-shrink-0" size={28} />
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Incident Reports</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Automatically generated after every evacuation or drill.
          </p>
        </div>
      </div>

      <GlassCard className="p-4 sm:p-6">
        {isLoading ? (
          <div className="flex flex-col gap-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-24 bg-gray-100 dark:bg-gray-800 animate-pulse rounded-lg" />
            ))}
          </div>
        ) : reports.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <ScrollText size={48} className="text-gray-300 dark:text-gray-600 mb-4" />
            <p className="text-gray-500 dark:text-gray-400 font-medium">No incident reports yet</p>
            <p className="text-gray-400 dark:text-gray-500 text-sm mt-1">
              Reports are saved automatically when you end an evacuation or drill from the Muster page.
            </p>
          </div>
        ) : (
          <>
            {/* Mobile card layout */}
            <div className="flex flex-col gap-3 md:hidden">
              {reports.map(r => {
                const pct = Math.min(100, r.completionPct ?? 0);
                const pctColor =
                  pct === 100
                    ? "text-green-600 dark:text-green-400"
                    : pct >= 80
                    ? "text-yellow-600 dark:text-yellow-400"
                    : "text-red-600 dark:text-red-400";

                return (
                  <div key={r.id} className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4 flex flex-col gap-3">
                    {/* Header row: date + badge */}
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                        {formatDateTime(r.generatedAt)}
                      </span>
                      {r.isDrill ? (
                        <Badge className="bg-amber-100 text-amber-800 border-amber-400 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-600 flex items-center gap-1">
                          <ShieldAlert size={11} />
                          Fire Drill
                        </Badge>
                      ) : (
                        <Badge className="bg-red-100 text-red-800 border-red-400 dark:bg-red-900/30 dark:text-red-300 dark:border-red-600 flex items-center gap-1">
                          <Siren size={11} />
                          Emergency
                        </Badge>
                      )}
                    </div>

                    {/* Stats row */}
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-600 dark:text-gray-400">
                      <span className="flex items-center gap-1">
                        <Clock size={13} className="text-gray-400" />
                        {formatDuration(r.durationSeconds)}
                      </span>
                      <span className="flex items-center gap-1">
                        <Users size={13} className="text-gray-400" />
                        {r.totalOnSite} on site
                      </span>
                      <span className="flex items-center gap-1 text-green-600 dark:text-green-400">
                        <CheckCircle size={13} />
                        {r.accountedFor} safe
                      </span>
                      {r.unaccounted > 0 && (
                        <span className="flex items-center gap-1 text-red-600 dark:text-red-400">
                          <XCircle size={13} />
                          {r.unaccounted} missing
                        </span>
                      )}
                      <span className={`font-semibold ${pctColor}`}>{pct}% complete</span>
                    </div>

                    {r.activatedBy && (
                      <p className="text-xs text-gray-400 dark:text-gray-500">Activated by {r.activatedBy}</p>
                    )}

                    {/* Action buttons — full width on mobile */}
                    <div className="flex gap-2 pt-1">
                      <Button
                        size="sm"
                        onClick={() => openReport(r)}
                        className="flex-1 text-sm bg-blue-600 hover:bg-blue-700 text-white"
                      >
                        <Eye size={14} className="mr-1.5" />
                        View Report
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => downloadPdf(r)}
                        className="flex-1 text-sm border-green-300 text-green-700 hover:bg-green-50 dark:border-green-700 dark:text-green-300 dark:hover:bg-green-900/20"
                      >
                        <Download size={14} className="mr-1.5" />
                        PDF
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Desktop table layout */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-700 text-left text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                    <th className="pb-3 pr-4">Date &amp; Time</th>
                    <th className="pb-3 pr-4">Type</th>
                    <th className="pb-3 pr-4">Activated by</th>
                    <th className="pb-3 pr-4">Duration</th>
                    <th className="pb-3 pr-4">On Site</th>
                    <th className="pb-3 pr-4">Accounted</th>
                    <th className="pb-3 pr-4">Completion</th>
                    <th className="pb-3">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {reports.map(r => {
                    const pct = Math.min(100, r.completionPct ?? 0);
                    const pctColor =
                      pct === 100
                        ? "text-green-600 dark:text-green-400"
                        : pct >= 80
                        ? "text-yellow-600 dark:text-yellow-400"
                        : "text-red-600 dark:text-red-400";

                    return (
                      <tr key={r.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                        <td className="py-3 pr-4 text-gray-700 dark:text-gray-300 whitespace-nowrap">
                          {formatDateTime(r.generatedAt)}
                        </td>
                        <td className="py-3 pr-4">
                          {r.isDrill ? (
                            <Badge className="bg-amber-100 text-amber-800 border-amber-400 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-600 flex items-center gap-1 w-fit">
                              <ShieldAlert size={11} />
                              Fire Drill
                            </Badge>
                          ) : (
                            <Badge className="bg-red-100 text-red-800 border-red-400 dark:bg-red-900/30 dark:text-red-300 dark:border-red-600 flex items-center gap-1 w-fit">
                              <Siren size={11} />
                              Emergency
                            </Badge>
                          )}
                        </td>
                        <td className="py-3 pr-4 text-gray-600 dark:text-gray-400">
                          {r.activatedBy || "—"}
                        </td>
                        <td className="py-3 pr-4 text-gray-600 dark:text-gray-400 whitespace-nowrap">
                          <span className="flex items-center gap-1">
                            <Clock size={12} className="text-gray-400" />
                            {formatDuration(r.durationSeconds)}
                          </span>
                        </td>
                        <td className="py-3 pr-4 text-gray-700 dark:text-gray-300">
                          <span className="flex items-center gap-1">
                            <Users size={12} className="text-gray-400" />
                            {r.totalOnSite}
                          </span>
                        </td>
                        <td className="py-3 pr-4">
                          <span className="flex items-center gap-2">
                            <span className="flex items-center gap-1 text-green-600 dark:text-green-400">
                              <CheckCircle size={12} />
                              {r.accountedFor}
                            </span>
                            {r.unaccounted > 0 && (
                              <span className="flex items-center gap-1 text-red-600 dark:text-red-400">
                                <XCircle size={12} />
                                {r.unaccounted}
                              </span>
                            )}
                          </span>
                        </td>
                        <td className="py-3 pr-4">
                          <span className={`font-semibold ${pctColor}`}>{pct}%</span>
                        </td>
                        <td className="py-3">
                          <div className="flex items-center gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => openReport(r)}
                              className="text-xs border-blue-300 text-blue-700 hover:bg-blue-50 dark:border-blue-700 dark:text-blue-300 dark:hover:bg-blue-900/20"
                            >
                              View Report
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => downloadPdf(r)}
                              className="text-xs border-green-300 text-green-700 hover:bg-green-50 dark:border-green-700 dark:text-green-300 dark:hover:bg-green-900/20"
                            >
                              <Download size={12} className="mr-1" />
                              PDF
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </GlassCard>
    </div>
  );
}
