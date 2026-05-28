import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { FileText, Check, AlertTriangle, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

interface NDAAcceptanceModalProps {
  isOpen: boolean;
  companyName?: string;
  ndaContent: string;
  onAccept?: () => void;
  onDecline?: () => void;
}

export default function NDAAcceptanceModal({
  isOpen,
  companyName,
  ndaContent,
  onAccept,
  onDecline,
}: NDAAcceptanceModalProps) {
  const [hasScrolledToBottom, setHasScrolledToBottom] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      setHasScrolledToBottom(false);
      setAccepted(false);
      setTimeout(() => {
        const el = contentRef.current;
        if (el && el.scrollHeight <= el.clientHeight + 50) {
          setHasScrolledToBottom(true);
        }
      }, 200);
    }
  }, [isOpen, ndaContent]);

  const checkScrollBottom = useCallback(() => {
    const el = contentRef.current;
    if (!el) return;
    if (el.scrollHeight - el.scrollTop <= el.clientHeight + 50) {
      setHasScrolledToBottom(true);
    }
  }, []);

  if (!isOpen) return null;

  const canAccept = hasScrolledToBottom && accepted;
  const lines = ndaContent.split("\n").map((l) => l.trimEnd());

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center sm:p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div className="relative z-10 w-full sm:max-w-2xl bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col h-[100dvh] sm:h-[90vh]">

        <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-gray-200 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-t-2xl flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 sm:w-14 sm:h-14 bg-blue-600 rounded-full flex items-center justify-center flex-shrink-0">
              <FileText className="text-white w-5 h-5 sm:w-7 sm:h-7" />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="text-base sm:text-2xl font-bold text-gray-900 leading-tight">
                Non-Disclosure Agreement
              </h2>
              {companyName && (
                <p className="text-xs sm:text-sm text-gray-600 truncate">{companyName}</p>
              )}
            </div>
          </div>
          <div className="mt-1.5 inline-flex items-center gap-1.5 bg-blue-100 px-2.5 py-1 rounded-lg">
            <AlertTriangle className="w-3.5 h-3.5 text-blue-600 flex-shrink-0" />
            <span className="text-xs sm:text-sm font-semibold text-blue-700">Signature Required</span>
          </div>
        </div>

        <div className="px-4 sm:px-6 py-2 bg-blue-50 border-b border-blue-100 flex-shrink-0">
          <p className="text-xs sm:text-sm text-blue-800 font-medium leading-snug">
            Please read the Non-Disclosure Agreement carefully. Scroll to the bottom, then tick the box to complete your check-in.
          </p>
        </div>

        <div
          ref={contentRef}
          onScroll={checkScrollBottom}
          className="flex-1 min-h-0 overflow-y-scroll overscroll-contain px-4 sm:px-6 py-3 sm:py-4"
        >
          <div className="space-y-1">
            {lines.map((line, i) => {
              if (line === "") return <div key={i} className="h-2" />;
              return (
                <p key={i} className="text-sm sm:text-base text-gray-800 leading-relaxed">
                  {line}
                </p>
              );
            })}
          </div>
          {!hasScrolledToBottom && (
            <div className="sticky bottom-0 h-10 bg-gradient-to-t from-white to-transparent pointer-events-none" />
          )}
        </div>

        {!hasScrolledToBottom && (
          <div className="px-4 sm:px-6 py-2.5 bg-amber-50 border-t border-amber-200 flex-shrink-0 flex items-center justify-center gap-2">
            <ChevronDown className="w-4 h-4 text-amber-600 animate-bounce flex-shrink-0" />
            <p className="text-xs sm:text-sm text-amber-700 font-semibold text-center">
              Scroll down to read the full agreement before you can accept
            </p>
            <ChevronDown className="w-4 h-4 text-amber-600 animate-bounce flex-shrink-0" />
          </div>
        )}

        <div
          className="px-4 sm:px-6 py-3 sm:py-5 border-t border-gray-200 bg-gray-50 flex-shrink-0 space-y-2.5 sm:space-y-4"
          style={{ paddingBottom: "max(12px, env(safe-area-inset-bottom, 12px))" }}
        >
          <div
            className={`flex items-start gap-3 p-3 sm:p-4 rounded-xl border-2 cursor-pointer transition-all ${
              accepted
                ? "border-blue-500 bg-blue-50"
                : hasScrolledToBottom
                ? "border-gray-300 bg-white hover:border-blue-400"
                : "border-gray-200 bg-gray-100 opacity-50 cursor-not-allowed"
            }`}
            onClick={() => { if (hasScrolledToBottom) setAccepted(!accepted); }}
          >
            <Checkbox
              checked={accepted}
              disabled={!hasScrolledToBottom}
              onCheckedChange={(checked) => { if (hasScrolledToBottom) setAccepted(!!checked); }}
              className="mt-0.5 flex-shrink-0 w-5 h-5"
              id="nda-accept-checkbox"
            />
            <Label
              htmlFor="nda-accept-checkbox"
              className={`text-sm sm:text-base font-medium leading-relaxed cursor-pointer ${
                hasScrolledToBottom ? "text-gray-800" : "text-gray-400"
              }`}
            >
              I confirm that I have read and understood the Non-Disclosure Agreement above and agree to its terms during my visit.
            </Label>
          </div>

          <div className="flex gap-2 sm:gap-3">
            <Button
              variant="outline"
              onClick={() => onDecline && onDecline()}
              className="flex-1 h-11 sm:h-14 text-sm sm:text-lg border-2 border-gray-300 text-gray-700 hover:bg-gray-50 font-semibold"
            >
              Cancel
            </Button>
            <Button
              onClick={() => { if (canAccept && onAccept) onAccept(); }}
              disabled={!canAccept}
              className={`flex-1 h-11 sm:h-14 text-sm sm:text-lg font-bold transition-all ${
                canAccept
                  ? "bg-blue-600 hover:bg-blue-700 text-white shadow-lg"
                  : "bg-gray-300 text-gray-500 cursor-not-allowed"
              }`}
            >
              <Check className="mr-1.5 sm:mr-2 w-4 h-4 sm:w-5 sm:h-5" />
              Accept &amp; Continue
            </Button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
