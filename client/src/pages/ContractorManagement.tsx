import { useState, useEffect, useRef, useMemo } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import GlassCard from "@/components/GlassCard";
import { StaffSearchSelect } from "@/components/StaffSearchSelect";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import WalkInContractorForm from "@/components/WalkInContractorForm";
import ContractorPassPreviewModal from "@/components/ContractorPassPreviewModal";
// Removed EditContractorWorkerModal import - now using comprehensive ContractorEditModal
import { ContractorEditModal } from "@/components/ContractorEditModal";
import ContractorPreBooking from "@/components/ContractorPreBooking";
import ContractorHSModal from "@/components/ContractorHSModal";
import { CO2SustainabilityReports } from "@/components/CO2SustainabilityReports";
import HSDocumentAssignment from "@/components/HSDocumentAssignment";
import RAMSManagement from "@/components/RAMSManagement";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarPicker } from "@/components/ui/calendar";
import { format } from "date-fns";
import { 
  HardHat, 
  Clock, 
  Building2, 
  Search,
  CheckCircle,
  AlertTriangle,
  LogIn,
  LogOut,
  Edit,
  Trash2,
  History,
  UserPlus,
  CalendarPlus,
  Mail,
  Plus,
  User,
  Users,
  Leaf,
  Shield,
  LayoutGrid,
  List,
  Lock,
  FileText,
  CheckSquare,
  Square,
  ChevronRight,
  Zap,
  Phone,
  Camera,
  QrCode,
  Printer,
  Download,
  ShieldOff,
  Wrench,
  CalendarDays,
  ExternalLink,
  HardHat as HardHatIcon,
  ClipboardList,
  AlertCircle,
  ChevronDown,
  CheckSquare as CheckSquareIcon,
  Globe,
  MapPin,
} from "lucide-react";

import type { ContractorCompany, ContractorWorker } from "@shared/schema";
import QRScannerModal from "@/components/QRScannerModal";

import {
  type ExtendedContractorCompany,
  type CdmProject,
  isF10Overdue,
} from "./contractor/types";
import ContractorPPMTab from "./contractor/ContractorPPMTab";
import ContractorCDMTab from "./contractor/ContractorCDMTab";
import ContractorPreviousTab from "./contractor/ContractorPreviousTab";
import ContractorCompaniesTab from "./contractor/ContractorCompaniesTab";

