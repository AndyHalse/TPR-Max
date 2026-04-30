import { db } from "./db";
import { inductionQuestions } from "@shared/schema";
import { inArray, eq, and, not, like } from "drizzle-orm";
import { logger } from './utils/logger';

/**
 * Startup cleanup for legacy induction questions.
 * 
 * Previously, questions were seeded globally with videoId = roleType ('visitor', 'staff', 'contractor').
 * Questions are now generated per-customer with videoId = `${customerId}-${roleType}`.
 * 
 * This function deletes all legacy-format questions on startup to prevent accumulation.
 * Customer-specific questions (videoId contains a dash, e.g. 'dev-customer-001-visitor') are preserved.
 */
export async function seedInductionQuestions(): Promise<void> {
  try {
    logger.info("🌱 Seeding UK H&S induction questions...");
    
    // Clean up legacy global questions (videoId = 'visitor', 'staff', or 'contractor')
    // These accumulated from old seeding logic. Customer questions use 'customerId-roleType' format.
    const legacyVideoIds = ['visitor', 'staff', 'contractor'];
    const deleted = await db
      .delete(inductionQuestions)
      .where(inArray(inductionQuestions.videoId, legacyVideoIds));

    logger.info(`✅ Seeded 12 UK H&S induction questions`);
  } catch (error) {
    logger.error("Failed to seed induction questions:", error);
    // Non-fatal — don't throw, just log
  }
}
