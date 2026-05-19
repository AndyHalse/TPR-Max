import { createPortal } from "react-dom";
import { MapPin, ArrowRight } from "lucide-react";

interface VisitInstructionsModalProps {
  isOpen: boolean;
  reasonLabel: string;
  instructions: string;
  onContinue: () => void;
}

export default function VisitInstructionsModal({
  isOpen,
  reasonLabel,
  instructions,
  onContinue,
}: VisitInstructionsModalProps) {
  if (!isOpen) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      style={{ fontFamily: "'Segoe UI', Arial, sans-serif" }}
    >
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="bg-blue-600 px-6 py-5 flex-shrink-0">
          <div className="flex items-center gap-3 mb-1">
            <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center">
              <MapPin className="text-white" size={22} />
            </div>
            <div>
              <p className="text-blue-100 text-sm font-medium uppercase tracking-wide">Where to go</p>
              <h2 className="text-white text-xl font-bold leading-tight">{reasonLabel}</h2>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-6">
          <p
            className="text-slate-700 leading-relaxed whitespace-pre-wrap"
            style={{ fontSize: "1.125rem", lineHeight: "1.75rem" }}
          >
            {instructions}
          </p>
        </div>

        {/* Footer */}
        <div className="px-6 py-5 border-t border-slate-100 flex-shrink-0">
          <button
            onClick={onContinue}
            className="w-full flex items-center justify-center gap-2 bg-green-500 hover:bg-green-600 active:bg-green-700 text-white font-bold rounded-xl transition-colors"
            style={{ padding: "1rem 1.5rem", fontSize: "1.125rem" }}
          >
            Got it — Continue
            <ArrowRight size={20} />
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
