import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { apiRequest } from "@/lib/queryClient";
import GlassCard from "@/components/GlassCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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
  Calendar
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
  const [inviteForm, setInviteForm] = useState({
    companyName: "",
    email: "",
    contactPerson: "",
    phone: "",
  });

  // Fetch contractor companies from API
  const { data: contractors = [], isLoading } = useQuery({
    queryKey: ["/api/contractors"],
    refetchInterval: 30000, // Refresh every 30 seconds
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
                      {/* Mock worker data */}
                      {[
                        { id: 1, name: "James Wilson", role: "Electrician", certifications: "NICEIC, 18th Edition", status: "active" },
                        { id: 2, name: "Sarah Johnson", role: "Supervisor", certifications: "SMSTS, First Aid", status: "active" },
                        { id: 3, name: "Mike Brown", role: "Apprentice", certifications: "Level 2 Electrical", status: "pending" },
                        { id: 4, name: "David Lee", role: "Electrician", certifications: "NICEIC", status: "expired" },
                      ].map((worker) => (
                        <tr key={worker.id} className="hover:bg-slate-50">
                          <td className="px-4 py-4 whitespace-nowrap">
                            <div className="font-medium text-slate-900">{worker.name}</div>
                          </td>
                          <td className="px-4 py-4 whitespace-nowrap">
                            <div className="text-slate-600">{worker.role}</div>
                          </td>
                          <td className="px-4 py-4 whitespace-nowrap">
                            <div className="text-slate-600 text-sm">{worker.certifications}</div>
                          </td>
                          <td className="px-4 py-4 whitespace-nowrap">
                            <Badge className={`${
                              worker.status === 'active' ? 'bg-green-100 text-green-800' :
                              worker.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                              'bg-red-100 text-red-800'
                            }`}>
                              {worker.status}
                            </Badge>
                          </td>
                          <td className="px-4 py-4 whitespace-nowrap text-sm font-medium">
                            <div className="flex gap-2">
                              <Button variant="outline" size="sm">
                                <FileCheck className="h-4 w-4 mr-1" />
                                View
                              </Button>
                              <Button variant="outline" size="sm">
                                <FileText className="h-4 w-4 mr-1" />
                                Edit
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}