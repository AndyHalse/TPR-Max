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
import { insertCardIssueSchema, insertWorkerCertificationSchema } from "@shared/schema";
import type { ContractorWorker, CardOffence, CardIssue, WorkerCertification } from "@shared/schema";
import { z } from "zod";
import { toast } from "@/hooks/use-toast";
import { 
  Building2, Users, FileText, Shield, AlertTriangle, CheckCircle2, 
  Calendar, MapPin, Phone, Mail, User, Award, Leaf, TrendingUp,
  XCircle, Clock, AlertCircle
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

export default function ContractorDetails() {
  const { id } = useParams();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const [issuingCard, setIssuingCard] = useState(false);
  const [addingCertification, setAddingCertification] = useState(false);

  // Fetch contractor details
  const { data: contractor, isLoading } = useQuery({
    queryKey: [`/api/contractors/${id}`],
  });

  // Fetch card offences for card issue form
  const { data: cardOffences = [] } = useQuery<CardOffence[]>({
    queryKey: ['/api/card-offences'],
  });

  // Form for issuing card violations
  const cardIssueForm = useForm({
    resolver: zodResolver(insertCardIssueSchema.extend({
      workerId: z.string().min(1, "Worker is required"),
      offenceId: z.string().min(1, "Offence is required"),
      description: z.string().min(1, "Description is required"),
    })),
    defaultValues: {
      workerId: "",
      offenceId: "",
      cardType: "yellow" as const,
      issuedBy: "current-user", // This should be from auth context
      description: "",
      witness: "",
      location: "",
      photos: [],
      status: "active" as const,
    }
  });

  // Form for adding certifications
  const certificationForm = useForm({
    resolver: zodResolver(insertWorkerCertificationSchema.extend({
      workerId: z.string().min(1, "Worker is required"),
      certificationType: z.string().min(1, "Certification type is required"),
    })),
    defaultValues: {
      workerId: "",
      certificationType: "",
      certificationNumber: "",
      issuer: "",
      status: "valid" as const,
      notes: "",
    }
  });

  // Issue card mutation
  const issueCardMutation = useMutation({
    mutationFn: (data: any) => apiRequest('/api/card-issues', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
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
    mutationFn: (data: any) => apiRequest(`/api/workers/${data.workerId}/certifications`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
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
    issueCardMutation.mutate(data);
  };

  const handleAddCertification = (data: any) => {
    addCertificationMutation.mutate(data);
  };

  const getCardStatusBadge = (cardType: string, count: number) => {
    if (count === 0) return <Badge variant="outline" className="text-green-600">No Cards</Badge>;
    
    if (cardType === "red" && count > 0) {
      return <Badge variant="destructive">Red Card Issued</Badge>;
    }
    
    if (cardType === "yellow") {
      if (count >= 3) return <Badge variant="destructive">3+ Yellow Cards</Badge>;
      if (count >= 2) return <Badge className="bg-orange-500 hover:bg-orange-600">2 Yellow Cards</Badge>;
      if (count >= 1) return <Badge className="bg-yellow-500 hover:bg-yellow-600 text-black">1 Yellow Card</Badge>;
    }
    
    return <Badge variant="outline">No Issues</Badge>;
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
            {contractor.name}
          </h1>
          <p className="text-muted-foreground" data-testid="text-contractor-description">
            {contractor.description}
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
                            {contractor.workers?.map((worker: ContractorWorker) => (
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
                            {contractor.workers?.map((worker: ContractorWorker) => (
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
              {contractor.workers?.length || 0}
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
              {contractor.documents?.length || 0}
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
            <div className="text-2xl font-bold text-blue-600" data-testid="text-safety-rating">
              A+
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
          <div className="grid gap-4">
            {contractor.workers?.length > 0 ? (
              contractor.workers.map((worker: ContractorWorker) => (
                <Card key={worker.id} data-testid={`card-worker-${worker.id}`}>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div className="space-y-1">
                        <CardTitle className="text-lg" data-testid={`text-worker-name-${worker.id}`}>
                          {worker.firstName} {worker.lastName}
                        </CardTitle>
                        <CardDescription data-testid={`text-worker-role-${worker.id}`}>
                          {worker.role || "Contractor Worker"}
                        </CardDescription>
                      </div>
                      <div className="flex flex-col gap-2">
                        {getCardStatusBadge("red", 0)} {/* This would be fetched from card issues */}
                        {getCardStatusBadge("yellow", 1)} {/* This would be calculated */}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="grid md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <div className="flex items-center gap-2" data-testid={`text-worker-email-${worker.id}`}>
                          <Mail className="w-4 h-4 text-muted-foreground" />
                          <span className="text-sm">{worker.email}</span>
                        </div>
                        <div className="flex items-center gap-2" data-testid={`text-worker-phone-${worker.id}`}>
                          <Phone className="w-4 h-4 text-muted-foreground" />
                          <span className="text-sm">{worker.phoneNumber}</span>
                        </div>
                        <div className="flex items-center gap-2" data-testid={`text-worker-status-${worker.id}`}>
                          <User className="w-4 h-4 text-muted-foreground" />
                          <Badge variant={worker.isCheckedIn ? "default" : "secondary"}>
                            {worker.isCheckedIn ? "Checked In" : "Checked Out"}
                          </Badge>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <div className="text-sm text-muted-foreground">Safety Certifications</div>
                        <div className="flex flex-wrap gap-1">
                          {/* This would show actual certifications */}
                          <Badge variant="outline" className="text-xs">CSCS</Badge>
                          <Badge variant="outline" className="text-xs">CIBT</Badge>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            ) : (
              <Card>
                <CardContent className="p-6 text-center">
                  <p className="text-muted-foreground">No workers registered for this contractor.</p>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        <TabsContent value="documents" className="space-y-4" data-testid="documents-tab-content">
          <div className="grid gap-4">
            {contractor.documents?.length > 0 ? (
              contractor.documents.map((doc: any) => (
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
    </div>
  );
}