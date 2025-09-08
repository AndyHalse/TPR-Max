import { useState, useMemo } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
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
import { apiRequest } from "@/lib/queryClient";
import { WorkerCard } from "@/components/WorkerCard";
import ContractorPassPreviewModal from "@/components/ContractorPassPreviewModal";
import { ContractorEditModal } from "@/components/ContractorEditModal";
import ContractorHSModal from "@/components/ContractorHSModal";

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
  const [viewingWorker, setViewingWorker] = useState<ContractorWorker | null>(null);
  const [selectedWorkerForEdit, setSelectedWorkerForEdit] = useState<ContractorWorker | null>(null);
  const [selectedWorkerForPrint, setSelectedWorkerForPrint] = useState<ContractorWorker | null>(null);
  const [selectedWorkerForHS, setSelectedWorkerForHS] = useState<ContractorWorker | null>(null);

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

  // Check-in mutation
  const checkInMutation = useMutation({
    mutationFn: async (worker: ContractorWorker) => {
      const response = await apiRequest('POST', `/api/contractors/workers/${worker.id}/checkin`, {
        purpose: 'Site work',
        hsRulesAccepted: true,
        hsRulesAcceptedAt: new Date().toISOString(),
      });
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Worker checked in successfully" });
      queryClient.invalidateQueries({ queryKey: [`/api/contractors/${id}`] });
      setSelectedWorkerForHS(null);
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

  const handleWorkerCheckIn = (worker: ContractorWorker) => {
    setSelectedWorkerForHS(worker);
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
                    // TODO: Implement card reset functionality
                    toast({ title: "Card reset functionality coming soon!" });
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
          <div className="grid gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Leaf className="w-5 h-5" />
                  CO2 Emissions Tracking
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="grid md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <h4 className="font-medium">Monthly Emissions</h4>
                      <div className="text-2xl font-bold text-green-600">2.3t CO2</div>
                      <p className="text-sm text-muted-foreground">15% reduction from last month</p>
                    </div>
                    <div className="space-y-2">
                      <h4 className="font-medium">Transport Methods</h4>
                      <div className="space-y-1">
                        <div className="flex justify-between text-sm">
                          <span>Diesel vehicles</span>
                          <span>1.8t CO2</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span>Electric vehicles</span>
                          <span>0.5t CO2</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="w-5 h-5" />
                  Local Labour Statistics
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="grid md:grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <h4 className="font-medium">Local Workers</h4>
                      <div className="text-2xl font-bold text-blue-600">68%</div>
                      <p className="text-sm text-muted-foreground">Within 20 miles</p>
                    </div>
                    <div className="space-y-2">
                      <h4 className="font-medium">Apprentices</h4>
                      <div className="text-2xl font-bold text-purple-600">12%</div>
                      <p className="text-sm text-muted-foreground">Training programs</p>
                    </div>
                    <div className="space-y-2">
                      <h4 className="font-medium">Skills Development</h4>
                      <div className="text-2xl font-bold text-green-600">5</div>
                      <p className="text-sm text-muted-foreground">Ongoing qualifications</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
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

      {/* H&S Acceptance Modal for Check-in */}
      {selectedWorkerForHS && (
        <ContractorHSModal
          isOpen={!!selectedWorkerForHS}
          onClose={() => setSelectedWorkerForHS(null)}
          onAccept={() => {
            checkInMutation.mutate(selectedWorkerForHS);
          }}
          worker={selectedWorkerForHS}
          companyName={contractorData.name}
        />
      )}

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
    </div>
  );
}