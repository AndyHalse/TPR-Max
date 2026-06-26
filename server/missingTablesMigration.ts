import type { Migration } from './migrationRunner';
import { logger } from './utils/logger';

/**
 * MISSING TABLES MIGRATION
 * 
 * This migration creates tables that are defined in isolatedSchema.ts but
 * missing from the customer database, causing "relation does not exist" errors.
 * 
 * Tables to create:
 * - visitor_history: For tracking visitor visit history
 * - contractor_companies: For contractor company management (if not created by contractorMigrations)
 * - contractor_workers: For contractor worker management
 * - contractor_visits: For contractor visit tracking
 * - contractor_documents: For contractor compliance documents
 * - contractor_prebookings: For contractor pre-booking functionality
 */

/**
 * Ensure pgcrypto extension exists for UUID generation
 */
async function ensurePgcrypto(db: any) {
  try {
    await db.execute(`CREATE EXTENSION IF NOT EXISTS pgcrypto`);
  } catch (error: any) {
    // PostgreSQL error code 23505 = duplicate key constraint violation
    // This means the extension already exists, which is fine
    if (error?.code === '23505' && error?.detail?.includes('pgcrypto')) {
      // Extension already exists, continue silently
    } else {
      // Re-throw other errors
      throw error;
    }
  }
}

