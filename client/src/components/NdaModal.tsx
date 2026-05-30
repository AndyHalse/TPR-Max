import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { PenLine, ChevronDown, User, Building2, Check } from "lucide-react";

interface NdaModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAccept: () => void;
  personName: string;
  personSubtitle?: string;
  ndaContent: string;
  requireSignature: boolean;
  isProcessing?: boolean;
}

function renderNdaMarkdown(text: string): React.ReactNode[] {
  return text.split('\n').map((line, i) => {
    if (line.startsWith('# ')) {
      return <h2 key={i} className="font-bold text-base mt-4 mb-1 text-gray-900">{line.slice(2)}</h2>;
    }
    if (line.startsWith('## ')) {
      return <h3 key={i} className="font-semibold text-sm mt-3 mb-0.5 text-gray-800">{line.slice(3)}</h3>;
    }
    if (line.trim() === '---') {
      return <hr key={i} className="my-3 border-gray-200" />;
    }
    if (line.trim() === '') {
      return <div key={i} className="h-1.5" />;
    }
    if (line.startsWith('- ')) {
      return (
        <li key={i} className="ml-4 text-sm text-gray-700 leading-relaxed list-disc">
          {renderInline(line.slice(2))}
        </li>
      );
    }
    const numberedMatch = line.match(/^(\d+)\. (.*)/);
    if (numberedMatch) {
      return (
        <li key={i} className="ml-4 text-sm text-gray-700 leading-relaxed list-decimal">
          {renderInline(numberedMatch[2])}
        </li>
      );
    }
    if (line.startsWith('*') && line.endsWith('*') && !line.startsWith('**')) {
      return <p key={i} className="text-xs text-gray-500 italic leading-relaxed">{line.slice(1, -1)}</p>;
    }
    return <p key={i} className="text-sm text-gray-700 leading-relaxed">{renderInline(line)}</p>;
  });
}

function renderInline(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/);
  return (
    <>
      {parts.map((part, i) =>
        part.startsWith('**') && part.endsWith('**')
          ? <strong key={i} className="font-semibold">{part.slice(2, -2)}</strong>
          : <span key={i}>{part}</span>
      )}
    </>
  );
}

