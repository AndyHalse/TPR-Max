import { useState, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import GlassCard from "@/components/GlassCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { UserPlus, Search, UserCheck, UserX, Edit, Trash2, Users, LayoutGrid, LayoutList, CloudUpload, Upload, X, Calendar, CreditCard } from "lucide-react";

interface Member {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phoneNumber: string | null;
  photoUrl: string | null;
  membershipType: string | null;
  membershipId: string | null;
  membershipNumber: string | null;
  joinDate: string | null;
  expiryDate: string | null;
  membershipStatus: string | null;
  notes: string | null;
  isCheckedIn: boolean;
  checkedInAt: string | null;
  checkedOutAt: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface MemberFormData {
  firstName: string;
  lastName: string;
  email: string;
  phoneNumber: string;
  photoUrl: string;
  membershipType: string;
  membershipId: string;
  membershipNumber: string;
  joinDate: string;
  expiryDate: string;
  membershipStatus: string;
  notes: string;
}

const emptyForm: MemberFormData = {
  firstName: "",
  lastName: "",
  email: "",
  phoneNumber: "",
  photoUrl: "",
  membershipType: "full",
  membershipId: "",
  membershipNumber: "",
  joinDate: "",
  expiryDate: "",
  membershipStatus: "active",
  notes: "",
};

export default function Members() {
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState("");
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingMember, setEditingMember] = useState<Member | null>(null);
  const [formData, setFormData] = useState<MemberFormData>(emptyForm);
  const [uploadedPhoto, setUploadedPhoto] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);

  const { data: members = [], isLoading } = useQuery<Member[]>({
    queryKey: ["/api/members"],
  });

  const createMutation = useMutation({
    mutationFn: async (data: MemberFormData) => {
      const response = await apiRequest("POST", "/api/members", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/members"] });
      toast({ title: "Success", description: "Member created successfully" });
      closeDialog();
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to create member", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: MemberFormData }) => {
      const response = await apiRequest("PATCH", `/api/members/${id}`, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/members"] });
      toast({ title: "Success", description: "Member updated successfully" });
      closeDialog();
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update member", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiRequest("DELETE", `/api/members/${id}`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/members"] });
      toast({ title: "Success", description: "Member removed successfully" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to remove member", variant: "destructive" });
    },
  });

  const checkInMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiRequest("POST", `/api/members/${id}/check-in`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/members"] });
      queryClient.invalidateQueries({ queryKey: ["/api/members/checked-in"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/muster"] });
      toast({ title: "Success", description: "Member checked in successfully" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to check in member", variant: "destructive" });
    },
  });

  const checkOutMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiRequest("POST", `/api/members/${id}/check-out`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/members"] });
      queryClient.invalidateQueries({ queryKey: ["/api/members/checked-in"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/muster"] });
      toast({ title: "Success", description: "Member checked out successfully" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to check out member", variant: "destructive" });
    },
  });

  const filteredMembers = members
    .filter((member) => {
      const term = searchTerm.toLowerCase();
      return (
        `${member.firstName} ${member.lastName}`.toLowerCase().includes(term) ||
        (member.email && member.email.toLowerCase().includes(term)) ||
        (member.membershipNumber && member.membershipNumber.toLowerCase().includes(term)) ||
        (member.membershipId && member.membershipId.toLowerCase().includes(term))
      );
    })
    .sort((a, b) => {
      const nameA = `${a.lastName} ${a.firstName}`.toLowerCase();
      const nameB = `${b.lastName} ${b.firstName}`.toLowerCase();
      return nameA.localeCompare(nameB);
    });

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    let base64: string;
    try {
      base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
          const result = e.target?.result as string;
          resolve(result.split(',')[1]);
        };
        reader.onerror = () => reject(new Error('Failed to read file'));
        reader.readAsDataURL(file);
      });
    } catch (readError: any) {
      toast({ title: "Error", description: "Could not read the file. Please try selecting it again.", variant: "destructive" });
      return;
    }

    setUploading(true);
    try {
      const res = await apiRequest("POST", "/api/objects/upload", { data: base64, mimeType: file.type });
      const { objectPath } = await res.json();
      setUploadedPhoto(objectPath);
      setFormData(prev => ({ ...prev, photoUrl: objectPath }));
      toast({ title: "Success", description: "Photo uploaded successfully!" });
    } catch (error: any) {
      console.error("Photo upload error:", error?.message || String(error));
      toast({ title: "Error", description: "Failed to upload photo", variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  const removePhoto = () => {
    setUploadedPhoto(null);
    setFormData(prev => ({ ...prev, photoUrl: "" }));
  };

  function openAddDialog() {
    setEditingMember(null);
    setFormData(emptyForm);
    setUploadedPhoto(null);
    setDialogOpen(true);
  }

  function openEditDialog(member: Member) {
    setEditingMember(member);
    setFormData({
      firstName: member.firstName,
      lastName: member.lastName,
      email: member.email || "",
      phoneNumber: member.phoneNumber || "",
      photoUrl: member.photoUrl || "",
      membershipType: member.membershipType || "full",
      membershipId: member.membershipId || "",
      membershipNumber: member.membershipNumber || "",
      joinDate: member.joinDate || "",
      expiryDate: member.expiryDate || "",
      membershipStatus: member.membershipStatus || "active",
      notes: member.notes || "",
    });
    setUploadedPhoto(member.photoUrl || null);
    setDialogOpen(true);
  }

  function closeDialog() {
    setDialogOpen(false);
    setEditingMember(null);
    setFormData(emptyForm);
    setUploadedPhoto(null);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!formData.firstName.trim() || !formData.lastName.trim()) {
      toast({ title: "Error", description: "First name and last name are required", variant: "destructive" });
      return;
    }
    if (editingMember) {
      updateMutation.mutate({ id: editingMember.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  }

  function updateField(field: keyof MemberFormData, value: string) {
    setFormData((prev) => ({ ...prev, [field]: value }));
  }

  const membershipTypeColors: Record<string, string> = {
    full: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
    associate: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-200",
    junior: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
    honorary: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
    social: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
    temporary: "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200",
  };

  const statusColors: Record<string, string> = {
    active: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
    expired: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
    suspended: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
    pending: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  };

  function formatDate(dateStr: string | null) {
    if (!dateStr) return null;
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    } catch { return dateStr; }
  }

  function isExpired(expiryDate: string | null) {
    if (!expiryDate) return false;
    try { return new Date(expiryDate) < new Date(); } catch { return false; }
  }

  if (isLoading) {
    return (
      <div className="p-6">
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <Users className="h-6 w-6 sm:h-8 sm:w-8 text-blue-600 flex-shrink-0" />
          <h1 className="text-xl sm:text-2xl font-bold text-fixed">Members</h1>
          <Badge variant="secondary" className="ml-1 flex-shrink-0">{members.length} total</Badge>
        </div>
        <Button onClick={openAddDialog} className="gradient-blue text-white font-medium hover:shadow-lg transition-all duration-300 gap-1.5 text-sm px-3 sm:px-4 flex-shrink-0">
          <UserPlus className="h-4 w-4" />
          <span className="hidden sm:inline">Add Member</span>
          <span className="sm:hidden">Add</span>
        </Button>
      </div>

      <div className="flex items-center gap-2 sm:gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-variable" />
          <Input
            placeholder="Search members..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <Button
            variant={viewMode === 'grid' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setViewMode('grid')}
            className="h-8 w-8 p-0"
            title="Grid view"
          >
            <LayoutGrid size={14} />
          </Button>
          <Button
            variant={viewMode === 'list' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setViewMode('list')}
            className="h-8 w-8 p-0"
            title="List view"
          >
            <LayoutList size={14} />
          </Button>
        </div>
      </div>

      <div>
        {filteredMembers.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Users className="h-16 w-16 text-variable mb-4 opacity-50" />
            <h3 className="text-lg font-semibold text-fixed mb-2">
              {searchTerm ? "No members found" : "No members yet"}
            </h3>
            <p className="text-variable mb-6">
              {searchTerm
                ? "Try a different search term"
                : "Add your first member to get started"}
            </p>
            {!searchTerm && (
              <Button onClick={openAddDialog} className="gradient-blue text-white font-medium hover:shadow-lg transition-all duration-300 gap-2">
                <UserPlus className="h-4 w-4" />
                Add Member
              </Button>
            )}
          </div>
        ) : viewMode === 'list' ? (
          <div className="space-y-4">
            {filteredMembers.map((member) => (
              <div
                key={member.id}
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-white/50 dark:bg-slate-800/50"
              >
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  {member.photoUrl ? (
                    <img src={member.photoUrl} alt={`${member.firstName} ${member.lastName}`} className="w-10 h-10 rounded-full object-cover flex-shrink-0" />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-gradient-to-r from-blue-500 to-purple-500 flex items-center justify-center flex-shrink-0">
                      <span className="text-white font-bold text-sm">{member.firstName[0]?.toUpperCase()}{member.lastName[0]?.toUpperCase()}</span>
                    </div>
                  )}
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-3 flex-wrap">
                      <span className="text-lg font-semibold text-fixed">
                        {member.firstName} {member.lastName}
                      </span>
                      <Badge className={membershipTypeColors[member.membershipType || "full"]}>
                        {(member.membershipType || "full").toUpperCase()}
                      </Badge>
                      <Badge className={statusColors[member.membershipStatus || "active"]}>
                        {(member.membershipStatus || "active").toUpperCase()}
                      </Badge>
                      {member.isCheckedIn ? (
                        <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">On Site</Badge>
                      ) : (
                        <Badge variant="secondary">Off Site</Badge>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
                      {member.email && <span className="text-variable">{member.email}</span>}
                      {member.phoneNumber && <span className="text-variable">{member.phoneNumber}</span>}
                      {member.membershipNumber && <span className="text-variable">No: {member.membershipNumber}</span>}
                      {member.expiryDate && (
                        <span className={`text-variable ${isExpired(member.expiryDate) ? 'text-red-500 font-medium' : ''}`}>
                          Expires: {formatDate(member.expiryDate)}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {member.isCheckedIn ? (
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-red-600 hover:text-red-700 border-red-300 hover:border-red-400 hover:bg-red-50"
                      onClick={() => checkOutMutation.mutate(member.id)}
                      disabled={checkOutMutation.isPending}
                    >
                      <UserX className="h-4 w-4 mr-1" />
                      Check Out
                    </Button>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-green-600 hover:text-green-700 border-green-300 hover:border-green-400 hover:bg-green-50"
                      onClick={() => checkInMutation.mutate(member.id)}
                      disabled={checkInMutation.isPending}
                    >
                      <UserCheck className="h-4 w-4 mr-1" />
                      Check In
                    </Button>
                  )}
                  <Button variant="outline" size="sm" onClick={() => openEditDialog(member)}>
                    <Edit className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-red-600 hover:text-red-700 hover:bg-red-50"
                    onClick={() => deleteMutation.mutate(member.id)}
                    disabled={deleteMutation.isPending}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredMembers.map((member, index) => (
              <GlassCard key={member.id} hover>
                <div className="flex items-start space-x-3 mb-3">
                  {member.photoUrl ? (
                    <img src={member.photoUrl} alt={`${member.firstName} ${member.lastName}`} className="w-12 h-12 rounded-full object-cover flex-shrink-0" />
                  ) : (
                    <div className={`w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 ${
                      ['bg-gradient-to-r from-blue-500 to-purple-500',
                       'bg-gradient-to-r from-green-500 to-teal-500',
                       'bg-gradient-to-r from-purple-500 to-pink-500',
                       'bg-gradient-to-r from-orange-500 to-red-500',
                       'bg-gradient-to-r from-indigo-500 to-purple-500',
                       'bg-gradient-to-r from-teal-500 to-cyan-500'][index % 6]
                    }`}>
                      <span className="text-white font-bold text-sm">
                        {member.firstName[0]?.toUpperCase()}{member.lastName[0]?.toUpperCase()}
                      </span>
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <h3 className="font-semibold text-fixed text-sm truncate">
                        {member.firstName} {member.lastName}
                      </h3>
                      <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium flex-shrink-0 ${
                        member.isCheckedIn ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                      }`}>
                        {member.isCheckedIn ? 'On Site' : 'Off Site'}
                      </span>
                    </div>
                    {member.email && (
                      <p className="text-variable text-xs truncate">{member.email}</p>
                    )}
                    <p className="text-variable text-xs">
                      {member.membershipNumber ? `No: ${member.membershipNumber}` : 'No membership number'}
                      {member.membershipId && <span className="text-variable/60"> | {member.membershipId}</span>}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 flex-wrap mb-2">
                  <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${membershipTypeColors[member.membershipType || "full"]}`}>
                    {(member.membershipType || "full").toUpperCase()}
                  </span>
                  <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${statusColors[member.membershipStatus || "active"]}`}>
                    {(member.membershipStatus || "active").toUpperCase()}
                  </span>
                  {member.expiryDate && (
                    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${
                      isExpired(member.expiryDate) ? 'bg-red-100 text-red-800' : 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300'
                    }`}>
                      {isExpired(member.expiryDate) ? 'EXPIRED' : `Exp: ${formatDate(member.expiryDate)}`}
                    </span>
                  )}
                </div>
                <div className="flex items-center justify-between pt-2 border-t border-gray-200/50">
                  <div className="flex items-center gap-1.5">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0"
                      onClick={() => openEditDialog(member)}
                      title="Edit"
                    >
                      <Edit size={15} />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0 text-red-500 hover:text-red-700 hover:bg-red-50"
                      onClick={() => deleteMutation.mutate(member.id)}
                      disabled={deleteMutation.isPending}
                      title="Delete"
                    >
                      <Trash2 size={15} />
                    </Button>
                  </div>
                  {member.isCheckedIn ? (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-9 px-3 text-sm font-medium text-red-600 hover:text-red-700 border-red-300 hover:border-red-400 hover:bg-red-50"
                      onClick={() => checkOutMutation.mutate(member.id)}
                      disabled={checkOutMutation.isPending}
                    >
                      <UserX className="h-4 w-4 mr-1.5" />
                      Check Out
                    </Button>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-9 px-3 text-sm font-medium text-green-600 hover:text-green-700 border-green-300 hover:border-green-400 hover:bg-green-50"
                      onClick={() => checkInMutation.mutate(member.id)}
                      disabled={checkInMutation.isPending}
                    >
                      <UserCheck className="h-4 w-4 mr-1.5" />
                      Check In
                    </Button>
                  )}
                </div>
              </GlassCard>
            ))}
          </div>
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingMember ? "Edit Member" : "Add Member"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label className="text-fixed">Photo</Label>
              {uploadedPhoto ? (
                <div className="relative text-center">
                  <img
                    src={uploadedPhoto}
                    alt="Member photo"
                    className="w-20 h-20 rounded-full mx-auto mb-2 object-cover"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={removePhoto}
                    className="absolute top-0 right-1/3 p-1 h-auto"
                  >
                    <X size={14} />
                  </Button>
                  <p className="text-sm text-variable">Photo uploaded</p>
                </div>
              ) : (
                <div className="border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-xl p-4 text-center">
                  <input
                    type="file"
                    accept="image/jpeg,image/jpg,image/png,image/webp,image/gif"
                    onChange={handlePhotoUpload}
                    className="hidden"
                    id="member-photo-upload"
                    ref={photoInputRef}
                    disabled={uploading}
                  />
                  <label htmlFor="member-photo-upload" className="cursor-pointer">
                    {uploading ? (
                      <>
                        <Upload className="mx-auto h-8 w-8 text-blue-500 mb-2 animate-pulse" />
                        <p className="text-sm text-blue-600">Uploading...</p>
                      </>
                    ) : (
                      <>
                        <CloudUpload className="mx-auto h-8 w-8 text-variable mb-2" />
                        <p className="text-sm text-variable">Click to upload photo</p>
                      </>
                    )}
                  </label>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-fixed">First Name *</Label>
                <Input
                  value={formData.firstName}
                  onChange={(e) => updateField("firstName", e.target.value)}
                  placeholder=""
                  required
                />
              </div>
              <div className="space-y-2">
                <Label className="text-fixed">Last Name *</Label>
                <Input
                  value={formData.lastName}
                  onChange={(e) => updateField("lastName", e.target.value)}
                  placeholder=""
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-fixed">Email</Label>
              <Input
                type="email"
                value={formData.email}
                onChange={(e) => updateField("email", e.target.value)}
                placeholder=""
              />
            </div>

            <div className="space-y-2">
              <Label className="text-fixed">Phone Number</Label>
              <Input
                value={formData.phoneNumber}
                onChange={(e) => updateField("phoneNumber", e.target.value)}
                placeholder=""
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-fixed">Membership Type</Label>
                <Select
                  value={formData.membershipType}
                  onValueChange={(value) => updateField("membershipType", value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="full">Full</SelectItem>
                    <SelectItem value="associate">Associate</SelectItem>
                    <SelectItem value="junior">Junior</SelectItem>
                    <SelectItem value="honorary">Honorary</SelectItem>
                    <SelectItem value="social">Social</SelectItem>
                    <SelectItem value="temporary">Temporary</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-fixed">Membership Status</Label>
                <Select
                  value={formData.membershipStatus}
                  onValueChange={(value) => updateField("membershipStatus", value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="expired">Expired</SelectItem>
                    <SelectItem value="suspended">Suspended</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-fixed">Membership Number</Label>
                <Input
                  value={formData.membershipNumber}
                  onChange={(e) => updateField("membershipNumber", e.target.value)}
                  placeholder=""
                />
              </div>
              <div className="space-y-2">
                <Label className="text-fixed">Membership ID</Label>
                <Input
                  value={formData.membershipId}
                  onChange={(e) => updateField("membershipId", e.target.value)}
                  placeholder=""
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-fixed">Join Date</Label>
                <Input
                  type="date"
                  value={formData.joinDate}
                  onChange={(e) => updateField("joinDate", e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label className="text-fixed">Expiry Date</Label>
                <Input
                  type="date"
                  value={formData.expiryDate}
                  onChange={(e) => updateField("expiryDate", e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-fixed">Notes</Label>
              <Input
                value={formData.notes}
                onChange={(e) => updateField("notes", e.target.value)}
                placeholder=""
              />
            </div>

            <div className="flex justify-end gap-3 pt-4">
              <Button type="button" variant="outline" onClick={closeDialog}>
                Cancel
              </Button>
              <Button
                type="submit"
                className="gradient-blue text-white"
                disabled={createMutation.isPending || updateMutation.isPending}
              >
                {createMutation.isPending || updateMutation.isPending
                  ? "Saving..."
                  : editingMember
                  ? "Update Member"
                  : "Add Member"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
