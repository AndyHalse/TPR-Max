import type { Migration } from './migrationRunner';
import { logger } from './utils/logger';

/**
 * CONTRACTOR TABLES MIGRATION SUITE
 * 
 * This file contains all migrations needed to add the complete contractor management
 * system to customer databases. These migrations create tables that match
 * the definitions in isolatedSchema.ts without customerId columns since
 * each customer has their own database.
 */

/**
 * Helper function to safely create pgcrypto extension without duplicate key errors
 */
async function ensurePgcrypto(db: any): Promise<void> {
  try {
    await db.execute(`CREATE EXTENSION IF NOT EXISTS pgcrypto`);
  } catch (error: any) {
    // PostgreSQL error code 23505 = duplicate key constraint violation
    // This means the extension already exists, which is fine
    if (error?.code === '23505' && error?.detail?.includes('pgcrypto')) {
      // Extension already exists, continue silently
      return;
    }
    // Re-throw other errors
    throw error;
  }
}

// Migration 1: Core Contractor Tables
export const createCoreContractorTablesMigration: Migration = {
  version: '20250917_002_create_core_contractor_tables',
  description: 'Create core contractor tables: contractor_companies, contractor_workers, contractor_documents',
  async up(db: any) {
    // Add pgcrypto extension for UUID generation
    await ensurePgcrypto(db);
    
    // Contractor Companies table
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

    // Contractor Workers table
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

    // Contractor Documents table
    await db.execute(`
      CREATE TABLE IF NOT EXISTS contractor_documents (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id VARCHAR REFERENCES contractor_companies(id),
        worker_id VARCHAR REFERENCES contractor_workers(id),
        document_name TEXT NOT NULL,
        document_type TEXT NOT NULL,
        document_url TEXT NOT NULL,
        expiry_date TIMESTAMP,
        uploaded_by VARCHAR NOT NULL REFERENCES users(id),
        uploaded_at TIMESTAMP DEFAULT NOW() NOT NULL,
        status TEXT DEFAULT 'pending' NOT NULL,
        approved_by VARCHAR REFERENCES users(id),
        approved_at TIMESTAMP,
        rejected_reason TEXT,
        ai_analysis_result TEXT,
        ai_confidence_score INTEGER DEFAULT 0,
        issued_by TEXT,
        policy_number TEXT,
        coverage_amount TEXT,
        is_active BOOLEAN DEFAULT true NOT NULL,
        created_at TIMESTAMP DEFAULT NOW() NOT NULL,
        updated_at TIMESTAMP DEFAULT NOW() NOT NULL
      )
    `);

    logger.info('✅ Created core contractor tables: contractor_companies, contractor_workers, contractor_documents');
  }
};

// Migration 2: Document Management System
export const createDocumentManagementMigration: Migration = {
  version: '20250917_003_create_document_management_tables',
  description: 'Create document management tables: compliance_documents, document_approvals, document_types',
  async up(db: any) {
    // Add pgcrypto extension for UUID generation
    await ensurePgcrypto(db);
    
    // Compliance Documents table
    await db.execute(`
      CREATE TABLE IF NOT EXISTS compliance_documents (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        document_name TEXT NOT NULL,
        document_type TEXT NOT NULL,
        is_required BOOLEAN DEFAULT true,
        applies_to_company BOOLEAN DEFAULT false,
        applies_to_worker BOOLEAN DEFAULT false,
        description TEXT,
        validity_period_months INTEGER DEFAULT 12,
        reminder_days_before INTEGER DEFAULT 30,
        document_category TEXT NOT NULL,
        priority TEXT DEFAULT 'medium',
        created_at TIMESTAMP DEFAULT NOW() NOT NULL,
        updated_at TIMESTAMP DEFAULT NOW() NOT NULL
      )
    `);

    // Document Approvals table
    await db.execute(`
      CREATE TABLE IF NOT EXISTS document_approvals (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        document_id VARCHAR NOT NULL REFERENCES contractor_documents(id),
        reviewed_by VARCHAR NOT NULL REFERENCES users(id),
        reviewed_at TIMESTAMP DEFAULT NOW() NOT NULL,
        status TEXT NOT NULL,
        comments TEXT,
        changes_required TEXT[] DEFAULT ARRAY[]::TEXT[],
        follow_up_required BOOLEAN DEFAULT false,
        follow_up_date TIMESTAMP,
        approval_level TEXT DEFAULT 'standard',
        created_at TIMESTAMP DEFAULT NOW() NOT NULL
      )
    `);

    // Document Types table
    await db.execute(`
      CREATE TABLE IF NOT EXISTS document_types (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        type_name TEXT NOT NULL UNIQUE,
        description TEXT,
        category TEXT NOT NULL,
        is_company_level BOOLEAN DEFAULT false,
        is_required BOOLEAN DEFAULT true,
        has_expiry_date BOOLEAN DEFAULT true,
        default_validity_months INTEGER DEFAULT 12,
        auto_reminder_enabled BOOLEAN DEFAULT true,
        reminder_days_before INTEGER DEFAULT 30,
        allowed_file_types TEXT[] DEFAULT ARRAY['pdf', 'jpg', 'png'],
        max_file_size_mb INTEGER DEFAULT 10,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT NOW() NOT NULL,
        updated_at TIMESTAMP DEFAULT NOW() NOT NULL
      )
    `);

    logger.info('✅ Created document management tables: compliance_documents, document_approvals, document_types');
  }
};

