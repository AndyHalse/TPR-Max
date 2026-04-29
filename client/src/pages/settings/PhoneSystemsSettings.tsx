import GlassCard from "@/components/GlassCard";
import { Phone } from "lucide-react";

export default function PhoneSystemsSettings() {
  return (
    <div className="space-y-6">
      <GlassCard className="p-6">
        <div className="flex items-center gap-2 mb-4">
          <Phone className="w-5 h-5 text-muted-foreground" />
          <h3 className="text-lg font-semibold text-fixed">Phone Systems</h3>
        </div>
        <p className="text-sm text-muted-foreground">
          Phone and communications integration settings will appear here.
        </p>
      </GlassCard>
    </div>
  );
}
