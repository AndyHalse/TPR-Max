import { useState } from "react";
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
import { UserPlus, Search, UserCheck, UserX, Edit, Trash2, Users, LayoutGrid, LayoutList } from "lucide-react";

interface Member {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phoneNumber: string | null;
  company: string | null;
  membershipType: string | null;
  membershipId: string | null;
  department: string | null;
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
  company: string;
  membershipType: string;
  membershipId: string;
  department: string;
  notes: string;
}

const emptyForm: MemberFormData = {
  firstName: "",
  lastName: "",
  email: "",
  phoneNumber: "",
  company: "",
  membershipType: "standard",
  membershipId: "",
  department: "",
  notes: "",
};

export default function Members() {
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState("");
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingMember, setEditingMember] = useState<Member | null>(null);
  const [formData, setFormData] = useState<MemberFormData>(emptyForm);

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

  const filteredMembers = members.filter((member) => {
    const term = searchTerm.toLowerCase();
    return (
      `${member.firstName} ${member.lastName}`.toLowerCase().includes(term) ||
      (member.email && member.email.toLowerCase().includes(term)) ||
      (member.company && member.company.toLowerCase().includes(term)) ||
      (member.department && member.department.toLowerCase().includes(term)) ||
      (member.membershipId && member.membershipId.toLowerCase().includes(term))
    );
  });

  function openAddDialog() {
    setEditingMember(null);
    setFormData(emptyForm);
    setDialogOpen(true);
  }

  function openEditDialog(member: Member) {
    setEditingMember(member);
    setFormData({
      firstName: member.firstName,
      lastName: member.lastName,
      email: member.email || "",
      phoneNumber: member.phoneNumber || "",
      company: member.company || "",
      membershipType: member.membershipType || "standard",
      membershipId: member.membershipId || "",
      department: member.department || "",
      notes: member.notes || "",
    });
    setDialogOpen(true);
  }

  function closeDialog() {
    setDialogOpen(false);
    setEditingMember(null);
    setFormData(emptyForm);
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

  const membershipColors: Record<string, string> = {
    standard: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
    premium: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
    vip: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
    temporary: "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200",
  };

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
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Users className="h-8 w-8 text-blue-600" />
          <h1 className="text-2xl font-bold text-fixed">Members</h1>
          <Badge variant="secondary" className="ml-2">{members.length} total</Badge>
        </div>
        <Button onClick={openAddDialog} className="gradient-blue text-white font-medium hover:shadow-lg transition-all duration-300 gap-2">
          <UserPlus className="h-4 w-4" />
          Add Member
        </Button>
      </div>

      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-variable" />
          <Input
            placeholder="Search members..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
        <div className="flex items-center gap-1">
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

      <GlassCard>
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
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="text-lg font-semibold text-fixed">
                      {member.firstName} {member.lastName}
                    </span>
                    <Badge className={membershipColors[member.membershipType || "standard"]}>
                      {(member.membershipType || "standard").toUpperCase()}
                    </Badge>
                    {member.isCheckedIn ? (
                      <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                        On Site
                      </Badge>
                    ) : (
                      <Badge variant="secondary">Off Site</Badge>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
                    {member.email && (
                      <span className="text-variable">{member.email}</span>
                    )}
                    {member.phoneNumber && (
                      <span className="text-variable">{member.phoneNumber}</span>
                    )}
                    {member.company && (
                      <span className="text-variable">{member.company}</span>
                    )}
                    {member.membershipId && (
                      <span className="text-variable">ID: {member.membershipId}</span>
                    )}
                    {member.department && (
                      <span className="text-variable">Dept: {member.department}</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {member.isCheckedIn ? (
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1"
                      onClick={() => checkOutMutation.mutate(member.id)}
                      disabled={checkOutMutation.isPending}
                    >
                      <UserX className="h-4 w-4" />
                      Check Out
                    </Button>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1"
                      onClick={() => checkInMutation.mutate(member.id)}
                      disabled={checkInMutation.isPending}
                    >
                      <UserCheck className="h-4 w-4" />
                      Check In
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => openEditDialog(member)}
                  >
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
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredMembers.map((member) => (
              <div key={member.id} className="p-4 bg-white/60 rounded-xl border border-white/30 hover:bg-white/80 transition-all">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="font-semibold text-fixed">{member.firstName} {member.lastName}</h3>
                    {member.company && <p className="text-sm text-variable">{member.company}</p>}
                  </div>
                  <div className="flex items-center gap-1">
                    <Badge className={membershipColors[member.membershipType || "standard"]}>
                      {(member.membershipType || "standard").toUpperCase()}
                    </Badge>
                  </div>
                </div>
                <div className="space-y-1 text-sm text-variable mb-3">
                  {member.email && <p>{member.email}</p>}
                  {member.department && <p>Dept: {member.department}</p>}
                </div>
                <div className="flex items-center justify-between pt-2 border-t border-gray-200/50">
                  <Badge className={member.isCheckedIn ? "bg-green-100 text-green-800" : ""} variant={member.isCheckedIn ? "default" : "secondary"}>
                    {member.isCheckedIn ? "On Site" : "Off Site"}
                  </Badge>
                  <div className="flex items-center gap-1">
                    {member.isCheckedIn ? (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 px-2 text-xs"
                        onClick={() => checkOutMutation.mutate(member.id)}
                        disabled={checkOutMutation.isPending}
                      >
                        <UserX className="h-3 w-3 mr-1" />
                        Out
                      </Button>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 px-2 text-xs"
                        onClick={() => checkInMutation.mutate(member.id)}
                        disabled={checkInMutation.isPending}
                      >
                        <UserCheck className="h-3 w-3 mr-1" />
                        In
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 w-7 p-0"
                      onClick={() => openEditDialog(member)}
                    >
                      <Edit className="h-3 w-3" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 w-7 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                      onClick={() => deleteMutation.mutate(member.id)}
                      disabled={deleteMutation.isPending}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </GlassCard>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingMember ? "Edit Member" : "Add Member"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-fixed">First Name *</Label>
                <Input
                  value={formData.firstName}
                  onChange={(e) => updateField("firstName", e.target.value)}
                  placeholder="First name"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label className="text-fixed">Last Name *</Label>
                <Input
                  value={formData.lastName}
                  onChange={(e) => updateField("lastName", e.target.value)}
                  placeholder="Last name"
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
                placeholder="email@example.com"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-fixed">Phone Number</Label>
              <Input
                value={formData.phoneNumber}
                onChange={(e) => updateField("phoneNumber", e.target.value)}
                placeholder="Phone number"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-fixed">Company</Label>
              <Input
                value={formData.company}
                onChange={(e) => updateField("company", e.target.value)}
                placeholder="Company name"
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
                    <SelectItem value="standard">Standard</SelectItem>
                    <SelectItem value="premium">Premium</SelectItem>
                    <SelectItem value="vip">VIP</SelectItem>
                    <SelectItem value="temporary">Temporary</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-fixed">Membership ID</Label>
                <Input
                  value={formData.membershipId}
                  onChange={(e) => updateField("membershipId", e.target.value)}
                  placeholder="Membership ID"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-fixed">Department</Label>
              <Input
                value={formData.department}
                onChange={(e) => updateField("department", e.target.value)}
                placeholder="Department"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-fixed">Notes</Label>
              <Input
                value={formData.notes}
                onChange={(e) => updateField("notes", e.target.value)}
                placeholder="Additional notes"
              />
            </div>

            <div className="flex justify-end gap-3 pt-4">
              <Button type="button" variant="outline" onClick={closeDialog}>
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={createMutation.isPending || updateMutation.isPending}
              >
                {editingMember ? "Save Changes" : "Add Member"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
