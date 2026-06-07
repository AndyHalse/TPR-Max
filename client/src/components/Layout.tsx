import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { IdCard, ChartLine, Users, Dock, ListChecks, User, Settings, FileText, CalendarPlus, Calendar, Clock, Menu, X, HardHat, Video, Building2, UserCheck, Mail, Shield, ScrollText, Wrench, Ticket, AlertTriangle, Flame, Briefcase, ShieldCheck, ClipboardList, Activity, ClipboardCheck, FileEdit, BookOpen, Webhook } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import LogoutButton from "@/components/LogoutButton";
import HelpButton from "@/components/HelpButton";
import HelpPanel from "@/components/HelpPanel";
import Sidebar, { SIDEBAR_COLLAPSED_KEY, SIDEBAR_EXPANDED_WIDTH, SIDEBAR_COLLAPSED_WIDTH } from "@/components/Sidebar";
import type { CompanySettings } from "@shared/schema";
import { useState, useEffect, useCallback, type CSSProperties } from "react";
import { getQueryFn } from "@/lib/queryClient";
import { hasContractorComplianceGap, type ContractorWithComplianceStatus } from "@/lib/utils";

interface LayoutProps {
  children: React.ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  const [location] = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isHelpPanelOpen, setIsHelpPanelOpen] = useState(false);
  const [logoError, setLogoError] = useState(false);

  // Sidebar state (lifted so Layout can adjust content margin)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try { return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "true"; } catch { return false; }
  });
  const [sidebarMobileOpen, setSidebarMobileOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(() => typeof window !== "undefined" && window.innerWidth < 768);

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const { data: user } = useQuery<{
    id: string;
    username: string;
    firstName?: string | null;
    lastName?: string | null;
    role?: string;
    allowedMenuItems?: string[] | null;
    defaultLandingPage?: string | null;
    navStyle?: string | null;
    customerId?: string;
  } | null>({
    queryKey: ["/api/auth/me"],
    queryFn: getQueryFn({ on401: "returnNull" }),
    staleTime: 5 * 60 * 1000,
  });

  const navStyle: "classic" | "sidebar" = (user?.navStyle === "classic") ? "classic" : "sidebar";

  const customerId = user?.customerId;

  const { data: contractorsForBadge } = useQuery<ContractorWithComplianceStatus[]>({
    queryKey: ["/api/contractors", customerId],
    enabled: !!customerId,
    staleTime: 30 * 1000,
    refetchInterval: 30 * 1000,
  });

  const contractorGapsCount = (contractorsForBadge || []).filter(hasContractorComplianceGap).length;

  const { data: ppmExpiryData } = useQuery<{ expiredCount: number; expiringSoonCount: number; total: number }>({
    queryKey: ["/api/ppm/expiry-count", customerId],
    enabled: !!customerId && user?.role === "admin",
    staleTime: 30 * 1000,
    refetchInterval: 30 * 1000,
  });

  const ppmGapsCount = ppmExpiryData?.total ?? 0;

  const { data: settings } = useQuery<CompanySettings>({
    queryKey: ["/api/settings"],
    queryFn: getQueryFn<CompanySettings>({ on401: "returnNull" }),
    staleTime: 30 * 1000,
    gcTime: 5 * 60 * 1000,
    refetchOnMount: false,
    placeholderData: (previousData: CompanySettings | undefined) => previousData,
  });

  const [logoFallbackStage, setLogoFallbackStage] = useState(0);

  const getLogoSrc = useCallback(() => {
    if (logoError || !settings?.logoUrl) return null;
    const logoToken = localStorage.getItem('tprmax-logo-token');
    if (logoFallbackStage === 0 && logoToken) return `/api/public-logo/${logoToken}`;
    if (logoFallbackStage === 1) return `/api/company-logo`;
    if (logoFallbackStage === 2) {
      const normalizedUrl = settings.logoUrl.replace(/^\/objects/, '');
      return `/objects${normalizedUrl}`;
    }
    if (logoFallbackStage === 3) {
      const fileName = settings.logoUrl.replace(/^\/?(uploads\/)?/, '');
      return `/public-objects/${fileName}`;
    }
    return null;
  }, [settings?.logoUrl, logoError, logoFallbackStage]);

  const handleLogoError = useCallback(() => {
    setLogoFallbackStage(prev => {
      const next = prev + 1;
      if (next > 3) { setLogoError(true); return prev; }
      return next;
    });
  }, []);

  useEffect(() => {
    if (settings?.backgroundColor || settings?.foregroundColor || settings?.accentColor) {
      const root = document.documentElement;

      const hexToHsl = (hex: string) => {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        if (!result) return null;
        const r = parseInt(result[1], 16) / 255;
        const g = parseInt(result[2], 16) / 255;
        const b = parseInt(result[3], 16) / 255;
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        let h = 0, s = 0;
        const l = (max + min) / 2;
        if (max !== min) {
          const d = max - min;
          s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
          switch (max) {
            case r: h = (g - b) / d + (g < b ? 6 : 0); break;
            case g: h = (b - r) / d + 2; break;
            case b: h = (r - g) / d + 4; break;
          }
          h /= 6;
        }
        return `${Math.round(h * 360)}, ${Math.round(s * 100)}%, ${Math.round(l * 100)}%`;
      };

      if (settings.backgroundColor) {
        const hsl = hexToHsl(settings.backgroundColor);
        if (hsl) {
          root.style.setProperty('--background', `hsl(${hsl})`);
          root.style.setProperty('--popover', `hsl(${hsl})`);
          const hex = settings.backgroundColor;
          const r = parseInt(hex.slice(1, 3), 16);
          const g = parseInt(hex.slice(3, 5), 16);
          const b = parseInt(hex.slice(5, 7), 16);
          const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
          if (luminance < 0.5) {
            const cr = Math.min(r + 25, 255);
            const cg = Math.min(g + 25, 255);
            const cb = Math.min(b + 25, 255);
            const cardHsl = hexToHsl(`#${cr.toString(16).padStart(2,'0')}${cg.toString(16).padStart(2,'0')}${cb.toString(16).padStart(2,'0')}`);
            if (cardHsl) root.style.setProperty('--card', `hsl(${cardHsl})`);
            const br = Math.min(r + 50, 255);
            const bg2 = Math.min(g + 50, 255);
            const bb = Math.min(b + 50, 255);
            const borderHsl = hexToHsl(`#${br.toString(16).padStart(2,'0')}${bg2.toString(16).padStart(2,'0')}${bb.toString(16).padStart(2,'0')}`);
            if (borderHsl) {
              root.style.setProperty('--border', `hsl(${borderHsl})`);
              root.style.setProperty('--input', `hsl(${borderHsl})`);
            }
            root.style.setProperty('--glass-bg', `rgba(${cr}, ${cg}, ${cb}, 0.4)`);
            root.style.setProperty('--glass-border', `rgba(${br}, ${bg2}, ${bb}, 0.3)`);
            root.style.setProperty('--glass-hover', `rgba(${cr + 10}, ${cg + 10}, ${cb + 10}, 0.5)`);
            root.style.setProperty('--secondary', `hsl(${cardHsl || hsl})`);
            root.style.setProperty('--muted', `hsl(${cardHsl || hsl})`);
          } else {
            root.style.setProperty('--card', `hsl(${hsl})`);
            root.style.setProperty('--glass-bg', `rgba(255, 255, 255, 0.92)`);
            root.style.setProperty('--glass-border', `rgba(0, 0, 0, 0.08)`);
            root.style.setProperty('--glass-hover', `rgba(255, 255, 255, 0.97)`);
            const mr = Math.max(r - 14, 0);
            const mg = Math.max(g - 14, 0);
            const mb = Math.max(b - 14, 0);
            const mutedHex = `#${mr.toString(16).padStart(2,'0')}${mg.toString(16).padStart(2,'0')}${mb.toString(16).padStart(2,'0')}`;
            const mutedHsl = hexToHsl(mutedHex);
            if (mutedHsl) {
              root.style.setProperty('--muted', `hsl(${mutedHsl})`);
              root.style.setProperty('--secondary', `hsl(${mutedHsl})`);
            }
          }
        }
      }

      if (settings.foregroundColor) {
        const hsl = hexToHsl(settings.foregroundColor);
        if (hsl) {
          root.style.setProperty('--foreground', `hsl(${hsl})`);
          root.style.setProperty('--card-foreground', `hsl(${hsl})`);
          root.style.setProperty('--popover-foreground', `hsl(${hsl})`);
          root.style.setProperty('--secondary-foreground', `hsl(${hsl})`);
          root.style.setProperty('--muted-foreground', `hsl(${hsl})`);
          root.style.setProperty('--accent-foreground', `hsl(${hsl})`);
          root.style.setProperty('--fixed-text', `hsl(${hsl})`);
        }
      }

      if (settings.variableTextColor) {
        const hsl = hexToHsl(settings.variableTextColor);
        if (hsl) root.style.setProperty('--variable-text', `hsl(${hsl})`);
      }

      if (settings.accentColor) {
        const hsl = hexToHsl(settings.accentColor);
        if (hsl) {
          root.style.setProperty('--primary', `hsl(${hsl})`);
          root.style.setProperty('--accent', `hsl(${hsl})`);
          root.style.setProperty('--ring', `hsl(${hsl})`);
        }
      }
    }
  }, [settings?.backgroundColor, settings?.foregroundColor, settings?.variableTextColor, settings?.accentColor]);

  useEffect(() => {
    if (settings) {
      setLogoError(false);
      setLogoFallbackStage(0);
    }
  }, [settings?.logoUrl, settings?.companyName]);

  const allNavItems = [
    { path: "/", icon: ChartLine, label: "Dashboard", featureKey: "featureDashboard", defaultOn: true },
    { path: "/compliance-dashboard", icon: Activity, label: "Compliance Score", featureKey: "featureComplianceDashboard", defaultOn: true },
    { path: "/visitors", icon: User, label: "Visitors", featureKey: "featureVisitors", defaultOn: true },
    { path: "/contractors", icon: HardHat, label: "Contractors", featureKey: "featureContractors", defaultOn: true, badge: contractorGapsCount > 0 ? contractorGapsCount : undefined },
    { path: "/contractor", icon: CalendarPlus, label: "Contractor In/Out", featureKey: "featureContractorPage", defaultOn: true },
    { path: "/staff", icon: Users, label: "Staff", featureKey: "featureStaff", defaultOn: true },
    { path: "/members", icon: UserCheck, label: "Members", featureKey: "featureMembers", defaultOn: true },
    { path: "/meeting-rooms", icon: Calendar, label: "Meeting Rooms", featureKey: "featureMeetingRooms", defaultOn: true },
    { path: "/time-attendance", icon: Clock, label: "T&A Report", featureKey: "featureTimeAttendance", defaultOn: true },
    { path: "/muster", icon: ListChecks, label: "Muster List", featureKey: "featureMusterList", defaultOn: true },
    { path: "/incident-reports", icon: ScrollText, label: "Incident Reports", featureKey: "featureIncidentReports", defaultOn: true },
    { path: "/hs-incidents", icon: AlertTriangle, label: "H&S Incidents", featureKey: "featureHsIncidents", defaultOn: true },
    { path: "/fire-risk-assessment", icon: Flame, label: "Fire Risk Assessment", featureKey: "featureFireRiskAssessment", defaultOn: true },
    { path: "/ppm", icon: Wrench, label: "PPM", tooltip: "Planned Preventive Maintenance", featureKey: "featurePPM", defaultOn: false, badge: ppmGapsCount > 0 ? ppmGapsCount : undefined },
    { path: "/audits", icon: ClipboardCheck, label: "Audits & Inspections", tooltip: "Audit & Inspection Engine", featureKey: "featureAuditEngine", defaultOn: false },
    { path: "/compliance-certificates", icon: ShieldCheck, label: "Compliance Register", tooltip: "Compliance Certificate Register", featureKey: "featureComplianceCertificates", defaultOn: false },
    { path: "/permit-to-work", icon: ClipboardList, label: "Permit to Work", tooltip: "Permit-to-Work System", featureKey: "featurePermitToWork", defaultOn: false },
    { path: "/ra-builder", icon: FileEdit, label: "RA Builder", tooltip: "Risk Assessment Builder", featureKey: "featureRaBuilder", defaultOn: false },
    { path: "/template-library", icon: BookOpen, label: "Template Library", tooltip: "Pre-built H&S Templates", featureKey: "featureTemplateLibrary", defaultOn: true },
    { path: "/helpdesk", icon: Ticket, label: "Help Desk", featureKey: "featureHelpDesk", defaultOn: false },
    { path: "/settings/teams-integration", icon: Webhook, label: "Teams Alerts", tooltip: "Microsoft Teams Notifications", featureKey: "featureTeamsIntegration", defaultOn: false },
    { path: "/settings/calendar-integration", icon: CalendarPlus, label: "Calendar Sync", tooltip: "Auto Visitor Pre-Registration from Calendar", featureKey: "featureCalendarIntegration", defaultOn: false },
    { path: "/martyn-law", icon: Shield, label: "Martyn's Law", featureKey: "featureMartynLaw" },
    { path: "/reports", icon: FileText, label: "Reports", featureKey: "featureReports", defaultOn: true },
    { path: "/induction-settings", icon: Video, label: "Induction Settings", featureKey: "featureInductionSettings", defaultOn: true },
    { path: "/kiosk", icon: Dock, label: "Kiosk Mode", featureKey: "featureKiosk", defaultOn: true },
    { path: "/email-outbox", icon: Mail, label: "Email Outbox", featureKey: "featureEmailOutbox" },
    { path: "/hr", icon: Briefcase, label: "HR", featureKey: "featureHrModule", defaultOn: true },
    { path: "/settings", icon: Settings, label: "Settings", featureKey: "featureSettingsPage", defaultOn: true },
  ];

  const allowedItems = user?.allowedMenuItems;
  const hasMenuRestrictions = Array.isArray(allowedItems) && allowedItems.length > 0;

  const navItems = allNavItems.filter(item => {
    if (hasMenuRestrictions && user?.role !== 'admin') {
      if (!allowedItems!.includes(item.path)) return false;
    }
    if (!settings) return (item as any).alwaysVisible;
    if (item.featureKey) {
      const platformDisabled = (settings as any).platformDisabledFeatures;
      if (Array.isArray(platformDisabled) && platformDisabled.includes(item.featureKey)) return false;
      const val = settings[item.featureKey as keyof CompanySettings];
      if (item.defaultOn) return val !== false;
      return val === true;
    }
    return true;
  });

  const currentLogoSrc = getLogoSrc();

  const navBannerStyle: CSSProperties = settings?.navBannerColor
    ? { backgroundColor: settings.navBannerColor, boxShadow: '0 1px 3px rgba(0,0,0,0.12)' }
    : {};
  const navInvert = !!settings?.navBannerInvert;
  const bannerTextStyle: CSSProperties = navInvert ? { color: '#ffffff' } : {};
  const bannerActiveIconStyle: CSSProperties = navInvert ? { color: '#ffffff' } : { color: 'var(--primary)' };

  // Compute sidebar width for content offset (desktop only, sidebar mode only)
  const sidebarWidth = navStyle === "sidebar" && !isMobile
    ? (sidebarCollapsed ? SIDEBAR_COLLAPSED_WIDTH : SIDEBAR_EXPANDED_WIDTH)
    : 0;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/40 to-slate-100 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950">

      {/* ── SIDEBAR NAV ── */}
      {navStyle === "sidebar" && (
        <Sidebar
          navItems={navItems}
          collapsed={sidebarCollapsed}
          onCollapsedChange={setSidebarCollapsed}
          mobileOpen={sidebarMobileOpen}
          onMobileClose={() => setSidebarMobileOpen(false)}
          isMobile={isMobile}
          settings={settings ? {
            navBannerColor: settings.navBannerColor,
            navBannerInvert: settings.navBannerInvert,
            accentColor: settings.accentColor,
            companyName: settings.companyName,
          } : null}
          logoSrc={currentLogoSrc}
          onLogoError={handleLogoError}
        />
      )}

      {/* ── CLASSIC TOP NAV ── */}
      {navStyle === "classic" && (
        <>
          <nav className="glass-effect fixed top-0 left-0 right-0 z-50 px-3 sm:px-6 py-2 sm:py-3" style={navBannerStyle}>
            <div className="max-w-7xl mx-auto flex items-center justify-between">
              <Link href="/marketing">
                <div className="flex items-center space-x-4 min-w-0 flex-shrink-0 cursor-pointer hover:opacity-80 transition-opacity">
                  <div className="w-[50px] h-[50px] sm:w-20 sm:h-20 rounded-xl flex items-center justify-center flex-shrink-0">
                    {currentLogoSrc ? (
                      <img
                        src={currentLogoSrc}
                        alt="Company Logo"
                        className="w-full h-full object-contain rounded"
                        onError={handleLogoError}
                      />
                    ) : (
                      <div className="w-[50px] h-[50px] sm:w-[70px] sm:h-[70px] rounded-lg bg-white/20 flex items-center justify-center text-lg font-bold" style={navInvert ? { color: '#ffffff' } : { color: settings?.accentColor || '#2460a9' }}>
                        {settings?.companyName?.charAt(0) || 'A'}
                      </div>
                    )}
                  </div>
                  <div className="hidden sm:block min-w-0 max-w-[220px] lg:max-w-xs">
                    <h1 className="text-base sm:text-lg lg:text-xl font-bold truncate" style={navInvert ? bannerTextStyle : {}}>{settings?.companyName || ''}</h1>
                    <p className="text-xs" style={navInvert ? { color: 'rgba(255,255,255,0.7)' } : {}}>TPR</p>
                  </div>
                </div>
              </Link>

              <div className="hidden lg:flex items-center space-x-1 flex-1 justify-center">
                <TooltipProvider>
                  {navItems.map((item) => (
                    <Tooltip key={item.path}>
                      <TooltipTrigger asChild>
                        <Link href={item.path}>
                          <button
                            className={`nav-btn p-3 rounded-lg transition-colors relative ${
                              location === item.path ? 'bg-white/20 shadow-sm' : 'hover:bg-white/10'
                            }`}
                            style={location === item.path ? bannerActiveIconStyle : bannerTextStyle}
                            data-testid={`nav-${item.label.toLowerCase().replace(/\s+/g, '-')}`}
                          >
                            <item.icon size={21} />
                            {'badge' in item && item.badge !== undefined && (
                              <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-0.5 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center leading-none">
                                {item.badge > 99 ? '99+' : item.badge}
                              </span>
                            )}
                          </button>
                        </Link>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>{'tooltip' in item && item.tooltip ? item.tooltip : item.label}{item.path === '/hr' ? ' (Beta)' : ''}{('badge' in item && item.badge !== undefined) ? ` (${item.badge} gap${item.badge !== 1 ? 's' : ''})` : ''}</p>
                      </TooltipContent>
                    </Tooltip>
                  ))}
                </TooltipProvider>
              </div>

              <div className="flex items-center space-x-2 sm:space-x-3 flex-shrink-0">
                <button
                  className="lg:hidden p-2 rounded-lg hover:bg-white/10 transition-colors"
                  style={bannerTextStyle}
                  onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                  data-testid="mobile-menu-button"
                >
                  {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
                </button>

                {user && (
                  <div className="flex items-center space-x-1 sm:space-x-2">
                    <Link href="/profile">
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div className="flex items-center space-x-1 max-w-[80px] sm:max-w-[140px] cursor-pointer hover:opacity-80 transition-opacity">
                              <User size={14} className="flex-shrink-0 opacity-70" style={bannerTextStyle} />
                              <span className="text-xs sm:text-sm font-medium truncate" style={bannerTextStyle}>
                                {user.firstName && user.lastName
                                  ? `${user.firstName} ${user.lastName}`
                                  : user.username}
                              </span>
                            </div>
                          </TooltipTrigger>
                          {user.firstName && user.lastName && (
                            <TooltipContent><p>{user.username}</p></TooltipContent>
                          )}
                        </Tooltip>
                      </TooltipProvider>
                    </Link>
                    <LogoutButton bannerInvert={navInvert} />
                  </div>
                )}
              </div>
            </div>
          </nav>

          {/* Classic mobile overlay menu */}
          {mobileMenuOpen && (
            <>
              <div
                className="lg:hidden fixed inset-0 bg-black/40 z-40"
                onClick={() => setMobileMenuOpen(false)}
                data-testid="mobile-menu-backdrop"
              />
              <div className="lg:hidden fixed top-[72px] sm:top-[88px] left-0 right-0 z-50 shadow-xl max-h-[calc(100vh-72px)] sm:max-h-[calc(100vh-88px)] overflow-y-auto" style={{ background: 'var(--background)' }}>
                <div className="px-3 py-2 space-y-1">
                  {navItems.map((item) => (
                    <Link key={item.path} href={item.path}>
                      <button
                        className={`w-full text-left px-3 py-2.5 rounded-lg font-medium transition-colors flex items-center space-x-3 text-sm ${
                          location === item.path ? 'bg-white/20 shadow-sm' : 'text-fixed hover:bg-white/10'
                        }`}
                        style={location === item.path ? { color: 'var(--primary)' } : {}}
                        onClick={() => setMobileMenuOpen(false)}
                        data-testid={`mobile-nav-${item.label.toLowerCase().replace(' ', '-')}`}
                      >
                        <item.icon size={16} />
                        <span className="truncate flex-1">
                          {item.label}
                          {item.path === '/hr' && (
                            <span className="ml-1 text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-medium">β</span>
                          )}
                        </span>
                        {'badge' in item && item.badge !== undefined && (
                          <span className="ml-auto min-w-[20px] h-5 px-1 bg-red-500 text-white text-xs font-bold rounded-full flex items-center justify-center leading-none flex-shrink-0">
                            {item.badge > 99 ? '99+' : item.badge}
                          </span>
                        )}
                      </button>
                    </Link>
                  ))}
                  <div className="border-t border-border/40 pt-1 mt-1">
                    <Link href="/profile">
                      <button
                        className={`w-full text-left px-3 py-2.5 rounded-lg font-medium transition-colors flex items-center space-x-3 text-sm ${
                          location === '/profile' ? 'bg-white/20 shadow-sm' : 'text-fixed hover:bg-white/10'
                        }`}
                        style={location === '/profile' ? { color: 'var(--primary)' } : {}}
                        onClick={() => setMobileMenuOpen(false)}
                      >
                        <User size={16} />
                        <span className="truncate">My Profile</span>
                      </button>
                    </Link>
                  </div>
                </div>
              </div>
            </>
          )}
        </>
      )}

      {/* ── SIDEBAR MODE — mobile menu button (top-right FAB) ── */}
      {navStyle === "sidebar" && isMobile && !sidebarMobileOpen && (
        <button
          className="fixed top-3 left-3 z-40 p-2 rounded-lg glass-effect shadow-md hover:bg-white/20 transition-colors"
          onClick={() => setSidebarMobileOpen(true)}
          aria-label="Open navigation"
        >
          <Menu size={20} />
        </button>
      )}

      {/* ── MAIN CONTENT ── */}
      <div
        className="pb-24 sm:pb-8 px-3 sm:px-6 transition-all duration-200"
        style={{
          paddingTop: navStyle === "sidebar" ? (isMobile ? "56px" : "24px") : undefined,
          paddingLeft: navStyle === "sidebar" && !isMobile
            ? `calc(${sidebarWidth}px + 1rem)`
            : undefined,
        }}
        // Classic mode keeps Tailwind pt-20 sm:pt-28 via className below
      >
        {navStyle === "classic" && (
          <div className="pt-20 sm:pt-28">
            <div className="max-w-7xl mx-auto">
              {children}
            </div>
          </div>
        )}
        {navStyle === "sidebar" && (
          <div className="max-w-7xl mx-auto">
            {children}
          </div>
        )}
      </div>

      {/* Help System */}
      <HelpButton
        onClick={() => setIsHelpPanelOpen(!isHelpPanelOpen)}
        isHelpPanelOpen={isHelpPanelOpen}
      />
      <HelpPanel
        isOpen={isHelpPanelOpen}
        onClose={() => setIsHelpPanelOpen(false)}
      />
    </div>
  );
}