export default function ContractorManagement() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [showQRScanner, setShowQRScanner] = useState(false);
  const [activeTab, setActiveTab] = useState<"previous" | "walkin" | "prebook" | "contractors" | "co2" | "assign-hs" | "rams" | "ppm" | "cdm">("previous");
  const [selectedCO2CompanyId, setSelectedCO2CompanyId] = useState<string>("");
  const [searchTerm, setSearchTerm] = useState("");

  // Enhanced search filter function
  const matchesSearch = (company: any, search: string) => {
    if (!search) return true;
    const searchLower = search.toLowerCase();
    return (
      (company.name || "").toLowerCase().includes(searchLower) ||
      ((company.contactEmail || company.email) || "").toLowerCase().includes(searchLower) ||
      (company.phone || "").toLowerCase().includes(searchLower) ||
      (company.industry || "").toLowerCase().includes(searchLower) ||
      (company.address || "").toLowerCase().includes(searchLower) ||
      (company.description || "").toLowerCase().includes(searchLower) ||
      (company.contactFirstName || "").toLowerCase().includes(searchLower) ||
      (company.contactLastName || "").toLowerCase().includes(searchLower)
    );
  };
  const [showWalkInForm, setShowWalkInForm] = useState(false);
  const [showAllWorkers, setShowAllWorkers] = useState(false);
  const [showAllCompanies, setShowAllCompanies] = useState(false);
  const [companyViewMode, setCompanyViewMode] = useState<'grid' | 'list'>('grid');
  const [previousViewMode, setPreviousViewMode] = useState<'grid' | 'list'>('list');
  const [showPassPreview, setShowPassPreview] = useState(false);
  const [selectedWorker, setSelectedWorker] = useState<ContractorWorker | null>(null);
  const [selectedCompanyName, setSelectedCompanyName] = useState<string>("");
  // Removed unused showEditWorkerModal and workerToEdit - now using comprehensive modal
  const [showAddContractorDialog, setShowAddContractorDialog] = useState(false);
  const [showContractorEditModal, setShowContractorEditModal] = useState(false);
  const [showCompanyEditDialog, setShowCompanyEditDialog] = useState(false);
  const [selectedWorkerForEdit, setSelectedWorkerForEdit] = useState<ContractorWorker | null>(null);
  const [selectedWorkerCompanyName, setSelectedWorkerCompanyName] = useState<string>("");
  const [showAddWorkerDialog, setShowAddWorkerDialog] = useState(false);
  const [selectedContractor, setSelectedContractor] = useState<ContractorCompany | null>(null);
  const [showHSModal, setShowHSModal] = useState(false);
  const [cdmAccreditationForm, setCdmAccreditationForm] = useState({
    cdmRole: "" as string,
    constructionlineGrade: "" as string, // not_registered | registered | silver | gold | platinum
    chasCertified: false,
    smasAccredited: false,
    otherAccreditations: "",
    pdProfessionalBody: "",
  });
  const [workerForCheckIn, setWorkerForCheckIn] = useState<ContractorWorker | null>(null);
  const [companyForCheckIn, setCompanyForCheckIn] = useState<string>("");
  const [preBookingWorker, setPreBookingWorker] = useState<ContractorWorker | null>(null);
  const [preBookDate, setPreBookDate] = useState(new Date());
  const [preBookTime, setPreBookTime] = useState(() => {
    const now = new Date();
    const nextHour = new Date(now);
    nextHour.setMinutes(0);
    nextHour.setHours(nextHour.getHours() + 1);
    return `${String(nextHour.getHours()).padStart(2, '0')}:00`;
  });
  const [preBookPurpose, setPreBookPurpose] = useState("Site work");
  const [preBookDuration, setPreBookDuration] = useState("8");
  const [preBookNotes, setPreBookNotes] = useState("");
  const [preBookCompanyName, setPreBookCompanyName] = useState("");
  const [preBookHost, setPreBookHost] = useState('');
  const [showCheckInHostDialog, setShowCheckInHostDialog] = useState(false);
  const [checkInWorkerId, setCheckInWorkerId] = useState<string | null>(null);
  const [checkInWorkerName, setCheckInWorkerName] = useState('');
  const [selectedCheckInHost, setSelectedCheckInHost] = useState('');
  const [viewingWorker, setViewingWorker] = useState<any | null>(null);
  const [qrPassWorker, setQrPassWorker] = useState<any | null>(null);
  const [qrPassData, setQrPassData] = useState<{ qrCode: string; workerName: string } | null>(null);
  const [isUploadingWorkerPhoto, setIsUploadingWorkerPhoto] = useState(false);
  const workerPhotoInputId = "worker-photo-upload-input";
  
  // Form states for adding contractor
  const [contractorForm, setContractorForm] = useState({
    name: "",
    email: "",
    contactFirstName: "",
    contactLastName: "",
    phone: "",
    address: "",
    postcode: "",
    website: "",
    description: "",
    industry: "",
    status: "pending" as "pending" | "approved" | "suspended"
  });

  const [isGeneratingDescription, setIsGeneratingDescription] = useState(false);

  // Company wizard state
  const [addWizardStep, setAddWizardStep] = useState(1);
  const [docChecklist, setDocChecklist] = useState({
    publicLiability: false,
    employersLiability: false,
    cisRegistration: false,
    healthSafetyPolicy: false,
    rams: false,
    modernSlavery: false,
    environmentalPolicy: false,
    professionalIndemnity: false,
  });

  // Worker wizard state (for the add worker dialog)
  const [workerWizardStep, setWorkerWizardStep] = useState(1);

  // Stores the newly created company after step 3 submit (used for "Add First Worker" flow)
  const [justCreatedCompany, setJustCreatedCompany] = useState<any>(null);

  const resetAddWizard = () => {
    setAddWizardStep(1);
    setJustCreatedCompany(null);
    setDocChecklist({ publicLiability: false, employersLiability: false, cisRegistration: false, healthSafetyPolicy: false, rams: false, modernSlavery: false, environmentalPolicy: false, professionalIndemnity: false });
    setContractorForm({ name: "", email: "", contactFirstName: "", contactLastName: "", phone: "", address: "", postcode: "", website: "", description: "", industry: "", status: "pending" });
  };

  const [workerWizardSavedName, setWorkerWizardSavedName] = useState("");

  const resetWorkerWizard = () => {
    setWorkerWizardStep(1);
    setWorkerWizardSavedName("");
    setWorkerForm({ companyId: "", firstName: "", lastName: "", email: "", phone: "", postcode: "", transportMethod: "car_diesel", rightToWork: "pending", cscsCard: "", cscsStatus: "pending", ipafStatus: "none", asbestosAwareness: false, manualHandling: false, workingAtHeight: false, inductionCompleted: false, isActive: true });
  };

  // UK Compliance Document framework
  const UK_LEGAL_DOCS = [
    { key: "publicLiability" as const, name: "Public Liability Insurance", basis: "Common law duty of care", note: "Minimum £2m recommended" },
    { key: "employersLiability" as const, name: "Employers' Liability Insurance", basis: "Employers' Liability Act 1969", note: "Minimum £5m — required if they employ anyone" },
    { key: "cisRegistration" as const, name: "CIS Registration", basis: "Finance Act 2004", note: "Construction industry only — skip if not applicable" },
  ];
  const UK_SITE_DOCS = [
    { key: "healthSafetyPolicy" as const, name: "Health & Safety Policy", basis: "H&S at Work Act 1974", note: "Required before work commences" },
    { key: "rams" as const, name: "Risk Assessment & Method Statement (RAMS)", basis: "MHSWR 1999", note: "Site-specific — required before each job" },
  ];
  const UK_GOOD_DOCS = [
    { key: "modernSlavery" as const, name: "Modern Slavery Statement", basis: "Modern Slavery Act 2015", note: "Good practice — mandatory for businesses >£36m turnover" },
    { key: "environmentalPolicy" as const, name: "Environmental Policy", basis: "Client / ISO 14001", note: "Increasingly required by clients" },
    { key: "professionalIndemnity" as const, name: "Professional Indemnity Insurance", basis: "Client / design work", note: "Required for design/consultancy work" },
  ];

  // Get current user for customer isolation and admin access control
  const { data: currentUser, isError: authError } = useQuery<{ id: string; username: string; customerId: string; role?: string }>({
    queryKey: ["/api/auth/me"],
    retry: false, // Don't retry if auth fails
    staleTime: 5000,
  });

  // Secure customer ID - no fallback for production security
  const customerId = currentUser?.customerId;

  // OpenAI auto-populate description mutation
  const generateDescriptionMutation = useMutation({
    mutationFn: async (data: { website: string; companyName: string; industry?: string }) => {
      const response = await apiRequest("POST", "/api/contractors/generate-description", data);
      return await response.json();
    },
    onSuccess: (response: { description: string }) => {
      setContractorForm(prev => ({
        ...prev,
        description: response.description
      }));
      toast({
        title: "Success",
        description: "Company description generated successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error", 
        description: error.message || "Failed to generate description",
        variant: "destructive",
      });
    },
    onSettled: () => {
      setIsGeneratingDescription(false);
    }
  });

  const handleGenerateDescription = async () => {
    if (!contractorForm.website || !contractorForm.name) {
      toast({
        title: "Missing Information",
        description: "Please enter company name and website first",
        variant: "destructive",
      });
      return;
    }

    setIsGeneratingDescription(true);
    generateDescriptionMutation.mutate({
      website: contractorForm.website,
      companyName: contractorForm.name,
      industry: contractorForm.industry || undefined
    });
  };
  
  // Form state for adding worker
  const [workerForm, setWorkerForm] = useState({
    companyId: "",
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    postcode: "", // HOME POSTCODE - MANDATORY for emissions calculations
    transportMethod: "car_diesel",
    rightToWork: "pending" as "valid" | "expired" | "pending",
    cscsCard: "",
    cscsStatus: "pending" as "valid" | "expired" | "pending",
    ipafStatus: "none" as "none" | "3a" | "3b" | "1+" | "expired",
    asbestosAwareness: false,
    manualHandling: false,
    workingAtHeight: false,
    inductionCompleted: false,
    isActive: true
  });

  const { data: companies = [] } = useQuery<ExtendedContractorCompany[]>({
    queryKey: ["/api/contractors", customerId],
    enabled: !!currentUser,
  });

  // Lightweight CDM projects query for header-level F10 overdue count
  const { data: allCdmProjects = [] } = useQuery<CdmProject[]>({
    queryKey: ["/api/cdm/projects", customerId],
    enabled: !!currentUser,
    refetchInterval: 60000,
  });
  const headerF10OverdueCount = allCdmProjects.filter(isF10Overdue).length;

  const { data: allWorkers = [], refetch: refetchWorkers } = useQuery<ContractorWorker[]>({
    queryKey: ["/api/contractors/workers/all", customerId],
    enabled: activeTab === "previous" && !!customerId,
  });

  const { data: staffList = [] } = useQuery<any[]>({
    queryKey: ['/api/staff'],
  });

  const { data: zones = [] } = useQuery<any[]>({
    queryKey: ["/api/zones"],
  });

  const { data: activeLoneWorkers = [] } = useQuery<any[]>({
    queryKey: ['/api/lone-worker/active'],
    refetchInterval: 30000,
  });

  const startContractorLoneWorkerMutation = useMutation({
    mutationFn: (id: string) => apiRequest("POST", `/api/contractor-workers/${id}/lone-worker/start`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['/api/lone-worker/active'] }),
    onError: () => toast({ title: "Error", description: "Failed to start lone worker session.", variant: "destructive" }),
  });

  const endContractorLoneWorkerMutation = useMutation({
    mutationFn: (id: string) => apiRequest("POST", `/api/contractor-workers/${id}/lone-worker/end`, { endedBy: 'supervisor' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['/api/lone-worker/active'] }),
    onError: () => toast({ title: "Error", description: "Failed to end lone worker session.", variant: "destructive" }),
  });

  const getContractorLoneWorkerSession = (workerId: string) =>
    activeLoneWorkers.find((s: any) => s.personId === workerId && s.personType === 'contractor');

  const getLoneWorkerCountdown = (session: any): string => {
    if (!session?.nextDeadline) return 'Lone Worker';
    const minsLeft = Math.round((new Date(session.nextDeadline).getTime() - Date.now()) / 60000);
    if (minsLeft < 0) return `${Math.abs(minsLeft)}m overdue`;
    return `Next: ${minsLeft}m`;
  };

  const generateTestWorkersMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch("/api/contractors/generate-test-workers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (!response.ok) throw new Error("Failed to generate test workers");
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Test Workers Generated",
        description: "Successfully created test workers for all contractor companies",
      });
      refetchWorkers();
      queryClient.invalidateQueries({ queryKey: ["/api/contractors", customerId] });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to generate test workers",
        variant: "destructive",
      });
    },
  });

  const handleGenerateTestWorkers = () => {
    generateTestWorkersMutation.mutate();
  };
  
  // Create contractor mutation
  const createContractorMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/contractors", data);
      return await res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/contractors", customerId] });
      setJustCreatedCompany(data);
      setAddWizardStep(4);
      setContractorForm({
        name: "",
        email: "",
        contactFirstName: "",
        contactLastName: "",
        phone: "",
        address: "",
        postcode: "",
        website: "",
        description: "",
        industry: "",
        status: "pending"
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to add contractor",
        variant: "destructive",
      });
    },
  });

  const updateContractorMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      return await apiRequest("PUT", `/api/contractors/${id}`, data);
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Contractor company updated successfully",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/contractors", customerId] });
      setShowCompanyEditDialog(false);
      setSelectedContractor(null);
      setContractorForm({
        name: "",
        email: "",
        contactFirstName: "",
        contactLastName: "",
        phone: "",
        address: "",
        postcode: "",
        website: "",
        description: "",
        industry: "",
        status: "pending"
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update contractor",
        variant: "destructive",
      });
    },
  });

  const updateCdmAccreditationsMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      return await apiRequest("PATCH", `/api/contractors/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/contractors", customerId] });
    },
  });

  // Create worker mutation
  const createWorkerMutation = useMutation({
    mutationFn: async (data: any) => {
      return await apiRequest("POST", `/api/contractors/${data.companyId}/workers`, data);
    },
    onSuccess: (_data: any, variables: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/contractors", customerId] });
      queryClient.invalidateQueries({ queryKey: ["/api/contractors/workers/all", customerId] });
      setWorkerWizardSavedName(`${variables.firstName} ${variables.lastName}`);
      setWorkerWizardStep(4);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to add worker",
        variant: "destructive",
      });
    },
  });

  const handleAddContractor = () => {
    createContractorMutation.mutate(contractorForm);
  };

  const handleAddWorker = () => {
    createWorkerMutation.mutate({
      ...workerForm,
      companyId: selectedContractor?.id
    });
  };

  // Delete contractor mutation
  const deleteContractorMutation = useMutation({
    mutationFn: async (contractorId: string) => {
      const response = await apiRequest("DELETE", `/api/contractors/${contractorId}`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/contractors", customerId] });
      queryClient.invalidateQueries({ queryKey: ["/api/contractors/workers/all", customerId] });
      toast({
        title: "Success",
        description: "Contractor deleted successfully",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to delete contractor",
        variant: "destructive",
      });
    },
  });

  // Delete worker mutation
  const deleteWorkerMutation = useMutation({
    mutationFn: async (workerId: string) => {
      const response = await apiRequest("DELETE", `/api/workers/${workerId}`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/contractors/workers/all", customerId] });
      queryClient.invalidateQueries({ queryKey: ["/api/contractors", customerId] });
      toast({
        title: "Success",
        description: "Worker deleted successfully",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to delete worker",
        variant: "destructive",
      });
    },
  });

  // Navigation handlers
  const handleViewContractorDetails = (contractorId: string) => {
    setLocation(`/contractors/${contractorId}`);
  };

  const handleEditContractor = (contractorId: string) => {
    // Find the contractor to edit
    const contractorToEdit = companies.find(c => c.id === contractorId);
    if (contractorToEdit) {
      setSelectedContractor(contractorToEdit);
      // Pre-fill form with existing contractor data
      
      setContractorForm({
        name: contractorToEdit.name || "",
        email: contractorToEdit.email || "",
        contactFirstName: contractorToEdit.contactFirstName || "",
        contactLastName: contractorToEdit.contactLastName || "",
        phone: (contractorToEdit as any).contactPhone || contractorToEdit.phone || "",
        address: contractorToEdit.address || "",
        postcode: contractorToEdit.postcode || "",
        website: contractorToEdit.website || "",
        description: contractorToEdit.description || "",
        industry: contractorToEdit.industry || "",
        status: (contractorToEdit.status as "pending" | "approved" | "suspended") || "pending"
      });
      
      console.log('🔍 Pre-filling form with contractor data:', {
        original: contractorToEdit,
        mapped: {
          name: contractorToEdit.name || "",
          email: contractorToEdit.email || "",
          phone: (contractorToEdit as any).contactPhone || contractorToEdit.phone || "",
        }
      });
      setCdmAccreditationForm({
        cdmRole: contractorToEdit.cdmRole ?? "",
        constructionlineGrade: contractorToEdit.constructionlineGrade ?? "",
        chasCertified: contractorToEdit.chasCertified ?? false,
        smasAccredited: contractorToEdit.smasAccredited ?? false,
        otherAccreditations: contractorToEdit.otherAccreditations ?? "",
        pdProfessionalBody: contractorToEdit.pdProfessionalBody ?? "",
      });
      setShowCompanyEditDialog(true);
    }
  };

  const handleDeleteContractor = (contractorId: string, contractorName: string) => {
    if (window.confirm(`Are you sure you want to delete "${contractorName}"? This action cannot be undone.`)) {
      deleteContractorMutation.mutate(contractorId);
    }
  };

  const handleDeleteWorker = (workerId: string, workerName: string) => {
    if (window.confirm(`Are you sure you want to delete "${workerName}"? This action cannot be undone.`)) {
      deleteWorkerMutation.mutate(workerId);
    }
  };

  // Removed unused handleEditWorker functions - now using comprehensive modal directly

  const checkInMutation = useMutation({
    mutationFn: async (data: { workerId: string; hostStaffId?: string; hostName?: string }) => {
      const response = await apiRequest("POST", `/api/contractors/workers/${data.workerId}/checkin`, {
        hsRulesAccepted: true,
        hsRulesAcceptedAt: new Date().toISOString(),
        purpose: "Work",
        hostStaffId: data.hostStaffId,
        hostName: data.hostName,
      });
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/contractors/workers/all", customerId] });
      queryClient.invalidateQueries({ queryKey: ["/api/contractors/checked-in"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      
      if (data.ePassSent) {
        toast({
          title: "Digital Pass Sent",
          description: `E-Pass has been sent to ${data.worker?.email || 'contractor'}. They can use it to check out.`,
          duration: 5000
        });
      } else {
        const worker = data.worker;
        const company = companies.find(c => c.id === worker.companyId);
        
        setSelectedWorker(worker);
        setSelectedCompanyName(company?.name || "Unknown Company");
        setShowPassPreview(true);
        
        // ePassEnabled tells us whether the toggle is on (but email failed)
        // or simply off (physical pass mode). Only show destructive if it actually failed.
        const ePassFailed = data.hasEmail && data.ePassEnabled && !data.ePassSent;
        toast({
          title: "Checked In",
          description: ePassFailed
            ? "E-pass could not be sent — please print the physical pass below."
            : "Contractor checked in. Please print the physical pass below.",
          variant: ePassFailed ? "destructive" : "default",
          duration: 6000,
        });
      }
    },
    onError: (error: any) => {
      toast({
        title: "Cannot Check In",
        description: error?.message || "Failed to check in contractor",
        variant: "destructive",
      });
    },
  });

  const checkOutMutation = useMutation({
    mutationFn: async (workerId: string) => {
      const response = await apiRequest("POST", `/api/contractors/workers/${workerId}/checkout`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/contractors/workers/all", customerId] });
      queryClient.invalidateQueries({ queryKey: ["/api/contractors/checked-in"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/contractors", customerId] });
      toast({
        title: "Success",
        description: "Contractor checked out successfully!",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to check out contractor",
        variant: "destructive",
      });
    },
  });

  const sendInductionMutation = useMutation({
    mutationFn: async (contractorId: string) => {
      const response = await apiRequest("POST", `/api/contractors/${contractorId}/send-induction`);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Induction Email Sent ✅",
        description: "The induction link has been emailed to the contractor. They must complete it before site access.",
        duration: 5000,
      });
    },
    onError: (error) => {
      toast({
        title: "Failed to Send Induction",
        description: error.message || "Unable to send induction email. Please try again.",
        variant: "destructive",
      });
    },
  });

  const { data: companySettings } = useQuery<any>({ queryKey: ['/api/settings'] });

  useEffect(() => {
    if (qrPassWorker?.qrCode) {
      setQrPassData({ qrCode: qrPassWorker.qrCode, workerName: `${qrPassWorker.firstName} ${qrPassWorker.lastName}` });
    } else if (!qrPassWorker) {
      setQrPassData(null);
    }
  }, [qrPassWorker]);

  const sendWorkerQrPassMutation = useMutation({
    mutationFn: async ({ id, method }: { id: string; method: string }) => {
      const response = await apiRequest("POST", `/api/contractors/workers/${id}/send-qr-pass`, { method });
      return response.json();
    },
    onSuccess: (data) => {
      if (data.qrCode) {
        setQrPassData({ qrCode: data.qrCode, workerName: data.workerName || '' });
      }
      if (data.method === 'email') {
        toast({ title: "QR Pass Sent", description: data.message || "QR pass has been emailed to the contractor" });
      }
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to send QR pass", variant: "destructive" });
    },
  });

  const getWorkerPassBranding = () => {
    const brandColor = companySettings?.backgroundColor || companySettings?.primaryColor || '#2460A9';
    const accentColor = companySettings?.accentColor || brandColor;
    const companyName = companySettings?.companyName || 'Company';
    const logoPath = companySettings?.logoUrl || '';
    const logoUrl = logoPath ? (logoPath.startsWith('http') ? logoPath : `${window.location.origin}/objects${logoPath.startsWith('/') ? '' : '/'}${logoPath}`) : '';
    return { brandColor, accentColor, companyName, logoUrl };
  };

  const getBrandedWorkerPassHtml = (qrCode: string, workerName: string, workerCompanyName: string) => {
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(qrCode)}`;
    const { brandColor, companyName, logoUrl } = getWorkerPassBranding();
    const logoHtml = logoUrl ? `<img src="${logoUrl}" style="max-height:40px;max-width:160px;margin:0 auto 6px auto;display:block;" crossorigin="anonymous">` : '';
    return `
      <div style="border:2px solid ${brandColor};border-radius:14px;padding:20px 18px;max-width:280px;margin:0 auto;font-family:'Segoe UI',Arial,sans-serif;text-align:center;background:#fff;">
        <div style="background:${brandColor};margin:-20px -18px 12px -18px;border-radius:12px 12px 0 0;padding:14px 12px 10px 12px;">
          ${logoHtml}
          <div style="color:#fff;font-size:15px;font-weight:700;letter-spacing:0.5px;">${companyName}</div>
          <div style="color:rgba(255,255,255,0.8);font-size:10px;margin-top:2px;">CONTRACTOR CHECK-IN PASS</div>
        </div>
        <img src="${qrUrl}" style="width:180px;height:180px;margin:6px auto 10px auto;display:block;border-radius:8px;border:1px solid #e5e7eb;">
        <h3 style="margin:0 0 2px 0;font-size:16px;color:#111;">${workerName}</h3>
        <p style="margin:2px 0;color:#555;font-size:13px;">${workerCompanyName}</p>
        <div style="margin-top:10px;padding-top:8px;border-top:1px solid #e5e7eb;">
          <p style="margin:0;font-size:10px;color:#aaa;">Scan at kiosk to check in / check out</p>
        </div>
      </div>`;
  };

  const handlePrintWorkerQrPass = (workerId: string) => {
    window.open(`/api/passes/print/contractor/${workerId}`, '_blank');
  };

  const handleDownloadWorkerQrPass = async (qrCode: string, workerName: string, workerCompanyName: string) => {
    toast({ title: "Generating Pass", description: "Creating branded QR pass image..." });
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(qrCode)}`;
    const { brandColor, companyName, logoUrl } = getWorkerPassBranding();
    const canvas = document.createElement('canvas');
    canvas.width = 320; canvas.height = 420;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, 320, 420);
    ctx.strokeStyle = brandColor; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.roundRect(2, 2, 316, 416, 12); ctx.stroke();
    ctx.fillStyle = brandColor; ctx.fillRect(2, 2, 316, 70);
    ctx.fillStyle = '#ffffff'; ctx.font = 'bold 14px Arial'; ctx.textAlign = 'center'; ctx.fillText(companyName, 160, 32);
    ctx.font = '11px Arial'; ctx.fillText('CONTRACTOR CHECK-IN PASS', 160, 52);
    const img = new Image(); img.crossOrigin = 'anonymous';
    img.onload = () => {
      ctx.drawImage(img, 60, 80, 200, 200);
      ctx.fillStyle = '#111111'; ctx.font = 'bold 16px Arial'; ctx.fillText(workerName, 160, 305);
      ctx.fillStyle = '#555555'; ctx.font = '13px Arial'; ctx.fillText(workerCompanyName, 160, 325);
      ctx.fillStyle = '#aaaaaa'; ctx.font = '10px Arial'; ctx.fillText('Scan at kiosk to check in / check out', 160, 365);
      const link = document.createElement('a');
      link.download = `qr-pass-${workerName.replace(/\s/g, '-')}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
      toast({ title: "Download Complete", description: "QR pass saved to your downloads" });
    };
    img.onerror = () => toast({ title: "Download Failed", description: "Could not generate pass image", variant: "destructive" });
    img.src = qrUrl;
  };

  const preBookWorkerMutation = useMutation({
    mutationFn: async (data: { worker: ContractorWorker; date: Date; time: string; purpose: string; duration: string; notes: string; companyName: string; hostStaffId?: string; hostName?: string }) => {
      const response = await apiRequest('POST', '/api/contractors/prebookings', {
        companyName: data.companyName,
        contactEmail: data.worker.email || '',
        contactPhone: data.worker.phone || '',
        workerName: `${data.worker.firstName} ${data.worker.lastName}`,
        workerEmail: data.worker.email || '',
        purpose: data.purpose,
        scheduledDate: data.date.toISOString(),
        scheduledTime: data.time,
        duration: data.duration,
        notes: data.notes,
        documentsRequired: [],
        hostStaffId: data.hostStaffId || undefined,
        hostName: data.hostName || undefined,
      });
      return response.json();
    },
    onSuccess: (data: any) => {
      toast({
        title: "Worker pre-booked successfully",
        description: data?.emailSent
          ? "Pre-booking pass with QR code has been emailed to the contractor"
          : "The booking has been created and will appear in the Reception Diary"
      });
      queryClient.invalidateQueries({ queryKey: ['/api/contractors/prebookings'] });
      queryClient.invalidateQueries({ queryKey: ['/api/contractors/prebookings/today'] });
      queryClient.invalidateQueries({ queryKey: ['/api/contractors/prebookings/upcoming'] });
      queryClient.invalidateQueries({ queryKey: ['/api/reception/diary'] });
      setPreBookingWorker(null);
      setPreBookDate(new Date());
      const now = new Date();
      const nextHour = new Date(now);
      nextHour.setMinutes(0);
      nextHour.setHours(nextHour.getHours() + 1);
      setPreBookTime(`${String(nextHour.getHours()).padStart(2, '0')}:00`);
      setPreBookPurpose("Site work");
      setPreBookDuration("8");
      setPreBookNotes("");
      setPreBookCompanyName("");
      setPreBookHost('');
    },
    onError: (error: any) => {
      toast({ title: "Failed to pre-book worker", description: error.message, variant: "destructive" });
    }
  });

  const updateWorkerPhotoMutation = useMutation({
    mutationFn: async ({ workerId, photoUrl }: { workerId: string; photoUrl: string }) => {
      const response = await apiRequest("PUT", `/api/contractors/workers/${workerId}`, { photoUrl });
      return response.json();
    },
    onSuccess: (data) => {
      const worker = data.worker || data;
      setViewingWorker((prev: any) => prev ? { ...prev, photoUrl: worker.photoUrl } : prev);
      queryClient.invalidateQueries({ queryKey: ['/api/contractors/workers/all'] });
      toast({ title: "Photo updated", description: "Worker photo saved successfully." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to save worker photo.", variant: "destructive" });
    },
  });

  const handleWorkerPhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !viewingWorker) return;
    let base64: string;
    try {
      base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (ev) => resolve((ev.target?.result as string).split(',')[1]);
        reader.onerror = () => reject(new Error('Failed to read file'));
        reader.readAsDataURL(file);
      });
    } catch {
      toast({ title: "Error", description: "Could not read the file. Please try again.", variant: "destructive" });
      return;
    }
    setIsUploadingWorkerPhoto(true);
    try {
      const uploadRes = await apiRequest("POST", "/api/objects/upload", { data: base64, mimeType: file.type });
      const { objectPath } = await uploadRes.json();
      updateWorkerPhotoMutation.mutate({ workerId: viewingWorker.id, photoUrl: objectPath });
    } catch {
      toast({ title: "Error", description: "Failed to upload photo.", variant: "destructive" });
    } finally {
      setIsUploadingWorkerPhoto(false);
      e.target.value = "";
    }
  };

  // Get previous contractors (workers with their company info)
  const previousContractors = allWorkers.map(worker => {
    const company = companies.find(c => c.id === worker.companyId);
    return {
      ...worker,
      companyName: company?.name || 'Unknown Company',
      companyStatus: company?.status || 'unknown',
      safetyRating: company?.complianceScore || 'N/A'
    };
  }).filter(contractor => 
    (contractor.firstName || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
    (contractor.lastName || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
    (contractor.companyName || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
    (contractor.email || "").toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getSafetyRatingColor = (rating: string) => {
    if (rating.startsWith('A')) return 'bg-green-100 text-green-800';
    if (rating.startsWith('B')) return 'bg-yellow-100 text-yellow-800';
    if (rating.startsWith('C')) return 'bg-orange-100 text-orange-800';
    if (rating.startsWith('D')) return 'bg-red-100 text-red-800';
    if (rating === 'F') return 'bg-red-200 text-red-900';
    return 'bg-gray-100 text-gray-800';
  };

  // Derive compliance badge from documentsStatus returned by the API
  const getComplianceBadge = (documentsStatus?: Record<string, string>) => {
    if (!documentsStatus) return { label: 'Not started', className: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300', icon: '⬜' };
    const allMissing = Object.values(documentsStatus).every(v => v === 'missing');
    if (allMissing) return { label: 'Not started', className: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300', icon: '⬜' };
    const missingLegal = documentsStatus.publicLiability === 'missing' || documentsStatus.employersLiability === 'missing'
      || documentsStatus.publicLiability === 'expired' || documentsStatus.employersLiability === 'expired';
    if (missingLegal) return { label: 'Missing legal docs', className: 'bg-red-100 text-red-700', icon: '🔴' };
    const missingSite = (documentsStatus.healthSafety === 'missing' || documentsStatus.rams === 'missing'
      || documentsStatus.healthSafety === 'expired' || documentsStatus.rams === 'expired');
    if (missingSite) return { label: 'Incomplete', className: 'bg-amber-100 text-amber-700', icon: '🟡' };
    return { label: 'Compliant', className: 'bg-green-100 text-green-700', icon: '🟢' };
  };

  if (showWalkInForm) {
    return <WalkInContractorForm onBack={() => setShowWalkInForm(false)} />;
  }

  return (
    <div className="p-3 sm:p-6 space-y-4 sm:space-y-6 pb-24 sm:pb-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <HardHat className="h-8 w-8 text-orange-600" />
          <h1 className="text-xl sm:text-3xl font-bold text-slate-800 dark:text-slate-100">Contractor Management</h1>
          {headerF10OverdueCount > 0 && (
            <span
              className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-100 text-red-700 text-xs font-semibold cursor-pointer hover:bg-red-200 transition-colors"
              title={`${headerF10OverdueCount} CDM project${headerF10OverdueCount > 1 ? "s" : ""} with overdue F10 notification`}
              onClick={() => setActiveTab("cdm")}
            >
              <AlertTriangle className="h-3 w-3" />
              {headerF10OverdueCount} F10 overdue
            </span>
          )}
        </div>
        <Button
          onClick={() => setShowQRScanner(true)}
          className="bg-blue-600 hover:bg-blue-700 text-white font-semibold flex items-center gap-2 px-3 sm:px-4 py-2 sm:py-2.5 text-sm sm:text-base"
          title="Scan a contractor QR code to check in / out"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 sm:w-5 sm:h-5 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="3" y="14" width="7" height="7" />
            <path d="M14 14h1v1h-1zm3 0h1v1h-1zm-3 3h1v1h-1zm3 3h1v1h-1zm3-3h1v1h-1zm0-3h1v1h-1z" />
          </svg>
          <span className="hidden sm:inline">Scan QR</span>
          <span className="sm:hidden">Scan</span>
        </Button>
      </div>

      {/* Tab Navigation — horizontal scroll on mobile, wrap on desktop */}
      <div className="flex overflow-x-auto gap-1.5 sm:flex-wrap sm:overflow-visible pb-1 sm:pb-0 scrollbar-hide">
        <Button
          variant={activeTab === "previous" ? "default" : "outline"}
          onClick={() => setActiveTab("previous")}
          className="flex items-center gap-1.5 text-xs sm:text-sm px-2.5 sm:px-4 whitespace-nowrap flex-shrink-0"
          data-testid="tab-previous-contractors"
        >
          <History className="h-3.5 w-3.5 flex-shrink-0" />
          <span className="sm:hidden">Prev</span>
          <span className="hidden sm:inline">Previous Workers</span>
        </Button>
        <Button
          variant={activeTab === "contractors" ? "default" : "outline"}
          onClick={() => setActiveTab("contractors")}
          className="flex items-center gap-1.5 text-xs sm:text-sm px-2.5 sm:px-4 whitespace-nowrap flex-shrink-0"
          data-testid="tab-contractors"
        >
          <Building2 className="h-3.5 w-3.5 flex-shrink-0" />
          <span className="hidden sm:inline">Contractors</span>
          <span className="sm:hidden">Companies</span>
        </Button>
        <Button
          variant={activeTab === "walkin" ? "default" : "outline"}
          onClick={() => setActiveTab("walkin")}
          className="flex items-center gap-1.5 text-xs sm:text-sm px-2.5 sm:px-4 whitespace-nowrap flex-shrink-0"
          data-testid="tab-walkin-registration"
        >
          <UserPlus className="h-3.5 w-3.5 flex-shrink-0" />
          <span>Walk-in</span>
        </Button>
        <Button
          variant={activeTab === "prebook" ? "default" : "outline"}
          onClick={() => setActiveTab("prebook")}
          className="flex items-center gap-1.5 text-xs sm:text-sm px-2.5 sm:px-4 whitespace-nowrap flex-shrink-0"
          data-testid="tab-pre-booking"
        >
          <CalendarPlus className="h-3.5 w-3.5 flex-shrink-0" />
          <span className="hidden sm:inline">Pre-booking</span>
          <span className="sm:hidden">Pre-book</span>
        </Button>
        <Button
          variant={activeTab === "co2" ? "default" : "outline"}
          onClick={() => setActiveTab("co2")}
          className="flex items-center gap-1.5 text-xs sm:text-sm px-2.5 sm:px-4 whitespace-nowrap flex-shrink-0"
          data-testid="tab-co2-reports"
        >
          <Leaf className="h-3.5 w-3.5 flex-shrink-0" />
          <span className="hidden sm:inline">CO2 Reports</span>
          <span className="sm:hidden">CO2</span>
        </Button>
        <Button
          variant={activeTab === "assign-hs" ? "default" : "outline"}
          onClick={() => setActiveTab("assign-hs")}
          className="flex items-center gap-1.5 text-xs sm:text-sm px-2.5 sm:px-4 whitespace-nowrap flex-shrink-0"
          data-testid="tab-assign-hs"
        >
          <Shield className="h-3.5 w-3.5 flex-shrink-0" />
          <span className="hidden sm:inline">H&S Document</span>
          <span className="sm:hidden">H&S</span>
        </Button>
        <Button
          variant={activeTab === "rams" ? "default" : "outline"}
          onClick={() => setActiveTab("rams")}
          className="flex items-center gap-1.5 text-xs sm:text-sm px-2.5 sm:px-4 whitespace-nowrap flex-shrink-0"
          data-testid="tab-rams"
        >
          <FileText className="h-3.5 w-3.5 flex-shrink-0" />
          <span className="hidden sm:inline">RAMS</span>
          <span className="sm:hidden">RAMS</span>
        </Button>
        <Button
          variant={activeTab === "ppm" ? "default" : "outline"}
          onClick={() => setActiveTab("ppm")}
          className="flex items-center gap-1.5 text-xs sm:text-sm px-2.5 sm:px-4 whitespace-nowrap flex-shrink-0"
          data-testid="tab-ppm"
        >
          <Wrench className="h-3.5 w-3.5 flex-shrink-0" />
          <span>PPM</span>
        </Button>
        <Button
          variant={activeTab === "cdm" ? "default" : "outline"}
          onClick={() => setActiveTab("cdm")}
          className="flex items-center gap-1.5 text-xs sm:text-sm px-2.5 sm:px-4 whitespace-nowrap flex-shrink-0"
          data-testid="tab-cdm"
        >
          <HardHatIcon className="h-3.5 w-3.5 flex-shrink-0" />
          <span>CDM 2015</span>
        </Button>
      </div>

      {/* Tab Content */}
      {activeTab === "previous" && (
        <ContractorPreviousTab
          previousContractors={previousContractors}
          totalWorkerCount={allWorkers.length}
          searchTerm={searchTerm}
          setSearchTerm={setSearchTerm}
          showAllWorkers={showAllWorkers}
          setShowAllWorkers={setShowAllWorkers}
          previousViewMode={previousViewMode}
          setPreviousViewMode={setPreviousViewMode}
          zones={zones}
          companySettings={companySettings}
          checkInMutation={checkInMutation}
          checkOutMutation={checkOutMutation}
          sendInductionMutation={sendInductionMutation}
          startContractorLoneWorkerMutation={startContractorLoneWorkerMutation}
          endContractorLoneWorkerMutation={endContractorLoneWorkerMutation}
          getContractorLoneWorkerSession={getContractorLoneWorkerSession}
          getLoneWorkerCountdown={getLoneWorkerCountdown}
          getSafetyRatingColor={getSafetyRatingColor}
          setViewingWorker={setViewingWorker}
          setSelectedWorkerForEdit={setSelectedWorkerForEdit}
          setSelectedWorkerCompanyName={setSelectedWorkerCompanyName}
          setShowContractorEditModal={setShowContractorEditModal}
          setPreBookingWorker={setPreBookingWorker}
          setPreBookCompanyName={setPreBookCompanyName}
          setWorkerForCheckIn={setWorkerForCheckIn}
          setCompanyForCheckIn={setCompanyForCheckIn}
          setShowHSModal={setShowHSModal}
          setQrPassWorker={setQrPassWorker}
          setSelectedWorker={setSelectedWorker}
          setSelectedCompanyName={setSelectedCompanyName}
          setShowPassPreview={setShowPassPreview}
          toast={toast}
        />
      )}


      {activeTab === "walkin" && (
        <GlassCard className="p-6">
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <UserPlus className="h-5 w-5 text-green-600" />
              <h2 className="text-xl font-semibold text-slate-800 dark:text-slate-100">Walk-in Registration</h2>
              <span className="hidden sm:inline text-sm text-slate-500 dark:text-slate-400">
                Register new contractor with document upload for clearance
              </span>
            </div>
            
            <div className="text-center py-8">
              <p className="text-slate-600 dark:text-slate-300 mb-4">Register a new contractor who is visiting for the first time</p>
              <Button
                onClick={() => setShowWalkInForm(true)}
                className="bg-green-600 hover:bg-green-700 text-white"
                data-testid="button-start-walkin-registration"
              >
                <UserPlus className="mr-2 h-4 w-4" />
                Start Walk-in Registration
              </Button>
            </div>
          </div>
        </GlassCard>
      )}

      {activeTab === "contractors" && (
        <ContractorCompaniesTab
          companies={companies}
          searchTerm={searchTerm}
          setSearchTerm={setSearchTerm}
          showAllCompanies={showAllCompanies}
          setShowAllCompanies={setShowAllCompanies}
          companyViewMode={companyViewMode}
          setCompanyViewMode={setCompanyViewMode}
          matchesSearch={matchesSearch}
          getSafetyRatingColor={getSafetyRatingColor}
          getComplianceBadge={getComplianceBadge}
          handleViewContractorDetails={handleViewContractorDetails}
          handleEditContractor={handleEditContractor}
          handleDeleteContractor={handleDeleteContractor}
          deleteContractorMutation={deleteContractorMutation}
          setSelectedContractor={setSelectedContractor}
          workerForm={workerForm}
          setWorkerForm={setWorkerForm}
          setShowAddWorkerDialog={setShowAddWorkerDialog}
          setLocation={setLocation}
          setShowAddContractorDialog={setShowAddContractorDialog}
        />
      )}


      {activeTab === "prebook" && (
        <ContractorPreBooking />
      )}

      {/* Contractor Pass Preview Modal */}
      {selectedWorker && (
        <ContractorPassPreviewModal
          isOpen={showPassPreview}
          onClose={() => {
            setShowPassPreview(false);
            setSelectedWorker(null);
            setSelectedCompanyName("");
          }}
          worker={selectedWorker}
          companyName={selectedCompanyName}
        />
      )}

      {/* Removed simple EditContractorWorkerModal - now using comprehensive ContractorEditModal for all edits */}
      
      {/* Contractor Edit Modal with Check-in/out */}
      <ContractorEditModal
        worker={selectedWorkerForEdit}
        companyName={selectedWorkerCompanyName}
        open={showContractorEditModal}
        onOpenChange={setShowContractorEditModal}
      />
      
      {/* Edit Contractor Company Dialog */}
      <Dialog open={showCompanyEditDialog} onOpenChange={setShowCompanyEditDialog}>
        <DialogContent className="w-[95vw] sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Edit className="h-5 w-5" />
              Edit Contractor Company
            </DialogTitle>
            <DialogDescription>
              Update contractor company details and service information.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-200">Company Name *</label>
              <Input
                value={contractorForm.name}
                onChange={(e) => setContractorForm({ ...contractorForm, name: e.target.value })}
                placeholder=""
                data-testid="input-edit-company-name"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-200">Contact First Name *</label>
              <Input
                value={contractorForm.contactFirstName}
                onChange={(e) => setContractorForm({ ...contractorForm, contactFirstName: e.target.value })}
                placeholder=""
                data-testid="input-edit-contact-first-name"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-200">Contact Last Name *</label>
              <Input
                value={contractorForm.contactLastName}
                onChange={(e) => setContractorForm({ ...contractorForm, contactLastName: e.target.value })}
                placeholder=""
                data-testid="input-edit-contact-last-name"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-200">Email Address *</label>
              <Input
                type="email"
                value={contractorForm.email}
                onChange={(e) => setContractorForm({ ...contractorForm, email: e.target.value })}
                placeholder=""
                data-testid="input-edit-email"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-200">Phone Number *</label>
              <Input
                type="tel"
                value={contractorForm.phone}
                onChange={(e) => setContractorForm({ ...contractorForm, phone: e.target.value })}
                placeholder=""
                data-testid="input-edit-phone"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-200">Postcode</label>
              <Input
                value={contractorForm.postcode}
                onChange={(e) => setContractorForm({ ...contractorForm, postcode: e.target.value })}
                placeholder=""
                data-testid="input-edit-postcode"
              />
            </div>
            <div className="col-span-2 space-y-2">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-200">Address *</label>
              <Textarea
                value={contractorForm.address}
                onChange={(e) => setContractorForm({ ...contractorForm, address: e.target.value })}
                placeholder=""
                data-testid="input-edit-address"
                rows={2}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-200">Website</label>
              <Input
                value={contractorForm.website}
                onChange={(e) => setContractorForm({ ...contractorForm, website: e.target.value })}
                placeholder=""
                data-testid="input-edit-website"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-200">Industry</label>
              <select
                value={contractorForm.industry}
                onChange={(e) => setContractorForm({ ...contractorForm, industry: e.target.value })}
                data-testid="select-edit-industry"
                className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring appearance-none"
              >
                <option value="">Select industry</option>
                <option value="construction">Construction</option>
                <option value="electrical">Electrical</option>
                <option value="plumbing">Plumbing</option>
                <option value="hvac">HVAC</option>
                <option value="roofing">Roofing</option>
                <option value="painting">Painting</option>
                <option value="landscaping">Landscaping</option>
                <option value="security">Security</option>
                <option value="cleaning">Cleaning</option>
                <option value="it">IT Services</option>
                <option value="catering">Catering</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div className="col-span-2 space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-slate-700 dark:text-slate-200">Description</label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleGenerateDescription}
                  disabled={isGeneratingDescription || !contractorForm.website || !contractorForm.name}
                  className="text-xs"
                  data-testid="button-edit-generate-description"
                >
                  {isGeneratingDescription ? (
                    <>🤖 Generating...</>
                  ) : (
                    <>🤖 Auto-fill with AI</>
                  )}
                </Button>
              </div>
              <Textarea
                value={contractorForm.description}
                onChange={(e) => setContractorForm({ ...contractorForm, description: e.target.value })}
                placeholder=""
                data-testid="input-edit-description"
                rows={2}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-200">Status</label>
              <select
                value={contractorForm.status}
                onChange={(e) => setContractorForm({ ...contractorForm, status: e.target.value as "pending" | "approved" | "suspended" })}
                data-testid="select-edit-status"
                className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring appearance-none"
              >
                <option value="pending">Pending Review</option>
                <option value="approved">Approved</option>
                <option value="suspended">Suspended</option>
              </select>
            </div>
          </div>

          {/* CDM 2015 & Accreditations */}
          <div className="border-t pt-4 mt-2">
            <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-2 mb-3">
              <HardHatIcon className="h-4 w-4 text-amber-600" />CDM 2015 & Accreditations
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-700 dark:text-slate-300">CDM Duty Holder Role</label>
                <select
                  value={cdmAccreditationForm.cdmRole}
                  onChange={e => setCdmAccreditationForm({ ...cdmAccreditationForm, cdmRole: e.target.value })}
                  className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring appearance-none"
                >
                  <option value="">Not specified</option>
                  <option value="principal_contractor">Principal Contractor</option>
                  <option value="principal_designer">Principal Designer</option>
                  <option value="contractor">Contractor</option>
                  <option value="designer">Designer</option>
                  <option value="client">Client</option>
                </select>
              </div>
              {/* Constructionline Grade */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-700 dark:text-slate-300">Constructionline Grade</label>
                <select
                  value={cdmAccreditationForm.constructionlineGrade}
                  onChange={e => setCdmAccreditationForm({ ...cdmAccreditationForm, constructionlineGrade: e.target.value })}
                  className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring appearance-none"
                >
                  <option value="">Not Registered</option>
                  <option value="registered">Registered</option>
                  <option value="silver">Silver</option>
                  <option value="gold">Gold</option>
                  <option value="platinum">Platinum</option>
                </select>
              </div>
              {/* CHAS Accreditation */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-700 dark:text-slate-300">CHAS</label>
                <label className="flex items-center gap-2 cursor-pointer text-sm h-9 border border-input rounded-md px-3">
                  <input type="checkbox" className="h-4 w-4" checked={cdmAccreditationForm.chasCertified} onChange={e => setCdmAccreditationForm({ ...cdmAccreditationForm, chasCertified: e.target.checked })} />
                  CHAS Certified
                </label>
              </div>
              {/* SMAS Worksafe */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-700 dark:text-slate-300">SMAS Worksafe</label>
                <label className="flex items-center gap-2 cursor-pointer text-sm h-9 border border-input rounded-md px-3">
                  <input type="checkbox" className="h-4 w-4" checked={cdmAccreditationForm.smasAccredited} onChange={e => setCdmAccreditationForm({ ...cdmAccreditationForm, smasAccredited: e.target.checked })} />
                  SMAS Accredited
                </label>
              </div>
              {/* Other Accreditations */}
              <div className="col-span-2 space-y-1.5">
                <label className="text-xs font-medium text-slate-700 dark:text-slate-300">Other Accreditations (e.g. CHAS, Acclaim, SafeContractor)</label>
                <Input className="h-9 text-sm" value={cdmAccreditationForm.otherAccreditations} onChange={e => setCdmAccreditationForm({ ...cdmAccreditationForm, otherAccreditations: e.target.value })} placeholder="e.g. CHAS Premium, SafeContractor approved…" />
              </div>
              {/* Principal Designer Professional Body */}
              <div className="col-span-2 space-y-1.5">
                <label className="text-xs font-medium text-slate-700 dark:text-slate-300">Principal Designer Professional Body (if applicable)</label>
                <Input className="h-9 text-sm" value={cdmAccreditationForm.pdProfessionalBody} onChange={e => setCdmAccreditationForm({ ...cdmAccreditationForm, pdProfessionalBody: e.target.value })} placeholder="e.g. RIBA, ARB, ICE, CIOB…" />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => setShowCompanyEditDialog(false)}
              data-testid="button-cancel-edit"
            >
              Cancel
            </Button>
            <Button 
              onClick={() => {
                if (selectedContractor) {
                  updateContractorMutation.mutate({ id: selectedContractor.id, data: contractorForm });
                  updateCdmAccreditationsMutation.mutate({ id: selectedContractor.id, data: cdmAccreditationForm });
                }
              }}
              disabled={!contractorForm.name || !contractorForm.email || !contractorForm.contactFirstName || !contractorForm.contactLastName || updateContractorMutation.isPending}
              className="bg-blue-600 hover:bg-blue-700"
              data-testid="button-update-contractor"
            >
              {updateContractorMutation.isPending ? "Updating..." : "Update Contractor"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* Add Contractor Company — 3-step Wizard */}
      <Dialog open={showAddContractorDialog} onOpenChange={(open) => { setShowAddContractorDialog(open); if (!open) resetAddWizard(); }}>
        <DialogContent className="w-[95vw] sm:max-w-2xl max-h-[92vh] flex flex-col overflow-hidden p-0">
          {/* Header + Progress */}
          <div className="flex-shrink-0 px-6 pt-6 pb-4 border-b">
            <DialogTitle className="flex items-center gap-2 text-lg font-semibold mb-4">
              <Building2 className="h-5 w-5 text-blue-600" />
              Add New Contractor Company
            </DialogTitle>
            {/* Step indicator */}
            <div className="flex items-center gap-0">
              {[{ n: 1, label: "Company Details" }, { n: 2, label: "UK Documents" }, { n: 3, label: "Review" }].map((s, i) => (
                <div key={s.n} className={`flex items-center ${i < 2 ? 'flex-1' : ''}`}>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${addWizardStep >= s.n ? 'bg-blue-600 text-white' : 'bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400'}`}>{addWizardStep > s.n ? '✓' : s.n}</div>
                    <span className={`text-xs font-medium hidden sm:inline transition-colors ${addWizardStep >= s.n ? 'text-blue-700 dark:text-blue-400' : 'text-gray-400 dark:text-gray-500'}`}>{s.label}</span>
                  </div>
                  {i < 2 && <div className={`flex-1 h-0.5 mx-2 transition-colors ${addWizardStep > s.n ? 'bg-blue-600' : 'bg-gray-200 dark:bg-gray-700'}`} />}
                </div>
              ))}
            </div>
          </div>

          {/* Step 1 — Company Details */}
          {addWizardStep === 1 && (
            <div className="overflow-y-auto flex-1 min-h-0 px-6 py-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700 dark:text-slate-200">Company Name *</label>
                  <Input value={contractorForm.name} onChange={(e) => setContractorForm({ ...contractorForm, name: e.target.value })} data-testid="input-company-name" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700 dark:text-slate-200">Industry</label>
                  <Select value={contractorForm.industry} onValueChange={(v) => setContractorForm({ ...contractorForm, industry: v })}>
                    <SelectTrigger data-testid="select-industry"><SelectValue placeholder="Select industry" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="construction">Construction</SelectItem>
                      <SelectItem value="electrical">Electrical</SelectItem>
                      <SelectItem value="plumbing">Plumbing & Heating</SelectItem>
                      <SelectItem value="hvac">HVAC / Mechanical</SelectItem>
                      <SelectItem value="roofing">Roofing</SelectItem>
                      <SelectItem value="painting">Painting & Decorating</SelectItem>
                      <SelectItem value="landscaping">Landscaping / Grounds</SelectItem>
                      <SelectItem value="security">Security</SelectItem>
                      <SelectItem value="cleaning">Cleaning / Facilities</SelectItem>
                      <SelectItem value="it">IT Services</SelectItem>
                      <SelectItem value="catering">Catering</SelectItem>
                      <SelectItem value="engineering">Engineering</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700 dark:text-slate-200">Contact First Name *</label>
                  <Input value={contractorForm.contactFirstName} onChange={(e) => setContractorForm({ ...contractorForm, contactFirstName: e.target.value })} data-testid="input-contact-first-name" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700 dark:text-slate-200">Contact Last Name *</label>
                  <Input value={contractorForm.contactLastName} onChange={(e) => setContractorForm({ ...contractorForm, contactLastName: e.target.value })} data-testid="input-contact-last-name" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700 dark:text-slate-200">Email Address *</label>
                  <Input type="email" value={contractorForm.email} onChange={(e) => setContractorForm({ ...contractorForm, email: e.target.value })} data-testid="input-email" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700 dark:text-slate-200">Phone Number *</label>
                  <Input type="tel" value={contractorForm.phone} onChange={(e) => setContractorForm({ ...contractorForm, phone: e.target.value })} data-testid="input-phone" />
                </div>
                <div className="md:col-span-2 space-y-2">
                  <label className="text-sm font-medium text-slate-700 dark:text-slate-200">Address</label>
                  <Textarea value={contractorForm.address} onChange={(e) => setContractorForm({ ...contractorForm, address: e.target.value })} data-testid="input-address" rows={2} />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700 dark:text-slate-200">Postcode</label>
                  <Input value={contractorForm.postcode} onChange={(e) => setContractorForm({ ...contractorForm, postcode: e.target.value })} data-testid="input-postcode" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700 dark:text-slate-200">Website</label>
                  <Input value={contractorForm.website} onChange={(e) => setContractorForm({ ...contractorForm, website: e.target.value })} data-testid="input-website" />
                </div>
                <div className="md:col-span-2 space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium text-slate-700 dark:text-slate-200">Description</label>
                    <Button type="button" variant="outline" size="sm" onClick={handleGenerateDescription} disabled={isGeneratingDescription || !contractorForm.website || !contractorForm.name} className="text-xs" data-testid="button-generate-description">
                      {isGeneratingDescription ? <>🤖 Generating...</> : <>🤖 Auto-fill with AI</>}
                    </Button>
                  </div>
                  <Textarea value={contractorForm.description} onChange={(e) => setContractorForm({ ...contractorForm, description: e.target.value })} data-testid="input-description" rows={2} />
                </div>
              </div>
            </div>
          )}

          {/* Step 2 — UK Compliance Documents */}
          {addWizardStep === 2 && (
            <div className="overflow-y-auto flex-1 min-h-0 px-6 py-4 space-y-5">
              <div className="bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-700 rounded-lg px-4 py-3 text-sm text-blue-800 dark:text-blue-300">
                Tick which documents this contractor currently holds. You can upload the actual files from their detail page after registration. This helps you track compliance from day one.
              </div>

              {/* Legally Required */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-6 h-6 bg-red-100 rounded-full flex items-center justify-center flex-shrink-0">
                    <Lock className="w-3.5 h-3.5 text-red-600" />
                  </div>
                  <h4 className="font-semibold text-gray-900 dark:text-white text-sm">Legally Required</h4>
                  <Badge className="bg-red-100 text-red-700 text-xs">UK Law</Badge>
                </div>
                <div className="space-y-2">
                  {UK_LEGAL_DOCS.map(doc => (
                    <label key={doc.key} className={`flex items-start gap-3 p-3 border rounded-lg cursor-pointer transition-colors ${docChecklist[doc.key] ? 'border-green-400 bg-green-50 dark:bg-green-900/20 dark:border-green-600' : 'border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800'}`}>
                      <input type="checkbox" checked={docChecklist[doc.key]} onChange={(e) => setDocChecklist({ ...docChecklist, [doc.key]: e.target.checked })} className="mt-0.5 w-4 h-4 accent-green-600 flex-shrink-0" />
                      <div className="min-w-0">
                        <p className="font-medium text-sm text-gray-900 dark:text-white">{doc.name}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{doc.basis} — {doc.note}</p>
                      </div>
                      {docChecklist[doc.key] && <CheckCircle className="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5" />}
                    </label>
                  ))}
                </div>
              </div>

              {/* Site Required */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-6 h-6 bg-amber-100 rounded-full flex items-center justify-center flex-shrink-0">
                    <Shield className="w-3.5 h-3.5 text-amber-600" />
                  </div>
                  <h4 className="font-semibold text-gray-900 dark:text-white text-sm">Site Required</h4>
                  <Badge className="bg-amber-100 text-amber-700 text-xs">Most sites</Badge>
                </div>
                <div className="space-y-2">
                  {UK_SITE_DOCS.map(doc => (
                    <label key={doc.key} className={`flex items-start gap-3 p-3 border rounded-lg cursor-pointer transition-colors ${docChecklist[doc.key] ? 'border-green-400 bg-green-50 dark:bg-green-900/20 dark:border-green-600' : 'border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800'}`}>
                      <input type="checkbox" checked={docChecklist[doc.key]} onChange={(e) => setDocChecklist({ ...docChecklist, [doc.key]: e.target.checked })} className="mt-0.5 w-4 h-4 accent-green-600 flex-shrink-0" />
                      <div className="min-w-0">
                        <p className="font-medium text-sm text-gray-900 dark:text-white">{doc.name}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{doc.basis} — {doc.note}</p>
                      </div>
                      {docChecklist[doc.key] && <CheckCircle className="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5" />}
                    </label>
                  ))}
                </div>
              </div>

              {/* Good Practice */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-6 h-6 bg-green-100 rounded-full flex items-center justify-center flex-shrink-0">
                    <CheckSquare className="w-3.5 h-3.5 text-green-600" />
                  </div>
                  <h4 className="font-semibold text-gray-900 dark:text-white text-sm">Good Practice</h4>
                  <Badge className="bg-green-100 text-green-700 text-xs">Recommended</Badge>
                </div>
                <div className="space-y-2">
                  {UK_GOOD_DOCS.map(doc => (
                    <label key={doc.key} className={`flex items-start gap-3 p-3 border rounded-lg cursor-pointer transition-colors ${docChecklist[doc.key] ? 'border-green-400 bg-green-50 dark:bg-green-900/20 dark:border-green-600' : 'border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800'}`}>
                      <input type="checkbox" checked={docChecklist[doc.key]} onChange={(e) => setDocChecklist({ ...docChecklist, [doc.key]: e.target.checked })} className="mt-0.5 w-4 h-4 accent-green-600 flex-shrink-0" />
                      <div className="min-w-0">
                        <p className="font-medium text-sm text-gray-900 dark:text-white">{doc.name}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{doc.basis} — {doc.note}</p>
                      </div>
                      {docChecklist[doc.key] && <CheckCircle className="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5" />}
                    </label>
                  ))}
                </div>
              </div>

              {/* Running count */}
              <div className="text-center text-sm text-gray-600 dark:text-gray-300 pt-1">
                {Object.values(docChecklist).filter(Boolean).length} of {[...UK_LEGAL_DOCS, ...UK_SITE_DOCS].length} required documents confirmed
              </div>
            </div>
          )}

          {/* Step 3 — Review & Submit */}
          {addWizardStep === 3 && (
            <div className="overflow-y-auto flex-1 min-h-0 px-6 py-4 space-y-4">
              <p className="text-sm text-gray-600 dark:text-gray-300">Please review the details before creating the contractor record.</p>

              {/* Company summary */}
              <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 space-y-2">
                <h4 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2"><Building2 className="w-4 h-4" /> Company Details</h4>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                  <span className="text-gray-500 dark:text-gray-400">Company</span><span className="font-medium">{contractorForm.name}</span>
                  <span className="text-gray-500 dark:text-gray-400">Contact</span><span>{contractorForm.contactFirstName} {contractorForm.contactLastName}</span>
                  <span className="text-gray-500 dark:text-gray-400">Email</span><span>{contractorForm.email}</span>
                  <span className="text-gray-500 dark:text-gray-400">Phone</span><span>{contractorForm.phone || '—'}</span>
                  <span className="text-gray-500 dark:text-gray-400">Industry</span><span className="capitalize">{contractorForm.industry || '—'}</span>
                  <span className="text-gray-500 dark:text-gray-400">Postcode</span><span>{contractorForm.postcode || '—'}</span>
                </div>
              </div>

              {/* Document checklist summary */}
              <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 space-y-2">
                <h4 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2"><FileText className="w-4 h-4" /> Compliance Documents</h4>
                <div className="space-y-1.5">
                  {[...UK_LEGAL_DOCS, ...UK_SITE_DOCS, ...UK_GOOD_DOCS].map(doc => (
                    <div key={doc.key} className="flex items-center gap-2 text-sm">
                      {docChecklist[doc.key]
                        ? <CheckCircle className="w-4 h-4 text-green-600 flex-shrink-0" />
                        : <div className="w-4 h-4 rounded-full border-2 border-gray-300 dark:border-gray-500 flex-shrink-0" />
                      }
                      <span className={docChecklist[doc.key] ? 'text-gray-800 dark:text-gray-100' : 'text-gray-400 dark:text-gray-500'}>{doc.name}</span>
                      {!docChecklist[doc.key] && UK_LEGAL_DOCS.some(d => d.key === doc.key) && <Badge className="bg-red-100 text-red-700 text-xs ml-auto">Required</Badge>}
                    </div>
                  ))}
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">Upload the actual document files from the contractor's detail page after registration.</p>
              </div>

              {/* Warnings */}
              {(!docChecklist.publicLiability || !docChecklist.employersLiability) && (
                <div className="bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-700 rounded-lg px-4 py-3 flex items-start gap-2 text-sm text-amber-800 dark:text-amber-300">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <span>Some legally required documents have not been confirmed. Ensure these are provided before the contractor begins any work on site.</span>
                </div>
              )}
            </div>
          )}

          {/* Step 4 — Success */}
          {addWizardStep === 4 && (
            <div className="overflow-y-auto flex-1 min-h-0 px-6 py-8 flex flex-col items-center justify-center gap-6 text-center">
              <div className="w-16 h-16 bg-green-100 dark:bg-green-900/40 rounded-full flex items-center justify-center">
                <CheckCircle className="w-9 h-9 text-green-600" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">Contractor Added Successfully</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  <span className="font-medium text-gray-800 dark:text-gray-100">{justCreatedCompany?.name || justCreatedCompany?.companyName || 'The company'}</span> has been registered.
                  Upload their compliance documents from the detail page at any time.
                </p>
              </div>
              <div className="flex flex-col sm:flex-row gap-3 w-full max-w-sm">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => { setShowAddContractorDialog(false); resetAddWizard(); }}
                >
                  Done
                </Button>
                <Button
                  className="flex-1 bg-blue-600 hover:bg-blue-700"
                  onClick={() => {
                    setShowAddContractorDialog(false);
                    resetAddWizard();
                    if (justCreatedCompany) {
                      setSelectedContractor(justCreatedCompany as any);
                      setWorkerForm({ ...workerForm, companyId: justCreatedCompany.id });
                      setShowAddWorkerDialog(true);
                    }
                  }}
                >
                  Add First Worker →
                </Button>
              </div>
            </div>
          )}

          {/* Footer navigation */}
          <div className="flex-shrink-0 border-t px-6 py-4 flex items-center justify-between gap-3">
            {addWizardStep < 4 && (
              <Button variant="outline" onClick={() => addWizardStep > 1 ? setAddWizardStep(addWizardStep - 1) : setShowAddContractorDialog(false)}>
                {addWizardStep > 1 ? '← Back' : 'Cancel'}
              </Button>
            )}
            {addWizardStep === 4 && <div />}
            <div className="flex items-center gap-2">
              {addWizardStep < 3 ? (
                <Button
                  onClick={() => setAddWizardStep(addWizardStep + 1)}
                  disabled={addWizardStep === 1 && (!contractorForm.name || !contractorForm.email || !contractorForm.contactFirstName || !contractorForm.contactLastName || !contractorForm.phone)}
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  Next →
                </Button>
              ) : addWizardStep === 3 ? (
                <Button onClick={handleAddContractor} disabled={!contractorForm.name || !contractorForm.email || !contractorForm.contactFirstName || !contractorForm.contactLastName || createContractorMutation.isPending} className="bg-blue-600 hover:bg-blue-700" data-testid="button-save-contractor">
                  {createContractorMutation.isPending ? "Creating..." : "Create Contractor"}
                </Button>
              ) : null}
            </div>
          </div>
        </DialogContent>
      </Dialog>
      
      {/* Add Worker — 3-step Wizard */}
      <Dialog open={showAddWorkerDialog} onOpenChange={(open) => { setShowAddWorkerDialog(open); if (!open) resetWorkerWizard(); }}>
        <DialogContent className="w-[95vw] sm:max-w-2xl max-h-[92vh] flex flex-col overflow-hidden p-0">
          {/* Header + Progress */}
          <div className="flex-shrink-0 px-6 pt-6 pb-4 border-b">
            <DialogTitle className="flex items-center gap-2 text-lg font-semibold mb-4">
              <User className="h-5 w-5 text-blue-600" />
              Add Worker — {selectedContractor?.name}
            </DialogTitle>
            <div className="flex items-center gap-0">
              {[{ n: 1, label: "Personal Details" }, { n: 2, label: "Right to Work & Cards" }, { n: 3, label: "Training & Review" }].map((s, i) => (
                <div key={s.n} className={`flex items-center ${i < 2 ? 'flex-1' : ''}`}>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${workerWizardStep >= s.n ? 'bg-blue-600 text-white' : 'bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400'}`}>{workerWizardStep > s.n ? '✓' : s.n}</div>
                    <span className={`text-xs font-medium hidden sm:inline transition-colors ${workerWizardStep >= s.n ? 'text-blue-700 dark:text-blue-400' : 'text-gray-400 dark:text-gray-500'}`}>{s.label}</span>
                  </div>
                  {i < 2 && <div className={`flex-1 h-0.5 mx-2 transition-colors ${workerWizardStep > s.n ? 'bg-blue-600' : 'bg-gray-200 dark:bg-gray-700'}`} />}
                </div>
              ))}
            </div>
          </div>

          {/* Step 1 — Personal Details */}
          {workerWizardStep === 1 && (
            <div className="overflow-y-auto flex-1 min-h-0 px-6 py-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700 dark:text-slate-200">First Name *</label>
                  <Input value={workerForm.firstName} onChange={(e) => setWorkerForm({ ...workerForm, firstName: e.target.value })} data-testid="input-worker-firstname" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700 dark:text-slate-200">Last Name *</label>
                  <Input value={workerForm.lastName} onChange={(e) => setWorkerForm({ ...workerForm, lastName: e.target.value })} data-testid="input-worker-lastname" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700 dark:text-slate-200">Email Address</label>
                  <Input type="email" value={workerForm.email} onChange={(e) => setWorkerForm({ ...workerForm, email: e.target.value })} data-testid="input-worker-email" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700 dark:text-slate-200">Phone Number *</label>
                  <Input type="tel" value={workerForm.phone} onChange={(e) => setWorkerForm({ ...workerForm, phone: e.target.value })} data-testid="input-worker-phone" placeholder="e.g. 07700 900000" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700 dark:text-slate-200">Home Postcode</label>
                  <Input value={workerForm.postcode} onChange={(e) => setWorkerForm({ ...workerForm, postcode: e.target.value })} data-testid="input-worker-postcode" />
                  <p className="text-xs text-slate-500 dark:text-slate-400">Used for CO2 emissions calculations</p>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700 dark:text-slate-200">Vehicle / Transport</label>
                  <select
                    value={workerForm.transportMethod}
                    onChange={(e) => setWorkerForm({ ...workerForm, transportMethod: e.target.value })}
                    data-testid="select-worker-transport"
                    className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring appearance-none"
                  >
                    <option value="car_diesel">Car (Diesel)</option>
                    <option value="car_petrol">Car (Petrol)</option>
                    <option value="electric_car">Electric Car</option>
                    <option value="hybrid_car">Hybrid Car</option>
                    <option value="van_diesel">Van (Diesel)</option>
                    <option value="van_petrol">Van (Petrol)</option>
                    <option value="motorcycle">Motorcycle</option>
                    <option value="public_transport">Public Transport</option>
                    <option value="bicycle">Bicycle</option>
                    <option value="walking">Walking</option>
                  </select>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Used for CO2 emissions calculations</p>
                </div>
              </div>
            </div>
          )}

          {/* Step 2 — Right to Work & Competence Cards */}
          {workerWizardStep === 2 && (
            <div className="overflow-y-auto flex-1 min-h-0 px-6 py-4 space-y-5">

              {/* Right to Work */}
              <div className="border rounded-lg p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 bg-red-100 rounded-full flex items-center justify-center flex-shrink-0">
                    <Lock className="w-3.5 h-3.5 text-red-600" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-gray-900 dark:text-white text-sm">Right to Work</h4>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Immigration Act 2014 — <span className="font-semibold text-red-600">Legally required before work commences</span></p>
                  </div>
                </div>
                <select
                  value={workerForm.rightToWork}
                  onChange={(e) => setWorkerForm({ ...workerForm, rightToWork: e.target.value as "valid" | "expired" | "pending" })}
                  data-testid="select-right-to-work"
                  className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring appearance-none"
                >
                  <option value="valid">Valid — check complete</option>
                  <option value="pending">Pending — check in progress</option>
                  <option value="expired">Expired — requires re-check</option>
                </select>
                {workerForm.rightToWork === 'pending' && (
                  <div className="bg-amber-50 border border-amber-200 rounded px-3 py-2 text-xs text-amber-800">
                    Worker cannot be permitted to work unsupervised until Right to Work is confirmed.
                  </div>
                )}
              </div>

              {/* CSCS Card */}
              <div className="border rounded-lg p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 bg-amber-100 rounded-full flex items-center justify-center flex-shrink-0">
                    <Shield className="w-3.5 h-3.5 text-amber-600" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-gray-900 dark:text-white text-sm">CSCS Card</h4>
                    <p className="text-xs text-gray-500 dark:text-gray-400">CDM 2015 / Site policy — required on most construction sites</p>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-slate-600 dark:text-slate-300">Card Number</label>
                    <Input value={workerForm.cscsCard} onChange={(e) => setWorkerForm({ ...workerForm, cscsCard: e.target.value })} placeholder="e.g. CS-1234567" data-testid="input-cscs-card" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-slate-600 dark:text-slate-300">Status</label>
                    <select
                      value={workerForm.cscsStatus}
                      onChange={(e) => setWorkerForm({ ...workerForm, cscsStatus: e.target.value as "valid" | "expired" | "pending" })}
                      data-testid="select-cscs-status"
                      className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring appearance-none"
                    >
                      <option value="valid">Valid</option>
                      <option value="pending">Pending</option>
                      <option value="expired">Expired</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* IPAF */}
              <div className="border rounded-lg p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 bg-amber-100 rounded-full flex items-center justify-center flex-shrink-0">
                    <Shield className="w-3.5 h-3.5 text-amber-600" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-gray-900 dark:text-white text-sm">IPAF Card</h4>
                    <p className="text-xs text-gray-500 dark:text-gray-400">PUWER / WAHR 2005 — required for MEWP operation (cherry pickers, scissor lifts)</p>
                  </div>
                </div>
                <select
                  value={workerForm.ipafStatus}
                  onChange={(e) => setWorkerForm({ ...workerForm, ipafStatus: e.target.value as "none" | "3a" | "3b" | "1+" | "expired" })}
                  data-testid="select-ipaf-status"
                  className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring appearance-none"
                >
                  <option value="none">Not applicable / not held</option>
                  <option value="3a">3a — Mobile Vertical (scissor lifts)</option>
                  <option value="3b">3b — Mobile Boom (cherry pickers)</option>
                  <option value="1+">1+ — Static Vertical (push-around)</option>
                  <option value="expired">Held but Expired</option>
                </select>
              </div>
            </div>
          )}

          {/* Step 3 — Training & Summary */}
          {workerWizardStep === 3 && (
            <div className="overflow-y-auto flex-1 min-h-0 px-6 py-4 space-y-5">
              {/* Training certificates */}
              <div>
                <h4 className="font-semibold text-gray-900 dark:text-white text-sm mb-3">Training Certificates</h4>
                <div className="space-y-2">
                  <label className="flex items-start gap-3 p-3 border dark:border-gray-700 rounded-lg cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800">
                    <input type="checkbox" checked={workerForm.asbestosAwareness} onChange={(e) => setWorkerForm({ ...workerForm, asbestosAwareness: e.target.checked })} className="mt-0.5 w-4 h-4 accent-green-600" data-testid="checkbox-asbestos" />
                    <div>
                      <p className="font-medium text-sm">Asbestos Awareness</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">CAR 2012 — required for most construction and refurbishment work</p>
                    </div>
                  </label>
                  <label className="flex items-start gap-3 p-3 border dark:border-gray-700 rounded-lg cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800">
                    <input type="checkbox" checked={workerForm.manualHandling} onChange={(e) => setWorkerForm({ ...workerForm, manualHandling: e.target.checked })} className="mt-0.5 w-4 h-4 accent-green-600" data-testid="checkbox-manual-handling" />
                    <div>
                      <p className="font-medium text-sm">Manual Handling</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">MHOR 1992 — required for all roles involving lifting or carrying</p>
                    </div>
                  </label>
                  <label className="flex items-start gap-3 p-3 border dark:border-gray-700 rounded-lg cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800">
                    <input type="checkbox" checked={workerForm.workingAtHeight} onChange={(e) => setWorkerForm({ ...workerForm, workingAtHeight: e.target.checked })} className="mt-0.5 w-4 h-4 accent-green-600" data-testid="checkbox-working-height" />
                    <div>
                      <p className="font-medium text-sm">Working at Height</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">WAHR 2005 — required when using ladders, scaffolding, or MEWPs</p>
                    </div>
                  </label>
                  <label className="flex items-start gap-3 p-3 border dark:border-gray-700 rounded-lg cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800">
                    <input type="checkbox" checked={workerForm.inductionCompleted} onChange={(e) => setWorkerForm({ ...workerForm, inductionCompleted: e.target.checked })} className="mt-0.5 w-4 h-4 accent-green-600" data-testid="checkbox-induction" />
                    <div>
                      <p className="font-medium text-sm">Site Induction Completed</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">Site-specific H&S briefing completed</p>
                    </div>
                  </label>
                </div>
              </div>

              {/* Compliance summary panel */}
              <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 space-y-2">
                <h4 className="font-semibold text-gray-900 dark:text-white text-sm flex items-center gap-2"><Shield className="w-4 h-4" /> Compliance Summary</h4>
                <div className="space-y-1.5 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-gray-600 dark:text-gray-300">Right to Work</span>
                    <Badge className={workerForm.rightToWork === 'valid' ? 'bg-green-100 text-green-700' : workerForm.rightToWork === 'expired' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}>
                      {workerForm.rightToWork === 'valid' ? '✅ Valid' : workerForm.rightToWork === 'expired' ? '❌ Expired' : '⏳ Pending'}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-600 dark:text-gray-300">CSCS Card</span>
                    <Badge className={workerForm.cscsStatus === 'valid' ? 'bg-green-100 text-green-700' : workerForm.cscsStatus === 'expired' ? 'bg-red-100 text-red-700' : workerForm.cscsCard ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-500'}>
                      {workerForm.cscsStatus === 'valid' ? '✅ Valid' : workerForm.cscsStatus === 'expired' ? '❌ Expired' : workerForm.cscsCard ? '⏳ Pending' : '— Not recorded'}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-600 dark:text-gray-300">IPAF</span>
                    <Badge className={workerForm.ipafStatus === 'none' ? 'bg-gray-100 text-gray-500' : workerForm.ipafStatus === 'expired' ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}>
                      {workerForm.ipafStatus === 'none' ? '— Not applicable' : workerForm.ipafStatus === 'expired' ? '❌ Expired' : `✅ ${workerForm.ipafStatus}`}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-600 dark:text-gray-300">Asbestos Awareness</span>
                    <Badge className={workerForm.asbestosAwareness ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}>
                      {workerForm.asbestosAwareness ? '✅ Held' : '— Not recorded'}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-600 dark:text-gray-300">Manual Handling</span>
                    <Badge className={workerForm.manualHandling ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}>
                      {workerForm.manualHandling ? '✅ Held' : '— Not recorded'}
                    </Badge>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Step 4 — Success */}
          {workerWizardStep === 4 && (
            <div className="overflow-y-auto flex-1 min-h-0 px-6 py-10 flex flex-col items-center justify-center gap-5 text-center">
              <div className="w-16 h-16 bg-green-100 dark:bg-green-900/40 rounded-full flex items-center justify-center">
                <CheckCircle className="w-9 h-9 text-green-600" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">Worker Added</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  <span className="font-medium text-gray-800 dark:text-gray-100">{workerWizardSavedName}</span> has been registered to {selectedContractor?.name}.
                </p>
              </div>
              <div className="flex flex-col sm:flex-row gap-3 w-full max-w-sm">
                <Button variant="outline" className="flex-1" onClick={() => { setShowAddWorkerDialog(false); resetWorkerWizard(); }}>
                  Done
                </Button>
                <Button className="flex-1 bg-blue-600 hover:bg-blue-700" onClick={() => resetWorkerWizard()}>
                  Add Another Worker →
                </Button>
              </div>
            </div>
          )}

          {/* Footer navigation */}
          {workerWizardStep < 4 && (
          <div className="flex-shrink-0 border-t px-6 py-4 flex items-center justify-between gap-3">
            <Button variant="outline" onClick={() => workerWizardStep > 1 ? setWorkerWizardStep(workerWizardStep - 1) : setShowAddWorkerDialog(false)}>
              {workerWizardStep > 1 ? '← Back' : 'Cancel'}
            </Button>
            <div className="flex items-center gap-2">
              {workerWizardStep < 3 ? (
                <Button onClick={() => setWorkerWizardStep(workerWizardStep + 1)} disabled={workerWizardStep === 1 && (!workerForm.firstName || !workerForm.lastName || !workerForm.phone)} className="bg-blue-600 hover:bg-blue-700">
                  Next →
                </Button>
              ) : (
                <Button onClick={handleAddWorker} disabled={!workerForm.firstName || !workerForm.lastName || !workerForm.phone || createWorkerMutation.isPending} className="bg-blue-600 hover:bg-blue-700" data-testid="button-save-worker">
                  {createWorkerMutation.isPending ? "Saving..." : "Save Worker"}
                </Button>
              )}
            </div>
          </div>
          )}
        </DialogContent>
      </Dialog>

      {activeTab === "co2" && (
        <div className="space-y-6">
          {/* Company Selection */}
          <GlassCard className="p-4">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Leaf className="h-5 w-5 text-green-600" />
                <span className="font-medium">Select Company:</span>
              </div>
              <Select value={selectedCO2CompanyId} onValueChange={setSelectedCO2CompanyId}>
                <SelectTrigger className="w-64" data-testid="select-co2-company">
                  <SelectValue placeholder="Choose contractor company" />
                </SelectTrigger>
                <SelectContent>
                  {companies.map((company) => (
                    <SelectItem key={company.id} value={company.id}>
                      {company.name} ({company.workersCount} workers)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </GlassCard>

          {/* CO2 Reports Component */}
          {selectedCO2CompanyId && (
            <CO2SustainabilityReports
              companyId={selectedCO2CompanyId}
              companyName={companies.find(c => c.id === selectedCO2CompanyId)?.name}
            />
          )}
        </div>
      )}

      {activeTab === "assign-hs" && (
        <HSDocumentAssignment 
          onNavigateToTab={(target) => {
            switch (target) {
              case 'contractors':
                setActiveTab('contractors');
                break;
              case 'previous':
                setActiveTab('previous');
                break;
              case 'templates':
                toast({
                  title: "Document Templates",
                  description: "Use the assignment dialog to view and manage document templates",
                });
                break;
              case 'assignments':
                toast({
                  title: "Assignment History",
                  description: "Assignment history is displayed in the current dashboard",
                });
                break;
              default:
                break;
            }
          }}
        />
      )}

      {activeTab === "rams" && (
        <RAMSManagement />
      )}

      {activeTab === "ppm" && (
        <ContractorPPMTab />
      )}

      {activeTab === "cdm" && (
        <ContractorCDMTab companies={companies} />
      )}
      
      {/* H&S Acceptance Modal */}
      {workerForCheckIn && (
        <ContractorHSModal
          isOpen={showHSModal}
          onClose={() => {
            setShowHSModal(false);
            setWorkerForCheckIn(null);
            setCompanyForCheckIn("");
          }}
          onAccept={(worker) => {
            setCheckInWorkerId(worker.id);
            setCheckInWorkerName(`${worker.firstName} ${worker.lastName}`);
            setSelectedCheckInHost('');
            setShowCheckInHostDialog(true);
            setShowHSModal(false);
            setWorkerForCheckIn(null);
            setCompanyForCheckIn("");
          }}
          worker={workerForCheckIn}
          companyName={companyForCheckIn}
        />
      )}

      {/* Pre-Book Worker Modal */}
      <Dialog open={!!preBookingWorker} onOpenChange={(open) => !open && setPreBookingWorker(null)}>
        <DialogContent
          className="w-[95vw] sm:max-w-md"
          onFocusOutside={(e) => e.preventDefault()}
          onInteractOutside={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarPlus className="w-5 h-5 text-indigo-600" />
              Pre-Book Worker
            </DialogTitle>
            <DialogDescription>
              Schedule {preBookingWorker?.firstName} {preBookingWorker?.lastName} from {preBookCompanyName} for an upcoming site visit.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="p-3 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
              <div className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-green-600" />
                <span className="text-sm font-medium text-green-700 dark:text-green-400">
                  {preBookingWorker?.firstName} {preBookingWorker?.lastName} - Cleared for Work
                </span>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-start text-left font-normal">
                    <CalendarPlus className="mr-2 h-4 w-4" />
                    {format(preBookDate, "PPP")}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <CalendarPicker
                    mode="single"
                    selected={preBookDate}
                    onSelect={(date) => date && setPreBookDate(date)}
                    disabled={(date) => {
                      const today = new Date();
                      today.setHours(0, 0, 0, 0);
                      const checkDate = new Date(date);
                      checkDate.setHours(0, 0, 0, 0);
                      return checkDate < today;
                    }}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Arrival Time</Label>
                <Input
                  type="time"
                  value={preBookTime}
                  onChange={(e) => setPreBookTime(e.target.value)}
                  min={(() => {
                    const today = new Date();
                    today.setHours(0, 0, 0, 0);
                    const selectedDay = new Date(preBookDate);
                    selectedDay.setHours(0, 0, 0, 0);
                    if (selectedDay.getTime() === today.getTime()) {
                      const now = new Date();
                      return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
                    }
                    return undefined;
                  })()}
                />
              </div>
              <div className="space-y-2">
                <Label>Duration (hours)</Label>
                <select
                  value={preBookDuration}
                  onChange={(e) => setPreBookDuration(e.target.value)}
                  className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring appearance-none"
                >
                  <option value="2">2 hours</option>
                  <option value="4">4 hours (Half day)</option>
                  <option value="8">8 hours (Full day)</option>
                  <option value="10">10 hours</option>
                  <option value="12">12 hours</option>
                </select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Purpose</Label>
              <select
                value={preBookPurpose}
                onChange={(e) => setPreBookPurpose(e.target.value)}
                className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring appearance-none"
              >
                <option value="Site work">Site Work</option>
                <option value="Maintenance">Maintenance</option>
                <option value="Installation">Installation</option>
                <option value="Inspection">Inspection</option>
                <option value="Repair">Repair</option>
                <option value="Survey">Survey</option>
                <option value="Other">Other</option>
              </select>
            </div>

            <div className="space-y-2">
              <Label>Host Staff Member *</Label>
              <StaffSearchSelect
                staff={staffList.filter((s: any) => s.isActive !== false)}
                value={preBookHost}
                onChange={setPreBookHost}
                placeholder="Search by name or department…"
              />
            </div>

            <div className="space-y-2">
              <Label>Notes (optional)</Label>
              <Textarea
                value={preBookNotes}
                onChange={(e) => setPreBookNotes(e.target.value)}
                placeholder="Any additional notes..."
                rows={2}
              />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setPreBookingWorker(null)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (!preBookingWorker) return;
                const preBookHostStaff = staffList.find((s: any) => s.id === preBookHost);
                preBookWorkerMutation.mutate({
                  worker: preBookingWorker,
                  date: preBookDate,
                  time: preBookTime,
                  purpose: preBookPurpose,
                  duration: preBookDuration,
                  notes: preBookNotes,
                  companyName: preBookCompanyName,
                  hostStaffId: preBookHost || undefined,
                  hostName: preBookHostStaff ? `${preBookHostStaff.firstName} ${preBookHostStaff.lastName}` : undefined,
                });
              }}
              disabled={preBookWorkerMutation.isPending || !preBookHost}
              className="bg-indigo-600 hover:bg-indigo-700 text-white"
            >
              {preBookWorkerMutation.isPending ? "Booking..." : "Confirm Pre-Booking"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Worker Profile Popup */}
      <Dialog open={!!viewingWorker} onOpenChange={(open) => { if (!open) setViewingWorker(null); }}>
        <DialogContent className="w-[95vw] sm:max-w-sm p-0 overflow-hidden rounded-2xl" aria-describedby={undefined}>
          <DialogTitle className="sr-only">Worker Profile</DialogTitle>
          {viewingWorker && (() => {
            const ww = viewingWorker;
            const photoSrc = ww.photoUrl
              ? (ww.photoUrl.startsWith('/objects/') ? ww.photoUrl : `/objects${ww.photoUrl}`)
              : null;
            const isCheckedIn = ww.isCheckedIn;
            const isBanned = ww.currentCardStatus === 'red' && ww.redCardBanUntil && new Date(ww.redCardBanUntil) > new Date();
            const isClear = !isBanned && ww.isActive !== false && (!ww.currentCardStatus || ww.currentCardStatus === 'clear' || ww.currentCardStatus === 'yellow');
            const notCleared = isBanned || ww.rightToWork !== 'valid' || !ww.inductionCompleted;
            const blockReason = isBanned ? 'Active site ban (Red Card)' : ww.rightToWork !== 'valid' ? 'Right to work not verified' : !ww.inductionCompleted ? 'Site induction not completed' : '';
            return (
              <>
                {/* Slim top bar */}
                <div className="bg-gradient-to-r from-orange-500 to-amber-500 px-4 py-2 pr-10">
                  <p className="text-white/80 text-[10px] font-medium uppercase tracking-widest">Contractor Worker · {ww.companyName}</p>
                </div>

                {/* Photo + details */}
                <div className="flex flex-col items-center px-6 pt-5 pb-6">
                  {/* Hidden file input */}
                  <input
                    type="file"
                    accept="image/*"
                    id={workerPhotoInputId}
                    className="hidden"
                    onChange={handleWorkerPhotoUpload}
                  />

                  {/* Avatar with upload overlay */}
                  <div className="relative group">
                    <div className="w-36 h-36 rounded-full border-4 border-orange-100 shadow-xl overflow-hidden bg-gradient-to-br from-orange-500 to-amber-500 flex items-center justify-center">
                      {photoSrc ? (
                        <img src={photoSrc} alt={`${ww.firstName} ${ww.lastName}`} className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-white font-bold text-4xl">
                          {(ww.firstName?.[0] || '').toUpperCase()}{(ww.lastName?.[0] || '').toUpperCase()}
                        </span>
                      )}
                    </div>
                    <label
                      htmlFor={workerPhotoInputId}
                      className="absolute inset-0 rounded-full flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 cursor-pointer transition-opacity"
                      title="Upload photo"
                    >
                      {isUploadingWorkerPhoto ? (
                        <div className="animate-spin h-6 w-6 border-2 border-white border-t-transparent rounded-full" />
                      ) : (
                        <Camera size={24} className="text-white" />
                      )}
                    </label>
                  </div>

                  <h2 className="mt-3 text-xl font-bold text-gray-900 dark:text-white">{ww.firstName} {ww.lastName}</h2>
                  {ww.jobTitle && <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{ww.jobTitle}</p>}

                  {/* Status + compliance badges */}
                  <div className="flex items-center gap-2 mt-2 flex-wrap justify-center">
                    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${isCheckedIn ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'}`}>
                      {isCheckedIn ? '● On Site' : '● Available'}
                    </span>
                    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${ww.rightToWork === 'valid' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                      {ww.rightToWork === 'valid' ? '✓' : '!'} Work Auth
                    </span>
                    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${ww.inductionCompleted ? 'bg-blue-100 text-blue-800' : 'bg-amber-100 text-amber-800'}`}>
                      {ww.inductionCompleted ? '✓ Inducted' : '! No Induction'}
                    </span>
                    {ww.safetyRating && (
                      <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${getSafetyRatingColor(ww.safetyRating)}`}>
                        {ww.safetyRating}
                      </span>
                    )}
                    {isBanned && (
                      <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-red-200 text-red-900">
                        🚫 Site Ban
                      </span>
                    )}
                  </div>

                  {/* Details grid with icon bubbles */}
                  <div className="mt-5 w-full space-y-3 border-t pt-4">
                    {ww.email && (
                      <div className="flex items-center gap-3 text-sm">
                        <div className="w-7 h-7 rounded-full bg-orange-50 flex items-center justify-center flex-shrink-0">
                          <Mail size={13} className="text-orange-600" />
                        </div>
                        <span className="text-gray-700 dark:text-gray-200 break-all">{ww.email}</span>
                      </div>
                    )}
                    {(ww.phoneNumber || ww.mobileNumber) && (
                      <div className="flex items-center gap-3 text-sm">
                        <div className="w-7 h-7 rounded-full bg-orange-50 dark:bg-orange-900/30 flex items-center justify-center flex-shrink-0">
                          <Phone size={13} className="text-orange-600" />
                        </div>
                        <span className="text-gray-700 dark:text-gray-200">{ww.phoneNumber || ww.mobileNumber}</span>
                      </div>
                    )}
                    {ww.updatedAt && !isCheckedIn && (
                      <div className="flex items-center gap-3 text-sm">
                        <div className="w-7 h-7 rounded-full bg-orange-50 dark:bg-orange-900/30 flex items-center justify-center flex-shrink-0">
                          <History size={13} className="text-orange-600" />
                        </div>
                        <span className="text-gray-700 dark:text-gray-200">
                          Last visit: {new Date(ww.updatedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </span>
                      </div>
                    )}
                    {isCheckedIn && ww.checkedInAt && (
                      <div className="flex items-center gap-3 text-sm">
                        <div className="w-7 h-7 rounded-full bg-green-50 dark:bg-green-900/30 flex items-center justify-center flex-shrink-0">
                          <Clock size={13} className="text-green-600" />
                        </div>
                        <span className="text-gray-700 dark:text-gray-200">
                          Signed in at {new Date(ww.checkedInAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Action buttons */}
                  <div className="flex gap-2 mt-5 w-full flex-wrap">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1 text-xs"
                      onClick={() => {
                        setViewingWorker(null);
                        setSelectedWorkerForEdit(ww);
                        setSelectedWorkerCompanyName(ww.companyName);
                        setShowContractorEditModal(true);
                      }}
                    >
                      <Edit size={13} className="mr-1" /> Edit Profile
                    </Button>
                    {isClear && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1 text-xs text-indigo-600 border-indigo-300 hover:bg-indigo-50"
                        onClick={() => { setViewingWorker(null); setQrPassWorker(ww); }}
                      >
                        <QrCode size={13} className="mr-1" /> QR Pass
                      </Button>
                    )}
                    {isClear && !isCheckedIn && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1 text-xs text-indigo-600 border-indigo-300 hover:bg-indigo-50"
                        onClick={() => {
                          setViewingWorker(null);
                          setPreBookingWorker(ww);
                          setPreBookCompanyName(ww.companyName);
                        }}
                      >
                        <CalendarPlus size={13} className="mr-1" /> Pre-Book
                      </Button>
                    )}
                    {!isCheckedIn ? (
                      <Button
                        size="sm"
                        className={`flex-1 text-xs ${notCleared ? 'bg-gray-200 text-gray-400 cursor-not-allowed' : 'bg-green-600 hover:bg-green-700 text-white'}`}
                        disabled={notCleared || checkInMutation.isPending}
                        title={notCleared ? blockReason : 'Check in worker'}
                        onClick={() => {
                          if (notCleared) { toast({ title: "Cannot Check In", description: blockReason, variant: "destructive" }); return; }
                          setViewingWorker(null);
                          setWorkerForCheckIn(ww);
                          setCompanyForCheckIn(ww.companyName);
                          setShowHSModal(true);
                        }}
                      >
                        <LogIn size={13} className="mr-1" /> Check In
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        className="flex-1 text-xs bg-red-600 hover:bg-red-700 text-white"
                        disabled={checkOutMutation.isPending}
                        onClick={() => { setViewingWorker(null); checkOutMutation.mutate(ww.id); }}
                      >
                        <LogOut size={13} className="mr-1" /> Check Out
                      </Button>
                    )}
                  </div>
                </div>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* Host Selection Dialog for Contractor Check-in */}
      <Dialog open={showCheckInHostDialog} onOpenChange={(open) => { if (!open) { setShowCheckInHostDialog(false); setSelectedCheckInHost(''); setCheckInWorkerId(null); } }}>
        <DialogContent
          className="w-[95vw] sm:max-w-md"
          onFocusOutside={(e) => e.preventDefault()}
          onInteractOutside={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle>Select Host for {checkInWorkerName}</DialogTitle>
            <DialogDescription>Who is {checkInWorkerName} visiting today?</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Host Staff Member *</Label>
              <StaffSearchSelect
                staff={staffList.filter((s: any) => s.isActive !== false)}
                value={selectedCheckInHost}
                onChange={setSelectedCheckInHost}
                placeholder="Search by name or department…"
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => { setShowCheckInHostDialog(false); setSelectedCheckInHost(''); setCheckInWorkerId(null); }}>
              Cancel
            </Button>
            <Button
              disabled={!selectedCheckInHost || checkInMutation.isPending}
              onClick={() => {
                if (!checkInWorkerId) return;
                const host = staffList.find((s: any) => s.id === selectedCheckInHost);
                checkInMutation.mutate({
                  workerId: checkInWorkerId,
                  hostStaffId: selectedCheckInHost,
                  hostName: host ? `${host.firstName} ${host.lastName}` : undefined,
                });
                setShowCheckInHostDialog(false);
                setSelectedCheckInHost('');
                setCheckInWorkerId(null);
              }}
              className="bg-green-600 hover:bg-green-700 text-white"
            >
              {checkInMutation.isPending ? "Checking In..." : "Check In & Print Pass"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Contractor Worker QR Pass Dialog */}
      <Dialog open={!!qrPassWorker} onOpenChange={(open) => { if (!open) { setQrPassWorker(null); setQrPassData(null); } }}>
        <DialogContent className="w-[95vw] sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <QrCode className="w-5 h-5 text-indigo-600" />
              Contractor QR Check-In Pass
            </DialogTitle>
            <DialogDescription>
              Send a QR code pass to {qrPassWorker?.firstName} {qrPassWorker?.lastName} for quick kiosk check-in and check-out.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="p-3 bg-indigo-50 rounded-lg border border-indigo-200">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full flex items-center justify-center">
                  <span className="text-white font-bold text-sm">
                    {qrPassWorker ? `${qrPassWorker.firstName[0]}${qrPassWorker.lastName[0]}` : ''}
                  </span>
                </div>
                <div>
                  <p className="font-semibold text-gray-800">{qrPassWorker?.firstName} {qrPassWorker?.lastName}</p>
                  <p className="text-sm text-gray-600">{qrPassWorker?.companyName}</p>
                </div>
              </div>
            </div>

            {qrPassData && (
              <div className="text-center p-4 bg-white rounded-lg border">
                <img
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(qrPassData.qrCode)}`}
                  alt="Contractor QR Code"
                  className="w-40 h-40 mx-auto mb-2 rounded-lg shadow-sm"
                />
                <p className="text-xs text-gray-500 font-mono">{qrPassData.qrCode}</p>
              </div>
            )}

            <div className="grid grid-cols-1 gap-3">
              <Button
                onClick={() => qrPassWorker && sendWorkerQrPassMutation.mutate({ id: qrPassWorker.id, method: 'email' })}
                disabled={sendWorkerQrPassMutation.isPending}
                className="w-full justify-start gap-3 h-14 bg-blue-600 hover:bg-blue-700 text-white"
              >
                <Mail size={20} />
                <div className="text-left">
                  <div className="font-medium">Email QR Pass</div>
                  <div className="text-xs opacity-80">Send branded pass with QR code to {qrPassWorker?.email}</div>
                </div>
              </Button>

              <Button
                variant="outline"
                onClick={() => {
                  if (!qrPassWorker) return;
                  handlePrintWorkerQrPass(qrPassWorker.id);
                }}
                disabled={sendWorkerQrPassMutation.isPending}
                className="w-full justify-start gap-3 h-14"
              >
                <Printer size={20} className="text-green-600" />
                <div className="text-left">
                  <div className="font-medium">Print QR Pass</div>
                  <div className="text-xs text-gray-500">Print a card-sized pass with QR code</div>
                </div>
              </Button>

              <Button
                variant="outline"
                onClick={() => {
                  if (!qrPassWorker) return;
                  sendWorkerQrPassMutation.mutate({ id: qrPassWorker.id, method: 'download' }, {
                    onSuccess: (data) => {
                      handleDownloadWorkerQrPass(data.qrCode, data.workerName, data.companyName || qrPassWorker.companyName);
                    }
                  });
                }}
                disabled={sendWorkerQrPassMutation.isPending}
                className="w-full justify-start gap-3 h-14"
              >
                <Download size={20} className="text-purple-600" />
                <div className="text-left">
                  <div className="font-medium">Download QR Image</div>
                  <div className="text-xs text-gray-500">Download branded pass as image</div>
                </div>
              </Button>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => { setQrPassWorker(null); setQrPassData(null); }}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <QRScannerModal isOpen={showQRScanner} onClose={() => setShowQRScanner(false)} />
    </div>
  );
}
