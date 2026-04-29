import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSettingsAutoSave } from "@/hooks/useSettingsAutoSave";
import GlassCard from "@/components/GlassCard";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Mail, FileText, BarChart3, TrendingUp, Activity, Plus, Trash2, Calendar } from "lucide-react";
import type { Report } from "@shared/schema";

export default function NotificationSettings() {
  const { currentSettings, handleInputChange, formData } = useSettingsAutoSave();
  const { toast } = useToast();
  const [showAddEmailDialog, setShowAddEmailDialog] = useState(false);
  const [newEmailRecipient, setNewEmailRecipient] = useState("");

  const { data: reportsData } = useQuery<Report[]>({
    queryKey: ["/api/reports"],
  });

  const addEmailRecipient = () => {
    if (newEmailRecipient) {
      const currentRecipients = formData.reportRecipients || currentSettings?.reportRecipients || [];
      const updated = [...currentRecipients, newEmailRecipient];
      handleInputChange("reportRecipients", updated);
      setNewEmailRecipient("");
      setShowAddEmailDialog(false);
    }
  };

  const removeRecipient = (index: number) => {
    const currentRecipients = formData.reportRecipients || currentSettings?.reportRecipients || [];
    const updated = currentRecipients.filter((_: any, i: number) => i !== index);
    handleInputChange("reportRecipients", updated);
  };

  return (
    <div className="space-y-6">
<GlassCard>
  <div className="flex items-center mb-6">
    <FileText className="mr-3 text-blue-600 dark:text-blue-400" size={24} />
    <h3 className="text-lg font-semibold text-fixed">Report Generation Settings</h3>
  </div>
  
  <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
    <div className="space-y-4">
      <h4 className="font-medium text-fixed">📊 Report Types</h4>
      <div className="space-y-3">
        <div className="p-3 bg-blue-50 dark:bg-blue-950/30 rounded-lg border border-blue-200 dark:border-blue-800">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-blue-800 dark:text-blue-300">Daily Reports</span>
            <Badge variant="secondary" className="bg-blue-100 text-blue-700">Active</Badge>
          </div>
          <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">Visitor & staff activity summary</p>
        </div>
        
        <div className="p-3 bg-green-50 dark:bg-green-950/30 rounded-lg border border-green-200 dark:border-green-800">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-green-800 dark:text-green-300">Weekly Reports</span>
            <Badge variant="secondary" className="bg-green-100 text-green-700">Active</Badge>
          </div>
          <p className="text-xs text-green-600 mt-1">Comprehensive weekly analysis</p>
        </div>
        
        <div className="p-3 bg-[var(--background)] rounded-lg border border-slate-200">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-fixed">Monthly Reports</span>
            <Badge variant="secondary" className="bg-slate-100 text-variable">Configured</Badge>
          </div>
          <p className="text-xs text-variable mt-1">Month-end summaries</p>
        </div>
      </div>
    </div>
    <div className="space-y-4">
      <h4 className="font-medium text-fixed">⚙️ Report Settings</h4>
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <Label className="text-sm font-medium text-fixed">Email Reports Enabled</Label>
            <p className="text-xs text-variable">Automatically email reports when generated</p>
          </div>
          <Switch 
            checked={currentSettings?.emailReportsEnabled !== false} 
            onCheckedChange={(checked) => handleInputChange("emailReportsEnabled", checked)}
            data-testid="switch-email-reports-enabled" 
          />
        </div>
      </div>
      <div className="mt-4 space-y-2">
        <p className="text-xs font-medium text-variable">Always available in all reports:</p>
        <div className="flex flex-wrap gap-2">
          <Badge variant="secondary" className="bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300">Charts & Graphs</Badge>
          <Badge variant="secondary" className="bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-300">PDF Export</Badge>
          <Badge variant="secondary" className="bg-purple-100 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300">Visitor Photos</Badge>
          <Badge variant="secondary" className="bg-orange-100 text-orange-700 dark:bg-orange-950/40 dark:text-orange-300">Excel / CSV Export</Badge>
        </div>
      </div>
      
      <div className="mt-6 p-3 bg-yellow-50 rounded-lg border border-yellow-200">
        <p className="text-xs text-yellow-800 font-medium mb-1">💡 Report Configuration</p>
        <p className="text-xs text-yellow-700">
          Configure email settings in the <strong>Email</strong> tab to enable automatic report delivery
        </p>
      </div>
    </div>
    <div className="space-y-4">
      <h4 className="font-medium text-fixed">📈 Report Stats</h4>
      <div className="space-y-3">
        <div className="text-center p-4 bg-white/50 dark:bg-slate-800/50 rounded-xl border border-white/30 dark:border-slate-700/30">
          <div className="text-2xl font-bold text-blue-600 dark:text-blue-400" data-testid="text-total-reports">
            {reportsData?.length ?? 0}
          </div>
          <div className="text-xs text-variable">Total Reports</div>
        </div>
        
        <div className="text-center p-4 bg-white/50 dark:bg-slate-800/50 rounded-xl border border-white/30 dark:border-slate-700/30">
          <div className="text-2xl font-bold text-green-600" data-testid="text-generated-reports">
            {reportsData?.filter(r => {
              const now = new Date();
              const d = new Date(r.generatedAt);
              return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
            }).length ?? 0}
          </div>
          <div className="text-xs text-variable">Generated This Month</div>
        </div>
        
        <div className="text-center p-4 bg-white/50 dark:bg-slate-800/50 rounded-xl border border-white/30 dark:border-slate-700/30">
          <div className="text-2xl font-bold text-purple-600" data-testid="text-emailed-reports">
            {reportsData?.filter(r => r.emailSent).length ?? 0}
          </div>
          <div className="text-xs text-variable">Emailed Reports</div>
        </div>
      </div>
    </div>
  </div>
  <div className="mt-6 p-4 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
    <h4 className="font-medium text-green-800 dark:text-green-200 mb-2">📋 Available Report Types:</h4>
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm text-green-700 dark:text-green-300">
      <div>• Daily Activity Report</div>
      <div>• Weekly Summary Report</div>
      <div>• Visitor Analysis Report</div>
      <div>• Staff Attendance Report</div>
      <div>• Department Report</div>
      <div>• Contractor Safety Report</div>
      <div>• Contractor Attendance</div>
      <div>• Custom Date Range</div>
    </div>
  </div>
</GlassCard>


      {/* Add Email Recipient Dialog */}
      <Dialog open={showAddEmailDialog} onOpenChange={setShowAddEmailDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add Report Recipient</DialogTitle>
            <DialogDescription>Enter the email address to receive scheduled reports.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Email Address</Label>
            <Input
              type="email"
              value={newEmailRecipient}
              onChange={(e) => setNewEmailRecipient(e.target.value)}
              placeholder="reports@company.com"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddEmailDialog(false)}>Cancel</Button>
            <Button onClick={addEmailRecipient} disabled={!newEmailRecipient}>Add</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
