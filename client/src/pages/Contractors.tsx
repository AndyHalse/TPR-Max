import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { apiRequest } from "@/lib/queryClient";
import GlassCard from "@/components/GlassCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
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
  User
} from "lucide-react";

interface ContractorCompany {
  id: string;
  name: string;
  email: string;
  phone: string;
  address: string;
  contactPerson: string;
  status: "pending" | "approved" | "suspended";
  complianceScore: number;
  lastUpdated: string;
  workersCount: number;
  documentsStatus: {
    publicLiability: "valid" | "expiring" | "expired" | "missing";
    employersLiability: "valid" | "expiring" | "expired" | "missing";
    healthSafety: "valid" | "expiring" | "expired" | "missing";
    cisRegistration: "valid" | "expiring" | "expired" | "missing";
  };
}

export default function Contractors() {
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState("");
  const [showInviteDialog, setShowInviteDialog] = useState(false);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [showWorkersModal, setShowWorkersModal] = useState(false);
  const [selectedContractor, setSelectedContractor] = useState<ContractorCompany | null>(null);
  const [selectedWorker, setSelectedWorker] = useState<any>(null);
  const [showViewWorkerModal, setShowViewWorkerModal] = useState(false);
  const [showEditWorkerModal, setShowEditWorkerModal] = useState(false);
  const [editWorkerForm, setEditWorkerForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    rightToWorkStatus: "",
    cscsCard: "",
    cscsStatus: "",
    ipafStatus: "",
    asbestosAwareness: false,
    manualHandling: false,
    inductionCompleted: false,
    isActive: true
  });
  const [inviteForm, setInviteForm] = useState({
    companyName: "",
    email: "",
    contactPerson: "",
    phone: "",
  });

  // Fetch contractor companies from API
  const { data: contractors = [], isLoading } = useQuery<ContractorCompany[]>({
    queryKey: ["/api/contractors"],
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  // Fetch workers for selected contractor
  const { data: workers = [] } = useQuery<any[]>({
    queryKey: ["/api/contractors", selectedContractor?.id, "workers"],
    enabled: !!selectedContractor?.id,
    refetchInterval: 30000,
  });

  // Mock data for fallback - will be replaced with API calls
  const mockContractors: ContractorCompany[] = [
    {
      id: "1",
      name: "ABC Electrical Services Ltd",
      email: "contact@abcelectrical.co.uk",
      phone: "+44 1234 567890",
      address: "123 Industrial Estate, Birmingham B1 1AA",
      contactPerson: "John Smith",
      status: "approved",
      complianceScore: 92,
      lastUpdated: "2025-01-20",
      workersCount: 15,
      documentsStatus: {
        publicLiability: "valid",
        employersLiability: "valid",
        healthSafety: "expiring",
        cisRegistration: "valid"
      }
    },
    {
      id: "2",
      name: "Premier Plumbing Solutions",
      email: "admin@premierplumbing.co.uk",
      phone: "+44 1234 567891",
      address: "456 Trade Park, Manchester M1 2BB",
      contactPerson: "Sarah Johnson",
      status: "pending",
      complianceScore: 67,
      lastUpdated: "2025-01-18",
      workersCount: 8,
      documentsStatus: {
        publicLiability: "expired",
        employersLiability: "valid",
        healthSafety: "missing",
        cisRegistration: "valid"
      }
    },
    {
      id: "3",
      name: "Elite Construction Group",
      email: "compliance@eliteconstruction.co.uk",
      phone: "+44 1234 567892",
      address: "789 Business Centre, Leeds LS1 3CC",
      contactPerson: "Mike Thompson",
      status: "approved",
      complianceScore: 98,
      lastUpdated: "2025-01-22",
      workersCount: 45,
      documentsStatus: {
        publicLiability: "valid",
        employersLiability: "valid",
        healthSafety: "valid",
        cisRegistration: "valid"
      }
    }
  ];

  const contractorData = contractors.length > 0 ? contractors : mockContractors;
  const filteredContractors = contractorData.filter((contractor: ContractorCompany) =>
    contractor.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    contractor.contactPerson.toLowerCase().includes(searchTerm.toLowerCase()) ||
    contractor.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleInviteSubmit = () => {
    // TODO: Implement invite API call
    toast({
      title: "Invitation Sent",
      description: `Invitation sent to ${inviteForm.companyName}`,
    });
    setShowInviteDialog(false);
    setInviteForm({ companyName: "", email: "", contactPerson: "", phone: "" });
  };

  const handleViewWorker = (worker: any) => {
    setSelectedWorker(worker);
    setShowViewWorkerModal(true);
  };

  const handleEditWorker = (worker: any) => {
    setSelectedWorker(worker);
    setEditWorkerForm({
      firstName: worker.firstName || "",
      lastName: worker.lastName || "",
      email: worker.email || "",
      phone: worker.phone || "",
      rightToWorkStatus: worker.rightToWork || "",
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
      return await apiRequest(`/api/workers/${selectedWorker.id}`, "PUT", workerData);
    },
    onSuccess: () => {
      toast({
        title: "Worker Updated",
        description: "Worker information has been updated successfully.",
      });
      setShowEditWorkerModal(false);
      queryClient.invalidateQueries({ queryKey: ["/api/contractors"] });
    },
    onError: (error: any) => {
      toast({
        title: "Update Failed",
        description: error.message || "Failed to update worker",
        variant: "destructive",
      });
    },
  });

  const handleUpdateWorker = () => {
    updateWorkerMutation.mutate(editWorkerForm);
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
    <div className="space-y-6 pt-20 pb-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center space-x-3">
          <div className="w-12 h-12 gradient-blue rounded-xl flex items-center justify-center">
            <HardHat className="text-white" size={24} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-800">Contractor Management</h1>
            <p className="text-slate-600">Manage contractor companies and compliance</p>
          </div>
        </div>
        <Button 
          onClick={() => setShowInviteDialog(true)}
          className="bg-blue-600 hover:bg-blue-700 text-white"
          data-testid="button-invite-contractor"
        >
          <Plus className="mr-2" size={16} />
          Invite Contractor
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <GlassCard>
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
              <Building2 className="text-blue-600" size={20} />
            </div>
            <div>
              <p className="text-slate-600 text-sm">Total Contractors</p>
              <p className="text-2xl font-bold text-slate-800">{mockContractors.length}</p>
            </div>
          </div>
        </GlassCard>

        <GlassCard>
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
              <CheckCircle className="text-green-600" size={20} />
            </div>
            <div>
              <p className="text-slate-600 text-sm">Approved</p>
              <p className="text-2xl font-bold text-slate-800">
                {mockContractors.filter(c => c.status === "approved").length}
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
              <p className="text-slate-600 text-sm">Pending Review</p>
              <p className="text-2xl font-bold text-slate-800">
                {mockContractors.filter(c => c.status === "pending").length}
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
              <p className="text-slate-600 text-sm">Compliance Issues</p>
              <p className="text-2xl font-bold text-slate-800">
                {mockContractors.filter(c => c.complianceScore < 80).length}
              </p>
            </div>
          </div>
        </GlassCard>
      </div>

      {/* Search and Filters */}
      <GlassCard>
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" size={16} />
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
            <p className="mt-2 text-slate-600">Loading contractors...</p>
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
                      <h3 className="font-semibold text-slate-800">{contractor.name}</h3>
                      <div className="flex items-center space-x-4 text-sm text-slate-600">
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
                    {getComplianceIcon(contractor.complianceScore)}
                    <span className="text-sm font-medium text-slate-700">{contractor.complianceScore}%</span>
                    {getStatusBadge(contractor.status)}
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

              <div className="flex flex-col gap-2 lg:w-48">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setSelectedContractor(contractor);
                    setShowDetailsModal(true);
                  }}
                  className="w-full"
                  data-testid={`button-view-contractor-${contractor.id}`}
                >
                  <FileCheck className="mr-2" size={14} />
                  View Details
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setSelectedContractor(contractor);
                    setShowWorkersModal(true);
                  }}
                  className="w-full"
                  data-testid={`button-manage-workers-${contractor.id}`}
                >
                  <Users className="mr-2" size={14} />
                  Manage Workers
                </Button>
              </div>
            </div>
          </GlassCard>
        ))}
      </div>

      {/* Invite Contractor Dialog */}
      <Dialog open={showInviteDialog} onOpenChange={setShowInviteDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Invite Contractor Company</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">Company Name</label>
              <Input
                value={inviteForm.companyName}
                onChange={(e) => setInviteForm({ ...inviteForm, companyName: e.target.value })}
                placeholder="Enter company name"
                data-testid="input-company-name"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">Email Address</label>
              <Input
                type="email"
                value={inviteForm.email}
                onChange={(e) => setInviteForm({ ...inviteForm, email: e.target.value })}
                placeholder="admin@company.co.uk"
                data-testid="input-email"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">Contact Person</label>
              <Input
                value={inviteForm.contactPerson}
                onChange={(e) => setInviteForm({ ...inviteForm, contactPerson: e.target.value })}
                placeholder="John Smith"
                data-testid="input-contact-person"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">Phone Number</label>
              <Input
                type="tel"
                value={inviteForm.phone}
                onChange={(e) => setInviteForm({ ...inviteForm, phone: e.target.value })}
                placeholder="+44 1234 567890"
                data-testid="input-phone"
              />
            </div>
          </div>
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => setShowInviteDialog(false)}
              data-testid="button-cancel-invite"
            >
              Cancel
            </Button>
            <Button 
              onClick={handleInviteSubmit}
              disabled={!inviteForm.companyName || !inviteForm.email}
              className="bg-blue-600 hover:bg-blue-700"
              data-testid="button-send-invite"
            >
              Send Invitation
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
                      <div className={`w-3 h-3 rounded-full ${
                        selectedContractor.complianceScore >= 90 ? 'bg-green-500' :
                        selectedContractor.complianceScore >= 75 ? 'bg-yellow-500' : 'bg-red-500'
                      }`} />
                      <span className="font-semibold">{selectedContractor.complianceScore}%</span>
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <h4 className="text-sm font-semibold text-slate-700">Document Status</h4>
                    {Object.entries({
                      publicLiability: "Public Liability Insurance",
                      employersLiability: "Employers Liability Insurance", 
                      healthSafety: "Health & Safety Certificate",
                      cisRegistration: "CIS Registration"
                    }).map(([key, label]) => {
                      const status = selectedContractor.documentsStatus[key as keyof typeof selectedContractor.documentsStatus];
                      return (
                        <div key={key} className="flex items-center justify-between">
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
                      );
                    })}
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
        <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Manage Workers: {selectedContractor?.name}
            </DialogTitle>
          </DialogHeader>

          {selectedContractor && (
            <div className="mt-4 space-y-4">
              {/* Workers Statistics */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="text-center p-4 bg-blue-50 rounded-lg">
                  <Users className="h-6 w-6 mx-auto mb-2 text-blue-600" />
                  <p className="text-xl font-bold text-blue-800">{selectedContractor.workersCount}</p>
                  <p className="text-sm text-blue-600">Total Workers</p>
                </div>
                <div className="text-center p-4 bg-green-50 rounded-lg">
                  <CheckCircle className="h-6 w-6 mx-auto mb-2 text-green-600" />
                  <p className="text-xl font-bold text-green-800">12</p>
                  <p className="text-sm text-green-600">Certified</p>
                </div>
                <div className="text-center p-4 bg-yellow-50 rounded-lg">
                  <Clock className="h-6 w-6 mx-auto mb-2 text-yellow-600" />
                  <p className="text-xl font-bold text-yellow-800">2</p>
                  <p className="text-sm text-yellow-600">Pending</p>
                </div>
                <div className="text-center p-4 bg-red-50 rounded-lg">
                  <AlertTriangle className="h-6 w-6 mx-auto mb-2 text-red-600" />
                  <p className="text-xl font-bold text-red-800">1</p>
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

              {/* Workers Table */}
              <div className="border rounded-lg overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                          Worker Name
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                          Role
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                          Certifications
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                          Status
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-slate-200">
                      {(workers as any[]).length > 0 ? (workers as any[]).map((worker: any) => (
                        <tr key={worker.id} className="hover:bg-slate-50">
                          <td className="px-4 py-4 whitespace-nowrap">
                            <div className="font-medium text-slate-900">{worker.firstName} {worker.lastName}</div>
                            {worker.email && <div className="text-sm text-slate-500">{worker.email}</div>}
                          </td>
                          <td className="px-4 py-4 whitespace-nowrap">
                            <div className="text-slate-600">
                              {worker.cscsCard ? "Certified Worker" : "General Worker"}
                            </div>
                          </td>
                          <td className="px-4 py-4 whitespace-nowrap">
                            <div className="text-slate-600 text-sm">
                              {[
                                worker.cscsStatus === 'valid' && worker.cscsCard && `CSCS: ${worker.cscsCard}`,
                                worker.ipafStatus === 'valid' && 'IPAF',
                                worker.asbestosAwareness && 'Asbestos Awareness',
                                worker.manualHandling && 'Manual Handling'
                              ].filter(Boolean).join(', ') || 'No certifications'}
                            </div>
                          </td>
                          <td className="px-4 py-4 whitespace-nowrap">
                            <Badge className={`${
                              worker.isActive && worker.inductionCompleted && worker.rightToWork === 'valid' ? 'bg-green-100 text-green-800' :
                              !worker.inductionCompleted ? 'bg-yellow-100 text-yellow-800' :
                              'bg-red-100 text-red-800'
                            }`}>
                              {worker.isActive && worker.inductionCompleted && worker.rightToWork === 'valid' ? 'Active' :
                               !worker.inductionCompleted ? 'Pending' : 'Inactive'}
                            </Badge>
                          </td>
                          <td className="px-4 py-4 whitespace-nowrap text-sm font-medium">
                            <div className="flex gap-2">
                              <Button 
                                variant="outline" 
                                size="sm"
                                onClick={() => handleViewWorker(worker)}
                                data-testid={`button-view-worker-${worker.id}`}
                              >
                                <FileCheck className="h-4 w-4 mr-1" />
                                View
                              </Button>
                              <Button 
                                variant="outline" 
                                size="sm"
                                onClick={() => handleEditWorker(worker)}
                                data-testid={`button-edit-worker-${worker.id}`}
                              >
                                <FileText className="h-4 w-4 mr-1" />
                                Edit
                              </Button>
                            </div>
                          </td>
                        </tr>
                      )) : (
                        <tr>
                          <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                            No workers found for this contractor
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Document Management Section */}
              <div className="mt-8">
                <h3 className="text-lg font-semibold text-slate-800 mb-4">Document Management</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Public Liability */}
                  <div className="border rounded-lg p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-medium">Public Liability</span>
                      <Badge className="bg-green-100 text-green-800">Valid</Badge>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm">
                        <FileText className="h-4 w-4 mr-1" />
                        View
                      </Button>
                      <Button variant="outline" size="sm" className="text-green-600 border-green-600">
                        <CheckCircle className="h-4 w-4 mr-1" />
                        Approve
                      </Button>
                    </div>
                  </div>

                  {/* Employers Liability */}
                  <div className="border rounded-lg p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-medium">Employers Liability</span>
                      <Badge className="bg-green-100 text-green-800">Valid</Badge>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm">
                        <FileText className="h-4 w-4 mr-1" />
                        View
                      </Button>
                      <Button variant="outline" size="sm" className="text-green-600 border-green-600">
                        <CheckCircle className="h-4 w-4 mr-1" />
                        Approve
                      </Button>
                    </div>
                  </div>

                  {/* Health & Safety */}
                  <div className="border rounded-lg p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-medium">Health & Safety</span>
                      <Badge className="bg-yellow-100 text-yellow-800">Expiring</Badge>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm">
                        <FileText className="h-4 w-4 mr-1" />
                        View
                      </Button>
                      <Button variant="outline" size="sm" className="text-yellow-600 border-yellow-600">
                        <Clock className="h-4 w-4 mr-1" />
                        Review
                      </Button>
                    </div>
                  </div>

                  {/* CIS Registration */}
                  <div className="border rounded-lg p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-medium">CIS Registration</span>
                      <Badge className="bg-green-100 text-green-800">Valid</Badge>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm">
                        <FileText className="h-4 w-4 mr-1" />
                        View
                      </Button>
                      <Button variant="outline" size="sm" className="text-green-600 border-green-600">
                        <CheckCircle className="h-4 w-4 mr-1" />
                        Approve
                      </Button>
                    </div>
                  </div>
                </div>

                {/* Approval History */}
                <div className="mt-6">
                  <h4 className="text-md font-semibold text-slate-800 mb-3">Recent Approvals</h4>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between p-3 bg-green-50 rounded-lg">
                      <div>
                        <span className="font-medium text-green-800">Public Liability approved</span>
                        <p className="text-sm text-green-600">by Andy Smith on 24 Aug 2025 at 19:15</p>
                      </div>
                      <CheckCircle className="h-5 w-5 text-green-600" />
                    </div>
                    <div className="flex items-center justify-between p-3 bg-green-50 rounded-lg">
                      <div>
                        <span className="font-medium text-green-800">Employers Liability approved</span>
                        <p className="text-sm text-green-600">by Andy Smith on 24 Aug 2025 at 19:14</p>
                      </div>
                      <CheckCircle className="h-5 w-5 text-green-600" />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
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
                    value={editWorkerForm.rightToWorkStatus} 
                    onValueChange={(value) => setEditWorkerForm({...editWorkerForm, rightToWorkStatus: value})}
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
    </div>
  );
}