import { useState, useMemo } from "react";
import { Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Building2,
  Plus,
  Pencil,
  Archive,
  Copy,
  MapPin,
  Globe,
  CheckCircle2,
  Clock,
  ArchiveIcon,
  ExternalLink,
  Users,
  UserPlus,
  UserCheck,
  AlertTriangle,
  Loader2,
  ChevronRight,
  ChevronDown,
  Search,
  ShieldCheck,
  ShieldAlert,
  ShieldX,
  HardHat,
  MoreVertical,
  KeyRound,
  UserX,
  RefreshCw,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import GlassCard from "@/components/GlassCard";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Site {
  id: string;
  name: string;
  reference: string | null;
  address: string | null;
  postcode: string | null;
  region: string | null;
  areaId: string | null;
  status: string;
  isDefault: boolean;
  loginSlug: string | null;
  createdAt: string;
  archivedAt: string | null;
}

interface Area {
  id: string;
  name: string;
  description: string | null;
}

interface MyGrants {
  roles: string[];
  allowedSiteIds: string[] | "all";
  /** Site IDs where this user may manage site users (derived from siteManagementStyle). */
  canManageSiteIds?: string[];
  /** Customer's site management style: 'central' | 'independent' */
  siteManagementStyle?: string;
}

interface SiteUser {
  id: string;
  userId: string;
  role: "enterprise_admin" | "area_manager" | "site_coordinator";
  areaId: string | null;
  siteId: string | null;
  isInherited: boolean;
  user: {
    id: string;
    username: string;
    firstName: string | null;
    lastName: string | null;
    email: string | null;
  } | null;
}

interface EnterpriseUser {
  id: string;
  username: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  role: string;
}

interface ComplianceSiteData {
  siteId: string;
  siteName: string;
  score: number | null;
  categoryScores: Record<string, number | null>;
  openCriticals: number;
  openWarnings: number;
  contractorCount: number;
  onSiteCount: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { label: string; icon: typeof CheckCircle2; className: string }> = {
  active:     { label: "Active",      icon: CheckCircle2, className: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400" },
  onboarding: { label: "Onboarding",  icon: Clock,        className: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400" },
  archived:   { label: "Archived",    icon: ArchiveIcon,  className: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400" },
};

const ROLE_BADGE: Record<string, { label: string; className: string }> = {
  enterprise_admin: { label: "Enterprise Admin",  className: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400" },
  area_manager:     { label: "Area Manager",       className: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400" },
  site_coordinator: { label: "Site Coordinator",   className: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400" },
};

const CATEGORY_LABELS: Record<string, string> = {
  insurance:    "Insurance",
  rams:         "RAMS",
  inductions:   "Inductions",
  certificates: "Certificates",
  ppm:          "PPM",
  fire:         "Fire Risk",
  rtw:          "Right to Work",
};

function scoreColor(score: number | null | undefined): string {
  if (score == null) return "#94a3b8";
  if (score >= 80) return "#22c55e";
  if (score >= 50) return "#f59e0b";
  return "#ef4444";
}

function scoreStatusLabel(score: number | null | undefined): "compliant" | "warning" | "critical" | "nodata" {
  if (score == null) return "nodata";
  if (score >= 80) return "compliant";
  if (score >= 50) return "warning";
  return "critical";
}

function worstCategory(categoryScores: Record<string, number | null>): string | null {
  if (!categoryScores || Object.keys(categoryScores).length === 0) return null;
  const entries = Object.entries(categoryScores).filter(([, v]) => v !== null) as [string, number][];
  if (entries.length === 0) return null;
  const [worst] = entries.sort(([, a], [, b]) => a - b);
  return worst ? CATEGORY_LABELS[worst[0]] ?? worst[0] : null;
}

function userDisplayName(u: SiteUser["user"]): string {
  if (!u) return "Unknown";
  return [u.firstName, u.lastName].filter(Boolean).join(" ") || u.username;
}

function userInitials(u: SiteUser["user"]): string {
  if (!u) return "?";
  if (u.firstName && u.lastName) return `${u.firstName[0]}${u.lastName[0]}`.toUpperCase();
  return (u.username || "?")[0].toUpperCase();
}

function canManageSite(site: Site, myGrants: MyGrants | undefined): boolean {
  if (!myGrants) return false;
  if (myGrants.roles.includes("enterprise_admin")) return true;
  if (myGrants.roles.includes("area_manager")) {
    if (myGrants.allowedSiteIds === "all") return true;
    return (myGrants.allowedSiteIds as string[]).includes(site.id);
  }
  // site_coordinator with explicit user-management power for this site
  if (myGrants.canManageSiteIds?.includes(site.id)) return true;
  return false;
}

// ── Small score ring for the card ─────────────────────────────────────────────

function ScoreRingSmall({ score }: { score: number | null }) {
  const R = 16;
  const circ = 2 * Math.PI * R;
  const fill = score == null ? 0 : Math.min(100, Math.max(0, score));
  const dash = (fill / 100) * circ;
  const color = scoreColor(score);
  return (
    <div className="relative flex items-center justify-center shrink-0" style={{ width: 40, height: 40 }}>
      <svg width="40" height="40" viewBox="0 0 40 40" className="-rotate-90">
        <circle cx="20" cy="20" r={R} fill="none" stroke="#e2e8f0" strokeWidth="4"
          className="dark:stroke-slate-700" />
        <circle cx="20" cy="20" r={R} fill="none" stroke={color} strokeWidth="4"
          strokeDasharray={`${dash} ${circ - dash}`} strokeLinecap="round" />
      </svg>
      <span className="absolute text-[11px] font-bold" style={{ color }}>
        {score == null ? "—" : score}
      </span>
    </div>
  );
}

// ── Compliance status chip ────────────────────────────────────────────────────

function ComplianceChip({ score }: { score: number | null }) {
  const s = scoreStatusLabel(score);
  if (s === "nodata") return (
    <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400">
      <ShieldCheck size={10} /> No data
    </span>
  );
  if (s === "compliant") return (
    <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
      <ShieldCheck size={10} /> Compliant
    </span>
  );
  if (s === "warning") return (
    <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400">
      <ShieldAlert size={10} /> Warning
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400">
      <ShieldX size={10} /> Critical
    </span>
  );
}

// ── Add Site User Dialog ──────────────────────────────────────────────────────

function AddSiteUserDialog({
  open,
  onOpenChange,
  siteId,
  siteName,
  existingGrants,
  allUsers,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  siteId: string;
  siteName: string;
  existingGrants: SiteUser[];
  allUsers: EnterpriseUser[];
}) {
  const { toast } = useToast();
  const [mode, setMode] = useState<"new" | "existing">("new");

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [conflictUserId, setConflictUserId] = useState<string | null>(null);
  const [userId, setUserId] = useState("");

  function reset() {
    setMode("new");
    setUsername(""); setPassword(""); setEmail(""); setFirstName(""); setLastName("");
    setConflictUserId(null);
    setUserId("");
  }

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/enterprise/users", {
        username: username.trim(),
        password,
        email: email.trim() || null,
        firstName: firstName.trim() || null,
        lastName: lastName.trim() || null,
        role: "site_coordinator",
        siteId,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        if (res.status === 409 && err.existingUserId) setConflictUserId(err.existingUserId);
        throw new Error(err.error || "Failed to create user");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/enterprise/sites/${siteId}/users`] });
      queryClient.invalidateQueries({ queryKey: ["/api/enterprise/role-grants"] });
      queryClient.invalidateQueries({ queryKey: ["/api/enterprise/users"] });
      toast({ title: "User created", description: `${username} has been created and assigned as Site Coordinator for ${siteName}.` });
      onOpenChange(false);
      reset();
    },
    onError: (err: Error) => {
      if (!conflictUserId) toast({ title: "Failed to create user", description: err.message, variant: "destructive" });
    },
  });

  const alreadyCoordinator = useMemo(
    () => existingGrants.some((g) => g.userId === userId && g.role === "site_coordinator"),
    [existingGrants, userId],
  );

  const grantMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/enterprise/role-grants", { userId, role: "site_coordinator", siteId });
      if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.error || "Failed to add grant"); }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/enterprise/sites/${siteId}/users`] });
      queryClient.invalidateQueries({ queryKey: ["/api/enterprise/role-grants"] });
      toast({ title: "Coordinator added", description: "The user can now access this site." });
      onOpenChange(false);
      reset();
    },
    onError: (err: Error) => toast({ title: "Failed to add grant", description: err.message, variant: "destructive" }),
  });

  function switchToExistingWithConflict() {
    if (conflictUserId) { setUserId(conflictUserId); setMode("existing"); setConflictUserId(null); }
  }

  const canSubmitNew = !!username.trim() && password.length >= 8;
  const canSubmitExisting = !!userId && !alreadyCoordinator;

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) reset(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus size={16} className="text-blue-600" />
            Add Coordinator — {siteName}
          </DialogTitle>
        </DialogHeader>

        <div className="flex border border-border rounded-lg overflow-hidden text-sm">
          <button className={`flex-1 py-2 px-3 flex items-center justify-center gap-1.5 transition-colors ${mode === "new" ? "bg-primary text-primary-foreground font-medium" : "hover:bg-muted"}`}
            onClick={() => { setMode("new"); setConflictUserId(null); }}>
            <UserPlus size={13} /> New login
          </button>
          <button className={`flex-1 py-2 px-3 flex items-center justify-center gap-1.5 transition-colors ${mode === "existing" ? "bg-primary text-primary-foreground font-medium" : "hover:bg-muted"}`}
            onClick={() => { setMode("existing"); setConflictUserId(null); }}>
            <UserCheck size={13} /> Existing user
          </button>
        </div>

        {mode === "new" && (
          <div className="space-y-4 py-1">
            {conflictUserId && (
              <div className="flex flex-col gap-2 rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 p-3">
                <div className="flex items-start gap-2">
                  <AlertTriangle size={13} className="text-amber-600 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-700 dark:text-amber-400">
                    That username is already taken. Grant access to the existing account instead?
                  </p>
                </div>
                <Button size="sm" variant="outline" className="self-start h-7 text-xs" onClick={switchToExistingWithConflict}>
                  Use existing account
                </Button>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="new-first">First name</Label>
                <Input id="new-first" value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="Jane" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="new-last">Last name</Label>
                <Input id="new-last" value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Smith" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new-username">Username *</Label>
              <Input id="new-username" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="jane.smith" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new-email">Email</Label>
              <Input id="new-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="jane@example.com" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new-password">Password * (min 8 chars)</Label>
              <Input id="new-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
          </div>
        )}

        {mode === "existing" && (
          <div className="space-y-4 py-1">
            <div className="space-y-1.5">
              <Label htmlFor="existing-user">Select user</Label>
              <Select value={userId} onValueChange={setUserId}>
                <SelectTrigger id="existing-user"><SelectValue placeholder="Choose a user…" /></SelectTrigger>
                <SelectContent>
                  {allUsers.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {[u.firstName, u.lastName].filter(Boolean).join(" ") || u.username}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {alreadyCoordinator && (
              <p className="text-xs text-amber-600 dark:text-amber-400">This user is already a coordinator for this site.</p>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          {mode === "new" ? (
            <Button onClick={() => createMutation.mutate()} disabled={!canSubmitNew || createMutation.isPending}>
              {createMutation.isPending ? "Creating…" : "Create User"}
            </Button>
          ) : (
            <Button onClick={() => grantMutation.mutate()} disabled={!canSubmitExisting || grantMutation.isPending}>
              {grantMutation.isPending ? "Adding…" : "Add Coordinator"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── SiteUsersDialog ───────────────────────────────────────────────────────────

function SiteUsersDialog({
  open,
  onOpenChange,
  site,
  canManage,
  myGrants,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  site: Site;
  canManage: boolean;
  myGrants?: MyGrants;
}) {
  const { toast } = useToast();
  const [addOpen, setAddOpen] = useState(false);

  // Admin action modals
  const [editUser,       setEditUser]       = useState<SiteUser | null>(null);
  const [resetUser,      setResetUser]      = useState<SiteUser | null>(null);
  const [deactivateUser, setDeactivateUser] = useState<SiteUser | null>(null);
  const [replaceUser,    setReplaceUser]    = useState<SiteUser | null>(null);

  // Edit-details form state
  const [editFirstName, setEditFirstName] = useState("");
  const [editLastName,  setEditLastName]  = useState("");
  const [editEmail,     setEditEmail]     = useState("");
  const [editUsername,  setEditUsername]  = useState("");

  // Reset-password state
  const [newPassword, setNewPassword] = useState("");

  // Replace-admin form state
  const [repFirstName, setRepFirstName] = useState("");
  const [repLastName,  setRepLastName]  = useState("");
  const [repUsername,  setRepUsername]  = useState("");
  const [repEmail,     setRepEmail]     = useState("");
  const [repPassword,  setRepPassword]  = useState("");
  const [repConflict,  setRepConflict]  = useState(false);

  const usernameRegex = /^[A-Za-z0-9_-]{3,}$/;
  const canReplace =
    !!repFirstName.trim() && !!repLastName.trim() &&
    usernameRegex.test(repUsername.trim()) &&
    !!repEmail.trim() && repPassword.length >= 8;

  const { data: siteUsers = [], isLoading } = useQuery<SiteUser[]>({
    queryKey: [`/api/enterprise/sites/${site.id}/users`],
    enabled: open,
    staleTime: 15 * 1000,
  });

  const { data: allUsers = [] } = useQuery<EnterpriseUser[]>({
    queryKey: ["/api/enterprise/users"],
    enabled: open && canManage,
    staleTime: 60 * 1000,
  });

  const coordinators = siteUsers.filter((u) => u.role === "site_coordinator");
  const inherited    = siteUsers.filter((u) => u.isInherited);

  function openEdit(su: SiteUser) {
    setEditUser(su);
    setEditFirstName(su.user?.firstName ?? "");
    setEditLastName(su.user?.lastName ?? "");
    setEditEmail(su.user?.email ?? "");
    setEditUsername(su.user?.username ?? "");
  }

  // ── Mutations ──────────────────────────────────────────────────────────────

  const editMutation = useMutation({
    mutationFn: async () => {
      if (!editUser?.user) return;
      const res = await apiRequest("PATCH", `/api/enterprise/users/${editUser.user.id}`, {
        firstName: editFirstName.trim() || null,
        lastName:  editLastName.trim()  || null,
        email:     editEmail.trim()     || null,
        username:  editUsername.trim(),
      });
      if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.error || "Failed to update"); }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/enterprise/sites/${site.id}/users`] });
      queryClient.invalidateQueries({ queryKey: ["/api/enterprise/users"] });
      toast({ title: "Details updated" });
      setEditUser(null);
    },
    onError: (err: Error) => toast({ title: "Failed to update", description: err.message, variant: "destructive" }),
  });

  const resetPasswordMutation = useMutation({
    mutationFn: async () => {
      if (!resetUser?.user) return;
      const res = await apiRequest("PATCH", `/api/enterprise/users/${resetUser.user.id}/password`, { password: newPassword });
      if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.error || "Failed to reset password"); }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Password reset", description: "The new password has been set." });
      setResetUser(null);
      setNewPassword("");
    },
    onError: (err: Error) => toast({ title: "Failed to reset password", description: err.message, variant: "destructive" }),
  });

  const deactivateMutation = useMutation({
    mutationFn: async () => {
      if (!deactivateUser) return;
      const revokeRes = await apiRequest("DELETE", `/api/enterprise/role-grants/${deactivateUser.id}`, undefined);
      if (!revokeRes.ok && revokeRes.status !== 204) {
        const err = await revokeRes.json().catch(() => ({}));
        throw new Error(err.error || "Failed to remove site access");
      }
      if (deactivateUser.user?.id) {
        const deactivateRes = await apiRequest("PATCH", `/api/enterprise/users/${deactivateUser.user.id}/deactivate`, {});
        if (!deactivateRes.ok) {
          const err = await deactivateRes.json().catch(() => ({}));
          throw new Error(err.error || "Failed to deactivate account");
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/enterprise/sites/${site.id}/users`] });
      queryClient.invalidateQueries({ queryKey: ["/api/enterprise/users"] });
      toast({ title: "Administrator removed", description: "Site access revoked and account deactivated." });
      setDeactivateUser(null);
    },
    onError: (err: Error) => toast({ title: "Failed to remove administrator", description: err.message, variant: "destructive" }),
  });

  const replaceMutation = useMutation({
    mutationFn: async (newAdmin: { username: string; password: string; email: string; firstName: string; lastName: string }) => {
      if (!replaceUser) return;
      const createRes = await apiRequest("POST", "/api/enterprise/users", {
        ...newAdmin,
        role: "site_coordinator",
        siteId: site.id,
        canManageSiteUsers: true,
      });
      if (!createRes.ok) {
        const err = await createRes.json().catch(() => ({}));
        if (createRes.status === 409) { setRepConflict(true); }
        throw new Error(err.error || "Failed to create new administrator");
      }
      const revokeRes = await apiRequest("DELETE", `/api/enterprise/role-grants/${replaceUser.id}`, undefined);
      if (!revokeRes.ok && revokeRes.status !== 204) {
        const err = await revokeRes.json().catch(() => ({}));
        throw new Error(err.error || "New admin created, but failed to remove previous access");
      }
      if (replaceUser.user?.id) {
        await apiRequest("PATCH", `/api/enterprise/users/${replaceUser.user.id}/deactivate`, {});
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/enterprise/sites/${site.id}/users`] });
      queryClient.invalidateQueries({ queryKey: ["/api/enterprise/users"] });
      toast({ title: "Administrator replaced", description: "New administrator created. Previous access revoked." });
      setReplaceUser(null);
    },
    onError: (err: Error) => {
      if (!repConflict) toast({ title: "Replace failed", description: err.message, variant: "destructive" });
    },
  });

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Building2 size={16} className="text-blue-600" />
              {site.name} — Users
            </DialogTitle>
          </DialogHeader>

          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 size={20} className="animate-spin text-muted-foreground" />
            </div>
          ) : siteUsers.length === 0 ? (
            <div className="text-center py-8 space-y-2">
              <Users size={28} className="mx-auto text-muted-foreground" />
              <p className="text-sm font-medium">No users assigned to this site</p>
              <p className="text-xs text-muted-foreground">Add a Site Coordinator to give someone access.</p>
            </div>
          ) : (
            <div className="space-y-4 max-h-80 overflow-y-auto pr-1">
              {coordinators.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 px-1">Site Coordinators</p>
                  <div className="space-y-1">
                    {coordinators.map((su) => (
                      <div key={su.id} className="flex items-center gap-3 rounded-lg px-3 py-2.5 hover:bg-muted/40 transition-colors">
                        <div className="w-8 h-8 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center flex-shrink-0 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                          {userInitials(su.user)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium truncate">{userDisplayName(su.user)}</p>
                          {su.user?.email && <p className="text-xs text-muted-foreground truncate">{su.user.email}</p>}
                        </div>
                        <span className="text-[11px] px-2 py-0.5 rounded-full font-medium flex-shrink-0 bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400">
                          Coordinator
                        </span>
                        {canManage && (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-7 w-7 flex-shrink-0">
                                <MoreVertical size={14} />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-44">
                              <DropdownMenuItem onClick={() => openEdit(su)}>
                                <Pencil size={13} className="mr-2" /> Edit details
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => { setResetUser(su); setNewPassword(""); }}>
                                <KeyRound size={13} className="mr-2" /> Reset password
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => { setReplaceUser(su); setRepFirstName(""); setRepLastName(""); setRepUsername(""); setRepEmail(""); setRepPassword(""); setRepConflict(false); }}>
                                <RefreshCw size={13} className="mr-2" /> Replace
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => setDeactivateUser(su)}>
                                <UserX size={13} className="mr-2" /> Deactivate & remove
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {inherited.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 px-1">Also have access (via area or enterprise role)</p>
                  <div className="space-y-1">
                    {inherited.map((su) => {
                      const badge = ROLE_BADGE[su.role];
                      return (
                        <div key={su.id} className="flex items-center gap-3 rounded-lg px-3 py-2.5 hover:bg-muted/40 transition-colors opacity-80">
                          <div className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center flex-shrink-0 text-xs font-semibold text-slate-500">
                            {userInitials(su.user)}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium truncate">{userDisplayName(su.user)}</p>
                            {su.user?.email && <p className="text-xs text-muted-foreground truncate">{su.user.email}</p>}
                          </div>
                          <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${badge?.className}`}>
                            {badge?.label}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Management style context banner for site coordinators */}
          {myGrants?.roles.includes("site_coordinator") &&
           !myGrants?.roles.includes("enterprise_admin") &&
           !myGrants?.roles.includes("area_manager") && (
            <div className={`flex items-start gap-2 rounded-md px-3 py-2 text-xs border ${
              myGrants?.siteManagementStyle === "independent"
                ? "bg-emerald-50 border-emerald-200 text-emerald-800 dark:bg-emerald-900/20 dark:border-emerald-800 dark:text-emerald-300"
                : "bg-slate-50 border-slate-200 text-slate-600 dark:bg-slate-800/50 dark:border-slate-700 dark:text-slate-400"
            }`}>
              <span className="mt-0.5 flex-shrink-0">{myGrants?.siteManagementStyle === "independent" ? "✓" : "ℹ"}</span>
              <span>
                {myGrants?.siteManagementStyle === "independent"
                  ? "You can manage the users for your site(s)."
                  : "User management is handled centrally by head office."}
              </span>
            </div>
          )}

          {canManage && (
            <div className="flex justify-between items-center pt-2 border-t border-border/50">
              <p className="text-xs text-muted-foreground">{coordinators.length} coordinator{coordinators.length !== 1 ? "s" : ""} assigned</p>
              <Button size="sm" className="gap-1.5" onClick={() => setAddOpen(true)}>
                <UserPlus size={13} />
                Add User
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Edit details ──────────────────────────────────────────────────────── */}
      <Dialog open={!!editUser} onOpenChange={(v) => !v && setEditUser(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil size={14} className="text-blue-600" /> Edit Administrator
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="eu-first">First name</Label>
                <Input id="eu-first" value={editFirstName} onChange={(e) => setEditFirstName(e.target.value)} placeholder="Jane" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="eu-last">Last name</Label>
                <Input id="eu-last" value={editLastName} onChange={(e) => setEditLastName(e.target.value)} placeholder="Smith" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="eu-username">Username</Label>
              <Input id="eu-username" value={editUsername} onChange={(e) => setEditUsername(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="eu-email">Email</Label>
              <Input id="eu-email" type="email" value={editEmail} onChange={(e) => setEditEmail(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditUser(null)}>Cancel</Button>
            <Button onClick={() => editMutation.mutate()} disabled={!editUsername.trim() || editMutation.isPending}>
              {editMutation.isPending ? "Saving…" : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Reset password ────────────────────────────────────────────────────── */}
      <Dialog open={!!resetUser} onOpenChange={(v) => !v && setResetUser(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound size={14} className="text-blue-600" /> Reset Password — {resetUser ? userDisplayName(resetUser.user) : ""}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <div className="space-y-1.5">
              <Label htmlFor="rp-password">New Password * (min 8 characters)</Label>
              <Input id="rp-password" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} autoComplete="new-password" />
            </div>
            <p className="text-xs text-amber-600 dark:text-amber-400">Share this password securely. The administrator should change it on first login.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResetUser(null)}>Cancel</Button>
            <Button onClick={() => resetPasswordMutation.mutate()} disabled={newPassword.length < 8 || resetPasswordMutation.isPending}>
              {resetPasswordMutation.isPending ? "Saving…" : "Set Password"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Deactivate & remove confirm ───────────────────────────────────────── */}
      <AlertDialog open={!!deactivateUser} onOpenChange={(v) => !v && setDeactivateUser(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Deactivate & Remove Administrator?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove <strong>{deactivateUser ? userDisplayName(deactivateUser.user) : ""}</strong> from{" "}
              <strong>{site.name}</strong> and deactivate their account. You can reactivate them via platform admin if needed later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deactivateMutation.mutate()}
              disabled={deactivateMutation.isPending}
            >
              {deactivateMutation.isPending ? "Removing…" : "Deactivate & Remove"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Replace admin ─────────────────────────────────────────────────────── */}
      <Dialog open={!!replaceUser} onOpenChange={(v) => !v && setReplaceUser(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RefreshCw size={14} className="text-blue-600" /> Replace Administrator
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <p className="text-xs text-muted-foreground">
              Create the new administrator. <strong>{replaceUser ? userDisplayName(replaceUser.user) : ""}</strong>'s site access will be revoked and their account deactivated.
            </p>
            {repConflict && (
              <div className="rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 p-3 text-xs text-amber-700 dark:text-amber-400 flex items-start gap-2">
                <AlertTriangle size={13} className="flex-shrink-0 mt-0.5" />
                That username is already taken. Choose a different one.
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="rep-first">First Name *</Label>
                <Input id="rep-first" value={repFirstName} onChange={(e) => setRepFirstName(e.target.value)} placeholder="Jane" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="rep-last">Last Name *</Label>
                <Input id="rep-last" value={repLastName} onChange={(e) => setRepLastName(e.target.value)} placeholder="Smith" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rep-username">Username *</Label>
              <Input id="rep-username" value={repUsername} onChange={(e) => { setRepUsername(e.target.value); setRepConflict(false); }} placeholder="jane.smith" />
              <p className="text-xs text-muted-foreground">Letters, numbers, underscores, and hyphens only. Min 3 characters.</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rep-email">Email *</Label>
              <Input id="rep-email" type="email" value={repEmail} onChange={(e) => setRepEmail(e.target.value)} placeholder="jane@example.com" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rep-password">Password * (min 8 characters)</Label>
              <Input id="rep-password" type="password" value={repPassword} onChange={(e) => setRepPassword(e.target.value)} autoComplete="new-password" />
              <p className="text-xs text-amber-600 dark:text-amber-400">Share this password securely. The administrator should change it on first login.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReplaceUser(null)}>Cancel</Button>
            <Button
              onClick={() => replaceMutation.mutate({ username: repUsername.trim(), password: repPassword, email: repEmail.trim(), firstName: repFirstName.trim(), lastName: repLastName.trim() })}
              disabled={!canReplace || replaceMutation.isPending}
            >
              {replaceMutation.isPending ? "Replacing…" : "Replace Administrator"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {canManage && (
        <AddSiteUserDialog
          open={addOpen}
          onOpenChange={setAddOpen}
          siteId={site.id}
          siteName={site.name}
          existingGrants={siteUsers}
          allUsers={allUsers}
        />
      )}
    </>
  );
}

// ── SiteCard ──────────────────────────────────────────────────────────────────

function SiteCard({
  site,
  areas,
  myGrants,
  compliance,
  onEdit,
  onArchive,
}: {
  site: Site;
  areas: Area[];
  myGrants: MyGrants | undefined;
  compliance: ComplianceSiteData | undefined;
  onEdit: (s: Site) => void;
  onArchive: (s: Site) => void;
}) {
  const { toast } = useToast();
  const [usersOpen, setUsersOpen] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);
  const cfg = STATUS_CONFIG[site.status] ?? STATUS_CONFIG.active;
  const StatusIcon = cfg.icon;
  const area = areas.find((a) => a.id === site.areaId);
  const kioskUrl = `${window.location.origin}/kiosk?site=${site.id}`;
  const siteCanManage = canManageSite(site, myGrants);
  const headline = compliance ? worstCategory(compliance.categoryScores) : null;
  const openIssues = compliance ? compliance.openCriticals + compliance.openWarnings : null;

  const copyKioskUrl = () => {
    navigator.clipboard.writeText(kioskUrl).then(() => {
      toast({ title: "Kiosk URL copied", description: "Paste into your kiosk browser or share with on-site staff." });
    });
  };

  return (
    <>
      <GlassCard className="p-0 flex flex-col hover:shadow-lg transition-shadow overflow-hidden">
        {/* Compliance header */}
        <div className="p-4 pb-3 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-start gap-3">
            {compliance ? (
              <ScoreRingSmall score={compliance.score} />
            ) : (
              <div className="w-10 h-10 rounded-xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center flex-shrink-0">
                <Building2 size={18} className="text-blue-600 dark:text-blue-400" />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-1">
                <h3 className="font-semibold text-sm truncate">{site.name}</h3>
                <div className="flex items-center gap-1 flex-shrink-0">
                  {site.isDefault && (
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0">Default</Badge>
                  )}
                  <span className={`inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full font-medium ${cfg.className}`}>
                    <StatusIcon size={9} />
                    {cfg.label}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                {compliance ? (
                  <ComplianceChip score={compliance.score} />
                ) : (
                  <span className="text-[11px] text-slate-400 italic">No compliance data</span>
                )}
                {headline && (
                  <span className="text-[11px] text-slate-500 truncate">· {headline}</span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Site details */}
        <div className="px-4 py-3 space-y-1.5 flex-1">
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
            {(site.address || site.postcode || (site as any).city) && (
              <span className="flex items-center gap-1">
                <MapPin size={11} className="flex-shrink-0" />
                <span className="truncate">{[site.address, (site as any).city, site.postcode].filter(Boolean).join(", ")}</span>
              </span>
            )}
            {site.region && (
              <span className="flex items-center gap-1">
                <Globe size={11} className="flex-shrink-0" />
                <span>{site.region}</span>
              </span>
            )}
            {(site as any).propertyType && (
              <span className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 capitalize">
                {((site as any).propertyType as string).replace(/_/g, " ")}
              </span>
            )}
            {area && (
              <span className="flex items-center gap-1">
                <Building2 size={11} className="flex-shrink-0" />
                <span>Area: {area.name}</span>
              </span>
            )}
          </div>

            {/* Footer stat row: Contractors · On site · Open issues */}
          {compliance && (
            <div className="flex items-center gap-3 text-xs pt-0.5">
              <span className="flex items-center gap-1 text-slate-500 dark:text-slate-400">
                <HardHat size={11} className="text-slate-400" />
                <span className="font-medium text-slate-700 dark:text-slate-200">{compliance.contractorCount}</span>
                <span>contractors</span>
              </span>
              <span className="text-slate-300 dark:text-slate-600">·</span>
              <span className="flex items-center gap-1 text-slate-500 dark:text-slate-400">
                <Users size={11} className="text-slate-400" />
                <span className="font-medium text-slate-700 dark:text-slate-200">{compliance.onSiteCount}</span>
                <span>on site</span>
              </span>
              <span className="text-slate-300 dark:text-slate-600">·</span>
              {openIssues !== null && openIssues > 0 ? (
                <span className="flex items-center gap-1 text-red-600 dark:text-red-400 font-medium">
                  <AlertTriangle size={11} className="flex-shrink-0" />
                  {openIssues} issue{openIssues !== 1 ? "s" : ""}
                </span>
              ) : (
                <span className="flex items-center gap-1 text-green-600 dark:text-green-400">
                  <CheckCircle2 size={11} />
                  All clear
                </span>
              )}
            </div>
          )}
        </div>

        {/* Footer: actions */}
        <div className="px-4 py-3 border-t border-slate-100 dark:border-slate-800 space-y-2">
          {/* View details link */}
          <Link href={`/enterprise/sites/${site.id}`}>
            <Button size="sm" className="w-full gap-1.5 h-8">
              <ShieldCheck size={13} />
              View Compliance Details
              <ChevronRight size={12} className="ml-auto" />
            </Button>
          </Link>

          {/* Manage toggle */}
          <button
            onClick={() => setManageOpen(!manageOpen)}
            className="w-full flex items-center justify-between text-xs text-muted-foreground hover:text-foreground transition-colors py-0.5"
          >
            <span className="font-medium">Manage site</span>
            <ChevronDown size={13} className={`transition-transform ${manageOpen ? "rotate-180" : ""}`} />
          </button>

          {manageOpen && (
            <div className="space-y-2 pt-1 border-t border-slate-100 dark:border-slate-800">
              {/* Users */}
              <button
                onClick={() => setUsersOpen(true)}
                className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors w-full"
              >
                <Users size={12} className="text-blue-500 flex-shrink-0" />
                <span>View users at this site</span>
                {siteCanManage && (
                  <span className="ml-auto text-blue-600 dark:text-blue-400 hover:underline font-medium">Manage</span>
                )}
              </button>

              {/* Staff login — normal login page, site name as Company Name */}
              {site.loginSlug && (
                <div className="bg-blue-50 dark:bg-blue-950/20 rounded-lg p-2.5 space-y-1.5 border border-blue-100 dark:border-blue-900/40">
                  <div className="flex items-center gap-1.5">
                    <p className="text-[10px] font-medium text-blue-700 dark:text-blue-400 uppercase tracking-wide">Staff Login</p>
                  </div>
                  <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
                    Staff go to the normal sign-in page and type{" "}
                    <span className="font-mono font-semibold text-blue-700 dark:text-blue-300 bg-blue-100 dark:bg-blue-900/40 px-1 py-0.5 rounded">{site.loginSlug}</span>{" "}
                    as the Company Name.
                  </p>
                  <Button size="sm" variant="outline" className="h-6 text-xs gap-1 w-full border-blue-200 dark:border-blue-800"
                    onClick={() => navigator.clipboard.writeText(site.loginSlug!).then(() => toast({ title: "Login name copied", description: "Share this name with staff who need access to this site." }))}>
                    <Copy size={11} /> Copy login name
                  </Button>
                </div>
              )}

              {/* Sign-in terminal (kiosk) — public tablet at the entrance door */}
              <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-2.5 space-y-1.5">
                <div>
                  <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Sign-in Terminal (Kiosk)</p>
                  <p className="text-[10px] text-muted-foreground/70 mt-0.5">For the tablet at the entrance door — visitors &amp; contractors sign in here</p>
                </div>
                <p className="text-[10px] font-mono text-slate-600 dark:text-slate-400 break-all line-clamp-2">{kioskUrl}</p>
                <div className="flex gap-1.5">
                  <Button size="sm" variant="outline" className="h-6 text-xs gap-1 flex-1" onClick={copyKioskUrl}>
                    <Copy size={11} /> Copy
                  </Button>
                  <Button size="sm" variant="outline" className="h-6 text-xs gap-1" onClick={() => window.open(kioskUrl, "_blank")}>
                    <ExternalLink size={11} /> Open
                  </Button>
                </div>
              </div>

              {/* Edit / Archive */}
              {!site.isDefault && site.status !== "archived" && (
                <div className="flex gap-2">
                  <Button size="sm" variant="ghost" className="h-7 text-xs gap-1.5 flex-1" onClick={() => onEdit(site)}>
                    <Pencil size={12} /> Edit
                  </Button>
                  <Button size="sm" variant="ghost"
                    className="h-7 text-xs gap-1.5 text-amber-600 hover:text-amber-700 hover:bg-amber-50 dark:hover:bg-amber-950/30"
                    onClick={() => onArchive(site)}>
                    <Archive size={12} /> Archive
                  </Button>
                </div>
              )}
              {site.isDefault && (
                <Button size="sm" variant="ghost" className="h-7 text-xs gap-1.5 w-full" onClick={() => onEdit(site)}>
                  <Pencil size={12} /> Edit
                </Button>
              )}
            </div>
          )}
        </div>
      </GlassCard>

      <SiteUsersDialog
        open={usersOpen}
        onOpenChange={setUsersOpen}
        site={site}
        canManage={siteCanManage}
        myGrants={myGrants}
      />
    </>
  );
}

// ── SiteFormDialog ────────────────────────────────────────────────────────────

function SiteFormDialog({
  open,
  onOpenChange,
  site,
  areas,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  site: Site | null;
  areas: Area[];
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const isEdit = !!site;

  // Site fields
  const [name, setName]           = useState(site?.name ?? "");
  const [reference, setReference] = useState(site?.reference ?? "");
  const [address, setAddress]     = useState(site?.address ?? "");
  const [addressLine2, setAddressLine2] = useState((site as any)?.addressLine2 ?? "");
  const [city, setCity]           = useState((site as any)?.city ?? "");
  const [county, setCounty]       = useState((site as any)?.county ?? "");
  const [postcode, setPostcode]   = useState(site?.postcode ?? "");
  const [region, setRegion]       = useState(site?.region ?? "");
  const [areaId, setAreaId]       = useState(site?.areaId ?? "none");
  const [status, setStatus]       = useState<string>(site?.status ?? "active");
  // On-site contact — split into first / last name (stored as combined siteContactName on the site record)
  const _existingContactName = (site as any)?.siteContactName ?? "";
  const _contactNameParts    = _existingContactName.trim().split(/\s+/);
  const [siteContactFirstName, setSiteContactFirstName] = useState(_contactNameParts[0] ?? "");
  const [siteContactLastName,  setSiteContactLastName]  = useState(_contactNameParts.slice(1).join(" ") ?? "");
  const [siteContactRole, setSiteContactRole]   = useState((site as any)?.siteContactRole ?? "");
  const [siteContactPhone, setSiteContactPhone] = useState((site as any)?.siteContactPhone ?? "");
  const [siteContactEmail, setSiteContactEmail] = useState((site as any)?.siteContactEmail ?? "");
  const [accessNotes, setAccessNotes]           = useState((site as any)?.accessNotes ?? "");
  // Property profile
  const [propertyType, setPropertyType]         = useState<string>((site as any)?.propertyType ?? "");
  const [clientName, setClientName]             = useState((site as any)?.clientName ?? "");
  const [managingSurveyor, setManagingSurveyor] = useState((site as any)?.managingSurveyor ?? "");
  const [floorArea, setFloorArea]               = useState((site as any)?.floorArea ?? "");
  const [unitCount, setUnitCount]               = useState((site as any)?.unitCount != null ? String((site as any).unitCount) : "");
  // Wayfinding
  const [what3words, setWhat3words] = useState((site as any)?.what3words ?? "");
  const [mapLink, setMapLink]       = useState((site as any)?.mapLink ?? "");

  // Admin fields (create-only)
  const [adminFirstName, setAdminFirstName] = useState("");
  const [adminLastName,  setAdminLastName]  = useState("");
  const [adminUsername,  setAdminUsername]  = useState("");
  const [adminEmail,     setAdminEmail]     = useState("");
  const [adminPassword,  setAdminPassword]  = useState("");

  const usernameRegex = /^[A-Za-z0-9_-]{3,}$/;
  const emailRegex    = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  const adminValid =
    !!adminFirstName.trim() &&
    !!adminLastName.trim() &&
    usernameRegex.test(adminUsername.trim()) &&
    emailRegex.test(adminEmail.trim()) &&
    adminPassword.length >= 8;

  const canSubmit = !!name.trim() && !!address.trim() && !!city.trim() && !!postcode.trim() && (isEdit || adminValid);

  function resetAdmin() {
    setAdminFirstName(""); setAdminLastName(""); setAdminUsername("");
    setAdminEmail(""); setAdminPassword("");
  }

  const mutation = useMutation({
    mutationFn: async (body: Record<string, any>) => {
      const res = isEdit
        ? await apiRequest("PATCH", `/api/enterprise/sites/${site!.id}`, body)
        : await apiRequest("POST", `/api/enterprise/sites`, body);
      if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.error || "Failed to save site"); }
      return res.json();
    },
    onSuccess: async (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/enterprise/sites"] });

      if (!isEdit) {
        // Step 2: create the site administrator
        try {
          const userRes = await apiRequest("POST", "/api/enterprise/users", {
            username:          adminUsername.trim(),
            password:          adminPassword,
            email:             adminEmail.trim(),
            firstName:         adminFirstName.trim(),
            lastName:          adminLastName.trim(),
            role:              "site_coordinator",
            siteId:            data.id,
            canManageSiteUsers: true,
          });
          if (!userRes.ok) {
            const err = await userRes.json().catch(() => ({}));
            if (userRes.status === 409) {
              toast({
                title: "Site created",
                description: `Site created, but the username "${adminUsername.trim()}" is already taken. Open the site and add the administrator manually.`,
                variant: "destructive",
              });
              onSaved();
              onOpenChange(false);
              resetAdmin();
              return;
            }
            throw new Error(err.error || "Failed to create administrator");
          }
          const fullName = `${adminFirstName.trim()} ${adminLastName.trim()}`.trim();
          toast({ title: "Site created", description: `Site created and ${fullName} set up as site administrator.` });
        } catch (adminErr: any) {
          toast({
            title: "Site created",
            description: `Site saved, but administrator setup failed: ${adminErr.message}. Open the site to add one manually.`,
            variant: "destructive",
          });
        }
      } else {
        toast({ title: "Site updated" });
      }

      onSaved();
      onOpenChange(false);
      resetAdmin();
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    const parsedUnitCount = unitCount.trim() ? (parseInt(unitCount.trim(), 10) || null) : null;
    mutation.mutate({
      name:             name.trim(),
      reference:        reference.trim()        || null,
      address:          address.trim()          || null,
      addressLine2:     addressLine2.trim()     || null,
      city:             city.trim()             || null,
      county:           county.trim()           || null,
      postcode:         postcode.trim()         || null,
      region:           region.trim()           || null,
      areaId:           areaId === "none" ? null : areaId,
      status,
      siteContactFirstName: siteContactFirstName.trim() || null,
      siteContactLastName:  siteContactLastName.trim()  || null,
      siteContactRole:  siteContactRole.trim()  || null,
      siteContactPhone: siteContactPhone.trim() || null,
      siteContactEmail: siteContactEmail.trim() || null,
      accessNotes:      accessNotes.trim()      || null,
      propertyType:     propertyType            || null,
      clientName:       clientName.trim()       || null,
      managingSurveyor: managingSurveyor.trim() || null,
      floorArea:        floorArea.trim()        || null,
      unitCount:        parsedUnitCount,
      what3words:       what3words.trim()       || null,
      mapLink:          mapLink.trim()          || null,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Site" : "Add New Site"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* ── Site details ─────────────────────────────── */}
          <div className="space-y-1.5">
            <Label htmlFor="site-name">Site Name *</Label>
            <Input id="site-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. London HQ" required />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="site-ref">Reference</Label>
              <Input id="site-ref" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Auto (SITE-001)" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="site-status">Status</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger id="site-status"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="onboarding">Onboarding</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="site-address">Address line 1 *</Label>
            <Input id="site-address" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Street address" required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="site-address2">Address line 2</Label>
            <Input id="site-address2" value={addressLine2} onChange={(e) => setAddressLine2(e.target.value)} placeholder="Unit, floor, building name…" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="site-city">Town / City *</Label>
              <Input id="site-city" value={city} onChange={(e) => setCity(e.target.value)} placeholder="London" required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="site-county">County</Label>
              <Input id="site-county" value={county} onChange={(e) => setCounty(e.target.value)} placeholder="Greater London" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="site-postcode">Postcode *</Label>
              <Input id="site-postcode" value={postcode} onChange={(e) => setPostcode(e.target.value)} placeholder="SW1A 1AA" required />
              <p className="text-xs text-muted-foreground">The postcode places this site on the Estate Map.</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="site-region">Region</Label>
              <Input id="site-region" value={region} onChange={(e) => setRegion(e.target.value)} placeholder="e.g. South East" />
            </div>
          </div>
          {areas.length > 0 && (
            <div className="space-y-1.5">
              <Label htmlFor="site-area">Area</Label>
              <Select value={areaId} onValueChange={setAreaId}>
                <SelectTrigger id="site-area"><SelectValue placeholder="No area" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No area</SelectItem>
                  {areas.map((a) => (
                    <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* ── On-site Contact ─────────────────────────── */}
          <div className="border-t border-border/60 pt-4 space-y-3">
            <div className="flex items-baseline gap-2">
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">On-site Contact</p>
              <span className="text-xs text-muted-foreground">If an email is provided, a staff record is created automatically.</span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="contact-first-name">First Name</Label>
                <Input id="contact-first-name" value={siteContactFirstName} onChange={(e) => setSiteContactFirstName(e.target.value)} placeholder="Jane" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="contact-last-name">Last Name</Label>
                <Input id="contact-last-name" value={siteContactLastName} onChange={(e) => setSiteContactLastName(e.target.value)} placeholder="Smith" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="contact-role">Role</Label>
              <Input id="contact-role" value={siteContactRole} onChange={(e) => setSiteContactRole(e.target.value)} placeholder="Facilities Manager" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="contact-phone">Phone</Label>
                <Input id="contact-phone" type="tel" value={siteContactPhone} onChange={(e) => setSiteContactPhone(e.target.value)} placeholder="020 7946 0000" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="contact-email">Email</Label>
                <Input id="contact-email" type="email" value={siteContactEmail} onChange={(e) => setSiteContactEmail(e.target.value)} placeholder="jane@example.com" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="access-notes">Access / opening-hours notes</Label>
              <Input id="access-notes" value={accessNotes} onChange={(e) => setAccessNotes(e.target.value)} placeholder="Mon–Fri 07:00–19:00, security entrance on left…" />
            </div>
          </div>

          {/* ── Property ─────────────────────────────────── */}
          <div className="border-t border-border/60 pt-4 space-y-3">
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">Property</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="property-type">Property type</Label>
                <Select value={propertyType || "none"} onValueChange={(v) => setPropertyType(v === "none" ? "" : v)}>
                  <SelectTrigger id="property-type"><SelectValue placeholder="Select type" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Not specified</SelectItem>
                    <SelectItem value="office">Office</SelectItem>
                    <SelectItem value="retail">Retail</SelectItem>
                    <SelectItem value="industrial">Industrial</SelectItem>
                    <SelectItem value="warehouse">Warehouse</SelectItem>
                    <SelectItem value="mixed_use">Mixed-use</SelectItem>
                    <SelectItem value="residential">Residential</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="client-name">Client / landlord</Label>
                <Input id="client-name" value={clientName} onChange={(e) => setClientName(e.target.value)} placeholder="Acme Ltd" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="surveyor">Managing surveyor</Label>
                <Input id="surveyor" value={managingSurveyor} onChange={(e) => setManagingSurveyor(e.target.value)} placeholder="Jones Lang LaSalle" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="floor-area">Floor area</Label>
                <Input id="floor-area" value={floorArea} onChange={(e) => setFloorArea(e.target.value)} placeholder="12,000 sq ft" />
              </div>
            </div>
            <div className="space-y-1.5 w-1/3">
              <Label htmlFor="unit-count">Units</Label>
              <Input id="unit-count" type="number" min="0" value={unitCount} onChange={(e) => setUnitCount(e.target.value)} placeholder="0" />
            </div>
          </div>

          {/* ── Wayfinding ───────────────────────────────── */}
          <div className="border-t border-border/60 pt-4 space-y-3">
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">Wayfinding</p>
            <div className="space-y-1.5">
              <Label htmlFor="what3words">what3words</Label>
              <Input id="what3words" value={what3words} onChange={(e) => setWhat3words(e.target.value)} placeholder="word.word.word" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="map-link">Map link</Label>
              <Input id="map-link" value={mapLink} onChange={(e) => setMapLink(e.target.value)} placeholder="https://maps.google.com/…" />
            </div>
          </div>

          {/* ── Site Administrator (create-only) ─────────── */}
          {!isEdit && (
            <div className="border-t border-border/60 pt-4 space-y-3">
              <div className="flex items-center gap-2">
                <UserPlus size={14} className="text-blue-600" />
                <span className="text-sm font-semibold">Site Administrator</span>
                <span className="text-xs text-muted-foreground">(required)</span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="admin-first">First Name *</Label>
                  <Input id="admin-first" value={adminFirstName} onChange={(e) => setAdminFirstName(e.target.value)} placeholder="Jane" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="admin-last">Last Name *</Label>
                  <Input id="admin-last" value={adminLastName} onChange={(e) => setAdminLastName(e.target.value)} placeholder="Smith" />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="admin-username">Username *</Label>
                <Input id="admin-username" value={adminUsername} onChange={(e) => setAdminUsername(e.target.value)} placeholder="jane.smith" />
                <p className="text-xs text-muted-foreground">Letters, numbers, underscores, and hyphens only. Min 3 characters.</p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="admin-email">Email *</Label>
                <Input id="admin-email" type="email" value={adminEmail} onChange={(e) => setAdminEmail(e.target.value)} placeholder="jane@example.com" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="admin-password">Password * (min 8 characters)</Label>
                <Input id="admin-password" type="password" value={adminPassword} onChange={(e) => setAdminPassword(e.target.value)} autoComplete="new-password" />
                <p className="text-xs text-amber-600 dark:text-amber-400">Share this password securely. The administrator should change it on first login.</p>
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={mutation.isPending || !canSubmit}>
              {mutation.isPending ? "Saving…" : isEdit ? "Save Changes" : "Create Site"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Stat card ─────────────────────────────────────────────────────────────────

function StatCard({
  label, value, sub, color,
}: { label: string; value: number | string; sub?: string; color: string }) {
  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4">
      <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">{label}</p>
      <p className="text-2xl font-bold" style={{ color }}>{value}</p>
      {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

const PAGE_SIZE = 9;
type FilterTab = "all" | "compliant" | "warning" | "critical";

export default function EnterpriseSites() {
  const { toast } = useToast();
  const [editingSite, setEditingSite] = useState<Site | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [archivingSite, setArchivingSite] = useState<Site | null>(null);
  const [filterTab, setFilterTab] = useState<FilterTab>("all");
  const [search, setSearch] = useState("");
  const [regionFilter, setRegionFilter] = useState("all");
  const [areaFilter, setAreaFilter] = useState("all");
  const [page, setPage] = useState(1);

  const { data: sites = [], isLoading, isError: sitesError, error: sitesErrorObj, refetch: refetchSites } = useQuery<Site[]>({
    queryKey: ["/api/enterprise/sites"],
    staleTime: 30_000,
  });

  const { data: areas = [] } = useQuery<Area[]>({
    queryKey: ["/api/enterprise/areas"],
    staleTime: 60_000,
  });

  const { data: myGrants } = useQuery<MyGrants>({
    queryKey: ["/api/enterprise/role-grants/my"],
    staleTime: 60_000,
  });

  const { data: complianceList = [] } = useQuery<ComplianceSiteData[]>({
    queryKey: ["/api/enterprise/compliance/sites"],
    staleTime: 60_000,
  });

  const complianceMap = useMemo(() => {
    const m = new Map<string, ComplianceSiteData>();
    for (const c of complianceList) m.set(c.siteId, c);
    return m;
  }, [complianceList]);

  const archiveMutation = useMutation({
    mutationFn: async (site: Site) => {
      const res = await apiRequest("PATCH", `/api/enterprise/sites/${site.id}`, { status: "archived" });
      if (!res.ok) throw new Error("Failed to archive site");
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Site archived" });
      queryClient.invalidateQueries({ queryKey: ["/api/enterprise/sites"] });
      setArchivingSite(null);
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  if (sitesError) {
    const is403 = (sitesErrorObj as any)?.status === 403;
    return (
      <div className="p-6 flex items-center justify-center min-h-64">
        <Card className="p-8 max-w-sm text-center space-y-3">
          <div className="w-12 h-12 rounded-xl bg-amber-50 dark:bg-amber-900/20 flex items-center justify-center mx-auto">
            <ShieldCheck size={24} className="text-amber-400" />
          </div>
          <h2 className="font-semibold">{is403 ? "Access restricted" : "Couldn't load sites"}</h2>
          <p className="text-sm text-muted-foreground">
            {is403
              ? "You don't have enterprise access for this customer. Ask an Enterprise Admin to grant you a role."
              : "The request failed — please try again or contact your administrator."}
          </p>
          {!is403 && (
            <Button variant="outline" size="sm" onClick={() => refetchSites()}>Try again</Button>
          )}
        </Card>
      </div>
    );
  }

  const activeSites   = sites.filter((s) => s.status !== "archived");
  const archivedSites = sites.filter((s) => s.status === "archived");

  // Unique regions for filter
  const regions = useMemo(
    () => [...new Set(activeSites.map(s => s.region).filter(Boolean) as string[])].sort(),
    [activeSites],
  );

  // Stat card values
  const compliantCount = useMemo(
    () => activeSites.filter(s => { const c = complianceMap.get(s.id); return c && c.score >= 80; }).length,
    [activeSites, complianceMap],
  );
  const warningCount = useMemo(
    () => activeSites.filter(s => { const c = complianceMap.get(s.id); return c && c.score >= 50 && c.score < 80; }).length,
    [activeSites, complianceMap],
  );
  const criticalCount = useMemo(
    () => activeSites.filter(s => { const c = complianceMap.get(s.id); return c && c.score < 50; }).length,
    [activeSites, complianceMap],
  );

  // Filtered + paginated sites
  const filtered = useMemo(() => {
    return activeSites.filter(site => {
      // Status tab
      if (filterTab !== "all") {
        const c = complianceMap.get(site.id);
        if (!c) return false;
        const s = scoreStatusLabel(c.score);
        if (s !== filterTab) return false;
      }
      // Search
      if (search.trim()) {
        const q = search.toLowerCase();
        if (!site.name.toLowerCase().includes(q) &&
            !(site.region ?? "").toLowerCase().includes(q) &&
            !(site.postcode ?? "").toLowerCase().includes(q) &&
            !(site.reference ?? "").toLowerCase().includes(q)) return false;
      }
      // Region filter
      if (regionFilter !== "all" && site.region !== regionFilter) return false;
      // Area filter
      if (areaFilter !== "all" && site.areaId !== areaFilter) return false;
      return true;
    });
  }, [activeSites, filterTab, search, regionFilter, areaFilter, complianceMap]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageSites  = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // Reset to page 1 when filters change
  const handleFilter = (tab: FilterTab) => { setFilterTab(tab); setPage(1); };
  const handleSearch = (v: string)       => { setSearch(v); setPage(1); };
  const handleRegion = (v: string)       => { setRegionFilter(v); setPage(1); };
  const handleArea   = (v: string)       => { setAreaFilter(v); setPage(1); };

  return (
    <TooltipProvider>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Building2 size={24} className="text-primary" />
              Sites
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Compliance snapshot across your estate. Click any site to drill in.
            </p>
          </div>
          <Button onClick={() => { setEditingSite(null); setShowForm(true); }} className="gap-2">
            <Plus size={16} />
            Add Site
          </Button>
        </div>

        {/* Stat cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard label="Total Sites"      value={activeSites.length}  color="#3b82f6" />
          <StatCard label="Fully Compliant"  value={compliantCount}
            sub={activeSites.length > 0 ? `${Math.round((compliantCount / activeSites.length) * 100)}% of estate` : undefined}
            color="#22c55e" />
          <StatCard label="With Warnings"    value={warningCount}  color="#f59e0b" />
          <StatCard label="Critical Status"  value={criticalCount} color="#ef4444" />
        </div>

        {/* Filter bar */}
        <div className="flex flex-wrap gap-3 items-center">
          {/* Status tabs */}
          <div className="flex rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden text-sm">
            {(["all", "compliant", "warning", "critical"] as FilterTab[]).map(tab => (
              <button
                key={tab}
                onClick={() => handleFilter(tab)}
                className={`px-3 py-1.5 capitalize font-medium transition-colors ${
                  filterTab === tab
                    ? "bg-primary text-primary-foreground"
                    : "hover:bg-muted"
                }`}
              >
                {tab}
              </button>
            ))}
          </div>

          {/* Search */}
          <div className="relative flex-1 min-w-40">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <Input
              value={search}
              onChange={(e) => handleSearch(e.target.value)}
              placeholder="Search name, region, postcode…"
              className="pl-8 h-9 text-sm"
            />
          </div>

          {/* Region filter */}
          {regions.length > 0 && (
            <Select value={regionFilter} onValueChange={handleRegion}>
              <SelectTrigger className="h-9 text-sm w-44">
                <SelectValue placeholder="All regions" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All regions</SelectItem>
                {regions.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
              </SelectContent>
            </Select>
          )}

          {/* Area filter */}
          {areas.length > 0 && (
            <Select value={areaFilter} onValueChange={handleArea}>
              <SelectTrigger className="h-9 text-sm w-44">
                <SelectValue placeholder="All areas" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All areas</SelectItem>
                {areas.map(a => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
        </div>

        {/* Sites grid */}
        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-80 rounded-xl bg-slate-100 dark:bg-slate-800 animate-pulse" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-12 text-center">
            <Building2 size={40} className="mx-auto text-muted-foreground mb-3" />
            <p className="font-medium">No sites match your filters</p>
            <p className="text-sm text-muted-foreground mt-1">Try adjusting the search or status filter.</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {pageSites.map((site) => (
                <SiteCard
                  key={site.id}
                  site={site}
                  areas={areas}
                  myGrants={myGrants}
                  compliance={complianceMap.get(site.id)}
                  onEdit={(s) => { setEditingSite(s); setShowForm(true); }}
                  onArchive={(s) => setArchivingSite(s)}
                />
              ))}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-500">
                  Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filtered.length)} of {filtered.length}
                </span>
                <div className="flex gap-1">
                  <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>
                    Previous
                  </Button>
                  <Button variant="outline" size="sm" disabled={page === totalPages} onClick={() => setPage(p => p + 1)}>
                    Next
                  </Button>
                </div>
              </div>
            )}
          </>
        )}

        {/* Archived sites */}
        {archivedSites.length > 0 && (
          <div className="space-y-3">
            <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-2">
              <ArchiveIcon size={14} />
              Archived ({archivedSites.length})
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 opacity-60">
              {archivedSites.map((site) => (
                <SiteCard
                  key={site.id}
                  site={site}
                  areas={areas}
                  myGrants={myGrants}
                  compliance={complianceMap.get(site.id)}
                  onEdit={() => {}}
                  onArchive={() => {}}
                />
              ))}
            </div>
          </div>
        )}

        {/* Site form dialog */}
        <SiteFormDialog
          key={editingSite?.id ?? 'new'}
          open={showForm}
          onOpenChange={(v) => { setShowForm(v); if (!v) setEditingSite(null); }}
          site={editingSite}
          areas={areas}
          onSaved={() => setEditingSite(null)}
        />

        {/* Archive confirmation */}
        <AlertDialog open={!!archivingSite} onOpenChange={(v) => !v && setArchivingSite(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Archive "{archivingSite?.name}"?</AlertDialogTitle>
              <AlertDialogDescription>
                Archived sites are hidden from active views and cannot be selected. Existing data is preserved.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className="bg-amber-600 hover:bg-amber-700"
                onClick={() => archivingSite && archiveMutation.mutate(archivingSite)}
              >
                Archive Site
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </TooltipProvider>
  );
}
