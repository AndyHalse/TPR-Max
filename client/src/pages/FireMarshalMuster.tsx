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
  Clock
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

  // WebSocket connection for real-time updates
  useEffect(() => {
    if (!isValidToken || !customerId || !evacuationId) return;

    const connectWebSocket = () => {
      // Get WebSocket URL (use wss:// for HTTPS, ws:// for HTTP)
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const host = window.location.host; // Gets hostname:port
      const wsUrl = `${protocol}//${host}/ws/muster`;
      
      console.log('Connecting to WebSocket:', wsUrl, 'Host:', host);
      const ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        console.log('WebSocket connected');
        setWsConnected(true);
        
        // Register with customer and evacuation context
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
            // Update the cache immediately for real-time sync
            queryClient.invalidateQueries({ queryKey: ["/api/emergency/muster", token] });
            
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
        
        // Attempt to reconnect after 3 seconds
        reconnectTimeoutRef.current = setTimeout(() => {
          console.log('Attempting to reconnect WebSocket...');
          connectWebSocket();
        }, 3000);
      };

      wsRef.current = ws;
    };

    connectWebSocket();

    // Cleanup on unmount
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

  // Fetch muster list - reduced polling as WebSocket provides real-time updates
  const { data: musterList = [], isLoading, refetch } = useQuery<MusterListItem[]>({
    queryKey: ["/api/emergency/muster", token],
    enabled: isValidToken && !!token,
    refetchInterval: 30000, // Reduced to 30 seconds as backup (WebSocket is primary)
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
      // WebSocket will handle the real-time update, but we still invalidate for consistency
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

  const filteredList = musterList.filter(person => 
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

      {/* Stats cards - mobile optimized */}
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

      {/* Critical status - Only show if people unaccounted */}
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

      {/* Search */}
      <div className="p-4">
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

      {/* Personnel list - mobile optimized with large touch targets */}
      <div className="px-4 pb-6 space-y-3">
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
                  <p className="font-bold text-lg text-white">{person.name}</p>
                  <p className="text-red-200 text-sm">
                    {person.type === 'staff' ? person.department : person.company}
                  </p>
                  <div className="flex items-center text-red-300 text-xs mt-1">
                    <MapPin className="mr-1" size={12} />
                    {person.location}
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
                
                {/* Large touch-friendly button */}
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
