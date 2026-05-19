import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import GlassCard from "@/components/GlassCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft, ArrowRight, CheckCircle2, Building2, User, Shield,
  Lock, AlertTriangle, FileText, ClipboardCheck, HardHat, MapPin
} from "lucide-react";
import VisitInstructionsModal from "@/components/VisitInstructionsModal";

interface WalkInContractorFormProps {
  onBack: () => void;
}

// ─── UK document framework ──────────────────────────────────────────────────
const COMPANY_DOCS = [
  {
    key: "publicLiability",
    label: "Public Liability Insurance",
    legal: "Common law duty of care",
    category: "legal",
    requiresExpiry: true,
  },
  {
    key: "employersLiability",
    label: "Employers' Liability Insurance",
    legal: "Employers' Liability Act 1969 — min £5m",
    category: "legal",
    requiresExpiry: true,
  },
  {
    key: "cisRegistration",
    label: "CIS Registration",
    legal: "Finance Act 2004 — construction only",
    category: "legal",
    optional: true,
    requiresExpiry: false,
  },
  {
    key: "healthSafety",
    label: "Health & Safety Policy",
    legal: "Health & Safety at Work Act 1974",
    category: "site",
    requiresExpiry: true,
  },
  {
    key: "rams",
    label: "RAMS (Risk Assessment & Method Statement)",
    legal: "MHSWR 1999",
    category: "site",
    requiresExpiry: false,
  },
  {
    key: "modernSlavery",
    label: "Modern Slavery Statement",
    legal: "Modern Slavery Act 2015",
    category: "practice",
    requiresExpiry: false,
  },
  {
    key: "environmentalPolicy",
    label: "Environmental Policy",
    legal: "Client requirement / ISO 14001",
    category: "practice",
    requiresExpiry: false,
  },
  {
    key: "professionalIndemnity",
    label: "Professional Indemnity Insurance",
    legal: "Client / design requirement",
    category: "practice",
    requiresExpiry: true,
  },
];

const CATEGORY_META = {
  legal: {
    label: "Legally Required",
    icon: Lock,
    color: "text-red-600",
    bg: "bg-red-50 border-red-200",
    badge: "bg-red-100 text-red-700",
  },
  site: {
    label: "Site Required",
    icon: AlertTriangle,
    color: "text-amber-600",
    bg: "bg-amber-50 border-amber-200",
    badge: "bg-amber-100 text-amber-700",
  },
  practice: {
    label: "Good Practice",
    icon: CheckCircle2,
    color: "text-green-600",
    bg: "bg-green-50 border-green-200",
    badge: "bg-green-100 text-green-700",
  },
};

type DocState = {
  file: File | null;
  expiry: string;
};

const emptyDoc = (): DocState => ({ file: null, expiry: "" });

