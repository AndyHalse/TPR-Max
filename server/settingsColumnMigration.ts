import type { Migration } from './migrationRunner';

/**
 * SETTINGS COLUMN MIGRATION SUITE
 * 
 * This file contains migrations needed to add missing columns to the 
 * company_settings table across all customer databases to prevent 
 * PostgreSQL 42703 errors during settings updates.
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

/**
 * Migration to add missing ID card print quality column
 */
export const addIdCardPrintQualityColumnMigration: Migration = {
  version: '20250917_003_add_id_card_print_quality_column',
  description: 'Add missing id_card_print_quality column to company_settings table',
  async up(db: any) {
    // Check if column already exists to make migration idempotent
    const columnExists = await db.execute(`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'company_settings' 
        AND column_name = 'id_card_print_quality'
      )
    `);
    
    if (!columnExists.rows[0]?.exists) {
      console.log('🔄 Adding id_card_print_quality column to company_settings table');
      
      await db.execute(`
        ALTER TABLE company_settings 
        ADD COLUMN id_card_print_quality TEXT DEFAULT 'high'
      `);
      
      console.log('✅ Added id_card_print_quality column successfully');
    } else {
      console.log('ℹ️ id_card_print_quality column already exists, skipping');
    }
  }
};

/**
 * Migration to add any other missing ID card columns  
 */
export const addMissingIdCardColumnsMigration: Migration = {
  version: '20250917_004_add_missing_id_card_columns',
  description: 'Add all missing ID card related columns to company_settings table',
  async up(db: any) {
    // List of ID card columns that should exist
    const idCardColumns = [
      'id_card_printer TEXT DEFAULT \'\'',
      'id_card_print_quality TEXT DEFAULT \'high\'',
      'id_card_paper_size TEXT DEFAULT \'cr80\'',
      'id_card_orientation TEXT DEFAULT \'landscape\'',
      'id_card_design TEXT DEFAULT \'[]\'',
    ];
    
    // Check existing columns
    const existingColumns = await db.execute(`
      SELECT column_name FROM information_schema.columns 
      WHERE table_name = 'company_settings'
    `);
    
    const existingColumnNames = new Set(existingColumns.rows.map((row: any) => row.column_name));
    
    // Add missing columns
    for (const columnDef of idCardColumns) {
      const columnName = columnDef.split(' ')[0];
      
      if (!existingColumnNames.has(columnName)) {
        console.log(`🔄 Adding missing column: ${columnName}`);
        
        await db.execute(`
          ALTER TABLE company_settings ADD COLUMN ${columnDef}
        `);
        
        console.log(`✅ Added ${columnName} column successfully`);
      } else {
        console.log(`ℹ️ Column ${columnName} already exists, skipping`);
      }
    }
  }
};

/**
 * Migration to add missing thermal printer columns
 */
export const addMissingThermalPrinterColumnsMigration: Migration = {
  version: '20250917_005_add_missing_thermal_printer_columns', 
  description: 'Add missing thermal printer columns to company_settings table',
  async up(db: any) {
    // List of thermal printer columns that should exist
    const thermalColumns = [
      'visitor_pass_design TEXT DEFAULT \'[]\'',
      'contractor_pass_design TEXT DEFAULT \'[]\'',
      'thermal_selected_printer TEXT DEFAULT \'tec\'',
      'thermal_print_method TEXT DEFAULT \'direct\'',
      'thermal_print_quality TEXT DEFAULT \'reception\'',
      'thermal_printer_settings TEXT DEFAULT \'{}\'',
    ];
    
    // Check existing columns
    const existingColumns = await db.execute(`
      SELECT column_name FROM information_schema.columns 
      WHERE table_name = 'company_settings'
    `);
    
    const existingColumnNames = new Set(existingColumns.rows.map((row: any) => row.column_name));
    
    // Add missing columns
    for (const columnDef of thermalColumns) {
      const columnName = columnDef.split(' ')[0];
      
      if (!existingColumnNames.has(columnName)) {
        console.log(`🔄 Adding missing thermal column: ${columnName}`);
        
        await db.execute(`
          ALTER TABLE company_settings ADD COLUMN ${columnDef}
        `);
        
        console.log(`✅ Added ${columnName} column successfully`);
      } else {
        console.log(`ℹ️ Thermal column ${columnName} already exists, skipping`);
      }
    }
  }
};

/**
 * All settings column migrations exported as array
 */
export const settingsColumnMigrations: Migration[] = [
  addIdCardPrintQualityColumnMigration,
  addMissingIdCardColumnsMigration,
  addMissingThermalPrinterColumnsMigration,
];