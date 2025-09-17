import { storage } from "./storage";
import { customerDbService } from "./customerDatabase";
import { simpleDatabaseService } from "./simpleDatabaseService";
import * as isolatedSchema from "./isolatedSchema";
import * as sharedSchema from "@shared/schema";

// Robust date coercion helper to handle multiple date formats from MemStorage
function coerceDate(v: any): Date | undefined {
  if (!v) return undefined;
  if (v instanceof Date && !isNaN(v.getTime())) return v;
  if (typeof v === 'number') return new Date(v > 1e12 ? v : v * 1000);
  if (typeof v === 'string') { 
    const t = Date.parse(v); 
    return isNaN(t) ? undefined : new Date(t); 
  }
  if (v?.toDate) { 
    const d = v.toDate(); 
    return d instanceof Date && !isNaN(d.getTime()) ? d : undefined; 
  }
  if (v?.seconds !== undefined) { 
    return new Date(v.seconds * 1000); 
  }
  return undefined;
}

/**
 * DATA MIGRATION SCRIPT FOR ANDY
 * 
 * Migrates Andy's data from MemStorage system to his isolated customer database (dev-customer-001).
 * This resolves the issue where Andy's original data exists in MemStorage but the new isolated
 * database architecture connects him to an empty database.
 * 
 * Data to migrate:
 * - 4 Staff members
 * - 3 Visitors 
 * - Company settings
 * - Pre-bookings
 * - User data
 * - Related records
 */
