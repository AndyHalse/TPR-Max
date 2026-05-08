import { useEffect, useRef, useState, useCallback } from "react";
import { BrowserMultiFormatReader } from "@zxing/library";
import { CheckCircle2, XCircle, Camera, Loader2, QrCode, RotateCcw, List } from "lucide-react";
import { Button } from "@/components/ui/button";
import ScannerReticle from "@/components/ScannerReticle";
import { playBeep } from "@/hooks/useCameraScanner";

interface ScanFlash {
  personName: string;
  personType: string;
  message: string;
  success: boolean;
  alreadySafe?: boolean;
}

interface MusterQRScannerProps {
  urlId: string;
  marshalName: string;
  onSwitchToManual: () => void;
  onPersonMarkedSafe: (personId: string, personName: string) => void;
}

const TYPE_LABELS: Record<string, string> = {
  staff: "Staff", visitor: "Visitor", contractor: "Contractor", member: "Member",
};

type CamState = "starting" | "scanning" | "processing" | "error";

const codeReader = new BrowserMultiFormatReader();

export default function MusterQRScanner({ urlId, marshalName, onSwitchToManual, onPersonMarkedSafe }: MusterQRScannerProps) {
  const videoRef  = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef    = useRef<number | null>(null);
  const lastCodeRef = useRef<string | null>(null);
  const lastScanTimeRef = useRef<number>(0);
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const trackRef = useRef<MediaStreamTrack | null>(null);

  const [camState, setCamState]   = useState<CamState>("starting");
  const [camError, setCamError]   = useState<string | null>(null);
  const [flash, setFlash]         = useState<ScanFlash | null>(null);
  const [torchOn, setTorchOn]     = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);
  const [reticleFlash, setReticleFlash] = useState(false);

  const stopCamera = useCallback(() => {
    if (rafRef.current)    { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null; }
    if (videoRef.current)  { videoRef.current.srcObject = null; }
    trackRef.current = null;
    setTorchOn(false);
  }, []);

  const toggleTorch = useCallback(async () => {
    const track = trackRef.current;
    if (!track) return;
    const next = !torchOn;
    try {
      await track.applyConstraints({ advanced: [{ torch: next } as any] });
      setTorchOn(next);
    } catch { /* torch unavailable */ }
  }, [torchOn]);

  const showFlash = useCallback((f: ScanFlash) => {
    setFlash(f);
    if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
    flashTimerRef.current = setTimeout(() => {
      setFlash(null);
      lastCodeRef.current = null;
    }, 2200);
  }, []);

  const processQR = useCallback(async (qrData: string) => {
    if (lastCodeRef.current === qrData) return;
    lastCodeRef.current = qrData;
    setCamState("processing");
    playBeep();
    setReticleFlash(true);
    setTimeout(() => setReticleFlash(false), 400);

    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    if (navigator.vibrate) navigator.vibrate(80);

    try {
      const res = await fetch("/api/emergency/qr-mark-safe", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Fire-Marshal-Id": urlId,
        },
        credentials: "include",
        body: JSON.stringify({ qrData, marshalName }),
      });

      const data = await res.json();

      showFlash({
        personName: data.personName || "Unknown",
        personType: data.personType || "person",
        message:    data.message   || (data.success ? "Marked safe" : "Not recognised"),
        success:    !!data.success,
        alreadySafe: !!data.alreadySafe,
      });

      if (data.success && !data.alreadySafe && data.personId) {
        onPersonMarkedSafe(data.personId, data.personName);
        if (navigator.vibrate) navigator.vibrate([100, 60, 100]);
      }
    } catch {
      showFlash({ personName: "", personType: "", message: "Network error. Please try again.", success: false });
    }

    setCamState("scanning");
    if (flashTimerRef.current) {
      setTimeout(() => {
        lastCodeRef.current = null;
        if (rafRef.current) cancelAnimationFrame(rafRef.current);
        rafRef.current = requestAnimationFrame(scanFrame);
      }, 2300);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlId, marshalName, showFlash, onPersonMarkedSafe]);

  const scanFrame = useCallback(() => {
    const video  = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || !video.videoWidth) {
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
    if (!ctx) return;
    canvas.width  = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    try {
      const result = codeReader.decodeFromCanvas(canvas);
      processQR(result.getText());
    } catch {
      rafRef.current = requestAnimationFrame(scanFrame);
    }
  }, [processQR]);

  const startCamera = useCallback(() => {
    setCamState("starting");
    setCamError(null);
    lastCodeRef.current = null;
    lastScanTimeRef.current = 0;
    setFlash(null);
    setTorchSupported(false);
    setTorchOn(false);

    navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
    }).then(stream => {
      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) { stream.getTracks().forEach(t => t.stop()); return; }
      const track = stream.getVideoTracks()[0];
      trackRef.current = track;
      const caps = track.getCapabilities() as any;
      if (caps?.torch) setTorchSupported(true);
      video.muted = true;
      video.setAttribute("playsinline", "");
      video.srcObject = stream;
      video.play().catch(() => {});
      setCamState("scanning");
      rafRef.current = requestAnimationFrame(scanFrame);
    }).catch((err: any) => {
      const msg =
        err?.name === "NotAllowedError" ? "Camera access was denied. Tap the lock icon in your browser bar and allow camera access, then try again." :
        err?.name === "NotFoundError"   ? "No camera found on this device." :
        "Could not start camera. Please try again.";
      setCamError(msg);
      setCamState("error");
    });
  }, [scanFrame]);

  useEffect(() => {
    startCamera();
    return () => {
      stopCamera();
      if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
    };
  }, [startCamera, stopCamera]);

  const flashBg    = flash?.alreadySafe ? "bg-blue-600"  : flash?.success ? "bg-green-600" : "bg-red-600";
  const flashIcon  = flash?.alreadySafe ? <CheckCircle2 className="w-8 h-8 text-white" /> :
                     flash?.success     ? <CheckCircle2 className="w-8 h-8 text-white" /> :
                                          <XCircle      className="w-8 h-8 text-white" />;

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="relative bg-black flex-1 overflow-hidden" style={{ minHeight: "55vh" }}>
        <video ref={videoRef} className="absolute inset-0 w-full h-full object-cover" playsInline muted autoPlay />
        <canvas ref={canvasRef} className="hidden" />

        {(camState === "scanning" || camState === "processing") && (
          <ScannerReticle
            isScanning={camState === "scanning"}
            isFlashing={reticleFlash}
            torchOn={torchOn}
            torchSupported={torchSupported}
            onToggleTorch={toggleTorch}
            label={camState === "scanning" ? "Point at any ID badge QR code" : ""}
            color="#f87171"
          />
        )}

        {camState === "starting" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/70">
            <Loader2 className="w-10 h-10 text-white animate-spin" />
            <p className="text-white text-sm font-semibold">Starting camera…</p>
          </div>
        )}

        {camState === "processing" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/70">
            <Loader2 className="w-10 h-10 text-white animate-spin" />
            <p className="text-white text-sm font-semibold">Checking…</p>
          </div>
        )}

        {camState === "error" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black/85 px-8 text-center">
            <Camera className="w-14 h-14 text-gray-400" />
            <p className="text-white text-sm font-semibold leading-snug">{camError}</p>
            <Button onClick={startCamera} size="sm" className="bg-red-600 hover:bg-red-700 text-white px-6">
              <RotateCcw className="w-4 h-4 mr-2" /> Try Again
            </Button>
          </div>
        )}

        {flash && (
          <div className={`absolute inset-x-0 bottom-0 ${flashBg} px-4 py-4 animate-in slide-in-from-bottom-4 duration-200`}>
            <div className="flex items-center gap-3">
              <div className="flex-shrink-0">{flashIcon}</div>
              <div className="flex-1 min-w-0">
                {flash.personName && <p className="text-white font-black text-xl leading-tight truncate">{flash.personName}</p>}
                {flash.personType && (
                  <p className="text-white/80 text-xs font-semibold uppercase tracking-wide mt-0.5">
                    {flash.alreadySafe ? "Already safe · " : ""}{TYPE_LABELS[flash.personType] ?? flash.personType}
                  </p>
                )}
                <p className="text-white/90 text-sm mt-0.5 leading-snug">{flash.message}</p>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="bg-gray-900 px-4 py-3 flex items-center gap-3">
        <div className="flex-1 flex items-center gap-2">
          <QrCode className="w-4 h-4 text-green-400 flex-shrink-0" />
          <span className="text-white text-xs font-medium">Scans staff · visitor · contractor badges</span>
        </div>
        <Button
          size="sm"
          className="bg-white/15 hover:bg-white/25 text-white border border-white/30 font-semibold flex-shrink-0 gap-1.5"
          onClick={onSwitchToManual}
        >
          <List className="w-4 h-4" /> Manual List
        </Button>
      </div>
    </div>
  );
}
