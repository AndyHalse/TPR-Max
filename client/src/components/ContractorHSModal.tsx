import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { AlertTriangle, Shield, Check, ChevronDown, User, Building2 } from "lucide-react";
import type { ContractorWorker } from "@shared/schema";

interface ContractorHSModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAccept: (worker: ContractorWorker) => void;
  worker: ContractorWorker;
  companyName: string;
}

const HS_RULES = [
  "All contractors must wear appropriate PPE at all times (hard hat, safety boots, hi-vis vest).",
  "Report to the site office immediately upon arrival and departure.",
  "Follow all site signage and use designated walkways only.",
  "No smoking except in designated areas.",
  "Report all accidents, incidents, and near misses immediately to the site manager.",
  "Do not operate any equipment unless you are authorised and trained to do so.",
  "Maintain a clean and tidy work area at all times.",
  "The emergency assembly point is located at the main car park.",
  "First aid facilities are available at the site office.",
  "All work must comply with current CDM Regulations.",
  "Hot work permits are required for any welding or cutting operations.",
  "Working at height requires appropriate training, risk assessment, and equipment.",
];

export default function ContractorHSModal({
  isOpen,
  onClose,
  onAccept,
  worker,
  companyName,
}: ContractorHSModalProps) {
  const [accepted, setAccepted] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [hasScrolledToBottom, setHasScrolledToBottom] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const touchStartY = useRef(0);

  useEffect(() => {
    if (isOpen) {
      setAccepted(false);
      setHasScrolledToBottom(false);
      setTimeout(() => {
        const el = contentRef.current;
        if (el && el.scrollHeight <= el.clientHeight + 50) {
          setHasScrolledToBottom(true);
        }
      }, 200);
    }
  }, [isOpen]);

  const checkScrollBottom = useCallback(() => {
    const el = contentRef.current;
    if (!el) return;
    if (el.scrollHeight - el.scrollTop <= el.clientHeight + 50) {
      setHasScrolledToBottom(true);
    }
  }, []);

  // Manual touch handling so iOS Safari definitely registers scrolls in this div
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartY.current = e.touches[0].clientY;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    const el = contentRef.current;
    if (!el) return;
    const touchY = e.touches[0].clientY;
    const deltaY = touchStartY.current - touchY;
    el.scrollTop += deltaY;
    touchStartY.current = touchY;
    checkScrollBottom();
    e.stopPropagation();
  };

  const handleAccept = async () => {
    if (!accepted || !hasScrolledToBottom) return;
    setIsProcessing(true);
    await onAccept(worker);
    setIsProcessing(false);
    setAccepted(false);
    onClose();
  };

  const handleClose = () => {
    setAccepted(false);
    onClose();
  };

  const canAccept = hasScrolledToBottom && accepted;

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4"
      onTouchMove={(e) => e.preventDefault()}
      style={{ touchAction: "none" }}
    >
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={handleClose} />

      <div
        className="relative z-10 w-full sm:max-w-2xl bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col h-[100dvh] sm:h-auto sm:max-h-[92dvh]"
        style={{ touchAction: "pan-y" }}
        onTouchMove={(e) => e.stopPropagation()}
      >

        {/* Header */}
        <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-gray-200 bg-gradient-to-r from-orange-50 to-red-50 rounded-t-2xl flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 sm:w-14 sm:h-14 bg-orange-500 rounded-full flex items-center justify-center flex-shrink-0">
              <Shield className="text-white w-5 h-5 sm:w-7 sm:h-7" />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="text-base sm:text-2xl font-bold text-gray-900 leading-tight">Health &amp; Safety Rules</h2>
              <p className="text-xs sm:text-sm text-gray-600">Please read all rules before checking in</p>
            </div>
          </div>
          <div className="mt-1.5 inline-flex items-center gap-1.5 bg-orange-100 px-2.5 py-1 rounded-lg">
            <AlertTriangle className="w-3.5 h-3.5 text-orange-600 flex-shrink-0" />
            <span className="text-xs sm:text-sm font-semibold text-orange-700">Acceptance Required</span>
          </div>
        </div>

        {/* Contractor identity banner */}
        <div className="px-4 sm:px-6 py-2.5 bg-blue-600 flex-shrink-0 flex items-center gap-3">
          <div className="w-7 h-7 bg-white/20 rounded-full flex items-center justify-center flex-shrink-0">
            <User className="w-3.5 h-3.5 text-white" />
          </div>
          <div className="min-w-0">
            <p className="text-sm sm:text-base text-white font-bold leading-tight">
              {worker.firstName} {worker.lastName}
            </p>
            <p className="text-xs text-blue-200 flex items-center gap-1 mt-0.5 truncate">
              <Building2 className="w-3 h-3 flex-shrink-0" />
              <span className="truncate">{companyName}</span>
            </p>
          </div>
        </div>

        {/* Scrollable rules */}
        <div
          ref={contentRef}
          onScroll={checkScrollBottom}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          className="flex-1 min-h-0 px-4 sm:px-6 py-3 sm:py-4"
          style={{
            overflowY: "scroll",
            overscrollBehavior: "contain",
            touchAction: "pan-y",
            WebkitOverflowScrolling: "touch",
          } as React.CSSProperties}
        >
          <h3 className="font-semibold text-gray-800 flex items-center gap-2 mb-3 text-sm sm:text-base">
            <AlertTriangle className="w-4 h-4 sm:w-5 sm:h-5 text-orange-500 flex-shrink-0" />
            Site Health &amp; Safety Rules
          </h3>

          <ol className="space-y-2.5">
            {HS_RULES.map((rule, i) => (
              <li key={i} className="flex gap-2.5 text-sm sm:text-base text-gray-800 leading-snug">
                <span className="flex-shrink-0 w-5 h-5 sm:w-6 sm:h-6 bg-orange-100 text-orange-700 rounded-full flex items-center justify-center text-xs font-bold mt-0.5">
                  {i + 1}
                </span>
                <span>{rule}</span>
              </li>
            ))}
          </ol>

          <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
            <p className="text-xs sm:text-sm font-medium text-yellow-900 leading-snug">
              ⚠️ Failure to comply with these rules may result in immediate removal from site and suspension of site access privileges.
            </p>
          </div>

          {!hasScrolledToBottom && (
            <div className="sticky bottom-0 h-10 bg-gradient-to-t from-white to-transparent pointer-events-none" />
          )}
        </div>

        {/* Scroll prompt */}
        {!hasScrolledToBottom && (
          <div className="px-4 sm:px-6 py-2.5 bg-amber-50 border-t border-amber-200 flex-shrink-0 flex items-center justify-center gap-2">
            <ChevronDown className="w-4 h-4 text-amber-600 animate-bounce flex-shrink-0" />
            <p className="text-xs sm:text-sm text-amber-700 font-semibold text-center">
              Scroll down to read all rules before you can accept
            </p>
            <ChevronDown className="w-4 h-4 text-amber-600 animate-bounce flex-shrink-0" />
          </div>
        )}

        {/* Acceptance area */}
        <div
          className="px-4 sm:px-6 py-3 sm:py-5 border-t border-gray-200 bg-gray-50 rounded-b-2xl flex-shrink-0 space-y-2.5 sm:space-y-4"
          style={{ paddingBottom: "max(12px, env(safe-area-inset-bottom, 12px))" }}
        >
          <div
            className={`flex items-start gap-3 p-3 sm:p-5 rounded-xl border-2 cursor-pointer transition-all ${
              accepted
                ? "border-green-500 bg-green-50"
                : hasScrolledToBottom
                ? "border-gray-300 bg-white hover:border-green-400"
                : "border-gray-200 bg-gray-100 opacity-50 cursor-not-allowed"
            }`}
            onClick={() => { if (hasScrolledToBottom) setAccepted(!accepted); }}
          >
            <Checkbox
              checked={accepted}
              disabled={!hasScrolledToBottom}
              onCheckedChange={(checked) => { if (hasScrolledToBottom) setAccepted(!!checked); }}
              className="mt-0.5 flex-shrink-0 w-5 h-5"
              id="contractor-hs-checkbox"
            />
            <Label
              htmlFor="contractor-hs-checkbox"
              className={`text-sm sm:text-base font-medium leading-relaxed cursor-pointer ${
                hasScrolledToBottom ? "text-gray-800" : "text-gray-400"
              }`}
            >
              I confirm that I have read, understood, and agree to comply with all site Health &amp; Safety rules during my time on site.
            </Label>
          </div>

          <div className="flex gap-2 sm:gap-3">
            <Button
              variant="outline"
              onClick={handleClose}
              disabled={isProcessing}
              className="flex-1 h-12 sm:h-14 text-sm sm:text-lg border-2 border-gray-300 text-gray-700 hover:bg-gray-50 font-semibold"
            >
              Cancel
            </Button>
            <Button
              onClick={handleAccept}
              disabled={!canAccept || isProcessing}
              className={`flex-1 h-12 sm:h-14 text-sm sm:text-lg font-bold transition-all ${
                canAccept && !isProcessing
                  ? "bg-green-600 hover:bg-green-700 text-white shadow-lg"
                  : "bg-gray-300 text-gray-500 cursor-not-allowed"
              }`}
            >
              {isProcessing ? (
                <span className="flex items-center gap-2">
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Processing...
                </span>
              ) : (
                <>
                  <Check className="mr-1.5 sm:mr-2 w-4 h-4 sm:w-6 sm:h-6" />
                  Accept &amp; Check In
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
