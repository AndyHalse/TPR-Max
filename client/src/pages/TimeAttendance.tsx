import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import GlassCard from "@/components/GlassCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from "@/components/ui/dialog";
import { Clock, Download, Calendar, Users, FileText, Eye, BarChart3, TrendingUp } from "lucide-react";
import { format, formatDuration, intervalToDuration } from "date-fns";

interface TimeAttendanceRecord {
  staffId: string;
  staffName: string;
  department: string;
  sessions: Array<{
    checkInTime: Date;
    checkOutTime: Date | null;
    hoursWorked: number;
    isManual: boolean;
  }>;
  totalHours: number;
}

export default function TimeAttendance() {
  const [dateFrom, setDateFrom] = useState(() => {
    // Default to today only
    return new Date().toISOString().split('T')[0];
  });
  
  const [dateTo, setDateTo] = useState(() => {
    return new Date().toISOString().split('T')[0];
  });

  const [advancedView, setAdvancedView] = useState(false);
  const [selectedStaff, setSelectedStaff] = useState<TimeAttendanceRecord | null>(null);

  const { data: timeAttendanceData, isLoading, refetch } = useQuery<TimeAttendanceRecord[]>({
    queryKey: ["/api/staff/time-attendance", dateFrom, dateTo],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (dateFrom) params.append('dateFrom', dateFrom);
      if (dateTo) params.append('dateTo', dateTo);
      
      const response = await fetch(`/api/staff/time-attendance?${params}`, {
        cache: 'no-cache', // Ensure fresh data
        headers: {
          'Cache-Control': 'no-cache',
        },
      });
      if (!response.ok) throw new Error('Failed to fetch data');
      const data = await response.json();
      
      // Parse dates
      return data.map((record: any) => ({
        ...record,
        sessions: record.sessions.map((session: any) => ({
          ...session,
          checkInTime: new Date(session.checkInTime),
          checkOutTime: session.checkOutTime ? new Date(session.checkOutTime) : null,
        }))
      })) as TimeAttendanceRecord[];
    },
    staleTime: 0, // Always refetch when the component mounts
    gcTime: 0, // Don't cache the data (React Query v5 syntax)
  });

  const handleDateChange = () => {
    // Force a fresh refetch with new parameters - this will trigger a new query
    refetch({ cancelRefetch: true });
  };

  const formatTime = (date: Date) => {
    return format(date, 'HH:mm');
  };

  const formatDate = (date: Date) => {
    return format(date, 'dd/MM/yyyy');
  };

  const formatHours = (hours: number) => {
    const duration = intervalToDuration({ start: 0, end: hours * 60 * 60 * 1000 });
    return formatDuration(duration, { format: ['hours', 'minutes'] }) || '0 minutes';
  };

  const exportToCSV = () => {
    if (!timeAttendanceData || !Array.isArray(timeAttendanceData)) return;

    const csvData = [
      ['Staff Name', 'Department', 'Date', 'Check In', 'Check Out', 'Hours Worked', 'Manual Entry'].join(',')
    ];

    timeAttendanceData.forEach((record: TimeAttendanceRecord) => {
      record.sessions.forEach((session) => {
        csvData.push([
          `"${record.staffName}"`,
          `"${record.department}"`,
          formatDate(session.checkInTime),
          formatTime(session.checkInTime),
          session.checkOutTime ? formatTime(session.checkOutTime) : 'Still on site',
          session.hoursWorked.toFixed(2),
          session.isManual ? 'Yes' : 'No'
        ].join(','));
      });
    });

    const blob = new Blob([csvData.join('\n')], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `time-attendance-${dateFrom}-to-${dateTo}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  };

  const totalStaff = timeAttendanceData?.length || 0;
  const totalHoursAllStaff = timeAttendanceData?.reduce((sum: number, record: TimeAttendanceRecord) => sum + record.totalHours, 0) || 0;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <Clock className="mx-auto h-8 w-8 text-blue-500 animate-spin" />
          <p className="mt-2 text-variable">Loading time & attendance data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-8 p-3 sm:p-6 rounded-xl bg-background min-h-screen">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-fixed">Time & Attendance Report</h2>
          <p className="text-sm sm:text-base text-variable mt-1 hidden sm:block">Track staff working hours and attendance patterns</p>
        </div>
        <div className="flex gap-2 flex-wrap sm:flex-nowrap">
          <Button
            onClick={() => setAdvancedView(!advancedView)}
            variant={advancedView ? "default" : "outline"}
            className={`${advancedView ? "gradient-blue text-white" : "bg-white/80 hover:bg-white border-white/30"} text-xs sm:text-sm whitespace-nowrap`}
            data-testid="button-advanced-view"
          >
            <Eye className="mr-1.5 sm:mr-2 flex-shrink-0" size={14} />
            {advancedView ? "Simple View" : "Advanced View"}
          </Button>
          <Button
            onClick={exportToCSV}
            className="gradient-blue text-white font-medium hover:shadow-lg transition-all duration-300 text-xs sm:text-sm whitespace-nowrap"
            data-testid="button-export-csv"
            disabled={!timeAttendanceData || !Array.isArray(timeAttendanceData) || timeAttendanceData.length === 0}
          >
            <Download className="mr-1.5 sm:mr-2 flex-shrink-0" size={14} />
            Export CSV
          </Button>
        </div>
      </div>

      {/* Date Range Controls */}
      <GlassCard>
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <Calendar className="text-blue-500" size={20} />
            <span className="font-medium text-variable">Date Range:</span>
          </div>
          <div className="flex items-center gap-2">
            <Label htmlFor="date-from" className="text-sm font-medium text-variable">From:</Label>
            <Input
              id="date-from"
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="w-auto"
              data-testid="input-date-from"
            />
          </div>
          <div className="flex items-center gap-2">
            <Label htmlFor="date-to" className="text-sm font-medium text-variable">To:</Label>
            <Input
              id="date-to"
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="w-auto"
              data-testid="input-date-to"
            />
          </div>
          <Button
            onClick={handleDateChange}
            variant="outline"
            className="bg-white/80 hover:bg-white border-white/30"
            data-testid="button-refresh-data"
          >
            Refresh Data
          </Button>
        </div>
      </GlassCard>

      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <GlassCard>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
              <Users className="text-blue-600" size={24} />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-fixed">Staff with Records</h3>
              <p className="text-2xl font-bold text-blue-600">{totalStaff}</p>
            </div>
          </div>
        </GlassCard>

        <GlassCard>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
              <Clock className="text-green-600" size={24} />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-fixed">Total Hours</h3>
              <p className="text-2xl font-bold text-green-600">{formatHours(totalHoursAllStaff)}</p>
            </div>
          </div>
        </GlassCard>

        <GlassCard>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
              <FileText className="text-purple-600" size={24} />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-fixed">Avg Hours/Staff</h3>
              <p className="text-2xl font-bold text-purple-600">
                {totalStaff > 0 ? formatHours(totalHoursAllStaff / totalStaff) : '0h'}
              </p>
            </div>
          </div>
        </GlassCard>
      </div>

      {/* Time & Attendance Records */}
      <div className="space-y-6">
        {!timeAttendanceData || !Array.isArray(timeAttendanceData) || timeAttendanceData.length === 0 ? (
          <GlassCard>
            <div className="text-center py-12">
              <Clock className="mx-auto h-12 w-12 text-variable mb-4" />
              <p className="text-variable text-lg">No time & attendance records found</p>
              <p className="text-variable text-sm mt-2">
                Try adjusting the date range or ensure staff have checked in/out
              </p>
            </div>
          </GlassCard>
        ) : (
          timeAttendanceData.map((record: TimeAttendanceRecord) => (
            <GlassCard key={record.staffId}>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div 
                    className="flex-1 cursor-pointer hover:bg-[var(--background)] rounded-lg p-2 -m-2 transition-colors"
                    onClick={() => setSelectedStaff(record)}
                    data-testid={`staff-card-${record.staffId}`}
                  >
                    <div className="flex items-center gap-3">
                      <div>
                        <h3 className="text-lg font-semibold text-fixed" data-testid={`staff-name-${record.staffId}`}>
                          {record.staffName}
                        </h3>
                        <p className="text-variable" data-testid={`staff-department-${record.staffId}`}>
                          {record.department}
                        </p>
                      </div>
                      <BarChart3 className="text-variable ml-auto" size={16} />
                    </div>
                  </div>
                  <div className="text-right ml-4">
                    <p className="text-sm text-variable">Total Hours</p>
                    <p className="text-xl font-bold text-blue-600" data-testid={`total-hours-${record.staffId}`}>
                      {formatHours(record.totalHours)}
                    </p>
                  </div>
                </div>

                {advancedView && (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-slate-200">
                          <th className="text-left py-2 text-variable font-medium">Date</th>
                          <th className="text-left py-2 text-variable font-medium">Check In</th>
                          <th className="text-left py-2 text-variable font-medium">Check Out</th>
                          <th className="text-left py-2 text-variable font-medium">Hours</th>
                          <th className="text-left py-2 text-variable font-medium">Type</th>
                        </tr>
                      </thead>
                      <tbody>
                        {record.sessions.map((session, index: number) => (
                          <tr key={index} className="border-b border-slate-100">
                            <td className="py-2 text-variable">
                              {formatDate(session.checkInTime)}
                            </td>
                            <td className="py-2 text-variable">
                              {formatTime(session.checkInTime)}
                            </td>
                            <td className="py-2 text-variable">
                              {session.checkOutTime ? formatTime(session.checkOutTime) : (
                                <span className="text-green-600 font-medium">Still on site</span>
                              )}
                            </td>
                            <td className="py-2 text-variable">
                              {formatHours(session.hoursWorked)}
                            </td>
                            <td className="py-2">
                              {session.isManual ? (
                                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-yellow-100 text-yellow-800">
                                  📝 Manual
                                </span>
                              ) : (
                                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
                                  🎫 Card
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                
                {!advancedView && record.sessions.length > 0 && (
                  <div className="text-sm text-variable text-center py-2">
                    {record.sessions.length} session(s) - Click staff name for detailed view
                  </div>
                )}
              </div>
            </GlassCard>
          ))
        )}
      </div>

      {/* Detailed Staff Modal */}
      <Dialog open={!!selectedStaff} onOpenChange={() => setSelectedStaff(null)}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <TrendingUp className="text-blue-500" size={20} />
              Detailed Report: {selectedStaff?.staffName}
            </DialogTitle>
            <DialogDescription>
              View detailed time attendance records and sessions for this staff member.
            </DialogDescription>
          </DialogHeader>
          
          {selectedStaff && (
            <div className="space-y-6">
              {/* Staff Summary */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-blue-50 p-4 rounded-lg">
                  <div className="flex items-center gap-2">
                    <Clock className="text-blue-600" size={16} />
                    <span className="text-sm font-medium text-blue-800">Total Hours</span>
                  </div>
                  <p className="text-xl font-bold text-blue-600 mt-1">
                    {formatHours(selectedStaff.totalHours)}
                  </p>
                </div>
                
                <div className="bg-green-50 p-4 rounded-lg">
                  <div className="flex items-center gap-2">
                    <Calendar className="text-green-600" size={16} />
                    <span className="text-sm font-medium text-green-800">Sessions</span>
                  </div>
                  <p className="text-xl font-bold text-green-600 mt-1">
                    {selectedStaff.sessions.length}
                  </p>
                </div>
                
                <div className="bg-purple-50 p-4 rounded-lg">
                  <div className="flex items-center gap-2">
                    <Users className="text-purple-600" size={16} />
                    <span className="text-sm font-medium text-purple-800">Department</span>
                  </div>
                  <p className="text-xl font-bold text-purple-600 mt-1">
                    {selectedStaff.department}
                  </p>
                </div>
              </div>

              {/* Detailed Sessions Table */}
              <div>
                <h3 className="text-lg font-semibold text-fixed mb-4">All Sessions</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm border border-slate-200 rounded-lg">
                    <thead className="bg-[var(--background)]">
                      <tr>
                        <th className="text-left py-3 px-4 text-variable font-medium">Date</th>
                        <th className="text-left py-3 px-4 text-variable font-medium">Check In</th>
                        <th className="text-left py-3 px-4 text-variable font-medium">Check Out</th>
                        <th className="text-left py-3 px-4 text-variable font-medium">Duration</th>
                        <th className="text-left py-3 px-4 text-variable font-medium">Entry Type</th>
                        <th className="text-left py-3 px-4 text-variable font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedStaff.sessions.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="text-center py-8 text-variable">
                            No sessions found for selected date range
                          </td>
                        </tr>
                      ) : (
                        selectedStaff.sessions.map((session, index) => (
                          <tr key={index} className="border-t border-slate-100 hover:bg-[var(--background)]">
                            <td className="py-3 px-4 text-variable">
                              {formatDate(session.checkInTime)}
                            </td>
                            <td className="py-3 px-4 text-variable">
                              {formatTime(session.checkInTime)}
                            </td>
                            <td className="py-3 px-4 text-variable">
                              {session.checkOutTime ? formatTime(session.checkOutTime) : (
                                <span className="text-green-600 font-medium">Still on site</span>
                              )}
                            </td>
                            <td className="py-3 px-4 text-variable font-medium">
                              {formatHours(session.hoursWorked)}
                            </td>
                            <td className="py-3 px-4">
                              {session.isManual ? (
                                <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                                  📝 Manual Entry
                                </span>
                              ) : (
                                <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                                  🎫 Card Scan
                                </span>
                              )}
                            </td>
                            <td className="py-3 px-4">
                              {session.checkOutTime ? (
                                <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                                  ✅ Complete
                                </span>
                              ) : (
                                <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-orange-100 text-orange-800">
                                  🔄 Active
                                </span>
                              )}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Analysis Section */}
              {selectedStaff.sessions.length > 0 && (
                <div className="bg-[var(--background)] p-4 rounded-lg">
                  <h4 className="font-medium text-fixed mb-2">Quick Analysis</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-variable">Average session length:</span>
                      <span className="ml-2 font-medium">
                        {formatHours(selectedStaff.totalHours / selectedStaff.sessions.length)}
                      </span>
                    </div>
                    <div>
                      <span className="text-variable">Longest session:</span>
                      <span className="ml-2 font-medium">
                        {formatHours(Math.max(...selectedStaff.sessions.map(s => s.hoursWorked)))}
                      </span>
                    </div>
                  </div>
                  
                  {/* Daily Breakdown */}
                  <div className="mt-4">
                    <h5 className="font-medium text-variable mb-2">Daily Breakdown</h5>
                    <div className="space-y-2">
                      {(() => {
                        // Group sessions by date
                        const sessionsByDate: Record<string, typeof selectedStaff.sessions> = {};
                        selectedStaff.sessions.forEach(session => {
                          const date = formatDate(session.checkInTime);
                          if (!sessionsByDate[date]) {
                            sessionsByDate[date] = [];
                          }
                          sessionsByDate[date].push(session);
                        });
                        
                        // Sort dates
                        const sortedDates = Object.keys(sessionsByDate).sort((a, b) => {
                          return new Date(a).getTime() - new Date(b).getTime();
                        });
                        
                        return sortedDates.map(date => {
                          const sessions = sessionsByDate[date];
                          const dailyHours = sessions.reduce((sum, s) => sum + s.hoursWorked, 0);
                          const isOvertime = dailyHours > 8;
                          
                          // Calculate break time between sessions
                          let breakTime = 0;
                          if (sessions.length > 1) {
                            // Sort sessions by check-in time
                            const sortedSessions = [...sessions].sort((a, b) => 
                              new Date(a.checkInTime).getTime() - new Date(b.checkInTime).getTime()
                            );
                            
                            for (let i = 1; i < sortedSessions.length; i++) {
                              const prevSession = sortedSessions[i - 1];
                              const currentSession = sortedSessions[i];
                              
                              if (prevSession.checkOutTime) {
                                const breakMinutes = (new Date(currentSession.checkInTime).getTime() - 
                                                     new Date(prevSession.checkOutTime).getTime()) / (1000 * 60);
                                if (breakMinutes > 0) {
                                  breakTime += breakMinutes;
                                }
                              }
                            }
                            breakTime = breakTime / 60; // Convert to hours
                          }
                          
                          return (
                            <div key={date} className="bg-[var(--card)] p-3 rounded-lg border border-slate-200">
                              <div className="flex justify-between items-center">
                                <span className="font-medium text-variable">{date}</span>
                                <div className="flex gap-3 items-center">
                                  <span className="text-variable text-sm">
                                    {sessions.length} session{sessions.length !== 1 ? 's' : ''}
                                  </span>
                                  <span className={`font-medium ${isOvertime ? 'text-orange-600' : 'text-green-600'}`}>
                                    {formatHours(dailyHours)}
                                    {isOvertime && ' (OT)'}
                                  </span>
                                  {breakTime > 0 && (
                                    <span className="text-blue-600 text-sm">
                                      Break: {formatHours(breakTime)}
                                    </span>
                                  )}
                                </div>
                              </div>
                              
                              {/* Show individual sessions for this day if multiple */}
                              {sessions.length > 1 && (
                                <div className="mt-2 pt-2 border-t border-slate-100">
                                  <div className="space-y-1">
                                    {sessions.map((session, idx) => (
                                      <div key={idx} className="flex justify-between text-xs text-variable">
                                        <span>
                                          Session {idx + 1}: {formatTime(session.checkInTime)} - {session.checkOutTime ? formatTime(session.checkOutTime) : 'Active'}
                                        </span>
                                        <span>{formatHours(session.hoursWorked)}</span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        });
                      })()}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}