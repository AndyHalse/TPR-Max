import { useTranslation } from "react-i18next";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import GlassCard from "@/components/GlassCard";
import { UsersRound, AtSign, BadgeInfo, Clock, TrendingUp, Shield, BarChart3, AlertTriangle, CheckCircle, DollarSign, LogOut, User, HardHat, Building2, Settings, Eye, Calendar, CalendarDays, MapPin, Mail, Phone, Users2, Clock3, AlertCircle, CheckCircle2, UserCheck, ChevronLeft, ChevronRight, Users, LayoutList, LayoutGrid, LogIn, Trash2, Flame, Siren, Circle, X, Rocket } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { apiRequest, getSessionToken } from "@/lib/queryClient";
import { useState } from "react";
import type { Staff, Visitor, TransformedRoomBooking, MeetingRoom } from "@shared/schema";
import { formatDateLocale, formatTimeLocale } from "@/utils/formatDate";
import { formatDistanceToNow } from "date-fns";

interface Stats {
  currentVisitors: number;
  staffOnSite: number;
  contractorsOnSite: number;
  membersOnSite: number;
  featureMembers: boolean;
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
  const { t } = useTranslation(['dashboard', 'common']);
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const [openModal, setOpenModal] = useState<'visitors' | 'staff' | 'contractors' | 'members' | 'total-people' | 'department-details' | 'visitor-details' | 'visitor-booking-details' | 'meeting-booking-details' | null>(null);
  const [selectedDepartment, setSelectedDepartment] = useState<string>('');
  const [selectedVisitor, setSelectedVisitor] = useState<any>(null);
  const [selectedVisitorBooking, setSelectedVisitorBooking] = useState<any>(null);
  const [selectedMeetingBooking, setSelectedMeetingBooking] = useState<any>(null);
  
  // Reception Diary view state
  const [diaryViewMode, setDiaryViewMode] = useState<'today' | 'tomorrow' | 'weekly'>('today');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [diaryLayout, setDiaryLayout] = useState<'cards' | 'compact'>('cards');
  const [showHistory, setShowHistory] = useState(false);
  const [diaryFilter, setDiaryFilter] = useState<'all' | 'visitors' | 'contractors' | 'meetings'>('all');
  
  const formatLocalDate = (d: Date) => {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const getQueryDateAndDays = (mode: 'today' | 'tomorrow' | 'weekly', refDate: Date) => {
    if (mode === 'weekly') {
      const start = new Date(refDate);
      const dayOfWeek = start.getDay();
      const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
      start.setDate(start.getDate() - daysToMonday);
      start.setHours(0, 0, 0, 0);
      return { dateParam: formatLocalDate(start), days: 7, start, end: new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6, 23, 59, 59, 999) };
    } else if (mode === 'tomorrow') {
      const target = new Date(refDate);
      target.setDate(target.getDate() + 1);
      target.setHours(0, 0, 0, 0);
      const end = new Date(target);
      end.setHours(23, 59, 59, 999);
      return { dateParam: formatLocalDate(target), days: 1, start: target, end };
    } else {
      const today = new Date(refDate);
      today.setHours(0, 0, 0, 0);
      const end = new Date(today);
      end.setHours(23, 59, 59, 999);
      return { dateParam: formatLocalDate(today), days: 1, start: today, end };
    }
  };
  
  // Get current user for authentication check
  const { data: currentUser } = useQuery<{ id: string; username: string; customerId: string }>({
    queryKey: ["/api/auth/me"],
  });
  
  const { data: stats, isLoading: statsLoading } = useQuery<Stats>({
    queryKey: ["/api/stats"],
    enabled: !!currentUser,
    refetchInterval: 30000,
    refetchOnMount: 'always',
  });

  const { data: currentVisitors, isLoading: visitorsLoading } = useQuery<Visitor[]>({
    queryKey: ["/api/visitors/current"],
    enabled: !!currentUser,
    refetchInterval: 30000,
    refetchOnMount: 'always',
  });

  const { data: staff } = useQuery<Staff[]>({
    queryKey: ["/api/staff"],
    enabled: !!currentUser,
    refetchOnMount: 'always',
  });

  const { data: todayVisitors } = useQuery<Visitor[]>({
    queryKey: ["/api/visitors/today"],
    enabled: !!currentUser,
    refetchOnMount: 'always',
  });

  const { data: checkedInStaff } = useQuery<Staff[]>({
    queryKey: ["/api/staff/checked-in"],
    enabled: !!currentUser,
    refetchInterval: 30000,
    refetchOnMount: 'always',
  });

  const { data: checkedInContractors } = useQuery<any[]>({
    queryKey: ["/api/contractors/checked-in"],
    enabled: !!currentUser,
    refetchInterval: 30000,
    refetchOnMount: 'always',
  });

