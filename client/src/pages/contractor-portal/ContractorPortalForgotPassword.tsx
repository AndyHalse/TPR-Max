import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Building2, Mail, Hash, Loader2, CheckCircle, ArrowLeft } from "lucide-react";

export default function ContractorPortalForgotPassword() {
  const [email, setEmail] = useState("");
  const [customerId, setCustomerId] = useState(() => localStorage.getItem("portal_customer_id") || "");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [logoUrl, setLogoUrl] = useState("");
  const [companyName, setCompanyName] = useState("");
  const brandingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function fetchBranding(cid: string) {
    const id = cid.trim();
    if (!id) { setLogoUrl(""); setCompanyName(""); return; }
    fetch(`/api/contractor-portal/branding?cid=${encodeURIComponent(id)}`)
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (data && !data.error) {
          setLogoUrl(data.logoUrl || "");
          setCompanyName(data.companyName || "");
        } else {
          setLogoUrl("");
          setCompanyName("");
        }
      })
      .catch(() => {});
  }

  function handleCustomerIdChange(val: string) {
    setCustomerId(val);
    if (brandingTimer.current) clearTimeout(brandingTimer.current);
    brandingTimer.current = setTimeout(() => fetchBranding(val), 600);
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/contractor-portal/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), customerId: customerId.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Something went wrong. Please try again.");
        return;
      }
      setSent(true);
    } catch {
      setError("Network error. Please check your connection and try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          {logoUrl ? (
            <img
              src={logoUrl}
              alt={companyName || "Company logo"}
              className="h-14 w-auto max-w-[180px] object-contain mx-auto mb-4 rounded-xl"
              onError={() => setLogoUrl("")}
            />
          ) : (
            <div className="inline-flex items-center justify-center w-14 h-14 bg-blue-600 rounded-2xl mb-4 shadow-lg">
              <Building2 className="h-7 w-7 text-white" />
            </div>
          )}
          <h1 className="text-2xl font-bold text-white">
            {companyName || "Contractor Portal"}
          </h1>
          <p className="text-slate-400 text-sm mt-1">Reset your password</p>
        </div>

        <Card className="border-0 shadow-2xl">
          <CardHeader className="pb-4">
            <CardTitle className="text-lg">Forgot your password?</CardTitle>
            <CardDescription>
              Enter your email and company access code — we'll send you a reset link.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {sent ? (
              <div className="text-center space-y-4 py-4">
                <CheckCircle className="h-12 w-12 text-green-500 mx-auto" />
                <div>
                  <p className="font-semibold text-slate-900">Check your inbox</p>
                  <p className="text-sm text-slate-500 mt-1">
                    If an account exists for <strong>{email}</strong>, you'll receive a password reset link shortly. The link expires in 1 hour.
                  </p>
                </div>
                <a
                  href="/contractor-portal/login"
                  className="inline-flex items-center gap-1.5 text-sm text-blue-600 hover:underline font-medium"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  Back to sign in
                </a>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                {error && (
                  <Alert variant="destructive">
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}

                <div className="space-y-1.5">
                  <Label htmlFor="email">Email address</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                    <Input
                      id="email"
                      type="email"
                      placeholder="you@company.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="pl-9"
                      required
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="customerId">
                    Company access code
                    <span className="text-slate-400 font-normal ml-1 text-xs">(from your invitation email)</span>
                  </Label>
                  <div className="relative">
                    <Hash className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                    <Input
                      id="customerId"
                      type="text"
                      placeholder="Access code"
                      value={customerId}
                      onChange={(e) => handleCustomerIdChange(e.target.value)}
                      className="pl-9"
                      required
                    />
                  </div>
                </div>

                <Button type="submit" className="w-full bg-blue-600 hover:bg-blue-700" disabled={loading}>
                  {loading ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Sending reset link...
                    </>
                  ) : (
                    "Send reset link"
                  )}
                </Button>

                <p className="text-center text-sm text-slate-500">
                  <a href="/contractor-portal/login" className="text-blue-600 hover:underline font-medium inline-flex items-center gap-1">
                    <ArrowLeft className="h-3 w-3" />
                    Back to sign in
                  </a>
                </p>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
