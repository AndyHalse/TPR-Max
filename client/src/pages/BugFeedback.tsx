import { useState, useEffect, useRef } from "react";
import { useParams, useLocation } from "wouter";
import { Loader2, CheckCircle2, AlertCircle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

type PageState =
  | { phase: "loading" }
  | { phase: "confirming" }
  | { phase: "confirm_done"; reportNumber: string }
  | { phase: "reopen_form"; reportNumber: string }
  | { phase: "reopen_done"; reportNumber: string }
  | { phase: "already_responded"; reportNumber: string }
  | { phase: "invalid" }
  | { phase: "error"; message: string };

function resizeImageDataUrl(dataUrl: string, maxPx = 1400): Promise<string> {
  return new Promise((resolve) => {
    const img = new window.Image();
    img.onload = () => {
      const scale = Math.min(1, maxPx / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) { resolve(dataUrl); return; }
      ctx.drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL("image/jpeg", 0.82));
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

export default function BugFeedback() {
  const { token } = useParams<{ token: string }>();
  const [, searchStr] = useLocation();
  const response = new URLSearchParams(window.location.search).get("r");

  const [state, setState] = useState<PageState>({ phase: "loading" });
  const [reason, setReason] = useState("");
  const [screenshot, setScreenshot] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const didAutoConfirm = useRef(false);

  // Load report info from token
  useEffect(() => {
    if (!token) { setState({ phase: "invalid" }); return; }

    fetch(`/api/bug-feedback/${token}`)
      .then((r) => {
        if (r.status === 404) { setState({ phase: "invalid" }); return null; }
        if (!r.ok) throw new Error("Server error");
        return r.json();
      })
      .then((data) => {
        if (!data) return;
        if (data.alreadyResponded) {
          setState({ phase: "already_responded", reportNumber: data.reportNumber });
          return;
        }
        if (response === "fixed") {
          setState({ phase: "confirming" });
        } else if (response === "broken") {
          setState({ phase: "reopen_form", reportNumber: data.reportNumber });
        } else {
          // No ?r= param — default to "still broken" form
          setState({ phase: "reopen_form", reportNumber: data.reportNumber });
        }
      })
      .catch(() => setState({ phase: "error", message: "Something went wrong. Please try again." }));
  }, [token]);

  // Auto-confirm when phase is "confirming"
  useEffect(() => {
    if (state.phase !== "confirming" || didAutoConfirm.current) return;
    didAutoConfirm.current = true;

    fetch(`/api/bug-feedback/${token}/confirm`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" })
      .then((r) => {
        if (!r.ok) throw new Error("Confirm failed");
        return r.json();
      })
      .then((data) => setState({ phase: "confirm_done", reportNumber: data.reportNumber }))
      .catch(() => setState({ phase: "error", message: "We couldn't record your confirmation. Please try clicking the link again." }));
  }, [state.phase, token]);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const raw = ev.target?.result as string;
      const resized = await resizeImageDataUrl(raw);
      setScreenshot(resized);
    };
    reader.readAsDataURL(file);
  }

  async function handleReopen() {
    if (!reason.trim()) { setSubmitError("Please describe what is still happening."); return; }
    setSubmitting(true);
    setSubmitError(null);
    try {
      const r = await fetch(`/api/bug-feedback/${token}/reopen`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: reason.trim(), screenshot: screenshot ?? undefined }),
      });
      const data = await r.json();
      if (!r.ok) { setSubmitError(data.error || "Something went wrong."); return; }
      setState({ phase: "reopen_done", reportNumber: data.reportNumber });
    } catch {
      setSubmitError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        {/* ACS branding strip */}
        <div className="bg-[#2460A9] rounded-t-2xl px-8 py-5">
          <p className="text-white/80 text-xs font-bold uppercase tracking-widest mb-1">ACS Safety &amp; Security</p>
          <p className="text-white text-xl font-bold">TPR Support</p>
        </div>

        <div className="bg-white rounded-b-2xl shadow-xl px-8 py-8">
          {state.phase === "loading" && (
            <div className="flex flex-col items-center py-8 gap-3 text-slate-500">
              <Loader2 className="w-8 h-8 animate-spin text-[#2460A9]" />
              <p>Loading…</p>
            </div>
          )}

          {state.phase === "confirming" && (
            <div className="flex flex-col items-center py-8 gap-3 text-slate-500">
              <Loader2 className="w-8 h-8 animate-spin text-green-600" />
              <p>Recording your confirmation…</p>
            </div>
          )}

          {state.phase === "confirm_done" && (
            <div className="flex flex-col items-center py-6 gap-4 text-center">
              <CheckCircle2 className="w-14 h-14 text-green-500" />
              <h2 className="text-xl font-bold text-slate-800">Thanks — all sorted! 👍</h2>
              <p className="text-slate-600">
                We've marked report <strong>{state.reportNumber}</strong> as resolved. Glad to hear it's working now.
              </p>
            </div>
          )}

          {state.phase === "reopen_form" && (
            <div className="space-y-5">
              <div className="flex items-center gap-3">
                <RotateCcw className="w-6 h-6 text-red-500 flex-shrink-0" />
                <h2 className="text-xl font-bold text-slate-800">Sorry it's still not right</h2>
              </div>
              <p className="text-slate-600 text-sm">
                Tell us what's still happening for report <strong>{state.reportNumber}</strong> and we'll take another look.
              </p>

              <div className="space-y-1.5">
                <Label htmlFor="reason" className="text-sm font-medium">
                  What's still happening? <span className="text-red-500">*</span>
                </Label>
                <Textarea
                  id="reason"
                  rows={5}
                  placeholder="Describe what you're still seeing…"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  maxLength={2000}
                  className="resize-none"
                />
                <p className="text-xs text-slate-400 text-right">{reason.length}/2000</p>
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-medium">Screenshot <span className="text-slate-400 font-normal">(optional)</span></Label>
                {screenshot ? (
                  <div className="border rounded-lg overflow-hidden">
                    <img src={screenshot} alt="Attached screenshot" className="w-full max-h-48 object-contain bg-slate-50" />
                    <div className="flex justify-end px-3 py-1.5 bg-slate-50 border-t">
                      <button
                        className="text-xs text-red-500 hover:text-red-700 transition-colors"
                        onClick={() => { setScreenshot(null); if (fileRef.current) fileRef.current.value = ""; }}
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    className="w-full border-2 border-dashed border-slate-200 rounded-lg py-6 text-sm text-slate-400 hover:border-[#2460A9] hover:text-[#2460A9] transition-colors"
                  >
                    Click to attach a screenshot
                  </button>
                )}
                <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
              </div>

              {submitError && (
                <p className="text-sm text-red-600 flex items-center gap-1.5">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  {submitError}
                </p>
              )}

              <Button
                className="w-full bg-[#2460A9] hover:bg-[#1a4a8a] text-white"
                onClick={handleReopen}
                disabled={submitting || !reason.trim()}
              >
                {submitting ? <><Loader2 className="w-4 h-4 animate-spin mr-2" />Sending…</> : "Send — Reopen report"}
              </Button>
            </div>
          )}

          {state.phase === "reopen_done" && (
            <div className="flex flex-col items-center py-6 gap-4 text-center">
              <div className="w-14 h-14 rounded-full bg-amber-100 flex items-center justify-center">
                <RotateCcw className="w-7 h-7 text-amber-600" />
              </div>
              <h2 className="text-xl font-bold text-slate-800">Thanks — we're on it</h2>
              <p className="text-slate-600">
                We've reopened report <strong>{state.reportNumber}</strong> and the team will take another look. We'll be in touch.
              </p>
            </div>
          )}

          {state.phase === "already_responded" && (
            <div className="flex flex-col items-center py-6 gap-4 text-center">
              <CheckCircle2 className="w-14 h-14 text-slate-400" />
              <h2 className="text-xl font-bold text-slate-800">Already received</h2>
              <p className="text-slate-600">
                Thanks — we've already recorded your response for <strong>{state.reportNumber}</strong>.
              </p>
            </div>
          )}

          {state.phase === "invalid" && (
            <div className="flex flex-col items-center py-6 gap-4 text-center">
              <AlertCircle className="w-14 h-14 text-slate-400" />
              <h2 className="text-xl font-bold text-slate-800">Link expired</h2>
              <p className="text-slate-600">
                This link has expired or has already been used. If you still need help, just reply to the email we sent you.
              </p>
            </div>
          )}

          {state.phase === "error" && (
            <div className="flex flex-col items-center py-6 gap-4 text-center">
              <AlertCircle className="w-14 h-14 text-red-400" />
              <h2 className="text-xl font-bold text-slate-800">Something went wrong</h2>
              <p className="text-slate-600">{state.message}</p>
            </div>
          )}

          <div className="mt-8 pt-6 border-t border-slate-100 text-center">
            <p className="text-xs text-slate-400">ACS Safety &amp; Security Ltd · T: +44 (0)1344 771569</p>
          </div>
        </div>
      </div>
    </div>
  );
}
