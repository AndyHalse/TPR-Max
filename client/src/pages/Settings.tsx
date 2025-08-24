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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { useTheme } from "@/contexts/ThemeContext";
import { Save, Mail, Upload, Building2, Settings as SettingsIcon, Palette, Monitor, Sun, Moon, Users, UserPlus, Shield, Phone, Globe, AtSign, Printer, QrCode, Barcode, FileText } from "lucide-react";
import type { CompanySettings, InsertCompanySettings } from "@shared/schema";

export default function Settings() {
  const { toast } = useToast();
  const { theme, setTheme } = useTheme();
  const [formData, setFormData] = useState<Partial<InsertCompanySettings>>({});
  const [testEmail, setTestEmail] = useState("");
  const [activeTab, setActiveTab] = useState("company");

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

  const handleBannerUpload = async (fileUrl: string) => {
    try {
      const bannerUrl = fileUrl.replace('https://storage.googleapis.com', '');
      await updateSettingsMutation.mutateAsync({
        bannerUrl: bannerUrl,
      });
      toast({
        title: "Success",
        description: "Banner uploaded and saved successfully!",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to save banner",
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
        <h2 className="text-2xl font-bold text-slate-800">Settings</h2>
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

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-6">
          <TabsTrigger value="company" className="flex items-center gap-2">
            <Building2 size={16} />
            Company
          </TabsTrigger>
          <TabsTrigger value="branding" className="flex items-center gap-2">
            <Palette size={16} />
            Branding
          </TabsTrigger>
          <TabsTrigger value="theme" className="flex items-center gap-2">
            <Monitor size={16} />
            Theme
          </TabsTrigger>
          <TabsTrigger value="printer" className="flex items-center gap-2">
            <Settings as SettingsIcon size={16} />
            Printer
          </TabsTrigger>
          <TabsTrigger value="users" className="flex items-center gap-2">
            <Users size={16} />
            Users
          </TabsTrigger>
          <TabsTrigger value="reports" className="flex items-center gap-2">
            <Mail size={16} />
            Reports
          </TabsTrigger>
        </TabsList>

        <TabsContent value="company" className="space-y-6 mt-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
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
                  <Label htmlFor="address" className="text-sm font-medium text-slate-700">
                    Company Address
                  </Label>
                  <Input
                    id="address"
                    type="text"
                    value={currentSettings?.address || ""}
                    onChange={(e) => handleInputChange("address", e.target.value)}
                    className="w-full px-4 py-3 rounded-xl border border-white/30 bg-white/50 focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-800"
                    placeholder="123 Business Street, City, Postcode"
                    data-testid="input-company-address"
                  />
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="phone" className="text-sm font-medium text-slate-700">
                      Phone Number
                    </Label>
                    <Input
                      id="phone"
                      type="tel"
                      value={currentSettings?.phone || ""}
                      onChange={(e) => handleInputChange("phone", e.target.value)}
                      className="w-full px-4 py-3 rounded-xl border border-white/30 bg-white/50 focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-800"
                      placeholder="+44 20 1234 5678"
                      data-testid="input-company-phone"
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="email" className="text-sm font-medium text-slate-700">
                      Company Email
                    </Label>
                    <Input
                      id="email"
                      type="email"
                      value={currentSettings?.email || ""}
                      onChange={(e) => handleInputChange("email", e.target.value)}
                      className="w-full px-4 py-3 rounded-xl border border-white/30 bg-white/50 focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-800"
                      placeholder="info@yourcompany.com"
                      data-testid="input-company-email"
                    />
                  </div>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="website" className="text-sm font-medium text-slate-700">
                    Company Website
                  </Label>
                  <Input
                    id="website"
                    type="url"
                    value={currentSettings?.website || ""}
                    onChange={(e) => handleInputChange("website", e.target.value)}
                    className="w-full px-4 py-3 rounded-xl border border-white/30 bg-white/50 focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-800"
                    placeholder="https://www.yourcompany.com"
                    data-testid="input-company-website"
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

            <GlassCard>
              <div className="flex items-center mb-4">
                <SettingsIcon className="mr-3 text-blue-600" size={24} />
                <h3 className="text-lg font-semibold text-slate-800">Configuration Status</h3>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="text-center">
                  <Badge variant={currentSettings?.logoUrl ? "default" : "secondary"} className="mb-2">
                    {currentSettings?.logoUrl ? "✓ Logo Set" : "○ No Logo"}
                  </Badge>
                  <p className="text-sm text-slate-600">Company Branding</p>
                </div>
                
                <div className="text-center">
                  <Badge variant="default" className="mb-2">
                    ✓ SMTP Configured
                  </Badge>
                  <p className="text-sm text-slate-600">Email Service</p>
                </div>
              </div>
            </GlassCard>
          </div>
        </TabsContent>

        <TabsContent value="branding" className="space-y-6 mt-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <GlassCard>
              <div className="flex items-center mb-6">
                <Palette className="mr-3 text-blue-600" size={24} />
                <h3 className="text-lg font-semibold text-slate-800">Color Theme</h3>
              </div>
              
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="backgroundColor" className="text-sm font-medium text-slate-700">
                    Background Color
                  </Label>
                  <div className="flex gap-3 items-center">
                    <Input
                      id="backgroundColor"
                      type="color"
                      value={currentSettings?.backgroundColor || "#f8fafc"}
                      onChange={(e) => handleInputChange("backgroundColor", e.target.value)}
                      className="w-20 h-12 p-1 rounded-xl border border-white/30 bg-white/50"
                      data-testid="input-background-color"
                    />
                    <Input
                      type="text"
                      value={currentSettings?.backgroundColor || "#f8fafc"}
                      onChange={(e) => handleInputChange("backgroundColor", e.target.value)}
                      className="flex-1 px-4 py-3 rounded-xl border border-white/30 bg-white/50 focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-800 font-mono"
                      placeholder="#f8fafc"
                    />
                  </div>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="foregroundColor" className="text-sm font-medium text-slate-700">
                    Text Color
                  </Label>
                  <div className="flex gap-3 items-center">
                    <Input
                      id="foregroundColor"
                      type="color"
                      value={currentSettings?.foregroundColor || "#1e293b"}
                      onChange={(e) => handleInputChange("foregroundColor", e.target.value)}
                      className="w-20 h-12 p-1 rounded-xl border border-white/30 bg-white/50"
                      data-testid="input-foreground-color"
                    />
                    <Input
                      type="text"
                      value={currentSettings?.foregroundColor || "#1e293b"}
                      onChange={(e) => handleInputChange("foregroundColor", e.target.value)}
                      className="flex-1 px-4 py-3 rounded-xl border border-white/30 bg-white/50 focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-800 font-mono"
                      placeholder="#1e293b"
                    />
                  </div>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="accentColor" className="text-sm font-medium text-slate-700">
                    Accent Color
                  </Label>
                  <div className="flex gap-3 items-center">
                    <Input
                      id="accentColor"
                      type="color"
                      value={currentSettings?.accentColor || "#3b82f6"}
                      onChange={(e) => handleInputChange("accentColor", e.target.value)}
                      className="w-20 h-12 p-1 rounded-xl border border-white/30 bg-white/50"
                      data-testid="input-accent-color"
                    />
                    <Input
                      type="text"
                      value={currentSettings?.accentColor || "#3b82f6"}
                      onChange={(e) => handleInputChange("accentColor", e.target.value)}
                      className="flex-1 px-4 py-3 rounded-xl border border-white/30 bg-white/50 focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-800 font-mono"
                      placeholder="#3b82f6"
                    />
                  </div>
                </div>
                
                <div className="p-4 rounded-xl border-2 border-dashed border-slate-300 mt-6">
                  <div 
                    className="p-4 rounded-lg transition-colors"
                    style={{
                      backgroundColor: currentSettings?.backgroundColor || "#f8fafc",
                      color: currentSettings?.foregroundColor || "#1e293b"
                    }}
                  >
                    <h4 className="font-semibold mb-2">Preview</h4>
                    <p className="text-sm mb-3">This is how your branding will look</p>
                    <div 
                      className="inline-block px-3 py-2 rounded text-white text-sm"
                      style={{ backgroundColor: currentSettings?.accentColor || "#3b82f6" }}
                    >
                      Button Example
                    </div>
                  </div>
                </div>
              </div>
            </GlassCard>
            
            <GlassCard>
              <div className="flex items-center mb-6">
                <Monitor className="mr-3 text-blue-600" size={24} />
                <h3 className="text-lg font-semibold text-slate-800">Kiosk Banner</h3>
              </div>
              
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-sm font-medium text-slate-700">
                    Welcome Banner Image
                  </Label>
                  <p className="text-xs text-slate-500 mb-3">Displayed prominently on kiosk mode. Recommended: 1200x300px or similar wide format</p>
                  
                  {currentSettings?.bannerUrl && (
                    <div className="mb-4 p-4 bg-white/50 rounded-xl border border-white/30">
                      <img 
                        src={`/objects${currentSettings.bannerUrl}`}
                        alt="Kiosk Banner" 
                        className="w-full h-24 object-cover rounded-lg"
                        onError={(e) => {
                          console.error("Banner failed to load:", currentSettings.bannerUrl);
                          e.currentTarget.style.display = 'none';
                        }}
                      />
                    </div>
                  )}
                  
                  <ObjectUploader
                    onUploadComplete={handleBannerUpload}
                    accept="image/*"
                    maxSize={5 * 1024 * 1024}
                    buttonClassName="w-full"
                  >
                    <Upload className="mr-2" size={16} />
                    {currentSettings?.bannerUrl ? "Replace Banner" : "Upload Banner"}
                  </ObjectUploader>
                  
                  <p className="text-xs text-slate-500">Recommended: JPG or PNG, max 5MB, wide format (3:1 or 4:1 ratio)</p>
                </div>
                
                {currentSettings?.bannerUrl && (
                  <div className="p-4 rounded-xl border-2 border-dashed border-slate-300">
                    <h4 className="font-semibold mb-2 text-sm">Kiosk Preview</h4>
                    <div 
                      className="rounded-lg p-6 text-center"
                      style={{
                        backgroundColor: currentSettings?.backgroundColor || "#f8fafc",
                        color: currentSettings?.foregroundColor || "#1e293b"
                      }}
                    >
                      <img 
                        src={`/objects${currentSettings.bannerUrl}`}
                        alt="Banner Preview" 
                        className="w-full h-16 object-cover rounded mb-4"
                      />
                      <h3 className="text-lg font-bold">Welcome to {currentSettings?.companyName || "Your Company"}</h3>
                      <p className="text-sm opacity-75">Touch to begin check-in</p>
                    </div>
                  </div>
                )}
              </div>
            </GlassCard>
          </div>
        </TabsContent>

        <TabsContent value="theme" className="space-y-6 mt-6">
          <GlassCard>
            <div className="flex items-center mb-6">
              <Monitor className="mr-3 text-blue-600" size={24} />
              <h3 className="text-lg font-semibold text-slate-800">Application Theme</h3>
            </div>
            
            <div className="space-y-6">
              <div className="flex items-center justify-between p-4 bg-white/50 rounded-xl border border-white/30">
                <div className="flex items-center space-x-4">
                  <Sun className="text-yellow-500" size={24} />
                  <div>
                    <h4 className="font-medium text-slate-800">Light Mode</h4>
                    <p className="text-sm text-slate-600">Clean, bright interface</p>
                  </div>
                </div>
                <Button
                  variant={theme === "light" ? "default" : "outline"}
                  onClick={() => setTheme("light")}
                  data-testid="button-light-theme"
                >
                  {theme === "light" && "✓"} Select
                </Button>
              </div>
              
              <div className="flex items-center justify-between p-4 bg-white/50 rounded-xl border border-white/30">
                <div className="flex items-center space-x-4">
                  <Moon className="text-slate-700" size={24} />
                  <div>
                    <h4 className="font-medium text-slate-800">Dark Mode</h4>
                    <p className="text-sm text-slate-600">Easy on the eyes for long sessions</p>
                  </div>
                </div>
                <Button
                  variant={theme === "dark" ? "default" : "outline"}
                  onClick={() => setTheme("dark")}
                  data-testid="button-dark-theme"
                >
                  {theme === "dark" && "✓"} Select
                </Button>
              </div>
              
              <div className="flex items-center justify-between p-4 bg-white/50 rounded-xl border border-white/30">
                <div className="flex items-center space-x-4">
                  <Monitor className="text-blue-600" size={24} />
                  <div>
                    <h4 className="font-medium text-slate-800">System</h4>
                    <p className="text-sm text-slate-600">Follow system preference</p>
                  </div>
                </div>
                <Button
                  variant={theme === "system" ? "default" : "outline"}
                  onClick={() => setTheme("system")}
                  data-testid="button-system-theme"
                >
                  {theme === "system" && "✓"} Select
                </Button>
              </div>
              
              <div className="mt-6 p-4 rounded-xl border-2 border-dashed border-slate-300">
                <h4 className="font-semibold mb-3">Theme Preview</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="p-4 bg-white rounded-lg shadow-sm">
                    <h5 className="font-medium text-slate-800 mb-2">Light Theme</h5>
                    <p className="text-sm text-slate-600 mb-3">Clean and professional appearance</p>
                    <div className="h-2 bg-blue-500 rounded"></div>
                  </div>
                  <div className="p-4 bg-slate-800 text-white rounded-lg shadow-sm">
                    <h5 className="font-medium mb-2">Dark Theme</h5>
                    <p className="text-sm text-slate-300 mb-3">Reduced eye strain for extended use</p>
                    <div className="h-2 bg-blue-400 rounded"></div>
                  </div>
                </div>
              </div>
            </div>
          </GlassCard>
        </TabsContent>

        <TabsContent value="printer" className="space-y-6 mt-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <GlassCard>
              <div className="flex items-center mb-6">
                <Printer className="mr-3 text-blue-600" size={24} />
                <h3 className="text-lg font-semibold text-slate-800">Printer Configuration</h3>
              </div>
              
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="selectedPrinter" className="text-sm font-medium text-slate-700">
                    Default Printer
                  </Label>
                  <Select
                    value={currentSettings?.selectedPrinter || "PDF Printer"}
                    onValueChange={(value) => handleInputChange("selectedPrinter", value)}
                  >
                    <SelectTrigger className="w-full px-4 py-3 rounded-xl border border-white/30 bg-white/50" data-testid="select-printer">
                      <SelectValue placeholder="Select a printer" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="PDF Printer">PDF Printer (Testing)</SelectItem>
                      <SelectItem value="B-FV4 Thermal Printer">B-FV4 Thermal Printer</SelectItem>
                      <SelectItem value="Brother QL-800">Brother QL-800</SelectItem>
                      <SelectItem value="DYMO LabelWriter 450">DYMO LabelWriter 450</SelectItem>
                      <SelectItem value="Zebra ZD410">Zebra ZD410</SelectItem>
                      <SelectItem value="System Default">System Default Printer</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-slate-500">Select your installed printer or use PDF for testing</p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="printQuality" className="text-sm font-medium text-slate-700">
                    Print Quality
                  </Label>
                  <Select
                    value={currentSettings?.printQuality || "normal"}
                    onValueChange={(value) => handleInputChange("printQuality", value)}
                  >
                    <SelectTrigger className="w-full px-4 py-3 rounded-xl border border-white/30 bg-white/50" data-testid="select-print-quality">
                      <SelectValue placeholder="Select print quality" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="draft">Draft (Fast)</SelectItem>
                      <SelectItem value="normal">Normal</SelectItem>
                      <SelectItem value="high">High Quality</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-slate-500">Higher quality uses more ink but provides clearer text</p>
                </div>

                <div className="space-y-4 pt-4 border-t border-white/30">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label className="text-sm font-medium text-slate-700">Auto-Print Passes</Label>
                      <p className="text-xs text-slate-500">Automatically print visitor passes after check-in</p>
                    </div>
                    <Switch
                      checked={currentSettings?.enableQrCodes !== false}
                      onCheckedChange={(checked) => handleInputChange("enableQrCodes", checked)}
                      data-testid="switch-auto-print"
                    />
                  </div>
                </div>
              </div>
            </GlassCard>

            <GlassCard>
              <div className="flex items-center mb-6">
                <QrCode className="mr-3 text-blue-600" size={24} />
                <h3 className="text-lg font-semibold text-slate-800">Barcode & QR Settings</h3>
              </div>
              
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="barcodeFormat" className="text-sm font-medium text-slate-700">
                    Barcode Format
                  </Label>
                  <Select
                    value={currentSettings?.barcodeFormat || "QR_CODE"}
                    onValueChange={(value) => handleInputChange("barcodeFormat", value)}
                  >
                    <SelectTrigger className="w-full px-4 py-3 rounded-xl border border-white/30 bg-white/50" data-testid="select-barcode-format">
                      <SelectValue placeholder="Select barcode format" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="QR_CODE">QR Code (Recommended)</SelectItem>
                      <SelectItem value="DATA_MATRIX">Data Matrix</SelectItem>
                      <SelectItem value="PDF417">PDF417</SelectItem>
                      <SelectItem value="CODE128">Code 128</SelectItem>
                      <SelectItem value="CODE39">Code 39</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-slate-500">QR codes work best for mobile scanning</p>
                </div>

                <div className="space-y-4 pt-4 border-t border-white/30">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label className="text-sm font-medium text-slate-700">Enable 2D Barcodes</Label>
                      <p className="text-xs text-slate-500">Use advanced 2D barcode formats for enhanced data storage</p>
                    </div>
                    <Switch
                      checked={currentSettings?.enable2dBarcodes === true}
                      onCheckedChange={(checked) => handleInputChange("enable2dBarcodes", checked)}
                      data-testid="switch-2d-barcodes"
                    />
                  </div>
                </div>

                <div className="p-4 rounded-xl border-2 border-dashed border-slate-300">
                  <h4 className="font-semibold mb-3 text-sm flex items-center gap-2">
                    <Barcode size={16} />
                    Barcode Preview
                  </h4>
                  <div className="text-center">
                    <div className="inline-block p-4 bg-white rounded border-2 border-dashed border-slate-400">
                      {currentSettings?.barcodeFormat === "QR_CODE" ? (
                        <QrCode size={48} className="text-slate-800 mx-auto" />
                      ) : (
                        <Barcode size={48} className="text-slate-800 mx-auto" />
                      )}
                    </div>
                    <p className="text-xs text-slate-500 mt-2">
                      Sample {currentSettings?.barcodeFormat || "QR_CODE"} code
                    </p>
                  </div>
                </div>
              </div>
            </GlassCard>
          </div>

          <GlassCard>
            <div className="flex items-center mb-6">
              <FileText className="mr-3 text-blue-600" size={24} />
              <h3 className="text-lg font-semibold text-slate-800">Print Test & Troubleshooting</h3>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Button
                variant="outline"
                className="h-20 flex flex-col items-center justify-center space-y-2 bg-white/50 border-white/30"
                data-testid="button-test-print"
              >
                <Printer size={24} />
                <span>Test Print</span>
              </Button>
              
              <Button
                variant="outline"
                className="h-20 flex flex-col items-center justify-center space-y-2 bg-white/50 border-white/30"
                data-testid="button-print-to-pdf"
              >
                <FileText size={24} />
                <span>Print to PDF</span>
              </Button>
              
              <Button
                variant="outline"
                className="h-20 flex flex-col items-center justify-center space-y-2 bg-white/50 border-white/30"
                data-testid="button-printer-status"
              >
                <Monitor size={24} />
                <span>Printer Status</span>
              </Button>
            </div>

            <div className="mt-6 p-4 bg-blue-50 rounded-xl border border-blue-200">
              <h4 className="font-semibold text-blue-800 mb-2">Supported Printers</h4>
              <ul className="text-sm text-blue-700 space-y-1">
                <li>• B-FV4 Desktop Thermal Printer (95mm x 66mm passes)</li>
                <li>• Brother QL series label printers</li>
                <li>• DYMO LabelWriter series</li>
                <li>• Zebra desktop printers</li>
                <li>• Any Windows-compatible printer via PDF export</li>
              </ul>
            </div>
          </GlassCard>
        </TabsContent>

        <TabsContent value="users" className="space-y-6 mt-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <GlassCard>
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center">
                  <Users className="mr-3 text-blue-600" size={24} />
                  <h3 className="text-lg font-semibold text-slate-800">User Management</h3>
                </div>
                <Button
                  size="sm"
                  className="gradient-blue text-white"
                  data-testid="button-invite-user"
                >
                  <UserPlus className="mr-2" size={16} />
                  Invite User
                </Button>
              </div>
              
              <div className="space-y-4">
                <div className="flex items-center justify-between p-3 bg-white/50 rounded-lg">
                  <div className="flex items-center space-x-3">
                    <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center">
                      <span className="text-white text-sm font-bold">A</span>
                    </div>
                    <div>
                      <p className="font-medium text-slate-800">Andy (You)</p>
                      <p className="text-sm text-slate-600">Administrator</p>
                    </div>
                  </div>
                  <Badge variant="default">Admin</Badge>
                </div>
                
                <div className="text-center py-8">
                  <Shield className="mx-auto text-slate-400 mb-4" size={48} />
                  <p className="text-slate-600 mb-4">No additional users yet</p>
                  <Button variant="outline" size="sm">
                    <UserPlus className="mr-2" size={16} />
                    Send First Invitation
                  </Button>
                </div>
              </div>
            </GlassCard>
            
            <GlassCard>
              <div className="flex items-center mb-6">
                <UserPlus className="mr-3 text-blue-600" size={24} />
                <h3 className="text-lg font-semibold text-slate-800">Invite New User</h3>
              </div>
              
              <form className="space-y-4" onSubmit={(e) => e.preventDefault()}>
                <div className="space-y-2">
                  <Label htmlFor="inviteEmail" className="text-sm font-medium text-slate-700">
                    Email Address
                  </Label>
                  <Input
                    id="inviteEmail"
                    type="email"
                    placeholder="user@example.com"
                    className="w-full px-4 py-3 rounded-xl border border-white/30 bg-white/50 focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-800"
                    data-testid="input-invite-email"
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="userRole" className="text-sm font-medium text-slate-700">
                    User Role
                  </Label>
                  <Select defaultValue="user">
                    <SelectTrigger className="w-full px-4 py-3 rounded-xl border border-white/30 bg-white/50" data-testid="select-user-role">
                      <SelectValue placeholder="Select role" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="user">Standard User</SelectItem>
                      <SelectItem value="admin">Administrator</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                <Button 
                  type="submit" 
                  className="w-full gradient-blue text-white"
                  data-testid="button-send-invitation"
                >
                  Send Invitation
                </Button>
              </form>
              
              <div className="mt-6 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                <h4 className="font-medium text-blue-800 dark:text-blue-200 mb-2">Invitation Process:</h4>
                <ul className="text-sm text-blue-700 dark:text-blue-300 space-y-1">
                  <li>• User receives email invitation with secure link</li>
                  <li>• They create their account using the invitation</li>
                  <li>• Access permissions are based on assigned role</li>
                  <li>• Invitations expire after 7 days</li>
                </ul>
              </div>
            </GlassCard>
          </div>
        </TabsContent>

        <TabsContent value="reports" className="space-y-6 mt-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
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
              </div>
            </GlassCard>
            
            <GlassCard>
              <div className="flex items-center mb-6">
                <Mail className="mr-3 text-blue-600" size={24} />
                <h3 className="text-lg font-semibold text-slate-800">Test Email</h3>
              </div>
              
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
                
                <div className="mt-4 pt-4 border-t border-white/20">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                    <div className="mt-4">
                      <p className="text-sm text-slate-600">
                        Last automatic report sent: {new Date(currentSettings.lastReportSent).toLocaleString()}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </GlassCard>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}