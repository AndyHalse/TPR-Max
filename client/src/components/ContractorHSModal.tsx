import { useState } from "react";
import { Button } from "@/components/ui/button";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogFooter,
  DialogDescription 
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { AlertTriangle, Shield, Check } from "lucide-react";
import type { ContractorWorker } from "@shared/schema";

interface ContractorHSModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAccept: (worker: ContractorWorker) => void;
  worker: ContractorWorker;
  companyName: string;
}

export default function ContractorHSModal({ 
  isOpen, 
  onClose, 
  onAccept, 
  worker,
  companyName 
}: ContractorHSModalProps) {
  const [accepted, setAccepted] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  const handleAccept = async () => {
    if (!accepted) return;
    
    setIsProcessing(true);
    await onAccept(worker);
    setIsProcessing(false);
    setAccepted(false);
    onClose();
  };

  const handleClose = () => {
    setAccepted(false);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <div className="flex items-center gap-3 mb-2">
            <Shield className="h-8 w-8 text-blue-600" />
            <DialogTitle className="text-2xl">Health & Safety Rules Acceptance</DialogTitle>
          </div>
          <DialogDescription className="text-base mt-2">
            Contractor must accept these rules before entering the site
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4 my-4">
          {/* Contractor Info */}
          <div className="bg-blue-50 p-4 rounded-lg">
            <h3 className="font-semibold text-fixed mb-2">Contractor Details</h3>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>
                <span className="text-variable">Name:</span>
                <span className="ml-2 font-medium">{worker.firstName} {worker.lastName}</span>
              </div>
              <div>
                <span className="text-variable">Company:</span>
                <span className="ml-2 font-medium">{companyName}</span>
              </div>
            </div>
          </div>

          {/* H&S Rules */}
          <div className="border rounded-lg p-4 space-y-3 max-h-64 overflow-y-auto">
            <h3 className="font-semibold text-fixed flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-orange-500" />
              Site Health & Safety Rules
            </h3>
            
            <ol className="space-y-2 text-sm text-variable list-decimal list-inside">
              <li>All contractors must wear appropriate PPE at all times (hard hat, safety boots, hi-vis vest)</li>
              <li>Report to site office immediately upon arrival and departure</li>
              <li>Follow all site signage and designated walkways</li>
              <li>No smoking except in designated areas</li>
              <li>Report all accidents, incidents, and near misses immediately</li>
              <li>Do not operate any equipment unless authorized and trained</li>
              <li>Maintain a clean and tidy work area at all times</li>
              <li>Emergency assembly point is located at the main car park</li>
              <li>First aid facilities are available at the site office</li>
              <li>All work must comply with current CDM regulations</li>
              <li>Hot work permits required for any welding or cutting operations</li>
              <li>Working at height requires appropriate training and equipment</li>
            </ol>

            <div className="bg-yellow-50 p-3 rounded-lg mt-4">
              <p className="text-sm font-medium text-yellow-900">
                ⚠️ Important: Failure to comply with these rules may result in immediate removal from site
              </p>
            </div>
          </div>

          {/* Acceptance Checkbox */}
          <div className="flex items-start gap-3 p-4 bg-green-50 rounded-lg">
            <Checkbox 
              id="accept-rules" 
              checked={accepted}
              onCheckedChange={(checked) => setAccepted(checked as boolean)}
              className="mt-1"
            />
            <label 
              htmlFor="accept-rules" 
              className="text-sm font-medium text-fixed cursor-pointer"
            >
              I confirm that I have read, understood, and agree to comply with all site health & safety rules. 
              I understand that violation of these rules may result in immediate removal from the site and 
              potential suspension of site access privileges.
            </label>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={handleClose}
            disabled={isProcessing}
          >
            Cancel
          </Button>
          <Button
            onClick={handleAccept}
            disabled={!accepted || isProcessing}
            className="bg-green-600 hover:bg-green-700 text-white"
          >
            {isProcessing ? (
              "Processing..."
            ) : (
              <>
                <Check className="mr-2 h-4 w-4" />
                Accept & Check In
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}