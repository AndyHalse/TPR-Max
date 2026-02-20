import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import GlassCard from "@/components/GlassCard";
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
  List
} from "lucide-react";

import type { ContractorCompany, ContractorWorker } from "@shared/schema";

// Extended type for list view with computed fields
type ExtendedContractorCompany = ContractorCompany & {
  workersCount?: number;
  documentsStatus?: Record<string, string>;
  hasRedCard?: boolean;
  hasYellowCard?: boolean;
  serviceType?: string;
  contactEmail?: string;
};

export default function ContractorManagement() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [activeTab, setActiveTab] = useState<"previous" | "walkin" | "prebook" | "contractors" | "co2" | "assign-hs">("previous");
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
  const [previousViewMode, setPreviousViewMode] = useState<'grid' | 'list'>('grid');
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
      return await apiRequest("POST", "/api/contractors", data);
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Contractor company added successfully",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/contractors", customerId] });
      setShowAddContractorDialog(false);
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

  // Create worker mutation
  const createWorkerMutation = useMutation({
    mutationFn: async (data: any) => {
      return await apiRequest("POST", `/api/contractors/${data.companyId}/workers`, data);
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Worker added successfully",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/contractors", customerId] });
      queryClient.invalidateQueries({ queryKey: ["/api/contractors/workers/all", customerId] });
      setShowAddWorkerDialog(false);
      setWorkerForm({
        companyId: selectedContractor?.id || "",
        firstName: "",
        lastName: "",
        email: "",
        phone: "",
        postcode: "", // Reset postcode field
        rightToWork: "pending",
        cscsCard: "",
        cscsStatus: "pending",
        ipafStatus: "none",
        asbestosAwareness: false,
        manualHandling: false,
        workingAtHeight: false,
        inductionCompleted: false,
        isActive: true
      });
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
        phone: contractorToEdit.phone || "",
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
          phone: contractorToEdit.phone || "",
        }
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
        
        toast({
          title: "Success",
          description: "Contractor checked in successfully! Pass preview will open for printing.",
        });
      }
    },
    onError: (error) => {
      let errorMessage = "Failed to check in contractor";
      let errorDetails = "";
      
      try {
        // Try to parse the error response for detailed information
        const errorText = error.message;
        if (errorText.includes("details")) {
          const match = errorText.match(/details":"([^"]+)"/);
          if (match) {
            errorDetails = match[1];
          }
        }
      } catch (e) {
        // If parsing fails, use default message
      }
      
      toast({
        title: "Cannot Check In",
        description: errorDetails || errorMessage,
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

  if (showWalkInForm) {
    return <WalkInContractorForm onBack={() => setShowWalkInForm(false)} />;
  }

  return (
    <div className="p-3 sm:p-6 space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <HardHat className="h-8 w-8 text-orange-600" />
          <h1 className="text-xl sm:text-3xl font-bold text-slate-800">Contractor Management</h1>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="flex flex-wrap gap-1.5 sm:gap-4">
        <Button
          variant={activeTab === "previous" ? "default" : "outline"}
          onClick={() => setActiveTab("previous")}
          className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm px-2 sm:px-4"
          data-testid="tab-previous-contractors"
        >
          <History className="h-3 w-3 sm:h-4 sm:w-4 flex-shrink-0" />
          <span className="truncate">Previous Contractors</span>
        </Button>
        <Button
          variant={activeTab === "contractors" ? "default" : "outline"}
          onClick={() => setActiveTab("contractors")}
          className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm px-2 sm:px-4"
          data-testid="tab-contractors"
        >
          <Building2 className="h-3 w-3 sm:h-4 sm:w-4 flex-shrink-0" />
          <span className="truncate">Contractors</span>
        </Button>
        <Button
          variant={activeTab === "walkin" ? "default" : "outline"}
          onClick={() => setActiveTab("walkin")}
          className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm px-2 sm:px-4"
          data-testid="tab-walkin-registration"
        >
          <UserPlus className="h-3 w-3 sm:h-4 sm:w-4 flex-shrink-0" />
          <span className="truncate">Walk-in</span>
        </Button>
        <Button
          variant={activeTab === "prebook" ? "default" : "outline"}
          onClick={() => setActiveTab("prebook")}
          className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm px-2 sm:px-4"
          data-testid="tab-pre-booking"
        >
          <CalendarPlus className="h-3 w-3 sm:h-4 sm:w-4 flex-shrink-0" />
          <span className="truncate">Pre-booking</span>
        </Button>
        
        <Button
          variant={activeTab === "co2" ? "default" : "outline"}
          onClick={() => setActiveTab("co2")}
          className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm px-2 sm:px-4"
          data-testid="tab-co2-reports"
        >
          <Leaf className="h-3 w-3 sm:h-4 sm:w-4 flex-shrink-0" />
          <span className="truncate">CO2 Reports</span>
        </Button>
        <Button
          variant={activeTab === "assign-hs" ? "default" : "outline"}
          onClick={() => setActiveTab("assign-hs")}
          className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm px-2 sm:px-4"
          data-testid="tab-assign-hs"
        >
          <Shield className="h-3 w-3 sm:h-4 sm:w-4 flex-shrink-0" />
          <span className="truncate">H&S Document</span>
        </Button>
      </div>

      {/* Tab Content */}
      {activeTab === "previous" && (
        <div className="space-y-4">
          <div className="space-y-4">
            {/* Section Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <History className="h-5 w-5 text-slate-600 dark:text-slate-400" />
                <h2 className="text-xl font-semibold text-fixed">Previous Contractors</h2>
                <span className="text-sm text-variable">
                  Select a contractor who has been onsite before
                </span>
              </div>
              {/* Remove Duplicates button removed - duplication prevented via email validation */}
            </div>

            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-3 h-5 w-5 text-slate-400" />
              <Input
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search by contractor name or company..."
                className="pl-10"
                data-testid="input-search-contractors"
              />
            </div>

            {/* Show All Button & View Toggle */}
            <div className="flex justify-between items-center">
              <div className="text-sm text-slate-600">
                Showing {showAllWorkers ? previousContractors.length : Math.min(6, previousContractors.length)} of {previousContractors.length} contractors
                {searchTerm && ` matching "${searchTerm}"`}
              </div>
              <div className="flex items-center gap-2">
                <div className="flex border rounded-lg overflow-hidden">
                  <Button
                    size="sm"
                    variant={previousViewMode === 'grid' ? 'default' : 'outline'}
                    className="rounded-none border-0 px-2"
                    onClick={() => setPreviousViewMode('grid')}
                    title="Grid view"
                  >
                    <LayoutGrid size={14} />
                  </Button>
                  <Button
                    size="sm"
                    variant={previousViewMode === 'list' ? 'default' : 'outline'}
                    className="rounded-none border-0 px-2"
                    onClick={() => setPreviousViewMode('list')}
                    title="List view"
                  >
                    <List size={14} />
                  </Button>
                </div>
                <Button 
                  variant="outline" 
                  className="text-blue-600 border-blue-600 hover:bg-blue-50"
                  onClick={() => setShowAllWorkers(!showAllWorkers)}
                >
                  {showAllWorkers ? 'Show Less' : `Show All ${allWorkers.length} Current Workers`}
                </Button>
              </div>
            </div>

            {/* Contractors Grid/List */}
            <div className={previousViewMode === 'grid' ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-6" : "space-y-2"}>
              {previousContractors.slice(0, showAllWorkers ? previousContractors.length : 6).map((contractor) => (
                previousViewMode === 'grid' ? (
                <GlassCard 
                  key={contractor.id} 
                  hover
                  className="cursor-pointer"
                  onClick={() => {
                    const isBanned = contractor.currentCardStatus === 'red' && contractor.redCardBanUntil && new Date(contractor.redCardBanUntil) > new Date();
                    const isClear = !isBanned && contractor.isActive && (!contractor.currentCardStatus || contractor.currentCardStatus === 'clear' || contractor.currentCardStatus === 'yellow');
                    if (isClear) {
                      setPreBookingWorker(contractor);
                      setPreBookCompanyName(contractor.companyName);
                    } else {
                      toast({ title: "Cannot pre-book", description: "This worker is not currently cleared for work", variant: "destructive" });
                    }
                  }}
                >
                  <div className="flex items-start space-x-3 mb-3">
                    <div className={`w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 ${
                      ['bg-gradient-to-r from-orange-500 to-red-500',
                       'bg-gradient-to-r from-blue-500 to-purple-500',
                       'bg-gradient-to-r from-green-500 to-teal-500',
                       'bg-gradient-to-r from-purple-500 to-pink-500',
                       'bg-gradient-to-r from-indigo-500 to-purple-500',
                       'bg-gradient-to-r from-teal-500 to-cyan-500'][previousContractors.indexOf(contractor) % 6]
                    }`}>
                      <span className="text-white font-bold text-sm">
                        {(contractor.firstName?.[0] || '').toUpperCase()}{(contractor.lastName?.[0] || '').toUpperCase()}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <h3 className="font-semibold text-fixed text-sm truncate">
                          {contractor.firstName} {contractor.lastName}
                        </h3>
                        <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium flex-shrink-0 ${
                          contractor.isCheckedIn ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                        }`}>
                          {contractor.isCheckedIn ? 'Checked In' : 'Available'}
                        </span>
                      </div>
                      <p className="text-variable text-xs truncate flex items-center gap-1">
                        <Building2 className="h-3 w-3 flex-shrink-0" />
                        {contractor.companyName}
                      </p>
                      <p className="text-variable text-xs">
                        Last visit: {contractor.updatedAt ? new Date(contractor.updatedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Unknown'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap mb-2">
                    {contractor.rightToWork === 'valid' ? (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-green-100 text-green-800">
                        <CheckCircle className="h-3 w-3 mr-0.5" />
                        Work Auth
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-red-100 text-red-800">
                        <AlertTriangle className="h-3 w-3 mr-0.5" />
                        Work Auth
                      </span>
                    )}
                    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${getSafetyRatingColor(contractor.safetyRating)}`}>
                      {contractor.safetyRating}
                    </span>
                    {(contractor as any).hasRedCard && (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-red-200 text-red-900">Red Card</span>
                    )}
                    {(contractor as any).hasYellowCard && (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-yellow-200 text-yellow-900">Yellow Card</span>
                    )}
                    {(!(contractor as any).hasRedCard && !(contractor as any).hasYellowCard) && (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-green-200 text-green-900">Clear</span>
                    )}
                    {(contractor as any).zoneId && (() => {
                      const zone = zones.find((z: any) => z.id === (contractor as any).zoneId);
                      return zone ? (
                        <span className="inline-flex items-center gap-1 text-xs">
                          <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: zone.color }} />
                          {zone.name}
                        </span>
                      ) : null;
                    })()}
                    {contractor.isCheckedIn && contractor.checkedInAt && (
                      <span className="text-[10px] text-variable flex items-center ml-auto">
                        <Clock className="h-3 w-3 mr-0.5" />
                        {new Date(contractor.checkedInAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center justify-between pt-2 border-t border-gray-200/50">
                    <div className="flex items-center gap-1.5">
                      <Button 
                        size="sm" 
                        variant="ghost" 
                        className="h-8 w-8 p-0"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedWorkerForEdit(contractor);
                          setSelectedWorkerCompanyName(contractor.companyName);
                          setShowContractorEditModal(true);
                        }}
                        data-testid={`button-edit-worker-${contractor.id}`}
                        title="Edit contractor"
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button 
                        size="sm" 
                        variant="ghost" 
                        className="h-8 w-8 p-0 text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50"
                        onClick={(e) => {
                          e.stopPropagation();
                          sendInductionMutation.mutate(contractor.id);
                        }}
                        disabled={sendInductionMutation.isPending}
                        title="Send Site Induction Email"
                        data-testid={`button-send-induction-${contractor.id}`}
                      >
                        <Mail className="h-4 w-4" />
                      </Button>
                      {contractor.isCheckedIn && (
                        <Button 
                          size="sm" 
                          variant="ghost" 
                          className="h-8 w-8 p-0"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedWorker(contractor);
                            setSelectedCompanyName(contractor.companyName);
                            setShowPassPreview(true);
                          }}
                          title="Print Pass"
                          data-testid={`button-print-pass-${contractor.id}`}
                        >
                          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                          </svg>
                        </Button>
                      )}
                      {(() => {
                        const isBanned = contractor.currentCardStatus === 'red' && contractor.redCardBanUntil && new Date(contractor.redCardBanUntil) > new Date();
                        const isClear = !isBanned && contractor.isActive && (!contractor.currentCardStatus || contractor.currentCardStatus === 'clear' || contractor.currentCardStatus === 'yellow');
                        return isClear ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-8 w-8 p-0 text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50"
                            onClick={(e) => {
                              e.stopPropagation();
                              setPreBookingWorker(contractor);
                              setPreBookCompanyName(contractor.companyName);
                            }}
                            title="Pre-Book Worker"
                            data-testid={`button-prebook-${contractor.id}`}
                          >
                            <CalendarPlus className="h-4 w-4" />
                          </Button>
                        ) : null;
                      })()}
                    </div>
                    {!contractor.isCheckedIn ? (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={(e) => {
                          e.stopPropagation();
                          setWorkerForCheckIn(contractor);
                          setCompanyForCheckIn(contractor.companyName);
                          setShowHSModal(true);
                        }}
                        disabled={checkInMutation.isPending}
                        className="h-9 px-3 text-sm font-medium text-green-600 hover:text-green-700 border-green-300 hover:border-green-400 hover:bg-green-50"
                        data-testid={`button-checkin-${contractor.id}`}
                      >
                        <LogIn className="mr-1.5 h-4 w-4" />
                        Check In
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={(e) => {
                          e.stopPropagation();
                          checkOutMutation.mutate(contractor.id);
                        }}
                        disabled={checkOutMutation.isPending}
                        className="h-9 px-3 text-sm font-medium text-red-600 hover:text-red-700 border-red-300 hover:border-red-400 hover:bg-red-50"
                        data-testid={`button-checkout-${contractor.id}`}
                      >
                        <LogOut className="mr-1.5 h-4 w-4" />
                        Check Out
                      </Button>
                    )}
                  </div>
                </GlassCard>
                ) : (
                <GlassCard key={contractor.id} className="p-3 hover:shadow-md transition-shadow">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-4 flex-1 min-w-0">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-semibold text-fixed">{contractor.firstName} {contractor.lastName}</h3>
                          <span className="text-sm text-variable flex items-center gap-1">
                            <Building2 className="h-3 w-3" />
                            {contractor.companyName}
                          </span>
                          <Badge 
                            className={`text-xs ${contractor.isCheckedIn ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-800"}`}
                          >
                            {contractor.isCheckedIn ? "Checked In" : "Available"}
                          </Badge>
                          {contractor.rightToWork === 'valid' ? (
                            <Badge className="text-xs bg-green-100 text-green-800">Work Auth</Badge>
                          ) : (
                            <Badge className="text-xs bg-red-100 text-red-800">Work Auth</Badge>
                          )}
                          <Badge className={`text-xs ${getSafetyRatingColor(contractor.safetyRating)}`}>
                            {contractor.safetyRating}
                          </Badge>
                          {(contractor as any).hasRedCard && <Badge className="text-xs bg-red-200 text-red-900">Red Card</Badge>}
                          {(contractor as any).hasYellowCard && <Badge className="text-xs bg-yellow-200 text-yellow-900">Yellow Card</Badge>}
                          {(!(contractor as any).hasRedCard && !(contractor as any).hasYellowCard) && <Badge className="text-xs bg-green-200 text-green-900">Clear</Badge>}
                          {(contractor as any).zoneId && (() => {
                            const zone = zones.find((z: any) => z.id === (contractor as any).zoneId);
                            return zone ? (
                              <span className="inline-flex items-center gap-1 text-xs">
                                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: zone.color }} />
                                {zone.name}
                              </span>
                            ) : null;
                          })()}
                        </div>
                        <div className="flex items-center gap-3 text-xs text-variable mt-1">
                          <span>Last visit: {contractor.updatedAt ? new Date(contractor.updatedAt).toLocaleDateString() : 'Unknown'}</span>
                          {contractor.isCheckedIn && contractor.checkedInAt && (
                            <span className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {new Date(contractor.checkedInAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <Button 
                        size="sm" 
                        variant="outline" 
                        className="p-2"
                        onClick={() => {
                          setSelectedWorkerForEdit(contractor);
                          setSelectedWorkerCompanyName(contractor.companyName);
                          setShowContractorEditModal(true);
                        }}
                        title="Edit contractor"
                      >
                        <Edit className="h-3.5 w-3.5" />
                      </Button>
                      <Button 
                        size="sm" 
                        variant="outline" 
                        className="p-2"
                        onClick={() => sendInductionMutation.mutate(contractor.id)}
                        disabled={sendInductionMutation.isPending}
                        title="Send Site Induction Email"
                      >
                        <Mail className="h-3.5 w-3.5" />
                      </Button>
                      {contractor.isCheckedIn && (
                        <Button 
                          size="sm" 
                          variant="outline" 
                          className="p-2"
                          onClick={() => {
                            setSelectedWorker(contractor);
                            setSelectedCompanyName(contractor.companyName);
                            setShowPassPreview(true);
                          }}
                          title="Print Pass"
                        >
                          <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                          </svg>
                        </Button>
                      )}
                      {(() => {
                        const isBanned = contractor.currentCardStatus === 'red' && contractor.redCardBanUntil && new Date(contractor.redCardBanUntil) > new Date();
                        const isClear = !isBanned && contractor.isActive && (!contractor.currentCardStatus || contractor.currentCardStatus === 'clear' || contractor.currentCardStatus === 'yellow');
                        return isClear ? (
                          <Button
                            size="sm"
                            variant="outline"
                            className="p-2 text-indigo-600 hover:text-indigo-700 border-indigo-300 hover:border-indigo-400 hover:bg-indigo-50"
                            onClick={() => {
                              setPreBookingWorker(contractor);
                              setPreBookCompanyName(contractor.companyName);
                            }}
                            title="Pre-Book Worker"
                          >
                            <CalendarPlus className="h-3.5 w-3.5" />
                          </Button>
                        ) : null;
                      })()}
                      {!contractor.isCheckedIn ? (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setWorkerForCheckIn(contractor);
                            setCompanyForCheckIn(contractor.companyName);
                            setShowHSModal(true);
                          }}
                          disabled={checkInMutation.isPending}
                          className="text-green-600 hover:text-green-700 border-green-300 hover:border-green-400 hover:bg-green-50"
                        >
                          <LogIn className="mr-1 h-4 w-4" />
                          Check In
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => checkOutMutation.mutate(contractor.id)}
                          disabled={checkOutMutation.isPending}
                          className="text-red-600 hover:text-red-700 border-red-300 hover:border-red-400 hover:bg-red-50"
                        >
                          <LogOut className="mr-1 h-4 w-4" />
                          Check Out
                        </Button>
                      )}
                    </div>
                  </div>
                </GlassCard>
                )
              ))}
            </div>

            {previousContractors.length === 0 && (
              <div className="text-center py-8 text-slate-500">
                {searchTerm ? `No contractors found matching "${searchTerm}"` : "No previous contractors found"}
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === "walkin" && (
        <GlassCard className="p-6">
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <UserPlus className="h-5 w-5 text-green-600" />
              <h2 className="text-xl font-semibold text-slate-800">Walk-in Registration</h2>
              <span className="text-sm text-slate-500">
                Register new contractor with document upload for clearance
              </span>
            </div>
            
            <div className="text-center py-8">
              <p className="text-slate-600 mb-4">Register a new contractor who is visiting for the first time</p>
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
        <GlassCard className="p-6">
          <div className="space-y-4">
            {/* Section Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Building2 className="h-5 w-5 text-purple-600" />
                <h2 className="text-xl font-semibold text-slate-800">Contractor Companies</h2>
                <span className="text-sm text-slate-500">
                  Manage all contractor companies and their details
                </span>
              </div>
              <Button
                onClick={() => setShowAddContractorDialog(true)}
                className="bg-blue-600 hover:bg-blue-700 text-white"
                data-testid="button-add-contractor"
              >
                <Plus className="mr-2 h-4 w-4" />
                Add Contractor
              </Button>
            </div>

            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-3 h-5 w-5 text-slate-400" />
              <Input
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search by company name, industry, phone, or email..."
                className="pl-10"
                data-testid="input-search-companies"
              />
            </div>

            {/* Show All Button & View Toggle */}
            <div className="flex justify-between items-center">
              <div className="text-sm text-slate-600">
                Showing {showAllCompanies ? companies.filter(company => 
                  matchesSearch(company, searchTerm)
                ).length : Math.min(6, companies.filter(company => 
                  matchesSearch(company, searchTerm)
                ).length)} of {companies.filter(company => 
                  matchesSearch(company, searchTerm)
                ).length} contractor companies
                {searchTerm && ` matching "${searchTerm}"`}
              </div>
              <div className="flex items-center gap-2">
                <div className="flex border rounded-lg overflow-hidden">
                  <Button
                    size="sm"
                    variant={companyViewMode === 'grid' ? 'default' : 'outline'}
                    className="rounded-none border-0 px-2"
                    onClick={() => setCompanyViewMode('grid')}
                    title="Grid view"
                  >
                    <LayoutGrid size={14} />
                  </Button>
                  <Button
                    size="sm"
                    variant={companyViewMode === 'list' ? 'default' : 'outline'}
                    className="rounded-none border-0 px-2"
                    onClick={() => setCompanyViewMode('list')}
                    title="List view"
                  >
                    <List size={14} />
                  </Button>
                </div>
                <Button 
                  variant="outline" 
                  className="text-purple-600 border-purple-600 hover:bg-purple-50"
                  onClick={() => setShowAllCompanies(!showAllCompanies)}
                >
                  {showAllCompanies ? 'Show Less' : `Show All ${companies.length} Contractor Companies`}
                </Button>
              </div>
            </div>

            {/* Companies Grid/List */}
            <div className={companyViewMode === 'grid' ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4" : "space-y-2"}>
              {companies.filter(company => 
                matchesSearch(company, searchTerm)
              ).slice(0, showAllCompanies ? companies.length : 6).map((company) => (
                companyViewMode === 'grid' ? (
                <GlassCard key={company.id} className="p-4 hover:shadow-md transition-shadow">
                  <div className="space-y-3">
                    <div>
                      <h3 className="font-semibold text-slate-800">
                        {company.name}
                      </h3>
                      <p className="text-sm text-slate-600">{company.contactEmail || company.email}</p>
                      <p className="text-sm text-slate-600">{(company as any).contactPhone || company.phone || 'No phone provided'}</p>
                      {company.industry && (
                        <p className="text-sm text-blue-600 font-medium capitalize">
                          {company.industry}
                        </p>
                      )}
                      <p className="text-xs text-slate-500">
                        Workers: {company.workersCount || 0}
                      </p>
                    </div>

                    <div className="flex flex-wrap gap-1">
                      <Badge 
                        className={company.status === 'approved' ? "bg-green-100 text-green-800" : "bg-yellow-100 text-yellow-800"}
                      >
                        {company.status || 'pending'}
                      </Badge>
                      
                      <Badge className={getSafetyRatingColor(company.complianceScore || 'N/A')}>
                        {company.complianceScore || 'N/A'}
                      </Badge>
                      
                      <Badge className="bg-blue-100 text-blue-800">
                        {company.serviceType || company.industry || 'General'}
                      </Badge>
                    </div>

                    <div className="space-y-2">
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          onClick={() => handleViewContractorDetails(company.id)}
                          className="flex-1 bg-blue-600 hover:bg-blue-700 text-white"
                          data-testid={`button-workers-${company.id}`}
                        >
                          <Users className="h-3 w-3 mr-1" />
                          Workers
                        </Button>
                        
                        <Button
                          size="sm"
                          variant="outline"
                          className="flex-1 text-green-600 border-green-600 hover:bg-green-50"
                          onClick={() => {
                            setSelectedContractor(company);
                            setWorkerForm({ ...workerForm, companyId: company.id });
                            setShowAddWorkerDialog(true);
                          }}
                          data-testid={`button-add-worker-${company.id}`}
                        >
                          <UserPlus className="h-3 w-3 mr-1" />
                          Add Worker
                        </Button>
                      </div>
                      
                      <div className="flex gap-2">
                        <Button 
                          size="sm" 
                          variant="outline" 
                          className="flex-1 text-blue-600 hover:bg-blue-50"
                          onClick={() => handleEditContractor(company.id)}
                          data-testid={`button-edit-company-${company.id}`}
                        >
                          <Edit className="h-3 w-3 mr-1" />
                          Edit
                        </Button>
                        
                        <Button 
                          size="sm" 
                          variant="outline" 
                          className="flex-1 text-red-600 hover:bg-red-50"
                          onClick={() => handleDeleteContractor(company.id, company.name)}
                          disabled={deleteContractorMutation.isPending}
                          data-testid={`button-delete-company-${company.id}`}
                        >
                          <Trash2 className="h-3 w-3 mr-1" />
                          Delete
                        </Button>
                      </div>
                    </div>
                  </div>
                </GlassCard>
                ) : (
                <GlassCard key={company.id} className="p-3 hover:shadow-md transition-shadow">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-4 flex-1 min-w-0">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold text-slate-800 truncate">{company.name}</h3>
                          <Badge 
                            className={`text-xs ${company.status === 'approved' ? "bg-green-100 text-green-800" : "bg-yellow-100 text-yellow-800"}`}
                          >
                            {company.status || 'pending'}
                          </Badge>
                          <Badge className={`text-xs ${getSafetyRatingColor(company.complianceScore || 'N/A')}`}>
                            {company.complianceScore || 'N/A'}
                          </Badge>
                          {company.industry && (
                            <Badge className="text-xs bg-blue-100 text-blue-800 capitalize">
                              {company.serviceType || company.industry}
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-4 text-sm text-slate-600 mt-1">
                          <span>{company.contactEmail || company.email}</span>
                          <span>{(company as any).contactPhone || company.phone || 'No phone'}</span>
                          <span className="text-xs text-slate-500">Workers: {company.workersCount || 0}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <Button
                        size="sm"
                        onClick={() => handleViewContractorDetails(company.id)}
                        className="bg-blue-600 hover:bg-blue-700 text-white"
                      >
                        <Users className="h-3 w-3 mr-1" />
                        Workers
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-green-600 border-green-600 hover:bg-green-50"
                        onClick={() => {
                          setSelectedContractor(company);
                          setWorkerForm({ ...workerForm, companyId: company.id });
                          setShowAddWorkerDialog(true);
                        }}
                      >
                        <UserPlus className="h-3 w-3 mr-1" />
                        Add Worker
                      </Button>
                      <Button 
                        size="sm" 
                        variant="outline" 
                        className="text-blue-600 hover:bg-blue-50"
                        onClick={() => handleEditContractor(company.id)}
                      >
                        <Edit className="h-3 w-3 mr-1" />
                        Edit
                      </Button>
                      <Button 
                        size="sm" 
                        variant="outline" 
                        className="text-red-600 hover:bg-red-50"
                        onClick={() => handleDeleteContractor(company.id, company.name)}
                        disabled={deleteContractorMutation.isPending}
                      >
                        <Trash2 className="h-3 w-3 mr-1" />
                        Delete
                      </Button>
                    </div>
                  </div>
                </GlassCard>
                )
              ))}
            </div>

            {companies.filter(company => 
              matchesSearch(company, searchTerm)
            ).length === 0 && (
              <div className="text-center py-8 text-slate-500">
                {searchTerm ? `No contractor companies found matching "${searchTerm}"` : "No contractor companies found"}
              </div>
            )}
          </div>
        </GlassCard>
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
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Edit className="h-5 w-5" />
              Edit Contractor Company
            </DialogTitle>
            <DialogDescription>
              Update contractor company details and service information.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">Company Name *</label>
              <Input
                value={contractorForm.name}
                onChange={(e) => setContractorForm({ ...contractorForm, name: e.target.value })}
                placeholder=""
                data-testid="input-edit-company-name"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">Contact First Name *</label>
              <Input
                value={contractorForm.contactFirstName}
                onChange={(e) => setContractorForm({ ...contractorForm, contactFirstName: e.target.value })}
                placeholder=""
                data-testid="input-edit-contact-first-name"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">Contact Last Name *</label>
              <Input
                value={contractorForm.contactLastName}
                onChange={(e) => setContractorForm({ ...contractorForm, contactLastName: e.target.value })}
                placeholder=""
                data-testid="input-edit-contact-last-name"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">Email Address *</label>
              <Input
                type="email"
                value={contractorForm.email}
                onChange={(e) => setContractorForm({ ...contractorForm, email: e.target.value })}
                placeholder=""
                data-testid="input-edit-email"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">Phone Number *</label>
              <Input
                type="tel"
                value={contractorForm.phone}
                onChange={(e) => setContractorForm({ ...contractorForm, phone: e.target.value })}
                placeholder=""
                data-testid="input-edit-phone"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">Postcode</label>
              <Input
                value={contractorForm.postcode}
                onChange={(e) => setContractorForm({ ...contractorForm, postcode: e.target.value })}
                placeholder=""
                data-testid="input-edit-postcode"
              />
            </div>
            <div className="col-span-2 space-y-2">
              <label className="text-sm font-medium text-slate-700">Address *</label>
              <Textarea
                value={contractorForm.address}
                onChange={(e) => setContractorForm({ ...contractorForm, address: e.target.value })}
                placeholder=""
                data-testid="input-edit-address"
                rows={2}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">Website</label>
              <Input
                value={contractorForm.website}
                onChange={(e) => setContractorForm({ ...contractorForm, website: e.target.value })}
                placeholder=""
                data-testid="input-edit-website"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">Industry</label>
              <Select
                value={contractorForm.industry}
                onValueChange={(value: string) => 
                  setContractorForm({ ...contractorForm, industry: value })
                }
              >
                <SelectTrigger data-testid="select-edit-industry">
                  <SelectValue placeholder="Select industry" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="construction">Construction</SelectItem>
                  <SelectItem value="electrical">Electrical</SelectItem>
                  <SelectItem value="plumbing">Plumbing</SelectItem>
                  <SelectItem value="hvac">HVAC</SelectItem>
                  <SelectItem value="roofing">Roofing</SelectItem>
                  <SelectItem value="painting">Painting</SelectItem>
                  <SelectItem value="landscaping">Landscaping</SelectItem>
                  <SelectItem value="security">Security</SelectItem>
                  <SelectItem value="cleaning">Cleaning</SelectItem>
                  <SelectItem value="it">IT Services</SelectItem>
                  <SelectItem value="catering">Catering</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2 space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-slate-700">Description</label>
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
              <label className="text-sm font-medium text-slate-700">Status</label>
              <Select
                value={contractorForm.status}
                onValueChange={(value: "pending" | "approved" | "suspended") => 
                  setContractorForm({ ...contractorForm, status: value })
                }
              >
                <SelectTrigger data-testid="select-edit-status">
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">Pending Review</SelectItem>
                  <SelectItem value="approved">Approved</SelectItem>
                  <SelectItem value="suspended">Suspended</SelectItem>
                </SelectContent>
              </Select>
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
                  console.log('🔍 Updating contractor with form data:', contractorForm);
                  updateContractorMutation.mutate({
                    id: selectedContractor.id,
                    data: contractorForm
                  });
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
      
      {/* Add Contractor Dialog */}
      <Dialog open={showAddContractorDialog} onOpenChange={setShowAddContractorDialog}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              Add New Contractor Company
            </DialogTitle>
            <DialogDescription>
              Add a new contractor company to the system with contact details and service information.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">Company Name *</label>
              <Input
                value={contractorForm.name}
                onChange={(e) => setContractorForm({ ...contractorForm, name: e.target.value })}
                placeholder=""
                data-testid="input-company-name"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">Contact First Name *</label>
              <Input
                value={contractorForm.contactFirstName}
                onChange={(e) => setContractorForm({ ...contractorForm, contactFirstName: e.target.value })}
                placeholder=""
                data-testid="input-contact-first-name"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">Contact Last Name *</label>
              <Input
                value={contractorForm.contactLastName}
                onChange={(e) => setContractorForm({ ...contractorForm, contactLastName: e.target.value })}
                placeholder=""
                data-testid="input-contact-last-name"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">Email Address *</label>
              <Input
                type="email"
                value={contractorForm.email}
                onChange={(e) => setContractorForm({ ...contractorForm, email: e.target.value })}
                placeholder=""
                data-testid="input-email"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">Phone Number *</label>
              <Input
                type="tel"
                value={contractorForm.phone}
                onChange={(e) => setContractorForm({ ...contractorForm, phone: e.target.value })}
                placeholder=""
                data-testid="input-phone"
              />
            </div>
            <div className="col-span-2 space-y-2">
              <label className="text-sm font-medium text-slate-700">Address *</label>
              <Textarea
                value={contractorForm.address}
                onChange={(e) => setContractorForm({ ...contractorForm, address: e.target.value })}
                placeholder=""
                data-testid="input-address"
                rows={2}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">Postcode</label>
              <Input
                value={contractorForm.postcode}
                onChange={(e) => setContractorForm({ ...contractorForm, postcode: e.target.value })}
                placeholder=""
                data-testid="input-postcode"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">Website</label>
              <Input
                value={contractorForm.website}
                onChange={(e) => setContractorForm({ ...contractorForm, website: e.target.value })}
                placeholder=""
                data-testid="input-website"
              />
            </div>
            <div className="col-span-2 space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-slate-700">Description</label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleGenerateDescription}
                  disabled={isGeneratingDescription || !contractorForm.website || !contractorForm.name}
                  className="text-xs"
                  data-testid="button-generate-description"
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
                data-testid="input-description"
                rows={2}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">Industry</label>
              <Select
                value={contractorForm.industry}
                onValueChange={(value: string) => 
                  setContractorForm({ ...contractorForm, industry: value })
                }
              >
                <SelectTrigger data-testid="select-industry">
                  <SelectValue placeholder="Select industry" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="construction">Construction</SelectItem>
                  <SelectItem value="electrical">Electrical</SelectItem>
                  <SelectItem value="plumbing">Plumbing</SelectItem>
                  <SelectItem value="hvac">HVAC</SelectItem>
                  <SelectItem value="roofing">Roofing</SelectItem>
                  <SelectItem value="painting">Painting</SelectItem>
                  <SelectItem value="landscaping">Landscaping</SelectItem>
                  <SelectItem value="security">Security</SelectItem>
                  <SelectItem value="cleaning">Cleaning</SelectItem>
                  <SelectItem value="it">IT Services</SelectItem>
                  <SelectItem value="catering">Catering</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">Status</label>
              <Select
                value={contractorForm.status}
                onValueChange={(value: "pending" | "approved" | "suspended") => 
                  setContractorForm({ ...contractorForm, status: value })
                }
              >
                <SelectTrigger data-testid="select-status">
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">Pending Review</SelectItem>
                  <SelectItem value="approved">Approved</SelectItem>
                  <SelectItem value="suspended">Suspended</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => setShowAddContractorDialog(false)}
              data-testid="button-cancel-add"
            >
              Cancel
            </Button>
            <Button 
              onClick={handleAddContractor}
              disabled={!contractorForm.name || !contractorForm.email || !contractorForm.contactFirstName || !contractorForm.contactLastName || !contractorForm.phone || !contractorForm.address || createContractorMutation.isPending}
              className="bg-blue-600 hover:bg-blue-700"
              data-testid="button-save-contractor"
            >
              {createContractorMutation.isPending ? "Adding..." : "Add Contractor"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* Add Worker Dialog */}
      <Dialog open={showAddWorkerDialog} onOpenChange={setShowAddWorkerDialog}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <User className="h-5 w-5" />
              Add New Worker to {selectedContractor?.name}
            </DialogTitle>
            <DialogDescription>
              Add a new worker to this contractor company with their personal details and certifications.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">First Name *</label>
              <Input
                value={workerForm.firstName}
                onChange={(e) => setWorkerForm({ ...workerForm, firstName: e.target.value })}
                placeholder=""
                data-testid="input-worker-firstname"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">Last Name *</label>
              <Input
                value={workerForm.lastName}
                onChange={(e) => setWorkerForm({ ...workerForm, lastName: e.target.value })}
                placeholder=""
                data-testid="input-worker-lastname"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">Email Address</label>
              <Input
                type="email"
                value={workerForm.email}
                onChange={(e) => setWorkerForm({ ...workerForm, email: e.target.value })}
                placeholder=""
                data-testid="input-worker-email"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">Phone Number</label>
              <Input
                type="tel"
                value={workerForm.phone}
                onChange={(e) => setWorkerForm({ ...workerForm, phone: e.target.value })}
                placeholder=""
                data-testid="input-worker-phone"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">Home Postcode *</label>
              <Input
                value={workerForm.postcode}
                onChange={(e) => setWorkerForm({ ...workerForm, postcode: e.target.value })}
                placeholder=""
                data-testid="input-worker-postcode"
              />
              <p className="text-xs text-slate-500">Required for CO2 emissions calculations</p>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">Right to Work Status</label>
              <Select
                value={workerForm.rightToWork}
                onValueChange={(value: "valid" | "expired" | "pending") => setWorkerForm({ ...workerForm, rightToWork: value })}
              >
                <SelectTrigger data-testid="select-right-to-work">
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="valid">Valid</SelectItem>
                  <SelectItem value="pending">Pending Verification</SelectItem>
                  <SelectItem value="expired">Expired</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">CSCS Card Number</label>
              <Input
                value={workerForm.cscsCard}
                onChange={(e) => setWorkerForm({ ...workerForm, cscsCard: e.target.value })}
                placeholder=""
                data-testid="input-cscs-card"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">CSCS Status</label>
              <Select
                value={workerForm.cscsStatus}
                onValueChange={(value: "valid" | "expired" | "pending") => 
                  setWorkerForm({ ...workerForm, cscsStatus: value })
                }
              >
                <SelectTrigger data-testid="select-cscs-status">
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="valid">Valid</SelectItem>
                  <SelectItem value="expired">Expired</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">IPAF Status</label>
              <Select
                value={workerForm.ipafStatus}
                onValueChange={(value: "none" | "3a" | "3b" | "1+" | "expired") => 
                  setWorkerForm({ ...workerForm, ipafStatus: value })
                }
              >
                <SelectTrigger data-testid="select-ipaf-status">
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  <SelectItem value="3a">3a - Mobile Vertical</SelectItem>
                  <SelectItem value="3b">3b - Mobile Boom</SelectItem>
                  <SelectItem value="1+">1+ - Static Vertical</SelectItem>
                  <SelectItem value="expired">Expired</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2">
              <h3 className="text-sm font-semibold text-slate-700 mb-3">Safety Training & Certifications</h3>
              <div className="grid grid-cols-2 gap-4">
                <label className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    checked={workerForm.asbestosAwareness}
                    onChange={(e) => setWorkerForm({ ...workerForm, asbestosAwareness: e.target.checked })}
                    className="rounded border-gray-300"
                    data-testid="checkbox-asbestos"
                  />
                  <span className="text-sm text-slate-700">Asbestos Awareness</span>
                </label>
                <label className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    checked={workerForm.manualHandling}
                    onChange={(e) => setWorkerForm({ ...workerForm, manualHandling: e.target.checked })}
                    className="rounded border-gray-300"
                    data-testid="checkbox-manual-handling"
                  />
                  <span className="text-sm text-slate-700">Manual Handling</span>
                </label>
                <label className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    checked={workerForm.workingAtHeight}
                    onChange={(e) => setWorkerForm({ ...workerForm, workingAtHeight: e.target.checked })}
                    className="rounded border-gray-300"
                    data-testid="checkbox-working-height"
                  />
                  <span className="text-sm text-slate-700">Working at Height</span>
                </label>
                <label className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    checked={workerForm.inductionCompleted}
                    onChange={(e) => setWorkerForm({ ...workerForm, inductionCompleted: e.target.checked })}
                    className="rounded border-gray-300"
                    data-testid="checkbox-induction"
                  />
                  <span className="text-sm text-slate-700">Site Induction Completed</span>
                </label>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => setShowAddWorkerDialog(false)}
              data-testid="button-cancel-add-worker"
            >
              Cancel
            </Button>
            <Button 
              onClick={handleAddWorker}
              disabled={!workerForm.firstName || !workerForm.lastName || createWorkerMutation.isPending}
              className="bg-blue-600 hover:bg-blue-700"
              data-testid="button-save-worker"
            >
              {createWorkerMutation.isPending ? "Adding..." : "Add Worker"}
            </Button>
          </DialogFooter>
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
            // Handle navigation from H&S statistics panels
            switch (target) {
              case 'contractors':
                setActiveTab('contractors');
                break;
              case 'previous':
                setActiveTab('previous');
                break;
              case 'templates':
                // For now, stay on assign-hs tab as there's no separate templates tab
                // Could be extended in the future
                toast({
                  title: "Document Templates",
                  description: "Use the assignment dialog to view and manage document templates",
                });
                break;
              case 'assignments':
                // Stay on current tab but show info
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
        <DialogContent className="sm:max-w-md">
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

            <div className="grid grid-cols-2 gap-4">
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
                <Select value={preBookDuration} onValueChange={setPreBookDuration}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="2">2 hours</SelectItem>
                    <SelectItem value="4">4 hours (Half day)</SelectItem>
                    <SelectItem value="8">8 hours (Full day)</SelectItem>
                    <SelectItem value="10">10 hours</SelectItem>
                    <SelectItem value="12">12 hours</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Purpose</Label>
              <Select value={preBookPurpose} onValueChange={setPreBookPurpose}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Site work">Site Work</SelectItem>
                  <SelectItem value="Maintenance">Maintenance</SelectItem>
                  <SelectItem value="Installation">Installation</SelectItem>
                  <SelectItem value="Inspection">Inspection</SelectItem>
                  <SelectItem value="Repair">Repair</SelectItem>
                  <SelectItem value="Survey">Survey</SelectItem>
                  <SelectItem value="Other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Host Staff Member *</Label>
              <Select value={preBookHost} onValueChange={setPreBookHost}>
                <SelectTrigger>
                  <SelectValue placeholder="Select host staff member" />
                </SelectTrigger>
                <SelectContent>
                  {staffList.filter((s: any) => s.isActive !== false).map((staff: any) => (
                    <SelectItem key={staff.id} value={staff.id}>
                      {staff.firstName} {staff.lastName}{staff.department ? ` - ${staff.department}` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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

      {/* Host Selection Dialog for Contractor Check-in */}
      <Dialog open={showCheckInHostDialog} onOpenChange={(open) => { if (!open) { setShowCheckInHostDialog(false); setSelectedCheckInHost(''); setCheckInWorkerId(null); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Select Host for {checkInWorkerName}</DialogTitle>
            <DialogDescription>Who is {checkInWorkerName} visiting today?</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Host Staff Member *</Label>
              <Select value={selectedCheckInHost} onValueChange={setSelectedCheckInHost}>
                <SelectTrigger>
                  <SelectValue placeholder="Select host staff member" />
                </SelectTrigger>
                <SelectContent>
                  {staffList.filter((s: any) => s.isActive !== false).map((staff: any) => (
                    <SelectItem key={staff.id} value={staff.id}>
                      {staff.firstName} {staff.lastName}{staff.department ? ` - ${staff.department}` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
    </div>
  );
}