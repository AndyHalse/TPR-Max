import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { generateQRCode } from "@/lib/qr-generator";
import { useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import type { Visitor, CompanySettings } from "@shared/schema";

interface PassPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  visitor: Visitor;
  hostName?: string;
  isPreBooked?: boolean;
}

export default function PassPreviewModal({ isOpen, onClose, visitor, hostName, isPreBooked = false }: PassPreviewModalProps) {
  const { data: settings } = useQuery<CompanySettings>({
    queryKey: ["/api/settings"],
  });

  const { toast } = useToast();

  const formatDate = (date: Date | string) => {
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
  };

  const handlePrint = () => {
    const printUrl = `/api/passes/browser-print/${visitor.id}`;
    const printWindow = window.open(printUrl, '_blank', 'width=500,height=400,noopener,noreferrer');
    if (!printWindow) {
      toast({
        title: "Popup blocked",
        description: `Your browser blocked the print window. Please allow popups for this site, or open the pass manually: ${window.location.origin}${printUrl}`,
        variant: "destructive",
        duration: 10000,
      });
    } else {
      toast({
        title: "Print window opened",
        description: "Select your thermal printer (95 × 65 mm) in the browser print dialog.",
        duration: 5000,
      });
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md glass-effect border-white/20" data-testid="pass-preview-modal">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold text-fixed text-center">
            Visitor Pass Generated
          </DialogTitle>
        </DialogHeader>
        
        <div className="text-center space-y-6">
          {/* Mock ID Pass (95mm x 66mm aspect ratio) */}
          <div 
            id="visitor-pass-print"
            className="bg-white rounded-lg p-4 shadow-lg mx-auto relative"
            style={{ width: "285px", height: "198px" }}
            data-testid="visitor-pass-preview"
          >
            <div className="h-full flex flex-col" style={{background: 'linear-gradient(135deg, #f8faff 0%, #e6f2ff 100%)'}}>
              {/* Header with Company Info - Tenant specific */}
              <div className="flex items-start justify-between mb-2">
                <div className="text-left flex-1 pr-2">
                  <h4 className="font-bold text-sm text-blue-900 leading-tight">
                    {"Company Name"}
                  </h4>
                  <p className="text-xs text-variable font-semibold">Visitor Pass</p>
                  <p className="text-xs text-variable mt-1 leading-tight">
                    {"Address not provided"}
                  </p>
                </div>
                <div className="w-12 h-10 rounded flex items-center justify-center flex-shrink-0 overflow-hidden">
                  <div className="w-10 h-10 bg-blue-600 rounded flex items-center justify-center">
                    <span className="text-white text-sm font-bold">CO</span>
                  </div>
                </div>
              </div>
              
              <div className="flex-1 flex items-center justify-between">
                <div className="flex-1 pr-3">
                  <p className="font-bold text-xl text-fixed" data-testid="pass-visitor-name">
                    {visitor.firstName} {visitor.lastName}
                  </p>
                  <p className="text-sm text-variable" data-testid="pass-visitor-company">
                    {visitor.company || "Business Partners"}
                  </p>
                  <p className="text-xs text-variable" data-testid="pass-visit-date">
                    {formatDate(visitor.checkedInAt)}
                  </p>
                  <p className="text-xs text-variable">
                    Host: <span data-testid="pass-host-name">{hostName || "Essia Halse"}</span>
                  </p>
                </div>
                
                {/* QR Code - positioned to match design */}
                <div className="w-16 h-16 flex items-center justify-center bg-white">
                  <img 
                    src={generateQRCode(visitor.qrCode || visitor.id)} 
                    alt="QR Code" 
                    className="w-full h-full object-contain p-1"
                    data-testid="pass-qr-code"
                    onError={(e) => {
                      e.currentTarget.style.display = 'none';
                    }}
                  />
                </div>
              </div>
              
              {/* Footer - Match design */}
              <div className="mt-auto pt-1">
                <div className="flex justify-between items-center text-xs">
                  <div className="text-left">
                    {settings?.phone && <div className="text-variable mb-0.5">📞 {settings.phone}</div>}
                    {settings?.website && <div className="text-blue-600">🌐 {settings.website}</div>}
                  </div>
                  <span className="text-variable">{settings?.companyName || 'TPR Max'}</span>
                </div>
              </div>
            </div>
          </div>
          
          <div className="space-y-6 mt-6">
            <div className="text-center">
              <p className="text-variable text-base leading-relaxed px-4">
                {isPreBooked 
                  ? "Welcome! Your pre-booking has been confirmed and your visitor pass has been generated." 
                  : "Your visitor pass has been generated and is ready to print."
                }
              </p>
              <p className="text-sm text-variable mt-2">
                Show this pass to reception or scan the QR code to check out.
              </p>
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
              <Button 
                onClick={handlePrint}
                className="flex-1 gradient-blue text-white px-4 py-3 rounded-xl font-medium hover:shadow-lg transition-all duration-300"
                data-testid="button-print-pass"
              >
                Print Pass
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
