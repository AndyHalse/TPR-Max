import type { Migration } from './migrationRunner';

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
    console.log('🔄 Creating visitor_history table...');

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
        -- Tenant information
        visiting_tenant_id VARCHAR REFERENCES tenant_companies(id),
        tenant_company_name TEXT,
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

    console.log('✅ Created visitor_history table successfully');
  }
};

// Migration to ensure contractor tables exist (backup if contractorMigrations didn't run)
export const ensureContractorTablesMigration: Migration = {
  version: '20250918_003_ensure_contractor_tables',
  description: 'Ensure contractor tables exist (contractor_companies, contractor_workers, etc.)',
  async up(db: any) {
    console.log('🔄 Ensuring contractor tables exist...');

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

    console.log('✅ Ensured all contractor tables exist successfully');
  }
};

// Migration to create UK H&S document system tables
export const createUKHSDocumentSystemMigration: Migration = {
  version: '20250918_004_create_uk_hs_document_system',
  description: 'Create UK H&S document system tables: uk_hs_document_templates, worker_document_assignments, worker_document_acceptances, document_auto_fill_mapping',
  async up(db: any) {
    console.log('🔄 Creating UK H&S document system tables...');

    // Add pgcrypto extension for UUID generation
    await ensurePgcrypto(db);

    // Create uk_hs_document_templates table
    await db.execute(`
      CREATE TABLE IF NOT EXISTS uk_hs_document_templates (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        template_name TEXT NOT NULL,
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

    console.log('✅ Created UK H&S document system tables successfully');
  }
};

export const missingTablesMigrations = [
  createVisitorHistoryTableMigration,
  ensureContractorTablesMigration,
  createUKHSDocumentSystemMigration
];