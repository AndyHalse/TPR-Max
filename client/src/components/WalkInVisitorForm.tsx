import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { apiRequest } from "@/lib/queryClient";
import GlassCard from "@/components/GlassCard";
import TouchKeyboard from "@/components/TouchKeyboard";
import PassPreviewModal from "@/components/PassPreviewModal";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { User, ArrowLeft, Check } from "lucide-react";
import type { Staff, InsertVisitor, Visitor, CompanySettings } from "@shared/schema";

interface WalkInVisitorFormProps {
  onBack: () => void;
}

export default function WalkInVisitorForm({ onBack }: WalkInVisitorFormProps) {
  const { toast } = useToast();
  const [activeField, setActiveField] = useState<"firstName" | "lastName" | "company" | "purpose" | null>(null);
  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    company: "",
    purpose: "",
    hostStaffId: "",
  });
  const [createdVisitor, setCreatedVisitor] = useState<Visitor | null>(null);
  const [showPassPreview, setShowPassPreview] = useState(false);

  const { data: staff } = useQuery<Staff[]>({
    queryKey: ["/api/staff"],
  });

  const { data: settings } = useQuery<CompanySettings>({
    queryKey: ["/api/settings"],
  });

  const checkinMutation = useMutation({
    mutationFn: async (visitor: InsertVisitor) => {
      const response = await apiRequest("POST", "/api/visitors/checkin", visitor);
      return response.json();
    },
    onSuccess: (visitor: Visitor) => {
      setCreatedVisitor(visitor);
      setShowPassPreview(true);
      queryClient.invalidateQueries({ queryKey: ["/api/visitors"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      toast({
        title: "Success",
        description: "Visitor checked in successfully!",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to check in visitor",
        variant: "destructive",
      });
    },
  });

  const handleFieldChange = (field: keyof typeof formData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    
    // Auto-advance to next required field if current field has meaningful content (3+ characters)
    if (value.trim().length >= 2) {
      if (field === "firstName" && !formData.lastName) {
        setTimeout(() => setActiveField("lastName"), 500);
      } else if (field === "lastName" && !formData.hostStaffId) {
        setTimeout(() => setActiveField(null), 500); // Close keyboard to show host selector
      }
    }
  };

  const handleSubmit = () => {
    if (!formData.firstName.trim()) {
      toast({
        title: "Error",
        description: "First name is required",
        variant: "destructive",
      });
      return;
    }

    if (!formData.lastName.trim()) {
      toast({
        title: "Error",
        description: "Last name is required",
        variant: "destructive",
      });
      return;
    }

    if (!formData.hostStaffId) {
      toast({
        title: "Error",
        description: "Please select a host",
        variant: "destructive",
      });
      return;
    }

    const visitorData: InsertVisitor = {
      firstName: formData.firstName.trim(),
      lastName: formData.lastName.trim(),
      company: formData.company || null,
      purpose: formData.purpose || null,
      hostStaffId: formData.hostStaffId,
      carRegistration: null,
    };

    checkinMutation.mutate(visitorData);
  };

  const canSubmit = formData.firstName.trim() && formData.lastName.trim() && formData.hostStaffId;

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50 overflow-hidden">
      <div className="flex flex-col h-screen">
        {/* Company Banner - Compact for touchscreen */}
        {settings?.bannerUrl && (
          <div className="w-full flex-shrink-0 bg-white/90 backdrop-blur-sm border-b border-white/30">
            <div className="flex items-center justify-center py-3 px-6">
              <img 
                src={`/objects${settings.bannerUrl}`} 
                alt={settings.companyName}
                className="h-10 max-w-sm object-contain"
                onError={(e) => {
                  console.error("Kiosk banner failed to load:", settings.bannerUrl);
                  e.currentTarget.style.display = 'none';
                  const container = e.currentTarget.parentElement?.parentElement;
                  if (container) {
                    container.style.display = 'none';
                  }
                }}
              />
            </div>
          </div>
        )}

        {/* Header with Back Button */}
        <div className="px-6 py-4 flex-shrink-0">
          <div className="flex items-center gap-4">
            <Button
              onClick={onBack}
              variant="outline"
              size="lg"
              className="flex items-center gap-3 bg-white/50 border-white/30 text-slate-700 hover:bg-white/70 px-6 py-4 text-lg"
              data-testid="button-back"
            >
              <ArrowLeft size={20} />
              Back
            </Button>
            <div>
              <h2 className="text-3xl font-bold text-slate-800">Manual Check-In</h2>
              <p className="text-slate-600 text-lg">Touch the fields below to enter visitor details</p>
            </div>
          </div>
        </div>

        {/* Main Content Area - scrollable if needed */}
        <div className="flex-1 px-6 pb-4 overflow-y-auto" style={{ maxHeight: "calc(100vh - 400px)" }}>
          <div className="max-w-4xl mx-auto">
            <GlassCard className="p-8">
              <div className="space-y-8">
                <div className="flex items-center gap-4 mb-6">
                  <div className="w-12 h-12 gradient-blue rounded-full flex items-center justify-center">
                    <User className="text-white" size={24} />
                  </div>
                  <h3 className="text-2xl font-semibold text-slate-800">Visitor Information</h3>
                  {activeField && (
                    <div className="ml-auto px-4 py-2 bg-blue-100 rounded-lg">
                      <span className="text-blue-800 font-medium">
                        Entering: {activeField.replace(/([A-Z])/g, ' $1').toLowerCase()}
                      </span>
                    </div>
                  )}
                </div>

                {/* Name Fields */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-3">
                    <Label className="text-xl font-semibold text-slate-700 flex items-center gap-2">
                      <span className="w-6 h-6 bg-red-500 text-white rounded-full text-sm flex items-center justify-center">1</span>
                      First Name *
                    </Label>
                    <div
                      onClick={() => setActiveField("firstName")}
                      className={`w-full px-8 py-8 rounded-2xl border-2 cursor-pointer transition-all text-xl font-medium ${
                        activeField === "firstName" 
                          ? "border-blue-500 bg-blue-50 ring-4 ring-blue-200 shadow-lg" 
                          : "border-white/40 bg-white/60 hover:bg-white/80 hover:border-blue-300 shadow-md"
                      }`}
                      data-testid="input-first-name"
                    >
                      <span className={formData.firstName ? "text-slate-800" : "text-slate-400"}>
                        {formData.firstName || "👆 Touch here to enter first name"}
                      </span>
                    </div>
                  </div>
                  
                  <div className="space-y-3">
                    <Label className="text-xl font-semibold text-slate-700 flex items-center gap-2">
                      <span className="w-6 h-6 bg-red-500 text-white rounded-full text-sm flex items-center justify-center">2</span>
                      Last Name *
                    </Label>
                    <div
                      onClick={() => setActiveField("lastName")}
                      className={`w-full px-8 py-8 rounded-2xl border-2 cursor-pointer transition-all text-xl font-medium ${
                        activeField === "lastName" 
                          ? "border-blue-500 bg-blue-50 ring-4 ring-blue-200 shadow-lg" 
                          : "border-white/40 bg-white/60 hover:bg-white/80 hover:border-blue-300 shadow-md"
                      }`}
                      data-testid="input-last-name"
                    >
                      <span className={formData.lastName ? "text-slate-800" : "text-slate-400"}>
                        {formData.lastName || "👆 Touch here to enter last name"}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Company and Purpose */}
                <div className="space-y-6">
                  <div className="space-y-3">
                    <Label className="text-xl font-semibold text-slate-700 flex items-center gap-2">
                      <span className="w-6 h-6 bg-gray-500 text-white rounded-full text-sm flex items-center justify-center">3</span>
                      Company <span className="text-sm text-slate-500 font-normal">(Optional)</span>
                    </Label>
                    <div
                      onClick={() => setActiveField("company")}
                      className={`w-full px-8 py-8 rounded-2xl border-2 cursor-pointer transition-all text-xl font-medium ${
                        activeField === "company" 
                          ? "border-blue-500 bg-blue-50 ring-4 ring-blue-200 shadow-lg" 
                          : "border-white/40 bg-white/60 hover:bg-white/80 hover:border-blue-300 shadow-md"
                      }`}
                      data-testid="input-company"
                    >
                      <span className={formData.company ? "text-slate-800" : "text-slate-400"}>
                        {formData.company || "👆 Touch here to enter company name"}
                      </span>
                    </div>
                  </div>
                  
                  <div className="space-y-3">
                    <Label className="text-xl font-semibold text-slate-700 flex items-center gap-2">
                      <span className="w-6 h-6 bg-gray-500 text-white rounded-full text-sm flex items-center justify-center">4</span>
                      Purpose of Visit <span className="text-sm text-slate-500 font-normal">(Optional)</span>
                    </Label>
                    <div
                      onClick={() => setActiveField("purpose")}
                      className={`w-full px-8 py-8 rounded-2xl border-2 cursor-pointer transition-all text-xl font-medium ${
                        activeField === "purpose" 
                          ? "border-blue-500 bg-blue-50 ring-4 ring-blue-200 shadow-lg" 
                          : "border-white/40 bg-white/60 hover:bg-white/80 hover:border-blue-300 shadow-md"
                      }`}
                      data-testid="input-purpose"
                    >
                      <span className={formData.purpose ? "text-slate-800" : "text-slate-400"}>
                        {formData.purpose || "👆 Touch here to enter purpose of visit"}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Host Selection */}
                <div className="space-y-3">
                  <Label className="text-xl font-semibold text-slate-700 flex items-center gap-2">
                    <span className="w-6 h-6 bg-red-500 text-white rounded-full text-sm flex items-center justify-center">5</span>
                    Who are you here to see? *
                  </Label>
                  <Select 
                    value={formData.hostStaffId} 
                    onValueChange={(value) => {
                      handleFieldChange("hostStaffId", value);
                      setActiveField(null); // Close keyboard when host is selected
                    }}
                  >
                    <SelectTrigger className="w-full px-8 py-8 rounded-2xl border-2 border-white/40 bg-white/60 text-xl font-medium hover:bg-white/80 hover:border-blue-300" data-testid="select-host">
                      <SelectValue placeholder="👆 Touch here to select your host" className="text-slate-400" />
                    </SelectTrigger>
                    <SelectContent className="text-lg">
                      {staff?.map((member) => (
                        <SelectItem key={member.id} value={member.id} className="py-3">
                          {member.firstName} {member.lastName} - {member.department}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Progress Indicator */}
                <div className="bg-white/50 rounded-xl p-6">
                  <div className="flex items-center justify-between text-sm text-slate-600 mb-2">
                    <span>Progress</span>
                    <span>{[formData.firstName, formData.lastName, formData.hostStaffId].filter(Boolean).length}/3 required fields completed</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-3">
                    <div 
                      className="bg-blue-500 h-3 rounded-full transition-all duration-500"
                      style={{ 
                        width: `${([formData.firstName, formData.lastName, formData.hostStaffId].filter(Boolean).length / 3) * 100}%` 
                      }}
                    />
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex gap-6 pt-4">
                  <Button
                    onClick={onBack}
                    variant="outline"
                    className="flex-1 py-8 text-2xl rounded-2xl border-2 border-slate-300 hover:bg-slate-50"
                    data-testid="button-cancel"
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleSubmit}
                    disabled={!canSubmit || checkinMutation.isPending}
                    className={`flex-1 py-8 text-2xl rounded-2xl font-bold transition-all ${
                      canSubmit 
                        ? "gradient-blue text-white shadow-lg hover:shadow-xl transform hover:scale-105" 
                        : "bg-gray-300 text-gray-500 cursor-not-allowed"
                    }`}
                    data-testid="button-submit"
                  >
                    <Check className="mr-3" size={24} />
                    {checkinMutation.isPending ? "Checking In..." : "Complete Check-In"}
                  </Button>
                </div>
              </div>
            </GlassCard>
          </div>
        </div>

        {/* Fixed Bottom Keyboard */}
        <div className="flex-shrink-0 bg-white/95 backdrop-blur-sm border-t border-white/50">
          <div className="px-6 py-4">
            {activeField ? (
              <div className="max-w-4xl mx-auto">
                <TouchKeyboard
                  value={formData[activeField]}
                  onChange={(value) => handleFieldChange(activeField, value)}
                  placeholder={`Enter ${activeField.replace(/([A-Z])/g, ' $1').toLowerCase()}`}
                  type="text"
                  fieldType={activeField === "firstName" || activeField === "lastName" ? "name" : "general"}
                />
              </div>
            ) : (
              <div className="max-w-4xl mx-auto text-center py-8">
                <div className="text-slate-500">
                  <p className="text-xl mb-2">👆 Touch any field above to start typing</p>
                  <p className="text-lg">The keyboard will appear here when you need it</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {showPassPreview && createdVisitor && (
          <PassPreviewModal
            isOpen={showPassPreview}
            onClose={() => {
              setShowPassPreview(false);
              setCreatedVisitor(null);
              onBack(); // Return to kiosk main screen after pass preview
            }}
            visitor={createdVisitor}
            hostName={staff?.find(s => s.id === createdVisitor.hostStaffId) ? `${staff.find(s => s.id === createdVisitor.hostStaffId)?.firstName} ${staff.find(s => s.id === createdVisitor.hostStaffId)?.lastName}` : undefined}
          />
        )}
      </div>
    </div>
  );
}