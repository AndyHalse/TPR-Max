import { useState } from "react";
import { Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { apiRequest } from "@/lib/queryClient";
import GlassCard from "@/components/GlassCard";
import PassPreviewModal from "@/components/PassPreviewModal";
import { UserPlus, BadgeInfo, LogOut, QrCode, Scan } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import type { Staff, Visitor } from "@shared/schema";

export default function KioskMode() {
  const { toast } = useToast();
  const [activeSection, setActiveSection] = useState<"main" | "scan">("main");
  const [scannedCode, setScannedCode] = useState("");
  const [currentVisitor, setCurrentVisitor] = useState<Visitor | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [hostName, setHostName] = useState<string>();
  const [isPreBookedCheckIn, setIsPreBookedCheckIn] = useState(false);

  const { data: staff } = useQuery<Staff[]>({
    queryKey: ["/api/staff"],
  });

  const { data: currentVisitors } = useQuery<Visitor[]>({
    queryKey: ["/api/visitors/current"],
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
      setHostName(hostStaffMember?.name);
      
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
    const existingVisitor = currentVisitors?.find(v => v.qrCode === scannedCode);
    if (existingVisitor) {
      checkOutMutation.mutate(scannedCode);
      return;
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

  if (activeSection === "scan") {
    return (
      <div className="max-w-2xl mx-auto space-y-8">
        <div className="text-center">
          <h2 className="text-3xl font-bold text-slate-800 mb-2">QR Code Scanner</h2>
          <p className="text-slate-600 text-lg">Scan your visitor pass or pre-booking QR code</p>
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
                className="w-full px-4 py-4 rounded-xl border border-white/30 bg-white/50 focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-800 text-center font-mono text-lg"
                data-testid="input-qr-code"
                autoFocus
              />
              
              <div className="flex gap-4">
                <Button
                  onClick={handleQrScan}
                  disabled={checkOutMutation.isPending || preBookingCheckInMutation.isPending}
                  className="flex-1 gradient-blue text-white font-medium hover:shadow-lg transition-all duration-300"
                  data-testid="button-scan-qr"
                >
                  <Scan className="mr-2" size={16} />
                  {(checkOutMutation.isPending || preBookingCheckInMutation.isPending) ? "Processing..." : "Scan"}
                </Button>
                
                <Button
                  variant="outline"
                  onClick={() => {
                    setActiveSection("main");
                    setScannedCode("");
                  }}
                  className="px-8 bg-white/50 border-white/30 text-slate-700 hover:bg-white/70"
                >
                  Back
                </Button>
              </div>
            </div>
            
            <div className="text-sm text-slate-500 space-y-2">
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
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div className="text-center">
        <h2 className="text-3xl font-bold text-slate-800 mb-2">Welcome to TechCorp Ltd</h2>
        <p className="text-slate-600 text-lg">Please select your check-in option below</p>
      </div>

      {/* Kiosk Options */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div 
          className="cursor-pointer" 
          onClick={() => setActiveSection("scan")}
          data-testid="button-qr-scanner"
        >
          <GlassCard hover className="text-center p-8 group">
            <div className="w-24 h-24 bg-gradient-to-r from-purple-500 to-indigo-500 rounded-full flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform">
              <QrCode className="text-white" size={32} />
            </div>
            <h3 className="text-xl font-bold text-slate-800 mb-2">QR Scanner</h3>
            <p className="text-slate-600 text-sm">Scan to check in or check out</p>
          </GlassCard>
        </div>

        <Link href="/checkin">
          <GlassCard hover className="text-center p-8 group">
            <div className="w-24 h-24 gradient-blue rounded-full flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform">
              <UserPlus className="text-white" size={32} />
            </div>
            <h3 className="text-xl font-bold text-slate-800 mb-2">Manual Check-In</h3>
            <p className="text-slate-600 text-sm">New visitor or contractor</p>
          </GlassCard>
        </Link>

        <GlassCard hover className="text-center p-8 group" data-testid="button-staff-checkin">
          <div className="w-24 h-24 bg-gradient-to-r from-green-500 to-teal-500 rounded-full flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform">
            <BadgeInfo className="text-white" size={32} />
          </div>
          <h3 className="text-xl font-bold text-slate-800 mb-2">Staff Check-In</h3>
          <p className="text-slate-600 text-sm">Scan your employee ID</p>
        </GlassCard>
      </div>

      {/* Quick Status */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <GlassCard className="p-6">
          <h3 className="text-lg font-semibold text-slate-800 mb-3">Current Visitors On-Site</h3>
          <div className="text-3xl font-bold text-blue-600 mb-2">
            {currentVisitors?.length || 0}
          </div>
          <p className="text-slate-600 text-sm">Active visitor passes</p>
        </GlassCard>
        
        <GlassCard className="p-6">
          <h3 className="text-lg font-semibold text-slate-800 mb-3">Instructions</h3>
          <div className="space-y-2 text-sm text-slate-600">
            <p>• Pre-booked? Use QR Scanner with your email QR code</p>
            <p>• New visitor? Use Manual Check-In</p>
            <p>• Leaving? Use QR Scanner with your pass QR code</p>
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
  );
}
