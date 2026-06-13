import { useEffect, useState } from "react";
import { useRoute, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Loader2 } from "lucide-react";

export default function InductionPreview() {
  const [, params] = useRoute("/induction-preview/:roleType");
  const [, setLocation] = useLocation();

  const roleType = params?.roleType || "visitor";

  // Token minted by the parent tab (where auth works) and passed via ?pt=
  const searchParams = new URLSearchParams(window.location.search);
  const previewToken = searchParams.get("pt");

  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [htmlContent, setHtmlContent] = useState("");
  const [mode, setMode] = useState<"custom" | "ai" | null>(null);

  useEffect(() => {
    setIsLoading(true);
    setHasError(false);

    if (previewToken) {
      // Custom MP4 — token already minted, just show the player
      setMode("custom");
      setIsLoading(false);
    } else {
      // AI slides — this endpoint is public (no auth required)
      fetch(`/api/induction/video/${roleType}`)
        .then((res) => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return res.text();
        })
        .then((html) => {
          setHtmlContent(html);
          setMode("ai");
          setIsLoading(false);
        })
        .catch((err) => {
          setErrorMsg(err?.message || "The induction video could not be loaded. Please try generating it again.");
          setHasError(true);
          setIsLoading(false);
        });
    }
  }, [roleType, previewToken]);

  const handleBack = () => setLocation("/induction-settings");

  const getRoleDisplayName = () => {
    switch (roleType) {
      case "visitor": return "Visitor";
      case "staff": return "Staff";
      case "contractor": return "Contractor";
      default: return roleType.charAt(0).toUpperCase() + roleType.slice(1);
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
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Settings
          </Button>
          <h1 className="text-white text-lg font-semibold">
            {getRoleDisplayName()} Induction {mode === "custom" ? "Video" : "Preview"}
          </h1>
          <div className="w-32" />
        </div>
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center z-40">
          <div className="text-center">
            <Loader2 className="h-12 w-12 animate-spin text-white mx-auto mb-4" />
            <p className="text-white text-lg">Loading induction preview…</p>
          </div>
        </div>
      )}

      {/* Error */}
      {!isLoading && hasError && (
        <div className="absolute inset-0 flex items-center justify-center z-40">
          <div className="text-center p-8">
            <h2 className="text-white text-2xl font-bold mb-4">Unable to Load</h2>
            <p className="text-white/80 mb-6">{errorMsg}</p>
            <Button onClick={handleBack} className="bg-white text-black hover:bg-gray-200">
              Back to Settings
            </Button>
          </div>
        </div>
      )}

      {/* Custom MP4 — streamed via preview token (no auth header needed) */}
      {!isLoading && !hasError && mode === "custom" && previewToken && (
        <div className="w-full flex items-center justify-center" style={{ paddingTop: 56, height: "100vh" }}>
          <video
            key={previewToken}
            controls
            autoPlay
            playsInline
            className="max-w-full max-h-full"
            style={{ maxHeight: "calc(100vh - 56px)" }}
          >
            <source src={`/api/induction/preview-video/${previewToken}`} type="video/mp4" />
            Your browser does not support the video tag.
          </video>
        </div>
      )}

      {/* AI slides — rendered in sandboxed iframe */}
      {!isLoading && !hasError && mode === "ai" && htmlContent && (
        <iframe
          srcDoc={htmlContent}
          className="w-full h-full border-0"
          title={`${roleType} Induction Video`}
          allow="autoplay; fullscreen"
          sandbox="allow-scripts allow-same-origin"
          style={{ paddingTop: 56 }}
        />
      )}
    </div>
  );
}