// Migration 3: Worker Competencies and Certifications
export const createWorkerCompetenciesMigration: Migration = {
  version: '20250917_004_create_worker_competencies_tables',
  description: 'Create worker competencies tables: worker_competencies, nvq_qualifications, worker_certifications',
  async up(db: any) {
    // Add pgcrypto extension for UUID generation
    await ensurePgcrypto(db);
    
    // Worker Competencies table
    await db.execute(`
      CREATE TABLE IF NOT EXISTS worker_competencies (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        worker_id VARCHAR NOT NULL REFERENCES contractor_workers(id),
        competency_type TEXT NOT NULL,
        competency_name TEXT NOT NULL,
        level TEXT,
        issuing_body TEXT,
        certification_number TEXT,
        issue_date TIMESTAMP,
        expiry_date TIMESTAMP,
        document_url TEXT,
        verified_by VARCHAR REFERENCES users(id),
        verified_at TIMESTAMP,
        status TEXT DEFAULT 'active',
        continuous_assessment_required BOOLEAN DEFAULT false,
        last_assessment_date TIMESTAMP,
        next_assessment_due TIMESTAMP,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT NOW() NOT NULL,
        updated_at TIMESTAMP DEFAULT NOW() NOT NULL
      )
    `);

    // NVQ Qualifications table
    await db.execute(`
      CREATE TABLE IF NOT EXISTS nvq_qualifications (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        worker_id VARCHAR NOT NULL REFERENCES contractor_workers(id),
        nvq_level TEXT NOT NULL,
        subject_area TEXT NOT NULL,
        qualification_title TEXT NOT NULL,
        awarding_body TEXT NOT NULL,
        qualification_number TEXT,
        start_date TIMESTAMP,
        completion_date TIMESTAMP,
        expiry_date TIMESTAMP,
        status TEXT DEFAULT 'active',
        portfolio_url TEXT,
        assessor_name TEXT,
        assessor_contact_details TEXT,
        certificate_url TEXT,
        verified_by VARCHAR REFERENCES users(id),
        verified_at TIMESTAMP,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT NOW() NOT NULL,
        updated_at TIMESTAMP DEFAULT NOW() NOT NULL
      )
    `);

    // Worker Certifications table
    await db.execute(`
      CREATE TABLE IF NOT EXISTS worker_certifications (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        worker_id VARCHAR NOT NULL REFERENCES contractor_workers(id),
        certification_type TEXT NOT NULL,
        certification_number TEXT,
        issuer TEXT,
        issued_date TIMESTAMP,
        expiry_date TIMESTAMP,
        status TEXT NOT NULL DEFAULT 'valid',
        document_url TEXT,
        notes TEXT,
        created_at TIMESTAMP DEFAULT NOW() NOT NULL,
        updated_at TIMESTAMP DEFAULT NOW() NOT NULL
      )
    `);

    logger.info('✅ Created worker competencies tables: worker_competencies, nvq_qualifications, worker_certifications');
  }
};

