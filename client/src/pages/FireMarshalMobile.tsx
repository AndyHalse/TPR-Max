import { useState, useEffect, useRef } from "react";
import {
  addToOutbox,
  flushOutbox,
  getOutboxCount,
  registerFireMarshalSW,
  clearMusterCache,
} from "@/lib/fireMarshalOffline";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import MusterQRScanner from "@/components/MusterQRScanner";
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
  Eye,
  EyeOff,
  Clock,
  Timer,
  Footprints,
  XCircle,
  FileText,
  Camera,
  X,
  Send,
  QrCode,
  List,
  Accessibility,
} from "lucide-react";

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
  statusOption?: string | null;
  needsEvacuationAssistance?: boolean;
}

interface MusterSettings {
  statusOptionsEnabled: boolean;
  statusOptions: string[];
}

interface PersonnelData {
  evacuationId: string | null;
  people: PersonOnSite[];
  totalOnSite: number;
  accountedFor: number;
  unaccounted: number;
  musterSettings?: MusterSettings;
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

/** Fetch with an 8-second abort timeout — throws AbortError on timeout, TypeError on network down. */
function fetchWithTimeout(url: string, opts: RequestInit = {}, ms = 8000): Promise<Response> {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), ms);
  return fetch(url, { ...opts, signal: ctrl.signal }).finally(() => clearTimeout(id));
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
  const [scanMode, setScanMode] = useState<'manual' | 'qr'>('manual');
  const [evacuationDetails, setEvacuationDetails] = useState<EvacuationDetails | null>(null);
  const [marshalZoneId, setMarshalZoneId] = useState<string | null>(null);
  const [showZoneSweep, setShowZoneSweep] = useState(false);
  const [showMyZoneOnly, setShowMyZoneOnly] = useState(false);
  const [sweepConfirmZone, setSweepConfirmZone] = useState<{ id: string; name: string; unaccountedCount: number } | null>(null);
  const [overrideReason, setOverrideReason] = useState("");
  // Status option dropdown: personId that currently has the dropdown open, or null
  const [openDropdownId, setOpenDropdownId] = useState<string | null>(null);
  // Fixed-position coords for the dropdown (avoids overflow-hidden clipping inside Cards)
  const [dropdownPos, setDropdownPos] = useState<{ top: number; right: number } | null>(null);

  // Note and Photo capture state
  const [showNoteDialog, setShowNoteDialog] = useState(false);
  const [noteText, setNoteText] = useState("");
  const [showPhotoPreview, setShowPhotoPreview] = useState(false);
  const [pendingPhotoData, setPendingPhotoData] = useState<string | null>(null);
  const [photoCaption, setPhotoCaption] = useState("");

  const [isOnline, setIsOnline] = useState(() => navigator.onLine);
  const [lastDataAt, setLastDataAt] = useState<Date | null>(null);
  const [pendingSyncCount, setPendingSyncCount] = useState(0);
  const [isDataStale, setIsDataStale] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const photoInputRef = useRef<HTMLInputElement | null>(null);

  // Authenticate using static URL ID
  useEffect(() => {
    if (urlId) {
      fetchWithTimeout(`/api/emergency/fire-marshal/${urlId}`)
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

  // Register service worker for offline support
  useEffect(() => {
    if (urlId) registerFireMarshalSW();
  }, [urlId]);

  // Online / offline state + outbox flush
  useEffect(() => {
    const handleOnline = async () => {
      setIsOnline(true);
      if (!urlId) return;
      try {
        const remaining = await flushOutbox({
          urlId,
          marshalName: marshalName || marshalInfo?.name || 'Fire Marshal',
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['/api/emergency/fire-marshal', urlId, 'personnel'] });
          },
        });
        setPendingSyncCount(remaining);
      } catch { /* ignore */ }
    };
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [urlId, marshalName, marshalInfo, queryClient]);

  // Track pending sync count on mount
  useEffect(() => {
    getOutboxCount().then(setPendingSyncCount).catch(() => {});
  }, []);

  // Stale-data detection — amber banner when last successful poll was >15 s ago and online
  useEffect(() => {
    if (!isOnline) { setIsDataStale(false); return; }
    const STALE_MS = 15_000;
    const check = () => {
      setIsDataStale(!!lastDataAt && Date.now() - lastDataAt.getTime() > STALE_MS);
    };
    check();
    const id = setInterval(check, 5_000);
    return () => clearInterval(id);
  }, [lastDataAt, isOnline]);

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
          evacuationId: activeEvacuationId || 'fire-marshal-standalone',
          credential: urlId,
          credentialType: 'fire-marshal',
        }));
      };

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          if (message.type === 'register_failed') {
            setWsConnected(false);
            return;
          }
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
      const response = await fetchWithTimeout(`/api/emergency/fire-marshal/${urlId}/personnel`);
      if (!response.ok) throw new Error('Failed to fetch personnel data');
      const data = await response.json();
      setLastDataAt(new Date());
      return data;
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

  // Update lastDataAt whenever personnel data arrives (online only)
  useEffect(() => {
    if (personnelData && isOnline) {
      setLastDataAt(new Date());
    }
  }, [personnelData, isOnline]);

  // When evacuation ends, clear cached muster data after 24h
  useEffect(() => {
    if (!activeEvacuationId && urlId) {
      const timer = setTimeout(() => clearMusterCache(), 24 * 60 * 60 * 1000);
      return () => clearTimeout(timer);
    }
  }, [activeEvacuationId, urlId]);

  // Check for active evacuation (legacy token auth only)
  const { data: activeEvacuation } = useQuery<ActiveEvacuationResponse>({
    queryKey: ["/api/emergency/active"],
    enabled: !!token && !urlId,
    staleTime: 10 * 1000,
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
      if (!navigator.onLine && urlId) {
        const markedAt = new Date().toISOString();
        await addToOutbox({
          personId,
          urlId,
          evacuationId: activeEvacuationId,
          marshalName: marshalName || marshalInfo?.name || 'Fire Marshal',
          markedAt,
        });
        setPendingSyncCount(c => c + 1);
        return { personId, queued: true, isAccountedFor: true };
      }
      const headers: HeadersInit = { "Content-Type": "application/json" };
      if (token) headers["X-Emergency-Token"] = token;
      else if (urlId) headers["X-Fire-Marshal-Id"] = urlId;
      const markedAt = new Date().toISOString();

      try {
        const response = await fetchWithTimeout(`/api/emergency/mark-safe/${personId}`, {
          method: "POST",
          headers,
          credentials: "include",
          body: JSON.stringify({
            musterPoint: "Safe Location",
            evacuationId: activeEvacuationId || 'standalone',
            marshalName,
            markedAt,
          }),
        });
        if (!response.ok) throw new Error("server");
        return response.json();
      } catch (err: any) {
        // Network / timeout → queue for later sync
        if ((err?.name === 'AbortError' || err instanceof TypeError) && urlId) {
          await addToOutbox({ personId, urlId, evacuationId: activeEvacuationId, marshalName: marshalName || marshalInfo?.name || 'Fire Marshal', markedAt });
          setPendingSyncCount(c => c + 1);
          return { personId, queued: true, isAccountedFor: true };
        }
        throw err;
      }
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

  // Mark safe with a status option (amber — e.g. "Working remotely / offsite")
  const markSafeWithOptionMutation = useMutation({
    mutationFn: async ({ personId, statusOption }: { personId: string; statusOption: string }) => {
      if (!navigator.onLine && urlId) {
        const markedAt = new Date().toISOString();
        await addToOutbox({
          personId,
          urlId,
          evacuationId: activeEvacuationId,
          marshalName: marshalName || marshalInfo?.name || 'Fire Marshal',
          statusOption,
          markedAt,
        });
        setPendingSyncCount(c => c + 1);
        return { personId, queued: true, isAccountedFor: true, statusOption };
      }
      const headers: HeadersInit = { "Content-Type": "application/json" };
      if (token) headers["X-Emergency-Token"] = token;
      else if (urlId) headers["X-Fire-Marshal-Id"] = urlId;

      const markedAt = new Date().toISOString();
      try {
        const response = await fetchWithTimeout(`/api/emergency/mark-safe/${personId}`, {
          method: "POST",
          headers,
          credentials: "include",
          body: JSON.stringify({
            musterPoint: "Safe Location",
            evacuationId: activeEvacuationId || 'standalone',
            marshalName,
            statusOption,
            markedAt,
          }),
        });
        if (!response.ok) throw new Error("server");
        return response.json();
      } catch (err: any) {
        if ((err?.name === 'AbortError' || err instanceof TypeError) && urlId) {
          await addToOutbox({ personId, urlId, evacuationId: activeEvacuationId, marshalName: marshalName || marshalInfo?.name || 'Fire Marshal', statusOption, markedAt });
          setPendingSyncCount(c => c + 1);
          return { personId, queued: true, isAccountedFor: true, statusOption };
        }
        throw err;
      }
    },
    onMutate: async ({ personId, statusOption }) => {
      await queryClient.cancelQueries({ queryKey: ['/api/emergency/fire-marshal', urlId, 'personnel'] });
      const previousData = queryClient.getQueryData(['/api/emergency/fire-marshal', urlId, 'personnel']);
      queryClient.setQueryData(
        ['/api/emergency/fire-marshal', urlId, 'personnel'],
        (old: any) => {
          if (!old?.people) return old;
          const updatedPeople = old.people.map((p: any) =>
            p.id === personId
              ? { ...p, isAccountedFor: true, accountedBy: marshalName, statusOption }
              : p
          );
          const accountedFor = updatedPeople.filter((p: any) => p.isAccountedFor).length;
          return { ...old, people: updatedPeople, accountedFor, unaccounted: old.totalOnSite - accountedFor };
        }
      );
      setOpenDropdownId(null);
      return { previousData };
    },
    onSuccess: (data, { statusOption }) => {
      if (data.evacuationId && !activeEvacuationId) setActiveEvacuationId(data.evacuationId);
      queryClient.setQueryData(
        ['/api/emergency/fire-marshal', urlId, 'personnel'],
        (old: any) => {
          if (!old?.people) return old;
          const updatedPeople = old.people.map((p: any) =>
            p.id === data.personId
              ? { ...p, isAccountedFor: true, accountedBy: marshalName, statusOption }
              : p
          );
          const accountedFor = updatedPeople.filter((p: any) => p.isAccountedFor).length;
          return { ...old, people: updatedPeople, accountedFor, unaccounted: old.totalOnSite - accountedFor };
        }
      );
      if (navigator.vibrate) navigator.vibrate(100);
    },
    onError: (_error, _vars, context: any) => {
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
      const markedAt = new Date().toISOString();

      // Fast path: offline → queue all
      if (!navigator.onLine && urlId) {
        for (const person of unaccounted) {
          await addToOutbox({ kind: 'mark-zone-safe', personId: person.id, urlId, evacuationId: activeEvacuationId, marshalName: resolvedName, markedAt });
        }
        setPendingSyncCount(c => c + unaccounted.length);
        return;
      }

      const headers: HeadersInit = { "Content-Type": "application/json" };
      if (token) headers["X-Emergency-Token"] = token;
      else if (urlId) headers["X-Fire-Marshal-Id"] = urlId;

      const failed: any[] = [];
      await Promise.all(
        unaccounted.map(async (person: any) => {
          try {
            await fetchWithTimeout(`/api/emergency/mark-safe/${person.id}`, {
              method: "POST",
              headers,
              body: JSON.stringify({ marshalName: resolvedName, musterPoint: myZone?.name || 'Muster Point', markedAt }),
              credentials: "include",
            });
          } catch {
            failed.push(person);
          }
        })
      );

      if (failed.length > 0 && urlId) {
        for (const person of failed) {
          await addToOutbox({ kind: 'mark-zone-safe', personId: person.id, urlId, evacuationId: activeEvacuationId, marshalName: resolvedName, markedAt });
        }
        setPendingSyncCount(c => c + failed.length);
      }
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

  // ── Compress a File to a base64 JPEG (max 900px wide, quality 0.72)
  const compressPhoto = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const MAX_W = 900;
          const scale = img.width > MAX_W ? MAX_W / img.width : 1;
          const canvas = document.createElement("canvas");
          canvas.width = Math.round(img.width * scale);
          canvas.height = Math.round(img.height * scale);
          const ctx = canvas.getContext("2d");
          if (!ctx) return reject(new Error("canvas unavailable"));
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL("image/jpeg", 0.72));
        };
        img.onerror = reject;
        img.src = e.target?.result as string;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

  // ── Add Note mutation (FM auth)
  const addNoteMutation = useMutation({
    mutationFn: async (text: string) => {
      const markedAt = new Date().toISOString();
      const resolvedMarshal = marshalName || marshalInfo?.name || 'Fire Marshal';

      // Fast path: offline → queue
      if (!navigator.onLine && urlId) {
        await addToOutbox({ kind: 'note', personId: '', urlId, evacuationId: activeEvacuationId, marshalName: resolvedMarshal, text, markedAt });
        setPendingSyncCount(c => c + 1);
        return { queued: true };
      }

      const headers: HeadersInit = { "Content-Type": "application/json" };
      if (token) headers["X-Emergency-Token"] = token;
      else if (urlId) headers["X-Fire-Marshal-Id"] = urlId;

      try {
        const response = await fetchWithTimeout("/api/emergency/evacuation-note", {
          method: "POST",
          headers,
          credentials: "include",
          body: JSON.stringify({ evacuationId: activeEvacuationId, noteText: text, markedAt }),
        });
        if (!response.ok) throw new Error("server");
        return response.json();
      } catch (err: any) {
        // Network / timeout → queue for later sync
        if ((err?.name === 'AbortError' || err instanceof TypeError) && urlId) {
          await addToOutbox({ kind: 'note', personId: '', urlId, evacuationId: activeEvacuationId, marshalName: resolvedMarshal, text, markedAt });
          setPendingSyncCount(c => c + 1);
          return { queued: true };
        }
        throw err;
      }
    },
    onSuccess: () => {
      toast({ title: "Note saved", description: "Added to the incident report." });
      setNoteText("");
      setShowNoteDialog(false);
    },
    onError: () => {
      toast({ title: "Could not save note", variant: "destructive" });
    },
  });

  // ── Add Photo mutation (FM auth)
  const addPhotoMutation = useMutation({
    mutationFn: async ({ photoData, caption }: { photoData: string; caption: string }) => {
      const headers: HeadersInit = { "Content-Type": "application/json" };
      if (token) headers["X-Emergency-Token"] = token;
      else if (urlId) headers["X-Fire-Marshal-Id"] = urlId;
      const response = await fetch("/api/emergency/evacuation-photo", {
        method: "POST",
        headers,
        credentials: "include",
        body: JSON.stringify({ evacuationId: activeEvacuationId, photoData, caption }),
      });
      if (!response.ok) throw new Error("Failed to save photo");
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Photo saved", description: "Added to the incident report." });
      setPendingPhotoData(null);
      setPhotoCaption("");
      setShowPhotoPreview(false);
    },
    onError: () => {
      toast({ title: "Could not save photo", variant: "destructive" });
    },
  });

  // ── Handle photo file selection
  const handlePhotoSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const compressed = await compressPhoto(file);
      setPendingPhotoData(compressed);
      setPhotoCaption("");
      setShowPhotoPreview(true);
    } catch {
      toast({ title: "Could not process photo", variant: "destructive" });
    }
    // Reset so same file can be re-selected
    e.target.value = "";
  };

  const toggleCard = (id: string) => {
    const next = new Set(expandedCards);
    if (next.has(id)) next.delete(id); else next.add(id);
    setExpandedCards(next);
  };

  // When the marshal has an assigned zone and showMyZoneOnly is enabled, filter to that zone only
  const hasZoneAssignment = !!marshalZoneId && zones.length > 0;

  const filteredPeople = (personnelData?.people?.filter(person => {
    const matchesSearch = (person.name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
                          (person.department || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
                          (person.company || '').toLowerCase().includes(searchQuery.toLowerCase());
    const matchesVisibility = showSafePeople || !person.isAccountedFor;
    const matchesZone = !hasZoneAssignment || !showMyZoneOnly || person.zoneId === marshalZoneId;
    return matchesSearch && matchesVisibility && matchesZone;
  }) || []).sort((a, b) => {
    const accA = a.isAccountedFor ? 1 : 0;
    const accB = b.isAccountedFor ? 1 : 0;
    if (accA !== accB) return accA - accB;
    const peepA = a.needsEvacuationAssistance ? 1 : 0;
    const peepB = b.needsEvacuationAssistance ? 1 : 0;
    return peepB - peepA;
  });

  const peepCount = (personnelData?.people || []).filter(p => p.needsEvacuationAssistance).length;
  const peepUnaccounted = (personnelData?.people || []).filter(p => p.needsEvacuationAssistance && !p.isAccountedFor).length;

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

  const musterSettings = personnelData?.musterSettings;

  return (
    <div
      className={`min-h-screen pb-24 overflow-x-hidden w-full max-w-full ${isEmergencyActive ? 'bg-red-50 dark:bg-red-950/20' : 'bg-orange-50 dark:bg-orange-950/20'}`}
      onClick={() => { if (openDropdownId) { setOpenDropdownId(null); setDropdownPos(null); } }}
    >

      {/* ── Stale data banner (online but polls failing >15s) ───────── */}
      {isOnline && isDataStale && pendingSyncCount === 0 && (
        <div className="sticky top-0 z-40 w-full overflow-x-hidden flex items-center gap-2 px-4 py-2 text-sm font-semibold bg-amber-400 text-amber-900 shadow-sm">
          <AlertTriangle className="flex-shrink-0 w-4 h-4" />
          <span>
            Data may be out of date
            {lastDataAt
              ? ` — last updated ${Math.round((Date.now() - lastDataAt.getTime()) / 1000)}s ago`
              : ''}
          </span>
        </div>
      )}

      {/* ── Offline / Sync-pending banner ──────────────────────────────── */}
      {(!isOnline || pendingSyncCount > 0) && (
        <div
          className={`sticky top-0 z-40 w-full overflow-x-hidden flex items-center justify-between gap-2 px-4 py-2 text-sm font-semibold shadow-sm ${
            !isOnline
              ? 'bg-amber-500 text-white'
              : 'bg-blue-600 text-white'
          }`}
        >
          <span className="flex items-center gap-2 min-w-0">
            {!isOnline ? (
              <>
                <svg className="flex-shrink-0 w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 5.636a9 9 0 010 12.728M15.536 8.464a5 5 0 010 7.072M6.343 6.343a9 9 0 000 12.728m2.829-9.9a5 5 0 000 7.072M12 12h.01" />
                </svg>
                <span className="truncate">
                  OFFLINE — showing last-known list
                  {lastDataAt
                    ? ` from ${lastDataAt.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false })}`
                    : ''}
                </span>
              </>
            ) : (
              <>
                <svg className="flex-shrink-0 w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
                <span>Syncing {pendingSyncCount} queued action{pendingSyncCount !== 1 ? 's' : ''}…</span>
              </>
            )}
          </span>
          {pendingSyncCount > 0 && (
            <span className="flex-shrink-0 rounded-full bg-white/20 px-2 py-0.5 text-xs">
              {pendingSyncCount} pending
            </span>
          )}
        </div>
      )}

      {/* Sweep confirmation dialog */}
      {sweepConfirmZone && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4 overflow-hidden">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full overflow-x-hidden shadow-2xl">
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

      {/* Hidden camera input */}
      <input
        ref={photoInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handlePhotoSelected}
      />

      {/* Note dialog overlay */}
      {showNoteDialog && (
        <div className="fixed inset-0 z-[100] flex flex-col bg-black/80 overflow-hidden" onClick={() => { setShowNoteDialog(false); setNoteText(""); }}>
          <div
            className="mt-auto bg-white rounded-t-2xl px-4 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-2xl w-full max-w-full overflow-x-hidden"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-base font-bold text-gray-900 flex items-center gap-2 min-w-0">
                <FileText className="h-5 w-5 text-red-600 flex-shrink-0" />
                <span className="truncate">Add Evacuation Note</span>
              </h2>
              <button onClick={() => { setShowNoteDialog(false); setNoteText(""); }} className="text-gray-400 hover:text-gray-600 p-1 flex-shrink-0 ml-2">
                <X className="h-5 w-5" />
              </button>
            </div>
            <p className="text-xs text-gray-500 mb-3">This note will appear in the incident report with a timestamp.</p>
            <textarea
              autoFocus
              value={noteText}
              onChange={e => setNoteText(e.target.value)}
              placeholder="e.g. Visitor refused to evacuate assembly point B, escorted by FM..."
              className="w-full border border-gray-300 rounded-xl p-3 text-sm text-gray-900 resize-none focus:outline-none focus:ring-2 focus:ring-red-500"
              rows={4}
              maxLength={1000}
            />
            <div className="flex items-center justify-between mt-1 mb-3">
              <span className="text-xs text-gray-400">{noteText.length}/1000</span>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => { setShowNoteDialog(false); setNoteText(""); }}
                className="flex-1 min-w-0 py-3 rounded-xl border border-gray-300 text-gray-700 font-semibold text-sm"
              >
                Cancel
              </button>
              <button
                onClick={() => noteText.trim() && addNoteMutation.mutate(noteText.trim())}
                disabled={!noteText.trim() || addNoteMutation.isPending}
                className="flex-1 min-w-0 py-3 rounded-xl bg-red-600 text-white font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-50"
              >
                <Send className="h-4 w-4 flex-shrink-0" />
                <span className="truncate">{addNoteMutation.isPending ? "Saving…" : "Save Note"}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Photo preview + caption dialog */}
      {showPhotoPreview && pendingPhotoData && (
        <div className="fixed inset-0 z-[100] flex flex-col bg-black/90 overflow-hidden" onClick={() => { setShowPhotoPreview(false); setPendingPhotoData(null); }}>
          <div
            className="mt-auto bg-white rounded-t-2xl px-4 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-2xl w-full max-w-full overflow-x-hidden"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-base font-bold text-gray-900 flex items-center gap-2 min-w-0">
                <Camera className="h-5 w-5 text-red-600 flex-shrink-0" />
                <span className="truncate">Save Photo to Report</span>
              </h2>
              <button onClick={() => { setShowPhotoPreview(false); setPendingPhotoData(null); }} className="text-gray-400 hover:text-gray-600 p-1 flex-shrink-0 ml-2">
                <X className="h-5 w-5" />
              </button>
            </div>
            <img src={pendingPhotoData} alt="Preview" className="w-full max-h-44 object-contain rounded-xl border border-gray-200 mb-3 bg-gray-50" />
            <input
              type="text"
              value={photoCaption}
              onChange={e => setPhotoCaption(e.target.value)}
              placeholder="Optional caption (e.g. Exit B blocked by debris)"
              className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-red-500 mb-3"
              maxLength={200}
            />
            <div className="flex gap-3">
              <button
                onClick={() => { setShowPhotoPreview(false); setPendingPhotoData(null); }}
                className="flex-1 min-w-0 py-3 rounded-xl border border-gray-300 text-gray-700 font-semibold text-sm"
              >
                Discard
              </button>
              <button
                onClick={() => pendingPhotoData && addPhotoMutation.mutate({ photoData: pendingPhotoData, caption: photoCaption })}
                disabled={addPhotoMutation.isPending}
                className="flex-1 min-w-0 py-3 rounded-xl bg-red-600 text-white font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-50"
              >
                <Send className="h-4 w-4 flex-shrink-0" />
                <span className="truncate">{addPhotoMutation.isPending ? "Saving…" : "Save Photo"}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className={`sticky top-0 z-50 w-full overflow-x-hidden text-white shadow-lg ${isEmergencyActive ? 'bg-red-600' : 'bg-orange-600'}`}>
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
        {/* Quick-capture row — only during active evacuation */}
        {isEmergencyActive && activeEvacuationId && (
          <div className="flex border-t border-white/20 w-full overflow-hidden">
            <button
              className="flex-1 min-w-0 flex items-center justify-center gap-1.5 py-2.5 text-sm font-semibold text-white bg-white/10 hover:bg-white/20 active:bg-white/30 transition-colors"
              onClick={() => { setNoteText(""); setShowNoteDialog(true); }}
            >
              <FileText className="h-4 w-4 flex-shrink-0" />
              <span className="truncate">Add Note</span>
            </button>
            <div className="w-px flex-shrink-0 bg-white/20" />
            <button
              className="flex-1 min-w-0 flex items-center justify-center gap-1.5 py-2.5 text-sm font-semibold text-white bg-white/10 hover:bg-white/20 active:bg-white/30 transition-colors"
              onClick={() => photoInputRef.current?.click()}
            >
              <Camera className="h-4 w-4 flex-shrink-0" />
              <span className="truncate">Take Photo</span>
            </button>
          </div>
        )}
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
          <div className="flex-shrink-0 text-right min-w-[3.5rem] max-w-[5rem]">
            <p className={`text-xl font-black leading-tight ${isEmergencyActive ? (displayData?.unaccounted === 0 ? 'text-green-600' : 'text-red-600') : 'text-orange-400'}`}>
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
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <MapPin size={14} className="flex-shrink-0" />
              <span className="truncate">
                {showMyZoneOnly
                  ? `Zone: ${zones.find(z => z.id === marshalZoneId)?.name || 'My Zone'}`
                  : `Zone: ${zones.find(z => z.id === marshalZoneId)?.name || 'assigned'} — all`}
              </span>
            </div>
            <button
              onClick={() => setShowMyZoneOnly(!showMyZoneOnly)}
              className={`text-xs px-2 py-1 rounded-full font-semibold border flex-shrink-0 whitespace-nowrap ${showMyZoneOnly ? 'bg-white/20 text-white border-white/40' : 'bg-blue-100 text-blue-700 border-blue-300 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-700'}`}
            >
              {showMyZoneOnly ? 'Show all' : 'My zone only'}
            </button>
          </div>
        </div>
      )}


      {/* PEEP alert banner — shown whenever PEEP people are on-site */}
      {peepCount > 0 && (
        <div className="px-4 pb-2">
          <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-amber-50 border-2 border-amber-400">
            <div className="w-9 h-9 flex-shrink-0 rounded-xl bg-amber-200 flex items-center justify-center">
              <Accessibility className="text-amber-700" size={18} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-amber-800">
                {peepCount} PEEP person{peepCount !== 1 ? 's' : ''} on-site
              </p>
              <p className="text-xs text-amber-700">
                {peepUnaccounted > 0
                  ? `${peepUnaccounted} still unaccounted — prioritise evacuation assistance`
                  : 'All PEEP individuals are accounted for'}
              </p>
            </div>
            {peepUnaccounted > 0 && (
              <span className="flex-shrink-0 text-2xl font-black text-amber-700">{peepUnaccounted}</span>
            )}
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

      {/* Scan mode toggle — only during an active emergency */}
      {isEmergencyActive && (
        <div className="px-4 pb-3">
          <div className="flex gap-2 p-1 bg-gray-100 dark:bg-gray-800 rounded-xl">
            <button
              onClick={() => setScanMode('manual')}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold transition-all ${
                scanMode === 'manual'
                  ? 'bg-white dark:bg-gray-700 shadow text-gray-900 dark:text-white'
                  : 'text-gray-500 dark:text-gray-400'
              }`}
              data-testid="toggle-manual-mode"
            >
              <List className="h-4 w-4" />
              Manual List
            </button>
            <button
              onClick={() => setScanMode('qr')}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold transition-all ${
                scanMode === 'qr'
                  ? 'bg-green-600 shadow text-white'
                  : 'text-gray-500 dark:text-gray-400'
              }`}
              data-testid="toggle-qr-mode"
            >
              <QrCode className="h-4 w-4" />
              QR Scan
            </button>
          </div>
        </div>
      )}

      {/* QR Scanner — takes over the list area */}
      {isEmergencyActive && scanMode === 'qr' ? (
        <MusterQRScanner
          urlId={urlId}
          marshalName={marshalName || marshalInfo?.name || 'Fire Marshal'}
          onSwitchToManual={() => setScanMode('manual')}
          onPersonMarkedSafe={(personId, personName) => {
            queryClient.invalidateQueries({ queryKey: ['/api/emergency/accountability'] });
          }}
        />
      ) : (
        <>
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
                  person.needsEvacuationAssistance
                    ? person.isAccountedFor
                      ? 'border-amber-400 bg-amber-50/60 opacity-80'
                      : 'border-amber-500 bg-amber-50 shadow-md'
                    : person.isAccountedFor
                    ? 'border-green-300 bg-green-50/50 opacity-70'
                    : 'border-red-300 bg-white shadow-md'
                }`}
              >
                {/* PEEP header strip */}
                {person.needsEvacuationAssistance && (
                  <div className="flex items-center gap-1.5 px-3 py-1 bg-amber-400">
                    <Accessibility size={12} className="text-amber-900 flex-shrink-0" />
                    <span className="text-amber-900 text-[10px] font-black uppercase tracking-wide">Requires Evacuation Assistance (PEEP)</span>
                  </div>
                )}
                <div className="p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                        <span className="font-bold text-base">{person.name}</span>
                        {person.needsEvacuationAssistance && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-amber-200 text-amber-900">
                            <Accessibility size={10} />PEEP
                          </span>
                        )}
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
                      {person.isAccountedFor && person.statusOption && (
                        <span className="inline-block mt-0.5 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">
                          {person.statusOption}
                        </span>
                      )}
                    </div>
                    {/* Mark Safe button — for unaccounted people */}
                    {!person.isAccountedFor && (
                      <div className="flex items-center flex-shrink-0 relative">
                        <Button
                          className="bg-green-600 hover:bg-green-700 text-white font-bold h-12 px-4 text-sm rounded-r-none"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (!marshalName) {
                              toast({ title: "Name Required", description: "Please enter your name first", variant: "destructive" });
                              return;
                            }
                            markSafeMutation.mutate({ personId: person.id });
                          }}
                          disabled={!marshalName}
                          data-testid={`button-mark-safe-mobile-${person.id}`}
                        >
                          <CheckCircle2 className="h-4 w-4 mr-1" />Safe
                        </Button>
                        {musterSettings?.statusOptionsEnabled && (
                          <Button
                            className="bg-amber-500 hover:bg-amber-600 text-white font-bold h-12 px-2 text-sm rounded-l-none border-l border-amber-400"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (!marshalName) {
                                toast({ title: "Name Required", description: "Please enter your name first", variant: "destructive" });
                                return;
                              }
                              if (openDropdownId === person.id) {
                                setOpenDropdownId(null);
                                setDropdownPos(null);
                              } else {
                                const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                                setDropdownPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
                                setOpenDropdownId(person.id);
                              }
                            }}
                            disabled={!marshalName}
                            data-testid={`button-status-option-${person.id}`}
                          >
                            <ChevronDown className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
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
        </>
      )}

      {/* Admin-only notice — Fire Marshals cannot end the emergency */}
      {isEmergencyActive && (
        <div className="fixed bottom-0 left-0 right-0 p-3 bg-gray-900 border-t border-gray-700 shadow-lg z-50">
          <div className="flex items-center justify-center gap-2 text-gray-300 text-sm">
            <Shield className="h-4 w-4 text-gray-400 flex-shrink-0" />
            <span>To end this emergency, a manager must log in to the main system</span>
          </div>
        </div>
      )}

      {/* Fixed-position status option dropdown — rendered outside Cards to avoid overflow-hidden clipping */}
      {openDropdownId && dropdownPos && musterSettings?.statusOptionsEnabled && (
        <div
          className="fixed z-[9999] bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-2xl min-w-[220px]"
          style={{ top: dropdownPos.top, right: dropdownPos.right }}
          onClick={(e) => e.stopPropagation()}
        >
          <p className="text-[11px] text-gray-500 px-3 pt-2.5 pb-1 font-semibold uppercase tracking-wide border-b border-gray-100 dark:border-gray-700">Mark as accounted — reason:</p>
          {(musterSettings.statusOptions || []).map((option) => (
            <button
              key={option}
              className="w-full text-left px-4 py-3 text-sm text-gray-800 dark:text-gray-200 hover:bg-amber-50 dark:hover:bg-amber-900/30 hover:text-amber-800 dark:hover:text-amber-200 transition-colors"
              onClick={() => {
                markSafeWithOptionMutation.mutate({ personId: openDropdownId, statusOption: option });
                setOpenDropdownId(null);
                setDropdownPos(null);
              }}
            >
              {option}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
