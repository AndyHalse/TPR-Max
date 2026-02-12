import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Shield } from "lucide-react";
import acsLogoPath from "@assets/acs-logo-2460A9-200px.jpg";

interface BrandingSettings {
  id: string;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  logoUrl: string | null;
  platformName: string;
  companyName: string;
}

export default function PlatformAdminLogin() {
  const { toast } = useToast();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  // Fetch branding settings to display logo
  const { data: brandingData } = useQuery<{ success: boolean; branding: BrandingSettings }>({
    queryKey: ["/platform-admin/branding"],
    queryFn: async () => {
      const response = await fetch("/platform-admin/branding", {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to fetch branding");
      return response.json();
    },
  });

  const loginMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/platform-admin/auth/login", {
        username,
        password,
      });
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Login successful",
        description: `Welcome back, ${data.admin.firstName}!`,
      });
      window.location.href = "/platform-admin/dashboard";
    },
    onError: (error: any) => {
      toast({
        title: "Login failed",
        description: error.message || "Invalid username or password",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !password) {
      toast({
        title: "Error",
        description: "Please enter both username and password",
        variant: "destructive",
      });
      return;
    }
    loginMutation.mutate();
  };

  const primaryColor = brandingData?.branding?.primaryColor || '#1e3a8a';
  const secondaryColor = brandingData?.branding?.secondaryColor || '#0f172a';

  return (
    <div 
      className="min-h-screen flex items-center justify-center p-4"
      style={{
        background: `linear-gradient(to bottom right, ${secondaryColor}, ${primaryColor}, ${secondaryColor})`
      }}
    >
      <Card className="w-full max-w-md shadow-2xl">
        <CardHeader className="space-y-1 text-center">
          <div className="flex justify-center mb-4">
            <img 
              src={brandingData?.branding?.logoUrl 
                ? (brandingData.branding.logoUrl.startsWith('http') || brandingData.branding.logoUrl.startsWith('/') 
                  ? brandingData.branding.logoUrl 
                  : `/public-objects/${brandingData.branding.logoUrl}`)
                : acsLogoPath
              } 
              alt={brandingData?.branding?.platformName || "ACS Platform Admin"} 
              className="h-16 object-contain"
              data-testid="img-platform-logo"
            />
          </div>
          <CardTitle className="text-2xl font-bold">
            {brandingData?.branding?.platformName || "Platform Admin"}
          </CardTitle>
          <CardDescription>
            Sign in to manage customer accounts
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="username">Username</Label>
              <Input
                id="username"
                data-testid="input-username"
                type="text"
                placeholder="Enter your username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                data-testid="input-password"
                type="password"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            <Button
              type="submit"
              data-testid="button-login"
              className="w-full"
              disabled={loginMutation.isPending}
            >
              {loginMutation.isPending ? "Signing in..." : "Sign In"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
