import { useState, useRef, useEffect } from "react";
import { Shield, Check, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

interface HSAcceptanceModalProps {
  isOpen: boolean;
  companyName?: string;
  hsRulesContent: string;
  onAccept?: () => void;
  onDecline?: () => void;
}

export default function HSAcceptanceModal({
  isOpen,
  companyName,
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />

      <div className="relative z-10 w-full max-w-2xl bg-white rounded-2xl shadow-2xl flex flex-col max-h-[90vh]">
        <div className="flex items-center gap-3 px-6 py-5 border-b border-gray-200 bg-gradient-to-r from-orange-50 to-red-50 rounded-t-2xl flex-shrink-0">
          <div className="w-12 h-12 bg-orange-500 rounded-full flex items-center justify-center flex-shrink-0">
            <Shield className="text-white w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-gray-900">Health & Safety Rules</h2>
            {companyName && (
              <p className="text-sm text-gray-600">{companyName}</p>
            )}
          </div>
          <div className="ml-auto flex items-center gap-2 bg-orange-100 px-3 py-1.5 rounded-lg">
            <AlertTriangle className="w-4 h-4 text-orange-600" />
            <span className="text-xs font-semibold text-orange-700">Acceptance Required</span>
          </div>
        </div>

        <div className="px-6 py-3 bg-blue-50 border-b border-blue-100 flex-shrink-0">
          <p className="text-sm text-blue-800 font-medium">
            Please read the following Health & Safety rules carefully before proceeding. You must scroll to the bottom and accept these rules to complete your check-in.
          </p>
        </div>

        <div
          ref={contentRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto px-6 py-4 min-h-0"
        >
          <pre className="whitespace-pre-wrap font-sans text-sm text-gray-800 leading-relaxed">
            {hsRulesContent}
          </pre>

          {!hasScrolledToBottom && (
            <div className="sticky bottom-0 left-0 right-0 h-12 bg-gradient-to-t from-white to-transparent pointer-events-none" />
          )}
        </div>

        {!hasScrolledToBottom && (
          <div className="px-6 py-2 bg-amber-50 border-t border-amber-200 flex-shrink-0">
            <p className="text-xs text-amber-700 font-medium text-center">
              Scroll down to read all rules before you can accept
            </p>
          </div>
        )}

        <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 rounded-b-2xl flex-shrink-0 space-y-4">
          <div
            className={`flex items-start gap-3 p-4 rounded-xl border-2 cursor-pointer transition-all ${
              accepted ? "border-green-500 bg-green-50" : hasScrolledToBottom ? "border-gray-300 bg-white hover:border-green-400" : "border-gray-200 bg-gray-100 opacity-50 cursor-not-allowed"
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
              className="mt-0.5 flex-shrink-0"
              id="hs-accept-checkbox"
            />
            <Label
              htmlFor="hs-accept-checkbox"
              className={`text-sm font-medium leading-relaxed cursor-pointer ${
                hasScrolledToBottom ? "text-gray-800" : "text-gray-400"
              }`}
            >
              I confirm that I have read and understood the Health & Safety rules above and agree to comply with them during my visit.
            </Label>
          </div>

          <div className="flex gap-3">
            <Button
              variant="outline"
              onClick={() => onDecline && onDecline()}
              className="flex-1 py-3 text-base border-2 border-gray-300 text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (canAccept && onAccept) onAccept();
              }}
              disabled={!canAccept}
              className={`flex-1 py-3 text-base font-bold transition-all ${
                canAccept
                  ? "bg-green-600 hover:bg-green-700 text-white shadow-lg"
                  : "bg-gray-300 text-gray-500 cursor-not-allowed"
              }`}
            >
              <Check className="mr-2 w-5 h-5" />
              Accept & Continue
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
