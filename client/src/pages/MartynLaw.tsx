import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import GlassCard from "@/components/GlassCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import {
  Shield,
  ShieldCheck,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Plus,
  Trash2,
  Save,
  FileText,
  Users,
  Building,
  Phone,
  ClipboardList,
  BookOpen,
  Calendar,
  Download,
  HelpCircle,
  ExternalLink,
} from "lucide-react";
import { format } from "date-fns";

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
  siaProviderName?: string;
  siaLicenseNumber?: string;
  siaExpiryDate?: string;
  actionPlan?: string;
  evacuationProcedure?: string;
  lockdownProcedure?: string;
  communicationPlan?: string;
  checklistItems?: ChecklistItem[];
  evidenceLog?: EvidenceEntry[];
  lastReviewedAt?: string;
  lastReviewedBy?: string;
}

const DEFAULT_CHECKLIST: ChecklistItem[] = [
  { id: "1", label: "Terrorism threat assessment completed", completed: false },
  { id: "2", label: "Designated Security Supervisor appointed", completed: false },
  { id: "3", label: "Public protective security plan documented", completed: false },
  { id: "4", label: "Staff trained on Action Counters Terrorism (ACT) programme", completed: false },
  { id: "5", label: "Run, Hide, Tell procedures communicated to all staff", completed: false },
  { id: "6", label: "Evacuation procedures reviewed for terrorism scenarios", completed: false },
  { id: "7", label: "Lockdown procedure tested", completed: false },
  { id: "8", label: "Communication plan for alerting police / emergency services in place", completed: false },
  { id: "9", label: "Vulnerable persons / PEEP considered in security plan", completed: false },
  { id: "10", label: "SIA security provider engaged (if applicable)", completed: false },
  { id: "11", label: "Annual review of security plan scheduled", completed: false },
  { id: "12", label: "Staff security awareness training completed and logged", completed: false },
];

const VENUE_TYPES = [
  "Office Building",
  "Retail Premises",
  "Entertainment Venue",
  "Sports Stadium",
  "Public Space",
  "Educational Institution",
  "Healthcare Facility",
  "Hotel / Hospitality",
  "Transport Hub",
  "Place of Worship",
  "Other",
];

const EVIDENCE_TYPES = [
  "Staff Training",
  "Drill / Exercise",
  "Annual Review",
  "Risk Assessment",
  "Threat Assessment",
  "External Audit",
  "Policy Update",
  "Incident Review",
];

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

