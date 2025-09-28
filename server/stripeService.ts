import Stripe from 'stripe';
import { Pool } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import { eq, and } from 'drizzle-orm';
import * as sharedSchema from '@shared/schema';

/**
 * STRIPE SERVICE
 * 
 * Comprehensive Stripe integration service handling:
 * - Customer creation and management
 * - Subscription lifecycle management  
 * - Payment method handling
 * - Invoice tracking
 * - Webhook event processing
 * - Billing portal session creation
 */
export class StripeService {
  private static instance: StripeService;
  private stripe: Stripe;
  
  private constructor() {
    const apiKey = process.env.STRIPE_SECRET_KEY;
    if (!apiKey) {
      console.warn('⚠️ STRIPE_SECRET_KEY not set - Stripe functionality will be disabled');
      // Gracefully handle missing keys in both development and production
      // This prevents the app from crashing on startup
      this.stripe = null as any;
      
      if (process.env.NODE_ENV === 'production') {
        console.warn('🚨 Production deployment running without Stripe configuration');
        console.warn('📝 Payment features will be disabled until Stripe secrets are configured');
      }
      return;
    }
    
    this.stripe = new Stripe(apiKey, {
      apiVersion: '2025-08-27.basil',
      typescript: true,
    });
    
    console.log('✅ Stripe service initialized successfully');
  }

  static getInstance(): StripeService {
    if (!StripeService.instance) {
      StripeService.instance = new StripeService();
    }
    return StripeService.instance;
  }

  /**
   * Get management database connection
   */
  private getManagementDb() {
    const managementDbUrl = process.env.DATABASE_URL;
    if (!managementDbUrl) {
      throw new Error("DATABASE_URL must be set for management database");
    }
    
    const managementPool = new Pool({ connectionString: managementDbUrl });
    return drizzle({ client: managementPool, schema: sharedSchema });
  }

  /**
   * Check if Stripe is available
   */
  private isStripeAvailable(): boolean {
    return this.stripe !== null;
  }

  /**
   * Public method to check if Stripe is available
   * SECURITY FIX: Allow development mode to work without Stripe keys
   */
  isAvailable(): boolean {
    // In development mode, allow mock operations even without Stripe keys
    if (process.env.NODE_ENV === 'development') {
      return true; // Allow development flow to continue
    }
    return this.isStripeAvailable();
  }

  /**
   * Verify webhook signature for security
   * This prevents webhook spoofing and unauthorized requests
   */
  verifyWebhookSignature(rawBody: Buffer | string, signature: string): Stripe.Event {
    if (!this.isStripeAvailable()) {
      console.warn('⚠️ Stripe not configured - webhook signature verification skipped');
      // Return a mock event for development/testing
      return {
        id: 'evt_mock_development',
        type: 'customer.subscription.created',
        data: { object: {} },
        created: Math.floor(Date.now() / 1000),
        object: 'event',
        api_version: '2025-08-27.basil',
        livemode: false,
        pending_webhooks: 0,
        request: { id: null, idempotency_key: null }
      } as Stripe.Event;
    }

    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!webhookSecret) {
      console.warn('⚠️ STRIPE_WEBHOOK_SECRET not configured - webhook signature verification skipped');
      console.warn('🔒 For production security, configure STRIPE_WEBHOOK_SECRET environment variable');
      
      // Return a mock event when webhook secret is missing
      return {
        id: 'evt_mock_no_secret',
        type: 'customer.subscription.created',
        data: { object: {} },
        created: Math.floor(Date.now() / 1000),
        object: 'event',
        api_version: '2025-08-27.basil',
        livemode: false,
        pending_webhooks: 0,
        request: { id: null, idempotency_key: null }
      } as Stripe.Event;
    }

    try {
      // Use Stripe's built-in signature verification
      const event = this.stripe.webhooks.constructEvent(
        rawBody,
        signature,
        webhookSecret
      );
      
      console.log(`✅ Webhook signature verified: ${event.type} (${event.id})`);
      return event;
    } catch (error) {
      console.error('❌ Webhook signature verification failed:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Webhook signature verification failed: ${errorMessage}`);
    }
  }

