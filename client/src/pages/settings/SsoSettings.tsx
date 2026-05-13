import { useState, useEffect } from "react";
import { useSettingsAutoSave } from "@/hooks/useSettingsAutoSave";
import GlassCard from "@/components/GlassCard";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Shield, AlertTriangle } from "lucide-react";

export default function SsoSettings() {
  const { currentSettings, handleInputChange } = useSettingsAutoSave();
  const [ssoStatus, setSsoStatus] = useState<{ configured: boolean; reason?: string } | null>(null);

  useEffect(() => {
    fetch('/api/auth/sso/status')
      .then(res => res.json())
      .then(data => setSsoStatus(data))
      .catch(() => setSsoStatus({ configured: false, reason: 'Unable to check SSO status' }));
  }, []);

  const ssoLoginMode = currentSettings?.ssoLoginMode || 'standard';
  const ssoAutoProvision = currentSettings?.ssoAutoProvision ?? true;
  const ssoDefaultRole = currentSettings?.ssoDefaultRole || 'user';

  return (
    <GlassCard className="dark:glass-dark p-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center flex-shrink-0">
          <Shield size={20} className="text-blue-600 dark:text-blue-400" />
        </div>
        <div>
          <h3 className="text-lg font-bold text-fixed">Single Sign-On (SSO)</h3>
          <p className="text-sm text-muted-foreground">Microsoft Azure Entra ID integration for your organisation</p>
        </div>
      </div>

      <div className="mb-6">
        {ssoStatus === null ? (
          <Badge variant="secondary" className="text-xs">Checking SSO server status…</Badge>
        ) : ssoStatus.configured ? (
          <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300 border border-green-300 dark:border-green-700 text-xs font-medium">
            ✓ Microsoft SSO is available on this server
          </Badge>
        ) : (
          <Badge variant="destructive" className="text-xs">
            ✗ SSO is not configured on this server — contact ACS support
          </Badge>
        )}
      </div>

      <div className="space-y-6">
        <div className="space-y-2">
          <Label className="text-sm font-medium text-fixed">Login Mode</Label>
          <p className="text-xs text-muted-foreground mb-2">Choose how users sign in to TPR Max for your organisation</p>
          <Select
            value={ssoLoginMode}
            onValueChange={(value) => handleInputChange('ssoLoginMode', value)}
          >
            <SelectTrigger className="w-full max-w-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="standard">Standard login only (default)</SelectItem>
              <SelectItem value="both">Both available (standard + Microsoft)</SelectItem>
              <SelectItem value="sso_only">Microsoft SSO only</SelectItem>
            </SelectContent>
          </Select>
          {ssoLoginMode === 'sso_only' && (
            <Alert className="border-amber-200 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-800 mt-2 max-w-lg">
              <AlertTriangle size={14} className="text-amber-600 dark:text-amber-400 mt-0.5" />
              <AlertDescription className="text-amber-800 dark:text-amber-300 text-xs leading-relaxed">
                <strong>Warning:</strong> SSO Only mode disables username and password login for all users. Make sure SSO is tested and working before enabling this — if there is a problem, users will be locked out.
              </AlertDescription>
            </Alert>
          )}
        </div>

        <Separator />

        <div className="flex items-start justify-between gap-6">
          <div className="flex-1">
            <Label className="text-sm font-medium text-fixed">Auto-provision users</Label>
            <p className="text-xs text-muted-foreground mt-1">
              Automatically create a TPR Max account on first Microsoft login.
            </p>
            {!ssoAutoProvision && (
              <p className="text-xs text-amber-600 dark:text-amber-400 mt-1.5">
                Users must be created manually in Security settings before they can sign in with Microsoft.
              </p>
            )}
          </div>
          <Switch
            checked={ssoAutoProvision}
            onCheckedChange={(checked) => handleInputChange('ssoAutoProvision', checked)}
          />
        </div>

        {ssoAutoProvision && (
          <div className="space-y-2">
            <Label className="text-sm font-medium text-fixed">Default role for new users</Label>
            <p className="text-xs text-muted-foreground">Role assigned when a new account is created automatically</p>
            <Select
              value={ssoDefaultRole}
              onValueChange={(value) => handleInputChange('ssoDefaultRole', value)}
            >
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="user">User</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}
      </div>
    </GlassCard>
  );
}
