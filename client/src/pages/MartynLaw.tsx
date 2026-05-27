import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import GlassCard from "@/components/GlassCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Shield, ShieldCheck, AlertTriangle, CheckCircle, XCircle, Plus, Trash2, Save,
  FileText, Users, Building, Phone, ClipboardList, BookOpen, Calendar, Download,
  HelpCircle, ExternalLink, Info, Upload, Paperclip, History, User,
} from "lucide-react";
import { format } from "date-fns";

// ── Types ─────────────────────────────────────────────────────────────────────

interface ChecklistItem {
  id: string;
  label: string;
  completed: boolean;
  completedAt?: string;
  notes?: string;
}

interface EvidenceEntry {
  id: string;
  type: string;
  description: string;
  date: string;
  conductedBy: string;
  documentUrl?: string;
  documentName?: string;
}

interface AuditEntry {
  timestamp: string;
  action: string;
  userName: string;
}

interface MartynLawData {
  id?: string;
  venueType?: string;
  venueCapacity?: number;
  isInScope?: boolean;
  scopeNotes?: string;
  supervisorName?: string;
  supervisorRole?: string;
  supervisorPhone?: string;
  supervisorEmail?: string;
  supervisorStaffId?: string;
  siaProviderName?: string;
  siaLicenseNumber?: string;
  siaExpiryDate?: string;
  actionPlan?: string;
  evacuationProcedure?: string;
  lockdownProcedure?: string;
  communicationPlan?: string;
  checklistItems?: ChecklistItem[];
  evidenceLog?: EvidenceEntry[];
  auditLog?: AuditEntry[];
  lastReviewedAt?: string;
  lastReviewedBy?: string;
  lastReviewerStaffId?: string;
}

interface StaffMember {
  id: string;
  firstName: string;
  lastName: string;
  email?: string;
  jobTitle?: string;
  phoneNumber?: string;
  department?: string;
}

interface ComplianceRequirement {
  id: string;
  label: string;
  legalObligation: string;
  tprFeature: string;
  active: boolean;
  detail: string;
}

interface ComplianceSummary {
  companyName: string;
  compliancePercent: number;
  activeCount: number;
  totalCount: number;
  requirements: ComplianceRequirement[];
}

// ── Constants ──────────────────────────────────────────────────────────────────

const DEFAULT_CHECKLIST: ChecklistItem[] = [
  { id: "1",  label: "Terrorism threat assessment completed", completed: false },
  { id: "2",  label: "Designated Security Supervisor appointed", completed: false },
  { id: "3",  label: "Public protective security plan documented", completed: false },
  { id: "4",  label: "Staff trained on Action Counters Terrorism (ACT) programme", completed: false },
  { id: "5",  label: "Run, Hide, Tell procedures communicated to all staff", completed: false },
  { id: "6",  label: "Evacuation procedures reviewed for terrorism scenarios", completed: false },
  { id: "7",  label: "Lockdown procedure tested", completed: false },
  { id: "8",  label: "Communication plan for alerting police / emergency services in place", completed: false },
  { id: "9",  label: "Vulnerable persons / PEEP considered in security plan", completed: false },
  { id: "10", label: "SIA security provider engaged (if applicable)", completed: false },
  { id: "11", label: "Annual review of security plan scheduled", completed: false },
  { id: "12", label: "Staff security awareness training completed and logged", completed: false },
];

const VENUE_TYPES = [
  "Office Building", "Retail Premises", "Entertainment Venue", "Sports Stadium",
  "Public Space", "Educational Institution", "Healthcare Facility", "Hotel / Hospitality",
  "Transport Hub", "Place of Worship", "Other",
];

const EVIDENCE_TYPES = [
  "Staff Training", "Drill / Exercise", "Annual Review", "Risk Assessment",
  "Threat Assessment", "External Audit", "Policy Update", "Incident Review",
];

// ── Tooltip helper ─────────────────────────────────────────────────────────────

function MLTip({ text }: { text: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button type="button" className="inline-flex ml-1.5 text-gray-400 hover:text-blue-500 focus:outline-none">
          <Info size={13} />
        </button>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs text-xs leading-relaxed" side="top">
        {text}
      </TooltipContent>
    </Tooltip>
  );
}

// ── Staff picker ───────────────────────────────────────────────────────────────

