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
  Download, 
  Plus,
  Clock,
  Users,
  Send,
  BarChart3,
  UserCheck,
  Printer
} from "lucide-react";
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

  const downloadPDFMutation = useMutation({
    mutationFn: async (reportId: string) => {
      const response = await apiRequest("GET", `/api/reports/${reportId}/pdf`);
      return response.blob();
    },
    onSuccess: (blob, reportId) => {
      const report = reports?.find(r => r.id === reportId);
      if (report) {
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        const fileName = `${formatReportType(report.reportType)}_${format(new Date(report.dateFrom), "yyyy-MM-dd")}_to_${format(new Date(report.dateTo), "yyyy-MM-dd")}.pdf`;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.URL.revokeObjectURL(url);
      }
      toast({
        title: "Success",
        description: "Report PDF downloaded successfully!",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to download PDF",
        variant: "destructive",
      });
    },
  });

  const exportAllMutation = useMutation({
    mutationFn: async () => {
      if (!reports || reports.length === 0) {
        throw new Error("No reports available to export");
      }

      // Download all PDFs one by one
      for (const report of reports) {
        const response = await apiRequest("GET", `/api/reports/${report.id}/pdf`);
        const blob = await response.blob();
        
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        const fileName = `${formatReportType(report.reportType)}_${format(new Date(report.dateFrom), "yyyy-MM-dd")}_to_${format(new Date(report.dateTo), "yyyy-MM-dd")}.pdf`;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.URL.revokeObjectURL(url);
        
        // Small delay between downloads
        await new Promise(resolve => setTimeout(resolve, 500));
      }
      
      return reports.length;
    },
    onSuccess: (count) => {
      toast({
        title: "Export Complete",
        description: `Successfully exported ${count} report PDFs!`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Export Failed",
        description: error.message || "Failed to export all reports",
        variant: "destructive",
      });
    },
  });

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
      daily: "Daily Report",
      weekly: "Weekly Report", 
      monthly: "Monthly Report",
      quarterly: "Quarterly Report",
      yearly: "Yearly Report",
      custom: "Custom Range Report",
      visitor_analysis: "Visitor Analysis",
      staff_attendance: "Staff Attendance",
      staff_by_department: "Staff by Department",
      contractor_summary: "Contractor Summary",
      contractor_safety: "Contractor Safety",
      contractor_attendance: "Contractor Attendance",
      contractor_compliance: "Contractor Compliance",
      security_audit: "Security Audit",
      emergency_readiness: "Emergency Readiness",
      compliance_check: "Compliance Check",
      department_analytics: "Department Analytics",
      peak_hours_analysis: "Peak Hours Analysis",
      visitor_satisfaction: "Visitor Satisfaction"
    };
    
    return typeMap[type] || type.charAt(0).toUpperCase() + type.slice(1);
  };

  const getReportTypeColor = (type: string) => {
    if (type.startsWith("auto_")) return "bg-green-100 text-green-800";
    
    const colorMap: Record<string, string> = {
      daily: "bg-blue-100 text-blue-800",
      weekly: "bg-blue-100 text-blue-800",
      monthly: "bg-indigo-100 text-indigo-800",
      quarterly: "bg-purple-100 text-purple-800",
      yearly: "bg-violet-100 text-violet-800",
      custom: "bg-gray-100 text-gray-800",
      visitor_analysis: "bg-emerald-100 text-emerald-800",
      staff_attendance: "bg-blue-100 text-blue-800",
      staff_by_department: "bg-indigo-100 text-indigo-800",
      contractor_summary: "bg-orange-100 text-orange-800",
      contractor_safety: "bg-red-100 text-red-800",
      contractor_attendance: "bg-amber-100 text-amber-800",
      contractor_compliance: "bg-yellow-100 text-yellow-800",
      security_audit: "bg-red-100 text-red-800",
      emergency_readiness: "bg-yellow-100 text-yellow-800",
      compliance_check: "bg-teal-100 text-teal-800",
      department_analytics: "bg-cyan-100 text-cyan-800",
      peak_hours_analysis: "bg-rose-100 text-rose-800",
      visitor_satisfaction: "bg-pink-100 text-pink-800"
    };
    
    return colorMap[type] || "bg-blue-100 text-blue-800";
  };

  if (isLoading) {
    return <div>Loading reports...</div>;
  }

  return (
    <div className="space-y-8 p-6 rounded-xl bg-background min-h-screen">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-fixed">Reports & Analytics</h2>
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
                  <SelectItem value="daily">Daily Report</SelectItem>
                  <SelectItem value="weekly">Weekly Report</SelectItem>
                  <SelectItem value="monthly">Monthly Report</SelectItem>
                  <SelectItem value="quarterly">Quarterly Report</SelectItem>
                  <SelectItem value="yearly">Yearly Report</SelectItem>
                  <SelectItem value="custom">Custom Range</SelectItem>
                  <SelectItem value="visitor_analysis">Visitor Analysis Report</SelectItem>
                  <SelectItem value="staff_attendance">Staff Attendance Report</SelectItem>
                  <SelectItem value="staff_by_department">Staff by Department Report</SelectItem>
                  <SelectItem value="contractor_summary">Contractor Summary Report</SelectItem>
                  <SelectItem value="contractor_safety">Contractor Safety Report</SelectItem>
                  <SelectItem value="contractor_attendance">Contractor Attendance Report</SelectItem>
                  <SelectItem value="contractor_compliance">Contractor Compliance Report</SelectItem>
                  <SelectItem value="security_audit">Security Audit Report</SelectItem>
                  <SelectItem value="emergency_readiness">Emergency Readiness Report</SelectItem>
                  <SelectItem value="compliance_check">Compliance Check Report</SelectItem>
                  <SelectItem value="department_analytics">Department Analytics</SelectItem>
                  <SelectItem value="peak_hours_analysis">Peak Hours Analysis</SelectItem>
                  <SelectItem value="visitor_satisfaction">Visitor Satisfaction Report</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                <Label className="text-sm font-medium text-slate-700">To Date</Label>
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
            <h3 className="text-lg font-semibold text-slate-800">Quick Stats</h3>
          </div>
          
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="text-center p-4 bg-white/50 rounded-xl">
                <div className="text-2xl font-bold text-blue-600 mb-1">
                  {reports?.length || 0}
                </div>
                <div className="text-sm text-slate-600">Total Reports</div>
              </div>
              
              <div className="text-center p-4 bg-white/50 rounded-xl">
                <div className="text-2xl font-bold text-green-600 mb-1">
                  {reports?.filter(r => r.emailSent).length || 0}
                </div>
                <div className="text-sm text-slate-600">Reports Emailed</div>
              </div>
            </div>
            
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium text-slate-700">Email Recipients</Label>
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
                  <Label className="text-xs font-medium text-slate-600">Select Staff Members:</Label>
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
                          <Label htmlFor={`staff-${staffMember.id}`} className="text-sm text-slate-700 cursor-pointer">
                            {staffMember.firstName} {staffMember.lastName} 
                            {staffMember.department && ` (${staffMember.department})`}
                            {staffMember.email && <span className="text-xs text-slate-500 ml-1">- {staffMember.email}</span>}
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
                    <p className="text-xs text-slate-500">No staff members found</p>
                  )}
                </div>
              )}

              <div className="space-y-2">
                <Label className="text-sm font-medium text-slate-700">
                  Additional Email Recipients (optional)
                </Label>
                <Input
                  type="email"
                  placeholder="Enter email addresses separated by commas"
                  value={emailRecipients}
                  onChange={(e) => setEmailRecipients(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-white/30 bg-white/50 focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-800"
                  data-testid="input-email-recipients"
                />
                <div className="text-xs text-slate-600 bg-blue-50 p-2 rounded-lg">
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
          <h3 className="text-lg font-semibold text-slate-800">Generated Reports</h3>
          <Button
            variant="outline"
            onClick={() => {
              if (reports && reports.length > 0) {
                exportAllMutation.mutate();
              }
            }}
            disabled={exportAllMutation.isPending || !reports || reports.length === 0}
            className="bg-gradient-to-r from-green-600 to-emerald-600 text-white font-medium hover:shadow-lg transition-all duration-300 disabled:opacity-50"
            data-testid="button-export-all"
          >
            <Download className="mr-2" size={16} />
            {exportAllMutation.isPending ? 'Exporting...' : 'Export All'}
          </Button>
        </div>
        
        {!reports || reports.length === 0 ? (
          <div className="text-center py-12">
            <FileText className="mx-auto h-12 w-12 text-gray-400 mb-4" />
            <p className="text-slate-600 text-lg">No reports generated yet</p>
            <p className="text-slate-500 text-sm mt-2">Generate your first report to get started</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-white/50">
                <tr>
                  <th className="px-6 py-4 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                    Report
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                    Period
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                    Stats
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/20">
                {reports.map((report) => (
                  <tr key={report.id} className="hover:bg-white/20" data-testid={`report-${report.id}`}>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <FileText className="mr-3 text-blue-600" size={16} />
                        <div>
                          <div className="text-sm font-medium text-slate-800">
                            {formatReportType(report.reportType)}
                          </div>
                          <div className="text-xs text-slate-500">
                            Generated {new Date(report.generatedAt).toLocaleDateString()}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600">
                      {new Date(report.dateFrom).toLocaleDateString()} - {new Date(report.dateTo).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-slate-600">
                        <div>{report.totalVisitors} visitors</div>
                        <div className="text-xs text-slate-500">Avg: {report.avgDuration}</div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="space-y-1">
                        <Badge className={getReportTypeColor(report.reportType)}>
                          {formatReportType(report.reportType)}
                        </Badge>
                        {report.emailSent && (
                          <div className="flex items-center text-xs text-green-600">
                            <Mail size={12} className="mr-1" />
                            Emailed {report.emailSentAt ? new Date(report.emailSentAt).toLocaleDateString() : ""}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex space-x-2">
                        <Button
                          size="sm"
                          variant="outline"
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
                          onClick={() => {
                            const reportUrl = `/api/reports/${report.id}/view`;
                            window.open(reportUrl, '_blank', 'width=1024,height=768,scrollbars=yes,resizable=yes');
                          }}
                          data-testid={`button-view-report-${report.id}`}
                        >
                          <FileText size={12} className="mr-1" />
                          View
                        </Button>

                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => downloadPDFMutation.mutate(report.id)}
                          disabled={downloadPDFMutation.isPending}
                          data-testid={`button-download-report-${report.id}`}
                        >
                          <Download size={12} className="mr-1" />
                          PDF
                        </Button>
                        
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => console.log('Print report:', report.id)}
                          className="hover:bg-gray-50"
                          data-testid={`button-print-report-${report.id}`}
                        >
                          <Printer size={12} className="mr-1" />
                          Print
                        </Button>
                      </div>
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