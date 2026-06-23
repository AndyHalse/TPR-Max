import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
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
import { Label } from "@/components/ui/label";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Users,
  Plus,
  Trash2,
  ShieldCheck,
  AlertTriangle,
  MapPin,
  Building2,
  Globe,
  ChevronDown,
  ChevronUp,
  UserPlus,
  UserCheck,
} from "lucide-react";
import GlassCard from "@/components/GlassCard";

// ── Types ─────────────────────────────────────────────────────────────────────

type EnterpriseRole = "enterprise_admin" | "area_manager" | "site_coordinator";

interface GrantUser {
  id: string;
  username: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
}

interface Grant {
  id: string;
  userId: string;
  role: EnterpriseRole;
  areaId: string | null;
  siteId: string | null;
  createdAt: string;
  user: GrantUser | null;
}

interface MyGrants {
  roles: string[];
  allowedSiteIds: string[] | "all";
}

interface Site {
  id: string;
  name: string;
  areaId: string | null;
  status: string;
}

interface Area {
  id: string;
  name: string;
}

interface EnterpriseUser {
  id: string;
  username: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  role: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const ROLE_CONFIG: Record<EnterpriseRole, { label: string; className: string; icon: typeof ShieldCheck }> = {
  enterprise_admin: {
    label: "Enterprise Admin",
    className: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400",
    icon: ShieldCheck,
  },
  area_manager: {
    label: "Area Manager",
    className: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
    icon: MapPin,
  },
  site_coordinator: {
    label: "Site Coordinator",
    className: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400",
    icon: Building2,
  },
};

function displayName(u: GrantUser | null): string {
  if (!u) return "Unknown user";
  const full = [u.firstName, u.lastName].filter(Boolean).join(" ");
  return full || u.username;
}

function userInitials(u: GrantUser | null): string {
  if (!u) return "?";
  if (u.firstName && u.lastName) return `${u.firstName[0]}${u.lastName[0]}`.toUpperCase();
  return (u.username || "?")[0].toUpperCase();
}

function grantScopeLabel(grant: Grant, areas: Area[], sites: Site[]): string {
  if (grant.role === "enterprise_admin") return "All sites";
  if (grant.role === "area_manager" && grant.areaId) {
    const area = areas.find((a) => a.id === grant.areaId);
    return area ? `Area: ${area.name}` : "Area: Unknown";
  }
  if (grant.role === "site_coordinator" && grant.siteId) {
    const site = sites.find((s) => s.id === grant.siteId);
    return site ? site.name : "Unknown site";
  }
  return "—";
}

function effectiveSiteIds(grant: Grant, sites: Site[]): Site[] {
  if (grant.role === "enterprise_admin") return sites.filter((s) => s.status !== "archived");
  if (grant.role === "area_manager" && grant.areaId) {
    return sites.filter((s) => s.areaId === grant.areaId && s.status !== "archived");
  }
  if (grant.role === "site_coordinator" && grant.siteId) {
    return sites.filter((s) => s.id === grant.siteId && s.status !== "archived");
  }
  return [];
}

// ── Shared role / scope pickers ───────────────────────────────────────────────

function RoleScopePickers({
  role,
  setRole,
  areaId,
  setAreaId,
  siteId,
  setSiteId,
  availableRoles,
  allowedSites,
  areas,
  isAdmin,
}: {
  role: EnterpriseRole | "";
  setRole: (r: EnterpriseRole) => void;
  areaId: string;
  setAreaId: (v: string) => void;
  siteId: string;
  setSiteId: (v: string) => void;
  availableRoles: EnterpriseRole[];
  allowedSites: Site[];
  areas: Area[];
  isAdmin: boolean;
}) {
  return (
    <>
      <div className="space-y-1.5">
        <Label>Role</Label>
        <Select
          value={role}
          onValueChange={(v) => {
            setRole(v as EnterpriseRole);
            setAreaId("");
            setSiteId("");
          }}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select a role…" />
          </SelectTrigger>
          <SelectContent>
            {availableRoles.map((r) => (
              <SelectItem key={r} value={r}>
                {ROLE_CONFIG[r].label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {role === "enterprise_admin" && (
          <p className="text-xs text-muted-foreground">
            Enterprise Admins can access and manage all sites.
          </p>
        )}
      </div>

      {role === "area_manager" && (
        <div className="space-y-1.5">
          <Label>Area</Label>
          <Select value={areaId} onValueChange={setAreaId}>
            <SelectTrigger>
              <SelectValue placeholder="Select an area…" />
            </SelectTrigger>
            <SelectContent>
              {areas.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {role === "site_coordinator" && (
        <div className="space-y-1.5">
          <Label>Site</Label>
          <Select value={siteId} onValueChange={setSiteId}>
            <SelectTrigger>
              <SelectValue placeholder="Select a site…" />
            </SelectTrigger>
            <SelectContent>
              {allowedSites.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {!isAdmin && (
            <p className="text-xs text-muted-foreground">
              You can only assign coordinators to sites within your managed area.
            </p>
          )}
        </div>
      )}
    </>
  );
}

// ── EffectiveSitesList ────────────────────────────────────────────────────────

function EffectiveSitesList({ grant, sites }: { grant: Grant; sites: Site[] }) {
  const [open, setOpen] = useState(false);
  const effective = effectiveSiteIds(grant, sites);

  if (grant.role === "enterprise_admin") {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
        <Globe size={11} />
        All {sites.filter((s) => s.status !== "archived").length} sites
      </span>
    );
  }

  if (effective.length === 0) {
    return <span className="text-xs text-muted-foreground italic">No sites resolved</span>;
  }

  if (effective.length <= 2) {
    return (
      <span className="text-xs text-muted-foreground">
        {effective.map((s) => s.name).join(", ")}
      </span>
    );
  }

  return (
    <button
      onClick={() => setOpen((v) => !v)}
      className="inline-flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:underline"
    >
      {effective.length} sites
      {open ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
    </button>
  );
}

// ── GrantRow ──────────────────────────────────────────────────────────────────

function GrantRow({
  grant,
  areas,
  sites,
  canRevoke,
  isLastAdmin,
  onRevoke,
}: {
  grant: Grant;
  areas: Area[];
  sites: Site[];
  canRevoke: boolean;
  isLastAdmin: boolean;
  onRevoke: (grant: Grant) => void;
}) {
  const cfg = ROLE_CONFIG[grant.role];
  const RoleIcon = cfg.icon;

  return (
    <div className="flex items-center gap-3 px-4 py-3 border-b border-border/50 last:border-0 hover:bg-muted/30 transition-colors">
      <div className="w-9 h-9 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center flex-shrink-0 text-sm font-semibold text-slate-600 dark:text-slate-300">
        {userInitials(grant.user)}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium truncate">{displayName(grant.user)}</p>
        {grant.user?.email && (
          <p className="text-xs text-muted-foreground truncate">{grant.user.email}</p>
        )}
      </div>
      <span className={`hidden sm:inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${cfg.className}`}>
        <RoleIcon size={10} />
        {cfg.label}
      </span>
      <div className="hidden md:block text-xs text-muted-foreground flex-shrink-0 w-36 truncate">
        {grantScopeLabel(grant, areas, sites)}
      </div>
      <div className="hidden lg:block flex-shrink-0 w-32">
        <EffectiveSitesList grant={grant} sites={sites} />
      </div>
      {canRevoke && (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 w-7 p-0 text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/30 flex-shrink-0"
                disabled={isLastAdmin}
                onClick={() => onRevoke(grant)}
              >
                <Trash2 size={14} />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {isLastAdmin ? "Cannot remove the last Enterprise Admin" : "Revoke this grant"}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
      {!canRevoke && <div className="w-7 flex-shrink-0" />}
    </div>
  );
}

// ── Add User Dialog ───────────────────────────────────────────────────────────
// Two modes:
//   "new"      — create a fresh login AND grant an enterprise role in one step
//   "existing" — pick an existing user and grant them a role (previous behaviour)

function AddUserDialog({
  open,
  onOpenChange,
  myGrants,
  grants,
  users,
  areas,
  sites,
  preselectedSiteId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  myGrants: MyGrants;
  grants: Grant[];
  users: EnterpriseUser[];
  areas: Area[];
  sites: Site[];
  preselectedSiteId?: string;
}) {
  const { toast } = useToast();
  const isAdmin = myGrants.roles.includes("enterprise_admin");

  const availableRoles: EnterpriseRole[] = isAdmin
    ? ["enterprise_admin", "area_manager", "site_coordinator"]
    : ["site_coordinator"];

  const allowedSites = useMemo(() => {
    if (myGrants.allowedSiteIds === "all") return sites.filter((s) => s.status !== "archived");
    return sites.filter(
      (s) => s.status !== "archived" && (myGrants.allowedSiteIds as string[]).includes(s.id),
    );
  }, [myGrants, sites]);

  const [mode, setMode] = useState<"new" | "existing">("new");

  // ── New user fields
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [newRole, setNewRole] = useState<EnterpriseRole | "">(preselectedSiteId ? "site_coordinator" : "");
  const [newAreaId, setNewAreaId] = useState("");
  const [newSiteId, setNewSiteId] = useState(preselectedSiteId ?? "");
  const [conflictUserId, setConflictUserId] = useState<string | null>(null);

  // ── Existing user fields
  const [userId, setUserId] = useState("");
  const [existRole, setExistRole] = useState<EnterpriseRole | "">(preselectedSiteId ? "site_coordinator" : "");
  const [existAreaId, setExistAreaId] = useState("");
  const [existSiteId, setExistSiteId] = useState(preselectedSiteId ?? "");

  function reset() {
    setMode("new");
    setUsername(""); setPassword(""); setEmail(""); setFirstName(""); setLastName("");
    setNewRole(preselectedSiteId ? "site_coordinator" : "");
    setNewAreaId(""); setNewSiteId(preselectedSiteId ?? "");
    setConflictUserId(null);
    setUserId(""); setExistRole(preselectedSiteId ? "site_coordinator" : "");
    setExistAreaId(""); setExistSiteId(preselectedSiteId ?? "");
  }

  // ── New user: create + grant
  const createMutation = useMutation({
    mutationFn: async () => {
      const body: Record<string, any> = {
        username: username.trim(),
        password,
        email: email.trim() || null,
        firstName: firstName.trim() || null,
        lastName: lastName.trim() || null,
        role: newRole,
      };
      if (newRole === "area_manager") body.areaId = newAreaId;
      if (newRole === "site_coordinator") body.siteId = newSiteId;
      const res = await apiRequest("POST", "/api/enterprise/users", body);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        if (res.status === 409 && err.existingUserId) {
          setConflictUserId(err.existingUserId);
        }
        throw new Error(err.error || "Failed to create user");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/enterprise/role-grants"] });
      queryClient.invalidateQueries({ queryKey: ["/api/enterprise/users"] });
      toast({ title: "User created", description: `${username} has been created and their login code will be sent when they first sign in.` });
      onOpenChange(false);
      reset();
    },
    onError: (err: Error) => {
      if (!conflictUserId) {
        toast({ title: "Failed to create user", description: err.message, variant: "destructive" });
      }
    },
  });

  // ── Existing user: grant only
  const alreadyHasGrant = useMemo(() => {
    if (!userId || !existRole) return false;
    return grants.some(
      (g) =>
        g.userId === userId &&
        g.role === existRole &&
        (existRole === "enterprise_admin"
          ? true
          : existRole === "area_manager"
          ? g.areaId === existAreaId
          : g.siteId === existSiteId),
    );
  }, [grants, userId, existRole, existAreaId, existSiteId]);

  const grantMutation = useMutation({
    mutationFn: async () => {
      const body: Record<string, string | null> = { userId, role: existRole };
      if (existRole === "area_manager") body.areaId = existAreaId;
      if (existRole === "site_coordinator") body.siteId = existSiteId;
      const res = await apiRequest("POST", "/api/enterprise/role-grants", body);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to create grant");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/enterprise/role-grants"] });
      toast({ title: "Grant added", description: "The role grant has been created." });
      onOpenChange(false);
      reset();
    },
    onError: (err: Error) => {
      toast({ title: "Failed to add grant", description: err.message, variant: "destructive" });
    },
  });

  // If conflict → offer to grant to existing user instead
  function switchToExistingWithConflict() {
    if (conflictUserId) {
      setUserId(conflictUserId);
      setExistRole(newRole);
      setExistAreaId(newAreaId);
      setExistSiteId(newSiteId);
      setMode("existing");
      setConflictUserId(null);
    }
  }

  const canSubmitNew =
    !!username.trim() && password.length >= 8 && !!newRole &&
    (newRole === "enterprise_admin" ||
      (newRole === "area_manager" && !!newAreaId) ||
      (newRole === "site_coordinator" && !!newSiteId));

  const canSubmitExisting =
    !!userId && !!existRole && !alreadyHasGrant &&
    (existRole === "enterprise_admin" ||
      (existRole === "area_manager" && !!existAreaId) ||
      (existRole === "site_coordinator" && !!existSiteId));

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) reset(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus size={18} className="text-blue-600" />
            Add User
          </DialogTitle>
        </DialogHeader>

        {/* Mode tabs */}
        <div className="flex border border-border rounded-lg overflow-hidden text-sm">
          <button
            className={`flex-1 py-2 px-3 flex items-center justify-center gap-1.5 transition-colors ${mode === "new" ? "bg-primary text-primary-foreground font-medium" : "hover:bg-muted"}`}
            onClick={() => { setMode("new"); setConflictUserId(null); }}
          >
            <UserPlus size={14} />
            New login
          </button>
          <button
            className={`flex-1 py-2 px-3 flex items-center justify-center gap-1.5 transition-colors ${mode === "existing" ? "bg-primary text-primary-foreground font-medium" : "hover:bg-muted"}`}
            onClick={() => { setMode("existing"); setConflictUserId(null); }}
          >
            <UserCheck size={14} />
            Existing user
          </button>
        </div>

        {/* ── New user form ── */}
        {mode === "new" && (
          <div className="space-y-4 py-1">
            {conflictUserId && (
              <div className="flex flex-col gap-2 rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 p-3">
                <div className="flex items-start gap-2">
                  <AlertTriangle size={14} className="text-amber-600 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-700 dark:text-amber-400">
                    That username is already in use. You can grant a role to the existing account instead.
                  </p>
                </div>
                <Button size="sm" variant="outline" className="self-start h-7 text-xs" onClick={switchToExistingWithConflict}>
                  Grant role to existing account
                </Button>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>First name</Label>
                <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="Jane" />
              </div>
              <div className="space-y-1.5">
                <Label>Last name</Label>
                <Input value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Smith" />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="jane@example.com" />
              <p className="text-xs text-muted-foreground">Used to send the 6-digit login code.</p>
            </div>

            <div className="space-y-1.5">
              <Label>Username <span className="text-red-500">*</span></Label>
              <Input value={username} onChange={(e) => { setUsername(e.target.value); setConflictUserId(null); }} placeholder="jsmith" />
            </div>

            <div className="space-y-1.5">
              <Label>Password <span className="text-red-500">*</span></Label>
              <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Min. 8 characters" />
            </div>

            <RoleScopePickers
              role={newRole}
              setRole={setNewRole}
              areaId={newAreaId}
              setAreaId={setNewAreaId}
              siteId={newSiteId}
              setSiteId={setNewSiteId}
              availableRoles={availableRoles}
              allowedSites={allowedSites}
              areas={areas}
              isAdmin={isAdmin}
            />
          </div>
        )}

        {/* ── Existing user form ── */}
        {mode === "existing" && (
          <div className="space-y-4 py-1">
            <div className="space-y-1.5">
              <Label>User</Label>
              <Select value={userId} onValueChange={setUserId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a user…" />
                </SelectTrigger>
                <SelectContent>
                  {users.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {[u.firstName, u.lastName].filter(Boolean).join(" ") || u.username}
                      {u.email ? ` — ${u.email}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <RoleScopePickers
              role={existRole}
              setRole={setExistRole}
              areaId={existAreaId}
              setAreaId={setExistAreaId}
              siteId={existSiteId}
              setSiteId={setExistSiteId}
              availableRoles={availableRoles}
              allowedSites={allowedSites}
              areas={areas}
              isAdmin={isAdmin}
            />

            {alreadyHasGrant && (
              <div className="flex items-center gap-2 rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 p-3">
                <AlertTriangle size={14} className="text-amber-600 flex-shrink-0" />
                <p className="text-xs text-amber-700 dark:text-amber-400">
                  This user already has this role grant.
                </p>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => { onOpenChange(false); reset(); }}>
            Cancel
          </Button>
          {mode === "new" ? (
            <Button
              onClick={() => createMutation.mutate()}
              disabled={!canSubmitNew || createMutation.isPending}
            >
              {createMutation.isPending ? "Creating…" : "Create & Assign"}
            </Button>
          ) : (
            <Button
              onClick={() => grantMutation.mutate()}
              disabled={!canSubmitExisting || grantMutation.isPending}
            >
              {grantMutation.isPending ? "Adding…" : "Add Grant"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function EnterpriseAccess() {
  const { toast } = useToast();
  const [addOpen, setAddOpen] = useState(false);
  const [revokeTarget, setRevokeTarget] = useState<Grant | null>(null);

  const { data: myGrants, isLoading: myGrantsLoading, isError: myGrantsError } = useQuery<MyGrants>({
    queryKey: ["/api/enterprise/role-grants/my"],
    staleTime: 60 * 1000,
  });

  const { data: grants = [], isLoading: grantsLoading } = useQuery<Grant[]>({
    queryKey: ["/api/enterprise/role-grants"],
    staleTime: 30 * 1000,
    enabled: !!myGrants && (myGrants.roles.includes("enterprise_admin") || myGrants.roles.includes("area_manager")),
  });

  const { data: sites = [] } = useQuery<Site[]>({
    queryKey: ["/api/enterprise/sites"],
    staleTime: 60 * 1000,
  });

  const { data: areas = [] } = useQuery<Area[]>({
    queryKey: ["/api/enterprise/areas"],
    staleTime: 60 * 1000,
  });

  const { data: users = [] } = useQuery<EnterpriseUser[]>({
    queryKey: ["/api/enterprise/users"],
    staleTime: 60 * 1000,
    enabled: !!myGrants && (myGrants.roles.includes("enterprise_admin") || myGrants.roles.includes("area_manager")),
  });

  const revokeMutation = useMutation({
    mutationFn: async (grant: Grant) => {
      const res = await apiRequest("DELETE", `/api/enterprise/role-grants/${grant.id}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to revoke grant");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/enterprise/role-grants"] });
      toast({ title: "Grant revoked", description: "The role grant has been removed." });
      setRevokeTarget(null);
    },
    onError: (err: Error) => {
      toast({ title: "Failed to revoke grant", description: err.message, variant: "destructive" });
      setRevokeTarget(null);
    },
  });

  const isAdmin = myGrants?.roles.includes("enterprise_admin") ?? false;
  const isAreaManager = myGrants?.roles.includes("area_manager") ?? false;
  const canManage = isAdmin || isAreaManager;

  const adminGrantCount = grants.filter((g) => g.role === "enterprise_admin").length;

  function canRevokeGrant(grant: Grant): boolean {
    if (!canManage) return false;
    if (isAdmin) return true;
    if (!isAreaManager) return false;
    if (grant.role !== "site_coordinator") return false;
    if (myGrants?.allowedSiteIds === "all") return true;
    return !!(grant.siteId && (myGrants?.allowedSiteIds as string[]).includes(grant.siteId));
  }

  const loading = myGrantsLoading || grantsLoading;

  if (loading) {
    return (
      <div className="p-6 space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-14 rounded-xl bg-muted animate-pulse" />
        ))}
      </div>
    );
  }

  if (myGrantsError) {
    return (
      <div className="p-6 flex items-center justify-center min-h-64">
        <div className="p-8 max-w-sm text-center space-y-3 border rounded-xl bg-card">
          <div className="w-12 h-12 rounded-xl bg-amber-50 dark:bg-amber-900/20 flex items-center justify-center mx-auto">
            <ShieldCheck size={24} className="text-amber-400" />
          </div>
          <h2 className="font-semibold">Couldn't load access settings</h2>
          <p className="text-sm text-muted-foreground">
            You may not have enterprise access for this customer, or the request failed. Try refreshing or contact your administrator.
          </p>
        </div>
      </div>
    );
  }

  if (!canManage) {
    return (
      <div className="p-6 flex items-center justify-center min-h-64">
        <GlassCard className="p-8 max-w-sm text-center space-y-3">
          <div className="w-12 h-12 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center mx-auto">
            <ShieldCheck size={24} className="text-slate-400" />
          </div>
          <h2 className="font-semibold">Access restricted</h2>
          <p className="text-sm text-muted-foreground">
            You need an Enterprise Admin or Area Manager role to manage people &amp; access.
          </p>
        </GlassCard>
      </div>
    );
  }

  const adminGrants = grants.filter((g) => g.role === "enterprise_admin");
  const areaManagerGrants = grants.filter((g) => g.role === "area_manager");
  const coordinatorGrants = grants.filter((g) => g.role === "site_coordinator");

  return (
    <TooltipProvider>
      <div className="p-6 space-y-6 max-w-5xl">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Users size={22} className="text-blue-600" />
              People &amp; Access
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Manage site access across your enterprise. Create logins and assign roles in one step.
              {!isAdmin && (
                <span className="ml-1">
                  You can manage Site Coordinators for your assigned area.
                </span>
              )}
            </p>
          </div>
          {canManage && (
            <Button
              onClick={() => setAddOpen(true)}
              className="flex items-center gap-2 flex-shrink-0"
            >
              <UserPlus size={15} />
              Add User
            </Button>
          )}
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <GlassCard className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center flex-shrink-0">
              <ShieldCheck size={18} className="text-purple-600 dark:text-purple-400" />
            </div>
            <div>
              <p className="text-2xl font-bold">{adminGrants.length}</p>
              <p className="text-xs text-muted-foreground">Enterprise Admin{adminGrants.length !== 1 ? "s" : ""}</p>
            </div>
          </GlassCard>
          <GlassCard className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center flex-shrink-0">
              <MapPin size={18} className="text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <p className="text-2xl font-bold">{areaManagerGrants.length}</p>
              <p className="text-xs text-muted-foreground">Area Manager{areaManagerGrants.length !== 1 ? "s" : ""}</p>
            </div>
          </GlassCard>
          <GlassCard className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center flex-shrink-0">
              <Building2 size={18} className="text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <p className="text-2xl font-bold">{coordinatorGrants.length}</p>
              <p className="text-xs text-muted-foreground">Site Coordinator{coordinatorGrants.length !== 1 ? "s" : ""}</p>
            </div>
          </GlassCard>
        </div>

        {/* Grant list */}
        {grants.length === 0 ? (
          <GlassCard className="p-10 text-center">
            <Users size={36} className="mx-auto text-muted-foreground mb-3" />
            <p className="font-medium">No role grants yet</p>
            <p className="text-sm text-muted-foreground mt-1">
              Add your first user to get started.
            </p>
            <Button className="mt-4 gap-2" onClick={() => setAddOpen(true)}>
              <UserPlus size={15} />
              Add User
            </Button>
          </GlassCard>
        ) : (
          <div className="space-y-6">
            {adminGrants.length > 0 && (
              <GlassCard className="overflow-hidden p-0">
                <div className="px-4 py-2.5 bg-purple-50 dark:bg-purple-950/20 border-b border-border/50 flex items-center gap-2">
                  <ShieldCheck size={13} className="text-purple-600 dark:text-purple-400" />
                  <span className="text-xs font-semibold uppercase tracking-wide text-purple-700 dark:text-purple-400">
                    Enterprise Admins
                  </span>
                </div>
                {adminGrants.map((g) => (
                  <GrantRow
                    key={g.id}
                    grant={g}
                    areas={areas}
                    sites={sites}
                    canRevoke={canRevokeGrant(g)}
                    isLastAdmin={adminGrantCount <= 1}
                    onRevoke={setRevokeTarget}
                  />
                ))}
              </GlassCard>
            )}

            {areaManagerGrants.length > 0 && (
              <GlassCard className="overflow-hidden p-0">
                <div className="px-4 py-2.5 bg-blue-50 dark:bg-blue-950/20 border-b border-border/50 flex items-center gap-2">
                  <MapPin size={13} className="text-blue-600 dark:text-blue-400" />
                  <span className="text-xs font-semibold uppercase tracking-wide text-blue-700 dark:text-blue-400">
                    Area Managers
                  </span>
                </div>
                {areaManagerGrants.map((g) => (
                  <GrantRow
                    key={g.id}
                    grant={g}
                    areas={areas}
                    sites={sites}
                    canRevoke={canRevokeGrant(g)}
                    isLastAdmin={false}
                    onRevoke={setRevokeTarget}
                  />
                ))}
              </GlassCard>
            )}

            {coordinatorGrants.length > 0 && (
              <GlassCard className="overflow-hidden p-0">
                <div className="px-4 py-2.5 bg-emerald-50 dark:bg-emerald-950/20 border-b border-border/50 flex items-center gap-2">
                  <Building2 size={13} className="text-emerald-600 dark:text-emerald-400" />
                  <span className="text-xs font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
                    Site Coordinators
                  </span>
                </div>
                {coordinatorGrants.map((g) => (
                  <GrantRow
                    key={g.id}
                    grant={g}
                    areas={areas}
                    sites={sites}
                    canRevoke={canRevokeGrant(g)}
                    isLastAdmin={false}
                    onRevoke={setRevokeTarget}
                  />
                ))}
              </GlassCard>
            )}
          </div>
        )}

        {/* Add User Dialog */}
        {myGrants && (
          <AddUserDialog
            open={addOpen}
            onOpenChange={setAddOpen}
            myGrants={myGrants}
            grants={grants}
            users={users}
            areas={areas}
            sites={sites}
          />
        )}

        {/* Revoke confirmation */}
        <AlertDialog open={!!revokeTarget} onOpenChange={(v) => !v && setRevokeTarget(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Revoke grant?</AlertDialogTitle>
              <AlertDialogDescription>
                {revokeTarget && (
                  <>
                    Remove the <strong>{ROLE_CONFIG[revokeTarget.role]?.label}</strong> grant
                    {" "}from <strong>{displayName(revokeTarget.user)}</strong>?
                    The user's login will remain — only this role grant is removed.
                  </>
                )}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className="bg-red-600 hover:bg-red-700"
                onClick={() => revokeTarget && revokeMutation.mutate(revokeTarget)}
              >
                Revoke
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </TooltipProvider>
  );
}
