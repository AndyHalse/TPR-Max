import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
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
}

interface Zone {
  id: string;
  name: string;
  color: string;
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
      // Auto-activate zone sweep if marshal has a zone assigned
      setActiveZoneFilter(zoneData.marshalZoneId);
      setZoneSweepMode(true);
    }
  }, [zoneData]);

  const zones = zoneData?.zones || [];

  // WebSocket connection for real-time updates
  useEffect(() => {
    if (!isValidToken || !customerId || !evacuationId) return;

    const connectWebSocket = () => {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const host = window.location.host;
      const wsUrl = `${protocol}//${host}/ws/muster`;
      
      console.log('Connecting to WebSocket:', wsUrl, 'Host:', host);
      const ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        console.log('WebSocket connected');
        setWsConnected(true);
        
        ws.send(JSON.stringify({
          type: 'register',
          customerId,
          evacuationId
        }));
      };

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          console.log('WebSocket message received:', message);
          
          if (message.type === 'muster_update') {
            queryClient.invalidateQueries({ queryKey: ["/api/emergency/muster", token] });
            
            const statusText = message.isAccountedFor ? 'SAFE' : 'UNSAFE';
            toast({
              title: "Real-time Update",
              description: `${message.personName} marked as ${statusText}`,
            });
          }
        } catch (error) {
          console.error('Error parsing WebSocket message:', error);
        }
      };

      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        setWsConnected(false);
      };

      ws.onclose = () => {
        console.log('WebSocket disconnected');
        setWsConnected(false);
        
        reconnectTimeoutRef.current = setTimeout(() => {
          console.log('Attempting to reconnect WebSocket...');
          connectWebSocket();
        }, 3000);
      };

      wsRef.current = ws;
    };

    connectWebSocket();

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
  }, [isValidToken, customerId, evacuationId, token, toast, queryClient]);

  // Fetch muster list
  const { data: musterList = [], isLoading, refetch } = useQuery<MusterListItem[]>({
    queryKey: ["/api/emergency/muster", token],
    enabled: isValidToken && !!token,
    refetchInterval: 30000,
    retry: 3,
  });

  // Toggle accounted status mutation
  const toggleAccountedMutation = useMutation({
    mutationFn: async ({ personId, type }: { personId: string, type: string }) => {
      const response = await fetch(`/api/emergency/toggle-accounted/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ personId, type }),
        credentials: 'include'
      });
      
      if (!response.ok) {
        throw new Error('Failed to update status');
      }
      
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
      toast({
        title: "Update Failed",
        description: error.message || "Failed to update status",
        variant: "destructive",
      });
    },
  });

  // Compute zone sweep stats
  const zoneStats = zones.map(zone => {
    const inZone = musterList.filter(p => p.zoneId === zone.id);
    const accountedInZone = inZone.filter(p => p.accounted).length;
    const isCleared = inZone.length > 0 && accountedInZone === inZone.length;
    return {
      ...zone,
      total: inZone.length,
      accounted: accountedInZone,
      cleared: isCleared,
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
  );

  const totalPeople = musterList.length;
  const accountedFor = musterList.filter(p => p.accounted).length;
  const unaccountedFor = totalPeople - accountedFor;

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

  return (
    <div className="min-h-screen bg-red-600 text-white">
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
                  {zoneStats.filter(z => z.cleared).length}/{zoneStats.length} zones cleared
                </span>
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

                {/* Zone buttons */}
                {zoneStats.map(zone => (
                  <button
                    key={zone.id}
                    onClick={() => setActiveZoneFilter(zone.id === activeZoneFilter ? null : zone.id)}
                    className={`w-full flex items-center justify-between p-2 rounded-lg text-sm font-medium transition-colors ${
                      activeZoneFilter === zone.id
                        ? 'bg-white text-red-800'
                        : zone.cleared
                        ? 'bg-green-700/50 text-white hover:bg-green-700/70'
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
                ))}

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
                <span className={stat?.cleared ? 'text-green-300' : 'text-yellow-300'}>
                  {stat?.cleared ? '✅ CLEARED' : `${stat?.accounted}/${stat?.total} safe`}
                </span>
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
            className={`p-4 rounded-xl border-2 ${
              person.accounted 
                ? 'bg-green-600/20 border-green-400' 
                : 'bg-red-500/20 border-red-300'
            }`}
            data-testid={`person-${person.id}`}
          >
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
                      <span title="Requires Evacuation Assistance (PEEP)" className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold bg-purple-200 text-purple-900 border border-purple-400">
                        ♿ PEEP
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
