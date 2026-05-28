import { useState, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useSettingsAutoSave } from "@/hooks/useSettingsAutoSave";
import GlassCard from "@/components/GlassCard";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { Server, HardDrive, Database, RotateCcw, Download, FolderOpen, CheckCircle, XCircle, RefreshCw, Upload, Activity, BarChart3, Clock, Globe, TestTube, Zap, Info, AlertTriangle, Bell, Calendar, Users, BadgeCheck, Building, CalendarPlus, Dock, File, FileEdit, Flame, FlaskConical, HardHat, Lock, Mail, Monitor, ScrollText, Settings2, SettingsIcon, Shield, ShieldCheck, ClipboardList, ClipboardCheck, Ticket, UserCheck, UserPlus, Video, Wrench, Trash2 } from "lucide-react";

export default function SystemSettings() {
  const { currentSettings, handleInputChange } = useSettingsAutoSave();
  const isPlatformLocked = (key: string) => (currentSettings?.platformDisabledFeatures ?? []).includes(key);
  const { toast } = useToast();
  const [selectedBackupFile, setSelectedBackupFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showManualResetDialog, setShowManualResetDialog] = useState(false);
  const [isManualResetDisabled, setIsManualResetDisabled] = useState(false);
  const [showClearSampleDataDialog, setShowClearSampleDataDialog] = useState(false);

  const { data: systemStatus } = useQuery<{
    success: boolean;
    services: { database: boolean; email: boolean; workflow: boolean; storage?: boolean; authentication?: boolean; };
    uptime?: number; timestamp: string; version?: string; appName?: string;
  }>({
    queryKey: ["/api/system/status"],
    refetchInterval: 300000,
  });

  const { data: currentUser } = useQuery<{ id: string; username: string; customerId: string; role: string }>({
    queryKey: ["/api/auth/me"],
  });

  const backupMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("GET", "/api/system/backup");
      if (!response.ok) { const errorData = await response.json(); throw new Error(errorData.error || "Failed to create backup"); }
      return response.blob();
    },
    onSuccess: (blob) => {
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      a.href = url; a.download = `tprmax-backup-${timestamp}.bak`;
      document.body.appendChild(a); a.click();
      window.URL.revokeObjectURL(url); document.body.removeChild(a);
      toast({ title: "Backup Complete", description: "Your backup file has been downloaded." });
    },
    onError: (error: any) => {
      toast({ title: "Backup Failed", description: error.message || "Failed to create database backup", variant: "destructive" });
    },
  });

  const restoreMutation = useMutation({
    mutationFn: async (backupData: any) => {
      const response = await apiRequest("POST", "/api/system/restore", { backupData });
      if (!response.ok) { const err = await response.json(); throw new Error(err.error || "Failed to restore database"); }
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ predicate: () => true });
      toast({ title: "Restore Complete", description: `Successfully restored ${data.restored?.records ?? 0} records across ${data.restored?.tables ?? 0} tables` });
      setSelectedBackupFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    },
    onError: (error: any) => {
      toast({ title: "Restore Failed", description: error.message || "Failed to restore database", variant: "destructive" });
    },
  });

  const manualResetMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/daily-reset/manual");
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
      queryClient.invalidateQueries({ queryKey: ["/api/visitors/current"] });
      queryClient.invalidateQueries({ queryKey: ["/api/visitors"] });
      queryClient.invalidateQueries({ queryKey: ["/api/staff/checked-in"] });
      queryClient.invalidateQueries({ queryKey: ["/api/staff"] });
      queryClient.invalidateQueries({ queryKey: ["/api/contractors"] });
      queryClient.invalidateQueries({ queryKey: ["/api/muster"] });
      queryClient.invalidateQueries({ queryKey: ["/api/activity/recent"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      toast({ title: "Manual Reset Complete", description: `Checked out ${data.visitorsCheckedOut} visitors, ${data.staffCheckedOut} staff, and ${data.contractorsCheckedOut} contractors.` });
    },
    onError: () => { toast({ title: "Error", description: "Failed to perform manual reset", variant: "destructive" }); },
  });

  const testResetMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/daily-reset/preview");
      return response.json();
    },
    onSuccess: (data) => {
      toast({ title: "Reset Preview", description: `Would check out: ${data.visitorsToCheckOut} visitors, ${data.staffToCheckOut} staff, ${data.contractorsToCheckOut} contractors.` });
    },
    onError: () => { toast({ title: "Error", description: "Failed to preview daily reset", variant: "destructive" }); },
  });

  const importMutation = useMutation({
    mutationFn: async (data: { file: File; type: 'staff' | 'visitors' | 'contractors' | 'members' }) => {
      const formData = new FormData();
      formData.append('file', data.file);
      const response = await fetch(`/api/import/${data.type}`, { method: 'POST', body: formData, credentials: 'include' });
      if (!response.ok) { const error = await response.json(); throw new Error(error.details || error.error || 'Import failed'); }
      return response.json();
    },
    onSuccess: (data, variables) => {
      const { type } = variables; const { results } = data;
      if (type === 'staff') queryClient.invalidateQueries({ queryKey: ["/api/staff"] });
      else if (type === 'visitors') { queryClient.invalidateQueries({ queryKey: ["/api/visitors/current"] }); queryClient.invalidateQueries({ queryKey: ["/api/visitors/today"] }); }
      else if (type === 'contractors') queryClient.invalidateQueries({ queryKey: ["/api/contractors/checked-in"] });
      else if (type === 'members') queryClient.invalidateQueries({ queryKey: ["/api/members"] });
      toast({ title: "Import Complete!", description: `Successfully imported ${results.successful} ${type}. ${results.failed > 0 ? `${results.failed} failed.` : ''}` });
      if (results.errors?.length > 0) setTimeout(() => toast({ title: "Import Errors", description: `${results.errors.length} records failed.`, variant: "destructive" }), 1500);
    },
    onError: (error: any) => { toast({ title: "Import Failed", description: error.message || "Failed to import file", variant: "destructive" }); },
  });

  const { data: sampleDataStatus, refetch: refetchSampleStatus } = useQuery<{ exists: boolean; staffCount: number }>({
    queryKey: ['/api/import/sample-data-status'],
  });
  const sampleDataExists = sampleDataStatus?.exists ?? false;

  const sampleDataMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('POST', '/api/import/sample-data', {});
      if (!response.ok) { const error = await response.json(); throw new Error(error.error || 'Failed to load sample data'); }
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/staff"] });
      queryClient.invalidateQueries({ queryKey: ["/api/visitors"] });
      queryClient.invalidateQueries({ queryKey: ["/api/visitors/current"] });
      queryClient.invalidateQueries({ queryKey: ["/api/visitors/today"] });
      queryClient.invalidateQueries({ queryKey: ["/api/prebookings/upcoming"] });
      queryClient.invalidateQueries({ queryKey: ["/api/contractors"] });
      queryClient.invalidateQueries({ queryKey: ["/api/contractors/checked-in"] });
      queryClient.invalidateQueries({ queryKey: ["/api/contractors/workers/all"] });
      queryClient.invalidateQueries({ queryKey: ["/api/members"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/import/sample-data-status"] });
      toast({ title: "Sample Data Loaded!", description: data.message });
    },
    onError: (error: any) => { toast({ title: "Failed to Load Sample Data", description: error.message || "An error occurred", variant: "destructive" }); },
  });

  const clearSampleDataMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('POST', '/api/import/clear-sample-data', {});
      if (!response.ok) { const error = await response.json(); throw new Error(error.error || 'Failed to clear sample data'); }
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/staff"] });
      queryClient.invalidateQueries({ queryKey: ["/api/visitors"] });
      queryClient.invalidateQueries({ queryKey: ["/api/visitors/current"] });
      queryClient.invalidateQueries({ queryKey: ["/api/visitors/today"] });
      queryClient.invalidateQueries({ queryKey: ["/api/prebookings/upcoming"] });
      queryClient.invalidateQueries({ queryKey: ["/api/contractors"] });
      queryClient.invalidateQueries({ queryKey: ["/api/contractors/checked-in"] });
      queryClient.invalidateQueries({ queryKey: ["/api/contractors/workers/all"] });
      queryClient.invalidateQueries({ queryKey: ["/api/members"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/hr"] });
      queryClient.invalidateQueries({ queryKey: ["/api/import/sample-data-status"] });
      toast({ title: "Sample Data Cleared!", description: data.message });
    },
    onError: (error: any) => { toast({ title: "Failed to Clear Sample Data", description: error.message || "An error occurred", variant: "destructive" }); },
  });

  const handleBackupDatabase = () => backupMutation.mutate();

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      if (!file.name.endsWith('.bak') && !file.name.endsWith('.sql')) {
        toast({ title: "Invalid File", description: "Please select a valid .bak or .sql backup file", variant: "destructive" });
        return;
      }
      setSelectedBackupFile(file);
    }
  };

  const handleRestoreDatabase = () => {
    if (!selectedBackupFile) { toast({ title: "No File Selected", description: "Please select a backup file first", variant: "destructive" }); return; }
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target?.result as string;
        const parsed = JSON.parse(text);
        restoreMutation.mutate(parsed);
      } catch { toast({ title: "Invalid File", description: "The selected file is not a valid TPR Max backup file", variant: "destructive" }); }
    };
    reader.readAsText(selectedBackupFile);
  };

  const handleManualReset = () => setShowManualResetDialog(true);

  const confirmManualReset = () => {
    setIsManualResetDisabled(true);
    setShowManualResetDialog(false);
    manualResetMutation.mutate();
    setTimeout(() => setIsManualResetDisabled(false), 5000);
  };

  const handleTestReset = () => testResetMutation.mutate();

  const handleImportFile = (event: React.ChangeEvent<HTMLInputElement>, type: 'staff' | 'visitors' | 'contractors' | 'members') => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.name.endsWith('.csv')) { toast({ title: "Invalid File", description: "Please upload a CSV file", variant: "destructive" }); return; }
    importMutation.mutate({ file, type });
    event.target.value = '';
  };

  return (
    <div className="space-y-6">
<TooltipProvider delayDuration={200}>
<div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
  <GlassCard className="p-6">
    <h3 className="text-lg font-semibold text-fixed mb-4 flex items-center gap-2">
      <RotateCcw className="w-5 h-5" />
      Daily Reset / End of Day
    </h3>
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-1.5">
            <Label className="text-sm font-medium text-fixed">Enable Daily Reset</Label>
            <Tooltip>
              <TooltipTrigger asChild><Info size={14} className="text-variable cursor-help" /></TooltipTrigger>
              <TooltipContent className="max-w-xs">Automatically checks out all visitors, contractors, and staff who are still shown as on-site at a set time each day. Prevents the register from accumulating stale "on-site" records overnight. Recommended for all sites.</TooltipContent>
            </Tooltip>
          </div>
          <p className="text-xs text-variable">Automatically check out all personnel at end of day</p>
        </div>
        <Switch
          checked={currentSettings?.enableDailyReset !== false}
          onCheckedChange={(checked) => handleInputChange("enableDailyReset", checked)}
          data-testid="switch-daily-reset"
        />
      </div>
      {currentSettings?.enableDailyReset !== false && (
        <div className="space-y-4 pl-4 border-l-2 border-blue-200 dark:border-blue-800">
          <div className="space-y-2">
            <div className="flex items-center gap-1.5">
              <Label htmlFor="dailyResetTime" className="text-sm font-medium text-fixed">Reset Time</Label>
              <Tooltip>
                <TooltipTrigger asChild><Info size={14} className="text-variable cursor-help" /></TooltipTrigger>
                <TooltipContent className="max-w-xs">The time at which the daily checkout occurs. Midnight (00:00) is the default and suits most sites. If your shift ends at a different time (e.g. 18:00), set accordingly. Uses the timezone selected below.</TooltipContent>
              </Tooltip>
            </div>
            <div className="flex gap-2">
              <Input
                id="dailyResetTime"
                type="time"
                value={currentSettings?.dailyResetTime || "00:00"}
                onChange={(e) => handleInputChange("dailyResetTime", e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-white/30 dark:border-slate-700/30 bg-white/50 dark:bg-slate-800/50"
                data-testid="input-reset-time"
              />
              <Select
                value={currentSettings?.dailyResetTimezone || "Europe/London"}
                onValueChange={(value) => handleInputChange("dailyResetTimezone", value)}
              >
                <SelectTrigger className="w-48 px-4 py-3 rounded-xl border border-white/30 dark:border-slate-700/30 bg-white/50 dark:bg-slate-800/50" data-testid="select-timezone">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Europe/London">London (GMT/BST)</SelectItem>
                  <SelectItem value="Europe/Dublin">Dublin (GMT/IST)</SelectItem>
                  <SelectItem value="Europe/Paris">Paris (CET/CEST)</SelectItem>
                  <SelectItem value="Europe/Berlin">Berlin (CET/CEST)</SelectItem>
                  <SelectItem value="America/New_York">New York (EST/EDT)</SelectItem>
                  <SelectItem value="America/Los_Angeles">Los Angeles (PST/PDT)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <p className="text-xs text-variable">Time when daily reset will automatically occur</p>
          </div>
          <div className="space-y-2">
            <div className="flex items-center gap-1.5">
              <Label htmlFor="gracePeriod" className="text-sm font-medium text-fixed">Grace Period (minutes)</Label>
              <Tooltip>
                <TooltipTrigger asChild><Info size={14} className="text-variable cursor-help" /></TooltipTrigger>
                <TooltipContent className="max-w-xs">How many minutes before the reset time a warning is sent to personnel still on-site. 15 minutes gives people enough notice to self-checkout or update their records. Set to 0 to disable pre-warnings.</TooltipContent>
              </Tooltip>
            </div>
            <Input
              id="gracePeriod"
              type="number"
              min="0"
              max="60"
              value={currentSettings?.gracePeriodMinutes || "15"}
              onChange={(e) => handleInputChange("gracePeriodMinutes", e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-white/30 dark:border-slate-700/30 bg-white/50 dark:bg-slate-800/50"
              data-testid="input-grace-period"
            />
            <p className="text-xs text-variable">Time to alert personnel before automatic checkout</p>
          </div>
        </div>
      )}
    </div>
  </GlassCard>
  <GlassCard className="p-6">
    <div className="flex items-center justify-between mb-4">
      <h3 className="text-lg font-semibold text-fixed flex items-center gap-2">
        <Database className="w-5 h-5" />
        System Status
      </h3>
      <Button
        variant="outline"
        size="sm"
        onClick={() => queryClient.invalidateQueries({ queryKey: ["/api/system/status"] })}
        className="flex items-center gap-1.5 text-xs"
      >
        <RefreshCw className="w-3.5 h-3.5" />
        Refresh
      </Button>
    </div>
    {/* Version badge */}
    <div className="flex items-center justify-between p-3 mb-3 bg-gradient-to-r from-blue-50/80 to-indigo-50/80 dark:from-blue-900/20 dark:to-indigo-900/20 border border-blue-200/50 dark:border-blue-700/30 rounded-lg">
      <div className="flex items-center gap-2">
        <Info className="w-4 h-4 text-blue-500" />
        <span className="text-sm font-medium">Application Version</span>
      </div>
      <Badge variant="secondary" className="font-mono text-xs bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-700">
        {systemStatus?.version ?? "—"}
      </Badge>
    </div>
    <div className="space-y-3">
      <div className="flex items-center justify-between p-3 bg-white/50 dark:bg-slate-800/50 rounded-lg">
        <div className="flex items-center gap-2">
          <Database className="w-4 h-4" />
          <span className="text-sm font-medium">Database</span>
        </div>
        {systemStatus?.services?.database ? (
          <CheckCircle className="w-5 h-5 text-green-500" />
        ) : (
          <XCircle className="w-5 h-5 text-red-500" />
        )}
      </div>
      <div className="flex items-center justify-between p-3 bg-white/50 dark:bg-slate-800/50 rounded-lg">
        <div className="flex items-center gap-2">
          <Mail className="w-4 h-4" />
          <span className="text-sm font-medium">Email Service</span>
        </div>
        {systemStatus?.services?.email ? (
          <CheckCircle className="w-5 h-5 text-green-500" />
        ) : (
          <XCircle className="w-5 h-5 text-red-500" />
        )}
      </div>
      <div className="flex items-center justify-between p-3 bg-white/50 dark:bg-slate-800/50 rounded-lg">
        <div className="flex items-center gap-2">
          <Server className="w-4 h-4" />
          <span className="text-sm font-medium">Authentication</span>
        </div>
        <CheckCircle className="w-5 h-5 text-green-500" />
      </div>
      <div className="pt-1">
        <Button
          variant="outline"
          className="w-full flex items-center gap-2 text-sm"
          onClick={async () => {
            try {
              const res = await fetch("/api/diagnostics/report", { credentials: "include" });
              if (!res.ok) throw new Error("Failed to fetch diagnostics");
              const data = await res.json();
              const lines = [
                "========================================",
                "  TPR MAX — DIAGNOSTIC REPORT",
                "========================================",
                "",
                `Generated:      ${new Date(data.generatedAt).toLocaleString()}`,
                `App Version:    ${data.version}`,
                `Company:        ${data.companyName}`,
                `Logged In As:   ${data.loggedInUser}`,
                `Environment:    ${data.environment}`,
                `Server Uptime:  ${data.serverUptime}`,
                `Node Version:   ${data.nodeVersion}`,
                "",
                "--- BROWSER ---",
                `User Agent:     ${navigator.userAgent}`,
                `Platform:       ${navigator.platform}`,
                `Language:       ${navigator.language}`,
                `Screen:         ${screen.width}x${screen.height}`,
                "",
                "--- SERVICES ---",
                `Database:       ${data.services.database ? "✓ OK" : "✗ Error"}`,
                `Email:          ${data.services.email ? "✓ Configured" : "✗ Not configured"}`,
                `Authentication: ${data.services.authentication ? "✓ OK" : "✗ Error"}`,
                "",
                "--- MEMORY ---",
                `Heap Used:      ${data.memoryMB.heapUsed} MB`,
                `Heap Total:     ${data.memoryMB.heapTotal} MB`,
                `RSS:            ${data.memoryMB.rss} MB`,
                "",
                "========================================",
                "  Please email this file to support",
                "  when reporting an issue.",
                "========================================",
              ];
              const blob = new Blob([lines.join("\n")], { type: "text/plain" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = `tprmax-diagnostics-${new Date().toISOString().slice(0, 10)}.txt`;
              a.click();
              URL.revokeObjectURL(url);
              toast({ title: "Diagnostics downloaded", description: "Email this file to support if you need help." });
            } catch (e: any) {
              toast({ title: "Error", description: "Could not generate diagnostics report.", variant: "destructive" });
            }
          }}
        >
          <Download className="w-4 h-4" />
          Download Diagnostic Report
        </Button>
        <p className="text-xs text-variable mt-1.5 text-center">
          Generates a safe, sanitised file — no passwords or sensitive data included
        </p>
      </div>
    </div>
  </GlassCard>
</div>
<div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
  <GlassCard className="p-6">
    <h3 className="text-lg font-semibold text-fixed mb-4 flex items-center gap-2">
      <Database className="w-5 h-5" />
      Database Backup
    </h3>
    <div className="space-y-4">
      <p className="text-sm text-variable">
        Export all customer data including settings, branding, staff, visitors, and operational data to a SQL Server .bak file.
      </p>
      <Button 
        onClick={handleBackupDatabase}
        disabled={backupMutation.isPending}
        className="gradient-blue text-white w-full"
        data-testid="button-backup-database"
      >
        {backupMutation.isPending ? (
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            Creating Backup...
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <Download className="w-4 h-4" />
            Download Database Backup
          </div>
        )}
      </Button>
      <div className="p-3 bg-green-50 dark:bg-green-900/30 rounded-lg border border-green-200 dark:border-green-800">
        <p className="text-xs text-green-800 dark:text-green-200">
          <strong>✅ SQL Server Compatible:</strong> .bak file format compatible with SQL Server Management Studio for database restore
        </p>
      </div>
    </div>
  </GlassCard>
  <GlassCard className="p-6">
    <h3 className="text-lg font-semibold text-fixed mb-4 flex items-center gap-2">
      <Upload className="w-5 h-5" />
      Database Restore
    </h3>
    <div className="space-y-4">
      <p className="text-sm text-variable">
        Restore customer data from a previously exported .bak or .sql backup file. This will replace all current data.
      </p>
      <div className="space-y-2">
        <input
          ref={fileInputRef}
          type="file"
          accept=".bak,.sql"
          onChange={handleFileSelect}
          className="hidden"
          data-testid="input-backup-file"
        />
        <Button 
          variant="outline"
          onClick={() => fileInputRef.current?.click()}
          className="w-full"
          data-testid="button-select-backup"
        >
          <FolderOpen className="w-4 h-4 mr-2" />
          Select Backup File
        </Button>
        
        {selectedBackupFile && (
          <div className="p-2 bg-blue-50 dark:bg-blue-900/30 rounded border border-blue-200 dark:border-blue-800">
            <p className="text-sm text-blue-800 dark:text-blue-200 font-medium">
              📄 {selectedBackupFile.name}
            </p>
            <p className="text-xs text-blue-600 dark:text-blue-400 dark:text-blue-300">
              {(selectedBackupFile.size / 1024 / 1024).toFixed(2)} MB
            </p>
          </div>
        )}
      </div>
      
      <Button 
        variant="destructive"
        onClick={handleRestoreDatabase}
        disabled={!selectedBackupFile || restoreMutation.isPending}
        className="w-full"
        data-testid="button-restore-database"
      >
        {restoreMutation.isPending ? (
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            Restoring Database...
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <RefreshCw className="w-4 h-4" />
            Restore Database
          </div>
        )}
      </Button>
      
      <div className="p-3 bg-red-50 dark:bg-red-900/30 rounded-lg border border-red-200 dark:border-red-800">
        <p className="text-xs text-red-800 dark:text-red-200">
          <strong>⚠️ Warning:</strong> This will completely replace all existing data with the backup data
        </p>
      </div>
    </div>
  </GlassCard>
</div>

{/* Import Feature Section */}
<div className="mt-6">
  <GlassCard className="p-6">
    <h3 className="text-lg font-semibold text-fixed mb-4 flex items-center gap-2">
      <Upload className="w-5 h-5" />
      Bulk Import
    </h3>
    <p className="text-sm text-variable mb-6">
      Import staff, visitors, contractors, and members in bulk using CSV files. Download the template, fill it out, and upload it back.
    </p>
    
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {/* Staff Import */}
      <div className="p-4 bg-white/50 dark:bg-slate-800/50 rounded-lg border">
        <div className="flex items-center gap-2 mb-3">
          <Users className="w-5 h-5 text-blue-600 dark:text-blue-400" />
          <h4 className="font-medium text-fixed">Staff Import</h4>
        </div>
        <p className="text-xs text-variable mb-4">
          Import multiple staff members with their details
        </p>
        <div className="space-y-2">
          <Button
            variant="outline"
            size="sm"
            className="w-full"
            onClick={() => {
              window.open('/api/import/template/staff', '_blank');
            }}
            data-testid="button-download-staff-template"
          >
            <Download className="w-4 h-4 mr-2" />
            Download Template
          </Button>
          <input
            id="staff-import-file"
            type="file"
            accept=".csv"
            className="hidden"
            onChange={(e) => handleImportFile(e, 'staff')}
            data-testid="input-staff-import"
          />
          <Button
            variant="default"
            size="sm"
            className="w-full"
            onClick={() => document.getElementById('staff-import-file')?.click()}
            data-testid="button-import-staff"
          >
            <Upload className="w-4 h-4 mr-2" />
            Upload & Import
          </Button>
        </div>
      </div>
      {/* Visitors Import */}
      <div className="p-4 bg-white/50 dark:bg-slate-800/50 rounded-lg border">
        <div className="flex items-center gap-2 mb-3">
          <UserPlus className="w-5 h-5 text-green-600" />
          <h4 className="font-medium text-fixed">Visitors Import</h4>
        </div>
        <p className="text-xs text-variable mb-4">
          Pre-book visitors in bulk for upcoming visits
        </p>
        <div className="space-y-2">
          <Button
            variant="outline"
            size="sm"
            className="w-full"
            onClick={() => {
              window.open('/api/import/template/visitors', '_blank');
            }}
            data-testid="button-download-visitors-template"
          >
            <Download className="w-4 h-4 mr-2" />
            Download Template
          </Button>
          <input
            id="visitors-import-file"
            type="file"
            accept=".csv"
            className="hidden"
            onChange={(e) => handleImportFile(e, 'visitors')}
            data-testid="input-visitors-import"
          />
          <Button
            variant="default"
            size="sm"
            className="w-full"
            onClick={() => document.getElementById('visitors-import-file')?.click()}
            data-testid="button-import-visitors"
          >
            <Upload className="w-4 h-4 mr-2" />
            Upload & Import
          </Button>
        </div>
      </div>
      {/* Contractors Import */}
      <div className="p-4 bg-white/50 dark:bg-slate-800/50 rounded-lg border">
        <div className="flex items-center gap-2 mb-3">
          <Building className="w-5 h-5 text-orange-600" />
          <h4 className="font-medium text-fixed">Contractors Import</h4>
        </div>
        <p className="text-xs text-variable mb-4">
          Import contractor workers and their companies
        </p>
        <div className="space-y-2">
          <Button
            variant="outline"
            size="sm"
            className="w-full"
            onClick={() => {
              window.open('/api/import/template/contractors', '_blank');
            }}
            data-testid="button-download-contractors-template"
          >
            <Download className="w-4 h-4 mr-2" />
            Download Template
          </Button>
          <input
            id="contractors-import-file"
            type="file"
            accept=".csv"
            className="hidden"
            onChange={(e) => handleImportFile(e, 'contractors')}
            data-testid="input-contractors-import"
          />
          <Button
            variant="default"
            size="sm"
            className="w-full"
            onClick={() => document.getElementById('contractors-import-file')?.click()}
            data-testid="button-import-contractors"
          >
            <Upload className="w-4 h-4 mr-2" />
            Upload & Import
          </Button>
        </div>
      </div>
      {/* Members Import */}
      <div className="p-4 bg-white/50 dark:bg-slate-800/50 rounded-lg border">
        <div className="flex items-center gap-2 mb-3">
          <BadgeCheck className="w-5 h-5 text-purple-600" />
          <h4 className="font-medium text-fixed">Members Import</h4>
        </div>
        <p className="text-xs text-variable mb-4">
          Import members with membership details and status
        </p>
        <div className="space-y-2">
          <Button
            variant="outline"
            size="sm"
            className="w-full"
            onClick={() => {
              window.open('/api/import/template/members', '_blank');
            }}
            data-testid="button-download-members-template"
          >
            <Download className="w-4 h-4 mr-2" />
            Download Template
          </Button>
          <input
            id="members-import-file"
            type="file"
            accept=".csv"
            className="hidden"
            onChange={(e) => handleImportFile(e, 'members')}
            data-testid="input-members-import"
          />
          <Button
            variant="default"
            size="sm"
            className="w-full"
            onClick={() => document.getElementById('members-import-file')?.click()}
            data-testid="button-import-members"
          >
            <Upload className="w-4 h-4 mr-2" />
            Upload & Import
          </Button>
        </div>
      </div>
    </div>
    <div className="mt-4 flex flex-col sm:flex-row gap-3 items-start">
      <div className="flex-1 p-3 bg-blue-50 dark:bg-blue-900/30 rounded-lg border border-blue-200 dark:border-blue-800">
        <p className="text-xs text-blue-800 dark:text-blue-200">
          <strong>ℹ️ How it works:</strong> Download the CSV template, fill in your data following the sample row, then upload the completed file to import.
        </p>
      </div>
      <TooltipProvider delayDuration={200}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="whitespace-nowrap border-purple-300 text-purple-700 hover:bg-purple-50 dark:border-purple-700 dark:text-purple-300 dark:hover:bg-purple-900/30"
              onClick={() => sampleDataMutation.mutate()}
              disabled={sampleDataMutation.isPending || sampleDataExists}
              data-testid="button-load-sample-data"
            >
              <FlaskConical className="w-4 h-4 mr-2" />
              {sampleDataMutation.isPending ? "Loading..." : sampleDataExists ? "Sample Data Loaded" : "Load Sample Data"}
            </Button>
          </TooltipTrigger>
          <TooltipContent className="max-w-xs">
            <p>{sampleDataExists ? "Sample data is already loaded. Use \"Remove Sample Data\" to clear it first before loading again." : "Loads demo data for presentations and testing — adds 10 staff, 10 visitors, 5 contractor companies (with 3–5 workers each), and 10 members, plus full HR records. Remove it afterwards using \"Remove Sample Data\"."}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <TooltipProvider delayDuration={200}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="whitespace-nowrap border-red-300 text-red-700 hover:bg-red-50 dark:border-red-700 dark:text-red-300 dark:hover:bg-red-900/30"
              onClick={() => setShowClearSampleDataDialog(true)}
              disabled={clearSampleDataMutation.isPending}
              data-testid="button-clear-sample-data"
            >
              <Trash2 className="w-4 h-4 mr-2" />
              {clearSampleDataMutation.isPending ? "Clearing..." : "Remove Sample Data"}
            </Button>
          </TooltipTrigger>
          <TooltipContent className="max-w-xs">
            <p>Removes all demo records loaded by "Load Sample Data" — staff, visitors, contractors, members, and all linked HR records. Only removes records with @example.com email addresses.</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  </GlassCard>
</div>

<div className="mt-6">
  <GlassCard className="p-6">
    <h3 className="text-lg font-semibold text-fixed mb-4 flex items-center gap-2">
      <Settings2 className="w-5 h-5" />
      Feature Toggles
    </h3>
    <p className="text-sm text-variable mb-6">
      Disable unused features to simplify your interface and reduce complexity for your team.
    </p>
    
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {/* ── Core Navigation ───────────────────────────────── */}
      {/* Dashboard */}
      <div className="flex items-center justify-between p-4 bg-white/50 dark:bg-slate-800/50 rounded-lg border hover:border-blue-200 dark:border-blue-800 transition-colors">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-100 rounded-lg">
            <Monitor className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <h4 className="font-medium text-fixed">Dashboard</h4>
            <p className="text-xs text-variable">Main overview & live activity feed</p>
          </div>
        </div>
        <Switch
          checked={currentSettings?.featureDashboard !== false}
          onCheckedChange={(checked) => handleInputChange("featureDashboard", checked)}
          data-testid="toggle-dashboard"
        />
      </div>
      {/* Visitors */}
      <div className="flex items-center justify-between p-4 bg-white/50 dark:bg-slate-800/50 rounded-lg border hover:border-blue-200 dark:border-blue-800 transition-colors">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-green-100 rounded-lg">
            <UserCheck className="w-5 h-5 text-green-600" />
          </div>
          <div>
            <h4 className="font-medium text-fixed">Visitors</h4>
            <p className="text-xs text-variable">Visitor sign-in, passes & pre-booking</p>
          </div>
        </div>
        <Switch
          checked={currentSettings?.featureVisitors !== false}
          onCheckedChange={(checked) => handleInputChange("featureVisitors", checked)}
          data-testid="toggle-visitors"
        />
      </div>
      {/* Contractors */}
      <div className="flex items-center justify-between p-4 bg-white/50 dark:bg-slate-800/50 rounded-lg border hover:border-blue-200 dark:border-blue-800 transition-colors">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-amber-100 rounded-lg">
            <HardHat className="w-5 h-5 text-amber-600" />
          </div>
          <div>
            <h4 className="font-medium text-fixed">Contractors</h4>
            <p className="text-xs text-variable">Contractor sign-in, passes & compliance</p>
          </div>
        </div>
        <Switch
          checked={currentSettings?.featureContractors !== false}
          onCheckedChange={(checked) => handleInputChange("featureContractors", checked)}
          data-testid="toggle-contractors"
        />
      </div>
      {/* Staff */}
      <div className="flex items-center justify-between p-4 bg-white/50 dark:bg-slate-800/50 rounded-lg border hover:border-blue-200 dark:border-blue-800 transition-colors">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-indigo-100 rounded-lg">
            <Users className="w-5 h-5 text-indigo-600" />
          </div>
          <div>
            <h4 className="font-medium text-fixed">Staff</h4>
            <p className="text-xs text-variable">Staff directory, check-in & management</p>
          </div>
        </div>
        <Switch
          checked={currentSettings?.featureStaff !== false}
          onCheckedChange={(checked) => handleInputChange("featureStaff", checked)}
          data-testid="toggle-staff"
        />
      </div>
      {/* Muster List */}
      <div className="flex items-center justify-between p-4 bg-white/50 dark:bg-slate-800/50 rounded-lg border hover:border-blue-200 dark:border-blue-800 transition-colors">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-red-100 rounded-lg">
            <AlertTriangle className="w-5 h-5 text-red-600" />
          </div>
          <div>
            <h4 className="font-medium text-fixed">Muster List</h4>
            <p className="text-xs text-variable">Emergency evacuation & roll-call</p>
          </div>
        </div>
        <Switch
          checked={currentSettings?.featureMusterList !== false}
          onCheckedChange={(checked) => handleInputChange("featureMusterList", checked)}
          data-testid="toggle-muster-list"
        />
      </div>
      {/* Reports */}
      <div className="flex items-center justify-between p-4 bg-white/50 dark:bg-slate-800/50 rounded-lg border hover:border-blue-200 dark:border-blue-800 transition-colors">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-purple-100 rounded-lg">
            <BarChart3 className="w-5 h-5 text-purple-600" />
          </div>
          <div>
            <h4 className="font-medium text-fixed">Reports</h4>
            <p className="text-xs text-variable">Analytics, exports & audit logs</p>
          </div>
        </div>
        <Switch
          checked={currentSettings?.featureReports !== false}
          onCheckedChange={(checked) => handleInputChange("featureReports", checked)}
          data-testid="toggle-reports"
        />
      </div>
      {/* Settings */}
      <div className="flex items-center justify-between p-4 bg-white/50 dark:bg-slate-800/50 rounded-lg border hover:border-blue-200 dark:border-blue-800 transition-colors">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-slate-100 rounded-lg">
            <SettingsIcon className="w-5 h-5 text-slate-600" />
          </div>
          <div>
            <h4 className="font-medium text-fixed">Settings</h4>
            <p className="text-xs text-variable">System configuration & preferences</p>
          </div>
        </div>
        <Switch
          checked={currentSettings?.featureSettingsPage !== false}
          onCheckedChange={(checked) => handleInputChange("featureSettingsPage", checked)}
          data-testid="toggle-settings-page"
        />
      </div>
      {/* ── Extended Modules ──────────────────────────────── */}
      {/* Members */}
      <div className="flex items-center justify-between p-4 bg-white/50 dark:bg-slate-800/50 rounded-lg border hover:border-blue-200 dark:border-blue-800 transition-colors">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-purple-100 rounded-lg">
            <Users className="w-5 h-5 text-purple-600" />
          </div>
          <div>
            <h4 className="font-medium text-fixed">Members</h4>
            <p className="text-xs text-variable">Member management, check-in/out & muster tracking</p>
          </div>
        </div>
        <Switch
          checked={currentSettings?.featureMembers !== false}
          onCheckedChange={(checked) => handleInputChange("featureMembers", checked)}
          data-testid="toggle-members"
        />
      </div>
      {/* Contractor Page */}
      <div className="flex items-center justify-between p-4 bg-white/50 dark:bg-slate-800/50 rounded-lg border hover:border-blue-200 dark:border-blue-800 transition-colors">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-amber-100 rounded-lg">
            <CalendarPlus className="w-5 h-5 text-amber-600 dark:text-amber-400" />
          </div>
          <div>
            <h4 className="font-medium text-fixed">Contractor Page</h4>
            <p className="text-xs text-variable">Contractor management & H&S compliance</p>
          </div>
        </div>
        <Switch
          checked={currentSettings?.featureContractorPage !== false}
          onCheckedChange={(checked) => handleInputChange("featureContractorPage", checked)}
          data-testid="toggle-contractor-page"
        />
      </div>
      {/* Meeting Rooms */}
      <div className="flex items-center justify-between p-4 bg-white/50 dark:bg-slate-800/50 rounded-lg border hover:border-blue-200 dark:border-blue-800 transition-colors">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-green-100 rounded-lg">
            <Calendar className="w-5 h-5 text-green-600" />
          </div>
          <div>
            <h4 className="font-medium text-fixed">Meeting Rooms</h4>
            <p className="text-xs text-variable">Room booking & management</p>
          </div>
        </div>
        <Switch
          checked={currentSettings?.featureMeetingRooms !== false}
          onCheckedChange={(checked) => handleInputChange("featureMeetingRooms", checked)}
          data-testid="toggle-meeting-rooms"
        />
      </div>
      {/* Time & Attendance */}
      <div className="flex items-center justify-between p-4 bg-white/50 dark:bg-slate-800/50 rounded-lg border hover:border-blue-200 dark:border-blue-800 transition-colors">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-100 rounded-lg">
            <Clock className="w-5 h-5 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <h4 className="font-medium text-fixed">Time Attendance</h4>
            <p className="text-xs text-variable">Staff time tracking & reports</p>
          </div>
        </div>
        <Switch
          checked={currentSettings?.featureTimeAttendance !== false}
          onCheckedChange={(checked) => handleInputChange("featureTimeAttendance", checked)}
          data-testid="toggle-time-attendance"
        />
      </div>
      {/* ── Safety & Compliance ───────────────────────────── */}
      {/* Incident Reports */}
      <div className="flex items-center justify-between p-4 bg-white/50 dark:bg-slate-800/50 rounded-lg border hover:border-blue-200 dark:border-blue-800 transition-colors">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-red-100 rounded-lg">
            <ScrollText className="w-5 h-5 text-red-600" />
          </div>
          <div>
            <h4 className="font-medium text-fixed">Incident Reports</h4>
            <p className="text-xs text-variable">Post-evacuation drill & emergency reports with PDF export</p>
          </div>
        </div>
        <Switch
          checked={currentSettings?.featureIncidentReports !== false}
          onCheckedChange={(checked) => handleInputChange("featureIncidentReports", checked)}
          data-testid="toggle-incident-reports"
        />
      </div>
      {/* Martyn's Law */}
      <div className="flex items-center justify-between p-4 bg-white/50 dark:bg-slate-800/50 rounded-lg border hover:border-blue-200 dark:border-blue-800 transition-colors">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-slate-100 rounded-lg">
            <Shield className="w-5 h-5 text-slate-600" />
          </div>
          <div>
            <h4 className="font-medium text-fixed">Martyn's Law</h4>
            <p className="text-xs text-variable">UK Protect Duty compliance checklist & security plan</p>
          </div>
        </div>
        <Switch
          checked={currentSettings?.featureMartynLaw !== false}
          onCheckedChange={(checked) => handleInputChange("featureMartynLaw", checked)}
          data-testid="toggle-martyn-law"
        />
      </div>
      {/* Induction Settings */}
      <div className="flex items-center justify-between p-4 bg-white/50 dark:bg-slate-800/50 rounded-lg border hover:border-blue-200 dark:border-blue-800 transition-colors">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-orange-100 rounded-lg">
            <Video className="w-5 h-5 text-orange-600" />
          </div>
          <div>
            <h4 className="font-medium text-fixed">Induction Settings</h4>
            <p className="text-xs text-variable">Safety induction configuration</p>
          </div>
        </div>
        <Switch
          checked={currentSettings?.featureInductionSettings !== false}
          onCheckedChange={(checked) => handleInputChange("featureInductionSettings", checked)}
          data-testid="toggle-induction-settings"
        />
      </div>
      {/* ── Optional & Specialist ─────────────────────────── */}
      {/* PPM */}
      <div className="flex items-center justify-between p-4 bg-white/50 dark:bg-slate-800/50 rounded-lg border hover:border-blue-200 dark:border-blue-800 transition-colors">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-slate-100 rounded-lg">
            <Wrench className="w-5 h-5 text-slate-600" />
          </div>
          <div>
            <h4 className="font-medium text-fixed">Planned Preventative Maintenance (PPM)</h4>
            <p className="text-xs text-variable">Asset registry, maintenance templates & scheduling for facilities management</p>
            {isPlatformLocked("featurePPM") && <p className="text-xs text-orange-500 mt-0.5 flex items-center gap-1"><Lock className="w-3 h-3" /> Disabled by your platform administrator</p>}
          </div>
        </div>
        <Switch
          checked={currentSettings?.featurePPM === true}
          onCheckedChange={(checked) => handleInputChange("featurePPM", checked)}
          data-testid="toggle-ppm"
          disabled={isPlatformLocked("featurePPM")}
        />
      </div>
      {/* Help Desk */}
      <div className="flex items-center justify-between p-4 bg-white/50 dark:bg-slate-800/50 rounded-lg border hover:border-blue-200 dark:border-blue-800 transition-colors">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-orange-100 rounded-lg">
            <Ticket className="w-5 h-5 text-orange-600" />
          </div>
          <div>
            <h4 className="font-medium text-fixed">Help Desk</h4>
            <p className="text-xs text-variable">Fault reporting and reactive maintenance ticket management</p>
            {isPlatformLocked("featureHelpDesk") && <p className="text-xs text-orange-500 mt-0.5 flex items-center gap-1"><Lock className="w-3 h-3" /> Disabled by your platform administrator</p>}
          </div>
        </div>
        <Switch
          checked={currentSettings?.featureHelpDesk === true}
          onCheckedChange={(checked) => handleInputChange("featureHelpDesk", checked)}
          data-testid="toggle-helpdesk"
          disabled={isPlatformLocked("featureHelpDesk")}
        />
      </div>
      {/* H&S Incidents */}
      <div className="flex items-center justify-between p-4 bg-white/50 dark:bg-slate-800/50 rounded-lg border hover:border-blue-200 dark:border-blue-800 transition-colors">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-amber-100 rounded-lg">
            <AlertTriangle className="w-5 h-5 text-amber-600" />
          </div>
          <div>
            <h4 className="font-medium text-fixed">H&S Incidents</h4>
            <p className="text-xs text-variable">RIDDOR 2013 reportable incident tracking & near miss reporting</p>
            {isPlatformLocked("featureHsIncidents") && <p className="text-xs text-orange-500 mt-0.5 flex items-center gap-1"><Lock className="w-3 h-3" /> Disabled by your platform administrator</p>}
          </div>
        </div>
        <Switch
          checked={currentSettings?.featureHsIncidents !== false}
          onCheckedChange={(checked) => handleInputChange("featureHsIncidents", checked)}
          data-testid="toggle-hs-incidents"
          disabled={isPlatformLocked("featureHsIncidents")}
        />
      </div>
      {/* Fire Risk Assessment */}
      <div className="flex items-center justify-between p-4 bg-white/50 dark:bg-slate-800/50 rounded-lg border hover:border-blue-200 dark:border-blue-800 transition-colors">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-orange-100 rounded-lg">
            <Flame className="w-5 h-5 text-orange-600" />
          </div>
          <div>
            <h4 className="font-medium text-fixed">Fire Risk Assessment</h4>
            <p className="text-xs text-variable">RRO 2005 compliance — FRA tracking, review reminders & audit history</p>
            {isPlatformLocked("featureFireRiskAssessment") && <p className="text-xs text-orange-500 mt-0.5 flex items-center gap-1"><Lock className="w-3 h-3" /> Disabled by your platform administrator</p>}
          </div>
        </div>
        <Switch
          checked={currentSettings?.featureFireRiskAssessment !== false}
          onCheckedChange={(checked) => handleInputChange("featureFireRiskAssessment", checked)}
          data-testid="toggle-fire-risk-assessment"
          disabled={isPlatformLocked("featureFireRiskAssessment")}
        />
      </div>
      {/* Compliance Certificate Register */}
      <div className="flex items-center justify-between p-4 bg-white/50 dark:bg-slate-800/50 rounded-lg border hover:border-blue-200 dark:border-blue-800 transition-colors">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-emerald-100 rounded-lg">
            <ShieldCheck className="w-5 h-5 text-emerald-600" />
          </div>
          <div>
            <h4 className="font-medium text-fixed">Compliance Certificate Register</h4>
            <p className="text-xs text-variable">Track 14 statutory UK compliance certificates — EICR, gas safety, fire alarms, LOLER, legionella & more</p>
            {isPlatformLocked("featureComplianceCertificates") && <p className="text-xs text-orange-500 mt-0.5 flex items-center gap-1"><Lock className="w-3 h-3" /> Disabled by your platform administrator</p>}
          </div>
        </div>
        <Switch
          checked={currentSettings?.featureComplianceCertificates === true}
          onCheckedChange={(checked) => handleInputChange("featureComplianceCertificates", checked)}
          data-testid="toggle-compliance-certificates"
          disabled={isPlatformLocked("featureComplianceCertificates")}
        />
      </div>
      {/* Permit-to-Work */}
      <div className="flex items-center justify-between p-4 bg-white/50 dark:bg-slate-800/50 rounded-lg border hover:border-blue-200 dark:border-blue-800 transition-colors">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-orange-100 rounded-lg">
            <ClipboardList className="w-5 h-5 text-orange-600" />
          </div>
          <div>
            <h4 className="font-medium text-fixed">Permit-to-Work System</h4>
            <p className="text-xs text-variable">Authorise & track high-risk work — hot works, electrical isolation, confined space, working at height & more</p>
            {isPlatformLocked("featurePermitToWork") && <p className="text-xs text-orange-500 mt-0.5 flex items-center gap-1"><Lock className="w-3 h-3" /> Disabled by your platform administrator</p>}
          </div>
        </div>
        <Switch
          checked={currentSettings?.featurePermitToWork === true}
          onCheckedChange={(checked) => handleInputChange("featurePermitToWork", checked)}
          data-testid="toggle-permit-to-work"
          disabled={isPlatformLocked("featurePermitToWork")}
        />
      </div>
      {/* Risk Assessment Builder */}
      <div className="flex items-center justify-between p-4 bg-white/50 dark:bg-slate-800/50 rounded-lg border hover:border-blue-200 dark:border-blue-800 transition-colors">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-emerald-100 rounded-lg">
            <FileEdit className="w-5 h-5 text-emerald-600" />
          </div>
          <div>
            <h4 className="font-medium text-fixed">Risk Assessment Builder</h4>
            <p className="text-xs text-variable">Author, review, and approve risk assessments directly in TPR Max — General, COSHH, Manual Handling, Working at Height, Lone Working, and DSE</p>
            {isPlatformLocked("featureRaBuilder") && <p className="text-xs text-orange-500 mt-0.5 flex items-center gap-1"><Lock className="w-3 h-3" /> Disabled by your platform administrator</p>}
          </div>
        </div>
        <Switch
          checked={currentSettings?.featureRaBuilder === true}
          onCheckedChange={(checked) => handleInputChange("featureRaBuilder", checked)}
          data-testid="toggle-ra-builder"
          disabled={isPlatformLocked("featureRaBuilder")}
        />
      </div>
      {/* Audit & Inspection Engine */}
      <div className="flex items-center justify-between p-4 bg-white/50 dark:bg-slate-800/50 rounded-lg border hover:border-blue-200 dark:border-blue-800 transition-colors">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-indigo-100 rounded-lg">
            <ClipboardCheck className="w-5 h-5 text-indigo-600" />
          </div>
          <div>
            <h4 className="font-medium text-fixed">Audit & Inspection Engine</h4>
            <p className="text-xs text-variable">Conduct site audits, safety inspections, vehicle checks, and behavioural observations with CAPA management</p>
            {isPlatformLocked("featureAuditEngine") && <p className="text-xs text-orange-500 mt-0.5 flex items-center gap-1"><Lock className="w-3 h-3" /> Disabled by your platform administrator</p>}
          </div>
        </div>
        <Switch
          checked={currentSettings?.featureAuditEngine === true}
          onCheckedChange={(checked) => handleInputChange("featureAuditEngine", checked)}
          data-testid="toggle-audit-engine"
          disabled={isPlatformLocked("featureAuditEngine")}
        />
      </div>
      {/* Kiosk Mode */}
      <div className="flex items-center justify-between p-4 bg-white/50 dark:bg-slate-800/50 rounded-lg border hover:border-blue-200 dark:border-blue-800 transition-colors">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-cyan-100 rounded-lg">
            <Dock className="w-5 h-5 text-cyan-600" />
          </div>
          <div>
            <h4 className="font-medium text-fixed">Kiosk Mode</h4>
            <p className="text-xs text-variable">Self-service check-in kiosks</p>
            {isPlatformLocked("featureKiosk") && <p className="text-xs text-orange-500 mt-0.5 flex items-center gap-1"><Lock className="w-3 h-3" /> Disabled by your platform administrator</p>}
          </div>
        </div>
        <Switch
          checked={currentSettings?.featureKiosk !== false}
          onCheckedChange={(checked) => handleInputChange("featureKiosk", checked)}
          data-testid="toggle-kiosk"
          disabled={isPlatformLocked("featureKiosk")}
        />
      </div>
      {/* Email Outbox */}
      <div className="flex items-center justify-between p-4 bg-white/50 dark:bg-slate-800/50 rounded-lg border hover:border-blue-200 dark:border-blue-800 transition-colors">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-sky-100 rounded-lg">
            <Mail className="w-5 h-5 text-sky-600" />
          </div>
          <div>
            <h4 className="font-medium text-fixed">Email Outbox</h4>
            <p className="text-xs text-variable">Log all system emails — preview exactly what recipients receive</p>
            {isPlatformLocked("featureEmailOutbox") && <p className="text-xs text-orange-500 mt-0.5 flex items-center gap-1"><Lock className="w-3 h-3" /> Disabled by your platform administrator</p>}
          </div>
        </div>
        <Switch
          checked={currentSettings?.featureEmailOutbox === true}
          onCheckedChange={(checked) => handleInputChange("featureEmailOutbox", checked)}
          data-testid="toggle-email-outbox"
          disabled={isPlatformLocked("featureEmailOutbox")}
        />
      </div>
      {/* HR Module */}
      <div className="flex items-center justify-between p-4 bg-white/50 dark:bg-slate-800/50 rounded-lg border hover:border-blue-200 dark:border-blue-800 transition-colors">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-indigo-100 rounded-lg">
            <UserPlus className="w-5 h-5 text-indigo-600" />
          </div>
          <div>
            <h4 className="font-medium text-fixed">HR Module</h4>
            <p className="text-xs text-variable">Staff profiles, leave, training, appraisals & payroll export</p>
            {isPlatformLocked("featureHrModule") && <p className="text-xs text-orange-500 mt-0.5 flex items-center gap-1"><Lock className="w-3 h-3" /> Disabled by your platform administrator</p>}
          </div>
        </div>
        <Switch
          checked={currentSettings?.featureHrModule !== false}
          onCheckedChange={(checked) => handleInputChange("featureHrModule", checked)}
          data-testid="toggle-hr-module"
          disabled={isPlatformLocked("featureHrModule")}
        />
      </div>
      {/* Compliance Intelligence Dashboard */}
      <div className="flex items-center justify-between p-4 bg-white/50 dark:bg-slate-800/50 rounded-lg border hover:border-blue-200 dark:border-blue-800 transition-colors">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-teal-100 rounded-lg">
            <Activity className="w-5 h-5 text-teal-600" />
          </div>
          <div>
            <h4 className="font-medium text-fixed">Compliance Intelligence Dashboard</h4>
            <p className="text-xs text-variable">Weighted compliance health score across all modules — insurance, RAMS, inductions, certificates, PPM, FRA & RTW</p>
            {isPlatformLocked("featureComplianceDashboard") && <p className="text-xs text-orange-500 mt-0.5 flex items-center gap-1"><Lock className="w-3 h-3" /> Disabled by your platform administrator</p>}
          </div>
        </div>
        <Switch
          checked={currentSettings?.featureComplianceDashboard !== false}
          onCheckedChange={(checked) => handleInputChange("featureComplianceDashboard", checked)}
          data-testid="toggle-compliance-dashboard"
          disabled={isPlatformLocked("featureComplianceDashboard")}
        />
      </div>
    </div>
    
    <div className="mt-6 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
      <div className="flex items-start gap-3">
        <Info className="w-5 h-5 text-blue-600 dark:text-blue-400 mt-0.5" />
        <div>
          <h4 className="font-medium text-blue-800 dark:text-blue-200 mb-1">Feature Toggle Benefits:</h4>
          <ul className="text-sm text-blue-700 dark:text-blue-300 space-y-1">
            <li>• Simplify navigation by hiding unused features</li>
            <li>• Reduce training time for staff on relevant features only</li>
            <li>• Customize the system to match your specific business needs</li>
            <li>• Changes take effect immediately across all user sessions</li>
          </ul>
        </div>
      </div>
    </div>
  </GlassCard>
</div>
</TooltipProvider>


      {/* Clear Sample Data Confirm Dialog */}
      <AlertDialog open={showClearSampleDataDialog} onOpenChange={setShowClearSampleDataDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove All Sample Data?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete all records loaded by "Load Sample Data" — including all staff, visitors, contractors, members, and their linked HR records (RTW, DBS, leave, absences, training, appraisals, documents, onboarding and leaver records). Only records with @example.com email addresses will be removed. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700 text-white"
              onClick={() => { setShowClearSampleDataDialog(false); clearSampleDataMutation.mutate(); }}
            >
              Yes, Remove All Sample Data
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Manual Reset Confirm Dialog */}
      <Dialog open={showManualResetDialog} onOpenChange={setShowManualResetDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Manual Reset</DialogTitle>
            <DialogDescription>
              This will immediately check out all visitors, staff, and contractors currently shown as on-site. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowManualResetDialog(false)}>Cancel</Button>
            <Button variant="destructive" onClick={confirmManualReset}>Confirm Reset</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
