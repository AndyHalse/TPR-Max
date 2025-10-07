import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider, useQuery } from "@tanstack/react-query";
import { lazy, Suspense, useEffect } from "react";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/contexts/ThemeContext";
import NotFound from "@/pages/not-found";
import SiteInduction from "@/pages/SiteInduction";
import Layout from "@/components/Layout";
import Dashboard from "@/pages/Dashboard";
import StaffManagement from "@/pages/StaffManagement";
import KioskMode from "@/pages/KioskMode";
import VisitorCheckIn from "@/pages/VisitorCheckIn";
import EmergencyMuster from "@/pages/EmergencyMuster";
import Settings from "@/pages/Settings";
import TimeAttendance from "@/pages/TimeAttendance";
import Visitors from "@/pages/Visitors";
import Reports from "@/pages/Reports";
import SuperAdmin from "@/pages/SuperAdmin";
import TenantDashboard from "@/pages/TenantDashboard";
import TenantSettings from "@/pages/TenantSettings";
import AIDemo from "@/pages/AIDemo";
import Contractors from "@/pages/Contractors";
import ContractorDetails from "@/pages/ContractorDetails";
import ContractorKiosk from "@/pages/ContractorKiosk";
import ContractorManagement from "@/pages/ContractorManagement";
import FireMarshalMuster from "@/pages/FireMarshalMuster";
import FireMarshalPanel from "@/pages/FireMarshalPanel";
import FireMarshalMobile from "@/pages/FireMarshalMobile";
import InductionSettings from "@/pages/InductionSettings";
import MeetingRooms from "@/pages/MeetingRooms";
import Login from "@/pages/Login";
import HSDocumentAcceptance from "@/pages/HSDocumentAcceptance";
import MarketingPage from "@/pages/MarketingPage";
import AISettings from "@/pages/AISettings";
import Billing from "@/pages/Billing";
import Signup from "@/pages/Signup";
import SignupPayment from "@/pages/SignupPayment";
import Welcome from "@/pages/Welcome";
import AcceptInvitation from "@/pages/AcceptInvitation";

