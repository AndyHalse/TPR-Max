import { useSettingsAutoSave } from "@/hooks/useSettingsAutoSave";
import GlassCard from "@/components/GlassCard";
import { ObjectUploader } from "@/components/ObjectUploader";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { Building2, Upload, Info } from "lucide-react";

export default function GeneralSettings() {
  const { currentSettings, handleInputChange } = useSettingsAutoSave();
  const { toast } = useToast();

  const handleLogoUpload = (objectPath: string) => {
    try {
      const logoUrl = objectPath.replace('/objects', '');
      handleInputChange("logoUrl", logoUrl);
      toast({ title: "Success", description: "Logo uploaded successfully!" });
    } catch {
      toast({ title: "Error", description: "Failed to save logo", variant: "destructive" });
    }
  };

  return (
    <div className="space-y-6">
<div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
  <GlassCard>
    <div className="flex items-center mb-6">
      <Building2 className="mr-3 text-blue-600 dark:text-blue-400" size={24} />
      <h3 className="text-lg font-semibold text-fixed">Company Information</h3>
    </div>
    
    <TooltipProvider delayDuration={200}>
    <div className="space-y-4">
      <div className="space-y-2">
        <div className="flex items-center gap-1.5">
          <Label htmlFor="companyName" className="text-sm font-medium text-variable">Company Name</Label>
          <Tooltip>
            <TooltipTrigger asChild><Info size={14} className="text-variable cursor-help" /></TooltipTrigger>
            <TooltipContent className="max-w-xs">Displayed on all visitor ID passes and printed badges. Keep it short enough to fit on a pass card.</TooltipContent>
          </Tooltip>
        </div>
        <Input
          id="companyName"
          type="text"
          value={currentSettings?.companyName || ""}
          onChange={(e) => handleInputChange("companyName", e.target.value)}
          className="w-full px-4 py-3 rounded-xl border border-white/30 dark:border-slate-700/30 bg-white/50 dark:bg-slate-800/50 focus:outline-none focus:ring-2 focus:ring-blue-500 text-fixed"
          data-testid="input-company-name"
        />
      </div>
      
      <div className="space-y-2">
        <div className="flex items-center gap-1.5">
          <Label htmlFor="address" className="text-sm font-medium text-fixed">Registered Address</Label>
          <Tooltip>
            <TooltipTrigger asChild><Info size={14} className="text-variable cursor-help" /></TooltipTrigger>
            <TooltipContent className="max-w-xs">Your company's registered address. This appears in the header of CDM PDF reports.</TooltipContent>
          </Tooltip>
        </div>
        <Textarea
          id="address"
          value={currentSettings?.address || ""}
          onChange={(e) => handleInputChange("address", e.target.value)}
          className="w-full px-4 py-3 rounded-xl border border-white/30 dark:border-slate-700/30 bg-white/50 dark:bg-slate-800/50 focus:outline-none focus:ring-2 focus:ring-blue-500 text-fixed resize-none"
          placeholder={"e.g.\n123 Business Park\nManchester\nM1 1AA"}
          rows={4}
          data-testid="input-company-address"
        />
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="phone" className="text-sm font-medium text-fixed">
            Phone Number
          </Label>
          <Input
            id="phone"
            type="tel"
            value={currentSettings?.phone || ""}
            onChange={(e) => handleInputChange("phone", e.target.value)}
            className="w-full px-4 py-3 rounded-xl border border-white/30 dark:border-slate-700/30 bg-white/50 dark:bg-slate-800/50 focus:outline-none focus:ring-2 focus:ring-blue-500 text-fixed"
            placeholder=""
            data-testid="input-company-phone"
          />
        </div>
        
        <div className="space-y-2">
          <div className="flex items-center gap-1.5">
            <Label htmlFor="email" className="text-sm font-medium text-fixed">Company Email</Label>
            <Tooltip>
              <TooltipTrigger asChild><Info size={14} className="text-variable cursor-help" /></TooltipTrigger>
              <TooltipContent className="max-w-xs">Your company's main contact email address. This is shown on visitor passes and used as the reply-to address on outbound emails. Configure dedicated sender details in the Email tab.</TooltipContent>
            </Tooltip>
          </div>
          <Input
            id="email"
            type="email"
            value={currentSettings?.email || ""}
            onChange={(e) => handleInputChange("email", e.target.value)}
            className="w-full px-4 py-3 rounded-xl border border-white/30 dark:border-slate-700/30 bg-white/50 dark:bg-slate-800/50 focus:outline-none focus:ring-2 focus:ring-blue-500 text-fixed"
            placeholder=""
            data-testid="input-company-email"
          />
        </div>
      </div>
      
      <div className="space-y-2">
        <Label htmlFor="website" className="text-sm font-medium text-fixed">
          Company Website
        </Label>
        <Input
          id="website"
          type="url"
          value={currentSettings?.website || ""}
          onChange={(e) => handleInputChange("website", e.target.value)}
          className="w-full px-4 py-3 rounded-xl border border-white/30 dark:border-slate-700/30 bg-white/50 dark:bg-slate-800/50 focus:outline-none focus:ring-2 focus:ring-blue-500 text-fixed"
          placeholder=""
          data-testid="input-company-website"
        />
      </div>
      <div className="space-y-2">
        <div className="flex items-center gap-1.5">
          <Label htmlFor="cdmAlertsEmail" className="text-sm font-medium text-fixed">CDM Alerts Email</Label>
          <Tooltip>
            <TooltipTrigger asChild><Info size={14} className="text-variable cursor-help" /></TooltipTrigger>
            <TooltipContent className="max-w-xs">Email address that receives CDM F10 alert notifications. If left blank, alerts are sent to the Company Email above. Use this to direct CDM alerts to a dedicated safety officer or separate inbox.</TooltipContent>
          </Tooltip>
        </div>
        <Input
          id="cdmAlertsEmail"
          type="email"
          value={currentSettings?.cdmAlertsEmail || ""}
          onChange={(e) => handleInputChange("cdmAlertsEmail", e.target.value)}
          className="w-full px-4 py-3 rounded-xl border border-white/30 dark:border-slate-700/30 bg-white/50 dark:bg-slate-800/50 focus:outline-none focus:ring-2 focus:ring-blue-500 text-fixed"
          placeholder="e.g. safety@company.com"
          data-testid="input-cdm-alerts-email"
        />
      </div>
      
      <div className="space-y-2">
        <div className="flex items-center gap-1.5">
          <Label className="text-sm font-medium text-fixed">Company Logo</Label>
          <Tooltip>
            <TooltipTrigger asChild><Info size={14} className="text-variable cursor-help" /></TooltipTrigger>
            <TooltipContent className="max-w-xs">Your logo appears on visitor ID passes, emails, and the kiosk check-in screen. PNG or SVG with a transparent background works best. Max 2 MB.</TooltipContent>
          </Tooltip>
        </div>
        <div className="space-y-4">
          {currentSettings?.logoUrl && (
            <div className="flex items-center justify-center p-4 bg-white/50 dark:bg-slate-800/50 rounded-xl border border-white/30 dark:border-slate-700/30">
              <img 
                src={`/api/company-logo?t=${encodeURIComponent(currentSettings.logoUrl)}`}
                alt="Company Logo" 
                className="max-h-20 max-w-40 object-contain"
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                }}
              />
            </div>
          )}
          <ObjectUploader
            onUploadComplete={handleLogoUpload}
            accept="image/*"
            maxSize={2 * 1024 * 1024}
            buttonClassName="w-full"
          >
            <Upload className="mr-2" size={16} />
            {currentSettings?.logoUrl ? "Replace Logo" : "Upload Logo"}
          </ObjectUploader>
          <p className="text-xs text-variable">Recommended: PNG or SVG, max 2MB</p>
        </div>
      </div>
    </div>
    </TooltipProvider>
  </GlassCard>
</div>

    </div>
  );
}
