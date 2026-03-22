import { useState, useEffect, useRef, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
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
  User,
  UserCheck,
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
  EyeOff
} from "lucide-react";

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
  const { toast } = useToast();
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

  const formatElapsed = (secs: number) => {
    const m = Math.floor(secs / 60).toString().padStart(2, '0');
    const s = (secs % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  const { data: musterList = [], isLoading } = useQuery<MusterListItem[]>({
    queryKey: ["/api/muster"],
    refetchInterval: 5000, // Poll every 5 seconds for live updates
  });

  // Check for active evacuation
  const { data: activeEvacuation } = useQuery<ActiveEvacuation>({
    queryKey: ["/api/evacuation/status"],
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
        ws.send(JSON.stringify({
          type: 'register',
          customerId: activeEvacuation?.customerId || '',
          evacuationId: activeEvacuation?.evacuationId || 'muster-standby'
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
        title: "Update Failed",
        description: error.message || "Failed to update accounted status",
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
        title: "Alert Sent Successfully",
        description: `Emergency alert sent to ${data.sentCount} people out of ${data.totalPersonnel} on-site personnel`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Alert Failed",
        description: error.message || "Failed to send emergency alert",
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
      const zoneLabel = selectedZones.size > 0 ? ` in ${selectedZones.size} zone${selectedZones.size !== 1 ? 's' : ''}` : '';
      toast({
        title: `Personnel Marked Safe${zoneLabel}`,
        description: `Successfully marked ${data.updatedCount} out of ${data.totalPersonnel} personnel as safe`,
      });
    },
    onError: (error: any, _variables, context) => {
      if (context?.previousData) {
        queryClient.setQueryData(["/api/muster"], context.previousData);
      }
      toast({
        title: "Mark All Safe Failed", 
        description: error.message || "Failed to mark all personnel as safe",
        variant: "destructive",
      });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/muster"] });
    },
  });

  // Mutation to activate Fire Marshal emergency system
  const activateFireMarshalMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/emergency/activate", {
        selectedZones: selectedZones.size > 0 ? Array.from(selectedZones) : undefined,
        isDrill: isDrillMode,
      });
      return await response.json();
    },
    onSuccess: (data) => {
      setEmergencyPhase('active');
      setEmergencyStartTime(new Date());
      if (data.evacuationId) setLastEvacuationId(data.evacuationId);
      toast({
        title: isDrillMode ? "Fire Drill Started" : "Emergency Notifications Sent",
        description: data.message || `Successfully notified all personnel & Fire Marshals via email.`,
      });
    },
    onError: (error: any) => {
      const errorMsg = error.message || "Failed to send emergency notifications";
      toast({
        title: "Email Alert Failed",
        description: errorMsg.includes("No people") 
          ? "No personnel found in the selected zones. Try selecting different zones or skip the email alert."
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
      toast({ title: "Reminder Sent", description: data.message || "Email reminder sent successfully" });
    },
    onError: (error: any) => {
      setEmailingPersonId(null);
      toast({ title: "Send Failed", description: error.message || "Failed to send email reminder", variant: "destructive" });
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
        title: "Export Successful",
        description: `Emergency muster list exported as ${filename}`,
      });
    } catch (error: any) {
      toast({
        title: "Export Failed",
        description: error.message || "Failed to export muster list",
        variant: "destructive",
      });
    }
  };

  // Apply zone filter first — when zones are selected, only include people assigned to those zones
  const zonedMusterList = selectedZones.size === 0
    ? musterList
    : musterList.filter(p => p.zoneId && selectedZones.has(p.zoneId));

  // Apply search and type filters on top of the zone-filtered list
  const [showSafePeople, setShowSafePeople] = useState(false);

  const filteredList = zonedMusterList.filter(person => {
    const matchesType = typeFilter === 'all' || person.type === typeFilter;
    const matchesSearch = searchTerm === '' || 
      (person.name && person.name.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (person.department && person.department.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (person.company && person.company.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesVisibility = showSafePeople || !person.accounted;
    return matchesType && matchesSearch && matchesVisibility;
  });

  // Summary stats reflect the zone-filtered list so counts match what's visible
  const totalPeople = zonedMusterList.length;
  const accountedFor = zonedMusterList.filter(p => p.accounted).length;
  const staffCount = zonedMusterList.filter(p => p.type === 'staff').length;
  const visitorCount = zonedMusterList.filter(p => p.type === 'visitor').length;
  const contractorCount = zonedMusterList.filter(p => p.type === 'contractor').length;
  const memberCount = zonedMusterList.filter(p => p.type === 'member').length;

  const zonesRequireSelection = showZoneSelector && zones.length > 0 && selectedZones.size === 0;

  const handleEmergencyButtonClick = () => {
    if (emergencyPhase === 'idle') {
      setEmergencyActive(true);
      setEmergencyPhase('send_alert');
      if (zones.length > 0) {
        setShowZoneSelector(true);
      }
    } else if (emergencyPhase === 'send_alert') {
      if (zonesRequireSelection) {
        toast({
          title: "Select Zones First",
          description: "Please select at least one evacuation zone before sending alerts",
          variant: "destructive",
        });
        return;
      }
      activateFireMarshalMutation.mutate();
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
        toast({ title: "No emails to send", description: "All on-site personnel are already accounted for, or have no email address on file." });
      } else {
        toast({
          title: `Nudge emails sent (${data.sent})`,
          description: `${data.sent} unaccounted ${data.sent === 1 ? 'person' : 'people'} emailed. ${data.skipped} already safe or no email.`,
        });
      }
    },
    onError: () => {
      toast({ title: "Failed to send nudge emails", variant: "destructive" });
    }
  });

  const completeEvacuationMutation = useMutation({
    mutationFn: (checkOutMode: 'keep_checked_in' | 'check_out_all') =>
      apiRequest("POST", "/api/emergency/complete-evacuation", { checkOutMode }),
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
        title: isDrillMode ? "Fire Drill Ended" : "Evacuation Ended",
        description: data?.checkOutMode === 'check_out_all'
          ? `All accounted personnel checked out. Incident report saved — view it in the header.`
          : `Evacuation closed. Personnel remain checked in. Incident report saved — view it in the header.`,
        duration: 6000,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/evacuation/status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/muster"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/incident-reports"] });
    },
    onError: () => {
      toast({ title: "Failed to end evacuation", description: "Please try again or use a Fire Marshal link.", variant: "destructive" });
    }
  });

  const copyMonitorLink = () => {
    if (!activeEvacuation?.evacuationId || !activeEvacuation?.customerId) {
      toast({ title: "No active evacuation", description: "Start an emergency first", variant: "destructive" });
      return;
    }
    const monitorUrl = `${window.location.origin}/monitor/${activeEvacuation.evacuationId}?customer=${encodeURIComponent(activeEvacuation.customerId)}`;
    navigator.clipboard.writeText(monitorUrl).then(() => {
      toast({ title: "Monitor link copied", description: "Share this read-only link with management" });
    }).catch(() => {
      toast({ title: "Monitor link", description: monitorUrl });
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
          <p className="text-sm font-medium">Loading emergency muster list...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-8 p-3 sm:p-6 rounded-xl bg-background min-h-screen">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-0">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-fixed">Emergency Muster</h2>
          <p className="text-variable mt-1 flex flex-wrap items-center gap-2 text-sm sm:text-base">
            <span className="hidden sm:inline">Real-time emergency evacuation management and accountability</span>
            <span className="sm:hidden">Real-time emergency evacuation</span>
            {wsConnected && (
              <span className="inline-flex items-center gap-1 text-xs bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 px-2 py-1 rounded-full">
                <span className="inline-block w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
                LIVE
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
                Zones {selectedZones.size > 0 && `(${selectedZones.size})`}
              </Button>
              {selectedZones.size > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={clearZoneSelection}
                  className="text-xs text-muted-foreground"
                >
                  Clear
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
                title="Send reminder email to all unaccounted personnel with a self-confirm safety link"
              >
                <BellRing size={14} className="mr-1" />
                {nudgeUnaccountedMutation.isPending ? "Sending..." : "Nudge Unaccounted"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={copyMonitorLink}
                className="text-xs border-purple-300 text-purple-700 hover:bg-purple-50 dark:border-purple-700 dark:text-purple-300"
                title="Copy a read-only monitor link to share with management"
              >
                <Copy size={14} className="mr-1" />
                Monitor Link
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
              Incident Report
            </Button>
          )}
          {/* Always-visible link to the full incident reports archive */}
          {emergencyPhase === 'idle' && (
            <a href="/incident-reports" className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium border border-gray-300 text-gray-600 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-400 dark:hover:bg-gray-800 transition-colors">
              <Download size={13} />
              All Reports
            </a>
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
              title="Toggle drill mode — emails will be clearly marked as a drill (not a real emergency)"
            >
              <ShieldAlert size={13} />
              {isDrillMode ? 'Drill ON' : 'Drill'}
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
              <span className="hidden sm:inline">{isDrillMode ? 'Start Drill' : 'Activate Emergency'}</span>
              <span className="sm:hidden">{isDrillMode ? 'Start Drill' : 'Activate'}</span>
            </Button>
          )}
        </div>
      </div>

      {emergencyActive && (
        isDrillMode ? (
          <div className="flex items-center justify-between gap-3 p-4 rounded-lg border-2 border-amber-500 bg-amber-50 dark:bg-amber-900/20">
            <div className="flex items-center gap-3">
              <ShieldAlert className="text-amber-600 flex-shrink-0 animate-pulse" size={24} />
              <div>
                <h3 className="text-base font-bold text-amber-800 dark:text-amber-200">🔶 FIRE DRILL IN PROGRESS</h3>
                <p className="text-sm text-amber-700 dark:text-amber-300">This is a scheduled drill — not a real emergency</p>
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
                <h3 className="text-base font-bold text-red-800 dark:text-red-200">EMERGENCY ACTIVE</h3>
                <p className="text-sm text-red-700 dark:text-red-300">All personnel must proceed to a safe location immediately</p>
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
        <GlassCard className="dark:glass-dark border-2 border-blue-200 dark:border-blue-800">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center flex-shrink-0">
                <ShieldAlert size={16} className="text-white" />
              </div>
              <div>
                <h3 className="text-base font-bold text-fixed">Emergency Readiness</h3>
                <p className="text-xs text-muted-foreground">Review before activating</p>
              </div>
            </div>
            <div className="flex gap-4 text-center">
              <div>
                <p className={`text-2xl font-black ${fireMarshals.length > 0 ? 'text-green-600 dark:text-green-400' : 'text-red-500'}`}>{fireMarshals.length}</p>
                <p className="text-[10px] text-muted-foreground">Marshals</p>
              </div>
              <div>
                <p className={`text-2xl font-black ${activeZones.length > 0 ? 'text-blue-600 dark:text-blue-400' : 'text-gray-400'}`}>{activeZones.length}</p>
                <p className="text-[10px] text-muted-foreground">Zones</p>
              </div>
              <div>
                <p className="text-2xl font-black text-emerald-600 dark:text-emerald-400">{totalPeople}</p>
                <p className="text-[10px] text-muted-foreground">On-Site</p>
              </div>
            </div>
          </div>

          {/* Fire Marshal quick access — QR codes right here */}
          {fireMarshals.length > 0 ? (
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Fire Marshal Access Links</p>
              <p className="text-xs text-muted-foreground mb-3">Share these links with your Fire Marshals now — they work without a login and update in real-time during an emergency.</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {fireMarshals.map((fm: any) => {
                  const marshalUrl = `${window.location.origin}/fire-marshal/${fm.fireMarshalUrlId}`;
                  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(marshalUrl)}&color=1e3a5f&bgcolor=eff6ff`;
                  const isShowingQr = showQrFor === `idle-${fm.id}`;
                  return (
                    <div key={fm.id} className="bg-white dark:bg-gray-800/50 rounded-lg p-2.5 border border-blue-200 dark:border-blue-700">
                      <div className="flex items-center justify-between gap-2 mb-1.5">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-fixed leading-tight">{fm.firstName} {fm.lastName}</p>
                          {fm.department && <p className="text-xs text-muted-foreground">{fm.department}</p>}
                        </div>
                        <div className="flex gap-1 flex-shrink-0">
                          <Button size="sm" variant="ghost" className={`h-7 w-7 p-0 ${isShowingQr ? 'bg-blue-100 dark:bg-blue-800/40 text-blue-700' : ''}`} onClick={() => setShowQrFor(isShowingQr ? null : `idle-${fm.id}`)} title="Show QR Code"><QrCode size={13} /></Button>
                          <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => { navigator.clipboard.writeText(marshalUrl); toast({ title: "Copied", description: `Link copied for ${fm.firstName}` }); }} title="Copy link"><Copy size={13} /></Button>
                          <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => window.open(marshalUrl, '_blank')} title="Open in new tab"><ExternalLink size={13} /></Button>
                        </div>
                      </div>
                      <p className="text-[10px] text-muted-foreground font-mono truncate bg-gray-50 dark:bg-gray-700/50 px-2 py-1 rounded">{marshalUrl}</p>
                      {isShowingQr && (
                        <div className="mt-2 flex flex-col items-center gap-1">
                          <img src={qrUrl} alt={`QR for ${fm.firstName}`} className="w-24 h-24 rounded bg-white border border-blue-200" />
                          <p className="text-[10px] text-muted-foreground">Scan to open on mobile</p>
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
                <p className="text-sm font-semibold text-red-700 dark:text-red-300">No Fire Marshals Assigned</p>
                <p className="text-xs text-red-600 dark:text-red-400">Go to Staff Management and enable Fire Marshal status for relevant staff members.</p>
              </div>
            </div>
          )}
        </GlassCard>
      )}

      {/* ── PROCESS PANEL: Activation Wizard (send_alert phase) ─────────────── */}
      {emergencyPhase === 'send_alert' && (
        <GlassCard className={`dark:glass-dark border-2 ${isDrillMode ? 'border-amber-500 dark:border-amber-600' : 'border-orange-500 dark:border-orange-600'}`}>
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-2">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${isDrillMode ? 'bg-amber-500' : 'bg-orange-500'}`}>
                <Siren size={16} className="text-white" />
              </div>
              <div>
                <h3 className="text-base font-bold text-fixed">{isDrillMode ? 'Activate Fire Drill' : 'Activate Emergency'}</h3>
                <p className="text-xs text-muted-foreground">Work through each step, then send the alert</p>
              </div>
            </div>
            <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-muted-foreground" onClick={() => { setEmergencyActive(false); setEmergencyPhase('idle'); setSelectedZones(new Set()); setShowZoneSelector(false); }} title="Cancel">
              <X size={16} />
            </Button>
          </div>

          <div className="space-y-5">
            {/* Step 1 — Emergency Type */}
            <div className="flex gap-3">
              <div className={`flex-shrink-0 w-7 h-7 rounded-full text-white font-bold text-sm flex items-center justify-center border-2 ${isDrillMode ? 'bg-amber-500 border-amber-600' : 'bg-orange-500 border-orange-600'}`}>1</div>
              <div className="flex-1">
                <h4 className="text-sm font-semibold text-fixed mb-2">Emergency Type</h4>
                <div className="flex gap-2">
                  <button onClick={() => setIsDrillMode(false)} className={`flex-1 px-3 py-2.5 rounded-lg text-sm font-medium border-2 transition-colors ${!isDrillMode ? 'bg-red-600 border-red-600 text-white' : 'bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:border-red-300'}`}>
                    <Siren size={14} className="inline mr-1.5" />Real Emergency
                  </button>
                  <button onClick={() => setIsDrillMode(true)} className={`flex-1 px-3 py-2.5 rounded-lg text-sm font-medium border-2 transition-colors ${isDrillMode ? 'bg-amber-500 border-amber-500 text-white' : 'bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:border-amber-300'}`}>
                    <ShieldAlert size={14} className="inline mr-1.5" />Fire Drill
                  </button>
                </div>
              </div>
            </div>

            {/* Step 2 — Zone Selection (only when zones are configured) */}
            {activeZones.length > 0 && (
              <div className="flex gap-3">
                <div className={`flex-shrink-0 w-7 h-7 rounded-full text-white font-bold text-sm flex items-center justify-center border-2 ${isDrillMode ? 'bg-amber-500 border-amber-600' : 'bg-orange-500 border-orange-600'}`}>2</div>
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-sm font-semibold text-fixed">Select Zones to Evacuate</h4>
                    <span className="text-xs text-muted-foreground">{selectedZones.size === 0 ? 'All zones' : `${selectedZones.size} selected`}</span>
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
                  {selectedZones.size === 0 && <p className="text-xs text-muted-foreground mt-1.5">Leave unselected to alert all zones</p>}
                </div>
              </div>
            )}

            {/* Step 3 (or 2 if no zones) — Share Fire Marshal Links */}
            {fireMarshals.length > 0 && (
              <div className="flex gap-3">
                <div className={`flex-shrink-0 w-7 h-7 rounded-full text-white font-bold text-sm flex items-center justify-center border-2 ${isDrillMode ? 'bg-amber-500 border-amber-600' : 'bg-orange-500 border-orange-600'}`}>{activeZones.length > 0 ? 3 : 2}</div>
                <div className="flex-1">
                  <h4 className="text-sm font-semibold text-fixed mb-1">Share Fire Marshal Links</h4>
                  <p className="text-xs text-muted-foreground mb-2">Send these to your Fire Marshals — they open a live muster view on their phone, no login required.</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {fireMarshals.map((fm: any) => {
                      const marshalUrl = `${window.location.origin}/fire-marshal/${fm.fireMarshalUrlId}`;
                      const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(marshalUrl)}&color=1e3a5f&bgcolor=eff6ff`;
                      const isShowingQr = showQrFor === `pre-${fm.id}`;
                      return (
                        <div key={fm.id} className="bg-white dark:bg-gray-800/50 rounded-lg p-2.5 border border-gray-200 dark:border-gray-600">
                          <div className="flex items-center justify-between gap-2 mb-1.5">
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-fixed leading-tight">{fm.firstName} {fm.lastName}</p>
                              {fm.department && <p className="text-xs text-muted-foreground">{fm.department}</p>}
                            </div>
                            <div className="flex gap-1 flex-shrink-0">
                              <Button size="sm" variant="ghost" className={`h-7 w-7 p-0 ${isShowingQr ? 'bg-blue-100 dark:bg-blue-800/40 text-blue-700' : ''}`} onClick={() => setShowQrFor(isShowingQr ? null : `pre-${fm.id}`)} title="Show QR Code"><QrCode size={13} /></Button>
                              <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => { navigator.clipboard.writeText(marshalUrl); toast({ title: "Copied", description: `Fire Marshal link copied for ${fm.firstName}` }); }} title="Copy link"><Copy size={13} /></Button>
                              <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => window.open(marshalUrl, '_blank')} title="Open link"><ExternalLink size={13} /></Button>
                            </div>
                          </div>
                          <p className="text-[10px] text-muted-foreground font-mono truncate bg-gray-50 dark:bg-gray-700/50 px-2 py-1 rounded">{marshalUrl}</p>
                          {isShowingQr && (
                            <div className="mt-2 flex flex-col items-center gap-1">
                              <img src={qrUrl} alt={`QR for ${fm.firstName}`} className="w-24 h-24 rounded bg-white border border-gray-200" />
                              <p className="text-[10px] text-muted-foreground">Scan to open on mobile</p>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* Final Step — Send Alert */}
            <div className="flex gap-3">
              <div className={`flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center ${isDrillMode ? 'bg-amber-500' : 'bg-red-600'}`}>
                <Mail size={14} className="text-white" />
              </div>
              <div className="flex-1">
                <h4 className="text-sm font-semibold text-fixed mb-1">{isDrillMode ? 'Send Drill Alert to All Personnel' : 'Send Emergency Alert to All Personnel'}</h4>
                <Button onClick={() => activateFireMarshalMutation.mutate()} disabled={activateFireMarshalMutation.isPending} className={`w-full sm:w-auto font-bold animate-pulse ${isDrillMode ? 'bg-amber-600 hover:bg-amber-700 text-white' : 'bg-red-600 hover:bg-red-700 text-white'}`}>
                  {activateFireMarshalMutation.isPending ? 'Sending alerts...' : (<><Mail size={16} className="mr-2" />{isDrillMode ? 'Send Fire Drill Alert Now' : 'Send Emergency Alert Now'}</>)}
                </Button>
                {isDrillMode && <p className="text-[10px] text-amber-600 dark:text-amber-400 mt-1">All emails will be clearly marked as a FIRE DRILL</p>}
              </div>
            </div>
          </div>
        </GlassCard>
      )}

      {/* ── PROCESS PANEL: Active Emergency Checklist ─────────────────────────── */}
      {emergencyPhase === 'active' && (
        <GlassCard className={`dark:glass-dark border-2 ${isDrillMode ? 'border-amber-500 dark:border-amber-600' : 'border-red-500 dark:border-red-600'}`}>
          <div className="flex items-center gap-2 mb-4">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${isDrillMode ? 'bg-amber-500' : 'bg-red-600'}`}>
              <ClipboardList size={16} className="text-white" />
            </div>
            <div>
              <h3 className="text-base font-bold text-fixed">{isDrillMode ? 'Drill Response Checklist' : 'Emergency Response Checklist'}</h3>
              <p className="text-xs text-muted-foreground">Follow each step to manage the {isDrillMode ? 'drill' : 'emergency'}</p>
            </div>
          </div>

          <div className="space-y-3">
            {/* Step 1 — Alert Sent (always complete) */}
            <div className="flex gap-3 p-3 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800">
              <div className="flex-shrink-0 w-7 h-7 rounded-full bg-green-500 text-white flex items-center justify-center"><CheckCircle size={15} /></div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <h4 className="text-sm font-semibold text-green-800 dark:text-green-200">{isDrillMode ? 'Drill Alert Sent' : 'Emergency Alert Sent'}</h4>
                  {emergencyStartTime && <span className="text-xs text-green-600 dark:text-green-400 flex-shrink-0 font-mono">{emergencyStartTime.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>}
                </div>
                <p className="text-xs text-green-700 dark:text-green-300">All on-site personnel notified via email</p>
              </div>
            </div>

            {/* Step 2 — Fire Marshal Deployment */}
            <div className={`flex gap-3 p-3 rounded-lg border ${fireMarshals.length > 0 ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800' : 'bg-gray-50 dark:bg-gray-800/30 border-gray-200 dark:border-gray-700'}`}>
              <div className={`flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center ${fireMarshals.length > 0 ? 'bg-blue-600 text-white' : 'bg-gray-400 text-white'}`}><HardHat size={15} /></div>
              <div className="flex-1 min-w-0">
                <h4 className="text-sm font-semibold text-fixed mb-2">Deploy Fire Marshals</h4>
                {fireMarshals.length > 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {fireMarshals.map((fm: any) => {
                      const marshalUrl = `${window.location.origin}/fire-marshal/${fm.fireMarshalUrlId}`;
                      const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(marshalUrl)}&color=1e3a5f&bgcolor=eff6ff`;
                      const isShowingQr = showQrFor === `active-${fm.id}`;
                      return (
                        <div key={fm.id} className="bg-white dark:bg-gray-800/50 rounded-lg p-2.5 border border-blue-200 dark:border-blue-700">
                          <div className="flex items-center justify-between gap-2 mb-1.5">
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-fixed leading-tight">{fm.firstName} {fm.lastName}</p>
                              {fm.department && <p className="text-xs text-muted-foreground">{fm.department}</p>}
                            </div>
                            <div className="flex gap-1 flex-shrink-0">
                              <Button size="sm" variant="ghost" className={`h-7 w-7 p-0 ${isShowingQr ? 'bg-blue-100 dark:bg-blue-800/40 text-blue-700' : ''}`} onClick={() => setShowQrFor(isShowingQr ? null : `active-${fm.id}`)} title="Show QR Code"><QrCode size={13} /></Button>
                              <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => { navigator.clipboard.writeText(marshalUrl); toast({ title: "Copied", description: `Fire Marshal link copied for ${fm.firstName}` }); }} title="Copy link"><Copy size={13} /></Button>
                              <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => window.open(marshalUrl, '_blank')} title="Open in new tab"><ExternalLink size={13} /></Button>
                            </div>
                          </div>
                          <p className="text-[10px] text-blue-600 dark:text-blue-400 font-mono truncate bg-blue-50 dark:bg-blue-900/30 px-2 py-1 rounded">{marshalUrl}</p>
                          {isShowingQr && (
                            <div className="mt-2 flex items-center gap-3">
                              <img src={qrUrl} alt={`QR for ${fm.firstName}`} className="w-28 h-28 rounded bg-white border border-blue-200 flex-shrink-0" />
                              <p className="text-xs text-muted-foreground">Scan to open the Fire Marshal mobile view — no login required</p>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">No Fire Marshals configured. Assign them in Staff Management.</p>
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
                      <h4 className="text-sm font-semibold text-fixed">Account for All Personnel</h4>
                      <span className={`text-xs font-bold flex-shrink-0 ${allSafe ? 'text-green-600 dark:text-green-400' : 'text-orange-600 dark:text-orange-400'}`}>{accountedFor}/{totalPeople}</span>
                    </div>
                    <Progress value={totalPeople > 0 ? (accountedFor / totalPeople) * 100 : 0} className={`h-2 mb-2 ${allSafe ? '[&>div]:bg-green-500' : '[&>div]:bg-orange-500'}`} />
                    {!allSafe && totalPeople > 0 && (
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs text-orange-700 dark:text-orange-300">{totalPeople - accountedFor} person{totalPeople - accountedFor !== 1 ? 's' : ''} unaccounted for</p>
                        <Button size="sm" variant="outline" onClick={() => nudgeUnaccountedMutation.mutate()} disabled={nudgeUnaccountedMutation.isPending} className="text-xs h-7 border-orange-300 text-orange-700 hover:bg-orange-50 dark:border-orange-700 dark:text-orange-300 flex-shrink-0">
                          <BellRing size={12} className="mr-1" />{nudgeUnaccountedMutation.isPending ? 'Sending...' : 'Nudge Unaccounted'}
                        </Button>
                      </div>
                    )}
                    {allSafe && <p className="text-xs text-green-700 dark:text-green-300 font-semibold">✓ All personnel accounted for</p>}
                  </div>
                </div>
              );
            })()}

            {/* Step 4 — End Incident */}
            <div className="flex gap-3 p-3 rounded-lg bg-gray-50 dark:bg-gray-800/30 border border-gray-200 dark:border-gray-700">
              <div className={`flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center ${accountedFor === totalPeople && totalPeople > 0 ? 'bg-red-600 text-white' : 'bg-gray-300 dark:bg-gray-600 text-gray-500 dark:text-gray-300'}`}><ShieldAlert size={15} /></div>
              <div className="flex-1 min-w-0">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <h4 className="text-sm font-semibold text-fixed">End the Incident</h4>
                    <p className="text-xs text-muted-foreground">Save the incident report and close this {isDrillMode ? 'drill' : 'event'}</p>
                  </div>
                  <div className="flex gap-2 flex-shrink-0">
                    <Button size="sm" variant="outline" onClick={copyMonitorLink} className="text-xs border-purple-300 text-purple-700 hover:bg-purple-50 dark:border-purple-700 dark:text-purple-300" title="Share a read-only live view with management">
                      <Copy size={12} className="mr-1" />Monitor Link
                    </Button>
                    <Button size="sm" onClick={() => setShowEndEvacDialog(true)} disabled={completeEvacuationMutation.isPending} className="text-xs text-white border-0 bg-red-600 hover:bg-red-700">
                      <ShieldAlert size={12} className="mr-1" />End Evacuation
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
        <GlassCard className="dark:glass-dark">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <MapPin className="text-blue-600" size={18} />
              <h3 className="text-sm font-semibold text-fixed">Select Zones to Evacuate</h3>
            </div>
            <p className="text-xs text-muted-foreground">
              {selectedZones.size === 0 ? "No zones selected - all zones will be alerted" : `${selectedZones.size} zone${selectedZones.size > 1 ? 's' : ''} selected`}
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
              Only personnel in selected zones will receive evacuation alerts
            </p>
          )}

          {zoneMapUrl && (
            <div className="mt-4 pt-4 border-t border-border/50">
              <div className="flex items-center gap-2 mb-3">
                <Map className="text-blue-600" size={16} />
                <h4 className="text-sm font-medium text-fixed">Zone Map</h4>
                <span className="text-[10px] text-muted-foreground bg-muted px-2 py-0.5 rounded-full">Click zones on map to select</span>
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
          <GlassCard hover className={`dark:glass-dark bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-emerald-900/20 dark:to-teal-900/20 border-2 cursor-pointer transition-all !p-3 sm:!p-5 ${typeFilter === 'all' ? 'border-emerald-500 dark:border-emerald-400 ring-2 ring-emerald-300 dark:ring-emerald-600' : 'border-emerald-200 dark:border-emerald-800'}`} onClick={() => setTypeFilter('all')}>
            <div className="flex items-start justify-between gap-1">
              <div className="min-w-0">
                <p className="text-emerald-700 dark:text-emerald-300 text-[10px] sm:text-sm font-semibold leading-tight">Total</p>
                <p className="text-3xl sm:text-5xl font-black text-emerald-700 dark:text-emerald-300 leading-none mt-1" data-testid="stat-total-people">
                  {totalPeople}
                </p>
                <p className="text-[10px] sm:text-xs text-emerald-600 dark:text-emerald-400 mt-1 font-medium">On-Site</p>
              </div>
              <div className="w-8 h-8 sm:w-12 sm:h-12 bg-emerald-200 dark:bg-emerald-800/50 rounded-xl flex items-center justify-center shrink-0">
                <Users className="text-emerald-700 dark:text-emerald-300" size={16} />
              </div>
            </div>
          </GlassCard>

          <GlassCard hover className="dark:glass-dark border-2 border-transparent !p-3 sm:!p-5">
            <div className="flex items-start justify-between gap-1">
              <div className="min-w-0 flex-1">
                <p className="text-variable text-[10px] sm:text-sm font-semibold leading-tight">Accounted</p>
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

          <GlassCard hover className={`dark:glass-dark border-2 !p-3 sm:!p-5 transition-all ${(totalPeople - accountedFor) > 0 ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800' : 'border-transparent'}`}>
            <div className="flex items-start justify-between gap-1">
              <div className="min-w-0">
                <p className={`text-[10px] sm:text-sm font-semibold leading-tight ${(totalPeople - accountedFor) > 0 ? 'text-red-700 dark:text-red-300' : 'text-variable'}`}>Missing</p>
                <p className={`text-3xl sm:text-5xl font-black leading-none mt-1 ${(totalPeople - accountedFor) > 0 ? 'text-red-600 dark:text-red-400' : 'text-gray-400 dark:text-gray-500'}`} data-testid="stat-unaccounted">
                  {totalPeople - accountedFor}
                </p>
                <p className={`text-[10px] sm:text-xs mt-1 font-medium ${(totalPeople - accountedFor) > 0 ? 'text-red-600 dark:text-red-400' : 'text-gray-400 dark:text-gray-500'}`}>
                  {(totalPeople - accountedFor) === 0 ? 'All safe' : 'Unaccounted'}
                </p>
              </div>
              <div className={`w-8 h-8 sm:w-12 sm:h-12 rounded-xl flex items-center justify-center shrink-0 ${(totalPeople - accountedFor) > 0 ? 'bg-red-100 dark:bg-red-900/30' : 'bg-gray-100 dark:bg-gray-800/30'}`}>
                <ShieldAlert className={`${(totalPeople - accountedFor) > 0 ? 'text-red-600 dark:text-red-400' : 'text-gray-400 dark:text-gray-500'}`} size={16} />
              </div>
            </div>
          </GlassCard>
        </div>

        {/* Row 2: Category breakdown — tap to filter */}
        <div className={`grid gap-2 sm:gap-3 ${memberCount > 0 ? 'grid-cols-4' : 'grid-cols-3'}`}>
          <GlassCard hover className={`dark:glass-dark cursor-pointer transition-all border-2 !p-2.5 sm:!p-4 ${typeFilter === 'staff' ? 'border-purple-500 dark:border-purple-400 ring-2 ring-purple-300 dark:ring-purple-600' : 'border-transparent'}`} onClick={() => setTypeFilter(typeFilter === 'staff' ? 'all' : 'staff')}>
            <div className="text-center">
              <p className="text-xl sm:text-3xl font-black text-purple-600 dark:text-purple-400 leading-none" data-testid="stat-staff-count">{staffCount}</p>
              <p className="text-[10px] sm:text-xs text-variable font-semibold mt-1 leading-tight">Staff</p>
            </div>
          </GlassCard>

          <GlassCard hover className={`dark:glass-dark cursor-pointer transition-all border-2 !p-2.5 sm:!p-4 ${typeFilter === 'visitor' ? 'border-blue-500 dark:border-blue-400 ring-2 ring-blue-300 dark:ring-blue-600' : 'border-transparent'}`} onClick={() => setTypeFilter(typeFilter === 'visitor' ? 'all' : 'visitor')}>
            <div className="text-center">
              <p className="text-xl sm:text-3xl font-black text-blue-600 dark:text-blue-400 leading-none" data-testid="stat-visitor-count">{visitorCount}</p>
              <p className="text-[10px] sm:text-xs text-variable font-semibold mt-1 leading-tight">Visitors</p>
            </div>
          </GlassCard>

          <GlassCard hover className={`dark:glass-dark cursor-pointer transition-all border-2 !p-2.5 sm:!p-4 ${typeFilter === 'contractor' ? 'border-orange-500 dark:border-orange-400 ring-2 ring-orange-300 dark:ring-orange-600' : 'border-transparent'}`} onClick={() => setTypeFilter(typeFilter === 'contractor' ? 'all' : 'contractor')}>
            <div className="text-center">
              <p className="text-xl sm:text-3xl font-black text-orange-600 dark:text-orange-400 leading-none" data-testid="stat-contractor-count">{contractorCount}</p>
              <p className="text-[10px] sm:text-xs text-variable font-semibold mt-1 leading-tight">Contractors</p>
            </div>
          </GlassCard>

          {memberCount > 0 && (
            <GlassCard hover className={`dark:glass-dark cursor-pointer transition-all border-2 !p-2.5 sm:!p-4 ${typeFilter === 'member' ? 'border-purple-500 dark:border-purple-400 ring-2 ring-purple-300 dark:ring-purple-600' : 'border-transparent'}`} onClick={() => setTypeFilter(typeFilter === 'member' ? 'all' : 'member')}>
              <div className="text-center">
                <p className="text-xl sm:text-3xl font-black text-purple-600 dark:text-purple-400 leading-none" data-testid="stat-member-count">{memberCount}</p>
                <p className="text-[10px] sm:text-xs text-variable font-semibold mt-1 leading-tight">Members</p>
              </div>
            </GlassCard>
          )}
        </div>
      </div>

      {/* Zone Sweep Status — shown during active evacuation when zones are configured */}
      {hasActiveEvacuation && activeZones.length > 0 && (
        <GlassCard className="dark:glass-dark">
          <div className="flex items-center gap-2 mb-1">
            <Footprints className="text-green-600 dark:text-green-400" size={18} />
            <h3 className="text-sm font-semibold text-fixed">Zone Sweep Status</h3>
            <span className="text-xs text-muted-foreground ml-auto">
              {zoneSweeps.length}/{activeZones.length} zones swept
            </span>
          </div>
          <p className="text-[11px] text-muted-foreground mb-3">
            Fire Marshals physically sweep their zone and mark it cleared via their dedicated mobile link. Status updates here in real-time.
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
                        <span>SWEPT</span>
                        {sweep.hasUnaccountedAtTime && (
                          <span className="text-amber-600 dark:text-amber-400 ml-1">⚠ override</span>
                        )}
                      </div>
                      <div className="text-muted-foreground mt-0.5 truncate">
                        {sweep.sweptByName}
                      </div>
                      <div className="text-muted-foreground">
                        {new Date(sweep.sweptAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>
                  ) : (
                    <div className="text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <Clock size={10} />
                        <span>Not swept</span>
                      </div>
                      {counts && counts.total > 0 && (
                        <div className={counts.safe === counts.total ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}>
                          {counts.safe}/{counts.total} safe
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

      {/* Search and Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <GlassCard className="dark:glass-dark">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
              <h3 className="text-base sm:text-lg font-semibold text-fixed">
                Personnel Accountability
                {selectedZones.size > 0 && (
                  <span className="ml-2 text-xs font-normal bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 px-2 py-1 rounded-full">
                    {selectedZones.size === 1 ? '1 zone' : `${selectedZones.size} zones`}
                    <button onClick={() => setSelectedZones(new Set())} className="ml-1 hover:text-amber-900 dark:hover:text-amber-100" title="Clear zone filter">&times;</button>
                  </span>
                )}
                {typeFilter !== 'all' && (
                  <span className="ml-2 text-xs font-normal bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 px-2 py-1 rounded-full">
                    {typeFilter === 'staff' ? 'Staff' : typeFilter === 'visitor' ? 'Visitors' : typeFilter === 'contractor' ? 'Contractors' : 'Members'}
                    <button onClick={() => setTypeFilter('all')} className="ml-1 hover:text-blue-900 dark:hover:text-blue-100">&times;</button>
                  </span>
                )}
              </h3>
              <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
                {hasActiveEvacuation && (
                  <Button 
                    variant="outline" 
                    onClick={() => markAllSafeMutation.mutate()}
                    disabled={markAllSafeMutation.isPending}
                    data-testid="button-mark-all-safe"
                    className="w-full sm:w-auto text-sm py-2.5 sm:py-2 font-semibold"
                    title={selectedZones.size > 0 ? `Mark all safe in selected zone(s) only` : `Mark all on-site personnel as safe`}
                  >
                    <CheckCircle className="mr-2 flex-shrink-0" size={16} />
                    {markAllSafeMutation.isPending
                      ? "Marking..."
                      : selectedZones.size > 0
                        ? `Mark Zone${selectedZones.size > 1 ? 's' : ''} Safe`
                        : "Mark All Safe"}
                  </Button>
                )}
                {accountedFor > 0 && (
                  <Button
                    variant="outline"
                    onClick={() => setShowSafePeople(prev => !prev)}
                    data-testid="button-toggle-safe-people"
                    className="w-full sm:w-auto text-sm py-2.5 sm:py-2 font-semibold"
                  >
                    {showSafePeople ? (
                      <><EyeOff className="mr-2 flex-shrink-0" size={16} />Hide Safe ({accountedFor})</>
                    ) : (
                      <><Eye className="mr-2 flex-shrink-0" size={16} />Show Safe ({accountedFor})</>
                    )}
                  </Button>
                )}
              </div>
            </div>
            
            <div className="mb-6">
              <Label htmlFor="search" className="text-sm font-medium text-variable mb-2 block">
                Search Personnel
              </Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-variable" size={16} />
                <Input
                  id="search"
                  type="text"
                  placeholder="Search by name, department, or company..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 w-full px-4 py-3 rounded-xl border border-white/30 bg-white/50 dark:bg-slate-800/50 focus:outline-none focus:ring-2 focus:ring-blue-500 text-fixed"
                  data-testid="input-search-personnel"
                />
              </div>
            </div>
            
            <div className="space-y-2 sm:space-y-3 max-h-[55vh] sm:max-h-[60vh] overflow-y-auto">
              {filteredList.map((person) => (
                <div 
                  key={person.id} 
                  className={`flex items-center justify-between p-3 sm:p-4 rounded-xl transition-all gap-2 sm:gap-3 ${
                    person.accounted 
                      ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800' 
                      : 'bg-white/50 dark:bg-slate-800/50 border border-gray-200 dark:border-gray-600'
                  }`}
                  data-testid={`person-${person.id}`}
                >
                  <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0">
                    <div className={`w-10 h-10 sm:w-11 sm:h-11 flex-shrink-0 rounded-full flex items-center justify-center ${
                      person.type === 'staff' ? 'bg-purple-500' : 
                      person.type === 'visitor' ? 'bg-blue-500' : 
                      person.type === 'member' ? 'bg-purple-500' : 'bg-orange-500'
                    }`}>
                      <span className="text-white font-bold text-sm">
                        {person.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
                      </span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <p className="font-semibold text-fixed text-sm sm:text-base truncate leading-tight">{person.name}</p>
                        {person.needsEvacuationAssistance && (
                          <span title="Requires Evacuation Assistance (PEEP)" className="flex-shrink-0 inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 border border-amber-400 dark:border-amber-600">
                            ♿ PEEP
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-1 mt-0.5">
                        <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                          person.type === 'staff' ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300' :
                          person.type === 'visitor' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' :
                          person.type === 'member' ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300' :
                          'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300'
                        }`}>{person.type}</span>
                        <span className="text-[11px] text-variable truncate max-w-[100px] sm:max-w-[140px]">
                          {person.type === 'staff' ? person.department : person.company}
                        </span>
                      </div>
                      {/* Last known location — shown prominently for unaccounted people, subtly for accounted */}
                      {(person.location && person.location !== 'Not specified') && (
                        <p className={`text-[11px] mt-1 flex items-center gap-1 ${
                          !person.accounted
                            ? 'text-red-600 dark:text-red-400 font-medium'
                            : 'text-gray-400 dark:text-gray-500'
                        }`}>
                          <MapPin size={10} className="flex-shrink-0" />
                          Last known: {person.location}
                        </p>
                      )}
                      <p className="text-[10px] text-muted-foreground mt-0.5 flex items-center gap-1">
                        <Clock size={9} />
                        {new Date(person.checkedInAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
                    {hasActiveEvacuation && (
                      person.accounted ? (
                        <span className="hidden sm:inline-flex items-center gap-1 text-xs font-semibold text-green-700 bg-green-100 px-2 py-1 rounded-full whitespace-nowrap" data-testid={`badge-safe-${person.id}`}>
                          <CheckCircle size={11} />
                          Safe
                        </span>
                      ) : (
                        <span className="hidden sm:inline-flex items-center gap-1 text-xs font-semibold text-red-700 bg-red-100 px-2 py-1 rounded-full whitespace-nowrap" data-testid={`badge-unsafe-${person.id}`}>
                          <XCircle size={11} />
                          Unsafe
                        </span>
                      )
                    )}
                    {hasActiveEvacuation && !person.accounted && person.type !== 'member' && (
                      <Button
                        variant="outline"
                        size="sm"
                        className={`h-8 w-8 p-0 flex-shrink-0 ${
                          person.hasEmail
                            ? 'border-orange-300 text-orange-600 hover:bg-orange-50 dark:border-orange-700 dark:text-orange-400 dark:hover:bg-orange-900/20'
                            : 'border-gray-200 text-gray-300 cursor-not-allowed dark:border-gray-700 dark:text-gray-600'
                        }`}
                        disabled={!person.hasEmail || emailingPersonId === person.id}
                        onClick={() => person.hasEmail && emailPersonMutation.mutate({ personId: person.id, personType: person.type })}
                        title={person.hasEmail ? `Send email reminder to ${person.name}` : 'No email address on file'}
                        data-testid={`button-email-${person.id}`}
                      >
                        {emailingPersonId === person.id ? (
                          <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24" fill="none">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                          </svg>
                        ) : (
                          <Mail size={13} />
                        )}
                      </Button>
                    )}
                    <Button
                      variant={person.accounted ? "outline" : "default"}
                      className={`${person.accounted ? "border-gray-300 text-gray-600" : "bg-green-600 hover:bg-green-700 text-white"} text-xs sm:text-sm font-semibold px-3 sm:px-4 py-2 h-auto whitespace-nowrap`}
                      onClick={() => toggleAccountedStatus(person.id, person.type)}
                      data-testid={`button-toggle-${person.id}`}
                    >
                      {person.accounted ? (
                        <>
                          <XCircle className="mr-1 sm:mr-1.5" size={13} />
                          <span className="hidden sm:inline">Unmark</span>
                          <span className="sm:hidden">Undo</span>
                        </>
                      ) : (
                        <>
                          <CheckCircle className="mr-1 sm:mr-1.5" size={13} />
                          <span className="hidden sm:inline">Mark Safe</span>
                          <span className="sm:hidden">Safe</span>
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </GlassCard>
        </div>
        
        <GlassCard className="dark:glass-dark">
          <div className="flex items-center mb-6">
            <Phone className="mr-3 text-blue-600 dark:text-blue-400" size={24} />
            <h3 className="text-lg font-semibold text-fixed">Emergency Contacts</h3>
          </div>
          
          <div className="space-y-4">
            <div className="p-4 bg-red-50 dark:bg-red-900/20 rounded-xl border border-red-200 dark:border-red-800">
              <h4 className="font-medium text-red-800 dark:text-red-200 mb-2">Emergency Services</h4>
              <p className="text-red-700 dark:text-red-300 text-2xl font-bold">999</p>
            </div>
            
            {fireMarshals.length > 0 ? (
              <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-xl border border-blue-200 dark:border-blue-800">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="font-medium text-blue-800 dark:text-blue-200">Fire Marshal Links</h4>
                  <Badge variant="outline" className="text-xs text-blue-700 dark:text-blue-300 border-blue-300 dark:border-blue-600">
                    {fireMarshals.length} marshal{fireMarshals.length !== 1 ? 's' : ''}
                  </Badge>
                </div>
                <div className="space-y-3">
                  {fireMarshals.map((fm: any) => {
                    const marshalUrl = `${window.location.origin}/fire-marshal/${fm.fireMarshalUrlId}`;
                    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(marshalUrl)}&color=1e3a5f&bgcolor=eff6ff`;
                    const isShowingQr = showQrFor === fm.id;
                    return (
                      <div key={fm.id} className="bg-white dark:bg-blue-900/30 rounded-lg p-2.5 border border-blue-200 dark:border-blue-700">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <p className="text-blue-800 dark:text-blue-200 text-sm font-semibold leading-tight">{fm.firstName} {fm.lastName}</p>
                            {fm.department && <p className="text-blue-500 dark:text-blue-400 text-xs mt-0.5">{fm.department}</p>}
                          </div>
                          <div className="flex gap-1 flex-shrink-0">
                            <Button
                              size="sm"
                              variant="ghost"
                              className={`h-7 w-7 p-0 ${isShowingQr ? 'bg-blue-100 dark:bg-blue-800/40 text-blue-700 dark:text-blue-300' : ''}`}
                              title="Show QR Code"
                              onClick={() => setShowQrFor(isShowingQr ? null : fm.id)}
                            >
                              <QrCode size={14} />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 w-7 p-0"
                              title="Copy link"
                              onClick={() => {
                                navigator.clipboard.writeText(marshalUrl);
                                toast({ title: "Copied", description: `Fire Marshal link copied for ${fm.firstName}` });
                              }}
                            >
                              <Copy size={14} />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 w-7 p-0"
                              title="Open link"
                              onClick={() => window.open(marshalUrl, '_blank')}
                            >
                              <ExternalLink size={14} />
                            </Button>
                          </div>
                        </div>
                        {isShowingQr && (
                          <div className="mt-2.5 pt-2.5 border-t border-blue-200 dark:border-blue-700 flex flex-col items-center gap-2">
                            <img
                              src={qrUrl}
                              alt={`QR code for ${fm.firstName} ${fm.lastName}`}
                              className="w-28 h-28 rounded-lg border border-blue-200 dark:border-blue-600 bg-white"
                            />
                            <p className="text-[10px] text-blue-600 dark:text-blue-400 text-center leading-tight">
                              Scan to open Fire Marshal<br />view on mobile
                            </p>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-xl border border-blue-200 dark:border-blue-800">
                <h4 className="font-medium text-blue-800 dark:text-blue-200 mb-2">Fire Marshal</h4>
                <p className="text-blue-700 dark:text-blue-300">Contact Security</p>
                <p className="text-blue-600 dark:text-blue-400 text-sm">Call Reception</p>
              </div>
            )}
            
            {/* Zone Sweep Status — in sidebar beneath fire marshal links, during active evacuation */}
            {hasActiveEvacuation && activeZones.length > 0 && (
              <div className="p-3 bg-gray-50 dark:bg-gray-800/40 rounded-xl border border-gray-200 dark:border-gray-700">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-1.5">
                    <Footprints size={14} className="text-green-600 dark:text-green-400" />
                    <h4 className="font-medium text-gray-800 dark:text-gray-200 text-sm">Zone Sweep Progress</h4>
                  </div>
                  <span className="text-xs text-muted-foreground">{zoneSweeps.length}/{activeZones.length}</span>
                </div>
                <div className="space-y-1">
                  {activeZones.map(zone => {
                    const sweep = sweptZoneMap.get(zone.id);
                    return (
                      <div key={zone.id} className="flex items-center gap-2 text-xs">
                        <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: zone.color }} />
                        <span className={`flex-1 truncate ${sweep ? 'text-green-700 dark:text-green-400' : 'text-gray-500 dark:text-gray-400'}`}>
                          {zone.name}
                        </span>
                        {sweep ? (
                          <div className="flex items-center gap-1 flex-shrink-0">
                            <Footprints size={10} className="text-green-600 dark:text-green-400" />
                            <span className="text-green-600 dark:text-green-400 font-medium">
                              {new Date(sweep.sweptAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                            </span>
                            {sweep.hasUnaccountedAtTime && (
                              <span className="text-amber-500" title="Swept with unaccounted people">⚠</span>
                            )}
                          </div>
                        ) : (
                          <Clock size={10} className="text-gray-400 dark:text-gray-500 flex-shrink-0" />
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-xl border border-green-200 dark:border-green-800">
              <h4 className="font-medium text-green-800 dark:text-green-200 mb-2">Site Contact</h4>
              {companySettings?.phone ? (
                <a href={`tel:${companySettings.phone}`} className="text-green-700 dark:text-green-300 text-lg font-bold hover:underline block">
                  {companySettings.phone}
                </a>
              ) : (
                <>
                  <p className="text-green-700 dark:text-green-300">Control Room</p>
                  <p className="text-green-600 dark:text-green-400 text-sm">Call Reception</p>
                </>
              )}
            </div>
            
            <a href="tel:999" className="w-full">
              <Button className="w-full bg-red-600 hover:bg-red-700 text-white border-0" data-testid="button-call-emergency">
                <Phone className="mr-2" size={16} />
                Call 999 – Emergency Services
              </Button>
            </a>
            
            <Button 
              className="w-full" 
              variant="outline" 
              data-testid="button-send-alert"
              onClick={() => {
                const subject = "Emergency Muster Activation";
                const message = `Emergency muster has been activated at ${new Date().toLocaleString()}.\n\nAll on-site personnel must immediately proceed to the designated muster point.\n\nPlease follow your emergency procedures and await further instructions from the Fire Marshal.`;
                sendAlertMutation.mutate({ subject, message });
              }}
              disabled={sendAlertMutation.isPending}
            >
              <Mail className="mr-2" size={16} />
              {sendAlertMutation.isPending ? "Sending..." : "Send Alert Email"}
            </Button>
          </div>
        </GlassCard>
      </div>

      {/* End Evacuation confirmation dialog */}
      {showEndEvacDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setShowEndEvacDialog(false)}>
          <div className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl max-w-md w-full mx-4 p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4">
              <ShieldAlert className="w-7 h-7 text-red-600 shrink-0" />
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">End Evacuation?</h2>
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-300 mb-6">
              Ending the evacuation will mark it as complete and automatically save an incident report. Choose what to do with checked-in personnel:
            </p>
            <div className="flex flex-col gap-3">
              <Button
                className="w-full bg-red-700 hover:bg-red-800 text-white"
                disabled={completeEvacuationMutation.isPending}
                onClick={() => completeEvacuationMutation.mutate('check_out_all')}
              >
                {completeEvacuationMutation.isPending ? "Ending…" : "End & Check Out All Accounted"}
              </Button>
              <Button
                variant="outline"
                className="w-full border-red-300 text-red-700 hover:bg-red-50 dark:border-red-700 dark:text-red-300"
                disabled={completeEvacuationMutation.isPending}
                onClick={() => completeEvacuationMutation.mutate('keep_checked_in')}
              >
                {completeEvacuationMutation.isPending ? "Ending…" : "End & Keep Personnel Checked In"}
              </Button>
              <Button variant="ghost" className="w-full text-gray-600" onClick={() => setShowEndEvacDialog(false)}>
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
