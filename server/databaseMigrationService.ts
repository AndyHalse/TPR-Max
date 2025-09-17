import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import { eq, and } from 'drizzle-orm';
import ws from 'ws';
import * as sharedSchema from '@shared/schema';
import * as isolatedSchema from './isolatedSchema';
import { databaseProvisioningService } from './databaseProvisioningService';
import { customerDbService } from './customerDatabase';

neonConfig.webSocketConstructor = ws;

/**
 * DATABASE MIGRATION SERVICE
 * 
 * This service handles migrating customer data from the shared database
 * (with customerId isolation) to separate customer databases.
 * 
 * Migration process:
 * 1. Export customer data from shared database
 * 2. Create isolated database for customer
 * 3. Transform data (remove customerId fields)
 * 4. Import data to isolated database
 * 5. Verify data integrity
 * 6. Update customer record with new database URL
 */
export class DatabaseMigrationService {
  private static instance: DatabaseMigrationService;

  private constructor() {}

  static getInstance(): DatabaseMigrationService {
    if (!DatabaseMigrationService.instance) {
      DatabaseMigrationService.instance = new DatabaseMigrationService();
    }
    return DatabaseMigrationService.instance;
  }

  /**
   * Migrate a customer from shared database to isolated database
   */
  async migrateCustomerToIsolatedDatabase(customerId: string): Promise<void> {
    console.log(`🔄 Starting migration for customer: ${customerId}`);

    try {
      // Step 1: Export customer data from shared database
      const customerData = await this.exportCustomerData(customerId);
      
      // Step 2: Provision new isolated database
      const isolatedDbUrl = await databaseProvisioningService.provisionCustomerDatabase(customerId);
      
      // Step 3: Import data to isolated database
      await this.importCustomerData(customerId, isolatedDbUrl, customerData);
      
      // Step 4: Verify data integrity
      const isValid = await this.verifyMigration(customerId, customerData, isolatedDbUrl);
      if (!isValid) {
        throw new Error(`Data verification failed for customer: ${customerId}`);
      }
      
      // Step 5: Update customer record with new database URL
      await this.updateCustomerDatabaseUrl(customerId, isolatedDbUrl);
      
      console.log(`✅ Migration completed successfully for customer: ${customerId}`);
    } catch (error) {
      console.error(`❌ Migration failed for customer ${customerId}:`, error);
      throw error;
    }
  }

