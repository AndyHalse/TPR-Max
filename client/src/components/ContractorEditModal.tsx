import { useState, useEffect, useRef } from 'react';
import { useLocation } from 'wouter';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import type { ContractorWorker, ContractorCompany, WorkerDocumentAssignment, UkHSDocumentTemplate } from '@shared/schema';
import { Save, X, Clock, CheckCircle, XCircle, History, HardHat, AlertTriangle, Shield, Send, FileText, Calendar, RotateCcw, Edit3, Plus, Upload, Trash2, Download, Eye, Lock, ShieldCheck, Sparkles, Info, ExternalLink, Archive, ArchiveRestore } from 'lucide-react';
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
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const [showHSModal, setShowHSModal] = useState(false);
  const [showHostSelection, setShowHostSelection] = useState(false);
  const [selectedHostId, setSelectedHostId] = useState('');
  const [manualNote, setManualNote] = useState('');
  const [showArchiveDialog, setShowArchiveDialog] = useState(false);
  const [archiveReason, setArchiveReason] = useState('');

  // Document upload state
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [documentFormData, setDocumentFormData] = useState({
    documentType: '',
    expiryDate: '',
    issuedBy: '',
    policyNumber: '',
  });
  const [isScanningDoc, setIsScanningDoc] = useState(false);
  const [aiExtracted, setAiExtracted] = useState(false);

  // Tracks whether the user has made any input change in the current modal open.
  // Allows freshWorker to load and update the form UNTIL the user starts typing,
  // at which point we freeze to prevent their edits being overwritten.
  const userHasEditedRef = useRef(false);

  // Fetch FRESH worker data directly from API when modal opens
  // This ensures we always have the latest data, not stale parent state
  const { data: freshWorker } = useQuery<ContractorWorker>({
    queryKey: [`/api/contractors/workers/${worker?.id}`],
    enabled: !!worker?.id && open,
    refetchOnMount: 'always',
    staleTime: 0,
  });

  // Use fresh data when available, fall back to prop
  const activeWorker = freshWorker || worker;
  
  const [formData, setFormData] = useState({
    firstName: worker?.firstName || '',
    lastName: worker?.lastName || '',
    email: worker?.email || '',
    phone: worker?.phoneNumber || '',
    postcode: worker?.postcode || '',
    transportMethod: worker?.transportMethod || 'car_diesel',
    rightToWork: worker?.rightToWork || 'pending',
    cscsCard: worker?.cscsCard || '',
    cscsStatus: worker?.cscsStatus || 'pending',
    ipafStatus: worker?.ipafStatus || 'none',
    asbestosAwareness: worker?.asbestosAwareness || false,
    manualHandling: worker?.manualHandling || false,
    inductionCompleted: worker?.inductionCompleted || false,
    companyId: worker?.companyId || '',
  });

  // Reset the "user has edited" guard whenever the modal closes.
  useEffect(() => {
    if (!open) {
      userHasEditedRef.current = false;
    }
  }, [open]);

  // Initialise (or re-initialise) form data from the best available data source.
  // Runs whenever the modal opens OR when freshWorker arrives with updated values.
  // Stops as soon as the user makes their first change so their edits are never lost.
  useEffect(() => {
    if (!open) return;
    if (userHasEditedRef.current) return; // user has started editing — freeze
    const target = freshWorker || activeWorker;
    if (!target) return;

    const inductionVal = target.inductionCompleted === true || (target as any).siteInductionCompleted === true;
    console.info('🔍 FORM INIT - inductionCompleted:', inductionVal, 'source:', freshWorker ? 'fresh API' : 'prop');
    setFormData({
      firstName: target.firstName || '',
      lastName: target.lastName || '',
      email: target.email || '',
      phone: (target as any).phoneNumber || (target as any).phone || '',
      postcode: target.postcode || '',
      transportMethod: target.transportMethod || 'car_diesel',
      rightToWork: target.rightToWork || 'pending',
      cscsCard: target.cscsCard || '',
      cscsStatus: target.cscsStatus || 'pending',
      ipafStatus: target.ipafStatus || 'none',
      asbestosAwareness: target.asbestosAwareness || false,
      manualHandling: target.manualHandling || false,
      inductionCompleted: inductionVal,
      companyId: target.companyId || '',
    });
  }, [open, freshWorker, activeWorker]);

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

  // Fetch contractor companies for company selection dropdown
  const { data: companies = [] } = useQuery<ContractorCompany[]>({
    queryKey: ['/api/contractors'],
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });

  const { data: staffList = [] } = useQuery<any[]>({
    queryKey: ['/api/staff'],
    enabled: open,
  });

  // Fetch worker notes/audit trail
  const { data: workerNotes = [], isLoading: notesLoading, refetch: refetchNotes } = useQuery<any[]>({
    queryKey: [`/api/contractors/workers/${worker?.id}/notes`],
    enabled: !!worker?.id,
    refetchOnMount: true,
  });

  // Fetch worker documents
  const { data: workerDocuments = [], isLoading: documentsLoading, refetch: refetchDocuments } = useQuery<any[]>({
    queryKey: [`/api/contractors/workers/${worker?.id}/documents`],
    enabled: !!worker?.id,
    refetchOnMount: true,
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
      queryClient.invalidateQueries({ queryKey: [`/api/contractors/workers/${worker?.id}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/contractors/workers/${worker?.id}/notes`] });
      queryClient.invalidateQueries({ queryKey: ['/api/contractors/checked-in'] });
      // Invalidate the specific contractor-by-ID query used by ContractorDetails so
      // the worker card reflects updated phone / induction status immediately.
      if (worker?.companyId) {
        queryClient.invalidateQueries({ queryKey: [`/api/contractors/${worker.companyId}`] });
      }
      refetchNotes();
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
      const selectedHost = staffList.find((s: any) => s.id === selectedHostId);
      const response = await apiRequest('POST', `/api/contractors/workers/${worker.id}/checkin`, {
        purpose: 'Site work',
        hsRulesAccepted: true,
        hsRulesAcceptedAt: new Date().toISOString(),
        hostStaffId: selectedHostId || undefined,
        hostName: selectedHost ? `${selectedHost.firstName} ${selectedHost.lastName}` : undefined,
      });
      return response.json();
    },
    onSuccess: async () => {
      queryClient.invalidateQueries({ queryKey: ['/api/contractors'] });
      queryClient.invalidateQueries({ queryKey: ['/api/contractors/workers/all'] });
      queryClient.invalidateQueries({ queryKey: ['/api/contractors/checked-in'] });
      queryClient.invalidateQueries({ queryKey: [`/api/contractors/workers/${worker?.id}/history`] });
      queryClient.invalidateQueries({ queryKey: [`/api/contractors/workers/${worker?.id}/notes`] });
      queryClient.invalidateQueries({ queryKey: ['/api/stats'] });
      setSelectedHostId('');
      toast({
        title: 'Success',
        description: 'Contractor checked in successfully!',
      });
      refetchHistory();
      refetchNotes();
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
    onSuccess: async () => {
      queryClient.invalidateQueries({ queryKey: ['/api/contractors'] });
      queryClient.invalidateQueries({ queryKey: ['/api/contractors/workers/all'] });
      queryClient.invalidateQueries({ queryKey: ['/api/contractors/checked-in'] });
      queryClient.invalidateQueries({ queryKey: [`/api/contractors/workers/${worker?.id}/history`] });
      queryClient.invalidateQueries({ queryKey: [`/api/contractors/workers/${worker?.id}/notes`] });
      queryClient.invalidateQueries({ queryKey: ['/api/stats'] });
      toast({
        title: 'Success',
        description: 'Contractor checked out successfully!',
      });
      refetchHistory();
      refetchNotes();
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to check out contractor',
        variant: 'destructive',
      });
    },
  });

  // Request documents from worker mutation
  const requestDocumentsMutation = useMutation({
    mutationFn: async () => {
      if (!worker) throw new Error('No worker selected');
      const response = await apiRequest('POST', `/api/contractors/workers/${worker.id}/request-documents`, {});
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: 'Request sent',
        description: `A secure document upload link has been emailed to ${activeWorker?.email || 'the worker'}.`,
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Failed to send request',
        description: error.message || 'Could not send document request email.',
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

  // Add manual note mutation
  const addManualNoteMutation = useMutation({
    mutationFn: async ({ workerId, notes }: { workerId: string; notes: string }) => {
      const response = await apiRequest('POST', `/api/contractors/workers/${workerId}/notes`, {
        changeType: 'manual_note',
        notes: notes
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/contractors/workers/${worker?.id}/notes`] });
      setManualNote(''); // Clear the form
      toast({
        title: 'Success',
        description: 'Note added successfully!',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to add note',
        variant: 'destructive',
      });
    },
  });

  // Archive worker mutation
  const archiveWorkerMutation = useMutation({
    mutationFn: async ({ workerId, reason }: { workerId: string; reason: string }) => {
      const response = await apiRequest('POST', `/api/contractors/workers/${workerId}/archive`, { reason });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/contractors'] });
      queryClient.invalidateQueries({ queryKey: ['/api/contractors/workers/all'] });
      if (worker?.companyId) {
        queryClient.invalidateQueries({ queryKey: [`/api/contractors/${worker.companyId}`] });
        queryClient.invalidateQueries({ queryKey: [`/api/contractors/${worker.companyId}/archived-workers`] });
      }
      queryClient.invalidateQueries({ queryKey: [`/api/contractors/workers/${worker?.id}/notes`] });
      setShowArchiveDialog(false);
      setArchiveReason('');
      toast({ title: 'Worker archived', description: 'Worker has been archived and will no longer appear in the active list.' });
      onOpenChange(false);
    },
    onError: (error: any) => {
      toast({ title: 'Failed to archive worker', description: error.message || 'Please try again.', variant: 'destructive' });
    },
  });

  // Unarchive worker mutation
  const unarchiveWorkerMutation = useMutation({
    mutationFn: async (workerId: string) => {
      const response = await apiRequest('POST', `/api/contractors/workers/${workerId}/unarchive`, {});
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/contractors'] });
      queryClient.invalidateQueries({ queryKey: ['/api/contractors/workers/all'] });
      if (worker?.companyId) {
        queryClient.invalidateQueries({ queryKey: [`/api/contractors/${worker.companyId}`] });
        queryClient.invalidateQueries({ queryKey: [`/api/contractors/${worker.companyId}/archived-workers`] });
      }
      queryClient.invalidateQueries({ queryKey: [`/api/contractors/workers/${worker?.id}/notes`] });
      toast({ title: 'Worker reactivated', description: 'Worker has been unarchived and will appear in the active list again.' });
      onOpenChange(false);
    },
    onError: (error: any) => {
      toast({ title: 'Failed to unarchive worker', description: error.message || 'Please try again.', variant: 'destructive' });
    },
  });

  // AI document scan handler
  const scanDocument = async () => {
    if (!selectedFile) return;
    setIsScanningDoc(true);
    setAiExtracted(false);
    try {
      const fileData = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result as string;
          // Strip the data URL prefix (e.g. "data:application/pdf;base64,")
          const base64 = result.split(',')[1];
          resolve(base64);
        };
        reader.onerror = reject;
        reader.readAsDataURL(selectedFile);
      });

      const response = await apiRequest('POST', '/api/contractors/documents/scan', {
        fileData,
        mimeType: selectedFile.type || 'application/octet-stream',
        documentType: documentFormData.documentType || 'other',
      });
      const data = await response.json();
      const fields = data.fields as { expiryDate: string | null; issuedBy: string | null; policyNumber: string | null };

      setDocumentFormData(prev => ({
        ...prev,
        expiryDate: prev.expiryDate || fields.expiryDate || '',
        issuedBy: prev.issuedBy || fields.issuedBy || '',
        policyNumber: prev.policyNumber || fields.policyNumber || '',
      }));
      setAiExtracted(true);
      toast({ title: 'Scan complete', description: 'Fields have been pre-filled — please verify before saving.' });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unable to scan document';
      toast({ title: 'Scan failed', description: msg, variant: 'destructive' });
    } finally {
      setIsScanningDoc(false);
    }
  };

  // Upload document mutation
  const uploadDocumentMutation = useMutation({
    mutationFn: async (file: File) => {
      if (!worker) throw new Error('No worker selected');
      
      setIsUploading(true);
      setUploadProgress(10);
      
      // Upload via our server (avoids GCS CORS on signed PUTs)
      const formData = new FormData();
      formData.append('file', file);
      const token = sessionStorage.getItem('session_token');
      const uploadResponse = await fetch(`/api/contractors/workers/${worker.id}/documents/upload`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      });

      if (!uploadResponse.ok) {
        const errBody = await uploadResponse.json().catch(() => ({}));
        throw new Error((errBody as any).error || 'Failed to upload file');
      }
      const { fileUrl } = await uploadResponse.json();
      setUploadProgress(70);
      
      // Save document metadata
      const response = await apiRequest('POST', `/api/contractors/workers/${worker.id}/documents`, {
        documentName: file.name,
        documentType: documentFormData.documentType,
        documentUrl: fileUrl,
        expiryDate: documentFormData.expiryDate || null,
        issuedBy: documentFormData.issuedBy || null,
        policyNumber: documentFormData.policyNumber || null,
      });
      
      setUploadProgress(100);
      return { ...await response.json(), fileName: file.name, docType: documentFormData.documentType };
    },
    onSuccess: async (data) => {
      queryClient.invalidateQueries({ queryKey: [`/api/contractors/workers/${worker?.id}/documents`] });
      
      // Automatically create audit trail note
      const timestamp = format(new Date(), 'dd/MM/yyyy HH:mm');
      const auditNote = `Document uploaded: "${data.fileName}" (${data.docType}) - ${timestamp}`;
      
      if (worker) {
        try {
          await apiRequest('POST', `/api/contractors/workers/${worker.id}/notes`, {
            changeType: 'document_upload',
            notes: auditNote
          });
          queryClient.invalidateQueries({ queryKey: [`/api/contractors/workers/${worker?.id}/notes`] });
        } catch (error) {
          console.error('Failed to create audit note:', error);
        }
      }
      
      setSelectedFile(null);
      setAiExtracted(false);
      setDocumentFormData({
        documentType: '',
        expiryDate: '',
        issuedBy: '',
        policyNumber: '',
      });
      setUploadProgress(0);
      setIsUploading(false);
      toast({
        title: 'Success',
        description: 'Document uploaded successfully!',
      });
      refetchDocuments();
      refetchNotes();
    },
    onError: (error: any) => {
      setUploadProgress(0);
      setIsUploading(false);
      toast({
        title: 'Error',
        description: error.message || 'Failed to upload document',
        variant: 'destructive',
      });
    },
  });

  // Delete document mutation
  const deleteDocumentMutation = useMutation({
    mutationFn: async (documentId: string) => {
      if (!worker) throw new Error('No worker selected');
      const response = await apiRequest('DELETE', `/api/contractors/workers/${worker.id}/documents/${documentId}`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/contractors/workers/${worker?.id}/documents`] });
      toast({
        title: 'Success',
        description: 'Document deleted successfully!',
      });
      refetchDocuments();
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to delete document',
        variant: 'destructive',
      });
    },
  });

  const [inductionLinkSentEmail, setInductionLinkSentEmail] = useState<string | null>(null);
  const sendInductionMutation = useMutation({
    mutationFn: async () => {
      if (!worker) throw new Error('No worker selected');
      const response = await apiRequest('POST', `/api/contractors/${worker.id}/send-induction`, {});
      return response.json();
    },
    onSuccess: () => {
      setInductionLinkSentEmail(activeWorker?.email || formData.email || '');
      setTimeout(() => setInductionLinkSentEmail(null), 4000);
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to send induction link',
        variant: 'destructive',
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.email?.trim()) {
      toast({ title: 'Email required', description: 'Please enter an email address.', variant: 'destructive' });
      return;
    }
    if (!formData.phone?.trim()) {
      toast({ title: 'Phone number required', description: 'Please enter a phone number.', variant: 'destructive' });
      return;
    }
    console.info('🔍 ContractorEditModal - Submitting form with data:', formData);
    console.info('🔍 ContractorEditModal - transportMethod value:', formData.transportMethod);
    updateWorkerMutation.mutate(formData);
  };

  const handleInputChange = (field: string, value: any) => {
    userHasEditedRef.current = true;
    console.info(`🔍 ContractorEditModal - Field "${field}" changed to:`, value);
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
            <DialogTitle className="flex items-center gap-2 text-fixed">
              <HardHat className="h-5 w-5" />
              Edit Contractor Worker Profile
            </DialogTitle>
            <DialogDescription>
              Update contractor worker details, certifications, safety training, and compliance status.
            </DialogDescription>
          </DialogHeader>

        <Tabs defaultValue="profile" className="flex-1 overflow-hidden flex flex-col">
          <TabsList className="grid w-full grid-cols-4">
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
                {workerDocuments.length}
              </Badge>
            </TabsTrigger>
            <TabsTrigger value="notes" className="flex items-center gap-1">
              <FileText className="h-4 w-4" />
              Notes
              <Badge variant="secondary" className="ml-1">
                {workerNotes?.length || 0}
              </Badge>
            </TabsTrigger>
          </TabsList>

          <div className="flex-1 max-h-[calc(95vh-120px)] overflow-y-auto scrollbar-thin scrollbar-track-slate-100 scrollbar-thumb-slate-400 hover:scrollbar-thumb-slate-500">
            <TabsContent value="profile" className="space-y-4 px-1 pb-6">
              <form onSubmit={handleSubmit} className="space-y-6">
                {/* Personal Information */}
                <div className="space-y-4">
                  <h3 className="font-semibold text-fixed">Personal Information</h3>
                  
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

                  <div>
                    <Label htmlFor="company">Company *</Label>
                    <Select
                      value={formData.companyId}
                      onValueChange={(value) => handleInputChange('companyId', value)}
                    >
                      <SelectTrigger data-testid="select-contractor-company">
                        <SelectValue placeholder="Select company..." />
                      </SelectTrigger>
                      <SelectContent>
                        {companies.map((company) => (
                          <SelectItem key={company.id} value={company.id}>
                            {company.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="email">Email Address *</Label>
                      <Input
                        id="email"
                        type="email"
                        value={formData.email}
                        onChange={(e) => handleInputChange('email', e.target.value)}
                        required
                        data-testid="input-contractor-email"
                      />
                    </div>
                    <div>
                      <Label htmlFor="phone">Phone Number *</Label>
                      <Input
                        id="phone"
                        value={formData.phone}
                        onChange={(e) => handleInputChange('phone', e.target.value)}
                        required
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
                        placeholder=""
                        data-testid="input-contractor-postcode"
                      />
                      <p className="text-xs text-variable mt-1">For CO2 emissions calculation</p>
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
                      <p className="text-xs text-variable mt-1">For CO2 emissions calculation</p>
                    </div>
                  </div>
                </div>

                {/* Right to Work & Competence Cards — now managed via Certificates panel */}
                <div className="space-y-3">
                  <h3 className="font-semibold text-fixed flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-blue-600" />
                    Right to Work &amp; Competence Cards
                  </h3>
                  <div className="flex items-start gap-3 p-4 border border-blue-200 rounded-lg bg-blue-50/50">
                    <Info className="w-4 h-4 text-blue-600 mt-0.5 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-blue-900">Managed in the worker profile</p>
                      <p className="text-xs text-blue-700 mt-0.5">
                        Right to Work, CSCS card, IPAF card, and all other qualifications are now uploaded
                        with file evidence in the <strong>Certificates &amp; Qualifications</strong> section
                        of the full worker profile. Status and expiry are tracked automatically from the uploaded documents.
                      </p>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="mt-2 h-7 text-xs border-blue-300 text-blue-700 hover:bg-blue-100"
                        onClick={() => { onOpenChange(false); setLocation(`/contractors/${formData.companyId}?tab=workers&workerId=${worker.id}`); }}
                      >
                        <ExternalLink className="w-3 h-3 mr-1.5" />
                        View Certificates &amp; Qualifications
                      </Button>
                    </div>
                  </div>
                </div>

                {/* Training Certificates */}
                <div className="space-y-3">
                  <h3 className="font-semibold text-fixed flex items-center gap-2">
                    <FileText className="w-4 h-4 text-blue-600" />
                    Training Certificates
                  </h3>
                  <div className="flex items-start gap-3 p-3 border border-blue-200 rounded-lg bg-blue-50/50">
                    <Info className="w-4 h-4 text-blue-600 mt-0.5 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-blue-800">
                        Training certificates (Asbestos Awareness, Manual Handling, etc.) are now uploaded
                        with file evidence in the <strong>Certificates &amp; Qualifications</strong> section
                        of the full worker profile.
                      </p>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="mt-2 h-7 text-xs border-blue-300 text-blue-700 hover:bg-blue-100"
                        onClick={() => { onOpenChange(false); setLocation(`/contractors/${formData.companyId}?tab=workers&workerId=${worker.id}`); }}
                      >
                        <ExternalLink className="w-3 h-3 mr-1.5" />
                        View Certificates &amp; Qualifications
                      </Button>
                    </div>
                  </div>

                  {/* Site Induction row with Send Link button */}
                  <div className={`flex items-start gap-3 p-3 border rounded-lg transition-colors ${
                    formData.inductionCompleted
                      ? 'border-blue-300 bg-blue-50/60'
                      : 'border-gray-200 bg-white/50'
                  }`}>
                    <label className="flex items-start gap-3 flex-1 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formData.inductionCompleted}
                        onChange={(e) => handleInputChange('inductionCompleted', e.target.checked)}
                        className="mt-0.5 h-4 w-4 accent-blue-600 flex-shrink-0"
                      />
                      <div className="flex-1">
                        <div className={`text-sm font-medium ${formData.inductionCompleted ? 'text-blue-700' : 'text-fixed'}`}>
                          Site Induction Completed
                        </div>
                        <div className="text-xs text-gray-500 mt-0.5">Site-specific H&S briefing completed</div>
                      </div>
                    </label>
                    <div className="flex flex-col items-end gap-1 ml-2">
                      <Button
                        type="button"
                        size="sm"
                        variant={formData.inductionCompleted ? 'outline' : 'default'}
                        className="text-xs whitespace-nowrap"
                        disabled={!activeWorker?.email || sendInductionMutation.isPending}
                        onClick={() => sendInductionMutation.mutate()}
                        title={!activeWorker?.email ? 'No email address on file' : undefined}
                      >
                        {sendInductionMutation.isPending ? (
                          <span className="flex items-center gap-1"><span className="animate-spin inline-block w-3 h-3 border-2 border-current border-t-transparent rounded-full" /> Sending…</span>
                        ) : (
                          <span className="flex items-center gap-1"><Send className="w-3 h-3" />{formData.inductionCompleted ? 'Re-send Link' : 'Send Link'}</span>
                        )}
                      </Button>
                      {inductionLinkSentEmail && (
                        <span className="text-xs text-green-600 flex items-center gap-1">
                          <CheckCircle className="w-3 h-3" /> Sent to {inductionLinkSentEmail}
                        </span>
                      )}
                      {!worker?.email && (
                        <span className="text-xs text-gray-400">No email on file</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Compliance Summary */}
                <div className="space-y-3">
                  <h3 className="font-semibold text-fixed flex items-center gap-2">
                    <Shield className="w-4 h-4 text-blue-600" />
                    Compliance Summary
                  </h3>
                  <div className="border rounded-lg divide-y divide-gray-100 overflow-hidden">
                    {[
                      { label: 'Site Induction', value: formData.inductionCompleted ? 'completed' : 'not_completed' },
                      { label: 'H&S Rules', value: worker.hsRulesAccepted ? 'accepted' : 'not_accepted' },
                    ].map(({ label, value }) => {
                      const badge = (() => {
                        if (value === 'completed' || value === 'accepted') return { text: value === 'accepted' ? 'Accepted' : 'Completed', cls: 'bg-green-100 text-green-800', icon: '✅' };
                        return { text: value === 'not_completed' ? 'Not completed' : 'Not accepted', cls: 'bg-gray-100 text-gray-500', icon: '—' };
                      })();
                      return (
                        <div key={label} className="flex items-center justify-between px-4 py-2.5 text-sm">
                          <span className="text-fixed">{label}</span>
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${badge.cls}`}>
                            {badge.icon} {badge.text}
                          </span>
                        </div>
                      );
                    })}
                    <div className="flex items-center gap-2 px-4 py-2.5 text-xs text-blue-700 bg-blue-50/40">
                      <Info className="w-3 h-3 shrink-0" />
                      Certificate compliance (Right to Work, CSCS, IPAF, training) is tracked in the worker's
                      Certificates &amp; Qualifications panel.
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
                      <div className="flex flex-col gap-1">
                        <Button
                          type="button"
                          onClick={() => setShowHostSelection(true)}
                          disabled={checkInMutation.isPending || !formData.inductionCompleted}
                          className="bg-green-600 hover:bg-green-700 text-white disabled:opacity-50 disabled:cursor-not-allowed"
                          data-testid="button-contractor-checkin"
                          title={!formData.inductionCompleted ? 'Site induction must be completed before check-in' : undefined}
                        >
                          <CheckCircle className="h-4 w-4 mr-2" />
                          Check In
                        </Button>
                        {!formData.inductionCompleted && (
                          <p className="text-xs text-amber-600 flex items-center gap-1">
                            ⚠️ Site induction required before check-in
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                  
                  <div className="flex gap-2 flex-wrap">
                    {(activeWorker as any)?.isActive !== false ? (
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setShowArchiveDialog(true)}
                        className="border-amber-300 text-amber-700 hover:bg-amber-50"
                        data-testid="button-archive-worker"
                      >
                        <Archive className="h-4 w-4 mr-2" />
                        Archive Worker
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        variant="outline"
                        disabled={unarchiveWorkerMutation.isPending}
                        onClick={() => worker && unarchiveWorkerMutation.mutate(worker.id)}
                        className="border-green-300 text-green-700 hover:bg-green-50"
                        data-testid="button-unarchive-worker"
                      >
                        <ArchiveRestore className="h-4 w-4 mr-2" />
                        Reactivate Worker
                      </Button>
                    )}
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
                <div className="text-center py-8 text-variable">
                  No visit history found for this contractor
                </div>
              ) : (
                <div className="space-y-4">
                  {workerHistory.map((visit, index) => (
                    <div key={visit.id} className="bg-white/50 rounded-lg p-4 space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Clock className="h-4 w-4 text-variable" />
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
                          <span className="text-variable">Check-in:</span>
                          <div className="font-medium">
                            {format(new Date(visit.checkedInAt), 'dd/MM/yyyy HH:mm')}
                          </div>
                        </div>
                        
                        <div>
                          <span className="text-variable">Check-out:</span>
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
                          <span className="text-variable">Duration: </span>
                          <span className="font-medium">{visit.duration}</span>
                        </div>
                      )}
                      
                      {visit.purpose && (
                        <div className="text-sm">
                          <span className="text-variable">Purpose: </span>
                          <span className="font-medium">{visit.purpose}</span>
                        </div>
                      )}

                      <div className="text-sm pt-1 border-t border-gray-100">
                        <span className="text-variable flex items-center gap-1">
                          <ShieldCheck size={13} />
                          H&amp;S Rules:{" "}
                        </span>
                        {visit.hsRulesAccepted ? (
                          <span className="font-medium text-green-700 flex items-center gap-1">
                            <CheckCircle size={13} className="flex-shrink-0" />
                            Accepted
                            {visit.hsRulesAcceptedAt && (
                              <span className="text-gray-500 font-normal ml-1">
                                — {format(new Date(visit.hsRulesAcceptedAt), 'dd/MM/yyyy HH:mm')}
                              </span>
                            )}
                          </span>
                        ) : (
                          <span className="font-medium text-amber-600 flex items-center gap-1">
                            <XCircle size={13} className="flex-shrink-0" />
                            Not accepted / Not required at time of visit
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="hs-documents" className="space-y-4 px-1">
              {/* Worker Documents Section - Show uploaded documents FIRST */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-fixed flex items-center gap-2">
                    <Upload className="h-5 w-5" />
                    Worker Documents
                  </h3>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="ml-1">
                      {workerDocuments.length}
                    </Badge>
                    {activeWorker?.email && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-xs h-7 border-blue-300 text-blue-700 hover:bg-blue-50"
                        onClick={() => requestDocumentsMutation.mutate()}
                        disabled={requestDocumentsMutation.isPending}
                        title={`Send a secure upload link to ${activeWorker.email}`}
                      >
                        {requestDocumentsMutation.isPending
                          ? <><span className="animate-spin mr-1">⏳</span>Sending…</>
                          : <><Send className="h-3 w-3 mr-1" />Request Documents</>
                        }
                      </Button>
                    )}
                  </div>
                </div>

                {/* Document Upload Form */}
                <div className="bg-white/80 border border-slate-200 rounded-lg p-4">
                  <h4 className="font-medium text-fixed mb-3 flex items-center gap-2">
                    <FileText className="h-4 w-4" />
                    Upload New Document
                  </h4>
                  
                  <div className="space-y-3">
                    {/* File Input */}
                    <div>
                      <Label htmlFor="document-file" data-testid="label-document-file">Select Document</Label>
                      <Input
                        id="document-file"
                        type="file"
                        accept=".pdf,.jpg,.jpeg,.png"
                        onChange={(e) => { setSelectedFile(e.target.files?.[0] || null); setAiExtracted(false); }}
                        disabled={isUploading}
                        className="cursor-pointer"
                        data-testid="input-document-file"
                      />
                      {selectedFile && (
                        <div className="mt-2 flex items-center gap-2 flex-wrap">
                          <p className="text-sm text-variable" data-testid="text-selected-file">
                            Selected: {selectedFile.name}
                          </p>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={scanDocument}
                            disabled={isScanningDoc || isUploading}
                            className="text-purple-700 border-purple-300 hover:bg-purple-50 dark:text-purple-300 dark:border-purple-700 dark:hover:bg-purple-950"
                            data-testid="button-scan-document"
                          >
                            {isScanningDoc ? (
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

                    {/* Document Type */}
                    <div>
                      <Label htmlFor="document-type" data-testid="label-document-type">Document Type</Label>
                      <Select
                        value={documentFormData.documentType}
                        onValueChange={(value) => setDocumentFormData(prev => ({ ...prev, documentType: value }))}
                        disabled={isUploading}
                      >
                        <SelectTrigger id="document-type" data-testid="select-document-type">
                          <SelectValue placeholder="Select document type" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="right_to_work">Right to Work</SelectItem>
                          <SelectItem value="cscs_card">CSCS Card</SelectItem>
                          <SelectItem value="ipaf_card">IPAF Card</SelectItem>
                          <SelectItem value="cpcs_card">CPCS Card</SelectItem>
                          <SelectItem value="asbestos_awareness">Asbestos Awareness</SelectItem>
                          <SelectItem value="manual_handling">Manual Handling</SelectItem>
                          <SelectItem value="working_at_height">Working at Height</SelectItem>
                          <SelectItem value="first_aid">First Aid Certificate</SelectItem>
                          <SelectItem value="certification">Other Certification</SelectItem>
                          <SelectItem value="training">Training Certificate</SelectItem>
                          <SelectItem value="other">Other</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Expiry Date */}
                    <div>
                      <Label htmlFor="expiry-date" data-testid="label-expiry-date">Expiry Date (Optional)</Label>
                      <Input
                        id="expiry-date"
                        type="date"
                        value={documentFormData.expiryDate}
                        onChange={(e) => setDocumentFormData(prev => ({ ...prev, expiryDate: e.target.value }))}
                        disabled={isUploading}
                        data-testid="input-expiry-date"
                      />
                    </div>

                    {/* Issued By */}
                    <div>
                      <Label htmlFor="issued-by" data-testid="label-issued-by">Issued By (Optional)</Label>
                      <Input
                        id="issued-by"
                        type="text"
                        placeholder=""
                        value={documentFormData.issuedBy}
                        onChange={(e) => setDocumentFormData(prev => ({ ...prev, issuedBy: e.target.value }))}
                        disabled={isUploading}
                        data-testid="input-issued-by"
                      />
                    </div>

                    {/* Policy Number */}
                    <div>
                      <Label htmlFor="policy-number" data-testid="label-policy-number">Policy/Certificate Number (Optional)</Label>
                      <Input
                        id="policy-number"
                        type="text"
                        placeholder=""
                        value={documentFormData.policyNumber}
                        onChange={(e) => setDocumentFormData(prev => ({ ...prev, policyNumber: e.target.value }))}
                        disabled={isUploading}
                        data-testid="input-policy-number"
                      />
                    </div>

                    {/* AI-extracted notice */}
                    {aiExtracted && (
                      <div className="flex items-center gap-1.5 text-xs text-purple-700 dark:text-purple-300 bg-purple-50 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-800 rounded-md px-3 py-2">
                        <Sparkles className="h-3.5 w-3.5 shrink-0" />
                        AI-extracted — please verify the fields above before saving.
                      </div>
                    )}

                    {/* Upload Button */}
                    <div className="flex justify-end gap-2">
                      {selectedFile && (
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => {
                            setSelectedFile(null);
                            setAiExtracted(false);
                            setDocumentFormData({
                              documentType: '',
                              expiryDate: '',
                              issuedBy: '',
                              policyNumber: '',
                            });
                          }}
                          disabled={isUploading}
                          data-testid="button-cancel-upload"
                        >
                          Cancel
                        </Button>
                      )}
                      <Button
                        type="button"
                        onClick={() => {
                          if (selectedFile && documentFormData.documentType) {
                            uploadDocumentMutation.mutate(selectedFile);
                          } else {
                            toast({
                              title: 'Missing Information',
                              description: 'Please select a file and document type',
                              variant: 'destructive',
                            });
                          }
                        }}
                        disabled={!selectedFile || !documentFormData.documentType || isUploading}
                        className="bg-blue-600 hover:bg-blue-700 text-white"
                        data-testid="button-upload-document"
                      >
                        {isUploading ? (
                          <>
                            <RotateCcw className="h-4 w-4 mr-2 animate-spin" />
                            Uploading... {uploadProgress}%
                          </>
                        ) : (
                          <>
                            <Upload className="h-4 w-4 mr-2" />
                            Upload Document
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                </div>

                {/* Uploaded Documents List */}
                {documentsLoading ? (
                  <div className="text-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto"></div>
                    <p className="text-variable mt-2">Loading documents...</p>
                  </div>
                ) : workerDocuments.length === 0 ? (
                  <div className="text-center py-8 text-variable">
                    <FileText className="h-12 w-12 text-slate-300 mx-auto mb-3" />
                    <p className="font-medium">No documents uploaded</p>
                    <p className="text-sm">Upload worker certifications, insurance, and compliance documents above</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {workerDocuments.map((doc: any) => {
                      const isExpired = doc.expiryDate && new Date(doc.expiryDate) < new Date();
                      const isExpiringSoon = doc.expiryDate && 
                        new Date(doc.expiryDate) > new Date() && 
                        new Date(doc.expiryDate) < new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

                      return (
                        <div key={doc.id} className="bg-white/50 rounded-lg p-4 space-y-3 border border-slate-200" data-testid={`document-card-${doc.id}`}>
                          <div className="flex items-start justify-between">
                            <div className="flex items-start gap-3 flex-1">
                              <FileText className="h-5 w-5 text-blue-500 mt-0.5" />
                              <div className="flex-1">
                                <h4 className="font-semibold text-fixed" data-testid={`text-document-name-${doc.id}`}>
                                  {doc.documentName}
                                </h4>
                                <div className="flex items-center gap-2 mt-1">
                                  <Badge variant="secondary" className="text-xs">
                                    {doc.documentType.replace('_', ' ').toUpperCase()}
                                  </Badge>
                                  {isExpired && (
                                    <Badge className="bg-red-500 text-white text-xs">Expired</Badge>
                                  )}
                                  {isExpiringSoon && (
                                    <Badge className="bg-yellow-500 text-white text-xs">Expiring Soon</Badge>
                                  )}
                                </div>
                              </div>
                            </div>
                            <div className="flex gap-2">
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => window.open(doc.documentUrl, '_blank')}
                                className="text-blue-600 border-blue-200 hover:bg-blue-50"
                                data-testid={`button-view-${doc.id}`}
                              >
                                <Eye className="h-3 w-3" />
                              </Button>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  if (confirm('Are you sure you want to delete this document?')) {
                                    deleteDocumentMutation.mutate(doc.id);
                                  }
                                }}
                                disabled={deleteDocumentMutation.isPending}
                                className="text-red-600 border-red-200 hover:bg-red-50"
                                data-testid={`button-delete-${doc.id}`}
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-4 text-sm">
                            {doc.expiryDate && (
                              <div>
                                <span className="text-variable flex items-center gap-1">
                                  <Calendar className="h-3 w-3" />
                                  Expiry Date:
                                </span>
                                <div className={`font-medium ${isExpired ? 'text-red-600' : isExpiringSoon ? 'text-yellow-600' : 'text-fixed'}`}>
                                  {format(new Date(doc.expiryDate), 'dd/MM/yyyy')}
                                </div>
                              </div>
                            )}
                            
                            <div>
                              <span className="text-variable">Uploaded:</span>
                              <div className="font-medium text-fixed">
                                {format(new Date(doc.uploadedAt), 'dd/MM/yyyy')}
                              </div>
                            </div>

                            {doc.issuedBy && (
                              <div>
                                <span className="text-variable">Issued By:</span>
                                <div className="font-medium text-fixed">{doc.issuedBy}</div>
                              </div>
                            )}

                            {doc.policyNumber && (
                              <div>
                                <span className="text-variable">Policy Number:</span>
                                <div className="font-medium text-fixed">{doc.policyNumber}</div>
                              </div>
                            )}
                          </div>

                          <div className="flex items-center gap-2 text-xs text-variable pt-2 border-t border-slate-200">
                            <span>Status: {doc.status}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Separator between Worker Documents and H&S Assignments */}
              <div className="my-6 border-t border-slate-200" />

              {/* H&S Document Assignments Section - Below Worker Documents */}
              <div>
                <h3 className="text-lg font-semibold text-fixed flex items-center gap-2 mb-4">
                  <Shield className="h-5 w-5" />
                  H&S Document Assignments
                </h3>
                
                {hsLoading ? (
                  <div className="text-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto"></div>
                    <p className="text-variable mt-2">Loading H&S assignments...</p>
                  </div>
                ) : hsAssignments.length === 0 ? (
                  <div className="text-center py-8 text-variable">
                    <Shield className="h-12 w-12 text-slate-300 mx-auto mb-3" />
                    <p className="font-medium">No H&S assignments</p>
                    <p className="text-sm">No UK H&S document templates assigned yet</p>
                  </div>
                ) : (
                <div className="space-y-4">
                  {hsAssignments.map((item) => {
                    const { assignment, template } = item;

                    if (!assignment || !template) return null;
                    
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
                          return 'bg-slate-100 text-fixed';
                      }
                    };

                    const canResend = ['pending', 'expired', 'rejected'].includes(assignment.status);

                    return (
                      <div key={assignment.id} className="bg-white/50 rounded-lg p-4 space-y-3">
                        <div className="flex items-start justify-between">
                          <div className="flex items-start gap-3 flex-1">
                            <FileText className="h-5 w-5 text-variable mt-0.5" />
                            <div className="flex-1">
                              <div className="flex items-start justify-between mb-2">
                                <div>
                                  <h4 className="font-semibold text-fixed">{template.documentName}</h4>
                                  {template.documentDescription && (
                                    <p className="text-sm text-variable mt-1">{template.documentDescription}</p>
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
                                  <span className="text-xs text-variable">
                                    {template.legalReference}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4 text-sm">
                          <div>
                            <span className="text-variable flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              Assigned:
                            </span>
                            <div className="font-medium">
                              {format(new Date(assignment.assignedAt), 'dd/MM/yyyy HH:mm')}
                            </div>
                          </div>
                          
                          {assignment.emailSentAt && (
                            <div>
                              <span className="text-variable flex items-center gap-1">
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
                              <span className="text-variable flex items-center gap-1">
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
                              <span className="text-variable flex items-center gap-1">
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
                              <span className="text-variable flex items-center gap-1">
                                <AlertTriangle className="h-3 w-3" />
                                Due date:
                              </span>
                              <div className={`font-medium ${
                                new Date(assignment.dueDate) < new Date() ? 'text-red-600' : 'text-fixed'
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
                          <div className="mt-2 p-2 bg-[var(--background)] rounded text-sm">
                            <span className="text-fixed font-medium">Notes: </span>
                            <span className="text-variable">{assignment.notes}</span>
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
              </div>
            </TabsContent>

            <TabsContent value="notes" className="space-y-4 px-1">
              {/* Audit Trail Display */}
              {notesLoading ? (
                <div className="text-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto"></div>
                  <p className="text-variable mt-2">Loading audit trail...</p>
                </div>
              ) : workerNotes.length === 0 ? (
                <div className="text-center py-8 text-variable">
                  <FileText className="h-12 w-12 mx-auto mb-4 text-variable" />
                  <p className="text-lg font-medium">No audit trail entries</p>
                  <p className="text-sm">Changes to this worker will appear here</p>
                </div>
              ) : (
                <div className="space-y-4">
                  <h4 className="font-medium text-fixed flex items-center gap-2">
                    <FileText className="h-4 w-4" />
                    All Changes & Notes ({workerNotes.length})
                  </h4>
                  <ScrollArea className="h-96">
                    <div className="space-y-3">
                      {workerNotes.map((note: any, index: number) => (
                        <div key={note.id || index} className="border border-slate-200 rounded-lg p-4 bg-slate-50/50">
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <Badge variant={
                                note.changeType === 'card_reset' || note.changeType === 'card_status_change' ? 'destructive' :
                                note.changeType === 'card_issued' ? 'destructive' :
                                note.changeType === 'worker_archived' ? 'destructive' :
                                note.changeType === 'worker_unarchived' ? 'default' :
                                note.changeType === 'worker_created' ? 'default' :
                                note.changeType === 'check_in' ? 'default' :
                                note.changeType === 'check_out' ? 'secondary' :
                                note.changeType === 'certification_update' ? 'default' : 
                                note.changeType === 'hs_acceptance' ? 'secondary' : 
                                note.changeType === 'document_upload' ? 'outline' :
                                note.changeType === 'manual_note' ? 'default' :
                                'outline'
                              }>
                                {(note.changeType === 'card_reset' || note.changeType === 'card_status_change') && 'Card Status'}
                                {note.changeType === 'card_issued' && 'Card Issued'}
                                {note.changeType === 'worker_archived' && 'Archived'}
                                {note.changeType === 'worker_unarchived' && 'Reactivated'}
                                {note.changeType === 'worker_created' && 'Created'}
                                {note.changeType === 'check_in' && 'Check In'}
                                {note.changeType === 'check_out' && 'Check Out'}
                                {note.changeType === 'certification_update' && 'Certification Update'}
                                {note.changeType === 'hs_acceptance' && 'H&S Acceptance'}
                                {note.changeType === 'profile_update' && 'Profile Update'}
                                {note.changeType === 'document_upload' && 'Document Upload'}
                                {note.changeType === 'manual_note' && 'Manual Note'}
                                {!['card_reset', 'card_status_change', 'card_issued', 'worker_archived', 'worker_unarchived', 'worker_created', 'check_in', 'check_out', 'certification_update', 'hs_acceptance', 'profile_update', 'document_upload', 'manual_note'].includes(note.changeType) && note.changeType}
                              </Badge>
                              <span className="text-sm text-variable">{note.changedBy || 'System'}</span>
                            </div>
                            <span className="text-xs text-variable">
                              {note.changedAt ? format(new Date(note.changedAt), 'dd/MM/yyyy HH:mm') : 'Unknown date'}
                            </span>
                          </div>
                          
                          {note.oldValue && note.newValue && (
                            <div className="text-sm space-y-1">
                              <div className="flex items-center gap-2">
                                <span className="text-variable">From:</span>
                                <span className="bg-red-100 text-red-800 px-2 py-1 rounded">{note.oldValue}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-variable">To:</span>
                                <span className="bg-green-100 text-green-800 px-2 py-1 rounded">{note.newValue}</span>
                              </div>
                            </div>
                          )}
                          
                          {note.notes && (
                            <p className="text-sm text-variable mt-2 italic">"{note.notes}"</p>
                          )}
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </div>
              )}
            </TabsContent>
          </div>
        </Tabs>
      </DialogContent>
    </Dialog>
    
    {/* Archive Confirmation Dialog */}
    <Dialog open={showArchiveDialog} onOpenChange={(open) => { if (!open) { setShowArchiveDialog(false); setArchiveReason(''); } }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-amber-700">
            <Archive className="h-5 w-5" />
            Archive Worker
          </DialogTitle>
          <DialogDescription>
            Archiving <strong>{activeWorker?.firstName} {activeWorker?.lastName}</strong> will remove them from all active lists, kiosk check-ins, and musters. Their full history and audit trail will be preserved. You can reactivate them at any time.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="archiveReason">Reason for archiving (optional)</Label>
            <Textarea
              id="archiveReason"
              value={archiveReason}
              onChange={(e) => setArchiveReason(e.target.value)}
              placeholder="e.g. Left the company, contract ended, TUPE transfer..."
              rows={3}
            />
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => { setShowArchiveDialog(false); setArchiveReason(''); }}>
            Cancel
          </Button>
          <Button
            disabled={archiveWorkerMutation.isPending}
            onClick={() => {
              if (worker) {
                archiveWorkerMutation.mutate({ workerId: worker.id, reason: archiveReason });
              }
            }}
            className="bg-amber-600 hover:bg-amber-700 text-white"
          >
            <Archive className="h-4 w-4 mr-2" />
            {archiveWorkerMutation.isPending ? 'Archiving...' : 'Archive Worker'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    {/* Host Selection Dialog for Check-in */}
    <Dialog open={showHostSelection} onOpenChange={(open) => { if (!open) { setShowHostSelection(false); setSelectedHostId(''); } }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Select Host for {activeWorker?.firstName} {activeWorker?.lastName}</DialogTitle>
          <DialogDescription>Who is {activeWorker?.firstName} {activeWorker?.lastName} visiting today?</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="hostStaffMember">Host Staff Member *</Label>
            <Select value={selectedHostId} onValueChange={setSelectedHostId}>
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
          <Button variant="outline" onClick={() => { setShowHostSelection(false); setSelectedHostId(''); }}>
            Cancel
          </Button>
          <Button
            disabled={!selectedHostId}
            onClick={() => {
              setShowHostSelection(false);
              setShowHSModal(true);
            }}
            className="bg-green-600 hover:bg-green-700 text-white"
          >
            Continue to Check In
          </Button>
        </DialogFooter>
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