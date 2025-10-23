import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import GlassCard from "@/components/GlassCard";
import { UsersRound, AtSign, BadgeInfo, Clock, TrendingUp, Shield, BarChart3, AlertTriangle, Download, CheckCircle, DollarSign, LogOut, User, HardHat, Building2, Settings, Eye, Calendar, CalendarDays, MapPin, Mail, Phone, Users2, Clock3, AlertCircle, CheckCircle2, UserCheck, ChevronLeft, ChevronRight, Users } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { useState } from "react";
import type { Staff, Visitor, TransformedRoomBooking, MeetingRoom } from "@shared/schema";
import { formatDistanceToNow } from "date-fns";

interface Stats {
  currentVisitors: number;
  todayCheckins: number;
  staffOnSite: number;
  contractorsOnSite: number;
  totalPeopleOnSite: number;
  totalCompanies: number;
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
  const [openModal, setOpenModal] = useState<'visitors' | 'checkins' | 'staff' | 'contractors' | 'total-people' | 'department-details' | 'visitor-details' | 'visitor-booking-details' | 'meeting-booking-details' | null>(null);
  const [selectedDepartment, setSelectedDepartment] = useState<string>('');
  const [selectedVisitor, setSelectedVisitor] = useState<any>(null);
  const [selectedVisitorBooking, setSelectedVisitorBooking] = useState<any>(null);
  const [selectedMeetingBooking, setSelectedMeetingBooking] = useState<any>(null);
  
  // Reception Diary view state
  const [diaryViewMode, setDiaryViewMode] = useState<'today' | 'tomorrow' | 'weekly'>('today');
  const [currentDate, setCurrentDate] = useState(new Date());
  
  // Get current user for authentication check
  const { data: currentUser } = useQuery<{ id: string; username: string; customerId: string }>({
    queryKey: ["/api/auth/me"],
  });
  
  const { data: stats, isLoading: statsLoading } = useQuery<Stats>({
    queryKey: ["/api/stats"],
    enabled: !!currentUser,
  });

  const { data: currentVisitors, isLoading: visitorsLoading } = useQuery<Visitor[]>({
    queryKey: ["/api/visitors/current"],
    enabled: !!currentUser,
  });

  const { data: staff } = useQuery<Staff[]>({
    queryKey: ["/api/staff"],
    enabled: !!currentUser,
  });

  const { data: todayVisitors } = useQuery<Visitor[]>({
    queryKey: ["/api/visitors/today"],
    enabled: !!currentUser,
  });

  const { data: checkedInStaff } = useQuery<Staff[]>({
    queryKey: ["/api/staff/checked-in"],
    enabled: !!currentUser,
  });

  const { data: checkedInContractors } = useQuery<any[]>({
    queryKey: ["/api/contractors/checked-in"],
    enabled: !!currentUser,
  });

  const { data: recentActivity, isLoading: activityLoading } = useQuery<Activity[]>({
    queryKey: ["/api/activity/recent"],
    enabled: !!currentUser,
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
    refetchInterval: 60000, // Refresh every 60 seconds to reduce server load
    enabled: !!currentUser,
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
    enabled: !!currentUser,
  });

  // Company settings for feature toggles
  const { data: settings } = useQuery<{
    featureMultiTenant?: boolean;
    featureMeetingRooms?: boolean;
    featureTimeAttendance?: boolean;
    featureInductionSettings?: boolean;
    featureKiosk?: boolean;
    featureAiDemo?: boolean;
  }>({
    queryKey: ["/api/settings"],
    enabled: !!currentUser,
  });

  // Meeting room booking data for today
  const { data: todayRoomBookings, isLoading: roomBookingsLoading } = useQuery<TransformedRoomBooking[]>({
    queryKey: ["/api/room-bookings/today"],
    refetchInterval: 30000, // Refresh every 30 seconds
    enabled: !!currentUser,
  });

  // Get room bookings based on view mode - for now using today's data for all modes
  // TODO: Add separate API endpoints for tomorrow and weekly room bookings
  const getCurrentViewRoomBookings = () => {
    if (!todayRoomBookings) return [];
    
    // For now, showing today's bookings for all views
    // In the future, this should filter based on diaryViewMode and currentDate
    return todayRoomBookings;
  };

  const currentViewRoomBookings = getCurrentViewRoomBookings();

  const { data: meetingRooms } = useQuery<MeetingRoom[]>({
    queryKey: ["/api/meeting-rooms"],
    enabled: !!currentUser,
  });

  const { data: departmentDetails, isLoading: departmentDetailsLoading } = useQuery<{
    department: string;
    staffMembers: Array<{
      id: string;
      firstName: string;
      lastName: string;
      isCheckedIn: boolean;
      accessLevel: string;
      checkedInAt: string;
      checkedOutAt: string | null;
    }>;
    visitors: Array<{
      id: string;
      firstName: string;
      lastName: string;
      company: string | null;
      checkedInAt: string;
      isCheckedIn: boolean;
      hostName: string;
    }>;
    statistics: {
      totalStaff: number;
      checkedInStaff: number;
      visitors: number;
      weeklyTrend: number;
    };
  }>({
    queryKey: ["/api/analytics/departments", selectedDepartment],
    enabled: !!currentUser && !!selectedDepartment && openModal === 'department-details',
  });

  // Reception Diary Data
  const { data: receptionDiary, isLoading: diaryLoading } = useQuery<Array<{
    id: string;
    visitorFirstName: string;
    visitorLastName: string;
    visitorEmail: string;
    company: string;
    visitDate: Date;
    purpose: string;
    isCheckedIn: boolean;
    createdAt: Date;
    hostStaffId: string | null;
    hostFirstName: string | null;
    hostLastName: string | null;
    hostDepartment: string | null;
    hostEmail: string | null;
    tenantCompanyName: string | null;
    tenantSlug: string | null;
    tenantPrimaryColor: string | null;
  }>>({
    queryKey: ["/api/reception/diary"],
    refetchInterval: 30000, // Refresh every 30 seconds
    enabled: !!currentUser,
  });

  const getStaffName = (staffId?: string) => {
    if (!staffId || !staff) return "Unknown";
    const staffMember = staff.find(s => s.id === staffId);
    return staffMember ? `${staffMember.firstName} ${staffMember.lastName}` : "Unknown";
  };

  // Reception Diary utility functions
  const formatDate = (date: Date) => {
    return new Date(date).toLocaleDateString('en-GB', {
      weekday: 'short',
      month: 'short', 
      day: 'numeric'
    });
  };

