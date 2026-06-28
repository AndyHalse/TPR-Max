import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { queryClient, apiRequest, objectUrl } from "@/lib/queryClient";
import { Search, QrCode, CheckCircle2, LogOut, LogIn } from "lucide-react";
import type { CompanySettings } from "@shared/schema";
import jsQR from "jsqr";
import ScannerReticle from "@/components/ScannerReticle";
import { playBeep } from "@/hooks/useCameraScanner";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

// ── Types ─────────────────────────────────────────────────────────────────────

interface KioskStaff {
  id: string;
  firstName: string;
  lastName: string;
  department: string | null;
  jobTitle: string | null;
  photoUrl: string | null;
  isCheckedIn: boolean;
  checkedInAt: string | null;
  qrCode: string | null;
  barcodeNumber: string | null;
  lastCheckInAt: string | null;
}

type Mode = "checkin" | "checkout";
type Screen = "list" | "scan" | "confirmation";

interface ConfirmState {
  firstName: string;
  action: "checkin" | "checkout";
  time: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function ukTime(date = new Date()) {
  return date.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/London",
  });
}

// ── Staff Avatar ──────────────────────────────────────────────────────────────

function StaffAvatar({ staff, size = 60 }: { staff: KioskStaff; size?: number }) {
  const [failed, setFailed] = useState(false);
  const initials = `${staff.firstName?.[0] ?? ""}${staff.lastName?.[0] ?? ""}`.toUpperCase();
  const palette = ["#2460A9", "#7c3aed", "#059669", "#0284c7", "#d97706", "#dc2626", "#0891b2", "#4f46e5"];
  const bg = palette[((staff.firstName.charCodeAt(0) || 0) + (staff.lastName.charCodeAt(0) || 0)) % palette.length];

  if (staff.photoUrl && !failed) {
    const src = staff.photoUrl.startsWith("http")
      ? staff.photoUrl
      : objectUrl(`/objects${staff.photoUrl}`);
    return (
      <img
        src={src}
        alt=""
        className="rounded-full object-cover flex-shrink-0 bg-slate-100"
        style={{ width: size, height: size }}
        onError={() => setFailed(true)}
      />
    );
  }
  return (
    <div
      className="rounded-full flex items-center justify-center text-white font-bold select-none flex-shrink-0"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.36), backgroundColor: bg }}
    >
      {initials}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function StaffKiosk() {
  const [, setLocation] = useLocation();
  const [mode, setMode] = useState<Mode>("checkin");
  const [screen, setScreen] = useState<Screen>("list");
  const [search, setSearch] = useState("");
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);

  // ── Camera state ──────────────────────────────────────────────────────────
  const [camState, setCamState] = useState<"off" | "starting" | "scanning" | "processing" | "error">("off");
  const [camError, setCamError] = useState<string | null>(null);
  const [scanMsg, setScanMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [reticleFlash, setReticleFlash] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const trackRef = useRef<MediaStreamTrack | null>(null);
  const lastScannedRef = useRef<string | null>(null);
  const isProcessingRef = useRef(false);
  const lastScanTimeRef = useRef(0);

  // Stale-closure guards for camera callbacks
  const modeRef = useRef<Mode>(mode);
  useEffect(() => { modeRef.current = mode; }, [mode]);
  const kioskStaffRef = useRef<KioskStaff[]>([]);
  const toggleMutationRef = useRef<((id: string) => void) | null>(null);

  // ── Idle reset: return to default list after 60s of inactivity ───────────
  const lastActivityRef = useRef(Date.now());
  useEffect(() => {
    const touch = () => { lastActivityRef.current = Date.now(); };
    window.addEventListener("pointerdown", touch);
    window.addEventListener("keydown", touch);
    const interval = setInterval(() => {
      if (Date.now() - lastActivityRef.current > 60_000) {
        setScreen("list");
        setSearch("");
        setConfirm(null);
        lastActivityRef.current = Date.now();
      }
    }, 5_000);
    return () => {
      window.removeEventListener("pointerdown", touch);
      window.removeEventListener("keydown", touch);
      clearInterval(interval);
    };
  }, []);

  // ── Queries ───────────────────────────────────────────────────────────────
  const { data: kioskStaff = [] } = useQuery<KioskStaff[]>({
    queryKey: ["/api/staff/kiosk-list"],
    refetchInterval: 25_000,
    staleTime: 15_000,
  });
  useEffect(() => { kioskStaffRef.current = kioskStaff; }, [kioskStaff]);

  const { data: settings } = useQuery<CompanySettings>({
    queryKey: ["/api/settings"],
    staleTime: 5 * 60_000,
  });

  // ── Branding: apply accent colour from company settings ───────────────────
  useEffect(() => {
    if (!settings?.accentColor) return;
    const hex = settings.accentColor;
    const r = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    if (!r) return;
    const rv = parseInt(r[1], 16) / 255, gv = parseInt(r[2], 16) / 255, bv = parseInt(r[3], 16) / 255;
    const max = Math.max(rv, gv, bv), min = Math.min(rv, gv, bv);
    let h = 0, sv = 0;
    const lv = (max + min) / 2;
    if (max !== min) {
      const d = max - min;
      sv = lv > 0.5 ? d / (2 - max - min) : d / (max + min);
      if (max === rv) h = (gv - bv) / d + (gv < bv ? 6 : 0);
      else if (max === gv) h = (bv - rv) / d + 2;
      else h = (rv - gv) / d + 4;
      h /= 6;
    }
    const hsl = `${Math.round(h * 360)}, ${Math.round(sv * 100)}%, ${Math.round(lv * 100)}%`;
    document.documentElement.style.setProperty("--primary", `hsl(${hsl})`);
    document.documentElement.style.setProperty("--ring", `hsl(${hsl})`);
  }, [settings?.accentColor]);

  // ── Toggle mutation ───────────────────────────────────────────────────────
  const toggleMutation = useMutation({
    mutationFn: async (id: string) => {
      const r = await apiRequest("POST", `/api/staff/${id}/kiosk-toggle`, {});
      return r.json() as Promise<{ action: "checkin" | "checkout"; staff: { firstName: string; lastName: string } }>;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/staff/kiosk-list"] });
      queryClient.invalidateQueries({ queryKey: ["/api/staff"] });
      queryClient.invalidateQueries({ queryKey: ["/api/staff/checked-in"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      setConfirm({
        firstName: data.staff.firstName,
        action: data.action,
        time: ukTime(),
      });
      setSearch("");
      setScreen("confirmation");
      setScanMsg(null);
      setTimeout(() => {
        setConfirm(null);
        setScreen("list");
        isProcessingRef.current = false;
        lastScannedRef.current = null;
      }, 3_000);
    },
    onError: () => {
      isProcessingRef.current = false;
      lastScannedRef.current = null;
      if (screen === "scan") {
        setScanMsg({ ok: false, text: "Couldn't reach the system — please try again or see reception." });
        setCamState("error");
      }
    },
  });
  useEffect(() => {
    toggleMutationRef.current = (id: string) => toggleMutation.mutate(id);
  });

  // ── Derived: sorted + filtered display list ───────────────────────────────
  const displayStaff = useMemo(() => {
    const q = search.trim().toLowerCase();
    const base = mode === "checkin"
      ? kioskStaff.filter(s => !s.isCheckedIn)
      : kioskStaff.filter(s => s.isCheckedIn);

    const filtered = q
      ? base.filter(s =>
          s.firstName.toLowerCase().includes(q) ||
          s.lastName.toLowerCase().includes(q) ||
          (s.department ?? "").toLowerCase().includes(q)
        )
      : base;

    return [...filtered].sort((a, b) => {
      if (mode === "checkin") {
        // Most recent previous check-in first; never-checked-in to bottom alphabetically
        if (a.lastCheckInAt && b.lastCheckInAt) {
          return new Date(b.lastCheckInAt).getTime() - new Date(a.lastCheckInAt).getTime();
        }
        if (a.lastCheckInAt) return -1;
        if (b.lastCheckInAt) return 1;
        return a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName);
      } else {
        // Most recent check-in first (people who just arrived near the top)
        if (a.checkedInAt && b.checkedInAt) {
          return new Date(b.checkedInAt).getTime() - new Date(a.checkedInAt).getTime();
        }
        if (a.checkedInAt) return -1;
        if (b.checkedInAt) return 1;
        return a.lastName.localeCompare(b.lastName);
      }
    });
  }, [kioskStaff, mode, search]);

  // ── Camera: stop ─────────────────────────────────────────────────────────
  const stopCamera = useCallback(() => {
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null; }
    if (videoRef.current) videoRef.current.srcObject = null;
    trackRef.current = null;
    setTorchOn(false);
  }, []);

  // ── Camera: QR match + mode validation ───────────────────────────────────
  const handleQrScan = useCallback((code: string) => {
    const staff = kioskStaffRef.current;
    const currentMode = modeRef.current;
    const matched = staff.find(s => s.qrCode === code || s.barcodeNumber === code);

    if (!matched) {
      setScanMsg({ ok: false, text: "Card not recognised — please tap your name or see reception." });
      setCamState("error");
      isProcessingRef.current = false;
      lastScannedRef.current = null;
      return;
    }
    if (currentMode === "checkin" && matched.isCheckedIn) {
      setScanMsg({ ok: false, text: `${matched.firstName} is already checked in — switch to Check Out to leave.` });
      setCamState("error");
      isProcessingRef.current = false;
      lastScannedRef.current = null;
      return;
    }
    if (currentMode === "checkout" && !matched.isCheckedIn) {
      setScanMsg({ ok: false, text: `${matched.firstName} is not currently checked in.` });
      setCamState("error");
      isProcessingRef.current = false;
      lastScannedRef.current = null;
      return;
    }
    setScanMsg({ ok: true, text: "Card recognised — processing…" });
    toggleMutationRef.current?.(matched.id);
  }, []);

  const processDetectedCode = useCallback((code: string) => {
    if (isProcessingRef.current) return;
    if (lastScannedRef.current === code) return;
    isProcessingRef.current = true;
    lastScannedRef.current = code;
    playBeep();
    setReticleFlash(true);
    setTimeout(() => setReticleFlash(false), 400);
    setCamState("processing");
    stopCamera();
    handleQrScan(code);
  }, [stopCamera, handleQrScan]);

  const scanFrame = useCallback(() => {
    const video = videoRef.current, canvas = canvasRef.current;
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
    if (!ctx) { rafRef.current = requestAnimationFrame(scanFrame); return; }
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0);
    const qr = jsQR(ctx.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height, { inversionAttempts: "attemptBoth" });
    if (qr?.data) processDetectedCode(qr.data);
    else rafRef.current = requestAnimationFrame(scanFrame);
  }, [processDetectedCode]);

  const startCamera = useCallback(() => {
    setCamState("starting");
    setCamError(null);
    setScanMsg(null);
    lastScannedRef.current = null;
    isProcessingRef.current = false;
    stopCamera();
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } } })
      .then(stream => {
        const video = videoRef.current;
        if (!video) { stream.getTracks().forEach(t => t.stop()); return; }
        streamRef.current = stream;
        const track = stream.getVideoTracks()[0];
        trackRef.current = track;
        if ((track.getCapabilities() as any)?.torch) setTorchSupported(true);
        video.muted = true;
        video.setAttribute("playsinline", "");
        video.setAttribute("autoplay", "");
        video.srcObject = stream;
        video.play().catch(() => {});
        setCamState("scanning");
        rafRef.current = requestAnimationFrame(scanFrame);
      })
      .catch((err: any) => {
        const msg =
          err?.name === "NotAllowedError" ? "Camera access denied — tap Back and use name search instead." :
          err?.name === "NotFoundError"   ? "No camera found on this device." :
          "Camera unavailable — tap Back and use name search instead.";
        setCamError(msg);
        setCamState("error");
      });
  }, [scanFrame, stopCamera]);

  const toggleTorch = useCallback(async () => {
    if (!trackRef.current) return;
    const next = !torchOn;
    try { await trackRef.current.applyConstraints({ advanced: [{ torch: next } as any] }); setTorchOn(next); } catch {}
  }, [torchOn]);

  useEffect(() => {
    if (screen === "scan") {
      isProcessingRef.current = false;
      lastScannedRef.current = null;
      setScanMsg(null);
      startCamera();
    } else {
      stopCamera();
      setCamState("off");
    }
    return () => stopCamera();
  }, [screen]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Counts for footer ─────────────────────────────────────────────────────
  const checkinCount = kioskStaff.filter(s => !s.isCheckedIn).length;
  const checkoutCount = kioskStaff.filter(s => s.isCheckedIn).length;

  // ── Render: Confirmation (full-screen) ────────────────────────────────────
  if (screen === "confirmation" && confirm) {
    const isIn = confirm.action === "checkin";
    return (
      <div className={`fixed inset-0 flex flex-col items-center justify-center z-50 ${isIn ? "bg-green-600" : "bg-[hsl(var(--primary))]"}`}
        style={isIn ? {} : { backgroundColor: "hsl(var(--primary))" }}>
        <div className="text-white text-center px-8 max-w-md">
          {isIn
            ? <CheckCircle2 className="w-24 h-24 sm:w-32 sm:h-32 mx-auto mb-6 opacity-90" strokeWidth={1.5} />
            : <LogOut className="w-24 h-24 sm:w-32 sm:h-32 mx-auto mb-6 opacity-90" strokeWidth={1.5} />
          }
          <p className="text-3xl sm:text-4xl font-bold mb-2">{isIn ? "Welcome," : "Goodbye,"}</p>
          <p className="text-4xl sm:text-5xl font-extrabold mb-8 leading-tight">{confirm.firstName}</p>
          <p className="text-xl sm:text-2xl font-medium opacity-85">
            {isIn ? "Checked in" : "Checked out"} at {confirm.time}
          </p>
        </div>
      </div>
    );
  }

  // ── Render: Scanner ───────────────────────────────────────────────────────
  if (screen === "scan") {
    return (
      <div className="fixed inset-0 bg-black flex flex-col">
        <div className="bg-black/80 px-4 py-3 flex items-center justify-between flex-shrink-0 safe-top">
          <button
            className="text-white font-semibold text-sm px-4 py-2 rounded-xl bg-white/10 active:bg-white/20"
            onClick={() => { stopCamera(); setScreen("list"); }}
          >
            ← Back
          </button>
          <p className="text-white/90 font-semibold text-sm">
            Scan QR or Access Card — {mode === "checkin" ? "Check In" : "Check Out"}
          </p>
          {torchSupported ? (
            <button
              className={`text-sm px-4 py-2 rounded-xl transition-colors ${torchOn ? "bg-yellow-400 text-black" : "bg-white/10 text-white/80"}`}
              onClick={toggleTorch}
            >
              Torch
            </button>
          ) : <div className="w-16" />}
        </div>

        <div className="relative flex-1 overflow-hidden bg-black">
          <video ref={videoRef} className="w-full h-full object-cover" playsInline muted />
          <canvas ref={canvasRef} className="hidden" />

          {(camState === "scanning" || camState === "starting") && (
            <div className="absolute inset-0 flex items-center justify-center">
              <ScannerReticle flash={reticleFlash} />
            </div>
          )}

          {(camState === "processing" || camState === "starting") && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/50">
              <div className="w-16 h-16 rounded-full border-4 border-white border-t-transparent animate-spin" />
            </div>
          )}

          {camError && camState === "error" && !scanMsg && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/70 p-8 gap-4">
              <p className="text-white text-center text-lg font-medium">{camError}</p>
              <button className="text-white/70 underline text-sm" onClick={() => { stopCamera(); setScreen("list"); }}>
                Back to list
              </button>
            </div>
          )}

          {scanMsg && (
            <div className={`absolute bottom-8 left-4 right-4 rounded-2xl p-5 text-center text-white font-semibold text-lg shadow-xl ${scanMsg.ok ? "bg-green-600" : "bg-red-600/90"}`}>
              {scanMsg.text}
              {!scanMsg.ok && (
                <button
                  className="block mx-auto mt-3 text-sm font-medium underline opacity-80"
                  onClick={() => { setScanMsg(null); isProcessingRef.current = false; lastScannedRef.current = null; startCamera(); }}
                >
                  Try again
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Render: Main list ─────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col select-none" style={{ height: "100dvh" }}>

      {/* Header */}
      <header className="bg-[hsl(var(--primary))] text-white px-4 py-3 sm:px-6 sm:py-4 flex-shrink-0 shadow-md"
        style={{ backgroundColor: "hsl(var(--primary))" }}>
        <div className="flex items-center justify-between gap-4">

          {/* Left: Company branding + page title */}
          <div className="flex items-center gap-3 min-w-0">
            {(settings?.logoUrl || settings?.bannerUrl) && (
              <img
                src={objectUrl(`/objects${settings.logoUrl || settings.bannerUrl}`)}
                alt=""
                className="h-10 w-auto object-contain bg-white rounded-lg px-2 py-0.5 flex-shrink-0"
                onError={(e) => { e.currentTarget.style.display = "none"; }}
              />
            )}
            <div className="min-w-0">
              {(settings as any)?.companyName && (
                <p className="text-xs font-medium opacity-70 truncate max-w-[150px] sm:max-w-xs leading-tight">
                  {(settings as any).companyName}
                </p>
              )}
              <p className="text-sm sm:text-base font-bold leading-tight">
                Staff Check In / Out
              </p>
            </div>
          </div>

          {/* Right: mode toggle + exit link */}
          <div className="flex flex-col items-end gap-2 flex-shrink-0">
            <TooltipProvider delayDuration={400}>
              <div className="flex gap-2">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-bold transition-all border-2 shadow-sm ${
                        mode === "checkin"
                          ? "bg-white border-white text-slate-900"
                          : "bg-white/10 border-white text-white hover:bg-white/25"
                      }`}
                      onClick={() => { setMode("checkin"); setSearch(""); }}
                    >
                      <LogIn size={16} className="flex-shrink-0" />
                      <span>Check In</span>
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">
                    <p>Switch to Check In mode — show staff who haven't arrived yet</p>
                  </TooltipContent>
                </Tooltip>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-bold transition-all border-2 shadow-sm ${
                        mode === "checkout"
                          ? "bg-white border-white text-slate-900"
                          : "bg-white/10 border-white text-white hover:bg-white/25"
                      }`}
                      onClick={() => { setMode("checkout"); setSearch(""); }}
                    >
                      <LogOut size={16} className="flex-shrink-0" />
                      <span>Check Out</span>
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">
                    <p>Switch to Check Out mode — show staff who are currently on site</p>
                  </TooltipContent>
                </Tooltip>
              </div>
            </TooltipProvider>

            {/* Exit link */}
            <button
              className="text-xs text-white/80 hover:text-white transition-colors underline underline-offset-2"
              onClick={() => setLocation("/")}
            >
              ← Exit to Main System
            </button>
          </div>
        </div>
      </header>

      {/* Search + Scan row */}
      <div className="px-4 py-3 sm:px-6 bg-white border-b border-slate-200 flex gap-3 items-center flex-shrink-0">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by name or department…"
            className="w-full h-12 pl-10 pr-10 rounded-xl border border-slate-200 bg-slate-50 text-base focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-shadow"
          />
          {search && (
            <button
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 text-xl leading-none"
              onClick={() => setSearch("")}
            >
              ×
            </button>
          )}
        </div>
        <button
          className="h-12 px-4 sm:px-5 text-white rounded-xl font-semibold text-sm flex items-center gap-2 flex-shrink-0 active:opacity-80 transition-opacity shadow-sm"
          style={{ backgroundColor: "hsl(var(--primary))" }}
          onClick={() => setScreen("scan")}
        >
          <QrCode size={18} />
          <span className="hidden sm:inline">Scan QR / Card</span>
        </button>
      </div>

      {/* Network error banner (persists until next successful toggle) */}
      {toggleMutation.isError && (
        <div className="mx-4 mt-3 rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-red-700 text-sm font-medium flex-shrink-0">
          Couldn't reach the system — please try again or see reception.
        </div>
      )}

      {/* Staff grid */}
      <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-6 sm:py-5">
        {displayStaff.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full min-h-48 text-center text-slate-500 py-12">
            {mode === "checkin" ? (
              <>
                <CheckCircle2 className="w-16 h-16 text-green-400 mb-3 opacity-60" />
                <p className="text-lg font-semibold text-slate-700">
                  {search ? "No match found" : "Everyone's checked in 👍"}
                </p>
                <p className="text-sm mt-1 text-slate-400">
                  {search ? "Try a different name or department." : "No staff are waiting to check in."}
                </p>
              </>
            ) : (
              <>
                <LogOut className="w-16 h-16 text-slate-300 mb-3" />
                <p className="text-lg font-semibold text-slate-700">
                  {search ? "No match found" : "No one is currently checked in"}
                </p>
                <p className="text-sm mt-1 text-slate-400">
                  {search ? "Try a different name or department." : "Switch to Check In to sign someone in."}
                </p>
              </>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-4">
            {displayStaff.map(person => {
              const isPending = toggleMutation.isPending && (toggleMutation.variables as string) === person.id;
              return (
                <button
                  key={person.id}
                  disabled={toggleMutation.isPending}
                  onClick={() => toggleMutation.mutate(person.id)}
                  className="relative rounded-2xl bg-white border border-slate-200 p-4 sm:p-5 flex flex-col items-center gap-3 text-center transition-all active:scale-95 hover:shadow-md hover:border-slate-300 disabled:opacity-60 disabled:cursor-not-allowed min-h-[148px] justify-center shadow-sm"
                >
                  <StaffAvatar staff={person} size={64} />
                  <div className="min-w-0 w-full">
                    <p className="font-bold text-slate-900 leading-snug text-sm sm:text-base">
                      {person.firstName}{" "}
                      <span className="block sm:inline">{person.lastName}</span>
                    </p>
                    {(person.department || person.jobTitle) && (
                      <p className="text-xs text-slate-400 mt-0.5 truncate">
                        {person.department ?? person.jobTitle}
                      </p>
                    )}
                    {mode === "checkout" && person.checkedInAt && (
                      <p className="text-xs font-medium mt-1" style={{ color: "hsl(var(--primary))" }}>
                        Since {ukTime(new Date(person.checkedInAt))}
                      </p>
                    )}
                  </div>

                  {isPending && (
                    <div className="absolute inset-0 flex items-center justify-center rounded-2xl bg-white/80">
                      <div className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: "hsl(var(--primary))", borderTopColor: "transparent" }} />
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer: live counts */}
      <div className="bg-white border-t border-slate-100 px-4 py-2 text-xs text-slate-400 text-center flex-shrink-0">
        {checkinCount} awaiting check-in · {checkoutCount} on site
      </div>
    </div>
  );
}