// Migration to create visitor_history table
export const createVisitorHistoryTableMigration: Migration = {
  version: '20250918_002_create_visitor_history_table',
  description: 'Create visitor_history table for tracking visitor visit history',
  async up(db: any) {
    logger.info('🔄 Creating visitor_history table...');

    // Add pgcrypto extension for UUID generation
    await ensurePgcrypto(db);

    // Create visitor_history table matching isolatedSchema definition
    await db.execute(`
      CREATE TABLE IF NOT EXISTS visitor_history (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        visitor_id VARCHAR NOT NULL REFERENCES visitors(id),
        -- Visit details
        check_in_time TIMESTAMP NOT NULL,
        check_out_time TIMESTAMP,
        purpose TEXT,
        host_staff_id VARCHAR REFERENCES staff(id),
        host_name TEXT,
        -- Compliance tracking
        induction_completed BOOLEAN NOT NULL DEFAULT false,
        induction_completed_at TIMESTAMP,
        hs_rules_accepted BOOLEAN NOT NULL DEFAULT false,
        hs_rules_accepted_at TIMESTAMP,
        -- E-Pass details
        e_pass_sent BOOLEAN NOT NULL DEFAULT false,
        e_pass_sent_at TIMESTAMP,
        -- Check-out details
        checkout_type TEXT,
        -- Visit notes
        notes TEXT,
        -- QR code for this visit
        qr_code TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    logger.info('✅ Created visitor_history table successfully');
  }
};

// Migration to ensure contractor tables exist (backup if contractorMigrations didn't run)
export const ensureContractorTablesMigration: Migration = {
  version: '20250918_003_ensure_contractor_tables',
  description: 'Ensure contractor tables exist (contractor_companies, contractor_workers, etc.)',
  async up(db: any) {
    logger.info('🔄 Ensuring contractor tables exist...');

    // Add pgcrypto extension for UUID generation
    await ensurePgcrypto(db);

    // Create contractor_companies table
    await db.execute(`
      CREATE TABLE IF NOT EXISTS contractor_companies (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        company_name TEXT NOT NULL UNIQUE,
        company_number TEXT,
        vat_number TEXT,
        registration_number TEXT,
        contact_email TEXT NOT NULL,
        contact_phone TEXT,
        address TEXT,
        postcode TEXT,
        website TEXT,
        primary_contact_name TEXT,
        primary_contact_email TEXT,
        primary_contact_phone TEXT,
        emergency_contact_name TEXT,
        emergency_contact_phone TEXT,
        -- Insurance details
        public_liability_insurer TEXT,
        public_liability_amount TEXT,
        public_liability_expiry_date TIMESTAMP,
        public_liability_policy_number TEXT,
        employers_liability_insurer TEXT,
        employers_liability_amount TEXT,
        employers_liability_expiry_date TIMESTAMP,
        employers_liability_policy_number TEXT,
        professional_indemnity_insurer TEXT,
        professional_indemnity_amount TEXT,
        professional_indemnity_expiry_date TIMESTAMP,
        professional_indemnity_policy_number TEXT,
        -- Status and approval
        status TEXT NOT NULL DEFAULT 'pending',
        approved_by VARCHAR REFERENCES users(id),
        approved_at TIMESTAMP,
        suspended_reason TEXT,
        -- Health & Safety
        has_health_safety_policy BOOLEAN DEFAULT false,
        health_safety_policy_url TEXT,
        health_safety_policy_expiry_date TIMESTAMP,
        -- CHAS/SafeContractor certifications
        chas_certified BOOLEAN DEFAULT false,
        chas_certificate_number TEXT,
        chas_expiry_date TIMESTAMP,
        safe_contractor_certified BOOLEAN DEFAULT false,
        safe_contractor_number TEXT,
        safe_contractor_expiry_date TIMESTAMP,
        -- Risk assessment
        risk_rating TEXT DEFAULT 'medium',
        risk_notes TEXT,
        last_audit_date TIMESTAMP,
        next_audit_due TIMESTAMP,
        audit_frequency_months INTEGER DEFAULT 12,
        -- AI and automation
        ai_compliance_score INTEGER DEFAULT 0,
        last_ai_review TIMESTAMP,
        auto_compliance_checks BOOLEAN DEFAULT true,
        is_active BOOLEAN DEFAULT true NOT NULL,
        created_at TIMESTAMP DEFAULT NOW() NOT NULL,
        updated_at TIMESTAMP DEFAULT NOW() NOT NULL
      )
    `);

    // Create contractor_workers table
    await db.execute(`
      CREATE TABLE IF NOT EXISTS contractor_workers (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id VARCHAR NOT NULL REFERENCES contractor_companies(id),
        first_name TEXT NOT NULL,
        last_name TEXT NOT NULL,
        email TEXT,
        phone_number TEXT,
        mobile_number TEXT,
        home_address TEXT,
        postcode TEXT,
        date_of_birth TIMESTAMP,
        national_insurance_number TEXT,
        -- Worker photo and identification
        photo_url TEXT,
        -- Job and skills information
        job_title TEXT,
        department TEXT,
        skills_and_certifications TEXT[] DEFAULT ARRAY[]::TEXT[],
        emergency_contact_name TEXT,
        emergency_contact_phone TEXT,
        emergency_contact_relationship TEXT,
        -- Check-in/out tracking
        is_checked_in BOOLEAN DEFAULT false NOT NULL,
        checked_in_at TIMESTAMP,
        checked_out_at TIMESTAMP,
        checkout_type TEXT,
        last_visit_date TIMESTAMP,
        visit_count INTEGER DEFAULT 0,
        -- Emergency muster tracking
        is_accounted_for BOOLEAN DEFAULT false NOT NULL,
        -- Right to work verification
        right_to_work_status TEXT DEFAULT 'pending',
        right_to_work_document_type TEXT,
        right_to_work_document_number TEXT,
        right_to_work_expiry_date TIMESTAMP,
        right_to_work_verified_by VARCHAR REFERENCES users(id),
        right_to_work_verified_at TIMESTAMP,
        right_to_work_document_url TEXT,
        -- Working pattern and rates
        working_pattern TEXT DEFAULT 'full_time',
        hourly_rate TEXT,
        start_date TIMESTAMP,
        expected_end_date TIMESTAMP,
        -- Medical and fitness
        has_occupational_health_clearance BOOLEAN DEFAULT false,
        occupational_health_expiry_date TIMESTAMP,
        medical_restrictions TEXT,
        -- Induction and training status
        site_induction_required BOOLEAN DEFAULT true,
        site_induction_completed BOOLEAN DEFAULT false,
        site_induction_completed_at TIMESTAMP,
        site_induction_expiry_date TIMESTAMP,
        toolbox_talk_completed BOOLEAN DEFAULT false,
        toolbox_talk_completed_at TIMESTAMP,
        -- Competency and qualifications tracking
        has_cscs BOOLEAN DEFAULT false,
        cscs_card_number TEXT,
        cscs_expiry_date TIMESTAMP,
        cscs_card_type TEXT,
        -- Status and approval
        worker_status TEXT NOT NULL DEFAULT 'pending',
        approved_by VARCHAR REFERENCES users(id),
        approved_at TIMESTAMP,
        suspended_reason TEXT,
        banned_until TIMESTAMP,
        -- AI risk assessment
        ai_risk_score INTEGER DEFAULT 0,
        risk_factors TEXT[] DEFAULT ARRAY[]::TEXT[],
        last_risk_assessment TIMESTAMP,
        -- Document compliance status
        documents_complete BOOLEAN DEFAULT false,
        documents_last_checked TIMESTAMP,
        compliance_score INTEGER DEFAULT 0,
        is_active BOOLEAN DEFAULT true NOT NULL,
        created_at TIMESTAMP DEFAULT NOW() NOT NULL,
        updated_at TIMESTAMP DEFAULT NOW() NOT NULL
      )
    `);

    // Create contractor_visits table
    await db.execute(`
      CREATE TABLE IF NOT EXISTS contractor_visits (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        worker_id VARCHAR NOT NULL REFERENCES contractor_workers(id),
        company_id VARCHAR NOT NULL REFERENCES contractor_companies(id),
        purpose TEXT DEFAULT 'Work',
        checked_in_at TIMESTAMP NOT NULL DEFAULT NOW(),
        checked_out_at TIMESTAMP,
        duration TEXT, -- calculated field - CRITICAL MISSING COLUMN
        host_staff_id VARCHAR REFERENCES staff(id),
        host_name TEXT,
        hs_rules_accepted BOOLEAN DEFAULT false,
        hs_rules_accepted_at TIMESTAMP,
        induction_completed BOOLEAN DEFAULT false,
        induction_completed_at TIMESTAMP,
        e_pass_sent BOOLEAN DEFAULT false,
        e_pass_sent_at TIMESTAMP,
        checkout_type TEXT, -- manual, auto, overnight
        qr_code TEXT UNIQUE,
        pass_url TEXT, -- URL to generated pass
        notes TEXT,
        created_at TIMESTAMP DEFAULT NOW() NOT NULL
      )
    `);

    // Create contractor_documents table
    await db.execute(`
      CREATE TABLE IF NOT EXISTS contractor_documents (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id VARCHAR REFERENCES contractor_companies(id),
        worker_id VARCHAR REFERENCES contractor_workers(id),
        -- Document details
        document_type TEXT NOT NULL,
        document_name TEXT NOT NULL,
        file_url TEXT NOT NULL,
        file_size INTEGER,
        file_type TEXT,
        -- Document lifecycle
        uploaded_at TIMESTAMP DEFAULT NOW() NOT NULL,
        uploaded_by VARCHAR REFERENCES users(id),
        -- Approval and compliance
        approval_status TEXT DEFAULT 'pending',
        approved_by VARCHAR REFERENCES users(id),
        approved_at TIMESTAMP,
        rejection_reason TEXT,
        -- Document validity
        issue_date TIMESTAMP,
        expiry_date TIMESTAMP,
        is_expired BOOLEAN DEFAULT false,
        -- AI processing
        ai_processed BOOLEAN DEFAULT false,
        ai_processing_result TEXT,
        ai_confidence_score INTEGER,
        ai_processed_at TIMESTAMP,
        -- Compliance tracking
        compliance_score INTEGER DEFAULT 0,
        compliance_notes TEXT,
        last_reviewed_at TIMESTAMP,
        review_required BOOLEAN DEFAULT false,
        -- Document metadata
        document_number TEXT,
        issuing_authority TEXT,
        verification_status TEXT DEFAULT 'pending',
        is_active BOOLEAN DEFAULT true NOT NULL,
        created_at TIMESTAMP DEFAULT NOW() NOT NULL,
        updated_at TIMESTAMP DEFAULT NOW() NOT NULL
      )
    `);

    // Create contractor_prebookings table
    await db.execute(`
      CREATE TABLE IF NOT EXISTS contractor_prebookings (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        -- Company and worker information
        company_id VARCHAR REFERENCES contractor_companies(id),
        worker_id VARCHAR REFERENCES contractor_workers(id),
        -- Visit details
        visit_date TIMESTAMP NOT NULL,
        visit_time TEXT,
        expected_duration_hours INTEGER,
        purpose TEXT NOT NULL,
        work_description TEXT,
        location TEXT,
        -- Contact information
        site_contact_name TEXT,
        site_contact_phone TEXT,
        supervisor_name TEXT,
        supervisor_contact TEXT,
        -- Safety requirements
        ppe_required TEXT[] DEFAULT ARRAY[]::TEXT[],
        special_requirements TEXT,
        risk_level TEXT DEFAULT 'medium',
        risk_assessment_required BOOLEAN DEFAULT false,
        -- Pre-booking status
        status TEXT NOT NULL DEFAULT 'pending',
        approved_by VARCHAR REFERENCES users(id),
        approved_at TIMESTAMP,
        rejection_reason TEXT,
        -- Check-in tracking
        is_checked_in BOOLEAN DEFAULT false,
        checked_in_at TIMESTAMP,
        contractor_visit_id VARCHAR REFERENCES contractor_visits(id),
        -- Notifications
        email_sent BOOLEAN DEFAULT false,
        email_sent_at TIMESTAMP,
        sms_sent BOOLEAN DEFAULT false,
        sms_sent_at TIMESTAMP,
        reminder_sent BOOLEAN DEFAULT false,
        reminder_sent_at TIMESTAMP,
        -- Additional metadata
        emergency_contact_name TEXT,
        emergency_contact_phone TEXT,
        vehicle_registration TEXT,
        parking_required BOOLEAN DEFAULT false,
        access_requirements TEXT,
        notes TEXT,
        created_at TIMESTAMP DEFAULT NOW() NOT NULL,
        updated_at TIMESTAMP DEFAULT NOW() NOT NULL
      )
    `);

    logger.info('✅ Ensured all contractor tables exist successfully');
  }
};

// Migration to create UK H&S document system tables
export const createUKHSDocumentSystemMigration: Migration = {
  version: '20250918_004_create_uk_hs_document_system',
  description: 'Create UK H&S document system tables: uk_hs_document_templates, worker_document_assignments, worker_document_acceptances, document_auto_fill_mapping',
  async up(db: any) {
    logger.info('🔄 Creating UK H&S document system tables...');

    // Add pgcrypto extension for UUID generation
    await ensurePgcrypto(db);

    // Create uk_hs_document_templates table
    await db.execute(`
      CREATE TABLE IF NOT EXISTS uk_hs_document_templates (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        document_name TEXT NOT NULL,
        document_type TEXT NOT NULL, -- "right_to_work", "health_safety_training", "competency_certificate", etc.
        description TEXT,
        is_required BOOLEAN DEFAULT true,
        category TEXT NOT NULL, -- "legal_compliance", "safety_training", "competency", "identification"
        validity_period_months INTEGER DEFAULT 12,
        reminder_days_before INTEGER DEFAULT 30,
        allowed_file_types TEXT[] DEFAULT ARRAY['pdf', 'jpg', 'png']::TEXT[],
        max_file_size_mb INTEGER DEFAULT 10,
        auto_fill_enabled BOOLEAN DEFAULT false,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT NOW() NOT NULL,
        updated_at TIMESTAMP DEFAULT NOW() NOT NULL
      )
    `);

    // Create worker_document_assignments table - CRITICAL MISSING TABLE
    await db.execute(`
      CREATE TABLE IF NOT EXISTS worker_document_assignments (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        worker_id VARCHAR NOT NULL REFERENCES contractor_workers(id),
        template_id VARCHAR NOT NULL REFERENCES uk_hs_document_templates(id),
        assigned_by VARCHAR NOT NULL REFERENCES users(id),
        assigned_at TIMESTAMP DEFAULT NOW() NOT NULL,
        due_date TIMESTAMP NOT NULL,
        status TEXT DEFAULT 'pending', -- pending, submitted, approved, rejected, expired
        priority TEXT DEFAULT 'normal', -- low, normal, high, urgent
        notes TEXT,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT NOW() NOT NULL,
        updated_at TIMESTAMP DEFAULT NOW() NOT NULL
      )
    `);

    // Create worker_document_acceptances table
    await db.execute(`
      CREATE TABLE IF NOT EXISTS worker_document_acceptances (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        assignment_id VARCHAR NOT NULL REFERENCES worker_document_assignments(id),
        worker_id VARCHAR NOT NULL REFERENCES contractor_workers(id),
        template_id VARCHAR NOT NULL REFERENCES uk_hs_document_templates(id),
        document_url TEXT NOT NULL,
        original_file_name TEXT NOT NULL,
        file_size_bytes INTEGER NOT NULL,
        file_type TEXT NOT NULL, -- pdf, jpg, png, etc.
        submitted_at TIMESTAMP DEFAULT NOW() NOT NULL,
        submitted_by VARCHAR NOT NULL REFERENCES contractor_workers(id),
        -- Review and approval
        reviewed_by VARCHAR REFERENCES users(id),
        reviewed_at TIMESTAMP,
        status TEXT DEFAULT 'pending', -- pending, approved, rejected, expired
        approval_comments TEXT,
        rejection_reason TEXT,
        expiry_date TIMESTAMP,
        -- Auto-fill and AI processing
        auto_fill_data TEXT, -- JSON string of extracted data
        ai_analysis_result TEXT, -- JSON string of AI document analysis
        ai_confidence_score INTEGER DEFAULT 0, -- 0-100 AI confidence
        -- Document metadata
        extracted_text TEXT, -- OCR extracted text for search
        document_hash TEXT, -- File hash for duplicate detection
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT NOW() NOT NULL,
        updated_at TIMESTAMP DEFAULT NOW() NOT NULL
      )
    `);

    // Create document_auto_fill_mapping table
    await db.execute(`
      CREATE TABLE IF NOT EXISTS document_auto_fill_mapping (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        template_id VARCHAR NOT NULL REFERENCES uk_hs_document_templates(id),
        field_name TEXT NOT NULL, -- "passport_number", "driving_licence_number", "expiry_date", etc.
        field_type TEXT NOT NULL, -- "text", "date", "number", "email"
        extraction_pattern TEXT, -- Regex pattern for extraction
        ocr_region TEXT, -- JSON: {"x": 100, "y": 200, "width": 300, "height": 50}
        is_required BOOLEAN DEFAULT false,
        validation_rules TEXT, -- JSON: validation rules for the field
        target_worker_field TEXT, -- Field in contractor_workers table to update
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT NOW() NOT NULL,
        updated_at TIMESTAMP DEFAULT NOW() NOT NULL
      )
    `);

    logger.info('✅ Created UK H&S document system tables successfully');
  }
};

// Migration to add missing e_pass_sent column to existing contractor_visits table
export const addEPassSentColumnMigration: Migration = {
  version: '20250918_005_add_e_pass_sent_column',
  description: 'Add missing e_pass_sent column to contractor_visits table',
  async up(db: any) {
    logger.info('🔄 Adding missing e_pass_sent column to contractor_visits table...');

    try {
      // Add e_pass_sent column if it doesn't exist
      await db.execute(`
        ALTER TABLE contractor_visits 
        ADD COLUMN IF NOT EXISTS e_pass_sent BOOLEAN DEFAULT false
      `);

      // Add e_pass_sent_at column if it doesn't exist
      await db.execute(`
        ALTER TABLE contractor_visits 
        ADD COLUMN IF NOT EXISTS e_pass_sent_at TIMESTAMP
      `);

      // Add qr_code column if it doesn't exist
      await db.execute(`
        ALTER TABLE contractor_visits 
        ADD COLUMN IF NOT EXISTS qr_code TEXT UNIQUE
      `);

      // Add pass_url column if it doesn't exist
      await db.execute(`
        ALTER TABLE contractor_visits 
        ADD COLUMN IF NOT EXISTS pass_url TEXT
      `);

      logger.info('✅ Successfully added e_pass_sent, e_pass_sent_at, qr_code, and pass_url columns to contractor_visits table');
    } catch (error: any) {
      if (error?.code === '42701') {
        // Column already exists
        logger.info('✅ e_pass_sent columns already exist in contractor_visits table');
      } else {
        logger.error('Error adding e_pass_sent columns:', error);
        throw error;
      }
    }
  }
};

export const createMembersTableMigration: Migration = {
  version: '20260210_001_create_members_table',
  description: 'Create members table for member management and muster tracking',
  async up(db: any) {
    logger.info('🔄 Creating members table...');

    await ensurePgcrypto(db);

    await db.execute(`
      CREATE TABLE IF NOT EXISTS members (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        first_name TEXT NOT NULL,
        last_name TEXT NOT NULL,
        email TEXT,
        phone_number TEXT,
        company TEXT,
        membership_type TEXT DEFAULT 'standard',
        membership_id TEXT,
        department TEXT,
        notes TEXT,
        is_checked_in BOOLEAN NOT NULL DEFAULT false,
        checked_in_at TIMESTAMP,
        checked_out_at TIMESTAMP,
        checkout_type TEXT,
        is_accounted_for BOOLEAN NOT NULL DEFAULT false,
        qr_code TEXT,
        is_active BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    await db.execute(`
      ALTER TABLE company_settings 
      ADD COLUMN IF NOT EXISTS feature_members BOOLEAN DEFAULT false
    `);

    logger.info('✅ Members table and feature toggle created successfully');
  }
};

export const ensureMembersTableProductionMigration: Migration = {
  version: '20260211_001_ensure_members_table_production',
  description: 'Ensure members table exists in production public schema (fixes schema mismatch)',
  async up(db: any) {
    logger.info('🔄 Ensuring members table exists in current schema...');

    await ensurePgcrypto(db);

    await db.execute(`
      CREATE TABLE IF NOT EXISTS members (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        first_name TEXT NOT NULL,
        last_name TEXT NOT NULL,
        email TEXT,
        phone_number TEXT,
        company TEXT,
        membership_type TEXT DEFAULT 'standard',
        membership_id TEXT,
        department TEXT,
        notes TEXT,
        is_checked_in BOOLEAN NOT NULL DEFAULT false,
        checked_in_at TIMESTAMP,
        checked_out_at TIMESTAMP,
        checkout_type TEXT,
        is_accounted_for BOOLEAN NOT NULL DEFAULT false,
        qr_code TEXT,
        is_active BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    await db.execute(`
      ALTER TABLE company_settings 
      ADD COLUMN IF NOT EXISTS feature_members BOOLEAN DEFAULT false
    `);

    logger.info('✅ Members table verified/created in current schema');
  }
};

export const addStaffQrCodeColumnMigration: Migration = {
  version: '20260213_001_staff_qr_code',
  description: 'Add qr_code column to staff table for kiosk QR check-in',
  async up(db: any) {
    try {
      await db.execute(`
        ALTER TABLE staff 
        ADD COLUMN IF NOT EXISTS qr_code TEXT UNIQUE
      `);
      logger.info('✅ Added qr_code column to staff table');
    } catch (error: any) {
      if (error?.message?.includes('already exists')) {
        logger.info('ℹ️ qr_code column already exists on staff table');
      } else {
        throw error;
      }
    }
    
    try {
      const result = await db.execute(`
        UPDATE staff 
        SET qr_code = 'STF-' || SUBSTRING(REPLACE(gen_random_uuid()::text, '-', ''), 1, 12) 
        WHERE qr_code IS NULL
      `);
      logger.info('✅ Generated QR codes for existing staff members');
    } catch (error: any) {
      logger.error('⚠️ Failed to generate QR codes for existing staff:', error.message);
    }
  }
};

export const createStaffDbsTableMigration: Migration = {
  version: '20260521_001_staff_dbs',
  description: 'Create staff_dbs table for DBS certificate and safeguarding management',
  async up(db: any) {
    try {
      await db.execute(`
        CREATE TABLE IF NOT EXISTS staff_dbs (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          staff_id TEXT NOT NULL,
          dbs_level TEXT NOT NULL,
          certificate_number TEXT,
          application_reference TEXT,
          issue_date DATE,
          policy_expiry_date DATE,
          requested_by TEXT,
          verified_by TEXT NOT NULL,
          verified_date DATE NOT NULL,
          is_current BOOLEAN NOT NULL DEFAULT TRUE,
          notes TEXT,
          reminder_sent_at TIMESTAMP,
          created_at TIMESTAMP NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMP NOT NULL DEFAULT NOW()
        )
      `);
      logger.info('✅ staff_dbs table created/verified');
    } catch (error: any) {
      const msg = error?.message || '';
      if (
        msg.includes('already exists') ||
        msg.includes('pg_type_typname_nsp_index') ||
        error?.code === '23505'
      ) {
        logger.info('ℹ️ staff_dbs table already exists, skipping');
      } else {
        throw error;
      }
    }
  }
};

const addHrDocumentAttachmentsMigration = {
  version: '20260521_054_add_hr_document_attachments',
  description: 'Add document_url and document_name columns to HR tables for file attachments',
  async up(db: any) {
    const tables = ['staff_training_records', 'absence_records', 'appraisals', 'staff_dbs'];
    for (const table of tables) {
      for (const col of ['document_url', 'document_name']) {
        try {
          await db.execute(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS ${col} TEXT`);
        } catch (err: any) {
          logger.info(`ℹ️ [054] ${table}.${col}: ${(err?.message || '').substring(0, 80)}`);
        }
      }
    }
    logger.info('✅ [054] HR document attachment columns ensured');
  }
};

