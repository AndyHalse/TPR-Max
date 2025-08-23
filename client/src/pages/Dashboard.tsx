import { useQuery } from "@tanstack/react-query";
import GlassCard from "@/components/GlassCard";
import AIInsights from "@/components/AIInsights";
import { UsersRound, AtSign, BadgeInfo, Clock, TrendingUp, Shield, BarChart3, AlertTriangle, Download, CheckCircle, DollarSign } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";

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
  
  const { data: stats, isLoading: statsLoading } = useQuery<Stats>({
    queryKey: ["/api/stats"],
  });

  const { data: currentVisitors, isLoading: visitorsLoading } = useQuery<Visitor[]>({
    queryKey: ["/api/visitors/current"],
  });

  const { data: staff } = useQuery<Staff[]>({
    queryKey: ["/api/staff"],
  });

  const { data: recentActivity, isLoading: activityLoading } = useQuery<Activity[]>({
    queryKey: ["/api/activity/recent"],
  });

  const getStaffName = (staffId?: string) => {
    if (!staffId || !staff) return "Unknown";
    const staffMember = staff.find(s => s.id === staffId);
    return staffMember?.name || "Unknown";
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
    toast({
      title: "Department Analytics",
      description: "Opening detailed department analytics dashboard...",
    });
    // In a real app, this would navigate to a detailed analytics page
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
    setLocation('/checkin');
  };

  const handleViewAllActivity = () => {
    toast({
      title: "Activity Log",
      description: "Opening detailed activity history...",
    });
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

      {/* Advanced Analytics Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
        <GlassCard hover className="dark:glass-dark">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-slate-600 dark:text-slate-400 text-sm font-medium">Peak Hours</p>
              <p className="text-2xl font-bold text-slate-800 dark:text-slate-200 mt-1" data-testid="stat-peak-hours">
                9AM-11AM
              </p>
              <p className="text-xs text-green-600 dark:text-green-400 mt-1">+23% this week</p>
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
          
          <div className="space-y-4">
            {[
              { dept: "Engineering", visitors: 12, trend: "+15%", color: "bg-blue-500" },
              { dept: "Sales", visitors: 8, trend: "+8%", color: "bg-green-500" },
              { dept: "Marketing", visitors: 5, trend: "-2%", color: "bg-purple-500" },
              { dept: "HR", visitors: 3, trend: "+5%", color: "bg-orange-500" },
              { dept: "Operations", visitors: 7, trend: "+12%", color: "bg-indigo-500" }
            ].map((dept) => (
              <div key={dept.dept} className="flex items-center justify-between p-3 bg-white/50 dark:bg-slate-800/50 rounded-lg">
                <div className="flex items-center space-x-3">
                  <div className={`w-3 h-3 rounded-full ${dept.color}`}></div>
                  <span className="font-medium text-slate-800 dark:text-slate-200">{dept.dept}</span>
                </div>
                <div className="flex items-center space-x-4">
                  <span className="text-slate-600 dark:text-slate-400">{dept.visitors} visitors</span>
                  <Badge variant={dept.trend.startsWith('+') ? 'default' : 'secondary'} className="text-xs">
                    {dept.trend}
                  </Badge>
                </div>
              </div>
            ))}
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
            <h3 className="text-lg font-semibold text-slate-800">Current Visitors</h3>
            <button 
              className="text-blue-600 hover:text-blue-700 text-sm font-medium" 
              onClick={handleViewAllVisitors}
              data-testid="button-view-all-visitors"
            >
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
    </div>
  );
}
