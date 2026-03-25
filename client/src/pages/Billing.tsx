import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import GlassCard from "@/components/GlassCard";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  CreditCard, 
  Calendar, 
  Receipt, 
  AlertCircle, 
  CheckCircle, 
  ArrowUpRight,
  Settings,
  Download,
  Clock,
  TrendingUp,
  Users,
  HardDrive
} from "lucide-react";

interface SubscriptionPlan {
  id: string;
  name: string;
  displayName: string;
  description: string;
  monthlyPrice: string;
  yearlyPrice: string;
  currency: string;
  features: string[];
  isPopular: boolean;
  trialDays: number;
  limits: {
    maxVisitorsPerMonth: number;
    maxStaff: number;
    maxMeetingRooms: number;
    maxStorageGb: number;
  };
}

interface Subscription {
  id: string;
  status: string;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  billingCycle: string;
  cancelAtPeriodEnd: boolean;
  trialStart?: string;
  trialEnd?: string;
}

interface Invoice {
  id: string;
  invoiceNumber: string;
  amount: string;
  currency: string;
  status: string;
  dueDate: string;
  paidAt?: string;
  createdAt: string;
}

interface Usage {
  period: string;
  visitorsCount: number;
  staffCount: number;
  meetingRoomsCount: number;
  tenantsCount: number;
  storageUsedMb: number;
  apiRequestsCount: number;
  emailsSent: number;
  smsSent: number;
  isOverLimit: boolean;
  overageCharges: string;
}

