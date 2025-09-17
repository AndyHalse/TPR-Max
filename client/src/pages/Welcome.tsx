import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ObjectUploader } from "@/components/ObjectUploader";
import { 
  CheckCircle, 
  Building2, 
  User, 
  Upload, 
  Settings, 
  Users, 
  ArrowRight, 
  Copy, 
  ExternalLink,
  Sparkles,
  Mail,
  Phone,
  Globe,
  MapPin,
  UserPlus,
  Building,
  Shield,
  Crown,
  Rocket
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { z } from "zod";
import type { InsertCompanySettings, InsertDepartment } from "@shared/schema";

interface NewCustomerLogin {
  customerId: string;
  companyName: string;
  username: string;
  password: string;
  loginUrl: string;
}

const companySettingsSchema = z.object({
  companyName: z.string().min(1, "Company name is required"),
  address: z.string().optional(),
  phone: z.string().optional(),
  website: z.string().url("Must be a valid URL").or(z.literal("")).optional(),
  supportEmail: z.string().email().optional(),
  description: z.string().optional(),
});

type CompanySettingsData = z.infer<typeof companySettingsSchema>;

const defaultDepartments = [
  { name: "Administration", description: "Administrative staff and management", color: "bg-blue-500" },
  { name: "Security", description: "Security personnel and guards", color: "bg-red-500" },
  { name: "Operations", description: "Operational staff and workers", color: "bg-green-500" },
  { name: "Visitors", description: "General visitors and guests", color: "bg-purple-500" },
  { name: "Contractors", description: "External contractors and vendors", color: "bg-orange-500" }
];

export default function Welcome() {
  const [, setLocation] = useLocation();
  const [customerLogin, setCustomerLogin] = useState<NewCustomerLogin | null>(null);
  const [currentStep, setCurrentStep] = useState(1);
  const [completedSteps, setCompletedSteps] = useState<number[]>([]);
  const [logoUploaded, setLogoUploaded] = useState(false);
  const { toast } = useToast();

  const form = useForm<CompanySettingsData>({
    resolver: zodResolver(companySettingsSchema),
    defaultValues: {
      companyName: "",
      address: "",
      phone: "",
      website: "",
      supportEmail: "",
      description: "",
    },
  });

  // SECURITY FIX: Use authenticated session instead of URL credentials
  // Check if user is authenticated via proper session
  const { data: user, isLoading: isLoadingAuth, error: authError } = useQuery({
    queryKey: ["/api/auth/me"],
    queryFn: async () => {
      console.log("🔍 [WELCOME AUTH] Checking authentication for welcome setup...");
      try {
        const res = await fetch("/api/auth/me", {
          credentials: "include",
        });
        console.log("📥 [WELCOME AUTH] Response status:", res.status);
        
        if (res.status === 401) {
          console.log("❌ [WELCOME AUTH] Unauthenticated - redirecting to login");
          return null;
        }
        if (!res.ok) {
          throw new Error(`${res.status}: ${res.statusText}`);
        }
        const userData = await res.json();
        console.log("✅ [WELCOME AUTH] Authenticated user for welcome setup:", userData.username);
        return userData;
      } catch (error) {
        console.log("💥 [WELCOME AUTH] Network error:", error);
        return null;
      }
    },
    retry: false,
    staleTime: 0,
    gcTime: 0,
  });

  // Load company settings for authenticated user
  const { data: companySettings } = useQuery({
    queryKey: ["/api/settings"],
    enabled: !!user, // Only fetch if user is authenticated
  });

  useEffect(() => {
    if (isLoadingAuth) {
      console.log("⏳ [WELCOME] Checking authentication...");
      return;
    }

    if (!user) {
      console.log("❌ [WELCOME] No authenticated user - redirecting to login");
      toast({
        title: "Authentication Required",
        description: "Please log in to access the welcome setup.",
        variant: "destructive",
      });
      setLocation("/login");
      return;
    }

    console.log("✅ [WELCOME] User authenticated - setting up welcome page");
    
    // Create customer login data from authenticated session (for compatibility)
    const sessionBasedData = {
      customerId: user.customerId || 'unknown',
      companyName: companySettings?.companyName || 'Your Company',
      username: user.username,
      password: '', // Never expose passwords
      loginUrl: window.location.origin + '/login'
    };
    
    setCustomerLogin(sessionBasedData);
    
    // Pre-populate form with company name from settings
    if (companySettings?.companyName) {
      form.setValue('companyName', companySettings.companyName);
    }
    
    // Show welcome message for onboarding
    toast({
      title: "Welcome!",
      description: "Your account has been successfully created. Let's complete your setup.",
    });
    
  }, [user, isLoadingAuth, companySettings, toast, setLocation, form]);

  // Update company settings mutation
  const updateSettingsMutation = useMutation({
    mutationFn: async (settings: Partial<InsertCompanySettings>) => {
      const response = await apiRequest("PUT", "/api/settings", settings);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Settings Updated",
        description: "Company settings have been saved successfully.",
      });
      markStepComplete(2);
      setCurrentStep(3);
    },
    onError: (error: any) => {
      toast({
        title: "Update Failed", 
        description: error.message || "Failed to update company settings.",
        variant: "destructive",
      });
    },
  });

  // Create departments mutation
  const createDepartmentsMutation = useMutation({
    mutationFn: async () => {
      const promises = defaultDepartments.map(dept => 
        apiRequest("POST", "/api/departments", dept)
      );
      await Promise.all(promises);
    },
    onSuccess: () => {
      toast({
        title: "Departments Created",
        description: "Default departments have been set up successfully.",
      });
      markStepComplete(3);
      setCurrentStep(4);
    },
    onError: (error: any) => {
      toast({
        title: "Setup Failed",
        description: error.message || "Failed to create departments.",
        variant: "destructive",
      });
    },
  });

  const markStepComplete = (step: number) => {
    setCompletedSteps(prev => [...prev, step]);
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: "Copied!",
      description: `${label} copied to clipboard`,
    });
  };

  const onSubmitSettings = (data: CompanySettingsData) => {
    updateSettingsMutation.mutate(data);
  };

  const handleCreateDepartments = () => {
    createDepartmentsMutation.mutate();
  };

  const handleCompleteSetup = () => {
    // Clear session data and redirect to login
    sessionStorage.removeItem('newCustomerLogin');
    sessionStorage.removeItem('pendingSignup');
    
    toast({
      title: "Setup Complete!",
      description: "Welcome to VisiGate Pro! You can now log in with your credentials.",
    });
    
    setLocation("/login");
  };

  const handleLogoUploadSuccess = (urls: string[]) => {
    if (urls.length > 0) {
      // Update company settings with logo URL
      updateSettingsMutation.mutate({ companyLogo: urls[0] });
      setLogoUploaded(true);
      markStepComplete(1);
      setCurrentStep(2);
    }
  };

  if (!customerLogin) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-white to-indigo-50 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-slate-600 dark:text-slate-400">Loading your welcome setup...</p>
        </div>
      </div>
    );
  }

  const renderStep1 = () => (
    <Card className="bg-white/90 dark:bg-slate-800/90 backdrop-blur-sm border-2 border-blue-200 dark:border-blue-800 shadow-xl">
      <CardHeader className="text-center">
        <div className="mx-auto w-16 h-16 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-full flex items-center justify-center mb-4">
          <Upload className="text-white" size={32} />
        </div>
        <CardTitle className="text-2xl">Upload Your Company Logo</CardTitle>
        <CardDescription>
          Add your company logo to personalize your VisiGate Pro workspace
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <ObjectUploader
          onUploadSuccess={handleLogoUploadSuccess}
          maxFiles={1}
          acceptedFileTypes={["image/png", "image/jpeg", "image/svg+xml"]}
          folder="company-logos"
          description="Upload your company logo (PNG, JPG, or SVG)"
        />
        
        <div className="text-center">
          <Button
            onClick={() => {
              markStepComplete(1);
              setCurrentStep(2);
            }}
            variant="outline"
            className="w-full"
            data-testid="button-skip-logo"
          >
            Skip for Now
          </Button>
        </div>
      </CardContent>
    </Card>
  );

  const renderStep2 = () => (
    <Card className="bg-white/90 dark:bg-slate-800/90 backdrop-blur-sm border-2 border-blue-200 dark:border-blue-800 shadow-xl">
      <CardHeader>
        <div className="mx-auto w-16 h-16 bg-gradient-to-br from-green-600 to-emerald-600 rounded-full flex items-center justify-center mb-4">
          <Settings className="text-white" size={32} />
        </div>
        <CardTitle className="text-2xl text-center">Company Settings</CardTitle>
        <CardDescription className="text-center">
          Configure your company details and contact information
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmitSettings)} className="space-y-4">
            <FormField
              control={form.control}
              name="companyName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Company Name</FormLabel>
                  <FormControl>
                    <div className="relative">
                      <Building2 className="absolute left-3 top-3 text-slate-400" size={18} />
                      <Input {...field} className="pl-10" data-testid="input-company-name" />
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="address"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Address (Optional)</FormLabel>
                  <FormControl>
                    <div className="relative">
                      <MapPin className="absolute left-3 top-3 text-slate-400" size={18} />
                      <Input {...field} placeholder="123 Business Street, City, Country" className="pl-10" data-testid="input-address" />
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Phone (Optional)</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Phone className="absolute left-3 top-3 text-slate-400" size={18} />
                        <Input {...field} placeholder="+44 20 1234 5678" className="pl-10" data-testid="input-phone" />
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="website"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Website (Optional)</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Globe className="absolute left-3 top-3 text-slate-400" size={18} />
                        <Input {...field} placeholder="https://www.company.com" className="pl-10" data-testid="input-website" />
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="supportEmail"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Support Email (Optional)</FormLabel>
                  <FormControl>
                    <div className="relative">
                      <Mail className="absolute left-3 top-3 text-slate-400" size={18} />
                      <Input {...field} placeholder="support@company.com" className="pl-10" data-testid="input-support-email" />
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex gap-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => setCurrentStep(1)}
                className="flex-1"
                data-testid="button-back"
              >
                Back
              </Button>
              <Button
                type="submit"
                disabled={updateSettingsMutation.isLoading}
                className="flex-1"
                data-testid="button-save-settings"
              >
                {updateSettingsMutation.isLoading ? "Saving..." : "Save & Continue"}
              </Button>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  );

  const renderStep3 = () => (
    <Card className="bg-white/90 dark:bg-slate-800/90 backdrop-blur-sm border-2 border-blue-200 dark:border-blue-800 shadow-xl">
      <CardHeader>
        <div className="mx-auto w-16 h-16 bg-gradient-to-br from-purple-600 to-violet-600 rounded-full flex items-center justify-center mb-4">
          <Users className="text-white" size={32} />
        </div>
        <CardTitle className="text-2xl text-center">Department Setup</CardTitle>
        <CardDescription className="text-center">
          Create default departments to organize your staff and visitors
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-4">
          {defaultDepartments.map((dept, index) => (
            <div key={index} className="flex items-center gap-4 p-4 border rounded-lg">
              <div className={`w-4 h-4 rounded-full ${dept.color}`}></div>
              <div className="flex-1">
                <h4 className="font-semibold text-slate-800 dark:text-slate-200">{dept.name}</h4>
                <p className="text-sm text-slate-600 dark:text-slate-400">{dept.description}</p>
              </div>
              <CheckCircle className="text-green-600" size={20} />
            </div>
          ))}
        </div>

        <Alert className="border-blue-200 bg-blue-50 dark:bg-blue-900/30">
          <Building className="h-4 w-4 text-blue-600" />
          <AlertDescription className="text-blue-800 dark:text-blue-200">
            These departments will help you organize staff, visitors, and contractors. 
            You can add more departments or modify these later in your settings.
          </AlertDescription>
        </Alert>

        <div className="flex gap-4">
          <Button
            type="button"
            variant="outline"
            onClick={() => setCurrentStep(2)}
            className="flex-1"
            data-testid="button-back"
          >
            Back
          </Button>
          <Button
            onClick={handleCreateDepartments}
            disabled={createDepartmentsMutation.isLoading}
            className="flex-1"
            data-testid="button-create-departments"
          >
            {createDepartmentsMutation.isLoading ? "Creating..." : "Create Departments"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );

  const renderStep4 = () => (
    <Card className="bg-white/90 dark:bg-slate-800/90 backdrop-blur-sm border-2 border-green-200 dark:border-green-800 shadow-xl">
      <CardHeader className="text-center">
        <div className="mx-auto w-20 h-20 bg-gradient-to-br from-green-600 to-emerald-600 rounded-full flex items-center justify-center mb-4">
          <Crown className="text-white" size={40} />
        </div>
        <CardTitle className="text-3xl font-bold text-slate-800 dark:text-slate-200">
          Welcome to VisiGate Pro!
        </CardTitle>
        <CardDescription className="text-lg">
          Your workspace is ready. Here are your login credentials.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-8">
        
        {/* Login Credentials */}
        <div className="bg-slate-50 dark:bg-slate-800 p-6 rounded-lg border-2 border-dashed border-slate-300 dark:border-slate-600">
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Shield className="text-blue-600" size={20} />
            Your Login Credentials
          </h3>
          
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-slate-600 dark:text-slate-400">Company:</span>
              <div className="flex items-center gap-2">
                <code className="bg-slate-200 dark:bg-slate-700 px-2 py-1 rounded text-sm font-mono">
                  {customerLogin.companyName}
                </code>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => copyToClipboard(customerLogin.companyName, "Company name")}
                  data-testid="button-copy-company"
                >
                  <Copy size={14} />
                </Button>
              </div>
            </div>
            
            <div className="flex items-center justify-between">
              <span className="text-slate-600 dark:text-slate-400">Username:</span>
              <div className="flex items-center gap-2">
                <code className="bg-slate-200 dark:bg-slate-700 px-2 py-1 rounded text-sm font-mono">
                  {customerLogin.username}
                </code>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => copyToClipboard(customerLogin.username, "Username")}
                  data-testid="button-copy-username"
                >
                  <Copy size={14} />
                </Button>
              </div>
            </div>
            
            <div className="flex items-center justify-between">
              <span className="text-slate-600 dark:text-slate-400">Password:</span>
              <div className="flex items-center gap-2">
                <code className="bg-slate-200 dark:bg-slate-700 px-2 py-1 rounded text-sm font-mono">
                  {customerLogin.password}
                </code>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => copyToClipboard(customerLogin.password, "Password")}
                  data-testid="button-copy-password"
                >
                  <Copy size={14} />
                </Button>
              </div>
            </div>
          </div>

          <Button
            onClick={() => window.open(customerLogin.loginUrl, '_blank')}
            className="w-full mt-4"
            data-testid="button-open-login"
          >
            <ExternalLink className="mr-2" size={16} />
            Open Login Page
          </Button>
        </div>

        {/* Next Steps */}
        <div>
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Rocket className="text-purple-600" size={20} />
            What's Next?
          </h3>
          
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="w-6 h-6 bg-blue-100 dark:bg-blue-900 rounded-full flex items-center justify-center flex-shrink-0">
                <span className="text-blue-600 font-semibold text-sm">1</span>
              </div>
              <span className="text-slate-700 dark:text-slate-300">Log in to your VisiGate Pro dashboard</span>
            </div>
            
            <div className="flex items-center gap-3">
              <div className="w-6 h-6 bg-blue-100 dark:bg-blue-900 rounded-full flex items-center justify-center flex-shrink-0">
                <span className="text-blue-600 font-semibold text-sm">2</span>
              </div>
              <span className="text-slate-700 dark:text-slate-300">Add your first staff members</span>
            </div>
            
            <div className="flex items-center gap-3">
              <div className="w-6 h-6 bg-blue-100 dark:bg-blue-900 rounded-full flex items-center justify-center flex-shrink-0">
                <span className="text-blue-600 font-semibold text-sm">3</span>
              </div>
              <span className="text-slate-700 dark:text-slate-300">Start managing visitors and contractors</span>
            </div>
            
            <div className="flex items-center gap-3">
              <div className="w-6 h-6 bg-blue-100 dark:bg-blue-900 rounded-full flex items-center justify-center flex-shrink-0">
                <span className="text-blue-600 font-semibold text-sm">4</span>
              </div>
              <span className="text-slate-700 dark:text-slate-300">Explore reporting and analytics features</span>
            </div>
          </div>
        </div>

        <Alert className="border-green-200 bg-green-50 dark:bg-green-900/30">
          <Sparkles className="h-4 w-4 text-green-600" />
          <AlertDescription className="text-green-800 dark:text-green-200">
            <strong>Your 14-day free trial is now active!</strong> You have full access to all features. 
            Need help getting started? Our support team is here to assist you at support@visigatepro.com
          </AlertDescription>
        </Alert>

        <Button
          onClick={handleCompleteSetup}
          className="w-full h-12 text-lg font-semibold bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700"
          data-testid="button-complete-setup"
        >
          <CheckCircle className="mr-3" size={20} />
          Complete Setup & Go to Login
        </Button>
      </CardContent>
    </Card>
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900 py-8 px-4">
      <div className="max-w-4xl mx-auto">
        
        {/* Header */}
        <div className="text-center mb-8">
          <div className="mx-auto w-20 h-20 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-full flex items-center justify-center mb-4">
            <Sparkles className="text-white" size={40} />
          </div>
          <h1 className="text-4xl font-bold text-slate-800 dark:text-slate-200 mb-2">
            Welcome to VisiGate Pro!
          </h1>
          <p className="text-xl text-slate-600 dark:text-slate-400">
            Let's set up your workspace in just a few steps
          </p>
        </div>

        {/* Progress Steps */}
        <div className="flex items-center justify-center mb-8">
          {[1, 2, 3, 4].map((step) => (
            <div key={step} className="flex items-center">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center border-2 ${
                completedSteps.includes(step) 
                  ? 'bg-green-600 border-green-600 text-white' 
                  : currentStep === step 
                    ? 'bg-blue-600 border-blue-600 text-white' 
                    : 'bg-slate-200 border-slate-300 text-slate-500'
              }`}>
                {completedSteps.includes(step) ? <CheckCircle size={16} /> : step}
              </div>
              {step < 4 && (
                <div className={`w-16 h-px ${
                  completedSteps.includes(step) 
                    ? 'bg-green-600' 
                    : 'bg-slate-300'
                }`}></div>
              )}
            </div>
          ))}
        </div>

        {/* Step Labels */}
        <div className="grid grid-cols-4 gap-4 mb-8 text-center">
          <div className="text-sm text-slate-600 dark:text-slate-400">Company Logo</div>
          <div className="text-sm text-slate-600 dark:text-slate-400">Company Settings</div>
          <div className="text-sm text-slate-600 dark:text-slate-400">Departments</div>
          <div className="text-sm text-slate-600 dark:text-slate-400">Complete</div>
        </div>

        {/* Current Step Content */}
        <div className="max-w-2xl mx-auto">
          {currentStep === 1 && renderStep1()}
          {currentStep === 2 && renderStep2()}
          {currentStep === 3 && renderStep3()}
          {currentStep === 4 && renderStep4()}
        </div>

        {/* Footer */}
        <div className="text-center mt-8 text-sm text-slate-500 dark:text-slate-400">
          <p>
            Need help?{" "}
            <a href="mailto:support@visigatepro.com" className="text-blue-600 hover:underline">
              Contact our support team
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}