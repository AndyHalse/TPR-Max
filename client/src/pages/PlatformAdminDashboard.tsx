import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Shield, LogOut, Plus, Building2, Users, Calendar, CheckCircle2, XCircle } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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

export default function PlatformAdminDashboard() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showCustomerForm, setShowCustomerForm] = useState(false);

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
      const data = await response.json();
      return data.admin;
    },
    retry: false,
  });

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!adminLoading && error) {
      setLocation("/platform-admin/login");
    }
  }, [adminLoading, error, setLocation]);

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
      setLocation("/platform-admin/login");
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

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <header className="bg-white dark:bg-gray-800 shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="p-2 bg-blue-100 dark:bg-blue-900 rounded-lg">
                <Shield className="w-6 h-6 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Platform Admin</h1>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Welcome, {admin.firstName} {admin.lastName}
                </p>
              </div>
            </div>
            <Button
              variant="outline"
              onClick={() => logoutMutation.mutate()}
              data-testid="button-logout"
            >
              <LogOut className="w-4 h-4 mr-2" />
              Sign Out
            </Button>
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
    </div>
  );
}
