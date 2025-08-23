import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import GlassCard from "@/components/GlassCard";
import { Download, Printer, Users, UserCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

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
}

export default function MusterList() {
  const [activeFilter, setActiveFilter] = useState<"all" | "staff" | "visitors">("all");

  const { data: musterList, isLoading } = useQuery<MusterEntry[]>({
    queryKey: ["/api/muster"],
  });

  const filteredList = musterList?.filter(entry => {
    if (activeFilter === "all") return true;
    if (activeFilter === "staff") return entry.type === "staff";
    if (activeFilter === "visitors") return entry.type === "visitor";
    return true;
  }) || [];

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

  const getCounts = () => {
    if (!musterList) return { all: 0, staff: 0, visitors: 0 };
    
    const staff = musterList.filter(e => e.type === "staff").length;
    const visitors = musterList.filter(e => e.type === "visitor").length;
    
    return {
      all: musterList.length,
      staff,
      visitors
    };
  };

  const counts = getCounts();

  if (isLoading) {
    return <div>Loading muster list...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-slate-800">Muster List</h2>
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
                      <Badge 
                        variant={entry.type === "staff" ? "default" : "secondary"}
                        className={entry.type === "staff" ? "bg-blue-100 text-blue-800" : "bg-green-100 text-green-800"}
                      >
                        <UserCheck className="mr-1" size={12} />
                        {entry.type === "staff" ? "Staff" : "Visitor"}
                      </Badge>
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
