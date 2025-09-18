import type { Migration } from './migrationRunner';

/**
 * Staff Sessions Table Migration
 * 
 * Creates the staff_sessions table for tracking check-in/check-out history
 * Matches the schema defined in isolatedSchema.ts
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

// Migration to create staff_sessions table
export const createStaffSessionsTableMigration: Migration = {
  version: '20250918_001_create_staff_sessions_table',
  description: 'Create staff_sessions table for tracking check-in/check-out history',
  async up(db: any) {
    console.log('🔄 Creating staff_sessions table...');

    // Add pgcrypto extension for UUID generation
    await ensurePgcrypto(db);

    // Create staff_sessions table matching isolatedSchema definition
    await db.execute(`
      CREATE TABLE IF NOT EXISTS staff_sessions (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        staff_id VARCHAR NOT NULL REFERENCES staff(id),
        check_in_time TIMESTAMP NOT NULL,
        check_out_time TIMESTAMP,
        is_manual BOOLEAN NOT NULL DEFAULT false,
        check_in_method TEXT DEFAULT 'card',
        check_out_method TEXT,
        notes TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT now()
      )
    `);

    console.log('✅ Created staff_sessions table successfully');
  }
};

export const staffSessionsMigrations = [
  createStaffSessionsTableMigration
];