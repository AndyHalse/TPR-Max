import { eq, and } from "drizzle-orm";
import { db } from "./db";
import type {
  CompanySettings,
  InsertCompanySettings,
} from "./isolatedSchema";
import * as schema from "@shared/schema";
import * as isolatedSchema from "./isolatedSchema";
import { customerDbService } from "./customerDatabase";

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
   * Create customer context based on username
   */
  createCustomerContext(username: string): CustomerContext {
    // Map usernames to customer IDs for proper isolation
    const customerMapping: { [key: string]: string } = {
      "Andy": "dev-customer-001",
      "Emma": "dev-customer-002",
      "TestUser": "test-customer-trial"
    };
    
    const customerId = customerMapping[username] || "dev-customer-001";
    
    return {
      customerId
    };
  }

  /**
   * COMPANY SETTINGS METHODS - Customer Isolated
   */
  async getCompanySettings(context: CustomerContext): Promise<CompanySettings | undefined> {
    console.log(`🔍 Getting company settings for customer: ${context.customerId}`);
    
    // Use customer isolated database - no customerId filter needed
    const customerDb = await customerDbService.getCustomerDatabase(context.customerId);
    const settings = await customerDb
      .select()
      .from(isolatedSchema.companySettings)
      .limit(1);
    
    return settings[0];
  }

  async updateCompanySettings(
    context: CustomerContext, 
    updates: Partial<InsertCompanySettings>
  ): Promise<CompanySettings | undefined> {
    console.log(`💾 Updating company settings for customer: ${context.customerId}`);
    
    // Use customer isolated database
    const customerDb = await customerDbService.getCustomerDatabase(context.customerId);
    
    // First, try to get existing settings
    const existing = await this.getCompanySettings(context);
    
    if (existing) {
      // Update existing settings (no customerId filter needed in isolated DB)
      const updated = await customerDb
        .update(isolatedSchema.companySettings)
        .set({ ...updates, updatedAt: new Date() })
        .where(eq(isolatedSchema.companySettings.id, existing.id))
        .returning();
      
      console.log(`✅ Updated company settings for customer: ${context.customerId}`);
      return updated[0];
    } else {
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
      
      console.log(`✅ Created new company settings for customer: ${context.customerId}`);
      return created[0];
    }
  }
}

// Export singleton instance
export const simpleDatabaseService = new SimpleDatabaseService();