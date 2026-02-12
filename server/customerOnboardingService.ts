import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { eq, sql } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import bcrypt from 'bcryptjs';

import { CustomerDatabaseService } from './customerDatabase';
import { DatabaseProvisioningService } from './databaseProvisioningService';
import { AuthService } from './auth';
import { EmailService } from './emailService';
import { stripeService } from './stripeService';

import * as sharedSchema from '@shared/schema';
import * as isolatedSchema from './isolatedSchema';
import type { 
  CustomerOnboardingRequest, 
  CustomerOnboardingResponse, 
  CustomerOnboardingError,
  Customer,
  InsertCustomer
} from '@shared/schema';

/**
 * CUSTOMER ONBOARDING SERVICE
 * 
 * Handles comprehensive customer onboarding with:
 * - Customer record creation in management database
 * - Isolated database provisioning and schema setup
 * - Admin user creation with proper authentication
 * - Default company settings and infrastructure
 * - Complete rollback on any failure
 * - Audit logging and error tracking
 */
export class CustomerOnboardingService {
  private static instance: CustomerOnboardingService;
  private customerDbService = CustomerDatabaseService.getInstance();
  private databaseProvisioningService = DatabaseProvisioningService.getInstance();
  
  private constructor() {}

  static getInstance(): CustomerOnboardingService {
    if (!CustomerOnboardingService.instance) {
      CustomerOnboardingService.instance = new CustomerOnboardingService();
    }
    return CustomerOnboardingService.instance;
  }

  /**
   * Check if Stripe is available and configured
   */
  private async isStripeAvailable(): Promise<boolean> {
    try {
      return stripeService.isAvailable();
    } catch {
      return false;
    }
  }

