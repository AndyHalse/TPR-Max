import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
  LogOut,
  UserMinus,
  Eye,
  EyeOff,
  Clock,
  Timer
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
  isAccountedFor: boolean;
  accountedBy?: string;
  accountedAt?: string;
  musterPoint?: string;
}

interface EvacuationData {
  evacuationId: string;
  people: PersonOnSite[];
  totalOnSite: number;
  accountedFor: number;
  unaccounted: number;
  musterPoints: string[];
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

interface FireMarshalMobileProps {
  urlId?: string;  // NEW: Static URL ID
  token?: string;  // LEGACY: Token-based auth
}

interface MarshalInfo {
  id: string;
  name: string;
  department: string;
  email: string;
  customerId: string;
}

export default function FireMarshalMobile({ urlId, token }: FireMarshalMobileProps) {
  const queryClient = useQueryClient(); // CRITICAL: Use the hook for cache invalidation
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [activeEvacuationId, setActiveEvacuationId] = useState<string | null>(null);
  const [marshalName, setMarshalName] = useState("");
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set());
  const [filterType, setFilterType] = useState<'all' | 'unaccounted' | 'accounted'>('all');
  const [marshalInfo, setMarshalInfo] = useState<MarshalInfo | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [wsConnected, setWsConnected] = useState(false);
  const [showSafePeople, setShowSafePeople] = useState(false); // Hide safe people by default
  const [evacuationDetails, setEvacuationDetails] = useState<EvacuationDetails | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // NEW: Authenticate using static URL ID
  useEffect(() => {
    if (urlId) {
      fetch(`/api/emergency/fire-marshal/${urlId}`)
        .then(res => {
          if (!res.ok) throw new Error('Authentication failed');
          return res.json();
        })
        .then(data => {
          console.log('✅ Fire Marshal authenticated:', data.marshal.name);
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
        .catch(err => {
          console.error('❌ Fire Marshal authentication failed:', err);
          setAuthError('Invalid or expired Fire Marshal link');
        });
    }
  }, [urlId]);

  // WebSocket connection for real-time updates (CRITICAL for cross-Fire-Marshal updates)
  useEffect(() => {
    console.log('🔥 WebSocket Effect Running - marshalInfo:', marshalInfo);
    console.log('🔥 Has customerId?', !!marshalInfo?.customerId, 'customerId:', marshalInfo?.customerId);
    console.log('🔥 activeEvacuationId:', activeEvacuationId);
    
    // Only connect if we have marshalInfo with customerId
    if (!marshalInfo?.customerId) {
      console.warn('⚠️ NOT connecting WebSocket - missing marshalInfo.customerId');
      return;
    }

    const connectWebSocket = () => {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const host = window.location.host;
      const wsUrl = `${protocol}//${host}/ws/muster`;
      
      console.log('🔥 CONNECTING Fire Marshal WebSocket:', wsUrl);
      console.log('🔥 Registration payload:', {
        type: 'register',
        customerId: marshalInfo.customerId,
        evacuationId: activeEvacuationId || 'fire-marshal-standalone'
      });
      
      const ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        console.log('✅ Fire Marshal WebSocket CONNECTED!');
        setWsConnected(true);
        
        // Register with customer context (evacuation may or may not exist yet)
        const registration = {
          type: 'register',
          customerId: marshalInfo.customerId,
          evacuationId: activeEvacuationId || 'fire-marshal-standalone'
        };
        console.log('📤 Sending registration:', registration);
        ws.send(JSON.stringify(registration));
      };

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          console.log('📨 Fire Marshal WebSocket message:', message);
          
          if (message.type === 'muster_update') {
            console.log('🚨 REAL-TIME UPDATE RECEIVED:', message.personName, message.isAccountedFor ? 'SAFE' : 'UNSAFE');
            
            queryClient.invalidateQueries({ queryKey: ['/api/emergency/fire-marshal', urlId, 'personnel'] });
            queryClient.invalidateQueries({ queryKey: ['/api/emergency/accountability', activeEvacuationId || ''] });
            
            const statusText = message.isAccountedFor ? 'SAFE' : 'UNSAFE';
            toast({
              title: "🚨 Real-time Update",
              description: `${message.personName} marked as ${statusText}`,
            });
          }
          
          if (message.type === 'personnel_update') {
            console.log('👤 PERSONNEL UPDATE:', message.personName, message.action);
            
            queryClient.invalidateQueries({ queryKey: ['/api/emergency/fire-marshal', urlId, 'personnel'] });
          }
        } catch (error) {
          console.error('❌ Error parsing WebSocket message:', error);
        }
      };

      ws.onerror = (error) => {
        console.error('❌ Fire Marshal WebSocket error:', error);
        setWsConnected(false);
      };

      ws.onclose = () => {
        console.log('❌ Fire Marshal WebSocket disconnected');
        setWsConnected(false);
        
        // Attempt to reconnect after 3 seconds if we still have marshalInfo
        if (marshalInfo?.customerId) {
          console.log('⏳ Scheduling WebSocket reconnection in 3 seconds...');
          reconnectTimeoutRef.current = setTimeout(() => {
            console.log('🔄 Attempting to reconnect Fire Marshal WebSocket...');
            connectWebSocket();
          }, 3000);
        }
      };

      wsRef.current = ws;
    };

    connectWebSocket();

    // Cleanup on unmount
    return () => {
      console.log('🧹 Cleaning up WebSocket connection');
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
    // NOTE: toast and queryClient are intentionally excluded from dependencies
    // - toast function is stable despite useToast() returning new object each render
    // - queryClient is stable singleton
    // Including them would cause WebSocket to tear down/reconnect on every render
  }, [marshalInfo?.customerId, activeEvacuationId, urlId]);

