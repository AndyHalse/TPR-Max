import { useState, useEffect } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Edit, HardHat as HardHatIcon, Trash2, Plus, Shield } from "lucide-react";
import type { ContractorCompany } from "@shared/schema";
import { useTranslation } from "react-i18next";

const BLANK_FORM = { name: "", email: "", contactFirstName: "", contactLastName: "", phone: "", address: "", postcode: "", website: "", description: "", industry: "", status: "pending" as "pending" | "approved" | "suspended" };
const BLANK_CDM = { cdmRole: "", pdProfessionalBody: "" };
const BLANK_ACCR = { typeKey: "", customName: "", certificateNumber: "", grade: "", expiryDate: "" };

function AccrStatusBadge({ status, t }: { status: string; t: Function }) {
  if (status === "expired") return <Badge className="bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300 text-xs">{t("editCompanyDialog.accreditationExpired")}</Badge>;
  if (status === "expiring_soon") return <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 text-xs">{t("editCompanyDialog.accreditationExpiringSoon")}</Badge>;
  return <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300 text-xs">{t("editCompanyDialog.accreditationValid")}</Badge>;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  company: (ContractorCompany & { [key: string]: any }) | null;
  customerId: string | undefined;
}

export default function ContractorEditCompanyDialog({ open, onOpenChange, company, customerId }: Props) {
  const { t } = useTranslation(["contractors", "common"]);
  const { toast } = useToast();
  const [form, setForm] = useState(BLANK_FORM);
  const [cdm, setCdm] = useState(BLANK_CDM);
  const [isAdding, setIsAdding] = useState(false);
  const [newAccr, setNewAccr] = useState(BLANK_ACCR);
  const [isGeneratingDesc, setIsGeneratingDesc] = useState(false);

  useEffect(() => {
    if (company && open) {
      setForm({
        name: company.name || "",
        email: (company as any).contactEmail || company.email || "",
        contactFirstName: company.contactFirstName || "",
        contactLastName: company.contactLastName || "",
        phone: (company as any).contactPhone || company.phone || "",
        address: company.address || "",
        postcode: company.postcode || "",
        website: company.website || "",
        description: company.description || "",
        industry: company.industry || "",
        status: (company.status as "pending" | "approved" | "suspended") || "pending",
      });
      setCdm({ cdmRole: company.cdmRole ?? "", pdProfessionalBody: company.pdProfessionalBody ?? "" });
      setIsAdding(false);
      setNewAccr(BLANK_ACCR);
    }
  }, [company, open]);

  const { data: accrTypes } = useQuery<any[]>({
    queryKey: ["/api/contractor-companies/accreditation-types"],
    enabled: open,
    staleTime: 60000,
  });

  const { data: accreditations, isLoading: accrLoading } = useQuery<any[]>({
    queryKey: ["/api/contractor-companies", company?.id ?? "__none__", "accreditations"],
    queryFn: async () => {
      const r = await apiRequest("GET", `/api/contractor-companies/${company!.id}/accreditations`);
      return r.json();
    },
    enabled: open && !!company?.id,
    staleTime: 0,
  });

  const invalidateAccreditations = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/contractor-companies", company?.id, "accreditations"] });
    queryClient.invalidateQueries({ queryKey: ["/api/contractor-companies/accreditations"] });
  };

  const addAccreditationMutation = useMutation({
    mutationFn: async (data: typeof BLANK_ACCR) => {
      const r = await apiRequest("POST", `/api/contractor-companies/${company!.id}/accreditations`, data);
      return r.json();
    },
    onSuccess: () => {
      invalidateAccreditations();
      setIsAdding(false);
      setNewAccr(BLANK_ACCR);
      toast({ title: t("common:success"), description: "Accreditation added" });
    },
    onError: (error: any) => toast({ title: t("common:error"), description: error.message, variant: "destructive" }),
  });

  const deleteAccreditationMutation = useMutation({
    mutationFn: async (id: string) => {
      const r = await apiRequest("DELETE", `/api/contractor-companies/${company!.id}/accreditations/${id}`);
      return r.json();
    },
    onSuccess: () => {
      invalidateAccreditations();
      toast({ title: t("common:success"), description: "Accreditation removed" });
    },
    onError: (error: any) => toast({ title: t("common:error"), description: error.message, variant: "destructive" }),
  });

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

  const updateContractorMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => apiRequest("PUT", `/api/contractors/${id}`, data),
    onSuccess: () => {
      toast({ title: t("common:success"), description: t("editCompanyDialog.updateSuccess") });
      queryClient.invalidateQueries({ queryKey: ["/api/contractors", customerId] });
      onOpenChange(false);
    },
    onError: (error: any) => toast({ title: t("common:error"), description: error.message || t("editCompanyDialog.updateFailed"), variant: "destructive" }),
  });

  const updateCdmMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => apiRequest("PATCH", `/api/contractors/${id}`, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/contractors", customerId] }),
  });

  const handleSave = () => {
    if (!company) return;
    updateContractorMutation.mutate({ id: company.id, data: form });
    updateCdmMutation.mutate({ id: company.id, data: cdm });
  };

  const handleGenerateDescription = () => {
    if (!form.website || !form.name) { toast({ title: t("common:error"), description: t("addCompanyDialog.missingInfo"), variant: "destructive" }); return; }
    setIsGeneratingDesc(true);
    generateDescriptionMutation.mutate({ website: form.website, companyName: form.name, industry: form.industry || undefined });
  };

  const selectedType = accrTypes?.find(at => at.key === newAccr.typeKey);
  const industryOptions = ["construction","electrical","plumbing","hvac","roofing","painting","landscaping","security","cleaning","it","catering","other"];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Edit className="h-5 w-5" />{t("editCompanyDialog.title")}</DialogTitle>
          <DialogDescription>{t("editCompanyDialog.editDesc")}</DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 py-4">
          <div className="space-y-2"><label className="text-sm font-medium text-slate-700 dark:text-slate-200">{t("addCompanyDialog.companyName")}</label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} data-testid="input-edit-company-name" /></div>
          <div className="space-y-2"><label className="text-sm font-medium text-slate-700 dark:text-slate-200">{t("addCompanyDialog.contactFirstName")}</label><Input value={form.contactFirstName} onChange={(e) => setForm({ ...form, contactFirstName: e.target.value })} data-testid="input-edit-contact-first-name" /></div>
          <div className="space-y-2"><label className="text-sm font-medium text-slate-700 dark:text-slate-200">{t("addCompanyDialog.contactLastName")}</label><Input value={form.contactLastName} onChange={(e) => setForm({ ...form, contactLastName: e.target.value })} data-testid="input-edit-contact-last-name" /></div>
          <div className="space-y-2"><label className="text-sm font-medium text-slate-700 dark:text-slate-200">{t("addCompanyDialog.emailAddress")}</label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} data-testid="input-edit-email" /></div>
          <div className="space-y-2"><label className="text-sm font-medium text-slate-700 dark:text-slate-200">{t("addCompanyDialog.phoneNumber")}</label><Input type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} data-testid="input-edit-phone" /></div>
          <div className="space-y-2"><label className="text-sm font-medium text-slate-700 dark:text-slate-200">{t("addCompanyDialog.postcode")}</label><Input value={form.postcode} onChange={(e) => setForm({ ...form, postcode: e.target.value })} data-testid="input-edit-postcode" /></div>
          <div className="col-span-2 space-y-2"><label className="text-sm font-medium text-slate-700 dark:text-slate-200">{t("addCompanyDialog.address")}</label><Textarea value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} data-testid="input-edit-address" rows={2} /></div>
          <div className="space-y-2"><label className="text-sm font-medium text-slate-700 dark:text-slate-200">{t("addCompanyDialog.website")}</label><Input value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} data-testid="input-edit-website" /></div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700 dark:text-slate-200">{t("addCompanyDialog.industry")}</label>
            <select value={form.industry} onChange={(e) => setForm({ ...form, industry: e.target.value })} data-testid="select-edit-industry" className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring appearance-none">
              <option value="">{t("addCompanyDialog.selectIndustry")}</option>
              {industryOptions.map(o => <option key={o} value={o}>{t(`addCompanyDialog.industries.${o}`)}</option>)}
            </select>
          </div>
          <div className="col-span-2 space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-200">{t("addCompanyDialog.description")}</label>
              <Button type="button" variant="outline" size="sm" onClick={handleGenerateDescription} disabled={isGeneratingDesc || !form.website || !form.name} className="text-xs" data-testid="button-edit-generate-description">
                {isGeneratingDesc ? t("addCompanyDialog.generating") : t("addCompanyDialog.autoFillWithAI")}
              </Button>
            </div>
            <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} data-testid="input-edit-description" rows={2} />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700 dark:text-slate-200">{t("editCompanyDialog.status")}</label>
            <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as "pending" | "approved" | "suspended" })} data-testid="select-edit-status" className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring appearance-none">
              <option value="pending">{t("editCompanyDialog.reviewStatus")}</option>
              <option value="approved">{t("editCompanyDialog.approved")}</option>
              <option value="suspended">{t("editCompanyDialog.suspended")}</option>
            </select>
          </div>
        </div>

        {/* CDM 2015 */}
        <div className="border-t pt-4 mt-2">
          <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-2 mb-3">
            <HardHatIcon className="h-4 w-4 text-amber-600" />{t("editCompanyDialog.cdmAccreditations")}
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-700 dark:text-slate-300">{t("editCompanyDialog.cdmRole")}</label>
              <select value={cdm.cdmRole} onChange={e => setCdm({ ...cdm, cdmRole: e.target.value })} className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring appearance-none">
                <option value="">{t("editCompanyDialog.notSpecified")}</option>
                <option value="principal_contractor">{t("editCompanyDialog.principalContractor")}</option>
                <option value="principal_designer">{t("editCompanyDialog.principalDesigner")}</option>
                <option value="contractor">{t("editCompanyDialog.contractor")}</option>
                <option value="designer">{t("editCompanyDialog.designer")}</option>
                <option value="client">{t("editCompanyDialog.client")}</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-700 dark:text-slate-300">{t("editCompanyDialog.pdBody")}</label>
              <Input className="h-9 text-sm" value={cdm.pdProfessionalBody} onChange={e => setCdm({ ...cdm, pdProfessionalBody: e.target.value })} placeholder={t("editCompanyDialog.pdBodyPlaceholder")} />
            </div>
          </div>
        </div>

        {/* SSIP & Accreditations */}
        <div className="border-t pt-4 mt-2">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-2">
              <Shield className="h-4 w-4 text-teal-600" />{t("editCompanyDialog.accreditationsTitle")}
            </h4>
            <Button size="sm" variant="outline" className="text-xs h-7" onClick={() => { setIsAdding(true); setNewAccr(BLANK_ACCR); }} disabled={isAdding}>
              <Plus className="h-3 w-3 mr-1" />{t("editCompanyDialog.addAccreditation")}
            </Button>
          </div>

          {accrLoading ? (
            <p className="text-xs text-slate-400 py-2">Loading…</p>
          ) : (accreditations ?? []).length === 0 && !isAdding ? (
            <p className="text-xs text-slate-400 italic py-2">{t("editCompanyDialog.noAccreditations")}</p>
          ) : (
            <div className="space-y-2">
              {(accreditations ?? []).map((accr: any) => (
                <div key={accr.id} className="flex items-center justify-between gap-2 rounded-md border border-input px-3 py-2 text-sm bg-background">
                  <div className="flex items-center gap-2 flex-wrap min-w-0">
                    <span className="font-medium text-slate-800 dark:text-slate-100 truncate">
                      {accr.type_key === "other" ? (accr.custom_name || "Other") : accr.type_name}
                    </span>
                    {accr.is_ssip_member && (
                      <TooltipProvider delayDuration={400}>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Badge className="bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-300 text-xs cursor-default">SSIP</Badge>
                          </TooltipTrigger>
                          <TooltipContent className="max-w-xs text-xs">{t("editCompanyDialog.ssipTooltip")}</TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    )}
                    {accr.grade && <span className="text-xs text-slate-500">{t("editCompanyDialog.grade")}: <strong>{accr.grade}</strong></span>}
                    {accr.certificate_number && <span className="text-xs text-slate-400">#{accr.certificate_number}</span>}
                    {accr.expiry_date && <span className="text-xs text-slate-400">{t("editCompanyDialog.expiryDate")}: {accr.expiry_date}</span>}
                    <AccrStatusBadge status={accr.status} t={t} />
                  </div>
                  <Button size="icon" variant="ghost" className="h-7 w-7 text-red-500 hover:text-red-700 hover:bg-red-50 shrink-0"
                    onClick={() => deleteAccreditationMutation.mutate(accr.id)}
                    disabled={deleteAccreditationMutation.isPending}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          )}

          {isAdding && (
            <div className="mt-3 rounded-md border border-teal-200 bg-teal-50 dark:bg-teal-950/20 dark:border-teal-800 p-3 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-700 dark:text-slate-300">{t("editCompanyDialog.scheme")} *</label>
                  <select
                    value={newAccr.typeKey}
                    onChange={e => setNewAccr({ ...BLANK_ACCR, typeKey: e.target.value })}
                    className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring appearance-none"
                  >
                    <option value="">— select scheme —</option>
                    {(accrTypes ?? []).map((at: any) => (
                      <option key={at.key} value={at.key}>{at.name}{at.is_ssip_member ? " (SSIP)" : ""}</option>
                    ))}
                  </select>
                </div>
                {newAccr.typeKey === "other" && (
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-slate-700 dark:text-slate-300">{t("editCompanyDialog.schemeName")}</label>
                    <Input className="h-9 text-sm" value={newAccr.customName} onChange={e => setNewAccr({ ...newAccr, customName: e.target.value })} placeholder={t("editCompanyDialog.schemeName")} />
                  </div>
                )}
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-700 dark:text-slate-300">{t("editCompanyDialog.certificateNumber")}</label>
                  <Input className="h-9 text-sm" value={newAccr.certificateNumber} onChange={e => setNewAccr({ ...newAccr, certificateNumber: e.target.value })} placeholder="e.g. CHAS-12345" />
                </div>
                {selectedType?.has_grade && (
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-slate-700 dark:text-slate-300">{t("editCompanyDialog.grade")}</label>
                    <select value={newAccr.grade} onChange={e => setNewAccr({ ...newAccr, grade: e.target.value })} className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring appearance-none">
                      <option value="">— select grade —</option>
                      <option value="registered">Registered</option>
                      <option value="silver">Silver</option>
                      <option value="gold">Gold</option>
                      <option value="platinum">Platinum</option>
                    </select>
                  </div>
                )}
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-700 dark:text-slate-300">{t("editCompanyDialog.expiryDate")}</label>
                  <Input type="date" className="h-9 text-sm" value={newAccr.expiryDate} onChange={e => setNewAccr({ ...newAccr, expiryDate: e.target.value })} />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button size="sm" className="h-8 text-xs bg-teal-600 hover:bg-teal-700"
                  disabled={!newAccr.typeKey || addAccreditationMutation.isPending}
                  onClick={() => addAccreditationMutation.mutate(newAccr)}>
                  {addAccreditationMutation.isPending ? "…" : t("editCompanyDialog.saveAccreditation")}
                </Button>
                <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => { setIsAdding(false); setNewAccr(BLANK_ACCR); }}>
                  {t("editCompanyDialog.cancelAdd")}
                </Button>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} data-testid="button-cancel-edit">{t("common:cancel")}</Button>
          <Button onClick={handleSave} disabled={!form.name || !form.email || !form.contactFirstName || !form.contactLastName || updateContractorMutation.isPending} className="bg-blue-600 hover:bg-blue-700" data-testid="button-update-contractor">
            {updateContractorMutation.isPending ? t("editCompanyDialog.updating") : t("editCompanyDialog.updateContractor")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