const addDbsSoftDeleteMigration = {
  version: '20260521_055_add_dbs_soft_delete',
  description: 'Add deleted_at column to staff_dbs for soft-delete audit trail',
  async up(db: any) {
    try {
      await db.execute(`ALTER TABLE staff_dbs ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP`);
      logger.info('✅ [055] staff_dbs.deleted_at column ensured');
    } catch (err: any) {
      logger.info(`ℹ️ [055] staff_dbs.deleted_at: ${(err?.message || '').substring(0, 80)}`);
    }
  }
};

const createWorkerCertificationTypesTableMigration: Migration = {
  version: '20260611_002_worker_certification_types',
  description: 'Create worker_certification_types catalogue table and seed standard UK certificates',
  async up(db: any) {
    try {
      await db.execute(`
        CREATE TABLE IF NOT EXISTS worker_certification_types (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          key TEXT NOT NULL UNIQUE,
          name TEXT NOT NULL,
          legal_basis TEXT,
          category TEXT NOT NULL,
          requires_expiry BOOLEAN NOT NULL DEFAULT TRUE,
          requires_number BOOLEAN NOT NULL DEFAULT FALSE,
          is_active BOOLEAN NOT NULL DEFAULT TRUE,
          created_at TIMESTAMP NOT NULL DEFAULT NOW()
        )
      `);
      await db.execute(`
        INSERT INTO worker_certification_types
          (key, name, legal_basis, category, requires_expiry, requires_number)
        VALUES
          ('right_to_work',       'Right to Work',                 'Immigration, Asylum & Nationality Act 2006',      'legal',    TRUE,  FALSE),
          ('cscs_card',           'CSCS Card',                     'Construction Skills Certification Scheme',        'site',     TRUE,  TRUE),
          ('ipaf_card',           'IPAF Card',                     'Working at Height Regulations 2005',              'site',     TRUE,  TRUE),
          ('cpcs_card',           'CPCS Card',                     'Plant operator competence (site requirement)',     'site',     TRUE,  TRUE),
          ('asbestos_awareness',  'Asbestos Awareness',            'Control of Asbestos Regulations 2012',            'training', TRUE,  FALSE),
          ('manual_handling',     'Manual Handling',               'Manual Handling Operations Regulations 1992',     'training', TRUE,  FALSE),
          ('working_at_height',   'Working at Height',             'Work at Height Regulations 2005',                 'training', TRUE,  FALSE),
          ('first_aid',           'First Aid Certificate',         'Health and Safety (First-Aid) Regulations 1981',  'training', TRUE,  FALSE),
          ('training',            'Training Certificate',          'Client / site requirement',                       'training', TRUE,  FALSE),
          ('certification',       'Other Certification',           'Client / professional body requirement',          'training', TRUE,  TRUE)
        ON CONFLICT (key) DO NOTHING
      `);
      logger.info('✅ worker_certification_types table created/verified and seeded');
    } catch (error: any) {
      const msg = error?.message || '';
      if (msg.includes('already exists') || error?.code === '23505') {
        logger.info('ℹ️ worker_certification_types table already exists, skipping');
      } else {
        throw error;
      }
    }
  }
};