// Migration 4: Safety Card System and RAMS
export const createSafetySystemMigration: Migration = {
  version: '20250917_005_create_safety_system_tables',
  description: 'Create safety system tables: card_offences, card_issues, rams_documents',
  async up(db: any) {
    // Add pgcrypto extension for UUID generation
    await ensurePgcrypto(db);
    
    // Card Offences table
    await db.execute(`
      CREATE TABLE IF NOT EXISTS card_offences (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        offence_name TEXT NOT NULL,
        offence_description TEXT,
        card_type TEXT NOT NULL,
        is_active BOOLEAN DEFAULT true NOT NULL,
        site_configurable BOOLEAN DEFAULT true NOT NULL,
        created_at TIMESTAMP DEFAULT NOW() NOT NULL,
        updated_at TIMESTAMP DEFAULT NOW() NOT NULL
      )
    `);

    // Card Issues table
    await db.execute(`
      CREATE TABLE IF NOT EXISTS card_issues (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        worker_id VARCHAR NOT NULL REFERENCES contractor_workers(id),
        offence_id VARCHAR NOT NULL REFERENCES card_offences(id),
        card_type TEXT NOT NULL,
        issued_by VARCHAR NOT NULL REFERENCES users(id),
        issued_at TIMESTAMP DEFAULT NOW() NOT NULL,
        description TEXT NOT NULL,
        witness TEXT,
        location TEXT,
        photos TEXT[] DEFAULT ARRAY[]::TEXT[],
        status TEXT DEFAULT 'active' NOT NULL,
        ban_end_date TIMESTAMP,
        appeal_notes TEXT,
        appealed_at TIMESTAMP,
        appeals_count INTEGER DEFAULT 0
      )
    `);

    // RAMS Documents table
    await db.execute(`
      CREATE TABLE IF NOT EXISTS rams_documents (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id VARCHAR REFERENCES contractor_companies(id),
        department_id VARCHAR REFERENCES departments(id),
        rams_id_ref TEXT NOT NULL,
        document_name TEXT NOT NULL,
        document_url TEXT NOT NULL,
        expiry_date TIMESTAMP NOT NULL,
        status TEXT NOT NULL DEFAULT 'valid',
        uploaded_by VARCHAR REFERENCES users(id),
        uploaded_at TIMESTAMP DEFAULT NOW() NOT NULL,
        reviewed_by VARCHAR REFERENCES users(id),
        reviewed_at TIMESTAMP,
        review_notes TEXT,
        alert_days_before INTEGER DEFAULT 14,
        last_alert_sent TIMESTAMP,
        is_active BOOLEAN DEFAULT true NOT NULL
      )
    `);

    logger.info('✅ Created safety system tables: card_offences, card_issues, rams_documents');
  }
};

