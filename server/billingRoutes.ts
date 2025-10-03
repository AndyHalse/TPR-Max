import type { Express } from "express";
import { stripeService } from "./stripeService";
import { stripeWebhookHandler } from "./stripeWebhookHandler";
import { requireAuth } from "./auth";
import { Pool } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import { eq } from 'drizzle-orm';
import * as sharedSchema from '@shared/schema';
import { z } from "zod";

/**
 * BILLING API ROUTES
 * 
 * Provides comprehensive billing management endpoints:
 * - Subscription plan information
 * - Stripe Checkout session creation
 * - Customer billing portal access
 * - Subscription status and management
 * - Invoice and payment history
 * - Trial management
 */

// Validation schemas
const createCheckoutSessionSchema = z.object({
  priceId: z.string().min(1),
  billingCycle: z.enum(['monthly', 'yearly']),
  successUrl: z.string().url(),
  cancelUrl: z.string().url()
});

const createBillingPortalSessionSchema = z.object({
  returnUrl: z.string().url()
});

/**
 * Register billing-related routes
 */
export function registerBillingRoutes(app: Express) {
  console.log('🚀 Registering billing routes...');

  // Register Stripe webhook endpoint with proper security
  stripeWebhookHandler.registerWebhookEndpoint(app);

  /**
   * Get available subscription plans
   * GET /api/billing/plans
   * SECURITY: Requires authentication and tenant isolation
   */
  app.get('/api/billing/plans', requireAuth, async (req, res) => {
    try {
      // SECURITY: Verify customer ID from authenticated session
      const customerId = req.user?.customerId;
      if (!customerId) {
        return res.status(403).json({
          success: false,
          error: 'Access denied - customer context required'
        });
      }

      const managementDbUrl = process.env.DATABASE_URL;
      if (!managementDbUrl) {
        return res.status(500).json({ error: 'Database configuration error' });
      }

      const managementPool = new Pool({ connectionString: managementDbUrl });
      const db = drizzle({ client: managementPool, schema: sharedSchema });

      // Get the single Professional Plan only
      const [plan] = await db
        .select()
        .from(sharedSchema.subscriptionPlans)
        .where(eq(sharedSchema.subscriptionPlans.name, 'professional'))
        .limit(1);

      await managementPool.end();

      if (!plan) {
        return res.status(404).json({
          success: false,
          error: 'Professional Plan not configured'
        });
      }

      // Return single plan in array format for compatibility
      res.json({
        success: true,
        plan: {
          id: plan.id,
          name: plan.name,
          displayName: plan.displayName,
          description: plan.description,
          monthlyPrice: plan.monthlyPrice,
          currency: plan.currency,
          features: plan.features,
          trialDays: plan.trialDays,
          limits: {
            maxVisitorsPerMonth: plan.maxVisitorsPerMonth,
            maxStaff: plan.maxStaff,
            maxMeetingRooms: plan.maxMeetingRooms,
            maxTenants: plan.maxTenants,
            maxStorageGb: plan.maxStorageGb
          }
        }
      });

    } catch (error) {
      console.error('❌ Error fetching subscription plans:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch subscription plans'
      });
    }
  });

  /**
   * Get customer's subscription status
   * GET /api/billing/subscription
   * SECURITY: Requires authentication and tenant isolation
   */
  app.get('/api/billing/subscription', requireAuth, async (req, res) => {
    try {
      // SECURITY: Enforce strict customer context from authenticated session
      const customerId = req.user?.customerId;
      if (!customerId) {
        return res.status(403).json({
          success: false,
          error: 'Access denied - customer context required'
        });
      }

      const subscriptionData = await stripeService.getCustomerSubscription(customerId);

      res.json({
        success: true,
        ...subscriptionData
      });

    } catch (error) {
      console.error('❌ Error fetching subscription:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch subscription information'
      });
    }
  });

  /**
   * Create Stripe Checkout session
   * POST /api/billing/checkout
   * SECURITY: Requires authentication and tenant isolation
   */
  app.post('/api/billing/checkout', requireAuth, async (req, res) => {
    try {
      // SECURITY: Enforce strict customer context from authenticated session
      const customerId = req.user?.customerId;
      if (!customerId) {
        return res.status(403).json({
          success: false,
          error: 'Access denied - customer context required'
        });
      }

      // Validate request body
      const validatedData = createCheckoutSessionSchema.parse(req.body);

      const result = await stripeService.createCheckoutSession({
        customerId,
        ...validatedData
      });

      res.json(result);

    } catch (error) {
      console.error('❌ Error creating checkout session:', error);
      
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          success: false,
          error: 'Invalid request data',
          details: error.errors
        });
      }

      res.status(500).json({
        success: false,
        error: 'Failed to create checkout session'
      });
    }
  });

  /**
   * Create billing portal session
   * POST /api/billing/portal
   * SECURITY: Requires authentication and tenant isolation
   */
  app.post('/api/billing/portal', requireAuth, async (req, res) => {
    try {
      // SECURITY: Enforce strict customer context from authenticated session
      const customerId = req.user?.customerId;
      if (!customerId) {
        return res.status(403).json({
          success: false,
          error: 'Access denied - customer context required'
        });
      }

      // Validate request body
      const validatedData = createBillingPortalSessionSchema.parse(req.body);

      const result = await stripeService.createBillingPortalSession({
        customerId,
        returnUrl: validatedData.returnUrl
      });

      res.json(result);

    } catch (error) {
      console.error('❌ Error creating billing portal session:', error);
      
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          success: false,
          error: 'Invalid request data',
          details: error.errors
        });
      }

      res.status(500).json({
        success: false,
        error: 'Failed to create billing portal session'
      });
    }
  });

  /**
   * Cancel customer subscription
   * POST /api/billing/cancel
   * SECURITY: Requires authentication and tenant isolation
   */
  app.post('/api/billing/cancel', requireAuth, async (req, res) => {
    try {
      // SECURITY: Enforce strict customer context from authenticated session
      const customerId = req.user?.customerId;
      if (!customerId) {
        return res.status(403).json({
          success: false,
          error: 'Access denied - customer context required'
        });
      }

      const { cancelImmediately = false } = req.body;

      const result = await stripeService.cancelSubscription(customerId, cancelImmediately);

      res.json(result);

    } catch (error) {
      console.error('❌ Error canceling subscription:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to cancel subscription'
      });
    }
  });

  /**
   * Get customer's invoice history
   * GET /api/billing/invoices
   * SECURITY: Requires authentication and tenant isolation
   */
  app.get('/api/billing/invoices', requireAuth, async (req, res) => {
    try {
      // SECURITY: Enforce strict customer context from authenticated session
      const customerId = req.user?.customerId;
      if (!customerId) {
        return res.status(403).json({
          success: false,
          error: 'Access denied - customer context required'
        });
      }

      const managementDbUrl = process.env.DATABASE_URL;
      if (!managementDbUrl) {
        return res.status(500).json({ error: 'Database configuration error' });
      }

      const managementPool = new Pool({ connectionString: managementDbUrl });
      const db = drizzle({ client: managementPool, schema: sharedSchema });

      const invoices = await db
        .select({
          id: sharedSchema.invoices.id,
          invoiceNumber: sharedSchema.invoices.invoiceNumber,
          amount: sharedSchema.invoices.amount,
          currency: sharedSchema.invoices.currency,
          status: sharedSchema.invoices.status,
          dueDate: sharedSchema.invoices.dueDate,
          paidAt: sharedSchema.invoices.paidAt,
          stripeInvoiceId: sharedSchema.invoices.stripeInvoiceId,
          createdAt: sharedSchema.invoices.createdAt
        })
        .from(sharedSchema.invoices)
        .where(eq(sharedSchema.invoices.customerId, customerId))
        .orderBy(sharedSchema.invoices.createdAt);

      await managementPool.end();

      res.json({
        success: true,
        invoices
      });

    } catch (error) {
      console.error('❌ Error fetching invoices:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch invoice history'
      });
    }
  });

  /**
   * Get customer's usage statistics
   * GET /api/billing/usage
   * SECURITY: Requires authentication and tenant isolation
   */
  app.get('/api/billing/usage', requireAuth, async (req, res) => {
    try {
      // SECURITY: Enforce strict customer context from authenticated session
      const customerId = req.user?.customerId;
      if (!customerId) {
        return res.status(403).json({
          success: false,
          error: 'Access denied - customer context required'
        });
      }

      const managementDbUrl = process.env.DATABASE_URL;
      if (!managementDbUrl) {
        return res.status(500).json({ error: 'Database configuration error' });
      }

      const managementPool = new Pool({ connectionString: managementDbUrl });
      const db = drizzle({ client: managementPool, schema: sharedSchema });

      // Get current month's usage
      const currentDate = new Date();
      const currentPeriod = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}`;

      const [usage] = await db
        .select()
        .from(sharedSchema.usageTracking)
        .where(eq(sharedSchema.usageTracking.customerId, customerId))
        .where(eq(sharedSchema.usageTracking.period, currentPeriod))
        .limit(1);

      // Get subscription plan limits
      const subscriptionData = await stripeService.getCustomerSubscription(customerId);

      await managementPool.end();

      res.json({
        success: true,
        usage: usage || {
          period: currentPeriod,
          visitorsCount: 0,
          staffCount: 0,
          meetingRoomsCount: 0,
          tenantsCount: 0,
          storageUsedMb: 0,
          apiRequestsCount: 0,
          emailsSent: 0,
          smsSent: 0,
          isOverLimit: false,
          overageCharges: '0.00'
        },
        limits: subscriptionData.plan ? {
          maxVisitorsPerMonth: subscriptionData.plan.maxVisitorsPerMonth,
          maxStaff: subscriptionData.plan.maxStaff,
          maxMeetingRooms: subscriptionData.plan.maxMeetingRooms,
          maxTenants: subscriptionData.plan.maxTenants,
          maxStorageGb: subscriptionData.plan.maxStorageGb
        } : null,
        subscription: subscriptionData
      });

    } catch (error) {
      console.error('❌ Error fetching usage data:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch usage statistics'
      });
    }
  });

  /**
   * Admin endpoint: Create subscription plans in Stripe (development/setup only)
   * POST /api/billing/admin/setup-plans
   * Requires proper authentication with admin privileges
   */
  app.post('/api/billing/admin/setup-plans', requireAuth, async (req, res) => {
    try {
      // Verify user has admin privileges (additional security layer)
      if (!req.user?.isSystemAdmin) {
        return res.status(403).json({
          success: false,
          error: 'System admin privileges required'
        });
      }

      const result = await stripeService.ensureSubscriptionPlans();

      res.json({
        success: true,
        message: 'Subscription plans ensured successfully',
        ...result
      });

    } catch (error) {
      console.error('❌ Error setting up subscription plans:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to setup subscription plans',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  });

  console.log('✅ Billing routes registered successfully');
}