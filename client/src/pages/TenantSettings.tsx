import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import GlassCard from "@/components/GlassCard";
import { Building2, ArrowLeft, Save, Users, Mail, Globe, DollarSign, Upload, Image, X } from "lucide-react";
import { ObjectUploader } from "@/components/ObjectUploader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

interface TenantCompany {
  id: string;
  companyName: string;
  contactEmail: string;
  slug: string;
  industry: string;
  employeeCount: number;
  isActive: boolean;
  subscriptionTier: string;
  address?: string;
  phone?: string;
  website?: string;
  description?: string;
  logoUrl?: string;
}

const tenantSettingsSchema = z.object({
  companyName: z.string().min(1, "Company name is required"),
  contactEmail: z.string().email("Valid email is required"),
  industry: z.string().min(1, "Industry is required"),
  employeeCount: z.number().min(1, "Employee count must be at least 1"),
  subscriptionTier: z.string().min(1, "Subscription tier is required"),
  address: z.string().optional(),
  phone: z.string().optional(),
  website: z.string().optional(),
  description: z.string().optional(),
});

type TenantSettingsFormData = z.infer<typeof tenantSettingsSchema>;

const industries = [
  "Technology",
  "Healthcare",
  "Finance",
  "Manufacturing",
  "Retail",
  "Consulting",
  "Education",
  "Real Estate",
  "Marketing",
  "Legal",
  "Construction",
  "Energy",
  "Transportation",
  "Other"
];

const subscriptionTiers = [
  "basic",
  "standard", 
  "premium",
  "enterprise"
];

