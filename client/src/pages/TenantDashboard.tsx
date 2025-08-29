import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import { useState } from "react";
import GlassCard from "@/components/GlassCard";
import { UsersRound, UserPlus, Calendar, Eye, Settings, Building2, ArrowLeft, Clock, CheckCircle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import type { Staff, Visitor } from "@shared/schema";

interface TenantCompany {
  id: string;
  companyName: string;
  contactEmail: string;
  slug: string;
  industry: string;
  employeeCount: number;
  isActive: boolean;
  subscriptionTier: string;
}

const visitorSchema = z.object({
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  email: z.string().email("Valid email is required"),
  company: z.string().min(1, "Company is required"),
  visitPurpose: z.string().min(1, "Visit purpose is required"),
  hostStaffId: z.string().min(1, "Host staff member is required"),
  expectedDate: z.string().min(1, "Expected date is required"),
  expectedTime: z.string().min(1, "Expected time is required"),
});

type VisitorFormData = z.infer<typeof visitorSchema>;

export default function TenantDashboard() {
  const { slug } = useParams<{ slug: string }>();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isPreBookingOpen, setIsPreBookingOpen] = useState(false);
  
  const form = useForm<VisitorFormData>({
    resolver: zodResolver(visitorSchema),
    defaultValues: {
      firstName: "",
      lastName: "",
      email: "",
      company: "",
      visitPurpose: "",
      hostStaffId: "",
      expectedDate: "",
      expectedTime: "",
    },
  });

  // Get tenant details
  const { data: tenant, isLoading: tenantLoading } = useQuery<TenantCompany>({
    queryKey: [`/api/super-admin/tenants/${slug}`],
    enabled: !!slug,
  });

  // Get tenant staff
  const { data: tenantStaff, isLoading: staffLoading } = useQuery<Staff[]>({
    queryKey: [`/api/tenants/${slug}/staff`],
    enabled: !!slug,
  });

  // Get tenant visitors
  const { data: tenantVisitors, isLoading: visitorsLoading } = useQuery<Visitor[]>({
    queryKey: [`/api/tenants/${slug}/visitors`],
    enabled: !!slug,
  });

  // Get pre-booked visitors
  const { data: preBookedVisitors } = useQuery<Visitor[]>({
    queryKey: [`/api/tenants/${slug}/visitors/pre-booked`],
    enabled: !!slug,
  });

  // Pre-book visitor mutation
  const preBookMutation = useMutation({
    mutationFn: async (data: VisitorFormData) => {
      return apiRequest(`/api/tenants/${slug}/visitors/pre-book`, {
        method: "POST",
        body: JSON.stringify({
          ...data,
          tenantId: tenant?.id,
          expectedDateTime: `${data.expectedDate}T${data.expectedTime}`,
        }),
      });
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Visitor pre-booked successfully",
      });
      setIsPreBookingOpen(false);
      form.reset();
      queryClient.invalidateQueries({ queryKey: [`/api/tenants/${slug}/visitors/pre-booked`] });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to pre-book visitor",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: VisitorFormData) => {
    preBookMutation.mutate(data);
  };

  if (tenantLoading) {
    return <div className="flex items-center justify-center min-h-screen">Loading tenant dashboard...</div>;
  }

  if (!tenant) {
    return <div className="flex items-center justify-center min-h-screen">Tenant not found</div>;
  }

  const checkedInStaff = tenantStaff?.filter(staff => staff.isCheckedIn) || [];
  const currentVisitors = tenantVisitors?.filter(visitor => visitor.isCheckedIn) || [];

  return (
    <div className="space-y-8 p-6 rounded-xl bg-background min-h-screen">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setLocation('/multi-tenant')}
            className="flex items-center gap-2"
            data-testid="button-back-to-multi-tenant"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Multi-Tenant
          </Button>
          <div>
            <h1 className="text-3xl font-bold text-slate-800 dark:text-slate-200 flex items-center gap-3">
              <Building2 className="text-blue-600" size={32} />
              {tenant.companyName}
            </h1>
            <p className="text-slate-600 dark:text-slate-400 mt-1">
              {tenant.industry} • {tenant.employeeCount} employees • /{tenant.slug}
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

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <GlassCard>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-slate-600 text-sm font-medium">Staff on Site</p>
              <p className="text-3xl font-bold text-slate-800 mt-1" data-testid="stat-staff-on-site">
                {checkedInStaff.length}
              </p>
            </div>
            <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center">
              <UsersRound className="text-blue-600" size={24} />
            </div>
          </div>
        </GlassCard>
        
        <GlassCard>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-slate-600 text-sm font-medium">Current Visitors</p>
              <p className="text-3xl font-bold text-slate-800 mt-1" data-testid="stat-current-visitors">
                {currentVisitors.length}
              </p>
            </div>
            <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center">
              <Eye className="text-green-600" size={24} />
            </div>
          </div>
        </GlassCard>
        
        <GlassCard>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-slate-600 text-sm font-medium">Total Staff</p>
              <p className="text-3xl font-bold text-slate-800 mt-1" data-testid="stat-total-staff">
                {tenantStaff?.length || 0}
              </p>
            </div>
            <div className="w-12 h-12 bg-purple-100 rounded-xl flex items-center justify-center">
              <UsersRound className="text-purple-600" size={24} />
            </div>
          </div>
        </GlassCard>
        
        <GlassCard>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-slate-600 text-sm font-medium">Pre-booked</p>
              <p className="text-3xl font-bold text-slate-800 mt-1" data-testid="stat-pre-booked">
                {preBookedVisitors?.length || 0}
              </p>
            </div>
            <div className="w-12 h-12 bg-orange-100 rounded-xl flex items-center justify-center">
              <Calendar className="text-orange-600" size={24} />
            </div>
          </div>
        </GlassCard>
      </div>

      {/* Actions */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <GlassCard>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-slate-800">Visitor Management</h3>
            <Dialog open={isPreBookingOpen} onOpenChange={setIsPreBookingOpen}>
              <DialogTrigger asChild>
                <Button className="flex items-center gap-2" data-testid="button-pre-book-visitor">
                  <UserPlus className="w-4 h-4" />
                  Pre-book Visitor
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl">
                <DialogHeader>
                  <DialogTitle>Pre-book Visitor for {tenant.companyName}</DialogTitle>
                </DialogHeader>
                <Form {...form}>
                  <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="firstName"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>First Name</FormLabel>
                            <FormControl>
                              <Input {...field} data-testid="input-visitor-first-name" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="lastName"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Last Name</FormLabel>
                            <FormControl>
                              <Input {...field} data-testid="input-visitor-last-name" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                    
                    <FormField
                      control={form.control}
                      name="email"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Email</FormLabel>
                          <FormControl>
                            <Input type="email" {...field} data-testid="input-visitor-email" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={form.control}
                      name="company"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Company</FormLabel>
                          <FormControl>
                            <Input {...field} data-testid="input-visitor-company" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={form.control}
                      name="hostStaffId"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Host Staff Member</FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl>
                              <SelectTrigger data-testid="select-host-staff">
                                <SelectValue placeholder="Select host staff member" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {tenantStaff?.map((staff) => (
                                <SelectItem key={staff.id} value={staff.id}>
                                  {staff.firstName} {staff.lastName} - {staff.department}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="expectedDate"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Expected Date</FormLabel>
                            <FormControl>
                              <Input type="date" {...field} data-testid="input-expected-date" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="expectedTime"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Expected Time</FormLabel>
                            <FormControl>
                              <Input type="time" {...field} data-testid="input-expected-time" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                    
                    <FormField
                      control={form.control}
                      name="visitPurpose"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Visit Purpose</FormLabel>
                          <FormControl>
                            <Textarea {...field} data-testid="textarea-visit-purpose" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <div className="flex justify-end gap-2">
                      <Button type="button" variant="outline" onClick={() => setIsPreBookingOpen(false)}>
                        Cancel
                      </Button>
                      <Button type="submit" disabled={preBookMutation.isPending} data-testid="button-submit-pre-booking">
                        {preBookMutation.isPending ? "Booking..." : "Pre-book Visitor"}
                      </Button>
                    </div>
                  </form>
                </Form>
              </DialogContent>
            </Dialog>
          </div>
          <div className="space-y-2">
            <p className="text-sm text-slate-600">Manage visitor access and pre-bookings</p>
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => setLocation(`/tenant/${slug}/visitors`)}
              data-testid="button-view-all-visitors"
            >
              View All Visitors
            </Button>
          </div>
        </GlassCard>
        
        <GlassCard>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-slate-800">Staff Management</h3>
          </div>
          <div className="space-y-2">
            <p className="text-sm text-slate-600">View and manage company staff</p>
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => setLocation(`/tenant/${slug}/staff`)}
              data-testid="button-view-all-staff"
            >
              View All Staff
            </Button>
          </div>
        </GlassCard>
      </div>

      {/* Staff List */}
      <Card>
        <div className="p-6">
          <h3 className="text-lg font-semibold text-slate-800 mb-4">Staff Status</h3>
          {staffLoading ? (
            <div>Loading staff...</div>
          ) : (
            <div className="space-y-2">
              {tenantStaff?.slice(0, 5).map((staff) => (
                <div key={staff.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                  <div>
                    <p className="font-medium">{staff.firstName} {staff.lastName}</p>
                    <p className="text-sm text-slate-600">{staff.department} • {staff.employeeId}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {staff.isCheckedIn ? (
                      <Badge variant="default" className="flex items-center gap-1">
                        <CheckCircle className="w-3 h-3" />
                        Checked In
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        Checked Out
                      </Badge>
                    )}
                  </div>
                </div>
              ))}
              {tenantStaff && tenantStaff.length > 5 && (
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="w-full mt-2"
                  onClick={() => setLocation(`/tenant/${slug}/staff`)}
                >
                  View All {tenantStaff.length} Staff Members
                </Button>
              )}
            </div>
          )}
        </div>
      </Card>

      {/* Pre-booked Visitors */}
      {preBookedVisitors && preBookedVisitors.length > 0 && (
        <Card>
          <div className="p-6">
            <h3 className="text-lg font-semibold text-slate-800 mb-4">Pre-booked Visitors</h3>
            <div className="space-y-2">
              {preBookedVisitors.map((visitor) => (
                <div key={visitor.id} className="flex items-center justify-between p-3 bg-blue-50 rounded-lg">
                  <div>
                    <p className="font-medium">{visitor.firstName} {visitor.lastName}</p>
                    <p className="text-sm text-slate-600">{visitor.company} • {visitor.visitPurpose}</p>
                  </div>
                  <Badge variant="outline">Pre-booked</Badge>
                </div>
              ))}
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}