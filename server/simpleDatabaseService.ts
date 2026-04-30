import { eq, and, sql } from "drizzle-orm";
import { db } from "./db";
import type {
  CompanySettings,
  InsertCompanySettings,
} from "./isolatedSchema";
import * as schema from "@shared/schema";
import * as isolatedSchema from "./isolatedSchema";
import { customerDbService } from "./customerDatabase";
import { logger } from './utils/logger';

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
   * Create customer context from session customerId (preferred) or username fallback
   */
  createCustomerContext(usernameOrCustomerId: string, sessionCustomerId?: string): CustomerContext {
    if (sessionCustomerId) {
      return { customerId: sessionCustomerId };
    }
    
    if (usernameOrCustomerId && usernameOrCustomerId.includes('-')) {
      return { customerId: usernameOrCustomerId };
    }
    
    const customerMapping: { [key: string]: string } = {
      "Andy": "dev-customer-001",
      "Emma": "dev-customer-002",
      "TestUser": "test-customer-trial"
    };
    
    const customerId = customerMapping[usernameOrCustomerId] || "dev-customer-001";
    
    return {
      customerId
    };
  }

  /**
   * COMPANY SETTINGS METHODS - Customer Isolated
   */
  async getCompanySettings(context: CustomerContext): Promise<CompanySettings | undefined> {
    logger.info(`🔍 Getting company settings for customer: ${context.customerId}`);
    
    const schemaName = customerDbService.generateSchemaName(context.customerId);
    
    try {
      const customerDb = await customerDbService.getCustomerDatabase(context.customerId);
      
      const rawResult = await customerDb.execute(sql`
        SELECT * FROM ${sql.identifier(schemaName)}.company_settings LIMIT 1
      `);
      
      if (!rawResult.rows || rawResult.rows.length === 0) {
        logger.info(`⚠️ No company settings found in schema ${schemaName} for ${context.customerId}`);
        return undefined;
      }
      
      const row = rawResult.rows[0] as any;
      logger.info(`📋 Company settings loaded: "${row.company_name}" for customer ${context.customerId} from schema ${schemaName}`);
      
      const mapped: any = {};
      for (const [key, value] of Object.entries(row)) {
        const camelKey = key.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
        mapped[camelKey] = value;
      }

      // The camelCase regex cannot handle columns whose DB name uses only lowercase
      // abbreviations (e.g. feature_ppm → featurePpm, not featurePPM).
      // Apply explicit overrides for known acronym columns.
      const ACRONYM_RENAMES: Record<string, string> = {
        featurePpm: 'featurePPM',
      };
      for (const [from, to] of Object.entries(ACRONYM_RENAMES)) {
        if (from in mapped) {
          mapped[to] = mapped[from];
          delete mapped[from];
        }
      }

      const { smtpPassword, ...sanitizedSettings } = mapped;
      
      return sanitizedSettings as CompanySettings;
    } catch (error: any) {
      logger.error(`❌ Company settings query failed for ${context.customerId} in schema ${schemaName}:`, error.message);
      
      if (error.code === '42703') {
        logger.warn(`⚠️ Schema mismatch - column missing in ${schemaName}.company_settings: ${error.message}`);
        try {
          const customerDb = await customerDbService.getCustomerDatabase(context.customerId);
          const basicResult = await customerDb.execute(sql`
            SELECT id, company_name, logo_url, background_color, foreground_color, variable_text_color, accent_color,
                   email, phone, website, address, site_name, banner_url, theme
            FROM ${sql.identifier(schemaName)}.company_settings LIMIT 1
          `);
          
          if (basicResult.rows && basicResult.rows.length > 0) {
            const row = basicResult.rows[0] as any;
            const mapped: any = {};
            for (const [key, value] of Object.entries(row)) {
              const camelKey = key.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
              mapped[camelKey] = value;
            }
            logger.info(`✅ Basic fallback query successful for ${context.customerId} from schema ${schemaName}`);
            return mapped as CompanySettings;
          }
        } catch (fallbackError: any) {
          logger.error(`❌ Fallback query also failed for ${context.customerId}:`, fallbackError.message);
        }
        
        return undefined;
      }
      throw error;
    }
  }

  async updateCompanySettings(
    context: CustomerContext, 
    updates: Partial<InsertCompanySettings>
  ): Promise<CompanySettings | undefined> {
    logger.info(`💾 Updating company settings for customer: ${context.customerId}`);
    
    // Use customer isolated database
    const customerDb = await customerDbService.getCustomerDatabase(context.customerId);
    
    // First, try to get existing settings
    const existing = await this.getCompanySettings(context);
    
    if (existing) {
      try {
        // Update existing settings (no customerId filter needed in isolated DB)
        const updated = await customerDb
          .update(isolatedSchema.companySettings)
          .set({ ...updates, updatedAt: new Date() })
          .where(eq(isolatedSchema.companySettings.id, existing.id))
          .returning();
        
        logger.info(`✅ Updated company settings for customer: ${context.customerId}`);
        return updated[0];
      } catch (error: any) {
        // Handle schema mismatches gracefully for UPDATE operations
        if (error.code === '42703') {
          logger.warn(`⚠️ Column error during update for ${context.customerId}: ${error.message}`);
          logger.warn(`⚠️ Filtering out problematic fields and retrying update...`);
          
          // Get list of safe fields that exist in database by trying a simpler update
          const safeUpdates = await this.filterSafeFields(customerDb, updates);
          
          if (Object.keys(safeUpdates).length > 0) {
            const retryUpdated = await customerDb
              .update(isolatedSchema.companySettings)
              .set({ ...safeUpdates, updatedAt: new Date() })
              .where(eq(isolatedSchema.companySettings.id, existing.id))
              .returning();
            
            logger.info(`✅ Updated company settings (filtered) for customer: ${context.customerId}`);
            return retryUpdated[0];
          } else {
            logger.warn(`⚠️ No safe fields to update for customer: ${context.customerId}`);
            return existing;
          }
        }
        throw error; // Re-throw non-schema errors
      }
    } else {
      try {
        // Create new settings for this customer with UK H&S rules
        const defaultHSRules = `# Health & Safety Rules and Regulations

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

6. **Electrical Safety**
   - Do not use damaged electrical equipment
   - Report exposed wires or damaged sockets
   - Ensure trailing cables are secured

7. **Working at Height**
   - Only use approved ladders and platforms
   - Ensure proper edge protection is in place
   - Wear fall protection equipment when required

8. **Control of Substances (COSHH)**
   - Do not handle chemicals without authorization
   - Follow all COSHH data sheet instructions
   - Use appropriate PPE when handling substances

9. **Machinery and Equipment**
   - Do not operate machinery without authorization
   - Ensure guards are in place before operation
   - Follow lock-out/tag-out procedures

10. **Welfare Facilities**
    - First aid boxes located at reception and main office
    - Drinking water available in kitchen areas
    - Toilets and washing facilities available

## Contractor Specific Requirements

- Provide risk assessments and method statements before work
- Ensure all tools are PAT tested and in date
- Obtain hot work permits for welding/cutting operations
- Follow permit to work system for hazardous tasks

## COVID-19 and Health Precautions

- Maintain good hand hygiene
- Use hand sanitizer stations provided
- Stay home if feeling unwell
- Follow any additional health screening procedures

## Compliance Statement

These rules comply with:
- Health and Safety at Work Act 1974
- Management of Health and Safety at Work Regulations 1999
- Workplace (Health, Safety and Welfare) Regulations 1992
- Personal Protective Equipment at Work Regulations 1992
- Manual Handling Operations Regulations 1992
- Control of Substances Hazardous to Health Regulations 2002

## Contact Information

**Emergency:** 999
**Reception:** Available at main entrance
**First Aiders:** List available at reception
**Health & Safety Officer:** Contact via reception

By entering our premises, you agree to comply with all health and safety rules.`;
        
        const created = await customerDb
          .insert(isolatedSchema.companySettings)
          .values({
            companyName: "Default Company",
            hsRulesEnabled: true,
            hsRulesContent: defaultHSRules,
            hsRulesRequireAcceptance: false,
            ...updates,
          })
          .returning();
        
        logger.info(`✅ Created new company settings for customer: ${context.customerId}`);
        return created[0];
      } catch (error: any) {
        // Handle schema mismatches gracefully for INSERT operations
        if (error.code === '42703') {
          logger.warn(`⚠️ Column error during insert for ${context.customerId}: ${error.message}`);
          logger.warn(`⚠️ Filtering out problematic fields and retrying insert...`);
          
          // Get list of safe fields for INSERT
          const safeUpdates = await this.filterSafeFields(customerDb, updates);
          
          const defaultHSRules = "# Health & Safety Rules\nPlease follow all safety procedures.";
          
          const retryCreated = await customerDb
            .insert(isolatedSchema.companySettings)
            .values({
              companyName: "Default Company",
              hsRulesEnabled: true,
              hsRulesContent: defaultHSRules,
              hsRulesRequireAcceptance: false,
              ...safeUpdates,
            })
            .returning();
          
          logger.info(`✅ Created company settings (filtered) for customer: ${context.customerId}`);
          return retryCreated[0];
        }
        throw error; // Re-throw non-schema errors
      }
    }
  }

  /**
   * Filter out fields that don't exist in the database schema
   * This prevents PostgreSQL column errors (42703) during updates
   */
  private async filterSafeFields(customerDb: any, updates: Partial<InsertCompanySettings>): Promise<Partial<InsertCompanySettings>> {
    // Core fields that should always exist in company_settings table
    const coreFields = [
      'companyName', 'logoUrl', 'address', 'phone', 'website', 'email',
      'emailReportsEnabled', 'reportFrequency', 'hsRulesEnabled', 'hsRulesContent',
      'backgroundColor', 'foregroundColor', 'accentColor', 'theme',
      'selectedPrinter', 'enableQrCodes', 'updatedAt',
      // ID Card & Print Settings
      'idCardPrinter', 'idCardPrintQuality', 'id_card_print_quality',
      // BioStar Integration
      'biostarEnabled', 'biostar_enabled', 'biostarApiUrl', 'biostarApiKey',
      // SMTP Settings
      'smtpHost', 'smtpPort', 'smtpUsername', 'smtpPassword', 'smtpFromEmail',
      // Daily Reset Settings
      'dailyResetEnabled', 'dailyResetTime', 'lastDailyReset',
      // Visitor Pass Settings
      'visitorPassEnabled', 'visitorPassTemplate'
    ];
    
    // Check which fields from the update actually exist in the database
    try {
      const tableInfo = await customerDb.execute(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_schema = current_schema()
        AND table_name = 'company_settings'
      `);
      
      const existingColumns = new Set(tableInfo.rows.map((row: any) => {
        // Convert PostgreSQL column names to camelCase to match our schema
        const pgColumnName = row.column_name;
        return this.toCamelCase(pgColumnName);
      }));
      
      // Filter updates to only include existing columns
      const safeUpdates: Partial<InsertCompanySettings> = {};
      
      for (const [key, value] of Object.entries(updates)) {
        if (existingColumns.has(key) || coreFields.includes(key)) {
          (safeUpdates as any)[key] = value;
        } else {
          logger.warn(`⚠️ Skipping field '${key}' - column does not exist in database`);
        }
      }
      
      logger.info(`✅ Filtered ${Object.keys(updates).length} fields to ${Object.keys(safeUpdates).length} safe fields`);
      return safeUpdates;
    } catch (error) {
      // If we can't check columns, fall back to core fields only
      logger.warn(`⚠️ Could not check database columns, using core fields only`);
      
      const safeUpdates: Partial<InsertCompanySettings> = {};
      for (const [key, value] of Object.entries(updates)) {
        if (coreFields.includes(key)) {
          (safeUpdates as any)[key] = value;
        }
      }
      
      return safeUpdates;
    }
  }

  /**
   * Convert snake_case to camelCase for column name matching
   */
  private toCamelCase(str: string): string {
    return str.replace(/_([a-z])/g, (g) => g[1].toUpperCase());
  }
}

// Export singleton instance
export const simpleDatabaseService = new SimpleDatabaseService();