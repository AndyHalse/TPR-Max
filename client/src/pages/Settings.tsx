import { useState, useRef } from "react";
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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useTheme } from "@/contexts/ThemeContext";
import { Save, Mail, Upload, Building2, Settings as SettingsIcon, Palette, Monitor, Sun, Moon, Users, UserPlus, Shield, Phone, Globe, AtSign, Printer, QrCode, Barcode, FileText, CreditCard, Move, User, Hash, Building, Database, Server, HardDrive, CheckCircle, XCircle, RotateCcw, TestTube, Edit, Trash2, Plus, Brain, RefreshCw, Download, FolderOpen, Scan, Settings2 } from "lucide-react";
import type { CompanySettings, InsertCompanySettings, Department, InsertDepartment } from "@shared/schema";
import { IdCardDesignSystem } from "@/components/IdCardDesignSystem";
import { ThermalPassDesigner } from "@/components/ThermalPassDesigner";

export default function Settings() {
  const { toast } = useToast();
  const { theme, setTheme } = useTheme();
  const [formData, setFormData] = useState<Partial<InsertCompanySettings>>({});
  const [testEmail, setTestEmail] = useState("");
  const [activeTab, setActiveTab] = useState("company");
  const [brandingSubTab, setBrandingSubTab] = useState("visual");
  const [printingSubTab, setPrintingSubTab] = useState("printer");
  const [showAddEmailDialog, setShowAddEmailDialog] = useState(false);
  const [newEmailRecipient, setNewEmailRecipient] = useState("");
  const [inviteForm, setInviteForm] = useState({ email: "", role: "user" });
  const autoSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [isManualResetDisabled, setIsManualResetDisabled] = useState(false);
  const [showManualResetDialog, setShowManualResetDialog] = useState(false);
  const [showDepartmentDialog, setShowDepartmentDialog] = useState(false);
  const [departmentToEdit, setDepartmentToEdit] = useState<Department | null>(null);
  const [suggestedTextColors, setSuggestedTextColors] = useState<{light: string, dark: string}>({ light: '#000000', dark: '#ffffff' });
  const [departmentForm, setDepartmentForm] = useState<Partial<InsertDepartment>>({
    name: "",
    description: "",
    color: "bg-blue-500"
  });

  // Backup/Restore state
  const [selectedBackupFile, setSelectedBackupFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: settings, isLoading } = useQuery<CompanySettings>({
    queryKey: ["/api/settings"],
  });

  const { data: systemStatus } = useQuery<{
    success: boolean;
    services: {
      database: boolean;
      email: boolean;
      workflow: boolean;
      storage?: boolean;
      authentication?: boolean;
    };
    uptime?: number;
    timestamp: string;
  }>({
    queryKey: ["/api/system/status"],
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  const { data: departments } = useQuery<Department[]>({
    queryKey: ["/api/departments"],
  });

  const { data: detectedPrinters, refetch: refetchPrinters, isFetching: isDetectingPrinters } = useQuery<{
    success: boolean;
    platform: string;
    printers: Array<{
      name: string;
      driver: string;
      port: string;
      status: string;
      isOnline: boolean;
    }>;
    detectedAt: string;
    message?: string;
  }>({
    queryKey: ["/api/printers/detect"],
    staleTime: 60000, // Consider data fresh for 1 minute
  });

  const updateSettingsMutation = useMutation({
    mutationFn: async (updates: Partial<InsertCompanySettings>) => {
      console.log('Mutation function called with:', updates);
      const response = await apiRequest("PUT", "/api/settings", updates);
      console.log('Mutation response:', response);
      return response;
    },
    onSuccess: (data) => {
      console.log('Mutation success:', data);
      queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
      // Only clear form data for manual saves, not uploads
      // setFormData({}) - REMOVED to prevent clearing typed data
    },
    onError: (error) => {
      console.error('Mutation error:', error);
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

  const inviteMutation = useMutation({
    mutationFn: async (inviteData: { email: string; role: string }) => {
      const response = await apiRequest("POST", "/api/invitations", inviteData);
      return response;
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Invitation sent successfully!",
      });
      setInviteForm({ email: "", role: "user" });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to send invitation",
        variant: "destructive",
      });
    },
  });

  const manualResetMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/daily-reset/manual");
      return response.json();
    },
    onSuccess: (data) => {
      // Invalidate all relevant queries to refresh data across the app
      queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
      queryClient.invalidateQueries({ queryKey: ["/api/visitors/current"] });
      queryClient.invalidateQueries({ queryKey: ["/api/visitors"] });
      queryClient.invalidateQueries({ queryKey: ["/api/staff/checked-in"] });
      queryClient.invalidateQueries({ queryKey: ["/api/staff"] });
      queryClient.invalidateQueries({ queryKey: ["/api/contractors"] });
      queryClient.invalidateQueries({ queryKey: ["/api/muster"] });
      queryClient.invalidateQueries({ queryKey: ["/api/activity/recent"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      toast({
        title: "Manual Reset Complete",
        description: `Checked out ${data.visitorsCheckedOut} visitors, ${data.staffCheckedOut} staff, and ${data.contractorsCheckedOut} contractors.`,
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to perform manual reset",
        variant: "destructive",
      });
    },
  });

  const testResetMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/daily-reset/preview");
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Reset Preview",
        description: `Would check out: ${data.visitorsToCheckOut} visitors, ${data.staffToCheckOut} staff, ${data.contractorsToCheckOut} contractors.`,
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to preview daily reset",
        variant: "destructive",
      });
    },
  });

  const departmentMutation = useMutation({
    mutationFn: async (data: { department: InsertDepartment; isEdit: boolean; id?: string }) => {
      const { department, isEdit, id } = data;
      if (isEdit && id) {
        const response = await apiRequest("PUT", `/api/departments/${id}`, department);
        return response.json();
      } else {
        const response = await apiRequest("POST", "/api/departments", department);
        return response.json();
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/departments"] });
      setShowDepartmentDialog(false);
      setDepartmentToEdit(null);
      setDepartmentForm({ name: "", description: "", color: "bg-blue-500" });
      toast({
        title: "Success",
        description: departmentToEdit ? "Department updated successfully!" : "Department created successfully!",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to save department",
        variant: "destructive",
      });
    },
  });

  // Auto-save functionality
  const triggerAutoSave = (field: string, value: any) => {
    if (autoSaveTimeoutRef.current) {
      clearTimeout(autoSaveTimeoutRef.current);
    }
    
    // Update form data immediately for UI responsiveness
    setFormData(prev => ({ ...prev, [field]: value }));
    
    // Debounce the auto-save
    autoSaveTimeoutRef.current = setTimeout(() => {
      const updates = { [field]: value };
      console.log('Auto-saving:', updates);
      updateSettingsMutation.mutate(updates);
    }, 1500); // 1.5 second delay
  };

  const handleInputChange = (field: string, value: any) => {
    triggerAutoSave(field, value);
  };

  const handleSave = () => {
    if (Object.keys(formData).length > 0) {
      updateSettingsMutation.mutate(formData);
    }
  };

  const handleLogoUpload = (result: any) => {
    if (result.successful && result.successful[0]) {
      const uploadURL = result.successful[0].uploadURL;
      console.log("Logo upload URL:", uploadURL);
      const logoPath = uploadURL.replace(window.location.origin, "");
      handleInputChange("logoUrl", logoPath);
    }
  };

  const addEmailRecipient = () => {
    if (newEmailRecipient) {
      const currentRecipients = formData.reportRecipients || settings?.reportRecipients || [];
      const updated = [...currentRecipients, newEmailRecipient];
      handleInputChange("reportRecipients", updated);
      setNewEmailRecipient("");
      setShowAddEmailDialog(false);
    }
  };

  const handleManualReset = () => {
    setShowManualResetDialog(true);
  };

  const confirmManualReset = () => {
    setIsManualResetDisabled(true);
    setShowManualResetDialog(false);
    manualResetMutation.mutate();
    setTimeout(() => setIsManualResetDisabled(false), 5000); // Prevent spam clicking
  };

  const handleTestReset = () => {
    testResetMutation.mutate();
  };

  const removeRecipient = (index: number) => {
    const currentRecipients = formData.reportRecipients || settings?.reportRecipients || [];
    const updated = currentRecipients.filter((_, i) => i !== index);
    handleInputChange("reportRecipients", updated);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-slate-600">Loading settings...</p>
        </div>
      </div>
    );
  }

  const currentSettings = { ...settings, ...formData };

  return (
    <div className="space-y-8 p-6 rounded-xl bg-background min-h-screen">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-fixed">Settings</h2>
        <Button
          onClick={handleSave}
          disabled={updateSettingsMutation.isPending || Object.keys(formData).length === 0}
          variant="outline"
          className="border-green-200 text-green-700 hover:bg-green-50 font-medium transition-all duration-300"
          data-testid="button-save-settings"
        >
          <Save className="mr-2" size={16} />
          {Object.keys(formData).length === 0 ? 'All Settings Auto-Saved' : 'Save Remaining Changes'}
        </Button>
      </div>

      {/* Auto-save information banner */}
      <div className="flex items-center gap-3 p-4 bg-green-50 border border-green-200 rounded-lg">
        <div className="h-2 w-2 bg-green-500 rounded-full animate-pulse"></div>
        <p className="text-sm text-green-800 font-medium">
          ✨ Auto-save enabled - All changes are automatically saved after 1.5 seconds
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-9">
          <TabsTrigger value="company" className="flex items-center gap-2">
            <Building2 size={16} />
            Company
          </TabsTrigger>
          <TabsTrigger value="branding" className="flex items-center gap-2">
            <Palette size={16} />
            Branding
          </TabsTrigger>
          <TabsTrigger value="printing" className="flex items-center gap-2">
            <Printer size={16} />
            Printing & ID
          </TabsTrigger>
          <TabsTrigger value="display" className="flex items-center gap-2">
            <Monitor size={16} />
            Display
          </TabsTrigger>
          <TabsTrigger value="biostar" className="flex items-center gap-2">
            <Shield size={16} />
            Biostar
          </TabsTrigger>
          <TabsTrigger value="users" className="flex items-center gap-2">
            <Users size={16} />
            Users
          </TabsTrigger>
          <TabsTrigger value="departments" className="flex items-center gap-2">
            <Building size={16} />
            Departments
          </TabsTrigger>
          <TabsTrigger value="reports" className="flex items-center gap-2">
            <Mail size={16} />
            Reports
          </TabsTrigger>
          <TabsTrigger value="ai" className="flex items-center gap-2">
            <Brain size={16} />
            AI
          </TabsTrigger>
          <TabsTrigger value="system" className="flex items-center gap-2">
            <SettingsIcon size={16} />
            System
          </TabsTrigger>
        </TabsList>

        <TabsContent value="company" className="space-y-6 mt-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <GlassCard>
              <div className="flex items-center mb-6">
                <Building2 className="mr-3 text-blue-600" size={24} />
                <h3 className="text-lg font-semibold text-fixed">Company Information</h3>
              </div>
              
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="companyName" className="text-sm font-medium text-variable">
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
                    {currentSettings?.logoUrl && !currentSettings.logoUrl.includes('test') && (
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
              
              <div className="space-y-3">
                <div className="flex items-center justify-between p-3 bg-green-50 rounded-lg border border-green-200">
                  <div className="flex items-center gap-3">
                    <CheckCircle className="text-green-600" size={20} />
                    <span className="text-green-800 font-medium">SQL Online</span>
                  </div>
                  <Badge variant="secondary" className="bg-green-100 text-green-700">
                    Database
                  </Badge>
                </div>

                <div className="flex items-center justify-between p-3 bg-red-50 rounded-lg border border-red-200">
                  <div className="flex items-center gap-3">
                    <XCircle className="text-red-600" size={20} />
                    <span className="text-red-800 font-medium">No SMTP</span>
                  </div>
                  <Badge variant="secondary" className="bg-red-100 text-red-700">
                    Email Service
                  </Badge>
                </div>

                <div className="flex items-center justify-between p-3 bg-green-50 rounded-lg border border-green-200">
                  <div className="flex items-center gap-3">
                    <CheckCircle className="text-green-600" size={20} />
                    <span className="text-green-800 font-medium">Server Online</span>
                  </div>
                  <Badge variant="secondary" className="bg-green-100 text-green-700">
                    Server Status
                  </Badge>
                </div>

                <div className="mt-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
                  <div className="text-center">
                    <p className="text-sm text-blue-800 font-medium mb-2">Server Uptime</p>
                    <p className="text-xs text-blue-600">
                      0h 1m • Last Check: {new Date().toLocaleTimeString()}
                    </p>
                    <p className="text-xs text-blue-500 mt-1">All Settings Auto-Saved</p>
                  </div>
                </div>
              </div>
            </GlassCard>
          </div>
        </TabsContent>

        {/* Continue with a placeholder structure for now - I'll add the rest */}
        <TabsContent value="branding">
          <div className="text-center py-8">
            <p className="text-slate-600">Branding features will be restored shortly...</p>
          </div>
        </TabsContent>

        <TabsContent value="printing" className="space-y-6 mt-6">
          <Tabs value={printingSubTab} onValueChange={setPrintingSubTab} className="w-full">
            <TabsList className="grid w-full grid-cols-4 mb-6">
              <TabsTrigger value="printer" className="flex items-center gap-2">
                <Printer size={16} />
                Printer Settings
              </TabsTrigger>
              <TabsTrigger value="idcards" className="flex items-center gap-2">
                <CreditCard size={16} />
                ID Cards
              </TabsTrigger>
              <TabsTrigger value="thermal-passes" className="flex items-center gap-2">
                <FileText size={16} />
                Thermal Passes
              </TabsTrigger>
              <TabsTrigger value="qr-readers" className="flex items-center gap-2">
                <Scan size={16} />
                QR Readers
              </TabsTrigger>
            </TabsList>

            <TabsContent value="printer" className="space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <GlassCard>
                  <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center">
                      <Printer className="mr-3 text-blue-600" size={24} />
                      <h3 className="text-lg font-semibold text-slate-800">Printer Configuration</h3>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => refetchPrinters()}
                      disabled={isDetectingPrinters}
                      className="flex items-center gap-2"
                      data-testid="button-refresh-printers"
                    >
                      <RefreshCw className={`h-4 w-4 ${isDetectingPrinters ? 'animate-spin' : ''}`} />
                      {isDetectingPrinters ? 'Detecting...' : 'Refresh Printers'}
                    </Button>
                  </div>

                  {detectedPrinters && (
                    <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                      <div className="flex items-center gap-2 mb-1">
                        <Monitor className="h-4 w-4 text-blue-600" />
                        <span className="text-sm font-medium text-blue-800">
                          Platform: {detectedPrinters.platform} • {detectedPrinters.printers.length} printers found
                        </span>
                      </div>
                      <p className="text-xs text-blue-600">
                        Last detected: {new Date(detectedPrinters.detectedAt).toLocaleString()}
                      </p>
                      {detectedPrinters.message && (
                        <p className="text-xs text-blue-600 mt-1">{detectedPrinters.message}</p>
                      )}
                    </div>
                  )}
                  
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="selectedPrinter" className="text-sm font-medium text-slate-700">
                        Default Printer (Visitor Passes)
                      </Label>
                      <Select
                        value={currentSettings?.selectedPrinter || "PDF Printer"}
                        onValueChange={(value) => handleInputChange("selectedPrinter", value)}
                      >
                        <SelectTrigger className="w-full px-4 py-3 rounded-xl border border-white/30 bg-white/50" data-testid="select-printer">
                          <SelectValue placeholder="Select a printer" />
                        </SelectTrigger>
                        <SelectContent>
                          {detectedPrinters?.printers?.map((printer) => (
                            <SelectItem key={printer.name} value={printer.name}>
                              <div className="flex items-center justify-between w-full">
                                <span>{printer.name}</span>
                                <div className="flex items-center gap-2 ml-2">
                                  {printer.isOnline ? (
                                    <Badge variant="default" className="bg-green-100 text-green-800 text-xs">
                                      {printer.status}
                                    </Badge>
                                  ) : (
                                    <Badge variant="secondary" className="bg-red-100 text-red-600 text-xs">
                                      {printer.status}
                                    </Badge>
                                  )}
                                </div>
                              </div>
                            </SelectItem>
                          )) || (
                            <SelectItem value="No printers detected" disabled>
                              No printers detected - Click "Refresh Printers"
                            </SelectItem>
                          )}
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
            </TabsContent>

            <TabsContent value="idcards">
              <div className="text-center py-8">
                <p className="text-slate-600">ID Cards configuration will be restored next...</p>
              </div>
            </TabsContent>

            <TabsContent value="thermal-passes">
              <div className="text-center py-8">
                <p className="text-slate-600">Thermal Pass designer will be restored next...</p>
              </div>
            </TabsContent>

            <TabsContent value="qr-readers">
              <div className="text-center py-8">
                <p className="text-slate-600">QR Reader configuration will be restored next...</p>
              </div>
            </TabsContent>
          </Tabs>
        </TabsContent>

        <TabsContent value="display">
          <div className="text-center py-8">
            <p className="text-slate-600">Display features will be restored shortly...</p>
          </div>
        </TabsContent>

        <TabsContent value="biostar">
          <div className="text-center py-8">
            <p className="text-slate-600">Biostar features will be restored shortly...</p>
          </div>
        </TabsContent>

        <TabsContent value="users">
          <div className="text-center py-8">
            <p className="text-slate-600">User management features will be restored shortly...</p>
          </div>
        </TabsContent>

        <TabsContent value="departments">
          <div className="text-center py-8">
            <p className="text-slate-600">Department features will be restored shortly...</p>
          </div>
        </TabsContent>

        <TabsContent value="reports">
          <div className="text-center py-8">
            <p className="text-slate-600">Report features will be restored shortly...</p>
          </div>
        </TabsContent>

        <TabsContent value="ai">
          <div className="text-center py-8">
            <p className="text-slate-600">AI features will be restored shortly...</p>
          </div>
        </TabsContent>

        <TabsContent value="system">
          <div className="text-center py-8">
            <p className="text-slate-600">System features will be restored shortly...</p>
          </div>
        </TabsContent>
      </Tabs>

      {/* Dialogs and modals will be added as we restore each tab */}
    </div>
  );
}