const createContractorWorkerDbsTableMigration: Migration = {
  version: '20260611_001_contractor_worker_dbs',
  description: 'Create contractor_worker_dbs table for safeguarding DBS management per contractor worker',
  async up(db: any) {
    try {
      await db.execute(`
        CREATE TABLE IF NOT EXISTS contractor_worker_dbs (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          worker_id TEXT NOT NULL,
          dbs_level TEXT NOT NULL,
          certificate_number TEXT,
          application_reference TEXT,
          issue_date DATE,
          policy_expiry_date DATE,
          requested_by TEXT,
          verified_by TEXT NOT NULL,
          verified_date DATE NOT NULL,
          is_current BOOLEAN NOT NULL DEFAULT TRUE,
          notes TEXT,
          document_url TEXT,
          document_name TEXT,
          reminder_sent_at TIMESTAMP,
          created_at TIMESTAMP NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
          deleted_at TIMESTAMP
        )
      `);
      logger.info('✅ contractor_worker_dbs table created/verified');
    } catch (error: any) {
      const msg = error?.message || '';
      if (
        msg.includes('already exists') ||
        msg.includes('pg_type_typname_nsp_index') ||
        error?.code === '23505'
      ) {
        logger.info('ℹ️ contractor_worker_dbs table already exists, skipping');
      } else {
        throw error;
      }
    }
  }
};

