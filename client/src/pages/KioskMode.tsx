import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { apiRequest } from "@/lib/queryClient";
import GlassCard from "@/components/GlassCard";
import PassPreviewModal from "@/components/PassPreviewModal";
import WalkInVisitorForm from "@/components/WalkInVisitorForm";
import { UserPlus, BadgeInfo, LogOut, QrCode, Scan } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import type { Staff, Visitor, CompanySettings } from "@shared/schema";

export default function KioskMode() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [activeSection, setActiveSection] = useState<"main" | "scan" | "walkin">("main");
  const [scannedCode, setScannedCode] = useState("");
  const [currentVisitor, setCurrentVisitor] = useState<Visitor | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [hostName, setHostName] = useState<string>();
  const [isPreBookedCheckIn, setIsPreBookedCheckIn] = useState(false);

  const { data: staff } = useQuery<Staff[]>({
    queryKey: ["/api/staff"],
  });

  const { data: settings } = useQuery<CompanySettings>({
    queryKey: ["/api/settings"],
  });

  // Apply branding colors dynamically to kiosk mode
  useEffect(() => {
    if (settings?.backgroundColor || settings?.fixedTextColor || settings?.variableTextColor || settings?.accentColor) {
      const root = document.documentElement;
      
      // Convert hex to HSL for CSS variables
      const hexToHsl = (hex: string) => {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        if (!result) return null;
        
        const r = parseInt(result[1], 16) / 255;
        const g = parseInt(result[2], 16) / 255;
        const b = parseInt(result[3], 16) / 255;
        
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        let h = 0, s = 0;
        const l = (max + min) / 2;
        
        if (max !== min) {
          const d = max - min;
          s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
          switch (max) {
            case r: h = (g - b) / d + (g < b ? 6 : 0); break;
            case g: h = (b - r) / d + 2; break;
            case b: h = (r - g) / d + 4; break;
          }
          h /= 6;
        }
        
        return `${Math.round(h * 360)}, ${Math.round(s * 100)}%, ${Math.round(l * 100)}%`;
      };

      // Apply background color
      if (settings.backgroundColor) {
        const hsl = hexToHsl(settings.backgroundColor);
        if (hsl) {
          root.style.setProperty('--background', `hsl(${hsl})`);
          root.style.setProperty('--card', `hsl(${hsl})`);
          root.style.setProperty('--popover', `hsl(${hsl})`);
        }
      }

      // Apply fixed text color
      if (settings.fixedTextColor) {
        const hsl = hexToHsl(settings.fixedTextColor);
        if (hsl) {
          root.style.setProperty('--fixed-text', `hsl(${hsl})`);
        }
      }

      // Apply variable text color  
      if (settings.variableTextColor) {
        const hsl = hexToHsl(settings.variableTextColor);
        if (hsl) {
          root.style.setProperty('--variable-text', `hsl(${hsl})`);
        }
      }

      // Apply accent color
      if (settings.accentColor) {
        const hsl = hexToHsl(settings.accentColor);
        if (hsl) {
          root.style.setProperty('--primary', `hsl(${hsl})`);
          root.style.setProperty('--accent', `hsl(${hsl})`);
          root.style.setProperty('--ring', `hsl(${hsl})`);
        }
      }
    }
  }, [settings?.backgroundColor, settings?.fixedTextColor, settings?.variableTextColor, settings?.accentColor]);

  const checkOutMutation = useMutation({
    mutationFn: async (qrCode: string) => {
      const response = await apiRequest("POST", "/api/visitors/checkout-by-qr", {
        qrCode,
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/visitors/current"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      setScannedCode("");
      setActiveSection("main");
      toast({
        title: "Success",
        description: "Visitor checked out successfully!",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to check out visitor",
        variant: "destructive",
      });
    },
  });

  const preBookingCheckInMutation = useMutation({
    mutationFn: async (qrCode: string) => {
      const response = await apiRequest("POST", "/api/prebookings/checkin", {
        qrCode,
      });
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/visitors/current"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/prebookings"] });
      
      setCurrentVisitor(data.visitor);
      setIsPreBookedCheckIn(true);
      setShowPreview(true);
      setScannedCode("");
      setActiveSection("main");
      
      // Find host name
      const hostStaffMember = staff?.find(s => s.id === data.visitor.hostStaffId);
      setHostName(hostStaffMember ? `${hostStaffMember.firstName} ${hostStaffMember.lastName}` : undefined);
      
      toast({
        title: "Success",
        description: "Pre-booked visitor checked in successfully!",
      });
    },
    onError: (error: any) => {
      console.error("Pre-booking check-in error:", error);
      toast({
        title: "Error",
        description: "QR code not found. Please try again or proceed with manual check-in.",
        variant: "destructive",
      });
    },
  });

  const handleQrScan = async () => {
    if (!scannedCode.trim()) {
      toast({
        title: "Error",
        description: "Please enter or scan a QR code",
        variant: "destructive",
      });
      return;
    }
    
    // Check if it's a checkout (existing visitor QR code)
    try {
      await checkOutMutation.mutateAsync(scannedCode);
      return;
    } catch (error) {
      // If checkout fails, continue to try pre-booking check-in
    }
    
    // Check if it's a pre-booking QR code (starts with PBK-)
    if (scannedCode.startsWith("PBK-")) {
      preBookingCheckInMutation.mutate(scannedCode);
      return;
    }
    
    // If not a known format, show error
    toast({
      title: "Error",
      description: "QR code not recognized. Please try again or proceed with manual check-in.",
      variant: "destructive",
    });
  };

  if (activeSection === "walkin") {
    return (
      <div className="min-h-screen bg-background">
        <WalkInVisitorForm onBack={() => setActiveSection("main")} />
      </div>
    );
  }

  if (activeSection === "scan") {
    return (
      <div className="min-h-screen max-h-screen overflow-hidden bg-background p-2 sm:p-4 flex flex-col">
        {/* Company Banner - Reduced by 10% and responsive */}
        {settings?.bannerUrl && (
          <div className="w-full max-w-4xl mx-auto mb-4 sm:mb-6 rounded-xl sm:rounded-2xl overflow-hidden flex-shrink-0">
            <img 
              src={`/objects${settings.bannerUrl}`} 
              alt={settings.companyName}
              className="w-full h-auto object-contain max-h-43 sm:max-h-53"
              onError={(e) => {
                console.error("Kiosk banner failed to load:", settings.bannerUrl);
                e.currentTarget.style.display = 'none';
                const container = e.currentTarget.parentElement;
                if (container) {
                  container.style.display = 'none';
                }
              }}
            />
          </div>
        )}
        
        <div className="max-w-3xl mx-auto space-y-4 sm:space-y-6 flex-1 flex flex-col justify-center">
          <div className="text-center flex-shrink-0">
            <h2 
              className="text-2xl sm:text-3xl lg:text-4xl font-bold text-fixed mb-2 sm:mb-4 select-none"
              onClick={() => setLocation("/")}
              style={{ cursor: 'default' }}
            >
              QR Code Scanner
            </h2>
            <p className="text-variable text-base sm:text-lg lg:text-xl">Scan your visitor pass or pre-booking QR code</p>
          </div>

          <GlassCard className="p-4 sm:p-6 lg:p-8 flex-1 flex flex-col justify-center max-h-96">
            <div className="text-center space-y-4 sm:space-y-6">
              <div className="w-24 h-24 sm:w-28 sm:h-28 lg:w-32 lg:h-32 mx-auto border-4 border-dashed border-blue-400 rounded-xl flex items-center justify-center bg-blue-50">
                <QrCode className="text-blue-600" size={36} />
              </div>
              
              <div className="space-y-3 sm:space-y-4">
                <Input
                  type="text"
                  placeholder="Scan QR code or enter code manually..."
                  value={scannedCode}
                  onChange={(e) => setScannedCode(e.target.value)}
                  className="w-full px-4 sm:px-6 py-4 sm:py-6 rounded-xl border border-white/30 bg-white/50 focus:outline-none focus:ring-2 focus:ring-blue-500 text-fixed text-center font-mono text-lg sm:text-xl lg:text-2xl"
                  data-testid="input-qr-code"
                  autoFocus
                  style={{ minHeight: '50px' }}
                />
                
                <div className="flex gap-3 sm:gap-4">
                  <Button
                    onClick={handleQrScan}
                    disabled={checkOutMutation.isPending || preBookingCheckInMutation.isPending}
                    className="flex-1 gradient-blue text-white font-medium hover:shadow-lg transition-all duration-300 h-12 sm:h-14 lg:h-16 text-base sm:text-lg lg:text-xl"
                    data-testid="button-scan-qr"
                  >
                    <Scan className="mr-2 sm:mr-3" size={20} />
                    {(checkOutMutation.isPending || preBookingCheckInMutation.isPending) ? "Processing..." : "Scan"}
                  </Button>
                  
                  <Button
                    variant="outline"
                    onClick={() => {
                      setActiveSection("main");
                      setScannedCode("");
                    }}
                    className="px-6 sm:px-8 bg-white/50 border-white/30 text-slate-700 hover:bg-white/70 h-12 sm:h-14 lg:h-16 text-base sm:text-lg lg:text-xl"
                  >
                    Back
                  </Button>
                </div>
              </div>
              
              <div className="text-sm sm:text-base lg:text-lg space-y-2" style={{color: 'white'}}>
                <p>✓ Pre-booked visitors: Scan your email QR code to check in</p>
                <p>✓ Current visitors: Scan your pass QR code to check out</p>
              </div>
            </div>
          </GlassCard>

          {showPreview && currentVisitor && (
            <PassPreviewModal
              isOpen={showPreview}
              onClose={() => {
                setShowPreview(false);
                setCurrentVisitor(null);
                setHostName(undefined);
                setIsPreBookedCheckIn(false);
              }}
              visitor={currentVisitor}
              hostName={hostName}
              isPreBooked={isPreBookedCheckIn}
            />
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen max-h-screen overflow-hidden bg-background p-2 sm:p-4 flex flex-col">
      {/* Company Banner - Reduced by 10% and responsive */}
      {settings?.bannerUrl && (
        <div className="w-full max-w-4xl mx-auto mb-4 sm:mb-6 rounded-xl sm:rounded-2xl overflow-hidden flex-shrink-0">
          <img 
            src={`/objects${settings.bannerUrl}`} 
            alt={settings.companyName}
            className="w-full h-auto object-contain max-h-43 sm:max-h-53"
            onError={(e) => {
              console.error("Main kiosk banner failed to load:", settings.bannerUrl);
              e.currentTarget.style.display = 'none';
              const container = e.currentTarget.parentElement;
              if (container) {
                container.style.display = 'none';
              }
            }}
          />
        </div>
      )}
      <div className="max-w-6xl mx-auto flex-1 flex flex-col justify-center">
        <div className="text-center flex-shrink-0 mb-4 sm:mb-6 lg:mb-8">
          <h2 
            className="text-2xl sm:text-3xl lg:text-4xl font-bold text-foreground mb-1 sm:mb-2 select-none" 
            onClick={() => setLocation("/")}
            style={{ cursor: 'default' }}
          >
            Welcome to {settings?.companyName || 'TechCorp Ltd'}
          </h2>
          <p className="text-muted-foreground text-base sm:text-lg lg:text-xl">Please select your check-in option below</p>
        </div>

        {/* Kiosk Options - Responsive and screen-fitted */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6 lg:gap-8">
          <div 
            className="cursor-pointer aspect-square" 
            onClick={() => setActiveSection("scan")}
            data-testid="button-qr-scanner"
          >
            <GlassCard hover className="text-center p-2 sm:p-3 lg:p-4 group aspect-square flex flex-col justify-center">
              <div className="w-20 h-20 sm:w-24 sm:h-24 lg:w-28 lg:h-28 bg-gradient-to-r from-purple-500 to-indigo-500 rounded-full flex items-center justify-center mx-auto mb-1 sm:mb-2 lg:mb-3 group-hover:scale-110 transition-transform">
                <QrCode className="text-white" size={32} />
              </div>
              <h3 className="text-lg sm:text-xl lg:text-2xl font-bold text-foreground mb-2 sm:mb-3">QR Scanner</h3>
              <p className="text-muted-foreground text-sm sm:text-base lg:text-lg">Scan to check in or check out</p>
            </GlassCard>
          </div>

          <div 
            className="cursor-pointer aspect-square" 
            onClick={() => setActiveSection("walkin")}
            data-testid="button-manual-checkin"
          >
            <GlassCard hover className="text-center p-2 sm:p-3 lg:p-4 group aspect-square flex flex-col justify-center">
              <div className="w-20 h-20 sm:w-24 sm:h-24 lg:w-28 lg:h-28 gradient-blue rounded-full flex items-center justify-center mx-auto mb-1 sm:mb-2 lg:mb-3 group-hover:scale-110 transition-transform">
                <UserPlus className="text-white" size={32} />
              </div>
              <h3 className="text-lg sm:text-xl lg:text-2xl font-bold text-foreground mb-2 sm:mb-3">Manual Check-In</h3>
              <p className="text-muted-foreground text-sm sm:text-base lg:text-lg">Walk-in visitor entry</p>
            </GlassCard>
          </div>

          <div className="cursor-pointer aspect-square" data-testid="button-staff-checkin">
            <GlassCard hover className="text-center p-2 sm:p-3 lg:p-4 group aspect-square flex flex-col justify-center">
              <div className="w-20 h-20 sm:w-24 sm:h-24 lg:w-28 lg:h-28 bg-gradient-to-r from-green-500 to-teal-500 rounded-full flex items-center justify-center mx-auto mb-1 sm:mb-2 lg:mb-3 group-hover:scale-110 transition-transform">
                <BadgeInfo className="text-white" size={32} />
              </div>
              <h3 className="text-lg sm:text-xl lg:text-2xl font-bold text-foreground mb-2 sm:mb-3">Staff Check-In</h3>
              <p className="text-muted-foreground text-sm sm:text-base lg:text-lg">Scan your employee ID</p>
            </GlassCard>
          </div>
        </div>

        {/* Instructions - Responsive and compact */}
        <div className="mt-6 sm:mt-8 lg:mt-10">
        <GlassCard className="p-4 sm:p-6 lg:p-8 flex-shrink-0">
          <h3 className="text-lg sm:text-xl lg:text-2xl font-semibold text-fixed mb-3 sm:mb-4 lg:mb-6 text-center">Instructions</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 sm:gap-4 lg:gap-6 text-variable">
            <div className="text-center">
              <QrCode className="mx-auto mb-2 text-purple-600" size={24} />
              <p className="font-medium mb-1 text-sm sm:text-base text-[#ab94e0]">Pre-booked visitors</p>
              <p className="text-xs sm:text-sm" style={{color: 'white'}}>Use QR Scanner with your email QR code</p>
            </div>
            <div className="text-center">
              <UserPlus className="mx-auto mb-2 text-blue-600" size={24} />
              <p className="font-medium mb-1 text-sm sm:text-base text-[#9b81d6]">New visitors</p>
              <p className="text-xs sm:text-sm" style={{color: 'white'}}>Use Manual Check-In to register</p>
            </div>
            <div className="text-center">
              <LogOut className="mx-auto mb-2 text-green-600" size={24} />
              <p className="font-medium mb-1 text-sm sm:text-base text-[#a587e5]">Leaving</p>
              <p className="text-xs sm:text-sm" style={{color: 'white'}}>Use QR Scanner with your pass QR code</p>
            </div>
          </div>
        </GlassCard>
        </div>

        {showPreview && currentVisitor && (
          <PassPreviewModal
            isOpen={showPreview}
            onClose={() => {
              setShowPreview(false);
              setCurrentVisitor(null);
              setHostName(undefined);
              setIsPreBookedCheckIn(false);
            }}
            visitor={currentVisitor}
            hostName={hostName}
            isPreBooked={isPreBookedCheckIn}
          />
        )}
      </div>
    </div>
  );
}