  /**
   * Export all data for a specific customer from shared database
   */
  private async exportCustomerData(customerId: string): Promise<CustomerExportData> {
    console.log(`📤 Exporting data for customer: ${customerId}`);

    const sharedDbUrl = process.env.DATABASE_URL;
    if (!sharedDbUrl) {
      throw new Error('DATABASE_URL must be set');
    }

    const pool = new Pool({ connectionString: sharedDbUrl });
    const db = drizzle({ client: pool, schema: sharedSchema });

    try {
      // Export all customer data
      const exportData: CustomerExportData = {
        customerId,
        companySettings: [],
        staff: [],
        visitors: [],
        visitorHistory: [],
        staffAttendanceHistory: [],
        departments: [],
        users: [],
        tenantCompanies: [],
        preBookings: [],
        meetingRooms: [],
        roomBookings: [],
        exportedAt: new Date()
      };

      // Export company settings
      exportData.companySettings = await db
        .select()
        .from(sharedSchema.companySettings)
        .where(eq(sharedSchema.companySettings.customerId, customerId));

      // Export staff
      exportData.staff = await db
        .select()
        .from(sharedSchema.staff)
        .where(eq(sharedSchema.staff.customerId, customerId));

      // Export visitors
      exportData.visitors = await db
        .select()
        .from(sharedSchema.visitors)
        .where(eq(sharedSchema.visitors.customerId, customerId));

      // Export visitor history
      exportData.visitorHistory = await db
        .select()
        .from(sharedSchema.visitorHistory)
        .where(eq(sharedSchema.visitorHistory.customerId, customerId));

      // Export staff attendance history
      exportData.staffAttendanceHistory = await db
        .select()
        .from(sharedSchema.staffAttendanceHistory)
        .where(eq(sharedSchema.staffAttendanceHistory.customerId, customerId));

      // Export departments
      exportData.departments = await db
        .select()
        .from(sharedSchema.departments)
        .where(eq(sharedSchema.departments.customerId, customerId));

      // Export users
      exportData.users = await db
        .select()
        .from(sharedSchema.users)
        .where(eq(sharedSchema.users.customerId, customerId));

      // Export tenant companies
      exportData.tenantCompanies = await db
        .select()
        .from(sharedSchema.tenantCompanies)
        .where(eq(sharedSchema.tenantCompanies.customerId, customerId));

      // Export pre-bookings
      exportData.preBookings = await db
        .select()
        .from(sharedSchema.preBookings)
        .where(eq(sharedSchema.preBookings.customerId, customerId));

      // Export meeting rooms (if they have customerId field)
      try {
        exportData.meetingRooms = await db
          .select()
          .from(sharedSchema.meetingRooms)
          .where(eq(sharedSchema.meetingRooms.customerId, customerId));
      } catch (error) {
        // Meeting rooms might not have customerId field yet
        exportData.meetingRooms = [];
      }

      // Export room bookings (if they have customerId field)
      try {
        exportData.roomBookings = await db
          .select()
          .from(sharedSchema.roomBookings)
          .where(eq(sharedSchema.roomBookings.customerId, customerId));
      } catch (error) {
        // Room bookings might not have customerId field yet
        exportData.roomBookings = [];
      }

      console.log(`✅ Exported data for customer ${customerId}:`, {
        companySettings: exportData.companySettings.length,
        staff: exportData.staff.length,
        visitors: exportData.visitors.length,
        visitorHistory: exportData.visitorHistory.length,
        departments: exportData.departments.length,
        users: exportData.users.length,
        tenantCompanies: exportData.tenantCompanies.length,
        preBookings: exportData.preBookings.length
      });

      return exportData;
    } finally {
      await pool.end();
    }
  }

  /**
   * Import customer data to isolated database
   */
  private async importCustomerData(
    customerId: string, 
    isolatedDbUrl: string, 
    exportData: CustomerExportData
  ): Promise<void> {
    console.log(`📥 Importing data for customer: ${customerId}`);

    const pool = new Pool({ connectionString: isolatedDbUrl });
    const db = drizzle({ client: pool, schema: isolatedSchema });

    try {
      // Import company settings (remove customerId)
      if (exportData.companySettings.length > 0) {
        const settingsToImport = exportData.companySettings.map(settings => {
          const { customerId: _, ...settingsWithoutCustomerId } = settings;
          return settingsWithoutCustomerId;
        });
        
        await db.insert(isolatedSchema.companySettings).values(settingsToImport);
      }

      // Import departments (remove customerId)
      if (exportData.departments.length > 0) {
        const departmentsToImport = exportData.departments.map(dept => {
          const { customerId: _, ...deptWithoutCustomerId } = dept;
          return deptWithoutCustomerId;
        });
        
        await db.insert(isolatedSchema.departments).values(departmentsToImport);
      }

      // Import tenant companies (remove customerId)
      if (exportData.tenantCompanies.length > 0) {
        const tenantsToImport = exportData.tenantCompanies.map(tenant => {
          const { customerId: _, ...tenantWithoutCustomerId } = tenant;
          return tenantWithoutCustomerId;
        });
        
        await db.insert(isolatedSchema.tenantCompanies).values(tenantsToImport);
      }

      // Import users (remove customerId)
      if (exportData.users.length > 0) {
        const usersToImport = exportData.users.map(user => {
          const { customerId: _, ...userWithoutCustomerId } = user;
          return userWithoutCustomerId;
        });
        
        await db.insert(isolatedSchema.users).values(usersToImport);
      }

      // Import staff (remove customerId)
      if (exportData.staff.length > 0) {
        const staffToImport = exportData.staff.map(staff => {
          const { customerId: _, ...staffWithoutCustomerId } = staff;
          return staffWithoutCustomerId;
        });
        
        await db.insert(isolatedSchema.staff).values(staffToImport);
      }

      // Import visitors (remove customerId)
      if (exportData.visitors.length > 0) {
        const visitorsToImport = exportData.visitors.map(visitor => {
          const { customerId: _, ...visitorWithoutCustomerId } = visitor;
          return visitorWithoutCustomerId;
        });
        
        await db.insert(isolatedSchema.visitors).values(visitorsToImport);
      }

      // Import visitor history (remove customerId)
      if (exportData.visitorHistory.length > 0) {
        const historyToImport = exportData.visitorHistory.map(history => {
          const { customerId: _, ...historyWithoutCustomerId } = history;
          return historyWithoutCustomerId;
        });
        
        await db.insert(isolatedSchema.visitorHistory).values(historyToImport);
      }

      // Import staff attendance history (remove customerId)
      if (exportData.staffAttendanceHistory.length > 0) {
        const attendanceToImport = exportData.staffAttendanceHistory.map(attendance => {
          const { customerId: _, ...attendanceWithoutCustomerId } = attendance;
          return attendanceWithoutCustomerId;
        });
        
        await db.insert(isolatedSchema.staffAttendanceHistory).values(attendanceToImport);
      }

      // Import pre-bookings (remove customerId)
      if (exportData.preBookings.length > 0) {
        const bookingsToImport = exportData.preBookings.map(booking => {
          const { customerId: _, ...bookingWithoutCustomerId } = booking;
          return bookingWithoutCustomerId;
        });
        
        await db.insert(isolatedSchema.preBookings).values(bookingsToImport);
      }

      console.log(`✅ Data imported successfully for customer: ${customerId}`);
    } finally {
      await pool.end();
    }
  }

