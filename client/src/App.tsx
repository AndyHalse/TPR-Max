import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider, useQuery } from "@tanstack/react-query";
import { ErrorBoundary, EmergencyFallback } from "@/components/ErrorBoundary";
import { lazy, Suspense, useEffect } from "react";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/contexts/ThemeContext";
import NotFound from "@/pages/not-found";
import NdaSign from "@/pages/NdaSign";
import SiteInduction from "@/pages/SiteInduction";
import InductionCheckpoint from "@/pages/InductionCheckpoint";
import Layout from "@/components/Layout";
import Dashboard from "@/pages/Dashboard";
import StaffManagement from "@/pages/StaffManagement";
import KioskMode from "@/pages/KioskMode";
import VisitorCheckIn from "@/pages/VisitorCheckIn";
import EmergencyMuster from "@/pages/EmergencyMuster";
import Settings from "@/pages/Settings";
import TimeAttendance from "@/pages/TimeAttendance";
import Visitors from "@/pages/Visitors";
import Members from "@/pages/Members";
import Reports from "@/pages/Reports";
import Contractors from "@/pages/Contractors";
import ContractorDetails from "@/pages/ContractorDetails";
import ContractorKiosk from "@/pages/ContractorKiosk";
import ContractorManagement from "@/pages/ContractorManagement";
import FireMarshalMuster from "@/pages/FireMarshalMuster";
import FireMarshalPanel from "@/pages/FireMarshalPanel";
import FireMarshalMobile from "@/pages/FireMarshalMobile";
import IncidentMonitor from "@/pages/IncidentMonitor";
import MartynLaw from "@/pages/MartynLaw";
import IncidentReports from "@/pages/IncidentReports";
import PPM from "@/pages/PPM";
import PPMWorkOrderMobile from "@/pages/PPMWorkOrderMobile";
import Audits from "@/pages/Audits";
import AuditMobile from "@/pages/AuditMobile";
import HelpDesk from "@/pages/HelpDesk";
import InductionSettings from "@/pages/InductionSettings";
import EmailOutbox from "@/pages/EmailOutbox";
import MeetingRooms from "@/pages/MeetingRooms";
import Login from "@/pages/Login";
import HSDocumentAcceptance from "@/pages/HSDocumentAcceptance";
import ContractorDocumentUpload from "@/pages/ContractorDocumentUpload";
import WorkerDocumentUpload from "@/pages/WorkerDocumentUpload";
import MarketingPage from "@/pages/MarketingPage";
import BlogListPage from "@/pages/BlogListPage";
import BlogPostPage from "@/pages/BlogPostPage";
import AboutPage from "@/pages/AboutPage";
import AISettings from "@/pages/AISettings";
import LeaverTemplateSettings from "@/pages/settings/LeaverTemplateSettings";
import OnboardingTemplateSettings from "@/pages/settings/OnboardingTemplateSettings";
import Billing from "@/pages/Billing";
import Signup from "@/pages/Signup";
import SignupPayment from "@/pages/SignupPayment";
import Welcome from "@/pages/Welcome";
import AcceptInvitation from "@/pages/AcceptInvitation";
import Profile from "@/pages/Profile";
import PlatformAdminLogin from "@/pages/PlatformAdminLogin";
import PlatformAdminDashboard from "@/pages/PlatformAdminDashboard";
import IncidentManagerMonitor from "@/pages/IncidentManagerMonitor";
import LoneWorkerConfirmation from "@/pages/LoneWorkerConfirmation";
import HSIncidents from "@/pages/HSIncidents";
import FireRiskAssessmentPage from "@/pages/FireRiskAssessment";
import ComplianceCertificateRegister from "@/pages/ComplianceCertificateRegister";
import ComplianceDashboard from "@/pages/ComplianceDashboard";
import PermitToWorkPage from "@/pages/PermitToWork";
import RaBuilder from "@/pages/RaBuilder";
import HrHub from "@/pages/hr/HrHub";
import StaffProfile from "@/pages/hr/StaffProfile";
import OrgChart from "@/pages/hr/OrgChart";
import LeaveCalendar from "@/pages/hr/LeaveCalendar";
import TrainingMatrix from "@/pages/hr/TrainingMatrix";
import AbsenceOverview from "@/pages/hr/AbsenceOverview";
import OnboardingOverview from "@/pages/hr/OnboardingOverview";
import Leavers from "@/pages/hr/Leavers";
import AppraisalsDue from "@/pages/hr/AppraisalsDue";
import PayrollExport from "@/pages/hr/PayrollExport";

