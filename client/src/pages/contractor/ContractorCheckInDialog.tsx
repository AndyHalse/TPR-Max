import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { StaffSearchSelect } from "@/components/StaffSearchSelect";
import { useTranslation } from "react-i18next";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  checkInWorkerId: string | null;
  checkInWorkerName: string;
  checkInMutation: any;
}

export default function ContractorCheckInDialog({ open, onOpenChange, checkInWorkerId, checkInWorkerName, checkInMutation }: Props) {
  const { t } = useTranslation(["contractors", "common"]);
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
          <DialogTitle>{t("checkInDialog.title", { name: checkInWorkerName })}</DialogTitle>
          <DialogDescription>{t("checkInDialog.description", { name: checkInWorkerName }) || t("checkInDialog.defaultDescription", { name: checkInWorkerName })}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>{t("checkInDialog.hostStaffMember")}</Label>
            <StaffSearchSelect
              staff={staffList.filter((s: any) => s.isActive !== false)}
              value={selectedHost}
              onChange={setSelectedHost}
              placeholder={t("checkInDialog.searchHostPlaceholder")}
            />
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={handleClose}>{t("common:cancel")}</Button>
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
            {checkInMutation.isPending ? t("checkInDialog.checkingIn") : t("checkInDialog.confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
