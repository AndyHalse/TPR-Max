import { eq } from "drizzle-orm";
import { db } from "./db";
import { inductionSettings, type InsertInductionSettings } from "@shared/schema";

// Sample demo videos for different roles - these would be replaced with real videos in production
const inductionSettingsData: InsertInductionSettings[] = [
  {
    roleType: "visitor",
    videoTitle: "Visitor Site Safety Induction",
    videoUrl: "https://www.youtube.com/embed/dQw4w9WgXcQ", // Sample placeholder - replace with real visitor induction video
    videoDescription: "Essential safety information for site visitors including emergency procedures, visitor escort requirements, and prohibited areas.",
    videoDurationMinutes: 10,
    passPercentage: 75,
    isActive: true,
  },
  {
    roleType: "staff",
    videoTitle: "Staff H&S Induction & Company Policies",
    videoUrl: "https://www.youtube.com/embed/dQw4w9WgXcQ", // Sample placeholder - replace with real staff induction video
    videoDescription: "Comprehensive health and safety training for permanent staff members including company policies, emergency procedures, and workplace hazards.",
    videoDurationMinutes: 20,
    passPercentage: 80,
    isActive: true,
  },
  {
    roleType: "contractor",
    videoTitle: "Contractor Safety Compliance & Site Rules",
    videoUrl: "https://www.youtube.com/embed/dQw4w9WgXcQ", // Sample placeholder - replace with real contractor induction video
    videoDescription: "Detailed safety requirements for contractors including PPE standards, permit requirements, risk assessments, and site-specific hazards.",
    videoDurationMinutes: 25,
    passPercentage: 85,
    isActive: true,
  }
];

export async function seedInductionSettings() {
  console.log('🌱 Seeding induction settings...');
  
  try {
    // Check if settings already exist
    const existingSettings = await db.select().from(inductionSettings).limit(1);
    
    if (existingSettings.length > 0) {
      console.log('✅ Induction settings already exist');
      return;
    }

    // Insert all settings
    await db.insert(inductionSettings).values(inductionSettingsData);
    
    console.log(`✅ Seeded ${inductionSettingsData.length} induction settings for all role types`);
  } catch (error) {
    console.error('❌ Failed to seed induction settings:', error);
    throw error;
  }
}