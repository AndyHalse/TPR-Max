import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
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

// ── Components ────────────────────────────────────────────────────────────────

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
      {/* Avatar */}
      <div className="w-9 h-9 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center flex-shrink-0 text-sm font-semibold text-slate-600 dark:text-slate-300">
        {userInitials(grant.user)}
      </div>

      {/* User info */}
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium truncate">{displayName(grant.user)}</p>
        {grant.user?.email && (
          <p className="text-xs text-muted-foreground truncate">{grant.user.email}</p>
        )}
      </div>

      {/* Role badge */}
      <span className={`hidden sm:inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${cfg.className}`}>
        <RoleIcon size={10} />
        {cfg.label}
      </span>

      {/* Scope */}
      <div className="hidden md:block text-xs text-muted-foreground flex-shrink-0 w-36 truncate">
        {grantScopeLabel(grant, areas, sites)}
      </div>

      {/* Effective access */}
      <div className="hidden lg:block flex-shrink-0 w-32">
        <EffectiveSitesList grant={grant} sites={sites} />
      </div>

      {/* Revoke */}
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
              {isLastAdmin
                ? "Cannot remove the last Enterprise Admin"
                : "Revoke this grant"}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
      {!canRevoke && <div className="w-7 flex-shrink-0" />}
    </div>
  );
}

// ── Add Grant Dialog ──────────────────────────────────────────────────────────

