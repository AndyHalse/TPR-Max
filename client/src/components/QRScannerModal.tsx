import { useEffect, useRef, useState, useCallback } from "react";
import jsQR from "jsqr";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { useQueryClient } from "@tanstack/react-query";
import { CheckCircle, XCircle, Camera, Loader2, QrCode, X, AlertTriangle, RotateCcw } from "lucide-react";

interface ScanResult {
  success: boolean;
  personName?: string;
  personType?: string;
  action?: string;
  message: string;
  details?: { company?: string; department?: string; purpose?: string };
}

interface QRScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type ScanState = "starting" | "scanning" | "processing" | "result" | "error";

const PERSON_TYPE_COLOURS: Record<string, string> = {
  visitor: "blue",
  staff: "purple",
  contractor: "orange",
};

const ACTION_LABELS: Record<string, string> = {
  checked_in: "Checked In",
  checked_out: "Checked Out",
  already_checked_in: "Already On Site",
};

export default function QRScannerModal({ isOpen, onClose }: QRScannerModalProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastScannedRef = useRef<string | null>(null);
  const queryClient = useQueryClient();

  const [scanState, setScanState] = useState<ScanState>("starting");
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [detectedCode, setDetectedCode] = useState<string | null>(null);

  const stopCamera = useCallback(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  const processQR = useCallback(async (qrData: string) => {
    if (lastScannedRef.current === qrData) return;
    lastScannedRef.current = qrData;
    setScanState("processing");
    setDetectedCode(qrData);
    stopCamera();

    try {
      const res = await apiRequest("POST", "/api/qr-scan/universal", { qrData });
      const data: ScanResult = await res.json();
      setResult(data);
      setScanState("result");
      if (data.success) {
        queryClient.invalidateQueries({ queryKey: ["/api/visitors"] });
        queryClient.invalidateQueries({ queryKey: ["/api/visitors/current"] });
        queryClient.invalidateQueries({ queryKey: ["/api/prebookings"] });
        queryClient.invalidateQueries({ queryKey: ["/api/contractors"] });
        queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      }
    } catch {
      setResult({ success: false, message: "Network error. Please try again." });
      setScanState("result");
    }
  }, [stopCamera, queryClient]);

  const scanFrame = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.readyState < 2) {
      rafRef.current = requestAnimationFrame(scanFrame);
      return;
    }
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const code = jsQR(imageData.data, imageData.width, imageData.height, {
      inversionAttempts: "dontInvert",
    });

    if (code?.data) {
      processQR(code.data);
    } else {
      rafRef.current = requestAnimationFrame(scanFrame);
    }
  }, [processQR]);

  const startCamera = useCallback(async () => {
    setScanState("starting");
    setCameraError(null);
    lastScannedRef.current = null;
    setResult(null);
    setDetectedCode(null);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "environment",
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
      setScanState("scanning");
      rafRef.current = requestAnimationFrame(scanFrame);
    } catch (err: any) {
      const msg = err?.name === "NotAllowedError"
        ? "Camera access was denied. Please allow camera access in your browser settings."
        : err?.name === "NotFoundError"
        ? "No camera found on this device."
        : "Could not start camera. Please try again.";
      setCameraError(msg);
      setScanState("error");
    }
  }, [scanFrame]);

  useEffect(() => {
    if (isOpen) {
      startCamera();
    } else {
      stopCamera();
    }
    return () => stopCamera();
  }, [isOpen, startCamera, stopCamera]);

  const handleClose = () => {
    stopCamera();
    onClose();
  };

  const handleScanAgain = () => {
    lastScannedRef.current = null;
    startCamera();
  };

  if (!isOpen) return null;

  const colour = result?.personType ? PERSON_TYPE_COLOURS[result.personType] ?? "blue" : "blue";
  const isSuccess = result?.success === true;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4">
      <div className="absolute inset-0 bg-black/75 backdrop-blur-sm" onClick={handleClose} />

      <div className="relative z-10 w-full sm:max-w-sm bg-white sm:rounded-2xl shadow-2xl rounded-t-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-gray-900 text-white">
          <div className="flex items-center gap-2">
            <QrCode className="w-5 h-5 text-blue-400" />
            <span className="font-semibold text-sm sm:text-base">Scan QR Code</span>
          </div>
          <button
            onClick={handleClose}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Camera viewfinder */}
        <div className="relative bg-black" style={{ aspectRatio: "4/3" }}>
          <video
            ref={videoRef}
            className="w-full h-full object-cover"
            playsInline
            muted
            autoPlay
          />
          <canvas ref={canvasRef} className="hidden" />

          {/* Viewfinder overlay */}
          {scanState === "scanning" && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="relative w-56 h-56">
                <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-white rounded-tl-lg" />
                <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-white rounded-tr-lg" />
                <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-white rounded-bl-lg" />
                <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-white rounded-br-lg" />
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-full h-0.5 bg-blue-400 opacity-80 animate-pulse" />
                </div>
              </div>
              <div className="absolute bottom-4 left-0 right-0 flex justify-center">
                <span className="text-white text-xs bg-black/50 px-3 py-1.5 rounded-full font-medium">
                  Point camera at QR code
                </span>
              </div>
            </div>
          )}

          {/* Starting state */}
          {scanState === "starting" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/60">
              <Loader2 className="w-10 h-10 text-white animate-spin" />
              <p className="text-white text-sm font-medium">Starting camera…</p>
            </div>
          )}

          {/* Processing state */}
          {scanState === "processing" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/70">
              <Loader2 className="w-10 h-10 text-blue-400 animate-spin" />
              <p className="text-white text-sm font-medium">Looking up record…</p>
              {detectedCode && (
                <p className="text-gray-400 text-xs font-mono max-w-[80%] truncate text-center">
                  {detectedCode}
                </p>
              )}
            </div>
          )}

          {/* Error state */}
          {scanState === "error" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/80 px-6">
              <Camera className="w-12 h-12 text-gray-400" />
              <p className="text-white text-sm font-semibold text-center">{cameraError}</p>
              <Button
                onClick={startCamera}
                size="sm"
                className="bg-blue-600 hover:bg-blue-700 text-white"
              >
                Try Again
              </Button>
            </div>
          )}
        </div>

        {/* Result panel */}
        {scanState === "result" && result && (
          <div className={`p-4 sm:p-5 ${isSuccess ? "bg-green-50" : "bg-red-50"}`}>
            <div className="flex items-start gap-3">
              <div className={`w-10 h-10 sm:w-12 sm:h-12 rounded-full flex items-center justify-center flex-shrink-0 ${
                isSuccess ? "bg-green-500" : "bg-red-500"
              }`}>
                {isSuccess
                  ? <CheckCircle className="text-white w-6 h-6 sm:w-7 sm:h-7" />
                  : <XCircle className="text-white w-6 h-6 sm:w-7 sm:h-7" />
                }
              </div>
              <div className="min-w-0 flex-1">
                {result.personName && (
                  <p className="font-bold text-gray-900 text-base sm:text-lg leading-tight">
                    {result.personName}
                  </p>
                )}
                {result.action && ACTION_LABELS[result.action] && (
                  <p className={`text-xs font-semibold uppercase tracking-wide mt-0.5 ${
                    isSuccess ? "text-green-700" : "text-red-700"
                  }`}>
                    {ACTION_LABELS[result.action]}
                  </p>
                )}
                <p className={`text-sm mt-1 leading-snug ${
                  isSuccess ? "text-green-800" : "text-red-800"
                }`}>
                  {result.message}
                </p>
                {result.details && (
                  <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5">
                    {result.details.company && (
                      <span className="text-xs text-gray-500">{result.details.company}</span>
                    )}
                    {result.details.department && (
                      <span className="text-xs text-gray-500">{result.details.department}</span>
                    )}
                    {result.details.purpose && (
                      <span className="text-xs text-gray-500">{result.details.purpose}</span>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="flex gap-2 mt-4">
              <Button
                onClick={handleScanAgain}
                className="flex-1 bg-gray-800 hover:bg-gray-900 text-white font-semibold py-2.5"
              >
                <RotateCcw className="mr-2 w-4 h-4" />
                Scan Another
              </Button>
              <Button
                variant="outline"
                onClick={handleClose}
                className="flex-1 font-semibold py-2.5"
              >
                Done
              </Button>
            </div>
          </div>
        )}

        {/* Scanning instruction footer */}
        {scanState === "scanning" && (
          <div className="px-4 py-3 bg-gray-50 border-t border-gray-200 text-center">
            <p className="text-xs text-gray-500">
              Scans visitor and contractor pre-bookings, ID passes, and staff cards
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
