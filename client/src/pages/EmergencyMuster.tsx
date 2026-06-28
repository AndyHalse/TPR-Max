import { useState, useEffect, useRef, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest, getSessionToken } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import GlassCard from "@/components/GlassCard";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { 
  AlertTriangle, 
  Users, 
  CheckCircle, 
  XCircle, 
  Search,
  Clock,
  Phone,
  Mail,
  Download,
  Siren,
  HardHat,
  ExternalLink,
  Copy,
  MapPin,
  Map,
  QrCode,
  Timer,
  ShieldAlert,
  BellRing,
  Footprints,
  ClipboardList,
  X,
  Eye,
  EyeOff,
  Info,
  Accessibility,
  Loader2,
  Settings,
  ChevronDown,
  ChevronUp,
  Trash2,
  Plus,
  Save,
} from "lucide-react";
import { formatElapsed, formatTimeLocale } from "@/utils/formatDate";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface MusterListItem {
  id: string;
  name: string;
  type: 'staff' | 'visitor' | 'contractor' | 'member';
  department?: string;
  company?: string;
  checkedInAt: string;
  location: string;
  accounted: boolean;
  zoneId?: string;
  zoneName?: string;
  needsEvacuationAssistance?: boolean;
  hasEmail?: boolean;
}

interface Zone {
  id: string;
  name: string;
  color: string;
  description: string | null;
  displayOrder: number;
  mapX: number | null;
  mapY: number | null;
  isActive: boolean;
}

