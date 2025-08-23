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
  TrendingUp,
  Send
} from "lucide-react";
import { format } from "date-fns";
import type { Report } from "@shared/schema";

export default function Reports() {
  const { toast } = useToast();
  const [dateFrom, setDateFrom] = useState<Date>(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000));
  const [dateTo, setDateTo] = useState<Date>(new Date());
  const [reportType, setReportType] = useState("weekly");
  const [emailRecipients, setEmailRecipients] = useState("");

  const { data: reports, isLoading } = useQuery<Report[]>({
    queryKey: ["/api/reports"],
  });

  const generateReportMutation = useMutation({
    mutationFn: async (data: { reportType: string; dateFrom: Date; dateTo: Date }) => {
      const response = await apiRequest("POST", "/api/reports/generate", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/reports"] });
      toast({
        title: "Success",
        description: "Report generated successfully!",
      });
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
    if (!emailRecipients.trim()) {
      toast({
        title: "Error",
        description: "Please enter email recipients",
        variant: "destructive",
      });
      return;
    }

    const recipients = emailRecipients
      .split(",")
      .map(email => email.trim())
      .filter(email => email.length > 0);

    if (recipients.length === 0) {
      toast({
        title: "Error",
        description: "Please enter valid email addresses",
        variant: "destructive",
      });
      return;
    }

    emailReportMutation.mutate({
      id: reportId,
      recipients,
    });
  };

  const formatReportType = (type: string) => {
    if (type.startsWith("auto_")) {
      return `Auto ${type.replace("auto_", "").charAt(0).toUpperCase() + type.replace("auto_", "").slice(1)}`;
    }
    return type.charAt(0).toUpperCase() + type.slice(1);
  };

  const getReportTypeColor = (type: string) => {
    if (type.startsWith("auto_")) return "bg-green-100 text-green-800";
    return "bg-blue-100 text-blue-800";
  };

  if (isLoading) {
    return <div>Loading reports...</div>;
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-slate-800">Reports & Analytics</h2>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Generate New Report */}
        <GlassCard>
          <div className="flex items-center mb-6">
            <Plus className="mr-3 text-blue-600" size={24} />
            <h3 className="text-lg font-semibold text-slate-800">Generate New Report</h3>
          </div>
          
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="reportType" className="text-sm font-medium text-slate-700">
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
                  <SelectItem value="custom">Custom Range</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-sm font-medium text-slate-700">From Date</Label>
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
            <TrendingUp className="mr-3 text-blue-600" size={24} />
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
            
            <div className="space-y-2">
              <Label className="text-sm font-medium text-slate-700">
                Email Recipients (comma-separated)
              </Label>
              <Input
                type="text"
                placeholder="email1@company.com, email2@company.com"
                value={emailRecipients}
                onChange={(e) => setEmailRecipients(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-white/30 bg-white/50 focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-800"
                data-testid="input-email-recipients"
              />
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
            className="bg-gradient-to-r from-green-600 to-emerald-600 text-white font-medium hover:shadow-lg transition-all duration-300"
            data-testid="button-export-all"
          >
            <Download className="mr-2" size={16} />
            Export All
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
                          disabled={emailReportMutation.isPending || !emailRecipients.trim()}
                          data-testid={`button-email-report-${report.id}`}
                        >
                          <Send size={12} className="mr-1" />
                          Email
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          data-testid={`button-download-report-${report.id}`}
                        >
                          <Download size={12} className="mr-1" />
                          PDF
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