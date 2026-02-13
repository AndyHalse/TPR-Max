import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import { queryClient } from "@/lib/queryClient";
import { apiRequest } from "@/lib/queryClient";
import GlassCard from "@/components/GlassCard";
import AddStaffModal from "@/components/AddStaffModal";
import { Plus, Edit, Trash2, UserCheck, UserX, Clock, QrCode, Mail, Printer, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import type { Staff } from "@shared/schema";

export default function StaffManagement() {
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingStaff, setEditingStaff] = useState<Staff | null>(null);
  const [qrPassStaff, setQrPassStaff] = useState<Staff | null>(null);
  const [qrPassData, setQrPassData] = useState<{ qrCode: string; staffName: string } | null>(null);
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

  const handleDownloadQrPass = (qrCode: string, staffName: string) => {
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodeURIComponent(qrCode)}`;
    const link = document.createElement('a');
    link.href = qrUrl;
    link.download = `qr-pass-${staffName.replace(/\s+/g, '-').toLowerCase()}.png`;
    link.target = '_blank';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast({ title: "Download Started", description: "QR pass image is downloading" });
    setQrPassStaff(null);
    setQrPassData(null);
  };

  const handlePrintQrPass = (qrCode: string, staffName: string, department: string, employeeId: string) => {
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(qrCode)}`;
    const printWindow = window.open('', '_blank', 'width=400,height=600');
    if (printWindow) {
      printWindow.document.write(`
        <html>
          <head><title>Staff QR Pass - ${staffName}</title></head>
          <body style="margin:0;padding:20px;font-family:Arial,sans-serif;text-align:center;">
            <div style="border:2px solid #333;border-radius:12px;padding:20px;max-width:300px;margin:0 auto;">
              <h2 style="margin:0 0 5px 0;font-size:18px;">Staff Check-In Pass</h2>
              <hr style="border:1px solid #ddd;margin:10px 0;">
              <img src="${qrUrl}" style="width:200px;height:200px;margin:10px auto;display:block;" onload="window.print();">
              <h3 style="margin:10px 0 2px 0;">${staffName}</h3>
              <p style="margin:2px 0;color:#666;font-size:14px;">${department}</p>
              <p style="margin:2px 0;color:#999;font-size:12px;">ID: ${employeeId}</p>
              <p style="margin:10px 0 0 0;font-size:11px;color:#999;">Scan at kiosk to check in/out</p>
            </div>
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
      case 'supervisor':
        return 'bg-orange-100 text-orange-800';
      case 'manager':
        return 'bg-yellow-100 text-yellow-800';
      case 'security':
        return 'bg-blue-100 text-blue-800';
      case 'visitor':
        return 'bg-gray-100 text-gray-800';
      default:
        return 'bg-green-100 text-green-800';
    }
  };

  const getAccessLevelIcon = (accessLevel: string) => {
    switch (accessLevel) {
      case 'admin':
        return '👑';
      case 'supervisor':
        return '🔧';
      case 'manager':
        return '👔';
      case 'security':
        return '🛡️';
      case 'visitor':
        return '👥';
      default:
        return '👤';
    }
  };

  const getAccessLevelLabel = (accessLevel: string) => {
    switch (accessLevel) {
      case 'admin':
        return 'Admin';
      case 'supervisor':
        return 'Supervisor';
      case 'manager':
        return 'Manager';
      case 'security':
        return 'Security';
      case 'visitor':
        return 'Visitor';
      default:
        return 'Staff';
    }
  };

  if (isLoading) {
    return <div>Loading staff...</div>;
  }

  return (
    <div className="space-y-8 p-6 rounded-xl bg-background min-h-screen">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-0">
        <h2 className="text-xl sm:text-2xl font-bold text-fixed">Staff Management</h2>
        <Button
          onClick={() => setIsAddModalOpen(true)}
          className="gradient-blue text-white font-medium hover:shadow-lg transition-all duration-300 whitespace-nowrap"
          data-testid="button-add-staff"
        >
          <Plus className="mr-1.5 sm:mr-2" size={16} />
          <span className="text-sm sm:text-base">Add Staff Member</span>
        </Button>
      </div>

      {/* Staff Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {!staff || staff.length === 0 ? (
          <div className="col-span-full text-center py-12">
            <p className="text-variable text-lg">No staff members found</p>
            <p className="text-variable text-sm mt-2">Add your first staff member to get started</p>
          </div>
        ) : (
          staff.map((member, index) => (
            <GlassCard key={member.id} hover>
              <div className="flex items-center space-x-4 mb-4">
                {member.photoUrl ? (
                  <img 
                    src={member.photoUrl} 
                    alt={getFullName(member)}
                    className="w-16 h-16 rounded-full object-cover"
                  />
                ) : (
                  <div className={`w-16 h-16 ${getGradientClass(index)} rounded-full flex items-center justify-center`}>
                    <span className="text-white font-bold text-lg">{getInitials(member)}</span>
                  </div>
                )}
                <div className="flex-1">
                  <h3 className="font-semibold text-fixed" data-testid={`staff-name-${member.id}`}>
                    {getFullName(member)}
                  </h3>
                  <p className="text-variable text-sm" data-testid={`staff-email-${member.id}`}>
                    {member.email}
                  </p>
                  <p className="text-variable text-sm" data-testid={`staff-department-${member.id}`}>
                    {member.department}
                  </p>
                  <p className="text-variable text-xs" data-testid={`staff-id-${member.id}`}>
                    ID: {member.employeeId}
                  </p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${getAccessLevelBadgeColor(member.accessLevel || 'staff')}`}>
                      {getAccessLevelIcon(member.accessLevel || 'staff')} {getAccessLevelLabel(member.accessLevel || 'staff')}
                    </span>
                    {member.isFireMarshal && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-orange-100 text-orange-800" data-testid={`fire-marshal-badge-${member.id}`}>
                        🚨 Fire Marshal
                      </span>
                    )}
                    {(member.accessLevel === 'admin' || member.accessLevel === 'supervisor') && member.lastLoginAt && (
                      <span className="text-xs text-green-600">Last login: {new Date(member.lastLoginAt).toLocaleDateString()}</span>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                    member.isActive ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                  }`}>
                    {member.isActive ? 'Active' : 'Inactive'}
                  </span>
                  {member.isCheckedIn && member.checkedInAt && (
                    <span className="text-xs text-variable flex items-center">
                      <Clock size={10} className="mr-1" />
                      {new Date(member.checkedInAt).toLocaleTimeString([], { 
                        hour: '2-digit', 
                        minute: '2-digit' 
                      })}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Button 
                    size="sm" 
                    variant="outline" 
                    onClick={() => setEditingStaff(member)}
                    className="p-2"
                    data-testid={`button-edit-staff-${member.id}`}
                    title="Edit staff member"
                  >
                    <Edit size={14} />
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setQrPassStaff(member)}
                    className="p-2 text-indigo-600 hover:text-indigo-700 border-indigo-200 hover:border-indigo-300 hover:bg-indigo-50"
                    data-testid={`button-qr-pass-${member.id}`}
                    title="Send QR check-in pass"
                  >
                    <QrCode size={14} />
                  </Button>
                  <Button 
                    size="sm" 
                    variant="outline" 
                    onClick={() => deleteMutation.mutate(member.id)}
                    disabled={deleteMutation.isPending}
                    className="p-2 text-red-600 hover:text-red-700 border-red-200 hover:border-red-300 hover:bg-red-50"
                    data-testid={`button-delete-staff-${member.id}`}
                    title="Delete staff member"
                  >
                    <Trash2 size={14} />
                  </Button>
                  {member.isActive && (
                    <>
                      {!member.isCheckedIn ? (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => checkInMutation.mutate(member.id)}
                          disabled={checkInMutation.isPending}
                          className="text-green-600 hover:text-green-700 border-green-300 hover:border-green-400 hover:bg-green-50"
                          data-testid={`button-checkin-${member.id}`}
                          title="Manual check-in (lost card)"
                        >
                          <UserCheck size={16} className="mr-1" />
                          Check In
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => checkOutMutation.mutate(member.id)}
                          disabled={checkOutMutation.isPending}
                          className="text-red-600 hover:text-red-700 border-red-300 hover:border-red-400 hover:bg-red-50"
                          data-testid={`button-checkout-${member.id}`}
                          title="Check out staff member"
                        >
                          <UserX size={16} className="mr-1" />
                          Check Out
                        </Button>
                      )}
                    </>
                  )}
                </div>
              </div>
            </GlassCard>
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
                      handleDownloadQrPass(data.qrCode, data.staffName);
                    }
                  });
                }}
                disabled={sendQrPassMutation.isPending}
                className="w-full justify-start gap-3 h-14"
              >
                <Download size={20} className="text-purple-600" />
                <div className="text-left">
                  <div className="font-medium">Download QR Image</div>
                  <div className="text-xs text-gray-500">Save QR code as image file</div>
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
