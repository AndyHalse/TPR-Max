import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import type { ContractorWorker, WorkerDocumentAssignment, UkHSDocumentTemplate } from '@shared/schema';
import { Save, X, Clock, CheckCircle, History, HardHat, AlertTriangle, Shield, Send, FileText, Calendar, RotateCcw } from 'lucide-react';
import { format } from 'date-fns';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import ContractorHSModal from '@/components/ContractorHSModal';

interface ContractorEditModalProps {
  worker: ContractorWorker | null;
  companyName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface ContractorVisit {
  id: string;
  workerId: string;
  companyId: string;
  purpose: string;
  checkedInAt: Date;
  checkedOutAt: Date | null;
  duration: string | null;
  qrCode: string;
  notes: string | null;
}

interface HSDocumentAssignment {
  assignment: WorkerDocumentAssignment;
  template: UkHSDocumentTemplate;
}

export function ContractorEditModal({ worker, companyName, open, onOpenChange }: ContractorEditModalProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showHSModal, setShowHSModal] = useState(false);
  
  const [formData, setFormData] = useState({
    firstName: worker?.firstName || '',
    lastName: worker?.lastName || '',
    email: worker?.email || '',
    phone: worker?.phone || '',
    postcode: worker?.postcode || '',
    transportMethod: worker?.transportMethod || 'car_diesel',
    rightToWork: worker?.rightToWork || 'pending',
    cscsCard: worker?.cscsCard || '',
    cscsStatus: worker?.cscsStatus || 'pending',
    ipafStatus: worker?.ipafStatus || 'none',
    asbestosAwareness: worker?.asbestosAwareness || false,
    manualHandling: worker?.manualHandling || false,
    inductionCompleted: worker?.inductionCompleted || false,
  });

  // Update form data when worker changes
  useEffect(() => {
    if (worker) {
      setFormData({
        firstName: worker.firstName || '',
        lastName: worker.lastName || '',
        email: worker.email || '',
        phone: worker.phone || '',
        postcode: worker.postcode || '',
        transportMethod: worker.transportMethod || 'car_diesel',
        rightToWork: worker.rightToWork || 'pending',
        cscsCard: worker.cscsCard || '',
        cscsStatus: worker.cscsStatus || 'pending',
        ipafStatus: worker.ipafStatus || 'none',
        asbestosAwareness: worker.asbestosAwareness || false,
        manualHandling: worker.manualHandling || false,
        inductionCompleted: worker.inductionCompleted || false,
      });
    }
  }, [worker]);

  // Fetch contractor visit history
  const { data: workerHistory = [], refetch: refetchHistory } = useQuery<ContractorVisit[]>({
    queryKey: [`/api/contractors/workers/${worker?.id}/history`],
    enabled: !!worker?.id,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
  });

  // Fetch H&S document assignments for worker
  const { data: hsAssignments = [], isLoading: hsLoading, refetch: refetchHS } = useQuery<HSDocumentAssignment[]>({
    queryKey: [`/api/uk-hs-documents/assignments/worker/${worker?.id}`],
    enabled: !!worker?.id,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
  });

