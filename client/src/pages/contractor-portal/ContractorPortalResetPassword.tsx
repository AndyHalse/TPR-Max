import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Building2, Lock, Loader2, CheckCircle } from "lucide-react";

export default function ContractorPortalResetPassword() {
  const [, navigate] = useLocation();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [logoUrl, setLogoUrl] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [tokenValid, setTokenValid] = useState(true);

  const params = new URLSearchParams(window.location.search);
  const resetToken = params.get("token") ?? "";
  const customerId = params.get("cid") ?? "";

  useEffect(() => {
    if (!resetToken || !customerId) {
      setTokenValid(false);
      setError("Invalid reset link. Please request a new one.");
      return;
    }
    fetch(`/api/contractor-portal/branding?cid=${encodeURIComponent(customerId)}`)
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (data && !data.error) {
          setLogoUrl(data.logoUrl || "");
          setCompanyName(data.companyName || "");
        }
      })
      .catch(() => {});
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/contractor-portal/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resetToken, customerId, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to reset password. Please try again.");
        return;
      }
      setDone(true);
    } catch {
      setError("Network error. Please check your connection and try again.");
    } finally {
      setLoading(false);
    }
  };

  if (done) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            {logoUrl ? (
              <img src={logoUrl} alt={companyName} className="h-14 w-auto max-w-[180px] object-contain mx-auto mb-4 rounded-xl" onError={() => setLogoUrl("")} />
            ) : (
              <div className="inline-flex items-center justify-center w-14 h-14 bg-blue-600 rounded-2xl mb-4 shadow-lg">
                <Building2 className="h-7 w-7 text-white" />
              </div>
            )}
          </div>
          <Card className="border-0 shadow-2xl">
            <CardContent className="pt-8 pb-6 text-center space-y-4">
              <CheckCircle className="h-14 w-14 text-green-500 mx-auto" />
              <div>
                <h2 className="text-xl font-bold text-slate-900">Password updated!</h2>
                <p className="text-slate-500 text-sm mt-1">
                  Your password has been reset. You can now sign in with your new password.
                </p>
              </div>
              <Button
                className="w-full bg-blue-600 hover:bg-blue-700"
                onClick={() => navigate("/contractor-portal/login")}
              >
                Sign in
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          {logoUrl ? (
            <img src={logoUrl} alt={companyName || "Company logo"} className="h-14 w-auto max-w-[180px] object-contain mx-auto mb-4 rounded-xl" onError={() => setLogoUrl("")} />
          ) : (
            <div className="inline-flex items-center justify-center w-14 h-14 bg-blue-600 rounded-2xl mb-4 shadow-lg">
              <Building2 className="h-7 w-7 text-white" />
            </div>
          )}
          <h1 className="text-2xl font-bold text-white">
            {companyName || "Contractor Portal"}
          </h1>
          <p className="text-slate-400 text-sm mt-1">Set a new password</p>
        </div>

        <Card className="border-0 shadow-2xl">
          <CardHeader className="pb-4">
            <CardTitle className="text-lg">Choose a new password</CardTitle>
            <CardDescription>Enter and confirm your new password below.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              <div className="space-y-1.5">
                <Label htmlFor="password">New password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                  <Input
                    id="password"
                    type="password"
                    placeholder="At least 8 characters"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pl-9"
                    required
                    minLength={8}
                    disabled={!tokenValid}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="confirmPassword">Confirm new password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                  <Input
                    id="confirmPassword"
                    type="password"
                    placeholder="Repeat your new password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="pl-9"
                    required
                    disabled={!tokenValid}
                  />
                </div>
              </div>

              <Button
                type="submit"
                className="w-full bg-blue-600 hover:bg-blue-700"
                disabled={loading || !tokenValid}
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Updating password...
                  </>
                ) : (
                  "Set new password"
                )}
              </Button>
            </form>

            <p className="text-center text-sm text-slate-500 mt-4">
              <a href="/contractor-portal/login" className="text-blue-600 hover:underline font-medium">
                Back to sign in
              </a>
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
