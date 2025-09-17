import type { Migration } from './migrationRunner';

/**
 * CLEANUP MIGRATIONS
 * 
 * These migrations handle fixing existing table names and removing customerId columns
 * since we use database-level isolation now.
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

// Migration to fix contractor_prebookings table schema
export const fixContractorPrebookingsMigration: Migration = {
  version: '20250917_011_fix_contractor_prebookings_table',
  description: 'Ensure contractor_prebookings table has correct schema with all required columns',
  async up(db: any) {
    // Add pgcrypto extension for UUID generation
    await ensurePgcrypto(db);
    
    // Check if table exists
    const tableExists = await db.execute(`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_name = 'contractor_prebookings'
      )
    `);

    if (tableExists.rows[0]?.exists) {
      // Table exists - check if it has all required columns
      const columns = await db.execute(`
        SELECT column_name FROM information_schema.columns 
        WHERE table_name = 'contractor_prebookings'
      `);
      
      const existingColumns = new Set(columns.rows.map((row: any) => row.column_name));
      
      // Required columns with their definitions
      const requiredColumns = [
        { name: 'id', definition: 'VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()' },
        { name: 'company_name', definition: 'TEXT NOT NULL' },
        { name: 'contact_email', definition: 'TEXT NOT NULL' },
        { name: 'contact_phone', definition: 'TEXT' },
        { name: 'worker_name', definition: 'TEXT NOT NULL' },
        { name: 'worker_email', definition: 'TEXT' },
        { name: 'purpose', definition: 'TEXT NOT NULL' },
        { name: 'scheduled_date', definition: 'TIMESTAMP NOT NULL' },
        { name: 'scheduled_time', definition: 'TEXT NOT NULL' },
        { name: 'duration', definition: 'TEXT DEFAULT \'4\'' },
        { name: 'status', definition: 'TEXT DEFAULT \'pending\'' },
        { name: 'qr_code', definition: 'TEXT UNIQUE NOT NULL' },
        { name: 'notes', definition: 'TEXT' },
        { name: 'documents_required', definition: 'TEXT[] DEFAULT ARRAY[]::TEXT[]' },
        { name: 'documents_uploaded', definition: 'TEXT[] DEFAULT ARRAY[]::TEXT[]' },
        { name: 'created_at', definition: 'TIMESTAMP DEFAULT NOW() NOT NULL' },
        { name: 'updated_at', definition: 'TIMESTAMP DEFAULT NOW() NOT NULL' }
      ];
      
      // Check if table needs rebuilding
      const missingColumns = requiredColumns.filter(col => !existingColumns.has(col.name));
      
      if (missingColumns.length > 0) {
        console.log(`🔄 Rebuilding contractor_prebookings table - missing columns: ${missingColumns.map(c => c.name).join(', ')}`);
        
        // Create new table with correct schema
        await db.execute(`
          CREATE TABLE contractor_prebookings_new (
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
            qr_code TEXT UNIQUE NOT NULL,
            notes TEXT,
            documents_required TEXT[] DEFAULT ARRAY[]::TEXT[],
            documents_uploaded TEXT[] DEFAULT ARRAY[]::TEXT[],
            created_at TIMESTAMP DEFAULT NOW() NOT NULL,
            updated_at TIMESTAMP DEFAULT NOW() NOT NULL
          )
        `);
        
        // Copy existing data if any (only columns that exist in both tables)
        const commonColumns = requiredColumns
          .filter(col => existingColumns.has(col.name))
          .map(col => col.name);
          
        if (commonColumns.length > 0) {
          const hasData = await db.execute(`SELECT COUNT(*) FROM contractor_prebookings`);
          if (hasData.rows[0]?.count > 0) {
            const columnList = commonColumns.join(', ');
            await db.execute(`
              INSERT INTO contractor_prebookings_new (${columnList})
              SELECT ${columnList} FROM contractor_prebookings
            `);
            console.log(`✅ Copied ${hasData.rows[0]?.count} records with columns: ${columnList}`);
          }
        }
        
        // Atomic table swap
        await db.execute(`DROP TABLE contractor_prebookings`);
        await db.execute(`ALTER TABLE contractor_prebookings_new RENAME TO contractor_prebookings`);
        
        console.log('✅ Rebuilt contractor_prebookings table with correct schema');
      } else {
        console.log('✅ contractor_prebookings table already has correct schema');
      }
    } else {
      // Create new table if it doesn't exist
      await db.execute(`
        CREATE TABLE contractor_prebookings (
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
          qr_code TEXT UNIQUE NOT NULL,
          notes TEXT,
          documents_required TEXT[] DEFAULT ARRAY[]::TEXT[],
          documents_uploaded TEXT[] DEFAULT ARRAY[]::TEXT[],
          created_at TIMESTAMP DEFAULT NOW() NOT NULL,
          updated_at TIMESTAMP DEFAULT NOW() NOT NULL
        )
      `);
      console.log('✅ Created contractor_prebookings table');
    }
  }
};

// Migration to remove customerId columns from existing tables
export const removeCustomerIdColumnsMigration: Migration = {
  version: '20250917_012_remove_customer_id_columns',
  description: 'Remove customerId columns from existing tables since we use database-level isolation',
  async up(db: any) {
    // Add pgcrypto extension for UUID generation
    await ensurePgcrypto(db);
    
    const tablesToCleanup = [
      'visitors',
      'staff',
      'visitor_history',
      'staff_attendance_history',
      'staff_sessions',
      'pre_bookings',
      'departments',
      'users',
      'tenant_companies',
      'company_settings'
    ];

    for (const tableName of tablesToCleanup) {
      try {
        // Check if table exists
        const tableExists = await db.execute(`
          SELECT EXISTS (
            SELECT 1 FROM information_schema.tables 
            WHERE table_name = '${tableName}'
          )
        `);

        if (tableExists.rows[0]?.exists) {
          // Check if customerId column exists
          const columnExists = await db.execute(`
            SELECT EXISTS (
              SELECT 1 FROM information_schema.columns 
              WHERE table_name = '${tableName}' AND column_name = 'customer_id'
            )
          `);

          if (columnExists.rows[0]?.exists) {
            // Remove the customer_id column
            await db.execute(`ALTER TABLE ${tableName} DROP COLUMN customer_id`);
            console.log(`✅ Removed customer_id column from ${tableName}`);
          }
        }
      } catch (error) {
        console.log(`⚠️ Could not clean up ${tableName}: ${error}`);
        // Continue with other tables
      }
    }
  }
};

// Migration to ensure meeting rooms table exists if missing
export const createMeetingRoomsMigration: Migration = {
  version: '20250917_013_create_meeting_rooms_tables',
  description: 'Create meeting rooms tables if missing: meeting_rooms, room_bookings',
  async up(db: any) {
    // Add pgcrypto extension for UUID generation
    await ensurePgcrypto(db);
    
    // Check if meeting_rooms table exists
    const meetingRoomsExists = await db.execute(`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_name = 'meeting_rooms'
      )
    `);

    if (!meetingRoomsExists.rows[0]?.exists) {
      // Create meeting_rooms table
      await db.execute(`
        CREATE TABLE meeting_rooms (
          id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
          name TEXT NOT NULL,
          description TEXT,
          capacity INTEGER NOT NULL,
          location TEXT,
          equipment TEXT[] DEFAULT ARRAY[]::TEXT[],
          is_active BOOLEAN DEFAULT true NOT NULL,
          tenant_company_id VARCHAR REFERENCES tenant_companies(id),
          hourly_rate DOUBLE PRECISION DEFAULT 0,
          created_at TIMESTAMP DEFAULT NOW() NOT NULL,
          updated_at TIMESTAMP DEFAULT NOW() NOT NULL
        )
      `);
      console.log('✅ Created meeting_rooms table');
    }

    // Check if room_bookings table exists
    const roomBookingsExists = await db.execute(`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_name = 'room_bookings'
      )
    `);

    if (!roomBookingsExists.rows[0]?.exists) {
      // Create room_bookings table
      await db.execute(`
        CREATE TABLE room_bookings (
          id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
          meeting_room_id VARCHAR NOT NULL REFERENCES meeting_rooms(id),
          booked_by_staff_id VARCHAR REFERENCES staff(id),
          tenant_company_id VARCHAR REFERENCES tenant_companies(id),
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
          created_at TIMESTAMP DEFAULT NOW() NOT NULL,
          updated_at TIMESTAMP DEFAULT NOW() NOT NULL
        )
      `);
      console.log('✅ Created room_bookings table');
    }
  }
};

export const cleanupMigrations: Migration[] = [
  fixContractorPrebookingsMigration,
  removeCustomerIdColumnsMigration,
  createMeetingRoomsMigration,
];