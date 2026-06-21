import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Building2, CheckCircle, Lock, Shield, FileText, AlertTriangle } from "lucide-react";
import { CheckSquare } from "lucide-react";
import { useTranslation, Trans } from "react-i18next";

const UK_LEGAL_DOCS = [
  { key: "publicLiability" as const, nameKey: "addCompanyDialog.docs.publicLiability.name", basisKey: "addCompanyDialog.docs.publicLiability.basis", noteKey: "addCompanyDialog.docs.publicLiability.note" },
  { key: "employersLiability" as const, nameKey: "addCompanyDialog.docs.employersLiability.name", basisKey: "addCompanyDialog.docs.employersLiability.basis", noteKey: "addCompanyDialog.docs.employersLiability.note" },
  { key: "cisRegistration" as const, nameKey: "addCompanyDialog.docs.cisRegistration.name", basisKey: "addCompanyDialog.docs.cisRegistration.basis", noteKey: "addCompanyDialog.docs.cisRegistration.note" },
];
const UK_SITE_DOCS = [
  { key: "healthSafetyPolicy" as const, nameKey: "addCompanyDialog.docs.healthSafetyPolicy.name", basisKey: "addCompanyDialog.docs.healthSafetyPolicy.basis", noteKey: "addCompanyDialog.docs.healthSafetyPolicy.note" },
  { key: "rams" as const, nameKey: "addCompanyDialog.docs.rams.name", basisKey: "addCompanyDialog.docs.rams.basis", noteKey: "addCompanyDialog.docs.rams.note" },
];
const UK_GOOD_DOCS = [
  { key: "modernSlavery" as const, nameKey: "addCompanyDialog.docs.modernSlavery.name", basisKey: "addCompanyDialog.docs.modernSlavery.basis", noteKey: "addCompanyDialog.docs.modernSlavery.note" },
  { key: "environmentalPolicy" as const, nameKey: "addCompanyDialog.docs.environmentalPolicy.name", basisKey: "addCompanyDialog.docs.environmentalPolicy.basis", noteKey: "addCompanyDialog.docs.environmentalPolicy.note" },
  { key: "professionalIndemnity" as const, nameKey: "addCompanyDialog.docs.professionalIndemnity.name", basisKey: "addCompanyDialog.docs.professionalIndemnity.basis", noteKey: "addCompanyDialog.docs.professionalIndemnity.note" },
];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customerId: string | undefined;
  onAddFirstWorker: (company: any) => void;
}

