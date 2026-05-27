import { useState, useRef, useEffect, useCallback } from "react";
import { useRoute } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { PenLine, Check, ChevronDown, AlertTriangle, CheckCircle2 } from "lucide-react";

function renderNdaMarkdown(text: string): React.ReactNode[] {
  return text.split('\n').map((line, i) => {
    if (line.startsWith('# ')) return <h2 key={i} className="font-bold text-lg mt-4 mb-1 text-gray-900">{line.slice(2)}</h2>;
    if (line.startsWith('## ')) return <h3 key={i} className="font-semibold text-base mt-3 mb-0.5 text-gray-800">{line.slice(3)}</h3>;
    if (line.trim() === '---') return <hr key={i} className="my-3 border-gray-200" />;
    if (line.trim() === '') return <div key={i} className="h-2" />;
    if (line.startsWith('- ')) {
      const parts = line.slice(2).split(/(\*\*[^*]+\*\*)/);
      return (
        <li key={i} className="ml-5 text-sm text-gray-700 leading-relaxed list-disc">
          {parts.map((p, j) => p.startsWith('**') && p.endsWith('**') ? <strong key={j}>{p.slice(2, -2)}</strong> : <span key={j}>{p}</span>)}
        </li>
      );
    }
    const nm = line.match(/^(\d+)\. (.*)/);
    if (nm) {
      const parts = nm[2].split(/(\*\*[^*]+\*\*)/);
      return (
        <li key={i} className="ml-5 text-sm text-gray-700 leading-relaxed list-decimal">
          {parts.map((p, j) => p.startsWith('**') && p.endsWith('**') ? <strong key={j}>{p.slice(2, -2)}</strong> : <span key={j}>{p}</span>)}
        </li>
      );
    }
    if (line.startsWith('*') && line.endsWith('*') && !line.startsWith('**')) {
      return <p key={i} className="text-xs text-gray-500 italic leading-relaxed">{line.slice(1, -1)}</p>;
    }
    const parts = line.split(/(\*\*[^*]+\*\*)/);
    return (
      <p key={i} className="text-sm text-gray-700 leading-relaxed">
        {parts.map((p, j) => p.startsWith('**') && p.endsWith('**') ? <strong key={j}>{p.slice(2, -2)}</strong> : <span key={j}>{p}</span>)}
      </p>
    );
  });
}

