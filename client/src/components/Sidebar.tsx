import { useState, useEffect, useCallback, type CSSProperties } from "react";
import { Link, useLocation } from "wouter";
import { ChevronLeft, ChevronRight, X, ChartLine, Activity, User, HardHat, CalendarPlus, Users, UserCheck, Calendar, Clock, ListChecks, ScrollText, AlertTriangle, Flame, Wrench, ClipboardCheck, ShieldCheck, ClipboardList, FileEdit, Ticket, Shield, FileText, Video, Dock, Mail, Briefcase, Settings, LogOut, Globe } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest, clearSessionToken } from "@/lib/queryClient";

export const SIDEBAR_COLLAPSED_KEY = "tprmax-sidebar-collapsed";
export const SIDEBAR_EXPANDED_WIDTH = 220;
export const SIDEBAR_COLLAPSED_WIDTH = 56;

const NAV_GROUPS_CONFIG = [
  { label: "Overview",    paths: ["/", "/compliance-dashboard"] },
  { label: "People",      paths: ["/visitors", "/contractors", "/staff", "/members"] },
  { label: "Company Compliance",  paths: ["/induction-settings", "/contractor-portal-admin", "/compliance-certificates", "/permit-to-work", "/ra-builder", "/audits"] },
  { label: "Safety",      paths: ["/muster", "/incident-reports", "/hs-incidents", "/fire-risk-assessment", "/martyn-law"] },
  { label: "Operations",  paths: ["/meeting-rooms", "/time-attendance", "/ppm", "/helpdesk", "/kiosk", "/email-outbox"] },
  { label: "HR",          paths: ["/hr"] },
  { label: "Reports",     paths: ["/reports"] },
];

const SETTINGS_PATH = "/settings";

export interface SidebarNavItem {
  path: string;
  icon: React.ComponentType<{ size?: number }>;
  label: string;
  badge?: number;
  tooltip?: string;
  badgeTooltip?: string;
}

interface SidebarProps {
  navItems: SidebarNavItem[];
  collapsed: boolean;
  onCollapsedChange: (v: boolean) => void;
  mobileOpen: boolean;
  onMobileClose: () => void;
  isMobile: boolean;
  settings?: {
    navBannerColor?: string | null;
    navBannerInvert?: boolean | null;
    accentColor?: string | null;
    companyName?: string | null;
  } | null;
  logoSrc?: string | null;
  onLogoError?: () => void;
}