// Migration 5: CO2 and Environmental Tracking
export const createCO2TrackingMigration: Migration = {
  version: '20250917_006_create_co2_tracking_tables',
  description: 'Create CO2 tracking tables: co2_records, co2_emissions_data, co2_monthly_summaries, co2_sustainability_reports',
  async up(db: any) {
    // Add pgcrypto extension for UUID generation
    await ensurePgcrypto(db);
    
    // CO2 Records table
    await db.execute(`
      CREATE TABLE IF NOT EXISTS co2_records (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id VARCHAR REFERENCES contractor_companies(id),
        worker_id VARCHAR REFERENCES contractor_workers(id),
        record_type TEXT NOT NULL,
        record_date TIMESTAMP NOT NULL,
        co2_amount TEXT NOT NULL,
        unit TEXT DEFAULT 'kg' NOT NULL,
        source TEXT,
        distance TEXT,
        fuel_type TEXT,
        description TEXT,
        calculation_method TEXT,
        verified BOOLEAN DEFAULT false,
        verified_by VARCHAR REFERENCES users(id),
        verified_at TIMESTAMP,
        reporting_period TEXT,
        created_at TIMESTAMP DEFAULT NOW() NOT NULL
      )
    `);

    // CO2 Emissions Data table
    await db.execute(`
      CREATE TABLE IF NOT EXISTS co2_emissions_data (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        worker_id VARCHAR NOT NULL REFERENCES contractor_workers(id),
        company_id VARCHAR NOT NULL REFERENCES contractor_companies(id),
        -- Distance data
        worker_postcode TEXT NOT NULL,
        company_address TEXT NOT NULL,
        distance_miles DOUBLE PRECISION NOT NULL,
        distance_km DOUBLE PRECISION NOT NULL,
        route_type TEXT DEFAULT 'mixed',
        estimated_travel_time TEXT,
        -- Transport and emissions
        transport_method TEXT NOT NULL DEFAULT 'car_diesel',
        emission_factor TEXT NOT NULL,
        daily_co2_kg TEXT NOT NULL,
        monthly_co2_kg TEXT NOT NULL,
        annual_co2_kg TEXT NOT NULL,
        -- Calculation metadata
        calculated_at TIMESTAMP DEFAULT NOW() NOT NULL,
        calculated_by TEXT DEFAULT 'openai',
        last_updated TIMESTAMP DEFAULT NOW() NOT NULL,
        is_active BOOLEAN DEFAULT true NOT NULL,
        -- Working pattern
        working_days_per_month INTEGER DEFAULT 22 NOT NULL,
        created_at TIMESTAMP DEFAULT NOW() NOT NULL
      )
    `);

    // CO2 Monthly Summaries table
    await db.execute(`
      CREATE TABLE IF NOT EXISTS co2_monthly_summaries (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id VARCHAR REFERENCES contractor_companies(id),
        -- Time period
        year INTEGER NOT NULL,
        month INTEGER NOT NULL,
        -- Aggregated data
        total_workers INTEGER NOT NULL,
        total_monthly_co2_kg TEXT NOT NULL,
        average_co2_per_worker TEXT NOT NULL,
        -- Transport method breakdown
        transport_breakdown TEXT,
        -- Distance analysis
        average_distance_miles DOUBLE PRECISION,
        longest_commute_miles DOUBLE PRECISION,
        shortest_commute_miles DOUBLE PRECISION,
        -- Comparison metrics
        previous_month_co2_kg TEXT,
        percentage_change TEXT,
        -- Sustainability metrics
        carbon_reduction_target TEXT,
        target_achieved BOOLEAN DEFAULT false,
        sustainability_score INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT NOW() NOT NULL,
        updated_at TIMESTAMP DEFAULT NOW() NOT NULL
      )
    `);

    // CO2 Sustainability Reports table
    await db.execute(`
      CREATE TABLE IF NOT EXISTS co2_sustainability_reports (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id VARCHAR REFERENCES contractor_companies(id),
        -- Report metadata
        report_type TEXT NOT NULL DEFAULT 'monthly',
        report_period TEXT NOT NULL,
        report_title TEXT NOT NULL,
        -- Report content (AI generated)
        executive_summary TEXT NOT NULL,
        current_emissions_status TEXT NOT NULL,
        environmental_impact_analysis TEXT NOT NULL,
        reduction_recommendations TEXT NOT NULL,
        industry_comparison TEXT NOT NULL,
        action_plan TEXT NOT NULL,
        full_report_content TEXT NOT NULL,
        -- Report statistics
        total_workers_covered INTEGER NOT NULL,
        total_co2_analyzed TEXT NOT NULL,
        top_recommendation TEXT,
        potential_savings TEXT,
        -- Generation metadata
        generated_at TIMESTAMP DEFAULT NOW() NOT NULL,
        generated_by TEXT DEFAULT 'openai',
        ai_model TEXT DEFAULT 'gpt-4',
        generation_time_ms INTEGER,
        is_published BOOLEAN DEFAULT false,
        published_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW() NOT NULL
      )
    `);

    logger.info('✅ Created CO2 tracking tables: co2_records, co2_emissions_data, co2_monthly_summaries, co2_sustainability_reports');
  }
};