function StaffSelect({
  value,
  onChange,
  onStaffPicked,
  placeholder = "Select staff member…",
}: {
  value: string;
  onChange: (v: string) => void;
  onStaffPicked?: (s: StaffMember | null) => void;
  placeholder?: string;
}) {
  const { data: staffList = [] } = useQuery<StaffMember[]>({
    queryKey: ["/api/staff"],
    staleTime: 60_000,
  });
  const [isManual, setIsManual] = useState(false);

  const names = staffList.map(s => `${s.firstName} ${s.lastName}`);

  useEffect(() => {
    if (value && !names.includes(value) && staffList.length > 0) setIsManual(true);
  }, [staffList.length]);

  const selectVal = isManual ? "__manual__" : (value || "");

  return (
    <div className="space-y-1 mt-1">
      <Select
        value={selectVal}
        onValueChange={v => {
          if (v === "__manual__") {
            setIsManual(true);
            onChange("");
            onStaffPicked?.(null);
          } else {
            setIsManual(false);
            onChange(v);
            const found = staffList.find(s => `${s.firstName} ${s.lastName}` === v) ?? null;
            onStaffPicked?.(found);
          }
        }}
      >
        <SelectTrigger>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {staffList.map(s => {
            const name = `${s.firstName} ${s.lastName}`;
            return (
              <SelectItem key={s.id} value={name}>
                <div>
                  <div>{name}</div>
                  {s.jobTitle && <div className="text-xs text-gray-400">{s.jobTitle}</div>}
                </div>
              </SelectItem>
            );
          })}
          <SelectItem value="__manual__">✏️ Enter name manually…</SelectItem>
        </SelectContent>
      </Select>
      {isManual && (
        <Input
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder="Type name here…"
        />
      )}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function MartynLaw() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: config, isLoading } = useQuery<MartynLawData | null>({
    queryKey: ["/api/martyn-law"],
  });
  const { data: systemCheck } = useQuery<ComplianceSummary>({
    queryKey: ["/api/compliance/summary"],
  });

  const [form, setForm] = useState<MartynLawData>({});
  const [checklist, setChecklist] = useState<ChecklistItem[]>([]);
  const [evidence, setEvidence] = useState<EvidenceEntry[]>([]);
  const [initialized, setInitialized] = useState(false);
  const [newEvidence, setNewEvidence] = useState<Partial<EvidenceEntry>>({
    type: "Staff Training",
    date: format(new Date(), "yyyy-MM-dd"),
  });
  const [uploadingFile, setUploadingFile] = useState(false);

  if (!isLoading && !initialized) {
    const d = config || {};
    setForm(d);
    setChecklist(d.checklistItems?.length ? d.checklistItems : DEFAULT_CHECKLIST);
    setEvidence(d.evidenceLog || []);
    setInitialized(true);
  }

  const saveMutation = useMutation({
    mutationFn: (payload: MartynLawData) =>
      apiRequest("PUT", "/api/martyn-law", {
        ...payload,
        checklistItems: checklist,
        evidenceLog: evidence,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/martyn-law"] });
      toast({ title: "Saved", description: "Martyn's Law compliance record updated." });
    },
    onError: () => toast({ title: "Save failed", variant: "destructive" }),
  });

  const completedCount = checklist.filter(i => i.completed).length;
  const totalCount = checklist.length;
  const pct = totalCount ? Math.round((completedCount / totalCount) * 100) : 0;

  const toggleItem = (id: string) =>
    setChecklist(prev =>
      prev.map(item =>
        item.id === id
          ? { ...item, completed: !item.completed, completedAt: !item.completed ? new Date().toISOString() : undefined }
          : item
      )
    );

  const handleFileAttach = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingFile(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/martyn-law/evidence/upload", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed");
      setNewEvidence(n => ({ ...n, documentUrl: data.url, documentName: data.name }));
      toast({ title: "File attached", description: data.name });
    } catch (err: any) {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    } finally {
      setUploadingFile(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const addEvidence = () => {
    if (!newEvidence.description || !newEvidence.date || !newEvidence.conductedBy) {
      toast({ title: "Please fill in Date, Description and Conducted By", variant: "destructive" });
      return;
    }
    setEvidence(prev => [
      ...prev,
      {
        id: Date.now().toString(),
        type: newEvidence.type || "Staff Training",
        description: newEvidence.description!,
        date: newEvidence.date!,
        conductedBy: newEvidence.conductedBy!,
        documentUrl: newEvidence.documentUrl,
        documentName: newEvidence.documentName,
      },
    ]);
    setNewEvidence({ type: "Staff Training", date: format(new Date(), "yyyy-MM-dd") });
  };

  const removeEvidence = (id: string) => setEvidence(prev => prev.filter(e => e.id !== id));

  const handleSave = () => saveMutation.mutate(form);

  const scoreColor = pct >= 80 ? "text-green-600" : pct >= 50 ? "text-amber-600" : "text-red-600";
  const scoreBg = pct >= 80
    ? "bg-green-50 border-green-200 dark:bg-green-900/10 dark:border-green-700"
    : pct >= 50
    ? "bg-amber-50 border-amber-200 dark:bg-amber-900/10 dark:border-amber-700"
    : "bg-red-50 border-red-200 dark:bg-red-900/10 dark:border-red-700";

  const auditLog: AuditEntry[] = (config as any)?.auditLog || [];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  return (
    <TooltipProvider>
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">

      {/* Header */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          <Shield className="text-blue-600 flex-shrink-0" size={22} />
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">Martyn's Law Compliance</h1>
          <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300 text-xs">UK Protect Duty</Badge>
        </div>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          UK legislation requiring qualifying venues to implement protective security measures and maintain a written security plan.
        </p>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={() => window.open("/api/compliance/report", "_blank")}>
            <Download size={14} className="mr-1.5" />Report
          </Button>
          <Button size="sm" onClick={handleSave} disabled={saveMutation.isPending}>
            <Save size={14} className="mr-1.5" />
            {saveMutation.isPending ? "Saving…" : "Save All"}
          </Button>
        </div>
      </div>

      {/* What is Martyn's Law accordion */}
      <Accordion type="single" collapsible>
        <AccordionItem value="what-is" className="border border-blue-200 dark:border-blue-800 rounded-lg bg-blue-50 dark:bg-blue-950/20 px-4">
          <AccordionTrigger className="text-sm font-semibold text-blue-800 dark:text-blue-300 hover:no-underline py-3">
            <span className="flex items-center gap-2"><HelpCircle size={15} />What is Martyn's Law?</span>
          </AccordionTrigger>
          <AccordionContent className="pb-4 text-sm text-blue-800 dark:text-blue-300 space-y-3">
            <p>
              <strong>Martyn's Law</strong> (formally the <em>Terrorism (Protection of Premises) Act 2025</em>) is UK legislation
              introduced following the 2017 Manchester Arena attack. It places a legal duty on venues to take proportionate
              protective security and preparedness measures.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="bg-white dark:bg-blue-900/20 rounded-lg p-3 border border-blue-200 dark:border-blue-700">
                <div className="font-semibold mb-1">Standard Tier</div>
                <div className="text-xs">Venues with capacity of <strong>200–799 people</strong>. Must implement reasonably practicable protective security measures.</div>
              </div>
              <div className="bg-white dark:bg-blue-900/20 rounded-lg p-3 border border-blue-200 dark:border-blue-700">
                <div className="font-semibold mb-1">Enhanced Tier</div>
                <div className="text-xs">Venues with capacity of <strong>800 or more people</strong>. Requires a trained Designated Security Supervisor and detailed risk assessments.</div>
              </div>
            </div>
            <p className="text-xs text-blue-600 dark:text-blue-400">
              The Act received Royal Assent in April 2025. This section helps you document your compliance. It is not legal advice —
              consult a qualified security professional or solicitor.
            </p>
            <a
              href="https://www.gov.uk/government/publications/martyns-law"
              target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-blue-600 underline font-medium"
            >
              <ExternalLink size={11} />Official Home Office Martyn's Law factsheet →
            </a>
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      {/* Compliance score banner */}
      <GlassCard className={`border ${scoreBg}`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className={`text-3xl sm:text-4xl font-bold ${scoreColor}`}>{pct}%</div>
            <div>
              <div className="font-semibold text-gray-800 dark:text-gray-200 text-sm sm:text-base">Compliance Score</div>
              <div className="text-xs sm:text-sm text-gray-600 dark:text-gray-400">{completedCount} of {totalCount} items completed</div>
            </div>
          </div>
          <div className="flex flex-col items-end gap-1">
            {form.lastReviewedAt && (
              <div className="text-xs text-gray-500 dark:text-gray-400 text-right">
                <div>Last reviewed {format(new Date(form.lastReviewedAt), "dd MMM yyyy")}</div>
                {form.lastReviewedBy && <div>by <strong>{form.lastReviewedBy}</strong></div>}
              </div>
            )}
            {!form.isInScope && (
              <Badge variant="outline" className="text-amber-700 border-amber-400 dark:text-amber-300 text-xs">
                <AlertTriangle size={11} className="mr-1" />Scope not confirmed
              </Badge>
            )}
          </div>
        </div>
        <div className="mt-3 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${pct >= 80 ? "bg-green-500" : pct >= 50 ? "bg-amber-500" : "bg-red-500"}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      </GlassCard>

      {/* Tabs */}
      <Tabs defaultValue="overview">
        <TabsList className="grid grid-cols-6 w-full h-auto">
          {[
            { value: "overview", icon: <Building size={14} />, label: "Venue" },
            { value: "checklist", icon: <ClipboardList size={14} />, label: "Checklist" },
            { value: "plan", icon: <FileText size={14} />, label: "Plan" },
            { value: "evidence", icon: <BookOpen size={14} />, label: "Evidence" },
            { value: "system", icon: <ShieldCheck size={14} />, label: "System" },
            { value: "audit", icon: <History size={14} />, label: "Audit" },
          ].map(t => (
            <TabsTrigger key={t.value} value={t.value} className="flex flex-col items-center gap-0.5 px-1 py-2 text-[10px] sm:text-xs">
              {t.icon}
              <span>{t.label}</span>
            </TabsTrigger>
          ))}
        </TabsList>

        {/* ── VENUE & SCOPE TAB ─────────────────────────────────────────────── */}
        <TabsContent value="overview" className="space-y-4 mt-4">

          <GlassCard>
            <h2 className="text-base font-semibold text-gray-800 dark:text-gray-200 mb-4 flex items-center gap-2">
              <Building size={16} />Venue Details &amp; Scope
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label className="flex items-center">
                  Venue Type
                  <MLTip text="Select the category that best describes your premises. The Act applies to any publicly accessible location — retail, entertainment, hospitality, transport, and more." />
                </Label>
                <select
                  className="w-full mt-1 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm p-2"
                  value={form.venueType || ""}
                  onChange={e => setForm(f => ({ ...f, venueType: e.target.value }))}
                >
                  <option value="">Select venue type…</option>
                  {VENUE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <Label className="flex items-center">
                  Maximum Venue Capacity
                  <MLTip text="The maximum number of persons your venue is designed to hold simultaneously. 200+ = Standard tier applies. 800+ = Enhanced tier applies, requiring a Designated Security Supervisor." />
                </Label>
                <Input
                  type="number"
                  placeholder="e.g. 500"
                  value={form.venueCapacity || ""}
                  onChange={e => setForm(f => ({ ...f, venueCapacity: parseInt(e.target.value) || undefined }))}
                  className="mt-1"
                />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Over 200 = standard duty · Over 800 = enhanced duty</p>
              </div>
            </div>
            <div className="mt-4 flex items-start gap-3">
              <input
                type="checkbox"
                id="inScope"
                checked={form.isInScope || false}
                onChange={e => setForm(f => ({ ...f, isInScope: e.target.checked }))}
                className="mt-0.5 h-4 w-4 rounded border-gray-300"
              />
              <label htmlFor="inScope" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                This premises is in-scope for Martyn's Law (Terrorism (Protection of Premises) Act 2025)
              </label>
            </div>
            <div className="mt-3">
              <Label className="flex items-center">
                Scope Notes / Rationale
                <MLTip text="Document your reasoning for the in-scope or out-of-scope determination. Inspectors may ask to see this written rationale. Be specific about capacity, access arrangements, and any mitigating factors." />
              </Label>
              <Textarea
                placeholder="e.g. Capacity exceeds 200 — in-scope under the standard tier. Premises is a licensed entertainment venue open to the public."
                value={form.scopeNotes || ""}
                onChange={e => setForm(f => ({ ...f, scopeNotes: e.target.value }))}
                className="mt-1"
                rows={3}
              />
            </div>
          </GlassCard>

          {/* Designated Security Supervisor */}
          <GlassCard>
            <h2 className="text-base font-semibold text-gray-800 dark:text-gray-200 mb-1 flex items-center gap-2">
              <Users size={16} />Designated Security Supervisor
              <MLTip text="Required for Enhanced Tier venues (800+ capacity). This person must be suitably trained, have authority over security arrangements, and be named in your written security plan. They are the accountable person for the Act." />
            </h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
              Select a staff member to auto-populate their job title, phone and email from the staff register.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <Label className="flex items-center">
                  <User size={13} className="mr-1.5 text-gray-400" />Select from Staff Register
                  <MLTip text="Choosing a staff member will automatically copy their job title, phone number and email into the fields below. You can still edit them manually afterwards." />
                </Label>
                <StaffSelect
                  value={form.supervisorName || ""}
                  onChange={v => setForm(f => ({ ...f, supervisorName: v }))}
                  onStaffPicked={s => {
                    if (s) {
                      setForm(f => ({
                        ...f,
                        supervisorName: `${s.firstName} ${s.lastName}`,
                        supervisorRole: s.jobTitle || f.supervisorRole,
                        supervisorPhone: s.phoneNumber || f.supervisorPhone,
                        supervisorEmail: s.email || f.supervisorEmail,
                        supervisorStaffId: s.id,
                      }));
                    }
                  }}
                  placeholder="Select staff member or enter name manually…"
                />
              </div>
              <div>
                <Label className="flex items-center">
                  Job Role / Title
                  <MLTip text="The supervisor's official job title. Must reflect a position with genuine authority over security — not an honorary or administrative role." />
                </Label>
                <Input
                  placeholder="e.g. Head of Security"
                  value={form.supervisorRole || ""}
                  onChange={e => setForm(f => ({ ...f, supervisorRole: e.target.value }))}
                  className="mt-1"
                />
              </div>
              <div>
                <Label className="flex items-center">
                  Phone
                  <MLTip text="A direct number where the supervisor can be reached during operational hours. For Enhanced Tier venues this should ideally be a 24/7 reachable number." />
                </Label>
                <Input
                  placeholder="+44 …"
                  value={form.supervisorPhone || ""}
                  onChange={e => setForm(f => ({ ...f, supervisorPhone: e.target.value }))}
                  className="mt-1"
                />
              </div>
              <div>
                <Label className="flex items-center">
                  Email
                  <MLTip text="Email address for security-related correspondence. Used by regulators and emergency services for written communication about your security plan." />
                </Label>
                <Input
                  placeholder="security@…"
                  type="email"
                  value={form.supervisorEmail || ""}
                  onChange={e => setForm(f => ({ ...f, supervisorEmail: e.target.value }))}
                  className="mt-1"
                />
              </div>
            </div>
          </GlassCard>

          {/* SIA */}
          <GlassCard>
            <h2 className="text-base font-semibold text-gray-800 dark:text-gray-200 mb-4 flex items-center gap-2">
              <Shield size={16} />SIA / Security Provider
              <MLTip text="If you use Security Industry Authority (SIA) licensed security staff, record your provider details. SIA door supervisors are often a requirement for licensed public venues and are a strong indicator of compliance." />
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <Label className="flex items-center">
                  Provider Name
                  <MLTip text="The trading name of the SIA-approved security company you use. Ensure they hold a valid SIA Approved Contractor Scheme (ACS) approval." />
                </Label>
                <Input
                  placeholder="Company name"
                  value={form.siaProviderName || ""}
                  onChange={e => setForm(f => ({ ...f, siaProviderName: e.target.value }))}
                  className="mt-1"
                />
              </div>
              <div>
                <Label className="flex items-center">
                  SIA Licence Number
                  <MLTip text="The SIA licence number of the principal door supervisor or security manager. Verify licences are current at the SIA public register (gov.uk/sia). Operating with unlicensed staff is a criminal offence." />
                </Label>
                <Input
                  placeholder="e.g. 1234-5678-9012-3456"
                  value={form.siaLicenseNumber || ""}
                  onChange={e => setForm(f => ({ ...f, siaLicenseNumber: e.target.value }))}
                  className="mt-1"
                />
              </div>
              <div>
                <Label className="flex items-center">
                  Licence Expiry Date
                  <MLTip text="SIA licences last 3 years. Set a reminder well before expiry — a gap in coverage could expose your venue to liability and enforcement action." />
                </Label>
                <Input
                  type="date"
                  value={form.siaExpiryDate ? form.siaExpiryDate.substring(0, 10) : ""}
                  onChange={e => setForm(f => ({ ...f, siaExpiryDate: e.target.value }))}
                  className="mt-1"
                />
              </div>
            </div>
          </GlassCard>

          {/* Annual Review */}
          <GlassCard>
            <h2 className="text-base font-semibold text-gray-800 dark:text-gray-200 mb-4 flex items-center gap-2">
              <Calendar size={16} />Annual Review
              <MLTip text="Martyn's Law requires venues to review their security plan at least once every 12 months, or after a significant incident or change to the venue. The review must be documented and signed off by the Designated Security Supervisor." />
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label className="flex items-center">
                  Last Review Conducted By
                  <MLTip text="Select the staff member who led the most recent annual security review. Saving this record will automatically set today as the last review date." />
                </Label>
                <StaffSelect
                  value={form.lastReviewedBy || ""}
                  onChange={v => setForm(f => ({ ...f, lastReviewedBy: v }))}
                  onStaffPicked={s => s && setForm(f => ({
                    ...f,
                    lastReviewedBy: `${s.firstName} ${s.lastName}`,
                    lastReviewerStaffId: s.id,
                  }))}
                  placeholder="Select reviewer or enter name…"
                />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Saving with this field set will record today's date as the last review date.
                </p>
              </div>
              {form.lastReviewedAt && (
                <div>
                  <Label>Last Review Date (auto-recorded)</Label>
                  <div className="mt-1 p-2 rounded-md bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-sm text-gray-700 dark:text-gray-300">
                    {format(new Date(form.lastReviewedAt), "dd MMMM yyyy")}
                  </div>
                </div>
              )}
            </div>
          </GlassCard>
        </TabsContent>

        {/* ── CHECKLIST TAB ─────────────────────────────────────────────────── */}
        <TabsContent value="checklist" className="mt-4">
          <GlassCard>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
              <h2 className="text-sm sm:text-base font-semibold text-gray-800 dark:text-gray-200 flex items-center gap-2">
                <ClipboardList size={16} className="flex-shrink-0" />
                UK Protect Duty Compliance Checklist
                <MLTip text="Work through each item below. Tick as each is completed — the compliance score updates automatically. Save All to persist your progress." />
              </h2>
              <span className={`text-sm font-medium flex-shrink-0 ${scoreColor}`}>{completedCount}/{totalCount} complete</span>
            </div>
            <div className="space-y-2">
              {checklist.map(item => (
                <div
                  key={item.id}
                  onClick={() => toggleItem(item.id)}
                  className={`flex items-start gap-3 p-3 rounded-lg border transition-colors cursor-pointer select-none ${
                    item.completed
                      ? "bg-green-50 border-green-200 dark:bg-green-900/20 dark:border-green-800"
                      : "bg-white border-gray-200 dark:bg-gray-800 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-750"
                  }`}
                >
                  {item.completed
                    ? <CheckCircle size={18} className="text-green-500 flex-shrink-0 mt-0.5" />
                    : <XCircle size={18} className="text-gray-300 dark:text-gray-600 flex-shrink-0 mt-0.5" />}
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm ${item.completed ? "text-green-800 dark:text-green-200 line-through opacity-75" : "text-gray-800 dark:text-gray-200"}`}>
                      {item.label}
                    </p>
                    {item.completed && item.completedAt && (
                      <p className="text-xs text-green-600 dark:text-green-400 mt-0.5">
                        Marked complete {format(new Date(item.completedAt), "dd MMM yyyy")}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-4">Click any item to toggle. Hit Save All to persist.</p>
          </GlassCard>
        </TabsContent>

        {/* ── SECURITY PLAN TAB ─────────────────────────────────────────────── */}
        <TabsContent value="plan" className="space-y-4 mt-4">
          <GlassCard>
            <h2 className="text-base font-semibold text-gray-800 dark:text-gray-200 mb-4 flex items-center gap-2">
              <FileText size={16} />Terrorism Action Plan
              <MLTip text="Your written security plan is a core legal requirement. It must address: threat assessment, protective measures, evacuation, lockdown, and communication. Keep it current — review after any incident or significant change." />
            </h2>
            <div className="space-y-4">
              <div>
                <Label className="font-medium flex items-center">
                  General Security / Protective Plan
                  <MLTip text="Describe your overall approach: CCTV coverage, bag checks, access control, security patrols, suspicious item procedures, and how you receive threat updates from NaCTSO / CT Policing." />
                </Label>
                <Textarea
                  placeholder="Describe your overall approach to terrorism preparedness: bag searches, CCTV coverage, security patrols, access control, threat reporting procedures…"
                  value={form.actionPlan || ""}
                  onChange={e => setForm(f => ({ ...f, actionPlan: e.target.value }))}
                  rows={5}
                  className="mt-1"
                />
              </div>
              <div>
                <Label className="font-medium flex items-center">
                  Evacuation Procedure (Terrorism Scenario)
                  <MLTip text="Terrorism evacuations differ from fire: staff must not stop for belongings, must consider secondary devices, and must manage crowd behaviour. Document assembly points, priority routes, and crowd management." />
                </Label>
                <Textarea
                  placeholder="How will you evacuate during a terrorism incident? Assembly points, crowd management, priority evacuation routes, PEEP considerations…"
                  value={form.evacuationProcedure || ""}
                  onChange={e => setForm(f => ({ ...f, evacuationProcedure: e.target.value }))}
                  rows={4}
                  className="mt-1"
                />
              </div>
              <div>
                <Label className="font-medium flex items-center">
                  Lockdown Procedure
                  <MLTip text="Used when evacuation is unsafe. Document: who decides to initiate, how entry points are secured, internal shelter areas, communications with staff and visitors during lockdown, and the all-clear process." />
                </Label>
                <Textarea
                  placeholder="When to initiate, who initiates, how to secure entry points, internal shelter areas, communication during lockdown, all-clear process…"
                  value={form.lockdownProcedure || ""}
                  onChange={e => setForm(f => ({ ...f, lockdownProcedure: e.target.value }))}
                  rows={4}
                  className="mt-1"
                />
              </div>
              <div>
                <Label className="font-medium flex items-center gap-1.5">
                  <Phone size={13} />Communication Plan
                  <MLTip text="Cover: alerting emergency services (999), the Silent Solution (press 55 when police answer), internal staff alerting (radio, PA, messaging), and informing visitors to evacuate or shelter. Include who is the designated spokesperson for media." />
                </Label>
                <Textarea
                  placeholder="Alerting emergency services (999 / Silent Solution 55), internal staff alert, PA/radio procedures, informing visitors, media spokesperson…"
                  value={form.communicationPlan || ""}
                  onChange={e => setForm(f => ({ ...f, communicationPlan: e.target.value }))}
                  rows={4}
                  className="mt-1"
                />
              </div>
            </div>
          </GlassCard>

          <div className="p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
            <h3 className="text-sm font-semibold text-blue-800 dark:text-blue-300 flex items-center gap-2 mb-2">
              <AlertTriangle size={14} />Guidance: Run, Hide, Tell
            </h3>
            <ul className="text-sm text-blue-700 dark:text-blue-400 space-y-1">
              <li><strong>RUN:</strong> Escape if there is a safe route. Don't wait for others.</li>
              <li><strong>HIDE:</strong> If you can't run, find cover. Turn your phone to silent. Lock/barricade doors.</li>
              <li><strong>TELL:</strong> Call 999 when safe. Tell others inside if safe to do so.</li>
            </ul>
            <p className="text-xs text-blue-600 dark:text-blue-500 mt-2">
              Source: UK Counter Terrorism Policing / ACT. Train all staff free at <span className="underline">gov.uk/act</span>
            </p>
          </div>
        </TabsContent>

        {/* ── EVIDENCE LOG TAB ──────────────────────────────────────────────── */}
        <TabsContent value="evidence" className="space-y-4 mt-4">
          <GlassCard>
            <h2 className="text-base font-semibold text-gray-800 dark:text-gray-200 mb-1 flex items-center gap-2">
              <Plus size={16} />Add Evidence Entry
              <MLTip text="Keep a log of every compliance activity — training sessions, drills, reviews, audits. Attach supporting documents (certificates, attendance sheets, reports) as proof. Regulators may inspect this log." />
            </h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
              Attach a document for each entry (PDF, Word, image). Max 10 MB per file.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label className="flex items-center">
                  Type
                  <MLTip text="Staff Training includes ACT e-learning and security briefings. Drill / Exercise includes test evacuations and lockdown rehearsals. Annual Review is the mandatory 12-monthly review." />
                </Label>
                <select
                  className="w-full mt-1 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm p-2"
                  value={newEvidence.type || "Staff Training"}
                  onChange={e => setNewEvidence(n => ({ ...n, type: e.target.value }))}
                >
                  {EVIDENCE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <Label className="flex items-center">
                  Date
                  <MLTip text="The date the activity took place — not today's date unless the activity happened today." />
                </Label>
                <Input
                  type="date"
                  value={newEvidence.date || ""}
                  onChange={e => setNewEvidence(n => ({ ...n, date: e.target.value }))}
                  className="mt-1"
                />
              </div>
              <div className="md:col-span-2">
                <Label className="flex items-center">
                  Description
                  <MLTip text="Be specific — include number of staff involved, topics covered, and any outcomes or follow-up actions. Specific entries carry more evidential weight than vague ones." />
                </Label>
                <Input
                  placeholder="e.g. ACT Awareness e-learning completed by all 12 reception staff; attendance register retained on file"
                  value={newEvidence.description || ""}
                  onChange={e => setNewEvidence(n => ({ ...n, description: e.target.value }))}
                  className="mt-1"
                />
              </div>
              <div>
                <Label className="flex items-center">
                  Conducted By
                  <MLTip text="Select the staff member who led, organised or certified this activity." />
                </Label>
                <StaffSelect
                  value={newEvidence.conductedBy || ""}
                  onChange={v => setNewEvidence(n => ({ ...n, conductedBy: v }))}
                  placeholder="Select staff member or enter name…"
                />
              </div>
              <div>
                <Label className="flex items-center">
                  Supporting Document (optional)
                  <MLTip text="Attach a PDF, image or Office document as evidence. For example: training certificate, attendance register, drill report, policy document. Max 10 MB." />
                </Label>
                <div className="mt-1 flex items-center gap-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png"
                    className="hidden"
                    onChange={handleFileAttach}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploadingFile}
                    className="flex-1"
                  >
                    {uploadingFile
                      ? <><div className="animate-spin rounded-full h-3 w-3 border-b-2 border-gray-500 mr-1.5" />Uploading…</>
                      : <><Upload size={13} className="mr-1.5" />Attach File</>}
                  </Button>
                  {newEvidence.documentName && (
                    <div className="flex items-center gap-1 text-xs text-green-700 dark:text-green-400 flex-1 min-w-0">
                      <Paperclip size={11} className="flex-shrink-0" />
                      <span className="truncate">{newEvidence.documentName}</span>
                      <button
                        onClick={() => setNewEvidence(n => ({ ...n, documentUrl: undefined, documentName: undefined }))}
                        className="text-gray-400 hover:text-red-500 flex-shrink-0"
                      >
                        <XCircle size={12} />
                      </button>
                    </div>
                  )}
                </div>
              </div>
              <div className="md:col-span-2 flex justify-end">
                <Button onClick={addEvidence} className="w-full md:w-auto">
                  <Plus size={14} className="mr-1" />Add Entry
                </Button>
              </div>
            </div>
          </GlassCard>

          <GlassCard>
            <h2 className="text-base font-semibold text-gray-800 dark:text-gray-200 mb-4 flex items-center gap-2">
              <BookOpen size={16} />Evidence Log ({evidence.length} {evidence.length === 1 ? "entry" : "entries"})
            </h2>
            {evidence.length === 0 ? (
              <div className="text-center py-8 text-gray-400 dark:text-gray-500">
                <BookOpen size={32} className="mx-auto mb-2 opacity-40" />
                <p className="text-sm">No evidence entries yet. Add training, drills and reviews above.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {evidence.slice().reverse().map(entry => (
                  <div key={entry.id} className="flex items-start gap-3 p-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="outline" className="text-xs">{entry.type}</Badge>
                        <span className="text-xs text-gray-500 dark:text-gray-400">{entry.date}</span>
                        {entry.documentUrl && entry.documentName && (
                          <a
                            href={entry.documentUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline"
                          >
                            <Paperclip size={10} />{entry.documentName}
                          </a>
                        )}
                      </div>
                      <p className="text-sm text-gray-800 dark:text-gray-200 mt-1">{entry.description}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">By: {entry.conductedBy}</p>
                    </div>
                    <button
                      onClick={() => removeEvidence(entry.id)}
                      className="text-gray-400 hover:text-red-500 flex-shrink-0 mt-1"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </GlassCard>
        </TabsContent>

        {/* ── SYSTEM CHECK TAB ──────────────────────────────────────────────── */}
        <TabsContent value="system" className="mt-4 space-y-4">
          <GlassCard>
            <div className="flex items-center justify-between gap-4 flex-wrap mb-4">
              <h2 className="text-base font-semibold text-gray-800 dark:text-gray-200 flex items-center gap-2">
                <ShieldCheck size={16} />TPR Max System Requirements
                <MLTip text="Shows how your current TPR Max module configuration maps to each Martyn's Law requirement. Statuses are read live from your system settings and active modules." />
              </h2>
              <Button variant="outline" size="sm" onClick={() => window.open("/api/compliance/report", "_blank")}>
                <Download size={13} className="mr-1.5" />Download PDF Report
              </Button>
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
              Shows how your current TPR Max configuration maps to each legal requirement. Updated automatically from live system data.
            </p>
            {systemCheck ? (
              <>
                <div className={`rounded-lg border p-4 mb-4 ${
                  (systemCheck.compliancePercent ?? 0) >= 80
                    ? "bg-green-50 border-green-200 dark:bg-green-900/10 dark:border-green-800"
                    : (systemCheck.compliancePercent ?? 0) >= 50
                    ? "bg-amber-50 border-amber-200 dark:bg-amber-900/10 dark:border-amber-800"
                    : "bg-red-50 border-red-200 dark:bg-red-900/10 dark:border-red-800"
                }`}>
                  <div className="flex flex-wrap items-center gap-3">
                    <div className={`text-3xl sm:text-4xl font-bold ${
                      (systemCheck.compliancePercent ?? 0) >= 80 ? "text-green-600" :
                      (systemCheck.compliancePercent ?? 0) >= 50 ? "text-amber-600" : "text-red-600"
                    }`}>{systemCheck.compliancePercent}%</div>
                    <div>
                      <div className="font-semibold text-gray-800 dark:text-gray-200 text-sm sm:text-base">System Compliance Score</div>
                      <div className="text-xs sm:text-sm text-gray-600 dark:text-gray-400">
                        {systemCheck.activeCount} of {systemCheck.totalCount} requirements met
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${
                        (systemCheck.compliancePercent ?? 0) >= 80 ? "bg-green-500" :
                        (systemCheck.compliancePercent ?? 0) >= 50 ? "bg-amber-500" : "bg-red-500"
                      }`}
                      style={{ width: `${systemCheck.compliancePercent}%` }}
                    />
                  </div>
                </div>
                <div className="space-y-3">
                  {(systemCheck.requirements ?? []).map(req => (
                    <div
                      key={req.id}
                      className={`rounded-lg border p-3 ${
                        req.active
                          ? "bg-green-50 border-green-200 dark:bg-green-900/10 dark:border-green-800"
                          : "bg-amber-50 border-amber-200 dark:bg-amber-900/10 dark:border-amber-800"
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        {req.active
                          ? <CheckCircle size={18} className="text-green-500 flex-shrink-0 mt-0.5" />
                          : <AlertTriangle size={18} className="text-amber-500 flex-shrink-0 mt-0.5" />}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-0.5">
                            <span className="font-semibold text-gray-800 dark:text-gray-200 text-sm">{req.label}</span>
                            {req.active
                              ? <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300 text-xs px-2">Enabled</Badge>
                              : <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 text-xs px-2">Action needed</Badge>}
                            <span className="text-xs text-blue-600 dark:text-blue-400 font-medium">TPR Max: {req.tprFeature}</span>
                          </div>
                          <p className="text-xs text-gray-600 dark:text-gray-400">{req.legalObligation}</p>
                          {!req.active && (
                            <p className="text-xs text-amber-700 dark:text-amber-400 italic mt-0.5">{req.detail}</p>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-3 flex items-center gap-1 flex-wrap">
                  Statuses reflect live system configuration.
                  <a
                    href="https://www.gov.uk/government/publications/martyns-law"
                    target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 underline text-blue-500"
                  >
                    Home Office factsheet <ExternalLink size={10} />
                  </a>
                </p>
              </>
            ) : (
              <div className="flex items-center justify-center py-10">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600" />
              </div>
            )}
          </GlassCard>
        </TabsContent>

        {/* ── AUDIT TRAIL TAB ───────────────────────────────────────────────── */}
        <TabsContent value="audit" className="mt-4">
          <GlassCard>
            <h2 className="text-base font-semibold text-gray-800 dark:text-gray-200 mb-1 flex items-center gap-2">
              <History size={16} />Audit Trail
              <MLTip text="Every time this compliance record is saved, an entry is automatically created here recording who made changes and when. This provides a tamper-evident change history useful for regulatory inspection." />
            </h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
              Automatically records every save of this compliance record — who, when, and what changed.
            </p>
            {auditLog.length === 0 ? (
              <div className="text-center py-10 text-gray-400 dark:text-gray-500">
                <History size={36} className="mx-auto mb-2 opacity-30" />
                <p className="text-sm">No audit trail yet.</p>
                <p className="text-xs mt-1">Save this record to create the first entry.</p>
              </div>
            ) : (
              <div className="space-y-1.5">
                {auditLog.slice().reverse().map((entry, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-3 py-2 px-3 rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700"
                  >
                    <div className="flex-shrink-0 w-2 h-2 rounded-full bg-blue-400" />
                    <div className="flex-1 min-w-0 text-sm">
                      <span className="font-medium text-gray-800 dark:text-gray-200">{entry.action}</span>
                      <span className="text-gray-500 dark:text-gray-400"> — by </span>
                      <span className="font-medium text-gray-700 dark:text-gray-300">{entry.userName}</span>
                    </div>
                    <div className="text-xs text-gray-400 dark:text-gray-500 flex-shrink-0">
                      {format(new Date(entry.timestamp), "dd MMM yyyy, HH:mm")}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </GlassCard>
        </TabsContent>
      </Tabs>
    </div>
    </TooltipProvider>
  );
}
