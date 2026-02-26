import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import { queryClient } from "@/lib/queryClient";
import { apiRequest } from "@/lib/queryClient";
import GlassCard from "@/components/GlassCard";
import AddStaffModal from "@/components/AddStaffModal";
import { Plus, Edit, Trash2, UserCheck, UserX, Clock, QrCode, Mail, Printer, Download, LayoutGrid, LayoutList, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import type { Staff } from "@shared/schema";

export default function StaffManagement() {
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingStaff, setEditingStaff] = useState<Staff | null>(null);
  const [qrPassStaff, setQrPassStaff] = useState<Staff | null>(null);
  const [qrPassData, setQrPassData] = useState<{ qrCode: string; staffName: string } | null>(null);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [searchTerm, setSearchTerm] = useState("");
  const { toast } = useToast();
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
      if (data.method === 'email') {
        toast({
          title: "QR Pass Sent",
          description: data.message || "QR check-in pass has been emailed to the staff member",
        });
        setQrPassStaff(null);
      } else {
        setQrPassData({ qrCode: data.qrCode, staffName: data.staffName });
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

  const { data: zones = [] } = useQuery<any[]>({ queryKey: ["/api/zones"] });

  const { data: companySettings } = useQuery<any>({ queryKey: ['/api/settings'] });

  const getPassBranding = () => {
    const brandColor = companySettings?.backgroundColor || companySettings?.primaryColor || '#2460A9';
    const accentColor = companySettings?.accentColor || brandColor;
    const companyName = companySettings?.companyName || 'Company';
    const logoPath = companySettings?.logoUrl || '';
    const logoUrl = logoPath
      ? (logoPath.startsWith('http')
        ? logoPath
        : `${window.location.origin}/objects${logoPath.startsWith('/') ? '' : '/'}${logoPath}`)
      : '';
    return { brandColor, accentColor, companyName, logoUrl };
  };

  const getBrandedPassHtml = (qrCode: string, staffName: string, department: string, employeeId: string) => {
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(qrCode)}`;
    const { brandColor, companyName, logoUrl } = getPassBranding();
    const logoHtml = logoUrl
      ? `<img src="${logoUrl}" style="max-height:40px;max-width:160px;margin:0 auto 6px auto;display:block;" crossorigin="anonymous">`
      : '';
    return `
      <div style="border:2px solid ${brandColor};border-radius:14px;padding:20px 18px;max-width:280px;margin:0 auto;font-family:'Segoe UI',Arial,sans-serif;text-align:center;background:#fff;">
        <div style="background:${brandColor};margin:-20px -18px 12px -18px;border-radius:12px 12px 0 0;padding:14px 12px 10px 12px;">
          ${logoHtml}
          <div style="color:#fff;font-size:15px;font-weight:700;letter-spacing:0.5px;">${companyName}</div>
          <div style="color:rgba(255,255,255,0.8);font-size:10px;margin-top:2px;">STAFF CHECK-IN PASS</div>
        </div>
        <img src="${qrUrl}" style="width:180px;height:180px;margin:6px auto 10px auto;display:block;border-radius:8px;border:1px solid #e5e7eb;">
        <h3 style="margin:0 0 2px 0;font-size:16px;color:#111;">${staffName}</h3>
        <p style="margin:2px 0;color:#555;font-size:13px;">${department}</p>
        <p style="margin:2px 0;color:#888;font-size:11px;">ID: ${employeeId}</p>
        <div style="margin-top:10px;padding-top:8px;border-top:1px solid #e5e7eb;">
          <p style="margin:0;font-size:10px;color:#aaa;">Scan at kiosk to check in / check out</p>
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

  const handleDownloadQrPass = async (qrCode: string, staffName: string, department: string, employeeId: string) => {
    toast({ title: "Generating Pass", description: "Creating branded QR pass image..." });
    setQrPassStaff(null);
    setQrPassData(null);

    const { brandColor, companyName, logoUrl } = getPassBranding();

    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(qrCode)}`;

    const [qrImg, logoImg] = await Promise.all([
      loadImageAsDataUrl(qrUrl),
      logoUrl ? loadImageAsDataUrl(logoUrl) : Promise.resolve(null),
    ]);

    const scale = 2;
    const W = 320, H = 480;
    const canvas = document.createElement('canvas');
    canvas.width = W * scale;
    canvas.height = H * scale;
    const ctx = canvas.getContext('2d')!;
    ctx.scale(scale, scale);

    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, W, H);

    const cardX = 10, cardY = 10, cardW = W - 20, cardH = H - 20, cardR = 14;

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

    roundRect(cardX, cardY, cardW, cardH, cardR);
    ctx.strokeStyle = brandColor;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.save();
    ctx.clip();

    const headerH = logoImg ? 80 : 65;
    ctx.fillStyle = brandColor;
    ctx.fillRect(cardX, cardY, cardW, headerH);

    const cx = W / 2;
    ctx.textAlign = 'center';
    let textY = cardY + 24;

    if (logoImg) {
      const lh = 30;
      const lw = Math.min(140, (logoImg.naturalWidth / logoImg.naturalHeight) * lh);
      ctx.drawImage(logoImg, cx - lw / 2, cardY + 10, lw, lh);
      textY = cardY + 50;
    }

    ctx.fillStyle = '#fff';
    ctx.font = 'bold 13px "Segoe UI", Arial, sans-serif';
    ctx.fillText(companyName, cx, textY);
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.font = '9px "Segoe UI", Arial, sans-serif';
    ctx.fillText('STAFF CHECK-IN PASS', cx, textY + 15);

    const qrY = cardY + headerH + 14;
    const qrSize = 170;
    if (qrImg) {
      ctx.drawImage(qrImg, cx - qrSize / 2, qrY, qrSize, qrSize);
    }

    const infoY = qrY + qrSize + 18;
    ctx.fillStyle = '#111';
    ctx.font = 'bold 17px "Segoe UI", Arial, sans-serif';
    ctx.fillText(staffName, cx, infoY);
    ctx.fillStyle = '#555';
    ctx.font = '13px "Segoe UI", Arial, sans-serif';
    ctx.fillText(department, cx, infoY + 22);
    ctx.fillStyle = '#888';
    ctx.font = '11px "Segoe UI", Arial, sans-serif';
    ctx.fillText(`ID: ${employeeId}`, cx, infoY + 40);

    ctx.strokeStyle = '#e5e7eb';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cardX + 20, infoY + 54);
    ctx.lineTo(cardX + cardW - 20, infoY + 54);
    ctx.stroke();
    ctx.fillStyle = '#aaa';
    ctx.font = '9px "Segoe UI", Arial, sans-serif';
    ctx.fillText('Scan at kiosk to check in / check out', cx, infoY + 70);
    ctx.restore();

    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `qr-pass-${staffName.replace(/\s+/g, '-').toLowerCase()}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast({ title: "Download Complete", description: "Branded QR pass saved to your downloads" });
    }, 'image/png');
  };

  const handlePrintQrPass = (qrCode: string, staffName: string, department: string, employeeId: string) => {
    const passHtml = getBrandedPassHtml(qrCode, staffName, department, employeeId);
    const printWindow = window.open('', '_blank', 'width=400,height=600');
    if (printWindow) {
      printWindow.document.write(`
        <html>
          <head><title>Staff QR Pass - ${staffName}</title></head>
          <body style="margin:0;padding:20px;background:#fff;">
            ${passHtml}
            <script>
              var imgs = document.querySelectorAll('img');
              var total = imgs.length, loaded = 0;
              if (total === 0) window.print();
              imgs.forEach(function(img) {
                if (img.complete) { loaded++; if (loaded >= total) window.print(); }
                else { img.onload = function() { loaded++; if (loaded >= total) window.print(); }; img.onerror = function() { loaded++; if (loaded >= total) window.print(); }; }
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
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-0">
          <h2 className="text-xl sm:text-2xl font-bold text-fixed">Staff Management</h2>
          <Button onClick={() => setIsAddModalOpen(true)} className="gradient-blue text-white font-medium hover:shadow-lg transition-all duration-300 whitespace-nowrap" data-testid="button-add-staff">
            <Plus className="mr-1.5 sm:mr-2" size={16} />
            <span className="text-sm sm:text-base">Add Staff Member</span>
          </Button>
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
                <div className="flex items-start space-x-3 mb-3">
                  {member.photoUrl ? (
                    <img 
                      src={member.photoUrl} 
                      alt={getFullName(member)}
                      className="w-12 h-12 rounded-full object-cover flex-shrink-0"
                    />
                  ) : (
                    <div className={`w-12 h-12 ${getGradientClass(index)} rounded-full flex items-center justify-center flex-shrink-0`}>
                      <span className="text-white font-bold text-sm">{getInitials(member)}</span>
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <h3 className="font-semibold text-fixed text-sm truncate" data-testid={`staff-name-${member.id}`}>
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
              <div key={member.id} className="flex items-center justify-between p-3 bg-white/60 rounded-lg border border-white/30 hover:bg-white/80 transition-all">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  {member.photoUrl ? (
                    <img src={member.photoUrl} alt={`${member.firstName} ${member.lastName}`} className="w-8 h-8 rounded-full object-cover flex-shrink-0" />
                  ) : (
                    <div className={`w-8 h-8 ${getGradientClass(index)} rounded-full flex items-center justify-center flex-shrink-0`}>
                      <span className="text-white font-bold text-xs">{getInitials(member)}</span>
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <span className="font-semibold text-fixed text-sm">{member.firstName} {member.lastName}</span>
                    <div className="flex items-center gap-3 text-xs text-variable">
                      <span>{member.department}</span>
                      {member.email && <span className="hidden sm:inline">{member.email}</span>}
                      {(member as any).zoneId && (() => {
                        const zone = zones.find((z: any) => z.id === (member as any).zoneId);
                        return zone ? (
                          <span className="inline-flex items-center gap-1 text-xs">
                            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: zone.color }} />
                            {zone.name}
                          </span>
                        ) : null;
                      })()}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium ${member.isCheckedIn ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>
                    {member.isCheckedIn ? 'On Site' : 'Off Site'}
                  </span>
                  <Button size="sm" variant="ghost" onClick={() => setEditingStaff(member)} className="h-7 w-7 p-0" title="Edit"><Edit size={14} /></Button>
                  <Button size="sm" variant="ghost" onClick={() => setQrPassStaff(member)} className="h-7 w-7 p-0 text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50" title="QR Pass"><QrCode size={14} /></Button>
                  {member.isActive && (
                    !member.isCheckedIn ? (
                      <Button size="sm" variant="outline" onClick={() => checkInMutation.mutate(member.id)} disabled={checkInMutation.isPending} className="text-green-600 hover:text-green-700 border-green-300 hover:border-green-400 hover:bg-green-50">
                        <UserCheck size={16} className="mr-1" />
                        Check In
                      </Button>
                    ) : (
                      <Button size="sm" variant="outline" onClick={() => checkOutMutation.mutate(member.id)} disabled={checkOutMutation.isPending} className="text-red-600 hover:text-red-700 border-red-300 hover:border-red-400 hover:bg-red-50">
                        <UserX size={16} className="mr-1" />
                        Check Out
                      </Button>
                    )
                  )}
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
                        data.employeeId
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
                      handleDownloadQrPass(data.qrCode, data.staffName, data.department, data.employeeId);
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
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => { setQrPassStaff(null); setQrPassData(null); }}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