// Migration 6: Induction System
export const createInductionSystemMigration: Migration = {
  version: '20250917_007_create_induction_system_tables',
  description: 'Create induction system tables: induction_tokens, induction_questions, induction_settings, induction_answers',
  async up(db: any) {
    // Add pgcrypto extension for UUID generation
    await ensurePgcrypto(db);
    
    // Induction Tokens table
    await db.execute(`
      CREATE TABLE IF NOT EXISTS induction_tokens (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        worker_id VARCHAR REFERENCES contractor_workers(id),
        visitor_id VARCHAR,
        staff_id VARCHAR,
        person_type TEXT NOT NULL DEFAULT 'contractor',
        person_name TEXT NOT NULL DEFAULT '',
        person_email TEXT NOT NULL DEFAULT '',
        token TEXT NOT NULL UNIQUE,
        status TEXT NOT NULL DEFAULT 'pending',
        email_sent BOOLEAN DEFAULT false,
        email_sent_at TIMESTAMP,
        video_watched BOOLEAN DEFAULT false,
        video_watched_at TIMESTAMP,
        quiz_attempts INTEGER DEFAULT 0,
        quiz_completed BOOLEAN DEFAULT false,
        quiz_completed_at TIMESTAMP,
        quiz_score INTEGER DEFAULT 0,
        pass_threshold INTEGER DEFAULT 80,
        expires_at TIMESTAMP NOT NULL,
        completed_at TIMESTAMP,
        ip_address TEXT,
        user_agent TEXT,
        created_at TIMESTAMP DEFAULT NOW() NOT NULL
      )
    `);

    // Induction Questions table
    await db.execute(`
      CREATE TABLE IF NOT EXISTS induction_questions (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        question_text TEXT NOT NULL,
        question_type TEXT NOT NULL DEFAULT 'multiple_choice',
        correct_answer TEXT NOT NULL,
        option_a TEXT,
        option_b TEXT,
        option_c TEXT,
        option_d TEXT,
        explanation TEXT,
        category TEXT NOT NULL,
        role_type TEXT NOT NULL DEFAULT 'contractor',
        video_id VARCHAR,
        is_ai_generated BOOLEAN DEFAULT false NOT NULL,
        is_active BOOLEAN DEFAULT true NOT NULL,
        order_index INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT NOW() NOT NULL
      )
    `);

    // Induction Settings table
    await db.execute(`
      CREATE TABLE IF NOT EXISTS induction_settings (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        role_type TEXT NOT NULL,
        video_title TEXT NOT NULL,
        video_url TEXT NOT NULL,
        video_description TEXT,
        video_duration_minutes INTEGER DEFAULT 15,
        video_format TEXT DEFAULT 'interactive_slides' NOT NULL,
        model_type TEXT DEFAULT 'gpt-5' NOT NULL,
        pass_percentage INTEGER DEFAULT 80,
        is_active BOOLEAN DEFAULT true NOT NULL,
        created_at TIMESTAMP DEFAULT NOW() NOT NULL,
        updated_at TIMESTAMP DEFAULT NOW() NOT NULL
      )
    `);

    // Induction Answers table
    await db.execute(`
      CREATE TABLE IF NOT EXISTS induction_answers (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        token_id VARCHAR NOT NULL REFERENCES induction_tokens(id),
        question_id VARCHAR NOT NULL REFERENCES induction_questions(id),
        attempt_number INTEGER NOT NULL DEFAULT 1,
        selected_answer TEXT NOT NULL,
        is_correct BOOLEAN NOT NULL,
        answered_at TIMESTAMP DEFAULT NOW() NOT NULL
      )
    `);

    logger.info('✅ Created induction system tables: induction_tokens, induction_questions, induction_settings, induction_answers');
  }
};

