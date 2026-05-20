import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Link } from "wouter";
import { CheckSquare, Loader2, Plus, AlertCircle, CalendarClock, Users, Settings } from "lucide-react";

type Filter = "in_progress" | "starting_this_month" | "overdue";

export default function OnboardingOverview() {
  const { toast } = useToast();
  const [filter, setFilter] = useState<Filter>("in_progress");
  const [open, setOpen] = useState(false);

  const { data: summary } = useQuery<any>({
    queryKey: ["/api/onboarding/overview/summary"],
    queryFn: () => fetch("/api/onboarding/overview/summary", { credentials: "include" }).then(r => r.json()),
  });

  const { data: items = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/onboarding/overview", filter],
    queryFn: () => fetch(`/api/onboarding/overview?filter=${filter}`, { credentials: "include" }).then(r => r.json()),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <CheckSquare className="h-6 w-6 text-blue-600" /> Onboarding Overview
          </h1>
          <p className="text-gray-500 text-sm mt-1">Track new starters and pending onboarding tasks</p>
        </div>
        <div className="flex gap-2">
          <Link href="/settings/onboarding-template">
            <Button variant="outline" size="sm"><Settings className="h-4 w-4 mr-1" /> Template</Button>
          </Link>
          <Button onClick={() => setOpen(true)} data-testid="button-start-onboarding">
            <Plus className="h-4 w-4 mr-1" /> Start Onboarding
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <SummaryCard
          label="Starting this month"
          value={summary?.starting_this_month ?? 0}
          icon={<CalendarClock className="h-5 w-5 text-blue-600" />}
          active={filter === "starting_this_month"}
          onClick={() => setFilter("starting_this_month")}
          color="blue"
        />
        <SummaryCard
          label="In progress"
          value={summary?.in_progress ?? 0}
          icon={<Users className="h-5 w-5 text-amber-600" />}
          active={filter === "in_progress"}
          onClick={() => setFilter("in_progress")}
          color="amber"
        />
        <SummaryCard
          label="Overdue items"
          value={summary?.overdue_items ?? 0}
          icon={<AlertCircle className="h-5 w-5 text-red-600" />}
          active={filter === "overdue"}
          onClick={() => setFilter("overdue")}
          color="red"
        />
      </div>

      <Tabs value={filter} onValueChange={v => setFilter(v as Filter)}>
        <TabsList>
          <TabsTrigger value="in_progress">In progress</TabsTrigger>
          <TabsTrigger value="starting_this_month">Starting this month</TabsTrigger>
          <TabsTrigger value="overdue">Overdue</TabsTrigger>
        </TabsList>
      </Tabs>

      {isLoading ? (
        <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-blue-600" /></div>
      ) : items.length === 0 ? (
        <Card><CardContent className="text-center py-12">
          <CheckSquare className="h-12 w-12 mx-auto text-green-400 mb-3" />
          <p className="text-gray-500 font-medium">
            {filter === "overdue" ? "Nothing overdue — good work." : filter === "starting_this_month" ? "No new starters this month." : "All onboarding checklists complete."}
          </p>
        </CardContent></Card>
      ) : (
        <div className="space-y-3">
          {items.map((item: any) => <OnboardingRow key={item.id} item={item} />)}
        </div>
      )}

      <StartOnboardingDialog open={open} setOpen={setOpen} toast={toast} />
    </div>
  );
}

function SummaryCard({ label, value, icon, active, onClick, color }: any) {
  const colorMap: Record<string, string> = {
    blue: active ? "border-blue-500 bg-blue-50" : "hover:border-blue-300",
    amber: active ? "border-amber-500 bg-amber-50" : "hover:border-amber-300",
    red: active ? "border-red-500 bg-red-50" : "hover:border-red-300",
  };
  return (
    <Card className={`cursor-pointer transition-all border-2 ${colorMap[color]}`} onClick={onClick}>
      <CardContent className="pt-4 pb-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm text-gray-500">{label}</div>
            <div className="text-3xl font-bold mt-1">{value}</div>
          </div>
          {icon}
        </div>
      </CardContent>
    </Card>
  );
}