  // Fetch on-site personnel data (Fire Marshal URL ALWAYS shows who's on site, regardless of evacuation status)
  const { data: personnelData, isLoading: isLoadingPersonnel } = useQuery<{
    people: PersonOnSite[];
    totalOnSite: number;
    accountedFor: number;
    unaccounted: number;
  }>({
    // CRITICAL: Query key pattern must match WebSocket invalidation pattern exactly
    queryKey: ['/api/emergency/fire-marshal', urlId, 'personnel'],
    enabled: !!urlId,
    refetchInterval: 5000
  });

  // Load marshal name from localStorage (legacy)
  useEffect(() => {
    if (!urlId) {  // Only use localStorage for legacy token auth
      const savedName = localStorage.getItem('fireMarshallName');
      if (savedName) setMarshalName(savedName);
    }
  }, [urlId]);

  // Save marshal name to localStorage (legacy)
  useEffect(() => {
    if (marshalName && !urlId) {  // Only save for legacy token auth
      localStorage.setItem('fireMarshallName', marshalName);
    }
  }, [marshalName, urlId]);

  // Fetch evacuation accountability list with shorter refresh for real-time updates
  const { data: evacuationData, refetch } = useQuery<EvacuationData>({
    // CRITICAL: Query key pattern must match WebSocket invalidation pattern exactly
    queryKey: ['/api/emergency/accountability', activeEvacuationId || ''],
    enabled: !!activeEvacuationId && (!!token || !!marshalInfo),
    refetchInterval: 2000, // Refresh every 2 seconds for real-time updates
    queryFn: async () => {
      const headers: HeadersInit = {};
      if (token) {
        headers['X-Emergency-Token'] = token;  // Legacy token auth
      } else if (urlId) {
        headers['X-Fire-Marshal-Id'] = urlId;  // NEW: URL ID auth
      }
      const response = await fetch(`/api/emergency/accountability/${activeEvacuationId}`, { headers });
      if (!response.ok) throw new Error('Failed to fetch accountability data');
      return response.json();
    }
  });

  // Convert personnel data to evacuation format - ALWAYS USE PERSONNEL DATA to show who's on site
  const personnelDisplayData: EvacuationData | null = personnelData ? {
    evacuationId: activeEvacuationId || 'standalone', // Fire Marshal URL works independently
    people: personnelData.people,
    totalOnSite: personnelData.totalOnSite,
    accountedFor: personnelData.accountedFor,
    unaccounted: personnelData.unaccounted,
    musterPoints: []
  } : null;

  // ALWAYS prioritize on-site personnel data - Fire Marshal URLs show who's on site at ANY time
  // If there's evacuation-specific data with more detail, merge it
  const displayData = personnelDisplayData || evacuationData;

