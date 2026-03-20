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
  Footprints
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
      
      console.log('Connecting to WebSocket:', wsUrl, 'Host:', host);
      const ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        console.log('WebSocket connected');
        setWsConnected(true);
        
        ws.send(JSON.stringify({
          type: 'register',
          customerId: activeEvacuation?.customerId || 'default',
          evacuationId: activeEvacuation?.evacuationId || 'muster-standby'
        }));
      };

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          console.log('WebSocket message received:', message);
          
          if (message.type === 'muster_update') {
            queryClient.invalidateQueries({ queryKey: ["/api/muster"] });
            
            const statusText = message.isAccountedFor ? 'SAFE' : 'UNSAFE';
            toast({
              title: "Real-time Update",
              description: `${message.personName} marked as ${statusText}`,
            });
          }
          
          if (message.type === 'personnel_update') {
            queryClient.invalidateQueries({ queryKey: ["/api/muster"] });
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

  // Mutation to toggle accounted status
  const toggleAccountedMutation = useMutation({
    mutationFn: async ({ personId, type }: { personId: string, type: string }) => {
      const response = await apiRequest("POST", `/api/muster/${personId}/toggle`, { type });
      return await response.json();
    },
    onSuccess: (data) => {
      // WebSocket will handle the real-time update, but we still invalidate for consistency
      queryClient.invalidateQueries({ queryKey: ["/api/muster"] });
      toast({
        title: "Status Updated", 
        description: `Successfully updated accounted status for ${data.type}`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Update Failed",
        description: error.message || "Failed to update accounted status",
        variant: "destructive",
      });
    },
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

  // Mutation to mark all personnel as safe
  const markAllSafeMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/muster/mark-all-safe", {});
      return await response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/muster"] });
      queryClient.refetchQueries({ queryKey: ["/api/muster"] });
      toast({
        title: "All Personnel Marked Safe",
        description: `Successfully marked ${data.updatedCount} out of ${data.totalPersonnel} personnel as safe`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Mark All Safe Failed", 
        description: error.message || "Failed to mark all personnel as safe",
        variant: "destructive",
      });
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

  const filteredList = musterList.filter(person => {
    const matchesType = typeFilter === 'all' || person.type === typeFilter;
    const matchesSearch = searchTerm === '' || 
      (person.name && person.name.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (person.department && person.department.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (person.company && person.company.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesZone = selectedZones.size === 0 || !person.zoneId || selectedZones.has(person.zoneId);
    return matchesType && matchesSearch && matchesZone;
  });

  const totalPeople = musterList.length;
  const accountedFor = musterList.filter(p => p.accounted).length;
  const staffCount = musterList.filter(p => p.type === 'staff').length;
  const visitorCount = musterList.filter(p => p.type === 'visitor').length;
  const contractorCount = musterList.filter(p => p.type === 'contractor').length;
  const memberCount = musterList.filter(p => p.type === 'member').length;

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
    return <div>Loading emergency muster list...</div>;
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
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
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
          {/* Incident report button — shown after an event was recorded */}
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
          {/* Drill mode toggle — shown when idle or send_alert (before emails go out) */}
          {(emergencyPhase === 'idle' || emergencyPhase === 'send_alert') && (
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
          <Button 
            onClick={handleEmergencyButtonClick}
            disabled={activateFireMarshalMutation.isPending}
            className={`${
              emergencyPhase === 'idle' 
                ? isDrillMode
                  ? "bg-amber-500 hover:bg-amber-600 text-white"
                  : "bg-orange-600 hover:bg-orange-700 text-white" 
                : emergencyPhase === 'send_alert'
                ? zonesRequireSelection
                  ? "bg-amber-500 hover:bg-amber-600 text-white"
                  : isDrillMode
                    ? "bg-amber-600 hover:bg-amber-700 text-white animate-pulse"
                    : "bg-blue-600 hover:bg-blue-700 text-white animate-pulse"
                : isDrillMode
                  ? "bg-amber-600 hover:bg-amber-700 text-white"
                  : "bg-red-600 hover:bg-red-700 text-white"
            } text-sm sm:text-base whitespace-nowrap`}
            data-testid="button-emergency-toggle"
          >
            {emergencyPhase === 'idle' && (
              <>
                <Siren className="mr-1.5 sm:mr-2" size={16} />
                <span className="hidden sm:inline">{isDrillMode ? 'Start Drill' : 'Activate Emergency'}</span>
                <span className="sm:hidden">{isDrillMode ? 'Start Drill' : 'Activate'}</span>
              </>
            )}
            {emergencyPhase === 'send_alert' && (
              <>
                <Mail className="mr-1.5 sm:mr-2" size={16} />
                <span className="hidden sm:inline">{zonesRequireSelection ? "Select Zones First" : isDrillMode ? "Send Drill Alert" : "Send Email Alert"}</span>
                <span className="sm:hidden">{zonesRequireSelection ? "Select Zones" : isDrillMode ? "Send Drill" : "Send Alert"}</span>
              </>
            )}
            {emergencyPhase === 'active' && (
              <>
                <Siren className="mr-1.5 sm:mr-2" size={16} />
                <span className="hidden sm:inline">{isDrillMode ? 'End Drill' : 'Deactivate Emergency'}</span>
                <span className="sm:hidden">{isDrillMode ? 'End Drill' : 'Deactivate'}</span>
              </>
            )}
          </Button>
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


      {showZoneSelector && zones.length > 0 && (
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
          <div className="flex items-center gap-2 mb-3">
            <Footprints className="text-green-600 dark:text-green-400" size={18} />
            <h3 className="text-sm font-semibold text-fixed">Zone Sweep Status</h3>
            <span className="text-xs text-muted-foreground ml-auto">
              {zoneSweeps.length}/{activeZones.length} zones swept by fire marshals
            </span>
          </div>
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
                  >
                    <CheckCircle className="mr-2 flex-shrink-0" size={16} />
                    {markAllSafeMutation.isPending ? "Marking..." : "Mark All Safe"}
                  </Button>
                )}
                <Button 
                  variant="outline" 
                  onClick={exportMusterList}
                  data-testid="button-export-muster"
                  className="w-full sm:w-auto text-sm py-2.5 sm:py-2 font-semibold"
                >
                  <Download className="mr-2 flex-shrink-0" size={16} />
                  Export List
                </Button>
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
    </div>
  );
}
