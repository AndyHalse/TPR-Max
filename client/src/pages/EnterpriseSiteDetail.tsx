import { useState, useMemo } from "react";
import { useParams, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Building2, ArrowLeft, AlertTriangle, CheckCircle2, FileText,
  HardHat, Wrench, ClipboardList, ExternalLink, ShieldCheck,
  MapPin, Globe, Calendar, Phone, Mail, User,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface SiteInfo {
  id: string;
  name: string;
  address: string | null;
  addressLine2: string | null;
  city: string | null;
  county: string | null;
  postcode: string | null;
  region: string | null;
  status: string;
  siteContactName: string | null;
  siteContactRole: string | null;
  siteContactPhone: string | null;
  siteContactEmail: string | null;
  accessNotes: string | null;
  propertyType: string | null;
  clientName: string | null;
  managingSurveyor: string | null;
  floorArea: string | null;
  unitCount: number | null;
  what3words: string | null;
  mapLink: string | null;
  latitude: number | null;
  longitude: number | null;
}

interface SiteCompliance {
  siteId: string;
  siteName: string;
  score: number | null;
  categoryScores: Record<string, number | null>;
  openCriticals: number;
  openWarnings: number;
  totalItems: number;
  lapsedItems: number;
  expiringItems: number;
}

interface AlertRow {
  id: string;
  siteId: string;
  siteName: string;
  category: string;
  severity: string;
  title: string;
  detail: { count?: number; siteId?: string };
  status: string;
  createdAt: string;
}

interface ExpiryRow {
  id: string;
  siteId: string;
  siteName: string;
  category: string;
  sourceTable: string;
  sourceId: string;
  status: string;
  expiresAt: string | null;
}

interface ItemRow {
  id: string;
  siteId: string;
  category: string;
  sourceTable: string;
  sourceId: string;
  status: string;
  severity: string;
  expiresAt: string | null;
  updatedAt: string;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const CATEGORY_LABELS: Record<string, string> = {
  insurance: "Insurance",
  rams: "RAMS",
  inductions: "Inductions",
  certificates: "Certificates",
  ppm: "PPM",
  fire: "Fire Risk",
  rtw: "Right to Work",
};

const SOURCE_TABLE_LABELS: Record<string, string> = {
  contractor_documents: "Contractor Document",
  rams_documents: "RAMS Document",
  contractor_workers: "Worker Record",
  compliance_certificates: "Certificate",
  ppm_work_orders: "PPM Order",
  fire_risk_assessments: "Fire Risk Assessment",
};

const CATEGORY_LINKS: Record<string, string> = {
  insurance: "/contractors",
  rams: "/contractors",
  inductions: "/contractors",
  certificates: "/contractors",
  ppm: "/maintenance",
  fire: "/maintenance",
  rtw: "/contractors",
};

const CONTRACTOR_CATS = new Set(["insurance", "rams", "inductions", "rtw"]);
const DOCUMENT_CATS = new Set(["certificates", "fire"]);
const PPM_CATS = new Set(["ppm"]);

// ── Helpers ───────────────────────────────────────────────────────────────────

function toGBDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    const [y, m, d] = iso.split("T")[0].split("-");
    return `${d}/${m}/${y}`;
  } catch { return iso; }
}

function daysUntil(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const diff = new Date(iso.split("T")[0]).getTime() - new Date().setHours(0, 0, 0, 0);
  return Math.ceil(diff / 86_400_000);
}

function scoreColor(score: number | null): string {
  if (score === null) return "#94a3b8";
  if (score >= 80) return "#22c55e";
  if (score >= 50) return "#f59e0b";
  return "#ef4444";
}

function scoreStatus(score: number | null): { label: string; bg: string; text: string } {
  if (score === null) return { label: "No Data", bg: "#f1f5f9", text: "#64748b" };
  if (score >= 80) return { label: "Compliant", bg: "#dcfce7", text: "#166534" };
  if (score >= 50) return { label: "Warning",   bg: "#fef3c7", text: "#92400e" };
  return               { label: "Critical",     bg: "#fee2e2", text: "#991b1b" };
}

