/**
 * Seed script to create an initial platform admin user
 * 
 * Usage: npx tsx seed-platform-admin.ts
 * 
 * This creates a platform admin with the following credentials:
 * Username: admin
 * Password: Admin123!
 * 
 * IMPORTANT: Change the password immediately after first login!
 */

import { sql } from "drizzle-orm";
import { db } from "./server/db";
import bcrypt from "bcryptjs";

const INITIAL_ADMIN = {
  username: "admin",
  email: "admin@platform.local",
  password: "Admin123!", // CHANGE THIS AFTER FIRST LOGIN!
  firstName: "Platform",
  lastName: "Administrator",
  role: "super_admin",
};

async function seedPlatformAdmin() {
  try {
    console.log("🌱 Seeding platform admin user...");
    
    // Check if admin already exists
    const existingAdmins = await db.execute(
      sql`SELECT id FROM platform_admins WHERE username = ${INITIAL_ADMIN.username} LIMIT 1`
    );
    
    if (existingAdmins.rows.length > 0) {
      console.log("⚠️  Platform admin already exists with username:", INITIAL_ADMIN.username);
      console.log("❌ Aborting seed to prevent duplicate creation.");
      process.exit(0);
    }
    
    // Hash password
    const hashedPassword = await bcrypt.hash(INITIAL_ADMIN.password, 10);
    
    // Create platform admin
    await db.execute(
      sql`
        INSERT INTO platform_admins (username, email, password, first_name, last_name, role, is_active)
        VALUES (
          ${INITIAL_ADMIN.username},
          ${INITIAL_ADMIN.email},
          ${hashedPassword},
          ${INITIAL_ADMIN.firstName},
          ${INITIAL_ADMIN.lastName},
          ${INITIAL_ADMIN.role},
          true
        )
      `
    );
    
    console.log("✅ Platform admin user created successfully!");
    console.log("");
    console.log("📋 Login credentials:");
    console.log("   URL: /platform-admin/login");
    console.log("   Username:", INITIAL_ADMIN.username);
    console.log("   Password:", INITIAL_ADMIN.password);
    console.log("");
    console.log("⚠️  IMPORTANT: Change the password immediately after first login!");
    
    process.exit(0);
  } catch (error) {
    console.error("❌ Error seeding platform admin:", error);
    process.exit(1);
  }
}

// Run the seed
seedPlatformAdmin();
