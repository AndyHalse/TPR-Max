import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { StaffSearchSelect } from "@/components/StaffSearchSelect";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  checkInWorkerId: string | null;
  checkInWorkerName: string;
  checkInMutation: any;
}

export default function ContractorCheckInDialog({ open, onOpenChange, checkInWorkerId, checkInWorkerName, checkInMutation }: Props) {
  const [selectedHost, setSelectedHost] = useState('');
  const { data: staffList = [] } = useQuery<any[]>({ queryKey: ['/api/staff'] });

  const handleClose = () => {
    onOpenChange(false);
    setSelectedHost('');
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(open) => { if (!open) handleClose(); }}
    >
      <DialogContent
        className="w-[95vw] sm:max-w-md"
        onFocusOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Select Host for {checkInWorkerName}</DialogTitle>
          <DialogDescription>Who is {checkInWorkerName} visiting today?</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Host Staff Member *</Label>
            <StaffSearchSelect
              staff={staffList.filter((s: any) => s.isActive !== false)}
              value={selectedHost}
              onChange={setSelectedHost}
              placeholder="Search by name or department…"
            />
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={handleClose}>Cancel</Button>
          <Button
            disabled={!selectedHost || checkInMutation.isPending}
            onClick={() => {
              if (!checkInWorkerId) return;
              const host = staffList.find((s: any) => s.id === selectedHost);
              checkInMutation.mutate({
                workerId: checkInWorkerId,
                hostStaffId: selectedHost,
                hostName: host ? `${host.firstName} ${host.lastName}` : undefined,
              });
              handleClose();
            }}
            className="bg-green-600 hover:bg-green-700 text-white"
          >
            {checkInMutation.isPending ? "Checking In..." : "Check In & Print Pass"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
