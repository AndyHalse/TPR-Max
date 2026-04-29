import GlassCard from "@/components/GlassCard";
import { Bell } from "lucide-react";

export default function LoneWorkerSettings() {
  return (
    <div className="space-y-6">
      <GlassCard className="p-6">
        <div className="flex items-center gap-2 mb-4">
          <Bell className="w-5 h-5 text-muted-foreground" />
          <h3 className="text-lg font-semibold text-fixed">Lone Worker</h3>
        </div>
        <p className="text-sm text-muted-foreground">
          Lone worker monitoring and alert settings will appear here.
        </p>
      </GlassCard>
    </div>
  );
}
