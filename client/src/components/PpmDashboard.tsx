import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Building2, CalendarClock, AlertTriangle, CheckCircle2, TrendingUp,
} from "lucide-react";
import {
  PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
} from "recharts";

// ─── Types (matching PPM.tsx shapes) ────────────────────────────────────────

interface PpmAsset {
  id: string;
  name: string;
  category?: string | null;
  status: string;
}

interface PpmWorkOrder {
  id: string;
  assetId?: string | null;
  title: string;
  status: string;
  dueDate?: string | null;
  completedDate?: string | null;
  contractorCompanyName?: string | null;
  templateType?: string | null;
  expiredDocCount?: number;
  expiringSoonDocCount?: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const NAVY = "#1e3a5f";
const TEAL = "#0d9488";
const RED = "#ef4444";
const BLUE = "#3b82f6";
const SLATE = "#94a3b8";
const LIGHT_GREY = "#e2e8f0";

const MONTH_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function withinMonth(dateStr: string | null | undefined, year: number, month: number): boolean {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  return d.getFullYear() === year && d.getMonth() === month;
}

function isOverdue(wo: PpmWorkOrder, today: Date): boolean {
  if (wo.status === "overdue") return true;
  if (wo.status === "completed" || wo.status === "cancelled") return false;
  if (!wo.dueDate) return false;
  return new Date(wo.dueDate) < today;
}

function fmt(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

// ─── KPI Card ────────────────────────────────────────────────────────────────

interface KpiCardProps {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  accent?: string;
  sub?: string;
}

function KpiCard({ label, value, icon, accent = NAVY, sub }: KpiCardProps) {
  return (
    <Card className="flex-1 min-w-0">
      <CardContent className="p-4 flex items-start gap-3">
        <div
          className="rounded-lg p-2 shrink-0"
          style={{ background: `${accent}18`, color: accent }}
        >
          {icon}
        </div>
        <div className="min-w-0">
          <p className="text-2xl font-bold text-gray-900 leading-tight">{value}</p>
          <p className="text-xs text-gray-500 mt-0.5 leading-snug">{label}</p>
          {sub && <p className="text-xs mt-0.5" style={{ color: accent }}>{sub}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Donut centre label ──────────────────────────────────────────────────────

function DonutLabel({ total }: { total: number }) {
  return (
    <text
      x="50%"
      y="50%"
      textAnchor="middle"
      dominantBaseline="central"
      style={{ fontSize: 20, fontWeight: 700, fill: "#1e293b" }}
    >
      {total}
    </text>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function PpmDashboard() {
  const { data: assets = [], isLoading: loadingAssets } = useQuery<PpmAsset[]>({
    queryKey: ["/api/ppm/assets"],
  });
  const { data: workOrders = [], isLoading: loadingWO, dataUpdatedAt } = useQuery<PpmWorkOrder[]>({
    queryKey: ["/api/ppm/work-orders"],
  });
  // schedules fetched for completeness / future use; dashboard derives from assets+WOs
  useQuery({ queryKey: ["/api/ppm/schedules"] });

  const isLoading = loadingAssets || loadingWO;

  const now = useMemo(() => new Date(), []);
  const curYear = now.getFullYear();
  const curMonth = now.getMonth();

  // ── KPIs ─────────────────────────────────────────────────────────────────

  const kpi = useMemo(() => {
    const activeAssets = assets.filter(a => a.status === "active").length;

    const nonCancelled = workOrders.filter(wo => wo.status !== "cancelled");
    const completed = workOrders.filter(wo => wo.status === "completed");

    const dueThisMonth = workOrders.filter(
      wo => wo.status !== "completed" && wo.status !== "cancelled" && withinMonth(wo.dueDate, curYear, curMonth)
    ).length;

    const overdueList = workOrders.filter(wo => isOverdue(wo, now));

    const completedThisMonth = completed.filter(
      wo => withinMonth(wo.completedDate, curYear, curMonth)
    ).length;

    const complianceRate = nonCancelled.length > 0
      ? Math.round((completed.length / nonCancelled.length) * 100)
      : 0;

    return { activeAssets, dueThisMonth, overdueList, completedThisMonth, complianceRate, completed, nonCancelled };
  }, [assets, workOrders, now, curYear, curMonth]);

  // ── Donut data ────────────────────────────────────────────────────────────

  const donutData = useMemo(() => {
    const counts: Record<string, number> = {
      Completed: 0, "In Progress": 0, Overdue: 0, Scheduled: 0, Cancelled: 0,
    };
    for (const wo of workOrders) {
      if (wo.status === "completed") counts["Completed"]++;
      else if (wo.status === "in_progress") counts["In Progress"]++;
      else if (isOverdue(wo, now)) counts["Overdue"]++;
      else if (wo.status === "cancelled") counts["Cancelled"]++;
      else counts["Scheduled"]++;
    }
    const colours: Record<string, string> = {
      Completed: TEAL, "In Progress": BLUE, Overdue: RED, Scheduled: SLATE, Cancelled: LIGHT_GREY,
    };
    return Object.entries(counts)
      .filter(([, v]) => v > 0)
      .map(([name, value]) => ({ name, value, fill: colours[name] }));
  }, [workOrders, now]);

  // ── Monthly trend (last 6 months) ─────────────────────────────────────────

  const monthlyTrend = useMemo(() => {
    return Array.from({ length: 6 }, (_, i) => {
      const offset = 5 - i;
      const d = new Date(curYear, curMonth - offset, 1);
      const y = d.getFullYear();
      const m = d.getMonth();
      const completed = workOrders.filter(
        wo => wo.status === "completed" && withinMonth(wo.completedDate, y, m)
      ).length;
      const overdue = workOrders.filter(
        wo => isOverdue(wo, now) && withinMonth(wo.dueDate, y, m)
      ).length;
      return { month: MONTH_SHORT[m], completed, overdue };
    });
  }, [workOrders, now, curYear, curMonth]);

  // ── Assets by category ────────────────────────────────────────────────────

  const categoryData = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const a of assets.filter(a => a.status === "active")) {
      const cat = a.category || "Other";
      counts[cat] = (counts[cat] ?? 0) + 1;
    }
    return Object.entries(counts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
  }, [assets]);

  // ── Statutory compliance ──────────────────────────────────────────────────

  const statutoryStats = useMemo(() => {
    const statutory = workOrders.filter(wo => wo.templateType === "statutory");
    const nonStatutory = workOrders.filter(wo => wo.templateType === "non_statutory" || wo.templateType === "non-statutory");
    function stats(list: PpmWorkOrder[]) {
      const total = list.filter(wo => wo.status !== "cancelled").length;
      const done = list.filter(wo => wo.status === "completed").length;
      const pct = total > 0 ? Math.round((done / total) * 100) : 0;
      return { total, done, pct };
    }
    return { statutory: stats(statutory), nonStatutory: stats(nonStatutory) };
  }, [workOrders]);

  // ── Overdue table ─────────────────────────────────────────────────────────

  const overdueRows = useMemo(() => {
    const assetMap = Object.fromEntries(assets.map(a => [a.id, a]));
    return [...kpi.overdueList]
      .sort((a, b) => {
        const da = a.dueDate ? new Date(a.dueDate).getTime() : 0;
        const db = b.dueDate ? new Date(b.dueDate).getTime() : 0;
        return da - db;
      })
      .slice(0, 10)
      .map(wo => ({
        ...wo,
        assetName: wo.assetId ? (assetMap[wo.assetId]?.name ?? "—") : "—",
      }));
  }, [kpi.overdueList, assets]);

  // ── Expiring certs ────────────────────────────────────────────────────────

  const expiringCerts = useMemo(() => {
    const assetMap = Object.fromEntries(assets.map(a => [a.id, a]));
    return workOrders
      .filter(wo => (wo.expiringSoonDocCount ?? 0) > 0 || (wo.expiredDocCount ?? 0) > 0)
      .sort((a, b) => (b.expiredDocCount ?? 0) - (a.expiredDocCount ?? 0))
      .map(wo => ({
        ...wo,
        assetName: wo.assetId ? (assetMap[wo.assetId]?.name ?? "—") : "—",
      }));
  }, [workOrders, assets]);

  // ── Compliance colour helper ──────────────────────────────────────────────

  const complianceColour = kpi.complianceRate >= 80 ? "#16a34a" : kpi.complianceRate >= 50 ? "#d97706" : RED;

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="space-y-6 p-1">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Skeleton className="h-72 rounded-xl" />
          <Skeleton className="h-72 rounded-xl" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Skeleton className="h-72 rounded-xl" />
          <Skeleton className="h-72 rounded-xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-8">

      {/* ── Section 1: KPI Strip ── */}
      <div className="flex flex-col md:flex-row gap-3">
        <KpiCard
          label="Active Assets"
          value={kpi.activeAssets}
          icon={<Building2 className="h-5 w-5" />}
          accent={TEAL}
        />
        <KpiCard
          label="Due This Month"
          value={kpi.dueThisMonth}
          icon={<CalendarClock className="h-5 w-5" />}
          accent={kpi.dueThisMonth > 0 ? "#d97706" : "#94a3b8"}
        />
        <KpiCard
          label="Overdue"
          value={kpi.overdueList.length}
          icon={<AlertTriangle className="h-5 w-5" />}
          accent={kpi.overdueList.length > 0 ? RED : "#94a3b8"}
        />
        <KpiCard
          label="Completed This Month"
          value={kpi.completedThisMonth}
          icon={<CheckCircle2 className="h-5 w-5" />}
          accent="#16a34a"
        />
        <KpiCard
          label="Overall Completion Rate"
          value={`${kpi.complianceRate}%`}
          icon={<TrendingUp className="h-5 w-5" />}
          accent={complianceColour}
          sub={`${kpi.completed.length} of ${kpi.nonCancelled.length} completed`}
        />
      </div>

      {dataUpdatedAt > 0 && (
        <p className="text-xs text-gray-400 -mt-3">
          Last updated {new Date(dataUpdatedAt).toLocaleTimeString()}
        </p>
      )}

      {/* ── Section 2: Status donut + Monthly trend ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

        {/* Donut */}
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-sm font-semibold text-gray-700">Work Order Status Breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            {workOrders.length === 0 ? (
              <p className="text-sm text-gray-400 py-10 text-center">No work orders yet</p>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie
                    data={donutData}
                    cx="50%"
                    cy="50%"
                    innerRadius={68}
                    outerRadius={100}
                    dataKey="value"
                    paddingAngle={2}
                  >
                    {donutData.map((entry, i) => (
                      <Cell key={i} fill={entry.fill} />
                    ))}
                    <DonutLabel total={workOrders.length} />
                  </Pie>
                  <Tooltip formatter={(v: number, name: string) => [`${v} work orders`, name]} />
                  <Legend iconType="circle" iconSize={8} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Monthly trend */}
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-sm font-semibold text-gray-700">Monthly Completion Trend</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={monthlyTrend} barCategoryGap="30%">
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                <Tooltip />
                <Bar dataKey="completed" name="Completed" fill={TEAL} radius={[3, 3, 0, 0]} />
                <Bar dataKey="overdue" name="Overdue" fill={RED} radius={[3, 3, 0, 0]} />
                <Legend iconType="circle" iconSize={8} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* ── Section 3: Assets by Category + Statutory compliance ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

        {/* Horizontal bar — assets by category */}
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-sm font-semibold text-gray-700">Active Assets by Category</CardTitle>
          </CardHeader>
          <CardContent>
            {categoryData.length === 0 ? (
              <p className="text-sm text-gray-400 py-10 text-center">No active assets</p>
            ) : (
              <ResponsiveContainer width="100%" height={Math.max(240, categoryData.length * 36)}>
                <BarChart
                  layout="vertical"
                  data={categoryData}
                  margin={{ left: 8, right: 32, top: 4, bottom: 4 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                  <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
                  <YAxis type="category" dataKey="name" width={100} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="count" name="Assets" fill={NAVY} radius={[0, 3, 3, 0]}
                    label={{ position: "right", fontSize: 11, fill: "#64748b" }}
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Statutory vs Non-Statutory compliance */}
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-sm font-semibold text-gray-700">Statutory vs Non-Statutory Compliance</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6 pt-3">
            {[
              { label: "Statutory", stats: statutoryStats.statutory, colour: TEAL },
              { label: "Non-Statutory", stats: statutoryStats.nonStatutory, colour: NAVY },
            ].map(({ label, stats, colour }) => (
              <div key={label}>
                <div className="flex justify-between text-xs text-gray-600 mb-1">
                  <span className="font-medium">{label}</span>
                  <span>{stats.done} / {stats.total} — {stats.pct}%</span>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-4 overflow-hidden">
                  <div
                    className="h-4 rounded-full transition-all"
                    style={{ width: `${stats.pct}%`, background: colour }}
                  />
                </div>
                {stats.total === 0 && (
                  <p className="text-xs text-gray-400 mt-1">No {label.toLowerCase()} work orders recorded</p>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* ── Section 4: Overdue table ── */}
      {overdueRows.length > 0 && (
        <Card className="border-red-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2" style={{ color: RED }}>
              <AlertTriangle className="h-4 w-4" />
              Requires Attention
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-red-50 text-gray-600">
                    <th className="text-left px-4 py-2 font-medium">Work Order</th>
                    <th className="text-left px-4 py-2 font-medium">Asset</th>
                    <th className="text-left px-4 py-2 font-medium">Due Date</th>
                    <th className="text-left px-4 py-2 font-medium">Assigned To</th>
                    <th className="text-left px-4 py-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {overdueRows.map((wo, i) => {
                    const isPast = wo.dueDate ? new Date(wo.dueDate) < now : false;
                    return (
                      <tr key={wo.id} className={i % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                        <td className="px-4 py-2.5 font-medium text-gray-900 max-w-[200px] truncate">{wo.title}</td>
                        <td className="px-4 py-2.5 text-gray-600 max-w-[150px] truncate">{wo.assetName}</td>
                        <td className="px-4 py-2.5 whitespace-nowrap">
                          <span className={isPast ? "text-red-600 font-medium" : "text-gray-600"}>
                            {fmt(wo.dueDate)}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-gray-600">{wo.contractorCompanyName || "Unassigned"}</td>
                        <td className="px-4 py-2.5">
                          <Badge className="bg-red-100 text-red-700 border-red-200 text-xs font-semibold uppercase tracking-wide">
                            Overdue
                          </Badge>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {kpi.overdueList.length > 10 && (
              <p className="text-xs text-gray-500 px-4 py-3">
                and {kpi.overdueList.length - 10} more overdue items
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Section 5: Certificates expiring ── */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold text-gray-700">Certificates Expiring Within 30 Days</CardTitle>
        </CardHeader>
        <CardContent>
          {expiringCerts.length === 0 ? (
            <div className="flex items-center gap-2 text-sm text-green-600 py-2">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              All certificates are current
            </div>
          ) : (
            <ul className="divide-y divide-gray-100">
              {expiringCerts.map(wo => (
                <li key={wo.id} className="flex items-center justify-between py-2.5 gap-4">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{wo.title}</p>
                    <p className="text-xs text-gray-500 truncate">{wo.assetName}</p>
                  </div>
                  <div className="flex gap-1.5 shrink-0">
                    {(wo.expiredDocCount ?? 0) > 0 && (
                      <Badge className="bg-red-100 text-red-700 border-red-200 text-xs">
                        {wo.expiredDocCount} expired
                      </Badge>
                    )}
                    {(wo.expiringSoonDocCount ?? 0) > 0 && (
                      <Badge className="bg-amber-100 text-amber-700 border-amber-200 text-xs">
                        {wo.expiringSoonDocCount} expiring soon
                      </Badge>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