// Migration 7: Contractor Operations and Enhanced Features
export const createContractorOperationsMigration: Migration = {
  version: '20250917_008_create_contractor_operations_tables',
  description: 'Create contractor operations tables: contractor_visits, contractor_prebookings, local_labour_records, enhanced_company_details',
  async up(db: any) {
    // Add pgcrypto extension for UUID generation
    await ensurePgcrypto(db);
    
    // Contractor Visits table
    await db.execute(`
      CREATE TABLE IF NOT EXISTS contractor_visits (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        worker_id VARCHAR REFERENCES contractor_workers(id) NOT NULL,
        company_id VARCHAR REFERENCES contractor_companies(id) NOT NULL,
        purpose TEXT DEFAULT 'Work',
        checked_in_at TIMESTAMP DEFAULT NOW() NOT NULL,
        checked_out_at TIMESTAMP,
        duration TEXT,
        host_staff_id VARCHAR REFERENCES staff(id),
        host_name TEXT,
        hs_rules_accepted BOOLEAN DEFAULT false,
        hs_rules_accepted_at TIMESTAMP,
        induction_completed BOOLEAN DEFAULT false,
        induction_completed_at TIMESTAMP,
        e_pass_sent BOOLEAN DEFAULT false,
        e_pass_sent_at TIMESTAMP,
        checkout_type TEXT,
        qr_code TEXT UNIQUE,
        pass_url TEXT,
        notes TEXT,
        created_at TIMESTAMP DEFAULT NOW() NOT NULL
      )
    `);

    // Local Labour Records table
    await db.execute(`
      CREATE TABLE IF NOT EXISTS local_labour_records (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        worker_id VARCHAR NOT NULL REFERENCES contractor_workers(id),
        company_id VARCHAR NOT NULL REFERENCES contractor_companies(id),
        postcode TEXT NOT NULL,
        local_radius INTEGER DEFAULT 20 NOT NULL,
        is_local BOOLEAN DEFAULT false NOT NULL,
        address TEXT,
        travel_distance TEXT,
        transport_method TEXT,
        local_hire_date TIMESTAMP,
        skills TEXT[] DEFAULT ARRAY[]::TEXT[],
        apprenticeship_level TEXT,
        is_apprentice BOOLEAN DEFAULT false,
        training_provider TEXT,
        recorded_at TIMESTAMP DEFAULT NOW() NOT NULL,
        recorded_by VARCHAR REFERENCES users(id)
      )
    `);

    // Enhanced Company Details table
    await db.execute(`
      CREATE TABLE IF NOT EXISTS enhanced_company_details (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id VARCHAR REFERENCES contractor_companies(id),
        department_id VARCHAR REFERENCES departments(id),
        rams_id_ref TEXT,
        rams_expiry_date TIMESTAMP,
        rams_document_url TEXT,
        rams_uploaded_at TIMESTAMP,
        rams_last_alert_sent TIMESTAMP,
        updated_at TIMESTAMP DEFAULT NOW() NOT NULL
      )
    `);

    logger.info('✅ Created contractor operations tables: contractor_visits, local_labour_records, enhanced_company_details');
  }
};

// Migration 8: UK H&S Document Management System
export const createUKHSDocumentSystemMigration: Migration = {
  version: '20250917_009_create_uk_hs_document_system_tables',
  description: 'Create UK H&S document system tables: uk_hs_document_templates, worker_document_assignments, worker_document_acceptances, document_auto_fill_mapping',
  async up(db: any) {
    // Add pgcrypto extension for UUID generation
    await ensurePgcrypto(db);
    
    // UK H&S Document Templates table
    await db.execute(`
      CREATE TABLE IF NOT EXISTS uk_hs_document_templates (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        document_name TEXT NOT NULL,
        document_type TEXT NOT NULL,
        description TEXT,
        is_required BOOLEAN DEFAULT true,
        category TEXT NOT NULL,
        validity_period_months INTEGER DEFAULT 12,
        reminder_days_before INTEGER DEFAULT 30,
        allowed_file_types TEXT[] DEFAULT ARRAY['pdf', 'jpg', 'png'],
        max_file_size_mb INTEGER DEFAULT 10,
        auto_fill_enabled BOOLEAN DEFAULT false,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT NOW() NOT NULL,
        updated_at TIMESTAMP DEFAULT NOW() NOT NULL
      )
    `);

    // Worker Document Assignments table
    await db.execute(`
      CREATE TABLE IF NOT EXISTS worker_document_assignments (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        worker_id VARCHAR NOT NULL REFERENCES contractor_workers(id),
        template_id VARCHAR NOT NULL REFERENCES uk_hs_document_templates(id),
        assigned_by VARCHAR NOT NULL REFERENCES users(id),
        assigned_at TIMESTAMP DEFAULT NOW() NOT NULL,
        due_date TIMESTAMP NOT NULL,
        status TEXT DEFAULT 'pending',
        priority TEXT DEFAULT 'normal',
        notes TEXT,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT NOW() NOT NULL,
        updated_at TIMESTAMP DEFAULT NOW() NOT NULL
      )
    `);

    // Worker Document Acceptances table
    await db.execute(`
      CREATE TABLE IF NOT EXISTS worker_document_acceptances (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        assignment_id VARCHAR NOT NULL REFERENCES worker_document_assignments(id),
        worker_id VARCHAR NOT NULL REFERENCES contractor_workers(id),
        template_id VARCHAR NOT NULL REFERENCES uk_hs_document_templates(id),
        document_url TEXT NOT NULL,
        original_file_name TEXT NOT NULL,
        file_size_bytes INTEGER NOT NULL,
        file_type TEXT NOT NULL,
        submitted_at TIMESTAMP DEFAULT NOW() NOT NULL,
        submitted_by VARCHAR NOT NULL REFERENCES contractor_workers(id),
        -- Review and approval
        reviewed_by VARCHAR REFERENCES users(id),
        reviewed_at TIMESTAMP,
        status TEXT DEFAULT 'pending',
        approval_comments TEXT,
        rejection_reason TEXT,
        expiry_date TIMESTAMP,
        -- Auto-fill and AI processing
        auto_fill_data TEXT,
        ai_analysis_result TEXT,
        ai_confidence_score INTEGER DEFAULT 0,
        -- Document metadata
        extracted_text TEXT,
        document_hash TEXT,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT NOW() NOT NULL,
        updated_at TIMESTAMP DEFAULT NOW() NOT NULL
      )
    `);

    // Document Auto-fill Mapping table
    await db.execute(`
      CREATE TABLE IF NOT EXISTS document_auto_fill_mapping (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        template_id VARCHAR NOT NULL REFERENCES uk_hs_document_templates(id),
        field_name TEXT NOT NULL,
        field_type TEXT NOT NULL,
        extraction_pattern TEXT,
        ocr_region TEXT,
        is_required BOOLEAN DEFAULT false,
        validation_rules TEXT,
        target_worker_field TEXT,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT NOW() NOT NULL,
        updated_at TIMESTAMP DEFAULT NOW() NOT NULL
      )
    `);

    logger.info('✅ Created UK H&S document system tables: uk_hs_document_templates, worker_document_assignments, worker_document_acceptances, document_auto_fill_mapping');
  }
};

