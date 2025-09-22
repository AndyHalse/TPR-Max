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
import EditContractorWorkerModal from "@/components/EditContractorWorkerModal";
import { ContractorEditModal } from "@/components/ContractorEditModal";
import ContractorPreBooking from "@/components/ContractorPreBooking";
import ContractorHSModal from "@/components/ContractorHSModal";
import { CO2SustainabilityReports } from "@/components/CO2SustainabilityReports";
import HSDocumentAssignment from "@/components/HSDocumentAssignment";
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
  Shield
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
  const [showPassPreview, setShowPassPreview] = useState(false);
  const [selectedWorker, setSelectedWorker] = useState<ContractorWorker | null>(null);
  const [selectedCompanyName, setSelectedCompanyName] = useState<string>("");
  const [showEditWorkerModal, setShowEditWorkerModal] = useState(false);
  const [workerToEdit, setWorkerToEdit] = useState<ContractorWorker | null>(null);
  const [showAddContractorDialog, setShowAddContractorDialog] = useState(false);
  const [showContractorEditModal, setShowContractorEditModal] = useState(false);
  const [selectedWorkerForEdit, setSelectedWorkerForEdit] = useState<ContractorWorker | null>(null);
  const [selectedWorkerCompanyName, setSelectedWorkerCompanyName] = useState<string>("");
  const [showAddWorkerDialog, setShowAddWorkerDialog] = useState(false);
  const [selectedContractor, setSelectedContractor] = useState<ContractorCompany | null>(null);
  const [showHSModal, setShowHSModal] = useState(false);
  const [workerForCheckIn, setWorkerForCheckIn] = useState<ContractorWorker | null>(null);
  const [companyForCheckIn, setCompanyForCheckIn] = useState<string>("");
  
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
      setShowContractorEditModal(false);
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
      // Map from API response field names (isolated schema) to form field names
      const splitName = contractorToEdit.primaryContactName?.split(' ') || [];
      const firstName = splitName[0] || contractorToEdit.contactFirstName || "";
      const lastName = splitName.slice(1).join(' ') || contractorToEdit.contactLastName || "";
      
      setContractorForm({
        name: contractorToEdit.companyName || contractorToEdit.name || "",
        email: contractorToEdit.contactEmail || contractorToEdit.email || "",
        contactFirstName: firstName,
        contactLastName: lastName,
        phone: contractorToEdit.contactPhone || contractorToEdit.phone || "",
        address: contractorToEdit.address || "",
        postcode: contractorToEdit.postcode || "",
        website: contractorToEdit.website || "",
        description: contractorToEdit.description || "",
        industry: contractorToEdit.industry || "",
        status: contractorToEdit.status || "pending"
      });
      
      console.log('🔍 Pre-filling form with contractor data:', {
        original: contractorToEdit,
        mapped: {
          name: contractorToEdit.companyName || contractorToEdit.name || "",
          email: contractorToEdit.contactEmail || contractorToEdit.email || "",
          phone: contractorToEdit.contactPhone || contractorToEdit.phone || "",
        }
      });
      setShowContractorEditModal(true);
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

  const handleEditWorker = (worker: ContractorWorker) => {
    setWorkerToEdit(worker);
    setShowEditWorkerModal(true);
  };

  const handleEditWorkerModalClose = () => {
    setShowEditWorkerModal(false);
    setWorkerToEdit(null);
  };

  const checkInMutation = useMutation({
    mutationFn: async (workerId: string) => {
      const response = await apiRequest("POST", `/api/contractors/workers/${workerId}/checkin`, {
        hsRulesAccepted: true,
        hsRulesAcceptedAt: new Date().toISOString(),
        purpose: "Work"
      });
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/contractors/workers/all", customerId] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] }); // Refresh dashboard stats
      
      // Find the company name for the worker
      const worker = data.worker;
      const company = companies.find(c => c.id === worker.companyId);
      
      // Set up for pass preview and printing
      setSelectedWorker(worker);
      setSelectedCompanyName(company?.name || "Unknown Company");
      setShowPassPreview(true);
      
      toast({
        title: "Success",
        description: "Contractor checked in successfully! Pass preview will open for printing.",
      });
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
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] }); // Refresh dashboard stats
      queryClient.invalidateQueries({ queryKey: ["/api/contractors", customerId] }); // Refresh contractor list
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
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <HardHat className="h-8 w-8 text-orange-600" />
          <h1 className="text-3xl font-bold text-slate-800">Contractor Management</h1>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="flex gap-4">
        <Button
          variant={activeTab === "previous" ? "default" : "outline"}
          onClick={() => setActiveTab("previous")}
          className="flex items-center gap-2"
          data-testid="tab-previous-contractors"
        >
          <History className="h-4 w-4" />
          Previous Contractors
        </Button>
        <Button
          variant={activeTab === "contractors" ? "default" : "outline"}
          onClick={() => setActiveTab("contractors")}
          className="flex items-center gap-2"
          data-testid="tab-contractors"
        >
          <Building2 className="h-4 w-4" />
          Contractors
        </Button>
        <Button
          variant={activeTab === "walkin" ? "default" : "outline"}
          onClick={() => setActiveTab("walkin")}
          className="flex items-center gap-2"
          data-testid="tab-walkin-registration"
        >
          <UserPlus className="h-4 w-4" />
          Walk-in Registration
        </Button>
        <Button
          variant={activeTab === "prebook" ? "default" : "outline"}
          onClick={() => setActiveTab("prebook")}
          className="flex items-center gap-2"
          data-testid="tab-pre-booking"
        >
          <CalendarPlus className="h-4 w-4" />
          Pre-booking
        </Button>
        
        <Button
          variant={activeTab === "co2" ? "default" : "outline"}
          onClick={() => setActiveTab("co2")}
          className="flex items-center gap-2"
          data-testid="tab-co2-reports"
        >
          <Leaf className="h-4 w-4" />
          CO2 Reports
        </Button>
        <Button
          variant={activeTab === "assign-hs" ? "default" : "outline"}
          onClick={() => setActiveTab("assign-hs")}
          className="flex items-center gap-2"
          data-testid="tab-assign-hs"
        >
          <Shield className="h-4 w-4" />
          Assign H&S Document
        </Button>
      </div>

      {/* Tab Content */}
      {activeTab === "previous" && (
        <GlassCard className="p-6">
          <div className="space-y-4">
            {/* Section Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <History className="h-5 w-5 text-slate-600" />
                <h2 className="text-xl font-semibold text-slate-800">Previous Contractors</h2>
                <span className="text-sm text-slate-500">
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

            {/* Show All Button */}
            <div className="flex justify-between items-center">
              <div className="text-sm text-slate-600">
                Showing {showAllWorkers ? previousContractors.length : Math.min(6, previousContractors.length)} of {previousContractors.length} contractors
                {searchTerm && ` matching "${searchTerm}"`}
              </div>
              <Button 
                variant="outline" 
                className="text-blue-600 border-blue-600 hover:bg-blue-50"
                onClick={() => setShowAllWorkers(!showAllWorkers)}
              >
                {showAllWorkers ? 'Show Less' : `Show All ${allWorkers.length} Current Workers`}
              </Button>
            </div>

            {/* Contractors Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {previousContractors.slice(0, showAllWorkers ? previousContractors.length : 6).map((contractor) => (
                <GlassCard 
                  key={contractor.id} 
                  className="p-4 hover:shadow-md transition-shadow"
                >
                  <div className="space-y-3">
                    {/* Contractor Info */}
                    <div>
                      <h3 className="font-semibold text-slate-800">
                        {contractor.firstName} {contractor.lastName}
                      </h3>
                      <p className="text-sm text-slate-600 flex items-center gap-1">
                        <Building2 className="h-3 w-3" />
                        {contractor.companyName}
                      </p>
                      <p className="text-xs text-slate-500">
                        Last visit: {contractor.updatedAt ? new Date(contractor.updatedAt).toLocaleDateString() : 'Unknown'}
                      </p>
                    </div>

                    {/* Status Badges */}
                    <div className="flex flex-wrap gap-1">
                      <Badge 
                        className={contractor.isCheckedIn ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-800"}
                      >
                        {contractor.isCheckedIn ? (
                          <>
                            <CheckCircle className="h-3 w-3 mr-1" />
                            Checked In
                          </>
                        ) : (
                          "Available"
                        )}
                      </Badge>
                      
                      {contractor.rightToWork === 'valid' ? (
                        <Badge className="bg-green-100 text-green-800">
                          <CheckCircle className="h-3 w-3 mr-1" />
                          Work Auth
                        </Badge>
                      ) : (
                        <Badge className="bg-red-100 text-red-800">
                          <AlertTriangle className="h-3 w-3 mr-1" />
                          Work Auth
                        </Badge>
                      )}

                      <Badge className={getSafetyRatingColor(contractor.safetyRating)}>
                        {contractor.safetyRating}
                      </Badge>
                      
                      {/* Card Status Badges */}
                      {(contractor as any).hasRedCard && (
                        <Badge className="bg-red-200 text-red-900">
                          Red Card
                        </Badge>
                      )}
                      {(contractor as any).hasYellowCard && (
                        <Badge className="bg-yellow-200 text-yellow-900">
                          Yellow Card
                        </Badge>
                      )}
                      {(!(contractor as any).hasRedCard && !(contractor as any).hasYellowCard) && (
                        <Badge className="bg-green-200 text-green-900">
                          Clear
                        </Badge>
                      )}
                    </div>

                    {/* Check-in Time */}
                    {contractor.isCheckedIn && contractor.checkedInAt && (
                      <div className="text-xs text-slate-600 flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {new Date(contractor.checkedInAt).toLocaleTimeString()}
                      </div>
                    )}

                    {/* Action Buttons */}
                    <div className="space-y-2">
                      {/* Primary Check In/Out Button */}
                      {!contractor.isCheckedIn ? (
                        <Button
                          onClick={(e) => {
                            e.stopPropagation();
                            setWorkerForCheckIn(contractor);
                            setCompanyForCheckIn(contractor.companyName);
                            setShowHSModal(true);
                          }}
                          disabled={checkInMutation.isPending}
                          className="w-full bg-green-600 hover:bg-green-700 text-white"
                          data-testid={`button-checkin-${contractor.id}`}
                        >
                          <LogIn className="mr-2 h-4 w-4" />
                          Check In
                        </Button>
                      ) : (
                        <Button
                          onClick={(e) => {
                            e.stopPropagation();
                            checkOutMutation.mutate(contractor.id);
                          }}
                          disabled={checkOutMutation.isPending}
                          className="w-full bg-red-600 hover:bg-red-700 text-white"
                          data-testid={`button-checkout-${contractor.id}`}
                        >
                          <LogOut className="mr-2 h-4 w-4" />
                          Check Out
                        </Button>
                      )}
                      
                      {/* Secondary Actions Row */}
                      <div className="flex gap-1">
                        <Button 
                          size="sm" 
                          variant="outline" 
                          className="flex-1 text-blue-600 hover:bg-blue-50"
                          onClick={(e) => {
                            e.stopPropagation();
                            setWorkerToEdit(contractor);
                            setShowEditWorkerModal(true); // Fixed: Opens worker edit modal and sets correct worker
                          }}
                          data-testid={`button-edit-worker-${contractor.id}`}
                        >
                          <Edit className="h-3 w-3 mr-1" />
                          Edit
                        </Button>
                        
                        <Button 
                          size="sm" 
                          variant="outline" 
                          className="text-orange-600 hover:bg-orange-50"
                          onClick={(e) => {
                            e.stopPropagation();
                            sendInductionMutation.mutate(contractor.id);
                          }}
                          disabled={sendInductionMutation.isPending}
                          title="Send Site Induction Email"
                          data-testid={`button-send-induction-${contractor.id}`}
                        >
                          <Mail className="h-3 w-3" />
                        </Button>
                        
                        {contractor.isCheckedIn && (
                          <Button 
                            size="sm" 
                            variant="outline" 
                            className="text-purple-600 hover:bg-purple-50"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedWorker(contractor);
                              setSelectedCompanyName(contractor.companyName);
                              setShowPassPreview(true);
                            }}
                            title="Print Pass"
                            data-testid={`button-print-pass-${contractor.id}`}
                          >
                            <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                            </svg>
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                </GlassCard>
              ))}
            </div>

            {previousContractors.length === 0 && (
              <div className="text-center py-8 text-slate-500">
                {searchTerm ? `No contractors found matching "${searchTerm}"` : "No previous contractors found"}
              </div>
            )}
          </div>
        </GlassCard>
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

            {/* Show All Button */}
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
              <Button 
                variant="outline" 
                className="text-purple-600 border-purple-600 hover:bg-purple-50"
                onClick={() => setShowAllCompanies(!showAllCompanies)}
              >
                {showAllCompanies ? 'Show Less' : `Show All ${companies.length} Contractor Companies`}
              </Button>
            </div>

            {/* Companies Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {companies.filter(company => 
                matchesSearch(company, searchTerm)
              ).slice(0, showAllCompanies ? companies.length : 6).map((company) => (
                <GlassCard key={company.id} className="p-4 hover:shadow-md transition-shadow">
                  <div className="space-y-3">
                    {/* Company Info */}
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

                    {/* Status Badges */}
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

                    {/* Action Buttons */}
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
              ))}
            </div>

            {companies.filter(company => 
              (company.name || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
              (company.contactEmail || "").toLowerCase().includes(searchTerm.toLowerCase())
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

      {/* Edit Contractor Worker Modal */}
      {workerToEdit && (
        <EditContractorWorkerModal
          isOpen={showEditWorkerModal}
          onClose={handleEditWorkerModalClose}
          worker={workerToEdit}
        />
      )}
      
      {/* Contractor Edit Modal with Check-in/out */}
      <ContractorEditModal
        worker={selectedWorkerForEdit}
        companyName={selectedWorkerCompanyName}
        open={false}
        onOpenChange={setShowContractorEditModal}
      />
      
      {/* Edit Contractor Dialog */}
      <Dialog open={showContractorEditModal} onOpenChange={setShowContractorEditModal}>
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
                placeholder="ABC Construction Ltd"
                data-testid="input-edit-company-name"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">Contact First Name *</label>
              <Input
                value={contractorForm.contactFirstName}
                onChange={(e) => setContractorForm({ ...contractorForm, contactFirstName: e.target.value })}
                placeholder="John"
                data-testid="input-edit-contact-first-name"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">Contact Last Name *</label>
              <Input
                value={contractorForm.contactLastName}
                onChange={(e) => setContractorForm({ ...contractorForm, contactLastName: e.target.value })}
                placeholder="Smith"
                data-testid="input-edit-contact-last-name"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">Email Address *</label>
              <Input
                type="email"
                value={contractorForm.email}
                onChange={(e) => setContractorForm({ ...contractorForm, email: e.target.value })}
                placeholder="admin@company.co.uk"
                data-testid="input-edit-email"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">Phone Number *</label>
              <Input
                type="tel"
                value={contractorForm.phone}
                onChange={(e) => setContractorForm({ ...contractorForm, phone: e.target.value })}
                placeholder="+44 1234 567890"
                data-testid="input-edit-phone"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">Postcode</label>
              <Input
                value={contractorForm.postcode}
                onChange={(e) => setContractorForm({ ...contractorForm, postcode: e.target.value })}
                placeholder="SW1A 1AA"
                data-testid="input-edit-postcode"
              />
            </div>
            <div className="col-span-2 space-y-2">
              <label className="text-sm font-medium text-slate-700">Address *</label>
              <Textarea
                value={contractorForm.address}
                onChange={(e) => setContractorForm({ ...contractorForm, address: e.target.value })}
                placeholder="123 Main Street, London, UK"
                data-testid="input-edit-address"
                rows={2}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">Website</label>
              <Input
                value={contractorForm.website}
                onChange={(e) => setContractorForm({ ...contractorForm, website: e.target.value })}
                placeholder="https://www.company.co.uk"
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
                placeholder="Brief description of company services and expertise..."
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
              onClick={() => setShowContractorEditModal(false)}
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
                placeholder="ABC Construction Ltd"
                data-testid="input-company-name"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">Contact First Name *</label>
              <Input
                value={contractorForm.contactFirstName}
                onChange={(e) => setContractorForm({ ...contractorForm, contactFirstName: e.target.value })}
                placeholder="John"
                data-testid="input-contact-first-name"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">Contact Last Name *</label>
              <Input
                value={contractorForm.contactLastName}
                onChange={(e) => setContractorForm({ ...contractorForm, contactLastName: e.target.value })}
                placeholder="Smith"
                data-testid="input-contact-last-name"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">Email Address *</label>
              <Input
                type="email"
                value={contractorForm.email}
                onChange={(e) => setContractorForm({ ...contractorForm, email: e.target.value })}
                placeholder="admin@company.co.uk"
                data-testid="input-email"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">Phone Number *</label>
              <Input
                type="tel"
                value={contractorForm.phone}
                onChange={(e) => setContractorForm({ ...contractorForm, phone: e.target.value })}
                placeholder="+44 1234 567890"
                data-testid="input-phone"
              />
            </div>
            <div className="col-span-2 space-y-2">
              <label className="text-sm font-medium text-slate-700">Address *</label>
              <Textarea
                value={contractorForm.address}
                onChange={(e) => setContractorForm({ ...contractorForm, address: e.target.value })}
                placeholder="123 Main Street, London, UK"
                data-testid="input-address"
                rows={2}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">Postcode</label>
              <Input
                value={contractorForm.postcode}
                onChange={(e) => setContractorForm({ ...contractorForm, postcode: e.target.value })}
                placeholder="SW1A 1AA"
                data-testid="input-postcode"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">Website</label>
              <Input
                value={contractorForm.website}
                onChange={(e) => setContractorForm({ ...contractorForm, website: e.target.value })}
                placeholder="https://www.company.co.uk"
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
                placeholder="Brief description of company services and expertise..."
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
                placeholder="John"
                data-testid="input-worker-firstname"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">Last Name *</label>
              <Input
                value={workerForm.lastName}
                onChange={(e) => setWorkerForm({ ...workerForm, lastName: e.target.value })}
                placeholder="Smith"
                data-testid="input-worker-lastname"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">Email Address</label>
              <Input
                type="email"
                value={workerForm.email}
                onChange={(e) => setWorkerForm({ ...workerForm, email: e.target.value })}
                placeholder="john.smith@example.com"
                data-testid="input-worker-email"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">Phone Number</label>
              <Input
                type="tel"
                value={workerForm.phone}
                onChange={(e) => setWorkerForm({ ...workerForm, phone: e.target.value })}
                placeholder="+44 1234 567890"
                data-testid="input-worker-phone"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">Home Postcode *</label>
              <Input
                value={workerForm.postcode}
                onChange={(e) => setWorkerForm({ ...workerForm, postcode: e.target.value })}
                placeholder="SW1A 1AA"
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
                placeholder="12345678"
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
            checkInMutation.mutate(worker.id);
            setShowHSModal(false);
            setWorkerForCheckIn(null);
            setCompanyForCheckIn("");
          }}
          worker={workerForCheckIn}
          companyName={companyForCheckIn}
        />
      )}
    </div>
  );
}