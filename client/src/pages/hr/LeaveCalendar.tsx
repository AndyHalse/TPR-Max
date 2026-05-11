import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Calendar, ChevronLeft, ChevronRight, CheckCircle, XCircle, Clock, Loader2 } from "lucide-react";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const LEAVE_COLORS: Record<string, string> = {
  annual: "bg-blue-100 text-blue-800 border-blue-200",
  sick: "bg-yellow-100 text-yellow-800 border-yellow-200",
  compassionate: "bg-purple-100 text-purple-800 border-purple-200",
  maternity: "bg-pink-100 text-pink-800 border-pink-200",
  paternity: "bg-indigo-100 text-indigo-800 border-indigo-200",
  unpaid: "bg-gray-100 text-gray-800 border-gray-200",
  other: "bg-orange-100 text-orange-800 border-orange-200",
};

export default function LeaveCalendar() {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [filterDept, setFilterDept] = useState("all");
  const qc = useQueryClient();
  const { toast } = useToast();

  const start = new Date(year, month, 1).toISOString().slice(0, 10);
  const end = new Date(year, month + 1, 0).toISOString().slice(0, 10);

  const { data: leaveData = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/leave/calendar", start, end],
    queryFn: () => fetch(`/api/leave/calendar?start=${start}&end=${end}`, { credentials: "include" }).then(r => r.json()),
  });

  const { data: pendingData = [], isLoading: pendingLoading } = useQuery<any[]>({
    queryKey: ["/api/leave/pending-approval"],
    queryFn: () => fetch("/api/leave/pending-approval", { credentials: "include" }).then(r => r.json()),
  });

  const approve = useMutation({
    mutationFn: (id: string) => apiRequest("PUT", `/api/leave/${id}/approve`, {}),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/leave"] }); toast({ title: "Leave approved" }); },
    onError: () => toast({ title: "Error", description: "Failed to approve leave", variant: "destructive" }),
  });

  const decline = useMutation({
    mutationFn: (id: string) => apiRequest("PUT", `/api/leave/${id}/decline`, { declineReason: "Declined by manager" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/leave"] }); toast({ title: "Leave declined" }); },
    onError: () => toast({ title: "Error", description: "Failed to decline leave", variant: "destructive" }),
  });

  const departments = Array.from(new Set(leaveData.map((l: any) => l.department).filter(Boolean)));

  const filtered = filterDept === "all" ? leaveData : leaveData.filter((l: any) => l.department === filterDept);

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDay = (new Date(year, month, 1).getDay() + 6) % 7; // Monday = 0

  const prev = () => { if (month === 0) { setMonth(11); setYear(y => y - 1); } else setMonth(m => m - 1); };
  const next = () => { if (month === 11) { setMonth(0); setYear(y => y + 1); } else setMonth(m => m + 1); };

  const leaveForDay = (day: number) => {
    const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    return filtered.filter((l: any) => dateStr >= l.start_date && dateStr <= l.end_date);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold flex items-center gap-2"><Calendar className="h-6 w-6 text-blue-600" /> Leave Calendar</h1>
        <Select value={filterDept} onValueChange={setFilterDept}>
          <SelectTrigger className="w-48"><SelectValue placeholder="All departments" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All departments</SelectItem>
            {departments.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {pendingData.length > 0 && (
        <Card className="border-yellow-200 bg-yellow-50">
          <CardHeader className="pb-2"><CardTitle className="text-base text-yellow-800 flex items-center gap-2"><Clock className="h-4 w-4" /> {pendingData.length} Pending Approval{pendingData.length !== 1 ? "s" : ""}</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-2">
              {pendingData.map((l: any) => (
                <div key={l.id} className="flex items-center justify-between bg-white rounded-lg border border-yellow-200 p-3">
                  <div>
                    <span className="font-medium">{l.first_name} {l.last_name}</span>
                    <span className="text-gray-500 text-sm ml-2">— {l.days_taken}d {l.leave_type} leave</span>
                    <div className="text-xs text-gray-400">{new Date(l.start_date).toLocaleDateString("en-GB")} — {new Date(l.end_date).toLocaleDateString("en-GB")}</div>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white" disabled={approve.isPending} onClick={() => approve.mutate(l.id)}>
                      {approve.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
                    </Button>
                    <Button size="sm" variant="outline" className="text-red-600 border-red-200" disabled={decline.isPending} onClick={() => decline.mutate(l.id)}>
                      {decline.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <XCircle className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <Button variant="ghost" size="sm" onClick={prev}><ChevronLeft className="h-4 w-4" /></Button>
            <h2 className="text-lg font-semibold">{MONTHS[month]} {year}</h2>
            <Button variant="ghost" size="sm" onClick={next}><ChevronRight className="h-4 w-4" /></Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-blue-600" /></div>
          ) : (
            <div>
              <div className="grid grid-cols-7 gap-1 mb-1">
                {DAYS.map(d => <div key={d} className="text-xs text-center font-medium text-gray-500 py-1">{d}</div>)}
              </div>
              <div className="grid grid-cols-7 gap-1">
                {Array.from({ length: firstDay }).map((_, i) => <div key={`empty-${i}`} />)}
                {Array.from({ length: daysInMonth }).map((_, i) => {
                  const day = i + 1;
                  const isToday = day === today.getDate() && month === today.getMonth() && year === today.getFullYear();
                  const leaves = leaveForDay(day);
                  return (
                    <div key={day} className={`min-h-[60px] rounded-lg p-1 border ${isToday ? "border-blue-400 bg-blue-50" : "border-gray-100"}`}>
                      <div className={`text-xs text-right mb-1 ${isToday ? "font-bold text-blue-700" : "text-gray-500"}`}>{day}</div>
                      {leaves.slice(0, 2).map((l: any, idx) => (
                        <div key={idx} className={`text-xs truncate px-1 rounded border mb-0.5 ${LEAVE_COLORS[l.leave_type] || "bg-gray-100 text-gray-800 border-gray-200"}`}>
                          {l.first_name}
                        </div>
                      ))}
                      {leaves.length > 2 && <div className="text-xs text-gray-400 pl-1">+{leaves.length - 2}</div>}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-3">
        {Object.entries(LEAVE_COLORS).map(([type, cls]) => (
          <div key={type} className={`text-xs px-2 py-1 rounded border capitalize ${cls}`}>{type}</div>
        ))}
      </div>
    </div>
  );
}
