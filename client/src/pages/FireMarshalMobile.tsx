import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { 
  Shield, 
  Users, 
  AlertTriangle, 
  CheckCircle2, 
  Search, 
  RefreshCw, 
  MapPin,
  UserCheck,
  Siren,
  ChevronDown,
  ChevronRight,
  LogOut,
  Eye,
  EyeOff,
  Clock,
  Timer,
  Footprints,
  XCircle,
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface PersonOnSite {
  id: string;
  name: string;
  type: 'staff' | 'visitor' | 'contractor' | 'member';
  department?: string;
  company?: string;
  location: string;
  zoneId?: string | null;
  isAccountedFor: boolean;
  accountedBy?: string;
  accountedAt?: string;
  musterPoint?: string;
}

interface PersonnelData {
  evacuationId: string | null;
  people: PersonOnSite[];
  totalOnSite: number;
  accountedFor: number;
  unaccounted: number;
}

interface ActiveEvacuationResponse {
  active: boolean;
  evacuationId?: string;
  startedAt?: string;
}

interface EvacuationDetails {
  evacuationId: string;
  startedAt: string;
  status: string;
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
  sweptAt: string;
  hasUnaccountedAtTime: boolean;
  overrideReason?: string | null;
}

interface FireMarshalMobileProps {
  urlId?: string;
  token?: string;
}

interface MarshalInfo {
  id: string;
  name: string;
  department: string;
  email: string;
  customerId: string;
  companyName?: string;
}

export default function FireMarshalMobile({ urlId, token }: FireMarshalMobileProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [activeEvacuationId, setActiveEvacuationId] = useState<string | null>(null);
  const [marshalName, setMarshalName] = useState("");
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set());
  const [marshalInfo, setMarshalInfo] = useState<MarshalInfo | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [wsConnected, setWsConnected] = useState(false);
  const [showSafePeople, setShowSafePeople] = useState(false);
  const [evacuationDetails, setEvacuationDetails] = useState<EvacuationDetails | null>(null);
  const [marshalZoneId, setMarshalZoneId] = useState<string | null>(null);
  const [showZoneSweep, setShowZoneSweep] = useState(false);
  const [showMyZoneOnly, setShowMyZoneOnly] = useState(false);
  const [sweepConfirmZone, setSweepConfirmZone] = useState<{ id: string; name: string; unaccountedCount: number } | null>(null);
  const [overrideReason, setOverrideReason] = useState("");
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Authenticate using static URL ID
  useEffect(() => {
    if (urlId) {
      fetch(`/api/emergency/fire-marshal/${urlId}`)
        .then(res => {
          if (!res.ok) throw new Error('Authentication failed');
          return res.json();
        })
        .then(data => {
          setMarshalInfo(data.marshal);
          setMarshalName(data.marshal.name);
          if (data.evacuation) {
            setActiveEvacuationId(data.evacuation.evacuationId);
            setEvacuationDetails({
              evacuationId: data.evacuation.evacuationId,
              startedAt: data.evacuation.startedAt,
              status: data.evacuation.status
            });
          }
        })
        .catch(() => {
          setAuthError('Invalid or expired Fire Marshal link');
        });
    }
  }, [urlId]);

  // WebSocket connection for real-time updates
  useEffect(() => {
    if (!marshalInfo?.customerId) return;

    const connectWebSocket = () => {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/ws/muster`;
      const ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        setWsConnected(true);
        ws.send(JSON.stringify({
          type: 'register',
          customerId: marshalInfo.customerId,
          evacuationId: activeEvacuationId || 'fire-marshal-standalone'
        }));
      };

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          if (message.type === 'muster_update') {
            // Silently patch the one person — no toast, no full list refetch
            if (message.personId !== undefined && message.isAccountedFor !== undefined) {
              queryClient.setQueryData(
                ['/api/emergency/fire-marshal', urlId, 'personnel'],
                (old: any) => {
                  if (!old?.people) return old;
                  const updatedPeople = old.people.map((p: any) =>
                    p.id === message.personId
                      ? { ...p, isAccountedFor: message.isAccountedFor, accountedBy: message.personName }
                      : p
                  );
                  const accountedFor = updatedPeople.filter((p: any) => p.isAccountedFor).length;
                  return { ...old, people: updatedPeople, accountedFor, unaccounted: old.totalOnSite - accountedFor };
                }
              );
            } else {
              queryClient.invalidateQueries({ queryKey: ['/api/emergency/fire-marshal', urlId, 'personnel'] });
            }
          }
          if (message.type === 'personnel_update') {
            queryClient.invalidateQueries({ queryKey: ['/api/emergency/fire-marshal', urlId, 'personnel'] });
          }
        } catch {
          // ignore parse errors
        }
      };

      ws.onerror = () => setWsConnected(false);

      ws.onclose = () => {
        setWsConnected(false);
        if (marshalInfo?.customerId) {
          reconnectTimeoutRef.current = setTimeout(connectWebSocket, 3000);
        }
      };

      wsRef.current = ws;
    };

    connectWebSocket();

    return () => {
      if (wsRef.current) { wsRef.current.close(); wsRef.current = null; }
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
    };
  }, [marshalInfo?.customerId, activeEvacuationId, urlId, queryClient, toast]);

  // Fetch on-site personnel data (polls every 5s — also returns evacuationId when active)
  const { data: personnelData, isLoading: isLoadingPersonnel } = useQuery<PersonnelData>({
    queryKey: ['/api/emergency/fire-marshal', urlId, 'personnel'],
    enabled: !!urlId,
    refetchInterval: 5000,
    queryFn: async () => {
      const response = await fetch(`/api/emergency/fire-marshal/${urlId}/personnel`);
      if (!response.ok) throw new Error('Failed to fetch personnel data');
      return response.json();
    }
  });

  // Keep activeEvacuationId in sync with the polling data
  useEffect(() => {
    if (personnelData?.evacuationId && personnelData.evacuationId !== activeEvacuationId) {
      setActiveEvacuationId(personnelData.evacuationId);
    } else if (!personnelData?.evacuationId && activeEvacuationId) {
      // Evacuation ended — clear local state
      setActiveEvacuationId(null);
      setEvacuationDetails(null);
    }
  }, [personnelData?.evacuationId]);

  // Check for active evacuation (legacy token auth only)
  const { data: activeEvacuation } = useQuery<ActiveEvacuationResponse>({
    queryKey: ["/api/emergency/active"],
    enabled: !!token && !urlId,
    refetchInterval: 5000,
    queryFn: async () => {
      const response = await fetch('/api/emergency/active', {
        headers: { 'X-Emergency-Token': token! }
      });
      if (!response.ok) throw new Error('Failed to check evacuation status');
      return response.json();
    }
  });

  useEffect(() => {
    if (activeEvacuation?.evacuationId) {
      setActiveEvacuationId(activeEvacuation.evacuationId);
    }
  }, [activeEvacuation]);

  // Load marshal name from localStorage (legacy token auth)
  useEffect(() => {
    if (!urlId) {
      const savedName = localStorage.getItem('fireMarshallName');
      if (savedName) setMarshalName(savedName);
    }
  }, [urlId]);

  useEffect(() => {
    if (marshalName && !urlId) {
      localStorage.setItem('fireMarshallName', marshalName);
    }
  }, [marshalName, urlId]);

  // Fetch zones for this fire marshal (URL ID auth)
  const { data: zoneData } = useQuery<{ zones: Zone[]; marshalZoneId: string | null }>({
    queryKey: ['/api/emergency/fire-marshal', urlId, 'zones'],
    enabled: !!urlId,
    queryFn: async () => {
      const res = await fetch(`/api/emergency/fire-marshal/${urlId}/zones`);
      if (!res.ok) return { zones: [], marshalZoneId: null };
      return res.json();
    },
    refetchInterval: false,
  });

  useEffect(() => {
    if (zoneData?.marshalZoneId) setMarshalZoneId(zoneData.marshalZoneId);
  }, [zoneData]);

  const zones = zoneData?.zones || [];

  // Fetch zone sweeps (only when evacuation is active)
  const { data: zoneSweeps = [] } = useQuery<ZoneSweep[]>({
    queryKey: ['/api/emergency/zone-sweeps', activeEvacuationId, urlId],
    enabled: !!activeEvacuationId && !!urlId,
    queryFn: async () => {
      const res = await fetch(`/api/emergency/zone-sweeps/${activeEvacuationId}`, {
        headers: { 'X-Fire-Marshal-Id': urlId! },
        credentials: 'include',
      });
      if (!res.ok) return [];
      return res.json();
    },
    refetchInterval: 15000,
  });

  const sweptZoneMap = new globalThis.Map<string, ZoneSweep>(zoneSweeps.map(s => [s.zoneId, s]));

  // Mark safe mutation
  const markSafeMutation = useMutation({
    mutationFn: async ({ personId }: { personId: string }) => {
      const headers: HeadersInit = { "Content-Type": "application/json" };
      if (token) headers["X-Emergency-Token"] = token;
      else if (urlId) headers["X-Fire-Marshal-Id"] = urlId;

      const response = await fetch(`/api/emergency/mark-safe/${personId}`, {
        method: "POST",
        headers,
        credentials: "include",
        body: JSON.stringify({
          musterPoint: "Safe Location",
          evacuationId: activeEvacuationId || 'standalone',
          marshalName
        })
      });
      if (!response.ok) throw new Error("Failed to mark person as safe");
      return response.json();
    },
    onMutate: async ({ personId }) => {
      // Cancel in-flight fetches so they don't clobber the optimistic state
      await queryClient.cancelQueries({ queryKey: ['/api/emergency/fire-marshal', urlId, 'personnel'] });
      const previousData = queryClient.getQueryData(['/api/emergency/fire-marshal', urlId, 'personnel']);
      // Instantly flip this person to safe — button disappears before the server replies
      queryClient.setQueryData(
        ['/api/emergency/fire-marshal', urlId, 'personnel'],
        (old: any) => {
          if (!old?.people) return old;
          const updatedPeople = old.people.map((p: any) =>
            p.id === personId
              ? { ...p, isAccountedFor: true, accountedBy: marshalName }
              : p
          );
          const accountedFor = updatedPeople.filter((p: any) => p.isAccountedFor).length;
          return { ...old, people: updatedPeople, accountedFor, unaccounted: old.totalOnSite - accountedFor };
        }
      );
      return { previousData };
    },
    onSuccess: (data, _vars, _context) => {
      if (data.evacuationId && !activeEvacuationId) {
        setActiveEvacuationId(data.evacuationId);
      }
      if (data.personId) {
        const next = new Set(expandedCards);
        next.delete(data.personId);
        setExpandedCards(next);
      }
      // Confirm the optimistic state with the server's actual values
      queryClient.setQueryData(
        ['/api/emergency/fire-marshal', urlId, 'personnel'],
        (old: any) => {
          if (!old?.people) return old;
          const updatedPeople = old.people.map((p: any) =>
            p.id === data.personId
              ? { ...p, isAccountedFor: true, accountedBy: marshalName }
              : p
          );
          const accountedFor = updatedPeople.filter((p: any) => p.isAccountedFor).length;
          return { ...old, people: updatedPeople, accountedFor, unaccounted: old.totalOnSite - accountedFor };
        }
      );
      if (navigator.vibrate) navigator.vibrate(200);
    },
    onError: (_error, _vars, context: any) => {
      // Roll back the optimistic update on failure
      if (context?.previousData) {
        queryClient.setQueryData(['/api/emergency/fire-marshal', urlId, 'personnel'], context.previousData);
      }
      toast({ title: "Error", description: "Failed to update status", variant: "destructive" });
    }
  });

  // Bulk mark all visible unaccounted people as safe (FM auth)
  const markZoneSafeMutation = useMutation({
    mutationFn: async () => {
      const unaccounted = filteredPeople.filter((p: any) => !p.isAccountedFor);
      if (unaccounted.length === 0) return;
      const resolvedName = marshalName || marshalInfo?.name || 'Fire Marshal';
      const headers: HeadersInit = { "Content-Type": "application/json" };
      if (token) headers["X-Emergency-Token"] = token;
      else if (urlId) headers["X-Fire-Marshal-Id"] = urlId;
      await Promise.all(
        unaccounted.map((person: any) =>
          fetch(`/api/emergency/mark-safe/${person.id}`, {
            method: "POST",
            headers,
            body: JSON.stringify({ marshalName: resolvedName, musterPoint: myZone?.name || 'Muster Point' }),
            credentials: "include",
          })
        )
      );
    },
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ['/api/emergency/fire-marshal', urlId, 'personnel'] });
      const previousData = queryClient.getQueryData(['/api/emergency/fire-marshal', urlId, 'personnel']);
      const resolvedName = marshalName || marshalInfo?.name || 'Fire Marshal';
      const unaccountedIds = new Set(filteredPeople.filter((p: any) => !p.isAccountedFor).map((p: any) => p.id));
      queryClient.setQueryData(
        ['/api/emergency/fire-marshal', urlId, 'personnel'],
        (old: any) => {
          if (!old?.people) return old;
          const updatedPeople = old.people.map((p: any) =>
            unaccountedIds.has(p.id) ? { ...p, isAccountedFor: true, accountedBy: resolvedName } : p
          );
          const accountedFor = updatedPeople.filter((p: any) => p.isAccountedFor).length;
          return { ...old, people: updatedPeople, accountedFor, unaccounted: old.totalOnSite - accountedFor };
        }
      );
      return { previousData };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/emergency/fire-marshal', urlId, 'personnel'] });
    },
    onError: (_err, _vars, context: any) => {
      if (context?.previousData) {
        queryClient.setQueryData(['/api/emergency/fire-marshal', urlId, 'personnel'], context.previousData);
      }
      toast({ title: "Error", description: "Failed to mark zone safe", variant: "destructive" });
    }
  });

  // Unmark a person — reverses mark-safe (also uses FM auth headers)
  const unmarkSafeMutation = useMutation({
    mutationFn: async ({ personId }: { personId: string }) => {
      const headers: HeadersInit = { "Content-Type": "application/json" };
      if (token) headers["X-Emergency-Token"] = token;
      else if (urlId) headers["X-Fire-Marshal-Id"] = urlId;
      const response = await fetch(`/api/emergency/unmark-safe/${personId}`, {
        method: "POST",
        headers,
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to unmark person");
      return response.json();
    },
    onMutate: async ({ personId }) => {
      await queryClient.cancelQueries({ queryKey: ['/api/emergency/fire-marshal', urlId, 'personnel'] });
      const previousData = queryClient.getQueryData(['/api/emergency/fire-marshal', urlId, 'personnel']);
      queryClient.setQueryData(
        ['/api/emergency/fire-marshal', urlId, 'personnel'],
        (old: any) => {
          if (!old?.people) return old;
          const updatedPeople = old.people.map((p: any) =>
            p.id === personId ? { ...p, isAccountedFor: false, accountedBy: undefined } : p
          );
          const accountedFor = updatedPeople.filter((p: any) => p.isAccountedFor).length;
          return { ...old, people: updatedPeople, accountedFor, unaccounted: old.totalOnSite - accountedFor };
        }
      );
      return { previousData };
    },
    onSuccess: (data) => {
      queryClient.setQueryData(
        ['/api/emergency/fire-marshal', urlId, 'personnel'],
        (old: any) => {
          if (!old?.people) return old;
          const updatedPeople = old.people.map((p: any) =>
            p.id === data.personId ? { ...p, isAccountedFor: false, accountedBy: undefined } : p
          );
          const accountedFor = updatedPeople.filter((p: any) => p.isAccountedFor).length;
          return { ...old, people: updatedPeople, accountedFor, unaccounted: old.totalOnSite - accountedFor };
        }
      );
    },
    onError: (_err, _vars, context: any) => {
      if (context?.previousData) {
        queryClient.setQueryData(['/api/emergency/fire-marshal', urlId, 'personnel'], context.previousData);
      }
      toast({ title: "Error", description: "Failed to unmark person", variant: "destructive" });
    }
  });

  // Complete evacuation mutation
  const completeEvacuationMutation = useMutation({
    mutationFn: async ({ checkOutMode }: { checkOutMode: 'keep_checked_in' | 'check_out_all' }) => {
      const headers: HeadersInit = { "Content-Type": "application/json" };
      if (token) headers["X-Emergency-Token"] = token;
      else if (urlId) headers["X-Fire-Marshal-Id"] = urlId;

      const response = await fetch('/api/emergency/complete-evacuation', {
        method: 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify({ evacuationId: activeEvacuationId, checkOutMode })
      });
      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to complete evacuation');
      }
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/emergency/fire-marshal', urlId, 'personnel'] });
      queryClient.invalidateQueries({ queryKey: ['/api/emergency/active'] });
      queryClient.invalidateQueries({ queryKey: ['/api/muster'] });
      queryClient.invalidateQueries({ queryKey: ['/api/staff'] });
      queryClient.invalidateQueries({ queryKey: ['/api/visitors'] });
      queryClient.invalidateQueries({ queryKey: ['/api/contractors'] });
      queryClient.invalidateQueries({ queryKey: ['/api/stats'] });
      queryClient.invalidateQueries({ queryKey: ['/api/activity/recent'] });
      toast({ title: "Evacuation Completed", description: data.message });
      setActiveEvacuationId(null);
      setEvacuationDetails(null);
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to complete evacuation", variant: "destructive" });
    }
  });

  // Sweep zone mutation
  const sweepZoneMutation = useMutation({
    mutationFn: async ({ zoneId, zoneName, overrideReason: reason }: { zoneId: string; zoneName: string; overrideReason?: string }) => {
      const response = await fetch('/api/emergency/sweep-zone', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Fire-Marshal-Id': urlId || '' },
        credentials: 'include',
        body: JSON.stringify({ urlId, evacuationId: activeEvacuationId, zoneId, zoneName, overrideReason: reason }),
      });
      if (!response.ok) throw new Error('Failed to record zone sweep');
      return response.json();
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['/api/emergency/zone-sweeps', activeEvacuationId, urlId] });
      toast({ title: "Zone Cleared", description: `${vars.zoneName} marked as physically swept.` });
      setSweepConfirmZone(null);
      setOverrideReason("");
    },
    onError: () => {
      toast({ title: "Failed", description: "Could not record zone sweep", variant: "destructive" });
    }
  });

  const handleSweepZone = (zone: Zone, unaccountedCount: number) => {
    if (unaccountedCount > 0) {
      setSweepConfirmZone({ id: zone.id, name: zone.name, unaccountedCount });
    } else {
      sweepZoneMutation.mutate({ zoneId: zone.id, zoneName: zone.name });
    }
  };

  const toggleCard = (id: string) => {
    const next = new Set(expandedCards);
    if (next.has(id)) next.delete(id); else next.add(id);
    setExpandedCards(next);
  };

  // When the marshal has an assigned zone and showMyZoneOnly is enabled, filter to that zone only
  const hasZoneAssignment = !!marshalZoneId && zones.length > 0;

  const filteredPeople = personnelData?.people?.filter(person => {
    const matchesSearch = (person.name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
                          (person.department || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
                          (person.company || '').toLowerCase().includes(searchQuery.toLowerCase());
    const matchesVisibility = showSafePeople || !person.isAccountedFor;
    const matchesZone = !hasZoneAssignment || !showMyZoneOnly || person.zoneId === marshalZoneId;
    return matchesSearch && matchesVisibility && matchesZone;
  }) || [];

  // Zone stats for sweep panel (uses zoneId from personnel data)
  const zoneStats = zones.map(zone => {
    const inZone = (personnelData?.people || []).filter((p: PersonOnSite) => p.zoneId === zone.id);
    const unaccounted = inZone.filter((p: PersonOnSite) => !p.isAccountedFor).length;
    return { ...zone, total: inZone.length, unaccounted, swept: sweptZoneMap.has(zone.id), sweepRecord: sweptZoneMap.get(zone.id) };
  });

  // My-zone specific stats for the process guide
  const myZone = zones.find(z => z.id === marshalZoneId) || null;
  const myZonePeople = hasZoneAssignment
    ? (personnelData?.people || []).filter(p => p.zoneId === marshalZoneId)
    : (personnelData?.people || []);
  const myZoneAccounted = myZonePeople.filter(p => p.isAccountedFor).length;
  const myZoneTotal = myZonePeople.length;
  const myZoneUnaccounted = myZoneTotal - myZoneAccounted;
  const myZoneSweep = marshalZoneId ? sweptZoneMap.get(marshalZoneId) : undefined;

  if (authError) {
    return (
      <div className="min-h-screen bg-red-50 flex items-center justify-center p-4">
        <Card className="w-full max-w-md border-red-200">
          <CardContent className="p-8 text-center">
            <AlertTriangle className="h-16 w-16 mx-auto text-red-500 mb-4" />
            <h1 className="text-xl font-bold text-red-600 mb-2">Authentication Failed</h1>
            <p className="text-muted-foreground">{authError}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const isEmergencyActive = !!activeEvacuationId;
  const displayData = personnelData;

  return (
    <div className={`min-h-screen pb-24 ${isEmergencyActive ? 'bg-red-50 dark:bg-red-950/20' : 'bg-orange-50 dark:bg-orange-950/20'}`}>

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
            <p className="text-gray-600 text-sm mb-4">Provide a reason to mark the zone as swept anyway.</p>
            <Input
              value={overrideReason}
              onChange={e => setOverrideReason(e.target.value)}
              placeholder="e.g. zone confirmed empty, person absent today"
              className="mb-4 text-gray-900"
            />
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => { setSweepConfirmZone(null); setOverrideReason(""); }}>Cancel</Button>
              <Button
                className="flex-1 bg-amber-500 hover:bg-amber-600 text-white font-bold"
                onClick={() => sweepZoneMutation.mutate({ zoneId: sweepConfirmZone.id, zoneName: sweepConfirmZone.name, overrideReason: overrideReason || `${sweepConfirmZone.unaccountedCount} person(s) unaccounted` })}
                disabled={sweepZoneMutation.isPending}
              >
                <Footprints className="mr-2" size={16} />
                {sweepZoneMutation.isPending ? "Recording..." : "Mark Swept"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className={`sticky top-0 z-50 text-white shadow-lg ${isEmergencyActive ? 'bg-red-600' : 'bg-orange-600'}`}>
        <div className={`p-3 ${isEmergencyActive ? 'animate-pulse' : ''}`}>
          <div className="flex items-center gap-2">
            {isEmergencyActive ? <Siren className="h-6 w-6 flex-shrink-0" /> : <Shield className="h-6 w-6 flex-shrink-0" />}
            <div className="flex-1 min-w-0">
              <h1 className="text-lg font-bold">{isEmergencyActive ? 'EVACUATION ACTIVE' : 'FIRE MARSHAL PANEL'}</h1>
              {marshalInfo?.companyName && <div className="text-xs font-medium opacity-90">{marshalInfo.companyName}</div>}
              {isEmergencyActive && evacuationDetails?.startedAt && (
                <div className="text-xs mt-1 flex items-center gap-1">
                  <Timer className="h-3 w-3 flex-shrink-0" />
                  <span>{Math.floor((Date.now() - new Date(evacuationDetails.startedAt).getTime()) / 60000)} min elapsed</span>
                </div>
              )}
            </div>
            <Badge
              variant={wsConnected ? "default" : "secondary"}
              className={`text-xs flex-shrink-0 ${wsConnected ? 'bg-green-500 animate-pulse' : 'bg-gray-400'}`}
            >
              {wsConnected ? '● LIVE' : '○ SYNC'}
            </Badge>
            <Button size="sm" variant="secondary" onClick={() => window.location.reload()} className="bg-white/20 hover:bg-white/30 flex-shrink-0">
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Name input — only shown when not URL-authenticated (no marshalInfo) */}
      {!marshalInfo && (
        <div className="sticky top-16 z-40 bg-yellow-400 p-3 shadow-md">
          <div className="flex items-center gap-2">
            <UserCheck className="h-5 w-5 text-yellow-900 flex-shrink-0" />
            <Input
              placeholder="Enter your name to enable marking people safe..."
              value={marshalName}
              onChange={(e) => setMarshalName(e.target.value)}
              className="text-base font-medium bg-white border-yellow-600"
              data-testid="input-marshal-name-mobile"
            />
          </div>
          {!marshalName && <p className="text-xs text-yellow-900 mt-1 ml-7">⚠️ Enter your name to enable "Mark Safe" buttons</p>}
        </div>
      )}

      {/* ── PROCESS STEPS ───────────────────────────────────────────────────── */}
      <div className="px-4 pt-4 pb-2 space-y-2">

        {/* Step 1 — Emergency Active (always green tick) */}
        <div className={`flex items-center gap-3 p-3 rounded-xl border ${isEmergencyActive ? 'bg-green-50 border-green-200' : 'bg-orange-50 border-orange-200'}`}>
          <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${isEmergencyActive ? 'bg-green-500' : 'bg-orange-400'}`}>
            {isEmergencyActive ? <CheckCircle2 size={18} className="text-white" /> : <Shield size={18} className="text-white" />}
          </div>
          <div className="flex-1 min-w-0">
            {isEmergencyActive ? (
              <>
                <p className="font-bold text-sm text-green-800">Emergency Alert Active</p>
                {marshalInfo && <p className="text-xs text-green-600">{marshalInfo.name}{myZone ? ` · ${myZone.name}` : ''}</p>}
                {evacuationDetails?.startedAt && <p className="text-xs text-green-600">{Math.floor((Date.now() - new Date(evacuationDetails.startedAt).getTime()) / 60000)} min elapsed</p>}
              </>
            ) : (
              <>
                <p className="font-bold text-sm text-orange-800">Standby — No Active Emergency</p>
                {marshalInfo && <p className="text-xs text-orange-600">{marshalInfo.name}{myZone ? ` · ${myZone.name}` : ''}</p>}
                <p className="text-xs text-orange-600">This page updates automatically when an emergency is activated</p>
              </>
            )}
          </div>
          <div className="flex-shrink-0 text-right">
            <p className={`text-2xl font-black ${isEmergencyActive ? (displayData?.unaccounted === 0 ? 'text-green-600' : 'text-red-600') : 'text-orange-400'}`}>
              {isEmergencyActive ? `${displayData?.accountedFor || 0}/${displayData?.totalOnSite || 0}` : '--'}
            </p>
            <p className="text-[10px] text-gray-500">safe/total</p>
          </div>
        </div>

        {/* Step 2 — Account for Your Zone */}
        {isEmergencyActive && (
          <div className={`flex items-start gap-3 p-3 rounded-xl border ${myZoneUnaccounted === 0 && myZoneTotal > 0 ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
            <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${myZoneUnaccounted === 0 && myZoneTotal > 0 ? 'bg-green-500' : 'bg-red-600'}`}>
              {myZoneUnaccounted === 0 && myZoneTotal > 0
                ? <CheckCircle2 size={18} className="text-white" />
                : <span className="text-white font-black text-sm">2</span>}
            </div>
            <div className="flex-1 min-w-0">
              <p className={`font-bold text-sm ${myZoneUnaccounted === 0 && myZoneTotal > 0 ? 'text-green-800' : 'text-red-800'}`}>
                {hasZoneAssignment ? `Account for ${myZone?.name || 'Your Zone'}` : 'Account for All Personnel'}
              </p>
              <div className="flex items-center gap-2 mt-1.5">
                <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${myZoneUnaccounted === 0 ? 'bg-green-500' : 'bg-red-500'}`}
                    style={{ width: `${myZoneTotal > 0 ? Math.round((myZoneAccounted / myZoneTotal) * 100) : 0}%` }}
                  />
                </div>
                <span className={`text-sm font-bold flex-shrink-0 ${myZoneUnaccounted === 0 ? 'text-green-700' : 'text-red-700'}`}>
                  {myZoneAccounted}/{myZoneTotal}
                </span>
              </div>
              {myZoneUnaccounted > 0 && (
                <p className="text-xs text-red-700 mt-1">↓ Mark each person safe in the list below</p>
              )}
              {myZoneUnaccounted === 0 && myZoneTotal > 0 && (
                <p className="text-xs text-green-700 mt-1">✓ All accounted for in your zone</p>
              )}
            </div>
          </div>
        )}

        {/* Step 3 — Physically Sweep Your Zone */}
        {isEmergencyActive && hasZoneAssignment && (
          <div className={`flex items-center gap-3 p-3 rounded-xl border ${myZoneSweep ? 'bg-green-50 border-green-200' : 'bg-amber-50 border-amber-200'}`}>
            <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${myZoneSweep ? 'bg-green-500' : 'bg-amber-500'}`}>
              {myZoneSweep ? <CheckCircle2 size={18} className="text-white" /> : <Footprints size={17} className="text-white" />}
            </div>
            <div className="flex-1 min-w-0">
              <p className={`font-bold text-sm ${myZoneSweep ? 'text-green-800' : 'text-amber-800'}`}>
                {myZoneSweep ? `Zone Swept ✓` : `Physically Sweep ${myZone?.name || 'Your Zone'}`}
              </p>
              <p className="text-xs text-gray-500">
                {myZoneSweep
                  ? `${new Date(myZoneSweep.sweptAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })} by ${myZoneSweep.sweptByName}`
                  : 'Walk the zone physically to confirm it is empty'}
              </p>
            </div>
            {!myZoneSweep && (
              <Button
                size="sm"
                className="bg-amber-500 hover:bg-amber-600 text-white font-bold flex-shrink-0"
                onClick={() => myZone && handleSweepZone(myZone, myZoneUnaccounted)}
                disabled={sweepZoneMutation.isPending}
              >
                <Footprints size={13} className="mr-1" />
                Swept
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Zone filter banner — shown when marshal has an assigned zone */}
      {hasZoneAssignment && (
        <div className="px-4 pb-2">
          <div className={`flex items-center justify-between gap-2 px-3 py-2 rounded-xl text-sm font-medium border ${showMyZoneOnly ? 'bg-blue-600 text-white border-blue-700' : 'bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-700'}`}>
            <div className="flex items-center gap-2">
              <MapPin size={14} className="flex-shrink-0" />
              <span>
                {showMyZoneOnly
                  ? `My zone: ${zones.find(z => z.id === marshalZoneId)?.name || 'My Zone'} only`
                  : `My zone: ${zones.find(z => z.id === marshalZoneId)?.name || 'assigned'} — showing all`}
              </span>
            </div>
            <button
              onClick={() => setShowMyZoneOnly(!showMyZoneOnly)}
              className={`text-xs px-2 py-0.5 rounded-full font-semibold border flex-shrink-0 ${showMyZoneOnly ? 'bg-white/20 text-white border-white/40' : 'bg-blue-100 text-blue-700 border-blue-300 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-700'}`}
            >
              {showMyZoneOnly ? 'Show all' : 'My zone only'}
            </button>
          </div>
        </div>
      )}


      {/* Action bar — Mark Zone Safe + Show/Hide Safe toggle */}
      {isEmergencyActive && (
        <div className="px-4 pb-2 flex gap-2 flex-wrap">
          {filteredPeople.some((p: any) => !p.isAccountedFor) && (
            <Button
              variant="outline"
              className="flex-1 text-sm font-semibold border-green-400 text-green-700 hover:bg-green-50"
              onClick={() => {
                if (!marshalName && !marshalInfo) {
                  toast({ title: "Name Required", description: "Please enter your name first", variant: "destructive" });
                  return;
                }
                markZoneSafeMutation.mutate();
              }}
              disabled={markZoneSafeMutation.isPending}
              data-testid="button-mark-zone-safe-mobile"
            >
              <CheckCircle2 className="h-4 w-4 mr-2 flex-shrink-0" />
              {markZoneSafeMutation.isPending
                ? 'Marking...'
                : hasZoneAssignment && showMyZoneOnly
                  ? `Mark ${myZone?.name || 'Zone'} Safe`
                  : 'Mark All Safe'}
            </Button>
          )}
          {(personnelData?.accountedFor || 0) > 0 && (
            <Button
              variant="outline"
              className="flex-1 text-sm font-semibold"
              onClick={() => setShowSafePeople(prev => !prev)}
              data-testid="button-toggle-safe-mobile"
            >
              {showSafePeople
                ? <><EyeOff className="h-4 w-4 mr-2 flex-shrink-0" />Hide Safe ({personnelData?.accountedFor})</>
                : <><Eye className="h-4 w-4 mr-2 flex-shrink-0" />Show Safe ({personnelData?.accountedFor})</>
              }
            </Button>
          )}
        </div>
      )}

      {/* Search */}
      <div className="px-4 pb-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search people..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 bg-white"
            data-testid="input-search-mobile"
          />
        </div>
      </div>

      {/* People List */}
      <div className="px-4 space-y-3">
        {isLoadingPersonnel && filteredPeople.length === 0 && (
          <div className="text-center py-8 text-gray-500">
            <RefreshCw className="h-8 w-8 mx-auto mb-2 animate-spin opacity-50" />
            <p>Loading personnel...</p>
          </div>
        )}

        {filteredPeople.map((person) => (
          <Card
            key={person.id}
            className={`overflow-hidden transition-all ${
              person.isAccountedFor
                ? 'border-green-300 bg-green-50/50 opacity-70'
                : 'border-red-300 bg-white shadow-md'
            }`}
          >
            <div className="p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                    <span className="font-bold text-base">{person.name}</span>
                    {person.isAccountedFor && (
                      <Badge variant="outline" className="bg-green-100 text-green-700 border-green-300 text-xs">✓ SAFE</Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-wrap text-xs text-gray-500">
                    <Badge variant="secondary" className={`text-xs ${
                      person.type === 'member' ? 'bg-purple-100 text-purple-800' :
                      person.type === 'contractor' ? 'bg-yellow-100 text-yellow-800' :
                      person.type === 'staff' ? 'bg-blue-100 text-blue-800' :
                      'bg-green-100 text-green-800'
                    }`}>
                      {person.type.charAt(0).toUpperCase() + person.type.slice(1)}
                    </Badge>
                    <span>{person.department || person.company}</span>
                  </div>
                  {person.isAccountedFor && person.accountedBy && (
                    <p className="text-[11px] text-green-600 mt-0.5">Confirmed by {person.accountedBy}</p>
                  )}
                </div>
                {/* Mark Safe button — for unaccounted people */}
                {!person.isAccountedFor && (
                  <Button
                    className="bg-green-600 hover:bg-green-700 text-white font-bold h-12 px-4 flex-shrink-0 text-sm"
                    onClick={() => {
                      if (!marshalName) {
                        toast({ title: "Name Required", description: "Please enter your name first", variant: "destructive" });
                        return;
                      }
                      markSafeMutation.mutate({ personId: person.id });
                    }}
                    disabled={!marshalName}
                    data-testid={`button-mark-safe-mobile-${person.id}`}
                  >
                    <><CheckCircle2 className="h-4 w-4 mr-1" />Safe</>
                  </Button>
                )}
                {/* Unmark button — only visible when safe people are revealed */}
                {person.isAccountedFor && showSafePeople && (
                  <Button
                    variant="outline"
                    className="border-red-300 text-red-600 hover:bg-red-50 font-semibold h-10 px-3 flex-shrink-0 text-sm"
                    onClick={() => unmarkSafeMutation.mutate({ personId: person.id })}
                    data-testid={`button-unmark-safe-mobile-${person.id}`}
                  >
                    <XCircle className="h-4 w-4 mr-1" />Unmark
                  </Button>
                )}
              </div>
            </div>
          </Card>
        ))}
      </div>

      {filteredPeople.length === 0 && !isLoadingPersonnel && (
        <div className="text-center py-8 text-gray-500">
          <AlertTriangle className="h-12 w-12 mx-auto mb-2 opacity-50" />
          <p>{searchQuery ? 'No people found matching your search' : 'No unaccounted personnel'}</p>
        </div>
      )}

      {/* Complete Evacuation — only shown when emergency is active */}
      {isEmergencyActive && (
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-white dark:bg-gray-900 border-t shadow-lg z-50">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                className="w-full bg-blue-600 hover:bg-blue-700 text-white h-14 text-lg font-bold"
                size="lg"
                data-testid="button-complete-evacuation-mobile"
              >
                <CheckCircle2 className="h-6 w-6 mr-2" />
                Complete Evacuation
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent className="max-w-md">
              <AlertDialogHeader>
                <AlertDialogTitle className="text-xl">Complete Evacuation</AlertDialogTitle>
                <AlertDialogDescription className="text-base space-y-4">
                  {displayData && displayData.unaccounted > 0 && (
                    <div className="bg-yellow-50 border-l-4 border-yellow-400 p-3 mb-3">
                      <p className="text-yellow-800 font-medium">
                        ⚠️ Warning: {displayData.unaccounted} {displayData.unaccounted === 1 ? 'person is' : 'people are'} still unaccounted for
                      </p>
                    </div>
                  )}
                  <p>How would you like to complete this evacuation?</p>
                  <div className="space-y-2">
                    <p className="text-sm text-gray-600"><strong>Keep Everyone Checked In:</strong> Personnel remain checked in and can return to work immediately.</p>
                    <p className="text-sm text-gray-600"><strong>Check Out All Safe Personnel:</strong> Only people marked safe will be checked out. They'll need to check in again when returning.</p>
                  </div>
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter className="flex-col sm:flex-col gap-2">
                <AlertDialogAction
                  className="w-full bg-green-600 hover:bg-green-700 h-12"
                  onClick={(e) => { e.preventDefault(); completeEvacuationMutation.mutate({ checkOutMode: 'keep_checked_in' }); }}
                  disabled={completeEvacuationMutation.isPending}
                  data-testid="button-keep-checked-in"
                >
                  <UserCheck className="h-5 w-5 mr-2" />
                  Keep Everyone Checked In
                </AlertDialogAction>
                <AlertDialogAction
                  className="w-full bg-orange-600 hover:bg-orange-700 h-12"
                  onClick={(e) => { e.preventDefault(); completeEvacuationMutation.mutate({ checkOutMode: 'check_out_all' }); }}
                  disabled={completeEvacuationMutation.isPending}
                  data-testid="button-check-out-all"
                >
                  <LogOut className="h-5 w-5 mr-2" />
                  Check Out All Safe Personnel
                </AlertDialogAction>
                <AlertDialogCancel className="w-full h-12" data-testid="button-cancel-complete">Cancel</AlertDialogCancel>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      )}
    </div>
  );
}