export default function Sidebar({
  navItems,
  collapsed,
  onCollapsedChange,
  mobileOpen,
  onMobileClose,
  isMobile,
  settings,
  logoSrc,
  onLogoError,
}: SidebarProps) {
  const [location] = useLocation();

  const toggleCollapsed = useCallback(() => {
    const next = !collapsed;
    try { localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(next)); } catch {}
    onCollapsedChange(next);
  }, [collapsed, onCollapsedChange]);

  useEffect(() => {
    if (!isMobile || !mobileOpen) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onMobileClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isMobile, mobileOpen, onMobileClose]);

  const effectiveCollapsed = isMobile ? false : collapsed;
  const width = effectiveCollapsed ? SIDEBAR_COLLAPSED_WIDTH : SIDEBAR_EXPANDED_WIDTH;
  const translateX = isMobile && !mobileOpen ? -SIDEBAR_EXPANDED_WIDTH : 0;

  const navBannerStyle: CSSProperties = settings?.navBannerColor
    ? { backgroundColor: settings.navBannerColor }
    : {};
  const navInvert = !!settings?.navBannerInvert;
  const textStyle: CSSProperties = navInvert ? { color: "#ffffff" } : {};
  const activeStyle: CSSProperties = navInvert
    ? { color: "#ffffff", backgroundColor: "rgba(255,255,255,0.2)" }
    : { color: "var(--primary)", backgroundColor: "rgba(0,0,0,0.06)" };

  const navItemMap = new Map(navItems.map(item => [item.path, item]));
  const settingsItem = navItemMap.get(SETTINGS_PATH);

  const logoLetter = settings?.companyName?.charAt(0) || "T";
  const logoBg = navInvert ? "rgba(255,255,255,0.2)" : "var(--primary)";
  const logoColor = "#fff";

  return (
    <>
      {isMobile && mobileOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-40"
          onClick={onMobileClose}
          aria-hidden="true"
        />
      )}

      <aside
        className="fixed top-0 left-0 h-screen z-50 flex flex-col border-r border-border/30 shadow-lg glass-effect"
        style={{
          width: isMobile ? SIDEBAR_EXPANDED_WIDTH : width,
          transform: `translateX(${translateX}px)`,
          transition: "width 0.2s ease, transform 0.2s ease",
          ...navBannerStyle,
        }}
        aria-label="Sidebar navigation"
      >
        {/* Header */}
        <div
          className="flex items-center gap-2 px-3 border-b border-border/30 flex-shrink-0"
          style={{ minHeight: 64 }}
        >
          <Link
            href="/marketing"
            className="flex items-center justify-center hover:opacity-80 transition-opacity no-underline flex-1 min-w-0"
          >
            {logoSrc ? (
              <img
                src={logoSrc}
                alt="Logo"
                className={`object-contain rounded flex-shrink-0 ${effectiveCollapsed && !isMobile ? "w-8 h-8" : "h-10 max-w-full"}`}
                style={effectiveCollapsed && !isMobile ? {} : { maxWidth: "calc(100% - 40px)" }}
                onError={onLogoError}
              />
            ) : (
              <div
                className={`rounded flex items-center justify-center font-bold flex-shrink-0 ${effectiveCollapsed && !isMobile ? "w-8 h-8 text-sm" : "w-10 h-10 text-lg"}`}
                style={{ backgroundColor: logoBg, color: logoColor }}
              >
                {logoLetter}
              </div>
            )}
          </Link>

          {isMobile ? (
            <button
              className="p-1.5 rounded-md hover:bg-white/10 transition-colors ml-auto flex-shrink-0"
              style={textStyle}
              onClick={onMobileClose}
              aria-label="Close sidebar"
            >
              <X size={18} />
            </button>
          ) : (
            <button
              className="p-1.5 rounded-md hover:bg-white/10 transition-colors ml-auto flex-shrink-0"
              style={textStyle}
              onClick={toggleCollapsed}
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
            </button>
          )}
        </div>

        {/* Scrollable nav groups + pinned settings — single TooltipProvider */}
        <TooltipProvider delayDuration={300}>
          <nav className="flex-1 overflow-y-auto py-2" aria-label="Main navigation">
            {NAV_GROUPS_CONFIG.map((group) => {
              const groupItems = group.paths
                .map(p => navItemMap.get(p))
                .filter(Boolean) as SidebarNavItem[];
              if (groupItems.length === 0) return null;

              return (
                <div key={group.label} className="mb-1">
                  {!effectiveCollapsed ? (
                    <p
                      className="px-4 pt-3 pb-0.5 text-[10px] font-semibold uppercase tracking-widest opacity-50"
                      style={textStyle}
                    >
                      {group.label}
                    </p>
                  ) : (
                    <div className="mt-3 mx-3 border-t border-border/20" />
                  )}
                  {groupItems.map(item => (
                    <SidebarItem
                      key={item.path}
                      item={item}
                      isActive={location === item.path}
                      collapsed={effectiveCollapsed}
                      textStyle={textStyle}
                      activeStyle={activeStyle}
                      onNavigate={isMobile ? onMobileClose : undefined}
                    />
                  ))}
                </div>
              );
            })}
          </nav>

          {/* Settings + Logout pinned at bottom */}
          <div className="flex-shrink-0 border-t border-border/30 py-2">
            {settingsItem && (
              <SidebarItem
                item={settingsItem}
                isActive={location === SETTINGS_PATH}
                collapsed={effectiveCollapsed}
                textStyle={textStyle}
                activeStyle={activeStyle}
                onNavigate={isMobile ? onMobileClose : undefined}
              />
            )}
            <SidebarLogoutButton collapsed={effectiveCollapsed} textStyle={textStyle} />
          </div>
        </TooltipProvider>
      </aside>
    </>
  );
}

