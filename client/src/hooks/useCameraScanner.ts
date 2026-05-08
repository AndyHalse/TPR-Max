import { useRef, useState, useCallback, useEffect } from 'react';
import { BrowserMultiFormatReader, NotFoundException } from '@zxing/library';

export type CameraState = 'off' | 'starting' | 'scanning' | 'processing' | 'error';

interface UseCameraScannerOptions {
  onCode: (code: string) => void;
  throttleMs?: number;
  enabled?: boolean;
}

export interface UseCameraScannerResult {
  videoRef: React.RefObject<HTMLVideoElement>;
  canvasRef: React.RefObject<HTMLCanvasElement>;
  cameraState: CameraState;
  cameraError: string | null;
  torchOn: boolean;
  torchSupported: boolean;
  reticleFlash: boolean;
  startCamera: () => void;
  stopCamera: () => void;
  toggleTorch: () => Promise<void>;
  setCameraState: React.Dispatch<React.SetStateAction<CameraState>>;
  resetProcessing: () => void;
}

const codeReader = new BrowserMultiFormatReader();

export function playBeep() {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 1800;
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.15);
  } catch { /* audio unavailable */ }
}

export function useCameraScanner({
  onCode,
  throttleMs = 250,
}: UseCameraScannerOptions): UseCameraScannerResult {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastCodeRef = useRef<string | null>(null);
  const lastScanTimeRef = useRef<number>(0);
  const isProcessingRef = useRef<boolean>(false);
  const trackRef = useRef<MediaStreamTrack | null>(null);
  const onCodeRef = useRef(onCode);
  useEffect(() => { onCodeRef.current = onCode; }, [onCode]);

  const [cameraState, setCameraState] = useState<CameraState>('off');
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [torchOn, setTorchOn] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);
  const [reticleFlash, setReticleFlash] = useState(false);

  const stopCamera = useCallback(() => {
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null; }
    if (videoRef.current) videoRef.current.srcObject = null;
    trackRef.current = null;
    setTorchOn(false);
  }, []);

  const resetProcessing = useCallback(() => {
    isProcessingRef.current = false;
    lastCodeRef.current = null;
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

  const scanFrame = useCallback((timestamp: number) => {
    rafRef.current = requestAnimationFrame(scanFrame);
    if (isProcessingRef.current) return;
    if (timestamp - lastScanTimeRef.current < throttleMs) return;
    lastScanTimeRef.current = timestamp;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || !video.videoWidth || !video.videoHeight) return;

    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    try {
      const result = codeReader.decodeFromCanvas(canvas);
      const text = result.getText();
      if (!text || text === lastCodeRef.current) return;
      lastCodeRef.current = text;
      isProcessingRef.current = true;
      playBeep();
      setReticleFlash(true);
      setTimeout(() => setReticleFlash(false), 400);
      onCodeRef.current(text);
    } catch (e) {
      if (!(e instanceof NotFoundException)) {
        // unexpected error — ignore and keep scanning
      }
    }
  }, [throttleMs]);

  const startCamera = useCallback(() => {
    setCameraState('starting');
    setCameraError(null);
    lastCodeRef.current = null;
    isProcessingRef.current = false;
    stopCamera();

    navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: 'environment' },
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
    }).then(stream => {
      const video = videoRef.current;
      if (!video) { stream.getTracks().forEach(t => t.stop()); return; }
      streamRef.current = stream;
      const track = stream.getVideoTracks()[0];
      trackRef.current = track;
      const capabilities = track.getCapabilities() as any;
      if (capabilities?.torch) setTorchSupported(true);
      video.muted = true;
      video.setAttribute('playsinline', '');
      video.setAttribute('autoplay', '');
      video.srcObject = stream;
      video.play().catch(() => {});
      setCameraState('scanning');
      rafRef.current = requestAnimationFrame(scanFrame);
    }).catch((err: any) => {
      const msg =
        err?.name === 'NotAllowedError' ? 'Camera access denied. Enter the code manually below.' :
        err?.name === 'NotFoundError'   ? 'No camera found. Enter the code manually below.' :
        'Camera unavailable. Enter the code manually below.';
      setCameraError(msg);
      setCameraState('error');
    });
  }, [scanFrame, stopCamera]);

  return {
    videoRef, canvasRef,
    cameraState, cameraError,
    torchOn, torchSupported, reticleFlash,
    startCamera, stopCamera, toggleTorch,
    setCameraState, resetProcessing,
  };
}
