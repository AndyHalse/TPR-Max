import { useState, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Edit, HardHat as HardHatIcon } from "lucide-react";
import type { ContractorCompany } from "@shared/schema";

const BLANK_FORM = { name: "", email: "", contactFirstName: "", contactLastName: "", phone: "", address: "", postcode: "", website: "", description: "", industry: "", status: "pending" as "pending" | "approved" | "suspended" };
const BLANK_CDM = { cdmRole: "", constructionlineGrade: "", chasCertified: false, smasAccredited: false, otherAccreditations: "", pdProfessionalBody: "" };

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  company: (ContractorCompany & { [key: string]: any }) | null;
  customerId: string | undefined;
}

export default function ContractorEditCompanyDialog({ open, onOpenChange, company, customerId }: Props) {
  const { toast } = useToast();
  const [form, setForm] = useState(BLANK_FORM);
  const [cdm, setCdm] = useState(BLANK_CDM);
  const [isGeneratingDesc, setIsGeneratingDesc] = useState(false);

  useEffect(() => {
    if (company && open) {
      setForm({
        name: company.name || "",
        email: company.email || "",
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
      setCdm({
        cdmRole: company.cdmRole ?? "",
        constructionlineGrade: company.constructionlineGrade ?? "",
        chasCertified: company.chasCertified ?? false,
        smasAccredited: company.smasAccredited ?? false,
        otherAccreditations: company.otherAccreditations ?? "",
        pdProfessionalBody: company.pdProfessionalBody ?? "",
      });
    }
  }, [company, open]);

  const generateDescriptionMutation = useMutation({
    mutationFn: async (data: { website: string; companyName: string; industry?: string }) => {
      const response = await apiRequest("POST", "/api/contractors/generate-description", data);
      return await response.json();
    },
    onSuccess: (response: { description: string }) => {
      setForm(prev => ({ ...prev, description: response.description }));
      toast({ title: "Success", description: "Company description generated successfully" });
    },
    onError: (error: any) => toast({ title: "Error", description: error.message || "Failed to generate description", variant: "destructive" }),
    onSettled: () => setIsGeneratingDesc(false),
  });

  const handleGenerateDescription = () => {
    if (!form.website || !form.name) { toast({ title: "Missing Information", description: "Please enter company name and website first", variant: "destructive" }); return; }
    setIsGeneratingDesc(true);
    generateDescriptionMutation.mutate({ website: form.website, companyName: form.name, industry: form.industry || undefined });
  };

  const updateContractorMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => apiRequest("PUT", `/api/contractors/${id}`, data),
    onSuccess: () => {
      toast({ title: "Success", description: "Contractor company updated successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/contractors", customerId] });
      onOpenChange(false);
    },
    onError: (error: any) => toast({ title: "Error", description: error.message || "Failed to update contractor", variant: "destructive" }),
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

  const industryOptions = ["construction","electrical","plumbing","hvac","roofing","painting","landscaping","security","cleaning","it","catering","other"];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Edit className="h-5 w-5" />Edit Contractor Company</DialogTitle>
          <DialogDescription>Update contractor company details and service information.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 py-4">
          <div className="space-y-2"><label className="text-sm font-medium text-slate-700 dark:text-slate-200">Company Name *</label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} data-testid="input-edit-company-name" /></div>
          <div className="space-y-2"><label className="text-sm font-medium text-slate-700 dark:text-slate-200">Contact First Name *</label><Input value={form.contactFirstName} onChange={(e) => setForm({ ...form, contactFirstName: e.target.value })} data-testid="input-edit-contact-first-name" /></div>
          <div className="space-y-2"><label className="text-sm font-medium text-slate-700 dark:text-slate-200">Contact Last Name *</label><Input value={form.contactLastName} onChange={(e) => setForm({ ...form, contactLastName: e.target.value })} data-testid="input-edit-contact-last-name" /></div>
          <div className="space-y-2"><label className="text-sm font-medium text-slate-700 dark:text-slate-200">Email Address *</label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} data-testid="input-edit-email" /></div>
          <div className="space-y-2"><label className="text-sm font-medium text-slate-700 dark:text-slate-200">Phone Number *</label><Input type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} data-testid="input-edit-phone" /></div>
          <div className="space-y-2"><label className="text-sm font-medium text-slate-700 dark:text-slate-200">Postcode</label><Input value={form.postcode} onChange={(e) => setForm({ ...form, postcode: e.target.value })} data-testid="input-edit-postcode" /></div>
          <div className="col-span-2 space-y-2"><label className="text-sm font-medium text-slate-700 dark:text-slate-200">Address *</label><Textarea value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} data-testid="input-edit-address" rows={2} /></div>
          <div className="space-y-2"><label className="text-sm font-medium text-slate-700 dark:text-slate-200">Website</label><Input value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} data-testid="input-edit-website" /></div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700 dark:text-slate-200">Industry</label>
            <select value={form.industry} onChange={(e) => setForm({ ...form, industry: e.target.value })} data-testid="select-edit-industry" className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring appearance-none">
              <option value="">Select industry</option>
              {industryOptions.map(o => <option key={o} value={o}>{o.charAt(0).toUpperCase() + o.slice(1)}</option>)}
            </select>
          </div>
          <div className="col-span-2 space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-200">Description</label>
              <Button type="button" variant="outline" size="sm" onClick={handleGenerateDescription} disabled={isGeneratingDesc || !form.website || !form.name} className="text-xs" data-testid="button-edit-generate-description">
                {isGeneratingDesc ? <>🤖 Generating...</> : <>🤖 Auto-fill with AI</>}
              </Button>
            </div>
            <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} data-testid="input-edit-description" rows={2} />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700 dark:text-slate-200">Status</label>
            <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as "pending" | "approved" | "suspended" })} data-testid="select-edit-status" className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring appearance-none">
              <option value="pending">Pending Review</option>
              <option value="approved">Approved</option>
              <option value="suspended">Suspended</option>
            </select>
          </div>
        </div>

        <div className="border-t pt-4 mt-2">
          <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-2 mb-3">
            <HardHatIcon className="h-4 w-4 text-amber-600" />CDM 2015 & Accreditations
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-700 dark:text-slate-300">CDM Duty Holder Role</label>
              <select value={cdm.cdmRole} onChange={e => setCdm({ ...cdm, cdmRole: e.target.value })} className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring appearance-none">
                <option value="">Not specified</option>
                <option value="principal_contractor">Principal Contractor</option>
                <option value="principal_designer">Principal Designer</option>
                <option value="contractor">Contractor</option>
                <option value="designer">Designer</option>
                <option value="client">Client</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-700 dark:text-slate-300">Constructionline Grade</label>
              <select value={cdm.constructionlineGrade} onChange={e => setCdm({ ...cdm, constructionlineGrade: e.target.value })} className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring appearance-none">
                <option value="">Not Registered</option>
                <option value="registered">Registered</option>
                <option value="silver">Silver</option>
                <option value="gold">Gold</option>
                <option value="platinum">Platinum</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-700 dark:text-slate-300">CHAS</label>
              <label className="flex items-center gap-2 cursor-pointer text-sm h-9 border border-input rounded-md px-3">
                <input type="checkbox" className="h-4 w-4" checked={cdm.chasCertified} onChange={e => setCdm({ ...cdm, chasCertified: e.target.checked })} />
                CHAS Certified
              </label>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-700 dark:text-slate-300">SMAS Worksafe</label>
              <label className="flex items-center gap-2 cursor-pointer text-sm h-9 border border-input rounded-md px-3">
                <input type="checkbox" className="h-4 w-4" checked={cdm.smasAccredited} onChange={e => setCdm({ ...cdm, smasAccredited: e.target.checked })} />
                SMAS Accredited
              </label>
            </div>
            <div className="col-span-2 space-y-1.5">
              <label className="text-xs font-medium text-slate-700 dark:text-slate-300">Other Accreditations (e.g. CHAS, Acclaim, SafeContractor)</label>
              <Input className="h-9 text-sm" value={cdm.otherAccreditations} onChange={e => setCdm({ ...cdm, otherAccreditations: e.target.value })} placeholder="e.g. CHAS Premium, SafeContractor approved…" />
            </div>
            <div className="col-span-2 space-y-1.5">
              <label className="text-xs font-medium text-slate-700 dark:text-slate-300">Principal Designer Professional Body (if applicable)</label>
              <Input className="h-9 text-sm" value={cdm.pdProfessionalBody} onChange={e => setCdm({ ...cdm, pdProfessionalBody: e.target.value })} placeholder="e.g. RIBA, ARB, ICE, CIOB…" />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} data-testid="button-cancel-edit">Cancel</Button>
          <Button onClick={handleSave} disabled={!form.name || !form.email || !form.contactFirstName || !form.contactLastName || updateContractorMutation.isPending} className="bg-blue-600 hover:bg-blue-700" data-testid="button-update-contractor">
            {updateContractorMutation.isPending ? "Updating..." : "Update Contractor"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
