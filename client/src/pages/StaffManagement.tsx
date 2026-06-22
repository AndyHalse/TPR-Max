import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import { queryClient, apiRequest, objectUrl } from "@/lib/queryClient";
import GlassCard from "@/components/GlassCard";
import AddStaffModal from "@/components/AddStaffModal";
import StaffDbsTab from "@/components/StaffDbsTab";
import StaffDocumentsTab from "@/components/StaffDocumentsTab";
import { Plus, Edit, Trash2, UserCheck, UserX, Clock, QrCode, Mail, Printer, Download, LayoutGrid, LayoutList, Search, Phone, Briefcase, MapPin, Camera, Wallet, Loader2, Shield, ShieldOff, FileText, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import type { Staff } from "@shared/schema";
import QRScannerModal from "@/components/QRScannerModal";

import { getDateLocale, formatDateLocale, formatTimeLocale } from "@/utils/formatDate";

function StaffProfilePanel({
  staff: vs,
  zone,
  staffPhotoInputId,
  isUploadingStaffPhoto,
  handleStaffPhotoUpload,
  getFullName,
  getInitials,
  getAccessLevelBadgeColor,
  getAccessLevelIcon,
  getAccessLevelLabel,
  onEdit,
  onQrPass,
}: {
  staff: any;
  zone: any;
  staffPhotoInputId: string;
  isUploadingStaffPhoto: boolean;
  handleStaffPhotoUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  getFullName: (s: any) => string;
  getInitials: (s: any) => string;
  getAccessLevelBadgeColor: (a: string) => string;
  getAccessLevelIcon: (a: string) => string;
  getAccessLevelLabel: (a: string) => string;
  onEdit: () => void;
  onQrPass: () => void;
}) {
  const [activeTab, setActiveTab] = useState("profile");
  const { t } = useTranslation(['staff', 'common']);

  const { data: companySettings } = useQuery<any>({ queryKey: ["/api/settings"] });
  const featureHrModule = companySettings?.featureHrModule !== false;

  const { data: docs = [] } = useQuery<any[]>({
    queryKey: ["/api/staff", vs.id, "documents"],
    queryFn: () => fetch(`/api/staff/${vs.id}/documents`, { credentials: "include" }).then(r => {
      if (!r.ok) throw new Error(`${r.status}`);
      return r.json();
    }),
    enabled: featureHrModule,
  });

  return (
    <>
      {/* Slim top bar */}
      <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-4 py-2 pr-10">
        <p className="text-white/80 text-[10px] font-medium uppercase tracking-widest">{t('dialogs.profile', { id: vs.employeeId })}</p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="w-full rounded-none border-b h-9 bg-gray-50 gap-0 px-4">
          <TabsTrigger value="profile" className="text-xs h-8 rounded-none border-b-2 border-transparent data-[state=active]:border-blue-600 data-[state=active]:shadow-none">{t('tabs.profile')}</TabsTrigger>
          <TabsTrigger value="documents" className="text-xs h-8 rounded-none border-b-2 border-transparent data-[state=active]:border-blue-600 data-[state=active]:shadow-none">
            <FileText size={11} className="mr-1" />{t('tabs.documents')} {featureHrModule && docs.length > 0 && <Badge className="ml-1 bg-blue-100 text-blue-700 text-[9px] px-1 py-0 h-4">{docs.length}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="dbs" className="text-xs h-8 rounded-none border-b-2 border-transparent data-[state=active]:border-blue-600 data-[state=active]:shadow-none">
            <Shield size={11} className="mr-1" />{t('tabs.dbs')}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="profile" className="mt-0">
          <div className="flex flex-col items-center px-6 pt-5 pb-6">
            <input type="file" accept="image/*" id={staffPhotoInputId} className="hidden" onChange={handleStaffPhotoUpload} />
            <div className="relative group">
              <div className="w-28 h-28 rounded-full border-4 border-blue-100 shadow-xl overflow-hidden bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center">
                {vs.photoUrl ? (
                  <img src={objectUrl(vs.photoUrl)} alt={getFullName(vs)} className="w-full h-full object-cover" />
                ) : (
                  <span className="text-white font-bold text-3xl">{getInitials(vs)}</span>
                )}
              </div>
              <label htmlFor={staffPhotoInputId} className="absolute inset-0 rounded-full flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 cursor-pointer transition-opacity" title={t('common:edit')}>
                {isUploadingStaffPhoto ? <div className="animate-spin h-6 w-6 border-2 border-white border-t-transparent rounded-full" /> : <Camera size={20} className="text-white" />}
              </label>
            </div>

            <h2 className="mt-3 text-xl font-bold text-gray-900">{getFullName(vs)}</h2>
            {vs.jobTitle && <p className="text-sm text-gray-500 mt-0.5">{vs.jobTitle}</p>}

            <div className="flex items-center gap-2 mt-2 flex-wrap justify-center">
              <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${vs.isActive ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'}`}>
                {vs.isActive ? `● ${t('badges.active')}` : `● ${t('badges.inactive')}`}
              </span>
              <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${getAccessLevelBadgeColor(vs.accessLevel || 'staff')}`}>
                {getAccessLevelIcon(vs.accessLevel || 'staff')} {getAccessLevelLabel(vs.accessLevel || 'staff')}
              </span>
              {vs.isFireMarshal && <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-orange-100 text-orange-800">🚨 {t('badges.fireMarshal')}</span>}
              {vs.isCheckedIn && <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-100 text-blue-800"><Clock size={10} /> {t('badges.onSite')}</span>}
            </div>

            <div className="mt-4 w-full space-y-2.5 border-t pt-4">
              <div className="flex items-center gap-3 text-sm">
                <div className="w-7 h-7 rounded-full bg-blue-50 flex items-center justify-center flex-shrink-0"><Mail size={13} className="text-blue-600" /></div>
                <span className="text-gray-700 break-all">{vs.email || '—'}</span>
              </div>
              {vs.phoneNumber && (
                <div className="flex items-center gap-3 text-sm">
                  <div className="w-7 h-7 rounded-full bg-blue-50 flex items-center justify-center flex-shrink-0"><Phone size={13} className="text-blue-600" /></div>
                  <span className="text-gray-700">{vs.phoneNumber}</span>
                </div>
              )}
              <div className="flex items-center gap-3 text-sm">
                <div className="w-7 h-7 rounded-full bg-blue-50 flex items-center justify-center flex-shrink-0"><Briefcase size={13} className="text-blue-600" /></div>
                <span className="text-gray-700">{vs.department || '—'}</span>
              </div>
              {zone && (
                <div className="flex items-center gap-3 text-sm">
                  <div className="w-7 h-7 rounded-full bg-blue-50 flex items-center justify-center flex-shrink-0"><MapPin size={13} className="text-blue-600" /></div>
                  <span className="flex items-center gap-1.5 text-gray-700">
                    <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: zone.color }} />
                    {zone.name}
                  </span>
                </div>
              )}
              {vs.isCheckedIn && vs.checkedInAt && (
                <div className="flex items-center gap-3 text-sm">
                  <div className="w-7 h-7 rounded-full bg-green-50 flex items-center justify-center flex-shrink-0"><Clock size={13} className="text-green-600" /></div>
                  <span className="text-gray-700">{t('common:signedInAt', { time: formatTimeLocale(vs.checkedInAt) })}</span>
                </div>
              )}
            </div>

            <div className="flex gap-2 mt-4 w-full">
              <Button variant="outline" size="sm" className="flex-1 text-xs" onClick={onEdit}><Edit size={13} className="mr-1" /> {t('editProfile')}</Button>
              <Button variant="outline" size="sm" className="flex-1 text-xs text-indigo-600 border-indigo-300 hover:bg-indigo-50" onClick={onQrPass}><QrCode size={13} className="mr-1" /> {t('qrPass')}</Button>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="documents" className="mt-0 px-4 py-4 max-h-[560px] overflow-y-auto">
          {featureHrModule ? (
            <StaffDocumentsTab staffId={vs.id} onSwitchToDbs={() => setActiveTab("dbs")} />
          ) : (
            <div className="text-center py-8">
              <Shield className="h-8 w-8 mx-auto text-gray-300 mb-2" />
              <p className="text-gray-500 text-sm font-medium">{t('upgrade.title')}</p>
              <p className="text-gray-400 text-xs mt-1">{t('upgrade.desc')}</p>
            </div>
          )}
        </TabsContent>

        <TabsContent value="dbs" className="mt-0 px-4 py-4 max-h-[500px] overflow-y-auto">
          {featureHrModule ? (
            <StaffDbsTab staffId={vs.id} />
          ) : (
            <div className="text-center py-8">
              <Shield className="h-8 w-8 mx-auto text-gray-300 mb-2" />
              <p className="text-gray-500 text-sm font-medium">{t('upgrade.title')}</p>
              <p className="text-gray-400 text-xs mt-1">{t('upgrade.desc')}</p>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </>
  );
}

export default function StaffManagement() {
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingStaff, setEditingStaff] = useState<Staff | null>(null);
  const [showQRScanner, setShowQRScanner] = useState(false);
  const [showRemoveDuplicatesConfirm, setShowRemoveDuplicatesConfirm] = useState(false);
  const [removeDuplicatesResult, setRemoveDuplicatesResult] = useState<{ removed: number; duplicateNames: string[] } | null>(null);
  const [viewingStaff, setViewingStaff] = useState<Staff | null>(null);
  const [qrPassStaff, setQrPassStaff] = useState<Staff | null>(null);
  const [qrPassData, setQrPassData] = useState<{ qrCode: string; staffName: string } | null>(null);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('list');
  const [searchTerm, setSearchTerm] = useState("");
  const [sortBy, setSortBy] = useState<'firstName' | 'lastName' | 'recentCheckIn'>('firstName');
  const [isUploadingStaffPhoto, setIsUploadingStaffPhoto] = useState(false);
  const [isDownloadingWalletPass, setIsDownloadingWalletPass] = useState(false);
  const staffPhotoInputId = "staff-photo-upload-input";
  const { toast } = useToast();
  const { t } = useTranslation(['staff', 'common']);

  // Auto-show QR code when dialog opens if the staff member already has one
  useEffect(() => {
    if (qrPassStaff?.qrCode) {
      setQrPassData({ qrCode: qrPassStaff.qrCode, staffName: `${qrPassStaff.firstName} ${qrPassStaff.lastName}` });
    } else if (!qrPassStaff) {
      setQrPassData(null);
    }
  }, [qrPassStaff]);
  const { slug } = useParams<{ slug: string }>();
  const [location] = useLocation();

  // Determine if this is a tenant-specific view or building-wide view
  const isTenantView = location.startsWith('/tenant/');
  
  // GDPR-compliant staff query: Use tenant-specific or building-wide endpoint based on context
  const { data: staff, isLoading } = useQuery<Staff[]>({
    queryKey: isTenantView ? [`/api/tenants/${slug}/staff`] : ["/api/staff"],
    enabled: isTenantView ? !!slug : true,
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/staff/${id}`);
    },
    onSuccess: () => {
      // Invalidate the correct query based on context
      const queryKey = isTenantView ? [`/api/tenants/${slug}/staff`] : ["/api/staff"];
      queryClient.invalidateQueries({ queryKey });
      toast({
        title: t('toasts.deletedTitle'),
        description: t('toasts.deletedDesc'),
      });
    },
    onError: () => {
      toast({
        title: t('common:error'),
        description: t('failedToDelete'),
        variant: "destructive",
      });
    },
  });

  const removeDuplicatesMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/staff/remove-duplicates");
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/staff"] });
      setShowRemoveDuplicatesConfirm(false);
      setRemoveDuplicatesResult(data);
    },
    onError: () => {
      toast({ title: t('common:error'), description: "Failed to remove duplicates", variant: "destructive" });
    },
  });

  const checkInMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("POST", `/api/staff/${id}/checkin`, { manual: true });
    },
    onMutate: async (id: string) => {
      const staffQueryKey = isTenantView ? [`/api/tenants/${slug}/staff`] : ["/api/staff"];
      await queryClient.cancelQueries({ queryKey: staffQueryKey });
      const previousStaff = queryClient.getQueryData<any[]>(staffQueryKey);
      queryClient.setQueryData(staffQueryKey, (old: any[] | undefined) =>
        old?.map(s => s.id === id ? { ...s, isCheckedIn: true, checkedInAt: new Date().toISOString() } : s)
      );
      return { previousStaff, staffQueryKey };
    },
    onError: (_err, _id, context) => {
      if (context?.previousStaff) {
        queryClient.setQueryData(context.staffQueryKey, context.previousStaff);
      }
      toast({ title: t('common:error'), description: t('failedToCheckIn'), variant: "destructive" });
    },
    onSettled: (_data, _err, _id, context) => {
      if (context?.staffQueryKey) queryClient.invalidateQueries({ queryKey: context.staffQueryKey });
      queryClient.invalidateQueries({ queryKey: ["/api/staff/checked-in"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/activity/recent"] });
      queryClient.invalidateQueries({ queryKey: ["/api/muster"] });
    },
  });

  const checkOutMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("POST", `/api/staff/${id}/checkout`);
    },
    onMutate: async (id: string) => {
      const staffQueryKey = isTenantView ? [`/api/tenants/${slug}/staff`] : ["/api/staff"];
      await queryClient.cancelQueries({ queryKey: staffQueryKey });
      const previousStaff = queryClient.getQueryData<any[]>(staffQueryKey);
      queryClient.setQueryData(staffQueryKey, (old: any[] | undefined) =>
        old?.map(s => s.id === id ? { ...s, isCheckedIn: false, checkedInAt: null } : s)
      );
      return { previousStaff, staffQueryKey };
    },
    onError: (_err, _id, context) => {
      if (context?.previousStaff) {
        queryClient.setQueryData(context.staffQueryKey, context.previousStaff);
      }
      toast({ title: t('common:error'), description: t('failedToCheckOut'), variant: "destructive" });
    },
    onSettled: (_data, _err, _id, context) => {
      if (context?.staffQueryKey) queryClient.invalidateQueries({ queryKey: context.staffQueryKey });
      queryClient.invalidateQueries({ queryKey: ["/api/staff/checked-in"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/activity/recent"] });
      queryClient.invalidateQueries({ queryKey: ["/api/muster"] });
    },
  });

  const sendQrPassMutation = useMutation({
    mutationFn: async ({ id, method }: { id: string; method: string }) => {
      const response = await apiRequest("POST", `/api/staff/${id}/send-qr-pass`, { method });
      return response.json();
    },
    onSuccess: (data) => {
      // Always show the QR code in the dialog regardless of method
      if (data.qrCode) {
        setQrPassData({ qrCode: data.qrCode, staffName: data.staffName || '' });
      }
      if (data.method === 'email') {
        toast({
          title: t('toasts.qrSentTitle'),
          description: data.message || t('toasts.qrSentDesc'),
        });
        // Keep the dialog open so the user can see / scan the QR code directly
      }
    },
    onError: () => {
      toast({
        title: t('common:error'),
        description: t('failedToSendQr'),
        variant: "destructive",
      });
    },
  });

  const updateStaffPhotoMutation = useMutation({
    mutationFn: async ({ staffId, photoUrl }: { staffId: string; photoUrl: string }) => {
      const response = await apiRequest("PUT", `/api/staff/${staffId}`, { photoUrl });
      return response.json();
    },
    onSuccess: (updated) => {
      setViewingStaff((prev: any) => prev ? { ...prev, photoUrl: updated.photoUrl } : prev);
      queryClient.invalidateQueries({ queryKey: ['/api/staff'] });
      toast({ title: t('toasts.photoUpdatedTitle'), description: t('toasts.photoUpdatedDesc') });
    },
    onError: () => {
      toast({ title: t('common:error'), description: t('failedToUpdatePhoto'), variant: "destructive" });
    },
  });

  const compressImageToBase64 = (file: File, maxDim = 512, quality = 0.82): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const img = new Image();
        img.onload = () => {
          let { width, height } = img;
          if (width > maxDim || height > maxDim) {
            const scale = Math.min(maxDim / width, maxDim / height);
            width = Math.round(width * scale);
            height = Math.round(height * scale);
          }
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (!ctx) { reject(new Error('Canvas not supported')); return; }
          ctx.drawImage(img, 0, 0, width, height);
          const dataUrl = canvas.toDataURL('image/jpeg', quality);
          resolve(dataUrl.split(',')[1]);
        };
        img.onerror = () => reject(new Error('Could not load image'));
        img.src = reader.result as string;
      };
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsDataURL(file);
    });

  const handleStaffPhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !viewingStaff) return;
    setIsUploadingStaffPhoto(true);
    try {
      const base64 = await compressImageToBase64(file);
      const uploadRes = await apiRequest("POST", "/api/objects/upload", { data: base64, mimeType: "image/jpeg" });
      const { objectPath } = await uploadRes.json();
      await updateStaffPhotoMutation.mutateAsync({ staffId: viewingStaff.id, photoUrl: objectPath });
    } catch (err: any) {
      const msg = err?.status === 413
        ? t('toasts.photoTooLarge')
        : t('toasts.photoUploadFailed');
      toast({ title: t('common:error'), description: msg, variant: "destructive" });
    } finally {
      setIsUploadingStaffPhoto(false);
      e.target.value = "";
    }
  };

  const { data: zones = [] } = useQuery<any[]>({ queryKey: ["/api/zones"] });

  const { data: companySettings } = useQuery<any>({ queryKey: ['/api/settings'] });

  const { data: activeLoneWorkers = [] } = useQuery<any[]>({
    queryKey: ['/api/lone-worker/active'],
    refetchInterval: 30000,
  });

  const startLoneWorkerMutation = useMutation({
    mutationFn: (id: string) => apiRequest("POST", `/api/staff/${id}/lone-worker/start`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['/api/lone-worker/active'] }),
    onError: () => toast({ title: t('common:error'), description: t('failedToStartLoneWorker'), variant: "destructive" }),
  });

  const endLoneWorkerMutation = useMutation({
    mutationFn: (id: string) => apiRequest("POST", `/api/staff/${id}/lone-worker/end`, { endedBy: 'supervisor' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['/api/lone-worker/active'] }),
    onError: () => toast({ title: t('common:error'), description: t('failedToEndLoneWorker'), variant: "destructive" }),
  });

  const getStaffLoneWorkerSession = (staffId: string) =>
    activeLoneWorkers.find((s: any) => s.personId === staffId && s.personType === 'staff');

  const getLoneWorkerCountdown = (session: any): string => {
    if (!session?.nextDeadline) return t('loneWorker');
    const minsLeft = Math.round((new Date(session.nextDeadline).getTime() - Date.now()) / 60000);
    if (minsLeft < 0) return t('overdueMins', { mins: Math.abs(minsLeft) });
    return t('nextMins', { mins: minsLeft });
  };

  const getPassBranding = () => {
    const brandColor = companySettings?.backgroundColor || companySettings?.primaryColor || '#2460A9';
    const accentColor = companySettings?.accentColor || brandColor;
    const variableTextColor = (companySettings as any)?.variableTextColor || companySettings?.primaryColor || '#1e4f8c';
    const companyName = companySettings?.companyName || 'Company';
    const logoPath = companySettings?.logoUrl || '';
    const logoUrl = logoPath
      ? (logoPath.startsWith('http')
        ? logoPath
        : `${window.location.origin}/objects${logoPath.startsWith('/') ? '' : '/'}${logoPath}`)
      : '';
    return { brandColor, accentColor, variableTextColor, companyName, logoUrl };
  };

  const getBrandedPassHtml = async (
    qrCode: string, staffName: string, department: string, employeeId: string,
    photoUrl?: string | null, email?: string | null, jobTitle?: string | null
  ) => {
    const QRCode = await import('qrcode');
    const qrUrl = await QRCode.toDataURL(qrCode, { width: 200, margin: 1 });
    const { brandColor, variableTextColor, companyName, logoUrl } = getPassBranding();
    const logoHtml = logoUrl
      ? `<img src="${logoUrl}" style="height:26px;max-width:80px;object-fit:contain;vertical-align:middle;" crossorigin="anonymous">`
      : '';
    const initials = staffName.split(' ').map((n: string) => n[0] || '').join('').substring(0, 2).toUpperCase();
    const photoHtml = photoUrl
      ? `<img src="${photoUrl}" style="width:64px;height:64px;border-radius:50%;object-fit:cover;border:3px solid ${variableTextColor};display:block;" crossorigin="anonymous">`
      : `<div style="width:64px;height:64px;border-radius:50%;background:${variableTextColor};display:flex;align-items:center;justify-content:center;color:#fff;font-size:22px;font-weight:700;">${initials}</div>`;
    return `
      <div style="
        width:204px;background:#fff;border-radius:12px;overflow:hidden;
        font-family:'Segoe UI',Arial,sans-serif;
        box-shadow:0 4px 20px rgba(0,0,0,0.15);
        border:1px solid rgba(0,0,0,0.06);
      ">
        <div style="background:${brandColor};padding:10px 12px;display:flex;align-items:center;gap:8px;">
          ${logoHtml}
          <div style="flex:1;min-width:0;">
            <div style="color:${variableTextColor};font-weight:700;font-size:9.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${companyName}</div>
            <div style="color:${variableTextColor};opacity:0.7;font-size:7px;letter-spacing:0.6px;text-transform:uppercase;margin-top:1px;">${t('idPassLabel')}</div>
          </div>
          <div style="background:${variableTextColor};border-radius:4px;padding:2px 6px;white-space:nowrap;">
            <div style="color:${brandColor};font-size:6.5px;font-weight:700;letter-spacing:0.5px;">${t('badges.staff').toUpperCase()}</div>
          </div>
        </div>
        <div style="display:flex;justify-content:center;padding:14px 0 10px;">
          ${photoHtml}
        </div>
        <div style="height:1px;background:linear-gradient(to right,transparent,#e5e7eb,transparent);margin:0 16px;"></div>
        <div style="padding:10px 14px 8px;text-align:center;">
          <div style="font-weight:700;font-size:13px;color:#111;margin-bottom:2px;">${staffName}</div>
          ${jobTitle ? `<div style="font-size:9px;color:${brandColor};font-weight:600;margin-bottom:2px;">${jobTitle}</div>` : ''}
          <div style="font-size:9px;color:#555;margin-bottom:${email ? '2px' : '6px'};">${department}</div>
          ${email ? `<div style="font-size:8px;color:#777;margin-bottom:6px;overflow:hidden;text-overflow:ellipsis;">${email}</div>` : ''}
          <div style="display:inline-block;background:#f3f4f6;border-radius:4px;padding:2px 8px;">
            <span style="font-size:7.5px;color:#555;font-family:monospace;font-weight:600;">${t('common:id')}: ${employeeId}</span>
          </div>
        </div>
        <div style="background:#f9fafb;border-top:1px solid #f0f0f0;padding:8px 10px;display:flex;align-items:center;gap:8px;">
          <div style="flex:1;">
            <div style="font-size:7px;color:#999;line-height:1.4;">${t('scanAtKiosk')}<br>${t('checkInAndOut')}</div>
          </div>
          <img src="${qrUrl}" style="width:52px;height:52px;border:1px solid #e5e7eb;border-radius:4px;flex-shrink:0;" crossorigin="anonymous">
        </div>
      </div>`;
  };

  const loadImageAsDataUrl = (url: string): Promise<HTMLImageElement | null> => {
    return new Promise((resolve) => {
      fetch(url)
        .then(r => r.blob())
        .then(blob => {
          const reader = new FileReader();
          reader.onloadend = () => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = () => resolve(null);
            img.src = reader.result as string;
          };
          reader.readAsDataURL(blob);
        })
        .catch(() => resolve(null));
    });
  };

  const handleDownloadQrPass = async (
    qrCode: string, staffName: string, department: string, employeeId: string,
    photoUrl?: string | null, email?: string | null, jobTitle?: string | null
  ) => {
    toast({ title: t('generatingPass.title'), description: t('generatingPass.desc') });
    setQrPassStaff(null);
    setQrPassData(null);

    const { brandColor, variableTextColor, companyName, logoUrl } = getPassBranding();
    const QRCodeLib = await import('qrcode');
    const qrDataUrl = await QRCodeLib.toDataURL(qrCode, { width: 200, margin: 1 });

    const resolveUrl = (path: string | null | undefined) => {
      if (!path) return null;
      if (path.startsWith('http') || path.startsWith('/objects/')) return path;
      return `${window.location.origin}/objects${path.startsWith('/') ? '' : '/'}${path}`;
    };

    const qrImgEl = await new Promise<HTMLImageElement | null>(resolve => {
      const img = new Image(); img.onload = () => resolve(img); img.onerror = () => resolve(null); img.src = qrDataUrl;
    });
    const [qrImg, logoImg, photoImg] = await Promise.all([
      Promise.resolve(qrImgEl),
      logoUrl ? loadImageAsDataUrl(logoUrl) : Promise.resolve(null),
      resolveUrl(photoUrl) ? loadImageAsDataUrl(resolveUrl(photoUrl)!) : Promise.resolve(null),
    ]);

    // CR80 portrait card: 54mm × 85.6mm → canvas at 400×630 logical, 2x scale
    const scale = 2;
    const W = 400, H = 630;
    const canvas = document.createElement('canvas');
    canvas.width = W * scale;
    canvas.height = H * scale;
    const ctx = canvas.getContext('2d')!;
    ctx.scale(scale, scale);

    const roundRect = (x: number, y: number, w: number, h: number, r: number) => {
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.lineTo(x + w - r, y);
      ctx.quadraticCurveTo(x + w, y, x + w, y + r);
      ctx.lineTo(x + w, y + h - r);
      ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
      ctx.lineTo(x + r, y + h);
      ctx.quadraticCurveTo(x, y + h, x, y + h - r);
      ctx.lineTo(x, y + r);
      ctx.quadraticCurveTo(x, y, x + r, y);
      ctx.closePath();
    };

    // White background
    ctx.fillStyle = '#f5f5f5';
    ctx.fillRect(0, 0, W, H);

    // Card shadow
    ctx.shadowColor = 'rgba(0,0,0,0.18)';
    ctx.shadowBlur = 20;
    ctx.shadowOffsetY = 6;
    const cX = 10, cY = 10, cW = W - 20, cH = H - 20, cR = 14;
    roundRect(cX, cY, cW, cH, cR);
    ctx.fillStyle = '#fff';
    ctx.fill();
    ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;

    // Clip to card
    ctx.save();
    roundRect(cX, cY, cW, cH, cR);
    ctx.clip();

    // ── Header band ──────────────────────────────────────
    const headerH = 78;
    ctx.fillStyle = brandColor;
    ctx.fillRect(cX, cY, cW, headerH);

    // Logo in header (left)
    const hCY = cY + headerH / 2;
    let logoEndX = cX + 14;
    if (logoImg) {
      const lh = 30;
      const lw = Math.min(100, (logoImg.naturalWidth / logoImg.naturalHeight) * lh);
      ctx.drawImage(logoImg, cX + 12, hCY - lh / 2, lw, lh);
      logoEndX = cX + 12 + lw + 8;
    }

    // Company name + label in header (using variableTextColor for title)
    ctx.fillStyle = variableTextColor;
    ctx.textAlign = 'left';
    ctx.font = 'bold 12px "Segoe UI", Arial, sans-serif';
    ctx.fillText(companyName, logoEndX, hCY - 4, cW - (logoEndX - cX) - 55);
    ctx.globalAlpha = 0.7;
    ctx.fillStyle = variableTextColor;
    ctx.font = '8px "Segoe UI", Arial, sans-serif';
    ctx.fillText(t('idPassLabel'), logoEndX, hCY + 10);
    ctx.globalAlpha = 1;

    // STAFF badge (right of header) — variableTextColor bg, brandColor text for contrast
    ctx.fillStyle = variableTextColor;
    roundRect(cX + cW - 50, cY + headerH / 2 - 13, 40, 22, 5);
    ctx.fill();
    ctx.fillStyle = brandColor;
    ctx.font = 'bold 8px "Segoe UI", Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(t('badges.staff').toUpperCase(), cX + cW - 30, cY + headerH / 2 + 3);

    // ── Photo ─────────────────────────────────────────────
    const cx = W / 2;
    const photoR = 44;
    const photoY = cY + headerH + 22;

    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, photoY + photoR, photoR, 0, Math.PI * 2);
    ctx.clip();
    if (photoImg) {
      ctx.drawImage(photoImg, cx - photoR, photoY, photoR * 2, photoR * 2);
    } else {
      ctx.fillStyle = variableTextColor;
      ctx.fillRect(cx - photoR, photoY, photoR * 2, photoR * 2);
      ctx.fillStyle = brandColor;
      ctx.font = 'bold 28px "Segoe UI", Arial, sans-serif';
      ctx.textAlign = 'center';
      const initials = staffName.split(' ').map((n: string) => n[0] || '').join('').substring(0, 2).toUpperCase();
      ctx.fillText(initials, cx, photoY + photoR + 10);
    }
    ctx.restore();

    // Photo ring
    ctx.strokeStyle = variableTextColor;
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.arc(cx, photoY + photoR, photoR, 0, Math.PI * 2);
    ctx.stroke();

    // ── Separator ─────────────────────────────────────────
    const sepY = photoY + photoR * 2 + 20;
    ctx.strokeStyle = '#ebebeb';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cX + 28, sepY);
    ctx.lineTo(cX + cW - 28, sepY);
    ctx.stroke();

    // ── Staff details ─────────────────────────────────────
    ctx.textAlign = 'center';
    let dy = sepY + 24;

    ctx.fillStyle = '#111';
    ctx.font = 'bold 19px "Segoe UI", Arial, sans-serif';
    ctx.fillText(staffName, cx, dy); dy += 24;

    if (jobTitle) {
      ctx.fillStyle = brandColor;
      ctx.font = 'bold 11px "Segoe UI", Arial, sans-serif';
      ctx.fillText(jobTitle, cx, dy); dy += 18;
    }

    ctx.fillStyle = '#555';
    ctx.font = '11px "Segoe UI", Arial, sans-serif';
    ctx.fillText(department, cx, dy); dy += 16;

    if (email) {
      ctx.fillStyle = '#888';
      ctx.font = '9.5px "Segoe UI", Arial, sans-serif';
      ctx.fillText(email, cx, dy); dy += 16;
    }

    // Employee ID pill
    const idText = `${t('common:id')}: ${employeeId}`;
    ctx.font = '9px monospace';
    const idW = ctx.measureText(idText).width + 20;
    ctx.fillStyle = '#f3f4f6';
    roundRect(cx - idW / 2, dy - 10, idW, 20, 5);
    ctx.fill();
    ctx.fillStyle = '#555';
    ctx.fillText(idText, cx, dy + 4);

    // ── QR footer band ────────────────────────────────────
    const footerH = 86;
    const footerY = cY + cH - footerH;
    ctx.fillStyle = '#f9fafb';
    ctx.fillRect(cX, footerY, cW, footerH);

    // Footer top border
    ctx.strokeStyle = '#ebebeb';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cX, footerY);
    ctx.lineTo(cX + cW, footerY);
    ctx.stroke();

    // QR code (right side of footer)
    const qrSize = 62;
    const qrX = cX + cW - qrSize - 14;
    const qrFY = footerY + (footerH - qrSize) / 2;
    if (qrImg) {
      ctx.fillStyle = '#fff';
      ctx.fillRect(qrX - 3, qrFY - 3, qrSize + 6, qrSize + 6);
      ctx.strokeStyle = '#e5e7eb';
      ctx.lineWidth = 1;
      ctx.strokeRect(qrX - 3, qrFY - 3, qrSize + 6, qrSize + 6);
      ctx.drawImage(qrImg, qrX, qrFY, qrSize, qrSize);
    }

    // "Scan at kiosk" text (left side of footer)
    ctx.textAlign = 'left';
    ctx.fillStyle = '#888';
    ctx.font = 'bold 8.5px "Segoe UI", Arial, sans-serif';
    ctx.fillText(t('scanAtKiosk'), cX + 16, footerY + 30);
    ctx.font = '8px "Segoe UI", Arial, sans-serif';
    ctx.fillText(t('checkInAndOut'), cX + 16, footerY + 44);

    ctx.restore();

    // Card border
    ctx.strokeStyle = 'rgba(0,0,0,0.08)';
    ctx.lineWidth = 1;
    roundRect(cX, cY, cW, cH, cR);
    ctx.stroke();

    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `staff-id-${staffName.replace(/\s+/g, '-').toLowerCase()}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast({ title: t('common:success'), description: t('photoUpdatedDesc') });
    }, 'image/png');
  };

  const handlePrintQrPass = async (
    qrCode: string, staffName: string, department: string, employeeId: string,
    photoUrl?: string | null, email?: string | null, jobTitle?: string | null
  ) => {
    const passHtml = await getBrandedPassHtml(qrCode, staffName, department, employeeId, photoUrl, email, jobTitle);
    const printWindow = window.open('', '_blank', 'width=440,height=700');
    if (printWindow) {
      printWindow.document.write(`
        <html>
          <head>
            <title>${t('dialogs.qrPass')} - ${staffName}</title>
            <style>
              @page { size: 54mm 85.6mm; margin: 0; }
              * { box-sizing: border-box; }
              body { margin: 0; padding: 0; background: #fff; display: flex; justify-content: center; align-items: center; min-height: 85.6mm; }
            </style>
          </head>
          <body>
            ${passHtml}
            <script>
              var imgs = document.querySelectorAll('img');
              var total = imgs.length, loaded = 0;
              if (total === 0) { setTimeout(function(){ window.print(); }, 300); }
              imgs.forEach(function(img) {
                if (img.complete) { loaded++; if (loaded >= total) setTimeout(function(){ window.print(); }, 300); }
                else {
                  img.onload = function() { loaded++; if (loaded >= total) setTimeout(function(){ window.print(); }, 300); };
                  img.onerror = function() { loaded++; if (loaded >= total) setTimeout(function(){ window.print(); }, 300); };
                }
              });
            </script>
          </body>
        </html>
      `);
      printWindow.document.close();
    }
    setQrPassStaff(null);
    setQrPassData(null);
  };

  const handleDownloadWalletPass = async (staffId: string, staffName: string) => {
    setIsDownloadingWalletPass(true);
    try {
      const response = await fetch(`/api/staff/${staffId}/wallet-pass`, {
        method: 'GET',
        credentials: 'include',
      });
      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error || t('failedToDownload'));
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${staffName.replace(/\s+/g, '-').toLowerCase()}-pass.pkpass`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast({ title: t('common:success'), description: t('downloadWalletPass') });
    } catch (err: any) {
      toast({ title: t('common:error'), description: err.message || t('failedToDownload'), variant: 'destructive' });
    } finally {
      setIsDownloadingWalletPass(false);
    }
  };

  const getInitials = (staff: Staff) => {
    return `${staff.firstName[0]}${staff.lastName[0]}`.toUpperCase();
  };

  const getFullName = (staff: Staff) => {
    return `${staff.firstName} ${staff.lastName}`;
  };

  const getGradientClass = (index: number) => {
    const gradients = [
      'bg-gradient-to-r from-blue-500 to-purple-500',
      'bg-gradient-to-r from-green-500 to-teal-500',
      'bg-gradient-to-r from-purple-500 to-pink-500',
      'bg-gradient-to-r from-orange-500 to-red-500',
      'bg-gradient-to-r from-indigo-500 to-purple-500',
      'bg-gradient-to-r from-teal-500 to-cyan-500',
    ];
    return gradients[index % gradients.length];
  };

  const getAccessLevelBadgeColor = (accessLevel: string) => {
    switch (accessLevel) {
      case 'admin':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-green-100 text-green-800';
    }
  };

  const getAccessLevelIcon = (accessLevel: string) => {
    switch (accessLevel) {
      case 'admin':
        return '👑';
      default:
        return '👤';
    }
  };

  const getAccessLevelLabel = (accessLevel: string) => {
    switch (accessLevel) {
      case 'admin':
        return t('badges.admin');
      default:
        return t('badges.staff');
    }
  };

  if (isLoading) {
    return <div>{t('common:loading')}</div>;
  }

  const filteredStaff = [...(staff || [])].filter(member => {
    if (!searchTerm) return true;
    const search = searchTerm.toLowerCase();
    const fullName = `${member.firstName} ${member.lastName}`.toLowerCase();
    return fullName.includes(search) || member.email?.toLowerCase().includes(search) || member.department?.toLowerCase().includes(search);
  }).sort((a, b) => {
    if (sortBy === 'firstName') {
      return a.firstName.localeCompare(b.firstName) || a.lastName.localeCompare(b.lastName);
    }
    if (sortBy === 'lastName') {
      return a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName);
    }
    // recentCheckIn — most recent first, never-checked-in go to end
    if (!a.checkedInAt && !b.checkedInAt) return 0;
    if (!a.checkedInAt) return 1;
    if (!b.checkedInAt) return -1;
    return new Date(b.checkedInAt).getTime() - new Date(a.checkedInAt).getTime();
  });

  return (
    <div className="space-y-4 sm:space-y-8 p-3 sm:p-6 rounded-xl bg-background min-h-screen">
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-xl sm:text-2xl font-bold text-fixed">{t('title')}</h2>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowRemoveDuplicatesConfirm(true)}
              className="hidden sm:flex items-center gap-1.5 text-xs text-orange-600 border-orange-300 hover:bg-orange-50"
              title="Remove duplicate staff records"
            >
              <Trash2 size={13} />
              Remove Duplicates
            </Button>
            <Button
              onClick={() => setShowQRScanner(true)}
              className="bg-blue-600 hover:bg-blue-700 text-white font-semibold flex items-center gap-2 px-3 sm:px-4 py-2 sm:py-2.5 text-sm sm:text-base"
              title={t('common:scanQrFull')}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 sm:w-5 sm:h-5 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="3" y="14" width="7" height="7" />
                <path d="M14 14h1v1h-1zm3 0h1v1h-1zm-3 3h1v1h-1zm3 3h1v1h-1zm3-3h1v1h-1zm0-3h1v1h-1z" />
              </svg>
              <span className="hidden sm:inline">{t('common:scanQr')}</span>
              <span className="sm:hidden">{t('common:scanQr')}</span>
            </Button>
            <Button onClick={() => setIsAddModalOpen(true)} className="gradient-blue text-white font-medium hover:shadow-lg transition-all duration-300 whitespace-nowrap" data-testid="button-add-staff">
              <Plus className="mr-1.5 sm:mr-2" size={16} />
              <span className="hidden sm:inline text-sm sm:text-base">{t('addStaffMember')}</span>
              <span className="sm:hidden text-sm">{t('common:add')}</span>
            </Button>
          </div>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[180px] max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-variable" />
            <Input placeholder={t('common:searchPlaceholder')} value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-10" />
          </div>
          <Select value={sortBy} onValueChange={(v) => setSortBy(v as typeof sortBy)}>
            <SelectTrigger className="w-44 h-9 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="firstName">{t('sorting.firstName')}</SelectItem>
              <SelectItem value="lastName">{t('sorting.lastName')}</SelectItem>
              <SelectItem value="recentCheckIn">{t('sorting.recentCheckIn')}</SelectItem>
            </SelectContent>
          </Select>
          <div className="flex items-center gap-1">
            <Button variant={viewMode === 'grid' ? 'default' : 'outline'} size="sm" onClick={() => setViewMode('grid')} className="h-8 w-8 p-0" title={t('common:view')}>
              <LayoutGrid size={14} />
            </Button>
            <Button variant={viewMode === 'list' ? 'default' : 'outline'} size="sm" onClick={() => setViewMode('list')} className="h-8 w-8 p-0" title={t('common:view')}>
              <LayoutList size={14} />
            </Button>
          </div>
        </div>
      </div>

      {/* Staff Grid */}
      <div className={viewMode === 'grid' ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-6" : "space-y-2"}>
        {filteredStaff.length === 0 ? (
          <div className="col-span-full text-center py-12">
            <p className="text-variable text-lg">{t('common:noResults')}</p>
          </div>
        ) : (
          filteredStaff.map((member, index) => (
            viewMode === 'grid' ? (
              <GlassCard key={member.id} hover>
                <div className="flex items-start space-x-3 mb-3 cursor-pointer group" onClick={() => setViewingStaff(member)} title={t('common:view')}>
                  {member.photoUrl ? (
                    <img 
                      src={objectUrl(member.photoUrl)}
                      alt={getFullName(member)}
                      className="w-12 h-12 rounded-full object-cover flex-shrink-0 ring-2 ring-transparent group-hover:ring-blue-400 transition-all"
                    />
                  ) : (
                    <div className={`w-12 h-12 ${getGradientClass(index)} rounded-full flex items-center justify-center flex-shrink-0 ring-2 ring-transparent group-hover:ring-blue-400 transition-all`}>
                      <span className="text-white font-bold text-sm">{getInitials(member)}</span>
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <h3 className="font-semibold text-fixed text-sm truncate group-hover:text-blue-600 transition-colors" data-testid={`staff-name-${member.id}`}>
                        {getFullName(member)}
                      </h3>
                      <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium flex-shrink-0 ${
                        member.isActive ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                      }`}>
                        {member.isActive ? t('badges.active') : t('badges.inactive')}
                      </span>
                    </div>
                    <p className="text-variable text-xs truncate" data-testid={`staff-email-${member.id}`}>
                      {member.email}
                    </p>
                    <p className="text-variable text-xs" data-testid={`staff-department-${member.id}`}>
                      {member.department} <span className="text-variable/60">| {member.employeeId}</span>
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 flex-wrap mb-2">
                  <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${getAccessLevelBadgeColor(member.accessLevel || 'staff')}`}>
                    {getAccessLevelIcon(member.accessLevel || 'staff')} {getAccessLevelLabel(member.accessLevel || 'staff')}
                  </span>
                  {member.isFireMarshal && (
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-orange-100 text-orange-800" data-testid={`fire-marshal-badge-${member.id}`}>
                      🚨 {t('badges.fireMarshal')}
                    </span>
                  )}
                  {getStaffLoneWorkerSession(member.id) && (
                    <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-100 text-amber-800 animate-pulse">
                      <Shield size={9} />{getLoneWorkerCountdown(getStaffLoneWorkerSession(member.id))}
                    </span>
                  )}
                  {(member as any).zoneId && (() => {
                    const zone = zones.find((z: any) => z.id === (member as any).zoneId);
                    return zone ? (
                      <span className="inline-flex items-center gap-1 text-xs">
                        <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: zone.color }} />
                        {zone.name}
                      </span>
                    ) : null;
                  })()}
                  {member.isCheckedIn && member.checkedInAt && (
                    <span className="text-[10px] text-variable flex items-center ml-auto">
                      <Clock size={9} className="mr-0.5" />
                      {formatTimeLocale(member.checkedInAt)}
                    </span>
                  )}
                </div>
                <div className="flex items-center justify-between pt-2 border-t border-gray-200/50">
                  <div className="flex items-center gap-1.5">
                    <Button 
                      size="sm" 
                      variant="ghost" 
                      onClick={() => setEditingStaff(member)}
                      className="h-8 w-8 p-0"
                      data-testid={`button-edit-staff-${member.id}`}
                      title={t('common:edit')}
                    >
                      <Edit size={15} />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setQrPassStaff(member)}
                      className="h-8 w-8 p-0 text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50"
                      data-testid={`button-qr-pass-${member.id}`}
                      title={t('qrPass')}
                    >
                      <QrCode size={15} />
                    </Button>
                    {(() => {
                      const lwSession = getStaffLoneWorkerSession(member.id);
                      return lwSession ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => endLoneWorkerMutation.mutate(member.id)}
                          disabled={endLoneWorkerMutation.isPending}
                          className="h-8 w-8 p-0 text-amber-600 hover:text-amber-700 hover:bg-amber-50"
                          title={t('endLoneWorkerSession')}
                        >
                          <ShieldOff size={15} />
                        </Button>
                      ) : (member.isCheckedIn && companySettings?.loneWorkerEnabled) ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => startLoneWorkerMutation.mutate(member.id)}
                          disabled={startLoneWorkerMutation.isPending || !member.email}
                          className="h-8 w-8 p-0 text-slate-500 hover:text-green-700 hover:bg-green-50"
                          title={member.email ? t('startLoneWorkerSession') : t('staffNeedsEmail')}
                        >
                          <Shield size={15} />
                        </Button>
                      ) : null;
                    })()}
                    <Button 
                      size="sm" 
                      variant="ghost" 
                      onClick={() => deleteMutation.mutate(member.id)}
                      disabled={deleteMutation.isPending}
                      className="h-8 w-8 p-0 text-red-500 hover:text-red-700 hover:bg-red-50"
                      data-testid={`button-delete-staff-${member.id}`}
                      title={t('common:delete')}
                    >
                      <Trash2 size={15} />
                    </Button>
                  </div>
                  {member.isActive && (
                    <>
                      {!member.isCheckedIn ? (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => checkInMutation.mutate(member.id)}
                          disabled={checkInMutation.isPending}
                          className="h-9 px-3 text-sm font-medium text-green-600 hover:text-green-700 border-green-300 hover:border-green-400 hover:bg-green-50"
                          data-testid={`button-checkin-${member.id}`}
                          title={t('manualCheckIn')}
                        >
                          <UserCheck size={16} className="mr-1.5" />
                          {t('common:checkIn')}
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => checkOutMutation.mutate(member.id)}
                          disabled={checkOutMutation.isPending}
                          className="h-9 px-3 text-sm font-medium text-red-600 hover:text-red-700 border-red-300 hover:border-red-400 hover:bg-red-50"
                          data-testid={`button-checkout-${member.id}`}
                          title={t('common:checkOut')}
                        >
                          <UserX size={16} className="mr-1.5" />
                          {t('common:checkOut')}
                        </Button>
                      )}
                    </>
                  )}
                </div>
              </GlassCard>
            ) : (
              <div key={member.id} className="bg-white/60 rounded-lg border border-white/30 hover:bg-white/80 transition-all cursor-pointer" onClick={() => setViewingStaff(member)}>
                {/* Info row — full width so name never truncates */}
                <div className="flex items-center gap-3 px-3 pt-3 pb-1">
                  {member.photoUrl ? (
                    <img src={objectUrl(member.photoUrl)} alt={`${member.firstName} ${member.lastName}`} className="w-10 h-10 rounded-full object-cover flex-shrink-0" />
                  ) : (
                    <div className={`w-10 h-10 ${getGradientClass(index)} rounded-full flex items-center justify-center flex-shrink-0`}>
                      <span className="text-white font-bold text-xs">{getInitials(member)}</span>
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-fixed text-sm leading-tight" data-testid={`staff-name-${member.id}`}>{member.firstName} {member.lastName}</p>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-variable mt-0.5">
                      <span>{member.department}</span>
                      {member.isFireMarshal && <span className="text-orange-600 font-medium">🚨 {t('badges.fireMarshal')}</span>}
                      {(member as any).zoneId && (() => {
                        const zone = zones.find((z: any) => z.id === (member as any).zoneId);
                        return zone ? (
                          <span className="inline-flex items-center gap-1">
                            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: zone.color }} />{zone.name}
                          </span>
                        ) : null;
                      })()}
                    </div>
                  </div>
                  {/* Desktop: actions inline */}
                  <div className="hidden sm:flex items-center gap-2 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                    <span className={`inline-flex items-center px-2 py-1 rounded-full text-[10px] font-medium ${member.isCheckedIn ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>
                      {member.isCheckedIn ? t('common:onSite') : t('common:offSite')}
                    </span>
                    {getStaffLoneWorkerSession(member.id) && (
                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-medium bg-amber-100 text-amber-800 animate-pulse">
                        <Shield size={9} />{getLoneWorkerCountdown(getStaffLoneWorkerSession(member.id))}
                      </span>
                    )}
                    <Button size="sm" variant="ghost" onClick={() => setEditingStaff(member)} className="h-8 w-8 p-0" title={t('common:edit')}><Edit size={14} /></Button>
                    <Button size="sm" variant="ghost" onClick={() => setQrPassStaff(member)} className="h-8 w-8 p-0 text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50" title={t('qrPass')}><QrCode size={14} /></Button>
                    {(() => {
                      const lwSession = getStaffLoneWorkerSession(member.id);
                      return lwSession ? (
                        <Button size="sm" variant="ghost" onClick={() => endLoneWorkerMutation.mutate(member.id)} disabled={endLoneWorkerMutation.isPending} className="h-8 w-8 p-0 text-amber-600 hover:text-amber-700 hover:bg-amber-50" title={t('endLoneWorkerSession')}><ShieldOff size={14} /></Button>
                      ) : (member.isCheckedIn && companySettings?.loneWorkerEnabled) ? (
                        <Button size="sm" variant="ghost" onClick={() => startLoneWorkerMutation.mutate(member.id)} disabled={startLoneWorkerMutation.isPending || !member.email} className="h-8 w-8 p-0 text-slate-400 hover:text-green-700 hover:bg-green-50" title={member.email ? t('startLoneWorkerSession') : t('staffNeedsEmail')}><Shield size={14} /></Button>
                      ) : null;
                    })()}
                    {member.isActive && (
                      !member.isCheckedIn ? (
                        <Button size="sm" variant="outline" onClick={() => checkInMutation.mutate(member.id)} disabled={checkInMutation.isPending} className="h-9 px-3 text-green-600 border-green-300 hover:bg-green-50"><UserCheck size={15} className="mr-1" />{t('common:checkIn')}</Button>
                      ) : (
                        <Button size="sm" variant="outline" onClick={() => checkOutMutation.mutate(member.id)} disabled={checkOutMutation.isPending} className="h-9 px-3 text-red-600 border-red-300 hover:bg-red-50"><UserX size={15} className="mr-1" />{t('common:checkOut')}</Button>
                      )
                    )}
                  </div>
                </div>
                {/* Mobile: actions as bottom row */}
                <div className="sm:hidden flex items-center justify-between gap-2 px-3 pb-3 pt-1" onClick={(e) => e.stopPropagation()}>
                  <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${member.isCheckedIn ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>
                    {member.isCheckedIn ? t('common:onSite') : t('common:offSite')}
                  </span>
                  <div className="flex items-center gap-2">
                    <Button size="sm" variant="ghost" onClick={() => setEditingStaff(member)} className="h-9 w-9 p-0" title={t('common:edit')}><Edit size={15} /></Button>
                    <Button size="sm" variant="ghost" onClick={() => setQrPassStaff(member)} className="h-9 w-9 p-0 text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50" title={t('qrPass')}><QrCode size={15} /></Button>
                    {(() => {
                      const lwSession = getStaffLoneWorkerSession(member.id);
                      return lwSession ? (
                        <Button size="sm" variant="ghost" onClick={() => endLoneWorkerMutation.mutate(member.id)} disabled={endLoneWorkerMutation.isPending} className="h-9 w-9 p-0 text-amber-600 hover:text-amber-700 hover:bg-amber-50" title={t('endLoneWorkerSession')}><ShieldOff size={15} /></Button>
                      ) : (member.isCheckedIn && companySettings?.loneWorkerEnabled) ? (
                        <Button size="sm" variant="ghost" onClick={() => startLoneWorkerMutation.mutate(member.id)} disabled={startLoneWorkerMutation.isPending || !member.email} className="h-9 w-9 p-0 text-slate-400 hover:text-green-700 hover:bg-green-50" title={member.email ? t('startLoneWorkerSession') : t('staffNeedsEmail')}><Shield size={15} /></Button>
                      ) : null;
                    })()}
                    {member.isActive && (
                      !member.isCheckedIn ? (
                        <Button size="sm" variant="outline" onClick={() => checkInMutation.mutate(member.id)} disabled={checkInMutation.isPending} className="h-9 px-3 font-medium text-green-600 border-green-300 hover:bg-green-50"><UserCheck size={14} className="mr-1" />{t('common:checkIn')}</Button>
                      ) : (
                        <Button size="sm" variant="outline" onClick={() => checkOutMutation.mutate(member.id)} disabled={checkOutMutation.isPending} className="h-9 px-3 font-medium text-red-600 border-red-300 hover:bg-red-50"><UserX size={14} className="mr-1" />{t('common:checkOut')}</Button>
                      )
                    )}
                  </div>
                </div>
              </div>
            )
          ))
        )}
      </div>

      <AddStaffModal 
        isOpen={isAddModalOpen || !!editingStaff} 
        onClose={() => {
          setIsAddModalOpen(false);
          setEditingStaff(null);
        }}
        staffToEdit={editingStaff}
      />

      {/* Staff Profile Card Dialog */}
      <Dialog open={!!viewingStaff} onOpenChange={(open) => { if (!open) setViewingStaff(null); }}>
        <DialogContent className="sm:max-w-lg p-0 overflow-hidden rounded-2xl" aria-describedby={undefined}>
          <DialogTitle className="sr-only">{t('dialogs.profileHiddenTitle')}</DialogTitle>
          {viewingStaff && (
            <StaffProfilePanel
              staff={viewingStaff as any}
              zone={(zones as any[]).find((z: any) => z.id === (viewingStaff as any).zoneId)}
              staffPhotoInputId={staffPhotoInputId}
              isUploadingStaffPhoto={isUploadingStaffPhoto}
              handleStaffPhotoUpload={handleStaffPhotoUpload}
              getFullName={getFullName}
              getInitials={getInitials}
              getAccessLevelBadgeColor={getAccessLevelBadgeColor}
              getAccessLevelIcon={getAccessLevelIcon}
              getAccessLevelLabel={getAccessLevelLabel}
              onEdit={() => { setViewingStaff(null); setEditingStaff(viewingStaff); }}
              onQrPass={() => { setViewingStaff(null); setQrPassStaff(viewingStaff); }}
            />
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!qrPassStaff} onOpenChange={(open) => { if (!open) { setQrPassStaff(null); setQrPassData(null); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <QrCode className="w-5 h-5 text-indigo-600" />
              {t('dialogs.qrPass')}
            </DialogTitle>
            <DialogDescription>
              {t('qrPassDesc', { firstName: qrPassStaff?.firstName, lastName: qrPassStaff?.lastName })}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="p-3 bg-indigo-50 rounded-lg border border-indigo-200">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full flex items-center justify-center">
                  <span className="text-white font-bold text-sm">
                    {qrPassStaff ? `${qrPassStaff.firstName[0]}${qrPassStaff.lastName[0]}` : ''}
                  </span>
                </div>
                <div>
                  <p className="font-semibold text-gray-800">{qrPassStaff?.firstName} {qrPassStaff?.lastName}</p>
                  <p className="text-sm text-gray-600">{qrPassStaff?.department} | {t('common:id')}: {qrPassStaff?.employeeId}</p>
                </div>
              </div>
            </div>

            {qrPassData && (
              <div className="text-center p-4 bg-white rounded-lg border">
                <img 
                  src=""
                  alt={t('qrPass')}
                  className="w-40 h-40 mx-auto mb-2 rounded-lg shadow-sm"
                  ref={el => { if (!el || !qrPassData?.qrCode) return; import('qrcode').then(Q => Q.toDataURL(qrPassData.qrCode, { width: 160, margin: 1 })).then(u => { el.src = u; }); }}
                />
                <p className="text-xs text-gray-500 font-mono">{qrPassData.qrCode}</p>
              </div>
            )}

            <div className="grid grid-cols-1 gap-3">
              <Button
                onClick={() => qrPassStaff && sendQrPassMutation.mutate({ id: qrPassStaff.id, method: 'email' })}
                disabled={sendQrPassMutation.isPending}
                className="w-full justify-start gap-3 h-14 bg-blue-600 hover:bg-blue-700 text-white"
              >
                <Mail size={20} />
                <div className="text-left">
                  <div className="font-medium">{t('sendViaEmail')}</div>
                  <div className="text-xs opacity-80">{t('sendEmailTo', { email: qrPassStaff?.email })}</div>
                </div>
              </Button>

              <Button
                variant="outline"
                onClick={() => {
                  if (!qrPassStaff) return;
                  sendQrPassMutation.mutate({ id: qrPassStaff.id, method: 'print' }, {
                    onSuccess: (data) => {
                      handlePrintQrPass(
                        data.qrCode,
                        data.staffName,
                        data.department,
                        data.employeeId,
                        qrPassStaff?.photoUrl,
                        qrPassStaff?.email,
                        qrPassStaff?.jobTitle
                      );
                    }
                  });
                }}
                disabled={sendQrPassMutation.isPending}
                className="w-full justify-start gap-3 h-14"
              >
                <Printer size={20} className="text-green-600" />
                <div className="text-left">
                  <div className="font-medium">{t('common:print')} {t('qrPass')}</div>
                  <div className="text-xs text-gray-500">{t('printDesc')}</div>
                </div>
              </Button>

              <Button
                variant="outline"
                onClick={() => {
                  if (!qrPassStaff) return;
                  sendQrPassMutation.mutate({ id: qrPassStaff.id, method: 'download' }, {
                    onSuccess: (data) => {
                      handleDownloadQrPass(
                        data.qrCode, data.staffName, data.department, data.employeeId,
                        qrPassStaff?.photoUrl,
                        qrPassStaff?.email,
                        qrPassStaff?.jobTitle
                      );
                    }
                  });
                }}
                disabled={sendQrPassMutation.isPending}
                className="w-full justify-start gap-3 h-14"
              >
                <Download size={20} className="text-purple-600" />
                <div className="text-left">
                  <div className="font-medium">{t('common:download')} {t('qrPass')}</div>
                  <div className="text-xs text-gray-500">{t('downloadDesc')}</div>
                </div>
              </Button>

              <Button
                variant="outline"
                onClick={() => {
                  if (!qrPassStaff) return;
                  const staffName = `${qrPassStaff.firstName} ${qrPassStaff.lastName}`;
                  handleDownloadWalletPass(qrPassStaff.id, staffName);
                }}
                disabled={isDownloadingWalletPass || sendQrPassMutation.isPending}
                className="w-full justify-start gap-3 h-14"
              >
                {isDownloadingWalletPass ? (
                  <Loader2 size={20} className="text-gray-500 animate-spin" />
                ) : (
                  <Wallet size={20} className="text-gray-700 dark:text-gray-300" />
                )}
                <div className="text-left">
                  <div className="font-medium">{t('downloadWalletPass')}</div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">
                    {t('walletPassDesc')}
                  </div>
                </div>
              </Button>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => { setQrPassStaff(null); setQrPassData(null); }}>
              {t('common:close')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Remove Duplicates — confirmation */}
      <Dialog open={showRemoveDuplicatesConfirm} onOpenChange={setShowRemoveDuplicatesConfirm}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Trash2 size={18} className="text-orange-500" />
              Remove Duplicate Staff
            </DialogTitle>
            <DialogDescription>
              This will scan all staff records and permanently delete any duplicates that share the same first and last name — keeping the oldest record for each person.
              <br /><br />
              <strong>This cannot be undone.</strong> Are you sure you want to continue?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowRemoveDuplicatesConfirm(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => removeDuplicatesMutation.mutate()}
              disabled={removeDuplicatesMutation.isPending}
            >
              {removeDuplicatesMutation.isPending ? (
                <><Loader2 size={14} className="mr-1.5 animate-spin" /> Removing…</>
              ) : "Yes, Remove Duplicates"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Remove Duplicates — results */}
      <Dialog open={!!removeDuplicatesResult} onOpenChange={(open) => { if (!open) setRemoveDuplicatesResult(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Duplicates Removed</DialogTitle>
            <DialogDescription>
              {removeDuplicatesResult?.removed === 0
                ? "No duplicate staff records were found."
                : `${removeDuplicatesResult?.removed} duplicate record${(removeDuplicatesResult?.removed ?? 0) > 1 ? 's' : ''} removed.`}
            </DialogDescription>
          </DialogHeader>
          {(removeDuplicatesResult?.duplicateNames?.length ?? 0) > 0 && (
            <div className="text-sm text-muted-foreground space-y-1 max-h-48 overflow-y-auto">
              <p className="font-medium text-foreground mb-1">Affected names:</p>
              {removeDuplicatesResult!.duplicateNames.map((name, i) => (
                <div key={i} className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-orange-400 flex-shrink-0" />
                  {name}
                </div>
              ))}
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => setRemoveDuplicatesResult(null)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <QRScannerModal isOpen={showQRScanner} onClose={() => setShowQRScanner(false)} />
    </div>
  );
}
