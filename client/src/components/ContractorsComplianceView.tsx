import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { 
  Users, 
  FileText, 
  Mail, 
  Send, 
  CheckCircle, 
  Clock, 
  AlertTriangle, 
  Building2,
  Shield,
  Search,
  Eye,
  BarChart3,
  Calendar,
  RefreshCw
} from "lucide-react";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { ContractorCompany, ContractorWorker, UkHSDocumentTemplate, WorkerDocumentAssignment } from "@shared/schema";

// API Response Types
interface SendEmailsResponse {
  emailsSent: number;
  message: string;
}

interface AssignmentWithDetails {
  assignment: WorkerDocumentAssignment;
  worker: ContractorWorker;
  template: UkHSDocumentTemplate;
  company: ContractorCompany;
}

// Glass card component
const GlassCard = ({ children, className = "" }: { children: React.ReactNode; className?: string }) => (
  <Card className={`backdrop-blur-sm bg-white/80 border-white/30 shadow-lg ${className}`}>
    <div className="p-6">{children}</div>
  </Card>
);

interface ContractorsComplianceViewProps {
  initialCompanyId?: string;
  isDialog?: boolean;
  onClose?: () => void;
}

export default function ContractorsComplianceView({ 
  initialCompanyId, 
  isDialog = true, 
  onClose 
}: ContractorsComplianceViewProps) {
  const { toast } = useToast();
  const [selectedCompany, setSelectedCompany] = useState<ContractorCompany | null>(null);
  const [searchTerm, setSearchTerm] = useState("");

  // Get current user for customer isolation with fallback handling
  const { data: currentUser, isError: authError } = useQuery<{ id: string; username: string; customerId: string }>({
    queryKey: ["/api/auth/me"],
    retry: false, // Don't retry if auth fails
    staleTime: 5000,
  });

  // Secure customer ID - no fallback for production security
  const customerId = currentUser?.customerId;

  // Fetch contractor companies with customer isolation
  const { data: contractors = [], isLoading: contractorsLoading } = useQuery<ContractorCompany[]>({
    queryKey: ["/api/contractors", customerId],
    enabled: !!currentUser,
    refetchInterval: 30000,
  });

  // Fetch all workers with customer isolation
  const { data: allWorkers = [], isLoading: workersLoading } = useQuery<ContractorWorker[]>({
    queryKey: ["/api/contractors/workers/all", customerId],
    enabled: !!currentUser,
    refetchInterval: 30000,
  });

  // Fetch UK H&S document templates with customer isolation
  const { data: documentTemplates = [], isLoading: templatesLoading } = useQuery<UkHSDocumentTemplate[]>({
    queryKey: ["/api/uk-hs-documents/templates", customerId],
    enabled: !!currentUser,
    refetchInterval: 30000,
  });

  // Fetch assignments for selected company with customer isolation
  const { data: assignments = [] } = useQuery<AssignmentWithDetails[]>({
    queryKey: ["/api/uk-hs-documents/assignments/company", selectedCompany?.id, customerId],
    enabled: !!selectedCompany?.id && !!customerId,
    refetchInterval: 30000,
  });

  // Set initial company if provided using proper useEffect
  useEffect(() => {
    if (initialCompanyId && contractors.length > 0 && !selectedCompany) {
      const company = contractors.find(c => c.id === initialCompanyId);
      if (company) {
        setSelectedCompany(company);
      }
    }
  }, [initialCompanyId, contractors, selectedCompany]);

  // Get workers for selected company
  const companyWorkers = selectedCompany 
    ? allWorkers.filter(worker => worker.companyId === selectedCompany.id)
    : [];

  // Filter assignments based on search term
  const filteredAssignments = assignments.filter(assignment => {
    const workerName = `${assignment.worker.firstName} ${assignment.worker.lastName}`.toLowerCase();
    const documentName = assignment.template.documentName.toLowerCase();
    const search = searchTerm.toLowerCase();
    
    return workerName.includes(search) || documentName.includes(search);
  });

  // Send emails mutation with customer isolation
  const sendEmailsMutation = useMutation<SendEmailsResponse, Error, string[]>({
    mutationFn: async (assignmentIds: string[]) => {
      return await apiRequest("POST", "/api/uk-hs-documents/send-email", { assignmentIds }) as unknown as SendEmailsResponse;
    },
    onSuccess: (data) => {
      toast({
        title: "Emails Sent",
        description: `Successfully sent ${data.emailsSent} reminder emails`,
      });
      queryClient.invalidateQueries({ 
        queryKey: ["/api/uk-hs-documents/assignments/company", selectedCompany?.id, customerId] 
      });
    },
    onError: (error: any) => {
      toast({
        title: "Email Error",
        description: error.message || "Failed to send reminder emails",
        variant: "destructive",
      });
    },
  });

  const handleSendEmails = (assignmentIds: string[]) => {
    sendEmailsMutation.mutate(assignmentIds);
  };

  const handleSendAllReminders = () => {
    const pendingAssignments = assignments
      .filter(assignment => assignment.assignment.status === 'pending')
      .map(assignment => assignment.assignment.id);
    
    if (pendingAssignments.length === 0) {
      toast({
        title: "No Reminders to Send",
        description: "No pending assignments found for this company",
      });
      return;
    }

    handleSendEmails(pendingAssignments);
  };

  const getStatusStats = () => {
    const stats = {
      total: assignments.length,
      accepted: assignments.filter(a => a.assignment.status === 'accepted').length,
      sent: assignments.filter(a => a.assignment.status === 'sent').length,
      pending: assignments.filter(a => a.assignment.status === 'pending').length,
    };
    
    const complianceRate = stats.total > 0 ? Math.round((stats.accepted / stats.total) * 100) : 0;
    
    return { ...stats, complianceRate };
  };

  const stats = getStatusStats();

  if (contractorsLoading || workersLoading || templatesLoading) {
    return (
      <div className="space-y-6">
        <div className="text-center py-8">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-current border-r-transparent"></div>
          <p className="mt-2 text-slate-600">Loading compliance overview...</p>
        </div>
      </div>
    );
  }

  const content = (
    <div className="space-y-6">
      {/* Header with Company Selection */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-blue-600" />
            H&S Compliance Overview
          </h3>
          <p className="text-sm text-slate-600 mt-1">
            View and monitor UK Health & Safety compliance status
          </p>
        </div>
        
        <div className="flex items-center gap-4">
          <div>
            <Label className="text-sm font-medium mb-2 block">Select Company</Label>
            <Select 
              value={selectedCompany?.id || ""} 
              onValueChange={(value) => {
                const company = contractors.find(c => c.id === value);
                setSelectedCompany(company || null);
              }}
            >
              <SelectTrigger className="w-64" data-testid="select-compliance-company">
                <SelectValue placeholder="Choose a company..." />
              </SelectTrigger>
              <SelectContent>
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

      {selectedCompany && (
        <>
          {/* Compliance Statistics */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <GlassCard className="p-4">
              <div className="flex items-center gap-3">
                <FileText className="w-8 h-8 text-blue-600" />
                <div>
                  <p className="text-2xl font-bold text-slate-800">{stats.total}</p>
                  <p className="text-sm text-slate-600">Total Assignments</p>
                </div>
              </div>
            </GlassCard>
            
            <GlassCard className="p-4">
              <div className="flex items-center gap-3">
                <CheckCircle className="w-8 h-8 text-green-600" />
                <div>
                  <p className="text-2xl font-bold text-slate-800">{stats.accepted}</p>
                  <p className="text-sm text-slate-600">Completed</p>
                </div>
              </div>
            </GlassCard>
            
            <GlassCard className="p-4">
              <div className="flex items-center gap-3">
                <Clock className="w-8 h-8 text-yellow-600" />
                <div>
                  <p className="text-2xl font-bold text-slate-800">{stats.pending}</p>
                  <p className="text-sm text-slate-600">Pending</p>
                </div>
              </div>
            </GlassCard>
            
            <GlassCard className="p-4">
              <div className="flex items-center gap-3">
                <BarChart3 className="w-8 h-8 text-purple-600" />
                <div>
                  <p className="text-2xl font-bold text-slate-800">{stats.complianceRate}%</p>
                  <p className="text-sm text-slate-600">Compliance Rate</p>
                </div>
              </div>
            </GlassCard>
          </div>

          {/* Search and Actions */}
          <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" size={16} />
              <Input
                placeholder="Search workers or documents..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
                data-testid="input-search-compliance"
              />
            </div>
            
            <div className="flex gap-2">
              <Button 
                onClick={handleSendAllReminders}
                disabled={sendEmailsMutation.isPending || stats.pending === 0}
                variant="outline"
                data-testid="button-send-all-reminders"
              >
                <Mail className="mr-2" size={16} />
                {sendEmailsMutation.isPending ? "Sending..." : `Send Reminders (${stats.pending})`}
              </Button>
              
              <Button 
                onClick={() => queryClient.invalidateQueries({ 
                  queryKey: ["/api/uk-hs-documents/assignments/company", selectedCompany?.id, customerId] 
                })}
                variant="outline"
                size="sm"
                data-testid="button-refresh-compliance"
              >
                <RefreshCw className="w-4 h-4" />
              </Button>
            </div>
          </div>

          {/* Company Compliance Status */}
          <GlassCard>
            <h4 className="font-medium text-slate-800 mb-4 flex items-center gap-2">
              <Building2 className="w-4 h-4" />
              {selectedCompany.name} - H&S Document Assignments
            </h4>
            
            {filteredAssignments.length > 0 ? (
              <div className="space-y-3">
                {filteredAssignments.map((assignment) => (
                  <div key={assignment.assignment.id} className="flex items-center justify-between p-3 border rounded-lg hover:bg-slate-50">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-sm">{assignment.worker.firstName} {assignment.worker.lastName}</p>
                        <span className="text-slate-400">•</span>
                        <p className="text-sm text-slate-600">{assignment.template.documentName}</p>
                      </div>
                      <div className="flex items-center gap-4 mt-1">
                        <p className="text-xs text-slate-500">
                          Assigned: {new Date(assignment.assignment.assignedAt).toLocaleDateString()}
                        </p>
                        {assignment.assignment.dueDate && (
                          <p className="text-xs text-slate-500">
                            Due: {new Date(assignment.assignment.dueDate).toLocaleDateString()}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={
                        assignment.assignment.status === 'accepted' ? 'default' :
                        assignment.assignment.status === 'sent' ? 'secondary' : 'outline'
                      }>
                        {assignment.assignment.status}
                      </Badge>
                      {assignment.assignment.status === 'accepted' ? (
                        <CheckCircle className="w-4 h-4 text-green-600" />
                      ) : assignment.assignment.status === 'sent' ? (
                        <Clock className="w-4 h-4 text-yellow-600" />
                      ) : (
                        <div className="flex items-center gap-1">
                          <AlertTriangle className="w-4 h-4 text-red-600" />
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleSendEmails([assignment.assignment.id])}
                            disabled={sendEmailsMutation.isPending}
                            data-testid={`button-send-email-${assignment.assignment.id}`}
                          >
                            <Send className="w-3 h-3" />
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-slate-500">
                <FileText className="w-12 h-12 mx-auto mb-2 text-slate-300" />
                <p>
                  {assignments.length === 0 
                    ? "No H&S documents assigned to this company yet" 
                    : "No assignments match your search criteria"
                  }
                </p>
              </div>
            )}
          </GlassCard>
        </>
      )}

      {!selectedCompany && (
        <div className="text-center py-12 text-slate-500">
          <Shield className="w-16 h-16 mx-auto mb-4 text-slate-300" />
          <h4 className="text-lg font-medium text-slate-600 mb-2">Select a Company</h4>
          <p>Choose a contractor company to view their H&S compliance status</p>
        </div>
      )}
    </div>
  );

  if (isDialog) {
    return (
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Compliance Overview
          </DialogTitle>
        </DialogHeader>
        
        {content}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} data-testid="button-close-compliance">
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    );
  }

  return content;
}