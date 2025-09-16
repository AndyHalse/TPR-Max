import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
  MapPin
} from "lucide-react";

// Import ACS logo and screenshots
import acsLogo from "@assets/acs-logo-2460A9-200px.jpg";
import dashboardImg from "@assets/Screenshot 2025-09-16 at 13.39.01_1758022774224.png";
import kioskImg from "@assets/Screenshot 2025-08-24 at 16.05.36_1756044356361.png";
import thermalImg from "@assets/ID Card printer_1756400844599.png";

export default function MarketingPage() {
  const [email, setEmail] = useState("");
  const { toast } = useToast();

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

      {/* Features Section */}
      <section id="features" className="py-20 bg-white/50 dark:bg-slate-800/50 scroll-mt-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl lg:text-5xl font-bold text-slate-900 dark:text-white mb-6">
              Everything You Need for 
              <span style={{color: '#2460A9'}}>
                {" "}Personnel Management
              </span>
            </h2>
            <p className="text-xl text-slate-600 dark:text-slate-300 max-w-3xl mx-auto">
              From visitor check-ins to contractor compliance and staff management, VisiGate Pro 
              provides complete personnel oversight with emergency mustering capabilities.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {/* Thermal Printing */}
            <Card className="group hover:shadow-xl transition-all duration-300 border-0 bg-white/70 dark:bg-slate-800/70 backdrop-blur-sm">
              <CardContent className="p-8">
                <div className="mb-6">
                  <div className="h-12 w-12 bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg flex items-center justify-center mb-4">
                    <Printer className="h-6 w-6 text-white" />
                  </div>
                  <h3 className="text-xl font-semibold text-slate-900 dark:text-white mb-2">
                    Professional ID Passes
                  </h3>
                  <p className="text-slate-600 dark:text-slate-300">
                    Generate thermal ID passes for all personnel - visitors, contractors, and staff - with photos, QR codes, and custom branding.
                  </p>
                </div>
                <div className="relative">
                  <img 
                    src={thermalImg} 
                    alt="Thermal ID Card Printer" 
                    className="rounded-lg w-full h-32 object-cover"
                  />
                </div>
              </CardContent>
            </Card>

            {/* QR Code Tracking */}
            <Card className="group hover:shadow-xl transition-all duration-300 border-0 bg-white/70 dark:bg-slate-800/70 backdrop-blur-sm">
              <CardContent className="p-8">
                <div className="h-12 w-12 bg-gradient-to-br from-indigo-500 to-indigo-600 rounded-lg flex items-center justify-center mb-4">
                  <QrCode className="h-6 w-6 text-white" />
                </div>
                <h3 className="text-xl font-semibold text-slate-900 dark:text-white mb-2">
                  QR Code & Access Control
                </h3>
                <p className="text-slate-600 dark:text-slate-300 mb-4">
                  Track all personnel with QR codes, integrate with existing access control systems, and monitor real-time site occupancy.
                </p>
                <div className="flex items-center space-x-2">
                  <CheckCircle className="h-4 w-4 text-green-500" />
                  <span className="text-sm text-slate-600 dark:text-slate-400">Instant Verification</span>
                </div>
              </CardContent>
            </Card>

            {/* AI Inductions */}
            <Card className="group hover:shadow-xl transition-all duration-300 border-0 bg-white/70 dark:bg-slate-800/70 backdrop-blur-sm">
              <CardContent className="p-8">
                <div className="h-12 w-12 bg-gradient-to-br from-purple-500 to-purple-600 rounded-lg flex items-center justify-center mb-4">
                  <Brain className="h-6 w-6 text-white" />
                </div>
                <h3 className="text-xl font-semibold text-slate-900 dark:text-white mb-2">
                  Legal Compliance Management
                </h3>
                <p className="text-slate-600 dark:text-slate-300 mb-4">
                  Manage contractor legal documents, safety inductions, certifications, and compliance tracking with AI-powered content.
                </p>
                <div className="flex items-center space-x-2">
                  <CheckCircle className="h-4 w-4 text-green-500" />
                  <span className="text-sm text-slate-600 dark:text-slate-400">100% Compliant</span>
                </div>
              </CardContent>
            </Card>

            {/* Kiosk Mode */}
            <Card className="group hover:shadow-xl transition-all duration-300 border-0 bg-white/70 dark:bg-slate-800/70 backdrop-blur-sm">
              <CardContent className="p-8">
                <div className="h-12 w-12 bg-gradient-to-br from-green-500 to-green-600 rounded-lg flex items-center justify-center mb-4">
                  <Smartphone className="h-6 w-6 text-white" />
                </div>
                <h3 className="text-xl font-semibold text-slate-900 dark:text-white mb-2">
                  Emergency Mustering
                </h3>
                <p className="text-slate-600 dark:text-slate-300 mb-4">
                  Complete site personnel visibility enables effective emergency evacuations with real-time mustering capabilities.
                </p>
                <div className="relative mt-4">
                  <img 
                    src={kioskImg} 
                    alt="Emergency Mustering Interface" 
                    className="rounded-lg w-full h-24 object-cover"
                  />
                </div>
              </CardContent>
            </Card>

            {/* Analytics */}
            <Card className="group hover:shadow-xl transition-all duration-300 border-0 bg-white/70 dark:bg-slate-800/70 backdrop-blur-sm">
              <CardContent className="p-8">
                <div className="h-12 w-12 bg-gradient-to-br from-orange-500 to-orange-600 rounded-lg flex items-center justify-center mb-4">
                  <BarChart3 className="h-6 w-6 text-white" />
                </div>
                <h3 className="text-xl font-semibold text-slate-900 dark:text-white mb-2">
                  Staff Management
                </h3>
                <p className="text-slate-600 dark:text-slate-300 mb-4">
                  Complete staff check-in/out system with QR code tracking, attendance monitoring, and real-time location visibility.
                </p>
                <div className="flex items-center space-x-2">
                  <CheckCircle className="h-4 w-4 text-green-500" />
                  <span className="text-sm text-slate-600 dark:text-slate-400">Live Updates</span>
                </div>
              </CardContent>
            </Card>

            {/* Meeting Rooms & Booking Management */}
            <Card className="group hover:shadow-xl transition-all duration-300 border-0 bg-white/70 dark:bg-slate-800/70 backdrop-blur-sm">
              <CardContent className="p-8">
                <div className="h-12 w-12 bg-gradient-to-br from-rose-500 to-rose-600 rounded-lg flex items-center justify-center mb-4">
                  <Calendar className="h-6 w-6 text-white" />
                </div>
                <h3 className="text-xl font-semibold text-slate-900 dark:text-white mb-2">
                  Meeting Rooms & Booking Management
                </h3>
                <p className="text-slate-600 dark:text-slate-300 mb-4">
                  Complete room scheduling with calendar integration, equipment tracking, automated notifications, and real-time availability checking.
                </p>
                <div className="space-y-2">
                  <div className="flex items-center space-x-2">
                    <CheckCircle className="h-4 w-4 text-green-500" />
                    <span className="text-sm text-slate-600 dark:text-slate-400">Smart Scheduling</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <MapPin className="h-4 w-4 text-green-500" />
                    <span className="text-sm text-slate-600 dark:text-slate-400">Room Analytics</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Multi-Tenant */}
            <Card className="group hover:shadow-xl transition-all duration-300 border-0 bg-white/70 dark:bg-slate-800/70 backdrop-blur-sm">
              <CardContent className="p-8">
                <div className="h-12 w-12 bg-gradient-to-br from-teal-500 to-teal-600 rounded-lg flex items-center justify-center mb-4">
                  <Building2 className="h-6 w-6 text-white" />
                </div>
                <h3 className="text-xl font-semibold text-slate-900 dark:text-white mb-2">
                  Multi-Tenant Ready
                </h3>
                <p className="text-slate-600 dark:text-slate-300 mb-4">
                  Perfect for serviced offices, co-working spaces, and multi-building complexes with isolated data.
                </p>
                <div className="flex items-center space-x-2">
                  <Lock className="h-4 w-4" style={{color: '#2460A9'}} />
                  <span className="text-sm text-slate-600 dark:text-slate-400">Data Isolation</span>
                </div>
              </CardContent>
            </Card>
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