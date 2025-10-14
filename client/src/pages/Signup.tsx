import { useState } from "react";
import { useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { 
  Building2, 
  User, 
  Mail, 
  Lock, 
  Phone, 
  Globe, 
  MapPin, 
  Users, 
  Briefcase,
  ArrowRight,
  CheckCircle,
  AlertCircle,
  Eye,
  EyeOff
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { z } from "zod";
import { Link } from "wouter";

// Signup form schema matching the customer onboarding API
const signupSchema = z.object({
  // Company Details
  companyName: z.string()
    .min(2, "Company name must be at least 2 characters")
    .max(100, "Company name must be less than 100 characters")
    .regex(/^[a-zA-Z0-9\s&.-]+$/, "Company name contains invalid characters"),
  contactEmail: z.string()
    .email("Valid email address required")
    .max(255, "Email address too long"),
  
  // Admin User Details
  adminUsername: z.string()
    .min(3, "Username must be at least 3 characters")
    .max(50, "Username must be less than 50 characters")
    .regex(/^[a-zA-Z0-9_-]+$/, "Username can only contain letters, numbers, underscores, and hyphens"),
  adminEmail: z.string()
    .email("Valid admin email address required")
    .max(255, "Admin email address too long"),
  adminPassword: z.string()
    .min(8, "Password must be at least 8 characters")
    .max(128, "Password must be less than 128 characters")
    .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, "Password must contain at least one lowercase letter, one uppercase letter, and one number"),
  confirmPassword: z.string(),
  adminFirstName: z.string()
    .min(1, "First name is required")
    .max(50, "First name must be less than 50 characters"),
  adminLastName: z.string()
    .min(1, "Last name is required")
    .max(50, "Last name must be less than 50 characters"),
  
  // Optional Company Details
  industry: z.string().max(100).optional(),
  employeeCount: z.string().optional(),
  address: z.string().max(500).optional(),
  phone: z.string().max(20).optional(),
  website: z.string().url("Must be a valid website URL").or(z.literal("")).optional(),
  
  // Legal acceptance
  agreeToTerms: z.boolean().refine(val => val === true, "You must agree to the terms of service"),
  agreeToPrivacy: z.boolean().refine(val => val === true, "You must agree to the privacy policy"),
}).refine((data) => data.adminPassword === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

type SignupFormData = z.infer<typeof signupSchema>;

const industries = [
  "Technology", "Healthcare", "Finance", "Education", "Manufacturing",
  "Retail", "Construction", "Real Estate", "Legal", "Consulting",
  "Government", "Non-profit", "Other"
];

const employeeCounts = [
  "1-10", "11-50", "51-200", "201-500", "501-1000", "1000+"
];

export default function Signup() {
  const [, setLocation] = useLocation();
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [currentStep, setCurrentStep] = useState(1);
  const { toast } = useToast();

  const form = useForm<SignupFormData>({
    resolver: zodResolver(signupSchema),
    defaultValues: {
      companyName: "",
      contactEmail: "",
      adminUsername: "",
      adminEmail: "",
      adminPassword: "",
      confirmPassword: "",
      adminFirstName: "",
      adminLastName: "",
      industry: "",
      employeeCount: "",
      address: "",
      phone: "",
      website: "",
      agreeToTerms: false,
      agreeToPrivacy: false,
    },
  });

  // Company name uniqueness check mutation
  const checkCompanyMutation = useMutation({
    mutationFn: async (companyName: string) => {
      const response = await apiRequest("POST", "/api/onboarding/check-availability", {
        companyName
      });
      return response.json();
    },
  });

  const signupMutation = useMutation({
    mutationFn: async (data: SignupFormData) => {
      // Transform form data to match API schema
      const requestData = {
        companyName: data.companyName,
        contactEmail: data.contactEmail,
        adminUsername: data.adminUsername,
        adminEmail: data.adminEmail,
        adminPassword: data.adminPassword,
        adminFirstName: data.adminFirstName,
        adminLastName: data.adminLastName,
        industry: data.industry || undefined,
        employeeCount: data.employeeCount ? parseInt(data.employeeCount.split('-')[0]) : undefined,
        address: data.address || undefined,
        phone: data.phone || undefined,
        website: data.website || undefined,
        planType: "trial" as const,
        trialDays: 14,
        timezone: "Europe/London",
        currency: "GBP",
        billingCycle: "monthly" as const,
        createSubscription: false, // We'll handle this in the payment step
      };

      // Store signup data in session storage for payment step
      sessionStorage.setItem('pendingSignup', JSON.stringify(requestData));
      
      return { success: true, data: requestData };
    },
    onSuccess: () => {
      toast({
        title: "Registration Successful!",
        description: "Redirecting to payment setup...",
      });
      
      // Proceed to payment step
      setLocation("/signup/payment");
    },
    onError: (error: any) => {
      toast({
        title: "Registration Failed",
        description: error.message || "Please check your information and try again.",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: SignupFormData) => {
    signupMutation.mutate(data);
  };

  // Real-time company name validation
  const handleCompanyNameBlur = () => {
    const companyName = form.getValues("companyName");
    if (companyName && companyName.length >= 2) {
      checkCompanyMutation.mutate(companyName);
    }
  };

  const renderStep1 = () => (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <h2 className="text-2xl font-semibold text-slate-800 dark:text-slate-200">
          Company Information
        </h2>
        <p className="text-slate-600 dark:text-slate-400">
          Let's start by setting up your company profile
        </p>
      </div>

      <div className="space-y-4">
        <FormField
          control={form.control}
          name="companyName"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Company Name</FormLabel>
              <FormControl>
                <div className="relative">
                  <Building2 className="absolute left-3 top-3 text-slate-400" size={18} />
                  <Input
                    {...field}
                    placeholder="Enter your company name"
                    className="pl-10"
                    data-testid="input-company-name"
                    onBlur={(e) => {
                      field.onBlur(e);
                      handleCompanyNameBlur();
                    }}
                  />
                  {checkCompanyMutation.isLoading && (
                    <div className="absolute right-3 top-3">
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                    </div>
                  )}
                  {checkCompanyMutation.data?.available === false && (
                    <AlertCircle className="absolute right-3 top-3 text-red-500" size={18} />
                  )}
                  {checkCompanyMutation.data?.available === true && (
                    <CheckCircle className="absolute right-3 top-3 text-green-500" size={18} />
                  )}
                </div>
              </FormControl>
              {checkCompanyMutation.data?.available === false && (
                <p className="text-sm text-red-600">This company name is already taken</p>
              )}
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="contactEmail"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Company Email</FormLabel>
              <FormControl>
                <div className="relative">
                  <Mail className="absolute left-3 top-3 text-slate-400" size={18} />
                  <Input
                    {...field}
                    type="email"
                    placeholder="contact@company.com"
                    className="pl-10"
                    data-testid="input-contact-email"
                  />
                </div>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="industry"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Industry (Optional)</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                  <FormControl>
                    <SelectTrigger data-testid="select-industry">
                      <SelectValue placeholder="Select industry" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {industries.map(industry => (
                      <SelectItem key={industry} value={industry}>
                        {industry}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="employeeCount"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Company Size (Optional)</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                  <FormControl>
                    <SelectTrigger data-testid="select-employee-count">
                      <SelectValue placeholder="Number of employees" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {employeeCounts.map(count => (
                      <SelectItem key={count} value={count}>
                        {count} employees
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="address"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Company Address (Optional)</FormLabel>
              <FormControl>
                <div className="relative">
                  <MapPin className="absolute left-3 top-3 text-slate-400" size={18} />
                  <Input
                    {...field}
                    placeholder="123 Business Street, City, Country"
                    className="pl-10"
                    data-testid="input-address"
                  />
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
                <FormLabel>Phone Number (Optional)</FormLabel>
                <FormControl>
                  <div className="relative">
                    <Phone className="absolute left-3 top-3 text-slate-400" size={18} />
                    <Input
                      {...field}
                      placeholder="+44 20 1234 5678"
                      className="pl-10"
                      data-testid="input-phone"
                    />
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
                    <Input
                      {...field}
                      placeholder="https://www.company.com"
                      className="pl-10"
                      data-testid="input-website"
                    />
                  </div>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
      </div>

      <Button
        type="button"
        onClick={() => setCurrentStep(2)}
        className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700"
        data-testid="button-next-step"
      >
        Next: Admin User Setup
        <ArrowRight className="ml-2" size={18} />
      </Button>
    </div>
  );

  const renderStep2 = () => (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <h2 className="text-2xl font-semibold text-slate-800 dark:text-slate-200">
          Admin User Setup
        </h2>
        <p className="text-slate-600 dark:text-slate-400">
          Create your administrator account
        </p>
      </div>

      <div className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="adminFirstName"
            render={({ field }) => (
              <FormItem>
                <FormLabel>First Name</FormLabel>
                <FormControl>
                  <div className="relative">
                    <User className="absolute left-3 top-3 text-slate-400" size={18} />
                    <Input
                      {...field}
                      placeholder="John"
                      className="pl-10"
                      data-testid="input-admin-first-name"
                    />
                  </div>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="adminLastName"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Last Name</FormLabel>
                <FormControl>
                  <div className="relative">
                    <User className="absolute left-3 top-3 text-slate-400" size={18} />
                    <Input
                      {...field}
                      placeholder="Smith"
                      className="pl-10"
                      data-testid="input-admin-last-name"
                    />
                  </div>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="adminEmail"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Admin Email</FormLabel>
              <FormControl>
                <div className="relative">
                  <Mail className="absolute left-3 top-3 text-slate-400" size={18} />
                  <Input
                    {...field}
                    type="email"
                    placeholder="admin@company.com"
                    className="pl-10"
                    data-testid="input-admin-email"
                  />
                </div>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="adminUsername"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Username</FormLabel>
              <FormControl>
                <div className="relative">
                  <User className="absolute left-3 top-3 text-slate-400" size={18} />
                  <Input
                    {...field}
                    placeholder="admin"
                    className="pl-10"
                    data-testid="input-admin-username"
                  />
                </div>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="adminPassword"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Password</FormLabel>
              <FormControl>
                <div className="relative">
                  <Lock className="absolute left-3 top-3 text-slate-400" size={18} />
                  <Input
                    {...field}
                    type={showPassword ? "text" : "password"}
                    placeholder="Create a strong password"
                    className="pl-10 pr-10"
                    data-testid="input-admin-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-3 text-slate-400 hover:text-slate-600"
                    data-testid="button-toggle-password"
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </FormControl>
              <p className="text-xs text-slate-500">
                Must contain at least 8 characters with uppercase, lowercase, and number
              </p>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="confirmPassword"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Confirm Password</FormLabel>
              <FormControl>
                <div className="relative">
                  <Lock className="absolute left-3 top-3 text-slate-400" size={18} />
                  <Input
                    {...field}
                    type={showConfirmPassword ? "text" : "password"}
                    placeholder="Confirm your password"
                    className="pl-10 pr-10"
                    data-testid="input-confirm-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-3 top-3 text-slate-400 hover:text-slate-600"
                    data-testid="button-toggle-confirm-password"
                  >
                    {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>

      <Separator />

      <div className="space-y-4">
        <FormField
          control={form.control}
          name="agreeToTerms"
          render={({ field }) => (
            <FormItem className="flex flex-row items-start space-x-3 space-y-0">
              <FormControl>
                <Checkbox
                  checked={field.value}
                  onCheckedChange={field.onChange}
                  data-testid="checkbox-terms"
                />
              </FormControl>
              <div className="space-y-1 leading-none">
                <FormLabel className="text-sm">
                  I agree to the{" "}
                  <Link href="/terms" className="text-blue-600 hover:underline">
                    Terms of Service
                  </Link>
                </FormLabel>
              </div>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="agreeToPrivacy"
          render={({ field }) => (
            <FormItem className="flex flex-row items-start space-x-3 space-y-0">
              <FormControl>
                <Checkbox
                  checked={field.value}
                  onCheckedChange={field.onChange}
                  data-testid="checkbox-privacy"
                />
              </FormControl>
              <div className="space-y-1 leading-none">
                <FormLabel className="text-sm">
                  I agree to the{" "}
                  <Link href="/privacy" className="text-blue-600 hover:underline">
                    Privacy Policy
                  </Link>
                </FormLabel>
              </div>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>

      <div className="flex space-x-4">
        <Button
          type="button"
          onClick={() => setCurrentStep(1)}
          variant="outline"
          className="flex-1"
          data-testid="button-back"
        >
          Back
        </Button>
        <Button
          type="submit"
          disabled={signupMutation.isLoading || !form.formState.isValid}
          className="flex-1 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700"
          data-testid="button-create-account"
        >
          {signupMutation.isLoading ? "Creating Account..." : "Create Account"}
          {!signupMutation.isLoading && <ArrowRight className="ml-2" size={18} />}
        </Button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-white to-indigo-50 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900 p-4">
      <Card className="w-full max-w-2xl bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm border-2 border-blue-200 dark:border-blue-800 shadow-2xl">
        <CardHeader className="text-center space-y-4">
          <div className="mx-auto w-16 h-16 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-full flex items-center justify-center">
            <Building2 className="text-white" size={32} />
          </div>
          <div>
            <CardTitle className="text-3xl font-bold text-slate-800 dark:text-slate-200">
              Start Your Free Trial
            </CardTitle>
            <CardDescription className="text-slate-600 dark:text-slate-400">
              Join TPR Max - 14 days free, then just £49.95/month
            </CardDescription>
          </div>

          {/* Progress indicator */}
          <div className="flex items-center justify-center space-x-4">
            <div className={`flex items-center space-x-2 ${currentStep >= 1 ? 'text-blue-600' : 'text-slate-400'}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center border-2 ${currentStep >= 1 ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-300'}`}>
                {currentStep > 1 ? <CheckCircle size={16} /> : "1"}
              </div>
              <span className="text-sm font-medium">Company</span>
            </div>
            <div className={`h-px w-12 ${currentStep > 1 ? 'bg-blue-600' : 'bg-slate-300'}`}></div>
            <div className={`flex items-center space-x-2 ${currentStep >= 2 ? 'text-blue-600' : 'text-slate-400'}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center border-2 ${currentStep >= 2 ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-300'}`}>
                {currentStep > 2 ? <CheckCircle size={16} /> : "2"}
              </div>
              <span className="text-sm font-medium">Admin User</span>
            </div>
          </div>
        </CardHeader>
        
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              {currentStep === 1 && renderStep1()}
              {currentStep === 2 && renderStep2()}
            </form>
          </Form>
          
          <div className="mt-6 text-center">
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Already have an account?{" "}
              <Link href="/login" className="text-blue-600 hover:underline font-medium">
                Sign in here
              </Link>
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}