export default function MartynLaw() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

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
  const [newEvidence, setNewEvidence] = useState<Partial<EvidenceEntry>>({ type: "Staff Training", date: format(new Date(), "yyyy-MM-dd") });

  if (!isLoading && !initialized) {
    const defaults = config || {};
    setForm(defaults);
    setChecklist(defaults.checklistItems && defaults.checklistItems.length ? defaults.checklistItems : DEFAULT_CHECKLIST);
    setEvidence(defaults.evidenceLog || []);
    setInitialized(true);
  }

  const saveMutation = useMutation({
    mutationFn: (payload: MartynLawData) => apiRequest("PUT", "/api/martyn-law", { ...payload, checklistItems: checklist, evidenceLog: evidence }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/martyn-law"] });
      toast({ title: "Saved", description: "Martyn's Law compliance record updated." });
    },
    onError: () => {
      toast({ title: "Save failed", variant: "destructive" });
    },
  });

  const completedCount = checklist.filter(i => i.completed).length;
  const totalCount = checklist.length;
  const compliancePercent = totalCount ? Math.round((completedCount / totalCount) * 100) : 0;

  const toggleChecklistItem = (id: string) => {
    setChecklist(prev => prev.map(item =>
      item.id === id ? { ...item, completed: !item.completed, completedAt: !item.completed ? new Date().toISOString() : undefined } : item
    ));
  };

  const addEvidenceEntry = () => {
    if (!newEvidence.description || !newEvidence.date || !newEvidence.conductedBy) {
      toast({ title: "Please fill all evidence fields", variant: "destructive" });
      return;
    }
    setEvidence(prev => [...prev, { id: Date.now().toString(), type: newEvidence.type || "Staff Training", description: newEvidence.description!, date: newEvidence.date!, conductedBy: newEvidence.conductedBy! }]);
    setNewEvidence({ type: "Staff Training", date: format(new Date(), "yyyy-MM-dd") });
  };

  const removeEvidenceEntry = (id: string) => {
    setEvidence(prev => prev.filter(e => e.id !== id));
  };

  const handleSave = () => {
    saveMutation.mutate(form);
  };

  const complianceColor = compliancePercent >= 80 ? "text-green-600" : compliancePercent >= 50 ? "text-amber-600" : "text-red-600";
  const complianceBg = compliancePercent >= 80 ? "bg-green-100 border-green-300 dark:bg-green-900/20 dark:border-green-700" : compliancePercent >= 50 ? "bg-amber-100 border-amber-300 dark:bg-amber-900/20 dark:border-amber-700" : "bg-red-100 border-red-300 dark:bg-red-900/20 dark:border-red-700";

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  const handleDownloadReport = () => {
    window.open("/api/compliance/report", "_blank");
  };

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <Shield className="text-blue-600" size={28} />
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Martyn's Law Compliance</h1>
            <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300 text-xs">UK Protect Duty</Badge>
          </div>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            The Terrorism (Protection of Premises) Act 2025 — commonly known as Martyn's Law — requires qualifying venues to have a security plan and trained staff. Use this section to document your compliance.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <Button variant="outline" onClick={handleDownloadReport}>
            <Download size={15} className="mr-2" />
            Download Report
          </Button>
          <Button onClick={handleSave} disabled={saveMutation.isPending}>
            <Save size={16} className="mr-2" />
            {saveMutation.isPending ? "Saving..." : "Save All"}
          </Button>
        </div>
      </div>

      {/* What is Martyn's Law? Accordion */}
      <Accordion type="single" collapsible>
        <AccordionItem value="what-is" className="border border-blue-200 dark:border-blue-800 rounded-lg bg-blue-50 dark:bg-blue-950/20 px-4">
          <AccordionTrigger className="text-sm font-semibold text-blue-800 dark:text-blue-300 hover:no-underline py-3">
            <span className="flex items-center gap-2">
              <HelpCircle size={15} />
              What is Martyn's Law?
            </span>
          </AccordionTrigger>
          <AccordionContent className="pb-4 text-sm text-blue-800 dark:text-blue-300 space-y-3">
            <p>
              <strong>Martyn's Law</strong> (formally the <em>Terrorism (Protection of Premises) Act 2025</em>) is UK legislation introduced following the 2017 Manchester Arena attack that killed 22 people, including Martyn Hett. It places a legal duty on venues and events to take proportionate protective security and preparedness measures.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="bg-white dark:bg-blue-900/20 rounded-lg p-3 border border-blue-200 dark:border-blue-700">
                <div className="font-semibold mb-1">Standard Tier</div>
                <div className="text-xs">Venues or events with a capacity of <strong>200–799 people</strong>. Must implement reasonably practicable protective security measures and have a written security plan.</div>
              </div>
              <div className="bg-white dark:bg-blue-900/20 rounded-lg p-3 border border-blue-200 dark:border-blue-700">
                <div className="font-semibold mb-1">Enhanced Tier</div>
                <div className="text-xs">Venues or events with a capacity of <strong>800 or more people</strong>. Subject to stricter requirements including a trained Designated Security Supervisor and detailed risk assessments.</div>
              </div>
            </div>
            <div>
              <div className="font-semibold mb-1">Key Requirements</div>
              <ul className="text-xs space-y-1 list-disc list-inside">
                <li>Conduct a terrorism threat assessment for your premises</li>
                <li>Appoint a Designated Security Supervisor (enhanced tier)</li>
                <li>Create a written protective security plan</li>
                <li>Train staff on Action Counters Terrorism (ACT) — available free at <strong>gov.uk/act</strong></li>
                <li>Communicate Run, Hide, Tell procedures to all staff</li>
                <li>Review your security plan annually</li>
              </ul>
            </div>
            <p className="text-xs text-blue-600 dark:text-blue-400">
              The Act received Royal Assent in April 2025. Implementation dates and full enforcement guidance are published by the Home Office. This section helps you document your compliance work. It is not legal advice — consult a qualified security professional or solicitor for your specific situation.
            </p>
            <p className="text-xs">
              <a
                href="https://www.gov.uk/government/publications/martyns-law"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-blue-600 dark:text-blue-400 underline font-medium"
              >
                <ExternalLink size={11} />
                Official Home Office Martyn's Law factsheet →
              </a>
            </p>
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      {/* Compliance Score Banner */}
      <GlassCard className={`border ${complianceBg}`}>
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className={`text-4xl font-bold ${complianceColor}`}>{compliancePercent}%</div>
            <div>
              <div className="font-semibold text-gray-800 dark:text-gray-200">Compliance Score</div>
              <div className="text-sm text-gray-600 dark:text-gray-400">{completedCount} of {totalCount} checklist items completed</div>
            </div>
          </div>
          {form.lastReviewedAt && (
            <div className="text-sm text-gray-500 dark:text-gray-400 text-right">
              <div>Last reviewed</div>
              <div className="font-medium">{format(new Date(form.lastReviewedAt), "dd MMM yyyy")}</div>
              {form.lastReviewedBy && <div className="text-xs">by {form.lastReviewedBy}</div>}
            </div>
          )}
          {!form.isInScope && (
            <Badge variant="outline" className="text-amber-700 border-amber-400 dark:text-amber-300">
              <AlertTriangle size={12} className="mr-1" />
              Scope not confirmed
            </Badge>
          )}
        </div>
        {/* Progress bar */}
        <div className="mt-3 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${compliancePercent >= 80 ? "bg-green-500" : compliancePercent >= 50 ? "bg-amber-500" : "bg-red-500"}`}
            style={{ width: `${compliancePercent}%` }}
          />
        </div>
      </GlassCard>

      <Tabs defaultValue="overview">
        <TabsList className="grid grid-cols-5 w-full">
          <TabsTrigger value="overview"><Building size={14} className="mr-1.5" />Venue & Scope</TabsTrigger>
          <TabsTrigger value="checklist"><ClipboardList size={14} className="mr-1.5" />Checklist</TabsTrigger>
          <TabsTrigger value="plan"><FileText size={14} className="mr-1.5" />Security Plan</TabsTrigger>
          <TabsTrigger value="evidence"><BookOpen size={14} className="mr-1.5" />Evidence Log</TabsTrigger>
          <TabsTrigger value="system"><ShieldCheck size={14} className="mr-1.5" />System Check</TabsTrigger>
        </TabsList>

        {/* OVERVIEW TAB */}
        <TabsContent value="overview" className="space-y-4 mt-4">
          <GlassCard>
            <h2 className="text-base font-semibold text-gray-800 dark:text-gray-200 mb-4 flex items-center gap-2">
              <Building size={16} />
              Venue Details & Scope
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>Venue Type</Label>
                <select
                  className="w-full mt-1 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm p-2"
                  value={form.venueType || ""}
                  onChange={e => setForm(f => ({ ...f, venueType: e.target.value }))}
                >
                  <option value="">Select venue type...</option>
                  {VENUE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <Label>Maximum Venue Capacity</Label>
                <Input
                  type="number"
                  placeholder="e.g. 500"
                  value={form.venueCapacity || ""}
                  onChange={e => setForm(f => ({ ...f, venueCapacity: parseInt(e.target.value) || undefined }))}
                  className="mt-1"
                />
                <p className="text-xs text-gray-500 mt-1">Venues over 200 capacity may be in-scope; over 800 are 'enhanced duty' venues.</p>
              </div>
            </div>
            <div className="mt-4 flex items-start gap-3">
              <input
                type="checkbox"
                id="inScope"
                checked={form.isInScope || false}
                onChange={e => setForm(f => ({ ...f, isInScope: e.target.checked }))}
                className="mt-0.5 h-4 w-4 rounded"
              />
              <label htmlFor="inScope" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                This premises is in-scope for Martyn's Law (Terrorism (Protection of Premises) Act 2025)
              </label>
            </div>
            <div className="mt-3">
              <Label>Scope Notes / Rationale</Label>
              <Textarea
                placeholder="e.g. 'Capacity exceeds 200 persons — in-scope under the standard tier. Premises is a licensed entertainment venue open to the public.'"
                value={form.scopeNotes || ""}
                onChange={e => setForm(f => ({ ...f, scopeNotes: e.target.value }))}
                className="mt-1"
                rows={3}
              />
            </div>
          </GlassCard>

          <GlassCard>
            <h2 className="text-base font-semibold text-gray-800 dark:text-gray-200 mb-4 flex items-center gap-2">
              <Users size={16} />
              Designated Security Supervisor
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>Full Name</Label>
                <Input placeholder="Name" value={form.supervisorName || ""} onChange={e => setForm(f => ({ ...f, supervisorName: e.target.value }))} className="mt-1" />
              </div>
              <div>
                <Label>Job Role / Title</Label>
                <Input placeholder="e.g. Head of Security" value={form.supervisorRole || ""} onChange={e => setForm(f => ({ ...f, supervisorRole: e.target.value }))} className="mt-1" />
              </div>
              <div>
                <Label>Phone</Label>
                <Input placeholder="+44 ..." value={form.supervisorPhone || ""} onChange={e => setForm(f => ({ ...f, supervisorPhone: e.target.value }))} className="mt-1" />
              </div>
              <div>
                <Label>Email</Label>
                <Input placeholder="security@..." type="email" value={form.supervisorEmail || ""} onChange={e => setForm(f => ({ ...f, supervisorEmail: e.target.value }))} className="mt-1" />
              </div>
            </div>
          </GlassCard>

          <GlassCard>
            <h2 className="text-base font-semibold text-gray-800 dark:text-gray-200 mb-4 flex items-center gap-2">
              <Shield size={16} />
              SIA / Security Provider
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <Label>Provider Name</Label>
                <Input placeholder="Company name" value={form.siaProviderName || ""} onChange={e => setForm(f => ({ ...f, siaProviderName: e.target.value }))} className="mt-1" />
              </div>
              <div>
                <Label>SIA Licence Number</Label>
                <Input placeholder="e.g. 1234-5678-9012-3456" value={form.siaLicenseNumber || ""} onChange={e => setForm(f => ({ ...f, siaLicenseNumber: e.target.value }))} className="mt-1" />
              </div>
              <div>
                <Label>Licence Expiry Date</Label>
                <Input type="date" value={form.siaExpiryDate ? form.siaExpiryDate.substring(0, 10) : ""} onChange={e => setForm(f => ({ ...f, siaExpiryDate: e.target.value }))} className="mt-1" />
              </div>
            </div>
          </GlassCard>

          <GlassCard>
            <h2 className="text-base font-semibold text-gray-800 dark:text-gray-200 mb-4 flex items-center gap-2">
              <Calendar size={16} />
              Annual Review
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>Last Review Conducted By</Label>
                <Input placeholder="Name / role" value={form.lastReviewedBy || ""} onChange={e => setForm(f => ({ ...f, lastReviewedBy: e.target.value }))} className="mt-1" />
                <p className="text-xs text-gray-500 mt-1">Saving with this field populated will record today's date as the last review date.</p>
              </div>
              {form.lastReviewedAt && (
                <div>
                  <Label>Last Review Date</Label>
                  <div className="mt-1 p-2 rounded-md bg-gray-50 dark:bg-gray-800 text-sm text-gray-700 dark:text-gray-300">
                    {format(new Date(form.lastReviewedAt), "dd MMMM yyyy")}
                  </div>
                </div>
              )}
            </div>
          </GlassCard>
        </TabsContent>

        {/* CHECKLIST TAB */}
        <TabsContent value="checklist" className="mt-4">
          <GlassCard>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold text-gray-800 dark:text-gray-200 flex items-center gap-2">
                <ClipboardList size={16} />
                UK Protect Duty Compliance Checklist
              </h2>
              <span className={`text-sm font-medium ${complianceColor}`}>{completedCount}/{totalCount} complete</span>
            </div>
            <div className="space-y-2">
              {checklist.map((item) => (
                <div
                  key={item.id}
                  className={`flex items-start gap-3 p-3 rounded-lg border transition-colors cursor-pointer ${
                    item.completed
                      ? "bg-green-50 border-green-200 dark:bg-green-900/20 dark:border-green-800"
                      : "bg-white border-gray-200 dark:bg-gray-800 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-750"
                  }`}
                  onClick={() => toggleChecklistItem(item.id)}
                >
                  {item.completed
                    ? <CheckCircle size={18} className="text-green-500 flex-shrink-0 mt-0.5" />
                    : <XCircle size={18} className="text-gray-300 dark:text-gray-600 flex-shrink-0 mt-0.5" />
                  }
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
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-4">Click any item to toggle its completion status. Save All to persist changes.</p>
          </GlassCard>
        </TabsContent>

        {/* SECURITY PLAN TAB */}
        <TabsContent value="plan" className="space-y-4 mt-4">
          <GlassCard>
            <h2 className="text-base font-semibold text-gray-800 dark:text-gray-200 mb-4 flex items-center gap-2">
              <FileText size={16} />
              Terrorism Action Plan
            </h2>
            <div className="space-y-4">
              <div>
                <Label className="font-medium">General Security / Protective Plan</Label>
                <Textarea
                  placeholder="Describe your overall approach to terrorism preparedness: bag searches, CCTV coverage, security patrols, access control, threat reporting procedures..."
                  value={form.actionPlan || ""}
                  onChange={e => setForm(f => ({ ...f, actionPlan: e.target.value }))}
                  rows={5}
                  className="mt-1"
                />
              </div>
              <div>
                <Label className="font-medium">Evacuation Procedure (Terrorism Scenario)</Label>
                <Textarea
                  placeholder="How will you evacuate if there is a terrorism-related incident? Include assembly points, crowd management, priority evacuation routes..."
                  value={form.evacuationProcedure || ""}
                  onChange={e => setForm(f => ({ ...f, evacuationProcedure: e.target.value }))}
                  rows={4}
                  className="mt-1"
                />
              </div>
              <div>
                <Label className="font-medium">Lockdown Procedure</Label>
                <Textarea
                  placeholder="When to initiate lockdown, how to secure entry points, how to shelter in place, internal communication during lockdown..."
                  value={form.lockdownProcedure || ""}
                  onChange={e => setForm(f => ({ ...f, lockdownProcedure: e.target.value }))}
                  rows={4}
                  className="mt-1"
                />
              </div>
              <div>
                <Label className="font-medium flex items-center gap-2">
                  <Phone size={14} />
                  Communication Plan
                </Label>
                <Textarea
                  placeholder="How will you alert the police (999), how will you communicate internally with staff, how will you inform visitors/public..."
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
              <AlertTriangle size={14} />
              Guidance: Run, Hide, Tell
            </h3>
            <ul className="text-sm text-blue-700 dark:text-blue-400 space-y-1">
              <li><strong>RUN:</strong> Escape if there is a safe route. Don't wait for others.</li>
              <li><strong>HIDE:</strong> If you can't run, find cover. Turn your phone to silent. Lock/barricade doors.</li>
              <li><strong>TELL:</strong> Call 999 when safe. Tell others inside if safe to do so.</li>
            </ul>
            <p className="text-xs text-blue-600 dark:text-blue-500 mt-2">Source: UK Counter Terrorism Policing / Action Counters Terrorism (ACT). Train all staff using the free ACT Awareness e-learning at <span className="underline">gov.uk/act</span></p>
          </div>
        </TabsContent>

        {/* EVIDENCE LOG TAB */}
        <TabsContent value="evidence" className="space-y-4 mt-4">
          <GlassCard>
            <h2 className="text-base font-semibold text-gray-800 dark:text-gray-200 mb-4 flex items-center gap-2">
              <Plus size={16} />
              Add Evidence Entry
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>Type</Label>
                <select
                  className="w-full mt-1 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm p-2"
                  value={newEvidence.type || "Staff Training"}
                  onChange={e => setNewEvidence(n => ({ ...n, type: e.target.value }))}
                >
                  {EVIDENCE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <Label>Date</Label>
                <Input type="date" value={newEvidence.date || ""} onChange={e => setNewEvidence(n => ({ ...n, date: e.target.value }))} className="mt-1" />
              </div>
              <div className="md:col-span-2">
                <Label>Description</Label>
                <Input placeholder="e.g. ACT Awareness e-learning completed by all reception staff" value={newEvidence.description || ""} onChange={e => setNewEvidence(n => ({ ...n, description: e.target.value }))} className="mt-1" />
              </div>
              <div>
                <Label>Conducted By</Label>
                <Input placeholder="Name / department" value={newEvidence.conductedBy || ""} onChange={e => setNewEvidence(n => ({ ...n, conductedBy: e.target.value }))} className="mt-1" />
              </div>
              <div className="flex items-end">
                <Button onClick={addEvidenceEntry} className="w-full">
                  <Plus size={14} className="mr-1" />
                  Add Entry
                </Button>
              </div>
            </div>
          </GlassCard>

          <GlassCard>
            <h2 className="text-base font-semibold text-gray-800 dark:text-gray-200 mb-4 flex items-center gap-2">
              <BookOpen size={16} />
              Evidence Log ({evidence.length} entries)
            </h2>
            {evidence.length === 0 ? (
              <div className="text-center py-8 text-gray-400 dark:text-gray-500">
                <BookOpen size={32} className="mx-auto mb-2 opacity-40" />
                <p className="text-sm">No evidence entries yet. Add training, drills, and reviews above.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {evidence.slice().reverse().map((entry) => (
                  <div key={entry.id} className="flex items-start gap-3 p-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="outline" className="text-xs">{entry.type}</Badge>
                        <span className="text-xs text-gray-500 dark:text-gray-400">{entry.date}</span>
                      </div>
                      <p className="text-sm text-gray-800 dark:text-gray-200 mt-1">{entry.description}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">By: {entry.conductedBy}</p>
                    </div>
                    <button onClick={() => removeEvidenceEntry(entry.id)} className="text-gray-400 hover:text-red-500 flex-shrink-0 mt-1">
                      <Trash2 size={15} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </GlassCard>
        </TabsContent>

        {/* SYSTEM CHECK TAB */}
        <TabsContent value="system" className="mt-4 space-y-4">
          <GlassCard>
            <div className="flex items-center justify-between gap-4 flex-wrap mb-4">
              <h2 className="text-base font-semibold text-gray-800 dark:text-gray-200 flex items-center gap-2">
                <ShieldCheck size={16} />
                TPR Max System Requirements
              </h2>
              <Button variant="outline" size="sm" onClick={() => window.open("/api/compliance/report", "_blank")}>
                <Download size={13} className="mr-1.5" />
                Download PDF Report
              </Button>
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
              Shows how your current TPR Max configuration maps to each legal requirement. Updated automatically from live system data.
            </p>

            {systemCheck ? (
              <>
                {/* Score banner */}
                <div className={`rounded-lg border p-4 mb-4 ${
                  (systemCheck.compliancePercent ?? 0) >= 80
                    ? "bg-green-50 border-green-200 dark:bg-green-900/10 dark:border-green-800"
                    : (systemCheck.compliancePercent ?? 0) >= 50
                    ? "bg-amber-50 border-amber-200 dark:bg-amber-900/10 dark:border-amber-800"
                    : "bg-red-50 border-red-200 dark:bg-red-900/10 dark:border-red-800"
                }`}>
                  <div className="flex items-center gap-4">
                    <div className={`text-4xl font-bold ${
                      (systemCheck.compliancePercent ?? 0) >= 80 ? "text-green-600" :
                      (systemCheck.compliancePercent ?? 0) >= 50 ? "text-amber-600" : "text-red-600"
                    }`}>{systemCheck.compliancePercent}%</div>
                    <div>
                      <div className="font-semibold text-gray-800 dark:text-gray-200">System Compliance Score</div>
                      <div className="text-sm text-gray-600 dark:text-gray-400">
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

                {/* Requirements list */}
                <div className="space-y-3">
                  {(systemCheck.requirements ?? []).map((req) => (
                    <div
                      key={req.id}
                      className={`rounded-lg border p-3 ${
                        req.active
                          ? "bg-green-50 border-green-200 dark:bg-green-900/10 dark:border-green-800"
                          : "bg-amber-50 border-amber-200 dark:bg-amber-900/10 dark:border-amber-800"
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        {req.active ? (
                          <CheckCircle size={18} className="text-green-500 flex-shrink-0 mt-0.5" />
                        ) : (
                          <AlertTriangle size={18} className="text-amber-500 flex-shrink-0 mt-0.5" />
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-0.5">
                            <span className="font-semibold text-gray-800 dark:text-gray-200 text-sm">{req.label}</span>
                            {req.active ? (
                              <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300 text-xs px-2">Enabled</Badge>
                            ) : (
                              <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 text-xs px-2">Action needed</Badge>
                            )}
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
                    target="_blank"
                    rel="noopener noreferrer"
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
      </Tabs>
    </div>
  );
}