function Router() {
  const urlParams = new URLSearchParams(window.location.search);
  const emergencyToken = urlParams.get('token');
  
  // Platform Admin routes (separate authentication system)
  if (window.location.pathname === '/platform-admin' || window.location.pathname === '/platform-admin/' || window.location.pathname === '/platform-admin/login') {
    return <PlatformAdminLogin />;
  }
  
  if (window.location.pathname === '/platform-admin/dashboard') {
    return <PlatformAdminDashboard />;
  }
  
  // Special case: Fire Marshal emergency access with token
  if (window.location.pathname === '/fire-marshal' && emergencyToken) {
    return (
      <ErrorBoundary key={window.location.pathname} fallback={<EmergencyFallback />}>
        <FireMarshalMuster token={emergencyToken} />
      </ErrorBoundary>
    );
  }
  
  // Fire Marshal Mobile - NEW STATIC URL SYSTEM (no token needed)
  if (window.location.pathname.startsWith('/fire-marshal/')) {
    const urlId = window.location.pathname.split('/fire-marshal/')[1];
    if (!urlId) {
      return (
        <div className="min-h-screen bg-red-50 flex items-center justify-center p-4">
          <div className="max-w-md bg-white rounded-lg shadow-lg p-8 text-center">
            <div className="text-6xl mb-4">🚨</div>
            <h1 className="text-2xl font-bold text-red-600 mb-4">Invalid Fire Marshal Link</h1>
            <p className="text-gray-600 mb-4">
              This Fire Marshal access link is invalid.
            </p>
            <p className="text-sm text-gray-500">
              Please check the URL and try again, or contact your administrator.
            </p>
          </div>
        </div>
      );
    }
    return (
      <ErrorBoundary key={window.location.pathname} fallback={<EmergencyFallback />}>
        <FireMarshalMobile urlId={urlId} />
      </ErrorBoundary>
    );
  }
  
  // LEGACY: Fire Marshal Mobile with token (backwards compatibility)
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
    return (
      <ErrorBoundary key={window.location.pathname} fallback={<EmergencyFallback />}>
        <FireMarshalMobile token={emergencyToken} />
      </ErrorBoundary>
    );
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
    return (
      <ErrorBoundary key={window.location.pathname} fallback={<EmergencyFallback />}>
        <FireMarshalPanel token={emergencyToken} />
      </ErrorBoundary>
    );
  }
  
  // Incident Manager Monitor - permanent per-customer read-only URL for senior managers
  if (window.location.pathname.startsWith('/incident-monitor/')) {
    const urlId = window.location.pathname.split('/incident-monitor/')[1];
    if (urlId) {
      return <IncidentManagerMonitor urlId={urlId} />;
    }
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl p-8 max-w-md w-full text-center shadow-2xl">
          <div className="text-5xl mb-4">🔍</div>
          <h1 className="text-2xl font-bold text-gray-800 mb-4">Invalid Monitor Link</h1>
          <p className="text-gray-600">This monitor link is missing a required ID.</p>
        </div>
      </div>
    );
  }

  // Incident Monitor - read-only live evacuation view (public, uses evacuationId + customerId)
  if (window.location.pathname.startsWith('/monitor/')) {
    const evacuationId = window.location.pathname.split('/monitor/')[1];
    const monitorCustomerId = urlParams.get('customer') || urlParams.get('customerId');
    if (evacuationId && monitorCustomerId) {
      return <IncidentMonitor evacuationId={evacuationId} customerId={monitorCustomerId} />;
    }
    return (
      <div className="min-h-screen bg-gray-800 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl p-8 max-w-md w-full text-center shadow-2xl">
          <div className="text-5xl mb-4">🔍</div>
          <h1 className="text-2xl font-bold text-gray-800 mb-4">Monitor Link Invalid</h1>
          <p className="text-gray-600">This incident monitor link is missing required parameters.</p>
        </div>
      </div>
    );
  }

  // NDA signing - public mobile page, no auth required
  if (window.location.pathname.startsWith('/nda/')) {
    return <NdaSign />;
  }

  // Invitation acceptance - public route with token (no authentication required)
  if (window.location.pathname === '/invite/accept') {
    return <AcceptInvitation />;
  }
  
  // Contractor document upload portal - public route with token (no authentication required)
  if (window.location.pathname.startsWith('/contractor-upload/')) {
    const token = window.location.pathname.split('/contractor-upload/')[1];
    if (token) return <ContractorDocumentUpload token={token} />;
  }

  // Worker document upload portal - public route with token (no authentication required)
  if (window.location.pathname.startsWith('/worker-upload/')) {
    const token = window.location.pathname.split('/worker-upload/')[1];
    if (token) return <WorkerDocumentUpload token={token} />;
  }

  // H&S Document acceptance - public route with token (no authentication required)
  if (window.location.pathname.startsWith('/hs-document/')) {
    const token = window.location.pathname.split('/hs-document/')[1];
    if (token) {
      return <HSDocumentAcceptance token={token} />;
    }
  }

  // PPM Work Order contractor mobile view - public route with access token
  if (window.location.pathname.startsWith('/ppm/work-order/')) {
    const token = window.location.pathname.split('/ppm/work-order/')[1];
    if (token) {
      return <PPMWorkOrderMobile token={token} />;
    }
  }
  
  // Public blog pages - no authentication required
  if (window.location.pathname === '/blog') {
    return <BlogListPage />;
  }

  if (window.location.pathname.startsWith('/blog/')) {
    const slug = window.location.pathname.replace('/blog/', '');
    if (slug) return <BlogPostPage slug={slug} />;
  }

  // Public marketing page - no authentication required
  if (window.location.pathname === '/marketing') {
    return <MarketingPage />;
  }

  // Public about page - no authentication required
  if (window.location.pathname === '/about') {
    return <AboutPage />;
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
  if (window.location.pathname === '/induction') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-orange-50 flex items-center justify-center">
        <div className="max-w-md w-full mx-4 bg-white rounded-xl shadow-sm border p-8 text-center">
          <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Site Induction</h2>
          <p className="text-gray-600 mb-4">To access your induction, please use the link that was sent to your email address.</p>
          <p className="text-sm text-gray-500">If you haven't received an email, contact your site manager to request an induction link.</p>
        </div>
      </div>
    );
  }
  if (window.location.pathname.startsWith('/induction/checkpoint/')) {
    return <InductionCheckpoint />;
  }
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
  
  // Check if this is a public route that doesn't need authentication
  const isFireMarshalRoute = window.location.pathname.startsWith('/fire-marshal/');
  const isLoneWorkerOkRoute = window.location.pathname.startsWith('/lone-worker/ok/');
  const isPublicRoute = isFireMarshalRoute || isLoneWorkerOkRoute;
  
  // Secure authentication - requires valid server session (skip for public routes)
  const { data: user, isLoading, error, isError } = useQuery({
    queryKey: ["/api/auth/me"],
    queryFn: async () => {
      console.info("🔍 [AUTH QUERY] Executing /api/auth/me query...");
      try {
        const res = await fetch("/api/auth/me", {
          credentials: "include",
        });
        console.info("📥 [AUTH QUERY] Response status:", res.status);
        
        if (res.status === 401) {
          console.info("❌ [AUTH QUERY] Unauthenticated (401) - no valid session");
          return null;
        }
        if (!res.ok) {
          throw new Error(`${res.status}: ${res.statusText}`);
        }
        const userData = await res.json();
        console.info("✅ [AUTH QUERY] Successfully authenticated user:", userData.username);
        return userData;
      } catch (error) {
        console.info("💥 [AUTH QUERY] Network error:", error);
        console.info("❌ [AUTH QUERY] No valid authentication available");
        return null;
      }
    },
    retry: false,
    staleTime: 0, // Always fresh - critical for proper auth flow
    gcTime: 0, // Don't cache auth queries
    enabled: !isPublicRoute, // Don't run auth query on public routes
  });

  console.info("🔍 [AUTH STATE] Current state:", { user: user?.username || 'null', isLoading, isError, error });

  // Skip auth checks for public routes (they have their own authentication logic)
  if (!isPublicRoute) {
    if (isLoading) {
      console.info("⏳ [AUTH STATE] Authentication loading...");
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
      console.info("❌ [AUTH STATE] No authenticated user - showing login page");
      return <Login />;
    }
  }

  if (user) {
    console.info("✅ [AUTH STATE] User authenticated - showing main app for:", user.username);
  }

  // Customer-facing kiosk pages — render without any admin Layout/nav
  if (window.location.pathname === '/contractor') {
    return <ContractorKiosk />;
  }

  // Show main app (either authenticated or public route)
  return (
    <Switch>
      <Route path="/kiosk" component={KioskMode} />
      <Route path="/contractor" component={ContractorKiosk} />
      <Route path="/marketing" component={MarketingPage} />
      <Route path="/audit/complete/:token">
        {(params) => <AuditMobile token={params.token!} />}
      </Route>
      <Route path="/lone-worker/ok/:token" component={LoneWorkerConfirmation} />
      <Route path="/lone-worker/ok/:customerId/:token" component={LoneWorkerConfirmation} />
      <Route path="/induction-preview/:roleType">
        {(params) => {
          const InductionPreview = lazy(() => import("./pages/InductionPreview"));
          return (
            <Suspense fallback={
              <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-950 to-purple-950">
                <div className="text-center">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4"></div>
                  <p className="text-white text-lg">Loading induction preview...</p>
                </div>
              </div>
            }>
              <InductionPreview />
            </Suspense>
          );
        }}
      </Route>
      <Route>
        <Layout>
          <Switch>
            <Route path="/" component={Dashboard} />
            <Route path="/staff" component={StaffManagement} />
            <Route path="/visitors" component={Visitors} />
            <Route path="/members" component={Members} />
            <Route path="/contractors" component={ContractorManagement} />
            <Route path="/contractors/legacy" component={Contractors} />
            <Route path="/contractors/:id" component={ContractorDetails} />
            <Route path="/checkin" component={VisitorCheckIn} />
            <Route path="/muster">
              <ErrorBoundary fallback={<EmergencyFallback />}>
                <EmergencyMuster />
              </ErrorBoundary>
            </Route>
            <Route path="/incident-reports" component={IncidentReports} />
            <Route path="/ppm" component={PPM} />
            <Route path="/audits" component={Audits} />
            <Route path="/helpdesk" component={HelpDesk} />
            <Route path="/martyn-law" component={MartynLaw} />
            <Route path="/fire-marshal-panel" component={FireMarshalPanel} />
            <Route path="/fire-marshal-mobile" component={FireMarshalMobile} />
            <Route path="/reports" component={Reports} />
            <Route path="/time-attendance" component={TimeAttendance} />
            <Route path="/settings" component={Settings} />
            <Route path="/settings/ai" component={AISettings} />
            <Route path="/settings/leaver-template" component={LeaverTemplateSettings} />
            <Route path="/settings/onboarding-template" component={OnboardingTemplateSettings} />
            <Route path="/induction-settings" component={InductionSettings} />
            <Route path="/email-outbox" component={EmailOutbox} />
            <Route path="/meeting-rooms" component={MeetingRooms} />
            <Route path="/billing" component={Billing} />
            <Route path="/profile" component={Profile} />
            <Route path="/hs-incidents" component={HSIncidents} />
            <Route path="/fire-risk-assessment" component={FireRiskAssessmentPage} />
            <Route path="/compliance-certificates" component={ComplianceCertificateRegister} />
            <Route path="/compliance-dashboard" component={ComplianceDashboard} />
            <Route path="/permit-to-work" component={PermitToWorkPage} />
            <Route path="/ra-builder" component={RaBuilder} />
            <Route path="/hr" component={HrHub} />
            <Route path="/hr/staff/:id" component={StaffProfile} />
            <Route path="/hr/org-chart" component={OrgChart} />
            <Route path="/hr/leave" component={LeaveCalendar} />
            <Route path="/hr/training" component={TrainingMatrix} />
            <Route path="/hr/absence" component={AbsenceOverview} />
            <Route path="/hr/onboarding" component={OnboardingOverview} />
            <Route path="/hr/leavers" component={Leavers} />
            <Route path="/hr/appraisals" component={AppraisalsDue} />
            <Route path="/hr/payroll" component={PayrollExport} />
            <Route component={NotFound} />
          </Switch>
        </Layout>
      </Route>
    </Switch>
  );
}

function App() {
  // Fetch CSRF token on app initialization and refresh it every 30 minutes
  // so it never silently expires during a long working session (cookie lasts 8h)
  useEffect(() => {
    const refreshCsrfToken = () => {
      fetch('/api/csrf-token', { credentials: 'include' })
        .catch(err => console.error('Failed to fetch CSRF token:', err));
    };
    refreshCsrfToken();
    const interval = setInterval(refreshCsrfToken, 30 * 60 * 1000); // every 30 min
    return () => clearInterval(interval);
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <TooltipProvider>
          <Toaster />
          <ErrorBoundary>
            <Router />
          </ErrorBoundary>
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