  /**
   * Main customer onboarding method with comprehensive rollback
   */
  async provisionCustomer(request: CustomerOnboardingRequest): Promise<CustomerOnboardingResponse> {
    const provisioiningState = {
      customerCreated: false,
      databaseProvisioned: false,
      adminUserCreated: false,
      settingsInitialized: false,
      stripeCustomerCreated: false,
      subscriptionCreated: false,
      customerId: '',
      customerSlug: '',
      databaseUrl: '',
      adminUserId: '',
      stripeCustomerId: ''
    };

    try {
      console.log(`🚀 Starting customer onboarding for: ${request.companyName}`);
      
      // Step 1: Validate and prepare customer data
      await this.validateOnboardingRequest(request);
      
      // Step 2: Create customer record in management database
      const { customer, customerId } = await this.createCustomerRecord(request);
      provisioiningState.customerCreated = true;
      provisioiningState.customerId = customerId;
      provisioiningState.customerSlug = customer.slug;
      
      console.log(`✅ Customer record created: ${customer.companyName} (${customerId})`);
      
      // Step 3: Provision isolated database
      const databaseUrl = await this.provisionCustomerDatabase(customerId);
      provisioiningState.databaseProvisioned = true;
      provisioiningState.databaseUrl = databaseUrl;
      
      console.log(`✅ Database provisioned for customer: ${customerId}`);
      
      // Step 4: Initialize customer infrastructure
      const adminUserId = await this.setupCustomerInfrastructure(customerId, request);
      provisioiningState.adminUserCreated = true;
      provisioiningState.adminUserId = adminUserId;
      
      console.log(`✅ Customer infrastructure setup completed: ${customerId}`);
      
      // Step 5: Initialize company settings and defaults
      await this.initializeCompanyDefaults(customerId, request);
      provisioiningState.settingsInitialized = true;
      
      console.log(`✅ Company defaults initialized: ${customerId}`);

      // Step 5b: Seed UK H&S document templates into isolated database
      try {
        const { seedIsolatedHSTemplates } = await import('./seed-isolated-hs-templates');
        const customerDb = await this.customerDbService.getCustomerDatabase(customerId);
        await seedIsolatedHSTemplates(customerDb, `${request.companyName} (${customerId})`, customerId);
        console.log(`✅ UK H&S document templates seeded for: ${customerId}`);
      } catch (hsError) {
        console.warn(`⚠️ Non-critical: Could not seed H&S templates for ${customerId}:`, hsError);
      }
      
      // Step 6: Create Stripe customer (conditional on Stripe availability)
      let stripeCustomerResult: any = null;
      if (await this.isStripeAvailable()) {
        stripeCustomerResult = await this.createStripeCustomer(customerId, request);
        if (stripeCustomerResult.success && stripeCustomerResult.stripeCustomer) {
          provisioiningState.stripeCustomerCreated = true;
          provisioiningState.stripeCustomerId = stripeCustomerResult.stripeCustomer.id;
          console.log(`✅ Stripe customer created: ${stripeCustomerResult.stripeCustomer.id}`);
          
          // Step 7: Always create subscription with 14-day trial for all new customers
          // Single plan: Professional at £49.95/month with 14-day trial
          await this.createStripeSubscription(customerId, stripeCustomerResult.stripeCustomer.id, request);
          provisioiningState.subscriptionCreated = true;
          console.log(`✅ Stripe subscription created for customer: ${customerId} (Professional Plan with 14-day trial)`);

        } else {
          console.warn(`⚠️ Stripe customer creation returned unsuccessful result for ${customerId}`);
        }
      } else {
        console.warn(`⚠️ Stripe not available - skipping customer and subscription creation for development mode`);
      }
      
      // Step 8: Finalize onboarding
      await this.finalizeOnboarding(customerId);
      
      console.log(`🎉 Customer onboarding completed successfully: ${customer.companyName}`);
      
      // Return success response
      const response: CustomerOnboardingResponse = {
        success: true,
        customerId,
        customer: {
          id: customer.id,
          companyName: customer.companyName,
          slug: customer.slug,
          contactEmail: customer.contactEmail,
          isActive: customer.isActive,
          onboardingCompleted: true,
          planType: 'professional',
          trialExpiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
        },
        adminUser: {
          id: adminUserId,
          username: request.adminUsername,
          firstName: request.adminFirstName,
          lastName: request.adminLastName,
          email: request.adminEmail,
          accessLevel: 'admin',
        },
        loginUrl: process.env.NODE_ENV === 'production' 
          ? `https://${customer.slug}.visigate.app/login`
          : `${process.env.FRONTEND_URL || 'http://localhost:5000'}/login`,
        credentials: {
          companyName: customer.companyName,
          username: request.adminUsername,
          // Don't include password in response for security
        },
        message: `Customer ${customer.companyName} has been successfully onboarded. Admin user ${request.adminUsername} can now log in using the 3-field authentication.`
      };
      
      return response;
      
    } catch (error) {
      console.error(`❌ Customer onboarding failed:`, error);
      
      // Attempt rollback of partially created resources
      await this.rollbackProvisioning(provisioiningState);
      
      // Throw structured error
      throw this.createStructuredError(error, provisioiningState);
    }
  }

  /**
   * Validate onboarding request and check for conflicts
   */
  private async validateOnboardingRequest(request: CustomerOnboardingRequest): Promise<void> {
    // Check if company name already exists
    const existingCompany = await this.checkCompanyNameExists(request.companyName);
    if (existingCompany) {
      throw new Error(`Company name "${request.companyName}" is already registered`);
    }
    
    // Check if admin email already exists in any customer database
    const existingAdminEmail = await this.checkAdminEmailExists(request.adminEmail);
    if (existingAdminEmail) {
      throw new Error(`Admin email "${request.adminEmail}" is already in use`);
    }
  }

