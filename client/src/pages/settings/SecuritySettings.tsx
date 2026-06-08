import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import GlassCard from "@/components/GlassCard";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "@/components/ui/tooltip";
import { Users, UserPlus, UserCheck, Mail, Edit, Trash2, RefreshCw, Copy, Shield, Info } from "lucide-react";

export default function SecuritySettings() {
  const { toast } = useToast();
  const [showAddEmailDialog, setShowAddEmailDialog] = useState(false);
  const [showManualUserDialog, setShowManualUserDialog] = useState(false);
  const [showEditUserDialog, setShowEditUserDialog] = useState(false);
  const [userToEdit, setUserToEdit] = useState<any>(null);
  const [inviteForm, setInviteForm] = useState({ email: "", role: "user" });
  const [manualUserForm, setManualUserForm] = useState({
    username: "", email: "", password: "", role: "user", firstName: "", lastName: ""
  });
  const [editUserForm, setEditUserForm] = useState({
    username: "", email: "", password: "", role: "user", firstName: "", lastName: "",
    allowedMenuItems: [] as string[], defaultLandingPage: "_default"
  });

  const { data: currentUser } = useQuery<{ id: string; username: string; customerId: string; role: string }>({
    queryKey: ["/api/auth/me"],
  });

  const { data: users, isLoading: usersLoading } = useQuery<Array<{
    id: string; username: string; email: string; role: string;
    firstName?: string; lastName?: string; status: 'active' | 'pending';
    invitedAt?: Date; invitationToken?: string; customerId?: string; isCurrentUser?: boolean;
  }>>({
    queryKey: ["/api/users"],
  });

  const sessionUserFromList = users?.find(u => u.isCurrentUser);
  const isAdminUser = sessionUserFromList?.role === 'admin' || currentUser?.role === 'admin';

  const copyInvitationLink = (token: string, customerId?: string) => {
    const baseUrl = window.location.origin;
    const invitationUrl = customerId
      ? `${baseUrl}/invite/accept?token=${token}&customer=${customerId}`
      : `${baseUrl}/invite/accept?token=${token}`;
    navigator.clipboard.writeText(invitationUrl).then(() => {
      toast({ title: "Link Copied!", description: "Invitation link has been copied to clipboard." });
    }).catch(() => {
      toast({ title: "Copy Failed", description: "Failed to copy link to clipboard.", variant: "destructive" });
    });
  };

  const inviteMutation = useMutation({
    mutationFn: async (data: { email: string; role: string }) => {
      const response = await apiRequest("POST", "/api/invitations", data);
      if (!response.ok) {
        const errorData = await response.json();
        const error = new Error(errorData.error || "Failed to send invitation");
        (error as any).response = { status: response.status };
        (error as any).serverMessage = errorData.error;
        throw error;
      }
      return response.json();
    },
    onSuccess: () => {
      setInviteForm({ email: "", role: "user" });
      toast({ title: "Invitation Sent", description: "User invitation has been sent successfully." });
    },
    onError: (error: any) => {
      const serverMessage = error?.serverMessage || error?.message;
      let errorMessage = "Failed to send invitation";
      let actionGuidance = "";
      if (error?.response?.status === 400 && serverMessage?.includes("already exists")) {
        errorMessage = serverMessage; actionGuidance = " Use the 'Add Manually' option.";
      } else if ((serverMessage?.includes("SMTP") || serverMessage?.includes("delivery")) && !serverMessage?.includes("already exists")) {
        errorMessage = "Email delivery failed"; actionGuidance = " Use the 'Add Manually' button as a backup option.";
      } else if (error?.response?.status === 400) {
        errorMessage = serverMessage || "Invalid request"; actionGuidance = " Please check the information.";
      } else {
        errorMessage = serverMessage || "Failed to send invitation"; actionGuidance = " You can try the 'Add Manually' option instead.";
      }
      toast({ title: "Invitation Failed", description: errorMessage + actionGuidance, variant: "destructive" });
    },
  });

  const manualUserMutation = useMutation({
    mutationFn: async (data: { username: string; email: string; password: string; role: string; firstName: string; lastName: string }) => {
      const response = await apiRequest("POST", "/api/users/manual", data);
      if (!response.ok) {
        const errorData = await response.json();
        const error = new Error(errorData.error || "Failed to create user account");
        (error as any).response = { status: response.status };
        throw error;
      }
      return response.json();
    },
    onSuccess: () => {
      setManualUserForm({ username: "", email: "", password: "", role: "user", firstName: "", lastName: "" });
      setShowManualUserDialog(false);
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      toast({ title: "User Created", description: "User account has been created successfully." });
    },
    onError: (error: any) => {
      toast({ title: "User Creation Failed", description: error?.message || "Failed to create user account", variant: "destructive" });
    },
  });

  const deleteUserMutation = useMutation({
    mutationFn: async (userId: string) => {
      const response = await apiRequest("DELETE", `/api/users/${userId}`);
      if (!response.ok) { const errorData = await response.json(); throw new Error(errorData.error || "Failed to delete user"); }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      toast({ title: "User Deleted", description: "User has been removed successfully." });
    },
    onError: (error: any) => {
      toast({ title: "Delete Failed", description: error.message || "Failed to delete user", variant: "destructive" });
    },
  });

  const deleteInvitationMutation = useMutation({
    mutationFn: async (invitationId: string) => {
      const response = await apiRequest("DELETE", `/api/invitations/${invitationId}`);
      if (!response.ok) { const errorData = await response.json(); throw new Error(errorData.error || "Failed to delete invitation"); }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      toast({ title: "Invitation Deleted", description: "Pending invitation has been removed successfully." });
    },
    onError: (error: any) => {
      toast({ title: "Delete Failed", description: error.message || "Failed to delete invitation", variant: "destructive" });
    },
  });

  const editUserMutation = useMutation({
    mutationFn: async (data: {
      userId: string; username: string; email: string; password?: string; role: string;
      firstName: string; lastName: string; allowedMenuItems?: string[]; defaultLandingPage?: string;
    }) => {
      const { userId, ...updateData } = data;
      const payload: any = data.password ? updateData : { ...updateData, password: undefined };
      if (payload.defaultLandingPage === "_default") payload.defaultLandingPage = "";
      const response = await apiRequest("PUT", `/api/users/${userId}`, payload);
      if (!response.ok) { const errorData = await response.json(); throw new Error(errorData.error || "Failed to update user"); }
      return response.json();
    },
    onSuccess: () => {
      setShowEditUserDialog(false);
      setUserToEdit(null);
      setEditUserForm({ username: "", email: "", password: "", role: "user", firstName: "", lastName: "", allowedMenuItems: [], defaultLandingPage: "_default" });
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      toast({ title: "User Updated", description: "The user has been successfully updated." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message || "Failed to update user.", variant: "destructive" });
    },
  });

  return (
    <div className="space-y-6">
<div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
  <GlassCard>
    <div className="flex items-center justify-between mb-6">
      <div className="flex items-center">
        <Users className="mr-3 text-blue-600 dark:text-blue-400" size={24} />
        <h3 className="text-lg font-semibold text-fixed">User Management</h3>
      </div>
      <TooltipProvider delayDuration={200}>
        <div className="flex gap-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setShowManualUserDialog(true)}
                data-testid="button-manual-user"
              >
                <UserPlus className="mr-2" size={16} />
                Add Manually
              </Button>
            </TooltipTrigger>
            <TooltipContent className="max-w-xs">
              Create a user account directly without sending an email. Useful when the invited person has trouble receiving emails or for setting up offline.
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="sm"
                className="gradient-blue text-white"
                onClick={() => setShowAddEmailDialog(true)}
                data-testid="button-invite-user"
              >
                <Mail className="mr-2" size={16} />
                Send Invitation
              </Button>
            </TooltipTrigger>
            <TooltipContent className="max-w-xs">
              Send a secure email invitation. The recipient clicks the link and creates their own password. Invitations expire after 7 days.
            </TooltipContent>
          </Tooltip>
        </div>
      </TooltipProvider>
    </div>
    
    <div className="space-y-4">
      {usersLoading ? (
        <div className="text-center py-8">
          <RefreshCw className="mx-auto text-variable mb-4 animate-spin" size={32} />
          <p className="text-variable">Loading users...</p>
        </div>
      ) : users && users.length > 0 ? (
        <>
          {users.map((user) => {
            const isCurrentUser = user.isCurrentUser || user.id === currentUser?.id;
            const isPending = user.status === 'pending';
            const initials = user.firstName && user.lastName 
              ? `${user.firstName[0]}${user.lastName[0]}`
              : user.username.substring(0, 2).toUpperCase();
            const displayName = user.firstName && user.lastName
              ? `${user.firstName} ${user.lastName}${isCurrentUser ? ' (You)' : ''}`
              : `${user.username}${isCurrentUser ? ' (You)' : ''}`;
            
            return (
              <div key={user.id} className="flex items-center justify-between p-3 bg-white/50 dark:bg-slate-800/50 rounded-lg" data-testid={`user-item-${user.id}`}>
                <div className="flex items-center space-x-3">
                  <div className={`w-8 h-8 ${isPending ? 'bg-amber-50 dark:bg-amber-950/300' : 'bg-blue-50 dark:bg-blue-950/300'} rounded-full flex items-center justify-center`}>
                    <span className="text-white text-sm font-bold">{initials}</span>
                  </div>
                  <div>
                    <p className="font-medium text-fixed">{displayName}</p>
                    <p className="text-sm text-variable">{user.email}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {isPending ? (
                    <Badge variant="outline" className="bg-amber-50 dark:bg-amber-950/30 text-amber-700 border-amber-300">
                      Awaiting
                    </Badge>
                  ) : (
                    <Badge variant={user.role === 'admin' ? 'default' : user.role === 'security' || user.role === 'fire_marshal' ? 'outline' : 'secondary'}>
                      {user.role === 'admin' ? 'Admin' : user.role === 'security' ? 'Security' : user.role === 'fire_marshal' ? 'Fire Marshal' : 'User'}
                    </Badge>
                  )}
                  {isAdminUser && (
                    <>
                      {isPending ? (
                        <>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              if (user.invitationToken) {
                                copyInvitationLink(user.invitationToken, user.customerId);
                              }
                            }}
                            disabled={!user.invitationToken}
                            title="Copy invitation link"
                            data-testid={`button-copy-invitation-${user.id}`}
                          >
                            <Copy className="h-4 w-4 text-blue-500" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              if (confirm(`Are you sure you want to delete the invitation for ${user.email}?`)) {
                                deleteInvitationMutation.mutate(user.id);
                              }
                            }}
                            disabled={deleteInvitationMutation.isPending}
                            data-testid={`button-delete-invitation-${user.id}`}
                          >
                            <Trash2 className="h-4 w-4 text-red-500" />
                          </Button>
                        </>
                      ) : (
                        <>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setUserToEdit(user);
                              setEditUserForm({
                                username: user.username,
                                email: user.email || "",
                                password: "",
                                role: user.role,
                                firstName: user.firstName || "",
                                lastName: user.lastName || "",
                                allowedMenuItems: Array.isArray(user.allowedMenuItems) ? user.allowedMenuItems : [],
                                defaultLandingPage: user.defaultLandingPage || "_default"
                              });
                              setShowEditUserDialog(true);
                            }}
                            data-testid={`button-edit-user-${user.id}`}
                          >
                            <Edit className="h-4 w-4 text-blue-500" />
                          </Button>
                          {!isCurrentUser && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                if (confirm(`Are you sure you want to delete ${displayName}?`)) {
                                  deleteUserMutation.mutate(user.id);
                                }
                              }}
                              disabled={deleteUserMutation.isPending}
                              data-testid={`button-delete-user-${user.id}`}
                            >
                              <Trash2 className="h-4 w-4 text-red-500" />
                            </Button>
                          )}
                        </>
                      )}
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </>
      ) : (
        <div className="text-center py-8">
          <Shield className="mx-auto text-variable mb-4" size={48} />
          <p className="text-variable mb-4">No users yet</p>
          <Button 
            variant="outline" 
            size="sm"
            onClick={() => setShowAddEmailDialog(true)}
            data-testid="button-send-first-invitation"
          >
            <UserPlus className="mr-2" size={16} />
            Send First Invitation
          </Button>
        </div>
      )}
    </div>
  </GlassCard>
  
  <GlassCard>
    <div className="flex items-center mb-6">
      <UserPlus className="mr-3 text-blue-600 dark:text-blue-400" size={24} />
      <h3 className="text-lg font-semibold text-fixed">Invite New User</h3>
    </div>
    
    <TooltipProvider delayDuration={200}>
    <form 
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (inviteForm.email && inviteForm.role) {
          inviteMutation.mutate(inviteForm);
        }
      }}
    >
      <div className="space-y-2">
        <div className="flex items-center gap-1.5">
          <Label htmlFor="inviteEmail" className="text-sm font-medium text-fixed">Email Address</Label>
          <Tooltip>
            <TooltipTrigger asChild>
              <Info size={14} className="text-variable cursor-help" />
            </TooltipTrigger>
            <TooltipContent className="max-w-xs">
              The invitation email will be sent to this address. The link in the email is specific to this account — do not share it with others.
            </TooltipContent>
          </Tooltip>
        </div>
        <Input
          id="inviteEmail"
          type="email"
          placeholder="colleague@yourcompany.com"
          value={inviteForm.email}
          onChange={(e) => setInviteForm({ ...inviteForm, email: e.target.value })}
          className="w-full px-4 py-3 rounded-xl border border-white/30 dark:border-slate-700/30 bg-white/50 dark:bg-slate-800/50 focus:outline-none focus:ring-2 focus:ring-blue-500 text-fixed"
          data-testid="input-invite-email"
          required
        />
      </div>
      
      <div className="space-y-2">
        <div className="flex items-center gap-1.5">
          <Label htmlFor="userRole" className="text-sm font-medium text-fixed">User Role</Label>
          <Tooltip>
            <TooltipTrigger asChild>
              <Info size={14} className="text-variable cursor-help" />
            </TooltipTrigger>
            <TooltipContent className="max-w-xs">
              <strong>Standard User</strong> — can view and manage visitors, staff, and reports but cannot change system settings or manage other users.<br /><br />
              <strong>Administrator</strong> — full access including settings, user management, and all system configuration.
            </TooltipContent>
          </Tooltip>
        </div>
        <Select value={inviteForm.role} onValueChange={(value) => setInviteForm({ ...inviteForm, role: value })}>
          <SelectTrigger className="w-full px-4 py-3 rounded-xl border border-white/30 dark:border-slate-700/30 bg-white/50 dark:bg-slate-800/50" data-testid="select-user-role">
            <SelectValue placeholder="Select role" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="user">Standard User</SelectItem>
            <SelectItem value="admin">Administrator</SelectItem>
            <SelectItem value="security">Security</SelectItem>
            <SelectItem value="fire_marshal">Fire Marshal</SelectItem>
          </SelectContent>
        </Select>
      </div>
      
      <Button 
        type="submit" 
        className="w-full gradient-blue text-white"
        disabled={inviteMutation.isPending || !inviteForm.email || !inviteForm.role}
        data-testid="button-send-invitation"
      >
        {inviteMutation.isPending ? "Sending..." : "Send Invitation"}
      </Button>
    </form>
    </TooltipProvider>
    
    <div className="mt-6 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
      <h4 className="font-medium text-blue-800 dark:text-blue-200 mb-2">Invitation Process:</h4>
      <ul className="text-sm text-blue-700 dark:text-blue-300 space-y-1">
        <li>• User receives email invitation with secure link</li>
        <li>• They create their account using the invitation</li>
        <li>• Access permissions are based on assigned role</li>
        <li>• Invitations expire after 7 days</li>
      </ul>
    </div>
  </GlassCard>
