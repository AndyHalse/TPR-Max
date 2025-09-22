import { useState, useMemo } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { ContractorWorker, CardOffence, CardIssue, WorkerCertification } from "@shared/schema";
import { z } from "zod";
import { toast } from "@/hooks/use-toast";
import { 
  Building2, Users, FileText, Shield, AlertTriangle, CheckCircle2, 
  Calendar, MapPin, Phone, Mail, User, Award, Leaf, TrendingUp,
  XCircle, Clock, AlertCircle
} from "lucide-react";
import { CO2SustainabilityReports } from "@/components/CO2SustainabilityReports";
import { apiRequest } from "@/lib/queryClient";
import { WorkerCard } from "@/components/WorkerCard";
import ContractorPassPreviewModal from "@/components/ContractorPassPreviewModal";
import { ContractorEditModal } from "@/components/ContractorEditModal";
// Removed ContractorHSModal - H&S acceptance now happens via e-pass link

// Helper function to get safety rating colors
const getSafetyRatingColor = (rating: string) => {
  if (rating.startsWith('A')) return 'text-green-600';
  if (rating.startsWith('B')) return 'text-yellow-600';
  if (rating.startsWith('C')) return 'text-orange-600';
  if (rating.startsWith('D')) return 'text-red-600';
  if (rating === 'F') return 'text-red-800';
  return 'text-blue-600';
};