const createContractorEquipmentMigration: Migration = {
  version: '20260611_003_contractor_equipment',
  description: 'Create contractor_equipment table, equipment_certification_types catalogue, and add equipment_id column to contractor_documents',
  async up(db: any) {
    try {
      // 1. contractor_equipment table
      await db.execute(`
        CREATE TABLE IF NOT EXISTS contractor_equipment (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          company_id TEXT NOT NULL,
          name TEXT NOT NULL,
          category TEXT NOT NULL,
          make_model TEXT,
          serial_or_reg TEXT,
          notes TEXT,
          is_active BOOLEAN NOT NULL DEFAULT TRUE,
          created_at TIMESTAMP NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMP NOT NULL DEFAULT NOW()
        )
      `);

      // 2. equipment_certification_types catalogue
      await db.execute(`
        CREATE TABLE IF NOT EXISTS equipment_certification_types (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          key TEXT NOT NULL UNIQUE,
          name TEXT NOT NULL,
          legal_basis TEXT,
          category TEXT NOT NULL,
          requires_expiry BOOLEAN NOT NULL DEFAULT TRUE,
          requires_number BOOLEAN NOT NULL DEFAULT FALSE,
          is_active BOOLEAN NOT NULL DEFAULT TRUE,
          created_at TIMESTAMP NOT NULL DEFAULT NOW()
        )
      `);
      await db.execute(`
        INSERT INTO equipment_certification_types
          (key, name, legal_basis, category, requires_expiry, requires_number)
        VALUES
          ('loler_examination', 'LOLER Thorough Examination',   'Lifting Operations & Lifting Equipment Regs 1998', 'inspection', TRUE,  FALSE),
          ('puwer_inspection',  'PUWER Inspection',             'Provision & Use of Work Equipment Regs 1998',      'inspection', TRUE,  FALSE),
          ('pat_test',          'PAT Test',                     'Electricity at Work Regulations 1989',             'inspection', TRUE,  FALSE),
          ('plant_insurance',   'Plant & Tool Insurance',       'Employer obligation / contract requirement',        'legal',      TRUE,  FALSE),
          ('mot',               'MOT Certificate',              'Road Traffic Act 1988',                            'legal',      TRUE,  FALSE),
          ('road_tax_insurance','Road Tax & Vehicle Insurance', 'Road Traffic Act 1988',                            'legal',      TRUE,  FALSE)
        ON CONFLICT (key) DO NOTHING
      `);

      // 3. equipment_id nullable column on contractor_documents
      await db.execute(`
        ALTER TABLE contractor_documents ADD COLUMN IF NOT EXISTS equipment_id TEXT
      `);

      logger.info('✅ contractor_equipment migration completed');
    } catch (error: any) {
      const msg = error?.message || '';
      if (msg.includes('already exists') || error?.code === '23505') {
        logger.info('ℹ️ contractor_equipment tables already exist, skipping');
      } else {
        throw error;
      }
    }
  }
};

