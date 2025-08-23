import { useQuery } from "@tanstack/react-query";
import GlassCard from "@/components/GlassCard";
import { UsersRound, AtSign, BadgeInfo, Clock } from "lucide-react";

interface Stats {
  currentVisitors: number;
  todayCheckins: number;
  staffOnSite: number;
  avgVisitDuration: string;
}

interface Visitor {
  id: string;
  name: string;
  company?: string;
  hostStaffId?: string;
  checkedInAt: string;
  isCheckedIn: boolean;
}

interface Staff {
  id: string;
  name: string;
  department: string;
  employeeId: string;
}

export default function Dashboard() {
  const { data: stats, isLoading: statsLoading } = useQuery<Stats>({
    queryKey: ["/api/stats"],
  });

  const { data: currentVisitors, isLoading: visitorsLoading } = useQuery<Visitor[]>({
    queryKey: ["/api/visitors/current"],
  });

  const { data: staff } = useQuery<Staff[]>({
    queryKey: ["/api/staff"],
  });

  const getStaffName = (staffId?: string) => {
    if (!staffId || !staff) return "Unknown";
    const staffMember = staff.find(s => s.id === staffId);
    return staffMember?.name || "Unknown";
  };

  const getInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase();
  };

  const formatTime = (dateString: string) => {
    return new Date(dateString).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (statsLoading) {
    return <div>Loading dashboard...</div>;
  }

  return (
    <div className="space-y-8">
      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <GlassCard hover>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-slate-600 text-sm font-medium">Current Visitors</p>
              <p className="text-3xl font-bold text-slate-800 mt-1" data-testid="stat-current-visitors">
                {stats?.currentVisitors || 0}
              </p>
            </div>
            <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center">
              <UsersRound className="text-blue-600" size={24} />
            </div>
          </div>
        </GlassCard>
        
        <GlassCard hover>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-slate-600 text-sm font-medium">Today's Check-ins</p>
              <p className="text-3xl font-bold text-slate-800 mt-1" data-testid="stat-today-checkins">
                {stats?.todayCheckins || 0}
              </p>
            </div>
            <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center">
              <AtSign className="text-green-600" size={24} />
            </div>
          </div>
        </GlassCard>
        
        <GlassCard hover>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-slate-600 text-sm font-medium">Staff On-Site</p>
              <p className="text-3xl font-bold text-slate-800 mt-1" data-testid="stat-staff-onsite">
                {stats?.staffOnSite || 0}
              </p>
            </div>
            <div className="w-12 h-12 bg-purple-100 rounded-xl flex items-center justify-center">
              <BadgeInfo className="text-purple-600" size={24} />
            </div>
          </div>
        </GlassCard>
        
        <GlassCard hover>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-slate-600 text-sm font-medium">Avg. Visit Duration</p>
              <p className="text-3xl font-bold text-slate-800 mt-1" data-testid="stat-avg-duration">
                {stats?.avgVisitDuration || "0h"}
              </p>
            </div>
            <div className="w-12 h-12 bg-orange-100 rounded-xl flex items-center justify-center">
              <Clock className="text-orange-600" size={24} />
            </div>
          </div>
        </GlassCard>
      </div>

      {/* Current Visitors and Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Current Visitors */}
        <GlassCard>
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-semibold text-slate-800">Current Visitors</h3>
            <button className="text-blue-600 hover:text-blue-700 text-sm font-medium" data-testid="button-view-all-visitors">
              View All
            </button>
          </div>
          
          <div className="space-y-4">
            {visitorsLoading ? (
              <div className="text-center py-4 text-slate-600">Loading visitors...</div>
            ) : !currentVisitors || currentVisitors.length === 0 ? (
              <div className="text-center py-4 text-slate-600">No current visitors</div>
            ) : (
              currentVisitors.slice(0, 3).map((visitor) => (
                <div key={visitor.id} className="flex items-center justify-between p-4 bg-white/50 rounded-xl" data-testid={`visitor-${visitor.id}`}>
                  <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 bg-blue-500 rounded-full flex items-center justify-center">
                      <span className="text-white font-medium text-sm">{getInitials(visitor.name)}</span>
                    </div>
                    <div>
                      <p className="font-medium text-slate-800" data-testid={`visitor-name-${visitor.id}`}>
                        {visitor.name}
                      </p>
                      <p className="text-sm text-slate-600">{visitor.company || "No company"}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium text-slate-800">
                      Host: {getStaffName(visitor.hostStaffId)}
                    </p>
                    <p className="text-xs text-slate-500">
                      Checked in: {formatTime(visitor.checkedInAt)}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        </GlassCard>

        {/* Recent Activity */}
        <GlassCard>
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-semibold text-slate-800">Recent Activity</h3>
            <button className="text-blue-600 hover:text-blue-700 text-sm font-medium" data-testid="button-view-all-activity">
              View All
            </button>
          </div>
          
          <div className="space-y-4">
            <div className="text-center py-8 text-slate-600">
              <p>Recent activity will appear here</p>
              <p className="text-sm mt-2">Activity log coming soon</p>
            </div>
          </div>
        </GlassCard>
      </div>
    </div>
  );
}
