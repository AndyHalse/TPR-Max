import { useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { 
  AlertTriangle, 
  Users, 
  CheckCircle, 
  Shield,
  RefreshCw,
  MapPin,
  Activity,
  Clock,
  Eye,
  TrendingUp,
} from "lucide-react";

interface MonitorPersonItem {
  id: string;
  name: string;
  type: 'staff' | 'visitor' | 'contractor' | 'member';
  department?: string;
  company?: string;
  location: string;
  zoneName?: string | null;
  zoneColor?: string | null;
  accounted: boolean;
  needsEvacuationAssistance?: boolean;
}

interface MonitorData {
  evacuationId: string;
  customerId: string;
  companyName: string;
  status: string;
  startedAt: string;
  isDrill: boolean;
  totalPersonnel: number;
  accountedFor: number;
  personnel: MonitorPersonItem[];
  zones: { id: string; name: string; color: string; total: number; accounted: number }[];
}

interface IncidentMonitorProps {
  evacuationId: string;
  customerId: string;
}

export default function IncidentMonitor({ evacuationId, customerId }: IncidentMonitorProps) {
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [startTime, setStartTime] = useState<Date | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const queryClient_ref = useRef<any>(null);

  const { data: monitorData, isLoading, isError, refetch } = useQuery<MonitorData>({
    queryKey: ["/api/emergency/monitor", evacuationId, customerId],
    queryFn: async () => {
      const response = await fetch(`/api/emergency/monitor/${evacuationId}?customerId=${encodeURIComponent(customerId)}`, {
        credentials: 'include',
      });
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Failed to fetch monitor data');
      }
      return response.json();
    },
    refetchInterval: 15000,
    retry: 3,
  });

  useEffect(() => {
    if (monitorData?.startedAt) {
      setStartTime(new Date(monitorData.startedAt));
    }
  }, [monitorData?.startedAt]);

  useEffect(() => {
    if (!startTime) return;
    const interval = setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - startTime.getTime()) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [startTime]);

  // WebSocket for live updates
  useEffect(() => {
    if (!evacuationId || !customerId) return;
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    const ws = new WebSocket(`${protocol}//${host}/ws/muster`);
    ws.onopen = () => {
      ws.send(JSON.stringify({ type: 'register', customerId, evacuationId }));
    };
    ws.onmessage = () => {
      refetch();
    };
    wsRef.current = ws;
    return () => { ws.close(); };
  }, [evacuationId, customerId, refetch]);

  const formatElapsed = (secs: number) => {
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    return h > 0 
      ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
      : `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  const isDrill = monitorData?.isDrill;
  const bgClass = isDrill ? 'bg-amber-700' : 'bg-red-700';
  const bannerClass = isDrill ? 'bg-amber-800 border-amber-400' : 'bg-red-800 border-yellow-400';
  const headerClass = isDrill ? 'bg-amber-600' : 'bg-red-600';

  if (isLoading) {
    return (
      <div className={`min-h-screen ${bgClass} flex items-center justify-center p-4`}>
        <div className="bg-white rounded-2xl p-8 max-w-md w-full text-center shadow-2xl">
          <RefreshCw className="mx-auto mb-4 text-red-600 animate-spin" size={64} />
          <h1 className="text-2xl font-bold text-red-800 mb-4">Loading Monitor</h1>
          <p className="text-gray-600">Connecting to live evacuation data...</p>
        </div>
      </div>
    );
  }

  if (isError || !monitorData) {
    return (
      <div className="min-h-screen bg-gray-800 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl p-8 max-w-md w-full text-center shadow-2xl">
          <AlertTriangle className="mx-auto mb-4 text-orange-500" size={64} />
          <h1 className="text-2xl font-bold text-gray-800 mb-4">Monitor Unavailable</h1>
          <p className="text-gray-600 mb-4">
            This evacuation monitor link is invalid, expired, or the evacuation has ended.
          </p>
          <p className="text-sm text-gray-400">
            Evacuation ID: {evacuationId}
          </p>
        </div>
      </div>
    );
  }

  const accountedFor = monitorData.accountedFor;
  const totalPeople = monitorData.totalPersonnel;
  const unaccountedFor = totalPeople - accountedFor;
  const pct = totalPeople > 0 ? Math.round((accountedFor / totalPeople) * 100) : 0;
  const peepCount = monitorData.personnel.filter(p => p.needsEvacuationAssistance).length;

  return (
    <div className={`min-h-screen ${bgClass} text-white`}>
      {/* Header */}
      <div className={`${headerClass} p-4 shadow-lg`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <Eye className="text-white" size={28} />
            <div>
              <h1 className="text-lg font-bold">INCIDENT MONITOR</h1>
              <p className="text-red-200 text-xs">{monitorData.companyName} — Read-Only View</p>
            </div>
          </div>
          <div className="flex items-center gap-2 bg-white/10 rounded-lg px-3 py-1">
            <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
            <span className="text-xs font-medium">LIVE</span>
          </div>
        </div>
      </div>

      {/* Status banner */}
      <div className={`${bannerClass} p-3 border-b-4 text-center`}>
        {isDrill ? (
          <div className="flex items-center justify-center gap-2">
            <Shield className="text-amber-300" size={20} />
            <span className="font-bold text-amber-200">🔶 FIRE DRILL IN PROGRESS</span>
            <Shield className="text-amber-300" size={20} />
          </div>
        ) : (
          <div className="flex items-center justify-center gap-2">
            <AlertTriangle className="text-yellow-400 animate-pulse" size={20} />
            <span className="font-bold">EMERGENCY EVACUATION ACTIVE</span>
            <AlertTriangle className="text-yellow-400 animate-pulse" size={20} />
          </div>
        )}
        <p className="text-xs text-red-300 mt-1">Monitor only — cannot mark personnel safe from this view</p>
      </div>

      {/* Elapsed timer */}
      <div className="bg-black/30 py-3 text-center">
        <div className="flex items-center justify-center gap-2">
          <Clock size={16} className="text-yellow-400" />
          <span className="text-yellow-300 font-mono text-xl font-bold tabular-nums">
            {formatElapsed(elapsedSeconds)}
          </span>
          <span className="text-red-300 text-xs">elapsed</span>
        </div>
      </div>

      {/* Main stats */}
      <div className="p-4 grid grid-cols-3 gap-3">
        <div className="bg-white/10 backdrop-blur rounded-xl p-3 text-center">
          <Users className="mx-auto mb-1 text-white" size={20} />
          <p className="text-2xl font-bold">{totalPeople}</p>
          <p className="text-red-200 text-xs">On-Site</p>
        </div>
        
        <div className="bg-white/10 backdrop-blur rounded-xl p-3 text-center">
          <CheckCircle className="mx-auto mb-1 text-green-400" size={20} />
          <p className="text-2xl font-bold text-green-400">{accountedFor}</p>
          <p className="text-red-200 text-xs">Safe</p>
        </div>

        <div className={`backdrop-blur rounded-xl p-3 text-center ${
          unaccountedFor > 0 ? 'bg-yellow-500/30 border border-yellow-400' : 'bg-white/10'
        }`}>
          <AlertTriangle className={`mx-auto mb-1 ${unaccountedFor > 0 ? 'text-yellow-300' : 'text-gray-400'}`} size={20} />
          <p className={`text-2xl font-bold ${unaccountedFor > 0 ? 'text-yellow-300' : 'text-gray-400'}`}>
            {unaccountedFor}
          </p>
          <p className="text-red-200 text-xs">Missing</p>
        </div>
      </div>

      {/* Progress bar */}
      <div className="px-4 pb-4">
        <div className="flex justify-between text-xs text-red-200 mb-1">
          <span>Overall progress</span>
          <span className="font-bold text-white">{pct}%</span>
        </div>
        <div className="h-4 bg-black/30 rounded-full overflow-hidden">
          <div 
            className={`h-full transition-all duration-500 ${
              pct === 100 ? 'bg-green-500' : pct > 60 ? 'bg-yellow-500' : 'bg-red-400'
            }`}
            style={{ width: `${pct}%` }}
          />
        </div>
        {peepCount > 0 && (
          <p className="text-purple-300 text-xs mt-1 text-center">
            ♿ {peepCount} person{peepCount !== 1 ? 's' : ''} requiring evacuation assistance (PEEP)
          </p>
        )}
      </div>

      {/* Zone breakdown */}
      {monitorData.zones.length > 0 && (
        <div className="px-4 pb-4">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp size={14} className="text-red-300" />
            <span className="text-xs font-bold text-red-200 uppercase tracking-wide">Zone Status</span>
          </div>
          <div className="space-y-2">
            {monitorData.zones.map(zone => {
              const zonePct = zone.total > 0 ? Math.round((zone.accounted / zone.total) * 100) : 100;
              const zoneCleared = zone.total > 0 && zone.accounted === zone.total;
              return (
                <div key={zone.id} className="bg-black/20 rounded-lg p-2">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full" style={{ backgroundColor: zone.color }} />
                      <span className="text-sm font-medium">{zone.name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-red-300">{zone.accounted}/{zone.total}</span>
                      {zoneCleared 
                        ? <CheckCircle size={14} className="text-green-400" />
                        : zone.total > 0 
                        ? <AlertTriangle size={14} className="text-yellow-400" />
                        : <span className="text-xs text-gray-500">empty</span>
                      }
                    </div>
                  </div>
                  <div className="h-1.5 bg-black/30 rounded-full overflow-hidden">
                    <div 
                      className={`h-full transition-all duration-500 ${zoneCleared ? 'bg-green-500' : 'bg-yellow-400'}`}
                      style={{ width: `${zone.total > 0 ? zonePct : 100}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Personnel list (read-only) */}
      <div className="px-4 pb-6">
        <div className="flex items-center gap-2 mb-3">
          <Activity size={14} className="text-red-300" />
          <span className="text-xs font-bold text-red-200 uppercase tracking-wide">
            Personnel ({monitorData.personnel.length})
          </span>
        </div>
        <div className="space-y-2">
          {/* Unaccounted first */}
          {monitorData.personnel
            .sort((a, b) => (a.accounted ? 1 : -1) - (b.accounted ? 1 : -1))
            .map(person => (
              <div 
                key={person.id}
                className={`p-3 rounded-xl border flex items-center justify-between ${
                  person.accounted 
                    ? 'bg-green-600/15 border-green-600/40' 
                    : 'bg-red-500/20 border-red-400/60'
                }`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0 ${
                    person.type === 'staff' ? 'bg-blue-600' : 
                    person.type === 'visitor' ? 'bg-orange-600' : 
                    person.type === 'member' ? 'bg-purple-600' : 'bg-yellow-600'
                  }`}>
                    {person.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1 flex-wrap">
                      <p className="font-medium text-sm text-white truncate">{person.name}</p>
                      {person.needsEvacuationAssistance && (
                        <span className="text-[9px] font-bold bg-amber-300 text-amber-900 px-1 rounded border border-amber-500 flex-shrink-0">♿ PEEP</span>
                      )}
                    </div>
                    <div className="flex items-center gap-1 text-red-300 text-xs">
                      <MapPin size={9} />
                      {person.zoneName 
                        ? <span style={{ color: person.zoneColor || undefined }}>{person.zoneName}</span>
                        : <span className="opacity-60">Unassigned</span>
                      }
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <Badge className={`text-[10px] px-1.5 py-0 ${
                    person.type === 'contractor' ? 'bg-yellow-100 text-yellow-800' :
                    person.type === 'visitor' ? 'bg-orange-100 text-orange-800' :
                    person.type === 'member' ? 'bg-purple-100 text-purple-800' :
                    'bg-blue-100 text-blue-800'
                  }`}>
                    {person.type.toUpperCase()}
                  </Badge>
                  {person.accounted 
                    ? <CheckCircle size={16} className="text-green-400" />
                    : <AlertTriangle size={16} className="text-yellow-400" />
                  }
                </div>
              </div>
            ))}
        </div>
      </div>

      {/* Footer */}
      <div className="bg-black/30 p-4 text-center text-xs text-red-300">
        <p>Read-only incident monitor — refreshes every 15 seconds</p>
        <p className="mt-1 opacity-60">Evacuation ID: {evacuationId}</p>
      </div>
    </div>
  );
}