const fixWorkerCertOwnershipMigration: Migration = {
  version: '20260613_001_fix_worker_cert_ownership',
  description: 'Deactivate company-level cert types from worker catalogue; add individual training types; soft-delete misclassified worker docs',
  async up(db: any) {
    try {
      // 1. Deactivate the three company-level certificate types from the worker catalogue.
      //    Using is_active=FALSE rather than DELETE preserves any FK-linked evidence rows.
      await db.execute(`
        UPDATE worker_certification_types
        SET is_active = FALSE
        WHERE key IN ('public_liability','employers_liability','health_safety_policy')
      `);

      // 2. Add the new individual training/site certificate types (ON CONFLICT handles re-runs).
      await db.execute(`
        INSERT INTO worker_certification_types
          (key, name, legal_basis, category, requires_expiry, requires_number)
        VALUES
          ('cpcs_card',          'CPCS Card',             'Plant operator competence (site requirement)',     'site',     TRUE,  TRUE),
          ('asbestos_awareness', 'Asbestos Awareness',    'Control of Asbestos Regulations 2012',            'training', TRUE,  FALSE),
          ('manual_handling',    'Manual Handling',       'Manual Handling Operations Regulations 1992',     'training', TRUE,  FALSE),
          ('working_at_height',  'Working at Height',     'Work at Height Regulations 2005',                 'training', TRUE,  FALSE),
          ('first_aid',          'First Aid Certificate', 'Health and Safety (First-Aid) Regulations 1981',  'training', TRUE,  FALSE)
        ON CONFLICT (key) DO UPDATE SET is_active = TRUE
      `);

      // 3. Soft-delete any contractor_documents that are worker-level copies of company docs.
      //    worker_id IS NOT NULL distinguishes worker-level from company-level rows.
      await db.execute(`
        UPDATE contractor_documents
        SET is_active = FALSE
        WHERE document_type IN ('public_liability','employers_liability','health_safety_policy')
          AND worker_id IS NOT NULL
          AND is_active = TRUE
      `);

      // 4. One-off backfill report: log active workers with NULL phone_number so admins
      //    know which records need the number manually re-entered (cannot be recovered).
      try {
        const nullPhoneResult = await db.execute(`
          SELECT id, first_name, last_name, email FROM contractor_workers
          WHERE is_active = TRUE AND (phone_number IS NULL OR phone_number = '')
          ORDER BY last_name, first_name
        `);
        const affected = nullPhoneResult.rows ?? [];
        if (affected.length > 0) {
          logger.warn(
            `[worker-phone-backfill] ${affected.length} active worker(s) have a missing phone_number — ` +
            `admin action required to re-enter: ${affected.map((r: any) => `${r.first_name} ${r.last_name} (${r.email || r.id})`).join(', ')}`
          );
        } else {
          logger.info('[worker-phone-backfill] No active workers have a missing phone_number — all good.');
        }
      } catch (reportErr) {
        logger.warn('[worker-phone-backfill] Could not run null-phone report (non-fatal):', reportErr);
      }

      logger.info('✅ Worker cert ownership migration completed');
    } catch (error: any) {
      const msg = error?.message || '';
      if (msg.includes('already exists') || error?.code === '23505') {
        logger.info('ℹ️ Worker cert ownership migration already applied, skipping');
      } else {
        throw error;
      }
    }
  }
};

