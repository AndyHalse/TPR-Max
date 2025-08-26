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
  
  // TEMPORARY AUTH BYPASS - Skip authentication completely
  const user = { id: "temp-user", username: "Andy" }; // Fake user for testing
  const isLoading = false;

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