export default function WalkInContractorForm({ onBack }: WalkInContractorFormProps) {
  const { toast } = useToast();
  const { data: zones = [] } = useQuery<any[]>({ queryKey: ["/api/zones"] });

  const [step, setStep] = useState(1);

  // Visit reasons for contractors
  const { data: allReasons = [] } = useQuery<any[]>({ queryKey: ["/api/visit-reasons"] });
  const contractorReasons = allReasons.filter((r: any) => r.appliesTo === "contractors" || r.appliesTo === "both");
  const [selectedReason, setSelectedReason] = useState<any | null>(null);
  const [reasonPickerDone, setReasonPickerDone] = useState(false);
  const [showReasonInstructions, setShowReasonInstructions] = useState(false);

  // ── Step 1 state — Company ─────────────────────────────────────────────────
  const [company, setCompany] = useState({
    companyName: "",
    contactFirstName: "",
    contactLastName: "",
    email: "",
    phone: "",
    address: "",
    postcode: "",
    industry: "",
  });

  // ── Step 2 state — Worker ─────────────────────────────────────────────────
  const [worker, setWorker] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    postcode: "",
    transportMethod: "car_diesel",
    rightToWork: "pending",
    rightToWorkExpiry: "",
    cscsCard: "",
    cscsStatus: "pending",
    cscsExpiry: "",
    ipafStatus: "none",
    asbestosAwareness: false,
    manualHandling: false,
    workingAtHeight: false,
    zoneId: "",
    purpose: "",
  });

  // ── Step 3 state — Documents ───────────────────────────────────────────────
  const [docs, setDocs] = useState<Record<string, DocState>>(
    Object.fromEntries(COMPANY_DOCS.map(d => [d.key, emptyDoc()]))
  );

  const setCompanyField = (field: string, value: string) =>
    setCompany(prev => ({ ...prev, [field]: value }));

  const setWorkerField = (field: string, value: string | boolean) =>
    setWorker(prev => ({ ...prev, [field]: value }));

  const setDocFile = (key: string, file: File | null) =>
    setDocs(prev => ({ ...prev, [key]: { ...prev[key], file } }));

  const setDocExpiry = (key: string, expiry: string) =>
    setDocs(prev => ({ ...prev, [key]: { ...prev[key], expiry } }));

  // ── Validation ─────────────────────────────────────────────────────────────
  const step1Valid =
    company.companyName.trim() &&
    company.contactFirstName.trim() &&
    company.contactLastName.trim();

  const step2Valid =
    worker.firstName.trim() &&
    worker.lastName.trim() &&
    worker.postcode.trim();

  // ── Compliance summary (derived) ───────────────────────────────────────────
  const legalDocs = COMPANY_DOCS.filter(d => d.category === "legal" && !d.optional);
  const legalUploaded = legalDocs.filter(d => docs[d.key]?.file).length;

  // ── Submit ─────────────────────────────────────────────────────────────────
  const registerMutation = useMutation({
    mutationFn: async () => {
      // 1. Create contractor company
      const contractorRes = await apiRequest("POST", "/api/contractors", {
        name: company.companyName,
        email: company.email,
        phone: company.phone,
        address: company.address,
        postcode: company.postcode,
        contactFirstName: company.contactFirstName,
        contactLastName: company.contactLastName,
        industry: company.industry,
        status: "pending",
      });
      const contractor = await contractorRes.json();
      if (!contractor.id) throw new Error("Failed to create company");

      // 2. Add worker
      const workerRes = await apiRequest("POST", `/api/contractors/${contractor.id}/workers`, {
        firstName: worker.firstName,
        lastName: worker.lastName,
        email: worker.email,
        phoneNumber: worker.phone,
        postcode: worker.postcode,
        transportMethod: worker.transportMethod,
        rightToWork: worker.rightToWork,
        rightToWorkExpiryDate: worker.rightToWorkExpiry || null,
        cscsCard: worker.cscsCard,
        cscsStatus: worker.cscsStatus,
        ipafStatus: worker.ipafStatus,
        asbestosAwareness: worker.asbestosAwareness,
        manualHandling: worker.manualHandling,
        workingAtHeight: worker.workingAtHeight,
        inductionCompleted: false,
        isActive: true,
        zoneId: worker.zoneId || null,
      });
      const workerData = await workerRes.json();

      // 3. Upload documents to object storage
      for (const docDef of COMPANY_DOCS) {
        const docState = docs[docDef.key];
        if (!docState.file) continue;

        try {
          // Get signed upload URL
          const urlRes = await apiRequest(
            "GET",
            `/api/contractors/${contractor.id}/documents/upload-url?documentType=${docDef.key}&fileName=${encodeURIComponent(docState.file.name)}`
          );
          const { uploadUrl, fileUrl } = await urlRes.json();

          // PUT file to signed URL
          await fetch(uploadUrl, {
            method: "PUT",
            body: docState.file,
            headers: { "Content-Type": docState.file.type || "application/octet-stream" },
          });

          // Save metadata
          await apiRequest("POST", `/api/contractors/${contractor.id}/documents`, {
            documentType: docDef.key,
            documentName: docDef.label,
            fileUrl,
            expiryDate: docState.expiry || null,
            status: "pending",
          });
        } catch {
          // Non-fatal: document uploads failing shouldn't block registration
          console.warn(`Failed to upload ${docDef.key}`);
        }
      }

      return { contractor, worker: workerData };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/contractors"] });
      queryClient.invalidateQueries({ queryKey: ["/api/contractors/checked-in"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      toast({
        title: "Registration Complete",
        description: `${company.companyName} registered. Pending safety team approval before site access is granted.`,
        duration: 6000,
      });
      onBack();
    },
    onError: () => {
      toast({
        title: "Registration Failed",
        description: "Could not complete registration. Please see reception.",
        variant: "destructive",
      });
    },
  });

  // ── Reason picker pre-step — shown before step 1 when contractor reasons exist
  if (!reasonPickerDone && contractorReasons.length > 0) {
    return (
      <div className="min-h-screen bg-background p-4 md:p-6">
        <div className="max-w-2xl mx-auto space-y-6">
          <GlassCard className="text-center">
            <div className="flex items-center justify-center gap-3 mb-2">
              <MapPin className="h-8 w-8 text-blue-600" />
              <h1 className="text-2xl sm:text-3xl font-bold text-fixed">Walk-in Contractor Registration</h1>
            </div>
            <p className="text-variable text-sm">First, tell us the reason for your visit today</p>
          </GlassCard>

          <GlassCard>
            <div className="flex items-center gap-2 mb-5">
              <MapPin className="h-5 w-5 text-blue-600" />
              <h2 className="text-lg font-semibold text-fixed">What is the reason for your visit?</h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {contractorReasons.map((reason: any) => (
                <button
                  key={reason.id}
                  onClick={() => {
                    setSelectedReason(reason);
                    if (reason.instructions?.trim()) {
                      setShowReasonInstructions(true);
                    } else {
                      setReasonPickerDone(true);
                    }
                  }}
                  className="flex items-start gap-3 p-4 bg-white dark:bg-slate-800 rounded-xl border-2 border-slate-200 hover:border-blue-400 hover:bg-blue-50 dark:hover:bg-slate-700 transition-all text-left"
                >
                  <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
                    <MapPin size={20} className="text-blue-600" />
                  </div>
                  <div>
                    <span className="font-semibold text-slate-800 dark:text-slate-100">{reason.label}</span>
                    {reason.requireHsAcceptance && (
                      <span className="block text-xs text-amber-600 mt-0.5">H&amp;S acceptance required at check-in</span>
                    )}
                    {reason.instructions?.trim() && (
                      <span className="block text-xs text-blue-500 mt-0.5">Includes site instructions</span>
                    )}
                  </div>
                </button>
              ))}
            </div>
            <button
              onClick={() => setReasonPickerDone(true)}
              className="mt-4 w-full py-3 text-slate-400 hover:text-slate-600 text-sm transition-colors"
            >
              Skip — continue without selecting a reason
            </button>
          </GlassCard>

          <Button variant="outline" onClick={onBack} className="w-full h-12">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Cancel
          </Button>
        </div>

        <VisitInstructionsModal
          isOpen={showReasonInstructions}
          reasonLabel={selectedReason?.label || ""}
          instructions={selectedReason?.instructions || ""}
          onContinue={() => {
            setShowReasonInstructions(false);
            setReasonPickerDone(true);
          }}
        />
      </div>
    );
  }

  // ── Step progress indicator ─────────────────────────────────────────────────
  const steps = [
    { num: 1, label: "Company Details" },
    { num: 2, label: "Worker & Compliance" },
    { num: 3, label: "Documents & Submit" },
  ];

  const StepIndicator = () => (
    <div className="flex items-center justify-center gap-0 mb-6">
      {steps.map((s, i) => (
        <div key={s.num} className="flex items-center">
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
            step === s.num
              ? "bg-blue-600 text-white"
              : step > s.num
              ? "bg-green-100 text-green-700"
              : "bg-gray-100 text-gray-400"
          }`}>
            {step > s.num ? <CheckCircle2 className="w-4 h-4" /> : <span>{s.num}</span>}
            <span className="hidden sm:inline">{s.label}</span>
          </div>
          {i < steps.length - 1 && (
            <div className={`w-8 h-0.5 ${step > s.num ? "bg-green-400" : "bg-gray-200"}`} />
          )}
        </div>
      ))}
    </div>
  );

  // ── STEP 1 — Company Details ────────────────────────────────────────────────
  if (step === 1) {
    return (
      <div className="min-h-screen bg-background p-4 md:p-6">
        <div className="max-w-2xl mx-auto space-y-6">
          <GlassCard className="text-center">
            <div className="flex items-center justify-center gap-3 mb-2">
              <Building2 className="h-8 w-8 text-blue-600" />
              <h1 className="text-2xl sm:text-3xl font-bold text-fixed">Walk-in Contractor Registration</h1>
            </div>
            <p className="text-variable text-sm">Register your company and worker for onsite access</p>
          </GlassCard>

          <StepIndicator />

          <GlassCard>
            <div className="flex items-center gap-2 mb-5">
              <Building2 className="h-5 w-5 text-blue-600" />
              <h2 className="text-lg font-semibold text-fixed">Step 1 — Company Details</h2>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <Label>Company Name *</Label>
                <Input
                  value={company.companyName}
                  onChange={e => setCompanyField("companyName", e.target.value)}
                  placeholder="e.g. Smith Electrical Ltd"
                />
              </div>

              <div>
                <Label>Contact First Name *</Label>
                <Input
                  value={company.contactFirstName}
                  onChange={e => setCompanyField("contactFirstName", e.target.value)}
                  placeholder="First name"
                />
              </div>

              <div>
                <Label>Contact Last Name *</Label>
                <Input
                  value={company.contactLastName}
                  onChange={e => setCompanyField("contactLastName", e.target.value)}
                  placeholder="Last name"
                />
              </div>

              <div>
                <Label>Email</Label>
                <Input
                  type="email"
                  value={company.email}
                  onChange={e => setCompanyField("email", e.target.value)}
                  placeholder="company@email.com"
                />
              </div>

              <div>
                <Label>Phone</Label>
                <Input
                  type="tel"
                  value={company.phone}
                  onChange={e => setCompanyField("phone", e.target.value)}
                  placeholder="e.g. 07700 900000"
                />
              </div>

              <div>
                <Label>Industry</Label>
                <Select value={company.industry} onValueChange={v => setCompanyField("industry", v)}>
                  <SelectTrigger><SelectValue placeholder="Select industry" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Construction">Construction</SelectItem>
                    <SelectItem value="Engineering">Engineering</SelectItem>
                    <SelectItem value="Facilities">Facilities Management</SelectItem>
                    <SelectItem value="IT">IT / Technology</SelectItem>
                    <SelectItem value="Cleaning">Cleaning</SelectItem>
                    <SelectItem value="Security">Security</SelectItem>
                    <SelectItem value="Other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Postcode</Label>
                <Input
                  value={company.postcode}
                  onChange={e => setCompanyField("postcode", e.target.value.toUpperCase().replace(/\s/g, ""))}
                  placeholder="e.g. SW1A1AA"
                  maxLength={8}
                  style={{ textTransform: "uppercase" }}
                />
              </div>

              <div className="sm:col-span-2">
                <Label>Company Address</Label>
                <Input
                  value={company.address}
                  onChange={e => setCompanyField("address", e.target.value)}
                  placeholder="Full company address"
                />
              </div>
            </div>
          </GlassCard>

          <div className="flex gap-3">
            <Button variant="outline" onClick={onBack} className="flex-1 h-12">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Button>
            <Button
              onClick={() => setStep(2)}
              disabled={!step1Valid}
              className="flex-1 h-12 bg-blue-600 hover:bg-blue-700"
            >
              Next: Worker Details
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // ── STEP 2 — Worker & Compliance ───────────────────────────────────────────
  if (step === 2) {
    const activeZones = (zones as any[]).filter(z => z.isActive);

    return (
      <div className="min-h-screen bg-background p-4 md:p-6">
        <div className="max-w-2xl mx-auto space-y-6">
          <GlassCard className="text-center">
            <div className="flex items-center justify-center gap-3 mb-2">
              <User className="h-8 w-8 text-green-600" />
              <h1 className="text-2xl sm:text-3xl font-bold text-fixed">Walk-in Contractor Registration</h1>
            </div>
            <p className="text-variable text-sm">{company.companyName}</p>
          </GlassCard>

          <StepIndicator />

          {/* Personal Details */}
          <GlassCard>
            <div className="flex items-center gap-2 mb-5">
              <User className="h-5 w-5 text-green-600" />
              <h2 className="text-lg font-semibold text-fixed">Step 2 — Worker Details</h2>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label>First Name *</Label>
                <Input
                  value={worker.firstName}
                  onChange={e => setWorkerField("firstName", e.target.value)}
                  placeholder="First name"
                />
              </div>
              <div>
                <Label>Last Name *</Label>
                <Input
                  value={worker.lastName}
                  onChange={e => setWorkerField("lastName", e.target.value)}
                  placeholder="Last name"
                />
              </div>
              <div>
                <Label>Email</Label>
                <Input
                  type="email"
                  value={worker.email}
                  onChange={e => setWorkerField("email", e.target.value)}
                  placeholder="worker@email.com"
                />
              </div>
              <div>
                <Label>Phone</Label>
                <Input
                  type="tel"
                  value={worker.phone}
                  onChange={e => setWorkerField("phone", e.target.value)}
                  placeholder="e.g. 07700 900000"
                />
              </div>
              <div>
                <Label>Home Postcode * <span className="text-xs font-normal text-muted-foreground">(for CO2 reporting)</span></Label>
                <Input
                  value={worker.postcode}
                  onChange={e => setWorkerField("postcode", e.target.value.toUpperCase().replace(/\s/g, ""))}
                  placeholder="e.g. M11AA"
                  maxLength={8}
                  style={{ textTransform: "uppercase" }}
                />
              </div>
              <div>
                <Label>Transport Method *</Label>
                <Select value={worker.transportMethod} onValueChange={v => setWorkerField("transportMethod", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="car_diesel">🚗 Diesel Car</SelectItem>
                    <SelectItem value="car_petrol">🚗 Petrol Car</SelectItem>
                    <SelectItem value="electric_car">⚡ Electric Car</SelectItem>
                    <SelectItem value="motorcycle">🏍️ Motorcycle</SelectItem>
                    <SelectItem value="public_transport">🚌 Public Transport</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {activeZones.length > 0 && (
                <div>
                  <Label>Zone / Work Area</Label>
                  <Select value={worker.zoneId} onValueChange={v => setWorkerField("zoneId", v)}>
                    <SelectTrigger><SelectValue placeholder="Select zone (optional)" /></SelectTrigger>
                    <SelectContent>
                      {activeZones.map((z: any) => (
                        <SelectItem key={z.id} value={z.id}>
                          <div className="flex items-center gap-2">
                            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: z.color }} />
                            {z.name}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          </GlassCard>

          {/* Right to Work */}
          <GlassCard>
            <div className="flex items-center gap-2 mb-1">
              <Lock className="h-4 w-4 text-red-600" />
              <h3 className="font-semibold text-fixed">Right to Work</h3>
              <Badge className="bg-red-100 text-red-700 text-xs ml-auto">LEGALLY REQUIRED — Immigration Act 2014</Badge>
            </div>
            <p className="text-xs text-muted-foreground mb-4">Must be verified before any work commences on site.</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label>Status</Label>
                <Select value={worker.rightToWork} onValueChange={v => setWorkerField("rightToWork", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="valid">✅ Valid</SelectItem>
                    <SelectItem value="pending">⏳ Pending Verification</SelectItem>
                    <SelectItem value="expired">❌ Expired</SelectItem>
                    <SelectItem value="missing">⚠️ Not Yet Checked</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Expiry Date</Label>
                <Input
                  type="date"
                  value={worker.rightToWorkExpiry}
                  onChange={e => setWorkerField("rightToWorkExpiry", e.target.value)}
                />
              </div>
            </div>
          </GlassCard>

          {/* CSCS Card */}
          <GlassCard>
            <div className="flex items-center gap-2 mb-1">
              <HardHat className="h-4 w-4 text-amber-600" />
              <h3 className="font-semibold text-fixed">CSCS Card</h3>
              <Badge className="bg-amber-100 text-amber-700 text-xs ml-auto">Site Required — CDM 2015</Badge>
            </div>
            <p className="text-xs text-muted-foreground mb-4">Required on most construction and refurbishment sites.</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <Label>Card Number</Label>
                <Input
                  value={worker.cscsCard}
                  onChange={e => setWorkerField("cscsCard", e.target.value)}
                  placeholder="e.g. 12345678"
                />
              </div>
              <div>
                <Label>Status</Label>
                <Select value={worker.cscsStatus} onValueChange={v => setWorkerField("cscsStatus", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="valid">✅ Valid</SelectItem>
                    <SelectItem value="pending">⏳ Pending</SelectItem>
                    <SelectItem value="expired">❌ Expired</SelectItem>
                    <SelectItem value="none">— None / Not applicable</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Expiry Date</Label>
                <Input
                  type="date"
                  value={worker.cscsExpiry}
                  onChange={e => setWorkerField("cscsExpiry", e.target.value)}
                />
              </div>
            </div>
          </GlassCard>

          {/* IPAF */}
          <GlassCard>
            <div className="flex items-center gap-2 mb-1">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              <h3 className="font-semibold text-fixed">IPAF Card</h3>
              <Badge className="bg-amber-100 text-amber-700 text-xs ml-auto">MEWP Operations — PUWER / WAHR 2005</Badge>
            </div>
            <p className="text-xs text-muted-foreground mb-4">Required for work involving mobile elevated work platforms.</p>
            <div className="max-w-xs">
              <Label>IPAF Status</Label>
              <Select value={worker.ipafStatus} onValueChange={v => setWorkerField("ipafStatus", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="valid">✅ Valid</SelectItem>
                  <SelectItem value="expired">❌ Expired</SelectItem>
                  <SelectItem value="none">— Not applicable</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </GlassCard>

          {/* Training Certificates */}
          <GlassCard>
            <div className="flex items-center gap-2 mb-4">
              <ClipboardCheck className="h-5 w-5 text-blue-600" />
              <h3 className="font-semibold text-fixed">Training Certificates</h3>
            </div>
            <div className="space-y-4">
              {[
                { field: "asbestosAwareness", label: "Asbestos Awareness", legal: "CAR 2012 — required for construction / refurb work" },
                { field: "manualHandling", label: "Manual Handling", legal: "Manual Handling Operations Regulations 1992" },
                { field: "workingAtHeight", label: "Working at Height", legal: "Work at Height Regulations 2005" },
              ].map(({ field, label, legal }) => (
                <div key={field} className="flex items-start gap-3 p-3 rounded-lg bg-slate-50 border border-slate-100">
                  <Checkbox
                    id={field}
                    checked={!!worker[field as keyof typeof worker]}
                    onCheckedChange={checked => setWorkerField(field, !!checked)}
                    className="mt-0.5"
                  />
                  <label htmlFor={field} className="cursor-pointer">
                    <p className="font-medium text-sm text-fixed">{label}</p>
                    <p className="text-xs text-muted-foreground">{legal}</p>
                  </label>
                </div>
              ))}
            </div>
          </GlassCard>

          <div className="flex gap-3">
            <Button variant="outline" onClick={() => setStep(1)} className="flex-1 h-12">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Button>
            <Button
              onClick={() => setStep(3)}
              disabled={!step2Valid}
              className="flex-1 h-12 bg-blue-600 hover:bg-blue-700"
            >
              Next: Documents & Submit
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // ── STEP 3 — Documents & Review ────────────────────────────────────────────
  const groupedDocs = (["legal", "site", "practice"] as const).map(cat => ({
    ...CATEGORY_META[cat],
    cat,
    docs: COMPANY_DOCS.filter(d => d.category === cat),
  }));

  return (
    <div className="min-h-screen bg-background p-4 md:p-6">
      <div className="max-w-2xl mx-auto space-y-6">
        <GlassCard className="text-center">
          <div className="flex items-center justify-center gap-3 mb-2">
            <Shield className="h-8 w-8 text-purple-600" />
            <h1 className="text-2xl sm:text-3xl font-bold text-fixed">Walk-in Contractor Registration</h1>
          </div>
          <p className="text-variable text-sm">{company.companyName} — {worker.firstName} {worker.lastName}</p>
        </GlassCard>

        <StepIndicator />

        {/* Compliance summary */}
        <GlassCard>
          <h2 className="text-lg font-semibold text-fixed mb-3">Step 3 — Company Documents</h2>
          <div className="mb-4 p-3 rounded-lg bg-blue-50 border border-blue-100 text-sm text-blue-800">
            Upload as many documents as you have with you now. Any missing documents can be supplied later and must be verified by the safety team before full site access is granted.
          </div>

          {/* Compliance score bar */}
          <div className="mb-4">
            <div className="flex justify-between text-xs text-muted-foreground mb-1">
              <span>Legal documents uploaded</span>
              <span>{legalUploaded} of {legalDocs.length}</span>
            </div>
            <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-500 rounded-full transition-all"
                style={{ width: `${legalDocs.length ? (legalUploaded / legalDocs.length) * 100 : 0}%` }}
              />
            </div>
          </div>

          <div className="space-y-5">
            {groupedDocs.map(({ cat, label, icon: Icon, color, bg, badge, docs: catDocs }) => (
              <div key={cat}>
                <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border ${bg} mb-3`}>
                  <Icon className={`h-4 w-4 ${color}`} />
                  <span className={`text-sm font-semibold ${color}`}>{label}</span>
                </div>
                <div className="space-y-3 pl-1">
                  {catDocs.map(doc => (
                    <div key={doc.key} className="rounded-lg border border-gray-100 bg-white p-3">
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div>
                          <p className="text-sm font-medium text-fixed">
                            {doc.label}
                            {doc.optional && <span className="text-xs text-muted-foreground ml-1">(construction only)</span>}
                          </p>
                          <p className="text-xs text-muted-foreground">{doc.legal}</p>
                        </div>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${badge}`}>
                          {cat === "legal" ? "Required" : cat === "site" ? "Site" : "Optional"}
                        </span>
                      </div>
                      <div className="flex flex-col sm:flex-row gap-2">
                        <label className="flex-1 cursor-pointer">
                          <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border-2 border-dashed text-sm transition-colors ${
                            docs[doc.key]?.file
                              ? "border-green-400 bg-green-50 text-green-700"
                              : "border-gray-200 bg-gray-50 text-gray-500 hover:border-gray-300"
                          }`}>
                            <FileText className="h-4 w-4 flex-shrink-0" />
                            <span className="truncate">
                              {docs[doc.key]?.file ? docs[doc.key].file!.name : "Choose file (PDF, JPG, PNG)"}
                            </span>
                          </div>
                          <input
                            type="file"
                            accept=".pdf,.jpg,.jpeg,.png"
                            className="hidden"
                            onChange={e => setDocFile(doc.key, e.target.files?.[0] || null)}
                          />
                        </label>
                        {doc.requiresExpiry && (
                          <div className="sm:w-44">
                            <Input
                              type="date"
                              value={docs[doc.key]?.expiry || ""}
                              onChange={e => setDocExpiry(doc.key, e.target.value)}
                              placeholder="Expiry date"
                              className="text-sm"
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </GlassCard>

        {/* Review summary */}
        <GlassCard>
          <h3 className="font-semibold text-fixed mb-3">Review Before Submitting</h3>
          <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm mb-4">
            <span className="text-muted-foreground">Company</span>
            <span className="font-medium">{company.companyName}</span>
            <span className="text-muted-foreground">Contact</span>
            <span>{company.contactFirstName} {company.contactLastName}</span>
            <span className="text-muted-foreground">Worker</span>
            <span className="font-medium">{worker.firstName} {worker.lastName}</span>
            <span className="text-muted-foreground">Right to Work</span>
            <span className={worker.rightToWork === "valid" ? "text-green-600 font-medium" : "text-amber-600"}>
              {worker.rightToWork === "valid" ? "✅ Valid" : worker.rightToWork === "pending" ? "⏳ Pending" : "❌ " + worker.rightToWork}
            </span>
            <span className="text-muted-foreground">CSCS Card</span>
            <span>{worker.cscsCard || "Not provided"}</span>
            <span className="text-muted-foreground">Documents uploaded</span>
            <span>{COMPANY_DOCS.filter(d => docs[d.key]?.file).length} of {COMPANY_DOCS.length}</span>
          </div>
          <div className="p-3 rounded-lg bg-amber-50 border border-amber-100 text-xs text-amber-800">
            <strong>Next steps:</strong> Your registration will be reviewed by the safety team. Full site access requires document verification and completion of the site induction. Reception will contact you once approved.
          </div>
        </GlassCard>

        <div className="flex gap-3">
          <Button variant="outline" onClick={() => setStep(2)} className="flex-1 h-12" disabled={registerMutation.isPending}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>
          <Button
            onClick={() => registerMutation.mutate()}
            disabled={registerMutation.isPending}
            className="flex-1 h-12 bg-green-600 hover:bg-green-700"
          >
            {registerMutation.isPending ? (
              <span className="flex items-center gap-2"><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />Registering…</span>
            ) : (
              <span className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4" />Submit Registration</span>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
