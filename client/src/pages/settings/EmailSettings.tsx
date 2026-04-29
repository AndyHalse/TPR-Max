import { useState } from "react";
import { useSettingsAutoSave } from "@/hooks/useSettingsAutoSave";
import GlassCard from "@/components/GlassCard";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Mail, Send, AtSign, Server, Settings2, Globe, CheckCircle, XCircle, TestTube, Zap, Info, Key, Loader2, Shield } from "lucide-react";
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "@/components/ui/tooltip";

export default function EmailSettings() {
  const { currentSettings, handleInputChange } = useSettingsAutoSave();
  const { toast } = useToast();
  const [formData, setFormData] = useState<{ smtpPassword?: string }>({});

  const testEmailMutation = useMutation({
    mutationFn: async (email: string) => {
      const response = await apiRequest("POST", "/api/test-email", { email });
      return response.json();
    },
    onSuccess: (data) => {
      if (data.success) {
        toast({ title: "Email Sent", description: "Test email delivered successfully — your SMTP configuration is working." });
      } else {
        toast({ title: "Email Test Failed", description: data.error || "Failed to send test email.", variant: "destructive" });
      }
    },
    onError: () => {
      toast({ title: "Email Test Failed", description: "Could not reach the server. Please try again.", variant: "destructive" });
    },
  });

  return (
    <div className="space-y-6">
<GlassCard>
  <div className="flex items-center mb-6">
    <Mail className="mr-3 text-blue-600 dark:text-blue-400" size={24} />
    <h3 className="text-lg font-semibold text-fixed">SMTP Email Configuration</h3>
  </div>
  <TooltipProvider delayDuration={200}>
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div className="space-y-4">
        <div className="space-y-2">
          <div className="flex items-center gap-1.5">
            <Label className="text-sm font-medium text-fixed">SMTP Server Host</Label>
            <Tooltip>
              <TooltipTrigger asChild>
                <Info size={14} className="text-variable cursor-help" />
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                The outgoing mail server address provided by your email host. Check your email provider's documentation for the correct hostname.
              </TooltipContent>
            </Tooltip>
          </div>
          <Input
            type="text"
            placeholder="e.g. smtp.ionos.co.uk or smtp.gmail.com"
            value={currentSettings?.smtpHost || ""}
            onChange={(e) => handleInputChange("smtpHost", e.target.value)}
            className="w-full px-4 py-3 rounded-xl border border-white/30 dark:border-slate-700/30 bg-white/50 dark:bg-slate-800/50"
            data-testid="input-smtp-host"
          />
        </div>
        <div className="space-y-2">
          <div className="flex items-center gap-1.5">
            <Label className="text-sm font-medium text-fixed">SMTP Port</Label>
            <Tooltip>
              <TooltipTrigger asChild>
                <Info size={14} className="text-variable cursor-help" />
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                Port 587 (STARTTLS) is recommended for most providers. Use 465 only if your provider requires SSL/TLS on connection. Avoid port 25 as it is often blocked.
              </TooltipContent>
            </Tooltip>
          </div>
          <Select
            value={currentSettings?.smtpPort || "587"}
            onValueChange={(value) => handleInputChange("smtpPort", value)}
          >
            <SelectTrigger data-testid="select-smtp-port">
              <SelectValue placeholder="Select SMTP port" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="25">25 (Standard, Non-encrypted)</SelectItem>
              <SelectItem value="587">587 (STARTTLS - Recommended)</SelectItem>
              <SelectItem value="465">465 (SSL/TLS)</SelectItem>
              <SelectItem value="2525">2525 (Alternative)</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-variable">Port 587 with STARTTLS is recommended for most providers</p>
        </div>
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-1.5">
              <Label className="text-sm font-medium text-fixed">Use SSL/TLS Encryption</Label>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info size={14} className="text-variable cursor-help" />
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  Enable this if your provider uses port 465 (SSL/TLS). Leave off for port 587 (STARTTLS), which upgrades the connection automatically after connecting.
                </TooltipContent>
              </Tooltip>
            </div>
            <p className="text-xs text-variable">Secure connection (recommended)</p>
          </div>
          <Switch
            checked={currentSettings?.smtpSecurity === "SSL/TLS"}
            onCheckedChange={(checked) => handleInputChange("smtpSecurity", checked ? "SSL/TLS" : "STARTTLS")}
            data-testid="switch-smtp-secure"
          />
        </div>
      </div>
      <div className="space-y-4">
        <div className="space-y-2">
          <div className="flex items-center gap-1.5">
            <Label className="text-sm font-medium text-fixed">Email Username</Label>
            <Tooltip>
              <TooltipTrigger asChild>
                <Info size={14} className="text-variable cursor-help" />
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                Usually your full email address (e.g. noreply@yourcompany.com). This is the account that will send all system emails including visitor passes and alerts.
              </TooltipContent>
            </Tooltip>
          </div>
          <Input
            type="email"
            placeholder="e.g. noreply@yourcompany.com"
            value={currentSettings?.smtpUsername || ""}
            onChange={(e) => handleInputChange("smtpUsername", e.target.value)}
            className="w-full px-4 py-3 rounded-xl border border-white/30 dark:border-slate-700/30 bg-white/50 dark:bg-slate-800/50"
            data-testid="input-smtp-username"
          />
          <p className="text-xs text-variable">Usually your full email address</p>
        </div>
        <div className="space-y-2">
          <div className="flex items-center gap-1.5">
            <Label className="text-sm font-medium text-fixed">Email Password</Label>
            <Tooltip>
              <TooltipTrigger asChild>
                <Info size={14} className="text-variable cursor-help" />
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                For Gmail and Outlook, you must use an App Password — not your normal account password. Generate one in your account's security settings with 2FA enabled.
              </TooltipContent>
            </Tooltip>
          </div>
          <Input
            type="password"
            placeholder={currentSettings?.smtpPasswordSet && !formData.smtpPassword ? "Password saved — leave blank to keep it" : "Your email password or app-specific password"}
            value={formData.smtpPassword || ""}
            onChange={(e) => { setFormData(prev => ({ ...prev, smtpPassword: e.target.value })); handleInputChange("smtpPassword", e.target.value); }}
            className="w-full px-4 py-3 rounded-xl border border-white/30 dark:border-slate-700/30 bg-white/50 dark:bg-slate-800/50"
            data-testid="input-smtp-password"
          />
          {currentSettings?.smtpPasswordSet && !formData.smtpPassword && (
            <p className="text-xs text-green-600 dark:text-green-400">✓ Password is saved — type a new one only if you want to change it</p>
          )}
          {(!currentSettings?.smtpPasswordSet || formData.smtpPassword) && (
            <p className="text-xs text-variable">Use app-specific password for Gmail/Outlook</p>
          )}
        </div>
        <div className="space-y-2">
          <div className="flex items-center gap-1.5">
            <Label className="text-sm font-medium text-fixed">From Name (Display Name)</Label>
            <Tooltip>
              <TooltipTrigger asChild>
                <Info size={14} className="text-variable cursor-help" />
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                The sender name recipients will see in their inbox. Use something recognisable for your company, e.g. "Acme Ltd Visitor System" or "TPR Max Notifications".
              </TooltipContent>
            </Tooltip>
          </div>
          <Input
            type="text"
            placeholder="e.g. Acme Ltd Visitor System"
            value={currentSettings?.smtpFromName || ""}
            onChange={(e) => handleInputChange("smtpFromName", e.target.value)}
            className="w-full px-4 py-3 rounded-xl border border-white/30 dark:border-slate-700/30 bg-white/50 dark:bg-slate-800/50"
            data-testid="input-smtp-from-name"
          />
          <p className="text-xs text-variable">The name that appears as the sender</p>
        </div>
      </div>
    </div>
  </TooltipProvider>
  <div className="mt-6 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
    <h4 className="font-medium text-blue-800 dark:text-blue-200 mb-2">📧 Common SMTP Providers:</h4>
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm text-blue-700 dark:text-blue-300">
      <div>
        <strong>IONOS (1&1):</strong>
        <ul className="ml-4 list-disc">
          <li>Host: smtp.ionos.co.uk</li>
          <li>Port: 587 (STARTTLS)</li>
        </ul>
      </div>
      <div>
        <strong>Gmail:</strong>
        <ul className="ml-4 list-disc">
          <li>Host: smtp.gmail.com</li>
          <li>Port: 587 (STARTTLS)</li>
        </ul>
      </div>
      <div>
        <strong>Outlook/Hotmail:</strong>
        <ul className="ml-4 list-disc">
          <li>Host: smtp.live.com</li>
          <li>Port: 587 (STARTTLS)</li>
        </ul>
      </div>
      <div>
        <strong>SendGrid:</strong>
        <ul className="ml-4 list-disc">
          <li>Host: smtp.sendgrid.net</li>
          <li>Port: 587 (STARTTLS)</li>
        </ul>
      </div>
    </div>
  </div>
</GlassCard>
<div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
  <GlassCard>
    <div className="flex items-center mb-6">
      <TestTube className="mr-3 text-blue-600 dark:text-blue-400" size={24} />
      <h3 className="text-lg font-semibold text-fixed">Test Email Configuration</h3>
    </div>
    
    <div className="space-y-4">
      <div className="space-y-2">
        <Label className="text-sm font-medium text-fixed">
          Test Email Address
        </Label>
        <Input
          type="email"
          placeholder="Enter email address to test"
          className="w-full px-4 py-3 rounded-xl border border-white/30 dark:border-slate-700/30 bg-white/50 dark:bg-slate-800/50"
          data-testid="input-test-email"
        />
      </div>
      <Button
        onClick={() => {
          const testEmailInput = document.querySelector('[data-testid="input-test-email"]') as HTMLInputElement;
          const testEmail = testEmailInput?.value;
          
          if (!testEmail) {
            toast({
              title: "Email Required",
              description: "Please enter an email address to test",
              variant: "destructive",
            });
            return;
          }
          testEmailMutation.mutate(testEmail);
        }}
        disabled={testEmailMutation.isPending}
        className="gradient-blue text-white w-full"
        data-testid="button-send-test-email"
      >
        <Mail className="mr-2" size={16} />
        {testEmailMutation.isPending ? 'Sending...' : 'Send Test Email'}
      </Button>
    </div>
  </GlassCard>
  <GlassCard>
    <div className="flex items-center mb-6">
      <Shield className="mr-3 text-amber-600 dark:text-amber-400" size={24} />
      <h3 className="text-lg font-semibold text-fixed">Prevent Emails Going to Junk</h3>
    </div>
    
    <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-xl p-4 space-y-3">
      <h4 className="font-semibold text-amber-900">Important: Email Deliverability Tips</h4>
      <div className="text-sm text-amber-800 dark:text-amber-300 space-y-2">
        <p className="font-medium">To prevent e-Pass emails going to junk/spam folders:</p>
        <ol className="list-decimal list-inside space-y-1 ml-2">
          <li><strong>SPF Record:</strong> Add VisiGate server IP to your domain's SPF record</li>
          <li><strong>DKIM Signing:</strong> Enable DKIM authentication in your email provider</li>
          <li><strong>From Address:</strong> Use an email from your verified domain (not generic providers)</li>
          <li><strong>Whitelist:</strong> Ask recipients to add {currentSettings?.smtpUsername || 'your email'} to contacts</li>
          <li><strong>Reply-To:</strong> Set a monitored reply-to address below</li>
        </ol>
        <div className="mt-3 p-2 bg-white rounded border border-amber-200 dark:border-amber-800">
          <p className="text-xs font-mono">SPF Example: v=spf1 include:_spf.ionos.com ~all</p>
        </div>
      </div>
    </div>
  </GlassCard>
  <GlassCard>
    <div className="flex items-center mb-6">
      <Send className="mr-3 text-green-600" size={24} />
      <h3 className="text-lg font-semibold text-fixed">📊 Email Reports Settings</h3>
    </div>
    
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <Label className="text-sm font-medium text-fixed">
            Enable Automatic Reports
          </Label>
          <p className="text-xs text-variable">Send reports automatically via email</p>
        </div>
        <Switch
          checked={currentSettings?.emailReportsEnabled || false}
          onCheckedChange={(checked) => handleInputChange("emailReportsEnabled", checked)}
          data-testid="switch-email-reports"
        />
      </div>
      
      {currentSettings?.emailReportsEnabled && (
        <div className="space-y-4 mt-4 p-4 bg-blue-50 dark:bg-blue-950/30 rounded-lg">
          <div className="space-y-2">
            <Label className="text-sm font-medium text-fixed">
              Report Type & Frequency
            </Label>
            <Select 
              value={currentSettings?.reportFrequency || "weekly"} 
              onValueChange={(value) => handleInputChange("reportFrequency", value)}
            >
              <SelectTrigger data-testid="select-report-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="daily">Daily Report</SelectItem>
                <SelectItem value="weekly">Weekly Report</SelectItem>
                <SelectItem value="monthly">Monthly Report</SelectItem>
                <SelectItem value="visitor_analysis">Visitor Analysis</SelectItem>
                <SelectItem value="staff_attendance">Staff Attendance</SelectItem>
                <SelectItem value="contractor_safety">Contractor Safety</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label className="text-sm font-medium text-fixed">
              Recipients
            </Label>
            <Input
              type="email"
              placeholder=""
              value={Array.isArray(currentSettings?.reportRecipients) 
                ? currentSettings.reportRecipients.join(", ") 
                : currentSettings?.reportRecipients || ""
              }
              onChange={(e) => {
                // Convert comma-separated string to array
                const emails = e.target.value
                  .split(",")
                  .map(email => email.trim())
                  .filter(email => email.length > 0);
                handleInputChange("reportRecipients", emails);
              }}
              className="w-full"
              data-testid="input-report-recipients"
            />
          </div>
        </div>
      )}
    </div>
  </GlassCard>
</div>

    </div>
  );
}
