import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { generateQRCode } from "@/lib/qr-generator";
import { useQuery } from "@tanstack/react-query";
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

  const formatDate = (date: Date | string) => {
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md glass-effect border-white/20" data-testid="pass-preview-modal">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold text-slate-800 text-center">
            Visitor Pass Generated
          </DialogTitle>
        </DialogHeader>
        
        <div className="text-center space-y-6">
          {/* Mock ID Pass (95mm x 66mm aspect ratio) */}
          <div 
            className="bg-white rounded-lg p-4 shadow-lg mx-auto border-2 border-slate-200"
            style={{ width: "285px", height: "198px" }}
            data-testid="visitor-pass-preview"
          >
            <div className="h-full flex flex-col">
              {/* Header with Company Info */}
              <div className="flex items-start justify-between mb-2">
                <div className="text-left flex-1 pr-2">
                  <h4 className="font-bold text-sm text-slate-800 leading-tight">{settings?.companyName || "TechCorp Ltd"}</h4>
                  <p className="text-xs text-slate-600">Visitor Pass</p>
                  {settings?.address && (
                    <p className="text-xs text-slate-500 mt-1 leading-tight">{settings.address}</p>
                  )}
                </div>
                <div className="w-8 h-8 gradient-blue rounded flex items-center justify-center flex-shrink-0">
                  {settings?.logoUrl ? (
                    <img 
                      src={`/objects${settings.logoUrl}`}
                      alt="Company Logo" 
                      className="w-full h-full object-contain rounded"
                      onError={(e) => {
                        e.currentTarget.style.display = 'none';
                        e.currentTarget.nextElementSibling?.setAttribute('style', 'display: block');
                      }}
                    />
                  ) : null}
                  <span className="text-white text-xs" style={settings?.logoUrl ? {display: 'none'} : {}}>🏢</span>
                </div>
              </div>
              
              <div className="flex-1 flex items-center">
                <div className="flex-1">
                  <p className="font-bold text-lg text-slate-800" data-testid="pass-visitor-name">
                    {visitor.name}
                  </p>
                  <p className="text-sm text-slate-600" data-testid="pass-visitor-company">
                    {visitor.company || "No company"}
                  </p>
                  <p className="text-xs text-slate-500" data-testid="pass-visit-date">
                    {formatDate(visitor.checkedInAt)}
                  </p>
                  <p className="text-xs text-slate-500">
                    Host: <span data-testid="pass-host-name">{hostName || "Unknown"}</span>
                  </p>
                </div>
                
                {/* QR Code */}
                <div className="w-16 h-16 bg-slate-800 rounded flex items-center justify-center">
                  <img 
                    src={generateQRCode(visitor.qrCode)} 
                    alt="QR Code" 
                    className="w-full h-full"
                    data-testid="pass-qr-code"
                  />
                </div>
              </div>
              
              {/* Company Contact Info Footer */}
              <div className="mt-auto pt-1 border-t border-slate-200">
                <div className="flex flex-col space-y-1">
                  <div className="flex justify-between text-xs text-slate-500 leading-tight">
                    {settings?.phone && <span>📞 {settings.phone}</span>}
                    {settings?.website && <span className="truncate">🌐 {settings.website.replace('https://', '').replace('http://', '').replace('www.', '')}</span>}
                  </div>
                  {settings?.email && (
                    <div className="text-xs text-slate-500 truncate">
                      ✉️ {settings.email}
                    </div>
                  )}
                  <div className="flex justify-between items-center text-xs text-slate-500 border-t pt-1">
                    <span>Valid: {formatDate(visitor.checkedInAt)}</span>
                    <span>VisiGate Pro</span>
                  </div>
                  <p className="text-center text-xs text-slate-400 mt-1">Scan QR code to check out</p>
                </div>
              </div>
            </div>
          </div>
          
          <div className="space-y-4">
            <p className="text-slate-600">
              {isPreBooked 
                ? "Welcome! Your pre-booking has been confirmed and your visitor pass has been generated." 
                : "Your visitor pass has been generated and sent to the printer."
              }
            </p>
            <div className="flex gap-3">
              <Button 
                variant="outline"
                onClick={onClose}
                className="flex-1 px-4 py-2 rounded-lg border border-slate-300 text-slate-700 font-medium hover:bg-slate-50 transition-colors"
                data-testid="button-close-pass-preview"
              >
                Close
              </Button>
              <Button 
                className="flex-1 gradient-blue text-white px-4 py-2 rounded-lg font-medium hover:shadow-lg transition-all duration-300"
                data-testid="button-print-another"
              >
                Print Another
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