function AddGrantDialog({
  open,
  onOpenChange,
  myGrants,
  grants,
  users,
  areas,
  sites,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  myGrants: MyGrants;
  grants: Grant[];
  users: EnterpriseUser[];
  areas: Area[];
  sites: Site[];
}) {
  const { toast } = useToast();
  const [userId, setUserId] = useState("");
  const [role, setRole] = useState<EnterpriseRole | "">("");
  const [areaId, setAreaId] = useState("");
  const [siteId, setSiteId] = useState("");

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

  const sitesForArea = useMemo(() => {
    if (!areaId) return allowedSites;
    return allowedSites.filter((s) => s.areaId === areaId);
  }, [areaId, allowedSites]);

  const existingGrantsForUser = useMemo(
    () => grants.filter((g) => g.userId === userId),
    [grants, userId],
  );

  const alreadyHasGrant = useMemo(() => {
    if (!userId || !role) return false;
    return existingGrantsForUser.some(
      (g) =>
        g.role === role &&
        (role === "enterprise_admin"
          ? true
          : role === "area_manager"
          ? g.areaId === areaId
          : g.siteId === siteId),
    );
  }, [existingGrantsForUser, userId, role, areaId, siteId]);

  const mutation = useMutation({
    mutationFn: async () => {
      const body: Record<string, string | null> = { userId, role };
      if (role === "area_manager") body.areaId = areaId;
      if (role === "site_coordinator") body.siteId = siteId;
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
      setUserId("");
      setRole("");
      setAreaId("");
      setSiteId("");
    },
    onError: (err: Error) => {
      toast({ title: "Failed to add grant", description: err.message, variant: "destructive" });
    },
  });

  const canSubmit =
    !!userId &&
    !!role &&
    !alreadyHasGrant &&
    (role === "enterprise_admin" || (role === "area_manager" && !!areaId) || (role === "site_coordinator" && !!siteId));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck size={18} className="text-blue-600" />
            Add Role Grant
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* User picker */}
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

          {/* Role picker */}
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

          {/* Scope — area_manager */}
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

          {/* Scope — site_coordinator */}
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

          {alreadyHasGrant && (
            <div className="flex items-center gap-2 rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 p-3">
              <AlertTriangle size={14} className="text-amber-600 flex-shrink-0" />
              <p className="text-xs text-amber-700 dark:text-amber-400">
                This user already has this role grant.
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={!canSubmit || mutation.isPending}
          >
            {mutation.isPending ? "Adding…" : "Add Grant"}
          </Button>
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

  const { data: myGrants, isLoading: myGrantsLoading } = useQuery<MyGrants>({
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
    // area_manager: only site_coordinator grants within their allowed sites
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

  // Group grants by user for summary display
  const grantsByUser = useMemo(() => {
    const map = new Map<string, Grant[]>();
    for (const g of grants) {
      const arr = map.get(g.userId) ?? [];
      arr.push(g);
      map.set(g.userId, arr);
    }
    return map;
  }, [grants]);

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
              Manage site role grants across your enterprise.
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
              <Plus size={15} />
              Add Grant
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

        {/* Grants table */}
        <GlassCard className="overflow-hidden">
          <div className="px-4 py-3 border-b border-border/50 flex items-center justify-between">
            <h2 className="text-sm font-semibold">Current role grants</h2>
            <span className="text-xs text-muted-foreground">{grants.length} grant{grants.length !== 1 ? "s" : ""}</span>
          </div>

          {grants.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground text-sm">
              No role grants found.{canManage && " Use 'Add Grant' to create one."}
            </div>
          ) : (
            <div>
              {/* Table header (desktop) */}
              <div className="hidden md:flex items-center px-4 py-2 bg-muted/30 text-[11px] font-medium text-muted-foreground uppercase tracking-wide gap-3">
                <div className="w-9 flex-shrink-0" />
                <div className="flex-1">User</div>
                <div className="w-36 flex-shrink-0">Role</div>
                <div className="hidden md:block w-36 flex-shrink-0">Scope</div>
                <div className="hidden lg:block w-32 flex-shrink-0">Effective access</div>
                <div className="w-7 flex-shrink-0" />
              </div>

              {/* Grouped: Enterprise Admins first, then Area Managers, then Coordinators */}
              {[...adminGrants, ...areaManagerGrants, ...coordinatorGrants].map((grant) => (
                <GrantRow
                  key={grant.id}
                  grant={grant}
                  areas={areas}
                  sites={sites}
                  canRevoke={canRevokeGrant(grant)}
                  isLastAdmin={grant.role === "enterprise_admin" && adminGrantCount <= 1}
                  onRevoke={setRevokeTarget}
                />
              ))}
            </div>
          )}
        </GlassCard>

        {/* User effective-access summary (admin only) */}
        {isAdmin && grantsByUser.size > 0 && (
          <GlassCard className="overflow-hidden">
            <div className="px-4 py-3 border-b border-border/50">
              <h2 className="text-sm font-semibold">Effective access per user</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                The resolved site allowlist each user can reach (union of all their grants).
              </p>
            </div>
            <div className="divide-y divide-border/50">
              {Array.from(grantsByUser.entries()).map(([uid, userGrants]) => {
                const u = userGrants[0]?.user;
                const effectiveSites = new Map<string, Site>();
                let isAllSites = false;
                for (const g of userGrants) {
                  if (g.role === "enterprise_admin") { isAllSites = true; break; }
                  for (const s of effectiveSiteIds(g, sites)) {
                    effectiveSites.set(s.id, s);
                  }
                }
                const siteList = Array.from(effectiveSites.values());
                return (
                  <div key={uid} className="px-4 py-3 flex items-start gap-3">
                    <div className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center flex-shrink-0 text-xs font-semibold text-slate-600 dark:text-slate-300">
                      {userInitials(u)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{displayName(u)}</p>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {userGrants.map((g) => {
                          const cfg = ROLE_CONFIG[g.role];
                          return (
                            <span
                              key={g.id}
                              className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${cfg.className}`}
                            >
                              {cfg.label}
                              {g.role === "area_manager" && g.areaId && ` — ${areas.find((a) => a.id === g.areaId)?.name ?? ""}`}
                              {g.role === "site_coordinator" && g.siteId && ` — ${sites.find((s) => s.id === g.siteId)?.name ?? ""}`}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                    <div className="text-xs text-muted-foreground flex-shrink-0 max-w-xs text-right">
                      {isAllSites ? (
                        <span className="inline-flex items-center gap-1">
                          <Globe size={11} />
                          All sites
                        </span>
                      ) : siteList.length === 0 ? (
                        <span className="italic">No sites</span>
                      ) : (
                        <span>{siteList.map((s) => s.name).join(", ")}</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </GlassCard>
        )}
      </div>

      {/* Add grant dialog */}
      {myGrants && (
        <AddGrantDialog
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
            <AlertDialogTitle>Revoke role grant?</AlertDialogTitle>
            <AlertDialogDescription>
              {revokeTarget && (
                <>
                  This will remove the <strong>{ROLE_CONFIG[revokeTarget.role]?.label}</strong> grant
                  for <strong>{displayName(revokeTarget.user)}</strong>.
                  {revokeTarget.role === "enterprise_admin" && adminGrantCount <= 1 && (
                    <span className="block mt-2 text-red-600 font-medium">
                      ⚠ This is the last Enterprise Admin grant — it cannot be removed.
                    </span>
                  )}
                  <span className="block mt-2">
                    Their effective site access will update immediately.
                  </span>
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700 text-white"
              onClick={() => revokeTarget && revokeMutation.mutate(revokeTarget)}
              disabled={
                revokeMutation.isPending ||
                (revokeTarget?.role === "enterprise_admin" && adminGrantCount <= 1)
              }
            >
              {revokeMutation.isPending ? "Revoking…" : "Revoke grant"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </TooltipProvider>
  );
}
