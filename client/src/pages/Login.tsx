import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Lock, User, LogIn } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function Login() {
  const [, setLocation] = useLocation();
  const [credentials, setCredentials] = useState({ username: "", password: "" });
  const [error, setError] = useState("");
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const usernameInputRef = useRef<HTMLInputElement>(null);

  const loginMutation = useMutation({
    mutationFn: async (data: { username: string; password: string }) => {
      console.log("Making API request with data:", data);
      const response = await apiRequest("POST", "/api/auth/login", data);
      const result = await response.json();
      console.log("API response:", result);
      return result;
    },
    onSuccess: (data) => {
      console.log("Login success:", data);
      if (data.success) {
        toast({
          title: "Login Successful",
          description: `Welcome back, ${data.user.username}!`,
        });
        queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
        setLocation("/");
      }
    },
    onError: (error: Error) => {
      console.error("Login error:", error);
      setError(error.message);
      toast({
        title: "Login Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Auto-focus the username field when component mounts
  useEffect(() => {
    if (usernameInputRef.current) {
      usernameInputRef.current.focus();
    }
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    
    console.log("Form submitted with credentials:", credentials);
    
    if (!credentials.username || !credentials.password) {
      setError("Please enter both username and password");
      return;
    }
    
    console.log("Attempting login...");
    loginMutation.mutate(credentials);
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
          
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="username" className="text-slate-700 dark:text-slate-300">
                Username
              </Label>
              <div className="relative">
                <User className="absolute left-3 top-3 text-slate-400" size={18} />
                <Input
                  ref={usernameInputRef}
                  id="username"
                  type="text"
                  placeholder="Enter your username"
                  className="pl-10 bg-white/70 dark:bg-slate-700/70 border-slate-300 dark:border-slate-600"
                  value={credentials.username}
                  onChange={(e) => setCredentials(prev => ({ ...prev, username: e.target.value }))}
                  data-testid="input-username"
                  disabled={loginMutation.isPending}
                  autoComplete="username"
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
                  disabled={loginMutation.isPending}
                />
              </div>
            </div>
            
            <Button
              type="submit"
              className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-semibold py-3"
              disabled={loginMutation.isPending}
              data-testid="button-login"
            >
              {loginMutation.isPending ? (
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