  // Check for active evacuation (only for legacy token auth - new URL ID system gets this from auth endpoint)
  const { data: activeEvacuation } = useQuery<ActiveEvacuationResponse>({
    queryKey: ["/api/emergency/active"],
    enabled: !!token && !urlId,  // Only for legacy token auth
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


  // Mark person as safe mutation
  const markSafeMutation = useMutation({
    mutationFn: async ({ personId }: { personId: string }) => {
      console.log('🚀 [MUTATION] Mark Safe mutation starting for personId:', personId);
      console.log('🚀 [MUTATION] marshalName:', marshalName);
      console.log('🚀 [MUTATION] activeEvacuationId:', activeEvacuationId);
      console.log('🚀 [MUTATION] token:', token);
      console.log('🚀 [MUTATION] urlId:', urlId);
      
      const headers: HeadersInit = { "Content-Type": "application/json" };
      
      // Support both authentication methods
      if (token) {
        headers["X-Emergency-Token"] = token;  // Legacy token auth
        console.log('🚀 [MUTATION] Using token auth');
      } else if (urlId) {
        headers["X-Fire-Marshal-Id"] = urlId;  // URL ID auth
        console.log('🚀 [MUTATION] Using URL ID auth:', urlId);
      }
      
      const requestBody = { 
        musterPoint: "Safe Location",  // Default location - no longer requires selection
        evacuationId: activeEvacuationId || 'standalone',  // Use 'standalone' if no active evacuation
        marshalName: marshalName
      };
      console.log('🚀 [MUTATION] Request body:', requestBody);
      
      console.log('🚀 [MUTATION] Sending POST to:', `/api/emergency/mark-safe/${personId}`);
      const response = await fetch(`/api/emergency/mark-safe/${personId}`, {
        method: "POST",
        headers,
        credentials: "include",
        body: JSON.stringify(requestBody)
      });
      console.log('🚀 [MUTATION] Response status:', response.status);
      if (!response.ok) {
        console.error('🚀 [MUTATION] Response not OK:', response.status, response.statusText);
        throw new Error("Failed to mark person as safe");
      }
      const data = await response.json();
      console.log('🚀 [MUTATION] Response data:', data);
      return data;
    },
    onSuccess: (data) => {
      console.log('✅ [MUTATION SUCCESS] Person marked safe successfully');
      
      // If the response includes an evacuation ID (from standalone mode), update our state
      if (data.evacuationId && !activeEvacuationId) {
        setActiveEvacuationId(data.evacuationId);
      }
      
      // Collapse the card for the person who was just marked safe
      if (data.personId) {
        const newExpanded = new Set(expandedCards);
        newExpanded.delete(data.personId);
        setExpandedCards(newExpanded);
        console.log('✅ [MUTATION SUCCESS] Collapsed card for person:', data.personId);
      }
      
      // CRITICAL: Invalidate queries with EXACT key patterns to sync across all Fire Marshal views
      queryClient.invalidateQueries({ queryKey: ['/api/emergency/fire-marshal', urlId, 'personnel'] });
      queryClient.invalidateQueries({ queryKey: ['/api/emergency/accountability', activeEvacuationId || ''] });
      // Invalidate admin muster dashboard for real-time sync
      queryClient.invalidateQueries({ queryKey: ["/api/muster"] });
      
      console.log('✅ [MUTATION SUCCESS] Queries invalidated with segmented keys');
      
      toast({
        title: "✓ Marked Safe",
        description: `${data.personName || 'Person'} has been marked as safe`,
      });
      // Vibrate on mobile devices for feedback
      if (navigator.vibrate) {
        navigator.vibrate(200);
      }
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update status",
        variant: "destructive"
      });
    }
  });

