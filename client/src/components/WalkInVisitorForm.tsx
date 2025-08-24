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
      name: `${formData.firstName} ${formData.lastName}`,
      company: formData.company || null,
      purpose: formData.purpose || null,
      hostStaffId: formData.hostStaffId,
      carRegistration: null,
    };

    checkinMutation.mutate(visitorData);
  };

  const canSubmit = formData.firstName.trim() && formData.lastName.trim() && formData.hostStaffId;

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50 p-4">
      {/* Company Banner */}
      {settings?.bannerUrl && (
        <div className="w-full h-32 mb-8 rounded-2xl overflow-hidden">
          <img 
            src={settings.bannerUrl} 
            alt={settings.companyName}
            className="w-full h-full object-cover"
          />
        </div>
      )}
      
      <div className="max-w-6xl mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Form Section */}
          <div className="space-y-6">
            <div className="flex items-center gap-4 mb-6">
              <Button
                onClick={onBack}
                variant="outline"
                size="sm"
                className="flex items-center gap-2 bg-white/50 border-white/30 text-slate-700 hover:bg-white/70"
                data-testid="button-back"
              >
                <ArrowLeft size={16} />
                Back
              </Button>
              <div>
                <h2 className="text-3xl font-bold text-slate-800">Manual Check-In</h2>
                <p className="text-slate-600">Register a new visitor</p>
              </div>
            </div>

            <GlassCard className="p-6">
              <div className="space-y-6">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 gradient-blue rounded-full flex items-center justify-center">
                    <User className="text-white" size={20} />
                  </div>
                  <h3 className="text-xl font-semibold text-slate-800">Visitor Information</h3>
                </div>

                {/* Name Fields */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-lg font-medium text-slate-700">
                      First Name *
                    </Label>
                    <div
                      onClick={() => setActiveField("firstName")}
                      className={`w-full px-6 py-6 rounded-xl border cursor-pointer transition-all text-lg ${
                        activeField === "firstName" 
                          ? "border-blue-500 bg-blue-50/50 ring-2 ring-blue-200" 
                          : "border-white/30 bg-white/50 hover:bg-white/70"
                      }`}
                      data-testid="input-first-name"
                    >
                      <span className={formData.firstName ? "text-slate-800" : "text-slate-400"}>
                        {formData.firstName || "Tap to enter"}
                      </span>
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <Label className="text-lg font-medium text-slate-700">
                      Last Name *
                    </Label>
                    <div
                      onClick={() => setActiveField("lastName")}
                      className={`w-full px-6 py-6 rounded-xl border cursor-pointer transition-all text-lg ${
                        activeField === "lastName" 
                          ? "border-blue-500 bg-blue-50/50 ring-2 ring-blue-200" 
                          : "border-white/30 bg-white/50 hover:bg-white/70"
                      }`}
                      data-testid="input-last-name"
                    >
                      <span className={formData.lastName ? "text-slate-800" : "text-slate-400"}>
                        {formData.lastName || "Tap to enter"}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Company and Purpose */}
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label className="text-lg font-medium text-slate-700">
                      Company
                    </Label>
                    <div
                      onClick={() => setActiveField("company")}
                      className={`w-full px-6 py-6 rounded-xl border cursor-pointer transition-all text-lg ${
                        activeField === "company" 
                          ? "border-blue-500 bg-blue-50/50 ring-2 ring-blue-200" 
                          : "border-white/30 bg-white/50 hover:bg-white/70"
                      }`}
                      data-testid="input-company"
                    >
                      <span className={formData.company ? "text-slate-800" : "text-slate-400"}>
                        {formData.company || "Tap to enter"}
                      </span>
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <Label className="text-lg font-medium text-slate-700">
                      Purpose of Visit
                    </Label>
                    <div
                      onClick={() => setActiveField("purpose")}
                      className={`w-full px-6 py-6 rounded-xl border cursor-pointer transition-all text-lg ${
                        activeField === "purpose" 
                          ? "border-blue-500 bg-blue-50/50 ring-2 ring-blue-200" 
                          : "border-white/30 bg-white/50 hover:bg-white/70"
                      }`}
                      data-testid="input-purpose"
                    >
                      <span className={formData.purpose ? "text-slate-800" : "text-slate-400"}>
                        {formData.purpose || "Tap to enter"}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Host Selection */}
                <div className="space-y-2">
                  <Label className="text-lg font-medium text-slate-700">
                    Host / Person to See *
                  </Label>
                  <Select value={formData.hostStaffId} onValueChange={(value) => handleFieldChange("hostStaffId", value)}>
                    <SelectTrigger className="w-full px-6 py-6 rounded-xl border border-white/30 bg-white/50 text-lg" data-testid="select-host">
                      <SelectValue placeholder="Select your host" />
                    </SelectTrigger>
                    <SelectContent>
                      {staff?.map((member) => (
                        <SelectItem key={member.id} value={member.id}>
                          {member.firstName} {member.lastName} - {member.department}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Submit Button */}
              <div className="mt-8 flex gap-4">
                <Button
                  onClick={onBack}
                  variant="outline"
                  className="flex-1 py-6 text-xl rounded-xl"
                  data-testid="button-cancel"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleSubmit}
                  disabled={!canSubmit || checkinMutation.isPending}
                  className="flex-1 gradient-blue text-white py-6 text-xl rounded-xl"
                  data-testid="button-submit"
                >
                  <Check className="mr-2" size={20} />
                  {checkinMutation.isPending ? "Checking In..." : "Check In"}
                </Button>
              </div>
            </GlassCard>
          </div>

          {/* Touch Keyboard Section */}
          <div className="space-y-6">
            {activeField && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-xl font-semibold text-slate-800">
                    Entering: {activeField.replace(/([A-Z])/g, ' $1').toLowerCase()}
                  </h3>
                  <Button
                    onClick={() => setActiveField(null)}
                    variant="outline"
                    size="sm"
                    className="bg-white/50 border-white/30 text-slate-700 hover:bg-white/70"
                  >
                    Close Keyboard
                  </Button>
                </div>
                
                <TouchKeyboard
                  value={formData[activeField]}
                  onChange={(value) => handleFieldChange(activeField, value)}
                  placeholder={`Enter ${activeField.replace(/([A-Z])/g, ' $1').toLowerCase()}`}
                  type="text"
                />
              </div>
            )}
            
            {!activeField && (
              <div className="text-center py-12 text-slate-500">
                <p className="text-xl">Tap any field above to begin typing</p>
                <p className="text-lg mt-2">Touch-optimized keyboard interface</p>
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