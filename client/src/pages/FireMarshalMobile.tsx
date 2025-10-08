import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
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
  UserMinus
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
  type: 'staff' | 'visitor' | 'contractor';
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

interface FireMarshalMobileProps {
  token: string;
}

export default function FireMarshalMobile({ token }: FireMarshalMobileProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [activeEvacuationId, setActiveEvacuationId] = useState<string | null>(null);
  const [marshalName, setMarshalName] = useState("");
  const [selectedMusterPoint, setSelectedMusterPoint] = useState<string>("");
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set());
  const [filterType, setFilterType] = useState<'all' | 'unaccounted' | 'accounted'>('unaccounted');

  // Load marshal name from localStorage
  useEffect(() => {
    const savedName = localStorage.getItem('fireMarshallName');
    if (savedName) setMarshalName(savedName);
  }, []);

  // Save marshal name to localStorage
  useEffect(() => {
    if (marshalName) {
      localStorage.setItem('fireMarshallName', marshalName);
    }
  }, [marshalName]);

  // Fetch evacuation accountability list with shorter refresh for real-time updates
  const { data: evacuationData, refetch } = useQuery<EvacuationData>({
    queryKey: [`/api/emergency/accountability/${activeEvacuationId || ''}`],
    enabled: !!activeEvacuationId,
    refetchInterval: 2000, // Refresh every 2 seconds for real-time updates
    queryFn: async () => {
      const response = await fetch(`/api/emergency/accountability/${activeEvacuationId}`, {
        headers: { 'X-Emergency-Token': token }
      });
      if (!response.ok) throw new Error('Failed to fetch accountability data');
      return response.json();
    }
  });

  // Check for active evacuation
  const { data: activeEvacuation } = useQuery<ActiveEvacuationResponse>({
    queryKey: ["/api/emergency/active"],
    refetchInterval: 5000,
    queryFn: async () => {
      const response = await fetch('/api/emergency/active', {
        headers: { 'X-Emergency-Token': token }
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

  // Set default muster point
  useEffect(() => {
    if (evacuationData?.musterPoints && !selectedMusterPoint) {
      setSelectedMusterPoint(evacuationData.musterPoints[0]);
    }
  }, [evacuationData?.musterPoints, selectedMusterPoint]);

  // Mark person as safe mutation
  const markSafeMutation = useMutation({
    mutationFn: async ({ personId, musterPoint }: { personId: string; musterPoint: string }) => {
      const response = await fetch(`/api/emergency/mark-safe/${personId}`, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "X-Emergency-Token": token
        },
        credentials: "include",
        body: JSON.stringify({ 
          musterPoint,
          evacuationId: activeEvacuationId,
          marshalName: marshalName
        })
      });
      if (!response.ok) throw new Error("Failed to mark person as safe");
      return response.json();
    },
    onSuccess: () => {
      // Invalidate Fire Marshal accountability view
      queryClient.invalidateQueries({ queryKey: [`/api/emergency/accountability`] });
      // Invalidate admin muster dashboard for real-time sync
      queryClient.invalidateQueries({ queryKey: ["/api/muster"] });
      refetch();
      toast({
        title: "✓ Marked Safe",
        description: "Person has been marked as safe",
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
      const response = await fetch('/api/emergency/complete-evacuation', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Emergency-Token': token
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
      queryClient.invalidateQueries({ queryKey: ['/api/emergency/active'] });
      queryClient.invalidateQueries({ queryKey: ['/api/muster'] });
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

  // Filter people based on search and filter type
  const filteredPeople = evacuationData?.people?.filter(person => {
    const matchesSearch = person.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          person.department?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          person.company?.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesFilter = filterType === 'all' ||
                         (filterType === 'unaccounted' && !person.isAccountedFor) ||
                         (filterType === 'accounted' && person.isAccountedFor);
    
    return matchesSearch && matchesFilter;
  }) || [];

  if (!activeEvacuationId) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 p-4 flex items-center justify-center">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <Shield className="h-16 w-16 mx-auto text-green-500 mb-4" />
            <CardTitle className="text-xl">No Active Evacuation</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-center text-muted-foreground">
              This panel will activate automatically during an emergency evacuation.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-red-50 dark:bg-red-950/20 pb-20">
      {/* Emergency Header - Fixed */}
      <div className="sticky top-0 z-50 bg-red-600 text-white p-3 shadow-lg">
        <div className="flex items-center gap-2 animate-pulse">
          <Siren className="h-6 w-6" />
          <div className="flex-1">
            <h1 className="text-lg font-bold">EVACUATION ACTIVE</h1>
            <p className="text-xs opacity-90">Fire Marshal Panel</p>
          </div>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => refetch()}
            className="bg-white/20 hover:bg-white/30"
            data-testid="button-refresh-mobile"
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
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
                <p className="text-2xl font-bold">{evacuationData?.totalOnSite || 0}</p>
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
                  {evacuationData?.accountedFor || 0}
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
                  {evacuationData?.unaccounted || 0}
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
                  {evacuationData && evacuationData.totalOnSite > 0
                    ? Math.round((evacuationData.accountedFor / evacuationData.totalOnSite) * 100)
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
        {/* Muster Point Selection */}
        <Select value={selectedMusterPoint} onValueChange={setSelectedMusterPoint}>
          <SelectTrigger className="w-full bg-white h-12 text-base" data-testid="select-muster-mobile">
            <MapPin className="h-5 w-5 mr-2" />
            <SelectValue placeholder="Select Muster Point" />
          </SelectTrigger>
          <SelectContent>
            {evacuationData?.musterPoints?.map((point) => (
              <SelectItem key={point} value={point} className="text-base py-3">
                {point}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

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

        {/* Filter Tabs */}
        <div className="flex gap-2 bg-white rounded-lg p-1">
          <Button
            size="default"
            variant={filterType === 'unaccounted' ? 'default' : 'ghost'}
            onClick={() => setFilterType('unaccounted')}
            className="flex-1 text-sm h-12"
            data-testid="filter-unaccounted-mobile"
          >
            Missing ({evacuationData?.unaccounted || 0})
          </Button>
          <Button
            size="default"
            variant={filterType === 'accounted' ? 'default' : 'ghost'}
            onClick={() => setFilterType('accounted')}
            className="flex-1 text-sm h-12"
            data-testid="filter-accounted-mobile"
          >
            Safe ({evacuationData?.accountedFor || 0})
          </Button>
          <Button
            size="default"
            variant={filterType === 'all' ? 'default' : 'ghost'}
            onClick={() => setFilterType('all')}
            className="flex-1 text-sm h-12"
            data-testid="filter-all-mobile"
          >
            All ({evacuationData?.totalOnSite || 0})
          </Button>
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
                      <Badge variant="secondary" className="text-xs">
                        {person.type}
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
                      e.stopPropagation();
                      if (!marshalName) {
                        toast({
                          title: "Name Required",
                          description: "Please enter your name first",
                          variant: "destructive"
                        });
                        return;
                      }
                      markSafeMutation.mutate({ 
                        personId: person.id, 
                        musterPoint: selectedMusterPoint 
                      });
                    }}
                    disabled={markSafeMutation.isPending || !marshalName}
                    data-testid={`button-mark-safe-mobile-${person.id}`}
                  >
                    {markSafeMutation.isPending ? (
                      <RefreshCw className="h-5 w-5 mr-2 animate-spin" />
                    ) : (
                      <CheckCircle2 className="h-5 w-5 mr-2" />
                    )}
                    Mark Safe at {selectedMusterPoint}
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