const ensureLoneWorkerTablesMigration: Migration = {
  version: '20260615_002_ensure_lone_worker_tables',
  description: 'Safety-net: ensure lone_worker_sessions and lone_worker_tokens exist (idempotent re-create for customers where migration 057 silently failed)',
  async up(db: any) {
    try {
      await db.execute(`
        CREATE TABLE IF NOT EXISTS lone_worker_sessions (
          id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
          customer_id          TEXT        NOT NULL,
          person_id            TEXT        NOT NULL,
          person_type          TEXT        NOT NULL DEFAULT 'staff',
          person_name          TEXT        NOT NULL,
          person_email         TEXT,
          started_at           TIMESTAMP   NOT NULL DEFAULT NOW(),
          ended_at             TIMESTAMP,
          interval_mins        INTEGER     NOT NULL DEFAULT 30,
          grace_period_mins    INTEGER     NOT NULL DEFAULT 10,
          status               TEXT        NOT NULL DEFAULT 'active',
          check_ins_completed  INTEGER     NOT NULL DEFAULT 0,
          escalations_fired    INTEGER     NOT NULL DEFAULT 0,
          ended_by             TEXT
        )
      `);
      logger.info('✅ lone_worker_sessions table ensured');
    } catch (error: any) {
      const msg = error?.message || '';
      if (!msg.includes('already exists')) throw error;
    }
    try {
      await db.execute(`
        CREATE TABLE IF NOT EXISTS lone_worker_tokens (
          id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
          token       TEXT        NOT NULL UNIQUE,
          session_id  UUID        NOT NULL REFERENCES lone_worker_sessions(id),
          created_at  TIMESTAMP   NOT NULL DEFAULT NOW(),
          expires_at  TIMESTAMP   NOT NULL,
          used_at     TIMESTAMP
        )
      `);
      logger.info('✅ lone_worker_tokens table ensured');
    } catch (error: any) {
      const msg = error?.message || '';
      if (!msg.includes('already exists')) throw error;
    }
  }
};

const createCompanyNotesTableMigration: Migration = {
  version: '20260615_001_create_company_notes',
  description: 'Create company_notes audit trail table for contractor company activity',
  async up(db: any) {
    try {
      await db.execute(`
        CREATE TABLE IF NOT EXISTS company_notes (
          id          TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::text,
          company_id  TEXT        NOT NULL,
          change_type TEXT        NOT NULL,
          notes       TEXT,
          changed_by  TEXT        NOT NULL,
          changed_at  TIMESTAMP   NOT NULL DEFAULT NOW(),
          created_at  TIMESTAMP   NOT NULL DEFAULT NOW()
        )
      `);
      await db.execute(`
        CREATE INDEX IF NOT EXISTS idx_company_notes_company_id
          ON company_notes (company_id)
      `);
      logger.info('✅ company_notes table ensured');
    } catch (error: any) {
      const msg = error?.message || '';
      const code = error?.code;
      if (msg.includes('already exists') || code === '23505' || code === '42P07') {
        logger.info('ℹ️ company_notes table/index already exists, skipping');
      } else {
        throw error;
      }
    }
  }
};

const addContractorDbsApprovalColumnsMigration: Migration = {
  version: '20260622_001_contractor_dbs_approval_columns',
  description: 'Add approved_by and approved_at columns to contractor_worker_dbs for audit trail',
  async up(db: any) {
    try {
      await db.execute(`ALTER TABLE contractor_worker_dbs ADD COLUMN IF NOT EXISTS approved_by TEXT`);
      await db.execute(`ALTER TABLE contractor_worker_dbs ADD COLUMN IF NOT EXISTS approved_at TIMESTAMP`);
      logger.info('✅ contractor_worker_dbs approval columns added');
    } catch (error: any) {
      if (error?.code === '42701' || error?.message?.includes('already exists')) {
        logger.info('ℹ️ contractor_worker_dbs approval columns already exist, skipping');
      } else {
        throw error;
      }
    }
  }
};

