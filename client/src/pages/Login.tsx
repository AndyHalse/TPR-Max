import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { apiRequest, setSessionToken } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Lock, User, LogIn, Building, Mail, ArrowLeft } from "lucide-react";
import acsLogo from "@/assets/acs-logo.png";
import { useToast } from "@/hooks/use-toast";
import { Checkbox } from "@/components/ui/checkbox";
import { Link } from "wouter";

function MicrosoftLogoIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 21 21" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="1" y="1" width="9" height="9" fill="#F25022"/>
      <rect x="11" y="1" width="9" height="9" fill="#7FBA00"/>
      <rect x="1" y="11" width="9" height="9" fill="#00A4EF"/>
      <rect x="11" y="11" width="9" height="9" fill="#FFB900"/>
    </svg>
  );
}

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
  console.info(`[BRANDING] Applied branding directly from login response - bg=${settings.backgroundColor}, accent=${settings.accentColor}, varText=${settings.variableTextColor}`);
}

export default function Login() {
  const [, setLocation] = useLocation();

  // Initialise rememberMe from localStorage
  const [rememberMe, setRememberMe] = useState<boolean>(() => {
    try {
      return localStorage.getItem('tprmax-remember-me') === 'true';
    } catch {
      return false;
    }
  });

  const [credentials, setCredentials] = useState(() => {
    try {
      if (localStorage.getItem('tprmax-remember-me') === 'true') {
        const stored = localStorage.getItem('tprmax-last-login');
        if (stored) {
          const parsed = JSON.parse(stored);
          return {
            companyName: parsed.companyName || "",
            username: parsed.username || "",
            password: ""
          };
        }
      }
    } catch {
      // ignore
    }
    return { companyName: "", username: "", password: "" };
  });

  const [error, setError] = useState("");
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isLoading, setIsLoading] = useState(false);

  // SSO mode detected for this company
  const [ssoMode, setSsoMode] = useState<'standard' | 'both' | 'sso_only'>('standard');
  const [ssoCheckLoading, setSsoCheckLoading] = useState(false);

  // 2FA step state
  const [step, setStep] = useState<'credentials' | 'otp'>('credentials');
  const [pendingToken, setPendingToken] = useState('');
  const [maskedEmail, setMaskedEmail] = useState('');
  const [otpValue, setOtpValue] = useState('');
  const [otpError, setOtpError] = useState('');

  // Handle URL error params from SSO callback redirect
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlError = params.get('error');
    if (urlError === 'sso_no_account') {
      setError('No TPR account found for your Microsoft identity. Contact your site administrator.');
    } else if (urlError === 'sso_failed') {
      setError('Microsoft sign-in failed. Please try again or use your username and password.');
    }
  }, []);

  const handleCompanyBlur = async () => {
    const name = credentials.companyName.trim();
    if (!name) return;
    setSsoCheckLoading(true);
    try {
      const res = await fetch(`/api/auth/sso/check?company=${encodeURIComponent(name)}`);
      const data = await res.json();
      if (data.ssoAvailable && data.ssoLoginMode && data.ssoLoginMode !== 'standard') {
        setSsoMode(data.ssoLoginMode as 'both' | 'sso_only');
      } else {
        setSsoMode('standard');
      }
    } catch {
      setSsoMode('standard');
    } finally {
      setSsoCheckLoading(false);
    }
  };

  const handleSsoSignIn = () => {
    const name = credentials.companyName.trim();
    if (!name) {
      setError('Please enter your company name first');
      return;
    }
    window.location.href = `/api/auth/sso/start?company=${encodeURIComponent(name)}`;
  };

  // Shared post-login handler — called after session is established
  const finishLogin = async (data: any) => {
    // Store per-tab session token in sessionStorage for multi-window customer isolation
    if (data.sessionToken) {
      setSessionToken(data.sessionToken);
    }

    try {
      if (rememberMe) {
        localStorage.setItem('tprmax-remember-me', 'true');
        localStorage.setItem('tprmax-last-login', JSON.stringify({
          companyName: credentials.companyName,
          username: credentials.username
        }));
      } else {
        localStorage.removeItem('tprmax-remember-me');
        localStorage.removeItem('tprmax-last-login');
      }
    } catch (err) {
      console.warn('Failed to save login preferences:', err);
    }

    if (data.logoToken) {
      sessionStorage.setItem('tprmax-logo-token', data.logoToken);
    }

    queryClient.setQueryData(['/api/auth/me'], data.user);

    if (data.settings) {
      queryClient.setQueryData(['/api/settings'], data.settings);
      applyBrandingFromSettings(data.settings);
    }

    await queryClient.invalidateQueries({
      predicate: (query) => {
        const key = query.queryKey[0] as string;
        return key !== '/api/settings' && key !== '/api/auth/me';
      }
    });

    setLocation(data.user.defaultLandingPage || '/');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!credentials.companyName || !credentials.username || !credentials.password) {
      setError('Please enter company name, username, and password');
      return;
    }

    setIsLoading(true);

    try {
      const response = await apiRequest('POST', '/api/auth/login', credentials);
      const data = await response.json();

      if (data.requires2fa) {
        // 2FA required — switch to OTP step
        setPendingToken(data.pendingToken);
        setMaskedEmail(data.maskedEmail);
        setStep('otp');
      } else if (data.success) {
        // No 2FA (dev bypass or no email) — log in directly
        toast({
          title: 'Login Successful',
          description: `Welcome back, ${data.user.username} at ${data.customer?.companyName || credentials.companyName}!`,
        });
        await finishLogin(data);
      } else {
        const displayMsg = data.error === 'EMAIL_DELIVERY_FAILED'
          ? (data.message || 'Verification email could not be delivered. Please contact your administrator.')
          : (data.error || 'Login failed');
        setError(displayMsg);
        toast({
          title: data.error === 'EMAIL_DELIVERY_FAILED' ? 'Email Delivery Failed' : 'Login Failed',
          description: displayMsg,
          variant: 'destructive',
        });
      }
    } catch (err: any) {
      const msg = err?.message || 'Login failed';
      setError(msg);
      toast({
        title: 'Login Failed',
        description: msg,
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleOtpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setOtpError('');
    setIsLoading(true);

    try {
      const response = await apiRequest('POST', '/api/auth/verify-2fa', {
        pendingToken,
        otp: otpValue,
      });
      const data = await response.json();

      toast({
        title: 'Login Successful',
        description: `Welcome back, ${data.user?.username}!`,
      });
      await finishLogin(data);
    } catch (err: any) {
      setOtpError(err?.message || 'Invalid verification code');
      setOtpValue('');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-white to-indigo-50 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900 p-4">
      <Card className="w-full max-w-md glass-strong border border-slate-200 dark:border-slate-800 shadow-2xl">
        <CardHeader className="text-center space-y-4">
          <div className="mx-auto w-24 h-16 flex items-center justify-center">
            <img src={acsLogo} alt="ACS Logo" className="h-full w-auto object-contain" />
          </div>
          <div>
            <CardTitle className="text-2xl font-bold text-slate-800 dark:text-slate-200">
              TPR
            </CardTitle>
            <CardDescription className="text-slate-600 dark:text-slate-400">
              Total Protection & Response
            </CardDescription>
          </div>
        </CardHeader>

        <CardContent className="space-y-6">

          {/* ── Credentials step ── */}
          {step === 'credentials' && (
            <>
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
                      onBlur={handleCompanyBlur}
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

                <div className="flex items-center space-x-2 pt-1">
                  <Checkbox
                    id="remember-me"
                    checked={rememberMe}
                    onCheckedChange={(checked) => setRememberMe(checked === true)}
                    disabled={isLoading}
                    data-testid="checkbox-remember-me"
                  />
                  <Label
                    htmlFor="remember-me"
                    className="text-sm text-slate-600 dark:text-slate-400 cursor-pointer select-none font-normal"
                  >
                    Remember login details
                  </Label>
                </div>

                {ssoMode !== 'sso_only' && (
                  <Button
                    type="submit"
                    className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-semibold py-3"
                    disabled={isLoading}
                    data-testid="button-login"
                  >
                    {isLoading ? (
                      'Signing in...'
                    ) : (
                      <>
                        <LogIn className="mr-2" size={18} />
                        Sign In
                      </>
                    )}
                  </Button>
                )}
              </form>

              {(ssoMode === 'both' || ssoMode === 'sso_only') && (
                <div className="space-y-3">
                  {ssoMode === 'both' && (
                    <div className="flex items-center gap-3">
                      <div className="flex-1 h-px bg-slate-200 dark:bg-slate-700" />
                      <span className="text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">or continue with</span>
                      <div className="flex-1 h-px bg-slate-200 dark:bg-slate-700" />
                    </div>
                  )}
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 font-medium py-3 gap-3"
                    onClick={handleSsoSignIn}
                    disabled={ssoCheckLoading}
                    data-testid="button-sso-microsoft"
                  >
                    <MicrosoftLogoIcon size={20} />
                    {ssoCheckLoading ? 'Checking…' : 'Sign in with Microsoft'}
                  </Button>
                </div>
              )}
            </>
          )}

          {/* ── OTP step ── */}
          {step === 'otp' && (
            <div className="space-y-4">
              <div className="flex items-start gap-3 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg text-sm text-blue-800 dark:text-blue-200">
                <Mail className="w-4 h-4 mt-0.5 shrink-0" />
                <span>
                  A 6-digit code was sent to <strong>{maskedEmail}</strong>.
                  Enter it below to complete sign-in.
                </span>
              </div>

              {otpError && (
                <Alert variant="destructive">
                  <AlertDescription>{otpError}</AlertDescription>
                </Alert>
              )}

              <form onSubmit={handleOtpSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="otp">Verification Code</Label>
                  <Input
                    id="otp"
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]{6}"
                    maxLength={6}
                    placeholder="000000"
                    value={otpValue}
                    onChange={(e) => setOtpValue(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    className="text-center text-2xl tracking-widest font-mono bg-white/70 dark:bg-slate-700/70"
                    autoFocus
                    disabled={isLoading}
                    data-testid="input-otp"
                  />
                  <p className="text-xs text-slate-500 dark:text-slate-400 text-center">
                    Code expires in 10 minutes
                  </p>
                </div>

                <Button
                  type="submit"
                  className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-semibold py-3"
                  disabled={isLoading || otpValue.length < 6}
                  data-testid="button-verify-otp"
                >
                  {isLoading ? 'Verifying…' : 'Verify & Sign In'}
                </Button>
              </form>

              <button
                type="button"
                className="flex items-center gap-1 text-sm text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 mx-auto"
                onClick={() => {
                  setStep('credentials');
                  setOtpValue('');
                  setPendingToken('');
                  setOtpError('');
                }}
              >
                <ArrowLeft className="w-3 h-3" /> Back to login
              </button>
            </div>
          )}

          <div className="text-center">
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Secure access • TPR
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