// Migration 9: AI Generated Images
export const createAIImagesMigration: Migration = {
  version: '20250917_010_create_ai_images_table',
  description: 'Create AI generated images table for induction videos',
  async up(db: any) {
    // Add pgcrypto extension for UUID generation
    await ensurePgcrypto(db);
    
    // AI Generated Images table
    await db.execute(`
      CREATE TABLE IF NOT EXISTS ai_generated_images (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        prompt TEXT NOT NULL,
        image_url TEXT NOT NULL,
        image_type TEXT NOT NULL,
        category TEXT NOT NULL,
        tags TEXT[] DEFAULT ARRAY[]::TEXT[],
        ai_model TEXT DEFAULT 'dall-e-3',
        generation_time_ms INTEGER,
        usage_count INTEGER DEFAULT 0,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT NOW() NOT NULL,
        updated_at TIMESTAMP DEFAULT NOW() NOT NULL
      )
    `);

    logger.info('✅ Created AI images table: ai_generated_images');
  }
};

// Migration 10: Add video storage columns to induction_settings
export const addInductionVideoStorageMigration: Migration = {
  version: '20260226_011_add_induction_video_storage',
  description: 'Add generatedHtml, scenesData, generatedAt, questionsGenerated to induction_settings for customer-isolated video content',
  async up(db: any) {
    await db.execute(`
      ALTER TABLE induction_settings 
      ADD COLUMN IF NOT EXISTS generated_html TEXT,
      ADD COLUMN IF NOT EXISTS scenes_data TEXT,
      ADD COLUMN IF NOT EXISTS generated_at TIMESTAMP,
      ADD COLUMN IF NOT EXISTS questions_generated BOOLEAN DEFAULT false
    `);
    logger.info('✅ Added video storage columns to induction_settings');
  }
};

// Migration 12: Add kiosk_enabled and send_link_enabled to induction_settings
export const addInductionKioskEnabledMigration: Migration = {
  version: '20260226_012_add_induction_kiosk_enabled',
  description: 'Add kiosk_enabled and send_link_enabled columns to induction_settings for kiosk and email link control',
  async up(db: any) {
    await db.execute(`
      ALTER TABLE induction_settings 
      ADD COLUMN IF NOT EXISTS kiosk_enabled BOOLEAN NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS send_link_enabled BOOLEAN NOT NULL DEFAULT true
    `);
    logger.info('✅ Added kiosk_enabled and send_link_enabled to induction_settings');
  }
};

