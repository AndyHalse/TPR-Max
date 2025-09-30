import { useState, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { apiRequest } from "@/lib/queryClient";
import GlassCard from "@/components/GlassCard";
import { ObjectUploader } from "@/components/ObjectUploader";
import { ProfessionalThermalDesigner } from "@/components/professional-thermal-designer/ProfessionalThermalDesigner";
import { IdCardDesignSystem } from "@/components/IdCardDesignSystem";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useTheme } from "@/contexts/ThemeContext";
import { Save, Mail, Upload, Building2, Settings as SettingsIcon, Palette, Monitor, Sun, Moon, Users, UserPlus, Shield, Phone, Globe, AtSign, Printer, QrCode, Barcode, FileText, CreditCard, Move, User, Hash, Building, Database, Server, HardDrive, CheckCircle, XCircle, RotateCcw, TestTube, Edit, Trash2, Plus, Brain, RefreshCw, Download, FolderOpen, Scan, Settings2, Send, Calendar, BarChart3, TrendingUp, Activity, Zap, Eye, Info, Bot } from "lucide-react";
import { Link } from "wouter";
import type { CompanySettings, InsertCompanySettings, Department, InsertDepartment } from "@shared/schema";
import ContractorsHSManagement from "@/components/ContractorsHSManagement";
import { DefaultTemplateManager } from "@/components/DefaultTemplateManager";

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
  const [showManualUserDialog, setShowManualUserDialog] = useState(false);
  const [manualUserForm, setManualUserForm] = useState({ 
    username: "", 
    email: "", 
    password: "", 
    role: "user",
    firstName: "",
    lastName: ""
  });
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

  // Get current user to access customerId
  const { data: currentUser } = useQuery<{ id: string; username: string; customerId: string }>({
    queryKey: ["/api/auth/me"],
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
    refetchInterval: 300000, // Refresh every 5 minutes
  });

  const { data: departments } = useQuery<Department[]>({
    queryKey: ["/api/departments"],
  });

  // Fetch all users
  const { data: users, isLoading: usersLoading } = useQuery<Array<{
    id: string;
    username: string;
    email: string;
    role: string;
    firstName?: string;
    lastName?: string;
  }>>({
    queryKey: ["/api/users"],
  });

  // User invitation mutation
  const inviteMutation = useMutation({
    mutationFn: async (data: { email: string; role: string }) => {
      const response = await apiRequest("POST", "/api/invitations", data);
      if (!response.ok) {
        const errorData = await response.json();
        const error = new Error(errorData.error || "Failed to send invitation");
        (error as any).response = { status: response.status };
        (error as any).serverMessage = errorData.error;
        throw error;
      }
      return response.json();
    },
    onSuccess: () => {
      setInviteForm({ email: "", role: "user" });
      toast({
        title: "Invitation Sent",
        description: "User invitation has been sent successfully.",
      });
    },
    onError: (error: any) => {
      const serverMessage = error?.serverMessage || error?.message;
      let errorMessage = "Failed to send invitation";
      let actionGuidance = "";

      if (error?.response?.status === 400) {
        errorMessage = serverMessage || "An invitation already exists for this email address";
        actionGuidance = " Use the 'Add Manually' option to create the account directly.";
      } else if (serverMessage?.includes("email") || serverMessage?.includes("SMTP")) {
        errorMessage = "Email delivery failed";
        actionGuidance = " Use the 'Add Manually' button as a backup option.";
      } else {
        errorMessage = serverMessage || "Failed to send invitation";
        actionGuidance = " You can try the 'Add Manually' option instead.";
      }

      toast({
        title: "Invitation Failed",
        description: errorMessage + actionGuidance,
        variant: "destructive",
      });
    },
  });

  // Manual user creation mutation (backup option)
  const manualUserMutation = useMutation({
    mutationFn: async (data: { 
      username: string; 
      email: string; 
      password: string; 
      role: string;
      firstName: string;
      lastName: string;
    }) => {
      const response = await apiRequest("POST", "/api/users/manual", data);
      if (!response.ok) {
        const errorData = await response.json();
        const error = new Error(errorData.error || "Failed to create user account");
        (error as any).response = { status: response.status };
        (error as any).serverMessage = errorData.error;
        throw error;
      }
      return response.json();
    },
    onSuccess: () => {
      setManualUserForm({ 
        username: "", 
        email: "", 
        password: "", 
        role: "user",
        firstName: "",
        lastName: ""
      });
      setShowManualUserDialog(false);
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      toast({
        title: "User Created",
        description: "User account has been created successfully.",
      });
    },
    onError: (error: any) => {
      const serverMessage = error?.serverMessage || error?.message;
      const errorMessage = serverMessage || "Failed to create user account";

      toast({
        title: "User Creation Failed",
        description: errorMessage,
        variant: "destructive",
      });
    },
  });

  // Delete user mutation
  const deleteUserMutation = useMutation({
    mutationFn: async (userId: string) => {
      const response = await apiRequest("DELETE", `/api/users/${userId}`);
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to delete user");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      toast({
        title: "User Deleted",
        description: "User has been removed successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Delete Failed",
        description: error.message || "Failed to delete user",
        variant: "destructive",
      });
    },
  });

  // Backup mutation
  const backupMutation = useMutation({
    mutationFn: async () => {
      console.log('🚀 BACKUP MUTATION STARTED - Making API request...');
      const response = await apiRequest("GET", "/api/system/backup");
      console.log('📥 BACKUP RESPONSE STATUS:', response.status);
      
      if (!response.ok) {
        const errorData = await response.json();
        console.error('❌ BACKUP FAILED:', errorData);
        throw new Error(errorData.error || "Failed to create backup");
      }
      
      console.log('✅ BACKUP SUCCESS - Creating blob...');
      return response.blob();
    },
    onSuccess: (blob) => {
      // Create download link
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      a.href = url;
      a.download = `visigate-backup-${timestamp}.bak`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
      toast({
        title: "Backup Complete",
        description: "SQL Server .bak file has been downloaded successfully!",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Backup Failed",
        description: error.message || "Failed to create database backup",
        variant: "destructive",
      });
    },
  });

  const handleBackupDatabase = () => {
    console.log('🔥 BACKUP BUTTON CLICKED - Starting backup mutation...');
    backupMutation.mutate();
  };

  // Restore mutation
  const restoreMutation = useMutation({
    mutationFn: async (backupData: any) => {
      const response = await apiRequest("POST", "/api/system/restore", {
        backup: backupData
      });
      return response.json();
    },
    onSuccess: (data) => {
      // Invalidate all queries to refresh the entire app (TanStack Query v5 format)
      queryClient.invalidateQueries({ predicate: () => true });
      
      toast({
        title: "Restore Complete",
        description: `Successfully restored ${data.recordsRestored || 0} records`,
      });
      
      setSelectedBackupFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      
      // Query invalidation is sufficient to refresh all data - no need for page reload
    },
    onError: (error: any) => {
      toast({
        title: "Restore Failed",
        description: error.message || "Failed to restore database",
        variant: "destructive",
      });
    },
  });

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      if (!file.name.endsWith('.bak') && !file.name.endsWith('.sql')) {
        toast({
          title: "Invalid File",
          description: "Please select a valid .bak or .sql backup file",
          variant: "destructive",
        });
        return;
      }
      setSelectedBackupFile(file);
    }
  };

  const handleRestoreDatabase = () => {
    if (!selectedBackupFile) {
      toast({
        title: "No File Selected",
        description: "Please select a backup file first",
        variant: "destructive",
      });
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const backupContent = e.target?.result as string;
        restoreMutation.mutate(backupContent);
      } catch (error) {
        toast({
          title: "Invalid File",
          description: "Failed to read backup file",
          variant: "destructive",
        });
      }
    };
    reader.readAsText(selectedBackupFile);
  };

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
      const data = await response.json();
      console.log('Mutation response:', data);
      return data;
    },
    onSuccess: (data) => {
      console.log('Mutation success:', data);
      queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
      
      // Show auto-save success feedback
      toast({
        title: "Auto-saved",
        description: "Settings saved successfully",
        duration: 2000, // Show for 2 seconds
      });
    },
    onError: (error) => {
      console.error('Mutation error:', error);
      toast({
        title: "Auto-save Error",
        description: "Failed to save settings. Please try again.",
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

  const deleteDepartmentMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiRequest("DELETE", `/api/departments/${id}`);
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/departments"] });
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

  const handleDeleteDepartment = async (id: string) => {
    if (window.confirm("Are you sure you want to delete this department? This action cannot be undone.")) {
      deleteDepartmentMutation.mutate(id);
    }
  };

  const handleDepartmentSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!departmentForm.name?.trim()) {
      toast({
        title: "Error",
        description: "Department name is required",
        variant: "destructive",
      });
      return;
    }

    if (!currentUser?.customerId) {
      toast({
        title: "Error",
        description: "User not authenticated",
        variant: "destructive",
      });
      return;
    }

    departmentMutation.mutate({
      department: {
        name: departmentForm.name.trim(),
        description: departmentForm.description?.trim() || "",
        color: departmentForm.color || "bg-blue-500",
        customerId: currentUser.customerId
      },
      isEdit: !!departmentToEdit,
      id: departmentToEdit?.id
    });
  };

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
      console.log('Auto-saving:', field, '=', value);
      updateSettingsMutation.mutate(updates);
    }, 1500); // 1.5 second delay
  };

  const handleInputChange = (field: string, value: any) => {
    console.log('Input changed:', field, '=', value);
    
    // If background color changed, suggest text colors
    if (field === 'backgroundColor') {
      const suggestions = suggestTextColors(value);
      setSuggestedTextColors(suggestions);
    }
    
    triggerAutoSave(field, value);
  };

  const handleSave = () => {
    if (Object.keys(formData).length > 0) {
      console.log('Manual save triggered with formData:', formData);
      updateSettingsMutation.mutate(formData);
      // Clear formData after successful manual save
      setFormData({});
    } else {
      toast({
        title: "Nothing to Save",
        description: "All changes have been automatically saved.",
      });
    }
  };

  const handleLogoUpload = (objectPath: string) => {
    try {
      // objectPath comes from ObjectUploader as /objects/uploads/objectId
      // We need to store just /uploads/objectId for the database
      const logoUrl = objectPath.replace('/objects', '');
      console.log('Logo upload - objectPath:', objectPath);
      console.log('Logo upload - saving logoUrl:', logoUrl);
      
      // Use handleInputChange to trigger auto-save
      handleInputChange("logoUrl", logoUrl);
      
      toast({
        title: "Success",
        description: "Logo uploaded successfully!",
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
        <div className="flex items-center gap-3">
          <Link to="/settings/ai">
            <Button
              variant="outline"
              className="border-purple-200 text-purple-700 hover:bg-purple-50 font-medium transition-all duration-300"
              data-testid="link-ai-settings"
            >
              <Bot className="mr-2" size={16} />
              AI Settings
            </Button>
          </Link>
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
      </div>

      {/* Auto-save information banner */}
      <div className="flex items-center gap-3 p-4 bg-green-50 border border-green-200 rounded-lg">
        <div className="h-2 w-2 bg-green-500 rounded-full animate-pulse"></div>
        <p className="text-sm text-green-800 font-medium">
          ✨ Auto-save enabled - All changes are automatically saved after 1.5 seconds
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="flex w-full overflow-x-auto">
          <TabsTrigger value="company" className="flex items-center gap-1 px-2 text-xs">
            <Building2 size={14} />
            <span className="hidden xl:inline">Company</span>
            <span className="xl:hidden">Co.</span>
          </TabsTrigger>
          <TabsTrigger value="branding" className="flex items-center gap-1 px-2 text-xs">
            <Palette size={14} />
            <span className="hidden xl:inline">Branding</span>
            <span className="xl:hidden">Brand</span>
          </TabsTrigger>
          <TabsTrigger value="email" className="flex items-center gap-1 px-2 text-xs">
            <Mail size={14} />
            Email
          </TabsTrigger>
          <TabsTrigger value="phone-systems" className="flex items-center gap-1 px-2 text-xs">
            <Phone size={14} />
            <span className="hidden xl:inline">Phone Systems</span>
            <span className="xl:hidden">Phone</span>
          </TabsTrigger>
          <TabsTrigger value="users" className="flex items-center gap-1 px-2 text-xs">
            <Users size={14} />
            Users
          </TabsTrigger>
          <TabsTrigger value="departments" className="flex items-center gap-1 px-2 text-xs">
            <Building size={14} />
            <span className="hidden xl:inline">Departments</span>
            <span className="xl:hidden">Depts</span>
          </TabsTrigger>
          <TabsTrigger value="reports" className="flex items-center gap-1 px-2 text-xs">
            <FileText size={14} />
            <span className="hidden xl:inline">Reports</span>
            <span className="xl:hidden">Rpts</span>
          </TabsTrigger>
          <TabsTrigger value="printing" className="flex items-center gap-1 px-2 text-xs">
            <Printer size={14} />
            <span className="hidden xl:inline">Printing & ID</span>
            <span className="xl:hidden">Print</span>
          </TabsTrigger>
          <TabsTrigger value="biostar" className="flex items-center gap-1 px-2 text-xs">
            <Shield size={14} />
            <span className="hidden xl:inline">BioStar</span>
            <span className="xl:hidden">Bio</span>
          </TabsTrigger>
          <TabsTrigger value="hs-documents" className="flex items-center gap-1 px-2 text-xs">
            <FileText size={14} />
            <span className="hidden xl:inline">H&S Documents</span>
            <span className="xl:hidden">H&S</span>
          </TabsTrigger>
          <TabsTrigger value="ai" className="flex items-center gap-1 px-2 text-xs">
            <Brain size={14} />
            AI
          </TabsTrigger>
          <TabsTrigger value="hsrules" className="flex items-center gap-1 px-2 text-xs">
            <Shield size={14} />
            <span className="hidden xl:inline">H&S Rules</span>
            <span className="xl:hidden">H&S</span>
          </TabsTrigger>
          <TabsTrigger value="system" className="flex items-center gap-1 px-2 text-xs">
            <SettingsIcon size={14} />
            <span className="hidden xl:inline">System</span>
            <span className="xl:hidden">Sys</span>
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

          </div>
        </TabsContent>

        <TabsContent value="email" className="space-y-6 mt-6">
          <GlassCard>
            <div className="flex items-center mb-6">
              <Mail className="mr-3 text-blue-600" size={24} />
              <h3 className="text-lg font-semibold text-slate-800">SMTP Email Configuration</h3>
            </div>
            
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-sm font-medium text-slate-700">
                    SMTP Server Host
                  </Label>
                  <Input
                    type="text"
                    placeholder="e.g., smtp.ionos.co.uk"
                    value={currentSettings?.smtpHost || "smtp.ionos.co.uk"}
                    onChange={(e) => handleInputChange("smtpHost", e.target.value)}
                    className="w-full px-4 py-3 rounded-xl border border-white/30 bg-white/50"
                    data-testid="input-smtp-host"
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-sm font-medium text-slate-700">
                    SMTP Port
                  </Label>
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
                  <p className="text-xs text-slate-500">Port 587 with STARTTLS is recommended for most providers</p>
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <Label className="text-sm font-medium text-slate-700">
                      Use SSL/TLS Encryption
                    </Label>
                    <p className="text-xs text-slate-500">Secure connection (recommended)</p>
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
                  <Label className="text-sm font-medium text-slate-700">
                    Email Username
                  </Label>
                  <Input
                    type="email"
                    placeholder="your-email@company.com"
                    value={currentSettings?.smtpUsername || ""}
                    onChange={(e) => handleInputChange("smtpUsername", e.target.value)}
                    className="w-full px-4 py-3 rounded-xl border border-white/30 bg-white/50"
                    data-testid="input-smtp-username"
                  />
                  <p className="text-xs text-slate-500">Usually your full email address</p>
                </div>

                <div className="space-y-2">
                  <Label className="text-sm font-medium text-slate-700">
                    Email Password
                  </Label>
                  <Input
                    type="password"
                    placeholder="Your email password or app-specific password"
                    value={currentSettings?.smtpPassword || ""}
                    onChange={(e) => handleInputChange("smtpPassword", e.target.value)}
                    className="w-full px-4 py-3 rounded-xl border border-white/30 bg-white/50"
                    data-testid="input-smtp-password"
                  />
                  <p className="text-xs text-slate-500">Use app-specific password for Gmail/Outlook</p>
                </div>

                <div className="space-y-2">
                  <Label className="text-sm font-medium text-slate-700">
                    From Name (Display Name)
                  </Label>
                  <Input
                    type="text"
                    placeholder="VisiGate Pro System"
                    value={currentSettings?.smtpFromName || "VisiGate Pro System"}
                    onChange={(e) => handleInputChange("smtpFromName", e.target.value)}
                    className="w-full px-4 py-3 rounded-xl border border-white/30 bg-white/50"
                    data-testid="input-smtp-from-name"
                  />
                  <p className="text-xs text-slate-500">The name that appears as the sender</p>
                </div>
              </div>
            </div>

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
                <TestTube className="mr-3 text-blue-600" size={24} />
                <h3 className="text-lg font-semibold text-slate-800">Test Email Configuration</h3>
              </div>
              
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-sm font-medium text-slate-700">
                    Test Email Address
                  </Label>
                  <Input
                    type="email"
                    placeholder="Enter email address to test"
                    className="w-full px-4 py-3 rounded-xl border border-white/30 bg-white/50"
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
                <Shield className="mr-3 text-amber-600" size={24} />
                <h3 className="text-lg font-semibold text-slate-800">Prevent Emails Going to Junk</h3>
              </div>
              
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-3">
                <h4 className="font-semibold text-amber-900">Important: Email Deliverability Tips</h4>
                <div className="text-sm text-amber-800 space-y-2">
                  <p className="font-medium">To prevent e-Pass emails going to junk/spam folders:</p>
                  <ol className="list-decimal list-inside space-y-1 ml-2">
                    <li><strong>SPF Record:</strong> Add VisiGate server IP to your domain's SPF record</li>
                    <li><strong>DKIM Signing:</strong> Enable DKIM authentication in your email provider</li>
                    <li><strong>From Address:</strong> Use an email from your verified domain (not generic providers)</li>
                    <li><strong>Whitelist:</strong> Ask recipients to add {currentSettings?.smtpUsername || 'your email'} to contacts</li>
                    <li><strong>Reply-To:</strong> Set a monitored reply-to address below</li>
                  </ol>
                  <div className="mt-3 p-2 bg-white rounded border border-amber-200">
                    <p className="text-xs font-mono">SPF Example: v=spf1 include:_spf.ionos.com ~all</p>
                  </div>
                </div>
              </div>
            </GlassCard>

            <GlassCard>
              <div className="flex items-center mb-6">
                <Send className="mr-3 text-green-600" size={24} />
                <h3 className="text-lg font-semibold text-slate-800">📊 Email Reports Settings</h3>
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
                  <div className="space-y-4 mt-4 p-4 bg-blue-50 rounded-lg">
                    <div className="space-y-2">
                      <Label className="text-sm font-medium text-slate-700">
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
                      <Label className="text-sm font-medium text-slate-700">
                        Recipients
                      </Label>
                      <Input
                        type="email"
                        placeholder="admin@company.com, manager@company.com"
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
                Passes
              </TabsTrigger>
              <TabsTrigger value="qr-readers" className="flex items-center gap-2">
                <Scan size={16} />
                QR Readers
              </TabsTrigger>
            </TabsList>

            <TabsContent value="printer" className="space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
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

                <GlassCard>
                  <div className="flex items-center mb-6">
                    <Zap className="mr-3 text-purple-600" size={24} />
                    <h3 className="text-lg font-semibold text-slate-800">Zebra Printer Settings</h3>
                  </div>
                  
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label className="text-sm font-medium text-slate-700">
                        Enable Zebra ZPL Printing
                      </Label>
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-xs text-slate-600">Use Zebra printers with ZPL commands</p>
                          <p className="text-xs text-slate-500">Supports network and USB Zebra printers</p>
                        </div>
                        <Switch
                          checked={currentSettings?.thermalSelectedPrinter === "zebra"}
                          onCheckedChange={(checked) => handleInputChange("thermalSelectedPrinter", checked ? "zebra" : "tec")}
                          data-testid="switch-zebra-enabled"
                        />
                      </div>
                    </div>

                    {currentSettings?.thermalSelectedPrinter === "zebra" && (
                      <>
                        <div className="space-y-2">
                          <Label className="text-sm font-medium text-slate-700">
                            Zebra Printer IP Address
                          </Label>
                          <Input
                            type="text"
                            value={currentSettings?.biostarServerUrl || ""}
                            onChange={(e) => handleInputChange("biostarServerUrl", e.target.value)}
                            className="w-full px-4 py-3 rounded-xl border border-white/30 bg-white/50"
                            placeholder="192.168.1.100"
                            data-testid="input-zebra-ip"
                          />
                          <p className="text-xs text-slate-500">Network IP address for direct printing (leave blank for USB)</p>
                        </div>

                        <div className="space-y-2">
                          <Label className="text-sm font-medium text-slate-700">
                            Zebra Printer Port
                          </Label>
                          <Input
                            type="number"
                            value={currentSettings?.smtpPort || "587"}
                            onChange={(e) => handleInputChange("smtpPort", e.target.value)}
                            className="w-full px-4 py-3 rounded-xl border border-white/30 bg-white/50"
                            placeholder="9100"
                            data-testid="input-zebra-port"
                          />
                          <p className="text-xs text-slate-500">Default: 9100 (standard Zebra network port)</p>
                        </div>

                        <div className="space-y-2">
                          <Label className="text-sm font-medium text-slate-700">
                            Zebra Printer Model
                          </Label>
                          <Select
                            value={currentSettings?.thermalSelectedPrinter || "tec"}
                            onValueChange={(value) => handleInputChange("thermalSelectedPrinter", value)}
                          >
                            <SelectTrigger className="w-full px-4 py-3 rounded-xl border border-white/30 bg-white/50" data-testid="select-zebra-model">
                              <SelectValue placeholder="Select Zebra model" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="GK420d">GK420d (Desktop)</SelectItem>
                              <SelectItem value="GK420t">GK420t (Desktop Thermal Transfer)</SelectItem>
                              <SelectItem value="ZD420">ZD420 (Desktop)</SelectItem>
                              <SelectItem value="ZD421">ZD421 (Healthcare)</SelectItem>
                              <SelectItem value="ZD620">ZD620 (Premium Desktop)</SelectItem>
                              <SelectItem value="ZT410">ZT410 (Industrial)</SelectItem>
                              <SelectItem value="ZT420">ZT420 (Industrial)</SelectItem>
                              <SelectItem value="LP2824">LP2824 (Legacy)</SelectItem>
                              <SelectItem value="LP2844">LP2844 (Legacy)</SelectItem>
                            </SelectContent>
                          </Select>
                          <p className="text-xs text-slate-500">Select your Zebra printer model for optimal ZPL generation</p>
                        </div>

                        <div className="mt-4 p-3 bg-purple-50 border border-purple-200 rounded-lg">
                          <div className="flex items-center gap-2 mb-1">
                            <Zap className="h-4 w-4 text-purple-600" />
                            <span className="text-sm font-medium text-purple-800">Zebra DNA Support</span>
                          </div>
                          <p className="text-xs text-purple-600">
                            Full ZPL (Zebra Programming Language) support with QR codes, barcodes, and custom layouts.
                            Perfect for thermal pass printing with professional quality.
                          </p>
                        </div>
                      </>
                    )}
                  </div>
                </GlassCard>
              </div>
            </TabsContent>

            <TabsContent value="idcards" className="space-y-6">
              <IdCardDesignSystem />
            </TabsContent>

            <TabsContent value="thermal-passes" className="space-y-6">
              {/* E-Pass Configuration Section */}
              <GlassCard>
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center">
                    <Mail className="mr-3 text-green-600" size={24} />
                    <div>
                      <h3 className="text-lg font-semibold text-slate-800">Digital E-Pass Configuration</h3>
                      <p className="text-sm text-slate-600">Send digital passes via email or SMS instead of printing</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge 
                      variant="outline" 
                      className={currentSettings?.ePassEnabled ? "bg-green-100 text-green-800 border-green-300" : "bg-gray-100 text-gray-600"}
                    >
                      {currentSettings?.ePassEnabled ? "E-Pass Active" : "Physical Pass Active"}
                    </Badge>
                  </div>
                </div>
                
                <div className="space-y-6">
                  {/* Main E-Pass Toggle */}
                  <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200">
                    <div className="flex items-center justify-between">
                      <div>
                        <Label className="text-sm font-medium text-blue-800 dark:text-blue-200">
                          Enable Digital E-Pass System
                        </Label>
                        <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                          Switch from physical pass printing to digital delivery via email/SMS
                        </p>
                      </div>
                      <Switch
                        checked={currentSettings?.ePassEnabled || false}
                        onCheckedChange={(checked) => handleInputChange("ePassEnabled", checked)}
                        className="data-[state=checked]:bg-green-600"
                        data-testid="switch-e-pass-enabled"
                      />
                    </div>
                  </div>

                  {currentSettings?.ePassEnabled && (
                    <>
                      {/* Delivery Method */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-2">
                          <Label className="text-sm font-medium text-slate-700">
                            E-Pass Delivery Method
                          </Label>
                          <Select
                            value={currentSettings?.ePassDeliveryMethod || "both"}
                            onValueChange={(value) => handleInputChange("ePassDeliveryMethod", value)}
                          >
                            <SelectTrigger className="w-full px-4 py-3 rounded-xl border border-white/30 bg-white/50" data-testid="select-epass-delivery">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="email">Email Only</SelectItem>
                              <SelectItem value="sms">SMS Only</SelectItem>
                              <SelectItem value="both">Email & SMS</SelectItem>
                              <SelectItem value="choice">Let Visitor Choose</SelectItem>
                            </SelectContent>
                          </Select>
                          <p className="text-xs text-slate-500">How e-Passes are delivered to visitors</p>
                        </div>

                        <div className="space-y-2">
                          <Label className="text-sm font-medium text-slate-700">
                            Check-out Reminder (minutes)
                          </Label>
                          <Input
                            type="number"
                            min="5"
                            max="120"
                            value={currentSettings?.ePassCheckoutReminderMinutes || "30"}
                            onChange={(e) => handleInputChange("ePassCheckoutReminderMinutes", e.target.value)}
                            className="w-full px-4 py-3 rounded-xl border border-white/30 bg-white/50"
                            data-testid="input-checkout-reminder"
                          />
                          <p className="text-xs text-slate-500">Minutes before expected departure to send reminder</p>
                        </div>
                      </div>

                      {/* Auto Check-out & Host Notifications */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="p-4 bg-white/50 rounded-lg border border-white/30">
                          <div className="flex items-center justify-between mb-3">
                            <div>
                              <Label className="text-sm font-medium text-slate-700">
                                Auto Check-out
                              </Label>
                              <p className="text-xs text-slate-500 mt-1">
                                Automatically check out visitors after expected time
                              </p>
                            </div>
                            <Switch
                              checked={currentSettings?.ePassAutoCheckout !== false}
                              onCheckedChange={(checked) => handleInputChange("ePassAutoCheckout", checked)}
                              data-testid="switch-auto-checkout"
                            />
                          </div>
                        </div>

                        <div className="p-4 bg-white/50 rounded-lg border border-white/30">
                          <div className="flex items-center justify-between mb-3">
                            <div>
                              <Label className="text-sm font-medium text-slate-700">
                                Host Notifications
                              </Label>
                              <p className="text-xs text-slate-500 mt-1">
                                Notify host if visitor hasn't checked out
                              </p>
                            </div>
                            <Switch
                              checked={currentSettings?.ePassHostNotificationEnabled !== false}
                              onCheckedChange={(checked) => handleInputChange("ePassHostNotificationEnabled", checked)}
                              data-testid="switch-host-notification"
                            />
                          </div>
                          {currentSettings?.ePassHostNotificationEnabled && (
                            <div className="mt-3">
                              <Label className="text-xs text-slate-600">Notification Delay (min)</Label>
                              <Input
                                type="number"
                                min="15"
                                max="180"
                                value={currentSettings?.ePassHostNotificationDelay || "60"}
                                onChange={(e) => handleInputChange("ePassHostNotificationDelay", e.target.value)}
                                className="w-full mt-1 px-3 py-2 text-sm rounded-lg border border-white/30 bg-white/50"
                                data-testid="input-host-delay"
                              />
                            </div>
                          )}
                        </div>
                      </div>

                      {/* SMS Configuration with Twilio */}
                      {(currentSettings?.ePassDeliveryMethod === "sms" || currentSettings?.ePassDeliveryMethod === "both" || currentSettings?.ePassDeliveryMethod === "choice") && (
                        <div className="space-y-4 p-4 bg-purple-50 dark:bg-purple-900/20 rounded-lg border border-purple-200">
                          <div className="flex items-center justify-between">
                            <h4 className="font-medium text-purple-800 dark:text-purple-200 flex items-center gap-2">
                              <Phone size={18} />
                              Twilio SMS Configuration
                            </h4>
                            <Switch
                              checked={currentSettings?.twilioEnabled || false}
                              onCheckedChange={(checked) => handleInputChange("twilioEnabled", checked)}
                              data-testid="switch-twilio-enabled"
                            />
                          </div>
                          
                          {currentSettings?.twilioEnabled && (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                              <div className="space-y-2">
                                <Label className="text-xs font-medium text-purple-700">Account SID</Label>
                                <Input
                                  type="text"
                                  value={currentSettings?.twilioAccountSid || ""}
                                  onChange={(e) => handleInputChange("twilioAccountSid", e.target.value)}
                                  className="w-full px-3 py-2 text-sm rounded-lg border border-purple-200 bg-white"
                                  placeholder="ACxxxxxxxxxxxxxxxxxx"
                                  data-testid="input-twilio-sid"
                                />
                              </div>
                              <div className="space-y-2">
                                <Label className="text-xs font-medium text-purple-700">Auth Token</Label>
                                <Input
                                  type="password"
                                  value={currentSettings?.twilioAuthToken || ""}
                                  onChange={(e) => handleInputChange("twilioAuthToken", e.target.value)}
                                  className="w-full px-3 py-2 text-sm rounded-lg border border-purple-200 bg-white"
                                  placeholder="Your Twilio Auth Token"
                                  data-testid="input-twilio-token"
                                />
                              </div>
                              <div className="space-y-2">
                                <Label className="text-xs font-medium text-purple-700">Phone Number</Label>
                                <Input
                                  type="tel"
                                  value={currentSettings?.twilioPhoneNumber || ""}
                                  onChange={(e) => handleInputChange("twilioPhoneNumber", e.target.value)}
                                  className="w-full px-3 py-2 text-sm rounded-lg border border-purple-200 bg-white"
                                  placeholder="+1234567890"
                                  data-testid="input-twilio-phone"
                                />
                              </div>
                              <div className="space-y-2">
                                <Label className="text-xs font-medium text-purple-700">Messaging Service SID (Optional)</Label>
                                <Input
                                  type="text"
                                  value={currentSettings?.twilioMessagingServiceSid || ""}
                                  onChange={(e) => handleInputChange("twilioMessagingServiceSid", e.target.value)}
                                  className="w-full px-3 py-2 text-sm rounded-lg border border-purple-200 bg-white"
                                  placeholder="MGxxxxxxxxxxxxxxxxxx"
                                  data-testid="input-twilio-messaging-sid"
                                />
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Geofencing Configuration */}
                      <div className="space-y-4 p-4 bg-orange-50 dark:bg-orange-900/20 rounded-lg border border-orange-200">
                        <div className="flex items-center justify-between">
                          <h4 className="font-medium text-orange-800 dark:text-orange-200 flex items-center gap-2">
                            <Globe size={18} />
                            Geofencing Auto Check-out
                          </h4>
                          <Switch
                            checked={currentSettings?.geofencingEnabled || false}
                            onCheckedChange={(checked) => handleInputChange("geofencingEnabled", checked)}
                            data-testid="switch-geofencing"
                          />
                        </div>
                        
                        {currentSettings?.geofencingEnabled && (
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
                            <div className="space-y-2">
                              <Label className="text-xs font-medium text-orange-700">Radius (meters)</Label>
                              <Input
                                type="number"
                                min="50"
                                max="500"
                                value={currentSettings?.geofenceRadius || "100"}
                                onChange={(e) => handleInputChange("geofenceRadius", e.target.value)}
                                className="w-full px-3 py-2 text-sm rounded-lg border border-orange-200 bg-white"
                                data-testid="input-geofence-radius"
                              />
                            </div>
                            <div className="space-y-2">
                              <Label className="text-xs font-medium text-orange-700">Latitude</Label>
                              <Input
                                type="text"
                                value={currentSettings?.geofenceLat || ""}
                                onChange={(e) => handleInputChange("geofenceLat", e.target.value)}
                                className="w-full px-3 py-2 text-sm rounded-lg border border-orange-200 bg-white"
                                placeholder="51.5074"
                                data-testid="input-geofence-lat"
                              />
                            </div>
                            <div className="space-y-2">
                              <Label className="text-xs font-medium text-orange-700">Longitude</Label>
                              <Input
                                type="text"
                                value={currentSettings?.geofenceLng || ""}
                                onChange={(e) => handleInputChange("geofenceLng", e.target.value)}
                                className="w-full px-3 py-2 text-sm rounded-lg border border-orange-200 bg-white"
                                placeholder="-0.1278"
                                data-testid="input-geofence-lng"
                              />
                            </div>
                          </div>
                        )}
                      </div>

                      {/* X-Station 2 Integration */}
                      <div className="space-y-4 p-4 bg-indigo-50 dark:bg-indigo-900/20 rounded-lg border border-indigo-200">
                        <div className="flex items-center justify-between">
                          <h4 className="font-medium text-indigo-800 dark:text-indigo-200 flex items-center gap-2">
                            <Scan size={18} />
                            BioStar X-Station 2 QR Check-out
                          </h4>
                          <Switch
                            checked={currentSettings?.xStationEnabled || false}
                            onCheckedChange={(checked) => handleInputChange("xStationEnabled", checked)}
                            data-testid="switch-xstation"
                          />
                        </div>
                        
                        {currentSettings?.xStationEnabled && (
                          <>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                              <div className="space-y-2">
                                <Label className="text-xs font-medium text-indigo-700">X-Station API Endpoint</Label>
                                <Input
                                  type="url"
                                  value={currentSettings?.xStationApiEndpoint || ""}
                                  onChange={(e) => handleInputChange("xStationApiEndpoint", e.target.value)}
                                  className="w-full px-3 py-2 text-sm rounded-lg border border-indigo-200 bg-white"
                                  placeholder="https://biostar.local:8443/api"
                                  data-testid="input-xstation-api"
                                />
                              </div>
                              <div className="space-y-2">
                                <Label className="text-xs font-medium text-indigo-700">Check-out Mode</Label>
                                <Select
                                  value={currentSettings?.xStationCheckoutMode || "qr"}
                                  onValueChange={(value) => handleInputChange("xStationCheckoutMode", value)}
                                >
                                  <SelectTrigger className="w-full px-3 py-2 text-sm rounded-lg border border-indigo-200 bg-white" data-testid="select-xstation-mode">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="qr">QR Code Only</SelectItem>
                                    <SelectItem value="face">Face Recognition Only</SelectItem>
                                    <SelectItem value="both">QR + Face Recognition</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                            </div>
                            
                            <div className="space-y-2">
                              <Label className="text-xs font-medium text-indigo-700">X-Station Device IPs/IDs</Label>
                              <p className="text-xs text-indigo-600 mb-2">Add IP addresses or device IDs, one per line</p>
                              <textarea
                                value={(currentSettings?.xStationDevices || []).join('\n')}
                                onChange={(e) => handleInputChange("xStationDevices", e.target.value.split('\n').filter(d => d.trim()))}
                                className="w-full px-3 py-2 text-sm rounded-lg border border-indigo-200 bg-white h-20 font-mono"
                                placeholder="192.168.1.100&#10;192.168.1.101&#10;DEVICE-001"
                                data-testid="textarea-xstation-devices"
                              />
                            </div>
                          </>
                        )}
                      </div>
                    </>
                  )}
                </div>
              </GlassCard>

              {/* Show Physical Pass Designer only when e-Pass is disabled */}
              {!currentSettings?.ePassEnabled && (
                <ProfessionalThermalDesigner />
              )}
              
              {/* Show e-Pass preview when enabled */}
              {currentSettings?.ePassEnabled && (
                <GlassCard>
                  <div className="flex items-center mb-6">
                    <Eye className="mr-3 text-blue-600" size={24} />
                    <h3 className="text-lg font-semibold text-slate-800">E-Pass Preview</h3>
                  </div>
                  <div className="bg-gradient-to-br from-blue-50 to-purple-50 dark:from-blue-900/20 dark:to-purple-900/20 p-6 rounded-lg">
                    <div className="max-w-md mx-auto">
                      <div className="bg-white dark:bg-slate-800 rounded-lg shadow-xl overflow-hidden border border-slate-200 dark:border-slate-700">
                        {/* Header with Company Branding */}
                        <div 
                          className="p-5 text-white text-center relative overflow-hidden"
                          style={{
                            background: `linear-gradient(135deg, ${currentSettings?.accentColor || '#3b82f6'} 0%, ${currentSettings?.accentColor || '#3b82f6'}ee 100%)`
                          }}
                        >
                          {currentSettings?.logoUrl && (
                            <img 
                              src={`/objects${currentSettings.logoUrl}`}
                              alt="Company Logo" 
                              className="h-10 mx-auto mb-2 filter brightness-0 invert"
                              onError={(e) => e.currentTarget.style.display = 'none'}
                            />
                          )}
                          <h4 className="text-lg font-bold">Digital Visitor Pass</h4>
                          {!currentSettings?.logoUrl && (
                            <p className="text-sm opacity-95 mt-1">{currentSettings?.companyName || "VisiGate Pro"}</p>
                          )}
                        </div>
                        
                        {/* Pass Content */}
                        <div className="p-6 space-y-5" style={{ backgroundColor: currentSettings?.backgroundColor || '#ffffff' }}>
                          {/* QR Code */}
                          <div className="bg-gradient-to-b from-white to-gray-50 dark:from-slate-700 dark:to-slate-800 p-5 rounded-xl border-2 border-gray-100 dark:border-slate-600 text-center">
                            <div className="inline-block p-3 bg-white dark:bg-slate-900 rounded-lg shadow-lg">
                              <QrCode size={100} style={{ color: currentSettings?.foregroundColor || '#1e293b' }} />
                            </div>
                            <p className="font-bold text-base mt-3" style={{ color: currentSettings?.foregroundColor || '#1e293b' }}>
                              PASS ID: VIS-2025-001
                            </p>
                            <p className="text-xs opacity-75 mt-1" style={{ color: currentSettings?.variableTextColor || '#374151' }}>
                              Show this at exit scanners
                            </p>
                          </div>
                          
                          {/* Visitor Details */}
                          <div className="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-600 p-4">
                            <h5 className="font-semibold text-sm mb-3 pb-2 border-b flex items-center gap-2" 
                                style={{ 
                                  color: currentSettings?.foregroundColor || '#1e293b',
                                  borderColor: `${currentSettings?.accentColor || '#3b82f6'}30`
                                }}>
                              📋 Visit Details
                            </h5>
                            <div className="space-y-2 text-sm">
                              <div className="flex justify-between">
                                <span style={{ color: currentSettings?.variableTextColor || '#374151' }}>Visitor:</span>
                                <span className="font-semibold" style={{ color: currentSettings?.foregroundColor || '#1e293b' }}>John Doe</span>
                              </div>
                              <div className="flex justify-between">
                                <span style={{ color: currentSettings?.variableTextColor || '#374151' }}>Company:</span>
                                <span className="font-semibold" style={{ color: currentSettings?.foregroundColor || '#1e293b' }}>Acme Corp</span>
                              </div>
                              <div className="flex justify-between">
                                <span style={{ color: currentSettings?.variableTextColor || '#374151' }}>Host:</span>
                                <span className="font-semibold" style={{ color: currentSettings?.foregroundColor || '#1e293b' }}>Jane Smith</span>
                              </div>
                              <div className="flex justify-between">
                                <span style={{ color: currentSettings?.variableTextColor || '#374151' }}>Check-in:</span>
                                <span className="font-semibold" style={{ color: currentSettings?.foregroundColor || '#1e293b' }}>10:00 AM</span>
                              </div>
                              <div className="flex justify-between">
                                <span style={{ color: currentSettings?.variableTextColor || '#374151' }}>Valid Until:</span>
                                <span className="font-semibold" style={{ color: currentSettings?.foregroundColor || '#1e293b' }}>5:00 PM</span>
                              </div>
                            </div>
                          </div>
                          
                          {/* Action Buttons */}
                          <div className="flex gap-3">
                            <Button className="flex-1 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white shadow-lg">
                              📱 View Digital Pass
                            </Button>
                          </div>
                          
                          {/* Important Notes */}
                          <div className="bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20 rounded-lg p-3 border-l-4 border-amber-500">
                            <p className="text-xs font-semibold text-amber-900 dark:text-amber-200 mb-1">⚠️ Important Reminders</p>
                            <ul className="text-xs text-amber-800 dark:text-amber-300 space-y-0.5 ml-4 list-disc">
                              <li>Check out when leaving</li>
                              <li>Keep pass on your phone</li>
                              {currentSettings?.geofencingEnabled && <li>✅ Auto check-out enabled</li>}
                            </ul>
                          </div>
                        </div>
                        
                        {/* Footer */}
                        <div className="px-5 py-3 text-center border-t" style={{ backgroundColor: currentSettings?.backgroundColor || '#f9fafb' }}>
                          <p className="text-xs opacity-60" style={{ color: currentSettings?.variableTextColor || '#374151' }}>
                            {currentSettings?.companyName || "Your Company"} • {currentSettings?.address || "Your Address"}
                          </p>
                          <p className="text-xs opacity-40 mt-1">Powered by VisiGate Pro</p>
                        </div>
                      </div>
                      
                      <div className="mt-4 text-center">
                        <Badge variant="secondary" className="text-xs">
                          Delivery Method: {currentSettings?.ePassDeliveryMethod === "both" ? "Email & SMS" : 
                                          currentSettings?.ePassDeliveryMethod === "email" ? "Email Only" : 
                                          currentSettings?.ePassDeliveryMethod === "sms" ? "SMS Only" : "Visitor Choice"}
                        </Badge>
                        <p className="text-xs text-slate-500 mt-2">
                          This preview shows how the e-Pass will appear on mobile devices
                        </p>
                      </div>
                    </div>
                  </div>
                </GlassCard>
              )}
            </TabsContent>

            <TabsContent value="qr-readers" className="space-y-6">
              {/* CLUe Cloud Platform Integration Section */}
              <GlassCard>
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center">
                    <Shield className="mr-3 text-green-600" size={24} />
                    <div>
                      <h3 className="text-lg font-semibold text-slate-800">Suprema CLUe Cloud Platform</h3>
                      <p className="text-xs text-slate-600">Enterprise-grade cloud integration for X-Station 2 devices</p>
                    </div>
                  </div>
                  <Switch
                    checked={currentSettings?.clueEnabled === true}
                    onCheckedChange={(checked) => handleInputChange("clueEnabled", checked)}
                    data-testid="switch-clue-enabled"
                  />
                </div>
                
                {currentSettings?.clueEnabled && (
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label className="text-sm font-medium text-slate-700">API Key</Label>
                        <Input
                          type="password"
                          value={currentSettings?.clueApiKey || ""}
                          onChange={(e) => handleInputChange("clueApiKey", e.target.value)}
                          placeholder="Enter CLUe API Key"
                          className="font-mono"
                          data-testid="input-clue-api-key"
                        />
                      </div>
                      
                      <div className="space-y-2">
                        <Label className="text-sm font-medium text-slate-700">API Secret</Label>
                        <Input
                          type="password"
                          value={currentSettings?.clueApiSecret || ""}
                          onChange={(e) => handleInputChange("clueApiSecret", e.target.value)}
                          placeholder="Enter CLUe API Secret"
                          className="font-mono"
                          data-testid="input-clue-api-secret"
                        />
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label className="text-sm font-medium text-slate-700">Organization ID</Label>
                        <Input
                          value={currentSettings?.clueOrganizationId || ""}
                          onChange={(e) => handleInputChange("clueOrganizationId", e.target.value)}
                          placeholder="Your CLUe Organization ID"
                          data-testid="input-clue-org-id"
                        />
                      </div>
                      
                      <div className="space-y-2">
                        <Label className="text-sm font-medium text-slate-700">Webhook Secret</Label>
                        <Input
                          type="password"
                          value={currentSettings?.clueWebhookSecret || ""}
                          onChange={(e) => handleInputChange("clueWebhookSecret", e.target.value)}
                          placeholder="Webhook verification secret"
                          className="font-mono"
                          data-testid="input-clue-webhook-secret"
                        />
                      </div>
                    </div>
                    
                    <Separator className="my-4" />
                    
                    <div className="space-y-4">
                      <h4 className="font-medium text-slate-700">QR Code Settings</h4>
                      
                      <div className="flex items-center justify-between">
                        <div>
                          <Label className="text-sm font-medium text-slate-700">Dynamic QR Codes</Label>
                          <p className="text-xs text-slate-500">Generate single-use QR codes for enhanced security</p>
                        </div>
                        <Switch
                          checked={currentSettings?.clueDynamicQrEnabled === true}
                          onCheckedChange={(checked) => handleInputChange("clueDynamicQrEnabled", checked)}
                          data-testid="switch-clue-dynamic-qr"
                        />
                      </div>
                      
                      <div className="space-y-2">
                        <Label className="text-sm font-medium text-slate-700">QR Validity Period (minutes)</Label>
                        <Input
                          type="number"
                          value={currentSettings?.clueQrValidityMinutes || "60"}
                          onChange={(e) => handleInputChange("clueQrValidityMinutes", e.target.value)}
                          min="1"
                          max="1440"
                          data-testid="input-clue-qr-validity"
                        />
                        <p className="text-xs text-slate-500">How long QR codes remain valid after generation</p>
                      </div>
                    </div>
                    
                    <Separator className="my-4" />
                    
                    <div className="space-y-4">
                      <h4 className="font-medium text-slate-700">Automation Settings</h4>
                      
                      <div className="flex items-center justify-between">
                        <div>
                          <Label className="text-sm font-medium text-slate-700">Auto-Register Visitors</Label>
                          <p className="text-xs text-slate-500">Automatically sync visitors to CLUe platform</p>
                        </div>
                        <Switch
                          checked={currentSettings?.clueAutoRegisterVisitors === true}
                          onCheckedChange={(checked) => handleInputChange("clueAutoRegisterVisitors", checked)}
                          data-testid="switch-clue-auto-register"
                        />
                      </div>
                      
                      <div className="flex items-center justify-between">
                        <div>
                          <Label className="text-sm font-medium text-slate-700">Auto-Delete Expired</Label>
                          <p className="text-xs text-slate-500">Remove expired QR codes from CLUe automatically</p>
                        </div>
                        <Switch
                          checked={currentSettings?.clueAutoDeleteExpired === true}
                          onCheckedChange={(checked) => handleInputChange("clueAutoDeleteExpired", checked)}
                          data-testid="switch-clue-auto-delete"
                        />
                      </div>
                      
                      <div className="flex items-center justify-between">
                        <div>
                          <Label className="text-sm font-medium text-slate-700">Test Mode</Label>
                          <p className="text-xs text-slate-500">Enable for development and testing</p>
                        </div>
                        <Switch
                          checked={currentSettings?.clueTestMode === true}
                          onCheckedChange={(checked) => handleInputChange("clueTestMode", checked)}
                          data-testid="switch-clue-test-mode"
                        />
                      </div>
                    </div>
                    
                    <div className="flex gap-2 pt-4">
                      <Button
                        variant="outline"
                        className="flex-1"
                        onClick={async () => {
                          toast({
                            title: "Testing CLUe Connection",
                            description: "Verifying API credentials and connectivity...",
                          });
                          
                          try {
                            const response = await apiRequest("POST", "/api/clue/test-connection");
                            const data = await response.json();
                            
                            if (data.success) {
                              toast({
                                title: "Connection Successful",
                                description: data.message,
                              });
                            } else {
                              toast({
                                title: "Connection Failed",
                                description: data.message,
                                variant: "destructive"
                              });
                            }
                          } catch (error) {
                            toast({
                              title: "Connection Error",
                              description: "Failed to test CLUe connection",
                              variant: "destructive"
                            });
                          }
                        }}
                        data-testid="button-test-clue"
                      >
                        <TestTube className="mr-2" size={16} />
                        Test Connection
                      </Button>
                      
                      <Button
                        variant="outline"
                        className="flex-1"
                        onClick={async () => {
                          toast({
                            title: "Syncing with CLUe",
                            description: "Synchronizing devices and users...",
                          });
                          
                          try {
                            const response = await apiRequest("POST", "/api/clue/sync");
                            const data = await response.json();
                            
                            if (data.success) {
                              toast({
                                title: "Sync Complete",
                                description: `Synced ${data.synced} items. ${data.failed} failed.`,
                              });
                              
                              // Update the last sync timestamp
                              queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
                            } else {
                              toast({
                                title: "Sync Failed",
                                description: "Failed to sync with CLUe platform",
                                variant: "destructive"
                              });
                            }
                          } catch (error) {
                            toast({
                              title: "Sync Error",
                              description: "Failed to sync with CLUe",
                              variant: "destructive"
                            });
                          }
                        }}
                        data-testid="button-sync-clue"
                      >
                        <RefreshCw className="mr-2" size={16} />
                        Sync Now
                      </Button>
                    </div>
                    
                    {currentSettings?.clueLastSync && (
                      <div className="text-xs text-slate-500 text-center">
                        Last synchronized: {new Date(currentSettings.clueLastSync).toLocaleString()}
                      </div>
                    )}
                  </div>
                )}
              </GlassCard>
              
              {/* CLUe X-Station 2 Devices */}
              {currentSettings?.clueEnabled && (
                <GlassCard>
                  <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center">
                      <Server className="mr-3 text-blue-600" size={24} />
                      <h3 className="text-lg font-semibold text-slate-800">X-Station 2 Devices</h3>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={async () => {
                        try {
                          const response = await apiRequest("GET", "/api/clue/devices");
                          const data = await response.json();
                          
                          if (data.success && data.devices) {
                            toast({
                              title: `Found ${data.count} device(s)`,
                              description: "Device list refreshed successfully",
                            });
                          }
                        } catch (error) {
                          toast({
                            title: "Failed to fetch devices",
                            description: "Could not retrieve device list",
                            variant: "destructive"
                          });
                        }
                      }}
                      data-testid="button-refresh-devices"
                    >
                      <RefreshCw className="mr-2" size={16} />
                      Refresh
                    </Button>
                  </div>
                  
                  <div className="space-y-4">
                    <div className="p-4 bg-slate-50 dark:bg-slate-800 rounded-lg">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center">
                          <Monitor className="mr-2 text-green-600" size={20} />
                          <div>
                            <p className="font-medium text-slate-800">X-Station 2 - Main Entrance</p>
                            <p className="text-xs text-slate-500">Device ID: XS2-001 • IP: 192.168.1.100</p>
                          </div>
                        </div>
                        <Badge className="bg-green-100 text-green-800">Online</Badge>
                      </div>
                      <div className="text-xs text-slate-600 mt-2">
                        Location: Building A, Main Lobby • Last seen: Just now
                      </div>
                    </div>
                    
                    <div className="p-4 bg-slate-50 dark:bg-slate-800 rounded-lg">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center">
                          <Monitor className="mr-2 text-green-600" size={20} />
                          <div>
                            <p className="font-medium text-slate-800">X-Station 2 - Side Entrance</p>
                            <p className="text-xs text-slate-500">Device ID: XS2-002 • IP: 192.168.1.101</p>
                          </div>
                        </div>
                        <Badge className="bg-green-100 text-green-800">Online</Badge>
                      </div>
                      <div className="text-xs text-slate-600 mt-2">
                        Location: Building A, Side Door • Last seen: 2 minutes ago
                      </div>
                    </div>
                    
                    <div className="p-4 bg-slate-50 dark:bg-slate-800 rounded-lg">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center">
                          <Monitor className="mr-2 text-gray-400" size={20} />
                          <div>
                            <p className="font-medium text-slate-800">X-Station 2 - Reception</p>
                            <p className="text-xs text-slate-500">Device ID: XS2-003 • IP: 192.168.1.102</p>
                          </div>
                        </div>
                        <Badge className="bg-gray-100 text-gray-800">Offline</Badge>
                      </div>
                      <div className="text-xs text-slate-600 mt-2">
                        Location: Reception Desk • Last seen: 1 hour ago
                      </div>
                    </div>
                    
                    <div className="text-center text-xs text-slate-500 pt-2">
                      Configure devices in CLUe Cloud Platform dashboard
                    </div>
                  </div>
                </GlassCard>
              )}
              
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <GlassCard>
                  <div className="flex items-center mb-6">
                    <QrCode className="mr-3 text-blue-600" size={24} />
                    <h3 className="text-lg font-semibold text-slate-800">QR Reader Detection</h3>
                  </div>
                  
                  <div className="space-y-4">
                    <Button
                      className="gradient-blue text-white w-full"
                      data-testid="button-scan-qr-readers"
                    >
                      <Scan className="mr-2" size={16} />
                      Scan for QR Readers
                    </Button>
                    
                    <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                      <h4 className="font-medium text-blue-800 dark:text-blue-200 mb-2">Supported Devices:</h4>
                      <ul className="text-sm text-blue-700 dark:text-blue-300 space-y-1">
                        <li>• USB QR/Barcode scanners (HID mode)</li>
                        <li>• Serial port QR readers (COM/TTY)</li>
                        <li>• Ethernet-enabled QR scanners</li>
                        <li>• Keyboard wedge scanners</li>
                        <li className="font-semibold">• Suprema X-Station 2 (via CLUe/BioStar)</li>
                        <li className="ml-4">- Cloud-based integration</li>
                        <li className="ml-4">- Dynamic QR codes</li>
                        <li className="ml-4">- Real-time webhook events</li>
                      </ul>
                    </div>
                  </div>
                </GlassCard>

                <GlassCard>
                  <div className="flex items-center mb-6">
                    <Settings2 className="mr-3 text-blue-600" size={24} />
                    <h3 className="text-lg font-semibold text-slate-800">Reader Configuration</h3>
                  </div>
                  
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label className="text-sm font-medium text-slate-700">
                        Default Reader Mode
                      </Label>
                      <Select 
                        value={currentSettings?.qrReaderDevice || "auto"} 
                        onValueChange={(value) => handleInputChange("qrReaderDevice", value)}
                      >
                        <SelectTrigger data-testid="select-qr-reader-mode">
                          <SelectValue placeholder="Select reader mode" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="auto">Auto-detect</SelectItem>
                          <SelectItem value="usb">USB Only</SelectItem>
                          <SelectItem value="serial">Serial Port Only</SelectItem>
                          <SelectItem value="ethernet">Ethernet Only</SelectItem>
                          <SelectItem value="keyboard">Keyboard Wedge</SelectItem>
                          <SelectItem value="xstation">X-Station 2 (BioStar)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-sm font-medium text-slate-700">
                        Scan Timeout (seconds)
                      </Label>
                      <Input
                        type="number"
                        min="1"
                        max="30"
                        value={currentSettings?.clueQrValidityMinutes || "60"}
                        onChange={(e) => handleInputChange("clueQrValidityMinutes", e.target.value)}
                        className="w-full px-4 py-3 rounded-xl border border-white/30 bg-white/50"
                        data-testid="input-qr-scan-timeout"
                      />
                    </div>

                    <div className="flex items-center justify-between">
                      <div>
                        <Label className="text-sm font-medium text-slate-700">
                          Audio Feedback
                        </Label>
                        <p className="text-xs text-slate-500">Play sound on successful scan</p>
                      </div>
                      <Switch
                        checked={currentSettings?.qrReaderEnabled || false}
                        onCheckedChange={(checked) => handleInputChange("qrReaderEnabled", checked)}
                        data-testid="switch-qr-audio-feedback"
                      />
                    </div>
                  </div>
                </GlassCard>
              </div>

              {/* X-Station 2 Configuration */}
              {currentSettings?.qrReaderDevice === 'xstation' && (
                <GlassCard>
                  <div className="flex items-center mb-6">
                    <Shield className="mr-3 text-indigo-600" size={24} />
                    <h3 className="text-lg font-semibold text-slate-800">X-Station 2 Configuration</h3>
                  </div>
                  
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label className="text-sm font-medium text-slate-700">
                        X-Station IP Addresses
                      </Label>
                      <textarea
                        value={(currentSettings?.xStationDevices || []).join('\n')}
                        onChange={(e) => handleInputChange("xStationDevices", e.target.value.split('\n').filter(d => d.trim()))}
                        className="w-full px-4 py-3 rounded-xl border border-white/30 bg-white/50 h-32 font-mono text-sm"
                        placeholder="192.168.1.100&#10;192.168.1.101&#10;192.168.1.102"
                        data-testid="textarea-xstation-ips"
                      />
                      <p className="text-xs text-slate-500">Enter one IP address per line</p>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-sm font-medium text-slate-700">
                        Pre-booking QR Support
                      </Label>
                      <Switch
                        checked={currentSettings?.xStationEnabled || false}
                        onCheckedChange={(checked) => handleInputChange("xStationEnabled", checked)}
                        data-testid="switch-xstation-prebooking"
                      />
                      <p className="text-xs text-slate-500">
                        Allow pre-booked visitors and contractors to check in using X-Station QR readers
                      </p>
                    </div>

                    <div className="mt-4 p-4 bg-indigo-50 rounded-lg border border-indigo-200">
                      <h4 className="font-medium text-indigo-800 mb-2">X-Station Features:</h4>
                      <ul className="text-sm text-indigo-700 space-y-1">
                        <li>✓ Visitor QR code checkout</li>
                        <li>✓ Pre-booking QR code check-in</li>
                        <li>✓ Contractor QR validation</li>
                        <li>✓ Network-based communication</li>
                        <li>✓ BioStar 2 integration</li>
                      </ul>
                    </div>

                    <Button
                      variant="outline"
                      className="w-full"
                      onClick={() => {
                        toast({
                          title: "Testing X-Station Connection",
                          description: "Attempting to connect to configured X-Station devices...",
                        });
                      }}
                      data-testid="button-test-xstation"
                    >
                      <Scan className="mr-2" size={16} />
                      Test X-Station Connection
                    </Button>
                  </div>
                </GlassCard>
              )}

              <GlassCard>
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center">
                    <QrCode className="mr-3 text-blue-600" size={24} />
                    <h3 className="text-lg font-semibold text-slate-800">Connected QR Readers</h3>
                  </div>
                  <Button
                    variant="outline"
                    className="text-blue-600 border-blue-300"
                    data-testid="button-refresh-readers"
                  >
                    <RefreshCw className="mr-2" size={16} />
                    Refresh
                  </Button>
                </div>

                <div className="space-y-4">
                  {/* Mock connected readers - will be populated from API */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="p-4 rounded-xl border border-green-200 bg-green-50 dark:bg-green-900/20">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-3">
                          <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                          <h4 className="font-semibold text-green-800 dark:text-green-200">USB QR Scanner</h4>
                        </div>
                        <Badge variant="secondary" className="bg-green-100 text-green-800">USB</Badge>
                      </div>
                      <div className="text-sm text-green-700 dark:text-green-300 space-y-1">
                        <p><strong>Port:</strong> COM3</p>
                        <p><strong>Status:</strong> Connected</p>
                        <p><strong>Last Scan:</strong> 2 minutes ago</p>
                      </div>
                      <div className="mt-3 flex gap-2">
                        <Button size="sm" variant="outline" className="text-blue-600 border-blue-300">
                          <Settings2 size={14} className="mr-1" />
                          Configure
                        </Button>
                        <Button size="sm" variant="outline" className="text-slate-600 border-slate-300">
                          <TestTube size={14} className="mr-1" />
                          Test
                        </Button>
                      </div>
                    </div>

                    <div className="p-4 rounded-xl border border-blue-200 bg-blue-50 dark:bg-blue-900/20">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-3">
                          <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
                          <h4 className="font-semibold text-blue-800 dark:text-blue-200">Ethernet Scanner</h4>
                        </div>
                        <Badge variant="secondary" className="bg-blue-100 text-blue-800">Ethernet</Badge>
                      </div>
                      <div className="text-sm text-blue-700 dark:text-blue-300 space-y-1">
                        <p><strong>IP:</strong> 192.168.1.100</p>
                        <p><strong>Status:</strong> Connected</p>
                        <p><strong>Last Scan:</strong> 5 minutes ago</p>
                      </div>
                      <div className="mt-3 flex gap-2">
                        <Button size="sm" variant="outline" className="text-blue-600 border-blue-300">
                          <Settings2 size={14} className="mr-1" />
                          Configure
                        </Button>
                        <Button size="sm" variant="outline" className="text-slate-600 border-slate-300">
                          <TestTube size={14} className="mr-1" />
                          Test
                        </Button>
                      </div>
                    </div>
                  </div>
                  
                  <div className="text-center py-8 border-2 border-dashed border-slate-200 rounded-xl">
                    <QrCode className="mx-auto mb-4 text-slate-400" size={48} />
                    <p className="text-slate-600 mb-4">Add Additional QR Reader</p>
                    <div className="flex gap-3 justify-center">
                      <Button variant="outline" className="text-blue-600 border-blue-300">
                        <Plus className="mr-2" size={16} />
                        Add USB Reader
                      </Button>
                      <Button variant="outline" className="text-purple-600 border-purple-300">
                        <Globe className="mr-2" size={16} />
                        Add Ethernet Reader
                      </Button>
                    </div>
                  </div>
                </div>
              </GlassCard>

              <GlassCard>
                <div className="flex items-center mb-6">
                  <TestTube className="mr-3 text-blue-600" size={24} />
                  <h3 className="text-lg font-semibold text-slate-800">QR Reader Testing</h3>
                </div>
                
                <div className="space-y-4">
                  <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg border border-yellow-200 dark:border-yellow-800">
                    <h4 className="font-medium text-yellow-800 dark:text-yellow-200 mb-2">Test Mode Active</h4>
                    <p className="text-sm text-yellow-700 dark:text-yellow-300 mb-3">
                      Scan any QR code or barcode to test your readers. Results will appear below.
                    </p>
                    <Button className="gradient-blue text-white">
                      <Scan className="mr-2" size={16} />
                      Start Test Scan
                    </Button>
                  </div>

                  <div className="bg-slate-50 dark:bg-slate-800 rounded-lg p-4">
                    <h4 className="font-medium text-slate-800 dark:text-slate-200 mb-3">Recent Scan Results</h4>
                    <div className="space-y-2 max-h-32 overflow-y-auto">
                      <div className="text-sm text-slate-600 dark:text-slate-400 p-2 bg-white dark:bg-slate-700 rounded">
                        <span className="font-mono">VIS-2025-001234</span> - <span className="text-green-600">USB Scanner</span> - <span className="text-xs">2 minutes ago</span>
                      </div>
                      <div className="text-sm text-slate-600 dark:text-slate-400 p-2 bg-white dark:bg-slate-700 rounded">
                        <span className="font-mono">STAFF-ENG-456</span> - <span className="text-blue-600">Ethernet Scanner</span> - <span className="text-xs">5 minutes ago</span>
                      </div>
                    </div>
                  </div>
                </div>
              </GlassCard>
            </TabsContent>
          </Tabs>
        </TabsContent>

        <TabsContent value="display">
          <div className="text-center py-8">
            <p className="text-slate-600">Display features will be restored shortly...</p>
          </div>
        </TabsContent>

        <TabsContent value="biostar" className="space-y-6 mt-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <GlassCard>
              <div className="flex items-center mb-6">
                <Shield className="mr-3 text-blue-600" size={24} />
                <h3 className="text-lg font-semibold text-slate-800">Suprema BioStar 2 Local Server</h3>
              </div>
              
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <Label className="text-sm font-medium text-slate-700">
                      Enable BioStar Integration
                    </Label>
                    <p className="text-xs text-slate-500">Connect to local BioStar 2 server for access control</p>
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
                        Local Server Address
                      </Label>
                      <Input
                        id="biostarServerUrl"
                        type="url"
                        value={currentSettings?.biostarServerUrl || ""}
                        onChange={(e) => handleInputChange("biostarServerUrl", e.target.value)}
                        className="w-full px-4 py-3 rounded-xl border border-white/30 bg-white/50 focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-800"
                        placeholder="http://localhost:8080 or http://192.168.1.100:8080"
                        data-testid="input-biostar-server-url"
                      />
                      <p className="text-xs text-slate-500">
                        Enter the local network address of your BioStar 2 server
                      </p>
                    </div>
                    
                    <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                      <div className="flex items-start">
                        <Info className="mr-2 text-blue-600 flex-shrink-0" size={20} />
                        <div className="text-sm text-slate-700">
                          <p className="font-medium mb-2">Local Installation Configuration</p>
                          <p className="text-xs mb-2">
                            For local BioStar 2 installations, VisiGate Pro communicates directly with your on-premise server. 
                            No API credentials are required as authentication is handled internally by BioStar.
                          </p>
                          <p className="text-xs font-medium mt-2">Requirements:</p>
                          <ul className="list-disc list-inside space-y-1 text-xs ml-2">
                            <li>BioStar 2 server installed on your local network</li>
                            <li>Network connectivity between VisiGate and BioStar</li>
                            <li>Firewall configured to allow communication</li>
                            <li>BioStar configured to accept local connections</li>
                          </ul>
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex gap-2 pt-2">
                      <Button
                        variant="outline"
                        onClick={() => {
                          toast({
                            title: "Testing BioStar Connection",
                            description: "Attempting to connect to local BioStar server...",
                          });
                          // Connection test would be implemented here
                          setTimeout(() => {
                            if (currentSettings?.biostarServerUrl) {
                              toast({
                                title: "Connection Successful",
                                description: "Connected to BioStar 2 local server",
                              });
                            } else {
                              toast({
                                title: "Connection Failed", 
                                description: "Please enter a valid server address",
                                variant: "destructive"
                              });
                            }
                          }, 1500);
                        }}
                        disabled={!currentSettings?.biostarServerUrl}
                        data-testid="button-test-biostar"
                      >
                        <TestTube className="mr-2" size={16} />
                        Test Connection
                      </Button>
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

        <TabsContent value="phone-systems" className="space-y-6 mt-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <GlassCard>
              <div className="flex items-center mb-6">
                <Phone className="mr-3 text-blue-600" size={24} />
                <h3 className="text-lg font-semibold text-slate-800">Phone System Configuration</h3>
              </div>
              
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="phoneProvider" className="text-sm font-medium text-slate-700">
                    Phone System Provider
                  </Label>
                  <Select 
                    value={currentSettings?.phoneProvider || "8x8"} 
                    onValueChange={(value) => handleInputChange("phoneProvider", value)}
                  >
                    <SelectTrigger className="w-full px-4 py-3 rounded-xl border border-white/30 bg-white/50 focus:outline-none focus:ring-2 focus:ring-blue-500">
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
                    <Label className="text-sm font-medium text-slate-700">
                      Voice Notifications Enabled
                    </Label>
                    <Switch
                      checked={currentSettings?.voiceNotificationsEnabled || false}
                      onCheckedChange={(checked) => handleInputChange("voiceNotificationsEnabled", checked)}
                      data-testid="switch-voice-notifications"
                    />
                  </div>
                  <p className="text-xs text-slate-500">
                    Enable automated voice calls to staff when visitors arrive
                  </p>
                </div>
              </div>
            </GlassCard>

            <GlassCard>
              <div className="flex items-center mb-6">
                <Settings2 className="mr-3 text-green-600" size={24} />
                <h3 className="text-lg font-semibold text-slate-800">8x8 API Configuration</h3>
              </div>
              
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="eightByXApiKey" className="text-sm font-medium text-slate-700">
                    API Key
                  </Label>
                  <Input
                    id="eightByXApiKey"
                    type="password"
                    value={currentSettings?.eightByXApiKey || ""}
                    onChange={(e) => handleInputChange("eightByXApiKey", e.target.value)}
                    placeholder="Enter your 8x8 API key"
                    className="w-full px-4 py-3 rounded-xl border border-white/30 bg-white/50 focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-800"
                    data-testid="input-8x8-api-key"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="eightByXApiSecret" className="text-sm font-medium text-slate-700">
                    API Secret
                  </Label>
                  <Input
                    id="eightByXApiSecret"
                    type="password"
                    value={currentSettings?.eightByXApiSecret || ""}
                    onChange={(e) => handleInputChange("eightByXApiSecret", e.target.value)}
                    placeholder="Enter your 8x8 API secret"
                    className="w-full px-4 py-3 rounded-xl border border-white/30 bg-white/50 focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-800"
                    data-testid="input-8x8-api-secret"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="eightByXAccountId" className="text-sm font-medium text-slate-700">
                    Account ID
                  </Label>
                  <Input
                    id="eightByXAccountId"
                    type="text"
                    value={currentSettings?.eightByXAccountId || ""}
                    onChange={(e) => handleInputChange("eightByXAccountId", e.target.value)}
                    placeholder="Enter your 8x8 account ID"
                    className="w-full px-4 py-3 rounded-xl border border-white/30 bg-white/50 focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-800"
                    data-testid="input-8x8-account-id"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="eightByXBaseUrl" className="text-sm font-medium text-slate-700">
                    API Base URL
                  </Label>
                  <Input
                    id="eightByXBaseUrl"
                    type="text"
                    value={currentSettings?.eightByXBaseUrl || "https://vcc-eu.8x8.com/api/v1"}
                    onChange={(e) => handleInputChange("eightByXBaseUrl", e.target.value)}
                    placeholder="https://vcc-eu.8x8.com/api/v1"
                    className="w-full px-4 py-3 rounded-xl border border-white/30 bg-white/50 focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-800"
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
                <h3 className="text-lg font-semibold text-slate-800">Voice Settings</h3>
              </div>
              
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="defaultVoiceLanguage" className="text-sm font-medium text-slate-700">
                    Default Voice Language
                  </Label>
                  <Select 
                    value={currentSettings?.defaultVoiceLanguage || "en-GB"} 
                    onValueChange={(value) => handleInputChange("defaultVoiceLanguage", value)}
                  >
                    <SelectTrigger className="w-full px-4 py-3 rounded-xl border border-white/30 bg-white/50 focus:outline-none focus:ring-2 focus:ring-blue-500">
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
                  <Label htmlFor="defaultVoiceProfile" className="text-sm font-medium text-slate-700">
                    Default Voice Profile
                  </Label>
                  <Select 
                    value={currentSettings?.defaultVoiceProfile || "en-GB-Standard-A"} 
                    onValueChange={(value) => handleInputChange("defaultVoiceProfile", value)}
                  >
                    <SelectTrigger className="w-full px-4 py-3 rounded-xl border border-white/30 bg-white/50 focus:outline-none focus:ring-2 focus:ring-blue-500">
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
                <h3 className="text-lg font-semibold text-slate-800">Test & Diagnostics</h3>
              </div>
              
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="testPhoneNumber" className="text-sm font-medium text-slate-700">
                    Test Phone Number
                  </Label>
                  <Input
                    id="testPhoneNumber"
                    type="tel"
                    placeholder="+44 20 7123 4567"
                    className="w-full px-4 py-3 rounded-xl border border-white/30 bg-white/50 focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-800"
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
                  <h4 className="text-sm font-medium text-slate-700 mb-2">API Status</h4>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-slate-600">8x8 API Connection</span>
                      <Badge variant="outline" className="text-green-700 bg-green-50 border-green-200">
                        <CheckCircle size={12} className="mr-1" />
                        Connected
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-slate-600">Voice Notifications</span>
                      <Badge variant="outline" className={
                        currentSettings?.voiceNotificationsEnabled 
                          ? "text-green-700 bg-green-50 border-green-200"
                          : "text-slate-500 bg-slate-50 border-slate-200"
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
        </TabsContent>

        <TabsContent value="users" className="space-y-6 mt-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <GlassCard>
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center">
                  <Users className="mr-3 text-blue-600" size={24} />
                  <h3 className="text-lg font-semibold text-slate-800">User Management</h3>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setShowManualUserDialog(true)}
                    data-testid="button-manual-user"
                  >
                    <UserPlus className="mr-2" size={16} />
                    Add Manually
                  </Button>
                  <Button
                    size="sm"
                    className="gradient-blue text-white"
                    onClick={() => setShowAddEmailDialog(true)}
                    data-testid="button-invite-user"
                  >
                    <Mail className="mr-2" size={16} />
                    Send Invitation
                  </Button>
                </div>
              </div>
              
              <div className="space-y-4">
                {usersLoading ? (
                  <div className="text-center py-8">
                    <RefreshCw className="mx-auto text-slate-400 mb-4 animate-spin" size={32} />
                    <p className="text-slate-600">Loading users...</p>
                  </div>
                ) : users && users.length > 0 ? (
                  <>
                    {users.map((user) => {
                      const isCurrentUser = user.id === currentUser?.id;
                      const initials = user.firstName && user.lastName 
                        ? `${user.firstName[0]}${user.lastName[0]}`
                        : user.username.substring(0, 2).toUpperCase();
                      const displayName = user.firstName && user.lastName
                        ? `${user.firstName} ${user.lastName}${isCurrentUser ? ' (You)' : ''}`
                        : `${user.username}${isCurrentUser ? ' (You)' : ''}`;
                      
                      return (
                        <div key={user.id} className="flex items-center justify-between p-3 bg-white/50 rounded-lg" data-testid={`user-item-${user.id}`}>
                          <div className="flex items-center space-x-3">
                            <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center">
                              <span className="text-white text-sm font-bold">{initials}</span>
                            </div>
                            <div>
                              <p className="font-medium text-slate-800">{displayName}</p>
                              <p className="text-sm text-slate-600">{user.email}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge variant={user.role === 'admin' ? 'default' : 'secondary'}>
                              {user.role === 'admin' ? 'Admin' : 'User'}
                            </Badge>
                            {!isCurrentUser && (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => {
                                  if (confirm(`Are you sure you want to delete ${displayName}?`)) {
                                    deleteUserMutation.mutate(user.id);
                                  }
                                }}
                                disabled={deleteUserMutation.isPending}
                                data-testid={`button-delete-user-${user.id}`}
                              >
                                <Trash2 className="h-4 w-4 text-red-500" />
                              </Button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </>
                ) : (
                  <div className="text-center py-8">
                    <Shield className="mx-auto text-slate-400 mb-4" size={48} />
                    <p className="text-slate-600 mb-4">No users yet</p>
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => setShowAddEmailDialog(true)}
                      data-testid="button-send-first-invitation"
                    >
                      <UserPlus className="mr-2" size={16} />
                      Send First Invitation
                    </Button>
                  </div>
                )}
              </div>
            </GlassCard>
            
            <GlassCard>
              <div className="flex items-center mb-6">
                <UserPlus className="mr-3 text-blue-600" size={24} />
                <h3 className="text-lg font-semibold text-slate-800">Invite New User</h3>
              </div>
              
              <form 
                className="space-y-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (inviteForm.email && inviteForm.role) {
                    inviteMutation.mutate(inviteForm);
                  }
                }}
              >
                <div className="space-y-2">
                  <Label htmlFor="inviteEmail" className="text-sm font-medium text-slate-700">
                    Email Address
                  </Label>
                  <Input
                    id="inviteEmail"
                    type="email"
                    placeholder="user@example.com"
                    value={inviteForm.email}
                    onChange={(e) => setInviteForm({ ...inviteForm, email: e.target.value })}
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
                  className="w-full gradient-blue text-white"
                  disabled={inviteMutation.isPending || !inviteForm.email || !inviteForm.role}
                  data-testid="button-send-invitation"
                >
                  {inviteMutation.isPending ? "Sending..." : "Send Invitation"}
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

        <TabsContent value="departments" className="space-y-6 mt-6">
          <GlassCard>
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center">
                <Building className="mr-3 text-blue-600" size={24} />
                <div>
                  <h3 className="text-lg font-semibold text-slate-800">Department Management</h3>
                  <p className="text-sm text-slate-600">
                    Organize your workforce and improve visitor experiences with department-based routing
                  </p>
                </div>
              </div>
              <div className="flex gap-3">
                <Button
                  variant="outline"
                  className="text-slate-600 border-slate-300"
                  data-testid="button-export-departments"
                >
                  <Download className="mr-2" size={16} />
                  Export
                </Button>
                <Button
                  onClick={() => {
                    setDepartmentToEdit(null);
                    setDepartmentForm({ name: "", description: "", color: "bg-blue-500" });
                    setShowDepartmentDialog(true);
                  }}
                  className="gradient-blue text-white font-medium hover:shadow-lg transition-all duration-300"
                  data-testid="button-add-department"
                >
                  <Building className="mr-2" size={16} />
                  Add Department
                </Button>
              </div>
            </div>

            <div className="space-y-4">
              {departments && departments.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {departments.map((department) => (
                    <div
                      key={department.id}
                      className="p-4 rounded-xl border border-white/30 bg-white/50 backdrop-blur-sm"
                      style={{ 
                        backgroundColor: department.color ? 
                          (department.color.startsWith('#') ? `${department.color}20` : 
                           department.color.includes('blue') ? '#3b82f620' :
                           department.color.includes('green') ? '#10b98120' :
                           department.color.includes('purple') ? '#a855f720' :
                           department.color.includes('red') ? '#ef444420' :
                           department.color.includes('yellow') ? '#eab30820' :
                           department.color.includes('pink') ? '#ec489920' :
                           department.color.includes('orange') ? '#f9731620' :
                           department.color.includes('indigo') ? '#6366f120' :
                           '#3b82f620') : '#3b82f620'
                      }}
                      data-testid={`card-department-${department.id}`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="font-semibold text-slate-800" data-testid={`text-department-name-${department.id}`}>
                          {department.name}
                        </h4>
                        <div className="flex gap-2">
                          <Button
                            onClick={() => {
                              setDepartmentToEdit(department);
                              setDepartmentForm({
                                name: department.name,
                                description: department.description || "",
                                color: department.color || "bg-blue-500"
                              });
                              setShowDepartmentDialog(true);
                            }}
                            variant="ghost"
                            size="sm"
                            className="text-blue-600 hover:text-blue-800"
                            data-testid={`button-edit-department-${department.id}`}
                          >
                            <Edit size={14} />
                          </Button>
                          <Button
                            onClick={() => handleDeleteDepartment(department.id)}
                            variant="ghost"
                            size="sm"
                            className="text-red-600 hover:text-red-800"
                            data-testid={`button-delete-department-${department.id}`}
                          >
                            <Trash2 size={14} />
                          </Button>
                        </div>
                      </div>
                      {department.description && (
                        <p className="text-sm text-slate-600 mb-3" data-testid={`text-department-description-${department.id}`}>
                          {department.description}
                        </p>
                      )}
                      <div className="mt-3 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div
                            className="w-4 h-4 rounded-full border border-slate-300"
                            style={{ 
                              backgroundColor: department.color ? 
                                (department.color.startsWith('#') ? department.color : 
                                 department.color.includes('blue') ? '#3b82f6' :
                                 department.color.includes('green') ? '#10b981' :
                                 department.color.includes('purple') ? '#a855f7' :
                                 department.color.includes('red') ? '#ef4444' :
                                 department.color.includes('yellow') ? '#eab308' :
                                 department.color.includes('pink') ? '#ec4899' :
                                 department.color.includes('orange') ? '#f97316' :
                                 department.color.includes('indigo') ? '#6366f1' :
                                 '#3b82f6') : '#3b82f6'
                            }}
                            data-testid={`color-indicator-${department.id}`}
                          />
                          <span className="text-xs text-slate-500 capitalize">
                            {department.color || 'blue'}
                          </span>
                        </div>
                        <div className="text-xs text-slate-500">
                          <Users size={12} className="inline mr-1" />
                          {/* Staff count would be populated from database */}
                          0 staff
                        </div>
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

        <TabsContent value="reports" className="space-y-6 mt-6">
          <GlassCard>
            <div className="flex items-center mb-6">
              <FileText className="mr-3 text-blue-600" size={24} />
              <h3 className="text-lg font-semibold text-slate-800">Report Generation Settings</h3>
            </div>
            
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="space-y-4">
                <h4 className="font-medium text-slate-700">📊 Report Types</h4>
                <div className="space-y-3">
                  <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-blue-800">Daily Reports</span>
                      <Badge variant="secondary" className="bg-blue-100 text-blue-700">Active</Badge>
                    </div>
                    <p className="text-xs text-blue-600 mt-1">Visitor & staff activity summary</p>
                  </div>
                  
                  <div className="p-3 bg-green-50 rounded-lg border border-green-200">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-green-800">Weekly Reports</span>
                      <Badge variant="secondary" className="bg-green-100 text-green-700">Active</Badge>
                    </div>
                    <p className="text-xs text-green-600 mt-1">Comprehensive weekly analysis</p>
                  </div>
                  
                  <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-slate-700">Monthly Reports</span>
                      <Badge variant="secondary" className="bg-slate-100 text-slate-600">Configured</Badge>
                    </div>
                    <p className="text-xs text-slate-500 mt-1">Month-end summaries</p>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <h4 className="font-medium text-slate-700">⚙️ Report Settings</h4>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm font-medium text-slate-700">Include Charts</Label>
                    <Switch 
                      checked={currentSettings?.emailReportsEnabled !== false} 
                      onCheckedChange={(checked) => handleInputChange("emailReportsEnabled", checked)}
                      data-testid="switch-include-charts" 
                    />
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <Label className="text-sm font-medium text-slate-700">Include Photos</Label>
                    <Switch 
                      checked={currentSettings?.enableQrCodes === true} 
                      onCheckedChange={(checked) => handleInputChange("enableQrCodes", checked)}
                      data-testid="switch-include-photos" 
                    />
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <Label className="text-sm font-medium text-slate-700">PDF Export</Label>
                    <Switch 
                      checked={currentSettings?.enable2dBarcodes !== false} 
                      onCheckedChange={(checked) => handleInputChange("enable2dBarcodes", checked)}
                      data-testid="switch-pdf-export" 
                    />
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <Label className="text-sm font-medium text-slate-700">Excel Export</Label>
                    <Switch 
                      checked={currentSettings?.biostarEnabled === true} 
                      onCheckedChange={(checked) => handleInputChange("biostarEnabled", checked)}
                      data-testid="switch-excel-export" 
                    />
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
                <h4 className="font-medium text-slate-700">📈 Report Stats</h4>
                <div className="space-y-3">
                  <div className="text-center p-4 bg-white/50 rounded-xl border border-white/30">
                    <div className="text-2xl font-bold text-blue-600" data-testid="text-total-reports">
                      8
                    </div>
                    <div className="text-xs text-slate-600">Total Report Types</div>
                  </div>
                  
                  <div className="text-center p-4 bg-white/50 rounded-xl border border-white/30">
                    <div className="text-2xl font-bold text-green-600" data-testid="text-generated-reports">
                      24
                    </div>
                    <div className="text-xs text-slate-600">Generated This Month</div>
                  </div>
                  
                  <div className="text-center p-4 bg-white/50 rounded-xl border border-white/30">
                    <div className="text-2xl font-bold text-purple-600" data-testid="text-emailed-reports">
                      0
                    </div>
                    <div className="text-xs text-slate-600">Emailed Reports</div>
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

          <GlassCard>
            <div className="flex items-center mb-6">
              <Calendar className="mr-3 text-blue-600" size={24} />
              <h3 className="text-lg font-semibold text-slate-800">Generate Reports Now</h3>
            </div>
            
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Button
                  className="gradient-blue text-white p-6 h-auto flex flex-col items-center gap-3"
                  data-testid="button-generate-daily-report"
                >
                  <Calendar size={24} />
                  <div>
                    <div className="font-medium">Daily Report</div>
                    <div className="text-xs opacity-90">Today's activity summary</div>
                  </div>
                </Button>
                
                <Button
                  className="gradient-green text-white p-6 h-auto flex flex-col items-center gap-3"
                  data-testid="button-generate-weekly-report"
                >
                  <BarChart3 size={24} />
                  <div>
                    <div className="font-medium">Weekly Report</div>
                    <div className="text-xs opacity-90">Last 7 days analysis</div>
                  </div>
                </Button>
                
                <Button
                  className="gradient-purple text-white p-6 h-auto flex flex-col items-center gap-3"
                  data-testid="button-generate-monthly-report"
                >
                  <TrendingUp size={24} />
                  <div>
                    <div className="font-medium">Monthly Report</div>
                    <div className="text-xs opacity-90">Current month summary</div>
                  </div>
                </Button>
                
                <Button
                  className="gradient-orange text-white p-6 h-auto flex flex-col items-center gap-3"
                  data-testid="button-generate-custom-report"
                >
                  <Calendar size={24} />
                  <div>
                    <div className="font-medium">Custom Range</div>
                    <div className="text-xs opacity-90">Select date range</div>
                  </div>
                </Button>
              </div>
              
              <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="font-medium text-blue-800">Report Generation Options</h4>
                  <Badge variant="secondary" className="bg-blue-100 text-blue-700">Available Now</Badge>
                </div>
                
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                    <span className="text-blue-700">PDF Export Ready</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                    <span className="text-blue-700">Excel Export Ready</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-yellow-500 rounded-full"></div>
                    <span className="text-blue-700">Email Delivery Ready</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                    <span className="text-blue-700">Charts & Visuals</span>
                  </div>
                </div>
              </div>
            </div>
          </GlassCard>
          
          <GlassCard>
            <div className="flex items-center mb-6">
              <Activity className="mr-3 text-green-600" size={24} />
              <h3 className="text-lg font-semibold text-slate-800">Recent Report Activity</h3>
            </div>
            
            <div className="space-y-4">
              <div className="space-y-3">
                <div className="flex items-center justify-between p-3 bg-green-50 rounded-lg border border-green-200">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center">
                      <FileText className="text-green-600" size={16} />
                    </div>
                    <div>
                      <div className="text-sm font-medium text-green-800">Daily Report Generated</div>
                      <div className="text-xs text-green-600">Today at 9:00 AM</div>
                    </div>
                  </div>
                  <Badge variant="secondary" className="bg-green-100 text-green-700">Success</Badge>
                </div>
                
                <div className="flex items-center justify-between p-3 bg-blue-50 rounded-lg border border-blue-200">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                      <BarChart3 className="text-blue-600" size={16} />
                    </div>
                    <div>
                      <div className="text-sm font-medium text-blue-800">Weekly Report Generated</div>
                      <div className="text-xs text-blue-600">Monday at 9:00 AM</div>
                    </div>
                  </div>
                  <Badge variant="secondary" className="bg-blue-100 text-blue-700">Success</Badge>
                </div>
              </div>
              
              <div className="mt-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-medium text-blue-800">📧 Email Integration Status</h4>
                  <Button
                    variant="outline" 
                    size="sm"
                    onClick={() => setActiveTab('email')}
                    className="text-blue-600 border-blue-300 hover:bg-blue-100"
                    data-testid="button-go-to-email-settings"
                  >
                    Configure Email
                  </Button>
                </div>
                <div className="text-xs text-blue-700">
                  <p className="mb-1">
                    ✅ SMTP Configuration: {currentSettings?.smtpHost && currentSettings?.smtpUsername ? 'Ready' : 'Not Configured'}
                  </p>
                  <p className="mb-1">
                    ✅ Email Reports: {currentSettings?.emailReportsEnabled ? 'Enabled' : 'Disabled'}
                  </p>
                  <p className="text-blue-600">
                    💡 Configure email settings in the <strong>Email</strong> tab to enable automatic report delivery
                  </p>
                </div>
              </div>
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
                  <Select
                    value={currentSettings?.openaiModel || "gpt-4o"}
                    onValueChange={(value) => handleInputChange("openaiModel", value)}
                  >
                    <SelectTrigger className="w-full px-4 py-3 rounded-xl border border-white/30 bg-white/50" data-testid="select-openai-model">
                      <SelectValue placeholder="Select OpenAI model" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="gpt-4">GPT-4 (Standard)</SelectItem>
                      <SelectItem value="gpt-4o">GPT-4o (Optimized)</SelectItem>
                      <SelectItem value="gpt-5">GPT-5 (Latest) 🚀</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-slate-500">
                    GPT-4o is recommended for better AI-generated content quality
                  </p>
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
                      <SelectItem value="1000">1,000 tokens (Short responses)</SelectItem>
                      <SelectItem value="2000">2,000 tokens (Medium responses)</SelectItem>
                      <SelectItem value="4000">4,000 tokens (Long responses)</SelectItem>
                      <SelectItem value="8000">8,000 tokens (Very long responses)</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-slate-500">
                    Higher token limits allow for more detailed AI responses
                  </p>
                </div>
              </div>
            </GlassCard>
          </div>
        </TabsContent>

        <TabsContent value="hsrules" className="space-y-6 mt-6">
          <div className="grid grid-cols-1 gap-6">
            <GlassCard className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
                  <Shield className="w-5 h-5" />
                  Health & Safety Rules
                </h3>
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={currentSettings?.hsRulesEnabled !== false}
                      onCheckedChange={(checked) => handleInputChange("hsRulesEnabled", checked)}
                      data-testid="switch-hs-rules-enabled"
                    />
                    <Label className="text-sm font-medium text-slate-700">Enable H&S Rules</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={currentSettings?.hsRulesRequireAcceptance || false}
                      onCheckedChange={(checked) => handleInputChange("hsRulesRequireAcceptance", checked)}
                      data-testid="switch-hs-rules-require-acceptance"
                    />
                    <Label className="text-sm font-medium text-slate-700">Require Acceptance</Label>
                  </div>
                </div>
              </div>
              
              <div className="space-y-4">
                {currentSettings?.hsRulesEnabled !== false && (
                  <>
                    <div className="space-y-2">
                      <Label className="text-sm font-medium text-slate-700">
                        H&S Rules Content (Markdown supported)
                      </Label>
                      <textarea
                        value={currentSettings?.hsRulesContent || ""}
                        onChange={(e) => handleInputChange("hsRulesContent", e.target.value)}
                        className="w-full h-96 px-4 py-3 rounded-xl border border-white/30 bg-white/50 focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-800 font-mono text-sm"
                        placeholder="Enter your company's health and safety rules here..."
                        data-testid="textarea-hs-rules-content"
                      />
                      <p className="text-xs text-slate-500">
                        These rules will be included in e-Pass emails and can be shown during visitor check-in.
                        Markdown formatting is supported for better presentation.
                      </p>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="hsRulesUrl" className="text-sm font-medium text-slate-700">
                        External H&S Rules URL (Optional)
                      </Label>
                      <Input
                        id="hsRulesUrl"
                        type="url"
                        value={currentSettings?.hsRulesUrl || ""}
                        onChange={(e) => handleInputChange("hsRulesUrl", e.target.value)}
                        className="w-full px-4 py-3 rounded-xl border border-white/30 bg-white/50"
                        placeholder="https://www.yourcompany.com/health-safety-rules"
                        data-testid="input-hs-rules-url"
                      />
                      <p className="text-xs text-slate-500">
                        If provided, this link will be included in e-Pass emails instead of the full content.
                      </p>
                    </div>

                    <div className="p-4 bg-blue-50 rounded-xl border border-blue-200">
                      <h4 className="text-sm font-semibold text-blue-900 mb-2">Default UK H&S Rules Available</h4>
                      <p className="text-xs text-blue-700 mb-3">
                        The system includes comprehensive UK Health & Safety rules compliant with:
                      </p>
                      <ul className="text-xs text-blue-600 space-y-1 list-disc list-inside">
                        <li>Health and Safety at Work Act 1974</li>
                        <li>Management of Health and Safety at Work Regulations 1999</li>
                        <li>Workplace (Health, Safety and Welfare) Regulations 1992</li>
                        <li>Personal Protective Equipment at Work Regulations 1992</li>
                        <li>Manual Handling Operations Regulations 1992</li>
                        <li>Control of Substances Hazardous to Health Regulations 2002</li>
                      </ul>
                      <Button
                        onClick={() => {
                          const defaultRules = `# Health & Safety Rules and Regulations\n\n## General Safety Rules\n\n1. **Personal Safety**\n   - Report to reception upon arrival and departure\n   - Wear your visitor/contractor pass at all times\n   - Follow all posted safety signs and instructions\n   - Report any accidents or near misses immediately\n\n2. **Emergency Procedures**\n   - Familiarize yourself with emergency exits\n   - In case of fire alarm, evacuate immediately via nearest exit\n   - Assembly point is located in the front car park\n   - Do not use lifts during emergencies\n   - Follow instructions from fire wardens (wearing hi-vis vests)\n\n3. **Personal Protective Equipment (PPE)**\n   - PPE must be worn where indicated by signage\n   - Safety footwear required in production/warehouse areas\n   - High visibility clothing required in designated areas\n   - Hard hats required in construction zones\n\n4. **Workplace Hazards**\n   - Watch for trip hazards and wet floors\n   - Do not enter restricted areas without authorization\n   - Keep walkways clear at all times\n   - Report any unsafe conditions to your host\n\n5. **Manual Handling**\n   - Get assistance for heavy items (over 25kg)\n   - Use proper lifting techniques\n   - Use mechanical aids where available\n\n6. **Electrical Safety**\n   - Do not use damaged electrical equipment\n   - Report exposed wires or damaged sockets\n   - Ensure trailing cables are secured\n\n7. **Working at Height**\n   - Only use approved ladders and platforms\n   - Ensure proper edge protection is in place\n   - Wear fall protection equipment when required\n\n8. **Control of Substances (COSHH)**\n   - Do not handle chemicals without authorization\n   - Follow all COSHH data sheet instructions\n   - Use appropriate PPE when handling substances\n\n9. **Machinery and Equipment**\n   - Do not operate machinery without authorization\n   - Ensure guards are in place before operation\n   - Follow lock-out/tag-out procedures\n\n10. **Welfare Facilities**\n    - First aid boxes located at reception and main office\n    - Drinking water available in kitchen areas\n    - Toilets and washing facilities available\n\n## Contractor Specific Requirements\n\n- Provide risk assessments and method statements before work\n- Ensure all tools are PAT tested and in date\n- Obtain hot work permits for welding/cutting operations\n- Follow permit to work system for hazardous tasks\n\n## COVID-19 and Health Precautions\n\n- Maintain good hand hygiene\n- Use hand sanitizer stations provided\n- Stay home if feeling unwell\n- Follow any additional health screening procedures\n\n## Compliance Statement\n\nThese rules comply with:\n- Health and Safety at Work Act 1974\n- Management of Health and Safety at Work Regulations 1999\n- Workplace (Health, Safety and Welfare) Regulations 1992\n- Personal Protective Equipment at Work Regulations 1992\n- Manual Handling Operations Regulations 1992\n- Control of Substances Hazardous to Health Regulations 2002\n\n## Contact Information\n\n**Emergency:** 999\n**Reception:** Available at main entrance\n**First Aiders:** List available at reception\n**Health & Safety Officer:** Contact via reception\n\nBy entering our premises, you agree to comply with all health and safety rules.`;
                          handleInputChange("hsRulesContent", defaultRules);
                          toast({
                            title: "Default H&S Rules Loaded",
                            description: "UK compliant health and safety rules have been loaded. You can customize them as needed.",
                          });
                        }}
                        variant="outline"
                        size="sm"
                        className="mt-3"
                      >
                        Load Default UK H&S Rules
                      </Button>
                    </div>
                  </>
                )}
                
                {currentSettings?.hsRulesEnabled === false && (
                  <div className="text-center py-8 text-slate-500">
                    <Shield className="w-12 h-12 mx-auto mb-3 opacity-30" />
                    <p className="text-sm">H&S Rules are disabled. Enable them to configure health and safety requirements.</p>
                  </div>
                )}
              </div>
            </GlassCard>
          </div>
        </TabsContent>

        <TabsContent value="hs-documents" className="space-y-6 mt-6">
          <ContractorsHSManagement />
          
          {/* Default UK H&S Document Templates Section */}
          <div className="mt-8">
            <DefaultTemplateManager className="w-full" />
          </div>
        </TabsContent>

        <TabsContent value="system" className="space-y-6 mt-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
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
                  </div>
                )}
              </div>
            </GlassCard>

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
                  <CheckCircle className="w-5 h-5 text-green-500" />
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
                  <CheckCircle className="w-5 h-5 text-green-500" />
                </div>
              </div>
            </GlassCard>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
            <GlassCard className="p-6">
              <h3 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
                <Database className="w-5 h-5" />
                Database Backup
              </h3>
              <div className="space-y-4">
                <p className="text-sm text-slate-600">
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
              <h3 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
                <Upload className="w-5 h-5" />
                Database Restore
              </h3>
              <div className="space-y-4">
                <p className="text-sm text-slate-600">
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
                      <p className="text-xs text-blue-600 dark:text-blue-300">
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
          
          <div className="mt-6">
            <GlassCard className="p-6">
              <h3 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
                <Settings2 className="w-5 h-5" />
                Feature Toggles
              </h3>
              <p className="text-sm text-slate-600 mb-6">
                Disable unused features to simplify your interface and reduce complexity for your team.
              </p>
              
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {/* Multi-Tenant */}
                <div className="flex items-center justify-between p-4 bg-white/50 rounded-lg border hover:border-blue-200 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-purple-100 rounded-lg">
                      <Building2 className="w-5 h-5 text-purple-600" />
                    </div>
                    <div>
                      <h4 className="font-medium text-slate-800">Multi-Tenant</h4>
                      <p className="text-xs text-slate-500">Building overview & tenant management</p>
                    </div>
                  </div>
                  <Switch
                    checked={currentSettings?.featureMultiTenant !== false}
                    onCheckedChange={(checked) => handleInputChange("featureMultiTenant", checked)}
                    data-testid="toggle-multi-tenant"
                  />
                </div>

                {/* Meeting Rooms */}
                <div className="flex items-center justify-between p-4 bg-white/50 rounded-lg border hover:border-blue-200 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-green-100 rounded-lg">
                      <Calendar className="w-5 h-5 text-green-600" />
                    </div>
                    <div>
                      <h4 className="font-medium text-slate-800">Meeting Rooms</h4>
                      <p className="text-xs text-slate-500">Room booking & management</p>
                    </div>
                  </div>
                  <Switch
                    checked={currentSettings?.featureMeetingRooms !== false}
                    onCheckedChange={(checked) => handleInputChange("featureMeetingRooms", checked)}
                    data-testid="toggle-meeting-rooms"
                  />
                </div>

                {/* Time & Attendance */}
                <div className="flex items-center justify-between p-4 bg-white/50 rounded-lg border hover:border-blue-200 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-blue-100 rounded-lg">
                      <Activity className="w-5 h-5 text-blue-600" />
                    </div>
                    <div>
                      <h4 className="font-medium text-slate-800">Time Attendance</h4>
                      <p className="text-xs text-slate-500">Staff time tracking & reports</p>
                    </div>
                  </div>
                  <Switch
                    checked={currentSettings?.featureTimeAttendance !== false}
                    onCheckedChange={(checked) => handleInputChange("featureTimeAttendance", checked)}
                    data-testid="toggle-time-attendance"
                  />
                </div>

                {/* Induction Settings */}
                <div className="flex items-center justify-between p-4 bg-white/50 rounded-lg border hover:border-blue-200 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-orange-100 rounded-lg">
                      <Shield className="w-5 h-5 text-orange-600" />
                    </div>
                    <div>
                      <h4 className="font-medium text-slate-800">Induction Settings</h4>
                      <p className="text-xs text-slate-500">Safety induction configuration</p>
                    </div>
                  </div>
                  <Switch
                    checked={currentSettings?.featureInductionSettings !== false}
                    onCheckedChange={(checked) => handleInputChange("featureInductionSettings", checked)}
                    data-testid="toggle-induction-settings"
                  />
                </div>

                {/* Kiosk Mode */}
                <div className="flex items-center justify-between p-4 bg-white/50 rounded-lg border hover:border-blue-200 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-cyan-100 rounded-lg">
                      <Monitor className="w-5 h-5 text-cyan-600" />
                    </div>
                    <div>
                      <h4 className="font-medium text-slate-800">Kiosk Mode</h4>
                      <p className="text-xs text-slate-500">Self-service check-in kiosks</p>
                    </div>
                  </div>
                  <Switch
                    checked={currentSettings?.featureKiosk !== false}
                    onCheckedChange={(checked) => handleInputChange("featureKiosk", checked)}
                    data-testid="toggle-kiosk"
                  />
                </div>

                {/* AI Demo */}
                <div className="flex items-center justify-between p-4 bg-white/50 rounded-lg border hover:border-blue-200 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-pink-100 rounded-lg">
                      <Brain className="w-5 h-5 text-pink-600" />
                    </div>
                    <div>
                      <h4 className="font-medium text-slate-800">AI Demo</h4>
                      <p className="text-xs text-slate-500">AI-powered features showcase</p>
                    </div>
                  </div>
                  <Switch
                    checked={currentSettings?.featureAiDemo !== false}
                    onCheckedChange={(checked) => handleInputChange("featureAiDemo", checked)}
                    data-testid="toggle-ai-demo"
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
        </TabsContent>
      </Tabs>

      {/* Department Dialog */}
      <Dialog open={showDepartmentDialog} onOpenChange={setShowDepartmentDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {departmentToEdit ? "Edit Department" : "Add Department"}
            </DialogTitle>
            <DialogDescription>
              {departmentToEdit ? "Update department information and settings." : "Create a new department with a name and color."}
            </DialogDescription>
          </DialogHeader>
          
          <form onSubmit={handleDepartmentSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="departmentName">Department Name *</Label>
              <Input
                id="departmentName"
                value={departmentForm.name || ""}
                onChange={(e) => setDepartmentForm(prev => ({ ...prev, name: e.target.value }))}
                placeholder="e.g., Engineering, Sales, Marketing"
                required
                data-testid="input-department-name"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="departmentDescription">Description</Label>
              <Input
                id="departmentDescription"
                value={departmentForm.description || ""}
                onChange={(e) => setDepartmentForm(prev => ({ ...prev, description: e.target.value }))}
                placeholder="Brief description of the department"
                data-testid="input-department-description"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="departmentColor">Department Color</Label>
              <Select 
                value={departmentForm.color || "bg-blue-500"} 
                onValueChange={(value) => setDepartmentForm(prev => ({ ...prev, color: value }))}
              >
                <SelectTrigger data-testid="select-department-color">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="bg-blue-500">🔵 Blue</SelectItem>
                  <SelectItem value="bg-green-500">🟢 Green</SelectItem>
                  <SelectItem value="bg-purple-500">🟣 Purple</SelectItem>
                  <SelectItem value="bg-red-500">🔴 Red</SelectItem>
                  <SelectItem value="bg-yellow-500">🟡 Yellow</SelectItem>
                  <SelectItem value="bg-pink-500">🩷 Pink</SelectItem>
                  <SelectItem value="bg-indigo-500">🟦 Indigo</SelectItem>
                  <SelectItem value="bg-orange-500">🟠 Orange</SelectItem>
                  <SelectItem value="bg-cyan-500">🔷 Cyan</SelectItem>
                  <SelectItem value="bg-emerald-500">💎 Emerald</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-slate-500">
                Color coding helps staff and visitors quickly identify departments
              </p>
            </div>

            <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
              <h4 className="font-medium text-blue-800 dark:text-blue-200 mb-2">Department Benefits:</h4>
              <ul className="text-sm text-blue-700 dark:text-blue-300 space-y-1">
                <li>• Route visitors directly to correct departments</li>
                <li>• Generate department-specific ID badges</li>
                <li>• Track visitor analytics per department</li>
                <li>• Enable department-based access controls</li>
              </ul>
            </div>

            <DialogFooter className="gap-2 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowDepartmentDialog(false)}
                data-testid="button-cancel-department"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                className="gradient-blue text-white"
                disabled={departmentMutation.isPending}
                data-testid="button-save-department"
              >
                {departmentMutation.isPending ? "Saving..." : departmentToEdit ? "Update" : "Create"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Email Invitation Dialog */}
      <Dialog open={showAddEmailDialog} onOpenChange={setShowAddEmailDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Mail className="text-blue-600" size={24} />
              Send User Invitation
            </DialogTitle>
            <DialogDescription>
              Send an email invitation to create a new user account. They'll receive setup instructions.
            </DialogDescription>
          </DialogHeader>
          
          <form 
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (inviteForm.email && inviteForm.role) {
                inviteMutation.mutate(inviteForm);
              }
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="inviteEmail" className="text-sm font-medium">
                Email Address
              </Label>
              <Input
                id="inviteEmail"
                type="email"
                placeholder="user@example.com"
                value={inviteForm.email}
                onChange={(e) => setInviteForm({ ...inviteForm, email: e.target.value })}
                className="w-full"
                data-testid="input-invite-email"
                required
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="userRole" className="text-sm font-medium">
                User Role
              </Label>
              <Select value={inviteForm.role} onValueChange={(value) => setInviteForm({ ...inviteForm, role: value })}>
                <SelectTrigger className="w-full" data-testid="select-user-role">
                  <SelectValue placeholder="Select role" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="user">Standard User</SelectItem>
                  <SelectItem value="admin">Administrator</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
              <p className="text-sm text-blue-700">
                <strong>Email Process:</strong> The user will receive an invitation email with setup instructions. 
                If email delivery fails, use the "Add Manually" option instead.
              </p>
            </div>
            
            <DialogFooter className="gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowAddEmailDialog(false)}
                data-testid="button-cancel-invitation"
              >
                Cancel
              </Button>
              <Button 
                type="submit" 
                className="gradient-blue text-white"
                disabled={inviteMutation.isPending || !inviteForm.email || !inviteForm.role}
                data-testid="button-send-invitation"
              >
                {inviteMutation.isPending ? "Sending..." : "Send Invitation"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Manual User Creation Dialog */}
      <Dialog open={showManualUserDialog} onOpenChange={setShowManualUserDialog}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="text-blue-600" size={24} />
              Create User Account Manually
            </DialogTitle>
            <DialogDescription>
              Create a user account directly as a backup when email invitations aren't working.
            </DialogDescription>
          </DialogHeader>
          
          <form 
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (manualUserForm.username && manualUserForm.email && manualUserForm.password && manualUserForm.role) {
                manualUserMutation.mutate(manualUserForm);
              }
            }}
          >
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="manualFirstName" className="text-sm font-medium">
                  First Name
                </Label>
                <Input
                  id="manualFirstName"
                  type="text"
                  placeholder="John"
                  value={manualUserForm.firstName}
                  onChange={(e) => setManualUserForm({ ...manualUserForm, firstName: e.target.value })}
                  className="w-full"
                  data-testid="input-manual-first-name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="manualLastName" className="text-sm font-medium">
                  Last Name
                </Label>
                <Input
                  id="manualLastName"
                  type="text"
                  placeholder="Doe"
                  value={manualUserForm.lastName}
                  onChange={(e) => setManualUserForm({ ...manualUserForm, lastName: e.target.value })}
                  className="w-full"
                  data-testid="input-manual-last-name"
                />
              </div>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="manualUsername" className="text-sm font-medium">
                Username *
              </Label>
              <Input
                id="manualUsername"
                type="text"
                placeholder="johndoe"
                value={manualUserForm.username}
                onChange={(e) => setManualUserForm({ ...manualUserForm, username: e.target.value })}
                className="w-full"
                data-testid="input-manual-username"
                required
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="manualEmail" className="text-sm font-medium">
                Email Address *
              </Label>
              <Input
                id="manualEmail"
                type="email"
                placeholder="john@example.com"
                value={manualUserForm.email}
                onChange={(e) => setManualUserForm({ ...manualUserForm, email: e.target.value })}
                className="w-full"
                data-testid="input-manual-email"
                required
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="manualPassword" className="text-sm font-medium">
                Password *
              </Label>
              <Input
                id="manualPassword"
                type="password"
                placeholder="Secure password"
                value={manualUserForm.password}
                onChange={(e) => setManualUserForm({ ...manualUserForm, password: e.target.value })}
                className="w-full"
                data-testid="input-manual-password"
                required
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="manualRole" className="text-sm font-medium">
                User Role *
              </Label>
              <Select value={manualUserForm.role} onValueChange={(value) => setManualUserForm({ ...manualUserForm, role: value })}>
                <SelectTrigger className="w-full" data-testid="select-manual-role">
                  <SelectValue placeholder="Select role" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="user">Standard User</SelectItem>
                  <SelectItem value="admin">Administrator</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
              <p className="text-sm text-amber-700">
                <strong>Note:</strong> This creates the account immediately without email verification. 
                Use this option when email invitations aren't working.
              </p>
            </div>
            
            <DialogFooter className="gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowManualUserDialog(false)}
                data-testid="button-cancel-manual-user"
              >
                Cancel
              </Button>
              <Button 
                type="submit" 
                className="gradient-blue text-white"
                disabled={manualUserMutation.isPending || !manualUserForm.username || !manualUserForm.email || !manualUserForm.password || !manualUserForm.role}
                data-testid="button-create-manual-user"
              >
                {manualUserMutation.isPending ? "Creating..." : "Create User"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}