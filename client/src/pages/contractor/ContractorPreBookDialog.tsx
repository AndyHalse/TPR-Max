import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarPicker } from "@/components/ui/calendar";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { StaffSearchSelect } from "@/components/StaffSearchSelect";
import { CheckCircle, CalendarPlus } from "lucide-react";
import { format } from "date-fns";
import type { ContractorWorker } from "@shared/schema";

interface Props {
  worker: ContractorWorker | null;
  companyName: string;
  onClose: () => void;
}

function defaultTime() {
  const nextHour = new Date();
  nextHour.setMinutes(0);
  nextHour.setHours(nextHour.getHours() + 1);
  return `${String(nextHour.getHours()).padStart(2, '0')}:00`;
}

export default function ContractorPreBookDialog({ worker, companyName, onClose }: Props) {
  const { toast } = useToast();
  const [date, setDate] = useState(new Date());
  const [time, setTime] = useState(defaultTime);
  const [purpose, setPurpose] = useState("Site work");
  const [duration, setDuration] = useState("8");
  const [notes, setNotes] = useState("");
  const [host, setHost] = useState('');

  const { data: staffList = [] } = useQuery<any[]>({ queryKey: ['/api/staff'] });

  const resetForm = () => {
    setDate(new Date());
    setTime(defaultTime());
    setPurpose("Site work");
    setDuration("8");
    setNotes("");
    setHost('');
  };

  const preBookWorkerMutation = useMutation({
    mutationFn: async (data: { worker: ContractorWorker; date: Date; time: string; purpose: string; duration: string; notes: string; companyName: string; hostStaffId?: string; hostName?: string }) => {
      const response = await apiRequest('POST', '/api/contractors/prebookings', {
        companyName: data.companyName,
        contactEmail: data.worker.email || '',
        contactPhone: data.worker.phone || '',
        workerName: `${data.worker.firstName} ${data.worker.lastName}`,
        workerEmail: data.worker.email || '',
        purpose: data.purpose,
        scheduledDate: data.date.toISOString(),
        scheduledTime: data.time,
        duration: data.duration,
        notes: data.notes,
        documentsRequired: [],
        hostStaffId: data.hostStaffId || undefined,
        hostName: data.hostName || undefined,
      });
      return response.json();
    },
    onSuccess: (data: any) => {
      toast({
        title: "Worker pre-booked successfully",
        description: data?.emailSent
          ? "Pre-booking pass with QR code has been emailed to the contractor"
          : "The booking has been created and will appear in the Reception Diary"
      });
      queryClient.invalidateQueries({ queryKey: ['/api/contractors/prebookings'] });
      queryClient.invalidateQueries({ queryKey: ['/api/contractors/prebookings/today'] });
      queryClient.invalidateQueries({ queryKey: ['/api/contractors/prebookings/upcoming'] });
      queryClient.invalidateQueries({ queryKey: ['/api/reception/diary'] });
      resetForm();
      onClose();
    },
    onError: (error: any) => toast({ title: "Failed to pre-book worker", description: error.message, variant: "destructive" }),
  });

  return (
    <Dialog open={!!worker} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="w-[95vw] sm:max-w-md" onFocusOutside={(e) => e.preventDefault()} onInteractOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarPlus className="w-5 h-5 text-indigo-600" />
            Pre-Book Worker
          </DialogTitle>
          <DialogDescription>
            Schedule {worker?.firstName} {worker?.lastName} from {companyName} for an upcoming site visit.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="p-3 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
            <div className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-green-600" />
              <span className="text-sm font-medium text-green-700 dark:text-green-400">
                {worker?.firstName} {worker?.lastName} - Cleared for Work
              </span>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Date</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-full justify-start text-left font-normal">
                  <CalendarPlus className="mr-2 h-4 w-4" />
                  {format(date, "PPP")}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <CalendarPicker
                  mode="single"
                  selected={date}
                  onSelect={(d) => d && setDate(d)}
                  disabled={(d) => { const today = new Date(); today.setHours(0,0,0,0); const check = new Date(d); check.setHours(0,0,0,0); return check < today; }}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Arrival Time</Label>
              <Input
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                min={(() => {
                  const today = new Date(); today.setHours(0,0,0,0);
                  const selectedDay = new Date(date); selectedDay.setHours(0,0,0,0);
                  if (selectedDay.getTime() === today.getTime()) {
                    const now = new Date();
                    return `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
                  }
                  return undefined;
                })()}
              />
            </div>
            <div className="space-y-2">
              <Label>Duration (hours)</Label>
              <select value={duration} onChange={(e) => setDuration(e.target.value)} className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring appearance-none">
                <option value="2">2 hours</option>
                <option value="4">4 hours (Half day)</option>
                <option value="8">8 hours (Full day)</option>
                <option value="10">10 hours</option>
                <option value="12">12 hours</option>
              </select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Purpose</Label>
            <select value={purpose} onChange={(e) => setPurpose(e.target.value)} className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring appearance-none">
              <option value="Site work">Site Work</option>
              <option value="Maintenance">Maintenance</option>
              <option value="Installation">Installation</option>
              <option value="Inspection">Inspection</option>
              <option value="Repair">Repair</option>
              <option value="Survey">Survey</option>
              <option value="Other">Other</option>
            </select>
          </div>

          <div className="space-y-2">
            <Label>Host Staff Member *</Label>
            <StaffSearchSelect
              staff={staffList.filter((s: any) => s.isActive !== false)}
              value={host}
              onChange={setHost}
              placeholder="Search by name or department…"
            />
          </div>

          <div className="space-y-2">
            <Label>Notes (optional)</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Any additional notes..." rows={2} />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={() => {
              if (!worker) return;
              const hostStaff = staffList.find((s: any) => s.id === host);
              preBookWorkerMutation.mutate({
                worker, date, time, purpose, duration, notes, companyName,
                hostStaffId: host || undefined,
                hostName: hostStaff ? `${hostStaff.firstName} ${hostStaff.lastName}` : undefined,
              });
            }}
            disabled={preBookWorkerMutation.isPending || !host}
            className="bg-indigo-600 hover:bg-indigo-700 text-white"
          >
            {preBookWorkerMutation.isPending ? "Booking..." : "Confirm Pre-Booking"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
