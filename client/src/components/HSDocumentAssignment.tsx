import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { 
  Users, 
  FileText, 
  Send, 
  Building2,
  Shield,
  Search,
  Plus
} from "lucide-react";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { ContractorCompany, ContractorWorker, UkHSDocumentTemplate, WorkerDocumentAssignment } from "@shared/schema";

// API Response Types
interface AssignDocumentsResponse {
  assignmentsCreated: number;
  message: string;
}

// Glass card component
const GlassCard = ({ children, className = "" }: { children: React.ReactNode; className?: string }) => (
  <Card className={`backdrop-blur-sm bg-white/80 border-white/30 shadow-lg ${className}`}>
    <div className="p-6">{children}</div>
  </Card>
);

interface HSDocumentAssignmentProps {
  onNavigateToTab?: (tab: string) => void;
}

export default function HSDocumentAssignment({ onNavigateToTab }: HSDocumentAssignmentProps = {}) {
  const { toast } = useToast();
  const [selectedWorkers, setSelectedWorkers] = useState<string[]>([]);
  const [selectedDocuments, setSelectedDocuments] = useState<string[]>([]);
  const [showAssignDialog, setShowAssignDialog] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterCompany, setFilterCompany] = useState("all");
  
  // Get current user for customer isolation and admin access control
  const { data: currentUser, isError: authError } = useQuery<{ id: string; username: string; customerId: string; role?: string }>({
    queryKey: ["/api/auth/me"],
    retry: false, // Don't retry if auth fails
    staleTime: 5000,
  });

  // Secure customer ID - no fallback for production security
  const customerId = currentUser?.customerId;

  // Get current staff member to check access level for admin enforcement
  const { data: currentStaff } = useQuery<{ accessLevel: string; firstName: string; lastName: string }>({
    queryKey: ["/api/staff/me", customerId],
    enabled: !!currentUser, // Use currentUser instead of customerId to avoid conditional hooks
    retry: false,
    staleTime: 5000,
  });

  // Fetch contractor companies with customer isolation
  // Enable queries even in development mode when auth fails
  const { data: contractors = [], isLoading: contractorsLoading } = useQuery<ContractorCompany[]>({
    queryKey: ["/api/contractors", customerId],
    enabled: !!currentUser || authError, // Allow queries in development mode when auth fails
    refetchInterval: 30000,
  });

  // Fetch all workers with customer isolation
  const { data: allWorkers = [], isLoading: workersLoading } = useQuery<ContractorWorker[]>({
    queryKey: ["/api/contractors/workers/all", customerId],
    enabled: !!currentUser || authError, // Allow queries in development mode when auth fails
    refetchInterval: 30000,
  });

  // Fetch UK H&S document templates with customer isolation
  const { data: documentTemplates = [], isLoading: templatesLoading } = useQuery<UkHSDocumentTemplate[]>({
    queryKey: ["/api/uk-hs-documents/templates", customerId],
    enabled: !!currentUser || authError, // Allow queries in development mode when auth fails
    refetchInterval: 30000,
  });

  // Get all assignments for statistics with customer isolation
  const { data: allAssignments = [] } = useQuery<WorkerDocumentAssignment[]>({
    queryKey: ["/api/uk-hs-documents/assignments/all", customerId],
    enabled: !!currentUser || authError, // Allow queries in development mode when auth fails
    refetchInterval: 30000,
  });

  // Filter workers based on search term and company filter
  const filteredWorkers = allWorkers.filter(worker => {
    const matchesSearch = `${worker.firstName} ${worker.lastName}`.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         worker.email?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCompany = filterCompany === "all" || worker.companyId === filterCompany;
    return matchesSearch && matchesCompany;
  });

  // Document assignment mutation
  const assignDocumentsMutation = useMutation<AssignDocumentsResponse, Error, { workerIds: string[], documentTemplateIds: string[], dueDate?: string }>({
    mutationFn: async (data: { workerIds: string[], documentTemplateIds: string[], dueDate?: string }) => {
      return await apiRequest("POST", "/api/uk-hs-documents/assign", data) as unknown as AssignDocumentsResponse;
    },
    onSuccess: (data) => {
      toast({
        title: "Documents Assigned",
        description: `Successfully assigned ${data.assignmentsCreated} documents to workers`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/uk-hs-documents/assignments/all", customerId] });
      setSelectedWorkers([]);
      setSelectedDocuments([]);
      setShowAssignDialog(false);
    },
    onError: (error: any) => {
      toast({
        title: "Assignment Failed",
        description: error.message || "Failed to assign documents",
        variant: "destructive",
      });
    },
  });

  const handleAssignDocuments = () => {
    if (selectedWorkers.length === 0 || selectedDocuments.length === 0) {
      toast({
        title: "Selection Required",
        description: "Please select both workers and documents to assign",
        variant: "destructive",
      });
      return;
    }

    assignDocumentsMutation.mutate({
      workerIds: selectedWorkers,
      documentTemplateIds: selectedDocuments,
    });
  };

  const toggleWorkerSelection = (workerId: string) => {
    setSelectedWorkers(prev => 
      prev.includes(workerId) 
        ? prev.filter(id => id !== workerId)
        : [...prev, workerId]
    );
  };

  const toggleDocumentSelection = (documentId: string) => {
    setSelectedDocuments(prev => 
      prev.includes(documentId)
        ? prev.filter(id => id !== documentId)
        : [...prev, documentId]
    );
  };

  const selectAllDocuments = () => {
    setSelectedDocuments(documentTemplates.map((doc) => doc.id));
  };

  const clearDocumentSelection = () => {
    setSelectedDocuments([]);
  };

  // Check if user has admin/supervisor access for H&S management (after all hooks)
  const hasAdminAccess = currentUser?.role === 'admin' || 
                        currentStaff?.accessLevel === 'admin' || 
                        currentStaff?.accessLevel === 'supervisor';
  
  // Show loading state only when data is loading (not auth failure)
  if (contractorsLoading || workersLoading || templatesLoading) {
    return (
      <div className="space-y-6">
        <GlassCard>
          <div className="text-center py-8">
            <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-current border-r-transparent"></div>
            <p className="mt-2 text-slate-600">Loading UK H&S management system...</p>
            {authError && (
              <p className="mt-1 text-xs text-orange-600">
                Using development mode - Auth unavailable
              </p>
            )}
          </div>
        </GlassCard>
      </div>
    );
  }

  // Show access denied if user doesn't have proper permissions (after loading check)
  if (!hasAdminAccess && !authError) {
    return (
      <div className="space-y-6">
        <GlassCard>
          <div className="text-center py-8">
            <Shield className="w-12 h-12 text-red-500 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-slate-900 mb-2">Access Restricted</h3>
            <p className="text-slate-600">
              UK Health & Safety compliance management requires administrator or supervisor access.
            </p>
            <p className="text-sm text-slate-500 mt-2">
              Contact your system administrator if you need access to this feature.
            </p>
          </div>
        </GlassCard>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <GlassCard>
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h3 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
              <Shield className="w-5 h-5 text-green-600" />
              UK Health & Safety Compliance Management
            </h3>
            <p className="text-sm text-slate-600 mt-1">
              Assign and track UK H&S compliance documents for contractor workers
            </p>
          </div>
          <div className="flex gap-2">
            <Button 
              onClick={() => setShowAssignDialog(true)}
              className="bg-blue-600 hover:bg-blue-700 text-white"
              data-testid="button-assign-documents"
            >
              <Plus className="mr-2" size={16} />
              Assign Documents
            </Button>
          </div>
        </div>
      </GlassCard>

      {/* Statistics Overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div 
          className="cursor-pointer hover:scale-105 transition-transform" 
          onClick={() => onNavigateToTab && onNavigateToTab('templates')}
          data-testid="card-document-templates"
        >
          <GlassCard className="p-4 hover:bg-white/90 transition-colors">
            <div className="flex items-center gap-3">
              <FileText className="w-8 h-8 text-blue-600" />
              <div>
                <p className="text-2xl font-bold text-slate-800">{documentTemplates.length}</p>
                <p className="text-sm text-slate-600">Document Templates</p>
              </div>
            </div>
          </GlassCard>
        </div>
        
        <div 
          className="cursor-pointer hover:scale-105 transition-transform" 
          onClick={() => onNavigateToTab && onNavigateToTab('contractors')}
          data-testid="card-contractor-companies"
        >
          <GlassCard className="p-4 hover:bg-white/90 transition-colors">
            <div className="flex items-center gap-3">
              <Building2 className="w-8 h-8 text-purple-600" />
              <div>
                <p className="text-2xl font-bold text-slate-800">{contractors.length}</p>
                <p className="text-sm text-slate-600">Contractor Companies</p>
              </div>
            </div>
          </GlassCard>
        </div>
        
        <div 
          className="cursor-pointer hover:scale-105 transition-transform" 
          onClick={() => onNavigateToTab && onNavigateToTab('previous')}
          data-testid="card-total-workers"
        >
          <GlassCard className="p-4 hover:bg-white/90 transition-colors">
            <div className="flex items-center gap-3">
              <Users className="w-8 h-8 text-green-600" />
              <div>
                <p className="text-2xl font-bold text-slate-800">{allWorkers.length}</p>
                <p className="text-sm text-slate-600">Total Workers</p>
              </div>
            </div>
          </GlassCard>
        </div>
        
        <div 
          className="cursor-pointer hover:scale-105 transition-transform" 
          onClick={() => onNavigateToTab && onNavigateToTab('assignments')}
          data-testid="card-total-assignments"
        >
          <GlassCard className="p-4 hover:bg-white/90 transition-colors">
            <div className="flex items-center gap-3">
              <Send className="w-8 h-8 text-orange-600" />
              <div>
                <p className="text-2xl font-bold text-slate-800">{allAssignments.length}</p>
                <p className="text-sm text-slate-600">Total Assignments</p>
              </div>
            </div>
          </GlassCard>
        </div>
      </div>

      {/* Document Assignment Dialog */}
      <Dialog open={showAssignDialog} onOpenChange={setShowAssignDialog}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="h-5 w-5" />
              Assign UK H&S Documents
            </DialogTitle>
          </DialogHeader>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Workers Selection */}
            <div className="space-y-4">
              <div>
                <Label className="text-sm font-medium">Select Workers</Label>
                <div className="mt-2 space-y-2">
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" size={16} />
                      <Input
                        placeholder="Search workers..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pl-10"
                        data-testid="input-search-workers"
                      />
                    </div>
                    <Select value={filterCompany} onValueChange={setFilterCompany}>
                      <SelectTrigger className="w-48" data-testid="select-filter-company">
                        <SelectValue placeholder="Filter by company" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Companies</SelectItem>
                        {contractors.map((company) => (
                          <SelectItem key={company.id} value={company.id}>
                            {company.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
              
              <div className="max-h-64 overflow-y-auto space-y-2">
                {filteredWorkers.map((worker) => (
                  <div
                    key={worker.id}
                    className="flex items-center space-x-3 p-2 rounded-lg hover:bg-slate-50"
                  >
                    <Checkbox
                      checked={selectedWorkers.includes(worker.id)}
                      onCheckedChange={() => toggleWorkerSelection(worker.id)}
                      data-testid={`checkbox-worker-${worker.id}`}
                    />
                    <div className="flex-1">
                      <p className="font-medium text-sm">{worker.firstName} {worker.lastName}</p>
                      <p className="text-xs text-slate-600">{worker.email}</p>
                    </div>
                  </div>
                ))}
              </div>
              
              <p className="text-sm text-slate-600">
                Selected: {selectedWorkers.length} workers
              </p>
            </div>

            {/* Documents Selection */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">Select Documents</Label>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={selectAllDocuments} data-testid="button-select-all-documents">
                    Select All
                  </Button>
                  <Button size="sm" variant="outline" onClick={clearDocumentSelection} data-testid="button-clear-all-documents">
                    Clear All
                  </Button>
                </div>
              </div>
              
              <div className="space-y-2">
                {documentTemplates.map((template) => (
                  <div
                    key={template.id}
                    className="flex items-start space-x-3 p-3 rounded-lg hover:bg-slate-50 border border-slate-200"
                  >
                    <Checkbox
                      checked={selectedDocuments.includes(template.id)}
                      onCheckedChange={() => toggleDocumentSelection(template.id)}
                      className="mt-1"
                      data-testid={`checkbox-document-${template.id}`}
                    />
                    <div className="flex-1">
                      <p className="font-medium text-sm">{template.documentName}</p>
                      <p className="text-xs text-slate-600 mb-2">{template.complianceCategory}</p>
                      {template.autoFillFields && template.autoFillFields.length > 0 && (
                        <Badge variant="secondary" className="text-xs">
                          Auto-fill enabled
                        </Badge>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              
              <p className="text-sm text-slate-600">
                Selected: {selectedDocuments.length} documents
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAssignDialog(false)} data-testid="button-cancel-assign">
              Cancel
            </Button>
            <Button 
              onClick={handleAssignDocuments}
              disabled={assignDocumentsMutation.isPending || selectedWorkers.length === 0 || selectedDocuments.length === 0}
              className="bg-blue-600 hover:bg-blue-700 text-white"
              data-testid="button-confirm-assign"
            >
              {assignDocumentsMutation.isPending ? "Assigning..." : "Assign Documents"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}