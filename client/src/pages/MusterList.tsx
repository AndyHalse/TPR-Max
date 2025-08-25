import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import GlassCard from "@/components/GlassCard";
import { Download, Printer, Users, UserCheck, Shield, Fingerprint, Eye, Wifi, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";

interface BiostarStaffMember {
  userId: string;
  userName: string;
  lastEvent: number;
  lastEventTime: Date;
  isOnSite: boolean;
  deviceId: string;
  department: string;
}

interface MusterEntry {
  id: string;
  name: string;
  type: "staff" | "visitor";
  department?: string;
  company?: string;
  employeeId?: string;
  purpose?: string;
  hostStaffId?: string;
  checkedInAt: string;
  location: string;
  isBiostarOnly?: boolean;
}

export default function MusterList() {
  const [activeFilter, setActiveFilter] = useState<"all" | "staff" | "visitors">("all");
  const [showBiostarData, setShowBiostarData] = useState(true);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: musterList, isLoading } = useQuery<MusterEntry[]>({
    queryKey: ["/api/muster"],
  });

  const { data: biostarStaff, isLoading: biostarLoading } = useQuery<BiostarStaffMember[]>({
    queryKey: ["/api/biostar/staff-status"],
    enabled: showBiostarData,
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  const { data: settings } = useQuery<{
    biostarEnabled?: boolean;
    biostarServerUrl?: string;
  }>({
    queryKey: ["/api/settings"],
  });

  // This will be defined after enhancedMusterList
  // const filteredList is moved after getCounts

  const getInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase();
  };

  const getAvatarColor = (type: string, index: number) => {
    if (type === "staff") {
      const colors = ["bg-blue-500", "bg-purple-500", "bg-indigo-500"];
      return colors[index % colors.length];
    }
    const colors = ["bg-green-500", "bg-orange-500", "bg-teal-500"];
    return colors[index % colors.length];
  };

  const formatTime = (dateString: string) => {
    return new Date(dateString).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // Merge muster list with Biostar data
  const getEnhancedMusterList = () => {
    const regularMuster = musterList || [];
    
    if (!showBiostarData || !biostarStaff || !settings?.biostarEnabled) {
      return regularMuster;
    }

    // Add Biostar staff who are on-site but not in regular muster
    const biostarOnSite = biostarStaff.filter(staff => staff.isOnSite);
    const existingStaffIds = new Set(regularMuster
      .filter(entry => entry.type === 'staff')
      .map(entry => entry.employeeId));
    
    const biostarOnlyStaff: MusterEntry[] = biostarOnSite
      .filter(staff => !existingStaffIds.has(staff.userId))
      .map(staff => ({
        id: `biostar-${staff.userId}`,
        name: staff.userName,
        type: 'staff' as const,
        department: staff.department,
        employeeId: staff.userId,
        checkedInAt: staff.lastEventTime.toISOString(),
        location: `Device ${staff.deviceId}`,
        isBiostarOnly: true
      }));

    return [...regularMuster, ...biostarOnlyStaff];
  };

  const enhancedMusterList = getEnhancedMusterList();

  const getCounts = () => {
    const staff = enhancedMusterList.filter(e => e.type === "staff").length;
    const visitors = enhancedMusterList.filter(e => e.type === "visitor").length;
    const biostarOnly = enhancedMusterList.filter(e => e.isBiostarOnly).length;
    
    return {
      all: enhancedMusterList.length,
      staff,
      visitors,
      biostarOnly
    };
  };

  const counts = getCounts();

  const filteredList = enhancedMusterList.filter(entry => {
    if (activeFilter === "all") return true;
    if (activeFilter === "staff") return entry.type === "staff";
    if (activeFilter === "visitors") return entry.type === "visitor";
    return true;
  });

  if (isLoading) {
    return <div>Loading muster list...</div>;
  }

  return (
    <div className="space-y-6 p-6 rounded-xl bg-background min-h-screen">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Muster List</h2>
          {settings?.biostarEnabled && (
            <div className="flex items-center gap-4 mt-2">
              <div className="flex items-center gap-2">
                <Shield size={16} className="text-blue-600" />
                <span className="text-sm text-slate-600">Biostar Integration</span>
                {biostarLoading ? (
                  <WifiOff size={14} className="text-amber-500" />
                ) : biostarStaff ? (
                  <Wifi size={14} className="text-green-500" />
                ) : (
                  <WifiOff size={14} className="text-red-500" />
                )}
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={showBiostarData}
                  onCheckedChange={setShowBiostarData}
                  data-testid="switch-biostar-muster"
                />
                <Label className="text-sm text-slate-600">Include Biometric Data</Label>
              </div>
              {counts.biostarOnly > 0 && (
                <Badge variant="secondary" className="text-xs">
                  <Fingerprint size={12} className="mr-1" />
                  {counts.biostarOnly} from biometric only
                </Badge>
              )}
            </div>
          )}
        </div>
        <div className="flex gap-3">
          <Button
            variant="outline"
            className="bg-gradient-to-r from-green-600 to-emerald-600 text-white font-medium hover:shadow-lg transition-all duration-300"
            data-testid="button-export-pdf"
          >
            <Download className="mr-2" size={16} />
            Export PDF
          </Button>
          <Button
            className="gradient-blue text-white font-medium hover:shadow-lg transition-all duration-300"
            data-testid="button-print-list"
          >
            <Printer className="mr-2" size={16} />
            Print List
          </Button>
        </div>
      </div>

      {/* Filter Tabs */}
      <GlassCard className="p-1 inline-flex">
        <Button
          variant="ghost"
          onClick={() => setActiveFilter("all")}
          className={`px-4 py-2 rounded-lg text-sm font-medium ${
            activeFilter === "all" 
              ? "bg-white text-blue-600 shadow-sm" 
              : "text-slate-600 hover:text-slate-800"
          }`}
          data-testid="filter-all"
        >
          All ({counts.all})
        </Button>
        <Button
          variant="ghost"
          onClick={() => setActiveFilter("staff")}
          className={`px-4 py-2 rounded-lg text-sm font-medium ${
            activeFilter === "staff" 
              ? "bg-white text-blue-600 shadow-sm" 
              : "text-slate-600 hover:text-slate-800"
          }`}
          data-testid="filter-staff"
        >
          Staff ({counts.staff})
        </Button>
        <Button
          variant="ghost"
          onClick={() => setActiveFilter("visitors")}
          className={`px-4 py-2 rounded-lg text-sm font-medium ${
            activeFilter === "visitors" 
              ? "bg-white text-blue-600 shadow-sm" 
              : "text-slate-600 hover:text-slate-800"
          }`}
          data-testid="filter-visitors"
        >
          Visitors ({counts.visitors})
        </Button>
      </GlassCard>

      {/* Muster List Table */}
      <GlassCard className="overflow-hidden">
        {filteredList.length === 0 ? (
          <div className="text-center py-12">
            <Users className="mx-auto h-12 w-12 text-gray-400 mb-4" />
            <p className="text-slate-600 text-lg">No entries found</p>
            <p className="text-slate-500 text-sm mt-2">
              {activeFilter === "all" 
                ? "No staff or visitors are currently on-site"
                : `No ${activeFilter} are currently on-site`
              }
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-white/50">
                <tr>
                  <th className="px-6 py-4 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                    Name
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                    Type
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                    Company/Department
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                    Check-in Time
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                    Host/ID
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                    Location
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/20">
                {filteredList.map((entry, index) => (
                  <tr key={entry.id} className="hover:bg-white/20" data-testid={`muster-entry-${entry.id}`}>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className={`w-8 h-8 ${getAvatarColor(entry.type, index)} rounded-full flex items-center justify-center mr-3`}>
                          <span className="text-white text-xs font-medium">
                            {getInitials(entry.name)}
                          </span>
                        </div>
                        <span className="text-sm font-medium text-slate-800" data-testid={`muster-name-${entry.id}`}>
                          {entry.name}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <Badge 
                          variant={entry.type === "staff" ? "default" : "secondary"}
                          className={entry.type === "staff" ? "bg-blue-100 text-blue-800" : "bg-green-100 text-green-800"}
                        >
                          <UserCheck className="mr-1" size={12} />
                          {entry.type === "staff" ? "Staff" : "Visitor"}
                        </Badge>
                        {entry.isBiostarOnly && (
                          <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200">
                            <Fingerprint className="mr-1" size={10} />
                            Biometric
                          </Badge>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600">
                      {entry.type === "staff" ? entry.department : entry.company || "No company"}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600">
                      {formatTime(entry.checkedInAt)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600">
                      {entry.type === "staff" ? entry.employeeId : "Visitor"}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600">
                      {entry.location}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </GlassCard>
    </div>
  );
}
