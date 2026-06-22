import { useState } from "react";
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
  QrCode,
  MapPin,
  Globe,
  CheckCircle2,
  Clock,
  ArchiveIcon,
  ExternalLink,
} from "lucide-react";
import GlassCard from "@/components/GlassCard";

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

const STATUS_CONFIG: Record<string, { label: string; icon: typeof CheckCircle2; className: string }> = {
  active: { label: "Active", icon: CheckCircle2, className: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400" },
  onboarding: { label: "Onboarding", icon: Clock, className: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400" },
  archived: { label: "Archived", icon: ArchiveIcon, className: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400" },
};

function SiteCard({
  site,
  areas,
  onEdit,
  onArchive,
}: {
  site: Site;
  areas: Area[];
  onEdit: (s: Site) => void;
  onArchive: (s: Site) => void;
}) {
  const { toast } = useToast();
  const cfg = STATUS_CONFIG[site.status] ?? STATUS_CONFIG.active;
  const StatusIcon = cfg.icon;
  const area = areas.find((a) => a.id === site.areaId);
  const kioskUrl = `${window.location.origin}/kiosk?site=${site.id}`;

  const copyKioskUrl = () => {
    navigator.clipboard.writeText(kioskUrl).then(() => {
      toast({ title: "Kiosk URL copied", description: "Paste into your kiosk browser or share with on-site staff." });
    });
  };

  return (
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
            onClick={() => window.open(kioskUrl, '_blank')}
          >
            <ExternalLink size={12} />
            Open
          </Button>
        </div>
      </div>

      {/* Actions */}
      {!site.isDefault && site.status !== 'archived' && (
        <div className="flex gap-2 pt-1 border-t border-border/50">
          <Button size="sm" variant="ghost" className="h-7 text-xs gap-1.5 flex-1" onClick={() => onEdit(site)}>
            <Pencil size={12} />
            Edit
          </Button>
          <Button size="sm" variant="ghost" className="h-7 text-xs gap-1.5 text-amber-600 hover:text-amber-700 hover:bg-amber-50 dark:hover:bg-amber-950/30" onClick={() => onArchive(site)}>
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
  );
}

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
              onEdit={(s) => { setEditingSite(s); setShowForm(true); }}
              onArchive={(s) => setArchivingSite(s)}
            />
          ))}
        </div>
      )}

      {/* Archived sites (collapsible section) */}
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
                onEdit={(s) => { setEditingSite(s); setShowForm(true); }}
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
