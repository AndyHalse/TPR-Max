import { useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import {
  AlertTriangle,
  Users,
  CheckCircle,
  XCircle,
  Shield,
  RefreshCw,
  Activity,
  Clock,
  Eye,
  MapPin,
  Wifi,
  WifiOff,
} from "lucide-react";
import { format } from "date-fns";

interface PersonnelItem {
  id: string;
  name: string;
  type: "staff" | "visitor" | "contractor" | "member";
  department?: string;
  company?: string;
  location: string;
  zoneName?: string | null;
  zoneColor?: string | null;
  checkInTime?: string | null;
  accounted: boolean;
  needsEvacuationAssistance?: boolean;
}

interface ZoneStat {
  id: string;
  name: string;
  color: string;
  total: number;
  accounted: number;
  swept: boolean;
  sweptAt?: string | null;
  sweptByName?: string | null;
  sweptWithUnaccounted?: boolean;
}

interface MusterResponse {
  active: boolean;
  message?: string;
  evacuationId?: string;
  customerId?: string;
  companyName?: string;
  status?: string;
  startedAt?: string;
  isDrill?: boolean;
  totalPersonnel?: number;
  accountedFor?: number;
  personnel?: PersonnelItem[];
  zones?: ZoneStat[];
}

interface ContextResponse {
  valid: boolean;
  customerId?: string;
  companyName?: string;
  accentColor?: string;
  activeEvacuation?: {
    evacuationId: string;
    startedAt: string;
    isDrill: boolean;
  } | null;
}

interface IncidentManagerMonitorProps {
  urlId: string;
}

export default function IncidentManagerMonitor({ urlId }: IncidentManagerMonitorProps) {
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [startTime, setStartTime] = useState<Date | null>(null);
  const [wsConnected, setWsConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const refetchRef = useRef<(() => void) | null>(null);

  const {
    data: context,
    isLoading: contextLoading,
    isError: contextError,
  } = useQuery<ContextResponse>({
    queryKey: ["/api/incident-monitor", urlId],
    queryFn: async () => {
      const res = await fetch(`/api/incident-monitor/${urlId}`, {
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Invalid monitor link");
      }
      return res.json();
    },
    retry: false,
    refetchInterval: false,
  });

  const {
    data: musterData,
    isLoading: musterLoading,
    refetch,
  } = useQuery<MusterResponse>({
    queryKey: ["/api/incident-monitor", urlId, "muster"],
    queryFn: async () => {
      const res = await fetch(`/api/incident-monitor/${urlId}/muster`, {
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to fetch muster data");
      }
      return res.json();
    },
    enabled: !!context?.valid,
    staleTime: 10 * 1000,
    refetchInterval: 10000,
    retry: 2,
  });

  useEffect(() => {
    refetchRef.current = refetch;
  }, [refetch]);

  useEffect(() => {
    if (musterData?.startedAt) {
      setStartTime(new Date(musterData.startedAt));
    }
  }, [musterData?.startedAt]);

  useEffect(() => {
    if (!startTime || !musterData?.active) return;
    const interval = setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - startTime.getTime()) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [startTime, musterData?.active]);

  // WebSocket for live updates with connection state tracking
  useEffect(() => {
    if (!context?.valid || !musterData?.active || !musterData.evacuationId || !context.customerId) return;

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws/muster`);

    ws.onopen = () => {
      setWsConnected(true);
      ws.send(
        JSON.stringify({
          type: "register",
          customerId: context.customerId,
          evacuationId: musterData.evacuationId,
        })
      );
    };

    ws.onmessage = () => {
      refetchRef.current?.();
    };

    ws.onerror = () => {
      setWsConnected(false);
    };

    ws.onclose = () => {
      setWsConnected(false);
    };

    wsRef.current = ws;

    return () => {
      ws.close();
      setWsConnected(false);
    };
  }, [context?.valid, context?.customerId, musterData?.active, musterData?.evacuationId]);

  const formatElapsed = (secs: number) => {
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    if (h > 0) return `${h}h ${m}m ${s}s`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
  };

  const formatCheckInTime = (t: string | null | undefined) => {
    if (!t) return null;
    try {
      return format(new Date(t), "HH:mm");
    } catch {
      return null;
    }
  };

  const accentColor =
    context?.accentColor && /^#[0-9a-fA-F]{3,6}$/.test(context.accentColor)
      ? context.accentColor
      : "#2460a9";

  // --- Loading / Error states ---
  if (contextLoading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl p-8 max-w-md w-full text-center shadow-2xl">
          <RefreshCw className="mx-auto mb-4 text-blue-600 animate-spin" size={48} />
          <h1 className="text-xl font-bold text-gray-800 mb-2">Connecting…</h1>
          <p className="text-gray-600">Verifying monitor link</p>
        </div>
      </div>
    );
  }

  if (contextError || !context?.valid) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl p-8 max-w-md w-full text-center shadow-2xl">
          <XCircle className="mx-auto mb-4 text-red-500" size={48} />
          <h1 className="text-xl font-bold text-gray-800 mb-2">Monitor Link Invalid</h1>
          <p className="text-gray-600">
            This link has expired or been revoked. Please contact your administrator for a new link.
          </p>
        </div>
      </div>
    );
  }

  // --- No active emergency ---
  if (!musterLoading && (!musterData?.active)) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl p-10 max-w-lg w-full text-center shadow-2xl">
          <div
            className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4"
            style={{ backgroundColor: `${accentColor}20` }}
          >
            <Shield size={32} style={{ color: accentColor }} />
          </div>
          <h1 className="text-2xl font-bold text-gray-800 mb-1">{context.companyName}</h1>
          <p className="text-gray-500 mb-6">Incident Manager Monitor</p>
          <div className="bg-green-50 border border-green-200 rounded-xl p-4 mb-4">
            <CheckCircle className="mx-auto mb-2 text-green-600" size={28} />
            <p className="font-semibold text-green-800">No Active Emergency</p>
            <p className="text-sm text-green-700 mt-1">
              This page will automatically update when an emergency is activated.
            </p>
          </div>
          <div className="flex items-center justify-center gap-2 text-xs text-gray-400">
            <Eye size={12} />
            <span>Read-only senior management view</span>
          </div>
          <div className="flex items-center justify-center gap-2 text-xs text-gray-400 mt-1">
            <RefreshCw size={12} />
            <span>Auto-refreshes every 10 seconds</span>
          </div>
        </div>
      </div>
    );
  }

  const personnel = musterData?.personnel || [];
  const zones = musterData?.zones || [];
  const totalPersonnel = musterData?.totalPersonnel || 0;
  const accountedFor = musterData?.accountedFor || 0;
  const unaccounted = totalPersonnel - accountedFor;
  const accountabilityPct = totalPersonnel > 0 ? Math.round((accountedFor / totalPersonnel) * 100) : 0;
  const isDrill = musterData?.isDrill || false;

  const staffCount = personnel.filter((p) => p.type === "staff").length;
  const visitorCount = personnel.filter((p) => p.type === "visitor").length;
  const contractorCount = personnel.filter((p) => p.type === "contractor").length;

  const unaccountedPeople = personnel.filter((p) => !p.accounted);
  const accountedPeople = personnel.filter((p) => p.accounted);

  const bgColor = isDrill ? "bg-amber-600" : "bg-red-700";
  const headerBg = isDrill ? "bg-amber-700" : "bg-red-800";
  const bannerBg = isDrill ? "bg-amber-800" : "bg-red-900";

  return (
    <div className={`min-h-screen ${bgColor} text-white`}>
      {/* Header */}
      <div className={`${headerBg} p-4 shadow-lg`}>
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Eye className="text-white" size={28} />
            <div>
              <h1 className="text-lg font-bold">{context.companyName}</h1>
              <p className="text-red-200 text-sm">Incident Manager Monitor — Read Only</p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-sm">
            {isDrill ? (
              <Badge className="bg-amber-400 text-amber-900 font-bold text-xs">FIRE DRILL</Badge>
            ) : (
              <Badge className="bg-red-500 text-white font-bold text-xs">LIVE EMERGENCY</Badge>
            )}
          </div>
        </div>
      </div>

      {/* Banner */}
      <div className={`${bannerBg} p-3 border-b-4 border-yellow-400`}>
        <div className="max-w-5xl mx-auto flex items-center justify-center gap-3 flex-wrap">
          <AlertTriangle className="text-yellow-400 animate-pulse flex-shrink-0" size={20} />
          <span className="font-bold text-sm sm:text-base">
            {isDrill ? "FIRE DRILL IN PROGRESS" : "EMERGENCY ACTIVE"}
          </span>
          <div className="flex items-center gap-1 text-yellow-300 ml-2">
            <Clock size={14} />
            <span className="font-mono text-sm">{formatElapsed(elapsedSeconds)}</span>
          </div>
          {/* WebSocket live indicator */}
          {wsConnected ? (
            <div className="flex items-center gap-1 ml-2">
              <Wifi size={13} className="text-green-400" />
              <span className="text-xs text-green-400 font-semibold">● Live</span>
            </div>
          ) : (
            <div className="flex items-center gap-1 ml-2">
              <WifiOff size={13} className="text-gray-400" />
              <span className="text-xs text-gray-400 font-semibold">● Reconnecting</span>
            </div>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="max-w-5xl mx-auto p-4">
        {/* Accountability bar */}
        <div className="bg-white/10 backdrop-blur rounded-xl p-4 mb-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-semibold">Overall Accountability</span>
            <span className="text-2xl font-black">{accountabilityPct}%</span>
          </div>
          <div className="w-full bg-white/20 rounded-full h-3">
            <div
              className="h-3 rounded-full transition-all duration-500"
              style={{
                width: `${accountabilityPct}%`,
                backgroundColor: accountabilityPct === 100 ? "#22c55e" : accountabilityPct >= 75 ? "#eab308" : "#ef4444",
              }}
            />
          </div>
          <div className="flex justify-between mt-1 text-xs text-red-200">
            <span>{accountedFor} accounted</span>
            <span>{unaccounted} unaccounted</span>
          </div>
        </div>

        {/* Stat cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          <div className="bg-white/10 backdrop-blur rounded-xl p-3 text-center">
            <Users className="mx-auto mb-1 text-white" size={20} />
            <p className="text-2xl font-black">{totalPersonnel}</p>
            <p className="text-red-200 text-xs">Total On-Site</p>
          </div>
          <div className="bg-white/10 backdrop-blur rounded-xl p-3 text-center">
            <CheckCircle className="mx-auto mb-1 text-green-400" size={20} />
            <p className="text-2xl font-black text-green-400">{accountedFor}</p>
            <p className="text-red-200 text-xs">Accounted</p>
          </div>
          <div className="bg-white/10 backdrop-blur rounded-xl p-3 text-center">
            <XCircle className="mx-auto mb-1 text-red-300" size={20} />
            <p className="text-2xl font-black text-red-300">{unaccounted}</p>
            <p className="text-red-200 text-xs">Unaccounted</p>
          </div>
          <div className="bg-white/10 backdrop-blur rounded-xl p-3 text-center">
            <Shield className="mx-auto mb-1 text-blue-300" size={20} />
            <div className="flex justify-center gap-2 text-xs">
              <span className="text-blue-300">{staffCount}S</span>
              <span className="text-purple-300">{visitorCount}V</span>
              <span className="text-orange-300">{contractorCount}C</span>
            </div>
            <p className="text-red-200 text-xs mt-1">By Type</p>
          </div>
        </div>

        {/* Unaccounted people alert */}
        {unaccounted > 0 && (
          <div className="bg-yellow-500 text-black rounded-xl p-3 mb-4 flex items-center gap-2">
            <AlertTriangle size={18} className="flex-shrink-0" />
            <span className="font-bold text-sm">
              {unaccounted} PERSON{unaccounted !== 1 ? "S" : ""} UNACCOUNTED FOR
            </span>
          </div>
        )}
        {unaccounted === 0 && totalPersonnel > 0 && (
          <div className="bg-green-500 text-white rounded-xl p-3 mb-4 flex items-center gap-2">
            <CheckCircle size={18} className="flex-shrink-0" />
            <span className="font-bold text-sm">ALL PERSONNEL ACCOUNTED FOR</span>
          </div>
        )}

        {/* Zone breakdown */}
        {zones.length > 0 && (
          <div className="bg-white/10 backdrop-blur rounded-xl p-4 mb-4">
            <div className="flex items-center gap-2 mb-3">
              <MapPin size={16} />
              <h3 className="font-semibold text-sm">Zone Breakdown</h3>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {zones.map((zone) => {
                const pct = zone.total > 0 ? Math.round((zone.accounted / zone.total) * 100) : 0;
                return (
                  <div key={zone.id} className="bg-white/10 rounded-lg p-2.5 text-xs">
                    <div className="flex items-center gap-1.5 mb-1">
                      <div
                        className="w-2 h-2 rounded-full flex-shrink-0"
                        style={{ backgroundColor: zone.color }}
                      />
                      <span className="font-semibold truncate flex-1">{zone.name}</span>
                      {zone.swept ? (
                        <span className="text-green-400 font-bold text-xs ml-auto">✓ Swept</span>
                      ) : (
                        <span className="text-yellow-300 text-xs ml-auto">Pending</span>
                      )}
                    </div>
                    <div className="flex justify-between text-red-200">
                      <span>{zone.accounted}/{zone.total}</span>
                      <span>{pct}%</span>
                    </div>
                    <div className="w-full bg-white/20 rounded-full h-1 mt-1">
                      <div
                        className="h-1 rounded-full"
                        style={{
                          width: `${pct}%`,
                          backgroundColor: pct === 100 ? "#22c55e" : pct >= 50 ? "#eab308" : "#ef4444",
                        }}
                      />
                    </div>
                    {zone.swept && zone.sweptByName && (
                      <p className="text-green-300 mt-1 text-xs truncate">by {zone.sweptByName}</p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Unaccounted people list */}
        {unaccountedPeople.length > 0 && (
          <div className="bg-white/10 backdrop-blur rounded-xl p-4 mb-4">
            <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
              <XCircle size={16} className="text-red-300" />
              Unaccounted Personnel ({unaccountedPeople.length})
            </h3>
            <div className="space-y-1.5 max-h-64 overflow-y-auto">
              {unaccountedPeople.map((p) => (
                <div key={p.id} className="bg-red-900/40 rounded-lg px-3 py-2 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold flex items-center gap-1.5">
                      {p.name}
                      {p.needsEvacuationAssistance && (
                        <span className="text-xs bg-yellow-400 text-yellow-900 px-1.5 py-0.5 rounded font-bold">PEEP</span>
                      )}
                    </p>
                    <p className="text-xs text-red-300">
                      {p.department || p.company || p.type} · {p.zoneName || p.location || "Unassigned"}
                      {p.checkInTime && (
                        <span className="ml-1 text-red-400">· in {formatCheckInTime(p.checkInTime)}</span>
                      )}
                    </p>
                  </div>
                  <Badge variant="destructive" className="text-xs">Missing</Badge>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Accounted people list */}
        {accountedPeople.length > 0 && (
          <div className="bg-white/10 backdrop-blur rounded-xl p-4 mb-4">
            <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
              <CheckCircle size={16} className="text-green-400" />
              Accounted Personnel ({accountedPeople.length})
            </h3>
            <div className="space-y-1.5 max-h-64 overflow-y-auto">
              {accountedPeople.map((p) => (
                <div key={p.id} className="bg-green-900/30 rounded-lg px-3 py-2 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold">{p.name}</p>
                    <p className="text-xs text-green-300">
                      {p.department || p.company || p.type} · {p.zoneName || p.location || "Unassigned"}
                      {p.checkInTime && (
                        <span className="ml-1 text-green-400">· in {formatCheckInTime(p.checkInTime)}</span>
                      )}
                    </p>
                  </div>
                  <Badge className="text-xs bg-green-600 text-white hover:bg-green-600">Safe</Badge>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="text-center text-xs text-red-300 pb-4 flex items-center justify-center gap-1.5">
          <Activity size={11} />
          Read-only view — refreshes automatically every 10 seconds
        </div>
      </div>
    </div>
  );
}
