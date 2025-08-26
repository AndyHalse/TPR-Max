import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Printer, X, Check, Building2, HardHat, Shield } from "lucide-react";
import type { ContractorWorker } from "@shared/schema";

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

  const handlePrint = () => {
    setIsPrinting(true);
    
    // For thermal printers, we create a print-optimized version
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(`
        <html>
          <head>
            <title>Contractor Pass - ${worker.firstName} ${worker.lastName}</title>
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
                  border: 2px solid #000;
                  padding: 4mm;
                  box-sizing: border-box;
                  position: relative;
                  background: linear-gradient(135deg, #fff7ed 0%, #fed7aa 100%);
                }
                .header { 
                  display: flex; 
                  justify-content: space-between; 
                  align-items: flex-start;
                  margin-bottom: 2mm;
                  border-bottom: 1px solid #ea580c;
                  padding-bottom: 1mm;
                }
                .company-info { 
                  flex: 1; 
                  text-align: left;
                }
                .company-name { 
                  font-size: 10pt; 
                  font-weight: bold; 
                  margin: 0;
                  color: #ea580c;
                }
                .contractor-pass { 
                  font-size: 8pt; 
                  margin: 0;
                  color: #9a3412;
                  font-weight: bold;
                }
                .main-content { 
                  display: flex; 
                  align-items: center; 
                  justify-content: space-between;
                  margin: 2mm 0;
                }
                .worker-details { 
                  flex: 1; 
                  text-align: left;
                }
                .worker-name { 
                  font-size: 12pt; 
                  font-weight: bold; 
                  margin: 0;
                  color: #1f2937;
                }
                .worker-info { 
                  font-size: 7pt; 
                  margin: 0.5mm 0;
                  color: #374151;
                }
                .qr-code { 
                  width: 20mm; 
                  height: 20mm; 
                  border: 1px solid #000;
                  display: flex;
                  align-items: center;
                  justify-content: center;
                  font-size: 6pt;
                  text-align: center;
                  background: white;
                }
                .badges {
                  display: flex;
                  gap: 2mm;
                  margin: 1mm 0;
                  flex-wrap: wrap;
                }
                .badge {
                  font-size: 6pt;
                  padding: 1mm 2mm;
                  border-radius: 2mm;
                  font-weight: bold;
                  text-transform: uppercase;
                }
                .badge-valid {
                  background: #dcfce7;
                  color: #166534;
                  border: 1px solid #16a34a;
                }
                .badge-invalid {
                  background: #fef2f2;
                  color: #991b1b;
                  border: 1px solid #dc2626;
                }
                .footer { 
                  position: absolute;
                  bottom: 2mm;
                  left: 4mm;
                  right: 4mm;
                  text-align: center;
                  font-size: 6pt;
                  color: #6b7280;
                  border-top: 1px solid #d1d5db;
                  padding-top: 1mm;
                }
                .safety-status {
                  font-size: 7pt;
                  font-weight: bold;
                  padding: 1mm;
                  text-align: center;
                  margin: 1mm 0;
                  border-radius: 2mm;
                }
                .status-clear {
                  background: #dcfce7;
                  color: #166534;
                  border: 1px solid #16a34a;
                }
                .status-warning {
                  background: #fef3c7;
                  color: #92400e;
                  border: 1px solid #d97706;
                }
                .status-danger {
                  background: #fef2f2;
                  color: #991b1b;
                  border: 1px solid #dc2626;
                }
              }
            </style>
          </head>
          <body>
            <div class="pass-container">
              <div class="header">
                <div class="company-info">
                  <div class="company-name">VisiGate Pro</div>
                  <div class="contractor-pass">CONTRACTOR PASS</div>
                </div>
              </div>
              
              <div class="main-content">
                <div class="worker-details">
                  <div class="worker-name">${worker.firstName} ${worker.lastName}</div>
                  <div class="worker-info">Company: ${companyName || 'Unknown'}</div>
                  <div class="worker-info">Email: ${worker.email || 'N/A'}</div>
                  <div class="worker-info">Phone: ${worker.phone || 'N/A'}</div>
                  <div class="worker-info">Check-in: ${worker.checkedInAt ? new Date(worker.checkedInAt).toLocaleString() : 'N/A'}</div>
                  
                  <div class="badges">
                    <span class="badge ${worker.rightToWork === 'valid' ? 'badge-valid' : 'badge-invalid'}">
                      Right to Work: ${worker.rightToWork || 'Missing'}
                    </span>
                    <span class="badge ${worker.inductionCompleted ? 'badge-valid' : 'badge-invalid'}">
                      Induction: ${worker.inductionCompleted ? 'Complete' : 'Required'}
                    </span>
                    ${worker.cscsStatus ? `<span class="badge ${worker.cscsStatus === 'valid' ? 'badge-valid' : 'badge-invalid'}">CSCS: ${worker.cscsStatus}</span>` : ''}
                  </div>
                  
                  <div class="safety-status ${worker.currentCardStatus === 'clear' ? 'status-clear' : worker.currentCardStatus === 'yellow' ? 'status-warning' : 'status-danger'}">
                    Safety Status: ${worker.currentCardStatus?.toUpperCase() || 'CLEAR'}
                  </div>
                </div>
                
                <div class="qr-code">
                  QR CODE<br/>
                  ${worker.qrCode || 'TEMP-QR'}
                </div>
              </div>
              
              <div class="footer">
                <div>VisiGate Pro - Contractor Management System</div>
                <div>Pass valid for authorized areas only</div>
              </div>
            </div>
          </body>
        </html>
      `);
      printWindow.document.close();
      printWindow.print();
      printWindow.close();
    }
    
    setTimeout(() => {
      setIsPrinting(false);
      onClose();
    }, 1000);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <HardHat className="text-orange-600" size={24} />
            Contractor Pass Preview
          </DialogTitle>
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
                  <h3 className="text-lg font-bold text-orange-700">VisiGate Pro</h3>
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
                  <div className="w-16 h-16 border-2 border-gray-400 bg-white flex items-center justify-center text-xs text-center">
                    QR CODE<br/>
                    {worker.qrCode ? worker.qrCode.substring(0, 8) + '...' : 'TEMP'}
                  </div>
                </div>
              </div>
              
              {/* Footer - Fixed at bottom */}
              <div className="absolute bottom-0 left-0 right-0 h-10 bg-white/90 text-center text-xs text-gray-600 border-t border-orange-200 flex flex-col justify-center">
                <p className="font-semibold leading-tight">VisiGate Pro - Contractor Management</p>
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