  const formatVisitTime = (date: Date) => {
    return new Date(date).toLocaleTimeString('en-GB', {
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // Helper function to get the correct visit time from entry data
  const getVisitDisplayTime = (entry: any) => {
    // If visitTime is provided as a string (e.g., "11:30"), use it directly
    if (entry.visitTime && typeof entry.visitTime === 'string') {
      return entry.visitTime;
    }
    
    // Otherwise, extract time from visitDate
    if (entry.visitDate) {
      return formatVisitTime(new Date(entry.visitDate));
    }
    
    // Fallback
    return 'Not set';
  };

  const isToday = (date: Date) => {
    const today = new Date();
    return date.toDateString() === today.toDateString();
  };

  const isTomorrow = (date: Date) => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return date.toDateString() === tomorrow.toDateString();
  };

  const getDayStatus = (date: Date) => {
    if (isToday(date)) return { label: 'Today', color: 'bg-blue-100 text-blue-800' };
    if (isTomorrow(date)) return { label: 'Tomorrow', color: 'bg-green-100 text-green-800' };
    return { label: formatDate(date), color: 'bg-slate-100 text-slate-600' };
  };

  const getPriorityLevel = (entry: any) => {
    const visitDate = new Date(entry.visitDate);
    const now = new Date();
    const hoursUntilVisit = (visitDate.getTime() - now.getTime()) / (1000 * 60 * 60);
    
    if (hoursUntilVisit < 2) return { level: 'urgent', color: 'bg-red-100 text-red-800 border-red-200' };
    if (hoursUntilVisit < 24) return { level: 'high', color: 'bg-orange-100 text-orange-800 border-orange-200' };
    if (hoursUntilVisit < 72) return { level: 'medium', color: 'bg-yellow-100 text-yellow-800 border-yellow-200' };
    return { level: 'normal', color: 'bg-slate-100 text-slate-600 border-slate-200' };
  };

  // Diary navigation helper functions
  const navigateDate = (direction: 'prev' | 'next') => {
    const newDate = new Date(currentDate);
    if (diaryViewMode === 'weekly') {
      newDate.setDate(newDate.getDate() + (direction === 'next' ? 7 : -7));
    } else {
      newDate.setDate(newDate.getDate() + (direction === 'next' ? 1 : -1));
    }
    setCurrentDate(newDate);
  };

  const getDateRange = () => {
    const start = new Date(currentDate);
    const end = new Date(currentDate);
    
    if (diaryViewMode === 'weekly') {
      // Get start of week (Monday)
      const dayOfWeek = start.getDay();
      const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
      start.setDate(start.getDate() - daysToMonday);
      end.setDate(start.getDate() + 6);
    } else if (diaryViewMode === 'today') {
      // Today only
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
    } else {
      // Tomorrow only - add 1 day!
      start.setDate(start.getDate() + 1);
      start.setHours(0, 0, 0, 0);
      end.setDate(end.getDate() + 1);
      end.setHours(23, 59, 59, 999);
    }
    
    return { start, end };
  };

  const getFilteredDiary = () => {
    if (!receptionDiary) return [];
    
    const { start, end } = getDateRange();
    
    return receptionDiary.filter(entry => {
      const visitDate = new Date(entry.visitDate);
      return visitDate >= start && visitDate <= end;
    });
  };

  const getViewTitle = () => {
    const today = new Date();
    const isCurrentWeek = diaryViewMode === 'weekly' && 
      currentDate >= new Date(today.getFullYear(), today.getMonth(), today.getDate() - today.getDay()) &&
      currentDate <= new Date(today.getFullYear(), today.getMonth(), today.getDate() + (6 - today.getDay()));
    
    if (diaryViewMode === 'today') {
      if (currentDate.toDateString() === today.toDateString()) {
        return 'Today';
      } else {
        return currentDate.toLocaleDateString('en-GB', { weekday: 'long', month: 'short', day: 'numeric' });
      }
    } else if (diaryViewMode === 'tomorrow') {
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      if (currentDate.toDateString() === tomorrow.toDateString()) {
        return 'Tomorrow';
      } else {
        return currentDate.toLocaleDateString('en-GB', { weekday: 'long', month: 'short', day: 'numeric' });
      }
    } else {
      if (isCurrentWeek) {
        return 'This Week';
      } else {
        const { start, end } = getDateRange();
        return `${start.toLocaleDateString('en-GB', { month: 'short', day: 'numeric' })} - ${end.toLocaleDateString('en-GB', { month: 'short', day: 'numeric' })}`;
      }
    }
  };

  // Group diary entries by date
  const filteredDiary = getFilteredDiary();
  const groupedDiary = filteredDiary.reduce((groups, entry) => {
    const dateKey = new Date(entry.visitDate).toDateString();
    if (!groups[dateKey]) groups[dateKey] = [];
    groups[dateKey].push(entry);
    return groups;
  }, {} as Record<string, typeof filteredDiary>) || {};

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

  const checkoutContractorMutation = useMutation({
    mutationFn: async (contractorId: string) => {
      const response = await apiRequest("POST", `/api/contractors/workers/${contractorId}/checkout`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/contractors/checked-in"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/activity/recent"] });
      toast({
        title: "Success", 
        description: "Contractor checked out successfully",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to check out contractor",
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
      {/* People On-Site Section */}
      <div className="space-y-4">
        <h2 className="text-xl font-semibold text-fixed flex items-center gap-2">
          <Users className="text-blue-600" size={20} />
          People On-Site
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
        <GlassCard hover className="cursor-pointer" onClick={() => setOpenModal('visitors')}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-variable text-sm font-medium">Current Visitors</p>
              <p className="text-3xl font-bold text-fixed mt-1" data-testid="stat-current-visitors">
                {stats?.currentVisitors || 0}
              </p>
            </div>
            <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center">
              <User className="text-blue-600" size={24} />
            </div>
          </div>
        </GlassCard>
        
        <GlassCard hover className="cursor-pointer" onClick={() => setOpenModal('staff')}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-variable text-sm font-medium">Staff</p>
              <p className="text-3xl font-bold text-fixed mt-1" data-testid="stat-staff-onsite">
                {stats?.staffOnSite || 0}
              </p>
            </div>
            <div className="w-12 h-12 bg-purple-100 rounded-xl flex items-center justify-center">
              <Users className="text-purple-600" size={24} />
            </div>
          </div>
        </GlassCard>
        
        <GlassCard hover className="cursor-pointer" onClick={() => setOpenModal('contractors')}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-variable text-sm font-medium">Contractors</p>
              <p className="text-3xl font-bold text-fixed mt-1" data-testid="stat-contractors-onsite">
                {stats?.contractorsOnSite || 0}
              </p>
            </div>
            <div className="w-12 h-12 bg-orange-100 rounded-xl flex items-center justify-center">
              <HardHat className="text-orange-600" size={24} />
            </div>
          </div>
        </GlassCard>
        
        <GlassCard hover className="cursor-pointer">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-variable text-sm font-medium">Total People</p>
              <p className="text-3xl font-bold text-fixed mt-1" data-testid="stat-total-people-onsite">
                {stats?.totalPeopleOnSite || 0}
              </p>
            </div>
            <div className="w-12 h-12 bg-emerald-100 rounded-xl flex items-center justify-center">
              <Users className="text-emerald-600" size={24} />
            </div>
          </div>
        </GlassCard>
        
        <GlassCard hover className="cursor-pointer" onClick={() => setOpenModal('checkins')}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-variable text-sm font-medium">Today's Check-ins</p>
              <p className="text-3xl font-bold text-fixed mt-1" data-testid="stat-today-checkins">
                {stats?.todayCheckins || 0}
              </p>
            </div>
            <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center">
              <AtSign className="text-green-600" size={24} />
            </div>
          </div>
        </GlassCard>
        </div>
      </div>

      {/* Multi-Tenant Building Overview - Only show if feature is enabled */}
      {settings?.featureMultiTenant !== false && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold text-fixed flex items-center gap-2">
              <Building2 className="text-blue-600" size={20} />
              Building Overview
            </h2>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => setLocation('/multi-tenant')}
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
                  <p className="text-variable text-sm font-medium">Total Companies</p>
                  <p className="text-2xl font-bold text-fixed mt-1" data-testid="stat-total-companies">
                    {stats?.totalCompanies || 0}
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
            
            <GlassCard hover className="cursor-pointer dark:glass-dark" onClick={() => setLocation('/multi-tenant')}>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-variable text-sm font-medium">Today's Activity</p>
                  <p className="text-2xl font-bold text-fixed mt-1" data-testid="stat-tenant-activity">
                    {stats?.todayCheckins || 0}
                  </p>
                  <p className="text-xs text-green-600 dark:text-green-400 mt-1">
                    Today's check-ins
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
                  <p className="text-variable text-sm font-medium">Quick Actions</p>
                  <div className="mt-2 space-y-2">
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="w-full text-xs flex items-center justify-center gap-2"
                      onClick={() => setLocation('/multi-tenant')}
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
      )}


      {/* Reception Diary - Comprehensive Operations Overview */}
      <GlassCard className="bg-gradient-to-br from-indigo-50 to-purple-50 dark:from-indigo-900/20 dark:to-purple-900/20 border-2 border-indigo-200 dark:border-indigo-800">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-0 mb-6">
          <div className="flex items-center">
            <CalendarDays className="mr-2 sm:mr-3 text-indigo-600 dark:text-indigo-400 flex-shrink-0" size={28} />
            <div>
              <h3 className="text-lg sm:text-xl font-bold text-indigo-800 dark:text-indigo-200">Reception Diary</h3>
              <p className="text-xs sm:text-sm text-indigo-600 dark:text-indigo-400 hidden sm:block">Complete operational overview - visitors & meetings</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="outline" className="bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800 text-xs">
              {filteredDiary?.length || 0} Visitors
            </Badge>
            <Badge variant="outline" className="bg-purple-50 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800 text-xs">
              {currentViewRoomBookings?.length || 0} Meetings
            </Badge>
          </div>
        </div>

        {/* View Controls */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between mb-4 gap-3">
          {/* View Mode Buttons */}
          <div className="flex items-center gap-1.5 sm:gap-2">
            <Button
              variant={diaryViewMode === 'today' ? 'default' : 'outline'}
              size="sm"
              onClick={() => {
                setDiaryViewMode('today');
                setCurrentDate(new Date());
              }}
              className="text-xs flex-1 sm:flex-initial"
              data-testid="button-diary-today"
            >
              Today
            </Button>
            <Button
              variant={diaryViewMode === 'tomorrow' ? 'default' : 'outline'}
              size="sm"
              onClick={() => {
                setDiaryViewMode('tomorrow');
                const tomorrow = new Date();
                tomorrow.setDate(tomorrow.getDate() + 1);
                setCurrentDate(tomorrow);
              }}
              className="text-xs flex-1 sm:flex-initial"
              data-testid="button-diary-tomorrow"
            >
              Tomorrow
            </Button>
            <Button
              variant={diaryViewMode === 'weekly' ? 'default' : 'outline'}
              size="sm"
              onClick={() => {
                setDiaryViewMode('weekly');
                setCurrentDate(new Date());
              }}
              className="text-xs flex-1 sm:flex-initial"
              data-testid="button-diary-weekly"
            >
              Weekly
            </Button>
          </div>

          {/* Navigation Controls */}
          <div className="flex items-center gap-2 justify-center">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigateDate('prev')}
              className="h-8 w-8 p-0"
              data-testid="button-diary-prev"
            >
              <ChevronLeft size={16} />
            </Button>
            
            <div className="text-xs sm:text-sm font-medium text-indigo-800 dark:text-indigo-200 min-w-[100px] sm:min-w-[120px] text-center">
              {getViewTitle()}
            </div>
            
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigateDate('next')}
              className="h-8 w-8 p-0"
              data-testid="button-diary-next"
            >
              <ChevronRight size={16} />
            </Button>
          </div>
        </div>

        {/* Quick Summary Bar */}
        {((filteredDiary && filteredDiary.length > 0) || (todayRoomBookings && todayRoomBookings.length > 0)) && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div className="bg-indigo-50 dark:bg-indigo-900/20 p-4 rounded-xl border border-indigo-200 dark:border-indigo-800">
              <div className="flex items-center gap-2">
                <Users className="text-indigo-600" size={20} />
                <div>
                  <div className="text-lg font-bold text-indigo-800 dark:text-indigo-200">
                    {filteredDiary?.length || 0}
                  </div>
                  <div className="text-xs text-indigo-600 dark:text-indigo-400">Expected Visitors</div>
                </div>
              </div>
            </div>
            
            <div className="bg-purple-50 dark:bg-purple-900/20 p-4 rounded-xl border border-purple-200 dark:border-purple-800">
              <div className="flex items-center gap-2">
                <Calendar className="text-purple-600" size={20} />
                <div>
                  <div className="text-lg font-bold text-purple-800 dark:text-purple-200">
                    {currentViewRoomBookings?.length || 0}
                  </div>
                  <div className="text-xs text-purple-600 dark:text-purple-400">Room Bookings</div>
                </div>
              </div>
            </div>
            
            <div className="bg-green-50 dark:bg-green-900/20 p-4 rounded-xl border border-green-200 dark:border-green-800">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="text-green-600" size={20} />
                <div>
                  <div className="text-lg font-bold text-green-800 dark:text-green-200">
                    {filteredDiary?.filter(entry => entry.isCheckedIn).length || 0}
                  </div>
                  <div className="text-xs text-green-600 dark:text-green-400">Already Arrived</div>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="space-y-6 max-h-96 overflow-y-auto scrollbar-thin">
          {diaryLoading ? (
            <div className="text-center py-8 text-slate-600">
              <Calendar className="mx-auto mb-3 text-slate-400" size={40} />
              <p>Loading reception diary...</p>
            </div>
          ) : (!filteredDiary || filteredDiary.length === 0) && (!currentViewRoomBookings || currentViewRoomBookings.length === 0) ? (
            <div className="text-center py-8 text-slate-600">
              <CalendarDays className="mx-auto mb-3 text-slate-400" size={40} />
              <p className="font-medium">No activities scheduled for {getViewTitle().toLowerCase()}</p>
              <p className="text-sm mt-2">Visitor pre-bookings and meeting room bookings will appear here</p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Meeting Room Bookings for Current View */}
              {currentViewRoomBookings && currentViewRoomBookings.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <Badge className="bg-purple-100 text-purple-800 border-purple-200 font-medium">
                      {diaryViewMode === 'today' ? "Today's" : diaryViewMode === 'tomorrow' ? "Tomorrow's" : "Scheduled"} Meetings
                    </Badge>
                    <span className="text-xs text-slate-500">
                      {currentViewRoomBookings.length} meeting{currentViewRoomBookings.length !== 1 ? 's' : ''}
                    </span>
                  </div>
                  
                  <div className="space-y-2 pl-4 border-l-2 border-purple-200 dark:border-purple-800">
                    {currentViewRoomBookings
                      .sort((a, b) => new Date(`${a.date}T${a.startTime}`).getTime() - new Date(`${b.date}T${b.startTime}`).getTime())
                      .map((booking) => (
                        <div
                          key={booking.id}
                          className="p-4 rounded-xl border border-purple-200 bg-white/70 dark:bg-slate-800/70 hover:bg-white/90 dark:hover:bg-slate-700/90 transition-colors cursor-pointer"
                          data-testid={`meeting-${booking.id}`}
                          onClick={() => {
                            setSelectedMeetingBooking(booking);
                            setOpenModal('meeting-booking-details');
                          }}
                        >
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-2">
                                <div className="flex items-center gap-1">
                                  <Calendar className="text-purple-600" size={16} />
                                  <span className="font-semibold text-slate-800 dark:text-slate-200">
                                    {booking.title}
                                  </span>
                                </div>
                              </div>
                              
                              <div className="space-y-1 text-xs sm:text-sm">
                                <div className="flex items-center gap-2 text-slate-600 dark:text-slate-400">
                                  <Building2 size={14} className="flex-shrink-0" />
                                  <span className="truncate">{booking.roomName}</span>
                                </div>
                                <div className="flex items-center gap-2 text-slate-600 dark:text-slate-400">
                                  <UserCheck size={14} className="flex-shrink-0" />
                                  <span className="truncate">Host: {booking.organizer}</span>
                                </div>
                                <div className="flex items-center gap-2 text-slate-600 dark:text-slate-400">
                                  <Users size={14} className="flex-shrink-0" />
                                  <span>{booking.expectedAttendees || 0} attendees</span>
                                </div>
                                {booking.description && (
                                  <div className="flex items-center gap-2 text-slate-600 dark:text-slate-400">
                                    <AtSign size={14} className="flex-shrink-0" />
                                    <span className="line-clamp-1">{booking.description}</span>
                                  </div>
                                )}
                              </div>
                            </div>
                            
                            <div className="text-right">
                              <div className="text-sm font-medium text-slate-800 dark:text-slate-200">
                                {booking.startTime} - {booking.endTime}
                              </div>
                              <Badge className="bg-purple-100 text-purple-800 text-xs mt-1">
                                Meeting
                              </Badge>
                            </div>
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              )}

              {/* Visitor Pre-bookings */}
              {filteredDiary && filteredDiary.length > 0 && Object.entries(groupedDiary)
                .sort(([a], [b]) => new Date(a).getTime() - new Date(b).getTime())
                .slice(0, diaryViewMode === 'weekly' ? 7 : 4) // Show all 7 days for weekly view, 4 for others
                .map(([dateKey, entries]) => {
                  const date = new Date(dateKey);
                  const dayStatus = getDayStatus(date);
                  
                  return (
                    <div key={dateKey} className="space-y-3">
                      <div className="flex items-center gap-3">
                        <Badge className={`${dayStatus.color} font-medium`}>
                          {dayStatus.label} - Visitors
                        </Badge>
                        <span className="text-xs text-slate-500">
                          {entries.length} visit{entries.length !== 1 ? 's' : ''}
                        </span>
                      </div>
                      
                      <div className="space-y-2 pl-4 border-l-2 border-indigo-200 dark:border-indigo-800">
                        {entries
                          .sort((a, b) => new Date(a.visitDate).getTime() - new Date(b.visitDate).getTime())
                          .map((entry) => {
                            const priority = getPriorityLevel(entry);
                            const visitTime = getVisitDisplayTime(entry);
                            
                            return (
                              <div
                                key={entry.id}
                                className={`p-4 rounded-xl border ${priority.color} bg-white/70 dark:bg-slate-800/70 hover:bg-white/90 dark:hover:bg-slate-700/90 transition-colors cursor-pointer`}
                                data-testid={`diary-entry-${entry.id}`}
                                onClick={() => {
                                  setSelectedVisitorBooking(entry);
                                  setOpenModal('visitor-booking-details');
                                }}
                              >
                                <div className="flex items-start justify-between">
                                  <div className="flex-1">
                                    <div className="flex items-center gap-2 mb-2">
                                      <div className="flex items-center gap-1">
                                        {entry.isCheckedIn ? (
                                          <CheckCircle2 className="text-green-600" size={16} />
                                        ) : (
                                          <Clock3 className="text-orange-600" size={16} />
                                        )}
                                        <span className="font-semibold text-slate-800 dark:text-slate-200">
                                          {entry.visitorFirstName} {entry.visitorLastName}
                                        </span>
                                      </div>
                                      <Badge variant="outline" className="text-xs" style={{ backgroundColor: entry.tenantPrimaryColor + '20', borderColor: entry.tenantPrimaryColor }}>
                                        {entry.tenantCompanyName}
                                      </Badge>
                                    </div>
                                    
                                    <div className="space-y-1 text-xs sm:text-sm">
                                      <div className="flex items-center gap-2 text-slate-600 dark:text-slate-400">
                                        <Building2 size={14} className="flex-shrink-0" />
                                        <span className="truncate">{entry.company}</span>
                                      </div>
                                      <div className="flex items-center gap-2 text-slate-600 dark:text-slate-400">
                                        <UserCheck size={14} className="flex-shrink-0" />
                                        <span className="truncate">Host: {entry.hostFirstName} {entry.hostLastName} ({entry.hostDepartment})</span>
                                      </div>
                                      <div className="flex items-center gap-2 text-slate-600 dark:text-slate-400 sm:hidden">
                                        <Mail size={14} className="flex-shrink-0" />
                                        <span className="truncate">{entry.visitorEmail}</span>
                                      </div>
                                      <div className="hidden sm:flex items-center gap-2 text-slate-600 dark:text-slate-400">
                                        <Mail size={14} className="flex-shrink-0" />
                                        <span className="truncate">{entry.visitorEmail}</span>
                                      </div>
                                      {entry.purpose && (
                                        <div className="flex items-center gap-2 text-slate-600 dark:text-slate-400">
                                          <AtSign size={14} className="flex-shrink-0" />
                                          <span className="line-clamp-1">{entry.purpose}</span>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                  
                                  <div className="text-right">
                                    <div className="text-sm font-medium text-slate-800 dark:text-slate-200">
                                      {visitTime}
                                    </div>
                                    {priority.level === 'urgent' && (
                                      <Badge className="bg-red-100 text-red-800 text-xs mt-1">
                                        <AlertCircle size={12} className="mr-1" />
                                        Urgent
                                      </Badge>
                                    )}
                                    {entry.isCheckedIn && (
                                      <Badge className="bg-green-100 text-green-800 text-xs mt-1">
                                        Checked In
                                      </Badge>
                                    )}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                      </div>
                    </div>
                  );
                })}
            </div>
          )}
        </div>

        {((receptionDiary && receptionDiary.length > 0) || (todayRoomBookings && todayRoomBookings.length > 0)) && (
          <div className="mt-6 pt-4 border-t border-indigo-200 dark:border-indigo-800">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs sm:text-sm">
              <div className="flex items-center gap-3 sm:gap-4 flex-wrap">
                <div className="flex items-center gap-1.5 sm:gap-2">
                  <div className="w-3 h-3 bg-red-100 border border-red-200 rounded flex-shrink-0"></div>
                  <span className="text-slate-600">Urgent</span>
                </div>
                <div className="flex items-center gap-1.5 sm:gap-2">
                  <div className="w-3 h-3 bg-orange-100 border border-orange-200 rounded flex-shrink-0"></div>
                  <span className="text-slate-600">High</span>
                </div>
                <div className="flex items-center gap-1.5 sm:gap-2">
                  <CheckCircle2 className="text-green-600 flex-shrink-0" size={14} />
                  <span className="text-slate-600">Checked In</span>
                </div>
                <div className="flex items-center gap-1.5 sm:gap-2">
                  <Calendar className="text-purple-600 flex-shrink-0" size={14} />
                  <span className="text-slate-600">Meeting</span>
                </div>
              </div>
              <span className="text-slate-500 text-xs hidden sm:block">Auto-refreshes every 30s</span>
            </div>
          </div>
        )}
      </GlassCard>

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
                  <div className="flex items-center space-x-2 sm:space-x-3 min-w-0">
                    <div className={`w-3 h-3 rounded-full flex-shrink-0 ${dept.color}`}></div>
                    <span className="font-medium text-slate-800 dark:text-slate-200 truncate">{dept.department}</span>
                  </div>
                  <div className="flex flex-col sm:flex-row items-end sm:items-center gap-1 sm:gap-4 sm:space-x-4">
                    <span className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 text-right sm:text-left">
                      {dept.totalCount} people <span className="hidden sm:inline">({dept.visitorCount} visitors, {dept.staffCount} staff)</span>
                    </span>
                    <Badge variant={dept.trend?.startsWith('+') ? 'default' : 'secondary'} className="text-xs flex-shrink-0">
                      {dept.trend || 'No trend'}
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
              onClick={() => setLocation('/meeting-rooms')}
              data-testid="button-room-booking"
            >
              <Calendar className="mr-2" size={16} />
              Room Booking
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


      {/* Modal Dialogs */}
      {/* Current Visitors Modal */}
      <Dialog open={openModal === 'visitors'} onOpenChange={() => setOpenModal(null)}>
        <DialogContent className="glass-effect border border-white/30 max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-slate-800">
              <UsersRound className="text-blue-600" size={24} />
              Current Visitors ({currentVisitors?.length || 0})
            </DialogTitle>
            <DialogDescription>
              View and manage all visitors currently on-site. Check out visitors when they leave.
            </DialogDescription>
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
            <DialogDescription>
              View all visitors who checked in today, including their check-in and check-out times.
            </DialogDescription>
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
            <DialogDescription>
              View all staff members currently checked in and on-site.
            </DialogDescription>
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
                    {departmentDetails.statistics.checkedInStaff + departmentDetails.statistics.visitors} people on-site
                  </Badge>
                )}
              </DialogTitle>
              <DialogDescription>
                View detailed information about staff members and visitors in this department.
              </DialogDescription>
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
                      {departmentDetails.statistics.checkedInStaff}
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
                      {departmentDetails.statistics.checkedInStaff + departmentDetails.statistics.visitors}
                    </div>
                    <div className="text-sm text-purple-800">Total People</div>
                  </div>
                </div>

                {/* Staff Section */}
                <div>
                  <h3 className="text-lg font-semibold text-slate-800 mb-4 flex items-center">
                    <User className="mr-2" size={20} />
                    Staff Members ({departmentDetails.staffMembers.length})
                  </h3>
                  <div className="space-y-3">
                    {departmentDetails.staffMembers.length === 0 ? (
                      <div className="text-center py-4 text-slate-600">No staff assigned to this department</div>
                    ) : (
                      departmentDetails.staffMembers.map((staffMember) => (
                        <div key={staffMember.id} className="flex items-center justify-between p-4 bg-white border rounded-lg">
                          <div className="flex items-center space-x-3">
                            <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                              staffMember.isCheckedIn ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-600'
                            }`}>
                              <User size={20} />
                            </div>
                            <div>
                              <p className="font-medium text-slate-800">{staffMember.firstName} {staffMember.lastName}</p>
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
                                {getInitials(`${visitor.firstName} ${visitor.lastName}`)}
                              </span>
                            </div>
                            <div>
                              <p className="font-medium text-slate-800">{visitor.firstName} {visitor.lastName}</p>
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

      {/* Contractors Modal */}
      <Dialog open={openModal === 'contractors'} onOpenChange={() => setOpenModal(null)}>
        <DialogContent className="glass-effect border border-white/30 max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-slate-800">
              <HardHat className="text-orange-600" size={24} />
              Contractors On-Site ({checkedInContractors?.length || 0})
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 max-h-96 overflow-y-auto pr-1 scrollbar-thin">
            {checkedInContractors && checkedInContractors.length > 0 ? (
              checkedInContractors.map((contractor) => (
                <div key={contractor.id} className="flex items-center justify-between p-4 bg-white/50 rounded-xl border border-white/30 hover:bg-white/70 transition-colors">
                  <div className="flex items-center space-x-3">
                    <div className="w-12 h-12 bg-orange-100 rounded-full flex items-center justify-center">
                      <span className="text-orange-600 font-medium text-sm">
                        {getInitials(`${contractor.firstName} ${contractor.lastName}`)}
                      </span>
                    </div>
                    <div>
                      <div className="font-medium text-slate-800">
                        {contractor.firstName} {contractor.lastName}
                      </div>
                      <div className="text-sm text-slate-600">
                        {contractor.company || 'Company not specified'}
                      </div>
                      <div className="text-xs text-slate-500">
                        Role: {contractor.role || 'General Contractor'} • Checked in: {contractor.checkedInAt ? formatDistanceToNow(new Date(contractor.checkedInAt), { addSuffix: true }) : 'Recently'}
                      </div>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => checkoutContractorMutation.mutate(contractor.id)}
                    disabled={checkoutContractorMutation.isPending}
                    className="flex items-center gap-1"
                    data-testid={`checkout-contractor-${contractor.id}`}
                  >
                    <LogOut size={14} />
                    Check Out
                  </Button>
                </div>
              ))
            ) : (
              <div className="text-center py-8 text-slate-600">
                No contractors currently on-site
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Total People Modal */}
      <Dialog open={openModal === 'total-people'} onOpenChange={() => setOpenModal(null)}>
        <DialogContent className="glass-effect border border-white/30 max-w-4xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-slate-800">
              <Users className="text-green-600" size={24} />
              All People On-Site ({((currentVisitors?.length || 0) + (checkedInStaff?.length || 0) + (checkedInContractors?.length || 0))})
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-6 max-h-96 overflow-y-auto pr-1 scrollbar-thin">
            
            {/* Visitors Section */}
            {currentVisitors && currentVisitors.length > 0 && (
              <div>
                <h3 className="text-lg font-semibold text-slate-800 mb-3 flex items-center">
                  <UsersRound className="mr-2 text-blue-600" size={20} />
                  Visitors ({currentVisitors.length})
                </h3>
                <div className="space-y-2">
                  {currentVisitors.map((visitor) => (
                    <div key={visitor.id} className="flex items-center justify-between p-3 bg-blue-50/50 rounded-lg border border-blue-200/30">
                      <div className="flex items-center space-x-3">
                        <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                          <span className="text-blue-600 font-medium text-sm">
                            {getInitials(`${visitor.firstName} ${visitor.lastName}`)}
                          </span>
                        </div>
                        <div>
                          <div className="font-medium text-slate-800">
                            {visitor.firstName} {visitor.lastName}
                          </div>
                          <div className="text-sm text-slate-600">{visitor.company}</div>
                        </div>
                      </div>
                      <Badge variant="secondary" className="bg-blue-100 text-blue-800 border-blue-300">
                        Visitor
                      </Badge>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Staff Section */}
            {checkedInStaff && checkedInStaff.length > 0 && (
              <div>
                <h3 className="text-lg font-semibold text-slate-800 mb-3 flex items-center">
                  <BadgeInfo className="mr-2 text-purple-600" size={20} />
                  Staff ({checkedInStaff.length})
                </h3>
                <div className="space-y-2">
                  {checkedInStaff.map((staff) => (
                    <div key={staff.id} className="flex items-center justify-between p-3 bg-purple-50/50 rounded-lg border border-purple-200/30">
                      <div className="flex items-center space-x-3">
                        <div className="w-10 h-10 bg-purple-100 rounded-full flex items-center justify-center">
                          <span className="text-purple-600 font-medium text-sm">
                            {getInitials(`${staff.firstName} ${staff.lastName}`)}
                          </span>
                        </div>
                        <div>
                          <div className="font-medium text-slate-800">
                            {staff.firstName} {staff.lastName}
                          </div>
                          <div className="text-sm text-slate-600">{staff.department}</div>
                        </div>
                      </div>
                      <Badge variant="secondary" className="bg-purple-100 text-purple-800 border-purple-300">
                        Staff
                      </Badge>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Contractors Section */}
            {checkedInContractors && checkedInContractors.length > 0 && (
              <div>
                <h3 className="text-lg font-semibold text-slate-800 mb-3 flex items-center">
                  <HardHat className="mr-2 text-orange-600" size={20} />
                  Contractors ({checkedInContractors.length})
                </h3>
                <div className="space-y-2">
                  {checkedInContractors.map((contractor) => (
                    <div key={contractor.id} className="flex items-center justify-between p-3 bg-orange-50/50 rounded-lg border border-orange-200/30">
                      <div className="flex items-center space-x-3">
                        <div className="w-10 h-10 bg-orange-100 rounded-full flex items-center justify-center">
                          <span className="text-orange-600 font-medium text-sm">
                            {getInitials(`${contractor.firstName} ${contractor.lastName}`)}
                          </span>
                        </div>
                        <div>
                          <div className="font-medium text-slate-800">
                            {contractor.firstName} {contractor.lastName}
                          </div>
                          <div className="text-sm text-slate-600">{contractor.company || 'Contractor'}</div>
                        </div>
                      </div>
                      <Badge variant="secondary" className="bg-orange-100 text-orange-800 border-orange-300">
                        Contractor
                      </Badge>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Empty State */}
            {(!currentVisitors || currentVisitors.length === 0) && 
             (!checkedInStaff || checkedInStaff.length === 0) && 
             (!checkedInContractors || checkedInContractors.length === 0) && (
              <div className="text-center py-8 text-slate-600">
                No people currently on-site
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Visitor Booking Details Modal */}
      <Dialog open={openModal === 'visitor-booking-details'} onOpenChange={() => setOpenModal(null)}>
        <DialogContent className="glass-effect border border-white/30 max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 sm:gap-3">
              <div className="w-10 h-10 sm:w-12 sm:h-12 flex-shrink-0 bg-indigo-500 rounded-full flex items-center justify-center">
                <Calendar className="text-white" size={20} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-base sm:text-xl font-semibold truncate">Visitor Pre-Booking Details</div>
                <div className="text-xs sm:text-sm text-slate-600 font-normal truncate">
                  {selectedVisitorBooking?.visitorFirstName} {selectedVisitorBooking?.visitorLastName}
                </div>
              </div>
            </DialogTitle>
          </DialogHeader>
          
          {selectedVisitorBooking && (
            <div className="space-y-4 sm:space-y-6">
              {/* Status Banner */}
              <div className={`border rounded-lg p-3 sm:p-4 ${
                selectedVisitorBooking.isCheckedIn 
                  ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
                  : 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800'
              }`}>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    {selectedVisitorBooking.isCheckedIn ? (
                      <CheckCircle2 className="text-green-600 flex-shrink-0" size={18} />
                    ) : (
                      <Clock3 className="text-blue-600 flex-shrink-0" size={18} />
                    )}
                    <Badge variant="default" className={`${selectedVisitorBooking.isCheckedIn ? 'bg-green-600' : 'bg-blue-600'} text-xs whitespace-nowrap`}>
                      {selectedVisitorBooking.isCheckedIn ? '✓ Visitor Has Arrived' : '⏰ Expected Arrival'}
                    </Badge>
                    <span className="text-xs sm:text-sm font-medium">
                      {formatVisitTime(new Date(selectedVisitorBooking.visitDate))}
                    </span>
                  </div>
                  <Badge 
                    variant="outline" 
                    className="text-xs whitespace-nowrap w-fit" 
                    style={{ 
                      backgroundColor: selectedVisitorBooking.tenantPrimaryColor + '20', 
                      borderColor: selectedVisitorBooking.tenantPrimaryColor 
                    }}
                  >
                    {selectedVisitorBooking.tenantCompanyName}
                  </Badge>
                </div>
              </div>

              {/* Visitor Information */}
              <div className="bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg p-3 sm:p-4">
                <h3 className="text-base sm:text-lg font-semibold text-slate-800 dark:text-slate-200 mb-3 flex items-center gap-2">
                  <User className="text-indigo-600 flex-shrink-0" size={18} />
                  Visitor Information
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                  <div>
                    <label className="text-xs sm:text-sm font-medium text-slate-600 dark:text-slate-400">Full Name</label>
                    <p className="text-sm sm:text-base bg-white dark:bg-slate-800 p-2 rounded border break-words">
                      {selectedVisitorBooking.visitorFirstName} {selectedVisitorBooking.visitorLastName}
                    </p>
                  </div>
                  <div>
                    <label className="text-xs sm:text-sm font-medium text-slate-600 dark:text-slate-400">Email Address</label>
                    <p className="text-xs sm:text-sm font-mono bg-white dark:bg-slate-800 p-2 rounded border break-all">
                      {selectedVisitorBooking.visitorEmail}
                    </p>
                  </div>
                  <div>
                    <label className="text-xs sm:text-sm font-medium text-slate-600 dark:text-slate-400">Company</label>
                    <p className="text-sm sm:text-base bg-white dark:bg-slate-800 p-2 rounded border break-words">
                      {selectedVisitorBooking.company || 'Not specified'}
                    </p>
                  </div>
                  <div>
                    <label className="text-xs sm:text-sm font-medium text-slate-600 dark:text-slate-400">Visit Date & Time</label>
                    <p className="text-xs sm:text-sm bg-white dark:bg-slate-800 p-2 rounded border break-words">
                      {new Date(selectedVisitorBooking.visitDate).toLocaleDateString('en-GB', { 
                        weekday: 'long', 
                        year: 'numeric', 
                        month: 'long', 
                        day: 'numeric' 
                      })} at {formatVisitTime(new Date(selectedVisitorBooking.visitDate))}
                    </p>
                  </div>
                </div>
              </div>

              {/* Host & Meeting Details */}
              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3 sm:p-4">
                <h3 className="text-base sm:text-lg font-semibold text-blue-800 dark:text-blue-300 mb-3 flex items-center gap-2">
                  <UserCheck className="text-blue-600 flex-shrink-0" size={18} />
                  Host & Meeting Details
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                  <div>
                    <label className="text-xs sm:text-sm font-medium text-blue-700 dark:text-blue-400">Host</label>
                    <p className="text-sm sm:text-base bg-white dark:bg-slate-800 p-2 rounded border break-words">
                      {selectedVisitorBooking.hostFirstName} {selectedVisitorBooking.hostLastName}
                    </p>
                  </div>
                  <div>
                    <label className="text-xs sm:text-sm font-medium text-blue-700 dark:text-blue-400">Department</label>
                    <p className="text-sm sm:text-base bg-white dark:bg-slate-800 p-2 rounded border break-words">
                      {selectedVisitorBooking.hostDepartment}
                    </p>
                  </div>
                  <div>
                    <label className="text-xs sm:text-sm font-medium text-blue-700 dark:text-blue-400">Host Email</label>
                    <p className="text-xs sm:text-sm font-mono bg-white dark:bg-slate-800 p-2 rounded border break-all">
                      {selectedVisitorBooking.hostEmail}
                    </p>
                  </div>
                  <div>
                    <label className="text-xs sm:text-sm font-medium text-blue-700 dark:text-blue-400">Purpose of Visit</label>
                    <p className="text-sm sm:text-base bg-white dark:bg-slate-800 p-2 rounded border break-words">
                      {selectedVisitorBooking.purpose || 'Not specified'}
                    </p>
                  </div>
                </div>
              </div>

              {/* Reception Services & Special Requests */}
              <div className="bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-lg p-4">
                <h3 className="text-lg font-semibold text-purple-800 dark:text-purple-300 mb-3 flex items-center gap-2">
                  <AtSign className="text-purple-600" size={20} />
                  Reception Services & Special Requests
                </h3>
                <div className="space-y-3">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="bg-white dark:bg-slate-800 p-3 rounded border">
                      <h4 className="font-medium text-purple-700 dark:text-purple-400 mb-2">☕ Refreshment Services</h4>
                      <div className="space-y-1 text-sm">
                        <div className="flex items-center gap-2">
                          <input type="checkbox" className="rounded" />
                          <span>Welcome coffee/tea upon arrival</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <input type="checkbox" className="rounded" />
                          <span>Meeting room refreshments</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <input type="checkbox" className="rounded" />
                          <span>Special dietary requirements</span>
                        </div>
                      </div>
                    </div>
                    
                    <div className="bg-white dark:bg-slate-800 p-3 rounded border">
                      <h4 className="font-medium text-purple-700 dark:text-purple-400 mb-2">🏢 Building Services</h4>
                      <div className="space-y-1 text-sm">
                        <div className="flex items-center gap-2">
                          <input type="checkbox" className="rounded" />
                          <span>Visitor parking required</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <input type="checkbox" className="rounded" />
                          <span>Meeting room booking needed</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <input type="checkbox" className="rounded" />
                          <span>Technical equipment setup</span>
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  <div>
                    <label className="text-sm font-medium text-purple-700 dark:text-purple-400">Additional Notes for Reception</label>
                    <div className="bg-white dark:bg-slate-800 p-3 rounded border mt-1">
                      <p className="text-sm text-slate-600 dark:text-slate-400 italic">
                        {selectedVisitorBooking.purpose ? 
                          `Meeting purpose: ${selectedVisitorBooking.purpose}. Please ensure visitor is greeted professionally and host is notified immediately upon arrival.` :
                          'Please ensure visitor is greeted professionally and host is notified immediately upon arrival.'
                        }
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Quick Actions */}
              <div className="flex gap-3 pt-4 border-t">
                <Button 
                  onClick={async () => {
                    try {
                      const response = await apiRequest("POST", "/api/prebookings/manual-checkin", {
                        preBookingId: selectedVisitorBooking.id
                      });
                      
                      const result = await response.json();
                      
                      if (result.success) {
                        toast({
                          title: "✅ Visitor Checked In",
                          description: `${selectedVisitorBooking.visitorFirstName} ${selectedVisitorBooking.visitorLastName} has been successfully checked in.`,
                        });
                        setOpenModal(null);
                        queryClient.invalidateQueries({ queryKey: ['/api/reception/diary'] });
                        queryClient.invalidateQueries({ queryKey: ['/api/visitors/current'] });
                        queryClient.invalidateQueries({ queryKey: ['/api/stats'] });
                      }
                    } catch (error: any) {
                      toast({
                        title: "❌ Check-in Failed",
                        description: error.message || "Failed to check in visitor. Please try again.",
                        variant: "destructive",
                      });
                    }
                  }}
                  disabled={selectedVisitorBooking.isCheckedIn}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 text-white"
                  data-testid="button-manual-checkin-booking"
                >
                  {selectedVisitorBooking.isCheckedIn ? '✓ Already Checked In' : '👤 Manual Check-In'}
                </Button>
                <Button 
                  onClick={() => {
                    toast({
                      title: "Reception Service Checklist",
                      description: "✅ Coffee/tea prepared ☑️ Meeting room ready ☑️ Parking arranged ☑️ Host notified",
                    });
                  }}
                  variant="outline"
                  className="flex-1 bg-green-50 hover:bg-green-100 border-green-300"
                  data-testid="button-service-checklist"
                >
                  ✅ Service Checklist
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Meeting Booking Details Modal */}
      <Dialog open={openModal === 'meeting-booking-details'} onOpenChange={() => setOpenModal(null)}>
        <DialogContent className="glass-effect border border-white/30 max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              <div className="w-12 h-12 bg-purple-500 rounded-full flex items-center justify-center">
                <Calendar className="text-white" size={24} />
              </div>
              <div>
                <div className="text-xl">Meeting Room Booking Details</div>
                <div className="text-sm text-slate-600 font-normal">
                  {selectedMeetingBooking?.title}
                </div>
              </div>
            </DialogTitle>
          </DialogHeader>
          
          {selectedMeetingBooking && (
            <div className="space-y-6">
              {/* Status Banner */}
              <div className="bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Calendar className="text-purple-600" size={20} />
                    <Badge variant="default" className="bg-purple-600">
                      📅 Scheduled Meeting
                    </Badge>
                    <span className="text-sm font-medium">
                      {selectedMeetingBooking.startTime} - {selectedMeetingBooking.endTime}
                    </span>
                  </div>
                  <Badge variant="outline" className="text-xs bg-purple-100 text-purple-800 border-purple-200">
                    Meeting Room
                  </Badge>
                </div>
              </div>

              {/* Meeting Information */}
              <div className="bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg p-4">
                <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-200 mb-3 flex items-center gap-2">
                  <Calendar className="text-purple-600" size={20} />
                  Meeting Information
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium text-slate-600 dark:text-slate-400">Meeting Title</label>
                    <p className="text-lg bg-white dark:bg-slate-800 p-2 rounded border">
                      {selectedMeetingBooking.title}
                    </p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-slate-600 dark:text-slate-400">Room</label>
                    <p className="text-lg bg-white dark:bg-slate-800 p-2 rounded border">
                      {selectedMeetingBooking.roomName}
                    </p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-slate-600 dark:text-slate-400">Date</label>
                    <p className="text-lg bg-white dark:bg-slate-800 p-2 rounded border">
                      {new Date(selectedMeetingBooking.date).toLocaleDateString('en-GB', { 
                        weekday: 'long', 
                        year: 'numeric', 
                        month: 'long', 
                        day: 'numeric' 
                      })}
                    </p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-slate-600 dark:text-slate-400">Time</label>
                    <p className="text-lg bg-white dark:bg-slate-800 p-2 rounded border">
                      {selectedMeetingBooking.startTime} - {selectedMeetingBooking.endTime}
                    </p>
                  </div>
                </div>
                {selectedMeetingBooking.description && (
                  <div className="mt-4">
                    <label className="text-sm font-medium text-slate-600 dark:text-slate-400">Description</label>
                    <p className="text-base bg-white dark:bg-slate-800 p-2 rounded border mt-1">
                      {selectedMeetingBooking.description}
                    </p>
                  </div>
                )}
              </div>

              {/* Organizer & Attendees */}
              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                <h3 className="text-lg font-semibold text-blue-800 dark:text-blue-300 mb-3 flex items-center gap-2">
                  <Users className="text-blue-600" size={20} />
                  Organizer & Attendees
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium text-blue-700 dark:text-blue-400">Meeting Organizer</label>
                    <p className="text-lg bg-white dark:bg-slate-800 p-2 rounded border">
                      {selectedMeetingBooking.organizer}
                    </p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-blue-700 dark:text-blue-400">Expected Attendees</label>
                    <p className="text-lg bg-white dark:bg-slate-800 p-2 rounded border">
                      {selectedMeetingBooking.expectedAttendees || 0} people
                    </p>
                  </div>
                </div>
              </div>

              {/* Catering & Technical Requirements */}
              <div className="bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-lg p-4">
                <h3 className="text-lg font-semibold text-orange-800 dark:text-orange-300 mb-3 flex items-center gap-2">
                  <AtSign className="text-orange-600" size={20} />
                  Catering & Technical Requirements
                </h3>
                <div className="space-y-3">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="bg-white dark:bg-slate-800 p-3 rounded border">
                      <h4 className="font-medium text-orange-700 dark:text-orange-400 mb-2">☕ Catering Services</h4>
                      <div className="space-y-1 text-sm">
                        <div className="flex items-center gap-2">
                          <input type="checkbox" className="rounded" defaultChecked={selectedMeetingBooking.expectedAttendees >= 5} />
                          <span>Coffee & tea service</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <input type="checkbox" className="rounded" defaultChecked={selectedMeetingBooking.expectedAttendees >= 10} />
                          <span>Light refreshments</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <input type="checkbox" className="rounded" />
                          <span>Water & glasses</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <input type="checkbox" className="rounded" />
                          <span>Special dietary requirements</span>
                        </div>
                      </div>
                    </div>
                    
                    <div className="bg-white dark:bg-slate-800 p-3 rounded border">
                      <h4 className="font-medium text-orange-700 dark:text-orange-400 mb-2">🔧 Technical Setup</h4>
                      <div className="space-y-1 text-sm">
                        <div className="flex items-center gap-2">
                          <input type="checkbox" className="rounded" defaultChecked />
                          <span>Projector & screen available</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <input type="checkbox" className="rounded" defaultChecked />
                          <span>Video conferencing ready</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <input type="checkbox" className="rounded" />
                          <span>Flip chart & markers</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <input type="checkbox" className="rounded" />
                          <span>Power outlets accessible</span>
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  <div>
                    <label className="text-sm font-medium text-orange-700 dark:text-orange-400">Room Setup Notes</label>
                    <div className="bg-white dark:bg-slate-800 p-3 rounded border mt-1">
                      <p className="text-sm text-slate-600 dark:text-slate-400">
                        Room configured for {selectedMeetingBooking.expectedAttendees || 'small group'} attendees. 
                        {selectedMeetingBooking.description ? ` Meeting purpose: ${selectedMeetingBooking.description}` : ' Standard meeting room setup required.'}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Room Information */}
              <div className="bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg p-4">
                <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-200 mb-3 flex items-center gap-2">
                  <Building2 className="text-slate-600" size={20} />
                  Room Information
                </h3>
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium text-slate-600 dark:text-slate-400">Room Name</span>
                    <span className="text-base font-mono">{selectedMeetingBooking.roomName}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium text-slate-600 dark:text-slate-400">Capacity</span>
                    <span className="text-base">
                      {meetingRooms?.find(room => room.name === selectedMeetingBooking.roomName)?.capacity || 'Unknown'} people
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium text-slate-600 dark:text-slate-400">Equipment</span>
                    <span className="text-base">
                      {'Standard AV equipment'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Quick Actions */}
              <div className="flex gap-3 pt-4 border-t">
                <Button 
                  onClick={() => {
                    toast({
                      title: "Room Preparation Started",
                      description: "✅ Room cleaned ☑️ Equipment tested ☑️ Catering ordered ☑️ Organizer notified",
                    });
                  }}
                  className="flex-1"
                  data-testid="button-prepare-meeting-room"
                >
                  🏢 Prepare Room
                </Button>
                <Button 
                  onClick={() => {
                    toast({
                      title: "Catering Service Request",
                      description: `Catering ordered for ${selectedMeetingBooking.expectedAttendees || 'estimated'} attendees in ${selectedMeetingBooking.roomName}`,
                    });
                  }}
                  variant="outline"
                  className="flex-1 bg-orange-50 hover:bg-orange-100 border-orange-300"
                  data-testid="button-order-catering"
                >
                  ☕ Order Catering
                </Button>
                <Button 
                  onClick={() => {
                    toast({
                      title: "Technical Check Completed",
                      description: "✅ Projector working ☑️ WiFi strong ☑️ Video conferencing ready ☑️ All systems go",
                    });
                  }}
                  variant="outline"
                  className="flex-1 bg-blue-50 hover:bg-blue-100 border-blue-300"
                  data-testid="button-tech-check"
                >
                  🔧 Tech Check
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