export default function ContractorDetails() {
  const { id } = useParams();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const [issuingCard, setIssuingCard] = useState(false);
  const [addingCertification, setAddingCertification] = useState(false);
  const [addingWorker, setAddingWorker] = useState(false);
  const [viewingWorker, setViewingWorker] = useState<ContractorWorker | null>(null);
  const [selectedWorkerForEdit, setSelectedWorkerForEdit] = useState<ContractorWorker | null>(null);
  const [selectedWorkerForPrint, setSelectedWorkerForPrint] = useState<ContractorWorker | null>(null);
  // Removed H&S modal state - H&S acceptance now happens via e-pass link

  // Fetch contractor details
  const { data: contractor, isLoading } = useQuery({
    queryKey: [`/api/contractors/${id}`],
    staleTime: 0, // Always fetch fresh data for dynamic ratings
    cacheTime: 0, // Don't cache since ratings are dynamic
  });

  // Fetch card offences for card issue form
  const { data: cardOffences = [] } = useQuery<CardOffence[]>({
    queryKey: ['/api/card-offences'],
  });

  // Staff query for host selection (same as visitor workflow)
  const { data: staff = [] } = useQuery<any[]>({
    queryKey: ["/api/staff"],
  });

  // Form for issuing card violations
  const cardIssueForm = useForm({
    resolver: zodResolver(z.object({
      workerId: z.string().min(1, "Worker is required"),
      offenceId: z.string().min(1, "Offence is required"),
      cardType: z.enum(["red", "yellow"]),
      description: z.string().min(1, "Description is required"),
      witness: z.string().optional(),
      location: z.string().optional(),
    })),
    defaultValues: {
      workerId: "",
      offenceId: "",
      cardType: "yellow" as const,
      description: "",
      witness: "",
      location: "",
    }
  });

  // Form for adding certifications
  const certificationForm = useForm({
    resolver: zodResolver(z.object({
      workerId: z.string().min(1, "Worker is required"),
      certificationType: z.string().min(1, "Certification type is required"),
      certificationNumber: z.string().optional(),
      issuer: z.string().optional(),
      notes: z.string().optional(),
    })),
    defaultValues: {
      workerId: "",
      certificationType: "",
      certificationNumber: "",
      issuer: "",
      notes: "",
    }
  });

  // Form for adding workers
  const workerForm = useForm({
    resolver: zodResolver(z.object({
      firstName: z.string().min(1, "First name is required"),
      lastName: z.string().min(1, "Last name is required"),
      email: z.string().email("Valid email is required").optional(),
      phone: z.string().optional(),
      postcode: z.string().min(1, "Postcode is required"),
      transportMethod: z.enum(["car_diesel", "car_petrol", "electric_car", "public_transport", "motorcycle"]),
      rightToWork: z.string().min(1, "Right to work status is required"),
      cscsCard: z.string().optional(),
      cscsStatus: z.enum(["valid", "expired", "none", "pending"]),
      ipafStatus: z.enum(["valid", "expired", "none", "pending"]),
      asbestosAwareness: z.boolean(),
      manualHandling: z.boolean(),
      workingAtHeight: z.boolean(),
      inductionCompleted: z.boolean(),
      isActive: z.boolean(),
    })),
    defaultValues: {
      firstName: "",
      lastName: "",
      email: "",
      phone: "",
      postcode: "",
      transportMethod: "car_diesel" as const,
      rightToWork: "valid",
      cscsCard: "",
      cscsStatus: "valid" as const,
      ipafStatus: "none" as const,
      asbestosAwareness: false,
      manualHandling: false,
      workingAtHeight: false,
      inductionCompleted: false,
      isActive: true,
    }
  });

  // Issue card mutation
  const issueCardMutation = useMutation({
    mutationFn: (data: any) => apiRequest('POST', `/api/card-issues`, data),
    onSuccess: () => {
      toast({ title: "Card issued successfully" });
      queryClient.invalidateQueries({ queryKey: [`/api/contractors/${id}`] });
      setIssuingCard(false);
      cardIssueForm.reset();
    },
    onError: (error: any) => {
      toast({ 
        title: "Failed to issue card", 
        description: error.message,
        variant: "destructive" 
      });
    }
  });

  // Add certification mutation
  const addCertificationMutation = useMutation({
    mutationFn: (data: any) => apiRequest('POST', `/api/workers/${data.workerId}/certifications`, data),
    onSuccess: () => {
      toast({ title: "Certification added successfully" });
      queryClient.invalidateQueries({ queryKey: [`/api/contractors/${id}`] });
      setAddingCertification(false);
      certificationForm.reset();
    },
    onError: (error: any) => {
      toast({ 
        title: "Failed to add certification", 
        description: error.message,
        variant: "destructive" 
      });
    }
  });

  // Add worker mutation
  const addWorkerMutation = useMutation({
    mutationFn: (data: any) => apiRequest('POST', `/api/contractors/${id}/workers`, data),
    onSuccess: () => {
      toast({ title: "Worker added successfully" });
      queryClient.invalidateQueries({ queryKey: [`/api/contractors/${id}`] });
      setAddingWorker(false);
      workerForm.reset();
    },
    onError: (error: any) => {
      toast({ 
        title: "Failed to add worker", 
        description: error.message,
        variant: "destructive" 
      });
    }
  });

  const handleIssueCard = (data: any) => {
    // Prepare the data with required fields for the API
    const cardData = {
      ...data,
      issuedBy: "b7b74fa2-1a48-43d1-b71c-39fd9697b2ea",  // Use actual developer user ID
      status: "active",
      photos: [],
      contractorId: id
    };
    console.log("🔴 Issuing card with data:", cardData);
    issueCardMutation.mutate(cardData);
  };

  const handleAddCertification = (data: any) => {
    // Prepare certification data
    const certData = {
      ...data,
      status: "valid",
      contractorId: id
    };
    console.log("🎓 Adding certification with data:", certData);
    addCertificationMutation.mutate(certData);
  };

  const handleAddWorker = (data: any) => {
    // Prepare worker data
    const workerData = {
      ...data,
      companyId: id,
    };
    console.log("👷 Adding worker with data:", workerData);
    addWorkerMutation.mutate(workerData);
  };

  // Check-in mutation - sends e-pass directly like visitor flow
  const checkInMutation = useMutation({
    mutationFn: async (worker: ContractorWorker) => {
      const response = await apiRequest('POST', `/api/contractors/workers/${worker.id}/checkin`, {
        purpose: 'Site work',
        // H&S rules will be accepted via e-pass link, not in app
        hsRulesAccepted: false,
      });
      return response.json();
    },
    onSuccess: (data) => {
      if (data.hasEmail && data.ePassSent) {
        toast({ 
          title: "E-Pass sent successfully",
          description: "Check-in e-pass has been sent to the worker's email"
        });
      } else if (data.hasEmail && !data.ePassSent) {
        toast({ 
          title: "Check-in initiated",
          description: "Failed to send e-pass, but worker is registered",
          variant: "destructive"
        });
      } else {
        toast({ 
          title: "Check-in initiated",
          description: "Worker checked in (no email on file)",
          variant: "secondary"
        });
      }
      queryClient.invalidateQueries({ queryKey: [`/api/contractors/${id}`] });
    },
    onError: (error: any) => {
      toast({ 
        title: "Failed to check in worker", 
        description: error.message,
        variant: "destructive" 
      });
    }
  });

  // Check-out mutation
  const checkOutMutation = useMutation({
    mutationFn: async (workerId: string) => {
      const response = await apiRequest('POST', `/api/contractors/workers/${workerId}/checkout`);
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Worker checked out successfully" });
      queryClient.invalidateQueries({ queryKey: [`/api/contractors/${id}`] });
    },
    onError: (error: any) => {
      toast({ 
        title: "Failed to check out worker", 
        description: error.message,
        variant: "destructive" 
      });
    }
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
      queryClient.invalidateQueries({ queryKey: [`/api/contractors/${id}`] });
    },
    onError: (error: any) => {
      toast({ 
        title: "Failed to reset card status", 
        description: error.message,
        variant: "destructive" 
      });
    }
  });

  // Host selection state for contractor check-in (same as visitor workflow)
  const [selectedWorkerForCheckIn, setSelectedWorkerForCheckIn] = useState<ContractorWorker | null>(null);
  const [showHostSelection, setShowHostSelection] = useState(false);
  const [selectedHostForWorker, setSelectedHostForWorker] = useState("");

  const handleWorkerCheckIn = (worker: ContractorWorker) => {
    // Show host selection dialog first (same as visitor workflow)
    setSelectedWorkerForCheckIn(worker);
    setShowHostSelection(true);
  };

  // Handle host selection confirmation
  const handleHostSelectionConfirm = async () => {
    if (!selectedWorkerForCheckIn || !selectedHostForWorker) return;
    
    try {
      // Call the API directly with hostId parameter (same as visitor workflow)
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
      queryClient.invalidateQueries({ queryKey: [`/api/contractors/${id}`] });
    } catch (error: any) {
      toast({
        title: "Check-in Failed",
        description: error.message || "Failed to check in worker",
        variant: "destructive"
      });
    }
  };

  const handleWorkerCheckOut = (workerId: string) => {
    checkOutMutation.mutate(workerId);
  };

  const handleWorkerEdit = (worker: ContractorWorker) => {
    setSelectedWorkerForEdit(worker);
  };

  const handleWorkerPrint = (worker: ContractorWorker) => {
    setSelectedWorkerForPrint(worker);
  };


  const getCertificationStatusBadge = (status: string, expiryDate?: string | null) => {
    if (status === "expired") return <Badge variant="destructive">Expired</Badge>;
    if (status === "expiring" || (expiryDate && new Date(expiryDate) < new Date())) {
      return <Badge className="bg-orange-500 hover:bg-orange-600">Expiring</Badge>;
    }
    if (status === "suspended") return <Badge variant="secondary">Suspended</Badge>;
    return <Badge className="bg-green-500 hover:bg-green-600">Valid</Badge>;
  };

  if (isLoading) {
    return (
      <div className="p-8 space-y-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-muted rounded w-1/3"></div>
          <div className="h-32 bg-muted rounded"></div>
          <div className="h-64 bg-muted rounded"></div>
        </div>
      </div>
    );
  }

  if (!contractor) {
    return (
      <div className="p-8">
        <div className="text-center space-y-4">
          <h2 className="text-2xl font-semibold">Contractor Not Found</h2>
          <p className="text-muted-foreground">The contractor you're looking for doesn't exist.</p>
          <Button onClick={() => setLocation('/contractors')} data-testid="button-back-contractors">
            Back to Contractors
          </Button>
        </div>
      </div>
    );
  }

  // Type safety for contractor data
  const contractorData = contractor as any;

  return (
    <div className="p-6 space-y-6" data-testid="contractor-details-page">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Button 
            variant="ghost" 
            onClick={() => setLocation('/contractors')}
            className="mb-2"
            data-testid="button-back-contractors"
          >
            ← Back to Contractors
          </Button>
          <h1 className="text-3xl font-bold tracking-tight" data-testid="text-contractor-name">
            {contractorData.name}
          </h1>
          <p className="text-muted-foreground" data-testid="text-contractor-description">
            {contractorData.description || "No description available"}
          </p>
        </div>
        <div className="flex gap-2">
          <Dialog open={issuingCard} onOpenChange={setIssuingCard}>
            <DialogTrigger asChild>
              <Button variant="destructive" data-testid="button-issue-card">
                <Shield className="w-4 h-4 mr-2" />
                Issue Card
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Issue Red or Yellow Card</DialogTitle>
                <DialogDescription>
                  Issue a safety violation card to a contractor worker for non-compliance or safety infractions.
                </DialogDescription>
              </DialogHeader>
              <Form {...cardIssueForm}>
                <form onSubmit={cardIssueForm.handleSubmit(handleIssueCard)} className="space-y-4">
                  <FormField
                    control={cardIssueForm.control}
                    name="workerId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Worker</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-worker">
                              <SelectValue placeholder="Select worker" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {contractorData.workers?.map((worker: ContractorWorker) => (
                              <SelectItem key={worker.id} value={worker.id}>
                                {worker.firstName} {worker.lastName}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={cardIssueForm.control}
                    name="cardType"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Card Type</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-card-type">
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="yellow">Yellow Card</SelectItem>
                            <SelectItem value="red">Red Card</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={cardIssueForm.control}
                    name="offenceId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Offence</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-offence">
                              <SelectValue placeholder="Select offence" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {cardOffences
                              .filter(offence => offence.cardType === cardIssueForm.watch('cardType'))
                              .map((offence) => (
                                <SelectItem key={offence.id} value={offence.id}>
                                  {offence.offenceName}
                                </SelectItem>
                              ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={cardIssueForm.control}
                    name="description"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Description</FormLabel>
                        <FormControl>
                          <Textarea 
                            placeholder="Describe the incident..."
                            {...field}
                            data-testid="input-description"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <div className="flex gap-2 justify-end">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setIssuingCard(false)}
                      data-testid="button-cancel"
                    >
                      Cancel
                    </Button>
                    <Button
                      type="submit"
                      disabled={issueCardMutation.isPending}
                      data-testid="button-issue-card-submit"
                    >
                      {issueCardMutation.isPending ? "Issuing..." : "Issue Card"}
                    </Button>
                  </div>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
          
          <Button 
            onClick={() => setAddingWorker(true)}
            data-testid="button-add-worker"
          >
            <User className="w-4 h-4 mr-2" />
            Add Worker
          </Button>
          
          <Dialog open={addingCertification} onOpenChange={setAddingCertification}>
            <DialogTrigger asChild>
              <Button data-testid="button-add-certification">
                <Award className="w-4 h-4 mr-2" />
                Add Certification
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add Worker Certification</DialogTitle>
                <DialogDescription>
                  Add a professional certification or training qualification for a contractor worker.
                </DialogDescription>
              </DialogHeader>
              <Form {...certificationForm}>
                <form onSubmit={certificationForm.handleSubmit(handleAddCertification)} className="space-y-4">
                  <FormField
                    control={certificationForm.control}
                    name="workerId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Worker</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-certification-worker">
                              <SelectValue placeholder="Select worker" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {contractorData.workers?.map((worker: ContractorWorker) => (
                              <SelectItem key={worker.id} value={worker.id}>
                                {worker.firstName} {worker.lastName}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={certificationForm.control}
                    name="certificationType"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Certification Type</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-certification-type">
                              <SelectValue placeholder="Select type" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="CIBT">CIBT</SelectItem>
                            <SelectItem value="CPCS">CPCS</SelectItem>
                            <SelectItem value="NVQ">NVQ</SelectItem>
                            <SelectItem value="CSCS">CSCS</SelectItem>
                            <SelectItem value="IPAF">IPAF</SelectItem>
                            <SelectItem value="PASMA">PASMA</SelectItem>
                            <SelectItem value="Other1">Other 1</SelectItem>
                            <SelectItem value="Other2">Other 2</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={certificationForm.control}
                    name="certificationNumber"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Certification Number</FormLabel>
                        <FormControl>
                          <Input 
                            placeholder="Enter certification number"
                            {...field}
                            data-testid="input-certification-number"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={certificationForm.control}
                    name="issuer"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Issuer</FormLabel>
                        <FormControl>
                          <Input 
                            placeholder="Certification issuer"
                            {...field}
                            data-testid="input-issuer"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <div className="flex gap-2 justify-end">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setAddingCertification(false)}
                      data-testid="button-cancel-certification"
                    >
                      Cancel
                    </Button>
                    <Button
                      type="submit"
                      disabled={addCertificationMutation.isPending}
                      data-testid="button-add-certification-submit"
                    >
                      {addCertificationMutation.isPending ? "Adding..." : "Add Certification"}
                    </Button>
                  </div>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Company Overview Cards */}
      <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card data-testid="card-workers-count">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Workers</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-workers-count">
              {contractorData.workers?.length || 0}
            </div>
          </CardContent>
        </Card>

        <Card data-testid="card-documents-count">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Documents</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-documents-count">
              {contractorData.documents?.length || 0}
            </div>
          </CardContent>
        </Card>

        <Card data-testid="card-compliance-status">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Compliance</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600" data-testid="text-compliance-status">
              Active
            </div>
          </CardContent>
        </Card>

        <Card data-testid="card-safety-rating">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Safety Rating</CardTitle>
            <Shield className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${getSafetyRatingColor(contractor?.complianceScore || 'A+')}`} data-testid="text-safety-rating">
              {contractor?.complianceScore || 'A+'}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Content Tabs */}
      <Tabs defaultValue="workers" className="space-y-4" data-testid="contractor-tabs">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="workers" data-testid="tab-workers">Workers</TabsTrigger>
          <TabsTrigger value="documents" data-testid="tab-documents">Documents</TabsTrigger>
          <TabsTrigger value="safety" data-testid="tab-safety">Safety</TabsTrigger>
          <TabsTrigger value="compliance" data-testid="tab-compliance">Compliance</TabsTrigger>
          <TabsTrigger value="reporting" data-testid="tab-reporting">Reporting</TabsTrigger>
        </TabsList>

        <TabsContent value="workers" className="space-y-4" data-testid="workers-tab-content">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {contractorData.workers?.length > 0 ? (
              contractorData.workers.map((worker: ContractorWorker) => (
                <WorkerCard
                  key={worker.id}
                  worker={worker}
                  onCheckIn={handleWorkerCheckIn}
                  onCheckOut={handleWorkerCheckOut}
                  onEdit={handleWorkerEdit}
                  onPrint={handleWorkerPrint}
                  onIssueCard={(workerId) => {
                    cardIssueForm.setValue('workerId', workerId);
                    setIssuingCard(true);
                  }}
                  onResetCard={(workerId) => {
                    resetCardMutation.mutate(workerId);
                  }}
                  onViewDetails={(worker) => {
                    setViewingWorker(worker);
                  }}
                  canManageCards={true}
                />
              ))
            ) : (
              <Card className="p-8 text-center col-span-full" data-testid="no-workers-message">
                <CardContent>
                  <Users className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                  <h3 className="text-lg font-semibold mb-2">No Workers Found</h3>
                  <p className="text-muted-foreground">This contractor has no workers registered yet.</p>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        <TabsContent value="documents" className="space-y-4" data-testid="documents-tab-content">
          <div className="grid gap-4">
            {contractorData.documents?.length > 0 ? (
              contractorData.documents.map((doc: any) => (
                <Card key={doc.id} data-testid={`card-document-${doc.id}`}>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-lg" data-testid={`text-document-name-${doc.id}`}>
                        {doc.documentName}
                      </CardTitle>
                      <Badge 
                        variant={doc.status === "approved" ? "default" : doc.status === "rejected" ? "destructive" : "secondary"}
                        data-testid={`badge-document-status-${doc.id}`}
                      >
                        {doc.status}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="grid md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <Calendar className="w-4 h-4 text-muted-foreground" />
                          <span className="text-sm">Uploaded: {new Date(doc.uploadedAt).toLocaleDateString()}</span>
                        </div>
                        {doc.expiryDate && (
                          <div className="flex items-center gap-2">
                            <Clock className="w-4 h-4 text-muted-foreground" />
                            <span className="text-sm">Expires: {new Date(doc.expiryDate).toLocaleDateString()}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            ) : (
              <Card>
                <CardContent className="p-6 text-center">
                  <p className="text-muted-foreground">No documents uploaded for this contractor.</p>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        <TabsContent value="safety" className="space-y-4" data-testid="safety-tab-content">
          <div className="grid gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Shield className="w-5 h-5" />
                  Red & Yellow Card System
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="grid md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <h4 className="font-medium text-red-600">Red Card Offences</h4>
                      <div className="text-sm text-muted-foreground">
                        Immediate 3-year site ban for serious safety violations
                      </div>
                      <Badge variant="outline" className="text-red-600">0 Active Issues</Badge>
                    </div>
                    <div className="space-y-2">
                      <h4 className="font-medium text-yellow-600">Yellow Card Warnings</h4>
                      <div className="text-sm text-muted-foreground">
                        3 yellow cards result in automatic red card
                      </div>
                      <Badge variant="outline" className="text-yellow-600">1 Active Warning</Badge>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="compliance" className="space-y-4" data-testid="compliance-tab-content">
          <div className="grid gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Award className="w-5 h-5" />
                  Enhanced Certifications
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="grid md:grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <h4 className="font-medium">CIBT Certifications</h4>
                      <Badge variant="outline" className="text-green-600">2 Valid</Badge>
                    </div>
                    <div className="space-y-2">
                      <h4 className="font-medium">CPCS Licenses</h4>
                      <Badge variant="outline" className="text-green-600">3 Valid</Badge>
                    </div>
                    <div className="space-y-2">
                      <h4 className="font-medium">NVQ Qualifications</h4>
                      <Badge variant="outline" className="text-orange-600">1 Expiring</Badge>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="w-5 h-5" />
                  RAMs Certification
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="font-medium">Risk Assessment & Method Statement</h4>
                      <p className="text-sm text-muted-foreground">Valid until March 2025</p>
                    </div>
                    <Badge variant="outline" className="text-green-600">Valid</Badge>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="reporting" className="space-y-4" data-testid="reporting-tab-content">
          <CO2SustainabilityReports 
            companyId={contractor?.id} 
            companyName={contractor?.name} 
          />
        </TabsContent>
      </Tabs>

      {/* Worker Details Modal */}
      <Dialog open={!!viewingWorker} onOpenChange={() => setViewingWorker(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="w-5 h-5" />
              Worker Details: {viewingWorker?.firstName} {viewingWorker?.lastName}
            </DialogTitle>
          </DialogHeader>
          
          {viewingWorker && (
            <div className="space-y-6">
              {/* Current Card Status - Prominent Display */}
              <div className="border rounded-lg p-4 bg-muted/50">
                <h3 className="font-semibold mb-3 flex items-center gap-2">
                  <Shield className="w-4 h-4" />
                  Current Safety Status
                </h3>
                <div className="flex items-center gap-3">
                  {viewingWorker.currentCardStatus === 'red' && (
                    <Badge variant="destructive" className="text-sm px-3 py-1">
                      <XCircle className="w-4 h-4 mr-1" />
                      RED CARD - BANNED
                    </Badge>
                  )}
                  {viewingWorker.currentCardStatus === 'yellow' && (
                    <Badge className="bg-yellow-500 hover:bg-yellow-600 text-white text-sm px-3 py-1">
                      <AlertTriangle className="w-4 h-4 mr-1" />
                      YELLOW CARD - WARNING
                    </Badge>
                  )}
                  {(!viewingWorker.currentCardStatus || viewingWorker.currentCardStatus === 'clear') && (
                    <Badge className="bg-green-500 hover:bg-green-600 text-white text-sm px-3 py-1">
                      <CheckCircle2 className="w-4 h-4 mr-1" />
                      CLEAR - COMPLIANT
                    </Badge>
                  )}
                  {viewingWorker.currentCardStatus === 'red' && viewingWorker.redCardBanUntil && (
                    <span className="text-sm text-muted-foreground">
                      Ban until: {new Date(viewingWorker.redCardBanUntil).toLocaleDateString()}
                    </span>
                  )}
                </div>
                {viewingWorker.cardStatusUpdatedAt && (
                  <p className="text-sm text-muted-foreground mt-2">
                    Status updated: {new Date(viewingWorker.cardStatusUpdatedAt).toLocaleDateString()}
                  </p>
                )}
              </div>

              <div className="grid md:grid-cols-2 gap-6">
                {/* Personal Information */}
                <div className="space-y-4">
                  <h3 className="font-semibold">Personal Information</h3>
                  
                  <div className="space-y-3">
                    <div>
                      <label className="text-sm font-medium text-muted-foreground">Full Name</label>
                      <p className="text-sm">{viewingWorker.firstName} {viewingWorker.lastName}</p>
                    </div>
                    
                    <div>
                      <label className="text-sm font-medium text-muted-foreground">Email</label>
                      <p className="text-sm">{viewingWorker.email || 'Not provided'}</p>
                    </div>
                    
                    <div>
                      <label className="text-sm font-medium text-muted-foreground">Phone</label>
                      <p className="text-sm">{viewingWorker.phone || 'Not provided'}</p>
                    </div>
                    
                    <div>
                      <label className="text-sm font-medium text-muted-foreground">Home Postcode</label>
                      <p className="text-sm" data-testid="text-worker-postcode">{viewingWorker.postcode || 'Not provided'}</p>
                      <p className="text-xs text-muted-foreground">For CO2 emissions calculations</p>
                    </div>
                  </div>
                </div>

                {/* Work Status */}
                <div className="space-y-4">
                  <h3 className="font-semibold">Work Status</h3>
                  
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm">Right to Work</span>
                      <Badge variant={
                        viewingWorker.currentCardStatus === 'red' && 
                        viewingWorker.redCardBanUntil && 
                        new Date(viewingWorker.redCardBanUntil) > new Date()
                          ? "destructive" 
                          : viewingWorker.rightToWork ? "default" : "destructive"
                      }>
                        {viewingWorker.currentCardStatus === 'red' && 
                         viewingWorker.redCardBanUntil && 
                         new Date(viewingWorker.redCardBanUntil) > new Date()
                          ? 'Invalid (Banned)' 
                          : viewingWorker.rightToWork ? 'Valid' : 'Invalid'}
                      </Badge>
                    </div>
                    
                    <div className="flex items-center justify-between">
                      <span className="text-sm">Active Status</span>
                      <Badge variant={
                        viewingWorker.currentCardStatus === 'red' && 
                        viewingWorker.redCardBanUntil && 
                        new Date(viewingWorker.redCardBanUntil) > new Date()
                          ? "destructive" 
                          : viewingWorker.isActive ? "default" : "secondary"
                      }>
                        {viewingWorker.currentCardStatus === 'red' && 
                         viewingWorker.redCardBanUntil && 
                         new Date(viewingWorker.redCardBanUntil) > new Date()
                          ? 'Banned' 
                          : viewingWorker.isActive ? 'Active' : 'Inactive'}
                      </Badge>
                    </div>
                    
                    <div className="flex items-center justify-between">
                      <span className="text-sm">Induction</span>
                      <Badge variant={viewingWorker.inductionCompleted ? "default" : "outline"}>
                        {viewingWorker.inductionCompleted ? 'Completed' : 'Pending'}
                      </Badge>
                    </div>
                    
                    <div className="flex items-center justify-between">
                      <span className="text-sm">CSCS Status</span>
                      <Badge variant={
                        viewingWorker.cscsStatus === 'valid' ? "default" : 
                        viewingWorker.cscsStatus === 'expired' ? "destructive" : 
                        "outline"
                      }>
                        {viewingWorker.cscsStatus || 'None'}
                      </Badge>
                    </div>
                    
                    <div className="flex items-center justify-between">
                      <span className="text-sm">IPAF Status</span>
                      <Badge variant={
                        viewingWorker.ipafStatus && viewingWorker.ipafStatus !== 'none' && viewingWorker.ipafStatus !== 'expired' ? "default" : 
                        viewingWorker.ipafStatus === 'expired' ? "destructive" :
                        "outline"
                      }>
                        {viewingWorker.ipafStatus === 'none' ? 'None' : 
                         viewingWorker.ipafStatus === '3a' ? '3a - Mobile Vertical' :
                         viewingWorker.ipafStatus === '3b' ? '3b - Mobile Boom' :
                         viewingWorker.ipafStatus === '1+' ? '1+ - Static Vertical' :
                         viewingWorker.ipafStatus || 'None'}
                      </Badge>
                    </div>
                    
                    <div className="flex items-center justify-between">
                      <span className="text-sm">Transport Method</span>
                      <Badge variant="outline">
                        {viewingWorker.transportMethod === 'car_diesel' ? 'Diesel Car' :
                         viewingWorker.transportMethod === 'car_petrol' ? 'Petrol Car' :
                         viewingWorker.transportMethod === 'electric_car' ? 'Electric Car' :
                         viewingWorker.transportMethod === 'van_diesel' ? 'Diesel Van' :
                         viewingWorker.transportMethod === 'van_petrol' ? 'Petrol Van' :
                         viewingWorker.transportMethod === 'electric_van' ? 'Electric Van' :
                         viewingWorker.transportMethod === 'motorbike' ? 'Motorbike' :
                         viewingWorker.transportMethod === 'public_transport' ? 'Public Transport' :
                         viewingWorker.transportMethod === 'bicycle' ? 'Bicycle' :
                         viewingWorker.transportMethod === 'walk' ? 'Walk' :
                         'Not provided'}
                      </Badge>
                    </div>
                  </div>
                </div>
              </div>

              {/* Safety Training & Compliance */}
              <div className="space-y-4">
                <h3 className="font-semibold">Safety Training & Compliance</h3>
                
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Asbestos Awareness</span>
                    <Badge variant={viewingWorker.asbestosAwareness ? "default" : "outline"}>
                      {viewingWorker.asbestosAwareness ? 'Completed' : 'Not Completed'}
                    </Badge>
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Manual Handling</span>
                    <Badge variant={viewingWorker.manualHandling ? "default" : "outline"}>
                      {viewingWorker.manualHandling ? 'Completed' : 'Not Completed'}
                    </Badge>
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Working at Height</span>
                    <Badge variant={viewingWorker.workingAtHeight ? "default" : "outline"}>
                      {viewingWorker.workingAtHeight ? 'Completed' : 'Not Completed'}
                    </Badge>
                  </div>
                </div>
              </div>

              {/* Certifications & Training */}
              <div className="space-y-4">
                <h3 className="font-semibold">Certifications & Training</h3>
                
                <div className="grid md:grid-cols-2 gap-4">
                  {/* Enhanced Certifications */}
                  {viewingWorker.certifications && Array.isArray(viewingWorker.certifications) && viewingWorker.certifications.length > 0 ? (
                    viewingWorker.certifications.map((cert: any, index: number) => (
                      <div key={index} className="border rounded-lg p-3">
                        <div className="flex items-center justify-between mb-2">
                          <h4 className="font-medium text-sm">{cert.certificationType}</h4>
                          <Badge 
                            variant={cert.status === 'valid' ? 'default' : cert.status === 'expired' ? 'destructive' : 'secondary'}
                            className="text-xs"
                          >
                            {cert.status}
                          </Badge>
                        </div>
                        {cert.certificationNumber && (
                          <p className="text-xs text-muted-foreground">#{cert.certificationNumber}</p>
                        )}
                        {cert.expiryDate && (
                          <p className="text-xs text-muted-foreground">
                            Expires: {new Date(cert.expiryDate).toLocaleDateString()}
                          </p>
                        )}
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-muted-foreground col-span-2">No certifications recorded</p>
                  )}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* H&S acceptance now happens via e-pass link - no modal needed */}

      {/* Edit Worker Modal */}
      {selectedWorkerForEdit && (
        <ContractorEditModal
          worker={selectedWorkerForEdit}
          companyName={contractorData.name}
          open={!!selectedWorkerForEdit}
          onOpenChange={(open) => !open && setSelectedWorkerForEdit(null)}
        />
      )}

      {/* Print Pass Modal */}
      {selectedWorkerForPrint && (
        <ContractorPassPreviewModal
          isOpen={!!selectedWorkerForPrint}
          onClose={() => setSelectedWorkerForPrint(null)}
          worker={selectedWorkerForPrint}
          companyName={contractorData.name}
        />
      )}

      {/* Add Worker Modal */}
      <Dialog open={addingWorker} onOpenChange={setAddingWorker}>
        <DialogContent className="sm:max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add New Worker</DialogTitle>
            <DialogDescription>
              Add a new contractor worker to {contractorData.name}.
            </DialogDescription>
          </DialogHeader>
          <Form {...workerForm}>
            <form onSubmit={workerForm.handleSubmit(handleAddWorker)} className="space-y-4">
              {/* Personal Information */}
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={workerForm.control}
                  name="firstName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>First Name *</FormLabel>
                      <FormControl>
                        <Input {...field} data-testid="input-worker-first-name" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={workerForm.control}
                  name="lastName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Last Name *</FormLabel>
                      <FormControl>
                        <Input {...field} data-testid="input-worker-last-name" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={workerForm.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <Input type="email" {...field} data-testid="input-worker-email" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={workerForm.control}
                  name="phone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Phone</FormLabel>
                      <FormControl>
                        <Input {...field} data-testid="input-worker-phone" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={workerForm.control}
                  name="postcode"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Postcode *</FormLabel>
                      <FormControl>
                        <Input {...field} data-testid="input-worker-postcode" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={workerForm.control}
                  name="transportMethod"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Transport Method</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-worker-transport">
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="car_diesel">Car (Diesel)</SelectItem>
                          <SelectItem value="car_petrol">Car (Petrol)</SelectItem>
                          <SelectItem value="electric_car">Electric Car</SelectItem>
                          <SelectItem value="public_transport">Public Transport</SelectItem>
                          <SelectItem value="motorcycle">Motorcycle</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={workerForm.control}
                  name="rightToWork"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Right to Work *</FormLabel>
                      <FormControl>
                        <Input {...field} data-testid="input-worker-right-to-work" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={workerForm.control}
                  name="cscsCard"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>CSCS Card Number</FormLabel>
                      <FormControl>
                        <Input {...field} data-testid="input-worker-cscs-card" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={workerForm.control}
                  name="cscsStatus"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>CSCS Status</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-worker-cscs-status">
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="valid">Valid</SelectItem>
                          <SelectItem value="expired">Expired</SelectItem>
                          <SelectItem value="none">None</SelectItem>
                          <SelectItem value="pending">Pending</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={workerForm.control}
                  name="ipafStatus"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>IPAF Status</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-worker-ipaf-status">
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="valid">Valid</SelectItem>
                          <SelectItem value="expired">Expired</SelectItem>
                          <SelectItem value="none">None</SelectItem>
                          <SelectItem value="pending">Pending</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {/* Training Checkboxes */}
              <div className="space-y-4">
                <h3 className="text-sm font-medium">Training & Certifications</h3>
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={workerForm.control}
                    name="asbestosAwareness"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                        <FormControl>
                          <input
                            type="checkbox"
                            checked={field.value}
                            onChange={field.onChange}
                            data-testid="checkbox-worker-asbestos"
                            className="mt-1"
                          />
                        </FormControl>
                        <div className="space-y-1 leading-none">
                          <FormLabel className="text-sm font-normal">
                            Asbestos Awareness
                          </FormLabel>
                        </div>
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={workerForm.control}
                    name="manualHandling"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                        <FormControl>
                          <input
                            type="checkbox"
                            checked={field.value}
                            onChange={field.onChange}
                            data-testid="checkbox-worker-manual-handling"
                            className="mt-1"
                          />
                        </FormControl>
                        <div className="space-y-1 leading-none">
                          <FormLabel className="text-sm font-normal">
                            Manual Handling
                          </FormLabel>
                        </div>
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={workerForm.control}
                    name="workingAtHeight"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                        <FormControl>
                          <input
                            type="checkbox"
                            checked={field.value}
                            onChange={field.onChange}
                            data-testid="checkbox-worker-working-height"
                            className="mt-1"
                          />
                        </FormControl>
                        <div className="space-y-1 leading-none">
                          <FormLabel className="text-sm font-normal">
                            Working at Height
                          </FormLabel>
                        </div>
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={workerForm.control}
                    name="inductionCompleted"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                        <FormControl>
                          <input
                            type="checkbox"
                            checked={field.value}
                            onChange={field.onChange}
                            data-testid="checkbox-worker-induction"
                            className="mt-1"
                          />
                        </FormControl>
                        <div className="space-y-1 leading-none">
                          <FormLabel className="text-sm font-normal">
                            Induction Completed
                          </FormLabel>
                        </div>
                      </FormItem>
                    )}
                  />
                </div>
              </div>

              <DialogFooter className="pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setAddingWorker(false)}
                  data-testid="button-cancel-add-worker"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={addWorkerMutation.isPending}
                  data-testid="button-submit-add-worker"
                >
                  {addWorkerMutation.isPending ? "Adding..." : "Add Worker"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Host Selection Dialog for Contractor Check-in (Same as Visitors) */}
      <Dialog open={showHostSelection} onOpenChange={setShowHostSelection}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              Select Host for {selectedWorkerForCheckIn?.firstName} {selectedWorkerForCheckIn?.lastName}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-slate-600">
              Who is {selectedWorkerForCheckIn?.firstName} {selectedWorkerForCheckIn?.lastName} working with today?
            </p>
            <div className="space-y-2">
              <Label htmlFor="host-select" className="text-sm font-medium">
                Host Staff Member *
              </Label>
              <Select value={selectedHostForWorker} onValueChange={setSelectedHostForWorker}>
                <SelectTrigger data-testid="select-contractor-host">
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
          </div>
          <DialogFooter className="mt-6">
            <Button
              variant="outline"
              onClick={() => {
                setShowHostSelection(false);
                setSelectedWorkerForCheckIn(null);
                setSelectedHostForWorker("");
              }}
              data-testid="button-cancel-host-selection"
            >
              Cancel
            </Button>
            <Button
              onClick={handleHostSelectionConfirm}
              disabled={!selectedHostForWorker}
              data-testid="button-confirm-host-selection"
            >
              Confirm Check-In
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}