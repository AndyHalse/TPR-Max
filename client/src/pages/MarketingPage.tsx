import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { 
  Shield, 
  Printer, 
  QrCode, 
  Users, 
  Brain, 
  Clock, 
  Building2, 
  CheckCircle,
  ArrowRight,
  Star,
  Zap,
  Lock,
  BarChart3,
  Camera,
  Smartphone,
  Globe,
  Mail,
  Calendar,
  MapPin,
  MonitorSpeaker,
  FileText,
  Settings,
  AlertTriangle,
  UserCheck,
  ClipboardList,
  Gauge,
  BookOpen,
  Eye,
  TrendingUp,
  Activity
} from "lucide-react";

// Import ACS logo and screenshots
import acsLogo from "@assets/acs-logo-2460A9-200px.jpg";
import dashboardImg from "@assets/Screenshot 2025-09-16 at 13.39.01_1758022774224.png";
import kioskImg from "@assets/Screenshot 2025-08-24 at 16.05.36_1756044356361.png";
import thermalImg from "@assets/ID Card printer_1756400844599.png";

export default function MarketingPage() {
  const [email, setEmail] = useState("");
  const [activeTab, setActiveTab] = useState("dashboard");
  const { toast } = useToast();

  // Handle URL hash changes for deep-linking
  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.replace('#', '');
      if (hash && ['dashboard', 'reception', 'meeting-rooms', 'people', 'id-printing', 'qr-access', 'ai-compliance', 'emergency', 'multi-tenant', 'reports'].includes(hash)) {
        setActiveTab(hash);
      }
    };

    // Check initial hash
    handleHashChange();
    
    // Listen for hash changes
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  // Update URL hash when tab changes
  const handleTabChange = (value: string) => {
    setActiveTab(value);
    window.history.replaceState(null, '', `#${value}`);
  };

  const contactMutation = useMutation({
    mutationFn: async (email: string) => {
      const response = await apiRequest("POST", "/api/marketing/contact", { email });
      return response;
    },
    onSuccess: () => {
      toast({
        title: "Thank you for your interest!",
        description: "We'll be in touch with you soon to schedule your demo.",
      });
      setEmail("");
    },
    onError: () => {
      toast({
        title: "Something went wrong",
        description: "Please try again or contact us directly.",
        variant: "destructive",
      });
    },
  });

  const handleContactSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (email) {
      contactMutation.mutate(email);
    }
  };

  const scrollToSection = (sectionId: string) => {
    const element = document.getElementById(sectionId);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900">
      {/* Navigation */}
      <nav className="sticky top-0 z-50 backdrop-blur-lg bg-white/80 dark:bg-slate-900/80 border-b border-slate-200 dark:border-slate-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-2">
              <img 
                src={acsLogo} 
                alt="ACS logo" 
                className="h-8 w-8 object-contain" 
                data-testid="img-logo" 
              />
              <span className="text-xl font-bold" style={{color: '#2460A9'}}>
                VisiGate Pro
              </span>
            </div>
            <div className="hidden md:flex items-center space-x-8">
              <button 
                onClick={() => scrollToSection('features')} 
                className="text-slate-600 dark:text-slate-300 transition-colors hover:text-[#2460A9]"
                data-testid="link-features"
              >
                Features
              </button>
              <button 
                onClick={() => scrollToSection('industries')} 
                className="text-slate-600 dark:text-slate-300 transition-colors hover:text-[#2460A9]"
                data-testid="link-industries"
              >
                Industries
              </button>
              <button 
                onClick={() => scrollToSection('contact')} 
                className="text-slate-600 dark:text-slate-300 transition-colors hover:text-[#2460A9]"
                data-testid="link-contact"
              >
                Contact
              </button>
              <Button 
                size="sm" 
                onClick={() => scrollToSection('contact')} 
                data-testid="button-demo"
              >
                Request Demo
              </Button>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative py-20 lg:py-32">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div className="text-center lg:text-left">
              <div className="flex items-center justify-center lg:justify-start space-x-2 mb-6">
                <Badge variant="secondary" className="text-white" style={{backgroundColor: '#2460A9'}}>
                  <Zap className="h-3 w-3 mr-1" />
                  Complete Personnel Management
                </Badge>
              </div>
              
              <h1 className="text-4xl lg:text-6xl font-bold text-slate-900 dark:text-white mb-6">
                Complete Personnel Management 
                <span style={{color: '#2460A9'}}>
                  {" "}For Total Site Control
                </span>
              </h1>
              
              <p className="text-xl text-slate-600 dark:text-slate-300 mb-8 leading-relaxed">
                Complete personnel management for visitors, contractors, and staff. 
                Handle legal compliance, generate ID passes, track personnel with QR codes, 
                and ensure emergency mustering with total site visibility.
              </p>

              <div className="flex flex-col sm:flex-row gap-4 justify-center lg:justify-start">
                <Button 
                  size="lg" 
                  className="text-lg px-8" 
                  onClick={() => scrollToSection('contact')} 
                  data-testid="button-get-started"
                >
                  Get Started Free
                  <ArrowRight className="h-5 w-5 ml-2" />
                </Button>
                <Button 
                  variant="outline" 
                  size="lg" 
                  className="text-lg px-8" 
                  onClick={() => scrollToSection('features')} 
                  data-testid="button-view-demo"
                >
                  View Live Demo
                </Button>
              </div>

              <div className="flex items-center justify-center lg:justify-start space-x-6 mt-8 pt-8 border-t border-slate-200 dark:border-slate-700">
                <div className="flex items-center space-x-1">
                  {[...Array(5)].map((_, i) => (
                    <Star key={i} className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                  ))}
                  <span className="text-sm text-slate-600 dark:text-slate-400 ml-2">4.9/5 from 200+ customers</span>
                </div>
              </div>
            </div>

            <div className="relative">
              <div className="relative z-10">
                <img 
                  src={dashboardImg} 
                  alt="VisiGate Pro Dashboard" 
                  className="rounded-xl shadow-2xl border border-slate-200 dark:border-slate-700"
                />
                <div className="absolute -bottom-4 -right-4 bg-white dark:bg-slate-800 rounded-lg p-3 shadow-lg border border-slate-200 dark:border-slate-700">
                  <div className="flex items-center space-x-2">
                    <div className="h-2 w-2 bg-green-500 rounded-full"></div>
                    <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Live System</span>
                  </div>
                </div>
              </div>
              <div className="absolute inset-0 bg-gradient-to-r from-blue-600/20 to-indigo-600/20 rounded-xl blur-3xl -z-10"></div>
            </div>
          </div>
        </div>
      </section>

      {/* Interactive Tabbed Product Tour */}
      <section id="features" className="py-20 bg-white/50 dark:bg-slate-800/50 scroll-mt-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl lg:text-5xl font-bold text-slate-900 dark:text-white mb-6">
              Everything You Need for 
              <span style={{color: '#2460A9'}}>
                {" "}Complete Personnel Control
              </span>
            </h2>
            <p className="text-xl text-slate-600 dark:text-slate-300 max-w-3xl mx-auto">
              Discover how VisiGate Pro transforms personnel management across your entire organization. 
              Click each tab to explore features that deliver real business value.
            </p>
          </div>

          <Tabs 
            value={activeTab} 
            onValueChange={handleTabChange} 
            className="w-full"
            data-testid="features-tabs"
          >
            <TabsList className="grid grid-cols-2 md:grid-cols-5 lg:grid-cols-10 w-full mb-8 h-auto p-2 bg-white/70 dark:bg-slate-800/70 backdrop-blur-sm">
              <TabsTrigger 
                value="dashboard" 
                className="flex flex-col items-center p-3 text-xs font-medium data-[state=active]:bg-white data-[state=active]:text-[#2460A9] transition-all duration-200"
                data-testid="tab-dashboard"
              >
                <BarChart3 className="h-4 w-4 mb-1" />
                Dashboard
              </TabsTrigger>
              <TabsTrigger 
                value="reception" 
                className="flex flex-col items-center p-3 text-xs font-medium data-[state=active]:bg-white data-[state=active]:text-[#2460A9] transition-all duration-200"
                data-testid="tab-reception"
              >
                <BookOpen className="h-4 w-4 mb-1" />
                Reception
              </TabsTrigger>
              <TabsTrigger 
                value="meeting-rooms" 
                className="flex flex-col items-center p-3 text-xs font-medium data-[state=active]:bg-white data-[state=active]:text-[#2460A9] transition-all duration-200"
                data-testid="tab-meeting-rooms"
              >
                <Calendar className="h-4 w-4 mb-1" />
                Rooms
              </TabsTrigger>
              <TabsTrigger 
                value="people" 
                className="flex flex-col items-center p-3 text-xs font-medium data-[state=active]:bg-white data-[state=active]:text-[#2460A9] transition-all duration-200"
                data-testid="tab-people"
              >
                <Users className="h-4 w-4 mb-1" />
                People
              </TabsTrigger>
              <TabsTrigger 
                value="id-printing" 
                className="flex flex-col items-center p-3 text-xs font-medium data-[state=active]:bg-white data-[state=active]:text-[#2460A9] transition-all duration-200"
                data-testid="tab-id-printing"
              >
                <Printer className="h-4 w-4 mb-1" />
                ID Cards
              </TabsTrigger>
              <TabsTrigger 
                value="qr-access" 
                className="flex flex-col items-center p-3 text-xs font-medium data-[state=active]:bg-white data-[state=active]:text-[#2460A9] transition-all duration-200"
                data-testid="tab-qr-access"
              >
                <QrCode className="h-4 w-4 mb-1" />
                QR Access
              </TabsTrigger>
              <TabsTrigger 
                value="ai-compliance" 
                className="flex flex-col items-center p-3 text-xs font-medium data-[state=active]:bg-white data-[state=active]:text-[#2460A9] transition-all duration-200"
                data-testid="tab-ai-compliance"
              >
                <Brain className="h-4 w-4 mb-1" />
                Compliance
              </TabsTrigger>
              <TabsTrigger 
                value="emergency" 
                className="flex flex-col items-center p-3 text-xs font-medium data-[state=active]:bg-white data-[state=active]:text-[#2460A9] transition-all duration-200"
                data-testid="tab-emergency"
              >
                <AlertTriangle className="h-4 w-4 mb-1" />
                Emergency
              </TabsTrigger>
              <TabsTrigger 
                value="multi-tenant" 
                className="flex flex-col items-center p-3 text-xs font-medium data-[state=active]:bg-white data-[state=active]:text-[#2460A9] transition-all duration-200"
                data-testid="tab-multi-tenant"
              >
                <Building2 className="h-4 w-4 mb-1" />
                Multi-Tenant
              </TabsTrigger>
              <TabsTrigger 
                value="reports" 
                className="flex flex-col items-center p-3 text-xs font-medium data-[state=active]:bg-white data-[state=active]:text-[#2460A9] transition-all duration-200"
                data-testid="tab-reports"
              >
                <TrendingUp className="h-4 w-4 mb-1" />
                Reports
              </TabsTrigger>
            </TabsList>

            {/* Dashboard & Analytics Tab */}
            <TabsContent value="dashboard" className="space-y-6" data-testid="content-dashboard">
              <div className="grid lg:grid-cols-2 gap-8 items-center">
                <div className="space-y-6">
                  <div>
                    <Badge className="mb-4" style={{backgroundColor: '#2460A9'}}>
                      <Activity className="h-3 w-3 mr-1" />
                      Real-Time Operations
                    </Badge>
                    <h3 className="text-3xl font-bold text-slate-900 dark:text-white mb-4">
                      Complete Site Visibility at a Glance
                    </h3>
                    <p className="text-lg text-slate-600 dark:text-slate-300 leading-relaxed">
                      Transform complex personnel data into actionable insights. Our enterprise dashboard 
                      provides real-time oversight of all site activity, enabling informed decisions 
                      and proactive security management.
                    </p>
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center space-x-3">
                      <CheckCircle className="h-5 w-5 text-green-500 flex-shrink-0" />
                      <span className="text-slate-700 dark:text-slate-300">
                        <strong>Live Personnel Count:</strong> Track all visitors, contractors, and staff on-site with real-time updates
                      </span>
                    </div>
                    <div className="flex items-center space-x-3">
                      <CheckCircle className="h-5 w-5 text-green-500 flex-shrink-0" />
                      <span className="text-slate-700 dark:text-slate-300">
                        <strong>Security Alerts:</strong> Immediate notifications for unauthorized access or compliance violations
                      </span>
                    </div>
                    <div className="flex items-center space-x-3">
                      <CheckCircle className="h-5 w-5 text-green-500 flex-shrink-0" />
                      <span className="text-slate-700 dark:text-slate-300">
                        <strong>Performance Metrics:</strong> Key insights on occupancy patterns, peak times, and facility utilization
                      </span>
                    </div>
                  </div>

                  <Button 
                    size="lg" 
                    onClick={() => scrollToSection('contact')}
                    className="text-white"
                    style={{backgroundColor: '#2460A9'}}
                    data-testid="button-dashboard-demo"
                  >
                    <Eye className="h-4 w-4 mr-2" />
                    See Dashboard Live
                  </Button>
                </div>

                <div className="relative">
                  <img 
                    src={dashboardImg} 
                    alt="VisiGate Pro Real-Time Dashboard" 
                    className="rounded-xl shadow-2xl border border-slate-200 dark:border-slate-700 w-full"
                    data-testid="img-dashboard"
                  />
                  <div className="absolute inset-0 bg-gradient-to-r from-blue-600/10 to-indigo-600/10 rounded-xl"></div>
                </div>
              </div>
            </TabsContent>

            {/* Reception Diary Tab */}
            <TabsContent value="reception" className="space-y-6" data-testid="content-reception">
              <div className="grid lg:grid-cols-2 gap-8 items-center">
                <div className="space-y-6">
                  <div>
                    <Badge className="mb-4" style={{backgroundColor: '#2460A9'}}>
                      <BookOpen className="h-3 w-3 mr-1" />
                      Visitor Excellence
                    </Badge>
                    <h3 className="text-3xl font-bold text-slate-900 dark:text-white mb-4">
                      Professional Visitor Management
                    </h3>
                    <p className="text-lg text-slate-600 dark:text-slate-300 leading-relaxed">
                      Create exceptional first impressions with our comprehensive reception diary system. 
                      Streamline visitor scheduling, automate check-ins, and maintain complete visitor records 
                      for security and compliance.
                    </p>
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center space-x-3">
                      <CheckCircle className="h-5 w-5 text-green-500 flex-shrink-0" />
                      <span className="text-slate-700 dark:text-slate-300">
                        <strong>Smart Scheduling:</strong> Pre-register visitors with automated email invitations and calendar integration
                      </span>
                    </div>
                    <div className="flex items-center space-x-3">
                      <CheckCircle className="h-5 w-5 text-green-500 flex-shrink-0" />
                      <span className="text-slate-700 dark:text-slate-300">
                        <strong>Express Check-In:</strong> Contactless visitor arrival with QR codes and digital signatures
                      </span>
                    </div>
                    <div className="flex items-center space-x-3">
                      <CheckCircle className="h-5 w-5 text-green-500 flex-shrink-0" />
                      <span className="text-slate-700 dark:text-slate-300">
                        <strong>Host Notifications:</strong> Instant alerts to hosts when visitors arrive with location tracking
                      </span>
                    </div>
                  </div>

                  <Button 
                    size="lg" 
                    onClick={() => scrollToSection('contact')}
                    className="text-white"
                    style={{backgroundColor: '#2460A9'}}
                    data-testid="button-reception-demo"
                  >
                    <Eye className="h-4 w-4 mr-2" />
                    See Reception System Live
                  </Button>
                </div>

                <div className="bg-gradient-to-br from-slate-100 to-slate-200 dark:from-slate-800 dark:to-slate-700 rounded-xl p-8">
                  <div className="space-y-4">
                    <h4 className="text-xl font-semibold text-slate-900 dark:text-white">Visitor Journey</h4>
                    <div className="space-y-3">
                      <div className="flex items-center space-x-3 p-3 bg-white dark:bg-slate-800 rounded-lg">
                        <div className="h-8 w-8 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center">
                          <span className="text-sm font-semibold text-blue-600 dark:text-blue-300">1</span>
                        </div>
                        <span className="text-slate-700 dark:text-slate-300">Pre-registration via email</span>
                      </div>
                      <div className="flex items-center space-x-3 p-3 bg-white dark:bg-slate-800 rounded-lg">
                        <div className="h-8 w-8 rounded-full bg-green-100 dark:bg-green-900 flex items-center justify-center">
                          <span className="text-sm font-semibold text-green-600 dark:text-green-300">2</span>
                        </div>
                        <span className="text-slate-700 dark:text-slate-300">Contactless arrival check-in</span>
                      </div>
                      <div className="flex items-center space-x-3 p-3 bg-white dark:bg-slate-800 rounded-lg">
                        <div className="h-8 w-8 rounded-full bg-purple-100 dark:bg-purple-900 flex items-center justify-center">
                          <span className="text-sm font-semibold text-purple-600 dark:text-purple-300">3</span>
                        </div>
                        <span className="text-slate-700 dark:text-slate-300">Automatic host notification</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </TabsContent>

            {/* Meeting Rooms Tab */}
            <TabsContent value="meeting-rooms" className="space-y-6" data-testid="content-meeting-rooms">
              <div className="grid lg:grid-cols-2 gap-8 items-center">
                <div className="space-y-6">
                  <div>
                    <Badge className="mb-4" style={{backgroundColor: '#2460A9'}}>
                      <Calendar className="h-3 w-3 mr-1" />
                      Smart Spaces
                    </Badge>
                    <h3 className="text-3xl font-bold text-slate-900 dark:text-white mb-4">
                      Intelligent Room Management
                    </h3>
                    <p className="text-lg text-slate-600 dark:text-slate-300 leading-relaxed">
                      Maximize facility utilization with intelligent room booking and management. 
                      Integrated calendar systems, equipment tracking, and automated notifications 
                      ensure optimal space usage and seamless meeting experiences.
                    </p>
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center space-x-3">
                      <CheckCircle className="h-5 w-5 text-green-500 flex-shrink-0" />
                      <span className="text-slate-700 dark:text-slate-300">
                        <strong>Calendar Integration:</strong> Seamless booking through Outlook, Google Calendar, and mobile apps
                      </span>
                    </div>
                    <div className="flex items-center space-x-3">
                      <CheckCircle className="h-5 w-5 text-green-500 flex-shrink-0" />
                      <span className="text-slate-700 dark:text-slate-300">
                        <strong>Equipment Management:</strong> Track projectors, whiteboards, and AV equipment with each booking
                      </span>
                    </div>
                    <div className="flex items-center space-x-3">
                      <CheckCircle className="h-5 w-5 text-green-500 flex-shrink-0" />
                      <span className="text-slate-700 dark:text-slate-300">
                        <strong>Usage Analytics:</strong> Optimize space allocation with detailed utilization reports and trends
                      </span>
                    </div>
                  </div>

                  <Button 
                    size="lg" 
                    onClick={() => scrollToSection('contact')}
                    className="text-white"
                    style={{backgroundColor: '#2460A9'}}
                    data-testid="button-rooms-demo"
                  >
                    <Eye className="h-4 w-4 mr-2" />
                    See Room System Live
                  </Button>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <Card className="p-6 bg-white/70 dark:bg-slate-800/70 backdrop-blur-sm">
                    <div className="text-center">
                      <div className="h-12 w-12 bg-green-100 dark:bg-green-900 rounded-lg flex items-center justify-center mx-auto mb-3">
                        <CheckCircle className="h-6 w-6 text-green-600 dark:text-green-300" />
                      </div>
                      <h4 className="font-semibold text-slate-900 dark:text-white mb-2">Available Now</h4>
                      <p className="text-sm text-slate-600 dark:text-slate-400">Board Room A</p>
                    </div>
                  </Card>
                  <Card className="p-6 bg-white/70 dark:bg-slate-800/70 backdrop-blur-sm">
                    <div className="text-center">
                      <div className="h-12 w-12 bg-red-100 dark:bg-red-900 rounded-lg flex items-center justify-center mx-auto mb-3">
                        <Clock className="h-6 w-6 text-red-600 dark:text-red-300" />
                      </div>
                      <h4 className="font-semibold text-slate-900 dark:text-white mb-2">In Use</h4>
                      <p className="text-sm text-slate-600 dark:text-slate-400">Conference Room B</p>
                    </div>
                  </Card>
                  <Card className="p-6 bg-white/70 dark:bg-slate-800/70 backdrop-blur-sm">
                    <div className="text-center">
                      <div className="h-12 w-12 bg-blue-100 dark:bg-blue-900 rounded-lg flex items-center justify-center mx-auto mb-3">
                        <Calendar className="h-6 w-6 text-blue-600 dark:text-blue-300" />
                      </div>
                      <h4 className="font-semibold text-slate-900 dark:text-white mb-2">Booked 2pm</h4>
                      <p className="text-sm text-slate-600 dark:text-slate-400">Training Room C</p>
                    </div>
                  </Card>
                  <Card className="p-6 bg-white/70 dark:bg-slate-800/70 backdrop-blur-sm">
                    <div className="text-center">
                      <div className="h-12 w-12 bg-orange-100 dark:bg-orange-900 rounded-lg flex items-center justify-center mx-auto mb-3">
                        <Settings className="h-6 w-6 text-orange-600 dark:text-orange-300" />
                      </div>
                      <h4 className="font-semibold text-slate-900 dark:text-white mb-2">Maintenance</h4>
                      <p className="text-sm text-slate-600 dark:text-slate-400">Meeting Room D</p>
                    </div>
                  </Card>
                </div>
              </div>
            </TabsContent>

            {/* People Management Tab */}
            <TabsContent value="people" className="space-y-6" data-testid="content-people">
              <div className="grid lg:grid-cols-2 gap-8 items-center">
                <div className="space-y-6">
                  <div>
                    <Badge className="mb-4" style={{backgroundColor: '#2460A9'}}>
                      <Users className="h-3 w-3 mr-1" />
                      Complete Personnel Control
                    </Badge>
                    <h3 className="text-3xl font-bold text-slate-900 dark:text-white mb-4">
                      Unified Personnel Database
                    </h3>
                    <p className="text-lg text-slate-600 dark:text-slate-300 leading-relaxed">
                      Centralize all personnel information in one secure platform. Manage staff, contractors, 
                      and visitors with comprehensive profiles, access permissions, and real-time tracking 
                      for complete site oversight.
                    </p>
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center space-x-3">
                      <CheckCircle className="h-5 w-5 text-green-500 flex-shrink-0" />
                      <span className="text-slate-700 dark:text-slate-300">
                        <strong>Unified Profiles:</strong> Complete personnel records with photos, certifications, and access history
                      </span>
                    </div>
                    <div className="flex items-center space-x-3">
                      <CheckCircle className="h-5 w-5 text-green-500 flex-shrink-0" />
                      <span className="text-slate-700 dark:text-slate-300">
                        <strong>Role-Based Access:</strong> Granular permissions system for different user types and security levels
                      </span>
                    </div>
                    <div className="flex items-center space-x-3">
                      <CheckCircle className="h-5 w-5 text-green-500 flex-shrink-0" />
                      <span className="text-slate-700 dark:text-slate-300">
                        <strong>Live Tracking:</strong> Real-time location and status updates for all personnel on-site
                      </span>
                    </div>
                  </div>

                  <Button 
                    size="lg" 
                    onClick={() => scrollToSection('contact')}
                    className="text-white"
                    style={{backgroundColor: '#2460A9'}}
                    data-testid="button-people-demo"
                  >
                    <Eye className="h-4 w-4 mr-2" />
                    See People System Live
                  </Button>
                </div>

                <div className="space-y-4">
                  <div className="grid grid-cols-3 gap-4 text-center">
                    <div className="bg-white/70 dark:bg-slate-800/70 backdrop-blur-sm rounded-lg p-4">
                      <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">24</div>
                      <div className="text-sm text-slate-600 dark:text-slate-400">Staff On-Site</div>
                    </div>
                    <div className="bg-white/70 dark:bg-slate-800/70 backdrop-blur-sm rounded-lg p-4">
                      <div className="text-2xl font-bold text-green-600 dark:text-green-400">12</div>
                      <div className="text-sm text-slate-600 dark:text-slate-400">Contractors</div>
                    </div>
                    <div className="bg-white/70 dark:bg-slate-800/70 backdrop-blur-sm rounded-lg p-4">
                      <div className="text-2xl font-bold text-orange-600 dark:text-orange-400">8</div>
                      <div className="text-sm text-slate-600 dark:text-slate-400">Visitors</div>
                    </div>
                  </div>
                  
                  <div className="bg-white/70 dark:bg-slate-800/70 backdrop-blur-sm rounded-lg p-6">
                    <h4 className="font-semibold text-slate-900 dark:text-white mb-4">Recent Activity</h4>
                    <div className="space-y-3">
                      <div className="flex items-center space-x-3">
                        <div className="h-8 w-8 bg-green-100 dark:bg-green-900 rounded-full flex items-center justify-center">
                          <UserCheck className="h-4 w-4 text-green-600 dark:text-green-300" />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-slate-900 dark:text-white">John Smith - Check In</p>
                          <p className="text-xs text-slate-500 dark:text-slate-400">Staff • Reception • 2 mins ago</p>
                        </div>
                      </div>
                      <div className="flex items-center space-x-3">
                        <div className="h-8 w-8 bg-blue-100 dark:bg-blue-900 rounded-full flex items-center justify-center">
                          <Users className="h-4 w-4 text-blue-600 dark:text-blue-300" />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-slate-900 dark:text-white">Emma Wilson - Visitor</p>
                          <p className="text-xs text-slate-500 dark:text-slate-400">Meeting Room B • 5 mins ago</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </TabsContent>

            {/* ID Printing Tab */}
            <TabsContent value="id-printing" className="space-y-6" data-testid="content-id-printing">
              <div className="grid lg:grid-cols-2 gap-8 items-center">
                <div className="space-y-6">
                  <div>
                    <Badge className="mb-4" style={{backgroundColor: '#2460A9'}}>
                      <Printer className="h-3 w-3 mr-1" />
                      Professional Identity
                    </Badge>
                    <h3 className="text-3xl font-bold text-slate-900 dark:text-white mb-4">
                      Enterprise-Grade ID Printing
                    </h3>
                    <p className="text-lg text-slate-600 dark:text-slate-300 leading-relaxed">
                      Generate professional thermal ID passes instantly for all personnel. Custom branding, 
                      integrated QR codes, and high-resolution photos create a secure and professional 
                      identification system that enhances your brand image.
                    </p>
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center space-x-3">
                      <CheckCircle className="h-5 w-5 text-green-500 flex-shrink-0" />
                      <span className="text-slate-700 dark:text-slate-300">
                        <strong>Instant Printing:</strong> High-quality thermal ID cards generated in under 30 seconds
                      </span>
                    </div>
                    <div className="flex items-center space-x-3">
                      <CheckCircle className="h-5 w-5 text-green-500 flex-shrink-0" />
                      <span className="text-slate-700 dark:text-slate-300">
                        <strong>Custom Branding:</strong> Company logos, colors, and designs for professional appearance
                      </span>
                    </div>
                    <div className="flex items-center space-x-3">
                      <CheckCircle className="h-5 w-5 text-green-500 flex-shrink-0" />
                      <span className="text-slate-700 dark:text-slate-300">
                        <strong>Smart Integration:</strong> QR codes link to digital profiles and access permissions
                      </span>
                    </div>
                  </div>

                  <Button 
                    size="lg" 
                    onClick={() => scrollToSection('contact')}
                    className="text-white"
                    style={{backgroundColor: '#2460A9'}}
                    data-testid="button-printing-demo"
                  >
                    <Eye className="h-4 w-4 mr-2" />
                    See ID Printing Live
                  </Button>
                </div>

                <div className="relative">
                  <img 
                    src={thermalImg} 
                    alt="Professional ID Card Printing System" 
                    className="rounded-xl shadow-2xl border border-slate-200 dark:border-slate-700 w-full"
                    data-testid="img-thermal-printer"
                  />
                  <div className="absolute -bottom-4 -right-4 bg-white dark:bg-slate-800 rounded-lg p-3 shadow-lg border border-slate-200 dark:border-slate-700">
                    <div className="flex items-center space-x-2">
                      <div className="h-2 w-2 bg-green-500 rounded-full animate-pulse"></div>
                      <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Printing Active</span>
                    </div>
                  </div>
                </div>
              </div>
            </TabsContent>

            {/* QR Access Tab */}
            <TabsContent value="qr-access" className="space-y-6" data-testid="content-qr-access">
              <div className="grid lg:grid-cols-2 gap-8 items-center">
                <div className="space-y-6">
                  <div>
                    <Badge className="mb-4" style={{backgroundColor: '#2460A9'}}>
                      <QrCode className="h-3 w-3 mr-1" />
                      Smart Access Control
                    </Badge>
                    <h3 className="text-3xl font-bold text-slate-900 dark:text-white mb-4">
                      Contactless Access Management
                    </h3>
                    <p className="text-lg text-slate-600 dark:text-slate-300 leading-relaxed">
                      Streamline access control with intelligent QR code technology. Seamlessly integrate 
                      with existing security systems while providing real-time tracking and instant 
                      verification for enhanced security and convenience.
                    </p>
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center space-x-3">
                      <CheckCircle className="h-5 w-5 text-green-500 flex-shrink-0" />
                      <span className="text-slate-700 dark:text-slate-300">
                        <strong>Contactless Entry:</strong> Secure QR code scanning for doors, gates, and restricted areas
                      </span>
                    </div>
                    <div className="flex items-center space-x-3">
                      <CheckCircle className="h-5 w-5 text-green-500 flex-shrink-0" />
                      <span className="text-slate-700 dark:text-slate-300">
                        <strong>System Integration:</strong> Compatible with major access control brands and existing hardware
                      </span>
                    </div>
                    <div className="flex items-center space-x-3">
                      <CheckCircle className="h-5 w-5 text-green-500 flex-shrink-0" />
                      <span className="text-slate-700 dark:text-slate-300">
                        <strong>Real-Time Tracking:</strong> Instant location updates and movement history for all personnel
                      </span>
                    </div>
                  </div>

                  <Button 
                    size="lg" 
                    onClick={() => scrollToSection('contact')}
                    className="text-white"
                    style={{backgroundColor: '#2460A9'}}
                    data-testid="button-qr-demo"
                  >
                    <Eye className="h-4 w-4 mr-2" />
                    See QR Access Live
                  </Button>
                </div>

                <div className="bg-gradient-to-br from-slate-100 to-slate-200 dark:from-slate-800 dark:to-slate-700 rounded-xl p-8">
                  <div className="text-center mb-6">
                    <div className="h-32 w-32 bg-white dark:bg-slate-900 rounded-lg flex items-center justify-center mx-auto mb-4 border-2 border-dashed border-slate-300 dark:border-slate-600">
                      <QrCode className="h-16 w-16 text-slate-400" />
                    </div>
                    <h4 className="text-xl font-semibold text-slate-900 dark:text-white mb-2">Scan to Access</h4>
                    <p className="text-slate-600 dark:text-slate-400">Point camera at QR code for instant verification</p>
                  </div>
                  
                  <div className="space-y-3">
                    <div className="flex items-center justify-between p-3 bg-green-100 dark:bg-green-900/30 rounded-lg">
                      <span className="text-green-800 dark:text-green-200">Reception Area</span>
                      <CheckCircle className="h-4 w-4 text-green-600" />
                    </div>
                    <div className="flex items-center justify-between p-3 bg-green-100 dark:bg-green-900/30 rounded-lg">
                      <span className="text-green-800 dark:text-green-200">Meeting Rooms</span>
                      <CheckCircle className="h-4 w-4 text-green-600" />
                    </div>
                    <div className="flex items-center justify-between p-3 bg-slate-100 dark:bg-slate-700 rounded-lg">
                      <span className="text-slate-600 dark:text-slate-400">Server Room</span>
                      <Lock className="h-4 w-4 text-slate-400" />
                    </div>
                  </div>
                </div>
              </div>
            </TabsContent>

            {/* AI Compliance Tab */}
            <TabsContent value="ai-compliance" className="space-y-6" data-testid="content-ai-compliance">
              <div className="grid lg:grid-cols-2 gap-8 items-center">
                <div className="space-y-6">
                  <div>
                    <Badge className="mb-4" style={{backgroundColor: '#2460A9'}}>
                      <Brain className="h-3 w-3 mr-1" />
                      AI-Powered Compliance
                    </Badge>
                    <h3 className="text-3xl font-bold text-slate-900 dark:text-white mb-4">
                      Automated Legal Management
                    </h3>
                    <p className="text-lg text-slate-600 dark:text-slate-300 leading-relaxed">
                      Eliminate compliance headaches with AI-powered document management and safety inductions. 
                      Automatically track certifications, generate custom safety content, and ensure 100% 
                      legal compliance across all contractors and visitors.
                    </p>
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center space-x-3">
                      <CheckCircle className="h-5 w-5 text-green-500 flex-shrink-0" />
                      <span className="text-slate-700 dark:text-slate-300">
                        <strong>Document Automation:</strong> AI-generated safety inductions and legal forms for any industry
                      </span>
                    </div>
                    <div className="flex items-center space-x-3">
                      <CheckCircle className="h-5 w-5 text-green-500 flex-shrink-0" />
                      <span className="text-slate-700 dark:text-slate-300">
                        <strong>Certification Tracking:</strong> Automatic alerts for expiring insurance and safety certificates
                      </span>
                    </div>
                    <div className="flex items-center space-x-3">
                      <CheckCircle className="h-5 w-5 text-green-500 flex-shrink-0" />
                      <span className="text-slate-700 dark:text-slate-300">
                        <strong>Audit Trail:</strong> Complete compliance history with digital signatures and timestamps
                      </span>
                    </div>
                  </div>

                  <Button 
                    size="lg" 
                    onClick={() => scrollToSection('contact')}
                    className="text-white"
                    style={{backgroundColor: '#2460A9'}}
                    data-testid="button-compliance-demo"
                  >
                    <Eye className="h-4 w-4 mr-2" />
                    See AI Compliance Live
                  </Button>
                </div>

                <div className="space-y-4">
                  <Card className="p-6 bg-white/70 dark:bg-slate-800/70 backdrop-blur-sm">
                    <div className="flex items-center justify-between mb-4">
                      <h4 className="font-semibold text-slate-900 dark:text-white">Compliance Status</h4>
                      <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                        100% Compliant
                      </Badge>
                    </div>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-slate-600 dark:text-slate-400">Safety Inductions</span>
                        <span className="text-sm font-medium text-green-600">24/24 Complete</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-slate-600 dark:text-slate-400">Insurance Certificates</span>
                        <span className="text-sm font-medium text-green-600">Valid</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-slate-600 dark:text-slate-400">Legal Documents</span>
                        <span className="text-sm font-medium text-green-600">Up to Date</span>
                      </div>
                    </div>
                  </Card>

                  <Card className="p-6 bg-white/70 dark:bg-slate-800/70 backdrop-blur-sm">
                    <h4 className="font-semibold text-slate-900 dark:text-white mb-4">AI-Generated Content</h4>
                    <div className="space-y-2 text-sm text-slate-600 dark:text-slate-400">
                      <div className="flex items-center space-x-2">
                        <Brain className="h-4 w-4 text-blue-500" />
                        <span>Construction Site Safety Induction</span>
                      </div>
                      <div className="flex items-center space-x-2">
                        <FileText className="h-4 w-4 text-purple-500" />
                        <span>Visitor Safety Guidelines</span>
                      </div>
                      <div className="flex items-center space-x-2">
                        <ClipboardList className="h-4 w-4 text-green-500" />
                        <span>Contractor Legal Requirements</span>
                      </div>
                    </div>
                  </Card>
                </div>
              </div>
            </TabsContent>

            {/* Emergency Mustering Tab */}
            <TabsContent value="emergency" className="space-y-6" data-testid="content-emergency">
              <div className="grid lg:grid-cols-2 gap-8 items-center">
                <div className="space-y-6">
                  <div>
                    <Badge className="mb-4 bg-red-600">
                      <AlertTriangle className="h-3 w-3 mr-1" />
                      Emergency Response
                    </Badge>
                    <h3 className="text-3xl font-bold text-slate-900 dark:text-white mb-4">
                      Critical Emergency Management
                    </h3>
                    <p className="text-lg text-slate-600 dark:text-slate-300 leading-relaxed">
                      When seconds count, VisiGate Pro provides instant personnel accountability. Real-time 
                      location tracking enables rapid emergency response with complete site visibility 
                      for effective evacuations and emergency mustering.
                    </p>
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center space-x-3">
                      <CheckCircle className="h-5 w-5 text-green-500 flex-shrink-0" />
                      <span className="text-slate-700 dark:text-slate-300">
                        <strong>Instant Headcount:</strong> Real-time personnel count and location data during emergencies
                      </span>
                    </div>
                    <div className="flex items-center space-x-3">
                      <CheckCircle className="h-5 w-5 text-green-500 flex-shrink-0" />
                      <span className="text-slate-700 dark:text-slate-300">
                        <strong>Automated Alerts:</strong> Emergency notifications to responders and management teams
                      </span>
                    </div>
                    <div className="flex items-center space-x-3">
                      <CheckCircle className="h-5 w-5 text-green-500 flex-shrink-0" />
                      <span className="text-slate-700 dark:text-slate-300">
                        <strong>Muster Reports:</strong> Digital roll-call system with missing person identification
                      </span>
                    </div>
                  </div>

                  <Button 
                    size="lg" 
                    onClick={() => scrollToSection('contact')}
                    className="text-white bg-red-600 hover:bg-red-700"
                    data-testid="button-emergency-demo"
                  >
                    <Eye className="h-4 w-4 mr-2" />
                    See Emergency System Live
                  </Button>
                </div>

                <div className="relative">
                  <img 
                    src={kioskImg} 
                    alt="Emergency Mustering System" 
                    className="rounded-xl shadow-2xl border border-slate-200 dark:border-slate-700 w-full"
                    data-testid="img-emergency-system"
                  />
                  <div className="absolute top-4 right-4 bg-red-600 text-white px-3 py-1 rounded-lg text-sm font-medium animate-pulse">
                    Emergency Mode Active
                  </div>
                  <div className="absolute bottom-4 left-4 bg-white dark:bg-slate-800 rounded-lg p-3 shadow-lg border border-slate-200 dark:border-slate-700">
                    <div className="flex items-center space-x-2">
                      <div className="h-2 w-2 bg-red-500 rounded-full animate-pulse"></div>
                      <span className="text-sm font-medium text-slate-700 dark:text-slate-300">44 Personnel Located</span>
                    </div>
                  </div>
                </div>
              </div>
            </TabsContent>

            {/* Multi-Tenant Tab */}
            <TabsContent value="multi-tenant" className="space-y-6" data-testid="content-multi-tenant">
              <div className="grid lg:grid-cols-2 gap-8 items-center">
                <div className="space-y-6">
                  <div>
                    <Badge className="mb-4" style={{backgroundColor: '#2460A9'}}>
                      <Building2 className="h-3 w-3 mr-1" />
                      Enterprise Architecture
                    </Badge>
                    <h3 className="text-3xl font-bold text-slate-900 dark:text-white mb-4">
                      Multi-Tenant Building Management
                    </h3>
                    <p className="text-lg text-slate-600 dark:text-slate-300 leading-relaxed">
                      Perfect for serviced offices, co-working spaces, and multi-building complexes. 
                      Complete data isolation between tenants while maintaining centralized management 
                      and reporting for property managers.
                    </p>
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center space-x-3">
                      <CheckCircle className="h-5 w-5 text-green-500 flex-shrink-0" />
                      <span className="text-slate-700 dark:text-slate-300">
                        <strong>Data Isolation:</strong> Complete privacy between tenants with secure data partitioning
                      </span>
                    </div>
                    <div className="flex items-center space-x-3">
                      <CheckCircle className="h-5 w-5 text-green-500 flex-shrink-0" />
                      <span className="text-slate-700 dark:text-slate-300">
                        <strong>Centralized Management:</strong> Building-wide oversight with tenant-specific permissions
                      </span>
                    </div>
                    <div className="flex items-center space-x-3">
                      <CheckCircle className="h-5 w-5 text-green-500 flex-shrink-0" />
                      <span className="text-slate-700 dark:text-slate-300">
                        <strong>Flexible Billing:</strong> Usage-based reporting for shared services and facilities
                      </span>
                    </div>
                  </div>

                  <Button 
                    size="lg" 
                    onClick={() => scrollToSection('contact')}
                    className="text-white"
                    style={{backgroundColor: '#2460A9'}}
                    data-testid="button-multi-tenant-demo"
                  >
                    <Eye className="h-4 w-4 mr-2" />
                    See Multi-Tenant Live
                  </Button>
                </div>

                <div className="space-y-4">
                  <div className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-slate-800 dark:to-slate-700 rounded-lg p-6">
                    <h4 className="font-semibold text-slate-900 dark:text-white mb-4">Building Overview</h4>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="bg-white dark:bg-slate-800 rounded-lg p-4">
                        <div className="text-2xl font-bold text-blue-600">Floor 1</div>
                        <div className="text-sm text-slate-600 dark:text-slate-400">TechCorp Ltd</div>
                        <div className="text-xs text-green-600">24 People</div>
                      </div>
                      <div className="bg-white dark:bg-slate-800 rounded-lg p-4">
                        <div className="text-2xl font-bold text-green-600">Floor 2</div>
                        <div className="text-sm text-slate-600 dark:text-slate-400">Design Studio</div>
                        <div className="text-xs text-green-600">12 People</div>
                      </div>
                      <div className="bg-white dark:bg-slate-800 rounded-lg p-4">
                        <div className="text-2xl font-bold text-purple-600">Floor 3</div>
                        <div className="text-sm text-slate-600 dark:text-slate-400">Legal Partners</div>
                        <div className="text-xs text-green-600">8 People</div>
                      </div>
                      <div className="bg-white dark:bg-slate-800 rounded-lg p-4">
                        <div className="text-2xl font-bold text-orange-600">Floor 4</div>
                        <div className="text-sm text-slate-600 dark:text-slate-400">Co-working</div>
                        <div className="text-xs text-green-600">16 People</div>
                      </div>
                    </div>
                  </div>

                  <Card className="p-6 bg-white/70 dark:bg-slate-800/70 backdrop-blur-sm">
                    <h4 className="font-semibold text-slate-900 dark:text-white mb-4">Shared Resources</h4>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-slate-600 dark:text-slate-400">Meeting Rooms</span>
                        <span className="font-medium">6 Available</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-600 dark:text-slate-400">Reception Desk</span>
                        <span className="font-medium">Shared Service</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-600 dark:text-slate-400">Parking Spaces</span>
                        <span className="font-medium">12 Allocated</span>
                      </div>
                    </div>
                  </Card>
                </div>
              </div>
            </TabsContent>

            {/* Reports & Analytics Tab */}
            <TabsContent value="reports" className="space-y-6" data-testid="content-reports">
              <div className="grid lg:grid-cols-2 gap-8 items-center">
                <div className="space-y-6">
                  <div>
                    <Badge className="mb-4" style={{backgroundColor: '#2460A9'}}>
                      <TrendingUp className="h-3 w-3 mr-1" />
                      Business Intelligence
                    </Badge>
                    <h3 className="text-3xl font-bold text-slate-900 dark:text-white mb-4">
                      Comprehensive Analytics & Reporting
                    </h3>
                    <p className="text-lg text-slate-600 dark:text-slate-300 leading-relaxed">
                      Transform personnel data into actionable business insights. Comprehensive reporting 
                      suite provides facility utilization, security metrics, and compliance analytics 
                      to optimize operations and reduce costs.
                    </p>
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center space-x-3">
                      <CheckCircle className="h-5 w-5 text-green-500 flex-shrink-0" />
                      <span className="text-slate-700 dark:text-slate-300">
                        <strong>Executive Dashboards:</strong> Real-time KPIs and performance metrics for management
                      </span>
                    </div>
                    <div className="flex items-center space-x-3">
                      <CheckCircle className="h-5 w-5 text-green-500 flex-shrink-0" />
                      <span className="text-slate-700 dark:text-slate-300">
                        <strong>Custom Reports:</strong> Automated report generation with flexible scheduling and formats
                      </span>
                    </div>
                    <div className="flex items-center space-x-3">
                      <CheckCircle className="h-5 w-5 text-green-500 flex-shrink-0" />
                      <span className="text-slate-700 dark:text-slate-300">
                        <strong>Predictive Analytics:</strong> Trend analysis for capacity planning and resource optimization
                      </span>
                    </div>
                  </div>

                  <Button 
                    size="lg" 
                    onClick={() => scrollToSection('contact')}
                    className="text-white"
                    style={{backgroundColor: '#2460A9'}}
                    data-testid="button-reports-demo"
                  >
                    <Eye className="h-4 w-4 mr-2" />
                    See Reports Live
                  </Button>
                </div>

                <div className="space-y-4">
                  <Card className="p-6 bg-white/70 dark:bg-slate-800/70 backdrop-blur-sm">
                    <h4 className="font-semibold text-slate-900 dark:text-white mb-4">This Month</h4>
                    <div className="space-y-4">
                      <div className="flex justify-between items-center">
                        <span className="text-slate-600 dark:text-slate-400">Total Visitors</span>
                        <span className="text-2xl font-bold text-blue-600">1,247</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-slate-600 dark:text-slate-400">Average Daily</span>
                        <span className="text-2xl font-bold text-green-600">42</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-slate-600 dark:text-slate-400">Peak Hour</span>
                        <span className="text-lg font-semibold text-orange-600">9:30 AM</span>
                      </div>
                    </div>
                  </Card>

                  <Card className="p-6 bg-white/70 dark:bg-slate-800/70 backdrop-blur-sm">
                    <h4 className="font-semibold text-slate-900 dark:text-white mb-4">Report Types</h4>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div className="flex items-center space-x-2">
                        <Gauge className="h-4 w-4 text-blue-500" />
                        <span>Occupancy Reports</span>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Shield className="h-4 w-4 text-red-500" />
                        <span>Security Analytics</span>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Clock className="h-4 w-4 text-green-500" />
                        <span>Time & Attendance</span>
                      </div>
                      <div className="flex items-center space-x-2">
                        <FileText className="h-4 w-4 text-purple-500" />
                        <span>Compliance Status</span>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Calendar className="h-4 w-4 text-orange-500" />
                        <span>Room Utilization</span>
                      </div>
                      <div className="flex items-center space-x-2">
                        <TrendingUp className="h-4 w-4 text-indigo-500" />
                        <span>Cost Analysis</span>
                      </div>
                    </div>
                  </Card>
                </div>
              </div>
            </TabsContent>
          </Tabs>

          {/* Call to Action */}
          <div className="text-center pt-12 border-t border-slate-200 dark:border-slate-700">
            <h3 className="text-2xl font-bold text-slate-900 dark:text-white mb-4">
              Ready to Transform Your Personnel Management?
            </h3>
            <p className="text-lg text-slate-600 dark:text-slate-300 mb-6 max-w-2xl mx-auto">
              Join hundreds of companies using VisiGate Pro for complete personnel oversight, 
              compliance management, and emergency preparedness.
            </p>
            <Button 
              size="lg" 
              onClick={() => scrollToSection('contact')}
              className="text-white text-lg px-8"
              style={{backgroundColor: '#2460A9'}}
              data-testid="button-features-cta"
            >
              Start Your Free Trial
              <ArrowRight className="h-5 w-5 ml-2" />
            </Button>
          </div>
        </div>
      </section>

      {/* Industries Section */}
      <section id="industries" className="py-20 scroll-mt-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl lg:text-5xl font-bold text-slate-900 dark:text-white mb-6">
              Trusted Across 
              <span style={{color: '#2460A9'}}>
                {" "}Industries
              </span>
            </h2>
            <p className="text-xl text-slate-600 dark:text-slate-300 max-w-3xl mx-auto">
              From corporate offices to industrial sites, VisiGate Pro adapts to your industry's specific 
              security and compliance requirements.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              { name: "Corporate Offices", icon: Building2, color: "from-blue-500 to-blue-600" },
              { name: "Manufacturing", icon: Shield, color: "from-orange-500 to-orange-600" },
              { name: "Healthcare", icon: Users, color: "from-green-500 to-green-600" },
              { name: "Construction", icon: Clock, color: "from-purple-500 to-purple-600" },
            ].map((industry, index) => (
              <Card key={index} className="group hover:shadow-lg transition-all duration-300 border-0 bg-white/70 dark:bg-slate-800/70 backdrop-blur-sm">
                <CardContent className="p-6 text-center">
                  <div className={`h-12 w-12 bg-gradient-to-br ${industry.color} rounded-lg flex items-center justify-center mx-auto mb-4`}>
                    <industry.icon className="h-6 w-6 text-white" />
                  </div>
                  <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
                    {industry.name}
                  </h3>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Technical Specs */}
      <section className="py-20 bg-white/50 dark:bg-slate-800/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl lg:text-5xl font-bold text-slate-900 dark:text-white mb-6">
              Enterprise-Grade 
              <span style={{color: '#2460A9'}}>
                {" "}Technology
              </span>
            </h2>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            <div className="text-center">
              <div className="h-16 w-16 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl flex items-center justify-center mx-auto mb-4">
                <Globe className="h-8 w-8 text-white" />
              </div>
              <h3 className="text-xl font-semibold text-slate-900 dark:text-white mb-2">Cloud-Native</h3>
              <p className="text-slate-600 dark:text-slate-300">
                Built on modern cloud infrastructure with 99.9% uptime and automatic scaling.
              </p>
            </div>

            <div className="text-center">
              <div className="h-16 w-16 bg-gradient-to-br from-indigo-500 to-indigo-600 rounded-xl flex items-center justify-center mx-auto mb-4">
                <Lock className="h-8 w-8 text-white" />
              </div>
              <h3 className="text-xl font-semibold text-slate-900 dark:text-white mb-2">Bank-Level Security</h3>
              <p className="text-slate-600 dark:text-slate-300">
                End-to-end encryption, GDPR compliant, and SOC 2 certified data protection.
              </p>
            </div>

            <div className="text-center">
              <div className="h-16 w-16 bg-gradient-to-br from-purple-500 to-purple-600 rounded-xl flex items-center justify-center mx-auto mb-4">
                <Zap className="h-8 w-8 text-white" />
              </div>
              <h3 className="text-xl font-semibold text-slate-900 dark:text-white mb-2">Lightning Fast</h3>
              <p className="text-slate-600 dark:text-slate-300">
                React frontend with real-time updates and sub-second response times.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Contact Section */}
      <section id="contact" className="py-20 scroll-mt-24" style={{background: `linear-gradient(135deg, #2460A9 0%, #1e4a87 100%)`}}>
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl lg:text-5xl font-bold text-white mb-6">
            Ready to Transform Your Personnel Management?
          </h2>
          <p className="text-xl text-white/90 mb-8 max-w-2xl mx-auto">
            Join hundreds of companies using VisiGate Pro for complete personnel oversight, 
            compliance management, and emergency preparedness.
          </p>

          <form onSubmit={handleContactSubmit} className="max-w-md mx-auto">
            <div className="flex gap-3">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Enter your email"
                className="flex-1 px-4 py-3 rounded-lg border-0 bg-white/90 text-slate-900 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-white/50"
                required
                data-testid="input-contact-email"
              />
              <Button 
                type="submit" 
                variant="secondary" 
                size="lg"
                className="px-6 bg-white hover:bg-slate-50"
                style={{color: '#2460A9'}}
                disabled={contactMutation.isPending}
                data-testid="button-contact-submit"
              >
                <Mail className="h-4 w-4 mr-2" />
                {contactMutation.isPending ? 'Sending...' : 'Get Demo'}
              </Button>
            </div>
          </form>

          <p className="text-white/70 text-sm mt-4">
            No credit card required • 14-day free trial • Setup in 5 minutes
          </p>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-slate-900 text-white py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-2 gap-8">
            {/* Company Info */}
            <div>
              <div className="flex items-center mb-6">
                <img 
                  src={acsLogo} 
                  alt="ACS Safety & Security Ltd" 
                  className="h-8 w-auto mr-3"
                  data-testid="img-footer-logo"
                />
                <span className="text-xl font-bold">ACS Safety & Security Ltd</span>
              </div>
              <div className="space-y-2 text-slate-300">
                <p className="font-semibold">Business Address:</p>
                <p>Wittas House<br />
                   Two Rivers<br />
                   Station Lane<br />
                   Witney<br />
                   OX28 4BH</p>
                <p className="mt-4">
                  <span className="font-semibold">Phone:</span> +44 1344 771569
                </p>
              </div>
            </div>

            {/* Registered Office */}
            <div>
              <h3 className="text-lg font-semibold mb-4">Registered Office</h3>
              <div className="text-slate-300">
                <p>20-22 Wenlock Road<br />
                   London<br />
                   N1 7GU</p>
              </div>
              
              {/* Additional Links */}
              <div className="mt-8">
                <h4 className="font-semibold mb-3">VisiGate Pro</h4>
                <p className="text-slate-300 text-sm">
                  Comprehensive personnel management system for visitors, contractors, and staff.
                </p>
              </div>
            </div>
          </div>
          
          {/* Bottom Bar */}
          <div className="border-t border-slate-800 mt-8 pt-6 text-center">
            <p className="text-slate-400 text-sm">
              © 2024 ACS Safety & Security Ltd. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}