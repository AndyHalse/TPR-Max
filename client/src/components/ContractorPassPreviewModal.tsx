import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Printer, X, Check, Building2, HardHat, Shield } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { ContractorWorker } from "@shared/schema";
import { printPassViaIframe } from "@/lib/printUtils";

interface ContractorPassPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  worker: ContractorWorker;
  companyName?: string;
}

export default function ContractorPassPreviewModal({
  isOpen,
  onClose,
  worker,
  companyName,
}: ContractorPassPreviewModalProps) {
  const [isPrinting, setIsPrinting] = useState(false);
  const { toast } = useToast();

  const handlePrint = () => {
    setIsPrinting(true);
    printPassViaIframe(`/api/passes/print/contractor/${worker.id}`);
    toast({
      title: "Sending to printer",
      description: "Contractor pass is being sent to the thermal printer.",
      duration: 4000,
    });
    setTimeout(() => setIsPrinting(false), 1500);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <HardHat className="text-orange-600" size={24} />
            Contractor Pass Preview
          </DialogTitle>
          <DialogDescription>
            Preview and print the contractor access pass with worker details and safety certifications.
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4">
          {/* Pass Preview */}
          <div className="flex justify-center">
            <div 
              id="contractor-pass-print"
              className="relative bg-gradient-to-br from-orange-50 to-orange-100 border-2 border-orange-300 shadow-lg rounded-lg overflow-hidden"
              style={{ 
                width: '420px', 
                height: '300px', // Scaled version of 95mm x 66mm
              }}
            >
              {/* Header */}
              <div className="flex justify-between items-start p-3 border-b border-orange-300 bg-white/50">
                <div>
                  <h3 className="text-lg font-bold text-orange-700">{companyName || 'Contractor Management'}</h3>
                  <p className="text-sm font-semibold text-orange-600">CONTRACTOR PASS</p>
                </div>
                <HardHat className="text-orange-600" size={24} />
              </div>
              
              {/* Main Content */}
              <div className="flex p-3" style={{ height: 'calc(100% - 100px)' }}>
                <div className="flex-1 pr-3 overflow-hidden">
                  <h4 className="text-lg font-bold text-gray-800 mb-1">
                    {worker.firstName} {worker.lastName}
                  </h4>
                  <div className="space-y-1 text-xs text-gray-600 mb-2">
                    <p><strong>Company:</strong> {companyName || 'Unknown'}</p>
                    <p><strong>Email:</strong> {worker.email || 'N/A'}</p>
                    <p><strong>Phone:</strong> {worker.phone || 'N/A'}</p>
                    <p><strong>Check-in:</strong> {worker.checkedInAt ? new Date(worker.checkedInAt).toLocaleString() : 'N/A'}</p>
                  </div>
                  
                  {/* Status Badges */}
                  <div className="space-y-1">
                    <span className={`block px-2 py-1 text-xs font-bold rounded text-center ${
                      worker.rightToWork === 'valid' 
                        ? 'bg-green-100 text-green-800 border border-green-300' 
                        : 'bg-red-100 text-red-800 border border-red-300'
                    }`}>
                      Right to Work: {worker.rightToWork || 'Missing'}
                    </span>
                    <span className={`block px-2 py-1 text-xs font-bold rounded text-center ${
                      worker.inductionCompleted 
                        ? 'bg-green-100 text-green-800 border border-green-300' 
                        : 'bg-red-100 text-red-800 border border-red-300'
                    }`}>
                      Induction: {worker.inductionCompleted ? 'Complete' : 'Required'}
                    </span>
                    {worker.cscsStatus && (
                      <span className={`block px-2 py-1 text-xs font-bold rounded text-center ${
                        worker.cscsStatus === 'valid' 
                          ? 'bg-green-100 text-green-800 border border-green-300' 
                          : 'bg-yellow-100 text-yellow-800 border border-yellow-300'
                      }`}>
                        CSCS: {worker.cscsStatus}
                      </span>
                    )}
                    {/* Safety Status */}
                    <span className={`block px-2 py-1 text-xs font-bold text-center rounded ${
                      worker.currentCardStatus === 'clear' 
                        ? 'bg-green-100 text-green-800 border border-green-300' 
                        : worker.currentCardStatus === 'yellow'
                        ? 'bg-yellow-100 text-yellow-800 border border-yellow-300'
                        : 'bg-red-100 text-red-800 border border-red-300'
                    }`}>
                      Safety Status: {worker.currentCardStatus?.toUpperCase() || 'CLEAR'}
                    </span>
                  </div>
                </div>
                
                {/* QR Code Area */}
                <div className="flex flex-col items-center justify-center">
                  <div className="w-16 h-16 border-2 border-gray-400 bg-white flex items-center justify-center">
                    {worker.qrCode ? (
                      <img 
                        src={`data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7`}
                        alt="QR Code"
                        className="w-14 h-14 hidden"
                        ref={el => {
                          if (!el || !worker.qrCode) return;
                          import('qrcode').then(QRCode => QRCode.toDataURL(worker.qrCode, { width: 60, margin: 1 })).then(url => { el.src = url; el.classList.remove('hidden'); });
                        }}
                      />
                    ) : (
                      <div className="text-xs text-center text-gray-500">
                        QR CODE<br/>
                        PENDING
                      </div>
                    )}
                  </div>
                </div>
              </div>
              
              {/* Footer - Fixed at bottom */}
              <div className="absolute bottom-0 left-0 right-0 h-10 bg-white/90 text-center text-xs text-gray-600 border-t border-orange-200 flex flex-col justify-center">
                <p className="font-semibold leading-tight">{companyName || 'Contractor Management'}</p>
                <p className="leading-tight">Pass valid for authorized areas only</p>
              </div>
            </div>
          </div>
          
          {/* Action Buttons */}
          <div className="flex gap-3">
            <Button 
              variant="outline" 
              onClick={onClose}
              className="flex-1"
              data-testid="button-close-contractor-pass"
            >
              <X className="mr-2 h-4 w-4" />
              Close
            </Button>
            <Button 
              onClick={handlePrint}
              disabled={isPrinting}
              className="flex-1 bg-orange-600 hover:bg-orange-700 text-white"
              data-testid="button-print-contractor-pass"
            >
              {isPrinting ? (
                <>
                  <Check className="mr-2 h-4 w-4" />
                  Printing...
                </>
              ) : (
                <>
                  <Printer className="mr-2 h-4 w-4" />
                  Print Pass
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}