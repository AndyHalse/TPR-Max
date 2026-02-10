import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { apiRequest } from "@/lib/queryClient";
import { useLocation } from "wouter";
import GlassCard from "@/components/GlassCard";
import PassPreviewModal from "@/components/PassPreviewModal";
import { ArrowLeft, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { generateQRCode } from "@/lib/qr-generator";
import type { Staff, InsertVisitor, Visitor } from "@shared/schema";

// Extend Visitor type to include e-Pass properties from backend
interface VisitorWithEPass extends Visitor {
  ePassSent?: boolean;
  ePassUrl?: string;
}

export default function VisitorCheckIn() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [formData, setFormData] = useState({
    name: "",
    company: "",
    email: "",
    hostStaffId: "",
    purpose: "",
    carRegistration: "",
  });
  const [createdVisitor, setCreatedVisitor] = useState<VisitorWithEPass | null>(null);
  const [showPassPreview, setShowPassPreview] = useState(false);

  const { data: staff } = useQuery<Staff[]>({
    queryKey: ["/api/staff"],
  });

  // Function to automatically print visitor pass
  const printVisitorPass = async (visitor: Visitor) => {
    try {
      const companyName = "Company Name";
      const companyAddress = "Address not provided";
      const companyLogo = null;
      
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
      toast({
        title: "Print Error",
        description: "Failed to print visitor pass. Please try printing manually.",
        variant: "destructive",
      });
    }
  };

  const checkinMutation = useMutation({
    mutationFn: async (visitor: InsertVisitor) => {
      const response = await apiRequest("POST", "/api/visitors/checkin", visitor);
      return response.json();
    },
    onSuccess: (visitor: VisitorWithEPass) => {
      setCreatedVisitor(visitor);
      
      // Check if e-Pass was sent (visitor has ePassSent property set by backend)
      if (visitor.ePassSent) {
        // Show e-Pass confirmation instead of printing
        toast({
          title: "✅ Digital Pass Sent",
          description: `E-Pass has been sent to ${visitor.email || 'visitor'}. They can use it to check out.`,
          variant: "default",
          duration: 5000
        });
        // Navigate back after showing the toast
        setTimeout(() => {
          setLocation("/kiosk");
        }, 3000);
      } else {
        // Show pass preview and auto-print physical pass
        setShowPassPreview(true);
        setTimeout(() => {
          printVisitorPass(visitor);
        }, 500);
        toast({
          title: "Success",
          description: "Visitor checked in successfully! Pass is printing...",
        });
      }
      
      queryClient.invalidateQueries({ queryKey: ["/api/visitors"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
    },
    onError: (error: any) => {
      console.error('Check-in error:', error);
      
      // Handle specific duplicate visitor error
      if (error.message?.includes("409") || error.message?.includes("already checked in")) {
        toast({
          title: "Visitor Already On Site",
          description: "This visitor is already checked in. Please check them out first if needed.",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Error",
          description: "Failed to check in visitor. Please try again.",
          variant: "destructive",
        });
      }
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.name.trim()) {
      toast({
        title: "Error",
        description: "Name is required",
        variant: "destructive",
      });
      return;
    }

    if (!formData.hostStaffId) {
      toast({
        title: "Error",
        description: "Please select a host",
        variant: "destructive",
      });
      return;
    }

    const nameParts = formData.name.trim().split(' ');
    const firstName = nameParts[0];
    const lastName = nameParts.slice(1).join(' ') || firstName;
    
    checkinMutation.mutate({
      firstName,
      lastName,
      company: formData.company.trim() || null,
      email: formData.email.trim() || null,
      hostStaffId: formData.hostStaffId,
      purpose: formData.purpose.trim() || null,
      carRegistration: formData.carRegistration.trim() || null,
      isCheckedIn: true,
    });
  };

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  return (
    <div className="max-w-2xl mx-auto">
      <GlassCard className="p-8">
        <div className="text-center mb-8">
          <h2 className="text-2xl font-bold text-fixed mb-2">Visitor Check-In</h2>
          <p className="text-variable">Please fill in your details below</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label htmlFor="name" className="text-sm font-medium text-slate-700">
                Full Name *
              </Label>
              <Input
                id="name"
                type="text"
                required
                value={formData.name}
                onChange={(e) => handleInputChange("name", e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-white/30 bg-white/50 focus:outline-none focus:ring-2 focus:ring-blue-500 text-fixed"
                placeholder="Enter your full name"
                data-testid="input-visitor-name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="company" className="text-sm font-medium text-slate-700">
                Company
              </Label>
              <Input
                id="company"
                type="text"
                value={formData.company}
                onChange={(e) => handleInputChange("company", e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-white/30 bg-white/50 focus:outline-none focus:ring-2 focus:ring-blue-500 text-fixed"
                placeholder="Your company name"
                data-testid="input-visitor-company"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="email" className="text-sm font-medium text-slate-700">
              Email Address
            </Label>
            <Input
              id="email"
              type="email"
              value={formData.email}
              onChange={(e) => handleInputChange("email", e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-white/30 bg-white/50 focus:outline-none focus:ring-2 focus:ring-blue-500 text-fixed"
              placeholder="Your email for digital pass"
              data-testid="input-visitor-email"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="host" className="text-sm font-medium text-slate-700">
              Host *
            </Label>
            <Select value={formData.hostStaffId} onValueChange={(value) => handleInputChange("hostStaffId", value)}>
              <SelectTrigger className="w-full px-4 py-3 rounded-xl border border-white/30 bg-white/50 focus:outline-none focus:ring-2 focus:ring-blue-500 text-fixed" data-testid="select-host">
                <SelectValue placeholder="Select your host" />
              </SelectTrigger>
              <SelectContent>
                {staff?.map((member) => (
                  <SelectItem key={member.id} value={member.id}>
                    {member.firstName} {member.lastName} - {member.department}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="purpose" className="text-sm font-medium text-slate-700">
              Purpose of Visit
            </Label>
            <Input
              id="purpose"
              type="text"
              value={formData.purpose}
              onChange={(e) => handleInputChange("purpose", e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-white/30 bg-white/50 focus:outline-none focus:ring-2 focus:ring-blue-500 text-fixed"
              placeholder="Reason for your visit"
              data-testid="input-visitor-purpose"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="carRegistration" className="text-sm font-medium text-slate-700">
              Car Registration (Optional)
            </Label>
            <Input
              id="carRegistration"
              type="text"
              value={formData.carRegistration}
              onChange={(e) => handleInputChange("carRegistration", e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-white/30 bg-white/50 focus:outline-none focus:ring-2 focus:ring-blue-500 text-fixed"
              placeholder="Vehicle registration number"
              data-testid="input-visitor-car-registration"
            />
          </div>

          <div className="flex gap-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => setLocation("/kiosk")}
              className="flex-1 px-6 py-3 rounded-xl border border-slate-300 text-slate-700 font-medium hover:bg-slate-50 transition-colors"
              data-testid="button-back-to-kiosk"
            >
              <ArrowLeft className="mr-2" size={16} />
              Back
            </Button>
            <Button
              type="submit"
              disabled={checkinMutation.isPending}
              className="flex-1 gradient-blue text-white px-6 py-3 rounded-xl font-medium hover:shadow-lg transition-all duration-300 disabled:opacity-50"
              data-testid="button-submit-checkin"
            >
              {checkinMutation.isPending ? (
                "Checking In..."
              ) : (
                <>
                  <Check className="mr-2" size={16} />
                  Check In
                </>
              )}
            </Button>
          </div>
        </form>
      </GlassCard>

      {createdVisitor && !createdVisitor.ePassSent && (
        <PassPreviewModal
          isOpen={showPassPreview}
          onClose={() => {
            setShowPassPreview(false);
            setLocation("/kiosk");
          }}
          visitor={createdVisitor}
          hostName={staff?.find(s => s.id === createdVisitor.hostStaffId) ? `${staff.find(s => s.id === createdVisitor.hostStaffId)?.firstName} ${staff.find(s => s.id === createdVisitor.hostStaffId)?.lastName}` : "Unknown Host"}
        />
      )}
    </div>
  );
}
