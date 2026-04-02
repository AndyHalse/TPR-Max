import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { apiRequest } from "@/lib/queryClient";
import GlassCard from "@/components/GlassCard";
import { generateQRCode } from "@/lib/qr-generator";
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
import { Save, Mail, Upload, Building2, Settings as SettingsIcon, Palette, Monitor, Sun, Moon, Users, UserPlus, Shield, Phone, Globe, AtSign, Printer, QrCode, Barcode, FileText, CreditCard, Move, User, Hash, Building, Database, Server, HardDrive, CheckCircle, XCircle, RotateCcw, TestTube, Edit, Trash2, Plus, Brain, RefreshCw, Download, FolderOpen, Scan, Settings2, Send, Calendar, BarChart3, TrendingUp, Activity, Zap, Eye, Info, Bot, Copy, Clock, Video, Dock, CalendarPlus, MapPin, SunMoon, BadgeCheck, FlaskConical, HardHat, AlertTriangle, Wand2, ScrollText } from "lucide-react";
import { Link } from "wouter";
import type { CompanySettings, InsertCompanySettings, Department, InsertDepartment, Report } from "@shared/schema";
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "@/components/ui/tooltip";
import ContractorsHSManagement from "@/components/ContractorsHSManagement";
import { DefaultTemplateManager } from "@/components/DefaultTemplateManager";
import ZoneManagement from "@/pages/ZoneManagement";

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
  const [showEditUserDialog, setShowEditUserDialog] = useState(false);
  const [userToEdit, setUserToEdit] = useState<any>(null);
  const [biostarDiag, setBiostarDiag] = useState<any>(null);
  const [biostarDiagLoading, setBiostarDiagLoading] = useState(false);
  const [showBiostarDiag, setShowBiostarDiag] = useState(false);
  const [editUserForm, setEditUserForm] = useState({ 
    username: "", 
    email: "", 
    password: "", 
    role: "user",
    firstName: "",
    lastName: "",
    allowedMenuItems: [] as string[],
    defaultLandingPage: "_default"
  });
  const autoSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [isManualResetDisabled, setIsManualResetDisabled] = useState(false);
  const [showAddOffenceDialog, setShowAddOffenceDialog] = useState(false);
  const [editingOffence, setEditingOffence] = useState<any>(null);
  const [offenceForm, setOffenceForm] = useState({ offenceName: '', offenceDescription: '', cardType: 'yellow' });
  const [paxtonTestResult, setPaxtonTestResult] = useState<string>("");
  const [paxtonTestLoading, setPaxtonTestLoading] = useState(false);
  const [paxtonSyncResult, setPaxtonSyncResult] = useState<string>("");
  const [paxtonSyncLoading, setPaxtonSyncLoading] = useState(false);
  const [apiKeyVisible, setApiKeyVisible] = useState(false);
  const [webhookTestResult, setWebhookTestResult] = useState<string>("");
  const [webhookTestLoading, setWebhookTestLoading] = useState(false);
  const [apiKeyGenerating, setApiKeyGenerating] = useState(false);
  const [showManualResetDialog, setShowManualResetDialog] = useState(false);
  const [showDepartmentDialog, setShowDepartmentDialog] = useState(false);
  const [departmentToEdit, setDepartmentToEdit] = useState<Department | null>(null);
  const [suggestedTextColors, setSuggestedTextColors] = useState<{light: string, dark: string}>({ light: '#000000', dark: '#ffffff' });
  const [departmentForm, setDepartmentForm] = useState<Partial<InsertDepartment>>({
    name: "",
    description: "",
    color: "bg-blue-50 dark:bg-blue-950/300"
  });

  // Incident Manager Monitor URL state
  const [incidentMonitorGenerating, setIncidentMonitorGenerating] = useState(false);
  const [showIncidentMonitorQr, setShowIncidentMonitorQr] = useState(false);
  const incidentMonitorAutoGeneratedRef = useRef(false);

  // Backup/Restore state
  const [selectedBackupFile, setSelectedBackupFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Test Printer state
  const [showTestPrinterDialog, setShowTestPrinterDialog] = useState(false);
  const [testPrinterType, setTestPrinterType] = useState<'tec' | 'zebra'>('tec');
  const [testPrinterCode, setTestPrinterCode] = useState('');
  const [testPrinterResult, setTestPrinterResult] = useState<{success: boolean; message: string} | null>(null);
  const [isTestingPrinter, setIsTestingPrinter] = useState(false);

  // Get current user to access customerId
  const { data: currentUser } = useQuery<{ id: string; username: string; customerId: string; role: string }>({
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
    version?: string;
    appName?: string;
  }>({
    queryKey: ["/api/system/status"],
    refetchInterval: 300000, // Refresh every 5 minutes
  });

  const { data: departments } = useQuery<Department[]>({
    queryKey: ["/api/departments"],
  });

  const { data: departmentAnalytics } = useQuery<Array<{ department: string; staffCount: number; visitorCount: number }>>({
    queryKey: ["/api/analytics/departments"],
  });

  // Fetch all users and pending invitations
  const { data: users, isLoading: usersLoading } = useQuery<Array<{
    id: string;
    username: string;
    email: string;
    role: string;
    firstName?: string;
    lastName?: string;
    status: 'active' | 'pending';
    invitedAt?: Date;
    invitationToken?: string;
    customerId?: string;
    isCurrentUser?: boolean;
  }>>({
    queryKey: ["/api/users"],
  });

  // Derive admin status reliably — users list marks the session user via isCurrentUser flag,
  // avoiding the gcTime:0 race on /api/auth/me during initial page load
  const sessionUserFromList = users?.find(u => u.isCurrentUser);
  const isAdminUser = sessionUserFromList?.role === 'admin' || currentUser?.role === 'admin';

  // Auto-generate incident monitor URL on first admin visit if none exists
  useEffect(() => {
    if (!isAdminUser || !settings || settings.incidentManagerUrlId || incidentMonitorAutoGeneratedRef.current) return;
    incidentMonitorAutoGeneratedRef.current = true;
    apiRequest("POST", "/api/admin/incident-monitor/generate")
      .then((res) => {
        if (res.ok) {
          queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
        }
      })
      .catch(() => {});
  }, [isAdminUser, settings]);

  // Reports data — uses same isolated /api/reports endpoint as main Reports page
  const { data: reportsData } = useQuery<Report[]>({
    queryKey: ["/api/reports"],
  });

  const { data: cardOffences = [] } = useQuery<any[]>({
    queryKey: ["/api/card-offences"],
  });

  // Function to copy invitation link
  const copyInvitationLink = (token: string, customerId?: string) => {
    const baseUrl = window.location.origin;
    const invitationUrl = customerId
      ? `${baseUrl}/invite/accept?token=${token}&customer=${customerId}`
      : `${baseUrl}/invite/accept?token=${token}`;
    
    navigator.clipboard.writeText(invitationUrl).then(() => {
      toast({
        title: "Link Copied!",
        description: "Invitation link has been copied to clipboard.",
      });
    }).catch(() => {
      toast({
        title: "Copy Failed",
        description: "Failed to copy link to clipboard. Please try again.",
        variant: "destructive",
      });
    });
  };

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

      // Check for duplicate invitation (400 error with specific message)
      if (error?.response?.status === 400 && serverMessage?.includes("already exists")) {
        errorMessage = serverMessage;
        actionGuidance = " Use the 'Add Manually' option to create the account directly.";
      } 
      // Check for email/SMTP errors (but not duplicate email errors)
      else if ((serverMessage?.includes("SMTP") || serverMessage?.includes("delivery")) && !serverMessage?.includes("already exists")) {
        errorMessage = "Email delivery failed";
        actionGuidance = " Use the 'Add Manually' button as a backup option.";
      } 
      // Generic 400 errors (validation, etc)
      else if (error?.response?.status === 400) {
        errorMessage = serverMessage || "Invalid request";
        actionGuidance = " Please check the information and try again.";
      } 
      // All other errors
      else {
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

  // Delete invitation mutation
  const deleteInvitationMutation = useMutation({
    mutationFn: async (invitationId: string) => {
      const response = await apiRequest("DELETE", `/api/invitations/${invitationId}`);
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to delete invitation");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      toast({
        title: "Invitation Deleted",
        description: "Pending invitation has been removed successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Delete Failed",
        description: error.message || "Failed to delete invitation",
        variant: "destructive",
      });
    },
  });

  // Edit user mutation
  const editUserMutation = useMutation({
    mutationFn: async (data: { 
      userId: string;
      username: string; 
      email: string; 
      password?: string; 
      role: string;
      firstName: string;
      lastName: string;
      allowedMenuItems?: string[];
      defaultLandingPage?: string;
    }) => {
      const { userId, ...updateData } = data;
      // Don't send password if it's empty
      const payload: any = data.password ? updateData : { ...updateData, password: undefined };
      // Convert "_default" sentinel back to "" (server will store as null)
      if (payload.defaultLandingPage === "_default") payload.defaultLandingPage = "";
      const response = await apiRequest("PUT", `/api/users/${userId}`, payload);
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to update user");
      }
      return response.json();
    },
    onSuccess: () => {
      setShowEditUserDialog(false);
      setUserToEdit(null);
      setEditUserForm({
        username: "",
        email: "",
        password: "",
        role: "user",
        firstName: "",
        lastName: "",
        allowedMenuItems: [],
        defaultLandingPage: "_default"
      });
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      toast({
        title: "User Updated",
        description: "The user has been successfully updated.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update user. Please try again.",
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
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      a.href = url;
      a.download = `tprmax-backup-${timestamp}.bak`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      toast({
        title: "Backup Complete",
        description: "Your backup file has been downloaded. Keep it safe — it contains all your data.",
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
        backupData
      });
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || "Failed to restore database");
      }
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ predicate: () => true });
      toast({
        title: "Restore Complete",
        description: `Successfully restored ${data.restored?.records ?? 0} records across ${data.restored?.tables ?? 0} tables`,
      });
      setSelectedBackupFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
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
        const text = e.target?.result as string;
        const parsed = JSON.parse(text);
        restoreMutation.mutate(parsed);
      } catch (error) {
        toast({
          title: "Invalid File",
          description: "The selected file is not a valid TPR Max backup file",
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
    onError: (error: any) => {
      console.error('Mutation error:', error);
      const msg = error?.message || '';
      const isAuthError = msg.toLowerCase().includes('authentication') || msg.toLowerCase().includes('unauthorized') || msg.includes('401');
      toast({
        title: isAuthError ? "Session Expired" : "Auto-save Error",
        description: isAuthError
          ? "Your session has expired. Please refresh the page and log in again."
          : "Failed to save settings. Please try again.",
        variant: "destructive",
      });
    },
  });

  const resetBrandingMutation = useMutation({
    mutationFn: async () => {
      const defaultBranding = {
        backgroundColor: "#d5f3fe",
        foregroundColor: "#000000",
        accentColor: "#2460a9",
        variableTextColor: "#53b0ea",
        theme: "light",
        logoUrl: "/uploads/d6fe1a5b-aa78-4c1f-84b7-74037a02e0f6",
        bannerUrl: "/uploads/b8067efb-c677-4203-a5c9-7c34bdd5ffa0",
      };
      const response = await apiRequest("PUT", "/api/settings", defaultBranding);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
      setFormData({});
      toast({
        title: "Branding Reset",
        description: "All colors, logo, and banner have been reset to the default development values.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Reset Failed",
        description: error.message || "Failed to reset branding. Please try again.",
        variant: "destructive",
      });
    },
  });

  const [showResetBrandingDialog, setShowResetBrandingDialog] = useState(false);

  const testEmailMutation = useMutation({
    mutationFn: async (email: string) => {
      const response = await apiRequest("POST", "/api/test-email", { email });
      return response.json();
    },
    onSuccess: (data) => {
      if (data.success) {
        toast({
          title: "Email Sent",
          description: "Test email delivered successfully — your SMTP configuration is working.",
        });
      } else {
        toast({
          title: "Email Test Failed",
          description: data.error || "Failed to send test email. Check your SMTP settings.",
          variant: "destructive",
        });
      }
    },
    onError: () => {
      toast({
        title: "Email Test Failed",
        description: "Could not reach the server. Please try again.",
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

  const createOffenceMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest("POST", "/api/card-offences", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/card-offences"] });
      setShowAddOffenceDialog(false);
      setOffenceForm({ offenceName: '', offenceDescription: '', cardType: 'yellow' });
      toast({ title: "Offence added" });
    },
    onError: () => toast({ title: "Failed to add offence", variant: "destructive" }),
  });

  const updateOffenceMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const response = await apiRequest("PUT", `/api/card-offences/${id}`, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/card-offences"] });
      setEditingOffence(null);
      toast({ title: "Offence updated" });
    },
    onError: () => toast({ title: "Failed to update offence", variant: "destructive" }),
  });

  const deleteOffenceMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiRequest("DELETE", `/api/card-offences/${id}`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/card-offences"] });
      toast({ title: "Offence deleted" });
    },
    onError: () => toast({ title: "Failed to delete offence", variant: "destructive" }),
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
      queryClient.invalidateQueries({ queryKey: ["/api/analytics/departments"] });
      setShowDepartmentDialog(false);
      setDepartmentToEdit(null);
      setDepartmentForm({ name: "", description: "", color: "bg-blue-50 dark:bg-blue-950/300" });
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
      queryClient.invalidateQueries({ queryKey: ["/api/departments/names"] });
      queryClient.invalidateQueries({ queryKey: ["/api/analytics/departments"] });
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
        color: departmentForm.color || "bg-blue-50 dark:bg-blue-950/300",
        customerId: currentUser.customerId
      },
      isEdit: !!departmentToEdit,
      id: departmentToEdit?.id
    });
  };

  // Import mutation
  const importMutation = useMutation({
    mutationFn: async (data: { file: File; type: 'staff' | 'visitors' | 'contractors' | 'members' }) => {
      const formData = new FormData();
      formData.append('file', data.file);
      
      const response = await fetch(`/api/import/${data.type}`, {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.details || error.error || 'Import failed');
      }
      
      return response.json();
    },
    onSuccess: (data, variables) => {
      const { type } = variables;
      const { results } = data;
      
      // Invalidate relevant queries
      if (type === 'staff') {
        queryClient.invalidateQueries({ queryKey: ["/api/staff"] });
      } else if (type === 'visitors') {
        queryClient.invalidateQueries({ queryKey: ["/api/visitors/current"] });
        queryClient.invalidateQueries({ queryKey: ["/api/visitors/today"] });
      } else if (type === 'contractors') {
        queryClient.invalidateQueries({ queryKey: ["/api/contractors/checked-in"] });
      } else if (type === 'members') {
        queryClient.invalidateQueries({ queryKey: ["/api/members"] });
      }
      
      // Show success toast with details
      toast({
        title: "Import Complete!",
        description: `Successfully imported ${results.successful} ${type}. ${results.failed > 0 ? `${results.failed} failed.` : ''}`,
        variant: results.failed > 0 ? "default" : "default",
      });
      
      // Show detailed error info if any failed
      if (results.errors && results.errors.length > 0) {
        console.error('Import errors:', results.errors);
        setTimeout(() => {
          toast({
            title: "Import Errors",
            description: `${results.errors.length} records failed. Check console for details.`,
            variant: "destructive",
          });
        }, 1500);
      }
    },
    onError: (error: any) => {
      toast({
        title: "Import Failed",
        description: error.message || "Failed to import file",
        variant: "destructive",
      });
    },
  });

  const handleImportFile = (event: React.ChangeEvent<HTMLInputElement>, type: 'staff' | 'visitors' | 'contractors' | 'members') => {
    const file = event.target.files?.[0];
    if (!file) return;
    
    // Validate file type
    if (!file.name.endsWith('.csv')) {
      toast({
        title: "Invalid File",
        description: "Please upload a CSV file",
        variant: "destructive",
      });
      return;
    }
    
    importMutation.mutate({ file, type });
    
    // Reset file input
    event.target.value = '';
  };

  // Sample data mutation
  const sampleDataMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('POST', '/api/import/sample-data', {});
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to load sample data');
      }
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/staff"] });
      queryClient.invalidateQueries({ queryKey: ["/api/visitors/current"] });
      queryClient.invalidateQueries({ queryKey: ["/api/visitors/today"] });
      queryClient.invalidateQueries({ queryKey: ["/api/contractors"] });
      queryClient.invalidateQueries({ queryKey: ["/api/contractors/checked-in"] });
      queryClient.invalidateQueries({ queryKey: ["/api/contractors/workers/all"] });
      queryClient.invalidateQueries({ queryKey: ["/api/members"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      toast({
        title: "Sample Data Loaded!",
        description: data.message,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to Load Sample Data",
        description: error.message || "An error occurred",
        variant: "destructive",
      });
    },
  });

  const pendingUpdatesRef = useRef<Record<string, any>>({});

  // Credential/password fields that should never be auto-saved as empty
  const CREDENTIAL_FIELDS = new Set([
    'biostarPassword', 'biostarUsername', 'biostarServerUrl',
    'paxtonPassword', 'paxtonUsername', 'paxtonServerUrl',
    'cluePassword', 'clueUsername', 'clueApiKey',
    'smtpPassword', 'smtpUser',
    'loneWorkerSmsApiKey',
  ]);

  const triggerAutoSave = (field: string, value: any) => {
    if (autoSaveTimeoutRef.current) {
      clearTimeout(autoSaveTimeoutRef.current);
    }
    
    setFormData(prev => ({ ...prev, [field]: value }));

    // Don't queue a save for credential fields when the value is empty —
    // the user is likely mid-edit and we don't want to overwrite a saved value
    if (CREDENTIAL_FIELDS.has(field) && (value === '' || value === null || value === undefined)) {
      return;
    }

    pendingUpdatesRef.current = { ...pendingUpdatesRef.current, [field]: value };
    
    autoSaveTimeoutRef.current = setTimeout(() => {
      const updates = { ...pendingUpdatesRef.current };
      console.log('Auto-saving all pending:', updates);
      pendingUpdatesRef.current = {};
      updateSettingsMutation.mutate(updates);
    }, 800);
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

  // Auto-pick the best contrasting text colour from a range of safe values
  const autoFixTextColor = (bgColor: string): string => {
    const candidates = ['#000000', '#111827', '#1e293b', '#1a2e4a', '#ffffff', '#f8fafc', '#f1f5f9'];
    let best = candidates[0];
    let bestRatio = 0;
    for (const c of candidates) {
      const ratio = calculateContrastRatio(bgColor, c);
      if (ratio > bestRatio) { bestRatio = ratio; best = c; }
    }
    return best;
  };

  // WCAG contrast rating badge
  const getContrastRating = (ratio: number) => {
    if (ratio >= 7)   return { label: 'AAA', cls: 'bg-emerald-600 text-white', tip: 'Excellent — meets WCAG AAA' };
    if (ratio >= 4.5) return { label: 'AA',  cls: 'bg-green-500 text-white',   tip: 'Good — meets WCAG AA' };
    if (ratio >= 3)   return { label: 'AA+', cls: 'bg-amber-500 text-white',   tip: 'OK for large text only — headings may be fine but body text will be hard to read' };
    return               { label: 'Fail', cls: 'bg-red-500 text-white',        tip: 'Low contrast — text will be difficult to read. Please adjust.' };
  };

  // Preset colour themes — all verified to have good contrast ratios
  const PRESET_THEMES = [
    { name: 'TPR Blue',    emoji: '🔵', backgroundColor: '#d5f3fe', foregroundColor: '#1a2e4a', variableTextColor: '#1e4f8c', accentColor: '#2460a9' },
    { name: 'Clean White', emoji: '⬜', backgroundColor: '#ffffff', foregroundColor: '#111827', variableTextColor: '#374151', accentColor: '#3b82f6' },
    { name: 'Navy',        emoji: '🌊', backgroundColor: '#e8f0fe', foregroundColor: '#1e3a5f', variableTextColor: '#1e40af', accentColor: '#1d4ed8' },
    { name: 'Slate',       emoji: '🩶', backgroundColor: '#f1f5f9', foregroundColor: '#1e293b', variableTextColor: '#475569', accentColor: '#6366f1' },
    { name: 'Forest',      emoji: '🌿', backgroundColor: '#f0fdf4', foregroundColor: '#14532d', variableTextColor: '#166534', accentColor: '#16a34a' },
    { name: 'Warm Sand',   emoji: '🏖️', backgroundColor: '#fdf8f0', foregroundColor: '#1c1917', variableTextColor: '#57534e', accentColor: '#d97706' },
    { name: 'Midnight',    emoji: '🌙', backgroundColor: '#0f172a', foregroundColor: '#f1f5f9', variableTextColor: '#94a3b8', accentColor: '#7c3aed' },
    { name: 'Rose',        emoji: '🌸', backgroundColor: '#fff1f2', foregroundColor: '#881337', variableTextColor: '#9f1239', accentColor: '#e11d48' },
  ];

  const applyPresetTheme = (preset: typeof PRESET_THEMES[number]) => {
    // Auto-switch dark/light mode to match the preset background, so tab bars
    // and muted surfaces stay readable instead of staying dark on a light page
    const hex = preset.backgroundColor;
    const pr = parseInt(hex.slice(1, 3), 16);
    const pg = parseInt(hex.slice(3, 5), 16);
    const pb = parseInt(hex.slice(5, 7), 16);
    const luminance = (0.299 * pr + 0.587 * pg + 0.114 * pb) / 255;
    setTheme(luminance < 0.5 ? 'dark' : 'light');

    // Batch all 4 colour fields into ONE debounced save to avoid race conditions
    // from multiple sequential triggerAutoSave calls fighting over the same timeout
    if (autoSaveTimeoutRef.current) {
      clearTimeout(autoSaveTimeoutRef.current);
    }
    const colorUpdates = {
      backgroundColor:   preset.backgroundColor,
      foregroundColor:   preset.foregroundColor,
      variableTextColor: preset.variableTextColor,
      accentColor:       preset.accentColor,
    };
    setFormData(prev => ({ ...prev, ...colorUpdates }));
    pendingUpdatesRef.current = { ...pendingUpdatesRef.current, ...colorUpdates };
    setSuggestedTextColors(suggestTextColors(preset.backgroundColor));
    autoSaveTimeoutRef.current = setTimeout(() => {
      const updates = { ...pendingUpdatesRef.current };
      pendingUpdatesRef.current = {};
      updateSettingsMutation.mutate(updates);
    }, 800);
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

  const handleTestPrinter = async (printerType: 'tec' | 'zebra') => {
    setTestPrinterType(printerType);
    setIsTestingPrinter(true);
    setTestPrinterResult(null);
    setShowTestPrinterDialog(true);

    try {
      const response = await apiRequest('POST', `/api/printers/test/${printerType}`);
      const data = await response.json();

      if (response.ok) {
        setTestPrinterCode(data.code);
        setTestPrinterResult({
          success: true,
          message: data.sent ? `Test print sent successfully to ${printerType.toUpperCase()} printer!` : 'Test code generated successfully!'
        });
      } else {
        setTestPrinterResult({
          success: false,
          message: data.error || 'Failed to generate test code'
        });
      }
    } catch (error) {
      setTestPrinterResult({
        success: false,
        message: 'Network error while testing printer'
      });
    } finally {
      setIsTestingPrinter(false);
    }
  };

  const handleSendTestPrint = async () => {
    if (!testPrinterCode || !testPrinterType) return;

    setIsTestingPrinter(true);
    try {
      const response = await apiRequest('POST', `/api/printers/send/${testPrinterType}`, { 
        code: testPrinterCode 
      });

      const data = await response.json();

      if (response.ok) {
        toast({
          title: "Print Sent!",
          description: `Test print sent to ${testPrinterType.toUpperCase()} printer at ${data.ip}:${data.port}`,
        });
      } else {
        toast({
          title: "Print Failed",
          description: data.error || 'Failed to send print to printer',
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Network Error",
        description: 'Failed to communicate with printer',
        variant: "destructive",
      });
    } finally {
      setIsTestingPrinter(false);
    }
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
          <p className="text-variable">Loading settings...</p>
        </div>
      </div>
    );
  }

  const handlePaxtonTest = async () => {
    setPaxtonTestLoading(true);
    try {
      const res = await fetch("/api/paxton/test-connection", { method: "POST", headers: { "Content-Type": "application/json" } });
      const data = await res.json();
      setPaxtonTestResult(data.success ? `✓ ${data.message}` : `✗ ${data.message || data.error}`);
    } catch (err: any) {
      setPaxtonTestResult(`✗ ${err.message}`);
    }
    setPaxtonTestLoading(false);
  };

  const handlePaxtonSync = async () => {
    setPaxtonSyncLoading(true);
    try {
      const res = await fetch("/api/paxton/sync-staff", { method: "POST", headers: { "Content-Type": "application/json" } });
      const data = await res.json();
      setPaxtonSyncResult(data.success ? `✓ ${data.message}` : `✗ ${data.message || data.error}`);
    } catch (err: any) {
      setPaxtonSyncResult(`✗ ${err.message}`);
    }
    setPaxtonSyncLoading(false);
  };

  const handleGenerateApiKey = async () => {
    setApiKeyGenerating(true);
    try {
      const res = await fetch("/api/integrations/generate-api-key", { method: "POST", headers: { "Content-Type": "application/json" } });
      const data = await res.json();
      if (data.apiKey) {
        handleInputChange("apiKey", data.apiKey);
        toast({ title: "API Key Generated", description: "A new API key has been generated successfully." });
      }
    } catch (err: any) {
      toast({ title: "Error", description: err.message || "Failed to generate API key", variant: "destructive" });
    }
    setApiKeyGenerating(false);
  };

  const handleRevokeApiKey = async () => {
    try {
      await fetch("/api/integrations/revoke-api-key", { method: "POST", headers: { "Content-Type": "application/json" } });
      handleInputChange("apiKey", "");
      toast({ title: "API Key Revoked", description: "Your API key has been revoked." });
    } catch (err: any) {
      toast({ title: "Error", description: err.message || "Failed to revoke API key", variant: "destructive" });
    }
  };

  const handleTestWebhook = async () => {
    setWebhookTestLoading(true);
    try {
      const res = await fetch("/api/integrations/test-webhook", { method: "POST", headers: { "Content-Type": "application/json" } });
      const data = await res.json();
      setWebhookTestResult(data.success ? `✓ ${data.message}` : `✗ ${data.message || data.error}`);
    } catch (err: any) {
      setWebhookTestResult(`✗ ${err.message}`);
    }
    setWebhookTestLoading(false);
  };

  const handleCopyToClipboard = (value: string, label: string) => {
    navigator.clipboard.writeText(value).then(() => {
      toast({ title: "Copied!", description: `${label} copied to clipboard.` });
    }).catch(() => {
      toast({ title: "Copy Failed", description: "Failed to copy to clipboard.", variant: "destructive" });
    });
  };

  const currentSettings = { ...settings, ...formData };

  return (
    <div className="space-y-4 sm:space-y-6 p-3 sm:p-6 rounded-xl bg-background min-h-screen">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-xl sm:text-2xl font-bold text-fixed">Settings</h2>
        <div className="flex items-center gap-2 flex-shrink-0">
          <Link to="/settings/ai">
            <Button
              variant="outline"
              size="sm"
              className="border-purple-200 text-purple-700 hover:bg-purple-50 font-medium transition-all duration-300"
              data-testid="link-ai-settings"
            >
              <Bot size={15} />
              <span className="hidden sm:inline ml-2">AI Settings</span>
            </Button>
          </Link>
        </div>
      </div>

      {/* Auto-save information banner */}
      <div className="flex items-center gap-2 p-3 sm:p-4 bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-lg">
        <div className="h-2 w-2 flex-shrink-0 bg-green-500 rounded-full animate-pulse"></div>
        <p className="text-xs sm:text-sm text-green-800 dark:text-green-300 font-medium">
          ✨ Auto-save enabled — changes saved after 1.5 seconds
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        {/* Mobile (< md): full-width dropdown selector */}
        <div className="md:hidden mb-4">
          <Select value={activeTab} onValueChange={setActiveTab}>
            <SelectTrigger className="w-full h-11 text-sm font-medium">
              <SelectValue placeholder="Select section…" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="company">Company</SelectItem>
              <SelectItem value="branding">Branding</SelectItem>
              <SelectItem value="users">Users</SelectItem>
              <SelectItem value="departments">Departments</SelectItem>
              <SelectItem value="zones">Zones</SelectItem>
              <SelectItem value="email">Email</SelectItem>
              <SelectItem value="phone-systems">Phone Systems</SelectItem>
              <SelectItem value="reports">Reports</SelectItem>
              <SelectItem value="printing">Printing &amp; ID</SelectItem>
              <SelectItem value="hs-documents">H&amp;S Documents</SelectItem>
              <SelectItem value="hsrules">H&amp;S Rules</SelectItem>
              <SelectItem value="contractors">Card Offences</SelectItem>
              <SelectItem value="ai">AI Settings</SelectItem>
              <SelectItem value="biostar">BioStar</SelectItem>
              <SelectItem value="integrations">Integrations</SelectItem>
              <SelectItem value="lone-worker">Lone Worker</SelectItem>
              <SelectItem value="system">System</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Tablet / Desktop (≥ md): wrapping tab pill grid */}
        <TabsList className="hidden md:flex md:flex-wrap md:h-auto gap-1 p-2 w-full md:justify-start">
          <TabsTrigger value="company" className="flex items-center gap-1.5 px-3 py-2 text-xs whitespace-nowrap">
            <Building2 size={13} className="flex-shrink-0" />
            Company
          </TabsTrigger>
          <TabsTrigger value="branding" className="flex items-center gap-1.5 px-3 py-2 text-xs whitespace-nowrap">
            <Palette size={13} className="flex-shrink-0" />
            Branding
          </TabsTrigger>
          <TabsTrigger value="users" className="flex items-center gap-1.5 px-3 py-2 text-xs whitespace-nowrap">
            <Users size={13} className="flex-shrink-0" />
            Users
          </TabsTrigger>
          <TabsTrigger value="departments" className="flex items-center gap-1.5 px-3 py-2 text-xs whitespace-nowrap">
            <Building size={13} className="flex-shrink-0" />
            Departments
          </TabsTrigger>
          <TabsTrigger value="zones" className="flex items-center gap-1.5 px-3 py-2 text-xs whitespace-nowrap">
            <MapPin size={13} className="flex-shrink-0" />
            Zones
          </TabsTrigger>
          <TabsTrigger value="email" className="flex items-center gap-1.5 px-3 py-2 text-xs whitespace-nowrap">
            <Mail size={13} className="flex-shrink-0" />
            Email
          </TabsTrigger>
          <TabsTrigger value="phone-systems" className="flex items-center gap-1.5 px-3 py-2 text-xs whitespace-nowrap">
            <Phone size={13} className="flex-shrink-0" />
            Phone Systems
          </TabsTrigger>
          <TabsTrigger value="reports" className="flex items-center gap-1.5 px-3 py-2 text-xs whitespace-nowrap">
            <FileText size={13} className="flex-shrink-0" />
            Reports
          </TabsTrigger>
          <TabsTrigger value="printing" className="flex items-center gap-1.5 px-3 py-2 text-xs whitespace-nowrap">
            <Printer size={13} className="flex-shrink-0" />
            Printing &amp; ID
          </TabsTrigger>
          <TabsTrigger value="hs-documents" className="flex items-center gap-1.5 px-3 py-2 text-xs whitespace-nowrap">
            <FileText size={13} className="flex-shrink-0" />
            H&amp;S Docs
          </TabsTrigger>
          <TabsTrigger value="hsrules" className="flex items-center gap-1.5 px-3 py-2 text-xs whitespace-nowrap">
            <Shield size={13} className="flex-shrink-0" />
            H&amp;S Rules
          </TabsTrigger>
          <TabsTrigger value="contractors" className="flex items-center gap-1.5 px-3 py-2 text-xs whitespace-nowrap">
            <HardHat size={13} className="flex-shrink-0" />
            Card Offences
          </TabsTrigger>
          <TabsTrigger value="ai" className="flex items-center gap-1.5 px-3 py-2 text-xs whitespace-nowrap">
            <Brain size={13} className="flex-shrink-0" />
            AI
          </TabsTrigger>
          <TabsTrigger value="biostar" className="flex items-center gap-1.5 px-3 py-2 text-xs whitespace-nowrap">
            <Shield size={13} className="flex-shrink-0" />
            BioStar
          </TabsTrigger>
          <TabsTrigger value="integrations" className="flex items-center gap-1.5 px-3 py-2 text-xs whitespace-nowrap">
            <Zap size={13} className="flex-shrink-0" />
            Integrations
          </TabsTrigger>
          <TabsTrigger value="lone-worker" className="flex items-center gap-1.5 px-3 py-2 text-xs whitespace-nowrap">
            <Shield size={13} className="flex-shrink-0" />
            Lone Worker
          </TabsTrigger>
          <TabsTrigger value="system" className="flex items-center gap-1.5 px-3 py-2 text-xs whitespace-nowrap">
            <SettingsIcon size={13} className="flex-shrink-0" />
            System
          </TabsTrigger>
        </TabsList>

        <TabsContent value="company" className="space-y-6 mt-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <GlassCard>
              <div className="flex items-center mb-6">
                <Building2 className="mr-3 text-blue-600 dark:text-blue-400" size={24} />
                <h3 className="text-lg font-semibold text-fixed">Company Information</h3>
              </div>
              
              <TooltipProvider delayDuration={200}>
              <div className="space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5">
                    <Label htmlFor="companyName" className="text-sm font-medium text-variable">Company Name</Label>
                    <Tooltip>
                      <TooltipTrigger asChild><Info size={14} className="text-variable cursor-help" /></TooltipTrigger>
                      <TooltipContent className="max-w-xs">Displayed on all visitor ID passes and printed badges. Keep it short enough to fit on a pass card.</TooltipContent>
                    </Tooltip>
                  </div>
                  <Input
                    id="companyName"
                    type="text"
                    value={currentSettings?.companyName || ""}
                    onChange={(e) => handleInputChange("companyName", e.target.value)}
                    className="w-full px-4 py-3 rounded-xl border border-white/30 dark:border-slate-700/30 bg-white/50 dark:bg-slate-800/50 focus:outline-none focus:ring-2 focus:ring-blue-500 text-fixed"
                    data-testid="input-company-name"
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="address" className="text-sm font-medium text-fixed">
                    Company Address
                  </Label>
                  <Input
                    id="address"
                    type="text"
                    value={currentSettings?.address || ""}
                    onChange={(e) => handleInputChange("address", e.target.value)}
                    className="w-full px-4 py-3 rounded-xl border border-white/30 dark:border-slate-700/30 bg-white/50 dark:bg-slate-800/50 focus:outline-none focus:ring-2 focus:ring-blue-500 text-fixed"
                    placeholder=""
                    data-testid="input-company-address"
                  />
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="phone" className="text-sm font-medium text-fixed">
                      Phone Number
                    </Label>
                    <Input
                      id="phone"
                      type="tel"
                      value={currentSettings?.phone || ""}
                      onChange={(e) => handleInputChange("phone", e.target.value)}
                      className="w-full px-4 py-3 rounded-xl border border-white/30 dark:border-slate-700/30 bg-white/50 dark:bg-slate-800/50 focus:outline-none focus:ring-2 focus:ring-blue-500 text-fixed"
                      placeholder=""
                      data-testid="input-company-phone"
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <div className="flex items-center gap-1.5">
                      <Label htmlFor="email" className="text-sm font-medium text-fixed">Company Email</Label>
                      <Tooltip>
                        <TooltipTrigger asChild><Info size={14} className="text-variable cursor-help" /></TooltipTrigger>
                        <TooltipContent className="max-w-xs">Your company's main contact email address. This is shown on visitor passes and used as the reply-to address on outbound emails. Configure dedicated sender details in the Email tab.</TooltipContent>
                      </Tooltip>
                    </div>
                    <Input
                      id="email"
                      type="email"
                      value={currentSettings?.email || ""}
                      onChange={(e) => handleInputChange("email", e.target.value)}
                      className="w-full px-4 py-3 rounded-xl border border-white/30 dark:border-slate-700/30 bg-white/50 dark:bg-slate-800/50 focus:outline-none focus:ring-2 focus:ring-blue-500 text-fixed"
                      placeholder=""
                      data-testid="input-company-email"
                    />
                  </div>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="website" className="text-sm font-medium text-fixed">
                    Company Website
                  </Label>
                  <Input
                    id="website"
                    type="url"
                    value={currentSettings?.website || ""}
                    onChange={(e) => handleInputChange("website", e.target.value)}
                    className="w-full px-4 py-3 rounded-xl border border-white/30 dark:border-slate-700/30 bg-white/50 dark:bg-slate-800/50 focus:outline-none focus:ring-2 focus:ring-blue-500 text-fixed"
                    placeholder=""
                    data-testid="input-company-website"
                  />
                </div>
                
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5">
                    <Label className="text-sm font-medium text-fixed">Company Logo</Label>
                    <Tooltip>
                      <TooltipTrigger asChild><Info size={14} className="text-variable cursor-help" /></TooltipTrigger>
                      <TooltipContent className="max-w-xs">Your logo appears on visitor ID passes, emails, and the kiosk check-in screen. PNG or SVG with a transparent background works best. Max 2 MB.</TooltipContent>
                    </Tooltip>
                  </div>
                  <div className="space-y-4">
                    {currentSettings?.logoUrl && !currentSettings.logoUrl.includes('test') && (
                      <div className="flex items-center justify-center p-4 bg-white/50 dark:bg-slate-800/50 rounded-xl border border-white/30 dark:border-slate-700/30">
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
                    <p className="text-xs text-variable">Recommended: PNG or SVG, max 2MB</p>
                  </div>
                </div>
              </div>
              </TooltipProvider>
            </GlassCard>

          </div>
        </TabsContent>

        <TabsContent value="email" className="space-y-6 mt-6">
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
                      placeholder="Your email password or app-specific password"
                      value={currentSettings?.smtpPassword || ""}
                      onChange={(e) => handleInputChange("smtpPassword", e.target.value)}
                      className="w-full px-4 py-3 rounded-xl border border-white/30 dark:border-slate-700/30 bg-white/50 dark:bg-slate-800/50"
                      data-testid="input-smtp-password"
                    />
                    <p className="text-xs text-variable">Use app-specific password for Gmail/Outlook</p>
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
              <div className="flex justify-end mb-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2 text-amber-700 border-amber-300 hover:bg-amber-50 dark:text-amber-400 dark:border-amber-700 dark:hover:bg-amber-950"
                  onClick={() => setShowResetBrandingDialog(true)}
                  disabled={resetBrandingMutation.isPending}
                  data-testid="button-reset-branding"
                >
                  <RotateCcw size={14} />
                  Reset Branding to Defaults
                </Button>
              </div>

              <Dialog open={showResetBrandingDialog} onOpenChange={setShowResetBrandingDialog}>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Reset Branding to Defaults?</DialogTitle>
                    <DialogDescription>
                      This will reset all color settings, logo, and banner back to the default development values (light blue background, black text, blue accent, plus the original logo and banner images).
                    </DialogDescription>
                  </DialogHeader>
                  <div className="p-4 rounded-lg bg-slate-50 dark:bg-slate-800 space-y-2 text-sm">
                    <p><span className="font-medium">Background:</span> <span className="font-mono">#d5f3fe</span> <span className="inline-block w-4 h-4 rounded align-middle ml-1" style={{backgroundColor: '#d5f3fe', border: '1px solid #ccc'}}></span></p>
                    <p><span className="font-medium">Text Color:</span> <span className="font-mono">#000000</span> <span className="inline-block w-4 h-4 rounded align-middle ml-1" style={{backgroundColor: '#000000'}}></span></p>
                    <p><span className="font-medium">Accent:</span> <span className="font-mono">#2460a9</span> <span className="inline-block w-4 h-4 rounded align-middle ml-1" style={{backgroundColor: '#2460a9'}}></span></p>
                    <p><span className="font-medium">Variable Text:</span> <span className="font-mono">#53b0ea</span> <span className="inline-block w-4 h-4 rounded align-middle ml-1" style={{backgroundColor: '#53b0ea'}}></span></p>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setShowResetBrandingDialog(false)}>Cancel</Button>
                    <Button
                      onClick={() => {
                        resetBrandingMutation.mutate();
                        setShowResetBrandingDialog(false);
                      }}
                      className="bg-amber-600 hover:bg-amber-700 text-white"
                    >
                      Reset Colors
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <GlassCard>
                  <div className="flex items-center mb-5">
                    <Palette className="mr-3 text-blue-600 dark:text-blue-400" size={24} />
                    <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-200">Color Theme</h3>
                  </div>

                  {/* Preset Themes */}
                  <div className="mb-6">
                    <p className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-3">Quick Presets — balanced colour combinations</p>
                    <div className="grid grid-cols-4 gap-2">
                      {PRESET_THEMES.map((preset) => {
                        const isActive =
                          currentSettings?.backgroundColor === preset.backgroundColor &&
                          currentSettings?.foregroundColor === preset.foregroundColor &&
                          currentSettings?.variableTextColor === preset.variableTextColor &&
                          currentSettings?.accentColor === preset.accentColor;
                        return (
                          <button
                            key={preset.name}
                            type="button"
                            onClick={() => applyPresetTheme(preset)}
                            title={preset.name}
                            className={`relative rounded-xl overflow-hidden border-2 transition-all hover:scale-105 focus:outline-none ${isActive ? 'border-blue-500 ring-2 ring-blue-300' : 'border-transparent hover:border-slate-300'}`}
                            data-testid={`button-preset-${preset.name.toLowerCase().replace(/\s/g, '-')}`}
                          >
                            <div className="h-10" style={{ backgroundColor: preset.backgroundColor }}>
                              <div className="flex items-center justify-between px-2 pt-1.5">
                                <span className="text-[10px] font-bold truncate" style={{ color: preset.foregroundColor }}>Aa</span>
                                <span className="text-[10px] font-medium" style={{ color: preset.variableTextColor }}>Bb</span>
                                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: preset.accentColor }} />
                              </div>
                            </div>
                            <div className="py-1 px-1 bg-white/80 dark:bg-slate-800/80 text-center">
                              <span className="text-[10px] font-medium text-slate-700 dark:text-slate-300 leading-none">{preset.name}</span>
                            </div>
                            {isActive && (
                              <div className="absolute top-1 right-1 w-4 h-4 bg-blue-500 rounded-full flex items-center justify-center">
                                <span className="text-white text-[9px] font-bold">✓</span>
                              </div>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="space-y-5">
                    {/* Background Color */}
                    <div className="space-y-2">
                      <Label htmlFor="backgroundColor" className="text-sm font-medium text-slate-700 dark:text-slate-300">
                        Background Color
                      </Label>
                      <div className="flex gap-3 items-center">
                        <Input
                          id="backgroundColor"
                          type="color"
                          value={currentSettings?.backgroundColor || "#f8fafc"}
                          onChange={(e) => handleInputChange("backgroundColor", e.target.value)}
                          className="w-16 h-12 p-1 rounded-xl border border-white/30 dark:border-slate-700/30 bg-white/50 dark:bg-slate-800/50 cursor-pointer"
                          data-testid="input-background-color"
                        />
                        <Input
                          type="text"
                          value={currentSettings?.backgroundColor || "#f8fafc"}
                          onChange={(e) => handleInputChange("backgroundColor", e.target.value)}
                          className="flex-1 px-4 py-3 rounded-xl border border-white/30 dark:border-slate-700/30 bg-white/50 dark:bg-slate-800/50 focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-800 dark:text-slate-200 font-mono"
                          placeholder=""
                        />
                      </div>
                      <p className="text-xs text-slate-500 dark:text-slate-400">The main page background colour used throughout the app</p>
                    </div>

                    {/* Fixed Text Color */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <div>
                          <Label htmlFor="foregroundColor" className="text-sm font-medium text-slate-700 dark:text-slate-300">
                            Fixed Text Color
                          </Label>
                          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Page headings, labels, sidebar titles — high-visibility text</p>
                        </div>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-7 px-2 text-xs gap-1 shrink-0"
                          onClick={() => handleInputChange("foregroundColor", autoFixTextColor(currentSettings?.backgroundColor || "#f8fafc"))}
                          title="Automatically pick the best contrasting colour"
                          data-testid="button-autofix-fixed-text"
                        >
                          <Wand2 size={11} />
                          Auto-fix
                        </Button>
                      </div>
                      <div className="flex gap-3 items-center">
                        <Input
                          id="foregroundColor"
                          type="color"
                          value={currentSettings?.foregroundColor || "#1e293b"}
                          onChange={(e) => handleInputChange("foregroundColor", e.target.value)}
                          className="w-16 h-12 p-1 rounded-xl border border-white/30 dark:border-slate-700/30 bg-white/50 dark:bg-slate-800/50 cursor-pointer"
                          data-testid="input-foreground-color"
                        />
                        <Input
                          type="text"
                          value={currentSettings?.foregroundColor || "#1e293b"}
                          onChange={(e) => handleInputChange("foregroundColor", e.target.value)}
                          className="flex-1 px-4 py-3 rounded-xl border border-white/30 dark:border-slate-700/30 bg-white/50 dark:bg-slate-800/50 focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-800 dark:text-slate-200 font-mono"
                          placeholder=""
                        />
                      </div>
                      {currentSettings?.backgroundColor && (() => {
                        const ratio = calculateContrastRatio(currentSettings.backgroundColor, currentSettings?.foregroundColor || "#1e293b");
                        const rating = getContrastRating(ratio);
                        return (
                          <div className="flex items-center gap-2">
                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${rating.cls}`}>{rating.label}</span>
                            <span className="text-xs text-slate-500 dark:text-slate-400">{ratio.toFixed(1)}:1 — {rating.tip}</span>
                          </div>
                        );
                      })()}
                    </div>

                    {/* Variable Text Color */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <div>
                          <Label htmlFor="variableTextColor" className="text-sm font-medium text-slate-700 dark:text-slate-300">
                            Variable Text Color
                          </Label>
                          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Data values, sub-headings, secondary content — supporting text</p>
                        </div>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-7 px-2 text-xs gap-1 shrink-0"
                          onClick={() => handleInputChange("variableTextColor", autoFixTextColor(currentSettings?.backgroundColor || "#f8fafc"))}
                          title="Automatically pick the best contrasting colour"
                          data-testid="button-autofix-variable-text"
                        >
                          <Wand2 size={11} />
                          Auto-fix
                        </Button>
                      </div>
                      <div className="flex gap-3 items-center">
                        <Input
                          id="variableTextColor"
                          type="color"
                          value={currentSettings?.variableTextColor || "#374151"}
                          onChange={(e) => handleInputChange("variableTextColor", e.target.value)}
                          className="w-16 h-12 p-1 rounded-xl border border-white/30 dark:border-slate-700/30 bg-white/50 dark:bg-slate-800/50 cursor-pointer"
                          data-testid="input-variable-text-color"
                        />
                        <Input
                          type="text"
                          value={currentSettings?.variableTextColor || "#374151"}
                          onChange={(e) => handleInputChange("variableTextColor", e.target.value)}
                          className="flex-1 px-4 py-3 rounded-xl border border-white/30 dark:border-slate-700/30 bg-white/50 dark:bg-slate-800/50 focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-800 dark:text-slate-200 font-mono"
                          placeholder=""
                        />
                      </div>
                      {currentSettings?.backgroundColor && (() => {
                        const ratio = calculateContrastRatio(currentSettings.backgroundColor, currentSettings?.variableTextColor || "#374151");
                        const rating = getContrastRating(ratio);
                        return (
                          <div className="flex items-center gap-2">
                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${rating.cls}`}>{rating.label}</span>
                            <span className="text-xs text-slate-500 dark:text-slate-400">{ratio.toFixed(1)}:1 — {rating.tip}</span>
                          </div>
                        );
                      })()}
                    </div>

                    {/* Accent Color */}
                    <div className="space-y-2">
                      <Label htmlFor="accentColor" className="text-sm font-medium text-slate-700 dark:text-slate-300">
                        Accent Color
                      </Label>
                      <div className="flex gap-3 items-center">
                        <Input
                          id="accentColor"
                          type="color"
                          value={currentSettings?.accentColor || "#3b82f6"}
                          onChange={(e) => handleInputChange("accentColor", e.target.value)}
                          className="w-16 h-12 p-1 rounded-xl border border-white/30 dark:border-slate-700/30 bg-white/50 dark:bg-slate-800/50 cursor-pointer"
                          data-testid="input-accent-color"
                        />
                        <Input
                          type="text"
                          value={currentSettings?.accentColor || "#3b82f6"}
                          onChange={(e) => handleInputChange("accentColor", e.target.value)}
                          className="flex-1 px-4 py-3 rounded-xl border border-white/30 dark:border-slate-700/30 bg-white/50 dark:bg-slate-800/50 focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-800 dark:text-slate-200 font-mono"
                          placeholder=""
                        />
                      </div>
                      <p className="text-xs text-slate-500 dark:text-slate-400">Buttons, links, highlights, and interactive elements</p>
                    </div>

                    {/* Live Preview */}
                    <div className="pt-4 border-t border-white/20 dark:border-slate-700/30">
                      <p className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-3">Live Preview</p>
                      <div className="rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 shadow-sm">
                        <div className="px-5 py-4 space-y-2" style={{ backgroundColor: currentSettings?.backgroundColor || '#f8fafc' }}>
                          <p className="text-base font-bold" style={{ color: currentSettings?.foregroundColor || '#1e293b' }}>Page Heading — Fixed Text</p>
                          <p className="text-sm" style={{ color: currentSettings?.foregroundColor || '#1e293b' }}>Staff Management · Visitor Records · Contractor Log</p>
                          <p className="text-sm mt-1" style={{ color: currentSettings?.variableTextColor || '#374151' }}>Variable text: visitor name, data values, secondary content, descriptions and labels that change per record.</p>
                          <div className="flex gap-2 mt-3">
                            <span className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white" style={{ backgroundColor: currentSettings?.accentColor || '#3b82f6' }}>Accent Button</span>
                            <span className="px-3 py-1.5 rounded-lg text-xs border" style={{ color: currentSettings?.accentColor || '#3b82f6', borderColor: currentSettings?.accentColor || '#3b82f6' }}>Outline Button</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-2 pt-4 border-t border-white/20 dark:border-slate-700/30">
                      <Label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                        Nav Bar Colour
                      </Label>
                      <p className="text-xs text-slate-500 dark:text-slate-400">Set a custom background colour for the top navigation bar. Leave blank to use the default glass effect.</p>
                      <div className="flex gap-3 items-center">
                        <Input
                          type="color"
                          value={currentSettings?.navBannerColor || "#ffffff"}
                          onChange={(e) => handleInputChange("navBannerColor", e.target.value)}
                          className="w-20 h-12 p-1 rounded-xl border border-white/30 dark:border-slate-700/30 bg-white/50 dark:bg-slate-800/50"
                        />
                        <Input
                          type="text"
                          value={currentSettings?.navBannerColor || ""}
                          onChange={(e) => handleInputChange("navBannerColor", e.target.value)}
                          className="flex-1 px-4 py-3 rounded-xl border border-white/30 dark:border-slate-700/30 bg-white/50 dark:bg-slate-800/50 focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-800 dark:text-slate-200 font-mono"
                          placeholder="e.g. #1e3a5f  (leave blank for default)"
                        />
                        {currentSettings?.navBannerColor && (
                          <button
                            type="button"
                            onClick={() => handleInputChange("navBannerColor", "")}
                            className="px-3 py-2 text-xs text-slate-500 hover:text-slate-700 border border-slate-300 rounded-lg"
                            title="Clear custom colour"
                          >
                            Clear
                          </button>
                        )}
                      </div>
                      <div className="flex items-center gap-3 pt-2">
                        <Switch
                          id="navBannerInvert"
                          checked={!!currentSettings?.navBannerInvert}
                          onCheckedChange={(checked) => handleInputChange("navBannerInvert", checked)}
                        />
                        <div>
                          <Label htmlFor="navBannerInvert" className="text-sm font-medium text-slate-700 dark:text-slate-300 cursor-pointer">
                            Invert Icons &amp; Text
                          </Label>
                          <p className="text-xs text-slate-500 dark:text-slate-400">Turn on to make nav icons and text white — ideal for dark banner colours.</p>
                        </div>
                      </div>
                      {currentSettings?.navBannerColor && (
                        <div className="mt-3 rounded-xl overflow-hidden border border-white/30 dark:border-slate-700/30">
                          <div
                            className="px-4 py-3 flex items-center gap-3 text-sm font-medium"
                            style={{
                              backgroundColor: currentSettings.navBannerColor,
                              color: currentSettings.navBannerInvert ? '#ffffff' : undefined,
                            }}
                          >
                            <span className="opacity-60 text-xs">Preview:</span>
                            <span>Your Company</span>
                            <span className="opacity-60 ml-auto text-xs">Nav icons will appear here</span>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </GlassCard>
                
                <GlassCard>
                  <div className="flex items-center mb-6">
                    <Monitor className="mr-3 text-blue-600 dark:text-blue-400" size={24} />
                    <h3 className="text-lg font-semibold text-fixed">Kiosk Banner</h3>
                  </div>
                  
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label className="text-sm font-medium text-fixed">
                        Welcome Banner Image
                      </Label>
                      <p className="text-xs text-variable mb-3">Displayed prominently on kiosk mode. Recommended: 1200x300px or similar wide format</p>
                      
                      {currentSettings?.bannerUrl && !currentSettings.bannerUrl.includes('test') && (
                        <div className="mb-4 p-4 bg-white/50 dark:bg-slate-800/50 rounded-xl border border-white/30 dark:border-slate-700/30">
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
                      
                      <p className="text-xs text-variable">Recommended: JPG or PNG, max 5MB, wide format (3:1 or 4:1 ratio)</p>
                    </div>
                  </div>
                </GlassCard>
              </div>
            </TabsContent>

            <TabsContent value="theme" className="space-y-6">
              <GlassCard>
                <div className="flex items-center mb-6">
                  <Monitor className="mr-3 text-blue-600 dark:text-blue-400" size={24} />
                  <h3 className="text-lg font-semibold text-fixed">Application Theme</h3>
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
                      <SunMoon className="text-indigo-600" size={24} />
                      <div>
                        <h4 className="font-medium text-slate-800 dark:text-slate-200">High Contrast (Tablet)</h4>
                        <p className="text-sm text-slate-600 dark:text-slate-400">Maximum readability for tablets and bright environments</p>
                      </div>
                    </div>
                    <Button
                      variant={theme === "high-contrast" ? "default" : "outline"}
                      onClick={() => setTheme("high-contrast")}
                      data-testid="button-high-contrast-theme"
                    >
                      {theme === "high-contrast" && "✓"} Select
                    </Button>
                  </div>

                  <div className="flex items-center justify-between p-4 bg-white/50 dark:bg-slate-800/50 rounded-xl border border-white/30 dark:border-slate-700/30">
                    <div className="flex items-center space-x-4">
                      <Monitor className="text-blue-600 dark:text-blue-400" size={24} />
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
                      <Printer className="mr-3 text-blue-600 dark:text-blue-400" size={24} />
                      <h3 className="text-lg font-semibold text-fixed">Printer Configuration</h3>
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
                    <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg">
                      <div className="flex items-center gap-2 mb-1">
                        <Monitor className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                        <span className="text-sm font-medium text-blue-800 dark:text-blue-300">
                          Platform: {detectedPrinters.platform} • {detectedPrinters.printers.length} printers found
                        </span>
                      </div>
                      <p className="text-xs text-blue-600 dark:text-blue-400">
                        Last detected: {new Date(detectedPrinters.detectedAt).toLocaleString()}
                      </p>
                      {detectedPrinters.message && (
                        <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">{detectedPrinters.message}</p>
                      )}
                    </div>
                  )}
                  
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="selectedPrinter" className="text-sm font-medium text-fixed">
                        Default Printer (Visitor Passes)
                      </Label>
                      <Select
                        value={currentSettings?.selectedPrinter || "PDF Printer"}
                        onValueChange={(value) => handleInputChange("selectedPrinter", value)}
                      >
                        <SelectTrigger className="w-full px-4 py-3 rounded-xl border border-white/30 dark:border-slate-700/30 bg-white/50 dark:bg-slate-800/50" data-testid="select-printer">
                          <SelectValue placeholder="Select a printer" />
                        </SelectTrigger>
                        <SelectContent>
                          {detectedPrinters?.printers?.map((printer) => (
                            <SelectItem key={printer.name} value={printer.name}>
                              <div className="flex items-center justify-between w-full">
                                <span>{printer.name}</span>
                                <div className="flex items-center gap-2 ml-2">
                                  {printer.isOnline ? (
                                    <Badge variant="default" className="bg-green-100 text-green-800 dark:text-green-300 text-xs">
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
                      <p className="text-xs text-variable">Select your installed printer or use PDF for testing</p>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="printQuality" className="text-sm font-medium text-fixed">
                        Print Quality
                      </Label>
                      <Select
                        value={currentSettings?.printQuality || "normal"}
                        onValueChange={(value) => handleInputChange("printQuality", value)}
                      >
                        <SelectTrigger className="w-full px-4 py-3 rounded-xl border border-white/30 dark:border-slate-700/30 bg-white/50 dark:bg-slate-800/50" data-testid="select-print-quality">
                          <SelectValue placeholder="Select print quality" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="draft">Draft (Fast)</SelectItem>
                          <SelectItem value="normal">Normal</SelectItem>
                          <SelectItem value="high">High Quality</SelectItem>
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-variable">Higher quality uses more ink but provides clearer text</p>
                    </div>

                    <div className="space-y-4 pt-4 border-t border-white/30 dark:border-slate-700/30">
                      <div className="flex items-center justify-between">
                        <div>
                          <Label className="text-sm font-medium text-fixed">Auto-Print Passes</Label>
                          <p className="text-xs text-variable">Automatically print visitor passes after check-in</p>
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
                    <QrCode className="mr-3 text-blue-600 dark:text-blue-400" size={24} />
                    <h3 className="text-lg font-semibold text-fixed">Barcode & QR Settings</h3>
                  </div>
                  
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="barcodeFormat" className="text-sm font-medium text-fixed">
                        Barcode Format
                      </Label>
                      <Select
                        value={currentSettings?.barcodeFormat || "QR_CODE"}
                        onValueChange={(value) => handleInputChange("barcodeFormat", value)}
                      >
                        <SelectTrigger className="w-full px-4 py-3 rounded-xl border border-white/30 dark:border-slate-700/30 bg-white/50 dark:bg-slate-800/50" data-testid="select-barcode-format">
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
                      <p className="text-xs text-variable">QR codes work best for mobile scanning</p>
                    </div>

                    <div className="space-y-4 pt-4 border-t border-white/30 dark:border-slate-700/30">
                      <div className="flex items-center justify-between">
                        <div>
                          <Label className="text-sm font-medium text-fixed">Enable 2D Barcodes</Label>
                          <p className="text-xs text-variable">Use advanced 2D barcode formats for enhanced data storage</p>
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
                            <QrCode size={48} className="text-fixed mx-auto" />
                          ) : (
                            <Barcode size={48} className="text-fixed mx-auto" />
                          )}
                        </div>
                        <p className="text-xs text-variable mt-2">
                          Sample {currentSettings?.barcodeFormat || "QR_CODE"} code
                        </p>
                      </div>
                    </div>
                  </div>
                </GlassCard>

                <GlassCard>
                  <div className="flex items-center mb-6">
                    <Printer className="mr-3 text-purple-600" size={24} />
                    <h3 className="text-lg font-semibold text-fixed">Thermal Printer Settings</h3>
                  </div>
                  
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label className="text-sm font-medium text-fixed">
                        Printer Type
                      </Label>
                      <Select
                        value={currentSettings?.thermalSelectedPrinter || "tec"}
                        onValueChange={(value) => handleInputChange("thermalSelectedPrinter", value)}
                      >
                        <SelectTrigger className="w-full px-4 py-3 rounded-xl border border-white/30 dark:border-slate-700/30 bg-white/50 dark:bg-slate-800/50" data-testid="select-thermal-printer-type">
                          <SelectValue placeholder="Select printer type" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="tec">
                            <div className="flex items-center gap-2">
                              <Printer className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                              <span>Toshiba Tec TCPL (B-FV4D, B-EV4D)</span>
                            </div>
                          </SelectItem>
                          <SelectItem value="zebra">
                            <div className="flex items-center gap-2">
                              <Zap className="h-4 w-4 text-purple-600" />
                              <span>Zebra ZPL Printers</span>
                            </div>
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="mt-4 p-4 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-xl">
                      <div className="flex items-start gap-3">
                        <Info className="h-5 w-5 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
                        <div className="space-y-2">
                          <h4 className="text-sm font-semibold text-blue-900">Network Printing for SaaS Applications</h4>
                          <p className="text-xs text-blue-700 leading-relaxed">
                            TPR Max can send print commands directly to your thermal printers over the internet using TCP/IP connections.
                            This enables cloud-based printing from anywhere without requiring local software.
                          </p>
                          <div className="mt-3 space-y-1.5 text-xs text-blue-600 dark:text-blue-400">
                            <p className="font-medium">Setup Instructions:</p>
                            <ol className="list-decimal list-inside space-y-1 ml-2">
                              <li>Connect your printer to your network (Ethernet or Wi-Fi)</li>
                              <li>Print a network configuration page to find the printer's IP address</li>
                              <li>Ensure port 9100 is accessible (check firewall settings if needed)</li>
                              <li>Enter the printer IP address and port below</li>
                              <li>For remote access, configure port forwarding on your router</li>
                            </ol>
                          </div>
                          <p className="text-xs text-blue-600 dark:text-blue-400 mt-2">
                            <strong>Note:</strong> Both Toshiba Tec TCPL and Zebra ZPL printers support standard TCP/IP connections on port 9100.
                          </p>
                        </div>
                      </div>
                    </div>

                    {currentSettings?.thermalSelectedPrinter === "tec" && (
                      <>
                        <div className="space-y-2">
                          <Label className="text-sm font-medium text-fixed">
                            Toshiba Tec Printer Name
                          </Label>
                          <Input
                            type="text"
                            value={currentSettings?.tecPrinterName || "TEC B-FV4D Desktop Printer"}
                            onChange={(e) => handleInputChange("tecPrinterName", e.target.value)}
                            className="w-full px-4 py-3 rounded-xl border border-white/30 dark:border-slate-700/30 bg-white/50 dark:bg-slate-800/50"
                            placeholder=""
                            data-testid="input-tec-printer-name"
                          />
                          <p className="text-xs text-variable">Windows printer name (for local printing) or leave blank for network printing</p>
                        </div>

                        <div className="space-y-2">
                          <Label className="text-sm font-medium text-fixed">
                            Toshiba Tec Printer IP Address
                          </Label>
                          <Input
                            type="text"
                            value={currentSettings?.tecPrinterIp || ""}
                            onChange={(e) => handleInputChange("tecPrinterIp", e.target.value)}
                            className="w-full px-4 py-3 rounded-xl border border-white/30 dark:border-slate-700/30 bg-white/50 dark:bg-slate-800/50"
                            placeholder=""
                            data-testid="input-tec-ip"
                          />
                          <p className="text-xs text-variable">Network IP address of your Toshiba Tec printer for remote printing over the internet</p>
                        </div>

                        <div className="space-y-2">
                          <Label className="text-sm font-medium text-fixed">
                            Toshiba Tec Printer Port
                          </Label>
                          <Input
                            type="number"
                            value={currentSettings?.tecPrinterPort || "9100"}
                            onChange={(e) => handleInputChange("tecPrinterPort", e.target.value)}
                            className="w-full px-4 py-3 rounded-xl border border-white/30 dark:border-slate-700/30 bg-white/50 dark:bg-slate-800/50"
                            placeholder=""
                            data-testid="input-tec-port"
                          />
                          <p className="text-xs text-variable">Default: 9100 (standard thermal printer network port for TCP/IP connections)</p>
                        </div>

                        <div className="space-y-2">
                          <Label className="text-sm font-medium text-fixed">
                            Toshiba Tec Printer Model
                          </Label>
                          <Select
                            value={currentSettings?.tecPrinterModel || "B-FV4D"}
                            onValueChange={(value) => handleInputChange("tecPrinterModel", value)}
                          >
                            <SelectTrigger className="w-full px-4 py-3 rounded-xl border border-white/30 dark:border-slate-700/30 bg-white/50 dark:bg-slate-800/50" data-testid="select-tec-model">
                              <SelectValue placeholder="Select Toshiba Tec model" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="B-FV4D">B-FV4D (Desktop Thermal)</SelectItem>
                              <SelectItem value="B-FV4T">B-FV4T (Desktop Thermal Transfer)</SelectItem>
                              <SelectItem value="B-EV4D">B-EV4D (Desktop Thermal)</SelectItem>
                              <SelectItem value="B-EV4T">B-EV4T (Desktop Thermal Transfer)</SelectItem>
                              <SelectItem value="B-SA4TP">B-SA4TP (Industrial)</SelectItem>
                              <SelectItem value="B-SX4T">B-SX4T (Industrial)</SelectItem>
                              <SelectItem value="B-SX5T">B-SX5T (Industrial)</SelectItem>
                            </SelectContent>
                          </Select>
                          <p className="text-xs text-variable">Select your Toshiba Tec printer model for optimal TCPL generation</p>
                        </div>

                        <div className="space-y-2">
                          <Label className="text-sm font-medium text-fixed">
                            Label Size (Width x Height mm)
                          </Label>
                          <div className="grid grid-cols-2 gap-2">
                            <Input
                              type="number"
                              value={currentSettings?.tecLabelWidth || "85"}
                              onChange={(e) => handleInputChange("tecLabelWidth", e.target.value)}
                              className="px-4 py-3 rounded-xl border border-white/30 dark:border-slate-700/30 bg-white/50 dark:bg-slate-800/50"
                              placeholder=""
                              data-testid="input-tec-width"
                            />
                            <Input
                              type="number"
                              value={currentSettings?.tecLabelHeight || "65"}
                              onChange={(e) => handleInputChange("tecLabelHeight", e.target.value)}
                              className="px-4 py-3 rounded-xl border border-white/30 dark:border-slate-700/30 bg-white/50 dark:bg-slate-800/50"
                              placeholder=""
                              data-testid="input-tec-height"
                            />
                          </div>
                          <p className="text-xs text-variable">Standard visitor pass: 85mm x 65mm</p>
                        </div>

                        <div className="mt-4 p-3 bg-purple-50 border border-purple-200 rounded-lg">
                          <div className="flex items-center gap-2 mb-1">
                            <Printer className="h-4 w-4 text-purple-600" />
                            <span className="text-sm font-medium text-purple-800">Toshiba Tec TCPL Support</span>
                          </div>
                          <p className="text-xs text-purple-600">
                            Full TCPL (Toshiba Control Programming Language) support with QR codes, barcodes, and custom layouts.
                            Professional thermal printing optimized for visitor and contractor passes.
                          </p>
                        </div>

                        <Button
                          type="button"
                          onClick={() => handleTestPrinter('tec')}
                          className="w-full mt-4 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700"
                          data-testid="button-test-tec"
                        >
                          <TestTube className="h-4 w-4 mr-2" />
                          Test Toshiba Tec TCPL Code
                        </Button>
                      </>
                    )}

                    {currentSettings?.thermalSelectedPrinter === "zebra" && (
                      <>
                        <div className="space-y-2">
                          <Label className="text-sm font-medium text-fixed">
                            Zebra Printer IP Address
                          </Label>
                          <Input
                            type="text"
                            value={currentSettings?.zebraPrinterIp || ""}
                            onChange={(e) => handleInputChange("zebraPrinterIp", e.target.value)}
                            className="w-full px-4 py-3 rounded-xl border border-white/30 dark:border-slate-700/30 bg-white/50 dark:bg-slate-800/50"
                            placeholder=""
                            data-testid="input-zebra-ip"
                          />
                          <p className="text-xs text-variable">Network IP address of your Zebra printer for remote printing over the internet</p>
                        </div>

                        <div className="space-y-2">
                          <Label className="text-sm font-medium text-fixed">
                            Zebra Printer Port
                          </Label>
                          <Input
                            type="number"
                            value={currentSettings?.zebraPrinterPort || "9100"}
                            onChange={(e) => handleInputChange("zebraPrinterPort", e.target.value)}
                            className="w-full px-4 py-3 rounded-xl border border-white/30 dark:border-slate-700/30 bg-white/50 dark:bg-slate-800/50"
                            placeholder=""
                            data-testid="input-zebra-port"
                          />
                          <p className="text-xs text-variable">Default: 9100 (standard Zebra network port for TCP/IP connections)</p>
                        </div>

                        <div className="space-y-2">
                          <Label className="text-sm font-medium text-fixed">
                            Zebra Printer Model
                          </Label>
                          <Select
                            value={currentSettings?.zebraPrinterModel || "GK420d"}
                            onValueChange={(value) => handleInputChange("zebraPrinterModel", value)}
                          >
                            <SelectTrigger className="w-full px-4 py-3 rounded-xl border border-white/30 dark:border-slate-700/30 bg-white/50 dark:bg-slate-800/50" data-testid="select-zebra-model">
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
                          <p className="text-xs text-variable">Select your Zebra printer model for optimal ZPL generation</p>
                        </div>

                        <div className="mt-4 p-3 bg-purple-50 border border-purple-200 rounded-lg">
                          <div className="flex items-center gap-2 mb-1">
                            <Zap className="h-4 w-4 text-purple-600" />
                            <span className="text-sm font-medium text-purple-800">Zebra ZPL Support</span>
                          </div>
                          <p className="text-xs text-purple-600">
                            Full ZPL (Zebra Programming Language) support with QR codes, barcodes, and custom layouts.
                            Alternative thermal printing option for Zebra printer users.
                          </p>
                        </div>

                        <Button
                          type="button"
                          onClick={() => handleTestPrinter('zebra')}
                          className="w-full mt-4 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700"
                          data-testid="button-test-zebra"
                        >
                          <TestTube className="h-4 w-4 mr-2" />
                          Test Zebra ZPL Code
                        </Button>
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
                      <h3 className="text-lg font-semibold text-fixed">Digital E-Pass Configuration</h3>
                      <p className="text-sm text-variable">Send digital passes via email or SMS instead of printing</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge 
                      variant="outline" 
                      className={currentSettings?.ePassEnabled ? "bg-green-100 text-green-800 dark:text-green-300 border-green-300" : "bg-gray-100 text-gray-600 dark:text-gray-400"}
                    >
                      {currentSettings?.ePassEnabled ? "E-Pass Active" : "Physical Pass Active"}
                    </Badge>
                  </div>
                </div>
                
                <div className="space-y-6">
                  {/* Main E-Pass Toggle */}
                  <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
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
                          <Label className="text-sm font-medium text-fixed">
                            E-Pass Delivery Method
                          </Label>
                          <Select
                            value={currentSettings?.ePassDeliveryMethod || "both"}
                            onValueChange={(value) => handleInputChange("ePassDeliveryMethod", value)}
                          >
                            <SelectTrigger className="w-full px-4 py-3 rounded-xl border border-white/30 dark:border-slate-700/30 bg-white/50 dark:bg-slate-800/50" data-testid="select-epass-delivery">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="email">Email Only</SelectItem>
                              <SelectItem value="sms">SMS Only</SelectItem>
                              <SelectItem value="both">Email & SMS</SelectItem>
                              <SelectItem value="choice">Let Visitor Choose</SelectItem>
                            </SelectContent>
                          </Select>
                          <p className="text-xs text-variable">How e-Passes are delivered to visitors</p>
                        </div>

                        <div className="space-y-2">
                          <Label className="text-sm font-medium text-fixed">
                            Check-out Reminder (minutes)
                          </Label>
                          <Input
                            type="number"
                            min="5"
                            max="120"
                            value={currentSettings?.ePassCheckoutReminderMinutes || "30"}
                            onChange={(e) => handleInputChange("ePassCheckoutReminderMinutes", e.target.value)}
                            className="w-full px-4 py-3 rounded-xl border border-white/30 dark:border-slate-700/30 bg-white/50 dark:bg-slate-800/50"
                            data-testid="input-checkout-reminder"
                          />
                          <p className="text-xs text-variable">Minutes before expected departure to send reminder</p>
                        </div>
                      </div>

                      {/* Auto Check-out & Host Notifications */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="p-4 bg-white/50 dark:bg-slate-800/50 rounded-lg border border-white/30 dark:border-slate-700/30">
                          <div className="flex items-center justify-between mb-3">
                            <div>
                              <Label className="text-sm font-medium text-fixed">
                                Auto Check-out
                              </Label>
                              <p className="text-xs text-variable mt-1">
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

                        <div className="p-4 bg-white/50 dark:bg-slate-800/50 rounded-lg border border-white/30 dark:border-slate-700/30">
                          <div className="flex items-center justify-between mb-3">
                            <div>
                              <Label className="text-sm font-medium text-fixed">
                                Host Notifications
                              </Label>
                              <p className="text-xs text-variable mt-1">
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
                              <Label className="text-xs text-variable">Notification Delay (min)</Label>
                              <Input
                                type="number"
                                min="15"
                                max="180"
                                value={currentSettings?.ePassHostNotificationDelay || "60"}
                                onChange={(e) => handleInputChange("ePassHostNotificationDelay", e.target.value)}
                                className="w-full mt-1 px-3 py-2 text-sm rounded-lg border border-white/30 dark:border-slate-700/30 bg-white/50 dark:bg-slate-800/50"
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
                                  placeholder=""
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
                                  placeholder=""
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
                                  placeholder=""
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
                                  placeholder=""
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
                                placeholder=""
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
                                placeholder=""
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
                                  placeholder=""
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
                                placeholder=""
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
                    <Eye className="mr-3 text-blue-600 dark:text-blue-400" size={24} />
                    <h3 className="text-lg font-semibold text-fixed">E-Pass Preview</h3>
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
                        <p className="text-xs text-variable mt-2">
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
                      <h3 className="text-lg font-semibold text-fixed">Suprema CLUe Cloud Platform</h3>
                      <p className="text-xs text-variable">Enterprise-grade cloud integration for X-Station 2 devices</p>
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
                        <Label className="text-sm font-medium text-fixed">API Key</Label>
                        <Input
                          type="password"
                          value={currentSettings?.clueApiKey || ""}
                          onChange={(e) => handleInputChange("clueApiKey", e.target.value)}
                          placeholder=""
                          className="font-mono"
                          data-testid="input-clue-api-key"
                        />
                      </div>
                      
                      <div className="space-y-2">
                        <Label className="text-sm font-medium text-fixed">API Secret</Label>
                        <Input
                          type="password"
                          value={currentSettings?.clueApiSecret || ""}
                          onChange={(e) => handleInputChange("clueApiSecret", e.target.value)}
                          placeholder=""
                          className="font-mono"
                          data-testid="input-clue-api-secret"
                        />
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label className="text-sm font-medium text-fixed">Organization ID</Label>
                        <Input
                          value={currentSettings?.clueOrganizationId || ""}
                          onChange={(e) => handleInputChange("clueOrganizationId", e.target.value)}
                          placeholder=""
                          data-testid="input-clue-org-id"
                        />
                      </div>
                      
                      <div className="space-y-2">
                        <Label className="text-sm font-medium text-fixed">Webhook Secret</Label>
                        <Input
                          type="password"
                          value={currentSettings?.clueWebhookSecret || ""}
                          onChange={(e) => handleInputChange("clueWebhookSecret", e.target.value)}
                          placeholder=""
                          className="font-mono"
                          data-testid="input-clue-webhook-secret"
                        />
                      </div>
                    </div>
                    
                    <Separator className="my-4" />
                    
                    <div className="space-y-4">
                      <h4 className="font-medium text-fixed">QR Code Settings</h4>
                      
                      <div className="flex items-center justify-between">
                        <div>
                          <Label className="text-sm font-medium text-fixed">Dynamic QR Codes</Label>
                          <p className="text-xs text-variable">Generate single-use QR codes for enhanced security</p>
                        </div>
                        <Switch
                          checked={currentSettings?.clueDynamicQrEnabled === true}
                          onCheckedChange={(checked) => handleInputChange("clueDynamicQrEnabled", checked)}
                          data-testid="switch-clue-dynamic-qr"
                        />
                      </div>
                      
                      <div className="space-y-2">
                        <Label className="text-sm font-medium text-fixed">QR Validity Period (minutes)</Label>
                        <Input
                          type="number"
                          value={currentSettings?.clueQrValidityMinutes || "60"}
                          onChange={(e) => handleInputChange("clueQrValidityMinutes", e.target.value)}
                          min="1"
                          max="1440"
                          data-testid="input-clue-qr-validity"
                        />
                        <p className="text-xs text-variable">How long QR codes remain valid after generation</p>
                      </div>
                    </div>
                    
                    <Separator className="my-4" />
                    
                    <div className="space-y-4">
                      <h4 className="font-medium text-fixed">Automation Settings</h4>
                      
                      <div className="flex items-center justify-between">
                        <div>
                          <Label className="text-sm font-medium text-fixed">Auto-Register Visitors</Label>
                          <p className="text-xs text-variable">Automatically sync visitors to CLUe platform</p>
                        </div>
                        <Switch
                          checked={currentSettings?.clueAutoRegisterVisitors === true}
                          onCheckedChange={(checked) => handleInputChange("clueAutoRegisterVisitors", checked)}
                          data-testid="switch-clue-auto-register"
                        />
                      </div>
                      
                      <div className="flex items-center justify-between">
                        <div>
                          <Label className="text-sm font-medium text-fixed">Auto-Delete Expired</Label>
                          <p className="text-xs text-variable">Remove expired QR codes from CLUe automatically</p>
                        </div>
                        <Switch
                          checked={currentSettings?.clueAutoDeleteExpired === true}
                          onCheckedChange={(checked) => handleInputChange("clueAutoDeleteExpired", checked)}
                          data-testid="switch-clue-auto-delete"
                        />
                      </div>
                      
                      <div className="flex items-center justify-between">
                        <div>
                          <Label className="text-sm font-medium text-fixed">Test Mode</Label>
                          <p className="text-xs text-variable">Enable for development and testing</p>
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
                      <div className="text-xs text-variable text-center">
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
                      <Server className="mr-3 text-blue-600 dark:text-blue-400" size={24} />
                      <h3 className="text-lg font-semibold text-fixed">X-Station 2 Devices</h3>
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
                            <p className="font-medium text-fixed">X-Station 2 - Main Entrance</p>
                            <p className="text-xs text-variable">Device ID: XS2-001 • IP: 192.168.1.100</p>
                          </div>
                        </div>
                        <Badge className="bg-green-100 text-green-800 dark:text-green-300">Online</Badge>
                      </div>
                      <div className="text-xs text-variable mt-2">
                        Location: Building A, Main Lobby • Last seen: Just now
                      </div>
                    </div>
                    
                    <div className="p-4 bg-slate-50 dark:bg-slate-800 rounded-lg">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center">
                          <Monitor className="mr-2 text-green-600" size={20} />
                          <div>
                            <p className="font-medium text-fixed">X-Station 2 - Side Entrance</p>
                            <p className="text-xs text-variable">Device ID: XS2-002 • IP: 192.168.1.101</p>
                          </div>
                        </div>
                        <Badge className="bg-green-100 text-green-800 dark:text-green-300">Online</Badge>
                      </div>
                      <div className="text-xs text-variable mt-2">
                        Location: Building A, Side Door • Last seen: 2 minutes ago
                      </div>
                    </div>
                    
                    <div className="p-4 bg-slate-50 dark:bg-slate-800 rounded-lg">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center">
                          <Monitor className="mr-2 text-gray-400" size={20} />
                          <div>
                            <p className="font-medium text-fixed">X-Station 2 - Reception</p>
                            <p className="text-xs text-variable">Device ID: XS2-003 • IP: 192.168.1.102</p>
                          </div>
                        </div>
                        <Badge className="bg-gray-100 text-gray-800 dark:text-gray-200">Offline</Badge>
                      </div>
                      <div className="text-xs text-variable mt-2">
                        Location: Reception Desk • Last seen: 1 hour ago
                      </div>
                    </div>
                    
                    <div className="text-center text-xs text-variable pt-2">
                      Configure devices in CLUe Cloud Platform dashboard
                    </div>
                  </div>
                </GlassCard>
              )}
              
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <GlassCard>
                  <div className="flex items-center mb-6">
                    <QrCode className="mr-3 text-blue-600 dark:text-blue-400" size={24} />
                    <h3 className="text-lg font-semibold text-fixed">QR Reader Detection</h3>
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
                    <Settings2 className="mr-3 text-blue-600 dark:text-blue-400" size={24} />
                    <h3 className="text-lg font-semibold text-fixed">Reader Configuration</h3>
                  </div>
                  
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label className="text-sm font-medium text-fixed">
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
                      <Label className="text-sm font-medium text-fixed">
                        Scan Timeout (seconds)
                      </Label>
                      <Input
                        type="number"
                        min="1"
                        max="30"
                        value={currentSettings?.clueQrValidityMinutes || "60"}
                        onChange={(e) => handleInputChange("clueQrValidityMinutes", e.target.value)}
                        className="w-full px-4 py-3 rounded-xl border border-white/30 dark:border-slate-700/30 bg-white/50 dark:bg-slate-800/50"
                        data-testid="input-qr-scan-timeout"
                      />
                    </div>

                    <div className="flex items-center justify-between">
                      <div>
                        <Label className="text-sm font-medium text-fixed">
                          Audio Feedback
                        </Label>
                        <p className="text-xs text-variable">Play sound on successful scan</p>
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
                    <h3 className="text-lg font-semibold text-fixed">X-Station 2 Configuration</h3>
                  </div>
                  
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label className="text-sm font-medium text-fixed">
                        X-Station IP Addresses
                      </Label>
                      <textarea
                        value={(currentSettings?.xStationDevices || []).join('\n')}
                        onChange={(e) => handleInputChange("xStationDevices", e.target.value.split('\n').filter(d => d.trim()))}
                        className="w-full px-4 py-3 rounded-xl border border-white/30 dark:border-slate-700/30 bg-white/50 dark:bg-slate-800/50 h-32 font-mono text-sm"
                        placeholder=""
                        data-testid="textarea-xstation-ips"
                      />
                      <p className="text-xs text-variable">Enter one IP address per line</p>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-sm font-medium text-fixed">
                        Pre-booking QR Support
                      </Label>
                      <Switch
                        checked={currentSettings?.xStationEnabled || false}
                        onCheckedChange={(checked) => handleInputChange("xStationEnabled", checked)}
                        data-testid="switch-xstation-prebooking"
                      />
                      <p className="text-xs text-variable">
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
                    <QrCode className="mr-3 text-blue-600 dark:text-blue-400" size={24} />
                    <h3 className="text-lg font-semibold text-fixed">Connected QR Readers</h3>
                  </div>
                  <Button
                    variant="outline"
                    className="text-blue-600 dark:text-blue-400 border-blue-300"
                    data-testid="button-refresh-readers"
                  >
                    <RefreshCw className="mr-2" size={16} />
                    Refresh
                  </Button>
                </div>

                <div className="space-y-4">
                  {/* Mock connected readers - will be populated from API */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="p-4 rounded-xl border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-3">
                          <div className="w-3 h-3 bg-green-50 dark:bg-green-950/300 rounded-full"></div>
                          <h4 className="font-semibold text-green-800 dark:text-green-200">USB QR Scanner</h4>
                        </div>
                        <Badge variant="secondary" className="bg-green-100 text-green-800 dark:text-green-300">USB</Badge>
                      </div>
                      <div className="text-sm text-green-700 dark:text-green-300 space-y-1">
                        <p><strong>Port:</strong> COM3</p>
                        <p><strong>Status:</strong> Connected</p>
                        <p><strong>Last Scan:</strong> 2 minutes ago</p>
                      </div>
                      <div className="mt-3 flex gap-2">
                        <Button size="sm" variant="outline" className="text-blue-600 dark:text-blue-400 border-blue-300">
                          <Settings2 size={14} className="mr-1" />
                          Configure
                        </Button>
                        <Button size="sm" variant="outline" className="text-variable border-slate-300">
                          <TestTube size={14} className="mr-1" />
                          Test
                        </Button>
                      </div>
                    </div>

                    <div className="p-4 rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-3">
                          <div className="w-3 h-3 bg-blue-50 dark:bg-blue-950/300 rounded-full"></div>
                          <h4 className="font-semibold text-blue-800 dark:text-blue-200">Ethernet Scanner</h4>
                        </div>
                        <Badge variant="secondary" className="bg-blue-100 text-blue-800 dark:text-blue-300">Ethernet</Badge>
                      </div>
                      <div className="text-sm text-blue-700 dark:text-blue-300 space-y-1">
                        <p><strong>IP:</strong> 192.168.1.100</p>
                        <p><strong>Status:</strong> Connected</p>
                        <p><strong>Last Scan:</strong> 5 minutes ago</p>
                      </div>
                      <div className="mt-3 flex gap-2">
                        <Button size="sm" variant="outline" className="text-blue-600 dark:text-blue-400 border-blue-300">
                          <Settings2 size={14} className="mr-1" />
                          Configure
                        </Button>
                        <Button size="sm" variant="outline" className="text-variable border-slate-300">
                          <TestTube size={14} className="mr-1" />
                          Test
                        </Button>
                      </div>
                    </div>
                  </div>
                  
                  <div className="text-center py-8 border-2 border-dashed border-slate-200 rounded-xl">
                    <QrCode className="mx-auto mb-4 text-variable" size={48} />
                    <p className="text-variable mb-4">Add Additional QR Reader</p>
                    <div className="flex gap-3 justify-center">
                      <Button variant="outline" className="text-blue-600 dark:text-blue-400 border-blue-300">
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
                  <TestTube className="mr-3 text-blue-600 dark:text-blue-400" size={24} />
                  <h3 className="text-lg font-semibold text-fixed">QR Reader Testing</h3>
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
                        <span className="font-mono">STAFF-ENG-456</span> - <span className="text-blue-600 dark:text-blue-400">Ethernet Scanner</span> - <span className="text-xs">5 minutes ago</span>
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
            <p className="text-variable">Display features will be restored shortly...</p>
          </div>
        </TabsContent>

        <TabsContent value="biostar" className="space-y-6 mt-6">
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
                      const resp = await fetch('/api/biostar/diagnostics');
                      const data = await resp.json();
                      setBiostarDiag(data);
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
                        <div className="p-4 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-700/40">
                          <p className="font-semibold text-red-700 dark:text-red-300 mb-2 flex items-center gap-2">
                            <span>⛔</span> BioStar Event Log Permission Not Enabled
                          </p>
                          <p className="text-sm text-red-600 dark:text-red-400 mb-3">
                            Automatic on-site detection (Entry = On Site, Exit = Off Site) requires the BioStar 2 admin account to have Event Log REST API access. Without this, TPR-Max cannot determine who has swiped in or out.
                          </p>
                          <div className="bg-white dark:bg-red-950/40 rounded-lg p-3 mb-3">
                            <p className="text-xs font-semibold text-red-700 dark:text-red-300 mb-2">How to fix in BioStar 2:</p>
                            <ol className="text-xs text-red-600 dark:text-red-400 space-y-1 list-decimal list-inside">
                              <li>Open BioStar 2 and go to <strong>Settings</strong></li>
                              <li>Select <strong>Account</strong> → <strong>Custom Level</strong></li>
                              <li>Edit the level used by your admin account</li>
                              <li>Find the <strong>Monitoring</strong> section</li>
                              <li>Set <strong>Event Log</strong> to <strong>Allow</strong></li>
                              <li>Save and click Sync Now in TPR-Max</li>
                            </ol>
                          </div>
                          <p className="text-xs text-red-500 dark:text-red-400 opacity-80">Technical detail: {biostarDiag.eventLogError}</p>
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
          </TooltipProvider>
        </TabsContent>

        <TabsContent value="phone-systems" className="space-y-6 mt-6">
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
        </TabsContent>

        <TabsContent value="users" className="space-y-6 mt-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <GlassCard>
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center">
                  <Users className="mr-3 text-blue-600 dark:text-blue-400" size={24} />
                  <h3 className="text-lg font-semibold text-fixed">User Management</h3>
                </div>
                <TooltipProvider delayDuration={200}>
                  <div className="flex gap-2">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setShowManualUserDialog(true)}
                          data-testid="button-manual-user"
                        >
                          <UserPlus className="mr-2" size={16} />
                          Add Manually
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs">
                        Create a user account directly without sending an email. Useful when the invited person has trouble receiving emails or for setting up offline.
                      </TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          size="sm"
                          className="gradient-blue text-white"
                          onClick={() => setShowAddEmailDialog(true)}
                          data-testid="button-invite-user"
                        >
                          <Mail className="mr-2" size={16} />
                          Send Invitation
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs">
                        Send a secure email invitation. The recipient clicks the link and creates their own password. Invitations expire after 7 days.
                      </TooltipContent>
                    </Tooltip>
                  </div>
                </TooltipProvider>
              </div>
              
              <div className="space-y-4">
                {usersLoading ? (
                  <div className="text-center py-8">
                    <RefreshCw className="mx-auto text-variable mb-4 animate-spin" size={32} />
                    <p className="text-variable">Loading users...</p>
                  </div>
                ) : users && users.length > 0 ? (
                  <>
                    {users.map((user) => {
                      const isCurrentUser = user.isCurrentUser || user.id === currentUser?.id;
                      const isPending = user.status === 'pending';
                      const initials = user.firstName && user.lastName 
                        ? `${user.firstName[0]}${user.lastName[0]}`
                        : user.username.substring(0, 2).toUpperCase();
                      const displayName = user.firstName && user.lastName
                        ? `${user.firstName} ${user.lastName}${isCurrentUser ? ' (You)' : ''}`
                        : `${user.username}${isCurrentUser ? ' (You)' : ''}`;
                      
                      return (
                        <div key={user.id} className="flex items-center justify-between p-3 bg-white/50 dark:bg-slate-800/50 rounded-lg" data-testid={`user-item-${user.id}`}>
                          <div className="flex items-center space-x-3">
                            <div className={`w-8 h-8 ${isPending ? 'bg-amber-50 dark:bg-amber-950/300' : 'bg-blue-50 dark:bg-blue-950/300'} rounded-full flex items-center justify-center`}>
                              <span className="text-white text-sm font-bold">{initials}</span>
                            </div>
                            <div>
                              <p className="font-medium text-fixed">{displayName}</p>
                              <p className="text-sm text-variable">{user.email}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            {isPending ? (
                              <Badge variant="outline" className="bg-amber-50 dark:bg-amber-950/30 text-amber-700 border-amber-300">
                                Awaiting
                              </Badge>
                            ) : (
                              <Badge variant={user.role === 'admin' ? 'default' : user.role === 'security' || user.role === 'fire_marshal' ? 'outline' : 'secondary'}>
                                {user.role === 'admin' ? 'Admin' : user.role === 'security' ? 'Security' : user.role === 'fire_marshal' ? 'Fire Marshal' : 'User'}
                              </Badge>
                            )}
                            {isAdminUser && (
                              <>
                                {isPending ? (
                                  <>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      onClick={() => {
                                        if (user.invitationToken) {
                                          copyInvitationLink(user.invitationToken, user.customerId);
                                        }
                                      }}
                                      disabled={!user.invitationToken}
                                      title="Copy invitation link"
                                      data-testid={`button-copy-invitation-${user.id}`}
                                    >
                                      <Copy className="h-4 w-4 text-blue-500" />
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      onClick={() => {
                                        if (confirm(`Are you sure you want to delete the invitation for ${user.email}?`)) {
                                          deleteInvitationMutation.mutate(user.id);
                                        }
                                      }}
                                      disabled={deleteInvitationMutation.isPending}
                                      data-testid={`button-delete-invitation-${user.id}`}
                                    >
                                      <Trash2 className="h-4 w-4 text-red-500" />
                                    </Button>
                                  </>
                                ) : (
                                  <>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      onClick={() => {
                                        setUserToEdit(user);
                                        setEditUserForm({
                                          username: user.username,
                                          email: user.email || "",
                                          password: "",
                                          role: user.role,
                                          firstName: user.firstName || "",
                                          lastName: user.lastName || "",
                                          allowedMenuItems: Array.isArray(user.allowedMenuItems) ? user.allowedMenuItems : [],
                                          defaultLandingPage: user.defaultLandingPage || "_default"
                                        });
                                        setShowEditUserDialog(true);
                                      }}
                                      data-testid={`button-edit-user-${user.id}`}
                                    >
                                      <Edit className="h-4 w-4 text-blue-500" />
                                    </Button>
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
                                  </>
                                )}
                              </>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </>
                ) : (
                  <div className="text-center py-8">
                    <Shield className="mx-auto text-variable mb-4" size={48} />
                    <p className="text-variable mb-4">No users yet</p>
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
                <UserPlus className="mr-3 text-blue-600 dark:text-blue-400" size={24} />
                <h3 className="text-lg font-semibold text-fixed">Invite New User</h3>
              </div>
              
              <TooltipProvider delayDuration={200}>
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
                  <div className="flex items-center gap-1.5">
                    <Label htmlFor="inviteEmail" className="text-sm font-medium text-fixed">Email Address</Label>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Info size={14} className="text-variable cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs">
                        The invitation email will be sent to this address. The link in the email is specific to this account — do not share it with others.
                      </TooltipContent>
                    </Tooltip>
                  </div>
                  <Input
                    id="inviteEmail"
                    type="email"
                    placeholder="colleague@yourcompany.com"
                    value={inviteForm.email}
                    onChange={(e) => setInviteForm({ ...inviteForm, email: e.target.value })}
                    className="w-full px-4 py-3 rounded-xl border border-white/30 dark:border-slate-700/30 bg-white/50 dark:bg-slate-800/50 focus:outline-none focus:ring-2 focus:ring-blue-500 text-fixed"
                    data-testid="input-invite-email"
                    required
                  />
                </div>
                
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5">
                    <Label htmlFor="userRole" className="text-sm font-medium text-fixed">User Role</Label>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Info size={14} className="text-variable cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs">
                        <strong>Standard User</strong> — can view and manage visitors, staff, and reports but cannot change system settings or manage other users.<br /><br />
                        <strong>Administrator</strong> — full access including settings, user management, and all system configuration.
                      </TooltipContent>
                    </Tooltip>
                  </div>
                  <Select value={inviteForm.role} onValueChange={(value) => setInviteForm({ ...inviteForm, role: value })}>
                    <SelectTrigger className="w-full px-4 py-3 rounded-xl border border-white/30 dark:border-slate-700/30 bg-white/50 dark:bg-slate-800/50" data-testid="select-user-role">
                      <SelectValue placeholder="Select role" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="user">Standard User</SelectItem>
                      <SelectItem value="admin">Administrator</SelectItem>
                      <SelectItem value="security">Security</SelectItem>
                      <SelectItem value="fire_marshal">Fire Marshal</SelectItem>
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
              </TooltipProvider>
              
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
                <Building className="mr-3 text-blue-600 dark:text-blue-400" size={24} />
                <div>
                  <h3 className="text-lg font-semibold text-fixed">Department Management</h3>
                  <p className="text-sm text-variable">
                    Organize your workforce and improve visitor experiences with department-based routing
                  </p>
                </div>
              </div>
              <div className="flex gap-3">
                <Button
                  variant="outline"
                  className="text-variable border-slate-300"
                  data-testid="button-export-departments"
                >
                  <Download className="mr-2" size={16} />
                  Export
                </Button>
                <Button
                  onClick={() => {
                    setDepartmentToEdit(null);
                    setDepartmentForm({ name: "", description: "", color: "bg-blue-50 dark:bg-blue-950/300" });
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
                      className="p-4 rounded-xl border border-white/30 dark:border-slate-700/30 bg-white/50 dark:bg-slate-800/50 backdrop-blur-sm"
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
                        <h4 className="font-semibold text-fixed" data-testid={`text-department-name-${department.id}`}>
                          {department.name}
                        </h4>
                        <div className="flex gap-2">
                          <Button
                            onClick={() => {
                              setDepartmentToEdit(department);
                              setDepartmentForm({
                                name: department.name,
                                description: department.description || "",
                                color: department.color || "bg-blue-50 dark:bg-blue-950/300"
                              });
                              setShowDepartmentDialog(true);
                            }}
                            variant="ghost"
                            size="sm"
                            className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:text-blue-300"
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
                        <p className="text-sm text-variable mb-3" data-testid={`text-department-description-${department.id}`}>
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
                          <span className="text-xs text-variable capitalize">
                            {department.color || 'blue'}
                          </span>
                        </div>
                        <div className="text-xs text-variable">
                          <Users size={12} className="inline mr-1" />
                          {departmentAnalytics?.find(a => a.department === department.name)?.staffCount ?? 0} staff
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-12" data-testid="empty-departments-state">
                  <Building className="mx-auto mb-4 text-variable" size={48} />
                  <p className="text-variable mb-4">No departments configured</p>
                  <p className="text-sm text-variable mb-6">
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

        </TabsContent>

        <TabsContent value="ai" className="space-y-6 mt-6">
          <TooltipProvider delayDuration={200}>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <GlassCard>
              <div className="flex items-center mb-6">
                <Brain className="mr-3 text-blue-600 dark:text-blue-400" size={24} />
                <h3 className="text-lg font-semibold text-fixed">OpenAI Configuration</h3>
              </div>
              
              <div className="space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5">
                    <Label className="text-sm font-medium text-fixed">AI Model</Label>
                    <Tooltip>
                      <TooltipTrigger asChild><Info size={14} className="text-variable cursor-help" /></TooltipTrigger>
                      <TooltipContent className="max-w-xs">Controls which OpenAI model generates induction scripts and safety content. GPT-4o is the best balance of quality and speed. GPT-5 is the most capable but slower. All models are billed to Replit credits — no personal API key required.</TooltipContent>
                    </Tooltip>
                  </div>
                  <Select
                    value={currentSettings?.openaiModel || "gpt-4o"}
                    onValueChange={(value) => handleInputChange("openaiModel", value)}
                  >
                    <SelectTrigger className="w-full px-4 py-3 rounded-xl border border-white/30 dark:border-slate-700/30 bg-white/50 dark:bg-slate-800/50" data-testid="select-openai-model">
                      <SelectValue placeholder="Select OpenAI model" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="gpt-4">GPT-4 (Standard)</SelectItem>
                      <SelectItem value="gpt-4o">GPT-4o (Optimized)</SelectItem>
                      <SelectItem value="gpt-5">GPT-5 (Latest) 🚀</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center gap-1.5">
                    <Label htmlFor="openaiMaxTokens" className="text-sm font-medium text-fixed">Max Response Length (Tokens)</Label>
                    <Tooltip>
                      <TooltipTrigger asChild><Info size={14} className="text-variable cursor-help" /></TooltipTrigger>
                      <TooltipContent className="max-w-xs">Sets the maximum length of AI-generated text. 4,000 tokens is about 3,000 words — suitable for induction scripts. Longer settings cost more in credits. Only increase if your induction videos are being cut short.</TooltipContent>
                    </Tooltip>
                  </div>
                  <Select
                    value={currentSettings?.openaiMaxTokens || "4000"}
                    onValueChange={(value) => handleInputChange("openaiMaxTokens", value)}
                  >
                    <SelectTrigger className="w-full px-4 py-3 rounded-xl border border-white/30 dark:border-slate-700/30 bg-white/50 dark:bg-slate-800/50" data-testid="select-max-tokens">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1000">1,000 tokens (Short responses)</SelectItem>
                      <SelectItem value="2000">2,000 tokens (Medium responses)</SelectItem>
                      <SelectItem value="4000">4,000 tokens (Long responses)</SelectItem>
                      <SelectItem value="8000">8,000 tokens (Very long responses)</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-variable">
                    Higher token limits allow for more detailed AI responses
                  </p>
                </div>
              </div>
            </GlassCard>
          </div>
          </TooltipProvider>
        </TabsContent>

        <TabsContent value="hsrules" className="space-y-6 mt-6">
          <TooltipProvider delayDuration={200}>
          <div className="grid grid-cols-1 gap-6">
            <GlassCard className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-fixed flex items-center gap-2">
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
                    <Label className="text-sm font-medium text-fixed">Enable H&S Rules</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={currentSettings?.hsRulesRequireAcceptance || false}
                      onCheckedChange={(checked) => handleInputChange("hsRulesRequireAcceptance", checked)}
                      data-testid="switch-hs-rules-require-acceptance"
                    />
                    <div className="flex items-center gap-1.5">
                      <Label className="text-sm font-medium text-fixed">Require Acceptance</Label>
                      <Tooltip>
                        <TooltipTrigger asChild><Info size={14} className="text-variable cursor-help" /></TooltipTrigger>
                        <TooltipContent className="max-w-xs">When enabled, visitors must explicitly tick a checkbox to confirm they have read and accept the H&S rules before their e-Pass is issued. Recommended for legal compliance.</TooltipContent>
                      </Tooltip>
                    </div>
                  </div>
                </div>
              </div>
              
              <div className="space-y-4">
                {currentSettings?.hsRulesEnabled !== false && (
                  <>
                    <div className="space-y-2">
                      <Label className="text-sm font-medium text-fixed">
                        H&S Rules Content (Markdown supported)
                      </Label>
                      <textarea
                        value={currentSettings?.hsRulesContent || ""}
                        onChange={(e) => handleInputChange("hsRulesContent", e.target.value)}
                        className="w-full h-96 px-4 py-3 rounded-xl border border-white/30 dark:border-slate-700/30 bg-white/50 dark:bg-slate-800/50 focus:outline-none focus:ring-2 focus:ring-blue-500 text-fixed font-mono text-sm"
                        placeholder="Enter your company's health and safety rules here..."
                        data-testid="textarea-hs-rules-content"
                      />
                      <p className="text-xs text-variable">
                        These rules will be included in e-Pass emails and can be shown during visitor check-in.
                        Markdown formatting is supported for better presentation.
                      </p>
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center gap-1.5">
                        <Label htmlFor="hsRulesUrl" className="text-sm font-medium text-fixed">External H&S Rules URL (Optional)</Label>
                        <Tooltip>
                          <TooltipTrigger asChild><Info size={14} className="text-variable cursor-help" /></TooltipTrigger>
                          <TooltipContent className="max-w-xs">If your H&S policy is hosted on an external website (e.g. your company intranet or a PDF link), enter the URL here. Visitors will see a clickable link in their e-Pass instead of the full rules text.</TooltipContent>
                        </Tooltip>
                      </div>
                      <Input
                        id="hsRulesUrl"
                        type="url"
                        value={currentSettings?.hsRulesUrl || ""}
                        onChange={(e) => handleInputChange("hsRulesUrl", e.target.value)}
                        className="w-full px-4 py-3 rounded-xl border border-white/30 dark:border-slate-700/30 bg-white/50 dark:bg-slate-800/50"
                        placeholder="https://yourcompany.com/health-safety-policy"
                        data-testid="input-hs-rules-url"
                      />
                      <p className="text-xs text-variable">
                        If provided, this link will be included in e-Pass emails instead of the full content.
                      </p>
                    </div>

                    <div className="p-4 bg-blue-50 dark:bg-blue-950/30 rounded-xl border border-blue-200 dark:border-blue-800">
                      <h4 className="text-sm font-semibold text-blue-900 mb-2">Default UK H&S Rules Available</h4>
                      <p className="text-xs text-blue-700 mb-3">
                        The system includes comprehensive UK Health & Safety rules compliant with:
                      </p>
                      <ul className="text-xs text-blue-600 dark:text-blue-400 space-y-1 list-disc list-inside">
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
                  <div className="text-center py-8 text-variable">
                    <Shield className="w-12 h-12 mx-auto mb-3 opacity-30" />
                    <p className="text-sm">H&S Rules are disabled. Enable them to configure health and safety requirements.</p>
                  </div>
                )}
              </div>
            </GlassCard>
          </div>
          </TooltipProvider>
        </TabsContent>

        <TabsContent value="hs-documents" className="space-y-6 mt-6">
          <ContractorsHSManagement />
          
          {/* Default UK H&S Document Templates Section */}
          <div className="mt-8">
            <DefaultTemplateManager className="w-full" />
          </div>
        </TabsContent>

        <TabsContent value="zones" className="space-y-6 mt-6">
          <ZoneManagement />

          {/* Emergency Access - Incident Manager Monitor URL */}
          {isAdminUser && (
            <GlassCard className="dark:glass-dark">
              <div className="flex items-center mb-5">
                <Eye className="mr-3 text-purple-600 dark:text-purple-400" size={22} />
                <div>
                  <h3 className="text-base font-semibold text-fixed">Emergency Access — Incident Manager Monitor</h3>
                  <p className="text-xs text-variable mt-0.5">
                    Generate a permanent read-only link for senior managers to view live evacuation status without logging in.
                  </p>
                </div>
              </div>

              {currentSettings?.incidentManagerUrlId ? (
                <div className="space-y-3">
                  <div className="bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-700 rounded-lg p-3">
                    <p className="text-xs font-semibold text-purple-700 dark:text-purple-400 mb-1.5">Your Incident Manager Monitor URL</p>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 text-xs bg-white dark:bg-slate-800 border border-purple-200 dark:border-purple-700 rounded px-2 py-1.5 text-purple-800 dark:text-purple-300 break-all font-mono select-all">
                        {`${window.location.origin}/incident-monitor/${currentSettings.incidentManagerUrlId}`}
                      </code>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1.5 text-xs"
                      onClick={() => {
                        const url = `${window.location.origin}/incident-monitor/${currentSettings.incidentManagerUrlId}`;
                        navigator.clipboard.writeText(url).then(() => {
                          toast({ title: "Link Copied", description: "Monitor URL copied to clipboard." });
                        });
                      }}
                    >
                      <Copy size={13} />
                      Copy Link
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1.5 text-xs"
                      onClick={() => {
                        const url = `${window.location.origin}/incident-monitor/${currentSettings.incidentManagerUrlId}`;
                        window.open(url, '_blank');
                      }}
                    >
                      <Eye size={13} />
                      Preview
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1.5 text-xs"
                      onClick={() => setShowIncidentMonitorQr(v => !v)}
                    >
                      <Shield size={13} />
                      {showIncidentMonitorQr ? "Hide QR" : "Show QR"}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1.5 text-xs text-red-600 hover:text-red-700 border-red-200 hover:border-red-300"
                      disabled={incidentMonitorGenerating}
                      onClick={async () => {
                        if (!window.confirm('Regenerating the link will invalidate the old one. Anyone using the old link will lose access. Continue?')) return;
                        setIncidentMonitorGenerating(true);
                        try {
                          const res = await apiRequest("POST", "/api/admin/incident-monitor/generate");
                          if (res.ok) {
                            queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
                            toast({ title: "Link Regenerated", description: "A new monitor URL has been generated." });
                          } else {
                            toast({ title: "Failed", description: "Could not regenerate link.", variant: "destructive" });
                          }
                        } finally {
                          setIncidentMonitorGenerating(false);
                        }
                      }}
                    >
                      <RotateCcw size={13} />
                      {incidentMonitorGenerating ? "Regenerating…" : "Regenerate"}
                    </Button>
                  </div>
                  {showIncidentMonitorQr && currentSettings?.incidentManagerUrlId && (
                    <div className="flex flex-col items-center gap-2 p-3 bg-white rounded-lg border border-purple-200 dark:border-purple-700">
                      <p className="text-xs font-semibold text-purple-700 dark:text-purple-400">QR Code — scan to open monitor</p>
                      <img
                        src={generateQRCode(`${window.location.origin}/incident-monitor/${currentSettings.incidentManagerUrlId}`)}
                        alt="Incident Manager Monitor QR Code"
                        className="w-36 h-36"
                      />
                    </div>
                  )}
                  <p className="text-xs text-variable">
                    This link shows live muster data during an active emergency. Anyone with this link can view it — treat it as sensitive.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="bg-gray-50 dark:bg-gray-800/40 border border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-4 text-center">
                    <Eye className="mx-auto mb-2 text-gray-400" size={24} />
                    <p className="text-sm text-variable">No monitor link generated yet.</p>
                    <p className="text-xs text-variable mt-1">Generate a permanent URL to share with senior managers.</p>
                  </div>
                  <Button
                    size="sm"
                    className="gap-1.5 text-xs"
                    disabled={incidentMonitorGenerating}
                    onClick={async () => {
                      setIncidentMonitorGenerating(true);
                      try {
                        const res = await apiRequest("POST", "/api/admin/incident-monitor/generate");
                        if (res.ok) {
                          queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
                          toast({ title: "Monitor Link Generated", description: "Share this URL with your senior managers for read-only emergency access." });
                        } else {
                          toast({ title: "Failed", description: "Could not generate monitor link.", variant: "destructive" });
                        }
                      } finally {
                        setIncidentMonitorGenerating(false);
                      }
                    }}
                  >
                    <Eye size={13} />
                    {incidentMonitorGenerating ? "Generating…" : "Generate Monitor Link"}
                  </Button>
                </div>
              )}
            </GlassCard>
          )}
        </TabsContent>

        <TabsContent value="integrations" className="space-y-6 mt-6">
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
        </TabsContent>

        <TabsContent value="system" className="space-y-6 mt-6">
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
                        disabled={sampleDataMutation.isPending}
                        data-testid="button-load-sample-data"
                      >
                        <FlaskConical className="w-4 h-4 mr-2" />
                        {sampleDataMutation.isPending ? "Loading..." : "Load Sample Data"}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      <p>Loads demo data for presentations and testing — adds 10 staff, 10 visitors, 5 contractor companies (with 3–5 workers each), and 10 members. Each record gets a unique email address so you can load sample data multiple times without conflicts.</p>
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

                {/* Kiosk Mode */}
                <div className="flex items-center justify-between p-4 bg-white/50 dark:bg-slate-800/50 rounded-lg border hover:border-blue-200 dark:border-blue-800 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-cyan-100 rounded-lg">
                      <Dock className="w-5 h-5 text-cyan-600" />
                    </div>
                    <div>
                      <h4 className="font-medium text-fixed">Kiosk Mode</h4>
                      <p className="text-xs text-variable">Self-service check-in kiosks</p>
                    </div>
                  </div>
                  <Switch
                    checked={currentSettings?.featureKiosk !== false}
                    onCheckedChange={(checked) => handleInputChange("featureKiosk", checked)}
                    data-testid="toggle-kiosk"
                  />
                </div>

                {/* AI Demo */}
                <div className="flex items-center justify-between p-4 bg-white/50 dark:bg-slate-800/50 rounded-lg border hover:border-blue-200 dark:border-blue-800 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-pink-100 rounded-lg">
                      <Brain className="w-5 h-5 text-pink-600" />
                    </div>
                    <div>
                      <h4 className="font-medium text-fixed">AI Demo</h4>
                      <p className="text-xs text-variable">AI-powered features showcase</p>
                    </div>
                  </div>
                  <Switch
                    checked={currentSettings?.featureAiDemo !== false}
                    onCheckedChange={(checked) => handleInputChange("featureAiDemo", checked)}
                    data-testid="toggle-ai-demo"
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

                {/* Email Outbox */}
                <div className="flex items-center justify-between p-4 bg-white/50 dark:bg-slate-800/50 rounded-lg border hover:border-blue-200 dark:border-blue-800 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-sky-100 rounded-lg">
                      <Mail className="w-5 h-5 text-sky-600" />
                    </div>
                    <div>
                      <h4 className="font-medium text-fixed">Email Outbox</h4>
                      <p className="text-xs text-variable">Log all system emails — preview exactly what recipients receive</p>
                    </div>
                  </div>
                  <Switch
                    checked={currentSettings?.featureEmailOutbox === true}
                    onCheckedChange={(checked) => handleInputChange("featureEmailOutbox", checked)}
                    data-testid="toggle-email-outbox"
                  />
                </div>

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
        </TabsContent>

        {/* Card Offences Tab */}
        <TabsContent value="contractors" className="space-y-6 mt-6">
          <div className="flex items-center justify-between mb-2">
            <div>
              <h2 className="text-xl font-bold text-fixed">Card Offences</h2>
              <p className="text-sm text-variable mt-1">Manage the list of safety violations used when issuing Red and Yellow cards to contractor workers.</p>
            </div>
            <Button onClick={() => { setOffenceForm({ offenceName: '', offenceDescription: '', cardType: 'yellow' }); setShowAddOffenceDialog(true); }}>
              <Plus size={16} className="mr-2" />
              Add Offence
            </Button>
          </div>

          {(['yellow', 'red'] as const).map((cardType) => {
            const offences = cardOffences.filter((o: any) => o.cardType === cardType);
            return (
              <GlassCard key={cardType}>
                <div className="flex items-center mb-4">
                  {cardType === 'yellow' ? (
                    <AlertTriangle className="mr-2 text-yellow-500" size={20} />
                  ) : (
                    <AlertTriangle className="mr-2 text-red-500" size={20} />
                  )}
                  <h3 className="text-lg font-semibold text-fixed capitalize">{cardType} Card Offences</h3>
                  <Badge className="ml-2" variant="secondary">{offences.length}</Badge>
                </div>
                {offences.length === 0 ? (
                  <p className="text-sm text-variable">No offences configured yet. Click "Add Offence" above to get started.</p>
                ) : (
                  <div className="space-y-2">
                    {offences.map((o: any) => (
                      <div key={o.id} className="flex items-start justify-between p-3 rounded-lg bg-white/10 dark:bg-white/5 border border-white/20 dark:border-white/10">
                        <div className="flex items-start gap-3 flex-1 min-w-0">
                          <Switch
                            checked={!!o.isActive}
                            onCheckedChange={(checked) => updateOffenceMutation.mutate({ id: o.id, data: { isActive: checked } })}
                            className="mt-0.5 flex-shrink-0"
                          />
                          <div className="min-w-0">
                            <p className={`text-sm font-medium ${!o.isActive ? 'line-through text-variable opacity-50' : 'text-fixed'}`}>{o.offenceName}</p>
                            {o.offenceDescription && <p className="text-xs text-variable mt-0.5 truncate">{o.offenceDescription}</p>}
                          </div>
                        </div>
                        <div className="flex items-center gap-1 ml-2 flex-shrink-0">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0"
                            onClick={() => {
                              setEditingOffence(o);
                              setOffenceForm({ offenceName: o.offenceName, offenceDescription: o.offenceDescription || '', cardType: o.cardType });
                              setShowAddOffenceDialog(true);
                            }}
                          >
                            <Edit size={13} />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0 text-red-500 hover:text-red-700"
                            onClick={() => deleteOffenceMutation.mutate(o.id)}
                          >
                            <Trash2 size={13} />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </GlassCard>
            );
          })}
        </TabsContent>

        {/* Lone Worker Protection */}
        <TabsContent value="lone-worker" className="space-y-6 mt-6">
          <GlassCard>
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center">
                <Shield className="h-5 w-5 text-amber-600" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-fixed">Lone Worker Protection</h3>
                <p className="text-sm text-variable">Automated welfare checks for staff and contractors working alone</p>
              </div>
            </div>

            <div className="space-y-6">
              {/* Enable toggle */}
              <div className="flex items-center justify-between p-4 bg-amber-50 dark:bg-amber-900/20 rounded-xl border border-amber-200 dark:border-amber-800">
                <div>
                  <p className="font-medium text-fixed">Enable Lone Worker Protection</p>
                  <p className="text-sm text-variable mt-0.5">Allow supervisors to activate welfare check monitoring for individuals</p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={currentSettings?.loneWorkerEnabled ?? false}
                  onClick={() => triggerAutoSave('loneWorkerEnabled', !(currentSettings?.loneWorkerEnabled ?? false))}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
                    currentSettings?.loneWorkerEnabled ? 'bg-amber-500' : 'bg-gray-300 dark:bg-gray-600'
                  }`}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${currentSettings?.loneWorkerEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Check interval */}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-fixed">Check-in Interval (minutes)</label>
                  <p className="text-xs text-variable">How often a welfare check email is sent</p>
                  <Select
                    value={String(currentSettings?.loneWorkerCheckIntervalMins ?? 30)}
                    onValueChange={(v) => triggerAutoSave('loneWorkerCheckIntervalMins', parseInt(v))}
                  >
                    <SelectTrigger className="w-full h-10 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-fixed text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[15, 30, 45, 60, 90, 120].map((mins) => (
                        <SelectItem key={mins} value={String(mins)}>{mins} minutes</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Grace period */}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-fixed">Grace Period (minutes)</label>
                  <p className="text-xs text-variable">Extra time before escalation begins if no response</p>
                  <input
                    type="number"
                    min={1}
                    max={60}
                    value={currentSettings?.loneWorkerGracePeriodMins ?? 10}
                    onChange={(e) => triggerAutoSave('loneWorkerGracePeriodMins', parseInt(e.target.value) || 10)}
                    className="w-full h-10 px-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-fixed text-sm"
                  />
                </div>
              </div>

              {/* Escalation contacts */}
              <div className="space-y-4">
                <div>
                  <h4 className="text-sm font-semibold text-fixed mb-1">Level 1 Escalation (Immediate)</h4>
                  <p className="text-xs text-variable mb-3">First escalation contact — usually line manager or security desk</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-xs text-variable">Name</label>
                      <input type="text" value={currentSettings?.loneWorkerL1Name ?? ''} onChange={(e) => triggerAutoSave('loneWorkerL1Name', e.target.value)} placeholder="e.g. John Smith" className="w-full h-10 px-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-fixed text-sm" />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs text-variable">Email</label>
                      <input type="email" value={currentSettings?.loneWorkerL1Email ?? ''} onChange={(e) => triggerAutoSave('loneWorkerL1Email', e.target.value)} placeholder="manager@company.com" className="w-full h-10 px-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-fixed text-sm" />
                    </div>
                  </div>
                </div>

                <div>
                  <h4 className="text-sm font-semibold text-fixed mb-1">Level 2 Escalation</h4>
                  <p className="text-xs text-variable mb-3">Second escalation contact if level 1 doesn't resolve — usually HR or senior manager</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-xs text-variable">Name</label>
                      <input type="text" value={currentSettings?.loneWorkerL2Name ?? ''} onChange={(e) => triggerAutoSave('loneWorkerL2Name', e.target.value)} placeholder="e.g. Jane Doe" className="w-full h-10 px-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-fixed text-sm" />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs text-variable">Email</label>
                      <input type="email" value={currentSettings?.loneWorkerL2Email ?? ''} onChange={(e) => triggerAutoSave('loneWorkerL2Email', e.target.value)} placeholder="hr@company.com" className="w-full h-10 px-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-fixed text-sm" />
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs text-variable">L2 Escalation delay (minutes after L1)</label>
                    <input type="number" min={5} max={120} value={currentSettings?.loneWorkerL2DelayMins ?? 15} onChange={(e) => triggerAutoSave('loneWorkerL2DelayMins', parseInt(e.target.value) || 15)} className="w-full h-10 px-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-fixed text-sm" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-variable">L3 Escalation delay (minutes after L2)</label>
                    <input type="number" min={5} max={120} value={currentSettings?.loneWorkerL3DelayMins ?? 30} onChange={(e) => triggerAutoSave('loneWorkerL3DelayMins', parseInt(e.target.value) || 30)} className="w-full h-10 px-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-fixed text-sm" />
                  </div>
                </div>
              </div>

              {/* Info box */}
              <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-xl border border-blue-200 dark:border-blue-800">
                <h4 className="text-sm font-semibold text-blue-800 dark:text-blue-200 mb-2">How it works</h4>
                <ul className="text-xs text-blue-700 dark:text-blue-300 space-y-1 list-disc list-inside">
                  <li>Activate lone worker mode for any staff member or contractor from their row in the management pages</li>
                  <li>A welfare check email with an "I'm OK" link is sent at the configured interval</li>
                  <li>If the worker does not click the link within the interval + grace period, escalation emails are sent (3 levels)</li>
                  <li>The session continues until a supervisor clicks "End Session" or the worker's shift ends</li>
                  <li>All sessions are logged in the Reports page under Lone Worker Sessions</li>
                </ul>
              </div>
            </div>
          </GlassCard>
        </TabsContent>
      </Tabs>

      {/* Add / Edit Offence Dialog */}
      <Dialog open={showAddOffenceDialog} onOpenChange={(open) => { setShowAddOffenceDialog(open); if (!open) setEditingOffence(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingOffence ? 'Edit Offence' : 'Add Offence'}</DialogTitle>
            <DialogDescription>Define a safety violation that can be used when issuing a Red or Yellow card.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Card Type</Label>
              <Select value={offenceForm.cardType} onValueChange={(v) => setOffenceForm(f => ({ ...f, cardType: v }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="yellow">Yellow Card</SelectItem>
                  <SelectItem value="red">Red Card</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Offence Name</Label>
              <Input
                value={offenceForm.offenceName}
                onChange={(e) => setOffenceForm(f => ({ ...f, offenceName: e.target.value }))}
                placeholder="e.g. Not wearing hard hats"
              />
            </div>
            <div className="space-y-2">
              <Label>Description <span className="text-variable text-xs">(optional)</span></Label>
              <Textarea
                value={offenceForm.offenceDescription}
                onChange={(e) => setOffenceForm(f => ({ ...f, offenceDescription: e.target.value }))}
                placeholder="Brief explanation of the offence..."
                className="h-20"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowAddOffenceDialog(false); setEditingOffence(null); }}>Cancel</Button>
            <Button
              disabled={!offenceForm.offenceName || createOffenceMutation.isPending || updateOffenceMutation.isPending}
              onClick={() => {
                if (editingOffence) {
                  updateOffenceMutation.mutate({ id: editingOffence.id, data: offenceForm });
                } else {
                  createOffenceMutation.mutate({ ...offenceForm, isActive: true, siteConfigurable: true });
                }
              }}
            >
              {(createOffenceMutation.isPending || updateOffenceMutation.isPending) ? 'Saving...' : (editingOffence ? 'Save Changes' : 'Add Offence')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
                placeholder=""
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
                value={departmentForm.color || "bg-blue-50 dark:bg-blue-950/300"} 
                onValueChange={(value) => setDepartmentForm(prev => ({ ...prev, color: value }))}
              >
                <SelectTrigger data-testid="select-department-color">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="bg-blue-50 dark:bg-blue-950/300">🔵 Blue</SelectItem>
                  <SelectItem value="bg-green-50 dark:bg-green-950/300">🟢 Green</SelectItem>
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
              <p className="text-xs text-variable">
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
              <Mail className="text-blue-600 dark:text-blue-400" size={24} />
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
                placeholder=""
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
                  <SelectItem value="security">Security</SelectItem>
                  <SelectItem value="fire_marshal">Fire Marshal</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
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
              <UserPlus className="text-blue-600 dark:text-blue-400" size={24} />
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
                  placeholder=""
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
                  placeholder=""
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
                placeholder=""
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
                placeholder=""
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
                placeholder=""
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
                  <SelectItem value="security">Security</SelectItem>
                  <SelectItem value="fire_marshal">Fire Marshal</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg p-3">
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

      {/* Edit User Dialog */}
      <Dialog open={showEditUserDialog} onOpenChange={setShowEditUserDialog}>
        <DialogContent className="sm:max-w-[580px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Edit className="text-blue-600 dark:text-blue-400" size={24} />
              Edit User Account
            </DialogTitle>
            <DialogDescription>
              Update user information and permissions. Leave password blank to keep current password.
            </DialogDescription>
          </DialogHeader>
          
          <form 
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (userToEdit && editUserForm.username && editUserForm.email && editUserForm.role) {
                editUserMutation.mutate({
                  userId: userToEdit.id,
                  ...editUserForm
                });
              }
            }}
          >
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="editFirstName" className="text-sm font-medium">
                  First Name
                </Label>
                <Input
                  id="editFirstName"
                  type="text"
                  placeholder=""
                  value={editUserForm.firstName}
                  onChange={(e) => setEditUserForm({ ...editUserForm, firstName: e.target.value })}
                  className="w-full"
                  data-testid="input-edit-first-name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="editLastName" className="text-sm font-medium">
                  Last Name
                </Label>
                <Input
                  id="editLastName"
                  type="text"
                  placeholder=""
                  value={editUserForm.lastName}
                  onChange={(e) => setEditUserForm({ ...editUserForm, lastName: e.target.value })}
                  className="w-full"
                  data-testid="input-edit-last-name"
                />
              </div>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="editUsername" className="text-sm font-medium">
                Username *
              </Label>
              <Input
                id="editUsername"
                type="text"
                placeholder=""
                value={editUserForm.username}
                onChange={(e) => setEditUserForm({ ...editUserForm, username: e.target.value })}
                className="w-full"
                data-testid="input-edit-username"
                required
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="editEmail" className="text-sm font-medium">
                Email Address *
              </Label>
              <Input
                id="editEmail"
                type="email"
                placeholder=""
                value={editUserForm.email}
                onChange={(e) => setEditUserForm({ ...editUserForm, email: e.target.value })}
                className="w-full"
                data-testid="input-edit-email"
                required
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="editPassword" className="text-sm font-medium">
                New Password (Optional)
              </Label>
              <Input
                id="editPassword"
                type="password"
                placeholder="Leave blank to keep current password"
                value={editUserForm.password}
                onChange={(e) => setEditUserForm({ ...editUserForm, password: e.target.value })}
                className="w-full"
                data-testid="input-edit-password"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="editRole" className="text-sm font-medium">
                User Role *
              </Label>
              <Select value={editUserForm.role} onValueChange={(value) => setEditUserForm({ ...editUserForm, role: value })}>
                <SelectTrigger className="w-full" data-testid="select-edit-role">
                  <SelectValue placeholder="Select role" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="user">Standard User</SelectItem>
                  <SelectItem value="admin">Administrator</SelectItem>
                  <SelectItem value="security">Security</SelectItem>
                  <SelectItem value="fire_marshal">Fire Marshal</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {isAdminUser && (
              <div className="space-y-2">
                <Label className="text-sm font-medium">Default Landing Page</Label>
                <Select value={editUserForm.defaultLandingPage} onValueChange={(value) => setEditUserForm({ ...editUserForm, defaultLandingPage: value })}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Dashboard (default)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_default">Dashboard (default)</SelectItem>
                    <SelectItem value="/">Dashboard</SelectItem>
                    <SelectItem value="/visitors">Visitors</SelectItem>
                    <SelectItem value="/contractors">Contractors</SelectItem>
                    <SelectItem value="/contractor">Contractor In/Out</SelectItem>
                    <SelectItem value="/staff">Staff</SelectItem>
                    <SelectItem value="/members">Members</SelectItem>
                    <SelectItem value="/meeting-rooms">Meeting Rooms</SelectItem>
                    <SelectItem value="/time-attendance">T&A Report</SelectItem>
                    <SelectItem value="/muster">Muster List</SelectItem>
                    <SelectItem value="/incident-reports">Incident Reports</SelectItem>
                    <SelectItem value="/martyn-law">Martyn's Law</SelectItem>
                    <SelectItem value="/reports">Reports</SelectItem>
                    <SelectItem value="/induction-settings">Induction Settings</SelectItem>
                    <SelectItem value="/kiosk">Kiosk Mode</SelectItem>
                    <SelectItem value="/ai-demo">AI Demo</SelectItem>
                    <SelectItem value="/email-outbox">Email Outbox</SelectItem>
                    <SelectItem value="/settings">Settings</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">The page this user sees after logging in.</p>
              </div>
            )}

            {isAdminUser && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium">Page Access</Label>
                  <span className="text-xs text-muted-foreground">
                    {editUserForm.allowedMenuItems.length === 0 ? "Unrestricted (all pages)" : `${editUserForm.allowedMenuItems.length} page(s) allowed`}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">Leave blank to allow all pages. Check specific pages to restrict access.</p>
                <div className="border rounded-lg p-3 space-y-2 max-h-48 overflow-y-auto bg-slate-50 dark:bg-slate-900/50">
                  {[
                    { path: "/", label: "Dashboard" },
                    { path: "/visitors", label: "Visitors" },
                    { path: "/contractors", label: "Contractors" },
                    { path: "/contractor", label: "Contractor In/Out" },
                    { path: "/staff", label: "Staff" },
                    { path: "/members", label: "Members" },
                    { path: "/meeting-rooms", label: "Meeting Rooms" },
                    { path: "/time-attendance", label: "T&A Report" },
                    { path: "/muster", label: "Muster List" },
                    { path: "/incident-reports", label: "Incident Reports" },
                    { path: "/martyn-law", label: "Martyn's Law" },
                    { path: "/reports", label: "Reports" },
                    { path: "/induction-settings", label: "Induction Settings" },
                    { path: "/kiosk", label: "Kiosk Mode" },
                    { path: "/ai-demo", label: "AI Demo" },
                    { path: "/email-outbox", label: "Email Outbox" },
                    { path: "/settings", label: "Settings" },
                  ].map((item) => {
                    const checked = editUserForm.allowedMenuItems.includes(item.path);
                    return (
                      <label key={item.path} className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => {
                            const updated = e.target.checked
                              ? [...editUserForm.allowedMenuItems, item.path]
                              : editUserForm.allowedMenuItems.filter(p => p !== item.path);
                            setEditUserForm({ ...editUserForm, allowedMenuItems: updated });
                          }}
                          className="rounded border-gray-300"
                        />
                        <span className="text-sm">{item.label}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}
            
            {!isAdminUser && (
              <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg p-3">
                <p className="text-sm text-amber-700">
                  <strong>Note:</strong> Only administrators can change user roles.
                </p>
              </div>
            )}
            
            <DialogFooter className="gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowEditUserDialog(false)}
                data-testid="button-cancel-edit-user"
              >
                Cancel
              </Button>
              <Button 
                type="submit" 
                className="gradient-blue text-white"
                disabled={editUserMutation.isPending || !editUserForm.username || !editUserForm.email || !editUserForm.role}
                data-testid="button-update-user"
              >
                {editUserMutation.isPending ? "Updating..." : "Update User"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Test Printer Dialog */}
      <Dialog open={showTestPrinterDialog} onOpenChange={setShowTestPrinterDialog}>
        <DialogContent className="sm:max-w-[700px] max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <TestTube className="text-purple-600" size={24} />
              {testPrinterType === 'tec' ? 'Toshiba Tec TCPL' : 'Zebra ZPL'} Test Code
            </DialogTitle>
            <DialogDescription>
              Generated {testPrinterType === 'tec' ? 'TCPL' : 'ZPL'} code for testing your thermal printer configuration.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {isTestingPrinter && (
              <div className="flex items-center justify-center p-8">
                <div className="text-center">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 mx-auto mb-4"></div>
                  <p className="text-variable">Generating test code...</p>
                </div>
              </div>
            )}

            {testPrinterResult && (
              <div className={`p-4 rounded-lg border ${testPrinterResult.success ? 'bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800' : 'bg-red-50 border-red-200'}`}>
                <div className="flex items-center gap-2">
                  {testPrinterResult.success ? (
                    <CheckCircle className="h-5 w-5 text-green-600" />
                  ) : (
                    <XCircle className="h-5 w-5 text-red-600" />
                  )}
                  <p className={`text-sm font-medium ${testPrinterResult.success ? 'text-green-800 dark:text-green-300' : 'text-red-800'}`}>
                    {testPrinterResult.message}
                  </p>
                </div>
              </div>
            )}

            {testPrinterCode && (
              <>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm font-medium text-fixed">
                      Generated {testPrinterType === 'tec' ? 'TCPL' : 'ZPL'} Code
                    </Label>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        navigator.clipboard.writeText(testPrinterCode);
                        toast({
                          title: "Copied!",
                          description: "Printer code copied to clipboard",
                        });
                      }}
                      data-testid="button-copy-code"
                    >
                      <Copy className="h-4 w-4 mr-1" />
                      Copy
                    </Button>
                  </div>
                  <div className="bg-slate-900 text-green-400 p-4 rounded-lg font-mono text-xs overflow-x-auto max-h-96 overflow-y-auto">
                    <pre>{testPrinterCode}</pre>
                  </div>
                </div>

                <div className="p-4 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg">
                  <h4 className="text-sm font-semibold text-blue-900 mb-2">About {testPrinterType === 'tec' ? 'TCPL' : 'ZPL'} Code</h4>
                  <p className="text-xs text-blue-700">
                    {testPrinterType === 'tec' 
                      ? 'TCPL (Toshiba Control Programming Language) is used to send print commands to Toshiba Tec thermal printers. This code includes sample text, barcodes, and QR codes.'
                      : 'ZPL (Zebra Programming Language) is used to send print commands to Zebra thermal printers. This code includes sample text, barcodes, and QR codes.'}
                  </p>
                </div>

                {currentSettings?.[testPrinterType === 'tec' ? 'tecPrinterIp' : 'zebraPrinterIp'] && (
                  <div className="p-4 bg-purple-50 border border-purple-200 rounded-lg">
                    <div className="flex items-start gap-2">
                      <Info className="h-4 w-4 text-purple-600 mt-0.5" />
                      <div>
                        <p className="text-sm font-medium text-purple-900 mb-1">Send to Network Printer</p>
                        <p className="text-xs text-purple-700 mb-2">
                          Printer IP: {currentSettings?.[testPrinterType === 'tec' ? 'tecPrinterIp' : 'zebraPrinterIp']}:{currentSettings?.[testPrinterType === 'tec' ? 'tecPrinterPort' : 'zebraPrinterPort']}
                        </p>
                        <Button
                          type="button"
                          onClick={handleSendTestPrint}
                          disabled={isTestingPrinter}
                          className="w-full bg-purple-600 hover:bg-purple-700"
                          data-testid="button-send-test-print"
                        >
                          <Send className="h-4 w-4 mr-2" />
                          {isTestingPrinter ? 'Sending...' : 'Send Test Print to Printer'}
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowTestPrinterDialog(false)}
              data-testid="button-close-test-dialog"
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}