import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Shield, LogOut, Plus, Building2, Users, Calendar, CheckCircle2, XCircle, Settings, Edit, Palette } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import PlatformAdminCustomerForm from "./PlatformAdminCustomerForm";

interface PlatformAdmin {
  id: string;
  username: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
}

interface Customer {
  id: string;
  companyName: string;
  slug: string;
  contactEmail: string;
  isActive: boolean;
  onboardingCompleted: boolean;
  maxTenants: number;
  maxUsersPerTenant: number;
  maxVisitorsPerMonth: number;
  stripeCustomerId: string | null;
  createdAt: string;
  updatedAt: string;
}

interface BrandingSettings {
  id: string;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  logoUrl?: string | null;
  faviconUrl?: string | null;
  platformName: string;
  companyName: string;
  updatedAt: string;
}

export default function PlatformAdminDashboard() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showCustomerForm, setShowCustomerForm] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);

  // Check authentication
  const { data: admin, isLoading: adminLoading, error } = useQuery<PlatformAdmin>({
    queryKey: ["/platform-admin/auth/me"],
    queryFn: async () => {
      const response = await fetch("/platform-admin/auth/me", {
        credentials: "include",
      });
      if (!response.ok) {
        throw new Error("Not authenticated");
      }
      return response.json();
    },
    retry: false,
  });

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!adminLoading && error) {
      window.location.href = "/platform-admin/login";
    }
  }, [adminLoading, error]);

  // Fetch customers
  const { data: customersData, isLoading: customersLoading } = useQuery<{ success: boolean; customers: Customer[] }>({
    queryKey: ["/platform-admin/customers"],
    queryFn: async () => {
      const response = await fetch("/platform-admin/customers", {
        credentials: "include",
      });
      if (!response.ok) {
        throw new Error("Failed to fetch customers");
      }
      return response.json();
    },
    enabled: !!admin,
  });

  const customers = customersData?.customers || [];

  // Logout mutation
  const logoutMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/platform-admin/auth/logout", {});
      return response.json();
    },
    onSuccess: () => {
      queryClient.clear();
      window.location.href = "/platform-admin/login";
    },
  });

  // Toggle customer status mutation
  const toggleStatusMutation = useMutation({
    mutationFn: async ({ customerId, isActive }: { customerId: string; isActive: boolean }) => {
      const response = await apiRequest("PATCH", `/platform-admin/customers/${customerId}/status`, {
        isActive,
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/platform-admin/customers"] });
      toast({
        title: "Success",
        description: "Customer status updated",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update customer status",
        variant: "destructive",
      });
    },
  });

  // Fetch branding settings
  const { data: brandingData } = useQuery<{ success: boolean; branding: BrandingSettings }>({
    queryKey: ["/platform-admin/branding"],
    queryFn: async () => {
      const response = await fetch("/platform-admin/branding", {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to fetch branding");
      return response.json();
    },
    enabled: !!admin,
  });

  const [brandingForm, setBrandingForm] = useState({
    primaryColor: '',
    secondaryColor: '',
    accentColor: '',
    logoUrl: '',
    platformName: '',
    companyName: '',
  });
  
  const [logoFile, setLogoFile] = useState<File | null>(null);

  useEffect(() => {
    if (brandingData?.branding) {
      setBrandingForm({
        primaryColor: brandingData.branding.primaryColor,
        secondaryColor: brandingData.branding.secondaryColor,
        accentColor: brandingData.branding.accentColor,
        logoUrl: brandingData.branding.logoUrl || '',
        platformName: brandingData.branding.platformName,
        companyName: brandingData.branding.companyName,
      });
    }
  }, [brandingData]);

  // Update branding settings mutation
  const updateBrandingMutation = useMutation({
    mutationFn: async () => {
      let logoUrl = brandingForm.logoUrl;
      
      // Upload logo file if one was selected
      if (logoFile) {
        // Get CSRF token first
        const csrfResponse = await fetch('/api/csrf-token', {
          credentials: 'include',
        });
        const { csrfToken } = await csrfResponse.json();
        
        const formData = new FormData();
        formData.append('logo', logoFile);
        
        const uploadResponse = await fetch('/platform-admin/branding/upload-logo', {
          method: 'POST',
          credentials: 'include',
          headers: {
            'X-CSRF-Token': csrfToken,
          },
          body: formData,
        });
        
        if (!uploadResponse.ok) {
          const errorData = await uploadResponse.json().catch(() => ({}));
          throw new Error(errorData.error || 'Failed to upload logo');
        }
        
        const uploadData = await uploadResponse.json();
        logoUrl = uploadData.logoUrl;
      }
      
      const response = await apiRequest("PUT", "/platform-admin/branding", {
        ...brandingForm,
        logoUrl,
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/platform-admin/branding"] });
      setShowSettings(false);
      setLogoFile(null);
      toast({
        title: "Success",
        description: "Branding settings updated",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update branding settings",
        variant: "destructive",
      });
    },
  });

  // Edit customer mutation
  const [editForm, setEditForm] = useState({
    companyName: '',
    contactEmail: '',
    maxTenants: 10,
    maxUsersPerTenant: 50,
    maxVisitorsPerMonth: 1000,
  });

  const [credentialReset, setCredentialReset] = useState({
    username: '',
    password: '',
  });

  useEffect(() => {
    if (editingCustomer) {
      setEditForm({
        companyName: editingCustomer.companyName,
        contactEmail: editingCustomer.contactEmail,
        maxTenants: editingCustomer.maxTenants,
        maxUsersPerTenant: editingCustomer.maxUsersPerTenant,
        maxVisitorsPerMonth: editingCustomer.maxVisitorsPerMonth,
      });
      setCredentialReset({ username: '', password: '' });
    }
  }, [editingCustomer]);

  const editCustomerMutation = useMutation({
    mutationFn: async () => {
      if (!editingCustomer) throw new Error("No customer selected");
      
      // Update customer details
      const response = await apiRequest("PATCH", `/platform-admin/customers/${editingCustomer.id}`, editForm);
      
      // Reset credentials if provided
      if (credentialReset.username || credentialReset.password) {
        await apiRequest("PATCH", `/platform-admin/customers/${editingCustomer.id}/credentials`, credentialReset);
      }
      
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/platform-admin/customers"] });
      setEditingCustomer(null);
      setCredentialReset({ username: '', password: '' });
      toast({
        title: "Success",
        description: "Customer updated successfully",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update customer",
        variant: "destructive",
      });
    },
  });

  if (adminLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  if (!admin) {
    return null;
  }

  const primaryColor = brandingData?.branding?.primaryColor || '#2460A9';
  const accentColor = brandingData?.branding?.accentColor || '#3B82F6';

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <header 
        className="shadow"
        style={{
          background: `linear-gradient(to right, ${primaryColor}, ${accentColor})`,
          color: 'white'
        }}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              {brandingData?.branding?.logoUrl ? (
                <img 
                  src={brandingData.branding.logoUrl.startsWith('http') || brandingData.branding.logoUrl.startsWith('/') 
                    ? brandingData.branding.logoUrl 
                    : `/public-objects/${brandingData.branding.logoUrl}`
                  } 
                  alt={brandingData.branding.platformName} 
                  className="h-10 object-contain"
                  data-testid="img-dashboard-logo"
                />
              ) : (
                <div className="p-2 bg-white/20 rounded-lg">
                  <Shield className="w-6 h-6 text-white" />
                </div>
              )}
              <div>
                <h1 className="text-2xl font-bold text-white">
                  {brandingData?.branding?.platformName || "Platform Admin"}
                </h1>
                <p className="text-sm text-white/80">
                  Welcome, {admin.firstName} {admin.lastName}
                </p>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <Button
                className="bg-white/20 hover:bg-white/30 text-white border-white/30"
                onClick={() => setShowSettings(true)}
                data-testid="button-settings"
              >
                <Settings className="w-4 h-4 mr-2" />
                Settings
              </Button>
              <Button
                className="bg-white/20 hover:bg-white/30 text-white border-white/30"
                onClick={() => logoutMutation.mutate()}
                data-testid="button-logout"
              >
                <LogOut className="w-4 h-4 mr-2" />
                Sign Out
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Total Customers</CardDescription>
              <CardTitle className="text-3xl">{customers.length}</CardTitle>
            </CardHeader>
            <CardContent>
              <Building2 className="w-4 h-4 text-gray-400" />
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Active</CardDescription>
              <CardTitle className="text-3xl text-green-600">
                {customers.filter(c => c.isActive).length}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <CheckCircle2 className="w-4 h-4 text-green-400" />
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Inactive</CardDescription>
              <CardTitle className="text-3xl text-red-600">
                {customers.filter(c => !c.isActive).length}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <XCircle className="w-4 h-4 text-red-400" />
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>With Stripe</CardDescription>
              <CardTitle className="text-3xl">
                {customers.filter(c => c.stripeCustomerId).length}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Users className="w-4 h-4 text-gray-400" />
            </CardContent>
          </Card>
        </div>

        {/* Customer List */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Customer Accounts</CardTitle>
                <CardDescription>Manage all customer accounts from here</CardDescription>
              </div>
              <Button onClick={() => setShowCustomerForm(true)} data-testid="button-add-customer">
                <Plus className="w-4 h-4 mr-2" />
                Add Customer
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {customersLoading ? (
              <div className="text-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-2"></div>
                <p className="text-sm text-gray-600">Loading customers...</p>
              </div>
            ) : customers.length === 0 ? (
              <div className="text-center py-8">
                <Building2 className="w-12 h-12 text-gray-300 mx-auto mb-2" />
                <p className="text-gray-600">No customers yet</p>
                <p className="text-sm text-gray-400">Add your first customer to get started</p>
              </div>
            ) : (
              <div className="space-y-4">
                {customers.map((customer) => (
                  <div
                    key={customer.id}
                    className="flex items-center justify-between p-4 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                    data-testid={`customer-${customer.id}`}
                  >
                    <div className="flex-1">
                      <div className="flex items-center space-x-2 mb-1">
                        <h3 className="font-semibold text-gray-900 dark:text-white">
                          {customer.companyName}
                        </h3>
                        {customer.isActive ? (
                          <Badge variant="default" className="bg-green-100 text-green-800">
                            Active
                          </Badge>
                        ) : (
                          <Badge variant="destructive">Inactive</Badge>
                        )}
                        {customer.stripeCustomerId && (
                          <Badge variant="outline">Stripe</Badge>
                        )}
                      </div>
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        {customer.contactEmail} • {customer.slug}
                      </p>
                      <div className="flex items-center space-x-4 mt-2 text-xs text-gray-500">
                        <span>Max {customer.maxTenants} tenants</span>
                        <span>•</span>
                        <span>{customer.maxUsersPerTenant} users/tenant</span>
                        <span>•</span>
                        <span>{customer.maxVisitorsPerMonth} visitors/month</span>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setEditingCustomer(customer)}
                        data-testid={`button-edit-${customer.id}`}
                      >
                        <Edit className="w-3 h-3 mr-1" />
                        Edit
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          toggleStatusMutation.mutate({
                            customerId: customer.id,
                            isActive: !customer.isActive,
                          })
                        }
                        data-testid={`button-toggle-status-${customer.id}`}
                      >
                        {customer.isActive ? "Deactivate" : "Activate"}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </main>

      {/* Customer Form Dialog */}
      <Dialog open={showCustomerForm} onOpenChange={setShowCustomerForm}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add New Customer</DialogTitle>
            <DialogDescription>
              Create a new customer account without payment processing
            </DialogDescription>
          </DialogHeader>
          <PlatformAdminCustomerForm
            onSuccess={() => {
              setShowCustomerForm(false);
              queryClient.invalidateQueries({ queryKey: ["/platform-admin/customers"] });
            }}
          />
        </DialogContent>
      </Dialog>

      {/* Settings Dialog */}
      <Dialog open={showSettings} onOpenChange={setShowSettings}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center space-x-2">
              <Palette className="w-5 h-5" />
              <span>Platform Branding Settings</span>
            </DialogTitle>
            <DialogDescription>
              Customize colors and branding for white-label deployment
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-6 py-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="primaryColor">Primary Color</Label>
                <div className="flex items-center space-x-2">
                  <Input
                    id="primaryColor"
                    type="color"
                    value={brandingForm.primaryColor}
                    onChange={(e) => setBrandingForm({ ...brandingForm, primaryColor: e.target.value })}
                    className="w-20 h-10"
                    data-testid="input-primary-color"
                  />
                  <Input
                    type="text"
                    value={brandingForm.primaryColor}
                    onChange={(e) => setBrandingForm({ ...brandingForm, primaryColor: e.target.value })}
                    placeholder="#2460A9"
                    className="flex-1"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="secondaryColor">Secondary Color</Label>
                <div className="flex items-center space-x-2">
                  <Input
                    id="secondaryColor"
                    type="color"
                    value={brandingForm.secondaryColor}
                    onChange={(e) => setBrandingForm({ ...brandingForm, secondaryColor: e.target.value })}
                    className="w-20 h-10"
                    data-testid="input-secondary-color"
                  />
                  <Input
                    type="text"
                    value={brandingForm.secondaryColor}
                    onChange={(e) => setBrandingForm({ ...brandingForm, secondaryColor: e.target.value })}
                    placeholder="#1E3A8A"
                    className="flex-1"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="accentColor">Accent Color</Label>
                <div className="flex items-center space-x-2">
                  <Input
                    id="accentColor"
                    type="color"
                    value={brandingForm.accentColor}
                    onChange={(e) => setBrandingForm({ ...brandingForm, accentColor: e.target.value })}
                    className="w-20 h-10"
                    data-testid="input-accent-color"
                  />
                  <Input
                    type="text"
                    value={brandingForm.accentColor}
                    onChange={(e) => setBrandingForm({ ...brandingForm, accentColor: e.target.value })}
                    placeholder="#3B82F6"
                    className="flex-1"
                  />
                </div>
              </div>

              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="logoFile">Logo Upload</Label>
                <Input
                  id="logoFile"
                  type="file"
                  accept="image/*"
                  onChange={(e) => setLogoFile(e.target.files?.[0] || null)}
                  data-testid="input-logo-file"
                />
                {(logoFile || brandingForm.logoUrl) && (
                  <div className="mt-2">
                    <p className="text-sm text-gray-600">
                      {logoFile ? `Selected: ${logoFile.name}` : `Current: ${brandingForm.logoUrl}`}
                    </p>
                    {brandingForm.logoUrl && !logoFile && (
                      <img src={brandingForm.logoUrl} alt="Logo preview" className="mt-2 h-16 object-contain" />
                    )}
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="platformName">Platform Name</Label>
                <Input
                  id="platformName"
                  type="text"
                  value={brandingForm.platformName}
                  onChange={(e) => setBrandingForm({ ...brandingForm, platformName: e.target.value })}
                  placeholder="TPR Max"
                  data-testid="input-platform-name"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="companyName">Company Name</Label>
                <Input
                  id="companyName"
                  type="text"
                  value={brandingForm.companyName}
                  onChange={(e) => setBrandingForm({ ...brandingForm, companyName: e.target.value })}
                  placeholder="Your Company"
                  data-testid="input-company-name"
                />
              </div>
            </div>

            <div className="flex justify-end space-x-2 pt-4">
              <Button variant="outline" onClick={() => setShowSettings(false)}>
                Cancel
              </Button>
              <Button 
                onClick={() => updateBrandingMutation.mutate()}
                disabled={updateBrandingMutation.isPending}
                data-testid="button-save-branding"
              >
                {updateBrandingMutation.isPending ? "Saving..." : "Save Settings"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Customer Dialog */}
      <Dialog open={!!editingCustomer} onOpenChange={(open) => !open && setEditingCustomer(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit Customer</DialogTitle>
            <DialogDescription>
              Update customer account details and limits
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-companyName">Company Name</Label>
              <Input
                id="edit-companyName"
                value={editForm.companyName}
                onChange={(e) => setEditForm({ ...editForm, companyName: e.target.value })}
                data-testid="input-edit-company-name"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-contactEmail">Contact Email</Label>
              <Input
                id="edit-contactEmail"
                type="email"
                value={editForm.contactEmail}
                onChange={(e) => setEditForm({ ...editForm, contactEmail: e.target.value })}
                data-testid="input-edit-contact-email"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit-maxTenants">Max Tenants</Label>
                <Input
                  id="edit-maxTenants"
                  type="number"
                  value={editForm.maxTenants}
                  onChange={(e) => setEditForm({ ...editForm, maxTenants: parseInt(e.target.value) })}
                  data-testid="input-edit-max-tenants"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="edit-maxUsersPerTenant">Max Users/Tenant</Label>
                <Input
                  id="edit-maxUsersPerTenant"
                  type="number"
                  value={editForm.maxUsersPerTenant}
                  onChange={(e) => setEditForm({ ...editForm, maxUsersPerTenant: parseInt(e.target.value) })}
                  data-testid="input-edit-max-users-per-tenant"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="edit-maxVisitorsPerMonth">Max Visitors/Month</Label>
                <Input
                  id="edit-maxVisitorsPerMonth"
                  type="number"
                  value={editForm.maxVisitorsPerMonth}
                  onChange={(e) => setEditForm({ ...editForm, maxVisitorsPerMonth: parseInt(e.target.value) })}
                  data-testid="input-edit-max-visitors-per-month"
                />
              </div>
            </div>

            <div className="border-t pt-4 mt-4">
              <h3 className="text-sm font-semibold mb-3">Reset Customer Admin Credentials (Optional)</h3>
              <p className="text-xs text-gray-500 mb-4">Leave blank to keep existing credentials</p>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="reset-username">New Username</Label>
                  <Input
                    id="reset-username"
                    value={credentialReset.username}
                    onChange={(e) => setCredentialReset({ ...credentialReset, username: e.target.value })}
                    placeholder="Leave blank to keep current"
                    data-testid="input-reset-username"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="reset-password">New Password</Label>
                  <Input
                    id="reset-password"
                    type="password"
                    value={credentialReset.password}
                    onChange={(e) => setCredentialReset({ ...credentialReset, password: e.target.value })}
                    placeholder="Leave blank to keep current"
                    data-testid="input-reset-password"
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end space-x-2 pt-4">
              <Button variant="outline" onClick={() => setEditingCustomer(null)}>
                Cancel
              </Button>
              <Button 
                onClick={() => editCustomerMutation.mutate()}
                disabled={editCustomerMutation.isPending}
                data-testid="button-save-customer"
              >
                {editCustomerMutation.isPending ? "Saving..." : "Save Changes"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
