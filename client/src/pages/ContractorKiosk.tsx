import { useState, useRef, useCallback, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import GlassCard from "@/components/GlassCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import WalkInContractorForm from "@/components/WalkInContractorForm";
import ContractorPassPreviewModal from "@/components/ContractorPassPreviewModal";
import HSAcceptanceModal from "@/components/HSAcceptanceModal";
import {
  HardHat,
  QrCode,
  Clock,
  Building2,
  Mail,
  Phone,
  CheckCircle,
  AlertTriangle,
  Search,
  LogIn,
  LogOut,
  UserPlus,
  CalendarPlus,
  Scan,
  ArrowLeft,
  Video,
  ClipboardList,
  ChevronRight,
  User,
  Camera,
  Loader2,
  XCircle,
} from "lucide-react";
import jsQR from "jsqr";

import type { ContractorCompany, ContractorWorker, CompanySettings } from "@shared/schema";

export default function ContractorKiosk() {
  const { toast } = useToast();
  const [activeSection, setActiveSection] = useState<"main" | "scan" | "walkin" | "prebook" | "checkin">("main");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCompany, setSelectedCompany] = useState<string>("");
  const [companySearchTerm, setCompanySearchTerm] = useState("");
  const [scannedCode, setScannedCode] = useState("");
  const [showPassPreview, setShowPassPreview] = useState(false);
  const [checkedInWorker, setCheckedInWorker] = useState<ContractorWorker | null>(null);
  const [checkedInCompanyName, setCheckedInCompanyName] = useState<string>("");
  const [isQrLookupLoading, setIsQrLookupLoading] = useState(false);

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

  // Host selection state
  const [selectedWorkerForCheckIn, setSelectedWorkerForCheckIn] = useState<ContractorWorker | null>(null);
  const [showHostSelection, setShowHostSelection] = useState(false);
  const [selectedHostForWorker, setSelectedHostForWorker] = useState("");

  // H&S acceptance state
  const [showHSModal, setShowHSModal] = useState(false);
  const [pendingCheckin, setPendingCheckin] = useState<{ workerId?: string; hostId?: string; qrCode?: string; prebookingMode?: boolean } | null>(null);
  const [pendingWorkerName, setPendingWorkerName] = useState<string>("");

  const { data: settings } = useQuery<CompanySettings>({
    queryKey: ["/api/settings"],
  });

  const { data: companies = [] } = useQuery<ContractorCompany[]>({
    queryKey: ["/api/contractors"],
  });

  const { data: workers = [] } = useQuery<ContractorWorker[]>({
    queryKey: [`/api/contractors/${selectedCompany}/workers`],
    enabled: !!selectedCompany,
  });

  const { data: staff = [] } = useQuery<any[]>({
    queryKey: ["/api/staff"],
  });

  const { data: todayPrebookings = [], isLoading: prebookingsLoading } = useQuery<any[]>({
    queryKey: ["/api/contractors/prebookings/today"],
    enabled: activeSection === "prebook",
    refetchInterval: activeSection === "prebook" ? 30000 : false,
  });

  const checkInMutation = useMutation({
    mutationFn: async ({ workerId, hostId, hsRulesAccepted }: { workerId: string; hostId: string; hsRulesAccepted?: boolean }) => {
      const response = await apiRequest("POST", `/api/contractors/workers/${workerId}/checkin`, {
        hostId,
        ...(hsRulesAccepted ? { hsRulesAccepted: true } : {})
      });
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: [`/api/contractors/${selectedCompany}/workers`] });
      queryClient.invalidateQueries({ queryKey: ["/api/contractors/workers/all"] });
      setShowHostSelection(false);
      setSelectedWorkerForCheckIn(null);
      setSelectedHostForWorker("");
      setCameraState("off");
      setActiveSection("main");

      if (data.ePassSent) {
        toast({
          title: "Digital Pass Sent",
          description: `E-Pass sent to ${data.worker?.email || 'contractor'}. They can use it to check out.`,
          duration: 5000
        });
      } else {
        const worker = data.worker;
        const company = companies.find(c => c.id === worker.companyId);
        setCheckedInWorker(worker);
        setCheckedInCompanyName(company?.name || "Unknown Company");
        setShowPassPreview(true);
        toast({ title: "Checked In", description: `${worker.firstName} ${worker.lastName} checked in successfully!` });
      }
    },
    onError: (error) => {
      toast({ title: "Cannot Check In", description: "Failed to check in worker", variant: "destructive" });
    },
  });

  const prebookingCheckinMutation = useMutation({
    mutationFn: async ({ qrCode, hsRulesAccepted }: { qrCode: string; hsRulesAccepted?: boolean }) => {
      const response = await apiRequest("POST", "/api/contractors/prebookings/checkin", {
        qrCode,
        ...(hsRulesAccepted ? { hsRulesAccepted: true } : {})
      });
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/contractors/prebookings/today"] });
      queryClient.invalidateQueries({ queryKey: ["/api/contractors/workers/all"] });
      toast({ title: "Checked In", description: `Pre-booked contractor checked in successfully!`, duration: 4000 });
      setActiveSection("main");
    },
    onError: () => {
      toast({ title: "Check-In Failed", description: "Could not complete the pre-booking check-in. Please see reception.", variant: "destructive" });
    },
  });

  const checkOutMutation = useMutation({
    mutationFn: async (workerId: string) => {
      const response = await apiRequest("POST", `/api/contractors/workers/${workerId}/checkout`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/contractors/${selectedCompany}/workers`] });
      queryClient.invalidateQueries({ queryKey: ["/api/contractors/workers/all"] });
      toast({ title: "Checked Out", description: "Worker checked out successfully!" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to check out worker", variant: "destructive" });
    },
  });

  // QR scan handler (works for both camera auto-scan and manual entry)
  // Handles all QR types: staff, visitor pre-booking, contractor pre-booking, contractor worker
  const handleQrScan = async (overrideCode?: string) => {
    const code = (overrideCode || scannedCode).trim();
    if (!code) {
      toast({ title: "No code entered", description: "Please scan or type a QR code", variant: "destructive" });
      return;
    }

    // Staff QR codes
    if (code.startsWith('STF-')) {
      setCameraState('off');
      setScannedCode('');
      try {
        const resp = await apiRequest("POST", "/api/staff/qr-checkin", { qrCode: code });
        const data = await resp.json();
        queryClient.invalidateQueries({ queryKey: ["/api/staff/checked-in"] });
        toast({ title: data.action === 'checked_in' ? "Staff Checked In" : "Staff Checked Out", description: data.message });
      } catch {
        toast({ title: "Error", description: "Staff QR not recognised", variant: "destructive" });
      }
      isProcessingRef.current = false;
      setActiveSection("main");
      return;
    }

    // Visitor pre-booking QR codes (PB- is the stored DB format; PRE- is the email invitation format; PBK- is a dashboard alias)
    if (code.startsWith('PB-') || code.startsWith('PRE-') || code.startsWith('PBK-')) {
      setCameraState('off');
      setScannedCode('');
      try {
        const resp = await apiRequest("POST", "/api/prebookings/checkin", { qrCode: code });
        const data = await resp.json();
        queryClient.invalidateQueries({ queryKey: ["/api/visitors/current"] });
        queryClient.invalidateQueries({ queryKey: ["/api/visitors/today"] });
        const name = data.visitor ? `${data.visitor.firstName} ${data.visitor.lastName}` : "Visitor";
        toast({ title: "Visitor Checked In", description: `${name} checked in successfully` });
      } catch {
        toast({ title: "Error", description: "Visitor pre-booking not found", variant: "destructive" });
      }
      isProcessingRef.current = false;
      setActiveSection("main");
      return;
    }

    // Pre-booking QR codes (CPB- prefix) bypass the worker lookup
    if (code.startsWith('CPB-')) {
      setCameraState('off');
      setScannedCode('');
      const settingsAny = settings as any;
      const hsRequired = settingsAny?.hsRulesEnabled !== false && settingsAny?.hsRulesRequireAcceptance && settingsAny?.hsRulesContent;
      if (hsRequired) {
        setPendingWorkerName("Contractor");
        setPendingCheckin({ qrCode: code, prebookingMode: true });
        setShowHSModal(true);
      } else {
        prebookingCheckinMutation.mutate({ qrCode: code });
      }
      isProcessingRef.current = false;
      return;
    }

    setIsQrLookupLoading(true);
    try {
      const response = await fetch(`/api/contractors/workers/by-qr/${encodeURIComponent(code)}`, {
        credentials: "include",
      });

      if (response.status === 404) {
        setScanResult({ success: false, message: "QR pass not recognised. Please see reception for assistance." });
        setCameraState("error");
        isProcessingRef.current = false;
        setScannedCode("");
        return;
      }

      if (!response.ok) throw new Error("Lookup failed");

      const { worker, companyName } = await response.json();
      setScannedCode("");

      if (worker.isCheckedIn) {
        setCheckinSuccess({ name: `${worker.firstName} ${worker.lastName}`, company: companyName });
        setCameraState("processing");
        checkOutMutation.mutate(worker.id, {
          onSuccess: () => {
            setTimeout(() => {
              setCheckinSuccess(null);
              setScanResult(null);
              setCameraState("off");
              setActiveSection("main");
              isProcessingRef.current = false;
            }, 3000);
          },
          onError: () => {
            setCheckinSuccess(null);
            setScanResult({ success: false, message: "Check-out failed. Please try again." });
            setCameraState("error");
            isProcessingRef.current = false;
          }
        });
      } else {
        setCameraState("off");
        setIsQrLookupLoading(false);
        setSelectedWorkerForCheckIn(worker);
        setCheckedInCompanyName(companyName);
        setShowHostSelection(true);
        isProcessingRef.current = false;
      }
    } catch {
      setScanResult({ success: false, message: "Could not read QR code. Please try again." });
      setCameraState("error");
      isProcessingRef.current = false;
    } finally {
      setIsQrLookupLoading(false);
    }
  };

  // ── Camera scanning ──────────────────────────────────────────
  const stopCamera = useCallback(() => {
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null; }
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  const processDetectedCode = useCallback((code: string) => {
    if (isProcessingRef.current) return;
    if (lastScannedRef.current === code) return;
    isProcessingRef.current = true;
    lastScannedRef.current = code;
    setCameraState("processing");
    stopCamera();
    handleQrScan(code);
  }, [stopCamera]); // eslint-disable-line react-hooks/exhaustive-deps

  const scanFrame = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    // Skip decode if dimensions not yet available — keeps looping until ready.
    // We don't gate the UI on this; setCameraState("scanning") is called
    // immediately in startCamera so the viewfinder shows right away.
    if (!video || !canvas || !video.videoWidth || !video.videoHeight) {
      rafRef.current = requestAnimationFrame(scanFrame);
      return;
    }
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) { rafRef.current = requestAnimationFrame(scanFrame); return; }
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const qrCode = jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: "dontInvert" });
    if (qrCode?.data) {
      processDetectedCode(qrCode.data);
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
      // iOS Safari requires these attributes set imperatively
      video.muted = true;
      video.setAttribute('playsinline', '');
      video.setAttribute('autoplay', '');
      video.srcObject = stream;
      video.play().catch(() => {});
      // Show the scanning viewfinder immediately — don't wait for videoWidth.
      // scanFrame guards the actual QR decode on !videoWidth so we never crash.
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

  // Pre-booking check-in: tap name → H&S if needed → checkin
  const handlePrebookingSelect = (prebooking: any) => {
    const settingsAny = settings as any;
    const hsRequired = settingsAny?.hsRulesEnabled !== false && settingsAny?.hsRulesRequireAcceptance && settingsAny?.hsRulesContent;

    if (hsRequired) {
      setPendingWorkerName(prebooking.workerName || "Contractor");
      setPendingCheckin({ qrCode: prebooking.qrCode, prebookingMode: true });
      setShowHSModal(true);
    } else {
      prebookingCheckinMutation.mutate({ qrCode: prebooking.qrCode });
    }
  };

  const handleWorkerCheckIn = (worker: ContractorWorker) => {
    setSelectedWorkerForCheckIn(worker);
    setShowHostSelection(true);
  };

  const handleHostSelectionConfirm = () => {
    if (!selectedHostForWorker) {
      toast({ title: "Error", description: "Please select a host", variant: "destructive" });
      return;
    }
    if (selectedWorkerForCheckIn) {
      const checkinData = { workerId: selectedWorkerForCheckIn.id, hostId: selectedHostForWorker };
      const settingsAny = settings as any;
      if (settingsAny?.hsRulesEnabled !== false && settingsAny?.hsRulesRequireAcceptance && settingsAny?.hsRulesContent) {
        setShowHostSelection(false);
        setPendingWorkerName(`${selectedWorkerForCheckIn.firstName} ${selectedWorkerForCheckIn.lastName}`);
        setPendingCheckin(checkinData);
        setShowHSModal(true);
        return;
      }
      checkInMutation.mutate(checkinData);
    }
  };

  const handleHSAccepted = () => {
    setShowHSModal(false);
    if (pendingCheckin) {
      if (pendingCheckin.prebookingMode && pendingCheckin.qrCode) {
        prebookingCheckinMutation.mutate({ qrCode: pendingCheckin.qrCode, hsRulesAccepted: true });
      } else if (pendingCheckin.workerId && pendingCheckin.hostId) {
        checkInMutation.mutate({ workerId: pendingCheckin.workerId, hostId: pendingCheckin.hostId, hsRulesAccepted: true });
      }
      setPendingCheckin(null);
      setPendingWorkerName("");
    }
  };

  const handleHSDeclined = () => {
    setShowHSModal(false);
    setPendingCheckin(null);
    setPendingWorkerName("");
  };

  const filteredCompanies = companies.filter(c => c.name.toLowerCase().includes(companySearchTerm.toLowerCase()));
  const filteredWorkers = workers.filter(w =>
    w.firstName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    w.lastName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    w.email?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const settingsAny = settings as any;

  // ─── Walk-in sub-section ──────────────────────────────────────────────────
  if (activeSection === "walkin") {
    return (
      <div className="min-h-screen bg-background">
        <WalkInContractorForm onBack={() => setActiveSection("main")} />
      </div>
    );
  }

  // ─── QR Scan sub-section ──────────────────────────────────────────────────
  if (activeSection === "scan") {
    return (
      <div className="min-h-screen max-h-screen overflow-auto bg-background p-2 sm:p-3 flex flex-col">
        <div className="max-w-3xl mx-auto space-y-4 sm:space-y-6 flex-1 flex flex-col justify-center">
          <div className="text-center flex-shrink-0">
            <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-fixed mb-2 sm:mb-4">
              QR Code Scanner
            </h2>
            <p className="text-variable text-base sm:text-lg lg:text-xl">
              Scan any QR pass — contractor, visitor, or staff
            </p>
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

              {/* Scanning overlay — viewfinder brackets */}
              {cameraState === "scanning" && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="relative w-52 h-52 sm:w-64 sm:h-64">
                    <div className="absolute top-0 left-0 w-10 h-10 border-t-4 border-l-4 border-white rounded-tl-lg" />
                    <div className="absolute top-0 right-0 w-10 h-10 border-t-4 border-r-4 border-white rounded-tr-lg" />
                    <div className="absolute bottom-0 left-0 w-10 h-10 border-b-4 border-l-4 border-white rounded-bl-lg" />
                    <div className="absolute bottom-0 right-0 w-10 h-10 border-b-4 border-r-4 border-white rounded-br-lg" />
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="w-full h-0.5 bg-purple-400 opacity-80 animate-pulse" />
                    </div>
                  </div>
                  <div className="absolute bottom-4 left-0 right-0 flex justify-center">
                    <span className="text-white text-sm bg-black/50 px-3 py-1.5 rounded-full font-medium">
                      Point camera at contractor QR pass — scans automatically
                    </span>
                  </div>
                </div>
              )}

              {/* Processing overlay */}
              {cameraState === "processing" && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/70">
                  <Loader2 className="w-12 h-12 text-purple-400 animate-spin" />
                  <p className="text-white text-base font-medium">Processing…</p>
                </div>
              )}

              {/* Error / camera not available */}
              {cameraState === "error" && !checkinSuccess && !scanResult && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/80 px-6 text-center">
                  <Camera className="w-12 h-12 text-gray-400" />
                  <p className="text-white text-sm">{cameraError || "Camera unavailable"}</p>
                  <Button size="sm" onClick={startCamera} className="bg-purple-600 hover:bg-purple-700 text-white">
                    Try Again
                  </Button>
                </div>
              )}

              {/* Check-in / check-out success overlay */}
              {checkinSuccess && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/85">
                  <div className="mx-4 p-6 rounded-xl border-2 bg-green-50 border-green-400 text-center w-full max-w-xs">
                    <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-3" />
                    <h3 className="text-2xl font-bold text-green-700 mb-1">
                      {checkinSuccess.name && checkOutMutation.isPending ? "Checking Out…" : "Welcome!"}
                    </h3>
                    <p className="text-xl font-semibold text-gray-900">{checkinSuccess.name}</p>
                    {checkinSuccess.company && (
                      <p className="text-sm text-gray-600 mt-0.5">{checkinSuccess.company}</p>
                    )}
                    <p className="text-xs text-gray-500 mt-2">Closing automatically…</p>
                  </div>
                </div>
              )}

              {/* Scan error result */}
              {scanResult && !checkinSuccess && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/80">
                  <div className={`mx-4 p-6 rounded-xl border-2 text-center ${scanResult.success ? 'bg-green-50 border-green-400' : 'bg-red-50 border-red-400'}`}>
                    {scanResult.success
                      ? <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-2" />
                      : <XCircle className="w-12 h-12 text-red-500 mx-auto mb-2" />
                    }
                    <p className={`font-semibold text-base ${scanResult.success ? 'text-green-800' : 'text-red-800'}`}>
                      {scanResult.message}
                    </p>
                    {!scanResult.success && (
                      <Button size="sm" onClick={() => { setScanResult(null); startCamera(); }} className="mt-3 bg-purple-600 hover:bg-purple-700 text-white">
                        Try Again
                      </Button>
                    )}
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
                  onKeyDown={(e) => { if (e.key === "Enter" && scannedCode.trim()) handleQrScan(); }}
                  className="flex-1 font-mono text-sm"
                />
                <Button
                  onClick={() => handleQrScan()}
                  disabled={!scannedCode.trim() || isQrLookupLoading || checkOutMutation.isPending}
                  className="bg-gradient-to-r from-purple-500 to-indigo-500 hover:from-purple-600 hover:to-indigo-600 text-white"
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
        </div>

        <Dialog open={showHostSelection} onOpenChange={setShowHostSelection}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Select Host for {selectedWorkerForCheckIn?.firstName} {selectedWorkerForCheckIn?.lastName}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <p className="text-sm text-variable">Who is {selectedWorkerForCheckIn?.firstName} visiting today?</p>
              <div className="space-y-2">
                <Label className="text-sm font-medium">Host Staff Member *</Label>
                <Select value={selectedHostForWorker} onValueChange={setSelectedHostForWorker}>
                  <SelectTrigger><SelectValue placeholder="Select host staff member" /></SelectTrigger>
                  <SelectContent>
                    {staff?.map((member: any) => (
                      <SelectItem key={member.id} value={member.id}>
                        {member.firstName} {member.lastName} — {member.department}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter className="mt-6">
              <Button variant="outline" onClick={() => { setShowHostSelection(false); setSelectedWorkerForCheckIn(null); setSelectedHostForWorker(""); }}>Cancel</Button>
              <Button onClick={handleHostSelectionConfirm} disabled={!selectedHostForWorker || checkInMutation.isPending}>
                {checkInMutation.isPending ? "Checking In…" : "Confirm Check-In"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <HSAcceptanceModal
          isOpen={showHSModal}
          companyName={settingsAny?.companyName}
          workerName={pendingWorkerName || undefined}
          hsRulesContent={settingsAny?.hsRulesContent || ""}
          onAccept={handleHSAccepted}
          onDecline={handleHSDeclined}
        />

        {checkedInWorker && (
          <ContractorPassPreviewModal
            isOpen={showPassPreview}
            onClose={() => { setShowPassPreview(false); setCheckedInWorker(null); setCheckedInCompanyName(""); }}
            worker={checkedInWorker}
            companyName={checkedInCompanyName}
          />
        )}
      </div>
    );
  }

  // ─── Pre-Booked Contractor sub-section ───────────────────────────────────────────
  if (activeSection === "prebook") {
    const pendingBookings = todayPrebookings.filter((b: any) => b.status !== "completed" && b.status !== "cancelled");
    const completedBookings = todayPrebookings.filter((b: any) => b.status === "completed");

    return (
      <div className="min-h-screen max-h-screen overflow-auto bg-background p-3 sm:p-4 flex flex-col">
        <div className="max-w-3xl mx-auto w-full flex-1 flex flex-col gap-4 sm:gap-6">
          {/* Header */}
          <div className="text-center flex-shrink-0">
            <div className="w-16 h-16 sm:w-20 sm:h-20 bg-gradient-to-r from-blue-500 to-indigo-500 rounded-full flex items-center justify-center mx-auto mb-3">
              <ClipboardList className="text-white w-8 h-8 sm:w-10 sm:h-10" />
            </div>
            <h2 className="text-2xl sm:text-3xl font-bold text-fixed mb-1">Pre-Booked Contractor</h2>
            <p className="text-variable text-sm sm:text-base">Select your name below to check in</p>
          </div>

          {/* Booking list */}
          <GlassCard className="flex-1 p-4 sm:p-6">
            {prebookingsLoading ? (
              <div className="text-center py-12 text-variable">
                <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                <p>Loading today's bookings…</p>
              </div>
            ) : pendingBookings.length === 0 ? (
              <div className="text-center py-12">
                <ClipboardList className="w-14 h-14 text-gray-300 mx-auto mb-4" />
                <p className="text-lg font-semibold text-fixed mb-1">No pre-bookings for today</p>
                <p className="text-variable text-sm">If you have a booking and your name isn't shown, please see reception.</p>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-sm font-medium text-variable mb-3">
                  {pendingBookings.length} booking{pendingBookings.length !== 1 ? "s" : ""} awaiting check-in today
                </p>
                {pendingBookings.map((booking: any) => (
                  <button
                    key={booking.id}
                    onClick={() => handlePrebookingSelect(booking)}
                    disabled={prebookingCheckinMutation.isPending}
                    className="w-full text-left p-4 sm:p-5 rounded-xl border-2 border-gray-200 hover:border-blue-400 hover:bg-blue-50 active:scale-[0.99] transition-all group flex items-center justify-between gap-3 bg-white disabled:opacity-50"
                  >
                    <div className="flex items-center gap-3 sm:gap-4 min-w-0">
                      <div className="w-12 h-12 sm:w-14 sm:h-14 bg-gradient-to-br from-blue-100 to-indigo-100 rounded-full flex items-center justify-center flex-shrink-0 group-hover:from-blue-200 group-hover:to-indigo-200 transition-colors">
                        <User className="w-6 h-6 sm:w-7 sm:h-7 text-blue-600" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-base sm:text-lg font-bold text-fixed truncate">{booking.workerName}</p>
                        <p className="text-sm text-variable truncate">{booking.companyName}</p>
                        {booking.scheduledTime && (
                          <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                            <Clock className="w-3 h-3" />
                            Booked for {booking.scheduledTime}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className="hidden sm:block text-sm font-semibold text-blue-600 group-hover:text-blue-700">Tap to check in</span>
                      <ChevronRight className="w-5 h-5 text-blue-500 group-hover:translate-x-0.5 transition-transform" />
                    </div>
                  </button>
                ))}
              </div>
            )}

            {/* Completed bookings */}
            {completedBookings.length > 0 && (
              <div className="mt-6 pt-4 border-t border-gray-100">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Already checked in today</p>
                <div className="space-y-2">
                  {completedBookings.map((booking: any) => (
                    <div key={booking.id} className="flex items-center gap-3 p-3 rounded-lg bg-green-50 border border-green-100">
                      <CheckCircle className="w-4 h-4 text-green-600 flex-shrink-0" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-green-800 truncate">{booking.workerName}</p>
                        <p className="text-xs text-green-600 truncate">{booking.companyName}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </GlassCard>

          <Button
            variant="outline"
            onClick={() => setActiveSection("main")}
            className="flex-shrink-0 h-12 text-base"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Menu
          </Button>
        </div>

        <HSAcceptanceModal
          isOpen={showHSModal}
          companyName={settingsAny?.companyName}
          workerName={pendingWorkerName || undefined}
          hsRulesContent={settingsAny?.hsRulesContent || ""}
          onAccept={handleHSAccepted}
          onDecline={handleHSDeclined}
        />
      </div>
    );
  }

  // ─── Manual Check-In sub-section (admin/reception use) ────────────────────
  if (activeSection === "checkin") {
    return (
      <div className="min-h-screen bg-background p-4 md:p-6">
        <div className="max-w-6xl mx-auto space-y-6">
          <GlassCard className="text-center">
            <div className="flex items-center justify-center gap-3 mb-4">
              <HardHat className="h-10 w-10 text-orange-600" />
              <h1 className="text-3xl font-bold text-fixed">Contractor Worker Check-In/Out</h1>
            </div>
            <p className="text-variable">Select registered contractor workers for check-in/out</p>
          </GlassCard>

          <GlassCard>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Label className="text-lg font-semibold text-slate-700">
                  Select Contractor Company ({companies.length} total)
                </Label>
                <Button variant="outline" onClick={() => setActiveSection("main")} className="text-variable">
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Back to Menu
                </Button>
              </div>

              <div className="relative">
                <Search className="absolute left-3 top-3 h-5 w-5 text-variable" />
                <Input
                  value={companySearchTerm}
                  onChange={(e) => setCompanySearchTerm(e.target.value)}
                  placeholder="Search contractors by name…"
                  className="pl-10"
                />
              </div>

              <Select value={selectedCompany} onValueChange={setSelectedCompany}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Choose a contractor company…" />
                </SelectTrigger>
                <SelectContent className="max-h-[300px] overflow-y-auto">
                  {filteredCompanies.map((company) => (
                    <SelectItem key={company.id} value={company.id}>
                      <div className="flex items-center gap-2">
                        <Building2 className="h-4 w-4 flex-shrink-0" />
                        <span className="truncate">{company.name}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </GlassCard>

          {selectedCompany && (
            <GlassCard>
              <div className="space-y-4">
                <Label className="text-lg font-semibold text-slate-700">Search Workers</Label>
                <div className="relative">
                  <Search className="absolute left-3 top-3 h-5 w-5 text-variable" />
                  <Input
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Search by name or email…"
                    className="pl-10"
                  />
                </div>
              </div>
            </GlassCard>
          )}

          {selectedCompany && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {filteredWorkers.map((worker) => (
                <GlassCard key={worker.id} className="hover:shadow-lg transition-shadow">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h3 className="text-lg font-semibold text-fixed">{worker.firstName} {worker.lastName}</h3>
                      {worker.email && (
                        <div className="flex items-center gap-1 text-sm text-variable">
                          <Mail className="h-4 w-4" />{worker.email}
                        </div>
                      )}
                    </div>
                    <div className="flex flex-col gap-2 items-end">
                      {worker.isCheckedIn ? (
                        <Button onClick={() => checkOutMutation.mutate(worker.id)} disabled={checkOutMutation.isPending} className="bg-red-600 hover:bg-red-700 text-white">
                          <LogOut className="mr-2 h-4 w-4" />Check Out
                        </Button>
                      ) : !worker.inductionCompleted ? (
                        <div className="flex flex-col gap-2">
                          <div className="text-center p-2 bg-red-50 border border-red-200 rounded-lg">
                            <p className="text-red-700 text-sm font-medium">Cannot Check In</p>
                            <p className="text-red-600 text-xs">Induction not completed</p>
                          </div>
                          <Button onClick={() => window.open(`/induction/preview?role=contractor&workerId=${worker.id}`, '_blank')} variant="outline" className="border-blue-500 text-blue-600">
                            <Video className="mr-2 h-4 w-4" />Start Induction
                          </Button>
                        </div>
                      ) : (
                        <Button onClick={() => handleWorkerCheckIn(worker)} disabled={checkInMutation.isPending} className="bg-green-600 hover:bg-green-700 text-white">
                          <LogIn className="mr-2 h-4 w-4" />Check In
                        </Button>
                      )}
                    </div>
                  </div>
                  {worker.isCheckedIn && worker.checkedInAt && (
                    <div className="text-sm text-variable flex items-center gap-2">
                      <Clock className="h-4 w-4" />
                      Checked in at {new Date(worker.checkedInAt).toLocaleTimeString()}
                    </div>
                  )}
                </GlassCard>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ─── Main kiosk menu ──────────────────────────────────────────────────────
  return (
    <div className="h-screen bg-background flex flex-col px-4 sm:px-6 lg:px-8 py-3 sm:py-4 overflow-hidden">
      {/* Company banner */}
      {settingsAny?.bannerUrl && (
        <div className="w-full max-w-2xl mx-auto mb-2 sm:mb-3 rounded-xl overflow-hidden flex-shrink-0" style={{ maxHeight: '18vh' }}>
          <img
            src={`/objects${settingsAny.bannerUrl}`}
            alt={settingsAny.companyName || ''}
            className="w-full h-full object-contain"
            onError={(e) => {
              e.currentTarget.style.display = 'none';
              const c = e.currentTarget.parentElement;
              if (c) c.style.display = 'none';
            }}
          />
        </div>
      )}

      {/* Heading — tapping navigates back to dashboard (like main kiosk) */}
      <div className="text-center flex-shrink-0 py-2 sm:py-3">
        <h2
          className="text-xl sm:text-2xl lg:text-3xl font-bold text-foreground mb-0.5 cursor-pointer hover:opacity-70 transition-opacity select-none"
          onClick={() => { window.location.href = "/"; }}
        >
          Welcome to {settingsAny?.companyName || 'Contractor Check-In'}
        </h2>
        <p className="text-muted-foreground text-sm sm:text-base">Please select an option below</p>
      </div>

      {/* Option menu */}
      <div className="flex-1 flex flex-col justify-center max-w-5xl mx-auto w-full min-h-0 gap-3 sm:gap-5">

        {/* Mobile: stacked rows with icon left-aligned. Desktop: 3-column cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-6">

          {/* Scan QR Code */}
          <div className="cursor-pointer group" onClick={() => setActiveSection("scan")}>
            <GlassCard hover className="flex flex-row sm:flex-col items-center gap-4 sm:gap-3 py-4 sm:py-8 px-4 sm:px-4 h-full sm:justify-center sm:text-center">
              <div className="w-14 h-14 sm:w-20 sm:h-20 bg-gradient-to-r from-purple-500 to-indigo-500 rounded-full flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform">
                <QrCode className="text-white w-7 h-7 sm:w-9 sm:h-9" />
              </div>
              <div>
                <h3 className="text-base sm:text-lg font-bold text-foreground leading-tight">Scan QR Code</h3>
                <p className="text-muted-foreground text-sm mt-0.5">Check in or check out with your pass</p>
              </div>
            </GlassCard>
          </div>

          {/* Walk-in Registration */}
          <div className="cursor-pointer group" onClick={() => setActiveSection("walkin")}>
            <GlassCard hover className="flex flex-row sm:flex-col items-center gap-4 sm:gap-3 py-4 sm:py-8 px-4 sm:px-4 h-full sm:justify-center sm:text-center">
              <div className="w-14 h-14 sm:w-20 sm:h-20 bg-gradient-to-r from-green-500 to-teal-500 rounded-full flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform">
                <UserPlus className="text-white w-7 h-7 sm:w-9 sm:h-9" />
              </div>
              <div>
                <h3 className="text-base sm:text-lg font-bold text-foreground leading-tight">Walk-in Contractor</h3>
                <p className="text-muted-foreground text-sm mt-0.5">Register and get your site pass</p>
              </div>
            </GlassCard>
          </div>

          {/* Pre-Booked Contractor */}
          <div className="cursor-pointer group" onClick={() => setActiveSection("prebook")}>
            <GlassCard hover className="flex flex-row sm:flex-col items-center gap-4 sm:gap-3 py-4 sm:py-8 px-4 sm:px-4 h-full sm:justify-center sm:text-center">
              <div className="w-14 h-14 sm:w-20 sm:h-20 bg-gradient-to-r from-blue-500 to-indigo-500 rounded-full flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform">
                <CalendarPlus className="text-white w-7 h-7 sm:w-9 sm:h-9" />
              </div>
              <div>
                <h3 className="text-base sm:text-lg font-bold text-foreground leading-tight">Pre-Booked Contractor</h3>
                <p className="text-muted-foreground text-sm mt-0.5">Select your name to check in</p>
              </div>
            </GlassCard>
          </div>
        </div>

        {/* Instructions bar */}
        <GlassCard className="flex-shrink-0 p-3 sm:p-5">
          <h3 className="text-sm sm:text-base font-semibold text-fixed mb-2 sm:mb-3 text-center">Instructions</h3>
          <div className="grid grid-cols-3 gap-2 sm:gap-6">
            <div className="text-center">
              <QrCode className="mx-auto mb-1 text-purple-500" size={18} />
              <p className="font-medium text-xs sm:text-sm text-foreground">Returning contractors</p>
              <p className="text-xs text-muted-foreground mt-0.5 hidden sm:block">Scan your QR pass to check in or out</p>
            </div>
            <div className="text-center">
              <UserPlus className="mx-auto mb-1 text-green-500" size={18} />
              <p className="font-medium text-xs sm:text-sm text-foreground">New contractors</p>
              <p className="text-xs text-muted-foreground mt-0.5 hidden sm:block">Register here to get your site pass</p>
            </div>
            <div className="text-center">
              <CalendarPlus className="mx-auto mb-1 text-blue-500" size={18} />
              <p className="font-medium text-xs sm:text-sm text-foreground">Pre-booked visit</p>
              <p className="text-xs text-muted-foreground mt-0.5 hidden sm:block">Tap your name from today's list</p>
            </div>
          </div>
        </GlassCard>
      </div>

      {/* Pass preview modal */}
      {checkedInWorker && (
        <ContractorPassPreviewModal
          isOpen={showPassPreview}
          onClose={() => { setShowPassPreview(false); setCheckedInWorker(null); setCheckedInCompanyName(""); }}
          worker={checkedInWorker}
          companyName={checkedInCompanyName}
        />
      )}

      {/* Host selection dialog */}
      <Dialog open={showHostSelection} onOpenChange={setShowHostSelection}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Select Host for {selectedWorkerForCheckIn?.firstName} {selectedWorkerForCheckIn?.lastName}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-variable">Who is {selectedWorkerForCheckIn?.firstName} visiting today?</p>
            <div className="space-y-2">
              <Label className="text-sm font-medium">Host Staff Member *</Label>
              <Select value={selectedHostForWorker} onValueChange={setSelectedHostForWorker}>
                <SelectTrigger><SelectValue placeholder="Select host staff member" /></SelectTrigger>
                <SelectContent>
                  {staff?.map((member: any) => (
                    <SelectItem key={member.id} value={member.id}>
                      {member.firstName} {member.lastName} — {member.department}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter className="mt-6">
            <Button variant="outline" onClick={() => { setShowHostSelection(false); setSelectedWorkerForCheckIn(null); setSelectedHostForWorker(""); }}>
              Cancel
            </Button>
            <Button onClick={handleHostSelectionConfirm} disabled={!selectedHostForWorker || checkInMutation.isPending}>
              {checkInMutation.isPending ? "Checking In…" : "Confirm Check-In"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* H&S acceptance modal */}
      <HSAcceptanceModal
        isOpen={showHSModal}
        companyName={settingsAny?.companyName}
        workerName={pendingWorkerName || undefined}
        hsRulesContent={settingsAny?.hsRulesContent || ""}
        onAccept={handleHSAccepted}
        onDecline={handleHSDeclined}
      />
    </div>
  );
}
