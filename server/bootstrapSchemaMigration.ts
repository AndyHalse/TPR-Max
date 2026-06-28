import type { Migration } from './migrationRunner';
import { logger } from './utils/logger';

export const bootstrapSchemaMigration: Migration = {
  version: '000_bootstrap_schema',
  description: 'Create all core tables for a new customer schema',
  async up(db: any) {
    try {
      await db.execute(`CREATE EXTENSION IF NOT EXISTS pgcrypto`);
    } catch (error: any) {
      if (error?.code === '23505' && error?.detail?.includes('pgcrypto')) {
      } else {
        throw error;
      }
    }

    await db.execute(`
      CREATE TABLE IF NOT EXISTS users (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        username TEXT NOT NULL UNIQUE,
        password TEXT NOT NULL,
        email TEXT,
        role TEXT NOT NULL DEFAULT 'user',
        first_name TEXT,
        last_name TEXT,
        is_active BOOLEAN DEFAULT true,
        last_login_at TIMESTAMP,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    await db.execute(`
      CREATE TABLE IF NOT EXISTS departments (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        name TEXT NOT NULL UNIQUE,
        description TEXT,
        color TEXT NOT NULL DEFAULT 'bg-blue-500',
        is_active BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    await db.execute(`
      CREATE TABLE IF NOT EXISTS company_settings (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        company_name TEXT NOT NULL DEFAULT 'ACS Safety & Security Ltd',
        logo_url TEXT,
        address TEXT DEFAULT '',
        phone TEXT DEFAULT '',
        website TEXT DEFAULT '',
        email TEXT DEFAULT '',
        email_reports_enabled BOOLEAN DEFAULT false,
        report_frequency TEXT DEFAULT 'weekly',
        report_recipients TEXT[] DEFAULT ARRAY['admin@company.com'],
        last_report_sent TIMESTAMP,
        smtp_host TEXT DEFAULT '',
        smtp_port TEXT DEFAULT '587',
        smtp_security TEXT DEFAULT 'STARTTLS',
        smtp_username TEXT DEFAULT '',
        smtp_password TEXT DEFAULT '',
        smtp_from_email TEXT DEFAULT '',
        smtp_from_name TEXT DEFAULT '',
        smtp_reply_to TEXT DEFAULT '',
        smtp_auth_method TEXT DEFAULT 'LOGIN',
        smtp_connection_timeout TEXT DEFAULT '30',
        smtp_test_email_sent BOOLEAN DEFAULT false,
        smtp_last_tested TIMESTAMP,
        enable_daily_reset BOOLEAN DEFAULT true,
        daily_reset_time TEXT DEFAULT '00:00',
        daily_reset_timezone TEXT DEFAULT 'Europe/London',
        grace_period_minutes TEXT DEFAULT '15',
        enable_weekend_reset BOOLEAN DEFAULT false,
        enable_holiday_reset BOOLEAN DEFAULT false,
        notify_forgotten_checkouts BOOLEAN DEFAULT true,
        last_daily_reset TIMESTAMP,
        allow_manual_reset BOOLEAN DEFAULT true,
        reset_log_retention_days TEXT DEFAULT '90',
        enable_24x7_operations BOOLEAN DEFAULT false,
        alert_before_reset BOOLEAN DEFAULT true,
        alert_minutes_before TEXT DEFAULT '30',
        background_color TEXT DEFAULT '#f8fafc',
        foreground_color TEXT DEFAULT '#1e293b',
        variable_text_color TEXT DEFAULT '#374151',
        accent_color TEXT DEFAULT '#3b82f6',
        banner_url TEXT,
        theme TEXT DEFAULT 'light',
        selected_printer TEXT DEFAULT 'PDF Printer',
        enable_qr_codes BOOLEAN DEFAULT true,
        enable_2d_barcodes BOOLEAN DEFAULT false,
        barcode_format TEXT DEFAULT 'QR_CODE',
        print_quality TEXT DEFAULT 'normal',
        id_card_printer TEXT DEFAULT '',
        id_card_print_quality TEXT DEFAULT 'high',
        id_card_paper_size TEXT DEFAULT 'cr80',
        id_card_orientation TEXT DEFAULT 'landscape',
        id_card_design TEXT DEFAULT '[]',
        visitor_pass_design TEXT DEFAULT '[]',
        contractor_pass_design TEXT DEFAULT '[]',
        thermal_selected_printer TEXT DEFAULT 'tec',
        thermal_print_method TEXT DEFAULT 'direct',
        thermal_print_quality TEXT DEFAULT 'reception',
        thermal_printer_settings TEXT DEFAULT '{}',
        thermal_zebra_settings TEXT DEFAULT '{}',
        tec_printer_name TEXT DEFAULT 'TEC B-FV4D Desktop Printer',
        tec_printer_model TEXT DEFAULT 'B-FV4D',
        tec_printer_ip TEXT DEFAULT '',
        tec_printer_port TEXT DEFAULT '9100',
        tec_label_width TEXT DEFAULT '85',
        tec_label_height TEXT DEFAULT '65',
        zebra_printer_ip TEXT DEFAULT '',
        zebra_printer_port TEXT DEFAULT '9100',
        zebra_printer_model TEXT DEFAULT 'GK420d',
        biostar_enabled BOOLEAN DEFAULT false,
        biostar_server_url TEXT DEFAULT '',
        biostar_api_key TEXT DEFAULT '',
        biostar_username TEXT DEFAULT '',
        biostar_password TEXT DEFAULT '',
        biostar_database_id TEXT DEFAULT '1',
        biostar_sync_interval TEXT DEFAULT '300',
        biostar_last_sync TIMESTAMP,
        biometric_devices TEXT[] DEFAULT ARRAY[]::TEXT[],
        reader_settings TEXT DEFAULT '{}',
        openai_model TEXT DEFAULT 'gpt-5',
        claude_model TEXT DEFAULT 'claude-3-5-sonnet',
        openai_temperature TEXT DEFAULT '0.7',
        openai_max_tokens TEXT DEFAULT '4000',
        video_quality_preference TEXT DEFAULT 'high',
        enable_advanced_video_features BOOLEAN DEFAULT true,
        default_video_length TEXT DEFAULT '15',
        ai_instructions_prompt TEXT DEFAULT 'Create comprehensive, engaging safety induction content',
        qr_reader_enabled BOOLEAN DEFAULT false,
        qr_reader_device TEXT DEFAULT 'auto',
        qr_code_format TEXT DEFAULT 'visigate',
        qr_reader_settings TEXT DEFAULT '{}',
        clue_enabled BOOLEAN DEFAULT false,
        clue_api_url TEXT DEFAULT 'https://api.suprema-clue.com',
        clue_api_key TEXT DEFAULT '',
        clue_api_secret TEXT DEFAULT '',
        clue_organization_id TEXT DEFAULT '',
        clue_webhook_secret TEXT DEFAULT '',
        clue_dynamic_qr_enabled BOOLEAN DEFAULT true,
        clue_qr_validity_minutes TEXT DEFAULT '60',
        clue_device_groups TEXT[] DEFAULT ARRAY[]::TEXT[],
        clue_sync_interval TEXT DEFAULT '300',
        clue_auto_register_visitors BOOLEAN DEFAULT true,
        clue_auto_delete_expired BOOLEAN DEFAULT true,
        clue_test_mode BOOLEAN DEFAULT false,
        clue_last_sync TIMESTAMP,
        e_pass_enabled BOOLEAN DEFAULT true,
        e_pass_delivery_method TEXT DEFAULT 'both',
        e_pass_email_template TEXT DEFAULT 'default',
        e_pass_sms_template TEXT DEFAULT 'default',
        e_pass_auto_checkout BOOLEAN DEFAULT true,
        e_pass_checkout_reminder_minutes TEXT DEFAULT '30',
        e_pass_host_notification_enabled BOOLEAN DEFAULT true,
        e_pass_host_notification_delay TEXT DEFAULT '60',
        twilio_enabled BOOLEAN DEFAULT false,
        twilio_account_sid TEXT DEFAULT '',
        twilio_auth_token TEXT DEFAULT '',
        twilio_phone_number TEXT DEFAULT '',
        twilio_messaging_service_sid TEXT DEFAULT '',
        geofencing_enabled BOOLEAN DEFAULT false,
        geofence_radius TEXT DEFAULT '100',
        geofence_lat TEXT DEFAULT '',
        geofence_lng TEXT DEFAULT '',
        x_station_enabled BOOLEAN DEFAULT false,
        x_station_devices TEXT[] DEFAULT ARRAY[]::TEXT[],
        x_station_checkout_mode TEXT DEFAULT 'qr',
        x_station_api_endpoint TEXT DEFAULT '',
        hs_rules_enabled BOOLEAN DEFAULT true,
        hs_rules_content TEXT DEFAULT '',
        hs_rules_url TEXT DEFAULT '',
        hs_rules_require_acceptance BOOLEAN DEFAULT false,
        phone_provider TEXT DEFAULT '8x8',
        voice_notifications_enabled BOOLEAN DEFAULT false,
        eight_by_x_api_key TEXT DEFAULT '',
        eight_by_x_api_secret TEXT DEFAULT '',
        eight_by_x_account_id TEXT DEFAULT '',
        eight_by_x_base_url TEXT DEFAULT 'https://vcc-eu.8x8.com/api/v1',
        default_voice_language TEXT DEFAULT 'en-GB',
        default_voice_profile TEXT DEFAULT 'en-GB-Standard-A',
        feature_meeting_rooms BOOLEAN DEFAULT true,
        feature_time_attendance BOOLEAN DEFAULT true,
        feature_induction_settings BOOLEAN DEFAULT true,
        feature_kiosk BOOLEAN DEFAULT true,
        feature_ai_demo BOOLEAN DEFAULT false,
        feature_contractor_page BOOLEAN DEFAULT true,
        feature_members BOOLEAN DEFAULT true,
        feature_ppm BOOLEAN DEFAULT true,
        feature_help_desk BOOLEAN DEFAULT true,
        feature_compliance_certificates BOOLEAN DEFAULT true,
        feature_permit_to_work BOOLEAN DEFAULT true,
        feature_audit_engine BOOLEAN DEFAULT true,
        feature_ra_builder BOOLEAN DEFAULT true,
        zones_enabled BOOLEAN DEFAULT false,
        zone_map_url TEXT,
        paxton_enabled BOOLEAN DEFAULT false,
        paxton_server_url TEXT DEFAULT '',
        paxton_port TEXT DEFAULT '8080',
        paxton_client_id TEXT DEFAULT '',
        paxton_username TEXT DEFAULT '',
        paxton_password TEXT DEFAULT '',
        paxton_sync_users BOOLEAN DEFAULT true,
        paxton_sync_events BOOLEAN DEFAULT true,
        paxton_sync_interval TEXT DEFAULT '300',
        paxton_default_access_level TEXT DEFAULT '',
        paxton_visitor_access_level TEXT DEFAULT '',
        paxton_contractor_access_level TEXT DEFAULT '',
        paxton_auto_grant_access BOOLEAN DEFAULT false,
        paxton_auto_revoke_on_checkout BOOLEAN DEFAULT true,
        paxton_last_sync TIMESTAMP,
        paxton_webhook_secret TEXT DEFAULT '',
        api_webhooks_enabled BOOLEAN DEFAULT false,
        api_key TEXT DEFAULT '',
        api_webhook_url TEXT DEFAULT '',
        api_webhook_secret TEXT DEFAULT '',
        api_webhook_events TEXT[] DEFAULT ARRAY[]::TEXT[],
        api_rate_limit TEXT DEFAULT '100',
        api_last_activity TIMESTAMP,
        cdm_alerts_email TEXT DEFAULT '',
        nav_banner_color TEXT,
        nav_banner_invert BOOLEAN DEFAULT false,
        kiosk_notice_message TEXT DEFAULT 'All visitors must sign in before entering the building.',
        biostar_webhook_secret TEXT,
        site_address TEXT,
        induction_hazards TEXT,
        induction_ppe TEXT,
        assembly_point TEXT,
        first_aid_location TEXT,
        emergency_contact TEXT,
        induction_site_rules TEXT,
        induction_industry TEXT,
        induction_validity_period TEXT DEFAULT 'none',
        induction_expiry_reminder_days TEXT DEFAULT '30',
        nda_enabled BOOLEAN DEFAULT false,
        nda_content TEXT DEFAULT '',
        nda_require_signature BOOLEAN DEFAULT false,
        nda_applies_to TEXT DEFAULT 'visitors',
        feature_email_outbox BOOLEAN DEFAULT true,
        feature_martyn_law BOOLEAN DEFAULT true,
        feature_incident_reports BOOLEAN DEFAULT true,
        feature_hs_incidents BOOLEAN DEFAULT true,
        feature_bbs BOOLEAN DEFAULT false,
        feature_fire_risk_assessment BOOLEAN DEFAULT true,
        feature_compliance_dashboard BOOLEAN DEFAULT true,
        compliance_cert_alert_hour INTEGER DEFAULT 7,
        ptw_alert_hour INTEGER DEFAULT 7,
        feature_hr_module BOOLEAN DEFAULT false,
        feature_template_library BOOLEAN DEFAULT true,
        feature_teams_integration BOOLEAN DEFAULT false,
        feature_calendar_integration BOOLEAN DEFAULT false,
        feature_dashboard BOOLEAN DEFAULT true,
        feature_visitors BOOLEAN DEFAULT true,
        feature_contractors BOOLEAN DEFAULT true,
        feature_staff BOOLEAN DEFAULT true,
        feature_muster_list BOOLEAN DEFAULT true,
        feature_reports BOOLEAN DEFAULT true,
        feature_settings_page BOOLEAN DEFAULT true,
        induction_allow_hazard_report BOOLEAN DEFAULT true,
        incident_manager_url_id TEXT,
        notify_on_document_deletion BOOLEAN DEFAULT true,
        notify_on_document_expiry BOOLEAN DEFAULT true,
        lone_worker_enabled BOOLEAN DEFAULT false,
        lone_worker_check_interval_mins INTEGER DEFAULT 30,
        lone_worker_grace_period_mins INTEGER DEFAULT 10,
        lone_worker_l1_name TEXT DEFAULT '',
        lone_worker_l1_email TEXT DEFAULT '',
        lone_worker_l2_name TEXT DEFAULT '',
        lone_worker_l2_email TEXT DEFAULT '',
        lone_worker_l2_delay_mins INTEGER DEFAULT 15,
        lone_worker_l3_delay_mins INTEGER DEFAULT 30,
        sso_login_mode TEXT DEFAULT 'standard',
        sso_auto_provision BOOLEAN DEFAULT true,
        sso_default_role TEXT DEFAULT 'user',
        sso_tenant_id VARCHAR,
        sso_client_id VARCHAR,
        sso_client_secret VARCHAR,
        sso_client_secret_iv VARCHAR,
        sso_client_secret_tag VARCHAR,
        sso_redirect_uri VARCHAR,
        onboarding_checklist_dismissed BOOLEAN DEFAULT false,
        quick_setup_dismissed BOOLEAN DEFAULT false,
        feature_contractor_portal BOOLEAN DEFAULT false,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    await db.execute(`
      CREATE TABLE IF NOT EXISTS evacuation_zones (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        name TEXT NOT NULL,
        color TEXT NOT NULL DEFAULT '#3b82f6',
        description TEXT,
        display_order INTEGER NOT NULL DEFAULT 0,
        map_x DOUBLE PRECISION,
        map_y DOUBLE PRECISION,
        is_active BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    await db.execute(`
      CREATE TABLE IF NOT EXISTS meeting_rooms (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        name TEXT NOT NULL,
        description TEXT,
        capacity INTEGER NOT NULL,
        location TEXT,
        equipment TEXT[] DEFAULT ARRAY[]::TEXT[],
        is_active BOOLEAN NOT NULL DEFAULT true,
        hourly_rate DOUBLE PRECISION DEFAULT 0,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    await db.execute(`
      CREATE TABLE IF NOT EXISTS staff (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        first_name TEXT NOT NULL,
        last_name TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE,
        department TEXT NOT NULL,
        employee_id TEXT NOT NULL UNIQUE,
        photo_url TEXT,
        access_level TEXT NOT NULL DEFAULT 'staff',
        password TEXT,
        last_login_at TIMESTAMP,
        is_checked_in BOOLEAN NOT NULL DEFAULT false,
        checked_in_at TIMESTAMP,
        checked_out_at TIMESTAMP,
        checkout_type TEXT,
        manual_check_in BOOLEAN DEFAULT false,
        is_accounted_for BOOLEAN NOT NULL DEFAULT false,
        is_fire_marshal BOOLEAN NOT NULL DEFAULT false,
        fire_marshal_url_id TEXT,
        emergency_token TEXT,
        emergency_token_expires TIMESTAMP,
        user_id VARCHAR,
        qr_code TEXT UNIQUE,
        induction_completed BOOLEAN NOT NULL DEFAULT false,
        induction_completed_at TIMESTAMP,
        is_active BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    await db.execute(`
      CREATE TABLE IF NOT EXISTS visitors (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        first_name TEXT NOT NULL,
        last_name TEXT NOT NULL,
        email TEXT,
        phone_number TEXT,
        mobile_number TEXT,
        company TEXT,
        job_title TEXT,
        address TEXT,
        purpose TEXT,
        car_registration TEXT,
        host_staff_id VARCHAR,
        is_pre_booked BOOLEAN NOT NULL DEFAULT false,
        expected_date_time TIMESTAMP,
        visit_purpose TEXT,
        checked_in_at TIMESTAMP NOT NULL DEFAULT NOW(),
        checked_out_at TIMESTAMP,
        checkout_type TEXT,
        is_checked_in BOOLEAN NOT NULL DEFAULT true,
        is_accounted_for BOOLEAN NOT NULL DEFAULT false,
        induction_completed BOOLEAN NOT NULL DEFAULT false,
        induction_completed_at TIMESTAMP,
        qr_code TEXT NOT NULL,
        e_pass_sent BOOLEAN NOT NULL DEFAULT false,
        e_pass_delivery_type TEXT,
        e_pass_sent_at TIMESTAMP,
        e_pass_url TEXT,
        expected_departure_time TIMESTAMP,
        reminder_sent BOOLEAN NOT NULL DEFAULT false,
        host_notification_sent BOOLEAN NOT NULL DEFAULT false,
        hs_rules_accepted BOOLEAN NOT NULL DEFAULT false,
        hs_rules_accepted_at TIMESTAMP,
        hs_rules_acceptance_token TEXT,
        notes TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

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
      CREATE TABLE IF NOT EXISTS staff_sessions (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        staff_id VARCHAR NOT NULL,
        check_in_time TIMESTAMP NOT NULL,
        check_out_time TIMESTAMP,
        is_manual BOOLEAN NOT NULL DEFAULT false,
        check_in_method TEXT DEFAULT 'card',
        check_out_method TEXT,
        notes TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    await db.execute(`
      CREATE TABLE IF NOT EXISTS muster_points (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        name TEXT NOT NULL,
        display_order INTEGER NOT NULL DEFAULT 0,
        is_active BOOLEAN NOT NULL DEFAULT true,
        site_id VARCHAR,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    await db.execute(`
      CREATE TABLE IF NOT EXISTS evacuation_accountability (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        evacuation_id TEXT NOT NULL,
        person_id TEXT NOT NULL,
        person_type TEXT NOT NULL,
        person_name TEXT NOT NULL,
        department TEXT,
        company TEXT,
        last_known_location TEXT,
        is_accounted_for BOOLEAN NOT NULL DEFAULT false,
        accounted_by TEXT,
        accounted_at TIMESTAMP,
        muster_point TEXT,
        notes TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    await db.execute(`
      CREATE TABLE IF NOT EXISTS safety_tokens (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        token TEXT NOT NULL UNIQUE,
        evacuation_id TEXT NOT NULL,
        person_id TEXT NOT NULL,
        person_type TEXT NOT NULL,
        person_name TEXT NOT NULL,
        person_email TEXT NOT NULL,
        is_used BOOLEAN NOT NULL DEFAULT false,
        used_at TIMESTAMP,
        muster_point TEXT,
        expires_at TIMESTAMP NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    await db.execute(`
      CREATE TABLE IF NOT EXISTS user_invitations (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        email TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'user',
        invited_by VARCHAR,
        token TEXT NOT NULL UNIQUE,
        expires TIMESTAMP NOT NULL,
        used BOOLEAN DEFAULT false,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    await db.execute(`
      CREATE TABLE IF NOT EXISTS pre_bookings (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        visitor_first_name TEXT NOT NULL,
        visitor_last_name TEXT NOT NULL,
        visitor_email TEXT NOT NULL,
        company TEXT,
        purpose TEXT,
        visit_date TIMESTAMP NOT NULL,
        visit_time TEXT,
        host_staff_id VARCHAR,
        host_name TEXT,
        qr_code TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        is_checked_in BOOLEAN NOT NULL DEFAULT false,
        checked_in_at TIMESTAMP,
        visitor_id VARCHAR,
        email_sent BOOLEAN DEFAULT false,
        email_sent_at TIMESTAMP,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    await db.execute(`
      CREATE TABLE IF NOT EXISTS staff_attendance_history (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        staff_id VARCHAR NOT NULL,
        check_in_time TIMESTAMP NOT NULL,
        check_out_time TIMESTAMP,
        department TEXT,
        role TEXT,
        session_type TEXT NOT NULL DEFAULT 'work',
        is_manual_entry BOOLEAN NOT NULL DEFAULT false,
        checkout_type TEXT,
        duration_minutes INTEGER,
        notes TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    await db.execute(`
      CREATE TABLE IF NOT EXISTS visitor_history (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        visitor_id VARCHAR NOT NULL,
        check_in_time TIMESTAMP NOT NULL,
        check_out_time TIMESTAMP,
        purpose TEXT,
        host_staff_id VARCHAR,
        host_name TEXT,
        induction_completed BOOLEAN NOT NULL DEFAULT false,
        induction_completed_at TIMESTAMP,
        hs_rules_accepted BOOLEAN NOT NULL DEFAULT false,
        hs_rules_accepted_at TIMESTAMP,
        e_pass_sent BOOLEAN NOT NULL DEFAULT false,
        e_pass_sent_at TIMESTAMP,
        checkout_type TEXT,
        notes TEXT,
        qr_code TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    await db.execute(`
      CREATE TABLE IF NOT EXISTS room_bookings (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        meeting_room_id VARCHAR NOT NULL,
        booked_by_staff_id VARCHAR,
        title TEXT NOT NULL,
        description TEXT,
        start_time TIMESTAMP NOT NULL,
        end_time TIMESTAMP NOT NULL,
        is_recurring BOOLEAN DEFAULT false,
        recurrence_pattern TEXT,
        status TEXT DEFAULT 'confirmed',
        attendee_count INTEGER DEFAULT 1,
        setup_requirements TEXT[] DEFAULT ARRAY[]::TEXT[],
        is_private BOOLEAN DEFAULT false,
        expected_attendees INTEGER NOT NULL DEFAULT 1,
        attendee_emails TEXT[] DEFAULT ARRAY[]::TEXT[],
        requires_catering BOOLEAN NOT NULL DEFAULT false,
        catering_notes TEXT,
        special_requirements TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    await db.execute(`
      CREATE TABLE IF NOT EXISTS room_booking_attendees (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        booking_id VARCHAR NOT NULL,
        staff_id VARCHAR,
        email TEXT NOT NULL,
        name TEXT NOT NULL,
        is_organizer BOOLEAN NOT NULL DEFAULT false,
        response_status TEXT NOT NULL DEFAULT 'pending',
        response_at TIMESTAMP,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    await db.execute(`
      CREATE TABLE IF NOT EXISTS contractor_companies (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        company_name TEXT NOT NULL UNIQUE,
        company_number TEXT,
        vat_number TEXT,
        registration_number TEXT,
        contact_email TEXT NOT NULL,
        contact_phone TEXT,
        contact_first_name TEXT NOT NULL,
        contact_last_name TEXT NOT NULL,
        address TEXT,
        postcode TEXT,
        website TEXT,
        description TEXT,
        industry TEXT,
        primary_contact_name TEXT,
        primary_contact_email TEXT,
        primary_contact_phone TEXT,
        emergency_contact_name TEXT,
        emergency_contact_phone TEXT,
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
        status TEXT NOT NULL DEFAULT 'pending',
        approved_by VARCHAR,
        approved_at TIMESTAMP,
        suspended_reason TEXT,
        has_health_safety_policy BOOLEAN DEFAULT false,
        health_safety_policy_url TEXT,
        health_safety_policy_expiry_date TIMESTAMP,
        chas_certified BOOLEAN DEFAULT false,
        chas_certificate_number TEXT,
        chas_expiry_date TIMESTAMP,
        safe_contractor_certified BOOLEAN DEFAULT false,
        safe_contractor_number TEXT,
        safe_contractor_expiry_date TIMESTAMP,
        risk_rating TEXT DEFAULT 'medium',
        risk_notes TEXT,
        last_audit_date TIMESTAMP,
        next_audit_due TIMESTAMP,
        audit_frequency_months INTEGER DEFAULT 12,
        ai_compliance_score INTEGER DEFAULT 0,
        last_ai_review TIMESTAMP,
        auto_compliance_checks BOOLEAN DEFAULT true,
        is_active BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    await db.execute(`
      CREATE TABLE IF NOT EXISTS contractor_workers (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id VARCHAR NOT NULL,
        first_name TEXT NOT NULL,
        last_name TEXT NOT NULL,
        email TEXT,
        phone_number TEXT,
        mobile_number TEXT,
        home_address TEXT,
        postcode TEXT,
        date_of_birth TIMESTAMP,
        national_insurance_number TEXT,
        photo_url TEXT,
        job_title TEXT,
        department TEXT,
        skills_and_certifications TEXT[] DEFAULT ARRAY[]::TEXT[],
        emergency_contact_name TEXT,
        emergency_contact_phone TEXT,
        emergency_contact_relationship TEXT,
        is_checked_in BOOLEAN NOT NULL DEFAULT false,
        checked_in_at TIMESTAMP,
        checked_out_at TIMESTAMP,
        checkout_type TEXT,
        last_visit_date TIMESTAMP,
        visit_count INTEGER DEFAULT 0,
        is_accounted_for BOOLEAN NOT NULL DEFAULT false,
        right_to_work_status TEXT DEFAULT 'pending',
        right_to_work_document_type TEXT,
        right_to_work_document_number TEXT,
        right_to_work_expiry_date TIMESTAMP,
        right_to_work_verified_by VARCHAR,
        right_to_work_verified_at TIMESTAMP,
        right_to_work_document_url TEXT,
        working_pattern TEXT DEFAULT 'full_time',
        hourly_rate TEXT,
        start_date TIMESTAMP,
        expected_end_date TIMESTAMP,
        has_occupational_health_clearance BOOLEAN DEFAULT false,
        occupational_health_expiry_date TIMESTAMP,
        medical_restrictions TEXT,
        site_induction_required BOOLEAN DEFAULT true,
        site_induction_completed BOOLEAN DEFAULT false,
        site_induction_completed_at TIMESTAMP,
        site_induction_expiry_date TIMESTAMP,
        toolbox_talk_completed BOOLEAN DEFAULT false,
        toolbox_talk_completed_at TIMESTAMP,
        cscs_card_number TEXT,
        cscs_status TEXT DEFAULT 'pending',
        ipaf_status TEXT DEFAULT 'none',
        asbestos_awareness BOOLEAN DEFAULT false,
        manual_handling BOOLEAN DEFAULT false,
        working_at_height BOOLEAN DEFAULT false,
        transport_method TEXT DEFAULT 'car_diesel',
        worker_status TEXT NOT NULL DEFAULT 'pending',
        approved_by VARCHAR,
        approved_at TIMESTAMP,
        suspended_reason TEXT,
        banned_until TIMESTAMP,
        ai_risk_score INTEGER DEFAULT 0,
        risk_factors TEXT[] DEFAULT ARRAY[]::TEXT[],
        last_risk_assessment TIMESTAMP,
        documents_complete BOOLEAN DEFAULT false,
        documents_last_checked TIMESTAMP,
        compliance_score INTEGER DEFAULT 0,
        hs_rules_accepted BOOLEAN DEFAULT false,
        hs_rules_accepted_at TIMESTAMP,
        hs_rules_acceptance_token TEXT,
        current_card_status TEXT DEFAULT 'pending',
        is_active BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    await db.execute(`
      CREATE TABLE IF NOT EXISTS worker_notes (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        worker_id VARCHAR NOT NULL,
        change_type TEXT NOT NULL,
        old_value TEXT,
        new_value TEXT,
        notes TEXT,
        changed_by TEXT NOT NULL,
        changed_at TIMESTAMP NOT NULL DEFAULT NOW(),
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    await db.execute(`
      CREATE TABLE IF NOT EXISTS contractor_documents (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id VARCHAR,
        worker_id VARCHAR,
        document_name TEXT NOT NULL,
        document_type TEXT NOT NULL,
        document_url TEXT NOT NULL,
        expiry_date TIMESTAMP,
        uploaded_by VARCHAR NOT NULL,
        uploaded_at TIMESTAMP NOT NULL DEFAULT NOW(),
        status TEXT NOT NULL DEFAULT 'pending',
        approved_by VARCHAR,
        approved_at TIMESTAMP,
        rejected_reason TEXT,
        ai_analysis_result TEXT,
        ai_confidence_score INTEGER DEFAULT 0,
        issued_by TEXT,
        policy_number TEXT,
        coverage_amount TEXT,
        is_active BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

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
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    await db.execute(`
      CREATE TABLE IF NOT EXISTS document_approvals (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        document_id VARCHAR NOT NULL,
        reviewed_by VARCHAR NOT NULL,
        reviewed_at TIMESTAMP NOT NULL DEFAULT NOW(),
        status TEXT NOT NULL,
        comments TEXT,
        changes_required TEXT[] DEFAULT ARRAY[]::TEXT[],
        follow_up_required BOOLEAN DEFAULT false,
        follow_up_date TIMESTAMP,
        approval_level TEXT DEFAULT 'standard',
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

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
        allowed_file_types TEXT[] DEFAULT ARRAY['pdf', 'jpg', 'png']::TEXT[],
        max_file_size_mb INTEGER DEFAULT 10,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    await db.execute(`
      CREATE TABLE IF NOT EXISTS worker_competencies (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        worker_id VARCHAR NOT NULL,
        competency_type TEXT NOT NULL,
        competency_name TEXT NOT NULL,
        level TEXT,
        issuing_body TEXT,
        certification_number TEXT,
        issue_date TIMESTAMP,
        expiry_date TIMESTAMP,
        document_url TEXT,
        verified_by VARCHAR,
        verified_at TIMESTAMP,
        status TEXT DEFAULT 'active',
        continuous_assessment_required BOOLEAN DEFAULT false,
        last_assessment_date TIMESTAMP,
        next_assessment_due TIMESTAMP,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    await db.execute(`
      CREATE TABLE IF NOT EXISTS nvq_qualifications (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        worker_id VARCHAR NOT NULL,
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
        verified_by VARCHAR,
        verified_at TIMESTAMP,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    await db.execute(`
      CREATE TABLE IF NOT EXISTS card_offences (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        offence_name TEXT NOT NULL,
        offence_description TEXT,
        card_type TEXT NOT NULL,
        is_active BOOLEAN NOT NULL DEFAULT true,
        site_configurable BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    await db.execute(`
      CREATE TABLE IF NOT EXISTS card_issues (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        worker_id VARCHAR NOT NULL,
        offence_id VARCHAR NOT NULL,
        card_type TEXT NOT NULL,
        issued_by VARCHAR NOT NULL,
        issued_at TIMESTAMP NOT NULL DEFAULT NOW(),
        description TEXT NOT NULL,
        witness TEXT,
        location TEXT,
        photos TEXT[] DEFAULT ARRAY[]::TEXT[],
        status TEXT NOT NULL DEFAULT 'active',
        ban_end_date TIMESTAMP,
        appeal_notes TEXT,
        appealed_at TIMESTAMP,
        appeals_count INTEGER DEFAULT 0
      )
    `);

    await db.execute(`
      CREATE TABLE IF NOT EXISTS worker_certifications (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        worker_id VARCHAR NOT NULL,
        certification_type TEXT NOT NULL,
        certification_number TEXT,
        issuer TEXT,
        issued_date TIMESTAMP,
        expiry_date TIMESTAMP,
        status TEXT NOT NULL DEFAULT 'valid',
        document_url TEXT,
        notes TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    await db.execute(`
      CREATE TABLE IF NOT EXISTS rams_documents (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id VARCHAR,
        department_id VARCHAR,
        rams_id_ref TEXT NOT NULL,
        document_name TEXT NOT NULL,
        document_url TEXT NOT NULL,
        expiry_date TIMESTAMP NOT NULL,
        status TEXT NOT NULL DEFAULT 'valid',
        uploaded_by VARCHAR,
        uploaded_at TIMESTAMP NOT NULL DEFAULT NOW(),
        reviewed_by VARCHAR,
        reviewed_at TIMESTAMP,
        review_notes TEXT,
        alert_days_before INTEGER DEFAULT 14,
        last_alert_sent TIMESTAMP,
        is_active BOOLEAN NOT NULL DEFAULT true
      )
    `);

    await db.execute(`
      CREATE TABLE IF NOT EXISTS co2_records (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id VARCHAR,
        worker_id VARCHAR,
        record_type TEXT NOT NULL,
        record_date TIMESTAMP NOT NULL,
        co2_amount TEXT NOT NULL,
        unit TEXT NOT NULL DEFAULT 'kg',
        source TEXT,
        distance TEXT,
        fuel_type TEXT,
        description TEXT,
        calculation_method TEXT,
        verified BOOLEAN DEFAULT false,
        verified_by VARCHAR,
        verified_at TIMESTAMP,
        reporting_period TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    await db.execute(`
      CREATE TABLE IF NOT EXISTS induction_tokens (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        worker_id VARCHAR,
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
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

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
        is_ai_generated BOOLEAN NOT NULL DEFAULT false,
        is_active BOOLEAN NOT NULL DEFAULT true,
        order_index INTEGER DEFAULT 0,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    await db.execute(`
      CREATE TABLE IF NOT EXISTS induction_settings (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        role_type TEXT NOT NULL,
        video_title TEXT NOT NULL,
        video_url TEXT NOT NULL,
        video_description TEXT,
        video_duration_minutes INTEGER DEFAULT 15,
        video_format TEXT NOT NULL DEFAULT 'interactive_slides',
        model_type TEXT NOT NULL DEFAULT 'gpt-5',
        pass_percentage INTEGER DEFAULT 80,
        is_active BOOLEAN NOT NULL DEFAULT true,
        generated_html TEXT,
        scenes_data TEXT,
        generated_at TIMESTAMP,
        questions_generated BOOLEAN DEFAULT false,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    await db.execute(`
      CREATE TABLE IF NOT EXISTS induction_answers (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        token_id VARCHAR NOT NULL,
        question_id VARCHAR NOT NULL,
        attempt_number INTEGER NOT NULL DEFAULT 1,
        selected_answer TEXT NOT NULL,
        is_correct BOOLEAN NOT NULL,
        answered_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    await db.execute(`
      CREATE TABLE IF NOT EXISTS local_labour_records (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        worker_id VARCHAR NOT NULL,
        company_id VARCHAR NOT NULL,
        postcode TEXT NOT NULL,
        local_radius INTEGER NOT NULL DEFAULT 20,
        is_local BOOLEAN NOT NULL DEFAULT false,
        address TEXT,
        travel_distance TEXT,
        transport_method TEXT,
        local_hire_date TIMESTAMP,
        skills TEXT[] DEFAULT ARRAY[]::TEXT[],
        apprenticeship_level TEXT,
        is_apprentice BOOLEAN DEFAULT false,
        training_provider TEXT,
        recorded_at TIMESTAMP NOT NULL DEFAULT NOW(),
        recorded_by VARCHAR
      )
    `);

    await db.execute(`
      CREATE TABLE IF NOT EXISTS co2_emissions_data (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        worker_id VARCHAR NOT NULL,
        company_id VARCHAR NOT NULL,
        worker_postcode TEXT NOT NULL,
        company_address TEXT NOT NULL,
        distance_miles DOUBLE PRECISION NOT NULL,
        distance_km DOUBLE PRECISION NOT NULL,
        route_type TEXT DEFAULT 'mixed',
        estimated_travel_time TEXT,
        transport_method TEXT NOT NULL DEFAULT 'car_diesel',
        emission_factor TEXT NOT NULL,
        daily_co2_kg TEXT NOT NULL,
        monthly_co2_kg TEXT NOT NULL,
        annual_co2_kg TEXT NOT NULL,
        calculated_at TIMESTAMP NOT NULL DEFAULT NOW(),
        calculated_by TEXT DEFAULT 'openai',
        last_updated TIMESTAMP NOT NULL DEFAULT NOW(),
        is_active BOOLEAN NOT NULL DEFAULT true,
        working_days_per_month INTEGER NOT NULL DEFAULT 22,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    await db.execute(`
      CREATE TABLE IF NOT EXISTS co2_monthly_summaries (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id VARCHAR,
        year INTEGER NOT NULL,
        month INTEGER NOT NULL,
        total_workers INTEGER NOT NULL,
        total_monthly_co2_kg TEXT NOT NULL,
        average_co2_per_worker TEXT NOT NULL,
        transport_breakdown TEXT,
        average_distance_miles DOUBLE PRECISION,
        longest_commute_miles DOUBLE PRECISION,
        shortest_commute_miles DOUBLE PRECISION,
        previous_month_co2_kg TEXT,
        percentage_change TEXT,
        carbon_reduction_target TEXT,
        target_achieved BOOLEAN DEFAULT false,
        sustainability_score INTEGER DEFAULT 0,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    await db.execute(`
      CREATE TABLE IF NOT EXISTS co2_sustainability_reports (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id VARCHAR,
        report_type TEXT NOT NULL DEFAULT 'monthly',
        report_period TEXT NOT NULL,
        report_title TEXT NOT NULL,
        executive_summary TEXT NOT NULL,
        current_emissions_status TEXT NOT NULL,
        environmental_impact_analysis TEXT NOT NULL,
        reduction_recommendations TEXT NOT NULL,
        industry_comparison TEXT NOT NULL,
        action_plan TEXT NOT NULL,
        full_report_content TEXT NOT NULL,
        total_workers_covered INTEGER NOT NULL,
        total_co2_analyzed TEXT NOT NULL,
        top_recommendation TEXT,
        potential_savings TEXT,
        generated_at TIMESTAMP NOT NULL DEFAULT NOW(),
        generated_by TEXT DEFAULT 'openai',
        ai_model TEXT DEFAULT 'gpt-4',
        generation_time_ms INTEGER,
        is_published BOOLEAN DEFAULT false,
        published_at TIMESTAMP,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    await db.execute(`
      CREATE TABLE IF NOT EXISTS enhanced_company_details (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id VARCHAR,
        department_id VARCHAR,
        rams_id_ref TEXT,
        rams_expiry_date TIMESTAMP,
        rams_document_url TEXT,
        rams_uploaded_at TIMESTAMP,
        rams_last_alert_sent TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    await db.execute(`
      CREATE TABLE IF NOT EXISTS contractor_visits (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        worker_id VARCHAR NOT NULL,
        company_id VARCHAR NOT NULL,
        purpose TEXT DEFAULT 'Work',
        checked_in_at TIMESTAMP NOT NULL DEFAULT NOW(),
        checked_out_at TIMESTAMP,
        duration TEXT,
        host_staff_id VARCHAR,
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
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    await db.execute(`
      CREATE TABLE IF NOT EXISTS contractor_prebookings (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        company_name TEXT NOT NULL,
        contact_email TEXT NOT NULL,
        contact_phone TEXT,
        worker_name TEXT NOT NULL,
        worker_email TEXT,
        purpose TEXT NOT NULL,
        scheduled_date TIMESTAMP NOT NULL,
        scheduled_time TEXT NOT NULL,
        duration TEXT DEFAULT '4',
        status TEXT DEFAULT 'pending',
        qr_code TEXT NOT NULL UNIQUE,
        notes TEXT,
        host_staff_id VARCHAR,
        host_name TEXT,
        documents_required TEXT[] DEFAULT ARRAY[]::TEXT[],
        documents_uploaded TEXT[] DEFAULT ARRAY[]::TEXT[],
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

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
        allowed_file_types TEXT[] DEFAULT ARRAY['pdf', 'jpg', 'png']::TEXT[],
        max_file_size_mb INTEGER DEFAULT 10,
        auto_fill_enabled BOOLEAN DEFAULT false,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    await db.execute(`
      CREATE TABLE IF NOT EXISTS worker_document_assignments (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        worker_id VARCHAR NOT NULL,
        template_id VARCHAR NOT NULL,
        assigned_by VARCHAR NOT NULL,
        assigned_at TIMESTAMP NOT NULL DEFAULT NOW(),
        due_date TIMESTAMP NOT NULL,
        status TEXT DEFAULT 'pending',
        priority TEXT DEFAULT 'normal',
        notes TEXT,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    await db.execute(`
      CREATE TABLE IF NOT EXISTS worker_document_acceptances (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        assignment_id VARCHAR NOT NULL,
        worker_id VARCHAR NOT NULL,
        template_id VARCHAR NOT NULL,
        document_url TEXT NOT NULL,
        original_file_name TEXT NOT NULL,
        file_size_bytes INTEGER NOT NULL,
        file_type TEXT NOT NULL,
        submitted_at TIMESTAMP NOT NULL DEFAULT NOW(),
        submitted_by VARCHAR NOT NULL,
        reviewed_by VARCHAR,
        reviewed_at TIMESTAMP,
        status TEXT DEFAULT 'pending',
        approval_comments TEXT,
        rejection_reason TEXT,
        expiry_date TIMESTAMP,
        auto_fill_data TEXT,
        ai_analysis_result TEXT,
        ai_confidence_score INTEGER DEFAULT 0,
        extracted_text TEXT,
        document_hash TEXT,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    await db.execute(`
      CREATE TABLE IF NOT EXISTS document_auto_fill_mapping (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        template_id VARCHAR NOT NULL,
        field_name TEXT NOT NULL,
        field_type TEXT NOT NULL,
        extraction_pattern TEXT,
        ocr_region TEXT,
        is_required BOOLEAN DEFAULT false,
        validation_rules TEXT,
        target_worker_field TEXT,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    await db.execute(`
      CREATE TABLE IF NOT EXISTS ai_generated_images (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        slide_type TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        image_url TEXT NOT NULL,
        dalle_prompt TEXT NOT NULL,
        dalle_revision TEXT DEFAULT 'dall-e-3',
        image_size TEXT DEFAULT '1024x1024',
        quality TEXT DEFAULT 'standard',
        style TEXT DEFAULT 'vivid',
        generated_at TIMESTAMP NOT NULL DEFAULT NOW(),
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    await db.execute(`
      CREATE TABLE IF NOT EXISTS customer_api_keys (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        key_name TEXT NOT NULL,
        service TEXT,
        key_type TEXT,
        encrypted_api_key TEXT,
        encryption_iv TEXT,
        key_fingerprint TEXT NOT NULL,
        is_active BOOLEAN NOT NULL DEFAULT true,
        is_test_key BOOLEAN NOT NULL DEFAULT false,
        expires_at TIMESTAMP,
        last_used TIMESTAMP,
        usage_count INTEGER NOT NULL DEFAULT 0,
        last_request_ip TEXT,
        created_by VARCHAR,
        rotated_from VARCHAR,
        rotation_reason TEXT,
        permissions TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
        allowed_ips TEXT[] DEFAULT ARRAY[]::TEXT[],
        rate_limit INTEGER DEFAULT 1000,
        description TEXT,
        tags TEXT[] DEFAULT ARRAY[]::TEXT[],
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
        service_type TEXT,
        key_description TEXT,
        status TEXT DEFAULT 'active',
        encrypted_key TEXT,
        initialization_vector TEXT,
        auth_tag TEXT,
        last4 TEXT,
        key_version INTEGER DEFAULT 1,
        decrypt_audit_log TEXT DEFAULT '[]',
        last_used_at TIMESTAMP
      )
    `);

    await db.execute(`
      CREATE TABLE IF NOT EXISTS feature_usage_analytics (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        date TIMESTAMP NOT NULL,
        period TEXT NOT NULL DEFAULT 'daily',
        feature TEXT NOT NULL,
        feature_category TEXT NOT NULL,
        sub_feature TEXT,
        usage_count INTEGER NOT NULL DEFAULT 0,
        unique_users INTEGER NOT NULL DEFAULT 0,
        session_count INTEGER NOT NULL DEFAULT 0,
        total_duration_minutes INTEGER DEFAULT 0,
        primary_user_id VARCHAR,
        user_roles TEXT[] DEFAULT ARRAY[]::TEXT[],
        tenant_ids TEXT[] DEFAULT ARRAY[]::TEXT[],
        successful_operations INTEGER DEFAULT 0,
        failed_operations INTEGER DEFAULT 0,
        error_rate TEXT DEFAULT '0.00',
        average_response_time_ms INTEGER DEFAULT 0,
        slowest_response_time_ms INTEGER DEFAULT 0,
        fastest_response_time_ms INTEGER DEFAULT 0,
        business_value TEXT,
        conversion_impact TEXT,
        retention_impact TEXT,
        previous_period_usage INTEGER DEFAULT 0,
        usage_growth TEXT DEFAULT '0.00',
        industry_benchmark TEXT,
        feature_flags TEXT[] DEFAULT ARRAY[]::TEXT[],
        configuration TEXT,
        first_used TIMESTAMP,
        last_used TIMESTAMP,
        peak_usage_hour INTEGER,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    await db.execute(`
      CREATE TABLE IF NOT EXISTS help_categories (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        name TEXT NOT NULL,
        description TEXT,
        icon TEXT DEFAULT 'HelpCircle',
        color TEXT DEFAULT 'blue',
        sort_order INTEGER DEFAULT 0,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    await db.execute(`
      CREATE TABLE IF NOT EXISTS help_articles (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        category_id VARCHAR NOT NULL,
        title TEXT NOT NULL,
        slug TEXT NOT NULL,
        summary TEXT,
        content TEXT NOT NULL,
        content_type TEXT DEFAULT 'markdown',
        video_url TEXT,
        target_pages TEXT[] DEFAULT ARRAY[]::TEXT[],
        target_features TEXT[] DEFAULT ARRAY[]::TEXT[],
        difficulty TEXT DEFAULT 'beginner',
        estimated_read_time INTEGER DEFAULT 5,
        search_keywords TEXT[] DEFAULT ARRAY[]::TEXT[],
        tags TEXT[] DEFAULT ARRAY[]::TEXT[],
        view_count INTEGER DEFAULT 0,
        helpful_count INTEGER DEFAULT 0,
        not_helpful_count INTEGER DEFAULT 0,
        last_viewed_at TIMESTAMP,
        is_published BOOLEAN DEFAULT true,
        published_at TIMESTAMP,
        author_id VARCHAR,
        sort_order INTEGER DEFAULT 0,
        is_featured BOOLEAN DEFAULT false,
        is_quick_start BOOLEAN DEFAULT false,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    await db.execute(`
      CREATE TABLE IF NOT EXISTS help_user_interactions (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id VARCHAR,
        article_id VARCHAR NOT NULL,
        interaction_type TEXT NOT NULL,
        session_id TEXT,
        time_spent INTEGER,
        page_context TEXT,
        search_query TEXT,
        feedback_rating INTEGER,
        feedback_comments TEXT,
        is_completed BOOLEAN DEFAULT false,
        completed_steps TEXT[] DEFAULT ARRAY[]::TEXT[],
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    await db.execute(`
      CREATE TABLE IF NOT EXISTS help_onboarding_progress (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id VARCHAR NOT NULL,
        current_step INTEGER DEFAULT 1,
        completed_steps TEXT[] DEFAULT ARRAY[]::TEXT[],
        skipped_steps TEXT[] DEFAULT ARRAY[]::TEXT[],
        total_steps INTEGER DEFAULT 10,
        is_completed BOOLEAN DEFAULT false,
        completed_at TIMESTAMP,
        time_spent INTEGER DEFAULT 0,
        last_active_at TIMESTAMP DEFAULT NOW(),
        feature_onboarding_completed TEXT[] DEFAULT ARRAY[]::TEXT[],
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    logger.info('✅ All tables created successfully');

    const foreignKeys = [
      { table: 'staff', column: 'user_id', ref_table: 'users', ref_column: 'id', constraint: 'fk_staff_user_id' },
      { table: 'visitors', column: 'host_staff_id', ref_table: 'staff', ref_column: 'id', constraint: 'fk_visitors_host_staff_id' },
      { table: 'staff_sessions', column: 'staff_id', ref_table: 'staff', ref_column: 'id', constraint: 'fk_staff_sessions_staff_id' },
      { table: 'staff_attendance_history', column: 'staff_id', ref_table: 'staff', ref_column: 'id', constraint: 'fk_staff_attendance_history_staff_id' },
      { table: 'visitor_history', column: 'host_staff_id', ref_table: 'staff', ref_column: 'id', constraint: 'fk_visitor_history_host_staff_id' },
      { table: 'pre_bookings', column: 'host_staff_id', ref_table: 'staff', ref_column: 'id', constraint: 'fk_pre_bookings_host_staff_id' },
      { table: 'pre_bookings', column: 'visitor_id', ref_table: 'visitors', ref_column: 'id', constraint: 'fk_pre_bookings_visitor_id' },
      { table: 'user_invitations', column: 'invited_by', ref_table: 'users', ref_column: 'id', constraint: 'fk_user_invitations_invited_by' },
      { table: 'room_bookings', column: 'meeting_room_id', ref_table: 'meeting_rooms', ref_column: 'id', constraint: 'fk_room_bookings_meeting_room_id' },
      { table: 'room_bookings', column: 'booked_by_staff_id', ref_table: 'staff', ref_column: 'id', constraint: 'fk_room_bookings_booked_by_staff_id' },
      { table: 'room_booking_attendees', column: 'booking_id', ref_table: 'room_bookings', ref_column: 'id', constraint: 'fk_room_booking_attendees_booking_id' },
      { table: 'room_booking_attendees', column: 'staff_id', ref_table: 'staff', ref_column: 'id', constraint: 'fk_room_booking_attendees_staff_id' },
      { table: 'contractor_companies', column: 'approved_by', ref_table: 'users', ref_column: 'id', constraint: 'fk_contractor_companies_approved_by' },
      { table: 'contractor_workers', column: 'company_id', ref_table: 'contractor_companies', ref_column: 'id', constraint: 'fk_contractor_workers_company_id' },
      { table: 'contractor_workers', column: 'right_to_work_verified_by', ref_table: 'users', ref_column: 'id', constraint: 'fk_contractor_workers_rtw_verified_by' },
      { table: 'contractor_workers', column: 'approved_by', ref_table: 'users', ref_column: 'id', constraint: 'fk_contractor_workers_approved_by' },
      { table: 'worker_notes', column: 'worker_id', ref_table: 'contractor_workers', ref_column: 'id', constraint: 'fk_worker_notes_worker_id' },
      { table: 'contractor_documents', column: 'company_id', ref_table: 'contractor_companies', ref_column: 'id', constraint: 'fk_contractor_documents_company_id' },
      { table: 'contractor_documents', column: 'worker_id', ref_table: 'contractor_workers', ref_column: 'id', constraint: 'fk_contractor_documents_worker_id' },
      { table: 'contractor_documents', column: 'uploaded_by', ref_table: 'users', ref_column: 'id', constraint: 'fk_contractor_documents_uploaded_by' },
      { table: 'contractor_documents', column: 'approved_by', ref_table: 'users', ref_column: 'id', constraint: 'fk_contractor_documents_approved_by' },
      { table: 'document_approvals', column: 'document_id', ref_table: 'contractor_documents', ref_column: 'id', constraint: 'fk_document_approvals_document_id' },
      { table: 'document_approvals', column: 'reviewed_by', ref_table: 'users', ref_column: 'id', constraint: 'fk_document_approvals_reviewed_by' },
      { table: 'worker_competencies', column: 'worker_id', ref_table: 'contractor_workers', ref_column: 'id', constraint: 'fk_worker_competencies_worker_id' },
      { table: 'worker_competencies', column: 'verified_by', ref_table: 'users', ref_column: 'id', constraint: 'fk_worker_competencies_verified_by' },
      { table: 'nvq_qualifications', column: 'worker_id', ref_table: 'contractor_workers', ref_column: 'id', constraint: 'fk_nvq_qualifications_worker_id' },
      { table: 'nvq_qualifications', column: 'verified_by', ref_table: 'users', ref_column: 'id', constraint: 'fk_nvq_qualifications_verified_by' },
      { table: 'card_issues', column: 'worker_id', ref_table: 'contractor_workers', ref_column: 'id', constraint: 'fk_card_issues_worker_id' },
      { table: 'card_issues', column: 'offence_id', ref_table: 'card_offences', ref_column: 'id', constraint: 'fk_card_issues_offence_id' },
      { table: 'card_issues', column: 'issued_by', ref_table: 'users', ref_column: 'id', constraint: 'fk_card_issues_issued_by' },
      { table: 'worker_certifications', column: 'worker_id', ref_table: 'contractor_workers', ref_column: 'id', constraint: 'fk_worker_certifications_worker_id' },
      { table: 'rams_documents', column: 'company_id', ref_table: 'contractor_companies', ref_column: 'id', constraint: 'fk_rams_documents_company_id' },
      { table: 'rams_documents', column: 'department_id', ref_table: 'departments', ref_column: 'id', constraint: 'fk_rams_documents_department_id' },
      { table: 'rams_documents', column: 'uploaded_by', ref_table: 'users', ref_column: 'id', constraint: 'fk_rams_documents_uploaded_by' },
      { table: 'rams_documents', column: 'reviewed_by', ref_table: 'users', ref_column: 'id', constraint: 'fk_rams_documents_reviewed_by' },
      { table: 'co2_records', column: 'company_id', ref_table: 'contractor_companies', ref_column: 'id', constraint: 'fk_co2_records_company_id' },
      { table: 'co2_records', column: 'worker_id', ref_table: 'contractor_workers', ref_column: 'id', constraint: 'fk_co2_records_worker_id' },
      { table: 'co2_records', column: 'verified_by', ref_table: 'users', ref_column: 'id', constraint: 'fk_co2_records_verified_by' },
      { table: 'induction_tokens', column: 'worker_id', ref_table: 'contractor_workers', ref_column: 'id', constraint: 'fk_induction_tokens_worker_id' },
      { table: 'induction_answers', column: 'token_id', ref_table: 'induction_tokens', ref_column: 'id', constraint: 'fk_induction_answers_token_id' },
      { table: 'induction_answers', column: 'question_id', ref_table: 'induction_questions', ref_column: 'id', constraint: 'fk_induction_answers_question_id' },
      { table: 'local_labour_records', column: 'worker_id', ref_table: 'contractor_workers', ref_column: 'id', constraint: 'fk_local_labour_records_worker_id' },
      { table: 'local_labour_records', column: 'company_id', ref_table: 'contractor_companies', ref_column: 'id', constraint: 'fk_local_labour_records_company_id' },
      { table: 'local_labour_records', column: 'recorded_by', ref_table: 'users', ref_column: 'id', constraint: 'fk_local_labour_records_recorded_by' },
      { table: 'co2_emissions_data', column: 'worker_id', ref_table: 'contractor_workers', ref_column: 'id', constraint: 'fk_co2_emissions_data_worker_id' },
      { table: 'co2_emissions_data', column: 'company_id', ref_table: 'contractor_companies', ref_column: 'id', constraint: 'fk_co2_emissions_data_company_id' },
      { table: 'co2_monthly_summaries', column: 'company_id', ref_table: 'contractor_companies', ref_column: 'id', constraint: 'fk_co2_monthly_summaries_company_id' },
      { table: 'co2_sustainability_reports', column: 'company_id', ref_table: 'contractor_companies', ref_column: 'id', constraint: 'fk_co2_sustainability_reports_company_id' },
      { table: 'enhanced_company_details', column: 'company_id', ref_table: 'contractor_companies', ref_column: 'id', constraint: 'fk_enhanced_company_details_company_id' },
      { table: 'enhanced_company_details', column: 'department_id', ref_table: 'departments', ref_column: 'id', constraint: 'fk_enhanced_company_details_department_id' },
      { table: 'contractor_visits', column: 'worker_id', ref_table: 'contractor_workers', ref_column: 'id', constraint: 'fk_contractor_visits_worker_id' },
      { table: 'contractor_visits', column: 'company_id', ref_table: 'contractor_companies', ref_column: 'id', constraint: 'fk_contractor_visits_company_id' },
      { table: 'contractor_visits', column: 'host_staff_id', ref_table: 'staff', ref_column: 'id', constraint: 'fk_contractor_visits_host_staff_id' },
      { table: 'worker_document_assignments', column: 'worker_id', ref_table: 'contractor_workers', ref_column: 'id', constraint: 'fk_worker_document_assignments_worker_id' },
      { table: 'worker_document_assignments', column: 'template_id', ref_table: 'uk_hs_document_templates', ref_column: 'id', constraint: 'fk_worker_document_assignments_template_id' },
      { table: 'worker_document_assignments', column: 'assigned_by', ref_table: 'users', ref_column: 'id', constraint: 'fk_worker_document_assignments_assigned_by' },
      { table: 'worker_document_acceptances', column: 'assignment_id', ref_table: 'worker_document_assignments', ref_column: 'id', constraint: 'fk_worker_document_acceptances_assignment_id' },
      { table: 'worker_document_acceptances', column: 'worker_id', ref_table: 'contractor_workers', ref_column: 'id', constraint: 'fk_worker_document_acceptances_worker_id' },
      { table: 'worker_document_acceptances', column: 'template_id', ref_table: 'uk_hs_document_templates', ref_column: 'id', constraint: 'fk_worker_document_acceptances_template_id' },
      { table: 'worker_document_acceptances', column: 'submitted_by', ref_table: 'contractor_workers', ref_column: 'id', constraint: 'fk_worker_document_acceptances_submitted_by' },
      { table: 'worker_document_acceptances', column: 'reviewed_by', ref_table: 'users', ref_column: 'id', constraint: 'fk_worker_document_acceptances_reviewed_by' },
      { table: 'document_auto_fill_mapping', column: 'template_id', ref_table: 'uk_hs_document_templates', ref_column: 'id', constraint: 'fk_document_auto_fill_mapping_template_id' },
      { table: 'customer_api_keys', column: 'created_by', ref_table: 'users', ref_column: 'id', constraint: 'fk_customer_api_keys_created_by' },
      { table: 'feature_usage_analytics', column: 'primary_user_id', ref_table: 'users', ref_column: 'id', constraint: 'fk_feature_usage_analytics_primary_user_id' },
      { table: 'help_articles', column: 'category_id', ref_table: 'help_categories', ref_column: 'id', constraint: 'fk_help_articles_category_id' },
      { table: 'help_articles', column: 'author_id', ref_table: 'users', ref_column: 'id', constraint: 'fk_help_articles_author_id' },
      { table: 'help_user_interactions', column: 'user_id', ref_table: 'users', ref_column: 'id', constraint: 'fk_help_user_interactions_user_id' },
      { table: 'help_user_interactions', column: 'article_id', ref_table: 'help_articles', ref_column: 'id', constraint: 'fk_help_user_interactions_article_id' },
      { table: 'help_onboarding_progress', column: 'user_id', ref_table: 'users', ref_column: 'id', constraint: 'fk_help_onboarding_progress_user_id' },
    ];

    logger.info('🔗 Adding foreign key constraints...');
    let addedCount = 0;
    let skippedCount = 0;

    for (const fk of foreignKeys) {
      try {
        await db.execute(`
          ALTER TABLE ${fk.table}
          ADD CONSTRAINT ${fk.constraint}
          FOREIGN KEY (${fk.column}) REFERENCES ${fk.ref_table}(${fk.ref_column})
        `);
        addedCount++;
      } catch (error: any) {
        if (error?.code === '42710') {
          skippedCount++;
        } else {
          logger.info(`⚠️ Could not add FK ${fk.constraint}: ${error?.message || error}`);
          skippedCount++;
        }
      }
    }

    logger.info(`✅ Foreign keys: ${addedCount} added, ${skippedCount} skipped (already exist or deferred)`);

    logger.info('📊 Creating performance indexes for high-volume queries...');
    const performanceIndexes = [
      'CREATE INDEX IF NOT EXISTS idx_staff_checked_in ON staff (is_checked_in)',
      'CREATE INDEX IF NOT EXISTS idx_staff_checked_in_at ON staff (checked_in_at)',
      'CREATE INDEX IF NOT EXISTS idx_staff_department ON staff (department)',
      'CREATE INDEX IF NOT EXISTS idx_staff_is_active ON staff (is_active)',
      'CREATE INDEX IF NOT EXISTS idx_staff_fire_marshal ON staff (is_fire_marshal)',
      'CREATE INDEX IF NOT EXISTS idx_staff_zone_id ON staff (zone_id)',
      'CREATE INDEX IF NOT EXISTS idx_staff_customer_id ON staff (customer_id)',
      'CREATE INDEX IF NOT EXISTS idx_visitors_checked_in ON visitors (is_checked_in)',
      'CREATE INDEX IF NOT EXISTS idx_visitors_checked_in_at ON visitors (checked_in_at)',
      'CREATE INDEX IF NOT EXISTS idx_visitors_customer_id ON visitors (customer_id)',
      'CREATE INDEX IF NOT EXISTS idx_visitors_host ON visitors (host_staff_id)',
      'CREATE INDEX IF NOT EXISTS idx_cw_checked_in ON contractor_workers (is_checked_in)',
      'CREATE INDEX IF NOT EXISTS idx_cw_company_id ON contractor_workers (company_id)',
      'CREATE INDEX IF NOT EXISTS idx_cv_qr_code ON contractor_visits (qr_code)',
      'CREATE INDEX IF NOT EXISTS idx_cv_check_in_time ON contractor_visits (check_in_time)',
      'CREATE INDEX IF NOT EXISTS idx_cv_worker_id ON contractor_visits (worker_id)',
      'CREATE INDEX IF NOT EXISTS idx_members_checked_in ON members (is_checked_in)',
      'CREATE INDEX IF NOT EXISTS idx_safety_tokens_expires ON safety_tokens (expires_at)',
      'CREATE INDEX IF NOT EXISTS idx_evac_acct_evac_id ON evacuation_accountability (evacuation_id)',
      'CREATE INDEX IF NOT EXISTS idx_evac_acct_person_id ON evacuation_accountability (person_id)',
      'CREATE INDEX IF NOT EXISTS idx_prebookings_date ON pre_bookings (visit_date)',
      'CREATE INDEX IF NOT EXISTS idx_prebookings_status ON pre_bookings (status)',
      'CREATE INDEX IF NOT EXISTS idx_room_bookings_date ON room_bookings (booking_date)',
      'CREATE INDEX IF NOT EXISTS idx_room_bookings_room ON room_bookings (room_id)',
      'CREATE INDEX IF NOT EXISTS idx_vh_check_in_time ON visitor_history (check_in_time)',
      'CREATE INDEX IF NOT EXISTS idx_ss_staff_id ON staff_sessions (staff_id)',
      'CREATE INDEX IF NOT EXISTS idx_ss_check_in ON staff_sessions (check_in_time)',
      'CREATE INDEX IF NOT EXISTS idx_users_role ON users (role)',
      'CREATE INDEX IF NOT EXISTS idx_reports_created ON reports (created_at)',
      'CREATE INDEX IF NOT EXISTS idx_print_queue_status ON print_queue (status)',
    ];

    let idxCreated = 0;
    for (const idxSql of performanceIndexes) {
      try {
        await db.execute(idxSql);
        idxCreated++;
      } catch (error: any) {
        if (error?.message?.includes('does not exist')) {
          // Column doesn't exist in this schema version - expected
        } else {
          logger.warn(`⚠️ Index creation warning: ${idxSql} - ${error?.message || error}`);
        }
      }
    }
    logger.info(`✅ Performance indexes: ${idxCreated}/${performanceIndexes.length} created`);

    logger.info('✅ Bootstrap schema migration completed successfully');
  }
};
