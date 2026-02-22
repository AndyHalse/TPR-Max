import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Lock, User, LogIn, Building, ArrowRight, Sparkles, Shield, Zap, ShieldCheck } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Link } from "wouter";

function hexToHsl(hex: string): string | null {
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
}

function applyBrandingFromSettings(settings: any) {
  const root = document.documentElement;
  
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
      if (luminance >= 0.5) {
        root.style.setProperty('--card', `hsl(${hsl})`);
        root.style.setProperty('--glass-bg', 'rgba(255, 255, 255, 0.25)');
        root.style.setProperty('--glass-border', 'rgba(255, 255, 255, 0.18)');
        root.style.setProperty('--glass-hover', 'rgba(255, 255, 255, 0.35)');
      }
    }
  }
  
  if (settings.foregroundColor) {
    const hsl = hexToHsl(settings.foregroundColor);
    if (hsl) {
      root.style.setProperty('--foreground', `hsl(${hsl})`);
      root.style.setProperty('--card-foreground', `hsl(${hsl})`);
      root.style.setProperty('--fixed-text', `hsl(${hsl})`);
    }
  }
  
  if (settings.variableTextColor) {
    const hsl = hexToHsl(settings.variableTextColor);
    if (hsl) {
      root.style.setProperty('--variable-text', `hsl(${hsl})`);
    }
  }
  
  if (settings.accentColor) {
    const hsl = hexToHsl(settings.accentColor);
    if (hsl) {
      root.style.setProperty('--primary', `hsl(${hsl})`);
      root.style.setProperty('--accent', `hsl(${hsl})`);
      root.style.setProperty('--ring', `hsl(${hsl})`);
    }
  }
  console.log(`[BRANDING] Applied branding directly from login response - bg=${settings.backgroundColor}, accent=${settings.accentColor}, varText=${settings.variableTextColor}`);
}

