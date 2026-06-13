import { useEffect, useState } from "react";
import { useRoute, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Loader2 } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

export default function InductionPreview() {
  const [, params] = useRoute("/induction-preview/:roleType");
  const [, setLocation] = useLocation();
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [errorMsg, setErrorMsg] = useState("The induction video could not be loaded. Please try generating it again.");

  const [videoMode, setVideoMode] = useState<"ai" | "custom" | null>(null);
  const [htmlContent, setHtmlContent] = useState("");
  const [previewVideoToken, setPreviewVideoToken] = useState<string | null>(null);

  const roleType = params?.roleType || "visitor";

  useEffect(() => {
    setIsLoading(true);
    setHasError(false);
    setVideoMode(null);
    setHtmlContent("");
    setPreviewVideoToken(null);

    const load = async () => {
      // 1. Check what kind of induction this role has
      const settingsRes = await apiRequest("GET", `/api/induction/settings/${roleType}`);
      const settingsData = settingsRes.ok ? await settingsRes.json() : null;
      const customVideoUrl: string | null = settingsData?.setting?.customVideoUrl ?? null;

      if (customVideoUrl) {
        // 2a. Custom MP4 — mint a short-lived preview token (no Bearer header needed on <video>)
        const tokenRes = await apiRequest("POST", `/api/induction/preview-token/${roleType}`);
        if (!tokenRes.ok) throw new Error("Could not create preview token");
        const { token } = await tokenRes.json();
        setPreviewVideoToken(token);
        setVideoMode("custom");
      } else {
        // 2b. AI-generated slides
        const videoRes = await apiRequest("GET", `/api/induction/video/${roleType}`);
        if (!videoRes.ok) throw new Error(`HTTP ${videoRes.status}`);
        const html = await videoRes.text();
        setHtmlContent(html);
        setVideoMode("ai");
      }
      setIsLoading(false);
    };

    load().catch((err) => {
      setErrorMsg(err?.message || "The induction video could not be loaded.");
      setIsLoading(false);
      setHasError(true);
    });
  }, [roleType]);

  const handleBack = () => setLocation("/induction-settings");

  const getRoleDisplayName = () => {
    switch (roleType) {
      case "visitor": return "Visitor";
      case "staff": return "Staff";
      case "contractor": return "Contractor";
      default: return roleType;
    }
  };

  return (
    <div className="fixed inset-0 w-full h-full bg-gradient-to-br from-blue-950 to-purple-950 flex flex-col">
      {/* Header */}
      <div className="absolute top-0 left-0 right-0 z-50 bg-black/30 backdrop-blur-sm border-b border-white/10">
        <div className="flex items-center justify-between px-4 py-3">
          <Button
            onClick={handleBack}
            variant="ghost"
            className="text-white hover:bg-white/10"
            data-testid="button-back-to-settings"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Settings
          </Button>
          <h1 className="text-white text-lg font-semibold">
            {getRoleDisplayName()} Induction {videoMode === "custom" ? "Video" : "Preview"}
          </h1>
          <div className="w-32" />
        </div>
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-blue-950 to-purple-950 z-40">
          <div className="text-center">
            <Loader2 className="h-12 w-12 animate-spin text-white mx-auto mb-4" data-testid="loader-video" />
            <p className="text-white text-lg">Loading induction preview…</p>
          </div>
        </div>
      )}

      {/* Error */}
      {hasError && (
        <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-red-950 to-purple-950 z-40">
          <div className="text-center p-8">
            <h2 className="text-white text-2xl font-bold mb-4">Unable to Load</h2>
            <p className="text-white/80 mb-6">{errorMsg}</p>
            <Button onClick={handleBack} className="bg-white text-black hover:bg-gray-200" data-testid="button-back-error">
              Back to Settings
            </Button>
          </div>
        </div>
      )}

      {/* Custom MP4 player */}
      {!isLoading && !hasError && videoMode === "custom" && previewVideoToken && (
        <div className="w-full flex items-center justify-center" style={{ paddingTop: 56, height: "100vh" }}>
          <video
            key={previewVideoToken}
            controls
            autoPlay
            playsInline
            className="max-w-full max-h-full"
            style={{ maxHeight: "calc(100vh - 56px)" }}
            data-testid="video-custom-preview"
          >
            <source src={`/api/induction/preview-video/${previewVideoToken}`} />
            Your browser does not support the video tag.
          </video>
        </div>
      )}

      {/* AI slides iframe */}
      {!isLoading && !hasError && videoMode === "ai" && htmlContent && (
        <iframe
          srcDoc={htmlContent}
          className="w-full h-full border-0"
          title={`${roleType} Induction Video`}
          allow="autoplay; fullscreen"
          sandbox="allow-scripts allow-same-origin"
          data-testid="iframe-induction-video"
        />
      )}
    </div>
  );
}
