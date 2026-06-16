import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, clearSessionToken } from "@/lib/queryClient";
import { ShieldCheck, Mail, ArrowLeft } from "lucide-react";

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
  const [step, setStep] = useState<"credentials" | "otp">("credentials");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [otpValue, setOtpValue] = useState("");
  const [pendingToken, setPendingToken] = useState("");
  const [maskedEmail, setMaskedEmail] = useState("");

  const { data: brandingData } = useQuery<{ success: boolean; branding: BrandingSettings }>({
    queryKey: ["/platform-admin/branding"],
    queryFn: async () => {
      const response = await fetch("/platform-admin/branding", { credentials: "include" });
      if (!response.ok) throw new Error("Failed to fetch branding");
      return response.json();
    },
  });

  const loginMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/platform-admin/auth/login", { username, password });
      return response.json();
    },
    onSuccess: (data) => {
      clearSessionToken();
      if (data.requiresOtp) {
        setPendingToken(data.pendingToken);
        setMaskedEmail(data.maskedEmail || "your registered email");
        setStep("otp");
      } else {
        window.location.href = "/platform-admin/dashboard";
      }
    },
    onError: (error: any) => {
      toast({ title: "Login failed", description: error.message || "Invalid username or password", variant: "destructive" });
    },
  });

  const verifyOtpMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/platform-admin/auth/verify-otp", { pendingToken, otp: otpValue });
      return response.json();
    },
    onSuccess: (data) => {
      clearSessionToken();
      toast({ title: "Verified", description: `Welcome back, ${data.admin.firstName}!` });
      window.location.href = "/platform-admin/dashboard";
    },
    onError: (error: any) => {
      toast({ title: "Verification failed", description: error.message || "Invalid code", variant: "destructive" });
      setOtpValue("");
    },
  });

  const primaryColor = brandingData?.branding?.primaryColor || "#1e3a8a";
  const secondaryColor = brandingData?.branding?.secondaryColor || "#0f172a";

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4"
      style={{ background: `linear-gradient(to bottom right, ${secondaryColor}, ${primaryColor}, ${secondaryColor})` }}
    >
      <Card className="w-full max-w-md shadow-2xl">
        <CardHeader className="space-y-1 text-center">
          <div className="flex justify-center mb-4">
            {brandingData?.branding?.logoUrl ? (
              <img
                src={brandingData.branding.logoUrl.startsWith("http") || brandingData.branding.logoUrl.startsWith("/")
                  ? brandingData.branding.logoUrl
                  : `/public-objects/${brandingData.branding.logoUrl}`}
                alt={brandingData?.branding?.platformName || "Platform Admin"}
                className="h-16 object-contain"
                data-testid="img-platform-logo"
              />
            ) : (
              <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-700 flex items-center justify-center shadow-lg">
                <ShieldCheck className="w-9 h-9 text-white" />
              </div>
            )}
          </div>
          <CardTitle className="text-2xl font-bold">
            {brandingData?.branding?.platformName || "Platform Admin"}
          </CardTitle>
          <CardDescription>
            {step === "credentials" ? "Sign in to manage customer accounts" : "Enter the verification code we emailed you"}
          </CardDescription>
        </CardHeader>

        <CardContent>
          {step === "credentials" ? (
            <form onSubmit={(e) => { e.preventDefault(); loginMutation.mutate(); }} className="space-y-4">
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
              <Button type="submit" data-testid="button-login" className="w-full" disabled={loginMutation.isPending}>
                {loginMutation.isPending ? "Checking credentials…" : "Continue"}
              </Button>
            </form>
          ) : (
            <div className="space-y-4">
              <div className="flex items-start gap-3 p-3 bg-blue-50 rounded-lg text-sm text-blue-800">
                <Mail className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <span>A 6-digit code was sent to <strong>{maskedEmail}</strong>. Enter it below to complete sign-in.</span>
              </div>
              <form onSubmit={(e) => { e.preventDefault(); verifyOtpMutation.mutate(); }} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="otp">Verification Code</Label>
                  <Input
                    id="otp"
                    data-testid="input-otp"
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]{6}"
                    maxLength={6}
                    placeholder="6-digit code"
                    value={otpValue}
                    onChange={(e) => setOtpValue(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    required
                    autoFocus
                    className="text-center text-2xl tracking-widest font-mono"
                  />
                  <p className="text-xs text-muted-foreground text-center">Code expires in 10 minutes</p>
                </div>
                <Button type="submit" className="w-full" disabled={verifyOtpMutation.isPending || otpValue.length < 6}>
                  {verifyOtpMutation.isPending ? "Verifying…" : "Verify & Sign In"}
                </Button>
              </form>
              <button
                type="button"
                className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mx-auto"
                onClick={() => { setStep("credentials"); setOtpValue(""); setPendingToken(""); }}
              >
                <ArrowLeft className="w-3 h-3" /> Back to login
              </button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
