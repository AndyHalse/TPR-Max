import { storage } from "./storage";
import { customerDbService } from "./customerDatabase";
import * as isolatedSchema from "./isolatedSchema";

/**
 * SIMPLE MIGRATION RUNNER
 * 
 * This is a direct migration utility that can be easily run
 * to migrate Andy's data from MemStorage to isolated database.
 */
async function runMigration() {
  console.log("🚀 Starting migration of Andy's data...");
  
  try {
    // Step 1: Get Andy's isolated database
    const customerId = "dev-customer-001"; // Andy's customer ID
    const isolatedDb = await customerDbService.getCustomerDatabase(customerId);
    console.log("✅ Connected to isolated database");

    // Step 2: Get all data from MemStorage
    const allStaff = await storage.getAllStaff();
    const allVisitors = await storage.getAllVisitors();
    const companySettings = await storage.getCompanySettings();
    const allPreBookings = await storage.getAllPreBookings();
    
    console.log(`📊 MemStorage data: ${allStaff.length} staff, ${allVisitors.length} visitors, ${allPreBookings.length} prebookings`);

    // Step 3: Migrate company settings
    if (companySettings) {
      const existingSettings = await isolatedDb.select().from(isolatedSchema.companySettings).limit(1);
      if (existingSettings.length === 0) {
        await isolatedDb.insert(isolatedSchema.companySettings).values({
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
        console.log("✅ Company settings migrated");
      }
    }

    // Step 4: Migrate staff
    let staffMigrated = 0;
    for (const staff of allStaff) {
      try {
        await isolatedDb.insert(isolatedSchema.staff).values({
          id: staff.id,
          firstName: staff.firstName,
          lastName: staff.lastName,
          email: staff.email,
          department: staff.department,
          employeeId: staff.employeeId || `EMP-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
          accessLevel: "staff",
          isCheckedIn: staff.isCheckedIn || false,
          checkedInAt: staff.checkedInAt,
          checkedOutAt: staff.checkedOutAt,
          isActive: staff.isActive !== false,
          createdAt: staff.createdAt,
          updatedAt: staff.updatedAt,
        }).onConflictDoNothing();
        staffMigrated++;
        console.log(`✅ Migrated staff: ${staff.firstName} ${staff.lastName}`);
      } catch (error) {
        console.error(`❌ Error migrating staff ${staff.firstName} ${staff.lastName}:`, error);
      }
    }

    // Step 5: Migrate visitors
    let visitorsMigrated = 0;
    for (const visitor of allVisitors) {
      try {
        // Find host staff ID
        let hostStaffId = null;
        if (visitor.hostStaffId) {
          const hostStaff = allStaff.find(s => s.id === visitor.hostStaffId);
          if (hostStaff) {
            hostStaffId = visitor.hostStaffId;
          }
        }

        await isolatedDb.insert(isolatedSchema.visitors).values({
          id: visitor.id,
          firstName: visitor.firstName,
          lastName: visitor.lastName,
          email: visitor.email,
          phoneNumber: visitor.phoneNumber,
          company: visitor.company,
          purpose: visitor.purpose,
          carRegistration: visitor.carRegistration,
          hostStaffId: hostStaffId,
          checkedInAt: visitor.checkedInAt,
          checkedOutAt: visitor.checkedOutAt,
          isCheckedIn: visitor.isCheckedIn || false,
          qrCode: visitor.qrCode,
          createdAt: visitor.createdAt || new Date(),
          updatedAt: visitor.updatedAt || new Date(),
        }).onConflictDoNothing();
        visitorsMigrated++;
        console.log(`✅ Migrated visitor: ${visitor.firstName} ${visitor.lastName}`);
      } catch (error) {
        console.error(`❌ Error migrating visitor ${visitor.firstName} ${visitor.lastName}:`, error);
      }
    }

    // Step 6: Migrate prebookings
    let prebookingsMigrated = 0;
    for (const preBooking of allPreBookings) {
      try {
        // Find host staff ID
        let hostStaffId = null;
        if (preBooking.hostStaffId) {
          const hostStaff = allStaff.find(s => s.id === preBooking.hostStaffId);
          if (hostStaff) {
            hostStaffId = preBooking.hostStaffId;
          }
        }

        const visitorName = preBooking.visitorName || 
          `${(preBooking as any).visitorFirstName || ''} ${(preBooking as any).visitorLastName || ''}`.trim();

        await isolatedDb.insert(isolatedSchema.preBookings).values({
          id: preBooking.id,
          visitorName: visitorName,
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
        }).onConflictDoNothing();
        prebookingsMigrated++;
        console.log(`✅ Migrated prebooking: ${visitorName}`);
      } catch (error) {
        console.error(`❌ Error migrating prebooking:`, error);
      }
    }

    // Migration Summary
    console.log("\n🎯 MIGRATION COMPLETE!");
    console.log(`✅ Staff: ${staffMigrated}/${allStaff.length}`);
    console.log(`✅ Visitors: ${visitorsMigrated}/${allVisitors.length}`);
    console.log(`✅ Pre-bookings: ${prebookingsMigrated}/${allPreBookings.length}`);
    console.log("\n🎉 Andy's data has been successfully migrated to isolated database!");

    return {
      success: true,
      staffMigrated,
      visitorsMigrated,
      prebookingsMigrated
    };

  } catch (error) {
    console.error("❌ Migration failed:", error);
    throw error;
  }
}

export { runMigration };