import { useMemo, useState, useEffect, useRef, useCallback } from "react";
import { MapContainer, TileLayer, CircleMarker, Tooltip as LeafletTooltip, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  AlertTriangle,
  ShieldCheck,
  Clock,
  Building2,
  CheckCircle2,
  FileText,
  RefreshCw,
  ExternalLink,
  TrendingUp,
  TrendingDown,
  Minus,
  Users,
  FileDown,
  CheckCheck,
  Zap,
  Maximize2,
  X,
  Search,
  ArrowUpDown,
  MapPin,
} from "lucide-react";

// ── Constants ──────────────────────────────────────────────────────────────────

const CATEGORY_LABELS: Record<string, string> = {
  insurance: "Insurance",
  rams: "RAMS",
  inductions: "Inductions",
  certificates: "Certificates",
  ppm: "PPM",
  fire: "Fire Risk",
  rtw: "Right to Work",
};

const CATEGORY_LINKS: Record<string, string> = {
  insurance: "/contractors",
  rams: "/contractors",
  inductions: "/contractors",
  certificates: "/compliance-certificates",
  ppm: "/ppm",
  fire: "/fire-risk-assessment",
  rtw: "/contractors",
};

const ORDERED_CATS = ["insurance", "rams", "inductions", "certificates", "ppm", "fire", "rtw"];

const SOURCE_TABLE_LABELS: Record<string, string> = {
  contractor_documents: "Contractor document",
  rams_documents: "RAMS document",
  contractor_workers: "Worker record",
  compliance_certificates: "Compliance cert",
  ppm_work_orders: "PPM work order",
  fire_risk_assessments: "Fire Risk Assessment",
};

// ── Types ──────────────────────────────────────────────────────────────────────

interface SummaryData {
  estateScore: number;
  categoryScores: Record<string, number>;
  siteCount: number;
  openCriticals: number;
  openWarnings: number;
  totalItems: number;
  expiringItems: number;
  siteScores: { siteId: string; siteName: string; score: number }[];
  generatedAt: string;
}

interface SiteRow {
  siteId: string;
  siteName: string;
  score: number;
  categoryScores: Record<string, number>;
  openCriticals: number;
  openWarnings: number;
}

interface AlertRow {
  id: string;
  siteId: string;
  siteName: string;
  category: string;
  severity: string;
  title: string;
  detail: Record<string, unknown>;
  status: string;
  createdAt: string;
  resolvedAt: string | null;
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
  severity: string;
}

interface GroupedExpiry {
  key: string;
  category: string;
  sourceTable: string;
  siteId: string;
  siteName: string;
  count: number;
  earliestExpiresAt: string | null;
  worstStatus: "lapsed" | "expiring";
}

interface TrendPoint {
  date: string;
  score: number;
}

interface TrendData {
  days: number;
  estateTrend: TrendPoint[];
  siteTrend: { siteId: string; siteName: string; date: string; score: number }[];
}

// ── Alert detail helpers ────────────────────────────────────────────────────────

function deriveAlertDetail(category: string, severity: string, detail: Record<string, unknown>): string {
  const n = (detail?.count as number) ?? 1;
  const pl = n === 1;
  const map: Record<string, Record<string, string>> = {
    insurance: {
      critical: pl ? "Insurance document has expired or is missing" : `${n} insurance documents have expired or are missing`,
      warning:  pl ? "Insurance document expires within 30 days" : `${n} insurance documents expire within 30 days`,
    },
    rams: {
      critical: pl ? "RAMS document has expired" : `${n} RAMS documents have expired`,
      warning:  pl ? "RAMS document expires within 30 days" : `${n} RAMS documents expire soon`,
    },
    inductions: {
      critical: pl ? "Worker on site has no valid site induction" : `${n} workers on site are missing valid inductions`,
      warning:  pl ? "Worker induction expires within 30 days" : `${n} worker inductions expire within 30 days`,
    },
    certificates: {
      critical: pl ? "Compliance certificate has expired" : `${n} compliance certificates have expired`,
      warning:  pl ? "Compliance certificate expires within 30 days" : `${n} compliance certificates expire soon`,
    },
    ppm: {
      critical: pl ? "PPM work order is overdue — planned maintenance not completed" : `${n} PPM work orders are overdue`,
      warning:  pl ? "PPM work order is due within 30 days" : `${n} PPM work orders are due within 30 days`,
    },
    fire: {
      critical: "Fire risk assessment has expired or is missing",
      warning:  "Fire risk assessment expires within 30 days",
    },
    rtw: {
      critical: pl ? "Right to Work document has expired or is missing" : `${n} Right to Work documents have expired or are missing`,
      warning:  pl ? "Right to Work document expires within 30 days" : `${n} Right to Work documents expire soon`,
    },
  };
  return map[category]?.[severity] ?? `${n} ${CATEGORY_LABELS[category] ?? category} item${n !== 1 ? "s" : ""} need attention`;
}

function alertStatusChip(category: string, severity: string): { label: string; bg: string; text: string } {
  if (severity === "critical" && category === "ppm") return { label: "OVERDUE", bg: "#fee2e2", text: "#b91c1c" };
  if (severity === "critical")                       return { label: "EXPIRED", bg: "#fee2e2", text: "#b91c1c" };
  return { label: "EXPIRING", bg: "#fef3c7", text: "#92400e" };
}

// ── Colour helpers ─────────────────────────────────────────────────────────────

function scoreColor(score: number | null | undefined): string {
  if (score == null) return "#94a3b8";
  if (score >= 80) return "#22a06b";
  if (score >= 50) return "#e8a000";
  return "#e84040";
}

function scoreBadgeClass(score: number | null | undefined): string {
  if (score == null) return "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300";
  if (score >= 80) return "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300";
  if (score >= 50) return "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300";
  return "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300";
}

function scoreLabel(score: number | null | undefined): string {
  if (score == null) return "No data";
  if (score >= 80) return "Good";
  if (score >= 50) return "Warning";
  return "Critical";
}

// ── Date helpers ───────────────────────────────────────────────────────────────

function toGBDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

function daysUntil(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const ms = new Date(iso).getTime() - Date.now();
  return Math.ceil(ms / 86_400_000);
}

// ── Estate Map ───────────────────────────────────────────────────────────────────

function mapPinColor(score: number): string {
  if (score >= 90) return "#16a34a";
  if (score >= 70) return "#d97706";
  if (score >= 50) return "#ea580c";
  return "#dc2626";
}

function scoreBand(score: number): "good" | "amber" | "warning" | "critical" {
  if (score >= 90) return "good";
  if (score >= 70) return "amber";
  if (score >= 50) return "warning";
  return "critical";
}

interface GeoSite {
  id: string;
  name: string;
  region: string | null;
  postcode: string | null;
  status: string;
  latitude: number | null;
  longitude: number | null;
  city: string | null;
  propertyType: string | null;
}

function FitBounds({ positions }: { positions: Array<[number, number]> }) {
  const map = useMap();
  useEffect(() => {
    if (positions.length > 0) {
      const lats = positions.map(p => p[0]);
      const lngs = positions.map(p => p[1]);
      map.fitBounds(
        [[Math.min(...lats), Math.min(...lngs)], [Math.max(...lats), Math.max(...lngs)]],
        { padding: [40, 40] },
      );
    }
  }, [map, positions.length]);
  return null;
}

