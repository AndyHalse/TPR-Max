import React, { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, XCircle, Users, AlertTriangle, Search, MapPin, RefreshCw, Send, Smartphone, LogOut, UserCheck } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  type: 'staff' | 'visitor';
  department?: string;
  company?: string;
  isAccountedFor: boolean;
  accountedBy?: string;
  accountedAt?: string;
  musterPoint?: string;
  evacuationId?: string;
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

interface FireMarshalPanelProps {
  token: string;
}

export default function FireMarshalPanel({ token }: FireMarshalPanelProps) {
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedMusterPoint, setSelectedMusterPoint] = useState("all");
  const [activeEvacuationId, setActiveEvacuationId] = useState<string | null>(null);
  
  // Redirect to mobile view by default with token
  useEffect(() => {
    window.location.href = `/fire-marshal-mobile?token=${token}`;
  }, [token]);
  
  // Muster points from evacuation data or defaults
  const defaultMusterPoints = ["Main Car Park", "Side Entrance", "Rear Assembly"];

  // Fetch current evacuation accountability list
  const { data: evacuationData, isLoading, refetch } = useQuery<EvacuationData>({
    queryKey: [`/api/emergency/accountability/${activeEvacuationId || ''}`],
    enabled: !!activeEvacuationId,
    refetchInterval: 3000 // Auto-refresh every 3 seconds for better real-time sync
  });

  // Check for active evacuation
  const { data: activeEvacuation } = useQuery<ActiveEvacuationResponse>({
    queryKey: ["/api/emergency/active"],
    refetchInterval: 10000
  });

  useEffect(() => {
    if (activeEvacuation?.evacuationId) {
      setActiveEvacuationId(activeEvacuation.evacuationId);
    }
  }, [activeEvacuation]);

  // Mark person as safe mutation
  const markSafeMutation = useMutation({
    mutationFn: async ({ personId, musterPoint }: { personId: string; musterPoint: string }) => {
      const response = await fetch(`/api/emergency/mark-safe/${personId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ 
          musterPoint,
          evacuationId: activeEvacuationId 
        })
      });
      if (!response.ok) throw new Error("Failed to mark person as safe");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/emergency/accountability"] });
      toast({
        title: "Person marked safe",
        description: "The accountability list has been updated"
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update accountability status",
        variant: "destructive"
      });
    }
  });

  // Send update to all Fire Marshals
  const sendUpdateMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch("/api/emergency/send-update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ evacuationId: activeEvacuationId })
      });
      if (!response.ok) throw new Error("Failed to send update");
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Update sent",
        description: "All Fire Marshals have been notified"
      });
    }
  });

  // Complete evacuation mutation
  const completeEvacuationMutation = useMutation({
    mutationFn: async ({ checkOutMode }: { checkOutMode: 'keep_checked_in' | 'check_out_all' }) => {
      const response = await fetch('/api/emergency/complete-evacuation', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
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

  // Filter people based on search and muster point
  const filteredPeople = evacuationData?.people?.filter((person: PersonOnSite) => {
    const matchesSearch = person.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          person.department?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          person.company?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesMusterPoint = selectedMusterPoint === "all" || person.musterPoint === selectedMusterPoint;
    return matchesSearch && matchesMusterPoint;
  }) || [];

  // Calculate statistics
  const totalPeople = evacuationData?.people?.length || 0;
  const accountedFor = evacuationData?.people?.filter((p: PersonOnSite) => p.isAccountedFor).length || 0;
  const unaccounted = totalPeople - accountedFor;
  const musterPoints = evacuationData?.musterPoints || defaultMusterPoints;

  if (!activeEvacuationId) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 p-4 flex items-center justify-center">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-6 w-6 text-yellow-500" />
              No Active Emergency
            </CardTitle>
            <CardDescription>
              There is no active emergency evacuation at this time. This panel will activate automatically when an emergency is declared.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-red-50 to-orange-50 p-4">
      {/* Emergency Header */}
      <div className="bg-red-600 text-white p-4 rounded-lg mb-6 animate-pulse-slow">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <AlertTriangle className="h-8 w-8" />
          EMERGENCY EVACUATION ACTIVE - FIRE MARSHAL PANEL
        </h1>
        <p className="mt-1">Evacuation ID: {activeEvacuationId}</p>
      </div>

      {/* Statistics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Total On Site</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold flex items-center gap-2">
              <Users className="h-5 w-5" />
              {totalPeople}
            </div>
          </CardContent>
        </Card>

        <Card className="border-green-200 bg-green-50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-green-700">Accounted For</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-700 flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5" />
              {accountedFor}
            </div>
          </CardContent>
        </Card>

        <Card className="border-red-200 bg-red-50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-red-700">Unaccounted</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-700 flex items-center gap-2">
              <XCircle className="h-5 w-5" />
              {unaccounted}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Completion</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {totalPeople > 0 ? Math.round((accountedFor / totalPeople) * 100) : 0}%
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2 mt-2">
              <div 
                className="bg-green-500 h-2 rounded-full transition-all"
                style={{ width: `${totalPeople > 0 ? (accountedFor / totalPeople) * 100 : 0}%` }}
              />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Controls */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Accountability Controls</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4 flex-wrap">
            <div className="flex-1 min-w-[200px]">
              <Input
                placeholder="Search by name, department, or company..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full"
                data-testid="input-search-people"
              />
            </div>
            <Select value={selectedMusterPoint} onValueChange={setSelectedMusterPoint}>
              <SelectTrigger className="w-[200px]" data-testid="select-muster-point">
                <SelectValue placeholder="Select muster point" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Muster Points</SelectItem>
                {musterPoints.map((point) => (
                  <SelectItem key={point} value={point}>{point}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button onClick={() => refetch()} variant="outline" data-testid="button-refresh">
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
            <Button 
              onClick={() => window.open('/fire-marshal-mobile', '_blank')} 
              variant="outline"
              data-testid="button-mobile-view"
            >
              <Smartphone className="h-4 w-4 mr-2" />
              Mobile View
            </Button>
            <Button 
              onClick={() => sendUpdateMutation.mutate()} 
              variant="default"
              data-testid="button-send-update"
            >
              <Send className="h-4 w-4 mr-2" />
              Send Update to All Marshals
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button 
                  variant="default"
                  className="bg-blue-600 hover:bg-blue-700"
                  data-testid="button-complete-evacuation-panel"
                >
                  <CheckCircle2 className="h-4 w-4 mr-2" />
                  Complete Evacuation
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Complete Evacuation</AlertDialogTitle>
                  <AlertDialogDescription className="space-y-4">
                    {unaccounted > 0 && (
                      <div className="bg-yellow-50 border-l-4 border-yellow-400 p-3 mb-3">
                        <p className="text-yellow-800 font-medium">
                          ⚠️ Warning: {unaccounted} {unaccounted === 1 ? 'person is' : 'people are'} still unaccounted for
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
                <AlertDialogFooter className="flex-col sm:flex-row gap-2">
                  <AlertDialogAction
                    className="bg-green-600 hover:bg-green-700"
                    onClick={(e) => {
                      e.preventDefault();
                      completeEvacuationMutation.mutate({ checkOutMode: 'keep_checked_in' });
                    }}
                    disabled={completeEvacuationMutation.isPending}
                    data-testid="button-keep-checked-in-panel"
                  >
                    <UserCheck className="h-4 w-4 mr-2" />
                    Keep Everyone Checked In
                  </AlertDialogAction>
                  <AlertDialogAction
                    className="bg-orange-600 hover:bg-orange-700"
                    onClick={(e) => {
                      e.preventDefault();
                      completeEvacuationMutation.mutate({ checkOutMode: 'check_out_all' });
                    }}
                    disabled={completeEvacuationMutation.isPending}
                    data-testid="button-check-out-all-panel"
                  >
                    <LogOut className="h-4 w-4 mr-2" />
                    Check Out All Safe Personnel
                  </AlertDialogAction>
                  <AlertDialogCancel data-testid="button-cancel-complete-panel">Cancel</AlertDialogCancel>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </CardContent>
      </Card>

      {/* People Lists */}
      <Tabs defaultValue="unaccounted" className="space-y-4">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="unaccounted" data-testid="tab-unaccounted">
            Unaccounted ({unaccounted})
          </TabsTrigger>
          <TabsTrigger value="accounted" data-testid="tab-accounted">
            Accounted ({accountedFor})
          </TabsTrigger>
          <TabsTrigger value="all" data-testid="tab-all">
            All People ({totalPeople})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="unaccounted" className="space-y-4">
          {filteredPeople.filter((p: PersonOnSite) => !p.isAccountedFor).map((person: PersonOnSite) => (
            <PersonCard 
              key={person.id} 
              person={person} 
              musterPoints={musterPoints}
              onMarkSafe={(musterPoint) => markSafeMutation.mutate({ personId: person.id, musterPoint })}
            />
          ))}
        </TabsContent>

        <TabsContent value="accounted" className="space-y-4">
          {filteredPeople.filter((p: PersonOnSite) => p.isAccountedFor).map((person: PersonOnSite) => (
            <PersonCard 
              key={person.id} 
              person={person} 
              musterPoints={musterPoints}
              onMarkSafe={(musterPoint) => markSafeMutation.mutate({ personId: person.id, musterPoint })}
            />
          ))}
        </TabsContent>

        <TabsContent value="all" className="space-y-4">
          {filteredPeople.map((person: PersonOnSite) => (
            <PersonCard 
              key={person.id} 
              person={person} 
              musterPoints={musterPoints}
              onMarkSafe={(musterPoint) => markSafeMutation.mutate({ personId: person.id, musterPoint })}
            />
          ))}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function PersonCard({ 
  person, 
  musterPoints, 
  onMarkSafe 
}: { 
  person: PersonOnSite; 
  musterPoints: string[];
  onMarkSafe: (musterPoint: string) => void;
}) {
  const [selectedMusterPoint, setSelectedMusterPoint] = useState(person.musterPoint || musterPoints[0]);

  return (
    <Card className={person.isAccountedFor ? "border-green-200 bg-green-50/50" : "border-red-200 bg-red-50/50"}>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-3">
              <h3 className="font-semibold text-lg">{person.name}</h3>
              <Badge variant={person.type === 'staff' ? 'default' : 'secondary'}>
                {person.type}
              </Badge>
              {person.isAccountedFor && (
                <Badge variant="outline" className="bg-green-100 text-green-700">
                  <CheckCircle2 className="h-3 w-3 mr-1" />
                  Safe
                </Badge>
              )}
            </div>
            <div className="text-sm text-gray-600 mt-1">
              {person.department && <span>Department: {person.department}</span>}
              {person.company && <span>Company: {person.company}</span>}
            </div>
            {person.isAccountedFor && person.accountedBy && (
              <div className="text-xs text-gray-500 mt-2">
                Marked safe by {person.accountedBy} at {new Date(person.accountedAt!).toLocaleTimeString()}
                {person.musterPoint && (
                  <span className="ml-2">
                    <MapPin className="h-3 w-3 inline mr-1" />
                    {person.musterPoint}
                  </span>
                )}
              </div>
            )}
          </div>
          
          {!person.isAccountedFor && (
            <div className="flex items-center gap-2">
              <Select value={selectedMusterPoint} onValueChange={setSelectedMusterPoint}>
                <SelectTrigger className="w-[180px]" data-testid={`select-muster-${person.id}`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {musterPoints.map((point) => (
                    <SelectItem key={point} value={point}>{point}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button 
                onClick={() => onMarkSafe(selectedMusterPoint)}
                className="bg-green-600 hover:bg-green-700"
                data-testid={`button-mark-safe-${person.id}`}
              >
                <CheckCircle2 className="h-4 w-4 mr-1" />
                Mark Safe
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}