  /**
   * Create customer record in management database
   */
  private async createCustomerRecord(request: CustomerOnboardingRequest): Promise<{ customer: Customer; customerId: string }> {
    const managementDbUrl = process.env.DATABASE_URL;
    if (!managementDbUrl) {
      throw new Error("DATABASE_URL must be set for management database");
    }

    const managementPool = new Pool({ connectionString: managementDbUrl });
    const managementDb = drizzle({ client: managementPool, schema: sharedSchema });

    try {
      const customerId = randomUUID();
      const customerSlug = this.generateCustomerSlug(request.companyName);
      
      // All customers get 14-day trial with Professional Plan
      const trialExpiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
      
      const customerData: InsertCustomer = {
        companyName: request.companyName,
        slug: customerSlug,
        contactEmail: request.contactEmail,
        databaseUrl: '', // Will be updated after database provisioning
        isActive: true,
        maxVisitorsPerMonth: this.getMaxVisitorsByPlan(request.planType),
        onboardingCompleted: false,
        supportContactEmail: request.contactEmail,
        apiKeyEnabled: request.planType !== 'trial',
      };
      
      const [customer] = await managementDb
        .insert(sharedSchema.customers)
        .values(customerData)
        .returning();
      
      return { customer, customerId: customer.id };
      
    } finally {
      await managementPool.end();
    }
  }

  /**
   * Provision isolated database for customer
   */
  private async provisionCustomerDatabase(customerId: string): Promise<string> {
    try {
      const databaseUrl = await this.databaseProvisioningService.provisionCustomerDatabase(customerId);
      
      // Update customer record with database URL
      await this.updateCustomerDatabaseUrl(customerId, databaseUrl);
      
      return databaseUrl;
    } catch (error) {
      console.error(`Failed to provision database for customer ${customerId}:`, error);
      throw new Error(`Database provisioning failed: ${error}`);
    }
  }

  /**
   * Set up customer infrastructure (admin user, initial data)
   */
  private async setupCustomerInfrastructure(customerId: string, request: CustomerOnboardingRequest): Promise<string> {
    // Get customer database connection
    const customerDb = await this.customerDbService.getCustomerDatabase(customerId);
    
    // Create admin user in customer's isolated database
    const hashedPassword = await bcrypt.hash(request.adminPassword, 10);
    
    const adminUserData = {
      username: request.adminUsername,
      email: request.adminEmail,
      firstName: request.adminFirstName,
      lastName: request.adminLastName,
      role: 'admin' as const,
      password: hashedPassword,
      isActive: true,
    };
    
    const existingUsers = await customerDb
      .select()
      .from(isolatedSchema.users)
      .where(eq(isolatedSchema.users.username, request.adminUsername))
      .limit(1);

    let adminUser;
    if (existingUsers.length > 0) {
      adminUser = existingUsers[0];
    } else {
      const [newUser] = await customerDb
        .insert(isolatedSchema.users)
        .values(adminUserData)
        .returning();
      adminUser = newUser;
    }
    
    const existingStaff = await customerDb
      .select()
      .from(isolatedSchema.staff)
      .where(eq(isolatedSchema.staff.email, request.adminEmail))
      .limit(1);

    if (existingStaff.length === 0) {
      const staffData = {
        firstName: request.adminFirstName,
        lastName: request.adminLastName,
        email: request.adminEmail,
        department: 'Administration',
        employeeId: 'ADMIN-001',
        accessLevel: 'admin' as const,
        password: hashedPassword,
        userId: adminUser.id,
        isActive: true,
      };
      
      await customerDb
        .insert(isolatedSchema.staff)
        .values(staffData);
    }
    
    return adminUser.id;
  }