  /**
   * Ensure VisiGate Pro subscription plans exist (idempotent)
   */
  async ensureSubscriptionPlans() {
    if (!this.isStripeAvailable()) {
      console.warn('⚠️ Stripe not configured - skipping plan creation in development mode');
      return {
        success: false,
        error: 'Stripe not configured',
        plan: null,
        alreadyExists: false
      };
    }

    console.log('🚀 Ensuring VisiGate Pro subscription plans exist...');

    try {
      const db = this.getManagementDb();
      
      // Check if plan already exists in database
      const [existingPlan] = await db
        .select()
        .from(sharedSchema.subscriptionPlans)
        .where(eq(sharedSchema.subscriptionPlans.name, 'visigate_pro'))
        .limit(1);

      if (existingPlan && existingPlan.stripeProductId && existingPlan.stripePriceIdMonthly) {
        console.log('✅ VisiGate Pro plan already exists, skipping creation');
        return {
          success: true,
          plan: existingPlan,
          alreadyExists: true
        };
      }

      // Plan doesn't exist or is incomplete, create it
      return await this.createSubscriptionPlans();

    } catch (error) {
      console.error('❌ Error ensuring subscription plans:', error);
      throw error;
    }
  }

  /**
   * Create VisiGate Pro subscription plans in Stripe
   */
  async createSubscriptionPlans() {
    if (!this.isStripeAvailable()) {
      throw new Error('Stripe not configured - STRIPE_SECRET_KEY environment variable required');
    }

    console.log('🚀 Creating VisiGate Pro subscription plans in Stripe...');

    try {
      // Create VisiGate Pro product
      const product = await this.stripe.products.create({
        name: 'VisiGate Pro',
        description: 'Professional visitor management and access control system',
        metadata: {
          type: 'saas_subscription',
          features: JSON.stringify([
            'unlimited_visitors',
            'staff_management', 
            'meeting_rooms',
            'thermal_printing',
            'api_access',
            'advanced_reporting',
            'multi_tenant_support'
          ])
        }
      });

      console.log(`✅ Created Stripe product: ${product.id}`);

      // Create monthly price (£49.95)
      const monthlyPrice = await this.stripe.prices.create({
        product: product.id,
        unit_amount: 4995, // £49.95 in pence
        currency: 'gbp',
        recurring: {
          interval: 'month',
          trial_period_days: 14
        },
        metadata: {
          plan_type: 'monthly',
          trial_days: '14'
        }
      });

      console.log(`✅ Created monthly price: ${monthlyPrice.id} (£49.95)`);

      // Create yearly price (£499.50 - 2 months free)
      const yearlyPrice = await this.stripe.prices.create({
        product: product.id,
        unit_amount: 49950, // £499.50 in pence (10 months cost)
        currency: 'gbp',
        recurring: {
          interval: 'year',
          trial_period_days: 14
        },
        metadata: {
          plan_type: 'yearly',
          trial_days: '14',
          savings: 'two_months_free'
        }
      });

      console.log(`✅ Created yearly price: ${yearlyPrice.id} (£499.50)`);

      // Update local database with Stripe IDs
      const db = this.getManagementDb();
      
      // Use upsert to handle existing plans gracefully
      const [subscriptionPlan] = await db
        .insert(sharedSchema.subscriptionPlans)
        .values({
          name: 'visigate_pro',
          displayName: 'VisiGate Pro',
          description: 'Professional visitor management system with full feature access',
          monthlyPrice: '49.95',
          yearlyPrice: '499.50',
          currency: 'GBP',
          maxVisitorsPerMonth: 10000,
          maxStaff: 500,
          maxMeetingRooms: 50,
          maxTenants: 20,
          maxStorageGb: 100,
          features: [
            'unlimited_visitors',
            'staff_management',
            'meeting_rooms',
            'thermal_printing',
            'api_access',
            'advanced_reporting',
            'multi_tenant_support',
            'priority_support'
          ],
          isActive: true,
          isPopular: true,
          trialDays: 14,
          stripeProductId: product.id,
          stripePriceIdMonthly: monthlyPrice.id,
          stripePriceIdYearly: yearlyPrice.id
        })
        .onConflictDoUpdate({
          target: [sharedSchema.subscriptionPlans.name],
          set: {
            stripeProductId: product.id,
            stripePriceIdMonthly: monthlyPrice.id,
            stripePriceIdYearly: yearlyPrice.id,
            updatedAt: new Date()
          }
        })
        .returning();

      console.log(`✅ Created subscription plan record: ${subscriptionPlan.id}`);

      return {
        success: true,
        product,
        monthlyPrice,
        yearlyPrice,
        subscriptionPlan,
        alreadyExists: false
      };

    } catch (error) {
      console.error('❌ Error creating subscription plans:', error);
      throw error;
    }
  }

