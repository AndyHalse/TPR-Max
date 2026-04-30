import { sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { logger } from './utils/logger';

const UK_HS_TEMPLATES = [
  {
    documentName: 'Right to Work Documentation',
    documentType: 'right_to_work',
    description: 'Before starting any work, you must prove your legal right to work in the UK to your employer or client. Ensures compliance with UK immigration laws.',
    isRequired: true,
    category: 'legal_compliance',
    validityPeriodMonths: 12,
    reminderDaysBefore: 30,
  },
  {
    documentName: 'Ladder Safety Training Certification',
    documentType: 'ladder_safety',
    description: 'If your work involves using ladders or stepladders, competency training is required under the Work at Height Regulations 2005.',
    isRequired: true,
    category: 'safety_training',
    validityPeriodMonths: 60,
    reminderDaysBefore: 60,
  },
  {
    documentName: 'Permit to Work (PTW)',
    documentType: 'permit_to_work',
    description: 'A formal system for managing high-risk activities (e.g., hot work, electrical isolation, confined space entry) under the Health and Safety at Work Act 1974.',
    isRequired: true,
    category: 'safety_training',
    validityPeriodMonths: 0,
    reminderDaysBefore: 7,
  },
  {
    documentName: 'Independent Contractor Agreement',
    documentType: 'contractor_agreement',
    description: 'Essential contract defining the terms of engagement, scope of services, and legal obligations under UK Employment Law and IR35 Regulations.',
    isRequired: true,
    category: 'legal_compliance',
    validityPeriodMonths: 12,
    reminderDaysBefore: 30,
  },
  {
    documentName: 'Health and Safety Risk Assessment',
    documentType: 'risk_assessment',
    description: 'Legal requirement under the Health and Safety at Work Act 1974 to identify hazards, assess risks, and implement control measures.',
    isRequired: true,
    category: 'safety_training',
    validityPeriodMonths: 12,
    reminderDaysBefore: 30,
  },
  {
    documentName: 'Site-Specific Safety Induction',
    documentType: 'site_induction',
    description: 'Every worker must complete a site-specific induction before starting work, covering emergency procedures, site rules, and safety protocols.',
    isRequired: true,
    category: 'competency',
    validityPeriodMonths: 12,
    reminderDaysBefore: 30,
  },
];

export async function seedIsolatedHSTemplates(customerDb: any, customerLabel?: string, customerId?: string): Promise<number> {
  const label = customerLabel || 'unknown';
  try {
    const existing = await customerDb.execute(sql`
      SELECT COUNT(*) as count FROM uk_hs_document_templates
    `);

    const count = parseInt(existing.rows?.[0]?.count || '0', 10);
    if (count >= 6) {
      return 0;
    }

    const hasCustomerId = await customerDb.execute(sql`
      SELECT column_name FROM information_schema.columns 
      WHERE table_name = 'uk_hs_document_templates' AND column_name = 'customer_id'
      LIMIT 1
    `);
    const needsSharedColumns = (hasCustomerId.rows?.length || 0) > 0;

    let seeded = 0;
    for (const template of UK_HS_TEMPLATES) {
      const existingTemplate = await customerDb.execute(
        sql`SELECT id FROM uk_hs_document_templates WHERE document_type = ${template.documentType} LIMIT 1`
      );

      if ((existingTemplate.rows?.length || 0) === 0) {
        if (needsSharedColumns) {
          const cid = customerId || 'unknown';
          await customerDb.execute(sql`
            INSERT INTO uk_hs_document_templates (
              id, customer_id, document_code, document_name, template_content,
              is_uk_hs_required, compliance_category, version,
              document_type, description, is_required, category,
              validity_period_months, reminder_days_before,
              allowed_file_types, max_file_size_mb, auto_fill_enabled,
              is_active, created_at, updated_at
            ) VALUES (
              gen_random_uuid(),
              ${cid},
              ${template.documentType},
              ${template.documentName},
              '',
              true,
              ${template.category},
              '1.0',
              ${template.documentType},
              ${template.description},
              ${template.isRequired},
              ${template.category},
              ${template.validityPeriodMonths},
              ${template.reminderDaysBefore},
              ARRAY['pdf', 'jpg', 'png']::TEXT[],
              10,
              false,
              true,
              NOW(),
              NOW()
            )
          `);
        } else {
          await customerDb.execute(sql`
            INSERT INTO uk_hs_document_templates (
              id, document_name, document_type, description, is_required, category,
              validity_period_months, reminder_days_before,
              allowed_file_types, max_file_size_mb, auto_fill_enabled,
              is_active, created_at, updated_at
            ) VALUES (
              gen_random_uuid(),
              ${template.documentName},
              ${template.documentType},
              ${template.description},
              ${template.isRequired},
              ${template.category},
              ${template.validityPeriodMonths},
              ${template.reminderDaysBefore},
              ARRAY['pdf', 'jpg', 'png']::TEXT[],
              10,
              false,
              true,
              NOW(),
              NOW()
            )
          `);
        }
        seeded++;
      }
    }

    if (seeded > 0) {
      logger.info(`✅ Seeded ${seeded} UK H&S document templates for customer: ${label}`);
    }
    return seeded;
  } catch (error: any) {
    if (error.message?.includes('does not exist') || error.code === '42P01') {
      logger.info(`⚠️ uk_hs_document_templates table not yet created for customer: ${label}, skipping seed`);
      return 0;
    }
    logger.error(`❌ Failed to seed H&S templates for customer ${label}:`, error);
    return 0;
  }
}

export async function seedAllCustomerHSTemplates(): Promise<void> {
  try {
    const { customerDbService } = await import('./customerDatabase');
    const customers = await customerDbService.getAllCustomers();

    logger.info(`🌱 Seeding UK H&S document templates for ${customers.length} customers...`);

    let totalSeeded = 0;
    for (const customer of customers) {
      try {
        const customerDb = await customerDbService.getCustomerDatabase(customer.id);
        const seeded = await seedIsolatedHSTemplates(customerDb, `${customer.companyName} (${customer.id})`, customer.id);
        totalSeeded += seeded;
      } catch (error) {
        logger.error(`⚠️ Could not seed H&S templates for ${customer.companyName} (${customer.id}):`, error);
      }
    }

    if (totalSeeded > 0) {
      logger.info(`🎉 Seeded ${totalSeeded} total UK H&S document templates across all customers`);
    } else {
      logger.info(`✅ All customers already have UK H&S document templates`);
    }
  } catch (error) {
    logger.error('❌ Failed to seed H&S templates across customers:', error);
  }
}