</div>


{/* Email Invitation Dialog */}
<Dialog open={showAddEmailDialog} onOpenChange={setShowAddEmailDialog}>
  <DialogContent className="sm:max-w-md">
    <DialogHeader>
      <DialogTitle className="flex items-center gap-2">
        <Mail className="text-blue-600 dark:text-blue-400" size={24} />
        Send User Invitation
      </DialogTitle>
      <DialogDescription>
        Send an email invitation to create a new user account. They'll receive setup instructions.
      </DialogDescription>
    </DialogHeader>
    
    <form 
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (inviteForm.email && inviteForm.role) {
          inviteMutation.mutate(inviteForm);
        }
      }}
    >
      <div className="space-y-2">
        <Label htmlFor="inviteEmail" className="text-sm font-medium">
          Email Address
        </Label>
        <Input
          id="inviteEmail"
          type="email"
          placeholder=""
          value={inviteForm.email}
          onChange={(e) => setInviteForm({ ...inviteForm, email: e.target.value })}
          className="w-full"
          data-testid="input-invite-email"
          required
        />
      </div>
      
      <div className="space-y-2">
        <Label htmlFor="userRole" className="text-sm font-medium">
          User Role
        </Label>
        <Select value={inviteForm.role} onValueChange={(value) => setInviteForm({ ...inviteForm, role: value })}>
          <SelectTrigger className="w-full" data-testid="select-user-role">
            <SelectValue placeholder="Select role" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="user">Standard User</SelectItem>
            <SelectItem value="admin">Administrator</SelectItem>
            <SelectItem value="security">Security</SelectItem>
            <SelectItem value="fire_marshal">Fire Marshal</SelectItem>
          </SelectContent>
        </Select>
      </div>
      
      <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
        <p className="text-sm text-blue-700">
          <strong>Email Process:</strong> The user will receive an invitation email with setup instructions. 
          If email delivery fails, use the "Add Manually" option instead.
        </p>
      </div>
      
      <DialogFooter className="gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => setShowAddEmailDialog(false)}
          data-testid="button-cancel-invitation"
        >
          Cancel
        </Button>
        <Button 
          type="submit" 
          className="gradient-blue text-white"
          disabled={inviteMutation.isPending || !inviteForm.email || !inviteForm.role}
          data-testid="button-send-invitation"
        >
          {inviteMutation.isPending ? "Sending..." : "Send Invitation"}
        </Button>
      </DialogFooter>
    </form>
  </DialogContent>
