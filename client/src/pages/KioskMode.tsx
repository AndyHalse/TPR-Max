import { useState, useEffect, useRef, useCallback } from "react";
import { Link, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { apiRequest } from "@/lib/queryClient";
import GlassCard from "@/components/GlassCard";
import PassPreviewModal from "@/components/PassPreviewModal";
import WalkInVisitorForm from "@/components/WalkInVisitorForm";
import HSAcceptanceModal from "@/components/HSAcceptanceModal";
import { UserPlus, BadgeInfo, LogOut, QrCode, Camera, Loader2, CheckCircle, XCircle, MapPin, Search, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import type { Staff, Visitor, CompanySettings } from "@shared/schema";
import jsQR from "jsqr";
import ScannerReticle from "@/components/ScannerReticle";
import { playBeep } from "@/hooks/useCameraScanner";
import { printPassViaIframe } from "@/lib/printUtils";
import { createPortal } from "react-dom";
import VisitInstructionsModal from "@/components/VisitInstructionsModal";

export default function KioskMode() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [activeSection, setActiveSection] = useState<"main" | "scan" | "walkin" | "staff-search">("main");
  const [staffSearchQuery, setStaffSearchQuery] = useState("");
  const staffSearchInputRef = useRef<HTMLInputElement>(null);

  const staffToggleMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiRequest("POST", `/api/staff/${id}/kiosk-toggle`, {});
      return response.json() as Promise<{ action: "checkin" | "checkout"; staff: { id: string; firstName: string; lastName: string; department: string | null } }>;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/staff"] });
      queryClient.invalidateQueries({ queryKey: ["/api/staff/checked-in"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      const fullName = `${data.staff.firstName} ${data.staff.lastName}`.trim();
      setCheckinSuccess({
        name: fullName,
        company: data.action === "checkin" ? "Checked in" : "Checked out",
      });
      setStaffSearchQuery("");
      setTimeout(() => {
        setCheckinSuccess(null);
        setActiveSection("main");
      }, 3000);
    },
    onError: (error: any) => {
      toast({
        title: "Could not update check-in",
        description: error?.message || "Please try again or see reception.",
        variant: "destructive",
      });
    },
  });
  const [scannedCode, setScannedCode] = useState("");
  const [currentVisitor, setCurrentVisitor] = useState<Visitor | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [hostName, setHostName] = useState<string>();
  const [isPreBookedCheckIn, setIsPreBookedCheckIn] = useState(false);
  const [staffCheckResult, setStaffCheckResult] = useState<{ action: string; staff: any; message: string } | null>(null);
  const [showHSModal, setShowHSModal] = useState(false);
  const [pendingQrCode, setPendingQrCode] = useState<string | null>(null);

  // Visitor pre-booking QR reason picker state
  const [showVisitorQrReasonPicker, setShowVisitorQrReasonPicker] = useState(false);
  const [pendingVisitorQrCode, setPendingVisitorQrCode] = useState<string | null>(null);
  const [visitorQrSelectedReason, setVisitorQrSelectedReason] = useState<any | null>(null);
  const [showVisitorQrInstructionsModal, setShowVisitorQrInstructionsModal] = useState(false);

  // Camera scanning state
  const [cameraState, setCameraState] = useState<"off" | "starting" | "scanning" | "processing" | "error">("off");
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [scanResult, setScanResult] = useState<{ success: boolean; message: string } | null>(null);
  const [checkinSuccess, setCheckinSuccess] = useState<{ name: string; company?: string } | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastScannedRef = useRef<string | null>(null);
  const isProcessingRef = useRef<boolean>(false);
  const hasShownScannerRef = useRef<boolean>(false);
  const lastScanTimeRef = useRef<number>(0);
  const trackRef = useRef<MediaStreamTrack | null>(null);
  const [torchOn, setTorchOn] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);
  const [reticleFlash, setReticleFlash] = useState(false);

  const { data: staff } = useQuery<Staff[]>({
    queryKey: ["/api/staff"],
  });

  const { data: allReasons = [] } = useQuery<any[]>({ queryKey: ["/api/visit-reasons"] });
  const visitorQrReasons = (allReasons as any[]).filter((r: any) => r.appliesTo === "visitors" || r.appliesTo === "both");
  // Keep a ref so the memoised handleQrScan callback always reads the latest value
  const visitorQrReasonsRef = useRef<any[]>([]);
  useEffect(() => { visitorQrReasonsRef.current = visitorQrReasons; }, [visitorQrReasons]);

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
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/visitors/current"] });
      queryClient.invalidateQueries({ queryKey: ["/api/visitors"] });
      queryClient.invalidateQueries({ queryKey: ["/api/visitors/today"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      setScannedCode("");
      setActiveSection("main");
      const isCheckIn = data?.action === 'checkin';
      const name = data?.firstName ? `${data.firstName} ${data.lastName}` : undefined;
      if (isCheckIn && name) {
        setCheckinSuccess({ name, company: data?.company || undefined });
        setCameraState("off");
        setTimeout(() => {
          setCheckinSuccess(null);
          isProcessingRef.current = false;
          lastScannedRef.current = null;
        }, 3500);
      } else {
        toast({
          title: "Checked out",
          description: name ? `${name} has been checked out.` : "Visitor checked out successfully.",
        });
      }
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to process visitor QR code",
        variant: "destructive",
      });
    },
  });

  const preBookingCheckInMutation = useMutation({
    mutationFn: async (payload: string | { qrCode: string; hsRulesAccepted?: boolean }) => {
      const body = typeof payload === "string" ? { qrCode: payload } : payload;
      const response = await apiRequest("POST", "/api/prebookings/checkin", body);
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/visitors/current"] });
      queryClient.invalidateQueries({ queryKey: ["/api/visitors"] });
      queryClient.invalidateQueries({ queryKey: ["/api/visitors/today"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/prebookings"] });
      queryClient.invalidateQueries({ queryKey: ["/api/prebookings/upcoming"] });
      queryClient.invalidateQueries({ queryKey: ["/api/muster"] });
      queryClient.invalidateQueries({ queryKey: ["/api/reception/diary"] });

      const visitorName = `${data.visitor.firstName} ${data.visitor.lastName}`;
      const visitorCompany = data.visitor.company || undefined;

      // Auto-print pass via hidden iframe — no popup, works in kiosk mode
      if (!data.visitor.ePassSent && !settings?.ePassEnabled) {
        printPassViaIframe(`/api/passes/print/visitor/${data.visitor.id}`);
      }

      // Show named check-in success overlay on the scan screen for 3.5s then go home
      setCheckinSuccess({ name: visitorName, company: visitorCompany });
      setCameraState("off");

      setTimeout(() => {
        setCheckinSuccess(null);
        isProcessingRef.current = false;
        lastScannedRef.current = null;
        setScannedCode("");

        const hostStaffMember = staff?.find(s => s.id === data.visitor.hostStaffId);
        setHostName(hostStaffMember ? `${hostStaffMember.firstName} ${hostStaffMember.lastName}` : undefined);
        // If ePass is enabled in settings, always treat it as sent in the modal —
        // the server may send it asynchronously or the response may not reflect it yet.
        const visitorWithEPass = {
          ...data.visitor,
          ePassSent: data.visitor.ePassSent || !!settings?.ePassEnabled,
        };
        setCurrentVisitor(visitorWithEPass);
        setIsPreBookedCheckIn(true);
        setShowPreview(true);
        setActiveSection("main");
      }, 3500);
    },
    onError: (error: any, variables: any) => {
      isProcessingRef.current = false;
      lastScannedRef.current = null;
      if (error?.requireHsAcceptance) {
        const code = typeof variables === "string" ? variables : variables?.qrCode;
        if (code) setPendingQrCode(code);
        setShowHSModal(true);
        setCameraState("off");
        return;
      }
      console.error("Pre-booking check-in error:", error);
      setScanResult({ success: false, message: "QR code not found. Please try again or use manual check-in." });
      setCameraState("error");
    },
  });

  const staffQrMutation = useMutation({
    mutationFn: async (qrCode: string) => {
      const response = await apiRequest("POST", "/api/staff/qr-checkin", { qrCode });
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/staff"] });
      queryClient.invalidateQueries({ queryKey: ["/api/staff/checked-in"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      
      setStaffCheckResult(data);
      setScannedCode("");
      
      toast({
        title: "Success",
        description: data.message,
      });
      
      setTimeout(() => {
        setStaffCheckResult(null);
        isProcessingRef.current = false;
        lastScannedRef.current = null;
        setActiveSection("main");
      }, 5000);
    },
    onError: (error: any) => {
      isProcessingRef.current = false;
      lastScannedRef.current = null;
      toast({
        title: "Error",
        description: error.message || "Staff QR code not recognized",
        variant: "destructive",
      });
      setCameraState("error");
      setScanResult({ success: false, message: error.message || "Staff QR code not recognised." });
    },
  });

  // ── Camera scanning ──────────────────────────────────────────
  const stopCamera = useCallback(() => {
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null; }
    if (videoRef.current) videoRef.current.srcObject = null;
    trackRef.current = null;
    setTorchOn(false);
  }, []);

  const toggleTorch = useCallback(async () => {
    const track = trackRef.current;
    if (!track) return;
    const next = !torchOn;
    try { await track.applyConstraints({ advanced: [{ torch: next } as any] }); setTorchOn(next); } catch { /* unavailable */ }
  }, [torchOn]);

  // Async QR handler — handles all QR types on this kiosk
  const handleQrScan = useCallback(async (code: string) => {
    // Staff QR
    if (code.startsWith("STF-")) {
      staffQrMutation.mutate(code);
      setScanResult({ success: true, message: "Staff card recognised — processing…" });
      return;
    }

    // Visitor pre-booking (PB- is the stored DB format; PRE- is the email invitation format; PBK- is a dashboard alias)
    if (code.startsWith("PB-") || code.startsWith("PRE-") || code.startsWith("PBK-")) {
      setCameraState("off");
      if (visitorQrReasonsRef.current.length > 0) {
        setPendingVisitorQrCode(code);
        setShowVisitorQrReasonPicker(true);
        setActiveSection("main"); // exit scan early-return so portal renders
        return;
      }
      // No visitor reasons configured — fall back to H&S check then check-in
      const settingsAny = settings as any;
      if (settingsAny?.hsRulesEnabled !== false && settingsAny?.hsRulesRequireAcceptance && settingsAny?.hsRulesContent) {
        setScannedCode(code);
        setPendingQrCode(code);
        setShowHSModal(true);
        return;
      }
      preBookingCheckInMutation.mutate(code);
      setScanResult({ success: true, message: "Pre-booking found — checking in…" });
      return;
    }

    // Contractor pre-booking
    if (code.startsWith("CPB-")) {
      try {
        const resp = await apiRequest("POST", "/api/contractors/prebookings/checkin", { qrCode: code });
        await resp.json();
        queryClient.invalidateQueries({ queryKey: ["/api/contractors/workers/all"] });
        setScanResult({ success: true, message: "Contractor pre-booking checked in!" });
        setCameraState("off");
        setTimeout(() => {
          isProcessingRef.current = false;
          lastScannedRef.current = null;
          setActiveSection("main");
        }, 3000);
      } catch {
        setScanResult({ success: false, message: "Contractor pre-booking not found." });
        setCameraState("error");
        isProcessingRef.current = false;
        lastScannedRef.current = null;
      }
      return;
    }

    // Unknown prefix — try contractor worker lookup first
    try {
      const resp = await fetch(`/api/contractors/workers/by-qr/${encodeURIComponent(code)}`, { credentials: "include" });
      if (resp.ok) {
        const { worker, companyName } = await resp.json();
        if (worker.isCheckedIn) {
          await apiRequest("POST", `/api/contractors/workers/${worker.id}/checkout`);
          queryClient.invalidateQueries({ queryKey: ["/api/contractors/workers/all"] });
          setCheckinSuccess({ name: `${worker.firstName} ${worker.lastName}`, company: companyName });
          setCameraState("off");
          setTimeout(() => {
            setCheckinSuccess(null);
            isProcessingRef.current = false;
            lastScannedRef.current = null;
            setActiveSection("main");
          }, 3000);
        } else {
          setScanResult({ success: false, message: `${worker.firstName} ${worker.lastName} — please use the contractor kiosk to check in.` });
          setCameraState("error");
          isProcessingRef.current = false;
          lastScannedRef.current = null;
        }
        return;
      }
    } catch { /* fall through to visitor checkout */ }

    // Try visitor checkout (visitor QR codes)
    try {
      await checkOutMutation.mutateAsync(code);
      return;
    } catch { /* fall through */ }

    // Nothing matched
    isProcessingRef.current = false;
    lastScannedRef.current = null;
    setScanResult({ success: false, message: "QR code not recognised. Please see reception or use manual check-in below." });
    setCameraState("error");
  }, [staffQrMutation, preBookingCheckInMutation, settings, checkOutMutation]); // eslint-disable-line react-hooks/exhaustive-deps

  const processDetectedCode = useCallback((code: string) => {
    if (isProcessingRef.current) return;
    if (lastScannedRef.current === code) return;
    isProcessingRef.current = true;
    lastScannedRef.current = code;
    playBeep();
    setReticleFlash(true);
    setTimeout(() => setReticleFlash(false), 400);
    setCameraState("processing");
    stopCamera();
    handleQrScan(code);
  }, [stopCamera]); // eslint-disable-line react-hooks/exhaustive-deps

  const scanFrame = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || !video.videoWidth || !video.videoHeight) {
      rafRef.current = requestAnimationFrame(scanFrame);
      return;
    }
    const now = performance.now();
    if (now - lastScanTimeRef.current < 250) {
      rafRef.current = requestAnimationFrame(scanFrame);
      return;
    }
    lastScanTimeRef.current = now;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) { rafRef.current = requestAnimationFrame(scanFrame); return; }
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const code = jsQR(imageData.data, canvas.width, canvas.height, { inversionAttempts: 'attemptBoth' });
    if (code && code.data) {
      processDetectedCode(code.data);
    } else {
      rafRef.current = requestAnimationFrame(scanFrame);
    }
  }, [processDetectedCode]);

  // Non-async startCamera avoids React double-effect / StrictMode cancellation
  // race conditions that broke async/await in development.
  const startCamera = useCallback(() => {
    setCameraState("starting");
    setCameraError(null);
    setScanResult(null);
    lastScannedRef.current = null;
    isProcessingRef.current = false;
    hasShownScannerRef.current = false;
    stopCamera();

    navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: "environment" },
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
    }).then(stream => {
      const video = videoRef.current;
      if (!video) { stream.getTracks().forEach(t => t.stop()); return; }

      streamRef.current = stream;
      const track = stream.getVideoTracks()[0];
      trackRef.current = track;
      const caps = track.getCapabilities() as any;
      if (caps?.torch) setTorchSupported(true);
      video.muted = true;
      video.setAttribute('playsinline', '');
      video.setAttribute('autoplay', '');
      video.srcObject = stream;
      video.play().catch(() => {});
      setCameraState("scanning");
      rafRef.current = requestAnimationFrame(scanFrame);
    }).catch((err: any) => {
      const msg = err?.name === "NotAllowedError"
        ? "Camera access denied. Enter the code manually below."
        : err?.name === "NotFoundError"
        ? "No camera found. Enter the code manually below."
        : "Camera unavailable. Enter the code manually below.";
      setCameraError(msg);
      setCameraState("error");
    });
  }, [scanFrame, stopCamera]);

  // Start camera when scan section becomes active; stop and reset when leaving
  useEffect(() => {
    if (activeSection === "scan") {
      isProcessingRef.current = false;
      lastScannedRef.current = null;
      setCheckinSuccess(null);
      setScanResult(null);
      startCamera();
    } else {
      stopCamera();
      setCameraState("off");
      setScanResult(null);
      setCheckinSuccess(null);
      lastScannedRef.current = null;
      isProcessingRef.current = false;
    }
    return () => stopCamera();
  }, [activeSection]); // eslint-disable-line react-hooks/exhaustive-deps

  // After reason selection, decide whether H&S is needed then check in
  const proceedAfterVisitorQrReason = (qrCode: string, reason: any | null) => {
    const settingsAny = settings as any;
    const perReasonHs = reason?.requireHsAcceptance;
    const companyHs = !perReasonHs &&
      settingsAny?.hsRulesEnabled !== false &&
      settingsAny?.hsRulesRequireAcceptance &&
      settingsAny?.hsRulesContent;
    if (perReasonHs || companyHs) {
      setPendingQrCode(qrCode);
      setShowHSModal(true);
    } else {
      preBookingCheckInMutation.mutate(qrCode);
      setScanResult({ success: true, message: "Pre-booking found — checking in…" });
    }
  };

  const handleKioskHSAccepted = () => {
    setShowHSModal(false);
    if (pendingQrCode) {
      preBookingCheckInMutation.mutate({ qrCode: pendingQrCode, hsRulesAccepted: true });
      setPendingQrCode(null);
    }
  };

  const handleKioskHSDeclined = () => {
    setShowHSModal(false);
    setPendingQrCode(null);
  };

  if (activeSection === "walkin") {
    return (
      <div className="min-h-screen bg-background">
        <WalkInVisitorForm onBack={() => setActiveSection("main")} />
      </div>
    );
  }

  if (activeSection === "staff-search") {
    const q = staffSearchQuery.trim().toLowerCase();
    const allStaff = (staff || []) as Staff[];
    const filtered = q.length === 0
      ? allStaff
      : allStaff.filter((s) => {
          const first = (s.firstName || "").toLowerCase();
          const last = (s.lastName || "").toLowerCase();
          const dept = (s.department || "").toLowerCase();
          const full = `${first} ${last}`;
          return first.includes(q) || last.includes(q) || dept.includes(q) || full.includes(q);
        });

    return (
      <div className="min-h-screen max-h-screen overflow-auto bg-background p-2 sm:p-3 flex flex-col">
        {settings?.bannerUrl && (
          <div className="w-full max-w-3xl mx-auto mb-2 sm:mb-3 rounded-xl sm:rounded-2xl overflow-hidden flex-shrink-0">
            <img
              src={`/objects${settings.bannerUrl}`}
              alt={settings.companyName}
              className="w-full h-auto object-contain max-h-28 sm:max-h-36 lg:max-h-40"
              onError={(e) => {
                e.currentTarget.style.display = 'none';
                const container = e.currentTarget.parentElement;
                if (container) container.style.display = 'none';
              }}
            />
          </div>
        )}

        <div className="max-w-3xl w-full mx-auto space-y-4 sm:space-y-6 flex-1 flex flex-col">
          <div className="text-center flex-shrink-0">
            <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-fixed mb-1 sm:mb-2 select-none">
              Staff Check-In
            </h2>
            <p className="text-variable text-base sm:text-lg">Find your name below</p>
          </div>

          <GlassCard className="flex-1 flex flex-col overflow-hidden">
            {checkinSuccess ? (
              <div className="flex-1 flex items-center justify-center p-6">
                <div className="mx-4 p-6 rounded-xl border-2 bg-green-50 border-green-400 text-center w-full max-w-xs">
                  <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-3" />
                  <h3 className="text-2xl font-bold text-green-700 mb-1">
                    {checkinSuccess.company === "Checked out" ? "Goodbye!" : "Welcome!"}
                  </h3>
                  <p className="text-xl font-semibold text-gray-900">{checkinSuccess.name}</p>
                  <p className="text-sm text-green-700 font-medium mt-3">✓ {checkinSuccess.company}</p>
                </div>
              </div>
            ) : (
              <>
                <div className="p-4 border-b border-white/20 flex-shrink-0">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground pointer-events-none" />
                    <Input
                      ref={staffSearchInputRef}
                      autoFocus
                      type="text"
                      placeholder="Type your name or department…"
                      value={staffSearchQuery}
                      onChange={(e) => setStaffSearchQuery(e.target.value)}
                      className="pl-10 h-14 text-lg"
                      data-testid="input-staff-search"
                    />
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-2">
                  {filtered.length === 0 ? (
                    <div className="text-center py-12 text-muted-foreground">
                      {allStaff.length === 0 ? "No staff members on file." : "No matches — try a different name."}
                    </div>
                  ) : (
                    filtered.map((s) => {
                      const isIn = !!s.isCheckedIn;
                      return (
                        <button
                          key={s.id}
                          type="button"
                          disabled={staffToggleMutation.isPending}
                          onClick={() => staffToggleMutation.mutate(s.id)}
                          data-testid={`button-staff-toggle-${s.id}`}
                          className="w-full flex items-center gap-3 px-4 py-4 rounded-xl bg-white/70 hover:bg-white active:scale-[0.99] border border-white/80 transition-all text-left shadow-sm disabled:opacity-60"
                        >
                          <div className="flex-1 min-w-0">
                            <div className="text-lg font-semibold text-fixed truncate">
                              {s.firstName} {s.lastName}
                            </div>
                            {s.department && (
                              <div className="text-sm text-muted-foreground truncate">{s.department}</div>
                            )}
                          </div>
                          <span
                            className={`px-3 py-1 rounded-full text-xs font-semibold ${
                              isIn
                                ? "bg-green-100 text-green-700 border border-green-200"
                                : "bg-gray-100 text-gray-600 border border-gray-200"
                            }`}
                          >
                            {isIn ? "Checked In" : "Not checked in"}
                          </span>
                        </button>
                      );
                    })
                  )}
                </div>

                <div className="p-4 border-t border-white/20 flex flex-col sm:flex-row gap-2 sm:gap-3 flex-shrink-0">
                  <Button
                    variant="outline"
                    onClick={() => { setStaffSearchQuery(""); setActiveSection("main"); }}
                    className="sm:order-1"
                    data-testid="button-staff-search-back"
                  >
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    Back
                  </Button>
                  <button
                    type="button"
                    onClick={() => { setStaffSearchQuery(""); setActiveSection("scan"); }}
                    className="text-sm font-medium text-variable underline underline-offset-4 py-2 sm:ml-auto"
                    data-testid="button-staff-search-scan-instead"
                  >
                    Scan QR instead
                  </button>
                </div>
              </>
            )}
          </GlassCard>
        </div>
      </div>
    );
  }

  if (activeSection === "scan") {
    return (
      <div className="min-h-screen max-h-screen overflow-auto bg-background p-2 sm:p-3 flex flex-col">
        {settings?.bannerUrl && (
          <div className="w-full max-w-3xl mx-auto mb-2 sm:mb-3 rounded-xl sm:rounded-2xl overflow-hidden flex-shrink-0">
            <img 
              src={`/objects${settings.bannerUrl}`} 
              alt={settings.companyName}
              className="w-full h-auto object-contain max-h-28 sm:max-h-36 lg:max-h-40"
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
            <p className="text-variable text-base sm:text-lg lg:text-xl">Scan any QR pass — visitor, contractor, or staff</p>
          </div>

          <GlassCard className="overflow-hidden flex-1 flex flex-col justify-center">
            {/* Camera viewfinder */}
            <div className="relative bg-black w-full" style={{ aspectRatio: '4/3', maxHeight: '55vh' }}>
              <video
                ref={videoRef}
                className="w-full h-full object-cover"
                playsInline muted autoPlay
              />
              <canvas ref={canvasRef} className="hidden" />

              {/* Starting overlay */}
              {cameraState === "starting" && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/70">
                  <Loader2 className="w-10 h-10 text-white animate-spin" />
                  <p className="text-white text-base font-medium">Starting camera…</p>
                </div>
              )}

              {cameraState === "scanning" && (
                <ScannerReticle
                  isScanning={true}
                  isFlashing={reticleFlash}
                  torchOn={torchOn}
                  torchSupported={torchSupported}
                  onToggleTorch={toggleTorch}
                  label="Point camera at QR code — scans automatically"
                />
              )}

              {/* Processing overlay */}
              {cameraState === "processing" && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/70">
                  <Loader2 className="w-12 h-12 text-blue-400 animate-spin" />
                  <p className="text-white text-base font-medium">Processing…</p>
                </div>
              )}

              {/* Error / camera not available */}
              {cameraState === "error" && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/80 px-6 text-center">
                  <Camera className="w-12 h-12 text-gray-400" />
                  <p className="text-white text-sm">{cameraError || "Camera unavailable"}</p>
                  <Button size="sm" onClick={startCamera} className="bg-blue-600 hover:bg-blue-700 text-white">
                    Try Again
                  </Button>
                </div>
              )}

              {/* ✅ Pre-booking check-in success overlay — shows visitor name */}
              {checkinSuccess && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/85">
                  <div className="mx-4 p-6 rounded-xl border-2 bg-green-50 border-green-400 text-center w-full max-w-xs">
                    <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-3" />
                    <h3 className="text-2xl font-bold text-green-700 mb-1">Welcome!</h3>
                    <p className="text-xl font-semibold text-gray-900">{checkinSuccess.name}</p>
                    {checkinSuccess.company && (
                      <p className="text-sm text-gray-600 mt-0.5">{checkinSuccess.company}</p>
                    )}
                    <p className="text-sm text-green-700 font-medium mt-3">✓ Checked in successfully</p>
                    <p className="text-xs text-gray-500 mt-2">Your visitor pass will appear shortly…</p>
                  </div>
                </div>
              )}

              {/* Staff check result overlay */}
              {staffCheckResult && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/80">
                  <div className={`mx-4 p-6 rounded-xl border-2 text-center ${staffCheckResult.action === 'checkin' ? 'bg-green-50 border-green-400' : 'bg-orange-50 border-orange-400'}`}>
                    {staffCheckResult.action === 'checkin'
                      ? <UserPlus className="w-10 h-10 text-green-600 mx-auto mb-2" />
                      : <LogOut className="w-10 h-10 text-orange-600 mx-auto mb-2" />
                    }
                    <h3 className={`text-xl font-bold mb-1 ${staffCheckResult.action === 'checkin' ? 'text-green-700' : 'text-orange-700'}`}>
                      {staffCheckResult.action === 'checkin' ? 'Checked In' : 'Checked Out'}
                    </h3>
                    <p className="text-lg font-semibold text-gray-800">
                      {staffCheckResult.staff?.firstName} {staffCheckResult.staff?.lastName}
                    </p>
                    <p className="text-sm text-gray-600">{staffCheckResult.staff?.department}</p>
                    <p className="text-xs text-gray-500 mt-2">Closing automatically…</p>
                  </div>
                </div>
              )}

              {/* Generic scan result (error / unrecognised) */}
              {scanResult && !staffCheckResult && !checkinSuccess && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/80">
                  <div className={`mx-4 p-6 rounded-xl border-2 text-center ${scanResult.success ? 'bg-green-50 border-green-400' : 'bg-red-50 border-red-400'}`}>
                    {scanResult.success
                      ? <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-2" />
                      : <XCircle className="w-12 h-12 text-red-500 mx-auto mb-2" />
                    }
                    <p className={`font-semibold text-base ${scanResult.success ? 'text-green-800' : 'text-red-800'}`}>
                      {scanResult.message}
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Manual fallback + back button */}
            <div className="p-4 space-y-3">
              <p className="text-xs text-center text-muted-foreground">Or enter the code manually if scanning fails</p>
              <div className="flex gap-3">
                <Input
                  type="text"
                  placeholder="Paste or type QR code…"
                  value={scannedCode}
                  onChange={(e) => setScannedCode(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && scannedCode.trim()) handleQrScan(scannedCode.trim()); }}
                  className="flex-1 font-mono text-sm"
                  data-testid="input-qr-code"
                />
                <Button
                  onClick={() => handleQrScan(scannedCode.trim())}
                  disabled={!scannedCode.trim() || checkOutMutation.isPending || preBookingCheckInMutation.isPending || staffQrMutation.isPending}
                  className="gradient-blue text-white"
                  data-testid="button-scan-qr"
                >
                  Go
                </Button>
                <Button
                  variant="outline"
                  onClick={() => { setActiveSection("main"); setScannedCode(""); }}
                >
                  Back
                </Button>
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
              ePassSent={!!currentVisitor.ePassSent}
            />
          )}
        </div>

        <HSAcceptanceModal
          isOpen={showHSModal}
          companyName={(settings as any)?.companyName}
          hsRulesContent={(settings as any)?.hsRulesContent || ""}
          onAccept={handleKioskHSAccepted}
          onDecline={handleKioskHSDeclined}
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col px-3 sm:px-6 lg:px-8 py-3 sm:py-4 overflow-auto sm:overflow-hidden sm:h-screen">
      {settings?.bannerUrl && (
        <div className="w-full max-w-2xl mx-auto rounded-xl overflow-hidden flex-shrink-0 mb-2 sm:mb-3" style={{ height: '18vh' }}>
          <img 
            src={`/objects${settings.bannerUrl}`} 
            alt={settings.companyName}
            className="w-full h-full object-contain"
            onError={(e) => {
              e.currentTarget.style.display = 'none';
              const container = e.currentTarget.parentElement;
              if (container) container.style.display = 'none';
            }}
          />
        </div>
      )}

      <div className="text-center flex-shrink-0 py-2 sm:py-3">
        <h2 
          className="text-lg sm:text-2xl lg:text-3xl font-bold text-foreground mb-0.5 select-none leading-tight" 
          onClick={() => setLocation("/")}
          style={{ cursor: 'default' }}
        >
          Welcome to {settings?.companyName || 'TechCorp Ltd'}
        </h2>
        <p className="text-muted-foreground text-xs sm:text-base">Please select your check-in option below</p>
      </div>

      <div className="flex-1 flex flex-col justify-center max-w-5xl mx-auto w-full sm:min-h-0">

        {/* ── Mobile layout: stacked full-width buttons ── */}
        <div className="flex flex-col gap-3 mb-4 sm:hidden">
          <button
            className="w-full cursor-pointer"
            onClick={() => setActiveSection("scan")}
            data-testid="button-qr-scanner"
          >
            <GlassCard hover className="flex items-center gap-4 px-5 py-4 group">
              <div className="w-14 h-14 flex-shrink-0 bg-gradient-to-r from-purple-500 to-indigo-500 rounded-2xl flex items-center justify-center group-active:scale-95 transition-transform">
                <QrCode className="text-white w-7 h-7" />
              </div>
              <div className="text-left min-w-0">
                <h3 className="text-base font-bold text-foreground">QR Scanner</h3>
                <p className="text-muted-foreground text-sm leading-tight">Scan to check in or check out</p>
              </div>
              <div className="ml-auto text-muted-foreground">›</div>
            </GlassCard>
          </button>

          <button
            className="w-full cursor-pointer"
            onClick={() => setActiveSection("walkin")}
            data-testid="button-manual-checkin"
          >
            <GlassCard hover className="flex items-center gap-4 px-5 py-4 group">
              <div className="w-14 h-14 flex-shrink-0 gradient-blue rounded-2xl flex items-center justify-center group-active:scale-95 transition-transform">
                <UserPlus className="text-white w-7 h-7" />
              </div>
              <div className="text-left min-w-0">
                <h3 className="text-base font-bold text-foreground">Manual Check-In</h3>
                <p className="text-muted-foreground text-sm leading-tight">Walk-in visitor entry</p>
              </div>
              <div className="ml-auto text-muted-foreground">›</div>
            </GlassCard>
          </button>

          <button
            className="w-full cursor-pointer"
            onClick={() => setActiveSection("scan")}
            data-testid="button-staff-checkin"
          >
            <GlassCard hover className="flex items-center gap-4 px-5 py-4 group">
              <div className="w-14 h-14 flex-shrink-0 bg-gradient-to-r from-green-500 to-teal-500 rounded-2xl flex items-center justify-center group-active:scale-95 transition-transform">
                <BadgeInfo className="text-white w-7 h-7" />
              </div>
              <div className="text-left min-w-0">
                <h3 className="text-base font-bold text-foreground">Staff Check-In</h3>
                <p className="text-muted-foreground text-sm leading-tight">Scan your employee ID</p>
              </div>
              <div className="ml-auto text-muted-foreground">›</div>
            </GlassCard>
          </button>

          <button
            className="w-full text-center text-sm font-medium text-variable underline underline-offset-4 py-2"
            onClick={() => setActiveSection("staff-search")}
            data-testid="button-staff-no-badge"
          >
            No badge? Find my name
          </button>
        </div>

        {/* Mobile instructions — compact horizontal strip */}
        <GlassCard className="p-3 flex-shrink-0 sm:hidden">
          <div className="flex justify-around text-variable">
            <div className="text-center px-2">
              <QrCode className="mx-auto mb-1 text-purple-500" size={18} />
              <p className="text-xs font-medium text-[#ab94e0]">Pre-booked</p>
              <p className="text-xs" style={{color: 'white'}}>Scan email QR</p>
            </div>
            <div className="w-px bg-white/20 self-stretch" />
            <div className="text-center px-2">
              <UserPlus className="mx-auto mb-1 text-blue-500" size={18} />
              <p className="text-xs font-medium text-[#9b81d6]">New visitor</p>
              <p className="text-xs" style={{color: 'white'}}>Manual entry</p>
            </div>
            <div className="w-px bg-white/20 self-stretch" />
            <div className="text-center px-2">
              <LogOut className="mx-auto mb-1 text-green-500" size={18} />
              <p className="text-xs font-medium text-[#a587e5]">Leaving</p>
              <p className="text-xs" style={{color: 'white'}}>Scan pass QR</p>
            </div>
          </div>
        </GlassCard>

        {/* ── Tablet / desktop layout: 3-column grid cards ── */}
        <div className="hidden sm:grid grid-cols-3 gap-4 sm:gap-6 lg:gap-8 mb-4 sm:mb-6">
          <div 
            className="cursor-pointer" 
            onClick={() => setActiveSection("scan")}
            data-testid="button-qr-scanner-tablet"
          >
            <GlassCard hover className="text-center py-6 sm:py-8 lg:py-10 px-3 group flex flex-col justify-center items-center h-full">
              <div className="w-16 h-16 sm:w-20 sm:h-20 lg:w-24 lg:h-24 bg-gradient-to-r from-purple-500 to-indigo-500 rounded-full flex items-center justify-center mx-auto mb-3 sm:mb-4 group-hover:scale-110 transition-transform">
                <QrCode className="text-white w-7 h-7 sm:w-8 sm:h-8 lg:w-10 lg:h-10" />
              </div>
              <h3 className="text-base sm:text-lg lg:text-xl font-bold text-foreground mb-1">QR Scanner</h3>
              <p className="text-muted-foreground text-xs sm:text-sm">Scan to check in or check out</p>
            </GlassCard>
          </div>

          <div 
            className="cursor-pointer" 
            onClick={() => setActiveSection("walkin")}
            data-testid="button-manual-checkin-tablet"
          >
            <GlassCard hover className="text-center py-6 sm:py-8 lg:py-10 px-3 group flex flex-col justify-center items-center h-full">
              <div className="w-16 h-16 sm:w-20 sm:h-20 lg:w-24 lg:h-24 gradient-blue rounded-full flex items-center justify-center mx-auto mb-3 sm:mb-4 group-hover:scale-110 transition-transform">
                <UserPlus className="text-white w-7 h-7 sm:w-8 sm:h-8 lg:w-10 lg:h-10" />
              </div>
              <h3 className="text-base sm:text-lg lg:text-xl font-bold text-foreground mb-1">Manual Check-In</h3>
              <p className="text-muted-foreground text-xs sm:text-sm">Walk-in visitor entry</p>
            </GlassCard>
          </div>

          <div className="flex flex-col">
            <div className="cursor-pointer" onClick={() => setActiveSection("scan")} data-testid="button-staff-checkin-tablet">
              <GlassCard hover className="text-center py-6 sm:py-8 lg:py-10 px-3 group flex flex-col justify-center items-center h-full">
                <div className="w-16 h-16 sm:w-20 sm:h-20 lg:w-24 lg:h-24 bg-gradient-to-r from-green-500 to-teal-500 rounded-full flex items-center justify-center mx-auto mb-3 sm:mb-4 group-hover:scale-110 transition-transform">
                  <BadgeInfo className="text-white w-7 h-7 sm:w-8 sm:h-8 lg:w-10 lg:h-10" />
                </div>
                <h3 className="text-base sm:text-lg lg:text-xl font-bold text-foreground mb-1">Staff Check-In</h3>
                <p className="text-muted-foreground text-xs sm:text-sm">Scan your employee ID</p>
              </GlassCard>
            </div>
            <button
              type="button"
              onClick={() => setActiveSection("staff-search")}
              className="mt-2 text-center text-sm font-medium text-variable underline underline-offset-4 py-2"
              data-testid="button-staff-no-badge-tablet"
            >
              No badge? Find my name
            </button>
          </div>
        </div>

        <GlassCard className="p-4 sm:p-5 flex-shrink-0 hidden sm:block">
          <h3 className="text-base sm:text-lg font-semibold text-fixed mb-3 text-center">Instructions</h3>
          <div className="grid grid-cols-3 gap-4 sm:gap-6 text-variable">
            <div className="text-center">
              <QrCode className="mx-auto mb-1.5 text-purple-600" size={22} />
              <p className="font-medium mb-0.5 text-sm text-[#ab94e0]">Pre-booked visitors</p>
              <p className="text-xs" style={{color: 'white'}}>Use QR Scanner with your email QR code</p>
            </div>
            <div className="text-center">
              <UserPlus className="mx-auto mb-1.5 text-blue-600" size={22} />
              <p className="font-medium mb-0.5 text-sm text-[#9b81d6]">New visitors</p>
              <p className="text-xs" style={{color: 'white'}}>Use Manual Check-In to register</p>
            </div>
            <div className="text-center">
              <LogOut className="mx-auto mb-1.5 text-green-600" size={22} />
              <p className="font-medium mb-0.5 text-sm text-[#a587e5]">Leaving</p>
              <p className="text-xs" style={{color: 'white'}}>Use QR Scanner with your pass QR code</p>
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
          ePassSent={!!currentVisitor.ePassSent}
        />
      )}

      <HSAcceptanceModal
        isOpen={showHSModal}
        companyName={(settings as any)?.companyName}
        hsRulesContent={(settings as any)?.hsRulesContent || ""}
        onAccept={handleKioskHSAccepted}
        onDecline={handleKioskHSDeclined}
      />

      {/* Visitor pre-booking QR — reason picker */}
      {showVisitorQrReasonPicker && createPortal(
        <div className="fixed inset-0 z-[9990] flex flex-col bg-background">
          <div className="flex-shrink-0 px-3 sm:px-6 lg:px-8 pt-3 sm:pt-4 pb-4 border-b border-black/10">
            {settings?.bannerUrl && (
              <div className="w-full max-w-2xl mx-auto rounded-xl overflow-hidden flex-shrink-0 mb-2 sm:mb-3" style={{ height: '18vh' }}>
                <img
                  src={`/objects${settings.bannerUrl}`}
                  alt={settings.companyName}
                  className="w-full h-full object-contain"
                  onError={(e) => {
                    e.currentTarget.style.display = 'none';
                    const container = e.currentTarget.parentElement;
                    if (container) container.style.display = 'none';
                  }}
                />
              </div>
            )}
            <h2 className="text-fixed text-2xl font-bold text-center">What is the reason for your visit?</h2>
            <p className="text-variable text-sm mt-1 text-center">Select the option that best describes your visit today</p>
          </div>
          <div className="flex-1 flex items-center justify-center p-6">
            <div className="grid grid-cols-2 gap-4 max-w-2xl w-full mx-auto">
              {visitorQrReasons.map((reason: any) => (
                <button
                  key={reason.id}
                  onClick={() => {
                    setVisitorQrSelectedReason(reason);
                    setShowVisitorQrReasonPicker(false);
                    if (reason.instructions?.trim()) {
                      setShowVisitorQrInstructionsModal(true);
                    } else {
                      if (pendingVisitorQrCode) {
                        proceedAfterVisitorQrReason(pendingVisitorQrCode, reason);
                        setPendingVisitorQrCode(null);
                      }
                    }
                  }}
                  className="flex flex-col items-center justify-center gap-3 p-6 bg-white rounded-2xl border-2 border-white/80 hover:border-variable hover:bg-white active:scale-95 transition-all shadow-md text-center"
                >
                  <div className="w-12 h-12 bg-variable/10 rounded-full flex items-center justify-center">
                    <MapPin size={24} className="text-variable" />
                  </div>
                  <span className="font-semibold text-slate-800 text-lg leading-tight">{reason.label}</span>
                  {reason.requireHsAcceptance && (
                    <span className="text-xs text-amber-600 font-medium bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                      H&amp;S acceptance required
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
          <div className="flex-shrink-0 border-t border-black/10 p-4 flex gap-3">
            <button
              onClick={() => {
                setShowVisitorQrReasonPicker(false);
                if (pendingVisitorQrCode) {
                  proceedAfterVisitorQrReason(pendingVisitorQrCode, null);
                  setPendingVisitorQrCode(null);
                }
              }}
              className="flex-1 py-3 text-variable hover:text-fixed text-sm font-medium transition-colors"
            >
              Skip — continue without selecting
            </button>
            <button
              onClick={() => {
                setShowVisitorQrReasonPicker(false);
                setPendingVisitorQrCode(null);
                setActiveSection("main");
              }}
              className="py-3 px-5 bg-white/70 hover:bg-white text-fixed text-sm font-medium rounded-xl transition-colors shadow-sm"
            >
              Cancel
            </button>
          </div>
        </div>,
        document.body
      )}

      {/* Visitor pre-booking QR — instructions modal after reason selection */}
      <VisitInstructionsModal
        isOpen={showVisitorQrInstructionsModal}
        reasonLabel={visitorQrSelectedReason?.label || ""}
        instructions={visitorQrSelectedReason?.instructions || ""}
        onContinue={() => {
          setShowVisitorQrInstructionsModal(false);
          if (pendingVisitorQrCode) {
            proceedAfterVisitorQrReason(pendingVisitorQrCode, visitorQrSelectedReason);
            setPendingVisitorQrCode(null);
          }
        }}
      />
    </div>
  );
}