  // Update worker mutation
  const updateWorkerMutation = useMutation({
    mutationFn: async (updates: Partial<ContractorWorker>) => {
      if (!worker) throw new Error('No worker selected');
      const response = await apiRequest('PUT', `/api/contractors/workers/${worker.id}`, updates);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/contractors'] });
      queryClient.invalidateQueries({ queryKey: ['/api/contractors/workers/all'] });
      toast({
        title: 'Success',
        description: 'Contractor profile updated successfully!',
      });
      onOpenChange(false);
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to update contractor profile',
        variant: 'destructive',
      });
    },
  });

  // Check-in mutation
  const checkInMutation = useMutation({
    mutationFn: async () => {
      if (!worker) throw new Error('No worker selected');
      const response = await apiRequest('POST', `/api/contractors/workers/${worker.id}/checkin`, {
        purpose: 'Site work',
        hsRulesAccepted: true,
        hsRulesAcceptedAt: new Date().toISOString(),
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/contractors'] });
      queryClient.invalidateQueries({ queryKey: [`/api/contractors/workers/${worker?.id}/history`] });
      toast({
        title: 'Success',
        description: 'Contractor checked in successfully!',
      });
      refetchHistory();
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to check in contractor',
        variant: 'destructive',
      });
    },
  });

  // Check-out mutation
  const checkOutMutation = useMutation({
    mutationFn: async () => {
      if (!worker) throw new Error('No worker selected');
      const response = await apiRequest('POST', `/api/contractors/workers/${worker.id}/checkout`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/contractors'] });
      queryClient.invalidateQueries({ queryKey: [`/api/contractors/workers/${worker?.id}/history`] });
      queryClient.invalidateQueries({ queryKey: ['/api/stats'] }); // Refresh dashboard stats
      toast({
        title: 'Success',
        description: 'Contractor checked out successfully!',
      });
      refetchHistory();
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to check out contractor',
        variant: 'destructive',
      });
    },
  });

  // Resend H&S document mutation
  const resendDocumentMutation = useMutation({
    mutationFn: async (assignmentId: string) => {
      const response = await apiRequest('POST', `/api/uk-hs-documents/send-email`, {
        assignmentIds: [assignmentId]
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/uk-hs-documents/assignments/worker/${worker?.id}`] });
      toast({
        title: 'Success',
        description: 'H&S document resent successfully!',
      });
      refetchHS();
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to resend H&S document',
        variant: 'destructive',
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateWorkerMutation.mutate(formData);
  };

  const handleInputChange = (field: string, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  // Refetch history and H&S assignments when worker changes or modal opens
  useEffect(() => {
    if (worker?.id && open) {
      refetchHistory();
      refetchHS();
    }
  }, [worker?.id, open, refetchHistory, refetchHS]);

  if (!worker) return null;

  // Get current check-in status
  const currentVisit = workerHistory.find(visit => !visit.checkedOutAt);
  const isCheckedIn = !!currentVisit;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="glass-effect border border-white/30 max-w-3xl max-h-[95vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-slate-800">
              <HardHat className="h-5 w-5" />
              Edit Contractor Profile
            </DialogTitle>
          </DialogHeader>

        <Tabs defaultValue="profile" className="flex-1 overflow-hidden flex flex-col">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="profile">Profile</TabsTrigger>
            <TabsTrigger value="history" className="flex items-center gap-1">
              <History className="h-4 w-4" />
              Visit History
              <Badge variant="secondary" className="ml-1">
                {workerHistory.length}
              </Badge>
            </TabsTrigger>
            <TabsTrigger value="hs-documents" className="flex items-center gap-1">
              <Shield className="h-4 w-4" />
              H&S Documents
              <Badge variant="secondary" className="ml-1">
                {hsAssignments.length}
              </Badge>
            </TabsTrigger>
          </TabsList>

          <div className="flex-1 max-h-[calc(95vh-120px)] overflow-y-auto scrollbar-thin scrollbar-track-slate-100 scrollbar-thumb-slate-400 hover:scrollbar-thumb-slate-500">
            <TabsContent value="profile" className="space-y-4 px-1 pb-6">
              <form onSubmit={handleSubmit} className="space-y-6">
                {/* Personal Information */}
                <div className="space-y-4">
                  <h3 className="font-semibold text-slate-700">Personal Information</h3>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="firstName">First Name *</Label>
                      <Input
                        id="firstName"
                        value={formData.firstName}
                        onChange={(e) => handleInputChange('firstName', e.target.value)}
                        required
                        data-testid="input-contractor-firstname"
                      />
                    </div>
                    <div>
                      <Label htmlFor="lastName">Last Name *</Label>
                      <Input
                        id="lastName"
                        value={formData.lastName}
                        onChange={(e) => handleInputChange('lastName', e.target.value)}
                        required
                        data-testid="input-contractor-lastname"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="email">Email Address</Label>
                      <Input
                        id="email"
                        type="email"
                        value={formData.email}
                        onChange={(e) => handleInputChange('email', e.target.value)}
                        data-testid="input-contractor-email"
                      />
                    </div>
                    <div>
                      <Label htmlFor="phone">Phone Number</Label>
                      <Input
                        id="phone"
                        value={formData.phone}
                        onChange={(e) => handleInputChange('phone', e.target.value)}
                        data-testid="input-contractor-phone"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="postcode">Home Postcode</Label>
                      <Input
                        id="postcode"
                        value={formData.postcode}
                        onChange={(e) => handleInputChange('postcode', e.target.value)}
                        placeholder="e.g. OX28 4BH"
                        data-testid="input-contractor-postcode"
                      />
                      <p className="text-xs text-slate-500 mt-1">For CO2 emissions calculation</p>
                    </div>
                    <div>
                      <Label htmlFor="transportMethod">Vehicle Fuel Type</Label>
                      <select
                        id="transportMethod"
                        value={formData.transportMethod}
                        onChange={(e) => handleInputChange('transportMethod', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        data-testid="select-transport-method"
                      >
                        <option value="car_diesel">Diesel Car</option>
                        <option value="car_petrol">Petrol Car</option>
                        <option value="electric_car">Electric Car</option>
                        <option value="hybrid_car">Hybrid Car</option>
                        <option value="motorcycle">Motorcycle</option>
                        <option value="public_transport">Public Transport</option>
                        <option value="bicycle">Bicycle</option>
                        <option value="walking">Walking</option>
                        <option value="van_diesel">Diesel Van</option>
                        <option value="van_petrol">Petrol Van</option>
                      </select>
                      <p className="text-xs text-slate-500 mt-1">For CO2 emissions calculation</p>
                    </div>
                  </div>
                </div>

                {/* Company Information */}
                <div className="space-y-4">
                  <h3 className="font-semibold text-slate-700">Company Information</h3>
                  
                  <div>
                    <Label>Company</Label>
                    <Input
                      value={companyName}
                      disabled
                      className="bg-slate-50"
                      data-testid="input-contractor-company"
                    />
                  </div>
                </div>

                {/* Certifications & Compliance */}
                <div className="space-y-4">
                  <h3 className="font-semibold text-slate-700">Certifications & Compliance</h3>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="cscsCard">CSCS Card Number</Label>
                      <Input
                        id="cscsCard"
                        value={formData.cscsCard}
                        onChange={(e) => handleInputChange('cscsCard', e.target.value)}
                        data-testid="input-contractor-cscs"
                      />
                    </div>
                    <div>
                      <Label htmlFor="cscsStatus">CSCS Status</Label>
                      <select
                        id="cscsStatus"
                        value={formData.cscsStatus}
                        onChange={(e) => handleInputChange('cscsStatus', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md"
                        data-testid="select-cscs-status"
                      >
                        <option value="pending">Pending</option>
                        <option value="valid">Valid</option>
                        <option value="expired">Expired</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="rightToWork">Right to Work Status</Label>
                      <select
                        id="rightToWork"
                        value={formData.rightToWork}
                        onChange={(e) => handleInputChange('rightToWork', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md"
                        data-testid="select-right-to-work"
                      >
                        <option value="pending">Pending</option>
                        <option value="valid">Valid</option>
                        <option value="expired">Expired</option>
                      </select>
                    </div>
                    <div>
                      <Label htmlFor="ipafStatus">IPAF Status</Label>
                      <select
                        id="ipafStatus"
                        value={formData.ipafStatus}
                        onChange={(e) => handleInputChange('ipafStatus', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md"
                        data-testid="select-ipaf-status"
                      >
                        <option value="none">None</option>
                        <option value="3a">3a</option>
                        <option value="3b">3b</option>
                        <option value="1+">1+</option>
                        <option value="expired">Expired</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* Safety Training */}
                <div className="space-y-4">
                  <h3 className="font-semibold text-slate-700">Safety Training</h3>
                  
                  <div className="space-y-2">
                    <label className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        checked={formData.asbestosAwareness}
                        onChange={(e) => handleInputChange('asbestosAwareness', e.target.checked)}
                        className="rounded"
                      />
                      <span>Asbestos Awareness</span>
                    </label>
                    
                    <label className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        checked={formData.manualHandling}
                        onChange={(e) => handleInputChange('manualHandling', e.target.checked)}
                        className="rounded"
                      />
                      <span>Manual Handling</span>
                    </label>
                    
                    
                    <label className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        checked={formData.inductionCompleted}
                        onChange={(e) => handleInputChange('inductionCompleted', e.target.checked)}
                        className="rounded"
                      />
                      <span>Site Induction Completed</span>
                    </label>
                  </div>
                </div>

                {/* Compliance & Safety */}
                <div className="space-y-4">
                  <h3 className="font-semibold text-slate-700">Compliance & Safety</h3>
                  
                  <div className="grid grid-cols-2 gap-4">
                    {/* H&S Rules Status */}
                    <div className="bg-white/50 rounded-lg p-4 flex items-start gap-3">
                      {worker.hsRulesAccepted ? (
                        <CheckCircle className="h-5 w-5 text-green-500 mt-0.5" />
                      ) : (
                        <div className="h-5 w-5 rounded-full border-2 border-slate-300 mt-0.5" />
                      )}
                      <div className="flex-1">
                        <div className="font-medium text-slate-800">H&S Rules</div>
                        <div className="text-sm text-slate-600">
                          {worker.hsRulesAccepted && worker.hsRulesAcceptedAt 
                            ? `Accepted on ${format(new Date(worker.hsRulesAcceptedAt), 'dd/MM/yyyy HH:mm')}`
                            : 'Not accepted'
                          }
                        </div>
                      </div>
                    </div>

                    {/* Induction Status */}
                    <div className="bg-white/50 rounded-lg p-4 flex items-start gap-3">
                      {worker.inductionCompleted ? (
                        <CheckCircle className="h-5 w-5 text-green-500 mt-0.5" />
                      ) : (
                        <div className="h-5 w-5 rounded-full border-2 border-slate-300 mt-0.5" />
                      )}
                      <div className="flex-1">
                        <div className="font-medium text-slate-800">Induction</div>
                        <div className="text-sm text-slate-600">
                          {worker.inductionCompleted 
                            ? 'Completed'
                            : 'Not completed'
                          }
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex justify-between items-center pt-4 border-t">
                  <div className="flex gap-2">
                    {isCheckedIn ? (
                      <Button
                        type="button"
                        onClick={() => checkOutMutation.mutate()}
                        disabled={checkOutMutation.isPending}
                        className="bg-red-600 hover:bg-red-700 text-white"
                        data-testid="button-contractor-checkout"
                      >
                        <Clock className="h-4 w-4 mr-2" />
                        Check Out
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        onClick={() => setShowHSModal(true)}
                        disabled={checkInMutation.isPending}
                        className="bg-green-600 hover:bg-green-700 text-white"
                        data-testid="button-contractor-checkin"
                      >
                        <CheckCircle className="h-4 w-4 mr-2" />
                        Check In
                      </Button>
                    )}
                  </div>
                  
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => onOpenChange(false)}
                      data-testid="button-cancel"
                    >
                      <X className="h-4 w-4 mr-2" />
                      Cancel
                    </Button>
                    <Button
                      type="submit"
                      disabled={updateWorkerMutation.isPending}
                      className="bg-blue-600 hover:bg-blue-700 text-white"
                      data-testid="button-save-changes"
                    >
                      <Save className="h-4 w-4 mr-2" />
                      Save Changes
                    </Button>
                  </div>
                </div>
              </form>
            </TabsContent>

            <TabsContent value="history" className="space-y-4 px-1">
              {workerHistory.length === 0 ? (
                <div className="text-center py-8 text-slate-500">
                  No visit history found for this contractor
                </div>
              ) : (
                <div className="space-y-4">
                  {workerHistory.map((visit, index) => (
                    <div key={visit.id} className="bg-white/50 rounded-lg p-4 space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Clock className="h-4 w-4 text-slate-500" />
                          <span className="font-semibold">Visit #{workerHistory.length - index}</span>
                        </div>
                        {!visit.checkedOutAt && new Date(visit.checkedInAt).toDateString() === new Date().toDateString() && (
                          <Badge className="bg-green-500 text-white">
                            Currently On-Site
                          </Badge>
                        )}
                        {!visit.checkedOutAt && new Date(visit.checkedInAt).toDateString() !== new Date().toDateString() && (
                          <Badge className="bg-orange-500 text-white">
                            Not Checked Out
                          </Badge>
                        )}
                      </div>
                      
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <span className="text-slate-600">Check-in:</span>
                          <div className="font-medium">
                            {format(new Date(visit.checkedInAt), 'dd/MM/yyyy HH:mm')}
                          </div>
                        </div>
                        
                        <div>
                          <span className="text-slate-600">Check-out:</span>
                          <div className="font-medium">
                            {visit.checkedOutAt 
                              ? format(new Date(visit.checkedOutAt), 'dd/MM/yyyy HH:mm')
                              : new Date(visit.checkedInAt).toDateString() === new Date().toDateString()
                                ? 'Still on-site'
                                : 'Not checked out'}
                          </div>
                        </div>
                      </div>
                      
                      {visit.duration && (
                        <div className="text-sm">
                          <span className="text-slate-600">Duration: </span>
                          <span className="font-medium">{visit.duration}</span>
                        </div>
                      )}
                      
                      {visit.purpose && (
                        <div className="text-sm">
                          <span className="text-slate-600">Purpose: </span>
                          <span className="font-medium">{visit.purpose}</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="hs-documents" className="space-y-4 px-1">
              {hsLoading ? (
                <div className="text-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto"></div>
                  <p className="text-slate-500 mt-2">Loading H&S documents...</p>
                </div>
              ) : hsAssignments.length === 0 ? (
                <div className="text-center py-8 text-slate-500">
                  <Shield className="h-12 w-12 text-slate-300 mx-auto mb-3" />
                  <p className="font-medium">No H&S documents assigned</p>
                  <p className="text-sm">This contractor has no assigned H&S documents yet</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {hsAssignments.map((item) => {
                    const { assignment, template } = item;
                    
                    // Helper function to get status badge
                    const getStatusBadge = (status: string) => {
                      switch (status) {
                        case 'accepted':
                          return <Badge className="bg-green-500 text-white">Accepted</Badge>;
                        case 'pending':
                          return <Badge className="bg-yellow-500 text-white">Pending</Badge>;
                        case 'sent':
                          return <Badge className="bg-blue-500 text-white">Sent</Badge>;
                        case 'rejected':
                          return <Badge className="bg-red-500 text-white">Rejected</Badge>;
                        case 'expired':
                          return <Badge className="bg-gray-500 text-white">Expired</Badge>;
                        default:
                          return <Badge variant="secondary">{status}</Badge>;
                      }
                    };

                    // Helper function to get category badge color
                    const getCategoryColor = (category: string) => {
                      switch (category) {
                        case 'immigration':
                          return 'bg-purple-100 text-purple-800';
                        case 'safety_training':
                          return 'bg-orange-100 text-orange-800';
                        case 'work_permit':
                          return 'bg-blue-100 text-blue-800';
                        case 'contract':
                          return 'bg-green-100 text-green-800';
                        case 'risk_management':
                          return 'bg-red-100 text-red-800';
                        case 'induction':
                          return 'bg-indigo-100 text-indigo-800';
                        default:
                          return 'bg-slate-100 text-slate-800';
                      }
                    };

                    const canResend = ['pending', 'expired', 'rejected'].includes(assignment.status);

                    return (
                      <div key={assignment.id} className="bg-white/50 rounded-lg p-4 space-y-3">
                        <div className="flex items-start justify-between">
                          <div className="flex items-start gap-3 flex-1">
                            <FileText className="h-5 w-5 text-slate-500 mt-0.5" />
                            <div className="flex-1">
                              <div className="flex items-start justify-between mb-2">
                                <div>
                                  <h4 className="font-semibold text-slate-800">{template.documentName}</h4>
                                  {template.documentDescription && (
                                    <p className="text-sm text-slate-600 mt-1">{template.documentDescription}</p>
                                  )}
                                </div>
                                {getStatusBadge(assignment.status)}
                              </div>
                              
                              <div className="flex items-center gap-2 mb-2">
                                <Badge 
                                  variant="secondary" 
                                  className={`text-xs ${getCategoryColor(template.complianceCategory)}`}
                                >
                                  {template.complianceCategory.replace('_', ' ').toUpperCase()}
                                </Badge>
                                {template.legalReference && (
                                  <span className="text-xs text-slate-500">
                                    {template.legalReference}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4 text-sm">
                          <div>
                            <span className="text-slate-600 flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              Assigned:
                            </span>
                            <div className="font-medium">
                              {format(new Date(assignment.assignedAt), 'dd/MM/yyyy HH:mm')}
                            </div>
                          </div>
                          
                          {assignment.emailSentAt && (
                            <div>
                              <span className="text-slate-600 flex items-center gap-1">
                                <Send className="h-3 w-3" />
                                Email sent:
                              </span>
                              <div className="font-medium">
                                {format(new Date(assignment.emailSentAt), 'dd/MM/yyyy HH:mm')}
                              </div>
                            </div>
                          )}
                          
                          {assignment.acceptedAt && (
                            <div>
                              <span className="text-slate-600 flex items-center gap-1">
                                <CheckCircle className="h-3 w-3" />
                                Accepted:
                              </span>
                              <div className="font-medium text-green-600">
                                {format(new Date(assignment.acceptedAt), 'dd/MM/yyyy HH:mm')}
                              </div>
                            </div>
                          )}
                          
                          {assignment.rejectedAt && (
                            <div>
                              <span className="text-slate-600 flex items-center gap-1">
                                <X className="h-3 w-3" />
                                Rejected:
                              </span>
                              <div className="font-medium text-red-600">
                                {format(new Date(assignment.rejectedAt), 'dd/MM/yyyy HH:mm')}
                              </div>
                            </div>
                          )}
                          
                          {assignment.dueDate && (
                            <div>
                              <span className="text-slate-600 flex items-center gap-1">
                                <AlertTriangle className="h-3 w-3" />
                                Due date:
                              </span>
                              <div className={`font-medium ${
                                new Date(assignment.dueDate) < new Date() ? 'text-red-600' : 'text-slate-800'
                              }`}>
                                {format(new Date(assignment.dueDate), 'dd/MM/yyyy')}
                              </div>
                            </div>
                          )}
                        </div>

                        {assignment.rejectionReason && (
                          <div className="mt-2 p-2 bg-red-50 rounded text-sm">
                            <span className="text-red-700 font-medium">Rejection reason: </span>
                            <span className="text-red-600">{assignment.rejectionReason}</span>
                          </div>
                        )}

                        {assignment.notes && (
                          <div className="mt-2 p-2 bg-slate-50 rounded text-sm">
                            <span className="text-slate-700 font-medium">Notes: </span>
                            <span className="text-slate-600">{assignment.notes}</span>
                          </div>
                        )}

                        {canResend && (
                          <div className="flex justify-end pt-2 border-t border-slate-200">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => resendDocumentMutation.mutate(assignment.id)}
                              disabled={resendDocumentMutation.isPending}
                              className="text-blue-600 border-blue-200 hover:bg-blue-50"
                              data-testid={`button-resend-${assignment.id}`}
                            >
                              {resendDocumentMutation.isPending ? (
                                <RotateCcw className="h-3 w-3 mr-1 animate-spin" />
                              ) : (
                                <Send className="h-3 w-3 mr-1" />
                              )}
                              Resend Email
                            </Button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </TabsContent>
          </div>
        </Tabs>
      </DialogContent>
    </Dialog>
    
    {/* H&S Acceptance Modal */}
    {worker && (
      <ContractorHSModal
        isOpen={showHSModal}
        onClose={() => setShowHSModal(false)}
        onAccept={() => {
          checkInMutation.mutate();
          setShowHSModal(false);
        }}
        worker={worker}
        companyName={companyName}
      />
    )}
    </>
  );
}