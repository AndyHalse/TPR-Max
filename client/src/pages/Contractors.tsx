import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { queryClient } from "@/lib/queryClient";
import { apiRequest } from "@/lib/queryClient";
import GlassCard from "@/components/GlassCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { 
  HardHat, 
  Plus, 
  Search, 
  Building2, 
  Mail, 
  Phone, 
  FileText, 
  Shield, 
  AlertTriangle, 
  CheckCircle, 
  Clock,
  Users,
  FileCheck,
  ExternalLink,
  Calendar,
  User,
  Upload,
  Eye,
  X,
  ThumbsUp,
  ThumbsDown,
  UserPlus,
  Edit,
  Trash2,
  Leaf,
  Car,
  TrendingDown,
  BarChart3,
  MapPin,
  Sparkles
} from "lucide-react";
import { WorkerCard } from "@/components/WorkerCard";
import ContractorsComplianceView from "@/components/ContractorsComplianceView";
import HSDocumentAssignment from "@/components/HSDocumentAssignment";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface ContractorCompany {
  id: string;
  name: string;
  email: string;
  phone: string;
  address: string;
  postcode?: string;
  website?: string;
  description?: string;
  industry?: string;
  contactPerson: string;
  contactFirstName: string;
  contactLastName: string;
  status: "pending" | "approved" | "suspended";
  complianceScore: number;
  lastUpdated: string;
  workersCount: number;
  publicLiabilityExpiry?: string;
  employersLiabilityExpiry?: string;
  healthSafetyExpiry?: string;
  cisRegistration?: string;
  documentsStatus: {
    publicLiability: "valid" | "expiring" | "expired" | "missing";
    employersLiability: "valid" | "expiring" | "expired" | "missing";
    healthSafety: "valid" | "expiring" | "expired" | "missing";
    cisRegistration: "valid" | "expiring" | "expired" | "missing";
  };
}