function OnboardingRow({ item }: any) {
  const days = item.days_since_start;
  const startStr = item.contract_start_date ? new Date(item.contract_start_date).toLocaleDateString("en-GB") : "—";
  const overdueList = (item.overdue_list || []) as Array<{ label: string; due_day_offset: number }>;

  return (
    <Link href={`/hr/staff/${item.staff_id}`}>
      <Card className="cursor-pointer hover:shadow-md transition-shadow">
        <CardContent className="pt-4 pb-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex-1 min-w-[180px]">
              <div className="font-medium">{item.first_name} {item.last_name}</div>
              <div className="text-sm text-gray-500">
                {item.department} · Start {startStr}
                {days !== null && days !== undefined && (
                  <span className="ml-2 text-xs">
                    {days < 0 ? `(starts in ${-days}d)` : days === 0 ? "(today)" : `(day ${days})`}
                  </span>
                )}
              </div>
              {overdueList.length > 0 && (
                <div className="mt-1 flex flex-wrap gap-1">
                  {overdueList.slice(0, 3).map((o, i) => (
                    <Badge key={i} variant="outline" className="text-xs border-red-300 bg-red-50 text-red-700">
                      <AlertCircle className="h-3 w-3 mr-1" /> {o.label}
                    </Badge>
                  ))}
                  {overdueList.length > 3 && (
                    <Badge variant="outline" className="text-xs border-red-300 bg-red-50 text-red-700">
                      +{overdueList.length - 3} more overdue
                    </Badge>
                  )}
                </div>
              )}
            </div>
            <div className="flex items-center gap-3">
              <div className="text-right">
                <div className="text-sm font-medium">{item.completed_items}/{item.total_items} tasks</div>
                <div className="w-32 h-2 bg-gray-200 rounded-full mt-1">
                  <div className="h-2 bg-blue-500 rounded-full" style={{ width: `${item.percent}%` }} />
                </div>
              </div>
              <Badge className={item.percent === 100 ? "bg-green-100 text-green-800" : item.percent >= 50 ? "bg-blue-100 text-blue-800" : "bg-yellow-100 text-yellow-800"}>
                {item.percent}%
              </Badge>
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

function StartOnboardingDialog({ open, setOpen, toast }: any) {
  const qc = useQueryClient();
  const [mode, setMode] = useState<"existing" | "new">("existing");
  const [staffId, setStaffId] = useState("");
  const [form, setForm] = useState({ firstName: "", lastName: "", email: "", department: "", jobTitle: "", contractStartDate: "" });

  const { data: eligible = [] } = useQuery<any[]>({
    queryKey: ["/api/onboarding/eligible-staff"],
    queryFn: () => fetch("/api/onboarding/eligible-staff", { credentials: "include" }).then(r => r.json()),
    enabled: open,
  });

  const startExisting = useMutation({
    mutationFn: () => apiRequest("POST", "/api/onboarding/start", { staffId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/onboarding/overview"] });
      qc.invalidateQueries({ queryKey: ["/api/onboarding/overview/summary"] });
      qc.invalidateQueries({ queryKey: ["/api/onboarding/eligible-staff"] });
      toast({ title: "Onboarding started" });
      setOpen(false);
      setStaffId("");
    },
    onError: () => toast({ title: "Error", description: "Failed to start onboarding", variant: "destructive" }),
  });

  const startNew = useMutation({
    mutationFn: () => apiRequest("POST", "/api/onboarding/start-new-starter", form),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/onboarding/overview"] });
      qc.invalidateQueries({ queryKey: ["/api/onboarding/overview/summary"] });
      toast({ title: "New starter added with onboarding" });
      setOpen(false);
      setForm({ firstName: "", lastName: "", email: "", department: "", jobTitle: "", contractStartDate: "" });
    },
    onError: () => toast({ title: "Error", description: "Failed to add new starter", variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Start Onboarding</DialogTitle>
          <DialogDescription>Begin the onboarding checklist for a new or existing staff member.</DialogDescription>
        </DialogHeader>

        <Tabs value={mode} onValueChange={v => setMode(v as any)}>
          <TabsList className="grid grid-cols-2 w-full">
            <TabsTrigger value="existing">Existing staff</TabsTrigger>
            <TabsTrigger value="new">New starter</TabsTrigger>
          </TabsList>
        </Tabs>

        {mode === "existing" ? (
          <div className="space-y-3">
            <div>
              <Label>Staff member</Label>
              <Select value={staffId} onValueChange={setStaffId}>
                <SelectTrigger><SelectValue placeholder="Select staff with no onboarding…" /></SelectTrigger>
                <SelectContent>
                  {eligible.length === 0 ? (
                    <div className="px-3 py-2 text-sm text-gray-500">Everyone already has onboarding</div>
                  ) : eligible.map((s: any) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.first_name} {s.last_name} — {s.department || "—"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-gray-500 mt-1">Uses the active onboarding template.</p>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>First name</Label>
                <Input value={form.firstName} onChange={e => setForm({ ...form, firstName: e.target.value })} />
              </div>
              <div>
                <Label>Last name</Label>
                <Input value={form.lastName} onChange={e => setForm({ ...form, lastName: e.target.value })} />
              </div>
            </div>
            <div>
              <Label>Email</Label>
              <Input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>Department</Label>
                <Input value={form.department} onChange={e => setForm({ ...form, department: e.target.value })} placeholder="General" />
              </div>
              <div>
                <Label>Job title</Label>
                <Input value={form.jobTitle} onChange={e => setForm({ ...form, jobTitle: e.target.value })} />
              </div>
            </div>
            <div>
              <Label>Contract start date</Label>
              <Input type="date" value={form.contractStartDate} onChange={e => setForm({ ...form, contractStartDate: e.target.value })} />
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          {mode === "existing" ? (
            <Button onClick={() => startExisting.mutate()} disabled={!staffId || startExisting.isPending}>
              {startExisting.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1" />} Start
            </Button>
          ) : (
            <Button
              onClick={() => startNew.mutate()}
              disabled={!form.firstName || !form.lastName || !form.email || !form.contractStartDate || startNew.isPending}
            >
              {startNew.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1" />} Add &amp; Start
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
