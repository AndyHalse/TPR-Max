import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { queryClient } from "@/lib/queryClient";
import { apiRequest } from "@/lib/queryClient";
import GlassCard from "@/components/GlassCard";
import { StaffSearchSelect } from "@/components/StaffSearchSelect";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandGroup, CommandItem, CommandList } from "@/components/ui/command";
import { cn } from "@/lib/utils";
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
  ShieldOff,
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
  ChevronsUpDown,
  Check,
  LayoutGrid,
  LayoutList,
  Sparkles,
  RotateCcw
} from "lucide-react";
import { WorkerCard } from "@/components/WorkerCard";
import ContractorsComplianceView from "@/components/ContractorsComplianceView";
import HSDocumentAssignment from "@/components/HSDocumentAssignment";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface CompanyComboboxProps {
  value: string;
  onValueChange: (value: string) => void;
  companies: string[];
  placeholder?: string;
  className?: string;
}

function CompanyCombobox({ value, onValueChange, companies, placeholder = "Select or type company...", className }: CompanyComboboxProps) {
  const [open, setOpen] = useState(false);
  const [inputValue, setInputValue] = useState(value);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    setInputValue(value);
  }, [value]);

  const handleSelect = (selectedValue: string) => {
    onValueChange(selectedValue);
    setInputValue(selectedValue);
    setOpen(false);
  };

  const handleInputChange = (newValue: string) => {
    setInputValue(newValue);
    onValueChange(newValue);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    if (newValue.length >= 2) {
      const hasMatches = companies.some(c => c.toLowerCase().startsWith(newValue.toLowerCase()));
      if (hasMatches) {
        timeoutRef.current = setTimeout(() => setOpen(true), 300);
      } else {
        setOpen(false);
      }
    } else {
      setOpen(false);
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter' && inputValue.trim()) {
      event.preventDefault();
      onValueChange(inputValue.trim());
      setOpen(false);
    }
  };

  const filteredCompanies = companies
    .filter(c => c.toLowerCase().includes(inputValue.toLowerCase()))
    .sort((a, b) => {
      const s = inputValue.toLowerCase();
      if (a.toLowerCase() === s) return -1;
      if (b.toLowerCase() === s) return 1;
      const aS = a.toLowerCase().startsWith(s);
      const bS = b.toLowerCase().startsWith(s);
      if (aS && !bS) return -1;
      if (bS && !aS) return 1;
      return a.localeCompare(b);
    })
    .slice(0, 6);

  return (
    <div className="relative">
      <Input
        value={inputValue}
        onChange={(e) => handleInputChange(e.target.value)}
        placeholder={placeholder}
        className={cn("w-full pr-8", className)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={handleKeyDown}
        autoComplete="off"
        data-testid="input-company-name"
      />
      <Button
        variant="ghost"
        size="sm"
        type="button"
        className="absolute right-0 top-0 h-full px-2 hover:bg-transparent"
        onClick={() => setOpen(!open)}
      >
        <ChevronsUpDown className="h-4 w-4 text-variable" />
      </Button>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <div className="absolute inset-0 pointer-events-none" />
        </PopoverTrigger>
        <PopoverContent className="w-full p-2 shadow-lg border border-slate-200" align="start" style={{ width: 'var(--radix-popover-trigger-width)', maxHeight: '320px' }}>
          <Command>
            <CommandList className="max-h-64 overflow-auto">
              {filteredCompanies.length > 0 && (
                <CommandGroup>
                  <div className="px-2 py-1.5 text-xs font-medium text-variable uppercase tracking-wide">Existing Companies</div>
                  {filteredCompanies.map((company) => (
                    <CommandItem key={company} value={company} onSelect={() => handleSelect(company)} className="flex items-center gap-3 px-4 py-3 hover:bg-blue-50 cursor-pointer rounded-md mx-2">
                      <Check className={cn("h-4 w-4 text-blue-600", value === company ? "opacity-100" : "opacity-0")} />
                      <span className="text-fixed truncate">{company}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
              {inputValue.trim() && (
                <CommandGroup>
                  {filteredCompanies.length > 0 && <div className="border-t border-slate-200 my-1" />}
                  <div className="px-2 py-1.5 text-xs font-medium text-green-600 uppercase tracking-wide">Add New</div>
                  <CommandItem value={inputValue} onSelect={() => handleSelect(inputValue.trim())} className="flex items-center gap-3 px-4 py-3 hover:bg-green-50 cursor-pointer rounded-md mx-2">
                    <div className="flex-shrink-0 w-4 h-4 bg-green-100 rounded-full flex items-center justify-center">
                      <span className="text-green-600 text-sm font-bold">+</span>
                    </div>
                    <span className="text-green-700 font-medium truncate">Use "{inputValue.trim()}"</span>
                  </CommandItem>
                </CommandGroup>
              )}
              {filteredCompanies.length === 0 && inputValue.trim() && (
                <div className="px-4 py-6 text-center text-variable">
                  <div className="text-sm mb-1">No existing companies found</div>
                  <div className="text-xs text-variable">Press Enter to add "{inputValue.trim()}" as new company</div>
                </div>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}

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
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('list');
  const [showGapsOnly, setShowGapsOnly] = useState(() => {
    try {
      return localStorage.getItem('contractors_showGapsOnly') === 'true';
    } catch {
      return false;
    }
  });
  const [sortGapsFirst, setSortGapsFirst] = useState(() => {
    try {
      return localStorage.getItem('contractors_sortGapsFirst') === 'true';
    } catch {
      return false;
    }
  });
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
  const [issueCardForm, setIssueCardForm] = useState({ cardType: 'yellow', offenceId: '', description: '' });
  const [showDocumentModal, setShowDocumentModal] = useState(false);
  const [selectedDocument, setSelectedDocument] = useState<any>(null);
  const [documentToDelete, setDocumentToDelete] = useState<any>(null);
  const [showDeleteDocumentConfirm, setShowDeleteDocumentConfirm] = useState(false);
  const [deleteComplianceConfirmed, setDeleteComplianceConfirmed] = useState(false);
  const deleteDocumentConfirmedRef = useRef(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadDocumentType, setUploadDocumentType] = useState('');
  const [companyUploadFile, setCompanyUploadFile] = useState<File | null>(null);
  const [companyUploadFormData, setCompanyUploadFormData] = useState({ expiryDate: '', issuedBy: '', policyNumber: '' });
  const [companyUploadProgress, setCompanyUploadProgress] = useState(0);
  const [companyIsUploading, setCompanyIsUploading] = useState(false);
  const [companyIsScanningDoc, setCompanyIsScanningDoc] = useState(false);
  const [companyAiExtracted, setCompanyAiExtracted] = useState(false);
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

  const contractorCompanyNames = contractors.map(c => c.name).filter(Boolean);

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
  const { data: cardOffences = [] } = useQuery<any[]>({
    queryKey: ["/api/card-offences"],
    enabled: !!currentUser,
  });

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

  const { data: companySettings } = useQuery<any>({ queryKey: ['/api/settings'] });

  const { data: activeLoneWorkers = [] } = useQuery<any[]>({
    queryKey: ['/api/lone-worker/active'],
    refetchInterval: 30000,
    enabled: !!currentUser,
  });

  const startWorkerLoneWorkerMutation = useMutation({
    mutationFn: (id: string) => apiRequest("POST", `/api/contractor-workers/${id}/lone-worker/start`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/lone-worker/active'] });
      queryClient.invalidateQueries({ queryKey: ["/api/contractors", selectedContractor?.id, "workers", customerId] });
    },
    onError: () => toast({ title: "Error", description: "Failed to start lone worker session.", variant: "destructive" }),
  });

  const endWorkerLoneWorkerMutation = useMutation({
    mutationFn: (id: string) => apiRequest("POST", `/api/contractor-workers/${id}/lone-worker/end`, { endedBy: 'supervisor' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/lone-worker/active'] });
      queryClient.invalidateQueries({ queryKey: ["/api/contractors", selectedContractor?.id, "workers", customerId] });
    },
    onError: () => toast({ title: "Error", description: "Failed to end lone worker session.", variant: "destructive" }),
  });

  const getWorkerLoneWorkerSession = (workerId: string) =>
    activeLoneWorkers.find((s: any) => s.personId === workerId && s.personType === 'contractor');

  const contractorData = contractors || [];

  const hasComplianceGap = (contractor: ContractorCompany) => {
    const ds = contractor.documentsStatus;
    if (!ds) return true;
    return ['publicLiability', 'employersLiability', 'healthSafety', 'cisRegistration'].some(
      key => ds[key as keyof typeof ds] === 'missing' || ds[key as keyof typeof ds] === 'expired'
    );
  };

  const filteredContractors = contractorData
    .filter((contractor: ContractorCompany) => {
      const matchesSearch =
        contractor.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        `${contractor.contactFirstName} ${contractor.contactLastName}`.toLowerCase().includes(searchTerm.toLowerCase()) ||
        contractor.email.toLowerCase().includes(searchTerm.toLowerCase());
      if (!matchesSearch) return false;
      if (showGapsOnly && !hasComplianceGap(contractor)) return false;
      return true;
    })
    .sort((a: ContractorCompany, b: ContractorCompany) => {
      if (!sortGapsFirst) return 0;
      const aGap = hasComplianceGap(a) ? 0 : 1;
      const bGap = hasComplianceGap(b) ? 0 : 1;
      return aGap - bGap;
    });

  const gapsCount = contractorData.filter((contractor: ContractorCompany) => {
    const matchesSearch =
      contractor.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      `${contractor.contactFirstName} ${contractor.contactLastName}`.toLowerCase().includes(searchTerm.toLowerCase()) ||
      contractor.email.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesSearch && hasComplianceGap(contractor);
  }).length;

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
    setIssueCardForm({ cardType: 'yellow', offenceId: '', description: '' });
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

  const issueCardMutation = useMutation({
    mutationFn: async (data: { workerId: string; offenceId: string; cardType: string; description: string; contractorId?: string }) => {
      const response = await apiRequest('POST', '/api/card-issues', data);
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Card issued successfully", description: "The safety card has been issued to the worker." });
      setShowIssueCardModal(false);
      setIssueCardForm({ cardType: 'yellow', offenceId: '', description: '' });
      queryClient.invalidateQueries({ queryKey: ["/api/contractors", customerId] });
    },
    onError: (error: any) => {
      toast({ title: "Failed to issue card", description: error.message, variant: "destructive" });
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
    setSelectedHostForWorker("");
    setShowHostSelection(true);
  };
  
  // Handle host selection confirmation
  const handleHostSelectionConfirm = async () => {
    if (!selectedWorkerForCheckIn || !selectedHostForWorker) return;
    
    try {
      const response = await apiRequest("POST", `/api/contractors/workers/${selectedWorkerForCheckIn.id}/checkin`, {
        hostId: selectedHostForWorker
      });
      
      const data = await response.json();
      
      if (data.ePassSent) {
        toast({
          title: "Digital Pass Sent",
          description: `E-Pass has been sent to ${selectedWorkerForCheckIn.email || 'contractor'}. They can use it to check out.`,
          duration: 5000
        });
      } else {
        toast({
          title: "Success",
          description: `${selectedWorkerForCheckIn.firstName} ${selectedWorkerForCheckIn.lastName} checked in successfully`
        });
        setWorkerForCard(selectedWorkerForCheckIn);
        setShowIssueCardModal(true);
      }
      
      setShowHostSelection(false);
      setSelectedWorkerForCheckIn(null);
      setSelectedHostForWorker("");
      
      queryClient.invalidateQueries({ queryKey: ["/api/contractors", customerId] });
      queryClient.invalidateQueries({ queryKey: ["/api/contractors/checked-in"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/muster"] });
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
      
      queryClient.invalidateQueries({
        predicate: (query) => {
          const key = query.queryKey[0];
          return typeof key === 'string' && key.includes('/api/contractors');
        }
      });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/muster"] });
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
    setCompanyUploadFile(null);
    setCompanyUploadFormData({ expiryDate: '', issuedBy: '', policyNumber: '' });
    setCompanyUploadProgress(0);
    setCompanyIsUploading(false);
    setCompanyIsScanningDoc(false);
    setCompanyAiExtracted(false);
    setShowUploadModal(true);
  };

  const scanCompanyDocument = async () => {
    if (!companyUploadFile) return;
    setCompanyIsScanningDoc(true);
    setCompanyAiExtracted(false);
    try {
      const fileData = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result as string;
          const base64 = result.split(',')[1];
          resolve(base64);
        };
        reader.onerror = reject;
        reader.readAsDataURL(companyUploadFile);
      });

      const response = await apiRequest('POST', '/api/contractors/documents/scan', {
        fileData,
        mimeType: companyUploadFile.type || 'application/octet-stream',
        documentType: uploadDocumentType || 'other',
      });
      const data = await response.json();
      const fields = data.fields as { expiryDate: string | null; issuedBy: string | null; policyNumber: string | null };

      setCompanyUploadFormData(prev => ({
        expiryDate: prev.expiryDate || fields.expiryDate || '',
        issuedBy: prev.issuedBy || fields.issuedBy || '',
        policyNumber: prev.policyNumber || fields.policyNumber || '',
      }));
      setCompanyAiExtracted(true);
      toast({ title: 'Scan complete', description: 'Fields have been pre-filled — please verify before saving.' });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unable to scan document';
      toast({ title: 'Scan failed', description: msg, variant: 'destructive' });
    } finally {
      setCompanyIsScanningDoc(false);
    }
  };

  const uploadCompanyDocumentMutation = useMutation({
    mutationFn: async (file: File) => {
      if (!selectedContractor) throw new Error('No contractor selected');

      setCompanyIsUploading(true);
      setCompanyUploadProgress(10);

      const urlResponse = await fetch(`/api/contractors/${selectedContractor.id}/documents/upload-url`, {
        credentials: 'include',
      });
      if (!urlResponse.ok) throw new Error('Failed to get upload URL');
      const { uploadURL } = await urlResponse.json();
      setCompanyUploadProgress(30);

      const uploadResponse = await fetch(uploadURL, {
        method: 'PUT',
        headers: { 'Content-Type': file.type || 'application/octet-stream' },
        body: file,
      });
      if (!uploadResponse.ok) throw new Error('Failed to upload file');
      setCompanyUploadProgress(70);

      const response = await apiRequest('POST', `/api/contractors/${selectedContractor.id}/documents`, {
        documentName: file.name,
        documentType: uploadDocumentType,
        documentUrl: uploadURL.split('?')[0],
        expiryDate: companyUploadFormData.expiryDate || null,
        issuedBy: companyUploadFormData.issuedBy || null,
        policyNumber: companyUploadFormData.policyNumber || null,
      });

      setCompanyUploadProgress(100);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/contractors", selectedContractor?.id, "documents", customerId] });
      queryClient.invalidateQueries({ queryKey: ["/api/contractors", customerId] });
      if (selectedContractor?.id) {
        queryClient.invalidateQueries({ queryKey: [`/api/contractors/${selectedContractor.id}`] });
      }
      toast({ title: 'Upload Successful', description: 'Document has been uploaded and saved.' });
      setShowUploadModal(false);
      setCompanyUploadFile(null);
      setCompanyUploadFormData({ expiryDate: '', issuedBy: '', policyNumber: '' });
      setCompanyUploadProgress(0);
      setCompanyIsUploading(false);
      setCompanyAiExtracted(false);
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : 'Upload failed';
      toast({ title: 'Upload Failed', description: msg, variant: 'destructive' });
      setCompanyIsUploading(false);
      setCompanyUploadProgress(0);
    },
  });

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
      if (selectedContractor?.id) {
        queryClient.invalidateQueries({ queryKey: [`/api/contractors/${selectedContractor.id}`] });
      }
      
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

  const deleteCompanyDocumentMutation = useMutation({
    mutationFn: async (documentId: string) => {
      if (!selectedContractor) throw new Error('No contractor selected');
      return apiRequest('DELETE', `/api/contractors/${selectedContractor.id}/documents/${documentId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/contractors", selectedContractor?.id, "documents", customerId] });
      queryClient.invalidateQueries({ queryKey: ["/api/contractors", customerId] });
      if (selectedContractor?.id) {
        queryClient.invalidateQueries({ queryKey: [`/api/contractors/${selectedContractor.id}`] });
      }
      toast({ title: 'Document Deleted', description: 'The document has been removed.' });
      setShowDocumentModal(false);
      setShowDeleteDocumentConfirm(false);
      setDocumentToDelete(null);
      setDeleteComplianceConfirmed(false);
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : 'Failed to delete document';
      toast({ title: 'Delete Failed', description: msg, variant: 'destructive' });
    },
  });

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
        return <AlertTriangle className="text-variable" size={16} />;
    }
  };

  const REQUIRED_DOC_CATEGORIES: { key: 'publicLiability' | 'employersLiability' | 'healthSafety' | 'cisRegistration'; label: string }[] = [
    { key: 'publicLiability', label: 'Public Liability Insurance' },
    { key: 'employersLiability', label: 'Employers Liability Insurance' },
    { key: 'healthSafety', label: 'Health & Safety Certificate' },
    { key: 'cisRegistration', label: 'CIS Registration' },
  ];

  const getComplianceGapBadge = (documentsStatus: { publicLiability: string; employersLiability: string; healthSafety: string; cisRegistration: string }, onClick?: () => void) => {
    const missing = REQUIRED_DOC_CATEGORIES.filter(({ key }) => {
      const s = documentsStatus[key];
      return s === 'missing' || s === 'expired';
    });
    if (missing.length === 0) return null;
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            role={onClick ? "button" : undefined}
            tabIndex={onClick ? 0 : undefined}
            onClick={onClick}
            onKeyDown={onClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } } : undefined}
            className={`inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700 border border-red-300 flex-shrink-0 ${onClick ? 'cursor-pointer hover:bg-red-200 focus:outline-none focus:ring-2 focus:ring-red-400 focus:ring-offset-1' : 'cursor-default'}`}
          >
            <AlertTriangle size={11} />
            {missing.length} gap{missing.length > 1 ? 's' : ''}
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs">
          <p className="font-semibold mb-1">Compliance Gap Detected</p>
          <p className="text-xs">Missing or expired: {missing.map(c => c.label).join(', ')}</p>
          {onClick && <p className="text-xs mt-1 opacity-75">Click to view documents</p>}
        </TooltipContent>
      </Tooltip>
    );
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
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="contractors" className="flex items-center gap-2">
            <Building2 size={16} />
            Contractors
          </TabsTrigger>
          <TabsTrigger value="assign-hs" className="flex items-center gap-2">
            <Shield size={16} />
            Assign H&S Document
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
        <div className="flex flex-col sm:flex-row gap-4 items-center">
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
          <div className="flex items-center gap-2">
            <Button
              variant={showGapsOnly ? 'default' : 'outline'}
              size="sm"
              onClick={() => setShowGapsOnly(prev => {
                const next = !prev;
                try { localStorage.setItem('contractors_showGapsOnly', String(next)); } catch {}
                return next;
              })}
              className={showGapsOnly ? "bg-red-600 hover:bg-red-700 text-white border-red-600" : "text-red-600 border-red-300 hover:bg-red-50"}
              title="Show only contractors with compliance gaps"
              data-testid="button-filter-gaps-only"
            >
              <AlertTriangle size={14} className="mr-1" />
              Gaps only ({gapsCount})
            </Button>
            <Button
              variant={sortGapsFirst ? 'default' : 'outline'}
              size="sm"
              onClick={() => setSortGapsFirst(prev => {
                const next = !prev;
                try { localStorage.setItem('contractors_sortGapsFirst', String(next)); } catch {}
                return next;
              })}
              className={sortGapsFirst ? "bg-orange-500 hover:bg-orange-600 text-white border-orange-500" : "text-orange-600 border-orange-300 hover:bg-orange-50"}
              title="Sort contractors with compliance gaps to the top"
              data-testid="button-sort-gaps-first"
            >
              <AlertTriangle size={14} className="mr-1" />
              Gaps first
            </Button>
            <div className="flex items-center gap-1">
              <Button
                variant={viewMode === 'grid' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setViewMode('grid')}
                className="h-8 w-8 p-0"
                title="Grid view"
              >
                <LayoutGrid size={14} />
              </Button>
              <Button
                variant={viewMode === 'list' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setViewMode('list')}
                className="h-8 w-8 p-0"
                title="List view"
              >
                <LayoutList size={14} />
              </Button>
            </div>
          </div>
        </div>
      </GlassCard>

      {/* Contractors List */}
      <div className={viewMode === 'grid' ? "grid grid-cols-1 gap-6" : "space-y-2"}>
        {isLoading ? (
          <div className="text-center py-8">
            <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-current border-r-transparent"></div>
            <p className="mt-2 text-variable">Loading contractors...</p>
          </div>
        ) : filteredContractors.map((contractor) => 
          viewMode === 'grid' ? (
            <GlassCard key={contractor.id}>
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center space-x-3">
                      <div className="w-12 h-12 bg-[var(--background)] rounded-lg flex items-center justify-center">
                        <Building2 className="text-variable" size={20} />
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
                            {getComplianceGapBadge(contractor.documentsStatus, () => setLocation(`/contractors/${contractor.id}?tab=documents&filter=missing`))}
                            {getStatusBadge(contractor.status)}
                          </>
                        );
                      })()}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="bg-white/50 p-3 rounded-lg">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-medium text-variable">Public Liability</span>
                        {getDocumentStatusIcon(contractor.documentsStatus.publicLiability)}
                      </div>
                      <span className="text-xs text-variable capitalize">
                        {contractor.documentsStatus.publicLiability}
                      </span>
                    </div>

                    <div className="bg-white/50 p-3 rounded-lg">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-medium text-variable">Employers Liability</span>
                        {getDocumentStatusIcon(contractor.documentsStatus.employersLiability)}
                      </div>
                      <span className="text-xs text-variable capitalize">
                        {contractor.documentsStatus.employersLiability}
                      </span>
                    </div>

                    <div className="bg-white/50 p-3 rounded-lg">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-medium text-variable">Health & Safety</span>
                        {getDocumentStatusIcon(contractor.documentsStatus.healthSafety)}
                      </div>
                      <span className="text-xs text-variable capitalize">
                        {contractor.documentsStatus.healthSafety}
                      </span>
                    </div>

                    <div className="bg-white/50 p-3 rounded-lg">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-medium text-variable">CIS Registration</span>
                        {getDocumentStatusIcon(contractor.documentsStatus.cisRegistration)}
                      </div>
                      <span className="text-xs text-variable capitalize">
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
          ) : (
            (() => {
              const complianceGapBadge = getComplianceGapBadge(contractor.documentsStatus, () => setLocation(`/contractors/${contractor.id}?tab=documents&filter=missing`));
              return (
                <div key={contractor.id} className="bg-white/60 rounded-lg border border-white/30 hover:bg-white/80 transition-all">
                  {/* Info row — full-width so company name is never cut off */}
                  <div className="flex items-center gap-3 px-3 pt-3 pb-1">
                    <div className="w-10 h-10 bg-[var(--background)] rounded-lg flex items-center justify-center flex-shrink-0">
                      <Building2 className="text-variable" size={16} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-fixed text-sm leading-tight">{contractor.name}</p>
                      <div className="flex items-center gap-3 text-xs text-variable mt-0.5">
                        <span className="flex items-center"><Users className="mr-1" size={11} />{contractor.workersCount} workers</span>
                        {contractor.email && <span>{contractor.email}</span>}
                      </div>
                    </div>
                    {/* Desktop: actions inline */}
                    <div className="hidden sm:flex items-center gap-2 flex-shrink-0">
                      {complianceGapBadge}
                      {getStatusBadge(contractor.status)}
                      <Button variant="outline" size="sm" onClick={() => setLocation(`/contractors/${contractor.id}`)} className="h-9 px-3 text-sm">
                        <Users className="mr-1" size={13} />Workers
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => { setSelectedContractor(contractor); setShowWorkersModal(true); }} className="h-9 px-3 text-sm">
                        <UserPlus className="mr-1" size={13} />Add Worker
                      </Button>
                    </div>
                  </div>
                  {/* Mobile: actions as bottom row */}
                  <div className="sm:hidden flex items-center justify-between gap-2 px-3 pb-3 pt-1">
                    <div className="flex items-center gap-2">
                      {complianceGapBadge}
                      {getStatusBadge(contractor.status)}
                    </div>
                    <div className="flex items-center gap-2">
                      <Button variant="outline" size="sm" onClick={() => setLocation(`/contractors/${contractor.id}`)} className="h-9 px-3 text-sm font-medium">
                        <Users className="mr-1" size={13} />Workers
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => { setSelectedContractor(contractor); setShowWorkersModal(true); }} className="h-9 px-3 text-sm font-medium">
                        <UserPlus className="mr-1" size={13} />Add
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })()
          )
        )}
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
              <CompanyCombobox
                value={contractorForm.name}
                onValueChange={(value) => setContractorForm({ ...contractorForm, name: value })}
                companies={contractorCompanyNames}
                placeholder="Type contractor company name..."
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
              <label className="text-sm font-medium text-slate-700">Description</label>
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
              <select
                value={contractorForm.industry}
                onChange={(e) => setContractorForm({ ...contractorForm, industry: e.target.value })}
                data-testid="select-industry"
                className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring appearance-none"
              >
                <option value="">Select industry</option>
                <option value="construction">Construction</option>
                <option value="engineering">Engineering</option>
                <option value="manufacturing">Manufacturing</option>
                <option value="electrical">Electrical</option>
                <option value="plumbing">Plumbing &amp; Heating</option>
                <option value="mechanical">Mechanical</option>
                <option value="roofing">Roofing</option>
                <option value="scaffolding">Scaffolding</option>
                <option value="demolition">Demolition</option>
                <option value="groundworks">Groundworks</option>
                <option value="painting">Painting &amp; Decorating</option>
                <option value="glazing">Glazing</option>
                <option value="security">Security</option>
                <option value="cleaning">Cleaning &amp; Maintenance</option>
                <option value="landscaping">Landscaping</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">CIS Registration Number</label>
              <Input
                value={contractorForm.cisRegistration}
                onChange={(e) => setContractorForm({ ...contractorForm, cisRegistration: e.target.value })}
                placeholder=""
                data-testid="input-cis"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">Status</label>
              <select
                value={contractorForm.status}
                onChange={(e) => setContractorForm({ ...contractorForm, status: e.target.value as "pending" | "approved" | "suspended" })}
                data-testid="select-status"
                className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring appearance-none"
              >
                <option value="pending">Pending Review</option>
                <option value="approved">Approved</option>
                <option value="suspended">Suspended</option>
              </select>
            </div>
            <div className="col-span-2">
              <h3 className="text-sm font-semibold text-slate-700 mb-2">Compliance Documents Expiry Dates</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-xs font-medium text-variable">Public Liability Insurance</label>
                  <Input
                    type="date"
                    value={contractorForm.publicLiabilityExpiry}
                    onChange={(e) => setContractorForm({ ...contractorForm, publicLiabilityExpiry: e.target.value })}
                    data-testid="input-public-liability"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-medium text-variable">Employers Liability Insurance</label>
                  <Input
                    type="date"
                    value={contractorForm.employersLiabilityExpiry}
                    onChange={(e) => setContractorForm({ ...contractorForm, employersLiabilityExpiry: e.target.value })}
                    data-testid="input-employers-liability"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-medium text-variable">Health & Safety Policy</label>
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
              <CompanyCombobox
                value={contractorForm.name}
                onValueChange={(value) => setContractorForm({ ...contractorForm, name: value })}
                companies={contractorCompanyNames}
                placeholder="Type contractor company name..."
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
                <option value="roofing">Roofing</option>
                <option value="landscaping">Landscaping</option>
                <option value="mechanical">Mechanical</option>
                <option value="demolition">Demolition</option>
                <option value="painting">Painting &amp; Decorating</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div className="col-span-2 space-y-2">
              <label className="text-sm font-medium text-slate-700">Description</label>
              <Textarea
                value={contractorForm.description}
                onChange={(e) => setContractorForm({ ...contractorForm, description: e.target.value })}
                placeholder=""
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
          
          {selectedContractor && (() => {
            const requiredCategories: { key: keyof typeof selectedContractor.documentsStatus; label: string }[] = [
              { key: 'publicLiability', label: 'Public Liability Insurance' },
              { key: 'employersLiability', label: 'Employers Liability Insurance' },
              { key: 'healthSafety', label: 'Health & Safety Certificate' },
              { key: 'cisRegistration', label: 'CIS Registration' },
            ];
            const missingCategories = requiredCategories.filter(
              ({ key }) => {
                const s = selectedContractor.documentsStatus[key];
                return s === 'missing' || s === 'expired';
              }
            );
            return (
              <>
                {missingCategories.length > 0 && (
                  <div className="flex items-start gap-3 rounded-lg border border-red-300 bg-red-50 px-4 py-3 mt-4">
                    <AlertTriangle className="h-5 w-5 text-red-600 mt-0.5 shrink-0" />
                    <div>
                      <p className="text-sm font-semibold text-red-800">Compliance Gap Detected</p>
                      <p className="text-sm text-red-700 mt-0.5">
                        The following required documents are missing or expired:{' '}
                        <span className="font-medium">{missingCategories.map(c => c.label).join(', ')}</span>.
                        Please upload and approve the relevant documents to resolve this.
                      </p>
                    </div>
                  </div>
                )}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-4">
                  {/* Company Information */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-slate-700">Company Information</h3>
                <div className="space-y-3">
                  <div>
                    <label className="text-sm font-medium text-variable">Company Name</label>
                    <p className="text-fixed font-medium">{selectedContractor.name}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-variable">Contact Person</label>
                    <p className="text-fixed">{selectedContractor.contactPerson}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-variable">Email</label>
                    <p className="text-fixed">{selectedContractor.email}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-variable">Phone</label>
                    <p className="text-fixed">{selectedContractor.phone}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-variable">Address</label>
                    <p className="text-fixed">{selectedContractor.address}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-variable">Status</label>
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
                    <span className="text-sm font-medium text-variable">Overall Score</span>
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
                                <span className="text-sm text-variable">{label}</span>
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
                  <div className="text-center p-4 bg-[var(--background)] rounded-lg">
                    <Users className="h-8 w-8 mx-auto mb-2 text-blue-600" />
                    <p className="text-2xl font-bold text-fixed">{selectedContractor.workersCount}</p>
                    <p className="text-sm text-variable">Workers Registered</p>
                  </div>
                  <div className="text-center p-4 bg-[var(--background)] rounded-lg">
                    <Calendar className="h-8 w-8 mx-auto mb-2 text-blue-600" />
                    <p className="text-lg font-bold text-fixed">{selectedContractor.lastUpdated}</p>
                    <p className="text-sm text-variable">Last Updated</p>
                  </div>
                  <div className="text-center p-4 bg-[var(--background)] rounded-lg">
                    <Shield className="h-8 w-8 mx-auto mb-2 text-blue-600" />
                    <p className="text-lg font-bold text-fixed">UK Compliant</p>
                    <p className="text-sm text-variable">Health & Safety</p>
                  </div>
                </div>
              </div>
            </div>
              </>
            );
          })()}
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
                {(workers as any[]).length > 0 ? (workers as any[]).map((worker: any) => {
                  const lwSession = getWorkerLoneWorkerSession(worker.id);
                  const lwMinsLeft = lwSession?.nextDeadline ? Math.round((new Date(lwSession.nextDeadline).getTime() - Date.now()) / 60000) : null;
                  const lwOverdue = lwMinsLeft !== null && lwMinsLeft < 0;
                  return (
                    <div key={worker.id} className="flex flex-col gap-2">
                      <WorkerCard
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
                      {lwSession ? (
                        <div className={`flex items-center justify-between border rounded-xl px-3 py-2 ${lwOverdue ? 'bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-700' : 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-700'}`}>
                          <div className="flex items-center gap-2">
                            <Shield className={`h-4 w-4 ${lwOverdue ? 'text-orange-600' : 'text-amber-600 dark:text-amber-400'}`} />
                            <span className={`text-xs font-medium ${lwOverdue ? 'text-orange-700 dark:text-orange-300' : 'text-amber-700 dark:text-amber-300'}`}>Lone Worker</span>
                            <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${lwOverdue ? 'bg-orange-200 text-orange-800 dark:bg-orange-800/60 dark:text-orange-200' : 'bg-amber-100 text-amber-700 dark:bg-amber-800/60 dark:text-amber-200'}`}>
                              {lwMinsLeft !== null ? (lwOverdue ? `${Math.abs(lwMinsLeft)}m overdue` : `next in ${lwMinsLeft}m`) : `${lwSession.minutesSinceStart ?? 0}m ago`}
                            </span>
                          </div>
                          <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-red-600 hover:text-red-700 hover:bg-red-50" onClick={() => endWorkerLoneWorkerMutation.mutate(worker.id)} disabled={endWorkerLoneWorkerMutation.isPending}>
                            <ShieldOff className="h-3.5 w-3.5 mr-1" />End
                          </Button>
                        </div>
                      ) : (worker.isCheckedIn && companySettings?.loneWorkerEnabled) ? (
                        <Button size="sm" variant="outline" className="w-full h-8 text-xs border-amber-200 text-amber-700 hover:bg-amber-50 dark:border-amber-700 dark:text-amber-300" onClick={() => startWorkerLoneWorkerMutation.mutate(worker.id)} disabled={startWorkerLoneWorkerMutation.isPending || !worker.email} title={worker.email ? "Start lone worker protection" : "Worker needs an email address"}>
                          <Shield className="h-3.5 w-3.5 mr-1.5" />Start Lone Worker
                        </Button>
                      ) : null}
                    </div>
                  );
                }) : (
                  <div className="col-span-full text-center py-8">
                    <Users className="h-12 w-12 mx-auto mb-4 text-variable" />
                    <p className="text-variable">No workers found for this contractor.</p>
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
                <h3 className="text-lg font-semibold text-fixed mb-4">Document Management</h3>
                <TooltipProvider>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {documents.map((document: any) => (
                      <Tooltip key={document.id}>
                        <TooltipTrigger asChild>
                          <div 
                            className="border-2 border-slate-200 rounded-lg p-4 hover:border-blue-500 hover:shadow-lg hover:bg-blue-50 transition-all duration-200 cursor-pointer bg-[var(--card)] select-none"
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
                      <div className="text-sm text-variable mb-3">
                        {document.expiryDate ? `Expires: ${new Date(document.expiryDate).toLocaleDateString()}` : 'No expiry date'}
                      </div>
                            <div className="flex gap-2">
                              <Button 
                                variant="outline" 
                                size="sm"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (document.documentUrl) {
                                    window.open(document.documentUrl, '_blank', 'noopener,noreferrer');
                                  }
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
                              <Button
                                variant="outline"
                                size="sm"
                                className="text-red-600 border-red-200 hover:bg-red-50 hover:border-red-400"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setDocumentToDelete(document);
                                  setDeleteComplianceConfirmed(false);
                                  setShowDeleteDocumentConfirm(true);
                                }}
                                data-testid={`button-delete-document-${document.id}`}
                              >
                                <Trash2 className="h-4 w-4 mr-1" />
                                Delete
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
                            className="border-2 border-dashed border-gray-300 rounded-lg p-4 hover:border-blue-400 hover:shadow-lg hover:bg-blue-50 transition-all duration-200 cursor-pointer bg-[var(--background)] select-none"
                            onClick={() => {
                              console.log('Missing document clicked:', docType);
                              handleUploadDocument(docType);
                            }}
                          >
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-medium text-variable">
                          {docType.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')}
                        </span>
                        <Badge className="bg-gray-100 text-gray-600">Missing</Badge>
                      </div>
                      <div className="text-sm text-variable mb-3">Document not uploaded</div>
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
                  <h4 className="text-md font-semibold text-fixed mb-3">Recent Approvals</h4>
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
                            <p className="text-sm text-variable mt-1">"{approval.comments}"</p>
                          )}
                        </div>
                        {approval.approvalStatus === 'approved' ? 
                          <CheckCircle className="h-5 w-5 text-green-600" /> :
                          <X className="h-5 w-5 text-red-600" />
                        }
                      </div>
                    )) : (
                      <div className="text-center py-4 text-variable">
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
              Issue a safety violation card to a contractor worker for non-compliance or safety infractions.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-sm font-medium">Worker</Label>
              <div className="p-2 bg-muted rounded-lg text-sm font-medium">
                {workerForCard?.firstName} {workerForCard?.lastName}
              </div>
            </div>
            
            <div className="space-y-2">
              <Label className="text-sm font-medium">Card Type</Label>
              <select
                value={issueCardForm.cardType}
                onChange={(e) => setIssueCardForm(f => ({ ...f, cardType: e.target.value, offenceId: '' }))}
                data-testid="select-card-type"
                className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring appearance-none"
              >
                <option value="yellow">Yellow Card</option>
                <option value="red">Red Card</option>
              </select>
            </div>
            
            <div className="space-y-2">
              <Label className="text-sm font-medium">Offence</Label>
              {cardOffences.filter((o: any) => o.cardType === issueCardForm.cardType && o.isActive).length === 0 ? (
                <p className="text-xs text-muted-foreground p-2 border rounded-lg bg-muted">
                  No offences configured. Add offences in Settings → Card Offences.
                </p>
              ) : (
                <select
                  value={issueCardForm.offenceId}
                  onChange={(e) => setIssueCardForm(f => ({ ...f, offenceId: e.target.value }))}
                  data-testid="select-offence"
                  className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring appearance-none"
                >
                  <option value="">Select offence</option>
                  {cardOffences
                    .filter((o: any) => o.cardType === issueCardForm.cardType && o.isActive)
                    .map((o: any) => (
                      <option key={o.id} value={o.id}>{o.offenceName}</option>
                    ))}
                </select>
              )}
            </div>
            
            <div className="space-y-2">
              <Label className="text-sm font-medium">Description</Label>
              <Textarea
                placeholder="Describe the incident..."
                className="h-20"
                value={issueCardForm.description}
                onChange={(e) => setIssueCardForm(f => ({ ...f, description: e.target.value }))}
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
              disabled={!issueCardForm.offenceId || !issueCardForm.description || issueCardMutation.isPending}
              onClick={() => {
                if (!workerForCard) return;
                issueCardMutation.mutate({
                  workerId: workerForCard.id,
                  offenceId: issueCardForm.offenceId,
                  cardType: issueCardForm.cardType,
                  description: issueCardForm.description,
                  contractorId: workerForCard.companyId,
                });
              }}
              data-testid="button-issue-card"
              className={issueCardForm.cardType === 'red' ? 'bg-red-600 hover:bg-red-700' : 'bg-yellow-600 hover:bg-yellow-700'}
            >
              {issueCardMutation.isPending ? "Issuing..." : "Issue Card"}
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
                  <h3 className="text-lg font-semibold text-fixed">Personal Information</h3>
                  <div className="space-y-3">
                    <div>
                      <Label className="text-sm font-medium text-variable">Full Name</Label>
                      <p className="text-fixed">{selectedWorker.firstName} {selectedWorker.lastName}</p>
                    </div>
                    <div>
                      <Label className="text-sm font-medium text-variable">Email</Label>
                      <p className="text-fixed">{selectedWorker.email || 'Not provided'}</p>
                    </div>
                    <div>
                      <Label className="text-sm font-medium text-variable">Phone</Label>
                      <p className="text-fixed">{selectedWorker.phone || 'Not provided'}</p>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <h3 className="text-lg font-semibold text-fixed">Work Status</h3>
                  <div className="space-y-3">
                    <div>
                      <Label className="text-sm font-medium text-variable">Right to Work</Label>
                      <Badge className={`${
                        selectedWorker.rightToWork === 'valid' ? 'bg-green-100 text-green-800' :
                        selectedWorker.rightToWork === 'expired' ? 'bg-red-100 text-red-800' :
                        'bg-yellow-100 text-yellow-800'
                      }`}>
                        {selectedWorker.rightToWork || 'Pending'}
                      </Badge>
                    </div>
                    <div>
                      <Label className="text-sm font-medium text-variable">Active Status</Label>
                      <Badge className={selectedWorker.isActive ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}>
                        {selectedWorker.isActive ? 'Active' : 'Inactive'}
                      </Badge>
                    </div>
                    <div>
                      <Label className="text-sm font-medium text-variable">Induction</Label>
                      <Badge className={selectedWorker.inductionCompleted ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}>
                        {selectedWorker.inductionCompleted ? 'Completed' : 'Pending'}
                      </Badge>
                    </div>
                  </div>
                </div>
              </div>

              {/* Certifications */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-fixed">Certifications & Training</h3>
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
                    <p className="text-sm text-variable">{selectedWorker.cscsCard || 'Not provided'}</p>
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
              <h3 className="text-lg font-semibold text-fixed">Personal Information</h3>
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
              <h3 className="text-lg font-semibold text-fixed">Work Status</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="rightToWork">Right to Work Status</Label>
                  <select
                    value={editWorkerForm.rightToWork}
                    onChange={(e) => setEditWorkerForm({...editWorkerForm, rightToWork: e.target.value})}
                    className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring appearance-none"
                  >
                    <option value="valid">Valid</option>
                    <option value="expired">Expired</option>
                    <option value="pending">Pending</option>
                  </select>
                </div>
                <div>
                  <Label htmlFor="cscsStatus">CSCS Status</Label>
                  <select
                    value={editWorkerForm.cscsStatus}
                    onChange={(e) => setEditWorkerForm({...editWorkerForm, cscsStatus: e.target.value})}
                    className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring appearance-none"
                  >
                    <option value="valid">Valid</option>
                    <option value="expired">Expired</option>
                    <option value="expiring">Expiring</option>
                    <option value="missing">Missing</option>
                  </select>
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
              <h3 className="text-lg font-semibold text-fixed">Training & Certifications</h3>
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

      {/* Delete Company Document Confirmation Dialog */}
      {(() => {
        const requiredCategories = ['public_liability', 'employers_liability', 'health_safety', 'cis_registration'];
        const activeStatuses = ['valid', 'approved', 'expiring'];
        const isRequiredCategory = documentToDelete && requiredCategories.includes(documentToDelete.documentType);
        const isBeingDeletedActive = documentToDelete && activeStatuses.includes(documentToDelete.status);
        const otherActiveDocsOfSameType = isRequiredCategory && isBeingDeletedActive
          ? documents.filter((d: any) =>
              d.id !== documentToDelete.id &&
              d.documentType === documentToDelete.documentType &&
              activeStatuses.includes(d.status)
            )
          : [];
        const isSoleActiveDocument = isRequiredCategory && isBeingDeletedActive && otherActiveDocsOfSameType.length === 0;
        const categoryLabel = documentToDelete?.documentType
          ? documentToDelete.documentType.split('_').map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
          : '';

        return (
          <Dialog open={showDeleteDocumentConfirm} onOpenChange={(open) => { setShowDeleteDocumentConfirm(open); if (!open) { if (!deleteDocumentConfirmedRef.current) { setShowDocumentModal(true); } deleteDocumentConfirmedRef.current = false; setDocumentToDelete(null); setDeleteComplianceConfirmed(false); } }}>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-red-600">
                  <Trash2 className="h-5 w-5" />
                  Delete Document
                </DialogTitle>
                <DialogDescription>
                  Are you sure you want to delete <strong>{documentToDelete?.documentName || 'this document'}</strong>? This action cannot be undone and will be logged in the audit trail.
                </DialogDescription>
              </DialogHeader>
              {isSoleActiveDocument && (
                <>
                  <div className="flex items-start gap-3 rounded-md border border-yellow-300 bg-yellow-50 p-3 text-sm text-yellow-800">
                    <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-yellow-600" />
                    <span>
                      <strong>Compliance warning:</strong> This is the only active {categoryLabel} document for this contractor. Deleting it will leave the contractor without a required compliance document and may cause them to fall out of compliance.
                    </span>
                  </div>
                  <label className="flex items-center gap-2 text-sm font-medium text-red-700 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={deleteComplianceConfirmed}
                      onChange={(e) => setDeleteComplianceConfirmed(e.target.checked)}
                      className="h-4 w-4 accent-red-600"
                    />
                    I understand this will create a compliance gap for this contractor
                  </label>
                </>
              )}
              <div className="flex justify-end gap-3 mt-4">
                <Button variant="outline" onClick={() => { setShowDeleteDocumentConfirm(false); setShowDocumentModal(true); setDocumentToDelete(null); setDeleteComplianceConfirmed(false); }}>
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  disabled={deleteCompanyDocumentMutation.isPending || (isSoleActiveDocument && !deleteComplianceConfirmed)}
                  onClick={() => {
                    if (documentToDelete && selectedContractor) {
                      deleteDocumentConfirmedRef.current = true;
                      deleteCompanyDocumentMutation.mutate(documentToDelete.id);
                    }
                  }}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  {deleteCompanyDocumentMutation.isPending ? 'Deleting...' : 'Delete Document'}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        );
      })()}

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
                  <h3 className="text-lg font-semibold text-fixed">Document Information</h3>
                  <div className="space-y-3">
                    <div>
                      <Label className="text-sm font-medium text-variable">Document Type</Label>
                      <p className="text-fixed">{selectedDocument.documentType.split('_').map((word: string) => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')}</p>
                    </div>
                    <div>
                      <Label className="text-sm font-medium text-variable">Status</Label>
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
                      <Label className="text-sm font-medium text-variable">Uploaded</Label>
                      <p className="text-fixed">{new Date(selectedDocument.uploadedAt).toLocaleString()}</p>
                    </div>
                    {selectedDocument.expiryDate && (
                      <div>
                        <Label className="text-sm font-medium text-variable">Expires</Label>
                        <p className="text-fixed">{new Date(selectedDocument.expiryDate).toLocaleDateString()}</p>
                      </div>
                    )}
                  </div>
                </div>

                <div className="space-y-4">
                  <h3 className="text-lg font-semibold text-fixed">Document Actions</h3>
                  <div className="space-y-3">
                    <Button className="w-full" onClick={() => window.open(selectedDocument.documentUrl, '_blank')}>
                      <ExternalLink className="h-4 w-4 mr-2" />
                      View Document
                    </Button>

                    <Button
                      variant="outline"
                      className="w-full text-red-600 border-red-200 hover:bg-red-50 hover:border-red-300"
                      onClick={() => {
                        setDocumentToDelete(selectedDocument);
                        setDeleteComplianceConfirmed(false);
                        setShowDocumentModal(false);
                        setShowDeleteDocumentConfirm(true);
                      }}
                      disabled={deleteCompanyDocumentMutation.isPending}
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Delete Document
                    </Button>
                    
                    {selectedDocument.status !== 'approved' && (
                      <div className="space-y-3 p-4 bg-[var(--background)] rounded-lg">
                        <Label className="text-sm font-medium text-variable">Approval Actions</Label>
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
                <h4 className="text-md font-semibold text-fixed mb-3">Approval History</h4>
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
                          <p className="text-sm text-variable mt-1">"{approval.comments}"</p>
                        )}
                      </div>
                      {approval.approvalStatus === 'approved' ? 
                        <CheckCircle className="h-5 w-5 text-green-600" /> :
                        <X className="h-5 w-5 text-red-600" />
                      }
                    </div>
                  )) : (
                    <div className="text-center py-4 text-variable">
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
      <Dialog open={showUploadModal} onOpenChange={(open) => { if (!companyIsUploading) setShowUploadModal(open); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5" />
              Upload {uploadDocumentType.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')} Document
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 mt-2">
            {/* File Input */}
            <div>
              <Label htmlFor="company-document-file">Select Document</Label>
              <Input
                id="company-document-file"
                type="file"
                accept=".pdf,.jpg,.jpeg,.png"
                onChange={(e) => {
                  setCompanyUploadFile(e.target.files?.[0] || null);
                  setCompanyAiExtracted(false);
                }}
                disabled={companyIsUploading}
                className="cursor-pointer mt-1"
              />
              {companyUploadFile && (
                <div className="mt-2 flex items-center gap-2 flex-wrap">
                  <p className="text-sm text-variable">Selected: {companyUploadFile.name}</p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={scanCompanyDocument}
                    disabled={companyIsScanningDoc || companyIsUploading}
                    className="text-purple-700 border-purple-300 hover:bg-purple-50 dark:text-purple-300 dark:border-purple-700 dark:hover:bg-purple-950"
                  >
                    {companyIsScanningDoc ? (
                      <>
                        <RotateCcw className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                        Scanning…
                      </>
                    ) : (
                      <>
                        <Sparkles className="h-3.5 w-3.5 mr-1.5" />
                        Scan with AI
                      </>
                    )}
                  </Button>
                </div>
              )}
            </div>

            {/* Expiry Date */}
            <div>
              <Label htmlFor="company-expiry-date">Expiry Date (Optional)</Label>
              <Input
                id="company-expiry-date"
                type="date"
                value={companyUploadFormData.expiryDate}
                onChange={(e) => setCompanyUploadFormData(prev => ({ ...prev, expiryDate: e.target.value }))}
                disabled={companyIsUploading}
                className="mt-1"
              />
            </div>

            {/* Issued By */}
            <div>
              <Label htmlFor="company-issued-by">Issued By (Optional)</Label>
              <Input
                id="company-issued-by"
                type="text"
                value={companyUploadFormData.issuedBy}
                onChange={(e) => setCompanyUploadFormData(prev => ({ ...prev, issuedBy: e.target.value }))}
                disabled={companyIsUploading}
                className="mt-1"
              />
            </div>

            {/* Policy Number */}
            <div>
              <Label htmlFor="company-policy-number">Policy / Certificate Number (Optional)</Label>
              <Input
                id="company-policy-number"
                type="text"
                value={companyUploadFormData.policyNumber}
                onChange={(e) => setCompanyUploadFormData(prev => ({ ...prev, policyNumber: e.target.value }))}
                disabled={companyIsUploading}
                className="mt-1"
              />
            </div>

            {/* AI-extracted notice */}
            {companyAiExtracted && (
              <div className="flex items-center gap-1.5 text-xs text-purple-700 dark:text-purple-300 bg-purple-50 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-800 rounded-md px-3 py-2">
                <Sparkles className="h-3.5 w-3.5 shrink-0" />
                AI-extracted — please verify the fields above before saving.
              </div>
            )}

            {/* Progress bar */}
            {companyIsUploading && (
              <div className="space-y-1">
                <div className="flex justify-between text-xs text-variable">
                  <span>Uploading…</span>
                  <span>{companyUploadProgress}%</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${companyUploadProgress}%` }}
                  />
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="mt-4">
            <Button
              variant="outline"
              onClick={() => setShowUploadModal(false)}
              disabled={companyIsUploading}
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (companyUploadFile) {
                  uploadCompanyDocumentMutation.mutate(companyUploadFile);
                } else {
                  toast({ title: 'No file selected', description: 'Please choose a file to upload.', variant: 'destructive' });
                }
              }}
              disabled={!companyUploadFile || companyIsUploading}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              {companyIsUploading ? (
                <>
                  <RotateCcw className="h-4 w-4 mr-2 animate-spin" />
                  Uploading… {companyUploadProgress}%
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4 mr-2" />
                  Upload
                </>
              )}
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
              <label className="text-sm font-medium text-slate-700">Home Post Code *</label>
              <Input
                value={workerForm.postcode}
                onChange={(e) => setWorkerForm({ ...workerForm, postcode: e.target.value.replace(/\s/g, '').toUpperCase() })}
                placeholder=""
                maxLength={8}
                data-testid="input-worker-postcode"
                style={{ textTransform: 'uppercase' }}
              />
              <p className="text-xs text-variable">Required for CO2 emission calculations</p>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">Vehicle Fuel Type *</label>
              <select
                value={workerForm.transportMethod}
                onChange={(e) => setWorkerForm({ ...workerForm, transportMethod: e.target.value as "car_diesel" | "car_petrol" | "electric_car" | "public_transport" | "motorcycle" })}
                data-testid="select-transport-method"
                className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring appearance-none"
              >
                <option value="car_diesel">Diesel Car</option>
                <option value="car_petrol">Petrol Car</option>
                <option value="electric_car">Electric Car</option>
                <option value="motorcycle">Motorcycle</option>
                <option value="public_transport">Public Transport</option>
              </select>
              <p className="text-xs text-variable">Required for CO2 emission calculations</p>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">Right to Work Status</label>
              <select
                value={workerForm.rightToWork}
                onChange={(e) => setWorkerForm({ ...workerForm, rightToWork: e.target.value })}
                data-testid="select-right-to-work"
                className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring appearance-none"
              >
                <option value="valid">Valid</option>
                <option value="pending">Pending Verification</option>
                <option value="expired">Expired</option>
              </select>
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
              <select
                value={workerForm.cscsStatus}
                onChange={(e) => setWorkerForm({ ...workerForm, cscsStatus: e.target.value as "valid" | "expired" | "pending" })}
                data-testid="select-cscs-status"
                className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring appearance-none"
              >
                <option value="valid">Valid</option>
                <option value="expired">Expired</option>
                <option value="pending">Pending</option>
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">IPAF Status</label>
              <select
                value={workerForm.ipafStatus}
                onChange={(e) => setWorkerForm({ ...workerForm, ipafStatus: e.target.value as "none" | "3a" | "3b" | "1+" | "expired" })}
                data-testid="select-ipaf-status"
                className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring appearance-none"
              >
                <option value="none">None</option>
                <option value="3a">3a - Mobile Vertical</option>
                <option value="3b">3b - Mobile Boom</option>
                <option value="1+">1+ - Static Vertical</option>
                <option value="expired">Expired</option>
              </select>
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
        <DialogContent
          className="max-w-md"
          onFocusOutside={(e) => e.preventDefault()}
          onInteractOutside={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle>Select Host for {selectedWorkerForCheckIn?.firstName} {selectedWorkerForCheckIn?.lastName}</DialogTitle>
            <DialogDescription>
              Choose which staff member will be hosting this contractor worker during their visit today.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-variable">
              Who is {selectedWorkerForCheckIn?.firstName} {selectedWorkerForCheckIn?.lastName} working with today?
            </p>
            <div className="space-y-2">
              <Label htmlFor="hostSelection" className="text-sm font-medium text-slate-700">
                Host Staff Member *
              </Label>
              <StaffSearchSelect
                staff={staff ?? []}
                value={selectedHostForWorker}
                onChange={setSelectedHostForWorker}
                placeholder="Search by name or department…"
              />
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