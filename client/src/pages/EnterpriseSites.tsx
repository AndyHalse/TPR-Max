import { useState, useMemo } from "react";
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
  ShieldCheck,
  AlertTriangle,
  Loader2,
} from "lucide-react";
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

// ── Helpers ───────────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { label: string; icon: typeof CheckCircle2; className: string }> = {
  active: { label: "Active", icon: CheckCircle2, className: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400" },
  onboarding: { label: "Onboarding", icon: Clock, className: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400" },
  archived: { label: "Archived", icon: ArchiveIcon, className: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400" },
};

const ROLE_BADGE: Record<string, { label: string; className: string }> = {
  enterprise_admin: { label: "Enterprise Admin", className: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400" },
  area_manager: { label: "Area Manager", className: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400" },
  site_coordinator: { label: "Site Coordinator", className: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400" },
};

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
  return false;
}

// ── Add Site User Dialog ──────────────────────────────────────────────────────
// A focused "add user" dialog pre-scoped to site_coordinator for a specific site.

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

  // New user fields
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [conflictUserId, setConflictUserId] = useState<string | null>(null);

  // Existing user field
  const [userId, setUserId] = useState("");

  function reset() {
    setMode("new");
    setUsername(""); setPassword(""); setEmail(""); setFirstName(""); setLastName("");
    setConflictUserId(null);
    setUserId("");
  }

  // Create new user + grant
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
        if (res.status === 409 && err.existingUserId) {
          setConflictUserId(err.existingUserId);
        }
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
      if (!conflictUserId) {
        toast({ title: "Failed to create user", description: err.message, variant: "destructive" });
      }
    },
  });

  // Grant existing user
  const alreadyCoordinator = useMemo(
    () => existingGrants.some((g) => g.userId === userId && g.role === "site_coordinator"),
    [existingGrants, userId],
  );

  const grantMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/enterprise/role-grants", {
        userId,
        role: "site_coordinator",
        siteId,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to add grant");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/enterprise/sites/${siteId}/users`] });
      queryClient.invalidateQueries({ queryKey: ["/api/enterprise/role-grants"] });
      toast({ title: "Coordinator added", description: "The user can now access this site." });
      onOpenChange(false);
      reset();
    },
    onError: (err: Error) => {
      toast({ title: "Failed to add grant", description: err.message, variant: "destructive" });
    },
  });

  function switchToExistingWithConflict() {
    if (conflictUserId) {
      setUserId(conflictUserId);
      setMode("existing");
      setConflictUserId(null);
    }
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

        {/* Mode tabs */}
        <div className="flex border border-border rounded-lg overflow-hidden text-sm">
          <button
            className={`flex-1 py-2 px-3 flex items-center justify-center gap-1.5 transition-colors ${mode === "new" ? "bg-primary text-primary-foreground font-medium" : "hover:bg-muted"}`}
            onClick={() => { setMode("new"); setConflictUserId(null); }}
          >
            <UserPlus size={13} />
            New login
          </button>
          <button
            className={`flex-1 py-2 px-3 flex items-center justify-center gap-1.5 transition-colors ${mode === "existing" ? "bg-primary text-primary-foreground font-medium" : "hover:bg-muted"}`}
            onClick={() => { setMode("existing"); setConflictUserId(null); }}
          >
            <UserCheck size={13} />
            Existing user
          </button>
        </div>

        {/* New user form */}
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
              <p className="text-xs text-muted-foreground">Used to receive the 6-digit login code.</p>
            </div>
            <div className="space-y-1.5">
              <Label>Username <span className="text-red-500">*</span></Label>
              <Input value={username} onChange={(e) => { setUsername(e.target.value); setConflictUserId(null); }} placeholder="jsmith" />
            </div>
            <div className="space-y-1.5">
              <Label>Password <span className="text-red-500">*</span></Label>
              <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Min. 8 characters" />
            </div>
            <div className="rounded-md bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800 px-3 py-2 text-xs text-emerald-700 dark:text-emerald-400">
              Role will be set to <strong>Site Coordinator</strong> for <strong>{siteName}</strong>.
            </div>
          </div>
        )}

        {/* Existing user form */}
        {mode === "existing" && (
          <div className="space-y-4 py-1">
            <div className="space-y-1.5">
              <Label>User</Label>
              <Select value={userId} onValueChange={setUserId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a user…" />
                </SelectTrigger>
                <SelectContent>
                  {allUsers.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {[u.firstName, u.lastName].filter(Boolean).join(" ") || u.username}
                      {u.email ? ` — ${u.email}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {alreadyCoordinator && (
              <div className="flex items-center gap-2 rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 p-3">
                <AlertTriangle size={13} className="text-amber-600 flex-shrink-0" />
                <p className="text-xs text-amber-700 dark:text-amber-400">
                  This user is already a Site Coordinator for this site.
                </p>
              </div>
            )}
            <div className="rounded-md bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800 px-3 py-2 text-xs text-emerald-700 dark:text-emerald-400">
              Role will be set to <strong>Site Coordinator</strong> for <strong>{siteName}</strong>.
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => { onOpenChange(false); reset(); }}>
            Cancel
          </Button>
          {mode === "new" ? (
            <Button onClick={() => createMutation.mutate()} disabled={!canSubmitNew || createMutation.isPending}>
              {createMutation.isPending ? "Creating…" : "Create & Assign"}
            </Button>
          ) : (
            <Button onClick={() => grantMutation.mutate()} disabled={!canSubmitExisting || grantMutation.isPending}>
              {grantMutation.isPending ? "Adding…" : "Add as Coordinator"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Site Users Dialog ─────────────────────────────────────────────────────────

function SiteUsersDialog({
  open,
  onOpenChange,
  site,
  canManage,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  site: Site;
  canManage: boolean;
}) {
  const [addOpen, setAddOpen] = useState(false);

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
  const inherited = siteUsers.filter((u) => u.isInherited);

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
              {/* Site Coordinators */}
              {coordinators.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 px-1">
                    Site Coordinators
                  </p>
                  <div className="space-y-1">
                    {coordinators.map((su) => (
                      <div key={su.id} className="flex items-center gap-3 rounded-lg px-3 py-2.5 hover:bg-muted/40 transition-colors">
                        <div className="w-8 h-8 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center flex-shrink-0 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                          {userInitials(su.user)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium truncate">{userDisplayName(su.user)}</p>
                          {su.user?.email && (
                            <p className="text-xs text-muted-foreground truncate">{su.user.email}</p>
                          )}
                        </div>
                        <span className="text-[11px] px-2 py-0.5 rounded-full font-medium flex-shrink-0 bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400">
                          Coordinator
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Inherited (area managers + enterprise admins) */}
              {inherited.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 px-1">
                    Also have access (via area or enterprise role)
                  </p>
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
                            {su.user?.email && (
                              <p className="text-xs text-muted-foreground truncate">{su.user.email}</p>
                            )}
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

          {canManage && (
            <div className="flex justify-between items-center pt-2 border-t border-border/50">
              <p className="text-xs text-muted-foreground">
                {coordinators.length} coordinator{coordinators.length !== 1 ? "s" : ""} assigned
              </p>
              <Button size="sm" className="gap-1.5" onClick={() => setAddOpen(true)}>
                <UserPlus size={13} />
                Add User
              </Button>
            </div>
          )}
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
  onEdit,
  onArchive,
}: {
  site: Site;
  areas: Area[];
  myGrants: MyGrants | undefined;
  onEdit: (s: Site) => void;
  onArchive: (s: Site) => void;
}) {
  const { toast } = useToast();
  const [usersOpen, setUsersOpen] = useState(false);
  const cfg = STATUS_CONFIG[site.status] ?? STATUS_CONFIG.active;
  const StatusIcon = cfg.icon;
  const area = areas.find((a) => a.id === site.areaId);
  const kioskUrl = `${window.location.origin}/kiosk?site=${site.id}`;
  const siteCanManage = canManageSite(site, myGrants);

  const copyKioskUrl = () => {
    navigator.clipboard.writeText(kioskUrl).then(() => {
      toast({ title: "Kiosk URL copied", description: "Paste into your kiosk browser or share with on-site staff." });
    });
  };

  return (
    <>
      <GlassCard className="p-5 flex flex-col gap-4 hover:shadow-lg transition-shadow">
        {/* Header row */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center flex-shrink-0">
              <Building2 size={20} className="text-blue-600 dark:text-blue-400" />
            </div>
            <div className="min-w-0">
              <h3 className="font-semibold text-sm truncate">{site.name}</h3>
              {site.reference && (
                <p className="text-xs text-muted-foreground font-mono">{site.reference}</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            {site.isDefault && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0">Default</Badge>
            )}
            <span className={`inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full font-medium ${cfg.className}`}>
              <StatusIcon size={10} />
              {cfg.label}
            </span>
          </div>
        </div>

        {/* Details */}
        <div className="space-y-1.5 text-xs text-muted-foreground">
          {(site.address || site.postcode) && (
            <div className="flex items-center gap-1.5">
              <MapPin size={11} className="flex-shrink-0" />
              <span className="truncate">{[site.address, site.postcode].filter(Boolean).join(", ")}</span>
            </div>
          )}
          {site.region && (
            <div className="flex items-center gap-1.5">
              <Globe size={11} className="flex-shrink-0" />
              <span>{site.region}</span>
            </div>
          )}
          {area && (
            <div className="flex items-center gap-1.5">
              <Building2 size={11} className="flex-shrink-0" />
              <span>Area: {area.name}</span>
            </div>
          )}
        </div>

        {/* Users shortcut */}
        <button
          onClick={() => setUsersOpen(true)}
          className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <Users size={12} className="text-blue-500 flex-shrink-0" />
          <span>View users at this site</span>
          {siteCanManage && (
            <span className="ml-auto text-blue-600 dark:text-blue-400 hover:underline font-medium">
              Manage
            </span>
          )}
        </button>

        {/* Kiosk URL section */}
        <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-3 space-y-2">
          <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Kiosk URL</p>
          <p className="text-xs font-mono text-slate-600 dark:text-slate-400 break-all line-clamp-2">{kioskUrl}</p>
          <div className="flex gap-2">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5 flex-1" onClick={copyKioskUrl}>
                    <Copy size={12} />
                    Copy URL
                  </Button>
                </TooltipTrigger>
                <TooltipContent><p>Copy kiosk URL for this site</p></TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs gap-1.5"
              onClick={() => window.open(kioskUrl, "_blank")}
            >
              <ExternalLink size={12} />
              Open
            </Button>
          </div>
        </div>

        {/* Actions */}
        {!site.isDefault && site.status !== "archived" && (
          <div className="flex gap-2 pt-1 border-t border-border/50">
            <Button size="sm" variant="ghost" className="h-7 text-xs gap-1.5 flex-1" onClick={() => onEdit(site)}>
              <Pencil size={12} />
              Edit
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs gap-1.5 text-amber-600 hover:text-amber-700 hover:bg-amber-50 dark:hover:bg-amber-950/30"
              onClick={() => onArchive(site)}
            >
              <Archive size={12} />
              Archive
            </Button>
          </div>
        )}
        {site.isDefault && (
          <div className="flex gap-2 pt-1 border-t border-border/50">
            <Button size="sm" variant="ghost" className="h-7 text-xs gap-1.5 flex-1" onClick={() => onEdit(site)}>
              <Pencil size={12} />
              Edit
            </Button>
          </div>
        )}
      </GlassCard>

      <SiteUsersDialog
        open={usersOpen}
        onOpenChange={setUsersOpen}
        site={site}
        canManage={siteCanManage}
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

  const [name, setName] = useState(site?.name ?? "");
  const [reference, setReference] = useState(site?.reference ?? "");
  const [address, setAddress] = useState(site?.address ?? "");
  const [postcode, setPostcode] = useState(site?.postcode ?? "");
  const [region, setRegion] = useState(site?.region ?? "");
  const [areaId, setAreaId] = useState(site?.areaId ?? "none");
  const [status, setStatus] = useState<string>(site?.status ?? "active");

  const mutation = useMutation({
    mutationFn: async (body: Record<string, any>) => {
      const res = isEdit
        ? await apiRequest("PATCH", `/api/enterprise/sites/${site!.id}`, body)
        : await apiRequest("POST", `/api/enterprise/sites`, body);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to save site");
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: isEdit ? "Site updated" : "Site created" });
      queryClient.invalidateQueries({ queryKey: ["/api/enterprise/sites"] });
      onSaved();
      onOpenChange(false);
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    mutation.mutate({
      name: name.trim(),
      reference: reference.trim() || null,
      address: address.trim() || null,
      postcode: postcode.trim() || null,
      region: region.trim() || null,
      areaId: areaId === "none" ? null : areaId,
      status,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Site" : "Add New Site"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
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
            <Label htmlFor="site-address">Address</Label>
            <Input id="site-address" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Street address" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="site-postcode">Postcode</Label>
              <Input id="site-postcode" value={postcode} onChange={(e) => setPostcode(e.target.value)} placeholder="SW1A 1AA" />
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
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={mutation.isPending || !name.trim()}>
              {mutation.isPending ? "Saving…" : isEdit ? "Save Changes" : "Create Site"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function EnterpriseSites() {
  const { toast } = useToast();
  const [editingSite, setEditingSite] = useState<Site | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [archivingSite, setArchivingSite] = useState<Site | null>(null);

  const { data: sites = [], isLoading } = useQuery<Site[]>({
    queryKey: ["/api/enterprise/sites"],
    staleTime: 30 * 1000,
  });

  const { data: areas = [] } = useQuery<Area[]>({
    queryKey: ["/api/enterprise/areas"],
    staleTime: 60 * 1000,
  });

  const { data: myGrants } = useQuery<MyGrants>({
    queryKey: ["/api/enterprise/role-grants/my"],
    staleTime: 60 * 1000,
  });

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

  const activeSites = sites.filter((s) => s.status !== "archived");
  const archivedSites = sites.filter((s) => s.status === "archived");

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Building2 size={24} className="text-primary" />
            Sites
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage your physical locations. Each site has its own kiosk URL, data scope, and team.
          </p>
        </div>
        <Button
          onClick={() => { setEditingSite(null); setShowForm(true); }}
          className="gap-2"
        >
          <Plus size={16} />
          Add Site
        </Button>
      </div>

      {/* Active sites */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-64 rounded-xl bg-slate-100 dark:bg-slate-800 animate-pulse" />
          ))}
        </div>
      ) : activeSites.length === 0 ? (
        <GlassCard className="p-12 text-center">
          <Building2 size={40} className="mx-auto text-muted-foreground mb-3" />
          <p className="font-medium">No sites yet</p>
          <p className="text-sm text-muted-foreground mt-1">Add your first site to get started.</p>
        </GlassCard>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {activeSites.map((site) => (
            <SiteCard
              key={site.id}
              site={site}
              areas={areas}
              myGrants={myGrants}
              onEdit={(s) => { setEditingSite(s); setShowForm(true); }}
              onArchive={(s) => setArchivingSite(s)}
            />
          ))}
        </div>
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
                onEdit={() => {}}
                onArchive={() => {}}
              />
            ))}
          </div>
        </div>
      )}

      {/* Site form dialog */}
      <SiteFormDialog
        open={showForm}
        onOpenChange={setShowForm}
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
              Archived sites are hidden from active views and cannot be selected. Existing data is preserved. You can view archived sites here but cannot re-activate from this screen.
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
  );
}
