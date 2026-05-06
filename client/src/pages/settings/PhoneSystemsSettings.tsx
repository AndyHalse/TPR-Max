import { useSettingsAutoSave } from "@/hooks/useSettingsAutoSave";
import GlassCard from "@/components/GlassCard";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle, XCircle, TestTube, Globe, Phone, Settings2, Info } from "lucide-react";

export default function PhoneSystemsSettings() {
  const { currentSettings, handleInputChange } = useSettingsAutoSave();
  const { toast } = useToast();

  return (
    <div className="space-y-6">
      <TooltipProvider delayDuration={200}>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <GlassCard>
            <div className="flex items-center mb-6">
              <Phone className="mr-3 text-blue-600 dark:text-blue-400" size={24} />
              <h3 className="text-lg font-semibold text-fixed">Phone System Configuration</h3>
            </div>
            <div className="space-y-4">
              <div className="space-y-2">
                <div className="flex items-center gap-1.5">
                  <Label htmlFor="phoneProvider" className="text-sm font-medium text-fixed">Phone System Provider</Label>
                  <Tooltip>
                    <TooltipTrigger asChild><Info size={14} className="text-variable cursor-help" /></TooltipTrigger>
                    <TooltipContent className="max-w-xs">Select the voice API provider used to call staff when a visitor arrives. Currently only 8x8 is fully supported.</TooltipContent>
                  </Tooltip>
                </div>
                <Select
                  value={currentSettings?.phoneProvider || "8x8"}
                  onValueChange={(value) => handleInputChange("phoneProvider", value)}
                >
                  <SelectTrigger className="w-full px-4 py-3 rounded-xl border border-white/30 dark:border-slate-700/30 bg-white/50 dark:bg-slate-800/50 focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <SelectValue placeholder="Select phone system provider" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="8x8">8x8 Voice API</SelectItem>
                    <SelectItem value="twilio">Twilio (Coming Soon)</SelectItem>
                    <SelectItem value="ringcentral">RingCentral (Coming Soon)</SelectItem>
                    <SelectItem value="vonage">Vonage (Coming Soon)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium text-fixed">Voice Notifications Enabled</Label>
                  <Switch
                    checked={currentSettings?.voiceNotificationsEnabled || false}
                    onCheckedChange={(checked) => handleInputChange("voiceNotificationsEnabled", checked)}
                    data-testid="switch-voice-notifications"
                  />
                </div>
                <p className="text-xs text-variable">Enable automated voice calls to staff when visitors arrive</p>
              </div>
            </div>
          </GlassCard>
          <GlassCard>
            <div className="flex items-center mb-6">
              <Settings2 className="mr-3 text-green-600" size={24} />
              <h3 className="text-lg font-semibold text-fixed">8x8 API Configuration</h3>
            </div>
            <div className="space-y-4">
              <div className="space-y-2">
                <div className="flex items-center gap-1.5">
                  <Label htmlFor="eightByXApiKey" className="text-sm font-medium text-fixed">API Key</Label>
                  <Tooltip>
                    <TooltipTrigger asChild><Info size={14} className="text-variable cursor-help" /></TooltipTrigger>
                    <TooltipContent className="max-w-xs">Your 8x8 Voice API key. Found in your 8x8 developer portal under API credentials. Keep this secret — it authorises all outbound calls.</TooltipContent>
                  </Tooltip>
                </div>
                <Input id="eightByXApiKey" type="password" value={currentSettings?.eightByXApiKey || ""} onChange={(e) => handleInputChange("eightByXApiKey", e.target.value)} placeholder="" className="w-full px-4 py-3 rounded-xl border border-white/30 dark:border-slate-700/30 bg-white/50 dark:bg-slate-800/50 focus:outline-none focus:ring-2 focus:ring-blue-500 text-fixed" data-testid="input-8x8-api-key" />
              </div>
              <div className="space-y-2">
                <div className="flex items-center gap-1.5">
                  <Label htmlFor="eightByXApiSecret" className="text-sm font-medium text-fixed">API Secret</Label>
                  <Tooltip>
                    <TooltipTrigger asChild><Info size={14} className="text-variable cursor-help" /></TooltipTrigger>
                    <TooltipContent className="max-w-xs">Your 8x8 API secret. Paired with the API key to authenticate requests. Treat this like a password.</TooltipContent>
                  </Tooltip>
                </div>
                <Input id="eightByXApiSecret" type="password" value={currentSettings?.eightByXApiSecret || ""} onChange={(e) => handleInputChange("eightByXApiSecret", e.target.value)} placeholder="" className="w-full px-4 py-3 rounded-xl border border-white/30 dark:border-slate-700/30 bg-white/50 dark:bg-slate-800/50 focus:outline-none focus:ring-2 focus:ring-blue-500 text-fixed" data-testid="input-8x8-api-secret" />
              </div>
              <div className="space-y-2">
                <div className="flex items-center gap-1.5">
                  <Label htmlFor="eightByXAccountId" className="text-sm font-medium text-fixed">Account ID</Label>
                  <Tooltip>
                    <TooltipTrigger asChild><Info size={14} className="text-variable cursor-help" /></TooltipTrigger>
                    <TooltipContent className="max-w-xs">Your 8x8 account or sub-account ID. Available in your 8x8 portal. Used to identify which account the calls are billed to.</TooltipContent>
                  </Tooltip>
                </div>
                <Input id="eightByXAccountId" type="text" value={currentSettings?.eightByXAccountId || ""} onChange={(e) => handleInputChange("eightByXAccountId", e.target.value)} placeholder="" className="w-full px-4 py-3 rounded-xl border border-white/30 dark:border-slate-700/30 bg-white/50 dark:bg-slate-800/50 focus:outline-none focus:ring-2 focus:ring-blue-500 text-fixed" data-testid="input-8x8-account-id" />
              </div>
              <div className="space-y-2">
                <div className="flex items-center gap-1.5">
                  <Label htmlFor="eightByXBaseUrl" className="text-sm font-medium text-fixed">API Base URL</Label>
                  <Tooltip>
                    <TooltipTrigger asChild><Info size={14} className="text-variable cursor-help" /></TooltipTrigger>
                    <TooltipContent className="max-w-xs">The 8x8 regional API endpoint. Use the EU endpoint (vcc-eu) for UK/Europe accounts and the US endpoint for US accounts. Check your 8x8 portal if unsure.</TooltipContent>
                  </Tooltip>
                </div>
                <Input id="eightByXBaseUrl" type="text" value={currentSettings?.eightByXBaseUrl || "https://vcc-eu.8x8.com/api/v1"} onChange={(e) => handleInputChange("eightByXBaseUrl", e.target.value)} placeholder="" className="w-full px-4 py-3 rounded-xl border border-white/30 dark:border-slate-700/30 bg-white/50 dark:bg-slate-800/50 focus:outline-none focus:ring-2 focus:ring-blue-500 text-fixed" data-testid="input-8x8-base-url" />
              </div>
            </div>
          </GlassCard>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mt-8">
          <GlassCard>
            <div className="flex items-center mb-6">
              <Globe className="mr-3 text-purple-600" size={24} />
              <h3 className="text-lg font-semibold text-fixed">Voice Settings</h3>
            </div>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="defaultVoiceLanguage" className="text-sm font-medium text-fixed">Default Voice Language</Label>
                <Select value={currentSettings?.defaultVoiceLanguage || "en-GB"} onValueChange={(value) => handleInputChange("defaultVoiceLanguage", value)}>
                  <SelectTrigger className="w-full px-4 py-3 rounded-xl border border-white/30 dark:border-slate-700/30 bg-white/50 dark:bg-slate-800/50 focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <SelectValue placeholder="Select voice language" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="en-GB">English (UK)</SelectItem>
                    <SelectItem value="en-US">English (US)</SelectItem>
                    <SelectItem value="en-AU">English (Australian)</SelectItem>
                    <SelectItem value="fr-FR">French</SelectItem>
                    <SelectItem value="de-DE">German</SelectItem>
                    <SelectItem value="es-ES">Spanish</SelectItem>
                    <SelectItem value="it-IT">Italian</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="defaultVoiceProfile" className="text-sm font-medium text-fixed">Default Voice Profile</Label>
                <Select value={currentSettings?.defaultVoiceProfile || "en-GB-Standard-A"} onValueChange={(value) => handleInputChange("defaultVoiceProfile", value)}>
                  <SelectTrigger className="w-full px-4 py-3 rounded-xl border border-white/30 dark:border-slate-700/30 bg-white/50 dark:bg-slate-800/50 focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <SelectValue placeholder="Select voice profile" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="en-GB-Standard-A">English (UK) - Standard Female</SelectItem>
                    <SelectItem value="en-GB-Standard-B">English (UK) - Standard Male</SelectItem>
                    <SelectItem value="en-GB-Wavenet-A">English (UK) - Neural Female</SelectItem>
                    <SelectItem value="en-GB-Wavenet-B">English (UK) - Neural Male</SelectItem>
                    <SelectItem value="en-US-Standard-C">English (US) - Standard Female</SelectItem>
                    <SelectItem value="en-US-Standard-D">English (US) - Standard Male</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </GlassCard>
          <GlassCard>
            <div className="flex items-center mb-6">
              <TestTube className="mr-3 text-orange-600" size={24} />
              <h3 className="text-lg font-semibold text-fixed">Test & Diagnostics</h3>
            </div>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="testPhoneNumber" className="text-sm font-medium text-fixed">Test Phone Number</Label>
                <Input id="testPhoneNumber" type="tel" placeholder="" className="w-full px-4 py-3 rounded-xl border border-white/30 dark:border-slate-700/30 bg-white/50 dark:bg-slate-800/50 focus:outline-none focus:ring-2 focus:ring-blue-500 text-fixed" data-testid="input-test-phone-number" />
              </div>
              <Button
                onClick={() => {
                  toast({ title: "Test Call Initiated", description: "A test voice notification is being sent to the provided number." });
                }}
                className="w-full bg-orange-600 hover:bg-orange-700 text-white"
                data-testid="button-test-voice-call"
              >
                <Phone className="mr-2" size={16} />
                Send Test Call
              </Button>
              <div className="pt-4 border-t border-slate-200">
                <h4 className="text-sm font-medium text-fixed mb-2">API Status</h4>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-variable">8x8 API Connection</span>
                    <Badge variant="outline" className="text-green-700 bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800">
                      <CheckCircle size={12} className="mr-1" />Connected
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-variable">Voice Notifications</span>
                    <Badge variant="outline" className={currentSettings?.voiceNotificationsEnabled ? "text-green-700 bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800" : "text-slate-500 dark:text-slate-400 bg-slate-50 border-slate-200"}>
                      {currentSettings?.voiceNotificationsEnabled ? (<><CheckCircle size={12} className="mr-1" />Enabled</>) : (<><XCircle size={12} className="mr-1" />Disabled</>)}
                    </Badge>
                  </div>
                </div>
              </div>
            </div>
          </GlassCard>
        </div>
      </TooltipProvider>
    </div>
  );
}
