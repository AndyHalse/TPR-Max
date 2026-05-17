import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import QRCodeImage from "@/components/QRCodeImage";
import { useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import type { Visitor, CompanySettings } from "@shared/schema";
import { printPassViaIframe } from "@/lib/printUtils";

interface PassPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  visitor: Visitor;
  hostName?: string;
  isPreBooked?: boolean;
  ePassSent?: boolean;
}

export default function PassPreviewModal({ isOpen, onClose, visitor, hostName, isPreBooked = false, ePassSent = false }: PassPreviewModalProps) {
  const { data: settings } = useQuery<CompanySettings>({
    queryKey: ["/api/settings"],
  });

  const { toast } = useToast();

  const formatDate = (date: Date | string) => {
    return new Date(date).toLocaleDateString('en-GB', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
  };

  const handlePrint = () => {
    printPassViaIframe(`/api/passes/print/visitor/${visitor.id}`);
    toast({
      title: "Sending to printer",
      description: "Your visitor pass is being sent to the printer.",
      duration: 4000,
    });
  };

  const logoUrl = settings?.logoUrl || null;
  const companyName = settings?.companyName || 'Company Name';
  const companyAddress = settings?.address || '';

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md glass-effect border-white/20" data-testid="pass-preview-modal">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold text-fixed text-center">
            Visitor Pass Generated
          </DialogTitle>
        </DialogHeader>
        
        <div className="text-center space-y-6">
          {/* Pass preview (95mm x 65mm aspect ratio) */}
          <div 
            id="visitor-pass-print"
            className="bg-white rounded-lg p-4 shadow-lg mx-auto relative"
            style={{ width: "285px", minHeight: "190px" }}
            data-testid="visitor-pass-preview"
          >
            <div className="h-full flex flex-col">
              {/* Header */}
              <div className="flex items-start justify-between mb-2 pb-2 border-b-2 border-blue-600">
                <div className="text-left flex-1 pr-2">
                  <h4 className="font-bold text-xs text-blue-700 tracking-wider uppercase">VISITOR PASS</h4>
                  <p className="text-xs font-semibold text-gray-700 mt-0.5">{companyName}</p>
                  {companyAddress && (
                    <p className="text-xs text-gray-400 leading-tight">{companyAddress}</p>
                  )}
                </div>
                <div className="flex-shrink-0 flex items-center justify-center">
                  {logoUrl ? (
                    <img src={logoUrl} alt="Logo" className="max-w-[48px] max-h-[36px] object-contain" />
                  ) : (
                    <div className="w-10 h-8 bg-blue-600 rounded flex items-center justify-center">
                      <span className="text-white text-xs font-bold">
                        {companyName.substring(0, 2).toUpperCase()}
                      </span>
                    </div>
                  )}
                </div>
              </div>
              
              <div className="flex-1 flex items-center justify-between">
                <div className="flex-1 pr-3">
                  <p className="font-bold text-lg text-gray-900 leading-tight" data-testid="pass-visitor-name">
                    {visitor.firstName} {visitor.lastName}
                  </p>
                  {visitor.company && (
                    <p className="text-xs text-gray-500 mt-0.5" data-testid="pass-visitor-company">
                      {visitor.company}
                    </p>
                  )}
                  <p className="text-xs text-gray-500 mt-1" data-testid="pass-visit-date">
                    {formatDate(visitor.checkedInAt)}
                  </p>
                  <p className="text-xs text-gray-500">
                    Host: <span data-testid="pass-host-name">{hostName || 'Reception'}</span>
                  </p>
                </div>
                
                <div className="w-16 h-16 flex items-center justify-center bg-white">
                  <QRCodeImage data={visitor.qrCode || visitor.id} size={64} className="w-full h-full object-contain" alt="QR Code" />
                </div>
              </div>
              
              {/* Footer */}
              <div className="mt-2 pt-1 border-t border-gray-200 flex justify-between items-center">
                <div className="text-left">
                  {settings?.phone && <div className="text-xs text-gray-400">📞 {settings.phone}</div>}
                  {settings?.website && <div className="text-xs text-blue-500">🌐 {settings.website}</div>}
                </div>
                <span className="text-xs text-gray-400">{companyName}</span>
              </div>
            </div>
          </div>
          
          <div className="space-y-4">
            <div className="text-center">
              {ePassSent ? (
                <>
                  <div className="flex items-center justify-center gap-2 mb-2">
                    <span className="text-2xl">✉️</span>
                    <span className="text-green-600 font-semibold text-lg">Digital E-Pass Sent</span>
                  </div>
                  <p className="text-variable text-base leading-relaxed px-4">
                    {isPreBooked
                      ? "Welcome! Your pre-booking is confirmed. A digital E-Pass has been sent to your email."
                      : "A digital E-Pass has been sent to your email address."}
                  </p>
                  <p className="text-sm text-variable mt-2">
                    Open your email and use the QR code to check out when you leave.
                  </p>
                </>
              ) : (
                <>
                  <p className="text-variable text-base leading-relaxed px-4">
                    {isPreBooked 
                      ? "Welcome! Your pre-booking has been confirmed and your visitor pass has been generated." 
                      : "Your visitor pass has been generated and is ready to print."
                    }
                  </p>
                  <p className="text-sm text-variable mt-2">
                    Show this pass to reception or scan the QR code to check out.
                  </p>
                </>
              )}
            </div>
            
            <div className="flex gap-3 px-4">
              <Button 
                variant="outline"
                onClick={onClose}
                className="flex-1 px-4 py-3 rounded-xl border border-slate-300 text-fixed font-medium hover:bg-slate-50 transition-colors"
                data-testid="button-close-pass-preview"
              >
                Close
              </Button>
              {!ePassSent && (
                <Button 
                  onClick={handlePrint}
                  className="flex-1 gradient-blue text-white px-4 py-3 rounded-xl font-medium hover:shadow-lg transition-all duration-300"
                  data-testid="button-print-pass"
                >
                  Print Pass
                </Button>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
