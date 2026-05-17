import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { apiRequest } from "@/lib/queryClient";
import GlassCard from "@/components/GlassCard";
import TouchKeyboard from "@/components/TouchKeyboard";
import PassPreviewModal from "@/components/PassPreviewModal";
import HSAcceptanceModal from "@/components/HSAcceptanceModal";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { User, ArrowLeft, Check, Search, X, UserCheck } from "lucide-react";
import type { Staff, InsertVisitor, Visitor, CompanySettings } from "@shared/schema";
import { printPassViaIframe } from "@/lib/printUtils";

interface WalkInVisitorFormProps {
  onBack: () => void;
}

const FIELD_ORDER: Array<"firstName" | "lastName" | "company" | "purpose"> = ["firstName", "lastName", "company", "purpose"];

const FIELD_LABELS: Record<string, string> = {
  firstName: "Last Name",
  lastName: "Company",
  company: "Purpose of Visit",
  purpose: "Host Selection",
};

export default function WalkInVisitorForm({ onBack }: WalkInVisitorFormProps) {
  const { toast } = useToast();
  const [activeField, setActiveField] = useState<"firstName" | "lastName" | "company" | "purpose" | "hostSearch" | null>("firstName");
  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    company: "",
    purpose: "",
    hostStaffId: "",
  });
  const [hostSearch, setHostSearch] = useState("");
  const [selectedHost, setSelectedHost] = useState<Staff | null>(null);
  const [createdVisitor, setCreatedVisitor] = useState<Visitor | null>(null);
  const [showPassPreview, setShowPassPreview] = useState(false);
  const [showHSModal, setShowHSModal] = useState(false);
  const [pendingVisitorData, setPendingVisitorData] = useState<InsertVisitor | null>(null);

  const { data: allStaff } = useQuery<Staff[]>({
    queryKey: ["/api/staff"],
  });

  const { data: settings } = useQuery<CompanySettings>({
    queryKey: ["/api/settings"],
  });

  const filteredStaff = useMemo(() => {
    if (!allStaff) return [];
    if (hostSearch.trim().length < 3) return [];
    const search = hostSearch.toLowerCase().trim();
    return allStaff.filter(
      (s) =>
        s.lastName?.toLowerCase().includes(search) ||
        s.firstName?.toLowerCase().includes(search) ||
        s.department?.toLowerCase().includes(search)
    );
  }, [allStaff, hostSearch]);

  useEffect(() => {
    const brandSettings = settings as any;
    if (brandSettings?.backgroundColor || brandSettings?.fixedTextColor || brandSettings?.variableTextColor || brandSettings?.accentColor) {
      const root = document.documentElement;
      
      const hexToHsl = (hex: string) => {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        if (!result) return null;
        const r = parseInt(result[1], 16) / 255;
        const g = parseInt(result[2], 16) / 255;
        const b = parseInt(result[3], 16) / 255;
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        let h = 0, s = 0;
        const l = (max + min) / 2;
        if (max !== min) {
          const d = max - min;
          s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
          switch (max) {
            case r: h = (g - b) / d + (g < b ? 6 : 0); break;
            case g: h = (b - r) / d + 2; break;
            case b: h = (r - g) / d + 4; break;
          }
          h /= 6;
        }
        return `${Math.round(h * 360)}, ${Math.round(s * 100)}%, ${Math.round(l * 100)}%`;
      };

      if (brandSettings.backgroundColor) {
        const hsl = hexToHsl(brandSettings.backgroundColor);
        if (hsl) {
          root.style.setProperty('--background', `hsl(${hsl})`);
          root.style.setProperty('--card', `hsl(${hsl})`);
          root.style.setProperty('--popover', `hsl(${hsl})`);
        }
      }
      if (brandSettings.fixedTextColor) {
        const hsl = hexToHsl(brandSettings.fixedTextColor);
        if (hsl) root.style.setProperty('--fixed-text', `hsl(${hsl})`);
      }
      if (brandSettings.variableTextColor) {
        const hsl = hexToHsl(brandSettings.variableTextColor);
        if (hsl) root.style.setProperty('--variable-text', `hsl(${hsl})`);
      }
      if (brandSettings.accentColor) {
        const hsl = hexToHsl(brandSettings.accentColor);
        if (hsl) {
          root.style.setProperty('--primary', `hsl(${hsl})`);
          root.style.setProperty('--accent', `hsl(${hsl})`);
          root.style.setProperty('--ring', `hsl(${hsl})`);
        }
      }
    }
  }, [settings]);

  const checkinMutation = useMutation({
    mutationFn: async (visitor: InsertVisitor) => {
      const response = await apiRequest("POST", "/api/visitors/checkin", visitor);
      return response.json();
    },
    onSuccess: (visitor: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/visitors"] });
      queryClient.invalidateQueries({ queryKey: ["/api/visitors/current"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/muster"] });

      if (visitor.ePassSent) {
        toast({
          title: "Digital Pass Sent",
          description: `A digital e-pass has been sent to ${visitor.firstName} ${visitor.lastName}. Visitor checked in successfully!`,
        });
        setTimeout(() => onBack(), 2000);
      } else {
        setCreatedVisitor(visitor);
        setShowPassPreview(true);
        printPassViaIframe(`/api/passes/print/visitor/${visitor.id}`);
        toast({
          title: "Success",
          description: "Visitor checked in! Pass is printing...",
        });
      }
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

  const handleNextField = () => {
    if (!activeField) return;
    if (activeField === "hostSearch") {
      setActiveField(null);
      return;
    }
    const currentIndex = FIELD_ORDER.indexOf(activeField as any);
    if (currentIndex < FIELD_ORDER.length - 1) {
      setActiveField(FIELD_ORDER[currentIndex + 1]);
    } else {
      setActiveField(null);
    }
  };

  const getNextLabel = () => {
    if (!activeField || activeField === "hostSearch") return "Done";
    return `Next: ${FIELD_LABELS[activeField] || "Next"}`;
  };

  const handleSelectHost = (member: Staff) => {
    setFormData(prev => ({ ...prev, hostStaffId: member.id }));
    setSelectedHost(member);
    setActiveField(null);
    setHostSearch("");
  };

  const handleSubmit = () => {
    if (!formData.firstName.trim()) {
      toast({ title: "Error", description: "First name is required", variant: "destructive" });
      setActiveField("firstName");
      return;
    }
    if (!formData.lastName.trim()) {
      toast({ title: "Error", description: "Last name is required", variant: "destructive" });
      setActiveField("lastName");
      return;
    }
    if (!formData.hostStaffId) {
      toast({ title: "Error", description: "Please select a host", variant: "destructive" });
      setActiveField(null);
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

    const settingsAny = settings as any;
    if (settingsAny?.hsRulesEnabled !== false && settingsAny?.hsRulesRequireAcceptance && settingsAny?.hsRulesContent) {
      setPendingVisitorData(visitorData);
      setShowHSModal(true);
      return;
    }

    checkinMutation.mutate(visitorData);
  };

  const handleHSAccepted = () => {
    setShowHSModal(false);
    if (pendingVisitorData) {
      checkinMutation.mutate({
        ...pendingVisitorData,
        hsRulesAccepted: true,
      } as any);
      setPendingVisitorData(null);
    }
  };

  const handleHSDeclined = () => {
    setShowHSModal(false);
    setPendingVisitorData(null);
  };

  const canSubmit = formData.firstName.trim() && formData.lastName.trim() && formData.hostStaffId;

  return (
    <div className="h-screen bg-[var(--background)] overflow-hidden">
      <div className="flex flex-col h-full">
        <div className="px-4 py-2 flex-shrink-0">
          <div className="flex items-center gap-3">
            <Button
              onClick={onBack}
              variant="outline"
              size="default"
              className="flex items-center gap-2 bg-white/50 border-white/30 text-fixed hover:bg-white/70 px-4 py-2"
              data-testid="button-back"
            >
              <ArrowLeft size={18} />
              Back
            </Button>
            <div>
              <h2 className="text-xl font-bold text-fixed">Manual Check-In</h2>
              <p className="text-variable text-xs">Touch the fields below to enter visitor details</p>
            </div>
          </div>
        </div>

        <div className="flex-1 px-6 pb-2 overflow-y-auto">
          <div className="max-w-4xl mx-auto">
            <GlassCard className="p-6">
              <div className="space-y-4">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 gradient-blue rounded-full flex items-center justify-center">
                    <User className="text-white" size={20} />
                  </div>
                  <h3 className="text-xl font-semibold text-fixed">Visitor Information</h3>
                  {activeField && activeField !== "hostSearch" && (
                    <div className="ml-auto px-3 py-1 bg-blue-100 rounded-lg">
                      <span className="text-blue-800 font-medium text-sm">
                        Entering: {activeField.replace(/([A-Z])/g, ' $1').toLowerCase()}
                      </span>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <Label className="text-base font-semibold text-fixed flex items-center gap-2">
                      <span className="w-5 h-5 bg-red-500 text-white rounded-full text-xs flex items-center justify-center">1</span>
                      First Name *
                    </Label>
                    <div
                      onClick={() => setActiveField("firstName")}
                      className={`w-full px-6 py-5 rounded-xl border-2 cursor-pointer transition-all text-lg font-medium ${
                        activeField === "firstName" 
                          ? "border-blue-500 bg-blue-50 ring-2 ring-blue-200 shadow-lg" 
                          : formData.firstName 
                            ? "border-green-400 bg-green-50 shadow-md"
                            : "border-white/40 bg-white/60 hover:bg-white/80 hover:border-blue-300 shadow-md"
                      }`}
                      data-testid="input-first-name"
                    >
                      <span className={formData.firstName ? "text-slate-800" : "text-slate-400"}>
                        {formData.firstName || "Touch to enter first name"}
                      </span>
                    </div>
                  </div>
                  
                  <div className="space-y-1">
                    <Label className="text-base font-semibold text-fixed flex items-center gap-2">
                      <span className="w-5 h-5 bg-red-500 text-white rounded-full text-xs flex items-center justify-center">2</span>
                      Last Name *
                    </Label>
                    <div
                      onClick={() => setActiveField("lastName")}
                      className={`w-full px-6 py-5 rounded-xl border-2 cursor-pointer transition-all text-lg font-medium ${
                        activeField === "lastName" 
                          ? "border-blue-500 bg-blue-50 ring-2 ring-blue-200 shadow-lg" 
                          : formData.lastName
                            ? "border-green-400 bg-green-50 shadow-md"
                            : "border-white/40 bg-white/60 hover:bg-white/80 hover:border-blue-300 shadow-md"
                      }`}
                      data-testid="input-last-name"
                    >
                      <span className={formData.lastName ? "text-slate-800" : "text-slate-400"}>
                        {formData.lastName || "Touch to enter last name"}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <Label className="text-base font-semibold text-fixed flex items-center gap-2">
                      <span className="w-5 h-5 bg-gray-500 text-white rounded-full text-xs flex items-center justify-center">3</span>
                      Company <span className="text-xs text-variable font-normal">(Optional)</span>
                    </Label>
                    <div
                      onClick={() => setActiveField("company")}
                      className={`w-full px-6 py-5 rounded-xl border-2 cursor-pointer transition-all text-lg font-medium ${
                        activeField === "company" 
                          ? "border-blue-500 bg-blue-50 ring-2 ring-blue-200 shadow-lg" 
                          : formData.company
                            ? "border-green-400 bg-green-50 shadow-md"
                            : "border-white/40 bg-white/60 hover:bg-white/80 hover:border-blue-300 shadow-md"
                      }`}
                      data-testid="input-company"
                    >
                      <span className={formData.company ? "text-slate-800" : "text-slate-400"}>
                        {formData.company || "Touch to enter company"}
                      </span>
                    </div>
                  </div>
                  
                  <div className="space-y-1">
                    <Label className="text-base font-semibold text-fixed flex items-center gap-2">
                      <span className="w-5 h-5 bg-gray-500 text-white rounded-full text-xs flex items-center justify-center">4</span>
                      Purpose <span className="text-xs text-variable font-normal">(Optional)</span>
                    </Label>
                    <div
                      onClick={() => setActiveField("purpose")}
                      className={`w-full px-6 py-5 rounded-xl border-2 cursor-pointer transition-all text-lg font-medium ${
                        activeField === "purpose" 
                          ? "border-blue-500 bg-blue-50 ring-2 ring-blue-200 shadow-lg" 
                          : formData.purpose
                            ? "border-green-400 bg-green-50 shadow-md"
                            : "border-white/40 bg-white/60 hover:bg-white/80 hover:border-blue-300 shadow-md"
                      }`}
                      data-testid="input-purpose"
                    >
                      <span className={formData.purpose ? "text-slate-800" : "text-slate-400"}>
                        {formData.purpose || "Touch to enter purpose"}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-base font-semibold text-fixed flex items-center gap-2">
                    <span className="w-5 h-5 bg-red-500 text-white rounded-full text-xs flex items-center justify-center">5</span>
                    Who are you here to see? *
                  </Label>
                  
                  <div
                    onClick={() => setActiveField("hostSearch")}
                    className={`w-full px-6 py-4 rounded-xl border-2 cursor-pointer transition-all text-lg font-medium flex items-center gap-3 ${
                      activeField === "hostSearch"
                        ? "border-blue-500 bg-blue-50 ring-2 ring-blue-200 shadow-lg"
                        : selectedHost
                          ? "border-green-400 bg-green-50 shadow-md"
                          : "border-white/40 bg-white/60 hover:bg-white/80 hover:border-blue-300 shadow-md"
                    }`}
                    data-testid="input-host-search"
                  >
                    <Search size={20} className="text-slate-400 flex-shrink-0" />
                    <span className={selectedHost ? "text-slate-800" : "text-slate-400"}>
                      {selectedHost 
                        ? `${selectedHost.firstName} ${selectedHost.lastName}${selectedHost.department ? ` - ${selectedHost.department}` : ''}`
                        : "Touch to search by surname..."}
                    </span>
                    {selectedHost && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedHost(null);
                          setFormData(prev => ({ ...prev, hostStaffId: "" }));
                          setHostSearch("");
                        }}
                        className="ml-auto p-1 hover:bg-red-100 rounded-full"
                      >
                        <X size={18} className="text-red-500" />
                      </button>
                    )}
                  </div>

                </div>

                <div className="flex gap-4 pt-2">
                  <Button
                    onClick={onBack}
                    variant="outline"
                    className="flex-1 py-6 text-xl rounded-xl border-2 border-slate-300 text-slate-700 hover:bg-slate-50"
                    data-testid="button-cancel"
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleSubmit}
                    disabled={!canSubmit || checkinMutation.isPending}
                    className={`flex-1 py-6 text-xl rounded-xl font-bold transition-all ${
                      canSubmit 
                        ? "gradient-blue text-white shadow-lg hover:shadow-xl transform hover:scale-105" 
                        : "bg-gray-300 text-variable cursor-not-allowed"
                    }`}
                    data-testid="button-submit"
                  >
                    <Check className="mr-2" size={20} />
                    {checkinMutation.isPending ? "Checking In..." : "Complete Check-In"}
                  </Button>
                </div>
              </div>
            </GlassCard>
          </div>
        </div>

        <div className="flex-shrink-0 bg-white/95 backdrop-blur-sm border-t border-white/50">
          <div className="px-6 py-2">
            {activeField && activeField !== "hostSearch" ? (
              <div className="max-w-4xl mx-auto">
                <TouchKeyboard
                  value={formData[activeField]}
                  onChange={(value) => handleFieldChange(activeField, value)}
                  placeholder={`Enter ${activeField.replace(/([A-Z])/g, ' $1').toLowerCase()}`}
                  type="text"
                  fieldType={activeField === "firstName" || activeField === "lastName" ? "name" : "general"}
                  onNext={handleNextField}
                  nextLabel={getNextLabel()}
                  showNext={true}
                />
              </div>
            ) : activeField === "hostSearch" ? (
              <div className="max-w-4xl mx-auto">
                {hostSearch.trim().length >= 3 && filteredStaff.length > 0 && (
                  <div className="mb-2 bg-white rounded-xl border-2 border-blue-300 overflow-y-auto shadow-lg" style={{ maxHeight: `${Math.min(filteredStaff.slice(0, 10).length * 52 + 4, 260)}px` }}>
                    <div className="divide-y divide-gray-100">
                      {filteredStaff.slice(0, 10).map((member) => (
                        <button
                          key={member.id}
                          onClick={() => handleSelectHost(member)}
                          className="w-full px-5 py-3 flex items-center gap-3 hover:bg-blue-50 active:bg-blue-100 transition-colors text-left"
                        >
                          <div className="w-9 h-9 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
                            <UserCheck size={18} className="text-blue-600" />
                          </div>
                          <div className="flex-1">
                            <span className="text-lg font-semibold text-slate-800">
                              {member.firstName} {member.lastName}
                            </span>
                            {member.department && (
                              <span className="text-sm text-slate-500 ml-2">
                                {member.department}
                              </span>
                            )}
                          </div>
                          <span className="text-blue-600 font-medium text-sm">Select</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {hostSearch.trim().length >= 3 && filteredStaff.length === 0 && (
                  <div className="mb-2 bg-white rounded-xl border-2 border-orange-200 p-3 text-center text-slate-500 shadow">
                    No staff found matching "{hostSearch}"
                  </div>
                )}
                {hostSearch.trim().length > 0 && hostSearch.trim().length < 3 && (
                  <div className="mb-2 bg-blue-50 rounded-xl border border-blue-200 p-2 text-center text-blue-600 text-sm">
                    Type {3 - hostSearch.trim().length} more letter{3 - hostSearch.trim().length > 1 ? 's' : ''} to search...
                  </div>
                )}
                <TouchKeyboard
                  value={hostSearch}
                  onChange={(value) => setHostSearch(value)}
                  placeholder="Type surname to find staff..."
                  type="text"
                  fieldType="name"
                  onNext={() => setActiveField(null)}
                  nextLabel="Done"
                  showNext={true}
                />
              </div>
            ) : null}
          </div>
        </div>

        {showPassPreview && createdVisitor && (
          <PassPreviewModal
            isOpen={showPassPreview}
            onClose={() => {
              setShowPassPreview(false);
              setCreatedVisitor(null);
              onBack();
            }}
            visitor={createdVisitor}
            hostName={selectedHost ? `${selectedHost.firstName} ${selectedHost.lastName}` : undefined}
          />
        )}

        <HSAcceptanceModal
          isOpen={showHSModal}
          companyName={(settings as any)?.companyName}
          hsRulesContent={(settings as any)?.hsRulesContent || ""}
          onAccept={handleHSAccepted}
          onDecline={handleHSDeclined}
        />
      </div>
    </div>
  );
}