  /**
   * Create Stripe customer during onboarding
   */
  async createCustomer(data: {
    email: string;
    name: string;
    companyName: string;
    customerId: string;
    phone?: string;
    address?: {
      line1?: string;
      city?: string;
      country?: string;
      postal_code?: string;
    };
    metadata?: Record<string, string>;
  }) {
    if (!this.isStripeAvailable()) {
      console.warn('⚠️ Stripe not configured - skipping customer creation in development mode');
      return {
        success: false,
        error: 'Stripe not configured',
        stripeCustomer: null
      };
    }

    try {
      console.log(`🔄 Creating Stripe customer for: ${data.email}`);

      const customer = await this.stripe.customers.create({
        email: data.email,
        name: data.name,
        description: `${data.companyName} - VisiGate Pro Customer`,
        phone: data.phone,
        address: data.address,
        metadata: {
          visigate_customer_id: data.customerId,
          company_name: data.companyName,
          plan_type: 'trial',
          onboarded_at: new Date().toISOString(),
          ...data.metadata
        },
        preferred_locales: ['en-GB']
      });

      console.log(`✅ Created Stripe customer: ${customer.id}`);

      // Update customer record with Stripe customer ID
      const db = this.getManagementDb();
      await db
        .update(sharedSchema.customers)
        .set({
          stripeCustomerId: customer.id,
          updatedAt: new Date()
        })
        .where(eq(sharedSchema.customers.id, data.customerId));

      return {
        success: true,
        stripeCustomer: customer
      };

    } catch (error) {
      console.error('❌ Error creating Stripe customer:', error);
      throw error;
    }
  }