function itemStatusChip(status: string, expiresAt: string | null) {
  if (status === "lapsed" || status === "missing") {
    return { label: status === "lapsed" ? "LAPSED" : "MISSING",
             cls: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300" };
  }
  if (status === "expiring") {
    const d = daysUntil(expiresAt);
    const label = d === null ? "EXPIRING" : d === 0 ? "TODAY" : `${d}d`;
    const urgent = d !== null && d <= 7;
    return {
      label,
      cls: urgent
        ? "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300"
        : "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
    };
  }
  return { label: "OK", cls: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300" };
}

// ── Score Ring ────────────────────────────────────────────────────────────────

function ScoreRing({ score, size = 80 }: { score: number | null; size?: number }) {
  const R = size / 2 - 7;
  const circ = 2 * Math.PI * R;
  const fill = score === null ? 0 : Math.min(100, Math.max(0, score));
  const dash = (fill / 100) * circ;
  const color = scoreColor(score);
  return (
    <div className="relative flex items-center justify-center shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={R} fill="none" stroke="#e2e8f0" strokeWidth="6"
          className="dark:stroke-slate-700" />
        <circle cx={size / 2} cy={size / 2} r={R} fill="none" stroke={color} strokeWidth="6"
          strokeDasharray={`${dash} ${circ - dash}`} strokeLinecap="round" />
      </svg>
      <span className="absolute font-bold text-lg" style={{ color }}>
        {score === null ? "—" : score}
      </span>
    </div>
  );
}

// ── Category Bar ──────────────────────────────────────────────────────────────

function CategoryBar({ label, score }: { label: string; score: number | null }) {
  const color = scoreColor(score);
  const pct = score ?? 0;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-slate-600 dark:text-slate-400">{label}</span>
        <span className="font-semibold" style={{ color }}>{score === null ? "—" : score}</span>
      </div>
      <div className="h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
        {score !== null && (
          <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: color }} />
        )}
      </div>
    </div>
  );
}

// ── Tab types ─────────────────────────────────────────────────────────────────

type TabId = "overview" | "contractors" | "documents" | "ppm" | "reports";

const TABS: { id: TabId; label: string; icon: typeof ShieldCheck }[] = [
  { id: "overview",     label: "Overview",     icon: ShieldCheck  },
  { id: "contractors",  label: "Contractors",  icon: HardHat      },
  { id: "documents",    label: "Documents",    icon: FileText     },
  { id: "ppm",          label: "PPM",          icon: Wrench       },
  { id: "reports",      label: "Reports",      icon: ClipboardList },
];

// ── Main component ────────────────────────────────────────────────────────────

