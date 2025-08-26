import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider, useQuery } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/contexts/ThemeContext";
import NotFound from "@/pages/not-found";
import Layout from "@/components/Layout";
import Dashboard from "@/pages/Dashboard";
import StaffManagement from "@/pages/StaffManagement";
import KioskMode from "@/pages/KioskMode";
import VisitorCheckIn from "@/pages/VisitorCheckIn";
import EmergencyMuster from "@/pages/EmergencyMuster";
import Settings from "@/pages/Settings";
import Reports from "@/pages/Reports";
import TimeAttendance from "@/pages/TimeAttendance";
import Visitors from "@/pages/Visitors";
import AIDemo from "@/pages/AIDemo";
import Contractors from "@/pages/Contractors";
import ContractorKiosk from "@/pages/ContractorKiosk";
import FireMarshalMuster from "@/pages/FireMarshalMuster";
import Login from "@/pages/Login";

function Router() {
  const urlParams = new URLSearchParams(window.location.search);
  const emergencyToken = urlParams.get('token');
  
  // Special case: Fire Marshal emergency access with token
  if (window.location.pathname === '/fire-marshal' && emergencyToken) {
    return <FireMarshalMuster token={emergencyToken} />;
  }
  
  // Check authentication status for normal app routes
  const { data: user, isLoading } = useQuery({
    queryKey: ["/api/auth/me"],
    queryFn: async () => {
      const res = await fetch("/api/auth/me", {
        credentials: "include",
      });
      if (res.status === 401) {
        return null; // Return null for unauthenticated users
      }
      if (!res.ok) {
        throw new Error(`${res.status}: ${res.statusText}`);
      }
      return await res.json();
    },
    retry: false,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-slate-900 dark:to-slate-800">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-slate-600 dark:text-slate-400">Loading...</p>
        </div>
      </div>
    );
  }

  // If not authenticated, show login page
  if (!user) {
    return <Login />;
  }

  // If authenticated, show main app
  return (
    <Switch>
      <Route path="/kiosk" component={KioskMode} />
      <Route>
        <Layout>
          <Switch>
            <Route path="/" component={Dashboard} />
            <Route path="/staff" component={StaffManagement} />
            <Route path="/visitors" component={Visitors} />
            <Route path="/contractors" component={Contractors} />
            <Route path="/contractor" component={ContractorKiosk} />
            <Route path="/checkin" component={VisitorCheckIn} />
            <Route path="/muster" component={EmergencyMuster} />
            <Route path="/reports" component={Reports} />
            <Route path="/time-attendance" component={TimeAttendance} />
            <Route path="/settings" component={Settings} />
            <Route path="/ai-demo" component={AIDemo} />
            <Route component={NotFound} />
          </Switch>
        </Layout>
      </Route>
    </Switch>
  );
}

function App() {
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