// Migration 014: Fix induction_tokens - make worker_id nullable + add universal person columns
export const fixInductionTokensUniversalMigration: Migration = {
  version: '20260226_014_fix_induction_tokens_universal',
  description: 'Make worker_id nullable on induction_tokens and add person_type, person_name, person_email, visitor_id, staff_id for universal send-link support',
  async up(db: any) {
    // Drop NOT NULL constraint on worker_id (allows standalone send-link without a worker record)
    await db.execute(`
      ALTER TABLE induction_tokens ALTER COLUMN worker_id DROP NOT NULL
    `);
    // Add universal person columns if they don't exist
    await db.execute(`
      ALTER TABLE induction_tokens
        ADD COLUMN IF NOT EXISTS person_type TEXT NOT NULL DEFAULT 'contractor',
        ADD COLUMN IF NOT EXISTS person_name TEXT NOT NULL DEFAULT '',
        ADD COLUMN IF NOT EXISTS person_email TEXT NOT NULL DEFAULT '',
        ADD COLUMN IF NOT EXISTS visitor_id VARCHAR,
        ADD COLUMN IF NOT EXISTS staff_id VARCHAR
    `);
    logger.info('✅ Fixed induction_tokens: worker_id now nullable, added universal person columns');
  }
};

// Migration 015: Add customer_id to RAMS tables for multi-tenant isolation
export const addRamsCustomerIdMigration: Migration = {
  version: '20260501_015_add_rams_customer_id',
  description: 'Add customer_id to rams_documents, rams_acknowledgements, rams_audit_log for strict tenant isolation',
  async up(db: any) {
    await db.execute(`
      ALTER TABLE rams_documents
        ADD COLUMN IF NOT EXISTS customer_id TEXT NOT NULL DEFAULT ''
    `);
    await db.execute(`
      ALTER TABLE rams_acknowledgements
        ADD COLUMN IF NOT EXISTS customer_id TEXT NOT NULL DEFAULT ''
    `);
    await db.execute(`
      ALTER TABLE rams_audit_log
        ADD COLUMN IF NOT EXISTS customer_id TEXT NOT NULL DEFAULT ''
    `);
    logger.info('✅ Added customer_id to RAMS tables for multi-tenant isolation');
    logger.warn('⚠️  Existing RAMS rows (if any) have customer_id set to empty string — manual data review required to assign them to the correct customer');
  }
};

export const addCustomerIdToInvitationsAndImagesMigration: Migration = {
  version: '20260501_016_add_customer_id_to_invitations_and_images',
  description: 'Add customer_id to user_invitations and ai_generated_images for strict tenant isolation',
  async up(db: any) {
    await db.execute(`
      ALTER TABLE user_invitations
        ADD COLUMN IF NOT EXISTS customer_id TEXT NOT NULL DEFAULT ''
    `);
    await db.execute(`
      ALTER TABLE ai_generated_images
        ADD COLUMN IF NOT EXISTS customer_id TEXT NOT NULL DEFAULT ''
    `);
    logger.info('✅ Added customer_id to user_invitations and ai_generated_images for multi-tenant isolation');
    logger.warn('⚠️  Existing rows (if any) have customer_id set to empty string — manual data review required to assign them to the correct customer');
  }
};

// Migration 017: Add custom_video_url to induction_settings for customer-uploaded video
export const addInductionCustomVideoUrlMigration: Migration = {
  version: '20260527_017_add_induction_custom_video_url',
  description: 'Add custom_video_url column to induction_settings for customer-uploaded video storage path',
  async up(db: any) {
    await db.execute(`
      ALTER TABLE induction_settings
        ADD COLUMN IF NOT EXISTS custom_video_url TEXT
    `);
    logger.info('✅ Added custom_video_url to induction_settings');
  }
};

// Export all migrations
export const contractorMigrations: Migration[] = [
  createCoreContractorTablesMigration,
  createDocumentManagementMigration,
  createWorkerCompetenciesMigration,
  createSafetySystemMigration,
  createCO2TrackingMigration,
  createInductionSystemMigration,
  createContractorOperationsMigration,
  createUKHSDocumentSystemMigration,
  createAIImagesMigration,
  addInductionVideoStorageMigration,
  addInductionKioskEnabledMigration,
  fixInductionTokensUniversalMigration,
  addRamsCustomerIdMigration,
  addCustomerIdToInvitationsAndImagesMigration,
  addInductionCustomVideoUrlMigration,
];