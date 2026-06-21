import { Play, ArrowLeft, Shield, LogIn } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function TprVideoPage() {
  return (
    <div className="min-h-screen bg-slate-950 flex flex-col">
      {/* Header */}
      <nav className="flex-shrink-0 bg-slate-900 border-b border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-4">
              <button
                onClick={() => window.location.href = "/marketing"}
                className="flex items-center gap-1.5 text-slate-400 hover:text-white transition-colors text-sm"
              >
                <ArrowLeft className="h-4 w-4" />
                Back
              </button>
              <div className="h-5 w-px bg-slate-700" />
              <div className="flex items-center gap-2">
                <Shield className="h-5 w-5 text-[#2460A9]" />
                <span className="text-white font-semibold">TPR Max</span>
                <span className="text-slate-400 text-sm hidden sm:inline">— Brand Video</span>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Button
                size="sm"
                onClick={() => window.location.href = "/marketing#contact"}
                className="bg-[#2460A9] hover:bg-[#1a4d8f] text-white hidden sm:flex"
              >
                Request Demo
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => window.location.href = "/"}
                className="border-slate-600 text-slate-300 hover:bg-slate-800 hover:text-white"
              >
                <LogIn className="h-4 w-4 mr-1" />
                Sign In
              </Button>
            </div>
          </div>
        </div>
      </nav>

      {/* Video area */}
      <div className="flex-1 flex flex-col">
        <div className="flex-1 relative">
          <iframe
            src="/tpr-brand-video.html"
            title="TPR Max Brand Video"
            className="absolute inset-0 w-full h-full border-0"
            allow="autoplay; fullscreen"
            allowFullScreen
          />
        </div>

        {/* Footer strip */}
        <div className="flex-shrink-0 bg-slate-900 border-t border-slate-800 py-4 px-6">
          <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-slate-400 text-sm">
              <Play className="h-4 w-4 text-[#2460A9]" />
              <span>TPR Max — Connected Workforce &amp; Site Safety Platform</span>
            </div>
            <div className="flex items-center gap-3">
              <Button
                size="sm"
                onClick={() => window.location.href = "/marketing#contact"}
                className="bg-[#2460A9] hover:bg-[#1a4d8f] text-white"
              >
                Request a Demo
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => window.location.href = "/marketing"}
                className="text-slate-400 hover:text-white"
              >
                Learn More
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