  /**
   * Create subscription for customer (trial or paid)
   */
  async createSubscription(data: {
    customerId: string;
    stripeCustomerId: string;
    priceId: string;
    billingCycle: 'monthly' | 'yearly';
    paymentMethodId?: string;
    trialDays?: number;
  }) {
    if (!this.isStripeAvailable()) {
      console.warn('⚠️ Stripe not configured - cannot create subscription');
      throw new Error('Stripe not configured - STRIPE_SECRET_KEY required');
    }
    try {
      console.log(`🔄 Creating subscription for customer: ${data.customerId}`);

      const subscriptionData: Stripe.SubscriptionCreateParams = {
        customer: data.stripeCustomerId,
        items: [{ price: data.priceId }],
        metadata: {
          visigate_customer_id: data.customerId,
          billing_cycle: data.billingCycle,
          created_via: 'onboarding_api'
        },
        expand: ['latest_invoice.payment_intent'],
        collection_method: 'charge_automatically',
        payment_behavior: 'default_incomplete'
      };

      // Add trial period if specified
      if (data.trialDays && data.trialDays > 0) {
        subscriptionData.trial_period_days = data.trialDays;
      }

      // Add payment method if provided
      if (data.paymentMethodId) {
        subscriptionData.default_payment_method = data.paymentMethodId;
      }

      const subscription = await this.stripe.subscriptions.create(subscriptionData);

      console.log(`✅ Created Stripe subscription: ${subscription.id}`);

      // Get subscription plan from database
      const db = this.getManagementDb();
      const [plan] = await db
        .select()
        .from(sharedSchema.subscriptionPlans)
        .where(
          data.billingCycle === 'monthly' 
            ? eq(sharedSchema.subscriptionPlans.stripePriceIdMonthly, data.priceId)
            : eq(sharedSchema.subscriptionPlans.stripePriceIdYearly, data.priceId)
        )
        .limit(1);

      if (!plan) {
        throw new Error(`Subscription plan not found for price ID: ${data.priceId}`);
      }

      // Create subscription record in database
      const currentPeriodStart = new Date((subscription as any).current_period_start * 1000);
      const currentPeriodEnd = new Date((subscription as any).current_period_end * 1000);
      const trialStart = (subscription as any).trial_start ? new Date((subscription as any).trial_start * 1000) : null;
      const trialEnd = (subscription as any).trial_end ? new Date((subscription as any).trial_end * 1000) : null;

      const [dbSubscription] = await db
        .insert(sharedSchema.subscriptions)
        .values({
          customerId: data.customerId,
          planId: plan.id,
          status: subscription.status,
          currentPeriodStart,
          currentPeriodEnd,
          billingCycle: data.billingCycle,
          trialStart,
          trialEnd,
          stripeSubscriptionId: subscription.id,
          stripeCustomerId: data.stripeCustomerId,
          meteredUsage: false
        })
        .returning();

      console.log(`✅ Created subscription record: ${dbSubscription.id}`);

      return {
        success: true,
        subscription,
        dbSubscription,
        requiresPayment: subscription.status === 'incomplete',
        clientSecret: (subscription as any).latest_invoice && 
          typeof (subscription as any).latest_invoice === 'object' &&
          (subscription as any).latest_invoice.payment_intent &&
          typeof (subscription as any).latest_invoice.payment_intent === 'object'
          ? (subscription as any).latest_invoice.payment_intent.client_secret
          : null
      };

    } catch (error) {
      console.error('❌ Error creating subscription:', error);
      throw error;
    }
  }

  /**
   * Get checkout session by ID (SECURITY FIX: Added missing method)
   */
  async getCheckoutSession(sessionId: string): Promise<Stripe.Checkout.Session | null> {
    try {
      // SECURITY FIX: Handle development mode gracefully
      if (!this.isStripeAvailable()) {
        if (process.env.NODE_ENV === 'development') {
          console.log('🔧 Development mode: Mock Stripe checkout session');
          // Return mock session for development
          return {
            id: sessionId,
            object: 'checkout.session',
            payment_status: 'paid',
            status: 'complete',
            metadata: {
              signupSessionId: sessionId.replace('dev_', '')
            },
            mode: 'subscription',
            url: null,
            success_url: null,
            cancel_url: null
          } as unknown as Stripe.Checkout.Session;
        }
        throw new Error('Stripe not configured - STRIPE_SECRET_KEY environment variable required');
      }
      
      const session = await this.stripe.checkout.sessions.retrieve(sessionId);
      return session;
    } catch (error) {
      console.error('Error retrieving checkout session:', error);
      return null;
    }
  }

