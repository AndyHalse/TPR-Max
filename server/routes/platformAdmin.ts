import type { Express } from 'express';
import multer from 'multer';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import { eq, sql, desc } from 'drizzle-orm';
import { z } from 'zod';
import { requirePlatformAdmin } from '../auth';
import { db } from '../db';
import * as sharedSchema from '@shared/schema';
import { customerOnboardingService } from '../customerOnboardingService';
import { simpleDatabaseService } from '../simpleDatabaseService';

const upload = multer({ storage: multer.memoryStorage() });

export function registerPlatformAdminRoutes(app: Express): void {
  
  // ============================================
  // PLATFORM ADMIN AUTHENTICATION ENDPOINTS
  // ============================================
  
  /**
   * Platform Admin Login
   * Separate from customer authentication
   */
  const platformAdminLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: { error: 'Too many login attempts. Try again in 15 minutes.' }
  });

  app.post("/platform-admin/auth/login", platformAdminLimiter, async (req, res) => {
    try {
      const { username, password } = req.body;
      
      if (!username || !password) {
        return res.status(400).json({ error: "Username and password are required" });
      }
      
      console.log(`🔐 Platform admin login attempt: ${username}`);
      
      // Authenticate platform admin
      const { PlatformAdminAuthService } = await import("../auth");
      const admin = await PlatformAdminAuthService.authenticatePlatformAdmin(username, password);
      
      if (!admin) {
        console.log(`❌ Platform admin authentication failed: ${username}`);
        return res.status(401).json({ error: "Invalid username or password" });
      }
      
      // Regenerate session for security
      req.session.regenerate((regenerateErr) => {
        if (regenerateErr) {
          console.error("❌ Platform admin session regeneration error:", regenerateErr);
          return res.status(500).json({ error: "Failed to create secure session" });
        }
        
        // Set platform admin session
        req.session.platformAdminId = admin.id;
        req.session.platformAdminUsername = admin.username;
        
        req.session.save((saveErr) => {
          if (saveErr) {
            console.error("❌ Platform admin session save error:", saveErr);
            return res.status(500).json({ error: "Failed to establish session" });
          }
          
          console.log(`✅ Platform admin logged in successfully: ${username} (ID: ${admin.id})`);
          
          res.json({
            success: true,
            admin: {
              id: admin.id,
              username: admin.username,
              email: admin.email,
              firstName: admin.firstName,
              lastName: admin.lastName,
              role: admin.role
            }
          });
        });
      });
    } catch (error) {
      console.error("❌ Platform admin login error:", error);
      res.status(500).json({ error: "Login failed" });
    }
  });

  /**
   * Platform Admin Logout
   */
  app.post("/platform-admin/auth/logout", (req, res) => {
    req.session.destroy((err) => {
      if (err) {
        console.error("Platform admin session destroy error:", err);
        return res.status(500).json({ error: "Logout failed" });
      }
      console.log(`🔓 Platform admin logged out`);
      res.json({ success: true });
    });
  });

  /**
   * Get Current Platform Admin
   */
  app.get("/platform-admin/auth/me", async (req, res) => {
    if (!req.session.platformAdminId) {
      return res.status(401).json({ error: "Not authenticated" });
    }
    
    try {
      // Get admin from database
      const admins = await db
        .select()
        .from(sharedSchema.platformAdmins)
        .where(eq(sharedSchema.platformAdmins.id, req.session.platformAdminId))
        .limit(1);
      
      const admin = admins[0];
      
      if (!admin || !admin.isActive) {
        return res.status(401).json({ error: "Admin not found or inactive" });
      }
      
      res.json({
        id: admin.id,
        username: admin.username,
        email: admin.email,
        firstName: admin.firstName,
        lastName: admin.lastName,
        role: admin.role
      });
    } catch (error) {
      console.error('Error in /platform-admin/auth/me:', error);
      return res.status(401).json({ error: "Authentication failed" });
    }
  });

  // ============================================
  // PLATFORM ADMIN CUSTOMER MANAGEMENT ENDPOINTS
  // ============================================
  
  /**
   * Direct Customer Provisioning (bypasses payment)
   * Platform admins can manually onboard customers
   */
  app.post("/platform-admin/customers", requirePlatformAdmin, async (req, res) => {
    try {
      console.log(`📦 Platform admin initiating customer provisioning`);
      
      // Validate request body against customer onboarding schema
      const onboardingData = customerOnboardingRequestSchema.parse(req.body);
      
      // Add flag to skip Stripe subscription creation
      const provisioningRequest: CustomerOnboardingRequest = {
        ...onboardingData,
        createSubscription: false, // Skip Stripe subscription
      };
      
      console.log(`🔧 Provisioning customer without payment: ${provisioningRequest.companyName}`);
      
      // Provision customer directly using onboarding service
      const result = await customerOnboardingService.provisionCustomer(provisioningRequest);
      
      console.log(`✅ Customer provisioned successfully by platform admin: ${result.customer.companyName}`);
      
      res.status(201).json({
        success: true,
        message: 'Customer provisioned successfully',
        customer: result.customer,
        adminUser: result.adminUser,
        loginUrl: result.loginUrl,
      });
    } catch (error) {
      console.error('❌ Platform admin customer provisioning error:', error);
      
      if (error instanceof z.ZodError) {
        const messages = error.errors.map(e => e.message).join('. ');
        return res.status(400).json({
          success: false,
          error: messages || 'Invalid request data',
          details: error.errors
        });
      }
      
      // Handle structured onboarding errors
      if (error && typeof error === 'object' && 'success' in error && error.success === false) {
        const onboardingError = error as CustomerOnboardingError;
        
        let statusCode = 500;
        switch (onboardingError.code) {
          case 'COMPANY_EXISTS':
          case 'ADMIN_USER_EXISTS':
            statusCode = 409;
            break;
          case 'VALIDATION_ERROR':
            statusCode = 400;
            break;
          default:
            statusCode = 500;
            break;
        }
        
        return res.status(statusCode).json(onboardingError);
      }
      
      res.status(500).json({
        success: false,
        error: 'Failed to provision customer',
        details: process.env.NODE_ENV === 'development' ? error : undefined
      });
    }
  });

  /**
   * List all customers with details
   */
  app.get("/platform-admin/customers", requirePlatformAdmin, async (req, res) => {
    try {
      console.log(`📋 Platform admin requesting customer list`);
      
      // Get all customers from management database
      const customers = await db
        .select()
        .from(sharedSchema.customers)
        .orderBy(desc(sharedSchema.customers.createdAt));
      
      console.log(`✅ Retrieved ${customers.length} customers`);
      
      res.json({
        success: true,
        customers: customers.map(customer => ({
          id: customer.id,
          companyName: customer.companyName,
          slug: customer.slug,
          contactEmail: customer.contactEmail,
          isActive: customer.isActive,
          onboardingCompleted: customer.onboardingCompleted,
          maxVisitorsPerMonth: customer.maxVisitorsPerMonth,
          stripeCustomerId: customer.stripeCustomerId,
          createdAt: customer.createdAt,
          updatedAt: customer.updatedAt,
        }))
      });
    } catch (error) {
      console.error('❌ Error fetching customers:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch customers'
      });
    }
  });

  /**
   * Get single customer details
   */
  app.get("/platform-admin/customers/:customerId", requirePlatformAdmin, async (req, res) => {
    try {
      const { customerId } = req.params;
      
      const customers = await db
        .select()
        .from(sharedSchema.customers)
        .where(eq(sharedSchema.customers.id, customerId))
        .limit(1);
      
      const customer = customers[0];
      
      if (!customer) {
        return res.status(404).json({
          success: false,
          error: 'Customer not found'
        });
      }
      
      res.json({
        success: true,
        customer
      });
    } catch (error) {
      console.error('❌ Error fetching customer:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch customer'
      });
    }
  });

  /**
   * Update customer status (activate/deactivate)
   */
  app.patch("/platform-admin/customers/:customerId/status", requirePlatformAdmin, async (req, res) => {
    try {
      const { customerId } = req.params;
      const { isActive } = req.body;
      
      if (typeof isActive !== 'boolean') {
        return res.status(400).json({
          success: false,
          error: 'isActive must be a boolean'
        });
      }
      
      const updatedCustomers = await db
        .update(sharedSchema.customers)
        .set({ 
          isActive,
          updatedAt: sql`NOW()`
        })
        .where(eq(sharedSchema.customers.id, customerId))
        .returning();
      
      const updatedCustomer = updatedCustomers[0];
      
      if (!updatedCustomer) {
        return res.status(404).json({
          success: false,
          error: 'Customer not found'
        });
      }
      
      console.log(`✅ Customer ${customerId} status updated: ${isActive ? 'active' : 'inactive'}`);
      
      res.json({
        success: true,
        customer: updatedCustomer
      });
    } catch (error) {
      console.error('❌ Error updating customer status:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to update customer status'
      });
    }
  });

  /**
   * Delete customer account permanently
   */
  app.delete("/platform-admin/customers/:customerId", requirePlatformAdmin, async (req, res) => {
    try {
      const { customerId } = req.params;

      const existing = await db.select().from(sharedSchema.customers).where(eq(sharedSchema.customers.id, customerId));
      if (!existing.length) {
        return res.status(404).json({ success: false, error: 'Customer not found' });
      }

      const customerName = existing[0].companyName;

      await db.delete(sharedSchema.customers).where(eq(sharedSchema.customers.id, customerId));

      console.log(`🗑️ Customer account deleted: ${customerName} (${customerId})`);

      res.json({ success: true, message: `Customer "${customerName}" has been permanently deleted` });
    } catch (error) {
      console.error('❌ Error deleting customer:', error);
      res.status(500).json({ success: false, error: 'Failed to delete customer' });
    }
  });

  /**
   * Update customer details (PATCH endpoint for edit functionality)
   */
  app.patch("/platform-admin/customers/:customerId", requirePlatformAdmin, async (req, res) => {
    try {
      const { customerId } = req.params;
      
      // Validate request body with explicit schema for allowed fields only
      const updateCustomerSchema = z.object({
        companyName: z.string().trim().min(1).optional(),
        contactEmail: z.string().trim().email().optional(),
        maxVisitorsPerMonth: z.number().int().positive().optional(),
        supportContactEmail: z.string().trim().email().optional().nullable(),
      });
      
      const validatedData = updateCustomerSchema.parse(req.body);
      
      // Only update if there are fields to update
      if (Object.keys(validatedData).length === 0) {
        return res.status(400).json({
          success: false,
          error: 'No valid fields provided for update'
        });
      }
      
      const updatedCustomers = await db
        .update(sharedSchema.customers)
        .set({ 
          ...validatedData,
          updatedAt: sql`NOW()`
        })
        .where(eq(sharedSchema.customers.id, customerId))
        .returning();
      
      const updatedCustomer = updatedCustomers[0];
      
      if (!updatedCustomer) {
        return res.status(404).json({
          success: false,
          error: 'Customer not found'
        });
      }
      
      console.log(`✅ Customer ${customerId} details updated`);
      
      res.json({
        success: true,
        customer: updatedCustomer
      });
    } catch (error) {
      console.error('❌ Error updating customer:', error);
      
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          success: false,
          error: 'Invalid request data',
          details: error.errors
        });
      }
      
      res.status(500).json({
        success: false,
        error: 'Failed to update customer'
      });
    }
  });

  // ============================================
  // PLATFORM ADMIN BRANDING SETTINGS
  // ============================================
  
  /**
   * Get platform branding settings
   */
  app.get("/platform-admin/branding", requirePlatformAdmin, async (req, res) => {
    try {
      console.log(`🎨 Platform admin requesting branding settings`);
      
      // Get branding settings (should be single row)
      const settings = await db
        .select()
        .from(sharedSchema.platformBrandingSettings)
        .limit(1);
      
      let brandingSettings = settings[0];
      
      // If no settings exist yet, create default settings
      if (!brandingSettings) {
        const newSettings = await db
          .insert(sharedSchema.platformBrandingSettings)
          .values({
            primaryColor: '#2460A9',
            secondaryColor: '#1E3A8A',
            accentColor: '#3B82F6',
            platformName: 'TPR Max',
            companyName: 'Your Company',
          })
          .returning();
        
        brandingSettings = newSettings[0];
        console.log(`✅ Created default branding settings`);
      }
      
      res.json({
        success: true,
        branding: brandingSettings
      });
    } catch (error) {
      console.error('❌ Error fetching branding settings:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch branding settings'
      });
    }
  });

  /**
   * Update platform branding settings
   */
  app.put("/platform-admin/branding", requirePlatformAdmin, async (req, res) => {
    try {
      console.log(`🎨 Platform admin updating branding settings`);
      
      const { primaryColor, secondaryColor, accentColor, logoUrl, faviconUrl, platformName, companyName } = req.body;
      
      // Get existing settings
      const existing = await db
        .select()
        .from(sharedSchema.platformBrandingSettings)
        .limit(1);
      
      let updatedSettings;
      
      if (existing.length === 0) {
        // Create new settings
        const newSettings = await db
          .insert(sharedSchema.platformBrandingSettings)
          .values({
            primaryColor: primaryColor || '#2460A9',
            secondaryColor: secondaryColor || '#1E3A8A',
            accentColor: accentColor || '#3B82F6',
            logoUrl,
            faviconUrl,
            platformName: platformName || 'TPR Max',
            companyName: companyName || 'Your Company',
            updatedBy: req.session.platformAdminId,
          })
          .returning();
        
        updatedSettings = newSettings[0];
      } else {
        // Update existing settings
        const updated = await db
          .update(sharedSchema.platformBrandingSettings)
          .set({
            primaryColor: primaryColor || existing[0].primaryColor,
            secondaryColor: secondaryColor || existing[0].secondaryColor,
            accentColor: accentColor || existing[0].accentColor,
            logoUrl: logoUrl !== undefined ? logoUrl : existing[0].logoUrl,
            faviconUrl: faviconUrl !== undefined ? faviconUrl : existing[0].faviconUrl,
            platformName: platformName || existing[0].platformName,
            companyName: companyName || existing[0].companyName,
            updatedAt: sql`NOW()`,
            updatedBy: req.session.platformAdminId,
          })
          .where(eq(sharedSchema.platformBrandingSettings.id, existing[0].id))
          .returning();
        
        updatedSettings = updated[0];
      }
      
      console.log(`✅ Branding settings updated successfully`);
      
      res.json({
        success: true,
        branding: updatedSettings
      });
    } catch (error) {
      console.error('❌ Error updating branding settings:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to update branding settings'
      });
    }
  });

  app.post("/platform-admin/branding/upload-logo", requirePlatformAdmin, upload.single('logo'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          error: 'No logo file uploaded'
        });
      }

      // Validate file type (images only)
      const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'];
      if (!allowedMimeTypes.includes(req.file.mimetype)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid file type. Only images (JPEG, PNG, GIF, WebP, SVG) are allowed.'
        });
      }

      // Validate file size (max 5MB)
      const maxSize = 5 * 1024 * 1024; // 5MB
      if (req.file.size > maxSize) {
        return res.status(400).json({
          success: false,
          error: 'File too large. Maximum size is 5MB.'
        });
      }

      console.log(`📤 Uploading platform logo: ${req.file.originalname} (${req.file.mimetype}, ${req.file.size} bytes)`);

      const path = await import('path');
      const { objectStorageClient } = await import('../objectStorage');

      // Sanitize filename and upload to object storage in public directory
      const ext = path.default.extname(req.file.originalname).toLowerCase();
      const fileName = `platform-logo-${Date.now()}${ext}`;
      const bucketName = 'replit-objstore-9ec67884-ec26-4167-84d1-c8ceecee21b7';
      const objectName = `public/${fileName}`;

      // Upload to object storage using Google Cloud Storage API
      const bucket = objectStorageClient.bucket(bucketName);
      const file = bucket.file(objectName);
      
      await file.save(req.file.buffer, {
        metadata: {
          contentType: req.file.mimetype,
        },
      });

      // Return just the filename - the frontend will use /public-objects/ prefix
      const logoUrl = fileName;

      console.log(`✅ Logo uploaded successfully to object storage: ${fileName}`);

      res.json({
        success: true,
        logoUrl
      });
    } catch (error) {
      console.error('❌ Error uploading logo:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to upload logo'
      });
    }
  });

  /**
   * Reset customer admin credentials
   */
  app.patch("/platform-admin/customers/:customerId/credentials", requirePlatformAdmin, async (req, res) => {
    try {
      const { customerId } = req.params;
      const { username, password } = req.body;

      if (!username && !password) {
        return res.status(400).json({
          success: false,
          error: 'Username or password required'
        });
      }

      // Get customer to find their database
      const customers = await db
        .select()
        .from(sharedSchema.customers)
        .where(eq(sharedSchema.customers.id, customerId))
        .limit(1);

      const customer = customers[0];

      if (!customer) {
        return res.status(404).json({
          success: false,
          error: 'Customer not found'
        });
      }

      // Use CustomerDatabaseService for proper schema isolation and retry logic
      const customerDbService = CustomerDatabaseService.getInstance();
      const customerDb = await customerDbService.getCustomerDatabase(customerId);

      // Step 1: Find the customer's primary admin user (role = admin, ordered by created_at)
      const adminUsers = await customerDb
        .select({ id: isolatedSchema.users.id, username: isolatedSchema.users.username })
        .from(isolatedSchema.users)
        .where(eq(isolatedSchema.users.role, 'admin'))
        .orderBy(isolatedSchema.users.createdAt)
        .limit(1);

      // Fallback: if no admin role found, take the first user ever created
      const [adminUser] = adminUsers.length > 0 ? adminUsers : await customerDb
        .select({ id: isolatedSchema.users.id, username: isolatedSchema.users.username })
        .from(isolatedSchema.users)
        .orderBy(isolatedSchema.users.createdAt)
        .limit(1);

      if (!adminUser) {
        return res.status(404).json({ success: false, error: 'No admin user found for this customer' });
      }

      // Step 2: If the requested username matches what they already have, skip username change
      // to avoid a redundant UPDATE that could still trigger the constraint in some DB setups
      const updateData: any = {};
      if (username && username !== adminUser.username) updateData.username = username;
      if (password) updateData.password = await bcrypt.hash(password, 10);

      if (Object.keys(updateData).length === 0) {
        // Nothing actually changed
        return res.json({ success: true, message: 'No changes to apply' });
      }

      // Step 3: Update by explicit ID (avoids any subquery / search_path ambiguity)
      await customerDb
        .update(isolatedSchema.users)
        .set(updateData)
        .where(eq(isolatedSchema.users.id, adminUser.id));

      console.log(`✅ Customer admin credentials updated for ${customer.companyName}`);

      res.json({
        success: true,
        message: 'Credentials updated successfully'
      });
    } catch (error: any) {
      console.error('❌ Error updating customer credentials:', error);
      // Give a clear message if the username is already taken by another user
      if (error?.code === '23505' && error?.constraint?.includes('username')) {
        return res.status(409).json({
          success: false,
          error: 'That username is already in use. Please choose a different username.'
        });
      }
      res.status(500).json({
        success: false,
        error: 'Failed to update credentials'
      });
    }
  });

  // Platform admin: read per-customer feature flags
  app.get("/platform-admin/customers/:customerId/features", requirePlatformAdmin, async (req, res) => {
    try {
      const { customerId } = req.params;
      const settings = await simpleDatabaseService.getCompanySettings({ customerId, customerName: '' });
      res.json({ featurePPM: settings?.featurePPM ?? false });
    } catch (error) {
      res.status(500).json({ success: false, error: 'Failed to fetch customer features' });
    }
  });

  // Platform admin: update per-customer feature flags
  app.patch("/platform-admin/customers/:customerId/features", requirePlatformAdmin, async (req, res) => {
    try {
      const { customerId } = req.params;
      const { featurePPM } = z.object({ featurePPM: z.boolean() }).parse(req.body);

      const custDb = await customerDbService.getCustomerDatabase(customerId);
      const schemaName = customerDbService.generateSchemaName(customerId);
      if (!/^[a-z0-9_]{3,63}$/.test(schemaName)) {
        throw new Error('Invalid schema name');
      }
      await custDb.execute(sql.raw(`UPDATE "${schemaName}".company_settings SET feature_ppm = ${featurePPM}`));

      res.json({ success: true, featurePPM });
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ success: false, error: 'featurePPM must be a boolean' });
      }
      res.status(500).json({ success: false, error: 'Failed to update customer features' });
    }
  });

  app.get("/platform-admin/admins", requirePlatformAdmin, async (req, res) => {
    try {
      const admins = await db
        .select({
          id: sharedSchema.platformAdmins.id,
          username: sharedSchema.platformAdmins.username,
          email: sharedSchema.platformAdmins.email,
          firstName: sharedSchema.platformAdmins.firstName,
          lastName: sharedSchema.platformAdmins.lastName,
          role: sharedSchema.platformAdmins.role,
          isActive: sharedSchema.platformAdmins.isActive,
          lastLoginAt: sharedSchema.platformAdmins.lastLoginAt,
          createdAt: sharedSchema.platformAdmins.createdAt,
        })
        .from(sharedSchema.platformAdmins)
        .orderBy(sharedSchema.platformAdmins.createdAt);

      res.json({ success: true, admins });
    } catch (error) {
      console.error('Error fetching platform admins:', error);
      res.status(500).json({ error: 'Failed to fetch admins' });
    }
  });

  app.post("/platform-admin/admins", requirePlatformAdmin, async (req, res) => {
    try {
      const { username, email, password, firstName, lastName, role } = req.body;

      if (!username || !email || !password || !firstName || !lastName) {
        return res.status(400).json({ error: 'All fields are required' });
      }

      if (password.length < 8) {
        return res.status(400).json({ error: 'Password must be at least 8 characters' });
      }

      const existing = await db
        .select()
        .from(sharedSchema.platformAdmins)
        .where(eq(sharedSchema.platformAdmins.username, username))
        .limit(1);

      if (existing.length > 0) {
        return res.status(409).json({ error: 'Username already exists' });
      }

      const hashedPassword = await bcrypt.hash(password, 10);

      const [newAdmin] = await db
        .insert(sharedSchema.platformAdmins)
        .values({
          username,
          email,
          password: hashedPassword,
          firstName,
          lastName,
          role: role || 'admin',
        })
        .returning({
          id: sharedSchema.platformAdmins.id,
          username: sharedSchema.platformAdmins.username,
          email: sharedSchema.platformAdmins.email,
          firstName: sharedSchema.platformAdmins.firstName,
          lastName: sharedSchema.platformAdmins.lastName,
          role: sharedSchema.platformAdmins.role,
          isActive: sharedSchema.platformAdmins.isActive,
          createdAt: sharedSchema.platformAdmins.createdAt,
        });

      console.log(`✅ Platform admin created: ${username}`);
      res.json({ success: true, admin: newAdmin });
    } catch (error) {
      console.error('Error creating platform admin:', error);
      res.status(500).json({ error: 'Failed to create admin' });
    }
  });

  app.patch("/platform-admin/admins/:adminId", requirePlatformAdmin, async (req, res) => {
    try {
      const { adminId } = req.params;
      const { password, firstName, lastName, email, role } = req.body;

      const updateData: any = { updatedAt: new Date() };
      if (password) updateData.password = await bcrypt.hash(password, 10);
      if (firstName) updateData.firstName = firstName;
      if (lastName) updateData.lastName = lastName;
      if (email) updateData.email = email;
      if (role) updateData.role = role;

      const [updated] = await db
        .update(sharedSchema.platformAdmins)
        .set(updateData)
        .where(eq(sharedSchema.platformAdmins.id, adminId))
        .returning({
          id: sharedSchema.platformAdmins.id,
          username: sharedSchema.platformAdmins.username,
          email: sharedSchema.platformAdmins.email,
          firstName: sharedSchema.platformAdmins.firstName,
          lastName: sharedSchema.platformAdmins.lastName,
          role: sharedSchema.platformAdmins.role,
          isActive: sharedSchema.platformAdmins.isActive,
        });

      if (!updated) {
        return res.status(404).json({ error: 'Admin not found' });
      }

      console.log(`✅ Platform admin updated: ${updated.username}`);
      res.json({ success: true, admin: updated });
    } catch (error) {
      console.error('Error updating platform admin:', error);
      res.status(500).json({ error: 'Failed to update admin' });
    }
  });

  app.delete("/platform-admin/admins/:adminId", requirePlatformAdmin, async (req, res) => {
    try {
      const { adminId } = req.params;
      const currentAdminId = req.session.platformAdminId;

      if (adminId === currentAdminId) {
        return res.status(400).json({ error: 'Cannot delete your own account' });
      }

      const [deleted] = await db
        .delete(sharedSchema.platformAdmins)
        .where(eq(sharedSchema.platformAdmins.id, adminId))
        .returning({ id: sharedSchema.platformAdmins.id, username: sharedSchema.platformAdmins.username });

      if (!deleted) {
        return res.status(404).json({ error: 'Admin not found' });
      }

      console.log(`✅ Platform admin deleted: ${deleted.username}`);
      res.json({ success: true, message: `Admin ${deleted.username} deleted` });
    } catch (error) {
      console.error('Error deleting platform admin:', error);
      res.status(500).json({ error: 'Failed to delete admin' });
    }
  });
}
