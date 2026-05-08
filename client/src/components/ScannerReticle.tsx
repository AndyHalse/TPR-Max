import { Flashlight } from 'lucide-react';

interface ScannerReticleProps {
  isScanning: boolean;
  isFlashing?: boolean;
  torchOn?: boolean;
  torchSupported?: boolean;
  onToggleTorch?: () => void;
  label?: string;
  color?: string;
}

export default function ScannerReticle({
  isScanning,
  isFlashing = false,
  torchOn = false,
  torchSupported = false,
  onToggleTorch,
  label = 'Point camera at QR code — scans automatically',
  color = '#60a5fa',
}: ScannerReticleProps) {
  const cornerColor = isFlashing ? '#22c55e' : 'white';
  const borderClass = isFlashing ? 'border-green-400' : 'border-white';

  return (
    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
      <div className="relative w-52 h-52 sm:w-64 sm:h-64">
        <div className={`absolute top-0 left-0 w-10 h-10 border-t-4 border-l-4 ${borderClass} rounded-tl-lg transition-colors duration-200`} />
        <div className={`absolute top-0 right-0 w-10 h-10 border-t-4 border-r-4 ${borderClass} rounded-tr-lg transition-colors duration-200`} />
        <div className={`absolute bottom-0 left-0 w-10 h-10 border-b-4 border-l-4 ${borderClass} rounded-bl-lg transition-colors duration-200`} />
        <div className={`absolute bottom-0 right-0 w-10 h-10 border-b-4 border-r-4 ${borderClass} rounded-br-lg transition-colors duration-200`} />

        {isScanning && !isFlashing && (
          <div className="absolute inset-x-0" style={{ animation: 'scanline-sweep 2s linear infinite', top: 0 }}>
            <div className="w-full h-0.5" style={{ background: `linear-gradient(90deg, transparent, ${color}, transparent)`, boxShadow: `0 0 6px ${color}` }} />
          </div>
        )}

        {isFlashing && (
          <div className="absolute inset-0 rounded-sm border-2 border-green-400 bg-green-400/10" />
        )}
      </div>

      {torchSupported && onToggleTorch && (
        <button
          className="absolute top-3 right-3 pointer-events-auto w-9 h-9 rounded-full flex items-center justify-center bg-black/50 hover:bg-black/70 transition-colors"
          onClick={onToggleTorch}
          title={torchOn ? 'Turn off torch' : 'Turn on torch'}
        >
          <Flashlight className={`w-5 h-5 ${torchOn ? 'text-yellow-300' : 'text-white'}`} />
        </button>
      )}

      {label && (
        <div className="absolute bottom-4 left-0 right-0 flex justify-center">
          <span className="text-white text-sm bg-black/50 px-3 py-1.5 rounded-full font-medium">{label}</span>
        </div>
      )}
    </div>
  );
}