export default function NdaModal({
  isOpen,
  onClose,
  onAccept,
  personName,
  personSubtitle,
  ndaContent,
  requireSignature,
  isProcessing = false,
}: NdaModalProps) {
  const [accepted, setAccepted] = useState(false);
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

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartY.current = e.touches[0].clientY;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    const el = contentRef.current;
    if (!el) return;
    el.scrollTop += touchStartY.current - e.touches[0].clientY;
    touchStartY.current = e.touches[0].clientY;
    checkScrollBottom();
    e.stopPropagation();
  };

  const canAccept = requireSignature ? (hasScrolledToBottom && accepted) : hasScrolledToBottom;

  const handleAccept = () => {
    if (!canAccept || isProcessing) return;
    onAccept();
    setAccepted(false);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />

      <div className="relative z-10 w-full sm:max-w-2xl bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col h-[100dvh] sm:h-[90vh]">

        {/* Header */}
        <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-indigo-100 bg-gradient-to-r from-indigo-50 to-blue-50 rounded-t-2xl flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 sm:w-14 sm:h-14 bg-indigo-600 rounded-full flex items-center justify-center flex-shrink-0">
              <PenLine className="text-white w-5 h-5 sm:w-7 sm:h-7" />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="text-base sm:text-2xl font-bold text-gray-900 leading-tight">Non-Disclosure Agreement</h2>
              <p className="text-xs sm:text-sm text-gray-600">Please read before checking in</p>
            </div>
          </div>
          {requireSignature && (
            <div className="mt-1.5 inline-flex items-center gap-1.5 bg-indigo-100 px-2.5 py-1 rounded-lg">
              <PenLine className="w-3.5 h-3.5 text-indigo-600 flex-shrink-0" />
              <span className="text-xs sm:text-sm font-semibold text-indigo-700">Signature Required</span>
            </div>
          )}
        </div>

        {/* Person identity banner */}
        <div className="px-4 sm:px-6 py-2.5 bg-indigo-600 flex-shrink-0 flex items-center gap-3">
          <div className="w-7 h-7 bg-white/20 rounded-full flex items-center justify-center flex-shrink-0">
            <User className="w-3.5 h-3.5 text-white" />
          </div>
          <div className="min-w-0">
            <p className="text-sm sm:text-base text-white font-bold leading-tight">{personName}</p>
            {personSubtitle && (
              <p className="text-xs text-indigo-200 flex items-center gap-1 mt-0.5 truncate">
                <Building2 className="w-3 h-3 flex-shrink-0" />
                <span className="truncate">{personSubtitle}</span>
              </p>
            )}
          </div>
        </div>

        {/* Scrollable NDA content */}
        <div
          ref={contentRef}
          onScroll={checkScrollBottom}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          className="flex-1 min-h-0 px-4 sm:px-6 py-3 sm:py-4 space-y-0.5"
          style={{
            overflowY: 'scroll',
            overscrollBehavior: 'contain',
            touchAction: 'pan-y',
            WebkitOverflowScrolling: 'touch',
          } as React.CSSProperties}
        >
          {ndaContent ? (
            renderNdaMarkdown(ndaContent)
          ) : (
            <p className="text-sm text-gray-500 italic">No NDA content configured. Please contact your administrator.</p>
          )}
        </div>

        {/* Scroll prompt */}
        {!hasScrolledToBottom && (
          <div className="px-4 sm:px-6 py-2.5 bg-amber-50 border-t border-amber-200 flex-shrink-0 flex items-center justify-center gap-2">
            <ChevronDown className="w-4 h-4 text-amber-600 animate-bounce flex-shrink-0" />
            <p className="text-xs sm:text-sm text-amber-700 font-semibold text-center">
              Scroll down to read all content before you can accept
            </p>
            <ChevronDown className="w-4 h-4 text-amber-600 animate-bounce flex-shrink-0" />
          </div>
        )}

        {/* Acceptance area */}
        <div
          className="px-4 sm:px-6 py-3 sm:py-5 border-t border-gray-200 bg-gray-50 rounded-b-2xl flex-shrink-0 space-y-2.5 sm:space-y-4"
          style={{ paddingBottom: 'max(12px, env(safe-area-inset-bottom, 12px))' }}
        >
          {requireSignature && (
            <div
              className={`flex items-start gap-3 p-3 sm:p-4 rounded-xl border-2 cursor-pointer transition-all ${
                accepted
                  ? 'border-indigo-500 bg-indigo-50'
                  : hasScrolledToBottom
                  ? 'border-gray-300 bg-white hover:border-indigo-400'
                  : 'border-gray-200 bg-gray-100 opacity-50 cursor-not-allowed'
              }`}
              onClick={() => { if (hasScrolledToBottom) setAccepted(!accepted); }}
            >
              <Checkbox
                checked={accepted}
                disabled={!hasScrolledToBottom}
                onCheckedChange={(checked) => { if (hasScrolledToBottom) setAccepted(!!checked); }}
                className="mt-0.5 flex-shrink-0 w-5 h-5"
                id="nda-checkbox"
              />
              <Label
                htmlFor="nda-checkbox"
                className={`text-sm sm:text-base font-medium leading-relaxed cursor-pointer ${
                  hasScrolledToBottom ? 'text-gray-800' : 'text-gray-400'
                }`}
              >
                I confirm that I have read, understood, and agree to comply with the terms of this Non-Disclosure Agreement.
              </Label>
            </div>
          )}

          <div className="flex gap-2 sm:gap-3">
            <Button
              variant="outline"
              onClick={onClose}
              disabled={isProcessing}
              className="flex-1 h-12 sm:h-14 text-sm sm:text-lg border border-slate-200 text-gray-700 hover:bg-gray-50 font-semibold"
            >
              Cancel
            </Button>
            <Button
              onClick={handleAccept}
              disabled={!canAccept || isProcessing}
              className={`flex-1 h-12 sm:h-14 text-sm sm:text-lg font-bold transition-all ${
                canAccept && !isProcessing
                  ? 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg'
                  : 'bg-gray-300 text-gray-500 cursor-not-allowed'
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
                  {requireSignature ? 'Sign & Accept' : 'I Have Read the NDA'}
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