export default function ContractorAddCompanyDialog({ open, onOpenChange, customerId, onAddFirstWorker }: Props) {
  const { t } = useTranslation(["contractors", "common"]);
  const { toast } = useToast();
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({ name: "", email: "", contactFirstName: "", contactLastName: "", phone: "", address: "", postcode: "", website: "", description: "", industry: "", status: "pending" as const });
  const [docs, setDocs] = useState({ publicLiability: false, employersLiability: false, cisRegistration: false, healthSafetyPolicy: false, rams: false, modernSlavery: false, environmentalPolicy: false, professionalIndemnity: false });
  const [justCreated, setJustCreated] = useState<any>(null);
  const [isGeneratingDesc, setIsGeneratingDesc] = useState(false);

  const reset = () => { setStep(1); setForm({ name: "", email: "", contactFirstName: "", contactLastName: "", phone: "", address: "", postcode: "", website: "", description: "", industry: "", status: "pending" as const }); setDocs({ publicLiability: false, employersLiability: false, cisRegistration: false, healthSafetyPolicy: false, rams: false, modernSlavery: false, environmentalPolicy: false, professionalIndemnity: false }); setJustCreated(null); };

  const handleClose = (open: boolean) => { onOpenChange(open); if (!open) reset(); };

  const generateDescriptionMutation = useMutation({
    mutationFn: async (data: { website: string; companyName: string; industry?: string }) => {
      const response = await apiRequest("POST", "/api/contractors/generate-description", data);
      return await response.json();
    },
    onSuccess: (response: { description: string }) => {
      setForm(prev => ({ ...prev, description: response.description }));
      toast({ title: t("common:success"), description: t("addCompanyDialog.descGenerated") });
    },
    onError: (error: any) => toast({ title: t("common:error"), description: error.message || t("addCompanyDialog.descFailed"), variant: "destructive" }),
    onSettled: () => setIsGeneratingDesc(false),
  });

  const handleGenerateDescription = () => {
    if (!form.website || !form.name) { toast({ title: t("common:error"), description: t("addCompanyDialog.missingInfo"), variant: "destructive" }); return; }
    setIsGeneratingDesc(true);
    generateDescriptionMutation.mutate({ website: form.website, companyName: form.name, industry: form.industry || undefined });
  };

  const createContractorMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/contractors", data);
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error || t("addCompanyDialog.addFailed"));
      return body;
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/contractors", customerId] });
      setJustCreated(data);
      setStep(4);
      setForm({ name: "", email: "", contactFirstName: "", contactLastName: "", phone: "", address: "", postcode: "", website: "", description: "", industry: "", status: "pending" as const });
    },
    onError: (error: any) => toast({ title: t("common:error"), description: error.message || t("addCompanyDialog.addFailed"), variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="w-[95vw] sm:max-w-2xl max-h-[92vh] flex flex-col overflow-hidden p-0">
        <div className="flex-shrink-0 px-6 pt-6 pb-4 border-b">
          <DialogTitle className="flex items-center gap-2 text-lg font-semibold mb-4">
            <Building2 className="h-5 w-5 text-blue-600" />
            {t("addCompanyDialog.title")}
          </DialogTitle>
          <div className="flex items-center gap-0">
            {[{ n: 1, label: t("addCompanyDialog.details") }, { n: 2, label: t("addCompanyDialog.ukDocs") }, { n: 3, label: t("addCompanyDialog.review") }].map((s, i) => (
              <div key={s.n} className={`flex items-center ${i < 2 ? 'flex-1' : ''}`}>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${step >= s.n ? 'bg-blue-600 text-white' : 'bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400'}`}>{step > s.n ? '✓' : s.n}</div>
                  <span className={`text-xs font-medium hidden sm:inline transition-colors ${step >= s.n ? 'text-blue-700 dark:text-blue-400' : 'text-gray-400 dark:text-gray-500'}`}>{s.label}</span>
                </div>
                {i < 2 && <div className={`flex-1 h-0.5 mx-2 transition-colors ${step > s.n ? 'bg-blue-600' : 'bg-gray-200 dark:bg-gray-700'}`} />}
              </div>
            ))}
          </div>
        </div>

        {step === 1 && (
          <div className="overflow-y-auto flex-1 min-h-0 px-6 py-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2"><label className="text-sm font-medium text-slate-700 dark:text-slate-200">{t("addCompanyDialog.companyName")}</label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} data-testid="input-company-name" /></div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700 dark:text-slate-200">{t("addCompanyDialog.industry")}</label>
                <Select value={form.industry} onValueChange={(v) => setForm({ ...form, industry: v })}>
                  <SelectTrigger data-testid="select-industry"><SelectValue placeholder={t("addCompanyDialog.selectIndustry")} /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="construction">{t("addCompanyDialog.industries.construction")}</SelectItem>
                    <SelectItem value="electrical">{t("addCompanyDialog.industries.electrical")}</SelectItem>
                    <SelectItem value="plumbing">{t("addCompanyDialog.industries.plumbing")}</SelectItem>
                    <SelectItem value="hvac">{t("addCompanyDialog.industries.hvac")}</SelectItem>
                    <SelectItem value="roofing">{t("addCompanyDialog.industries.roofing")}</SelectItem>
                    <SelectItem value="painting">{t("addCompanyDialog.industries.painting")}</SelectItem>
                    <SelectItem value="landscaping">{t("addCompanyDialog.industries.landscaping")}</SelectItem>
                    <SelectItem value="security">{t("addCompanyDialog.industries.security")}</SelectItem>
                    <SelectItem value="cleaning">{t("addCompanyDialog.industries.cleaning")}</SelectItem>
                    <SelectItem value="it">{t("addCompanyDialog.industries.it")}</SelectItem>
                    <SelectItem value="catering">{t("addCompanyDialog.industries.catering")}</SelectItem>
                    <SelectItem value="engineering">{t("addCompanyDialog.industries.engineering")}</SelectItem>
                    <SelectItem value="other">{t("addCompanyDialog.industries.other")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2"><label className="text-sm font-medium text-slate-700 dark:text-slate-200">{t("addCompanyDialog.contactFirstName")}</label><Input value={form.contactFirstName} onChange={(e) => setForm({ ...form, contactFirstName: e.target.value })} data-testid="input-contact-first-name" /></div>
              <div className="space-y-2"><label className="text-sm font-medium text-slate-700 dark:text-slate-200">{t("addCompanyDialog.contactLastName")}</label><Input value={form.contactLastName} onChange={(e) => setForm({ ...form, contactLastName: e.target.value })} data-testid="input-contact-last-name" /></div>
              <div className="space-y-2"><label className="text-sm font-medium text-slate-700 dark:text-slate-200">{t("addCompanyDialog.emailAddress")}</label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} data-testid="input-email" /></div>
              <div className="space-y-2"><label className="text-sm font-medium text-slate-700 dark:text-slate-200">{t("addCompanyDialog.phoneNumber")}</label><Input type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} data-testid="input-phone" /></div>
              <div className="md:col-span-2 space-y-2"><label className="text-sm font-medium text-slate-700 dark:text-slate-200">{t("addCompanyDialog.address")}</label><Textarea value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} data-testid="input-address" rows={2} /></div>
              <div className="space-y-2"><label className="text-sm font-medium text-slate-700 dark:text-slate-200">{t("addCompanyDialog.postcode")}</label><Input value={form.postcode} onChange={(e) => setForm({ ...form, postcode: e.target.value })} data-testid="input-postcode" /></div>
              <div className="space-y-2"><label className="text-sm font-medium text-slate-700 dark:text-slate-200">{t("addCompanyDialog.website")}</label><Input value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} data-testid="input-website" /></div>
              <div className="md:col-span-2 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium text-slate-700 dark:text-slate-200">{t("addCompanyDialog.description")}</label>
                  <Button type="button" variant="outline" size="sm" onClick={handleGenerateDescription} disabled={isGeneratingDesc || !form.website || !form.name} className="text-xs" data-testid="button-generate-description">
                    {isGeneratingDesc ? t("addCompanyDialog.generating") : t("addCompanyDialog.autoFillWithAI")}
                  </Button>
                </div>
                <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} data-testid="input-description" rows={2} />
              </div>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="overflow-y-auto flex-1 min-h-0 px-6 py-4 space-y-5">
            <div className="bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-700 rounded-lg px-4 py-3 text-sm text-blue-800 dark:text-blue-300">
              {t("addCompanyDialog.docTickInfo")}
            </div>
            {[{ label: t("addCompanyDialog.legallyRequired"), icon: <Lock className="w-3.5 h-3.5 text-red-600" />, bg: "bg-red-100", badge: <Badge className="bg-red-100 text-red-700 text-xs">{t("badges.ukLaw")}</Badge>, docs: UK_LEGAL_DOCS },
              { label: t("addCompanyDialog.siteRequired"), icon: <Shield className="w-3.5 h-3.5 text-amber-600" />, bg: "bg-amber-100", badge: <Badge className="bg-amber-100 text-amber-700 text-xs">{t("badges.mostSites")}</Badge>, docs: UK_SITE_DOCS },
              { label: t("addCompanyDialog.goodPractice"), icon: <CheckSquare className="w-3.5 h-3.5 text-green-600" />, bg: "bg-green-100", badge: <Badge className="bg-green-100 text-green-700 text-xs">{t("badges.recommended")}</Badge>, docs: UK_GOOD_DOCS },
            ].map(({ label, icon, bg, badge, docs: groupDocs }) => (
              <div key={label}>
                <div className="flex items-center gap-2 mb-3">
                  <div className={`w-6 h-6 ${bg} rounded-full flex items-center justify-center flex-shrink-0`}>{icon}</div>
                  <h4 className="font-semibold text-gray-900 dark:text-white text-sm">{label}</h4>
                  {badge}
                </div>
                <div className="space-y-2">
                  {groupDocs.map(doc => (
                    <label key={doc.key} className={`flex items-start gap-3 p-3 border rounded-lg cursor-pointer transition-colors ${docs[doc.key] ? 'border-green-400 bg-green-50 dark:bg-green-900/20 dark:border-green-600' : 'border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800'}`}>
                      <input type="checkbox" checked={docs[doc.key]} onChange={(e) => setDocs({ ...docs, [doc.key]: e.target.checked })} className="mt-0.5 w-4 h-4 accent-green-600 flex-shrink-0" />
                      <div className="min-w-0">
                        <p className="font-medium text-sm text-gray-900 dark:text-white">{t(doc.nameKey)}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{t(doc.basisKey)} — {t(doc.noteKey)}</p>
                      </div>
                      {docs[doc.key] && <CheckCircle className="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5" />}
                    </label>
                  ))}
                </div>
              </div>
            ))}
            <div className="text-center text-sm text-gray-600 dark:text-gray-300 pt-1">
              {t("addCompanyDialog.docsConfirmed", { count: Object.values(docs).filter(Boolean).length, total: UK_LEGAL_DOCS.length + UK_SITE_DOCS.length })}
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="overflow-y-auto flex-1 min-h-0 px-6 py-4 space-y-4">
            <p className="text-sm text-gray-600 dark:text-gray-300">{t("addCompanyDialog.reviewDetails")}</p>
            <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 space-y-2">
              <h4 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2"><Building2 className="w-4 h-4" /> {t("addCompanyDialog.details")}</h4>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                <span className="text-gray-500 dark:text-gray-400">{t("common:company")}</span><span className="font-medium">{form.name}</span>
                <span className="text-gray-500 dark:text-gray-400">{t("common:name")}</span><span>{form.contactFirstName} {form.contactLastName}</span>
                <span className="text-gray-500 dark:text-gray-400">{t("common:email")}</span><span>{form.email}</span>
                <span className="text-gray-500 dark:text-gray-400">{t("common:phone")}</span><span>{form.phone || '—'}</span>
                <span className="text-gray-500 dark:text-gray-400">{t("addCompanyDialog.industry")}</span><span className="capitalize">{form.industry || '—'}</span>
                <span className="text-gray-500 dark:text-gray-400">{t("addCompanyDialog.reviewPostcode")}</span><span>{form.postcode || '—'}</span>
              </div>
            </div>
            <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 space-y-2">
              <h4 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2"><FileText className="w-4 h-4" /> {t("addCompanyDialog.complianceDocs")}</h4>
              <div className="space-y-1.5">
                {[...UK_LEGAL_DOCS, ...UK_SITE_DOCS, ...UK_GOOD_DOCS].map(doc => (
                  <div key={doc.key} className="flex items-center gap-2 text-sm">
                    {docs[doc.key] ? <CheckCircle className="w-4 h-4 text-green-600 flex-shrink-0" /> : <div className="w-4 h-4 rounded-full border-2 border-gray-300 dark:border-gray-500 flex-shrink-0" />}
                    <span className={docs[doc.key] ? 'text-gray-800 dark:text-gray-100' : 'text-gray-400 dark:text-gray-500'}>{t(doc.nameKey)}</span>
                    {!docs[doc.key] && UK_LEGAL_DOCS.some(d => d.key === doc.key) && <Badge className="bg-red-100 text-red-700 text-xs ml-auto">{t("badges.required")}</Badge>}
                  </div>
                ))}
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">{t("addCompanyDialog.uploadAfter")}</p>
            </div>
            {(!docs.publicLiability || !docs.employersLiability) && (
              <div className="bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-700 rounded-lg px-4 py-3 flex items-start gap-2 text-sm text-amber-800 dark:text-amber-300">
                <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>{t("addCompanyDialog.confirmLegalWarning")}</span>
              </div>
            )}
          </div>
        )}

        {step === 4 && (
          <div className="overflow-y-auto flex-1 min-h-0 px-6 py-8 flex flex-col items-center justify-center gap-6 text-center">
            <div className="w-16 h-16 bg-green-100 dark:bg-green-900/40 rounded-full flex items-center justify-center">
              <CheckCircle className="w-9 h-9 text-green-600" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">{t("addCompanyDialog.successAdded")}</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                <Trans 
                  i18nKey="contractors:addCompanyDialog.registeredInfo"
                  values={{ name: justCreated?.name || justCreated?.companyName || t("common:company") }}
                  components={[<span className="font-medium text-gray-800 dark:text-gray-100" />]}
                />
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-3 w-full max-w-sm">
              <Button variant="outline" className="flex-1" onClick={() => { onOpenChange(false); reset(); }}>{t("addCompanyDialog.done") || t("common:close")}</Button>
              <Button className="flex-1 bg-blue-600 hover:bg-blue-700" onClick={() => { onOpenChange(false); reset(); if (justCreated) onAddFirstWorker(justCreated); }}>
                {t("addCompanyDialog.addFirstWorker")}
              </Button>
            </div>
          </div>
        )}

        <div className="flex-shrink-0 border-t px-6 py-4 flex items-center justify-between gap-3">
          {step < 4 && (
            <Button variant="outline" onClick={() => step > 1 ? setStep(step - 1) : onOpenChange(false)}>
              {step > 1 ? t("addCompanyDialog.back") : t("addCompanyDialog.cancel")}
            </Button>
          )}
          {step === 4 && <div />}
          <div className="flex items-center gap-2">
            {step < 3 ? (
              <Button onClick={() => setStep(step + 1)} disabled={step === 1 && (!form.name || !form.email || !form.contactFirstName || !form.contactLastName || !form.phone)} className="bg-blue-600 hover:bg-blue-700">
                {t("addCompanyDialog.next")}
              </Button>
            ) : step === 3 ? (
              <Button onClick={() => createContractorMutation.mutate(form)} disabled={!form.name || !form.email || !form.contactFirstName || !form.contactLastName || createContractorMutation.isPending} className="bg-blue-600 hover:bg-blue-700" data-testid="button-save-contractor">
                {createContractorMutation.isPending ? t("addCompanyDialog.creating") : t("addCompanyDialog.create")}
              </Button>
            ) : null}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