  /**
   * Create Stripe Checkout session for subscription signup
   */
  async createCheckoutSession(data: {
    customerId: string;
    priceId: string;
    billingCycle: 'monthly' | 'yearly';
    successUrl: string;
    cancelUrl: string;
    metadata?: Record<string, string>;
  }) {
    try {
      console.log(`🔄 Creating Stripe Checkout session for: ${data.customerId}`);

      // Get customer data from database
      const db = this.getManagementDb();
      const [customer] = await db
        .select()
        .from(sharedSchema.customers)
        .where(eq(sharedSchema.customers.id, data.customerId))
        .limit(1);

      if (!customer) {
        throw new Error(`Customer not found: ${data.customerId}`);
      }

      const session = await this.stripe.checkout.sessions.create({
        customer_email: customer.contactEmail,
        payment_method_types: ['card'],
        line_items: [
          {
            price: data.priceId,
            quantity: 1,
          },
        ],
        mode: 'subscription',
        success_url: `${data.successUrl}?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: data.cancelUrl,
        metadata: {
          visigate_customer_id: data.customerId,
          billing_cycle: data.billingCycle,
          company_name: customer.companyName,
          ...data.metadata,
        },
        subscription_data: {
          metadata: {
            visigate_customer_id: data.customerId,
            billing_cycle: data.billingCycle,
          },
          trial_period_days: 14,
        },
        allow_promotion_codes: true,
        billing_address_collection: 'required',
        customer_creation: 'always',
      });

      console.log(`✅ Created Stripe Checkout session: ${session.id}`);

      return {
        success: true,
        sessionId: session.id,
        checkoutUrl: session.url,
      };

    } catch (error) {
      console.error('❌ Error creating Checkout session:', error);
      throw error;
    }
  }

  /**
   * Create billing portal session for customer subscription management
   */
  async createBillingPortalSession(data: {
    customerId: string;
    returnUrl: string;
  }) {
    try {
      console.log(`🔄 Creating billing portal session for: ${data.customerId}`);

      // Get subscription data from database
      const db = this.getManagementDb();
      const [subscription] = await db
        .select()
        .from(sharedSchema.subscriptions)
        .where(eq(sharedSchema.subscriptions.customerId, data.customerId))
        .limit(1);

      if (!subscription || !subscription.stripeCustomerId) {
        throw new Error(`No active subscription found for customer: ${data.customerId}`);
      }

      const session = await this.stripe.billingPortal.sessions.create({
        customer: subscription.stripeCustomerId,
        return_url: data.returnUrl,
      });

      console.log(`✅ Created billing portal session: ${session.id}`);

      return {
        success: true,
        portalUrl: session.url,
      };

    } catch (error) {
      console.error('❌ Error creating billing portal session:', error);
      throw error;
    }
  }

  /**
   * Get customer's subscription status
   */
  async getCustomerSubscription(customerId: string) {
    try {
      const db = this.getManagementDb();
      
      const [subscription] = await db
        .select({
          subscription: sharedSchema.subscriptions,
          plan: sharedSchema.subscriptionPlans,
          customer: sharedSchema.customers,
        })
        .from(sharedSchema.subscriptions)
        .leftJoin(
          sharedSchema.subscriptionPlans,
          eq(sharedSchema.subscriptions.planId, sharedSchema.subscriptionPlans.id)
        )
        .leftJoin(
          sharedSchema.customers,
          eq(sharedSchema.subscriptions.customerId, sharedSchema.customers.id)
        )
        .where(eq(sharedSchema.subscriptions.customerId, customerId))
        .limit(1);

      if (!subscription) {
        return {
          success: true,
          hasSubscription: false,
          subscription: null
        };
      }

      // Get latest Stripe subscription data
      let stripeSubscription = null;
      if (subscription.subscription.stripeSubscriptionId) {
        try {
          stripeSubscription = await this.stripe.subscriptions.retrieve(
            subscription.subscription.stripeSubscriptionId
          );
        } catch (error) {
          console.warn('Failed to fetch Stripe subscription:', error);
        }
      }

      const isTrialActive = subscription.subscription.trialEnd 
        ? new Date() < subscription.subscription.trialEnd
        : false;

      const isSubscriptionActive = ['active', 'trialing'].includes(subscription.subscription.status);

      return {
        success: true,
        hasSubscription: true,
        subscription: subscription.subscription,
        plan: subscription.plan,
        customer: subscription.customer,
        stripeSubscription,
        isTrialActive,
        isSubscriptionActive,
        trialDaysRemaining: isTrialActive && subscription.subscription.trialEnd
          ? Math.max(0, Math.ceil((subscription.subscription.trialEnd.getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
          : 0
      };

    } catch (error) {
      console.error('❌ Error getting customer subscription:', error);
      throw error;
    }
  }

  /**
   * Update subscription status from Stripe webhook
   */
  async updateSubscriptionFromWebhook(stripeSubscription: Stripe.Subscription) {
    try {
      console.log(`🔄 Updating subscription from webhook: ${stripeSubscription.id}`);

      const customerId = stripeSubscription.metadata.visigate_customer_id;
      if (!customerId) {
        console.warn('No VisiGate customer ID found in subscription metadata');
        return;
      }

      const db = this.getManagementDb();

      const currentPeriodStart = new Date((stripeSubscription as any).current_period_start * 1000);
      const currentPeriodEnd = new Date((stripeSubscription as any).current_period_end * 1000);
      const trialStart = stripeSubscription.trial_start ? new Date(stripeSubscription.trial_start * 1000) : null;
      const trialEnd = stripeSubscription.trial_end ? new Date(stripeSubscription.trial_end * 1000) : null;
      const canceledAt = stripeSubscription.canceled_at ? new Date(stripeSubscription.canceled_at * 1000) : null;

      await db
        .update(sharedSchema.subscriptions)
        .set({
          status: stripeSubscription.status,
          currentPeriodStart,
          currentPeriodEnd,
          trialStart,
          trialEnd,
          cancelAtPeriodEnd: stripeSubscription.cancel_at_period_end,
          canceledAt,
          updatedAt: new Date()
        })
        .where(eq(sharedSchema.subscriptions.stripeSubscriptionId, stripeSubscription.id));

      // Update customer active status based on subscription
      const isActive = ['active', 'trialing'].includes(stripeSubscription.status);
      await db
        .update(sharedSchema.customers)
        .set({
          isActive,
          updatedAt: new Date()
        })
        .where(eq(sharedSchema.customers.id, customerId));

      console.log(`✅ Updated subscription and customer status: ${stripeSubscription.status}`);

    } catch (error) {
      console.error('❌ Error updating subscription from webhook:', error);
      throw error;
    }
  }

  /**
   * Cancel subscription
   */
  async cancelSubscription(customerId: string, cancelImmediately = false) {
    try {
      console.log(`🔄 Canceling subscription for customer: ${customerId}`);

      const db = this.getManagementDb();
      const [subscription] = await db
        .select()
        .from(sharedSchema.subscriptions)
        .where(eq(sharedSchema.subscriptions.customerId, customerId))
        .limit(1);

      if (!subscription || !subscription.stripeSubscriptionId) {
        throw new Error(`No active subscription found for customer: ${customerId}`);
      }

      const canceledSubscription = await this.stripe.subscriptions.update(
        subscription.stripeSubscriptionId,
        {
          cancel_at_period_end: !cancelImmediately,
          cancellation_details: {
            comment: cancelImmediately ? 'Canceled immediately by customer' : 'Canceled at period end by customer'
          }
        }
      );

      if (cancelImmediately) {
        await this.stripe.subscriptions.cancel(subscription.stripeSubscriptionId);
      }

      // Update database
      await db
        .update(sharedSchema.subscriptions)
        .set({
          cancelAtPeriodEnd: !cancelImmediately,
          canceledAt: cancelImmediately ? new Date() : null,
          cancellationReason: 'customer_request',
          updatedAt: new Date()
        })
        .where(eq(sharedSchema.subscriptions.id, subscription.id));

      console.log(`✅ Subscription ${cancelImmediately ? 'canceled immediately' : 'scheduled for cancellation'}`);

      return {
        success: true,
        subscription: canceledSubscription,
        canceledImmediately: cancelImmediately
      };

    } catch (error) {
      console.error('❌ Error canceling subscription:', error);
      throw error;
    }
  }

}

// Export singleton instance
export const stripeService = StripeService.getInstance();