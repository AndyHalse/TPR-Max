import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { 
  AlertTriangle, 
  Users, 
  CheckCircle, 
  XCircle, 
  Search,
  Shield,
  RefreshCw,
  Phone,
  MapPin,
  Clock,
  Layers,
  ChevronRight,
  ChevronDown,
  Footprints,
  Mail,
  Accessibility,
} from "lucide-react";

interface MusterListItem {
  id: string;
  name: string;
  type: 'staff' | 'visitor' | 'contractor' | 'member';
  department?: string;
  company?: string;
  checkedInAt: string;
  location: string;
  zoneId?: string | null;
  zoneName?: string | null;
  zoneColor?: string | null;
  accounted: boolean;
  needsEvacuationAssistance?: boolean;
  hasEmail?: boolean;
  statusOption?: string | null;
}

interface MusterSettings {
  statusOptionsEnabled: boolean;
  statusOptions: string[];
}

interface MusterResponse {
  people: MusterListItem[];
  musterSettings: MusterSettings;
}

interface Zone {
  id: string;
  name: string;
  color: string;
}

interface ZoneSweep {
  id: string;
  evacuationId: string;
  zoneId: string;
  zoneName: string;
  sweptByName: string;
  sweptByType: string;
  sweptAt: string;
  hasUnaccountedAtTime: boolean;
  overrideReason?: string | null;
}

interface FireMarshalProps {
  token?: string;
}

