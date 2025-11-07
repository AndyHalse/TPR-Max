import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { sql } from 'drizzle-orm';
import * as isolatedSchema from './isolatedSchema';

async function provisionDevSchema() {
  const customerId = 'dev-customer-001';
  const schemaName = 'c_dev_custo'; // First 8 chars of dev-customer-001

  console.log(`🏗️ Provisioning schema for ${customerId}...`);

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });

  const db = drizzle({ client: pool, schema: isolatedSchema });

  try {
    // Create schema
    console.log(`📋 Creating schema: ${schemaName}`);
    await db.execute(sql`CREATE SCHEMA IF NOT EXISTS ${sql.identifier(schemaName)}`);
    console.log(`✅ Schema created: ${schemaName}`);

    // Set search path
    await db.execute(sql`SET search_path TO ${sql.identifier(schemaName)}, public`);
    console.log(`✅ Search path set to: ${schemaName}`);

    // Create all tables (Drizzle will use the search_path)
    console.log(`📋 Creating tables in schema ${schemaName}...`);
    
    // Create tables manually
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS staff (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        first_name TEXT NOT NULL,
        last_name TEXT NOT NULL,
        username TEXT NOT NULL UNIQUE,
        password TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'user',
        department TEXT,
        phone TEXT,
        email TEXT,
        is_active BOOLEAN NOT NULL DEFAULT true,
        fire_marshal_url_id VARCHAR UNIQUE,
        is_fire_marshal BOOLEAN NOT NULL DEFAULT false,
        is_checked_in BOOLEAN NOT NULL DEFAULT false,
        last_check_in TIMESTAMP,
        last_check_out TIMESTAMP,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    await db.execute(sql`
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

    console.log(`✅ Tables created successfully`);

    // Insert a test pre-booking for tomorrow
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(11, 30, 0, 0);

    await db.execute(sql`
      INSERT INTO pre_bookings (
        visitor_first_name,
        visitor_last_name,
        visitor_email,
        company,
        purpose,
        visit_date,
        visit_time,
        qr_code,
        status,
        is_checked_in
      ) VALUES (
        'Andrew',
        'Halse',
        'andrew.halse@example.com',
        'External Contractor Ltd',
        'Site inspection and equipment review',
        ${tomorrow.toISOString()},
        '11:30',
        'PREBK_' || substr(md5(random()::text), 1, 8),
        'confirmed',
        false
      )
      ON CONFLICT DO NOTHING
    `);

    console.log(`✅ Test data seeded: Andrew Halse pre-booking for ${tomorrow.toISOString()}`);
    console.log(`\n🎉 Provisioning complete for ${customerId} (schema: ${schemaName})`);

  } catch (error) {
    console.error(`❌ Error provisioning schema:`, error);
    throw error;
  } finally {
    await pool.end();
  }
}

// Run provisioning
provisionDevSchema()
  .then(() => {
    console.log('✅ Provisioning script completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Provisioning script failed:', error);
    process.exit(1);
  });
