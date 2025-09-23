import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Building2, Plus, Users, Eye, Settings, AlertTriangle, CheckCircle, Calendar, Zap, Database } from "lucide-react";
import type { TenantCompany, InsertTenantCompany } from "@/../../shared/schema";

interface TenantStats {
  totalStaff: number;
  totalVisitors: number;
  visitorsThisMonth: number;
  lastActivity?: string;
}

export default function SuperAdmin() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [selectedTenant, setSelectedTenant] = useState<TenantCompany | null>(null);

  // Fetch all tenant companies
  const { data: tenants = [], isLoading } = useQuery<TenantCompany[]>({
    queryKey: ["/api/super-admin/tenants"],
  });

  // Fetch building overview stats
  const { data: buildingStats } = useQuery<{
    totalTenants: number;
    activeTenants: number;
    totalStaff: number;
    visitorsToday: number;
  }>({
    queryKey: ["/api/super-admin/stats"],
  });

  // Add new tenant mutation
  const addTenantMutation = useMutation({
    mutationFn: async (tenant: InsertTenantCompany) => {
      const response = await apiRequest("POST", "/api/super-admin/tenants", tenant);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/super-admin/tenants"] });
      queryClient.invalidateQueries({ queryKey: ["/api/super-admin/stats"] });
      setIsAddDialogOpen(false);
      toast({
        title: "✅ Tenant Added Successfully",
        description: "New tenant company has been created",
      });
    },
    onError: (error) => {
      toast({
        title: "❌ Failed to Add Tenant",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Toggle tenant status mutation
  const toggleTenantMutation = useMutation({
    mutationFn: async ({ tenantId, isActive }: { tenantId: string; isActive: boolean }) => {
      const response = await apiRequest("PATCH", `/api/super-admin/tenants/${tenantId}/status`, { isActive });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/super-admin/tenants"] });
      toast({
        title: "✅ Tenant Status Updated",
        description: "Tenant status has been changed",
      });
    },
  });

  // Generate sample tenants mutation
  const generateSampleTenantsMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/super-admin/generate-sample-tenants");
      return response.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/super-admin/tenants"] });
      queryClient.invalidateQueries({ queryKey: ["/api/super-admin/stats"] });
      toast({
        title: "✅ Sample Tenants Generated",
        description: data.message,
      });
    },
    onError: (error) => {
      toast({
        title: "❌ Failed to Generate Sample Tenants",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Generate sample staff mutation
  const generateSampleStaffMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/super-admin/generate-sample-staff");
      return response.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/super-admin/tenants"] });
      queryClient.invalidateQueries({ queryKey: ["/api/super-admin/stats"] });
      toast({
        title: "✅ Sample Staff Generated",
        description: data.message,
      });
    },
    onError: (error) => {
      toast({
        title: "❌ Failed to Generate Sample Staff",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleAddTenant = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    
    const tenantData: InsertTenantCompany = {
      companyName: formData.get("companyName") as string,
      slug: formData.get("slug") as string,
      contactEmail: formData.get("contactEmail") as string,
      phone: formData.get("phone") as string,
      adminFirstName: formData.get("adminFirstName") as string,
      adminLastName: formData.get("adminLastName") as string,
      adminEmail: formData.get("adminEmail") as string,
      maxUsers: parseInt(formData.get("maxUsers") as string) || 50,
      maxVisitorsPerMonth: parseInt(formData.get("maxVisitorsPerMonth") as string) || 1000,
      customerId: `tenant-${Date.now()}`, // Auto-generate unique customer ID
    };

    addTenantMutation.mutate(tenantData);
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Building2 className="w-8 h-8 text-blue-600" />
            Multi-Tenant Dashboard
          </h1>
          <p className="text-muted-foreground mt-1">
            Manage all tenant companies in the serviced office building
          </p>
        </div>
        
        <div className="flex items-center gap-2">
          {/* Sample Data Generation Buttons */}
          <Button
            variant="outline"
            onClick={() => generateSampleTenantsMutation.mutate()}
            disabled={generateSampleTenantsMutation.isPending}
            className="flex items-center gap-2"
            data-testid="button-generate-sample-tenants"
          >
            <Database className="w-4 h-4" />
            {generateSampleTenantsMutation.isPending ? "Generating..." : "Sample Tenants"}
          </Button>
          
          <Button
            variant="outline"
            onClick={() => generateSampleStaffMutation.mutate()}
            disabled={generateSampleStaffMutation.isPending || tenants.length === 0}
            className="flex items-center gap-2"
            data-testid="button-generate-sample-staff"
          >
            <Users className="w-4 h-4" />
            {generateSampleStaffMutation.isPending ? "Generating..." : "Sample Staff"}
          </Button>
          
          <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
            <DialogTrigger asChild>
              <Button className="flex items-center gap-2" data-testid="button-add-tenant">
                <Plus className="w-4 h-4" />
                Add New Tenant
              </Button>
            </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Add New Tenant Company</DialogTitle>
              <DialogDescription>
                Create a new tenant company with their contact information and settings.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleAddTenant} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="companyName">Company Name *</Label>
                  <Input 
                    id="companyName" 
                    name="companyName" 
                    required 
                    placeholder="e.g., Acme Inc."
                    data-testid="input-company-name"
                  />
                </div>
                <div>
                  <Label htmlFor="slug">URL Slug *</Label>
                  <Input 
                    id="slug" 
                    name="slug" 
                    required 
                    placeholder="e.g., acme"
                    data-testid="input-slug"
                  />
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="contactEmail">Contact Email *</Label>
                  <Input 
                    id="contactEmail" 
                    name="contactEmail" 
                    type="email" 
                    required 
                    placeholder="contact@company.com"
                    data-testid="input-contact-email"
                  />
                </div>
                <div>
                  <Label htmlFor="phone">Phone</Label>
                  <Input 
                    id="phone" 
                    name="phone" 
                    placeholder="+44 20 1234 5678"
                    data-testid="input-phone"
                  />
                </div>
              </div>

              <Separator />
              <h3 className="text-lg font-semibold">Tenant Admin Contact</h3>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="adminFirstName">Admin First Name</Label>
                  <Input 
                    id="adminFirstName" 
                    name="adminFirstName" 
                    placeholder="John"
                    data-testid="input-admin-first-name"
                  />
                </div>
                <div>
                  <Label htmlFor="adminLastName">Admin Last Name</Label>
                  <Input 
                    id="adminLastName" 
                    name="adminLastName" 
                    placeholder="Smith"
                    data-testid="input-admin-last-name"
                  />
                </div>
              </div>
              
              <div>
                <Label htmlFor="adminEmail">Admin Email</Label>
                <Input 
                  id="adminEmail" 
                  name="adminEmail" 
                  type="email" 
                  placeholder="admin@company.com"
                  data-testid="input-admin-email"
                />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="maxUsers">Max Users</Label>
                  <Input 
                    id="maxUsers" 
                    name="maxUsers" 
                    type="number" 
                    defaultValue="50"
                    data-testid="input-max-users"
                  />
                </div>
                <div>
                  <Label htmlFor="maxVisitorsPerMonth">Max Visitors/Month</Label>
                  <Input 
                    id="maxVisitorsPerMonth" 
                    name="maxVisitorsPerMonth" 
                    type="number" 
                    defaultValue="1000"
                    data-testid="input-max-visitors"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-4">
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={() => setIsAddDialogOpen(false)}
                  data-testid="button-cancel"
                >
                  Cancel
                </Button>
                <Button 
                  type="submit" 
                  disabled={addTenantMutation.isPending}
                  data-testid="button-save-tenant"
                >
                  {addTenantMutation.isPending ? "Creating..." : "Create Tenant"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
        </div>
      </div>

      {/* Building Overview Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card data-testid="card-total-tenants">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Tenants</CardTitle>
            <Building2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-total-tenants">
              {buildingStats?.totalTenants || tenants.length}
            </div>
            <p className="text-xs text-muted-foreground">
              {tenants.filter(t => t.isActive).length} active
            </p>
          </CardContent>
        </Card>
        
        <Card data-testid="card-total-staff">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Staff</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-total-staff">
              {buildingStats?.totalStaff || 0}
            </div>
            <p className="text-xs text-muted-foreground">Across all tenants</p>
          </CardContent>
        </Card>
        
        <Card data-testid="card-total-visitors">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Visitors Today</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-total-visitors">
              {buildingStats?.visitorsToday || 0}
            </div>
            <p className="text-xs text-muted-foreground">Building-wide</p>
          </CardContent>
        </Card>
        
        <Card data-testid="card-monthly-revenue">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Tenants</CardTitle>
            <CheckCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-active-tenants">
              {tenants.filter(t => t.isActive).length}
            </div>
            <p className="text-xs text-muted-foreground">Active tenants</p>
          </CardContent>
        </Card>
      </div>

      {/* Tenant Companies List */}
      <Card>
        <CardHeader>
          <CardTitle>Tenant Companies</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-4">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="animate-pulse flex space-x-4 p-4 border rounded-lg">
                  <div className="rounded-full bg-gray-300 h-12 w-12"></div>
                  <div className="flex-1 space-y-2 py-1">
                    <div className="h-4 bg-gray-300 rounded w-3/4"></div>
                    <div className="space-y-2">
                      <div className="h-3 bg-gray-300 rounded"></div>
                      <div className="h-3 bg-gray-300 rounded w-5/6"></div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : tenants.length === 0 ? (
            <div className="text-center py-8" data-testid="empty-tenants">
              <Building2 className="w-12 h-12 text-variable mx-auto mb-4" />
              <h3 className="text-lg font-medium text-fixed mb-2">No tenant companies yet</h3>
              <p className="text-variable mb-4">Add your first tenant company to get started</p>
            </div>
          ) : (
            <div className="space-y-4">
              {tenants.map((tenant) => (
                <div 
                  key={tenant.id} 
                  className="flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50 transition-colors"
                  data-testid={`tenant-${tenant.slug}`}
                >
                  <div className="flex items-center space-x-4">
                    <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                      <Building2 className="w-6 h-6 text-blue-600" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-lg" data-testid={`text-company-name-${tenant.slug}`}>
                          {tenant.companyName}
                        </h3>
                        <Badge 
                          variant={tenant.isActive ? "default" : "secondary"}
                          data-testid={`badge-status-${tenant.slug}`}
                        >
                          {tenant.isActive ? "Active" : "Inactive"}
                        </Badge>
                      </div>
                      <div className="text-sm text-gray-600 space-y-1">
                        <p data-testid={`text-contact-${tenant.slug}`}>
                          📧 {tenant.contactEmail} | 🏢 /{tenant.slug}
                        </p>
                        <p data-testid={`text-info-${tenant.slug}`}>
                          👥 {tenant.maxUsers} user capacity
                        </p>
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center space-x-2">
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => setLocation(`/tenant/${tenant.slug}/dashboard`)}
                      data-testid={`button-view-${tenant.slug}`}
                    >
                      <Eye className="w-4 h-4 mr-1" />
                      View
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => setLocation(`/tenant/${tenant.slug}/settings`)}
                      data-testid={`button-settings-${tenant.slug}`}
                    >
                      <Settings className="w-4 h-4 mr-1" />
                      Settings
                    </Button>
                    <Button
                      variant={tenant.isActive ? "destructive" : "default"}
                      size="sm"
                      onClick={() => toggleTenantMutation.mutate({ 
                        tenantId: tenant.id, 
                        isActive: !tenant.isActive 
                      })}
                      disabled={toggleTenantMutation.isPending}
                      data-testid={`button-toggle-${tenant.slug}`}
                    >
                      {tenant.isActive ? (
                        <>
                          <AlertTriangle className="w-4 h-4 mr-1" />
                          Deactivate
                        </>
                      ) : (
                        <>
                          <CheckCircle className="w-4 h-4 mr-1" />
                          Activate
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}