import { useState, useEffect, useRef } from "react";
import { Bug, Loader2, Camera, CameraOff, Paperclip, X, Image } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { getRecentErrors, getBreadcrumbs, getLastErrorId } from "@/lib/errorBuffer";
import { toast } from "@/hooks/use-toast";

interface Attachment {
  id: string;
  dataUrl: string;
  caption: string;
}

const MAX_W = 1600;
const JPEG_QUALITY = 0.7;
const MAX_ATTACHMENTS = 5;

async function compressImageFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new window.Image();
      img.onload = () => {
        let { width: w, height: h } = img;
        if (w > MAX_W) { h = Math.round((h * MAX_W) / w); w = MAX_W; }
        const canvas = document.createElement("canvas");
        canvas.width = w; canvas.height = h;
        canvas.getContext("2d")!.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/jpeg", JPEG_QUALITY));
      };
      img.onerror = reject;
      img.src = ev.target!.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function compressBlobToDataUrl(blob: Blob): Promise<string> {
  const file = new File([blob], "paste.png", { type: blob.type });
  return compressImageFile(file);
}

export default function ReportProblemButton() {
  const [capturing, setCapturing] = useState(false);
  const [open, setOpen] = useState(false);
  const [description, setDescription] = useState("");
  const [screenshot, setScreenshot] = useState<string | null>(null);
  const [includeScreenshot, setIncludeScreenshot] = useState(true);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: me } = useQuery<any>({ queryKey: ["/api/auth/me"] });

  const reporterName = me
    ? [me.firstName, me.lastName].filter(Boolean).join(" ") || me.username || ""
    : "";
  const reporterEmail =
    me?.username?.includes("@") ? me.username : (me?.email ?? "");

  useEffect(() => {
    if (!open) return;
    const onPaste = async (e: ClipboardEvent) => {
      const items = Array.from(e.clipboardData?.items ?? []);
      const imageItem = items.find((i) => i.type.startsWith("image/"));
      if (!imageItem) return;
      e.preventDefault();
      if (attachments.length >= MAX_ATTACHMENTS) {
        toast({ title: "Max 5 attachments", variant: "destructive" });
        return;
      }
      try {
        const blob = imageItem.getAsFile();
        if (!blob) return;
        const dataUrl = await compressBlobToDataUrl(blob);
        addAttachment(dataUrl);
      } catch (_) {}
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [open, attachments.length]);

  function addAttachment(dataUrl: string) {
    setAttachments((prev) => [
      ...prev,
      { id: crypto.randomUUID(), dataUrl, caption: "" },
    ]);
  }

  function removeAttachment(id: string) {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  }

  function updateCaption(id: string, caption: string) {
    setAttachments((prev) =>
      prev.map((a) => (a.id === id ? { ...a, caption } : a))
    );
  }

  async function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    const remaining = MAX_ATTACHMENTS - attachments.length;
    const toProcess = files.slice(0, remaining);
    for (const file of toProcess) {
      try {
        const dataUrl = await compressImageFile(file);
        addAttachment(dataUrl);
      } catch (_) {}
    }
    if (files.length > remaining) {
      toast({ title: `Max ${MAX_ATTACHMENTS} attachments — some images were skipped`, variant: "destructive" });
    }
  }

  async function handleOpen() {
    setCapturing(true);
    let shot: string | null = null;
    try {
      const html2canvas = (await import("html2canvas")).default;
      const canvas = await html2canvas(document.body, {
        useCORS: true,
        allowTaint: false,
        scale: 1,
        width: window.innerWidth,
        height: window.innerHeight,
        x: window.scrollX,
        y: window.scrollY,
      });
      let w = canvas.width;
      let h = canvas.height;
      if (w > MAX_W) { h = Math.round((h * MAX_W) / w); w = MAX_W; }
      const out = document.createElement("canvas");
      out.width = w; out.height = h;
      out.getContext("2d")!.drawImage(canvas, 0, 0, w, h);
      shot = out.toDataURL("image/jpeg", JPEG_QUALITY);
    } catch (_) {
    } finally {
      setCapturing(false);
    }
    setScreenshot(shot);
    setIncludeScreenshot(!!shot);
    setAttachments([]);
    setDescription("");
    setOpen(true);
  }

  function handleClose() {
    setOpen(false);
    setDescription("");
    setScreenshot(null);
    setAttachments([]);
  }

  async function handleSubmit() {
    if (!description.trim() || submitting) return;
    setSubmitting(true);
    try {
      const recentErrors = getRecentErrors();
      const crumbs = getBreadcrumbs();
      const lastErrId = getLastErrorId();
      const payload = {
        description: description.trim(),
        screenshot: includeScreenshot && screenshot ? screenshot : undefined,
        attachments: attachments.map(({ dataUrl, caption }) => ({ dataUrl, caption })),
        pageUrl: window.location.pathname,
        browserInfo: navigator.userAgent,
        screenSize: `${window.innerWidth}x${window.innerHeight}`,
        consoleErrors: recentErrors.length > 0 ? recentErrors.join("\n") : undefined,
        reporterName: reporterName || undefined,
        reporterEmail: reporterEmail || undefined,
        errorId: lastErrId || undefined,
        breadcrumbs: crumbs.length > 0 ? crumbs.join("\n") : undefined,
        appVersion: (import.meta.env.VITE_APP_VERSION as string | undefined) || 'dev',
      };
      const res = await apiRequest("POST", "/api/bug-reports", payload);
      const data = await res.json();
      toast({
        title: `Report ${data.reportNumber} sent`,
        description: "Thanks, our support team has been notified.",
      });
      handleClose();
    } catch (err: any) {
      toast({
        title: "Failed to send report",
        description: err?.message || "Please try again.",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  }

  const totalImages = (includeScreenshot && screenshot ? 1 : 0) + attachments.length;

  return (
    <>
      <div className="fixed bottom-16 right-4 sm:bottom-24 sm:right-6 z-40">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                onClick={handleOpen}
                disabled={capturing}
                size="lg"
                className="h-10 w-10 sm:h-14 sm:w-14 rounded-full shadow-lg hover:shadow-xl transition-all duration-300 transform hover:scale-105 bg-amber-500 hover:bg-amber-600 text-white"
              >
                {capturing ? (
                  <>
                    <Loader2 size={18} className="sm:hidden animate-spin" />
                    <Loader2 size={24} className="hidden sm:block animate-spin" />
                  </>
                ) : (
                  <>
                    <Bug size={18} className="sm:hidden" />
                    <Bug size={24} className="hidden sm:block" />
                  </>
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="left" className="bg-slate-900 text-white">
              <p>Report a Problem</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose(); }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Bug className="w-5 h-5 text-amber-500" />
              Report a Problem
            </DialogTitle>
            <DialogDescription>
              Tell us what went wrong and we'll look into it as quickly as possible.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="bug-description">What happened? *</Label>
              <Textarea
                id="bug-description"
                placeholder="Describe what you were trying to do, what you expected to happen, and what actually happened instead. The more detail, the faster we can fix it."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                maxLength={5000}
                rows={5}
              />
              <p className="text-xs text-muted-foreground text-right">{description.length} / 5000</p>
            </div>

            {/* Auto-screenshot */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="include-screenshot"
                  checked={includeScreenshot}
                  onCheckedChange={(v) => setIncludeScreenshot(!!v)}
                  disabled={!screenshot}
                />
                <Label htmlFor="include-screenshot" className="cursor-pointer flex items-center gap-1.5">
                  {screenshot ? <Camera className="w-3.5 h-3.5" /> : <CameraOff className="w-3.5 h-3.5 text-muted-foreground" />}
                  Include auto-screenshot of this page
                </Label>
              </div>

              {screenshot && includeScreenshot && (
                <div className="space-y-1">
                  <img
                    src={screenshot}
                    alt="Page screenshot preview"
                    className="w-full rounded border object-contain bg-slate-50 dark:bg-slate-900 max-h-32"
                  />
                  <p className="text-xs text-amber-700 dark:text-amber-400">
                    ⚠ Check the screenshot doesn't show anything you'd rather not share.
                  </p>
                </div>
              )}

              {!screenshot && (
                <p className="text-xs text-muted-foreground">
                  Screenshot capture wasn't available — the report will still be sent without one.
                </p>
              )}
            </div>

            {/* Additional attachments */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="flex items-center gap-1.5">
                  <Image className="w-3.5 h-3.5" />
                  Additional screenshots
                  <span className="text-muted-foreground font-normal">({attachments.length}/{MAX_ATTACHMENTS})</span>
                </Label>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs gap-1"
                    disabled={attachments.length >= MAX_ATTACHMENTS}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Paperclip className="w-3 h-3" /> Upload
                  </Button>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                You can also <strong>paste</strong> (Ctrl+V / ⌘+V) an image directly into this dialog.
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={handleFileInput}
              />
              {attachments.length > 0 && (
                <div className="space-y-3">
                  <p className="text-xs text-muted-foreground">A quick caption on each image helps us fix it faster.</p>
                  {attachments.map((att) => (
                    <div key={att.id} className="border rounded-lg p-2 space-y-2 bg-slate-50 dark:bg-slate-900">
                      <div className="flex items-start gap-2">
                        <img
                          src={att.dataUrl}
                          alt="Attachment"
                          className="w-24 h-16 rounded object-cover border flex-shrink-0"
                        />
                        <div className="flex-1 min-w-0 space-y-1">
                          <Input
                            placeholder="What does this image show?"
                            value={att.caption}
                            onChange={(e) => updateCaption(att.id, e.target.value)}
                            maxLength={200}
                            className="h-7 text-xs"
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => removeAttachment(att.id)}
                          className="text-muted-foreground hover:text-red-500 transition-colors flex-shrink-0 mt-0.5"
                          title="Remove"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <DialogFooter className="flex items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground flex-1">
              {totalImages > 0 ? `${totalImages} image${totalImages !== 1 ? "s" : ""} will be attached` : ""}
            </p>
            <div className="flex gap-2">
              <Button variant="outline" onClick={handleClose} disabled={submitting}>
                Cancel
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={!description.trim() || submitting}
                className="bg-amber-500 hover:bg-amber-600 text-white"
              >
                {submitting && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                Send Report
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
