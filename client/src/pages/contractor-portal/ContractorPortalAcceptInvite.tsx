import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Building2, Lock, User, Loader2, CheckCircle, Copy, Check } from "lucide-react";

export default function ContractorPortalAcceptInvite() {
  const [, navigate] = useLocation();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [prefillLoading, setPrefillLoading] = useState(true);
  const [logoUrl, setLogoUrl] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [email, setEmail] = useState("");
  const [copied, setCopied] = useState(false);

  const params = new URLSearchParams(window.location.search);
  const inviteToken = params.get("token") ?? "";
  const customerId = params.get("cid") ?? "";

  useEffect(() => {
    if (!inviteToken || !customerId) {
      setError("Invalid or missing invitation link. Please use the link from your email.");
      setPrefillLoading(false);
      return;
    }
    fetch(`/api/contractor-portal/invite-info?token=${encodeURIComponent(inviteToken)}&cid=${encodeURIComponent(customerId)}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) {
          setError(data.error);
        } else {
          if (data.firstName) setFirstName(data.firstName);
          if (data.lastName)  setLastName(data.lastName);
          if (data.logoUrl)   setLogoUrl(data.logoUrl);
          if (data.companyName) setCompanyName(data.companyName);
          if (data.email)     setEmail(data.email);
        }
      })
      .catch(() => {})
      .finally(() => setPrefillLoading(false));
  }, []);

  const handleCopy = () => {
    navigator.clipboard.writeText(customerId).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

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
      const res = await fetch("/api/contractor-portal/accept-invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inviteToken, customerId, firstName, lastName, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to accept invitation.");
        return;
      }
      localStorage.setItem("portal_token", data.token);
      localStorage.setItem("portal_customer_id", customerId);
      localStorage.setItem("portal_user", JSON.stringify(data.user));
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
                <h2 className="text-xl font-bold text-slate-900">Account created!</h2>
                <p className="text-slate-500 text-sm mt-1">
                  A confirmation email with your login details has been sent to <strong>{email}</strong>.
                </p>
              </div>

              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-left space-y-3">
                <div>
                  <p className="text-xs text-slate-500 font-medium mb-1">Your login email</p>
                  <p className="text-sm font-mono text-slate-800 break-all">{email}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 font-medium mb-1">Company access code</p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 text-sm font-mono text-slate-800 break-all">{customerId}</code>
                    <Button size="sm" variant="outline" onClick={handleCopy} className="shrink-0">
                      {copied ? <Check className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5" />}
                    </Button>
                  </div>
                </div>
                <p className="text-xs text-slate-400">
                  You'll need your email, your password, and this access code each time you sign in.
                </p>
              </div>

              <Button
                className="w-full bg-blue-600 hover:bg-blue-700"
                onClick={() => navigate("/contractor-portal/dashboard")}
              >
                Go to portal
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
          <h1 className="text-2xl font-bold text-white">Accept Invitation</h1>
          <p className="text-slate-400 text-sm mt-1">
            {companyName ? `Set up your account for ${companyName}` : "Set up your contractor portal account"}
          </p>
        </div>

        <Card className="border-0 shadow-2xl">
          <CardHeader className="pb-4">
            <CardTitle className="text-lg">Create your account</CardTitle>
            <CardDescription>Enter your details to activate the portal</CardDescription>
          </CardHeader>
          <CardContent>
            {prefillLoading ? (
              <div className="flex items-center justify-center py-8 text-slate-500">
                <Loader2 className="h-5 w-5 animate-spin mr-2" />
                Loading invite details…
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                {error && (
                  <Alert variant="destructive">
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="firstName">First name</Label>
                    <div className="relative">
                      <User className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                      <Input
                        id="firstName"
                        placeholder="First"
                        value={firstName}
                        onChange={(e) => setFirstName(e.target.value)}
                        className="pl-9"
                        required
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="lastName">Last name</Label>
                    <Input
                      id="lastName"
                      placeholder="Last"
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      required
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="password">Password</Label>
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
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="confirmPassword">Confirm password</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                    <Input
                      id="confirmPassword"
                      type="password"
                      placeholder="Repeat your password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className="pl-9"
                      required
                    />
                  </div>
                </div>

                <Button
                  type="submit"
                  className="w-full bg-blue-600 hover:bg-blue-700"
                  disabled={loading || !inviteToken}
                >
                  {loading ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Setting up account...
                    </>
                  ) : (
                    "Activate account"
                  )}
                </Button>
              </form>
            )}

            <p className="text-center text-sm text-slate-500 mt-4">
              Already have an account?{" "}
              <a href="/contractor-portal/login" className="text-blue-600 hover:underline font-medium">
                Sign in
              </a>
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
