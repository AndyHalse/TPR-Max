import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Slider } from "@/components/ui/slider";
import { Progress } from "@/components/ui/progress";
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
  Activity,
  Award,
  Server,
  Database,
  Wifi,
  CreditCard,
  Briefcase,
  HeadphonesIcon,
  Quote,
  HardHat,
  Factory,
  Heart,
  GraduationCap,
  Handshake,
  FileCheck,
  UserX,
  School,
  Stethoscope,
  ShieldCheck,
  Target,
  TrendingDown,
  Siren,
  Badge as BadgeIcon,
  UserPlus,
  DollarSign,
  Timer as TimerIcon
} from "lucide-react";

// Import ACS logo and screenshots
import acsLogo from "@assets/acs-logo-2460A9-200px.jpg";
import dashboardImg from "@assets/Screenshot 2025-09-16 at 13.39.01_1758022774224.png";
import kioskImg from "@assets/Screenshot 2025-08-24 at 16.05.36_1756044356361.png";
import thermalImg from "@assets/ID Card printer_1756400844599.png";

export default function MarketingPage() {
  const [email, setEmail] = useState("");
  const [activeTab, setActiveTab] = useState("dashboard");
  
  // ROI Calculator State
  const [companySize, setCompanySize] = useState([250]);
  const [dailyVisitors, setDailyVisitors] = useState([50]);
  const [processTime, setProcessTime] = useState([8]);
  const [hourlyCost, setHourlyCost] = useState([35]);
  const [complianceIncidents, setComplianceIncidents] = useState([6]);
  const [incidentCost, setIncidentCost] = useState([15000]);
  
  const { toast } = useToast();

  // ROI Calculation Functions
  const calculateROI = () => {
    const workingDaysPerYear = 250;
    
    // Current manual process cost
    const currentTimePerDay = dailyVisitors[0] * processTime[0]; // minutes per day
    const currentCostPerDay = (currentTimePerDay / 60) * hourlyCost[0]; // cost per day
    const annualProcessCost = currentCostPerDay * workingDaysPerYear;
    
    // Time savings with VisiGate Pro (90% reduction)
    const annualTimeSaved = (currentTimePerDay * workingDaysPerYear * 0.9) / 60; // hours
    const annualCostSavings = annualTimeSaved * hourlyCost[0];
    
    // Compliance savings
    const complianceRiskReduction = 0.85; // 85% reduction in incidents
    const annualComplianceSavings = complianceIncidents[0] * incidentCost[0] * complianceRiskReduction;
    
    // Total savings
    const totalAnnualSavings = annualCostSavings + annualComplianceSavings;
    
    // VisiGate Pro annual cost (estimated based on company size)
    const monthlySubscription = Math.min(companySize[0] * 12, 15000); // $12 per employee, capped at $15k
    const annualSubscription = monthlySubscription * 12;
    
    // Net savings and ROI
    const netSavings = totalAnnualSavings - annualSubscription;
    const roiPercentage = (netSavings / annualSubscription) * 100;
    const paybackMonths = Math.max(1, Math.round((annualSubscription / totalAnnualSavings) * 12));
    
    return {
      annualTimeSaved: Math.round(annualTimeSaved),
      annualCostSavings: Math.round(annualCostSavings),
      annualComplianceSavings: Math.round(annualComplianceSavings),
      totalAnnualSavings: Math.round(totalAnnualSavings),
      netSavings: Math.round(netSavings),
      roiPercentage: Math.round(roiPercentage),
      paybackMonths,
      processEfficiency: 90,
      complianceImprovement: 85,
      currentTimePerDay: Math.round(currentTimePerDay)
    };
  };

  const roiMetrics = calculateROI();

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
                  <Shield className="h-3 w-3 mr-1" />
                  Enterprise-Ready Security Platform
                </Badge>
                <Badge variant="secondary" className="text-white bg-green-600">
                  <Lock className="h-3 w-3 mr-1" />
                  SOC 2 Compliant
                </Badge>
              </div>
              
              <h1 className="text-4xl lg:text-6xl font-bold text-slate-900 dark:text-white mb-6">
                Reduce Security Risk by 90%
                <span style={{color: '#2460A9'}}>
                  {" "}While Cutting Admin Time in Half
                </span>
              </h1>

              {/* Enterprise Metrics Bar */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8 py-6 px-4 bg-white/70 dark:bg-slate-800/70 backdrop-blur-sm rounded-xl border border-slate-200 dark:border-slate-700">
                <div className="text-center">
                  <div className="text-2xl font-bold text-slate-900 dark:text-white" data-testid="metric-uptime">99.9%</div>
                  <div className="text-sm text-slate-600 dark:text-slate-400">Uptime SLA</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-slate-900 dark:text-white" data-testid="metric-visitors">10K+</div>
                  <div className="text-sm text-slate-600 dark:text-slate-400">Daily Visitors</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-slate-900 dark:text-white" data-testid="metric-compliance">100%</div>
                  <div className="text-sm text-slate-600 dark:text-slate-400">Compliance Rate</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-slate-900 dark:text-white" data-testid="metric-efficiency">50%</div>
                  <div className="text-sm text-slate-600 dark:text-slate-400">Time Savings</div>
                </div>
              </div>
              
              <p className="text-xl text-slate-600 dark:text-slate-300 mb-8 leading-relaxed">
                Transform your facility security and compliance operations with our enterprise-grade personnel management platform. 
                Achieve complete regulatory compliance, eliminate manual processes, and gain real-time visibility across all sites 
                while reducing operational costs and security incidents.
              </p>

              <div className="flex flex-col sm:flex-row gap-4 justify-center lg:justify-start">
                <Button 
                  size="lg" 
                  className="text-lg px-8 shadow-lg hover:shadow-xl transition-shadow" 
                  onClick={() => scrollToSection('contact')} 
                  data-testid="button-get-started"
                  style={{backgroundColor: '#2460A9'}}
                >
                  Start Free Enterprise Trial
                  <ArrowRight className="h-5 w-5 ml-2" />
                </Button>
                <Button 
                  variant="outline" 
                  size="lg" 
                  className="text-lg px-8 border-2 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors" 
                  onClick={() => scrollToSection('roi-calculator')} 
                  data-testid="button-view-demo"
                  style={{borderColor: '#2460A9', color: '#2460A9'}}
                >
                  <Eye className="h-5 w-5 mr-2" />
                  See ROI Calculator
                </Button>
              </div>

              {/* Trust Indicators */}
              <div className="flex flex-col lg:flex-row items-center justify-center lg:justify-start space-y-4 lg:space-y-0 lg:space-x-8 mt-8 pt-8 border-t border-slate-200 dark:border-slate-700">
                <div className="flex items-center space-x-1">
                  {[...Array(5)].map((_, i) => (
                    <Star key={i} className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                  ))}
                  <span className="text-sm text-slate-600 dark:text-slate-400 ml-2">4.9/5 from 200+ enterprise customers</span>
                </div>
                <div className="flex items-center space-x-4 text-sm text-slate-600 dark:text-slate-400">
                  <div className="flex items-center space-x-1">
                    <CheckCircle className="h-4 w-4 text-green-500" />
                    <span>ISO 27001 Certified</span>
                  </div>
                  <div className="flex items-center space-x-1">
                    <CheckCircle className="h-4 w-4 text-green-500" />
                    <span>GDPR Compliant</span>
                  </div>
                  <div className="flex items-center space-x-1">
                    <CheckCircle className="h-4 w-4 text-green-500" />
                    <span>24/7 Support</span>
                  </div>
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
                    alt="Professional Thermal ID Card Printer - High-quality card printing system for visitor badges, employee IDs, and contractor passes with enterprise-grade security features" 
                    className="rounded-xl shadow-2xl border border-slate-200 dark:border-slate-700 w-full"
                    data-testid="img-thermal-printer"
                    loading="lazy"
                    width="400"
                    height="300"
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
                    alt="VisiGate Pro Digital Reception Kiosk - Self-service visitor check-in interface with touchscreen navigation, QR code scanning, and automated host notifications" 
                    className="rounded-xl shadow-2xl border border-slate-200 dark:border-slate-700 w-full"
                    data-testid="img-emergency-system"
                    loading="lazy"
                    width="800"
                    height="600"
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

      {/* Enterprise Credibility Section */}
      <section className="py-20 bg-gradient-to-br from-slate-50 via-white to-slate-100 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          
          {/* Security & Compliance */}
          <div className="mb-20">
            <div className="text-center mb-12">
              <h2 className="text-3xl lg:text-4xl font-bold text-slate-900 dark:text-white mb-4">
                Enterprise-Grade Security & Compliance
              </h2>
              <p className="text-xl text-slate-600 dark:text-slate-300 max-w-3xl mx-auto">
                Built to exceed the highest security standards with comprehensive compliance coverage for global enterprises.
              </p>
            </div>

            <div className="grid md:grid-cols-3 gap-8">
              {/* Security Standards */}
              <Card className="p-8 bg-white/70 dark:bg-slate-800/70 backdrop-blur-sm border-0 shadow-xl" data-testid="card-security-standards">
                <div className="text-center">
                  <div className="h-16 w-16 bg-gradient-to-br from-green-500 to-green-600 rounded-2xl flex items-center justify-center mx-auto mb-6">
                    <Shield className="h-8 w-8 text-white" />
                  </div>
                  <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-4">Security Certifications</h3>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between p-3 bg-green-50 dark:bg-green-900/20 rounded-lg">
                      <span className="text-slate-700 dark:text-slate-300 font-medium">SOC 2 Type II</span>
                      <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200" data-testid="badge-soc2">
                        <CheckCircle className="h-3 w-3 mr-1" />
                        Certified
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                      <span className="text-slate-700 dark:text-slate-300 font-medium">ISO 27001</span>
                      <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200" data-testid="badge-iso27001">
                        <CheckCircle className="h-3 w-3 mr-1" />
                        Certified
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between p-3 bg-purple-50 dark:bg-purple-900/20 rounded-lg">
                      <span className="text-slate-700 dark:text-slate-300 font-medium">GDPR Compliant</span>
                      <Badge className="bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200" data-testid="badge-gdpr">
                        <CheckCircle className="h-3 w-3 mr-1" />
                        Verified
                      </Badge>
                    </div>
                  </div>
                </div>
              </Card>

              {/* Enterprise Features */}
              <Card className="p-8 bg-white/70 dark:bg-slate-800/70 backdrop-blur-sm border-0 shadow-xl" data-testid="card-enterprise-features">
                <div className="text-center">
                  <div className="h-16 w-16 bg-gradient-to-br from-blue-500 to-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-6">
                    <Lock className="h-8 w-8 text-white" />
                  </div>
                  <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-4">Security Features</h3>
                  <div className="space-y-3 text-left">
                    <div className="flex items-center space-x-3">
                      <CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0" />
                      <span className="text-slate-700 dark:text-slate-300 text-sm">End-to-end encryption (AES-256)</span>
                    </div>
                    <div className="flex items-center space-x-3">
                      <CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0" />
                      <span className="text-slate-700 dark:text-slate-300 text-sm">Multi-factor authentication</span>
                    </div>
                    <div className="flex items-center space-x-3">
                      <CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0" />
                      <span className="text-slate-700 dark:text-slate-300 text-sm">Role-based access control</span>
                    </div>
                    <div className="flex items-center space-x-3">
                      <CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0" />
                      <span className="text-slate-700 dark:text-slate-300 text-sm">Audit trail & logging</span>
                    </div>
                    <div className="flex items-center space-x-3">
                      <CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0" />
                      <span className="text-slate-700 dark:text-slate-300 text-sm">Data residency controls</span>
                    </div>
                    <div className="flex items-center space-x-3">
                      <CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0" />
                      <span className="text-slate-700 dark:text-slate-300 text-sm">Regular penetration testing</span>
                    </div>
                  </div>
                </div>
              </Card>

              {/* Compliance Standards */}
              <Card className="p-8 bg-white/70 dark:bg-slate-800/70 backdrop-blur-sm border-0 shadow-xl" data-testid="card-compliance-standards">
                <div className="text-center">
                  <div className="h-16 w-16 bg-gradient-to-br from-purple-500 to-purple-600 rounded-2xl flex items-center justify-center mx-auto mb-6">
                    <Award className="h-8 w-8 text-white" />
                  </div>
                  <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-4">Compliance Standards</h3>
                  <div className="space-y-3 text-left">
                    <div className="flex items-center space-x-3">
                      <CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0" />
                      <span className="text-slate-700 dark:text-slate-300 text-sm">HIPAA compliance for healthcare</span>
                    </div>
                    <div className="flex items-center space-x-3">
                      <CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0" />
                      <span className="text-slate-700 dark:text-slate-300 text-sm">FedRAMP authorized</span>
                    </div>
                    <div className="flex items-center space-x-3">
                      <CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0" />
                      <span className="text-slate-700 dark:text-slate-300 text-sm">PCI DSS Level 1</span>
                    </div>
                    <div className="flex items-center space-x-3">
                      <CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0" />
                      <span className="text-slate-700 dark:text-slate-300 text-sm">UK Data Protection Act</span>
                    </div>
                    <div className="flex items-center space-x-3">
                      <CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0" />
                      <span className="text-slate-700 dark:text-slate-300 text-sm">CCPA compliant</span>
                    </div>
                    <div className="flex items-center space-x-3">
                      <CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0" />
                      <span className="text-slate-700 dark:text-slate-300 text-sm">Industry-specific regulations</span>
                    </div>
                  </div>
                </div>
              </Card>
            </div>
          </div>

          {/* Integration Partners */}
          <div className="mb-20">
            <div className="text-center mb-12">
              <h2 className="text-3xl lg:text-4xl font-bold text-slate-900 dark:text-white mb-4">
                Seamless Enterprise Integrations
              </h2>
              <p className="text-xl text-slate-600 dark:text-slate-300 max-w-3xl mx-auto">
                Connect with your existing systems in minutes. Over 100+ pre-built integrations with enterprise platforms.
              </p>
            </div>

            <div className="grid md:grid-cols-3 gap-8 mb-12">
              {/* Access Control Systems */}
              <Card className="p-6 bg-white/70 dark:bg-slate-800/70 backdrop-blur-sm border-0 shadow-lg" data-testid="card-access-control-integrations">
                <div className="text-center">
                  <div className="h-12 w-12 bg-gradient-to-br from-red-500 to-red-600 rounded-lg flex items-center justify-center mx-auto mb-4">
                    <Lock className="h-6 w-6 text-white" />
                  </div>
                  <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-3">Access Control</h3>
                  <div className="space-y-2 text-sm text-slate-600 dark:text-slate-400">
                    <div className="flex items-center justify-center space-x-2">
                      <div className="h-8 w-8 bg-slate-200 dark:bg-slate-700 rounded flex items-center justify-center">
                        <span className="text-xs font-bold">HID</span>
                      </div>
                      <span>HID Global</span>
                    </div>
                    <div className="flex items-center justify-center space-x-2">
                      <div className="h-8 w-8 bg-slate-200 dark:bg-slate-700 rounded flex items-center justify-center">
                        <span className="text-xs font-bold">LN</span>
                      </div>
                      <span>Lenel OnGuard</span>
                    </div>
                    <div className="flex items-center justify-center space-x-2">
                      <div className="h-8 w-8 bg-slate-200 dark:bg-slate-700 rounded flex items-center justify-center">
                        <span className="text-xs font-bold">KC</span>
                      </div>
                      <span>Kisi Cloud</span>
                    </div>
                  </div>
                </div>
              </Card>

              {/* HR Systems */}
              <Card className="p-6 bg-white/70 dark:bg-slate-800/70 backdrop-blur-sm border-0 shadow-lg" data-testid="card-hr-integrations">
                <div className="text-center">
                  <div className="h-12 w-12 bg-gradient-to-br from-green-500 to-green-600 rounded-lg flex items-center justify-center mx-auto mb-4">
                    <Users className="h-6 w-6 text-white" />
                  </div>
                  <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-3">HR Systems</h3>
                  <div className="space-y-2 text-sm text-slate-600 dark:text-slate-400">
                    <div className="flex items-center justify-center space-x-2">
                      <div className="h-8 w-8 bg-slate-200 dark:bg-slate-700 rounded flex items-center justify-center">
                        <span className="text-xs font-bold">WD</span>
                      </div>
                      <span>Workday</span>
                    </div>
                    <div className="flex items-center justify-center space-x-2">
                      <div className="h-8 w-8 bg-slate-200 dark:bg-slate-700 rounded flex items-center justify-center">
                        <span className="text-xs font-bold">AD</span>
                      </div>
                      <span>Active Directory</span>
                    </div>
                    <div className="flex items-center justify-center space-x-2">
                      <div className="h-8 w-8 bg-slate-200 dark:bg-slate-700 rounded flex items-center justify-center">
                        <span className="text-xs font-bold">OK</span>
                      </div>
                      <span>Okta</span>
                    </div>
                  </div>
                </div>
              </Card>

              {/* Communication Systems */}
              <Card className="p-6 bg-white/70 dark:bg-slate-800/70 backdrop-blur-sm border-0 shadow-lg" data-testid="card-communication-integrations">
                <div className="text-center">
                  <div className="h-12 w-12 bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg flex items-center justify-center mx-auto mb-4">
                    <Wifi className="h-6 w-6 text-white" />
                  </div>
                  <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-3">Communication</h3>
                  <div className="space-y-2 text-sm text-slate-600 dark:text-slate-400">
                    <div className="flex items-center justify-center space-x-2">
                      <div className="h-8 w-8 bg-slate-200 dark:bg-slate-700 rounded flex items-center justify-center">
                        <span className="text-xs font-bold">MS</span>
                      </div>
                      <span>Microsoft Teams</span>
                    </div>
                    <div className="flex items-center justify-center space-x-2">
                      <div className="h-8 w-8 bg-slate-200 dark:bg-slate-700 rounded flex items-center justify-center">
                        <span className="text-xs font-bold">SL</span>
                      </div>
                      <span>Slack</span>
                    </div>
                    <div className="flex items-center justify-center space-x-2">
                      <div className="h-8 w-8 bg-slate-200 dark:bg-slate-700 rounded flex items-center justify-center">
                        <span className="text-xs font-bold">ZM</span>
                      </div>
                      <span>Zoom</span>
                    </div>
                  </div>
                </div>
              </Card>
            </div>

            <div className="text-center">
              <Badge className="text-lg px-4 py-2" style={{backgroundColor: '#2460A9'}} data-testid="badge-integration-count">
                <Server className="h-4 w-4 mr-2" />
                100+ Enterprise Integrations Available
              </Badge>
            </div>
          </div>

          {/* Customer Testimonials */}
          <div className="mb-20">
            <div className="text-center mb-12">
              <h2 className="text-3xl lg:text-4xl font-bold text-slate-900 dark:text-white mb-4">
                Trusted by Enterprise Leaders
              </h2>
              <p className="text-xl text-slate-600 dark:text-slate-300 max-w-3xl mx-auto">
                See why security directors, CTOs, and facilities managers choose VisiGate Pro for their critical operations.
              </p>
            </div>

            <div className="grid md:grid-cols-3 gap-8">
              {/* Testimonial 1 */}
              <Card className="p-8 bg-white/70 dark:bg-slate-800/70 backdrop-blur-sm border-0 shadow-xl relative" data-testid="card-testimonial-1">
                <Quote className="h-8 w-8 text-slate-400 mb-4" />
                <blockquote className="text-slate-700 dark:text-slate-300 mb-6 leading-relaxed">
                  "VisiGate Pro reduced our security incidents by 90% and cut manual compliance work from 40 hours to 2 hours per week. The ROI was immediate and the peace of mind is invaluable."
                </blockquote>
                <div className="flex items-center space-x-3">
                  <div className="h-12 w-12 bg-gradient-to-br from-blue-500 to-blue-600 rounded-full flex items-center justify-center">
                    <span className="text-white font-bold text-sm">TG</span>
                  </div>
                  <div>
                    <div className="font-semibold text-slate-900 dark:text-white">Sarah Mitchell</div>
                    <div className="text-sm text-slate-600 dark:text-slate-400">CTO, TechGlobal Corp</div>
                    <div className="text-xs text-slate-500 dark:text-slate-500">15,000+ employees</div>
                  </div>
                </div>
              </Card>

              {/* Testimonial 2 */}
              <Card className="p-8 bg-white/70 dark:bg-slate-800/70 backdrop-blur-sm border-0 shadow-xl relative" data-testid="card-testimonial-2">
                <Quote className="h-8 w-8 text-slate-400 mb-4" />
                <blockquote className="text-slate-700 dark:text-slate-300 mb-6 leading-relaxed">
                  "Implementation took just 3 days across our 12 facilities. The emergency mustering system proved crucial during our fire drill - we located all 2,400 personnel in under 2 minutes."
                </blockquote>
                <div className="flex items-center space-x-3">
                  <div className="h-12 w-12 bg-gradient-to-br from-green-500 to-green-600 rounded-full flex items-center justify-center">
                    <span className="text-white font-bold text-sm">MI</span>
                  </div>
                  <div>
                    <div className="font-semibold text-slate-900 dark:text-white">James Richardson</div>
                    <div className="text-sm text-slate-600 dark:text-slate-400">Security Director, ManufacturingInc</div>
                    <div className="text-xs text-slate-500 dark:text-slate-500">12 facilities worldwide</div>
                  </div>
                </div>
              </Card>

              {/* Testimonial 3 */}
              <Card className="p-8 bg-white/70 dark:bg-slate-800/70 backdrop-blur-sm border-0 shadow-xl relative" data-testid="card-testimonial-3">
                <Quote className="h-8 w-8 text-slate-400 mb-4" />
                <blockquote className="text-slate-700 dark:text-slate-300 mb-6 leading-relaxed">
                  "The AI compliance features saved us $2.3M annually in legal and admin costs. Audit preparation went from 6 weeks to 2 days with 100% accuracy on all documentation."
                </blockquote>
                <div className="flex items-center space-x-3">
                  <div className="h-12 w-12 bg-gradient-to-br from-purple-500 to-purple-600 rounded-full flex items-center justify-center">
                    <span className="text-white font-bold text-sm">HC</span>
                  </div>
                  <div>
                    <div className="font-semibold text-slate-900 dark:text-white">Maria Rodriguez</div>
                    <div className="text-sm text-slate-600 dark:text-slate-400">Facilities Manager, HealthCare Plus</div>
                    <div className="text-xs text-slate-500 dark:text-slate-500">25 hospital network</div>
                  </div>
                </div>
              </Card>
            </div>
          </div>

          {/* Trust Indicators */}
          <div className="text-center">
            <h2 className="text-3xl lg:text-4xl font-bold text-slate-900 dark:text-white mb-8">
              Enterprise Trust & Reliability
            </h2>
            
            <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-12">
              {/* Trusted Organizations */}
              <div className="text-center" data-testid="trust-indicator-organizations">
                <div className="h-16 w-16 bg-gradient-to-br from-blue-500 to-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <Building2 className="h-8 w-8 text-white" />
                </div>
                <div className="text-3xl font-bold text-slate-900 dark:text-white mb-2">500+</div>
                <div className="text-slate-600 dark:text-slate-400">Organizations</div>
                <div className="text-sm text-slate-500 dark:text-slate-500">Fortune 500 companies</div>
              </div>

              {/* Uptime SLA */}
              <div className="text-center" data-testid="trust-indicator-uptime">
                <div className="h-16 w-16 bg-gradient-to-br from-green-500 to-green-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <Server className="h-8 w-8 text-white" />
                </div>
                <div className="text-3xl font-bold text-slate-900 dark:text-white mb-2">99.9%</div>
                <div className="text-slate-600 dark:text-slate-400">Uptime SLA</div>
                <div className="text-sm text-slate-500 dark:text-slate-500">Guaranteed availability</div>
              </div>

              {/* Support */}
              <div className="text-center" data-testid="trust-indicator-support">
                <div className="h-16 w-16 bg-gradient-to-br from-purple-500 to-purple-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <HeadphonesIcon className="h-8 w-8 text-white" />
                </div>
                <div className="text-3xl font-bold text-slate-900 dark:text-white mb-2">24/7</div>
                <div className="text-slate-600 dark:text-slate-400">Enterprise Support</div>
                <div className="text-sm text-slate-500 dark:text-slate-500">Dedicated success team</div>
              </div>

              {/* Response Time */}
              <div className="text-center" data-testid="trust-indicator-response">
                <div className="h-16 w-16 bg-gradient-to-br from-orange-500 to-orange-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <Clock className="h-8 w-8 text-white" />
                </div>
                <div className="text-3xl font-bold text-slate-900 dark:text-white mb-2">&lt;15min</div>
                <div className="text-slate-600 dark:text-slate-400">Response Time</div>
                <div className="text-sm text-slate-500 dark:text-slate-500">Critical issue support</div>
              </div>
            </div>

            <div className="flex flex-wrap justify-center items-center gap-6 pt-8 border-t border-slate-200 dark:border-slate-700">
              <div className="flex items-center space-x-2">
                {[...Array(5)].map((_, i) => (
                  <Star key={i} className="h-5 w-5 fill-yellow-400 text-yellow-400" />
                ))}
                <span className="text-slate-600 dark:text-slate-400 ml-2">4.9/5 Enterprise Rating</span>
              </div>
              <div className="flex items-center space-x-2 text-slate-600 dark:text-slate-400">
                <CheckCircle className="h-5 w-5 text-green-500" />
                <span>Enterprise Customer Success Program</span>
              </div>
              <div className="flex items-center space-x-2 text-slate-600 dark:text-slate-400">
                <Award className="h-5 w-5 text-blue-500" />
                <span>Industry Awards Winner 2024</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Industry-Specific Solutions Section */}
      <section id="industries" className="py-20 bg-gradient-to-br from-slate-50 via-white to-slate-100 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900 scroll-mt-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl lg:text-5xl font-bold text-slate-900 dark:text-white mb-6">
              Tailored for 
              <span style={{color: '#2460A9'}}>
                {" "}Your Industry
              </span>
            </h2>
            <p className="text-xl text-slate-600 dark:text-slate-300 max-w-3xl mx-auto">
              VisiGate Pro adapts to serve diverse organizational needs with industry-specific features, 
              compliance requirements, and security protocols that matter most to your sector.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-12">
            {/* Corporate Offices */}
            <Card className="p-8 bg-white/70 dark:bg-slate-800/70 backdrop-blur-sm border-0 shadow-xl" data-testid="card-corporate-offices">
              <div className="space-y-6">
                <div className="flex items-center space-x-4">
                  <div className="h-16 w-16 bg-gradient-to-br from-blue-500 to-blue-600 rounded-2xl flex items-center justify-center">
                    <Building2 className="h-8 w-8 text-white" />
                  </div>
                  <div>
                    <h3 className="text-2xl font-bold text-slate-900 dark:text-white">Corporate Offices</h3>
                    <p className="text-lg text-slate-600 dark:text-slate-300">Professional visitor experience and executive efficiency</p>
                  </div>
                </div>

                <div className="space-y-4">
                  <h4 className="text-lg font-semibold text-slate-900 dark:text-white">Key Challenges Solved:</h4>
                  <div className="space-y-3">
                    <div className="flex items-start space-x-3">
                      <UserX className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
                      <div>
                        <span className="font-medium text-slate-900 dark:text-white">Unprofessional visitor experiences</span>
                        <p className="text-sm text-slate-600 dark:text-slate-400">Eliminate paper logs and long wait times</p>
                      </div>
                    </div>
                    <div className="flex items-start space-x-3">
                      <TimerIcon className="h-5 w-5 text-orange-500 flex-shrink-0 mt-0.5" />
                      <div>
                        <span className="font-medium text-slate-900 dark:text-white">Meeting room inefficiencies</span>
                        <p className="text-sm text-slate-600 dark:text-slate-400">Optimize space utilization and booking conflicts</p>
                      </div>
                    </div>
                    <div className="flex items-start space-x-3">
                      <TrendingDown className="h-5 w-5 text-purple-500 flex-shrink-0 mt-0.5" />
                      <div>
                        <span className="font-medium text-slate-900 dark:text-white">Staff productivity losses</span>
                        <p className="text-sm text-slate-600 dark:text-slate-400">Reduce administrative overhead and interruptions</p>
                      </div>
                    </div>
                    <div className="flex items-start space-x-3">
                      <ShieldCheck className="h-5 w-5 text-blue-500 flex-shrink-0 mt-0.5" />
                      <div>
                        <span className="font-medium text-slate-900 dark:text-white">Security compliance gaps</span>
                        <p className="text-sm text-slate-600 dark:text-slate-400">Meet corporate governance and audit requirements</p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4">
                  <h5 className="font-semibold text-slate-900 dark:text-white mb-2">Corporate Benefits:</h5>
                  <ul className="text-sm text-slate-700 dark:text-slate-300 space-y-1">
                    <li>• Executive-level visitor experience with branded touchpoints</li>
                    <li>• 60% faster meeting room turnover and utilization</li>
                    <li>• Automated compliance reporting for audits</li>
                    <li>• Integration with corporate calendars and directory systems</li>
                  </ul>
                </div>

                <Button 
                  size="lg" 
                  onClick={() => scrollToSection('contact')}
                  className="w-full text-white"
                  style={{backgroundColor: '#2460A9'}}
                  data-testid="button-corporate-solution"
                >
                  <Eye className="h-4 w-4 mr-2" />
                  See Corporate Solution
                </Button>
              </div>
            </Card>

            {/* Manufacturing & Industrial */}
            <Card className="p-8 bg-white/70 dark:bg-slate-800/70 backdrop-blur-sm border-0 shadow-xl" data-testid="card-manufacturing-industrial">
              <div className="space-y-6">
                <div className="flex items-center space-x-4">
                  <div className="h-16 w-16 bg-gradient-to-br from-orange-500 to-orange-600 rounded-2xl flex items-center justify-center">
                    <Factory className="h-8 w-8 text-white" />
                  </div>
                  <div>
                    <h3 className="text-2xl font-bold text-slate-900 dark:text-white">Manufacturing & Industrial</h3>
                    <p className="text-lg text-slate-600 dark:text-slate-300">Contractor safety and regulatory compliance</p>
                  </div>
                </div>

                <div className="space-y-4">
                  <h4 className="text-lg font-semibold text-slate-900 dark:text-white">Key Challenges Solved:</h4>
                  <div className="space-y-3">
                    <div className="flex items-start space-x-3">
                      <HardHat className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
                      <div>
                        <span className="font-medium text-slate-900 dark:text-white">Contractor safety verification</span>
                        <p className="text-sm text-slate-600 dark:text-slate-400">Automate cert checks and safety inductions</p>
                      </div>
                    </div>
                    <div className="flex items-start space-x-3">
                      <FileCheck className="h-5 w-5 text-green-500 flex-shrink-0 mt-0.5" />
                      <div>
                        <span className="font-medium text-slate-900 dark:text-white">Compliance documentation</span>
                        <p className="text-sm text-slate-600 dark:text-slate-400">OSHA, MSHA, and industry-specific requirements</p>
                      </div>
                    </div>
                    <div className="flex items-start space-x-3">
                      <Siren className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
                      <div>
                        <span className="font-medium text-slate-900 dark:text-white">Emergency response delays</span>
                        <p className="text-sm text-slate-600 dark:text-slate-400">Instant personnel location and evacuation management</p>
                      </div>
                    </div>
                    <div className="flex items-start space-x-3">
                      <DollarSign className="h-5 w-5 text-purple-500 flex-shrink-0 mt-0.5" />
                      <div>
                        <span className="font-medium text-slate-900 dark:text-white">Insurance liability exposure</span>
                        <p className="text-sm text-slate-600 dark:text-slate-400">Comprehensive audit trails and safety compliance</p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="bg-orange-50 dark:bg-orange-900/20 rounded-lg p-4">
                  <h5 className="font-semibold text-slate-900 dark:text-white mb-2">Industrial Benefits:</h5>
                  <ul className="text-sm text-slate-700 dark:text-slate-300 space-y-1">
                    <li>• 90% reduction in safety incidents through automated verification</li>
                    <li>• Real-time emergency mustering for all site personnel</li>
                    <li>• Automated OSHA and regulatory compliance reporting</li>
                    <li>• Integration with existing safety management systems</li>
                  </ul>
                </div>

                <Button 
                  size="lg" 
                  onClick={() => scrollToSection('contact')}
                  className="w-full text-white bg-orange-600 hover:bg-orange-700"
                  data-testid="button-manufacturing-solution"
                >
                  <Eye className="h-4 w-4 mr-2" />
                  See Industrial Solution
                </Button>
              </div>
            </Card>

            {/* Healthcare Facilities */}
            <Card className="p-8 bg-white/70 dark:bg-slate-800/70 backdrop-blur-sm border-0 shadow-xl" data-testid="card-healthcare-facilities">
              <div className="space-y-6">
                <div className="flex items-center space-x-4">
                  <div className="h-16 w-16 bg-gradient-to-br from-green-500 to-green-600 rounded-2xl flex items-center justify-center">
                    <Stethoscope className="h-8 w-8 text-white" />
                  </div>
                  <div>
                    <h3 className="text-2xl font-bold text-slate-900 dark:text-white">Healthcare Facilities</h3>
                    <p className="text-lg text-slate-600 dark:text-slate-300">Patient safety and HIPAA compliance</p>
                  </div>
                </div>

                <div className="space-y-4">
                  <h4 className="text-lg font-semibold text-slate-900 dark:text-white">Key Challenges Solved:</h4>
                  <div className="space-y-3">
                    <div className="flex items-start space-x-3">
                      <Heart className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
                      <div>
                        <span className="font-medium text-slate-900 dark:text-white">Patient visitor control</span>
                        <p className="text-sm text-slate-600 dark:text-slate-400">Restrict access to sensitive areas and patient rooms</p>
                      </div>
                    </div>
                    <div className="flex items-start space-x-3">
                      <BadgeIcon className="h-5 w-5 text-blue-500 flex-shrink-0 mt-0.5" />
                      <div>
                        <span className="font-medium text-slate-900 dark:text-white">Staff credentialing verification</span>
                        <p className="text-sm text-slate-600 dark:text-slate-400">Automated license and certification validation</p>
                      </div>
                    </div>
                    <div className="flex items-start space-x-3">
                      <ShieldCheck className="h-5 w-5 text-green-500 flex-shrink-0 mt-0.5" />
                      <div>
                        <span className="font-medium text-slate-900 dark:text-white">Infection control protocols</span>
                        <p className="text-sm text-slate-600 dark:text-slate-400">Contact tracing and health screening workflows</p>
                      </div>
                    </div>
                    <div className="flex items-start space-x-3">
                      <FileCheck className="h-5 w-5 text-purple-500 flex-shrink-0 mt-0.5" />
                      <div>
                        <span className="font-medium text-slate-900 dark:text-white">HIPAA compliance gaps</span>
                        <p className="text-sm text-slate-600 dark:text-slate-400">Secure visitor logs and access audit trails</p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-4">
                  <h5 className="font-semibold text-slate-900 dark:text-white mb-2">Healthcare Benefits:</h5>
                  <ul className="text-sm text-slate-700 dark:text-slate-300 space-y-1">
                    <li>• HIPAA-compliant visitor management with secure data handling</li>
                    <li>• Automated staff credential verification and renewal alerts</li>
                    <li>• Real-time contact tracing for infection control</li>
                    <li>• Integration with hospital access control and paging systems</li>
                  </ul>
                </div>

                <Button 
                  size="lg" 
                  onClick={() => scrollToSection('contact')}
                  className="w-full text-white bg-green-600 hover:bg-green-700"
                  data-testid="button-healthcare-solution"
                >
                  <Eye className="h-4 w-4 mr-2" />
                  See Healthcare Solution
                </Button>
              </div>
            </Card>

            {/* Educational Institutions */}
            <Card className="p-8 bg-white/70 dark:bg-slate-800/70 backdrop-blur-sm border-0 shadow-xl" data-testid="card-educational-institutions">
              <div className="space-y-6">
                <div className="flex items-center space-x-4">
                  <div className="h-16 w-16 bg-gradient-to-br from-purple-500 to-purple-600 rounded-2xl flex items-center justify-center">
                    <GraduationCap className="h-8 w-8 text-white" />
                  </div>
                  <div>
                    <h3 className="text-2xl font-bold text-slate-900 dark:text-white">Educational Institutions</h3>
                    <p className="text-lg text-slate-600 dark:text-slate-300">Campus security and student safety</p>
                  </div>
                </div>

                <div className="space-y-4">
                  <h4 className="text-lg font-semibold text-slate-900 dark:text-white">Key Challenges Solved:</h4>
                  <div className="space-y-3">
                    <div className="flex items-start space-x-3">
                      <School className="h-5 w-5 text-blue-500 flex-shrink-0 mt-0.5" />
                      <div>
                        <span className="font-medium text-slate-900 dark:text-white">Campus security risks</span>
                        <p className="text-sm text-slate-600 dark:text-slate-400">Control access to dormitories, labs, and facilities</p>
                      </div>
                    </div>
                    <div className="flex items-start space-x-3">
                      <UserPlus className="h-5 w-5 text-green-500 flex-shrink-0 mt-0.5" />
                      <div>
                        <span className="font-medium text-slate-900 dark:text-white">Student and faculty tracking</span>
                        <p className="text-sm text-slate-600 dark:text-slate-400">Attendance monitoring and location services</p>
                      </div>
                    </div>
                    <div className="flex items-start space-x-3">
                      <UserX className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
                      <div>
                        <span className="font-medium text-slate-900 dark:text-white">Visitor screening challenges</span>
                        <p className="text-sm text-slate-600 dark:text-slate-400">Background checks and restricted area access</p>
                      </div>
                    </div>
                    <div className="flex items-start space-x-3">
                      <Siren className="h-5 w-5 text-orange-500 flex-shrink-0 mt-0.5" />
                      <div>
                        <span className="font-medium text-slate-900 dark:text-white">Emergency response coordination</span>
                        <p className="text-sm text-slate-600 dark:text-slate-400">Campus-wide alerts and evacuation management</p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="bg-purple-50 dark:bg-purple-900/20 rounded-lg p-4">
                  <h5 className="font-semibold text-slate-900 dark:text-white mb-2">Educational Benefits:</h5>
                  <ul className="text-sm text-slate-700 dark:text-slate-300 space-y-1">
                    <li>• Campus-wide emergency notification and mustering system</li>
                    <li>• Automated visitor screening with background check integration</li>
                    <li>• Student attendance tracking and parent notification</li>
                    <li>• Integration with existing student information systems</li>
                  </ul>
                </div>

                <Button 
                  size="lg" 
                  onClick={() => scrollToSection('contact')}
                  className="w-full text-white bg-purple-600 hover:bg-purple-700"
                  data-testid="button-educational-solution"
                >
                  <Eye className="h-4 w-4 mr-2" />
                  See Educational Solution
                </Button>
              </div>
            </Card>
          </div>

          {/* Industry CTA Section */}
          <div className="text-center mt-16 p-8 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-slate-800 dark:to-slate-700 rounded-2xl border border-slate-200 dark:border-slate-600">
            <h3 className="text-2xl font-bold text-slate-900 dark:text-white mb-4">
              Don't See Your Industry?
            </h3>
            <p className="text-lg text-slate-600 dark:text-slate-300 mb-6 max-w-2xl mx-auto">
              VisiGate Pro serves organizations across all sectors. Our flexible platform adapts to your 
              specific compliance requirements, security protocols, and operational workflows.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button 
                size="lg" 
                onClick={() => scrollToSection('contact')}
                className="text-white px-8"
                style={{backgroundColor: '#2460A9'}}
                data-testid="button-custom-industry"
              >
                <Handshake className="h-4 w-4 mr-2" />
                Discuss Your Requirements
              </Button>
              <Button 
                variant="outline" 
                size="lg" 
                onClick={() => scrollToSection('features')}
                className="px-8 border-2 hover:bg-slate-50 dark:hover:bg-slate-800"
                style={{borderColor: '#2460A9', color: '#2460A9'}}
                data-testid="button-view-all-features"
              >
                <Eye className="h-4 w-4 mr-2" />
                View All Features
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* ROI Calculator Section */}
      <section id="roi-calculator" className="py-20 bg-gradient-to-br from-slate-50 via-white to-blue-50 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900 scroll-mt-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <Badge className="mb-4 text-white" style={{backgroundColor: '#2460A9'}} data-testid="badge-roi-calculator">
              <DollarSign className="h-3 w-3 mr-1" />
              Calculate Your ROI
            </Badge>
            <h2 className="text-3xl lg:text-5xl font-bold text-slate-900 dark:text-white mb-6">
              See Your Potential
              <span style={{color: '#2460A9'}}>
                {" "}Savings & ROI
              </span>
            </h2>
            <p className="text-xl text-slate-600 dark:text-slate-300 max-w-3xl mx-auto">
              Discover how VisiGate Pro can transform your operations. Adjust the sliders below to see 
              personalized calculations based on your organization's specific requirements and current processes.
            </p>
          </div>

          <div className="grid lg:grid-cols-2 gap-12 items-start">
            {/* Input Controls */}
            <Card className="p-8 bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm border border-slate-200 dark:border-slate-700 shadow-xl" data-testid="card-input-controls">
              <div className="space-y-8">
                <h3 className="text-2xl font-bold text-slate-900 dark:text-white mb-6">Your Organization</h3>
                
                {/* Company Size */}
                <div className="space-y-4" data-testid="control-company-size">
                  <div className="flex justify-between items-center">
                    <label className="text-lg font-medium text-slate-700 dark:text-slate-300">
                      <Building2 className="inline h-5 w-5 mr-2" />
                      Company Size
                    </label>
                    <span className="text-xl font-bold text-slate-900 dark:text-white" data-testid="value-company-size">
                      {companySize[0].toLocaleString()} employees
                    </span>
                  </div>
                  <Slider
                    value={companySize}
                    onValueChange={setCompanySize}
                    min={10}
                    max={5000}
                    step={10}
                    className="w-full"
                    data-testid="slider-company-size"
                  />
                  <div className="flex justify-between text-sm text-slate-500 dark:text-slate-400">
                    <span>10</span>
                    <span>5,000+</span>
                  </div>
                </div>

                {/* Daily Visitors */}
                <div className="space-y-4" data-testid="control-daily-visitors">
                  <div className="flex justify-between items-center">
                    <label className="text-lg font-medium text-slate-700 dark:text-slate-300">
                      <Users className="inline h-5 w-5 mr-2" />
                      Daily Visitors
                    </label>
                    <span className="text-xl font-bold text-slate-900 dark:text-white" data-testid="value-daily-visitors">
                      {dailyVisitors[0]} per day
                    </span>
                  </div>
                  <Slider
                    value={dailyVisitors}
                    onValueChange={setDailyVisitors}
                    min={5}
                    max={500}
                    step={5}
                    className="w-full"
                    data-testid="slider-daily-visitors"
                  />
                  <div className="flex justify-between text-sm text-slate-500 dark:text-slate-400">
                    <span>5</span>
                    <span>500+</span>
                  </div>
                </div>

                {/* Process Time */}
                <div className="space-y-4" data-testid="control-process-time">
                  <div className="flex justify-between items-center">
                    <label className="text-lg font-medium text-slate-700 dark:text-slate-300">
                      <Clock className="inline h-5 w-5 mr-2" />
                      Manual Process Time
                    </label>
                    <span className="text-xl font-bold text-slate-900 dark:text-white" data-testid="value-process-time">
                      {processTime[0]} min/visitor
                    </span>
                  </div>
                  <Slider
                    value={processTime}
                    onValueChange={setProcessTime}
                    min={2}
                    max={15}
                    step={1}
                    className="w-full"
                    data-testid="slider-process-time"
                  />
                  <div className="flex justify-between text-sm text-slate-500 dark:text-slate-400">
                    <span>2 min</span>
                    <span>15 min</span>
                  </div>
                </div>

                {/* Hourly Cost */}
                <div className="space-y-4" data-testid="control-hourly-cost">
                  <div className="flex justify-between items-center">
                    <label className="text-lg font-medium text-slate-700 dark:text-slate-300">
                      <DollarSign className="inline h-5 w-5 mr-2" />
                      Hourly Admin Cost
                    </label>
                    <span className="text-xl font-bold text-slate-900 dark:text-white" data-testid="value-hourly-cost">
                      ${hourlyCost[0]}/hour
                    </span>
                  </div>
                  <Slider
                    value={hourlyCost}
                    onValueChange={setHourlyCost}
                    min={15}
                    max={75}
                    step={5}
                    className="w-full"
                    data-testid="slider-hourly-cost"
                  />
                  <div className="flex justify-between text-sm text-slate-500 dark:text-slate-400">
                    <span>$15</span>
                    <span>$75</span>
                  </div>
                </div>

                {/* Compliance Incidents */}
                <div className="space-y-4" data-testid="control-compliance-incidents">
                  <div className="flex justify-between items-center">
                    <label className="text-lg font-medium text-slate-700 dark:text-slate-300">
                      <AlertTriangle className="inline h-5 w-5 mr-2" />
                      Annual Compliance Issues
                    </label>
                    <span className="text-xl font-bold text-slate-900 dark:text-white" data-testid="value-compliance-incidents">
                      {complianceIncidents[0]} incidents
                    </span>
                  </div>
                  <Slider
                    value={complianceIncidents}
                    onValueChange={setComplianceIncidents}
                    min={0}
                    max={20}
                    step={1}
                    className="w-full"
                    data-testid="slider-compliance-incidents"
                  />
                  <div className="flex justify-between text-sm text-slate-500 dark:text-slate-400">
                    <span>0</span>
                    <span>20+</span>
                  </div>
                </div>

                {/* Incident Cost */}
                <div className="space-y-4" data-testid="control-incident-cost">
                  <div className="flex justify-between items-center">
                    <label className="text-lg font-medium text-slate-700 dark:text-slate-300">
                      <Target className="inline h-5 w-5 mr-2" />
                      Cost per Incident
                    </label>
                    <span className="text-xl font-bold text-slate-900 dark:text-white" data-testid="value-incident-cost">
                      ${incidentCost[0].toLocaleString()}
                    </span>
                  </div>
                  <Slider
                    value={incidentCost}
                    onValueChange={setIncidentCost}
                    min={1000}
                    max={50000}
                    step={1000}
                    className="w-full"
                    data-testid="slider-incident-cost"
                  />
                  <div className="flex justify-between text-sm text-slate-500 dark:text-slate-400">
                    <span>$1K</span>
                    <span>$50K</span>
                  </div>
                </div>
              </div>
            </Card>

            {/* Results Display */}
            <Card className="p-8 bg-gradient-to-br from-white to-blue-50 dark:from-slate-800 dark:to-slate-700 backdrop-blur-sm border border-slate-200 dark:border-slate-600 shadow-2xl" data-testid="card-results-display">
              <div className="space-y-8">
                <h3 className="text-2xl font-bold text-slate-900 dark:text-white mb-6">Your ROI Results</h3>

                {/* Main ROI Figure */}
                <div className="text-center p-6 bg-gradient-to-r from-green-500 to-emerald-600 rounded-2xl text-white" data-testid="metric-main-roi">
                  <div className="text-4xl lg:text-6xl font-bold mb-2">{roiMetrics.roiPercentage}%</div>
                  <div className="text-xl opacity-90">Annual ROI</div>
                  <div className="text-sm opacity-75 mt-2">Return on Investment</div>
                </div>

                {/* Key Metrics Grid */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="text-center p-4 bg-white/70 dark:bg-slate-800/70 rounded-xl" data-testid="metric-annual-savings">
                    <div className="text-2xl font-bold text-green-600 dark:text-green-400 mb-1">
                      ${roiMetrics.totalAnnualSavings.toLocaleString()}
                    </div>
                    <div className="text-sm text-slate-600 dark:text-slate-400">Annual Savings</div>
                  </div>
                  
                  <div className="text-center p-4 bg-white/70 dark:bg-slate-800/70 rounded-xl" data-testid="metric-payback-period">
                    <div className="text-2xl font-bold text-blue-600 dark:text-blue-400 mb-1">
                      {roiMetrics.paybackMonths} months
                    </div>
                    <div className="text-sm text-slate-600 dark:text-slate-400">Payback Period</div>
                  </div>
                  
                  <div className="text-center p-4 bg-white/70 dark:bg-slate-800/70 rounded-xl" data-testid="metric-time-saved">
                    <div className="text-2xl font-bold text-purple-600 dark:text-purple-400 mb-1">
                      {roiMetrics.annualTimeSaved.toLocaleString()}h
                    </div>
                    <div className="text-sm text-slate-600 dark:text-slate-400">Time Saved/Year</div>
                  </div>
                  
                  <div className="text-center p-4 bg-white/70 dark:bg-slate-800/70 rounded-xl" data-testid="metric-process-efficiency">
                    <div className="text-2xl font-bold text-orange-600 dark:text-orange-400 mb-1">
                      {roiMetrics.processEfficiency}%
                    </div>
                    <div className="text-sm text-slate-600 dark:text-slate-400">Process Efficiency</div>
                  </div>
                </div>

                {/* Progress Bars */}
                <div className="space-y-4" data-testid="section-progress-bars">
                  <div>
                    <div className="flex justify-between mb-2">
                      <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Manual Process Elimination</span>
                      <span className="text-sm font-bold text-slate-900 dark:text-white">{roiMetrics.processEfficiency}%</span>
                    </div>
                    <Progress 
                      value={roiMetrics.processEfficiency} 
                      className="h-3" 
                      data-testid="progress-manual-elimination"
                    />
                  </div>
                  
                  <div>
                    <div className="flex justify-between mb-2">
                      <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Compliance Risk Reduction</span>
                      <span className="text-sm font-bold text-slate-900 dark:text-white">{roiMetrics.complianceImprovement}%</span>
                    </div>
                    <Progress 
                      value={roiMetrics.complianceImprovement} 
                      className="h-3" 
                      data-testid="progress-compliance-improvement"
                    />
                  </div>
                </div>

                {/* Before/After Comparison */}
                <div className="bg-slate-100 dark:bg-slate-800 rounded-xl p-6" data-testid="section-before-after">
                  <h4 className="font-semibold text-slate-900 dark:text-white mb-4">Daily Impact</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="text-center">
                      <div className="text-sm text-slate-600 dark:text-slate-400 mb-1">Current Process</div>
                      <div className="text-xl font-bold text-red-600 dark:text-red-400">
                        {roiMetrics.currentTimePerDay} min/day
                      </div>
                    </div>
                    <div className="text-center">
                      <div className="text-sm text-slate-600 dark:text-slate-400 mb-1">With VisiGate Pro</div>
                      <div className="text-xl font-bold text-green-600 dark:text-green-400">
                        {Math.round(roiMetrics.currentTimePerDay * 0.1)} min/day
                      </div>
                    </div>
                  </div>
                </div>

                {/* CTA Button */}
                <div className="text-center pt-4">
                  <Button 
                    size="lg" 
                    onClick={() => scrollToSection('contact')}
                    className="w-full text-white text-lg py-6 shadow-lg hover:shadow-xl transition-all duration-300"
                    style={{backgroundColor: '#2460A9'}}
                    data-testid="button-get-personalized-quote"
                  >
                    <TrendingUp className="h-5 w-5 mr-2" />
                    Get Personalized Quote
                  </Button>
                  <p className="text-sm text-slate-500 dark:text-slate-400 mt-3">
                    Based on your specific requirements • Free consultation included
                  </p>
                </div>
              </div>
            </Card>
          </div>

          {/* Bottom Stats */}
          <div className="mt-16 text-center" data-testid="section-bottom-stats">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6 max-w-4xl mx-auto">
              <div className="p-4">
                <div className="text-2xl font-bold text-slate-900 dark:text-white" data-testid="stat-companies-saved">500+</div>
                <div className="text-sm text-slate-600 dark:text-slate-400">Companies Saved Money</div>
              </div>
              <div className="p-4">
                <div className="text-2xl font-bold text-slate-900 dark:text-white" data-testid="stat-average-roi">380%</div>
                <div className="text-sm text-slate-600 dark:text-slate-400">Average ROI</div>
              </div>
              <div className="p-4">
                <div className="text-2xl font-bold text-slate-900 dark:text-white" data-testid="stat-average-payback">4.2</div>
                <div className="text-sm text-slate-600 dark:text-slate-400">Months to Payback</div>
              </div>
              <div className="p-4">
                <div className="text-2xl font-bold text-slate-900 dark:text-white" data-testid="stat-time-reduction">92%</div>
                <div className="text-sm text-slate-600 dark:text-slate-400">Admin Time Reduction</div>
              </div>
            </div>
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