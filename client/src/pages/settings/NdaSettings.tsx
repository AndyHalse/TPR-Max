import { useSettingsAutoSave } from "@/hooks/useSettingsAutoSave";
import { useToast } from "@/hooks/use-toast";
import GlassCard from "@/components/GlassCard";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PenLine, Info, Users, HardHat, FileText } from "lucide-react";
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "@/components/ui/tooltip";

const DEFAULT_NDA = `# Non-Disclosure Agreement (NDA)

**CONFIDENTIAL — VISITOR NON-DISCLOSURE AGREEMENT**

This Non-Disclosure Agreement ("Agreement") is entered into between **[Company Name]** ("the Company") and the undersigned visitor ("Visitor") on the date of visit.

## 1. Confidential Information

During your visit, you may be exposed to information that is proprietary and confidential to the Company, including but not limited to:

- Business strategies, plans, and financial information
- Technical data, trade secrets, and know-how
- Product designs, specifications, and research
- Customer lists, supplier information, and contractual arrangements
- Software, systems, and operational procedures

## 2. Visitor Obligations

By signing this Agreement, you agree to:

1. **Keep information confidential** — Not disclose, reproduce, or use any confidential information obtained during your visit for any purpose other than the intended purpose of your visit.
2. **Limit disclosure** — Not communicate confidential information to any third party without prior written consent from the Company.
3. **Use appropriate care** — Take all reasonable precautions to prevent unauthorised disclosure of confidential information.
4. **No photography or recording** — Not photograph, record, or otherwise capture any confidential information, processes, or systems without prior written permission.
5. **Return or destroy** — Upon request, promptly return or destroy any confidential materials provided during your visit.

## 3. Exclusions

These obligations do not apply to information that:

- Is or becomes publicly available through no breach of this Agreement
- Was known to you prior to your visit
- Is independently developed without reference to confidential information
- Is required to be disclosed by law or court order (with prior notice to the Company)

## 4. Duration

Your obligations under this Agreement shall continue for a period of **two (2) years** from the date of your visit.

## 5. Intellectual Property

Nothing in this Agreement grants you any rights to any intellectual property of the Company.

## 6. Governing Law

This Agreement shall be governed by and construed in accordance with the laws of England and Wales.

---

*By signing below, you confirm that you have read, understood, and agree to comply with the terms of this Non-Disclosure Agreement.*`;