export default function Contractors() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [activeTab, setActiveTab] = useState("contractors");
  const [searchTerm, setSearchTerm] = useState("");
  const [showAddContractorDialog, setShowAddContractorDialog] = useState(false);
  const [showAddWorkerDialog, setShowAddWorkerDialog] = useState(false);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [showWorkersModal, setShowWorkersModal] = useState(false);
  const [showEditContractorModal, setShowEditContractorModal] = useState(false);
  const [selectedContractor, setSelectedContractor] = useState<ContractorCompany | null>(null);
  const [selectedWorker, setSelectedWorker] = useState<any>(null);
  const [showViewWorkerModal, setShowViewWorkerModal] = useState(false);
  const [showEditWorkerModal, setShowEditWorkerModal] = useState(false);
  const [showIssueCardModal, setShowIssueCardModal] = useState(false);
  const [workerForCard, setWorkerForCard] = useState<any>(null);
  const [showDocumentModal, setShowDocumentModal] = useState(false);
  const [selectedDocument, setSelectedDocument] = useState<any>(null);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadDocumentType, setUploadDocumentType] = useState('');
  const [showComplianceView, setShowComplianceView] = useState(false);
  const [approvalForm, setApprovalForm] = useState({
    status: '',
    comments: '',
    rejectionReason: ''
  });
  
  // Host selection state (like visitors)
  const [selectedWorkerForCheckIn, setSelectedWorkerForCheckIn] = useState<any>(null);
  const [showHostSelection, setShowHostSelection] = useState(false);
  const [selectedHostForWorker, setSelectedHostForWorker] = useState("");
  const [editWorkerForm, setEditWorkerForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    rightToWork: "",
    cscsCard: "",
    cscsStatus: "",
    ipafStatus: "",
    asbestosAwareness: false,
    manualHandling: false,
    inductionCompleted: false,
    isActive: true
  });
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
    status: "pending" as "pending" | "approved" | "suspended",
    complianceScore: 0,
    publicLiabilityExpiry: "",
    employersLiabilityExpiry: "",
    healthSafetyExpiry: "",
    cisRegistration: ""
  });
  
  const [workerForm, setWorkerForm] = useState({
    companyId: "",
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    postcode: "",
    transportMethod: "car_diesel" as "car_diesel" | "car_petrol" | "electric_car" | "public_transport" | "motorcycle",
    rightToWork: "",
    cscsCard: "",
    cscsStatus: "valid" as "valid" | "expired" | "pending",
    ipafStatus: "none" as "none" | "3a" | "3b" | "1+" | "expired",
    asbestosAwareness: false,
    manualHandling: false,
    workingAtHeight: false,
    inductionCompleted: false,
    isActive: true
  });

  // Get current user for customer isolation with fallback handling
  const { data: currentUser, isError: authError } = useQuery<{ id: string; username: string; customerId: string }>({
    queryKey: ["/api/auth/me"],
    retry: false, // Don't retry if auth fails
    staleTime: 5000,
  });

  // Secure customer ID - no fallback for production security
  const customerId = currentUser?.customerId;

  // Fetch contractor companies from API with customer isolation
  const { data: contractors = [], isLoading } = useQuery<ContractorCompany[]>({
    queryKey: ["/api/contractors", customerId],
    enabled: !!currentUser,
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  // Staff query for host selection (same as visitor workflow) with customer isolation
  const { data: staff = [] } = useQuery<any[]>({
    queryKey: ["/api/staff", customerId],
    enabled: !!currentUser,
  });

  // Fetch workers for selected contractor with customer isolation
  const { data: workers = [] } = useQuery<any[]>({
    queryKey: ["/api/contractors", selectedContractor?.id, "workers", customerId],
    enabled: !!selectedContractor?.id && !!customerId,
    refetchInterval: 30000,
  });

  // Fetch documents for selected contractor with customer isolation
  const { data: documents = [] } = useQuery<any[]>({
    queryKey: ["/api/contractors", selectedContractor?.id, "documents", customerId],
    enabled: !!selectedContractor?.id && !!customerId,
    refetchInterval: 30000,
  });
  
  // Fetch document approvals with customer isolation
  const { data: approvals = [] } = useQuery<any[]>({
    queryKey: ["/api/contractors", selectedContractor?.id, "documents", selectedDocument?.id, "approvals", customerId],
    enabled: !!selectedContractor?.id && !!selectedDocument?.id && !!customerId,
    refetchInterval: 30000,
  });

  // Fetch H&S document assignments for all workers with customer isolation
  const { data: allWorkerHSAssignments = {} } = useQuery<Record<string, any[]>>({
    queryKey: ["/api/uk-hs-documents/assignments", "all-workers", customerId],
    enabled: !!currentUser,
    refetchInterval: 30000,
    queryFn: async () => {
      const assignments: Record<string, any[]> = {};
      
      // Fetch assignments for all workers from all contractors
      for (const contractor of contractors) {
        if (contractor.workersCount > 0) {
          try {
            const workersList = await fetch(`/api/contractors/${contractor.id}/workers`, {
              headers: { 'Authorization': `Bearer ${localStorage.getItem('auth-token') || ''}` }
            }).then(res => res.json()).catch(() => []);
            
            for (const worker of workersList) {
              try {
                const workerAssignments = await fetch(`/api/uk-hs-documents/assignments/worker/${worker.id}`, {
                  headers: { 'Authorization': `Bearer ${localStorage.getItem('auth-token') || ''}` }
                }).then(res => res.json()).catch(() => []);
                
                if (workerAssignments.length > 0) {
                  assignments[worker.id] = workerAssignments;
                }
              } catch (error) {
                console.warn(`Failed to fetch H&S assignments for worker ${worker.id}:`, error);
              }
            }
          } catch (error) {
            console.warn(`Failed to fetch workers for contractor ${contractor.id}:`, error);
          }
        }
      }
      
      return assignments;
    },
  });

  const contractorData = contractors || [];
  const filteredContractors = contractorData.filter((contractor: ContractorCompany) =>
    contractor.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    `${contractor.contactFirstName} ${contractor.contactLastName}`.toLowerCase().includes(searchTerm.toLowerCase()) ||
    contractor.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Calculate dynamic compliance score from documents status
  const calculateComplianceScore = (documentsStatus: any) => {
    if (!documentsStatus) return 0;
    const documents = Object.values(documentsStatus);
    const validDocs = documents.filter((status: any) => status === 'valid').length;
    const totalDocs = documents.length;
    return totalDocs > 0 ? Math.round((validDocs / totalDocs) * 100) : 0;
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
        status: "pending",
        complianceScore: 0,
        publicLiabilityExpiry: "",
        employersLiabilityExpiry: "",
        healthSafetyExpiry: "",
        cisRegistration: ""
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
      setShowAddWorkerDialog(false);
      setWorkerForm({
        companyId: selectedContractor?.id || "",
        firstName: "",
        lastName: "",
        email: "",
        phone: "",
        postcode: "",
        transportMethod: "car_diesel" as "car_diesel" | "car_petrol" | "electric_car" | "public_transport" | "motorcycle",
        rightToWork: "",
        cscsCard: "",
        cscsStatus: "valid",
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

  // Edit contractor mutation
  const updateContractorMutation = useMutation({
    mutationFn: async (data: any) => {
      if (!selectedContractor?.id) throw new Error("No contractor selected");
      return await apiRequest("PUT", `/api/contractors/${selectedContractor.id}`, data);
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Contractor details updated successfully",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/contractors", customerId] });
      setShowEditContractorModal(false);
      setSelectedContractor(null);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update contractor",
        variant: "destructive",
      });
    },
  });

  // Delete contractor mutation
  const deleteContractorMutation = useMutation({
    mutationFn: async (contractorId: string) => {
      return await apiRequest("DELETE", `/api/contractors/${contractorId}`);
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Contractor deleted successfully",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/contractors", customerId] });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete contractor",
        variant: "destructive",
      });
    },
  });

  const handleEditContractor = (contractor: ContractorCompany) => {
    setSelectedContractor(contractor);
    setContractorForm({
      name: contractor.name || "",
      email: contractor.email || "",
      contactFirstName: contractor.contactFirstName || "",
      contactLastName: contractor.contactLastName || "",
      phone: contractor.phone || "",
      address: contractor.address || "",
      postcode: contractor.postcode || "",
      website: contractor.website || "",
      description: contractor.description || "",
      industry: contractor.industry || "",
      status: contractor.status || "pending",
      complianceScore: contractor.complianceScore || 0,
      publicLiabilityExpiry: contractor.publicLiabilityExpiry || "",
      employersLiabilityExpiry: contractor.employersLiabilityExpiry || "",
      healthSafetyExpiry: contractor.healthSafetyExpiry || "",
      cisRegistration: contractor.cisRegistration || ""
    });
    setShowEditContractorModal(true);
  };

  const handleDeleteContractor = (contractorId: string) => {
    if (confirm("Are you sure you want to delete this contractor? This action cannot be undone.")) {
      deleteContractorMutation.mutate(contractorId);
    }
  };

  const handleUpdateContractor = () => {
    updateContractorMutation.mutate(contractorForm);
  };

  const handleAddWorker = () => {
    createWorkerMutation.mutate({
      ...workerForm,
      companyId: selectedContractor?.id
    });
  };

  const handleViewWorker = (worker: any) => {
    setSelectedWorker(worker);
    setShowViewWorkerModal(true);
  };

  const handleIssueCard = (workerId: string) => {
    const worker = workers?.find((w: any) => w.id === workerId);
    setWorkerForCard(worker);
    setShowIssueCardModal(true);
  };

  const handleEditWorker = (worker: any) => {
    setSelectedWorker(worker);
    setEditWorkerForm({
      firstName: worker.firstName || "",
      lastName: worker.lastName || "",
      email: worker.email || "",
      phone: worker.phone || "",
      rightToWork: worker.rightToWork || "",
      cscsCard: worker.cscsCard || "",
      cscsStatus: worker.cscsStatus || "",
      ipafStatus: worker.ipafStatus || "",
      asbestosAwareness: worker.asbestosAwareness || false,
      manualHandling: worker.manualHandling || false,
      inductionCompleted: worker.inductionCompleted || false,
      isActive: worker.isActive !== undefined ? worker.isActive : true
    });
    setShowEditWorkerModal(true);
  };

  const updateWorkerMutation = useMutation({
    mutationFn: async (workerData: any) => {
      return await apiRequest("PUT", `/api/contractors/workers/${selectedWorker.id}`, workerData);
    },
    onSuccess: () => {
      toast({
        title: "Worker Updated",
        description: "Worker information has been updated successfully.",
      });
      setShowEditWorkerModal(false);
      queryClient.invalidateQueries({ queryKey: ["/api/contractors", customerId] });
    },
    onError: (error: any) => {
      toast({
        title: "Update Failed",
        description: error.message || "Failed to update worker",
        variant: "destructive",
      });
    },
  });

  // Resend H&S document email mutation
  const resendHSDocumentMutation = useMutation({
    mutationFn: async (assignmentId: string) => {
      return await apiRequest("POST", `/api/uk-hs-documents/assignments/${assignmentId}/resend`);
    },
    onSuccess: () => {
      toast({
        title: "Email Resent",
        description: "H&S document email has been resent to the worker",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/uk-hs-documents/assignments", "all-workers", customerId] });
    },
    onError: (error: any) => {
      toast({
        title: "Resend Failed",
        description: error.message || "Failed to resend H&S document email",
        variant: "destructive",
      });
    },
  });

  // Reset card to yellow mutation
  const resetCardMutation = useMutation({
    mutationFn: async (workerId: string) => {
      const response = await apiRequest('POST', `/api/contractors/workers/${workerId}/reset-card`);
      return response.json();
    },
    onSuccess: (data) => {
      toast({ 
        title: "Card status reset successfully",
        description: "Worker card has been reset to yellow status" 
      });
      queryClient.invalidateQueries({ queryKey: ["/api/contractors", customerId] });
    },
    onError: (error: any) => {
      toast({ 
        title: "Failed to reset card status", 
        description: error.message,
        variant: "destructive" 
      });
    }
  });

  const handleUpdateWorker = () => {
    updateWorkerMutation.mutate(editWorkerForm);
  };
  
  // Handle resending H&S document email
  const handleResendHSDocument = (assignmentId: string) => {
    resendHSDocumentMutation.mutate(assignmentId);
  };
  
  // Handle contractor check-in (with host selection like visitors)
  const handleWorkerCheckIn = (worker: any) => {
    setSelectedWorkerForCheckIn(worker);
    setShowHostSelection(true);
  };
  
  // Handle host selection confirmation
  const handleHostSelectionConfirm = async () => {
    if (!selectedWorkerForCheckIn || !selectedHostForWorker) return;
    
    try {
      await apiRequest("POST", `/api/contractors/workers/${selectedWorkerForCheckIn.id}/checkin`, {
        hostId: selectedHostForWorker
      });
      
      toast({
        title: "Success",
        description: `${selectedWorkerForCheckIn.firstName} ${selectedWorkerForCheckIn.lastName} checked in successfully`
      });
      
      // Reset state
      setShowHostSelection(false);
      setSelectedWorkerForCheckIn(null);
      setSelectedHostForWorker("");
      
      // Refresh data
      queryClient.invalidateQueries({ queryKey: ["/api/contractors", customerId] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] }); // Refresh dashboard stats
    } catch (error: any) {
      toast({
        title: "Check-in Failed",
        description: error.message || "Failed to check in worker",
        variant: "destructive"
      });
    }
  };
  
  // Handle contractor check-out
  const handleWorkerCheckOut = async (workerId: string) => {
    try {
      await apiRequest("POST", `/api/contractors/workers/${workerId}/checkout`);
      
      toast({
        title: "Success",
        description: "Worker checked out successfully"
      });
      
      // Refresh all contractor-related data using predicate to match partial query keys
      queryClient.invalidateQueries({
        predicate: (query) => {
          const key = query.queryKey[0];
          return typeof key === 'string' && key.includes('/api/contractors');
        }
      });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] }); // Refresh dashboard stats
    } catch (error: any) {
      toast({
        title: "Check-out Failed",
        description: error.message || "Failed to check out worker",
        variant: "destructive"
      });
    }
  };

  const handleViewDocument = (document: any) => {
    console.log('Document clicked:', document);
    setSelectedDocument(document);
    setShowDocumentModal(true);
  };

  const handleUploadDocument = (documentType: string) => {
    setUploadDocumentType(documentType);
    setShowUploadModal(true);
  };

  const handleApproveDocument = async (documentId: string, status: 'approved' | 'rejected') => {
    try {
      await apiRequest('POST', `/api/contractors/${selectedContractor?.id}/documents/${documentId}/approve`, {
        approvalStatus: status,
        comments: approvalForm.comments,
        rejectionReason: status === 'rejected' ? approvalForm.rejectionReason : undefined
      });
      
      toast({
        title: "Success",
        description: `Document ${status} successfully`,
      });
      
      queryClient.invalidateQueries({ queryKey: ["/api/contractors", customerId] });
      
      setApprovalForm({ status: '', comments: '', rejectionReason: '' });
      setShowDocumentModal(false);
    } catch (error) {
      toast({
        title: "Error",
        description: `Failed to ${status} document`,
        variant: "destructive",
      });
    }
  };

  const getComplianceIcon = (score: number) => {
    if (score >= 90) return <CheckCircle className="text-green-500" size={20} />;
    if (score >= 70) return <AlertTriangle className="text-yellow-500" size={20} />;
    return <AlertTriangle className="text-red-500" size={20} />;
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "approved":
        return <Badge className="bg-green-100 text-green-800">Approved</Badge>;
      case "pending":
        return <Badge className="bg-yellow-100 text-yellow-800">Pending</Badge>;
      case "suspended":
        return <Badge className="bg-red-100 text-red-800">Suspended</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const getDocumentStatusIcon = (status: string) => {
    switch (status) {
      case "valid":
        return <CheckCircle className="text-green-500" size={16} />;
      case "expiring":
        return <Clock className="text-yellow-500" size={16} />;
      case "expired":
        return <AlertTriangle className="text-red-500" size={16} />;
      case "missing":
        return <AlertTriangle className="text-red-500" size={16} />;
      default:
        return <AlertTriangle className="text-gray-400" size={16} />;
    }
  };

  return (
    <div className="space-y-6 pt-20 pb-6 p-6 rounded-xl bg-background min-h-screen">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center space-x-3">
          <div className="w-12 h-12 gradient-blue rounded-xl flex items-center justify-center">
            <HardHat className="text-white" size={24} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-fixed">Contractor Management</h1>
            <p className="text-variable">Manage contractor companies and compliance</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button 
            onClick={() => setShowComplianceView(true)}
            className="bg-green-600 hover:bg-green-700 text-white"
            data-testid="button-view-compliance"
          >
            <Shield className="mr-2" size={16} />
            View H&S Compliance
          </Button>
          <Button 
            onClick={() => setShowAddContractorDialog(true)}
            className="bg-blue-600 hover:bg-blue-700 text-white"
            data-testid="button-add-contractor"
          >
            <Plus className="mr-2" size={16} />
            Add Contractor
          </Button>
        </div>
      </div>

      {/* Tab Navigation */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="contractors" className="flex items-center gap-2" data-testid="tab-contractors">
            <Building2 size={16} />
            Contractors
          </TabsTrigger>
          <TabsTrigger value="assign-hs" className="flex items-center gap-2" data-testid="tab-assign-hs">
            <Shield size={16} />
            Assign H&S Document
          </TabsTrigger>
          <TabsTrigger value="co2-reports" className="flex items-center gap-2" data-testid="tab-co2-reports">
            <Leaf size={16} />
            CO2 Reports
          </TabsTrigger>
        </TabsList>

        <TabsContent value="contractors" className="space-y-6 mt-6">

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <GlassCard>
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
              <Building2 className="text-blue-600" size={20} />
            </div>
            <div>
              <p className="text-variable text-sm">Total Contractors</p>
              <p className="text-2xl font-bold text-fixed">{contractors?.length || 0}</p>
            </div>
          </div>
        </GlassCard>

        <GlassCard>
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
              <CheckCircle className="text-green-600" size={20} />
            </div>
            <div>
              <p className="text-variable text-sm">Approved</p>
              <p className="text-2xl font-bold text-fixed">
                {contractors?.filter(c => c.status === "approved").length || 0}
              </p>
            </div>
          </div>
        </GlassCard>

        <GlassCard>
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-yellow-100 rounded-lg flex items-center justify-center">
              <Clock className="text-yellow-600" size={20} />
            </div>
            <div>
              <p className="text-variable text-sm">Pending Review</p>
              <p className="text-2xl font-bold text-fixed">
                {contractors?.filter(c => c.status === "pending").length || 0}
              </p>
            </div>
          </div>
        </GlassCard>

        <GlassCard>
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center">
              <AlertTriangle className="text-orange-600" size={20} />
            </div>
            <div>
              <p className="text-variable text-sm">Compliance Issues</p>
              <p className="text-2xl font-bold text-fixed">
                {contractors?.filter(c => (c.complianceScore || 0) < 80).length || 0}
              </p>
            </div>
          </div>
        </GlassCard>
      </div>

      {/* Search and Filters */}
      <GlassCard>
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-variable" size={16} />
            <Input
              type="text"
              placeholder="Search contractors by name or contact..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
              data-testid="input-search-contractors"
            />
          </div>
        </div>
      </GlassCard>

      {/* Contractors List */}
      <div className="grid grid-cols-1 gap-6">
        {isLoading ? (
          <div className="text-center py-8">
            <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-current border-r-transparent"></div>
            <p className="mt-2 text-variable">Loading contractors...</p>
          </div>
        ) : filteredContractors.map((contractor) => (
          <GlassCard key={contractor.id}>
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div className="flex-1">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center space-x-3">
                    <div className="w-12 h-12 bg-slate-100 rounded-lg flex items-center justify-center">
                      <Building2 className="text-slate-600" size={20} />
                    </div>
                    <div>
                      <h3 className="font-semibold text-fixed">{contractor.name}</h3>
                      <div className="flex items-center space-x-4 text-sm text-variable">
                        <span className="flex items-center">
                          <Users className="mr-1" size={14} />
                          {contractor.workersCount} workers
                        </span>
                        <span className="flex items-center">
                          <Calendar className="mr-1" size={14} />
                          Updated {contractor.lastUpdated}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    {(() => {
                      const dynamicScore = calculateComplianceScore(contractor.documentsStatus);
                      return (
                        <>
                          {getComplianceIcon(dynamicScore)}
                          <span className="text-sm font-medium text-slate-700">{dynamicScore}%</span>
                          {getStatusBadge(contractor.status)}
                        </>
                      );
                    })()}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="bg-white/50 p-3 rounded-lg">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-medium text-slate-600">Public Liability</span>
                      {getDocumentStatusIcon(contractor.documentsStatus.publicLiability)}
                    </div>
                    <span className="text-xs text-slate-500 capitalize">
                      {contractor.documentsStatus.publicLiability}
                    </span>
                  </div>

                  <div className="bg-white/50 p-3 rounded-lg">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-medium text-slate-600">Employers Liability</span>
                      {getDocumentStatusIcon(contractor.documentsStatus.employersLiability)}
                    </div>
                    <span className="text-xs text-slate-500 capitalize">
                      {contractor.documentsStatus.employersLiability}
                    </span>
                  </div>

                  <div className="bg-white/50 p-3 rounded-lg">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-medium text-slate-600">Health & Safety</span>
                      {getDocumentStatusIcon(contractor.documentsStatus.healthSafety)}
                    </div>
                    <span className="text-xs text-slate-500 capitalize">
                      {contractor.documentsStatus.healthSafety}
                    </span>
                  </div>

                  <div className="bg-white/50 p-3 rounded-lg">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-medium text-slate-600">CIS Registration</span>
                      {getDocumentStatusIcon(contractor.documentsStatus.cisRegistration)}
                    </div>
                    <span className="text-xs text-slate-500 capitalize">
                      {contractor.documentsStatus.cisRegistration}
                    </span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 lg:w-60">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setLocation(`/contractors/${contractor.id}`)}
                  className="w-full"
                  data-testid={`button-workers-${contractor.id}`}
                >
                  <Users className="mr-2" size={14} />
                  Workers
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setSelectedContractor(contractor);
                    setShowWorkersModal(true);
                  }}
                  className="w-full"
                  data-testid={`button-add-worker-${contractor.id}`}
                >
                  <UserPlus className="mr-2" size={14} />
                  Add Worker
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleEditContractor(contractor)}
                  className="w-full"
                  data-testid={`button-edit-contractor-${contractor.id}`}
                >
                  <Edit className="mr-2" size={14} />
                  Edit
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => handleDeleteContractor(contractor.id)}
                  className="w-full"
                  data-testid={`button-delete-contractor-${contractor.id}`}
                >
                  <Trash2 className="mr-2" size={14} />
                  Delete
                </Button>
              </div>
            </div>
          </GlassCard>
        ))}
      </div>

      {/* Add Contractor Dialog */}
      <Dialog open={showAddContractorDialog} onOpenChange={setShowAddContractorDialog}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              Add New Contractor Company
            </DialogTitle>
            <DialogDescription>
              Create a new contractor company profile with contact information and compliance details.
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
              <label className="text-sm font-medium text-slate-700">Description</label>
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
                onValueChange={(value) => setContractorForm({ ...contractorForm, industry: value })}
              >
                <SelectTrigger data-testid="select-industry">
                  <SelectValue placeholder="Select industry" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="construction">Construction</SelectItem>
                  <SelectItem value="engineering">Engineering</SelectItem>
                  <SelectItem value="manufacturing">Manufacturing</SelectItem>
                  <SelectItem value="electrical">Electrical</SelectItem>
                  <SelectItem value="plumbing">Plumbing & Heating</SelectItem>
                  <SelectItem value="mechanical">Mechanical</SelectItem>
                  <SelectItem value="roofing">Roofing</SelectItem>
                  <SelectItem value="scaffolding">Scaffolding</SelectItem>
                  <SelectItem value="demolition">Demolition</SelectItem>
                  <SelectItem value="groundworks">Groundworks</SelectItem>
                  <SelectItem value="painting">Painting & Decorating</SelectItem>
                  <SelectItem value="glazing">Glazing</SelectItem>
                  <SelectItem value="security">Security</SelectItem>
                  <SelectItem value="cleaning">Cleaning & Maintenance</SelectItem>
                  <SelectItem value="landscaping">Landscaping</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">CIS Registration Number</label>
              <Input
                value={contractorForm.cisRegistration}
                onChange={(e) => setContractorForm({ ...contractorForm, cisRegistration: e.target.value })}
                placeholder="CIS123456"
                data-testid="input-cis"
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
            <div className="col-span-2">
              <h3 className="text-sm font-semibold text-slate-700 mb-2">Compliance Documents Expiry Dates</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-xs font-medium text-slate-600">Public Liability Insurance</label>
                  <Input
                    type="date"
                    value={contractorForm.publicLiabilityExpiry}
                    onChange={(e) => setContractorForm({ ...contractorForm, publicLiabilityExpiry: e.target.value })}
                    data-testid="input-public-liability"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-medium text-slate-600">Employers Liability Insurance</label>
                  <Input
                    type="date"
                    value={contractorForm.employersLiabilityExpiry}
                    onChange={(e) => setContractorForm({ ...contractorForm, employersLiabilityExpiry: e.target.value })}
                    data-testid="input-employers-liability"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-medium text-slate-600">Health & Safety Policy</label>
                  <Input
                    type="date"
                    value={contractorForm.healthSafetyExpiry}
                    onChange={(e) => setContractorForm({ ...contractorForm, healthSafetyExpiry: e.target.value })}
                    data-testid="input-health-safety"
                  />
                </div>
              </div>
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

      {/* Edit Contractor Dialog */}
      <Dialog open={showEditContractorModal} onOpenChange={setShowEditContractorModal}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Edit className="h-5 w-5" />
              Edit Contractor Company
            </DialogTitle>
            <DialogDescription>
              Update contractor company profile with contact information and compliance details.
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
                onValueChange={(value) => setContractorForm({ ...contractorForm, industry: value })}
              >
                <SelectTrigger data-testid="select-edit-industry">
                  <SelectValue placeholder="Select industry" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="construction">Construction</SelectItem>
                  <SelectItem value="electrical">Electrical</SelectItem>
                  <SelectItem value="plumbing">Plumbing</SelectItem>
                  <SelectItem value="roofing">Roofing</SelectItem>
                  <SelectItem value="landscaping">Landscaping</SelectItem>
                  <SelectItem value="mechanical">Mechanical</SelectItem>
                  <SelectItem value="demolition">Demolition</SelectItem>
                  <SelectItem value="painting">Painting & Decorating</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2 space-y-2">
              <label className="text-sm font-medium text-slate-700">Description</label>
              <Textarea
                value={contractorForm.description}
                onChange={(e) => setContractorForm({ ...contractorForm, description: e.target.value })}
                placeholder="Brief description of company services and expertise..."
                data-testid="input-edit-description"
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => setShowEditContractorModal(false)}
              data-testid="button-cancel-edit"
            >
              Cancel
            </Button>
            <Button 
              onClick={handleUpdateContractor}
              disabled={!contractorForm.name || !contractorForm.email || !contractorForm.contactFirstName || !contractorForm.contactLastName || !contractorForm.phone || !contractorForm.address || updateContractorMutation.isPending}
              className="bg-blue-600 hover:bg-blue-700"
              data-testid="button-update-contractor"
            >
              {updateContractorMutation.isPending ? "Updating..." : "Update Contractor"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View Details Modal */}
      <Dialog open={showDetailsModal} onOpenChange={setShowDetailsModal}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              Contractor Details: {selectedContractor?.name}
            </DialogTitle>
            <DialogDescription>
              View detailed information about this contractor including company details and compliance status.
            </DialogDescription>
          </DialogHeader>
          
          {selectedContractor && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-4">
              {/* Company Information */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-slate-700">Company Information</h3>
                <div className="space-y-3">
                  <div>
                    <label className="text-sm font-medium text-slate-600">Company Name</label>
                    <p className="text-slate-800 font-medium">{selectedContractor.name}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-slate-600">Contact Person</label>
                    <p className="text-slate-800">{selectedContractor.contactPerson}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-slate-600">Email</label>
                    <p className="text-slate-800">{selectedContractor.email}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-slate-600">Phone</label>
                    <p className="text-slate-800">{selectedContractor.phone}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-slate-600">Address</label>
                    <p className="text-slate-800">{selectedContractor.address}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-slate-600">Status</label>
                    <Badge 
                      className={`ml-2 ${
                        selectedContractor.status === 'approved' 
                          ? 'bg-green-100 text-green-800'
                          : selectedContractor.status === 'pending'
                          ? 'bg-yellow-100 text-yellow-800'
                          : 'bg-red-100 text-red-800'
                      }`}
                    >
                      {selectedContractor.status}
                    </Badge>
                  </div>
                </div>
              </div>

              {/* Compliance Status */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-slate-700">Compliance Status</h3>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-slate-600">Overall Score</span>
                    <div className="flex items-center gap-2">
                      {(() => {
                        const validDocs = documents?.filter(doc => doc.status === 'valid').length || 0;
                        const totalDocs = documents?.length || 0;
                        const complianceScore = totalDocs > 0 ? Math.round((validDocs / totalDocs) * 100) : 0;
                        
                        return (
                          <>
                            <div className={`w-3 h-3 rounded-full ${
                              complianceScore >= 90 ? 'bg-green-500' :
                              complianceScore >= 75 ? 'bg-yellow-500' : 'bg-red-500'
                            }`} />
                            <span className="font-semibold">{complianceScore}%</span>
                          </>
                        );
                      })()}
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <h4 className="text-sm font-semibold text-slate-700">Document Status</h4>
                    <TooltipProvider>
                      {Object.entries({
                        publicLiability: "Public Liability Insurance",
                        employersLiability: "Employers Liability Insurance", 
                        healthSafety: "Health & Safety Certificate",
                        cisRegistration: "CIS Registration"
                      }).map(([key, label]) => {
                        const status = selectedContractor.documentsStatus[key as keyof typeof selectedContractor.documentsStatus];
                        return (
                          <Tooltip key={key}>
                            <TooltipTrigger asChild>
                              <div 
                                className="flex items-center justify-between p-2 rounded-md hover:bg-blue-50 hover:shadow-md transition-all duration-200 cursor-pointer"
                                onClick={() => {
                                  console.log('Document status clicked:', label);
                                  // Find the document from API data
                                  const document = documents.find((doc: any) => 
                                    doc.documentType === key.replace(/([A-Z])/g, '_$1').toLowerCase().replace(/^_/, '')
                                  );
                                  if (document) {
                                    handleViewDocument(document);
                                  } else {
                                    toast({
                                      title: "Document not found",
                                      description: "This document hasn't been uploaded yet.",
                                      variant: "destructive",
                                    });
                                  }
                                }}
                              >
                                <span className="text-sm text-slate-600">{label}</span>
                                <Badge className={`${
                                  status === 'valid' ? 'bg-green-100 text-green-800' :
                                  status === 'expiring' ? 'bg-yellow-100 text-yellow-800' :
                                  status === 'expired' ? 'bg-red-100 text-red-800' :
                                  'bg-gray-100 text-gray-800'
                                }`}>
                                  {status}
                                </Badge>
                              </div>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>Click to open {label}</p>
                            </TooltipContent>
                          </Tooltip>
                        );
                      })}
                    </TooltipProvider>
                  </div>
                </div>
              </div>

              {/* Additional Information */}
              <div className="lg:col-span-2 space-y-4">
                <h3 className="text-lg font-semibold text-slate-700">Additional Information</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="text-center p-4 bg-slate-50 rounded-lg">
                    <Users className="h-8 w-8 mx-auto mb-2 text-blue-600" />
                    <p className="text-2xl font-bold text-slate-800">{selectedContractor.workersCount}</p>
                    <p className="text-sm text-slate-600">Workers Registered</p>
                  </div>
                  <div className="text-center p-4 bg-slate-50 rounded-lg">
                    <Calendar className="h-8 w-8 mx-auto mb-2 text-blue-600" />
                    <p className="text-lg font-bold text-slate-800">{selectedContractor.lastUpdated}</p>
                    <p className="text-sm text-slate-600">Last Updated</p>
                  </div>
                  <div className="text-center p-4 bg-slate-50 rounded-lg">
                    <Shield className="h-8 w-8 mx-auto mb-2 text-blue-600" />
                    <p className="text-lg font-bold text-slate-800">UK Compliant</p>
                    <p className="text-sm text-slate-600">Health & Safety</p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Manage Workers Modal */}
      <Dialog open={showWorkersModal} onOpenChange={setShowWorkersModal}>
        <DialogContent className="max-w-7xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <DialogTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                Manage Workers: {selectedContractor?.name}
              </DialogTitle>
            <DialogDescription>
              Manage all workers for this contractor company, view their certifications and safety status.
            </DialogDescription>
              <Button
                onClick={() => {
                  setWorkerForm({ ...workerForm, companyId: selectedContractor?.id || "" });
                  setShowAddWorkerDialog(true);
                }}
                className="bg-blue-600 hover:bg-blue-700 text-white"
                size="sm"
                data-testid="button-add-worker"
              >
                <Plus className="mr-2" size={16} />
                Add Worker
              </Button>
            </div>
          </DialogHeader>

          {selectedContractor && (
            <div className="mt-4 space-y-4">
              {/* Workers Statistics */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="text-center p-4 bg-blue-50 rounded-lg">
                  <Users className="h-6 w-6 mx-auto mb-2 text-blue-600" />
                  <p className="text-xl font-bold text-blue-800">{workers?.length || 0}</p>
                  <p className="text-sm text-blue-600">Total Workers</p>
                </div>
                <div className="text-center p-4 bg-green-50 rounded-lg">
                  <CheckCircle className="h-6 w-6 mx-auto mb-2 text-green-600" />
                  <p className="text-xl font-bold text-green-800">
                    {workers?.filter(w => w.isActive && w.inductionCompleted && w.rightToWork === 'valid').length || 0}
                  </p>
                  <p className="text-sm text-green-600">Certified</p>
                </div>
                <div className="text-center p-4 bg-yellow-50 rounded-lg">
                  <Clock className="h-6 w-6 mx-auto mb-2 text-yellow-600" />
                  <p className="text-xl font-bold text-yellow-800">
                    {workers?.filter(w => !w.inductionCompleted || w.rightToWork === 'pending').length || 0}
                  </p>
                  <p className="text-sm text-yellow-600">Pending</p>
                </div>
                <div className="text-center p-4 bg-red-50 rounded-lg">
                  <AlertTriangle className="h-6 w-6 mx-auto mb-2 text-red-600" />
                  <p className="text-xl font-bold text-red-800">
                    {workers?.filter(w => !w.isActive || w.rightToWork === 'expired').length || 0}
                  </p>
                  <p className="text-sm text-red-600">Expired</p>
                </div>
              </div>

              {/* Add Worker Button */}
              <div className="flex justify-end">
                <Button className="bg-blue-600 hover:bg-blue-700">
                  <Plus className="mr-2 h-4 w-4" />
                  Add New Worker
                </Button>
              </div>

              {/* Workers Grid - Same as Visitor Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {(workers as any[]).length > 0 ? (workers as any[]).map((worker: any) => (
                  <WorkerCard
                    key={worker.id}
                    worker={worker}
                    onCheckIn={handleWorkerCheckIn}
                    onCheckOut={handleWorkerCheckOut}
                    onIssueCard={handleIssueCard}
                    onViewDetails={() => handleViewWorker(worker)}
                    onResendHSDocument={handleResendHSDocument}
                    onResetCard={(workerId) => {
                      resetCardMutation.mutate(workerId);
                    }}
                    hsAssignments={allWorkerHSAssignments[worker.id] || []}
                  />
                )) : (
                  <div className="col-span-full text-center py-8">
                    <Users className="h-12 w-12 mx-auto mb-4 text-slate-400" />
                    <p className="text-slate-500">No workers found for this contractor.</p>
                    <Button 
                      onClick={() => setShowAddWorkerDialog(true)}
                      className="mt-4 bg-blue-600 hover:bg-blue-700"
                    >
                      <Plus className="mr-2 h-4 w-4" />
                      Add First Worker
                    </Button>
                  </div>
                )}
              </div>

              {/* Document Management Section */}
              <div className="mt-8">
                <h3 className="text-lg font-semibold text-slate-800 mb-4">Document Management</h3>
                <TooltipProvider>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {documents.map((document: any) => (
                      <Tooltip key={document.id}>
                        <TooltipTrigger asChild>
                          <div 
                            className="border-2 border-slate-200 rounded-lg p-4 hover:border-blue-500 hover:shadow-lg hover:bg-blue-50 transition-all duration-200 cursor-pointer bg-white select-none"
                            onClick={() => {
                              console.log('Document panel clicked:', document.documentName);
                              handleViewDocument(document);
                            }}
                          >
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-medium">{document.documentName}</span>
                        <Badge className={`${
                          document.status === 'valid' ? 'bg-green-100 text-green-800' :
                          document.status === 'approved' ? 'bg-green-100 text-green-800' :
                          document.status === 'expiring' ? 'bg-yellow-100 text-yellow-800' :
                          document.status === 'rejected' ? 'bg-red-100 text-red-800' :
                          'bg-gray-100 text-gray-800'
                        }`}>
                          {document.status.charAt(0).toUpperCase() + document.status.slice(1)}
                        </Badge>
                      </div>
                      <div className="text-sm text-slate-500 mb-3">
                        {document.expiryDate ? `Expires: ${new Date(document.expiryDate).toLocaleDateString()}` : 'No expiry date'}
                      </div>
                            <div className="flex gap-2">
                              <Button 
                                variant="outline" 
                                size="sm"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleViewDocument(document);
                                }}
                                data-testid={`button-view-document-${document.id}`}
                              >
                                <Eye className="h-4 w-4 mr-1" />
                                View
                              </Button>
                              <Button 
                                variant="outline" 
                                size="sm"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleUploadDocument(document.documentType);
                                }}
                                data-testid={`button-upload-document-${document.id}`}
                              >
                                <Upload className="h-4 w-4 mr-1" />
                                Upload New
                              </Button>
                            </div>
                          </div>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Click to open {document.documentName}</p>
                        </TooltipContent>
                      </Tooltip>
                    ))}

                    {/* Placeholder for missing documents */}
                    {['public_liability', 'employers_liability', 'health_safety', 'cis_registration'].filter(
                      type => !documents.some((doc: any) => doc.documentType === type)
                    ).map((docType) => (
                      <Tooltip key={docType}>
                        <TooltipTrigger asChild>
                          <div 
                            className="border-2 border-dashed border-gray-300 rounded-lg p-4 hover:border-blue-400 hover:shadow-lg hover:bg-blue-50 transition-all duration-200 cursor-pointer bg-gray-50 select-none"
                            onClick={() => {
                              console.log('Missing document clicked:', docType);
                              handleUploadDocument(docType);
                            }}
                          >
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-medium text-gray-600">
                          {docType.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')}
                        </span>
                        <Badge className="bg-gray-100 text-gray-600">Missing</Badge>
                      </div>
                      <div className="text-sm text-gray-500 mb-3">Document not uploaded</div>
                            <Button 
                              variant="outline" 
                              size="sm"
                              className="text-blue-600 border-blue-600 hover:bg-blue-50"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleUploadDocument(docType);
                              }}
                              data-testid={`button-upload-${docType}`}
                            >
                              <Upload className="h-4 w-4 mr-1" />
                              Upload Document
                            </Button>
                          </div>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Click to upload {docType.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')}</p>
                        </TooltipContent>
                      </Tooltip>
                    ))}
                  </div>
                </TooltipProvider>

                {/* Approval History */}
                <div className="mt-6">
                  <h4 className="text-md font-semibold text-slate-800 mb-3">Recent Approvals</h4>
                  <div className="space-y-2">
                    {approvals.length > 0 ? approvals.slice(0, 5).map((approval: any) => (
                      <div key={approval.id} className={`flex items-center justify-between p-3 rounded-lg ${
                        approval.approvalStatus === 'approved' ? 'bg-green-50' : 'bg-red-50'
                      }`}>
                        <div>
                          <span className={`font-medium ${
                            approval.approvalStatus === 'approved' ? 'text-green-800' : 'text-red-800'
                          }`}>
                            {approval.documentType.split('_').map((word: string) => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')} {approval.approvalStatus}
                          </span>
                          <p className={`text-sm ${
                            approval.approvalStatus === 'approved' ? 'text-green-600' : 'text-red-600'
                          }`}>
                            by {approval.approvedBy} on {new Date(approval.createdAt).toLocaleDateString()} at {new Date(approval.createdAt).toLocaleTimeString()}
                          </p>
                          {approval.comments && (
                            <p className="text-sm text-gray-600 mt-1">"{approval.comments}"</p>
                          )}
                        </div>
                        {approval.approvalStatus === 'approved' ? 
                          <CheckCircle className="h-5 w-5 text-green-600" /> :
                          <X className="h-5 w-5 text-red-600" />
                        }
                      </div>
                    )) : (
                      <div className="text-center py-4 text-gray-500">
                        No approval history available
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Issue Card Modal */}
      <Dialog open={showIssueCardModal} onOpenChange={setShowIssueCardModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Issue Red or Yellow Card</DialogTitle>
            <DialogDescription>
              Issue a safety card to a worker for violations or incidents.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Worker</label>
              <div className="p-2 bg-gray-50 rounded">
                {workerForCard?.firstName} {workerForCard?.lastName}
              </div>
            </div>
            
            <div className="space-y-2">
              <label className="text-sm font-medium">Card Type</label>
              <select className="w-full p-2 border rounded" data-testid="select-card-type">
                <option value="yellow">Yellow Card</option>
                <option value="red">Red Card</option>
              </select>
            </div>
            
            <div className="space-y-2">
              <label className="text-sm font-medium">Offence</label>
              <select className="w-full p-2 border rounded" data-testid="select-offence">
                <option value="">Select offence</option>
                <option value="safety_violation">Safety Violation</option>
                <option value="late_arrival">Late Arrival</option>
                <option value="improper_ppe">Improper PPE</option>
                <option value="other">Other</option>
              </select>
            </div>
            
            <div className="space-y-2">
              <label className="text-sm font-medium">Description</label>
              <textarea 
                placeholder="Describe the incident..." 
                className="w-full p-2 border rounded h-20"
                data-testid="textarea-description"
              />
            </div>
          </div>
          
          <div className="flex justify-end gap-2 mt-6">
            <Button 
              variant="outline" 
              onClick={() => setShowIssueCardModal(false)}
              data-testid="button-cancel"
            >
              Cancel
            </Button>
            <Button 
              onClick={() => {
                // Handle card issuing logic here
                setShowIssueCardModal(false);
                // You can add actual card issuing API call here
              }}
              data-testid="button-issue-card"
            >
              Issue Card
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* View Worker Modal */}
      <Dialog open={showViewWorkerModal} onOpenChange={setShowViewWorkerModal}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <User className="h-5 w-5" />
              Worker Details: {selectedWorker?.firstName} {selectedWorker?.lastName}
            </DialogTitle>
            <DialogDescription>
              View detailed information about this worker including personal information, qualifications, and compliance status.
            </DialogDescription>
          </DialogHeader>

          {selectedWorker && (
            <div className="space-y-6 mt-4">
              {/* Personal Information */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold text-slate-800">Personal Information</h3>
                  <div className="space-y-3">
                    <div>
                      <Label className="text-sm font-medium text-slate-600">Full Name</Label>
                      <p className="text-slate-900">{selectedWorker.firstName} {selectedWorker.lastName}</p>
                    </div>
                    <div>
                      <Label className="text-sm font-medium text-slate-600">Email</Label>
                      <p className="text-slate-900">{selectedWorker.email || 'Not provided'}</p>
                    </div>
                    <div>
                      <Label className="text-sm font-medium text-slate-600">Phone</Label>
                      <p className="text-slate-900">{selectedWorker.phone || 'Not provided'}</p>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <h3 className="text-lg font-semibold text-slate-800">Work Status</h3>
                  <div className="space-y-3">
                    <div>
                      <Label className="text-sm font-medium text-slate-600">Right to Work</Label>
                      <Badge className={`${
                        selectedWorker.rightToWork === 'valid' ? 'bg-green-100 text-green-800' :
                        selectedWorker.rightToWork === 'expired' ? 'bg-red-100 text-red-800' :
                        'bg-yellow-100 text-yellow-800'
                      }`}>
                        {selectedWorker.rightToWork || 'Pending'}
                      </Badge>
                    </div>
                    <div>
                      <Label className="text-sm font-medium text-slate-600">Active Status</Label>
                      <Badge className={selectedWorker.isActive ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}>
                        {selectedWorker.isActive ? 'Active' : 'Inactive'}
                      </Badge>
                    </div>
                    <div>
                      <Label className="text-sm font-medium text-slate-600">Induction</Label>
                      <Badge className={selectedWorker.inductionCompleted ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}>
                        {selectedWorker.inductionCompleted ? 'Completed' : 'Pending'}
                      </Badge>
                    </div>
                  </div>
                </div>
              </div>

              {/* Certifications */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-slate-800">Certifications & Training</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="p-4 border rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-medium">CSCS Card</span>
                      <Badge className={`${
                        selectedWorker.cscsStatus === 'valid' ? 'bg-green-100 text-green-800' :
                        selectedWorker.cscsStatus === 'expired' ? 'bg-red-100 text-red-800' :
                        selectedWorker.cscsStatus === 'expiring' ? 'bg-yellow-100 text-yellow-800' :
                        'bg-gray-100 text-gray-800'
                      }`}>
                        {selectedWorker.cscsStatus || 'Missing'}
                      </Badge>
                    </div>
                    <p className="text-sm text-slate-600">{selectedWorker.cscsCard || 'Not provided'}</p>
                  </div>
                  
                  <div className="p-4 border rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-medium">IPAF Training</span>
                      <Badge className={`${
                        selectedWorker.ipafStatus === 'valid' ? 'bg-green-100 text-green-800' :
                        selectedWorker.ipafStatus === 'expired' ? 'bg-red-100 text-red-800' :
                        'bg-gray-100 text-gray-800'
                      }`}>
                        {selectedWorker.ipafStatus || 'Missing'}
                      </Badge>
                    </div>
                  </div>

                  <div className="p-4 border rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-medium">Asbestos Awareness</span>
                      <Badge className={selectedWorker.asbestosAwareness ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}>
                        {selectedWorker.asbestosAwareness ? 'Completed' : 'Not Completed'}
                      </Badge>
                    </div>
                  </div>

                  <div className="p-4 border rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-medium">Manual Handling</span>
                      <Badge className={selectedWorker.manualHandling ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}>
                        {selectedWorker.manualHandling ? 'Completed' : 'Not Completed'}
                      </Badge>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Edit Worker Modal */}
      <Dialog open={showEditWorkerModal} onOpenChange={setShowEditWorkerModal}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Edit Worker: {selectedWorker?.firstName} {selectedWorker?.lastName}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-6 mt-4">
            {/* Personal Information */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-slate-800">Personal Information</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="firstName">First Name</Label>
                  <Input
                    id="firstName"
                    value={editWorkerForm.firstName}
                    onChange={(e) => setEditWorkerForm({...editWorkerForm, firstName: e.target.value})}
                    data-testid="input-first-name"
                  />
                </div>
                <div>
                  <Label htmlFor="lastName">Last Name</Label>
                  <Input
                    id="lastName"
                    value={editWorkerForm.lastName}
                    onChange={(e) => setEditWorkerForm({...editWorkerForm, lastName: e.target.value})}
                    data-testid="input-last-name"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={editWorkerForm.email}
                    onChange={(e) => setEditWorkerForm({...editWorkerForm, email: e.target.value})}
                    data-testid="input-email"
                  />
                </div>
                <div>
                  <Label htmlFor="phone">Phone</Label>
                  <Input
                    id="phone"
                    value={editWorkerForm.phone}
                    onChange={(e) => setEditWorkerForm({...editWorkerForm, phone: e.target.value})}
                    data-testid="input-phone"
                  />
                </div>
              </div>
            </div>

            {/* Work Status */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-slate-800">Work Status</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="rightToWork">Right to Work Status</Label>
                  <Select 
                    value={editWorkerForm.rightToWork} 
                    onValueChange={(value) => setEditWorkerForm({...editWorkerForm, rightToWork: value})}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="valid">Valid</SelectItem>
                      <SelectItem value="expired">Expired</SelectItem>
                      <SelectItem value="pending">Pending</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="cscsStatus">CSCS Status</Label>
                  <Select 
                    value={editWorkerForm.cscsStatus} 
                    onValueChange={(value) => setEditWorkerForm({...editWorkerForm, cscsStatus: value})}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="valid">Valid</SelectItem>
                      <SelectItem value="expired">Expired</SelectItem>
                      <SelectItem value="expiring">Expiring</SelectItem>
                      <SelectItem value="missing">Missing</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label htmlFor="cscsCard">CSCS Card Number</Label>
                <Input
                  id="cscsCard"
                  value={editWorkerForm.cscsCard}
                  onChange={(e) => setEditWorkerForm({...editWorkerForm, cscsCard: e.target.value})}
                  data-testid="input-cscs-card"
                />
              </div>
            </div>

            {/* Training & Certifications */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-slate-800">Training & Certifications</h3>
              <div className="space-y-3">
                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id="asbestosAwareness"
                    checked={editWorkerForm.asbestosAwareness}
                    onChange={(e) => setEditWorkerForm({...editWorkerForm, asbestosAwareness: e.target.checked})}
                    className="rounded"
                  />
                  <Label htmlFor="asbestosAwareness">Asbestos Awareness Training</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id="manualHandling"
                    checked={editWorkerForm.manualHandling}
                    onChange={(e) => setEditWorkerForm({...editWorkerForm, manualHandling: e.target.checked})}
                    className="rounded"
                  />
                  <Label htmlFor="manualHandling">Manual Handling Training</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id="inductionCompleted"
                    checked={editWorkerForm.inductionCompleted}
                    onChange={(e) => setEditWorkerForm({...editWorkerForm, inductionCompleted: e.target.checked})}
                    className="rounded"
                  />
                  <Label htmlFor="inductionCompleted">Induction Completed</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id="isActive"
                    checked={editWorkerForm.isActive}
                    onChange={(e) => setEditWorkerForm({...editWorkerForm, isActive: e.target.checked})}
                    className="rounded"
                  />
                  <Label htmlFor="isActive">Active Worker</Label>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex justify-end gap-3 pt-4 border-t">
              <Button 
                variant="outline" 
                onClick={() => setShowEditWorkerModal(false)}
                data-testid="button-cancel-edit"
              >
                Cancel
              </Button>
              <Button 
                onClick={handleUpdateWorker}
                disabled={updateWorkerMutation.isPending}
                className="bg-blue-600 hover:bg-blue-700"
                data-testid="button-save-worker"
              >
                {updateWorkerMutation.isPending ? "Saving..." : "Save Changes"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Document View Modal */}
      <Dialog open={showDocumentModal} onOpenChange={setShowDocumentModal}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Document Details: {selectedDocument?.documentName}
            </DialogTitle>
            <DialogDescription>
              View document details, approval status, and approval history for this compliance document.
            </DialogDescription>
          </DialogHeader>

          {selectedDocument && (
            <div className="space-y-6 mt-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold text-slate-800">Document Information</h3>
                  <div className="space-y-3">
                    <div>
                      <Label className="text-sm font-medium text-slate-600">Document Type</Label>
                      <p className="text-slate-900">{selectedDocument.documentType.split('_').map((word: string) => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')}</p>
                    </div>
                    <div>
                      <Label className="text-sm font-medium text-slate-600">Status</Label>
                      <Badge className={`${
                        selectedDocument.status === 'valid' ? 'bg-green-100 text-green-800' :
                        selectedDocument.status === 'approved' ? 'bg-green-100 text-green-800' :
                        selectedDocument.status === 'expiring' ? 'bg-yellow-100 text-yellow-800' :
                        selectedDocument.status === 'rejected' ? 'bg-red-100 text-red-800' :
                        'bg-gray-100 text-gray-800'
                      }`}>
                        {selectedDocument.status.charAt(0).toUpperCase() + selectedDocument.status.slice(1)}
                      </Badge>
                    </div>
                    <div>
                      <Label className="text-sm font-medium text-slate-600">Uploaded</Label>
                      <p className="text-slate-900">{new Date(selectedDocument.uploadedAt).toLocaleString()}</p>
                    </div>
                    {selectedDocument.expiryDate && (
                      <div>
                        <Label className="text-sm font-medium text-slate-600">Expires</Label>
                        <p className="text-slate-900">{new Date(selectedDocument.expiryDate).toLocaleDateString()}</p>
                      </div>
                    )}
                  </div>
                </div>

                <div className="space-y-4">
                  <h3 className="text-lg font-semibold text-slate-800">Document Actions</h3>
                  <div className="space-y-3">
                    <Button className="w-full" onClick={() => window.open(selectedDocument.documentUrl, '_blank')}>
                      <ExternalLink className="h-4 w-4 mr-2" />
                      View Document
                    </Button>
                    
                    {selectedDocument.status !== 'approved' && (
                      <div className="space-y-3 p-4 bg-gray-50 rounded-lg">
                        <Label className="text-sm font-medium text-slate-600">Approval Actions</Label>
                        <Textarea
                          placeholder="Add comments..."
                          value={approvalForm.comments}
                          onChange={(e) => setApprovalForm({...approvalForm, comments: e.target.value})}
                        />
                        {approvalForm.status === 'rejected' && (
                          <Textarea
                            placeholder="Reason for rejection..."
                            value={approvalForm.rejectionReason}
                            onChange={(e) => setApprovalForm({...approvalForm, rejectionReason: e.target.value})}
                          />
                        )}
                        <div className="flex gap-2">
                          <Button 
                            className="flex-1 bg-green-600 hover:bg-green-700 text-white"
                            onClick={() => handleApproveDocument(selectedDocument.id, 'approved')}
                          >
                            <ThumbsUp className="h-4 w-4 mr-2" />
                            Approve
                          </Button>
                          <Button 
                            variant="outline"
                            className="flex-1 text-red-600 border-red-600 hover:bg-red-50"
                            onClick={() => {
                              setApprovalForm({...approvalForm, status: 'rejected'});
                              if (approvalForm.rejectionReason) {
                                handleApproveDocument(selectedDocument.id, 'rejected');
                              }
                            }}
                          >
                            <ThumbsDown className="h-4 w-4 mr-2" />
                            Reject
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Approval History for this document */}
              <div>
                <h4 className="text-md font-semibold text-slate-800 mb-3">Approval History</h4>
                <div className="space-y-2">
                  {approvals.length > 0 ? approvals.map((approval: any) => (
                    <div key={approval.id} className={`flex items-center justify-between p-3 rounded-lg ${
                      approval.approvalStatus === 'approved' ? 'bg-green-50' : 'bg-red-50'
                    }`}>
                      <div>
                        <span className={`font-medium ${
                          approval.approvalStatus === 'approved' ? 'text-green-800' : 'text-red-800'
                        }`}>
                          Document {approval.approvalStatus}
                        </span>
                        <p className={`text-sm ${
                          approval.approvalStatus === 'approved' ? 'text-green-600' : 'text-red-600'
                        }`}>
                          by {approval.approvedBy} on {new Date(approval.createdAt).toLocaleString()}
                        </p>
                        {approval.comments && (
                          <p className="text-sm text-gray-600 mt-1">"{approval.comments}"</p>
                        )}
                      </div>
                      {approval.approvalStatus === 'approved' ? 
                        <CheckCircle className="h-5 w-5 text-green-600" /> :
                        <X className="h-5 w-5 text-red-600" />
                      }
                    </div>
                  )) : (
                    <div className="text-center py-4 text-gray-500">
                      No approval history for this document
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Upload Document Modal */}
      <Dialog open={showUploadModal} onOpenChange={setShowUploadModal}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5" />
              Upload {uploadDocumentType.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')} Document
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-6 mt-4">
            <div className="text-center">
              <p className="text-slate-600">
                You can upload a PDF or image file for the {uploadDocumentType.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')} document.
              </p>
              <p className="text-sm text-slate-500 mt-2">
                For demo purposes, you can download and upload our sample documents:
              </p>
            </div>

            {/* Demo Sample Downloads */}
            <div className="grid grid-cols-2 gap-4">
              {uploadDocumentType === 'public_liability' && (
                <Button 
                  variant="outline" 
                  className="w-full"
                  onClick={() => {
                    const link = document.createElement('a');
                    link.href = '/sample-public-liability.pdf';
                    link.download = 'sample-public-liability.pdf';
                    link.click();
                  }}
                >
                  <FileText className="h-4 w-4 mr-2" />
                  Download Sample
                </Button>
              )}
              {uploadDocumentType === 'employers_liability' && (
                <Button 
                  variant="outline" 
                  className="w-full"
                  onClick={() => {
                    const link = document.createElement('a');
                    link.href = '/sample-employers-liability.pdf';
                    link.download = 'sample-employers-liability.pdf';
                    link.click();
                  }}
                >
                  <FileText className="h-4 w-4 mr-2" />
                  Download Sample
                </Button>
              )}
              {uploadDocumentType === 'health_safety' && (
                <Button 
                  variant="outline" 
                  className="w-full"
                  onClick={() => {
                    const link = document.createElement('a');
                    link.href = '/sample-health-safety.pdf';
                    link.download = 'sample-health-safety.pdf';
                    link.click();
                  }}
                >
                  <FileText className="h-4 w-4 mr-2" />
                  Download Sample
                </Button>
              )}
              {uploadDocumentType === 'cis_registration' && (
                <Button 
                  variant="outline" 
                  className="w-full"
                  onClick={() => {
                    const link = document.createElement('a');
                    link.href = '/sample-cis-registration.pdf';
                    link.download = 'sample-cis-registration.pdf';
                    link.click();
                  }}
                >
                  <FileText className="h-4 w-4 mr-2" />
                  Download Sample
                </Button>
              )}
            </div>

            {/* Upload Area */}
            <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-blue-400 transition-colors">
              <Upload className="h-12 w-12 mx-auto mb-4 text-gray-400" />
              <p className="text-lg font-medium text-gray-600 mb-2">
                Drop your document here or click to browse
              </p>
              <p className="text-sm text-gray-500">
                Supports PDF, JPG, PNG files up to 10MB
              </p>
              <Input 
                type="file" 
                className="hidden" 
                accept=".pdf,.jpg,.jpeg,.png"
                onChange={(e) => {
                  // Handle file upload logic here
                  const file = e.target.files?.[0];
                  if (file) {
                    toast({
                      title: "Upload Started",
                      description: `Uploading ${file.name}...`,
                    });
                    // In a real implementation, you'd upload the file here
                    setTimeout(() => {
                      toast({
                        title: "Upload Successful",
                        description: "Document has been uploaded successfully.",
                      });
                      setShowUploadModal(false);
                    }, 2000);
                  }
                }}
              />
              <Button 
                variant="outline" 
                className="mt-4"
                onClick={() => {
                  const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
                  fileInput?.click();
                }}
              >
                Choose File
              </Button>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowUploadModal(false)}>
              Cancel
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
              <label className="text-sm font-medium text-slate-700">Home Post Code *</label>
              <Input
                value={workerForm.postcode}
                onChange={(e) => setWorkerForm({ ...workerForm, postcode: e.target.value.replace(/\s/g, '').toUpperCase() })}
                placeholder="SW1A 1AA"
                maxLength={8}
                data-testid="input-worker-postcode"
                style={{ textTransform: 'uppercase' }}
              />
              <p className="text-xs text-slate-500">Required for CO2 emission calculations</p>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">Vehicle Fuel Type *</label>
              <Select
                value={workerForm.transportMethod}
                onValueChange={(value: "car_diesel" | "car_petrol" | "electric_car" | "public_transport" | "motorcycle") => 
                  setWorkerForm({ ...workerForm, transportMethod: value })
                }
              >
                <SelectTrigger data-testid="select-transport-method">
                  <SelectValue placeholder="Select vehicle type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="car_diesel">🚗 Diesel Car</SelectItem>
                  <SelectItem value="car_petrol">🚗 Petrol Car</SelectItem>
                  <SelectItem value="electric_car">⚡ Electric Car</SelectItem>
                  <SelectItem value="motorcycle">🏍️ Motorcycle</SelectItem>
                  <SelectItem value="public_transport">🚌 Public Transport</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-slate-500">Required for CO2 emission calculations</p>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">Right to Work Status</label>
              <Select
                value={workerForm.rightToWork}
                onValueChange={(value) => setWorkerForm({ ...workerForm, rightToWork: value })}
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
              disabled={!workerForm.firstName || !workerForm.lastName || !workerForm.postcode || !workerForm.transportMethod || createWorkerMutation.isPending}
              className="bg-blue-600 hover:bg-blue-700"
              data-testid="button-save-worker"
            >
              {createWorkerMutation.isPending ? "Adding..." : "Add Worker"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Host Selection Dialog for Contractor Check-in (Same as Visitors) */}
      <Dialog open={showHostSelection} onOpenChange={setShowHostSelection}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Select Host for {selectedWorkerForCheckIn?.firstName} {selectedWorkerForCheckIn?.lastName}</DialogTitle>
            <DialogDescription>
              Choose which staff member will be hosting this contractor worker during their visit today.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-slate-600">
              Who is {selectedWorkerForCheckIn?.firstName} {selectedWorkerForCheckIn?.lastName} working with today?
            </p>
            <div className="space-y-2">
              <Label htmlFor="hostSelection" className="text-sm font-medium text-slate-700">
                Host Staff Member *
              </Label>
              <Select 
                value={selectedHostForWorker} 
                onValueChange={setSelectedHostForWorker}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select host staff member" />
                </SelectTrigger>
                <SelectContent>
                  {staff?.map((member: any) => (
                    <SelectItem key={member.id} value={member.id}>
                      {member.firstName} {member.lastName} - {member.department}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-3 pt-4">
              <Button
                variant="outline"
                onClick={() => {
                  setShowHostSelection(false);
                  setSelectedWorkerForCheckIn(null);
                  setSelectedHostForWorker("");
                }}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button
                onClick={handleHostSelectionConfirm}
                disabled={!selectedHostForWorker}
                className="flex-1 bg-blue-600 hover:bg-blue-700"
                data-testid="button-confirm-host"
              >
                Check In & Send E-Pass
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

        </TabsContent>

        <TabsContent value="assign-hs" className="space-y-6 mt-6">
          <HSDocumentAssignment />
        </TabsContent>

        <TabsContent value="co2-reports" className="space-y-6 mt-6">
          {/* CO2 Sustainability Reports Description */}
          <GlassCard>
            <div className="flex items-start gap-4">
              <div className="w-16 h-16 bg-green-100 rounded-xl flex items-center justify-center shrink-0">
                <Leaf className="text-green-600" size={32} />
              </div>
              <div>
                <h2 className="text-xl font-bold text-fixed mb-2">CO2 Sustainability Reporting</h2>
                <p className="text-variable">
                  Track and reduce your contractor carbon footprint with AI-powered sustainability reports.
                </p>
              </div>
            </div>
          </GlassCard>

          {/* Feature Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <GlassCard>
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center shrink-0">
                  <Car className="text-blue-600" size={20} />
                </div>
                <div>
                  <h3 className="font-semibold text-fixed mb-1">Commute Tracking</h3>
                  <p className="text-sm text-variable">
                    Automatically calculate CO2 emissions from contractor commutes based on their postcode and transport method (diesel, petrol, electric, public transport, motorcycle).
                  </p>
                </div>
              </div>
            </GlassCard>

            <GlassCard>
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center shrink-0">
                  <Sparkles className="text-purple-600" size={20} />
                </div>
                <div>
                  <h3 className="font-semibold text-fixed mb-1">AI-Powered Analysis</h3>
                  <p className="text-sm text-variable">
                    Gemini AI calculates accurate distances between UK postcodes with intelligent route detection (motorway, A-roads, mixed routes) for precise emission estimates.
                  </p>
                </div>
              </div>
            </GlassCard>

            <GlassCard>
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center shrink-0">
                  <TrendingDown className="text-green-600" size={20} />
                </div>
                <div>
                  <h3 className="font-semibold text-fixed mb-1">Actionable Recommendations</h3>
                  <p className="text-sm text-variable">
                    Receive tailored suggestions to reduce emissions: carpooling opportunities, EV incentives, public transport routes, and scheduling optimizations.
                  </p>
                </div>
              </div>
            </GlassCard>

            <GlassCard>
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center shrink-0">
                  <BarChart3 className="text-orange-600" size={20} />
                </div>
                <div>
                  <h3 className="font-semibold text-fixed mb-1">Detailed Reports</h3>
                  <p className="text-sm text-variable">
                    Generate comprehensive sustainability reports with total emissions, per-worker breakdowns, transport method analysis, and historical comparisons.
                  </p>
                </div>
              </div>
            </GlassCard>

            <GlassCard>
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 bg-teal-100 rounded-lg flex items-center justify-center shrink-0">
                  <MapPin className="text-teal-600" size={20} />
                </div>
                <div>
                  <h3 className="font-semibold text-fixed mb-1">UK Postcode Integration</h3>
                  <p className="text-sm text-variable">
                    Simply enter worker postcodes and your site location. Our system handles distance calculations automatically using intelligent UK geography analysis.
                  </p>
                </div>
              </div>
            </GlassCard>

            <GlassCard>
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 bg-indigo-100 rounded-lg flex items-center justify-center shrink-0">
                  <Shield className="text-indigo-600" size={20} />
                </div>
                <div>
                  <h3 className="font-semibold text-fixed mb-1">Multi-Tenant Isolated</h3>
                  <p className="text-sm text-variable">
                    All sustainability data is securely isolated per customer. Reports are stored in your private database with full audit trail and history.
                  </p>
                </div>
              </div>
            </GlassCard>
          </div>

          {/* How It Works Section */}
          <GlassCard>
            <h3 className="text-lg font-semibold text-fixed mb-4 flex items-center gap-2">
              <FileText className="text-blue-600" size={20} />
              How It Works
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="text-center p-4 bg-slate-50 rounded-lg">
                <div className="w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center mx-auto mb-2 font-bold">1</div>
                <p className="text-sm font-medium text-fixed">Add Workers</p>
                <p className="text-xs text-variable mt-1">Enter worker postcode and transport method when adding to contractor</p>
              </div>
              <div className="text-center p-4 bg-slate-50 rounded-lg">
                <div className="w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center mx-auto mb-2 font-bold">2</div>
                <p className="text-sm font-medium text-fixed">Set Site Location</p>
                <p className="text-xs text-variable mt-1">Configure your site postcode in company settings</p>
              </div>
              <div className="text-center p-4 bg-slate-50 rounded-lg">
                <div className="w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center mx-auto mb-2 font-bold">3</div>
                <p className="text-sm font-medium text-fixed">Generate Report</p>
                <p className="text-xs text-variable mt-1">Click generate and AI calculates all emissions automatically</p>
              </div>
              <div className="text-center p-4 bg-slate-50 rounded-lg">
                <div className="w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center mx-auto mb-2 font-bold">4</div>
                <p className="text-sm font-medium text-fixed">Take Action</p>
                <p className="text-xs text-variable mt-1">Review recommendations and implement changes to reduce carbon footprint</p>
              </div>
            </div>
          </GlassCard>

          {/* Benefits Section */}
          <GlassCard className="bg-gradient-to-r from-green-50 to-teal-50 border-green-200">
            <h3 className="text-lg font-semibold text-fixed mb-3 flex items-center gap-2">
              <CheckCircle className="text-green-600" size={20} />
              Benefits for Your Business
            </h3>
            <ul className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm text-variable">
              <li className="flex items-center gap-2">
                <CheckCircle className="text-green-500 shrink-0" size={16} />
                Meet ESG reporting requirements and sustainability targets
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle className="text-green-500 shrink-0" size={16} />
                Reduce operational costs through optimized contractor scheduling
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle className="text-green-500 shrink-0" size={16} />
                Demonstrate environmental responsibility to clients and stakeholders
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle className="text-green-500 shrink-0" size={16} />
                Identify high-emission contractors for targeted improvement
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle className="text-green-500 shrink-0" size={16} />
                Track progress over time with historical report comparison
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle className="text-green-500 shrink-0" size={16} />
                Support Net Zero commitments with data-driven insights
              </li>
            </ul>
          </GlassCard>

          {/* CTA Section */}
          <div className="text-center py-6">
            <p className="text-variable mb-4">
              Ready to track your contractor carbon footprint? Add worker postcodes and transport methods to get started.
            </p>
            <Button 
              onClick={() => setActiveTab("contractors")}
              className="bg-green-600 hover:bg-green-700 text-white"
              data-testid="button-go-to-contractors"
            >
              <Users className="mr-2" size={16} />
              Manage Contractors
            </Button>
          </div>
        </TabsContent>
      </Tabs>

      {/* H&S Compliance View Dialog */}
      <Dialog open={showComplianceView} onOpenChange={setShowComplianceView}>
        <DialogContent className="max-w-7xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-green-600" />
              UK Health & Safety Compliance Management
            </DialogTitle>
          </DialogHeader>
          <ContractorsComplianceView 
            isDialog={true}
            onClose={() => setShowComplianceView(false)}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}