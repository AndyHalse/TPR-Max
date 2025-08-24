import { useState } from "react";
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
  CheckCircle, 
  XCircle, 
  Search,
  Shield,
  Clock,
  MapPin,
  Phone,
  Mail,
  Download,
  Siren
} from "lucide-react";

interface MusterListItem {
  id: string;
  name: string;
  type: 'staff' | 'visitor' | 'contractor';
  department?: string;
  company?: string;
  checkedInAt: string;
  location: string;
  accounted: boolean;
}

export default function EmergencyMuster() {
  const [searchTerm, setSearchTerm] = useState("");
  const [emergencyActive, setEmergencyActive] = useState(false);
  const [selectedMusterPoint, setSelectedMusterPoint] = useState("main");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: musterList = [], isLoading } = useQuery<MusterListItem[]>({
    queryKey: ["/api/muster"],
  });

  // Mutation to toggle accounted status
  const toggleAccountedMutation = useMutation({
    mutationFn: async ({ personId, type }: { personId: string, type: string }) => {
      const response = await apiRequest("POST", `/api/muster/${personId}/toggle`, { type });
      return await response.json();
    },
    onSuccess: (data) => {
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

  const musterPoints = [
    { id: "main", name: "Main Car Park", capacity: 200, current: 45 },
    { id: "side", name: "Side Entrance", capacity: 100, current: 23 },
    { id: "rear", name: "Rear Assembly", capacity: 150, current: 12 }
  ];

  const filteredList = musterList.filter(person => 
    person.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (person.department && person.department.toLowerCase().includes(searchTerm.toLowerCase())) ||
    (person.company && person.company.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const totalPeople = musterList.length;
  const accountedFor = musterList.filter(p => p.accounted).length;
  const staffCount = musterList.filter(p => p.type === 'staff').length;
  const visitorCount = musterList.filter(p => p.type === 'visitor').length;
  const contractorCount = musterList.filter(p => p.type === 'contractor').length;

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
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-200">Emergency Muster</h2>
          <p className="text-slate-600 dark:text-slate-400 mt-1">
            Real-time emergency evacuation management and accountability
          </p>
        </div>
        <Button 
          onClick={handleEmergencyToggle}
          className={emergencyActive ? 
            "bg-red-600 hover:bg-red-700 text-white" : 
            "bg-orange-600 hover:bg-orange-700 text-white"
          }
          data-testid="button-emergency-toggle"
        >
          <Siren className="mr-2" size={16} />
          {emergencyActive ? "Deactivate Emergency" : "Activate Emergency"}
        </Button>
      </div>

      {emergencyActive && (
        <GlassCard className="border-2 border-red-500 bg-red-50 dark:bg-red-900/20">
          <div className="flex items-center justify-center p-4">
            <AlertTriangle className="text-red-600 mr-3" size={32} />
            <div className="text-center">
              <h3 className="text-lg font-bold text-red-800 dark:text-red-200">EMERGENCY ACTIVE</h3>
              <p className="text-red-700 dark:text-red-300">All personnel must proceed to designated muster points</p>
            </div>
          </div>
        </GlassCard>
      )}

      {/* Emergency Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <GlassCard hover className="dark:glass-dark">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-slate-600 dark:text-slate-400 text-sm font-medium">Total People</p>
              <p className="text-3xl font-bold text-slate-800 dark:text-slate-200 mt-1" data-testid="stat-total-people">
                {totalPeople}
              </p>
            </div>
            <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900/30 rounded-xl flex items-center justify-center">
              <Users className="text-blue-600 dark:text-blue-400" size={24} />
            </div>
          </div>
        </GlassCard>
        
        <GlassCard hover className="dark:glass-dark">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-slate-600 dark:text-slate-400 text-sm font-medium">Accounted For</p>
              <p className="text-3xl font-bold text-green-600 dark:text-green-400 mt-1" data-testid="stat-accounted">
                {accountedFor}
              </p>
              <p className="text-xs text-green-600 dark:text-green-400 mt-1">
                {totalPeople > 0 ? Math.round((accountedFor / totalPeople) * 100) : 0}% Complete
              </p>
            </div>
            <div className="w-12 h-12 bg-green-100 dark:bg-green-900/30 rounded-xl flex items-center justify-center">
              <CheckCircle className="text-green-600 dark:text-green-400" size={24} />
            </div>
          </div>
        </GlassCard>
        
        <GlassCard hover className="dark:glass-dark">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-slate-600 dark:text-slate-400 text-sm font-medium">Staff On-Site</p>
              <p className="text-3xl font-bold text-purple-600 dark:text-purple-400 mt-1" data-testid="stat-staff-count">
                {staffCount}
              </p>
            </div>
            <div className="w-12 h-12 bg-purple-100 dark:bg-purple-900/30 rounded-xl flex items-center justify-center">
              <Shield className="text-purple-600 dark:text-purple-400" size={24} />
            </div>
          </div>
        </GlassCard>
        
        <GlassCard hover className="dark:glass-dark">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-slate-600 dark:text-slate-400 text-sm font-medium">Visitors</p>
              <p className="text-3xl font-bold text-orange-600 dark:text-orange-400 mt-1" data-testid="stat-visitor-count">
                {visitorCount}
              </p>
            </div>
            <div className="w-12 h-12 bg-orange-100 dark:bg-orange-900/30 rounded-xl flex items-center justify-center">
              <Users className="text-orange-600 dark:text-orange-400" size={24} />
            </div>
          </div>
        </GlassCard>
      </div>

      {/* Muster Points */}
      <GlassCard className="dark:glass-dark">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-200">Muster Points Status</h3>
          <Button variant="outline" size="sm" data-testid="button-update-muster-points">
            <MapPin className="mr-2" size={16} />
            Update Locations
          </Button>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {musterPoints.map((point) => (
            <div 
              key={point.id} 
              className={`p-4 rounded-xl border-2 cursor-pointer transition-all ${
                selectedMusterPoint === point.id 
                  ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' 
                  : 'border-gray-200 dark:border-gray-600 bg-white/50 dark:bg-slate-800/50'
              }`}
              onClick={() => setSelectedMusterPoint(point.id)}
              data-testid={`muster-point-${point.id}`}
            >
              <div className="flex items-center justify-between mb-2">
                <h4 className="font-medium text-slate-800 dark:text-slate-200">{point.name}</h4>
                <Badge variant={point.current < point.capacity * 0.8 ? "default" : "destructive"}>
                  {point.current}/{point.capacity}
                </Badge>
              </div>
              <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                <div 
                  className={`h-2 rounded-full ${
                    point.current < point.capacity * 0.8 ? 'bg-green-500' : 'bg-red-500'
                  }`}
                  style={{ width: `${(point.current / point.capacity) * 100}%` }}
                ></div>
              </div>
            </div>
          ))}
        </div>
      </GlassCard>

      {/* Search and Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <GlassCard className="dark:glass-dark">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-200">Personnel Accountability</h3>
              <div className="flex space-x-2">
                <Button variant="outline" size="sm" data-testid="button-mark-all-safe">
                  <CheckCircle className="mr-2" size={16} />
                  Mark All Safe
                </Button>
                <Button variant="outline" size="sm" data-testid="button-export-muster">
                  <Download className="mr-2" size={16} />
                  Export List
                </Button>
              </div>
            </div>
            
            <div className="mb-6">
              <Label htmlFor="search" className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2 block">
                Search Personnel
              </Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" size={16} />
                <Input
                  id="search"
                  type="text"
                  placeholder="Search by name, department, or company..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 w-full px-4 py-3 rounded-xl border border-white/30 bg-white/50 dark:bg-slate-800/50 focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-800 dark:text-slate-200"
                  data-testid="input-search-personnel"
                />
              </div>
            </div>
            
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {filteredList.map((person) => (
                <div 
                  key={person.id} 
                  className={`flex items-center justify-between p-4 rounded-xl transition-all ${
                    person.accounted 
                      ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800' 
                      : 'bg-white/50 dark:bg-slate-800/50 border border-gray-200 dark:border-gray-600'
                  }`}
                  data-testid={`person-${person.id}`}
                >
                  <div className="flex items-center space-x-3">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                      person.type === 'staff' ? 'bg-blue-500' : 
                      person.type === 'visitor' ? 'bg-orange-500' : 'bg-yellow-500'
                    }`}>
                      <span className="text-white font-medium text-sm">
                        {person.name.split(' ').map(n => n[0]).join('').toUpperCase()}
                      </span>
                    </div>
                    <div>
                      <p className="font-medium text-slate-800 dark:text-slate-200">{person.name}</p>
                      <p className="text-sm text-slate-600 dark:text-slate-400">
                        {person.type === 'staff' ? person.department : person.company} • {person.location}
                      </p>
                    </div>
                  </div>
                  
                  <div className="flex items-center space-x-3">
                    <Badge variant={person.type === 'staff' ? 'default' : 'secondary'}>
                      {person.type}
                    </Badge>
                    <Button
                      size="sm"
                      variant={person.accounted ? "destructive" : "default"}
                      onClick={() => toggleAccountedStatus(person.id, person.type)}
                      data-testid={`button-toggle-${person.id}`}
                    >
                      {person.accounted ? (
                        <>
                          <XCircle className="mr-1" size={14} />
                          Unmark
                        </>
                      ) : (
                        <>
                          <CheckCircle className="mr-1" size={14} />
                          Safe
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
            <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-200">Emergency Contacts</h3>
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
            
            <Button className="w-full" variant="outline" data-testid="button-send-alert">
              <Mail className="mr-2" size={16} />
              Send Alert Email
            </Button>
          </div>
        </GlassCard>
      </div>
    </div>
  );
}