interface ActiveEvacuation {
  active: boolean;
  evacuationId?: string;
  customerId?: string;
  isDrill?: boolean;
  startedAt?: string;
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

const DEFAULT_MUSTER_OPTIONS = ['Location unknown', 'Working remotely / offsite', 'Sent to another location'];

interface MusterSettings {
  statusOptionsEnabled: boolean;
  statusOptions: string[];
}

export default function EmergencyMuster() {
  const [searchTerm, setSearchTerm] = useState("");
  const [typeFilter, setTypeFilter] = useState<'all' | 'staff' | 'visitor' | 'contractor' | 'member'>('all');
  const [emergencyActive, setEmergencyActive] = useState(false);
  const [emergencyPhase, setEmergencyPhase] = useState<'idle' | 'send_alert' | 'active'>('idle');
  const [isDrillMode, setIsDrillMode] = useState(false);
  const [lastEvacuationId, setLastEvacuationId] = useState<string | null>(null);
  const [wsConnected, setWsConnected] = useState(false);
  const [selectedZones, setSelectedZones] = useState<Set<string>>(new Set());
  const [showZoneSelector, setShowZoneSelector] = useState(false);
  const [emergencyStartTime, setEmergencyStartTime] = useState<Date | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [showQrFor, setShowQrFor] = useState<string | null>(null);
  const [showSafePeople, setShowSafePeople] = useState(false);
  // Muster settings panel state
  const [showSettings, setShowSettings] = useState(false);
  const [localEnabled, setLocalEnabled] = useState<boolean | null>(null);
  const [localOptions, setLocalOptions] = useState<string[] | null>(null);
  const [newOption, setNewOption] = useState("");
  const { toast } = useToast();
  const { t } = useTranslation(['muster', 'common']);
  const queryClient = useQueryClient();
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Emergency timer
  useEffect(() => {
    if (!emergencyActive || !emergencyStartTime) { setElapsedSeconds(0); return; }
    const interval = setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - emergencyStartTime.getTime()) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [emergencyActive, emergencyStartTime]);


  const { data: musterList = [], isLoading } = useQuery<MusterListItem[]>({
    queryKey: ["/api/muster"],
    staleTime: 10 * 1000,
    refetchInterval: 5000, // Poll every 5 seconds for live updates
  });

  // Check for active evacuation
  const { data: activeEvacuation } = useQuery<ActiveEvacuation>({
    queryKey: ["/api/evacuation/status"],
    staleTime: 10 * 1000,
    refetchInterval: 10000,
  });

  const { data: staffList = [] } = useQuery<any[]>({
    queryKey: ["/api/staff"],
  });

  const { data: zones = [] } = useQuery<Zone[]>({
    queryKey: ["/api/zones"],
  });

  const { data: companySettings } = useQuery<any>({
    queryKey: ["/api/settings"],
  });

  const { data: musterSettings } = useQuery<MusterSettings>({
    queryKey: ["/api/muster/settings"],
    staleTime: 10 * 1000,
  });

  const saveSettingsMutation = useMutation({
    mutationFn: async (payload: { statusOptionsEnabled: boolean; statusOptions: string[] }) => {
      return apiRequest("PUT", "/api/muster/settings", payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/muster/settings"] });
      toast({ title: t('common:settingsSaved'), description: t('muster:musterStatusUpdated') });
      setLocalEnabled(null);
      setLocalOptions(null);
    },
    onError: () => {
      toast({ title: t('common:saveFailed'), description: t('muster:saveFailedDesc'), variant: "destructive" });
    },
  });

  const effectiveEnabled = localEnabled !== null ? localEnabled : (musterSettings?.statusOptionsEnabled ?? false);
  const effectiveOptions = localOptions !== null ? localOptions : (musterSettings?.statusOptions ?? DEFAULT_MUSTER_OPTIONS);

  const handleAddOption = () => {
    const trimmed = newOption.trim();
    if (!trimmed || effectiveOptions.includes(trimmed)) return;
    setLocalOptions([...effectiveOptions, trimmed]);
    setNewOption("");
  };
  const handleRemoveOption = (idx: number) => {
    const updated = effectiveOptions.filter((_, i) => i !== idx);
    setLocalOptions(updated);
  };
  const handleOptionChange = (idx: number, val: string) => {
    const updated = effectiveOptions.map((o, i) => (i === idx ? val : o));
    setLocalOptions(updated);
  };

  const zoneMapUrl = companySettings?.zoneMapUrl ?? null;

  const activeZones = useMemo(() => zones.filter(z => z.isActive), [zones]);

  // Zone sweeps for the active evacuation
  const activeEvacuationId = activeEvacuation?.evacuationId;
  const { data: zoneSweeps = [] } = useQuery<ZoneSweep[]>({
    queryKey: ["/api/emergency/zone-sweeps", activeEvacuationId],
    enabled: !!activeEvacuationId,
    queryFn: async () => {
      const res = await fetch(`/api/emergency/zone-sweeps/${activeEvacuationId}`, {
        credentials: 'include'
      });
      if (!res.ok) return [];
      return res.json();
    },
    staleTime: 10 * 1000,
    refetchInterval: 15000,
  });
  const sweptZoneMap = useMemo(() => {
    const m = new globalThis.Map<string, ZoneSweep>();
    for (const s of zoneSweeps) m.set(s.zoneId, s);
    return m;
  }, [zoneSweeps]);

  const zonePersonnelCounts = useMemo(() => {
    const counts: Record<string, { total: number; safe: number }> = {};
    for (const zone of activeZones) {
      const inZone = musterList.filter(p => p.zoneId === zone.id);
      counts[zone.id] = { total: inZone.length, safe: inZone.filter(p => p.accounted).length };
    }
    return counts;
  }, [activeZones, musterList]);

  const fireMarshals = staffList.filter((s: any) => s.isFireMarshal && s.fireMarshalUrlId);

  const hasActiveEvacuation = activeEvacuation?.active || false;

  // Sync drill mode from backend state so page reload / multi-session shows correct amber banner
  useEffect(() => {
    if (activeEvacuation?.active && activeEvacuation.isDrill !== undefined) {
      setIsDrillMode(activeEvacuation.isDrill);
    }
  }, [activeEvacuation?.active, activeEvacuation?.isDrill]);

  // Sync emergencyPhase with the server's live evacuation state.
  // Goes idle → active on page load when an evacuation is already running.
  // Goes active → idle when the evacuation ends (from this tab or another).
  useEffect(() => {
    if (activeEvacuation === undefined) return; // still loading
    if (activeEvacuation?.active === true && emergencyPhase === 'idle') {
      setEmergencyPhase('active');
      setEmergencyActive(true);
      // Use the real server start time so the timer is accurate even after
      // a page refresh or when joining mid-emergency from another session.
      if (activeEvacuation.startedAt) {
        setEmergencyStartTime(new Date(activeEvacuation.startedAt));
      } else {
        setEmergencyStartTime(new Date());
      }
    } else if (activeEvacuation?.active === false && emergencyPhase === 'active') {
      setEmergencyPhase('idle');
      setEmergencyActive(false);
      setEmergencyStartTime(null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeEvacuation?.active]);

  const toggleZone = (zoneId: string) => {
    setSelectedZones(prev => {
      const next = new Set(prev);
      if (next.has(zoneId)) {
        next.delete(zoneId);
      } else {
        next.add(zoneId);
      }
      return next;
    });
  };

  const clearZoneSelection = () => {
    setSelectedZones(new Set());
  };

  // WebSocket connection for real-time updates (always connected for personnel changes)
  useEffect(() => {
    const connectWebSocket = () => {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const host = window.location.host;
      const wsUrl = `${protocol}//${host}/ws/muster`;
      const ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        setWsConnected(true);
        const sessionToken = getSessionToken();
        ws.send(JSON.stringify({
          type: 'register',
          customerId: activeEvacuation?.customerId || '',
          evacuationId: activeEvacuation?.evacuationId || 'muster-standby',
          credential: sessionToken || '',
          credentialType: 'session',
        }));
      };

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          
          if (message.type === 'muster_update') {
            // Patch just the one person silently — no toast, no full list refetch.
            // This fires for all clients (including the one that made the change),
            // but since own-changes are already handled by onSuccess the patch is a no-op for them.
            // For remote changes (another fire marshal device) this keeps the list live.
            if (message.personId !== undefined && message.isAccountedFor !== undefined) {
              queryClient.setQueryData(["/api/muster"], (old: any[] | undefined) => {
                if (!old) return old;
                return old.map(person =>
                  person.id === message.personId
                    ? { ...person, accounted: message.isAccountedFor }
                    : person
                );
              });
            } else {
              // Fallback: full refetch if the message doesn't carry the expected fields
              queryClient.invalidateQueries({ queryKey: ["/api/muster"] });
            }
          }
          
          if (message.type === 'personnel_update') {
            queryClient.invalidateQueries({ queryKey: ["/api/muster"] });
          }
        } catch {
          // Silently ignore malformed WebSocket messages
        }
      };

      ws.onerror = () => {
        setWsConnected(false);
      };

      ws.onclose = () => {
        setWsConnected(false);
        reconnectTimeoutRef.current = setTimeout(connectWebSocket, 3000);
      };

      wsRef.current = ws;
    };

    connectWebSocket();

    // Cleanup on unmount or when evacuation ends
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
  }, [hasActiveEvacuation, activeEvacuation?.evacuationId, activeEvacuation?.customerId, toast, queryClient]);

  // Mutation to toggle accounted status — with optimistic update for instant UI response
  const toggleAccountedMutation = useMutation({
    mutationFn: async ({ personId, type }: { personId: string, type: string }) => {
      const response = await apiRequest("POST", `/api/muster/${personId}/toggle`, { type });
      return await response.json();
    },
    onMutate: async ({ personId }) => {
      // Cancel in-flight refetches so they don't clobber the optimistic state
      await queryClient.cancelQueries({ queryKey: ["/api/muster"] });
      // Snapshot for rollback
      const previousData = queryClient.getQueryData<any[]>(["/api/muster"]);
      // Instantly flip in cache — UI responds before server replies
      queryClient.setQueryData(["/api/muster"], (old: any[] | undefined) => {
        if (!old) return old;
        return old.map(person =>
          person.id === personId
            ? { ...person, accounted: !person.accounted }
            : person
        );
      });
      return { previousData };
    },
    onSuccess: (data: any) => {
      // Confirm the optimistic value with what the server actually saved —
      // targeted patch of just this one person, no full refetch needed.
      if (data?.personId !== undefined && data?.accounted !== undefined) {
        queryClient.setQueryData(["/api/muster"], (old: any[] | undefined) => {
          if (!old) return old;
          return old.map(person =>
            person.id === data.personId
              ? { ...person, accounted: data.accounted }
              : person
          );
        });
      }
    },
    onError: (error: any, _variables, context) => {
      // Roll back to the snapshot on failure
      if (context?.previousData) {
        queryClient.setQueryData(["/api/muster"], context.previousData);
      }
      toast({
        title: t('muster:updateFailed'),
        description: error.message || t('muster:updateFailedDesc'),
        variant: "destructive",
      });
    },
    // No onSettled invalidation — the targeted onSuccess/onError cache updates
    // are sufficient. A full refetch after every tap would cause visible flickering.
  });

  // Mutation to send emergency alert emails
  const sendAlertMutation = useMutation({
    mutationFn: async ({ subject, message }: { subject: string, message: string }) => {
      const response = await apiRequest("POST", "/api/emergency/send-alert", { subject, message });
      return await response.json();
    },
    onSuccess: (data) => {
      toast({
        title: t('muster:alertSentSuccess'),
        description: t('muster:alertSentDesc', { sentCount: data.sentCount, totalPersonnel: data.totalPersonnel }),
      });
    },
    onError: (error: any) => {
      toast({
        title: t('muster:alertFailed'),
        description: error.message || t('muster:alertFailedDesc'),
        variant: "destructive",
      });
    },
  });

  // Mutation to mark all personnel as safe — zone-aware with optimistic update
  const markAllSafeMutation = useMutation({
    mutationFn: async () => {
      const payload = selectedZones.size > 0 ? { zoneIds: Array.from(selectedZones) } : {};
      const response = await apiRequest("POST", "/api/muster/mark-all-safe", payload);
      return await response.json();
    },
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ["/api/muster"] });
      const previousData = queryClient.getQueryData<any[]>(["/api/muster"]);
      const zoneSet = selectedZones.size > 0 ? new Set(selectedZones) : null;
      queryClient.setQueryData(["/api/muster"], (old: any[] | undefined) => {
        if (!old) return old;
        return old.map(person => {
          // Only flip to safe if no zone filter, or if this person is in the selected zone(s)
          if (zoneSet && !zoneSet.has(person.zoneId)) return person;
          return { ...person, accounted: true };
        });
      });
      return { previousData };
    },
    onSuccess: (data) => {
      const zoneLabel = selectedZones.size > 0 ? t('muster:accountability.zoneFilter', { count: selectedZones.size }) : '';
      toast({
        title: t('muster:personnelMarkedSafe', { zoneLabel }),
        description: t('muster:markedSafeDesc', { updatedCount: data.updatedCount, totalPersonnel: data.totalPersonnel }),
      });
    },
    onError: (error: any, _variables, context) => {
      if (context?.previousData) {
        queryClient.setQueryData(["/api/muster"], context.previousData);
      }
      toast({
        title: t('muster:markAllSafeFailed'), 
        description: error.message || t('muster:markAllSafeFailedDesc'),
        variant: "destructive",
      });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/muster"] });
    },
  });

  // Mutation to activate Fire Marshal emergency system
  const activateFireMarshalMutation = useMutation({
    mutationFn: async ({ isDrill }: { isDrill: boolean }) => {
      const response = await apiRequest("POST", "/api/emergency/activate", {
        selectedZones: selectedZones.size > 0 ? Array.from(selectedZones) : undefined,
        isDrill,
      });
      return await response.json();
    },
    onSuccess: (data, variables) => {
      setEmergencyPhase('active');
      setEmergencyStartTime(data.startedAt ? new Date(data.startedAt) : new Date());
      if (data.evacuationId) setLastEvacuationId(data.evacuationId);
      toast({
        title: variables.isDrill ? t('muster:drillStarted') : t('muster:emergencyNotificationsSent'),
        description: data.message || t('muster:notifiedAllSuccess'),
      });
    },
    onError: (error: any) => {
      const errorMsg = error.message || "Failed to send emergency notifications";
      toast({
        title: t('muster:emailAlertFailed'),
        description: errorMsg.includes("No people") 
          ? t('muster:noPeopleInZones')
          : errorMsg,
        variant: "destructive",
      });
    },
  });

  // Track which person IDs have a pending email send
  const [emailingPersonId, setEmailingPersonId] = useState<string | null>(null);
  const [showEndEvacDialog, setShowEndEvacDialog] = useState(false);

  // Mutation to send individual email reminder to one unaccounted person
  const emailPersonMutation = useMutation({
    mutationFn: async ({ personId, personType }: { personId: string; personType: string }) => {
      setEmailingPersonId(personId);
      const response = await apiRequest("POST", `/api/emergency/email-person/${personType}/${personId}`, {});
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "Failed to send reminder");
      }
      return await response.json();
    },
    onSuccess: (data) => {
      setEmailingPersonId(null);
      toast({ title: t('muster:reminderSent'), description: data.message || t('muster:reminderSentSuccess') });
    },
    onError: (error: any) => {
      setEmailingPersonId(null);
      toast({ title: t('muster:sendFailed'), description: error.message || t('muster:sendFailedDesc'), variant: "destructive" });
    },
  });

  // Function to export muster list
  const exportMusterList = async () => {
    try {
      const response = await fetch("/api/muster/export", {
        method: "GET",
        credentials: "include",
      });
      
      if (!response.ok) {
        throw new Error("Failed to export muster list");
      }

      // Get the filename from response headers
      const contentDisposition = response.headers.get("content-disposition");
      let filename = "Emergency_Muster_List.csv";
      if (contentDisposition) {
        const match = contentDisposition.match(/filename="(.+)"/);
        if (match) filename = match[1];
      }

      // Create and download the file
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.style.display = "none";
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast({
        title: t('common:exportSuccessful'),
        description: t('muster:exportSuccessDesc', { filename }),
      });
    } catch (error: any) {
      toast({
        title: t('common:exportFailed'),
        description: error.message || t('muster:exportFailedDesc'),
        variant: "destructive",
      });
    }
  };

  // Apply zone filter first — when zones are selected, only include people assigned to those zones
  const zonedMusterList = selectedZones.size === 0
    ? musterList
    : musterList.filter(p => p.zoneId && selectedZones.has(p.zoneId));

  // Apply search and type filters on top of the zone-filtered list
  const filteredList = zonedMusterList.filter(person => {
    const matchesType = typeFilter === 'all' || person.type === typeFilter;
    const matchesSearch = searchTerm === '' || 
      (person.name && person.name.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (person.department && person.department.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (person.company && person.company.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesVisibility = showSafePeople || !person.accounted;
    return matchesType && matchesSearch && matchesVisibility;
  }).sort((a, b) => {
    const peepA = a.needsEvacuationAssistance ? 1 : 0;
    const peepB = b.needsEvacuationAssistance ? 1 : 0;
    const accA = a.accounted ? 1 : 0;
    const accB = b.accounted ? 1 : 0;
    if (accA !== accB) return accA - accB;
    return peepB - peepA;
  });

  // Summary stats reflect the zone-filtered list so counts match what's visible
  const totalPeople = zonedMusterList.length;
  const accountedFor = zonedMusterList.filter(p => p.accounted).length;
  const staffCount = zonedMusterList.filter(p => p.type === 'staff').length;
  const visitorCount = zonedMusterList.filter(p => p.type === 'visitor').length;
  const contractorCount = zonedMusterList.filter(p => p.type === 'contractor').length;
  const memberCount = zonedMusterList.filter(p => p.type === 'member').length;
  const peepCount = zonedMusterList.filter(p => p.needsEvacuationAssistance).length;
  const peepUnaccounted = zonedMusterList.filter(p => p.needsEvacuationAssistance && !p.accounted).length;

  const zonesRequireSelection = showZoneSelector && zones.length > 0 && selectedZones.size === 0;

  const handleEmergencyButtonClick = () => {
    if (emergencyPhase === 'idle') {
      setEmergencyActive(true);
      setEmergencyPhase('send_alert');
      if (zones.length > 0) {
        setShowZoneSelector(true);
      }
      // Fire immediately — type is already chosen via the Drill toggle on the idle screen
      activateFireMarshalMutation.mutate({ isDrill: isDrillMode });
    } else if (emergencyPhase === 'send_alert') {
      // No-op
    } else if (emergencyPhase === 'active') {
      setEmergencyActive(false);
      setEmergencyPhase('idle');
      setEmergencyStartTime(null);
      setElapsedSeconds(0);
      setIsDrillMode(false);
    }
  };

  const openIncidentReport = (evacuationId: string) => {
    window.open(`/api/emergency/incident-report/${evacuationId}?format=pdf`, '_blank');
  };

  const nudgeUnaccountedMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/emergency/nudge-unaccounted"),
    onSuccess: (data: any) => {
      if (data.sent === 0) {
        toast({ title: t('muster:nudges.noEmails'), description: t('muster:nudges.noEmailsDesc') });
      } else {
        toast({
          title: t('muster:nudges.sentTitle', { count: data.sent }),
          description: t('muster:nudges.sentDesc', { count: data.sent, skipped: data.skipped }),
        });
      }
    },
    onError: () => {
      toast({ title: t('muster:nudges.failed'), variant: "destructive" });
    }
  });

  const completeEvacuationMutation = useMutation({
    mutationFn: async (checkOutMode: 'keep_checked_in' | 'check_out_all') => {
      const csrfCookie = document.cookie.split(';').find(c => c.trim().startsWith('csrf-token='));
      const csrfToken = csrfCookie ? csrfCookie.split('=')[1] : '';
      const sessionToken = getSessionToken();
      const authHeaders: Record<string, string> = {
        "Content-Type": "application/json",
        "x-csrf-token": csrfToken,
      };
      if (sessionToken) authHeaders["Authorization"] = `Bearer ${sessionToken}`;
      const response = await fetch("/api/emergency/complete-evacuation", {
        method: "POST",
        headers: authHeaders,
        credentials: "include",
        body: JSON.stringify({ checkOutMode }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const err: any = new Error(data?.error || "Failed to end evacuation");
        err.status = response.status;
        err.serverMessage = data?.error;
        throw err;
      }
      return data;
    },
    onSuccess: (data: any) => {
      // Immediately reset UI to idle — don't wait for the query to refetch
      setShowEndEvacDialog(false);
      setEmergencyPhase('idle');
      setEmergencyActive(false);
      setEmergencyStartTime(null);
      setSelectedZones(new Set());
      setShowZoneSelector(false);
      if (data?.evacuationId) setLastEvacuationId(data.evacuationId);
      toast({
        title: isDrillMode ? t('muster:completion.drillEnded') : t('muster:completion.evacuationEnded'),
        description: data?.checkOutMode === 'check_out_all'
          ? t('muster:completion.checkOutAllDesc')
          : t('muster:completion.keepCheckedInDesc'),
        duration: 6000,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/evacuation/status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/muster"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/incident-reports"] });
    },
    onError: (error: any) => {
      // Always close the dialog — never leave it open on error
      setShowEndEvacDialog(false);
      setEmergencyPhase('idle');
      setEmergencyActive(false);
      if (error?.status === 404) {
        // Evacuation was already completed (e.g. double-click or concurrent session)
        toast({
          title: t('muster:completion.alreadyEnded'),
          description: t('muster:completion.alreadyEndedDesc'),
        });
        queryClient.invalidateQueries({ queryKey: ["/api/evacuation/status"] });
        queryClient.invalidateQueries({ queryKey: ["/api/muster"] });
      } else {
        toast({ title: t('muster:completion.failed'), description: error?.serverMessage || t('muster:completion.failedDesc'), variant: "destructive" });
      }
    }
  });

  const copyMonitorLink = () => {
    if (!activeEvacuation?.evacuationId || !activeEvacuation?.customerId) {
      toast({ title: t('muster:noActiveEvacuation'), description: t('muster:startEmergencyFirst'), variant: "destructive" });
      return;
    }
    const monitorUrl = `${window.location.origin}/monitor/${activeEvacuation.evacuationId}?customer=${encodeURIComponent(activeEvacuation.customerId)}`;
    navigator.clipboard.writeText(monitorUrl).then(() => {
      toast({ title: t('common:copied'), description: t('muster:monitorLinkCopiedDesc') });
    }).catch(() => {
      toast({ title: t('muster:monitorLink'), description: monitorUrl });
    });
  };


  const toggleAccountedStatus = (id: string, type: string) => {
    toggleAccountedMutation.mutate({ personId: id, type });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm font-medium">{t('musterList.loading')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6 p-3 sm:p-6 rounded-xl bg-background min-h-screen pb-24 sm:pb-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-0">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-fixed">{t('muster:title')}</h2>
          <p className="text-variable mt-1 flex flex-wrap items-center gap-2 text-sm sm:text-base">
            <span className="hidden sm:inline">{t('muster:subtitle')}</span>
            <span className="sm:hidden">{t('muster:subtitle')}</span>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button type="button" className="text-muted-foreground hover:text-foreground transition-colors">
                    <Info size={14} />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-sm text-xs space-y-2 p-3">
                  <p><strong>{t('muster:checklist.emergencyTitle')}</strong> — {t('muster:legalTooltip1')}</p>
                  <p><strong>{t('muster:accountability.rollCall')}</strong> {t('muster:legalTooltip2')}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            {wsConnected && (
              <span className="inline-flex items-center gap-1 text-xs bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 px-2 py-1 rounded-full">
                <span className="inline-block w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
                {t('common:liveLabel')}
              </span>
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {zones.length > 0 && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowZoneSelector(!showZoneSelector)}
                className="text-xs"
              >
                <MapPin size={14} className="mr-1" />
                {t('muster:zones')} {selectedZones.size > 0 && `(${selectedZones.size})`}
              </Button>
              {selectedZones.size > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={clearZoneSelection}
                  className="text-xs text-muted-foreground"
                >
                  {t('common:clear')}
                </Button>
              )}
            </>
          )}
          {/* Share monitor link — shown when emergency is active */}
          {emergencyPhase === 'active' && activeEvacuation?.evacuationId && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => nudgeUnaccountedMutation.mutate()}
                disabled={nudgeUnaccountedMutation.isPending}
                className="text-xs border-orange-300 text-orange-700 hover:bg-orange-50 dark:border-orange-700 dark:text-orange-300"
                title={t('muster:nudges.tooltip')}
              >
                <BellRing size={14} className="mr-1" />
                {nudgeUnaccountedMutation.isPending ? t('checklist.sending') : t('nudgeUnaccounted')}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={copyMonitorLink}
                className="text-xs border-purple-300 text-purple-700 hover:bg-purple-50 dark:border-purple-700 dark:text-purple-300"
                title={t('muster:monitorLinkTooltip')}
              >
                <Copy size={14} className="mr-1" />
                {t('monitorLink')}
              </Button>
            </>
          )}
          {/* Incident report button — shown immediately after an event this session */}
          {lastEvacuationId && emergencyPhase === 'idle' && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => openIncidentReport(lastEvacuationId)}
              className="text-xs border-blue-300 text-blue-700 hover:bg-blue-50 dark:border-blue-700 dark:text-blue-300"
            >
              <Download size={14} className="mr-1" />
              {t('incidentReport')}
            </Button>
          )}
          {/* Always-visible link to the full incident reports archive */}
          {emergencyPhase === 'idle' && (
            <a href="/incident-reports" className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium border border-gray-300 text-gray-600 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-400 dark:hover:bg-gray-800 transition-colors">
              <Download size={13} />
              {t('muster:allReports')}
            </a>
          )}
          {/* Muster Settings button — idle phase only */}
          {emergencyPhase === 'idle' && (
            <button
              onClick={() => setShowSettings(v => !v)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border transition-colors ${
                showSettings
                  ? 'bg-blue-50 border-blue-400 text-blue-700 dark:bg-blue-900/30 dark:border-blue-600 dark:text-blue-300'
                  : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-50 dark:bg-gray-800 dark:border-gray-600 dark:text-gray-400'
              }`}
              title={t('muster:settingsPanel.tooltip')}
              data-testid="button-muster-settings"
            >
              <Settings size={13} />
              {t('muster:musterSettings')}
              {showSettings ? <ChevronUp size={11} className="ml-0.5" /> : <ChevronDown size={11} className="ml-0.5" />}
            </button>
          )}
          {/* Drill mode toggle — idle phase only (send_alert uses the wizard's toggle) */}
          {emergencyPhase === 'idle' && (
            <button
              onClick={() => setIsDrillMode(!isDrillMode)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border transition-colors ${
                isDrillMode
                  ? 'bg-amber-100 border-amber-400 text-amber-800 dark:bg-amber-900/30 dark:border-amber-600 dark:text-amber-300'
                  : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-50 dark:bg-gray-800 dark:border-gray-600 dark:text-gray-400'
              }`}
              title={t('muster:drillModeTooltip')}
            >
              <ShieldAlert size={13} />
              {isDrillMode ? t('muster:drillOn') : t('muster:fireDrill')}
            </button>
          )}
          {/* Main action button — idle only: Activate Emergency / Start Drill */}
          {emergencyPhase === 'idle' && (
            <Button 
              onClick={handleEmergencyButtonClick}
              disabled={activateFireMarshalMutation.isPending}
              className={`${
                isDrillMode
                  ? "bg-amber-500 hover:bg-amber-600 text-white"
                  : "bg-orange-600 hover:bg-orange-700 text-white"
              } text-sm sm:text-base whitespace-nowrap`}
              data-testid="button-emergency-toggle"
            >
              <Siren className="mr-1.5 sm:mr-2" size={16} />
              <span className="hidden sm:inline">{isDrillMode ? t('startFireDrill') : t('activateEmergency')}</span>
              <span className="sm:hidden">{isDrillMode ? t('startFireDrill') : t('activateEmergency')}</span>
            </Button>
          )}
        </div>
      </div>

      {/* Muster Settings Panel */}
      {showSettings && emergencyPhase === 'idle' && (
        <GlassCard solid className="p-5 border border-blue-200 dark:border-blue-800">
          <div className="flex items-center gap-2 mb-4">
            <Settings size={18} className="text-blue-600" />
            <h3 className="text-base font-semibold text-fixed">{t('muster:statusOptions')}</h3>
            {effectiveEnabled && (
              <Badge className="bg-green-100 text-green-800 text-xs">{t('common:enabled')}</Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground mb-4">
            {t('muster:statusOptionsDesc')}
          </p>
          <div className="flex items-center gap-3 mb-5 p-3 bg-slate-50 dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-gray-700">
            <Switch
              checked={effectiveEnabled}
              onCheckedChange={(v) => {
                setLocalEnabled(v);
                saveSettingsMutation.mutate({ statusOptionsEnabled: v, statusOptions: effectiveOptions });
              }}
              disabled={saveSettingsMutation.isPending}
              data-testid="switch-status-options-enabled"
            />
            <div>
              <Label className="text-sm font-medium">{t('muster:enableStatusOptions')}</Label>
              <p className="text-xs text-muted-foreground mt-0.5">{t('muster:enableStatusOptionsDesc')}</p>
            </div>
          </div>
          <div className="mb-4">
            <Label className="text-sm font-medium mb-2 block">{t('muster:statusOptions')}</Label>
            <p className="text-xs text-muted-foreground mb-3">{t('muster:statusOptionsInputDesc')}</p>
            <div className="space-y-2 mb-3">
              {effectiveOptions.map((option, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <Input
                    value={option}
                    onChange={e => handleOptionChange(idx, e.target.value)}
                    className="flex-1 text-sm h-9"
                    data-testid={`status-option-input-${idx}`}
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-9 w-9 p-0 text-red-500 hover:text-red-700 hover:bg-red-50"
                    onClick={() => handleRemoveOption(idx)}
                    disabled={effectiveOptions.length <= 1}
                    title={t('common:remove')}
                  >
                    <Trash2 size={14} />
                  </Button>
                </div>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <Input
                value={newOption}
                onChange={e => setNewOption(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleAddOption()}
                placeholder={t('muster:addStatusOptionPlaceholder')}
                className="flex-1 text-sm h-9"
                data-testid="input-new-status-option"
              />
              <Button variant="outline" size="sm" className="h-9 px-3" onClick={handleAddOption} disabled={!newOption.trim()}>
                <Plus size={14} className="mr-1" />{t('common:add')}
              </Button>
            </div>
          </div>
          <div className="flex justify-end">
            <Button
              className="bg-blue-600 hover:bg-blue-700 text-white gap-2"
              onClick={() => saveSettingsMutation.mutate({ statusOptionsEnabled: effectiveEnabled, statusOptions: effectiveOptions })}
              disabled={saveSettingsMutation.isPending}
              data-testid="button-save-muster-settings"
            >
              <Save size={14} />
              {saveSettingsMutation.isPending ? t('common:saving') : t('common:saveChanges')}
            </Button>
          </div>
        </GlassCard>
      )}

      {emergencyActive && (
        isDrillMode ? (
          <div className="flex items-center justify-between gap-3 p-4 rounded-lg border-2 border-amber-500 bg-amber-50 dark:bg-amber-900/20">
            <div className="flex items-center gap-3">
              <ShieldAlert className="text-amber-600 flex-shrink-0 animate-pulse" size={24} />
              <div>
                <h3 className="text-base font-bold text-amber-800 dark:text-amber-200">{t('muster:fireDrillInProgress')}</h3>
                <p className="text-sm text-amber-700 dark:text-amber-300">{t('muster:drillDesc')}</p>
              </div>
            </div>
            {emergencyStartTime && (
              <div className="flex items-center gap-2 bg-amber-100 dark:bg-amber-800/40 px-3 py-2 rounded-lg flex-shrink-0">
                <Timer size={16} className="text-amber-700 dark:text-amber-300" />
                <span className="text-amber-800 dark:text-amber-200 font-mono font-bold text-lg tabular-nums">{formatElapsed(elapsedSeconds)}</span>
              </div>
            )}
          </div>
        ) : (
          <div className="flex items-center justify-between gap-3 p-4 rounded-lg border-2 border-red-500 bg-red-50 dark:bg-red-900/20">
            <div className="flex items-center gap-3">
              <AlertTriangle className="text-red-600 flex-shrink-0 animate-pulse" size={24} />
              <div>
                <h3 className="text-base font-bold text-red-800 dark:text-red-200">{t('muster:emergencyActiveLabel')}</h3>
                <p className="text-sm text-red-700 dark:text-red-300">{t('muster:emergencyActiveDesc')}</p>
              </div>
            </div>
            {emergencyStartTime && (
              <div className="flex items-center gap-2 bg-red-100 dark:bg-red-800/40 px-3 py-2 rounded-lg flex-shrink-0">
                <Timer size={16} className="text-red-700 dark:text-red-300" />
                <span className="text-red-800 dark:text-red-200 font-mono font-bold text-lg tabular-nums">{formatElapsed(elapsedSeconds)}</span>
              </div>
            )}
          </div>
        )
      )}


      {/* ── IDLE READINESS PANEL ─────────────────────────────────────────────── */}
      {emergencyPhase === 'idle' && (
        <GlassCard solid className="dark:glass-dark border-2 border-blue-200 dark:border-blue-800">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center flex-shrink-0">
                <ShieldAlert size={16} className="text-white" />
              </div>
              <div>
                <h3 className="text-base font-bold text-fixed">{t('muster:readiness.title')}</h3>
                <p className="text-xs text-muted-foreground">{t('muster:readiness.desc')}</p>
              </div>
            </div>
            <div className="flex gap-4 text-center">
              <div>
                <p className={`text-2xl font-black ${fireMarshals.length > 0 ? 'text-green-600 dark:text-green-400' : 'text-red-500'}`}>{fireMarshals.length}</p>
                <p className="text-[10px] text-muted-foreground">{t('muster:stats.marshals')}</p>
              </div>
              <div>
                <p className={`text-2xl font-black ${activeZones.length > 0 ? 'text-blue-600 dark:text-blue-400' : 'text-gray-400'}`}>{activeZones.length}</p>
                <p className="text-[10px] text-muted-foreground">{t('muster:zones')}</p>
              </div>
              <div>
                <p className="text-2xl font-black text-emerald-600 dark:text-emerald-400">{totalPeople}</p>
                <p className="text-[10px] text-muted-foreground">{t('common:onSite')}</p>
              </div>
            </div>
          </div>

          {/* Fire Marshal quick access — QR codes right here */}
          {fireMarshals.length > 0 ? (
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">{t('muster:fireMarshals.accessLinks')}</p>
              <p className="text-xs text-muted-foreground mb-3">{t('muster:fireMarshals.accessLinksDesc')}</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {fireMarshals.map((fm: any) => {
                  const marshalUrl = `${window.location.origin}/fire-marshal/${fm.fireMarshalUrlId}`;
                  const isShowingQr = showQrFor === `idle-${fm.id}`;
                  return (
                    <div key={fm.id} className="bg-white dark:bg-gray-800/50 rounded-lg p-2.5 border border-blue-200 dark:border-blue-700">
                      <div className="flex items-center justify-between gap-2 mb-1.5">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-fixed leading-tight">{fm.firstName} {fm.lastName}</p>
                          {fm.department && <p className="text-xs text-muted-foreground">{fm.department}</p>}
                        </div>
                        <div className="flex gap-1 flex-shrink-0">
                          <Button size="sm" variant="ghost" className={`h-7 w-7 p-0 ${isShowingQr ? 'bg-blue-100 dark:bg-blue-800/40 text-blue-700' : ''}`} onClick={() => setShowQrFor(isShowingQr ? null : `idle-${fm.id}`)} title={t('common:showQrCode')}><QrCode size={13} /></Button>
                          <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => { navigator.clipboard.writeText(marshalUrl); toast({ title: t('common:copied'), description: t('muster:toasts.marshalLinkCopied', { name: fm.firstName }) }); }} title={t('common:copyLink')}><Copy size={13} /></Button>
                          <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => window.open(marshalUrl, '_blank')} title={t('common:openInNewTab')}><ExternalLink size={13} /></Button>
                        </div>
                      </div>
                      <p className="text-[10px] text-muted-foreground font-mono truncate bg-gray-50 dark:bg-gray-700/50 px-2 py-1 rounded">{marshalUrl}</p>
                      {isShowingQr && (
                        <div className="mt-2 flex flex-col items-center gap-1">
                          <img src="" alt={`QR for ${fm.firstName}`} className="w-24 h-24 rounded bg-white border border-blue-200" ref={el => { if (!el) return; import('qrcode').then(Q => Q.toDataURL(marshalUrl, { width: 96, margin: 1 })).then(u => { el.src = u; }); }} />
                          <p className="text-[10px] text-muted-foreground">{t('muster:wizard.scanToOpen')}</p>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-3 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
              <ShieldAlert size={20} className="text-red-500 flex-shrink-0" />
              <div>
                <p className="text-sm font-semibold text-red-700 dark:text-red-300">{t('muster:fireMarshals.none')}</p>
                <p className="text-xs text-red-600 dark:text-red-400">{t('muster:fireMarshals.noneDesc')}</p>
              </div>
            </div>
          )}
        </GlassCard>
      )}

      {/* ── PROCESS PANEL: Activation Wizard (send_alert phase) ─────────────── */}
      {emergencyPhase === 'send_alert' && (
        <GlassCard solid className={`dark:glass-dark border-2 ${isDrillMode ? 'border-amber-500 dark:border-amber-600' : 'border-orange-500 dark:border-orange-600'}`}>
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-2">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${isDrillMode ? 'bg-amber-500' : 'bg-orange-500'}`}>
                <Siren size={16} className="text-white" />
              </div>
              <div>
                <h3 className="text-base font-bold text-fixed">{isDrillMode ? t('wizard.activateFireDrill') : t('activateEmergency')}</h3>
                <p className="text-xs text-muted-foreground">{t('wizard.workThrough')}</p>
              </div>
            </div>
            <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-muted-foreground" onClick={() => { setEmergencyActive(false); setEmergencyPhase('idle'); setSelectedZones(new Set()); setShowZoneSelector(false); }} title={t('common:cancel')}>
              <X size={16} />
            </Button>
          </div>

          <div className="space-y-5">
            {/* Activation status */}
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800">
              {activateFireMarshalMutation.isPending ? (
                <><Loader2 size={15} className="animate-spin text-orange-600" /><span className="text-sm font-medium text-orange-800 dark:text-orange-300">{isDrillMode ? t('muster:wizard.startingDrill') : t('muster:wizard.sendingAlerts')}</span></>
              ) : (
                <><CheckCircle size={15} className="text-green-600" /><span className="text-sm font-medium text-green-800 dark:text-green-300">{isDrillMode ? t('muster:wizard.drillAlertSent') : t('muster:wizard.emergencyAlertSent')}</span></>
              )}
            </div>

            {/* Step 1 — Zone Selection (only when zones are configured) */}
            {activeZones.length > 0 && (
              <div className="flex gap-3">
                <div className={`flex-shrink-0 w-7 h-7 rounded-full text-white font-bold text-sm flex items-center justify-center border-2 ${isDrillMode ? 'bg-amber-500 border-amber-600' : 'bg-orange-500 border-orange-600'}`}>1</div>
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-sm font-semibold text-fixed">{t('muster:wizard.selectZones')}</h4>
                    <span className="text-xs text-muted-foreground">{selectedZones.size === 0 ? t('muster:wizard.allZones') : t('muster:wizard.zonesSelected', { count: selectedZones.size })}</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {activeZones.map(zone => {
                      const isSelected = selectedZones.has(zone.id);
                      const counts = zonePersonnelCounts[zone.id];
                      return (
                        <button key={zone.id} onClick={() => toggleZone(zone.id)} className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border-2 transition-all ${isSelected ? 'text-white border-transparent' : 'bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:border-gray-400'}`} style={isSelected ? { backgroundColor: zone.color, borderColor: zone.color } : {}}>
                          <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: zone.color }} />
                          {zone.name}
                          {counts && counts.total > 0 && <span className={`text-[10px] px-1 rounded-full ${isSelected ? 'bg-white/25' : 'bg-gray-100 dark:bg-gray-700'}`}>{counts.total}</span>}
                        </button>
                      );
                    })}
                  </div>
                  {selectedZones.size === 0 && <p className="text-xs text-muted-foreground mt-1.5">{t('muster:wizard.leaveUnselected')}</p>}
                </div>
              </div>
            )}

            {/* Step 2 (or 1 if no zones) — Share Fire Marshal Links */}
            {fireMarshals.length > 0 && (
              <div className="flex gap-3">
                <div className={`flex-shrink-0 w-7 h-7 rounded-full text-white font-bold text-sm flex items-center justify-center border-2 ${isDrillMode ? 'bg-amber-500 border-amber-600' : 'bg-orange-500 border-orange-600'}`}>{activeZones.length > 0 ? 2 : 1}</div>
                <div className="flex-1">
                  <h4 className="text-sm font-semibold text-fixed mb-1">{t('muster:wizard.shareLinks')}</h4>
                  <p className="text-xs text-muted-foreground mb-2">{t('muster:wizard.shareLinksDesc')}</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {fireMarshals.map((fm: any) => {
                      const marshalUrl = `${window.location.origin}/fire-marshal/${fm.fireMarshalUrlId}`;
                      const isShowingQr = showQrFor === `pre-${fm.id}`;
                      return (
                        <div key={fm.id} className="bg-white dark:bg-gray-800/50 rounded-lg p-2.5 border border-gray-200 dark:border-gray-600">
                          <div className="flex items-center justify-between gap-2 mb-1.5">
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-fixed leading-tight">{fm.firstName} {fm.lastName}</p>
                              {fm.department && <p className="text-xs text-muted-foreground">{fm.department}</p>}
                            </div>
                            <div className="flex gap-1 flex-shrink-0">
                              <Button size="sm" variant="ghost" className={`h-7 w-7 p-0 ${isShowingQr ? 'bg-blue-100 dark:bg-blue-800/40 text-blue-700' : ''}`} onClick={() => setShowQrFor(isShowingQr ? null : `pre-${fm.id}`)} title={t('common:showQrCode')}><QrCode size={13} /></Button>
                              <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => { navigator.clipboard.writeText(marshalUrl); toast({ title: t('common:copied'), description: t('muster:toasts.marshalLinkCopied', { name: fm.firstName }) }); }} title={t('common:copyLink')}><Copy size={13} /></Button>
                              <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => window.open(marshalUrl, '_blank')} title={t('common:openInNewTab')}><ExternalLink size={13} /></Button>
                            </div>
                          </div>
                          <p className="text-[10px] text-muted-foreground font-mono truncate bg-gray-50 dark:bg-gray-700/50 px-2 py-1 rounded">{marshalUrl}</p>
                          {isShowingQr && (
                            <div className="mt-2 flex flex-col items-center gap-1">
                              <img src="" alt={`QR for ${fm.firstName}`} className="w-24 h-24 rounded bg-white border border-gray-200" ref={el => { if (!el) return; import('qrcode').then(Q => Q.toDataURL(marshalUrl, { width: 96, margin: 1 })).then(u => { el.src = u; }); }} />
                              <p className="text-[10px] text-muted-foreground">{t('muster:wizard.scanToOpen')}</p>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

          </div>
        </GlassCard>
      )}

      {/* ── PROCESS PANEL: Active Emergency Checklist ─────────────────────────── */}
      {emergencyPhase === 'active' && (
        <GlassCard solid className={`dark:glass-dark border-2 ${isDrillMode ? 'border-amber-500 dark:border-amber-600' : 'border-red-500 dark:border-red-600'}`}>
          <div className="flex items-center gap-2 mb-4">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${isDrillMode ? 'bg-amber-500' : 'bg-red-600'}`}>
              <ClipboardList size={16} className="text-white" />
            </div>
            <div>
              <h3 className="text-base font-bold text-fixed">{isDrillMode ? t('muster:checklist.drillTitle') : t('muster:checklist.emergencyTitle')}</h3>
              <p className="text-xs text-muted-foreground">{t('muster:checklist.followSteps', { mode: isDrillMode ? t('muster:checklist.drill') : t('muster:checklist.emergency') })}</p>
            </div>
          </div>

          <div className="space-y-3">
            {/* Step 1 — Alert Sent (always complete) */}
            <div className="flex gap-3 p-3 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800">
              <div className="flex-shrink-0 w-7 h-7 rounded-full bg-green-500 text-white flex items-center justify-center"><CheckCircle size={15} /></div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <h4 className="text-sm font-semibold text-green-800 dark:text-green-200">{isDrillMode ? t('muster:checklist.drillAlertSent') : t('muster:checklist.emergencyAlertSent')}</h4>
                  {emergencyStartTime && <span className="text-xs text-green-600 dark:text-green-400 flex-shrink-0 font-mono">{formatTimeLocale(emergencyStartTime, { second: '2-digit' })}</span>}
                </div>
                <p className="text-xs text-green-700 dark:text-green-300">{t('muster:checklist.allNotified')}</p>
              </div>
            </div>

            {/* Step 2 — Fire Marshal Deployment */}
            <div className={`flex gap-3 p-3 rounded-lg border ${fireMarshals.length > 0 ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800' : 'bg-gray-50 dark:bg-gray-800/30 border-gray-200 dark:border-gray-700'}`}>
              <div className={`flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center ${fireMarshals.length > 0 ? 'bg-blue-600 text-white' : 'bg-gray-400 text-white'}`}><HardHat size={15} /></div>
              <div className="flex-1 min-w-0">
                <h4 className="text-sm font-semibold text-fixed mb-2">{t('muster:checklist.deployMarshals')}</h4>
                {fireMarshals.length > 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {fireMarshals.map((fm: any) => {
                      const marshalUrl = `${window.location.origin}/fire-marshal/${fm.fireMarshalUrlId}`;
                      const isShowingQr = showQrFor === `active-${fm.id}`;
                      return (
                        <div key={fm.id} className="bg-white dark:bg-gray-800/50 rounded-lg p-2.5 border border-blue-200 dark:border-blue-700">
                          <div className="flex items-center justify-between gap-2 mb-1.5">
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-fixed leading-tight">{fm.firstName} {fm.lastName}</p>
                              {fm.department && <p className="text-xs text-muted-foreground">{fm.department}</p>}
                            </div>
                            <div className="flex gap-1 flex-shrink-0">
                              <Button size="sm" variant="ghost" className={`h-7 w-7 p-0 ${isShowingQr ? 'bg-blue-100 dark:bg-blue-800/40 text-blue-700' : ''}`} onClick={() => setShowQrFor(isShowingQr ? null : `active-${fm.id}`)} title={t('common:showQrCode')}><QrCode size={13} /></Button>
                              <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => { navigator.clipboard.writeText(marshalUrl); toast({ title: t('common:copied'), description: t('muster:toasts.marshalLinkCopied', { name: fm.firstName }) }); }} title={t('common:copyLink')}><Copy size={13} /></Button>
                              <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => window.open(marshalUrl, '_blank')} title={t('common:openInNewTab')}><ExternalLink size={13} /></Button>
                            </div>
                          </div>
                          <p className="text-[10px] text-blue-600 dark:text-blue-400 font-mono truncate bg-blue-50 dark:bg-blue-900/30 px-2 py-1 rounded">{marshalUrl}</p>
                          {isShowingQr && (
                            <div className="mt-2 flex items-center gap-3">
                              <img src="" alt={`QR for ${fm.firstName}`} className="w-28 h-28 rounded bg-white border border-blue-200 flex-shrink-0" ref={el => { if (!el) return; import('qrcode').then(Q => Q.toDataURL(marshalUrl, { width: 112, margin: 1 })).then(u => { el.src = u; }); }} />
                              <p className="text-xs text-muted-foreground">{t('muster:fireMarshals.accessLinksDesc')}</p>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">{t('muster:fireMarshals.noneActive')}</p>
                )}
              </div>
            </div>

            {/* Step 3 — Account for All Personnel */}
            {(() => {
              const allSafe = accountedFor === totalPeople && totalPeople > 0;
              return (
                <div className={`flex gap-3 p-3 rounded-lg border ${allSafe ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800' : 'bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-800'}`}>
                  <div className={`flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center ${allSafe ? 'bg-green-500 text-white' : 'bg-orange-500 text-white'}`}>{allSafe ? <CheckCircle size={15} /> : <Users size={15} />}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <h4 className="text-sm font-semibold text-fixed">{t('muster:checklist.accountForAll')}</h4>
                      <span className={`text-xs font-bold flex-shrink-0 ${allSafe ? 'text-green-600 dark:text-green-400' : 'text-orange-600 dark:text-orange-400'}`}>{accountedFor}/{totalPeople}</span>
                    </div>
                    <Progress value={totalPeople > 0 ? (accountedFor / totalPeople) * 100 : 0} className={`h-2 mb-2 ${allSafe ? '[&>div]:bg-green-500' : '[&>div]:bg-orange-500'}`} />
                    {!allSafe && totalPeople > 0 && (
                      <div className="flex flex-col xs:flex-row items-start xs:items-center gap-2">
                        <p className="text-xs text-orange-700 dark:text-orange-300 flex-1">{t('muster:checklist.unaccountedCount', { count: totalPeople - accountedFor })}</p>
                        <Button size="sm" variant="outline" onClick={() => nudgeUnaccountedMutation.mutate()} disabled={nudgeUnaccountedMutation.isPending} className="w-full xs:w-auto text-xs h-8 border-orange-300 text-orange-700 hover:bg-orange-50 dark:border-orange-700 dark:text-orange-300 justify-center">
                          <BellRing size={12} className="mr-1" />{nudgeUnaccountedMutation.isPending ? t('checklist.sending') : t('nudgeUnaccounted')}
                        </Button>
                      </div>
                    )}
                    {allSafe && <p className="text-xs text-green-700 dark:text-green-300 font-semibold">{t('checklist.allAccountedFor')}</p>}
                  </div>
                </div>
              );
            })()}

            {/* Step 4 — End Incident */}
            <div className="flex gap-3 p-3 rounded-lg bg-gray-50 dark:bg-gray-800/30 border border-gray-200 dark:border-gray-700">
              <div className={`flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center ${accountedFor === totalPeople && totalPeople > 0 ? 'bg-red-600 text-white' : 'bg-gray-300 dark:bg-gray-600 text-gray-500 dark:text-gray-300'}`}><ShieldAlert size={15} /></div>
              <div className="flex-1 min-w-0">
                <div className="flex flex-col gap-2">
                  <div>
                    <h4 className="text-sm font-semibold text-fixed">{t('muster:checklist.endIncident')}</h4>
                    <p className="text-xs text-muted-foreground">{t('muster:checklist.saveReport', { mode: isDrillMode ? t('muster:checklist.drill') : t('muster:checklist.emergency') })}</p>
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    <Button size="sm" variant="outline" onClick={copyMonitorLink} className="flex-1 sm:flex-initial text-xs border-purple-300 text-purple-700 hover:bg-purple-50 dark:border-purple-700 dark:text-purple-300 justify-center" title={t('muster:checklist.monitorLinkTooltip')}>
                      <Copy size={12} className="mr-1" />{t('muster:monitorLink')}
                    </Button>
                    <Button size="sm" onClick={() => setShowEndEvacDialog(true)} disabled={completeEvacuationMutation.isPending} className="flex-1 sm:flex-initial text-xs text-white border-0 bg-red-600 hover:bg-red-700 justify-center">
                      <ShieldAlert size={12} className="mr-1" />{t('muster:checklist.endEvacuation')}
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </GlassCard>
      )}

      {/* ── Legacy zone selector card (hide during activation — wizard handles it) ── */}
      {showZoneSelector && zones.length > 0 && emergencyPhase !== 'send_alert' && (
        <GlassCard solid className="dark:glass-dark">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <MapPin className="text-blue-600" size={18} />
              <h3 className="text-sm font-semibold text-fixed">{t('muster:zoneSelector.title')}</h3>
            </div>
            <p className="text-xs text-muted-foreground">
              {selectedZones.size === 0 ? t('muster:zoneSelector.noneSelected') : t('muster:zoneSelector.countSelected', { count: selectedZones.size })}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {activeZones.map(zone => {
              const isSelected = selectedZones.has(zone.id);
              const counts = zonePersonnelCounts[zone.id];
              return (
                <Button
                  key={zone.id}
                  variant={isSelected ? "default" : "outline"}
                  size="sm"
                  onClick={() => toggleZone(zone.id)}
                  className={`text-xs gap-1.5 ${isSelected ? 'shadow-md' : 'opacity-70 hover:opacity-100'}`}
                  style={isSelected ? { backgroundColor: zone.color, borderColor: zone.color, color: '#fff' } : {}}
                >
                  <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: zone.color }} />
                  {zone.name}
                  {counts && counts.total > 0 && (
                    <span className={`ml-1 text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${isSelected ? 'bg-white/25' : 'bg-muted'}`}>
                      {counts.total}
                    </span>
                  )}
                </Button>
              );
            })}
          </div>
          {selectedZones.size > 0 && (
            <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">
              {t('muster:zoneSelector.selectedOnly')}
            </p>
          )}

          {zoneMapUrl && (
            <div className="mt-4 pt-4 border-t border-border/50">
              <div className="flex items-center gap-2 mb-3">
                <Map className="text-blue-600" size={16} />
                <h4 className="text-sm font-medium text-fixed">{t('muster:zoneSelector.zoneMap')}</h4>
                <span className="text-[10px] text-muted-foreground bg-muted px-2 py-0.5 rounded-full">{t('muster:zoneSelector.clickToSelect')}</span>
              </div>
              <div className="relative rounded-lg overflow-hidden border-2 border-border/30 bg-muted/20">
                <img
                  src={zoneMapUrl}
                  alt="Zone map"
                  className="w-full h-auto block"
                  draggable={false}
                />
                {activeZones.map((zone) => {
                  if (zone.mapX == null || zone.mapY == null) return null;
                  const isSelected = selectedZones.has(zone.id);
                  const counts = zonePersonnelCounts[zone.id];
                  const numMatch = zone.name.match(/\d+/);
                  const markerLabel = numMatch ? numMatch[0] : zone.name.slice(0, 3).toUpperCase();
                  const sweepRecord = sweptZoneMap.get(zone.id);
                  const isSwept = !!sweepRecord;
                  return (
                    <button
                      key={zone.id}
                      className="absolute transform -translate-x-1/2 -translate-y-1/2 group focus:outline-none"
                      style={{
                        left: `${zone.mapX}%`,
                        top: `${zone.mapY}%`,
                        zIndex: isSelected ? 20 : 10,
                      }}
                      onClick={() => toggleZone(zone.id)}
                      title={`${zone.name}${counts ? ` - ${counts.total} personnel` : ''}${isSwept ? ' - PHYSICALLY SWEPT' : ''} - Click to ${isSelected ? 'deselect' : 'select'}`}
                    >
                      <div className={`relative transition-all duration-200 ${isSelected ? 'scale-110' : 'group-hover:scale-110'}`}>
                        <div
                          className={`w-10 h-10 rounded-full flex items-center justify-center text-white text-xs font-bold shadow-lg border-3 transition-all duration-200 ${
                            isSelected
                              ? 'border-white ring-4 ring-offset-1'
                              : 'border-white/70 opacity-75 group-hover:opacity-100 group-hover:border-white'
                          }`}
                          style={{
                            backgroundColor: zone.color,
                            boxShadow: isSelected
                              ? `0 0 0 4px ${zone.color}40, 0 4px 12px rgba(0,0,0,0.3)`
                              : '0 2px 8px rgba(0,0,0,0.2)',
                          }}
                        >
                          {markerLabel}
                        </div>
                        {/* Swept badge — bottom-left of marker */}
                        {isSwept && (
                          <div className="absolute -bottom-1 -left-1 w-4 h-4 bg-green-500 rounded-full flex items-center justify-center shadow-sm" title="Physically swept by fire marshal">
                            <Footprints className="w-2.5 h-2.5 text-white" />
                          </div>
                        )}
                        {isSelected && (
                          <div className="absolute -top-1 -right-1 w-4 h-4 bg-white rounded-full flex items-center justify-center shadow-sm">
                            <CheckCircle className="w-3.5 h-3.5 text-green-600" />
                          </div>
                        )}
                        <div
                          className={`absolute left-1/2 -translate-x-1/2 top-full mt-1 px-2 py-0.5 rounded text-[10px] font-semibold whitespace-nowrap shadow-sm transition-opacity ${
                            isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                          }`}
                          style={{ backgroundColor: zone.color, color: '#fff' }}
                        >
                          {zone.name}
                          {counts && counts.total > 0 && (
                            <span className="ml-1 opacity-80">({counts.total})</span>
                          )}
                          {isSwept && <span className="ml-1">✓swept</span>}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </GlassCard>
      )}

      {/* Emergency Stats — compact 2-row grid for quick reading on mobile */}
      <div className="space-y-2 sm:space-y-3">
        {/* Row 1: Total + Accounted + Unaccounted — the three most critical numbers */}
        <div className="grid grid-cols-3 gap-2 sm:gap-3">
          <GlassCard solid hover className={`dark:glass-dark bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-emerald-900/20 dark:to-teal-900/20 border-2 cursor-pointer transition-all !p-3 sm:!p-5 ${typeFilter === 'all' ? 'border-emerald-500 dark:border-emerald-400 ring-2 ring-emerald-300 dark:ring-emerald-600' : 'border-emerald-200 dark:border-emerald-800'}`} onClick={() => setTypeFilter('all')}>
            <div className="flex items-start justify-between gap-1">
              <div className="min-w-0">
                <p className="text-emerald-700 dark:text-emerald-300 text-[10px] sm:text-sm font-semibold leading-tight">{t('muster:stats.total')}</p>
                <p className="text-3xl sm:text-5xl font-black text-emerald-700 dark:text-emerald-300 leading-none mt-1" data-testid="stat-total-people">
                  {totalPeople}
                </p>
                <p className="text-[10px] sm:text-xs text-emerald-600 dark:text-emerald-400 mt-1 font-medium">{t('muster:stats.onSite')}</p>
              </div>
              <div className="w-8 h-8 sm:w-12 sm:h-12 bg-emerald-200 dark:bg-emerald-800/50 rounded-xl flex items-center justify-center shrink-0">
                <Users className="text-emerald-700 dark:text-emerald-300" size={16} />
              </div>
            </div>
          </GlassCard>

          <GlassCard solid hover className="dark:glass-dark border-2 border-transparent !p-3 sm:!p-5">
            <div className="flex items-start justify-between gap-1">
              <div className="min-w-0 flex-1">
                <p className="text-variable text-[10px] sm:text-sm font-semibold leading-tight">{t('muster:stats.accounted')}</p>
                <p className="text-3xl sm:text-5xl font-black text-green-600 dark:text-green-400 leading-none mt-1" data-testid="stat-accounted">
                  {accountedFor}
                </p>
                <div className="mt-1.5 space-y-0.5">
                  <Progress value={totalPeople > 0 ? (accountedFor / totalPeople) * 100 : 0} className="h-1.5 bg-green-100 dark:bg-green-900/30 [&>div]:bg-green-500" />
                  <p className="text-[10px] sm:text-xs text-green-600 dark:text-green-400 font-medium">
                    {totalPeople > 0 ? Math.round((accountedFor / totalPeople) * 100) : 0}%
                  </p>
                </div>
              </div>
              <div className="w-8 h-8 sm:w-12 sm:h-12 bg-green-100 dark:bg-green-900/30 rounded-xl flex items-center justify-center shrink-0">
                <CheckCircle className="text-green-600 dark:text-green-400" size={16} />
              </div>
            </div>
          </GlassCard>

          <GlassCard solid hover className={`dark:glass-dark border-2 !p-3 sm:!p-5 transition-all ${(totalPeople - accountedFor) > 0 ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800' : 'border-transparent'}`}>
            <div className="flex items-start justify-between gap-1">
              <div className="min-w-0">
                <p className={`text-[10px] sm:text-sm font-semibold leading-tight ${(totalPeople - accountedFor) > 0 ? 'text-red-700 dark:text-red-300' : 'text-variable'}`}>{t('muster:stats.missing')}</p>
                <p className={`text-3xl sm:text-5xl font-black leading-none mt-1 ${(totalPeople - accountedFor) > 0 ? 'text-red-600 dark:text-red-400' : 'text-gray-400 dark:text-gray-500'}`} data-testid="stat-unaccounted">
                  {totalPeople - accountedFor}
                </p>
                <p className={`text-[10px] sm:text-xs mt-1 font-medium ${(totalPeople - accountedFor) > 0 ? 'text-red-600 dark:text-red-400' : 'text-gray-400 dark:text-gray-500'}`}>
                  {(totalPeople - accountedFor) === 0 ? t('muster:stats.allSafe') : t('muster:stats.unaccounted')}
                </p>
              </div>
              <div className={`w-8 h-8 sm:w-12 sm:h-12 rounded-xl flex items-center justify-center shrink-0 ${(totalPeople - accountedFor) > 0 ? 'bg-red-100 dark:bg-red-900/30' : 'bg-gray-100 dark:bg-gray-800/30'}`}>
                <ShieldAlert className={`${(totalPeople - accountedFor) > 0 ? 'text-red-600 dark:text-red-400' : 'text-gray-400 dark:text-gray-500'}`} size={16} />
              </div>
            </div>
          </GlassCard>
        </div>

        {/* PEEP alert — only shown when PEEP people are on-site */}
        {peepCount > 0 && (
          <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-amber-50 dark:bg-amber-900/30 border-2 border-amber-400 dark:border-amber-600">
            <div className="w-9 h-9 flex-shrink-0 rounded-xl bg-amber-200 dark:bg-amber-800/60 flex items-center justify-center">
              <Accessibility className="text-amber-700 dark:text-amber-300" size={18} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-amber-800 dark:text-amber-200">
                {t('muster:stats.peepOnSite', { count: peepCount })}
              </p>
              <p className="text-xs text-amber-700 dark:text-amber-300">
                {peepUnaccounted > 0
                  ? t('muster:stats.peepUnaccounted', { count: peepUnaccounted })
                  : t('muster:stats.allPeepSafe')}
              </p>
            </div>
            {peepUnaccounted > 0 && (
              <span className="flex-shrink-0 text-2xl font-black text-amber-700 dark:text-amber-300">{peepUnaccounted}</span>
            )}
          </div>
        )}

        {/* Row 2: Category breakdown — tap to filter */}
        <div className={`grid gap-2 sm:gap-3 ${memberCount > 0 ? 'grid-cols-4' : 'grid-cols-3'}`}>
          <GlassCard solid hover className={`dark:glass-dark cursor-pointer transition-all border-2 !p-2.5 sm:!p-4 ${typeFilter === 'staff' ? 'border-purple-500 dark:border-purple-400 ring-2 ring-purple-300 dark:ring-purple-600' : 'border-transparent'}`} onClick={() => setTypeFilter(typeFilter === 'staff' ? 'all' : 'staff')}>
            <div className="text-center">
              <p className="text-xl sm:text-3xl font-black text-purple-600 dark:text-purple-400 leading-none" data-testid="stat-staff-count">{staffCount}</p>
              <p className="text-[10px] sm:text-xs text-variable font-semibold mt-1 leading-tight">{t('muster:stats.staff')}</p>
            </div>
          </GlassCard>

          <GlassCard solid hover className={`dark:glass-dark cursor-pointer transition-all border-2 !p-2.5 sm:!p-4 ${typeFilter === 'visitor' ? 'border-blue-500 dark:border-blue-400 ring-2 ring-blue-300 dark:ring-blue-600' : 'border-transparent'}`} onClick={() => setTypeFilter(typeFilter === 'visitor' ? 'all' : 'visitor')}>
            <div className="text-center">
              <p className="text-xl sm:text-3xl font-black text-blue-600 dark:text-blue-400 leading-none" data-testid="stat-visitor-count">{visitorCount}</p>
              <p className="text-[10px] sm:text-xs text-variable font-semibold mt-1 leading-tight">{t('muster:stats.visitors')}</p>
            </div>
          </GlassCard>

          <GlassCard solid hover className={`dark:glass-dark cursor-pointer transition-all border-2 !p-2.5 sm:!p-4 ${typeFilter === 'contractor' ? 'border-orange-500 dark:border-orange-400 ring-2 ring-orange-300 dark:ring-orange-600' : 'border-transparent'}`} onClick={() => setTypeFilter(typeFilter === 'contractor' ? 'all' : 'contractor')}>
            <div className="text-center">
              <p className="text-xl sm:text-3xl font-black text-orange-600 dark:text-orange-400 leading-none" data-testid="stat-contractor-count">{contractorCount}</p>
              <p className="text-[10px] sm:text-xs text-variable font-semibold mt-1 leading-tight">{t('muster:stats.contractors')}</p>
            </div>
          </GlassCard>

          {memberCount > 0 && (
            <GlassCard solid hover className={`dark:glass-dark cursor-pointer transition-all border-2 !p-2.5 sm:!p-4 ${typeFilter === 'member' ? 'border-purple-500 dark:border-purple-400 ring-2 ring-purple-300 dark:ring-purple-600' : 'border-transparent'}`} onClick={() => setTypeFilter(typeFilter === 'member' ? 'all' : 'member')}>
              <div className="text-center">
                <p className="text-xl sm:text-3xl font-black text-purple-600 dark:text-purple-400 leading-none" data-testid="stat-member-count">{memberCount}</p>
                <p className="text-[10px] sm:text-xs text-variable font-semibold mt-1 leading-tight">{t('muster:stats.members')}</p>
              </div>
            </GlassCard>
          )}
        </div>
      </div>

      {/* Zone Sweep Status — shown during active evacuation when zones are configured */}
      {hasActiveEvacuation && activeZones.length > 0 && (
        <GlassCard solid className="dark:glass-dark">
          <div className="flex items-center gap-2 mb-1">
            <Footprints className="text-green-600 dark:text-green-400" size={18} />
            <h3 className="text-sm font-semibold text-fixed">{t('zoneSweep.title')}</h3>
            <span className="text-xs text-muted-foreground ml-auto">
              {t('zoneSweep.zonesSwepta', { swept: zoneSweeps.length, total: activeZones.length })}
            </span>
          </div>
          <p className="text-[11px] text-muted-foreground mb-3">
            {t('zoneSweep.desc')}
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
            {activeZones.map(zone => {
              const sweep = sweptZoneMap.get(zone.id);
              const counts = zonePersonnelCounts[zone.id];
              return (
                <div
                  key={zone.id}
                  className={`rounded-lg p-2 border text-xs ${
                    sweep
                      ? sweep.hasUnaccountedAtTime
                        ? 'border-amber-300 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-700'
                        : 'border-green-300 bg-green-50 dark:bg-green-900/20 dark:border-green-700'
                      : 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/30'
                  }`}
                >
                  <div className="flex items-center gap-1.5 mb-1">
                    <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: zone.color }} />
                    <span className="font-semibold truncate text-fixed">{zone.name}</span>
                  </div>
                  {sweep ? (
                    <div>
                      <div className="flex items-center gap-1 text-green-700 dark:text-green-400 font-semibold">
                        <Footprints size={10} />
                        <span>{t('zoneSweep.swept')}</span>
                        {sweep.hasUnaccountedAtTime && (
                          <span className="text-amber-600 dark:text-amber-400 ml-1">{t('zoneSweep.override')}</span>
                        )}
                      </div>
                      <div className="text-muted-foreground mt-0.5 truncate">
                        {sweep.sweptByName}
                      </div>
                      <div className="text-muted-foreground">
                        {formatTimeLocale(sweep.sweptAt)}
                      </div>
                    </div>
                  ) : (
                    <div className="text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <Clock size={10} />
                        <span>{t('zoneSweep.notSwept')}</span>
                      </div>
                      {counts && counts.total > 0 && (
                        <div className={counts.safe === counts.total ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}>
                          {t('zoneSweep.safe', { safe: counts.safe, total: counts.total })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </GlassCard>
      )}

      {/* Personnel Accountability — full width */}
      <div>
        <div>
          <GlassCard solid className="dark:glass-dark">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <h3 className="text-sm sm:text-base font-semibold text-fixed flex items-center gap-1.5 flex-wrap">
                {t('accountability.title')}
                {selectedZones.size > 0 && (
                  <span className="text-xs font-normal bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 px-2 py-0.5 rounded-full">
                    {selectedZones.size === 1 ? t('muster:accountability.zoneFilter') : t('muster:accountability.zoneFilter_plural', { count: selectedZones.size })}
                    <button onClick={() => setSelectedZones(new Set())} className="ml-1 hover:text-amber-900 dark:hover:text-amber-100" title={t('common:clear')}>&times;</button>
                  </span>
                )}
                {typeFilter !== 'all' && (
                  <span className="text-xs font-normal bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 px-2 py-0.5 rounded-full">
                    {typeFilter === 'staff' ? t('muster:stats.staff') : typeFilter === 'visitor' ? t('muster:stats.visitors') : typeFilter === 'contractor' ? t('muster:stats.contractors') : t('muster:stats.members')}
                    <button onClick={() => setTypeFilter('all')} className="ml-1 hover:text-blue-900 dark:hover:text-blue-100" title={t('common:clear')}>&times;</button>
                  </span>
                )}
              </h3>
              <div className="flex items-center gap-2">
                {hasActiveEvacuation && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => markAllSafeMutation.mutate()}
                    disabled={markAllSafeMutation.isPending}
                    data-testid="button-mark-all-safe"
                    className="text-xs h-8 px-3 font-semibold"
                    title={selectedZones.size > 0 ? `Mark all safe in selected zone(s) only` : `Mark all on-site personnel as safe`}
                  >
                    <CheckCircle className="mr-1.5 flex-shrink-0" size={13} />
                    {markAllSafeMutation.isPending ? t('muster:accountability.marking') : selectedZones.size > 0 ? t('muster:accountability.markZonesSafe', { count: selectedZones.size }) : t('muster:accountability.markAllSafe')}
                  </Button>
                )}
                {accountedFor > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowSafePeople(prev => !prev)}
                    data-testid="button-toggle-safe-people"
                    className="text-xs h-8 px-3 font-semibold"
                  >
                    {showSafePeople ? (
                      <><EyeOff className="mr-1.5 flex-shrink-0" size={13} />{t('muster:accountability.hideSafe', { count: accountedFor })}</>
                    ) : (
                      <><Eye className="mr-1.5 flex-shrink-0" size={13} />{t('muster:accountability.showSafe', { count: accountedFor })}</>
                    )}
                  </Button>
                )}
              </div>
            </div>
            
            <div className="mb-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-variable" size={15} />
                <Input
                  id="search"
                  type="text"
                  placeholder={t('muster:accountability.searchPlaceholder')}
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 text-fixed text-sm"
                  data-testid="input-search-personnel"
                />
              </div>
            </div>
            
            {/* First-time user hint — only shown when idle and list has people */}
            {!hasActiveEvacuation && filteredList.length > 0 && (
              <div className="mb-2 flex items-center gap-2 px-2.5 py-1.5 rounded-md bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 text-[11px] text-blue-600 dark:text-blue-400">
                <ShieldAlert size={12} className="flex-shrink-0 text-blue-500" />
                <p>Idle view — <strong>Mark Safe</strong> buttons appear when you activate an emergency.</p>
              </div>
            )}

            <div className="space-y-1.5 max-h-[60vh] sm:max-h-[65vh] overflow-y-auto pr-0.5">
              {filteredList.length === 0 && (
                <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
                  <Users size={40} className="mb-3 opacity-30" />
                  {totalPeople === 0 ? (
                    <>
                      <p className="font-medium text-sm">{t('muster:accountability.emptyTitle')}</p>
                      <p className="text-xs mt-1 max-w-xs">{t('muster:accountability.emptyDesc')}</p>
                    </>
                  ) : !showSafePeople && accountedFor === totalPeople ? (
                    <>
                      <p className="font-medium text-sm text-green-600 dark:text-green-400">{t('muster:accountability.allAccountedFor')}</p>
                      <p className="text-xs mt-1">{t('muster:accountability.tapShowSafe')}</p>
                    </>
                  ) : (
                    <>
                      <p className="font-medium text-sm">{t('muster:accountability.noSearchResults')}</p>
                      <p className="text-xs mt-1">{t('muster:accountability.tryClearing')}</p>
                    </>
                  )}
                </div>
              )}
              {filteredList.map((person) => {
                const avatarBg = person.type === 'staff' ? 'bg-purple-500' : person.type === 'visitor' ? 'bg-blue-500' : person.type === 'member' ? 'bg-purple-500' : 'bg-orange-500';
                const typeBadge = person.type === 'staff' ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300' : person.type === 'visitor' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' : person.type === 'member' ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300' : 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300';
                const initials = person.name.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2);
                const cardBg = person.needsEvacuationAssistance
                  ? person.accounted
                    ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-400 dark:border-amber-600'
                    : 'bg-amber-50 dark:bg-amber-900/30 border-amber-500 dark:border-amber-500'
                  : person.accounted
                  ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
                  : 'bg-white dark:bg-slate-800 border-gray-200 dark:border-gray-600';

                return (
                  <div
                    key={person.id}
                    className={`rounded-lg border transition-all overflow-hidden ${cardBg}`}
                    data-testid={`person-${person.id}`}
                  >
                    {person.needsEvacuationAssistance && (
                      <div className="flex items-center gap-1.5 px-3 py-1 bg-amber-400 dark:bg-amber-500">
                        <Accessibility size={12} className="text-amber-900 flex-shrink-0" />
                        <span className="text-amber-900 text-[10px] font-black uppercase tracking-wide">{t('muster:stats.peepRequirement')}</span>
                      </div>
                    )}
                    <div className="flex items-center gap-2.5 sm:gap-3 px-3 py-2.5">
                    {/* Avatar */}
                    <div className={`w-8 h-8 sm:w-9 sm:h-9 flex-shrink-0 rounded-full flex items-center justify-center ${avatarBg}`}>
                      <span className="text-white font-bold text-xs">{initials}</span>
                    </div>

                    {/* Info — grows to fill space */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <p className="font-semibold text-fixed text-sm leading-tight truncate">{person.name}</p>
                        {person.needsEvacuationAssistance && (
                          <span title={t('muster:stats.peepRequirement')} className="flex-shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-amber-200 text-amber-900 dark:bg-amber-800/60 dark:text-amber-200 border border-amber-400 dark:border-amber-500">
                            <Accessibility size={11} /> {t('muster:stats.peep')}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                        <span className={`inline-block px-1.5 py-0.5 rounded text-[9px] font-semibold ${typeBadge}`}>
                          {person.type === 'staff' ? t('common:type.staff') : person.type === 'visitor' ? t('common:type.visitor') : person.type === 'contractor' ? t('common:type.contractor') : t('common:type.member')}
                        </span>
                        <span className="text-[11px] text-variable truncate max-w-[120px] sm:max-w-none">{person.type === 'staff' ? person.department : person.company || t('common:noCompany')}</span>
                        {person.location && person.location !== 'Not specified' && (
                          <span className={`hidden sm:inline-flex items-center gap-0.5 text-[10px] ${!person.accounted ? 'text-red-500 dark:text-red-400 font-medium' : 'text-gray-400 dark:text-gray-500'}`}>
                            <MapPin size={9} className="flex-shrink-0" />{person.location}
                          </span>
                        )}
                        <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                          <Clock size={9} />{formatTimeLocale(person.checkedInAt)}
                        </span>
                      </div>
                    </div>

                    {/* Actions — always inline, right-aligned */}
                    {hasActiveEvacuation && (
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        {person.accounted ? (
                          <span className="hidden sm:inline-flex items-center gap-1 text-xs font-semibold text-green-700 bg-green-100 dark:bg-green-900/30 dark:text-green-400 px-2 py-1 rounded-full whitespace-nowrap" data-testid={`badge-safe-${person.id}`}>
                            <CheckCircle size={11} />{t('muster:stats.safeLabel')}
                          </span>
                        ) : (
                          <>
                            <span className="hidden sm:inline-flex items-center gap-1 text-xs font-semibold text-red-700 bg-red-100 dark:bg-red-900/30 dark:text-red-400 px-2 py-1 rounded-full whitespace-nowrap" data-testid={`badge-unsafe-${person.id}`}>
                              <XCircle size={11} />{t('muster:stats.missing')}
                            </span>
                            {person.type !== 'member' && (
                              <Button
                                variant="outline"
                                size="sm"
                                className={`h-7 w-7 p-0 flex-shrink-0 ${person.hasEmail ? 'border-orange-300 text-orange-600 hover:bg-orange-50 dark:border-orange-700 dark:text-orange-400' : 'border-gray-200 text-gray-300 cursor-not-allowed dark:border-gray-700 dark:text-gray-600'}`}
                                disabled={!person.hasEmail || emailingPersonId === person.id}
                                onClick={() => person.hasEmail && emailPersonMutation.mutate({ personId: person.id, personType: person.type })}
                                title={person.hasEmail ? t('muster:accountability.emailTooltip', { name: person.name }) : t('muster:accountability.noEmailTooltip')}
                                data-testid={`button-email-${person.id}`}
                              >
                                {emailingPersonId === person.id ? (
                                  <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" /></svg>
                                ) : (
                                  <Mail size={12} />
                                )}
                              </Button>
                            )}
                          </>
                        )}
                        <Button
                          variant={person.accounted ? "outline" : "default"}
                          size="sm"
                          className={`${person.accounted ? "border-gray-300 text-gray-600 dark:border-gray-600 dark:text-gray-400 h-7 px-2.5" : "bg-green-600 hover:bg-green-700 text-white h-7 px-2.5 sm:px-3"} text-xs font-semibold whitespace-nowrap`}
                          onClick={() => toggleAccountedStatus(person.id, person.type)}
                          data-testid={`button-toggle-${person.id}`}
                        >
                          {person.accounted ? (
                            <><XCircle className="mr-1" size={11} />{t('common:undo')}</>
                          ) : (
                            <><CheckCircle className="mr-1" size={11} />{t('muster:accountability.markSafe')}</>
                          )}
                        </Button>
                      </div>
                    )}
                    </div>
                  </div>
                );
              })}
            </div>
          </GlassCard>
        </div>
        
        </div>

      {/* End Evacuation confirmation dialog */}
      {showEndEvacDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setShowEndEvacDialog(false)}>
          <div className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl max-w-md w-full mx-4 p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4">
              <ShieldAlert className="w-7 h-7 text-red-600 shrink-0" />
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">{t('muster:endEvacDialog.title')}</h2>
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-300 mb-6">
              {t('muster:endEvacDialog.message')}
            </p>
            <div className="flex flex-col gap-3">
              <Button
                className="w-full bg-red-700 hover:bg-red-800 text-white"
                disabled={completeEvacuationMutation.isPending}
                onClick={() => completeEvacuationMutation.mutate('check_out_all')}
              >
                {completeEvacuationMutation.isPending ? t('muster:endEvacDialog.ending') : t('muster:endEvacDialog.endAndCheckOut')}
              </Button>
              <Button
                variant="outline"
                className="w-full border-red-300 text-red-700 hover:bg-red-50 dark:border-red-700 dark:text-red-300"
                disabled={completeEvacuationMutation.isPending}
                onClick={() => completeEvacuationMutation.mutate('keep_checked_in')}
              >
                {completeEvacuationMutation.isPending ? t('muster:endEvacDialog.ending') : t('muster:endEvacDialog.endAndKeep')}
              </Button>
              <Button variant="ghost" className="w-full text-gray-600" onClick={() => setShowEndEvacDialog(false)}>
                {t('common:cancel')}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
