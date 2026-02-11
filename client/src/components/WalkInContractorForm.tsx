import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import GlassCard from "@/components/GlassCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Upload, FileText, Shield, User, Building2 } from "lucide-react";

interface WalkInContractorFormProps {
  onBack: () => void;
}

export default function WalkInContractorForm({ onBack }: WalkInContractorFormProps) {
  const { toast } = useToast();
  const [formData, setFormData] = useState({
    companyName: "",
    contactFirstName: "",
    contactLastName: "",
    email: "",
    phone: "",
    address: "",
    postcode: "",
    // Worker details
    workerFirstName: "",
    workerLastName: "",
    workerEmail: "",
    workerPhone: "",
    workerPostcode: "",
    workerTransportMethod: "car_diesel" as "car_diesel" | "car_petrol" | "electric_car" | "public_transport" | "motorcycle",
    rightToWork: "",
    cscsCard: "",
    purpose: "",
    notes: "",
  });

  const [documents, setDocuments] = useState({
    publicLiability: null as File | null,
    employersLiability: null as File | null,
    healthSafety: null as File | null,
    cisRegistration: null as File | null,
    rightToWorkDoc: null as File | null,
    cscsCardDoc: null as File | null,
  });

  const registerMutation = useMutation({
    mutationFn: async (data: any) => {
      // First create the contractor company
      const contractorResponse = await apiRequest("POST", "/api/contractors", {
        name: data.companyName,
        email: data.email,
        phone: data.phone,
        address: data.address,
        postcode: data.postcode,
        contactFirstName: data.contactFirstName,
        contactLastName: data.contactLastName,
        status: "pending", // Walk-ins need approval
      });
      
      const contractor = await contractorResponse.json();
      
      // Then add the worker
      const workerResponse = await apiRequest("POST", `/api/contractors/${contractor.id}/workers`, {
        firstName: data.workerFirstName,
        lastName: data.workerLastName,
        email: data.workerEmail,
        phone: data.workerPhone,
        postcode: data.workerPostcode,
        transportMethod: data.workerTransportMethod,
        rightToWork: data.rightToWork || "pending",
        cscsCard: data.cscsCard,
        cscsStatus: data.cscsCard ? "valid" : "missing",
        inductionCompleted: false, // Walk-ins need induction
        isActive: true,
      });

      return { contractor, worker: await workerResponse.json() };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/contractors"] });
      queryClient.invalidateQueries({ queryKey: ["/api/contractors/checked-in"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/muster"] });
      toast({
        title: "Success",
        description: `Walk-in contractor ${data.contractor.name} registered successfully. Pending approval and document verification.`,
      });
      onBack();
    },
    onError: (error: any) => {
      toast({
        title: "Registration Failed",
        description: error.message || "Failed to register walk-in contractor",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.companyName.trim() || !formData.contactFirstName.trim() || !formData.contactLastName.trim() || !formData.workerFirstName.trim() || !formData.workerLastName.trim()) {
      toast({
        title: "Error",
        description: "Company name, contact person name, and worker name are required",
        variant: "destructive",
      });
      return;
    }

    if (!formData.workerPostcode.trim()) {
      toast({
        title: "Error",
        description: "Worker home post code is required for CO2 calculations",
        variant: "destructive",
      });
      return;
    }

    if (!formData.workerTransportMethod) {
      toast({
        title: "Error",
        description: "Worker vehicle fuel type is required for CO2 calculations",
        variant: "destructive",
      });
      return;
    }

    registerMutation.mutate(formData);
  };

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleFileChange = (docType: string, file: File | null) => {
    setDocuments(prev => ({ ...prev, [docType]: file }));
  };

  return (
    <div className="min-h-screen bg-background p-4 md:p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <GlassCard className="text-center">
          <div className="flex items-center justify-center gap-3 mb-4">
            <User className="h-10 w-10 text-green-600" />
            <h1 className="text-3xl font-bold text-fixed">Walk-in Contractor Registration</h1>
          </div>
          <p className="text-variable">Register new contractor company and worker for onsite clearance</p>
        </GlassCard>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Company Information */}
          <GlassCard>
            <div className="flex items-center gap-2 mb-4">
              <Building2 className="h-5 w-5 text-blue-600" />
              <h3 className="text-lg font-semibold text-fixed">Company Information</h3>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="companyName">Company Name *</Label>
                <Input
                  id="companyName"
                  value={formData.companyName}
                  onChange={(e) => handleInputChange("companyName", e.target.value)}
                  placeholder="Enter company name"
                  data-testid="input-company-name"
                  required
                />
              </div>
              
              <div>
                <Label htmlFor="contactFirstName">Contact First Name *</Label>
                <Input
                  id="contactFirstName"
                  value={formData.contactFirstName}
                  onChange={(e) => handleInputChange("contactFirstName", e.target.value)}
                  placeholder="Enter contact first name"
                  data-testid="input-contact-first-name"
                  required
                />
              </div>
              
              <div>
                <Label htmlFor="contactLastName">Contact Last Name *</Label>
                <Input
                  id="contactLastName"
                  value={formData.contactLastName}
                  onChange={(e) => handleInputChange("contactLastName", e.target.value)}
                  placeholder="Enter contact last name"
                  data-testid="input-contact-last-name"
                  required
                />
              </div>
              
              <div>
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => handleInputChange("email", e.target.value)}
                  placeholder="Enter email address"
                  data-testid="input-email"
                />
              </div>
              
              <div>
                <Label htmlFor="phone">Phone</Label>
                <Input
                  id="phone"
                  value={formData.phone}
                  onChange={(e) => handleInputChange("phone", e.target.value)}
                  placeholder="Enter phone number"
                  data-testid="input-phone"
                />
              </div>
              
              <div>
                <Label htmlFor="postcode">Post Code</Label>
                <Input
                  id="postcode"
                  value={formData.postcode}
                  onChange={(e) => handleInputChange("postcode", e.target.value.replace(/\s/g, '').toUpperCase())}
                  placeholder="SW1A1AA"
                  maxLength={8}
                  data-testid="input-company-postcode"
                  style={{ textTransform: 'uppercase' }}
                />
                <p className="text-xs text-variable">Company post code for better data management</p>
              </div>
              
              <div className="md:col-span-2">
                <Label htmlFor="address">Address</Label>
                <Input
                  id="address"
                  value={formData.address}
                  onChange={(e) => handleInputChange("address", e.target.value)}
                  placeholder="Enter company address"
                  data-testid="input-address"
                />
              </div>
            </div>
          </GlassCard>

          {/* Worker Information */}
          <GlassCard>
            <div className="flex items-center gap-2 mb-4">
              <User className="h-5 w-5 text-green-600" />
              <h3 className="text-lg font-semibold text-fixed">Worker Information</h3>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="workerFirstName">First Name *</Label>
                <Input
                  id="workerFirstName"
                  value={formData.workerFirstName}
                  onChange={(e) => handleInputChange("workerFirstName", e.target.value)}
                  placeholder="Enter worker first name"
                  data-testid="input-worker-first-name"
                  required
                />
              </div>
              
              <div>
                <Label htmlFor="workerLastName">Last Name *</Label>
                <Input
                  id="workerLastName"
                  value={formData.workerLastName}
                  onChange={(e) => handleInputChange("workerLastName", e.target.value)}
                  placeholder="Enter worker last name"
                  data-testid="input-worker-last-name"
                  required
                />
              </div>
              
              <div>
                <Label htmlFor="workerEmail">Worker Email</Label>
                <Input
                  id="workerEmail"
                  type="email"
                  value={formData.workerEmail}
                  onChange={(e) => handleInputChange("workerEmail", e.target.value)}
                  placeholder="Enter worker email"
                  data-testid="input-worker-email"
                />
              </div>
              
              <div>
                <Label htmlFor="workerPhone">Worker Phone</Label>
                <Input
                  id="workerPhone"
                  value={formData.workerPhone}
                  onChange={(e) => handleInputChange("workerPhone", e.target.value)}
                  placeholder="Enter worker phone"
                  data-testid="input-worker-phone"
                />
              </div>
              
              <div>
                <Label htmlFor="workerPostcode">Home Post Code *</Label>
                <Input
                  id="workerPostcode"
                  value={formData.workerPostcode}
                  onChange={(e) => handleInputChange("workerPostcode", e.target.value.replace(/\s/g, '').toUpperCase())}
                  placeholder="SW1A1AA"
                  maxLength={8}
                  data-testid="input-worker-postcode"
                  style={{ textTransform: 'uppercase' }}
                  required
                />
                <p className="text-xs text-variable">Required for CO2 emission calculations</p>
              </div>
              
              <div>
                <Label htmlFor="workerTransportMethod">Vehicle Fuel Type *</Label>
                <Select value={formData.workerTransportMethod} onValueChange={(value) => handleInputChange("workerTransportMethod", value)}>
                  <SelectTrigger data-testid="select-worker-transport-method">
                    <SelectValue placeholder="Select vehicle type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="car_diesel">🚗 Diesel Car</SelectItem>
                    <SelectItem value="car_petrol">🚗 Petrol Car</SelectItem>
                    <SelectItem value="electric_car">⚡ Electric Car</SelectItem>
                    <SelectItem value="motorcycle">🏍️ Motorcycle</SelectItem>
                    <SelectItem value="public_transport">🚌 Public Transport</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-variable">Required for CO2 emission calculations</p>
              </div>
              
              <div>
                <Label htmlFor="rightToWork">Right to Work Status</Label>
                <Select value={formData.rightToWork} onValueChange={(value) => handleInputChange("rightToWork", value)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select right to work status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="valid">Valid</SelectItem>
                    <SelectItem value="pending">Pending Verification</SelectItem>
                    <SelectItem value="expired">Expired</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div>
                <Label htmlFor="cscsCard">CSCS Card Number</Label>
                <Input
                  id="cscsCard"
                  value={formData.cscsCard}
                  onChange={(e) => handleInputChange("cscsCard", e.target.value)}
                  placeholder="Enter CSCS card number"
                  data-testid="input-cscs-card"
                />
              </div>
              
              <div className="md:col-span-2">
                <Label htmlFor="purpose">Purpose of Visit</Label>
                <Textarea
                  id="purpose"
                  value={formData.purpose}
                  onChange={(e) => handleInputChange("purpose", e.target.value)}
                  placeholder="Describe the purpose of this contractor visit"
                  data-testid="input-purpose"
                />
              </div>
            </div>
          </GlassCard>

          {/* Document Upload */}
          <GlassCard>
            <div className="flex items-center gap-2 mb-4">
              <Shield className="h-5 w-5 text-red-600" />
              <h3 className="text-lg font-semibold text-fixed">Required Documents</h3>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {Object.entries({
                publicLiability: "Public Liability Insurance",
                employersLiability: "Employers Liability Insurance", 
                healthSafety: "Health & Safety Policy",
                cisRegistration: "CIS Registration",
                rightToWorkDoc: "Right to Work Document",
                cscsCardDoc: "CSCS Card Copy"
              }).map(([key, label]) => (
                <div key={key}>
                  <Label htmlFor={key}>{label}</Label>
                  <div className="mt-1 flex items-center gap-2">
                    <Input
                      id={key}
                      type="file"
                      accept=".pdf,.jpg,.jpeg,.png"
                      onChange={(e) => handleFileChange(key, e.target.files?.[0] || null)}
                      className="file:mr-2 file:rounded file:border-0 file:bg-blue-50 file:text-blue-700"
                    />
                    {documents[key as keyof typeof documents] && (
                      <FileText className="h-4 w-4 text-green-600" />
                    )}
                  </div>
                </div>
              ))}
            </div>
            
            <div className="mt-4 p-3 bg-yellow-50 rounded-lg border border-yellow-200">
              <p className="text-sm text-yellow-800">
                <strong>Note:</strong> Walk-in contractors require document verification and safety approval before site access. 
                All documents will be reviewed by the safety team.
              </p>
            </div>
          </GlassCard>

          {/* Action Buttons */}
          <div className="flex gap-4">
            <Button
              type="button"
              variant="outline"
              onClick={onBack}
              className="flex-1"
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Button>
            
            <Button
              type="submit"
              disabled={registerMutation.isPending}
              className="flex-1 bg-green-600 hover:bg-green-700"
              data-testid="button-register-contractor"
            >
              <Upload className="mr-2 h-4 w-4" />
              {registerMutation.isPending ? "Registering..." : "Register Contractor"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}