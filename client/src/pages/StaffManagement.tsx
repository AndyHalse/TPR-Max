import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import { queryClient } from "@/lib/queryClient";
import { apiRequest } from "@/lib/queryClient";
import GlassCard from "@/components/GlassCard";
import AddStaffModal from "@/components/AddStaffModal";
import { Plus, Edit, Trash2, UserCheck, UserX, Clock, QrCode, Mail, Printer, Download, LayoutGrid, LayoutList, Search, Phone, Briefcase, MapPin, Camera, Wallet, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import type { Staff } from "@shared/schema";
import QRScannerModal from "@/components/QRScannerModal";

export default function StaffManagement() {
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingStaff, setEditingStaff] = useState<Staff | null>(null);
  const [showQRScanner, setShowQRScanner] = useState(false);
  const [viewingStaff, setViewingStaff] = useState<Staff | null>(null);
  const [qrPassStaff, setQrPassStaff] = useState<Staff | null>(null);
  const [qrPassData, setQrPassData] = useState<{ qrCode: string; staffName: string } | null>(null);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('list');
  const [searchTerm, setSearchTerm] = useState("");
  const [isUploadingStaffPhoto, setIsUploadingStaffPhoto] = useState(false);
  const [isDownloadingWalletPass, setIsDownloadingWalletPass] = useState(false);
  const staffPhotoInputId = "staff-photo-upload-input";
  const { toast } = useToast();

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
        title: "Success",
        description: "Staff member deleted successfully",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to delete staff member",
        variant: "destructive",
      });
    },
  });

  const checkInMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("POST", `/api/staff/${id}/checkin`, { manual: true });
    },
    onSuccess: () => {
      // Invalidate the correct query based on context
      const queryKey = isTenantView ? [`/api/tenants/${slug}/staff`] : ["/api/staff"];
      queryClient.invalidateQueries({ queryKey });
      queryClient.invalidateQueries({ queryKey: ["/api/staff/checked-in"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/activity/recent"] });
      queryClient.invalidateQueries({ queryKey: ["/api/muster"] });
      toast({
        title: "Success",
        description: "Staff member checked in successfully",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to check in staff member",
        variant: "destructive",
      });
    },
  });

  const checkOutMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("POST", `/api/staff/${id}/checkout`);
    },
    onSuccess: () => {
      // Invalidate the correct query based on context
      const queryKey = isTenantView ? [`/api/tenants/${slug}/staff`] : ["/api/staff"];
      queryClient.invalidateQueries({ queryKey });
      queryClient.invalidateQueries({ queryKey: ["/api/staff/checked-in"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/activity/recent"] });
      queryClient.invalidateQueries({ queryKey: ["/api/muster"] });
      toast({
        title: "Success",
        description: "Staff member checked out successfully",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to check out staff member",
        variant: "destructive",
      });
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
          title: "QR Pass Sent",
          description: data.message || "QR check-in pass has been emailed to the staff member",
        });
        // Keep the dialog open so the user can see / scan the QR code directly
      }
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to send QR pass",
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
      toast({ title: "Photo updated", description: "Staff photo saved successfully." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to save staff photo.", variant: "destructive" });
    },
  });

  const handleStaffPhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !viewingStaff) return;
    let base64: string;
    try {
      base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (ev) => resolve((ev.target?.result as string).split(',')[1]);
        reader.onerror = () => reject(new Error('Failed to read file'));
        reader.readAsDataURL(file);
      });
    } catch {
      toast({ title: "Error", description: "Could not read the file. Please try again.", variant: "destructive" });
      return;
    }
    setIsUploadingStaffPhoto(true);
    try {
      const uploadRes = await apiRequest("POST", "/api/objects/upload", { data: base64, mimeType: file.type });
      const { objectPath } = await uploadRes.json();
      updateStaffPhotoMutation.mutate({ staffId: viewingStaff.id, photoUrl: objectPath });
    } catch {
      toast({ title: "Error", description: "Failed to upload photo.", variant: "destructive" });
    } finally {
      setIsUploadingStaffPhoto(false);
      e.target.value = "";
    }
  };

  const { data: zones = [] } = useQuery<any[]>({ queryKey: ["/api/zones"] });

  const { data: companySettings } = useQuery<any>({ queryKey: ['/api/settings'] });

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

  const getBrandedPassHtml = (
    qrCode: string, staffName: string, department: string, employeeId: string,
    photoUrl?: string | null, email?: string | null, jobTitle?: string | null
  ) => {
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(qrCode)}`;
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
            <div style="color:${variableTextColor};opacity:0.7;font-size:7px;letter-spacing:0.6px;text-transform:uppercase;margin-top:1px;">Staff ID Pass</div>
          </div>
          <div style="background:${variableTextColor};border-radius:4px;padding:2px 6px;white-space:nowrap;">
            <div style="color:${brandColor};font-size:6.5px;font-weight:700;letter-spacing:0.5px;">STAFF</div>
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
            <span style="font-size:7.5px;color:#555;font-family:monospace;font-weight:600;">ID: ${employeeId}</span>
          </div>
        </div>
        <div style="background:#f9fafb;border-top:1px solid #f0f0f0;padding:8px 10px;display:flex;align-items:center;gap:8px;">
          <div style="flex:1;">
            <div style="font-size:7px;color:#999;line-height:1.4;">Scan at kiosk to<br>check in / check out</div>
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
    toast({ title: "Generating Pass", description: "Creating staff ID card image..." });
    setQrPassStaff(null);
    setQrPassData(null);

    const { brandColor, variableTextColor, companyName, logoUrl } = getPassBranding();
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(qrCode)}`;

    const resolveUrl = (path: string | null | undefined) => path
      ? (path.startsWith('http') ? path : `${window.location.origin}/objects${path.startsWith('/') ? '' : '/'}${path}`)
      : null;

    const [qrImg, logoImg, photoImg] = await Promise.all([
      loadImageAsDataUrl(qrUrl),
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
    ctx.fillText('Staff ID Pass', logoEndX, hCY + 10);
    ctx.globalAlpha = 1;

    // STAFF badge (right of header) — variableTextColor bg, brandColor text for contrast
    ctx.fillStyle = variableTextColor;
    roundRect(cX + cW - 50, cY + headerH / 2 - 13, 40, 22, 5);
    ctx.fill();
    ctx.fillStyle = brandColor;
    ctx.font = 'bold 8px "Segoe UI", Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('STAFF', cX + cW - 30, cY + headerH / 2 + 3);

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
    const idText = `ID: ${employeeId}`;
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
    ctx.fillText('Scan at kiosk to', cX + 16, footerY + 30);
    ctx.font = '8px "Segoe UI", Arial, sans-serif';
    ctx.fillText('check in / check out', cX + 16, footerY + 44);

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
      toast({ title: "Download Complete", description: "Staff ID card saved to your downloads" });
    }, 'image/png');
  };

  const handlePrintQrPass = (
    qrCode: string, staffName: string, department: string, employeeId: string,
    photoUrl?: string | null, email?: string | null, jobTitle?: string | null
  ) => {
    const passHtml = getBrandedPassHtml(qrCode, staffName, department, employeeId, photoUrl, email, jobTitle);
    const printWindow = window.open('', '_blank', 'width=440,height=700');
    if (printWindow) {
      printWindow.document.write(`
        <html>
          <head>
            <title>Staff ID Pass - ${staffName}</title>
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
        throw new Error(err.error || 'Failed to generate wallet pass');
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
      toast({ title: 'Wallet Pass Downloaded', description: 'Open the .pkpass file to add it to Apple Wallet or a compatible wallet app.' });
    } catch (err: any) {
      toast({ title: 'Download Failed', description: err.message || 'Could not generate wallet pass', variant: 'destructive' });
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
        return 'Administrator';
      default:
        return 'Standard User';
    }
  };

  if (isLoading) {
    return <div>Loading staff...</div>;
  }

  const filteredStaff = (staff || []).filter(member => {
    if (!searchTerm) return true;
    const search = searchTerm.toLowerCase();
    const fullName = `${member.firstName} ${member.lastName}`.toLowerCase();
    return fullName.includes(search) || member.email?.toLowerCase().includes(search) || member.department?.toLowerCase().includes(search);
  });

  return (
    <div className="space-y-4 sm:space-y-8 p-3 sm:p-6 rounded-xl bg-background min-h-screen">
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-xl sm:text-2xl font-bold text-fixed">Staff Management</h2>
          <div className="flex items-center gap-2">
            <Button
              onClick={() => setShowQRScanner(true)}
              className="bg-blue-600 hover:bg-blue-700 text-white font-semibold flex items-center gap-2 px-3 sm:px-4 py-2 sm:py-2.5 text-sm sm:text-base"
              title="Scan a staff QR code to check in / out"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 sm:w-5 sm:h-5 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="3" y="14" width="7" height="7" />
                <path d="M14 14h1v1h-1zm3 0h1v1h-1zm-3 3h1v1h-1zm3 3h1v1h-1zm3-3h1v1h-1zm0-3h1v1h-1z" />
              </svg>
              <span className="hidden sm:inline">Scan QR</span>
              <span className="sm:hidden">Scan</span>
            </Button>
            <Button onClick={() => setIsAddModalOpen(true)} className="gradient-blue text-white font-medium hover:shadow-lg transition-all duration-300 whitespace-nowrap" data-testid="button-add-staff">
              <Plus className="mr-1.5 sm:mr-2" size={16} />
              <span className="hidden sm:inline text-sm sm:text-base">Add Staff Member</span>
              <span className="sm:hidden text-sm">Add</span>
            </Button>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-variable" />
            <Input placeholder="Search staff..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-10" />
          </div>
          <div className="flex items-center gap-1">
            <Button variant={viewMode === 'grid' ? 'default' : 'outline'} size="sm" onClick={() => setViewMode('grid')} className="h-8 w-8 p-0" title="Grid view">
              <LayoutGrid size={14} />
            </Button>
            <Button variant={viewMode === 'list' ? 'default' : 'outline'} size="sm" onClick={() => setViewMode('list')} className="h-8 w-8 p-0" title="List view">
              <LayoutList size={14} />
            </Button>
          </div>
        </div>
      </div>

      {/* Staff Grid */}
      <div className={viewMode === 'grid' ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-6" : "space-y-2"}>
        {filteredStaff.length === 0 ? (
          <div className="col-span-full text-center py-12">
            <p className="text-variable text-lg">No staff members found</p>
            <p className="text-variable text-sm mt-2">Add your first staff member to get started</p>
          </div>
        ) : (
          filteredStaff.map((member, index) => (
            viewMode === 'grid' ? (
              <GlassCard key={member.id} hover>
                <div className="flex items-start space-x-3 mb-3 cursor-pointer group" onClick={() => setViewingStaff(member)} title="View profile">
                  {member.photoUrl ? (
                    <img 
                      src={member.photoUrl} 
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
                        {member.isActive ? 'Active' : 'Inactive'}
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
                      🚨 Fire Marshal
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
                      {new Date(member.checkedInAt).toLocaleTimeString([], { 
                        hour: '2-digit', 
                        minute: '2-digit' 
                      })}
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
                      title="Edit"
                    >
                      <Edit size={15} />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setQrPassStaff(member)}
                      className="h-8 w-8 p-0 text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50"
                      data-testid={`button-qr-pass-${member.id}`}
                      title="QR Pass"
                    >
                      <QrCode size={15} />
                    </Button>
                    <Button 
                      size="sm" 
                      variant="ghost" 
                      onClick={() => deleteMutation.mutate(member.id)}
                      disabled={deleteMutation.isPending}
                      className="h-8 w-8 p-0 text-red-500 hover:text-red-700 hover:bg-red-50"
                      data-testid={`button-delete-staff-${member.id}`}
                      title="Delete"
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
                          title="Manual check-in"
                        >
                          <UserCheck size={16} className="mr-1.5" />
                          Check In
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => checkOutMutation.mutate(member.id)}
                          disabled={checkOutMutation.isPending}
                          className="h-9 px-3 text-sm font-medium text-red-600 hover:text-red-700 border-red-300 hover:border-red-400 hover:bg-red-50"
                          data-testid={`button-checkout-${member.id}`}
                          title="Check out"
                        >
                          <UserX size={16} className="mr-1.5" />
                          Check Out
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
                    <img src={member.photoUrl} alt={`${member.firstName} ${member.lastName}`} className="w-10 h-10 rounded-full object-cover flex-shrink-0" />
                  ) : (
                    <div className={`w-10 h-10 ${getGradientClass(index)} rounded-full flex items-center justify-center flex-shrink-0`}>
                      <span className="text-white font-bold text-xs">{getInitials(member)}</span>
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-fixed text-sm leading-tight" data-testid={`staff-name-${member.id}`}>{member.firstName} {member.lastName}</p>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-variable mt-0.5">
                      <span>{member.department}</span>
                      {member.isFireMarshal && <span className="text-orange-600 font-medium">🚨 FM</span>}
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
                      {member.isCheckedIn ? 'On Site' : 'Off Site'}
                    </span>
                    <Button size="sm" variant="ghost" onClick={() => setEditingStaff(member)} className="h-8 w-8 p-0" title="Edit"><Edit size={14} /></Button>
                    <Button size="sm" variant="ghost" onClick={() => setQrPassStaff(member)} className="h-8 w-8 p-0 text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50" title="QR Pass"><QrCode size={14} /></Button>
                    {member.isActive && (
                      !member.isCheckedIn ? (
                        <Button size="sm" variant="outline" onClick={() => checkInMutation.mutate(member.id)} disabled={checkInMutation.isPending} className="h-9 px-3 text-green-600 border-green-300 hover:bg-green-50"><UserCheck size={15} className="mr-1" />Check In</Button>
                      ) : (
                        <Button size="sm" variant="outline" onClick={() => checkOutMutation.mutate(member.id)} disabled={checkOutMutation.isPending} className="h-9 px-3 text-red-600 border-red-300 hover:bg-red-50"><UserX size={15} className="mr-1" />Check Out</Button>
                      )
                    )}
                  </div>
                </div>
                {/* Mobile: actions as bottom row */}
                <div className="sm:hidden flex items-center justify-between gap-2 px-3 pb-3 pt-1" onClick={(e) => e.stopPropagation()}>
                  <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${member.isCheckedIn ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>
                    {member.isCheckedIn ? 'On Site' : 'Off Site'}
                  </span>
                  <div className="flex items-center gap-2">
                    <Button size="sm" variant="ghost" onClick={() => setEditingStaff(member)} className="h-9 w-9 p-0" title="Edit"><Edit size={15} /></Button>
                    <Button size="sm" variant="ghost" onClick={() => setQrPassStaff(member)} className="h-9 w-9 p-0 text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50" title="QR Pass"><QrCode size={15} /></Button>
                    {member.isActive && (
                      !member.isCheckedIn ? (
                        <Button size="sm" variant="outline" onClick={() => checkInMutation.mutate(member.id)} disabled={checkInMutation.isPending} className="h-9 px-3 font-medium text-green-600 border-green-300 hover:bg-green-50"><UserCheck size={14} className="mr-1" />Check In</Button>
                      ) : (
                        <Button size="sm" variant="outline" onClick={() => checkOutMutation.mutate(member.id)} disabled={checkOutMutation.isPending} className="h-9 px-3 font-medium text-red-600 border-red-300 hover:bg-red-50"><UserX size={14} className="mr-1" />Check Out</Button>
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
        <DialogContent className="sm:max-w-sm p-0 overflow-hidden rounded-2xl" aria-describedby={undefined}>
          <DialogTitle className="sr-only">Staff Profile</DialogTitle>
          {viewingStaff && (() => {
            const vs = viewingStaff as any;
            const zone = zones.find((z: any) => z.id === vs.zoneId);
            return (
              <>
                {/* Slim top bar */}
                <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-4 py-2 pr-10">
                  <p className="text-white/80 text-[10px] font-medium uppercase tracking-widest">Staff Profile · {vs.employeeId}</p>
                </div>

                {/* Photo + details — no overlap, clean layout */}
                <div className="flex flex-col items-center px-6 pt-5 pb-6">
                  {/* Hidden file input */}
                  <input
                    type="file"
                    accept="image/*"
                    id={staffPhotoInputId}
                    className="hidden"
                    onChange={handleStaffPhotoUpload}
                  />

                  {/* Avatar with upload overlay */}
                  <div className="relative group">
                    <div className="w-36 h-36 rounded-full border-4 border-blue-100 shadow-xl overflow-hidden bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center">
                      {vs.photoUrl ? (
                        <img src={vs.photoUrl} alt={getFullName(vs)} className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-white font-bold text-4xl">{getInitials(vs)}</span>
                      )}
                    </div>
                    <label
                      htmlFor={staffPhotoInputId}
                      className="absolute inset-0 rounded-full flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 cursor-pointer transition-opacity"
                      title="Upload photo"
                    >
                      {isUploadingStaffPhoto ? (
                        <div className="animate-spin h-6 w-6 border-2 border-white border-t-transparent rounded-full" />
                      ) : (
                        <Camera size={24} className="text-white" />
                      )}
                    </label>
                  </div>

                  <h2 className="mt-3 text-xl font-bold text-gray-900">{getFullName(vs)}</h2>
                  {vs.jobTitle && <p className="text-sm text-gray-500 mt-0.5">{vs.jobTitle}</p>}

                  {/* Status + role badges */}
                  <div className="flex items-center gap-2 mt-2 flex-wrap justify-center">
                    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${vs.isActive ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'}`}>
                      {vs.isActive ? '● Active' : '● Inactive'}
                    </span>
                    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${getAccessLevelBadgeColor(vs.accessLevel || 'staff')}`}>
                      {getAccessLevelIcon(vs.accessLevel || 'staff')} {getAccessLevelLabel(vs.accessLevel || 'staff')}
                    </span>
                    {vs.isFireMarshal && (
                      <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-orange-100 text-orange-800">
                        🚨 Fire Marshal
                      </span>
                    )}
                    {vs.isCheckedIn && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-100 text-blue-800">
                        <Clock size={10} /> On Site
                      </span>
                    )}
                  </div>

                  {/* Details grid */}
                  <div className="mt-5 w-full space-y-3 border-t pt-4">
                    <div className="flex items-center gap-3 text-sm">
                      <div className="w-7 h-7 rounded-full bg-blue-50 flex items-center justify-center flex-shrink-0">
                        <Mail size={13} className="text-blue-600" />
                      </div>
                      <span className="text-gray-700 break-all">{vs.email || '—'}</span>
                    </div>
                    {vs.phoneNumber && (
                      <div className="flex items-center gap-3 text-sm">
                        <div className="w-7 h-7 rounded-full bg-blue-50 flex items-center justify-center flex-shrink-0">
                          <Phone size={13} className="text-blue-600" />
                        </div>
                        <span className="text-gray-700">{vs.phoneNumber}</span>
                      </div>
                    )}
                    <div className="flex items-center gap-3 text-sm">
                      <div className="w-7 h-7 rounded-full bg-blue-50 flex items-center justify-center flex-shrink-0">
                        <Briefcase size={13} className="text-blue-600" />
                      </div>
                      <span className="text-gray-700">{vs.department || '—'}</span>
                    </div>
                    {zone && (
                      <div className="flex items-center gap-3 text-sm">
                        <div className="w-7 h-7 rounded-full bg-blue-50 flex items-center justify-center flex-shrink-0">
                          <MapPin size={13} className="text-blue-600" />
                        </div>
                        <span className="flex items-center gap-1.5 text-gray-700">
                          <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: zone.color }} />
                          {zone.name}
                        </span>
                      </div>
                    )}
                    {vs.isCheckedIn && vs.checkedInAt && (
                      <div className="flex items-center gap-3 text-sm">
                        <div className="w-7 h-7 rounded-full bg-green-50 flex items-center justify-center flex-shrink-0">
                          <Clock size={13} className="text-green-600" />
                        </div>
                        <span className="text-gray-700">
                          Signed in at {new Date(vs.checkedInAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Action buttons */}
                  <div className="flex gap-2 mt-5 w-full">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1 text-xs"
                      onClick={() => { setViewingStaff(null); setEditingStaff(viewingStaff); }}
                    >
                      <Edit size={13} className="mr-1" /> Edit Profile
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1 text-xs text-indigo-600 border-indigo-300 hover:bg-indigo-50"
                      onClick={() => { setViewingStaff(null); setQrPassStaff(viewingStaff); }}
                    >
                      <QrCode size={13} className="mr-1" /> QR Pass
                    </Button>
                  </div>
                </div>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>

      <Dialog open={!!qrPassStaff} onOpenChange={(open) => { if (!open) { setQrPassStaff(null); setQrPassData(null); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <QrCode className="w-5 h-5 text-indigo-600" />
              Staff QR Check-In Pass
            </DialogTitle>
            <DialogDescription>
              Send a QR code pass to {qrPassStaff?.firstName} {qrPassStaff?.lastName} for quick kiosk check-in and check-out.
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
                  <p className="text-sm text-gray-600">{qrPassStaff?.department} | ID: {qrPassStaff?.employeeId}</p>
                </div>
              </div>
            </div>

            {qrPassData && (
              <div className="text-center p-4 bg-white rounded-lg border">
                <img 
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(qrPassData.qrCode)}`}
                  alt="Staff QR Code"
                  className="w-40 h-40 mx-auto mb-2 rounded-lg shadow-sm"
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
                  <div className="font-medium">Email QR Pass</div>
                  <div className="text-xs opacity-80">Send branded pass with QR code to {qrPassStaff?.email}</div>
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
                  <div className="font-medium">Print QR Pass</div>
                  <div className="text-xs text-gray-500">Print a card-sized pass with QR code</div>
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
                  <div className="font-medium">Download QR Image</div>
                  <div className="text-xs text-gray-500">Download branded pass as image</div>
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
                  <div className="font-medium">Download Wallet Pass</div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">
                    Download .pkpass for Apple Wallet &amp; compatible apps
                  </div>
                </div>
              </Button>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => { setQrPassStaff(null); setQrPassData(null); }}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <QRScannerModal isOpen={showQRScanner} onClose={() => setShowQRScanner(false)} />
    </div>
  );
}