  const { data: checkedInMembers } = useQuery<any[]>({
    queryKey: ["/api/members/checked-in"],
    enabled: !!currentUser,
    refetchInterval: 30000,
    refetchOnMount: 'always',
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

  const { data: checklistStatus } = useQuery<{
    steps: {
      companyLogoSet: boolean;
      emergencyEmailSet: boolean;
      emailSmtpConfigured: boolean;
      mustersPointNamed: boolean;
      staffAdded: boolean;
      firstVisitorOrContractor: boolean;
    };
    completedCount: number;
    totalCount: number;
    allComplete: boolean;
    dismissed: boolean;
  }>({
    queryKey: ["/api/onboarding/checklist-status"],
    enabled: !!currentUser,
  });

  const dismissChecklistMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/onboarding/checklist-dismiss"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/onboarding/checklist-status"] });
    },
  });

  // Company settings for feature toggles
  const { data: settings } = useQuery<{
    featureMeetingRooms?: boolean;
    featureTimeAttendance?: boolean;
    featureInductionSettings?: boolean;
    featureKiosk?: boolean;
  }>({
    queryKey: ["/api/settings"],
    enabled: !!currentUser,
  });

  const { data: todayRoomBookings, isLoading: roomBookingsLoading } = useQuery<TransformedRoomBooking[]>({
    queryKey: ["/api/room-bookings/today", diaryViewMode, currentDate.toISOString()],
    queryFn: async () => {
      const { dateParam, days } = getQueryDateAndDays(diaryViewMode, currentDate);
      const response = await fetch(
        `/api/room-bookings/today?date=${dateParam}&days=${days}`,
        { credentials: 'include' }
      );
      if (!response.ok) throw new Error('Failed to fetch room bookings');
      return response.json();
    },
    refetchInterval: 30000,
    enabled: !!currentUser,
  });

  const currentViewRoomBookings = todayRoomBookings || [];

  const { data: meetingRooms } = useQuery<MeetingRoom[]>({
    queryKey: ["/api/meeting-rooms"],
    enabled: !!currentUser,
  });

  const { data: activeLoneWorkers = [] } = useQuery<any[]>({
    queryKey: ['/api/lone-worker/active'],
    refetchInterval: 30000,
    enabled: !!currentUser,
  });

  const { data: fraStatus } = useQuery<{
    hasCurrentFRA: boolean;
    daysUntilReview: number | null;
    isOverdue: boolean;
    currentFRA: any;
    actionItems: { total: number; outstanding: number; critical_outstanding: number; overdue_actions: number; completed: number; };
    overallStatus: 'compliant' | 'action_required' | 'critical' | 'no_fra';
  }>({
    queryKey: ['/api/fire-risk-assessments/status'],
    enabled: !!currentUser,
    refetchInterval: 60000,
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

  // Reception Diary Data - dynamic query based on view mode and date
  interface VisitorBooking {
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
  }
  
  interface ContractorBooking {
    id: string;
    companyName: string;
    contactEmail: string;
    workerName: string;
    workerEmail: string | null;
    purpose: string;
    scheduledDate: Date;
    scheduledTime: string;
    duration: string | null;
    status: string | null;
    notes: string | null;
    hostStaffId: string | null;
    hostName: string | null;
    hostFirstName: string | null;
    hostLastName: string | null;
    hostDepartment: string | null;
  }

  const { data: receptionDiaryData, isLoading: diaryLoading } = useQuery<{
    visitors: VisitorBooking[];
    contractors: ContractorBooking[];
  }>({
    queryKey: [
      "/api/reception/diary",
      diaryViewMode,
      currentDate.toISOString()
    ],
    queryFn: async () => {
      const { dateParam, days } = getQueryDateAndDays(diaryViewMode, currentDate);
      
      const token = getSessionToken();
      const response = await fetch(
        `/api/reception/diary?date=${dateParam}&days=${days}`,
        {
          credentials: 'include',
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        }
      );
      
      if (!response.ok) {
        throw new Error('Failed to fetch reception diary');
      }
      
      const data = await response.json();
      if (Array.isArray(data)) {
        return { visitors: data, contractors: [] };
      }
      return data;
    },
    refetchInterval: 30000,
    enabled: !!currentUser,
  });
  
  const receptionDiary = receptionDiaryData?.visitors || [];
  const contractorDiary = receptionDiaryData?.contractors || [];

  const getStaffName = (staffId?: string) => {
    if (!staffId || !staff) return t('common:unknown');
    const staffMember = staff.find(s => s.id === staffId);
    return staffMember ? `${staffMember.firstName} ${staffMember.lastName}` : t('common:unknown');
  };

  // Reception Diary utility functions
  const formatDate = (date: Date) => {
    return formatDateLocale(date, {
      weekday: 'short',
      month: 'short', 
      day: 'numeric'
    });
  };

  const formatVisitTime = (date: Date) => {
    return formatTimeLocale(date);
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
    if (isToday(date)) return { label: t('common:today'), color: 'bg-blue-100 text-blue-800' };
    if (isTomorrow(date)) return { label: t('common:tomorrow'), color: 'bg-green-100 text-green-800' };
    return { label: formatDate(date), color: 'bg-[var(--background)] text-variable' };
  };

  const isHistorical = (dateValue: Date | string) => {
    const date = new Date(dateValue);
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const checkDate = new Date(date);
    checkDate.setHours(0, 0, 0, 0);
    return checkDate < now;
  };

  const getPriorityLevel = (entry: any) => {
    const visitDate = new Date(entry.visitDate || entry.scheduledDate);
    const now = new Date();
    const hoursUntilVisit = (visitDate.getTime() - now.getTime()) / (1000 * 60 * 60);
    
    if (hoursUntilVisit < 0) return { level: 'past', color: 'bg-gray-100 text-gray-500 border-gray-200' };
    if (hoursUntilVisit < 2) return { level: 'urgent', color: 'bg-red-100 text-red-800 border-red-200' };
    if (hoursUntilVisit < 24) return { level: 'high', color: 'bg-orange-100 text-orange-800 border-orange-200' };
    if (hoursUntilVisit < 72) return { level: 'medium', color: 'bg-yellow-100 text-yellow-800 border-yellow-200' };
    return { level: 'normal', color: 'bg-[var(--background)] text-variable border-slate-200' };
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

  const getFilteredDiary = () => {
    if (!receptionDiary) return [];
    
    const { start, end } = getQueryDateAndDays(diaryViewMode, currentDate);
    
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
        return t('common:today');
      } else {
        return formatDateLocale(currentDate, { weekday: 'long', month: 'short', day: 'numeric' });
      }
    } else if (diaryViewMode === 'tomorrow') {
      const targetDate = new Date(currentDate);
      targetDate.setDate(targetDate.getDate() + 1);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      if (targetDate.toDateString() === tomorrow.toDateString()) {
        return t('common:tomorrow');
      } else {
        return formatDateLocale(targetDate, { weekday: 'long', month: 'short', day: 'numeric' });
      }
    } else {
      if (isCurrentWeek) {
        return t('common:thisWeek');
      } else {
        const { start, end } = getQueryDateAndDays(diaryViewMode, currentDate);
        return `${formatDateLocale(start, { month: 'short', day: 'numeric' })} - ${formatDateLocale(end, { month: 'short', day: 'numeric' })}`;
      }
    }
  };

  // Filter contractor diary entries
  const getFilteredContractorDiary = () => {
    if (!contractorDiary) return [];
    const { start, end } = getQueryDateAndDays(diaryViewMode, currentDate);
    return contractorDiary.filter(entry => {
      const scheduledDate = new Date(entry.scheduledDate);
      return scheduledDate >= start && scheduledDate <= end;
    });
  };

  // Group diary entries by date
  const filteredDiary = getFilteredDiary();
  const filteredContractors = getFilteredContractorDiary();
  const groupedDiary = filteredDiary.reduce((groups, entry) => {
    const dateKey = new Date(entry.visitDate).toDateString();
    if (!groups[dateKey]) groups[dateKey] = [];
    groups[dateKey].push(entry);
    return groups;
  }, {} as Record<string, typeof filteredDiary>) || {};
  
  const groupedContractors = filteredContractors.reduce((groups, entry) => {
    const dateKey = new Date(entry.scheduledDate).toDateString();
    if (!groups[dateKey]) groups[dateKey] = [];
    groups[dateKey].push(entry);
    return groups;
  }, {} as Record<string, typeof filteredContractors>) || {};

  const pendingVisitors = filteredDiary.filter(e => !e.isCheckedIn);
  const arrivedVisitors = filteredDiary.filter(e => e.isCheckedIn);
  const pendingContractors = filteredContractors.filter(e => e.status !== 'completed');
  const arrivedContractors = filteredContractors.filter(e => e.status === 'completed');

  const displayedVisitors = showHistory ? filteredDiary : pendingVisitors;
  const displayedContractors = showHistory ? filteredContractors : pendingContractors;
  const displayedMeetings = currentViewRoomBookings;

  const displayedGroupedDiary = displayedVisitors.reduce((groups: Record<string, typeof displayedVisitors>, entry) => {
    const dateKey = new Date(entry.visitDate).toDateString();
    if (!groups[dateKey]) groups[dateKey] = [];
    groups[dateKey].push(entry);
    return groups;
  }, {});

  const displayedGroupedContractors = displayedContractors.reduce((groups: Record<string, typeof displayedContractors>, entry) => {
    const dateKey = new Date(entry.scheduledDate).toDateString();
    if (!groups[dateKey]) groups[dateKey] = [];
    groups[dateKey].push(entry);
    return groups;
  }, {});

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
      default: return 'text-variable';
    }
  };

  // Action handlers for dashboard buttons
  const handleEmergencyMuster = () => {
    setLocation('/muster');
    toast({
      title: t('common:emergency'),
      description: t('dashboard:peopleOnSite:activateEmergency'),
      variant: "destructive"
    });
  };

  const formatTime = (date: string | Date) => {
    return formatTimeLocale(date);
  };

  // Checkout mutations
  const checkoutVisitorMutation = useMutation({
    mutationFn: async (visitorId: string) => {
      const response = await apiRequest("POST", `/api/visitors/${visitorId}/checkout`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/visitors"] });
      queryClient.invalidateQueries({ queryKey: ["/api/visitors/current"] });
      queryClient.invalidateQueries({ queryKey: ["/api/visitors/today"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/activity/recent"] });
      queryClient.invalidateQueries({ queryKey: ["/api/muster"] });
      queryClient.invalidateQueries({ queryKey: ["/api/prebookings/upcoming"] });
      queryClient.invalidateQueries({ queryKey: ["/api/prebookings"] });
      queryClient.invalidateQueries({ queryKey: ["/api/reception/diary"] });
      toast({
        title: t('common:success'),
        description: t('dashboard:modals:visitorDetails:actions:alertReception'),
      });
    },
    onError: () => {
      toast({
        title: t('common:error'),
        description: t('common:failedToLoad'),
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
      queryClient.invalidateQueries({ queryKey: ["/api/contractors/workers/all"] });
      queryClient.invalidateQueries({ queryKey: ["/api/contractors"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/activity/recent"] });
      queryClient.invalidateQueries({ queryKey: ["/api/muster"] });
      queryClient.invalidateQueries({ queryKey: ["/api/reception/diary"] });
      toast({
        title: t('common:success'), 
        description: t('common:checkedOut'),
      });
    },
    onError: () => {
      toast({
        title: t('common:error'),
        description: t('common:failedToLoad'),
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
      queryClient.invalidateQueries({ queryKey: ["/api/muster"] });
      toast({
        title: t('common:success'), 
        description: t('common:checkedOut'),
      });
    },
    onError: () => {
      toast({
        title: t('common:error'),
        description: t('common:failedToLoad'),
        variant: "destructive",
      });
    },
  });

  const checkoutMemberMutation = useMutation({
    mutationFn: async (memberId: string) => {
      const response = await apiRequest("POST", `/api/members/${memberId}/check-out`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/members/checked-in"] });
      queryClient.invalidateQueries({ queryKey: ["/api/members"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/activity/recent"] });
      queryClient.invalidateQueries({ queryKey: ["/api/muster"] });
      toast({
        title: t('common:success'),
        description: t('common:checkedOut'),
      });
    },
    onError: () => {
      toast({
        title: t('common:error'),
        description: t('common:failedToLoad'),
        variant: "destructive",
      });
    },
  });

  const [diaryCancelId, setDiaryCancelId] = useState<{ id: string; type: 'visitor' | 'contractor' } | null>(null);

  const diaryCancelVisitorMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiRequest("DELETE", `/api/prebookings/${id}`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/reception/diary"] });
      queryClient.invalidateQueries({ queryKey: ["/api/prebookings"] });
      queryClient.invalidateQueries({ queryKey: ["/api/prebookings/upcoming"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      toast({ title: t('common:success'), description: t('common:success') });
      setDiaryCancelId(null);
    },
    onError: (error: any) => {
      toast({ title: t('common:error'), description: error?.message || t('common:error'), variant: "destructive" });
      setDiaryCancelId(null);
    },
  });

  const diaryCancelContractorMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiRequest("DELETE", `/api/contractors/prebookings/${id}`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/reception/diary"] });
      queryClient.invalidateQueries({ queryKey: ["/api/contractors/prebookings"] });
      queryClient.invalidateQueries({ queryKey: ["/api/contractors/prebookings/today"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      toast({ title: t('common:success'), description: t('common:success') });
      setDiaryCancelId(null);
    },
    onError: (error: any) => {
      toast({ title: t('common:error'), description: error?.message || t('common:error'), variant: "destructive" });
      setDiaryCancelId(null);
    },
  });

  // Check-in from diary pre-booking (visitor)
  const diaryVisitorCheckInMutation = useMutation({
    mutationFn: async (booking: any) => {
      const response = await apiRequest("POST", "/api/prebookings/manual-checkin", { preBookingId: booking.id });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/reception/diary"] });
      queryClient.invalidateQueries({ queryKey: ["/api/prebookings"] });
      queryClient.invalidateQueries({ queryKey: ["/api/prebookings/upcoming"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/visitors"] });
      queryClient.invalidateQueries({ queryKey: ["/api/visitors/current"] });
      queryClient.invalidateQueries({ queryKey: ["/api/visitors/today"] });
      queryClient.invalidateQueries({ queryKey: ["/api/activity/recent"] });
      toast({ title: t('common:checkedIn'), description: t('common:checkedIn') });
    },
    onError: (error: any) => {
      const message = error?.message || t('common:error');
      toast({ title: t('common:error'), description: message, variant: "destructive" });
    },
  });

  // Check-in from diary pre-booking (contractor)
  const diaryContractorCheckInMutation = useMutation({
    mutationFn: async (booking: any) => {
      const response = await apiRequest("POST", "/api/contractors/prebookings/checkin", { qrCode: booking.qrCode });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/reception/diary"] });
      queryClient.invalidateQueries({ queryKey: ["/api/contractors/prebookings"] });
      queryClient.invalidateQueries({ queryKey: ["/api/contractors/prebookings/today"] });
      queryClient.invalidateQueries({ queryKey: ["/api/contractors/checked-in"] });
      queryClient.invalidateQueries({ queryKey: ["/api/contractors/workers/all"] });
      queryClient.invalidateQueries({ queryKey: ["/api/contractors"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/activity/recent"] });
      toast({ title: t('common:checkedIn'), description: t('common:checkedIn') });
    },
    onError: (error: any) => {
      const message = error?.message || t('common:error');
      toast({ title: t('common:error'), description: message, variant: "destructive" });
    },
  });

  if (statsLoading) {
    return <div>{t('common:loading')}</div>;
  }

  const checklistStepDefs = [
    {
      key: "companyLogoSet" as const,
      label: t('dashboard:gettingStarted:steps:logo'),
      href: "/settings",
    },
    {
      key: "emergencyEmailSet" as const,
      label: t('dashboard:gettingStarted:steps:alertEmail'),
      href: "/settings",
    },
    {
      key: "emailSmtpConfigured" as const,
      label: t('dashboard:gettingStarted:steps:smtp'),
      href: "/settings",
    },
    {
      key: "mustersPointNamed" as const,
      label: t('dashboard:gettingStarted:steps:musterPoints'),
      href: "/settings",
    },
    {
      key: "staffAdded" as const,
      label: t('dashboard:gettingStarted:steps:staff'),
      href: "/staff",
    },
    {
      key: "firstVisitorOrContractor" as const,
      label: t('dashboard:gettingStarted:steps:register'),
      href: "/visitors",
    },
  ];

  const showChecklist =
    checklistStatus && !checklistStatus.dismissed && !checklistStatus.allComplete;

  return (
    <div className="space-y-4 sm:space-y-8 p-3 sm:p-6 rounded-xl bg-background min-h-screen">
      {/* Getting-Started Checklist */}
      {showChecklist && (
        <div className="relative rounded-xl border border-indigo-200 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-950/30 p-4 sm:p-5">
          <button
            onClick={() => dismissChecklistMutation.mutate()}
            className="absolute top-3 right-3 text-indigo-400 hover:text-indigo-600 dark:hover:text-indigo-300 transition-colors"
            aria-label="Dismiss checklist"
          >
            <X size={16} />
          </button>

          <div className="flex items-center gap-2 mb-2">
            <Rocket size={18} className="text-indigo-600 dark:text-indigo-400 flex-shrink-0" />
            <div>
              <h3 className="text-sm font-semibold text-indigo-900 dark:text-indigo-100">
                {t('dashboard:gettingStarted:title', { completed: checklistStatus.completedCount, total: checklistStatus.totalCount })}
              </h3>
              <p className="text-xs text-indigo-500 dark:text-indigo-400 mt-0.5">
                {t('dashboard:gettingStarted:subtitle')}
              </p>
            </div>
          </div>

          <Progress
            value={(checklistStatus.completedCount / checklistStatus.totalCount) * 100}
            className="h-1.5 mb-4 bg-indigo-200 dark:bg-indigo-800 [&>div]:bg-indigo-500"
          />

          <ul className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {checklistStepDefs.map(({ key, label, href }) => {
              const done = checklistStatus.steps[key];
              return (
                <li key={key}>
                  <a
                    href={href}
                    onClick={(e) => { if (done) e.preventDefault(); }}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs transition-colors ${
                      done
                        ? "border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950/30 pointer-events-none"
                        : "border-indigo-200 dark:border-indigo-700 bg-white dark:bg-indigo-900/20 hover:bg-indigo-100 dark:hover:bg-indigo-900/40"
                    }`}
                  >
                    {done ? (
                      <CheckCircle2 size={14} className="text-green-500 flex-shrink-0" />
                    ) : (
                      <Circle size={14} className="text-indigo-400 dark:text-indigo-500 flex-shrink-0" />
                    )}
                    <span
                      className={
                        done
                          ? "text-green-700 dark:text-green-300 line-through"
                          : "text-indigo-900 dark:text-indigo-100 font-medium"
                      }
                    >
                      {label}
                    </span>
                  </a>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* People On-Site Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold text-fixed flex items-center gap-2">
            <Users className="text-blue-600" size={20} />
            {t('peopleOnSite.title')}
          </h2>
          <Button
            onClick={handleEmergencyMuster}
            className="bg-red-600 hover:bg-red-700 text-white gap-2 shadow-sm"
            size="sm"
            data-testid="button-activate-emergency-dashboard"
          >
            <Siren size={15} />
            <span className="hidden sm:inline">{t('peopleOnSite.activateEmergency')}</span>
            <span className="sm:hidden">{t('peopleOnSite.activateEmergency')}</span>
          </Button>
        </div>
        <div className="flex flex-col lg:flex-row gap-6">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-6 flex-1">
            <GlassCard hover className="cursor-pointer" onClick={() => setOpenModal('visitors')}>
              <p className="text-variable text-sm font-medium">{t('peopleOnSite.visitors')}</p>
              <div className="flex items-center gap-3 mt-1">
                <p className="text-2xl sm:text-3xl font-bold text-blue-600 dark:text-blue-400" data-testid="stat-current-visitors">
                  {stats?.currentVisitors || 0}
                </p>
                <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900/30 rounded-xl flex items-center justify-center shrink-0">
                  <User className="text-blue-600 dark:text-blue-400" size={20} />
                </div>
              </div>
            </GlassCard>
            
            <GlassCard hover className="cursor-pointer" onClick={() => setOpenModal('staff')}>
              <p className="text-variable text-sm font-medium">{t('peopleOnSite.staff')}</p>
              <div className="flex items-center gap-3 mt-1">
                <p className="text-2xl sm:text-3xl font-bold text-purple-600 dark:text-purple-400" data-testid="stat-staff-onsite">
                  {stats?.staffOnSite || 0}
                </p>
                <div className="w-10 h-10 bg-purple-100 dark:bg-purple-900/30 rounded-xl flex items-center justify-center shrink-0">
                  <Users className="text-purple-600 dark:text-purple-400" size={20} />
                </div>
              </div>
            </GlassCard>
            
            <GlassCard hover className="cursor-pointer" onClick={() => setOpenModal('contractors')}>
              <p className="text-variable text-sm font-medium">{t('peopleOnSite.contractors')}</p>
              <div className="flex items-center gap-3 mt-1">
                <p className="text-2xl sm:text-3xl font-bold text-orange-600 dark:text-orange-400" data-testid="stat-contractors-onsite">
                  {stats?.contractorsOnSite || 0}
                </p>
                <div className="w-10 h-10 bg-orange-100 dark:bg-orange-900/30 rounded-xl flex items-center justify-center shrink-0">
                  <HardHat className="text-orange-600 dark:text-orange-400" size={20} />
                </div>
              </div>
            </GlassCard>

            {stats?.featureMembers && (
              <GlassCard hover className="cursor-pointer" onClick={() => setOpenModal('members')}>
                <p className="text-variable text-sm font-medium">{t('peopleOnSite.members')}</p>
                <div className="flex items-center gap-3 mt-1">
                  <p className="text-2xl sm:text-3xl font-bold text-purple-600 dark:text-purple-400" data-testid="stat-members-onsite">
                    {stats?.membersOnSite || 0}
                  </p>
                  <div className="w-10 h-10 bg-purple-100 dark:bg-purple-900/30 rounded-xl flex items-center justify-center shrink-0">
                    <UserCheck className="text-purple-600 dark:text-purple-400" size={20} />
                  </div>
                </div>
              </GlassCard>
            )}
          </div>

          <GlassCard hover className="cursor-pointer bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-emerald-900/20 dark:to-teal-900/20 border border-slate-200 dark:border-slate-800 lg:w-56 shrink-0" onClick={() => setOpenModal('total-people')}>
            <p className="text-emerald-700 dark:text-emerald-300 text-sm font-semibold">{t('peopleOnSite.totalPeople')}</p>
            <div className="flex items-center gap-3 mt-1">
              <p className="text-4xl font-bold text-emerald-700 dark:text-emerald-300" data-testid="stat-total-people-onsite">
                {stats?.totalPeopleOnSite || 0}
              </p>
              <div className="w-10 h-10 bg-emerald-200 dark:bg-emerald-800/50 rounded-xl flex items-center justify-center shrink-0">
                <Users className="text-emerald-700 dark:text-emerald-300" size={20} />
              </div>
            </div>
            <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-1">{t('peopleOnSite.onSiteNow')}</p>
          </GlassCard>
        </div>
      </div>

      {/* Lone Worker Protection Widget */}
      {activeLoneWorkers.length > 0 && (
        <GlassCard className="bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20 border-2 border-amber-200 dark:border-amber-800">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-amber-200 dark:bg-amber-800/50 rounded-xl flex items-center justify-center">
                <Shield className="text-amber-700 dark:text-amber-300" size={22} />
              </div>
              <div>
                <h3 className="text-base font-bold text-amber-800 dark:text-amber-200">{t('dashboard:loneWorker.title')}</h3>
                <p className="text-xs text-amber-600 dark:text-amber-400">{t('dashboard:loneWorker.active', { count: activeLoneWorkers.length })}</p>
              </div>
            </div>
            <span className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-200 dark:bg-amber-800/60 text-amber-800 dark:text-amber-200 rounded-full text-xs font-semibold animate-pulse">
              <span className="w-1.5 h-1.5 bg-amber-600 rounded-full" />
              {t('common:liveLabel')}
            </span>
          </div>
          <div className="space-y-2">
            {activeLoneWorkers.map((session: any) => {
              const hasDeadline = !!session.nextDeadline;
              const deadline = hasDeadline ? new Date(session.nextDeadline) : null;
              const now = new Date();
              const minsLeft = deadline ? Math.round((deadline.getTime() - now.getTime()) / 60000) : null;
              const isOverdue = minsLeft !== null && minsLeft < 0;
              const isApproaching = minsLeft !== null && minsLeft >= 0 && minsLeft <= 5;
              const isEscalated = session.escalationLevel > 0;
              const rowColor = isEscalated
                ? 'bg-red-100 dark:bg-red-900/30 border border-red-300 dark:border-red-700'
                : (isOverdue || isApproaching)
                  ? 'bg-amber-100 dark:bg-amber-900/30 border border-amber-300 dark:border-amber-700'
                  : 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800';
              const iconColor = isEscalated ? 'text-red-600' : (isOverdue || isApproaching) ? 'text-amber-600' : 'text-green-600';
              const badgeColor = isEscalated
                ? 'bg-red-200 text-red-800 dark:bg-red-800/60 dark:text-red-200'
                : (isOverdue || isApproaching)
                  ? 'bg-amber-200 text-amber-800 dark:bg-amber-800/60 dark:text-amber-200'
                  : 'bg-green-100 text-green-800 dark:bg-green-800/60 dark:text-green-200';
              return (
                <div key={session.id} className={`flex items-center justify-between px-3 py-2 rounded-lg ${rowColor}`}>
                  <div className="flex items-center gap-2 min-w-0">
                    <Shield size={14} className={iconColor} />
                    <span className="font-medium text-sm text-fixed truncate">{session.personName}</span>
                    <span className="text-xs text-variable hidden sm:block capitalize">({t(`common:type.${session.personType}` as any)})</span>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {isEscalated && (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-red-600 text-white animate-pulse">L{session.escalationLevel} {t('dashboard:loneWorker.overdue').toUpperCase()}</span>
                    )}
                    <span className="text-xs text-variable hidden sm:block">{session.minutesSinceStart}m ago</span>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${badgeColor}`}>
                      {minsLeft !== null ? (isOverdue ? `${Math.abs(minsLeft)}m ${t('dashboard:loneWorker.overdue')}` : t('dashboard:loneWorker.nextIn', { n: minsLeft })) : t('dashboard:loneWorker.checking')}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </GlassCard>
      )}

      {/* Fire Risk Assessment Compliance Widget */}
      {fraStatus && (
        <GlassCard
          hover
          className={`cursor-pointer border-2 ${
            fraStatus.overallStatus === 'critical'
              ? 'bg-gradient-to-br from-red-50 to-orange-50 dark:from-red-900/20 dark:to-orange-900/20 border-red-300 dark:border-red-700'
              : fraStatus.overallStatus === 'action_required'
              ? 'bg-gradient-to-br from-amber-50 to-yellow-50 dark:from-amber-900/20 dark:to-yellow-900/20 border-amber-300 dark:border-amber-700'
              : fraStatus.overallStatus === 'no_fra'
              ? 'bg-gradient-to-br from-red-50 to-rose-50 dark:from-red-900/20 dark:to-rose-900/20 border-red-400 dark:border-red-600'
              : 'bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 border-green-300 dark:border-green-700'
          }`}
          onClick={() => setLocation('/fire-risk-assessment')}
        >
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                fraStatus.overallStatus === 'critical' || fraStatus.overallStatus === 'no_fra'
                  ? 'bg-red-200 dark:bg-red-800/50'
                  : fraStatus.overallStatus === 'action_required'
                  ? 'bg-amber-200 dark:bg-amber-800/50'
                  : 'bg-green-200 dark:bg-green-800/50'
              }`}>
                <Flame className={`${
                  fraStatus.overallStatus === 'critical' || fraStatus.overallStatus === 'no_fra'
                    ? 'text-red-700 dark:text-red-300'
                    : fraStatus.overallStatus === 'action_required'
                    ? 'text-amber-700 dark:text-amber-300'
                    : 'text-green-700 dark:text-green-300'
                }`} size={20} />
              </div>
              <div>
                <p className={`font-semibold text-sm ${
                  fraStatus.overallStatus === 'critical' || fraStatus.overallStatus === 'no_fra'
                    ? 'text-red-800 dark:text-red-200'
                    : fraStatus.overallStatus === 'action_required'
                    ? 'text-amber-800 dark:text-amber-200'
                    : 'text-green-800 dark:text-green-200'
                }`}>
                  {fraStatus.overallStatus === 'no_fra' && `🚨 ${t('common:none')} ${t('dashboard:fireRisk.title')}`}
                  {fraStatus.overallStatus === 'critical' && fraStatus.isOverdue && `🚨 ${t('dashboard:fireRisk.title')} — ${t('dashboard:loneWorker.overdue')}`}
                  {fraStatus.overallStatus === 'critical' && !fraStatus.isOverdue && `🚨 ${t('dashboard:fireRisk.title')} — ${fraStatus.actionItems.critical_outstanding} Critical Actions Outstanding`}
                  {fraStatus.overallStatus === 'action_required' && `⚠ ${t('dashboard:fireRisk.title')} — Actions Outstanding`}
                  {fraStatus.overallStatus === 'compliant' && `✅ ${t('dashboard:fireRisk.title')} — ${t('common:active')}`}
                </p>
                <p className={`text-xs mt-0.5 ${
                  fraStatus.overallStatus === 'critical' || fraStatus.overallStatus === 'no_fra'
                    ? 'text-red-600 dark:text-red-400'
                    : fraStatus.overallStatus === 'action_required'
                    ? 'text-amber-600 dark:text-amber-400'
                    : 'text-green-600 dark:text-green-400'
                }`}>
                  {fraStatus.overallStatus === 'no_fra' && 'This is a legal requirement under RRO 2005 →'}
                  {fraStatus.overallStatus === 'critical' && fraStatus.isOverdue && `${t('dashboard:loneWorker.overdue')} by ${Math.abs(fraStatus.daysUntilReview!)} day${Math.abs(fraStatus.daysUntilReview!) !== 1 ? 's' : ''} →`}
                  {fraStatus.overallStatus === 'critical' && !fraStatus.isOverdue && `${fraStatus.actionItems.outstanding} action item${fraStatus.actionItems.outstanding !== 1 ? 's' : ''} outstanding →`}
                  {fraStatus.overallStatus === 'action_required' && `${fraStatus.actionItems.outstanding} action item${fraStatus.actionItems.outstanding !== 1 ? 's' : ''} need attention →`}
                  {fraStatus.overallStatus === 'compliant' && fraStatus.daysUntilReview !== null && `Next review: ${fraStatus.currentFRA ? formatDateLocale(fraStatus.currentFRA.nextReviewDate) : '—'} · All actions resolved`}
                </p>
              </div>
            </div>
            {fraStatus.overallStatus !== 'no_fra' && fraStatus.actionItems.outstanding > 0 && (
              <span className={`text-lg font-bold shrink-0 ${
                fraStatus.overallStatus === 'critical' ? 'text-red-700 dark:text-red-300' : 'text-amber-700 dark:text-amber-300'
              }`}>
                {fraStatus.actionItems.outstanding}
              </span>
            )}
          </div>
        </GlassCard>
      )}

      {/* Reception Diary - Comprehensive Operations Overview */}
      <GlassCard className="bg-gradient-to-br from-indigo-50 to-purple-50 dark:from-indigo-900/20 dark:to-purple-900/20 border-2 border-indigo-200 dark:border-indigo-800">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-0 mb-6">
          <div className="flex items-center">
            <CalendarDays className="mr-2 sm:mr-3 text-indigo-600 dark:text-indigo-400 flex-shrink-0" size={28} />
            <div>
              <h3 className="text-lg sm:text-xl font-bold text-indigo-800 dark:text-indigo-200">{t('dashboard:receptionDiary.title')}</h3>
              <p className="text-xs sm:text-sm text-indigo-600 dark:text-indigo-400 hidden sm:block">{t('dashboard:receptionDiary.subtitle')}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="outline" className="bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800 text-xs">
              {pendingVisitors.length} {t('dashboard:receptionDiary.status.pending')}
            </Badge>
            <Badge variant="outline" className="bg-orange-50 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 border-orange-200 dark:border-orange-800 text-xs">
              {pendingContractors.length} {t('dashboard:receptionDiary.filters.contractors')}
            </Badge>
            <Badge variant="outline" className="bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300 border-green-200 dark:border-green-800 text-xs">
              {arrivedVisitors.length + arrivedContractors.length} {t('dashboard:receptionDiary.status.arrived')}
            </Badge>
            <Badge variant="outline" className="bg-purple-50 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800 text-xs">
              {currentViewRoomBookings?.length || 0} {t('dashboard:receptionDiary.filters.meetings')}
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
                setShowHistory(false);
                setDiaryFilter('all');
              }}
              className="text-xs flex-1 sm:flex-initial"
              data-testid="button-diary-today"
            >
              {t('dashboard:receptionDiary.tabs.today')}
            </Button>
            <Button
              variant={diaryViewMode === 'tomorrow' ? 'default' : 'outline'}
              size="sm"
              onClick={() => {
                setDiaryViewMode('tomorrow');
                setCurrentDate(new Date());
                setShowHistory(false);
                setDiaryFilter('all');
              }}
              className="text-xs flex-1 sm:flex-initial"
              data-testid="button-diary-tomorrow"
            >
              {t('dashboard:receptionDiary.tabs.tomorrow')}
            </Button>
            <Button
              variant={diaryViewMode === 'weekly' ? 'default' : 'outline'}
              size="sm"
              onClick={() => {
                setDiaryViewMode('weekly');
                setCurrentDate(new Date());
                setShowHistory(false);
                setDiaryFilter('all');
              }}
              className="text-xs flex-1 sm:flex-initial"
              data-testid="button-diary-weekly"
            >
              {t('dashboard:receptionDiary.tabs.weekly')}
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

            <div className="border-l border-indigo-300 dark:border-indigo-700 h-6 mx-1 hidden sm:block" />
            <Button
              variant={diaryLayout === 'cards' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setDiaryLayout('cards')}
              className="h-8 w-8 p-0 hidden sm:flex"
              title={t('dashboard:receptionDiary.viewCard')}
            >
              <LayoutGrid size={14} />
            </Button>
            <Button
              variant={diaryLayout === 'compact' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setDiaryLayout('compact')}
              className="h-8 w-8 p-0 hidden sm:flex"
              title={t('dashboard:receptionDiary.viewCompact')}
            >
              <LayoutList size={14} />
            </Button>
            <div className="border-l border-indigo-300 dark:border-indigo-700 h-6 mx-1 hidden sm:block" />
            <Button
              variant={showHistory ? 'default' : 'outline'}
              size="sm"
              onClick={() => setShowHistory(!showHistory)}
              className={`h-8 px-3 text-xs ${showHistory ? 'bg-green-600 hover:bg-green-700 text-white' : ''}`}
              title={showHistory ? t('dashboard:receptionDiary.hideHistory') : t('dashboard:receptionDiary.showHistory')}
            >
              <Clock3 size={14} className="mr-1" />
              {showHistory ? t('dashboard:receptionDiary.hideHistory') : t('dashboard:receptionDiary.showHistory')}
            </Button>
          </div>
        </div>

        {/* Quick Summary Bar */}
        {((filteredDiary && filteredDiary.length > 0) || (filteredContractors && filteredContractors.length > 0) || (todayRoomBookings && todayRoomBookings.length > 0)) && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            <div 
              className={`bg-indigo-50 dark:bg-indigo-900/20 p-3 rounded-xl border cursor-pointer transition-all ${diaryFilter === 'visitors' ? 'border-indigo-500 ring-2 ring-indigo-300 dark:ring-indigo-700 shadow-md' : 'border-indigo-200 dark:border-indigo-800 hover:shadow-sm'}`}
              onClick={() => setDiaryFilter(diaryFilter === 'visitors' ? 'all' : 'visitors')}
            >
              <div className="flex items-center gap-2">
                <Users className="text-indigo-600" size={18} />
                <div>
                  <div className="text-lg font-bold text-indigo-800 dark:text-indigo-200">
                    {pendingVisitors.length}
                  </div>
                  <div className="text-xs text-indigo-600 dark:text-indigo-400">{t('dashboard:receptionDiary.filters.visitors')}</div>
                </div>
              </div>
            </div>
            
            <div 
              className={`bg-orange-50 dark:bg-orange-900/20 p-3 rounded-xl border cursor-pointer transition-all ${diaryFilter === 'contractors' ? 'border-orange-500 ring-2 ring-orange-300 dark:ring-orange-700 shadow-md' : 'border-orange-200 dark:border-orange-800 hover:shadow-sm'}`}
              onClick={() => setDiaryFilter(diaryFilter === 'contractors' ? 'all' : 'contractors')}
            >
              <div className="flex items-center gap-2">
                <HardHat className="text-orange-600" size={18} />
                <div>
                  <div className="text-lg font-bold text-orange-800 dark:text-orange-200">
                    {pendingContractors.length}
                  </div>
                  <div className="text-xs text-orange-600 dark:text-orange-400">{t('dashboard:receptionDiary.filters.contractors')}</div>
                </div>
              </div>
            </div>
            
            <div 
              className={`bg-purple-50 dark:bg-purple-900/20 p-3 rounded-xl border cursor-pointer transition-all ${diaryFilter === 'meetings' ? 'border-purple-500 ring-2 ring-purple-300 dark:ring-purple-700 shadow-md' : 'border-purple-200 dark:border-purple-800 hover:shadow-sm'}`}
              onClick={() => setDiaryFilter(diaryFilter === 'meetings' ? 'all' : 'meetings')}
            >
              <div className="flex items-center gap-2">
                <Calendar className="text-purple-600" size={18} />
                <div>
                  <div className="text-lg font-bold text-purple-800 dark:text-purple-200">
                    {currentViewRoomBookings?.length || 0}
                  </div>
                  <div className="text-xs text-purple-600 dark:text-purple-400">{t('dashboard:receptionDiary.filters.meetings')}</div>
                </div>
              </div>
            </div>
            
            <div 
              className={`bg-green-50 dark:bg-green-900/20 p-3 rounded-xl border cursor-pointer transition-all ${showHistory ? 'border-green-500 ring-2 ring-green-300 dark:ring-green-700 shadow-md' : 'border-green-200 dark:border-green-800 hover:shadow-sm'}`}
              onClick={() => setShowHistory(!showHistory)}
            >
              <div className="flex items-center gap-2">
                <CheckCircle2 className="text-green-600" size={18} />
                <div>
                  <div className="text-lg font-bold text-green-800 dark:text-green-200">
                    {arrivedVisitors.length + arrivedContractors.length}
                  </div>
                  <div className="text-xs text-green-600 dark:text-green-400">
                    {showHistory ? t('dashboard:receptionDiary.hideHistory') : t('dashboard:receptionDiary.status.arrived')}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="space-y-6 max-h-96 overflow-y-auto scrollbar-thin">
          {diaryLoading ? (
            <div className="text-center py-8 text-variable">
              <Calendar className="mx-auto mb-3 text-variable" size={40} />
              <p>{t('dashboard:receptionDiary.loading')}</p>
            </div>
          ) : (!filteredDiary || filteredDiary.length === 0) && (!filteredContractors || filteredContractors.length === 0) && (!currentViewRoomBookings || currentViewRoomBookings.length === 0) ? (
            <div className="text-center py-8 text-variable">
              <CalendarDays className="mx-auto mb-3 text-variable" size={40} />
              <p className="font-medium">{t('dashboard:receptionDiary.noActivities', { period: getViewTitle().toLowerCase() })}</p>
              <p className="text-sm mt-2">{t('dashboard:receptionDiary.noActivitiesDesc')}</p>
            </div>
          ) : diaryLayout === 'compact' ? (
            /* Compact List View - All events in unified sorted rows */
            <div className="space-y-1">
              {(() => {
                const allEvents: Array<{
                  id: string;
                  type: 'visitor' | 'contractor' | 'meeting';
                  name: string;
                  company: string;
                  host: string;
                  time: string;
                  sortTime: string;
                  date: Date;
                  status: string;
                  isCheckedIn: boolean;
                  raw: any;
                }> = [];

                // Add visitor pre-bookings
                filteredDiary?.forEach(entry => {
                  const visitTime = new Date(entry.visitDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                  allEvents.push({
                    id: `v-${entry.id}`,
                    type: 'visitor',
                    name: `${entry.visitorFirstName} ${entry.visitorLastName}`,
                    company: entry.company || '',
                    host: entry.hostFirstName && entry.hostLastName ? `${entry.hostFirstName} ${entry.hostLastName}` : '',
                    time: visitTime,
                    sortTime: new Date(entry.visitDate).toISOString(),
                    date: new Date(entry.visitDate),
                    status: entry.isCheckedIn ? 'checked-in' : 'pending',
                    isCheckedIn: !!entry.isCheckedIn,
                    raw: entry,
                  });
                });

                // Add contractor pre-bookings
                filteredContractors?.forEach(entry => {
                  allEvents.push({
                    id: `c-${entry.id}`,
                    type: 'contractor',
                    name: entry.workerName,
                    company: entry.companyName,
                    host: entry.hostFirstName && entry.hostLastName ? `${entry.hostFirstName} ${entry.hostLastName}` : (entry.hostName || ''),
                    time: entry.scheduledTime,
                    sortTime: `${formatLocalDate(new Date(entry.scheduledDate))}T${entry.scheduledTime}`,
                    date: new Date(entry.scheduledDate),
                    status: entry.status || 'pending',
                    isCheckedIn: entry.status === 'completed',
                    raw: entry,
                  });
                });

                // Add meetings
                currentViewRoomBookings?.forEach(booking => {
                  allEvents.push({
                    id: `m-${booking.id}`,
                    type: 'meeting',
                    name: booking.title || 'Meeting',
                    company: booking.roomName || '',
                    host: booking.organizer || '',
                    time: booking.startTime || '',
                    sortTime: booking.startTime || '',
                    date: booking.date ? new Date(booking.date) : new Date(),
                    status: 'scheduled',
                    isCheckedIn: false,
                    raw: booking,
                  });
                });

                allEvents.sort((a, b) => a.sortTime.localeCompare(b.sortTime));

                const displayEvents = allEvents.filter(e => {
                  if (!showHistory && e.isCheckedIn) return false;
                  if (diaryFilter === 'visitors') return e.type === 'visitor';
                  if (diaryFilter === 'contractors') return e.type === 'contractor';
                  if (diaryFilter === 'meetings') return e.type === 'meeting';
                  return true;
                });

                if (displayEvents.length === 0) return (
                  <div className="text-center py-6 text-variable">
                    <p className="text-sm">{showHistory ? 'No events scheduled' : 'No pending arrivals'}</p>
                    {!showHistory && (arrivedVisitors.length > 0 || arrivedContractors.length > 0) && (
                      <Button variant="ghost" size="sm" onClick={() => setShowHistory(true)} className="mt-2 text-xs text-green-600">
                        Show {arrivedVisitors.length + arrivedContractors.length} arrived
                      </Button>
                    )}
                  </div>
                );

                return (
                  <div className="border rounded-lg overflow-hidden">
                    <div className="hidden sm:grid grid-cols-[60px_1fr_1fr_1fr_70px_80px_90px] sm:grid-cols-[70px_1fr_1fr_1fr_80px_90px_100px] gap-1 px-3 py-2 bg-indigo-100 dark:bg-indigo-900/40 text-xs font-semibold text-indigo-800 dark:text-indigo-200">
                      <span>Time</span>
                      <span>Name</span>
                      <span>Company</span>
                      <span>Host</span>
                      <span>Type</span>
                      <span>Status</span>
                      <span className="text-right">Action</span>
                    </div>
                    {displayEvents.map(event => {
                      const isPast = isHistorical(event.date);
                      return (
                        <div
                          key={event.id}
                          className={`grid grid-cols-[60px_1fr_1fr_1fr_70px_80px_90px] sm:grid-cols-[70px_1fr_1fr_1fr_80px_90px_100px] gap-1 px-3 py-2 border-t text-xs items-center ${isPast ? 'opacity-50 bg-gray-50 dark:bg-gray-800/30' : 'hover:bg-white/60 dark:hover:bg-slate-800/60'}`}
                        >
                          <span className="font-medium text-fixed">{event.time}</span>
                          <span className="truncate font-medium text-fixed">{event.name}</span>
                          <span className="truncate text-variable">{event.company}</span>
                          <span className="truncate text-variable">{event.host || '—'}</span>
                          <Badge className={`text-[10px] px-1.5 py-0 ${event.type === 'visitor' ? 'bg-indigo-100 text-indigo-700' : event.type === 'contractor' ? 'bg-orange-100 text-orange-700' : 'bg-purple-100 text-purple-700'}`}>
                            {event.type === 'visitor' ? 'Visitor' : event.type === 'contractor' ? 'Contractor' : 'Meeting'}
                          </Badge>
                          <Badge className={`text-[10px] px-1.5 py-0 ${event.isCheckedIn ? 'bg-green-100 text-green-700' : event.status === 'confirmed' ? 'bg-blue-100 text-blue-700' : 'bg-yellow-100 text-yellow-700'}`}>
                            {event.isCheckedIn ? 'Arrived' : event.status === 'confirmed' ? 'Confirmed' : 'Pending'}
                          </Badge>
                          <div className="flex justify-end gap-1">
                            {!isPast && !event.isCheckedIn && event.type !== 'meeting' && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-6 px-2 text-[10px] text-green-600 border-green-300 hover:bg-green-50"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (event.type === 'visitor') {
                                    diaryVisitorCheckInMutation.mutate(event.raw);
                                  } else {
                                    diaryContractorCheckInMutation.mutate(event.raw);
                                  }
                                }}
                                disabled={diaryVisitorCheckInMutation.isPending || diaryContractorCheckInMutation.isPending}
                              >
                                <LogIn size={10} className="mr-0.5" />
                                Check In
                              </Button>
                            )}
                            {!isPast && !event.isCheckedIn && event.type !== 'meeting' && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-6 px-2 text-[10px] text-red-600 border-red-300 hover:bg-red-50"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const rawId = event.raw?.id || event.id.replace(/^[vc]-/, '');
                                  setDiaryCancelId({ id: rawId, type: event.type as 'visitor' | 'contractor' });
                                }}
                                disabled={diaryCancelVisitorMutation.isPending || diaryCancelContractorMutation.isPending}
                              >
                                <Trash2 size={10} className="mr-0.5" />
                                Cancel
                              </Button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </div>
          ) : (
            <div className="space-y-4">
              {/* Meeting Room Bookings for Current View */}
              {displayedMeetings && displayedMeetings.length > 0 && (diaryFilter === 'all' || diaryFilter === 'meetings') && (
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <Badge className="bg-purple-100 text-purple-800 border-purple-200 font-medium">
                      {diaryViewMode === 'today' ? "Today's" : diaryViewMode === 'tomorrow' ? "Tomorrow's" : "Scheduled"} Meetings
                    </Badge>
                    <span className="text-xs text-variable">
                      {displayedMeetings.length} meeting{displayedMeetings.length !== 1 ? 's' : ''}
                    </span>
                  </div>
                  
                  <div className="space-y-2 pl-4 border-l-2 border-purple-200 dark:border-purple-800">
                    {displayedMeetings
                      .sort((a, b) => new Date(`${a.date}T${a.startTime}`).getTime() - new Date(`${b.date}T${b.startTime}`).getTime())
                      .map((booking) => {
                        const meetingPast = booking.date ? isHistorical(booking.date) : false;
                        return (
                        <div
                          key={booking.id}
                          className={`p-4 rounded-xl border ${meetingPast ? 'bg-gray-100 dark:bg-gray-800/50 border-gray-200 dark:border-gray-700 opacity-60' : 'border-purple-200 bg-white/70 dark:bg-slate-800/70 hover:bg-white/90 dark:hover:bg-slate-700/90 cursor-pointer'} transition-colors`}
                          data-testid={`meeting-${booking.id}`}
                          onClick={() => {
                            if (meetingPast) return;
                            setSelectedMeetingBooking(booking);
                            setOpenModal('meeting-booking-details');
                          }}
                          style={meetingPast ? { pointerEvents: 'none' as const } : {}}
                        >
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-2">
                                <div className="flex items-center gap-1">
                                  <Calendar className="text-purple-600" size={16} />
                                  <span className="font-semibold text-fixed">
                                    {booking.title}
                                  </span>
                                </div>
                              </div>
                              
                              <div className="space-y-1 text-xs sm:text-sm">
                                <div className="flex items-center gap-2 text-variable">
                                  <Building2 size={14} className="flex-shrink-0" />
                                  <span className="truncate">{booking.roomName}</span>
                                </div>
                                <div className="flex items-center gap-2 text-variable">
                                  <UserCheck size={14} className="flex-shrink-0" />
                                  <span className="truncate">Host: {booking.organizer}</span>
                                </div>
                                <div className="flex items-center gap-2 text-variable">
                                  <Users size={14} className="flex-shrink-0" />
                                  <span>{booking.expectedAttendees || 0} attendees</span>
                                </div>
                                {booking.description && (
                                  <div className="flex items-center gap-2 text-variable">
                                    <AtSign size={14} className="flex-shrink-0" />
                                    <span className="line-clamp-1">{booking.description}</span>
                                  </div>
                                )}
                              </div>
                            </div>
                            
                            <div className="text-right">
                              {diaryViewMode === 'weekly' && booking.date && (
                                <div className="text-xs text-variable mb-0.5">
                                  {new Date(booking.date).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}
                                </div>
                              )}
                              <div className="text-sm font-medium text-fixed">
                                {booking.startTime} - {booking.endTime}
                              </div>
                              {meetingPast && (
                                <Badge className="bg-gray-200 text-gray-500 text-xs mt-1">
                                  Past
                                </Badge>
                              )}
                              {!meetingPast && (
                                <Badge className="bg-purple-100 text-purple-800 text-xs mt-1">
                                  Meeting
                                </Badge>
                              )}
                            </div>
                          </div>
                        </div>
                      );})}
                  </div>
                </div>
              )}

              {/* Contractor Pre-bookings */}
              {displayedContractors && displayedContractors.length > 0 && (diaryFilter === 'all' || diaryFilter === 'contractors') && Object.entries(displayedGroupedContractors)
                .sort(([a], [b]) => new Date(a).getTime() - new Date(b).getTime())
                .map(([dateKey, contractors]) => {
                  const date = new Date(dateKey);
                  const dayStatus = getDayStatus(date);
                  
                  return (
                    <div key={`contractor-${dateKey}`} className="space-y-3">
                      <div className="flex items-center gap-3">
                        <Badge className="bg-orange-100 text-orange-800 border-orange-200 font-medium">
                          {dayStatus.label} - Contractors
                        </Badge>
                        <span className="text-xs text-variable">
                          {contractors.length} contractor{contractors.length !== 1 ? 's' : ''}
                        </span>
                      </div>
                      
                      <div className="space-y-2 pl-4 border-l-2 border-orange-200 dark:border-orange-800">
                        {contractors
                          .sort((a, b) => a.scheduledTime.localeCompare(b.scheduledTime))
                          .map((contractor) => {
                            const isPast = isHistorical(contractor.scheduledDate);
                            
                            return (
                              <div
                                key={contractor.id}
                                className={`p-4 rounded-xl border ${isPast ? 'bg-gray-100 dark:bg-gray-800/50 border-gray-200 dark:border-gray-700 opacity-60' : 'bg-white/70 dark:bg-slate-800/70 border-orange-200 dark:border-orange-800'} transition-colors`}
                                data-testid={`contractor-entry-${contractor.id}`}
                                style={isPast ? { pointerEvents: 'none' as const } : {}}
                              >
                                <div className="flex items-start justify-between">
                                  <div className="flex-1">
                                    <div className="flex items-center gap-2 mb-2">
                                      <div className="flex items-center gap-1">
                                        <HardHat className={isPast ? "text-gray-400" : "text-orange-600"} size={16} />
                                        <span className={`font-semibold ${isPast ? 'text-gray-500' : 'text-fixed'}`}>
                                          {contractor.workerName}
                                        </span>
                                      </div>
                                    </div>
                                    
                                    <div className="space-y-1 text-xs sm:text-sm">
                                      <div className={`flex items-center gap-2 ${isPast ? 'text-gray-400' : 'text-variable'}`}>
                                        <Building2 size={14} className="flex-shrink-0" />
                                        <span className="truncate">{contractor.companyName}</span>
                                      </div>
                                      <div className={`flex items-center gap-2 ${isPast ? 'text-gray-400' : 'text-variable'}`}>
                                        <AtSign size={14} className="flex-shrink-0" />
                                        <span className="line-clamp-1">{contractor.purpose}</span>
                                      </div>
                                      {(contractor.hostFirstName || contractor.hostName) && (
                                        <div className={`flex items-center gap-2 ${isPast ? 'text-gray-400' : 'text-variable'}`}>
                                          <User size={14} className="flex-shrink-0" />
                                          <span className="truncate">Host: {contractor.hostFirstName && contractor.hostLastName ? `${contractor.hostFirstName} ${contractor.hostLastName}` : contractor.hostName}</span>
                                        </div>
                                      )}
                                      {contractor.workerEmail && (
                                        <div className={`flex items-center gap-2 ${isPast ? 'text-gray-400' : 'text-variable'}`}>
                                          <Mail size={14} className="flex-shrink-0" />
                                          <span className="truncate">{contractor.workerEmail}</span>
                                        </div>
                                      )}
                                      {contractor.duration && (
                                        <div className={`flex items-center gap-2 ${isPast ? 'text-gray-400' : 'text-variable'}`}>
                                          <Clock3 size={14} className="flex-shrink-0" />
                                          <span>{contractor.duration}h duration</span>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                  
                                  <div className="text-right">
                                    {diaryViewMode === 'weekly' && (
                                      <div className="text-xs text-variable mb-0.5">
                                        {new Date(contractor.scheduledDate).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}
                                      </div>
                                    )}
                                    <div className={`text-sm font-medium ${isPast ? 'text-gray-500' : 'text-fixed'}`}>
                                      {contractor.scheduledTime}
                                    </div>
                                    {isPast && (
                                      <Badge className="bg-gray-200 text-gray-500 text-xs mt-1">
                                        Past
                                      </Badge>
                                    )}
                                    {contractor.status === 'confirmed' && !isPast && (
                                      <Badge className="bg-green-100 text-green-800 text-xs mt-1">
                                        Confirmed
                                      </Badge>
                                    )}
                                    {contractor.status === 'pending' && !isPast && (
                                      <Badge className="bg-yellow-100 text-yellow-800 text-xs mt-1">
                                        Pending
                                      </Badge>
                                    )}
                                    {!isPast && contractor.status !== 'completed' && (
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        className="h-7 px-2 text-xs text-green-600 border-green-300 hover:bg-green-50 mt-1"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          diaryContractorCheckInMutation.mutate(contractor);
                                        }}
                                        disabled={diaryContractorCheckInMutation.isPending}
                                      >
                                        <LogIn size={12} className="mr-1" />
                                        Check In
                                      </Button>
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

              {/* Visitor Pre-bookings */}
              {displayedVisitors && displayedVisitors.length > 0 && (diaryFilter === 'all' || diaryFilter === 'visitors') && Object.entries(displayedGroupedDiary)
                .sort(([a], [b]) => new Date(a).getTime() - new Date(b).getTime())
                .slice(0, diaryViewMode === 'weekly' ? 7 : 4)
                .map(([dateKey, entries]) => {
                  const date = new Date(dateKey);
                  const dayStatus = getDayStatus(date);
                  
                  return (
                    <div key={dateKey} className="space-y-3">
                      <div className="flex items-center gap-3">
                        <Badge className={`${dayStatus.color} font-medium`}>
                          {dayStatus.label} - Visitors
                        </Badge>
                        <span className="text-xs text-variable">
                          {entries.length} visit{entries.length !== 1 ? 's' : ''}
                        </span>
                      </div>
                      
                      <div className="space-y-2 pl-4 border-l-2 border-indigo-200 dark:border-indigo-800">
                        {entries
                          .sort((a, b) => new Date(a.visitDate).getTime() - new Date(b.visitDate).getTime())
                          .map((entry) => {
                            const priority = getPriorityLevel(entry);
                            const visitTime = getVisitDisplayTime(entry);
                            const isPast = isHistorical(entry.visitDate);
                            
                            return (
                              <div
                                key={entry.id}
                                className={`p-4 rounded-xl border ${isPast ? 'bg-gray-100 dark:bg-gray-800/50 border-gray-200 dark:border-gray-700 opacity-60' : `${priority.color} bg-white/70 dark:bg-slate-800/70 hover:bg-white/90 dark:hover:bg-slate-700/90 cursor-pointer`} transition-colors`}
                                data-testid={`diary-entry-${entry.id}`}
                                onClick={() => {
                                  if (isPast) return;
                                  setSelectedVisitorBooking(entry);
                                  setOpenModal('visitor-booking-details');
                                }}
                                style={isPast ? { pointerEvents: 'none' as const } : {}}
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
                                        <span className="font-semibold text-fixed">
                                          {entry.visitorFirstName} {entry.visitorLastName}
                                        </span>
                                      </div>
                                    </div>
                                    
                                    <div className="space-y-1 text-xs sm:text-sm">
                                      <div className="flex items-center gap-2 text-variable">
                                        <Building2 size={14} className="flex-shrink-0" />
                                        <span className="truncate">{entry.company}</span>
                                      </div>
                                      <div className="flex items-center gap-2 text-variable">
                                        <UserCheck size={14} className="flex-shrink-0" />
                                        <span className="truncate">Host: {entry.hostFirstName} {entry.hostLastName} ({entry.hostDepartment})</span>
                                      </div>
                                      <div className="flex items-center gap-2 text-variable sm:hidden">
                                        <Mail size={14} className="flex-shrink-0" />
                                        <span className="truncate">{entry.visitorEmail}</span>
                                      </div>
                                      <div className="hidden sm:flex items-center gap-2 text-variable">
                                        <Mail size={14} className="flex-shrink-0" />
                                        <span className="truncate">{entry.visitorEmail}</span>
                                      </div>
                                      {entry.purpose && (
                                        <div className="flex items-center gap-2 text-variable">
                                          <AtSign size={14} className="flex-shrink-0" />
                                          <span className="line-clamp-1">{entry.purpose}</span>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                  
                                  <div className="text-right">
                                    {diaryViewMode === 'weekly' && (
                                      <div className="text-xs text-variable mb-0.5">
                                        {new Date(entry.visitDate).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}
                                      </div>
                                    )}
                                    <div className="text-sm font-medium text-fixed">
                                      {visitTime}
                                    </div>
                                    {isPast && (
                                      <Badge className="bg-gray-200 text-gray-500 text-xs mt-1">
                                        Past
                                      </Badge>
                                    )}
                                    {!isPast && priority.level === 'urgent' && (
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
                                    {!isPast && !entry.isCheckedIn && (
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        className="h-7 px-2 text-xs text-green-600 border-green-300 hover:bg-green-50 mt-1"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          diaryVisitorCheckInMutation.mutate(entry);
                                        }}
                                        disabled={diaryVisitorCheckInMutation.isPending}
                                      >
                                        <LogIn size={12} className="mr-1" />
                                        Check In
                                      </Button>
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

              {!showHistory && displayedVisitors.length === 0 && displayedContractors.length === 0 && (arrivedVisitors.length > 0 || arrivedContractors.length > 0) && (
                <div className="text-center py-4 text-variable">
                  <p className="text-sm">All pre-booked visitors and contractors have arrived</p>
                  <Button variant="ghost" size="sm" onClick={() => setShowHistory(true)} className="mt-2 text-xs text-green-600">
                    Show {arrivedVisitors.length + arrivedContractors.length} arrived
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>

        {((receptionDiary && receptionDiary.length > 0) || (filteredContractors && filteredContractors.length > 0) || (todayRoomBookings && todayRoomBookings.length > 0)) && (
          <div className="mt-6 pt-4 border-t border-indigo-200 dark:border-indigo-800">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs sm:text-sm">
              <div className="flex items-center gap-3 sm:gap-4 flex-wrap">
                <div className="flex items-center gap-1.5 sm:gap-2">
                  <div className="w-3 h-3 bg-red-100 border border-red-200 rounded flex-shrink-0"></div>
                  <span className="text-variable">Urgent</span>
                </div>
                <div className="flex items-center gap-1.5 sm:gap-2">
                  <div className="w-3 h-3 bg-orange-100 border border-orange-200 rounded flex-shrink-0"></div>
                  <span className="text-variable">Contractor</span>
                </div>
                <div className="flex items-center gap-1.5 sm:gap-2">
                  <CheckCircle2 className="text-green-600 flex-shrink-0" size={14} />
                  <span className="text-variable">Checked In</span>
                </div>
                <div className="flex items-center gap-1.5 sm:gap-2">
                  <Calendar className="text-purple-600 flex-shrink-0" size={14} />
                  <span className="text-variable">Meeting</span>
                </div>
                <div className="flex items-center gap-1.5 sm:gap-2">
                  <div className="w-3 h-3 bg-gray-200 border border-gray-300 rounded flex-shrink-0 opacity-60"></div>
                  <span className="text-variable">Past</span>
                </div>
              </div>
              <span className="text-variable text-xs hidden sm:block">Auto-refreshes every 30s</span>
            </div>
          </div>
        )}
      </GlassCard>



      {/* Modal Dialogs */}
      {/* Current Visitors Modal */}
      <Dialog open={openModal === 'visitors'} onOpenChange={() => setOpenModal(null)}>
        <DialogContent className="glass-effect border border-white/30 max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-fixed">
              <UsersRound className="text-blue-600" size={24} />
              {t('modals.currentVisitors.title', { count: currentVisitors?.length || 0 })}
            </DialogTitle>
            <DialogDescription>
              {t('modals.currentVisitors.desc')}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 max-h-96 overflow-y-auto pr-1 scrollbar-thin">
            {currentVisitors && currentVisitors.length > 0 ? (
              currentVisitors.map((visitor) => (
                <div key={visitor.id} className="flex items-center justify-between p-4 bg-white/50 dark:bg-slate-800/70 rounded-xl border border-white/30 dark:border-slate-700/60 hover:bg-white/70 dark:hover:bg-slate-700/70 transition-colors">
                  <div className="flex items-center space-x-3">
                    <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900/50 rounded-full flex items-center justify-center">
                      <span className="text-blue-600 dark:text-blue-300 font-medium text-sm">
                        {getInitials(`${visitor.firstName} ${visitor.lastName}`)}
                      </span>
                    </div>
                    <div>
                      <p className="font-medium text-fixed">{visitor.firstName} {visitor.lastName}</p>
                      <p className="text-sm text-variable">{visitor.company || t('modals.currentVisitors.noCompany')}</p>
                      <div className="flex items-center gap-4 mt-1">
                        <p className="text-xs text-variable">👤 {t('modals.currentVisitors.hostLabel', { name: getStaffName(visitor.hostStaffId || undefined) })}</p>
                        <p className="text-xs text-variable">🕐 {t('modals.currentVisitors.arrivedLabel', { time: formatTime(visitor.checkedInAt) })}</p>
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <Badge variant="default" className="text-xs">
                          {t('modals.currentVisitors.onSite')}
                        </Badge>
                        {visitor.phoneNumber && (
                          <span className="text-xs text-variable">📞 {visitor.phoneNumber}</span>
                        )}
                        {visitor.email && (
                          <span className="text-xs text-variable">✉️ {visitor.email}</span>
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
              <div className="text-center py-8 text-variable">
                No visitors currently on-site
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Staff On-Site Modal */}
      <Dialog open={openModal === 'staff'} onOpenChange={() => setOpenModal(null)}>
        <DialogContent className="glass-effect border border-white/30 max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-fixed">
              <BadgeInfo className="text-purple-600" size={24} />
              {t('modals.staffOnSite.title', { count: checkedInStaff?.length || 0 })}
            </DialogTitle>
            <DialogDescription>
              {t('modals.staffOnSite.desc')}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {checkedInStaff && checkedInStaff.length > 0 ? (
              checkedInStaff.map((staffMember) => (
                <div key={staffMember.id} className="flex items-center justify-between p-4 bg-white/50 dark:bg-slate-800/70 rounded-xl border border-white/30 dark:border-slate-700/60">
                  <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 bg-purple-100 dark:bg-purple-900/50 rounded-full flex items-center justify-center">
                      <span className="text-purple-600 dark:text-purple-300 font-semibold text-sm">
                        {getInitials(`${staffMember.firstName} ${staffMember.lastName}`)}
                      </span>
                    </div>
                    <div>
                      <p className="font-medium text-fixed">{`${staffMember.firstName} ${staffMember.lastName}`}</p>
                      <p className="text-sm text-variable">{staffMember.department}</p>
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
              <div className="text-center py-8 text-variable">
                {t('modals.staffOnSite.empty')}
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
                <span className="text-xl">{t('modals.departmentDetails.title', { dept: selectedDepartment })}</span>
                {departmentDetails && (
                  <Badge variant="secondary" className="ml-2">
                    {t('modals.departmentDetails.peopleOnSite', { count: departmentDetails.statistics.checkedInStaff + departmentDetails.statistics.visitors })}
                  </Badge>
                )}
              </DialogTitle>
              <DialogDescription>
                {t('modals.departmentDetails.desc')}
              </DialogDescription>
            </DialogHeader>
            
            {departmentDetailsLoading || !departmentDetails ? (
              <div className="text-center py-8">
                <div className="text-lg font-medium text-variable">{t('modals.departmentDetails.loading')}</div>
              </div>
            ) : (
              <div className="space-y-6">
                {/* Summary Stats */}
                <div className="grid grid-cols-3 gap-4">
                  <div className="text-center p-4 bg-blue-50 rounded-lg">
                    <div className="text-2xl font-bold text-blue-600">
                      {departmentDetails.statistics.checkedInStaff}
                    </div>
                    <div className="text-sm text-blue-800">{t('modals.departmentDetails.staffOnSite')}</div>
                  </div>
                  <div className="text-center p-4 bg-green-50 rounded-lg">
                    <div className="text-2xl font-bold text-green-600">
                      {departmentDetails.visitors.length}
                    </div>
                    <div className="text-sm text-green-800">{t('modals.departmentDetails.currentVisitors')}</div>
                  </div>
                  <div className="text-center p-4 bg-purple-50 rounded-lg">
                    <div className="text-2xl font-bold text-purple-600">
                      {departmentDetails.statistics.checkedInStaff + departmentDetails.statistics.visitors}
                    </div>
                    <div className="text-sm text-purple-800">{t('modals.departmentDetails.totalPeople')}</div>
                  </div>
                </div>

                {/* Staff Section */}
                <div>
                  <h3 className="text-lg font-semibold text-fixed mb-4 flex items-center">
                    <User className="mr-2" size={20} />
                    Staff Members ({departmentDetails.staffMembers.length})
                  </h3>
                  <div className="space-y-3">
                    {departmentDetails.staffMembers.length === 0 ? (
                      <div className="text-center py-4 text-variable">No staff assigned to this department</div>
                    ) : (
                      departmentDetails.staffMembers.map((staffMember) => (
                        <div key={staffMember.id} className="flex items-center justify-between p-4 bg-[var(--card)] border rounded-lg">
                          <div className="flex items-center space-x-3">
                            <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                              staffMember.isCheckedIn ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-600'
                            }`}>
                              <User size={20} />
                            </div>
                            <div>
                              <p className="font-medium text-fixed">{staffMember.firstName} {staffMember.lastName}</p>
                              <p className="text-sm text-variable capitalize">{staffMember.accessLevel}</p>
                            </div>
                          </div>
                          <div className="text-right">
                            {staffMember.isCheckedIn ? (
                              <div>
                                <Badge variant="default" className="mb-1">On-Site</Badge>
                                <p className="text-xs text-variable">
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
                  <h3 className="text-lg font-semibold text-fixed mb-4 flex items-center">
                    <UsersRound className="mr-2" size={20} />
                    Current Visitors ({departmentDetails.visitors.length})
                  </h3>
                  <div className="space-y-3">
                    {departmentDetails.visitors.length === 0 ? (
                      <div className="text-center py-4 text-variable">No visitors currently hosted by this department</div>
                    ) : (
                      departmentDetails.visitors.map((visitor) => (
                        <div key={visitor.id} className="flex items-center justify-between p-4 bg-[var(--card)] border rounded-lg">
                          <div className="flex items-center space-x-3">
                            <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900/50 rounded-full flex items-center justify-center">
                              <span className="text-blue-600 dark:text-blue-300 font-medium text-sm">
                                {getInitials(`${visitor.firstName} ${visitor.lastName}`)}
                              </span>
                            </div>
                            <div>
                              <p className="font-medium text-fixed">{visitor.firstName} {visitor.lastName}</p>
                              <p className="text-sm text-variable">{visitor.company || 'No company'}</p>
                              <p className="text-xs text-variable">Host: {visitor.hostName}</p>
                            </div>
                          </div>
                          <div className="text-right">
                            <Badge variant="default" className="mb-1">Checked In</Badge>
                            <p className="text-xs text-variable">
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
                  <div className="text-sm text-variable font-normal">{selectedVisitor?.company || "No company listed"}</div>
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
                      <p className="text-lg font-mono bg-[var(--card)] dark:bg-slate-800 p-2 rounded border">
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
                      <p className="text-lg font-mono bg-[var(--card)] dark:bg-slate-800 p-2 rounded border">
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
                      <p className="text-lg bg-[var(--card)] dark:bg-slate-800 p-2 rounded border">
                        {getStaffName(selectedVisitor.hostStaffId)}
                      </p>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-blue-700 dark:text-blue-400">Department</label>
                      <p className="text-lg bg-[var(--card)] dark:bg-slate-800 p-2 rounded border">
                        {staff?.find(s => s.id === selectedVisitor.hostStaffId)?.department || "Unknown"}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Visit Timeline */}
                <div className="bg-[var(--background)] dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg p-4">
                  <h3 className="text-lg font-semibold text-fixed mb-3 flex items-center gap-2">
                    ⏰ Visit Timeline
                  </h3>
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-medium text-variable">Check-in Time</span>
                      <span className="text-lg font-mono">{formatTime(selectedVisitor.checkedInAt)}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-medium text-variable">Duration on Site</span>
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
                      <span className="text-sm font-medium text-variable">Expected Duration</span>
                      <span className="text-lg">
                        {selectedVisitor.expectedDuration ? `${selectedVisitor.expectedDuration} minutes` : "Not specified"}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Visit Details */}
                <div className="bg-[var(--background)] dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg p-4">
                  <h3 className="text-lg font-semibold text-fixed mb-3 flex items-center gap-2">
                    📋 Visit Details
                  </h3>
                  <div className="space-y-3">
                    <div>
                      <label className="text-sm font-medium text-variable">Purpose of Visit</label>
                      <p className="text-base bg-[var(--card)] dark:bg-slate-800 p-2 rounded border">
                        {selectedVisitor.purpose || "Not specified"}
                      </p>
                    </div>
                    {selectedVisitor.notes && (
                      <div>
                        <label className="text-sm font-medium text-variable">Additional Notes</label>
                        <p className="text-base bg-[var(--card)] dark:bg-slate-800 p-2 rounded border">
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
                        const response = await apiRequest('POST', `/api/visitors/${selectedVisitor.id}/emergency-notify`, {
                          urgencyReason: "Urgent Contact Required - Emergency Support"
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
            <DialogTitle className="flex items-center gap-2 text-fixed">
              <HardHat className="text-orange-600" size={24} />
              Contractors On-Site ({checkedInContractors?.length || 0})
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 max-h-96 overflow-y-auto pr-1 scrollbar-thin">
            {checkedInContractors && checkedInContractors.length > 0 ? (
              checkedInContractors.map((contractor) => (
                <div key={contractor.id} className="flex items-center justify-between p-4 bg-white/50 dark:bg-slate-800/70 rounded-xl border border-white/30 dark:border-slate-700/60 hover:bg-white/70 dark:hover:bg-slate-700/70 transition-colors">
                  <div className="flex items-center space-x-3">
                    <div className="w-12 h-12 bg-orange-100 dark:bg-orange-900/50 rounded-full flex items-center justify-center">
                      <span className="text-orange-600 dark:text-orange-300 font-medium text-sm">
                        {getInitials(`${contractor.firstName} ${contractor.lastName}`)}
                      </span>
                    </div>
                    <div>
                      <div className="font-medium text-fixed">
                        {contractor.firstName} {contractor.lastName}
                      </div>
                      <div className="text-sm text-variable">
                        {contractor.companyName || contractor.company || 'Company not specified'}
                      </div>
                      <div className="text-xs text-variable">
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
              <div className="text-center py-8 text-variable">
                No contractors currently on-site
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Members On-Site Modal */}
      <Dialog open={openModal === 'members'} onOpenChange={() => setOpenModal(null)}>
        <DialogContent className="glass-effect border border-white/30 max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-fixed">
              <UserCheck className="text-purple-600" size={24} />
              Members On-Site ({checkedInMembers?.length || 0})
            </DialogTitle>
            <DialogDescription>
              View and manage all members currently checked in on-site.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 max-h-96 overflow-y-auto pr-1 scrollbar-thin">
            {checkedInMembers && checkedInMembers.length > 0 ? (
              checkedInMembers.map((member) => (
                <div key={member.id} className="flex items-center justify-between p-4 bg-white/50 dark:bg-slate-800/70 rounded-xl border border-white/30 dark:border-slate-700/60 hover:bg-white/70 dark:hover:bg-slate-700/70 transition-colors">
                  <div className="flex items-center space-x-3">
                    <div className="w-12 h-12 bg-purple-100 dark:bg-purple-900/50 rounded-full flex items-center justify-center">
                      <span className="text-purple-600 dark:text-purple-300 font-medium text-sm">
                        {getInitials(`${member.firstName} ${member.lastName}`)}
                      </span>
                    </div>
                    <div>
                      <div className="font-medium text-fixed">
                        {member.firstName} {member.lastName}
                      </div>
                      <div className="text-sm text-variable">
                        {member.membershipType || 'Standard Member'}
                      </div>
                      <div className="text-xs text-variable">
                        {member.email && `${member.email} • `}Checked in: {member.checkedInAt ? formatDistanceToNow(new Date(member.checkedInAt), { addSuffix: true }) : 'Recently'}
                      </div>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => checkoutMemberMutation.mutate(member.id)}
                    disabled={checkoutMemberMutation.isPending}
                    className="flex items-center gap-1"
                    data-testid={`checkout-member-${member.id}`}
                  >
                    <LogOut size={14} />
                    Check Out
                  </Button>
                </div>
              ))
            ) : (
              <div className="text-center py-8 text-variable">
                No members currently on-site
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Total People Modal */}
      <Dialog open={openModal === 'total-people'} onOpenChange={() => setOpenModal(null)}>
        <DialogContent className="glass-effect border border-white/30 max-w-4xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-fixed">
              <Users className="text-green-600" size={24} />
              All People On-Site ({((currentVisitors?.length || 0) + (checkedInStaff?.length || 0) + (checkedInContractors?.length || 0) + (checkedInMembers?.length || 0))})
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-6 max-h-96 overflow-y-auto pr-1 scrollbar-thin">
            
            {/* Visitors Section */}
            {currentVisitors && currentVisitors.length > 0 && (
              <div>
                <h3 className="text-lg font-semibold text-fixed mb-3 flex items-center">
                  <UsersRound className="mr-2 text-blue-600" size={20} />
                  Visitors ({currentVisitors.length})
                </h3>
                <div className="space-y-2">
                  {currentVisitors.map((visitor) => (
                    <div key={visitor.id} className="flex items-center justify-between p-3 bg-blue-50/50 dark:bg-blue-950/40 rounded-lg border border-blue-200/30 dark:border-blue-800/40">
                      <div className="flex items-center space-x-3">
                        <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900/50 rounded-full flex items-center justify-center">
                          <span className="text-blue-600 dark:text-blue-300 font-medium text-sm">
                            {getInitials(`${visitor.firstName} ${visitor.lastName}`)}
                          </span>
                        </div>
                        <div>
                          <div className="font-medium text-fixed">
                            {visitor.firstName} {visitor.lastName}
                          </div>
                          <div className="text-sm text-variable">{visitor.company}</div>
                        </div>
                      </div>
                      <Badge variant="secondary" className="bg-blue-100 dark:bg-blue-900/60 text-blue-800 dark:text-blue-300 border-blue-300 dark:border-blue-700">
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
                <h3 className="text-lg font-semibold text-fixed mb-3 flex items-center">
                  <BadgeInfo className="mr-2 text-purple-600" size={20} />
                  Staff ({checkedInStaff.length})
                </h3>
                <div className="space-y-2">
                  {checkedInStaff.map((staff) => (
                    <div key={staff.id} className="flex items-center justify-between p-3 bg-purple-50/50 dark:bg-purple-950/40 rounded-lg border border-purple-200/30 dark:border-purple-800/40">
                      <div className="flex items-center space-x-3">
                        <div className="w-10 h-10 bg-purple-100 dark:bg-purple-900/50 rounded-full flex items-center justify-center">
                          <span className="text-purple-600 dark:text-purple-300 font-medium text-sm">
                            {getInitials(`${staff.firstName} ${staff.lastName}`)}
                          </span>
                        </div>
                        <div>
                          <div className="font-medium text-fixed">
                            {staff.firstName} {staff.lastName}
                          </div>
                          <div className="text-sm text-variable">{staff.department}</div>
                        </div>
                      </div>
                      <Badge variant="secondary" className="bg-purple-100 dark:bg-purple-900/60 text-purple-800 dark:text-purple-300 border-purple-300 dark:border-purple-700">
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
                <h3 className="text-lg font-semibold text-fixed mb-3 flex items-center">
                  <HardHat className="mr-2 text-orange-600" size={20} />
                  Contractors ({checkedInContractors.length})
                </h3>
                <div className="space-y-2">
                  {checkedInContractors.map((contractor) => (
                    <div key={contractor.id} className="flex items-center justify-between p-3 bg-orange-50/50 dark:bg-orange-950/40 rounded-lg border border-orange-200/30 dark:border-orange-800/40">
                      <div className="flex items-center space-x-3">
                        <div className="w-10 h-10 bg-orange-100 dark:bg-orange-900/50 rounded-full flex items-center justify-center">
                          <span className="text-orange-600 dark:text-orange-300 font-medium text-sm">
                            {getInitials(`${contractor.firstName} ${contractor.lastName}`)}
                          </span>
                        </div>
                        <div>
                          <div className="font-medium text-fixed">
                            {contractor.firstName} {contractor.lastName}
                          </div>
                          <div className="text-sm text-variable">{contractor.company || 'Contractor'}</div>
                        </div>
                      </div>
                      <Badge variant="secondary" className="bg-orange-100 dark:bg-orange-900/60 text-orange-800 dark:text-orange-300 border-orange-300 dark:border-orange-700">
                        Contractor
                      </Badge>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Members Section */}
            {checkedInMembers && checkedInMembers.length > 0 && (
              <div>
                <h3 className="text-lg font-semibold text-fixed mb-3 flex items-center">
                  <UserCheck className="mr-2 text-purple-600" size={20} />
                  {t('peopleOnSite.members')} ({checkedInMembers.length})
                </h3>
                <div className="space-y-2">
                  {checkedInMembers.map((member) => (
                    <div key={member.id} className="flex items-center justify-between p-3 bg-purple-50/50 dark:bg-purple-950/40 rounded-lg border border-purple-200/30 dark:border-purple-800/40">
                      <div className="flex items-center space-x-3">
                        <div className="w-10 h-10 bg-purple-100 dark:bg-purple-900/50 rounded-full flex items-center justify-center">
                          <span className="text-purple-600 dark:text-purple-300 font-medium text-sm">
                            {getInitials(`${member.firstName} ${member.lastName}`)}
                          </span>
                        </div>
                        <div>
                          <div className="font-medium text-fixed">
                            {member.firstName} {member.lastName}
                          </div>
                          <div className="text-sm text-variable">{member.membershipType || t('peopleOnSite.members')}</div>
                        </div>
                      </div>
                      <Badge variant="secondary" className="bg-purple-100 dark:bg-purple-900/60 text-purple-800 dark:text-purple-300 border-purple-300 dark:border-purple-700">
                        {t('peopleOnSite.members')}
                      </Badge>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Empty State */}
            {(!currentVisitors || currentVisitors.length === 0) && 
             (!checkedInStaff || checkedInStaff.length === 0) && 
             (!checkedInContractors || checkedInContractors.length === 0) &&
             (!checkedInMembers || checkedInMembers.length === 0) && (
              <div className="text-center py-8 text-variable">
                {t('peopleOnSite.noOneOnSite')}
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
                <div className="text-base sm:text-xl font-semibold truncate">{t('dashboard:receptionDiary.details')}</div>
                <div className="text-xs sm:text-sm text-variable font-normal truncate">
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
                      {selectedVisitorBooking.isCheckedIn ? `✓ ${t('dashboard:receptionDiary.status.arrived')}` : `⏰ ${t('dashboard:receptionDiary.status.pending')}`}
                    </Badge>
                    <span className="text-xs sm:text-sm font-medium">
                      {formatTimeLocale(new Date(selectedVisitorBooking.visitDate))}
                    </span>
                  </div>
                </div>
              </div>

              {/* Visitor Information */}
              <div className="bg-[var(--background)] dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg p-3 sm:p-4">
                <h3 className="text-base sm:text-lg font-semibold text-fixed mb-3 flex items-center gap-2">
                  <User className="text-indigo-600 flex-shrink-0" size={18} />
                  {t('common:visitorInfo')}
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                  <div>
                    <label className="text-xs sm:text-sm font-medium text-variable">{t('common:fullName')}</label>
                    <p className="text-sm sm:text-base bg-[var(--card)] dark:bg-slate-800 p-2 rounded border break-words">
                      {selectedVisitorBooking.visitorFirstName} {selectedVisitorBooking.visitorLastName}
                    </p>
                  </div>
                  <div>
                    <label className="text-xs sm:text-sm font-medium text-variable">{t('common:emailAddress')}</label>
                    <p className="text-xs sm:text-sm font-mono bg-[var(--card)] dark:bg-slate-800 p-2 rounded border break-all">
                      {selectedVisitorBooking.visitorEmail}
                    </p>
                  </div>
                  <div>
                    <label className="text-xs sm:text-sm font-medium text-variable">{t('common:company')}</label>
                    <p className="text-sm sm:text-base bg-[var(--card)] dark:bg-slate-800 p-2 rounded border break-words">
                      {selectedVisitorBooking.company || t('common:none')}
                    </p>
                  </div>
                  <div>
                    <label className="text-xs sm:text-sm font-medium text-variable">{t('common:date')}</label>
                    <p className="text-xs sm:text-sm bg-[var(--card)] dark:bg-slate-800 p-2 rounded border break-words">
                      {formatDateLocale(new Date(selectedVisitorBooking.visitDate))} at {formatTimeLocale(new Date(selectedVisitorBooking.visitDate))}
                    </p>
                  </div>
                </div>
              </div>

              {/* Host & Meeting Details */}
              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3 sm:p-4">
                <h3 className="text-base sm:text-lg font-semibold text-blue-800 dark:text-blue-300 mb-3 flex items-center gap-2">
                  <UserCheck className="text-blue-600 flex-shrink-0" size={18} />
                  {t('common:visitDetails')}
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                  <div>
                    <label className="text-xs sm:text-sm font-medium text-blue-700 dark:text-blue-400">{t('common:host')}</label>
                    <p className="text-sm sm:text-base bg-[var(--card)] dark:bg-slate-800 p-2 rounded border break-words">
                      {selectedVisitorBooking.hostFirstName} {selectedVisitorBooking.hostLastName}
                    </p>
                  </div>
                  <div>
                    <label className="text-xs sm:text-sm font-medium text-blue-700 dark:text-blue-400">{t('common:department')}</label>
                    <p className="text-sm sm:text-base bg-[var(--card)] dark:bg-slate-800 p-2 rounded border break-words">
                      {selectedVisitorBooking.hostDepartment}
                    </p>
                  </div>
                  <div>
                    <label className="text-xs sm:text-sm font-medium text-blue-700 dark:text-blue-400">{t('common:host')} {t('common:emailAddress')}</label>
                    <p className="text-xs sm:text-sm font-mono bg-[var(--card)] dark:bg-slate-800 p-2 rounded border break-all">
                      {selectedVisitorBooking.hostEmail}
                    </p>
                  </div>
                  <div>
                    <label className="text-xs sm:text-sm font-medium text-blue-700 dark:text-blue-400">{t('common:purpose')}</label>
                    <p className="text-sm sm:text-base bg-[var(--card)] dark:bg-slate-800 p-2 rounded border break-words">
                      {selectedVisitorBooking.purpose || t('common:none')}
                    </p>
                  </div>
                </div>
              </div>

              {/* Reception Services & Special Requests */}
              <div className="bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-lg p-4">
                <h3 className="text-lg font-semibold text-purple-800 dark:text-purple-300 mb-3 flex items-center gap-2">
                  <AtSign className="text-purple-600" size={20} />
                  {t('dashboard:receptionDiary.receptionServices')}
                </h3>
                <div className="space-y-3">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="bg-[var(--card)] dark:bg-slate-800 p-3 rounded border">
                      <h4 className="font-medium text-purple-700 dark:text-purple-400 mb-2">☕ {t('dashboard:receptionDiary.refreshmentServices')}</h4>
                      <div className="space-y-1 text-sm">
                        <div className="flex items-center gap-2">
                          <input type="checkbox" className="rounded" />
                          <span>{t('dashboard:receptionDiary.services.coffee')}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <input type="checkbox" className="rounded" />
                          <span>{t('dashboard:receptionDiary.services.meetingRefreshments')}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <input type="checkbox" className="rounded" />
                          <span>{t('dashboard:receptionDiary.services.dietary')}</span>
                        </div>
                      </div>
                    </div>
                    
                    <div className="bg-[var(--card)] dark:bg-slate-800 p-3 rounded border">
                      <h4 className="font-medium text-purple-700 dark:text-purple-400 mb-2">🏢 {t('dashboard:receptionDiary.buildingServices')}</h4>
                      <div className="space-y-1 text-sm">
                        <div className="flex items-center gap-2">
                          <input type="checkbox" className="rounded" />
                          <span>{t('dashboard:receptionDiary.services.parking')}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <input type="checkbox" className="rounded" />
                          <span>{t('dashboard:receptionDiary.services.roomBooking')}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <input type="checkbox" className="rounded" />
                          <span>{t('dashboard:receptionDiary.services.technical')}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  <div>
                    <label className="text-sm font-medium text-purple-700 dark:text-purple-400">{t('dashboard:receptionDiary.additionalNotes')}</label>
                    <div className="bg-[var(--card)] dark:bg-slate-800 p-3 rounded border mt-1">
                      <p className="text-sm text-variable italic">
                        {selectedVisitorBooking.purpose ? 
                          `${t('common:purpose')}: ${selectedVisitorBooking.purpose}. ${t('dashboard:receptionDiary.greetVisitor')}` :
                          t('dashboard:receptionDiary.greetVisitor')
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
                          title: `✅ ${t('common:checkedIn')}`,
                          description: `${selectedVisitorBooking.visitorFirstName} ${selectedVisitorBooking.visitorLastName} ${t('common:checkedIn')}.`,
                        });
                        setOpenModal(null);
                        queryClient.invalidateQueries({ queryKey: ['/api/reception/diary'] });
                        queryClient.invalidateQueries({ queryKey: ['/api/visitors/current'] });
                        queryClient.invalidateQueries({ queryKey: ['/api/visitors'] });
                        queryClient.invalidateQueries({ queryKey: ['/api/visitors/today'] });
                        queryClient.invalidateQueries({ queryKey: ['/api/prebookings'] });
                        queryClient.invalidateQueries({ queryKey: ['/api/prebookings/upcoming'] });
                        queryClient.invalidateQueries({ queryKey: ['/api/stats'] });
                        queryClient.invalidateQueries({ queryKey: ['/api/muster'] });
                      }
                    } catch (error: any) {
                      toast({
                        title: `❌ ${t('common:error')}`,
                        description: error.message || t('common:error'),
                        variant: "destructive",
                      });
                    }
                  }}
                  disabled={selectedVisitorBooking.isCheckedIn}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 text-white"
                  data-testid="button-manual-checkin-booking"
                >
                  {selectedVisitorBooking.isCheckedIn ? `✓ ${t('dashboard:receptionDiary.status.checkedIn')}` : `👤 ${t('dashboard:receptionDiary.manualCheckIn')}`}
                </Button>
                <Button 
                  onClick={() => {
                    toast({
                      title: t('dashboard:receptionDiary.receptionServices'),
                      description: `✅ ${t('dashboard:receptionDiary.services.coffee')} prepared ☑️ ${t('dashboard:receptionDiary.services.roomBooking')} ready ☑️ ${t('dashboard:receptionDiary.services.parking')} arranged ☑️ ${t('common:host')} notified`,
                    });
                  }}
                  variant="outline"
                  className="flex-1 bg-green-50 hover:bg-green-100 border-green-300"
                  data-testid="button-service-checklist"
                >
                  ✅ {t('dashboard:receptionDiary.serviceChecklist')}
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
                <div className="text-xl">{t('dashboard:receptionDiary.types.meeting')} {t('dashboard:receptionDiary.details')}</div>
                <div className="text-sm text-variable font-normal">
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
                      📅 {t('dashboard:receptionDiary.types.meeting')}
                    </Badge>
                    <span className="text-sm font-medium">
                      {selectedMeetingBooking.startTime} - {selectedMeetingBooking.endTime}
                    </span>
                  </div>
                  <Badge variant="outline" className="text-xs bg-purple-100 text-purple-800 border-purple-200">
                    {selectedMeetingBooking.roomName}
                  </Badge>
                </div>
              </div>

              {/* Meeting Information */}
              <div className="bg-[var(--background)] dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg p-4">
                <h3 className="text-lg font-semibold text-fixed mb-3 flex items-center gap-2">
                  <Calendar className="text-purple-600" size={20} />
                  {t('dashboard:receptionDiary.types.meeting')} {t('common:details')}
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium text-variable">{t('common:title')}</label>
                    <p className="text-lg bg-[var(--card)] dark:bg-slate-800 p-2 rounded border">
                      {selectedMeetingBooking.title}
                    </p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-variable">Room</label>
                    <p className="text-lg bg-[var(--card)] dark:bg-slate-800 p-2 rounded border">
                      {selectedMeetingBooking.roomName}
                    </p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-variable">{t('common:date')}</label>
                    <p className="text-lg bg-[var(--card)] dark:bg-slate-800 p-2 rounded border">
                      {formatDateLocale(new Date(selectedMeetingBooking.date))}
                    </p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-variable">{t('dashboard:receptionDiary.headers.time')}</label>
                    <p className="text-lg bg-[var(--card)] dark:bg-slate-800 p-2 rounded border">
                      {selectedMeetingBooking.startTime} - {selectedMeetingBooking.endTime}
                    </p>
                  </div>
                </div>
                {selectedMeetingBooking.description && (
                  <div className="mt-4">
                    <label className="text-sm font-medium text-variable">{t('common:description')}</label>
                    <p className="text-base bg-[var(--card)] dark:bg-slate-800 p-2 rounded border mt-1">
                      {selectedMeetingBooking.description}
                    </p>
                  </div>
                )}
              </div>

              {/* Organizer & Attendees */}
              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                <h3 className="text-lg font-semibold text-blue-800 dark:text-blue-300 mb-3 flex items-center gap-2">
                  <Users className="text-blue-600" size={20} />
                  {t('common:host')} & {t('common:attendees')}
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium text-blue-700 dark:text-blue-400">{t('common:host')}</label>
                    <p className="text-lg bg-[var(--card)] dark:bg-slate-800 p-2 rounded border">
                      {selectedMeetingBooking.organizer}
                    </p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-blue-700 dark:text-blue-400">{t('common:attendees')}</label>
                    <p className="text-lg bg-[var(--card)] dark:bg-slate-800 p-2 rounded border">
                      {selectedMeetingBooking.expectedAttendees || 0} {t('common:people')}
                    </p>
                  </div>
                </div>
              </div>

              {/* Catering & Technical Requirements */}
              {/* Catering & Technical Requirements */}
              <div className="bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-lg p-4">
                <h3 className="text-lg font-semibold text-orange-800 dark:text-orange-300 mb-3 flex items-center gap-2">
                  <AtSign className="text-orange-600" size={20} />
                  {t('dashboard:receptionDiary.receptionServices')}
                </h3>
                <div className="space-y-3">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="bg-[var(--card)] dark:bg-slate-800 p-3 rounded border">
                      <h4 className="font-medium text-orange-700 dark:text-orange-400 mb-2">☕ {t('dashboard:receptionDiary.refreshmentServices')}</h4>
                      <div className="space-y-1 text-sm">
                        <div className="flex items-center gap-2">
                          <input type="checkbox" className="rounded" defaultChecked={selectedMeetingBooking.expectedAttendees >= 5} />
                          <span>{t('dashboard:receptionDiary.services.coffee')}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <input type="checkbox" className="rounded" defaultChecked={selectedMeetingBooking.expectedAttendees >= 10} />
                          <span>{t('dashboard:receptionDiary.services.meetingRefreshments')}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <input type="checkbox" className="rounded" />
                          <span>{t('dashboard:receptionDiary.services.water')}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <input type="checkbox" className="rounded" />
                          <span>{t('dashboard:receptionDiary.services.dietary')}</span>
                        </div>
                      </div>
                    </div>
                    
                    <div className="bg-[var(--card)] dark:bg-slate-800 p-3 rounded border">
                      <h4 className="font-medium text-orange-700 dark:text-orange-400 mb-2">🔧 {t('dashboard:receptionDiary.technicalSetup')}</h4>
                      <div className="space-y-1 text-sm">
                        <div className="flex items-center gap-2">
                          <input type="checkbox" className="rounded" defaultChecked />
                          <span>{t('dashboard:receptionDiary.services.projector')}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <input type="checkbox" className="rounded" defaultChecked />
                          <span>{t('dashboard:receptionDiary.services.videoConferencing')}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <input type="checkbox" className="rounded" />
                          <span>{t('dashboard:receptionDiary.services.flipChart')}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <input type="checkbox" className="rounded" />
                          <span>{t('dashboard:receptionDiary.services.powerOutlets')}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  <div>
                    <label className="text-sm font-medium text-orange-700 dark:text-orange-400">{t('dashboard:receptionDiary.roomSetupNotes')}</label>
                    <div className="bg-[var(--card)] dark:bg-slate-800 p-3 rounded border mt-1">
                      <p className="text-sm text-variable">
                        {t('dashboard:receptionDiary.roomSetupDesc', { count: selectedMeetingBooking.expectedAttendees || t('common:none') })} 
                        {selectedMeetingBooking.description ? ` ${t('common:purpose')}: ${selectedMeetingBooking.description}` : ` ${t('dashboard:receptionDiary.standardSetup')}`}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Room Information */}
              <div className="bg-[var(--background)] dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg p-4">
                <h3 className="text-lg font-semibold text-fixed mb-3 flex items-center gap-2">
                  <Building2 className="text-variable" size={20} />
                  {t('dashboard:receptionDiary.headers.location')}
                </h3>
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium text-variable">Room Name</span>
                    <span className="text-base font-mono">{selectedMeetingBooking.roomName}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium text-variable">Capacity</span>
                    <span className="text-base">
                      {meetingRooms?.find(room => room.name === selectedMeetingBooking.roomName)?.capacity || t('common:none')} {t('common:people')}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium text-variable">Equipment</span>
                    <span className="text-base">
                      {t('dashboard:receptionDiary.standardSetup')}
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
                      description: `✅ ${t('dashboard:receptionDiary.services.roomBooking')} cleaned ☑️ ${t('dashboard:receptionDiary.services.technical')} tested ☑️ Catering ordered ☑️ ${t('common:host')} notified`,
                    });
                  }}
                  className="flex-1"
                  data-testid="button-prepare-meeting-room"
                >
                  🏢 {t('dashboard:receptionDiary.prepareRoom')}
                </Button>
                <Button 
                  onClick={() => {
                    toast({
                      title: t('dashboard:receptionDiary.refreshmentServices'),
                      description: `Catering ordered for ${selectedMeetingBooking.expectedAttendees || 'estimated'} attendees in ${selectedMeetingBooking.roomName}`,
                    });
                  }}
                  variant="outline"
                  className="flex-1 bg-orange-50 hover:bg-orange-100 border-orange-300"
                  data-testid="button-order-catering"
                >
                  ☕ {t('dashboard:receptionDiary.orderCatering')}
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
                  🔧 {t('dashboard:receptionDiary.techCheck')}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!diaryCancelId} onOpenChange={(open) => !open && setDiaryCancelId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('dashboard:receptionDiary.cancelBooking')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('dashboard:receptionDiary.cancelConfirmation')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common:keep')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!diaryCancelId) return;
                if (diaryCancelId.type === 'visitor') {
                  diaryCancelVisitorMutation.mutate(diaryCancelId.id);
                } else {
                  diaryCancelContractorMutation.mutate(diaryCancelId.id);
                }
              }}
              className="bg-red-600 hover:bg-red-700"
            >
              {t('dashboard:receptionDiary.cancelBooking')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