export default function Billing() {
  const [activeTab, setActiveTab] = useState("subscription");
  const { toast } = useToast();

  // Fetch subscription plans
  const { data: plansData, isLoading: plansLoading } = useQuery({
    queryKey: ['/api/billing/plans'],
  });

  // Fetch subscription status
  const { data: subscriptionData, isLoading: subscriptionLoading } = useQuery({
    queryKey: ['/api/billing/subscription'],
  });

  // Fetch invoices
  const { data: invoicesData, isLoading: invoicesLoading } = useQuery({
    queryKey: ['/api/billing/invoices'],
  });

  // Fetch usage data
  const { data: usageData, isLoading: usageLoading } = useQuery({
    queryKey: ['/api/billing/usage'],
  });

  // Create billing portal session
  const billingPortalMutation = useMutation({
    mutationFn: () => apiRequest('/api/billing/portal', {
      method: 'POST',
      body: JSON.stringify({
        returnUrl: window.location.href
      })
    }),
    onSuccess: (data) => {
      window.open(data.portalUrl, '_blank');
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to open billing portal. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Create checkout session
  const checkoutMutation = useMutation({
    mutationFn: (data: { priceId: string; billingCycle: 'monthly' | 'yearly' }) => 
      apiRequest('/api/billing/checkout', {
        method: 'POST',
        body: JSON.stringify({
          ...data,
          successUrl: `${window.location.origin}/billing?success=true`,
          cancelUrl: `${window.location.origin}/billing?canceled=true`
        })
      }),
    onSuccess: (data) => {
      if (data.checkoutUrl) {
        window.location.href = data.checkoutUrl;
      }
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to start checkout. Please try again.",
        variant: "destructive",
      });
    },
  });

  const subscription = subscriptionData?.subscription;
  const plan = subscriptionData?.plan;
  const customer = subscriptionData?.customer;
  const isTrialActive = subscriptionData?.isTrialActive;
  const trialDaysRemaining = subscriptionData?.trialDaysRemaining;
  const plans = plansData?.plans || [];
  const invoices = invoicesData?.invoices || [];
  const usage = usageData?.usage;
  const limits = usageData?.limits;

  const handleOpenBillingPortal = () => {
    billingPortalMutation.mutate();
  };

  const handleSubscribe = (planId: string, priceId: string, billingCycle: 'monthly' | 'yearly') => {
    checkoutMutation.mutate({ priceId, billingCycle });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
      case 'trialing':
        return 'bg-green-500';
      case 'past_due':
        return 'bg-yellow-500';
      case 'canceled':
      case 'unpaid':
        return 'bg-red-500';
      default:
        return 'bg-gray-500';
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-GB');
  };

  const formatCurrency = (amount: string, currency: string = 'GBP') => {
    const symbol = currency === 'GBP' ? '£' : currency === 'USD' ? '$' : '€';
    return `${symbol}${parseFloat(amount).toFixed(2)}`;
  };

  if (subscriptionLoading || plansLoading) {
    return (
      <div className="container mx-auto p-3 sm:p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-1/3"></div>
          <div className="h-4 bg-gray-200 rounded w-2/3"></div>
          <div className="h-32 bg-gray-200 rounded"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-3 sm:p-6 max-w-7xl">
      <div className="mb-4 sm:mb-8">
        <h1 className="text-xl sm:text-3xl font-bold mb-2">Billing & Subscription</h1>
        <p className="text-muted-foreground">
          Manage your TPR-Max subscription, view usage, and access billing information.
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid w-full grid-cols-2 sm:grid-cols-4 gap-2">
          <TabsTrigger value="subscription" className="text-xs sm:text-sm">Subscription</TabsTrigger>
          <TabsTrigger value="usage" className="text-xs sm:text-sm">Usage</TabsTrigger>
          <TabsTrigger value="invoices" className="text-xs sm:text-sm">Invoices</TabsTrigger>
          <TabsTrigger value="plans" className="text-xs sm:text-sm">Plans</TabsTrigger>
        </TabsList>

        {/* Subscription Tab */}
        <TabsContent value="subscription">
          <div className="grid gap-6">
            
            {/* Current Subscription */}
            <GlassCard className="p-6" data-testid="current-subscription">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold">Current Subscription</h2>
                {subscription && (
                  <Button 
                    onClick={handleOpenBillingPortal}
                    disabled={billingPortalMutation.isPending}
                    data-testid="button-billing-portal"
                  >
                    <Settings className="mr-2 h-4 w-4" />
                    {billingPortalMutation.isPending ? 'Loading...' : 'Manage Subscription'}
                  </Button>
                )}
              </div>

              {subscription && plan ? (
                <div className="space-y-4">
                  <div className="flex items-center gap-4">
                    <div>
                      <h3 className="text-lg font-medium">{plan.displayName}</h3>
                      <p className="text-muted-foreground">{plan.description}</p>
                    </div>
                    <Badge 
                      className={`${getStatusColor(subscription.status)} text-white`}
                      data-testid={`status-${subscription.status}`}
                    >
                      {subscription.status.toUpperCase()}
                    </Badge>
                  </div>

                  {isTrialActive && (
                    <div className="bg-blue-50 border border-blue-200 p-4 rounded-lg">
                      <div className="flex items-center gap-2">
                        <Clock className="h-4 w-4 text-blue-600" />
                        <span className="font-medium text-blue-800">
                          Trial Active - {trialDaysRemaining} days remaining
                        </span>
                      </div>
                      <p className="text-sm text-blue-600 mt-1">
                        Your trial ends on {formatDate(subscription.trialEnd!)}
                      </p>
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <div className="text-sm text-muted-foreground">Billing Cycle</div>
                      <div className="capitalize">{subscription.billingCycle}</div>
                    </div>
                    <div>
                      <div className="text-sm text-muted-foreground">Amount</div>
                      <div className="font-medium">
                        {formatCurrency(
                          subscription.billingCycle === 'yearly' ? plan.yearlyPrice : plan.monthlyPrice,
                          plan.currency
                        )}
                        /{subscription.billingCycle === 'yearly' ? 'year' : 'month'}
                      </div>
                    </div>
                    <div>
                      <div className="text-sm text-muted-foreground">Current Period</div>
                      <div>{formatDate(subscription.currentPeriodStart)} - {formatDate(subscription.currentPeriodEnd)}</div>
                    </div>
                    <div>
                      <div className="text-sm text-muted-foreground">Status</div>
                      <div className="capitalize">{subscription.status}</div>
                    </div>
                  </div>

                  {subscription.cancelAtPeriodEnd && (
                    <div className="bg-red-50 border border-red-200 p-4 rounded-lg">
                      <div className="flex items-center gap-2">
                        <AlertCircle className="h-4 w-4 text-red-600" />
                        <span className="font-medium text-red-800">
                          Subscription will cancel on {formatDate(subscription.currentPeriodEnd)}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center py-8">
                  <CreditCard className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
                  <h3 className="text-lg font-medium mb-2">No Active Subscription</h3>
                  <p className="text-muted-foreground mb-4">
                    Choose a subscription plan to get started with TPR-Max.
                  </p>
                  <Button onClick={() => setActiveTab('plans')} data-testid="button-view-plans">
                    View Plans
                  </Button>
                </div>
              )}
            </GlassCard>
          </div>
        </TabsContent>

        {/* Usage Tab */}
        <TabsContent value="usage">
          <GlassCard className="p-6" data-testid="usage-overview">
            <h2 className="text-xl font-semibold mb-6">Usage Overview</h2>
            
            {usage && limits ? (
              <div className="space-y-6">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="bg-background/50 p-4 rounded-lg">
                    <div className="flex items-center gap-2 mb-2">
                      <Users className="h-4 w-4 text-blue-600" />
                      <span className="text-sm font-medium">Visitors</span>
                    </div>
                    <div className="text-2xl font-bold">{usage.visitorsCount.toLocaleString()}</div>
                    <div className="text-xs text-muted-foreground">
                      of {limits.maxVisitorsPerMonth.toLocaleString()} limit
                    </div>
                  </div>
                  
                  <div className="bg-background/50 p-4 rounded-lg">
                    <div className="flex items-center gap-2 mb-2">
                      <Users className="h-4 w-4 text-green-600" />
                      <span className="text-sm font-medium">Staff</span>
                    </div>
                    <div className="text-2xl font-bold">{usage.staffCount}</div>
                    <div className="text-xs text-muted-foreground">
                      of {limits.maxStaff} limit
                    </div>
                  </div>
                  
                  <div className="bg-background/50 p-4 rounded-lg">
                    <div className="flex items-center gap-2 mb-2">
                      <HardDrive className="h-4 w-4 text-orange-600" />
                      <span className="text-sm font-medium">Storage</span>
                    </div>
                    <div className="text-2xl font-bold">{Math.round(usage.storageUsedMb / 1024)}GB</div>
                    <div className="text-xs text-muted-foreground">
                      of {limits.maxStorageGb}GB limit
                    </div>
                  </div>
                </div>

                {usage.isOverLimit && (
                  <div className="bg-red-50 border border-red-200 p-4 rounded-lg">
                    <div className="flex items-center gap-2">
                      <AlertCircle className="h-4 w-4 text-red-600" />
                      <span className="font-medium text-red-800">
                        Usage Limit Exceeded
                      </span>
                    </div>
                    <p className="text-red-600 mt-1">
                      Additional charges: {formatCurrency(usage.overageCharges)}
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-8">
                <TrendingUp className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
                <p className="text-muted-foreground">Usage data is not available yet.</p>
              </div>
            )}
          </GlassCard>
        </TabsContent>

        {/* Invoices Tab */}
        <TabsContent value="invoices">
          <GlassCard className="p-6" data-testid="invoices-list">
            <h2 className="text-xl font-semibold mb-6">Invoice History</h2>
            
            {invoices.length > 0 ? (
              <div className="space-y-4">
                {invoices.map((invoice: Invoice) => (
                  <div key={invoice.id} className="flex items-center justify-between p-4 border rounded-lg">
                    <div className="flex items-center gap-4">
                      <div className="p-2 bg-background rounded-lg">
                        <Receipt className="h-4 w-4" />
                      </div>
                      <div>
                        <div className="font-medium">{invoice.invoiceNumber}</div>
                        <div className="text-sm text-muted-foreground">
                          {formatDate(invoice.createdAt)}
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <div className="font-medium">
                          {formatCurrency(invoice.amount, invoice.currency)}
                        </div>
                        <Badge 
                          variant={invoice.status === 'paid' ? 'default' : 'destructive'}
                          className="text-xs"
                        >
                          {invoice.status.toUpperCase()}
                        </Badge>
                      </div>
                      <Button variant="outline" size="sm" data-testid={`button-download-${invoice.id}`}>
                        <Download className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8">
                <Receipt className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
                <p className="text-muted-foreground">No invoices available yet.</p>
              </div>
            )}
          </GlassCard>
        </TabsContent>

        {/* Plans Tab */}
        <TabsContent value="plans">
          <div className="grid gap-6">
            <div>
              <h2 className="text-xl font-semibold mb-2">Available Plans</h2>
              <p className="text-muted-foreground">
                Choose the plan that best fits your organization's needs.
              </p>
            </div>
            
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {plans.map((planOption: SubscriptionPlan) => (
                <GlassCard 
                  key={planOption.id} 
                  className={`p-6 ${planOption.isPopular ? 'ring-2 ring-blue-500' : ''}`}
                  data-testid={`plan-card-${planOption.name}`}
                >
                  {planOption.isPopular && (
                    <Badge className="mb-4 bg-blue-500">Most Popular</Badge>
                  )}
                  
                  <h3 className="text-lg font-semibold mb-2">{planOption.displayName}</h3>
                  <p className="text-muted-foreground mb-4">{planOption.description}</p>
                  
                  <div className="mb-6">
                    <div className="flex items-baseline gap-2">
                      <span className="text-3xl font-bold">
                        {formatCurrency(planOption.monthlyPrice, planOption.currency)}
                      </span>
                      <span className="text-muted-foreground">/month</span>
                    </div>
                    {planOption.yearlyPrice && (
                      <div className="text-sm text-muted-foreground">
                        or {formatCurrency(planOption.yearlyPrice, planOption.currency)}/year
                        {parseFloat(planOption.yearlyPrice) < parseFloat(planOption.monthlyPrice) * 12 && 
                          ` (Save ${formatCurrency((parseFloat(planOption.monthlyPrice) * 12 - parseFloat(planOption.yearlyPrice)).toString())})`
                        }
                      </div>
                    )}
                  </div>
                  
                  <div className="space-y-2 mb-6">
                    <div className="text-sm font-medium">Features:</div>
                    {planOption.features.slice(0, 4).map((feature, index) => (
                      <div key={index} className="flex items-center gap-2 text-sm">
                        <CheckCircle className="h-3 w-3 text-green-500" />
                        <span className="capitalize">{feature.replace(/_/g, ' ')}</span>
                      </div>
                    ))}
                    {planOption.features.length > 4 && (
                      <div className="text-xs text-muted-foreground">
                        +{planOption.features.length - 4} more features
                      </div>
                    )}
                  </div>
                  
                  <div className="space-y-2">
                    {!subscription || subscription.status === 'canceled' ? (
                      <>
                        <Button 
                          className="w-full"
                          onClick={() => handleSubscribe(planOption.id, planOption.stripePriceIdMonthly!, 'monthly')}
                          disabled={checkoutMutation.isPending}
                          data-testid={`button-subscribe-monthly-${planOption.name}`}
                        >
                          Start Monthly Plan
                        </Button>
                        {planOption.yearlyPrice && (
                          <Button 
                            variant="outline" 
                            className="w-full"
                            onClick={() => handleSubscribe(planOption.id, planOption.stripePriceIdYearly!, 'yearly')}
                            disabled={checkoutMutation.isPending}
                            data-testid={`button-subscribe-yearly-${planOption.name}`}
                          >
                            Start Yearly Plan
                          </Button>
                        )}
                        {planOption.trialDays > 0 && (
                          <div className="text-xs text-center text-muted-foreground">
                            Includes {planOption.trialDays}-day free trial
                          </div>
                        )}
                      </>
                    ) : (
                      <Button disabled className="w-full">
                        Current Plan
                      </Button>
                    )}
                  </div>
                </GlassCard>
              ))}
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}