#!/usr/bin/env tsx
import { CustomerDatabaseService } from './customerDatabase';

/**
 * Fix Isolated Database Schema
 * 
 * Adds missing columns to existing isolated customer databases
 * to match the updated schema definition.
 */
async function fixIsolatedDatabaseSchema() {
  console.log("🔧 Starting isolated database schema fix...");
  
  try {
    const customerId = "dev-customer-001"; // Andy's customer ID
    console.log(`🔧 Fixing schema for customer: ${customerId}`);
    
    // Get the customer's database connection
    const customerDatabaseService = CustomerDatabaseService.getInstance();
    const db = await customerDatabaseService.getCustomerDatabase(customerId);
    
    // List of missing columns to add to company_settings table
    const missingColumns = [
      'id_card_printer TEXT DEFAULT \'\'',
      'id_card_print_quality TEXT DEFAULT \'high\'',
      'id_card_paper_size TEXT DEFAULT \'cr80\'',
      'id_card_orientation TEXT DEFAULT \'landscape\'',
      'id_card_design TEXT DEFAULT \'[]\'',
      'visitor_pass_design TEXT DEFAULT \'[]\'',
      'contractor_pass_design TEXT DEFAULT \'[]\'',
      'thermal_selected_printer TEXT DEFAULT \'tec\'',
      'thermal_print_method TEXT DEFAULT \'direct\'',
      'thermal_print_quality TEXT DEFAULT \'reception\'',
      'thermal_printer_settings TEXT DEFAULT \'{}\'',
      'biostar_enabled BOOLEAN DEFAULT false',
      'biostar_server_url TEXT DEFAULT \'\'',
      'biostar_api_key TEXT DEFAULT \'\'',
      'biostar_username TEXT DEFAULT \'\'',
      'biostar_password TEXT DEFAULT \'\'',
      'biostar_database_id TEXT DEFAULT \'1\'',
      'biostar_sync_interval TEXT DEFAULT \'300\'',
      'biometric_devices TEXT[] DEFAULT ARRAY[]::TEXT[]',
      'reader_settings TEXT DEFAULT \'{}\'',
      'openai_model TEXT DEFAULT \'gpt-5\'',
      'openai_temperature TEXT DEFAULT \'0.7\'',
      'openai_max_tokens TEXT DEFAULT \'4000\'',
      'video_quality_preference TEXT DEFAULT \'high\'',
      'enable_advanced_video_features BOOLEAN DEFAULT true',
      'default_video_length TEXT DEFAULT \'15\'',
      'ai_instructions_prompt TEXT DEFAULT \'Create comprehensive, engaging safety induction content\'',
      'qr_reader_enabled BOOLEAN DEFAULT false',
      'qr_reader_device TEXT DEFAULT \'auto\'',
      'qr_code_format TEXT DEFAULT \'visigate\'',
      'qr_reader_settings TEXT DEFAULT \'{}\'',
      'clue_enabled BOOLEAN DEFAULT false',
      'clue_api_url TEXT DEFAULT \'https://api.suprema-clue.com\'',
      'clue_api_key TEXT DEFAULT \'\'',
      'clue_api_secret TEXT DEFAULT \'\'',
      'clue_organization_id TEXT DEFAULT \'\'',
      'clue_webhook_secret TEXT DEFAULT \'\'',
      'clue_dynamic_qr_enabled BOOLEAN DEFAULT true',
      'clue_qr_validity_minutes TEXT DEFAULT \'60\'',
      'clue_device_groups TEXT[] DEFAULT ARRAY[]::TEXT[]',
      'clue_sync_interval TEXT DEFAULT \'300\'',
      'clue_auto_register_visitors BOOLEAN DEFAULT true',
      'clue_auto_delete_expired BOOLEAN DEFAULT true',
      'clue_test_mode BOOLEAN DEFAULT false',
      'clue_last_sync TIMESTAMP',
      'e_pass_enabled BOOLEAN DEFAULT false',
      'e_pass_delivery_method TEXT DEFAULT \'both\'',
      'e_pass_email_template TEXT DEFAULT \'default\'',
      'e_pass_sms_template TEXT DEFAULT \'default\'',
      'e_pass_auto_checkout BOOLEAN DEFAULT true',
      'e_pass_checkout_reminder_minutes TEXT DEFAULT \'30\'',
      'e_pass_host_notification_enabled BOOLEAN DEFAULT true',
      'e_pass_host_notification_delay TEXT DEFAULT \'60\'',
      'twilio_enabled BOOLEAN DEFAULT false',
      'twilio_account_sid TEXT DEFAULT \'\'',
      'twilio_auth_token TEXT DEFAULT \'\'',
      'twilio_phone_number TEXT DEFAULT \'\'',
      'twilio_messaging_service_sid TEXT DEFAULT \'\'',
      'geofencing_enabled BOOLEAN DEFAULT false',
      'geofence_radius TEXT DEFAULT \'100\'',
      'geofence_lat TEXT DEFAULT \'\'',
      'geofence_lng TEXT DEFAULT \'\'',
      'x_station_enabled BOOLEAN DEFAULT false',
      'x_station_devices TEXT[] DEFAULT ARRAY[]::TEXT[]',
      'x_station_checkout_mode TEXT DEFAULT \'qr\'',
      'x_station_api_endpoint TEXT DEFAULT \'\'',
      'hs_rules_enabled BOOLEAN DEFAULT true',
      'hs_rules_content TEXT DEFAULT \'\'',
      'hs_rules_url TEXT DEFAULT \'\'',
      'hs_rules_require_acceptance BOOLEAN DEFAULT false',
      'feature_multi_tenant BOOLEAN DEFAULT true',
      'feature_meeting_rooms BOOLEAN DEFAULT true',
      'feature_time_attendance BOOLEAN DEFAULT true',
      'feature_induction_settings BOOLEAN DEFAULT true',
      'feature_kiosk BOOLEAN DEFAULT true',
      'feature_ai_demo BOOLEAN DEFAULT true'
    ];
    
    // Add each missing column
    let addedColumns = 0;
    for (const column of missingColumns) {
      try {
        const [columnName] = column.split(' ');
        
        // Check if column already exists
        const checkSql = `SELECT column_name FROM information_schema.columns 
                          WHERE table_name = 'company_settings' 
                          AND column_name = '${columnName}'`;
        const checkResult = await db.execute(checkSql);
        
        if (!checkResult.rows || checkResult.rows.length === 0) {
          // Column doesn't exist, add it
          const alterSql = `ALTER TABLE company_settings ADD COLUMN ${column}`;
          await db.execute(alterSql);
          console.log(`✅ Added column: ${columnName}`);
          addedColumns++;
        } else {
          console.log(`⏭️ Column already exists: ${columnName}`);
        }
      } catch (error: any) {
        console.error(`❌ Error adding column ${column}:`, error.message);
      }
    }
    
    console.log(`🎉 Schema fix completed! Added ${addedColumns} missing columns`);
    
    // Test that the most important column was added
    try {
      const testResult = await db.execute('SELECT last_daily_reset FROM company_settings LIMIT 1');
      console.log(`✅ Verified last_daily_reset column is now accessible`);
    } catch (error: any) {
      console.error(`❌ last_daily_reset column still not accessible:`, error.message);
    }
    
  } catch (error: any) {
    console.error("❌ Error fixing isolated database schema:", error);
    throw error;
  }
}

// Run the fix immediately
fixIsolatedDatabaseSchema()
  .then(() => {
    console.log("✅ Schema fix completed successfully");
    process.exit(0);
  })
  .catch((error) => {
    console.error("❌ Schema fix failed:", error);
    process.exit(1);
  });

export { fixIsolatedDatabaseSchema };