export default function EnterpriseSiteDetail() {
  const params = useParams<{ id: string }>();
  const siteId = params.id ?? "";
  const [activeTab, setActiveTab] = useState<TabId>("overview");

  const { data: site, isLoading: siteLoading, isError: siteError, error: siteErrorObj, refetch: refetchSite } = useQuery<SiteInfo>({
    queryKey: [`/api/enterprise/sites/${siteId}`],
    enabled: !!siteId,
    staleTime: 60_000,
  });

  const { data: compliance, isLoading: compLoading } = useQuery<SiteCompliance>({
    queryKey: [`/api/enterprise/compliance/sites/${siteId}`],
    enabled: !!siteId,
    staleTime: 60_000,
  });

  const { data: alerts = [], isLoading: alertsLoading } = useQuery<AlertRow[]>({
    queryKey: ["/api/enterprise/compliance/alerts", siteId, "open"],
    queryFn: async () => {
      const res = await fetch(`/api/enterprise/compliance/alerts?siteId=${siteId}&status=open`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!siteId,
    staleTime: 60_000,
  });

  const { data: expiries = [], isLoading: expiriesLoading } = useQuery<ExpiryRow[]>({
    queryKey: ["/api/enterprise/compliance/expiries", siteId, "90"],
    queryFn: async () => {
      const res = await fetch(`/api/enterprise/compliance/expiries?siteId=${siteId}&days=90`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!siteId,
    staleTime: 60_000,
  });

  const needsItems = activeTab !== "overview" && activeTab !== "reports";
  const { data: allItems = [], isLoading: itemsLoading } = useQuery<ItemRow[]>({
    queryKey: ["/api/enterprise/compliance/items", siteId],
    queryFn: async () => {
      const res = await fetch(`/api/enterprise/compliance/items?siteId=${siteId}`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!siteId && needsItems,
    staleTime: 60_000,
  });

  const contractorItems = useMemo(() => allItems.filter(i => CONTRACTOR_CATS.has(i.category)), [allItems]);
  const documentItems   = useMemo(() => allItems.filter(i => DOCUMENT_CATS.has(i.category)),   [allItems]);
  const ppmItems        = useMemo(() => allItems.filter(i => PPM_CATS.has(i.category)),         [allItems]);

  const sortedCategoryScores = useMemo(() => {
    if (!compliance?.categoryScores) return [];
    return Object.entries(compliance.categoryScores)
      .map(([cat, score]) => ({ cat, label: CATEGORY_LABELS[cat] ?? cat, score: score as number | null }))
      .sort((a, b) => (a.score ?? -1) - (b.score ?? -1));
  }, [compliance]);

  const status = compliance ? scoreStatus(compliance.score) : null;

  if (siteLoading || compLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (siteError) {
    const is403 = (siteErrorObj as any)?.status === 403;
    return (
      <div className="p-6 flex items-center justify-center min-h-64">
        <div className="p-8 max-w-sm text-center space-y-3 border rounded-xl bg-card">
          <div className="w-12 h-12 rounded-xl bg-amber-50 dark:bg-amber-900/20 flex items-center justify-center mx-auto">
            <ShieldCheck size={24} className="text-amber-400" />
          </div>
          <h2 className="font-semibold">{is403 ? "Access restricted" : "Couldn't load site details"}</h2>
          <p className="text-sm text-muted-foreground">
            {is403
              ? "You don't have access to this site. Ask an Enterprise Admin to grant you a role."
              : "The request failed — please try again or contact your administrator."}
          </p>
          {!is403 && (
            <Button variant="outline" size="sm" onClick={() => refetchSite()}>Try again</Button>
          )}
        </div>
      </div>
    );
  }

  const siteName = site?.name ?? compliance?.siteName ?? "Site";
  const score = compliance?.score ?? null;

  return (
    <TooltipProvider>
      <div className="space-y-6">
        {/* Back link */}
        <Link href="/enterprise/sites">
          <Button variant="ghost" size="sm" className="gap-1.5 -ml-2 text-slate-500 hover:text-slate-700">
            <ArrowLeft size={15} />
            Sites
          </Button>
        </Link>

        {/* Site header */}
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5">
          <div className="flex flex-wrap items-start gap-5">
            <ScoreRing score={score} size={80} />
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2 mb-1">
                <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                  <Building2 size={20} className="text-blue-500 shrink-0" />
                  {siteName}
                </h1>
                {status && (
                  <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold"
                    style={{ backgroundColor: status.bg, color: status.text }}>
                    {status.label}
                  </span>
                )}
                {site?.status && site.status !== "active" && (
                  <Badge variant="outline" className="text-xs capitalize">{site.status}</Badge>
                )}
              </div>

              <div className="flex flex-wrap gap-3 text-xs text-slate-500 dark:text-slate-400 mb-2">
                {(site?.address || site?.postcode) && (
                  <span className="flex items-center gap-1">
                    <MapPin size={11} />
                    {[site.address, site.postcode].filter(Boolean).join(", ")}
                  </span>
                )}
                {site?.region && (
                  <span className="flex items-center gap-1">
                    <Globe size={11} />
                    {site.region}
                  </span>
                )}
              </div>

              {compliance && (
                <div className="flex flex-wrap gap-4 text-xs">
                  {compliance.openCriticals > 0 && (
                    <span className="text-red-600 dark:text-red-400 font-semibold">
                      {compliance.openCriticals} critical issue{compliance.openCriticals !== 1 ? "s" : ""}
                    </span>
                  )}
                  {compliance.openWarnings > 0 && (
                    <span className="text-amber-600 dark:text-amber-400 font-semibold">
                      {compliance.openWarnings} warning{compliance.openWarnings !== 1 ? "s" : ""}
                    </span>
                  )}
                  {compliance.openCriticals === 0 && compliance.openWarnings === 0 && (
                    <span className="text-green-600 dark:text-green-400 font-semibold flex items-center gap-1">
                      <CheckCircle2 size={12} />
                      No open issues
                    </span>
                  )}
                  {compliance.expiringItems > 0 && (
                    <span className="text-amber-600 dark:text-amber-400">
                      {compliance.expiringItems} expiring soon
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Site details panel */}
        {site && (() => {
          const hasProfile = !!(site.addressLine2 || site.city || site.county ||
            site.siteContactName || site.siteContactPhone || site.siteContactEmail ||
            site.accessNotes || site.propertyType || site.clientName ||
            site.managingSurveyor || site.floorArea || site.unitCount != null ||
            site.what3words || site.mapLink);
          return (
            <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5">
              <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">Site Details</h2>
              {!hasProfile ? (
                <p className="text-xs text-slate-400 italic">No site details added yet — use Edit on the Sites page.</p>
              ) : (
                <div className="space-y-4">
                  {(site.addressLine2 || site.city || site.county) && (
                    <div className="space-y-0.5 text-sm">
                      <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1">Address</p>
                      {site.address && <p className="text-slate-700 dark:text-slate-300">{site.address}</p>}
                      {site.addressLine2 && <p className="text-slate-700 dark:text-slate-300">{site.addressLine2}</p>}
                      {(site.city || site.county) && <p className="text-slate-700 dark:text-slate-300">{[site.city, site.county].filter(Boolean).join(", ")}</p>}
                      {site.postcode && <p className="text-slate-700 dark:text-slate-300">{site.postcode}</p>}
                      {site.region && <p className="text-xs text-slate-400 mt-0.5">{site.region}</p>}
                    </div>
                  )}
                  {(site.siteContactName || site.siteContactPhone || site.siteContactEmail || site.accessNotes) && (
                    <div className="space-y-1.5">
                      <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">On-site Contact</p>
                      {site.siteContactName && (
                        <p className="text-sm text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                          <User size={12} className="text-slate-400 shrink-0" />
                          {site.siteContactName}{site.siteContactRole ? ` · ${site.siteContactRole}` : ""}
                        </p>
                      )}
                      {site.siteContactPhone && (
                        <a href={`tel:${site.siteContactPhone}`} className="text-sm text-blue-600 dark:text-blue-400 flex items-center gap-1.5 hover:underline">
                          <Phone size={12} className="shrink-0" />{site.siteContactPhone}
                        </a>
                      )}
                      {site.siteContactEmail && (
                        <a href={`mailto:${site.siteContactEmail}`} className="text-sm text-blue-600 dark:text-blue-400 flex items-center gap-1.5 hover:underline">
                          <Mail size={12} className="shrink-0" />{site.siteContactEmail}
                        </a>
                      )}
                      {site.accessNotes && (
                        <p className="text-xs text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800 rounded p-2">{site.accessNotes}</p>
                      )}
                    </div>
                  )}
                  {(site.propertyType || site.clientName || site.managingSurveyor || site.floorArea || site.unitCount != null) && (
                    <div className="space-y-1.5">
                      <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">Property</p>
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-600 dark:text-slate-300">
                        {site.propertyType && (
                          <Badge variant="secondary" className="text-xs capitalize">{site.propertyType.replace(/_/g, " ")}</Badge>
                        )}
                        {site.clientName && <span>Client: {site.clientName}</span>}
                        {site.managingSurveyor && <span>Surveyor: {site.managingSurveyor}</span>}
                        {site.floorArea && <span>Area: {site.floorArea}</span>}
                        {site.unitCount != null && <span>Units: {site.unitCount}</span>}
                      </div>
                    </div>
                  )}
                  {(site.what3words || site.mapLink || site.postcode) && (
                    <div className="space-y-1.5">
                      <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">Wayfinding</p>
                      <div className="flex flex-wrap gap-3">
                        {site.what3words && (
                          <a href={`https://what3words.com/${site.what3words.replace(/^\/\/\//, "")}`} target="_blank" rel="noreferrer" className="text-sm text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1">
                            <ExternalLink size={11} />///{site.what3words.replace(/^\/\/\//, "")}
                          </a>
                        )}
                        {(site.mapLink || site.postcode) && (
                          <a href={site.mapLink || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(site.postcode ?? site.name ?? "")}`} target="_blank" rel="noreferrer" className="text-xs text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1">
                            <ExternalLink size={11} />Open in maps
                          </a>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })()}

        {/* Tab bar */}
        <div className="flex gap-0 border-b border-slate-200 dark:border-slate-700 overflow-x-auto">
          {TABS.map(tab => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap ${
                  activeTab === tab.id
                    ? "border-primary text-primary"
                    : "border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                }`}
              >
                <Icon size={14} />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Tab content */}
        {activeTab === "overview" && (
          <OverviewTab
            compliance={compliance}
            sortedCategoryScores={sortedCategoryScores}
            alerts={alerts}
            alertsLoading={alertsLoading}
            expiries={expiries}
            expiriesLoading={expiriesLoading}
          />
        )}
        {activeTab === "contractors" && (
          <ItemsTab
            items={contractorItems}
            loading={itemsLoading}
            emptyText="No contractor compliance items recorded for this site."
            drillBase="/contractors"
          />
        )}
        {activeTab === "documents" && (
          <ItemsTab
            items={documentItems}
            loading={itemsLoading}
            emptyText="No document compliance items recorded for this site."
            drillBase="/contractors"
          />
        )}
        {activeTab === "ppm" && (
          <ItemsTab
            items={ppmItems}
            loading={itemsLoading}
            emptyText="No PPM items recorded for this site."
            drillBase="/maintenance"
          />
        )}
        {activeTab === "reports" && (
          <ReportsTab siteId={siteId} siteName={siteName} />
        )}
      </div>
    </TooltipProvider>
  );
}

// ── Overview tab ──────────────────────────────────────────────────────────────

function OverviewTab({
  compliance,
  sortedCategoryScores,
  alerts,
  alertsLoading,
  expiries,
  expiriesLoading,
}: {
  compliance: SiteCompliance | undefined;
  sortedCategoryScores: { cat: string; label: string; score: number }[];
  alerts: AlertRow[];
  alertsLoading: boolean;
  expiries: ExpiryRow[];
  expiriesLoading: boolean;
}) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Category breakdown */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5">
        <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-4">Category Scores</h2>
        {sortedCategoryScores.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-8">No compliance data yet — run an evaluation first.</p>
        ) : (
          <div className="space-y-3">
            {sortedCategoryScores.map(({ cat, label, score }) => (
              <CategoryBar key={cat} label={label} score={score} />
            ))}
          </div>
        )}
      </div>

      {/* Open alerts */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5">
        <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-4 flex items-center gap-2">
          <AlertTriangle size={14} className="text-red-500" />
          Open Issues
          {!alertsLoading && alerts.length > 0 && (
            <span className="ml-auto text-xs bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300 rounded-full px-2 py-0.5 font-semibold">
              {alerts.length}
            </span>
          )}
        </h2>
        {alertsLoading ? (
          <div className="space-y-2">{[1, 2, 3].map(i => <Skeleton key={i} className="h-10 w-full" />)}</div>
        ) : alerts.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-8">
            <CheckCircle2 size={28} className="text-green-400" />
            <p className="text-sm text-green-600 dark:text-green-400">No open issues</p>
          </div>
        ) : (
          <div className="max-h-72 overflow-y-auto -mx-2 px-2 space-y-0">
            {alerts.map(alert => (
              <div key={alert.id} className="flex items-start gap-2 py-2.5 border-b border-slate-100 dark:border-slate-800 last:border-0">
                <AlertTriangle size={13} className="mt-0.5 shrink-0"
                  style={{ color: alert.severity === "critical" ? "#ef4444" : "#f59e0b" }} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded"
                      style={{
                        backgroundColor: alert.severity === "critical" ? "#fee2e2" : "#fef3c7",
                        color:           alert.severity === "critical" ? "#991b1b" : "#92400e",
                      }}>
                      {alert.severity.toUpperCase()}
                    </span>
                    <span className="text-[10px] text-slate-500">
                      {CATEGORY_LABELS[alert.category] ?? alert.category}
                    </span>
                  </div>
                  <p className="text-xs text-slate-700 dark:text-slate-200 leading-snug">{alert.title}</p>
                </div>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Link href={CATEGORY_LINKS[alert.category] ?? "/"}>
                      <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0">
                        <ExternalLink size={11} className="text-slate-400" />
                      </Button>
                    </Link>
                  </TooltipTrigger>
                  <TooltipContent>Open {CATEGORY_LABELS[alert.category] ?? alert.category}</TooltipContent>
                </Tooltip>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Upcoming expiries */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5 lg:col-span-2">
        <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-4 flex items-center gap-2">
          <Calendar size={14} className="text-amber-500" />
          Expiries — next 90 days
          {!expiriesLoading && expiries.length > 0 && (
            <span className="ml-auto text-xs bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 rounded-full px-2 py-0.5 font-semibold">
              {expiries.length}
            </span>
          )}
        </h2>
        {expiriesLoading ? (
          <div className="space-y-2">{[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-10 w-full" />)}</div>
        ) : expiries.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-8">
            <CheckCircle2 size={28} className="text-green-400" />
            <p className="text-sm text-green-600 dark:text-green-400">Nothing expiring in the next 90 days</p>
          </div>
        ) : (
          <div className="max-h-64 overflow-y-auto -mx-2 px-2">
            {expiries.map(item => {
              const chip = itemStatusChip(item.status, item.expiresAt);
              return (
                <div key={item.id} className="flex items-center gap-2 py-2.5 border-b border-slate-100 dark:border-slate-800 last:border-0">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-slate-700 dark:text-slate-200 truncate">
                      {CATEGORY_LABELS[item.category] ?? item.category}
                    </p>
                    <p className="text-[11px] text-slate-400 truncate">
                      {SOURCE_TABLE_LABELS[item.sourceTable] ?? item.sourceTable}
                    </p>
                  </div>
                  <span className="text-[11px] text-slate-500 font-mono shrink-0">{toGBDate(item.expiresAt)}</span>
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0 ${chip.cls}`}>{chip.label}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Items tab (Contractors / Documents / PPM) ─────────────────────────────────

function ItemsTab({
  items,
  loading,
  emptyText,
  drillBase,
}: {
  items: ItemRow[];
  loading: boolean;
  emptyText: string;
  drillBase: string;
}) {
  const grouped = useMemo(() => {
    const map = new Map<string, ItemRow[]>();
    for (const item of items) {
      const existing = map.get(item.category) ?? [];
      existing.push(item);
      map.set(item.category, existing);
    }
    return Array.from(map.entries()).sort(([a], [b]) => {
      const hasIssueA = (map.get(a) ?? []).some(i => i.status !== "current") ? 0 : 1;
      const hasIssueB = (map.get(b) ?? []).some(i => i.status !== "current") ? 0 : 1;
      return hasIssueA - hasIssueB;
    });
  }, [items]);

  if (loading) {
    return <div className="space-y-3">{[1, 2, 3].map(i => <Skeleton key={i} className="h-32 w-full" />)}</div>;
  }

  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-12 text-center">
        <CheckCircle2 size={32} className="mx-auto text-green-400 mb-2" />
        <p className="text-sm text-slate-500">{emptyText}</p>
      </div>
    );
  }

  const issueCount = items.filter(i => i.status !== "current").length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 text-xs">
        <span className="px-2.5 py-1 rounded-full bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300 font-medium">
          {items.length - issueCount} current
        </span>
        {items.filter(i => i.status === "lapsed" || i.status === "missing").length > 0 && (
          <span className="px-2.5 py-1 rounded-full bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300 font-medium">
            {items.filter(i => i.status === "lapsed" || i.status === "missing").length} lapsed / missing
          </span>
        )}
        {items.filter(i => i.status === "expiring").length > 0 && (
          <span className="px-2.5 py-1 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 font-medium">
            {items.filter(i => i.status === "expiring").length} expiring soon
          </span>
        )}
      </div>

      {grouped.map(([category, catItems]) => {
        const issuesHere = catItems.filter(i => i.status !== "current").length;
        return (
          <div key={category} className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 overflow-hidden">
            <div className="px-4 py-2.5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                {CATEGORY_LABELS[category] ?? category}
              </span>
              <div className="flex items-center gap-2">
                {issuesHere > 0 && (
                  <span className="text-[11px] px-2 py-0.5 rounded-full bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300 font-medium">
                    {issuesHere} issue{issuesHere !== 1 ? "s" : ""}
                  </span>
                )}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Link href={CATEGORY_LINKS[category] ?? drillBase}>
                      <Button variant="ghost" size="icon" className="h-6 w-6">
                        <ExternalLink size={12} className="text-slate-400" />
                      </Button>
                    </Link>
                  </TooltipTrigger>
                  <TooltipContent>Open {CATEGORY_LABELS[category] ?? category} module</TooltipContent>
                </Tooltip>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-100 dark:border-slate-800 text-left text-slate-400">
                    <th className="py-2 px-3 font-medium">Type</th>
                    <th className="py-2 px-3 font-medium">Status</th>
                    <th className="py-2 px-3 font-medium">Expires</th>
                  </tr>
                </thead>
                <tbody>
                  {catItems.map(item => {
                    const chip = itemStatusChip(item.status, item.expiresAt);
                    return (
                      <tr key={item.id} className="border-b border-slate-50 dark:border-slate-800/50 last:border-0 hover:bg-slate-50 dark:hover:bg-slate-800/30">
                        <td className="py-2 px-3 text-slate-600 dark:text-slate-300">
                          {SOURCE_TABLE_LABELS[item.sourceTable] ?? item.sourceTable}
                        </td>
                        <td className="py-2 px-3">
                          <span className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-bold ${chip.cls}`}>
                            {chip.label}
                          </span>
                        </td>
                        <td className="py-2 px-3 text-slate-500 font-mono">{toGBDate(item.expiresAt)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Reports tab ───────────────────────────────────────────────────────────────

function ReportsTab({ siteId, siteName }: { siteId: string; siteName: string }) {
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-6">
        <h2 className="text-base font-semibold text-slate-700 dark:text-slate-200 mb-1">Single Site Compliance Report</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
          Generate a comprehensive PDF for <strong>{siteName}</strong> covering all categories, open issues, and upcoming expiries.
        </p>
        <Link href={`/enterprise/reports?siteId=${siteId}`}>
          <Button className="gap-2">
            <ClipboardList size={15} />
            Generate Report for {siteName}
          </Button>
        </Link>
      </div>
      <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-6">
        <h2 className="text-base font-semibold text-slate-700 dark:text-slate-200 mb-1">All Enterprise Reports</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
          View, schedule, and export compliance reports across your entire estate.
        </p>
        <Link href="/enterprise/reports">
          <Button variant="outline" className="gap-2">
            <ExternalLink size={15} />
            Open Reports Centre
          </Button>
        </Link>
      </div>
    </div>
  );
}
