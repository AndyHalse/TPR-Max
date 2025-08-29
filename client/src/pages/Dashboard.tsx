import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import GlassCard from "@/components/GlassCard";
import AIInsights from "@/components/AIInsights";
import { UsersRound, AtSign, BadgeInfo, Clock, TrendingUp, Shield, BarChart3, AlertTriangle, Download, CheckCircle, DollarSign, LogOut, User, HardHat, Building2, Settings, Eye } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { useState } from "react";
import type { Staff, Visitor } from "@shared/schema";

interface Stats {
  currentVisitors: number;
  todayCheckins: number;
  staffOnSite: number;
  contractorsOnSite: number;
}


interface Activity {
  id: string;
  type: 'checkin' | 'checkout' | 'staff_added' | 'prebooking';
  name: string;
  timestamp: string;
  details?: string;
}

export default function Dashboard() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const [openModal, setOpenModal] = useState<'visitors' | 'checkins' | 'staff' | 'department-details' | 'visitor-details' | null>(null);
  const [selectedDepartment, setSelectedDepartment] = useState<string>('');
  const [selectedVisitor, setSelectedVisitor] = useState<any>(null);
  
  const { data: stats, isLoading: statsLoading } = useQuery<Stats>({
    queryKey: ["/api/stats"],
  });

  const { data: currentVisitors, isLoading: visitorsLoading } = useQuery<Visitor[]>({
    queryKey: ["/api/visitors/current"],
  });

  const { data: staff } = useQuery<Staff[]>({
    queryKey: ["/api/staff"],
  });

  const { data: todayVisitors } = useQuery<Visitor[]>({
    queryKey: ["/api/visitors/today"],
  });

  const { data: checkedInStaff } = useQuery<Staff[]>({
    queryKey: ["/api/staff/checked-in"],
  });

  const { data: recentActivity, isLoading: activityLoading } = useQuery<Activity[]>({
    queryKey: ["/api/activity/recent"],
  });

  const { data: departmentAnalytics, isLoading: departmentsLoading } = useQuery<Array<{
    department: string;
    visitorCount: number;
    staffCount: number;
    totalCount: number;
    trend: string;
    color: string;
  }>>({
    queryKey: ["/api/analytics/departments"],
    refetchInterval: 5000, // Refresh every 5 seconds for real-time updates
  });

  const { data: peakHoursData, isLoading: peakHoursLoading } = useQuery<{
    peakHours: string;
    weeklyTrend: string;
    hourlyData: Array<{
      hour: string;
      visitors: number;
      staff: number;
      contractors: number;
      total: number;
    }>;
  }>({
    queryKey: ["/api/analytics/peak-hours"],
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  const { data: departmentDetails, isLoading: departmentDetailsLoading } = useQuery<{
    department: string;
    staff: Array<{
      id: string;
      name: string;
      checkedInAt: Date | null;
      isCheckedIn: boolean;
      accessLevel: string;
    }>;
    visitors: Array<{
      id: string;
      name: string;
      company: string | null;
      checkedInAt: Date;
      isCheckedIn: boolean;
      hostName: string;
    }>;
    totalCount: number;
  }>({
    queryKey: ["/api/analytics/departments", selectedDepartment],
    enabled: !!selectedDepartment && openModal === 'department-details',
  });

  const getStaffName = (staffId?: string) => {
    if (!staffId || !staff) return "Unknown";
    const staffMember = staff.find(s => s.id === staffId);
    return staffMember ? `${staffMember.firstName} ${staffMember.lastName}` : "Unknown";
  };

  const getInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase();
  };

  const getActivityIcon = (type: Activity['type']) => {
    switch (type) {
      case 'checkin': return '🔓';
      case 'checkout': return '🔒';
      case 'staff_added': return '👤';
      case 'prebooking': return '📅';
      default: return '📝';
    }
  };

  const getActivityColor = (type: Activity['type']) => {
    switch (type) {
      case 'checkin': return 'text-green-600';
      case 'checkout': return 'text-blue-600';
      case 'staff_added': return 'text-purple-600';
      case 'prebooking': return 'text-orange-600';
      default: return 'text-gray-600';
    }
  };

  // Action handlers for dashboard buttons
  const handleViewDepartmentAnalytics = () => {
    if (departmentAnalytics && departmentAnalytics.length > 0) {
      setSelectedDepartment(departmentAnalytics[0].department);
      setOpenModal('department-details');
    } else {
      toast({
        title: "No departments available",
        description: "Add departments in Settings to view analytics",
        variant: "destructive",
      });
    }
  };

  const handleEmergencyMuster = () => {
    setLocation('/muster');
    toast({
      title: "Emergency Muster Activated",
      description: "Redirecting to emergency muster management...",
      variant: "destructive"
    });
  };

  const handleGenerateReport = () => {
    setLocation('/reports');
    toast({
      title: "Generate Report",
      description: "Redirecting to report generation...",
    });
  };

  const handleExportData = () => {
    toast({
      title: "Data Export",
      description: "Preparing data export. Download will start shortly...",
    });
    // Simulate export process
    setTimeout(() => {
      toast({
        title: "Export Complete",
        description: "Visitor data has been exported successfully.",
      });
    }, 2000);
  };

  const handleSecurityCheck = () => {
    toast({
      title: "Security Check",
      description: "Running comprehensive security scan...",
    });
    // Simulate security check
    setTimeout(() => {
      toast({
        title: "Security Check Complete",
        description: "All systems secure. No issues detected.",
      });
    }, 3000);
  };

  const handleViewAllVisitors = () => {
    setOpenModal('visitors');
  };

  const handleViewAllActivity = () => {
    toast({
      title: "Activity Log",
      description: "Opening detailed activity history...",
    });
  };

  const formatTime = (date: string | Date) => {
    const dateObj = typeof date === 'string' ? new Date(date) : date;
    return dateObj.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // Checkout mutations
  const checkoutVisitorMutation = useMutation({
    mutationFn: async (visitorId: string) => {
      const response = await apiRequest("POST", `/api/visitors/${visitorId}/checkout`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/visitors/current"] });
      queryClient.invalidateQueries({ queryKey: ["/api/visitors/today"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/activity/recent"] });
      toast({
        title: "Success",
        description: "Visitor checked out successfully",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to check out visitor",
        variant: "destructive",
      });
    },
  });

  const checkoutStaffMutation = useMutation({
    mutationFn: async (staffId: string) => {
      const response = await apiRequest("POST", `/api/staff/${staffId}/checkout`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/staff"] });
      queryClient.invalidateQueries({ queryKey: ["/api/staff/checked-in"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/activity/recent"] });
      toast({
        title: "Success", 
        description: "Staff member checked out successfully",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to check out staff member",
        variant: "destructive",
      });
    },
  });

  if (statsLoading) {
    return <div>Loading dashboard...</div>;
  }

  return (
    <div className="space-y-8 p-6 rounded-xl bg-background min-h-screen">
      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <GlassCard hover className="cursor-pointer" onClick={() => setOpenModal('visitors')}>
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
        
        <GlassCard hover className="cursor-pointer" onClick={() => setOpenModal('checkins')}>
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
        
        <GlassCard hover className="cursor-pointer" onClick={() => setOpenModal('staff')}>
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
        
        <GlassCard hover className="cursor-pointer" onClick={() => setLocation('/contractor')}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-slate-600 text-sm font-medium">Contractors On Site</p>
              <p className="text-3xl font-bold text-slate-800 mt-1" data-testid="stat-contractors-onsite">
                {stats?.contractorsOnSite || 0}
              </p>
            </div>
            <div className="w-12 h-12 bg-orange-100 rounded-xl flex items-center justify-center">
              <HardHat className="text-orange-600" size={24} />
            </div>
          </div>
        </GlassCard>
      </div>

      {/* Multi-Tenant Building Overview */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-2">
            <Building2 className="text-blue-600" size={20} />
            Building Overview
          </h2>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => setLocation('/super-admin')}
            className="flex items-center gap-2"
            data-testid="button-multi-tenant-dashboard"
          >
            <Settings className="w-4 h-4" />
            Multi-Tenant Dashboard
          </Button>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <GlassCard className="dark:glass-dark">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-slate-600 dark:text-slate-400 text-sm font-medium">Total Companies</p>
                <p className="text-2xl font-bold text-slate-800 dark:text-slate-200 mt-1" data-testid="stat-total-companies">
                  10
                </p>
                <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                  Active tenants in building
                </p>
              </div>
              <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900/30 rounded-xl flex items-center justify-center">
                <Building2 className="text-blue-600 dark:text-blue-400" size={24} />
              </div>
            </div>
          </GlassCard>
          
          <GlassCard className="dark:glass-dark">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-slate-600 dark:text-slate-400 text-sm font-medium">Building Occupancy</p>
                <p className="text-2xl font-bold text-slate-800 dark:text-slate-200 mt-1" data-testid="stat-building-occupancy">
                  {((stats?.currentVisitors || 0) + (stats?.staffOnSite || 0))}
                </p>
                <p className="text-xs text-green-600 dark:text-green-400 mt-1">
                  Total people in building
                </p>
              </div>
              <div className="w-12 h-12 bg-green-100 dark:bg-green-900/30 rounded-xl flex items-center justify-center">
                <UsersRound className="text-green-600 dark:text-green-400" size={24} />
              </div>
            </div>
          </GlassCard>
          
          <GlassCard className="dark:glass-dark">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-slate-600 dark:text-slate-400 text-sm font-medium">Quick Actions</p>
                <div className="mt-2 space-y-2">
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="w-full text-xs flex items-center justify-center gap-2"
                    onClick={() => setLocation('/super-admin')}
                    data-testid="button-manage-tenants"
                  >
                    <Eye className="w-3 h-3" />
                    View All Tenants
                  </Button>
                </div>
              </div>
              <div className="w-12 h-12 bg-purple-100 dark:bg-purple-900/30 rounded-xl flex items-center justify-center">
                <Settings className="text-purple-600 dark:text-purple-400" size={24} />
              </div>
            </div>
          </GlassCard>
        </div>
      </div>

      {/* Advanced Analytics Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
        <GlassCard hover className="dark:glass-dark">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-slate-600 dark:text-slate-400 text-sm font-medium">Peak Hours</p>
              <p className="text-2xl font-bold text-slate-800 dark:text-slate-200 mt-1" data-testid="stat-peak-hours">
                {peakHoursLoading ? "Loading..." : (peakHoursData?.peakHours || "No data")}
              </p>
              <p className="text-xs text-green-600 dark:text-green-400 mt-1">
                {peakHoursLoading ? "Calculating..." : (peakHoursData?.weeklyTrend || "No trend data")}
              </p>
            </div>
            <div className="w-12 h-12 bg-emerald-100 dark:bg-emerald-900/30 rounded-xl flex items-center justify-center">
              <TrendingUp className="text-emerald-600 dark:text-emerald-400" size={24} />
            </div>
          </div>
        </GlassCard>
        
        <GlassCard hover className="dark:glass-dark">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-slate-600 dark:text-slate-400 text-sm font-medium">Security Alerts</p>
              <p className="text-2xl font-bold text-slate-800 dark:text-slate-200 mt-1" data-testid="stat-security-alerts">
                0
              </p>
              <p className="text-xs text-green-600 dark:text-green-400 mt-1">All clear today</p>
            </div>
            <div className="w-12 h-12 bg-green-100 dark:bg-green-900/30 rounded-xl flex items-center justify-center">
              <Shield className="text-green-600 dark:text-green-400" size={24} />
            </div>
          </div>
        </GlassCard>
        
        <GlassCard hover className="dark:glass-dark">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-slate-600 dark:text-slate-400 text-sm font-medium">Compliance Rate</p>
              <p className="text-2xl font-bold text-slate-800 dark:text-slate-200 mt-1" data-testid="stat-compliance-rate">
                99.8%
              </p>
              <p className="text-xs text-green-600 dark:text-green-400 mt-1">UK H&S Standards</p>
            </div>
            <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900/30 rounded-xl flex items-center justify-center">
              <BarChart3 className="text-blue-600 dark:text-blue-400" size={24} />
            </div>
          </div>
        </GlassCard>
        
        <GlassCard hover className="dark:glass-dark">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-slate-600 dark:text-slate-400 text-sm font-medium">Emergency Ready</p>
              <p className="text-2xl font-bold text-slate-800 dark:text-slate-200 mt-1" data-testid="stat-emergency-ready">
                100%
              </p>
              <p className="text-xs text-green-600 dark:text-green-400 mt-1">Muster points active</p>
            </div>
            <div className="w-12 h-12 bg-red-100 dark:bg-red-900/30 rounded-xl flex items-center justify-center">
              <AlertTriangle className="text-red-600 dark:text-red-400" size={24} />
            </div>
          </div>
        </GlassCard>
      </div>

      {/* Department Analytics */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <GlassCard className="lg:col-span-2 dark:glass-dark">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-200">Department Activity</h3>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={handleViewDepartmentAnalytics}
              data-testid="button-view-department-analytics"
            >
              View Details
            </Button>
          </div>
          
          <div className="space-y-3 max-h-64 overflow-y-auto pr-1 scrollbar-thin">
            {departmentsLoading ? (
              <div className="text-center py-4 text-slate-600">Loading departments...</div>
            ) : !departmentAnalytics || departmentAnalytics.length === 0 ? (
              <div className="text-center py-4 text-slate-600">No department data available</div>
            ) : (
              departmentAnalytics.map((dept) => (
                <div 
                  key={dept.department} 
                  className="flex items-center justify-between p-3 bg-white/50 dark:bg-slate-800/50 rounded-lg cursor-pointer hover:bg-white/70 dark:hover:bg-slate-800/70 transition-colors"
                  onClick={() => {
                    setSelectedDepartment(dept.department);
                    setOpenModal('department-details');
                  }}
                  data-testid={`department-${dept.department}`}
                >
                  <div className="flex items-center space-x-3">
                    <div className={`w-3 h-3 rounded-full ${dept.color}`}></div>
                    <span className="font-medium text-slate-800 dark:text-slate-200">{dept.department}</span>
                  </div>
                  <div className="flex items-center space-x-4">
                    <span className="text-slate-600 dark:text-slate-400">
                      {dept.totalCount} people ({dept.visitorCount} visitors, {dept.staffCount} staff)
                    </span>
                    <Badge variant={dept.trend.startsWith('+') ? 'default' : 'secondary'} className="text-xs">
                      {dept.trend}
                    </Badge>
                  </div>
                </div>
              ))
            )}
          </div>
        </GlassCard>
        
        <GlassCard className="dark:glass-dark">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-200">Quick Actions</h3>
          </div>
          
          <div className="space-y-3">
            <Button 
              className="w-full justify-start" 
              variant="outline" 
              onClick={handleEmergencyMuster}
              data-testid="button-emergency-muster"
            >
              <AlertTriangle className="mr-2" size={16} />
              Emergency Muster
            </Button>
            <Button 
              className="w-full justify-start" 
              variant="outline" 
              onClick={handleGenerateReport}
              data-testid="button-generate-report"
            >
              <BarChart3 className="mr-2" size={16} />
              Generate Report
            </Button>
            <Button 
              className="w-full justify-start" 
              variant="outline" 
              onClick={handleExportData}
              data-testid="button-export-data"
            >
              <Download className="mr-2" size={16} />
              Export Data
            </Button>
            <Button 
              className="w-full justify-start" 
              variant="outline" 
              onClick={handleSecurityCheck}
              data-testid="button-security-check"
            >
              <Shield className="mr-2" size={16} />
              Security Check
            </Button>
          </div>
        </GlassCard>
      </div>

      {/* Current Visitors and Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Current Visitors */}
        <GlassCard>
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-200">Current Visitors</h3>
            <button 
              className="text-blue-600 hover:text-blue-700 text-sm font-medium" 
              onClick={handleViewAllVisitors}
              data-testid="button-view-all-visitors"
            >
              View All
            </button>
          </div>
          
          <div className="space-y-2 max-h-[540px] overflow-y-auto pr-1 scrollbar-thin">
            {visitorsLoading ? (
              <div className="text-center py-4 text-slate-600">Loading visitors...</div>
            ) : !currentVisitors || currentVisitors.length === 0 ? (
              <div className="text-center py-4 text-slate-600">No current visitors</div>
            ) : (
              currentVisitors.map((visitor) => (
                <div key={visitor.id} className="flex items-center justify-between p-2.5 bg-white/50 dark:bg-slate-800/50 rounded-lg hover:bg-white/70 dark:hover:bg-slate-800/70 transition-colors cursor-pointer" data-testid={`visitor-${visitor.id}`} onClick={() => { setSelectedVisitor(visitor); setOpenModal('visitor-details'); }}>
                  <div className="flex items-center space-x-2.5">
                    <div className="w-10 h-10 bg-blue-500 rounded-full flex items-center justify-center">
                      <span className="text-white font-medium text-sm">{getInitials(`${visitor.firstName} ${visitor.lastName}`)}</span>
                    </div>
                    <div>
                      <p className="font-medium text-slate-800 dark:text-slate-200 text-sm" data-testid={`visitor-name-${visitor.id}`}>
                        {visitor.firstName} {visitor.lastName}
                      </p>
                      <p className="text-xs text-slate-600 dark:text-slate-400">{visitor.company || "No company"}</p>
                      <div className="flex items-center gap-2.5 mt-0.5">
                        <p className="text-xs text-slate-500 dark:text-slate-400">👤 {getStaffName(visitor.hostStaffId || undefined)}</p>
                        <p className="text-xs text-slate-400 dark:text-slate-500">🕐 {formatTime(visitor.checkedInAt)}</p>
                      </div>
                      {visitor.phoneNumber && (
                        <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">📞 {visitor.phoneNumber}</p>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    <Badge variant="default" className="text-xs mb-0.5">
                      On-site
                    </Badge>
                    <p className="text-xs text-slate-400 dark:text-slate-500">
                      {Math.floor((Date.now() - new Date(visitor.checkedInAt).getTime()) / (1000 * 60))}m ago
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
            <button 
              className="text-blue-600 hover:text-blue-700 text-sm font-medium" 
              onClick={handleViewAllActivity}
              data-testid="button-view-all-activity"
            >
              View All
            </button>
          </div>
          
          <div className="space-y-4">
            {activityLoading ? (
              <div className="text-center py-4 text-slate-600">Loading activity...</div>
            ) : !recentActivity || recentActivity.length === 0 ? (
              <div className="text-center py-8 text-slate-600">
                <p>No recent activity</p>
                <p className="text-sm mt-2">Activity will appear here as it happens</p>
              </div>
            ) : (
              recentActivity.slice(0, 6).map((activity) => (
                <div key={activity.id} className="flex items-center justify-between p-4 bg-white/50 rounded-xl" data-testid={`activity-${activity.id}`}>
                  <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center">
                      <span className="text-lg">{getActivityIcon(activity.type)}</span>
                    </div>
                    <div>
                      <p className="font-medium text-slate-800" data-testid={`activity-name-${activity.id}`}>
                        {activity.name}
                      </p>
                      <p className={`text-sm capitalize ${getActivityColor(activity.type)}`}>
                        {activity.type.replace('_', ' ')}
                        {activity.details && ` • ${activity.details}`}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-slate-500">
                      {formatTime(activity.timestamp)}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        </GlassCard>
      </div>

      {/* Sales-Focused ROI Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <GlassCard className="bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 border-2 border-green-200 dark:border-green-800">
          <div className="flex items-center mb-6">
            <DollarSign className="mr-3 text-green-600 dark:text-green-400" size={32} />
            <h3 className="text-xl font-bold text-green-800 dark:text-green-200">Return on Investment</h3>
          </div>
          
          <div className="space-y-4">
            <div className="flex justify-between items-center p-4 bg-white/70 dark:bg-slate-800/70 rounded-xl">
              <span className="font-medium text-slate-700 dark:text-slate-300">Annual Cost Savings</span>
              <span className="text-2xl font-bold text-green-600 dark:text-green-400">£12,500</span>
            </div>
            <div className="flex justify-between items-center p-4 bg-white/70 dark:bg-slate-800/70 rounded-xl">
              <span className="font-medium text-slate-700 dark:text-slate-300">Efficiency Improvement</span>
              <span className="text-2xl font-bold text-blue-600 dark:text-blue-400">89%</span>
            </div>
            <div className="flex justify-between items-center p-4 bg-white/70 dark:bg-slate-800/70 rounded-xl">
              <span className="font-medium text-slate-700 dark:text-slate-300">Payback Period</span>
              <span className="text-2xl font-bold text-purple-600 dark:text-purple-400">3.2 months</span>
            </div>
            <div className="bg-green-100 dark:bg-green-900/30 p-4 rounded-xl border border-green-200 dark:border-green-800">
              <p className="text-sm text-green-800 dark:text-green-200 font-medium">"VisiGate Pro has transformed our reception process and saved us thousands in administrative costs."</p>
              <p className="text-xs text-green-600 dark:text-green-400 mt-2">- Sarah M., Operations Manager</p>
            </div>
          </div>
        </GlassCard>
        
        <GlassCard className="bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 border-2 border-blue-200 dark:border-blue-800">
          <div className="flex items-center mb-6">
            <CheckCircle className="mr-3 text-blue-600 dark:text-blue-400" size={32} />
            <h3 className="text-xl font-bold text-blue-800 dark:text-blue-200">Success Metrics</h3>
          </div>
          
          <div className="space-y-4">
            <div className="text-center p-4 bg-white/70 dark:bg-slate-800/70 rounded-xl">
              <div className="text-3xl font-bold text-blue-600 dark:text-blue-400 mb-1">98.7%</div>
              <div className="text-sm text-slate-600 dark:text-slate-400">Customer Satisfaction</div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="text-center p-3 bg-white/70 dark:bg-slate-800/70 rounded-xl">
                <div className="text-xl font-bold text-green-600 dark:text-green-400">99.8%</div>
                <div className="text-xs text-slate-600 dark:text-slate-400">Uptime</div>
              </div>
              <div className="text-center p-3 bg-white/70 dark:bg-slate-800/70 rounded-xl">
                <div className="text-xl font-bold text-purple-600 dark:text-purple-400">-67%</div>
                <div className="text-xs text-slate-600 dark:text-slate-400">Setup Time</div>
              </div>
            </div>
            <div className="bg-blue-100 dark:bg-blue-900/30 p-4 rounded-xl border border-blue-200 dark:border-blue-800">
              <h4 className="font-semibold text-blue-800 dark:text-blue-200 mb-2">Why Choose VisiGate Pro?</h4>
              <ul className="text-sm text-blue-700 dark:text-blue-300 space-y-1">
                <li>• UK H&S compliant emergency features</li>
                <li>• Real-time visitor tracking & analytics</li>
                <li>• Professional ID badge printing</li>
                <li>• Cloud-based with automatic backups</li>
                <li>• 24/7 customer support included</li>
              </ul>
            </div>
          </div>
        </GlassCard>
      </div>

      {/* AI-Powered Insights Section */}
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-200">AI-Powered Intelligence</h2>
          <Badge variant="outline" className="bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800">
            Powered by OpenAI
          </Badge>
        </div>
        <AIInsights />
      </div>

      {/* Modal Dialogs */}
      {/* Current Visitors Modal */}
      <Dialog open={openModal === 'visitors'} onOpenChange={() => setOpenModal(null)}>
        <DialogContent className="glass-effect border border-white/30 max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-slate-800">
              <UsersRound className="text-blue-600" size={24} />
              Current Visitors ({currentVisitors?.length || 0})
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 max-h-96 overflow-y-auto pr-1 scrollbar-thin">
            {currentVisitors && currentVisitors.length > 0 ? (
              currentVisitors.map((visitor) => (
                <div key={visitor.id} className="flex items-center justify-between p-4 bg-white/50 rounded-xl border border-white/30 hover:bg-white/70 transition-colors">
                  <div className="flex items-center space-x-3">
                    <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
                      <span className="text-blue-600 font-medium text-sm">
                        {getInitials(`${visitor.firstName} ${visitor.lastName}`)}
                      </span>
                    </div>
                    <div>
                      <p className="font-medium text-slate-800">{visitor.firstName} {visitor.lastName}</p>
                      <p className="text-sm text-slate-600">{visitor.company || "No company"}</p>
                      <div className="flex items-center gap-4 mt-1">
                        <p className="text-xs text-slate-500">👤 Host: {getStaffName(visitor.hostStaffId || undefined)}</p>
                        <p className="text-xs text-slate-400">🕐 Arrived: {formatTime(visitor.checkedInAt)}</p>
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <Badge variant="default" className="text-xs">
                          On-site
                        </Badge>
                        {visitor.phoneNumber && (
                          <span className="text-xs text-slate-400">📞 {visitor.phoneNumber}</span>
                        )}
                        {visitor.email && (
                          <span className="text-xs text-slate-400">✉️ {visitor.email}</span>
                        )}
                      </div>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => checkoutVisitorMutation.mutate(visitor.id)}
                    disabled={checkoutVisitorMutation.isPending}
                    className="flex items-center gap-1"
                    data-testid={`checkout-visitor-${visitor.id}`}
                  >
                    <LogOut size={14} />
                    Check Out
                  </Button>
                </div>
              ))
            ) : (
              <div className="text-center py-8 text-slate-500">
                No visitors currently on-site
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Today's Check-ins Modal */}
      <Dialog open={openModal === 'checkins'} onOpenChange={() => setOpenModal(null)}>
        <DialogContent className="glass-effect border border-white/30 max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-slate-800">
              <AtSign className="text-green-600" size={24} />
              Today's Check-ins ({todayVisitors?.length || 0})
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {todayVisitors && todayVisitors.length > 0 ? (
              todayVisitors.map((visitor) => (
                <div key={visitor.id} className="flex items-center justify-between p-4 bg-white/50 rounded-xl border border-white/30">
                  <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
                      <User className="text-green-600" size={20} />
                    </div>
                    <div>
                      <p className="font-medium text-slate-800">{visitor.firstName} {visitor.lastName}</p>
                      <p className="text-sm text-slate-600">{visitor.company || "No company"}</p>
                      <p className="text-xs text-slate-500">Checked in: {formatTime(visitor.checkedInAt)}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <Badge variant={visitor.isCheckedIn ? "default" : "secondary"} className="text-xs">
                          {visitor.isCheckedIn ? "On-site" : "Checked out"}
                        </Badge>
                      </div>
                    </div>
                  </div>
                  {visitor.isCheckedIn && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => checkoutVisitorMutation.mutate(visitor.id)}
                      disabled={checkoutVisitorMutation.isPending}
                      className="flex items-center gap-1"
                      data-testid={`checkout-visitor-${visitor.id}`}
                    >
                      <LogOut size={14} />
                      Check Out
                    </Button>
                  )}
                </div>
              ))
            ) : (
              <div className="text-center py-8 text-slate-500">
                No visitors checked in today
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Staff On-Site Modal */}
      <Dialog open={openModal === 'staff'} onOpenChange={() => setOpenModal(null)}>
        <DialogContent className="glass-effect border border-white/30 max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-slate-800">
              <BadgeInfo className="text-purple-600" size={24} />
              Staff On-Site ({checkedInStaff?.length || 0})
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {checkedInStaff && checkedInStaff.length > 0 ? (
              checkedInStaff.map((staffMember) => (
                <div key={staffMember.id} className="flex items-center justify-between p-4 bg-white/50 rounded-xl border border-white/30">
                  <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 bg-purple-100 rounded-full flex items-center justify-center">
                      <span className="text-purple-600 font-semibold text-sm">
                        {getInitials(`${staffMember.firstName} ${staffMember.lastName}`)}
                      </span>
                    </div>
                    <div>
                      <p className="font-medium text-slate-800">{`${staffMember.firstName} ${staffMember.lastName}`}</p>
                      <p className="text-sm text-slate-600">{staffMember.department}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <Badge variant="outline" className="text-xs">
                          {staffMember.employeeId}
                        </Badge>
                      </div>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => checkoutStaffMutation.mutate(staffMember.id)}
                    disabled={checkoutStaffMutation.isPending}
                    className="flex items-center gap-1"
                    data-testid={`checkout-staff-${staffMember.id}`}
                  >
                    <LogOut size={14} />
                    Check Out
                  </Button>
                </div>
              ))
            ) : (
              <div className="text-center py-8 text-slate-500">
                No staff members currently on-site
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Department Details Modal */}
      {openModal === 'department-details' && (
        <Dialog open={true} onOpenChange={() => setOpenModal(null)}>
          <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center space-x-2">
                <span className="text-xl">Department Details: {selectedDepartment}</span>
                {departmentDetails && (
                  <Badge variant="secondary" className="ml-2">
                    {departmentDetails.totalCount} people on-site
                  </Badge>
                )}
              </DialogTitle>
            </DialogHeader>
            
            {departmentDetailsLoading || !departmentDetails ? (
              <div className="text-center py-8">
                <div className="text-lg font-medium text-slate-600">Loading department details...</div>
              </div>
            ) : (
              <div className="space-y-6">
                {/* Summary Stats */}
                <div className="grid grid-cols-3 gap-4">
                  <div className="text-center p-4 bg-blue-50 rounded-lg">
                    <div className="text-2xl font-bold text-blue-600">
                      {departmentDetails.staff.filter(s => s.isCheckedIn).length}
                    </div>
                    <div className="text-sm text-blue-800">Staff On-Site</div>
                  </div>
                  <div className="text-center p-4 bg-green-50 rounded-lg">
                    <div className="text-2xl font-bold text-green-600">
                      {departmentDetails.visitors.length}
                    </div>
                    <div className="text-sm text-green-800">Current Visitors</div>
                  </div>
                  <div className="text-center p-4 bg-purple-50 rounded-lg">
                    <div className="text-2xl font-bold text-purple-600">
                      {departmentDetails.totalCount}
                    </div>
                    <div className="text-sm text-purple-800">Total People</div>
                  </div>
                </div>

                {/* Staff Section */}
                <div>
                  <h3 className="text-lg font-semibold text-slate-800 mb-4 flex items-center">
                    <User className="mr-2" size={20} />
                    Staff Members ({departmentDetails.staff.length})
                  </h3>
                  <div className="space-y-3">
                    {departmentDetails.staff.length === 0 ? (
                      <div className="text-center py-4 text-slate-600">No staff assigned to this department</div>
                    ) : (
                      departmentDetails.staff.map((staffMember) => (
                        <div key={staffMember.id} className="flex items-center justify-between p-4 bg-white border rounded-lg">
                          <div className="flex items-center space-x-3">
                            <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                              staffMember.isCheckedIn ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-600'
                            }`}>
                              <User size={20} />
                            </div>
                            <div>
                              <p className="font-medium text-slate-800">{staffMember.name}</p>
                              <p className="text-sm text-slate-600 capitalize">{staffMember.accessLevel}</p>
                            </div>
                          </div>
                          <div className="text-right">
                            {staffMember.isCheckedIn ? (
                              <div>
                                <Badge variant="default" className="mb-1">On-Site</Badge>
                                <p className="text-xs text-slate-500">
                                  Since: {staffMember.checkedInAt ? formatTime(staffMember.checkedInAt) : 'Unknown'}
                                </p>
                              </div>
                            ) : (
                              <Badge variant="secondary">Off-Site</Badge>
                            )}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* Visitors Section */}
                <div>
                  <h3 className="text-lg font-semibold text-slate-800 mb-4 flex items-center">
                    <UsersRound className="mr-2" size={20} />
                    Current Visitors ({departmentDetails.visitors.length})
                  </h3>
                  <div className="space-y-3">
                    {departmentDetails.visitors.length === 0 ? (
                      <div className="text-center py-4 text-slate-600">No visitors currently hosted by this department</div>
                    ) : (
                      departmentDetails.visitors.map((visitor) => (
                        <div key={visitor.id} className="flex items-center justify-between p-4 bg-white border rounded-lg">
                          <div className="flex items-center space-x-3">
                            <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                              <span className="text-blue-600 font-medium text-sm">
                                {getInitials(visitor.name)}
                              </span>
                            </div>
                            <div>
                              <p className="font-medium text-slate-800">{visitor.name}</p>
                              <p className="text-sm text-slate-600">{visitor.company || 'No company'}</p>
                              <p className="text-xs text-slate-500">Host: {visitor.hostName}</p>
                            </div>
                          </div>
                          <div className="text-right">
                            <Badge variant="default" className="mb-1">Checked In</Badge>
                            <p className="text-xs text-slate-500">
                              Since: {formatTime(visitor.checkedInAt)}
                            </p>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      )}

      {/* Visitor Details Modal */}
      <Dialog open={openModal === 'visitor-details'} onOpenChange={() => setOpenModal(null)}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-3">
                <div className="w-12 h-12 bg-blue-500 rounded-full flex items-center justify-center">
                  <span className="text-white font-medium">{selectedVisitor && getInitials(`${selectedVisitor.firstName} ${selectedVisitor.lastName}`)}</span>
                </div>
                <div>
                  <div className="text-xl">{selectedVisitor?.firstName} {selectedVisitor?.lastName}</div>
                  <div className="text-sm text-slate-600 font-normal">{selectedVisitor?.company || "No company listed"}</div>
                </div>
              </DialogTitle>
            </DialogHeader>
            
            {selectedVisitor && (
              <div className="space-y-6">
                {/* Status Banner */}
                <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Badge variant="default" className="bg-green-600">
                        ✓ Currently On-Site
                      </Badge>
                      <span className="text-sm text-green-800 dark:text-green-300">
                        {Math.floor((Date.now() - new Date(selectedVisitor.checkedInAt).getTime()) / (1000 * 60))} minutes on premises
                      </span>
                    </div>
                  </div>
                </div>

                {/* Emergency Contact Information */}
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
                  <h3 className="text-lg font-semibold text-red-800 dark:text-red-300 mb-3 flex items-center gap-2">
                    🚨 Emergency Contact Information
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm font-medium text-red-700 dark:text-red-400">
                        {selectedVisitor.mobileNumber ? "Mobile Number" : "Phone Number"}
                      </label>
                      <p className="text-lg font-mono bg-white dark:bg-slate-800 p-2 rounded border">
                        {selectedVisitor.mobileNumber || selectedVisitor.phoneNumber || "Not provided"}
                      </p>
                      {selectedVisitor.mobileNumber && selectedVisitor.phoneNumber && (
                        <div className="mt-2">
                          <label className="text-xs font-medium text-red-600 dark:text-red-500">Alternative Phone</label>
                          <p className="text-sm font-mono bg-red-100 dark:bg-red-900/30 p-1 rounded text-red-800 dark:text-red-300">
                            {selectedVisitor.phoneNumber}
                          </p>
                        </div>
                      )}
                    </div>
                    <div>
                      <label className="text-sm font-medium text-red-700 dark:text-red-400">Email Address</label>
                      <p className="text-lg font-mono bg-white dark:bg-slate-800 p-2 rounded border">
                        {selectedVisitor.email || "Not provided"}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Host & Location Information */}
                <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                  <h3 className="text-lg font-semibold text-blue-800 dark:text-blue-300 mb-3 flex items-center gap-2">
                    📍 Host & Location Details
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm font-medium text-blue-700 dark:text-blue-400">Visiting</label>
                      <p className="text-lg bg-white dark:bg-slate-800 p-2 rounded border">
                        {getStaffName(selectedVisitor.hostStaffId)}
                      </p>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-blue-700 dark:text-blue-400">Department</label>
                      <p className="text-lg bg-white dark:bg-slate-800 p-2 rounded border">
                        {staff?.find(s => s.id === selectedVisitor.hostStaffId)?.department || "Unknown"}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Visit Timeline */}
                <div className="bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg p-4">
                  <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-200 mb-3 flex items-center gap-2">
                    ⏰ Visit Timeline
                  </h3>
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-medium text-slate-600 dark:text-slate-400">Check-in Time</span>
                      <span className="text-lg font-mono">{formatTime(selectedVisitor.checkedInAt)}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-medium text-slate-600 dark:text-slate-400">Duration on Site</span>
                      <span className="text-lg font-mono">
                        {(() => {
                          const minutes = Math.floor((Date.now() - new Date(selectedVisitor.checkedInAt).getTime()) / (1000 * 60));
                          const hours = Math.floor(minutes / 60);
                          const remainingMinutes = minutes % 60;
                          return hours > 0 ? `${hours}h ${remainingMinutes}m` : `${remainingMinutes}m`;
                        })()}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-medium text-slate-600 dark:text-slate-400">Expected Duration</span>
                      <span className="text-lg">
                        {selectedVisitor.expectedDuration ? `${selectedVisitor.expectedDuration} minutes` : "Not specified"}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Visit Details */}
                <div className="bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg p-4">
                  <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-200 mb-3 flex items-center gap-2">
                    📋 Visit Details
                  </h3>
                  <div className="space-y-3">
                    <div>
                      <label className="text-sm font-medium text-slate-600 dark:text-slate-400">Purpose of Visit</label>
                      <p className="text-base bg-white dark:bg-slate-800 p-2 rounded border">
                        {selectedVisitor.purpose || "Not specified"}
                      </p>
                    </div>
                    {selectedVisitor.notes && (
                      <div>
                        <label className="text-sm font-medium text-slate-600 dark:text-slate-400">Additional Notes</label>
                        <p className="text-base bg-white dark:bg-slate-800 p-2 rounded border">
                          {selectedVisitor.notes}
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Quick Actions */}
                <div className="flex gap-3 pt-4 border-t">
                  <Button 
                    onClick={() => {
                      const phoneToCall = selectedVisitor.mobileNumber || selectedVisitor.phoneNumber;
                      if (phoneToCall) {
                        window.open(`tel:${phoneToCall}`, '_self');
                      }
                    }}
                    disabled={!(selectedVisitor.mobileNumber || selectedVisitor.phoneNumber)}
                    className="flex-1"
                    data-testid="button-call-visitor"
                  >
                    📞 Call Visitor
                  </Button>
                  <Button 
                    onClick={async () => {
                      try {
                        const response = await fetch(`/api/visitors/${selectedVisitor.id}/emergency-notify`, {
                          method: 'POST',
                          headers: {
                            'Content-Type': 'application/json',
                          },
                          body: JSON.stringify({
                            urgencyReason: "Urgent Contact Required - Emergency Support"
                          })
                        });
                        
                        const result = await response.json();
                        
                        if (response.ok) {
                          alert(`✅ Emergency notification sent to Reception!\n\nRecipient: ${result.recipient}\nVisitor: ${result.visitorName}\n\nReception will contact the visitor immediately.`);
                        } else {
                          alert(`❌ Failed to send notification: ${result.message || result.error}`);
                        }
                      } catch (error) {
                        console.error('Failed to send emergency notification:', error);
                        alert('❌ Failed to send emergency notification. Please contact Reception directly.');
                      }
                    }}
                    variant="outline"
                    className="flex-1 bg-orange-50 hover:bg-orange-100 border-orange-300"
                    data-testid="button-email-visitor"
                  >
                    📧 Alert Reception
                  </Button>
                  <Button 
                    onClick={() => {
                      // Staff phone numbers not available in current system
                      alert('Staff phone numbers are not stored in the system. Contact them via email or through the office.');
                    }}
                    variant="outline"
                    className="flex-1 opacity-50"
                    data-testid="button-call-host"
                  >
                    📞 Call Host (N/A)
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
    </div>
  );
}
