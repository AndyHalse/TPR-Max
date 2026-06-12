import { useState } from "react";
import { Bug, Loader2, Camera, CameraOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { getRecentErrors } from "@/lib/errorBuffer";
import { toast } from "@/hooks/use-toast";

export default function ReportProblemButton() {
  const [capturing, setCapturing] = useState(false);
  const [open, setOpen] = useState(false);
  const [description, setDescription] = useState("");
  const [screenshot, setScreenshot] = useState<string | null>(null);
  const [includeScreenshot, setIncludeScreenshot] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const { data: me } = useQuery<any>({ queryKey: ["/api/auth/me"] });

  const reporterName = me
    ? [me.firstName, me.lastName].filter(Boolean).join(" ") || me.username || ""
    : "";
  const reporterEmail =
    me?.username?.includes("@") ? me.username : (me?.email ?? "");

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
      const MAX_W = 1600;
      let w = canvas.width;
      let h = canvas.height;
      if (w > MAX_W) {
        h = Math.round((h * MAX_W) / w);
        w = MAX_W;
      }
      const out = document.createElement("canvas");
      out.width = w;
      out.height = h;
      out.getContext("2d")!.drawImage(canvas, 0, 0, w, h);
      shot = out.toDataURL("image/jpeg", 0.7);
    } catch (_) {
      // Continue without screenshot
    } finally {
      setCapturing(false);
    }
    setScreenshot(shot);
    setIncludeScreenshot(!!shot);
    setDescription("");
    setOpen(true);
  }

  function handleClose() {
    setOpen(false);
    setDescription("");
    setScreenshot(null);
  }

  async function handleSubmit() {
    if (!description.trim() || submitting) return;
    setSubmitting(true);
    try {
      const recentErrors = getRecentErrors();
      const payload = {
        description: description.trim(),
        screenshot: includeScreenshot && screenshot ? screenshot : undefined,
        pageUrl: window.location.pathname,
        browserInfo: navigator.userAgent,
        screenSize: `${window.innerWidth}x${window.innerHeight}`,
        consoleErrors: recentErrors.length > 0 ? recentErrors.join("\n") : undefined,
        reporterName: reporterName || undefined,
        reporterEmail: reporterEmail || undefined,
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
                  Include screenshot of this page
                </Label>
              </div>

              {screenshot && includeScreenshot && (
                <div className="space-y-1">
                  <img
                    src={screenshot}
                    alt="Page screenshot preview"
                    className="w-full rounded border max-h-40 object-cover object-top cursor-pointer hover:opacity-90 transition-opacity"
                    onClick={() => window.open(screenshot, "_blank")}
                    title="Click to view full size"
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
          </div>

          <DialogFooter>
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
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