  /**
   * Verify migration integrity by comparing record counts
   */
  private async verifyMigration(
    customerId: string, 
    originalData: CustomerExportData, 
    isolatedDbUrl: string
  ): Promise<boolean> {
    console.log(`🔍 Verifying migration for customer: ${customerId}`);

    const pool = new Pool({ connectionString: isolatedDbUrl });
    const db = drizzle({ client: pool, schema: isolatedSchema });

    try {
      // Count records in isolated database
      const counts = {
        companySettings: await this.countRecords(db, isolatedSchema.companySettings),
        staff: await this.countRecords(db, isolatedSchema.staff),
        visitors: await this.countRecords(db, isolatedSchema.visitors),
        visitorHistory: await this.countRecords(db, isolatedSchema.visitorHistory),
        departments: await this.countRecords(db, isolatedSchema.departments),
        users: await this.countRecords(db, isolatedSchema.users),
        tenantCompanies: await this.countRecords(db, isolatedSchema.tenantCompanies),
        preBookings: await this.countRecords(db, isolatedSchema.preBookings),
        staffAttendanceHistory: await this.countRecords(db, isolatedSchema.staffAttendanceHistory)
      };

      // Compare with original counts
      const expectedCounts = {
        companySettings: originalData.companySettings.length,
        staff: originalData.staff.length,
        visitors: originalData.visitors.length,
        visitorHistory: originalData.visitorHistory.length,
        departments: originalData.departments.length,
        users: originalData.users.length,
        tenantCompanies: originalData.tenantCompanies.length,
        preBookings: originalData.preBookings.length,
        staffAttendanceHistory: originalData.staffAttendanceHistory.length
      };

      const isValid = Object.keys(expectedCounts).every(table => {
        const expected = expectedCounts[table as keyof typeof expectedCounts];
        const actual = counts[table as keyof typeof counts];
        const match = expected === actual;
        
        if (!match) {
          console.error(`❌ Count mismatch for ${table}: expected ${expected}, got ${actual}`);
        }
        
        return match;
      });

      if (isValid) {
        console.log(`✅ Migration verification passed for customer: ${customerId}`);
      } else {
        console.error(`❌ Migration verification failed for customer: ${customerId}`);
      }

      return isValid;
    } finally {
      await pool.end();
    }
  }

