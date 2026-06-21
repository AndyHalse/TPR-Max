import { useEffect } from "react";

export default function TprVideoPage() {
  useEffect(() => {
    window.location.replace("/tpr-brand-video.html");
  }, []);

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center">
      <div className="text-slate-400 text-sm animate-pulse">Loading brand video…</div>
    </div>
  );
}
