import type { Express, Request, Response } from 'express';
import express from 'express';
import Stripe from 'stripe';
import { stripeService } from './stripeService';
import { Pool } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import { eq, and } from 'drizzle-orm';
import * as sharedSchema from '@shared/schema';
import crypto from 'crypto';
import { emailService } from './emailService';

/**
 * STRIPE WEBHOOK HANDLER
 * 
 * Handles critical Stripe webhook events for billing lifecycle:
 * - Customer subscription events (created, updated, canceled, deleted)
 * - Payment events (succeeded, failed, requires_action)
 * - Invoice events (created, finalized, payment_succeeded, payment_failed)
 * - Customer events (created, updated, deleted)
 * 
 * Features:
 * - Idempotent processing (prevents duplicate processing)
 * - Comprehensive error handling and retry logic
 * - Database synchronization with Stripe state
 * - Customer access control based on subscription status
 * - Audit logging for all billing events
 */
export class StripeWebhookHandler {
  private static instance: StripeWebhookHandler;

  private constructor() {}

  static getInstance(): StripeWebhookHandler {
    if (!StripeWebhookHandler.instance) {
      StripeWebhookHandler.instance = new StripeWebhookHandler();
    }
    return StripeWebhookHandler.instance;
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
   * Register webhook endpoint with proper security implementation
   * SECURITY: Uses express.raw middleware for signature verification
   * SECURITY: Implements idempotent processing to prevent replay attacks
   */
  registerWebhookEndpoint(app: Express) {
    // SECURITY CRITICAL: Stripe webhooks require raw body access for signature verification
    app.post('/api/stripe/webhook', 
      // SECURITY: Use raw body parser specifically for Stripe webhooks
      express.raw({ type: 'application/json' }),
      async (req: Request, res: Response) => {
        try {
          await this.handleWebhook(req, res);
        } catch (error) {
          console.error('❌ Critical webhook processing error:', error);
          // Return 500 to trigger Stripe retry
          res.status(500).json({ 
            received: false, 
            processed: false, 
            error: 'Webhook processing failed' 
          });
        }
      }
    );

    console.log('✅ SECURITY: Stripe webhook endpoint registered at /api/stripe/webhook with proper raw body parsing');
  }

  /**
   * Main webhook handler
   */
  async handleWebhook(req: Request, res: Response) {
    const sig = req.headers['stripe-signature'] as string;
    
    // Ensure we have the raw body as Buffer for signature verification
    const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from(req.body, 'utf8');

    if (!sig) {
      console.error('❌ Missing stripe-signature header');
      return res.status(400).send('Missing stripe-signature header');
    }

    let event: Stripe.Event;

    try {
      // Verify webhook signature with raw buffer
      event = stripeService.verifyWebhookSignature(rawBody, sig);
      console.log(`🔔 Stripe webhook received: ${event.type} (${event.id})`);
      
    } catch (error) {
      console.error('❌ Stripe webhook signature verification failed:', error);
      return res.status(400).send('Webhook signature verification failed');
    }

    try {
      // Check for duplicate events (idempotency)
      const isProcessed = await this.checkEventProcessed(event);
      if (isProcessed) {
        console.log(`⏭️ Event already processed: ${event.id}`);
        return res.status(200).json({ received: true, processed: false, reason: 'duplicate' });
      }

      // Store webhook event for processing
      await this.storeWebhookEvent(event);

      // Process the event
      await this.processWebhookEvent(event);

      // Mark event as processed
      await this.markEventProcessed(event.id);

      console.log(`✅ Successfully processed webhook: ${event.type} (${event.id})`);
      res.status(200).json({ received: true, processed: true });

    } catch (error) {
      console.error(`❌ Error processing webhook ${event.type} (${event.id}):`, error);
      
      // Mark event as failed for retry
      await this.markEventFailed(event.id, error);
      
      // Return 500 to trigger Stripe retry
      res.status(500).json({ 
        received: true, 
        processed: false, 
        error: 'Webhook processing failed - will retry' 
      });
    }
  }

  /**
   * Check if webhook event has already been processed
   */
  private async checkEventProcessed(event: Stripe.Event): Promise<boolean> {
    const db = this.getManagementDb();
    
    const [existingEvent] = await db
      .select()
      .from(sharedSchema.stripeWebhookEvents)
      .where(eq(sharedSchema.stripeWebhookEvents.eventId, event.id))
      .limit(1);

    return existingEvent && existingEvent.status === 'processed';
  }

  /**
   * Store webhook event in database
   */
  private async storeWebhookEvent(event: Stripe.Event) {
    const db = this.getManagementDb();
    
    const payloadHash = crypto.createHash('sha256')
      .update(JSON.stringify(event))
      .digest('hex');

    // Try to find associated customer ID
    let customerId: string | null = null;
    if (event.data.object && typeof event.data.object === 'object') {
      const obj = event.data.object as any;
      if (obj.metadata?.visigate_customer_id) {
        customerId = obj.metadata.visigate_customer_id;
      } else if (obj.customer) {
        // Look up customer by Stripe customer ID
        const [customer] = await db
          .select()
          .from(sharedSchema.customers)
          .where(eq(sharedSchema.customers.stripeCustomerId, obj.customer))
          .limit(1);
        
        if (customer) {
          customerId = customer.id;
        }
      }
    }

    await db
      .insert(sharedSchema.stripeWebhookEvents)
      .values({
        eventId: event.id,
        eventType: event.type,
        customerId,
        payloadHash,
        rawPayload: JSON.stringify(event),
        status: 'pending',
        apiVersion: event.api_version,
        livemode: event.livemode,
        webhookEndpoint: '/api/stripe/webhook',
        retryCount: 0,
        maxRetries: 3
      })
      .onConflictDoNothing(); // Ignore duplicate event IDs
  }

  /**
   * Process webhook event based on type
   */
  private async processWebhookEvent(event: Stripe.Event) {
    switch (event.type) {
      // Subscription lifecycle events
      case 'customer.subscription.created':
        await this.handleSubscriptionCreated(event);
        break;
      
      case 'customer.subscription.updated':
        await this.handleSubscriptionUpdated(event);
        break;
      
      case 'customer.subscription.deleted':
        await this.handleSubscriptionDeleted(event);
        break;

      // Payment events  
      case 'invoice.payment_succeeded':
        await this.handlePaymentSucceeded(event);
        break;
      
      case 'invoice.payment_failed':
        await this.handlePaymentFailed(event);
        break;

      // Customer events
      case 'customer.created':
        await this.handleCustomerCreated(event);
        break;
        
      case 'customer.updated':
        await this.handleCustomerUpdated(event);
        break;

      // Trial will end soon (for notifications)
      case 'customer.subscription.trial_will_end':
        await this.handleTrialWillEnd(event);
        break;

      // Checkout session completed (for new signups)
      case 'checkout.session.completed':
        await this.handleCheckoutCompleted(event);
        break;

      default:
        console.log(`⏭️ Unhandled webhook event type: ${event.type}`);
    }
  }

  /**
   * Handle subscription created
   */
  private async handleSubscriptionCreated(event: Stripe.Event) {
    const subscription = event.data.object as Stripe.Subscription;
    console.log(`🔄 Processing subscription created: ${subscription.id}`);

    await stripeService.updateSubscriptionFromWebhook(subscription);

    // Activate customer if subscription is active or trialing
    if (['active', 'trialing'].includes(subscription.status)) {
      await this.activateCustomerAccess(subscription);
    }
  }

  /**
   * Handle subscription updated  
   */
  private async handleSubscriptionUpdated(event: Stripe.Event) {
    const subscription = event.data.object as Stripe.Subscription;
    console.log(`🔄 Processing subscription updated: ${subscription.id}`);

    await stripeService.updateSubscriptionFromWebhook(subscription);

    // Update customer access based on new status
    if (['active', 'trialing'].includes(subscription.status)) {
      await this.activateCustomerAccess(subscription);
    } else if (['past_due', 'unpaid', 'canceled'].includes(subscription.status)) {
      await this.suspendCustomerAccess(subscription);
    }
  }

  /**
   * Handle subscription deleted/canceled
   */
  private async handleSubscriptionDeleted(event: Stripe.Event) {
    const subscription = event.data.object as Stripe.Subscription;
    console.log(`🔄 Processing subscription deleted: ${subscription.id}`);

    await stripeService.updateSubscriptionFromWebhook(subscription);
    await this.suspendCustomerAccess(subscription);
  }

  /**
   * Handle successful payment
   */
  private async handlePaymentSucceeded(event: Stripe.Event) {
    const invoice = event.data.object as Stripe.Invoice;
    console.log(`🔄 Processing payment succeeded for invoice: ${invoice.id}`);

    await this.recordInvoicePayment(invoice, 'paid');

    // If this was a trial conversion, ensure customer access is maintained
    if (invoice.subscription) {
      const subscription = await stripeService['stripe'].subscriptions.retrieve(invoice.subscription as string);
      if (subscription.status === 'active') {
        await this.activateCustomerAccess(subscription);
      }
    }
  }

  /**
   * Handle failed payment
   */
  private async handlePaymentFailed(event: Stripe.Event) {
    const invoice = event.data.object as Stripe.Invoice;
    console.log(`🔄 Processing payment failed for invoice: ${invoice.id}`);

    await this.recordInvoicePayment(invoice, 'failed');

    // Handle subscription status update
    if (invoice.subscription) {
      const subscription = await stripeService['stripe'].subscriptions.retrieve(invoice.subscription as string);
      
      if (['past_due', 'unpaid'].includes(subscription.status)) {
        await this.handlePaymentFailure(subscription, invoice);
      }
    }
  }

  /**
   * Handle customer created in Stripe
   */
  private async handleCustomerCreated(event: Stripe.Event) {
    const customer = event.data.object as Stripe.Customer;
    console.log(`🔄 Processing customer created: ${customer.id}`);

    // Update our customer record with Stripe customer ID if not already set
    const visiGateCustomerId = customer.metadata?.visigate_customer_id;
    if (visiGateCustomerId) {
      const db = this.getManagementDb();
      await db
        .update(sharedSchema.customers)
        .set({
          stripeCustomerId: customer.id,
          updatedAt: new Date()
        })
        .where(eq(sharedSchema.customers.id, visiGateCustomerId));
    }
  }

  /**
   * Handle customer updated
   */
  private async handleCustomerUpdated(event: Stripe.Event) {
    const customer = event.data.object as Stripe.Customer;
    console.log(`🔄 Processing customer updated: ${customer.id}`);

    // Sync customer data if needed
    const visiGateCustomerId = customer.metadata?.visigate_customer_id;
    if (visiGateCustomerId) {
      const db = this.getManagementDb();
      await db
        .update(sharedSchema.customers)
        .set({
          contactEmail: customer.email || undefined,
          updatedAt: new Date()
        })
        .where(eq(sharedSchema.customers.id, visiGateCustomerId));
    }
  }

  /**
   * Handle trial ending soon (send notifications)
   */
  private async handleTrialWillEnd(event: Stripe.Event) {
    const subscription = event.data.object as Stripe.Subscription;
    console.log(`🔄 Processing trial will end: ${subscription.id}`);

    const customerId = subscription.metadata?.visigate_customer_id;
    if (customerId) {
      try {
        const db = this.getManagementDb();
        const [customer] = await db
          .select({ contactEmail: sharedSchema.customers.contactEmail, companyName: sharedSchema.customers.companyName })
          .from(sharedSchema.customers)
          .where(eq(sharedSchema.customers.id, customerId));

        if (customer?.contactEmail) {
          const billingUrl = 'https://app.tprmax.com/billing';
          const html = `
            <!DOCTYPE html>
            <html lang="en">
            <head>
              <meta charset="UTF-8">
              <meta name="viewport" content="width=device-width, initial-scale=1.0">
              <title>Your TPR Max trial ends in 3 days</title>
            </head>
            <body style="margin:0;padding:0;background-color:#f6f6f6;font-family:Arial,Helvetica,sans-serif;line-height:1.6;">
              <div style="width:100%;background-color:#f6f6f6;padding:20px 0;">
                <div style="max-width:600px;margin:0 auto;background-color:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 4px 6px rgba(0,0,0,0.1);">
                  <div style="background:linear-gradient(135deg,#2460a9 0%,#1a4080 100%);color:#ffffff;padding:30px 20px;text-align:center;">
                    <h1 style="margin:0;font-size:24px;font-weight:bold;">Your TPR Max trial ends in 3 days</h1>
                  </div>
                  <div style="padding:30px 25px;">
                    <p style="margin:0 0 16px;color:#333333;font-size:15px;">Hi${customer.companyName ? ' ' + customer.companyName : ''},</p>
                    <p style="margin:0 0 16px;color:#333333;font-size:15px;">
                      Just a friendly heads-up — your TPR Max free trial will end in <strong>3 days</strong>.
                    </p>
                    <p style="margin:0 0 16px;color:#333333;font-size:15px;">
                      After your trial ends, your subscription will automatically continue and your payment method on file will be charged. You'll keep full access to everything you've been using, with no interruption.
                    </p>
                    <p style="margin:0 0 24px;color:#333333;font-size:15px;">
                      If you'd like to review your plan, update your payment details, or cancel before you're charged, you can do that any time from your billing page.
                    </p>
                    <div style="text-align:center;margin:0 0 24px;">
                      <a href="${billingUrl}" style="display:inline-block;background-color:#2460a9;color:#ffffff;text-decoration:none;padding:14px 32px;border-radius:6px;font-size:15px;font-weight:bold;">Manage My Subscription</a>
                    </div>
                    <p style="margin:0 0 8px;color:#333333;font-size:15px;">Thanks for trying TPR Max. We hope it's been useful.</p>
                    <p style="margin:0;color:#333333;font-size:15px;">
                      The TPR Max Team
                    </p>
                  </div>
                  <div style="background-color:#f6f6f6;padding:16px 25px;text-align:center;">
                    <p style="margin:0;color:#999999;font-size:12px;">
                      TPR Max &mdash; Personnel Management &amp; Compliance<br>
                      If you have questions, reply to this email or visit <a href="${billingUrl}" style="color:#2460a9;">your billing page</a>.
                    </p>
                  </div>
                </div>
              </div>
            </body>
            </html>
          `;

          const sent = await emailService.sendEmail({
            to: customer.contactEmail,
            subject: 'Your TPR Max trial ends in 3 days',
            html,
          });

          if (sent) {
            console.log(`📧 Trial ending notification sent to ${customer.contactEmail} (customer: ${customerId})`);
          } else {
            console.error(`📧 Failed to send trial ending notification to ${customer.contactEmail} (customer: ${customerId})`);
          }
        } else {
          console.warn(`📧 No contact email found for customer: ${customerId} — trial ending notification not sent`);
        }
      } catch (err) {
        console.error(`📧 Error sending trial ending notification for customer ${customerId}:`, err);
      }
    }
  }

  /**
   * Handle checkout session completed (new customer signup)
   */
  private async handleCheckoutCompleted(event: Stripe.Event) {
    const session = event.data.object as Stripe.Checkout.Session;
    console.log(`🔄 Processing checkout completed: ${session.id}`);

    if (session.mode === 'subscription' && session.subscription) {
      // Retrieve the subscription to process it
      const subscription = await stripeService['stripe'].subscriptions.retrieve(
        session.subscription as string
      );
      
      await stripeService.updateSubscriptionFromWebhook(subscription);
      
      // Activate customer access
      if (['active', 'trialing'].includes(subscription.status)) {
        await this.activateCustomerAccess(subscription);
      }
    }
  }

  /**
   * Activate customer access
   */
  private async activateCustomerAccess(subscription: Stripe.Subscription) {
    const customerId = subscription.metadata?.visigate_customer_id;
    if (!customerId) return;

    console.log(`✅ Activating access for customer: ${customerId}`);

    const db = this.getManagementDb();
    await db
      .update(sharedSchema.customers)
      .set({
        isActive: true,
        updatedAt: new Date()
      })
      .where(eq(sharedSchema.customers.id, customerId));
  }

  /**
   * Suspend customer access
   */
  private async suspendCustomerAccess(subscription: Stripe.Subscription) {
    const customerId = subscription.metadata?.visigate_customer_id;
    if (!customerId) return;

    console.log(`⚠️ Suspending access for customer: ${customerId}`);

    const db = this.getManagementDb();
    await db
      .update(sharedSchema.customers)
      .set({
        isActive: false,
        updatedAt: new Date()
      })
      .where(eq(sharedSchema.customers.id, customerId));
  }

  /**
   * Record invoice payment
   */
  private async recordInvoicePayment(invoice: Stripe.Invoice, status: 'paid' | 'failed') {
    const customerId = invoice.customer_email || invoice.subscription;
    if (!customerId) return;

    const db = this.getManagementDb();
    
    // Check if invoice already exists
    const [existingInvoice] = await db
      .select()
      .from(sharedSchema.invoices)
      .where(eq(sharedSchema.invoices.stripeInvoiceId, invoice.id))
      .limit(1);

    if (existingInvoice) {
      // Update existing invoice
      await db
        .update(sharedSchema.invoices)
        .set({
          status,
          paidAt: status === 'paid' ? new Date(invoice.status_transitions.paid_at! * 1000) : null,
          updatedAt: new Date()
        })
        .where(eq(sharedSchema.invoices.id, existingInvoice.id));
    } else {
      // Create new invoice record
      const visiGateCustomerId = invoice.metadata?.visigate_customer_id;
      if (!visiGateCustomerId) return;

      await db
        .insert(sharedSchema.invoices)
        .values({
          customerId: visiGateCustomerId,
          subscriptionId: null, // Would need to look up from subscription table
          invoiceNumber: invoice.number || `stripe-${invoice.id}`,
          amount: (invoice.amount_paid / 100).toString(),
          currency: invoice.currency.toUpperCase(),
          tax: invoice.tax ? (invoice.tax / 100).toString() : '0.00',
          status,
          dueDate: new Date(invoice.due_date! * 1000),
          paidAt: status === 'paid' ? new Date(invoice.status_transitions.paid_at! * 1000) : null,
          stripeInvoiceId: invoice.id,
          stripeChargeId: invoice.charge as string,
          lineItems: JSON.stringify(invoice.lines.data),
          paymentMethod: invoice.payment_intent ? 'card' : 'unknown'
        });
    }
  }

  /**
   * Handle payment failure
   */
  private async handlePaymentFailure(subscription: Stripe.Subscription, invoice: Stripe.Invoice) {
    const customerId = subscription.metadata?.visigate_customer_id;
    if (!customerId) return;

    console.log(`🚨 Payment failure for customer: ${customerId}`);

    try {
      const db = this.getManagementDb();
      const [customer] = await db
        .select({ contactEmail: sharedSchema.customers.contactEmail, companyName: sharedSchema.customers.companyName })
        .from(sharedSchema.customers)
        .where(eq(sharedSchema.customers.id, customerId));

      if (customer?.contactEmail) {
        const billingUrl = 'https://app.tprmax.com/billing';
        const html = `
          <!DOCTYPE html>
          <html lang="en">
          <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>TPR Max — payment unsuccessful</title>
          </head>
          <body style="margin:0;padding:0;background-color:#f6f6f6;font-family:Arial,Helvetica,sans-serif;line-height:1.6;">
            <div style="width:100%;background-color:#f6f6f6;padding:20px 0;">
              <div style="max-width:600px;margin:0 auto;background-color:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 4px 6px rgba(0,0,0,0.1);">
                <div style="background:linear-gradient(135deg,#c0392b 0%,#922b21 100%);color:#ffffff;padding:30px 20px;text-align:center;">
                  <h1 style="margin:0;font-size:24px;font-weight:bold;">Payment unsuccessful</h1>
                </div>
                <div style="padding:30px 25px;">
                  <p style="margin:0 0 16px;color:#333333;font-size:15px;">Hi${customer.companyName ? ' ' + customer.companyName : ''},</p>
                  <p style="margin:0 0 16px;color:#333333;font-size:15px;">
                    We were unable to process your most recent payment for TPR Max. This can happen if a card has expired, has insufficient funds, or if your bank has declined the transaction.
                  </p>
                  <p style="margin:0 0 16px;color:#333333;font-size:15px;">
                    Please update your payment details as soon as possible. If the issue is not resolved, your access to TPR Max may be suspended.
                  </p>
                  <p style="margin:0 0 24px;color:#333333;font-size:15px;">
                    You can update your payment method and view your invoices from your billing page.
                  </p>
                  <div style="text-align:center;margin:0 0 24px;">
                    <a href="${billingUrl}" style="display:inline-block;background-color:#c0392b;color:#ffffff;text-decoration:none;padding:14px 32px;border-radius:6px;font-size:15px;font-weight:bold;">Update Payment Details</a>
                  </div>
                  <p style="margin:0 0 8px;color:#333333;font-size:15px;">If you believe this is an error or need any help, please reply to this email and we'll get it sorted.</p>
                  <p style="margin:0;color:#333333;font-size:15px;">
                    The TPR Max Team
                  </p>
                </div>
                <div style="background-color:#f6f6f6;padding:16px 25px;text-align:center;">
                  <p style="margin:0;color:#999999;font-size:12px;">
                    TPR Max &mdash; Personnel Management &amp; Compliance<br>
                    If you have questions, reply to this email or visit <a href="${billingUrl}" style="color:#c0392b;">your billing page</a>.
                  </p>
                </div>
              </div>
            </div>
          </body>
          </html>
        `;

        const sent = await emailService.sendEmail({
          to: customer.contactEmail,
          subject: 'TPR Max — payment unsuccessful',
          html,
        });

        if (sent) {
          console.log(`📧 Payment failure notification sent to ${customer.contactEmail} (customer: ${customerId})`);
        } else {
          console.error(`📧 Failed to send payment failure notification to ${customer.contactEmail} (customer: ${customerId})`);
        }
      } else {
        console.warn(`📧 No contact email found for customer: ${customerId} — payment failure notification not sent`);
      }
    } catch (err) {
      console.error(`📧 Error sending payment failure notification for customer ${customerId}:`, err);
    }

    // If subscription is past due for too long, suspend access
    if (subscription.status === 'unpaid') {
      await this.suspendCustomerAccess(subscription);
    }
  }

  /**
   * Mark event as processed
   */
  private async markEventProcessed(eventId: string) {
    const db = this.getManagementDb();
    await db
      .update(sharedSchema.stripeWebhookEvents)
      .set({
        status: 'processed',
        processedAt: new Date(),
        updatedAt: new Date()
      })
      .where(eq(sharedSchema.stripeWebhookEvents.eventId, eventId));
  }

  /**
   * Mark event as failed for retry
   */
  private async markEventFailed(eventId: string, error: any) {
    const db = this.getManagementDb();
    
    // Get current retry count
    const [event] = await db
      .select()
      .from(sharedSchema.stripeWebhookEvents)
      .where(eq(sharedSchema.stripeWebhookEvents.eventId, eventId))
      .limit(1);

    const retryCount = (event?.retryCount || 0) + 1;
    const maxRetries = event?.maxRetries || 3;
    const status = retryCount >= maxRetries ? 'failed' : 'pending';

    await db
      .update(sharedSchema.stripeWebhookEvents)
      .set({
        status,
        errorMessage: error.toString(),
        retryCount,
        updatedAt: new Date()
      })
      .where(eq(sharedSchema.stripeWebhookEvents.eventId, eventId));
  }
}

// Export singleton instance
export const stripeWebhookHandler = StripeWebhookHandler.getInstance();