// Forces Leaflet to recalculate tile layout after container dimensions settle
// (essential when the map is mounted inside a Dialog animation)
function MapResizer() {
  const map = useMap();
  useEffect(() => {
    const t1 = setTimeout(() => map.invalidateSize(), 50);
    const t2 = setTimeout(() => map.invalidateSize(), 250);
    const t3 = setTimeout(() => map.invalidateSize(), 600);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, [map]);
  return null;
}

const MAP_LEGEND = [
  { label: "≥ 90%", color: "#16a34a" },
  { label: "≥ 70%", color: "#d97706" },
  { label: "≥ 50%", color: "#ea580c" },
  { label: "< 50%",  color: "#dc2626" },
];

function MapCore({
  sitePins,
  noData,
  onPinClick,
  height,
  mapKey,
}: {
  sitePins: Array<{ siteId: string; siteLabelName: string; lat: number; lng: number; score: number }>;
  noData: boolean;
  onPinClick: (siteId: string) => void;
  height: number | string;
  mapKey?: string;
}) {
  const positions: Array<[number, number]> = sitePins.map(p => [p.lat, p.lng]);
  return (
    <div style={{ height, borderRadius: 10, overflow: "hidden", position: "relative", zIndex: 0 }}>
      <MapContainer key={mapKey} center={[54.5, -3.5] as [number, number]} zoom={5} style={{ height: "100%", width: "100%" }} scrollWheelZoom={true}>
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        />
        <MapResizer />
        {positions.length > 0 && <FitBounds positions={positions} />}
        {sitePins.map((pin) => (
          <CircleMarker
            key={pin.siteId}
            center={[pin.lat, pin.lng]}
            radius={14}
            pathOptions={{
              color: "#ffffff",
              fillColor: noData ? "#94a3b8" : mapPinColor(pin.score),
              fillOpacity: 0.95,
              weight: 2.5,
            }}
            eventHandlers={{ click: () => onPinClick(pin.siteId) }}
          >
            <LeafletTooltip>
              <span style={{ fontWeight: 600 }}>{pin.siteLabelName}</span>
              {!noData && <span style={{ marginLeft: 6, color: mapPinColor(pin.score) }}>{pin.score}%</span>}
            </LeafletTooltip>
          </CircleMarker>
        ))}
      </MapContainer>
    </div>
  );
}

function UKEstateMap({
  complianceSites,
  geoSites,
  noData,
  onPinClick,
  onFullscreen,
}: {
  complianceSites: SiteRow[];
  geoSites: GeoSite[];
  noData: boolean;
  onPinClick: (siteId: string) => void;
  onFullscreen: () => void;
}) {
  const { toast } = useToast();

  const geoMap = useMemo(() => {
    const m = new Map<string, GeoSite>();
    for (const s of geoSites) m.set(s.id, s);
    return m;
  }, [geoSites]);

  const sitePins = useMemo(() => {
    return complianceSites.flatMap((cs) => {
      const geo = geoMap.get(cs.siteId);
      if (!geo || geo.latitude == null || geo.longitude == null) return [];
      return [{ ...cs, siteLabelName: geo.name, lat: geo.latitude, lng: geo.longitude }];
    });
  }, [complianceSites, geoMap]);

  const unplotted = useMemo(() => {
    return geoSites.filter(s => s.latitude == null || s.longitude == null);
  }, [geoSites]);

  const replotMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/enterprise/sites/geocode-missing", {});
      if (!res.ok) throw new Error("Failed");
      return res.json() as Promise<{ updated: number; skipped: number }>;
    },
    onSuccess: (data: { updated: number; skipped: number }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/enterprise/sites"] });
      toast({ title: `Re-plotted ${data.updated} site${data.updated !== 1 ? "s" : ""}` });
    },
    onError: () => toast({ title: "Re-plot failed", variant: "destructive" }),
  });

  return (
    <div className="space-y-3 h-full flex flex-col">
      {sitePins.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 gap-3 text-center flex-1">
          <MapPin size={32} className="text-slate-300" />
          <p className="text-sm text-slate-400">Add a postcode to your sites to plot them on the estate map.</p>
          <Button size="sm" variant="outline" onClick={() => replotMutation.mutate()} disabled={replotMutation.isPending}>
            <RefreshCw size={12} className={`mr-1.5 ${replotMutation.isPending ? "animate-spin" : ""}`} />
            Re-plot estate
          </Button>
        </div>
      ) : (
        <>
          <MapCore sitePins={sitePins} noData={noData} onPinClick={onPinClick} height={420} />
          <div className="flex items-center justify-between flex-wrap gap-2 px-1">
            <div className="flex items-center gap-3 flex-wrap">
              {MAP_LEGEND.map((l) => (
                <span key={l.label} className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                  <span className="w-3 h-3 rounded-full inline-block flex-shrink-0 shadow-sm" style={{ background: l.color }} />
                  {l.label}
                </span>
              ))}
            </div>
            <div className="flex items-center gap-1.5">
              <Button size="sm" variant="ghost" className="text-xs gap-1 h-6 px-2 text-slate-500" onClick={() => replotMutation.mutate()} disabled={replotMutation.isPending}>
                <RefreshCw size={10} className={replotMutation.isPending ? "animate-spin" : ""} />
                Re-plot
              </Button>
              <Button size="sm" variant="ghost" className="text-xs gap-1 h-6 px-2 text-slate-500" onClick={onFullscreen}>
                <Maximize2 size={11} />
                Expand
              </Button>
            </div>
          </div>
        </>
      )}
      {unplotted.length > 0 && (
        <div className="text-[11px] text-slate-400 border-t border-slate-100 dark:border-slate-800 pt-2 space-y-0.5">
          <p className="font-medium text-slate-500 dark:text-slate-400 mb-1">Not yet plotted — add a postcode and re-plot:</p>
          {unplotted.slice(0, 4).map(s => (
            <p key={s.id}>· {s.name}{s.postcode ? ` (${s.postcode})` : " — no postcode"}</p>
          ))}
          {unplotted.length > 4 && <p className="text-slate-400">… and {unplotted.length - 4} more</p>}
        </div>
      )}
    </div>
  );
}

// ── Estate Map Fullscreen Dialog ──────────────────────────────────────────────