  // Complete evacuation mutation
  const completeEvacuationMutation = useMutation({
    mutationFn: async ({ checkOutMode }: { checkOutMode: 'keep_checked_in' | 'check_out_all' }) => {
      const headers: HeadersInit = { "Content-Type": "application/json" };
      
      // Support both authentication methods
      if (token) {
        headers["X-Emergency-Token"] = token;  // Legacy token auth
      } else if (urlId) {
        headers["X-Fire-Marshal-Id"] = urlId;  // URL ID auth
      }
      
      const response = await fetch('/api/emergency/complete-evacuation', {
        method: 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify({
          evacuationId: activeEvacuationId,
          checkOutMode
        })
      });
      if (!response.ok) throw new Error('Failed to complete evacuation');
      return response.json();
    },
    onSuccess: (data) => {
      // Invalidate all emergency-related queries
      queryClient.invalidateQueries({ queryKey: ['/api/emergency/active'] });
      queryClient.invalidateQueries({ queryKey: ['/api/muster'] });
      
      // Invalidate all personnel queries to update UI everywhere
      queryClient.invalidateQueries({ queryKey: ['/api/staff'] });
      queryClient.invalidateQueries({ queryKey: ['/api/staff/checked-in'] });
      queryClient.invalidateQueries({ queryKey: ['/api/visitors'] });
      queryClient.invalidateQueries({ queryKey: ['/api/visitors/current'] });
      queryClient.invalidateQueries({ queryKey: ['/api/visitors/today'] });
      queryClient.invalidateQueries({ queryKey: ['/api/contractors'] });
      queryClient.invalidateQueries({ queryKey: ['/api/contractors/checked-in'] });
      queryClient.invalidateQueries({ queryKey: ['/api/contractors/workers/all'] });
      
      // Invalidate dashboard and stats queries
      queryClient.invalidateQueries({ queryKey: ['/api/stats'] });
      queryClient.invalidateQueries({ queryKey: ['/api/activity/recent'] });
      
      toast({
        title: "✓ Evacuation Completed",
        description: data.message,
      });
      setActiveEvacuationId(null);
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to complete evacuation",
        variant: "destructive"
      });
    }
  });


  // Toggle card expansion
  const toggleCard = (id: string) => {
    const newExpanded = new Set(expandedCards);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedCards(newExpanded);
  };

  // Filter people based on search and filter type (uses either evacuation data or personnel data)
  const filteredPeople = displayData?.people?.filter(person => {
    const matchesSearch = (person.name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
                          (person.department || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
                          (person.company || '').toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesFilter = filterType === 'all' ||
                         (filterType === 'unaccounted' && !person.isAccountedFor) ||
                         (filterType === 'accounted' && person.isAccountedFor);
    
    // Hide safe people unless toggle is on
    const matchesVisibility = showSafePeople || !person.isAccountedFor;
    
    return matchesSearch && matchesFilter && matchesVisibility;
  }) || [];

  // Show authentication error if present
  if (authError) {
    return (
      <div className="min-h-screen bg-red-50 flex items-center justify-center p-4">
        <Card className="w-full max-w-md border-red-200">
          <CardHeader className="text-center">
            <AlertTriangle className="h-16 w-16 mx-auto text-red-500 mb-4" />
            <CardTitle className="text-xl text-red-600">Authentication Failed</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-center text-muted-foreground mb-4">
              {authError}
            </p>
            <p className="text-sm text-center text-gray-500">
              Please contact your administrator for a valid Fire Marshal access link.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Determine if we're in emergency mode or just showing on-site personnel
  const isEmergencyActive = !!activeEvacuationId;
  
  return (
    <div className={`min-h-screen pb-20 ${isEmergencyActive ? 'bg-red-50 dark:bg-red-950/20' : 'bg-orange-50 dark:bg-orange-950/20'}`}>
      {/* Header - Fixed */}
      <div className={`sticky top-0 z-50 text-white shadow-lg ${isEmergencyActive ? 'bg-red-600' : 'bg-orange-600'}`}>
        <div className={`p-3 ${isEmergencyActive ? 'animate-pulse' : ''}`}>
          <div className="flex items-center gap-2">
            {isEmergencyActive ? <Siren className="h-6 w-6 flex-shrink-0" /> : <Shield className="h-6 w-6 flex-shrink-0" />}
            <div className="flex-1 min-w-0">
              <h1 className="text-lg font-bold">{isEmergencyActive ? 'EVACUATION ACTIVE' : 'FIRE MARSHAL PANEL'}</h1>
              {isEmergencyActive && (activeEvacuation?.startedAt || evacuationDetails?.startedAt) && (
                <div className="text-xs space-y-0.5 mt-1">
                  <div className="flex items-center gap-1">
                    <Clock className="h-3 w-3 flex-shrink-0" />
                    <span className="truncate">Started: {new Date((activeEvacuation?.startedAt || evacuationDetails?.startedAt)!).toLocaleString()}</span>
                  </div>
                  {displayData && displayData.totalOnSite > 0 && displayData.accountedFor === displayData.totalOnSite && (
                    <div className="flex items-center gap-1 text-green-200">
                      <CheckCircle2 className="h-3 w-3 flex-shrink-0" />
                      <span className="truncate">All Safe: {new Date().toLocaleString()}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-1">
                    <Timer className="h-3 w-3 flex-shrink-0" />
                    <span>Duration: {Math.floor((Date.now() - new Date((activeEvacuation?.startedAt || evacuationDetails?.startedAt)!).getTime()) / 60000)} min</span>
                  </div>
                </div>
              )}
            </div>
            {/* WebSocket Connection Status Indicator */}
            <div className="flex-shrink-0">
              <Badge 
                variant={wsConnected ? "default" : "secondary"}
                className={`text-xs ${wsConnected ? 'bg-green-500 animate-pulse' : 'bg-gray-400'}`}
                title={wsConnected ? "Real-time updates active" : "Using polling mode"}
              >
                {wsConnected ? '● LIVE' : '○ OFFLINE'}
              </Badge>
            </div>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setShowSafePeople(!showSafePeople)}
              className="bg-white/20 hover:bg-white/30 flex-shrink-0"
              title={showSafePeople ? "Hide safe people" : "Show safe people"}
              data-testid="button-toggle-safe-people"
            >
              {showSafePeople ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => window.location.reload()}
              className="bg-white/20 hover:bg-white/30 flex-shrink-0"
              data-testid="button-refresh-mobile"
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Marshal Name Input - Always Visible */}
      <div className="sticky top-16 z-40 bg-yellow-400 p-3 shadow-md">
        <div className="flex items-center gap-2">
          <UserCheck className="h-5 w-5 text-yellow-900" />
          <Input
            placeholder="Enter your name to enable marking people safe..."
            value={marshalName}
            onChange={(e) => setMarshalName(e.target.value)}
            className="text-base font-medium bg-white border-yellow-600"
            autoFocus={!marshalName}
            data-testid="input-marshal-name-mobile"
          />
        </div>
        {!marshalName && (
          <p className="text-xs text-yellow-900 mt-1 ml-7">
            ⚠️ Enter your name to enable "Mark Safe" buttons
          </p>
        )}
      </div>

      {/* Statistics Cards */}
      <div className="p-4 grid grid-cols-2 gap-3">
        <Card className="border-0 shadow-sm">
          <CardContent className="p-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Total</p>
                <p className="text-2xl font-bold">{displayData?.totalOnSite || 0}</p>
              </div>
              <Users className="h-6 w-6 text-blue-500" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm">
          <CardContent className="p-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Safe</p>
                <p className="text-2xl font-bold text-green-600">
                  {displayData?.accountedFor || 0}
                </p>
              </div>
              <CheckCircle2 className="h-6 w-6 text-green-500" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm">
          <CardContent className="p-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Missing</p>
                <p className="text-2xl font-bold text-red-600">
                  {displayData?.unaccounted || 0}
                </p>
              </div>
              <AlertTriangle className="h-6 w-6 text-red-500" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm">
          <CardContent className="p-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Progress</p>
                <p className="text-2xl font-bold">
                  {displayData && displayData.totalOnSite > 0
                    ? Math.round((displayData.accountedFor / displayData.totalOnSite) * 100)
                    : 0}%
                </p>
              </div>
              <div className="h-6 w-6 rounded-full border-2 border-blue-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Controls */}
      <div className="px-4 pb-3 space-y-3">
        {/* Search */}
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
        {filteredPeople.map((person) => (
          <Card 
            key={person.id}
            className={`overflow-hidden transition-all ${
              person.isAccountedFor 
                ? 'border-green-300 bg-green-50/50' 
                : 'border-red-300 bg-red-50/50 shadow-md'
            }`}
          >
            <div 
              className="p-4 cursor-pointer"
              onClick={() => !person.isAccountedFor && toggleCard(person.id)}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-semibold text-lg">{person.name}</span>
                    {person.isAccountedFor && (
                      <Badge variant="outline" className="bg-green-100 text-green-700 text-xs">
                        SAFE
                      </Badge>
                    )}
                  </div>
                  <div className="text-sm text-gray-600 space-y-1">
                    <div className="flex items-center gap-2">
                      <Badge 
                        variant="secondary" 
                        className={`text-xs ${
                          person.type === 'member' ? 'bg-purple-100 text-purple-800' :
                          person.type === 'contractor' ? 'bg-yellow-100 text-yellow-800' :
                          person.type === 'staff' ? 'bg-blue-100 text-blue-800' :
                          'bg-green-100 text-green-800'
                        }`}
                      >
                        {person.type.charAt(0).toUpperCase() + person.type.slice(1)}
                      </Badge>
                      <span>{person.department || person.company}</span>
                    </div>
                    <div className="text-xs">{person.location}</div>
                  </div>
                  {person.isAccountedFor && person.musterPoint && (
                    <div className="text-xs text-green-600 mt-2 flex items-center gap-1">
                      <MapPin className="h-3 w-3" />
                      {person.musterPoint}
                      {person.accountedBy && ` • ${person.accountedBy}`}
                    </div>
                  )}
                </div>
                {!person.isAccountedFor && (
                  <ChevronDown 
                    className={`h-5 w-5 text-gray-400 transition-transform ${
                      expandedCards.has(person.id) ? 'rotate-180' : ''
                    }`}
                  />
                )}
              </div>
              
              {/* Expanded Actions */}
              {!person.isAccountedFor && expandedCards.has(person.id) && (
                <div className="mt-4 pt-4 border-t">
                  <Button
                    className="w-full bg-green-600 hover:bg-green-700 text-white h-14 text-lg font-semibold"
                    size="lg"
                    onClick={(e) => {
                      console.log('🔘 [BUTTON CLICK] Mark Safe button clicked for person:', person.name, person.id);
                      console.log('🔘 [BUTTON CLICK] marshalName:', marshalName);
                      console.log('🔘 [BUTTON CLICK] isPending:', markSafeMutation.isPending);
                      e.stopPropagation();
                      if (!marshalName) {
                        console.error('🔘 [BUTTON CLICK] No marshal name! Showing toast.');
                        toast({
                          title: "Name Required",
                          description: "Please enter your name first",
                          variant: "destructive"
                        });
                        return;
                      }
                      console.log('🔘 [BUTTON CLICK] Calling markSafeMutation.mutate...');
                      markSafeMutation.mutate({ 
                        personId: person.id
                      });
                      console.log('🔘 [BUTTON CLICK] mutate() called successfully');
                    }}
                    disabled={markSafeMutation.isPending || !marshalName}
                    data-testid={`button-mark-safe-mobile-${person.id}`}
                  >
                    {markSafeMutation.isPending ? (
                      <RefreshCw className="h-5 w-5 mr-2 animate-spin" />
                    ) : (
                      <CheckCircle2 className="h-5 w-5 mr-2" />
                    )}
                    Mark Safe at Safe Location
                  </Button>
                </div>
              )}
            </div>
          </Card>
        ))}
      </div>

      {/* No Results */}
      {filteredPeople.length === 0 && (
        <div className="text-center py-8 text-gray-500">
          <AlertTriangle className="h-12 w-12 mx-auto mb-2 opacity-50" />
          <p>No people found matching your search</p>
        </div>
      )}

      {/* Complete Evacuation Button - Fixed at Bottom */}
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
                {evacuationData && evacuationData.unaccounted > 0 && (
                  <div className="bg-yellow-50 border-l-4 border-yellow-400 p-3 mb-3">
                    <p className="text-yellow-800 font-medium">
                      ⚠️ Warning: {evacuationData.unaccounted} {evacuationData.unaccounted === 1 ? 'person is' : 'people are'} still unaccounted for
                    </p>
                  </div>
                )}
                <p>How would you like to complete this evacuation?</p>
                <div className="space-y-2">
                  <p className="text-sm text-gray-600">
                    <strong>Keep Everyone Checked In:</strong> Personnel remain checked in and can return to work immediately.
                  </p>
                  <p className="text-sm text-gray-600">
                    <strong>Check Out All Safe Personnel:</strong> Only people marked safe will be checked out. They'll need to check in again when returning.
                  </p>
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="flex-col sm:flex-col gap-2">
              <AlertDialogAction
                className="w-full bg-green-600 hover:bg-green-700 h-12"
                onClick={(e) => {
                  e.preventDefault();
                  completeEvacuationMutation.mutate({ checkOutMode: 'keep_checked_in' });
                }}
                disabled={completeEvacuationMutation.isPending}
                data-testid="button-keep-checked-in"
              >
                <UserCheck className="h-5 w-5 mr-2" />
                Keep Everyone Checked In
              </AlertDialogAction>
              <AlertDialogAction
                className="w-full bg-orange-600 hover:bg-orange-700 h-12"
                onClick={(e) => {
                  e.preventDefault();
                  completeEvacuationMutation.mutate({ checkOutMode: 'check_out_all' });
                }}
                disabled={completeEvacuationMutation.isPending}
                data-testid="button-check-out-all"
              >
                <LogOut className="h-5 w-5 mr-2" />
                Check Out All Safe Personnel
              </AlertDialogAction>
              <AlertDialogCancel className="w-full h-12" data-testid="button-cancel-complete">
                Cancel
              </AlertDialogCancel>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}