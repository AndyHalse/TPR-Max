import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { apiRequest } from "@/lib/queryClient";
import TouchKeyboard from "@/components/TouchKeyboard";
import PassPreviewModal from "@/components/PassPreviewModal";
import HSAcceptanceModal from "@/components/HSAcceptanceModal";
import NDAAcceptanceModal from "@/components/NDAAcceptanceModal";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Check, Search, X, UserCheck, MapPin, CheckCircle2, ChevronRight, User } from "lucide-react";
import type { Staff, InsertVisitor, Visitor, CompanySettings } from "@shared/schema";
import { printPassViaIframe } from "@/lib/printUtils";
import VisitInstructionsModal from "@/components/VisitInstructionsModal";

type WizardStep = "firstName" | "lastName" | "company" | "email" | "reason" | "hostSearch" | "confirm";

interface WalkInVisitorFormProps {
  onBack: () => void;
}

export default function WalkInVisitorForm({ onBack }: WalkInVisitorFormProps) {
  const { toast } = useToast();

  const [formData, setFormData] = useState({ firstName: "", lastName: "", email: "", company: "", purpose: "", hostStaffId: "" });
  const [currentStep, setCurrentStep] = useState<WizardStep>("firstName");
  const [hostSearch, setHostSearch] = useState("");
  const [selectedHost, setSelectedHost] = useState<Staff | null>(null);
  const [createdVisitor, setCreatedVisitor] = useState<Visitor | null>(null);
  const [showPassPreview, setShowPassPreview] = useState(false);
  const [showHSModal, setShowHSModal] = useState(false);
  const [showNdaModal, setShowNdaModal] = useState(false);
  const [pendingVisitorData, setPendingVisitorData] = useState<InsertVisitor | null>(null);
  const [selectedReason, setSelectedReason] = useState<any | null>(null);
  const [showInstructionsModal, setShowInstructionsModal] = useState(false);

  const { data: allStaff } = useQuery<Staff[]>({ queryKey: ["/api/staff"] });
  const { data: companies = [] } = useQuery<string[]>({ queryKey: ["/api/companies"] });
  const { data: settings } = useQuery<CompanySettings>({ queryKey: ["/api/settings"] });
  const { data: allReasons = [] } = useQuery<any[]>({ queryKey: ["/api/visit-reasons"] });
  const visitorReasons = allReasons.filter((r: any) => r.appliesTo === "visitors" || r.appliesTo === "both");

  const wizardSteps: WizardStep[] = useMemo(() => {
    const base: WizardStep[] = ["firstName", "lastName", "company", "email"];
    if (visitorReasons.length > 0) base.push("reason");
    base.push("hostSearch");
    return base;
  }, [visitorReasons.length]);

  const stepIndex = wizardSteps.indexOf(currentStep);
  const stepNumber = stepIndex + 1;
  const totalSteps = wizardSteps.length;

  const filteredStaff = useMemo(() => {
    if (!allStaff || hostSearch.trim().length < 3) return [];
    const s = hostSearch.toLowerCase().trim();
    return allStaff.filter(m =>
      m.lastName?.toLowerCase().includes(s) ||
      m.firstName?.toLowerCase().includes(s) ||
      m.department?.toLowerCase().includes(s)
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
        const max = Math.max(r, g, b), min = Math.min(r, g, b);
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
      if (brandSettings.backgroundColor) { const hsl = hexToHsl(brandSettings.backgroundColor); if (hsl) { root.style.setProperty('--background', `hsl(${hsl})`); root.style.setProperty('--card', `hsl(${hsl})`); } }
      if (brandSettings.fixedTextColor) { const hsl = hexToHsl(brandSettings.fixedTextColor); if (hsl) root.style.setProperty('--fixed-text', `hsl(${hsl})`); }
      if (brandSettings.variableTextColor) { const hsl = hexToHsl(brandSettings.variableTextColor); if (hsl) root.style.setProperty('--variable-text', `hsl(${hsl})`); }
      if (brandSettings.accentColor) { const hsl = hexToHsl(brandSettings.accentColor); if (hsl) { root.style.setProperty('--primary', `hsl(${hsl})`); root.style.setProperty('--accent', `hsl(${hsl})`); root.style.setProperty('--ring', `hsl(${hsl})`); } }
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
        toast({ title: "Digital Pass Sent", description: `A digital e-pass has been sent to ${visitor.firstName} ${visitor.lastName}. Visitor checked in successfully!` });
        setTimeout(() => onBack(), 2000);
      } else {
        setCreatedVisitor(visitor);
        setShowPassPreview(true);
        printPassViaIframe(`/api/passes/print/visitor/${visitor.id}`);
        toast({ title: "Success", description: "Visitor checked in! Pass is printing..." });
      }
    },
    onError: (error: any) => {
      toast({ title: "Check-in failed", description: error?.message || "Failed to check in visitor. Please try again.", variant: "destructive" });
    },
  });

  const goBack = () => {
    if (currentStep === "confirm") { setCurrentStep("hostSearch"); return; }
    const idx = wizardSteps.indexOf(currentStep);
    if (idx <= 0) { onBack(); } else { setCurrentStep(wizardSteps[idx - 1]); }
  };

  const goNext = () => {
    const idx = wizardSteps.indexOf(currentStep);
    if (idx >= 0 && idx < wizardSteps.length - 1) {
      setCurrentStep(wizardSteps[idx + 1]);
    }
  };

  const handleStepNext = () => {
    if (currentStep === "firstName" && !formData.firstName.trim()) {
      toast({ title: "Required", description: "Please enter your first name", variant: "destructive" }); return;
    }
    if (currentStep === "lastName" && !formData.lastName.trim()) {
      toast({ title: "Required", description: "Please enter your last name", variant: "destructive" }); return;
    }
    goNext();
  };

  const handleReasonSelect = (reason: any) => {
    setSelectedReason(reason);
    setFormData(prev => ({ ...prev, purpose: reason.label }));
    if (reason.instructions?.trim()) {
      setShowInstructionsModal(true);
    } else {
      setCurrentStep("hostSearch");
    }
  };

  const handleSelectHost = (member: Staff) => {
    setFormData(prev => ({ ...prev, hostStaffId: member.id }));
    setSelectedHost(member);
    setHostSearch("");
    setCurrentStep("confirm");
  };

  const checkAndSubmitWithNda = (data: any) => {
    const settingsAny = settings as any;
    const ndaEnabled = !!settingsAny?.ndaEnabled;
    const ndaAppliesTo = settingsAny?.ndaAppliesTo || "visitors";
    const ndaAppliesToVisitors = ndaAppliesTo === "visitors" || ndaAppliesTo === "both";
    const ndaRequireSig = !!settingsAny?.ndaRequireSignature;
    const ndaHasContent = !!(settingsAny?.ndaContent?.trim());
    if (ndaEnabled && ndaAppliesToVisitors && ndaRequireSig && ndaHasContent) {
      setPendingVisitorData(data);
      setShowNdaModal(true);
      return;
    }
    checkinMutation.mutate(data);
  };

  const handleSubmit = () => {
    if (!formData.firstName.trim()) { toast({ title: "Error", description: "First name is required", variant: "destructive" }); setCurrentStep("firstName"); return; }
    if (!formData.lastName.trim()) { toast({ title: "Error", description: "Last name is required", variant: "destructive" }); setCurrentStep("lastName"); return; }
    if (!formData.hostStaffId) { toast({ title: "Error", description: "Please select a host", variant: "destructive" }); setCurrentStep("hostSearch"); return; }

    const visitorData: any = {
      firstName: formData.firstName.trim(),
      lastName: formData.lastName.trim(),
      email: formData.email.trim() || null,
      company: formData.company || null,
      purpose: formData.purpose || null,
      hostStaffId: formData.hostStaffId,
      carRegistration: null,
    };

    const settingsAny = settings as any;
    const reasonHsRequired = selectedReason?.requireHsAcceptance;
    const companyHsRequired = !reasonHsRequired && settingsAny?.hsRulesEnabled !== false && settingsAny?.hsRulesRequireAcceptance && settingsAny?.hsRulesContent;
    if (reasonHsRequired || companyHsRequired) {
      setPendingVisitorData(visitorData);
      setShowHSModal(true);
      return;
    }
    checkAndSubmitWithNda(visitorData);
  };

  const handleHSAccepted = () => {
    setShowHSModal(false);
    if (pendingVisitorData) {
      const dataWithHs = { ...pendingVisitorData, hsRulesAccepted: true };
      setPendingVisitorData(null);
      checkAndSubmitWithNda(dataWithHs);
    }
  };

  const handleHSDeclined = () => { setShowHSModal(false); setPendingVisitorData(null); };

  const handleNDAAccepted = () => {
    setShowNdaModal(false);
    if (pendingVisitorData) { checkinMutation.mutate({ ...pendingVisitorData, ndaAccepted: true } as any); setPendingVisitorData(null); }
  };

  const handleNDADeclined = () => { setShowNdaModal(false); setPendingVisitorData(null); };

  const showKeyboard = ["firstName", "lastName", "company", "email", "hostSearch"].includes(currentStep);

  const getKeyboardValue = () => {
    if (currentStep === "hostSearch") return hostSearch;
    if (currentStep === "firstName" || currentStep === "lastName" || currentStep === "company" || currentStep === "email") return formData[currentStep];
    return "";
  };

  const handleKeyboardChange = (value: string) => {
    if (currentStep === "hostSearch") { setHostSearch(value); return; }
    if (currentStep === "firstName" || currentStep === "lastName" || currentStep === "company" || currentStep === "email") {
      setFormData(prev => ({ ...prev, [currentStep]: value }));
    }
  };

  const getKeyboardNextLabel = () => {
    if (currentStep === "hostSearch") return "Done";
    if (currentStep === "company" || currentStep === "email") return formData[currentStep] ? "Next →" : "Skip →";
    return "Next →";
  };

  const getStepQuestion = () => {
    switch (currentStep) {
      case "firstName": return "What's your first name?";
      case "lastName": return "And your last name?";
      case "company": return "Which company are you from?";
      case "email": return "Your email address?";
      case "reason": return "What is the reason for your visit?";
      case "hostSearch": return "Who are you here to see?";
      default: return "";
    }
  };

  const getDisplayValue = () => {
    if (currentStep === "hostSearch") {
      if (selectedHost) return `${selectedHost.firstName} ${selectedHost.lastName}${selectedHost.department ? ` — ${selectedHost.department}` : ""}`;
      if (hostSearch) return hostSearch;
      return "";
    }
    if (currentStep === "firstName") return formData.firstName;
    if (currentStep === "lastName") return formData.lastName;
    if (currentStep === "company") return formData.company;
    if (currentStep === "email") return formData.email;
    return "";
  };

  const companySuggestions = useMemo(() => {
    if (currentStep !== "company" || companies.length === 0) return [];
    const typed = formData.company.trim().toLowerCase();
    return companies
      .filter(c => typed.length === 0 || c.toLowerCase().includes(typed))
      .sort((a, b) => {
        if (!typed) return a.localeCompare(b);
        const aStarts = a.toLowerCase().startsWith(typed), bStarts = b.toLowerCase().startsWith(typed);
        if (aStarts && !bStarts) return -1; if (bStarts && !aStarts) return 1;
        return a.localeCompare(b);
      })
      .slice(0, 8);
  }, [currentStep, companies, formData.company]);

  const isTextStep = currentStep === "firstName" || currentStep === "lastName" || currentStep === "company" || currentStep === "email";

  return (
    <div className="h-screen bg-[var(--background)] overflow-hidden flex flex-col">

      {/* ── Header ── */}
      <div className="flex-shrink-0 flex items-center gap-4 px-4 h-14 border-b border-black/10 bg-[var(--background)]">
        <button
          onClick={goBack}
          className="flex items-center gap-2 text-fixed font-semibold text-lg hover:opacity-70 active:scale-95 transition-all min-w-[64px] min-h-[44px]"
          data-testid="button-back"
        >
          <ArrowLeft size={22} />
          Back
        </button>
        <div className="flex-1 text-center">
          {currentStep === "confirm" ? (
            <span className="text-variable font-semibold text-base">Summary</span>
          ) : stepIndex >= 0 ? (
            <span className="text-variable font-semibold text-base">Step {stepNumber} of {totalSteps}</span>
          ) : null}
        </div>
        <div className="min-w-[64px]" />
      </div>

      {/* ── TEXT ENTRY: question + value box ── */}
      {isTextStep && (
        <div className="flex-shrink-0 px-6 pt-4 pb-2 flex flex-col gap-3">
          <div>
            <h2 className="text-3xl font-bold text-fixed leading-tight">{getStepQuestion()}</h2>
            {currentStep === "company" && <p className="text-variable text-sm mt-0.5">Optional — tap Skip if not applicable</p>}
            {currentStep === "email"   && <p className="text-variable text-sm mt-0.5">Optional — needed to send a digital e-pass</p>}
          </div>
          <div className={`min-h-[68px] px-5 flex items-center rounded-2xl border-2 transition-all ${
            getDisplayValue() ? "border-green-400 bg-green-50" : "border-blue-400 bg-white/80 ring-2 ring-blue-100"
          }`}>
            <span className={`text-2xl font-medium ${getDisplayValue() ? "text-slate-800" : "text-slate-400"}`}>
              {getDisplayValue() || "Tap a key below…"}
            </span>
            {getDisplayValue() && <CheckCircle2 size={26} className="ml-auto text-green-500 flex-shrink-0" />}
          </div>
        </div>
      )}

      {/* ── COMPANY CHIPS ── shown after 3 letters typed, directly above keyboard */}
      {currentStep === "company" && formData.company.trim().length >= 3 && companySuggestions.length > 0 && (
        <div className="flex-shrink-0 px-6 pb-2">
          <p className="text-xs font-semibold text-variable uppercase tracking-wide mb-1.5">Known companies</p>
          <div className="flex flex-wrap gap-2">
            {companySuggestions.map(c => (
              <button
                key={c}
                onClick={() => { setFormData(prev => ({ ...prev, company: c })); goNext(); }}
                className={`px-4 py-2 rounded-full border-2 text-sm font-semibold min-h-[44px] transition-all active:scale-95 ${
                  formData.company === c
                    ? "border-green-500 bg-green-100 text-green-800"
                    : "border-blue-300 bg-blue-50 text-blue-800 hover:bg-blue-100"
                }`}
              >
                {c}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── HOST SEARCH: question + value box ── */}
      {currentStep === "hostSearch" && (
        <div className="flex-shrink-0 px-6 pt-4 pb-2 flex flex-col gap-3">
          <div>
            <h2 className="text-3xl font-bold text-fixed leading-tight">{getStepQuestion()}</h2>
            <p className="text-variable text-sm mt-0.5">Type at least 3 letters of their surname to search</p>
          </div>
          {selectedHost ? (
            <div className="flex items-center gap-4 min-h-[68px] px-5 rounded-2xl border-2 border-green-400 bg-green-50">
              <div className="w-11 h-11 bg-green-200 rounded-full flex items-center justify-center flex-shrink-0">
                <UserCheck size={22} className="text-green-700" />
              </div>
              <div className="flex-1">
                <p className="text-2xl font-bold text-slate-800">{selectedHost.firstName} {selectedHost.lastName}</p>
                {selectedHost.department && <p className="text-variable text-sm">{selectedHost.department}</p>}
              </div>
              <button onClick={() => { setSelectedHost(null); setFormData(prev => ({ ...prev, hostStaffId: "" })); setHostSearch(""); }} className="p-2 hover:bg-red-100 rounded-full">
                <X size={20} className="text-red-500" />
              </button>
            </div>
          ) : (
            <div className={`min-h-[68px] px-5 flex items-center gap-3 rounded-2xl border-2 transition-all ${
              hostSearch ? "border-blue-400 bg-white/80 ring-2 ring-blue-100" : "border-white/40 bg-white/60"
            }`}>
              <Search size={22} className="text-slate-400 flex-shrink-0" />
              <span className={`text-2xl font-medium ${hostSearch ? "text-slate-800" : "text-slate-400"}`}>
                {hostSearch || "Type a surname below…"}
              </span>
            </div>
          )}
        </div>
      )}

      {/* ── HOST SEARCH RESULTS ── directly above keyboard, never clipped */}
      {currentStep === "hostSearch" && !selectedHost && (
        <div className="flex-shrink-0 px-6 pb-2">
          {hostSearch.trim().length >= 3 && filteredStaff.length > 0 && (
            <div className="bg-white rounded-2xl border-2 border-blue-300 overflow-hidden shadow-lg">
              {filteredStaff.slice(0, 4).map((member) => (
                <button
                  key={member.id}
                  onClick={() => handleSelectHost(member)}
                  className="w-full px-5 flex items-center gap-3 hover:bg-blue-50 active:bg-blue-100 transition-colors text-left border-b border-gray-100 last:border-b-0 min-h-[58px]"
                >
                  <div className="w-9 h-9 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
                    <UserCheck size={18} className="text-blue-600" />
                  </div>
                  <div className="flex-1">
                    <span className="text-lg font-semibold text-slate-800">{member.firstName} {member.lastName}</span>
                    {member.department && <span className="text-sm text-slate-500 ml-2">{member.department}</span>}
                  </div>
                  <span className="text-blue-600 font-semibold text-sm">Select</span>
                </button>
              ))}
            </div>
          )}
          {hostSearch.trim().length >= 3 && filteredStaff.length === 0 && (
            <div className="bg-white rounded-2xl border-2 border-orange-200 p-3 text-center text-slate-500 text-sm shadow">
              No staff found matching "{hostSearch}"
            </div>
          )}
          {hostSearch.trim().length > 0 && hostSearch.trim().length < 3 && (
            <div className="bg-blue-50 rounded-xl border border-blue-200 p-2.5 text-center text-blue-600 text-sm">
              Type {3 - hostSearch.trim().length} more letter{3 - hostSearch.trim().length > 1 ? "s" : ""} to search…
            </div>
          )}
        </div>
      )}

      {/* ── REASON STEP ── */}
      {currentStep === "reason" && (
        <div className="flex-1 flex flex-col min-h-0">
          <div className="flex-shrink-0 px-6 pt-5 pb-3">
            <h2 className="text-3xl font-bold text-fixed leading-tight">{getStepQuestion()}</h2>
            <p className="text-variable text-sm mt-0.5">Select the option that best describes your visit</p>
          </div>
          <div className="flex-1 overflow-y-auto px-6 pb-4">
            <div className="grid grid-cols-2 gap-4 max-w-2xl mx-auto">
              {visitorReasons.map((reason: any) => (
                <button
                  key={reason.id}
                  onClick={() => handleReasonSelect(reason)}
                  className="flex flex-col items-center justify-center gap-4 p-8 bg-white rounded-2xl border-2 border-white/80 hover:border-variable hover:bg-white active:scale-95 transition-all shadow-md text-center"
                  style={{ minHeight: "140px" }}
                >
                  <div className="w-14 h-14 bg-variable/10 rounded-full flex items-center justify-center">
                    <MapPin size={36} className="text-variable" />
                  </div>
                  <span className="font-bold text-slate-800 text-xl leading-tight">{reason.label}</span>
                  {reason.requireHsAcceptance && (
                    <span className="text-xs text-amber-600 font-medium bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                      H&amp;S acceptance required
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
          <div className="flex-shrink-0 border-t border-black/10 px-6 py-4">
            <button
              onClick={() => setCurrentStep("hostSearch")}
              className="w-full min-h-[52px] text-variable hover:text-fixed text-base font-medium transition-colors"
            >
              Skip — continue without selecting a reason
            </button>
          </div>
        </div>
      )}

      {/* ── Spacer — pushes keyboard to bottom on short-content steps ── */}
      {(isTextStep || currentStep === "hostSearch") && <div className="flex-1" />}

        {/* CONFIRMATION STEP */}
        {currentStep === "confirm" && (
          <div className="flex flex-col flex-1 px-6 pt-8 pb-6 gap-6">
            <h2 className="text-3xl font-bold text-fixed leading-tight">Ready to check in?</h2>
            <p className="text-variable text-base -mt-2">Please confirm your details below</p>

            <div className="bg-white rounded-2xl border-2 border-white/80 shadow-lg overflow-hidden">
              <div className="px-6 py-5 border-b border-gray-100 flex items-center gap-4">
                <div className="w-14 h-14 gradient-blue rounded-full flex items-center justify-center flex-shrink-0">
                  <User size={28} className="text-white" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-slate-900">{formData.firstName} {formData.lastName}</p>
                  {formData.company && <p className="text-variable text-base">{formData.company}</p>}
                </div>
              </div>
              {formData.email && (
                <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-3">
                  <span className="text-variable text-base w-28 flex-shrink-0">Email</span>
                  <span className="text-slate-800 font-medium text-base">{formData.email}</span>
                </div>
              )}
              {(selectedReason || formData.purpose) && (
                <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-3">
                  <span className="text-variable text-base w-28 flex-shrink-0">Reason</span>
                  <span className="text-slate-800 font-medium text-base">{selectedReason?.label || formData.purpose}</span>
                </div>
              )}
              {selectedHost && (
                <div className="px-6 py-4 flex items-center gap-3">
                  <span className="text-variable text-base w-28 flex-shrink-0">Host</span>
                  <span className="text-slate-800 font-bold text-base">{selectedHost.firstName} {selectedHost.lastName}{selectedHost.department ? ` — ${selectedHost.department}` : ""}</span>
                </div>
              )}
            </div>

            <Button
              onClick={handleSubmit}
              disabled={checkinMutation.isPending}
              className="w-full h-20 text-2xl font-bold rounded-2xl bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white shadow-xl transition-all active:scale-[0.98]"
              data-testid="button-submit"
            >
              <Check size={28} className="mr-3" />
              {checkinMutation.isPending ? "Checking In…" : "Check In"}
            </Button>

            <button
              onClick={() => setCurrentStep("firstName")}
              className="text-variable hover:text-fixed text-base font-medium text-center transition-colors min-h-[44px]"
            >
              ← Change something
            </button>
          </div>
        )}

      {/* ── Keyboard (pinned to bottom) ── */}
      {showKeyboard && (
        <div className="flex-shrink-0 bg-white/95 backdrop-blur-sm border-t border-white/50">
          <div className="px-4 py-2 max-w-4xl mx-auto">
            <TouchKeyboard
              value={getKeyboardValue()}
              onChange={handleKeyboardChange}
              placeholder={currentStep === "hostSearch" ? "Type surname to find staff…" : `Enter ${currentStep.replace(/([A-Z])/g, " $1").toLowerCase()}`}
              type={currentStep === "email" ? "email" : "text"}
              fieldType={currentStep === "firstName" || currentStep === "lastName" || currentStep === "hostSearch" ? "name" : "general"}
              onNext={currentStep === "hostSearch" ? () => {} : handleStepNext}
              nextLabel={getKeyboardNextLabel()}
              showNext={currentStep !== "hostSearch"}
            />
          </div>
        </div>
      )}

      {/* ── Modals ── */}
      {showPassPreview && createdVisitor && (
        <PassPreviewModal
          isOpen={showPassPreview}
          onClose={() => { setShowPassPreview(false); setCreatedVisitor(null); onBack(); }}
          visitor={createdVisitor}
          hostName={selectedHost ? `${selectedHost.firstName} ${selectedHost.lastName}` : undefined}
        />
      )}

      <HSAcceptanceModal
        isOpen={showHSModal}
        companyName={(settings as any)?.companyName}
        hsRulesContent={
          selectedReason?.requireHsAcceptance && selectedReason?.hsContent
            ? selectedReason.hsContent
            : (settings as any)?.hsRulesContent || ""
        }
        onAccept={handleHSAccepted}
        onDecline={handleHSDeclined}
      />

      <NDAAcceptanceModal
        isOpen={showNdaModal}
        companyName={(settings as any)?.companyName}
        ndaContent={(settings as any)?.ndaContent || ""}
        onAccept={handleNDAAccepted}
        onDecline={handleNDADeclined}
      />

      <VisitInstructionsModal
        isOpen={showInstructionsModal}
        reasonLabel={selectedReason?.label || ""}
        instructions={selectedReason?.instructions || ""}
        onContinue={() => { setShowInstructionsModal(false); setCurrentStep("hostSearch"); }}
      />
    </div>
  );
}
