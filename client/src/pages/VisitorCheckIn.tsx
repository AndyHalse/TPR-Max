import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { apiRequest } from "@/lib/queryClient";
import { useLocation } from "wouter";
import GlassCard from "@/components/GlassCard";
import PassPreviewModal from "@/components/PassPreviewModal";
import { ArrowLeft, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import type { Staff, InsertVisitor, Visitor } from "@shared/schema";

export default function VisitorCheckIn() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [formData, setFormData] = useState({
    name: "",
    company: "",
    hostStaffId: "",
    purpose: "",
    carRegistration: "",
  });
  const [createdVisitor, setCreatedVisitor] = useState<Visitor | null>(null);
  const [showPassPreview, setShowPassPreview] = useState(false);

  const { data: staff } = useQuery<Staff[]>({
    queryKey: ["/api/staff"],
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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.name.trim()) {
      toast({
        title: "Error",
        description: "Name is required",
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

    checkinMutation.mutate({
      name: formData.name.trim(),
      company: formData.company.trim() || null,
      hostStaffId: formData.hostStaffId,
      purpose: formData.purpose.trim() || null,
      carRegistration: formData.carRegistration.trim() || null,
      isCheckedIn: true,
    });
  };

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  return (
    <div className="max-w-2xl mx-auto">
      <GlassCard className="p-8">
        <div className="text-center mb-8">
          <h2 className="text-2xl font-bold text-slate-800 mb-2">Visitor Check-In</h2>
          <p className="text-slate-600">Please fill in your details below</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label htmlFor="name" className="text-sm font-medium text-slate-700">
                Full Name *
              </Label>
              <Input
                id="name"
                type="text"
                required
                value={formData.name}
                onChange={(e) => handleInputChange("name", e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-white/30 bg-white/50 focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-800"
                placeholder="Enter your full name"
                data-testid="input-visitor-name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="company" className="text-sm font-medium text-slate-700">
                Company
              </Label>
              <Input
                id="company"
                type="text"
                value={formData.company}
                onChange={(e) => handleInputChange("company", e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-white/30 bg-white/50 focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-800"
                placeholder="Your company name"
                data-testid="input-visitor-company"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="host" className="text-sm font-medium text-slate-700">
              Host *
            </Label>
            <Select value={formData.hostStaffId} onValueChange={(value) => handleInputChange("hostStaffId", value)}>
              <SelectTrigger className="w-full px-4 py-3 rounded-xl border border-white/30 bg-white/50 focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-800" data-testid="select-host">
                <SelectValue placeholder="Select your host" />
              </SelectTrigger>
              <SelectContent>
                {staff?.map((member) => (
                  <SelectItem key={member.id} value={member.id}>
                    {member.name} - {member.department}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="purpose" className="text-sm font-medium text-slate-700">
              Purpose of Visit
            </Label>
            <Input
              id="purpose"
              type="text"
              value={formData.purpose}
              onChange={(e) => handleInputChange("purpose", e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-white/30 bg-white/50 focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-800"
              placeholder="Reason for your visit"
              data-testid="input-visitor-purpose"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="carRegistration" className="text-sm font-medium text-slate-700">
              Car Registration (Optional)
            </Label>
            <Input
              id="carRegistration"
              type="text"
              value={formData.carRegistration}
              onChange={(e) => handleInputChange("carRegistration", e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-white/30 bg-white/50 focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-800"
              placeholder="Vehicle registration number"
              data-testid="input-visitor-car-registration"
            />
          </div>

          <div className="flex gap-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => setLocation("/kiosk")}
              className="flex-1 px-6 py-3 rounded-xl border border-slate-300 text-slate-700 font-medium hover:bg-slate-50 transition-colors"
              data-testid="button-back-to-kiosk"
            >
              <ArrowLeft className="mr-2" size={16} />
              Back
            </Button>
            <Button
              type="submit"
              disabled={checkinMutation.isPending}
              className="flex-1 gradient-blue text-white px-6 py-3 rounded-xl font-medium hover:shadow-lg transition-all duration-300 disabled:opacity-50"
              data-testid="button-submit-checkin"
            >
              {checkinMutation.isPending ? (
                "Checking In..."
              ) : (
                <>
                  <Check className="mr-2" size={16} />
                  Check In & Print Pass
                </>
              )}
            </Button>
          </div>
        </form>
      </GlassCard>

      {createdVisitor && (
        <PassPreviewModal
          isOpen={showPassPreview}
          onClose={() => {
            setShowPassPreview(false);
            setLocation("/kiosk");
          }}
          visitor={createdVisitor}
          hostName={staff?.find(s => s.id === createdVisitor.hostStaffId)?.name}
        />
      )}
    </div>
  );
}