const addStaffDbsRequiredColumnMigration: Migration = {
  version: '20260624_001_staff_dbs_required',
  description: 'Add dbs_required column to staff table for per-staff DBS compliance tracking',
  async up(db: any) {
    try {
      await db.execute(`ALTER TABLE staff ADD COLUMN IF NOT EXISTS dbs_required BOOLEAN NOT NULL DEFAULT FALSE`);
      logger.info('✅ staff.dbs_required column ensured');
    } catch (err: any) {
      logger.info(`ℹ️ staff.dbs_required: ${(err?.message || '').substring(0, 80)}`);
    }
  }
};

const createStaffNotesTableMigration: Migration = {
  version: '20260624_002_staff_notes',
  description: 'Create staff_notes table for admin notes on staff members',
  async up(db: any) {
    try {
      await db.execute(`
        CREATE TABLE IF NOT EXISTS staff_notes (
          id          TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::text,
          staff_id    TEXT        NOT NULL,
          note        TEXT        NOT NULL,
          note_type   TEXT        NOT NULL DEFAULT 'general',
          added_by    TEXT        NOT NULL,
          created_at  TIMESTAMP   NOT NULL DEFAULT NOW()
        )
      `);
      await db.execute(`
        CREATE INDEX IF NOT EXISTS idx_staff_notes_staff_id ON staff_notes (staff_id)
      `);
      logger.info('✅ staff_notes table ensured');
    } catch (error: any) {
      const msg = error?.message || '';
      const code = error?.code;
      if (msg.includes('already exists') || code === '42P07') {
        logger.info('ℹ️ staff_notes table/index already exists, skipping');
      } else {
        throw error;
      }
    }
  }
};

const addWorkerDbsRequiredColumnMigration: Migration = {
  version: '20260625_001_worker_dbs_required',
  description: 'Add dbs_required column to contractor_workers for per-worker DBS compliance tracking',
  async up(db: any) {
    try {
      await db.execute(`ALTER TABLE contractor_workers ADD COLUMN IF NOT EXISTS dbs_required BOOLEAN NOT NULL DEFAULT FALSE`);
      logger.info('✅ contractor_workers.dbs_required column ensured');
    } catch (err: any) {
      logger.info(`ℹ️ contractor_workers.dbs_required: ${(err?.message || '').substring(0, 80)}`);
    }
  }
};

const fixOrphanedStaffSiteIdsMigration: Migration = {
  version: '20260626_002_fix_orphaned_staff_site_ids',
  description: 'Set site_id = NULL on staff records whose site_id does not match any row in the sites table (cleans up stale site references so staff appear in enterprise site lists)',
  async up(db: any) {
    try {
      const result = await db.execute(`
        UPDATE staff
        SET site_id = NULL
        WHERE site_id IS NOT NULL
          AND site_id NOT IN (SELECT id FROM sites)
      `);
      const count = result?.rowCount ?? result?.count ?? 0;
      if (count > 0) {
        logger.info(`✅ Cleared orphaned site_id on ${count} staff record(s)`);
      } else {
        logger.info('✅ No orphaned staff site_id values found');
      }
    } catch (err: any) {
      logger.warn(`⚠️ fix_orphaned_staff_site_ids: ${(err?.message || '').substring(0, 120)}`);
    }
  }
};

const addLoneWorkerSessionColumnsMigration: Migration = {
  version: '20260626_001_lone_worker_session_columns',
  description: 'Add check_ins_completed, escalations_fired, and site_id columns to lone_worker_sessions for customers where the table pre-existed without them',
  async up(db: any) {
    try {
      await db.execute(`ALTER TABLE lone_worker_sessions ADD COLUMN IF NOT EXISTS check_ins_completed INTEGER NOT NULL DEFAULT 0`);
      logger.info('✅ lone_worker_sessions.check_ins_completed column ensured');
    } catch (err: any) {
      logger.info(`ℹ️ lone_worker_sessions.check_ins_completed: ${(err?.message || '').substring(0, 80)}`);
    }
    try {
      await db.execute(`ALTER TABLE lone_worker_sessions ADD COLUMN IF NOT EXISTS escalations_fired INTEGER NOT NULL DEFAULT 0`);
      logger.info('✅ lone_worker_sessions.escalations_fired column ensured');
    } catch (err: any) {
      logger.info(`ℹ️ lone_worker_sessions.escalations_fired: ${(err?.message || '').substring(0, 80)}`);
    }
    try {
      await db.execute(`ALTER TABLE lone_worker_sessions ADD COLUMN IF NOT EXISTS site_id VARCHAR`);
      logger.info('✅ lone_worker_sessions.site_id column ensured');
    } catch (err: any) {
      logger.info(`ℹ️ lone_worker_sessions.site_id: ${(err?.message || '').substring(0, 80)}`);
    }
  }
};

export const missingTablesMigrations = [
  createVisitorHistoryTableMigration,
  ensureContractorTablesMigration,
  createUKHSDocumentSystemMigration,
  addEPassSentColumnMigration,
  createMembersTableMigration,
  ensureMembersTableProductionMigration,
  addStaffQrCodeColumnMigration,
  createStaffDbsTableMigration,
  addHrDocumentAttachmentsMigration,
  addDbsSoftDeleteMigration,
  createContractorWorkerDbsTableMigration,
  createWorkerCertificationTypesTableMigration,
  createContractorEquipmentMigration,
  fixWorkerCertOwnershipMigration,
  ensureLoneWorkerTablesMigration,
  createCompanyNotesTableMigration,
  addContractorDbsApprovalColumnsMigration,
  addStaffDbsRequiredColumnMigration,
  createStaffNotesTableMigration,
  addWorkerDbsRequiredColumnMigration,
  fixOrphanedStaffSiteIdsMigration,
  addLoneWorkerSessionColumnsMigration,
];