export default function NdaSettings() {
  const { currentSettings, handleInputChange } = useSettingsAutoSave();
  const { toast } = useToast();

  return (
    <div className="space-y-6">
      <TooltipProvider delayDuration={200}>
        <div className="grid grid-cols-1 gap-6">
          <GlassCard className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-fixed flex items-center gap-2">
                <PenLine className="w-5 h-5" />
                Non-Disclosure Agreement (NDA)
              </h3>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <Switch
                    checked={currentSettings?.ndaEnabled || false}
                    onCheckedChange={(checked) => handleInputChange("ndaEnabled", checked)}
                    data-testid="switch-nda-enabled"
                  />
                  <Label className="text-sm font-medium text-fixed">Enable NDA</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={currentSettings?.ndaRequireSignature || false}
                    onCheckedChange={(checked) => handleInputChange("ndaRequireSignature", checked)}
                    data-testid="switch-nda-require-signature"
                  />
                  <div className="flex items-center gap-1.5">
                    <Label className="text-sm font-medium text-fixed">Require Signature</Label>
                    <Tooltip>
                      <TooltipTrigger asChild><Info size={14} className="text-variable cursor-help" /></TooltipTrigger>
                      <TooltipContent className="max-w-xs">When enabled, visitors must explicitly sign (tick a checkbox) to confirm they have read and accept the NDA before their e-Pass is issued. Recommended for legal compliance.</TooltipContent>
                    </Tooltip>
                  </div>
                </div>
              </div>
            </div>

            {currentSettings?.ndaEnabled ? (
              <div className="space-y-4">
                {/* Applies to */}
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5">
                    <Label className="text-sm font-medium text-fixed">Applies To</Label>
                    <Tooltip>
                      <TooltipTrigger asChild><Info size={14} className="text-variable cursor-help" /></TooltipTrigger>
                      <TooltipContent className="max-w-xs">Choose which person types are required to accept the NDA when checking in.</TooltipContent>
                    </Tooltip>
                  </div>
                  <Select
                    value={currentSettings?.ndaAppliesTo || "visitors"}
                    onValueChange={(val) => handleInputChange("ndaAppliesTo", val)}
                  >
                    <SelectTrigger className="w-56" data-testid="select-nda-applies-to">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="visitors">
                        <span className="flex items-center gap-2"><Users size={14} />Visitors only</span>
                      </SelectItem>
                      <SelectItem value="contractors">
                        <span className="flex items-center gap-2"><HardHat size={14} />Contractors only</span>
                      </SelectItem>
                      <SelectItem value="both">
                        <span className="flex items-center gap-2"><FileText size={14} />Visitors &amp; Contractors</span>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* NDA Content */}
                <div className="space-y-2">
                  <Label className="text-sm font-medium text-fixed">
                    NDA Content (Markdown supported)
                  </Label>
                  <textarea
                    value={currentSettings?.ndaContent || ""}
                    onChange={(e) => handleInputChange("ndaContent", e.target.value)}
                    className="w-full h-96 px-4 py-3 rounded-xl border border-white/30 dark:border-slate-700/30 bg-white/50 dark:bg-slate-800/50 focus:outline-none focus:ring-2 focus:ring-blue-500 text-fixed font-mono text-sm"
                    placeholder="Enter your NDA text here. Markdown formatting is supported..."
                    data-testid="textarea-nda-content"
                  />
                  <p className="text-xs text-variable">
                    The NDA will be presented to visitors during check-in or pre-registration. Markdown formatting is supported for headings, bold, lists, etc.
                  </p>
                </div>

                {/* Demo NDA template */}
                <div className="p-4 bg-blue-50 dark:bg-blue-950/30 rounded-xl border border-blue-200 dark:border-blue-800">
                  <h4 className="text-sm font-semibold text-blue-900 dark:text-blue-200 mb-2">Standard NDA Template Available</h4>
                  <p className="text-xs text-blue-700 dark:text-blue-400 mb-3">
                    Load a pre-built standard NDA template covering confidentiality, intellectual property, and governing law under English and Welsh law. Customise to suit your organisation.
                  </p>
                  <ul className="text-xs text-blue-600 dark:text-blue-400 space-y-1 list-disc list-inside mb-3">
                    <li>Confidential information definition</li>
                    <li>Visitor obligations and restrictions</li>
                    <li>Exclusions and exceptions</li>
                    <li>2-year confidentiality period</li>
                    <li>Governing law (England and Wales)</li>
                  </ul>
                  <Button
                    onClick={() => {
                      handleInputChange("ndaContent", DEFAULT_NDA);
                      toast({
                        title: "NDA Template Loaded",
                        description: "A standard NDA template has been loaded. Customise it with your company name and specific requirements.",
                      });
                    }}
                    variant="outline"
                    size="sm"
                  >
                    Load Standard NDA Template
                  </Button>
                </div>

                {/* Preview info */}
                {currentSettings?.ndaContent && (
                  <div className="p-3 bg-green-50 dark:bg-green-950/30 rounded-lg border border-green-200 dark:border-green-800">
                    <p className="text-xs text-green-800 dark:text-green-300 font-medium">
                      ✓ NDA content saved — {currentSettings.ndaContent.length.toLocaleString()} characters
                      {currentSettings?.ndaRequireSignature
                        ? " · Signature required before check-in"
                        : " · Displayed as information only (no signature required)"}
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-8 text-variable">
                <PenLine className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p className="text-sm">NDA is disabled. Enable it above to configure your Non-Disclosure Agreement.</p>
              </div>
            )}
          </GlassCard>
        </div>
      </TooltipProvider>
    </div>
  );
}
