import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Calendar, ChevronLeft, ChevronRight, CheckCircle, XCircle, Clock, Loader2, Plus, AlertTriangle, Info } from "lucide-react";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const LEAVE_TYPES: Array<{ value: string; label: string }> = [
  { value: "annual", label: "Annual leave" },
  { value: "sick", label: "Sick leave" },
  { value: "compassionate", label: "Compassionate" },
  { value: "maternity", label: "Maternity" },
  { value: "paternity", label: "Paternity" },
  { value: "unpaid", label: "Unpaid" },
  { value: "other", label: "Other" },
];

const LEAVE_COLORS: Record<string, string> = {
  annual: "bg-blue-100 text-blue-800 border-blue-200",
  sick: "bg-yellow-100 text-yellow-800 border-yellow-200",
  compassionate: "bg-purple-100 text-purple-800 border-purple-200",
  maternity: "bg-pink-100 text-pink-800 border-pink-200",
  paternity: "bg-indigo-100 text-indigo-800 border-indigo-200",
  unpaid: "bg-gray-100 text-gray-800 border-gray-200",
  other: "bg-orange-100 text-orange-800 border-orange-200",
};

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function LeaveCalendar() {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [filterDept, setFilterDept] = useState("all");
  const [bookOpen, setBookOpen] = useState(false);
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
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/leave"] }); qc.invalidateQueries({ queryKey: ["/api/leave/calendar"] }); qc.invalidateQueries({ queryKey: ["/api/leave/pending-approval"] }); toast({ title: "Leave approved" }); },
    onError: () => toast({ title: "Error", description: "Failed to approve leave", variant: "destructive" }),
  });

  const decline = useMutation({
    mutationFn: (id: string) => apiRequest("PUT", `/api/leave/${id}/decline`, { declineReason: "Declined by manager" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/leave"] }); qc.invalidateQueries({ queryKey: ["/api/leave/calendar"] }); qc.invalidateQueries({ queryKey: ["/api/leave/pending-approval"] }); toast({ title: "Leave declined" }); },
    onError: () => toast({ title: "Error", description: "Failed to decline leave", variant: "destructive" }),
  });

  const departments = Array.from(new Set(leaveData.map((l: any) => l.department).filter(Boolean)));
  const filtered = filterDept === "all" ? leaveData : leaveData.filter((l: any) => l.department === filterDept);

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDay = (new Date(year, month, 1).getDay() + 6) % 7;

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
        <div className="flex items-center gap-2">
          <Select value={filterDept} onValueChange={setFilterDept}>
            <SelectTrigger className="w-48"><SelectValue placeholder="All departments" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All departments</SelectItem>
              {departments.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button onClick={() => setBookOpen(true)} className="gap-2" data-testid="button-book-leave">
            <Plus className="h-4 w-4" /> Book Leave
          </Button>
        </div>
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
                      {leaves.slice(0, 2).map((l: any, idx: number) => (
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

      <BookLeaveDialog open={bookOpen} onOpenChange={setBookOpen} />
    </div>
  );
}

function BookLeaveDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const qc = useQueryClient();
  const { toast } = useToast();

  const { data: me } = useQuery<any>({
    queryKey: ["/api/staff/me"],
    enabled: open,
  });

  const { data: staffList = [] } = useQuery<any[]>({
    queryKey: ["/api/staff"],
    enabled: open,
  });

  const [staffId, setStaffId] = useState<string>("");
  const [leaveType, setLeaveType] = useState<string>("annual");
  const [startDate, setStartDate] = useState<string>(todayStr());
  const [endDate, setEndDate] = useState<string>(todayStr());
  const [halfDay, setHalfDay] = useState<"none" | "am" | "pm">("none");
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");

  // Default to current user when dialog opens & staff list available
  useEffect(() => {
    if (!open) return;
    if (staffId) return;
    if (!staffList.length) return;
    const myUserId = me?.id;
    const match = myUserId ? staffList.find((s: any) => s.userId === myUserId || s.id === myUserId) : null;
    if (match) setStaffId(match.id);
    else if (staffList[0]) setStaffId(staffList[0].id);
  }, [open, me, staffList, staffId]);

  // Reset on close
  useEffect(() => {
    if (!open) {
      setStaffId("");
      setLeaveType("annual");
      setStartDate(todayStr());
      setEndDate(todayStr());
      setHalfDay("none");
      setReason("");
      setNotes("");
    }
  }, [open]);

  const selectedStaff = staffList.find((s: any) => s.id === staffId);
  const sameDay = startDate === endDate;
  const wdpw = Number(selectedStaff?.workingDaysPerWeek ?? selectedStaff?.working_days_per_week ?? 5);

  const validRange = startDate && endDate && startDate <= endDate;

  const { data: workingDaysData } = useQuery<{ days: number; bankHolidays: string[] }>({
    queryKey: ["/api/leave/working-days", startDate, endDate, sameDay ? halfDay : "none", wdpw],
    queryFn: () => {
      const hd = sameDay ? halfDay : "none";
      const qs = `start=${startDate}&end=${endDate}&halfDay=${hd}&workingDaysPerWeek=${wdpw}`;
      return fetch(`/api/leave/working-days?${qs}`, { credentials: "include" }).then(r => r.json());
    },
    enabled: open && !!validRange,
  });

  const { data: overlapData } = useQuery<{ count: number; overlaps: any[] }>({
    queryKey: ["/api/leave/overlap-check", startDate, endDate, staffId],
    queryFn: () => fetch(`/api/leave/overlap-check?start=${startDate}&end=${endDate}&excludeStaffId=${staffId}`, { credentials: "include" }).then(r => r.json()),
    enabled: open && !!validRange && !!staffId,
  });

  const { data: balanceData } = useQuery<{ balance: { entitlement: number; taken: number; pending: number; remaining: number } }>({
    queryKey: ["/api/leave/balance", staffId],
    queryFn: () => fetch(`/api/leave/balance/${staffId}`, { credentials: "include" }).then(r => r.json()),
    enabled: open && !!staffId,
  });

  const submit = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", `/api/staff/${staffId}/leave`, {
        leaveType,
        startDate,
        endDate,
        halfDay: sameDay ? halfDay : "none",
        reason: reason.trim() || null,
        notes: notes.trim() || null,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/leave/calendar"] });
      qc.invalidateQueries({ queryKey: ["/api/leave/pending-approval"] });
      qc.invalidateQueries({ queryKey: ["/api/leave/balance", staffId] });
      toast({ title: "Leave request submitted", description: "It now needs manager approval." });
      onOpenChange(false);
    },
    onError: (err: any) => {
      toast({ title: "Could not submit", description: err?.message || "Please try again.", variant: "destructive" });
    },
  });

  const sortedStaff = useMemo(() => {
    return [...staffList]
      .filter((s: any) => s.isActive !== false)
      .sort((a: any, b: any) =>
        `${a.firstName || a.first_name || ""} ${a.lastName || a.last_name || ""}`.localeCompare(
          `${b.firstName || b.first_name || ""} ${b.lastName || b.last_name || ""}`
        )
      );
  }, [staffList]);

  const otherReasonMissing = leaveType === "other" && !reason.trim();
  const dateInvalid = !validRange;
  const canSubmit = !!staffId && !otherReasonMissing && !dateInvalid && !submit.isPending;

  const days = workingDaysData?.days ?? 0;
  const bankHols = workingDaysData?.bankHolidays || [];
  const balance = balanceData?.balance;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Plus className="h-5 w-5 text-blue-600" /> Book Leave</DialogTitle>
          <DialogDescription>Submit a leave request for approval by the line manager.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label>Staff member</Label>
            <Select value={staffId} onValueChange={setStaffId}>
              <SelectTrigger data-testid="select-staff"><SelectValue placeholder="Select a staff member" /></SelectTrigger>
              <SelectContent className="max-h-72">
                {sortedStaff.map((s: any) => (
                  <SelectItem key={s.id} value={s.id}>
                    {(s.firstName || s.first_name)} {(s.lastName || s.last_name)}
                    {s.department ? <span className="text-gray-400 text-xs ml-1">— {s.department}</span> : null}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Leave type</Label>
            <Select value={leaveType} onValueChange={setLeaveType}>
              <SelectTrigger data-testid="select-leave-type"><SelectValue /></SelectTrigger>
              <SelectContent>
                {LEAVE_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Start date</Label>
              <Input type="date" value={startDate} onChange={(e) => {
                setStartDate(e.target.value);
                if (endDate < e.target.value) setEndDate(e.target.value);
              }} data-testid="input-start-date" />
            </div>
            <div>
              <Label>End date</Label>
              <Input type="date" value={endDate} min={startDate} onChange={(e) => setEndDate(e.target.value)} data-testid="input-end-date" />
            </div>
          </div>

          {sameDay && (
            <div>
              <Label>Half day</Label>
              <Select value={halfDay} onValueChange={(v: any) => setHalfDay(v)}>
                <SelectTrigger data-testid="select-half-day"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Full day</SelectItem>
                  <SelectItem value="am">Morning only (AM)</SelectItem>
                  <SelectItem value="pm">Afternoon only (PM)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          <div>
            <Label>
              Reason {leaveType === "other" && <span className="text-red-500">*</span>}
            </Label>
            <Input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={leaveType === "other" ? "Required — describe the reason" : "Optional short reason"}
              data-testid="input-reason"
            />
          </div>

          <div>
            <Label>Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Anything else your manager should know" data-testid="input-notes" />
          </div>

          {/* Calculation summary */}
          <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm space-y-1">
            <div className="flex items-center gap-2 text-blue-900 font-medium">
              <Info className="h-4 w-4" /> Requesting {days} working day{days === 1 ? "" : "s"}
            </div>
            {leaveType === "annual" && balance && (
              <div className="text-blue-800 text-xs">
                Annual entitlement: <strong>{balance.taken}</strong> of <strong>{balance.entitlement}</strong> days taken
                {balance.pending > 0 ? <> · {balance.pending} pending</> : null}
                {" — "}<strong>{Math.max(0, balance.remaining - days).toFixed(1)}</strong> days remaining if approved.
              </div>
            )}
            {bankHols.length > 0 && (
              <div className="text-blue-800 text-xs">
                {bankHols.length} UK bank holiday{bankHols.length === 1 ? "" : "s"} in this range — not deducted.
              </div>
            )}
          </div>

          {/* Overlap warning */}
          {overlapData && overlapData.count > 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm flex items-start gap-2" data-testid="banner-overlap">
              <AlertTriangle className="h-4 w-4 text-amber-700 mt-0.5" />
              <div className="text-amber-900">
                <div className="font-medium">{overlapData.count} other {overlapData.count === 1 ? "person is" : "people are"} off on these dates.</div>
                <div className="text-xs text-amber-800 mt-0.5">
                  {overlapData.overlaps.slice(0, 5).map(o => `${o.first_name} ${o.last_name}`).join(", ")}
                  {overlapData.overlaps.length > 5 ? `, +${overlapData.overlaps.length - 5} more` : ""}
                </div>
              </div>
            </div>
          )}

          {/* Annual leave over-allocation warning */}
          {leaveType === "annual" && balance && days > balance.remaining && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-red-700 mt-0.5" />
              <div className="text-red-900">
                This request exceeds the remaining annual entitlement ({balance.remaining} days left, {days} requested).
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submit.isPending}>Cancel</Button>
          <Button onClick={() => submit.mutate()} disabled={!canSubmit} data-testid="button-submit-leave">
            {submit.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Submit request
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