export default function FireMarshalMuster({ token }: FireMarshalProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [isValidToken, setIsValidToken] = useState(false);
  const [marshalInfo, setMarshalInfo] = useState<{ name: string; department: string } | null>(null);
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [evacuationId, setEvacuationId] = useState<string | null>(null);
  const [wsConnected, setWsConnected] = useState(false);
  const [activeZoneFilter, setActiveZoneFilter] = useState<string | null>(null);
  const [marshalZoneId, setMarshalZoneId] = useState<string | null>(null);
  const [zoneSweepMode, setZoneSweepMode] = useState(false);
  const [sweepConfirmZone, setSweepConfirmZone] = useState<{ id: string; name: string; unaccountedCount: number } | null>(null);
  const [overrideReason, setOverrideReason] = useState("");
  const [emailingPersonId, setEmailingPersonId] = useState<string | null>(null);
  // Status option dropdown open state: personId or null
  const [openDropdownId, setOpenDropdownId] = useState<string | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Validate token on mount
  useEffect(() => {
    const validateToken = async () => {
      if (!token) return;
      
      try {
        const response = await fetch(`/api/emergency/validate-token/${token}`, {
          method: 'GET',
          credentials: 'include'
        });
        
        if (response.ok) {
          const data = await response.json();
          setIsValidToken(true);
          setMarshalInfo(data.marshal);
          setCustomerId(data.customerId);
          setEvacuationId(data.evacuationId);
        } else {
          setIsValidToken(false);
          toast({
            title: "Access Denied",
            description: "Invalid or expired emergency token",
            variant: "destructive",
          });
        }
      } catch (error) {
        setIsValidToken(false);
        toast({
          title: "Connection Error",
          description: "Unable to validate emergency access",
          variant: "destructive",
        });
      }
    };

    validateToken();
  }, [token, toast]);

  // Fetch zones for this fire marshal
  const { data: zoneData } = useQuery<{ zones: Zone[]; marshalZoneId: string | null }>({
    queryKey: ["/api/emergency/zones", token],
    enabled: isValidToken && !!token,
    refetchInterval: false,
  });

  useEffect(() => {
    if (zoneData?.marshalZoneId) {
      setMarshalZoneId(zoneData.marshalZoneId);
      setActiveZoneFilter(zoneData.marshalZoneId);
      setZoneSweepMode(true);
    }
  }, [zoneData]);

  const zones = zoneData?.zones || [];

  // Fetch zone sweeps for the active evacuation
  const { data: zoneSweeps = [] } = useQuery<ZoneSweep[]>({
    queryKey: ["/api/emergency/zone-sweeps", evacuationId, token],
    enabled: isValidToken && !!evacuationId && !!token,
    queryFn: async () => {
      const res = await fetch(`/api/emergency/zone-sweeps/${evacuationId}?token=${token}`, {
        credentials: 'include'
      });
      if (!res.ok) return [];
      return res.json();
    },
    refetchInterval: 15000,
  });

  // Map of zoneId → sweep record
  const sweptZoneMap = new Map<string, ZoneSweep>(zoneSweeps.map(s => [s.zoneId, s]));

  // Mutation to mark a zone as physically swept
  const sweepZoneMutation = useMutation({
    mutationFn: async ({ zoneId, zoneName, overrideReason }: { zoneId: string; zoneName: string; overrideReason?: string }) => {
      const response = await fetch('/api/emergency/sweep-zone', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, evacuationId, zoneId, zoneName, overrideReason }),
        credentials: 'include'
      });
      if (!response.ok) throw new Error('Failed to record zone sweep');
      return response.json();
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ["/api/emergency/zone-sweeps", evacuationId, token] });
      toast({ title: "Zone Cleared", description: `${vars.zoneName} has been marked physically swept.` });
      setSweepConfirmZone(null);
      setOverrideReason("");
    },
    onError: () => {
      toast({ title: "Failed", description: "Could not record zone sweep", variant: "destructive" });
    }
  });

  // Mutation to send an individual email reminder from the fire marshal view
  const emailPersonMutation = useMutation({
    mutationFn: async ({ personId, personType }: { personId: string; personType: string }) => {
      setEmailingPersonId(personId);
      const response = await fetch(`/api/emergency/email-person/${personType}/${personId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
        credentials: 'include',
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to send reminder");
      return data;
    },
    onSuccess: (data) => {
      setEmailingPersonId(null);
      toast({ title: "Reminder Sent", description: data.message || "Email reminder sent" });
    },
    onError: (error: any) => {
      setEmailingPersonId(null);
      toast({ title: "Send Failed", description: error.message || "Failed to send email reminder", variant: "destructive" });
    },
  });

  const handleSweepZone = (zone: { id: string; name: string }, unaccountedCount: number) => {
    if (unaccountedCount > 0) {
      setSweepConfirmZone({ id: zone.id, name: zone.name, unaccountedCount });
    } else {
      sweepZoneMutation.mutate({ zoneId: zone.id, zoneName: zone.name });
    }
  };

  const confirmSweepOverride = () => {
    if (!sweepConfirmZone) return;
    sweepZoneMutation.mutate({
      zoneId: sweepConfirmZone.id,
      zoneName: sweepConfirmZone.name,
      overrideReason: overrideReason || `${sweepConfirmZone.unaccountedCount} person(s) still unaccounted`,
    });
  };

  // WebSocket connection for real-time updates
  useEffect(() => {
    if (!isValidToken || !customerId || !evacuationId) return;

    const connectWebSocket = () => {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const host = window.location.host;
      const wsUrl = `${protocol}//${host}/ws/muster`;
      
      const ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        setWsConnected(true);
        ws.send(JSON.stringify({ type: 'register', customerId, evacuationId }));
      };

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          if (message.type === 'muster_update') {
            queryClient.invalidateQueries({ queryKey: ["/api/emergency/muster", token] });
            const statusText = message.isAccountedFor ? 'SAFE' : 'UNSAFE';
            toast({
              title: "Real-time Update",
              description: `${message.personName} marked as ${statusText}`,
            });
          }
        } catch {
          // ignore parse errors
        }
      };

      ws.onerror = () => { setWsConnected(false); };

      ws.onclose = () => {
        setWsConnected(false);
        reconnectTimeoutRef.current = setTimeout(() => { connectWebSocket(); }, 3000);
      };

      wsRef.current = ws;
    };

    connectWebSocket();

    return () => {
      if (wsRef.current) { wsRef.current.close(); wsRef.current = null; }
      if (reconnectTimeoutRef.current) { clearTimeout(reconnectTimeoutRef.current); }
    };
  }, [isValidToken, customerId, evacuationId, token, toast, queryClient]);

  // Fetch muster list (includes musterSettings)
  const { data: musterResponse, isLoading, refetch } = useQuery<MusterResponse>({
    queryKey: ["/api/emergency/muster", token],
    enabled: isValidToken && !!token,
    refetchInterval: 30000,
    retry: 3,
    queryFn: async () => {
      const res = await fetch(`/api/emergency/muster/${token}`, { credentials: 'include' });
      if (!res.ok) return { people: [], musterSettings: { statusOptionsEnabled: false, statusOptions: [] } };
      return res.json();
    },
  });

  const musterList: MusterListItem[] = musterResponse?.people || [];
  const musterSettings: MusterSettings = musterResponse?.musterSettings || { statusOptionsEnabled: false, statusOptions: [] };

  // Toggle accounted status mutation (plain SAFE button)
  const toggleAccountedMutation = useMutation({
    mutationFn: async ({ personId, type }: { personId: string, type: string }) => {
      const response = await fetch(`/api/emergency/toggle-accounted/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ personId, type }),
        credentials: 'include'
      });
      
      if (!response.ok) throw new Error('Failed to update status');
      return await response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/emergency/muster", token] });
      toast({
        title: "Status Updated", 
        description: `${data.name} marked as ${data.accounted ? 'safe' : 'unsafe'}`,
      });
    },
    onError: (error: any) => {
      toast({ title: "Update Failed", description: error.message || "Failed to update status", variant: "destructive" });
    },
  });

  // Status option mutation (dropdown selection)
  const statusOptionMutation = useMutation({
    mutationFn: async ({ personId, type, statusOption }: { personId: string; type: string; statusOption: string }) => {
      const response = await fetch(`/api/emergency/toggle-accounted/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ personId, type, statusOption }),
        credentials: 'include'
      });
      if (!response.ok) throw new Error('Failed to update status');
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/emergency/muster", token] });
      setOpenDropdownId(null);
      toast({ title: "Status Set", description: `${data.name}: ${data.statusOption || 'Safe'}` });
    },
    onError: (error: any) => {
      setOpenDropdownId(null);
      toast({ title: "Update Failed", description: error.message || "Failed to set status", variant: "destructive" });
    },
  });

  // Compute zone sweep stats
  const zoneStats = zones.map(zone => {
    const inZone = musterList.filter(p => p.zoneId === zone.id);
    const accountedInZone = inZone.filter(p => p.accounted).length;
    const unaccountedInZone = inZone.length - accountedInZone;
    const isPersonnelCleared = inZone.length > 0 && accountedInZone === inZone.length;
    const isPhysicallySwept = sweptZoneMap.has(zone.id);
    return {
      ...zone,
      total: inZone.length,
      accounted: accountedInZone,
      unaccounted: unaccountedInZone,
      cleared: isPersonnelCleared,
      swept: isPhysicallySwept,
      sweepRecord: sweptZoneMap.get(zone.id),
    };
  });

  const unassignedPeople = musterList.filter(p => !p.zoneId);

  // Apply zone filter
  const zoneFilteredList = activeZoneFilter === '__unassigned'
    ? unassignedPeople
    : activeZoneFilter
    ? musterList.filter(p => p.zoneId === activeZoneFilter)
    : musterList;

  // Apply search
  const filteredList = zoneFilteredList.filter(person => 
    person.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (person.department && person.department.toLowerCase().includes(searchTerm.toLowerCase())) ||
    (person.company && person.company.toLowerCase().includes(searchTerm.toLowerCase()))
  ).sort((a, b) => {
    const accA = a.accounted ? 1 : 0;
    const accB = b.accounted ? 1 : 0;
    if (accA !== accB) return accA - accB;
    const peepA = a.needsEvacuationAssistance ? 1 : 0;
    const peepB = b.needsEvacuationAssistance ? 1 : 0;
    return peepB - peepA;
  });

  const totalPeople = musterList.length;
  const accountedFor = musterList.filter(p => p.accounted).length;
  const unaccountedFor = totalPeople - accountedFor;
  const peepCount = musterList.filter(p => p.needsEvacuationAssistance).length;
  const peepUnaccounted = musterList.filter(p => p.needsEvacuationAssistance && !p.accounted).length;

  const toggleAccountedStatus = (id: string, type: string) => {
    toggleAccountedMutation.mutate({ personId: id, type });
  };

  if (!token) {
    return (
      <div className="min-h-screen bg-red-600 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl p-8 max-w-md w-full text-center shadow-2xl">
          <AlertTriangle className="mx-auto mb-4 text-red-600" size={64} />
          <h1 className="text-2xl font-bold text-red-800 mb-4">Emergency Access Required</h1>
          <p className="text-red-700">
            This page requires an emergency access token. Please use the link provided in your emergency notification email.
          </p>
        </div>
      </div>
    );
  }

  if (!isValidToken) {
    return (
      <div className="min-h-screen bg-red-600 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl p-8 max-w-md w-full text-center shadow-2xl">
          <XCircle className="mx-auto mb-4 text-red-600" size={64} />
          <h1 className="text-2xl font-bold text-red-800 mb-4">Invalid Access</h1>
          <p className="text-red-700 mb-4">
            The emergency access token is invalid or has expired.
          </p>
          <Button 
            onClick={() => window.location.reload()} 
            className="bg-red-600 hover:bg-red-700 text-white"
          >
            <RefreshCw className="mr-2" size={16} />
            Retry
          </Button>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-red-600 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl p-8 max-w-md w-full text-center shadow-2xl">
          <RefreshCw className="mx-auto mb-4 text-red-600 animate-spin" size={64} />
          <h1 className="text-2xl font-bold text-red-800 mb-4">Loading Emergency Data</h1>
          <p className="text-red-700">Fetching current muster list...</p>
        </div>
      </div>
    );
  }

  const hasZones = zones.length > 0;
  const sweptCount = zoneStats.filter(z => z.swept).length;

  return (
    <div className="min-h-screen bg-red-600 text-white" onClick={() => openDropdownId && setOpenDropdownId(null)}>
      {/* Sweep confirmation dialog */}
      {sweepConfirmZone && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-2xl">
            <div className="flex items-center gap-3 mb-4">
              <AlertTriangle className="text-amber-500 flex-shrink-0" size={28} />
              <h2 className="text-lg font-bold text-gray-900">Unaccounted People in Zone</h2>
            </div>
            <p className="text-gray-700 mb-2">
              <strong>{sweepConfirmZone.unaccountedCount} person{sweepConfirmZone.unaccountedCount !== 1 ? 's' : ''}</strong> in <strong>{sweepConfirmZone.name}</strong> {sweepConfirmZone.unaccountedCount === 1 ? 'is' : 'are'} still unaccounted.
            </p>
            <p className="text-gray-600 text-sm mb-4">
              You can still mark this zone as physically swept. Please provide a reason for the override.
            </p>
            <Input
              value={overrideReason}
              onChange={e => setOverrideReason(e.target.value)}
              placeholder="Override reason (e.g. zone confirmed empty, person is absent today)"
              className="mb-4 text-gray-900"
            />
            <div className="flex gap-3">
              <Button
                variant="outline"
                className="flex-1 border-gray-300 text-gray-700"
                onClick={() => { setSweepConfirmZone(null); setOverrideReason(""); }}
              >
                Cancel
              </Button>
              <Button
                className="flex-1 bg-amber-500 hover:bg-amber-600 text-white font-bold"
                onClick={confirmSweepOverride}
                disabled={sweepZoneMutation.isPending}
              >
                <Footprints className="mr-2" size={16} />
                {sweepZoneMutation.isPending ? "Recording..." : "Mark Swept Anyway"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Mobile-optimized header */}
      <div className="bg-red-700 p-4 shadow-lg">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <Shield className="text-white" size={32} />
            <div>
              <h1 className="text-xl font-bold">FIRE MARSHAL</h1>
              <p className="text-red-200 text-sm">Emergency Muster Control</p>
            </div>
          </div>
          <div className="text-right text-sm">
            <p className="font-medium">{marshalInfo?.name}</p>
            <p className="text-red-200">{marshalInfo?.department}</p>
          </div>
        </div>
      </div>

      {/* Emergency status banner */}
      <div className="bg-red-800 p-4 border-b-4 border-yellow-400">
        <div className="flex items-center justify-center space-x-3">
          <AlertTriangle className="text-yellow-400 animate-pulse" size={24} />
          <div className="text-center">
            <h2 className="text-lg font-bold">EMERGENCY ACTIVE</h2>
            <p className="text-red-200 text-sm">Real-time muster point management</p>
          </div>
          <div className="flex items-center text-yellow-400">
            <Clock className="mr-1" size={16} />
            <span className="text-sm font-mono">
              {new Date().toLocaleTimeString()}
            </span>
          </div>
        </div>
      </div>

      {/* Stats cards */}
      <div className="p-4 grid grid-cols-2 gap-4">
        <div className="bg-white/10 backdrop-blur rounded-xl p-4 text-center">
          <Users className="mx-auto mb-2 text-white" size={24} />
          <p className="text-2xl font-bold">{totalPeople}</p>
          <p className="text-red-200 text-sm">Total On-Site</p>
        </div>
        
        <div className="bg-white/10 backdrop-blur rounded-xl p-4 text-center">
          <CheckCircle className="mx-auto mb-2 text-green-400" size={24} />
          <p className="text-2xl font-bold text-green-400">{accountedFor}</p>
          <p className="text-red-200 text-sm">Accounted For</p>
        </div>
      </div>

      {/* Critical status */}
      {unaccountedFor > 0 && (
        <div className="mx-4 mb-4 bg-yellow-500 text-black p-4 rounded-xl">
          <div className="flex items-center justify-center space-x-2">
            <AlertTriangle size={20} />
            <span className="font-bold">
              {unaccountedFor} PERSON{unaccountedFor !== 1 ? 'S' : ''} UNACCOUNTED
            </span>
          </div>
        </div>
      )}

      {/* PEEP alert banner */}
      {peepCount > 0 && (
        <div className={`mx-4 mb-4 rounded-xl border-2 border-amber-400 overflow-hidden ${peepUnaccounted > 0 ? 'animate-pulse-subtle' : ''}`}>
          <div className="bg-amber-400 px-4 py-2 flex items-center gap-2">
            <Accessibility size={18} className="text-amber-900 flex-shrink-0" />
            <span className="text-amber-900 font-black text-sm tracking-wide uppercase">
              ⚠ PEEP — Evacuation Assistance Required
            </span>
          </div>
          <div className="bg-amber-50 px-4 py-3 flex items-center justify-between">
            <div>
              <p className="text-amber-900 font-bold text-base">
                {peepCount} person{peepCount !== 1 ? 's' : ''} need{peepCount === 1 ? 's' : ''} assistance
              </p>
              <p className="text-amber-700 text-sm">
                {peepUnaccounted > 0
                  ? `${peepUnaccounted} still unaccounted — prioritise now`
                  : 'All PEEP individuals accounted for ✓'}
              </p>
            </div>
            <div className="bg-amber-400 rounded-full w-12 h-12 flex items-center justify-center">
              <span className="text-amber-900 font-black text-xl">{peepCount}</span>
            </div>
          </div>
        </div>
      )}

      {/* Zone Sweep Panel */}
      {hasZones && (
        <div className="px-4 mb-3">
          <div className="bg-red-800/60 rounded-xl overflow-hidden">
            <button
              className="w-full flex items-center justify-between p-3 text-left"
              onClick={() => setZoneSweepMode(!zoneSweepMode)}
            >
              <div className="flex items-center gap-2">
                <Layers size={16} className="text-yellow-300" />
                <span className="text-sm font-bold text-yellow-200">ZONE SWEEP</span>
                <span className="text-xs text-red-300">
                  {sweptCount}/{zoneStats.length} zones swept
                </span>
                {sweptCount === zoneStats.length && zoneStats.length > 0 && (
                  <span className="text-[10px] bg-green-500 text-white px-1.5 py-0.5 rounded-full font-bold">ALL CLEAR</span>
                )}
              </div>
              <ChevronRight 
                size={16} 
                className={`text-red-300 transition-transform ${zoneSweepMode ? 'rotate-90' : ''}`} 
              />
            </button>

            {zoneSweepMode && (
              <div className="px-3 pb-3 space-y-2">
                {/* All zones button */}
                <button
                  onClick={() => setActiveZoneFilter(null)}
                  className={`w-full flex items-center justify-between p-2 rounded-lg text-sm font-medium transition-colors ${
                    activeZoneFilter === null 
                      ? 'bg-white text-red-800' 
                      : 'bg-red-700/50 text-white hover:bg-red-700'
                  }`}
                >
                  <span>All Zones</span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs opacity-70">{accountedFor}/{totalPeople}</span>
                    {accountedFor === totalPeople && totalPeople > 0 && (
                      <CheckCircle size={14} className="text-green-400" />
                    )}
                  </div>
                </button>

                {/* Zone buttons with sweep controls */}
                {zoneStats.map(zone => {
                  const isSweeping = sweepZoneMutation.isPending;
                  return (
                    <div
                      key={zone.id}
                      className={`rounded-lg overflow-hidden transition-all ${
                        activeZoneFilter === zone.id ? 'ring-2 ring-white' : ''
                      }`}
                    >
                      <button
                        onClick={() => setActiveZoneFilter(zone.id === activeZoneFilter ? null : zone.id)}
                        className={`w-full flex items-center justify-between p-2 text-sm font-medium transition-colors ${
                          activeZoneFilter === zone.id
                            ? 'bg-white text-red-800'
                            : zone.swept
                            ? 'bg-green-800/60 text-white hover:bg-green-700/70'
                            : zone.cleared
                            ? 'bg-green-700/40 text-white hover:bg-green-700/60'
                            : 'bg-red-700/50 text-white hover:bg-red-700'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <div 
                            className="w-3 h-3 rounded-full flex-shrink-0" 
                            style={{ backgroundColor: zone.color }}
                          />
                          <span>{zone.name}</span>
                          {zone.id === marshalZoneId && (
                            <span className="text-[10px] bg-yellow-400 text-yellow-900 px-1 rounded font-bold">MINE</span>
                          )}
                          {zone.swept && (
                            <span className="text-[10px] bg-green-500 text-white px-1.5 py-0.5 rounded-full font-bold flex items-center gap-0.5">
                              <Footprints size={9} /> SWEPT
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          {zone.total === 0 ? (
                            <span className="text-xs opacity-50">Empty</span>
                          ) : (
                            <>
                              <span className="text-xs opacity-70">{zone.accounted}/{zone.total}</span>
                              {zone.cleared 
                                ? <CheckCircle size={14} className="text-green-300" />
                                : <AlertTriangle size={14} className="text-yellow-400" />
                              }
                            </>
                          )}
                        </div>
                      </button>

                      {activeZoneFilter === zone.id && (
                        <div className="bg-red-900/40 px-2 pb-2 pt-1">
                          {zone.swept ? (
                            <div className="flex items-center gap-2 p-2 bg-green-800/50 rounded-lg">
                              <CheckCircle size={14} className="text-green-400 flex-shrink-0" />
                              <div className="flex-1 min-w-0">
                                <p className="text-xs text-green-300 font-semibold">Zone physically swept</p>
                                {zone.sweepRecord && (
                                  <p className="text-[11px] text-green-400 truncate">
                                    by {zone.sweepRecord.sweptByName} at {new Date(zone.sweepRecord.sweptAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                                  </p>
                                )}
                                {zone.sweepRecord?.hasUnaccountedAtTime && (
                                  <p className="text-[11px] text-amber-400">⚠ Swept with unaccounted people</p>
                                )}
                              </div>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="text-green-300 hover:text-white text-xs px-2 h-7 flex-shrink-0"
                                onClick={() => sweepZoneMutation.mutate({ zoneId: zone.id, zoneName: zone.name })}
                                disabled={isSweeping}
                              >
                                Re-sweep
                              </Button>
                            </div>
                          ) : (
                            <div>
                              {zone.unaccounted > 0 && (
                                <p className="text-xs text-yellow-300 mb-1 flex items-center gap-1">
                                  <AlertTriangle size={11} />
                                  {zone.unaccounted} person{zone.unaccounted !== 1 ? 's' : ''} unaccounted — you can still sweep
                                </p>
                              )}
                              <Button
                                size="sm"
                                className="w-full bg-green-600 hover:bg-green-700 text-white font-bold text-sm py-2.5"
                                onClick={() => handleSweepZone({ id: zone.id, name: zone.name }, zone.unaccounted)}
                                disabled={isSweeping}
                              >
                                <Footprints className="mr-2" size={15} />
                                {isSweeping ? "Recording..." : "Mark Zone Clear"}
                              </Button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* Unassigned people */}
                {unassignedPeople.length > 0 && (
                  <button
                    onClick={() => setActiveZoneFilter(activeZoneFilter === '__unassigned' ? null : '__unassigned')}
                    className={`w-full flex items-center justify-between p-2 rounded-lg text-sm font-medium transition-colors ${
                      activeZoneFilter === '__unassigned'
                        ? 'bg-white text-red-800'
                        : 'bg-red-700/50 text-white hover:bg-red-700'
                    }`}
                  >
                    <span className="text-red-300">⚪ Unassigned</span>
                    <span className="text-xs opacity-70">
                      {unassignedPeople.filter(p => p.accounted).length}/{unassignedPeople.length}
                    </span>
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Zone filter active banner */}
      {activeZoneFilter && activeZoneFilter !== '__unassigned' && (
        <div className="mx-4 mb-3">
          {(() => {
            const zone = zones.find(z => z.id === activeZoneFilter);
            if (!zone) return null;
            const stat = zoneStats.find(z => z.id === activeZoneFilter);
            return (
              <div 
                className="flex items-center justify-between px-3 py-2 rounded-lg text-sm font-bold"
                style={{ backgroundColor: zone.color + '40', border: `2px solid ${zone.color}` }}
              >
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: zone.color }} />
                  <span>Viewing: {zone.name}</span>
                </div>
                <div className="flex items-center gap-2">
                  {stat?.swept && (
                    <span className="text-[10px] bg-green-500 text-white px-1.5 py-0.5 rounded-full font-bold flex items-center gap-0.5">
                      <Footprints size={9} /> SWEPT
                    </span>
                  )}
                  <span className={stat?.cleared ? 'text-green-300' : 'text-yellow-300'}>
                    {stat?.cleared ? '✅ CLEARED' : `${stat?.accounted}/${stat?.total} safe`}
                  </span>
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {activeZoneFilter === '__unassigned' && (
        <div className="mx-4 mb-3 bg-red-800/60 px-3 py-2 rounded-lg text-sm font-bold text-red-300 border border-red-500">
          Viewing: Unassigned Personnel ({unassignedPeople.length})
        </div>
      )}

      {/* Search */}
      <div className="px-4 pb-3">
        <div className="relative">
          <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-red-300" size={20} />
          <Input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search personnel..."
            className="pl-12 py-4 text-lg bg-white/20 border-white/30 text-white placeholder-red-200 rounded-xl focus:ring-2 focus:ring-white"
            data-testid="input-marshal-search"
          />
        </div>
      </div>

      {/* Personnel list */}
      <div className="px-4 pb-6 space-y-3">
        {filteredList.length === 0 && (
          <div className="text-center py-8 text-red-300">
            {activeZoneFilter ? 'No personnel in this zone' : 'No personnel found'}
          </div>
        )}
        {filteredList.map((person) => (
          <div 
            key={person.id} 
            className={`rounded-xl border-2 overflow-hidden ${
              person.needsEvacuationAssistance
                ? 'border-amber-400'
                : person.accounted 
                ? 'bg-green-600/20 border-green-400' 
                : 'bg-red-500/20 border-red-300'
            }`}
            data-testid={`person-${person.id}`}
          >
            {person.needsEvacuationAssistance && (
              <div className={`flex items-center gap-2 px-4 py-1.5 ${person.accounted ? 'bg-amber-400/80' : 'bg-amber-400'}`}>
                <Accessibility size={14} className="text-amber-900 flex-shrink-0" />
                <span className="text-amber-900 text-xs font-black uppercase tracking-wide">
                  ⚠ Requires Evacuation Assistance (PEEP)
                </span>
                {!person.accounted && (
                  <span className="ml-auto text-amber-900 text-xs font-bold">PRIORITY</span>
                )}
              </div>
            )}
            <div className={`p-4 ${person.needsEvacuationAssistance ? (person.accounted ? 'bg-amber-600/10' : 'bg-amber-500/15') : ''}`}>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center space-x-3">
                <div className={`w-12 h-12 rounded-full flex items-center justify-center text-white font-bold ${
                  person.type === 'staff' ? 'bg-blue-600' : 
                  person.type === 'visitor' ? 'bg-orange-600' : 
                  person.type === 'member' ? 'bg-purple-600' : 'bg-yellow-600'
                }`}>
                  {person.name.split(' ').map(n => n[0]).join('').toUpperCase()}
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-bold text-lg text-white">{person.name}</p>
                    {person.needsEvacuationAssistance && (
                      <span title="Requires Evacuation Assistance (PEEP)" className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-amber-300 text-amber-900 border border-amber-500">
                        <Accessibility size={12} /> PEEP
                      </span>
                    )}
                  </div>
                  <p className="text-red-200 text-sm">
                    {person.type === 'staff' ? person.department : person.company}
                  </p>
                  <div className="flex items-center gap-2 text-red-300 text-xs mt-1">
                    <MapPin size={12} />
                    {person.zoneName 
                      ? <span style={{ color: person.zoneColor || undefined }} className="font-medium">{person.zoneName}</span>
                      : <span className="opacity-70">No zone assigned</span>
                    }
                  </div>
                  {!person.accounted && person.location && person.location !== 'Not specified' && (
                    <p className="flex items-center gap-1 text-xs font-semibold text-yellow-300 mt-1">
                      <MapPin size={11} className="flex-shrink-0" />
                      Last known: {person.location}
                    </p>
                  )}
                  {/* Amber status option badge */}
                  {person.accounted && person.statusOption && (
                    <div className="mt-1.5">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-400/20 text-amber-300 border border-amber-500/40">
                        {person.statusOption}
                      </span>
                    </div>
                  )}
                </div>
              </div>
              
              <div className="flex flex-col items-end space-y-2">
                <Badge 
                  variant={person.type === 'staff' ? 'default' : 'secondary'}
                  className={`text-xs ${
                    person.type === 'member' ? 'bg-purple-100 text-purple-800' :
                    person.type === 'contractor' ? 'bg-yellow-100 text-yellow-800' :
                    ''
                  }`}
                >
                  {person.type.toUpperCase()}
                </Badge>

                <div className="flex items-center gap-2">
                  {/* Email reminder button */}
                  {!person.accounted && (
                    <Button
                      size="sm"
                      variant="outline"
                      className={`h-10 w-10 p-0 rounded-xl border-2 ${
                        person.hasEmail
                          ? 'border-orange-400 text-orange-300 hover:bg-orange-500/20'
                          : 'border-red-900 text-red-800 cursor-not-allowed opacity-40'
                      }`}
                      disabled={!person.hasEmail || emailingPersonId === person.id}
                      onClick={() => person.hasEmail && emailPersonMutation.mutate({ personId: person.id, personType: person.type })}
                      title={person.hasEmail ? `Send email reminder to ${person.name}` : 'No email address on file'}
                      data-testid={`button-email-${person.id}`}
                    >
                      {emailingPersonId === person.id ? (
                        <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                        </svg>
                      ) : (
                        <Mail size={16} />
                      )}
                    </Button>
                  )}

                  {/* Status options dropdown button — shown to the LEFT of SAFE when enabled and person is not yet accounted */}
                  {musterSettings.statusOptionsEnabled && !person.accounted && (
                    <div className="relative" onClick={e => e.stopPropagation()}>
                      <Button
                        size="sm"
                        className="h-10 w-10 p-0 rounded-xl bg-amber-500 hover:bg-amber-600 text-white border-2 border-amber-400 flex items-center justify-center"
                        onClick={() => setOpenDropdownId(openDropdownId === person.id ? null : person.id)}
                        title="Mark with status option"
                        data-testid={`button-status-dropdown-${person.id}`}
                        disabled={statusOptionMutation.isPending}
                      >
                        <ChevronDown size={16} />
                      </Button>

                      {openDropdownId === person.id && (
                        <div className="absolute right-0 bottom-12 z-50 bg-white rounded-xl shadow-2xl border border-gray-200 min-w-[220px] overflow-hidden">
                          <div className="px-3 py-2 bg-amber-50 border-b border-amber-100">
                            <p className="text-xs font-bold text-amber-800 uppercase tracking-wide">Mark as — with reason</p>
                          </div>
                          {musterSettings.statusOptions.map(option => (
                            <button
                              key={option}
                              className="w-full text-left px-4 py-3 text-sm text-gray-800 hover:bg-amber-50 hover:text-amber-900 border-b border-gray-100 last:border-0 font-medium transition-colors"
                              onClick={() => statusOptionMutation.mutate({ personId: person.id, type: person.type, statusOption: option })}
                              disabled={statusOptionMutation.isPending}
                            >
                              {option}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Main SAFE / UNSAFE toggle button */}
                  <Button
                    size="lg"
                    className={`px-6 py-3 rounded-xl font-bold text-lg min-w-[120px] ${
                      person.accounted 
                        ? "bg-red-600 hover:bg-red-700 text-white border-2 border-red-400" 
                        : "bg-green-600 hover:bg-green-700 text-white border-2 border-green-400"
                    }`}
                    onClick={() => toggleAccountedStatus(person.id, person.type)}
                    data-testid={`button-toggle-${person.id}`}
                    disabled={toggleAccountedMutation.isPending}
                  >
                    {person.accounted ? (
                      <>
                        <XCircle className="mr-2" size={20} />
                        UNSAFE
                      </>
                    ) : (
                      <>
                        <CheckCircle className="mr-2" size={20} />
                        SAFE
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </div>
            </div>
          </div>
        ))}
      </div>

      {/* Emergency contacts footer */}
      <div className="bg-red-700 p-4 mt-8">
        <div className="text-center">
          <p className="text-red-200 text-sm mb-2">Emergency Services</p>
          <Button 
            className="bg-yellow-500 hover:bg-yellow-600 text-black font-bold py-3 px-8 rounded-xl text-xl"
            onClick={() => window.location.href = 'tel:999'}
          >
            <Phone className="mr-2" size={20} />
            CALL 999
          </Button>
        </div>
      </div>

      {/* Real-time indicator */}
      <div className="fixed bottom-4 right-4 bg-white/20 backdrop-blur rounded-full p-3">
        <div className="flex items-center space-x-2">
          <div className={`w-2 h-2 rounded-full ${wsConnected ? 'bg-green-400 animate-pulse' : 'bg-yellow-400'}`}></div>
          <span className="text-white text-xs font-medium">{wsConnected ? 'LIVE' : 'SYNC'}</span>
        </div>
      </div>
    </div>
  );
}
