import { useState, useEffect, useMemo } from "react";
import DOMPurify from "dompurify";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { 
  FileText, 
  CheckCircle, 
  AlertTriangle,
  Building2,
  Shield,
  User,
  Calendar,
  Loader2
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

// Types for the API responses
interface DocumentAssignmentDetails {
  assignment: {
    id: string;
    documentTemplateId: string;
    workerId: string;
    assignedAt: string;
    dueDate?: string;
    status: 'pending' | 'sent' | 'accepted' | 'rejected';
    acceptanceToken: string;
  };
  template: {
    id: string;
    documentName: string;
    documentDescription?: string;
    templateContent: string;
    complianceCategory: string;
    legalReference?: string;
  };
  worker: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    companyId: string;
  };
  company: {
    id: string;
    name: string;
    contactEmail?: string;
    phone?: string;
  };
}

interface AcceptanceResponse {
  success: boolean;
  message: string;
  acceptanceId?: string;
}

interface HSDocumentAcceptanceProps {
  token: string;
}

export default function HSDocumentAcceptance({ token }: HSDocumentAcceptanceProps) {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [confirmationText, setConfirmationText] = useState("");
  const [digitalSignature, setDigitalSignature] = useState("");
  const [isAccepted, setIsAccepted] = useState(false);

  // Fetch document assignment details
  const { data: documentData, isLoading: documentLoading, error: documentError } = useQuery<DocumentAssignmentDetails>({
    queryKey: [`/api/uk-hs-documents/accept/${token}`],
    queryFn: async () => {
      const response = await fetch(`/api/uk-hs-documents/accept/${token}`);
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to fetch document details');
      }
      return await response.json();
    },
    retry: false, // Don't retry on invalid tokens
    refetchOnWindowFocus: false,
    staleTime: 0, // Always fetch fresh data
  });

  // Submit acceptance mutation
  const acceptanceMutation = useMutation<AcceptanceResponse, Error, {
    confirmationText: string;
    digitalSignature?: string;
    acceptanceMethod: 'email_link';
  }>({
    mutationFn: async (acceptanceData) => {
      const response = await apiRequest("POST", `/api/uk-hs-documents/accept/${token}`, acceptanceData);
      return response as unknown as AcceptanceResponse;
    },
    onSuccess: (data) => {
      setIsAccepted(true);
      toast({
        title: "Document Accepted Successfully",
        description: "Your H&S compliance document has been accepted and recorded.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Acceptance Failed",
        description: error.message || "Failed to accept the document. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleAcceptDocument = () => {
    if (!confirmationText.trim()) {
      toast({
        title: "Confirmation Required",
        description: "Please type 'I ACCEPT' to confirm your acceptance of this document.",
        variant: "destructive",
      });
      return;
    }

    if (confirmationText.toUpperCase() !== 'I ACCEPT') {
      toast({
        title: "Invalid Confirmation",
        description: "Please type exactly 'I ACCEPT' to confirm.",
        variant: "destructive",
      });
      return;
    }

    acceptanceMutation.mutate({
      confirmationText: confirmationText.trim(),
      digitalSignature: digitalSignature.trim() || undefined,
      acceptanceMethod: 'email_link'
    });
  };

  // Show loading state
  if (documentLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
        <Card className="max-w-md w-full p-8 text-center">
          <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4 text-blue-600" />
          <h3 className="text-lg font-semibold text-slate-800 mb-2">Loading Document</h3>
          <p className="text-slate-600">Fetching your H&S compliance document...</p>
        </Card>
      </div>
    );
  }

  // Show error state
  if (documentError || !documentData) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-red-50 to-red-100 flex items-center justify-center p-4">
        <Card className="max-w-md w-full p-8 text-center">
          <AlertTriangle className="w-12 h-12 mx-auto mb-4 text-red-600" />
          <h3 className="text-lg font-semibold text-slate-800 mb-2">Document Not Found</h3>
          <p className="text-slate-600 mb-4">
            The document link is invalid, expired, or has already been processed.
          </p>
          <p className="text-sm text-slate-500">
            Please contact your site supervisor or administrator for assistance.
          </p>
        </Card>
      </div>
    );
  }

  // Show success state after acceptance
  if (isAccepted) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-50 to-green-100 flex items-center justify-center p-4">
        <Card className="max-w-2xl w-full p-8 text-center">
          <CheckCircle className="w-16 h-16 mx-auto mb-6 text-green-600" />
          <h1 className="text-2xl font-bold text-slate-800 mb-4">Document Accepted Successfully!</h1>
          
          <div className="bg-white rounded-lg p-6 mb-6 border border-green-200">
            <div className="flex items-center justify-center gap-4 mb-4">
              <div className="text-center">
                <User className="w-6 h-6 mx-auto mb-2 text-slate-600" />
                <p className="font-medium text-slate-800">
                  {documentData.worker.firstName} {documentData.worker.lastName}
                </p>
                <p className="text-sm text-slate-600">{documentData.worker.email}</p>
              </div>
              <div className="text-center">
                <Building2 className="w-6 h-6 mx-auto mb-2 text-slate-600" />
                <p className="font-medium text-slate-800">{documentData.company.name}</p>
              </div>
            </div>
            
            <div className="border-t pt-4">
              <p className="font-medium text-slate-800 mb-2">{documentData.template.documentName}</p>
              <Badge variant="default" className="bg-green-100 text-green-800 border-green-300">
                ✓ Accepted
              </Badge>
            </div>
          </div>

          <div className="space-y-4">
            <p className="text-slate-600">
              Your acceptance has been recorded and you are now compliant for site access.
            </p>
            <p className="text-sm text-slate-500">
              A confirmation record has been sent to your company administrator.
            </p>
          </div>
        </Card>
      </div>
    );
  }

  // Show acceptance form
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 py-8 px-4">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="flex justify-center items-center gap-3 mb-4">
            <Shield className="w-10 h-10 text-red-600" />
            <h1 className="text-3xl font-bold text-slate-800">UK Health & Safety Compliance</h1>
          </div>
          <p className="text-lg text-slate-600">Document Review and Acceptance Required</p>
        </div>

        {/* Document Info Card */}
        <Card className="mb-8 p-6 bg-white/90 backdrop-blur-sm border-slate-200 shadow-lg">
          <div className="grid md:grid-cols-2 gap-6 mb-6">
            <div>
              <div className="flex items-center gap-2 mb-3">
                <User className="w-5 h-5 text-slate-600" />
                <h3 className="font-semibold text-slate-800">Worker Information</h3>
              </div>
              <div className="space-y-1 text-sm">
                <p><span className="font-medium">Name:</span> {documentData.worker.firstName} {documentData.worker.lastName}</p>
                <p><span className="font-medium">Email:</span> {documentData.worker.email}</p>
              </div>
            </div>
            
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Building2 className="w-5 h-5 text-slate-600" />
                <h3 className="font-semibold text-slate-800">Company Information</h3>
              </div>
              <div className="space-y-1 text-sm">
                <p><span className="font-medium">Company:</span> {documentData.company.name}</p>
                {documentData.company.contactEmail && (
                  <p><span className="font-medium">Contact:</span> {documentData.company.contactEmail}</p>
                )}
              </div>
            </div>
          </div>

          <div className="border-t pt-6">
            <div className="flex items-center gap-2 mb-3">
              <FileText className="w-5 h-5 text-slate-600" />
              <h3 className="font-semibold text-slate-800">Document Details</h3>
            </div>
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <p className="text-lg font-medium text-slate-800 mb-2">{documentData.template.documentName}</p>
                <Badge variant="outline" className="text-xs">
                  {documentData.template.complianceCategory.toUpperCase()}
                </Badge>
              </div>
              <div className="text-sm text-slate-600">
                {documentData.assignment.dueDate && (
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4" />
                    <span>Due: {new Date(documentData.assignment.dueDate).toLocaleDateString('en-GB')}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </Card>

        {/* Document Content */}
        <Card className="mb-8 p-6 bg-white/90 backdrop-blur-sm border-slate-200 shadow-lg">
          <h3 className="text-xl font-semibold text-slate-800 mb-4">Document Content</h3>
          <div className="prose prose-slate max-w-none">
            <div dangerouslySetInnerHTML={{ 
              __html: DOMPurify.sanitize(documentData.template.templateContent || documentData.template.documentDescription || 'Document content loading...')
            }} />
          </div>
          {documentData.template.legalReference && (
            <div className="mt-6 p-4 bg-slate-50 rounded-lg">
              <p className="text-sm text-slate-600">
                <span className="font-medium">Legal Reference:</span> {documentData.template.legalReference}
              </p>
            </div>
          )}
        </Card>

        {/* Acceptance Form */}
        <Card className="p-6 bg-white/90 backdrop-blur-sm border-slate-200 shadow-lg">
          <h3 className="text-xl font-semibold text-slate-800 mb-6">Document Acceptance</h3>
          
          <div className="space-y-6">
            {/* Digital Signature */}
            <div>
              <Label htmlFor="signature" className="text-sm font-medium">
                Digital Signature (Optional)
              </Label>
              <Input
                id="signature"
                type="text"
                placeholder="Type your full name as a digital signature"
                value={digitalSignature}
                onChange={(e) => setDigitalSignature(e.target.value)}
                className="mt-1"
                data-testid="input-digital-signature"
              />
              <p className="text-xs text-slate-500 mt-1">
                Your digital signature confirms your identity and agreement
              </p>
            </div>

            {/* Confirmation Text */}
            <div>
              <Label htmlFor="confirmation" className="text-sm font-medium">
                Confirmation * <span className="text-red-500">Required</span>
              </Label>
              <Input
                id="confirmation"
                type="text"
                placeholder="Type 'I ACCEPT' to confirm"
                value={confirmationText}
                onChange={(e) => setConfirmationText(e.target.value)}
                className="mt-1"
                data-testid="input-confirmation-text"
              />
              <p className="text-xs text-slate-500 mt-1">
                You must type exactly "I ACCEPT" to confirm your acceptance
              </p>
            </div>

            {/* Legal Notice */}
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-yellow-600 mt-0.5 flex-shrink-0" />
                <div className="text-sm">
                  <p className="font-medium text-yellow-800 mb-2">Legal Notice</p>
                  <p className="text-yellow-700">
                    By accepting this document, you confirm that you have read, understood, and agree to 
                    comply with all the health and safety requirements outlined above. This acceptance 
                    is legally binding and will be recorded for compliance purposes.
                  </p>
                </div>
              </div>
            </div>

            {/* Accept Button */}
            <div className="pt-4">
              <Button
                onClick={handleAcceptDocument}
                disabled={acceptanceMutation.isPending || !confirmationText.trim()}
                className="w-full bg-green-600 hover:bg-green-700 text-white py-3 text-lg font-semibold"
                data-testid="button-accept-document"
              >
                {acceptanceMutation.isPending ? (
                  <>
                    <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                    Processing Acceptance...
                  </>
                ) : (
                  <>
                    <CheckCircle className="w-5 h-5 mr-2" />
                    Accept H&S Document
                  </>
                )}
              </Button>
            </div>
          </div>
        </Card>

        {/* Footer */}
        <div className="text-center mt-8">
          <p className="text-sm text-slate-500">
            This document acceptance is powered by VisiGate Pro compliance system
          </p>
        </div>
      </div>
    </div>
  );
}