</Dialog>


{/* Manual User Creation Dialog */}
<Dialog open={showManualUserDialog} onOpenChange={setShowManualUserDialog}>
  <DialogContent className="sm:max-w-[500px]">
    <DialogHeader>
      <DialogTitle className="flex items-center gap-2">
        <UserPlus className="text-blue-600 dark:text-blue-400" size={24} />
        Create User Account Manually
      </DialogTitle>
      <DialogDescription>
        Create a user account directly as a backup when email invitations aren't working.
      </DialogDescription>
    </DialogHeader>
    
    <form 
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (manualUserForm.username && manualUserForm.email && manualUserForm.password && manualUserForm.role) {
          manualUserMutation.mutate(manualUserForm);
        }
      }}
    >
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="manualFirstName" className="text-sm font-medium">
            First Name
          </Label>
          <Input
            id="manualFirstName"
            type="text"
            placeholder=""
            value={manualUserForm.firstName}
            onChange={(e) => setManualUserForm({ ...manualUserForm, firstName: e.target.value })}
            className="w-full"
            data-testid="input-manual-first-name"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="manualLastName" className="text-sm font-medium">
            Last Name
          </Label>
          <Input
            id="manualLastName"
            type="text"
            placeholder=""
            value={manualUserForm.lastName}
            onChange={(e) => setManualUserForm({ ...manualUserForm, lastName: e.target.value })}
            className="w-full"
            data-testid="input-manual-last-name"
          />
        </div>
      </div>
      
      <div className="space-y-2">
        <Label htmlFor="manualUsername" className="text-sm font-medium">
          Username *
        </Label>
        <Input
          id="manualUsername"
          type="text"
          placeholder=""
          value={manualUserForm.username}
          onChange={(e) => setManualUserForm({ ...manualUserForm, username: e.target.value })}
          className="w-full"
          data-testid="input-manual-username"
          required
        />
      </div>
      
      <div className="space-y-2">
        <Label htmlFor="manualEmail" className="text-sm font-medium">
          Email Address *
        </Label>
        <Input
          id="manualEmail"
          type="email"
          placeholder=""
          value={manualUserForm.email}
          onChange={(e) => setManualUserForm({ ...manualUserForm, email: e.target.value })}
          className="w-full"
          data-testid="input-manual-email"
          required
        />
      </div>
      
      <div className="space-y-2">
        <Label htmlFor="manualPassword" className="text-sm font-medium">
          Password *
        </Label>
        <Input
          id="manualPassword"
          type="password"
          placeholder=""
          value={manualUserForm.password}
          onChange={(e) => setManualUserForm({ ...manualUserForm, password: e.target.value })}
          className="w-full"
          data-testid="input-manual-password"
          required
        />
      </div>
      
      <div className="space-y-2">
        <Label htmlFor="manualRole" className="text-sm font-medium">
          User Role *
        </Label>
        <Select value={manualUserForm.role} onValueChange={(value) => setManualUserForm({ ...manualUserForm, role: value })}>
          <SelectTrigger className="w-full" data-testid="select-manual-role">
            <SelectValue placeholder="Select role" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="user">Standard User</SelectItem>
            <SelectItem value="admin">Administrator</SelectItem>
            <SelectItem value="security">Security</SelectItem>
            <SelectItem value="fire_marshal">Fire Marshal</SelectItem>
          </SelectContent>
        </Select>
      </div>
      
      <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg p-3">
        <p className="text-sm text-amber-700">
          <strong>Note:</strong> This creates the account immediately without email verification. 
          Use this option when email invitations aren't working.
        </p>
      </div>
      
      <DialogFooter className="gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => setShowManualUserDialog(false)}
          data-testid="button-cancel-manual-user"
        >
          Cancel
        </Button>
        <Button 
          type="submit" 
          className="gradient-blue text-white"
          disabled={manualUserMutation.isPending || !manualUserForm.username || !manualUserForm.email || !manualUserForm.password || !manualUserForm.role}
          data-testid="button-create-manual-user"
        >
          {manualUserMutation.isPending ? "Creating..." : "Create User"}
        </Button>
      </DialogFooter>
    </form>
  </DialogContent>