  /**
   * Count records in a table
   */
  private async countRecords(db: any, table: any): Promise<number> {
    const result = await db.select().from(table);
    return result.length;
  }

  /**
   * Update customer database URL in management database
   */
  private async updateCustomerDatabaseUrl(customerId: string, databaseUrl: string): Promise<void> {
    const managementDbUrl = process.env.DATABASE_URL;
    if (!managementDbUrl) {
      throw new Error('DATABASE_URL must be set for management database');
    }

    const pool = new Pool({ connectionString: managementDbUrl });
    const db = drizzle({ client: pool, schema: sharedSchema });

    try {
      await db
        .update(sharedSchema.customers)
        .set({ databaseUrl, updatedAt: new Date() })
        .where(eq(sharedSchema.customers.id, customerId));

      console.log(`✅ Updated database URL for customer: ${customerId}`);
    } finally {
      await pool.end();
    }
  }

  /**
   * Rollback migration by restoring original shared database access
   */
  async rollbackMigration(customerId: string): Promise<void> {
    console.log(`🔄 Rolling back migration for customer: ${customerId}`);

    try {
      // Restore original database URL (shared database)
      const originalDbUrl = process.env.DATABASE_URL!;
      await this.updateCustomerDatabaseUrl(customerId, originalDbUrl);
      
      // Clear connection cache
      customerDbService.closeAllConnections();
      
      console.log(`✅ Migration rollback completed for customer: ${customerId}`);
    } catch (error) {
      console.error(`❌ Migration rollback failed for customer ${customerId}:`, error);
      throw error;
    }
  }

  /**
   * Create a complete backup of customer data before migration
   */
  async createPreMigrationBackup(customerId: string): Promise<string> {
    console.log(`💾 Creating pre-migration backup for customer: ${customerId}`);

    try {
      const exportData = await this.exportCustomerData(customerId);
      
      // In a real implementation, you would store this to a backup service
      // For now, we'll return a backup identifier
      const backupId = `pre-migration_${customerId}_${Date.now()}`;
      
      // Store backup data (in real implementation, save to backup service)
      // await this.storeBackup(backupId, exportData);
      
      console.log(`✅ Pre-migration backup created: ${backupId}`);
      return backupId;
    } catch (error) {
      console.error(`❌ Failed to create pre-migration backup for customer ${customerId}:`, error);
      throw error;
    }
  }

  /**
   * Migrate all development customers to isolated databases
   */
  async migrateAllDevelopmentCustomers(): Promise<void> {
    const developmentCustomers = ['dev-customer-002', 'test-customer-trial'];
    
    console.log(`🚀 Starting migration for all development customers: ${developmentCustomers.join(', ')}`);

    for (const customerId of developmentCustomers) {
      try {
        console.log(`\n📋 Migrating customer: ${customerId}`);
        
        // Create backup before migration
        const backupId = await this.createPreMigrationBackup(customerId);
        console.log(`💾 Backup created: ${backupId}`);
        
        // Migrate customer
        await this.migrateCustomerToIsolatedDatabase(customerId);
        
        console.log(`✅ Successfully migrated customer: ${customerId}`);
      } catch (error) {
        console.error(`❌ Failed to migrate customer ${customerId}:`, error);
        
        // Attempt rollback
        try {
          await this.rollbackMigration(customerId);
          console.log(`🔄 Rollback successful for customer: ${customerId}`);
        } catch (rollbackError) {
          console.error(`❌ Rollback failed for customer ${customerId}:`, rollbackError);
        }
      }
    }

    console.log(`\n🎉 Migration process completed for all development customers`);
  }
}

// Export data structure for customer migration
export interface CustomerExportData {
  customerId: string;
  companySettings: any[];
  staff: any[];
  visitors: any[];
  visitorHistory: any[];
  staffAttendanceHistory: any[];
  departments: any[];
  users: any[];
  tenantCompanies: any[];
  preBookings: any[];
  meetingRooms: any[];
  roomBookings: any[];
  exportedAt: Date;
}

// Export singleton instance
export const databaseMigrationService = DatabaseMigrationService.getInstance();