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
  PoundSterling,
  Timer as TimerIcon,
  Leaf,
  TreeDeciduous,
} from "lucide-react";

// Import ACS logo and screenshots
import acsLogo from "@assets/acs-logo-2460A9-200px.jpg";
import dashboardImg from "@assets/Dashboard_1760457443176.png";
import emergencyMusterImg from "@assets/Emergency Muster_1760457443172.png";
import visitorManagementImg from "@assets/Visitor Management_1760457443176.png";
import contractorManagementImg from "@assets/Contractor Management_1760457443175.png";
import staffManagementImg from "@assets/Staff Management_1760457443175.png";
import meetingRoomsImg from "@assets/Meeting Rooms & Booking Management_1760457443174.png";
import reportsAnalyticsImg from "@assets/Reports & Analytics_1760457443171.png";
import timeAttendanceImg from "@assets/Time & Attendance Report_1760457443174.png";
import inductionsImg from "@assets/Inductions _1760457443169.png";
import thermalImg from "@assets/ID Card printer_1756400844599.png";

export default function MarketingPage() {
  const [email, setEmail] = useState("");
  const [activeTab, setActiveTab] = useState("dashboard");

  const { toast } = useToast();

  // Handle URL hash changes for deep-linking
  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.replace("#", "");
      if (
        hash &&
        [
          "dashboard",
          "reception",
          "meeting-rooms",
          "people",
          "id-printing",
          "contractors",
          "ai-compliance",
          "emergency",
          "time-attendance",
          "sustainability",
          "reports",
        ].includes(hash)
      ) {
        setActiveTab(hash);
      }
    };

    // Check initial hash
    handleHashChange();

    // Listen for hash changes
    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

  // Update URL hash when tab changes
  const handleTabChange = (value: string) => {
    setActiveTab(value);
    window.history.replaceState(null, "", `#${value}`);
  };

  const contactMutation = useMutation({
    mutationFn: async (email: string) => {
      const response = await apiRequest("POST", "/api/marketing/contact", {
        email,
      });
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
      element.scrollIntoView({ behavior: "smooth", block: "start" });
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
              <div className="flex flex-col">
                <span
                  className="text-xl font-bold"
                  style={{ color: "#2460A9" }}
                >
                  TPR Max
                </span>
                <span className="text-xs text-slate-500 dark:text-slate-400 -mt-1">
                  Total Personnel Register
                </span>
              </div>
            </div>
            <div className="hidden md:flex items-center space-x-8">
              <button
                onClick={() => scrollToSection("features")}
                className="text-slate-600 dark:text-slate-300 transition-colors hover:text-[#2460A9]"
                data-testid="link-features"
              >
                Features
              </button>
              <button
                onClick={() => scrollToSection("industries")}
                className="text-slate-600 dark:text-slate-300 transition-colors hover:text-[#2460A9]"
                data-testid="link-industries"
              >
                Industries
              </button>
              <button
                onClick={() => scrollToSection("contact")}
                className="text-slate-600 dark:text-slate-300 transition-colors hover:text-[#2460A9]"
                data-testid="link-contact"
              >
                Contact
              </button>
              <Button
                size="sm"
                onClick={() => scrollToSection("contact")}
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
                <Badge variant="secondary" className="text-white bg-red-600">
                  <Siren className="h-3 w-3 mr-1" />
                  Emergency Mustering & Accountability
                </Badge>
                <Badge
                  variant="secondary"
                  className="text-white"
                  style={{ backgroundColor: "#2460A9" }}
                >
                  <Shield className="h-3 w-3 mr-1" />
                  Health & Safety First
                </Badge>
              </div>

              <h1 className="text-4xl lg:text-6xl font-bold text-slate-900 dark:text-white mb-6">
                Save Lives with Instant
                <span style={{ color: "#2460A9" }}>
                  {" "}
                  Emergency Accountability
                </span>
              </h1>

              <p className="text-xl text-slate-600 dark:text-slate-300 mb-8 leading-relaxed">
                <strong>
                  Every organisation needs reliable Health & Safety mustering.
                </strong>{" "}
                TPR Max delivers instant emergency accountability when seconds
                count—know exactly who's on-site during evacuations or
                emergencies. Plus, powerful features like contractor management,
                site inductions, room booking, and staff time & attendance make
                it your complete personnel management solution.
              </p>

              <div className="flex flex-col sm:flex-row gap-4 justify-center lg:justify-start">
                <Button
                  size="lg"
                  className="text-lg px-8 shadow-lg hover:shadow-xl transition-shadow"
                  onClick={() => scrollToSection("contact")}
                  data-testid="button-get-started"
                  style={{ backgroundColor: "#2460A9" }}
                >
                  Start Free Enterprise Trial
                  <ArrowRight className="h-5 w-5 ml-2" />
                </Button>
              </div>

              {/* Trust Indicators */}
              <div className="flex flex-col lg:flex-row items-center justify-center lg:justify-start space-y-4 lg:space-y-0 lg:space-x-8 mt-8 pt-8 border-t border-slate-200 dark:border-slate-700">
                <div className="flex items-center space-x-1">
                  {[...Array(5)].map((_, i) => (
                    <Star
                      key={i}
                      className="h-4 w-4 fill-yellow-400 text-yellow-400"
                    />
                  ))}
                  <span className="text-sm text-slate-600 dark:text-slate-400 ml-2">
                    4.9/5 from 200+ enterprise customers
                  </span>
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
                  src={emergencyMusterImg}
                  alt="TPR Max Emergency Muster - Real-time emergency evacuation management and accountability system"
                  className="rounded-xl shadow-2xl border border-slate-200 dark:border-slate-700"
                />
                <div className="absolute -bottom-4 -right-4 bg-red-600 dark:bg-red-700 rounded-lg p-3 shadow-lg border border-red-700 dark:border-red-600">
                  <div className="flex items-center space-x-2">
                    <Siren className="h-4 w-4 text-white animate-pulse" />
                    <span className="text-sm font-medium text-white">
                      Emergency Ready
                    </span>
                  </div>
                </div>
              </div>
              <div className="absolute inset-0 bg-gradient-to-r from-red-600/20 to-orange-600/20 rounded-xl blur-3xl -z-10"></div>
            </div>
          </div>
        </div>
      </section>

      {/* Interactive Tabbed Product Tour */}
      <section
        id="features"
        className="py-20 bg-white/50 dark:bg-slate-800/50 scroll-mt-24"
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl lg:text-5xl font-bold text-slate-900 dark:text-white mb-6">
              Critical Emergency Mustering
              <span style={{ color: "#2460A9" }}>
                {" "}
                Plus Powerful Site Management
              </span>
            </h2>
            <p className="text-xl text-slate-600 dark:text-slate-300 max-w-3xl mx-auto">
              Life-saving emergency accountability is just the beginning.
              Discover how TPR Max combines critical Health & Safety mustering
              with contractor management, site inductions, room booking, and
              staff time & attendance in one complete platform.
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
                value="contractors"
                className="flex flex-col items-center p-3 text-xs font-medium data-[state=active]:bg-white data-[state=active]:text-[#2460A9] transition-all duration-200"
                data-testid="tab-contractors"
              >
                <HardHat className="h-4 w-4 mb-1" />
                Contractors
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
                value="time-attendance"
                className="flex flex-col items-center p-3 text-xs font-medium data-[state=active]:bg-white data-[state=active]:text-[#2460A9] transition-all duration-200"
                data-testid="tab-time-attendance"
              >
                <Clock className="h-4 w-4 mb-1" />
                Time Track
              </TabsTrigger>
              <TabsTrigger
                value="sustainability"
                className="flex flex-col items-center p-3 text-xs font-medium data-[state=active]:bg-white data-[state=active]:text-green-600 transition-all duration-200"
                data-testid="tab-sustainability"
              >
                <Leaf className="h-4 w-4 mb-1" />
                CO2
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
            <TabsContent
              value="dashboard"
              className="space-y-6"
              data-testid="content-dashboard"
            >
              <div className="grid lg:grid-cols-2 gap-8 items-center">
                <div className="space-y-6">
                  <div>
                    <Badge
                      className="mb-4"
                      style={{ backgroundColor: "#2460A9" }}
                    >
                      <Activity className="h-3 w-3 mr-1" />
                      Real-Time Operations
                    </Badge>
                    <h3 className="text-3xl font-bold text-slate-900 dark:text-white mb-4">
                      Complete Site Visibility at a Glance
                    </h3>
                    <p className="text-lg text-slate-600 dark:text-slate-300 leading-relaxed">
                      Transform complex personnel data into actionable insights.
                      Our enterprise dashboard provides real-time oversight of
                      all site activity, enabling informed decisions and
                      proactive security management.
                    </p>
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center space-x-3">
                      <CheckCircle className="h-5 w-5 text-green-500 flex-shrink-0" />
                      <span className="text-slate-700 dark:text-slate-300">
                        <strong>Live Personnel Count:</strong> Track all
                        visitors, contractors, and staff on-site with real-time
                        updates
                      </span>
                    </div>
                    <div className="flex items-center space-x-3">
                      <CheckCircle className="h-5 w-5 text-green-500 flex-shrink-0" />
                      <span className="text-slate-700 dark:text-slate-300">
                        <strong>Security Alerts:</strong> Immediate
                        notifications for unauthorized access or compliance
                        violations
                      </span>
                    </div>
                    <div className="flex items-center space-x-3">
                      <CheckCircle className="h-5 w-5 text-green-500 flex-shrink-0" />
                      <span className="text-slate-700 dark:text-slate-300">
                        <strong>Performance Metrics:</strong> Key insights on
                        occupancy patterns, peak times, and facility utilization
                      </span>
                    </div>
                  </div>

                  <Button
                    size="lg"
                    onClick={() => scrollToSection("contact")}
                    className="text-white"
                    style={{ backgroundColor: "#2460A9" }}
                    data-testid="button-dashboard-demo"
                  >
                    <Eye className="h-4 w-4 mr-2" />
                    See Dashboard Live
                  </Button>
                </div>

                <div className="relative">
                  <img
                    src={dashboardImg}
                    alt="TPR Max Real-Time Dashboard"
                    className="rounded-xl shadow-2xl border border-slate-200 dark:border-slate-700 w-full"
                    data-testid="img-dashboard"
                  />
                  <div className="absolute inset-0 bg-gradient-to-r from-blue-600/10 to-indigo-600/10 rounded-xl"></div>
                </div>
              </div>
            </TabsContent>

            {/* Reception Diary Tab */}
            <TabsContent
              value="reception"
              className="space-y-6"
              data-testid="content-reception"
            >
              <div className="grid lg:grid-cols-2 gap-8 items-center">
                <div className="space-y-6">
                  <div>
                    <Badge
                      className="mb-4"
                      style={{ backgroundColor: "#2460A9" }}
                    >
                      <BookOpen className="h-3 w-3 mr-1" />
                      Visitor Excellence
                    </Badge>
                    <h3 className="text-3xl font-bold text-slate-900 dark:text-white mb-4">
                      Professional TPR Max
                    </h3>
                    <p className="text-lg text-slate-600 dark:text-slate-300 leading-relaxed">
                      Create exceptional first impressions with our
                      comprehensive reception diary system. Streamline visitor
                      scheduling, automate check-ins, and maintain complete
                      visitor records for security and compliance.
                    </p>
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center space-x-3">
                      <CheckCircle className="h-5 w-5 text-green-500 flex-shrink-0" />
                      <span className="text-slate-700 dark:text-slate-300">
                        <strong>Smart Scheduling:</strong> Pre-register visitors
                        with automated email invitations and calendar
                        integration
                      </span>
                    </div>
                    <div className="flex items-center space-x-3">
                      <CheckCircle className="h-5 w-5 text-green-500 flex-shrink-0" />
                      <span className="text-slate-700 dark:text-slate-300">
                        <strong>Express Check-In:</strong> Contactless visitor
                        arrival with QR codes and digital signatures
                      </span>
                    </div>
                    <div className="flex items-center space-x-3">
                      <CheckCircle className="h-5 w-5 text-green-500 flex-shrink-0" />
                      <span className="text-slate-700 dark:text-slate-300">
                        <strong>Voice Notifications:</strong> Automatic audio
                        messages announce "visitor John Smith from ABC Company
                        has arrived" directly to hosts via phone systems
                      </span>
                    </div>
                    <div className="flex items-center space-x-3">
                      <CheckCircle className="h-5 w-5 text-green-500 flex-shrink-0" />
                      <span className="text-slate-700 dark:text-slate-300">
                        <strong>Phone System Integration:</strong> Seamlessly
                        connects with 8x8, Avaya, and other enterprise phone
                        systems for instant voice announcements
                      </span>
                    </div>
                  </div>

                  <Button
                    size="lg"
                    onClick={() => scrollToSection("contact")}
                    className="text-white"
                    style={{ backgroundColor: "#2460A9" }}
                    data-testid="button-reception-demo"
                  >
                    <Eye className="h-4 w-4 mr-2" />
                    See Reception System Live
                  </Button>
                </div>

                <div className="relative">
                  <img
                    src={visitorManagementImg}
                    alt="Visitor Management System - Pre-booking and registration"
                    className="rounded-xl shadow-2xl border border-slate-200 dark:border-slate-700 w-full"
                    data-testid="img-visitor-management"
                  />
                </div>
              </div>
            </TabsContent>

            {/* Meeting Rooms Tab */}
            <TabsContent
              value="meeting-rooms"
              className="space-y-6"
              data-testid="content-meeting-rooms"
            >
              <div className="grid lg:grid-cols-2 gap-8 items-center">
                <div className="space-y-6">
                  <div>
                    <Badge
                      className="mb-4"
                      style={{ backgroundColor: "#2460A9" }}
                    >
                      <Calendar className="h-3 w-3 mr-1" />
                      Smart Spaces
                    </Badge>
                    <h3 className="text-3xl font-bold text-slate-900 dark:text-white mb-4">
                      Intelligent Room Management
                    </h3>
                    <p className="text-lg text-slate-600 dark:text-slate-300 leading-relaxed">
                      Maximize facility utilization with intelligent room
                      booking and management. Integrated calendar systems,
                      equipment tracking, and automated notifications ensure
                      optimal space usage and seamless meeting experiences.
                    </p>
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center space-x-3">
                      <CheckCircle className="h-5 w-5 text-green-500 flex-shrink-0" />
                      <span className="text-slate-700 dark:text-slate-300">
                        <strong>Calendar Integration:</strong> Seamless booking
                        through Outlook, Google Calendar, and mobile apps
                      </span>
                    </div>
                    <div className="flex items-center space-x-3">
                      <CheckCircle className="h-5 w-5 text-green-500 flex-shrink-0" />
                      <span className="text-slate-700 dark:text-slate-300">
                        <strong>Equipment Management:</strong> Track projectors,
                        whiteboards, and AV equipment with each booking
                      </span>
                    </div>
                    <div className="flex items-center space-x-3">
                      <CheckCircle className="h-5 w-5 text-green-500 flex-shrink-0" />
                      <span className="text-slate-700 dark:text-slate-300">
                        <strong>Usage Analytics:</strong> Optimize space
                        allocation with detailed utilization reports and trends
                      </span>
                    </div>
                  </div>

                  <Button
                    size="lg"
                    onClick={() => scrollToSection("contact")}
                    className="text-white"
                    style={{ backgroundColor: "#2460A9" }}
                    data-testid="button-rooms-demo"
                  >
                    <Eye className="h-4 w-4 mr-2" />
                    See Room System Live
                  </Button>
                </div>

                <div className="relative">
                  <img
                    src={meetingRoomsImg}
                    alt="Meeting Room Booking & Management System"
                    className="rounded-xl shadow-2xl border border-slate-200 dark:border-slate-700 w-full"
                    data-testid="img-meeting-rooms"
                  />
                </div>
              </div>
            </TabsContent>

            {/* People Management Tab */}
            <TabsContent
              value="people"
              className="space-y-6"
              data-testid="content-people"
            >
              <div className="grid lg:grid-cols-2 gap-8 items-center">
                <div className="space-y-6">
                  <div>
                    <Badge
                      className="mb-4"
                      style={{ backgroundColor: "#2460A9" }}
                    >
                      <Users className="h-3 w-3 mr-1" />
                      Complete Personnel Control
                    </Badge>
                    <h3 className="text-3xl font-bold text-slate-900 dark:text-white mb-4">
                      Unified Personnel Database
                    </h3>
                    <p className="text-lg text-slate-600 dark:text-slate-300 leading-relaxed">
                      Centralize all personnel information in one secure
                      platform. Manage staff, contractors, and visitors with
                      comprehensive profiles, access permissions, and real-time
                      tracking for complete site oversight.
                    </p>
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center space-x-3">
                      <CheckCircle className="h-5 w-5 text-green-500 flex-shrink-0" />
                      <span className="text-slate-700 dark:text-slate-300">
                        <strong>Unified Profiles:</strong> Complete personnel
                        records with photos, certifications, and access history
                      </span>
                    </div>
                    <div className="flex items-center space-x-3">
                      <CheckCircle className="h-5 w-5 text-green-500 flex-shrink-0" />
                      <span className="text-slate-700 dark:text-slate-300">
                        <strong>Role-Based Access:</strong> Granular permissions
                        system for different user types and security levels
                      </span>
                    </div>
                    <div className="flex items-center space-x-3">
                      <CheckCircle className="h-5 w-5 text-green-500 flex-shrink-0" />
                      <span className="text-slate-700 dark:text-slate-300">
                        <strong>Live Tracking:</strong> Real-time location and
                        status updates for all personnel on-site
                      </span>
                    </div>
                  </div>

                  <Button
                    size="lg"
                    onClick={() => scrollToSection("contact")}
                    className="text-white"
                    style={{ backgroundColor: "#2460A9" }}
                    data-testid="button-people-demo"
                  >
                    <Eye className="h-4 w-4 mr-2" />
                    See People System Live
                  </Button>
                </div>

                <div className="relative">
                  <img
                    src={staffManagementImg}
                    alt="Staff & Personnel Management System"
                    className="rounded-xl shadow-2xl border border-slate-200 dark:border-slate-700 w-full"
                    data-testid="img-staff-management"
                  />
                </div>
              </div>
            </TabsContent>

            {/* ID Printing Tab */}
            <TabsContent
              value="id-printing"
              className="space-y-6"
              data-testid="content-id-printing"
            >
              <div className="grid lg:grid-cols-2 gap-8 items-center">
                <div className="space-y-6">
                  <div>
                    <Badge
                      className="mb-4"
                      style={{ backgroundColor: "#2460A9" }}
                    >
                      <Printer className="h-3 w-3 mr-1" />
                      Professional Identity
                    </Badge>
                    <h3 className="text-3xl font-bold text-slate-900 dark:text-white mb-4">
                      Enterprise-Grade ID Printing
                    </h3>
                    <p className="text-lg text-slate-600 dark:text-slate-300 leading-relaxed">
                      Generate professional thermal ID passes instantly for all
                      personnel. Custom branding, integrated QR codes, and
                      high-resolution photos create a secure and professional
                      identification system that enhances your brand image.
                    </p>
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center space-x-3">
                      <CheckCircle className="h-5 w-5 text-green-500 flex-shrink-0" />
                      <span className="text-slate-700 dark:text-slate-300">
                        <strong>Instant Printing:</strong> High-quality thermal
                        ID cards generated in under 30 seconds
                      </span>
                    </div>
                    <div className="flex items-center space-x-3">
                      <CheckCircle className="h-5 w-5 text-green-500 flex-shrink-0" />
                      <span className="text-slate-700 dark:text-slate-300">
                        <strong>Custom Branding:</strong> Company logos, colors,
                        and designs for professional appearance
                      </span>
                    </div>
                    <div className="flex items-center space-x-3">
                      <CheckCircle className="h-5 w-5 text-green-500 flex-shrink-0" />
                      <span className="text-slate-700 dark:text-slate-300">
                        <strong>Smart Integration:</strong> QR codes link to
                        digital profiles and access permissions
                      </span>
                    </div>
                  </div>

                  <Button
                    size="lg"
                    onClick={() => scrollToSection("contact")}
                    className="text-white"
                    style={{ backgroundColor: "#2460A9" }}
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
                      <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                        Printing Active
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </TabsContent>

            {/* Contractor Management Tab */}
            <TabsContent
              value="contractors"
              className="space-y-6"
              data-testid="content-contractors"
            >
              <div className="grid lg:grid-cols-2 gap-8 items-center">
                <div className="space-y-6">
                  <div>
                    <Badge
                      className="mb-4"
                      style={{ backgroundColor: "#2460A9" }}
                    >
                      <HardHat className="h-3 w-3 mr-1" />
                      Complete Contractor Control
                    </Badge>
                    <h3 className="text-3xl font-bold text-slate-900 dark:text-white mb-4">
                      Enterprise Contractor Management
                    </h3>
                    <p className="text-lg text-slate-600 dark:text-slate-300 leading-relaxed">
                      Comprehensive contractor oversight with worker tracking, certification management, and compliance verification. Ensure all contractors meet safety requirements while maintaining complete audit trails for insurance and legal purposes.
                    </p>
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center space-x-3">
                      <CheckCircle className="h-5 w-5 text-green-500 flex-shrink-0" />
                      <span className="text-slate-700 dark:text-slate-300">
                        <strong>Worker Database:</strong> Track all contractor employees with photos, qualifications, and insurance documents
                      </span>
                    </div>
                    <div className="flex items-center space-x-3">
                      <CheckCircle className="h-5 w-5 text-green-500 flex-shrink-0" />
                      <span className="text-slate-700 dark:text-slate-300">
                        <strong>Compliance Tracking:</strong> Automated alerts for expiring certificates, insurance, and safety documentation
                      </span>
                    </div>
                    <div className="flex items-center space-x-3">
                      <CheckCircle className="h-5 w-5 text-green-500 flex-shrink-0" />
                      <span className="text-slate-700 dark:text-slate-300">
                        <strong>Company Profiles:</strong> Manage contractor companies, contracts, and performance ratings in one system
                      </span>
                    </div>
                    <div className="flex items-center space-x-3">
                      <CheckCircle className="h-5 w-5 text-green-500 flex-shrink-0" />
                      <span className="text-slate-700 dark:text-slate-300">
                        <strong>Red/Yellow Card System:</strong> Disciplinary tracking with formal warnings, incident logging, and automatic site access restrictions
                      </span>
                    </div>
                    <div className="flex items-center space-x-3">
                      <CheckCircle className="h-5 w-5 text-green-500 flex-shrink-0" />
                      <span className="text-slate-700 dark:text-slate-300">
                        <strong>CO2 Sustainability Reports:</strong> AI-powered carbon footprint tracking for contractor commutes with UK postcode distance calculations
                      </span>
                    </div>
                    <div className="flex items-center space-x-3">
                      <CheckCircle className="h-5 w-5 text-green-500 flex-shrink-0" />
                      <span className="text-slate-700 dark:text-slate-300">
                        <strong>Environmental Impact:</strong> Detailed emissions analysis per worker, route optimization recommendations, and sustainability scoring
                      </span>
                    </div>
                  </div>

                  <Button
                    size="lg"
                    onClick={() => scrollToSection("contact")}
                    className="text-white"
                    style={{ backgroundColor: "#2460A9" }}
                    data-testid="button-contractors-demo"
                  >
                    <Eye className="h-4 w-4 mr-2" />
                    See Contractor System Live
                  </Button>
                </div>

                <div className="relative">
                  <img
                    src={contractorManagementImg}
                    alt="Contractor Management System - Complete contractor company and worker tracking with compliance"
                    className="rounded-xl shadow-2xl border border-slate-200 dark:border-slate-700 w-full"
                    data-testid="img-contractor-management"
                  />
                </div>
              </div>
            </TabsContent>

            {/* AI Compliance Tab */}
            <TabsContent
              value="ai-compliance"
              className="space-y-6"
              data-testid="content-ai-compliance"
            >
              <div className="grid lg:grid-cols-2 gap-8 items-center">
                <div className="space-y-6">
                  <div>
                    <Badge
                      className="mb-4"
                      style={{ backgroundColor: "#2460A9" }}
                    >
                      <Brain className="h-3 w-3 mr-1" />
                      AI-Powered Compliance
                    </Badge>
                    <h3 className="text-3xl font-bold text-slate-900 dark:text-white mb-4">
                      Automated Legal Management
                    </h3>
                    <p className="text-lg text-slate-600 dark:text-slate-300 leading-relaxed">
                      Eliminate compliance headaches with AI-powered document
                      management and safety inductions. Automatically track
                      certifications, generate custom safety content, and ensure
                      100% legal compliance across all contractors and visitors.
                    </p>
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center space-x-3">
                      <CheckCircle className="h-5 w-5 text-green-500 flex-shrink-0" />
                      <span className="text-slate-700 dark:text-slate-300">
                        <strong>AI Induction Videos:</strong> Automatically generate professional safety training videos with AI-created scripts, voice narration, and topic-specific graphics
                      </span>
                    </div>
                    <div className="flex items-center space-x-3">
                      <CheckCircle className="h-5 w-5 text-green-500 flex-shrink-0" />
                      <span className="text-slate-700 dark:text-slate-300">
                        <strong>Role-Based Training:</strong> Custom induction content for Visitors, Staff, and Contractors with UK Health & Safety compliance built-in
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
                        <strong>Comprehension Testing:</strong> AI-generated quiz questions verify understanding with pass/fail tracking
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
                    onClick={() => scrollToSection("contact")}
                    className="text-white"
                    style={{ backgroundColor: "#2460A9" }}
                    data-testid="button-compliance-demo"
                  >
                    <Eye className="h-4 w-4 mr-2" />
                    See AI Compliance Live
                  </Button>
                </div>

                <div className="relative">
                  <img
                    src={inductionsImg}
                    alt="AI-Powered Safety Inductions & Compliance Management"
                    className="rounded-xl shadow-2xl border border-slate-200 dark:border-slate-700 w-full"
                    data-testid="img-ai-compliance"
                  />
                </div>
              </div>
            </TabsContent>

            {/* Emergency Mustering Tab */}
            <TabsContent
              value="emergency"
              className="space-y-6"
              data-testid="content-emergency"
            >
              <div className="grid lg:grid-cols-2 gap-8 items-center">
                <div className="space-y-6">
                  <div>
                    <Badge className="mb-4 bg-red-600">
                      <AlertTriangle className="h-3 w-3 mr-1" />
                      Emergency Mustering
                    </Badge>
                    <h3 className="text-3xl font-bold text-slate-900 dark:text-white mb-4">
                      Life-Saving Emergency Response System
                    </h3>
                    <p className="text-lg text-slate-600 dark:text-slate-300 leading-relaxed">
                      When every second counts, TPR Max delivers instant
                      accountability across your entire site. Zone-based
                      evacuations with interactive floor plan mapping, Fire
                      Marshal static URLs, targeted email alerts, and digital
                      roll-call ensure complete personnel safety during
                      evacuations and emergency situations.
                    </p>
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center space-x-3">
                      <CheckCircle className="h-5 w-5 text-green-500 flex-shrink-0" />
                      <span className="text-slate-700 dark:text-slate-300">
                        <strong>Zone-Based Evacuations:</strong> Up to 16 configurable evacuation zones with colour-coded markers, interactive floor plan placement, and zone-filtered emergency alerts targeting specific areas
                      </span>
                    </div>
                    <div className="flex items-center space-x-3">
                      <CheckCircle className="h-5 w-5 text-green-500 flex-shrink-0" />
                      <span className="text-slate-700 dark:text-slate-300">
                        <strong>Interactive Zone Map:</strong> Drag-and-drop zone markers on your floor plan with real-time personnel counts per zone - click any marker to filter the muster list instantly
                      </span>
                    </div>
                    <div className="flex items-center space-x-3">
                      <CheckCircle className="h-5 w-5 text-green-500 flex-shrink-0" />
                      <span className="text-slate-700 dark:text-slate-300">
                        <strong>Fire Marshal Static URLs:</strong> Permanent, bookmarkable links for Fire Marshals to access real-time personnel lists instantly - works in emergencies AND peacetime monitoring
                      </span>
                    </div>
                    <div className="flex items-center space-x-3">
                      <CheckCircle className="h-5 w-5 text-green-500 flex-shrink-0" />
                      <span className="text-slate-700 dark:text-slate-300">
                        <strong>Self-Service Mark Safe:</strong> Personnel receive unique links via email to mark themselves safe during evacuations - updates Fire Marshal view in real-time
                      </span>
                    </div>
                    <div className="flex items-center space-x-3">
                      <CheckCircle className="h-5 w-5 text-green-500 flex-shrink-0" />
                      <span className="text-slate-700 dark:text-slate-300">
                        <strong>Targeted Zone Alerts:</strong> Send evacuation emails only to personnel in affected zones - Fire Marshals always receive alerts regardless of zone selection
                      </span>
                    </div>
                    <div className="flex items-center space-x-3">
                      <CheckCircle className="h-5 w-5 text-green-500 flex-shrink-0" />
                      <span className="text-slate-700 dark:text-slate-300">
                        <strong>Digital Roll-Call:</strong> One-tap personnel accountability for staff, visitors, and contractors with zone filtering and missing person identification
                      </span>
                    </div>
                    <div className="flex items-center space-x-3">
                      <CheckCircle className="h-5 w-5 text-green-500 flex-shrink-0" />
                      <span className="text-slate-700 dark:text-slate-300">
                        <strong>Emergency Exports:</strong> Instant CSV exports for emergency services with complete personnel data, zone assignments, and timestamps
                      </span>
                    </div>
                  </div>

                  <Button
                    size="lg"
                    onClick={() => scrollToSection("contact")}
                    className="text-white bg-red-600 hover:bg-red-700"
                    data-testid="button-emergency-demo"
                  >
                    <Siren className="h-4 w-4 mr-2" />
                    See Emergency Mustering Live
                  </Button>
                </div>

                <div className="relative">
                  <img
                    src={emergencyMusterImg}
                    alt="Emergency Muster System - Real-time personnel accountability and evacuation management"
                    className="rounded-xl shadow-2xl border border-slate-200 dark:border-slate-700 w-full"
                    data-testid="img-emergency-muster"
                  />
                  <div className="absolute -bottom-4 -right-4 bg-red-600 dark:bg-red-700 rounded-lg p-3 shadow-lg border border-red-700 dark:border-red-600">
                    <div className="flex items-center space-x-2">
                      <Siren className="h-4 w-4 text-white animate-pulse" />
                      <span className="text-sm font-medium text-white">
                        Emergency Active
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </TabsContent>

            {/* Time & Attendance Tab */}
            <TabsContent
              value="time-attendance"
              className="space-y-6"
              data-testid="content-time-attendance"
            >
              <div className="grid lg:grid-cols-2 gap-8 items-center">
                <div className="space-y-6">
                  <div>
                    <Badge
                      className="mb-4"
                      style={{ backgroundColor: "#2460A9" }}
                    >
                      <Clock className="h-3 w-3 mr-1" />
                      Automated Time Tracking
                    </Badge>
                    <h3 className="text-3xl font-bold text-slate-900 dark:text-white mb-4">
                      Smart Time & Attendance
                    </h3>
                    <p className="text-lg text-slate-600 dark:text-slate-300 leading-relaxed">
                      Eliminate manual timesheets with automated time tracking for all personnel. Accurate check-in/check-out records, shift management, and comprehensive attendance reporting ensure precise payroll and contractor billing while reducing administrative overhead.
                    </p>
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center space-x-3">
                      <CheckCircle className="h-5 w-5 text-green-500 flex-shrink-0" />
                      <span className="text-slate-700 dark:text-slate-300">
                        <strong>Automated Tracking:</strong> Precise check-in/check-out timestamps with location verification and photo capture
                      </span>
                    </div>
                    <div className="flex items-center space-x-3">
                      <CheckCircle className="h-5 w-5 text-green-500 flex-shrink-0" />
                      <span className="text-slate-700 dark:text-slate-300">
                        <strong>Comprehensive Reports:</strong> Detailed attendance analytics with overtime calculations and absence tracking
                      </span>
                    </div>
                    <div className="flex items-center space-x-3">
                      <CheckCircle className="h-5 w-5 text-green-500 flex-shrink-0" />
                      <span className="text-slate-700 dark:text-slate-300">
                        <strong>Payroll Integration:</strong> Export ready timesheets for seamless payroll processing and contractor invoicing
                      </span>
                    </div>
                  </div>

                  <Button
                    size="lg"
                    onClick={() => scrollToSection("contact")}
                    className="text-white"
                    style={{ backgroundColor: "#2460A9" }}
                    data-testid="button-time-attendance-demo"
                  >
                    <Eye className="h-4 w-4 mr-2" />
                    See Time Tracking Live
                  </Button>
                </div>

                <div className="relative">
                  <img
                    src={timeAttendanceImg}
                    alt="Time & Attendance Report - Automated time tracking and attendance management system"
                    className="rounded-xl shadow-2xl border border-slate-200 dark:border-slate-700 w-full"
                    data-testid="img-time-attendance"
                  />
                </div>
              </div>
            </TabsContent>

            {/* CO2 Sustainability Tab */}
            <TabsContent
              value="sustainability"
              className="space-y-6"
              data-testid="content-sustainability"
            >
              <div className="grid lg:grid-cols-2 gap-8 items-center">
                <div className="space-y-6">
                  <div>
                    <Badge className="mb-4 bg-green-600">
                      <Leaf className="h-3 w-3 mr-1" />
                      Environmental Sustainability
                    </Badge>
                    <h3 className="text-3xl font-bold text-slate-900 dark:text-white mb-4">
                      CO2 Sustainability Reporting
                    </h3>
                    <p className="text-lg text-slate-600 dark:text-slate-300 leading-relaxed">
                      Track and reduce your environmental impact with AI-powered carbon footprint analysis. 
                      Monitor contractor commute emissions, identify optimization opportunities, and demonstrate 
                      your commitment to sustainability with comprehensive environmental reporting.
                    </p>
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center space-x-3">
                      <CheckCircle className="h-5 w-5 text-green-500 flex-shrink-0" />
                      <span className="text-slate-700 dark:text-slate-300">
                        <strong>AI Distance Calculations:</strong> Intelligent UK postcode-to-postcode distance calculations with route type detection (motorway, A-roads, mixed)
                      </span>
                    </div>
                    <div className="flex items-center space-x-3">
                      <CheckCircle className="h-5 w-5 text-green-500 flex-shrink-0" />
                      <span className="text-slate-700 dark:text-slate-300">
                        <strong>Carbon Footprint Tracking:</strong> Detailed CO2 emissions analysis per contractor, per journey, with vehicle type considerations
                      </span>
                    </div>
                    <div className="flex items-center space-x-3">
                      <CheckCircle className="h-5 w-5 text-green-500 flex-shrink-0" />
                      <span className="text-slate-700 dark:text-slate-300">
                        <strong>Sustainability Scoring:</strong> Environmental impact ratings with industry benchmarking and improvement recommendations
                      </span>
                    </div>
                    <div className="flex items-center space-x-3">
                      <CheckCircle className="h-5 w-5 text-green-500 flex-shrink-0" />
                      <span className="text-slate-700 dark:text-slate-300">
                        <strong>ESG Reporting:</strong> Export-ready environmental reports for ESG compliance and stakeholder reporting
                      </span>
                    </div>
                    <div className="flex items-center space-x-3">
                      <CheckCircle className="h-5 w-5 text-green-500 flex-shrink-0" />
                      <span className="text-slate-700 dark:text-slate-300">
                        <strong>Route Optimization:</strong> AI-generated recommendations for reducing contractor travel emissions and costs
                      </span>
                    </div>
                  </div>

                  <Button
                    size="lg"
                    onClick={() => scrollToSection("contact")}
                    className="text-white bg-green-600 hover:bg-green-700"
                    data-testid="button-sustainability-demo"
                  >
                    <TreeDeciduous className="h-4 w-4 mr-2" />
                    See CO2 Reporting Live
                  </Button>
                </div>

                <div className="relative">
                  <div className="rounded-xl shadow-2xl border border-green-200 dark:border-green-800 bg-gradient-to-br from-green-50 to-emerald-100 dark:from-green-900/50 dark:to-emerald-900/50 p-8">
                    <div className="text-center mb-6">
                      <TreeDeciduous className="h-16 w-16 text-green-600 mx-auto mb-4" />
                      <h4 className="text-2xl font-bold text-green-800 dark:text-green-200">
                        Environmental Impact Dashboard
                      </h4>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="bg-white/80 dark:bg-slate-800/80 rounded-lg p-4 text-center">
                        <div className="text-3xl font-bold text-green-600">2.4t</div>
                        <div className="text-sm text-slate-600 dark:text-slate-400">CO2 Saved This Month</div>
                      </div>
                      <div className="bg-white/80 dark:bg-slate-800/80 rounded-lg p-4 text-center">
                        <div className="text-3xl font-bold text-green-600">87%</div>
                        <div className="text-sm text-slate-600 dark:text-slate-400">Sustainability Score</div>
                      </div>
                      <div className="bg-white/80 dark:bg-slate-800/80 rounded-lg p-4 text-center">
                        <div className="text-3xl font-bold text-green-600">156</div>
                        <div className="text-sm text-slate-600 dark:text-slate-400">Workers Tracked</div>
                      </div>
                      <div className="bg-white/80 dark:bg-slate-800/80 rounded-lg p-4 text-center">
                        <div className="text-3xl font-bold text-green-600">12k</div>
                        <div className="text-sm text-slate-600 dark:text-slate-400">Miles Analyzed</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </TabsContent>

            {/* Reports & Analytics Tab */}
            <TabsContent
              value="reports"
              className="space-y-6"
              data-testid="content-reports"
            >
              <div className="grid lg:grid-cols-2 gap-8 items-center">
                <div className="space-y-6">
                  <div>
                    <Badge
                      className="mb-4"
                      style={{ backgroundColor: "#2460A9" }}
                    >
                      <TrendingUp className="h-3 w-3 mr-1" />
                      Business Intelligence
                    </Badge>
                    <h3 className="text-3xl font-bold text-slate-900 dark:text-white mb-4">
                      Comprehensive Analytics & Reporting
                    </h3>
                    <p className="text-lg text-slate-600 dark:text-slate-300 leading-relaxed">
                      Transform personnel data into actionable business
                      insights. Comprehensive reporting suite provides facility
                      utilization, security metrics, and compliance analytics to
                      optimize operations and reduce costs.
                    </p>
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center space-x-3">
                      <CheckCircle className="h-5 w-5 text-green-500 flex-shrink-0" />
                      <span className="text-slate-700 dark:text-slate-300">
                        <strong>Executive Dashboards:</strong> Real-time KPIs
                        and performance metrics for management
                      </span>
                    </div>
                    <div className="flex items-center space-x-3">
                      <CheckCircle className="h-5 w-5 text-green-500 flex-shrink-0" />
                      <span className="text-slate-700 dark:text-slate-300">
                        <strong>Custom Reports:</strong> Automated report
                        generation with flexible scheduling and formats
                      </span>
                    </div>
                    <div className="flex items-center space-x-3">
                      <CheckCircle className="h-5 w-5 text-green-500 flex-shrink-0" />
                      <span className="text-slate-700 dark:text-slate-300">
                        <strong>Predictive Analytics:</strong> Trend analysis
                        for capacity planning and resource optimization
                      </span>
                    </div>
                  </div>

                  <Button
                    size="lg"
                    onClick={() => scrollToSection("contact")}
                    className="text-white"
                    style={{ backgroundColor: "#2460A9" }}
                    data-testid="button-reports-demo"
                  >
                    <Eye className="h-4 w-4 mr-2" />
                    See Reports Live
                  </Button>
                </div>

                <div className="relative">
                  <img
                    src={reportsAnalyticsImg}
                    alt="Comprehensive Reports & Analytics Dashboard"
                    className="rounded-xl shadow-2xl border border-slate-200 dark:border-slate-700 w-full"
                    data-testid="img-reports-analytics"
                  />
                </div>
              </div>
            </TabsContent>
          </Tabs>

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
                Built to exceed the highest security standards with
                comprehensive compliance coverage for global enterprises.
              </p>
            </div>

            <div className="grid md:grid-cols-3 gap-8">
              {/* Security Standards */}
              <Card
                className="p-8 bg-white/70 dark:bg-slate-800/70 backdrop-blur-sm border-0 shadow-xl"
                data-testid="card-security-standards"
              >
                <div className="text-center">
                  <div className="h-16 w-16 bg-gradient-to-br from-green-500 to-green-600 rounded-2xl flex items-center justify-center mx-auto mb-6">
                    <Shield className="h-8 w-8 text-white" />
                  </div>
                  <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-4">
                    Security Certifications
                  </h3>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between p-3 bg-green-50 dark:bg-green-900/20 rounded-lg">
                      <span className="text-slate-700 dark:text-slate-300 font-medium">
                        SOC 2 Type II
                      </span>
                      <Badge
                        className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                        data-testid="badge-soc2"
                      >
                        <CheckCircle className="h-3 w-3 mr-1" />
                        Certified
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                      <span className="text-slate-700 dark:text-slate-300 font-medium">
                        ISO 27001
                      </span>
                      <Badge
                        className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200"
                        data-testid="badge-iso27001"
                      >
                        <CheckCircle className="h-3 w-3 mr-1" />
                        Certified
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between p-3 bg-purple-50 dark:bg-purple-900/20 rounded-lg">
                      <span className="text-slate-700 dark:text-slate-300 font-medium">
                        GDPR Compliant
                      </span>
                      <Badge
                        className="bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200"
                        data-testid="badge-gdpr"
                      >
                        <CheckCircle className="h-3 w-3 mr-1" />
                        Verified
                      </Badge>
                    </div>
                  </div>
                </div>
              </Card>

              {/* Enterprise Features */}
              <Card
                className="p-8 bg-white/70 dark:bg-slate-800/70 backdrop-blur-sm border-0 shadow-xl"
                data-testid="card-enterprise-features"
              >
                <div className="text-center">
                  <div className="h-16 w-16 bg-gradient-to-br from-blue-500 to-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-6">
                    <Lock className="h-8 w-8 text-white" />
                  </div>
                  <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-4">
                    Enterprise Security Features
                  </h3>
                  <div className="space-y-3 text-left">
                    <div className="flex items-center space-x-3">
                      <CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0" />
                      <span className="text-slate-700 dark:text-slate-300 text-sm">
                        Customer-isolated database security
                      </span>
                    </div>
                    <div className="flex items-center space-x-3">
                      <CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0" />
                      <span className="text-slate-700 dark:text-slate-300 text-sm">
                        Session-based authentication (PostgreSQL)
                      </span>
                    </div>
                    <div className="flex items-center space-x-3">
                      <CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0" />
                      <span className="text-slate-700 dark:text-slate-300 text-sm">
                        CSRF protection & rate limiting
                      </span>
                    </div>
                    <div className="flex items-center space-x-3">
                      <CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0" />
                      <span className="text-slate-700 dark:text-slate-300 text-sm">
                        AWS production deployment ready
                      </span>
                    </div>
                    <div className="flex items-center space-x-3">
                      <CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0" />
                      <span className="text-slate-700 dark:text-slate-300 text-sm">
                        End-to-end encryption (AES-256)
                      </span>
                    </div>
                    <div className="flex items-center space-x-3">
                      <CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0" />
                      <span className="text-slate-700 dark:text-slate-300 text-sm">
                        Enterprise audit logging
                      </span>
                    </div>
                  </div>
                </div>
              </Card>

              {/* Compliance Standards */}
              <Card
                className="p-8 bg-white/70 dark:bg-slate-800/70 backdrop-blur-sm border-0 shadow-xl"
                data-testid="card-compliance-standards"
              >
                <div className="text-center">
                  <div className="h-16 w-16 bg-gradient-to-br from-purple-500 to-purple-600 rounded-2xl flex items-center justify-center mx-auto mb-6">
                    <Award className="h-8 w-8 text-white" />
                  </div>
                  <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-4">
                    Compliance Standards
                  </h3>
                  <div className="space-y-3 text-left">
                    <div className="flex items-center space-x-3">
                      <CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0" />
                      <span className="text-slate-700 dark:text-slate-300 text-sm">
                        HIPAA compliance for healthcare
                      </span>
                    </div>
                    <div className="flex items-center space-x-3">
                      <CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0" />
                      <span className="text-slate-700 dark:text-slate-300 text-sm">
                        FedRAMP authorized
                      </span>
                    </div>
                    <div className="flex items-center space-x-3">
                      <CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0" />
                      <span className="text-slate-700 dark:text-slate-300 text-sm">
                        PCI DSS Level 1
                      </span>
                    </div>
                    <div className="flex items-center space-x-3">
                      <CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0" />
                      <span className="text-slate-700 dark:text-slate-300 text-sm">
                        UK Data Protection Act
                      </span>
                    </div>
                    <div className="flex items-center space-x-3">
                      <CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0" />
                      <span className="text-slate-700 dark:text-slate-300 text-sm">
                        CCPA compliant
                      </span>
                    </div>
                    <div className="flex items-center space-x-3">
                      <CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0" />
                      <span className="text-slate-700 dark:text-slate-300 text-sm">
                        Industry-specific regulations
                      </span>
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
                Connect with your existing systems in minutes. Over 100+
                pre-built integrations with enterprise platforms.
              </p>
            </div>

            <div className="grid md:grid-cols-3 gap-8 mb-12">
              {/* Access Control Systems */}
              <Card
                className="p-6 bg-white/70 dark:bg-slate-800/70 backdrop-blur-sm border-0 shadow-lg"
                data-testid="card-access-control-integrations"
              >
                <div className="text-center">
                  <div className="h-12 w-12 bg-gradient-to-br from-red-500 to-red-600 rounded-lg flex items-center justify-center mx-auto mb-4">
                    <Lock className="h-6 w-6 text-white" />
                  </div>
                  <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-3">
                    Access Control
                  </h3>
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
              <Card
                className="p-6 bg-white/70 dark:bg-slate-800/70 backdrop-blur-sm border-0 shadow-lg"
                data-testid="card-hr-integrations"
              >
                <div className="text-center">
                  <div className="h-12 w-12 bg-gradient-to-br from-green-500 to-green-600 rounded-lg flex items-center justify-center mx-auto mb-4">
                    <Users className="h-6 w-6 text-white" />
                  </div>
                  <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-3">
                    HR Systems
                  </h3>
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
              <Card
                className="p-6 bg-white/70 dark:bg-slate-800/70 backdrop-blur-sm border-0 shadow-lg"
                data-testid="card-communication-integrations"
              >
                <div className="text-center">
                  <div className="h-12 w-12 bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg flex items-center justify-center mx-auto mb-4">
                    <Wifi className="h-6 w-6 text-white" />
                  </div>
                  <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-3">
                    Communication
                  </h3>
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
              <Badge
                className="text-lg px-4 py-2"
                style={{ backgroundColor: "#2460A9" }}
                data-testid="badge-integration-count"
              >
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
                See why security directors, CTOs, and facilities managers choose
                TPR Max for their critical operations.
              </p>
            </div>

            <div className="grid md:grid-cols-3 gap-8">
              {/* Testimonial 1 */}
              <Card
                className="p-8 bg-white/70 dark:bg-slate-800/70 backdrop-blur-sm border-0 shadow-xl relative"
                data-testid="card-testimonial-1"
              >
                <Quote className="h-8 w-8 text-slate-400 mb-4" />
                <blockquote className="text-slate-700 dark:text-slate-300 mb-6 leading-relaxed">
                  "TPR Max reduced our security incidents by 90% and cut manual
                  compliance work from 40 hours to 2 hours per week. The value was
                  immediate and the peace of mind is invaluable."
                </blockquote>
                <div className="flex items-center space-x-3">
                  <div className="h-12 w-12 bg-gradient-to-br from-blue-500 to-blue-600 rounded-full flex items-center justify-center">
                    <span className="text-white font-bold text-sm">TG</span>
                  </div>
                  <div>
                    <div className="font-semibold text-slate-900 dark:text-white">
                      Sarah Mitchell
                    </div>
                    <div className="text-sm text-slate-600 dark:text-slate-400">
                      CTO, TechGlobal Corp
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-500">
                      15,000+ employees
                    </div>
                  </div>
                </div>
              </Card>

              {/* Testimonial 2 */}
              <Card
                className="p-8 bg-white/70 dark:bg-slate-800/70 backdrop-blur-sm border-0 shadow-xl relative"
                data-testid="card-testimonial-2"
              >
                <Quote className="h-8 w-8 text-slate-400 mb-4" />
                <blockquote className="text-slate-700 dark:text-slate-300 mb-6 leading-relaxed">
                  "Implementation took just 3 days across our 12 facilities. The
                  emergency mustering system proved crucial during our fire
                  drill - we located all 2,400 personnel in under 2 minutes."
                </blockquote>
                <div className="flex items-center space-x-3">
                  <div className="h-12 w-12 bg-gradient-to-br from-green-500 to-green-600 rounded-full flex items-center justify-center">
                    <span className="text-white font-bold text-sm">MI</span>
                  </div>
                  <div>
                    <div className="font-semibold text-slate-900 dark:text-white">
                      James Richardson
                    </div>
                    <div className="text-sm text-slate-600 dark:text-slate-400">
                      Security Director, ManufacturingInc
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-500">
                      12 facilities worldwide
                    </div>
                  </div>
                </div>
              </Card>

              {/* Testimonial 3 */}
              <Card
                className="p-8 bg-white/70 dark:bg-slate-800/70 backdrop-blur-sm border-0 shadow-xl relative"
                data-testid="card-testimonial-3"
              >
                <Quote className="h-8 w-8 text-slate-400 mb-4" />
                <blockquote className="text-slate-700 dark:text-slate-300 mb-6 leading-relaxed">
                  "The AI compliance features saved us $2.3M annually in legal
                  and admin costs. Audit preparation went from 6 weeks to 2 days
                  with 100% accuracy on all documentation."
                </blockquote>
                <div className="flex items-center space-x-3">
                  <div className="h-12 w-12 bg-gradient-to-br from-purple-500 to-purple-600 rounded-full flex items-center justify-center">
                    <span className="text-white font-bold text-sm">HC</span>
                  </div>
                  <div>
                    <div className="font-semibold text-slate-900 dark:text-white">
                      Maria Rodriguez
                    </div>
                    <div className="text-sm text-slate-600 dark:text-slate-400">
                      Facilities Manager, HealthCare Plus
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-500">
                      25 hospital network
                    </div>
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
              <div
                className="text-center"
                data-testid="trust-indicator-organizations"
              >
                <div className="h-16 w-16 bg-gradient-to-br from-blue-500 to-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <Building2 className="h-8 w-8 text-white" />
                </div>
                <div className="text-3xl font-bold text-slate-900 dark:text-white mb-2">
                  500+
                </div>
                <div className="text-slate-600 dark:text-slate-400">
                  Organizations
                </div>
                <div className="text-sm text-slate-500 dark:text-slate-500">
                  Fortune 500 companies
                </div>
              </div>

              {/* Uptime SLA */}
              <div className="text-center" data-testid="trust-indicator-uptime">
                <div className="h-16 w-16 bg-gradient-to-br from-green-500 to-green-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <Server className="h-8 w-8 text-white" />
                </div>
                <div className="text-3xl font-bold text-slate-900 dark:text-white mb-2">
                  99.9%
                </div>
                <div className="text-slate-600 dark:text-slate-400">
                  Uptime SLA
                </div>
                <div className="text-sm text-slate-500 dark:text-slate-500">
                  Guaranteed availability
                </div>
              </div>

              {/* Support */}
              <div
                className="text-center"
                data-testid="trust-indicator-support"
              >
                <div className="h-16 w-16 bg-gradient-to-br from-purple-500 to-purple-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <HeadphonesIcon className="h-8 w-8 text-white" />
                </div>
                <div className="text-3xl font-bold text-slate-900 dark:text-white mb-2">
                  24/7
                </div>
                <div className="text-slate-600 dark:text-slate-400">
                  Enterprise Support
                </div>
                <div className="text-sm text-slate-500 dark:text-slate-500">
                  Dedicated success team
                </div>
              </div>

              {/* Response Time */}
              <div
                className="text-center"
                data-testid="trust-indicator-response"
              >
                <div className="h-16 w-16 bg-gradient-to-br from-orange-500 to-orange-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <Clock className="h-8 w-8 text-white" />
                </div>
                <div className="text-3xl font-bold text-slate-900 dark:text-white mb-2">
                  &lt;15min
                </div>
                <div className="text-slate-600 dark:text-slate-400">
                  Response Time
                </div>
                <div className="text-sm text-slate-500 dark:text-slate-500">
                  Critical issue support
                </div>
              </div>
            </div>

            <div className="flex flex-wrap justify-center items-center gap-6 pt-8 border-t border-slate-200 dark:border-slate-700">
              <div className="flex items-center space-x-2">
                {[...Array(5)].map((_, i) => (
                  <Star
                    key={i}
                    className="h-5 w-5 fill-yellow-400 text-yellow-400"
                  />
                ))}
                <span className="text-slate-600 dark:text-slate-400 ml-2">
                  4.9/5 Enterprise Rating
                </span>
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
      <section
        id="industries"
        className="py-20 bg-gradient-to-br from-slate-50 via-white to-slate-100 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900 scroll-mt-24"
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl lg:text-5xl font-bold text-slate-900 dark:text-white mb-6">
              Tailored for
              <span style={{ color: "#2460A9" }}> Your Industry</span>
            </h2>
            <p className="text-xl text-slate-600 dark:text-slate-300 max-w-3xl mx-auto">
              TPR Max adapts to serve diverse organizational needs with
              industry-specific features, compliance requirements, and security
              protocols that matter most to your sector.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-12">
            {/* Corporate Offices */}
            <Card
              className="p-8 bg-white/70 dark:bg-slate-800/70 backdrop-blur-sm border-0 shadow-xl"
              data-testid="card-corporate-offices"
            >
              <div className="space-y-6">
                <div className="flex items-center space-x-4">
                  <div className="h-16 w-16 bg-gradient-to-br from-blue-500 to-blue-600 rounded-2xl flex items-center justify-center">
                    <Building2 className="h-8 w-8 text-white" />
                  </div>
                  <div>
                    <h3 className="text-2xl font-bold text-slate-900 dark:text-white">
                      Corporate Offices
                    </h3>
                    <p className="text-lg text-slate-600 dark:text-slate-300">
                      Professional visitor experience and executive efficiency
                    </p>
                  </div>
                </div>

                <div className="space-y-4">
                  <h4 className="text-lg font-semibold text-slate-900 dark:text-white">
                    Key Challenges Solved:
                  </h4>
                  <div className="space-y-3">
                    <div className="flex items-start space-x-3">
                      <UserX className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
                      <div>
                        <span className="font-medium text-slate-900 dark:text-white">
                          Unprofessional visitor experiences
                        </span>
                        <p className="text-sm text-slate-600 dark:text-slate-400">
                          Eliminate paper logs and long wait times
                        </p>
                      </div>
                    </div>
                    <div className="flex items-start space-x-3">
                      <TimerIcon className="h-5 w-5 text-orange-500 flex-shrink-0 mt-0.5" />
                      <div>
                        <span className="font-medium text-slate-900 dark:text-white">
                          Meeting room inefficiencies
                        </span>
                        <p className="text-sm text-slate-600 dark:text-slate-400">
                          Optimize space utilization and booking conflicts
                        </p>
                      </div>
                    </div>
                    <div className="flex items-start space-x-3">
                      <TrendingDown className="h-5 w-5 text-purple-500 flex-shrink-0 mt-0.5" />
                      <div>
                        <span className="font-medium text-slate-900 dark:text-white">
                          Staff productivity losses
                        </span>
                        <p className="text-sm text-slate-600 dark:text-slate-400">
                          Reduce administrative overhead and interruptions
                        </p>
                      </div>
                    </div>
                    <div className="flex items-start space-x-3">
                      <ShieldCheck className="h-5 w-5 text-blue-500 flex-shrink-0 mt-0.5" />
                      <div>
                        <span className="font-medium text-slate-900 dark:text-white">
                          Security compliance gaps
                        </span>
                        <p className="text-sm text-slate-600 dark:text-slate-400">
                          Meet corporate governance and audit requirements
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4">
                  <h5 className="font-semibold text-slate-900 dark:text-white mb-2">
                    Corporate Benefits:
                  </h5>
                  <ul className="text-sm text-slate-700 dark:text-slate-300 space-y-1">
                    <li>
                      • Executive-level visitor experience with branded
                      touchpoints
                    </li>
                    <li>• 60% faster meeting room turnover and utilization</li>
                    <li>• Automated compliance reporting for audits</li>
                    <li>
                      • Integration with corporate calendars and directory
                      systems
                    </li>
                  </ul>
                </div>

                <Button
                  size="lg"
                  onClick={() => scrollToSection("contact")}
                  className="w-full text-white"
                  style={{ backgroundColor: "#2460A9" }}
                  data-testid="button-corporate-solution"
                >
                  <Eye className="h-4 w-4 mr-2" />
                  See Corporate Solution
                </Button>
              </div>
            </Card>

            {/* Manufacturing & Industrial */}
            <Card
              className="p-8 bg-white/70 dark:bg-slate-800/70 backdrop-blur-sm border-0 shadow-xl"
              data-testid="card-manufacturing-industrial"
            >
              <div className="space-y-6">
                <div className="flex items-center space-x-4">
                  <div className="h-16 w-16 bg-gradient-to-br from-orange-500 to-orange-600 rounded-2xl flex items-center justify-center">
                    <Factory className="h-8 w-8 text-white" />
                  </div>
                  <div>
                    <h3 className="text-2xl font-bold text-slate-900 dark:text-white">
                      Manufacturing & Industrial
                    </h3>
                    <p className="text-lg text-slate-600 dark:text-slate-300">
                      Contractor safety and regulatory compliance
                    </p>
                  </div>
                </div>

                <div className="space-y-4">
                  <h4 className="text-lg font-semibold text-slate-900 dark:text-white">
                    Key Challenges Solved:
                  </h4>
                  <div className="space-y-3">
                    <div className="flex items-start space-x-3">
                      <HardHat className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
                      <div>
                        <span className="font-medium text-slate-900 dark:text-white">
                          Contractor safety verification
                        </span>
                        <p className="text-sm text-slate-600 dark:text-slate-400">
                          Automate cert checks and safety inductions
                        </p>
                      </div>
                    </div>
                    <div className="flex items-start space-x-3">
                      <FileCheck className="h-5 w-5 text-green-500 flex-shrink-0 mt-0.5" />
                      <div>
                        <span className="font-medium text-slate-900 dark:text-white">
                          Compliance documentation
                        </span>
                        <p className="text-sm text-slate-600 dark:text-slate-400">
                          OSHA, MSHA, and industry-specific requirements
                        </p>
                      </div>
                    </div>
                    <div className="flex items-start space-x-3">
                      <Siren className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
                      <div>
                        <span className="font-medium text-slate-900 dark:text-white">
                          Emergency response delays
                        </span>
                        <p className="text-sm text-slate-600 dark:text-slate-400">
                          Instant personnel location and evacuation management
                        </p>
                      </div>
                    </div>
                    <div className="flex items-start space-x-3">
                      <PoundSterling className="h-5 w-5 text-purple-500 flex-shrink-0 mt-0.5" />
                      <div>
                        <span className="font-medium text-slate-900 dark:text-white">
                          Insurance liability exposure
                        </span>
                        <p className="text-sm text-slate-600 dark:text-slate-400">
                          Comprehensive audit trails and safety compliance
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="bg-orange-50 dark:bg-orange-900/20 rounded-lg p-4">
                  <h5 className="font-semibold text-slate-900 dark:text-white mb-2">
                    Industrial Benefits:
                  </h5>
                  <ul className="text-sm text-slate-700 dark:text-slate-300 space-y-1">
                    <li>
                      • 90% reduction in safety incidents through automated
                      verification
                    </li>
                    <li>
                      • Real-time emergency mustering for all site personnel
                    </li>
                    <li>
                      • Automated OSHA and regulatory compliance reporting
                    </li>
                    <li>
                      • Integration with existing safety management systems
                    </li>
                  </ul>
                </div>

                <Button
                  size="lg"
                  onClick={() => scrollToSection("contact")}
                  className="w-full text-white bg-orange-600 hover:bg-orange-700"
                  data-testid="button-manufacturing-solution"
                >
                  <Eye className="h-4 w-4 mr-2" />
                  See Industrial Solution
                </Button>
              </div>
            </Card>

            {/* Healthcare Facilities */}
            <Card
              className="p-8 bg-white/70 dark:bg-slate-800/70 backdrop-blur-sm border-0 shadow-xl"
              data-testid="card-healthcare-facilities"
            >
              <div className="space-y-6">
                <div className="flex items-center space-x-4">
                  <div className="h-16 w-16 bg-gradient-to-br from-green-500 to-green-600 rounded-2xl flex items-center justify-center">
                    <Stethoscope className="h-8 w-8 text-white" />
                  </div>
                  <div>
                    <h3 className="text-2xl font-bold text-slate-900 dark:text-white">
                      Healthcare Facilities
                    </h3>
                    <p className="text-lg text-slate-600 dark:text-slate-300">
                      Patient safety and HIPAA compliance
                    </p>
                  </div>
                </div>

                <div className="space-y-4">
                  <h4 className="text-lg font-semibold text-slate-900 dark:text-white">
                    Key Challenges Solved:
                  </h4>
                  <div className="space-y-3">
                    <div className="flex items-start space-x-3">
                      <Heart className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
                      <div>
                        <span className="font-medium text-slate-900 dark:text-white">
                          Patient visitor control
                        </span>
                        <p className="text-sm text-slate-600 dark:text-slate-400">
                          Restrict access to sensitive areas and patient rooms
                        </p>
                      </div>
                    </div>
                    <div className="flex items-start space-x-3">
                      <BadgeIcon className="h-5 w-5 text-blue-500 flex-shrink-0 mt-0.5" />
                      <div>
                        <span className="font-medium text-slate-900 dark:text-white">
                          Staff credentialing verification
                        </span>
                        <p className="text-sm text-slate-600 dark:text-slate-400">
                          Automated license and certification validation
                        </p>
                      </div>
                    </div>
                    <div className="flex items-start space-x-3">
                      <ShieldCheck className="h-5 w-5 text-green-500 flex-shrink-0 mt-0.5" />
                      <div>
                        <span className="font-medium text-slate-900 dark:text-white">
                          Infection control protocols
                        </span>
                        <p className="text-sm text-slate-600 dark:text-slate-400">
                          Contact tracing and health screening workflows
                        </p>
                      </div>
                    </div>
                    <div className="flex items-start space-x-3">
                      <FileCheck className="h-5 w-5 text-purple-500 flex-shrink-0 mt-0.5" />
                      <div>
                        <span className="font-medium text-slate-900 dark:text-white">
                          HIPAA compliance gaps
                        </span>
                        <p className="text-sm text-slate-600 dark:text-slate-400">
                          Secure visitor logs and access audit trails
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-4">
                  <h5 className="font-semibold text-slate-900 dark:text-white mb-2">
                    Healthcare Benefits:
                  </h5>
                  <ul className="text-sm text-slate-700 dark:text-slate-300 space-y-1">
                    <li>
                      • HIPAA-compliant visitor management with secure data
                      handling
                    </li>
                    <li>
                      • Automated staff credential verification and renewal
                      alerts
                    </li>
                    <li>• Real-time contact tracing for infection control</li>
                    <li>
                      • Integration with hospital access control and paging
                      systems
                    </li>
                  </ul>
                </div>

                <Button
                  size="lg"
                  onClick={() => scrollToSection("contact")}
                  className="w-full text-white bg-green-600 hover:bg-green-700"
                  data-testid="button-healthcare-solution"
                >
                  <Eye className="h-4 w-4 mr-2" />
                  See Healthcare Solution
                </Button>
              </div>
            </Card>

            {/* Educational Institutions */}
            <Card
              className="p-8 bg-white/70 dark:bg-slate-800/70 backdrop-blur-sm border-0 shadow-xl"
              data-testid="card-educational-institutions"
            >
              <div className="space-y-6">
                <div className="flex items-center space-x-4">
                  <div className="h-16 w-16 bg-gradient-to-br from-purple-500 to-purple-600 rounded-2xl flex items-center justify-center">
                    <GraduationCap className="h-8 w-8 text-white" />
                  </div>
                  <div>
                    <h3 className="text-2xl font-bold text-slate-900 dark:text-white">
                      Educational Institutions
                    </h3>
                    <p className="text-lg text-slate-600 dark:text-slate-300">
                      Campus security and student safety
                    </p>
                  </div>
                </div>

                <div className="space-y-4">
                  <h4 className="text-lg font-semibold text-slate-900 dark:text-white">
                    Key Challenges Solved:
                  </h4>
                  <div className="space-y-3">
                    <div className="flex items-start space-x-3">
                      <School className="h-5 w-5 text-blue-500 flex-shrink-0 mt-0.5" />
                      <div>
                        <span className="font-medium text-slate-900 dark:text-white">
                          Campus security risks
                        </span>
                        <p className="text-sm text-slate-600 dark:text-slate-400">
                          Control access to dormitories, labs, and facilities
                        </p>
                      </div>
                    </div>
                    <div className="flex items-start space-x-3">
                      <UserPlus className="h-5 w-5 text-green-500 flex-shrink-0 mt-0.5" />
                      <div>
                        <span className="font-medium text-slate-900 dark:text-white">
                          Student and faculty tracking
                        </span>
                        <p className="text-sm text-slate-600 dark:text-slate-400">
                          Attendance monitoring and location services
                        </p>
                      </div>
                    </div>
                    <div className="flex items-start space-x-3">
                      <UserX className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
                      <div>
                        <span className="font-medium text-slate-900 dark:text-white">
                          Visitor screening challenges
                        </span>
                        <p className="text-sm text-slate-600 dark:text-slate-400">
                          Background checks and restricted area access
                        </p>
                      </div>
                    </div>
                    <div className="flex items-start space-x-3">
                      <Siren className="h-5 w-5 text-orange-500 flex-shrink-0 mt-0.5" />
                      <div>
                        <span className="font-medium text-slate-900 dark:text-white">
                          Emergency response coordination
                        </span>
                        <p className="text-sm text-slate-600 dark:text-slate-400">
                          Campus-wide alerts and evacuation management
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="bg-purple-50 dark:bg-purple-900/20 rounded-lg p-4">
                  <h5 className="font-semibold text-slate-900 dark:text-white mb-2">
                    Educational Benefits:
                  </h5>
                  <ul className="text-sm text-slate-700 dark:text-slate-300 space-y-1">
                    <li>
                      • Campus-wide emergency notification and mustering system
                    </li>
                    <li>
                      • Automated visitor screening with background check
                      integration
                    </li>
                    <li>
                      • Student attendance tracking and parent notification
                    </li>
                    <li>
                      • Integration with existing student information systems
                    </li>
                  </ul>
                </div>

                <Button
                  size="lg"
                  onClick={() => scrollToSection("contact")}
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
              TPR Max serves organizations across all sectors. Our flexible
              platform adapts to your specific compliance requirements, security
              protocols, and operational workflows.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button
                size="lg"
                onClick={() => scrollToSection("contact")}
                className="text-white px-8"
                style={{ backgroundColor: "#2460A9" }}
                data-testid="button-custom-industry"
              >
                <Handshake className="h-4 w-4 mr-2" />
                Discuss Your Requirements
              </Button>
              <Button
                variant="outline"
                size="lg"
                onClick={() => scrollToSection("features")}
                className="px-8 border-2 hover:bg-slate-50 dark:hover:bg-slate-800"
                style={{ borderColor: "#2460A9", color: "#2460A9" }}
                data-testid="button-view-all-features"
              >
                <Eye className="h-4 w-4 mr-2" />
                View All Features
              </Button>
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
              <span style={{ color: "#2460A9" }}> Technology</span>
            </h2>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            <div className="text-center">
              <div className="h-16 w-16 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl flex items-center justify-center mx-auto mb-4">
                <Globe className="h-8 w-8 text-white" />
              </div>
              <h3 className="text-xl font-semibold text-slate-900 dark:text-white mb-2">
                Cloud-Native
              </h3>
              <p className="text-slate-600 dark:text-slate-300">
                Built on modern cloud infrastructure with 99.9% uptime and
                automatic scaling.
              </p>
            </div>

            <div className="text-center">
              <div className="h-16 w-16 bg-gradient-to-br from-indigo-500 to-indigo-600 rounded-xl flex items-center justify-center mx-auto mb-4">
                <Lock className="h-8 w-8 text-white" />
              </div>
              <h3 className="text-xl font-semibold text-slate-900 dark:text-white mb-2">
                Bank-Level Security
              </h3>
              <p className="text-slate-600 dark:text-slate-300">
                End-to-end encryption, GDPR compliant, and SOC 2 certified data
                protection.
              </p>
            </div>

            <div className="text-center">
              <div className="h-16 w-16 bg-gradient-to-br from-purple-500 to-purple-600 rounded-xl flex items-center justify-center mx-auto mb-4">
                <Zap className="h-8 w-8 text-white" />
              </div>
              <h3 className="text-xl font-semibold text-slate-900 dark:text-white mb-2">
                Lightning Fast
              </h3>
              <p className="text-slate-600 dark:text-slate-300">
                React frontend with real-time updates and sub-second response
                times.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Contact Section */}
      <section
        id="contact"
        className="py-20 scroll-mt-24"
        style={{
          background: `linear-gradient(135deg, #2460A9 0%, #1e4a87 100%)`,
        }}
      >
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl lg:text-5xl font-bold text-white mb-6">
            Ready to Transform Your Personnel Management?
          </h2>
          <p className="text-xl text-white/90 mb-8 max-w-2xl mx-auto">
            Join hundreds of companies using TPR Max for complete personnel
            oversight, compliance management, and emergency preparedness.
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
                style={{ color: "#2460A9" }}
                disabled={contactMutation.isPending}
                data-testid="button-contact-submit"
              >
                <Mail className="h-4 w-4 mr-2" />
                {contactMutation.isPending ? "Sending..." : "Get Demo"}
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
                <span className="text-xl font-bold">
                  ACS Safety & Security Ltd
                </span>
              </div>
              <div className="space-y-2 text-slate-300">
                <p className="font-semibold">Business Address:</p>
                <p>
                  Wittas House
                  <br />
                  Two Rivers
                  <br />
                  Station Lane
                  <br />
                  Witney
                  <br />
                  OX28 4BH
                </p>
                <p className="mt-4">
                  <span className="font-semibold">Phone:</span> +44 1344 771569
                </p>
              </div>
            </div>

            {/* Registered Office */}
            <div>
              <h3 className="text-lg font-semibold mb-4">Registered Office</h3>
              <div className="text-slate-300">
                <p>
                  20-22 Wenlock Road
                  <br />
                  London
                  <br />
                  N1 7GU
                </p>
              </div>

              {/* Additional Links */}
              <div className="mt-8">
                <h4 className="font-semibold mb-3">TPR Max</h4>
                <p className="text-slate-300 text-sm">
                  Comprehensive personnel management system for visitors,
                  contractors, and staff.
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