export default function TenantSettings() {
  const { slug } = useParams<{ slug: string }>();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [logoPreview, setLogoPreview] = useState<string>("");
  
  const form = useForm<TenantSettingsFormData>({
    resolver: zodResolver(tenantSettingsSchema),
  });

  // Get tenant details
  const { data: tenant, isLoading: tenantLoading } = useQuery<TenantCompany>({
    queryKey: [`/api/super-admin/tenants/${slug}`],
    enabled: !!slug,
  });

  // Reset form when tenant data loads
  React.useEffect(() => {
    if (tenant) {
      form.reset({
        companyName: tenant.companyName,
        contactEmail: tenant.contactEmail,
        industry: tenant.industry,
        employeeCount: tenant.employeeCount,
        subscriptionTier: tenant.subscriptionTier,
        address: tenant.address || "",
        phone: tenant.phone || "",
        website: tenant.website || "",
        description: tenant.description || "",
      });
      setLogoPreview(tenant.logoUrl || "");
    }
  }, [tenant, form]);

  // Update tenant mutation
  const updateMutation = useMutation({
    mutationFn: async (data: TenantSettingsFormData) => {
      return apiRequest(`/api/super-admin/tenants/${tenant?.id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Tenant settings updated successfully",
      });
      queryClient.invalidateQueries({ queryKey: [`/api/super-admin/tenants/${slug}`] });
      queryClient.invalidateQueries({ queryKey: ["/api/super-admin/tenants"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update tenant settings",
        variant: "destructive",
      });
    },
  });

  // Logo upload mutation
  const logoUploadMutation = useMutation({
    mutationFn: async (logoUrl: string) => {
      return apiRequest(`/api/super-admin/tenants/${tenant?.id}`, {
        method: "PATCH",
        body: JSON.stringify({ logoUrl }),
      });
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Company logo updated successfully",
      });
      queryClient.invalidateQueries({ queryKey: [`/api/super-admin/tenants/${slug}`] });
      queryClient.invalidateQueries({ queryKey: ["/api/super-admin/tenants"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update company logo",
        variant: "destructive",
      });
    },
  });

  const handleLogoUpload = (uploadUrl: string) => {
    setLogoPreview(uploadUrl);
    logoUploadMutation.mutate(uploadUrl);
  };

  const handleRemoveLogo = () => {
    setLogoPreview("");
    logoUploadMutation.mutate("");
  };

  const onSubmit = (data: TenantSettingsFormData) => {
    updateMutation.mutate(data);
  };

  if (tenantLoading) {
    return <div className="flex items-center justify-center min-h-screen">Loading tenant settings...</div>;
  }

  if (!tenant) {
    return <div className="flex items-center justify-center min-h-screen">Tenant not found</div>;
  }

  return (
    <div className="space-y-8 p-6 rounded-xl bg-background min-h-screen">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setLocation(`/tenant/${slug}/dashboard`)}
            className="flex items-center gap-2"
            data-testid="button-back-to-tenant-dashboard"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Dashboard
          </Button>
          <div>
            <h1 className="text-3xl font-bold text-slate-800 dark:text-slate-200 flex items-center gap-3">
              <Building2 className="text-blue-600" size={32} />
              {tenant.companyName} Settings
            </h1>
            <p className="text-slate-600 dark:text-slate-400 mt-1">
              Manage tenant configuration and preferences
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={tenant.isActive ? "default" : "secondary"}>
            {tenant.isActive ? "Active" : "Inactive"}
          </Badge>
          <Badge variant="outline">{tenant.subscriptionTier}</Badge>
        </div>
      </div>

      {/* Settings Form */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <Card>
            <div className="p-6">
              <h3 className="text-lg font-semibold text-slate-800 mb-6">Company Information</h3>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="companyName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Company Name</FormLabel>
                          <FormControl>
                            <Input {...field} data-testid="input-company-name" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="contactEmail"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Contact Email</FormLabel>
                          <FormControl>
                            <Input type="email" {...field} data-testid="input-contact-email" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="industry"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Industry</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger data-testid="select-industry">
                                <SelectValue placeholder="Select industry" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {industries.map((industry) => (
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
                          <FormLabel>Employee Count</FormLabel>
                          <FormControl>
                            <Input 
                              type="number" 
                              {...field} 
                              onChange={(e) => field.onChange(parseInt(e.target.value))}
                              data-testid="input-employee-count" 
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="phone"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Phone Number</FormLabel>
                          <FormControl>
                            <Input {...field} data-testid="input-phone" />
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
                          <FormLabel>Website</FormLabel>
                          <FormControl>
                            <Input {...field} placeholder="https://..." data-testid="input-website" />
                          </FormControl>
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
                        <FormLabel>Address</FormLabel>
                        <FormControl>
                          <Input {...field} data-testid="input-address" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="description"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Company Description</FormLabel>
                        <FormControl>
                          <Textarea {...field} rows={4} data-testid="textarea-description" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="subscriptionTier"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Subscription Tier</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-subscription-tier">
                              <SelectValue placeholder="Select subscription tier" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {subscriptionTiers.map((tier) => (
                              <SelectItem key={tier} value={tier}>
                                {tier.charAt(0).toUpperCase() + tier.slice(1)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="flex justify-end">
                    <Button 
                      type="submit" 
                      disabled={updateMutation.isPending}
                      className="flex items-center gap-2"
                      data-testid="button-save-settings"
                    >
                      <Save className="w-4 h-4" />
                      {updateMutation.isPending ? "Saving..." : "Save Settings"}
                    </Button>
                  </div>
                </form>
              </Form>
            </div>
          </Card>

          {/* Logo Upload Section */}
          <Card>
            <div className="p-6">
              <h3 className="text-lg font-semibold text-slate-800 mb-6 flex items-center gap-2">
                <Image className="w-5 h-5" />
                Company Logo for Visitor Passes
              </h3>
              <div className="space-y-4">
                {/* Current Logo Preview */}
                {logoPreview && (
                  <div className="flex items-center gap-4 p-4 border border-slate-200 rounded-lg bg-slate-50">
                    <img 
                      src={logoPreview} 
                      alt="Company Logo" 
                      className="w-16 h-16 object-contain border border-slate-200 rounded"
                    />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-slate-800">Current Logo</p>
                      <p className="text-xs text-slate-600">This logo will appear on visitor passes</p>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleRemoveLogo}
                      disabled={logoUploadMutation.isPending}
                      data-testid="button-remove-logo"
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                )}

                {/* Upload New Logo */}
                <div className="border-2 border-dashed border-slate-300 rounded-lg p-6 text-center">
                  <div className="space-y-4">
                    <div className="mx-auto w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center">
                      <Upload className="w-8 h-8 text-slate-400" />
                    </div>
                    <div>
                      <h4 className="text-sm font-medium text-slate-800 mb-2">
                        {logoPreview ? "Update Company Logo" : "Upload Company Logo"}
                      </h4>
                      <p className="text-xs text-slate-600 mb-4">
                        Recommended: PNG or JPG format, max 5MB
                        <br />
                        Best size: 300x100px for visitor passes
                      </p>
                      <ObjectUploader
                        onUploadComplete={handleLogoUpload}
                        accept="image/*"
                        maxSize={5 * 1024 * 1024}
                      >
                        <div className="flex items-center gap-2">
                          <Upload className="w-4 h-4" />
                          {logoUploadMutation.isPending ? "Uploading..." : "Choose File"}
                        </div>
                      </ObjectUploader>
                    </div>
                  </div>
                </div>

                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <div className="flex gap-3">
                    <div className="flex-shrink-0">
                      <div className="w-5 h-5 bg-blue-600 rounded-full flex items-center justify-center">
                        <span className="text-white text-xs font-bold">i</span>
                      </div>
                    </div>
                    <div className="text-sm">
                      <p className="font-medium text-blue-800 mb-1">Logo Usage</p>
                      <p className="text-blue-700">
                        Your company logo will be automatically included on all visitor passes printed for guests visiting your company. 
                        The logo helps with branding and professional appearance of visitor badges.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </Card>
        </div>

        {/* Summary Cards */}
        <div className="space-y-6">
          <GlassCard>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-slate-600 text-sm font-medium">Company Status</p>
                <p className="text-lg font-bold text-slate-800 mt-1">
                  {tenant.isActive ? "Active" : "Inactive"}
                </p>
              </div>
              <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center">
                <Building2 className="text-green-600" size={24} />
              </div>
            </div>
          </GlassCard>

          <GlassCard>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-slate-600 text-sm font-medium">Total Employees</p>
                <p className="text-lg font-bold text-slate-800 mt-1">
                  {tenant.employeeCount}
                </p>
              </div>
              <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center">
                <Users className="text-blue-600" size={24} />
              </div>
            </div>
          </GlassCard>

          <GlassCard>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-slate-600 text-sm font-medium">Subscription</p>
                <p className="text-lg font-bold text-slate-800 mt-1 capitalize">
                  {tenant.subscriptionTier}
                </p>
              </div>
              <div className="w-12 h-12 bg-purple-100 rounded-xl flex items-center justify-center">
                <DollarSign className="text-purple-600" size={24} />
              </div>
            </div>
          </GlassCard>

          <Card>
            <div className="p-4">
              <h4 className="font-semibold text-slate-800 mb-2">Quick Actions</h4>
              <div className="space-y-2">
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="w-full justify-start"
                  onClick={() => setLocation(`/tenant/${slug}/dashboard`)}
                  data-testid="button-view-dashboard"
                >
                  View Dashboard
                </Button>
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="w-full justify-start"
                  onClick={() => setLocation(`/tenant/${slug}/staff`)}
                  data-testid="button-manage-staff"
                >
                  Manage Staff
                </Button>
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="w-full justify-start"
                  onClick={() => setLocation(`/tenant/${slug}/visitors`)}
                  data-testid="button-manage-visitors"
                >
                  Manage Visitors
                </Button>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}