function EstateMapDialog({
  open,
  onClose,
  complianceSites,
  geoSites,
  noData,
  onPinClick,
}: {
  open: boolean;
  onClose: () => void;
  complianceSites: SiteRow[];
  geoSites: GeoSite[];
  noData: boolean;
  onPinClick: (siteId: string) => void;
}) {
  // Increment each time the dialog opens so MapContainer fully remounts
  // (Leaflet calculates tile layout at mount — it needs a fresh mount to
  // get correct dimensions after the dialog animation finishes)
  const openCount = useRef(0);
  useEffect(() => {
    if (open) openCount.current += 1;
  }, [open]);

  const geoMap = useMemo(() => {
    const m = new Map<string, GeoSite>();
    for (const s of geoSites) m.set(s.id, s);
    return m;
  }, [geoSites]);

  const sitePins = useMemo(() => {
    return complianceSites.flatMap((cs) => {
      const geo = geoMap.get(cs.siteId);
      if (!geo || geo.latitude == null || geo.longitude == null) return [];
      return [{ ...cs, siteLabelName: geo.name, lat: geo.latitude, lng: geo.longitude }];
    });
  }, [complianceSites, geoMap]);

  const handlePinClick = useCallback((siteId: string) => {
    onClose();
    onPinClick(siteId);
  }, [onClose, onPinClick]);

  // The map needs a concrete pixel height — use window height minus the header bar
  const mapHeight = typeof window !== "undefined" ? window.innerHeight - 70 : 700;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-[95vw] w-[95vw] p-0 overflow-hidden flex flex-col bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl border border-white/30 shadow-2xl" style={{ height: "92vh" }}>
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-200/60 dark:border-slate-700/60 bg-white/60 dark:bg-slate-800/60 backdrop-blur-sm flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-1.5 rounded-lg bg-blue-500/10">
              <MapPin size={16} className="text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <DialogTitle className="text-sm font-semibold text-slate-800 dark:text-slate-100">Estate Map</DialogTitle>
              <p className="text-xs text-slate-500 dark:text-slate-400">{sitePins.length} sites plotted — click a pin to open that site's detail</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-3 mr-2">
              {MAP_LEGEND.map((l) => (
                <span key={l.label} className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                  <span className="w-3 h-3 rounded-full inline-block flex-shrink-0 shadow-sm" style={{ background: l.color }} />
                  {l.label}
                </span>
              ))}
            </div>
            <Button size="sm" variant="ghost" className="h-7 w-7 p-0 rounded-full" onClick={onClose}>
              <X size={14} />
            </Button>
          </div>
        </div>
        {/* Give the map a concrete pixel height so Leaflet can calculate tile layout correctly */}
        <div style={{ flex: 1, overflow: "hidden", minHeight: 0 }}>
          {open && sitePins.length > 0 && (
            <MapCore
              sitePins={sitePins}
              noData={noData}
              onPinClick={handlePinClick}
              height={mapHeight}
              mapKey={`fullscreen-${openCount.current}`}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Site Scores Panel ─────────────────────────────────────────────────────────

type ScoreFilter = "all" | "good" | "amber" | "warning" | "critical";
type ScoreSort = "score-asc" | "score-desc" | "name-az";

const SCORE_FILTERS: { key: ScoreFilter; label: string; color: string }[] = [
  { key: "all",      label: "All",      color: "slate"  },
  { key: "good",     label: "≥ 90%",    color: "green"  },
  { key: "amber",    label: "70–89%",   color: "amber"  },
  { key: "warning",  label: "50–69%",   color: "orange" },
  { key: "critical", label: "< 50%",    color: "red"    },
];

function SiteScoresPanel({
  siteScores,
  noData,
  onSiteClick,
}: {
  siteScores: { siteId: string; siteName: string; score: number }[];
  noData: boolean;
  onSiteClick: (siteId: string) => void;
}) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<ScoreFilter>("all");
  const [sort, setSort] = useState<ScoreSort>("score-asc");

  const filtered = useMemo(() => {
    let list = [...siteScores];
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(s => s.siteName.toLowerCase().includes(q));
    }
    if (filter !== "all") {
      list = list.filter(s => scoreBand(s.score) === filter);
    }
    if (sort === "score-asc") list.sort((a, b) => a.score - b.score);
    else if (sort === "score-desc") list.sort((a, b) => b.score - a.score);
    else list.sort((a, b) => a.siteName.localeCompare(b.siteName));
    return list;
  }, [siteScores, search, filter, sort]);

  const counts = useMemo(() => {
    const c: Record<ScoreFilter, number> = { all: siteScores.length, good: 0, amber: 0, warning: 0, critical: 0 };
    for (const s of siteScores) c[scoreBand(s.score)]++;
    return c;
  }, [siteScores]);

  const cycleSortAscDesc = () => {
    setSort(s => s === "score-asc" ? "score-desc" : s === "score-desc" ? "name-az" : "score-asc");
  };

  const sortLabel = sort === "score-asc" ? "Score ↑" : sort === "score-desc" ? "Score ↓" : "A–Z";

  if (noData) {
    return (
      <div className="flex items-center justify-center h-full py-16 text-center">
        <p className="text-xs text-slate-400 italic">Run an evaluation to see per-site scores.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full gap-3">
      {/* Search + Sort row */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search sites…"
            className="pl-8 h-8 text-xs bg-white/70 dark:bg-slate-800/70 border-slate-200/80 dark:border-slate-700/60 backdrop-blur-sm"
          />
          {search && (
            <button onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
              <X size={12} />
            </button>
          )}
        </div>
        <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs bg-white/70 dark:bg-slate-800/70 border-slate-200/80 dark:border-slate-700/60" onClick={cycleSortAscDesc}>
          <ArrowUpDown size={11} />
          {sortLabel}
        </Button>
      </div>

      {/* Filter chips */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {SCORE_FILTERS.map(f => {
          const active = filter === f.key;
          const colorMap: Record<string, string> = {
            slate:  active ? "bg-slate-700 text-white border-slate-700 dark:bg-slate-500 dark:border-slate-500" : "text-slate-600 border-slate-200 dark:border-slate-700 dark:text-slate-400",
            green:  active ? "bg-green-600 text-white border-green-600" : "text-green-700 border-green-200 dark:border-green-800 dark:text-green-400",
            amber:  active ? "bg-amber-500 text-white border-amber-500" : "text-amber-700 border-amber-200 dark:border-amber-800 dark:text-amber-400",
            orange: active ? "bg-orange-500 text-white border-orange-500" : "text-orange-700 border-orange-200 dark:border-orange-800 dark:text-orange-400",
            red:    active ? "bg-red-600 text-white border-red-600" : "text-red-700 border-red-200 dark:border-red-800 dark:text-red-400",
          };
          return (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium border transition-all ${colorMap[f.color]} ${active ? "shadow-sm" : "bg-white/70 dark:bg-slate-800/50 hover:bg-white dark:hover:bg-slate-800"}`}
            >
              {f.label}
              <span className={`text-[10px] font-bold ${active ? "opacity-80" : "opacity-60"}`}>{counts[f.key]}</span>
            </button>
          );
        })}
      </div>

      {/* Site list */}
      <div className="flex-1 overflow-y-auto min-h-0 pr-0.5 space-y-1.5">
        {filtered.length === 0 ? (
          <div className="text-center py-8 text-xs text-slate-400">No sites match your search</div>
        ) : (
          filtered.map((ss) => {
            const band = scoreBand(ss.score);
            const barColor = mapPinColor(ss.score);
            const pct = ss.score;
            const textColor = band === "good" ? "text-green-600 dark:text-green-400" :
                              band === "amber" ? "text-amber-600 dark:text-amber-400" :
                              band === "warning" ? "text-orange-600 dark:text-orange-400" :
                              "text-red-600 dark:text-red-400";
            return (
              <button
                key={ss.siteId}
                onClick={() => onSiteClick(ss.siteId)}
                className="w-full flex items-center gap-3 rounded-xl p-3 bg-white/60 dark:bg-slate-800/50 border border-white/80 dark:border-slate-700/50 hover:bg-white/90 dark:hover:bg-slate-700/60 transition-all shadow-sm backdrop-blur-sm text-left group"
              >
                {/* Score bar indicator */}
                <div className="flex-shrink-0 w-1 h-8 rounded-full overflow-hidden bg-slate-100 dark:bg-slate-700">
                  <div className="w-full rounded-full transition-all" style={{ height: `${pct}%`, background: barColor, marginTop: `${100 - pct}%` }} />
                </div>
                <span className="flex-1 text-xs font-medium text-slate-700 dark:text-slate-300 truncate group-hover:text-slate-900 dark:group-hover:text-white">{ss.siteName}</span>
                <span className={`text-sm font-bold tabular-nums shrink-0 ${textColor}`}>{ss.score}%</span>
                <ExternalLink size={11} className="shrink-0 text-slate-300 dark:text-slate-600 group-hover:text-slate-400 dark:group-hover:text-slate-400 transition-colors" />
              </button>
            );
          })
        )}
      </div>

      <div className="text-[10px] text-slate-400 text-right pt-1">
        Showing {filtered.length} of {siteScores.length} sites
      </div>
    </div>
  );
}

function ExpiryChip({ expiresAt, status }: { expiresAt: string | null; status: string }) {
  const days = daysUntil(expiresAt);
  if (status === "lapsed" || (days !== null && days < 0)) {
    return (
      <span className="inline-flex items-center rounded px-1.5 py-0.5 text-xs font-semibold bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300">
        EXPIRED
      </span>
    );
  }
  if (days === 0) {
    return (
      <span className="inline-flex items-center rounded px-1.5 py-0.5 text-xs font-semibold bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300">
        TODAY
      </span>
    );
  }
  if (days !== null) {
    return (
      <span className="inline-flex items-center rounded px-1.5 py-0.5 text-xs font-semibold bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
        {days}d left
      </span>
    );
  }
  return null;
}

// ── Score Ring ─────────────────────────────────────────────────────────────────

function ScoreRing({
  score,
  noData,
  size = 152,
}: {
  score: number;
  noData: boolean;
  size?: number;
}) {
  const strokeW = 12;
  const r = (size - strokeW) / 2 - 2;
  const cx = size / 2;
  const cy = size / 2;
  const circ = 2 * Math.PI * r;
  const fill = noData ? 0 : Math.min(100, Math.max(0, score));
  const offset = circ * (1 - fill / 100);
  const color = noData ? "#94a3b8" : scoreColor(score);

  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#e2e8f0" strokeWidth={strokeW} />
        <circle
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={strokeW}
          strokeDasharray={circ}
          strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: "stroke-dashoffset 0.9s ease" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center select-none">
        {noData ? (
          <span className="text-sm text-slate-400 font-medium text-center leading-tight">No data<br />yet</span>
        ) : (
          <>
            <span className="text-4xl font-bold leading-none" style={{ color }}>
              {score}
            </span>
            <span className="text-xs text-slate-500 font-medium mt-0.5">/ 100</span>
          </>
        )}
      </div>
    </div>
  );
}

// ── Category bar ───────────────────────────────────────────────────────────────

function CategoryBar({ cat, score, noData }: { cat: string; score: number | undefined; noData: boolean }) {
  const label = CATEGORY_LABELS[cat] ?? cat;
  const link = CATEGORY_LINKS[cat] ?? "/";
  const pct = noData || score == null ? null : Math.round(score);
  const color = pct == null ? "#94a3b8" : scoreColor(pct);

  return (
    <Link href={link} className="group flex items-center gap-3 py-1.5 hover:opacity-80 transition-opacity cursor-pointer">
      <span className="w-24 text-sm text-slate-600 dark:text-slate-300 shrink-0">{label}</span>
      <div className="flex-1 bg-slate-100 dark:bg-slate-800 rounded-full h-2.5 overflow-hidden">
        {pct != null && (
          <div
            className="h-full rounded-full transition-all duration-700"
            style={{ width: `${pct}%`, backgroundColor: color }}
          />
        )}
      </div>
      <span className="w-10 text-right text-sm font-semibold shrink-0" style={{ color: pct == null ? "#94a3b8" : color }}>
        {pct == null ? "—" : `${pct}%`}
      </span>
      <ExternalLink className="w-3 h-3 text-slate-300 group-hover:text-slate-500 transition-colors shrink-0" />
    </Link>
  );
}

// ── Stat card ──────────────────────────────────────────────────────────────────

function StatCard({
  icon,
  label,
  value,
  color,
  loading,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  color: string;
  loading?: boolean;
}) {
  return (
    <Card>
      <CardContent className="pt-5 pb-4">
        <div className="flex items-start gap-3">
          <div className="rounded-lg p-2.5" style={{ backgroundColor: `${color}18` }}>
            <div style={{ color }}>{icon}</div>
          </div>
          <div className="min-w-0">
            {loading ? (
              <Skeleton className="h-8 w-16 mb-1" />
            ) : (
              <div className="text-3xl font-bold leading-none text-slate-800 dark:text-slate-100 tabular-nums">
                {value}
              </div>
            )}
            <div className="text-xs text-slate-500 mt-1 leading-tight">{label}</div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Alert row ──────────────────────────────────────────────────────────────────

function AlertFeedRow({
  alert,
  onAcknowledge,
  isPending,
}: {
  alert: AlertRow;
  onAcknowledge: (id: string) => void;
  isPending: boolean;
}) {
  const isCritical = alert.severity === "critical";
  const link = CATEGORY_LINKS[alert.category] ?? "/";
  const chip = alertStatusChip(alert.category, alert.severity);
  const detailText = deriveAlertDetail(alert.category, alert.severity, alert.detail);
  const severityAccent = isCritical ? "#e84040" : "#e8a000";

  return (
    <div className={`flex items-start gap-3 py-3 border-b border-slate-100 dark:border-slate-800 last:border-0 ${alert.status === "acknowledged" ? "opacity-60" : ""}`}>
      <div className="mt-0.5 shrink-0">
        <AlertTriangle className="w-4 h-4" style={{ color: severityAccent }} />
      </div>
      <div className="flex-1 min-w-0">
        {/* Row 1: chips + location */}
        <div className="flex flex-wrap items-center gap-1.5 mb-1">
          <span
            className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-bold tracking-wide"
            style={{ backgroundColor: chip.bg, color: chip.text }}
          >
            {chip.label}
          </span>
          <span
            className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold text-white"
            style={{ backgroundColor: severityAccent }}
          >
            {CATEGORY_LABELS[alert.category] ?? alert.category}
          </span>
          <span className="text-xs text-slate-500 dark:text-slate-400 font-medium truncate">
            {alert.siteName}
          </span>
        </div>
        {/* Row 2: plain-English detail */}
        <p className="text-sm text-slate-700 dark:text-slate-200 leading-snug">{detailText}</p>
      </div>
      <div className="flex items-center gap-1 shrink-0 ml-1">
        <Tooltip>
          <TooltipTrigger asChild>
            <Link href={link}>
              <Button variant="ghost" size="icon" className="h-7 w-7">
                <ExternalLink className="w-3.5 h-3.5 text-slate-400" />
              </Button>
            </Link>
          </TooltipTrigger>
          <TooltipContent>Open {CATEGORY_LABELS[alert.category] ?? alert.category} module</TooltipContent>
        </Tooltip>
        {alert.status === "open" && (
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs px-2 border-slate-200"
            onClick={() => onAcknowledge(alert.id)}
            disabled={isPending}
          >
            <CheckCheck className="w-3 h-3 mr-1" />
            Ack
          </Button>
        )}
        {alert.status === "acknowledged" && (
          <span className="text-[11px] text-slate-400 italic whitespace-nowrap">Ack'd</span>
        )}
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function EnterpriseCompliance() {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [evaluating, setEvaluating] = useState(false);
  const [mapOpen, setMapOpen] = useState(false);

  const STALE = 60_000; // 60 s — matches server cache TTL

  const { data: summary, isLoading: summaryLoading, isError: summaryError, error: summaryErrorObj, refetch: refetchSummary } = useQuery<SummaryData>({
    queryKey: ["/api/enterprise/compliance/summary"],
    staleTime: STALE,
    refetchOnWindowFocus: true,
  });

  const { data: sites, isLoading: sitesLoading } = useQuery<SiteRow[]>({
    queryKey: ["/api/enterprise/compliance/sites"],
    staleTime: STALE,
    refetchOnWindowFocus: true,
  });

  const { data: alerts, isLoading: alertsLoading } = useQuery<AlertRow[]>({
    queryKey: ["/api/enterprise/compliance/alerts"],
    staleTime: STALE,
    refetchOnWindowFocus: true,
  });

  const { data: expiries, isLoading: expiriesLoading } = useQuery<ExpiryRow[]>({
    queryKey: ["/api/enterprise/compliance/expiries", { days: 30 }],
    queryFn: async () => {
      const r = await fetch("/api/enterprise/compliance/expiries?days=30", { credentials: "include" });
      if (!r.ok) throw new Error("Failed to load expiries");
      return r.json();
    },
    staleTime: STALE,
    refetchOnWindowFocus: true,
  });

  const { data: trend, isError: trendError } = useQuery<TrendData>({
    queryKey: ["/api/enterprise/compliance/trend", { days: 30 }],
    queryFn: async () => {
      const r = await fetch("/api/enterprise/compliance/trend?days=30", { credentials: "include" });
      if (!r.ok) throw new Error("Failed to load trend");
      return r.json();
    },
    staleTime: STALE,
    refetchOnWindowFocus: true,
  });

  const { data: contractors, isError: contractorsError } = useQuery<unknown[]>({
    queryKey: ["/api/contractors"],
    staleTime: 120_000,
  });

  const { data: poolHealth } = useQuery<{
    total: number;
    compliant: number;
    needsAttention: number;
    pendingCompanies: number;
    totalMissingDocs: number;
  }>({
    queryKey: ["/api/enterprise/compliance/contractor-pool-health"],
    staleTime: STALE,
    refetchOnWindowFocus: true,
  });

  const { data: geoSites = [] } = useQuery<GeoSite[]>({
    queryKey: ["/api/enterprise/sites"],
    staleTime: 5 * 60_000,
  });

  // Auto-geocode any unplotted sites on first load (enterprise_admin only).
  // Non-admins get a 403 which is swallowed silently — no error toast on load.
  const autoPlottedRef = useRef(false);
  useEffect(() => {
    if (autoPlottedRef.current) return;
    if (geoSites.length === 0) return;
    const unplotted = geoSites.filter(
      s => s.postcode && (s.latitude == null || s.longitude == null)
    );
    if (unplotted.length === 0) return;
    autoPlottedRef.current = true;
    apiRequest("POST", "/api/enterprise/sites/geocode-missing", {})
      .then(r => r.json())
      .then((data: { updated: number }) => {
        if (data.updated > 0) {
          queryClient.invalidateQueries({ queryKey: ["/api/enterprise/sites"] });
        }
      })
      .catch(() => {});
  }, [geoSites]);

  // ── Derived values ───────────────────────────────────────────────────────────

  const noData = !summaryLoading && (summary?.siteCount === 0);

  const estateScore = summary?.estateScore ?? 0;

  const trendDelta = useMemo<number | null>(() => {
    const pts = trend?.estateTrend ?? [];
    if (pts.length < 2) return null;
    return pts[pts.length - 1].score - pts[0].score;
  }, [trend]);

  const sitesFullyCompliant = useMemo(
    () => (summary?.siteScores ?? []).filter((s) => s.score >= 95).length,
    [summary],
  );

  const activeContractors: string | number = contractorsError
    ? "—"
    : Array.isArray(contractors)
    ? contractors.length
    : 0;

  const openAlerts = useMemo(
    () => (alerts ?? []).filter((a) => a.status === "open" || a.status === "acknowledged"),
    [alerts],
  );

  const groupedExpiries = useMemo<GroupedExpiry[]>(() => {
    if (!expiries) return [];
    const map = new Map<string, GroupedExpiry>();
    for (const row of expiries) {
      const key = `${row.category}:${row.siteId}:${row.sourceTable}`;
      const existing = map.get(key);
      const isWorse = (s: string) => s === "lapsed";
      if (existing) {
        existing.count++;
        if (row.expiresAt && (!existing.earliestExpiresAt || row.expiresAt < existing.earliestExpiresAt)) {
          existing.earliestExpiresAt = row.expiresAt;
        }
        if (isWorse(row.status) && !isWorse(existing.worstStatus)) {
          existing.worstStatus = "lapsed";
        }
      } else {
        map.set(key, {
          key,
          category: row.category,
          sourceTable: row.sourceTable,
          siteId: row.siteId,
          siteName: row.siteName,
          count: 1,
          earliestExpiresAt: row.expiresAt,
          worstStatus: (row.status === "lapsed" ? "lapsed" : "expiring") as "lapsed" | "expiring",
        });
      }
    }
    // Sort: lapsed first, then by earliest expiry date
    return Array.from(map.values()).sort((a, b) => {
      if (a.worstStatus !== b.worstStatus) return a.worstStatus === "lapsed" ? -1 : 1;
      if (!a.earliestExpiresAt) return 1;
      if (!b.earliestExpiresAt) return -1;
      return a.earliestExpiresAt < b.earliestExpiresAt ? -1 : 1;
    });
  }, [expiries]);

  // ── Acknowledge mutation ─────────────────────────────────────────────────────

  const ackMutation = useMutation({
    mutationFn: async (alertId: string) => {
      const res = await apiRequest("POST", `/api/enterprise/compliance/alerts/${alertId}/acknowledge`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/enterprise/compliance/alerts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/enterprise/compliance/summary"] });
    },
    onError: (e: Error) => {
      toast({ title: "Failed to acknowledge", description: e.message, variant: "destructive" });
    },
  });

  // ── Manual evaluation ────────────────────────────────────────────────────────

  async function runEvaluation() {
    setEvaluating(true);
    try {
      const res = await apiRequest("POST", "/api/enterprise/compliance/evaluate");
      if (!res.ok) throw new Error("Evaluation failed");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["/api/enterprise/compliance/summary"] }),
        queryClient.invalidateQueries({ queryKey: ["/api/enterprise/compliance/sites"] }),
        queryClient.invalidateQueries({ queryKey: ["/api/enterprise/compliance/alerts"] }),
      ]);
      toast({ title: "Evaluation complete", description: "Compliance scores have been recalculated." });
    } catch {
      toast({ title: "Evaluation failed", description: "Could not run compliance evaluation.", variant: "destructive" });
    } finally {
      setEvaluating(false);
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  if (summaryError) {
    const is403 = (summaryErrorObj as any)?.status === 403;
    return (
      <div className="p-6 flex items-center justify-center min-h-64">
        <Card className="p-8 max-w-sm text-center space-y-3">
          <div className="w-12 h-12 rounded-xl bg-amber-50 dark:bg-amber-900/20 flex items-center justify-center mx-auto">
            <ShieldCheck size={24} className="text-amber-400" />
          </div>
          <h2 className="font-semibold">{is403 ? "Access restricted" : "Couldn't load compliance data"}</h2>
          <p className="text-sm text-muted-foreground">
            {is403
              ? "You don't have enterprise access for this customer. Ask an Enterprise Admin to grant you a role."
              : "The request failed — please try again or contact your administrator."}
          </p>
          {!is403 && (
            <Button variant="outline" size="sm" onClick={() => refetchSummary()}>Try again</Button>
          )}
        </Card>
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className="p-6 max-w-7xl mx-auto space-y-6">

        {/* ── Header ── */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">
              Estate Compliance Overview
            </h1>
            {summary?.generatedAt && (
              <p className="text-xs text-slate-400 mt-0.5">
                Updated {toGBDate(summary.generatedAt)} at{" "}
                {new Date(summary.generatedAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    refetchSummary();
                    queryClient.invalidateQueries({ queryKey: ["/api/enterprise/compliance"] });
                  }}
                >
                  <RefreshCw className="w-4 h-4 mr-1.5" />
                  Refresh
                </Button>
              </TooltipTrigger>
              <TooltipContent>Reload from server (60 s cache)</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={runEvaluation}
                  disabled={evaluating}
                >
                  <Zap className="w-4 h-4 mr-1.5" />
                  {evaluating ? "Evaluating…" : "Re-evaluate"}
                </Button>
              </TooltipTrigger>
              <TooltipContent>Recalculate all compliance scores now</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline" size="sm" disabled>
                  <FileDown className="w-4 h-4 mr-1.5" />
                  PDF Report
                </Button>
              </TooltipTrigger>
              <TooltipContent>PDF reports available in Phase 5</TooltipContent>
            </Tooltip>
          </div>
        </div>

        {/* ── Row 1: Score ring + Category bars ── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

          {/* Score ring */}
          <Card className="lg:col-span-1">
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-semibold text-slate-700 dark:text-slate-200">
                Overall Compliance Score
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col items-center gap-4 pt-0 pb-6">
              {summaryLoading ? (
                <Skeleton className="w-36 h-36 rounded-full" />
              ) : (
                <ScoreRing score={estateScore} noData={noData} size={152} />
              )}

              {/* Status badge */}
              {!summaryLoading && (
                <span className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-semibold ${scoreBadgeClass(noData ? null : estateScore)}`}>
                  {noData ? "No data yet" : scoreLabel(estateScore)}
                </span>
              )}

              {/* Trend delta */}
              {trendError ? (
                <p className="text-xs text-amber-500 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" />
                  Trend data unavailable
                </p>
              ) : trendDelta !== null && !noData ? (
                <div className="flex items-center gap-1 text-sm">
                  {trendDelta > 0 ? (
                    <TrendingUp className="w-4 h-4 text-green-500" />
                  ) : trendDelta < 0 ? (
                    <TrendingDown className="w-4 h-4 text-red-500" />
                  ) : (
                    <Minus className="w-4 h-4 text-slate-400" />
                  )}
                  <span
                    className={`font-semibold ${trendDelta > 0 ? "text-green-600" : trendDelta < 0 ? "text-red-500" : "text-slate-400"}`}
                  >
                    {trendDelta > 0 ? "+" : ""}
                    {trendDelta} pts
                  </span>
                  <span className="text-slate-400">vs 30 days ago</span>
                </div>
              ) : null}

              {noData && (
                <p className="text-xs text-slate-400 text-center max-w-[180px]">
                  Run an evaluation to generate your first compliance scores.
                </p>
              )}
            </CardContent>
          </Card>

          {/* Category bars */}
          <Card className="lg:col-span-2">
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-semibold text-slate-700 dark:text-slate-200">
                Compliance by Category
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              {summaryLoading ? (
                <div className="space-y-3">
                  {ORDERED_CATS.map((c) => <Skeleton key={c} className="h-6 w-full" />)}
                </div>
              ) : (
                <div className="divide-y divide-slate-50 dark:divide-slate-800/50">
                  {ORDERED_CATS.map((cat) => (
                    <CategoryBar
                      key={cat}
                      cat={cat}
                      score={summary?.categoryScores?.[cat]}
                      noData={noData}
                    />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* ── Contractor Pool Health ── */}
        {poolHealth && poolHealth.total > 0 && (
          <div className={`rounded-xl border px-5 py-4 flex flex-col sm:flex-row sm:items-center gap-4 ${
            poolHealth.needsAttention > 0
              ? "bg-amber-50 border-amber-200 dark:bg-amber-900/20 dark:border-amber-700/40"
              : "bg-emerald-50 border-emerald-200 dark:bg-emerald-900/20 dark:border-emerald-700/40"
          }`}>
            <div className="flex items-center gap-3 flex-1">
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${
                poolHealth.needsAttention > 0
                  ? "bg-amber-100 dark:bg-amber-800/40"
                  : "bg-emerald-100 dark:bg-emerald-800/40"
              }`}>
                <Users className={`w-5 h-5 ${poolHealth.needsAttention > 0 ? "text-amber-600" : "text-emerald-600"}`} />
              </div>
              <div>
                <p className={`text-sm font-semibold ${poolHealth.needsAttention > 0 ? "text-amber-800 dark:text-amber-300" : "text-emerald-800 dark:text-emerald-300"}`}>
                  Contractor Pool Health
                </p>
                {poolHealth.needsAttention > 0 ? (
                  <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">
                    {poolHealth.needsAttention} of {poolHealth.total} {poolHealth.needsAttention === 1 ? "company needs" : "companies need"} attention
                    {poolHealth.totalMissingDocs > 0 && ` — ${poolHealth.totalMissingDocs} key document${poolHealth.totalMissingDocs === 1 ? "" : "s"} missing`}
                    {poolHealth.pendingCompanies > 0 && ` (${poolHealth.pendingCompanies} not yet approved)`}
                  </p>
                ) : (
                  <p className="text-xs text-emerald-700 dark:text-emerald-400 mt-0.5">
                    All {poolHealth.total} {poolHealth.total === 1 ? "company" : "companies"} approved and compliant
                  </p>
                )}
                <p className="text-[11px] text-muted-foreground mt-1">
                  The compliance score above only counts documents linked to sites. Pending contractors are tracked here separately.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <div className="flex gap-4 text-center">
                <div>
                  <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400">{poolHealth.compliant}</p>
                  <p className="text-[11px] text-muted-foreground">Compliant</p>
                </div>
                <div>
                  <p className={`text-lg font-bold ${poolHealth.needsAttention > 0 ? "text-amber-600 dark:text-amber-400" : "text-slate-400"}`}>{poolHealth.needsAttention}</p>
                  <p className="text-[11px] text-muted-foreground">Attention</p>
                </div>
              </div>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Link href="/enterprise/contractor-pool">
                    <Button size="sm" variant="outline" className={`shrink-0 ${poolHealth.needsAttention > 0 ? "border-amber-300 text-amber-700 hover:bg-amber-100 dark:border-amber-600 dark:text-amber-300 dark:hover:bg-amber-800/30" : ""}`}>
                      <ExternalLink className="w-3.5 h-3.5 mr-1.5" />
                      View Pool
                    </Button>
                  </Link>
                </TooltipTrigger>
                <TooltipContent>Open the Contractor Pool to review pending companies</TooltipContent>
              </Tooltip>
            </div>
          </div>
        )}

        {/* ── Estate Map + Site Scores ── */}
        <EstateMapDialog
          open={mapOpen}
          onClose={() => setMapOpen(false)}
          complianceSites={sites ?? []}
          geoSites={geoSites}
          noData={noData}
          onPinClick={(siteId) => navigate(`/enterprise/sites/${siteId}`)}
        />

        <div className="grid grid-cols-1 xl:grid-cols-5 gap-5 items-start">
          {/* Map card — takes 2/5 of the row */}
          <div className="xl:col-span-2 rounded-2xl overflow-hidden border border-white/40 dark:border-slate-700/50 shadow-xl bg-white/70 dark:bg-slate-900/60 backdrop-blur-md">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-200/60 dark:border-slate-700/50">
              <div className="flex items-center gap-2.5">
                <div className="p-1.5 rounded-lg bg-blue-500/10">
                  <MapPin size={15} className="text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Estate Map</h3>
                    {noData && <Badge variant="secondary" className="text-xs">No data</Badge>}
                  </div>
                  <p className="text-[11px] text-slate-400 dark:text-slate-500">Click a pin to open that site's detail</p>
                </div>
              </div>
              <TooltipProvider delayDuration={400}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button size="sm" variant="ghost" className="h-8 w-8 p-0 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100/80 dark:hover:bg-slate-700/60" onClick={() => setMapOpen(true)}>
                      <Maximize2 size={15} />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="left">Open full-page map</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <div className="p-4">
              <UKEstateMap
                complianceSites={sites ?? []}
                geoSites={geoSites}
                noData={noData}
                onPinClick={(siteId) => navigate(`/enterprise/sites/${siteId}`)}
                onFullscreen={() => setMapOpen(true)}
              />
            </div>
          </div>

          {/* Site scores panel — takes 3/5 of the row */}
          <div className="xl:col-span-3 rounded-2xl border border-white/40 dark:border-slate-700/50 shadow-xl bg-white/70 dark:bg-slate-900/60 backdrop-blur-md overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-200/60 dark:border-slate-700/50">
              <div className="flex items-center gap-2.5">
                <div className="p-1.5 rounded-lg bg-indigo-500/10">
                  <Building2 size={15} className="text-indigo-600 dark:text-indigo-400" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Site Scores</h3>
                  <p className="text-[11px] text-slate-400 dark:text-slate-500">{summary?.siteScores?.length ?? 0} sites across your estate</p>
                </div>
              </div>
            </div>
            <div className="p-4 h-[540px] flex flex-col">
              <SiteScoresPanel
                siteScores={summary?.siteScores ?? []}
                noData={noData}
                onSiteClick={(siteId) => navigate(`/enterprise/sites/${siteId}`)}
              />
            </div>
          </div>
        </div>

        {/* ── Row 2: Stat cards ── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            icon={<AlertTriangle className="w-5 h-5" />}
            label="Critical issues open"
            value={summaryLoading ? "—" : (summary?.openCriticals ?? 0)}
            color="#e84040"
            loading={summaryLoading}
          />
          <StatCard
            icon={<Clock className="w-5 h-5" />}
            label="Expiring in 30 days"
            value={summaryLoading ? "—" : (summary?.expiringItems ?? 0)}
            color="#e8a000"
            loading={summaryLoading}
          />
          <StatCard
            icon={<CheckCircle2 className="w-5 h-5" />}
            label={`Sites scoring ≥ 95 (of ${summary?.siteCount ?? 0})`}
            value={summaryLoading ? "—" : sitesFullyCompliant}
            color="#22a06b"
            loading={summaryLoading}
          />
          <StatCard
            icon={<Users className="w-5 h-5" />}
            label="Contractor companies"
            value={activeContractors}
            color="#2460A9"
          />
        </div>

        {/* ── Row 3: Alerts feed + Expiries ── */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">

          {/* Critical alerts feed */}
          <Card className="lg:col-span-3">
            <CardHeader className="pb-2 flex flex-row items-center justify-between">
              <CardTitle className="text-base font-semibold text-slate-700 dark:text-slate-200">
                Critical Issues & Warnings
              </CardTitle>
              {!alertsLoading && openAlerts.length > 0 && (
                <Badge variant="outline" className="text-xs">
                  {openAlerts.filter((a) => a.status === "open").length} open
                </Badge>
              )}
            </CardHeader>
            <CardContent className="pt-0">
              {alertsLoading ? (
                <div className="space-y-3">
                  {[1, 2, 3].map((i) => <Skeleton key={i} className="h-14 w-full" />)}
                </div>
              ) : openAlerts.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-10 text-slate-400">
                  <ShieldCheck className="w-10 h-10 text-green-400" />
                  <p className="text-sm font-medium text-green-600 dark:text-green-400">No open issues</p>
                  <p className="text-xs text-center">All sites are within acceptable compliance thresholds.</p>
                </div>
              ) : (
                <div className="max-h-96 overflow-y-auto -mx-2 px-2">
                  {openAlerts.map((alert) => (
                    <AlertFeedRow
                      key={alert.id}
                      alert={alert}
                      onAcknowledge={(id) => ackMutation.mutate(id)}
                      isPending={ackMutation.isPending}
                    />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Upcoming expiries — grouped */}
          <Card className="lg:col-span-2">
            <CardHeader className="pb-2 flex flex-row items-center justify-between">
              <CardTitle className="text-base font-semibold text-slate-700 dark:text-slate-200">
                Upcoming Expiries
                <span className="ml-1.5 text-xs font-normal text-slate-400">(next 30 days)</span>
              </CardTitle>
              {!expiriesLoading && groupedExpiries.length > 0 && (
                <Badge variant="outline" className="text-xs shrink-0">
                  {groupedExpiries.length} type{groupedExpiries.length !== 1 ? "s" : ""}
                </Badge>
              )}
            </CardHeader>
            <CardContent className="pt-0">
              {expiriesLoading ? (
                <div className="space-y-2">
                  {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
                </div>
              ) : groupedExpiries.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-10 text-slate-400">
                  <CheckCircle2 className="w-8 h-8 text-green-400" />
                  <p className="text-sm text-green-600 dark:text-green-400">Nothing expiring</p>
                </div>
              ) : (
                <div className="max-h-96 overflow-y-auto -mx-2 px-2">
                  {groupedExpiries.slice(0, 20).map((grp) => {
                    const days = daysUntil(grp.earliestExpiresAt);
                    const isExpired = grp.worstStatus === "lapsed" || (days !== null && days < 0);
                    const typeLabel = SOURCE_TABLE_LABELS[grp.sourceTable] ?? grp.sourceTable;
                    const catLabel = CATEGORY_LABELS[grp.category] ?? grp.category;
                    const drillLink = CATEGORY_LINKS[grp.category] ?? "/";

                    return (
                      <Link
                        key={grp.key}
                        href={drillLink}
                        className="flex items-start justify-between gap-2 py-2.5 border-b border-slate-100 dark:border-slate-800 last:border-0 hover:bg-slate-50 dark:hover:bg-slate-800/50 -mx-2 px-2 rounded transition-colors group"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                              {catLabel}
                            </p>
                            {grp.count > 1 && (
                              <span className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                                ×{grp.count}
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-slate-400 truncate mt-0.5">
                            {typeLabel} · {grp.siteName}
                          </p>
                        </div>
                        <div className="flex flex-col items-end gap-1 shrink-0">
                          <span className="text-[11px] text-slate-500">{toGBDate(grp.earliestExpiresAt)}</span>
                          {isExpired ? (
                            <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-bold bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300">
                              EXPIRED
                            </span>
                          ) : days !== null ? (
                            <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-bold ${
                              days <= 7
                                ? "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300"
                                : "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300"
                            }`}>
                              {days === 0 ? "TODAY" : `${days}d`}
                            </span>
                          ) : null}
                        </div>
                      </Link>
                    );
                  })}
                  {groupedExpiries.length > 20 && (
                    <p className="text-xs text-slate-400 text-center py-2">
                      +{groupedExpiries.length - 20} more group{groupedExpiries.length - 20 !== 1 ? "s" : ""}
                    </p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* ── Row 4: Site-by-site table ── */}
        <Card>
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-base font-semibold text-slate-700 dark:text-slate-200">
              Site-by-Site Compliance Breakdown
            </CardTitle>
            <span className="text-xs text-slate-400">Worst performing first</span>
          </CardHeader>
          <CardContent className="pt-0">
            {sitesLoading ? (
              <div className="space-y-2">
                {[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
              </div>
            ) : !sites || sites.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-10 text-slate-400">
                <Building2 className="w-8 h-8" />
                <p className="text-sm">No site data yet. Run an evaluation first.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-700">
                      <th className="text-left font-medium text-slate-500 py-2 pr-4 text-xs">Site</th>
                      <th className="text-center font-medium text-slate-500 py-2 px-2 text-xs w-20">Score</th>
                      {ORDERED_CATS.map((cat) => (
                        <th key={cat} className="text-center font-medium text-slate-500 py-2 px-1 text-xs">
                          <Tooltip>
                            <TooltipTrigger className="cursor-default">
                              {cat === "insurance" ? "Ins" : cat === "inductions" ? "Ind" : cat === "certificates" ? "Cert" : cat === "rtw" ? "RTW" : CATEGORY_LABELS[cat]}
                            </TooltipTrigger>
                            <TooltipContent>{CATEGORY_LABELS[cat]}</TooltipContent>
                          </Tooltip>
                        </th>
                      ))}
                      <th className="text-center font-medium text-slate-500 py-2 px-2 text-xs">Issues</th>
                      <th className="py-2 px-2 w-8" />
                    </tr>
                  </thead>
                  <tbody>
                    {sites.map((site) => {
                      const sScore = noData ? null : site.score;
                      return (
                        <tr
                          key={site.siteId}
                          className="border-b border-slate-100 dark:border-slate-800 last:border-0 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
                        >
                          <td className="py-2.5 pr-4">
                            <span className="font-medium text-slate-700 dark:text-slate-200 truncate max-w-[180px] block">
                              {site.siteName}
                            </span>
                          </td>
                          <td className="py-2.5 px-2 text-center">
                            <span
                              className={`inline-flex items-center justify-center rounded-full px-2.5 py-0.5 text-xs font-bold ${scoreBadgeClass(sScore)}`}
                            >
                              {sScore == null ? "—" : sScore}
                            </span>
                          </td>
                          {ORDERED_CATS.map((cat) => {
                            const cs = noData ? null : site.categoryScores?.[cat];
                            return (
                              <td key={cat} className="py-2.5 px-1 text-center">
                                <Tooltip>
                                  <TooltipTrigger>
                                    <span
                                      className="inline-block w-2.5 h-2.5 rounded-full"
                                      style={{ backgroundColor: cs == null ? "#cbd5e1" : scoreColor(cs) }}
                                    />
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    {CATEGORY_LABELS[cat]}: {cs == null ? "No data" : `${Math.round(cs)}%`}
                                  </TooltipContent>
                                </Tooltip>
                              </td>
                            );
                          })}
                          <td className="py-2.5 px-2 text-center">
                            <div className="flex items-center justify-center gap-1">
                              {site.score >= 80 ? (
                                <CheckCircle2 className="w-3.5 h-3.5 text-green-400" />
                              ) : (
                                <>
                                  {site.openCriticals > 0 && (
                                    <span className="inline-flex items-center rounded px-1 py-0.5 text-xs font-semibold bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300">
                                      {site.openCriticals}
                                    </span>
                                  )}
                                  {site.openWarnings > 0 && (
                                    <span className="inline-flex items-center rounded px-1 py-0.5 text-xs font-semibold bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                                      {site.openWarnings}
                                    </span>
                                  )}
                                  {site.openCriticals === 0 && site.openWarnings === 0 && (
                                    <CheckCircle2 className="w-3.5 h-3.5 text-green-400" />
                                  )}
                                </>
                              )}
                            </div>
                          </td>
                          <td className="py-2.5 px-2">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Link href={`/enterprise/sites/${site.siteId}`}>
                                  <Button variant="ghost" size="icon" className="h-7 w-7">
                                    <ExternalLink className="w-3.5 h-3.5 text-slate-400" />
                                  </Button>
                                </Link>
                              </TooltipTrigger>
                              <TooltipContent>View {site.siteName}</TooltipContent>
                            </Tooltip>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── Footer note ── */}
        <p className="text-xs text-slate-400 text-center pb-2">
          Scores are calculated nightly at 03:00 and on compliance events.
          Use <strong>Re-evaluate</strong> to recalculate now.
          Category scores are weighted means; a −2 penalty per open critical alert applies (floor 0).
        </p>
      </div>
    </TooltipProvider>
  );
}
