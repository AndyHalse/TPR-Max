import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Building2, ChevronDown, CheckCircle2, Loader2, Globe } from "lucide-react";

interface Site {
  id: string;
  name: string;
  reference: string | null;
  status: string;
  isDefault: boolean;
}

interface SiteSwitcherProps {
  compact?: boolean;
  className?: string;
  textStyle?: React.CSSProperties;
}

export default function SiteSwitcher({ compact = false, className = "", textStyle }: SiteSwitcherProps) {
  const { toast } = useToast();
  const [location] = useLocation();
  const isEnterprisePage = location.startsWith("/enterprise");

  const { data: user } = useQuery<{
    isEnterprise?: boolean;
    activeSiteId?: string | null;
    customerId?: string;
  } | null>({
    queryKey: ["/api/auth/me"],
    staleTime: 5 * 60 * 1000,
  });

  const { data: sites = [] } = useQuery<Site[]>({
    queryKey: ["/api/enterprise/sites"],
    enabled: !!user?.isEnterprise,
    staleTime: 60 * 1000,
  });

  const setActiveSiteMutation = useMutation({
    mutationFn: async (siteId: string) => {
      const res = await apiRequest("POST", "/api/enterprise/active-site", { siteId });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to switch site");
      }
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.setQueryData(["/api/auth/me"], (old: any) =>
        old ? { ...old, activeSiteId: data.activeSiteId } : old,
      );
      queryClient.invalidateQueries();
    },
    onError: (err: Error) => {
      toast({ title: "Could not switch site", description: err.message, variant: "destructive" });
    },
  });

  if (!user?.isEnterprise) return null;

  const activeSites = sites.filter((s) => s.status !== "archived");
  const activeSite = sites.find((s) => s.id === user?.activeSiteId);
  const isPending = setActiveSiteMutation.isPending;

  const displayName = activeSite?.name ?? "Select site…";
  const displayRef = activeSite?.reference;

  if (compact) {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            className={`p-2 rounded-lg hover:bg-white/10 transition-colors relative ${className}`}
            style={textStyle}
            title={isEnterprisePage ? "Whole estate view" : displayName}
            disabled={isPending}
            aria-disabled={isPending}
          >
            {isPending ? (
              <Loader2 size={18} className="animate-spin" />
            ) : isEnterprisePage ? (
              <Globe size={18} className="text-blue-300" />
            ) : (
              <Building2 size={18} />
            )}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          {isEnterprisePage ? (
            <>
              <DropdownMenuLabel className="text-xs text-blue-600 dark:text-blue-400 flex items-center gap-1.5">
                <Globe size={11} />
                Viewing whole estate
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="text-xs text-muted-foreground font-normal">
                Switch to a single-site view:
              </DropdownMenuLabel>
            </>
          ) : (
            <>
              <DropdownMenuLabel className="text-xs text-muted-foreground">Switch Site</DropdownMenuLabel>
              <DropdownMenuSeparator />
            </>
          )}
          {activeSites.map((site) => (
            <DropdownMenuItem
              key={site.id}
              onClick={() => !isPending && setActiveSiteMutation.mutate(site.id)}
              disabled={isPending}
              className="flex items-center gap-2"
            >
              <Building2 size={14} className="text-muted-foreground flex-shrink-0" />
              <span className="flex-1 truncate text-sm">{site.name}</span>
              {!isEnterprisePage && site.id === user?.activeSiteId && (
                <CheckCircle2 size={14} className="text-green-500 flex-shrink-0" />
              )}
            </DropdownMenuItem>
          ))}
          {activeSites.length === 0 && (
            <DropdownMenuItem disabled className="text-xs text-muted-foreground">No sites configured</DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={`h-8 gap-1.5 px-2.5 max-w-[200px] ${className}`}
          style={textStyle}
          disabled={isPending}
        >
          {isPending ? (
            <Loader2 size={14} className="animate-spin flex-shrink-0" />
          ) : isEnterprisePage ? (
            <Globe size={14} className="flex-shrink-0 text-blue-500" />
          ) : (
            <Building2 size={14} className="flex-shrink-0" />
          )}
          <span className="truncate text-xs font-medium">
            {isEnterprisePage
              ? "Whole estate"
              : `${displayRef ? `${displayRef} – ` : ""}${displayName}`}
          </span>
          <ChevronDown size={12} className="flex-shrink-0 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        {isEnterprisePage ? (
          <>
            <DropdownMenuLabel className="text-xs text-blue-600 dark:text-blue-400 flex items-center gap-1.5">
              <Globe size={11} />
              Viewing whole estate
            </DropdownMenuLabel>
            <p className="text-[11px] text-muted-foreground px-2 pb-1 leading-snug">
              All estate pages show data across every site. Select a site below to switch to single-site view.
            </p>
            <DropdownMenuSeparator />
          </>
        ) : (
          <>
            <DropdownMenuLabel className="text-xs text-muted-foreground">Active Site</DropdownMenuLabel>
            <DropdownMenuSeparator />
          </>
        )}
        {activeSites.map((site) => (
          <DropdownMenuItem
            key={site.id}
            onClick={() => !isPending && setActiveSiteMutation.mutate(site.id)}
            disabled={isPending}
            className="flex items-center gap-2"
          >
            <Building2 size={14} className="text-muted-foreground flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm truncate">{site.name}</p>
              {site.reference && (
                <p className="text-[10px] text-muted-foreground font-mono">{site.reference}</p>
              )}
            </div>
            {!isEnterprisePage && site.id === user?.activeSiteId && (
              <CheckCircle2 size={14} className="text-green-500 flex-shrink-0" />
            )}
          </DropdownMenuItem>
        ))}
        {activeSites.length === 0 && (
          <DropdownMenuItem disabled className="text-xs text-muted-foreground">No active sites</DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