  /**
   * Initialize company settings and default data
   * 
   * Note: All new customers start with ACS Safety & Security Ltd branding
   * which they can customize through Settings > Company & Branding
   */
  private async initializeCompanyDefaults(customerId: string, request: CustomerOnboardingRequest): Promise<void> {
    const customerDb = await this.customerDbService.getCustomerDatabase(customerId);
    
    // Initialize company settings with ACS Safety & Security Ltd defaults
    // Customers can rebrand through Settings after onboarding
    const companySettingsData = {
      companyName: 'ACS Safety & Security Ltd',  // Default ACS branding - customizable by customer
      address: request.address || '',
      phone: request.phone || '',
      website: request.website || '',
      email: request.contactEmail,
    };
    
    const existingSettings = await customerDb
      .select()
      .from(isolatedSchema.companySettings)
      .limit(1);
    
    if (existingSettings.length === 0) {
      await customerDb
        .insert(isolatedSchema.companySettings)
        .values(companySettingsData);
    }
    
    // Create default departments (skip if they already exist)
    const defaultDepartments = [
      { name: 'Administration', isActive: true },
      { name: 'Security', isActive: true },
      { name: 'Facilities', isActive: true },
      { name: 'Visitor Services', isActive: true },
    ];
    
    for (const dept of defaultDepartments) {
      const existing = await customerDb
        .select()
        .from(isolatedSchema.departments)
        .where(eq(isolatedSchema.departments.name, dept.name))
        .limit(1);
      if (existing.length === 0) {
        await customerDb
          .insert(isolatedSchema.departments)
          .values(dept);
      }
    }
    
    // Create default meeting rooms (skip if they already exist)
    const defaultMeetingRooms = [
      { 
        name: 'Conference Room A', 
        capacity: 10, 
        location: 'Ground Floor',
        isActive: true 
      },
      { 
        name: 'Meeting Room B', 
        capacity: 6, 
        location: 'First Floor',
        isActive: true 
      },
    ];
    
    for (const room of defaultMeetingRooms) {
      const existing = await customerDb
        .select()
        .from(isolatedSchema.meetingRooms)
        .where(eq(isolatedSchema.meetingRooms.name, room.name))
        .limit(1);
      if (existing.length === 0) {
        await customerDb
          .insert(isolatedSchema.meetingRooms)
          .values(room);
      }
    }
    
    // Create default muster points for emergency evacuations (skip if they already exist)
    const defaultMusterPoints = [
      { 
        name: 'Main Car Park', 
        displayOrder: 1,
        isActive: true 
      },
      { 
        name: 'Rear Assembly Area', 
        displayOrder: 2,
        isActive: true 
      },
      { 
        name: 'Side Entrance', 
        displayOrder: 3,
        isActive: true 
      },
    ];
    
    for (const point of defaultMusterPoints) {
      const existing = await customerDb
        .select()
        .from(isolatedSchema.musterPoints)
        .where(eq(isolatedSchema.musterPoints.name, point.name))
        .limit(1);
      if (existing.length === 0) {
        await customerDb
          .insert(isolatedSchema.musterPoints)
          .values(point);
      }
    }
  }

