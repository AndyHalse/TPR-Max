import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { apiRequest } from "@/lib/queryClient";
import GlassCard from "@/components/GlassCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useToast } from "@/hooks/use-toast";
import { 
  FileText, 
  Calendar as CalendarIcon, 
  Mail, 
  Plus,
  Send,
  BarChart3,
  UserCheck,
  Printer,
  Trash2,
  AlertTriangle,
  ExternalLink,
  Shield
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
import { format } from "date-fns";
import type { Report, Staff } from "@shared/schema";
import { Checkbox } from "@/components/ui/checkbox";

export default function Reports() {
  const { toast } = useToast();
  const [dateFrom, setDateFrom] = useState<Date>(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000));
  const [dateTo, setDateTo] = useState<Date>(new Date());
  const [reportType, setReportType] = useState("weekly");
  const [emailRecipients, setEmailRecipients] = useState("");
  const [selectedStaff, setSelectedStaff] = useState<string[]>([]);
  const [showStaffSelection, setShowStaffSelection] = useState(false);

  const [loneWorkerPage, setLoneWorkerPage] = useState(1);
  const LONE_WORKER_LIMIT = 50;
  const { data: loneWorkerData } = useQuery<any>({
    queryKey: [`/api/lone-worker/sessions?page=${loneWorkerPage}&limit=${LONE_WORKER_LIMIT}`],
    refetchInterval: 60000,
  });
  const loneWorkerSessions: any[] = loneWorkerData?.sessions ?? [];
  const loneWorkerTotal: number = loneWorkerData?.total ?? 0;
  const loneWorkerTotalPages: number = loneWorkerData?.totalPages ?? 1;

  const { data: reports, isLoading } = useQuery<Report[]>({
    queryKey: ["/api/reports"],
  });

  const { data: settings } = useQuery<{ email?: string; reportRecipients?: string }>({
    queryKey: ["/api/settings"],
  });

  const { data: staff } = useQuery<Staff[]>({
    queryKey: ["/api/staff"],
  });

  const generateReportMutation = useMutation({
    mutationFn: async (data: { reportType: string; dateFrom: Date; dateTo: Date }) => {
      const response = await apiRequest("POST", "/api/reports/generate", data);
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/reports"] });
      toast({
        title: "Success",
        description: "Report generated successfully!",
      });
      
      // Open the generated report in a new window
      if (data.id) {
        const reportUrl = `/api/reports/${data.id}/view`;
        window.open(reportUrl, '_blank', 'width=1024,height=768,scrollbars=yes,resizable=yes');
      }
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to generate report",
        variant: "destructive",
      });
    },
  });

  const emailReportMutation = useMutation({
    mutationFn: async (data: { id: string; recipients: string[] }) => {
      const response = await apiRequest("POST", `/api/reports/${data.id}/email`, {
        recipients: data.recipients,
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/reports"] });
      toast({
        title: "Success",
        description: "Report email sent successfully!",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to send report email",
        variant: "destructive",
      });
    },
  });

  const deleteReportMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiRequest("DELETE", `/api/reports/${id}`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/reports"] });
      toast({ title: "Report deleted" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to delete report", variant: "destructive" });
    },
  });

  const clearAllReportsMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("DELETE", "/api/reports");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/reports"] });
      toast({ title: "All reports cleared" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to clear reports", variant: "destructive" });
    },
  });

  const handleGenerateReport = () => {
    if (!dateFrom || !dateTo) {
      toast({
        title: "Error",
        description: "Please select both start and end dates",
        variant: "destructive",
      });
      return;
    }

    if (dateFrom > dateTo) {
      toast({
        title: "Error",
        description: "Start date must be before end date",
        variant: "destructive",
      });
      return;
    }

    generateReportMutation.mutate({
      reportType,
      dateFrom,
      dateTo,
    });
  };

  const handleEmailReport = (reportId: string) => {
    let recipients: string[] = [];
    
    if (selectedStaff.length > 0) {
      // Use selected staff emails (prioritized)
      recipients = selectedStaff.map(staffId => {
        const staffMember = staff?.find(s => s.id === staffId);
        return staffMember?.email || `${staffMember?.firstName?.toLowerCase()}.${staffMember?.lastName?.toLowerCase()}@company.com`;
      });
    } else if (emailRecipients.trim()) {
      // Use manually entered emails if provided
      recipients = emailRecipients
        .split(",")
        .map(email => email.trim())
        .filter(email => email.length > 0);
    } else {
      // Use administrator email from company settings
      recipients = [settings?.email || "admin@company.com"];
    }

    if (recipients.length === 0) {
      toast({
        title: "Error",
        description: "Please select staff members or provide email recipients",
        variant: "destructive",
      });
      return;
    }

    emailReportMutation.mutate({
      id: reportId,
      recipients,
    });
  };

  const handlePrintReport = (reportId: string) => {
    const reportUrl = `/api/reports/${reportId}/view?print=true`;
    const printWindow = window.open(reportUrl, '_blank', 'width=1024,height=768,scrollbars=yes,resizable=yes');
    if (printWindow) {
      printWindow.addEventListener('load', () => {
        setTimeout(() => printWindow.print(), 500);
      });
    }
  };

  const handleStaffSelection = (staffId: string, checked: boolean) => {
    if (checked) {
      setSelectedStaff(prev => [...prev, staffId]);
    } else {
      setSelectedStaff(prev => prev.filter(id => id !== staffId));
    }
  };

  const formatReportType = (type: string) => {
    if (type.startsWith("auto_")) {
      return `Auto ${type.replace("auto_", "").charAt(0).toUpperCase() + type.replace("auto_", "").slice(1)}`;
    }
    
    const typeMap: Record<string, string> = {
      daily: "Daily Visitor Log",
      weekly: "Weekly Visitor Log", 
      monthly: "Monthly Visitor Log",
      staff_attendance: "Staff Attendance",
      contractor_activity: "Contractor Activity",
      contractor_compliance: "Contractor Compliance",
      site_headcount: "Site Headcount / Roll Call",
      evacuation_readiness: "Evacuation Readiness",
    };
    
    return typeMap[type] || type.charAt(0).toUpperCase() + type.slice(1);
  };

  const getReportTypeColor = (type: string) => {
    if (type.startsWith("auto_")) return "bg-green-100 text-green-800";
    
    const colorMap: Record<string, string> = {
      daily: "bg-blue-100 text-blue-800",
      weekly: "bg-blue-100 text-blue-800",
      monthly: "bg-indigo-100 text-indigo-800",
      staff_attendance: "bg-emerald-100 text-emerald-800",
      contractor_activity: "bg-orange-100 text-orange-800",
      contractor_compliance: "bg-yellow-100 text-yellow-800",
      site_headcount: "bg-purple-100 text-purple-800",
      evacuation_readiness: "bg-red-100 text-red-800",
    };
    
    return colorMap[type] || "bg-blue-100 text-blue-800";
  };

  if (isLoading) {
    return <div>Loading reports...</div>;
  }

  return (
    <div className="space-y-4 sm:space-y-8 p-3 sm:p-6 rounded-xl bg-background min-h-screen">
      <div className="flex items-center justify-between">
        <h2 className="text-xl sm:text-2xl font-bold text-fixed">Reports & Analytics</h2>
      </div>

      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Generate New Report */}
        <GlassCard>
          <div className="flex items-center mb-6">
            <Plus className="mr-3 text-blue-600" size={24} />
            <h3 className="text-lg font-semibold text-fixed">Generate New Report</h3>
          </div>
          
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="reportType" className="text-sm font-medium text-variable">
                Report Type
              </Label>
              <Select value={reportType} onValueChange={setReportType}>
                <SelectTrigger className="w-full px-4 py-3 rounded-xl border border-white/30 bg-white/50" data-testid="select-report-type">
                  <SelectValue placeholder="Select report type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="daily">Daily Visitor Log</SelectItem>
                  <SelectItem value="weekly">Weekly Visitor Log</SelectItem>
                  <SelectItem value="monthly">Monthly Visitor Log</SelectItem>
                  <SelectItem value="staff_attendance">Staff Attendance Report</SelectItem>
                  <SelectItem value="contractor_activity">Contractor Activity Report</SelectItem>
                  <SelectItem value="contractor_compliance">Contractor Compliance Report</SelectItem>
                  <SelectItem value="site_headcount">Site Headcount / Roll Call</SelectItem>
                  <SelectItem value="evacuation_readiness">Evacuation Readiness Report</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-sm font-medium text-variable">From Date</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className="w-full px-4 py-3 rounded-xl border border-white/30 bg-white/50 justify-start text-left font-normal"
                      data-testid="button-date-from"
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {dateFrom ? format(dateFrom, "MMM dd, yyyy") : "Pick a date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={dateFrom}
                      onSelect={(date) => date && setDateFrom(date)}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>
              
              <div className="space-y-2">
                <Label className="text-sm font-medium text-variable">To Date</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className="w-full px-4 py-3 rounded-xl border border-white/30 bg-white/50 justify-start text-left font-normal"
                      data-testid="button-date-to"
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {dateTo ? format(dateTo, "MMM dd, yyyy") : "Pick a date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={dateTo}
                      onSelect={(date) => date && setDateTo(date)}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </div>
            
            <Button
              onClick={handleGenerateReport}
              disabled={generateReportMutation.isPending}
              className="w-full gradient-blue text-white font-medium hover:shadow-lg transition-all duration-300"
              data-testid="button-generate-report"
            >
              <FileText className="mr-2" size={16} />
              {generateReportMutation.isPending ? "Generating..." : "Generate Report"}
            </Button>
          </div>
        </GlassCard>

        {/* Quick Stats */}
        <GlassCard>
          <div className="flex items-center mb-6">
            <BarChart3 className="mr-3 text-blue-600" size={24} />
            <h3 className="text-lg font-semibold text-fixed">Quick Stats</h3>
          </div>
          
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="text-center p-4 bg-white/50 rounded-xl">
                <div className="text-2xl font-bold text-blue-600 mb-1">
                  {reports?.length || 0}
                </div>
                <div className="text-sm text-variable">Total Reports</div>
              </div>
              
              <div className="text-center p-4 bg-white/50 rounded-xl">
                <div className="text-2xl font-bold text-green-600 mb-1">
                  {reports?.filter(r => r.emailSent).length || 0}
                </div>
                <div className="text-sm text-variable">Reports Emailed</div>
              </div>
            </div>
            
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium text-variable">Email Recipients</Label>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowStaffSelection(!showStaffSelection)}
                  className="text-xs hover:bg-blue-50"
                  data-testid="button-toggle-staff-selection"
                >
                  <UserCheck className="mr-1" size={12} />
                  {showStaffSelection ? 'Hide Staff' : 'Select Staff'}
                </Button>
              </div>

              {showStaffSelection && (
                <div className="space-y-2 max-h-48 overflow-y-auto border border-white/30 rounded-xl p-3 bg-white/30">
                  <Label className="text-xs font-medium text-variable">Select Staff Members:</Label>
                  {staff && staff.length > 0 ? (
                    <>
                      {staff.map((staffMember) => (
                        <div key={staffMember.id} className="flex items-center space-x-2">
                          <Checkbox
                            id={`staff-${staffMember.id}`}
                            checked={selectedStaff.includes(staffMember.id)}
                            onCheckedChange={(checked) => handleStaffSelection(staffMember.id, checked === true)}
                            data-testid={`checkbox-staff-${staffMember.id}`}
                          />
                          <Label htmlFor={`staff-${staffMember.id}`} className="text-sm text-variable cursor-pointer">
                            {staffMember.firstName} {staffMember.lastName} 
                            {staffMember.department && ` (${staffMember.department})`}
                            {staffMember.email && <span className="text-xs text-variable ml-1">- {staffMember.email}</span>}
                          </Label>
                        </div>
                      ))}
                      {selectedStaff.length > 0 && (
                        <p className="text-xs text-blue-600 mt-2 font-medium">
                          ✓ {selectedStaff.length} staff member{selectedStaff.length !== 1 ? 's' : ''} selected
                        </p>
                      )}
                    </>
                  ) : (
                    <p className="text-xs text-variable">No staff members found</p>
                  )}
                </div>
              )}

              <div className="space-y-2">
                <Label className="text-sm font-medium text-variable">
                  Additional Email Recipients (optional)
                </Label>
                <Input
                  type="email"
                  placeholder="Enter email addresses separated by commas"
                  value={emailRecipients}
                  onChange={(e) => setEmailRecipients(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-white/30 bg-white/50 focus:outline-none focus:ring-2 focus:ring-blue-500 text-fixed"
                  data-testid="input-email-recipients"
                />
                <div className="text-xs text-variable bg-blue-50 p-2 rounded-lg">
                  {selectedStaff.length > 0 
                    ? `📧 Will send to ${selectedStaff.length} selected staff member${selectedStaff.length !== 1 ? 's' : ''}${emailRecipients.trim() ? ' + manual recipients' : ''}` 
                    : emailRecipients.trim() 
                      ? "📧 Will send to manual recipients only" 
                      : `📧 Default recipient: ${settings?.email || 'admin@company.com'}`
                  }
                </div>
              </div>
            </div>
          </div>
        </GlassCard>
      </div>

      {/* Reports List */}
      <GlassCard>
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-semibold text-fixed">Generated Reports</h3>
          {reports && reports.length > 0 && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-red-600 border-red-200 hover:bg-red-50 hover:border-red-300"
                  disabled={clearAllReportsMutation.isPending}
                >
                  <Trash2 size={14} className="mr-1.5" />
                  Clear All Reports
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle className="flex items-center gap-2">
                    <AlertTriangle className="text-red-500" size={20} />
                    Clear All Reports?
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    This will permanently delete all {reports.length} generated report{reports.length !== 1 ? 's' : ''} for your company. This action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    className="bg-red-600 hover:bg-red-700 text-white"
                    onClick={() => clearAllReportsMutation.mutate()}
                  >
                    Yes, clear all
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
        
        {!reports || reports.length === 0 ? (
          <div className="text-center py-12">
            <FileText className="mx-auto h-12 w-12 text-variable mb-4" />
            <p className="text-variable text-lg">No reports generated yet</p>
            <p className="text-variable text-sm mt-2">Generate your first report to get started</p>
          </div>
        ) : (
          <>
            {/* ── Mobile card list (hidden on sm+) ── */}
            <div className="sm:hidden space-y-3">
              {reports.map((report) => {
                const reportUrl = `/api/reports/${report.id}/view`;
                return (
                  <div
                    key={report.id}
                    className="bg-white/40 dark:bg-white/10 rounded-xl p-4 space-y-3 cursor-pointer active:opacity-70"
                    onClick={() => window.open(reportUrl, '_blank')}
                    data-testid={`report-${report.id}`}
                  >
                    {/* Title row */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <FileText className="text-blue-600 flex-shrink-0" size={18} />
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-fixed truncate">
                            {formatReportType(report.reportType)}
                          </div>
                          <div className="text-xs text-variable">
                            Generated {new Date(report.generatedAt).toLocaleDateString()}
                          </div>
                        </div>
                      </div>
                      <ExternalLink size={14} className="text-blue-500 flex-shrink-0 mt-0.5" />
                    </div>
                    {/* Period */}
                    <div className="text-xs text-variable">
                      {new Date(report.dateFrom).toLocaleDateString()} – {new Date(report.dateTo).toLocaleDateString()}
                    </div>
                    {/* Status + email badge */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge className={getReportTypeColor(report.reportType)}>
                        {formatReportType(report.reportType)}
                      </Badge>
                      {report.emailSent && (
                        <span className="flex items-center text-xs text-green-600">
                          <Mail size={11} className="mr-1" />
                          Emailed
                        </span>
                      )}
                    </div>
                    {/* Action buttons */}
                    <div className="flex gap-2 pt-1" onClick={(e) => e.stopPropagation()}>
                      <Button
                        size="sm"
                        variant="outline"
                        className="flex-1 text-xs"
                        onClick={() => window.open(reportUrl, '_blank')}
                        data-testid={`button-view-report-${report.id}`}
                      >
                        <ExternalLink size={12} className="mr-1" />
                        View
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="flex-1 text-xs"
                        onClick={() => handleEmailReport(report.id)}
                        disabled={emailReportMutation.isPending}
                        data-testid={`button-email-report-${report.id}`}
                      >
                        <Send size={12} className="mr-1" />
                        Email
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="flex-1 text-xs"
                        onClick={() => handlePrintReport(report.id)}
                        data-testid={`button-print-report-${report.id}`}
                      >
                        <Printer size={12} className="mr-1" />
                        Print
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-red-600 border-red-200 hover:bg-red-50 px-2.5"
                        onClick={() => deleteReportMutation.mutate(report.id)}
                        disabled={deleteReportMutation.isPending}
                        data-testid={`button-delete-report-${report.id}`}
                      >
                        <Trash2 size={12} />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* ── Desktop table (hidden below sm) ── */}
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full">
                <thead className="bg-white/50">
                  <tr>
                    <th className="px-6 py-4 text-left text-xs font-medium text-variable uppercase tracking-wider">Report</th>
                    <th className="px-6 py-4 text-left text-xs font-medium text-variable uppercase tracking-wider">Period</th>
                    <th className="px-6 py-4 text-left text-xs font-medium text-variable uppercase tracking-wider">Stats</th>
                    <th className="px-6 py-4 text-left text-xs font-medium text-variable uppercase tracking-wider">Status</th>
                    <th className="px-6 py-4 text-left text-xs font-medium text-variable uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/20">
                  {reports.map((report) => {
                    const reportUrl = `/api/reports/${report.id}/view`;
                    return (
                      <tr
                        key={report.id}
                        className="hover:bg-white/20 cursor-pointer"
                        onClick={() => window.open(reportUrl, '_blank')}
                        data-testid={`report-${report.id}`}
                      >
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center">
                            <FileText className="mr-3 text-blue-600" size={16} />
                            <div>
                              <div className="text-sm font-medium text-fixed">{formatReportType(report.reportType)}</div>
                              <div className="text-xs text-variable">Generated {new Date(report.generatedAt).toLocaleDateString()}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-variable">
                          {new Date(report.dateFrom).toLocaleDateString()} - {new Date(report.dateTo).toLocaleDateString()}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-variable">
                            <div>{report.totalVisitors}</div>
                            <div className="text-xs text-variable">{report.avgDuration}</div>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="space-y-1">
                            <Badge className={getReportTypeColor(report.reportType)}>{formatReportType(report.reportType)}</Badge>
                            {report.emailSent && (
                              <div className="flex items-center text-xs text-green-600">
                                <Mail size={12} className="mr-1" />
                                Emailed {report.emailSentAt ? new Date(report.emailSentAt).toLocaleDateString() : ""}
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                          <div className="flex space-x-2">
                            <Button size="sm" variant="outline" onClick={() => handleEmailReport(report.id)} disabled={emailReportMutation.isPending} data-testid={`button-email-report-${report.id}`}>
                              <Send size={12} className="mr-1" />Email
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => window.open(reportUrl, '_blank')} data-testid={`button-view-report-${report.id}`}>
                              <ExternalLink size={12} className="mr-1" />View
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => handlePrintReport(report.id)} className="hover:bg-[var(--background)]" data-testid={`button-print-report-${report.id}`}>
                              <Printer size={12} className="mr-1" />Print
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => deleteReportMutation.mutate(report.id)} disabled={deleteReportMutation.isPending} className="text-red-600 border-red-200 hover:bg-red-50 hover:border-red-300" data-testid={`button-delete-report-${report.id}`}>
                              <Trash2 size={12} />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </GlassCard>

      {/* Lone Worker Session Log */}
      <GlassCard>
        <div className="flex items-center gap-3 mb-5">
          <div className="w-9 h-9 bg-amber-100 dark:bg-amber-900/40 rounded-xl flex items-center justify-center flex-shrink-0">
            <Shield className="text-amber-600 dark:text-amber-400" size={18} />
          </div>
          <div>
            <h3 className="text-base font-bold text-fixed">Lone Worker Sessions</h3>
            <p className="text-xs text-variable">{loneWorkerTotal} session{loneWorkerTotal !== 1 ? 's' : ''} on record</p>
          </div>
        </div>

        {loneWorkerSessions.length === 0 ? (
          <div className="text-center py-8">
            <Shield className="mx-auto h-10 w-10 text-variable mb-3" />
            <p className="text-variable">No lone worker sessions recorded yet</p>
            <p className="text-xs text-variable mt-1">Sessions appear here when staff or contractors are placed under lone worker protection</p>
          </div>
        ) : (
          <>
            {/* Mobile card list */}
            <div className="sm:hidden space-y-2">
              {loneWorkerSessions.map((session: any) => (
                <div key={session.id} className="bg-white/40 dark:bg-white/10 rounded-xl p-3 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-sm text-fixed">{session.personName}</span>
                    <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${session.status === 'active' ? 'bg-amber-100 text-amber-700' : session.status === 'ended_ok' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                      {session.status === 'active' ? 'Active' : session.status === 'ended_ok' ? 'Ended OK' : session.status === 'escalated' ? 'Escalated' : session.status}
                    </span>
                  </div>
                  <p className="text-xs text-variable capitalize">{session.personType}</p>
                  <p className="text-xs text-variable">{new Date(session.startedAt).toLocaleString()}</p>
                  {session.endedAt && <p className="text-xs text-variable">Ended: {new Date(session.endedAt).toLocaleString()}</p>}
                  <p className="text-xs text-variable">Check-ins completed: {session.checkInsCompleted ?? 0}</p>
                  {session.escalationsFired > 0 && <p className="text-xs text-red-600 font-medium">Escalation level {session.escalationsFired}</p>}
                </div>
              ))}
            </div>

            {/* Desktop table */}
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-white/50 dark:bg-white/5">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-variable uppercase tracking-wider">Person</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-variable uppercase tracking-wider">Type</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-variable uppercase tracking-wider">Started</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-variable uppercase tracking-wider">Ended</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-variable uppercase tracking-wider">Check-ins</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-variable uppercase tracking-wider">Status</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-variable uppercase tracking-wider">Escalation</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/20">
                  {loneWorkerSessions.map((session: any) => (
                    <tr key={session.id} className="hover:bg-white/20 dark:hover:bg-white/5">
                      <td className="px-4 py-3 font-medium text-fixed">{session.personName}</td>
                      <td className="px-4 py-3 text-variable capitalize">{session.personType}</td>
                      <td className="px-4 py-3 text-variable">{new Date(session.startedAt).toLocaleString()}</td>
                      <td className="px-4 py-3 text-variable">{session.endedAt ? new Date(session.endedAt).toLocaleString() : '—'}</td>
                      <td className="px-4 py-3 text-variable">{session.checkInsCompleted ?? 0}</td>
                      <td className="px-4 py-3">
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${session.status === 'active' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' : session.status === 'ended_ok' ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300' : 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'}`}>
                          {session.status === 'active' ? 'Active' : session.status === 'ended_ok' ? 'Ended OK' : session.status === 'escalated' ? 'Escalated' : session.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-variable">
                        {session.escalationLevel > 0 ? (
                          <span className="text-red-600 font-medium">Level {session.escalationLevel}</span>
                        ) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination controls */}
            {loneWorkerTotalPages > 1 && (
              <div className="flex items-center justify-between pt-3 border-t border-white/20">
                <p className="text-xs text-variable">Page {loneWorkerPage} of {loneWorkerTotalPages} ({loneWorkerTotal} total)</p>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => setLoneWorkerPage(p => Math.max(1, p - 1))} disabled={loneWorkerPage === 1} className="h-7 px-3 text-xs">Previous</Button>
                  <Button size="sm" variant="outline" onClick={() => setLoneWorkerPage(p => Math.min(loneWorkerTotalPages, p + 1))} disabled={loneWorkerPage >= loneWorkerTotalPages} className="h-7 px-3 text-xs">Next</Button>
                </div>
              </div>
            )}
          </>
        )}
      </GlassCard>
    </div>
  );
}