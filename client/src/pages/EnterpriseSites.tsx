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
  /** Site IDs where this user has explicit user-management power (site_coordinator with canManageSiteUsers). */
  canManageSiteIds?: string[];
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
  score: number;
  categoryScores: Record<string, number>;
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

function scoreColor(score: number): string {
  if (score >= 80) return "#22c55e";
  if (score >= 50) return "#f59e0b";
  return "#ef4444";
}

function scoreStatusLabel(score: number): "compliant" | "warning" | "critical" {
  if (score >= 80) return "compliant";
  if (score >= 50) return "warning";
  return "critical";
}

function worstCategory(categoryScores: Record<string, number>): string | null {
  if (!categoryScores || Object.keys(categoryScores).length === 0) return null;
  const [worst] = Object.entries(categoryScores).sort(([, a], [, b]) => a - b);
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

function ScoreRingSmall({ score }: { score: number }) {
  const R = 16;
  const circ = 2 * Math.PI * R;
  const dash = (Math.min(100, Math.max(0, score)) / 100) * circ;
  const color = scoreColor(score);
  return (
    <div className="relative flex items-center justify-center shrink-0" style={{ width: 40, height: 40 }}>
      <svg width="40" height="40" viewBox="0 0 40 40" className="-rotate-90">
        <circle cx="20" cy="20" r={R} fill="none" stroke="#e2e8f0" strokeWidth="4"
          className="dark:stroke-slate-700" />
        <circle cx="20" cy="20" r={R} fill="none" stroke={color} strokeWidth="4"
          strokeDasharray={`${dash} ${circ - dash}`} strokeLinecap="round" />
      </svg>
      <span className="absolute text-[11px] font-bold" style={{ color }}>{score}</span>
    </div>
  );
}

// ── Compliance status chip ────────────────────────────────────────────────────

function ComplianceChip({ score }: { score: number }) {
  const s = scoreStatusLabel(score);
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
  const inherited    = siteUsers.filter((u) => u.isInherited);

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
            {(site.address || site.postcode) && (
              <span className="flex items-center gap-1">
                <MapPin size={11} className="flex-shrink-0" />
                <span className="truncate">{[site.address, site.postcode].filter(Boolean).join(", ")}</span>
              </span>
            )}
            {site.region && (
              <span className="flex items-center gap-1">
                <Globe size={11} className="flex-shrink-0" />
                <span>{site.region}</span>
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

  const [name, setName]           = useState(site?.name ?? "");
  const [reference, setReference] = useState(site?.reference ?? "");
  const [address, setAddress]     = useState(site?.address ?? "");
  const [postcode, setPostcode]   = useState(site?.postcode ?? "");
  const [region, setRegion]       = useState(site?.region ?? "");
  const [areaId, setAreaId]       = useState(site?.areaId ?? "none");
  const [status, setStatus]       = useState<string>(site?.status ?? "active");

  // Shown once after creation when independent management style auto-provisioned a site admin
  const [provisionedCreds, setProvisionedCreds] = useState<{ username: string; tempPassword: string } | null>(null);

  const mutation = useMutation({
    mutationFn: async (body: Record<string, any>) => {
      const res = isEdit
        ? await apiRequest("PATCH", `/api/enterprise/sites/${site!.id}`, body)
        : await apiRequest("POST", `/api/enterprise/sites`, body);
      if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.error || "Failed to save site"); }
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/enterprise/sites"] });
      onSaved();
      onOpenChange(false);
      if (data?.siteAdminCredentials) {
        // Show a credentials reveal dialog instead of closing silently
        setProvisionedCreds(data.siteAdminCredentials);
      } else {
        toast({ title: isEdit ? "Site updated" : "Site created" });
      }
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    mutation.mutate({
      name: name.trim(),
      reference: reference.trim() || null,
      address:   address.trim() || null,
      postcode:  postcode.trim() || null,
      region:    region.trim() || null,
      areaId:    areaId === "none" ? null : areaId,
      status,
    });
  };

  return (
    <>
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

    {/* Credentials reveal — shown once when independent management style auto-provisions a site admin */}
    <Dialog open={!!provisionedCreds} onOpenChange={(v) => !v && setProvisionedCreds(null)}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus size={16} className="text-emerald-600" />
            Site admin account created
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <p className="text-muted-foreground text-xs leading-relaxed">
            Because this customer uses <strong>independent</strong> site management, a site-admin login has been auto-provisioned.
            Share these one-time credentials with the site manager — they can change their password after first login.
          </p>
          <div className="rounded-lg border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30 p-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-muted-foreground">Username</span>
              <div className="flex items-center gap-1.5">
                <span className="font-mono text-xs font-semibold">{provisionedCreds?.username}</span>
                <button className="text-muted-foreground hover:text-foreground" onClick={() => navigator.clipboard.writeText(provisionedCreds?.username ?? '').then(() => toast({ title: "Username copied" }))}>
                  <Copy size={12} />
                </button>
              </div>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-muted-foreground">Temporary password</span>
              <div className="flex items-center gap-1.5">
                <span className="font-mono text-xs font-semibold tracking-wider">{provisionedCreds?.tempPassword}</span>
                <button className="text-muted-foreground hover:text-foreground" onClick={() => navigator.clipboard.writeText(provisionedCreds?.tempPassword ?? '').then(() => toast({ title: "Password copied" }))}>
                  <Copy size={12} />
                </button>
              </div>
            </div>
          </div>
          <p className="text-[11px] text-amber-600 dark:text-amber-400">
            ⚠ This password is shown once only. Copy it now before closing.
          </p>
        </div>
        <div className="flex justify-end pt-1">
          <Button size="sm" onClick={() => setProvisionedCreds(null)}>Done</Button>
        </div>
      </DialogContent>
    </Dialog>
  </>
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
