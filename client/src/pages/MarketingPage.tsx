import { useState, useEffect, useRef } from "react";
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
  Download,
  LogIn,
  Menu,
  X,
  ClipboardCheck,
  Play,
  Volume2,
  Wrench,
  CalendarClock,
  CalendarCheck,
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
import musterReadinessImg from "@assets/image_1774977346503.png";
import musterActiveImg from "@assets/image_1774977371147.png";
import fireMarshalMobileImg from "@assets/image_1774977602704.png";

export default function MarketingPage() {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [phone, setPhone] = useState("");
  const [activeTab, setActiveTab] = useState("dashboard");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [videoPlaying, setVideoPlaying] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

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
          "rams",
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
    mutationFn: async (data: { name: string; company: string; phone: string; email: string }) => {
      const response = await apiRequest("POST", "/api/marketing/contact", data);
      return response;
    },
    onSuccess: () => {
      toast({
        title: "Enquiry received!",
        description: "Thank you — we'll be in touch shortly to arrange your demo.",
      });
      setName("");
      setCompany("");
      setPhone("");
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
    if (email && name) {
      contactMutation.mutate({ name, company, phone, email });
    }
  };

  const scrollToSection = (sectionId: string) => {
    const element = document.getElementById(sectionId);
    if (element) {
      element.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  const handleDownloadPdf = () => {
    const link = document.createElement("a");
    link.href = "/tpr-max-brochure.pdf";
    link.download = "TPR-Max-Brochure.pdf";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
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
                variant="outline"
                onClick={handleDownloadPdf}
                className="border-[#2460A9] text-[#2460A9] hover:bg-[#2460A9] hover:text-white"
                data-testid="button-download-pdf"
              >
                <Download className="h-4 w-4 mr-1" />
                Download PDF
              </Button>
              <Button
                size="sm"
                onClick={() => scrollToSection("contact")}
                data-testid="button-demo"
              >
                Request Demo
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => window.location.href = "/"}
                className="border-slate-300 text-slate-700 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
                data-testid="button-sign-in"
              >
                <LogIn className="h-4 w-4 mr-1" />
                Sign In
              </Button>
            </div>

            {/* Mobile: Sign In + Hamburger */}
            <div className="flex md:hidden items-center space-x-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => window.location.href = "/"}
                className="border-[#2460A9] text-[#2460A9] hover:bg-[#2460A9] hover:text-white"
                data-testid="button-sign-in-mobile"
              >
                <LogIn className="h-4 w-4 mr-1" />
                Sign In
              </Button>
              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="p-2 rounded-md text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                aria-label="Toggle menu"
              >
                {mobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
              </button>
            </div>
          </div>

          {/* Mobile dropdown menu */}
          {mobileMenuOpen && (
            <div className="md:hidden border-t border-slate-200 dark:border-slate-700 py-4 space-y-3">
              <button
                onClick={() => { scrollToSection("features"); setMobileMenuOpen(false); }}
                className="block w-full text-left px-4 py-2 text-slate-600 dark:text-slate-300 hover:text-[#2460A9] hover:bg-slate-50 dark:hover:bg-slate-800 rounded-md"
              >
                Features
              </button>
              <button
                onClick={() => { scrollToSection("industries"); setMobileMenuOpen(false); }}
                className="block w-full text-left px-4 py-2 text-slate-600 dark:text-slate-300 hover:text-[#2460A9] hover:bg-slate-50 dark:hover:bg-slate-800 rounded-md"
              >
                Industries
              </button>
              <button
                onClick={() => { scrollToSection("contact"); setMobileMenuOpen(false); }}
                className="block w-full text-left px-4 py-2 text-slate-600 dark:text-slate-300 hover:text-[#2460A9] hover:bg-slate-50 dark:hover:bg-slate-800 rounded-md"
              >
                Contact
              </button>
              <div className="px-4 flex flex-col gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => { handleDownloadPdf(); setMobileMenuOpen(false); }}
                  className="w-full border-[#2460A9] text-[#2460A9] hover:bg-[#2460A9] hover:text-white"
                >
                  <Download className="h-4 w-4 mr-1" />
                  Download PDF
                </Button>
                <Button
                  size="sm"
                  className="w-full"
                  style={{ backgroundColor: "#2460A9" }}
                  onClick={() => { scrollToSection("contact"); setMobileMenuOpen(false); }}
                >
                  Request Demo
                </Button>
              </div>
            </div>
          )}
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

              <p className="text-xl text-slate-600 dark:text-slate-300 mb-6 leading-relaxed">
                Know exactly who is on your site at all times. When an emergency strikes, TPR-Max gives you instant accountability — every visitor, contractor, and staff member accounted for in seconds.
              </p>

              <div className="grid grid-cols-2 gap-2 mb-8">
                {[
                  "Emergency Mustering & Roll-Call",
                  "Contractor & CDM 2015 Compliance",
                  "AI Safety Inductions",
                  "RAMS Document Management",
                  "Planned Preventative Maintenance",
                  "Visitor & Reception Management",
                  "ID Card & Pass Printing",
                  "CO2 Sustainability Reporting",
                ].map((f) => (
                  <div key={f} className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                    <CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0" />
                    {f}
                  </div>
                ))}
              </div>

              <div className="flex flex-col sm:flex-row gap-4 justify-center lg:justify-start">
                <Button
                  size="lg"
                  className="text-lg px-8 shadow-lg hover:shadow-xl transition-shadow"
                  onClick={() => scrollToSection("contact")}
                  data-testid="button-get-started"
                  style={{ backgroundColor: "#2460A9" }}
                >
                  Book a Free Demo
                  <ArrowRight className="h-5 w-5 ml-2" />
                </Button>
                <Button
                  size="lg"
                  variant="outline"
                  className="text-lg px-8"
                  onClick={() => scrollToSection("features")}
                >
                  Explore All Features
                </Button>
              </div>

            </div>

            <div className="relative">
              <div className="relative z-10">
                <img
                  src={fireMarshalMobileImg}
                  alt="Fire Marshal using TPR Max on mobile phone during live evacuation"
                  className="rounded-xl shadow-2xl border border-slate-200 dark:border-slate-700 w-full object-cover"
                  style={{ maxHeight: "520px", objectPosition: "center top" }}
                />
                <div className="absolute -bottom-4 -right-4 bg-red-600 dark:bg-red-700 rounded-lg p-3 shadow-lg border border-red-700 dark:border-red-600">
                  <div className="flex items-center space-x-2">
                    <Siren className="h-4 w-4 text-white animate-pulse" />
                    <span className="text-sm font-medium text-white">
                      No App Download Required
                    </span>
                  </div>
                </div>
                <div className="absolute -top-4 -left-4 bg-white dark:bg-slate-800 rounded-lg p-3 shadow-lg border border-slate-200 dark:border-slate-600">
                  <div className="flex items-center space-x-2">
                    <div className="w-2.5 h-2.5 rounded-full bg-green-500 animate-pulse"></div>
                    <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
                      LIVE — Fire Marshal Panel
                    </span>
                  </div>
                </div>
              </div>
              <div className="absolute inset-0 bg-gradient-to-r from-red-600/20 to-orange-600/20 rounded-xl blur-3xl -z-10"></div>
            </div>
          </div>
        </div>
      </section>

      {/* Muster Before & During Section */}
      <section className="py-16 bg-gradient-to-b from-red-50 to-orange-50 dark:from-slate-900 dark:to-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <Badge className="mb-4 bg-red-600 text-white">
              <Siren className="h-3 w-3 mr-1" />
              Real Screens. Real Emergencies.
            </Badge>
            <h2 className="text-3xl lg:text-4xl font-bold text-slate-900 dark:text-white mb-4">
              Complete Accountability —{" "}
              <span className="text-red-600">Before & During</span> an Emergency
            </h2>
            <p className="text-lg text-slate-600 dark:text-slate-300 max-w-3xl mx-auto">
              TPR Max keeps your Fire Marshals informed at all times. Pre-loaded with permanent
              bookmarked links that work instantly — no login, no delay, no app download needed.
            </p>
          </div>

          <div className="grid lg:grid-cols-2 gap-8 items-start mb-12">
            {/* Readiness screenshot */}
            <div className="space-y-4">
              <div className="flex items-center space-x-2">
                <div className="w-3 h-3 rounded-full bg-green-500"></div>
                <span className="text-sm font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wide">Normal Operations — Emergency Readiness</span>
              </div>
              <div className="relative">
                <img
                  src={musterReadinessImg}
                  alt="TPR Max Emergency Muster - Readiness view showing Fire Marshal links, zones and on-site counts"
                  className="rounded-xl shadow-xl border border-slate-200 dark:border-slate-700 w-full"
                />
                <div className="absolute top-3 right-3 bg-green-500 text-white text-xs font-bold px-2 py-1 rounded-full flex items-center gap-1">
                  <div className="w-1.5 h-1.5 rounded-full bg-white animate-pulse"></div>
                  LIVE
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-white dark:bg-slate-800 rounded-lg p-3 text-center border border-slate-200 dark:border-slate-700">
                  <div className="text-2xl font-bold text-slate-900 dark:text-white">46</div>
                  <div className="text-xs text-slate-500">On Site</div>
                </div>
                <div className="bg-white dark:bg-slate-800 rounded-lg p-3 text-center border border-slate-200 dark:border-slate-700">
                  <div className="text-2xl font-bold" style={{ color: "#2460A9" }}>6</div>
                  <div className="text-xs text-slate-500">Zones</div>
                </div>
                <div className="bg-white dark:bg-slate-800 rounded-lg p-3 text-center border border-slate-200 dark:border-slate-700">
                  <div className="text-2xl font-bold text-purple-600">2</div>
                  <div className="text-xs text-slate-500">Marshals</div>
                </div>
              </div>
            </div>

            {/* Active emergency screenshot */}
            <div className="space-y-4">
              <div className="flex items-center space-x-2">
                <div className="w-3 h-3 rounded-full bg-red-600 animate-pulse"></div>
                <span className="text-sm font-semibold text-red-600 uppercase tracking-wide">Emergency Active — Evacuation in Progress</span>
              </div>
              <div className="relative">
                <img
                  src={musterActiveImg}
                  alt="TPR Max Emergency Muster - Active emergency showing zone selection, fire marshal links, and send alert button"
                  className="rounded-xl shadow-xl border-2 border-red-400 dark:border-red-600 w-full"
                />
                <div className="absolute top-3 right-3 bg-red-600 text-white text-xs font-bold px-2 py-1 rounded-full flex items-center gap-1">
                  <Siren className="w-3 h-3" />
                  EMERGENCY
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-red-50 dark:bg-red-900/20 rounded-lg p-3 text-center border border-red-200 dark:border-red-800">
                  <div className="text-sm font-semibold text-red-700 dark:text-red-400">Zone Targeting</div>
                  <div className="text-xs text-slate-500 mt-1">Alert only affected zones</div>
                </div>
                <div className="bg-red-50 dark:bg-red-900/20 rounded-lg p-3 text-center border border-red-200 dark:border-red-800">
                  <div className="text-sm font-semibold text-red-700 dark:text-red-400">One-Tap Alert</div>
                  <div className="text-xs text-slate-500 mt-1">Email all personnel instantly</div>
                </div>
              </div>
            </div>
          </div>

          {/* Key muster features */}
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { icon: MapPin, title: "Up to 16 Zones", desc: "Colour-coded evacuation zones with interactive floor plan placement", color: "text-red-600", bg: "bg-red-50 dark:bg-red-900/20", border: "border-red-200 dark:border-red-800" },
              { icon: Smartphone, title: "Fire Marshal Mobile", desc: "Permanent URLs open instantly on any phone — no app, no login required", color: "text-orange-600", bg: "bg-orange-50 dark:bg-orange-900/20", border: "border-orange-200 dark:border-orange-800" },
              { icon: Mail, title: "Targeted Alerts", desc: "Email only personnel in affected zones — plus all Fire Marshals automatically", color: "text-blue-600", bg: "bg-blue-50 dark:bg-blue-900/20", border: "border-blue-200 dark:border-blue-800" },
              { icon: UserCheck, title: "Digital Roll-Call", desc: "One-tap mark safe for staff, visitors, contractors and members on-site", color: "text-green-600", bg: "bg-green-50 dark:bg-green-900/20", border: "border-green-200 dark:border-green-800" },
            ].map(({ icon: Icon, title, desc, color, bg, border }) => (
              <div key={title} className={`rounded-xl p-5 border ${bg} ${border}`}>
                <Icon className={`h-6 w-6 ${color} mb-3`} />
                <div className="font-semibold text-slate-900 dark:text-white text-sm mb-1">{title}</div>
                <div className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">{desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* All Modules Overview Section */}
      <section id="modules" className="py-20 bg-white dark:bg-slate-900 scroll-mt-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-14">
            <Badge className="mb-4 text-white" style={{ backgroundColor: "#2460A9" }}>
              <Zap className="h-3 w-3 mr-1" />
              Complete Platform
            </Badge>
            <h2 className="text-3xl lg:text-4xl font-bold text-slate-900 dark:text-white mb-4">
              14 Powerful Modules.{" "}
              <span style={{ color: "#2460A9" }}>One Platform.</span>
            </h2>
            <p className="text-xl text-slate-600 dark:text-slate-300 max-w-3xl mx-auto">
              Every tool your organisation needs — from visitor sign-in to CDM 2015 construction compliance — built in and ready to use from day one.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {[
              {
                icon: BarChart3,
                name: "Dashboard",
                color: "text-blue-600",
                bg: "bg-blue-50 dark:bg-blue-900/20",
                border: "border-blue-200 dark:border-blue-800",
                desc: "Live personnel count, real-time site occupancy, security alerts, and KPI metrics at a glance.",
              },
              {
                icon: ClipboardList,
                name: "Reception",
                color: "text-indigo-600",
                bg: "bg-indigo-50 dark:bg-indigo-900/20",
                border: "border-indigo-200 dark:border-indigo-800",
                desc: "Visitor pre-registration, QR code express check-in, digital signatures, and instant host notifications.",
              },
              {
                icon: Calendar,
                name: "Rooms",
                color: "text-violet-600",
                bg: "bg-violet-50 dark:bg-violet-900/20",
                border: "border-violet-200 dark:border-violet-800",
                desc: "Meeting room booking with conflict detection, attendee management, and utilisation analytics.",
              },
              {
                icon: Users,
                name: "People",
                color: "text-sky-600",
                bg: "bg-sky-50 dark:bg-sky-900/20",
                border: "border-sky-200 dark:border-sky-800",
                desc: "Staff lifecycle management — departments, roles, permissions, onboarding invitations, and Fire Marshal designation.",
              },
              {
                icon: Printer,
                name: "ID Cards",
                color: "text-cyan-600",
                bg: "bg-cyan-50 dark:bg-cyan-900/20",
                border: "border-cyan-200 dark:border-cyan-800",
                desc: "On-demand thermal ID pass printing with QR codes. Compatible with TEC/Toshiba and Zebra printers.",
              },
              {
                icon: HardHat,
                name: "Contractors",
                color: "text-amber-600",
                bg: "bg-amber-50 dark:bg-amber-900/20",
                border: "border-amber-200 dark:border-amber-800",
                desc: "Worker and company tracking, red/yellow card compliance alerts, certification and insurance expiry monitoring.",
              },
              {
                icon: Brain,
                name: "Compliance",
                color: "text-purple-600",
                bg: "bg-purple-50 dark:bg-purple-900/20",
                border: "border-purple-200 dark:border-purple-800",
                desc: "AI-generated site safety inductions — custom scripts, photorealistic images, and professional voice narration.",
              },
              {
                icon: Siren,
                name: "Emergency",
                color: "text-red-600",
                bg: "bg-red-50 dark:bg-red-900/20",
                border: "border-red-200 dark:border-red-800",
                desc: "Zone-based evacuation mustering, fire marshal static URLs, digital roll-call, and self-service mark-safe links.",
              },
              {
                icon: Clock,
                name: "Time Track",
                color: "text-teal-600",
                bg: "bg-teal-50 dark:bg-teal-900/20",
                border: "border-teal-200 dark:border-teal-800",
                desc: "Automated check-in/out timestamps, shift management, overtime tracking, and payroll-ready export reports.",
              },
              {
                icon: Leaf,
                name: "CO2",
                color: "text-green-600",
                bg: "bg-green-50 dark:bg-green-900/20",
                border: "border-green-200 dark:border-green-800",
                desc: "AI-powered carbon footprint analysis for contractor commutes with ESG reporting and sustainability scoring.",
              },
              {
                icon: TrendingUp,
                name: "Reports",
                color: "text-blue-700",
                bg: "bg-blue-50 dark:bg-blue-900/20",
                border: "border-blue-200 dark:border-blue-800",
                desc: "Custom analytics, executive dashboards, compliance reports, and automated scheduling across all modules.",
              },
              {
                icon: ClipboardCheck,
                name: "RAMS",
                color: "text-orange-600",
                bg: "bg-orange-50 dark:bg-orange-900/20",
                border: "border-orange-200 dark:border-orange-800",
                desc: "Risk Assessment & Method Statement management — upload, review, approve, track expiry, and get worker sign-off.",
              },
              {
                icon: Wrench,
                name: "PPM",
                color: "text-emerald-600",
                bg: "bg-emerald-50 dark:bg-emerald-900/20",
                border: "border-emerald-200 dark:border-emerald-800",
                desc: "Planned preventative maintenance with automated work orders, asset register, contractor assignment, and overdue alerts.",
              },
              {
                icon: Building2,
                name: "CDM 2015",
                color: "text-violet-700",
                bg: "bg-violet-50 dark:bg-violet-900/20",
                border: "border-violet-200 dark:border-violet-800",
                desc: "Full Construction Design & Management compliance — F10 notifications, duty-holder roles, and 5-section project scoring.",
              },
            ].map(({ icon: Icon, name, color, bg, border, desc }) => (
              <div
                key={name}
                className={`rounded-xl border p-5 ${bg} ${border} flex flex-col gap-3 hover:shadow-md transition-shadow`}
              >
                <div className="flex items-center gap-3">
                  <div className={`h-9 w-9 rounded-lg flex items-center justify-center bg-white dark:bg-slate-800 shadow-sm border ${border}`}>
                    <Icon className={`h-5 w-5 ${color}`} />
                  </div>
                  <span className="font-semibold text-slate-900 dark:text-white text-sm">{name}</span>
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>

          <div className="text-center mt-12">
            <Button
              size="lg"
              onClick={() => scrollToSection("contact")}
              className="text-white"
              style={{ backgroundColor: "#2460A9" }}
            >
              <Eye className="h-4 w-4 mr-2" />
              Request a Full Platform Demo
            </Button>
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
            <Badge className="mb-4 text-white" style={{ backgroundColor: "#2460A9" }}>
              <Eye className="h-3 w-3 mr-1" />
              Deep-Dive Feature Tour
            </Badge>
            <h2 className="text-3xl lg:text-5xl font-bold text-slate-900 dark:text-white mb-6">
              Explore Every Module
              <span style={{ color: "#2460A9" }}> In Detail</span>
            </h2>
            <p className="text-xl text-slate-600 dark:text-slate-300 max-w-3xl mx-auto">
              Select any module below to see exactly what it does, how it looks, and why it matters for your organisation.
            </p>
          </div>

          <Tabs
            value={activeTab}
            onValueChange={handleTabChange}
            className="w-full"
            data-testid="features-tabs"
          >
            <TabsList className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-6 w-full mb-8 h-auto p-2 bg-white/70 dark:bg-slate-800/70 backdrop-blur-sm">
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
              <TabsTrigger
                value="rams"
                className="flex flex-col items-center p-3 text-xs font-medium data-[state=active]:bg-white data-[state=active]:text-orange-600 transition-all duration-200"
                data-testid="tab-rams"
              >
                <ClipboardCheck className="h-4 w-4 mb-1" />
                RAMS
              </TabsTrigger>
              <TabsTrigger
                value="ppm"
                className="flex flex-col items-center p-3 text-xs font-medium data-[state=active]:bg-white data-[state=active]:text-emerald-600 transition-all duration-200"
                data-testid="tab-ppm"
              >
                <Wrench className="h-4 w-4 mb-1" />
                PPM
              </TabsTrigger>
              <TabsTrigger
                value="cdm"
                className="flex flex-col items-center p-3 text-xs font-medium data-[state=active]:bg-white data-[state=active]:text-purple-600 transition-all duration-200"
                data-testid="tab-cdm"
              >
                <Building2 className="h-4 w-4 mb-1" />
                CDM 2015
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
                        occupancy patterns, peak times, and facility utilisation
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
                      Maximize facility utilisation with intelligent room
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
                        <strong>Usage Analytics:</strong> Optimise space
                        allocation with detailed utilisation reports and trends
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
                      Comprehensive contractor oversight with worker tracking, certification management, and compliance verification — including full CDM 2015 Construction Design & Management Regulations support. Ensure all contractors meet safety and legal requirements while maintaining complete audit trails.
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
                        <strong>CDM 2015 Compliance:</strong> Full duty-holder assignment, F10 HSE notifications, notifiability calculator, and five-section compliance scoring for construction projects
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

                <div className="space-y-4">
                  {/* Readiness state */}
                  <div className="relative">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-2.5 h-2.5 rounded-full bg-green-500"></div>
                      <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Before — Emergency Readiness</span>
                    </div>
                    <img
                      src={musterReadinessImg}
                      alt="TPR Max Emergency Muster readiness view — Fire Marshal links, zones, on-site counts"
                      className="rounded-xl shadow-xl border border-slate-200 dark:border-slate-700 w-full"
                      data-testid="img-emergency-readiness"
                    />
                  </div>
                  {/* Active emergency state */}
                  <div className="relative">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-2.5 h-2.5 rounded-full bg-red-600 animate-pulse"></div>
                      <span className="text-xs font-semibold text-red-600 uppercase tracking-wide">During — Emergency Active</span>
                    </div>
                    <img
                      src={musterActiveImg}
                      alt="TPR Max Emergency Muster active state — zone selection, alert sending, Fire Marshal view"
                      className="rounded-xl shadow-xl border-2 border-red-400 dark:border-red-600 w-full"
                      data-testid="img-emergency-active"
                    />
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
                      Monitor contractor commute emissions, identify optimisation opportunities, and demonstrate 
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
                        <strong>Route Optimisation:</strong> AI-generated recommendations for reducing contractor travel emissions and costs
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
                      utilisation, security metrics, and compliance analytics to
                      optimise operations and reduce costs.
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
                        for capacity planning and resource optimisation
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

            {/* RAMS Tab */}
            <TabsContent
              value="rams"
              className="space-y-6"
              data-testid="content-rams"
            >
              <div className="grid lg:grid-cols-2 gap-8 items-center">
                <div className="space-y-6">
                  <div>
                    <Badge className="mb-4 bg-orange-600">
                      <ClipboardCheck className="h-3 w-3 mr-1" />
                      Risk Assessment & Method Statements
                    </Badge>
                    <h3 className="text-3xl font-bold text-slate-900 dark:text-white mb-4">
                      RAMS Document Management
                    </h3>
                    <p className="text-lg text-slate-600 dark:text-slate-300 leading-relaxed">
                      Streamline contractor safety documentation with a complete Risk Assessment and Method Statement management system. Upload, review, approve, and track all RAMS documents with automated expiry alerts and a full audit trail — ensuring site safety compliance at every step.
                    </p>
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center space-x-3">
                      <CheckCircle className="h-5 w-5 text-green-500 flex-shrink-0" />
                      <span className="text-slate-700 dark:text-slate-300">
                        <strong>Digital Upload:</strong> Contractors submit RAMS documents (PDF, Word, Excel) directly through the portal with drag-and-drop file upload
                      </span>
                    </div>
                    <div className="flex items-center space-x-3">
                      <CheckCircle className="h-5 w-5 text-green-500 flex-shrink-0" />
                      <span className="text-slate-700 dark:text-slate-300">
                        <strong>Approval Workflow:</strong> Site managers review, approve, or reject RAMS documents with comments — full approval history maintained
                      </span>
                    </div>
                    <div className="flex items-center space-x-3">
                      <CheckCircle className="h-5 w-5 text-green-500 flex-shrink-0" />
                      <span className="text-slate-700 dark:text-slate-300">
                        <strong>Expiry Tracking:</strong> Automated email alerts notify contractors and managers when RAMS documents are due for review or have expired
                      </span>
                    </div>
                    <div className="flex items-center space-x-3">
                      <CheckCircle className="h-5 w-5 text-green-500 flex-shrink-0" />
                      <span className="text-slate-700 dark:text-slate-300">
                        <strong>Worker Acknowledgements:</strong> Digital sign-off ensures every worker has read and understood the RAMS before starting work
                      </span>
                    </div>
                    <div className="flex items-center space-x-3">
                      <CheckCircle className="h-5 w-5 text-green-500 flex-shrink-0" />
                      <span className="text-slate-700 dark:text-slate-300">
                        <strong>Full Audit Trail:</strong> Every action — upload, review, approval, rejection, and acknowledgement — is logged with timestamps and user details
                      </span>
                    </div>
                    <div className="flex items-center space-x-3">
                      <CheckCircle className="h-5 w-5 text-green-500 flex-shrink-0" />
                      <span className="text-slate-700 dark:text-slate-300">
                        <strong>Version Control:</strong> Track document revisions with version history, ensuring the latest approved RAMS is always in use
                      </span>
                    </div>
                  </div>

                  <Button
                    size="lg"
                    onClick={() => scrollToSection("contact")}
                    className="text-white bg-orange-600 hover:bg-orange-700"
                    data-testid="button-rams-demo"
                  >
                    <Eye className="h-4 w-4 mr-2" />
                    See RAMS System Live
                  </Button>
                </div>

                <div className="relative">
                  <div className="rounded-xl shadow-2xl border border-orange-200 dark:border-orange-800 bg-gradient-to-br from-orange-50 to-amber-50 dark:from-orange-900/30 dark:to-amber-900/30 p-8">
                    <div className="text-center mb-6">
                      <ClipboardCheck className="h-16 w-16 text-orange-600 mx-auto mb-4" />
                      <h4 className="text-2xl font-bold text-orange-800 dark:text-orange-200">
                        RAMS Compliance Dashboard
                      </h4>
                    </div>
                    <div className="space-y-3">
                      {[
                        { label: "Excavation Method Statement", status: "Approved", color: "bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300" },
                        { label: "Electrical Installation RAMS", status: "Pending Review", color: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/50 dark:text-yellow-300" },
                        { label: "Hot Works Risk Assessment", status: "Approved", color: "bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300" },
                        { label: "Scaffolding Erection RAMS", status: "Expiring Soon", color: "bg-orange-100 text-orange-700 dark:bg-orange-900/50 dark:text-orange-300" },
                      ].map((doc) => (
                        <div key={doc.label} className="flex items-center justify-between bg-white/80 dark:bg-slate-800/80 rounded-lg p-3">
                          <div className="flex items-center space-x-2">
                            <FileText className="h-4 w-4 text-orange-600 flex-shrink-0" />
                            <span className="text-sm font-medium text-slate-700 dark:text-slate-300 truncate">{doc.label}</span>
                          </div>
                          <span className={`text-xs font-semibold px-2 py-1 rounded-full flex-shrink-0 ${doc.color}`}>{doc.status}</span>
                        </div>
                      ))}
                    </div>
                    <div className="grid grid-cols-3 gap-3 mt-4">
                      <div className="bg-white/80 dark:bg-slate-800/80 rounded-lg p-3 text-center">
                        <div className="text-2xl font-bold text-green-600">18</div>
                        <div className="text-xs text-slate-500 dark:text-slate-400">Approved</div>
                      </div>
                      <div className="bg-white/80 dark:bg-slate-800/80 rounded-lg p-3 text-center">
                        <div className="text-2xl font-bold text-yellow-600">4</div>
                        <div className="text-xs text-slate-500 dark:text-slate-400">Pending</div>
                      </div>
                      <div className="bg-white/80 dark:bg-slate-800/80 rounded-lg p-3 text-center">
                        <div className="text-2xl font-bold text-orange-600">2</div>
                        <div className="text-xs text-slate-500 dark:text-slate-400">Expiring</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </TabsContent>

            {/* PPM Tab */}
            <TabsContent
              value="ppm"
              className="space-y-6"
              data-testid="content-ppm"
            >
              <div className="grid lg:grid-cols-2 gap-8 items-center">
                <div className="space-y-6">
                  <div>
                    <Badge className="mb-4 bg-emerald-600">
                      <Wrench className="h-3 w-3 mr-1" />
                      Planned Preventative Maintenance
                    </Badge>
                    <h3 className="text-3xl font-bold text-slate-900 dark:text-white mb-4">
                      Keep Your Site Compliant &amp; Your Assets Running
                    </h3>
                    <p className="text-lg text-slate-600 dark:text-slate-300 leading-relaxed">
                      Manage every statutory and non-statutory maintenance task from one place. Schedule inspections, generate work orders, assign contractors, and maintain a complete audit trail — so you're always ready for a compliance audit.
                    </p>
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center space-x-3">
                      <CheckCircle className="h-5 w-5 text-green-500 flex-shrink-0" />
                      <span className="text-slate-700 dark:text-slate-300">
                        <strong>Statutory Compliance Built-In:</strong> Pre-loaded UK regulation references (BS 5839, BS 5266, LOLER, Gas Safe, BS 7671) on every template
                      </span>
                    </div>
                    <div className="flex items-center space-x-3">
                      <CheckCircle className="h-5 w-5 text-green-500 flex-shrink-0" />
                      <span className="text-slate-700 dark:text-slate-300">
                        <strong>Automated Work Orders:</strong> Schedules automatically generate work orders at the right time — never miss a service interval again
                      </span>
                    </div>
                    <div className="flex items-center space-x-3">
                      <CheckCircle className="h-5 w-5 text-green-500 flex-shrink-0" />
                      <span className="text-slate-700 dark:text-slate-300">
                        <strong>Contractor Assignment:</strong> Assign work orders to contractors with a secure mobile QR link — contractors complete checklists on their phone, no app install needed
                      </span>
                    </div>
                    <div className="flex items-center space-x-3">
                      <CheckCircle className="h-5 w-5 text-green-500 flex-shrink-0" />
                      <span className="text-slate-700 dark:text-slate-300">
                        <strong>Asset Register:</strong> Track every asset by location, category, manufacturer and service history with a full maintenance log
                      </span>
                    </div>
                    <div className="flex items-center space-x-3">
                      <CheckCircle className="h-5 w-5 text-green-500 flex-shrink-0" />
                      <span className="text-slate-700 dark:text-slate-300">
                        <strong>Overdue Alerts:</strong> Dashboard flags overdue and upcoming work orders so nothing slips through the cracks
                      </span>
                    </div>
                    <div className="flex items-center space-x-3">
                      <CheckCircle className="h-5 w-5 text-green-500 flex-shrink-0" />
                      <span className="text-slate-700 dark:text-slate-300">
                        <strong>Document Attachments:</strong> Upload certificates, photos, and inspection reports directly to completed work orders
                      </span>
                    </div>
                  </div>

                  <Button
                    size="lg"
                    onClick={() => scrollToSection("contact")}
                    className="text-white bg-emerald-600 hover:bg-emerald-700"
                    data-testid="button-ppm-demo"
                  >
                    <CalendarClock className="h-4 w-4 mr-2" />
                    See PPM System Live
                  </Button>
                </div>

                <div className="relative">
                  <div className="rounded-xl shadow-2xl border border-emerald-200 dark:border-emerald-800 bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-emerald-900/30 dark:to-teal-900/30 p-8">
                    <div className="text-center mb-6">
                      <Wrench className="h-16 w-16 text-emerald-600 mx-auto mb-4" />
                      <h4 className="text-2xl font-bold text-emerald-800 dark:text-emerald-200">
                        PPM Work Order Dashboard
                      </h4>
                    </div>

                    {/* Work order list mockup */}
                    <div className="space-y-3">
                      {[
                        { label: "Annual Fire Alarm Full Test", ref: "BS 5839-1", status: "Overdue", color: "bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300" },
                        { label: "Monthly Emergency Lighting Test", ref: "BS 5266-1", status: "Due Today", color: "bg-orange-100 text-orange-700 dark:bg-orange-900/50 dark:text-orange-300" },
                        { label: "Lift Thorough Examination", ref: "LOLER 1998", status: "Scheduled", color: "bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300" },
                        { label: "Annual Boiler Gas Safety", ref: "Gas Safe Regs", status: "Completed", color: "bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300" },
                      ].map((wo) => (
                        <div key={wo.label} className="flex items-center justify-between bg-white/80 dark:bg-slate-800/80 rounded-lg p-3">
                          <div className="flex-1 min-w-0 mr-2">
                            <div className="flex items-center space-x-2">
                              <CalendarCheck className="h-4 w-4 text-emerald-600 flex-shrink-0" />
                              <span className="text-sm font-medium text-slate-700 dark:text-slate-300 truncate">{wo.label}</span>
                            </div>
                            <p className="text-xs text-slate-400 ml-6">{wo.ref}</p>
                          </div>
                          <span className={`text-xs font-semibold px-2 py-1 rounded-full flex-shrink-0 ${wo.color}`}>{wo.status}</span>
                        </div>
                      ))}
                    </div>

                    {/* Summary counts */}
                    <div className="grid grid-cols-3 gap-3 mt-4">
                      <div className="bg-white/80 dark:bg-slate-800/80 rounded-lg p-3 text-center">
                        <div className="text-2xl font-bold text-red-600">3</div>
                        <div className="text-xs text-slate-500 dark:text-slate-400">Overdue</div>
                      </div>
                      <div className="bg-white/80 dark:bg-slate-800/80 rounded-lg p-3 text-center">
                        <div className="text-2xl font-bold text-blue-600">12</div>
                        <div className="text-xs text-slate-500 dark:text-slate-400">Scheduled</div>
                      </div>
                      <div className="bg-white/80 dark:bg-slate-800/80 rounded-lg p-3 text-center">
                        <div className="text-2xl font-bold text-green-600">47</div>
                        <div className="text-xs text-slate-500 dark:text-slate-400">Completed</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </TabsContent>

            {/* CDM 2015 Tab */}
            <TabsContent
              value="cdm"
              className="space-y-6"
              data-testid="content-cdm"
            >
              <div className="grid lg:grid-cols-2 gap-8 items-center">
                <div className="space-y-6">
                  <div>
                    <Badge className="mb-4 bg-purple-600">
                      <Building2 className="h-3 w-3 mr-1" />
                      CDM 2015 Regulations
                    </Badge>
                    <h3 className="text-3xl font-bold text-slate-900 dark:text-white mb-4">
                      Construction Design & Management Compliance
                    </h3>
                    <p className="text-lg text-slate-600 dark:text-slate-300 leading-relaxed">
                      Built-in CDM 2015 compliance for construction projects — from duty-holder assignment and F10 HSE notifications through to five-section project compliance scoring. Everything you need to stay legally compliant under the Construction Design & Management Regulations 2015.
                    </p>
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center space-x-3">
                      <CheckCircle className="h-5 w-5 text-green-500 flex-shrink-0" />
                      <span className="text-slate-700 dark:text-slate-300">
                        <strong>F10 HSE Notifications:</strong> Track notification status with HSE reference numbers; overdue F10 badge alerts the duty-holder instantly
                      </span>
                    </div>
                    <div className="flex items-center space-x-3">
                      <CheckCircle className="h-5 w-5 text-green-500 flex-shrink-0" />
                      <span className="text-slate-700 dark:text-slate-300">
                        <strong>Notifiability Calculator:</strong> Automatic YES/NO threshold — flags projects over 30 working days (&gt;20 workers) or 500 person-days before work begins
                      </span>
                    </div>
                    <div className="flex items-center space-x-3">
                      <CheckCircle className="h-5 w-5 text-green-500 flex-shrink-0" />
                      <span className="text-slate-700 dark:text-slate-300">
                        <strong>Five-Section Compliance Scoring:</strong> F10 · Construction Phase Plan · Pre-Construction Information · Health & Safety File · Welfare — each tracked independently
                      </span>
                    </div>
                    <div className="flex items-center space-x-3">
                      <CheckCircle className="h-5 w-5 text-green-500 flex-shrink-0" />
                      <span className="text-slate-700 dark:text-slate-300">
                        <strong>Duty-Holder Assignment:</strong> Designate Principal Contractor and Principal Designer with professional body credentials (RIBA, ARB, ICE, CIOB)
                      </span>
                    </div>
                    <div className="flex items-center space-x-3">
                      <CheckCircle className="h-5 w-5 text-green-500 flex-shrink-0" />
                      <span className="text-slate-700 dark:text-slate-300">
                        <strong>Accreditation Badges:</strong> CHAS certified, SMAS Worksafe, and Constructionline grade (Registered/Silver/Gold/Platinum) displayed on every contractor profile
                      </span>
                    </div>
                    <div className="flex items-center space-x-3">
                      <CheckCircle className="h-5 w-5 text-green-500 flex-shrink-0" />
                      <span className="text-slate-700 dark:text-slate-300">
                        <strong>CDM Project Register:</strong> Full project lifecycle from planning through to completion with inline section editing, compliance ring indicator, and audit-ready records
                      </span>
                    </div>
                  </div>

                  <Button
                    size="lg"
                    onClick={() => scrollToSection("contact")}
                    className="text-white bg-purple-600 hover:bg-purple-700"
                    data-testid="button-cdm-demo"
                  >
                    <FileCheck className="h-4 w-4 mr-2" />
                    See CDM Compliance Live
                  </Button>
                </div>

                <div className="relative">
                  <div className="rounded-xl shadow-2xl border border-purple-200 dark:border-purple-800 bg-gradient-to-br from-purple-50 to-violet-50 dark:from-purple-900/30 dark:to-violet-900/30 p-8">
                    <div className="text-center mb-6">
                      <Building2 className="h-16 w-16 text-purple-600 mx-auto mb-4" />
                      <h4 className="text-2xl font-bold text-purple-800 dark:text-purple-200">
                        CDM Project Register
                      </h4>
                    </div>

                    {/* CDM project compliance mockup */}
                    <div className="space-y-3">
                      {[
                        { section: "F10 HSE Notification", status: "Submitted", ref: "F10/2024/08742", color: "bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300" },
                        { section: "Construction Phase Plan", status: "Approved", ref: "CPP Rev 3", color: "bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300" },
                        { section: "Pre-Construction Info", status: "Pending", ref: "PCI draft", color: "bg-orange-100 text-orange-700 dark:bg-orange-900/50 dark:text-orange-300" },
                        { section: "Health & Safety File", status: "Not Started", ref: "—", color: "bg-slate-100 text-slate-500 dark:bg-slate-700/50 dark:text-slate-400" },
                        { section: "Welfare Arrangements", status: "Complete", ref: "Welfare plan v1", color: "bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300" },
                      ].map((item) => (
                        <div key={item.section} className="flex items-center justify-between bg-white/80 dark:bg-slate-800/80 rounded-lg p-3">
                          <div className="flex-1 min-w-0 mr-2">
                            <div className="flex items-center space-x-2">
                              <ShieldCheck className="h-4 w-4 text-purple-600 flex-shrink-0" />
                              <span className="text-sm font-medium text-slate-700 dark:text-slate-300 truncate">{item.section}</span>
                            </div>
                            <p className="text-xs text-slate-400 ml-6">{item.ref}</p>
                          </div>
                          <span className={`text-xs font-semibold px-2 py-1 rounded-full flex-shrink-0 ${item.color}`}>{item.status}</span>
                        </div>
                      ))}
                    </div>

                    {/* Compliance score */}
                    <div className="grid grid-cols-3 gap-3 mt-4">
                      <div className="bg-white/80 dark:bg-slate-800/80 rounded-lg p-3 text-center">
                        <div className="text-2xl font-bold text-green-600">3/5</div>
                        <div className="text-xs text-slate-500 dark:text-slate-400">Sections Done</div>
                      </div>
                      <div className="bg-white/80 dark:bg-slate-800/80 rounded-lg p-3 text-center">
                        <div className="text-2xl font-bold text-purple-600">60%</div>
                        <div className="text-xs text-slate-500 dark:text-slate-400">Compliance</div>
                      </div>
                      <div className="bg-white/80 dark:bg-slate-800/80 rounded-lg p-3 text-center">
                        <div className="text-2xl font-bold text-amber-600">YES</div>
                        <div className="text-xs text-slate-500 dark:text-slate-400">Notifiable</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </TabsContent>
          </Tabs>

        </div>
      </section>

      {/* Industry-Specific Solutions Section */}
      <section
        id="industries"
        className="py-20 bg-gradient-to-br from-slate-50 via-white to-slate-100 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900 scroll-mt-24"
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <Badge className="mb-4 text-white" style={{ backgroundColor: "#2460A9" }}>
              <Building2 className="h-3 w-3 mr-1" />
              UK Industries
            </Badge>
            <h2 className="text-3xl lg:text-5xl font-bold text-slate-900 dark:text-white mb-6">
              Tailored for
              <span style={{ color: "#2460A9" }}> Your Industry</span>
            </h2>
            <p className="text-xl text-slate-600 dark:text-slate-300 max-w-3xl mx-auto">
              TPR-Max is built around UK Health &amp; Safety legislation and the compliance challenges real British organisations face every day.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-10">

            {/* Construction & Civil Engineering */}
            <Card className="p-8 bg-white/70 dark:bg-slate-800/70 backdrop-blur-sm border-0 shadow-xl" data-testid="card-construction">
              <div className="space-y-6">
                <div className="flex items-center space-x-4">
                  <div className="h-16 w-16 bg-gradient-to-br from-orange-500 to-orange-600 rounded-2xl flex items-center justify-center flex-shrink-0">
                    <HardHat className="h-8 w-8 text-white" />
                  </div>
                  <div>
                    <h3 className="text-2xl font-bold text-slate-900 dark:text-white">Construction &amp; Civil Engineering</h3>
                    <p className="text-slate-600 dark:text-slate-300">CDM 2015 compliance and site safety</p>
                  </div>
                </div>
                <div className="space-y-3">
                  {[
                    { icon: FileCheck, colour: "text-orange-500", title: "CDM 2015 obligations", desc: "Manage F10 notifications, Principal Contractor duties, and the health &amp; safety file" },
                    { icon: HardHat, colour: "text-red-500", title: "Sub-contractor compliance", desc: "CHAS, SafeContractor, CSCS card checks, and AI-powered site inductions" },
                    { icon: FileText, colour: "text-blue-500", title: "RAMS management", desc: "Collect, review, and store Method Statements and Risk Assessments digitally" },
                    { icon: Siren, colour: "text-red-600", title: "Emergency mustering on large sites", desc: "Real-time roll-call across multiple zones and welfare areas" },
                  ].map(({ icon: Icon, colour, title, desc }) => (
                    <div key={title} className="flex items-start space-x-3">
                      <Icon className={`h-5 w-5 ${colour} flex-shrink-0 mt-0.5`} />
                      <div>
                        <span className="font-medium text-slate-900 dark:text-white">{title}</span>
                        <p className="text-sm text-slate-600 dark:text-slate-400" dangerouslySetInnerHTML={{ __html: desc }} />
                      </div>
                    </div>
                  ))}
                </div>
                <div className="bg-orange-50 dark:bg-orange-900/20 rounded-lg p-4">
                  <h5 className="font-semibold text-slate-900 dark:text-white mb-2">Key Benefits:</h5>
                  <ul className="text-sm text-slate-700 dark:text-slate-300 space-y-1">
                    <li>• Full CDM 2015 compliance register with F10 notification tracking</li>
                    <li>• Digital RAMS library — no more paper chasing</li>
                    <li>• Instant site-wide emergency mustering for all workers and visitors</li>
                    <li>• Contractor induction records held securely for HSE audit</li>
                  </ul>
                </div>
                <Button size="lg" onClick={() => scrollToSection("contact")} className="w-full text-white bg-orange-600 hover:bg-orange-700" data-testid="button-construction-solution">
                  <Mail className="h-4 w-4 mr-2" />Discuss Construction Requirements
                </Button>
              </div>
            </Card>

            {/* Manufacturing & Warehousing */}
            <Card className="p-8 bg-white/70 dark:bg-slate-800/70 backdrop-blur-sm border-0 shadow-xl" data-testid="card-manufacturing-industrial">
              <div className="space-y-6">
                <div className="flex items-center space-x-4">
                  <div className="h-16 w-16 bg-gradient-to-br from-blue-500 to-blue-600 rounded-2xl flex items-center justify-center flex-shrink-0">
                    <Factory className="h-8 w-8 text-white" />
                  </div>
                  <div>
                    <h3 className="text-2xl font-bold text-slate-900 dark:text-white">Manufacturing &amp; Warehousing</h3>
                    <p className="text-slate-600 dark:text-slate-300">Operational safety and regulatory compliance</p>
                  </div>
                </div>
                <div className="space-y-3">
                  {[
                    { icon: UserCheck, colour: "text-blue-500", title: "Contractor and visitor safety inductions", desc: "AI-powered inductions ensure every person on-site understands the hazards before they enter" },
                    { icon: Wrench, colour: "text-green-500", title: "Planned Preventative Maintenance", desc: "Schedule and track PPM for plant, equipment, and facilities to meet HSE requirements" },
                    { icon: Users, colour: "text-purple-500", title: "Lone worker monitoring", desc: "Track and protect lone workers across large warehouse and factory floors" },
                    { icon: Siren, colour: "text-red-600", title: "Emergency evacuation", desc: "Instant mustering with Fire Marshal panels and real-time headcount" },
                  ].map(({ icon: Icon, colour, title, desc }) => (
                    <div key={title} className="flex items-start space-x-3">
                      <Icon className={`h-5 w-5 ${colour} flex-shrink-0 mt-0.5`} />
                      <div>
                        <span className="font-medium text-slate-900 dark:text-white">{title}</span>
                        <p className="text-sm text-slate-600 dark:text-slate-400">{desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4">
                  <h5 className="font-semibold text-slate-900 dark:text-white mb-2">Key Benefits:</h5>
                  <ul className="text-sm text-slate-700 dark:text-slate-300 space-y-1">
                    <li>• Full audit trail of contractor compliance for HSE inspections</li>
                    <li>• PPM schedules and completion records reduce equipment downtime</li>
                    <li>• Real-time emergency mustering across all site zones</li>
                    <li>• CHAS and SafeContractor compliance checks automated</li>
                  </ul>
                </div>
                <Button size="lg" onClick={() => scrollToSection("contact")} className="w-full text-white" style={{ backgroundColor: "#2460A9" }} data-testid="button-manufacturing-solution">
                  <Mail className="h-4 w-4 mr-2" />Discuss Manufacturing Requirements
                </Button>
              </div>
            </Card>

            {/* NHS Trusts & Healthcare */}
            <Card className="p-8 bg-white/70 dark:bg-slate-800/70 backdrop-blur-sm border-0 shadow-xl" data-testid="card-healthcare-facilities">
              <div className="space-y-6">
                <div className="flex items-center space-x-4">
                  <div className="h-16 w-16 bg-gradient-to-br from-green-500 to-green-600 rounded-2xl flex items-center justify-center flex-shrink-0">
                    <Stethoscope className="h-8 w-8 text-white" />
                  </div>
                  <div>
                    <h3 className="text-2xl font-bold text-slate-900 dark:text-white">NHS Trusts &amp; Healthcare</h3>
                    <p className="text-slate-600 dark:text-slate-300">Patient safety, GDPR, and estates compliance</p>
                  </div>
                </div>
                <div className="space-y-3">
                  {[
                    { icon: Heart, colour: "text-red-500", title: "Visitor access control", desc: "Manage access to wards, theatres, and sensitive areas with visitor pre-registration" },
                    { icon: BadgeIcon, colour: "text-blue-500", title: "Contractor DBS and compliance", desc: "Verify DBS certificates, mandatory training, and contractor qualifications before site access" },
                    { icon: Siren, colour: "text-red-600", title: "Fire and emergency mustering", desc: "Rapid patient and staff roll-call across multiple wards and departments" },
                    { icon: Wrench, colour: "text-purple-500", title: "Estates PPM compliance", desc: "NHS estates planned maintenance schedules, completion records, and audit trails" },
                  ].map(({ icon: Icon, colour, title, desc }) => (
                    <div key={title} className="flex items-start space-x-3">
                      <Icon className={`h-5 w-5 ${colour} flex-shrink-0 mt-0.5`} />
                      <div>
                        <span className="font-medium text-slate-900 dark:text-white">{title}</span>
                        <p className="text-sm text-slate-600 dark:text-slate-400">{desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-4">
                  <h5 className="font-semibold text-slate-900 dark:text-white mb-2">Key Benefits:</h5>
                  <ul className="text-sm text-slate-700 dark:text-slate-300 space-y-1">
                    <li>• GDPR-compliant visitor records with automatic data retention controls</li>
                    <li>• Contractor compliance dashboard for Estates Managers</li>
                    <li>• Emergency mustering across wards — know who is where instantly</li>
                    <li>• NHS estates PPM tracking with completion evidence</li>
                  </ul>
                </div>
                <Button size="lg" onClick={() => scrollToSection("contact")} className="w-full text-white bg-green-600 hover:bg-green-700" data-testid="button-healthcare-solution">
                  <Mail className="h-4 w-4 mr-2" />Discuss Healthcare Requirements
                </Button>
              </div>
            </Card>

            {/* Schools, Colleges & Universities */}
            <Card className="p-8 bg-white/70 dark:bg-slate-800/70 backdrop-blur-sm border-0 shadow-xl" data-testid="card-educational-institutions">
              <div className="space-y-6">
                <div className="flex items-center space-x-4">
                  <div className="h-16 w-16 bg-gradient-to-br from-purple-500 to-purple-600 rounded-2xl flex items-center justify-center flex-shrink-0">
                    <GraduationCap className="h-8 w-8 text-white" />
                  </div>
                  <div>
                    <h3 className="text-2xl font-bold text-slate-900 dark:text-white">Schools, Colleges &amp; Universities</h3>
                    <p className="text-slate-600 dark:text-slate-300">Safeguarding, fire safety, and contractor compliance</p>
                  </div>
                </div>
                <div className="space-y-3">
                  {[
                    { icon: ShieldCheck, colour: "text-purple-500", title: "Safeguarding and DBS compliance", desc: "Pre-screen all visitors and contractors against DBS requirements before they step on site" },
                    { icon: UserX, colour: "text-red-500", title: "Unauthorised visitor prevention", desc: "Instant alerts for unrecognised visitors — protect pupils and students effectively" },
                    { icon: HardHat, colour: "text-orange-500", title: "Contractor management", desc: "Manage maintenance, construction, and service contractors with inductions and RAMS" },
                    { icon: Siren, colour: "text-red-600", title: "Fire evacuation and roll-call", desc: "Digital fire register for staff, pupils, and visitors — no more paper lists" },
                  ].map(({ icon: Icon, colour, title, desc }) => (
                    <div key={title} className="flex items-start space-x-3">
                      <Icon className={`h-5 w-5 ${colour} flex-shrink-0 mt-0.5`} />
                      <div>
                        <span className="font-medium text-slate-900 dark:text-white">{title}</span>
                        <p className="text-sm text-slate-600 dark:text-slate-400">{desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="bg-purple-50 dark:bg-purple-900/20 rounded-lg p-4">
                  <h5 className="font-semibold text-slate-900 dark:text-white mb-2">Key Benefits:</h5>
                  <ul className="text-sm text-slate-700 dark:text-slate-300 space-y-1">
                    <li>• Digital visitor register with safeguarding checks — Ofsted ready</li>
                    <li>• Instant fire evacuation roll-call for staff, pupils, and visitors</li>
                    <li>• Contractor compliance records held securely on-platform</li>
                    <li>• GDPR-compliant data handling for all site visitors</li>
                  </ul>
                </div>
                <Button size="lg" onClick={() => scrollToSection("contact")} className="w-full text-white bg-purple-600 hover:bg-purple-700" data-testid="button-educational-solution">
                  <Mail className="h-4 w-4 mr-2" />Discuss Education Requirements
                </Button>
              </div>
            </Card>

            {/* Facilities Management */}
            <Card className="p-8 bg-white/70 dark:bg-slate-800/70 backdrop-blur-sm border-0 shadow-xl" data-testid="card-facilities-management">
              <div className="space-y-6">
                <div className="flex items-center space-x-4">
                  <div className="h-16 w-16 bg-gradient-to-br from-teal-500 to-teal-600 rounded-2xl flex items-center justify-center flex-shrink-0">
                    <Wrench className="h-8 w-8 text-white" />
                  </div>
                  <div>
                    <h3 className="text-2xl font-bold text-slate-900 dark:text-white">Facilities Management</h3>
                    <p className="text-slate-600 dark:text-slate-300">Multi-site PPM, contractor control, and sustainability</p>
                  </div>
                </div>
                <div className="space-y-3">
                  {[
                    { icon: CalendarClock, colour: "text-teal-500", title: "Planned Preventative Maintenance", desc: "Schedule recurring maintenance tasks across multiple sites with completion records and evidence uploads" },
                    { icon: FileText, colour: "text-blue-500", title: "Contractor RAMS and inductions", desc: "Ensure every visiting engineer or sub-contractor has the correct method statement on file" },
                    { icon: Calendar, colour: "text-purple-500", title: "Room and resource booking", desc: "Manage meeting rooms, shared spaces, and equipment bookings across your estate" },
                    { icon: Leaf, colour: "text-green-500", title: "CO₂ sustainability reporting", desc: "Track your organisation's carbon footprint with automated CO₂ data collection" },
                  ].map(({ icon: Icon, colour, title, desc }) => (
                    <div key={title} className="flex items-start space-x-3">
                      <Icon className={`h-5 w-5 ${colour} flex-shrink-0 mt-0.5`} />
                      <div>
                        <span className="font-medium text-slate-900 dark:text-white">{title}</span>
                        <p className="text-sm text-slate-600 dark:text-slate-400">{desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="bg-teal-50 dark:bg-teal-900/20 rounded-lg p-4">
                  <h5 className="font-semibold text-slate-900 dark:text-white mb-2">Key Benefits:</h5>
                  <ul className="text-sm text-slate-700 dark:text-slate-300 space-y-1">
                    <li>• PPM scheduling and evidence records across all managed sites</li>
                    <li>• One platform for contractors, visitors, and room bookings</li>
                    <li>• CO₂ reporting to support Net Zero and sustainability targets</li>
                    <li>• Full audit trail for client SLA reporting</li>
                  </ul>
                </div>
                <Button size="lg" onClick={() => scrollToSection("contact")} className="w-full text-white bg-teal-600 hover:bg-teal-700" data-testid="button-fm-solution">
                  <Mail className="h-4 w-4 mr-2" />Discuss FM Requirements
                </Button>
              </div>
            </Card>

            {/* Commercial Offices & Business Parks */}
            <Card className="p-8 bg-white/70 dark:bg-slate-800/70 backdrop-blur-sm border-0 shadow-xl" data-testid="card-corporate-offices">
              <div className="space-y-6">
                <div className="flex items-center space-x-4">
                  <div className="h-16 w-16 bg-gradient-to-br from-indigo-500 to-indigo-600 rounded-2xl flex items-center justify-center flex-shrink-0">
                    <Building2 className="h-8 w-8 text-white" />
                  </div>
                  <div>
                    <h3 className="text-2xl font-bold text-slate-900 dark:text-white">Commercial Offices &amp; Business Parks</h3>
                    <p className="text-slate-600 dark:text-slate-300">Professional visitor experience and fire safety compliance</p>
                  </div>
                </div>
                <div className="space-y-3">
                  {[
                    { icon: UserCheck, colour: "text-indigo-500", title: "Professional visitor management", desc: "Pre-registered arrivals, branded sign-in, instant photo ID badges — no more paper visitor books" },
                    { icon: Calendar, colour: "text-blue-500", title: "Meeting room bookings", desc: "Self-service room and desk booking with real-time availability across all floors and buildings" },
                    { icon: HardHat, colour: "text-orange-500", title: "Contractor access control", desc: "Manage maintenance contractors with digital inductions, permit-to-work, and RAMS sign-off" },
                    { icon: Siren, colour: "text-red-600", title: "Fire evacuation compliance", desc: "Real-time fire register — know exactly who is in the building and who has evacuated" },
                  ].map(({ icon: Icon, colour, title, desc }) => (
                    <div key={title} className="flex items-start space-x-3">
                      <Icon className={`h-5 w-5 ${colour} flex-shrink-0 mt-0.5`} />
                      <div>
                        <span className="font-medium text-slate-900 dark:text-white">{title}</span>
                        <p className="text-sm text-slate-600 dark:text-slate-400">{desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="bg-indigo-50 dark:bg-indigo-900/20 rounded-lg p-4">
                  <h5 className="font-semibold text-slate-900 dark:text-white mb-2">Key Benefits:</h5>
                  <ul className="text-sm text-slate-700 dark:text-slate-300 space-y-1">
                    <li>• Digital visitor book — GDPR compliant, no paper required</li>
                    <li>• Branded check-in experience for tenants and clients</li>
                    <li>• Fire evacuation list always up-to-date and accessible on mobile</li>
                    <li>• Contractor compliance for building management teams</li>
                  </ul>
                </div>
                <Button size="lg" onClick={() => scrollToSection("contact")} className="w-full text-white bg-indigo-600 hover:bg-indigo-700" data-testid="button-corporate-solution">
                  <Mail className="h-4 w-4 mr-2" />Discuss Office Requirements
                </Button>
              </div>
            </Card>

          </div>

          {/* Industry CTA Section */}
          <div className="text-center mt-16 p-8 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-slate-800 dark:to-slate-700 rounded-2xl border border-slate-200 dark:border-slate-600">
            <h3 className="text-2xl font-bold text-slate-900 dark:text-white mb-4">
              Don't See Your Sector?
            </h3>
            <p className="text-lg text-slate-600 dark:text-slate-300 mb-6 max-w-2xl mx-auto">
              TPR-Max serves organisations across all UK sectors — from local authorities and logistics to retail and leisure. Our flexible platform adapts to your specific compliance requirements, security protocols, and operational workflows.
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


      {/* Mid-page CTA Banner */}
      <section
        className="py-16"
        style={{ background: "linear-gradient(135deg, #1e3a5f 0%, #2460A9 60%, #1e4a87 100%)" }}
      >
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl lg:text-4xl font-bold text-white mb-4">
            Ready to see TPR-Max in action?
          </h2>
          <p className="text-xl text-white/85 mb-8 max-w-2xl mx-auto">
            Book a free, no-obligation demo and we'll walk you through every module relevant to your organisation — live, on your own data.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button
              size="lg"
              className="bg-white hover:bg-slate-100 text-lg font-semibold px-10"
              style={{ color: "#2460A9" }}
              onClick={() => scrollToSection("contact")}
            >
              <Mail className="h-5 w-5 mr-2" />
              Book Your Free Demo
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="text-white border-white/50 hover:bg-white/10 text-lg px-10"
              onClick={() => scrollToSection("features")}
            >
              <Eye className="h-5 w-5 mr-2" />
              Explore Features First
            </Button>
          </div>
          <p className="text-white/60 text-sm mt-6">No commitment required · UK-based team · Response within 1 business day</p>
        </div>
      </section>

      {/* Why TPR-Max Section */}
      <section className="py-20 bg-white/50 dark:bg-slate-800/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-14">
            <Badge className="mb-4 text-white" style={{ backgroundColor: "#2460A9" }}>
              <ShieldCheck className="h-3 w-3 mr-1" />
              Built for UK Organisations
            </Badge>
            <h2 className="text-3xl lg:text-4xl font-bold text-slate-900 dark:text-white mb-4">
              Why Organisations Choose TPR-Max
            </h2>
            <p className="text-xl text-slate-600 dark:text-slate-300 max-w-3xl mx-auto">
              Built specifically for UK Health & Safety, compliance, and construction regulations — not a generic product adapted to fit.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              {
                icon: Globe,
                color: "from-blue-500 to-blue-600",
                title: "Cloud-Native & Always On",
                desc: "Hosted on modern cloud infrastructure with 99.9% uptime. No on-premise servers, no maintenance windows — just reliable access, anywhere.",
              },
              {
                icon: Lock,
                color: "from-indigo-500 to-indigo-600",
                title: "GDPR Compliant & Secure",
                desc: "End-to-end encryption, role-based access control, and full tenant data isolation. Your data stays yours — never shared between organisations.",
              },
              {
                icon: Smartphone,
                color: "from-green-500 to-green-600",
                title: "No App Download Required",
                desc: "Fire Marshals, contractors, and visitors all operate through browser-based links. Nothing to install, nothing to update — works on any device.",
              },
              {
                icon: Database,
                color: "from-purple-500 to-purple-600",
                title: "BioStar 2 Integration Ready",
                desc: "Native integration with Suprema BioStar 2 access control — sync personnel data, automate check-in from door readers, and unify security with HR.",
              },
              {
                icon: Users,
                color: "from-amber-500 to-amber-600",
                title: "True Multi-Tenant",
                desc: "Built from the ground up for multi-site organisations. Each tenant has fully isolated data, branding, and configuration — managed from one admin console.",
              },
              {
                icon: Zap,
                color: "from-red-500 to-red-600",
                title: "UK Regulations Built-In",
                desc: "CDM 2015, RAMS, fire safety mustering, GDPR data handling — UK-specific compliance requirements are first-class features, not afterthoughts.",
              },
            ].map(({ icon: Icon, color, title, desc }) => (
              <div key={title} className="flex gap-4 p-6 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:shadow-md transition-shadow">
                <div className={`h-12 w-12 bg-gradient-to-br ${color} rounded-xl flex items-center justify-center flex-shrink-0`}>
                  <Icon className="h-6 w-6 text-white" />
                </div>
                <div>
                  <h3 className="font-semibold text-slate-900 dark:text-white mb-2">{title}</h3>
                  <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">{desc}</p>
                </div>
              </div>
            ))}
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
        <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <Badge className="mb-6 bg-white/20 text-white border-white/30">
            <Mail className="h-3 w-3 mr-1" />
            Get in Touch
          </Badge>
          <h2 className="text-3xl lg:text-5xl font-bold text-white mb-4">
            Book Your Free Demo Today
          </h2>
          <p className="text-xl text-white/90 mb-8 max-w-2xl mx-auto">
            Tell us a little about your organisation and we'll arrange a personalised walkthrough — tailored to your industry and the modules that matter most to you.
          </p>

          <form onSubmit={handleContactSubmit} className="text-left">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-white/80 text-sm font-medium mb-1">
                  Full Name <span className="text-red-300">*</span>
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Jane Smith"
                  className="w-full px-4 py-3 rounded-lg border-0 bg-white/90 text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-white/50"
                  required
                  data-testid="input-contact-name"
                />
              </div>
              <div>
                <label className="block text-white/80 text-sm font-medium mb-1">
                  Company Name
                </label>
                <input
                  type="text"
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                  placeholder="Acme Ltd"
                  className="w-full px-4 py-3 rounded-lg border-0 bg-white/90 text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-white/50"
                  data-testid="input-contact-company"
                />
              </div>
              <div>
                <label className="block text-white/80 text-sm font-medium mb-1">
                  Email Address <span className="text-red-300">*</span>
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="jane@acme.com"
                  className="w-full px-4 py-3 rounded-lg border-0 bg-white/90 text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-white/50"
                  required
                  data-testid="input-contact-email"
                />
              </div>
              <div>
                <label className="block text-white/80 text-sm font-medium mb-1">
                  Phone Number
                </label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+44 7700 900000"
                  className="w-full px-4 py-3 rounded-lg border-0 bg-white/90 text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-white/50"
                  data-testid="input-contact-phone"
                />
              </div>
            </div>
            <Button
              type="submit"
              size="lg"
              className="w-full bg-white hover:bg-slate-50 font-semibold text-base py-3"
              style={{ color: "#2460A9" }}
              disabled={contactMutation.isPending}
              data-testid="button-contact-submit"
            >
              <Mail className="h-5 w-5 mr-2" />
              {contactMutation.isPending ? "Sending Enquiry..." : "Book My Free Demo"}
            </Button>
          </form>

          <div className="flex flex-wrap justify-center gap-6 mt-8 pt-6 border-t border-white/20">
            {[
              { icon: CheckCircle, text: "No commitment required" },
              { icon: Clock, text: "Response within 1 business day" },
              { icon: Shield, text: "Your data is never shared" },
            ].map(({ icon: Icon, text }) => (
              <div key={text} className="flex items-center gap-2 text-white/75 text-sm">
                <Icon className="h-4 w-4 text-white/60" />
                {text}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-slate-900 text-white py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-3 gap-8 mb-10">
            {/* Company Info */}
            <div className="md:col-span-1">
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
              <div className="space-y-2 text-slate-300 text-sm">
                <p>
                  Wittas House, Two Rivers<br />
                  Station Lane, Witney<br />
                  OX28 4BH
                </p>
                <p className="mt-3">
                  <span className="font-semibold">Phone:</span> +44 1344 771569
                </p>
                <p>
                  <span className="font-semibold">Registered Office:</span><br />
                  20-22 Wenlock Road, London N1 7GU
                </p>
              </div>
            </div>

            {/* Quick Links */}
            <div>
              <h3 className="text-base font-semibold mb-4 text-white">TPR-Max Platform</h3>
              <ul className="space-y-2 text-sm text-slate-300">
                {[
                  ["Emergency Mustering", "features"],
                  ["All 14 Modules", "modules"],
                  ["CDM 2015 Compliance", "features"],
                  ["Industries We Serve", "industries"],
                  ["Book a Demo", "contact"],
                ].map(([label, section]) => (
                  <li key={label}>
                    <button
                      onClick={() => scrollToSection(section)}
                      className="hover:text-white transition-colors text-left"
                    >
                      {label}
                    </button>
                  </li>
                ))}
              </ul>
            </div>

            {/* Product */}
            <div>
              <h3 className="text-base font-semibold mb-4 text-white">About TPR-Max</h3>
              <p className="text-slate-300 text-sm leading-relaxed">
                A comprehensive personnel management system built for UK organisations. 14 modules covering emergency mustering, contractor compliance, CDM 2015, PPM, visitor management, and more.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                {["GDPR Compliant", "UK-Built", "Multi-Tenant", "BioStar 2 Ready"].map(tag => (
                  <span key={tag} className="text-xs bg-slate-700 text-slate-300 px-2 py-1 rounded-full">{tag}</span>
                ))}
              </div>
            </div>
          </div>

          {/* Bottom Bar */}
          <div className="border-t border-slate-800 pt-6 flex flex-col sm:flex-row justify-between items-center gap-2">
            <p className="text-slate-400 text-sm">
              © 2026 ACS Safety & Security Ltd. All rights reserved.
            </p>
            <p className="text-slate-500 text-xs">
              TPR-Max is a product of ACS Safety & Security Ltd, registered in England & Wales.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