</Dialog>


{/* Edit User Dialog */}
<Dialog open={showEditUserDialog} onOpenChange={setShowEditUserDialog}>
  <DialogContent className="sm:max-w-[580px] max-h-[90vh] overflow-y-auto">
    <DialogHeader>
      <DialogTitle className="flex items-center gap-2">
        <Edit className="text-blue-600 dark:text-blue-400" size={24} />
        Edit User Account
      </DialogTitle>
      <DialogDescription>
        Update user information and permissions. Leave password blank to keep current password.
      </DialogDescription>
    </DialogHeader>
    
    <form 
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (userToEdit && editUserForm.username && editUserForm.email && editUserForm.role) {
          editUserMutation.mutate({
            userId: userToEdit.id,
            ...editUserForm
          });
        }
      }}
    >
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="editFirstName" className="text-sm font-medium">
            First Name
          </Label>
          <Input
            id="editFirstName"
            type="text"
            placeholder=""
            value={editUserForm.firstName}
            onChange={(e) => setEditUserForm({ ...editUserForm, firstName: e.target.value })}
            className="w-full"
            data-testid="input-edit-first-name"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="editLastName" className="text-sm font-medium">
            Last Name
          </Label>
          <Input
            id="editLastName"
            type="text"
            placeholder=""
            value={editUserForm.lastName}
            onChange={(e) => setEditUserForm({ ...editUserForm, lastName: e.target.value })}
            className="w-full"
            data-testid="input-edit-last-name"
          />
        </div>
      </div>
      
      <div className="space-y-2">
        <Label htmlFor="editUsername" className="text-sm font-medium">
          Username *
        </Label>
        <Input
          id="editUsername"
          type="text"
          placeholder=""
          value={editUserForm.username}
          onChange={(e) => setEditUserForm({ ...editUserForm, username: e.target.value })}
          className="w-full"
          data-testid="input-edit-username"
          required
        />
      </div>
      
      <div className="space-y-2">
        <Label htmlFor="editEmail" className="text-sm font-medium">
          Email Address *
        </Label>
        <Input
          id="editEmail"
          type="email"
          placeholder=""
          value={editUserForm.email}
          onChange={(e) => setEditUserForm({ ...editUserForm, email: e.target.value })}
          className="w-full"
          data-testid="input-edit-email"
          required
        />
      </div>
      
      <div className="space-y-2">
        <Label htmlFor="editPassword" className="text-sm font-medium">
          New Password (Optional)
        </Label>
        <Input
          id="editPassword"
          type="password"
          placeholder="Leave blank to keep current password"
          value={editUserForm.password}
          onChange={(e) => setEditUserForm({ ...editUserForm, password: e.target.value })}
          className="w-full"
          data-testid="input-edit-password"
        />
      </div>
      
      <div className="space-y-2">
        <Label htmlFor="editRole" className="text-sm font-medium">
          User Role *
        </Label>
        <Select value={editUserForm.role} onValueChange={(value) => setEditUserForm({ ...editUserForm, role: value })}>
          <SelectTrigger className="w-full" data-testid="select-edit-role">
            <SelectValue placeholder="Select role" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="user">Standard User</SelectItem>
            <SelectItem value="admin">Administrator</SelectItem>
            <SelectItem value="security">Security</SelectItem>
            <SelectItem value="fire_marshal">Fire Marshal</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {isAdminUser && (
        <div className="space-y-2">
          <Label className="text-sm font-medium">Default Landing Page</Label>
          <Select value={editUserForm.defaultLandingPage} onValueChange={(value) => setEditUserForm({ ...editUserForm, defaultLandingPage: value })}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Dashboard (default)" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="_default">Dashboard (default)</SelectItem>
              <SelectItem value="/">Dashboard</SelectItem>
              <SelectItem value="/visitors">Visitors</SelectItem>
              <SelectItem value="/contractors">Contractors</SelectItem>
              <SelectItem value="/staff">Staff</SelectItem>
              <SelectItem value="/members">Members</SelectItem>
              <SelectItem value="/meeting-rooms">Meeting Rooms</SelectItem>
              <SelectItem value="/time-attendance">T&A Report</SelectItem>
              <SelectItem value="/muster">Muster List</SelectItem>
              <SelectItem value="/incident-reports">Incident Reports</SelectItem>
              <SelectItem value="/martyn-law">Martyn's Law</SelectItem>
              <SelectItem value="/reports">Reports</SelectItem>
              <SelectItem value="/induction-settings">Induction Settings</SelectItem>
              <SelectItem value="/kiosk">Kiosk Mode</SelectItem>
              <SelectItem value="/email-outbox">Email Outbox</SelectItem>
              <SelectItem value="/settings">Settings</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">The page this user sees after logging in.</p>
        </div>
      )}
      {isAdminUser && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-sm font-medium">Page Access</Label>
            <span className="text-xs text-muted-foreground">
              {editUserForm.allowedMenuItems.length === 0 ? "Unrestricted (all pages)" : `${editUserForm.allowedMenuItems.length} page(s) allowed`}
            </span>
          </div>
          <p className="text-xs text-muted-foreground">Leave blank to allow all pages. Check specific pages to restrict access.</p>
          <div className="border rounded-lg p-3 space-y-2 max-h-48 overflow-y-auto bg-slate-50 dark:bg-slate-900/50">
            {[
              { path: "/", label: "Dashboard" },
              { path: "/visitors", label: "Visitors" },
              { path: "/contractors", label: "Contractors" },
              { path: "/staff", label: "Staff" },
              { path: "/members", label: "Members" },
              { path: "/meeting-rooms", label: "Meeting Rooms" },
              { path: "/time-attendance", label: "T&A Report" },
              { path: "/muster", label: "Muster List" },
              { path: "/incident-reports", label: "Incident Reports" },
              { path: "/ppm", label: "PPM" },
              { path: "/helpdesk", label: "Help Desk" },
              { path: "/martyn-law", label: "Martyn's Law" },
              { path: "/reports", label: "Reports" },
              { path: "/induction-settings", label: "Induction Settings" },
              { path: "/kiosk", label: "Kiosk Mode" },
              { path: "/email-outbox", label: "Email Outbox" },
              { path: "/settings", label: "Settings" },
            ].map((item) => {
              const checked = editUserForm.allowedMenuItems.includes(item.path);
              return (
                <label key={item.path} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(e) => {
                      const updated = e.target.checked
                        ? [...editUserForm.allowedMenuItems, item.path]
                        : editUserForm.allowedMenuItems.filter(p => p !== item.path);
                      setEditUserForm({ ...editUserForm, allowedMenuItems: updated });
                    }}
                    className="rounded border-gray-300"
                  />
                  <span className="text-sm">{item.label}</span>
                </label>
              );
            })}
          </div>
        </div>
      )}
      
      {!isAdminUser && (
        <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg p-3">
          <p className="text-sm text-amber-700">
            <strong>Note:</strong> Only administrators can change user roles.
          </p>
        </div>
      )}
      
      <DialogFooter className="gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => setShowEditUserDialog(false)}
          data-testid="button-cancel-edit-user"
        >
          Cancel
        </Button>
        <Button 
          type="submit" 
          className="gradient-blue text-white"
          disabled={editUserMutation.isPending || !editUserForm.username || !editUserForm.email || !editUserForm.role}
          data-testid="button-update-user"
        >
          {editUserMutation.isPending ? "Updating..." : "Update User"}
        </Button>
      </DialogFooter>
    </form>
  </DialogContent>
</Dialog>

    </div>
  );
}
