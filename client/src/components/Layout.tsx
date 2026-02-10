import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { IdCard, ChartLine, Users, Dock, ListChecks, User, Settings, FileText, CalendarPlus, Calendar, Brain, Clock, Menu, X, HardHat, Video, Building2 } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import LogoutButton from "@/components/LogoutButton";
import HelpButton from "@/components/HelpButton";
import HelpPanel from "@/components/HelpPanel";
import type { CompanySettings } from "@shared/schema";
import { useState, useEffect } from "react";

interface LayoutProps {
  children: React.ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  const [location] = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isHelpPanelOpen, setIsHelpPanelOpen] = useState(false);
  
  // Get current user info
  const { data: user } = useQuery<{ id: string; username: string }>({
    queryKey: ["/api/auth/me"],
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // Get company settings for branding
  const { data: settings } = useQuery<CompanySettings>({
    queryKey: ["/api/settings"],
    staleTime: 10 * 60 * 1000, // 10 minutes
  });

  // Apply branding colors dynamically
  useEffect(() => {
    if (settings?.backgroundColor || settings?.foregroundColor || settings?.accentColor) {
      const root = document.documentElement;
      
      // Convert hex to HSL for CSS variables
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

      // Apply background color
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
            if (cardHsl) {
              root.style.setProperty('--card', `hsl(${cardHsl})`);
            }
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
            root.style.setProperty('--glass-bg', `rgba(255, 255, 255, 0.25)`);
            root.style.setProperty('--glass-border', `rgba(255, 255, 255, 0.18)`);
            root.style.setProperty('--glass-hover', `rgba(255, 255, 255, 0.35)`);
          }
        }
      }

      // Apply fixed text color (labels, headings, static elements)
      if (settings.foregroundColor) {
        const hsl = hexToHsl(settings.foregroundColor);
        if (hsl) {
          root.style.setProperty('--foreground', `hsl(${hsl})`);
          root.style.setProperty('--card-foreground', `hsl(${hsl})`);
          root.style.setProperty('--popover-foreground', `hsl(${hsl})`);
          root.style.setProperty('--secondary-foreground', `hsl(${hsl})`);
          root.style.setProperty('--muted-foreground', `hsl(${hsl})`);
          root.style.setProperty('--accent-foreground', `hsl(${hsl})`);
          // Fixed text color for labels and headings
          root.style.setProperty('--fixed-text', `hsl(${hsl})`);
        }
      }

      // Apply variable text color (data values, content, dynamic information)
      if (settings.variableTextColor) {
        const hsl = hexToHsl(settings.variableTextColor);
        if (hsl) {
          // Variable text color for data values and content
          root.style.setProperty('--variable-text', `hsl(${hsl})`);
        }
      }

      // Apply accent color
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

  const allNavItems = [
    { path: "/", icon: ChartLine, label: "Dashboard", alwaysVisible: true },
    { path: "/visitors", icon: User, label: "Visitors", alwaysVisible: true },
    { path: "/contractors", icon: HardHat, label: "Contractors", alwaysVisible: true },
    { path: "/contractor", icon: CalendarPlus, label: "Contractor In/Out", featureKey: "featureContractorPage" },
    { path: "/staff", icon: Users, label: "Staff", alwaysVisible: true },
    { path: "/meeting-rooms", icon: Calendar, label: "Meeting Rooms", featureKey: "featureMeetingRooms" },
    { path: "/time-attendance", icon: Clock, label: "T&A Report", featureKey: "featureTimeAttendance" },
    { path: "/muster", icon: ListChecks, label: "Muster List", alwaysVisible: true },
    { path: "/reports", icon: FileText, label: "Reports", alwaysVisible: true },
    { path: "/induction-settings", icon: Video, label: "Induction Settings", featureKey: "featureInductionSettings" },
    { path: "/kiosk", icon: Dock, label: "Kiosk Mode", featureKey: "featureKiosk" },
    { path: "/ai-demo", icon: Brain, label: "AI Demo", featureKey: "featureAiDemo" },
    { path: "/settings", icon: Settings, label: "Settings", alwaysVisible: true },
  ];

  // Filter navigation items based on feature toggles
  const navItems = allNavItems.filter(item => {
    // Always show items marked as alwaysVisible
    if (item.alwaysVisible) return true;
    
    // For items with feature toggles, check if the feature is enabled
    if (item.featureKey && settings) {
      return settings[item.featureKey as keyof CompanySettings] !== false;
    }
    
    // If no settings loaded yet, show all items (avoid hiding during loading)
    return !settings || true;
  });

  return (
    <div className="min-h-screen">
      {/* Navigation */}
      <nav className="glass-effect fixed top-0 left-0 right-0 z-50 px-4 sm:px-6 py-3">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <Link href="/marketing">
            <div className="flex items-center space-x-3 min-w-0 flex-shrink-0 cursor-pointer hover:opacity-80 transition-opacity">
              <div className="w-16 h-16 rounded-xl flex items-center justify-center flex-shrink-0">
                {settings?.logoUrl ? (
                  <img 
                    src={`/objects${settings.logoUrl}`}
                    alt="Company Logo" 
                    className="w-15 h-15 object-contain rounded"
                    onError={(e) => {
                      e.currentTarget.style.display = 'none';
                      e.currentTarget.nextElementSibling?.setAttribute('style', 'display: block');
                    }}
                  />
                ) : null}
                <IdCard className="text-white" size={20} style={settings?.logoUrl ? {display: 'none'} : {}} />
              </div>
              <div className="min-w-0">
                <h1 className="text-lg sm:text-xl font-bold text-fixed truncate">{settings?.companyName || "VisiGate Pro"}</h1>
                <p className="text-xs text-variable hidden sm:block">TPR Max</p>
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
                        className={`nav-btn p-3 rounded-lg transition-colors ${
                          location === item.path 
                            ? 'bg-white/20 shadow-sm' 
                            : 'text-fixed hover:bg-white/10'
                        }`}
                        style={location === item.path ? { color: 'var(--primary)' } : {}}
                        data-testid={`nav-${item.label.toLowerCase().replace(/\s+/g, '-')}`}
                      >
                        <item.icon size={21} />
                      </button>
                    </Link>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>{item.label}</p>
                  </TooltipContent>
                </Tooltip>
              ))}
            </TooltipProvider>
          </div>
          
          <div className="flex items-center space-x-2 sm:space-x-3 flex-shrink-0">
            {/* Mobile menu button */}
            <button
              className="lg:hidden p-2 rounded-lg text-fixed hover:bg-white/10 transition-colors"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              data-testid="mobile-menu-button"
            >
              {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
            
            {user && (
              <div className="flex items-center space-x-2">
                <div className="glass-effect px-2 sm:px-3 py-1 rounded-full flex items-center space-x-1 sm:space-x-2">
                  <User className="text-variable" size={14} />
                  <span className="text-xs sm:text-sm text-fixed font-medium">{user.username}</span>
                </div>
                <LogoutButton />
              </div>
            )}
          </div>
        </div>
        
      </nav>

      {/* Mobile Navigation Menu - Fixed Overlay */}
      {mobileMenuOpen && (
        <>
          {/* Backdrop */}
          <div 
            className="lg:hidden fixed inset-0 bg-black/40 z-40"
            onClick={() => setMobileMenuOpen(false)}
            data-testid="mobile-menu-backdrop"
          />
          
          {/* Menu Panel */}
          <div className="lg:hidden fixed top-[88px] left-0 right-0 z-50 shadow-xl max-h-[calc(100vh-88px)] overflow-y-auto" style={{ background: 'var(--background)' }}>
            <div className="px-3 py-2 space-y-1">
              {navItems.map((item) => (
                <Link key={item.path} href={item.path}>
                  <button 
                    className={`w-full text-left px-3 py-2.5 rounded-lg font-medium transition-colors flex items-center space-x-3 text-sm ${
                      location === item.path 
                        ? 'bg-white/20 shadow-sm' 
                        : 'text-fixed hover:bg-white/10'
                    }`}
                    style={location === item.path ? { color: 'var(--primary)' } : {}}
                    onClick={() => setMobileMenuOpen(false)}
                    data-testid={`mobile-nav-${item.label.toLowerCase().replace(' ', '-')}`}
                  >
                    <item.icon size={16} />
                    <span className="truncate">{item.label}</span>
                  </button>
                </Link>
              ))}
            </div>
          </div>
        </>
      )}

      {/* Main Content */}
      <div className="pt-24 pb-8 px-6">
        <div className="max-w-7xl mx-auto">
          {children}
        </div>
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
