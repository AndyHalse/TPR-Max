import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { CalendarIcon, Save, X, User, Mail, Phone, Shield, Award, FileText, Clock, Plus, Video, Leaf } from "lucide-react";
import { CO2EmissionsTracker } from "./CO2EmissionsTracker";
import { format } from "date-fns";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

// Form validation schema
const editWorkerSchema = z.object({
  // Personal Information
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  email: z.string().email("Please enter a valid email address").optional().or(z.literal("")),
  phone: z.string().optional().or(z.literal("")),
  postcode: z.string()
    .min(1, "Home Postcode is required for CO2 emissions calculations")
    .regex(/^[A-Z]{1,2}[0-9R][0-9A-Z]?\s?[0-9][A-Z]{2}$/i, "Please enter a valid UK postcode (e.g., SW1A 1AA, M1 1AA)")
    .transform((val) => {
      // Format UK postcode correctly for CO2 calculations
      const cleaned = val.replace(/\s/g, '').toUpperCase();
      if (cleaned.length >= 5) {
        const inward = cleaned.slice(-3);
        const outward = cleaned.slice(0, -3);
        return `${outward} ${inward}`;
      }
      return cleaned;
    }),
  
  // Right to Work
  rightToWork: z.enum(["valid", "expired", "pending", "missing"]).default("pending"),
  rightToWorkExpiry: z.date().optional(),
  
  // CSCS Card
  cscsCard: z.string().optional().or(z.literal("")),
  cscsExpiry: z.date().optional(),
  cscsStatus: z.enum(["valid", "expired", "expiring", "missing"]).default("missing"),
  
  // IPAF Card  
  ipafCard: z.string().optional().or(z.literal("")),
  ipafExpiry: z.date().optional(),
  ipafStatus: z.enum(["valid", "expired", "expiring", "missing"]).default("missing"),
  
  // CIBT Card
  cibtCard: z.string().optional().or(z.literal("")),
  cibtExpiry: z.date().optional(),
  cibtStatus: z.enum(["valid", "expired", "missing"]).default("missing"),
  
  // CPCS Card
  cpcsCard: z.string().optional().or(z.literal("")),
  cpcsExpiry: z.date().optional(),
  cpcsStatus: z.enum(["valid", "expired", "missing"]).default("missing"),
  
  // NVQ Qualifications
  nvqQualificationId: z.string().optional().or(z.literal("")),
  nvqLevel: z.number().min(1).max(5).optional(),
  nvqSubject: z.string().optional().or(z.literal("")),
  nvqExpiry: z.date().optional(),
  nvqStatus: z.enum(["valid", "expired", "missing"]).default("missing"),
  
  // Training Certifications
  asbestosAwareness: z.boolean().default(false),
  asbestosExpiry: z.date().optional(),
  manualHandling: z.boolean().default(false),
  manualHandlingExpiry: z.date().optional(),
  
  // Site Status
  currentCardStatus: z.enum(["clear", "yellow", "red"]).default("clear"),
  isActive: z.boolean().default(true),
  inductionCompleted: z.boolean().default(false),
  isPreRegistered: z.boolean().default(false),
  needsEvacuationAssistance: z.boolean().default(false),
});

type EditWorkerForm = z.infer<typeof editWorkerSchema>;

interface EditContractorWorkerModalProps {
  isOpen: boolean;
  onClose: () => void;
  worker: any; // We'll type this properly
  companyName?: string;
}

