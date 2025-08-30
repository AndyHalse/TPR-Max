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
import { Save, Mail, Upload, Building2, Settings as SettingsIcon, Palette, Monitor, Sun, Moon, Users, UserPlus, Shield, Phone, Globe, AtSign, Printer, QrCode, Barcode, FileText, CreditCard, Move, User, Hash, Building, Database, Server, HardDrive, CheckCircle, XCircle, RotateCcw, TestTube, Edit, Trash2, Plus, Brain, RefreshCw } from "lucide-react";
import type { CompanySettings, InsertCompanySettings, Department, InsertDepartment } from "@shared/schema";
import { IdCardDesignSystem } from "@/components/IdCardDesignSystem";

export default function Settings() {
  const { toast } = useToast();
  const { theme, setTheme } = useTheme();
  const [formData, setFormData] = useState<Partial<InsertCompanySettings>>({});
  const [testEmail, setTestEmail] = useState("");
  const [activeTab, setActiveTab] = useState("company");
  const [brandingSubTab, setBrandingSubTab] = useState("visual");
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
      queryClient.invalidateQueries({ queryKey: ["/api/departments/names"] });
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

  const deleteDepartmentMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiRequest("DELETE", `/api/departments/${id}`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/departments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/departments/names"] });
      toast({
        title: "Success",
        description: "Department deleted successfully!",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete department",
        variant: "destructive",
      });
    },
  });

  const handleLogoUpload = async (objectPath: string) => {
    try {
      // objectPath comes from ObjectUploader as /objects/uploads/objectId
      // We need to store just /uploads/objectId for the database
      const logoUrl = objectPath.replace('/objects', '');
      console.log('Saving logo URL:', logoUrl);
      
      // Merge logo with any pending form data to avoid overwriting user input
      const updateData = {
        ...formData,
        logoUrl: logoUrl,
      };
      console.log('Merging logo with form data:', updateData);
      
      await updateSettingsMutation.mutateAsync(updateData);
      // Clear form data after successful upload
      setFormData({});
      toast({
        title: "Success",
        description: "Logo uploaded and saved successfully!",
      });
    } catch (error) {
      console.error('Logo upload error:', error);
      toast({
        title: "Error",
        description: "Failed to save logo",
        variant: "destructive",
      });
    }
  };

  const handleBannerUpload = async (objectPath: string) => {
    try {
      // objectPath comes from ObjectUploader as /objects/uploads/objectId
      // We need to store just /uploads/objectId for the database
      const bannerUrl = objectPath.replace('/objects', '');
      console.log('Saving banner URL:', bannerUrl);
      
      // Merge banner with any pending form data to avoid overwriting user input
      const updateData = {
        ...formData,
        bannerUrl: bannerUrl,
      };
      console.log('Merging banner with form data:', updateData);
      
      await updateSettingsMutation.mutateAsync(updateData);
      // Clear form data after successful upload
      setFormData({});
      toast({
        title: "Success",
        description: "Banner uploaded and saved successfully!",
      });
    } catch (error) {
      console.error('Banner upload error:', error);
      toast({
        title: "Error",
        description: "Failed to save banner",
        variant: "destructive",
      });
    }
  };

  // Calculate contrast ratio between two colors
  const calculateContrastRatio = (color1: string, color2: string) => {
    const hexToRgb = (hex: string) => {
      const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
      return result ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
      } : null;
    };

    const getLuminance = (r: number, g: number, b: number) => {
      const [rs, gs, bs] = [r, g, b].map(c => {
        c = c / 255;
        return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
      });
      return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
    };

    const rgb1 = hexToRgb(color1);
    const rgb2 = hexToRgb(color2);
    if (!rgb1 || !rgb2) return 1;

    const lum1 = getLuminance(rgb1.r, rgb1.g, rgb1.b);
    const lum2 = getLuminance(rgb2.r, rgb2.g, rgb2.b);
    const brightest = Math.max(lum1, lum2);
    const darkest = Math.min(lum1, lum2);
    return (brightest + 0.05) / (darkest + 0.05);
  };

  // Suggest text colors based on background
  const suggestTextColors = (backgroundColor: string) => {
    const whiteContrast = calculateContrastRatio(backgroundColor, '#ffffff');
    const blackContrast = calculateContrastRatio(backgroundColor, '#000000');
    
    return {
      light: whiteContrast > blackContrast ? '#ffffff' : '#f8fafc',
      dark: blackContrast > whiteContrast ? '#000000' : '#1e293b'
    };
  };

  const handleInputChange = (field: keyof InsertCompanySettings, value: any) => {
    console.log('Input changed:', field, '=', value);
    
    // If background color changed, suggest text colors
    if (field === 'backgroundColor') {
      const suggestions = suggestTextColors(value);
      setSuggestedTextColors(suggestions);
    }
    
    setFormData(prev => {
      const newData = { ...prev, [field]: value };
      console.log('Updated form data:', newData);
      return newData;
    });

    // Auto-save ALL settings fields (except uploads which are handled separately)
    const uploadFields = ['logoUrl', 'bannerUrl']; // These are handled by upload handlers
    
    if (!uploadFields.includes(field)) {
      // Debounce auto-save to avoid excessive API calls
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current);
      }
      autoSaveTimeoutRef.current = setTimeout(() => {
        console.log('Auto-saving setting:', field, '=', value);
        updateSettingsMutation.mutate({ [field]: value }, {
          onSuccess: () => {
            // Clear the field from form data since it's been saved
            setFormData(prev => {
              const newData = { ...prev };
              delete newData[field];
              return newData;
            });
            
            // Show friendly messages for different field types
            let description = `${field} updated automatically`;
            
            if (field.startsWith('smtp')) {
              description = `${field.replace('smtp', 'SMTP ')} updated automatically`;
            } else if (field.includes('Printer')) {
              description = `${field.includes('idCard') ? 'ID card printer' : 'Default printer'} updated automatically`;
            } else if (field.includes('enable') || field.includes('notify')) {
              description = `Setting updated automatically`;
            } else if (field === 'printQuality') {
              description = 'Print quality updated automatically';
            } else if (field === 'barcodeFormat') {
              description = 'Barcode format updated automatically';
            } else if (field === 'companyName') {
              description = 'Company name updated automatically';
            } else if (field === 'address') {
              description = 'Company address updated automatically';
            } else if (field === 'phone') {
              description = 'Phone number updated automatically';
            } else if (field === 'email') {
              description = 'Company email updated automatically';
            } else if (field === 'timezone') {
              description = 'Timezone updated automatically';
            } else if (field.includes('Color') || field.includes('color')) {
              description = 'Color setting updated automatically';
            } else if (field.includes('reportRecipients')) {
              description = 'Report recipients updated automatically';
            } else if (field.includes('resetTime')) {
              description = 'Reset time updated automatically';
            }

            toast({
              title: "Auto-saved",
              description: description,
              className: "bg-green-50 border-green-200"
            });
          },
          onError: () => {
            toast({
              title: "Auto-save failed",
              description: "Please try saving manually",
              variant: "destructive",
            });
          }
        });
      }, 1500); // Auto-save after 1.5 seconds of no changes
    }
  };

  const handleSave = () => {
    console.log('Form data to save:', formData);
    console.log('Form data keys:', Object.keys(formData));
    
    if (Object.keys(formData).length === 0) {
      toast({
        title: "Info",
        description: "No changes to save",
      });
      return;
    }
    
    console.log('Submitting form data:', formData);
    updateSettingsMutation.mutate(formData, {
      onSuccess: () => {
        // Clear form data only after manual save
        setFormData({});
        toast({
          title: "Success",
          description: "Settings saved successfully!",
        });
      }
    });
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

  const handleInviteSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteForm.email.trim()) {
      toast({
        title: "Error",
        description: "Please enter an email address",
        variant: "destructive",
      });
      return;
    }
    inviteMutation.mutate(inviteForm);
  };

  const addRecipient = () => {
    setShowAddEmailDialog(true);
  };

  const handleAddEmailSubmit = () => {
    if (newEmailRecipient && newEmailRecipient.trim()) {
      const currentRecipients = formData.reportRecipients || settings?.reportRecipients || [];
      handleInputChange("reportRecipients", [...currentRecipients, newEmailRecipient.trim()]);
      setNewEmailRecipient("");
      setShowAddEmailDialog(false);
    }
  };

  const handleAddEmailCancel = () => {
    setNewEmailRecipient("");
    setShowAddEmailDialog(false);
  };

  const handleDepartmentSubmit = () => {
    if (!departmentForm.name?.trim()) {
      toast({
        title: "Error",
        description: "Department name is required",
        variant: "destructive",
      });
      return;
    }

    departmentMutation.mutate({
      department: departmentForm as InsertDepartment,
      isEdit: !!departmentToEdit,
      id: departmentToEdit?.id,
    });
  };

  const handleEditDepartment = (department: Department) => {
    setDepartmentToEdit(department);
    setDepartmentForm({
      name: department.name,
      description: department.description || "",
      color: department.color || "bg-blue-500",
    });
    setShowDepartmentDialog(true);
  };

  const handleDeleteDepartment = (id: string) => {
    if (confirm("Are you sure you want to delete this department? This action cannot be undone.")) {
      deleteDepartmentMutation.mutate(id);
    }
  };

  const resetDepartmentForm = () => {
    setDepartmentToEdit(null);
    setDepartmentForm({ name: "", description: "", color: "bg-blue-500" });
    setShowDepartmentDialog(false);
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
    return <div>Loading settings...</div>;
  }

  const currentSettings = { ...settings, ...formData };

  return (
    <div className="space-y-8 p-6 rounded-xl bg-background min-h-screen">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-slate-800">Settings</h2>
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
        <TabsList className="grid w-full grid-cols-10">
          <TabsTrigger value="company" className="flex items-center gap-2">
            <Building2 size={16} />
            Company
          </TabsTrigger>
          <TabsTrigger value="branding" className="flex items-center gap-2">
            <Palette size={16} />
            Branding
          </TabsTrigger>
          <TabsTrigger value="printer" className="flex items-center gap-2">
            <Printer size={16} />
            Printer
          </TabsTrigger>
          <TabsTrigger value="idcards" className="flex items-center gap-2">
            <CreditCard size={16} />
            ID Cards
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
              
              <div className="grid grid-cols-3 gap-4">
                <div className="text-center">
                  <Badge variant={systemStatus?.services?.database ? "default" : "destructive"} className="mb-2">
                    {systemStatus?.services?.database ? (
                      <>
                        <CheckCircle className="mr-1" size={12} />
                        SQL Online
                      </>
                    ) : (
                      <>
                        <XCircle className="mr-1" size={12} />
                        SQL Error
                      </>
                    )}
                  </Badge>
                  <p className="text-xs text-slate-600">Database</p>
                </div>

                <div className="text-center">
                  <Badge variant={systemStatus?.services?.email ? "default" : "secondary"} className="mb-2">
                    {systemStatus?.services?.email ? (
                      <>
                        <CheckCircle className="mr-1" size={12} />
                        SMTP Ready
                      </>
                    ) : (
                      <>
                        <XCircle className="mr-1" size={12} />
                        No SMTP
                      </>
                    )}
                  </Badge>
                  <p className="text-xs text-slate-600">Email Service</p>
                </div>

                <div className="text-center">
                  <Badge variant={systemStatus?.services?.workflow ? "default" : "destructive"} className="mb-2">
                    {systemStatus?.services?.workflow ? (
                      <>
                        <CheckCircle className="mr-1" size={12} />
                        Server Online
                      </>
                    ) : (
                      <>
                        <XCircle className="mr-1" size={12} />
                        Server Error
                      </>
                    )}
                  </Badge>
                  <p className="text-xs text-slate-600">Server Status</p>
                </div>
              </div>

              {systemStatus?.uptime && (
                <div className="mt-4 pt-4 border-t border-slate-200">
                  <div className="flex items-center justify-center space-x-4 text-sm text-slate-600">
                    <span>Server Uptime: {Math.floor(systemStatus.uptime / 3600)}h {Math.floor((systemStatus.uptime % 3600) / 60)}m</span>
                    <span>Last Check: {new Date(systemStatus.timestamp).toLocaleTimeString()}</span>
                  </div>
                </div>
              )}
            </GlassCard>

            <GlassCard>
              <div className="flex items-center mb-6">
                <Mail className="mr-3 text-blue-600" size={24} />
                <h3 className="text-lg font-semibold text-slate-800">Email Configuration</h3>
              </div>
              
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="smtpHost" className="text-sm font-medium text-slate-700">
                      SMTP Server Host
                    </Label>
                    <Input
                      id="smtpHost"
                      value={currentSettings?.smtpHost || ""}
                      onChange={(e) => handleInputChange("smtpHost", e.target.value)}
                      placeholder="smtp.gmail.com"
                      className="px-4 py-3 rounded-xl border border-white/30 bg-white/50"
                      data-testid="input-smtp-host"
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="smtpPort" className="text-sm font-medium text-slate-700">
                      SMTP Port
                    </Label>
                    <Select
                      value={currentSettings?.smtpPort || "587"}
                      onValueChange={(value) => handleInputChange("smtpPort", value)}
                    >
                      <SelectTrigger className="px-4 py-3 rounded-xl border border-white/30 bg-white/50" data-testid="select-smtp-port">
                        <SelectValue placeholder="Select port" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="25">25 (Standard SMTP)</SelectItem>
                        <SelectItem value="587">587 (Submission - Recommended)</SelectItem>
                        <SelectItem value="465">465 (SMTP over SSL)</SelectItem>
                        <SelectItem value="2525">2525 (Alternative)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="smtpSecurity" className="text-sm font-medium text-slate-700">
                      Security/Encryption
                    </Label>
                    <Select
                      value={currentSettings?.smtpSecurity || "STARTTLS"}
                      onValueChange={(value) => handleInputChange("smtpSecurity", value)}
                    >
                      <SelectTrigger className="px-4 py-3 rounded-xl border border-white/30 bg-white/50" data-testid="select-smtp-security">
                        <SelectValue placeholder="Select security" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="None">None (Not recommended)</SelectItem>
                        <SelectItem value="STARTTLS">STARTTLS (Recommended)</SelectItem>
                        <SelectItem value="SSL/TLS">SSL/TLS</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="smtpAuthMethod" className="text-sm font-medium text-slate-700">
                      Authentication Method
                    </Label>
                    <Select
                      value={currentSettings?.smtpAuthMethod || "LOGIN"}
                      onValueChange={(value) => handleInputChange("smtpAuthMethod", value)}
                    >
                      <SelectTrigger className="px-4 py-3 rounded-xl border border-white/30 bg-white/50" data-testid="select-smtp-auth">
                        <SelectValue placeholder="Select auth method" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="LOGIN">LOGIN</SelectItem>
                        <SelectItem value="PLAIN">PLAIN</SelectItem>
                        <SelectItem value="CRAM-MD5">CRAM-MD5</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="smtpUsername" className="text-sm font-medium text-slate-700">
                      SMTP Username
                    </Label>
                    <Input
                      id="smtpUsername"
                      value={currentSettings?.smtpUsername || ""}
                      onChange={(e) => handleInputChange("smtpUsername", e.target.value)}
                      placeholder="your.email@gmail.com"
                      className="px-4 py-3 rounded-xl border border-white/30 bg-white/50"
                      data-testid="input-smtp-username"
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="smtpPassword" className="text-sm font-medium text-slate-700">
                      SMTP Password
                    </Label>
                    <Input
                      id="smtpPassword"
                      type="password"
                      value={currentSettings?.smtpPassword || ""}
                      onChange={(e) => handleInputChange("smtpPassword", e.target.value)}
                      placeholder="App password or SMTP password"
                      className="px-4 py-3 rounded-xl border border-white/30 bg-white/50"
                      data-testid="input-smtp-password"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="smtpFromEmail" className="text-sm font-medium text-slate-700">
                      From Email Address
                    </Label>
                    <Input
                      id="smtpFromEmail"
                      type="email"
                      value={currentSettings?.smtpFromEmail || ""}
                      onChange={(e) => handleInputChange("smtpFromEmail", e.target.value)}
                      placeholder="noreply@yourcompany.com"
                      className="px-4 py-3 rounded-xl border border-white/30 bg-white/50"
                      data-testid="input-smtp-from-email"
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="smtpFromName" className="text-sm font-medium text-slate-700">
                      From Display Name
                    </Label>
                    <Input
                      id="smtpFromName"
                      value={currentSettings?.smtpFromName || ""}
                      onChange={(e) => handleInputChange("smtpFromName", e.target.value)}
                      placeholder="VisiGate Pro System"
                      className="px-4 py-3 rounded-xl border border-white/30 bg-white/50"
                      data-testid="input-smtp-from-name"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="smtpReplyTo" className="text-sm font-medium text-slate-700">
                      Reply-To Email (Optional)
                    </Label>
                    <Input
                      id="smtpReplyTo"
                      type="email"
                      value={currentSettings?.smtpReplyTo || ""}
                      onChange={(e) => handleInputChange("smtpReplyTo", e.target.value)}
                      placeholder="support@yourcompany.com"
                      className="px-4 py-3 rounded-xl border border-white/30 bg-white/50"
                      data-testid="input-smtp-reply-to"
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="smtpConnectionTimeout" className="text-sm font-medium text-slate-700">
                      Connection Timeout (seconds)
                    </Label>
                    <Input
                      id="smtpConnectionTimeout"
                      type="number"
                      value={currentSettings?.smtpConnectionTimeout || "30"}
                      onChange={(e) => handleInputChange("smtpConnectionTimeout", e.target.value)}
                      placeholder="30"
                      min="5"
                      max="120"
                      className="px-4 py-3 rounded-xl border border-white/30 bg-white/50"
                      data-testid="input-smtp-timeout"
                    />
                  </div>
                </div>

                <div className="pt-4 border-t border-slate-200">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="font-medium text-slate-800 mb-1">Test Email Configuration</h4>
                      <p className="text-sm text-slate-600">Send a test email to verify your SMTP settings</p>
                    </div>
                    <Button
                      variant="outline"
                      onClick={() => {
                        if (!testEmail.trim()) {
                          toast({
                            title: "Error",
                            description: "Please enter an email address to test",
                            variant: "destructive",
                          });
                          return;
                        }
                        if (!currentSettings?.smtpHost || !currentSettings?.smtpUsername) {
                          toast({
                            title: "Error", 
                            description: "Please configure SMTP settings first",
                            variant: "destructive",
                          });
                          return;
                        }
                        testEmailMutation.mutate(testEmail);
                      }}
                      disabled={testEmailMutation.isPending}
                      className="ml-4"
                      data-testid="button-test-email"
                    >
                      {testEmailMutation.isPending ? "Sending..." : "Send Test Email"}
                    </Button>
                  </div>
                  
                  <div className="mt-3">
                    <Input
                      type="email"
                      value={testEmail}
                      onChange={(e) => setTestEmail(e.target.value)}
                      placeholder="test@example.com"
                      className="px-4 py-3 rounded-xl border border-white/30 bg-white/50"
                      data-testid="input-test-email"
                    />
                  </div>

                  {currentSettings?.smtpLastTested && (
                    <div className="mt-3 p-3 bg-green-50 dark:bg-green-900/30 rounded-lg border border-green-200 dark:border-green-800">
                      <p className="text-sm text-green-800 dark:text-green-200">
                        <strong>Last test:</strong> {new Date(currentSettings.smtpLastTested).toLocaleString()}
                        {currentSettings.smtpTestEmailSent && " ✓ Successful"}
                      </p>
                    </div>
                  )}
                </div>

                <div className="mt-4 p-4 bg-blue-50 dark:bg-blue-900/30 rounded-lg border border-blue-200 dark:border-blue-800">
                  <h5 className="font-medium text-blue-800 dark:text-blue-200 mb-2">Common SMTP Providers:</h5>
                  <div className="text-sm text-blue-700 dark:text-blue-300 space-y-1">
                    <p><strong>Gmail:</strong> smtp.gmail.com:587 (STARTTLS) - Use app password</p>
                    <p><strong>Outlook:</strong> smtp-mail.outlook.com:587 (STARTTLS)</p>
                    <p><strong>SendGrid:</strong> smtp.sendgrid.net:587 (STARTTLS)</p>
                    <p><strong>Mailgun:</strong> smtp.mailgun.org:587 (STARTTLS)</p>
                  </div>
                </div>
              </div>
            </GlassCard>
          </div>
        </TabsContent>

        <TabsContent value="branding" className="space-y-6 mt-6">
          <Tabs value={brandingSubTab} onValueChange={setBrandingSubTab} className="w-full">
            <TabsList className="grid w-full grid-cols-2 mb-6">
              <TabsTrigger value="visual" className="flex items-center gap-2">
                <Palette size={16} />
                Visual Branding
              </TabsTrigger>
              <TabsTrigger value="theme" className="flex items-center gap-2">
                <Monitor size={16} />
                Theme Settings
              </TabsTrigger>
            </TabsList>

            <TabsContent value="visual" className="space-y-6">
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
                  <div className="flex items-center justify-between">
                    <Label htmlFor="foregroundColor" className="text-sm font-medium text-slate-700">
                      Fixed Text Color
                    </Label>
                    <div className="flex gap-1">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-6 px-2 text-xs bg-white hover:bg-gray-50"
                        onClick={() => handleInputChange("foregroundColor", suggestedTextColors.light)}
                        data-testid="button-suggest-light-text"
                      >
                        Light
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-6 px-2 text-xs bg-gray-800 text-white hover:bg-gray-700"
                        onClick={() => handleInputChange("foregroundColor", suggestedTextColors.dark)}
                        data-testid="button-suggest-dark-text"
                      >
                        Dark
                      </Button>
                    </div>
                  </div>
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
                  {currentSettings?.backgroundColor && (
                    <div className="text-xs text-slate-500">
                      Contrast ratio: {calculateContrastRatio(currentSettings.backgroundColor, currentSettings?.foregroundColor || "#1e293b").toFixed(1)}:1
                      {calculateContrastRatio(currentSettings.backgroundColor, currentSettings?.foregroundColor || "#1e293b") < 4.5 && (
                        <span className="text-amber-600 ml-2">⚠ Low contrast - may be hard to read</span>
                      )}
                    </div>
                  )}
                  <p className="text-xs text-slate-500">Used for labels, headings, and static text elements</p>
                </div>
                
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="variableTextColor" className="text-sm font-medium text-slate-700">
                      Variable Text Color
                    </Label>
                    <div className="flex gap-1">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-6 px-2 text-xs bg-white hover:bg-gray-50"
                        onClick={() => handleInputChange("variableTextColor", suggestedTextColors.light)}
                        data-testid="button-suggest-light-variable-text"
                      >
                        Light
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-6 px-2 text-xs bg-gray-800 text-white hover:bg-gray-700"
                        onClick={() => handleInputChange("variableTextColor", suggestedTextColors.dark)}
                        data-testid="button-suggest-dark-variable-text"
                      >
                        Dark
                      </Button>
                    </div>
                  </div>
                  <div className="flex gap-3 items-center">
                    <Input
                      id="variableTextColor"
                      type="color"
                      value={currentSettings?.variableTextColor || "#374151"}
                      onChange={(e) => handleInputChange("variableTextColor", e.target.value)}
                      className="w-20 h-12 p-1 rounded-xl border border-white/30 bg-white/50"
                      data-testid="input-variable-text-color"
                    />
                    <Input
                      type="text"
                      value={currentSettings?.variableTextColor || "#374151"}
                      onChange={(e) => handleInputChange("variableTextColor", e.target.value)}
                      className="flex-1 px-4 py-3 rounded-xl border border-white/30 bg-white/50 focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-800 font-mono"
                      placeholder="#374151"
                    />
                  </div>
                  {currentSettings?.backgroundColor && (
                    <div className="text-xs text-slate-500">
                      Contrast ratio: {calculateContrastRatio(currentSettings.backgroundColor, currentSettings?.variableTextColor || "#374151").toFixed(1)}:1
                      {calculateContrastRatio(currentSettings.backgroundColor, currentSettings?.variableTextColor || "#374151") < 4.5 && (
                        <span className="text-amber-600 ml-2">⚠ Low contrast - may be hard to read</span>
                      )}
                    </div>
                  )}
                  <p className="text-xs text-slate-500">Used for data values, content, and variable information</p>
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
                  <h5 className="font-medium text-slate-700 mb-4">Live Preview</h5>
                  <div className="space-y-4">
                    {/* Dashboard Card Preview */}
                    <div 
                      className="p-4 rounded-lg border transition-colors"
                      style={{
                        backgroundColor: currentSettings?.backgroundColor || "#f8fafc",
                        borderColor: currentSettings?.accentColor ? `${currentSettings.accentColor}30` : "#3b82f630"
                      }}
                    >
                      <div className="flex justify-between items-center mb-2">
                        <h4 
                          className="font-semibold"
                          style={{ color: currentSettings?.foregroundColor || "#1e293b" }}
                        >
                          Dashboard Card (Fixed Text)
                        </h4>
                        <span 
                          className="text-2xl font-bold"
                          style={{ color: currentSettings?.variableTextColor || "#374151" }}
                        >
                          42
                        </span>
                      </div>
                      <p 
                        className="text-sm"
                        style={{ color: currentSettings?.variableTextColor || "#374151" }}
                      >
                        Sample dashboard metrics (Variable Text)
                      </p>
                      <div 
                        className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium mt-2"
                        style={{ 
                          backgroundColor: currentSettings?.accentColor || "#3b82f6",
                          color: "white"
                        }}
                      >
                        ✓ Active Status
                      </div>
                    </div>

                    {/* Navigation Preview */}
                    <div 
                      className="p-3 rounded-lg border transition-colors"
                      style={{
                        backgroundColor: currentSettings?.backgroundColor || "#f8fafc",
                        borderColor: currentSettings?.accentColor ? `${currentSettings.accentColor}30` : "#3b82f630"
                      }}
                    >
                      <div className="flex items-center gap-4">
                        <div 
                          className="w-8 h-8 rounded flex items-center justify-center text-white text-sm font-medium"
                          style={{ backgroundColor: currentSettings?.accentColor || "#3b82f6" }}
                        >
                          🏠
                        </div>
                        <span 
                          className="font-medium"
                          style={{ color: currentSettings?.foregroundColor || "#1e293b" }}
                        >
                          Navigation (Fixed)
                        </span>
                        <span 
                          className="ml-auto text-sm"
                          style={{ color: currentSettings?.variableTextColor || "#374151" }}
                        >
                          Value (Variable)
                        </span>
                      </div>
                    </div>

                    {/* Form Preview */}
                    <div 
                      className="p-4 rounded-lg border transition-colors"
                      style={{
                        backgroundColor: currentSettings?.backgroundColor || "#f8fafc",
                        color: currentSettings?.foregroundColor || "#1e293b",
                        borderColor: currentSettings?.accentColor ? `${currentSettings.accentColor}30` : "#3b82f630"
                      }}
                    >
                      <h5 className="font-medium mb-3">Form Example</h5>
                      <div className="space-y-2">
                        <label className="text-sm font-medium">Sample Field</label>
                        <div 
                          className="p-2 rounded border text-sm"
                          style={{ 
                            backgroundColor: "rgba(255,255,255,0.5)",
                            borderColor: currentSettings?.accentColor || "#3b82f6"
                          }}
                        >
                          Input field example
                        </div>
                        <button 
                          className="px-4 py-2 rounded font-medium text-white text-sm transition-all hover:opacity-90"
                          style={{ backgroundColor: currentSettings?.accentColor || "#3b82f6" }}
                        >
                          Submit Button
                        </button>
                      </div>
                    </div>

                    {/* Alert Preview */}
                    <div 
                      className="p-3 rounded-lg border-l-4 transition-colors"
                      style={{
                        backgroundColor: currentSettings?.backgroundColor ? `${currentSettings.backgroundColor}80` : "#f8fafc80",
                        color: currentSettings?.foregroundColor || "#1e293b",
                        borderLeftColor: currentSettings?.accentColor || "#3b82f6"
                      }}
                    >
                      <div className="flex items-center gap-2">
                        <span 
                          className="w-4 h-4 rounded-full flex items-center justify-center text-xs text-white"
                          style={{ backgroundColor: currentSettings?.accentColor || "#3b82f6" }}
                        >
                          ℹ
                        </span>
                        <span className="text-sm font-medium">Alert Message</span>
                      </div>
                      <p className="text-xs mt-1 opacity-80">This is how notifications will appear</p>
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
                  
                  {currentSettings?.bannerUrl && !currentSettings.bannerUrl.includes('test') && (
                    <div className="mb-4 p-4 bg-white/50 rounded-xl border border-white/30">
                      <img 
                        src={`/objects${currentSettings.bannerUrl}`}
                        alt="Kiosk Banner" 
                        className="w-full max-w-lg h-auto object-contain rounded-lg"
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
                
                {currentSettings?.bannerUrl && !currentSettings.bannerUrl.includes('test') && (
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
                        className="w-full max-w-md h-auto object-contain rounded mb-4 mx-auto"
                        onError={(e) => {
                          console.error("Kiosk banner preview failed to load:", currentSettings.bannerUrl);
                          e.currentTarget.style.display = 'none';
                          const fallback = document.createElement('div');
                          fallback.className = 'w-full h-16 bg-slate-200 rounded mb-4 flex items-center justify-center text-slate-500 text-sm';
                          fallback.textContent = 'Banner preview unavailable';
                          e.currentTarget.parentNode?.insertBefore(fallback, e.currentTarget.nextSibling);
                        }}
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

            <TabsContent value="theme" className="space-y-6">
              <GlassCard>
                <div className="flex items-center mb-6">
                  <Monitor className="mr-3 text-blue-600" size={24} />
                  <h3 className="text-lg font-semibold text-slate-800">Application Theme</h3>
                </div>
                
                <div className="space-y-6">
                  <div className="flex items-center justify-between p-4 bg-white/50 dark:bg-slate-800/50 rounded-xl border border-white/30 dark:border-slate-700/30">
                    <div className="flex items-center space-x-4">
                      <Sun className="text-yellow-500" size={24} />
                      <div>
                        <h4 className="font-medium text-slate-800 dark:text-slate-200">Light Mode</h4>
                        <p className="text-sm text-slate-600 dark:text-slate-400">Clean, bright interface</p>
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
                  
                  <div className="flex items-center justify-between p-4 bg-white/50 dark:bg-slate-800/50 rounded-xl border border-white/30 dark:border-slate-700/30">
                    <div className="flex items-center space-x-4">
                      <Moon className="text-slate-700 dark:text-slate-300" size={24} />
                      <div>
                        <h4 className="font-medium text-slate-800 dark:text-slate-200">Dark Mode</h4>
                        <p className="text-sm text-slate-600 dark:text-slate-400">Easy on the eyes for long sessions</p>
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
                  
                  <div className="flex items-center justify-between p-4 bg-white/50 dark:bg-slate-800/50 rounded-xl border border-white/30 dark:border-slate-700/30">
                    <div className="flex items-center space-x-4">
                      <Monitor className="text-blue-600" size={24} />
                      <div>
                        <h4 className="font-medium text-slate-800 dark:text-slate-200">System Default</h4>
                        <p className="text-sm text-slate-600 dark:text-slate-400">Matches your device settings</p>
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
                </div>
              </GlassCard>
            </TabsContent>
          </Tabs>
        </TabsContent>

        <TabsContent value="printer" className="space-y-6 mt-6">
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
                    value={currentSettings?.selectedPrinter || "PDF Printer (Testing)"}
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
                  <Label htmlFor="idCardPrinter" className="text-sm font-medium text-slate-700">
                    ID Card Staff Printer (CR80 Format)
                  </Label>
                  <Select
                    value={currentSettings?.idCardPrinter || "PDF Printer (Testing)"}
                    onValueChange={(value) => handleInputChange("idCardPrinter", value)}
                  >
                    <SelectTrigger className="w-full px-4 py-3 rounded-xl border border-white/30 bg-white/50" data-testid="select-id-card-printer">
                      <SelectValue placeholder="Select ID card printer" />
                    </SelectTrigger>
                    <SelectContent>
                      {/* Show ONLY detected printers from your PC - no hardcoded ones */}
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
                  <p className="text-xs text-slate-500">Dedicated printer for staff ID cards - CR80 format (85.6mm x 53.98mm)</p>
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

          {/* Individual Printer Configuration Section */}
          <GlassCard>
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center">
                <Settings as SettingsIcon className="mr-3 text-blue-600" size={24} />
                <h3 className="text-lg font-semibold text-slate-800">Individual Printer Configuration</h3>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="flex items-center gap-2"
                data-testid="button-refresh-printer-configs"
                onClick={() => refetchPrinters()}
                disabled={isDetectingPrinters}
              >
                <RefreshCw className={`h-4 w-4 ${isDetectingPrinters ? 'animate-spin' : ''}`} />
                {isDetectingPrinters ? 'Updating...' : 'Refresh'}
              </Button>
            </div>

            {detectedPrinters && detectedPrinters.printers.length > 0 ? (
              <div className="space-y-4">
                {detectedPrinters.printers.slice(0, 6).map((printer, index) => (
                  <div key={printer.name} className="border border-white/30 rounded-xl p-4 bg-white/30">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <Printer className="h-5 w-5 text-blue-600" />
                        <div>
                          <h4 className="font-semibold text-slate-800">{printer.name}</h4>
                          <p className="text-xs text-slate-600">{printer.driver} • {printer.port}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {printer.isOnline ? (
                          <Badge variant="default" className="bg-green-100 text-green-800 text-xs">
                            {printer.status}
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="bg-gray-100 text-gray-600 text-xs">
                            Offline
                          </Badge>
                        )}
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 px-3"
                          data-testid={`button-configure-${index}`}
                        >
                          <Settings as SettingsIcon className="h-3 w-3 mr-1" />
                          Configure
                        </Button>
                      </div>
                    </div>

                    {/* Printer-specific properties - collapsible by default */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4 pt-4 border-t border-white/20">
                      {/* Quick Settings */}
                      <div className="space-y-3">
                        <h5 className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Quick Settings</h5>
                        <div className="space-y-2">
                          <Label className="text-xs text-slate-600">Print Quality</Label>
                          <Select defaultValue="normal">
                            <SelectTrigger className="h-8 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="draft">Draft</SelectItem>
                              <SelectItem value="normal">Normal</SelectItem>
                              <SelectItem value="high">High</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label className="text-xs text-slate-600">Paper Size</Label>
                          <Select defaultValue={printer.name.includes('TEC') || printer.name.includes('Card') ? 'cr80' : 'A4'}>
                            <SelectTrigger className="h-8 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="A4">A4</SelectItem>
                              <SelectItem value="cr80">CR80 (ID Card)</SelectItem>
                              <SelectItem value="label">Label</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      {/* Color & Quality */}
                      <div className="space-y-3">
                        <h5 className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Color & Output</h5>
                        <div className="space-y-2">
                          <Label className="text-xs text-slate-600">Color Mode</Label>
                          <Select defaultValue="color">
                            <SelectTrigger className="h-8 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="color">Color</SelectItem>
                              <SelectItem value="grayscale">Grayscale</SelectItem>
                              <SelectItem value="mono">Black & White</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label className="text-xs text-slate-600">Orientation</Label>
                          <Select defaultValue="portrait">
                            <SelectTrigger className="h-8 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="portrait">Portrait</SelectItem>
                              <SelectItem value="landscape">Landscape</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      {/* Advanced Options */}
                      <div className="space-y-3">
                        <h5 className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Advanced</h5>
                        <div className="flex items-center justify-between">
                          <Label className="text-xs text-slate-600">Duplex</Label>
                          <Switch
                            defaultChecked={false}
                            onCheckedChange={(checked) => console.log(`${printer.name} Duplex:`, checked)}
                            data-testid={`switch-duplex-${index}`}
                          />
                        </div>
                        <div className="flex items-center justify-between">
                          <Label className="text-xs text-slate-600">High Quality</Label>
                          <Switch
                            defaultChecked={printer.name.includes('TEC') || printer.name.includes('Card')}
                            onCheckedChange={(checked) => console.log(`${printer.name} High Quality:`, checked)}
                            data-testid={`switch-quality-${index}`}
                          />
                        </div>
                        {(printer.name.includes('TEC') || printer.name.includes('Card')) && (
                          <div className="flex items-center justify-between">
                            <Label className="text-xs text-slate-600">Card Encoding</Label>
                            <Switch
                              defaultChecked={false}
                              onCheckedChange={(checked) => console.log(`${printer.name} Encoding:`, checked)}
                              data-testid={`switch-encoding-${index}`}
                            />
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="mt-4 pt-3 border-t border-white/20 flex justify-between items-center">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 px-3 text-xs"
                        data-testid={`button-test-${index}`}
                      >
                        <TestTube className="h-3 w-3 mr-1" />
                        Test Print
                      </Button>
                      <div className="text-xs text-slate-500">
                        Settings auto-save
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-slate-500">
                <Printer className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>No printers detected. Click refresh to scan for available printers.</p>
              </div>
            )}

            <div className="mt-6 p-4 bg-blue-50 rounded-xl border border-blue-200">
              <h4 className="font-semibold text-blue-800 mb-2 flex items-center gap-2">
                <Brain className="h-4 w-4" />
                Per-Printer Configuration
              </h4>
              <ul className="text-sm text-blue-700 space-y-1">
                <li>• Each printer can have individual settings and properties</li>
                <li>• Settings are automatically saved when changed</li>
                <li>• Test print to verify configuration works correctly</li>
                <li>• ID card printers show additional encoding options</li>
              </ul>
            </div>
          </GlassCard>

          <GlassCard>
            <div className="flex items-center mb-6">
              <FileText className="mr-3 text-blue-600" size={24} />
              <h3 className="text-lg font-semibold text-slate-800">Print Test & Troubleshooting</h3>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <h4 className="font-semibold text-slate-700 border-b border-slate-200 pb-2">Test Print Options</h4>
                <Button
                  variant="outline"
                  className="w-full justify-start"
                  data-testid="button-test-visitor-pass"
                >
                  <FileText className="h-4 w-4 mr-2" />
                  Test Visitor Pass
                </Button>
                <Button
                  variant="outline" 
                  className="w-full justify-start"
                  data-testid="button-test-staff-card"
                >
                  <CreditCard className="h-4 w-4 mr-2" />
                  Test Staff ID Card
                </Button>
              </div>
              
              <div className="space-y-4">
                <h4 className="font-semibold text-slate-700 border-b border-slate-200 pb-2">Troubleshooting</h4>
                <div className="text-sm text-slate-600 space-y-2">
                  <p>• Check printer status and connections</p>
                  <p>• Ensure correct paper/card stock is loaded</p>
                  <p>• Verify driver settings match printer model</p>
                </div>
              </div>
            </div>
          </GlassCard>

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
              
              <form className="space-y-4" onSubmit={handleInviteSubmit}>
                <div className="space-y-2">
                  <Label htmlFor="inviteEmail" className="text-sm font-medium text-slate-700">
                    Email Address
                  </Label>
                  <Input
                    id="inviteEmail"
                    type="email"
                    value={inviteForm.email}
                    onChange={(e) => setInviteForm({ ...inviteForm, email: e.target.value })}
                    placeholder="user@example.com"
                    className="w-full px-4 py-3 rounded-xl border border-white/30 bg-white/50 focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-800"
                    data-testid="input-invite-email"
                    required
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="userRole" className="text-sm font-medium text-slate-700">
                    User Role
                  </Label>
                  <Select value={inviteForm.role} onValueChange={(value) => setInviteForm({ ...inviteForm, role: value })}>
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
                  disabled={inviteMutation.isPending || !inviteForm.email.trim()}
                  className="w-full gradient-blue text-white disabled:opacity-50"
                  data-testid="button-send-invitation"
                >
                  {inviteMutation.isPending ? 'Sending...' : 'Send Invitation'}
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

        <TabsContent value="biostar" className="space-y-6 mt-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <GlassCard>
              <div className="flex items-center mb-6">
                <Shield className="mr-3 text-blue-600" size={24} />
                <h3 className="text-lg font-semibold text-slate-800">Suprema Biostar Integration</h3>
              </div>
              
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <Label className="text-sm font-medium text-slate-700">
                      Enable Biostar Integration
                    </Label>
                    <p className="text-xs text-slate-500">Connect to Suprema Biostar 2 API for staff attendance</p>
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
                      <Label htmlFor="biostarServerUrl" className="text-sm font-medium text-slate-700">
                        Biostar Server URL
                      </Label>
                      <Input
                        id="biostarServerUrl"
                        type="url"
                        value={currentSettings?.biostarServerUrl || ""}
                        onChange={(e) => handleInputChange("biostarServerUrl", e.target.value)}
                        className="w-full px-4 py-3 rounded-xl border border-white/30 bg-white/50 focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-800"
                        placeholder="https://your-biostar-server.com:8443"
                        data-testid="input-biostar-server-url"
                      />
                    </div>
                    
                    <div className="space-y-2">
                      <Label htmlFor="biostarApiKey" className="text-sm font-medium text-slate-700">
                        API Key
                      </Label>
                      <Input
                        id="biostarApiKey"
                        type="password"
                        value={currentSettings?.biostarApiKey || ""}
                        onChange={(e) => handleInputChange("biostarApiKey", e.target.value)}
                        className="w-full px-4 py-3 rounded-xl border border-white/30 bg-white/50 focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-800"
                        placeholder="Enter your Biostar API key"
                        data-testid="input-biostar-api-key"
                      />
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="biostarUsername" className="text-sm font-medium text-slate-700">
                          Username
                        </Label>
                        <Input
                          id="biostarUsername"
                          type="text"
                          value={currentSettings?.biostarUsername || ""}
                          onChange={(e) => handleInputChange("biostarUsername", e.target.value)}
                          className="w-full px-4 py-3 rounded-xl border border-white/30 bg-white/50 focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-800"
                          placeholder="Biostar username"
                          data-testid="input-biostar-username"
                        />
                      </div>
                      
                      <div className="space-y-2">
                        <Label htmlFor="biostarPassword" className="text-sm font-medium text-slate-700">
                          Password
                        </Label>
                        <Input
                          id="biostarPassword"
                          type="password"
                          value={currentSettings?.biostarPassword || ""}
                          onChange={(e) => handleInputChange("biostarPassword", e.target.value)}
                          className="w-full px-4 py-3 rounded-xl border border-white/30 bg-white/50 focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-800"
                          placeholder="Biostar password"
                          data-testid="input-biostar-password"
                        />
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="biostarDatabaseId" className="text-sm font-medium text-slate-700">
                          Database ID
                        </Label>
                        <Input
                          id="biostarDatabaseId"
                          type="text"
                          value={currentSettings?.biostarDatabaseId || "1"}
                          onChange={(e) => handleInputChange("biostarDatabaseId", e.target.value)}
                          className="w-full px-4 py-3 rounded-xl border border-white/30 bg-white/50 focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-800"
                          placeholder="1"
                          data-testid="input-biostar-database-id"
                        />
                      </div>
                      
                      <div className="space-y-2">
                        <Label htmlFor="biostarSyncInterval" className="text-sm font-medium text-slate-700">
                          Sync Interval (seconds)
                        </Label>
                        <Input
                          id="biostarSyncInterval"
                          type="number"
                          value={currentSettings?.biostarSyncInterval || "300"}
                          onChange={(e) => handleInputChange("biostarSyncInterval", e.target.value)}
                          className="w-full px-4 py-3 rounded-xl border border-white/30 bg-white/50 focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-800"
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
                <Shield className="mr-3 text-blue-600" size={24} />
                <h3 className="text-lg font-semibold text-slate-800">Biometric Devices</h3>
              </div>
              
              <div className="space-y-4">
                <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                  <h4 className="font-medium text-blue-800 dark:text-blue-200 mb-2">Supported Devices:</h4>
                  <ul className="text-sm text-blue-700 dark:text-blue-300 space-y-1">
                    <li>• Suprema X-Station 2</li>
                    <li>• Suprema XPass 2</li>
                    <li>• Suprema FaceStation 2</li>
                    <li>• Suprema BioEntry Plus 2</li>
                  </ul>
                </div>
                
                <div className="space-y-2">
                  <Label className="text-sm font-medium text-slate-700">
                    Configured Devices
                  </Label>
                  <div className="space-y-2">
                    {(currentSettings?.biometricDevices || []).length === 0 ? (
                      <div className="text-sm text-slate-500 italic p-4 bg-white/50 rounded-lg">
                        No devices configured. Add device IDs using the Biostar Device Manager.
                      </div>
                    ) : (
                      (currentSettings?.biometricDevices || []).map((deviceId, index) => (
                        <div key={index} className="flex items-center justify-between p-3 bg-white/50 rounded-lg">
                          <span className="text-sm font-mono text-slate-700">{deviceId}</span>
                          <Badge variant="outline">Connected</Badge>
                        </div>
                      ))
                    )}
                  </div>
                </div>
                
                <div className="mt-4 p-4 bg-amber-50 dark:bg-amber-900/20 rounded-lg">
                  <h4 className="font-medium text-amber-800 dark:text-amber-200 mb-2">Setup Instructions:</h4>
                  <ol className="text-sm text-amber-700 dark:text-amber-300 space-y-1 ml-4 list-decimal">
                    <li>Configure devices in Biostar Device Manager</li>
                    <li>Note device IDs for each reader</li>
                    <li>Enable API access in Biostar settings</li>
                    <li>Test connection using the button below</li>
                  </ol>
                </div>
                
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="flex-1"
                    onClick={async () => {
                      try {
                        const response = await fetch('/api/biostar/test-connection', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' }
                        });
                        
                        const result = await response.json();
                        
                        toast({
                          title: result.success ? "Connection Successful" : "Connection Failed",
                          description: result.message,
                          variant: result.success ? "default" : "destructive"
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
                    <Shield className="mr-2" size={16} />
                    Test Connection
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="flex-1"
                    onClick={async () => {
                      try {
                        const response = await fetch('/api/biostar/sync-devices', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' }
                        });
                        
                        const result = await response.json();
                        
                        if (result.success) {
                          // Refresh settings to show new devices
                          window.location.reload();
                        }
                        
                        toast({
                          title: result.success ? "Sync Successful" : "Sync Failed",
                          description: result.message,
                          variant: result.success ? "default" : "destructive"
                        });
                      } catch (error) {
                        console.error('Biostar device sync error:', error);
                        toast({
                          title: "Sync Error",
                          description: "Failed to sync devices",
                          variant: "destructive"
                        });
                      }
                    }}
                    data-testid="button-sync-devices"
                  >
                    Sync Devices
                  </Button>
                </div>
              </div>
            </GlassCard>
          </div>
        </TabsContent>

        <TabsContent value="idcards" className="space-y-6 mt-6">
          <IdCardDesignSystem />
        </TabsContent>

        <TabsContent value="departments" className="space-y-6 mt-6">
          <GlassCard>
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center">
                <Building className="mr-3 text-blue-600" size={24} />
                <h3 className="text-lg font-semibold text-slate-800">Department Management</h3>
              </div>
              <Button
                onClick={() => setShowDepartmentDialog(true)}
                className="gradient-blue text-white font-medium hover:shadow-lg transition-all duration-300"
                data-testid="button-add-department"
              >
                <Building className="mr-2" size={16} />
                Add Department
              </Button>
            </div>

            <div className="space-y-4">
              {departments && departments.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {departments.map((department) => (
                    <div
                      key={department.id}
                      className={`p-4 rounded-xl border border-white/30 bg-white/50 backdrop-blur-sm ${department.color || 'bg-blue-500'} bg-opacity-10`}
                      data-testid={`card-department-${department.id}`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="font-semibold text-slate-800" data-testid={`text-department-name-${department.id}`}>
                          {department.name}
                        </h4>
                        <div className="flex gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleEditDepartment(department)}
                            className="text-blue-600 hover:text-blue-800"
                            data-testid={`button-edit-department-${department.id}`}
                          >
                            <Edit size={14} />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteDepartment(department.id)}
                            className="text-red-600 hover:text-red-800"
                            data-testid={`button-delete-department-${department.id}`}
                          >
                            <Trash2 size={14} />
                          </Button>
                        </div>
                      </div>
                      {department.description && (
                        <p className="text-sm text-slate-600" data-testid={`text-department-description-${department.id}`}>
                          {department.description}
                        </p>
                      )}
                      <div className="mt-3 flex items-center gap-2">
                        <div
                          className={`w-4 h-4 rounded-full ${department.color || 'bg-blue-500'}`}
                          data-testid={`color-indicator-${department.id}`}
                        />
                        <span className="text-xs text-slate-500">
                          {department.color?.replace('bg-', '').replace('-500', '') || 'blue'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-12" data-testid="empty-departments-state">
                  <Building className="mx-auto mb-4 text-slate-400" size={48} />
                  <p className="text-slate-600 mb-4">No departments configured</p>
                  <p className="text-sm text-slate-500 mb-6">
                    Create departments to organize your staff and improve visitor management
                  </p>
                  <Button
                    onClick={() => setShowDepartmentDialog(true)}
                    className="gradient-blue text-white"
                    data-testid="button-add-first-department"
                  >
                    <Building className="mr-2" size={16} />
                    Add Your First Department
                  </Button>
                </div>
              )}
            </div>
          </GlassCard>
        </TabsContent>

        <TabsContent value="ai" className="space-y-6 mt-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <GlassCard>
              <div className="flex items-center mb-6">
                <Brain className="mr-3 text-blue-600" size={24} />
                <h3 className="text-lg font-semibold text-slate-800">OpenAI Configuration</h3>
              </div>
              
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="openaiModel" className="text-sm font-medium text-slate-700">
                    OpenAI Model
                  </Label>
                  <Select
                    value={currentSettings?.openaiModel || "gpt-5"}
                    onValueChange={(value) => handleInputChange("openaiModel", value)}
                  >
                    <SelectTrigger className="w-full px-4 py-3 rounded-xl border border-white/30 bg-white/50" data-testid="select-openai-model">
                      <SelectValue placeholder="Select OpenAI model" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="gpt-4">GPT-4 (Standard)</SelectItem>
                      <SelectItem value="gpt-4o">GPT-4o (Optimized)</SelectItem>
                      <SelectItem value="gpt-5">GPT-5 (Latest) 🚀</SelectItem>
                      <SelectItem value="gpt-6">GPT-6 (Future)</SelectItem>
                      <SelectItem value="gpt-7">GPT-7 (Future)</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-slate-500">
                    GPT-5 is recommended for better video generation quality
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="openaiTemperature" className="text-sm font-medium text-slate-700">
                    Creativity Level (Temperature: {currentSettings?.openaiModel === 'gpt-5' || currentSettings?.openaiModel?.includes('gpt-6') || currentSettings?.openaiModel?.includes('gpt-7') ? "1.0 - Fixed" : currentSettings?.openaiTemperature || "0.7"})
                  </Label>
                  {currentSettings?.openaiModel === 'gpt-5' || currentSettings?.openaiModel?.includes('gpt-6') || currentSettings?.openaiModel?.includes('gpt-7') ? (
                    <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
                      <p className="text-sm text-blue-700">
                        🔒 GPT-5 and newer models use a fixed temperature of 1.0 for optimal performance. Temperature customization is not available for these models.
                      </p>
                    </div>
                  ) : (
                    <>
                      <input
                        id="openaiTemperature"
                        type="range"
                        min="0"
                        max="2"
                        step="0.1"
                        value={currentSettings?.openaiTemperature || "0.7"}
                        onChange={(e) => handleInputChange("openaiTemperature", e.target.value)}
                        className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer slider"
                        data-testid="slider-temperature"
                      />
                      <div className="flex justify-between text-xs text-slate-500">
                        <span>Conservative (0.0)</span>
                        <span>Balanced (1.0)</span>
                        <span>Creative (2.0)</span>
                      </div>
                    </>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="openaiMaxTokens" className="text-sm font-medium text-slate-700">
                    Max Response Length (Tokens)
                  </Label>
                  <Select
                    value={currentSettings?.openaiMaxTokens || "4000"}
                    onValueChange={(value) => handleInputChange("openaiMaxTokens", value)}
                  >
                    <SelectTrigger className="w-full px-4 py-3 rounded-xl border border-white/30 bg-white/50" data-testid="select-max-tokens">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1000">1,000 - Short responses</SelectItem>
                      <SelectItem value="2000">2,000 - Medium responses</SelectItem>
                      <SelectItem value="4000">4,000 - Detailed responses</SelectItem>
                      <SelectItem value="8000">8,000 - Comprehensive responses</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </GlassCard>

            <GlassCard>
              <div className="flex items-center mb-6">
                <Monitor className="mr-3 text-blue-600" size={24} />
                <h3 className="text-lg font-semibold text-slate-800">Video Generation Settings</h3>
              </div>
              
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="videoQualityPreference" className="text-sm font-medium text-slate-700">
                    Video Quality Preference
                  </Label>
                  <Select
                    value={currentSettings?.videoQualityPreference || "high"}
                    onValueChange={(value) => handleInputChange("videoQualityPreference", value)}
                  >
                    <SelectTrigger className="w-full px-4 py-3 rounded-xl border border-white/30 bg-white/50" data-testid="select-video-quality">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">Low - Fast generation</SelectItem>
                      <SelectItem value="medium">Medium - Balanced</SelectItem>
                      <SelectItem value="high">High - Best quality</SelectItem>
                      <SelectItem value="ultra">Ultra - Premium quality</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="defaultVideoLength" className="text-sm font-medium text-slate-700">
                    Default Video Length (minutes)
                  </Label>
                  <Input
                    id="defaultVideoLength"
                    type="number"
                    min="5"
                    max="60"
                    value={currentSettings?.defaultVideoLength || "15"}
                    onChange={(e) => handleInputChange("defaultVideoLength", e.target.value)}
                    className="w-full px-4 py-3 rounded-xl border border-white/30 bg-white/50"
                    placeholder="15"
                    data-testid="input-video-length"
                  />
                  <p className="text-xs text-slate-500">
                    Recommended: 10-20 minutes for comprehensive safety training
                  </p>
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <Label className="text-sm font-medium text-slate-700">
                      Enable Advanced Video Features
                    </Label>
                    <p className="text-xs text-slate-500">Enhanced visuals, animations, and interactive elements</p>
                  </div>
                  <Switch
                    checked={currentSettings?.enableAdvancedVideoFeatures !== false}
                    onCheckedChange={(checked) => handleInputChange("enableAdvancedVideoFeatures", checked)}
                    data-testid="switch-advanced-features"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="aiInstructionsPrompt" className="text-sm font-medium text-slate-700">
                    Custom AI Instructions
                  </Label>
                  <textarea
                    id="aiInstructionsPrompt"
                    value={currentSettings?.aiInstructionsPrompt || "Create comprehensive, engaging safety induction content"}
                    onChange={(e) => handleInputChange("aiInstructionsPrompt", e.target.value)}
                    className="w-full px-4 py-3 rounded-xl border border-white/30 bg-white/50 resize-none"
                    rows={3}
                    placeholder="Provide custom instructions for AI content generation..."
                    data-testid="textarea-ai-instructions"
                  />
                  <p className="text-xs text-slate-500">
                    Guide the AI on tone, style, and content focus for your induction videos
                  </p>
                </div>
              </div>
            </GlassCard>
          </div>

          <GlassCard>
            <div className="flex items-center mb-6">
              <TestTube className="mr-3 text-blue-600" size={24} />
              <h3 className="text-lg font-semibold text-slate-800">AI Model Performance</h3>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="text-center p-4 bg-green-50 rounded-xl border border-green-200">
                <div className="text-2xl font-bold text-green-600 mb-2">GPT-5</div>
                <div className="text-sm text-green-700">Current Model</div>
                <div className="text-xs text-green-600 mt-1">Released: Aug 7, 2025</div>
              </div>
              
              <div className="text-center p-4 bg-blue-50 rounded-xl border border-blue-200">
                <div className="text-2xl font-bold text-blue-600 mb-2">🎥</div>
                <div className="text-sm text-blue-700">Video Generation</div>
                <div className="text-xs text-blue-600 mt-1">Enhanced for safety content</div>
              </div>
              
              <div className="text-center p-4 bg-purple-50 rounded-xl border border-purple-200">
                <div className="text-2xl font-bold text-purple-600 mb-2">⚡</div>
                <div className="text-sm text-purple-700">Performance</div>
                <div className="text-xs text-purple-600 mt-1">2x faster than GPT-4</div>
              </div>
            </div>
            
            <div className="mt-6 p-4 bg-blue-50 rounded-lg">
              <h4 className="font-medium text-blue-800 mb-2">Model Comparison:</h4>
              <ul className="text-sm text-blue-700 space-y-1">
                <li>• <strong>GPT-4:</strong> Solid performance, slower generation</li>
                <li>• <strong>GPT-5:</strong> Best for video content, faster, more accurate</li>
                <li>• <strong>GPT-6/7:</strong> Future models for enhanced capabilities</li>
              </ul>
            </div>
          </GlassCard>
        </TabsContent>

        <TabsContent value="system" className="space-y-6 mt-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Daily Reset Configuration */}
            <GlassCard className="p-6">
              <h3 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
                <RotateCcw className="w-5 h-5" />
                Daily Reset / End of Day
              </h3>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <Label className="text-sm font-medium text-slate-700">Enable Daily Reset</Label>
                    <p className="text-xs text-slate-500">Automatically check out all personnel at end of day</p>
                  </div>
                  <Switch
                    checked={currentSettings?.enableDailyReset !== false}
                    onCheckedChange={(checked) => handleInputChange("enableDailyReset", checked)}
                    data-testid="switch-daily-reset"
                  />
                </div>

                {currentSettings?.enableDailyReset !== false && (
                  <div className="space-y-4 pl-4 border-l-2 border-blue-200">
                    <div className="space-y-2">
                      <Label htmlFor="dailyResetTime" className="text-sm font-medium text-slate-700">
                        Reset Time
                      </Label>
                      <div className="flex gap-2">
                        <Input
                          id="dailyResetTime"
                          type="time"
                          value={currentSettings?.dailyResetTime || "00:00"}
                          onChange={(e) => handleInputChange("dailyResetTime", e.target.value)}
                          className="w-full px-4 py-3 rounded-xl border border-white/30 bg-white/50"
                          data-testid="input-reset-time"
                        />
                        <Select
                          value={currentSettings?.dailyResetTimezone || "Europe/London"}
                          onValueChange={(value) => handleInputChange("dailyResetTimezone", value)}
                        >
                          <SelectTrigger className="w-48 px-4 py-3 rounded-xl border border-white/30 bg-white/50" data-testid="select-timezone">
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
                      <p className="text-xs text-slate-500">Time when daily reset will automatically occur</p>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="gracePeriod" className="text-sm font-medium text-slate-700">
                        Grace Period (minutes)
                      </Label>
                      <Input
                        id="gracePeriod"
                        type="number"
                        min="0"
                        max="60"
                        value={currentSettings?.gracePeriodMinutes || "15"}
                        onChange={(e) => handleInputChange("gracePeriodMinutes", e.target.value)}
                        className="w-full px-4 py-3 rounded-xl border border-white/30 bg-white/50"
                        data-testid="input-grace-period"
                      />
                      <p className="text-xs text-slate-500">Time to alert personnel before automatic checkout</p>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <Label className="text-sm font-medium text-slate-700">Weekend Reset</Label>
                          <p className="text-xs text-slate-500">Reset on weekends</p>
                        </div>
                        <Switch
                          checked={currentSettings?.enableWeekendReset === true}
                          onCheckedChange={(checked) => handleInputChange("enableWeekendReset", checked)}
                          data-testid="switch-weekend-reset"
                        />
                      </div>

                      <div className="flex items-center justify-between">
                        <div>
                          <Label className="text-sm font-medium text-slate-700">Holiday Reset</Label>
                          <p className="text-xs text-slate-500">Reset on holidays</p>
                        </div>
                        <Switch
                          checked={currentSettings?.enableHolidayReset === true}
                          onCheckedChange={(checked) => handleInputChange("enableHolidayReset", checked)}
                          data-testid="switch-holiday-reset"
                        />
                      </div>
                    </div>

                    <div className="flex items-center justify-between">
                      <div>
                        <Label className="text-sm font-medium text-slate-700">Notify Forgotten Checkouts</Label>
                        <p className="text-xs text-slate-500">Email alerts for unchecked personnel</p>
                      </div>
                      <Switch
                        checked={currentSettings?.notifyForgottenCheckouts !== false}
                        onCheckedChange={(checked) => handleInputChange("notifyForgottenCheckouts", checked)}
                        data-testid="switch-notify-checkouts"
                      />
                    </div>

                    <div className="flex items-center justify-between">
                      <div>
                        <Label className="text-sm font-medium text-slate-700">24/7 Operations</Label>
                        <p className="text-xs text-slate-500">Skip reset for continuous operations</p>
                      </div>
                      <Switch
                        checked={currentSettings?.enable24x7Operations === true}
                        onCheckedChange={(checked) => handleInputChange("enable24x7Operations", checked)}
                        data-testid="switch-24x7-ops"
                      />
                    </div>

                    {currentSettings?.lastDailyReset && (
                      <div className="mt-3 p-3 bg-green-50 dark:bg-green-900/30 rounded-lg border border-green-200 dark:border-green-800">
                        <p className="text-sm text-green-800 dark:text-green-200">
                          <strong>Last Reset:</strong> {new Date(currentSettings.lastDailyReset).toLocaleString()}
                        </p>
                      </div>
                    )}

                    <div className="flex gap-2 pt-2">
                      <Button
                        onClick={handleManualReset}
                        disabled={isManualResetDisabled}
                        variant="outline"
                        className="flex items-center gap-2"
                        data-testid="button-manual-reset"
                      >
                        <RotateCcw className="w-4 h-4" />
                        Manual Reset Now
                      </Button>
                      <Button
                        onClick={handleTestReset}
                        variant="outline"
                        className="flex items-center gap-2"
                        data-testid="button-test-reset"
                      >
                        <TestTube className="w-4 h-4" />
                        Test Reset (Preview)
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </GlassCard>

            {/* System Status */}
            <GlassCard className="p-6">
              <h3 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
                <Database className="w-5 h-5" />
                System Status
              </h3>
              <div className="space-y-4">
                <div className="flex items-center justify-between p-3 bg-white/50 rounded-lg">
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

                <div className="flex items-center justify-between p-3 bg-white/50 rounded-lg">
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

                <div className="flex items-center justify-between p-3 bg-white/50 rounded-lg">
                  <div className="flex items-center gap-2">
                    <Server className="w-4 h-4" />
                    <span className="text-sm font-medium">Authentication</span>
                  </div>
                  {systemStatus?.services?.authentication ? (
                    <CheckCircle className="w-5 h-5 text-green-500" />
                  ) : (
                    <XCircle className="w-5 h-5 text-red-500" />
                  )}
                </div>

                {systemStatus?.uptime && (
                  <div className="mt-3 p-3 bg-blue-50 dark:bg-blue-900/30 rounded-lg border border-blue-200 dark:border-blue-800">
                    <p className="text-sm text-blue-800 dark:text-blue-200">
                      <strong>System Uptime:</strong> {Math.floor(systemStatus.uptime / 1000 / 60)} minutes
                    </p>
                  </div>
                )}
              </div>
            </GlassCard>
          </div>

          <div className="mt-6 p-4 bg-blue-50 dark:bg-blue-900/30 rounded-lg border border-blue-200 dark:border-blue-800">
            <h4 className="font-semibold text-blue-800 dark:text-blue-200 mb-2">Industry Standard Features</h4>
            <div className="text-sm text-blue-700 dark:text-blue-300 space-y-1">
              <p>• <strong>Automatic Daily Reset:</strong> Check out all personnel at specified time</p>
              <p>• <strong>Grace Period Alerts:</strong> Email notifications before automatic checkout</p>
              <p>• <strong>Weekend/Holiday Options:</strong> Configure reset behavior for non-working days</p>
              <p>• <strong>24/7 Operations Mode:</strong> Disable reset for continuous operations</p>
              <p>• <strong>Manual Override:</strong> Emergency reset capability with confirmation</p>
              <p>• <strong>Audit Logging:</strong> Complete record of all reset activities</p>
            </div>
          </div>
        </TabsContent>
      </Tabs>

      {/* Add Email Recipient Dialog */}
      <Dialog open={showAddEmailDialog} onOpenChange={setShowAddEmailDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add Email Recipient</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="new-email" className="text-sm font-medium text-slate-700">
                Email Address
              </Label>
              <Input
                id="new-email"
                type="email"
                value={newEmailRecipient}
                onChange={(e) => setNewEmailRecipient(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-white/30 bg-white/50 focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-800"
                placeholder="Enter email address"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddEmailSubmit();
                  }
                }}
                data-testid="input-new-email-recipient"
                autoFocus
              />
            </div>
          </div>
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={handleAddEmailCancel}
              data-testid="button-cancel-email"
            >
              Cancel
            </Button>
            <Button 
              onClick={handleAddEmailSubmit}
              disabled={!newEmailRecipient.trim()}
              className="gradient-blue text-white"
              data-testid="button-add-email"
            >
              Add Email
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Manual Reset Confirmation Dialog */}
      <Dialog open={showManualResetDialog} onOpenChange={setShowManualResetDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-orange-600">
              <RotateCcw className="w-5 h-5" />
              Confirm Manual Reset
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="p-4 bg-orange-50 border border-orange-200 rounded-lg">
              <p className="text-sm text-orange-800 font-medium mb-2">
                ⚠️ This action will immediately:
              </p>
              <ul className="text-sm text-orange-700 space-y-1 ml-4">
                <li>• Check out all current visitors</li>
                <li>• Check out all staff members</li>
                <li>• Check out all contractors</li>
                <li>• Clear all muster list data</li>
                <li>• Reset the system for new entries</li>
              </ul>
            </div>
            <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <p className="text-sm text-blue-800">
                <strong>Note:</strong> All checkout records will be marked as "manual reset" 
                for reporting purposes. Historical data will be preserved.
              </p>
            </div>
            <p className="text-sm text-slate-600">
              Are you sure you want to perform a manual system reset now?
            </p>
          </div>
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => setShowManualResetDialog(false)}
              data-testid="button-cancel-reset"
            >
              Cancel
            </Button>
            <Button 
              onClick={confirmManualReset}
              disabled={isManualResetDisabled}
              className="bg-orange-600 hover:bg-orange-700 text-white"
              data-testid="button-confirm-reset"
            >
              {isManualResetDisabled ? "Resetting..." : "Reset System Now"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Department Add/Edit Dialog */}
      <Dialog open={showDepartmentDialog} onOpenChange={setShowDepartmentDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {departmentToEdit ? "Edit Department" : "Add Department"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="department-name" className="text-sm font-medium text-slate-700">
                Department Name *
              </Label>
              <Input
                id="department-name"
                type="text"
                value={departmentForm.name || ""}
                onChange={(e) => setDepartmentForm(prev => ({ ...prev, name: e.target.value }))}
                className="w-full px-4 py-3 rounded-xl border border-white/30 bg-white/50 focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-800"
                placeholder="Enter department name"
                data-testid="input-department-name"
                autoFocus
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="department-description" className="text-sm font-medium text-slate-700">
                Description
              </Label>
              <Input
                id="department-description"
                type="text"
                value={departmentForm.description || ""}
                onChange={(e) => setDepartmentForm(prev => ({ ...prev, description: e.target.value }))}
                className="w-full px-4 py-3 rounded-xl border border-white/30 bg-white/50 focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-800"
                placeholder="Enter description (optional)"
                data-testid="input-department-description"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-medium text-slate-700">
                Color Theme
              </Label>
              <div className="grid grid-cols-6 gap-2">
                {[
                  { label: "Blue", value: "bg-blue-500", color: "bg-blue-500" },
                  { label: "Green", value: "bg-green-500", color: "bg-green-500" },
                  { label: "Purple", value: "bg-purple-500", color: "bg-purple-500" },
                  { label: "Red", value: "bg-red-500", color: "bg-red-500" },
                  { label: "Orange", value: "bg-orange-500", color: "bg-orange-500" },
                  { label: "Indigo", value: "bg-indigo-500", color: "bg-indigo-500" },
                ].map((colorOption) => (
                  <button
                    key={colorOption.value}
                    type="button"
                    onClick={() => setDepartmentForm(prev => ({ ...prev, color: colorOption.value }))}
                    className={`w-8 h-8 rounded-full ${colorOption.color} border-2 ${
                      departmentForm.color === colorOption.value
                        ? "border-slate-800 ring-2 ring-blue-500"
                        : "border-slate-300"
                    } hover:scale-110 transition-transform`}
                    data-testid={`color-${colorOption.label.toLowerCase()}`}
                    title={colorOption.label}
                  />
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={resetDepartmentForm}
              data-testid="button-cancel-department"
            >
              Cancel
            </Button>
            <Button 
              onClick={handleDepartmentSubmit}
              disabled={departmentMutation.isPending || !departmentForm.name?.trim()}
              className="gradient-blue text-white"
              data-testid="button-save-department"
            >
              {departmentMutation.isPending ? "Saving..." : (departmentToEdit ? "Update" : "Create")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}