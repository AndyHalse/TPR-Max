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

  // Load customer's visitor pass design
  const { data: passDesign } = useQuery<{ success: boolean; design: any[] }>({
    queryKey: ["/api/thermal-passes/design/visitor"],
  });

  const formatDate = (date: Date | string) => {
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
  };

  const handlePrint = async () => {
    try {
      // Get customer's pass design elements
      const design = passDesign?.design || [];
      
      console.log(`🎨 Using customer pass design with ${design.length} elements`);
      
      // Prepare visitor data for pass printing
      const visitorData = {
        name: `${visitor.firstName} ${visitor.lastName}`,
        company: visitor.company || 'Guest',
        host: hostName || 'Reception',
        date: new Date().toLocaleDateString(),
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        passId: visitor.qrCode || visitor.id,
        qrCode: visitor.qrCode || visitor.id
      };

      if (design.length > 0) {
        // Use customer's custom design
        console.log('🖨️ Printing with customer design');
        const response = await fetch('/api/thermal-passes/pdf', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            elements: design,
            data: visitorData
          }),
        });

        if (response.ok) {
          const htmlContent = await response.text();
          const printWindow = window.open('', '_blank');
          if (printWindow) {
            printWindow.document.write(htmlContent);
            printWindow.document.close();
            printWindow.focus();
            setTimeout(() => printWindow.print(), 100);
          }
        } else {
          throw new Error('Failed to generate pass with custom design');
        }
      } else {
        // Fallback to default design if no custom design
        console.log('📄 Using default pass design');
        printDefaultPass(visitorData);
      }
    } catch (error) {
      console.error('❌ Print error:', error);
      // Fallback to default design
      printDefaultPass({
        name: `${visitor.firstName} ${visitor.lastName}`,
        company: visitor.company || 'Guest',
        host: hostName || 'Reception',
        date: new Date().toLocaleDateString(),
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        passId: visitor.qrCode || visitor.id,
        qrCode: visitor.qrCode || visitor.id
      });
    }
  };

  const printDefaultPass = (visitorData: any) => {
    const companyName = settings?.companyName || "Company Name";
    const companyAddress = settings?.address || "";
    const companyPhone = settings?.phone || "";
    const companyWebsite = settings?.website || "";
    const companyLogo = settings?.logoUrl || null;
    
    // Direct printing with tenant-specific information
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(`
        <html>
          <head>
            <title>Visitor Pass - ${visitor.firstName} ${visitor.lastName}</title>
            <style>
              @page { 
                size: 95mm 66mm; 
                margin: 0; 
              }
              @media print {
                body { 
                  margin: 0; 
                  padding: 0;
                  font-family: Arial, sans-serif;
                  background: white;
                }
                .pass-container {
                  width: 95mm;
                  height: 66mm;
                  padding: 3mm;
                  box-sizing: border-box;
                  position: relative;
                  background: white;
                }
                .header { 
                  display: flex; 
                  justify-content: space-between; 
                  align-items: flex-start;
                  margin-bottom: 2mm;
                }
                .company-info { 
                  flex: 1; 
                }
                .company-name { 
                  font-size: 11pt; 
                  font-weight: bold; 
                  margin: 0;
                  color: #000000;
                }
                .visitor-pass { 
                  font-size: 8pt; 
                  margin: 0;
                  color: #000000;
                  font-weight: 600;
                }
                .address { 
                  font-size: 6.5pt; 
                  margin: 0;
                  color: #000000;
                  line-height: 1.2;
                  margin-top: 0.5mm;
                }
                .logo { 
                  width: 16mm;
                  height: 12mm;
                  border-radius: 2mm;
                  display: flex;
                  align-items: center;
                  justify-content: center;
                  overflow: hidden;
                }
                .logo img {
                  max-width: 100%;
                  max-height: 100%;
                  object-fit: contain;
                }
                .logo-fallback { 
                  width: 12mm;
                  height: 12mm;
                  background: #000000;
                  border-radius: 2mm;
                  display: flex;
                  align-items: center;
                  justify-content: center;
                  color: white;
                  font-weight: bold;
                  font-size: 8pt;
                }
                .main-content { 
                  display: flex; 
                  align-items: center; 
                  justify-content: space-between;
                  margin: 3mm 0;
                }
                .visitor-details { 
                  flex: 1; 
                  padding-right: 2mm;
                }
                .visitor-name { 
                  font-size: 16pt; 
                  font-weight: bold; 
                  margin: 0;
                  margin-bottom: 1mm;
                  color: #000000;
                }
                .visitor-company { 
                  font-size: 9pt; 
                  margin: 0;
                  margin-bottom: 0.5mm;
                  color: #000000;
                }
                .visitor-date { 
                  font-size: 8pt; 
                  margin: 0;
                  margin-bottom: 0.5mm;
                  color: #000000;
                }
                .visitor-host { 
                  font-size: 8pt; 
                  margin: 0;
                  color: #000000;
                }
                .qr-code { 
                  width: 18mm; 
                  height: 18mm;
                }
                .footer { 
                  position: absolute; 
                  bottom: 1mm; 
                  left: 3mm; 
                  right: 3mm;
                  font-size: 6pt; 
                  color: #000000;
                  display: flex;
                  justify-content: space-between;
                  align-items: center;
                }
                .contact-info {
                  font-size: 6pt;
                  color: #000000;
                  text-align: left;
                }
                .phone {
                  margin-bottom: 0.5mm;
                }
                .website {
                  color: #000000;
                }
              }
            </style>
          </head>
          <body>
            <div class="pass-container">
              <div class="header">
                <div class="company-info">
                  <h4 class="company-name">${companyName}</h4>
                  <p class="visitor-pass">Visitor Pass</p>
                  <p class="address">${companyAddress}</p>
                </div>
                <div class="logo">
                  ${companyLogo ? 
                    `<img src="${companyLogo}" alt="${companyName} Logo" />` : 
                    `<div class="logo-fallback">${companyName.substring(0, 3).toUpperCase()}</div>`
                  }
                </div>
              </div>
              
              <div class="main-content">
                <div class="visitor-details">
                  <p class="visitor-name">${visitorData.name}</p>
                  <p class="visitor-company">${visitorData.company}</p>
                  <p class="visitor-date">${formatDate(visitor.checkedInAt)}</p>
                  <p class="visitor-host">Host: ${hostName || 'Essia Halse'}</p>
                </div>
                <img src="${generateQRCode(visitor.qrCode || visitor.id)}" alt="QR Code" class="qr-code" onerror="this.style.display='none'" />
              </div>
              
              <div class="footer">
                <div class="contact-info">
                  ${companyPhone ? `<div class="phone">📞 ${companyPhone}</div>` : ''}
                  ${companyWebsite ? `<div class="website">🌐 ${companyWebsite.replace(/^https?:\/\//, '')}</div>` : ''}
                </div>
                <span>© ${new Date().getFullYear()} ${companyName}</span>
              </div>
            </div>
            <script>
              window.onload = function() {
                setTimeout(function() {
                  window.print();
                  window.close();
                }, 100);
              };
            </script>
          </body>
        </html>
      `);
      printWindow.document.close();
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
