import { eq, sql } from "drizzle-orm";
import { db } from "./db";
import { inductionSettings, type InsertInductionSettings } from "@shared/schema";

const inductionSettingsData: InsertInductionSettings[] = [
  {
    roleType: "visitor",
    videoTitle: "Visitor Induction",
    videoUrl: "",
    videoDescription: "Essential safety information for site visitors including emergency procedures, visitor escort requirements, and prohibited areas.",
    videoDurationMinutes: 10,
    passPercentage: 75,
    isActive: true,
  },
  {
    roleType: "staff",
    videoTitle: "Staff Induction",
    videoUrl: "",
    videoDescription: "Comprehensive health and safety training for permanent staff members including company policies, emergency procedures, and workplace hazards.",
    videoDurationMinutes: 20,
    passPercentage: 80,
    isActive: true,
  },
  {
    roleType: "contractor",
    videoTitle: "Contractor Induction",
    videoUrl: "",
    videoDescription: "Detailed safety requirements for contractors including PPE standards, permit requirements, risk assessments, and site-specific hazards.",
    videoDurationMinutes: 25,
    passPercentage: 85,
    isActive: true,
  }
];

export async function seedInductionSettings() {
  console.log('🌱 Seeding induction settings...');
  
  try {
    // Ensure global induction_settings table has kiosk_enabled and send_link_enabled columns
    // (these were added to the schema but the global DB may not have been migrated yet)
    await db.execute(sql`
      ALTER TABLE induction_settings
        ADD COLUMN IF NOT EXISTS kiosk_enabled BOOLEAN NOT NULL DEFAULT false,
        ADD COLUMN IF NOT EXISTS send_link_enabled BOOLEAN NOT NULL DEFAULT true
    `);

    const existingSettings = await db.select().from(inductionSettings).limit(1);
    
    if (existingSettings.length > 0) {
      console.log('✅ Induction settings already exist');
      return;
    }

    await db.insert(inductionSettings).values(inductionSettingsData);
    
    console.log(`✅ Seeded ${inductionSettingsData.length} induction settings for all role types`);
  } catch (error) {
    console.error('❌ Failed to seed induction settings:', error);
    throw error;
  }
}
