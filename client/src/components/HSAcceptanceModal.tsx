import { useState, useRef, useEffect } from "react";
import { Shield, Check, AlertTriangle, ChevronDown, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

interface HSAcceptanceModalProps {
  isOpen: boolean;
  companyName?: string;
  workerName?: string;
  hsRulesContent: string;
  onAccept?: () => void;
  onDecline?: () => void;
}

export default function HSAcceptanceModal({
  isOpen,
  companyName,
  workerName,
  hsRulesContent,
  onAccept,
  onDecline,
}: HSAcceptanceModalProps) {
  const [hasScrolledToBottom, setHasScrolledToBottom] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      setHasScrolledToBottom(false);
      setAccepted(false);
    }
  }, [isOpen]);

  const handleScroll = () => {
    const el = contentRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop <= el.clientHeight + 40;
    if (nearBottom) setHasScrolledToBottom(true);
  };

  useEffect(() => {
    if (!isOpen) return;
    const el = contentRef.current;
    if (!el) return;
    if (el.scrollHeight <= el.clientHeight + 40) {
      setHasScrolledToBottom(true);
    }
  }, [isOpen, hsRulesContent]);

  if (!isOpen) return null;

  const canAccept = hasScrolledToBottom && accepted;

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center sm:p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />

      <div className="relative z-10 w-full sm:max-w-2xl bg-white sm:rounded-2xl shadow-2xl flex flex-col max-h-[95vh] sm:max-h-[92vh] rounded-t-2xl">
        {/* Header — stacks on mobile, side-by-side on desktop */}
        <div className="px-4 sm:px-6 py-4 border-b border-gray-200 bg-gradient-to-r from-orange-50 to-red-50 rounded-t-2xl flex-shrink-0">
          {/* Top row: icon + title */}
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 sm:w-14 sm:h-14 bg-orange-500 rounded-full flex items-center justify-center flex-shrink-0">
              <Shield className="text-white w-5 h-5 sm:w-7 sm:h-7" />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="text-lg sm:text-2xl font-bold text-gray-900 leading-tight">Health &amp; Safety Rules</h2>
              {companyName && (
                <p className="text-xs sm:text-sm text-gray-600 truncate">{companyName}</p>
              )}
            </div>
          </div>
          {/* Badge — sits below on mobile, avoid squeezing the title */}
          <div className="mt-2 inline-flex items-center gap-1.5 bg-orange-100 px-2.5 py-1.5 rounded-lg">
            <AlertTriangle className="w-4 h-4 text-orange-600 flex-shrink-0" />
            <span className="text-xs sm:text-sm font-semibold text-orange-700">Acceptance Required</span>
          </div>
        </div>

        {/* Worker name banner (kiosk-specific) */}
        {workerName && (
          <div className="px-4 sm:px-6 py-3 bg-blue-600 flex-shrink-0 flex items-center gap-3">
            <div className="w-8 h-8 bg-white/20 rounded-full flex items-center justify-center flex-shrink-0">
              <User className="w-4 h-4 text-white" />
            </div>
            <p className="text-sm sm:text-base text-white font-semibold leading-snug">
              <span className="font-bold">{workerName}</span> — please read all rules below before you can check in
            </p>
          </div>
        )}

        {/* Instructions banner */}
        {!workerName && (
          <div className="px-4 sm:px-6 py-3 bg-blue-50 border-b border-blue-100 flex-shrink-0">
            <p className="text-sm text-blue-800 font-medium leading-snug">
              Please read the Health &amp; Safety rules carefully. Scroll to the bottom, then tick the box to complete your check-in.
            </p>
          </div>
        )}

        {/* Scrollable content */}
        <div
          ref={contentRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto px-4 sm:px-6 py-4 min-h-0"
        >
          <pre className="whitespace-pre-wrap font-sans text-sm sm:text-base text-gray-800 leading-relaxed">
            {hsRulesContent}
          </pre>

          {!hasScrolledToBottom && (
            <div className="sticky bottom-0 left-0 right-0 h-14 bg-gradient-to-t from-white to-transparent pointer-events-none" />
          )}
        </div>

        {/* Scroll prompt */}
        {!hasScrolledToBottom && (
          <div className="px-4 sm:px-6 py-3 bg-amber-50 border-t border-amber-200 flex-shrink-0 flex items-center justify-center gap-2">
            <ChevronDown className="w-4 h-4 sm:w-5 sm:h-5 text-amber-600 animate-bounce flex-shrink-0" />
            <p className="text-xs sm:text-sm text-amber-700 font-semibold text-center">
              Scroll down to read all rules before you can accept
            </p>
            <ChevronDown className="w-4 h-4 sm:w-5 sm:h-5 text-amber-600 animate-bounce flex-shrink-0" />
          </div>
        )}

        {/* Acceptance area */}
        <div className="px-4 sm:px-6 py-4 sm:py-5 border-t border-gray-200 bg-gray-50 rounded-b-2xl sm:rounded-b-2xl flex-shrink-0 space-y-3 sm:space-y-4">
          <div
            className={`flex items-start gap-3 sm:gap-4 p-4 sm:p-5 rounded-xl border-2 cursor-pointer transition-all ${
              accepted
                ? "border-green-500 bg-green-50"
                : hasScrolledToBottom
                ? "border-gray-300 bg-white hover:border-green-400"
                : "border-gray-200 bg-gray-100 opacity-50 cursor-not-allowed"
            }`}
            onClick={() => {
              if (hasScrolledToBottom) setAccepted(!accepted);
            }}
          >
            <Checkbox
              checked={accepted}
              disabled={!hasScrolledToBottom}
              onCheckedChange={(checked) => {
                if (hasScrolledToBottom) setAccepted(!!checked);
              }}
              className="mt-0.5 flex-shrink-0 w-5 h-5"
              id="hs-accept-checkbox"
            />
            <Label
              htmlFor="hs-accept-checkbox"
              className={`text-sm sm:text-base font-medium leading-relaxed cursor-pointer ${
                hasScrolledToBottom ? "text-gray-800" : "text-gray-400"
              }`}
            >
              I confirm that I have read and understood the Health &amp; Safety rules above and agree to comply with them during my visit.
            </Label>
          </div>

          <div className="flex gap-2 sm:gap-3">
            <Button
              variant="outline"
              onClick={() => onDecline && onDecline()}
              className="flex-1 py-3 sm:py-4 text-base sm:text-lg border-2 border-gray-300 text-gray-700 hover:bg-gray-50 font-semibold"
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (canAccept && onAccept) onAccept();
              }}
              disabled={!canAccept}
              className={`flex-1 py-3 sm:py-4 text-base sm:text-lg font-bold transition-all ${
                canAccept
                  ? "bg-green-600 hover:bg-green-700 text-white shadow-lg"
                  : "bg-gray-300 text-gray-500 cursor-not-allowed"
              }`}
            >
              <Check className="mr-1.5 sm:mr-2 w-5 h-5 sm:w-6 sm:h-6" />
              Accept &amp; Continue
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
