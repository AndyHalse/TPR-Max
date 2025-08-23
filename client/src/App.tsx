import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Layout from "@/components/Layout";
import Dashboard from "@/pages/Dashboard";
import StaffManagement from "@/pages/StaffManagement";
import KioskMode from "@/pages/KioskMode";
import VisitorCheckIn from "@/pages/VisitorCheckIn";
import MusterList from "@/pages/MusterList";
import Settings from "@/pages/Settings";
import Reports from "@/pages/Reports";
import PreBooking from "@/pages/PreBooking";

function Router() {
  return (
    <Layout>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/staff" component={StaffManagement} />
        <Route path="/prebooking" component={PreBooking} />
        <Route path="/kiosk" component={KioskMode} />
        <Route path="/checkin" component={VisitorCheckIn} />
        <Route path="/muster" component={MusterList} />
        <Route path="/reports" component={Reports} />
        <Route path="/settings" component={Settings} />
        <Route component={NotFound} />
      </Switch>
    </Layout>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
