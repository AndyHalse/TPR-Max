import { useSettingsAutoSave } from "@/hooks/useSettingsAutoSave";
import GlassCard from "@/components/GlassCard";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import ContractorsHSManagement from "@/components/ContractorsHSManagement";
import { DefaultTemplateManager } from "@/components/DefaultTemplateManager";
import { HardHat, FlaskConical, ScrollText, FileText, CheckCircle, XCircle, Info, Shield } from "lucide-react";
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "@/components/ui/tooltip";

export default function InductionSettings() {
  const { currentSettings, handleInputChange } = useSettingsAutoSave();

  return (
    <div className="space-y-6">
<TooltipProvider delayDuration={200}>
<div className="grid grid-cols-1 gap-6">
  <GlassCard className="p-6">
    <div className="flex items-center justify-between mb-4">
      <h3 className="text-lg font-semibold text-fixed flex items-center gap-2">
        <Shield className="w-5 h-5" />
        Health & Safety Rules
      </h3>
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <Switch
            checked={currentSettings?.hsRulesEnabled !== false}
            onCheckedChange={(checked) => handleInputChange("hsRulesEnabled", checked)}
            data-testid="switch-hs-rules-enabled"
          />
          <Label className="text-sm font-medium text-fixed">Enable H&S Rules</Label>
        </div>
        <div className="flex items-center gap-2">
          <Switch
            checked={currentSettings?.hsRulesRequireAcceptance || false}
            onCheckedChange={(checked) => handleInputChange("hsRulesRequireAcceptance", checked)}
            data-testid="switch-hs-rules-require-acceptance"
          />
          <div className="flex items-center gap-1.5">
            <Label className="text-sm font-medium text-fixed">Require Acceptance</Label>
            <Tooltip>
              <TooltipTrigger asChild><Info size={14} className="text-variable cursor-help" /></TooltipTrigger>
              <TooltipContent className="max-w-xs">When enabled, visitors must explicitly tick a checkbox to confirm they have read and accept the H&S rules before their e-Pass is issued. Recommended for legal compliance.</TooltipContent>
            </Tooltip>
          </div>
        </div>
      </div>
    </div>
    
    <div className="space-y-4">
      {currentSettings?.hsRulesEnabled !== false && (
        <>
          <div className="space-y-2">
            <Label className="text-sm font-medium text-fixed">
              H&S Rules Content (Markdown supported)
            </Label>
            <textarea
              value={currentSettings?.hsRulesContent || ""}
              onChange={(e) => handleInputChange("hsRulesContent", e.target.value)}
              className="w-full h-96 px-4 py-3 rounded-xl border border-white/30 dark:border-slate-700/30 bg-white/50 dark:bg-slate-800/50 focus:outline-none focus:ring-2 focus:ring-blue-500 text-fixed font-mono text-sm"
              placeholder="Enter your company's health and safety rules here..."
              data-testid="textarea-hs-rules-content"
            />
            <p className="text-xs text-variable">
              These rules will be included in e-Pass emails and can be shown during visitor check-in.
              Markdown formatting is supported for better presentation.
            </p>
          </div>
          <div className="space-y-2">
            <div className="flex items-center gap-1.5">
              <Label htmlFor="hsRulesUrl" className="text-sm font-medium text-fixed">External H&S Rules URL (Optional)</Label>
              <Tooltip>
                <TooltipTrigger asChild><Info size={14} className="text-variable cursor-help" /></TooltipTrigger>
                <TooltipContent className="max-w-xs">If your H&S policy is hosted on an external website (e.g. your company intranet or a PDF link), enter the URL here. Visitors will see a clickable link in their e-Pass instead of the full rules text.</TooltipContent>
              </Tooltip>
            </div>
            <Input
              id="hsRulesUrl"
              type="url"
              value={currentSettings?.hsRulesUrl || ""}
              onChange={(e) => handleInputChange("hsRulesUrl", e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-white/30 dark:border-slate-700/30 bg-white/50 dark:bg-slate-800/50"
              placeholder="https://yourcompany.com/health-safety-policy"
              data-testid="input-hs-rules-url"
            />
            <p className="text-xs text-variable">
              If provided, this link will be included in e-Pass emails instead of the full content.
            </p>
          </div>
          <div className="p-4 bg-blue-50 dark:bg-blue-950/30 rounded-xl border border-blue-200 dark:border-blue-800">
            <h4 className="text-sm font-semibold text-blue-900 mb-2">Default UK H&S Rules Available</h4>
            <p className="text-xs text-blue-700 mb-3">
              The system includes comprehensive UK Health & Safety rules compliant with:
            </p>
            <ul className="text-xs text-blue-600 dark:text-blue-400 space-y-1 list-disc list-inside">
              <li>Health and Safety at Work Act 1974</li>
              <li>Management of Health and Safety at Work Regulations 1999</li>
              <li>Workplace (Health, Safety and Welfare) Regulations 1992</li>
              <li>Personal Protective Equipment at Work Regulations 1992</li>
              <li>Manual Handling Operations Regulations 1992</li>
              <li>Control of Substances Hazardous to Health Regulations 2002</li>
            </ul>
            <Button
              onClick={() => {
                const defaultRules = `# Health & Safety Rules and Regulations\n\n## General Safety Rules\n\n1. **Personal Safety**\n   - Report to reception upon arrival and departure\n   - Wear your visitor/contractor pass at all times\n   - Follow all posted safety signs and instructions\n   - Report any accidents or near misses immediately\n\n2. **Emergency Procedures**\n   - Familiarize yourself with emergency exits\n   - In case of fire alarm, evacuate immediately via nearest exit\n   - Assembly point is located in the front car park\n   - Do not use lifts during emergencies\n   - Follow instructions from fire wardens (wearing hi-vis vests)\n\n3. **Personal Protective Equipment (PPE)**\n   - PPE must be worn where indicated by signage\n   - Safety footwear required in production/warehouse areas\n   - High visibility clothing required in designated areas\n   - Hard hats required in construction zones\n\n4. **Workplace Hazards**\n   - Watch for trip hazards and wet floors\n   - Do not enter restricted areas without authorization\n   - Keep walkways clear at all times\n   - Report any unsafe conditions to your host\n\n5. **Manual Handling**\n   - Get assistance for heavy items (over 25kg)\n   - Use proper lifting techniques\n   - Use mechanical aids where available\n\n6. **Electrical Safety**\n   - Do not use damaged electrical equipment\n   - Report exposed wires or damaged sockets\n   - Ensure trailing cables are secured\n\n7. **Working at Height**\n   - Only use approved ladders and platforms\n   - Ensure proper edge protection is in place\n   - Wear fall protection equipment when required\n\n8. **Control of Substances (COSHH)**\n   - Do not handle chemicals without authorization\n   - Follow all COSHH data sheet instructions\n   - Use appropriate PPE when handling substances\n\n9. **Machinery and Equipment**\n   - Do not operate machinery without authorization\n   - Ensure guards are in place before operation\n   - Follow lock-out/tag-out procedures\n\n10. **Welfare Facilities**\n    - First aid boxes located at reception and main office\n    - Drinking water available in kitchen areas\n    - Toilets and washing facilities available\n\n## Contractor Specific Requirements\n\n- Provide risk assessments and method statements before work\n- Ensure all tools are PAT tested and in date\n- Obtain hot work permits for welding/cutting operations\n- Follow permit to work system for hazardous tasks\n\n## COVID-19 and Health Precautions\n\n- Maintain good hand hygiene\n- Use hand sanitizer stations provided\n- Stay home if feeling unwell\n- Follow any additional health screening procedures\n\n## Compliance Statement\n\nThese rules comply with:\n- Health and Safety at Work Act 1974\n- Management of Health and Safety at Work Regulations 1999\n- Workplace (Health, Safety and Welfare) Regulations 1992\n- Personal Protective Equipment at Work Regulations 1992\n- Manual Handling Operations Regulations 1992\n- Control of Substances Hazardous to Health Regulations 2002\n\n## Contact Information\n\n**Emergency:** 999\n**Reception:** Available at main entrance\n**First Aiders:** List available at reception\n**Health & Safety Officer:** Contact via reception\n\nBy entering our premises, you agree to comply with all health and safety rules.`;
                handleInputChange("hsRulesContent", defaultRules);
                toast({
                  title: "Default H&S Rules Loaded",
                  description: "UK compliant health and safety rules have been loaded. You can customize them as needed.",
                });
              }}
              variant="outline"
              size="sm"
              className="mt-3"
            >
              Load Default UK H&S Rules
            </Button>
          </div>
        </>
      )}
      
      {currentSettings?.hsRulesEnabled === false && (
        <div className="text-center py-8 text-variable">
          <Shield className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="text-sm">H&S Rules are disabled. Enable them to configure health and safety requirements.</p>
        </div>
      )}
    </div>
  </GlassCard>
</div>
</TooltipProvider>


      {/* H&S Documents */}
      <div className="space-y-6">
<ContractorsHSManagement />

{/* Default UK H&S Document Templates Section */}
<div className="mt-8">
  <DefaultTemplateManager className="w-full" />
</div>

      </div>
    </div>
  );
}
