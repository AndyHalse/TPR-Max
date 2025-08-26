import { useState } from "react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Lock, User, LogIn } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function Login() {
  const [, setLocation] = useLocation();
  const [credentials, setCredentials] = useState({ username: "Andy", password: "Kubo1966&&" });
  const [error, setError] = useState("");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    
    console.log("🔍 Login form submitted with:", credentials);
    
    if (!credentials.username || !credentials.password) {
      console.log("❌ Missing credentials");
      setError("Please enter both username and password");
      return;
    }
    
    console.log("✅ Starting direct login...");
    setIsLoading(true);
    
    // Direct fetch approach to bypass any mutation issues
    try {
      console.log("🚀 Making direct fetch request...");
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(credentials),
        credentials: "include",
      });
      
      console.log("📥 Response status:", response.status);
      const data = await response.json();
      console.log("📥 Response data:", data);
      
      if (response.ok && data.success) {
        console.log("🎉 Login successful!");
        toast({
          title: "Login Successful",
          description: `Welcome back, ${data.user.username}!`,
        });
        // Force a complete page refresh to reload authentication state
        console.log("🔄 Forcing page refresh...");
        window.location.href = "/";
      } else {
        console.log("❌ Login failed:", data);
        setError(data.error || "Login failed");
        toast({
          title: "Login Failed",
          description: data.error || "Invalid credentials",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.log("💥 Network error:", error);
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
          <div className="mx-auto w-16 h-16 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-full flex items-center justify-center">
            <Lock className="text-white" size={32} />
          </div>
          <div>
            <CardTitle className="text-2xl font-bold text-slate-800 dark:text-slate-200">
              VisiGate Pro
            </CardTitle>
            <CardDescription className="text-slate-600 dark:text-slate-400">
              Developer Access Portal
            </CardDescription>
          </div>
        </CardHeader>
        
        <CardContent className="space-y-6">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          
          <form onSubmit={(e) => {
            console.log("📋 Form onSubmit triggered");
            handleSubmit(e);
          }} className="space-y-4">
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
                  autoFocus
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
              onClick={(e) => {
                console.log("🖱️ Button clicked!");
                // Let the form handle submission normally
              }}
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
              Secure developer access • VisiGate Pro
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}