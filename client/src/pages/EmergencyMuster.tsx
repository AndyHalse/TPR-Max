import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import GlassCard from "@/components/GlassCard";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { 
  AlertTriangle, 
  Users, 
  User,
  UserCheck,
  CheckCircle, 
  XCircle, 
  Search,
  Shield,
  Clock,
  Phone,
  Mail,
  Download,
  Siren,
  HardHat
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
}

interface ActiveEvacuation {
  active: boolean;
  evacuationId?: string;
  customerId?: string;
}

export default function EmergencyMuster() {
  const [searchTerm, setSearchTerm] = useState("");
  const [emergencyActive, setEmergencyActive] = useState(false);
  const [wsConnected, setWsConnected] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const { data: musterList = [], isLoading } = useQuery<MusterListItem[]>({
    queryKey: ["/api/muster"],
    refetchInterval: 30000, // Reduced to 30 seconds (WebSocket is primary source)
  });

  // Check for active evacuation
  const { data: activeEvacuation } = useQuery<ActiveEvacuation>({
    queryKey: ["/api/evacuation/status"],
    refetchInterval: 10000,  // Check every 10 seconds
  });

  const hasActiveEvacuation = activeEvacuation?.active || false;

  // WebSocket connection for real-time updates
  useEffect(() => {
    // Only connect if we have an active evacuation with customerId and evacuationId
    if (!hasActiveEvacuation || !activeEvacuation?.evacuationId) {
      // Disconnect if we had a connection
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
        setWsConnected(false);
      }
      return;
    }

    const connectWebSocket = () => {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const host = window.location.host; // Gets hostname:port
      const wsUrl = `${protocol}//${host}/ws/muster`;
      
      console.log('Connecting to WebSocket:', wsUrl, 'Host:', host);
      const ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        console.log('WebSocket connected');
        setWsConnected(true);
        
        // Register with evacuation context (customerId comes from session on server)
        ws.send(JSON.stringify({
          type: 'register',
          customerId: activeEvacuation.customerId || 'default',
          evacuationId: activeEvacuation.evacuationId
        }));
      };

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          console.log('WebSocket message received:', message);
          
          if (message.type === 'muster_update') {
            // Update the cache immediately for real-time sync
            queryClient.invalidateQueries({ queryKey: ["/api/muster"] });
            
            // Show toast notification for the update
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
        
        // Attempt to reconnect after 3 seconds if we still have an active evacuation
        if (hasActiveEvacuation && activeEvacuation?.evacuationId) {
          reconnectTimeoutRef.current = setTimeout(() => {
            console.log('Attempting to reconnect WebSocket...');
            connectWebSocket();
          }, 3000);
        }
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
      const response = await apiRequest("POST", "/api/emergency/activate", {});
      return await response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Fire Marshal Emergency Activated",
        description: data.message || `Successfully notified ${data.sent} Fire Marshals via email.`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Emergency Activation Failed",
        description: error.message || "Failed to activate Fire Marshal emergency system",
        variant: "destructive",
      });
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

  const filteredList = musterList.filter(person => 
    (person.name && person.name.toLowerCase().includes(searchTerm.toLowerCase())) ||
    (person.department && person.department.toLowerCase().includes(searchTerm.toLowerCase())) ||
    (person.company && person.company.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const totalPeople = musterList.length;
  const accountedFor = musterList.filter(p => p.accounted).length;
  const staffCount = musterList.filter(p => p.type === 'staff').length;
  const visitorCount = musterList.filter(p => p.type === 'visitor').length;
  const contractorCount = musterList.filter(p => p.type === 'contractor').length;
  const memberCount = musterList.filter(p => p.type === 'member').length;

  const handleEmergencyToggle = () => {
    setEmergencyActive(!emergencyActive);
  };

  const toggleAccountedStatus = (id: string, type: string) => {
    toggleAccountedMutation.mutate({ personId: id, type });
  };

  if (isLoading) {
    return <div>Loading emergency muster list...</div>;
  }

  return (
    <div className="space-y-8 p-6 rounded-xl bg-background min-h-screen">
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
        <div className="flex items-center gap-3">
          <Button 
            onClick={handleEmergencyToggle}
            className={`${emergencyActive ? 
              "bg-red-600 hover:bg-red-700 text-white" : 
              "bg-orange-600 hover:bg-orange-700 text-white"
            } text-sm sm:text-base whitespace-nowrap`}
            data-testid="button-emergency-toggle"
          >
            <Siren className="mr-1.5 sm:mr-2" size={16} />
            <span className="hidden sm:inline">{emergencyActive ? "Deactivate Emergency" : "Activate Emergency"}</span>
            <span className="sm:hidden">{emergencyActive ? "Deactivate" : "Activate"}</span>
          </Button>
        </div>
      </div>

      {emergencyActive && (
        <GlassCard className="border-2 border-red-500 bg-red-50 dark:bg-red-900/20">
          <div className="p-6">
            <div className="flex items-center justify-center mb-6">
              <AlertTriangle className="text-red-600 mr-3" size={32} />
              <div className="text-center">
                <h3 className="text-lg font-bold text-red-800 dark:text-red-200">EMERGENCY ACTIVE</h3>
                <p className="text-red-700 dark:text-red-300">All personnel must proceed to a safe location immediately</p>
              </div>
            </div>
            
            {/* Fire Marshal Emergency System */}
            <div className="bg-[var(--card)] dark:bg-slate-800 rounded-lg p-4 border-l-4 border-blue-500">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-start sm:items-center gap-3">
                  <Shield className="text-blue-600 flex-shrink-0" size={24} />
                  <div>
                    <h4 className="font-semibold text-fixed text-sm sm:text-base">Fire Marshal Emergency System</h4>
                    <p className="text-xs sm:text-sm text-variable">
                      Notify Fire Marshals via secure email links for mobile emergency response
                    </p>
                  </div>
                </div>
                <Button
                  onClick={() => activateFireMarshalMutation.mutate()}
                  disabled={activateFireMarshalMutation.isPending}
                  className="bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs sm:text-sm whitespace-nowrap w-full sm:w-auto"
                  data-testid="button-activate-fire-marshal"
                >
                  {activateFireMarshalMutation.isPending ? (
                    <div className="flex items-center justify-center">
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                      Notifying...
                    </div>
                  ) : (
                    <div className="flex items-center justify-center">
                      <Mail className="mr-1.5 sm:mr-2 flex-shrink-0" size={14} />
                      NOTIFY FIRE MARSHALS
                    </div>
                  )}
                </Button>
              </div>
            </div>
          </div>
        </GlassCard>
      )}

      {/* Emergency Stats */}
      <div className="flex flex-col lg:flex-row gap-6">
        <GlassCard hover className="dark:glass-dark bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-emerald-900/20 dark:to-teal-900/20 border-2 border-emerald-200 dark:border-emerald-800 lg:w-48 shrink-0">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-emerald-700 dark:text-emerald-300 text-sm font-semibold">Total People</p>
              <p className="text-4xl font-bold text-emerald-700 dark:text-emerald-300 mt-1" data-testid="stat-total-people">
                {totalPeople}
              </p>
              <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-1">On-Site Now</p>
            </div>
            <div className="w-12 h-12 bg-emerald-200 dark:bg-emerald-800/50 rounded-xl flex items-center justify-center shrink-0">
              <Users className="text-emerald-700 dark:text-emerald-300" size={24} />
            </div>
          </div>
        </GlassCard>

        <GlassCard hover className="dark:glass-dark">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-variable text-sm font-medium">Accounted For</p>
              <p className="text-3xl font-bold text-green-600 dark:text-green-400 mt-1" data-testid="stat-accounted">
                {accountedFor}
              </p>
              <p className="text-xs text-green-600 dark:text-green-400 mt-1">
                {totalPeople > 0 ? Math.round((accountedFor / totalPeople) * 100) : 0}% Complete
              </p>
            </div>
            <div className="w-12 h-12 bg-green-100 dark:bg-green-900/30 rounded-xl flex items-center justify-center shrink-0">
              <CheckCircle className="text-green-600 dark:text-green-400" size={24} />
            </div>
          </div>
        </GlassCard>

        <div className={`grid grid-cols-1 md:grid-cols-2 ${memberCount > 0 ? 'lg:grid-cols-4' : 'lg:grid-cols-3'} gap-6 flex-1`}>
          <GlassCard hover className="dark:glass-dark">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-variable text-sm font-medium">Staff</p>
                <p className="text-3xl font-bold text-purple-600 dark:text-purple-400 mt-1" data-testid="stat-staff-count">
                  {staffCount}
                </p>
              </div>
              <div className="w-12 h-12 bg-purple-100 dark:bg-purple-900/30 rounded-xl flex items-center justify-center shrink-0">
                <Users className="text-purple-600 dark:text-purple-400" size={24} />
              </div>
            </div>
          </GlassCard>
          
          <GlassCard hover className="dark:glass-dark">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-variable text-sm font-medium">Visitors</p>
                <p className="text-3xl font-bold text-blue-600 dark:text-blue-400 mt-1" data-testid="stat-visitor-count">
                  {visitorCount}
                </p>
              </div>
              <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900/30 rounded-xl flex items-center justify-center shrink-0">
                <User className="text-blue-600 dark:text-blue-400" size={24} />
              </div>
            </div>
          </GlassCard>
          
          <GlassCard hover className="dark:glass-dark">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-variable text-sm font-medium">Contractors</p>
                <p className="text-3xl font-bold text-orange-600 dark:text-orange-400 mt-1" data-testid="stat-contractor-count">
                  {contractorCount}
                </p>
              </div>
              <div className="w-12 h-12 bg-orange-100 dark:bg-orange-900/30 rounded-xl flex items-center justify-center shrink-0">
                <HardHat className="text-orange-600 dark:text-orange-400" size={24} />
              </div>
            </div>
          </GlassCard>

          {memberCount > 0 && (
            <GlassCard hover className="dark:glass-dark">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-variable text-sm font-medium">Members</p>
                  <p className="text-3xl font-bold text-purple-600 dark:text-purple-400 mt-1" data-testid="stat-member-count">
                    {memberCount}
                  </p>
                </div>
                <div className="w-12 h-12 bg-purple-100 dark:bg-purple-900/30 rounded-xl flex items-center justify-center shrink-0">
                  <UserCheck className="text-purple-600 dark:text-purple-400" size={24} />
                </div>
              </div>
            </GlassCard>
          )}
        </div>
      </div>

      {/* Search and Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <GlassCard className="dark:glass-dark">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
              <h3 className="text-base sm:text-lg font-semibold text-fixed">Personnel Accountability</h3>
              <div className="flex space-x-2 flex-wrap sm:flex-nowrap gap-2">
                {hasActiveEvacuation && (
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={() => markAllSafeMutation.mutate()}
                    disabled={markAllSafeMutation.isPending}
                    data-testid="button-mark-all-safe"
                    className="text-xs sm:text-sm whitespace-nowrap"
                  >
                    <CheckCircle className="mr-1.5 sm:mr-2 flex-shrink-0" size={14} />
                    {markAllSafeMutation.isPending ? "Marking..." : "Mark All Safe"}
                  </Button>
                )}
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={exportMusterList}
                  data-testid="button-export-muster"
                  className="text-xs sm:text-sm whitespace-nowrap"
                >
                  <Download className="mr-1.5 sm:mr-2 flex-shrink-0" size={14} />
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
            
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {filteredList.map((person) => (
                <div 
                  key={person.id} 
                  className={`flex flex-col sm:flex-row sm:items-center justify-between p-3 sm:p-4 rounded-xl transition-all gap-3 ${
                    person.accounted 
                      ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800' 
                      : 'bg-white/50 dark:bg-slate-800/50 border border-gray-200 dark:border-gray-600'
                  }`}
                  data-testid={`person-${person.id}`}
                >
                  <div className="flex items-center space-x-3 flex-1 min-w-0">
                    <div className={`w-10 h-10 flex-shrink-0 rounded-full flex items-center justify-center ${
                      person.type === 'staff' ? 'bg-blue-500' : 
                      person.type === 'visitor' ? 'bg-orange-500' : 
                      person.type === 'member' ? 'bg-purple-500' : 'bg-yellow-500'
                    }`}>
                      <span className="text-white font-medium text-sm">
                        {person.name.split(' ').map(n => n[0]).join('').toUpperCase()}
                      </span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-fixed text-sm sm:text-base truncate">{person.name}</p>
                      <p className="text-xs sm:text-sm text-variable truncate">
                        {person.type === 'staff' ? person.department : person.company} • {person.location}
                      </p>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
                    <Badge variant={person.type === 'staff' ? 'default' : 'secondary'} className="text-xs">
                      {person.type}
                    </Badge>
                    {hasActiveEvacuation && (
                      <>
                        {person.accounted ? (
                          <Badge className="bg-green-100 text-green-800 border-green-300 text-xs whitespace-nowrap" data-testid={`badge-safe-${person.id}`}>
                            <CheckCircle className="mr-1" size={12} />
                            Safe
                          </Badge>
                        ) : (
                          <Badge variant="destructive" className="text-xs whitespace-nowrap" data-testid={`badge-unsafe-${person.id}`}>
                            <XCircle className="mr-1" size={12} />
                            Unsafe
                          </Badge>
                        )}
                      </>
                    )}
                    <Button
                      size="sm"
                      variant={person.accounted ? "outline" : "default"}
                      className={`${person.accounted ? "" : "bg-green-600 hover:bg-green-700 text-white"} text-xs whitespace-nowrap`}
                      onClick={() => toggleAccountedStatus(person.id, person.type)}
                      data-testid={`button-toggle-${person.id}`}
                    >
                      {person.accounted ? (
                        <>
                          <XCircle className="mr-1" size={12} />
                          Unmark
                        </>
                      ) : (
                        <>
                          <CheckCircle className="mr-1" size={12} />
                          Mark Safe
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
            
            <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-xl border border-blue-200 dark:border-blue-800">
              <h4 className="font-medium text-blue-800 dark:text-blue-200 mb-2">Fire Marshal</h4>
              <p className="text-blue-700 dark:text-blue-300">Contact Security</p>
              <p className="text-blue-600 dark:text-blue-400 text-sm">Call Reception</p>
            </div>
            
            <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-xl border border-green-200 dark:border-green-800">
              <h4 className="font-medium text-green-800 dark:text-green-200 mb-2">Security</h4>
              <p className="text-green-700 dark:text-green-300">Control Room</p>
              <p className="text-green-600 dark:text-green-400 text-sm">+44 123 456 7891</p>
            </div>
            
            <Button className="w-full" variant="outline" data-testid="button-call-emergency">
              <Phone className="mr-2" size={16} />
              Quick Call Emergency
            </Button>
            
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
