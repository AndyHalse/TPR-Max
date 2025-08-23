import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { apiRequest } from "@/lib/queryClient";
import GlassCard from "@/components/GlassCard";
import { ObjectUploader } from "@/components/ObjectUploader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { Save, Mail, Upload, Building2, Settings as SettingsIcon } from "lucide-react";
import type { CompanySettings, InsertCompanySettings } from "@shared/schema";

export default function Settings() {
  const { toast } = useToast();
  const [formData, setFormData] = useState<Partial<InsertCompanySettings>>({});
  const [testEmail, setTestEmail] = useState("");

  const { data: settings, isLoading } = useQuery<CompanySettings>({
    queryKey: ["/api/settings"],
  });

  const updateSettingsMutation = useMutation({
    mutationFn: async (updates: Partial<InsertCompanySettings>) => {
      return apiRequest("PUT", "/api/settings", updates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
      toast({
        title: "Success",
        description: "Settings updated successfully!",
      });
      setFormData({});
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update settings",
        variant: "destructive",
      });
    },
  });

  const testEmailMutation = useMutation({
    mutationFn: async (email: string) => {
      const response = await apiRequest("POST", "/api/test-email", { email });
      return response.json();
    },
    onSuccess: (data) => {
      if (data.success) {
        toast({
          title: "Success",
          description: "Test email sent successfully!",
        });
      } else {
        toast({
          title: "Error",
          description: "Failed to send test email",
          variant: "destructive",
        });
      }
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to send test email",
        variant: "destructive",
      });
    },
  });

  const handleLogoUpload = async (fileUrl: string) => {
    try {
      // Normalize the URL to object path format
      const logoUrl = fileUrl.replace('https://storage.googleapis.com', '');
      
      await updateSettingsMutation.mutateAsync({
        logoUrl: logoUrl,
      });
      
      toast({
        title: "Success",
        description: "Logo uploaded and saved successfully!",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to save logo",
        variant: "destructive",
      });
    }
  };

  const handleInputChange = (field: keyof InsertCompanySettings, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSave = () => {
    if (Object.keys(formData).length === 0) {
      toast({
        title: "Info",
        description: "No changes to save",
      });
      return;
    }
    updateSettingsMutation.mutate(formData);
  };

  const handleTestEmail = () => {
    if (!testEmail) {
      toast({
        title: "Error",
        description: "Please enter an email address",
        variant: "destructive",
      });
      return;
    }
    testEmailMutation.mutate(testEmail);
  };

  const addRecipient = () => {
    const currentRecipients = formData.reportRecipients || settings?.reportRecipients || [];
    const newRecipient = prompt("Enter email address:");
    if (newRecipient && newRecipient.trim()) {
      handleInputChange("reportRecipients", [...currentRecipients, newRecipient.trim()]);
    }
  };

  const removeRecipient = (index: number) => {
    const currentRecipients = formData.reportRecipients || settings?.reportRecipients || [];
    const updated = currentRecipients.filter((_, i) => i !== index);
    handleInputChange("reportRecipients", updated);
  };

  if (isLoading) {
    return <div>Loading settings...</div>;
  }

  const currentSettings = { ...settings, ...formData };

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-slate-800">Company Settings</h2>
        <Button
          onClick={handleSave}
          disabled={updateSettingsMutation.isPending || Object.keys(formData).length === 0}
          className="gradient-blue text-white font-medium hover:shadow-lg transition-all duration-300"
          data-testid="button-save-settings"
        >
          <Save className="mr-2" size={16} />
          Save Changes
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Company Information */}
        <GlassCard>
          <div className="flex items-center mb-6">
            <Building2 className="mr-3 text-blue-600" size={24} />
            <h3 className="text-lg font-semibold text-slate-800">Company Information</h3>
          </div>
          
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="companyName" className="text-sm font-medium text-slate-700">
                Company Name
              </Label>
              <Input
                id="companyName"
                type="text"
                value={currentSettings?.companyName || ""}
                onChange={(e) => handleInputChange("companyName", e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-white/30 bg-white/50 focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-800"
                data-testid="input-company-name"
              />
            </div>
            
            <div className="space-y-2">
              <Label className="text-sm font-medium text-slate-700">
                Company Logo
              </Label>
              <div className="space-y-4">
                {currentSettings?.logoUrl && (
                  <div className="flex items-center justify-center p-4 bg-white/50 rounded-xl border border-white/30">
                    <img 
                      src={`/objects${currentSettings.logoUrl}`}
                      alt="Company Logo" 
                      className="max-h-20 max-w-40 object-contain"
                      onError={(e) => {
                        console.error("Logo failed to load:", currentSettings.logoUrl);
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
                <p className="text-xs text-slate-500">Recommended: PNG or SVG, max 2MB</p>
              </div>
            </div>
          </div>
        </GlassCard>

        {/* Email Report Settings */}
        <GlassCard>
          <div className="flex items-center mb-6">
            <Mail className="mr-3 text-blue-600" size={24} />
            <h3 className="text-lg font-semibold text-slate-800">Email Reports</h3>
          </div>
          
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-sm font-medium text-slate-700">
                  Enable Automatic Reports
                </Label>
                <p className="text-xs text-slate-500">Send reports automatically via email</p>
              </div>
              <Switch
                checked={currentSettings?.emailReportsEnabled || false}
                onCheckedChange={(checked) => handleInputChange("emailReportsEnabled", checked)}
                data-testid="switch-email-reports"
              />
            </div>
            
            {currentSettings?.emailReportsEnabled && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="reportFrequency" className="text-sm font-medium text-slate-700">
                    Report Frequency
                  </Label>
                  <Select 
                    value={currentSettings?.reportFrequency || "weekly"} 
                    onValueChange={(value) => handleInputChange("reportFrequency", value)}
                  >
                    <SelectTrigger className="w-full px-4 py-3 rounded-xl border border-white/30 bg-white/50" data-testid="select-report-frequency">
                      <SelectValue placeholder="Select frequency" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="daily">Daily</SelectItem>
                      <SelectItem value="weekly">Weekly</SelectItem>
                      <SelectItem value="monthly">Monthly</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm font-medium text-slate-700">
                      Email Recipients
                    </Label>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={addRecipient}
                      data-testid="button-add-recipient"
                    >
                      Add Email
                    </Button>
                  </div>
                  <div className="space-y-2">
                    {(currentSettings?.reportRecipients || []).map((email, index) => (
                      <div key={index} className="flex items-center justify-between p-2 bg-white/50 rounded-lg">
                        <span className="text-sm text-slate-700">{email}</span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => removeRecipient(index)}
                          className="text-red-600 hover:text-red-700"
                          data-testid={`button-remove-recipient-${index}`}
                        >
                          Remove
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
            
            <Separator />
            
            <div className="space-y-3">
              <Label className="text-sm font-medium text-slate-700">
                Test Email Configuration
              </Label>
              <div className="flex gap-2">
                <Input
                  type="email"
                  placeholder="Enter email to test"
                  value={testEmail}
                  onChange={(e) => setTestEmail(e.target.value)}
                  className="flex-1 px-4 py-2 rounded-xl border border-white/30 bg-white/50 focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-800"
                  data-testid="input-test-email"
                />
                <Button
                  onClick={handleTestEmail}
                  disabled={testEmailMutation.isPending}
                  variant="outline"
                  data-testid="button-test-email"
                >
                  {testEmailMutation.isPending ? "Sending..." : "Test"}
                </Button>
              </div>
            </div>
          </div>
        </GlassCard>
      </div>

      {/* Status Information */}
      <GlassCard>
        <div className="flex items-center mb-4">
          <SettingsIcon className="mr-3 text-blue-600" size={24} />
          <h3 className="text-lg font-semibold text-slate-800">Configuration Status</h3>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="text-center">
            <Badge variant={currentSettings?.logoUrl ? "default" : "secondary"} className="mb-2">
              {currentSettings?.logoUrl ? "✓ Logo Set" : "○ No Logo"}
            </Badge>
            <p className="text-sm text-slate-600">Company Branding</p>
          </div>
          
          <div className="text-center">
            <Badge variant={currentSettings?.emailReportsEnabled ? "default" : "secondary"} className="mb-2">
              {currentSettings?.emailReportsEnabled ? "✓ Reports Active" : "○ Reports Disabled"}
            </Badge>
            <p className="text-sm text-slate-600">Email Reports</p>
          </div>
          
          <div className="text-center">
            <Badge variant="default" className="mb-2">
              ✓ SMTP Configured
            </Badge>
            <p className="text-sm text-slate-600">Email Service</p>
          </div>
        </div>
        
        {currentSettings?.lastReportSent && (
          <div className="mt-4 pt-4 border-t border-white/20">
            <p className="text-sm text-slate-600">
              Last automatic report sent: {new Date(currentSettings.lastReportSent).toLocaleString()}
            </p>
          </div>
        )}
      </GlassCard>
    </div>
  );
}