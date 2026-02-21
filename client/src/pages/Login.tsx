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
        
        // Pre-seed the settings cache from login response for immediate branding
        if (data.settings) {
          queryClient.setQueryData(["/api/settings"], data.settings);
        }
        
        // Set the auth data in cache AND invalidate to ensure fresh fetch
        queryClient.setQueryData(["/api/auth/me"], data.user);
        
        // Invalidate ALL queries to ensure fresh data after login (prevents stale cache)
        await queryClient.invalidateQueries();
        
        // Re-seed settings and auth after invalidation to ensure immediate availability
        if (data.settings) {
          queryClient.setQueryData(["/api/settings"], data.settings);
        }
        queryClient.setQueryData(["/api/auth/me"], data.user);
        
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