export default function Login() {
  const [, setLocation] = useLocation();
  
  const loadStoredCredentials = () => {
    try {
      const storedCredentials = localStorage.getItem('tprmax-last-login');
      if (storedCredentials) {
        const parsed = JSON.parse(storedCredentials);
        return {
          companyName: parsed.companyName || "",
          username: parsed.username || ""
        };
      }
    } catch (error) {
      console.warn('Failed to load stored credentials:', error);
    }
    return {
      companyName: "",
      username: ""
    };
  };
  
  const [credentials, setCredentials] = useState(() => {
    const stored = loadStoredCredentials();
    return {
      companyName: stored.companyName,
      username: stored.username,
      password: "" // Always start with empty password for security
    };
  });
  const [error, setError] = useState("");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [isLoading, setIsLoading] = useState(false);


  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    
    // Starting authentication process...
    
    if (!credentials.companyName || !credentials.username || !credentials.password) {
      // Missing required fields
      setError("Please enter company name, username, and password");
      return;
    }
    
    // Authenticating user...
    setIsLoading(true);
    
    // Direct fetch approach to bypass any mutation issues
    try {
      // Making authentication request...
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(credentials),
        credentials: "include",
      });
      
      const data = await response.json();
      
      if (response.ok && data.success) {
        // Authentication successful
        
        try {
          localStorage.setItem('tprmax-last-login', JSON.stringify({
            companyName: credentials.companyName,
            username: credentials.username
          }));
        } catch (error) {
          console.warn('Failed to save login to localStorage:', error);
        }
        
        toast({
          title: "Login Successful",
          description: `Welcome back, ${data.user.username} at ${data.customer?.companyName || credentials.companyName}!`,
        });
        
        // Store logo token for public logo endpoint (scoped, signed, no auth needed)
        if (data.logoToken) {
          localStorage.setItem('tprmax-logo-token', data.logoToken);
        }
        
        // Set the auth data in cache first
        queryClient.setQueryData(["/api/auth/me"], data.user);
        
        // Pre-seed the settings cache from login response for immediate branding
        // Mark this data as fresh so refetchOnMount won't override it
        if (data.settings) {
          queryClient.setQueryData(["/api/settings"], data.settings);
        }
        
        // Apply branding CSS custom properties IMMEDIATELY from login response
        // This ensures branding is visible the instant the dashboard renders,
        // regardless of any subsequent query refetch behavior
        if (data.settings) {
          applyBrandingFromSettings(data.settings);
        }
        
        // Invalidate data queries to ensure fresh data, but NOT settings or auth
        // Settings are already seeded from the login response and shouldn't be refetched
        // immediately (avoids race condition where session isn't persisted yet)
        await queryClient.invalidateQueries({
          predicate: (query) => {
            const key = query.queryKey[0] as string;
            return key !== "/api/settings" && key !== "/api/auth/me";
          }
        });
        
        // Redirecting to dashboard...
        setLocation("/");
      } else {
        // Authentication failed
        setError(data.error || "Login failed");
        toast({
          title: "Login Failed",
          description: data.error || "Invalid credentials",
          variant: "destructive",
        });
      }
    } catch (error) {
      // Network error occurred
      setError("Network error occurred");
      toast({
        title: "Login Failed",
        description: "Network error occurred",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-white to-indigo-50 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900 p-4">
      <Card className="w-full max-w-md bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm border-2 border-blue-200 dark:border-blue-800 shadow-2xl">
        <CardHeader className="text-center space-y-4">
          <div className="mx-auto w-16 h-16 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-700 flex items-center justify-center shadow-lg">
            <ShieldCheck className="w-9 h-9 text-white" />
          </div>
          <div>
            <CardTitle className="text-2xl font-bold text-slate-800 dark:text-slate-200">
              TPR Max
            </CardTitle>
            <CardDescription className="text-slate-600 dark:text-slate-400">
              Visitor Management System
            </CardDescription>
          </div>
        </CardHeader>
        
        <CardContent className="space-y-6">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="companyName" className="text-slate-700 dark:text-slate-300">
                Company Name
              </Label>
              <div className="relative">
                <Building className="absolute left-3 top-3 text-slate-400" size={18} />
                <Input
                  id="companyName"
                  type="text"
                  placeholder="Enter your company name"
                  className="pl-10 bg-white/70 dark:bg-slate-700/70 border-slate-300 dark:border-slate-600"
                  value={credentials.companyName}
                  onChange={(e) => setCredentials(prev => ({ ...prev, companyName: e.target.value }))}
                  data-testid="input-company-name"
                  disabled={isLoading}
                  autoFocus
                  autoComplete="organization"
                />
              </div>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="username" className="text-slate-700 dark:text-slate-300">
                Username
              </Label>
              <div className="relative">
                <User className="absolute left-3 top-3 text-slate-400" size={18} />
                <Input
                  id="username"
                  type="text"
                  placeholder="Enter your username"
                  className="pl-10 bg-white/70 dark:bg-slate-700/70 border-slate-300 dark:border-slate-600"
                  value={credentials.username}
                  onChange={(e) => setCredentials(prev => ({ ...prev, username: e.target.value }))}
                  data-testid="input-username"
                  disabled={isLoading}
                />
              </div>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="password" className="text-slate-700 dark:text-slate-300">
                Password
              </Label>
              <div className="relative">
                <Lock className="absolute left-3 top-3 text-slate-400" size={18} />
                <Input
                  id="password"
                  type="password"
                  placeholder="Enter your password"
                  className="pl-10 bg-white/70 dark:bg-slate-700/70 border-slate-300 dark:border-slate-600"
                  value={credentials.password}
                  onChange={(e) => setCredentials(prev => ({ ...prev, password: e.target.value }))}
                  data-testid="input-password"
                  disabled={isLoading}
                />
              </div>
            </div>
            
            <Button
              type="submit"
              className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-semibold py-3"
              disabled={isLoading}
              data-testid="button-login"
            >
              {isLoading ? (
                "Signing in..."
              ) : (
                <>
                  <LogIn className="mr-2" size={18} />
                  Sign In
                </>
              )}
            </Button>
          </form>
          
          
          <div className="text-center">
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Secure access • TPR Max
            </p>
            <a href="https://www.acsltd.eu" target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300">
              www.acsltd.eu
            </a>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}