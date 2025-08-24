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

  const handlePrint = () => {
    // For thermal printers, we create a print-optimized version
    const printContent = document.getElementById('visitor-pass-print');
    if (printContent) {
      const printWindow = window.open('', '_blank');
      if (printWindow) {
        printWindow.document.write(`
          <html>
            <head>
              <title>Visitor Pass - ${visitor.name}</title>
              <style>
                @page { 
                  size: 95mm 66mm; 
                  margin: 0; 
                }
                @media print {
                  body { 
                    margin: 0; 
                    padding: 8px;
                    font-family: Arial, sans-serif;
                    background: white;
                  }
                  .pass-container {
                    width: 95mm;
                    height: 66mm;
                    border: 1px solid #000;
                    padding: 4mm;
                    box-sizing: border-box;
                    position: relative;
                  }
                  .header { 
                    display: flex; 
                    justify-content: space-between; 
                    align-items: flex-start;
                    margin-bottom: 2mm;
                  }
                  .company-info { 
                    flex: 1; 
                    text-align: left;
                  }
                  .company-name { 
                    font-size: 10pt; 
                    font-weight: bold; 
                    margin: 0;
                  }
                  .visitor-pass { 
                    font-size: 7pt; 
                    margin: 0;
                  }
                  .address { 
                    font-size: 6pt; 
                    line-height: 1.2;
                    margin: 1mm 0;
                  }
                  .main-content { 
                    display: flex; 
                    align-items: center; 
                    justify-content: space-between;
                    margin: 2mm 0;
                  }
                  .visitor-details { 
                    flex: 1; 
                    text-align: left;
                  }
                  .visitor-name { 
                    font-size: 12pt; 
                    font-weight: bold; 
                    margin: 0;
                  }
                  .visitor-info { 
                    font-size: 7pt; 
                    margin: 0.5mm 0;
                  }
                  .qr-code { 
                    width: 15mm; 
                    height: 15mm; 
                    border: 1px solid #ccc;
                  }
                  .footer { 
                    position: absolute;
                    bottom: 2mm;
                    left: 4mm;
                    right: 4mm;
                    font-size: 6pt;
                    border-top: 1px solid #ccc;
                    padding-top: 1mm;
                    display: flex;
                    justify-content: space-between;
                  }
                }
              </style>
            </head>
            <body>
              <div class="pass-container">
                <div class="header">
                  <div class="company-info">
                    <h4 class="company-name">${settings?.companyName || 'TechCorp Ltd'}</h4>
                    <p class="visitor-pass">Visitor Pass</p>
                    ${settings?.address ? `<p class="address">${settings.address}</p>` : ''}
                  </div>
                </div>
                
                <div class="main-content">
                  <div class="visitor-details">
                    <p class="visitor-name">${visitor.name}</p>
                    <p class="visitor-info">${visitor.company || 'No company'}</p>
                    <p class="visitor-info">${formatDate(visitor.checkedInAt)}</p>
                    <p class="visitor-info">Host: ${hostName || 'Unknown'}</p>
                  </div>
                  <img src="${generateQRCode(visitor.qrCode)}" alt="QR Code" class="qr-code" />
                </div>
                
                <div class="footer">
                  <span>Valid: ${formatDate(visitor.checkedInAt)}</span>
                  <span>VisiGate Pro</span>
                </div>
              </div>
            </body>
          </html>
        `);
        printWindow.document.close();
        printWindow.print();
        printWindow.close();
      }
    }
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
            id="visitor-pass-print"
            className="bg-white rounded-lg p-4 shadow-lg mx-auto border-2 border-slate-200 relative"
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
                </div>
              </div>
            </div>
          </div>
          
          <div className="space-y-6 mt-6">
            <div className="text-center">
              <p className="text-slate-600 text-base leading-relaxed px-4">
                {isPreBooked 
                  ? "Welcome! Your pre-booking has been confirmed and your visitor pass has been generated." 
                  : "Your visitor pass has been generated and is ready to print."
                }
              </p>
              <p className="text-sm text-slate-500 mt-2">
                Show this pass to reception or scan the QR code to check out.
              </p>
            </div>
            
            <div className="flex gap-3 px-4">
              <Button 
                variant="outline"
                onClick={onClose}
                className="flex-1 px-4 py-3 rounded-xl border border-slate-300 text-slate-700 font-medium hover:bg-slate-50 transition-colors"
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
