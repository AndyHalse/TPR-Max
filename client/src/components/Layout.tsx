import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { IdCard, ChartLine, Users, Dock, ListChecks, User, Settings, FileText, CalendarPlus, Brain, Clock, Menu, X, HardHat } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import LogoutButton from "@/components/LogoutButton";
import type { CompanySettings } from "@shared/schema";
import { useState, useEffect } from "react";

interface LayoutProps {
  children: React.ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  const [location] = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  
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
    if (settings?.backgroundColor || settings?.textColor || settings?.accentColor) {
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
          root.style.setProperty('--card', `hsl(${hsl})`);
          root.style.setProperty('--popover', `hsl(${hsl})`);
        }
      }

      // Apply text color
      if (settings.textColor) {
        const hsl = hexToHsl(settings.textColor);
        if (hsl) {
          root.style.setProperty('--foreground', `hsl(${hsl})`);
          root.style.setProperty('--card-foreground', `hsl(${hsl})`);
          root.style.setProperty('--popover-foreground', `hsl(${hsl})`);
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
  }, [settings?.backgroundColor, settings?.textColor, settings?.accentColor]);

  const navItems = [
    { path: "/", icon: ChartLine, label: "Dashboard" },
    { path: "/visitors", icon: User, label: "Visitors" },
    { path: "/contractors", icon: HardHat, label: "Contractors" },
    { path: "/contractor", icon: CalendarPlus, label: "Contractor In/Out" },
    { path: "/staff", icon: Users, label: "Staff" },
    { path: "/time-attendance", icon: Clock, label: "T&A Report" },
    { path: "/muster", icon: ListChecks, label: "Muster List" },
    { path: "/reports", icon: FileText, label: "Reports" },
    { path: "/kiosk", icon: Dock, label: "Kiosk Mode" },
    { path: "/ai-demo", icon: Brain, label: "AI Demo" },
    { path: "/settings", icon: Settings, label: "Settings" },
  ];

  return (
    <div className="min-h-screen">
      {/* Navigation */}
      <nav className="glass-effect fixed top-0 left-0 right-0 z-50 px-4 sm:px-6 py-3">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center space-x-3 min-w-0 flex-shrink-0">
            <div className="w-10 h-10 gradient-blue rounded-xl flex items-center justify-center flex-shrink-0">
              {settings?.logoUrl ? (
                <img 
                  src={`/objects${settings.logoUrl}`}
                  alt="Company Logo" 
                  className="w-8 h-8 object-contain rounded"
                  onError={(e) => {
                    e.currentTarget.style.display = 'none';
                    e.currentTarget.nextElementSibling?.setAttribute('style', 'display: block');
                  }}
                />
              ) : null}
              <IdCard className="text-white" size={20} style={settings?.logoUrl ? {display: 'none'} : {}} />
            </div>
            <div className="min-w-0">
              <h1 className="text-lg sm:text-xl font-bold text-slate-800 truncate">{settings?.companyName || "VisiGate Pro"}</h1>
              <p className="text-xs text-slate-600 hidden sm:block">Visitor Management</p>
            </div>
          </div>
          
          <div className="hidden lg:flex items-center space-x-1 flex-1 justify-center">
            <TooltipProvider>
              {navItems.map((item) => (
                <Tooltip key={item.path}>
                  <TooltipTrigger asChild>
                    <Link href={item.path}>
                      <button 
                        className={`nav-btn p-3 rounded-lg transition-colors ${
                          location === item.path 
                            ? 'bg-white text-blue-600 shadow-sm' 
                            : 'text-slate-700 hover:text-blue-600 hover:bg-white/50'
                        }`}
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
              className="lg:hidden p-2 rounded-lg text-slate-700 hover:bg-white/50 transition-colors"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              data-testid="mobile-menu-button"
            >
              {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
            
            {user && (
              <div className="flex items-center space-x-2">
                <div className="glass-effect px-2 sm:px-3 py-1 rounded-full flex items-center space-x-1 sm:space-x-2">
                  <User className="text-slate-600" size={14} />
                  <span className="text-xs sm:text-sm text-slate-700 font-medium">{user.username}</span>
                </div>
                <LogoutButton />
              </div>
            )}
          </div>
        </div>
        
        {/* Mobile Navigation Menu */}
        {mobileMenuOpen && (
          <div className="lg:hidden absolute top-full left-0 right-0 glass-effect border-t border-white/30">
            <div className="px-4 py-3 space-y-2">
              {navItems.map((item) => (
                <Link key={item.path} href={item.path}>
                  <button 
                    className={`w-full text-left px-4 py-3 rounded-lg font-medium transition-colors flex items-center space-x-3 ${
                      location === item.path 
                        ? 'bg-white text-blue-600 shadow-sm' 
                        : 'text-slate-700 hover:bg-white/30'
                    }`}
                    onClick={() => setMobileMenuOpen(false)}
                    data-testid={`mobile-nav-${item.label.toLowerCase().replace(' ', '-')}`}
                  >
                    <item.icon size={18} />
                    <span>{item.label}</span>
                  </button>
                </Link>
              ))}
            </div>
          </div>
        )}
      </nav>

      {/* Main Content */}
      <div className="pt-24 pb-8 px-6">
        <div className="max-w-7xl mx-auto">
          {children}
        </div>
      </div>
    </div>
  );
}
