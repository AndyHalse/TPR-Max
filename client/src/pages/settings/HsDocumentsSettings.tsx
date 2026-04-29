import GlassCard from "@/components/GlassCard";
import { ScrollText } from "lucide-react";

export default function HsDocumentsSettings() {
  return (
    <div className="space-y-6">
      <GlassCard className="p-6">
        <div className="flex items-center gap-2 mb-4">
          <ScrollText className="w-5 h-5 text-muted-foreground" />
          <h3 className="text-lg font-semibold text-fixed">H&S Documents</h3>
        </div>
        <p className="text-sm text-muted-foreground">
          Health &amp; Safety document management settings will appear here.
        </p>
      </GlassCard>
    </div>
  );
}