export default function EditContractorWorkerModal({
  isOpen,
  onClose,
  worker,
  companyName
}: EditContractorWorkerModalProps) {
  const { toast } = useToast();
  const [showAddQualificationDialog, setShowAddQualificationDialog] = useState(false);
  const [newQualificationForm, setNewQualificationForm] = useState({
    name: "",
    level: 2,
    industry: "",
    description: ""
  });

  // Fetch NVQ qualifications
  const { data: nvqQualifications = [], isLoading: loadingQualifications } = useQuery({
    queryKey: ["/api/nvq-qualifications"],
    refetchOnWindowFocus: false,
  });

  // Add new NVQ qualification
  const addQualificationMutation = useMutation({
    mutationFn: async (newQualification: { name: string; level: number; industry: string; description: string }) => {
      return await apiRequest("/api/nvq-qualifications", {
        method: "POST",
        body: JSON.stringify(newQualification),
        headers: { "Content-Type": "application/json" },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/nvq-qualifications"] });
      setShowAddQualificationDialog(false);
      setNewQualificationForm({ name: "", level: 2, industry: "", description: "" });
      toast({
        title: "Success",
        description: "New NVQ qualification added successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to add qualification",
        variant: "destructive",
      });
    },
  });
  
  const form = useForm<EditWorkerForm>({
    resolver: zodResolver(editWorkerSchema),
    defaultValues: {
      firstName: "",
      lastName: "",
      email: "",
      phone: "",
      rightToWork: "pending",
      cscsStatus: "missing",
      ipafStatus: "missing",
      cibtStatus: "missing", 
      cpcsStatus: "missing",
      nvqQualificationId: "",
      nvqStatus: "missing",
      currentCardStatus: "clear",
      asbestosAwareness: false,
      manualHandling: false,
      isActive: true,
      inductionCompleted: false,
      isPreRegistered: false,
    },
  });

  // Update form when worker data changes
  useEffect(() => {
    if (worker && isOpen) {
      form.reset({
        firstName: worker.firstName || "",
        lastName: worker.lastName || "",
        email: worker.email || "",
        phone: worker.phone || "",
        postcode: worker.postcode || "",
        rightToWork: worker.rightToWork || "pending",
        rightToWorkExpiry: worker.rightToWorkExpiry ? new Date(worker.rightToWorkExpiry) : undefined,
        cscsCard: worker.cscsCard || "",
        cscsExpiry: worker.cscsExpiry ? new Date(worker.cscsExpiry) : undefined,
        cscsStatus: worker.cscsStatus || "missing",
        ipafCard: worker.ipafCard || "",
        ipafExpiry: worker.ipafExpiry ? new Date(worker.ipafExpiry) : undefined,
        ipafStatus: worker.ipafStatus || "missing",
        cibtCard: worker.cibtCard || "",
        cibtExpiry: worker.cibtExpiry ? new Date(worker.cibtExpiry) : undefined,
        cibtStatus: worker.cibtStatus || "missing",
        cpcsCard: worker.cpcsCard || "",
        cpcsExpiry: worker.cpcsExpiry ? new Date(worker.cpcsExpiry) : undefined,
        cpcsStatus: worker.cpcsStatus || "missing",
        nvqLevel: worker.nvqLevel || undefined,
        nvqSubject: worker.nvqSubject || "",
        nvqExpiry: worker.nvqExpiry ? new Date(worker.nvqExpiry) : undefined,
        nvqStatus: worker.nvqStatus || "missing",
        asbestosAwareness: worker.asbestosAwareness || false,
        asbestosExpiry: worker.asbestosExpiry ? new Date(worker.asbestosExpiry) : undefined,
        manualHandling: worker.manualHandling || false,
        manualHandlingExpiry: worker.manualHandlingExpiry ? new Date(worker.manualHandlingExpiry) : undefined,
        currentCardStatus: worker.currentCardStatus || "clear",
        isActive: worker.isActive !== false, // Default to true if undefined
        inductionCompleted: worker.inductionCompleted || false,
        isPreRegistered: worker.isPreRegistered || false,
        needsEvacuationAssistance: worker.needsEvacuationAssistance || false,
      });
    }
  }, [worker, isOpen, form]);

  const updateWorkerMutation = useMutation({
    mutationFn: async (data: EditWorkerForm) => {
      const response = await apiRequest("PUT", `/api/contractors/workers/${worker.id}`, {
        ...data,
        // Convert dates to ISO strings for API
        rightToWorkExpiry: data.rightToWorkExpiry?.toISOString(),
        cscsExpiry: data.cscsExpiry?.toISOString(),
        ipafExpiry: data.ipafExpiry?.toISOString(),
        cibtExpiry: data.cibtExpiry?.toISOString(),
        cpcsExpiry: data.cpcsExpiry?.toISOString(),
        nvqExpiry: data.nvqExpiry?.toISOString(),
        asbestosExpiry: data.asbestosExpiry?.toISOString(),
        manualHandlingExpiry: data.manualHandlingExpiry?.toISOString(),
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/contractors/workers/all"] });
      queryClient.invalidateQueries({ queryKey: ["/api/contractors"] });
      toast({
        title: "Success ✅",
        description: "Contractor details updated successfully!",
      });
      onClose();
    },
    onError: (error) => {
      toast({
        title: "Update Failed",
        description: error.message || "Failed to update contractor details. Please try again.",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: EditWorkerForm) => {
    updateWorkerMutation.mutate(data);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "valid": return "bg-green-100 text-green-800";
      case "expired": return "bg-red-100 text-red-800";
      case "expiring": return "bg-yellow-100 text-yellow-800";
      case "pending": return "bg-blue-100 text-blue-800";
      default: return "bg-gray-100 text-gray-800";
    }
  };

  const CardStatusBadge = ({ status }: { status: string }) => {
    const colors = {
      clear: "bg-green-100 text-green-800",
      yellow: "bg-yellow-100 text-yellow-800",
      red: "bg-red-100 text-red-800"
    };
    return <Badge className={colors[status as keyof typeof colors]}>{status.toUpperCase()}</Badge>;
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="w-[95vw] sm:max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <User className="w-5 h-5 text-blue-600" />
            Edit Contractor Details
          </DialogTitle>
          <DialogDescription>
            Update all contractor information, certifications, and site status for{" "}
            <span className="font-medium">{worker?.firstName} {worker?.lastName}</span>
            {companyName && <span className="text-variable"> from {companyName}</span>}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            
            {/* Personal Information Section */}
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <User className="w-4 h-4 text-variable" />
                <h3 className="font-semibold text-gray-900">Personal Information</h3>
              </div>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="firstName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>First Name *</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="Enter first name" data-testid="input-firstName" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="lastName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Last Name *</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="Enter last name" data-testid="input-lastName" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="flex items-center gap-1">
                        <Mail className="w-3 h-3" />
                        Email Address
                      </FormLabel>
                      <FormControl>
                        <Input {...field} type="email" placeholder="Enter email address" data-testid="input-email" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="phone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="flex items-center gap-1">
                        <Phone className="w-3 h-3" />
                        Phone Number
                      </FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="Enter phone number" data-testid="input-phone" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="postcode"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Home Postcode *</FormLabel>
                      <FormControl>
                        <Input 
                          {...field} 
                          placeholder="" 
                          data-testid="input-postcode"
                          onChange={(e) => {
                            // Auto-format as user types
                            let value = e.target.value.replace(/\s/g, '').toUpperCase();
                            if (value.length > 4) {
                              const inward = value.slice(-3);
                              const outward = value.slice(0, -3);
                              value = `${outward} ${inward}`;
                            }
                            field.onChange(value);
                          }}
                          className="font-mono"
                        />
                      </FormControl>
                      <FormDescription className="text-xs text-muted-foreground">
                        Required for accurate CO2 emissions calculations
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>

            <Separator />

            {/* Work Authorization Section */}
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Shield className="w-4 h-4 text-variable" />
                <h3 className="font-semibold text-gray-900">Work Authorization</h3>
              </div>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="rightToWork"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Right to Work Status</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-rightToWork">
                            <SelectValue placeholder="Select status" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="valid">Valid</SelectItem>
                          <SelectItem value="expired">Expired</SelectItem>
                          <SelectItem value="pending">Pending</SelectItem>
                          <SelectItem value="missing">Missing</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="rightToWorkExpiry"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Right to Work Expiry</FormLabel>
                      <Popover>
                        <PopoverTrigger asChild>
                          <FormControl>
                            <Button
                              variant="outline"
                              className={cn(
                                "w-full pl-3 text-left font-normal",
                                !field.value && "text-muted-foreground"
                              )}
                              data-testid="button-rightToWorkExpiry"
                            >
                              {field.value ? format(field.value, "PPP") : "Pick a date"}
                              <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                            </Button>
                          </FormControl>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar
                            mode="single"
                            selected={field.value}
                            onSelect={field.onChange}
                            disabled={(date) => date < new Date()}
                            initialFocus
                          />
                        </PopoverContent>
                      </Popover>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>

            <Separator />

            {/* Certifications & Cards Section */}
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Award className="w-4 h-4 text-variable" />
                <h3 className="font-semibold text-gray-900">Certifications & Cards</h3>
              </div>
              
              {/* CSCS Card */}
              <div className="p-4 border rounded-lg space-y-4">
                <h4 className="font-medium text-gray-800">CSCS Card</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                  <FormField
                    control={form.control}
                    name="cscsCard"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Card Number</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="CSCS card number" data-testid="input-cscsCard" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={form.control}
                    name="cscsStatus"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Status</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-cscsStatus">
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="valid">Valid</SelectItem>
                            <SelectItem value="expired">Expired</SelectItem>
                            <SelectItem value="expiring">Expiring Soon</SelectItem>
                            <SelectItem value="missing">Missing</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={form.control}
                    name="cscsExpiry"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Expiry Date</FormLabel>
                        <Popover>
                          <PopoverTrigger asChild>
                            <FormControl>
                              <Button
                                variant="outline"
                                className={cn(
                                  "w-full pl-3 text-left font-normal",
                                  !field.value && "text-muted-foreground"
                                )}
                                data-testid="button-cscsExpiry"
                              >
                                {field.value ? format(field.value, "PPP") : "Pick a date"}
                                <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                              </Button>
                            </FormControl>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="start">
                            <Calendar
                              mode="single"
                              selected={field.value}
                              onSelect={field.onChange}
                              initialFocus
                            />
                          </PopoverContent>
                        </Popover>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>

              {/* NVQ Qualifications */}
              <div className="p-4 border rounded-lg space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="font-medium text-gray-800">NVQ Qualifications</h4>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setShowAddQualificationDialog(true)}
                    className="flex items-center gap-2"
                    data-testid="button-add-nvq-qualification"
                  >
                    <Plus className="h-4 w-4" />
                    Add New
                  </Button>
                </div>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="nvqQualificationId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>NVQ Qualification</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-nvqQualification">
                              <SelectValue placeholder="Select qualification" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {loadingQualifications ? (
                              <SelectItem value="loading" disabled>Loading qualifications...</SelectItem>
                            ) : (
                              nvqQualifications.map((qualification: any) => (
                                <SelectItem key={qualification.id} value={qualification.id}>
                                  {qualification.name} (Level {qualification.level}) - {qualification.industry}
                                </SelectItem>
                              ))
                            )}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={form.control}
                    name="nvqStatus"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Status</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-nvqStatus">
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="valid">Valid</SelectItem>
                            <SelectItem value="expired">Expired</SelectItem>
                            <SelectItem value="missing">Missing</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                
                <FormField
                  control={form.control}
                  name="nvqExpiry"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Expiry Date</FormLabel>
                      <Popover>
                        <PopoverTrigger asChild>
                          <FormControl>
                            <Button
                              variant="outline"
                              className={cn(
                                "w-full pl-3 text-left font-normal",
                                !field.value && "text-muted-foreground"
                              )}
                              data-testid="button-nvqExpiry"
                            >
                              {field.value ? format(field.value, "PPP") : "Pick a date"}
                              <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                            </Button>
                          </FormControl>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar
                            mode="single"
                            selected={field.value}
                            onSelect={field.onChange}
                            initialFocus
                          />
                        </PopoverContent>
                      </Popover>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {/* Training Certifications */}
              <div className="p-4 border rounded-lg space-y-4">
                <h4 className="font-medium text-gray-800">Training Certifications</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  <div className="space-y-3">
                    <FormField
                      control={form.control}
                      name="asbestosAwareness"
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                          <FormControl>
                            <Checkbox
                              checked={field.value}
                              onCheckedChange={field.onChange}
                              data-testid="checkbox-asbestosAwareness"
                            />
                          </FormControl>
                          <div className="space-y-1 leading-none">
                            <FormLabel>Asbestos Awareness Training</FormLabel>
                          </div>
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={form.control}
                      name="asbestosExpiry"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Asbestos Training Expiry</FormLabel>
                          <Popover>
                            <PopoverTrigger asChild>
                              <FormControl>
                                <Button
                                  variant="outline"
                                  className={cn(
                                    "w-full pl-3 text-left font-normal",
                                    !field.value && "text-muted-foreground"
                                  )}
                                  data-testid="button-asbestosExpiry"
                                >
                                  {field.value ? format(field.value, "PPP") : "Pick a date"}
                                  <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                                </Button>
                              </FormControl>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0" align="start">
                              <Calendar
                                mode="single"
                                selected={field.value}
                                onSelect={field.onChange}
                                initialFocus
                              />
                            </PopoverContent>
                          </Popover>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  
                  <div className="space-y-3">
                    <FormField
                      control={form.control}
                      name="manualHandling"
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                          <FormControl>
                            <Checkbox
                              checked={field.value}
                              onCheckedChange={field.onChange}
                              data-testid="checkbox-manualHandling"
                            />
                          </FormControl>
                          <div className="space-y-1 leading-none">
                            <FormLabel>Manual Handling Training</FormLabel>
                          </div>
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={form.control}
                      name="manualHandlingExpiry"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Manual Handling Expiry</FormLabel>
                          <Popover>
                            <PopoverTrigger asChild>
                              <FormControl>
                                <Button
                                  variant="outline"
                                  className={cn(
                                    "w-full pl-3 text-left font-normal",
                                    !field.value && "text-muted-foreground"
                                  )}
                                  data-testid="button-manualHandlingExpiry"
                                >
                                  {field.value ? format(field.value, "PPP") : "Pick a date"}
                                  <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                                </Button>
                              </FormControl>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0" align="start">
                              <Calendar
                                mode="single"
                                selected={field.value}
                                onSelect={field.onChange}
                                initialFocus
                              />
                            </PopoverContent>
                          </Popover>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </div>
              </div>
            </div>

            <Separator />

            {/* Site Status Section */}
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Shield className="w-4 h-4 text-variable" />
                <h3 className="font-semibold text-gray-900">Site Status & Permissions</h3>
              </div>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <FormField
                    control={form.control}
                    name="currentCardStatus"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Safety Card Status</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-currentCardStatus">
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="clear">Clear (Green)</SelectItem>
                            <SelectItem value="yellow">Yellow Card</SelectItem>
                            <SelectItem value="red">Red Card</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <div className="space-y-3">
                    <FormField
                      control={form.control}
                      name="isActive"
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                          <FormControl>
                            <Checkbox
                              checked={field.value}
                              onCheckedChange={field.onChange}
                              data-testid="checkbox-isActive"
                            />
                          </FormControl>
                          <div className="space-y-1 leading-none">
                            <FormLabel>Active Worker</FormLabel>
                            <p className="text-sm text-muted-foreground">
                              Allow this worker to check in and access the site
                            </p>
                          </div>
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={form.control}
                      name="isPreRegistered"
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                          <FormControl>
                            <Checkbox
                              checked={field.value}
                              onCheckedChange={field.onChange}
                              data-testid="checkbox-isPreRegistered"
                            />
                          </FormControl>
                          <div className="space-y-1 leading-none">
                            <FormLabel>Pre-registered</FormLabel>
                            <p className="text-sm text-muted-foreground">
                              Worker is pre-registered for future visits
                            </p>
                          </div>
                        </FormItem>
                      )}
                    />
                  </div>
                </div>
                
                <div className="space-y-4">
                  <FormField
                    control={form.control}
                    name="inductionCompleted"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                        <FormControl>
                          <Checkbox
                            checked={field.value}
                            onCheckedChange={field.onChange}
                            data-testid="checkbox-inductionCompleted"
                          />
                        </FormControl>
                        <div className="space-y-1 leading-none">
                          <FormLabel>Site Induction Completed</FormLabel>
                          <p className="text-sm text-muted-foreground">
                            Worker has completed the required site induction
                          </p>
                        </div>
                      </FormItem>
                    )}
                  />
                  
                  {/* Induction Action Buttons */}
                  <div className="flex gap-2 mt-3">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        if (worker?.id) {
                          const previewUrl = `/induction/preview?role=contractor&workerId=${worker.id}`;
                          window.open(previewUrl, '_blank', 'width=1200,height=800');
                        }
                      }}
                      className="flex items-center gap-2"
                      data-testid="button-start-induction"
                    >
                      <Video className="h-3 w-3" />
                      Start Induction
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={async () => {
                        if (worker?.email) {
                          try {
                            await apiRequest("POST", `/api/contractors/${worker.id}/send-induction`);
                            toast({
                              title: "Email Sent",
                              description: `Induction email sent successfully to ${worker.email}`,
                            });
                          } catch (error: any) {
                            toast({
                              title: "Error",
                              description: error.message || "Failed to send induction email",
                              variant: "destructive",
                            });
                          }
                        } else {
                          toast({
                            title: "No Email Address",
                            description: "Please add an email address first to send induction by email.",
                            variant: "destructive",
                          });
                        }
                      }}
                      className="flex items-center gap-2"
                      data-testid="button-email-induction"
                    >
                      <Mail className="h-3 w-3" />
                      Email Induction
                    </Button>
                  </div>
                  
                  <div className="p-3 bg-[var(--background)] rounded-lg">
                    <p className="text-sm font-medium text-fixed mb-1">Current Status:</p>
                    <div className="flex items-center gap-2">
                      <CardStatusBadge status={form.watch("currentCardStatus")} />
                      {form.watch("isActive") ? (
                        <Badge className="bg-green-100 text-green-800">Active</Badge>
                      ) : (
                        <Badge className="bg-red-100 text-red-800">Inactive</Badge>
                      )}
                    </div>
                  </div>

                  {/* PEEP Flag */}
                  <FormField
                    control={form.control}
                    name="needsEvacuationAssistance"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-start space-x-3 space-y-0 p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-700">
                        <FormControl>
                          <Checkbox
                            checked={field.value}
                            onCheckedChange={field.onChange}
                            data-testid="checkbox-peep"
                          />
                        </FormControl>
                        <div className="space-y-1 leading-none">
                          <FormLabel className="text-amber-800 dark:text-amber-200">♿ Requires Evacuation Assistance (PEEP)</FormLabel>
                          <p className="text-xs text-amber-600 dark:text-amber-400">
                            Personal Emergency Evacuation Plan — this worker needs assistance during evacuation and will be highlighted on muster lists.
                          </p>
                        </div>
                      </FormItem>
                    )}
                  />
                </div>
              </div>
            </div>

            <Separator />

            {/* CO2 Emissions Tracking Section */}
            {worker && (
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <Leaf className="w-4 h-4 text-green-600" />
                  <h3 className="font-semibold text-gray-900">CO2 Emissions Tracking</h3>
                </div>
                
                <CO2EmissionsTracker
                  workerId={worker.id}
                  workerName={`${worker.firstName} ${worker.lastName}`}
                  currentPostcode={form.watch("postcode") || worker.postcode}
                  onPostcodeUpdate={(postcode) => {
                    form.setValue("postcode", postcode);
                  }}
                />
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex justify-end gap-3 pt-6 border-t">
              <Button
                type="button"
                variant="outline"
                onClick={onClose}
                disabled={updateWorkerMutation.isPending}
                data-testid="button-cancel-edit"
              >
                <X className="w-4 h-4 mr-2" />
                Cancel
              </Button>
              
              <Button
                type="submit"
                disabled={updateWorkerMutation.isPending}
                data-testid="button-save-worker"
              >
                {updateWorkerMutation.isPending ? (
                  <>
                    <div className="w-4 h-4 mr-2 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4 mr-2" />
                    Save Changes
                  </>
                )}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
      
      {/* Add New NVQ Qualification Dialog */}
      <Dialog open={showAddQualificationDialog} onOpenChange={setShowAddQualificationDialog}>
        <DialogContent className="w-[95vw] sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add New NVQ Qualification</DialogTitle>
            <DialogDescription>
              Add a new NVQ qualification that can be selected for contractors.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Qualification Name</label>
              <Input
                value={newQualificationForm.name}
                onChange={(e) => setNewQualificationForm(prev => ({ ...prev, name: e.target.value }))}
                placeholder=""
                data-testid="input-new-qualification-name"
              />
            </div>
            
            <div>
              <label className="text-sm font-medium">Level</label>
              <Select 
                value={newQualificationForm.level.toString()} 
                onValueChange={(value) => setNewQualificationForm(prev => ({ ...prev, level: parseInt(value) }))}
              >
                <SelectTrigger data-testid="select-new-qualification-level">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">Level 1</SelectItem>
                  <SelectItem value="2">Level 2</SelectItem>
                  <SelectItem value="3">Level 3</SelectItem>
                  <SelectItem value="4">Level 4</SelectItem>
                  <SelectItem value="5">Level 5</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div>
              <label className="text-sm font-medium">Industry</label>
              <Input
                value={newQualificationForm.industry}
                onChange={(e) => setNewQualificationForm(prev => ({ ...prev, industry: e.target.value }))}
                placeholder=""
                data-testid="input-new-qualification-industry"
              />
            </div>
            
            <div>
              <label className="text-sm font-medium">Description</label>
              <Textarea
                value={newQualificationForm.description}
                onChange={(e) => setNewQualificationForm(prev => ({ ...prev, description: e.target.value }))}
                placeholder=""
                data-testid="textarea-new-qualification-description"
              />
            </div>
          </div>
          
          <div className="flex justify-end gap-3 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowAddQualificationDialog(false)}
              disabled={addQualificationMutation.isPending}
              data-testid="button-cancel-new-qualification"
            >
              Cancel
            </Button>
            
            <Button
              onClick={() => addQualificationMutation.mutate(newQualificationForm)}
              disabled={addQualificationMutation.isPending || !newQualificationForm.name.trim()}
              data-testid="button-save-new-qualification"
            >
              {addQualificationMutation.isPending ? (
                <>
                  <div className="w-4 h-4 mr-2 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Adding...
                </>
              ) : (
                <>
                  <Plus className="w-4 h-4 mr-2" />
                  Add Qualification
                </>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
}