import { useState, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { User, CheckCircle, Lock, Shield, AlertTriangle, Upload } from "lucide-react";
import type { ContractorCompany } from "@shared/schema";

const BLANK_FORM = { companyId: "", firstName: "", lastName: "", email: "", phone: "", postcode: "", transportMethod: "car_diesel", rightToWork: "pending" as "valid" | "expired" | "pending", cscsCard: "", cscsStatus: "not_held" as "valid" | "expired" | "pending" | "not_held", ipafStatus: "none" as "none" | "3a" | "3b" | "1+" | "expired", asbestosAwareness: false, manualHandling: false, workingAtHeight: false, inductionCompleted: false, isActive: true };

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedContractor: ContractorCompany | null;
  customerId: string | undefined;
}

export default function ContractorAddWorkerDialog({ open, onOpenChange, selectedContractor, customerId }: Props) {
  const { toast } = useToast();
  const [step, setStep] = useState(1);
  const [form, setForm] = useState(BLANK_FORM);
  const [savedName, setSavedName] = useState("");

  useEffect(() => {
    if (selectedContractor) setForm(prev => ({ ...prev, companyId: selectedContractor.id }));
  }, [selectedContractor]);

  const reset = () => { setStep(1); setSavedName(""); setForm({ ...BLANK_FORM, companyId: selectedContractor?.id ?? "" }); };
  const handleClose = (open: boolean) => { onOpenChange(open); if (!open) reset(); };

  const createWorkerMutation = useMutation({
    mutationFn: async (data: any) => apiRequest("POST", `/api/contractors/${data.companyId}/workers`, data),
    onSuccess: (_data: any, variables: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/contractors", customerId] });
      queryClient.invalidateQueries({ queryKey: ["/api/contractors/workers/all", customerId] });
      setSavedName(`${variables.firstName} ${variables.lastName}`);
      setStep(4);
    },
    onError: (error: any) => toast({ title: "Error", description: error.message || "Failed to add worker", variant: "destructive" }),
  });

  const transportOptions = [
    { value: "car_diesel", label: "Car (Diesel)" }, { value: "car_petrol", label: "Car (Petrol)" },
    { value: "electric_car", label: "Electric Car" }, { value: "hybrid_car", label: "Hybrid Car" },
    { value: "van_diesel", label: "Van (Diesel)" }, { value: "van_petrol", label: "Van (Petrol)" },
    { value: "motorcycle", label: "Motorcycle" }, { value: "public_transport", label: "Public Transport" },
    { value: "bicycle", label: "Bicycle" }, { value: "walking", label: "Walking" },
  ];

  const step1Invalid = !form.firstName || !form.lastName || !form.email || !form.phone;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="w-[95vw] sm:max-w-2xl max-h-[92vh] flex flex-col overflow-hidden p-0">
        <div className="flex-shrink-0 px-6 pt-6 pb-4 border-b">
          <DialogTitle className="flex items-center gap-2 text-lg font-semibold mb-4">
            <User className="h-5 w-5 text-blue-600" />
            Add Worker — {selectedContractor?.name}
          </DialogTitle>
          <div className="flex items-center gap-0">
            {[{ n: 1, label: "Personal Details" }, { n: 2, label: "Right to Work & Cards" }, { n: 3, label: "Training & Review" }].map((s, i) => (
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
              <div className="space-y-2"><label className="text-sm font-medium text-slate-700 dark:text-slate-200">First Name *</label><Input value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} data-testid="input-worker-firstname" /></div>
              <div className="space-y-2"><label className="text-sm font-medium text-slate-700 dark:text-slate-200">Last Name *</label><Input value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} data-testid="input-worker-lastname" /></div>
              <div className="space-y-2"><label className="text-sm font-medium text-slate-700 dark:text-slate-200">Email Address *</label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} data-testid="input-worker-email" placeholder="e.g. worker@company.com" /></div>
              <div className="space-y-2"><label className="text-sm font-medium text-slate-700 dark:text-slate-200">Phone Number *</label><Input type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} data-testid="input-worker-phone" placeholder="e.g. 07700 900000" /></div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700 dark:text-slate-200">Home Postcode</label>
                <Input value={form.postcode} onChange={(e) => setForm({ ...form, postcode: e.target.value })} data-testid="input-worker-postcode" />
                <p className="text-xs text-slate-500 dark:text-slate-400">Used for CO2 emissions calculations</p>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700 dark:text-slate-200">Vehicle / Transport</label>
                <select value={form.transportMethod} onChange={(e) => setForm({ ...form, transportMethod: e.target.value })} data-testid="select-worker-transport" className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring appearance-none">
                  {transportOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
                <p className="text-xs text-slate-500 dark:text-slate-400">Used for CO2 emissions calculations</p>
              </div>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="overflow-y-auto flex-1 min-h-0 px-6 py-4 space-y-5">
            <div className="border rounded-lg p-4 space-y-3">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 bg-red-100 rounded-full flex items-center justify-center flex-shrink-0"><Lock className="w-3.5 h-3.5 text-red-600" /></div>
                <div><h4 className="font-semibold text-gray-900 dark:text-white text-sm">Right to Work</h4><p className="text-xs text-gray-500 dark:text-gray-400">Immigration Act 2014 — <span className="font-semibold text-red-600">Legally required before work commences</span></p></div>
              </div>
              <select value={form.rightToWork} onChange={(e) => setForm({ ...form, rightToWork: e.target.value as "valid" | "expired" | "pending" })} data-testid="select-right-to-work" className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring appearance-none">
                <option value="pending">Pending — check in progress</option>
                <option value="valid">Valid — check complete</option>
                <option value="expired">Expired — requires re-check</option>
              </select>
              {form.rightToWork === 'pending' && <div className="bg-amber-50 border border-amber-200 rounded px-3 py-2 text-xs text-amber-800">Worker cannot be permitted to work unsupervised until Right to Work is confirmed.</div>}
              {form.rightToWork === 'valid' && (
                <div className="bg-blue-50 border border-blue-200 rounded px-3 py-2 flex items-start gap-2">
                  <Upload className="w-3.5 h-3.5 text-blue-600 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-blue-800"><span className="font-semibold">Document evidence required.</span> After saving, upload a copy of the Right to Work document (e.g. passport, visa, share code confirmation) in the worker's H&S Documents tab.</p>
                </div>
              )}
              {form.rightToWork === 'expired' && <div className="bg-red-50 border border-red-200 rounded px-3 py-2 text-xs text-red-800">Right to Work has expired. A re-check must be completed before this worker can continue working.</div>}
            </div>
            <div className="border rounded-lg p-4 space-y-3">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 bg-amber-100 rounded-full flex items-center justify-center flex-shrink-0"><Shield className="w-3.5 h-3.5 text-amber-600" /></div>
                <div><h4 className="font-semibold text-gray-900 dark:text-white text-sm">CSCS Card</h4><p className="text-xs text-gray-500 dark:text-gray-400">CDM 2015 / Site policy — required on most construction sites</p></div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1"><label className="text-xs font-medium text-slate-600 dark:text-slate-300">Card Number</label><Input value={form.cscsCard} onChange={(e) => setForm({ ...form, cscsCard: e.target.value })} placeholder="e.g. CS-1234567" data-testid="input-cscs-card" /></div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-600 dark:text-slate-300">Status</label>
                  <select value={form.cscsStatus} onChange={(e) => setForm({ ...form, cscsStatus: e.target.value as "valid" | "expired" | "pending" | "not_held" })} data-testid="select-cscs-status" className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring appearance-none">
                    <option value="not_held">Not held / not applicable</option>
                    <option value="pending">Pending — awaiting verification</option>
                    <option value="valid">Valid</option>
                    <option value="expired">Expired</option>
                  </select>
                </div>
              </div>
              {form.cscsStatus === 'valid' && (
                <div className="bg-blue-50 border border-blue-200 rounded px-3 py-2 flex items-start gap-2">
                  <Upload className="w-3.5 h-3.5 text-blue-600 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-blue-800"><span className="font-semibold">Card copy required.</span> After saving, upload a scan of the CSCS card in the worker's H&S Documents tab.</p>
                </div>
              )}
            </div>
            <div className="border rounded-lg p-4 space-y-3">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 bg-amber-100 rounded-full flex items-center justify-center flex-shrink-0"><Shield className="w-3.5 h-3.5 text-amber-600" /></div>
                <div><h4 className="font-semibold text-gray-900 dark:text-white text-sm">IPAF Card</h4><p className="text-xs text-gray-500 dark:text-gray-400">PUWER / WAHR 2005 — required for MEWP operation (cherry pickers, scissor lifts)</p></div>
              </div>
              <select value={form.ipafStatus} onChange={(e) => setForm({ ...form, ipafStatus: e.target.value as "none" | "3a" | "3b" | "1+" | "expired" })} data-testid="select-ipaf-status" className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring appearance-none">
                <option value="none">Not applicable / not held</option>
                <option value="3a">3a — Mobile Vertical (scissor lifts)</option>
                <option value="3b">3b — Mobile Boom (cherry pickers)</option>
                <option value="1+">1+ — Static Vertical (push-around)</option>
                <option value="expired">Held but Expired</option>
              </select>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="overflow-y-auto flex-1 min-h-0 px-6 py-4 space-y-5">
            <div>
              <h4 className="font-semibold text-gray-900 dark:text-white text-sm mb-1">Training Certificates</h4>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">Tick only if the worker holds a valid certificate. You will be prompted to upload a copy after saving.</p>
              <div className="space-y-2">
                {[{ key: "asbestosAwareness" as const, label: "Asbestos Awareness", detail: "CAR 2012 — required for most construction and refurbishment work", testId: "checkbox-asbestos" },
                  { key: "manualHandling" as const, label: "Manual Handling", detail: "MHOR 1992 — required for all roles involving lifting or carrying", testId: "checkbox-manual-handling" },
                  { key: "workingAtHeight" as const, label: "Working at Height", detail: "WAHR 2005 — required when using ladders, scaffolding, or MEWPs", testId: "checkbox-working-height" },
                  { key: "inductionCompleted" as const, label: "Site Induction Completed", detail: "Site-specific H&S briefing completed", testId: "checkbox-induction" },
                ].map(({ key, label, detail, testId }) => (
                  <div key={key} className="border dark:border-gray-700 rounded-lg overflow-hidden">
                    <label className="flex items-start gap-3 p-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800">
                      <input type="checkbox" checked={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.checked })} className="mt-0.5 w-4 h-4 accent-green-600" data-testid={testId} />
                      <div><p className="font-medium text-sm">{label}</p><p className="text-xs text-gray-500 dark:text-gray-400">{detail}</p></div>
                    </label>
                    {form[key] && (
                      <div className="bg-blue-50 dark:bg-blue-950/30 border-t border-blue-100 dark:border-blue-900 px-3 py-2 flex items-center gap-2">
                        <Upload className="w-3.5 h-3.5 text-blue-600 flex-shrink-0" />
                        <p className="text-xs text-blue-800 dark:text-blue-300">Upload the supporting certificate in the <span className="font-semibold">H&S Documents</span> tab after saving.</p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
            <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 space-y-2">
              <h4 className="font-semibold text-gray-900 dark:text-white text-sm flex items-center gap-2"><Shield className="w-4 h-4" /> Compliance Summary</h4>
              <div className="space-y-1.5 text-sm">
                {[
                  { label: "Right to Work", badge: form.rightToWork === 'valid' ? '✅ Valid' : form.rightToWork === 'expired' ? '❌ Expired' : '⏳ Pending', cls: form.rightToWork === 'valid' ? 'bg-green-100 text-green-700' : form.rightToWork === 'expired' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700' },
                  { label: "CSCS Card", badge: form.cscsStatus === 'valid' ? '✅ Valid' : form.cscsStatus === 'expired' ? '❌ Expired' : form.cscsStatus === 'not_held' ? '— Not held' : form.cscsCard ? '⏳ Pending' : '— Not recorded', cls: form.cscsStatus === 'valid' ? 'bg-green-100 text-green-700' : form.cscsStatus === 'expired' ? 'bg-red-100 text-red-700' : form.cscsStatus === 'not_held' ? 'bg-gray-100 text-gray-500' : form.cscsCard ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-500' },
                  { label: "IPAF", badge: form.ipafStatus === 'none' ? '— Not applicable' : form.ipafStatus === 'expired' ? '❌ Expired' : `✅ ${form.ipafStatus}`, cls: form.ipafStatus === 'none' ? 'bg-gray-100 text-gray-500' : form.ipafStatus === 'expired' ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700' },
                  { label: "Asbestos Awareness", badge: form.asbestosAwareness ? '✅ Held' : '— Not recorded', cls: form.asbestosAwareness ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500' },
                  { label: "Manual Handling", badge: form.manualHandling ? '✅ Held' : '— Not recorded', cls: form.manualHandling ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500' },
                ].map(({ label, badge, cls }) => (
                  <div key={label} className="flex items-center justify-between">
                    <span className="text-gray-600 dark:text-gray-300">{label}</span>
                    <Badge className={cls}>{badge}</Badge>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="overflow-y-auto flex-1 min-h-0 px-6 py-10 flex flex-col items-center justify-center gap-5 text-center">
            <div className="w-16 h-16 bg-green-100 dark:bg-green-900/40 rounded-full flex items-center justify-center"><CheckCircle className="w-9 h-9 text-green-600" /></div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">Worker Added</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400"><span className="font-medium text-gray-800 dark:text-gray-100">{savedName}</span> has been registered to {selectedContractor?.name}.</p>
            </div>
            {(form.rightToWork === 'valid' || form.cscsStatus === 'valid' || form.asbestosAwareness || form.manualHandling || form.workingAtHeight) && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 w-full max-w-sm text-left">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold text-blue-800 mb-1">Documents still required</p>
                    <p className="text-xs text-blue-700">Open the worker profile and upload supporting documents in the <span className="font-semibold">H&S Documents</span> tab for any items marked as held or valid.</p>
                  </div>
                </div>
              </div>
            )}
            <div className="flex flex-col sm:flex-row gap-3 w-full max-w-sm">
              <Button variant="outline" className="flex-1" onClick={() => { onOpenChange(false); reset(); }}>Done</Button>
              <Button className="flex-1 bg-blue-600 hover:bg-blue-700" onClick={() => reset()}>Add Another Worker →</Button>
            </div>
          </div>
        )}

        {step < 4 && (
          <div className="flex-shrink-0 border-t px-6 py-4 flex items-center justify-between gap-3">
            <Button variant="outline" onClick={() => step > 1 ? setStep(step - 1) : onOpenChange(false)}>{step > 1 ? '← Back' : 'Cancel'}</Button>
            <div className="flex items-center gap-2">
              {step < 3 ? (
                <Button onClick={() => setStep(step + 1)} disabled={step === 1 && step1Invalid} className="bg-blue-600 hover:bg-blue-700">Next →</Button>
              ) : (
                <Button
                  onClick={() => createWorkerMutation.mutate({ ...form, companyId: selectedContractor?.id })}
                  disabled={step1Invalid || createWorkerMutation.isPending}
                  className="bg-blue-600 hover:bg-blue-700"
                  data-testid="button-save-worker"
                >
                  {createWorkerMutation.isPending ? "Saving..." : "Save Worker"}
                </Button>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
