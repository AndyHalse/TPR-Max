import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { 
  CreditCard, 
  Shield, 
  Check, 
  ArrowLeft, 
  Building2, 
  Users, 
  Calendar, 
  Zap, 
  Clock,
  Star,
  Globe,
  Lock,
  HeadphonesIcon,
  AlertCircle
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";

interface PendingSignup {
  companyName: string;
  contactEmail: string;
  adminUsername: string;
  adminEmail: string;
  adminFirstName: string;
  adminLastName: string;
  adminPassword: string;
  industry?: string;
  employeeCount?: number;
  address?: string;
  phone?: string;
  website?: string;
  planType: string;
  trialDays: number;
  timezone: string;
  currency: string;
  billingCycle: string;
  createSubscription: boolean;
}

const features = [
  "Unlimited visitor check-ins",
  "Staff management system", 
  "Emergency muster & fire marshal tools",
  "Contractor management",
  "Meeting room booking",
  "Time & attendance tracking",
  "Professional ID card printing",
  "Dedicated database per customer",
  "Real-time notifications",
  "Comprehensive reporting",
  "API access & integrations",
  "24/7 email support"
];

const securityFeatures = [
  "Bank-grade encryption",
  "SOC 2 compliance",
  "GDPR compliant",
  "Regular security audits",
  "Isolated customer databases",
  "99.9% uptime SLA"
];

export default function SignupPayment() {
  const [, setLocation] = useLocation();
  const [pendingSignup, setPendingSignup] = useState<PendingSignup | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const { toast } = useToast();

  // Load pending signup data from session storage
  useEffect(() => {
    const storedData = sessionStorage.getItem('pendingSignup');
    if (storedData) {
      try {
        const data = JSON.parse(storedData);
        setPendingSignup(data);
      } catch (error) {
        console.error('Error parsing stored signup data:', error);
        toast({
          title: "Session Error",
          description: "Your signup session has expired. Please start over.",
          variant: "destructive",
        });
        setLocation("/signup");
      }
    } else {
      // No pending signup data, redirect to signup
      setLocation("/signup");
    }
  }, [setLocation, toast]);

  // Fetch subscription plans for pricing display
  const { data: plansData } = useQuery({
    queryKey: ['/api/billing/plans'],
    enabled: false, // We'll use static pricing for onboarding
  });

  // Create signup session for secure onboarding flow
  const createSignupSessionMutation = useMutation({
    mutationFn: async (signupData: PendingSignup) => {
      setIsProcessing(true);
      
      // Create secure signup session on the server
      const response = await apiRequest("POST", "/api/onboarding/create-signup-session", {
        ...signupData,
        billingCycle: 'monthly'
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to create signup session');
      }
      
      return data;
    },
    onSuccess: (data) => {
      // Store session ID for payment flow
      sessionStorage.setItem('signupSessionId', data.sessionId);
      
      toast({
        title: "Redirecting to Payment",
        description: "Setting up secure payment processing...",
      });
      
      // Now create Stripe checkout session
      createCheckoutMutation.mutate(data.sessionId);
    },
    onError: (error: any) => {
      setIsProcessing(false);
      
      toast({
        title: "Setup Failed",
        description: error.message || "Failed to initialize signup. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Create Stripe checkout session for secure payment processing
  const createCheckoutMutation = useMutation({
    mutationFn: async (sessionId: string) => {
      const currentUrl = window.location.origin;
      
      // Create Stripe checkout session via secure server endpoint
      const response = await apiRequest("POST", "/api/onboarding/create-checkout", {
        sessionId,
        successUrl: `${currentUrl}/onboarding/success?session_id={CHECKOUT_SESSION_ID}`,
        cancelUrl: `${currentUrl}/signup/payment`
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to create checkout session');
      }
      
      return data;
    },
    onSuccess: (data) => {
      // Redirect to Stripe Checkout for secure payment
      if (data.checkoutUrl) {
        window.location.href = data.checkoutUrl;
      } else {
        throw new Error('No checkout URL received');
      }
    },
    onError: (error: any) => {
      setIsProcessing(false);
      
      toast({
        title: "Payment Setup Failed",
        description: error.message || "Failed to initialize payment. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleStartTrial = () => {
    if (!pendingSignup) {
      toast({
        title: "Error",
        description: "Signup session expired. Please start over.",
        variant: "destructive",
      });
      setLocation("/signup");
      return;
    }

    // Start secure onboarding flow: create session → payment → provisioning
    createSignupSessionMutation.mutate(pendingSignup);
  };

  const handleGoBack = () => {
    setLocation("/signup");
  };

  if (!pendingSignup) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-white to-indigo-50 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-slate-600 dark:text-slate-400">Loading your signup...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900 py-8 px-4">
      <div className="max-w-6xl mx-auto">
        
        {/* Header */}
        <div className="text-center mb-8">
          <div className="mx-auto w-20 h-20 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-full flex items-center justify-center mb-4">
            <Building2 className="text-white" size={40} />
          </div>
          <h1 className="text-4xl font-bold text-slate-800 dark:text-slate-200 mb-2">
            Complete Your Setup
          </h1>
          <p className="text-xl text-slate-600 dark:text-slate-400">
            Start your 30-day free trial of TPR
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* Signup Summary */}
          <div className="lg:col-span-1">
            <Card className="bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm border-2 border-blue-200 dark:border-blue-800 shadow-xl">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Building2 className="text-blue-600" size={20} />
                  Account Summary
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <p className="text-sm text-slate-500 dark:text-slate-400">Company</p>
                  <p className="font-semibold text-slate-800 dark:text-slate-200">{pendingSignup.companyName}</p>
                </div>
                <div>
                  <p className="text-sm text-slate-500 dark:text-slate-400">Admin User</p>
                  <p className="font-semibold text-slate-800 dark:text-slate-200">
                    {pendingSignup.adminFirstName} {pendingSignup.adminLastName}
                  </p>
                  <p className="text-sm text-slate-600 dark:text-slate-400">{pendingSignup.adminEmail}</p>
                </div>
                {pendingSignup.industry && (
                  <div>
                    <p className="text-sm text-slate-500 dark:text-slate-400">Industry</p>
                    <p className="font-semibold text-slate-800 dark:text-slate-200">{pendingSignup.industry}</p>
                  </div>
                )}
                
                <Separator />
                
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-slate-600 dark:text-slate-400">Plan</span>
                    <span className="font-semibold">Professional</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600 dark:text-slate-400">Trial Period</span>
                    <Badge variant="secondary">30 days free</Badge>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600 dark:text-slate-400">After trial</span>
                    <span className="font-semibold">£49.95/month</span>
                  </div>
                </div>

                <Button
                  onClick={handleGoBack}
                  variant="outline"
                  className="w-full"
                  data-testid="button-go-back"
                >
                  <ArrowLeft className="mr-2" size={16} />
                  Edit Details
                </Button>
              </CardContent>
            </Card>

            {/* Security Features */}
            <Card className="bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm border-2 border-green-200 dark:border-green-800 shadow-xl mt-6">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Shield className="text-green-600" size={20} />
                  Enterprise Security
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {securityFeatures.map((feature, index) => (
                    <div key={index} className="flex items-center gap-2">
                      <Check className="text-green-600 w-4 h-4" />
                      <span className="text-sm text-slate-700 dark:text-slate-300">{feature}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Main Content */}
          <div className="lg:col-span-2">
            <Card className="bg-white/90 dark:bg-slate-800/90 backdrop-blur-sm border-2 border-blue-200 dark:border-blue-800 shadow-2xl">
              <CardHeader className="text-center">
                <div className="flex items-center justify-center gap-2 mb-4">
                  <Star className="text-yellow-500" size={24} />
                  <Badge variant="secondary" className="text-lg px-4 py-1">
                    Most Popular Plan
                  </Badge>
                  <Star className="text-yellow-500" size={24} />
                </div>
                <CardTitle className="text-3xl font-bold text-slate-800 dark:text-slate-200">
                  TPR Professional
                </CardTitle>
                <CardDescription className="text-lg">
                  Complete visitor management solution for modern businesses
                </CardDescription>
                
                <div className="mt-6">
                  <div className="text-center">
                    <div className="text-5xl font-bold text-blue-600 mb-2">£49.95</div>
                    <div className="text-slate-600 dark:text-slate-400 mb-4">per month, billed monthly</div>
                    <div className="inline-flex items-center gap-2 bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200 px-4 py-2 rounded-full">
                      <Clock size={16} />
                      <span className="font-semibold">30-day free trial • No setup fees</span>
                    </div>
                  </div>
                </div>
              </CardHeader>

              <CardContent className="space-y-8">
                
                {/* Trial Benefits */}
                <Alert className="border-blue-200 bg-blue-50 dark:bg-blue-900/30">
                  <Zap className="h-4 w-4 text-blue-600" />
                  <AlertDescription className="text-blue-800 dark:text-blue-200">
                    <strong>Free 30-day trial includes:</strong> Full access to all features, unlimited visitors, 
                    dedicated support, and complete setup assistance. Cancel anytime during trial with no charges.
                  </AlertDescription>
                </Alert>

                {/* Features Grid */}
                <div>
                  <h3 className="text-xl font-semibold text-slate-800 dark:text-slate-200 mb-4">
                    Everything You Need to Manage Your Workplace
                  </h3>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {features.map((feature, index) => (
                      <div key={index} className="flex items-center gap-3">
                        <div className="w-6 h-6 bg-green-100 dark:bg-green-900 rounded-full flex items-center justify-center flex-shrink-0">
                          <Check className="text-green-600 w-4 h-4" />
                        </div>
                        <span className="text-slate-700 dark:text-slate-300">{feature}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <Separator />

                {/* Support & Guarantee */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="text-center p-4 bg-blue-50 dark:bg-blue-900/30 rounded-lg">
                    <HeadphonesIcon className="mx-auto text-blue-600 mb-2" size={32} />
                    <h4 className="font-semibold text-slate-800 dark:text-slate-200">Expert Support</h4>
                    <p className="text-sm text-slate-600 dark:text-slate-400">
                      Dedicated onboarding specialist and 24/7 email support
                    </p>
                  </div>
                  
                  <div className="text-center p-4 bg-green-50 dark:bg-green-900/30 rounded-lg">
                    <Globe className="mx-auto text-green-600 mb-2" size={32} />
                    <h4 className="font-semibold text-slate-800 dark:text-slate-200">99.9% Uptime</h4>
                    <p className="text-sm text-slate-600 dark:text-slate-400">
                      Enterprise-grade reliability with SLA guarantee
                    </p>
                  </div>
                </div>

                {/* CTA Button */}
                <div className="space-y-4">
                  <Button
                    onClick={handleStartTrial}
                    disabled={isProcessing || createSignupSessionMutation.isLoading || createCheckoutMutation.isLoading}
                    className="w-full h-14 text-lg font-semibold bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white"
                    data-testid="button-start-trial"
                  >
                    {isProcessing || createSignupSessionMutation.isLoading || createCheckoutMutation.isLoading ? (
                      <>
                        <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-3"></div>
                        {createSignupSessionMutation.isLoading ? 'Setting up...' : 'Redirecting to payment...'}
                      </>
                    ) : (
                      <>
                        <CreditCard className="mr-3" size={20} />
                        Start Free 30-Day Trial
                      </>
                    )}
                  </Button>
                  
                  <div className="text-center space-y-2">
                    <div className="flex items-center justify-center gap-2 text-sm text-slate-500">
                      <Lock size={14} />
                      <span>Secure checkout • SSL encrypted • No commitment</span>
                    </div>
                    <p className="text-xs text-slate-400">
                      By continuing, you agree to our{" "}
                      <Link href="/terms" className="text-blue-600 hover:underline">
                        Terms of Service
                      </Link>{" "}
                      and{" "}
                      <Link href="/privacy" className="text-blue-600 hover:underline">
                        Privacy Policy
                      </Link>
                    </p>
                  </div>
                </div>

                {/* Processing Error */}
                {(createSignupSessionMutation.isError || createCheckoutMutation.isError) && (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>
                      {createSignupSessionMutation.error?.message || createCheckoutMutation.error?.message || "Failed to start trial. Please try again."}
                    </AlertDescription>
                  </Alert>
                )}

              </CardContent>
            </Card>
          </div>
        </div>

        {/* Footer */}
        <div className="text-center mt-8 text-sm text-slate-500 dark:text-slate-400">
          <p>
            Questions about pricing or features?{" "}
            <Link href="/contact" className="text-blue-600 hover:underline">
              Contact our sales team
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}