interface SidebarItemProps {
  item: SidebarNavItem;
  isActive: boolean;
  collapsed: boolean;
  textStyle: CSSProperties;
  activeStyle: CSSProperties;
  onNavigate?: () => void;
}

function SidebarItem({ item, isActive, collapsed, textStyle, activeStyle, onNavigate }: SidebarItemProps) {
  const inner = (
    <Link
      href={item.path}
      onClick={onNavigate}
      className={`flex items-center gap-3 px-3 py-2 mx-1 rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
        collapsed ? "justify-center" : ""
      } ${isActive ? "" : "hover:bg-white/10"}`}
      style={isActive ? activeStyle : textStyle}
    >
      <span className="flex-shrink-0 relative">
        <item.icon size={18} />
        {collapsed && item.badge !== undefined && item.badge > 0 && (
          <span className="absolute -top-1.5 -right-1.5 min-w-[14px] h-3.5 px-0.5 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center leading-none">
            {item.badge > 99 ? "99+" : item.badge}
          </span>
        )}
      </span>
      {!collapsed && (
        <>
          <span className="text-sm truncate flex-1">
            {item.label}
            {item.path === "/hr" && (
              <span className="ml-1.5 text-[10px] bg-amber-100 text-amber-700 px-1 py-0.5 rounded font-medium">β</span>
            )}
          </span>
          {item.badge !== undefined && item.badge > 0 && (
            item.badgeTooltip ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="ml-auto min-w-[18px] h-4 px-0.5 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center leading-none flex-shrink-0 cursor-default">
                    {item.badge > 99 ? "99+" : item.badge}
                  </span>
                </TooltipTrigger>
                <TooltipContent side="right"><p>{item.badgeTooltip}</p></TooltipContent>
              </Tooltip>
            ) : (
              <span className="ml-auto min-w-[18px] h-4 px-0.5 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center leading-none flex-shrink-0">
                {item.badge > 99 ? "99+" : item.badge}
              </span>
            )
          )}
        </>
      )}
    </Link>
  );

  if (collapsed) {
    const n = item.badge ?? 0;
    const gapWord = n === 1 ? "gap" : "gaps";
    return (
      <Tooltip>
        <TooltipTrigger asChild>{inner}</TooltipTrigger>
        <TooltipContent side="right">
          <p>
            {item.tooltip || item.label}
            {n > 0 ? ` (${n} ${gapWord})` : ""}
          </p>
        </TooltipContent>
      </Tooltip>
    );
  }

  return inner;
}

function SidebarLogoutButton({ collapsed, textStyle }: { collapsed: boolean; textStyle: CSSProperties }) {
  const queryClient = useQueryClient();
  const { data: authUser } = useQuery<{ firstName?: string | null }>({
    queryKey: ["/api/auth/me"],
    staleTime: Infinity,
  });
  const firstName = authUser?.firstName;

  const logoutMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/auth/logout");
      return response.json();
    },
    onSuccess: () => {
      clearSessionToken();
      localStorage.removeItem('visigate_user');
      sessionStorage.removeItem('tprmax-logo-token');
      if (localStorage.getItem('tprmax-remember-me') !== 'true') {
        localStorage.removeItem('tprmax-last-login');
      }
      queryClient.clear();
      window.location.href = '/login';
    },
  });

  const label = logoutMutation.isPending
    ? "Logging out…"
    : firstName
      ? `Logout  ${firstName}`
      : "Logout";

  const inner = (
    <button
      onClick={() => logoutMutation.mutate()}
      disabled={logoutMutation.isPending}
      className={`w-full flex items-center gap-3 px-3 py-2 mx-1 rounded-lg transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50 ${collapsed ? "justify-center" : ""}`}
      style={{ ...textStyle, width: "calc(100% - 8px)" }}
      data-testid="button-logout-sidebar"
    >
      <span className="flex-shrink-0"><LogOut size={18} /></span>
      {!collapsed && <span className="text-sm truncate flex-1">{label}</span>}
    </button>
  );

  if (collapsed) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>{inner}</TooltipTrigger>
        <TooltipContent side="right"><p>Logout</p></TooltipContent>
      </Tooltip>
    );
  }

  return inner;
}
