import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Camera, Mail, Phone, History, Clock, Edit, QrCode, CalendarPlus, LogIn, LogOut, Send, Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";

const PHOTO_INPUT_ID = "worker-photo-upload-input";

interface Props {
  worker: any | null;
  onClose: () => void;
  checkInMutation: any;
  checkOutMutation: any;
  onEditWorker: (worker: any, companyName: string) => void;
  onQrPass: (worker: any) => void;
  onPreBook: (worker: any, companyName: string) => void;
  onCheckIn: (worker: any, companyName: string) => void;
}

export default function ContractorWorkerProfileDialog({ worker, onClose, checkInMutation, checkOutMutation, onEditWorker, onQrPass, onPreBook, onCheckIn }: Props) {
  const { t, i18n } = useTranslation(["contractors", "common"]);
  const { toast } = useToast();
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [localPhotoUrl, setLocalPhotoUrl] = useState<string | null>(null);

  const updateWorkerPhotoMutation = useMutation({
    mutationFn: async ({ workerId, photoUrl }: { workerId: string; photoUrl: string }) => {
      const response = await apiRequest("PUT", `/api/contractors/workers/${workerId}`, { photoUrl });
      return response.json();
    },
    onSuccess: (data: any) => {
      const updatedWorker = data.worker || data;
      setLocalPhotoUrl(updatedWorker.photoUrl || null);
      queryClient.invalidateQueries({ queryKey: ['/api/contractors/workers/all'] });
      toast({ title: t("workerProfile.photoUpdated"), description: t("workerProfile.photoUpdatedDesc") });
    },
    onError: () => toast({ title: t("common:error"), description: t("workerProfile.photoUpdateError"), variant: "destructive" }),
    onSettled: () => setIsUploadingPhoto(false),
  });

  const requestDocumentsMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('POST', `/api/contractors/workers/${worker!.id}/request-documents`, {});
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Failed to send request');
      return body;
    },
    onSuccess: () => {
      toast({ title: t("workerProfile.requestSent"), description: t("workerProfile.requestSentDesc", { email: worker?.email }) });
    },
    onError: (err: any) => {
      toast({ title: t("workerProfile.requestFailed"), description: err.message || t("workerProfile.requestFailedDesc"), variant: 'destructive' });
    },
  });

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !worker) return;
    let base64: string;
    try {
      base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (ev) => resolve((ev.target?.result as string).split(',')[1]);
        reader.onerror = () => reject(new Error('Failed to read file'));
        reader.readAsDataURL(file);
      });
    } catch {
      toast({ title: t("common:error"), description: t("workerProfile.photoReadError"), variant: "destructive" });
      return;
    }
    setIsUploadingPhoto(true);
    try {
      const uploadRes = await apiRequest("POST", "/api/objects/upload", { data: base64, mimeType: file.type });
      const { objectPath } = await uploadRes.json();
      updateWorkerPhotoMutation.mutate({ workerId: worker.id, photoUrl: objectPath });
    } catch {
      toast({ title: t("common:error"), description: t("workerProfile.photoUploadError"), variant: "destructive" });
      setIsUploadingPhoto(false);
    } finally {
      e.target.value = "";
    }
  };

  const handleClose = () => { setLocalPhotoUrl(null); onClose(); };

  if (!worker) return null;

  const effectivePhotoUrl = localPhotoUrl ?? worker.photoUrl;
  const photoSrc = effectivePhotoUrl
    ? (effectivePhotoUrl.startsWith('/objects/') ? effectivePhotoUrl : `/objects${effectivePhotoUrl}`)
    : null;
  const isCheckedIn = worker.isCheckedIn;
  const isBanned = worker.hasActiveDisciplinaryCard && worker.currentCardStatus === 'red' && worker.redCardBanUntil && new Date(worker.redCardBanUntil) > new Date();
  const isClear = !isBanned && worker.isActive !== false && !worker.hasActiveDisciplinaryCard;
  const notCleared = isBanned || worker.rightToWork !== 'valid' || !worker.inductionCompleted;
  const blockReason = isBanned ? t("workerProfile.siteBanReason") : worker.rightToWork !== 'valid' ? t("workerProfile.rtwNotVerified") : !worker.inductionCompleted ? t("workerProfile.inductionNotCompleted") : '';

  return (
    <Dialog open={!!worker} onOpenChange={(open) => { if (!open) handleClose(); }}>
      <DialogContent className="w-[95vw] sm:max-w-sm p-0 overflow-hidden rounded-2xl" aria-describedby={undefined}>
        <DialogTitle className="sr-only">{t("workerProfile.title")}</DialogTitle>
        <>
          <div className="bg-gradient-to-r from-orange-500 to-amber-500 px-4 py-2 pr-10">
            <p className="text-white/80 text-[10px] font-medium uppercase tracking-widest">{t("workerProfile.contractorWorker")} · {worker.companyName}</p>
          </div>

          <div className="flex flex-col items-center px-6 pt-5 pb-6">
            <input type="file" accept="image/*" id={PHOTO_INPUT_ID} className="hidden" onChange={handlePhotoUpload} />
            <div className="relative group">
              <div className="w-36 h-36 rounded-full border-4 border-orange-100 shadow-xl overflow-hidden bg-gradient-to-br from-orange-500 to-amber-500 flex items-center justify-center">
                {photoSrc ? (
                  <img src={photoSrc} alt={`${worker.firstName} ${worker.lastName}`} className="w-full h-full object-cover" />
                ) : (
                  <span className="text-white font-bold text-4xl">{(worker.firstName?.[0] || '').toUpperCase()}{(worker.lastName?.[0] || '').toUpperCase()}</span>
                )}
              </div>
              <label htmlFor={PHOTO_INPUT_ID} className="absolute inset-0 rounded-full flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 cursor-pointer transition-opacity" title={t("workerProfile.uploadPhoto")}>
                {isUploadingPhoto ? <div className="animate-spin h-6 w-6 border-2 border-white border-t-transparent rounded-full" /> : <Camera size={24} className="text-white" />}
              </label>
            </div>

            <h2 className="mt-3 text-xl font-bold text-gray-900 dark:text-white">{worker.firstName} {worker.lastName}</h2>
            {worker.jobTitle && <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{worker.jobTitle}</p>}

            <div className="flex items-center gap-2 mt-2 flex-wrap justify-center">
              <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${isCheckedIn ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'}`}>{isCheckedIn ? t("workerProfile.onSite") : t("badges.available")}</span>
              <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${worker.rightToWork === 'valid' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>{worker.rightToWork === 'valid' ? '✓' : '!'} {t("badges.workAuth")}</span>
              <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${worker.inductionCompleted ? 'bg-blue-100 text-blue-800' : 'bg-amber-100 text-amber-800'}`}>{worker.inductionCompleted ? t("workerProfile.inducted") : t("badges.noInduction")}</span>
              {isBanned && <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-red-200 text-red-900">{t("workerProfile.siteBan")}</span>}
            </div>

            <div className="mt-5 w-full space-y-3 border-t pt-4">
              {worker.email && (
                <div className="flex items-center gap-3 text-sm">
                  <div className="w-7 h-7 rounded-full bg-orange-50 flex items-center justify-center flex-shrink-0"><Mail size={13} className="text-orange-600" /></div>
                  <span className="text-gray-700 dark:text-gray-200 break-all">{worker.email}</span>
                </div>
              )}
              {(worker.phoneNumber || worker.mobileNumber) && (
                <div className="flex items-center gap-3 text-sm">
                  <div className="w-7 h-7 rounded-full bg-orange-50 dark:bg-orange-900/30 flex items-center justify-center flex-shrink-0"><Phone size={13} className="text-orange-600" /></div>
                  <span className="text-gray-700 dark:text-gray-200">{worker.phoneNumber || worker.mobileNumber}</span>
                </div>
              )}
              {worker.updatedAt && !isCheckedIn && (
                <div className="flex items-center gap-3 text-sm">
                  <div className="w-7 h-7 rounded-full bg-orange-50 dark:bg-orange-900/30 flex items-center justify-center flex-shrink-0"><History size={13} className="text-orange-600" /></div>
                  <span className="text-gray-700 dark:text-gray-200">{t("workerProfile.lastVisit", { date: new Date(worker.updatedAt).toLocaleDateString(i18n.language === 'es' ? 'es-ES' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) })}</span>
                </div>
              )}
              {isCheckedIn && worker.checkedInAt && (
                <div className="flex items-center gap-3 text-sm">
                  <div className="w-7 h-7 rounded-full bg-green-50 dark:bg-green-900/30 flex items-center justify-center flex-shrink-0"><Clock size={13} className="text-green-600" /></div>
                  <span className="text-gray-700 dark:text-gray-200">{t("common:signedInAt", { time: new Date(worker.checkedInAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) })}</span>
                </div>
              )}
            </div>

            <div className="flex gap-2 mt-5 w-full flex-wrap">
              <Button variant="outline" size="sm" className="flex-1 text-xs" onClick={() => { handleClose(); onEditWorker(worker, worker.companyName || ''); }}>
                <Edit size={13} className="mr-1" /> {t("workerProfile.editProfile")}
              </Button>
              {worker.email && (
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 text-xs text-blue-700 border-blue-300 hover:bg-blue-50"
                  onClick={() => requestDocumentsMutation.mutate()}
                  disabled={requestDocumentsMutation.isPending}
                  title={t("workerProfile.emailPassSub", { email: worker.email })}
                >
                  {requestDocumentsMutation.isPending
                    ? <><Loader2 size={13} className="mr-1 animate-spin" />{t("workerProfile.sending")}</>
                    : <><Send size={13} className="mr-1" />{t("workerProfile.requestDocs")}</>
                  }
                </Button>
              )}
              {isClear && (
                <Button variant="outline" size="sm" className="flex-1 text-xs text-indigo-600 border-indigo-300 hover:bg-indigo-50" onClick={() => { handleClose(); onQrPass(worker); }}>
                  <QrCode size={13} className="mr-1" /> {t("workerProfile.qrPass")}
                </Button>
              )}
              {isClear && !isCheckedIn && (
                <Button variant="outline" size="sm" className="flex-1 text-xs text-indigo-600 border-indigo-300 hover:bg-indigo-50" onClick={() => { handleClose(); onPreBook(worker, worker.companyName || ''); }}>
                  <CalendarPlus size={13} className="mr-1" /> {t("workerProfile.preBook")}
                </Button>
              )}
              {!isCheckedIn ? (
                <Button
                  size="sm"
                  className={`flex-1 text-xs ${notCleared ? 'bg-gray-200 text-gray-400 cursor-not-allowed' : 'bg-green-600 hover:bg-green-700 text-white'}`}
                  disabled={notCleared || checkInMutation.isPending}
                  title={notCleared ? blockReason : t("common:checkIn")}
                  onClick={() => {
                    if (notCleared) { toast({ title: t("workerProfile.cannotCheckIn"), description: blockReason, variant: "destructive" }); return; }
                    handleClose();
                    onCheckIn(worker, worker.companyName || '');
                  }}
                >
                  <LogIn size={13} className="mr-1" /> {t("workerProfile.checkIn")}
                </Button>
              ) : (
                <Button size="sm" className="flex-1 text-xs bg-red-600 hover:bg-red-700 text-white" disabled={checkOutMutation.isPending} onClick={() => { handleClose(); checkOutMutation.mutate(worker.id); }}>
                  <LogOut size={13} className="mr-1" /> {t("workerProfile.checkOut")}
                </Button>
              )}
            </div>
          </div>
        </>
      </DialogContent>
    </Dialog>
  );
}
