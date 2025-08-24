import { useState } from "react";
import { Link } from "wouter";
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
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50">
        <WalkInVisitorForm onBack={() => setActiveSection("main")} />
      </div>
    );
  }

  if (activeSection === "scan") {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50 p-4">
        {/* Company Banner */}
        {settings?.bannerUrl && (
          <div className="w-full h-32 mb-8 rounded-2xl overflow-hidden">
            <img 
              src={settings.bannerUrl} 
              alt={settings.companyName}
              className="w-full h-full object-cover"
            />
          </div>
        )}
        
        <div className="max-w-2xl mx-auto space-y-8">
          <div className="text-center">
            <h2 className="text-4xl font-bold text-slate-800 mb-4">QR Code Scanner</h2>
            <p className="text-slate-600 text-xl">Scan your visitor pass or pre-booking QR code</p>
          </div>

          <GlassCard className="p-8">
            <div className="text-center space-y-6">
              <div className="w-32 h-32 mx-auto border-4 border-dashed border-blue-400 rounded-xl flex items-center justify-center bg-blue-50">
                <QrCode className="text-blue-600" size={48} />
              </div>
              
              <div className="space-y-4">
                <Input
                  type="text"
                  placeholder="Scan QR code or enter code manually..."
                  value={scannedCode}
                  onChange={(e) => setScannedCode(e.target.value)}
                  className="w-full px-6 py-6 rounded-xl border border-white/30 bg-white/50 focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-800 text-center font-mono text-2xl"
                  data-testid="input-qr-code"
                  autoFocus
                  style={{ fontSize: '24px', minHeight: '60px' }}
                />
                
                <div className="flex gap-4">
                  <Button
                    onClick={handleQrScan}
                    disabled={checkOutMutation.isPending || preBookingCheckInMutation.isPending}
                    className="flex-1 gradient-blue text-white font-medium hover:shadow-lg transition-all duration-300 h-16 text-xl"
                    data-testid="button-scan-qr"
                  >
                    <Scan className="mr-3" size={24} />
                    {(checkOutMutation.isPending || preBookingCheckInMutation.isPending) ? "Processing..." : "Scan"}
                  </Button>
                  
                  <Button
                    variant="outline"
                    onClick={() => {
                      setActiveSection("main");
                      setScannedCode("");
                    }}
                    className="px-8 bg-white/50 border-white/30 text-slate-700 hover:bg-white/70 h-16 text-xl"
                  >
                    Back
                  </Button>
                </div>
              </div>
              
              <div className="text-lg text-slate-500 space-y-3">
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
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50 p-4">
      {/* Company Banner */}
      {settings?.bannerUrl && (
        <div className="w-full h-32 mb-8 rounded-2xl overflow-hidden">
          <img 
            src={settings.bannerUrl} 
            alt={settings.companyName}
            className="w-full h-full object-cover"
          />
        </div>
      )}
      
      <div className="max-w-4xl mx-auto space-y-8">
        <div className="text-center">
          <h2 className="text-4xl font-bold text-slate-800 mb-4">Welcome to {settings?.companyName || 'TechCorp Ltd'}</h2>
          <p className="text-slate-600 text-xl">Please select your check-in option below</p>
        </div>

        {/* Kiosk Options */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div 
            className="cursor-pointer" 
            onClick={() => setActiveSection("scan")}
            data-testid="button-qr-scanner"
          >
            <GlassCard hover className="text-center p-12 group">
              <div className="w-32 h-32 bg-gradient-to-r from-purple-500 to-indigo-500 rounded-full flex items-center justify-center mx-auto mb-6 group-hover:scale-110 transition-transform">
                <QrCode className="text-white" size={48} />
              </div>
              <h3 className="text-2xl font-bold text-slate-800 mb-3">QR Scanner</h3>
              <p className="text-slate-600 text-lg">Scan to check in or check out</p>
            </GlassCard>
          </div>

          <div 
            className="cursor-pointer" 
            onClick={() => setActiveSection("walkin")}
            data-testid="button-manual-checkin"
          >
            <GlassCard hover className="text-center p-12 group">
              <div className="w-32 h-32 gradient-blue rounded-full flex items-center justify-center mx-auto mb-6 group-hover:scale-110 transition-transform">
                <UserPlus className="text-white" size={48} />
              </div>
              <h3 className="text-2xl font-bold text-slate-800 mb-3">Manual Check-In</h3>
              <p className="text-slate-600 text-lg">Walk-in visitor entry</p>
            </GlassCard>
          </div>

          <GlassCard hover className="text-center p-12 group" data-testid="button-staff-checkin">
            <div className="w-32 h-32 bg-gradient-to-r from-green-500 to-teal-500 rounded-full flex items-center justify-center mx-auto mb-6 group-hover:scale-110 transition-transform">
              <BadgeInfo className="text-white" size={48} />
            </div>
            <h3 className="text-2xl font-bold text-slate-800 mb-3">Staff Check-In</h3>
            <p className="text-slate-600 text-lg">Scan your employee ID</p>
          </GlassCard>
        </div>

        {/* Instructions for touchscreen users */}
        <GlassCard className="p-8">
          <h3 className="text-2xl font-semibold text-slate-800 mb-6 text-center">Instructions</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-lg text-slate-700">
            <div className="text-center">
              <QrCode className="mx-auto mb-3 text-purple-600" size={32} />
              <p className="font-medium mb-2">Pre-booked visitors</p>
              <p className="text-sm">Use QR Scanner with your email QR code</p>
            </div>
            <div className="text-center">
              <UserPlus className="mx-auto mb-3 text-blue-600" size={32} />
              <p className="font-medium mb-2">New visitors</p>
              <p className="text-sm">Use Manual Check-In to register</p>
            </div>
            <div className="text-center">
              <LogOut className="mx-auto mb-3 text-green-600" size={32} />
              <p className="font-medium mb-2">Leaving</p>
              <p className="text-sm">Use QR Scanner with your pass QR code</p>
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