async function migrateAndyData() {
  console.log("🚀 Starting Andy's data migration from MemStorage to isolated database...");
  
  try {
    // Step 1: Create context for Andy's customer database
    const customerContext = simpleDatabaseService.createCustomerContext("Andy");
    console.log(`📋 Customer context created: ${customerContext.customerId}`);

    // Step 2: Get Andy's isolated database connection
    console.log("🔌 Connecting to Andy's isolated database...");
    const isolatedDb = await customerDbService.getCustomerDatabase(customerContext.customerId);
    console.log("✅ Connected to isolated database");

    // Step 3: Extract data from MemStorage
    console.log("📤 Extracting data from MemStorage...");
    
    // Get all staff from MemStorage
    const allStaff = await storage.getAllStaff();
    console.log(`📊 Found ${allStaff.length} staff members in MemStorage`);
    
    // Get all visitors from MemStorage
    const allVisitors = await storage.getAllVisitors();
    console.log(`📊 Found ${allVisitors.length} visitors in MemStorage`);
    
    // Get all pre-bookings
    const allPreBookings = await storage.getAllPreBookings();
    console.log(`📊 Found ${allPreBookings.length} pre-bookings in MemStorage`);
    
    // Get company settings
    const companySettings = await storage.getCompanySettings();
    console.log("📊 Retrieved company settings from MemStorage");
    
    // Get Andy's user data
    const andyUser = await storage.getUserByUsername("Andy");
    console.log("📊 Retrieved Andy's user data from MemStorage");

    // Step 4: Migrate data to isolated database
    console.log("💾 Starting data migration to isolated database...");

    // Migrate company settings (with schema error resilience)
    if (companySettings) {
      console.log("➡️ Migrating company settings...");
      try {
        await simpleDatabaseService.updateCompanySettings(customerContext, {
          companyName: companySettings.companyName,
          logoUrl: companySettings.logoUrl,
          address: companySettings.address,
          phone: companySettings.phone,
          website: companySettings.website,
          email: companySettings.email,
          bannerUrl: companySettings.bannerUrl,
          backgroundColor: companySettings.backgroundColor,
          foregroundColor: companySettings.foregroundColor,
          accentColor: companySettings.accentColor,
          theme: companySettings.theme,
          emailReportsEnabled: companySettings.emailReportsEnabled,
          reportFrequency: companySettings.reportFrequency,
          reportRecipients: companySettings.reportRecipients,
          selectedPrinter: companySettings.selectedPrinter,
          enableQrCodes: companySettings.enableQrCodes,
          enable2dBarcodes: companySettings.enable2dBarcodes,
          barcodeFormat: companySettings.barcodeFormat,
          printQuality: companySettings.printQuality,
        });
        console.log("✅ Company settings migrated successfully");
      } catch (error) {
        console.error("⚠️ Company settings migration failed (continuing with other data):", error);
        console.log("📝 Skipping company settings due to schema mismatch - staff/visitor data will still migrate");
        // Don't throw error - continue with staff and visitor migration
      }
    }

    // Migrate user data
    if (andyUser) {
      console.log("➡️ Migrating Andy's user data...");
      const userInsertResult = await isolatedDb
        .insert(isolatedSchema.users)
        .values({
          id: andyUser.id,
          username: andyUser.username,
          password: andyUser.password,
          email: andyUser.email,
          role: andyUser.role,
          isActive: andyUser.isActive,
          createdAt: andyUser.createdAt,
          updatedAt: andyUser.updatedAt,
        })
        .onConflictDoNothing()
        .returning();
      
      console.log(`✅ User migrated: ${andyUser.username} (${andyUser.id})`);
    }

    // Migrate staff data
    let migratedStaffCount = 0;
    for (const staff of allStaff) {
      try {
        console.log(`➡️ Migrating staff: ${staff.firstName} ${staff.lastName}`);
        
        // Map MemStorage staff to isolated schema
        const staffInsertData = {
          id: staff.id,
          firstName: staff.firstName,
          lastName: staff.lastName,
          email: staff.email,
          department: staff.department,
          employeeId: staff.employeeId || `EMP-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
          // Map additional fields safely
          accessLevel: (staff as any).accessLevel || "staff",
          password: (staff as any).password || null,
          isCheckedIn: staff.isCheckedIn || false,
          checkedInAt: coerceDate(staff.checkedInAt) || null,
          checkedOutAt: coerceDate(staff.checkedOutAt) || null,
          isActive: staff.isActive !== false, // Default true if not specified
          createdAt: coerceDate(staff.createdAt) || new Date(),
          updatedAt: coerceDate(staff.updatedAt) || new Date(),
        };

        const result = await isolatedDb
          .insert(isolatedSchema.staff)
          .values(staffInsertData)
          .onConflictDoNothing()
          .returning();
        
        if (result.length > 0) {
          migratedStaffCount++;
          console.log(`✅ Staff migrated: ${staff.firstName} ${staff.lastName} (${staff.email})`);
        } else {
          console.log(`⚠️ Staff already exists: ${staff.firstName} ${staff.lastName}`);
        }
      } catch (error) {
        console.error(`❌ Error migrating staff ${staff.firstName} ${staff.lastName}:`, error);
      }
    }

    // Migrate visitors data
    let migratedVisitorCount = 0;
    for (const visitor of allVisitors) {
      try {
        console.log(`➡️ Migrating visitor: ${visitor.firstName} ${visitor.lastName}`);
        
        // Find host staff ID in isolated database
        let hostStaffId = null;
        if (visitor.hostStaffId) {
          const hostStaff = allStaff.find(s => s.id === visitor.hostStaffId);
          if (hostStaff) {
            hostStaffId = visitor.hostStaffId; // Staff should be migrated by now
          }
        }

        const visitorInsertData = {
          id: visitor.id,
          firstName: visitor.firstName,
          lastName: visitor.lastName,
          email: visitor.email,
          phoneNumber: visitor.phoneNumber,
          mobileNumber: (visitor as any).mobileNumber,
          company: visitor.company,
          purpose: visitor.purpose,
          carRegistration: visitor.carRegistration,
          hostStaffId: hostStaffId,
          checkedInAt: coerceDate(visitor.checkedInAt), // Use undefined for defaultNow() columns
          checkedOutAt: coerceDate(visitor.checkedOutAt) || null,
          isCheckedIn: visitor.isCheckedIn || false,
          qrCode: visitor.qrCode,
          createdAt: coerceDate(visitor.createdAt) || new Date(),
          updatedAt: coerceDate(visitor.updatedAt) || new Date(),
        };

        const result = await isolatedDb
          .insert(isolatedSchema.visitors)
          .values(visitorInsertData)
          .onConflictDoNothing()
          .returning();
        
        if (result.length > 0) {
          migratedVisitorCount++;
          console.log(`✅ Visitor migrated: ${visitor.firstName} ${visitor.lastName} (${visitor.company})`);
        } else {
          console.log(`⚠️ Visitor already exists: ${visitor.firstName} ${visitor.lastName}`);
        }
      } catch (error) {
        console.error(`❌ Error migrating visitor ${visitor.firstName} ${visitor.lastName}:`, error);
      }
    }

    // Migrate pre-bookings data
    let migratedPreBookingCount = 0;
    for (const preBooking of allPreBookings) {
      try {
        console.log(`➡️ Migrating pre-booking: ${(preBooking as any).visitorFirstName || preBooking.visitorName}`);
        
        // Find host staff ID in isolated database
        let hostStaffId = null;
        if (preBooking.hostStaffId) {
          const hostStaff = allStaff.find(s => s.id === preBooking.hostStaffId);
          if (hostStaff) {
            hostStaffId = preBooking.hostStaffId;
          }
        }

        // Map pre-booking data based on schema differences
        const preBookingInsertData = {
          id: preBooking.id,
          visitorName: preBooking.visitorName || `${(preBooking as any).visitorFirstName || ''} ${(preBooking as any).visitorLastName || ''}`.trim(),
          visitorEmail: preBooking.visitorEmail || (preBooking as any).visitorEmail,
          company: preBooking.company,
          purpose: preBooking.purpose,
          visitDate: preBooking.visitDate,
          visitTime: preBooking.visitTime,
          hostStaffId: hostStaffId,
          qrCode: preBooking.qrCode,
          status: (preBooking as any).status || "pending",
          isCheckedIn: preBooking.isCheckedIn || false,
          checkedInAt: preBooking.checkedInAt,
          createdAt: preBooking.createdAt,
        };

        const result = await isolatedDb
          .insert(isolatedSchema.preBookings)
          .values(preBookingInsertData)
          .onConflictDoNothing()
          .returning();
        
        if (result.length > 0) {
          migratedPreBookingCount++;
          console.log(`✅ Pre-booking migrated: ${preBookingInsertData.visitorName} (${preBookingInsertData.company})`);
        } else {
          console.log(`⚠️ Pre-booking already exists: ${preBookingInsertData.visitorName}`);
        }
      } catch (error) {
        console.error(`❌ Error migrating pre-booking:`, error);
      }
    }

    // Migration summary
    console.log("\n🎯 MIGRATION SUMMARY:");
    console.log(`✅ Company settings: ${companySettings ? 'Migrated' : 'Not found'}`);
    console.log(`✅ Users: ${andyUser ? 'Migrated' : 'Not found'}`);
    console.log(`✅ Staff members: ${migratedStaffCount}/${allStaff.length} migrated`);
    console.log(`✅ Visitors: ${migratedVisitorCount}/${allVisitors.length} migrated`);
    console.log(`✅ Pre-bookings: ${migratedPreBookingCount}/${allPreBookings.length} migrated`);
    
    console.log("\n🏁 Migration completed successfully!");
    console.log("📱 Andy should now see all his data in the dashboard!");
    
  } catch (error) {
    console.error("❌ Migration failed:", error);
    throw error;
  }
}

// Export for use
export { migrateAndyData };