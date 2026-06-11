import { useEffect, useState } from "react";
import { useRoute, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Loader2 } from "lucide-react";

export default function InductionPreview() {
  const [, params] = useRoute("/induction-preview/:roleType");
  const [, setLocation] = useLocation();
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [htmlContent, setHtmlContent] = useState<string>("");

  const roleType = params?.roleType || 'visitor';

  useEffect(() => {
    setIsLoading(true);
    setHasError(false);
    setHtmlContent("");

    fetch(`/api/induction/video/${roleType}`, {
      credentials: "include",
      cache: "no-store",
      headers: { "Cache-Control": "no-store, no-cache" },
    })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.text();
      })
      .then((html) => {
        setHtmlContent(html);
        setIsLoading(false);
      })
      .catch(() => {
        setIsLoading(false);
        setHasError(true);
      });
  }, [roleType]);

  const handleBack = () => {
    setLocation('/induction-settings');
  };

  const getRoleDisplayName = () => {
    switch (roleType) {
      case 'visitor': return 'Visitor';
      case 'staff': return 'Staff';
      case 'contractor': return 'Contractor';
      default: return roleType;
    }
  };

  return (
    <div className="fixed inset-0 w-full h-full bg-gradient-to-br from-blue-950 to-purple-950 flex flex-col">
      {/* Header Bar */}
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
            {getRoleDisplayName()} Induction Video
          </h1>
          <div className="w-32"></div>
        </div>
      </div>

      {/* Loading State */}
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-blue-950 to-purple-950 z-40">
          <div className="text-center">
            <Loader2 className="h-12 w-12 animate-spin text-white mx-auto mb-4" data-testid="loader-video" />
            <p className="text-white text-lg">Loading induction video...</p>
          </div>
        </div>
      )}

      {/* Error State */}
      {hasError && (
        <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-red-950 to-purple-950 z-40">
          <div className="text-center p-8">
            <h2 className="text-white text-2xl font-bold mb-4">Unable to Load Video</h2>
            <p className="text-white/80 mb-6">The induction video could not be loaded. Please try generating it again.</p>
            <Button onClick={handleBack} className="bg-white text-black hover:bg-gray-200" data-testid="button-back-error">
              Back to Settings
            </Button>
          </div>
        </div>
      )}

      {/* Full-Screen Induction Iframe — uses srcdoc so content is always fresh */}
      {!isLoading && !hasError && htmlContent && (
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