export default function NdaSign() {
  const [, params] = useRoute('/nda/:token');
  const token = params?.token ?? '';

  const [accepted, setAccepted] = useState(false);
  const [hasScrolled, setHasScrolled] = useState(false);
  const [signed, setSigned] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const touchStartY = useRef(0);

  const { data, isLoading, error } = useQuery<{
    personName: string;
    companyName: string;
    ndaContent: string;
    requireSignature: boolean;
    alreadyAccepted: boolean;
    acceptedAt: string | null;
  }>({
    queryKey: ['/api/nda/public', token],
    queryFn: async () => {
      const res = await fetch(`/api/nda/public/${token}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(err.error || `Error ${res.status}`);
      }
      return res.json();
    },
    enabled: !!token,
    retry: false,
  });

  const acceptMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/nda/public/${token}/accept`, { method: 'POST' });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Failed to record acceptance' }));
        throw new Error(err.error || 'Failed to record acceptance');
      }
      return res.json();
    },
    onSuccess: () => setSigned(true),
  });

  useEffect(() => {
    if (data) {
      setTimeout(() => {
        const el = contentRef.current;
        if (el && el.scrollHeight <= el.clientHeight + 50) setHasScrolled(true);
      }, 200);
    }
  }, [data]);

  const checkScroll = useCallback(() => {
    const el = contentRef.current;
    if (el && el.scrollHeight - el.scrollTop <= el.clientHeight + 50) setHasScrolled(true);
  }, []);

  const handleTouchStart = (e: React.TouchEvent) => { touchStartY.current = e.touches[0].clientY; };
  const handleTouchMove = (e: React.TouchEvent) => {
    const el = contentRef.current;
    if (!el) return;
    el.scrollTop += touchStartY.current - e.touches[0].clientY;
    touchStartY.current = e.touches[0].clientY;
    checkScroll();
    e.stopPropagation();
  };

  const canAccept = data?.requireSignature ? (hasScrolled && accepted) : hasScrolled;

  // Already accepted (via popup at desk or previously via link)
  const alreadyAccepted = data?.alreadyAccepted || signed;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-blue-50 flex items-center justify-center">
        <div className="text-center space-y-3">
          <div className="w-10 h-10 border-4 border-indigo-400 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-gray-600 text-sm">Loading NDA...</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-red-50 to-orange-50 flex items-center justify-center p-4">
        <div className="max-w-sm w-full bg-white rounded-2xl shadow-lg p-6 text-center space-y-4">
          <div className="w-14 h-14 bg-red-100 rounded-full flex items-center justify-center mx-auto">
            <AlertTriangle className="w-7 h-7 text-red-600" />
          </div>
          <h2 className="text-lg font-bold text-gray-900">Link Not Found</h2>
          <p className="text-sm text-gray-600">{(error as Error)?.message || 'This NDA signing link is invalid or has expired.'}</p>
        </div>
      </div>
    );
  }

  if (alreadyAccepted) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-50 to-emerald-50 flex items-center justify-center p-4">
        <div className="max-w-sm w-full bg-white rounded-2xl shadow-lg p-6 text-center space-y-4">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto">
            <CheckCircle2 className="w-9 h-9 text-green-600" />
          </div>
          <h2 className="text-xl font-bold text-gray-900">NDA Accepted</h2>
          <p className="text-sm text-gray-600">
            {signed
              ? `Thank you, ${data.personName}. Your acceptance has been recorded.`
              : `You have already accepted the NDA${data.acceptedAt ? ` on ${new Date(data.acceptedAt).toLocaleDateString()}` : ''}.`}
          </p>
          <p className="text-xs text-gray-400">{data.companyName}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-blue-50 flex flex-col">
      {/* Header */}
      <div className="bg-indigo-700 text-white px-4 py-4 flex-shrink-0">
        <div className="max-w-lg mx-auto flex items-center gap-3">
          <div className="w-9 h-9 bg-white/20 rounded-full flex items-center justify-center flex-shrink-0">
            <PenLine className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-sm font-bold leading-tight">Non-Disclosure Agreement</h1>
            <p className="text-xs text-indigo-200">{data.companyName}</p>
          </div>
        </div>
      </div>

      {/* Person banner */}
      <div className="bg-indigo-600 text-white px-4 py-2 flex-shrink-0">
        <div className="max-w-lg mx-auto">
          <p className="text-sm font-semibold">{data.personName}</p>
          <p className="text-xs text-indigo-200">Please read and accept the NDA below</p>
        </div>
      </div>

      {/* NDA content */}
      <div
        ref={contentRef}
        onScroll={checkScroll}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        className="flex-1 overflow-y-auto px-4 py-4 space-y-0.5"
        style={{ overscrollBehavior: 'contain', WebkitOverflowScrolling: 'touch' } as React.CSSProperties}
      >
        <div className="max-w-lg mx-auto bg-white rounded-xl shadow-sm p-4 sm:p-6">
          {data.ndaContent ? renderNdaMarkdown(data.ndaContent) : (
            <p className="text-sm text-gray-500 italic">No NDA content available.</p>
          )}
        </div>
        <div className="h-4" />
      </div>

      {/* Scroll prompt */}
      {!hasScrolled && (
        <div className="bg-amber-50 border-t border-amber-200 px-4 py-2 flex-shrink-0 flex items-center justify-center gap-2">
          <ChevronDown className="w-4 h-4 text-amber-600 animate-bounce" />
          <span className="text-xs text-amber-700 font-semibold">Scroll to read all before accepting</span>
          <ChevronDown className="w-4 h-4 text-amber-600 animate-bounce" />
        </div>
      )}

      {/* Footer accept area */}
      <div className="bg-white border-t border-gray-200 px-4 py-4 flex-shrink-0" style={{ paddingBottom: 'max(16px, env(safe-area-inset-bottom, 16px))' }}>
        <div className="max-w-lg mx-auto space-y-3">
          {data.requireSignature && (
            <div
              className={`flex items-start gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all ${
                accepted ? 'border-indigo-500 bg-indigo-50' : hasScrolled ? 'border-gray-300 bg-white' : 'border-gray-200 bg-gray-50 opacity-50 pointer-events-none'
              }`}
              onClick={() => { if (hasScrolled) setAccepted(!accepted); }}
            >
              <Checkbox
                checked={accepted}
                disabled={!hasScrolled}
                onCheckedChange={(c) => { if (hasScrolled) setAccepted(!!c); }}
                className="mt-0.5 flex-shrink-0 w-5 h-5"
                id="nda-sign-checkbox"
              />
              <Label htmlFor="nda-sign-checkbox" className="text-sm text-gray-800 leading-relaxed cursor-pointer">
                I have read, understood, and agree to comply with this Non-Disclosure Agreement.
              </Label>
            </div>
          )}

          {acceptMutation.isError && (
            <p className="text-xs text-red-600 text-center">{(acceptMutation.error as Error)?.message}</p>
          )}

          <Button
            onClick={() => acceptMutation.mutate()}
            disabled={!canAccept || acceptMutation.isPending}
            className={`w-full h-14 text-base font-bold transition-all ${
              canAccept && !acceptMutation.isPending
                ? 'bg-indigo-600 hover:bg-indigo-700 text-white'
                : 'bg-gray-300 text-gray-500 cursor-not-allowed'
            }`}
          >
            {acceptMutation.isPending ? (
              <span className="flex items-center gap-2">
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Saving...
              </span>
            ) : (
              <>
                <Check className="mr-2 w-5 h-5" />
                {data.requireSignature ? 'Sign & Accept NDA' : 'I Have Read the NDA'}
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
