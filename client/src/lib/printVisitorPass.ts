import { generateQRCode } from "@/lib/qr-generator";
import type { Visitor, Staff } from "@shared/schema";

interface PrintVisitorPassOptions {
  visitor: Visitor;
  staff?: Staff[];
  toast?: (options: { title: string; description: string; variant?: "destructive" }) => void;
}

export async function printVisitorPass({ visitor, staff, toast }: PrintVisitorPassOptions) {
  try {
    const settingsRes = await fetch("/api/settings", { credentials: "include" });
    const settingsData = settingsRes.ok ? await settingsRes.json() : null;
    const companyName = settingsData?.companyName || "TPR Max";
    const companyAddress = settingsData?.address || "Address not provided";
    const companyLogo = settingsData?.logoUrl ? `/objects${settingsData.logoUrl}` : null;
    
    // Find host staff member
    const hostStaff = staff?.find(s => s.id === visitor.hostStaffId);
    const hostName = hostStaff ? `${hostStaff.firstName} ${hostStaff.lastName}` : "Unknown Host";
    
    // Generate QR code
    const qrCodeUrl = generateQRCode(visitor.qrCode || visitor.id);
    
    // Create and open print window
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
                  font-size: 6pt;
                  font-weight: bold;
                }
                .main-content {
                  display: flex;
                  gap: 3mm;
                  margin-bottom: 2mm;
                }
                .visitor-info {
                  flex: 1;
                }
                .visitor-name {
                  font-size: 12pt;
                  font-weight: bold;
                  color: #000000;
                  margin: 0 0 1mm 0;
                }
                .visitor-company {
                  font-size: 8pt;
                  color: #000000;
                  margin: 0 0 1mm 0;
                }
                .visit-info {
                  font-size: 7pt;
                  color: #000000;
                  margin: 0;
                  line-height: 1.3;
                }
                .qr-section {
                  display: flex;
                  flex-direction: column;
                  align-items: center;
                  width: 18mm;
                }
                .qr-code {
                  width: 16mm;
                  height: 16mm;
                  border: 1px solid #000000;
                }
                .qr-label {
                  font-size: 5pt;
                  text-align: center;
                  margin-top: 1mm;
                  color: #000000;
                }
                .footer {
                  position: absolute;
                  bottom: 2mm;
                  left: 3mm;
                  right: 3mm;
                  display: flex;
                  justify-content: space-between;
                  align-items: center;
                  font-size: 6pt;
                  color: #000000;
                }
                .date-time {
                  font-weight: 600;
                }
                .pass-id {
                  font-family: monospace;
                  font-size: 5pt;
                }
              }
            </style>
          </head>
          <body>
            <div class="pass-container">
              <div class="header">
                <div class="company-info">
                  <h1 class="company-name">${companyName}</h1>
                  <p class="visitor-pass">VISITOR PASS</p>
                  <p class="address">${companyAddress}</p>
                </div>
                <div class="logo">
                  ${companyLogo ? 
                    `<img src="${companyLogo}" alt="Company Logo" />` : 
                    `<div class="logo-fallback">LOGO</div>`
                  }
                </div>
              </div>
              
              <div class="main-content">
                <div class="visitor-info">
                  <h2 class="visitor-name">${visitor.firstName} ${visitor.lastName}</h2>
                  ${visitor.company ? `<p class="visitor-company">${visitor.company}</p>` : ''}
                  <div class="visit-info">
                    <strong>Host:</strong> ${hostName}<br/>
                    ${visitor.purpose ? `<strong>Purpose:</strong> ${visitor.purpose}<br/>` : ''}
                    <strong>Date:</strong> ${new Date().toLocaleDateString()}<br/>
                    <strong>Time In:</strong> ${new Date(visitor.checkedInAt).toLocaleTimeString()}
                  </div>
                </div>
                
                <div class="qr-section">
                  <img src="${qrCodeUrl}" alt="QR Code" class="qr-code" />
                  <div class="qr-label">Scan to verify</div>
                </div>
              </div>
              
              <div class="footer">
                <span class="date-time">${new Date().toLocaleString()}</span>
                <span class="pass-id">ID: ${visitor.id.substring(0, 8)}</span>
              </div>
            </div>
          </body>
        </html>
      `);
      
      printWindow.document.close();
      
      // Auto-print after content loads
      printWindow.onload = () => {
        setTimeout(() => {
          printWindow.print();
          printWindow.close();
        }, 100);
      };
    }
  } catch (error) {
    console.error("Error printing visitor pass:", error);
    if (toast) {
      toast({
        title: "Print Error",
        description: "Failed to print visitor pass. Please try printing manually.",
        variant: "destructive",
      });
    }
  }
}