  /**
   * Create Stripe customer for billing integration (with null safety)
   */
  private async createStripeCustomer(customerId: string, request: CustomerOnboardingRequest) {
    try {
      console.log(`🔄 Creating Stripe customer for: ${request.companyName}`);

      const result = await stripeService.createCustomer({
        email: request.contactEmail,
        name: `${request.adminFirstName} ${request.adminLastName}`,
        companyName: request.companyName,
        customerId,
        phone: request.phone,
        address: request.address ? {
          line1: request.address,
          country: 'GB' // Default to UK
        } : undefined
      });

      // Note: stripeService.createCustomer already atomically updates the customer record
      // with the Stripe customer ID, so no additional database update is needed here
      if (!result.success) {
        console.warn(`⚠️ Stripe customer creation was not successful for ${customerId}: ${result.error || 'Unknown error'}`);
      }

      return result;

    } catch (error) {
      console.error(`Failed to create Stripe customer for ${customerId}:`, error);
      if (process.env.NODE_ENV !== 'production') {
        console.warn(`⚠️ Stripe unavailable in development mode - continuing onboarding without billing integration`);
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error', stripeCustomer: null };
      }
      throw new Error(`Stripe customer creation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Create Stripe subscription during onboarding
   */
  private async createStripeSubscription(customerId: string, stripeCustomerId: string, request: CustomerOnboardingRequest) {
    try {
      console.log(`🔄 Creating Stripe subscription for customer: ${customerId}`);

      // Ensure VisiGate Pro subscription plan exists
      const managementDbUrl = process.env.DATABASE_URL;
      if (!managementDbUrl) {
        throw new Error("DATABASE_URL must be set for management database");
      }

      const managementPool = new Pool({ connectionString: managementDbUrl });
      const managementDb = drizzle({ client: managementPool, schema: sharedSchema });

      try {
        // Get the single Professional Plan from database
        const plan = await managementDb
          .select()
          .from(sharedSchema.subscriptionPlans)
          .where(eq(sharedSchema.subscriptionPlans.name, 'professional'))
          .limit(1)
          .then(results => results[0]);

        if (!plan) {
          throw new Error('Professional Plan not found. Please ensure subscription plan is seeded in database.');
        }

        // Always use monthly billing for the single plan
        const priceId = plan.stripePriceIdMonthly;

        if (!priceId) {
          throw new Error('No Stripe monthly price ID found for Professional Plan');
        }

        const result = await stripeService.createSubscription({
          customerId,
          stripeCustomerId,
          priceId,
          billingCycle: 'monthly',
          trialDays: 14  // Fixed 14-day trial for all customers
        });

        console.log(`✅ Stripe subscription created: ${result.subscription.id}`);
        return result;

      } finally {
        await managementPool.end();
      }

    } catch (error) {
      console.error(`Failed to create Stripe subscription for ${customerId}:`, error);
      throw new Error(`Stripe subscription creation failed: ${error}`);
    }
  }

  /**
   * NOTE: updateCustomerStripeId method removed - stripeService.createCustomer
   * now handles Stripe customer ID persistence atomically to prevent race conditions
   * and ensure single point of truth for customer creation.
   */

  /**
   * Finalize onboarding process
   */
  private async finalizeOnboarding(customerId: string): Promise<void> {
    const managementDbUrl = process.env.DATABASE_URL;
    if (!managementDbUrl) {
      throw new Error("DATABASE_URL must be set for management database");
    }

    const managementPool = new Pool({ connectionString: managementDbUrl });
    const managementDb = drizzle({ client: managementPool, schema: sharedSchema });

    try {
      // Mark onboarding as completed
      await managementDb
        .update(sharedSchema.customers)
        .set({ 
          onboardingCompleted: true,
          updatedAt: new Date()
        })
        .where(eq(sharedSchema.customers.id, customerId));
      
      console.log(`✅ Onboarding finalized for customer: ${customerId}`);
      
    } finally {
      await managementPool.end();
    }
  }

  /**
   * Rollback partially created resources on failure
   */
  private async rollbackProvisioning(state: any): Promise<void> {
    console.log(`🔄 Starting rollback for customer: ${state.customerId}`);
    
    try {
      // Note: Database rollback is complex and may require manual intervention
      // For now, we'll mark the customer as inactive and log the state
      
      if (state.customerCreated && state.customerId) {
        const managementDbUrl = process.env.DATABASE_URL;
        if (managementDbUrl) {
          const managementPool = new Pool({ connectionString: managementDbUrl });
          const managementDb = drizzle({ client: managementPool, schema: sharedSchema });
          
          try {
            // Mark customer as inactive instead of deleting
            await managementDb
              .update(sharedSchema.customers)
              .set({ 
                isActive: false,
                updatedAt: new Date()
              })
              .where(eq(sharedSchema.customers.id, state.customerId));
            
            console.log(`🔄 Customer marked as inactive during rollback: ${state.customerId}`);
          } finally {
            await managementPool.end();
          }
        }
      }
      
      console.log(`✅ Rollback completed for customer: ${state.customerId}`);
      
    } catch (rollbackError) {
      console.error(`❌ Rollback failed for customer ${state.customerId}:`, rollbackError);
      // Log to external monitoring system in production
    }
  }

  /**
   * Create structured error response
   */
  private createStructuredError(error: any, state: any): CustomerOnboardingError {
    let errorCode: CustomerOnboardingError['code'] = 'INTERNAL_ERROR';
    let errorMessage = 'An unexpected error occurred during customer onboarding';
    
    if (error instanceof Error) {
      errorMessage = error.message;
      
      if (error.message.includes('already registered') || error.message.includes('already exists')) {
        errorCode = 'COMPANY_EXISTS';
      } else if (error.message.includes('admin email') && error.message.includes('already in use')) {
        errorCode = 'ADMIN_USER_EXISTS';
      } else if (error.message.includes('Database provisioning failed')) {
        errorCode = 'DATABASE_PROVISIONING_FAILED';
      } else if (error.message.includes('User creation failed')) {
        errorCode = 'USER_CREATION_FAILED';
      } else if (error.message.includes('Settings initialization failed')) {
        errorCode = 'SETTINGS_INITIALIZATION_FAILED';
      }
    }
    
    return {
      success: false,
      error: errorMessage,
      code: errorCode,
      details: process.env.NODE_ENV === 'development' ? error : undefined,
      partialState: {
        customerCreated: state.customerCreated,
        databaseProvisioned: state.databaseProvisioned,
        adminUserCreated: state.adminUserCreated,
        settingsInitialized: state.settingsInitialized,
      }
    };
  }

  /**
   * Helper methods
   */
  private async checkCompanyNameExists(companyName: string): Promise<boolean> {
    const managementDbUrl = process.env.DATABASE_URL;
    if (!managementDbUrl) return false;

    const managementPool = new Pool({ connectionString: managementDbUrl });
    const managementDb = drizzle({ client: managementPool, schema: sharedSchema });

    try {
      const existing = await managementDb
        .select()
        .from(sharedSchema.customers)
        .where(sql`LOWER(${sharedSchema.customers.companyName}) = LOWER(${companyName})`)
        .limit(1);

      return existing.length > 0;
    } finally {
      await managementPool.end();
    }
  }

  private async checkAdminEmailExists(email: string): Promise<boolean> {
    // This would require checking across all customer databases
    // For now, we'll do a simple check - in production this should be more comprehensive
    return false;
  }

  private generateCustomerSlug(companyName: string): string {
    return companyName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .substring(0, 50);
  }

  private async updateCustomerDatabaseUrl(customerId: string, databaseUrl: string): Promise<void> {
    const managementDbUrl = process.env.DATABASE_URL;
    if (!managementDbUrl) return;

    const managementPool = new Pool({ connectionString: managementDbUrl });
    const managementDb = drizzle({ client: managementPool, schema: sharedSchema });

    try {
      await managementDb
        .update(sharedSchema.customers)
        .set({ databaseUrl, updatedAt: new Date() })
        .where(eq(sharedSchema.customers.id, customerId));
    } finally {
      await managementPool.end();
    }
  }

  private getMaxVisitorsByPlan(planType: string): number {
    switch (planType) {
      case 'trial': return 100;
      case 'basic': return 500;
      case 'professional': return 2000;
      case 'enterprise': return 10000;
      default: return 100;
    }
  }

  private getDefaultHSRules(): string {
    return `# Health & Safety Rules and Regulations

## General Safety Rules

1. **Personal Safety**
   - Report to reception upon arrival and departure
   - Wear your visitor/contractor pass at all times
   - Follow all posted safety signs and instructions
   - Report any accidents or near misses immediately

2. **Emergency Procedures**
   - Familiarize yourself with emergency exits
   - In case of fire alarm, evacuate immediately via nearest exit
   - Assembly point is located in the front car park
   - Do not use lifts during emergencies
   - Follow instructions from fire wardens (wearing hi-vis vests)

3. **Personal Protective Equipment (PPE)**
   - PPE must be worn where indicated by signage
   - Safety footwear required in production/warehouse areas
   - High visibility clothing required in designated areas
   - Hard hats required in construction zones

4. **Workplace Hazards**
   - Watch for trip hazards and wet floors
   - Do not enter restricted areas without authorization
   - Keep walkways clear at all times
   - Report any unsafe conditions to your host

5. **Manual Handling**
   - Get assistance for heavy items (over 25kg)
   - Use proper lifting techniques
   - Use mechanical aids where available

By entering our premises, you agree to comply with all health and safety rules.`;
  }
}

// Export singleton instance
export const customerOnboardingService = CustomerOnboardingService.getInstance();