function Router() {
  const urlParams = new URLSearchParams(window.location.search);
  const emergencyToken = urlParams.get('token');
  
  // Special case: Fire Marshal emergency access with token
  if (window.location.pathname === '/fire-marshal' && emergencyToken) {
    return <FireMarshalMuster token={emergencyToken} />;
  }
  
  // Fire Marshal Mobile - Emergency access (requires valid token)
  if (window.location.pathname === '/fire-marshal-mobile') {
    const emergencyToken = urlParams.get('token');
    if (!emergencyToken) {
      return (
        <div className="min-h-screen bg-red-50 flex items-center justify-center p-4">
          <div className="max-w-md bg-white rounded-lg shadow-lg p-8 text-center">
            <div className="text-6xl mb-4">🚨</div>
            <h1 className="text-2xl font-bold text-red-600 mb-4">Emergency Access Required</h1>
            <p className="text-gray-600 mb-4">
              This page requires a valid emergency access token.
            </p>
            <p className="text-sm text-gray-500">
              Fire Marshals should access this page via the secure link provided in their emergency notification email.
            </p>
          </div>
        </div>
      );
    }
    return <FireMarshalMobile token={emergencyToken} />;
  }
  
  // Fire Marshal Panel - Emergency access (requires valid token)
  if (window.location.pathname === '/fire-marshal-panel') {
    if (!emergencyToken) {
      return (
        <div className="min-h-screen bg-red-50 flex items-center justify-center p-4">
          <div className="max-w-md bg-white rounded-lg shadow-lg p-8 text-center">
            <div className="text-6xl mb-4">🚨</div>
            <h1 className="text-2xl font-bold text-red-600 mb-4">Emergency Access Required</h1>
            <p className="text-gray-600 mb-4">
              This page requires a valid emergency access token.
            </p>
            <p className="text-sm text-gray-500">
              Fire Marshals should access this page via the secure link provided in their emergency notification email.
            </p>
          </div>
        </div>
      );
    }
    return <FireMarshalPanel token={emergencyToken} />;
  }
  
  // Invitation acceptance - public route with token (no authentication required)
  if (window.location.pathname === '/invite/accept') {
    return <AcceptInvitation />;
  }
  
  // H&S Document acceptance - public route with token (no authentication required)
  if (window.location.pathname.startsWith('/hs-document/')) {
    const token = window.location.pathname.split('/hs-document/')[1];
    if (token) {
      return <HSDocumentAcceptance token={token} />;
    }
  }
  
  // Public marketing page - no authentication required
  if (window.location.pathname === '/marketing') {
    return <MarketingPage />;
  }
  
  // Public onboarding pages - no authentication required
  if (window.location.pathname === '/signup') {
    return <Signup />;
  }
  
  if (window.location.pathname === '/signup/payment') {
    return <SignupPayment />;
  }
  
  // SECURITY FIX: Add missing onboarding success route
  if (window.location.pathname === '/onboarding/success') {
    const OnboardingSuccess = lazy(() => import("./pages/OnboardingSuccess"));
    return (
      <Suspense fallback={
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-slate-900 dark:to-slate-800">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-slate-600 dark:text-slate-400">Processing your account setup...</p>
          </div>
        </div>
      }>
        <OnboardingSuccess />
      </Suspense>
    );
  }
  
  if (window.location.pathname === '/welcome') {
    return <Welcome />;
  }
  
  // Public induction system - no authentication required
  if (window.location.pathname.startsWith('/induction/') && !window.location.pathname.startsWith('/induction-preview/')) {
    return <SiteInduction />;
  }
  
  // Induction preview - no authentication required
  if (window.location.pathname.startsWith('/induction-preview/')) {
    const InductionPreview = lazy(() => import("./pages/InductionPreview"));
    return (
      <Suspense fallback={
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-slate-900 dark:to-slate-800">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-slate-600 dark:text-slate-400">Loading induction preview...</p>
          </div>
        </div>
      }>
        <InductionPreview />
      </Suspense>
    );
  }
  
  // Secure authentication - requires valid server session
  const { data: user, isLoading, error, isError } = useQuery({
    queryKey: ["/api/auth/me"],
    queryFn: async () => {
      console.log("🔍 [AUTH QUERY] Executing /api/auth/me query...");
      try {
        const res = await fetch("/api/auth/me", {
          credentials: "include",
        });
        console.log("📥 [AUTH QUERY] Response status:", res.status);
        
        if (res.status === 401) {
          console.log("❌ [AUTH QUERY] Unauthenticated (401) - no valid session");
          return null;
        }
        if (!res.ok) {
          throw new Error(`${res.status}: ${res.statusText}`);
        }
        const userData = await res.json();
        console.log("✅ [AUTH QUERY] Successfully authenticated user:", userData.username);
        return userData;
      } catch (error) {
        console.log("💥 [AUTH QUERY] Network error:", error);
        console.log("❌ [AUTH QUERY] No valid authentication available");
        return null;
      }
    },
    retry: false,
    staleTime: 0, // Always fresh - critical for proper auth flow
    gcTime: 0, // Don't cache auth queries
  });

  console.log("🔍 [AUTH STATE] Current state:", { user: user?.username || 'null', isLoading, isError, error });

  if (isLoading) {
    console.log("⏳ [AUTH STATE] Authentication loading...");
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-slate-900 dark:to-slate-800">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-slate-600 dark:text-slate-400">Checking authentication...</p>
        </div>
      </div>
    );
  }

  // If not authenticated, show login page
  if (!user) {
    console.log("❌ [AUTH STATE] No authenticated user - showing login page");
    return <Login />;
  }

  console.log("✅ [AUTH STATE] User authenticated - showing main app for:", user.username);

  // If authenticated, show main app
  return (
    <Switch>
      <Route path="/kiosk" component={KioskMode} />
      <Route path="/marketing" component={MarketingPage} />
      <Route>
        <Layout>
          <Switch>
            <Route path="/" component={Dashboard} />
            <Route path="/staff" component={StaffManagement} />
            <Route path="/visitors" component={Visitors} />
            <Route path="/contractors" component={ContractorManagement} />
            <Route path="/contractors/legacy" component={Contractors} />
            <Route path="/contractors/:id" component={ContractorDetails} />
            <Route path="/contractor" component={ContractorKiosk} />
            <Route path="/checkin" component={VisitorCheckIn} />
            <Route path="/muster" component={EmergencyMuster} />
            <Route path="/fire-marshal-panel" component={FireMarshalPanel} />
            <Route path="/fire-marshal-mobile" component={FireMarshalMobile} />
            <Route path="/reports" component={Reports} />
            <Route path="/time-attendance" component={TimeAttendance} />
            <Route path="/settings" component={Settings} />
            <Route path="/settings/ai" component={AISettings} />
            <Route path="/multi-tenant" component={SuperAdmin} />
            <Route path="/tenant/:slug/dashboard" component={TenantDashboard} />
            <Route path="/tenant/:slug/settings" component={TenantSettings} />
            <Route path="/tenant/:slug/staff" component={StaffManagement} />
            <Route path="/tenant/:slug/visitors" component={Visitors} />
            <Route path="/induction-settings" component={InductionSettings} />
            <Route path="/meeting-rooms" component={MeetingRooms} />
            <Route path="/ai-demo" component={AIDemo} />
            <Route path="/billing" component={Billing} />
            <Route component={NotFound} />
          </Switch>
        </Layout>
      </Route>
    </Switch>
  );
}

function App() {
  // Fetch CSRF token on app initialization
  useEffect(() => {
    fetch('/api/csrf-token', { credentials: 'include' })
      .then(res => res.json())
      .catch(err => console.error('Failed to fetch CSRF token:', err));
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
