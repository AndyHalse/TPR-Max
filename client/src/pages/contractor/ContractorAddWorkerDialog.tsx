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
import { useTranslation, Trans } from "react-i18next";

const BLANK_FORM = { companyId: "", firstName: "", lastName: "", email: "", phone: "", postcode: "", transportMethod: "", rightToWork: "pending" as "valid" | "expired" | "pending", cscsCard: "", cscsStatus: "not_held" as "valid" | "expired" | "pending" | "not_held", ipafStatus: "none" as "none" | "3a" | "3b" | "1+" | "expired", asbestosAwareness: false, manualHandling: false, workingAtHeight: false, inductionCompleted: false, isActive: true };

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedContractor: ContractorCompany | null;
  customerId: string | undefined;
}

export default function ContractorAddWorkerDialog({ open, onOpenChange, selectedContractor, customerId }: Props) {
  const { t } = useTranslation(["contractors", "common"]);
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
    onError: (error: any) => toast({ title: t("common:error"), description: error.message || t("addWorkerDialog.addFailed") || "Failed to add worker", variant: "destructive" }),
  });

  const transportOptions = [
    { value: "car_diesel", label: t("contractors:addWorkerDialog.transport.car_diesel") }, { value: "car_petrol", label: t("contractors:addWorkerDialog.transport.car_petrol") },
    { value: "electric_car", label: t("contractors:addWorkerDialog.transport.electric_car") }, { value: "hybrid_car", label: t("contractors:addWorkerDialog.transport.hybrid_car") },
    { value: "van_diesel", label: t("contractors:addWorkerDialog.transport.van_diesel") }, { value: "van_petrol", label: t("contractors:addWorkerDialog.transport.van_petrol") },
    { value: "motorcycle", label: t("contractors:addWorkerDialog.transport.motorcycle") }, { value: "public_transport", label: t("contractors:addWorkerDialog.transport.public_transport") },
    { value: "bicycle", label: t("contractors:addWorkerDialog.transport.bicycle") }, { value: "walking", label: t("contractors:addWorkerDialog.transport.walking") },
  ];

  const step1Invalid = !form.firstName || !form.lastName || !form.email || !form.phone;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="w-[95vw] sm:max-w-2xl max-h-[92vh] flex flex-col overflow-hidden p-0">
        <div className="flex-shrink-0 px-6 pt-6 pb-4 border-b">
          <DialogTitle className="flex items-center gap-2 text-lg font-semibold mb-4">
            <User className="h-5 w-5 text-blue-600" />
            {t("addWorkerDialog.title", { company: selectedContractor?.name })}
          </DialogTitle>
          <div className="flex items-center gap-0">
            {[{ n: 1, label: t("addWorkerDialog.personalDetails") }, { n: 2, label: t("addWorkerDialog.rtwCards") }, { n: 3, label: t("addWorkerDialog.trainingReview") }].map((s, i) => (
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
              <div className="space-y-2"><label className="text-sm font-medium text-slate-700 dark:text-slate-200">{t("addWorkerDialog.firstName")}</label><Input value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} data-testid="input-worker-firstname" /></div>
              <div className="space-y-2"><label className="text-sm font-medium text-slate-700 dark:text-slate-200">{t("addWorkerDialog.lastName")}</label><Input value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} data-testid="input-worker-lastname" /></div>
              <div className="space-y-2"><label className="text-sm font-medium text-slate-700 dark:text-slate-200">{t("addWorkerDialog.emailAddress")}</label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} data-testid="input-worker-email" placeholder="e.g. worker@company.com" /></div>
              <div className="space-y-2"><label className="text-sm font-medium text-slate-700 dark:text-slate-200">{t("addWorkerDialog.phoneNumber")}</label><Input type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} data-testid="input-worker-phone" placeholder="e.g. 07700 900000" /></div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700 dark:text-slate-200">{t("addWorkerDialog.homePostcode")}</label>
                <Input value={form.postcode} onChange={(e) => setForm({ ...form, postcode: e.target.value })} data-testid="input-worker-postcode" />
                <p className="text-xs text-slate-500 dark:text-slate-400">{t("addWorkerDialog.co2CalcInfo")}</p>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700 dark:text-slate-200">{t("addWorkerDialog.vehicleTransport")}</label>
                <select value={form.transportMethod} onChange={(e) => setForm({ ...form, transportMethod: e.target.value })} data-testid="select-worker-transport" className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring appearance-none">
                  <option value="">{t("addWorkerDialog.selectTransport")}</option>
                  {transportOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
                <p className="text-xs text-slate-500 dark:text-slate-400">{t("addWorkerDialog.co2CalcInfo")}</p>
              </div>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="overflow-y-auto flex-1 min-h-0 px-6 py-4 space-y-5">
            <div className="border rounded-lg p-4 space-y-3">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 bg-red-100 rounded-full flex items-center justify-center flex-shrink-0"><Lock className="w-3.5 h-3.5 text-red-600" /></div>
                <div>
                  <h4 className="font-semibold text-gray-900 dark:text-white text-sm">{t("addWorkerDialog.rtw")}</h4>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    <Trans i18nKey="contractors:addWorkerDialog.rtwInfo" components={[<span className="font-semibold text-red-600" />]} />
                  </p>
                </div>
              </div>
              <select value={form.rightToWork} onChange={(e) => setForm({ ...form, rightToWork: e.target.value as "valid" | "expired" | "pending" })} data-testid="select-right-to-work" className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring appearance-none">
                <option value="pending">{t("addWorkerDialog.rtwPending")}</option>
                <option value="valid">{t("addWorkerDialog.rtwValid")}</option>
                <option value="expired">{t("addWorkerDialog.rtwExpired")}</option>
              </select>
              {form.rightToWork === 'pending' && <div className="bg-amber-50 border border-amber-200 rounded px-3 py-2 text-xs text-amber-800">{t("addWorkerDialog.rtwPendingWarning")}</div>}
              {form.rightToWork === 'valid' && (
                <div className="bg-blue-50 border border-blue-200 rounded px-3 py-2 flex items-start gap-2">
                  <Upload className="w-3.5 h-3.5 text-blue-600 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-blue-800">
                    <Trans i18nKey="contractors:addWorkerDialog.docEvidenceRequired" components={[<span className="font-semibold" />]} />
                  </p>
                </div>
              )}
              {form.rightToWork === 'expired' && <div className="bg-red-50 border border-red-200 rounded px-3 py-2 text-xs text-red-800">{t("addWorkerDialog.rtwExpiredWarning")}</div>}
            </div>
            <div className="border rounded-lg p-4 space-y-3">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 bg-amber-100 rounded-full flex items-center justify-center flex-shrink-0"><Shield className="w-3.5 h-3.5 text-amber-600" /></div>
                <div><h4 className="font-semibold text-gray-900 dark:text-white text-sm">{t("addWorkerDialog.cscsCard")}</h4><p className="text-xs text-gray-500 dark:text-gray-400">{t("addWorkerDialog.cscsInfo")}</p></div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1"><label className="text-xs font-medium text-slate-600 dark:text-slate-300">{t("addWorkerDialog.cardNumber")}</label><Input value={form.cscsCard} onChange={(e) => setForm({ ...form, cscsCard: e.target.value })} placeholder="e.g. CS-1234567" data-testid="input-cscs-card" /></div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-600 dark:text-slate-300">{t("common:status")}</label>
                  <select value={form.cscsStatus} onChange={(e) => setForm({ ...form, cscsStatus: e.target.value as "valid" | "expired" | "pending" | "not_held" })} data-testid="select-cscs-status" className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring appearance-none">
                    <option value="not_held">{t("addWorkerDialog.cscsNotHeld")}</option>
                    <option value="pending">{t("addWorkerDialog.cscsPending")}</option>
                    <option value="valid">{t("badges.valid")}</option>
                    <option value="expired">{t("badges.expired")}</option>
                  </select>
                </div>
              </div>
              {form.cscsStatus === 'valid' && (
                <div className="bg-blue-50 border border-blue-200 rounded px-3 py-2 flex items-start gap-2">
                  <Upload className="w-3.5 h-3.5 text-blue-600 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-blue-800">
                    <Trans i18nKey="contractors:addWorkerDialog.cardCopyRequired" components={[<span className="font-semibold" />]} />
                  </p>
                </div>
              )}
            </div>
            <div className="border rounded-lg p-4 space-y-3">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 bg-amber-100 rounded-full flex items-center justify-center flex-shrink-0"><Shield className="w-3.5 h-3.5 text-amber-600" /></div>
                <div><h4 className="font-semibold text-gray-900 dark:text-white text-sm">{t("addWorkerDialog.ipafCard")}</h4><p className="text-xs text-gray-500 dark:text-gray-400">{t("addWorkerDialog.ipafInfo")}</p></div>
              </div>
              <select value={form.ipafStatus} onChange={(e) => setForm({ ...form, ipafStatus: e.target.value as "none" | "3a" | "3b" | "1+" | "expired" })} data-testid="select-ipaf-status" className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring appearance-none">
                <option value="none">{t("addWorkerDialog.ipafNone")}</option>
                <option value="3a">{t("addWorkerDialog.ipaf3a")}</option>
                <option value="3b">{t("addWorkerDialog.ipaf3b")}</option>
                <option value="1+">{t("addWorkerDialog.ipaf1plus")}</option>
                <option value="expired">{t("addWorkerDialog.ipafExpired")}</option>
              </select>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="overflow-y-auto flex-1 min-h-0 px-6 py-4 space-y-5">
            <div>
              <h4 className="font-semibold text-gray-900 dark:text-white text-sm mb-1">{t("addWorkerDialog.trainingCerts")}</h4>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">{t("addWorkerDialog.trainingTickInfo")}</p>
              <div className="space-y-2">
                {[{ key: "asbestosAwareness" as const, label: t("contractors:addWorkerDialog.training.asbestos.label"), detail: t("contractors:addWorkerDialog.training.asbestos.detail"), testId: "checkbox-asbestos" },
                  { key: "manualHandling" as const, label: t("contractors:addWorkerDialog.training.manualHandling.label"), detail: t("contractors:addWorkerDialog.training.manualHandling.detail"), testId: "checkbox-manual-handling" },
                  { key: "workingAtHeight" as const, label: t("contractors:addWorkerDialog.training.workingAtHeight.label"), detail: t("contractors:addWorkerDialog.training.workingAtHeight.detail"), testId: "checkbox-working-height" },
                  { key: "inductionCompleted" as const, label: t("contractors:addWorkerDialog.training.induction.label"), detail: t("contractors:addWorkerDialog.training.induction.detail"), testId: "checkbox-induction" },
                ].map(({ key, label, detail, testId }) => (
                  <div key={key} className="border dark:border-gray-700 rounded-lg overflow-hidden">
                    <label className="flex items-start gap-3 p-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800">
                      <input type="checkbox" checked={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.checked })} className="mt-0.5 w-4 h-4 accent-green-600" data-testid={testId} />
                      <div><p className="font-medium text-sm">{label}</p><p className="text-xs text-gray-500 dark:text-gray-400">{detail}</p></div>
                    </label>
                    {form[key] && (
                      <div className="bg-blue-50 dark:bg-blue-950/30 border-t border-blue-100 dark:border-blue-900 px-3 py-2 flex items-center gap-2">
                        <Upload className="w-3.5 h-3.5 text-blue-600 flex-shrink-0" />
                        <p className="text-xs text-blue-800 dark:text-blue-300">
                          <Trans i18nKey="contractors:addWorkerDialog.uploadSupporting" components={[<span className="font-semibold" />]} />
                        </p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
            <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 space-y-2">
              <h4 className="font-semibold text-gray-900 dark:text-white text-sm flex items-center gap-2"><Shield className="w-4 h-4" /> {t("addWorkerDialog.complianceSummary")}</h4>
              <div className="space-y-1.5 text-sm">
                {[
                  { label: t("addWorkerDialog.rtw"), badge: form.rightToWork === 'valid' ? `✅ ${t("badges.valid")}` : form.rightToWork === 'expired' ? `❌ ${t("badges.expired")}` : `⏳ ${t("badges.pending")}`, cls: form.rightToWork === 'valid' ? 'bg-green-100 text-green-700' : form.rightToWork === 'expired' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700' },
                  { label: t("addWorkerDialog.cscsCard"), badge: form.cscsStatus === 'valid' ? `✅ ${t("badges.valid")}` : form.cscsStatus === 'expired' ? `❌ ${t("badges.expired")}` : form.cscsStatus === 'not_held' ? `— ${t("badges.notHeld")}` : form.cscsCard ? `⏳ ${t("badges.pending")}` : `— ${t("common:notSet")}`, cls: form.cscsStatus === 'valid' ? 'bg-green-100 text-green-700' : form.cscsStatus === 'expired' ? 'bg-red-100 text-red-700' : form.cscsStatus === 'not_held' ? 'bg-gray-100 text-gray-500' : form.cscsCard ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-500' },
                  { label: "IPAF", badge: form.ipafStatus === 'none' ? `— ${t("common:none")}` : form.ipafStatus === 'expired' ? `❌ ${t("badges.expired")}` : `✅ ${form.ipafStatus}`, cls: form.ipafStatus === 'none' ? 'bg-gray-100 text-gray-500' : form.ipafStatus === 'expired' ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700' },
                  { label: t("contractors:addWorkerDialog.training.asbestos.label"), badge: form.asbestosAwareness ? `✅ ${t("common:active")}` : `— ${t("common:notSet")}`, cls: form.asbestosAwareness ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500' },
                  { label: t("contractors:addWorkerDialog.training.manualHandling.label"), badge: form.manualHandling ? `✅ ${t("common:active")}` : `— ${t("common:notSet")}`, cls: form.manualHandling ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500' },
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
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">{t("addWorkerDialog.workerAdded")}</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                <Trans i18nKey="contractors:addWorkerDialog.workerRegistered" values={{ name: savedName, company: selectedContractor?.name }} components={[<span className="font-medium text-gray-800 dark:text-gray-100" />]} />
              </p>
            </div>
            {(form.rightToWork === 'valid' || form.cscsStatus === 'valid' || form.asbestosAwareness || form.manualHandling || form.workingAtHeight) && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 w-full max-w-sm text-left">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold text-blue-800 mb-1">{t("addWorkerDialog.docsStillRequired")}</p>
                    <p className="text-xs text-blue-700">
                      <Trans i18nKey="contractors:addWorkerDialog.docsStillRequiredInfo" components={[<span className="font-semibold" />]} />
                    </p>
                  </div>
                </div>
              </div>
            )}
            <div className="flex flex-col sm:flex-row gap-3 w-full max-w-sm">
              <Button variant="outline" className="flex-1" onClick={() => { onOpenChange(false); reset(); }}>{t("addWorkerDialog.done")}</Button>
              <Button className="flex-1 bg-blue-600 hover:bg-blue-700" onClick={() => reset()}>{t("addWorkerDialog.addAnother")}</Button>
            </div>
          </div>
        )}

        {step < 4 && (
          <div className="flex-shrink-0 border-t px-6 py-4 flex items-center justify-between gap-3">
            <Button variant="outline" onClick={() => step > 1 ? setStep(step - 1) : onOpenChange(false)}>{step > 1 ? t("addCompanyDialog.back") : t("common:cancel")}</Button>
            <div className="flex items-center gap-2">
              {step < 3 ? (
                <Button onClick={() => setStep(step + 1)} disabled={step === 1 && step1Invalid} className="bg-blue-600 hover:bg-blue-700">{t("addCompanyDialog.next")}</Button>
              ) : (
                <Button
                  onClick={() => createWorkerMutation.mutate({ ...form, companyId: selectedContractor?.id })}
                  disabled={step1Invalid || createWorkerMutation.isPending}
                  className="bg-blue-600 hover:bg-blue-700"
                  data-testid="button-save-worker"
                >
                  {createWorkerMutation.isPending ? t("addWorkerDialog.saving") : t("addWorkerDialog.saveWorker")}
                </Button>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
