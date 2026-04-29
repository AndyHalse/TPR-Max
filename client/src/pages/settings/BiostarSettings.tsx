import GlassCard from "@/components/GlassCard";
import { Server } from "lucide-react";

export default function BiostarSettings() {
  return (
    <div className="space-y-6">
      <GlassCard className="p-6">
        <div className="flex items-center gap-2 mb-4">
          <Server className="w-5 h-5 text-muted-foreground" />
          <h3 className="text-lg font-semibold text-fixed">BioStar Integration</h3>
        </div>
        <p className="text-sm text-muted-foreground">
          BioStar 2 access control integration settings will appear here.
        </p>
      </GlassCard>
    </div>
  );
}
