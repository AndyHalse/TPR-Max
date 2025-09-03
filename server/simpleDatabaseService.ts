import { eq, and } from "drizzle-orm";
import { db } from "./db";
import type {
  CompanySettings,
  InsertCompanySettings,
} from "@shared/schema";
import * as schema from "@shared/schema";

export interface CustomerContext {
  customerId: string;
}

/**
 * SIMPLIFIED CUSTOMER-ISOLATED DATABASE SERVICE
 * 
 * Uses the same PostgreSQL database but enforces customer isolation
 * through the customerId field in all operations.
 * 
 * This is much simpler than the separate database approach and works
 * with the existing Replit PostgreSQL database.
 */
export class SimpleDatabaseService {
  
  /**
   * Create development customer context for testing
   */
  createDevelopmentContext(): CustomerContext {
    return {
      customerId: "dev-customer-001"
    };
  }

  /**
   * COMPANY SETTINGS METHODS - Customer Isolated
   */
  async getCompanySettings(context: CustomerContext): Promise<CompanySettings | undefined> {
    console.log(`🔍 Getting company settings for customer: ${context.customerId}`);
    
    const settings = await db
      .select()
      .from(schema.companySettings)
      .where(eq(schema.companySettings.customerId, context.customerId))
      .limit(1);
    
    return settings[0];
  }

  async updateCompanySettings(
    context: CustomerContext, 
    updates: Partial<InsertCompanySettings>
  ): Promise<CompanySettings | undefined> {
    console.log(`💾 Updating company settings for customer: ${context.customerId}`);
    
    // First, try to get existing settings
    const existing = await this.getCompanySettings(context);
    
    if (existing) {
      // Update existing settings
      const updated = await db
        .update(schema.companySettings)
        .set({ ...updates, updatedAt: new Date() })
        .where(and(
          eq(schema.companySettings.customerId, context.customerId),
          eq(schema.companySettings.id, existing.id)
        ))
        .returning();
      
      console.log(`✅ Updated company settings for customer: ${context.customerId}`);
      return updated[0];
    } else {
      // Create new settings for this customer
      const created = await db
        .insert(schema.companySettings)
        .values({
          customerId: context.customerId,
          companyName: "Default Company",
          ...updates,
        })
        .returning();
      
      console.log(`✅ Created new company settings for customer: ${context.customerId}`);
      return created[0];
    }
  }
}

// Export singleton instance
export const simpleDatabaseService = new SimpleDatabaseService();