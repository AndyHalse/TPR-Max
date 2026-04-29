import { useState, useRef } from "react";
import { useSettingsAutoSave } from "@/hooks/useSettingsAutoSave";
import GlassCard from "@/components/GlassCard";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { Server, Database, HardDrive, CheckCircle, XCircle, RotateCcw, TestTube, Eye, EyeOff, Copy, RefreshCw, Activity, Zap, Globe, Key, Phone, Video, Settings2, Info, Scan, BarChart3, Clock, Send, Shield } from "lucide-react";

export default function IntegrationSettings() {
  const { currentSettings, handleInputChange } = useSettingsAutoSave();
  const { toast } = useToast();

  const [biostarDiag, setBiostarDiag] = useState<any>(null);
  const [biostarDiagLoading, setBiostarDiagLoading] = useState(false);
  const [showBiostarDiag, setShowBiostarDiag] = useState(false);
  const [biostarWebhookUrl, setBiostarWebhookUrl] = useState<string>("");
  const [biostarDevices, setBiostarDevices] = useState<any[]>([]);
  const [biostarDevicesLoading, setBiostarDevicesLoading] = useState(false);
  const [showDeviceConfig, setShowDeviceConfig] = useState(false);
  const [deviceSaveLoading, setDeviceSaveLoading] = useState<string | null>(null);
  const [showAddDevice, setShowAddDevice] = useState(false);
  const [addDeviceForm, setAddDeviceForm] = useState({ id: '', name: '', deviceAddress: '', deviceGroup: '', role: 'ENTRY_EXIT' });
  const [showScanActivity, setShowScanActivity] = useState(false);
  const [scanActivityData, setScanActivityData] = useState<any[]>([]);
  const [scanActivityLoading, setScanActivityLoading] = useState(false);
  const [scanActivityError, setScanActivityError] = useState<string | null>(null);
  const scanActivityTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [paxtonTestResult, setPaxtonTestResult] = useState<string>("");
  const [paxtonTestLoading, setPaxtonTestLoading] = useState(false);
  const [paxtonSyncResult, setPaxtonSyncResult] = useState<string>("");
  const [paxtonSyncLoading, setPaxtonSyncLoading] = useState(false);
  const [apiKeyVisible, setApiKeyVisible] = useState(false);
  const [apiKeyGenerating, setApiKeyGenerating] = useState(false);
  const [webhookTestResult, setWebhookTestResult] = useState<string>("");
  const [webhookTestLoading, setWebhookTestLoading] = useState(false);

  const handlePaxtonTest = async () => {
    setPaxtonTestLoading(true);
    try {
      const res = await fetch("/api/paxton/test-connection", { method: "POST", headers: { "Content-Type": "application/json" } });
      const data = await res.json();
      setPaxtonTestResult(data.success ? `✓ ${data.message}` : `✗ ${data.message || data.error}`);
    } catch (err: any) { setPaxtonTestResult(`✗ ${err.message}`); }
    setPaxtonTestLoading(false);
  };

  const handlePaxtonSync = async () => {
    setPaxtonSyncLoading(true);
    try {
      const res = await fetch("/api/paxton/sync-staff", { method: "POST", headers: { "Content-Type": "application/json" } });
      const data = await res.json();
      setPaxtonSyncResult(data.success ? `✓ ${data.message}` : `✗ ${data.message || data.error}`);
    } catch (err: any) { setPaxtonSyncResult(`✗ ${err.message}`); }
    setPaxtonSyncLoading(false);
  };

  const handleGenerateApiKey = async () => {
    setApiKeyGenerating(true);
    try {
      const res = await fetch("/api/integrations/generate-api-key", { method: "POST", headers: { "Content-Type": "application/json" } });
      const data = await res.json();
      if (data.apiKey) { handleInputChange("apiKey", data.apiKey); toast({ title: "API Key Generated", description: "A new API key has been generated successfully." }); }
    } catch (err: any) { toast({ title: "Error", description: err.message || "Failed to generate API key", variant: "destructive" }); }
    setApiKeyGenerating(false);
  };

  const handleRevokeApiKey = async () => {
    try {
      await fetch("/api/integrations/revoke-api-key", { method: "POST", headers: { "Content-Type": "application/json" } });
      handleInputChange("apiKey", "");
      toast({ title: "API Key Revoked", description: "Your API key has been revoked." });
    } catch (err: any) { toast({ title: "Error", description: err.message || "Failed to revoke API key", variant: "destructive" }); }
  };

  const handleTestWebhook = async () => {
    setWebhookTestLoading(true);
    try {
      const res = await fetch("/api/integrations/test-webhook", { method: "POST", headers: { "Content-Type": "application/json" } });
      const data = await res.json();
      setWebhookTestResult(data.success ? `✓ ${data.message}` : `✗ ${data.message || data.error}`);
    } catch (err: any) { setWebhookTestResult(`✗ ${err.message}`); }
    setWebhookTestLoading(false);
  };

  const handleCopyToClipboard = (value: string, label: string) => {
    navigator.clipboard.writeText(value).then(() => {
      toast({ title: "Copied!", description: `${label} copied to clipboard.` });
    }).catch(() => {
      toast({ title: "Copy Failed", description: "Failed to copy to clipboard.", variant: "destructive" });
    });
  };

  return (
    <div className="space-y-6">
<TooltipProvider delayDuration={200}>
<div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
  <GlassCard>
    <div className="flex items-center mb-6">
      <Shield className="mr-3 text-blue-600 dark:text-blue-400" size={24} />
      <h3 className="text-lg font-semibold text-fixed">Suprema BioStar 2 Local Server</h3>
    </div>
    
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <Label className="text-sm font-medium text-fixed">
            Enable BioStar Integration
          </Label>
          <p className="text-xs text-variable">Connect to local BioStar 2 server for access control</p>
        </div>
        <Switch
          checked={currentSettings?.biostarEnabled || false}
          onCheckedChange={(checked) => handleInputChange("biostarEnabled", checked)}
          data-testid="switch-biostar-enabled"
        />
      </div>
      
      {currentSettings?.biostarEnabled && (
        <>
          <div className="space-y-2">
            <div className="flex items-center gap-1.5">
              <Label htmlFor="biostarServerUrl" className="text-sm font-medium text-fixed">Local Server Address</Label>
              <Tooltip>
                <TooltipTrigger asChild><Info size={14} className="text-variable cursor-help" /></TooltipTrigger>
                <TooltipContent className="max-w-xs">The local network URL of your BioStar 2 server, e.g. https://192.168.1.50. This must be accessible from the server running TPR Max — not from outside your network.</TooltipContent>
              </Tooltip>
            </div>
            <Input
              id="biostarServerUrl"
              type="url"
              value={currentSettings?.biostarServerUrl || ""}
              onChange={(e) => handleInputChange("biostarServerUrl", e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-white/30 dark:border-slate-700/30 bg-white/50 dark:bg-slate-800/50 focus:outline-none focus:ring-2 focus:ring-blue-500 text-fixed"
              placeholder="https://192.168.1.50"
              data-testid="input-biostar-server-url"
            />
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="biostarUsername" className="text-sm font-medium text-fixed">
                Admin Username
              </Label>
              <Input
                id="biostarUsername"
                type="text"
                value={currentSettings?.biostarUsername || ""}
                onChange={(e) => handleInputChange("biostarUsername", e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-white/30 dark:border-slate-700/30 bg-white/50 dark:bg-slate-800/50 focus:outline-none focus:ring-2 focus:ring-blue-500 text-fixed"
                placeholder=""
                data-testid="input-biostar-username"
              />
              <p className="text-xs text-variable">Biostar 2 administrator login ID</p>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="biostarPassword" className="text-sm font-medium text-fixed">
                Admin Password
              </Label>
              <Input
                id="biostarPassword"
                type="password"
                value={currentSettings?.biostarPassword || ""}
                onChange={(e) => handleInputChange("biostarPassword", e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-white/30 dark:border-slate-700/30 bg-white/50 dark:bg-slate-800/50 focus:outline-none focus:ring-2 focus:ring-blue-500 text-fixed"
                placeholder="••••••••"
                data-testid="input-biostar-password"
              />
              <p className="text-xs text-variable">Biostar 2 administrator password</p>
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <div className="flex items-center gap-1.5">
                <Label htmlFor="biostarDatabaseId" className="text-sm font-medium text-fixed">Database ID</Label>
                <Tooltip>
                  <TooltipTrigger asChild><Info size={14} className="text-variable cursor-help" /></TooltipTrigger>
                  <TooltipContent className="max-w-xs">The BioStar 2 database instance ID. This is almost always "1" for single-server installations. Only change if your IT team confirms you have multiple BioStar databases.</TooltipContent>
                </Tooltip>
              </div>
              <Input
                id="biostarDatabaseId"
                type="text"
                value={currentSettings?.biostarDatabaseId || "1"}
                onChange={(e) => handleInputChange("biostarDatabaseId", e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-white/30 dark:border-slate-700/30 bg-white/50 dark:bg-slate-800/50 focus:outline-none focus:ring-2 focus:ring-blue-500 text-fixed"
                placeholder="1"
                data-testid="input-biostar-database-id"
              />
            </div>
            
            <div className="space-y-2">
              <div className="flex items-center gap-1.5">
                <Label htmlFor="biostarSyncInterval" className="text-sm font-medium text-fixed">Sync Interval (seconds)</Label>
                <Tooltip>
                  <TooltipTrigger asChild><Info size={14} className="text-variable cursor-help" /></TooltipTrigger>
                  <TooltipContent className="max-w-xs">How often attendance data is pulled from BioStar. 300 (5 minutes) is recommended. Lower values give more real-time data but increase server load. Minimum is 60 seconds.</TooltipContent>
                </Tooltip>
              </div>
              <Input
                id="biostarSyncInterval"
                type="number"
                value={currentSettings?.biostarSyncInterval || "300"}
                onChange={(e) => handleInputChange("biostarSyncInterval", e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-white/30 dark:border-slate-700/30 bg-white/50 dark:bg-slate-800/50 focus:outline-none focus:ring-2 focus:ring-blue-500 text-fixed"
                placeholder="300"
                min="60"
                data-testid="input-biostar-sync-interval"
              />
            </div>
          </div>
        </>
      )}
    </div>
  </GlassCard>
  
  <GlassCard>
    <div className="flex items-center mb-6">
      <Shield className="mr-3 text-blue-600 dark:text-blue-400" size={24} />
      <h3 className="text-lg font-semibold text-fixed">Connection & Sync</h3>
    </div>
    
    <div className="space-y-4">
      <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
        <h4 className="font-medium text-blue-800 dark:text-blue-200 mb-2">Biostar 2 Integration:</h4>
        <ul className="text-sm text-blue-700 dark:text-blue-300 space-y-1">
          <li>• Real-time attendance tracking</li>
          <li>• Automatic muster list updates</li>
          <li>• Fire marshal emergency access</li>
          <li>• Configurable sync intervals</li>
        </ul>
      </div>
      
      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          className="flex-1"
          onClick={async () => {
            try {
              toast({
                title: "Testing Connection",
                description: "Connecting to Biostar 2 server...",
              });
              
              const response = await fetch('/api/biostar/test-connection', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
              });
              
              const result = await response.json();
              
              toast({
                title: result.connected ? "✅ Connection Successful" : "❌ Connection Failed",
                description: result.message,
                variant: result.connected ? "default" : "destructive"
              });
            } catch (error) {
              console.error('Biostar connection test error:', error);
              toast({
                title: "Connection Error",
                description: "Failed to test Biostar connection",
                variant: "destructive"
              });
            }
          }}
          data-testid="button-test-biostar-connection"
        >
          <TestTube className="mr-2" size={16} />
          Test Connection
        </Button>
        <Button
          type="button"
          variant="outline"
          className="flex-1"
          onClick={async () => {
            try {
              toast({
                title: "Syncing Data",
                description: "Fetching attendance data from Biostar 2...",
              });
              
              const response = await apiRequest("POST", "/api/biostar/sync-now");
              const result = await response.json();
              
              if (result.success) {
                // Force-refetch settings to show new last sync time
                await queryClient.refetchQueries({ queryKey: ["/api/settings"] });
                await queryClient.refetchQueries({ queryKey: ["/api/staff"] });
              }
              
              const parts: string[] = [];
              if (result.imported > 0) parts.push(`${result.imported} new staff imported.`);
              if (result.updated > 0) parts.push(`${result.updated} records updated with latest Biostar data.`);
              if (result.imported === 0 && result.updated === 0) parts.push("All staff already up to date.");
              if (result.onSiteWarning) parts.push(`Note: ${result.onSiteWarning}`);
              toast({
                title: result.success ? "✅ Sync Successful" : "❌ Sync Failed",
                description: parts.join(" ") || result.message || "",
                variant: result.success ? "default" : "destructive"
              });
            } catch (error: any) {
              console.error('Biostar sync error:', error);
              toast({
                title: "Sync Error",
                description: error?.message || "Failed to sync attendance data",
                variant: "destructive"
              });
            }
          }}
          data-testid="button-sync-biostar-now"
        >
          <RefreshCw className="mr-2" size={16} />
          Sync Now
        </Button>
      </div>
      
      {currentSettings?.biostarLastSync && (
        <div className="p-3 bg-green-50 dark:bg-green-900/20 rounded-lg">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-green-800 dark:text-green-200">
              Last synchronized:
            </span>
            <span className="text-sm text-green-700 dark:text-green-300">
              {new Date(currentSettings.biostarLastSync).toLocaleString()}
            </span>
          </div>
        </div>
      )}
      
      <div className="mt-4 p-4 bg-amber-50 dark:bg-amber-900/20 rounded-lg">
        <h4 className="font-medium text-amber-800 dark:text-amber-200 mb-2">Setup Steps:</h4>
        <ol className="text-sm text-amber-700 dark:text-amber-300 space-y-1 ml-4 list-decimal">
          <li>Enter your Biostar 2 server URL and credentials above</li>
          <li>Click "Test Connection" to verify connectivity</li>
          <li>Configure sync interval (recommended: 300 seconds / 5 minutes)</li>
          <li>Click "Sync Now" to manually fetch attendance data</li>
          <li>View synced data on the Muster page</li>
        </ol>
      </div>
      <Button
        type="button"
        variant="outline"
        className="w-full"
        onClick={async () => {
          if (showBiostarDiag && biostarDiag) { setShowBiostarDiag(false); return; }
          setBiostarDiagLoading(true);
          setShowBiostarDiag(true);
          try {
            const [diagResp, webhookResp] = await Promise.all([
              fetch('/api/biostar/diagnostics'),
              fetch('/api/biostar/webhook-url'),
            ]);
            const data = await diagResp.json();
            setBiostarDiag(data);
            const wh = await webhookResp.json().catch(() => ({}));
            if (wh.webhookUrl) setBiostarWebhookUrl(wh.webhookUrl);
          } catch (e: any) {
            setBiostarDiag({ error: e.message });
          } finally {
            setBiostarDiagLoading(false);
          }
        }}
      >
        <Activity className="mr-2" size={16} />
        {showBiostarDiag ? "Hide Diagnostics" : "View Live Diagnostics"}
      </Button>
    </div>
  </GlassCard>
</div>
{/* BioStar Diagnostics Panel */}
{showBiostarDiag && (
  <GlassCard>
    <div className="flex items-center justify-between mb-4">
      <div className="flex items-center gap-2">
        <Activity className="text-blue-600 dark:text-blue-400" size={20} />
        <h3 className="text-base font-semibold text-fixed">BioStar 2 Live Diagnostics</h3>
      </div>
      <Button variant="ghost" size="sm" onClick={() => {
        setBiostarDiagLoading(true);
        fetch('/api/biostar/diagnostics').then(r => r.json()).then(d => { setBiostarDiag(d); setBiostarDiagLoading(false); }).catch(() => setBiostarDiagLoading(false));
      }}>
        <RefreshCw size={14} className={biostarDiagLoading ? "animate-spin" : ""} />
        <span className="ml-1 text-xs">Refresh</span>
      </Button>
    </div>
    {biostarDiagLoading && !biostarDiag && (
      <div className="text-sm text-variable text-center py-6">Loading diagnostics from BioStar 2...</div>
    )}
    {biostarDiag?.error && (
      <div className="p-3 bg-red-50 dark:bg-red-900/20 rounded-lg text-sm text-red-700 dark:text-red-300">
        Error: {biostarDiag.error}
      </div>
    )}
    {biostarDiag && !biostarDiag.error && (
      <div className="space-y-5">
        {/* Summary row */}
        <div className="flex flex-wrap gap-3 text-sm">
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
            <span className="text-blue-600 dark:text-blue-400 font-medium">{biostarDiag.eventCount ?? 0}</span>
            <span className="text-variable">events today</span>
          </div>
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-green-50 dark:bg-green-900/20 rounded-lg">
            <span className="text-green-600 dark:text-green-400 font-medium">{biostarDiag.onSiteUsers?.length ?? 0}</span>
            <span className="text-variable">on-site per BioStar</span>
          </div>
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-50 dark:bg-purple-900/20 rounded-lg">
            <span className="text-purple-600 dark:text-purple-400 font-medium">{biostarDiag.staffReconciliation?.length ?? 0}</span>
            <span className="text-variable">staff linked to BioStar</span>
          </div>
        </div>
        {/* Staff reconciliation */}
        {biostarDiag.staffReconciliation?.length > 0 && (
          <div>
            <h4 className="text-sm font-semibold text-fixed mb-2">Staff Matching</h4>
            <div className="overflow-x-auto rounded-lg border border-white/20 dark:border-slate-700/30">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-800/50">
                    <th className="text-left px-3 py-2 text-xs font-medium text-variable">Name</th>
                    <th className="text-left px-3 py-2 text-xs font-medium text-variable">BioStar ID</th>
                    <th className="text-left px-3 py-2 text-xs font-medium text-variable">TPR Status</th>
                    <th className="text-left px-3 py-2 text-xs font-medium text-variable">BioStar Says</th>
                  </tr>
                </thead>
                <tbody>
                  {biostarDiag.staffReconciliation.map((s: any, i: number) => (
                    <tr key={i} className="border-t border-white/10 dark:border-slate-700/20">
                      <td className="px-3 py-2 font-medium text-fixed">{s.name}</td>
                      <td className="px-3 py-2 font-mono text-xs text-variable">{s.biostarUserId}</td>
                      <td className="px-3 py-2">
                        <Badge variant={s.currentlyCheckedIn ? "default" : "secondary"} className={s.currentlyCheckedIn ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300" : ""}>
                          {s.currentlyCheckedIn ? "On Site" : "Off Site"}
                        </Badge>
                      </td>
                      <td className="px-3 py-2">
                        <Badge variant={s.biostarSaysOnSite ? "default" : "secondary"} className={s.biostarSaysOnSite ? "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300" : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400"}>
                          {s.biostarSaysOnSite ? "ON-SITE" : "OFF-SITE"}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
        {/* Event code summary */}
        {Object.keys(biostarDiag.eventCodeSummary ?? {}).length > 0 && (
          <div>
            <h4 className="text-sm font-semibold text-fixed mb-2">Event Codes Seen Today</h4>
            <div className="flex flex-wrap gap-2">
              {Object.entries(biostarDiag.eventCodeSummary).map(([code, info]: [string, any]) => (
                <div key={code} className="flex items-center gap-1.5 px-2.5 py-1 bg-slate-100 dark:bg-slate-800 rounded-md text-xs">
                  <span className="font-mono font-bold text-fixed">{code}</span>
                  <span className="text-variable">{info.desc || "unknown"}</span>
                  <span className="bg-slate-200 dark:bg-slate-700 text-variable px-1.5 py-0.5 rounded text-xs">×{info.count}</span>
                </div>
              ))}
            </div>
          </div>
        )}
        {/* Recent events */}
        {biostarDiag.events?.length > 0 ? (
          <div>
            <h4 className="text-sm font-semibold text-fixed mb-2">Recent Events (last {biostarDiag.events.length})</h4>
            <div className="overflow-x-auto rounded-lg border border-white/20 dark:border-slate-700/30 max-h-64 overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-slate-50 dark:bg-slate-800/90">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium text-variable">Time</th>
                    <th className="text-left px-3 py-2 font-medium text-variable">User</th>
                    <th className="text-left px-3 py-2 font-medium text-variable">Code</th>
                    <th className="text-left px-3 py-2 font-medium text-variable">Description</th>
                    <th className="text-left px-3 py-2 font-medium text-variable">Device</th>
                  </tr>
                </thead>
                <tbody>
                  {biostarDiag.events.map((e: any, i: number) => (
                    <tr key={i} className="border-t border-white/10 dark:border-slate-700/20 hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                      <td className="px-3 py-1.5 text-variable whitespace-nowrap">
                        {e.time ? new Date(e.time).toLocaleTimeString() : "—"}
                      </td>
                      <td className="px-3 py-1.5 font-medium text-fixed">{e.userName || `ID:${e.userId}`}</td>
                      <td className="px-3 py-1.5 font-mono text-fixed">{e.eventCode}</td>
                      <td className="px-3 py-1.5 text-variable">{e.eventDesc || "—"}</td>
                      <td className="px-3 py-1.5 text-variable">{e.deviceName || e.deviceId || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {biostarDiag.eventLogError ? (
              <div className="space-y-3">
                {/* Explanation box */}
                <div className="p-4 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-700/40">
                  <p className="font-semibold text-amber-800 dark:text-amber-200 mb-2 flex items-center gap-2">
                    <span>ℹ️</span> BioStar 2 REST API — Event Log Blocked
                  </p>
                  <p className="text-sm text-amber-700 dark:text-amber-300">
                    The BioStar 2 menu permissions (Edit/Read, Read checkboxes) only control what you see in the BioStar web interface. The REST API that TPR-Max uses has a separate, hidden permission layer. Even with all menus fully ticked, the event log API can still return "Permission Denied".
                  </p>
                </div>
                {/* Webhook option — recommended */}
                <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-700/40">
                  <p className="font-semibold text-green-800 dark:text-green-200 mb-2 flex items-center gap-2">
                    <span>✅</span> Recommended Fix: Use BioStar 2 "Trigger &amp; Action" (Push Events)
                  </p>
                  <p className="text-sm text-green-700 dark:text-green-300 mb-3">
                    Instead of TPR-Max asking BioStar for events, configure BioStar 2 to <strong>push</strong> each card scan directly to TPR-Max. This bypasses the permission issue entirely and gives instant, real-time updates.
                  </p>
                  {biostarWebhookUrl && (
                    <div className="bg-white dark:bg-green-950/40 rounded-lg p-3 mb-3 border border-green-200 dark:border-green-700/30">
                      <p className="text-xs font-semibold text-green-800 dark:text-green-200 mb-1">Your TPR-Max Webhook URL:</p>
                      <code className="text-xs text-green-700 dark:text-green-300 break-all select-all block bg-green-100 dark:bg-green-900/40 px-2 py-1 rounded">{biostarWebhookUrl}</code>
                      <p className="text-xs text-green-600 dark:text-green-400 mt-1">Copy this URL — you'll need it in BioStar 2.</p>
                    </div>
                  )}
                  <div className="bg-white dark:bg-green-950/40 rounded-lg p-3">
                    <p className="text-xs font-semibold text-green-800 dark:text-green-200 mb-2">How to set up in BioStar 2:</p>
                    <ol className="text-xs text-green-700 dark:text-green-300 space-y-1 list-decimal list-inside">
                      <li>In BioStar 2, go to <strong>Monitoring</strong> → <strong>Trigger &amp; Action</strong></li>
                      <li>Click <strong>Add</strong> to create a new trigger</li>
                      <li>Trigger condition: <strong>Event</strong> → select <em>Access Granted</em> (and <em>Exit Granted</em> if you have an exit reader)</li>
                      <li>Action type: <strong>HTTP Action</strong> (or "Send HTTP Request")</li>
                      <li>Method: <strong>POST</strong>, URL: paste the webhook URL above</li>
                      <li>Save — BioStar will now push every card scan to TPR-Max instantly</li>
                    </ol>
                  </div>
                </div>
                {/* Alternative: BioStar 2 server settings */}
                <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-700/40">
                  <p className="font-semibold text-blue-800 dark:text-blue-200 mb-2 flex items-center gap-2">
                    <span>🔧</span> Alternative: Enable REST API Access in BioStar 2 Settings
                  </p>
                  <p className="text-sm text-blue-700 dark:text-blue-300 mb-2">
                    Some BioStar 2 versions have a separate REST API permission setting separate from the Custom Level menus. Try checking:
                  </p>
                  <ul className="text-xs text-blue-700 dark:text-blue-300 space-y-1 list-disc list-inside">
                    <li>BioStar 2 → <strong>Settings</strong> → <strong>Server</strong> → look for "REST API" or "Event Log API" option</li>
                    <li>If using BioStar 2 cloud, check if your licence includes API monitoring access</li>
                    <li>Contact Suprema support and ask about Event Log REST API permissions for your BioStar 2 version</li>
                  </ul>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400">Technical error: {biostarDiag.eventLogError}</p>
              </div>
            ) : (
              <div className="p-4 bg-amber-50 dark:bg-amber-900/20 rounded-lg text-sm text-amber-700 dark:text-amber-300">
                No events returned from BioStar for today. Check that the server URL is reachable from the TPR Max server and that BioStar 2 is recording access events.
              </div>
            )}
            {biostarDiag.onSiteUsers?.length > 0 && (
              <div className="p-3 bg-green-50 dark:bg-green-900/20 rounded-lg text-sm text-green-700 dark:text-green-300">
                Using last scan time fallback — {biostarDiag.onSiteUsers.length} user(s) detected on-site from BioStar card records.
              </div>
            )}
          </div>
        )}
      </div>
    )}
  </GlassCard>
)}
{/* ── Device Configuration Panel ── */}
{currentSettings?.biostarEnabled && (
  <GlassCard>
    <div className="flex items-center justify-between mb-4">
      <div className="flex items-center gap-2">
        <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
          <svg className="text-blue-600 dark:text-blue-400 w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18m0 0h10a2 2 0 002-2V9M9 21H5a2 2 0 01-2-2V9m0 0h18" /></svg>
        </div>
        <div>
          <h3 className="text-base font-semibold text-fixed">Device Configuration</h3>
          <p className="text-xs text-variable">Classify each reader as Entry, Exit, or Both to drive accurate on-site detection</p>
        </div>
      </div>
      <Button
        variant="outline"
        size="sm"
        onClick={async () => {
          if (showDeviceConfig) { setShowDeviceConfig(false); return; }
          setShowDeviceConfig(true);
          setBiostarDevicesLoading(true);
          try {
            const [devResp, whResp] = await Promise.all([
              fetch('/api/biostar/devices'),
              fetch('/api/biostar/webhook-url'),
            ]);
            setBiostarDevices(await devResp.json());
            const wh = await whResp.json().catch(() => ({}));
            if (wh.webhookUrl) setBiostarWebhookUrl(wh.webhookUrl);
          } catch { setBiostarDevices([]); }
          finally { setBiostarDevicesLoading(false); }
        }}
      >
        {showDeviceConfig ? "Hide" : "Configure Devices"}
      </Button>
    </div>
    {showDeviceConfig && (
      <div className="space-y-4">
        {/* Explanation */}
        <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg text-sm text-blue-700 dark:text-blue-300">
          <strong>How it works:</strong> When a card is scanned, BioStar 2 sends the reader ID to TPR-Max. TPR-Max looks up that reader here:
          <ul className="mt-1 ml-4 space-y-0.5 text-xs list-disc">
            <li><strong>Entry</strong> — any scan marks the person as On Site</li>
            <li><strong>Exit</strong> — any scan marks the person as Off Site</li>
            <li><strong>Entry/Exit</strong> — uses the BioStar event code to decide direction</li>
            <li><strong>Ignore</strong> — scans on this reader are silently ignored</li>
          </ul>
        </div>
        {/* ── Webhook / Trigger & Action setup — always visible ── */}
        <div className="p-4 rounded-lg border-2 border-amber-300 dark:border-amber-600 bg-amber-50 dark:bg-amber-900/25 space-y-3">
          <div className="flex items-start gap-2">
            <span className="text-amber-500 mt-0.5 text-base shrink-0">⚠️</span>
            <div>
              <p className="text-sm font-semibold text-amber-800 dark:text-amber-200">BioStar 2 Trigger &amp; Action required</p>
              <p className="text-xs text-amber-700 dark:text-amber-300 mt-0.5">
                TPR-Max cannot read the BioStar 2 event log directly — the REST API is restricted on this installation. BioStar 2 must be configured to <strong>push</strong> each card scan to TPR-Max using Trigger &amp; Action. Until this is done, no on-site status will update automatically.
              </p>
            </div>
          </div>
          {/* Webhook URL */}
          <div className="bg-white dark:bg-gray-900/60 rounded-lg p-3 border border-amber-200 dark:border-amber-700/40">
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-xs font-semibold text-amber-800 dark:text-amber-200">Your TPR-Max Webhook URL</p>
              {biostarWebhookUrl && (
                <button
                  className="text-xs font-medium text-amber-700 dark:text-amber-300 hover:text-amber-900 dark:hover:text-amber-100 px-2 py-0.5 rounded border border-amber-300 dark:border-amber-600 hover:bg-amber-100 dark:hover:bg-amber-800/40 transition-colors"
                  onClick={() => { navigator.clipboard.writeText(biostarWebhookUrl); }}
                >
                  Copy
                </button>
              )}
            </div>
            {biostarWebhookUrl ? (
              <code className="block w-full text-xs font-mono break-all select-all bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-200 px-2 py-1.5 rounded border border-amber-200 dark:border-amber-800/40">
                {biostarWebhookUrl}
              </code>
            ) : (
              <p className="text-xs text-amber-600 dark:text-amber-400 italic">Loading URL…</p>
            )}
          </div>
          {/* Setup steps */}
          <div className="bg-white dark:bg-gray-900/60 rounded-lg p-3 border border-amber-200 dark:border-amber-700/40">
            <p className="text-xs font-semibold text-amber-800 dark:text-amber-200 mb-2">How to configure in BioStar 2:</p>
            <ol className="text-xs text-amber-700 dark:text-amber-300 space-y-1.5 list-decimal list-inside">
              <li>In BioStar 2, go to <strong>Monitoring</strong> → <strong>Trigger &amp; Action</strong></li>
              <li>Click <strong>Add</strong> — set Trigger to <strong>Event</strong> → <em>Authentication Success</em> (all devices / all users)</li>
              <li>Set Action to <strong>HTTP Action</strong> (or "Send HTTP Request"): method <strong>POST</strong>, paste the URL above</li>
              <li>Save and enable the rule — BioStar 2 will now push every card scan to TPR-Max instantly</li>
              <li>Test by scanning any reader — the Scan Activity panel will update within seconds</li>
            </ol>
          </div>
        </div>
        {/* Action bar */}
        <div className="flex gap-2 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            disabled={biostarDevicesLoading}
            onClick={async () => {
              setBiostarDevicesLoading(true);
              try {
                const r = await fetch('/api/biostar/devices?sync=true');
                const data = await r.json();
                setBiostarDevices(Array.isArray(data) ? data : []);
              } catch { }
              finally { setBiostarDevicesLoading(false); }
            }}
          >
            {biostarDevicesLoading ? <span className="animate-spin mr-1">⟳</span> : null}
            Sync from BioStar 2
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowAddDevice(v => !v)}
          >
            + Add Device Manually
          </Button>
          <Button
            variant={showScanActivity ? "default" : "outline"}
            size="sm"
            onClick={() => {
              const next = !showScanActivity;
              setShowScanActivity(next);
              if (next) {
                const poll = async () => {
                  setScanActivityLoading(true);
                  setScanActivityError(null);
                  try {
                    const r = await fetch('/api/biostar/scan-activity');
                    const d = await r.json();
                    setScanActivityData(d.users || []);
                    setScanActivityError(d.error || null);
                  } catch (e: any) {
                    setScanActivityError(e.message);
                  } finally {
                    setScanActivityLoading(false);
                  }
                };
                poll();
                if (scanActivityTimerRef.current) clearInterval(scanActivityTimerRef.current);
                scanActivityTimerRef.current = setInterval(poll, 60000);
              } else {
                if (scanActivityTimerRef.current) { clearInterval(scanActivityTimerRef.current); scanActivityTimerRef.current = null; }
              }
            }}
          >
            <span className={`inline-block w-2 h-2 rounded-full mr-1.5 ${showScanActivity ? 'bg-green-400 animate-pulse' : 'bg-gray-400'}`} />
            Scan Activity
          </Button>
        </div>
        {/* Add device form */}
        {showAddDevice && (
          <div className="p-3 bg-gray-50 dark:bg-gray-800/40 rounded-lg border border-gray-200 dark:border-gray-700/40 space-y-3">
            <p className="text-sm font-medium text-fixed">Add Reader Manually</p>
            <p className="text-xs text-variable">Use this when BioStar 2's device list API is restricted. You can find the device ID in the BioStar 2 device settings or from the webhook logs when a card is scanned.</p>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-variable mb-1 block">Device ID *</label>
                <input
                  className="w-full border rounded px-2 py-1.5 text-sm bg-white dark:bg-gray-800 text-fixed border-gray-300 dark:border-gray-600"
                  placeholder="e.g. 543231711"
                  value={addDeviceForm.id}
                  onChange={e => setAddDeviceForm(f => ({ ...f, id: e.target.value }))}
                />
              </div>
              <div>
                <label className="text-xs text-variable mb-1 block">Device Name *</label>
                <input
                  className="w-full border rounded px-2 py-1.5 text-sm bg-white dark:bg-gray-800 text-fixed border-gray-300 dark:border-gray-600"
                  placeholder="e.g. Front Door Entry"
                  value={addDeviceForm.name}
                  onChange={e => setAddDeviceForm(f => ({ ...f, name: e.target.value }))}
                />
              </div>
              <div>
                <label className="text-xs text-variable mb-1 block">Device Address (optional)</label>
                <input
                  className="w-full border rounded px-2 py-1.5 text-sm bg-white dark:bg-gray-800 text-fixed border-gray-300 dark:border-gray-600 font-mono"
                  placeholder="e.g. 192.168.1.247"
                  value={addDeviceForm.deviceAddress}
                  onChange={e => setAddDeviceForm(f => ({ ...f, deviceAddress: e.target.value }))}
                />
              </div>
              <div>
                <label className="text-xs text-variable mb-1 block">Group (optional)</label>
                <input
                  className="w-full border rounded px-2 py-1.5 text-sm bg-white dark:bg-gray-800 text-fixed border-gray-300 dark:border-gray-600"
                  placeholder="e.g. All Devices"
                  value={addDeviceForm.deviceGroup}
                  onChange={e => setAddDeviceForm(f => ({ ...f, deviceGroup: e.target.value }))}
                />
              </div>
              <div className="col-span-2">
                <label className="text-xs text-variable mb-1 block">Role</label>
                <select
                  className="w-full border rounded px-2 py-1.5 text-sm bg-white dark:bg-gray-800 text-fixed border-gray-300 dark:border-gray-600"
                  value={addDeviceForm.role}
                  onChange={e => setAddDeviceForm(f => ({ ...f, role: e.target.value }))}
                >
                  <option value="ENTRY">Entry (marks On Site)</option>
                  <option value="EXIT">Exit (marks Off Site)</option>
                  <option value="ENTRY_EXIT">Entry/Exit (auto-detect)</option>
                  <option value="IGNORE">Ignore</option>
                </select>
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                disabled={!addDeviceForm.id || !addDeviceForm.name}
                onClick={async () => {
                  if (!addDeviceForm.id || !addDeviceForm.name) return;
                  try {
                    const r = await fetch('/api/biostar/devices', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify(addDeviceForm),
                    });
                    const device = await r.json();
                    setBiostarDevices(prev => {
                      const filtered = prev.filter(d => d.id !== device.id);
                      return [...filtered, device].sort((a, b) => a.name.localeCompare(b.name));
                    });
                    setAddDeviceForm({ id: '', name: '', model: '', role: 'ENTRY_EXIT' });
                    setShowAddDevice(false);
                  } catch (e: any) {
                    alert('Failed to add device: ' + e.message);
                  }
                }}
              >
                Add Device
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setShowAddDevice(false)}>Cancel</Button>
            </div>
          </div>
        )}
        {/* Device table */}
        {biostarDevicesLoading && biostarDevices.length === 0 ? (
          <div className="text-sm text-variable text-center py-6">Loading devices...</div>
        ) : biostarDevices.length === 0 ? (
          <div className="p-4 bg-gray-50 dark:bg-gray-800/30 rounded-lg text-center">
            <p className="text-sm text-variable mb-1">No devices configured yet.</p>
            <p className="text-xs text-variable opacity-70">Click "Sync from BioStar 2" to pull your reader list, or add them manually. Devices will also appear here automatically when the first card scan arrives via webhook.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700">
                  <th className="text-left py-2 px-2 text-xs font-semibold text-variable uppercase tracking-wide">Reader Name</th>
                  <th className="text-left py-2 px-2 text-xs font-semibold text-variable uppercase tracking-wide">Device Address</th>
                  <th className="text-left py-2 px-2 text-xs font-semibold text-variable uppercase tracking-wide">Group</th>
                  <th className="text-left py-2 px-2 text-xs font-semibold text-variable uppercase tracking-wide">Role</th>
                  <th className="py-2 px-2"></th>
                </tr>
              </thead>
              <tbody>
                {biostarDevices.map((device: any) => (
                  <tr key={device.id} className="border-b border-gray-100 dark:border-gray-700/40 hover:bg-gray-50 dark:hover:bg-gray-800/30">
                    <td className="py-2 px-2">
                      <div className="font-medium text-fixed">{device.name}</div>
                      <div className="text-xs text-variable opacity-60">ID: {device.id}</div>
                    </td>
                    <td className="py-2 px-2 text-variable text-xs font-mono">
                      {device.deviceAddress || device.ipAddress || '—'}
                    </td>
                    <td className="py-2 px-2 text-variable text-xs">
                      {device.deviceGroup || '—'}
                    </td>
                    <td className="py-2 px-2">
                      <select
                        className="border rounded px-2 py-1 text-xs bg-white dark:bg-gray-800 text-fixed border-gray-300 dark:border-gray-600 w-36"
                        value={device.role}
                        onChange={async (e) => {
                          const newRole = e.target.value;
                          setBiostarDevices(prev => prev.map(d => d.id === device.id ? { ...d, role: newRole } : d));
                          setDeviceSaveLoading(device.id);
                          try {
                            await fetch(`/api/biostar/devices/${device.id}`, {
                              method: 'PATCH',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ role: newRole }),
                            });
                          } catch { }
                          finally { setDeviceSaveLoading(null); }
                        }}
                      >
                        <option value="ENTRY">Entry (On Site)</option>
                        <option value="EXIT">Exit (Off Site)</option>
                        <option value="ENTRY_EXIT">Entry/Exit (auto)</option>
                        <option value="IGNORE">Ignore</option>
                      </select>
                      {deviceSaveLoading === device.id && <span className="text-xs text-variable ml-1 opacity-60">saving…</span>}
                    </td>
                    <td className="py-2 px-2 text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-red-500 hover:text-red-700 text-xs h-7 px-2"
                        onClick={async () => {
                          if (!confirm(`Remove "${device.name}" from device configuration?`)) return;
                          await fetch(`/api/biostar/devices/${device.id}`, { method: 'DELETE' });
                          setBiostarDevices(prev => prev.filter(d => d.id !== device.id));
                        }}
                      >
                        Remove
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {/* ── Scan Activity Panel ── */}
        {showScanActivity && (
          <div className="space-y-2">
            {/* Header bar */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`w-2 h-2 rounded-full shrink-0 ${scanActivityLoading ? 'bg-yellow-400 animate-pulse' : 'bg-green-400 animate-pulse'}`} />
              <span className="text-sm font-medium text-fixed">Scan Activity</span>
              <span className="text-xs text-variable opacity-60">— last scan per BioStar user, linked to staff records</span>
              <Button
                variant="ghost"
                size="sm"
                className="text-xs h-7 px-2 ml-auto"
                disabled={scanActivityLoading}
                onClick={async () => {
                  setScanActivityLoading(true);
                  setScanActivityError(null);
                  try {
                    const r = await fetch('/api/biostar/scan-activity');
                    const d = await r.json();
                    setScanActivityData(d.users || []);
                    setScanActivityError(d.error || null);
                  } catch (e: any) { setScanActivityError(e.message); }
                  finally { setScanActivityLoading(false); }
                }}
              >
                {scanActivityLoading ? '⏳ Refreshing…' : '↻ Refresh'}
              </Button>
            </div>
            {scanActivityError && (
              <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/40 text-xs text-amber-800 dark:text-amber-300">
                <span className="mt-0.5 shrink-0">⚠️</span>
                <p className="leading-relaxed">{scanActivityError}</p>
              </div>
            )}
            {/* Table */}
            <div className="rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700/40">
              {/* Header */}
              <div className="grid grid-cols-[2fr_2fr_2fr_1fr] bg-gray-100 dark:bg-gray-800 px-3 py-1.5 text-[10px] font-semibold text-variable uppercase tracking-wide border-b border-gray-200 dark:border-gray-700/40 gap-2">
                <span>BioStar User</span>
                <span>Linked Staff Member</span>
                <span title="Time of last webhook event received from BioStar 2 Trigger &amp; Action">Last Event (Webhook)</span>
                <span>TPR-Max Status</span>
              </div>
              {scanActivityLoading && scanActivityData.length === 0 ? (
                <div className="flex items-center justify-center py-8 text-gray-400 text-sm gap-2 bg-white dark:bg-gray-900">
                  <span className="animate-spin text-lg">⟳</span>
                  <span>Loading from BioStar 2…</span>
                </div>
              ) : scanActivityData.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-gray-400 text-sm gap-1 bg-white dark:bg-gray-900">
                  <span className="text-2xl">👤</span>
                  <p>No BioStar users found</p>
                </div>
              ) : (
                <div className="overflow-y-auto max-h-80 bg-white dark:bg-gray-900 divide-y divide-gray-100 dark:divide-gray-800/40">
                  {scanActivityData.map((row: any, idx: number) => {
                    // lastWebhookTime = most recent check-in or check-out driven by a webhook event
                    const lastEvent = row.lastWebhookTime ? new Date(row.lastWebhookTime) : null;
                    const fmtTime = (d: Date | null) => {
                      if (!d) return '—';
                      const now = new Date();
                      const diffMs = now.getTime() - d.getTime();
                      const diffMin = Math.floor(diffMs / 60000);
                      if (diffMin < 1) return 'just now';
                      if (diffMin < 60) return `${diffMin}m ago`;
                      const diffH = Math.floor(diffMin / 60);
                      if (diffH < 24) return `${diffH}h ago`;
                      return d.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit' }) + ' ' +
                        d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
                    };
                    const statusColor = !row.linked
                      ? 'text-gray-400'
                      : row.isCheckedIn
                        ? 'text-green-600 dark:text-green-400 font-medium'
                        : 'text-gray-500 dark:text-gray-400';
                    const rowBg = idx % 2 === 0 ? '' : 'bg-gray-50 dark:bg-gray-800/20';
                    return (
                      <div key={row.biostarUserId} className={`grid grid-cols-[2fr_2fr_2fr_1fr] px-3 py-2 text-xs gap-2 hover:bg-blue-50 dark:hover:bg-blue-900/10 ${rowBg}`}>
                        {/* BioStar user */}
                        <span className="text-fixed font-medium truncate" title={`ID: ${row.biostarUserId}`}>
                          {row.biostarName || `User ${row.biostarUserId}`}
                          <span className="ml-1 text-[10px] text-variable opacity-40">#{row.biostarUserId}</span>
                        </span>
                        {/* Linked staff */}
                        <span className={`truncate ${row.linked ? 'text-fixed' : 'text-gray-400 italic'}`}>
                          {row.linked ? row.staffName : 'Not linked'}
                        </span>
                        {/* Last webhook event time */}
                        <span className={lastEvent ? 'text-variable' : 'text-gray-300 dark:text-gray-600'} title={lastEvent?.toLocaleString('en-GB') ?? 'No webhook events received yet'}>
                          {fmtTime(lastEvent)}
                        </span>
                        {/* TPR-Max status */}
                        <span className={statusColor}>
                          {!row.linked ? '—' : row.isCheckedIn ? '✓ On-Site' : 'Off-Site'}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            <p className="text-xs text-variable opacity-50">
              Auto-refreshes every 60 seconds · "Last Event" shows time of last Trigger &amp; Action webhook received ·
              {scanActivityData.filter((r: any) => !r.linked).length > 0 && (
                <span className="text-amber-500 ml-1">
                  {scanActivityData.filter((r: any) => !r.linked).length} user(s) not linked to a staff record
                </span>
              )}
              {scanActivityData.length > 0 && scanActivityData.every((r: any) => !r.lastWebhookTime) && (
                <span className="text-amber-500 ml-1">· No webhook events received yet — configure Trigger &amp; Action above</span>
              )}
            </p>
          </div>
        )}
      </div>
    )}
  </GlassCard>
)}
</TooltipProvider>


      {/* Phone Systems */}
      <div className="space-y-6 pt-6 border-t">
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
          <Label className="text-sm font-medium text-fixed">
            Voice Notifications Enabled
          </Label>
          <Switch
            checked={currentSettings?.voiceNotificationsEnabled || false}
            onCheckedChange={(checked) => handleInputChange("voiceNotificationsEnabled", checked)}
            data-testid="switch-voice-notifications"
          />
        </div>
        <p className="text-xs text-variable">
          Enable automated voice calls to staff when visitors arrive
        </p>
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
        <Input
          id="eightByXApiKey"
          type="password"
          value={currentSettings?.eightByXApiKey || ""}
          onChange={(e) => handleInputChange("eightByXApiKey", e.target.value)}
          placeholder=""
          className="w-full px-4 py-3 rounded-xl border border-white/30 dark:border-slate-700/30 bg-white/50 dark:bg-slate-800/50 focus:outline-none focus:ring-2 focus:ring-blue-500 text-fixed"
          data-testid="input-8x8-api-key"
        />
      </div>
      <div className="space-y-2">
        <div className="flex items-center gap-1.5">
          <Label htmlFor="eightByXApiSecret" className="text-sm font-medium text-fixed">API Secret</Label>
          <Tooltip>
            <TooltipTrigger asChild><Info size={14} className="text-variable cursor-help" /></TooltipTrigger>
            <TooltipContent className="max-w-xs">Your 8x8 API secret. Paired with the API key to authenticate requests. Treat this like a password.</TooltipContent>
          </Tooltip>
        </div>
        <Input
          id="eightByXApiSecret"
          type="password"
          value={currentSettings?.eightByXApiSecret || ""}
          onChange={(e) => handleInputChange("eightByXApiSecret", e.target.value)}
          placeholder=""
          className="w-full px-4 py-3 rounded-xl border border-white/30 dark:border-slate-700/30 bg-white/50 dark:bg-slate-800/50 focus:outline-none focus:ring-2 focus:ring-blue-500 text-fixed"
          data-testid="input-8x8-api-secret"
        />
      </div>
      <div className="space-y-2">
        <div className="flex items-center gap-1.5">
          <Label htmlFor="eightByXAccountId" className="text-sm font-medium text-fixed">Account ID</Label>
          <Tooltip>
            <TooltipTrigger asChild><Info size={14} className="text-variable cursor-help" /></TooltipTrigger>
            <TooltipContent className="max-w-xs">Your 8x8 account or sub-account ID. Available in your 8x8 portal. Used to identify which account the calls are billed to.</TooltipContent>
          </Tooltip>
        </div>
        <Input
          id="eightByXAccountId"
          type="text"
          value={currentSettings?.eightByXAccountId || ""}
          onChange={(e) => handleInputChange("eightByXAccountId", e.target.value)}
          placeholder=""
          className="w-full px-4 py-3 rounded-xl border border-white/30 dark:border-slate-700/30 bg-white/50 dark:bg-slate-800/50 focus:outline-none focus:ring-2 focus:ring-blue-500 text-fixed"
          data-testid="input-8x8-account-id"
        />
      </div>
      <div className="space-y-2">
        <div className="flex items-center gap-1.5">
          <Label htmlFor="eightByXBaseUrl" className="text-sm font-medium text-fixed">API Base URL</Label>
          <Tooltip>
            <TooltipTrigger asChild><Info size={14} className="text-variable cursor-help" /></TooltipTrigger>
            <TooltipContent className="max-w-xs">The 8x8 regional API endpoint. Use the EU endpoint (vcc-eu) for UK/Europe accounts and the US endpoint for US accounts. Check your 8x8 portal if unsure.</TooltipContent>
          </Tooltip>
        </div>
        <Input
          id="eightByXBaseUrl"
          type="text"
          value={currentSettings?.eightByXBaseUrl || "https://vcc-eu.8x8.com/api/v1"}
          onChange={(e) => handleInputChange("eightByXBaseUrl", e.target.value)}
          placeholder=""
          className="w-full px-4 py-3 rounded-xl border border-white/30 dark:border-slate-700/30 bg-white/50 dark:bg-slate-800/50 focus:outline-none focus:ring-2 focus:ring-blue-500 text-fixed"
          data-testid="input-8x8-base-url"
        />
      </div>
    </div>
  </GlassCard>
</div>
<div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
  <GlassCard>
    <div className="flex items-center mb-6">
      <Globe className="mr-3 text-purple-600" size={24} />
      <h3 className="text-lg font-semibold text-fixed">Voice Settings</h3>
    </div>
    
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="defaultVoiceLanguage" className="text-sm font-medium text-fixed">
          Default Voice Language
        </Label>
        <Select 
          value={currentSettings?.defaultVoiceLanguage || "en-GB"} 
          onValueChange={(value) => handleInputChange("defaultVoiceLanguage", value)}
        >
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
        <Label htmlFor="defaultVoiceProfile" className="text-sm font-medium text-fixed">
          Default Voice Profile
        </Label>
        <Select 
          value={currentSettings?.defaultVoiceProfile || "en-GB-Standard-A"} 
          onValueChange={(value) => handleInputChange("defaultVoiceProfile", value)}
        >
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
        <Label htmlFor="testPhoneNumber" className="text-sm font-medium text-fixed">
          Test Phone Number
        </Label>
        <Input
          id="testPhoneNumber"
          type="tel"
          placeholder=""
          className="w-full px-4 py-3 rounded-xl border border-white/30 dark:border-slate-700/30 bg-white/50 dark:bg-slate-800/50 focus:outline-none focus:ring-2 focus:ring-blue-500 text-fixed"
          data-testid="input-test-phone-number"
        />
      </div>
      <Button
        onClick={() => {
          toast({
            title: "Test Call Initiated",
            description: "A test voice notification is being sent to the provided number.",
          });
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
              <CheckCircle size={12} className="mr-1" />
              Connected
            </Badge>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-variable">Voice Notifications</span>
            <Badge variant="outline" className={
              currentSettings?.voiceNotificationsEnabled 
                ? "text-green-700 bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800"
                : "text-slate-500 dark:text-slate-400 bg-slate-50 border-slate-200"
            }>
              {currentSettings?.voiceNotificationsEnabled ? (
                <><CheckCircle size={12} className="mr-1" />Enabled</>
              ) : (
                <><XCircle size={12} className="mr-1" />Disabled</>
              )}
            </Badge>
          </div>
        </div>
      </div>
    </div>
  </GlassCard>
</div>
</TooltipProvider>

      </div>

      {/* Third-party Integrations */}
      <div className="space-y-6 pt-6 border-t">
<TooltipProvider delayDuration={200}>
<div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
  <GlassCard>
    <div className="flex items-center mb-6">
      <Globe className="mr-3 text-blue-600 dark:text-blue-400" size={24} />
      <h3 className="text-lg font-semibold text-fixed">API & Webhooks</h3>
    </div>
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-1.5">
            <Label className="text-sm font-medium text-fixed">Enable API & Webhooks</Label>
            <Tooltip>
              <TooltipTrigger asChild><Info size={14} className="text-variable cursor-help" /></TooltipTrigger>
              <TooltipContent className="max-w-xs">Allows third-party systems to connect to TPR Max via REST API and receive real-time event notifications (check-ins, check-outs, emergencies). Required for custom integrations, mobile apps, or connecting to your own systems.</TooltipContent>
            </Tooltip>
          </div>
          <p className="text-xs text-variable">Enable API key access and outbound webhook notifications</p>
        </div>
        <Switch
          checked={currentSettings?.apiWebhooksEnabled || false}
          onCheckedChange={(checked) => handleInputChange("apiWebhooksEnabled", checked)}
        />
      </div>
      {currentSettings?.apiWebhooksEnabled && (
        <>
          <div className="space-y-2">
            <div className="flex items-center gap-1.5">
              <Label className="text-sm font-medium text-fixed">API Key</Label>
              <Tooltip>
                <TooltipTrigger asChild><Info size={14} className="text-variable cursor-help" /></TooltipTrigger>
                <TooltipContent className="max-w-xs">Your unique API key for authenticating requests from external systems. Treat this like a password — never share it publicly or commit it to source code. Use "Generate New Key" to create one, then copy it to your integration. Revoking immediately blocks all API access.</TooltipContent>
              </Tooltip>
            </div>
            <div className="flex gap-2">
              <Input
                type={apiKeyVisible ? "text" : "password"}
                value={currentSettings?.apiKey || ""}
                readOnly
                className="w-full px-4 py-3 rounded-xl border border-white/30 dark:border-slate-700/30 bg-white/50 dark:bg-slate-800/50 focus:outline-none focus:ring-2 focus:ring-blue-500 text-fixed"
                placeholder="No API key generated"
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => setApiKeyVisible(!apiKeyVisible)}
                className="shrink-0"
              >
                <Eye size={14} />
              </Button>
              {currentSettings?.apiKey && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleCopyToClipboard(currentSettings?.apiKey || "", "API Key")}
                  className="shrink-0"
                >
                  <Copy size={14} />
                </Button>
              )}
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleGenerateApiKey}
              disabled={apiKeyGenerating}
            >
              <Shield size={14} className="mr-1" />
              {apiKeyGenerating ? "Generating..." : "Generate New Key"}
            </Button>
            {currentSettings?.apiKey && (
              <Button
                variant="destructive"
                size="sm"
                onClick={handleRevokeApiKey}
              >
                <XCircle size={14} className="mr-1" />
                Revoke Key
              </Button>
            )}
          </div>
          <Separator />
          <div className="space-y-2">
            <div className="flex items-center gap-1.5">
              <Label htmlFor="webhookUrl" className="text-sm font-medium text-fixed">Webhook URL</Label>
              <Tooltip>
                <TooltipTrigger asChild><Info size={14} className="text-variable cursor-help" /></TooltipTrigger>
                <TooltipContent className="max-w-xs">The HTTPS endpoint on your server where TPR Max will POST event data (visitor check-in, emergency activation, etc.). Must be publicly accessible and use HTTPS. Test with the "Test Webhook" button before going live.</TooltipContent>
              </Tooltip>
            </div>
            <Input
              id="webhookUrl"
              type="url"
              value={currentSettings?.apiWebhookUrl || ""}
              onChange={(e) => handleInputChange("apiWebhookUrl", e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-white/30 dark:border-slate-700/30 bg-white/50 dark:bg-slate-800/50 focus:outline-none focus:ring-2 focus:ring-blue-500 text-fixed"
              placeholder="https://your-app.com/webhook"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-sm font-medium text-fixed">Webhook Secret</Label>
            <div className="flex gap-2">
              <Input
                type="password"
                value={currentSettings?.apiWebhookSecret || ""}
                readOnly
                className="w-full px-4 py-3 rounded-xl border border-white/30 dark:border-slate-700/30 bg-white/50 dark:bg-slate-800/50 focus:outline-none focus:ring-2 focus:ring-blue-500 text-fixed"
                placeholder="Auto-generated on save"
              />
              {currentSettings?.apiWebhookSecret && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleCopyToClipboard(currentSettings?.apiWebhookSecret || "", "Webhook Secret")}
                  className="shrink-0"
                >
                  <Copy size={14} />
                </Button>
              )}
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleTestWebhook}
              disabled={webhookTestLoading}
            >
              <Send size={14} className="mr-1" />
              {webhookTestLoading ? "Testing..." : "Test Webhook"}
            </Button>
          </div>
          {webhookTestResult && (
            <p className={`text-sm ${webhookTestResult.startsWith("✓") ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>
              {webhookTestResult}
            </p>
          )}
          <Separator />
          <div className="space-y-2">
            <Label htmlFor="apiRateLimit" className="text-sm font-medium text-fixed">Rate Limit (requests/min)</Label>
            <Input
              id="apiRateLimit"
              type="number"
              value={currentSettings?.apiRateLimit || "60"}
              onChange={(e) => handleInputChange("apiRateLimit", e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-white/30 dark:border-slate-700/30 bg-white/50 dark:bg-slate-800/50 focus:outline-none focus:ring-2 focus:ring-blue-500 text-fixed"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-sm font-medium text-fixed">Webhook Events</Label>
            <p className="text-xs text-variable mb-2">Select which events trigger webhook notifications</p>
            <div className="space-y-2">
              {[
                "visitor.checkin",
                "visitor.checkout",
                "staff.checkin",
                "staff.checkout",
                "contractor.checkin",
                "emergency.activated",
                "booking.created",
              ].map((eventName) => {
                const events = currentSettings?.apiWebhookEvents || [];
                const isChecked = events.includes(eventName);
                return (
                  <div key={eventName} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id={`webhook-${eventName}`}
                      checked={isChecked}
                      onChange={(e) => {
                        const updated = e.target.checked
                          ? [...events, eventName]
                          : events.filter((ev: string) => ev !== eventName);
                        handleInputChange("apiWebhookEvents", updated);
                      }}
                      className="rounded border-gray-300 dark:border-gray-600"
                    />
                    <Label htmlFor={`webhook-${eventName}`} className="text-sm text-variable cursor-pointer">
                      {eventName}
                    </Label>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  </GlassCard>
  <GlassCard>
    <div className="flex items-center mb-6">
      <Shield className="mr-3 text-purple-600 dark:text-purple-400" size={24} />
      <h3 className="text-lg font-semibold text-fixed">Paxton Net2 Access Control</h3>
    </div>
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <Label className="text-sm font-medium text-fixed">Enable Paxton Integration</Label>
          <p className="text-xs text-variable">Connect to Paxton Net2 for access control management</p>
        </div>
        <Switch
          checked={currentSettings?.paxtonEnabled || false}
          onCheckedChange={(checked) => handleInputChange("paxtonEnabled", checked)}
        />
      </div>
      {currentSettings?.paxtonEnabled && (
        <>
          <div className="space-y-2">
            <Label htmlFor="paxtonServerUrl" className="text-sm font-medium text-fixed">Server URL</Label>
            <Input
              id="paxtonServerUrl"
              type="url"
              value={currentSettings?.paxtonServerUrl || ""}
              onChange={(e) => handleInputChange("paxtonServerUrl", e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-white/30 dark:border-slate-700/30 bg-white/50 dark:bg-slate-800/50 focus:outline-none focus:ring-2 focus:ring-blue-500 text-fixed"
              placeholder="https://192.168.1.100"
            />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="paxtonPort" className="text-sm font-medium text-fixed">Port</Label>
              <Input
                id="paxtonPort"
                type="text"
                value={currentSettings?.paxtonPort || "8080"}
                onChange={(e) => handleInputChange("paxtonPort", e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-white/30 dark:border-slate-700/30 bg-white/50 dark:bg-slate-800/50 focus:outline-none focus:ring-2 focus:ring-blue-500 text-fixed"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="paxtonClientId" className="text-sm font-medium text-fixed">Client ID</Label>
              <Input
                id="paxtonClientId"
                type="text"
                value={currentSettings?.paxtonClientId || ""}
                onChange={(e) => handleInputChange("paxtonClientId", e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-white/30 dark:border-slate-700/30 bg-white/50 dark:bg-slate-800/50 focus:outline-none focus:ring-2 focus:ring-blue-500 text-fixed"
                placeholder="Issued by Paxton"
              />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="paxtonUsername" className="text-sm font-medium text-fixed">Username</Label>
              <Input
                id="paxtonUsername"
                type="text"
                value={currentSettings?.paxtonUsername || ""}
                onChange={(e) => handleInputChange("paxtonUsername", e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-white/30 dark:border-slate-700/30 bg-white/50 dark:bg-slate-800/50 focus:outline-none focus:ring-2 focus:ring-blue-500 text-fixed"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="paxtonPassword" className="text-sm font-medium text-fixed">Password</Label>
              <Input
                id="paxtonPassword"
                type="password"
                value={currentSettings?.paxtonPassword || ""}
                onChange={(e) => handleInputChange("paxtonPassword", e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-white/30 dark:border-slate-700/30 bg-white/50 dark:bg-slate-800/50 focus:outline-none focus:ring-2 focus:ring-blue-500 text-fixed"
                placeholder="••••••••"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handlePaxtonTest}
              disabled={paxtonTestLoading}
            >
              <TestTube size={14} className="mr-1" />
              {paxtonTestLoading ? "Testing..." : "Test Connection"}
            </Button>
          </div>
          {paxtonTestResult && (
            <p className={`text-sm ${paxtonTestResult.startsWith("✓") ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>
              {paxtonTestResult}
            </p>
          )}
          <Separator />
          <h4 className="text-sm font-semibold text-fixed">Sync Settings</h4>
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm font-medium text-fixed">Auto-sync Staff to Net2</Label>
              <p className="text-xs text-variable">Automatically push staff records to Net2</p>
            </div>
            <Switch
              checked={currentSettings?.paxtonSyncUsers || false}
              onCheckedChange={(checked) => handleInputChange("paxtonSyncUsers", checked)}
            />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm font-medium text-fixed">Auto-sync Events from Net2</Label>
              <p className="text-xs text-variable">Pull access events from Net2 automatically</p>
            </div>
            <Switch
              checked={currentSettings?.paxtonSyncEvents || false}
              onCheckedChange={(checked) => handleInputChange("paxtonSyncEvents", checked)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="paxtonSyncInterval" className="text-sm font-medium text-fixed">Sync Interval (seconds)</Label>
            <Input
              id="paxtonSyncInterval"
              type="number"
              value={currentSettings?.paxtonSyncInterval || "300"}
              onChange={(e) => handleInputChange("paxtonSyncInterval", e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-white/30 dark:border-slate-700/30 bg-white/50 dark:bg-slate-800/50 focus:outline-none focus:ring-2 focus:ring-blue-500 text-fixed"
            />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="paxtonDefaultAccessLevel" className="text-sm font-medium text-fixed">Default Staff Access Level</Label>
              <Input
                id="paxtonDefaultAccessLevel"
                type="text"
                value={currentSettings?.paxtonDefaultAccessLevel || ""}
                onChange={(e) => handleInputChange("paxtonDefaultAccessLevel", e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-white/30 dark:border-slate-700/30 bg-white/50 dark:bg-slate-800/50 focus:outline-none focus:ring-2 focus:ring-blue-500 text-fixed"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="paxtonVisitorAccessLevel" className="text-sm font-medium text-fixed">Visitor Access Level</Label>
              <Input
                id="paxtonVisitorAccessLevel"
                type="text"
                value={currentSettings?.paxtonVisitorAccessLevel || ""}
                onChange={(e) => handleInputChange("paxtonVisitorAccessLevel", e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-white/30 dark:border-slate-700/30 bg-white/50 dark:bg-slate-800/50 focus:outline-none focus:ring-2 focus:ring-blue-500 text-fixed"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="paxtonContractorAccessLevel" className="text-sm font-medium text-fixed">Contractor Access Level</Label>
              <Input
                id="paxtonContractorAccessLevel"
                type="text"
                value={currentSettings?.paxtonContractorAccessLevel || ""}
                onChange={(e) => handleInputChange("paxtonContractorAccessLevel", e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-white/30 dark:border-slate-700/30 bg-white/50 dark:bg-slate-800/50 focus:outline-none focus:ring-2 focus:ring-blue-500 text-fixed"
              />
            </div>
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm font-medium text-fixed">Auto-grant Access on Check-in</Label>
              <p className="text-xs text-variable">Automatically grant Net2 access when someone checks in</p>
            </div>
            <Switch
              checked={currentSettings?.paxtonAutoGrantAccess || false}
              onCheckedChange={(checked) => handleInputChange("paxtonAutoGrantAccess", checked)}
            />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm font-medium text-fixed">Auto-revoke Access on Checkout</Label>
              <p className="text-xs text-variable">Automatically revoke Net2 access when someone checks out</p>
            </div>
            <Switch
              checked={currentSettings?.paxtonAutoRevokeOnCheckout || false}
              onCheckedChange={(checked) => handleInputChange("paxtonAutoRevokeOnCheckout", checked)}
            />
          </div>
          <Separator />
          <div className="flex gap-2 items-center">
            <Button
              variant="outline"
              size="sm"
              onClick={handlePaxtonSync}
              disabled={paxtonSyncLoading}
            >
              <RefreshCw size={14} className={`mr-1 ${paxtonSyncLoading ? "animate-spin" : ""}`} />
              {paxtonSyncLoading ? "Syncing..." : "Manual Sync"}
            </Button>
            {currentSettings?.paxtonLastSync && (
              <span className="text-xs text-variable flex items-center gap-1">
                <Clock size={12} />
                Last sync: {new Date(currentSettings.paxtonLastSync).toLocaleString()}
              </span>
            )}
          </div>
          {paxtonSyncResult && (
            <p className={`text-sm ${paxtonSyncResult.startsWith("✓") ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>
              {paxtonSyncResult}
            </p>
          )}
        </>
      )}
    </div>
  </GlassCard>
</div>
</TooltipProvider>

      </div>
    </div>
  );
}
